// Live test of the M2HB nests: mount via short F, look (mouse), fire (LMB), ammo/yaw/pitch/camera checks.
const OUTDIR = process.env.OUT_DIR || require('path').join(__dirname, 'out'); require('fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium } = require('playwright');
const MAP = process.env.MAP || 'stroyka_zarechye_v2';
const SEC = process.env.SEC || '3';
const BASE = process.env.BASE || 'http://127.0.0.1:8000/';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  p.on('console', (m) => { const t = m.text(); if (/mg|warn|error/i.test(t) && !/GPU|WebGL|swiftshader/i.test(t)) console.log('  [console]', t.slice(0, 240)); });
  await p.addInitScript(() => { localStorage.setItem('aegis.settings', JSON.stringify({ quality: 'low', volume: 0, calloutSpeech: false })); });
  await p.route('**/js/polygon/29_game.js', async (route) => {
    const r = await route.fetch(); let s = await r.text();
    s = s.replace('const go = () => { warm(); startGame(); };', 'const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();');
    await route.fulfill({ response: r, body: s });
  });
  await p.goto(BASE + 'index.html?map=' + MAP + '&sector=' + SEC);
  await p.waitForFunction(() => window.__GAME, null, { timeout: 900000 });
  const out = await p.evaluate(async () => {
    const g = __GAME, S = g.state, w = g.world, T = THREE;
    try { AEGIS_INTRO.markReady(); AEGIS_INTRO.close(); } catch (e) {}
    const R = { info0: { mode: S.mode, activeIdx: S.activeIdx, inputOn: S.inputOn } };
    const sec = w.sector;
    R.nests = (w.mg && w.mg.nests || []).map((N, i) => ({ i, gx: +N.gx.toFixed(2), gy: +N.gy.toFixed(2), gz: +N.gz.toFixed(2), face: +N.face.toFixed(2), m: sec ? +sec.margin(N.gx, N.gz).toFixed(1) : null, ammo: N.ammo, reserve: N.reserve }));
    const N = (w.mg.nests || []).filter((n) => !sec || sec.margin(n.gx, n.gz) > 0)[0];
    if (!N) return R;
    if (S.activeIdx < 0) { const i = g.squad.findIndex((s) => s.team === 'alpha' || /alpha/.test(s.key)); g.embody(i >= 0 ? i : 0); g.step(2, 1 / 60); }
    R.info1 = { mode: S.mode, activeIdx: S.activeIdx, inputOn: S.inputOn };
    const a = g.squad[S.activeIdx];
    // изолированный стенд: другие бойцы не стреляют (иначе бой может убить наводчика посреди проверки)
    for (const s of g.squad) if (s !== a && s.ctrl) s.ctrl.canFire = () => false;
    const shots = []; let CC = null;
    const up0 = GMG.update; GMG.update = function (dt, ctx) { if (!CC && ctx && ctx.C) { CC = ctx.C; const f0 = CC.fireMG; CC.fireMG = function (from, dir, sh) { const r = f0.apply(this, arguments); shots.push({ from: from.toArray(), dir: dir.toArray(), hit: r && r.hit ? r.hit.point.toArray() : null, soldier: !!(r && r.soldier) }); return r; }; } return up0.apply(this, arguments); };
    const seat = GMG.seatOf(N);
    a.ctrl.pos.set(seat.x, N.gy + 0.05, seat.z); a.ctrl.vel.set(0, 0, 0);
    g.step(20, 1 / 60);
    R.afterTeleport = { pos: a.ctrl.pos.toArray().map((v) => +v.toFixed(2)), near: GMG.nearest(w, a.ctrl.pos) === N };
    // short F through real key events
    S.inputOn = true;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
    g.step(3, 1 / 60);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' }));
    g.step(6, 1 / 60);
    R.mounted = GMG.isMounted(a);
    S.pointerLocked = true; S.started = true;
    a.ctrl.pitch = -0.045; // slightly down: rounds must land on the ground ahead
    g.renderer.domElement.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    const tq = performance.now(); let ammoQ = N.ammo, steps = 0, trigLost = 0, swapDone = -1;
    for (let k = 0; k < 40; k++) { g.step(1, 1 / 60); steps++; if (!GMG.state().trigger) trigLost++; if (swapDone < 0 && !a.ctrl.armed && a.cur == null) swapDone = k; await new Promise((r) => setTimeout(r, 5)); }
    const wall = (performance.now() - tq) / 1000;
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    g.step(2, 1 / 60);
    R.earlyFire = { shots: ammoQ - N.ammo, expect: Math.min(steps, Math.floor(wall / (60 / 520)) + 1), steps, wall: +wall.toFixed(2), trigLost, swapDone, slot: a.slot, armed: a.ctrl.armed, mgState: GMG.state(), triggerHeldCtrl: a.ctrl.triggerHeld };
    { const sp = GMG.sightPose(N, T, { pos: new T.Vector3(), quat: new T.Quaternion() }); const los = new T.Vector3(0, 0, -1).applyQuaternion(sp.quat);
      R.earlyErr = shots.slice(0, 14).map((q) => { if (!q.hit) return null; const h = new T.Vector3().fromArray(q.hit), v = h.clone().sub(sp.pos); const d = v.length(); return { d: +d.toFixed(1), errDeg: +(Math.acos(Math.min(1, v.normalize().dot(los))) * 180 / Math.PI).toFixed(3), soldier: q.soldier }; }); }
    R.afterMount = { pos: a.ctrl.pos.toArray().map((v) => +v.toFixed(2)), yaw: +a.ctrl.yaw.toFixed(3), pitch: +a.ctrl.pitch.toFixed(3), slot: a.slot, armed: a.ctrl.armed, Nyaw: N.yaw, face: N.face };
    const cam = g.camera; cam.updateMatrixWorld(true);
    const dir = new T.Vector3(); cam.getWorldDirection(dir);
    N.root.updateMatrixWorld(true);
    const muzzle = N.gunG.localToWorld(new T.Vector3(1.3, 0.155, 0));
    const pivot = N.gunG.localToWorld(new T.Vector3(0, 0, 0));
    R.cam = { pos: cam.position.toArray().map((v) => +v.toFixed(2)), dir: dir.toArray().map((v) => +v.toFixed(3)), muzzle: muzzle.toArray().map((v) => +v.toFixed(2)), pivot: pivot.toArray().map((v) => +v.toFixed(2)), eyeAboveGun: +(cam.position.y - pivot.y).toFixed(2), camToPivot: +cam.position.distanceTo(pivot).toFixed(2) };
    // what does the camera ray hit first?
    const rc = new T.Raycaster(cam.position.clone(), dir.clone(), 0.02, 60); rc.camera = cam;
    const hits = rc.intersectObjects(g.scene.children.filter((o) => !o.isSprite && !o.isPoints), true).filter((h) => h.object.visible !== false).slice(0, 6);
    R.camHits = hits.map((h) => ({ d: +h.distance.toFixed(2), name: h.object.name || h.object.type, par: h.object.parent && (h.object.parent.name || h.object.parent.type) }));
    // mouse look: 300 px right, 100 px up
    S.pointerLocked = true; S.started = true;
    const yaw0 = a.ctrl.yaw, nyaw0 = N.yaw;
    for (let k = 0; k < 10; k++) { window.dispatchEvent(new MouseEvent('mousemove', { movementX: 30, movementY: -10 })); g.step(1, 1 / 60); }
    R.look = { yaw0: +yaw0.toFixed(3), yaw1: +a.ctrl.yaw.toFixed(3), pitch1: +a.ctrl.pitch.toFixed(3), Nyaw0: +nyaw0.toFixed(3), Nyaw1: +N.yaw.toFixed(3), Npitch: +N.pitch.toFixed(3), yawG: +N.yawG.rotation.y.toFixed(3), gunZ: +N.gunG.rotation.z.toFixed(3) };
    cam.getWorldDirection(dir);
    R.look.camDir = dir.toArray().map((v) => +v.toFixed(3));
    { const sp = GMG.sightPose(N, T, { pos: new T.Vector3(), quat: new T.Quaternion() }); const los = new T.Vector3(0, 0, -1).applyQuaternion(sp.quat); R.look.losDir = los.toArray().map((v) => +v.toFixed(3)); R.look.camVsLos = +Math.acos(Math.min(1, los.dot(dir))).toFixed(4); R.look.eye = sp.pos.toArray().map((v) => +v.toFixed(2)); R.look.cam = cam.position.toArray().map((v) => +v.toFixed(2)); }
    // zoom (RMB hold)
    const fov0 = cam.fov;
    g.renderer.domElement.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
    g.step(40, 1 / 60);
    R.zoom = { fov0: +fov0.toFixed(1), fov1: +cam.fov.toFixed(1), st: GMG.state() };
    window.dispatchEvent(new MouseEvent('mouseup', { button: 2 }));
    g.step(40, 1 / 60);
    R.zoom.fov2 = +cam.fov.toFixed(1);
    // fire with LMB (real mouse event on canvas)
    const ammo0 = N.ammo, ts0 = g.traceStats ? JSON.stringify(g.traceStats()) : null;
    g.renderer.domElement.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    g.step(1, 1 / 60);
    R.trig = a.ctrl.triggerHeld;
    const t0 = performance.now();
    while (performance.now() - t0 < 2000) { g.step(1, 1 / 60); await new Promise((r) => setTimeout(r, 16)); }
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    g.step(2, 1 / 60);
    // aim accuracy: each hit vs line of sight from the eye
    const sp = GMG.sightPose(N, T, { pos: new T.Vector3(), quat: new T.Quaternion() }); const los = new T.Vector3(0, 0, -1).applyQuaternion(sp.quat);
    R.shotErr = shots.slice(-12).map((q) => { if (!q.hit) return null; const h = new T.Vector3().fromArray(q.hit), v = h.clone().sub(sp.pos); const d = v.length(); return { d: +d.toFixed(1), errDeg: +(Math.acos(Math.min(1, v.normalize().dot(los))) * 180 / Math.PI).toFixed(3) }; });
    R.fire = { ammo0, ammo1: N.ammo, reserve: N.reserve, trig: a.ctrl.triggerHeld, ts0, ts1: g.traceStats ? JSON.stringify(g.traceStats()) : null, mgWarn: S._mgWarn || 0 };
    // dismount with short F
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' })); g.step(2, 1 / 60);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' })); g.step(4, 1 / 60);
    R.dismount = { mounted: GMG.isMounted(a), slot: a.slot, armed: a.ctrl.armed, pos: a.ctrl.pos.toArray().map((v) => +v.toFixed(2)) };
    R.end = { dead: !!a.dead, death: !!S.death, mode: S.mode };
    return R;
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
