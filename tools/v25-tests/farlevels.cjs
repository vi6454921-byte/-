// Уровни далёкого боя (GAudioDist.far) против артиллерии и ближних выстрелов: OfflineAudioContext, пик и RMS 300 мс
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto('http://127.0.0.1:8000/tools/sound-tests/levels.html').catch(() => {});
  for (const s of ['js/polygon/19b_audio_distance.js', 'assets/snd/shot_akm.js', 'assets/snd/shot_svd.js', 'assets/snd/sfx_pack.js', 'assets/snd/amb_pack.js']) await p.addScriptTag({ url: 'http://127.0.0.1:8000/' + s });
  const res = await p.evaluate(async () => {
    const SR = 48000, out = {};
    const meas = (buf) => { let pk = 0, best = 0; const L = buf.getChannelData(0), R = buf.getChannelData(1), W = (0.3 * SR) | 0; let acc = 0; for (let i = 0; i < L.length; i++) { const v = (L[i] * L[i] + R[i] * R[i]) / 2; pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); acc += v; if (i >= W) { const u = L[i - W], w = R[i - W]; acc -= (u * u + w * w) / 2; } if (i >= W) best = Math.max(best, acc / W); } const db = (x) => +(20 * Math.log10(Math.max(1e-9, x))).toFixed(1); return { peak: db(pk), rms300: db(Math.sqrt(best)) }; };
    async function run(sec, fn) { const ctx = new OfflineAudioContext(2, SR * sec, SR); Object.defineProperty(ctx, 'state', { get: () => 'running' }); const A = { ctx, amb: ctx.destination, gunBus: ctx.destination }; await fn(ctx, A); const buf = await ctx.startRendering(); return meas(buf); }
    const D0 = (A) => { const D = GAudioDist.bind(A); D.L.x = 0; D.L.z = 0; return D; };
    for (const d of [20, 120, 280]) out['shot_' + d] = await run(4, async (ctx, A) => { const D = D0(A); D.shot({ id: 'akm', key: 'k' + d, x: 0, y: 0, z: -d, quality: 'high' }); });
    for (const d of [1000, 1500, 2500, 4000]) out['far_mg_' + d] = await run(9, async (ctx, A) => { const D = D0(A); D.far({ id: 'akm', n: 8, rpm: 650, d, pan: 0, gain: 1.1 }); });
    out['far_svd_1500'] = await run(6, async (ctx, A) => { const D = D0(A); D.far({ id: 'svd', n: 1, d: 1500, gain: 0.85 }); });
    /* артиллерия: как A.artillery в 28b: CAL.art 0.4 × gain 0.75 × rnd(0.6..1)≈0.8, ФНЧ ~2000, wet в свёртку не считаем */
    const dec = async (ctx, b64) => { const raw = atob(b64), u = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i); return await ctx.decodeAudioData(u.buffer); };
    const SFX = window.__SFX_DATA || window.AEGIS_SFX || null;
    const key = Object.keys(window).filter((k) => /SFX|SND|PACK/i.test(k));
    out.keys = key;
    const pack = window.__SFX_DATA || null, amb = window.__AMB_DATA || window.__SFX_DATA || {};
    if (pack) {
      const list = Array.isArray(pack.artillery) ? pack.artillery : [pack.artillery];
      out.art = await run(10, async (ctx, A) => { const buf = await dec(ctx, list[0]); const s = ctx.createBufferSource(); s.buffer = buf; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2000; const g = ctx.createGain(); g.gain.value = 0.4 * 0.75 * 0.8; s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(0.05); });
      const ak = Object.keys(amb).filter((k) => /amb_forest/.test(k));
      if (ak.length) out.amb_forest = await run(6, async (ctx, A) => { const l = amb[ak[0]]; const e0 = Array.isArray(l) ? l[0] : l; const buf = await dec(ctx, typeof e0 === "string" ? e0 : (e0.d || e0.b || e0.data || e0.s)); const s = ctx.createBufferSource(); s.buffer = buf; const g = ctx.createGain(); g.gain.value = 0.17; s.connect(g); g.connect(ctx.destination); s.start(0); });
    }
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
