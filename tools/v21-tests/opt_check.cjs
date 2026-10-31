// Point 1 correctness + A/B stand on ONE build: forest/tree cell culling on vs off (same frame: image diff,
const OUTDIR = process.env.OUT_DIR || require('path').join(__dirname, 'out'); require('fs').mkdirSync(OUTDIR, { recursive: true });
// draw calls, tris, render ms), soldier view culling (no soldier inside the frame may be hidden unless occluded),
// bullet trace vs trees independent of culling (trace-only static instances). env BASE TAG MAP SEC Q W H
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8000/', TAG = process.env.TAG || 'opt';
const MAP = process.env.MAP || 'forest_map_camp', SEC = process.env.SEC || '1', Q = process.env.Q || 'low';
const W = +(process.env.W || 960), H = +(process.env.H || 540);
(async () => {
  const t0 = Date.now();
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { const t = m.text(); if (t.startsWith('OC ') || /cull|preRender|tinyCull/i.test(t)) console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', t.slice(0, 1200)); });
  await p.addInitScript((Q) => { localStorage.setItem('aegis.settings', JSON.stringify({ quality: Q, volume: 0, calloutSpeech: false, tutorialDone: true, tutDone: true })); }, Q);
  await p.route('**/js/polygon/29_game.js', async (route) => {
    const r = await route.fetch(); let s = await r.text();
    s = s.replace('const go = () => { warm(); startGame(); };', 'const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); };');
    await route.fulfill({ response: r, body: s });
  });
  await p.goto(BASE + 'index.html?map=' + MAP + '&sector=' + SEC, { timeout: 300000 });
  await p.waitForFunction(() => window.__GAME, null, { timeout: 900000 });
  console.log('game ready', (Date.now() - t0) / 1000);
  const R = await p.evaluate(async () => {
    const g = __GAME, S = g.state, r = g.renderer, cam = g.camera, T = THREE, C = g._C;
    try { AEGIS_INTRO.markReady(); AEGIS_INTRO.close(); } catch (e) {}
    S.noRender = true; S.paused = true; S.inputOn = true; S.started = true;
    { const st0 = g.step; g.step = (n, dt) => { S.paused = false; try { return st0(n, dt); } finally { S.paused = true; } }; }
    g.step(60, 1 / 60);
    const a = g.squad[S.activeIdx >= 0 ? S.activeIdx : 0];
    const N = g.world.native, CU = N.cull || null;
    const out = { hasCull: !!CU, views: [], trace: [], soldiers: [] };
    const POST = C.getPost && C.getPost();
    const shot = async () => {
      if (POST && POST.grade) POST.grade.uniforms.uTime.value = 5;
      r.shadowMap.needsUpdate = true;
      const t1 = performance.now();
      const url = g.renderPNG(1e-6);
      const ms = performance.now() - t1;
      const info = { calls: r.info.render.calls, tris: r.info.render.triangles };
      const img = new Image(); img.src = url; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
      return { ms, info, px: cx.getImageData(0, 0, cv.width, cv.height).data, url };
    };
    const diff = (A, B) => {
      let n = 0, big = 0, sum = 0;
      for (let i = 0; i < A.length; i += 4) {
        const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
        sum += d; if (d > 12) n++; if (d > 48) big++;
      }
      return { gt12: n, gt48: big, mean: +(sum / (A.length / 4)).toFixed(3) };
    };
    const yaw0 = a.ctrl.yaw;
    const fr = new T.Frustum(), pm = new T.Matrix4(), bx = new T.Box3(), v3 = new T.Vector3();
    for (let v = 0; v < 4; v++) {
      a.ctrl.yaw = yaw0 + v * Math.PI / 2; a.ctrl.pitch = -0.05;
      g.step(8, 1 / 60);
      if (CU) CU.on = true;
      const TY = window.AEGIS_TINY;
      if (TY) TY.on = true;
      const A1 = await shot(), A2 = await shot();
      const cullA = CU ? { vis: CU.vis, n: CU.n } : null, tinyA = TY ? { hid: TY.hid, n: TY.list ? TY.list.length : 0 } : null;
      let B1 = null, B2 = null, T1 = null;
      if (CU) { CU.on = false; B1 = await shot(); CU.on = true; }
      if (TY) { TY.on = false; T1 = await shot(); TY.on = true; }
      const lod = g.teams && g.teams.state ? g.teams.state().lod : null;
      // soldiers: inside the frame (feet..head box in frustum) but hidden and not occluded = violation
      cam.updateMatrixWorld(); pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
      const viol = [];
      let inFrame = 0, visCnt = 0;
      for (const s of g.squad) {
        if (s === a || s.dead || !s.char) continue;
        const q = s.ctrl.pos; bx.min.set(q.x - 0.35, q.y, q.z - 0.35); bx.max.set(q.x + 0.35, q.y + 1.85, q.z + 0.35);
        const inF = fr.intersectsBox(bx);
        if (inF) inFrame++;
        if (s.char.root.visible) visCnt++;
        if (inF && !s.char.root.visible && !((s._occN || 0) >= 2)) viol.push({ d: +Math.hypot(q.x - cam.position.x, q.z - cam.position.z).toFixed(1), occN: s._occN || 0 });
      }
      const vw = { v, cullA, tinyA, A: A1.info, msA: +((A1.ms + A2.ms) / 2).toFixed(1), noiseA: diff(A1.px, A2.px), lod, soldiers: { inFrame, visible: visCnt, viol } };
      vw.urlA = A1.url;
      if (B1) { vw.B = B1.info; vw.msB = +B1.ms.toFixed(1); vw.diffAB = diff(A1.px, B1.px); vw.urlB = B1.url; }
      if (T1) { vw.T = T1.info; vw.msT = +T1.ms.toFixed(1); vw.diffAT = diff(A1.px, T1.px); vw.urlT = T1.url; }
      out.views.push(vw);
      console.log('OC view ' + v + ' ' + JSON.stringify(Object.assign({}, vw, { urlA: undefined, urlB: undefined, urlT: undefined, lod: undefined })));
    }
    a.ctrl.yaw = yaw0;
    // trace vs trees: trace-only static instances near the player, ray at trunk height from 3 m
    const tr = [];
    g.scene.traverse((o) => { if (o.isInstancedMesh && o.userData && o.userData.traceOnly && /^tree_trunk_/.test(o.name)) tr.push(o); });
    out.traceIMs = tr.length;
    const m4 = new T.Matrix4(), pos = new T.Vector3(), qq = new T.Quaternion(), sc = new T.Vector3();
    const cand = [];
    const pp = a.ctrl.pos;
    for (const im of tr) for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m4); m4.decompose(pos, qq, sc); if (sc.x < 1e-4) continue;
      const d = Math.hypot(pos.x - pp.x, pos.z - pp.z); if (d > 6 && d < 40) cand.push({ im, i, x: pos.x, y: pos.y, z: pos.z, d });
    }
    cand.sort((x, y) => x.d - y.d);
    const rc = new T.Raycaster();
    const testTree = (c) => {
      const res = [];
      for (const ang of [0, 2.1, 4.2]) {
        const o = new T.Vector3(c.x + Math.cos(ang) * 3, c.y + 1.2, c.z + Math.sin(ang) * 3), d = new T.Vector3(c.x, c.y + 1.2, c.z).sub(o).normalize();
        rc.set(o, d); rc.near = 0; rc.far = 6;
        const h = C.traceRay(rc);
        res.push(h ? { obj: h.object && h.object.name, inst: h.instanceId, dist: +h.distance.toFixed(2), same: h.object && h.object.userData.traceOnly && h.instanceId === c.i } : null);
      }
      return res;
    };
    for (const c of cand.slice(0, 6)) {
      const front = testTree(c);
      // turn away and render (cull on) -> trace again
      a.ctrl.yaw = Math.atan2(-(c.x - pp.x), -(c.z - pp.z)); g.step(4, 1 / 60); await shot();
      const back = testTree(c);
      out.trace.push({ d: +c.d.toFixed(1), name: c.im.name, i: c.i, front, back });
    }
    out.traceStats = C.traceStats ? C.traceStats() : null;
    out.cullFinal = CU ? { vis: CU.vis, n: CU.n, flips: CU.flips } : null;
    out.glod = window.GLod ? GLod.stats() : null;
    out.mgFar = (() => { let n = 0, c = 0; g.scene.traverse((o) => { if (o.name === 'mgFar') { n++; c += o.count; } }); return { meshes: n, count: c }; })();
    return out;
  });
  R.errs = errs.slice(0, 10);
  for (const v of R.views) {
    for (const k of ['urlA', 'urlB', 'urlT']) if (v[k]) { fs.writeFileSync(`${OUTDIR}/oc-${TAG}-${MAP}-v${v.v}-${k.slice(3)}.png`, Buffer.from(v[k].split(',')[1], 'base64')); delete v[k]; }
  }
  fs.writeFileSync(`${OUTDIR}/oc-${TAG}-${MAP}.json`, JSON.stringify(R, null, 1));
  console.log(JSON.stringify({ trace: R.trace, traceIMs: R.traceIMs, traceStats: R.traceStats, cullFinal: R.cullFinal, mgFar: R.mgFar, errs: R.errs }));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
