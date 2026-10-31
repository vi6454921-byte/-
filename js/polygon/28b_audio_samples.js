/* ==========================================================================
   МОДУЛЬ: audio/samples.js  (v19)
   ========================================================================== */
/* Записанные звуки мира поверх синтеза GAudio. Данные — assets/snd/sfx_pack.js
   и amb_pack.js (Sonniss GDC Game Audio Bundle, royalty-free; авторы —
   CREDITS_SOUNDS_RU.md). Синтез из 19_audio.js остаётся запасным: если
   запись не декодировалась или в настройках выключено «Записанные звуки
   мира» (AEGIS_SETTINGS.sfxRecorded === false), играет старый звук.

   Что заменено:
     взрывы (кроме M84 и вышибного «пух» ОЗМ) — близкий/дальний разрыв
       по расстоянию + осыпь грунта; осколки ОЗМ/M67 — прежний синтез;
     пролёт пули — щелчок сверхзвука (MG, полигон) / «вжик» дозвука;
     попадания — в тело, металл, камень (рикошет = удар + синтез «вьюу»);
     гильзы — лес (листва/дерево) или твёрдый пол (бетон);
     механика оружия игрока — магазин, затвор, сухой щелчок (GunAudio.play);
     шаги на бетоне в ангаре (SoldierSFX и запасной A.step);
     далёкая артиллерия; фон — петли леса, ангара, ветра (v21: без птиц и сверчков —
     птичьи трели вырезаны спектральным гейтом, см. tools/audio/strip_birds.py).
   Уровни подобраны рендером OfflineAudioContext (synth vs запись) — CAL. */
(function (root) {
  'use strict';
  const GA = root.GAudio;
  if (!GA || !GA.create) return;
  const DATA = root.__SFX_DATA || {};
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const enabled = () => (globalThis.AEGIS_SETTINGS || {}).sfxRecorded !== false;

  /* уровни (линейно), подобраны рендером synth против записи */
  const CAL = {
    /* tools/sound-tests/levels.html: RMS самых громких 300 мс на выходе тракта
       бодикама; запись = синтез +1…2 дБ (взрыв, попадания), щелчок пули — по пику */
    exp: 0.46, expFar: 3.3, debris: 0.1, crack: 0.4, whizz: 0.03,
    body: 0.16, metal: 0.22, stone: 0.035, case: 0.009, art: 0.4,
    step: 0.55, stepRun: 0.7,
    amb: { amb_forest: 0.17, amb_hangar: 0.12, amb_wind: 0.105 },
    synAmbUnder: 0.3,
    foley: { mag_out: 0.30, mag_in: 0.34, charge_back: 0.24, charge_rel: 0.40, dry: 0.20 }
  };

  /* ----------------------------------------------------- декодирование */
  const BUF = {};           /* key -> [{ b, ls, le }] */
  const LOOPS = {};         /* key -> Promise<{ b, ls, le }> */
  let oneShots = null;
  function b64u8(s) {
    const bin = atob(s), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  function decode(ctx, s) {
    return new Promise((res) => {
      let done = false;
      const ok = (b) => { if (!done) { done = true; res(b || null); } };
      try {
        const p = ctx.decodeAudioData(b64u8(s).buffer, ok, () => ok(null));
        if (p && p.then) p.then(ok, () => ok(null));
      } catch (e) { ok(null); }
    });
  }
  /* MP3 может прийти с задержкой кодера в начале: срезаем тишину до атаки
     (порог 2 % пика, 2 мс запаса) и отдаём уже чистый буфер — так его можно
     отдавать и чужим движкам (SoldierSFX, GunAudio) без смещения. */
  function trimLead(ctx, b) {
    const ch = b.getChannelData(0); let pk = 0;
    for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (v > pk) pk = v; }
    const thr = pk * 0.02; let i0 = 0;
    while (i0 < ch.length && Math.abs(ch[i0]) < thr) i0++;
    i0 = Math.max(0, i0 - Math.round(0.002 * b.sampleRate));
    if (i0 < 16) return b;
    const n = b.length - i0, out = ctx.createBuffer(b.numberOfChannels, n, b.sampleRate);
    for (let c = 0; c < b.numberOfChannels; c++) out.getChannelData(c).set(b.getChannelData(c).subarray(i0));
    return out;
  }
  function decodeOneShots(ctx) {
    if (oneShots) return oneShots;
    const jobs = [];
    for (const key in DATA) {
      const list = DATA[key];
      if (!Array.isArray(list) || typeof list[0] !== 'string') continue; /* петли — по требованию */
      BUF[key] = [];
      list.forEach((s) => jobs.push(decode(ctx, s).then((b) => { if (b) BUF[key].push({ b: trimLead(ctx, b) }); })));
    }
    oneShots = Promise.all(jobs).then(() => { SAMPLES.ready = true; });
    return oneShots;
  }
  function loadLoop(ctx, key) {
    if (LOOPS[key]) return LOOPS[key];
    const it = DATA[key] && DATA[key][0];
    if (!it || !it.d) return (LOOPS[key] = Promise.resolve(null));
    return (LOOPS[key] = decode(ctx, it.d).then((b) => (b ? { b, ls: it.ls, le: it.le } : null)));
  }
  const last = {};
  function pick(key) {
    const a = BUF[key];
    if (!a || !a.length) return null;
    let i = Math.floor(Math.random() * a.length);
    if (a.length > 1 && i === last[key]) i = (i + 1) % a.length;
    last[key] = i;
    return a[i];
  }
  const has = (key) => !!(BUF[key] && BUF[key].length);
  const use = (key) => enabled() && has(key);

  /* --------------------------------------------------------- проигрыш */
  function play(A, S, t, o) {
    if (!S) return null;
    const ctx = A.ctx, src = ctx.createBufferSource();
    src.buffer = S.b;
    src.playbackRate.value = o.rate || 1;
    let node = src;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.5; node.connect(f); node = f; }
    if (o.hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; f.Q.value = 0.6; node.connect(f); node = f; }
    const g = ctx.createGain(); g.gain.value = o.gain === undefined ? 1 : o.gain;
    node.connect(g); g.connect(o.out || A.dry);
    if (o.wet && A.conv) { const w = ctx.createGain(); w.gain.value = o.wet; g.connect(w); w.connect(A.conv); }
    if (o.echo && A.echo) { const e = ctx.createGain(); e.gain.value = o.echo; g.connect(e); e.connect(A.echo); }
    const t0 = Math.max(t, ctx.currentTime);
    src.start(t0, Math.max(0, (o.off || 0) + (t0 - t) * (o.rate || 1)));
    return src;
  }
  /* выход на шину фона (как ambOut в 19_audio.js) */
  function ambOut(A, q) {
    const ctx = A.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = q.lp || 12000; lp.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = q.gain === undefined ? 1 : q.gain;
    lp.connect(g);
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(q.pan || 0, -1, 1); g.connect(p); p.connect(A.amb); }
    else g.connect(A.amb);
    if (q.wet && A.conv) { const w = ctx.createGain(); w.gain.value = q.wet; g.connect(w); w.connect(A.conv); }
    return lp;
  }

  /* ------------------------------------------------------------ сцена */
  const HARD_MAPS = { angar_map: 'concrete' };
  const SCENE = { map: null, wx: 'day', rain: 0 };
  const floorOf = () => HARD_MAPS[SCENE.map] || null;
  function ambKey() {
    const m = SCENE.map;
    if (m === 'angar_map') return 'amb_hangar';
    if (m === 'stroyka_zarechye_v2') return 'amb_wind';
    return 'amb_forest';
  }

  function install(A) {
    const orig = {};
    for (const k of ['init', 'explosion', 'bulletPass', 'ricochet', 'metalPing', 'bodyHit', 'caseHit', 'artillery', 'step', 'surfStep', 'setRain'])
      orig[k] = A[k];
    const ready = () => A.on && A.init();

    A.init = function () {
      const had = !!A.ctx;
      const ctx = orig.init.apply(this, arguments);
      if (ctx && !had) {
        decodeOneShots(ctx).then(() => applyScene()).catch(() => {});
        applyScene();
      }
      return ctx;
    };

    /* ---- фон: петля по карте и погоде */
    let AMB = { key: null, src: null, g: null };
    let lastOn = null;
    function stopAmb(fade) {
      const o = AMB; AMB = { key: null, src: null, g: null };
      if (!o.src || !A.ctx) return;
      const t = A.ctx.currentTime;
      o.g.gain.cancelScheduledValues(t); o.g.gain.setTargetAtTime(0, t, fade || 0.8);
      setTimeout(() => { try { o.src.stop(); } catch (e) { /* */ } try { o.g.disconnect(); } catch (e) { /* */ } }, 4500);
    }
    function ambGain(key) {
      let g = CAL.amb[key] || 0.12;
      if (SCENE.rain > 0.2 && key !== 'amb_hangar') g *= 1 - 0.45 * clamp(SCENE.rain, 0, 1);
      return g;
    }
    function applyScene() {
      if (!A.ctx || !A.amb) return;
      const on = enabled();
      lastOn = on;
      const ctx = A.ctx, t = ctx.currentTime;
      const key = on ? ambKey() : null;
      if (A.synAmb) A.synAmb.gain.setTargetAtTime(key ? CAL.synAmbUnder * (key === 'amb_hangar' ? 0.35 : 1) : 1, t, 1.5);
      if (AMB.key === key) { if (AMB.g) AMB.g.gain.setTargetAtTime(ambGain(key), t, 1.2); return; }
      stopAmb(1.0);
      if (!key) return;
      AMB.key = key;
      loadLoop(ctx, key).then((S) => {
        if (!S || AMB.key !== key || AMB.src) return;
        const src = ctx.createBufferSource(); src.buffer = S.b; src.loop = true;
        src.loopStart = S.ls; src.loopEnd = S.le;
        const g = ctx.createGain(); g.gain.value = 0.0001;
        src.connect(g); g.connect(A.amb);
        src.start(0, S.ls + Math.random() * (S.le - S.ls));
        g.gain.setTargetAtTime(ambGain(key), ctx.currentTime, 1.4);
        AMB.src = src; AMB.g = g;
      });
    }
    /* переключатель в настройках действует сразу */
    setInterval(() => { if (A.ctx && enabled() !== lastOn) applyScene(); }, 1500);
    A.setScene = function (o) {
      o = o || {};
      SCENE.map = o.map || null; SCENE.wx = o.wx || 'day';
      if (o.rain !== undefined) SCENE.rain = +o.rain || 0;
      applyScene();
    };
    A.setRain = function (k) {
      const r = orig.setRain ? orig.setRain.apply(this, arguments) : undefined;
      SCENE.rain = clamp(+k || 0, 0, 1);
      if (AMB.g && A.ctx) AMB.g.gain.setTargetAtTime(ambGain(AMB.key), A.ctx.currentTime, 2);
      return r;
    };

    /* ---- взрывы */
    A.explosion = function (sp, kind) {
      if (kind === 'm84' || kind === 'ozm_pop' || !use('exp_near') || !ready()) return orig.explosion.apply(this, arguments);
      const q = sp || {}, d = q.dist === undefined ? 10 : q.dist;
      const big = kind === 'tm' ? 2.4 : kind === 'ozm' ? 1.5 : kind === 'm67' ? 1.25 : 1;
      const g = clamp(7 / Math.max(7, d), 0.07, 1) * Math.min(1.25, 0.55 + 0.45 * big);
      const lpF = clamp(16000 / (1 + d * 0.05), 1200, 16000);
      const out = A.spatial({ pan: q.pan, gain: g, lp: lpF });
      const t = A.now(0.002 + (q.delay || 0));
      const farK = clamp((d - 30) / 110, 0, 1), nearK = 1 - 0.8 * farK;
      const key = kind === 'tm' && has('exp_big') ? 'exp_big' : kind === 'pmn' && has('exp_med') ? 'exp_med' : 'exp_near';
      const rate = (kind === 'tm' ? 0.9 : kind === 'pmn' ? 1.06 : 1) * rnd(0.95, 1.05);
      play(A, pick(key), t, { out, gain: CAL.exp * nearK, rate, wet: 0.3 + 0.35 * farK, echo: 0.25 + 0.35 * farK });
      if (kind === 'tm') play(A, pick('exp_near'), t + 0.004, { out, gain: CAL.exp * 0.6 * nearK, rate: 0.78, wet: 0.5, echo: 0.4 });
      if (farK > 0.02 && has('exp_far')) play(A, pick('exp_far'), t + 0.01, { out, gain: CAL.expFar * farK * (kind === 'tm' ? 1.3 : 1), rate: rate * 0.97, wet: 0.6, echo: 0.5 });
      if (kind === 'ozm' || kind === 'm67') {
        /* осколки: прежние короткие свисты и щелчки по стволам */
        const nf = kind === 'ozm' ? 22 : 16;
        for (let i = 0; i < nf; i++) {
          const ti = t + 0.01 + Math.random() * 0.35;
          if (Math.random() < 0.45) A.nz(ti, rnd(0.03, 0.09), { type: 'bandpass', freq: rnd(3500, 6500), freq2: rnd(1800, 3000), q: 4, gain: rnd(0.02, 0.06), atk: 0.004, out });
          else A.nz(ti, 0.012, { type: 'bandpass', freq: rnd(1200, 3200), q: 2.5, gain: rnd(0.04, 0.11), atk: 0.0005, wet: 0.4, out });
        }
      }
      /* осыпь грунта: комья земли падают 0,25–1,8 с */
      if (has('debris') && farK < 0.9) {
        const nd = kind === 'tm' ? 7 : kind === 'pmn' ? 5 : 3;
        for (let i = 0; i < nd; i++)
          play(A, pick('debris'), t + 0.25 + Math.pow(Math.random(), 0.8) * 1.5, { out, gain: CAL.debris * rnd(0.35, 1) * (1 - farK), rate: rnd(0.8, 1.15), lp: 7000 });
      }
    };

    /* ---- пролёт пули */
    A.bulletPass = function (sp, superK) {
      const key = superK ? 'crack' : 'whizz';
      if (!use(key) || !ready()) return orig.bulletPass.apply(this, arguments);
      const q = sp || {};
      const out = A.spatial({ pan: q.pan, gain: q.gain === undefined ? 1 : q.gain, lp: 16000 });
      const t = A.now(0.002 + (q.delay || 0));
      if (superK) play(A, pick('crack'), t, { out, gain: CAL.crack * rnd(0.8, 1.1), rate: rnd(0.94, 1.08), wet: 0.22, echo: 0.3 });
      else {
        /* пик «вжика» в записи ~0,22 с от начала — ставим его на момент пролёта */
        const r = rnd(0.85, 1.15);
        play(A, pick('whizz'), t - 0.22 / r, { out, gain: CAL.whizz * rnd(0.8, 1.1), rate: r });
      }
    };
    /* ---- рикошет: удар по камню/металлу (запись) + уходящая пуля (синтез) */
    A.ricochet = function (sp, k) {
      if (!use('hit_stone') || !ready()) return orig.ricochet.apply(this, arguments);
      const q = sp || {}, out = A.spatial(q);
      const t = A.now(0.002 + (q.delay || 0)), kk = clamp(k === undefined ? 1 : k, 0, 1);
      play(A, BUF.hit_stone[0], t, { out, gain: CAL.stone * (0.5 + 0.5 * kk), rate: rnd(0.95, 1.2), hp: 400 });
      const f0 = rnd(2600, 4200);
      A.osc(t + 0.004, rnd(0.18, 0.34), f0, f0 * rnd(0.35, 0.55), 0.035 * kk, 'sine', { atk: 0.004, out, wet: 0.3, echo: 0.25 });
    };
    A.metalPing = function (sp, bigP) {
      if (!use('hit_metal') || !ready()) return orig.metalPing.apply(this, arguments);
      const q = sp || {}, out = A.spatial(q);
      const t = A.now(0.002 + (q.delay || 0));
      const S = bigP && BUF.hit_metal[1] ? BUF.hit_metal[1] : BUF.hit_metal[0];
      play(A, S, t, { out, gain: CAL.metal * (bigP ? 0.65 : 1), rate: bigP ? rnd(0.8, 0.95) : rnd(1.05, 1.35), wet: 0.25 });
    };
    A.bodyHit = function (kind, sp) {
      if ((kind && kind !== 'flesh') || !use('hit_body') || !ready()) return orig.bodyHit.apply(this, arguments);
      const q = sp || {}, out = A.spatial(q);
      const t = A.now(0.002 + (q.delay || 0));
      play(A, pick('hit_body'), t, { out, gain: CAL.body * rnd(0.85, 1.1), rate: rnd(0.88, 1.12), wet: 0.18 });
    };
    /* ---- гильзы: лес — листва/дерево, ангар — бетон */
    A.caseHit = function (v) {
      const key = floorOf() ? 'case_hard' : 'case_soft';
      if (!use(key) || !A.on || !A.ctx) return orig.caseHit.apply(this, arguments);
      const t = A.now(0.001);
      play(A, pick(key), t, { gain: CAL.case * clamp(v, 0.15, 1), rate: rnd(0.92, 1.15), wet: 0.12 });
    };
    /* ---- далёкая артиллерия */
    A.artillery = function (o) {
      if (!use('artillery') || !(A.on && A.init() && A.amb && A.ctx.state === 'running')) return orig.artillery.apply(this, arguments);
      o = o || {};
      const n = o.n || 1, k = o.gain === undefined ? 1 : o.gain;
      for (let i = 0; i < n; i++) {
        const t = A.ctx.currentTime + 0.05 + i * rnd(0.5, 2.2);
        const out = ambOut(A, { pan: (o.pan || 0) + rnd(-0.15, 0.15), gain: k * rnd(0.6, 1) * CAL.art, lp: rnd(1400, 2600), wet: 0.35 });
        play(A, pick('artillery'), t, { out, rate: rnd(0.85, 1.05) });
      }
    };
    /* ---- шаги на твёрдом полу (запасной путь, когда нет SoldierSFX) */
    A.step = function (hard, vol, run, side) {
      if (!floorOf() || !use('step_hard') || !ready()) return orig.step.apply(this, arguments);
      const r = clamp(run || 0, 0, 1), k = vol === undefined ? 1 : vol;
      const key = r > 0.5 && has('step_hard_run') ? 'step_hard_run' : 'step_hard';
      play(A, pick(key), A.now(0.001), { gain: (r > 0.5 ? CAL.stepRun : CAL.step) * k * rnd(0.85, 1.1), rate: rnd(0.93, 1.06) * (side > 0 ? 1.02 : 0.98), wet: 0.12 });
    };
    /* слой поверхности леса (хвоя, трава, грязь) на бетоне не нужен */
    A.surfStep = function (sp, surf) {
      if (floorOf() && enabled() && (!surf || surf.kind !== 'water')) return;
      return orig.surfStep.apply(this, arguments);
    };
    A.samples = SAMPLES;
    return A;
  }

  const SAMPLES = root.GAudioSamples = {
    CAL, BUF, DATA, SCENE, ready: false, enabled, pick, has,
    decodeOneShots, loadLoop, floorOf, ambKey
  };

  const create0 = GA.create;
  GA.create = function () { return install(create0.apply(this, arguments)); };

  /* ---- шаги бойцов (SoldierSFX): на бетоне — записи ботинок по асфальту/бетону */
  const SS = root.GSoldierSFX && root.GSoldierSFX.SoldierSFX;
  if (SS && SS.prototype.step) {
    const step0 = SS.prototype.step;
    const bank = (key) => ({ rand: () => { const S = pick(key); return S && S.b; } });
    const HARD = { walk: bank('step_hard'), run: bank('step_hard_run') };
    SS.prototype.step = function (t, run) {
      const B = this.B;
      if (!B || !floorOf() || !enabled() || !has('step_hard')) return step0.apply(this, arguments);
      const w = B.step_walk, r = B.step_run;
      B.step_walk = HARD.walk; B.step_run = has('step_hard_run') ? HARD.run : HARD.walk;
      try { return step0.apply(this, arguments); } finally { B.step_walk = w; B.step_run = r; }
    };
  }

  /* ---- механика оружия игрока (AEGIS_WK GunAudio): записи магазина/затвора */
  const FOLEY = { magOut: 'mag_out', magIn: 'mag_in', chargeBack: 'charge_back', chargeRelease: 'charge_rel', dryFire: 'dry' };
  const famRate = (P) => {
    const f = String((P && P.family) || '');
    if (f === 'ak') return 0.93;
    if (f === 'svd') return 0.9;
    if (f === 'm870') return 0.95;
    if (f === 'mp5a3') return 1.06;
    if (f.indexOf('glock') === 0) return 1.15;
    return 1;
  };
  const WK = root.AEGIS_WK;
  if (WK && WK.AUDIO_FAMILY) {
    for (const fam of Object.keys(WK.AUDIO_FAMILY)) {
      const GAc = WK.AUDIO_FAMILY[fam] && WK.AUDIO_FAMILY[fam].GunAudio;
      if (!GAc || !GAc.prototype.play || GAc.prototype.play.__v19) continue;
      const play0 = GAc.prototype.play;
      const playS = function (name, o = {}) {
        const key = FOLEY[name];
        if (!key || !this.ctx || this.muted || !enabled() || !has(key) || typeof this.out !== 'function') return play0.call(this, name, o);
        const c = this.ctx, S = pick(key);
        const s = c.createBufferSource(); s.buffer = S.b;
        s.playbackRate.value = famRate(this.profile) * (0.96 + Math.random() * 0.08);
        const g = c.createGain(); g.gain.value = (o.gain ?? 1) * 0.9 * CAL.foley[key];
        s.connect(g);
        this.out(g, o.wet ?? 0.07, o.pan ?? 0.12);
        s.start(c.currentTime + (o.delay || 0));
      };
      playS.__v19 = true;
      GAc.prototype.play = playS;
    }
  }
})(typeof self !== 'undefined' ? self : this);
