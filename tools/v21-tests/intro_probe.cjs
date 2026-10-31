// Loading-screen stand: loading-preview.html (same intro.js/three/wkit as index.html, simulated progress).
const OUTDIR = process.env.OUT_DIR || require('path').join(__dirname, 'out'); require('fs').mkdirSync(OUTDIR, { recursive: true });
// Screenshots mid-slide for all 7 slides, captions, intro fps, main-thread long tasks, draw calls/frame,
// console errors, then close -> GL context released, #intro removed. env BASE TAG THROTTLE W H
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8000/', TAG = process.env.TAG || 'v21';
const THR = +(process.env.THROTTLE || 1), W = +(process.env.W || 1280), H = +(process.env.H || 720);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text().slice(0, 200)); });
  await p.addInitScript(() => {
    window.__LT = []; window.__IF = []; window.__DC = 0;
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__LT.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ entryTypes: ['longtask'] }); } catch (e) {}
    const isIntro = (gl) => gl.canvas && gl.canvas.classList && gl.canvas.classList.contains('ld-gl');
    for (const P of [window.WebGL2RenderingContext && WebGL2RenderingContext.prototype, window.WebGLRenderingContext && WebGLRenderingContext.prototype]) {
      if (!P) continue;
      const C = P.clear, DE = P.drawElements, DA = P.drawArrays;
      P.clear = function (m) { if (isIntro(this)) window.__IF.push(performance.now()); return C.call(this, m); };
      P.drawElements = function () { if (isIntro(this)) window.__DC++; return DE.apply(this, arguments); };
      P.drawArrays = function () { if (isIntro(this)) window.__DC++; return DA.apply(this, arguments); };
    }
  });
  const cdp = await p.context().newCDPSession(p);
  if (THR > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THR });
  const t0 = Date.now();
  await p.goto(BASE + 'loading-preview.html?hold');
  const R = { tag: TAG, throttle: THR, slides: [] };
  // first frame of the 3D canvas
  await p.waitForFunction(() => document.querySelector('.ld-gl.on'), null, { timeout: 120000, polling: 50 }).catch(() => {});
  R.firstFrameMs = Date.now() - t0;
  const SL = (+(process.env.SLIDE || 8)) + 0.56 + (+(process.env.BUILD || 0.3));   // slide + fade + build in the dark
  for (let k = 0; k < 7; k++) {
    const target = 3000 + k * SL * 1000 * (THR > 1 ? 1 : 1);
    const now = Date.now() - t0 - R.firstFrameMs; if (target > now) await p.waitForTimeout(target - now);
    const info = await p.evaluate(() => ({ n: (document.querySelector('.ld-gun-n') || {}).textContent, t: (document.querySelector('.ld-gun-t') || {}).textContent, on: document.querySelector('.ld-gl').classList.contains('on'), frames: window.__IF.length, dc: window.__DC }));
    await p.screenshot({ path: `${OUTDIR}/intro-${TAG}-${k}.jpg`, type: 'jpeg', quality: 80 });
    R.slides.push(info);
  }
  const m = await p.evaluate(() => {
    const f = window.__IF, d = []; for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]);
    d.sort((a, b) => a - b);
    const span = (f[f.length - 1] - f[0]) / 1000;
    return { frames: f.length, fps: +(f.length / span).toFixed(1), dtMed: +(d[d.length >> 1] || 0).toFixed(1), dt95: +(d[Math.floor(d.length * 0.95)] || 0).toFixed(1), dtMax: +(d[d.length - 1] || 0).toFixed(1), dcPerFrame: +(window.__DC / f.length).toFixed(1), longTasks: window.__LT.length, ltMax: Math.max(0, ...window.__LT.map((x) => x[1])), ltTotal: window.__LT.reduce((s, x) => s + x[1], 0), lt: window.__LT.slice(0, 30) };
  });
  Object.assign(R, m);
  // close: ready -> key -> GL context lost, #intro removed
  await p.evaluate(() => AEGIS_INTRO.markReady());
  await p.waitForTimeout(300);
  await p.keyboard.press('Space');
  await p.waitForTimeout(1500);
  R.after = await p.evaluate(() => { const c = document.querySelector('.ld-gl'); return { introGone: !document.getElementById('intro'), closed: AEGIS_INTRO.closed, ctxShared: !!(window.AEGIS_WK && AEGIS_WK.introCtx), framesAfter: window.__IF.length }; });
  await p.waitForTimeout(1000);
  R.after.framesAfter2 = await p.evaluate(() => window.__IF.length);
  R.errs = errs;
  fs.writeFileSync(`${OUTDIR}/intro-${TAG}.json`, JSON.stringify(R, null, 1));
  console.log(JSON.stringify(R));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
