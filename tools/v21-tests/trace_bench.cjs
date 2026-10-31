// Bullet trace cost: F.testFire (traceBullet + tracer) for sky / ground / horizontal shots; CPU profile of sky shots.
const OUTDIR = process.env.OUT_DIR || require('path').join(__dirname, 'out'); require('fs').mkdirSync(OUTDIR, { recursive: true });
// env BASE TAG MAP SEC N
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8000/', TAG = process.env.TAG || 'v21';
const MAP = process.env.MAP || 'stroyka_zarechye_v2', SEC = process.env.SEC || '1', N = +(process.env.N || 20);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.addInitScript(() => { localStorage.setItem('aegis.settings', JSON.stringify({ quality: 'low', volume: 0, calloutSpeech: false })); });
  await p.route('**/js/polygon/29_game.js', async (route) => {
    const r = await route.fetch(); let s = await r.text();
    s = s.replace('const go = () => { warm(); startGame(); };', 'const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();');
    await route.fulfill({ response: r, body: s });
  });
  await p.goto(BASE + 'index.html?map=' + MAP + '&sector=' + SEC, { timeout: 300000 });
  await p.waitForFunction(() => window.__GAME, null, { timeout: 900000 });
  await p.evaluate(() => {
    const g = __GAME, S = g.state;
    try { AEGIS_INTRO.markReady(); AEGIS_INTRO.close(); } catch (e) {}
    S.noRender = true; S.paused = true;
    { const st0 = g.step; g.step = (n, dt) => { S.paused = false; try { return st0(n, dt); } finally { S.paused = true; } }; }
    g.step(30, 1 / 60);
  });
  const run = (kind, n) => p.evaluate(({ kind, n }) => {
    const g = __GAME, F = g._F, S = g.state, T = THREE;
    const a = g.squad[S.activeIdx >= 0 ? S.activeIdx : 0];
    const from = a.ctrl.pos.clone(); from.y += 1.5;
    const out = [];
    for (let i = 0; i < n; i++) {
      const yaw = a.ctrl.yaw + (i / n) * Math.PI * 2, el = kind === 'sky' ? 0.035 : kind === 'ground' ? -0.12 : 0.0;
      const d = new T.Vector3(-Math.sin(yaw) * Math.cos(el), Math.sin(el), -Math.cos(yaw) * Math.cos(el));
      const t0 = performance.now(); const r = F.testFire(from, d, a, {}); out.push([performance.now() - t0, r && r.hit ? 1 : 0]);
    }
    const ms = out.map((x) => x[0]).sort((x, y) => x - y);
    return { kind, n, med: +ms[ms.length >> 1].toFixed(2), p90: +ms[Math.floor(ms.length * 0.9)].toFixed(2), max: +ms[ms.length - 1].toFixed(2), hits: out.filter((x) => x[1]).length };
  }, { kind, n });
  const R = { tag: TAG, map: MAP };
  await run('sky', 4);
  R.stats0 = await p.evaluate(() => __GAME.traceStats && __GAME.traceStats());
  R.sky = await run('sky', N); R.ground = await run('ground', N); R.horiz = await run('horiz', N);
  R.stats1 = await p.evaluate(() => __GAME.traceStats && __GAME.traceStats());
  R.custom = await p.evaluate(() => { const out = []; try { const st = __GAME.traceStats(); } catch (e) {} return out; });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
  await run('sky', N);
  const { profile } = await cdp.send('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n])), self = new Map(); let tot = 0;
  for (let i = 0; i < profile.samples.length; i++) { const n = byId.get(profile.samples[i]); const cf = n.callFrame; const key = (cf.functionName || '(anon)') + ' ' + cf.url.split('/').slice(-1)[0] + ':' + (cf.lineNumber + 1); const d = profile.timeDeltas[i] || 0; self.set(key, (self.get(key) || 0) + d); tot += d; }
  R.top = [...self.entries()].sort((x, y) => y[1] - x[1]).slice(0, 18).map(([k, v]) => [k, +(v / 1000).toFixed(1), +(100 * v / tot).toFixed(1)]);
  fs.writeFileSync(`${OUTDIR}/tb-${TAG}-${MAP}.json`, JSON.stringify(R, null, 1));
  console.log(JSON.stringify({ sky: R.sky, ground: R.ground, horiz: R.horiz, stats0: R.stats0, stats1: R.stats1 }));
  for (const t of R.top) console.log(String(t[1]).padStart(7), 'ms', String(t[2]).padStart(5), '%', t[0]);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
