
/* ==========================================================================
   МОДУЛЬ: audio.js
   ========================================================================== */
/* ============================================================================
   Звук. Полный синтез через WebAudio, внешних файлов нет.

   Выстрел собирается из четырёх слоёв: ударный фронт (щелчок сверхзвука),
   низкий «бум» пороховых газов, механика затвора и хвост отражений от
   деревьев и построек. Шаги и снаряжение звучат тише, но именно они дают
   ощущение веса.
   ========================================================================== */
(function (root, factory) {
  const A = factory(root.GUtil);
  if (typeof module !== 'undefined' && module.exports) module.exports = A;
  else root.GAudio = A;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  const rnd = (a, b) => a + Math.random() * (b - a);

  function create() {
    const A = {
      ctx: null, on: true, master: null, dry: null, conv: null, echo: null, nb: null,
      listener: null
    };

    A.init = function () {
      if (A.ctx) return A.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { A.on = false; return null; }
      const ctx = A.ctx = new AC();

      /* Тракт микрофона бодикама (по AudioEngine из bodycam_angar.html):
         маленькая капсула не берёт низ (срез 120 Гц) и верх (7,8 кГц), у неё
         подъём присутствия около 2,8 кГц; дальше — перегруз предусилителя и
         жёсткий компрессор с автоуровнем. Именно это даёт «звук с бодикама»:
         выстрел сплющен и хрустит, а шаги, дыхание и шорох снаряжения —
         близко и громко. */
      const master = ctx.createGain(); master.gain.value = 0.8;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120; hp.Q.value = 0.7;
      const pres = ctx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 2800; pres.Q.value = 0.9; pres.gain.value = 4;
      const lpm = ctx.createBiquadFilter(); lpm.type = 'lowpass'; lpm.frequency.value = 7800;
      const drive = ctx.createWaveShaper();
      const curve = new Float32Array(2048);
      for (let i = 0; i < curve.length; i++) { const x = i / (curve.length - 1) * 2 - 1; curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); }
      drive.curve = curve; drive.oversample = '2x';
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -26; comp.knee.value = 6; comp.ratio.value = 12;
      comp.attack.value = 0.001; comp.release.value = 0.45;
      const makeup = ctx.createGain(); makeup.gain.value = 1.9;
      const out = ctx.createGain(); out.gain.value = 0.62;
      /* оглушение (A.deafen): глухота после близкого разрыва — общий срез
         верха и провал громкости, которые за секунды отпускают */
      const deafLP = ctx.createBiquadFilter(); deafLP.type = 'lowpass'; deafLP.frequency.value = 20000; deafLP.Q.value = 0.5;
      const deafG = ctx.createGain(); deafG.gain.value = 1;
      master.connect(deafLP); deafLP.connect(deafG); deafG.connect(hp); hp.connect(pres); pres.connect(lpm); lpm.connect(drive);
      drive.connect(comp); comp.connect(makeup); makeup.connect(out); out.connect(ctx.destination);
      A.deafLP = deafLP; A.deafG = deafG; A.post = hp;

      const dry = ctx.createGain(); dry.gain.value = 1; dry.connect(master);

      /* открытое пространство: короткая ранняя часть, длинный тихий хвост */
      const conv = ctx.createConvolver();
      conv.buffer = mkIR(ctx, 1.9);
      const wet = ctx.createGain(); wet.gain.value = 0.46;
      conv.connect(wet); wet.connect(master); A._wetG = wet;

      /* шлепок от кромки леса: заметная задержка ~0,17 с (≈ 28 м) */
      const dl = ctx.createDelay(1.0); dl.delayTime.value = 0.168;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1150;
      const fb = ctx.createGain(); fb.gain.value = 0.24;
      const dg = ctx.createGain(); dg.gain.value = 0.36;
      dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(dg); dg.connect(master); A._echoG = dg;

      A.master = master; A.dry = dry; A.conv = conv; A.echo = dl;
      A._dry0 = dry;
      /* шина звука оружия игрока (AEGIS_WK GunAudio): мимо пространства,
         но через тракт микрофона и глухоту */
      /* v9: выстрелы своего оружия звучат как в оружейной (weapons.zip):
         сэмпл → GunAudio (своя компрессия −10 дБ, 8:1) → выход. Раньше шина
         шла ещё и через тракт микрофона бодикама (срез 120 Гц / 7,8 кГц,
         перегруз tanh ×2,2, компрессор −26 дБ 12:1) — выстрел сплющивался и
         хрипел. Глухота от разрыва и громкость/пауза — свои, синхронные с
         общими; в конце — мягкий лимитер от клиппинга при сложении с миром. */
      const gunBus = ctx.createGain(); gunBus.gain.value = 0.85;
      const gDeafLP = ctx.createBiquadFilter(); gDeafLP.type = 'lowpass'; gDeafLP.frequency.value = 20000; gDeafLP.Q.value = 0.5;
      const gDeafG = ctx.createGain(); gDeafG.gain.value = 1;
      const gOut = ctx.createGain(); gOut.gain.value = (A.vol === undefined ? 1 : A.vol)*((globalThis.AEGIS_SETTINGS||{}).shots??1);
      const gLim = ctx.createDynamicsCompressor();
      gLim.threshold.value = -2; gLim.knee.value = 2; gLim.ratio.value = 20; gLim.attack.value = 0.001; gLim.release.value = 0.1;
      gunBus.connect(gDeafLP); gDeafLP.connect(gDeafG); gDeafG.connect(gOut); gOut.connect(gLim); gLim.connect(ctx.destination);
      A.gunBus = gunBus; A.gDeafLP = gDeafLP; A.gDeafG = gDeafG; A.gOut = gOut;
      master.gain.value = 0.8 * (A.vol === undefined ? 1 : A.vol);
      try { loadSteps(ctx); } catch (e) { /* запасной синтез */ }
      A.nb = mkNoise(ctx, 2.4);

      /* Фон: ветер в соснах (низкий шум с медленным «дыханием»), шипение
         капсулы. И ветер в микрофоне: на ходу и особенно на бегу воздух
         бьёт в капсулу — низкое бубнение, громкость задаёт A.motion(). */
      /* шина фона леса: мимо master, чтобы лес звучал и в меню/паузе (master на паузе глушится) */
      const amb = ctx.createGain(); amb.gain.value = A.ambOn === false ? 0 : (A.vol === undefined ? 1 : A.vol)*((globalThis.AEGIS_SETTINGS||{}).ambience??1);
      amb.connect(deafLP); A.amb = amb;
      /* v19: синтетический фон (ветер, листва, птицы) — своя подшина: при записанном фоне
         (28b_audio_samples.js) её приглушают, а не выключают */
      const synAmb = ctx.createGain(); synAmb.gain.value = 1; synAmb.connect(amb); A.synAmb = synAmb;
      const loop = (freqType, f, q, g, dst) => {
        const s = ctx.createBufferSource(); s.buffer = A.nb; s.loop = true;
        const fl = ctx.createBiquadFilter(); fl.type = freqType; fl.frequency.value = f; fl.Q.value = q;
        const gg = ctx.createGain(); gg.gain.value = g;
        s.connect(fl); fl.connect(gg); gg.connect(dst || synAmb); s.start(0, Math.random() * 2);
        return { s, fl, gg };
      };
      const wind = loop('lowpass', 520, 0.5, 0.030);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
      const lfoG = ctx.createGain(); lfoG.gain.value = 0.014;
      lfo.connect(lfoG); lfoG.connect(wind.gg.gain); lfo.start();
      loop('highpass', 4800, 0.6, 0.009);
      /* шелест листвы и хвои: полосовой шум 2,2 кГц, порывы — медленный LFO, не совпадающий с ветром */
      const leaves = loop('bandpass', 2300, 0.55, 0.008);
      const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.037;
      const lfo2G = ctx.createGain(); lfo2G.gain.value = 0.0065;
      lfo2.connect(lfo2G); lfo2G.connect(leaves.gg.gain); lfo2.start();
      A.micWind = loop('lowpass', 260, 0.9, 0.0001, master);
      A.micWind.s.playbackRate.value = 0.8;
      startBirds(ctx);
      if (A.rain > 0) setTimeout(() => A.setRain(A.rain), 0);
      if (A.droneK > 0) setTimeout(() => A.setDrone(A.droneK), 0);
      return ctx;
    };

    /* Птицы леса: синтез трелей (зяблик/пеночка — частые нисходящие свисты 3–6 кГц),
       редкое далёкое «ку-ку» и стук дятла. Всё тихо и с панорамой: фон, а не событие. */
    function startBirds(ctx) {
      const chirp = (t, f0, f1, dur, g, pan) => {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t);
        e.gain.exponentialRampToValueAtTime(g, t + dur * 0.25); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        o.connect(e);
        if (p) { p.pan.value = pan; e.connect(p); p.connect(A.synAmb || A.amb); } else e.connect(A.synAmb || A.amb);
        o.start(t); o.stop(t + dur + 0.02);
      };
      const song = () => {
        if (!A.ctx || A.ctx.state !== 'running' || !A.on || A.ambOn === false) return;
        const t = ctx.currentTime + 0.05, pan = rnd(-0.85, 0.85), g = rnd(0.004, 0.012), r = Math.random();
        if (r < 0.55) { /* трель с концовкой */
          const n = 5 + (Math.random() * 7 | 0), f = rnd(3600, 5200);
          for (let i = 0; i < n; i++) chirp(t + i * rnd(0.07, 0.095), f * (1 - i * 0.025), f * 0.72, 0.06, g, pan);
          chirp(t + n * 0.09 + 0.04, f * 0.9, f * 1.25, 0.16, g * 1.2, pan);
        } else if (r < 0.85) { /* свист «тиу-тиу» */
          const f = rnd(2600, 3600), n = 2 + (Math.random() * 3 | 0);
          for (let i = 0; i < n; i++) chirp(t + i * 0.28, f * 1.35, f, 0.18, g, pan);
        } else if (r < 0.93) { /* далёкая кукушка */
          for (let i = 0; i < 2 + (Math.random() * 3 | 0); i++) { chirp(t + i * 0.9, 760, 740, 0.22, 0.004, pan); chirp(t + i * 0.9 + 0.3, 620, 600, 0.3, 0.004, pan); }
        } else { /* дятел (большой пёстрый): барабанная дробь ~0,6 с, 12–16 ударов
                    с ускорением в начале и затуханием к концу; удар — щелчок по сушине
                    (полосовой шум ~1 кГц, добротность высокая — звенит ствол) */
          const n = 12 + (Math.random() * 5 | 0), fr = rnd(800, 1300);
          let tt = t;
          for (let i = 0; i < n; i++) {
            const u = i / n, g0 = 0.010 * (1 - u * 0.7) * (A.rain > 0.3 ? 0.4 : 1);
            const s = ctx.createBufferSource(); s.buffer = A.nb;
            const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fr * (1 - u * 0.05); f.Q.value = 9;
            const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, tt); e.gain.exponentialRampToValueAtTime(g0 * 6, tt + 0.0015); e.gain.exponentialRampToValueAtTime(0.0001, tt + 0.03);
            const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
            s.connect(f); f.connect(e);
            if (p) { p.pan.value = pan; e.connect(p); p.connect(A.synAmb || A.amb); } else e.connect(A.synAmb || A.amb);
            if (A.conv) { const w = ctx.createGain(); w.gain.value = 0.5; e.connect(w); w.connect(A.conv); }
            s.start(tt, Math.random()); s.stop(tt + 0.04);
            tt += 0.042 + (i < 3 ? (3 - i) * 0.006 : 0);
          }
        }
        /* в дождь птицы почти молчат */
      };
      /* v21: пение птиц, кукушка и дятел убраны (по запросу) — остаются ветер, хвоя и скрип стволов */
      void song;
      /* скрип стволов: чаще в порывы и под дождём с ветром */
      const creakNext = () => {
        if (A.ctx && A.ctx.state === 'running' && A.on && A.ambOn !== false && Math.random() < 0.55 + (A.wind || 0) * 0.4) A.creak(0.6 + Math.random() * 0.6 + (A.wind || 0) * 0.6, rnd(-0.9, 0.9));
        setTimeout(creakNext, rnd(9000, 26000) / (0.6 + (A.wind || 0.5)));
      };
      setTimeout(creakNext, 6000);
    }
    /* пауза: глушим звук боя (master), фон леса остаётся чуть тише */
    A.setPaused = function (on) {
      if (!A.ctx) return;
      if (A.ctx.state === 'suspended') try { A.ctx.resume(); } catch (e) { /* */ }
      const t = A.ctx.currentTime, v = A.vol === undefined ? 1 : A.vol;
      A.paused = !!on;
      if (A.on) {
        A.master.gain.setTargetAtTime(on ? 0 : 0.8 * v, t, 0.06);
        if (A.gOut) A.gOut.gain.setTargetAtTime(on ? 0 : v*((globalThis.AEGIS_SETTINGS||{}).shots??1), t, 0.06);
        A.amb.gain.setTargetAtTime(ambLevel(), t, 0.3);
      }
    };
    /* Фон леса (ветер, хвоя, птицы) нужен только там, где лес виден:
       на полигоне, в меню и паузе. В оружейной — помещение, фон глушится. */
    A.ambOn = true;
    function ambLevel() {
      const v = A.vol === undefined ? 1 : A.vol;
      if (!A.on || !A.ambOn) return 0;
      return (A.paused ? 0.75 * v : v)*((globalThis.AEGIS_SETTINGS||{}).ambience??1);
    }
    A.setAmbient = function (on) {
      A.ambOn = !!on;
      if (!A.ctx || !A.amb) return;
      A.amb.gain.setTargetAtTime(ambLevel(), A.ctx.currentTime, on ? 0.35 : 0.08);
    };

    /* k — 0..1 от скорости: ветер в микрофоне */
    A.motion = function (k) {
      if (!A.ctx || !A.micWind || !A.on) return;
      const t = A.ctx.currentTime, kk = U.clamp01(k);
      A.micWind.gg.gain.setTargetAtTime(0.0001 + 0.075 * kk * kk, t, 0.25);
      A.micWind.fl.frequency.setTargetAtTime(180 + 260 * kk, t, 0.3);
    };

    function mkNoise(ctx, sec) {
      const n = Math.floor(ctx.sampleRate * sec);
      const b = ctx.createBuffer(2, n, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        let last = 0;
        for (let i = 0; i < n; i++) {
          const w = Math.random() * 2 - 1;
          last = 0.86 * last + 0.14 * w;
          d[i] = w * 0.72 + last * 0.55;
        }
      }
      return b;
    }

    function mkIR(ctx, sec) {
      const n = Math.floor(ctx.sampleRate * sec);
      const b = ctx.createBuffer(2, n, ctx.sampleRate);
      const taps = [0.013, 0.022, 0.034, 0.051, 0.068, 0.089, 0.113, 0.146, 0.183, 0.229];
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        let lp = 0;
        for (let i = 0; i < n; i++) {
          const t = i / ctx.sampleRate;
          const env = Math.pow(1 - t / sec, 2.7) * Math.exp(-t * 1.4);
          const w = Math.random() * 2 - 1;
          lp = lp * 0.64 + w * 0.36;
          d[i] = (w * 0.34 + lp * 0.66) * env * 0.5;
        }
        for (let k = 0; k < taps.length; k++) {
          const idx = Math.floor((taps[k] + (c ? 0.0038 : 0)) * ctx.sampleRate);
          if (idx < n) d[idx] += (Math.random() < 0.5 ? -1 : 1) * 0.46 * Math.pow(1 - k / taps.length, 1.7);
        }
      }
      return b;
    }

    /* шумовой слой */
    A.nz = function (t0, dur, o) {
      const ctx = A.ctx; o = o || {};
      const src = ctx.createBufferSource();
      src.buffer = A.nb; src.loop = true;
      src.playbackRate.value = o.rate || 1;
      let node = src;
      if (o.type) {
        const f = ctx.createBiquadFilter();
        f.type = o.type; f.Q.value = o.q === undefined ? 1 : o.q;
        f.frequency.setValueAtTime(o.freq || 1000, t0);
        if (o.freq2) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freq2), t0 + dur);
        node.connect(f); node = f;
      }
      if (o.hp) {
        const h = ctx.createBiquadFilter();
        h.type = 'highpass'; h.frequency.value = o.hp; h.Q.value = 0.7;
        node.connect(h); node = h;
      }
      const g = ctx.createGain();
      const pk = Math.max(0.0006, (o.gain === undefined ? 0.3 : o.gain) * (o.vol === undefined ? 1 : o.vol));
      const atk = o.atk === undefined ? 0.0012 : o.atk;
      g.gain.setValueAtTime(0.0004, t0);
      g.gain.exponentialRampToValueAtTime(pk, t0 + atk);
      g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
      g.gain.setValueAtTime(0, t0 + dur + 0.005);
      node.connect(g);
      g.connect(o.out || A.dry);
      if (o.wet) { const w = ctx.createGain(); w.gain.value = o.wet; g.connect(w); w.connect(A.conv); }
      if (o.echo) { const e = ctx.createGain(); e.gain.value = o.echo; g.connect(e); e.connect(A.echo); }
      src.start(t0, Math.random() * 1.6);
      src.stop(t0 + dur + 0.03);
    };

    /* тональный слой */
    A.osc = function (t0, dur, f0, f1, gain, type, o) {
      const ctx = A.ctx; o = o || {};
      const s = ctx.createOscillator();
      s.type = type || 'sine';
      s.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) s.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0004, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0006, gain), t0 + (o.atk || 0.0015));
      g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
      g.gain.setValueAtTime(0, t0 + dur + 0.005);
      s.connect(g); g.connect(o.out || A.dry);
      if (o.wet) { const w = ctx.createGain(); w.gain.value = o.wet; g.connect(w); w.connect(A.conv); }
      if (o.echo) { const e = ctx.createGain(); e.gain.value = o.echo; g.connect(e); e.connect(A.echo); }
      s.start(t0); s.stop(t0 + dur + 0.03);
    };

    A.now = (d) => A.ctx.currentTime + (d || 0);
    const ready = () => A.on && A.init();

    /* ------------------------------------------ звук с места события -- */
    /* Бодикам пишет одним микрофоном, но далёкое звучит тише, глуше и
       позже, а сбоку — с перекосом каналов: по этому на слух понятно, где
       упал человек. sp: { pan, gain, lp, delay } (см. spatialFrom). */
    A.spatial = function (sp) {
      const ctx = A.ctx, q = sp || {};
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = q.lp || 14000; lp.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.value = q.gain === undefined ? 1 : q.gain;
      lp.connect(g);
      let last = g;
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = U.clamp(q.pan || 0, -1, 1);
        g.connect(p); last = p;
      }
      last.connect(A.dry);
      return lp;
    };
    /* Пуля в человека: плотный шлепок и глухой удар (flesh); в плиту —
       сухой щелчок керамики и звон стального подложа (plate); по шлему —
       удар и визг рикошета (helmet). */
    A.bodyHit = function (kind, sp) {
      if (!ready()) return;
      const q = sp || {}, out = A.spatial(q);
      const t = A.now(0.002 + (q.delay || 0));
      if (kind === 'plate') {
        A.nz(t, 0.018, { type: 'highpass', freq: 2400, q: 0.7, gain: 0.55, atk: 0.0004, wet: 0.35, echo: 0.25, out });
        A.nz(t, 0.070, { type: 'bandpass', freq: rnd(1100, 1500), q: 2.2, gain: 0.34, atk: 0.0008, wet: 0.3, out });
        A.osc(t, 0.16, rnd(1700, 2300), rnd(1500, 1700), 0.07, 'triangle', { wet: 0.4, out });
        A.nz(t + 0.004, 0.09, { type: 'lowpass', freq: 380, q: 0.8, gain: 0.30, atk: 0.002, out });
      } else if (kind === 'helmet') {
        A.nz(t, 0.020, { type: 'highpass', freq: 2000, q: 0.7, gain: 0.5, atk: 0.0004, wet: 0.35, out });
        A.osc(t + 0.004, 0.34, rnd(2600, 3400), rnd(900, 1300), 0.10, 'sine', { wet: 0.5, echo: 0.3, out });
        A.nz(t + 0.006, 0.30, { type: 'bandpass', freq: 3400, freq2: 1200, q: 3, gain: 0.12, atk: 0.01, wet: 0.5, out });
      } else {
        A.nz(t, 0.012, { type: 'bandpass', freq: rnd(1400, 2000), q: 1.2, gain: 0.42, atk: 0.0005, out });
        A.nz(t + 0.001, 0.085, { type: 'lowpass', freq: 420, freq2: 160, q: 0.9, gain: 0.55, atk: 0.0015, wet: 0.25, out });
        A.osc(t, 0.07, rnd(95, 125), 48, 0.26, 'sine', { wet: 0.2, out });
      }
    };
    /* Тело на грунт: глухой удар, стук снаряжения (магазины, плиты,
       шлем), шорох ткани. v — 0…1, сила удара. */
    A.bodyFall = function (sp, v) {
      if (!ready()) return;
      const q = sp || {}, out = A.spatial(q), k = U.clamp(v === undefined ? 1 : v, 0.25, 1);
      const t = A.now(0.002 + (q.delay || 0));
      A.nz(t, 0.20, { type: 'lowpass', freq: 260, freq2: 90, q: 0.9, gain: 0.62 * k, atk: 0.004, wet: 0.3, echo: 0.2, out });
      A.osc(t, 0.16, 82, 40, 0.30 * k, 'sine', { wet: 0.2, out });
      A.nz(t + 0.01, 0.34, { type: 'bandpass', freq: 2600, q: 0.6, gain: 0.07 * k, atk: 0.03, out });
      for (let i = 0; i < 5; i++)
        A.nz(t + 0.012 + Math.random() * 0.11, 0.028, { type: 'bandpass', freq: rnd(700, 2100), q: 2.4, gain: rnd(0.05, 0.12) * k, atk: 0.0008, out });
      /* второй удар — голова/плечи догоняют корпус */
      A.nz(t + rnd(0.09, 0.16), 0.12, { type: 'lowpass', freq: 300, q: 0.9, gain: 0.26 * k, atk: 0.003, out });
    };
    /* Автомат о грунт: металл и пластик, отскок. */
    A.gunDrop = function (sp) {
      if (!ready()) return;
      const q = sp || {}, out = A.spatial(q);
      const t = A.now(0.002 + (q.delay || 0));
      for (let j = 0; j < 2; j++) {
        const tj = t + j * rnd(0.09, 0.15), k = j ? 0.45 : 1;
        A.nz(tj, 0.045, { type: 'bandpass', freq: rnd(1800, 3200), q: 3.2, gain: 0.16 * k, atk: 0.0006, wet: 0.3, out });
        A.nz(tj, 0.07, { type: 'lowpass', freq: 520, q: 0.8, gain: 0.22 * k, atk: 0.002, out });
        A.osc(tj, 0.09, rnd(1200, 1600), rnd(900, 1100), 0.035 * k, 'triangle', { out });
      }
    };

    /* ------------------------------------------------------- подрыв --- */
    /* Разрыв мины. sp — как у A.spatial (pan, gain, lp, delay, dist).
       kind: 'pmn' — заглублённые 100–200 г: резкий хлопок и тупой удар,
       затем дождь земли; 'ozm_pop' — вышибной заряд ОЗМ, глухой «пух»;
       'ozm' — основной заряд 660 г в воздухе: громче, звонче, с визгом
       осколков и стуком их по стволам; 'tm' — 7 кг: тяжёлый долгий раскат.
       Вблизи бодикам перегружается — это делают драйв и компрессор тракта. */
    A.explosion = function (sp, kind) {
      if (!ready()) return;
      const q = sp || {}, d = q.dist === undefined ? 10 : q.dist;
      const big = kind === 'tm' ? 2.4 : kind === 'ozm' ? 1.5 : kind === 'm67' ? 1.25 : kind === 'm84' ? 1.1 : kind === 'ozm_pop' ? 0.22 : 1;
      /* громкость: взрыв слышно далеко — спад мягче, чем у шагов и ударов */
      const g = U.clamp(7 / Math.max(7, d), 0.07, 1) * Math.min(1.25, 0.55 + 0.45 * big);
      /* воздух глушит верх с расстоянием */
      const lpF = U.clamp(16000 / (1 + d * 0.05), 1200, 16000);
      const out = A.spatial({ pan: q.pan, gain: g, lp: lpF });
      const t = A.now(0.002 + (q.delay || 0));
      if (kind === 'm84') {
        /* M84: 170–180 дБ без осколков — сухой, очень резкий хлопок,
           короткое тело и долгое эхо от леса; без осыпи земли */
        A.nz(t, 0.016, { type: 'highpass', freq: 1400, q: 0.5, gain: 1.25, atk: 0.0003, wet: 0.75, echo: 0.75, out });
        A.nz(t, 0.04, { type: 'bandpass', freq: 3600, q: 0.6, gain: 0.8, atk: 0.0004, wet: 0.6, echo: 0.6, out });
        A.nz(t + 0.001, 0.32, { type: 'lowpass', freq: 2400, freq2: 160, q: 0.8, gain: 0.85, atk: 0.0015, wet: 0.8, echo: 0.7, out });
        A.osc(t, 0.3, 120, 38, 0.55, 'sine', { atk: 0.002, out });
        A.nz(t + 0.05, 2.2, { type: 'lowpass', freq: 900, freq2: 120, q: 0.6, gain: 0.3, atk: 0.1, wet: 0.95, echo: 0.7, out });
        return;
      }
      if (kind === 'ozm_pop') {
        A.nz(t, 0.07, { type: 'lowpass', freq: 900, freq2: 240, q: 0.8, gain: 0.7, atk: 0.0012, wet: 0.35, out });
        A.osc(t, 0.12, 150, 55, 0.4, 'sine', { out });
        A.nz(t + 0.005, 0.03, { type: 'bandpass', freq: 2200, q: 1.2, gain: 0.18, atk: 0.0008, out });
        return;
      }
      /* фронт ударной волны: широкополосный треск */
      A.nz(t, 0.022 + 0.01 * big, { type: 'highpass', freq: 900, q: 0.5, gain: 1.0, atk: 0.0004, wet: 0.6, echo: 0.5, out });
      A.nz(t, 0.05, { type: 'bandpass', freq: 2600, q: 0.7, gain: 0.55, atk: 0.0006, wet: 0.5, out });
      /* тело взрыва: низкий удар, спадающий по частоте */
      A.nz(t + 0.002, 0.55 + 0.35 * big, { type: 'lowpass', freq: 1400, freq2: 110, q: 0.9, gain: 1.0, atk: 0.003, wet: 0.7, echo: 0.55, out });
      A.osc(t, 0.5 + 0.4 * big, 78, 26, 0.9, 'sine', { atk: 0.004, out });
      A.osc(t + 0.004, 0.28, 140, 45, 0.45, 'triangle', { out });
      /* раскат: отражения от леса, хвост с завыванием низа */
      A.nz(t + 0.06, 1.6 + 1.2 * big, { type: 'lowpass', freq: 600, freq2: 90, q: 0.6, gain: 0.32, atk: 0.12, wet: 0.9, echo: 0.6, out });
      if (kind === 'ozm' || kind === 'tm' || kind === 'm67') {
        /* осколки: короткие свисты и щелчки по стволам и земле */
        const nf = kind === 'ozm' ? 26 : kind === 'm67' ? 22 : 10;
        for (let i = 0; i < nf; i++) {
          const ti = t + 0.01 + Math.random() * 0.35;
          if (Math.random() < 0.45)
            A.nz(ti, rnd(0.03, 0.09), { type: 'bandpass', freq: rnd(3500, 6500), freq2: rnd(1800, 3000), q: 4, gain: rnd(0.03, 0.08), atk: 0.004, out });
          else
            A.nz(ti, 0.012, { type: 'bandpass', freq: rnd(1200, 3200), q: 2.5, gain: rnd(0.05, 0.14), atk: 0.0005, wet: 0.4, out });
        }
      }
      /* осыпь: земля, хвоя и комья падают 0,3–2 с */
      const nd = kind === 'ozm' ? 14 : kind === 'm67' ? 12 : 34 * big;
      for (let i = 0; i < nd; i++) {
        const ti = t + 0.3 + Math.pow(Math.random(), 0.8) * 1.7;
        if (Math.random() < 0.7)
          A.nz(ti, rnd(0.008, 0.02), { type: 'bandpass', freq: rnd(1500, 4200), q: 1.8, gain: rnd(0.012, 0.045), atk: 0.0006, out });
        else
          A.nz(ti, rnd(0.03, 0.06), { type: 'lowpass', freq: rnd(250, 520), q: 0.8, gain: rnd(0.05, 0.14), atk: 0.002, out });
      }
      A.nz(t + 0.35, 1.4, { type: 'bandpass', freq: 2400, q: 0.5, gain: 0.03 * big, atk: 0.25, out });
    };
    /* Оглушение: k — 0…1 (1 — разрыв в шаге). Сразу после удара слышно
       только низ и звон, слух возвращается за 3–6 с. */
    A.deafen = function (k) {
      if (!ready() || !A.deafLP) return;
      k = U.clamp(k, 0, 1);
      if (k < 0.05) return;
      const ctx = A.ctx, t = ctx.currentTime;
      const f = A.deafLP.frequency, g = A.deafG.gain;
      const fLow = 20000 * Math.pow(350 / 20000, k);
      f.cancelScheduledValues(t); f.setValueAtTime(Math.min(f.value, 20000), t);
      f.exponentialRampToValueAtTime(Math.max(300, fLow), t + 0.06);
      f.setTargetAtTime(20000, t + 0.4 + 1.2 * k, 0.9 + 1.4 * k);
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(1 - 0.75 * k, t + 0.08);
      g.setTargetAtTime(1, t + 0.3 + 0.8 * k, 0.7 + 1.2 * k);
      /* та же глухота — для шины своего оружия (она идёт мимо общего тракта) */
      if (A.gDeafLP) {
        const f2 = A.gDeafLP.frequency, g2 = A.gDeafG.gain;
        f2.cancelScheduledValues(t); f2.setValueAtTime(Math.min(f2.value, 20000), t);
        f2.exponentialRampToValueAtTime(Math.max(300, fLow), t + 0.06);
        f2.setTargetAtTime(20000, t + 0.4 + 1.2 * k, 0.9 + 1.4 * k);
        g2.cancelScheduledValues(t); g2.setValueAtTime(g2.value, t);
        g2.linearRampToValueAtTime(1 - 0.75 * k, t + 0.08);
        g2.setTargetAtTime(1, t + 0.3 + 0.8 * k, 0.7 + 1.2 * k);
      }
      if (k > 0.35) {
        /* звон: тонкий тон 3,6–4,2 кГц мимо глухоты, медленно гаснет */
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(rnd(3600, 4200), t);
        o.frequency.linearRampToValueAtTime(rnd(3500, 4100), t + 5);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.0001, t);
        og.gain.exponentialRampToValueAtTime(0.012 * k, t + 0.25);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 2.5 + 4 * k);
        o.connect(og); og.connect(A.post);
        o.start(t); o.stop(t + 7);
      }
    };

    /* ------------------------------------------------------- выстрел -- */
    A.shot = function (opts) {
      if (!ready()) return;
      const o = opts || {};
      const t = A.now(0.001);
      const supp = o.suppressed ? 0.42 : 1;   // глушитель режет фронт и хвост
      const v = (o.vol === undefined ? 1 : o.vol)*((globalThis.AEGIS_SETTINGS||{}).shots??1);

      /* фронт: широкополосный щелчок */
      A.nz(t, 0.030, { type: 'highpass', freq: 1500, q: 0.6, gain: 0.95 * supp * v, atk: 0.0006, wet: 0.5, echo: 0.42 });
      A.nz(t, 0.012, { type: 'bandpass', freq: rnd(3200, 4400), q: 1.0, gain: 0.72 * supp * v, atk: 0.0004 });
      /* тело: пороховой «бум» */
      A.nz(t + 0.001, 0.115, { type: 'lowpass', freq: 640, freq2: 180, q: 0.9, gain: 0.85 * v, atk: 0.0022, wet: 0.55, echo: 0.5 });
      A.osc(t, 0.090, 138, 46, 0.52 * v, 'sine', { wet: 0.4, echo: 0.3 });
      A.osc(t, 0.045, 260, 88, 0.28 * supp * v, 'triangle', { wet: 0.3 });
      /* мех: лязг затворной рамы */
      A.nz(t + 0.014, 0.045, { type: 'bandpass', freq: 2350, q: 2.0, gain: 0.30 * v, wet: 0.3 });
      A.nz(t + 0.036, 0.040, { type: 'bandpass', freq: 1580, q: 1.6, gain: 0.26 * v, wet: 0.28 });
      /* хвост: раскат по участку */
      A.nz(t + 0.045, 0.62, { type: 'lowpass', freq: 900, freq2: 220, q: 0.7, gain: 0.20 * supp * v, atk: 0.02, wet: 0.85, echo: 0.6 });
    };

    /* шаг другого бойца — с его места: весь граф шага уходит в узел
       пространства вместо общего «сухого» выхода */
    A.stepAt = function (sp, vol, run, side) {
      if (!ready()) return;
      const out = A.spatial(sp), dry = A.dry;
      A.dry = out;
      try { A.step(false, vol, run, side); } finally { A.dry = dry; }
    };
    /* v6: слой поверхности под шагом — поверх записанного шага бойца.
       Грязь — «чвак» (низкий шум с опускающимся фильтром) и отрыв подошвы
       через ~90 мс; вода — всплеск и пузыри; трава — шорох по голенищу;
       сухая хвоя — хруст, иногда сломанный сучок. Сырость глушит хруст. */
    A.surfStep = function (sp, surf, run, vol) {
      if (!ready() || !surf) return;
      const out = sp ? A.spatial(sp) : A.dry, v = (vol === undefined ? 1 : vol) * (0.75 + 0.45 * (run || 0));
      const t = A.now(0.004 + (sp && sp.delay ? sp.delay : 0));
      const k = surf.k === undefined ? 1 : surf.k;
      if (surf.kind === 'mud') {
        A.nz(t, 0.16, { type: 'lowpass', freq: 950, freq2: 240, q: 1.6, gain: 0.20 * k * v, atk: 0.006, out, wet: 0.15 });
        A.osc(t + 0.004, 0.07, 170, 85, 0.05 * k * v, 'sine', { out });
        A.nz(t + rnd(0.08, 0.11), 0.07, { type: 'bandpass', freq: 520, freq2: 1300, q: 3.2, gain: 0.10 * k * v, atk: 0.004, out });
      } else if (surf.kind === 'water') {
        A.nz(t, 0.20, { type: 'highpass', freq: 1100, q: 0.6, gain: 0.16 * v, atk: 0.004, out, wet: 0.25 });
        A.nz(t + 0.01, 0.09, { type: 'bandpass', freq: 2400, freq2: 1500, q: 1.1, gain: 0.12 * v, out });
        for (let i = 0; i < 3; i++) {
          const f = rnd(500, 900);
          A.osc(t + 0.05 + i * rnd(0.03, 0.06), 0.03, f, f * 1.9, 0.025 * v, 'sine', { out });
        }
      } else if (surf.kind === 'grass') {
        A.nz(t - 0.05, 0.24, { type: 'bandpass', freq: rnd(3000, 4200), q: 0.7, gain: 0.05 * k * v * (1 + (surf.wet || 0) * 0.4), atk: 0.06, out });
      } else {
        const dry = 1 - Math.min(1, (surf.wet || 0) * 1.3);
        A.nz(t, 0.05, { type: 'bandpass', freq: rnd(1500, 2300), q: 0.9, gain: 0.05 * v * (0.4 + 0.6 * dry), atk: 0.002, out });
        if (surf.twig && dry > 0.3) {
          A.nz(t + 0.01, 0.012, { type: 'highpass', freq: 2600, q: 0.7, gain: 0.30 * v, atk: 0.0004, out, wet: 0.3 });
          A.nz(t + 0.012, 0.035, { type: 'bandpass', freq: rnd(800, 1200), q: 4, gain: 0.16 * v, atk: 0.0006, out });
          A.nz(t + rnd(0.025, 0.045), 0.010, { type: 'highpass', freq: 3200, q: 0.7, gain: 0.16 * v, atk: 0.0004, out });
        }
      }
    };
    /* v6: скрип ствола на ветру. Механизм — «stick-slip» (трение
       волокон): пачка коротких импульсов 25–60 Гц с плавающим шагом
       через две узкие форманты корпуса ствола (≈ 450 и 1250 Гц). */
    A.creak = function (k, pan) {
      if (!A.ctx || !A.amb || !A.on) return;
      const ctx = A.ctx, t = ctx.currentTime + 0.05, dur = rnd(0.7, 1.8), f0 = rnd(28, 55);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.linearRampToValueAtTime(f0 * rnd(0.7, 1.5), t + dur * 0.6);
      o.frequency.linearRampToValueAtTime(f0 * rnd(0.6, 1.2), t + dur);
      const b1 = ctx.createBiquadFilter(); b1.type = 'bandpass'; b1.frequency.value = rnd(380, 560); b1.Q.value = 5;
      const b2 = ctx.createBiquadFilter(); b2.type = 'bandpass'; b2.frequency.value = rnd(1050, 1450); b2.Q.value = 7;
      const g = ctx.createGain(), gv = 0.03 * (k || 1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gv, t + dur * 0.35);
      g.gain.setValueAtTime(gv, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(b1); o.connect(b2); b1.connect(g); b2.connect(g);
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (p) { p.pan.value = pan || 0; g.connect(p); p.connect(A.amb); } else g.connect(A.amb);
      if (A.conv) { const w = ctx.createGain(); w.gain.value = 0.4; g.connect(w); w.connect(A.conv); }
      o.start(t); o.stop(t + dur + 0.05);
    };
    /* v6: дождь — два шумовых слоя (шипение и шлепки по хвое) и редкие
       крупные капли с веток. k 0..1 */
    A.rain = 0;
    A.setRain = function (k) {
      A.rain = U.clamp01(k || 0);
      if (!A.ctx || !A.amb) return;
      const ctx = A.ctx, t = ctx.currentTime;
      if (!A._rain) {
        const mk = (type, f, q) => {
          const s = ctx.createBufferSource(); s.buffer = A.nb; s.loop = true;
          const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
          const g = ctx.createGain(); g.gain.value = 0;
          s.connect(fl); fl.connect(g); g.connect(A.amb); s.start(0, Math.random() * 2);
          return g;
        };
        A._rain = { hiss: mk('highpass', 3200, 0.5), patter: mk('bandpass', 1100, 0.6), low: mk('lowpass', 380, 0.5) };
        const drip = () => {
          if (A.rain > 0.02 && A.ctx.state === 'running' && A.ambOn !== false) {
            const n = 1 + (Math.random() * 3 * A.rain | 0);
            for (let i = 0; i < n; i++) {
              const tt = ctx.currentTime + Math.random() * 0.25, f = rnd(1800, 4200), pan = rnd(-0.9, 0.9);
              const o = ctx.createOscillator(); o.type = 'sine';
              o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * 0.55, tt + 0.03);
              const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, tt);
              g.gain.exponentialRampToValueAtTime(0.012 * A.rain, tt + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.04);
              const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
              o.connect(g); if (p) { p.pan.value = pan; g.connect(p); p.connect(A.amb); } else g.connect(A.amb);
              o.start(tt); o.stop(tt + 0.06);
            }
          }
          setTimeout(drip, A.rain > 0.02 ? rnd(60, 260) / (0.3 + A.rain) : 800);
        };
        drip();
      }
      A._rain.hiss.gain.setTargetAtTime(0.022 * A.rain, t, 1.2);
      A._rain.patter.gain.setTargetAtTime(0.030 * A.rain, t, 1.2);
      A._rain.low.gain.setTargetAtTime(0.020 * A.rain, t, 1.2);
    };
    A.dryFire = function () {
      if (!ready()) return;
      const t = A.now(0.001);
      A.nz(t, 0.020, { type: 'bandpass', freq: 2700, q: 3.0, gain: 0.30, atk: 0.0006 });
      A.osc(t, 0.030, 420, 190, 0.10, 'square');
    };

    /* --------------------------------------------------- перезарядка --
       Прежние звуки строились на синусах и треугольниках с медленным спадом —
       ухо слышало их как колокольчики. Металл звучит иначе: очень резкая
       атака (доли миллисекунды), плотный шумовой удар и НЕгармоничные
       призвуки, которые гаснут за 30–60 мс. Поэтому здесь всё собрано из
       узкополосного шума, а тональные слои — короткие и приглушённые. */

    /* Удар металла о металл.

       ДОБРОТНОСТЬ ОГРАНИЧЕНА. Деталь оружия закреплена в ствольной коробке и
       зажата рукой — она не может звенеть как камертон. Узкий фильтр (Q = 7…11)
       именно это и делал: чем выше Q, тем дольше «висит» тон, и стук
       превращался в звоночек. Здесь Q держится в районе 2,5–4: слышен удар и
       характер металла, но без послезвучия.

       Частоты сдвинуты вниз и разведены нецелыми отношениями (1,47 / 2,09):
       у реальной железки обертоны негармоничные, поэтому слух не собирает
       их в «ноту». */
    function clack(t, o) {
      const g = o.gain === undefined ? 0.3 : o.gain;
      const f = (o.freq || 2000) * 0.78;
      const q = Math.min(o.q === undefined ? 3.0 : o.q * 0.38, 4.0);
      const dur = (o.dur || 0.030) * 0.85;
      A.nz(t, dur, { type: 'bandpass', freq: f, q: q,
        gain: g, atk: 0.0004, wet: o.wet === undefined ? 0.12 : o.wet * 0.7 });
      A.nz(t + 0.001, dur * 0.6, { type: 'bandpass', freq: f * 1.47,
        q: q * 1.15, gain: g * 0.40, atk: 0.0003 });
      A.nz(t + 0.002, dur * 0.4, { type: 'bandpass', freq: f * 2.09,
        q: q * 1.3, gain: g * 0.18, atk: 0.0003 });
      /* низ: «тело» детали — основная масса звука, очень короткое */
      A.nz(t, dur * 1.5, { type: 'lowpass', freq: o.body || 420,
        q: 0.7, gain: g * 0.70, atk: 0.0012, wet: 0.10 });
    }

    /* Нажатие защёлки магазина: короткий сухой щелчок пружины. */
    A.magOut = function () {
      if (!ready()) return;
      const t = A.now(0.001);
      clack(t, { freq: 2650, q: 9, gain: 0.30, dur: 0.020, body: 380 });
      /* трение магазина о приёмник — шорох, а не тон */
      A.nz(t + 0.012, 0.075, { type: 'bandpass', freq: 1150, q: 1.1,
        gain: 0.16, atk: 0.006, wet: 0.16 });
    };

    /* Магазин выходит из шахты и падает: глухой удар по грунту. */
    A.magDrop = function () {
      if (!ready()) return;
      const t = A.now(0.001);
      A.nz(t, 0.055, { type: 'bandpass', freq: 780, q: 1.6, gain: 0.26,
        atk: 0.0022, wet: 0.2 });
      A.nz(t, 0.110, { type: 'lowpass', freq: 240, q: 0.9, gain: 0.30,
        atk: 0.004, wet: 0.24 });
      /* Дребезг патронов в коробе. Q снижен с 8 до 1,8: латунь в стальном
         коробе стучит глухо и вразнобой, звенящего тона там нет. */
      for (let i = 0; i < 3; i++)
        A.nz(t + 0.02 + Math.random() * 0.05, 0.020,
          { type: 'bandpass', freq: rnd(900, 1900), q: 1.8, gain: 0.042 });
    };

    /* Новый магазин входит в шахту: удар корпуса + защёлка. */
    A.magIn = function () {
      if (!ready()) return;
      const t = A.now(0.001);
      /* подвод и удар о приёмник */
      A.nz(t, 0.045, { type: 'lowpass', freq: 520, q: 0.9, gain: 0.34,
        atk: 0.0018, wet: 0.2 });
      clack(t + 0.004, { freq: 1850, q: 6, gain: 0.34, dur: 0.028, body: 460 });
      /* характерный для АК доворот и щелчок фиксатора */
      clack(t + 0.052, { freq: 3100, q: 11, gain: 0.30, dur: 0.018, body: 340 });
    };

    /* Затворная рама на возврате: тяжёлый лязг с металлическим звоном. */
    A.boltRelease = function () {
      if (!ready()) return;
      const t = A.now(0.001);
      /* рама идёт вперёд — шорох пружины */
      A.nz(t, 0.035, { type: 'bandpass', freq: 2400, q: 2.2, gain: 0.22, atk: 0.001 });
      /* удар в переднее положение: главный акцент */
      clack(t + 0.030, { freq: 1450, q: 5, gain: 0.62, dur: 0.045, body: 300, wet: 0.3 });
      A.nz(t + 0.030, 0.140, { type: 'lowpass', freq: 300, q: 0.9, gain: 0.42,
        atk: 0.0016, wet: 0.3 });
      /* Послезвучие ствольной коробки. Было Q = 9 на 3,6 кГц — ровно тот
         «звоночек» в конце перезарядки. Теперь это короткий широкий призвук. */
      A.nz(t + 0.036, 0.055, { type: 'bandpass', freq: 2100, q: 2.0, gain: 0.075, atk: 0.001 });
    };
    A.selector = function () {
      if (!ready()) return;
      const t = A.now(0.001);
      /* Переводчик огня АКМ: сухой щелчок штампованной пластины по коробке.
         Тональный слой убран — он давал музыкальный призвук. Фильтры широкие
         (Q < 1), иначе на хвосте остаётся различимая высота тона. */
      A.nz(t, 0.016, { type: 'highpass', freq: 1200, q: 0.5, gain: 0.30, atk: 0.0004 });
      A.nz(t, 0.024, { type: 'lowpass', freq: 520, q: 0.6, gain: 0.15, atk: 0.0009 });
    };

    /* -------------------------------------------------------- гильза -- */
    A.caseHit = function (v) {
      if (!A.on || !A.ctx) return;
      const t = A.now(0.001);
      const g = 0.075 * U.clamp(v, 0.15, 1);
      /* Гильза о грунт: латунь по земле стучит глухо. Q снижен с 6,5 до 2,2,
         иначе каждая гильза давала отчётливый звон. */
      A.nz(t, 0.024, { type: 'bandpass', freq: rnd(1500, 2600), q: 2.2, gain: g, wet: 0.16 });
      A.nz(t + 0.004, 0.016, { type: 'highpass', freq: 4200, q: 0.7, gain: g * 0.32, wet: 0.12 });
    };

    /* --------------------------------------------------------- шаги --- */
    /* Берц по лесной подстилке (хвоя, сухие листья, веточки поверх грунта).
       Строение — как у footstep() из bodycam_angar.html, но под лес:

       шаг  — пятка: глухой удар грунта (короткий тон 110→55 Гц + низкий
              шум), через 55–85 мс перекат на носок; подстилка трещит серией
              коротких щелчков 1,8–4,5 кГц — хвоя и листья ломаются под
              подошвой; изредка хрустит веточка;
       бег  — стопа ставится на середину: один тяжёлый удар (105 кг с бронёй),
              хруст короче и гуще, бронежилет и подсумки подпрыгивают
              (глухой удар 380–560 Гц), магазины в подсумках постукивают,
              ткань шуршит.
       Тонов с долгим спадом нет: через подъём присутствия у микрофона они
       превращаются в «тик-тик». side — правая/левая нога: у ног немного
       разный тембр, шаги не звучат как копия друг друга. */
    function litter(t0, span, count, gain, lo, hi) {
      for (let i = 0; i < count; i++) {
        const t = t0 + Math.pow(Math.random(), 1.6) * span;
        A.nz(t, rnd(0.008, 0.022), { type: 'bandpass', freq: rnd(lo, hi), q: rnd(0.9, 1.6),
          gain: gain * rnd(0.45, 1), atk: 0.0006 });
      }
    }
    /* Записи шагов (CC0): Kenney «Impact Sounds» — трава; Fantozzi — грунт/песок
       (OpenGameArt); снаряжение — ткань и кожа (OpenGameArt, CC0). Моно 22 кГц MP3. */
    const STEP_SND = {"g": ["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"], "d": ["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gr8fj3gBGzmfV5P4Go0u4V8e/r97xfHtbGcaxXP3q2N43b/WtY3qubY3n+2PvH+cT4d0y9+t7+f7fXt8bYq+GK6K//8L8BYTSsL6FQiR4hCEL///ZmZmZlVVAQESv/9VVY////qqqs3+zMvGZmZlVVVVVWZuMwYCUv9gIP/zUMQwGhH+XEnBGAElL6oUBAWigoK7woK6DBQUFBWQUd8YKCn/iK8KCeBQ3/8K///wUb0Fd4UFBQVf/yO////CgoJBQVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/81LEPAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==", "SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjEuMTAwAAAAAAAAAAAAAAD/83DAAAAAAAAAAAAASW5mbwAAAA8AAAAOAAAH2gAnJycnJycnODg4ODg4OElJSUlJSUlZWVlZWVlZampqampqant7e3t7e3uLi4uLi4uLnJycnJycnJysrKysrKysvb29vb29vc7Ozs7Ozs7e3t7e3t7e7+/v7+/v7/////////8AAAAATGF2YzYxLjMuAAAAAAAAAAAAAAAAJAN3AAAAAAAAB9ps70S/AAAAAAAAAAAAAAAAAP/zUMQAElgCkY9AGADdGQBFCaD74OAgCAIZQEDnBAMZQEDJQMCc+D8EHCQ4XB/ggCAJg+8pgg7+oEAQ+XB/KHIPg+CDv8EP9QIBj4IO0h//8EAQOU5d6tdU83omWyIAgCAhBhaighWAvEDeomHTQkCCTNgAHDZc9DCcIla6elYcYDn/81LEKySjcupdiTAAAlpNHjWxPngPYMltytMhsvK8xhTbb3O9s9+Mu9GCQI8cCiKKNKrX/7IR9ff4zLJCbkqST1aIKCU2b+zdrf9su9z/e99uTBgkqTnqW7s3zv97N/9+/7l+2/fb+R/v//NPHqSzfBsXHJqGvKgBKP6I46KjD3tdWP/zUsQOHanGyi3GMAFVBWlmpq7IHoUy4n6j71RZYmfcUfi0d9Obmvhro742+7z+77XtyLqtCeim+/H7v9/7/9/3Nin7WpI5XK4zRYd5QQpsrdnjQ78fV5zX8f/PX65wq9NWRvA0F7bsTtGv/BC9pq/+78ccct2EQkTkEAAzHkFFUYUb//NQxA0cKzK+zkmGXFteSUVIRW6XRRhKjlZmwfLPUSwUkl/G6tibkRotgMBrndYdkMwZMRfa8+vM84ZP5z/2zdPkZVhEdqHzzpluvKcUv//npxv5zpTTb7zLKX8i/vsXhadcNnhCe+hQpBuptZorpIrpu2pAqAtCxTPGiGtpAcB6Xv/zUsQRHeMivkxAR+kuhQhCANByponOhFlZVVMc1zyhQ5TIReasbrR48aLDCVl4xnNS798Wtj7OnemiqvqvhNPl47zJf+A+ABNSpgQYA7xip5QdCxDDOnqbVEz83OtTEwMQYWtwAwVkD/7W/3c/6WjHX93a6rt+SRAAZi37zAMyRBSz//NSxA8dEX7CNmGGnYeRrqBnyuRh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"], "c": ["SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjEuMTAwAAAAAAAAAAAAAAD/83DAAAAAAAAAAAAASW5mbwAAAA8AAAAMAAAG1QAtLS0tLS0tLUBAQEBAQEBAVFRUVFRUVFRnZ2dnZ2dnZ2d6enp6enp6eo2NjY2NjY2NoKCgoKCgoKCgs7Ozs7Ozs7PGxsbGxsbGxtnZ2dnZ2dnZ2ezs7Ozs7Ozs//////////8AAAAATGF2YzYxLjMuAAAAAAAAAAAAAAAAJANZAAAAAAAABtWpk7YtAAAAAAAAAAAAAAAAAP/zUMQAE1he1BdJGABanJH73wQEAoFAbFbdKIECBATo0aNsHwfBAEJQEwffggYy5/LggcwGD4P4IAgCAABMH3+UOf/4YyhkHwfB94IAgGP+IATB9////EDv/Sp6DC6aMNJrACgYUDNmoWBlWUtDJl1RbfNEp5BSOm/NsLlAuLDRyer/81LEJyPRysABmWAAZKCRWE+MGCAboRmerrDqWka1nHIqQvLdMF78T2ztpg7Yq0Yn5q9DM/HRx52kdq2m8z71HllHL3l9ypoNgFahwPOctMAiYKWJYt55YNWkazbUuhFg9xxJNynrYwSsZInrPpe5ISbOJ3Lq7pySSXbVZ8diGBMRyv/zUsQNHWwW2F/MEABAcCtCEhQ2/Sm8vcYrf2OJOcIwerkhxyFUDDjjKeKZkdQIIU5CWI7kJIr5TFKjneDZX9VNR7o5mettpKttRGpp852p9VlpbfkXsTZHfV/XdvdKJc8h1+WhWshXZu8iaaJSq9a8z1f16jVAGP6nJE5LVQEpRclA//NQxA0dSf7aPkjFhFAklOgiyRCZVDdvVjGmos6lWqy3f8hCe3Lu3x+u3Pu5UczGL/srD6V6kIoRmk8kWsoRVmSbfRuW9pE7xIYXZCDp8VHUiEgAibzFLaGPXUKsIsSsXWoVeUacBKDhYJNLvLXDHFqaChPIKgGRIwASEZlcpXPBnf/zUsQMG6livYxhhlhSE3TGMXZJ9LK3T4NrTsLmpJB5Ars8wVtFCocV8ZBUDRUISbbCs9pmLlz2NiGDU2cB2Hi51pISoMCp8WagQvgGHzSiQZNpkolWKGFtIobW1W3v6nt26WNF+KKSKGzdrExMGVWBqUBGXKoy4bgTJZMlfTgQaest//NSxBMaSoq9bEmGfGz37hypbD5QSO+XuRiDtQtRzoklJFqa5u15l1cjkBSypEQ9ILOz2O67EjZfC4hcmkLvZw/hl/M8in53RW8yhhUya6nWJK2bNSUknXt9alscre8/YizGqkW6GoEWqCkOFhrErSVKdAwWgkYqsO5Bd0EPD3Z6Qsr/81DEHxnxEsWUEYYYKl2GcBOuIuEcZFvuLMGh5YUQKPNEQ05SyJSpsiRGmR28XtvOAM+IFOFRCByJhJBhSB1mzQ4WRtoTtjEWRT0n9yRXLJjBj6mULpOhpVEqgYA1J9hiRRsuig9sQ7lV1yka9Qx7rLrSyksbpmaORZM+gU5mL1FX//NSxCwaYj7AwkmGXJXz8yLHl5meXGp8j2TvIXSPiz19zGRZuZHKe3VHatwxB9p+gupRZY0Xe+xxxNrZ16q/eYjH6HDHbCDAGtCqz6A0oCLEQcHMU0ChhFwQUSJBi0KuIWjmfsRhgYYGm6w1kpMM1zeicERKSspTp15lZ88IHzgqChX/81DEOBlRdsTEGEdAvE0WNoKC9qSIXDLXhIs0VdeXi6D4mU48x0yr/tMqU1C9r2v3qDyRa15YMyzqqsuq7hARLUQngmNSEIw8QCpLIFmsSHbSQUOfDK1HqNhk85VclJpvlGZw6ZUeBIsHVhoNCIGmpLHvgqIgMDT88sGljIMkeo8o//NSxEcaMNq5nmJMBPNZKgq9FT9nqPBR4KgIt5JYaEWNO4p+jrfCbhCmemw6KEYEU1G5CfHMQpPiaiQAZWuuciSJJjFZnzkxdOhKLVzkUf0BRqBCh5YOyIlDR3iUadBqGhKWPcsDXEsVBUNS2p50NCKMBVx74iiUJB3kSUSnVnfEvwX/81LEVBiAmpDOewY0XfEz8sdq+e1jD3UdI517JHiR3SFEFEeD+F3JwXtNO2Eyw0XUnCdKrFl1Jw1pkVnbzL/2djFDBQYJuFRUSYsLsrFRbFhf+LC7KxUW6+Ki2oXZ///iwrr/xUU1CwrioplgkKiqxVlMQU1FMy4xMDBVVVVVVVVVVf/zUMRoFbkB6AB6RIxVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=", "SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjEuMTAwAAAAAAAAAAAAAAD/83DAAAAAAAAAAAAASW5mbwAAAA8AAAAMAAAG1QAtLS0tLS0tLUBAQEBAQEBAVFRUVFRUVFRnZ2dnZ2dnZ2d6enp6enp6eo2NjY2NjY2NoKCgoKCgoKCgs7Ozs7Ozs7PGxsbGxsbGxtnZ2dnZ2dnZ2ezs7Ozs7Ozs//////////8AAAAATGF2YzYxLjMuAAAAAAAAAAAAAAAAJAN2AAAAAAAABtUzzlLuAAAAAAAAAAAAAAAAAP/zUMQAGfiexA1MGACC13vf2CQJANAaATA+T7HBgYEgmCWJZPMz9evXvgCIiIiCAMDc/E4IBiUBMHz5cHwQBAEAQBMH+CAIAgCAJg+D4fxACBz/8H3+XB8P7un6gQBABg/xnxOH//UCGAwfB9/BBxcHwfB8PoIBEz0A0Ws0lLUz2kL/81LEDR0ZssgBmWAAmRP/NBwy6p6va6ZJHz9CWbiG2SAZr6t60NJaLRiXXEP0XrLvGCurru7uWWwJK2ZtTpr97z23f6dtSj1vtsb03+f+f/azRzGIuMBgOlyo5MXpeyol/IvCqdlf++rnkMkiwUPmWf6v/XUKtYPw9iDDKEMPwb4N8P/zUsQOHPD2vA3PSAADAViVNMsdnlKvIbHHu8eSw6RromDE2Z6u9jGlxOk9hiKW7LPJaM23iASAgODDZcYDQnMJPiEgABQiJAmfJ2spJtaNecNocOhANS8pK4BeKVmGNqdQ9LehEyM3Edb29ysclamDLK3ASbW2fXbbfxAb4SR4+VSm//NQxBAdihLuXnmGfGJ80MSeJFgYk/dpZ5rUc+psflZr5ZaGbvU7ZsxURsAekDNYYKSo9lidmEz4iMTKJM9D0PnwRe1AbxE4bV3/ex9hCgyEUFzEmbC0yJ1vOIYjJylPsx4qoZqcxdc+t62Xl2RDLJhC96oPv2ulX+ILKSgzXx+qVv/zUsQOHcm+1ZR5htEdeVWs9ILJWD+vtgLBxjPN1L8yWOO2IKhLtZEuq2Di9mbOcPLdmrZED2b56cX9TI3M8qaQprjIu/o3/aNTO0Vd6vZrck4R/mT/cDjCds/zlkof6S6xbVnb99PsDgOpv+fez9+R/PhlnO3VACxCgMcLABMA3QbX//NSxAwaUbbNiDBFoC1olJ2B6EhZMrqM/4EXbMlZmQvHy8lKUiKUnMjT/W3bt99vuRB8H5VFXeFoxGhiyQEle51yiAEBAiRaVBYHQIeGiQk8m2o3c01C5FLzR0/ZeV3B6zRfFK/vr+zZShUHCfkKsxxhYEm4KdiZjWUdItcTIrtFGd3/81DEGBmIutGMMkygolpCGSCiRccre6Jg4NRpgyVEZhSyKwqtxI/KxNERIvS/IqWLuW55sWJhJpYWFVDBZxph0AgKSEwJ0rKkBK5zu2tCv+l6vdNXICdqBWoCqgVS/vkJb/EVWhiHE0ZFETB2pm4ytIGSSuY7qbUEkCbRaiLQSdKj//NSxCYZ6P7ONEmGUIMly8NDzQ0l7xh+8AhRLlvyzhwODBYsLBkYQhpqmhJqFkwMWIpM7yVqFsYrTWKi4mQu+XrqZ1M0NY4P64ieSm0pXSOIVx4GSs0bAfIkzTw2ukFMUlV+iklnue1yXKOVAf1ICoMVrLNs2BOno1Inp5cPYUqHPVb/81DENBnRjrSgSYZ0izR2DAnhsPFBQ4oG6njRz1A6ZWLng0HQC55QKIkyoUNwmFRUhDwtISzmT1bfri2jsN1alZCT9TVs9G5ISccRxKGnqsLjq8X3x529ULRTgYy1VG5tqTOpBjAdmq+wNrtxhTnIpRVhSM1zGh6z/bDMLHrF1h0W//NSxEEaeZ6sK0wYAA6SLA0LPFVlQnJhoqSeVMiUYoOiGkidyERaZ5lvxql/Kw6p+Gm3ox0eAAAgAAoIIyEiiDql21KmDf5gFTypfP+RVRbLasA/IN/FfGUFAhyQndTogXQ4AG8LmFIjZRZQ5IrUh5MFoXMR5n4yBATEih0gpdJozLX/81LETSxrcoJNmIgA8nSeLqyPLxMl04mZTEmv5PmZ9RfLg6UC6meJk8Xtav+ZFExI1MqlstIopGxu6DJHUkVXRpf/2Pmp00MzB3NnpmZdPVskZH6KndFBFv//lCgmeWqZJpmRiiiZnDxomdWdnmaw6LWM3VX1ARJBgJtQwEBGFAROGP/zUMQRFhjhcAHDMACJEjhIklppIBEtIgFFjiJEjhxJJyJJI8CoSDieCp0GjwLA0VDRb4aUHViKV/KuEVQdWdV8FVB1YNHhK4OfpqBpYaU3///z06pMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=", "SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjEuMTAwAAAAAAAAAAAAAAD/83DAAAAAAAAAAAAASW5mbwAAAA8AAAAMAAAG1QAtLS0tLS0tLUBAQEBAQEBAVFRUVFRUVFRnZ2dnZ2dnZ2d6enp6enp6eo2NjY2NjY2NoKCgoKCgoKCgs7Ozs7Ozs7PGxsbGxsbGxtnZ2dnZ2dnZ2ezs7Ozs7Ozs//////////8AAAAATGF2YzYxLjMuAAAAAAAAAAAAAAAAJANnAAAAAAAABtVQHB3LAAAAAAAAAAAAAAAAAP/zUMQAFDhezBVJGAAAr+nOdIBQCAIBgExW3RAKBQKCQVitGjbB8HwQBAEAQOZcP+XB8HwfP/8EAQd+UBBygGD4Pg+HwQdp92UAYPg++7pB8Hwff//Sf8EAQOf8uD6MCmDRBh9qihhImb9QKFdF65eDglnQJb3WQ5igrDRNtTNKtG//81LEJCK5psABmXgAF9jJ+NMzl4TBuoYjDou8jOmd8umlq6ttDiYjXlhKvT9mtu8HOL+etd4pvc8OdgzNI2yYmj2m3n6xmWIyUY2h15kHCabhA0aptTglMJW1Cy1qtbPlKKnNz0JC0DFiomM+ugnJ+IH7FQWrVd2T5DjtH+EjCPiHhv/zUsQPHbEGwK3PQAEBCFRdPx38bUd/qXECJqSYMI2dnId7DsL2KRpaSnStoipbjx2cyHMFcQ9NlVbBqYmyePe7wshbeE/M8CkXLfPqo0ymsLpt5n7rq0nf4DIvYvNf/st57zP/7JiH9exP/3w/38+y+7SOUUAb5LpdLbdvbaiEhJSV//NQxA4c4RLuXkmGjQoUSKQaFUCgUbmSiXMnNJHTk2I6GApCUTzZCnJOBmg9raMMOjBdexgJzgMXNDLCnQapN0COlnEWDQ+L95kO0gzC1bb9eX1/2P6sZ2Z9+64u78bP/3IfdNZ/Hul9vyMfydk3S+/3tQmNwAFk0Xl4/B0OSaOvrf/zUsQPHZHaxXJhhtBkurVV2zk8JbNEMJ2VPPKKxBM3kSA19cxBfwASggmZrEyKcNFUxoxNeiQ20VCM4orazgaaKurUET0yOE3q4zFkQyoHogiEDSJxywMGwOGnhQyisOThJ9my/quQhT7I+0+K8qU7YVFKFY0VJCWBoodEBOFEYTEH//NSxA4aQQLJhEmGWNRSZoowZV00wag7Gw/C0HxbHPhA52hLJihEpVM4HYHibAOEAODMYNKlgyJxQDCx9waDJ44FnZwyoS0kUQo9JueawuWoNrcTBEspqJJaDdT0qfH/QmtuVVMO5GsKeETbIkMoT5pWTDqhI9GsI1Zm7mEEwnTThbv/81DEGxmx9sCgSYaacymou6Mapoi8yZaojWQthMQ1VBfq1kY1L9JNHJtGk+JdT0qVWtT0IEDIleGCxgMIAgFiMcsH1IMH2hU+s3XFpJiE00+5XepNxbvrqX2UgGzggBVzAUsOWigUHIKOPYuTzUELdXZZSTy8HedxrbM1dETQMFQb//NSxCkX8NLA6ksMILQ4BRhphJDRCAQqGzcAgCF2zB4e+Hklj90sZeRQLlQDQYXGIpbWNoXmI2rbq2atvZtaLsTYr6EEc4LFsYpxYUd0INCXMgFRx3Iya+awbUkaprw70eaCempK9/2jkOAywWGPETr0hIFLjJ0NpSKmHKctxRIoIVT/81DEPxmY8r1kMgbIVa5SWIYRcFZZwdfRFbgk9MwlRVCe0VyuuXrdabklkFhUOkVjW7oxKlbHouZaBF8v49aCOvRM26HXGo70k+ZKkcBlo05hIkDAeEKiwdCQKio0aNAKh6DoMgF6ixUSyLiQSFiK2KGkTpsqVa2aJPXS1q6ulYr2//NSxE0ZGKK0w0wwAC182lyeLCyX0qO1KeetQyyFSuEmKu0CtYAhBAFxDmggppNKq5lCEEeECLoPbxy0VEv/xMgvZHE/F4M+DSCWMFmOVBikmvBxKdd0srRCiQn4T7PzjD+M+YDnORcIWZHxb4rh82PlZRZRyyoUOYT9t8f48J7vNs7/81LEXjADwojhmHgA57sC7X1Ao1Uyxld/n5z89610vj+s+d7xdqra9nsKFLSFD//////+p9/VtQa6xvFK4YIjk6VsKCwwId4uZZof/x//////TWY2sa1/vO8U3betfcWd9BpjdrQWqSG4RYz17iUACsAlv81oiPAq4GbqCp0RPOklB//zUMQUDYAB6jfBGABK4it9Xsy3/W7kp7/lf/8is6W7j3rlp0ko8JVuT//1P5GdTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=", "SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjEuMTAwAAAAAAAAAAAAAAD/83DAAAAAAAAAAAAASW5mbwAAAA8AAAAKAAAF0AA1NTU1NTU1NTVMTExMTExMTExMYmJiYmJiYmJiYnl5eXl5eXl5eXmPj4+Pj4+Pj4+Ppqampqampqampry8vLy8vLy8vLzT09PT09PT09PT6enp6enp6enp6f////////////8AAAAATGF2YzYxLjMuAAAAAAAAAAAAAAAAJARRAAAAAAAABdB5QHIBAAAAAAAAAAAAAAAAAP/zUMQAFNCurA1PGACCtP90qpy3k7aSUAG4B2GGZb4vhODIinIaB0IYrGSJr6J+7uAACIgQADAg+D4fKA+D/lAQd4kDH4PygIBjwfNf4EBAEAQ4P/g+//8QBjg+f///+hVELzf0oBTGDZNeTwBaQYhuUeUnkLeTdgaZoegUKTCZgWj/81LEISIaQswrmEgAHm22Dy9EAqKCsIkyElKIy0w+YTZaJIOaexOM0SdpUgT1ac6lbMo7GMvLZse4w3E9avc2FTvYTlkNUz9iUfGcN+f5/f/8blVf+GOgcM7lvUK4BWfV4GoMkBRNfvbrIp+ncXEgySW9UoqgBOy2WWWXfoYTKXnk5f/zUsQOHYDW7l/MGAGy2/CvXxrHPjaRuHjtpgcrhQouIwvVkYnNDgwOIEIAK4EF8uDPQqI1ZJuBGxvifer5POhUWpL36GcObvp/FML2yVzdRjX+7wAGPH5Hs0v92HP7rXd/GcX/6NKYU/81sV5b7zaT02N92oEgDWmCq6OYfT9DSCnM//NQxA4dM0LMTHmGdObCRkrZQGHviRr7Zq/hFqzWLOgV1gxI8hBAeFvOQ2WfAVsPIySPZoZqecKTNr/eu92I28/NO23/oL5tC/KMU/5mU994XOn5WZFtf8jK5faexGflr0sFamidh40beMiApMpEOTtYBaoTkGGFY8mOEGDkoEUeaf/zUsQOGglKzYowh0Ag0oPHKdR0xSs0r6kUkhAMutPzInTmZpYbCkc0nHhVz9O45BAqlgu8wTFD74sHQXdYw0ecs8ReKiZoVUQhkmXcewhPipEJWsYOXHsuYe3u729XZOIEoB3T1YtVAh+gEr0LEepsClbDqUInYDMWiTbUIr11HiiZ//NSxBsYoP7JbEmGaA1YxYMoS4IwaM1NT3wwUTDodETCpJ4FelIFGkXhUJOCz6WOk3mobBAKQkxCDaloa9WlM8ryU+5SANrQ+ilm/2u658WaxyOmhQsllAB+CsQcAGhQJzzghk9s0gbGlz5KdRxmKczqUKViimVwsILKIM5xCDoj+0T/81DELhpLqsD1RhAAMzIRxjkScp0HJcvMnTtPJdbE33o36NWcutG+7t32Klz7f+sule6dOX9ej196ab3+j1wa+UGEiU2KhEyqQC7b/f3rCXX7chwX2Ek1KsA7jMvi8UeN64esPLgHRAIMxEAKgsDkHzQhEEGokBYSIlYNAalHklB4//NSxDkoU565lZhAAHsYHMg1DlxUWaBS1ihwgig5rSxosLMILGicx6Is8fDLDQftKisXxP+08J+pnQ8elns00lw7bcr8/8X720DOlOMuupRJ1lrSo9v+lWpX//pVLt3a2PuhooQ7LSZ1crxfpsNVgfQIVLCq6mAy6AE3JJIxIkAiVPL/81DEDRowdpm/xhAARJEiRIlSXNqt8kSJEiBCnlohBUFQ1EoKgqGolBUNKBUFQVDXBoGnFgaqBoGvKgqCwNSoKns7BUFXKBUNf/BYGj0Sg0DVYLA0/+sFQVOrBU7/LA0DXxEHcTA0+GpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqq//NSxBkAAANIAAAAAKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=", "SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjEuMTAwAAAAAAAAAAAAAAD/83DAAAAAAAAAAAAASW5mbwAAAA8AAAAMAAAG1QAtLS0tLS0tLUBAQEBAQEBAVFRUVFRUVFRnZ2dnZ2dnZ2d6enp6enp6eo2NjY2NjY2NoKCgoKCgoKCgs7Ozs7Ozs7PGxsbGxsbGxtnZ2dnZ2dnZ2ezs7Ozs7Ozs//////////8AAAAATGF2YzYxLjMuAAAAAAAAAAAAAAAAJANXAAAAAAAABtVnEim4AAAAAAAAAAAAAAAAAP/zUMQAFMBixA1JGAA9/efgQAgAADAIAbFekAIAABAEAwCYJisVo0YPg4CAIAgCAPvwcBDEAPg+D4Pg4GMEAfB8/BwEDn8oc/+H/8H3/oB8P5QMeJwfP//7/iAEP/B8H44CJJeDj4wgjBg5ntI+uJcg4eChdrKiqCEZIJSPFaBEceb/81LEIh+hxsgBmWAAANyxLoMKRk6xZOR8NH6CCpQeMDdvruW68xGilc6tY2fnnJzbUo5R2+bnb+zZmZcpl5pPTf4Wuf77O+eLGX0CV7jJe82GhGRaf7vZv96DlJFbfxzWBT/sXcI3Lom1jvuy2XbeoEWHwTLtEgrhDEKq/Q5a5Ba58f/zUsQZIGqy7P/JMADSEEC2GiVKa7ZBz4yre2QPKPG3B5Wu87T+adp93pScFxymSjZ/k/Pf95W7/l5rf7+1b/+7d3Z/rPfx/sS8ffE47Uuqtk3b93f5TNL9ihzTSBigtcdjia2PFUqodntCyB8S7GBwHHsG3XIGnHAXHgaWAOhSLRJH//NQxA0aiS7QBGJGqNLI4EshB+TyW4Zs9JQKpFV3t40SpgEMIKdjiMQQJIH/OS96I0XLJ+DFTQXIBx4oUQXHjS9JCBszpUbJnMN0ueLSlSNaGGlCrniR/6XFGxhmoo1Z4ghCtkWUA7ZO59USFWMhmKj6haEcoh+hrSsaryqsH8QrsP/zUsQXHYJyzCxgxSy5dFj6nmrMGS4lPtPtQRsbuCCp8BjAzIyrjIrm4kMt2P31pIWyiaM/Cqrq7m0rReZnva9nOsyVpu7diFMxs07n2BmxQKPsCLBlUXD4WYsUYop7XNa3+qGrQoY3tWscFmAG5W9NyoXhUiNkMaIhSXYchPBlA9yA//NSxBccSPrhlkmGreToSPqhiW3ZmZCZdLcWZYk9XZzwnEVAUR+9fbApQhtL9TevIGocXAvckwSJ1r7O3d/8tC1bXLOl31POpQk/s3uv3/9qH+vfMe4y+V/3+7f/fmpGQ61L39HzbSoIHUmSbtkFNF9YYbYR+kB2aMGFiCmt0X69M2L/81DEGxn5Itj2SYasbMIlWagtlGdsauoyxgzM0h6q+WoM8eCgCFVgCg85VQDLGFpHKeQKlQ1YwpmxS9R3Q25KlGwpcL0pUkshdj3PeP9afOtkWW2nqQEs8xcXmr5wEwhElkcaRISVCUNLhkyVEqizvcLQFSgYOQUtVl3V1EwUDEy4//NSxCgZASrALEpGFKM3XzUzq5tRVBUiDZ25osdEQfS1jSx5RK+dFt9wNR7jzgKHCrBQKFRE/FYU4Vc7fO5H6/0Ed/eJtiJJSoBVZhoeR5MRwD8abpjZlSevOWeUWRIEnzAmEjjh6W/dJAxKKIkp0rWhicTAzQ1GqwCdvP0cstaUuqf/81DEOhoJtqgsYYaUJ1dWspKuRqG4JBkVUUcqHRDCgUHKLFmXkYKslQVr1XEut3/b/WzqPIVodHz6SypkEQzCfC+OMA9DYcyAH81n+kId82V6rfv59tTMxRjSFUgRyOCNnFlotQY7VwxP7lpRxL+7q9n8rM262ouQcDjhCCTEnIlJ//NSxEYZuTaYBU9IAIfeTEdZJkieCg+tcerbfSoL1LYQykTbmfojd9n1/2fT3wCA2uWprJpIvIz1exl9bY9dMNClTWtWLUtvCmm53BEQKwWslJBUMx8IEoTHUiCXELfgl0kaHrC9ROP6qF7+oDwQtVOMPEtdZZG9OJJPtVLtTNhmYWH/81LEVS7zioz1mHgB///7XEgpJLsD5xmq2Mr5hgvdf4///7GwLptqxMMafOYu8T28ss0+aQ7V//////8Rg1qFDYt0e2iTQI9KQayVu8ix2XWcSXp////////CvFhWrNqG/1JXNJtSRY28X1bPhBgNFlOqqQdKajb/YCFGFAVgEQYUav/zUMQPEJg92F/DGAAkJBwGlhosp93yp0RTpJQdK/3CJTxLPf/oX3Ep4r//kVnREWPCVx4j/iL4NLO71/R/50RKTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=", "SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjEuMTAwAAAAAAAAAAAAAAD/83DAAAAAAAAAAAAASW5mbwAAAA8AAAAKAAAF0AA1NTU1NTU1NTVMTExMTExMTExMYmJiYmJiYmJiYnl5eXl5eXl5eXmPj4+Pj4+Pj4+Ppqampqampqampry8vLy8vLy8vLzT09PT09PT09PT6enp6enp6enp6f////////////8AAAAATGF2YzYxLjMuAAAAAAAAAAAAAAAAJAQZAAAAAAAABdCPlHQLAAAAAAAAAAAAAAAAAP/zUMQAEgBSxBdJGAACSzZBRAgxdG8gAGBsNtpEAoJMUQAgGFg4CAIAgGHn8HAQDHLg+/4Pn//lCgIOQD//E4P/g+D4Pn/64EDH/4PvE7/g/yhz1h+UCFrKzFNGxpQMUW8Xk+zfzg9pZcnd2QyQE4HJJaHkB6UmpPKCQWF6QJTrPjD/81LELSSSZswBmFgAIggRHJipNNikmIyXjso456DalyrXMKHwu90W9G29VbY5dVPpsJn0HXunvlRy5xmz0Djq53Sy/pJXds7+HTXXXxF/FHATEgKmWh9S1hIwxh5p8RkxBEAPws7dVixEWf0dSRZMIvqVWXVklJhnc8NzMKwboNS2Z//zUsQQHoPy4FfMGAGnkUL/nyUirl+Y7QBiBoIYX2BCEGSjhAAnQQm8QIXn7lqTMu9+esUmY6SNdjvJn3yY6x3RmL5l/f+l5FS//y5G/y//8oZ27ND/41/pM1W///Vk89lIp5FCKNrJTIzXb9jCkx//VjUSCy7rJCBUUpUgGJhcOn2Q//NQxAwdAirYVmGGmGolWWmpzdCVrKnSgdFFKDj+gn1XtYXDmoubWCSErDG4tE1C0MLx5mj2IczK5pYh+XL7wi2JypklPeXKOyh0B5FZi0eIThjIRQZFcqoWS5o28egcl2m9fRLL8kHDVdLGCz2FliAbm0WpAKMVcLqS8cRcHhSHlv/zUsQNHJl6yEp7DBROO15tKIBMTqSuucNWCQnhqbZdVfnVmGPUlKTThnQUVNtnjH977ZDsnsbGP82HTjD2QMlOAXIGj7gsZE40LFw4VxaLSDz8gMu4sil1xOJgieD6i7D6FXPIDhunXtXtyI8wDgAawcoiALNomQJkvSbNBO1R/shp//NSxBAagOrIrHmGcBOHJAaJwOCqJUxyYFWHU5gib3MuVsMBZM4mviw0DcIDxE0oFQUHmAWEodCSgKWDVbiq4Kuiq2m7p5Ft8r1oiha5JEgBREkVxdWtLaGUqoX1k7nC7byQpa0XmQIPdIGa2ExSZE8sPL5iPVLd5YZodjMiCMOp8Yz/81DEHBk48tGUewwYEO+kiJxZAmGRgeC0JMtBFKfT5qMsWgsiFSIAURYtgCSlU84eydSAiSntS1sFmzRK5520K7PJGvDwGS1r0to2/XNev9r/Q10j3WkIXGDEYpD02fQipywRf72ljcC5lUtPKKczoEUFogrYQbC5ZqnoU+bUlXmo//NSxCwaESKsA0wwACXyL3e0KHHowshgiaAliowqLC4qIiICFgLbesk8iZrqHERYewqVcDVeo8E6dt9zA6nzv1bOzDRKW2Psa5UgQARhxxAAB7gVUZHcDhEdhYSxSYXwWUsB0nRPCSNznGgJEOZJ/OhFRKAU3V8Wgsxjhul50UWX8fT/81DEOSEzZoBVk2gBjDOZkw2Jy9bf8pkYlSkXDAlzRSJklUlq/5ikJ8TypZqbmyBfc869etda//8xWoxUfNWPmqBmSBdQP/////7mq0p1NjrnD60Zw+eQWUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NSxCkAAANIAcAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=", "SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjEuMTAwAAAAAAAAAAAAAAD/83DAAAAAAAAAAAAASW5mbwAAAA8AAAAMAAAG1QAtLS0tLS0tLUBAQEBAQEBAVFRUVFRUVFRnZ2dnZ2dnZ2d6enp6enp6eo2NjY2NjY2NoKCgoKCgoKCgs7Ozs7Ozs7PGxsbGxsbGxtnZ2dnZ2dnZ2ezs7Ozs7Ozs//////////8AAAAATGF2YzYxLjMuAAAAAAAAAAAAAAAAJANlAAAAAAAABtVrjALKAAAAAAAAAAAAAAAAAP/zUMQAFjBeyLVJGACABr/nPqEAIAgCAoJ26IAoCAICgUCsVo0bYPg+CAIAgCGsHw/UCAIAmD4Pg+HwQBA5SD4PvuKeD4f4gBD4IAh/5QyXB8Hz9QIAgZ8EAQBD//+n/Lg+D4PvqQAS+gS/+7///9BrMAipvMApoDsdLa1v1Ezq2Mn/81LEHCFJquGVj0gAlyA0ayJlVgRFXIjKJfYI0GoUkiku0QSbJm2pEk3Y+dxRzq9n41s7ShGFXlazCPjs2H+oxSY2GQhW+WNgMobcU1xgJoFHSYo9LMgsini51osznWn1oeRWxT6RCLLY09aK1klJDq32+1DVKgWCmtqQkm6sX1Gc5P/zUsQMHMDe1LXPMAHs5y4KBQP2OPaA8Y4e7vqvIjy7QBIOYu0MxJyZNm3uuqNaUhPMAlSqUP/14G9O7qreT/j1HVwSzRK1FvvbjWjXQmQZ5U1f+ojhUhQVv6K4Tff95rEoJa5UVtSbf///Vt7NtTkwj7XYLqqN6LgaFkcRaFJJJrxl//NQxA8agOLYNGGMcAcmA0xc3MyWp9M0agqKKKj6mulkbLwzxeuMR1EYpwcOEUjAohYcUIGBslBAQiNYfU4PpHlTmoMUVZzYrRhiUqvLKCCQvc6JHFK0xiXaBVxPfSoMRBADlBCs++oiXRHqA0B+OkMnPpDx1kDAYJABBFEg7K0Ggv/zUsQaHPmq2MxhhljzEJURBwXyTWCOQeCMgaqRAqzM4/A7klpj51MyMHkqsfIULKmYcrb5CFhAeTIj7pEIQuoGyhh5skfPOQUe8GXqZ30tIqIycdyTNqkWLbY1QFAAqXDw1Qkcmt2vBrgJBCfwQLtbeJpWdOBpLBmsKjQhLKxVZwOE//NSxBwcOZLUKmJGpKjsFYgx8WZihL9OiBdcYIFAi6CKiSUMPH/U6EFsTdK7EpZfScc6GgqbmSS67jzQZadU15aWFuAjdJUMmdgZCTULSLG4F6nkQCech8iAmlg9twqGXTI2pSOKOS23uATh0AnZMlekdgVa1HAYYAHpM2Fng6RUnGb/81DEIRopZt2+MMaUqk+Wxr2eccQrWHG4l58PI1NUokPjWlGzo59S7Kh4cUp6nix1gsoiVqgZ7BCVPIYh4VmIOro3Wm2WXuYv14uKvgIwcI2jRpxNhUUr7aMikdiocBFIGB+OIkeQVgitlGQkiggdx3Xt3VAaYwQKvXrnM/pQczy0//NSxC0aSaawVGJGTE4NR6Z2sfv18/SEiIkMG70OLgwMDBhVR4YKvH51lT5apT6lpCZl/yJWEIrLEWeb30etIFUsVPHVIOpGiyoAGOr225tZJyiTxcXSA4MEoQnjCFdWLNLo/WCbIvOExCclZR8IXb7mRvQfatkxGDYDvFz7XBMNmzb/81DEORoo8sI/SDAAbBoeZW1igmuoUFIhaSaCrzbXmLppxpBxbV2JI7zUtdoZeh3yO3T1txGYM/Q4NCV9gEHppHHCBaeWP9KHAOodxM0koT/bxrPEpFVD0uh3DsMwmsVhifA6PZMKh8G4eDIbSEMSgallmoGxwlEQlEsnHpSPHC9J//NSxEUpKq6llY9YAXYQSBqaUxBd6DqhsSi2XmxaaZNNmE7Oko1Wax+7bxVdVUX1B1U27dcS2v6bFuvjrz1zVz87fvt1Vy390PYyKPRCCqoWpX5VKdPgOTe63yu/cvof6hF//ce+W4cLBv+hKo5YIhZbRYLBGIxIGxGDqE4OZyzoANj/81LEFh/qEupfj1gCJwnyl/OBP1bvyQSgMDtXJruATxRJqwein81lgJiLLn/KTc0bwfs1r/4Nye9Nc3+XS1L//HWfK17euw+81dLYuq///cy0OuzjOnuR5Y1J6geO/vnwzKAPWo9QwRf4gEBcaaA7kQ/woaEUrRAwJQESQYCFUKzN6//zUMQMFlhtwA/DGADGgEBGFARMAgEeBUJAy7iU6Ih50FSwdEpU6DQ86SUHSvwanREIjwKjDwNFQ0IlPErj3lXZ0FVB0SrcIp0koGhKe53f//2aVPEqg4RWdUpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=", "SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjEuMTAwAAAAAAAAAAAAAAD/83DAAAAAAAAAAAAASW5mbwAAAA8AAAAMAAAG1QAtLS0tLS0tLUBAQEBAQEBAVFRUVFRUVFRnZ2dnZ2dnZ2d6enp6enp6eo2NjY2NjY2NoKCgoKCgoKCgs7Ozs7Ozs7PGxsbGxsbGxtnZ2dnZ2dnZ2ezs7Ozs7Ozs//////////8AAAAATGF2YzYxLjMuAAAAAAAAAAAAAAAAJAN0AAAAAAAABtUpavU2AAAAAAAAAAAAAAAAAP/zUMQAGkCSwAVMGABrr39g4EAGgNAaAfJ75wJANAaCQJAjiWTzNevfvcQiIgAACEB/Lg4GJQEAfB8HwfD0EAQBAHwfB8HwcBAEAQd5QMf/jw/+ceJw/4IOicHwfAhzv8oCGD4Pg+D6BACAIBh4f0AgCAIYnB+VBbTSBCV74ZEQzXT/81LEDBppqswBmEgATpl8/WS6hW8qObAYtMRyYbeKUxoB50buRVIjMCEKK9ghLN2RbHEEa3ee1Yklj/t/JeoRvopeMrbqPq4/x9+r/r3rbZGlEz1ehRlsoQT1/v++CDo/+iyln+qKAM+80sSo5pJbdtsmQB5pJhJdGgQYvP7DoG73ev/zUsQYHsLK9b/JKAGeZIuZiFY51AcyYucTezqQrM9kc7om15DscjHeRSHk2rfTb6sxe26dyXdEetls7IxkZXRmfuqMyrZZFRXJOg4pDmEI9CKMIFyRbsrA89LSPdo1imu62Jc0rqw8xoAzgTmGezozAKto6TqRxMhMgviFD1EJEPE0//NQxBMdqQLMNHpMRYZDCEEluTdzGuh1Mg7pUV0cjVrDMijeW01VTjHJ9BaAjg7+3W197RIwxUuITAmySqXKb8vea73fwSCdw/f9ltg7354Kp1t6zn5jz9P9tZjWVxVmKbq48vezs1mAHAPWVvb6leU85egtJaoeh6jdRmRmfq5Czv/zUsQRHoKuxAJ5hpDzwEwQLSC5ORW6WIJGkTrRoC/LeC2VcmzFPg9mMKXpV6MXIogytBnA1JShbEilnYKIlKyVLkbERVaRm2c6fLfNYeVlv/zOe3eNzjAzR47vuIvStgNuVEaGiZyBQSlzpTcBAkXhW91ZsehAoZLBgK9bRIjE8BeC//NSxA0baWbIBHpMLAaJgSOGhQoIoKTG4IdcWE4edvq5WTtPDleFq1D5lZTpPD40mOUxm6hU49b4P9o66w0Kik2TOtNC5NpG4IQ1DYfePPkiliOg+jeWQx7djrx+2xjEpYdwr7LLg4JjxfeXV0IrRTumjcdE4XZAtEPpDwuQJ6caCUr/81DEFRoA8uGWSYZ0ggMo1ArcnXqil0kka2YsGiNFlEOp7tROJ8Sg2YnpFZYSrHkkoW4RhBpsuYc4VHqQTSG2IDIYCcxf00E56VZsU6oApT1tjGnT5AfDRUsMI7KWfYgSSQsmKgCAydMEZKihZEKxuiBFB4JLCJvlweHggPYUm6Ix//NSxCIZ8hLQTEmGiIpErlnD9CpDyddLkDZS9D93s52mZb30P5b3h8OlZIfKW/tvjFggkiFre50+4XvGrxqOcaixCO1DX9TJWw/F1CgAYdsfGjouTkAU1H5onwJTHxGPvKYihLVKMgFE6tlK8HPG3JqKWw69aDiVrIQoqXIFARLKpaz/81DEMBn5rrQKYYaUgXvJIYU8iKbFox9KGThpWQKC500RGODQ4iG4lSMdeCrhL6Tx1S1iw/23T23+Wet3/ocWdWVdrDWAN9NtWm0cUUQMTQzlSrJmBSUpDiPHVZPLCu4wVFGskaD+IJl5zn1cNh6zWNmo5c5ap+TsbX+LQWSKiwqd//NSxD0aYSqgTU8wABOWDgsZlWkwZJPYsGGCcsOGHSk00+4xmEZgOt0xrG6voRqnPc/9riOxtKAw1QIPKAPQW8AuIPXQBoe5SAatuHeFeBon58EvX0g4iTGnj5OZDjKOolKoz+YheFW36lXBy/4+WUligcoh2xy4md85/h7ZJ2TMCZn/81LESSvDupDJj3gAsPW5Tq7///0lf2eP4EaE9XUiibW1xhZ////99XxukOfPrSkXGMwGGj72jZi//////++Y/ve8186v7Rt49qwWWSDrcK81YV////////5frdMU3n79dZ1Ter3ta7FeLB1n/MLM1bS2GC7Al//rpeLB1Z1XyU9ET//zUMQQC4gFuDfAGAASz3rlqg6s6pH+Wlf/////8NKPSP+VcIom/1hpR4qqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo="]};

    /* декодирование при запуске звука; MP3 даёт тишину в начале (задержка
       кодера) — начало звука ищем по порогу и стартуем с него */
    A.stepBufs = null;
    function loadSteps(ctx) {
      const out = { g: [], d: [], c: [] };
      let pending = 0;
      for (const k of ['g', 'd', 'c']) for (const b64 of STEP_SND[k]) {
        pending++;
        const bin = atob(b64), u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const done = (buf) => {
          if (buf) {
            const ch = buf.getChannelData(0);
            let i0 = 0;
            while (i0 < ch.length && Math.abs(ch[i0]) < 0.02) i0++;
            out[k].push({ b: buf, off: Math.max(0, i0 / buf.sampleRate - 0.002) });
          }
          if (--pending === 0 && out.g.length + out.d.length > 0) A.stepBufs = out;
        };
        try {
          const pr = ctx.decodeAudioData(u8.buffer, done, () => done(null));
          if (pr && pr.catch) pr.catch(() => {});
        } catch (e) { done(null); }
      }
    }
    let lastStep = -1, lastGear = -1;
    function playSample(S, t, gain, rate, lpf, wet) {
      const ctx = A.ctx;
      const src = ctx.createBufferSource();
      src.buffer = S.b;
      src.playbackRate.value = rate;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpf; f.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(A.dry);
      if (wet && A.conv && A.dry !== A._dry0) { /* чужие шаги — без отдельной реверберации */ }
      else if (wet && A.conv) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(A.conv); }
      src.start(t, S.off);
    }
    /* Шаг по лесной подстилке: запись (трава или грунт, без повтора подряд),
       высота и громкость с разбросом, правая/левая нога чуть отличаются.
       Бегом — удар тяжелее (второй слой ниже тоном), снаряжение — запись
       ткани/кожи с задержкой. Синтез остаётся запасным вариантом. */
    A.step = function (hard, vol, run, side) {
      if (!ready()) return;
      const SB = A.stepBufs;
      if (SB) {
        const t = A.now(0.001);
        const k = (vol === undefined ? 1 : vol), r = U.clamp01(run || 0);
        const pool = SB.g.concat(SB.d);
        let i = Math.floor(Math.random() * pool.length);
        if (i === lastStep) i = (i + 1) % pool.length;
        lastStep = i;
        const f = rnd(0.9, 1.07) * (side > 0 ? 1.025 : 0.975);
        playSample(pool[i], t, 0.62 * k * rnd(0.85, 1.1) * (1 + 0.35 * r), f * (1 - 0.06 * r), U.lerp(5200, 8500, r), 0.06);
        if (r > 0.3) {
          /* вес бегущего в снаряжении: низкий второй слой */
          const j = (i + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length;
          playSample(pool[j], t + 0.008, 0.45 * k * r, f * 0.78, 1800, 0);
          A.osc(t, 0.085, 92 * f, 44, 0.20 * k * r, 'sine');
        }
        if (SB.c.length && (r > 0.25 || Math.random() < 0.35)) {
          let c = Math.floor(Math.random() * SB.c.length);
          if (c === lastGear) c = (c + 1) % SB.c.length;
          lastGear = c;
          playSample(SB.c[c], t + rnd(0.025, 0.06), (0.10 + 0.32 * r) * k, rnd(0.92, 1.1), 7000, 0);
        }
        if (Math.random() < 0.06 + 0.05 * r) {
          const ts = t + rnd(0.004, 0.03);
          A.nz(ts, 0.012, { type: 'bandpass', freq: rnd(2200, 3200), q: 2.2, gain: 0.09 * k, atk: 0.0004 });
        }
        return;
      }
      stepSynth(hard, vol, run, side);
    };
    function stepSynth(hard, vol, run, side) {
      const t = A.now(0.001);
      const k = (vol === undefined ? 1 : vol);
      const r = U.clamp01(run || 0);
      const v = rnd(0.85, 1.15);
      const f = rnd(0.92, 1.08) * (side > 0 ? 1.04 : 0.96);

      if (r < 0.5) {
        /* пятка */
        A.osc(t, 0.07, 110 * f, 55, 0.26 * k * v, 'sine');
        A.nz(t, 0.05, { type: 'lowpass', freq: 620 * f, q: 0.6, gain: 0.30 * k * v, atk: 0.0012, wet: 0.08 });
        litter(t + 0.003, 0.07, 5 + (Math.random() * 3 | 0), 0.05 * k, 1800, 4200);
        /* перекат на носок */
        const roll = t + rnd(0.055, 0.085);
        A.nz(roll, 0.045, { type: 'lowpass', freq: 880 * f, q: 0.6, gain: 0.12 * k * v, atk: 0.0015 });
        litter(roll, 0.05, 3 + (Math.random() * 2 | 0), 0.035 * k, 2200, 4500);
        /* ткань брюк и куртки */
        A.nz(t + 0.02, 0.09, { type: 'bandpass', freq: 1300 * f, q: 0.6, gain: 0.022 * k, atk: 0.02 });
      } else {
        /* один тяжёлый удар середины стопы */
        A.osc(t, 0.09, 95 * f, 45, 0.44 * k * v * r, 'sine');
        A.nz(t, 0.06, { type: 'lowpass', freq: 780 * f, q: 0.6, gain: 0.42 * k * v, atk: 0.0012, wet: 0.08 });
        litter(t + 0.002, 0.05, 7 + (Math.random() * 4 | 0), 0.065 * k, 1600, 4500);
        /* отталкивание носком: подстилка разлетается */
        A.nz(t + rnd(0.05, 0.07), 0.05, { type: 'highpass', freq: 2600, q: 0.5, gain: 0.03 * k * r, atk: 0.004 });
        /* бронежилет и подсумки подпрыгивают и садятся обратно */
        A.nz(t + rnd(0.04, 0.07), 0.07, { type: 'bandpass', freq: rnd(380, 560), q: 1.1, gain: 0.16 * k * r, atk: 0.002 });
        /* магазины в подсумках */
        if (Math.random() < 0.4) A.nz(t + rnd(0.05, 0.09), 0.02, { type: 'bandpass', freq: rnd(1000, 1400), q: 2.5, gain: 0.035 * k * r, atk: 0.0008 });
        /* ткань и стропы */
        A.nz(t + 0.03, 0.15, { type: 'bandpass', freq: 2200, q: 0.5, gain: 0.03 * k * r, atk: 0.04 });
      }
      /* веточка под ногой */
      if (Math.random() < 0.07 + 0.05 * r) {
        const ts = t + rnd(0.004, 0.03);
        A.nz(ts, 0.012, { type: 'bandpass', freq: rnd(2200, 3200), q: 2.2, gain: 0.10 * k, atk: 0.0004 });
        A.nz(ts + rnd(0.012, 0.03), 0.01, { type: 'bandpass', freq: rnd(1600, 2600), q: 2.0, gain: 0.05 * k, atk: 0.0004 });
      }
    }

    /* Снаряжение на корпусе: нейлон, стропы, подсумки. Тоже без металла. */
    A.gearRattle = function (vol) {
      if (!ready()) return;
      const t = A.now(0.001);
      const v = vol === undefined ? 1 : vol;
      for (let i = 0; i < 2; i++) {
        A.nz(t + rnd(0, 0.06), 0.075, { type: 'bandpass', freq: rnd(600, 1400),
          q: 1.2, gain: 0.026 * v, atk: 0.010 });
      }
    };

    /* Дыхание ртом (как breath() в исходнике): вдох — выше и мягче, выдох —
       ниже и плотнее. k — 0..1, от спокойного до сбитого после бега. */
    A.breath = function (k, inhale) {
      if (!ready() || !(k > 0.02)) return;
      const t = A.now(0.001);
      if (inhale) {
        A.nz(t, 0.30 + 0.1 * k, { type: 'bandpass', freq: rnd(1300, 1600), q: 0.9, gain: 0.05 * k, atk: 0.14 });
      } else {
        A.nz(t, 0.28 + 0.12 * k, { type: 'bandpass', freq: rnd(700, 950), q: 0.8, gain: 0.08 * k, atk: 0.03 });
        A.nz(t, 0.2, { type: 'lowpass', freq: 420, q: 0.7, gain: 0.05 * k, atk: 0.02 });
      }
    };

    /* попадание в мишень: звонкий шлепок картона/стали с задержкой по
       дистанции — звук летит 343 м/с, на 30 м это заметные 90 мс */
    A.targetHit = function (dist, steel) {
      if (!ready()) return;
      const t = A.now(0.001 + U.clamp(dist, 0, 120) / 343);
      const v = U.clamp(1 - dist / 90, 0.2, 1);
      if (steel) {
        A.osc(t, 0.30, rnd(760, 1150), rnd(300, 420), 0.20 * v, 'triangle', { wet: 0.5, echo: 0.4 });
        A.nz(t, 0.12, { type: 'bandpass', freq: 2600, q: 2.4, gain: 0.16 * v, wet: 0.4 });
      } else {
        A.nz(t, 0.055, { type: 'bandpass', freq: rnd(900, 1500), q: 1.4, gain: 0.22 * v, wet: 0.45, echo: 0.3 });
        A.osc(t, 0.07, rnd(180, 280), 90, 0.10 * v, 'sine', { wet: 0.3 });
      }
    };

    A.targetFall = function (dist) {
      if (!ready()) return;
      const t = A.now(0.35 + U.clamp(dist, 0, 120) / 343);
      const v = U.clamp(1 - dist / 90, 0.2, 1);
      A.nz(t, 0.16, { type: 'lowpass', freq: 500, q: 0.8, gain: 0.22 * v, atk: 0.004, wet: 0.5, echo: 0.3 });
      A.osc(t, 0.14, 120, 52, 0.14 * v, 'sine', { wet: 0.35 });
    };

    /* «щелчок» интерфейса и подтверждение захвата персонажа */
    A.ui = function (up) {
      if (!ready()) return;
      const t = A.now(0.001);
      const v=(globalThis.AEGIS_SETTINGS||{}).uiVolume??1;if(v<=0)return;
      A.osc(t, 0.07, up ? 520 : 380, up ? 880 : 240, 0.07*v, 'sine');
      A.nz(t, 0.02, { type: 'highpass', freq: 3800, gain: 0.05*((globalThis.AEGIS_SETTINGS||{}).uiVolume??1) });
    };

    /* Гранаты: ev — 'clip' (скоба M67), 'pin' (чека выходит), 'spoon'
       (рычаг отлетает со звоном), 'bounce' (удар о землю/препятствие, k —
       сила), 'pinDrop' (кольцо с чекой упало). sp — как у A.spatial. */
    A.grenade = function (ev, sp, k) {
      if (!ready()) return;
      const q = sp || {}, out = A.spatial(q);
      const t = A.now(0.001 + (q.delay || 0));
      const kk = k === undefined ? 1 : U.clamp(k, 0.05, 1.5);
      if (ev === 'clip') {
        A.nz(t, 0.012, { type: 'bandpass', freq: 4200, q: 3, gain: 0.22, atk: 0.0005, out });
        A.osc(t, 0.05, 3300, 3000, 0.03, 'sine', { out });
      } else if (ev === 'pin') {
        /* скрип чеки и щелчок выхода */
        A.nz(t, 0.11, { type: 'bandpass', freq: 3000, freq2: 5200, q: 4, gain: 0.08, atk: 0.02, out });
        A.nz(t + 0.11, 0.01, { type: 'highpass', freq: 3500, q: 0.7, gain: 0.25, atk: 0.0004, out });
        A.osc(t + 0.11, 0.18, 4100, 3900, 0.025, 'sine', { out });
      } else if (ev === 'spoon') {
        /* рычаг: щелчок ударника и звон отлетающей скобы */
        A.nz(t, 0.008, { type: 'highpass', freq: 2500, q: 0.7, gain: 0.35, atk: 0.0003, out });
        A.osc(t + 0.004, 0.32, 2650, 2550, 0.05, 'sine', { out });
        A.osc(t + 0.004, 0.22, 5300, 5150, 0.02, 'sine', { out });
      } else if (ev === 'bounce') {
        A.nz(t, 0.03 + 0.03 * kk, { type: 'lowpass', freq: 520 + 400 * kk, q: 0.9, gain: 0.22 * kk, atk: 0.001, out });
        A.nz(t, 0.008, { type: 'bandpass', freq: 2400, q: 2, gain: 0.08 * kk, atk: 0.0005, out });
      } else if (ev === 'hard') {
        A.nz(t, 0.01, { type: 'bandpass', freq: 3200, q: 3, gain: 0.25 * kk, atk: 0.0004, out });
        A.osc(t, 0.09, 1900 + Math.random() * 500, 1700, 0.05 * kk, 'triangle', { out });
      } else if (ev === 'pinDrop') {
        A.osc(t, 0.12, 3600, 3400, 0.02, 'sine', { out });
        A.nz(t, 0.006, { type: 'bandpass', freq: 3800, q: 3, gain: 0.08, atk: 0.0004, out });
      }
    };
    /* громкость 0…1 (настройки) */
    /* ------------------------------------------------ v7: мрачный лес -- */
    /* Ambient-шина: звук идёт в A.amb (слышен и в паузе), sp — {pan, gain, lp}. */
    function ambOut(sp) {
      const ctx = A.ctx, q = sp || {};
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = q.lp || 12000; lp.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.value = q.gain === undefined ? 1 : q.gain;
      lp.connect(g);
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = U.clamp(q.pan || 0, -1, 1); g.connect(p); p.connect(A.amb); }
      else g.connect(A.amb);
      if (q.wet && A.conv) { const w = ctx.createGain(); w.gain.value = q.wet; g.connect(w); w.connect(A.conv); }
      return lp;
    }
    const ambReady = () => A.on && A.init() && A.amb && A.ctx.state === 'running';
    /* Низкий гул ветра в кронах: шум через две резонансные полосы
       (≈190 и ≈310 Гц, Q 7), частоты медленно плывут — «вой» леса, на
       грани слуха. Ниже 120 Гц всё равно срезает капсула бодикама. */
    A.setDrone = function (k) {
      A.droneK = U.clamp01(k || 0);
      if (!A.ctx || !A.amb) return;
      const ctx = A.ctx, t = ctx.currentTime;
      if (!A._drone) {
        const s = ctx.createBufferSource(); s.buffer = A.nb; s.loop = true; s.playbackRate.value = 0.5;
        const g = ctx.createGain(); g.gain.value = 0;
        const mk = (f, q, gg, lf, ld) => {
          const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q;
          const o = ctx.createOscillator(); o.frequency.value = lf; const og = ctx.createGain(); og.gain.value = ld;
          o.connect(og); og.connect(b.frequency); o.start();
          const bg = ctx.createGain(); bg.gain.value = gg; s.connect(b); b.connect(bg); bg.connect(g);
        };
        mk(190, 7, 1.0, 0.031, 28); mk(310, 8, 0.6, 0.047, 40); mk(150, 2, 0.8, 0.019, 15);
        const sw = ctx.createOscillator(); sw.frequency.value = 0.07; const swg = ctx.createGain(); swg.gain.value = 0;
        sw.connect(swg); swg.connect(g.gain); sw.start();
        g.connect(A.amb); s.start(0, Math.random() * 2);
        A._drone = { g, swg };
      }
      A._drone.g.gain.setTargetAtTime(0.05 * A.droneK, t, 2.5);
      A._drone.swg.gain.setTargetAtTime(0.03 * A.droneK, t, 2.5);
    };
    /* Далёкая артиллерия (5–15 км): верх съеден воздухом, слышно только
       глухой удар и долгий раскат, отражённый лесом и облаками. */
    A.artillery = function (o) {
      if (!ambReady()) return;
      o = o || {};
      const n = o.n || 1, k = o.gain === undefined ? 1 : o.gain;
      for (let i = 0; i < n; i++) {
        const t = A.ctx.currentTime + 0.05 + i * rnd(0.5, 2.2), out = ambOut({ pan: (o.pan || 0) + rnd(-0.15, 0.15), gain: k * rnd(0.6, 1), lp: rnd(380, 650), wet: 0.6 });
        A.nz(t, rnd(0.5, 0.9), { type: 'lowpass', freq: 520, freq2: 130, q: 0.7, gain: 0.22, atk: 0.012, out });
        A.osc(t, 0.7, 92, 48, 0.16, 'sine', { atk: 0.015, out });
        A.nz(t + 0.12, rnd(2.5, 4.5), { type: 'lowpass', freq: 300, freq2: 120, q: 0.5, gain: 0.07, atk: 0.35, out });
      }
    };
    /* Гром: d — км. Близкий (<1,5 км) — треск разряда, затем раскат;
       далёкий — только низкое ворчание. Задержку (d/0,343 с) задаёт игра. */
    A.thunder = function (d, pan) {
      if (!ambReady()) return;
      const t = A.ctx.currentTime + 0.03, near = d < 1.5;
      const g = U.clamp(1.6 / (0.6 + d), 0.15, 1.2);
      const out = ambOut({ pan: pan || 0, gain: g, lp: near ? 5200 : U.clamp(2400 / d, 350, 1600), wet: 0.8 });
      if (near) {
        A.nz(t, 0.09, { type: 'highpass', freq: 1500, q: 0.5, gain: 0.35, atk: 0.0008, out });
        for (let i = 0; i < 6; i++) A.nz(t + rnd(0.02, 0.35), rnd(0.03, 0.08), { type: 'bandpass', freq: rnd(900, 2600), q: 1.2, gain: rnd(0.08, 0.2), atk: 0.002, out });
      }
      const len = 2.5 + d * 1.2;
      A.nz(t + (near ? 0.05 : 0), len, { type: 'lowpass', freq: near ? 900 : 420, freq2: 110, q: 0.6, gain: 0.32, atk: near ? 0.02 : 0.5, out });
      for (let i = 0; i < 4; i++) A.nz(t + rnd(0.2, len * 0.6), rnd(0.8, 1.8), { type: 'lowpass', freq: rnd(250, 480), freq2: 120, q: 0.6, gain: rnd(0.08, 0.18), atk: rnd(0.1, 0.3), out });
      A.osc(t + 0.05, Math.min(3, len), 70, 40, 0.18, 'sine', { atk: 0.3, out });
    };
    /* Ворона: хриплое «кра» — пила с падающим тоном через форманты
       ~1,2 и ~2,4 кГц и шумовая хрипотца. */
    /* v21: вороны и сорока молчат (птиц в игре нет) */
    A.crow = function () {}; A.magpie = function () {};
    A._crowOld = function (sp, n) {
      if (!ambReady()) return;
      const q = sp || {}, out = ambOut({ pan: q.pan, gain: q.gain === undefined ? 0.5 : q.gain, lp: q.lp || 9000, wet: 0.5 });
      const ctx = A.ctx;
      let t = ctx.currentTime + 0.02 + (q.delay || 0);
      const f0 = rnd(430, 560);
      for (let i = 0; i < (n || 1); i++) {
        const dur = rnd(0.22, 0.34);
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0 * 1.08, t); o.frequency.linearRampToValueAtTime(f0, t + dur * 0.3); o.frequency.exponentialRampToValueAtTime(f0 * 0.78, t + dur);
        const vib = ctx.createOscillator(); vib.frequency.value = rnd(38, 55); const vg = ctx.createGain(); vg.gain.value = f0 * 0.06;
        vib.connect(vg); vg.connect(o.frequency);
        const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.09, t + 0.025);
        e.gain.setValueAtTime(0.08, t + dur * 0.6); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        for (const [f, qq, gg] of [[1250, 4, 1], [2450, 5, 0.6], [700, 3, 0.35]]) {
          const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f * rnd(0.94, 1.06); b.Q.value = qq;
          const bg = ctx.createGain(); bg.gain.value = gg; o.connect(b); b.connect(bg); bg.connect(e);
        }
        e.connect(out);
        A.nz(t, dur * 0.9, { type: 'bandpass', freq: 1800, q: 1.4, gain: 0.025, atk: 0.02, out });
        o.start(t); o.stop(t + dur + 0.02); vib.start(t); vib.stop(t + dur + 0.02);
        t += dur + rnd(0.12, 0.3);
      }
    };
    /* Хлопанье крыльев взлетающей стаи */
    A.wings = function (sp, n) {
      if (!ambReady()) return;
      const q = sp || {}, out = ambOut({ pan: q.pan, gain: q.gain === undefined ? 0.5 : q.gain, lp: q.lp || 8000 });
      const t0 = A.ctx.currentTime + 0.01 + (q.delay || 0);
      for (let i = 0; i < (n || 8); i++) {
        const t = t0 + i * rnd(0.07, 0.11);
        A.nz(t, 0.06, { type: 'bandpass', freq: rnd(500, 900), q: 0.9, gain: 0.07 * (1 - i / (n || 8) * 0.6), atk: 0.012, out });
      }
    };
    /* Пролёт пули рядом: сверхзвук — сухой щелчок ударной волны (N-волна,
       «crack»), затем шипение; дозвук — шелестящий «вжик». Потом приходит
       выстрел («thump») — его задержку даёт расстояние до стрелка. */
    A.bulletPass = function (sp, superK) {
      if (!ready()) return;
      const q = sp || {}, out = A.spatial({ pan: q.pan, gain: q.gain === undefined ? 1 : q.gain, lp: 16000 });
      const t = A.now(0.002 + (q.delay || 0));
      if (superK) {
        A.nz(t, 0.006, { type: 'highpass', freq: 2200, q: 0.6, gain: 0.85, atk: 0.0002, wet: 0.25, echo: 0.3, out });
        A.osc(t, 0.004, 3200, 1800, 0.25, 'square', { atk: 0.0002, out });
        A.nz(t + 0.004, 0.09, { type: 'bandpass', freq: 5200, freq2: 2600, q: 1.5, gain: 0.08, atk: 0.003, out });
      } else {
        A.nz(t, 0.16, { type: 'bandpass', freq: 1800, freq2: 900, q: 3.5, gain: 0.12, atk: 0.06, out });
      }
    };
    /* ------------------------------------------------ v8: мелочи -- */
    /* Остывающий ствол «тикает»: сталь сжимается неравномерно — сухие
       одиночные щелчки 4–7 кГц, всё реже по мере остывания */
    A.metalTick = function (sp, k) {
      if (!ready()) return;
      const q = sp || {}, out = A.spatial({ pan: q.pan, gain: (q.gain === undefined ? 1 : q.gain) * 0.6, lp: 16000 });
      const t = A.now(0.002 + (q.delay || 0)), kk = U.clamp01(k === undefined ? 0.5 : k);
      A.osc(t, 0.012, rnd(4200, 7200), rnd(3800, 6500), 0.012 + 0.02 * kk, 'triangle', { atk: 0.0003, out });
      A.nz(t, 0.006, { type: 'highpass', freq: 5000, q: 0.7, gain: 0.02 + 0.03 * kk, atk: 0.0002, out });
    };
    /* Капли на горячем стволе: короткое шипение пара */
    A.sizzle = function (sp, k) {
      if (!ready()) return;
      const q = sp || {}, out = A.spatial({ pan: q.pan, gain: (q.gain === undefined ? 1 : q.gain) * 0.5, lp: 16000 });
      const t = A.now(0.003 + (q.delay || 0)), kk = U.clamp01(k === undefined ? 0.5 : k);
      A.nz(t, rnd(0.08, 0.22), { type: 'highpass', freq: rnd(3500, 6000), q: 0.5, gain: 0.015 + 0.05 * kk, atk: 0.004, out });
    };
    /* Рикошет: удар по металлу/камню и «вьюу» уходящей пули (допплер) */
    A.ricochet = function (sp, k) {
      if (!ready()) return;
      const q = sp || {}, out = A.spatial(q);
      const t = A.now(0.002 + (q.delay || 0)), kk = U.clamp01(k === undefined ? 1 : k);
      A.nz(t, 0.02, { type: 'bandpass', freq: 3200, q: 1.2, gain: 0.35 * kk, atk: 0.0003, out });
      const f0 = rnd(2600, 4200);
      A.osc(t + 0.004, rnd(0.18, 0.34), f0, f0 * rnd(0.35, 0.55), 0.035 * kk, 'sine', { atk: 0.004, out, wet: 0.3, echo: 0.25 });
    };
    /* Пуля по старой каске / банке / ящику: звонкий «дзынь» с затуханием
       (собственные частоты тонкой стальной оболочки) */
    A.metalPing = function (sp, big) {
      if (!ready()) return;
      const q = sp || {}, out = A.spatial(q);
      const t = A.now(0.002 + (q.delay || 0));
      const f = big ? rnd(520, 760) : rnd(900, 1500);
      A.nz(t, 0.01, { type: 'highpass', freq: 2500, q: 0.7, gain: 0.3, atk: 0.0002, out });
      for (const [m, g, d] of [[1, 0.06, 0.5], [2.32, 0.035, 0.32], [3.9, 0.02, 0.2]]) A.osc(t, d * (big ? 1.4 : 1), f * m, f * m * 0.995, g, 'sine', { atk: 0.0006, out, wet: 0.25 });
    };
    /* Песок сыплется из пробитого мешка */
    A.sandTrickle = function (sp, dur) {
      if (!ready()) return;
      const q = sp || {}, out = A.spatial({ pan: q.pan, gain: (q.gain === undefined ? 1 : q.gain) * 0.5, lp: q.lp || 12000 });
      const t = A.now(0.01 + (q.delay || 0)), D = dur || 2;
      A.nz(t, D, { type: 'bandpass', freq: 3800, freq2: 2400, q: 0.8, gain: 0.03, atk: 0.06, out });
    };
    /* Пуля в воду: шлепок и короткое «бульк» */
    A.waterHit = function (sp) {
      if (!ready()) return;
      const q = sp || {}, out = A.spatial(q);
      const t = A.now(0.002 + (q.delay || 0));
      A.nz(t, 0.05, { type: 'lowpass', freq: 2400, q: 0.7, gain: 0.25, atk: 0.0005, out });
      A.osc(t + 0.02, 0.07, rnd(500, 700), rnd(1100, 1500), 0.04, 'sine', { atk: 0.004, out });
    };
    /* Банки на проволоке (старая «сигнализация»): глухое звяканье */
    A.cans = function (sp, k) {
      if (!ambReady()) return;
      const q = sp || {}, out = ambOut({ pan: q.pan, gain: (q.gain === undefined ? 0.6 : q.gain) * (k || 1), lp: q.lp || 9000 });
      const t0 = A.ctx.currentTime + 0.01 + (q.delay || 0);
      for (let i = 0, n = 1 + (Math.random() * 3 | 0); i < n; i++) {
        const t = t0 + i * rnd(0.08, 0.2), f = rnd(1300, 2100);
        A.osc(t, 0.12, f, f * 0.99, 0.02, 'triangle', { atk: 0.0008, out });
        A.osc(t, 0.08, f * 2.7, f * 2.68, 0.008, 'sine', { atk: 0.0008, out });
      }
    };
    /* v8: ручей в овраге — журчание (два полосовых шума с медленной
       модуляцией + редкие «бульки»). k — громкость по расстоянию, pan — сторона */
    A.setBrook = function (k, pan) {
      if (!A.ctx || !A.amb || !A.nb) return;
      const ctx = A.ctx, t = ctx.currentTime;
      k = U.clamp01(k || 0);
      if (!A._brook) {
        if (k < 0.01) return;
        const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        const bus = ctx.createGain(); bus.gain.value = 0;
        if (pn) { bus.connect(pn); pn.connect(A.amb); } else bus.connect(A.amb);
        const mk = (f, q, g0) => {
          const s = ctx.createBufferSource(); s.buffer = A.nb; s.loop = true;
          const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
          const g = ctx.createGain(); g.gain.value = g0;
          const lfo = ctx.createOscillator(); lfo.frequency.value = rnd(0.15, 0.6);
          const lg = ctx.createGain(); lg.gain.value = f * 0.25;
          lfo.connect(lg); lg.connect(fl.frequency); lfo.start();
          s.connect(fl); fl.connect(g); g.connect(bus); s.start(0, Math.random() * 2);
        };
        mk(480, 0.9, 0.5); mk(1350, 1.4, 0.32); mk(3100, 2.0, 0.12);
        A._brook = { bus, pn, k: 0 };
        const bub = () => {
          const B = A._brook;
          if (B && B.k > 0.03 && A.ctx.state === 'running' && A.ambOn !== false) {
            const tt = ctx.currentTime + Math.random() * 0.1, f = rnd(500, 1400);
            const o = ctx.createOscillator(); o.type = 'sine';
            o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * rnd(1.4, 2.2), tt + 0.05);
            const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, tt);
            g.gain.exponentialRampToValueAtTime(0.02 * B.k, tt + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.07);
            o.connect(g); g.connect(B.bus); o.start(tt); o.stop(tt + 0.09);
          }
          setTimeout(bub, rnd(90, 420));
        };
        bub();
      }
      const B = A._brook;
      B.k = k;
      B.bus.gain.setTargetAtTime(0.11 * k, t, 0.3);
      if (B.pn) B.pn.pan.setTargetAtTime(U.clamp(pan || 0, -0.8, 0.8), t, 0.2);
    };
    /* Сорока: сухой «стрекот» серией (тревога — человек рядом) */
    A._magpieOld = function (sp, n) {
      if (!ambReady()) return;
      const q = sp || {}, out = ambOut({ pan: q.pan, gain: q.gain === undefined ? 0.5 : q.gain, lp: q.lp || 10000 });
      const t0 = A.ctx.currentTime + 0.02 + (q.delay || 0);
      const N = n || (6 + (Math.random() * 6 | 0));
      for (let i = 0; i < N; i++) {
        const t = t0 + i * rnd(0.075, 0.095);
        A.nz(t, 0.05, { type: 'bandpass', freq: rnd(2600, 3400), q: 2.2, gain: 0.09, atk: 0.003, out });
        A.osc(t, 0.04, rnd(1500, 1800), rnd(1200, 1400), 0.015, 'sawtooth', { atk: 0.003, out });
      }
    };
    /* Капли с веток по каске (под дождём и после): «тук» по полимеру/стали */
    A.helmetDrip = function (k) {
      if (!ready()) return;
      const t = A.now(0.002), kk = U.clamp01(k === undefined ? 0.5 : k);
      A.nz(t, 0.012, { type: 'bandpass', freq: rnd(1800, 2600), q: 1.4, gain: 0.03 + 0.05 * kk, atk: 0.0003 });
      A.osc(t, 0.03, rnd(700, 950), rnd(600, 800), 0.008 + 0.01 * kk, 'sine', { atk: 0.0005 });
    };
    /* Удар ударной волны близкого выстрела соседа (дульная волна в грудь) */
    A.blastThump = function (k) {
      if (!ready()) return;
      const t = A.now(0.001), kk = U.clamp01(k);
      A.osc(t, 0.12, 70, 38, 0.25 * kk, 'sine', { atk: 0.002 });
      A.nz(t, 0.05, { type: 'lowpass', freq: 400, q: 0.7, gain: 0.25 * kk, atk: 0.001 });
    };
    /* Пространство: под пологом больше хвоста отражений, на поляне — меньше */
    A.setSpace = function (k) {
      if (!A.ctx || !A._wetG) return;
      const t = A.ctx.currentTime, kk = U.clamp01(k);
      A._wetG.gain.setTargetAtTime(0.34 + 0.24 * kk, t, 0.8);
      A._echoG.gain.setTargetAtTime(0.26 + 0.2 * kk, t, 0.8);
    };

    A.setVolume = function (v) {
      A.vol = U.clamp(v, 0, 1);
      if (A.master && A.on && !A.paused) A.master.gain.value = 0.8 * A.vol;
      if (A.gOut && A.on && !A.paused) A.gOut.gain.value = A.vol*((globalThis.AEGIS_SETTINGS||{}).shots??1);
      if (A.amb && A.on) A.amb.gain.value = ambLevel();
    };

    A.setGroups = function(){A.setVolume(A.vol===undefined?.8:A.vol);};
    A.uiClick=function(){if(!A.ctx||!A.on)return;const o=A.ctx.createOscillator(),g=A.ctx.createGain(),t=A.ctx.currentTime;o.frequency.value=650;g.gain.setValueAtTime(.012*(A.vol??.8)*((globalThis.AEGIS_SETTINGS||{}).uiVolume??1),t);g.gain.exponentialRampToValueAtTime(.000001,t+.025);o.connect(g);g.connect(A.ctx.destination);o.start(t);o.stop(t+.03);};
    A.resume = function () {
      if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
    };
    A.setMuted = function (m) {
      A.on = !m;
      if (A.master) A.master.gain.value = m || A.paused ? 0 : 0.8 * (A.vol === undefined ? 1 : A.vol);
      if (A.gOut) A.gOut.gain.value = m || A.paused ? 0 : (A.vol === undefined ? 1 : A.vol)*((globalThis.AEGIS_SETTINGS||{}).shots??1);
      if (A.amb) A.amb.gain.value = ambLevel();
    };

    return A;
  }

  return { create };
});