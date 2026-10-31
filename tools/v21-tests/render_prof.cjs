// Render/CPU profile of a real frame (step + renderFrame) at the player's spawn, 4 view directions.
const OUTDIR = process.env.OUT_DIR || require('path').join(__dirname, 'out'); require('fs').mkdirSync(OUTDIR, { recursive: true });
// Per-pass (main/shadow/other) draw calls + triangles by category (soldier, gun, inst:<name>, ground, ...),
// frame timings, GPerf breakdown, soldier visibility. env BASE TAG MAP SEC Q(quality) W H FRAMES
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8000/', TAG = process.env.TAG || 'v21';
const MAP = process.env.MAP || 'forest_map_camp', SEC = process.env.SEC || '1', Q = process.env.Q || 'low';
const W = +(process.env.W || 960), H = +(process.env.H || 540), FR = +(process.env.FRAMES || 3);
(async () => {
  const t0 = Date.now();
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { const t = m.text(); if (t.startsWith('RP ')) console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', t); });
  await p.addInitScript((Q) => { localStorage.setItem('aegis.settings', JSON.stringify({ quality: Q, volume: 0, calloutSpeech: false, tutorialDone: true, tutDone: true })); }, Q);
  await p.route('**/js/polygon/29_game.js', async (route) => {
    const r = await route.fetch(); let s = await r.text();
    s = s.replace('const go = () => { warm(); startGame(); };', 'const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); };');
    await route.fulfill({ response: r, body: s });
  });
  await p.goto(BASE + 'index.html?map=' + MAP + '&sector=' + SEC, { timeout: 300000 });
  console.log('goto done', (Date.now() - t0) / 1000);
  await p.waitForFunction(() => window.__GAME, null, { timeout: 900000 });
  console.log('game ready', (Date.now() - t0) / 1000);
  const loadS = (Date.now() - t0) / 1000;
  const R = await p.evaluate(async ({ FR }) => {
    const g = __GAME, S = g.state, r = g.renderer, cam = g.camera, T = THREE;
    try { AEGIS_INTRO.markReady(); AEGIS_INTRO.close(); } catch (e) {}
    S.noRender = true; S.paused = true; S.inputOn = true; S.started = true;
    { const st0 = g.step; g.step = (n, dt) => { S.paused = false; try { return st0(n, dt); } finally { S.paused = true; } }; }
    const out = { views: [] };
    for (const s of g.squad) { if (s.char) s.char.root.traverse((o) => { o.userData.__cat = 'soldier'; }); }
    const catOf = (o) => {
      if (o.userData.__cat) return o.userData.__cat;
      for (let q = o.parent; q; q = q.parent) if (q.userData && q.userData.__cat) return q.userData.__cat;
      if (o === g.world.ground) return 'ground';
      let nm = o.name || (o.parent && o.parent.name) || (o.material && o.material.name) || (o.geometry && o.geometry.name) || '';
      if (!nm) nm = o.isInstancedMesh ? 'inst' : o.isPoints ? 'points' : o.isSprite ? 'sprite' : 'mesh';
      nm = nm.replace(/[\d_\-.:#]+.*$/, '') || nm.slice(0, 12);
      return (o.isInstancedMesh ? 'I:' : o.isSkinnedMesh ? 'S:' : '') + nm.slice(0, 24);
    };
    // tag guns
    for (const s of g.squad) for (const k of ['primary', 'pistol']) { const it = s.inv && s.inv[k]; if (it && it.w && it.w.root) it.w.root.traverse((o) => { o.userData.__cat = 'gun'; }); }
    let rec = null;
    const _c = new T.Vector3(); let K = 1;
    const RBD = r.renderBufferDirect;
    r.renderBufferDirect = function (camera, scene, geo, mat, obj, grp) {
      if (rec) {
        const pass = scene === null ? 'shadow' : camera === cam ? 'main' : 'other';
        const idx = geo.index, n = grp ? grp.count : (idx ? idx.count : (geo.attributes.position ? geo.attributes.position.count : 0));
        const dr = geo.drawRange; const cnt = Math.min(n, dr.count === Infinity ? n : dr.count);
        const inst = obj.isInstancedMesh ? obj.count : (geo.isInstancedBufferGeometry ? (geo.instanceCount === Infinity ? 1 : geo.instanceCount) : 1);
        const tris = (mat.wireframe ? 0 : (obj.isMesh ? cnt / 3 : 0)) * inst;
        const c = catOf(obj), P = rec[pass] || (rec[pass] = { calls: 0, tris: 0, cat: {} });
        P.calls++; P.tris += tris; const e = P.cat[c] || (P.cat[c] = [0, 0, 0]); e[0]++; e[1] += tris; e[2] += inst > 1 ? inst : 0;
        if (pass === 'main' && !obj.isInstancedMesh && obj.isMesh && geo.boundingSphere) {
          // экранный радиус объекта (px): сколько вызовов отрисовки тратится на «точки»
          const bs = geo.boundingSphere; _c.copy(bs.center).applyMatrix4(obj.matrixWorld);
          const sc = obj.matrixWorld.getMaxScaleOnAxis(), d = Math.max(0.1, _c.distanceTo(cam.position)), rpx = bs.radius * sc * K / d;
          const H = P.hist || (P.hist = {}), hb = rpx < 0.5 ? 'a<0.5' : rpx < 1 ? 'b<1' : rpx < 2 ? 'c<2' : rpx < 4 ? 'd<4' : 'e>=4';
          const hh = H[hb] || (H[hb] = { calls: 0, tris: 0, cats: {} }); hh.calls++; hh.tris += tris; hh.cats[c] = (hh.cats[c] || 0) + 1;
        }
      }
      return RBD.apply(this, arguments);
    };
    console.log('RP loaded'); g.step(60, 1 / 60); console.log('RP stepped');
    const a = g.squad[S.activeIdx];
    out.player = a ? { pos: a.ctrl.pos.toArray().map((x) => +x.toFixed(1)) } : null;
    out.alive = g.squad.filter((s) => !s.dead).length; out.total = g.squad.length;
    out.res = { w: r.domElement.width, h: r.domElement.height, rs: window.AEGIS_RS, tier: window.AEGIS_QTIER };
    const yaw0 = a ? a.ctrl.yaw : 0;
    for (let v = 0; v < 4; v++) {
      if (a) { a.ctrl.yaw = yaw0 + v * Math.PI / 2; a.ctrl.pitch = -0.05; }
      g.step(10, 1 / 60);
      for (let k = 0; k < 2; k++) { g.step(1, 1 / 60); g.renderNow(1 / 60); }   // warm
      console.log('RP view ' + v + ' warm');
      const st = [], rt = [];
      let last = null;
      for (let k = 0; k < FR; k++) {
        const t1 = performance.now(); g.step(1, 1 / 60); const t2 = performance.now();
        K = r.domElement.height / (2 * Math.tan(cam.fov * Math.PI / 360));
        rec = {}; g.renderNow(1 / 60, 0.3); const t3 = performance.now();
        if (k === FR - 1) last = rec; rec = null;
        st.push(t2 - t1); rt.push(t3 - t2);
      }
      const med = (x) => { const y = x.slice().sort((p, q) => p - q); return +y[y.length >> 1].toFixed(1); };
      const sumP = (P) => P ? { calls: P.calls, tris: Math.round(P.tris), top: Object.entries(P.cat).sort((x, y) => y[1][1] - x[1][1]).slice(0, 14).map(([k, e]) => [k, e[0], Math.round(e[1]), e[2]]), topCalls: Object.entries(P.cat).sort((x, y) => y[1][0] - x[1][0]).slice(0, 10).map(([k, e]) => [k, e[0]]) } : null;
      const visSold = g.squad.filter((s) => s.char && s.char.root.visible && !s.dead).length;
      const hist = last.main && last.main.hist ? Object.fromEntries(Object.entries(last.main.hist).map(([k, h]) => [k, { calls: h.calls, tris: Math.round(h.tris), top: Object.entries(h.cats).sort((x, y) => y[1] - x[1]).slice(0, 6) }])) : null;
      const N = g.world.native, CU = N && N.cull;
      const lod = g.teams && g.teams.state ? g.teams.state().lod : null;
      out.views.push({ v, stepMs: med(st), renderMs: med(rt), main: sumP(last.main), shadow: sumP(last.shadow), other: sumP(last.other), visSoldiers: visSold, info: { calls: r.info.render.calls, tris: r.info.render.triangles }, hist, cull: CU ? { vis: CU.vis, n: CU.n } : null, lod });
    }
    out.perf = window.GPerf ? Object.fromEntries(Object.entries(GPerf.report() || {}).map(([k, v]) => [k, { mean: +v.mean.toFixed(2), p95: +v.p95.toFixed(2), n: v.samples }])) : null;
    let nObj = 0, nMesh = 0, nInst = 0, instTot = 0; g.scene.traverse((o) => { nObj++; if (o.isMesh) nMesh++; if (o.isInstancedMesh) { nInst++; instTot += o.count; } });
    out.scene = { nObj, nMesh, nInst, instTot };
    return out;
  }, { FR });
  R.loadS = loadS; R.errs = errs.slice(0, 10);
  fs.writeFileSync(`${OUTDIR}/rprof-${TAG}-${MAP}.json`, JSON.stringify(R, null, 1));
  console.log('load', loadS, 'alive', R.alive, '/', R.total, 'res', JSON.stringify(R.res), 'scene', JSON.stringify(R.scene));
  for (const v of R.views) {
    console.log(`view ${v.v}: step ${v.stepMs} ms, render ${v.renderMs} ms, visSoldiers ${v.visSoldiers}, main ${v.main && v.main.calls} calls ${v.main && (v.main.tris / 1e6).toFixed(2)}M tris, shadow ${v.shadow && v.shadow.calls} calls ${v.shadow && (v.shadow.tris / 1e6).toFixed(2)}M, other ${v.other && v.other.calls}`);
    console.log('   main top', JSON.stringify(v.main && v.main.top.slice(0, 10)));
    console.log('   main calls', JSON.stringify(v.main && v.main.topCalls));
    console.log('   shadow top', JSON.stringify(v.shadow && v.shadow.top.slice(0, 6)));
    console.log('   px-hist', JSON.stringify(v.hist), 'cull', JSON.stringify(v.cull), 'lod', JSON.stringify(v.lod));
  }
  console.log('perf', JSON.stringify(R.perf));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
