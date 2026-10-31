// Game load time with the 3D loading screen on/off (intro.js SHOW=[] when NO3D=1). Real index.html flow.
const OUTDIR = process.env.OUT_DIR || require('path').join(__dirname, 'out'); require('fs').mkdirSync(OUTDIR, { recursive: true });
// Measures ms until AEGIS_INTRO.ready (game marks ready when the battle is built), long tasks, errors.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8000/', TAG = process.env.TAG || 'v21', NO3D = process.env.NO3D === '1';
const MAP = process.env.MAP || 'forest_map_camp', SEC = process.env.SEC || '1';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => {
    localStorage.setItem('aegis.settings', JSON.stringify({ quality: 'low', volume: 0, calloutSpeech: false, tutorialDone: true, tutDone: true }));
    window.__LT = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__LT.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) {}
  });
  if (NO3D) await p.route('**/js/app/intro.js', async (route) => { const r = await route.fetch(); let s = await r.text(); s = s.replace(/const SHOW = \[[^\]]*\];/, 'const SHOW = [];'); await route.fulfill({ response: r, body: s }); });
  const t0 = Date.now();
  await p.goto(BASE + 'index.html?map=' + MAP + '&sector=' + SEC, { timeout: 300000 });
  await p.waitForFunction(() => window.AEGIS_INTRO && AEGIS_INTRO.ready, null, { timeout: 900000, polling: 250 });
  const ms = Date.now() - t0;
  const lt = await p.evaluate(() => ({ n: window.__LT.length, total: window.__LT.reduce((a, b) => a + b, 0), max: Math.max(0, ...window.__LT) }));
  const R = { tag: TAG, no3d: NO3D, readyMs: ms, lt, errs: errs.slice(0, 5) };
  fs.writeFileSync(`${OUTDIR}/load-${TAG}${NO3D ? '-no3d' : ''}.json`, JSON.stringify(R));
  console.log(JSON.stringify(R));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
