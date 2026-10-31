/* ==========================================================================
   МОДУЛЬ: 19b_audio_distance.js — выстрелы ботов: свой звук оружия + дистанция
   ==========================================================================
   Формулы (все чистые, см. tools/audio-tests/distance.cjs):

   1. Громкость — «inverse»-модель Web Audio PannerNode (MDN, W3C WebAudio):
        gain = ref / (ref + rolloff * (max(d, ref) - ref)),  ref = 8 м, rolloff = 0.55
      (v26: было 1.15 — бой в 100–300 м был еле слышен; теперь 100 м ≈ −17 дБ,
      280 м ≈ −26 дБ, 600 м ≈ −32 дБ: выстрел — самый громкий звук леса).
      Поверх — подрезка из «лабораторий звука»: AK-74 −3, AKM +5, Glock18C −4,
      M416 +2.5, MP5A3 +3.8, M870 +4.5, SCAR −1, SVD 0 дБ.
   2. Поглощение воздухом (ISO 9613-1: потери растут с частотой и расстоянием;
      на 20 °C/70 % ≈ 0.03 дБ/м на 4 кГц, ≈ 0.1 дБ/м на 8 кГц) — ФНЧ:
        fc = 16000 / (1 + 0.012 d), за 150 м ещё /(1 + 0.006 (d − 150)),
      зажим 700…16000 Гц.
   3. Задержка распространения d / 343 м/с, не больше 1.6 с.
   4. Дальний слой: плавный переход smoothstep(60 м → 150 м) к приглушённой
      копии того же сэмпла (ФНЧ ≈ 1400/(1 + d/120) Гц, low-shelf +6 дБ на
      220 Гц) и длинному хвосту (общая свёртка 2.4 с). Низкое качество — без
      хвоста. Практика шутеров: «дальний выстрел = глухой бум + эхо».
   5. Перекрытие (луч до стрелка закрыт): ФНЧ ≤ 1300 Гц и −5 дБ (v26: было 900 Гц/−8 дБ —
      в лесу стволы закрывали почти каждого стрелка, и бой «пропадал»).
   6. Ангар: короткая яркая свёртка 1.3 с с большим вкладом.
   7. Пул голосов (вытеснение по приоритету = итоговая громкость): 8 / 14 / 24
      (low / medium / high; ultra 28). Тише всех вытесняется первым.
   8. На стрелка: ≤ 12 слышимых выстрелов/с дальше 40 м, каждый 2-й дальше 200 м
      (ухо сливает очередь); дальше 700 м не звучит (v26: было 280 м).
   Свой выстрел игрока этим модулем не обрабатывается.
   ========================================================================== */
(function (root, factory) {
  const M = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else root.GAudioDist = M;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const G = typeof self !== 'undefined' ? self : globalThis;
  const REF = 8, ROLL = 0.55, MAX_DIST = 700, SOUND_C = 343, MAX_DELAY = 1.6;
  const FAR0 = 60, FAR1 = 150, THIN_DIST = 200, GATE_NEAR = 40, GATE_RATE = 12;
  const OCC_HZ = 1300, OCC_DB = -5, REF_LEVEL = 1.0;
  const TRIM_DB = { ak74: -3, akm: 5, glock18c: -4, m416: 2.5, mp5a3: 3.8, m870: 4.5, scar: -1, svd: 0 };
  const VOICES = { low: 8, medium: 14, high: 24, ultra: 28 };
  /* состав бойцов по роли: (порог хеша, оружие) — детерминированно по ключу */
  const NPC_MIX = [[30, 'ak74'], [45, 'akm'], [60, 'm416'], [70, 'scar'], [85, 'mp5a3'], [93, 'svd'], [100, 'm870']];

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const db = (x) => Math.pow(10, x / 20);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  function gainAt(d, ref, roll) {
    ref = ref || REF; roll = roll === undefined ? ROLL : roll;
    return ref / (ref + roll * (Math.max(d, ref) - ref));
  }
  function airCutoff(d) {
    let fc = 16000 / (1 + 0.012 * d);
    if (d > 150) fc /= 1 + 0.006 * (d - 150);
    return clamp(fc, 700, 16000);
  }
  const delayAt = (d) => clamp(d / SOUND_C, 0, MAX_DELAY);
  const farMix = (d) => smooth(FAR0, FAR1, d);
  const farCutoff = (d) => clamp(1400 / (1 + d / 120), 380, 1100);
  const trimLin = (id) => db(TRIM_DB[id] || 0);
  const maxVoices = (q) => VOICES[q] || VOICES.medium;
  const tailsAllowed = (q) => q !== 'low';
  const audible = (d) => d <= MAX_DIST;

  function hashKey(k) {
    let h = 2166136261;
    k = String(k);
    for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function npcGun(key) {
    const r = hashKey(key) % 100;
    for (const m of NPC_MIX) if (r < m[0]) return m[1];
    return 'ak74';
  }
  /* небольшая фиксированная расстройка на бойца: ±2.5 % */
  const pitchBias = (key) => ((hashKey('p' + key) % 1000) / 1000 - 0.5) * 0.05;

  /* параметры одного выстрела по расстоянию/перекрытию; чистая функция */
  function shotParams(d, id, occluded, indoor, quality, behind) {
    const f = farMix(d);
    let lp = airCutoff(d), flp = farCutoff(d), g = gainAt(d) * trimLin(id) * REF_LEVEL;
    if (behind) lp *= 1 + 0.35 * behind; /* behind ∈ [-1,0]: сзади глуше */
    if (occluded) { lp = Math.min(lp, OCC_HZ); flp = Math.min(flp, OCC_HZ); g *= db(OCC_DB); }
    const tail = indoor ? 0.5 + 0.4 * f : (tailsAllowed(quality) && d > 25 ? 0.05 + 0.55 * f : 0);
    return { gain: g, lp, farLp: flp, far: tailsAllowed(quality) || indoor ? f : Math.min(f, 0.6), tail, delay: delayAt(d) };
  }

  /* панорама и «позади» от базиса слушателя (rx,rz — вправо, fx,fz — вперёд, горизонт) */
  function panFrom(dx, dz, rx, rz, fx, fz) {
    const h = Math.hypot(dx, dz);
    if (h < 0.5) return { pan: 0, front: 1 };
    return { pan: clamp((dx * rx + dz * rz) / h, -1, 1) * 0.85, front: clamp((dx * fx + dz * fz) / h, -1, 1) };
  }

  /* решение пула: активные = end > now; возвращает play | drop | steal(index) */
  function poolDecide(voices, now, max, score) {
    let n = 0, mi = -1, ms = Infinity;
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      if (v.end <= now) continue;
      n++;
      if (v.score < ms) { ms = v.score; mi = i; }
    }
    if (n < max) return { action: 'play', index: -1 };
    if (score <= ms) return { action: 'drop', index: -1 };
    return { action: 'steal', index: mi };
  }

  /* ограничитель очереди стрелка: токены + прореживание дальних; мутирует st */
  function shooterGate(st, now, d) {
    const rate = d < GATE_NEAR ? 30 : GATE_RATE, cap = 4;
    st.tokens = Math.min(cap, (st.tokens === undefined ? cap : st.tokens) + Math.max(0, now - (st.t || now)) * rate);
    st.t = now;
    if (d > THIN_DIST) { st.n = (st.n || 0) + 1; if (st.n % 2 === 0) return false; }
    if (st.tokens < 1) return false;
    st.tokens -= 1;
    return true;
  }

  /* ----------------------------------------------------- рантайм --- */
  function readQuality() {
    try { return (JSON.parse(localStorage.getItem('aegis.settings') || '{}') || {}).quality; } catch (e) { return undefined; }
  }

  function wavToBuffer(b64, ctx) {
    const raw = atob(b64), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const v = new DataView(bytes.buffer);
    let p = 12, fmt = 0, data = 0, size = 0;
    while (p + 8 <= bytes.length) {
      const id = String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]), n = v.getUint32(p + 4, true), body = p + 8;
      if (id === 'fmt ') fmt = body;
      if (id === 'data') { data = body; size = Math.min(n, bytes.length - body); break; }
      p = body + n + (n & 1);
    }
    if (!fmt || !data || v.getUint16(fmt + 14, true) !== 16) return null;
    const ch = v.getUint16(fmt + 2, true), rate = v.getUint32(fmt + 4, true), frames = Math.floor(size / (ch * 2));
    const out = ctx.createBuffer(ch, frames, rate);
    for (let c = 0; c < ch; c++) {
      const dst = out.getChannelData(c);
      for (let i = 0; i < frames; i++) dst[i] = v.getInt16(data + (i * ch + c) * 2, true) / 32768;
    }
    return out;
  }

  function mkIR(ctx, sec, rt60, early) {
    const sr = ctx.sampleRate, n = Math.floor(sr * sec), buf = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const a = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, e = Math.exp(-6.9 * t / rt60);
        lp += (Math.random() * 2 - 1 - lp) * clamp(0.9 - 0.7 * t / sec, 0.12, 0.9); /* хвост темнеет */
        a[i] = lp * e * (1 - Math.exp(-t * 400));
      }
      for (const [ts, g] of early) { const k = Math.floor((ts + c * 0.003) * sr); if (k < n) a[k] += g * (c ? -1 : 1); }
    }
    return buf;
  }

  let lastBound = null; /* для отладки/смоук-теста: GAudioDist.last.stats */
  function bind(audio) {
    const D = lastBound = {
      stats: { played: 0, far: 0, occluded: 0, indoor: 0, dropped: 0, stolen: 0, gated: 0, skipped: 0, noBank: 0, byWeapon: {} },
      voices: [], shooters: new Map(), banks: new Map(), L: { x: 0, y: 0, z: 0, rx: 1, rz: 0, fx: 0, fz: -1, stamp: -1 },
      tailOut: null, tailHall: null
    };

    /* позиция/ориентация слушателя: раз в ~8 мс, а не на каждый выстрел */
    D.listen = function (pos, q) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - D.L.stamp < 8) return;
      const L = D.L;
      L.stamp = now; L.x = pos.x; L.y = pos.y; L.z = pos.z;
      const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
      /* вращение (1,0,0) и (0,0,-1) кватернионом, только горизонталь */
      let rx = 1 - 2 * (qy * qy + qz * qz), rz = 2 * (qx * qz - qw * qy);
      let fx = -(2 * (qx * qz + qw * qy)), fz = -(1 - 2 * (qx * qx + qy * qy));
      let m = Math.hypot(rx, rz) || 1; rx /= m; rz /= m;
      m = Math.hypot(fx, fz) || 1; fx /= m; fz /= m;
      L.rx = rx; L.rz = rz; L.fx = fx; L.fz = fz;
    };

    function bank(id, supp) {
      const key = id + (supp ? '|s' : '');
      let b = D.banks.get(key);
      if (b !== undefined) return b;
      b = null;
      const ctx = audio.ctx, src = (G.__SHOT_DATA || {})[id];
      const list = src && (supp && src.suppressed.length ? src.suppressed : src.normal);
      if (ctx && list && list.length) {
        try { b = list.map((s) => wavToBuffer(s, ctx)).filter(Boolean); if (!b.length) b = null; } catch (e) { b = null; }
      }
      D.banks.set(key, b);
      return b;
    }
    /* декод всех наборов — по одному за такт простоя, без фриза на первом выстреле */
    D.warm = function (ids) {
      const todo = ids.slice();
      const idle = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 1500 }) : (f) => setTimeout(f, 120);
      const step = () => { const id = todo.shift(); if (!id) return; if (!audio.ctx) { todo.unshift(id); setTimeout(step, 1000); return; } bank(id, false); idle(step); };
      idle(step);
    };

    function tails(ctx, quality) {
      if (!D.tailOut) {
        D.tailOut = ctx.createConvolver(); D.tailOut.buffer = mkIR(ctx, 2.4, 1.9, [[0.045, 0.25], [0.11, 0.18]]);
        const w = ctx.createGain(); w.gain.value = 0.7; D.tailOut.connect(w); w.connect(audio.gunBus);
      }
      if (!D.tailHall) {
        const sec = quality === 'low' ? 0.8 : 1.3;
        D.tailHall = ctx.createConvolver(); D.tailHall.buffer = mkIR(ctx, sec, sec * 0.8, [[0.012, 0.5], [0.027, 0.4], [0.05, 0.3], [0.083, 0.2]]);
        const w = ctx.createGain(); w.gain.value = 0.8; D.tailHall.connect(w); w.connect(audio.gunBus);
      }
    }

    function release(v) { try { v.vg.disconnect(); } catch (e) { /* уже отключён */ } }

    /* o: { id, key, x, y, z, supp, indoor, quality, occluded: () => bool }
       true — выстрел обработан (в т.ч. пропущен); false — нет набора, вызывающий играет запасной */
    D.shot = function (o) {
      const ctx = audio.ctx;
      if (!ctx || !audio.gunBus) return false;
      const L = D.L, dx = o.x - L.x, dy = o.y - L.y, dz = o.z - L.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const bk = bank(o.id, !!o.supp);
      if (!bk) { D.stats.noBank++; return false; }
      if (!audible(d)) { D.stats.skipped++; return true; }
      const now = ctx.currentTime, quality = o.quality || readQuality() || 'medium';
      let st = D.shooters.get(o.key);
      if (!st) { st = { occT: -9, occ: false }; D.shooters.set(o.key, st); }
      if (!shooterGate(st, now, d)) { D.stats.gated++; return true; }

      if (o.occluded && d > 6 && now - st.occT > 0.25) {
        st.occT = now;
        try { st.occ = !!o.occluded(); } catch (e) { st.occ = false; }
      }
      const occ = d > 6 && st.occ, indoor = !!o.indoor;
      const pn = panFrom(dx, dz, L.rx, L.rz, L.fx, L.fz);
      const P = shotParams(d, o.id, occ, indoor, quality, pn.front < 0 ? pn.front : 0);

      const buf = bk[(Math.random() * bk.length) | 0];
      const t0 = now + 0.005 + P.delay, dur = buf.duration;
      const score = P.gain * (1 + 0.5 * (1 - P.far));
      const dec = poolDecide(D.voices, now, maxVoices(quality), score);
      if (dec.action === 'drop') { D.stats.dropped++; return true; }
      if (dec.action === 'steal') {
        const v = D.voices[dec.index];
        try { v.vg.gain.setTargetAtTime(0, now, 0.008); v.src.stop(now + 0.05); } catch (e) { /* */ }
        v.end = 0; D.stats.stolen++;
      }
      for (let i = D.voices.length - 1; i >= 0; i--) if (D.voices[i].end <= now) D.voices.splice(i, 1);

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = (1 + pitchBias(o.key)) * (0.97 + Math.random() * 0.06);
      const vg = ctx.createGain(); vg.gain.value = P.gain;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) { pan.pan.value = pn.pan; pan.connect(vg); }
      const mix = pan || vg;

      const gN = ctx.createGain(); gN.gain.value = 1 - P.far;
      const lpN = ctx.createBiquadFilter(); lpN.type = 'lowpass'; lpN.frequency.value = P.lp; lpN.Q.value = 0.5;
      src.connect(gN); gN.connect(lpN); lpN.connect(mix);
      if (P.far > 0.02) {
        const gF = ctx.createGain(); gF.gain.value = P.far * 1.5;
        const sh = ctx.createBiquadFilter(); sh.type = 'lowshelf'; sh.frequency.value = 220; sh.gain.value = 6;
        const lpF = ctx.createBiquadFilter(); lpF.type = 'lowpass'; lpF.frequency.value = P.farLp; lpF.Q.value = 0.6;
        src.connect(gF); gF.connect(sh); sh.connect(lpF); lpF.connect(mix);
        D.stats.far++;
      }
      vg.connect(audio.gunBus);
      if (P.tail > 0.02) {
        tails(ctx, quality);
        const sg = ctx.createGain(); sg.gain.value = P.tail;
        vg.connect(sg); sg.connect(indoor ? D.tailHall : D.tailOut);
      }
      const v = { end: t0 + dur / src.playbackRate.value + 0.05, score, vg, src };
      src.onended = () => { v.end = 0; release(v); };
      src.start(t0);
      D.voices.push(v);
      D.stats.played++;
      if (occ) D.stats.occluded++;
      if (indoor) D.stats.indoor++;
      D.stats.byWeapon[o.id] = (D.stats.byWeapon[o.id] || 0) + 1;
      return true;
    };
    /* v25: далёкий бой (0,8–6 км) для GWarAtmos. Та же запись оружия, но от выстрела
       остаётся глухой «бум»: воздух съедает верх (ISO 9613-1, на 2–4 кГц ≈ 10–30 дБ/км),
       прямой звук слабее отражённого (лес, строения, облака) — длинное эхо 3,4 с.
       Громкость — сферическое расхождение 8/d (−6 дБ на удвоение), без «игровой»
       дальности 280 м. Идёт в шину фона (настройка «Окружение»), паузу соблюдает игра.
       o: { id, n — выстрелов, rpm, d — м, x/z — откуда (или pan), gain, delay — с } */
    D.far = function (o) {
      const ctx = audio.ctx;
      if (!ctx || !audio.amb || ctx.state !== 'running') return false;
      const id = o.id || 'akm', bk = bank(id, false);
      if (!bk) return false;
      if (!D.farTail) {
        D.farTail = ctx.createConvolver();
        D.farTail.buffer = mkIR(ctx, 3.4, 2.9, [[0.07, 0.3], [0.19, 0.26], [0.41, 0.2], [0.77, 0.14], [1.3, 0.08]]);
        const w = ctx.createGain(); w.gain.value = 0.85; D.farTail.connect(w); w.connect(audio.amb);
      }
      const d = clamp(o.d || 1500, 300, 8000), n = clamp(o.n | 0 || 1, 1, 40), iv = 60 / clamp(o.rpm || 600, 60, 1100);
      let pan = o.pan || 0;
      if (Number.isFinite(o.x) && Number.isFinite(o.z)) pan = panFrom(o.x - D.L.x, o.z - D.L.z, D.L.rx, D.L.rz, D.L.fx, D.L.fz).pan;
      const fc = clamp(2600 / (1 + d / 700), 300, 1400);
      const sh = ctx.createBiquadFilter(); sh.type = 'lowshelf'; sh.frequency.value = 200; sh.gain.value = 7;
      const l1 = ctx.createBiquadFilter(); l1.type = 'lowpass'; l1.frequency.value = fc; l1.Q.value = 0.6;
      const l2 = ctx.createBiquadFilter(); l2.type = 'lowpass'; l2.frequency.value = fc * 1.4; l2.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.value = (o.gain === undefined ? 1 : o.gain) * trimLin(id) * REF_LEVEL * (REF / d) * 1.6;
      sh.connect(l1); l1.connect(l2); l2.connect(g);
      const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pn) { pn.pan.value = clamp(pan * 0.85, -1, 1); g.connect(pn); pn.connect(audio.amb); } else g.connect(audio.amb);
      const wet = ctx.createGain(); wet.gain.value = 0.9 + Math.min(0.6, d / 6000); g.connect(wet); wet.connect(D.farTail);
      let t = ctx.currentTime + 0.03 + Math.max(0, o.delay || 0);
      const t0 = t;
      for (let i = 0; i < n; i++) {
        const src = ctx.createBufferSource(); src.buffer = bk[(Math.random() * bk.length) | 0];
        src.playbackRate.value = 0.9 + Math.random() * 0.08;
        const sg = ctx.createGain(); sg.gain.value = 0.7 + Math.random() * 0.4;
        src.connect(sg); sg.connect(sh);
        src.start(t); src.stop(t + Math.min(src.buffer.duration, 1.0));
        src.onended = () => { try { sg.disconnect(); } catch (e) { /* */ } };
        t += iv * (0.88 + Math.random() * 0.26);
      }
      const life = (t - t0 + 1.2) * 1000 + (o.delay || 0) * 1000;
      setTimeout(() => { try { g.disconnect(); wet.disconnect(); if (pn) pn.disconnect(); sh.disconnect(); } catch (e) { /* */ } }, life);
      D.stats.far2 = (D.stats.far2 || 0) + 1;
      return true;
    };
    D.warm(Object.keys(TRIM_DB));
    return D;
  }

  return {
    REF, ROLL, MAX_DIST, TRIM_DB, VOICES, NPC_MIX,
    gainAt, airCutoff, delayAt, farMix, farCutoff, trimLin, maxVoices, tailsAllowed, audible,
    shotParams, panFrom, poolDecide, shooterGate, npcGun, pitchBias, hashKey, bind,
    get last() { return lastBound; }
  };
});
