// Correctness + speed: GTrace fast vs legacy on the same random rays (bullet chords 7.5 m, visibility rays 60 m, soft/hard).
const OUTDIR = process.env.OUT_DIR || require('path').join(__dirname, 'out'); require('fs').mkdirSync(OUTDIR, { recursive: true });
// env BASE TAG MAP SEC N
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8000/', TAG = process.env.TAG || 'opt';
const MAP = process.env.MAP || 'stroyka_zarechye_v2', SEC = process.env.SEC || '1', N = +(process.env.N || 300);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.addInitScript(() => { localStorage.setItem('aegis.settings', JSON.stringify({ quality: 'low', volume: 0, calloutSpeech: false })); });
  await p.route('**/js/polygon/29_game.js', async (route) => {
    const r = await route.fetch(); let s = await r.text();
    s = s.replace('const go = () => { warm(); startGame(); };', 'const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();');
    await route.fulfill({ response: r, body: s });
  });
  await p.goto(BASE + 'index.html?map=' + MAP + '&sector=' + SEC, { timeout: 300000 });
  await p.waitForFunction(() => window.__GAME, null, { timeout: 900000 });
  const R = await p.evaluate(({ N }) => {
    const g = __GAME, S = g.state, T = THREE, C = g._C;
    try { AEGIS_INTRO.markReady(); AEGIS_INTRO.close(); } catch (e) {}
    S.noRender = true; S.paused = true;
    { const st0 = g.step; g.step = (n, dt) => { S.paused = false; try { return st0(n, dt); } finally { S.paused = true; } }; }
    g.step(20, 1 / 60);
    const a = g.squad[S.activeIdx >= 0 ? S.activeIdx : 0];
    const w = g.world, hy = (x, z) => (w.heightAt ? w.heightAt(x, z) : 0);
    let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const rays = [];
    for (let i = 0; i < N; i++) {
      // around the player and along random lines in the sector
      const x = a.ctrl.pos.x + (rnd() - 0.5) * 120, z = a.ctrl.pos.z + (rnd() - 0.5) * 120;
      const y = hy(x, z) + 0.3 + rnd() * 1.8;
      const yaw = rnd() * Math.PI * 2, el = (rnd() - 0.6) * 0.5;
      const d = new T.Vector3(Math.cos(yaw) * Math.cos(el), Math.sin(el), Math.sin(yaw) * Math.cos(el));
      rays.push({ o: new T.Vector3(x, y, z), d, far: i % 3 === 0 ? 60 : i % 3 === 1 ? 7.5 : 25, soft: i % 2 === 0 });
    }
    const rc = new T.Raycaster();
    const run = (mode) => {
      GTrace.mode = mode; const out = []; const t0 = performance.now();
      for (const r of rays) { rc.set(r.o, r.d); rc.near = 0; rc.far = r.far; const h = C.traceRay ? null : null; out.push(null); }
      return { out, ms: performance.now() - t0 };
    };
    // use the game's index through traceRay (soft) and worldVisibleExact (hard) wrappers is indirect; call the index directly
    const idx = (() => { let got = null; const r0 = new T.Raycaster(new T.Vector3(0, 100, 0), new T.Vector3(0, -1, 0), 0, 1); const st = C.traceStats && C.traceStats(); return st; })();
    const near = (r, soft) => { rc.set(r.o, r.d); rc.near = 0; rc.far = r.far; return soft ? C.traceRay(rc) : C._traceHard(rc); };
    if (!C._traceHard) {
      // hard query = what worldVisibleExact uses (traceIndex.nearest(r) without soft)
      C._traceHard = (rr) => { const to = rr.ray.at(rr.far, new T.Vector3()); const from = rr.ray.origin.clone(); let res = null; const vis = C.worldVisibleExact; return vis(from, to) ? null : { distance: -1, object: { name: '(hard)' } }; };
    }
    const res = {};
    for (const mode of ['legacy', 'fast', 'legacy', 'fast']) {
      GTrace.mode = mode;
      const t0 = performance.now(); const out = [];
      for (const r of rays) {
        rc.set(r.o, r.d); rc.near = 0; rc.far = r.far;
        let h;
        if (r.soft) h = C.traceRay(rc);
        else { const to = r.o.clone().addScaledVector(r.d, r.far); h = C.worldVisibleExact(r.o, to) ? null : { distance: -1, object: { uuid: 'hard' } }; }
        out.push(h ? [h.object.uuid, +h.distance.toFixed(4), h.instanceId === undefined ? -1 : h.instanceId] : null);
      }
      res[mode] = { out, ms: +(performance.now() - t0).toFixed(1) };
    }
    let mism = 0, hits = 0; const ex = [];
    for (let i = 0; i < rays.length; i++) {
      const A = res.legacy.out[i], B = res.fast.out[i];
      if (A) hits++;
      const same = (!A && !B) || (A && B && A[0] === B[0] && Math.abs(A[1] - B[1]) < 1e-3);
      if (!same) { mism++; if (ex.length < 8) ex.push({ i, legacy: A, fast: B, far: rays[i].far, soft: rays[i].soft }); }
    }
    GTrace.mode = 'fast';
    return { n: rays.length, hits, mism, ex, msLegacy: res.legacy.ms, msFast: res.fast.ms, stats: C.traceStats && C.traceStats() };
  }, { N });
  console.log(JSON.stringify(R));
  fs.writeFileSync(`${OUTDIR}/tc-${TAG}-${MAP}.json`, JSON.stringify(R, null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
