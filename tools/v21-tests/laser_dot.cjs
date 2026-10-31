// Controlled laser stand: open line of sight, a soldier placed at D m facing the shooter, laser on the chest;
const OUTDIR = process.env.OUT_DIR || require('path').join(__dirname, 'out'); require('fs').mkdirSync(OUTDIR, { recursive: true });
// plus ground at ~7 m. PNG renders + projected dot coords -> analyze red excess. env BASE TAG MAP SEC LASER
const { chromium } = require('playwright');
const fs = require('fs');
const MAP = process.env.MAP || 'forest_map_camp', SEC = process.env.SEC || '1', TAG = process.env.TAG || 'v21';
const PART = process.env.LASER || 'peq15', W = 960, H = 540;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.addInitScript(() => { localStorage.setItem('aegis.settings', JSON.stringify({ quality: 'low', volume: 0, calloutSpeech: false, tutorialDone: true, tutDone: true })); });
  await p.route('**/js/polygon/29_game.js', async (route) => {
    const r = await route.fetch(); let s = await r.text();
    s = s.replace('const go = () => { warm(); startGame(); };', 'const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); };');
    await route.fulfill({ response: r, body: s });
  });
  await p.goto((process.env.BASE || 'http://127.0.0.1:8000/') + (MAP === 'none' ? 'index.html' : 'index.html?map=' + MAP + '&sector=' + SEC), { timeout: 300000 });
  await p.waitForFunction(() => window.__GAME, null, { timeout: 900000 });
  const res = await p.evaluate(async ({ PART, W, H, process_env }) => {
    const g = __GAME, S = g.state, w = g.world, T = THREE, cam = g.camera, r = g.renderer;
    try { AEGIS_INTRO.markReady(); AEGIS_INTRO.close(); } catch (e) {}
    S.noRender = true; S.paused = true; S.inputOn = true; S.pointerLocked = true; S.started = true;
    for (const k of ['update', 'drive', 'fire']) if (g._C.combat) g._C.combat[k] = () => {};
    for (const k of ['think', 'drive']) if (g._C.tactics) g._C.tactics[k] = () => {};
    if (g._C.teams) { g._C.teams.update = () => {}; }
    if (!(S.activeIdx >= 0)) { try { g.embody(0); } catch (e) {} }
    { const st0 = g.step; S.paused = false; try { st0(10, 1 / 60); } finally { S.paused = true; } }
    const a = g.squad[S.activeIdx >= 0 ? S.activeIdx : 0], c = a.ctrl;
    { const h0 = g.dmg.hit; g.dmg.hit = function () { return null; }; }
    { const st0 = g.step; g.step = (n, dt) => { S.paused = false; try { return st0(n, dt); } finally { S.paused = true; } }; }
    try { AEGIS_GAME.weather('day'); } catch (e) {}
    const R = {};
    const L = AEGIS_GAME.loadout(a.key);
    const gid = (L.slots.find((s) => s && s.t === 'gun' && !/glock/.test(s.id)) || {}).id;
    const wt = GGuns.build(gid, (L.cfg && L.cfg[gid]) || {}, {});
    let slot = null;
    for (const sl of wt.asm.def.slots) {
      const cfg = Object.assign({}, wt.cfg, { [sl.id]: PART });
      const ap = wt.asm.apply(cfg);
      if (ap[sl.id] && wt.asm.withInfo('laser').length) { slot = sl.id; break; }
    }
    R.gun = gid; R.slot = slot;
    if (!slot) return R;
    L.cfg = L.cfg || {}; L.cfg[gid] = Object.assign({}, wt.cfg, { [slot]: PART });
    AEGIS_GAME.setLoadout(a.key, L);
    g.step(30, 1 / 60);
    R.tac = g.tac(true, false);
    let beam = null; g.scene.traverse((o) => { if (!beam && o.material && o.material.uniforms && o.material.uniforms.uA && o.material.uniforms.uB && o.material.uniforms.uLen) beam = o; });
    let dotM = null; g.scene.traverse((o) => { if (!dotM && o.material && o.material.uniforms && o.material.uniforms.uPk) dotM = o; });
    // open spot inside the active sector: no canopy, flat, clear 30 m line at chest height, nearest to the spawn
    if (g._C.teams) g._C.teams.lod = () => {};
    const hy = (x, z) => (w.heightAt ? w.heightAt(x, z) : 0);
    const can = (x, z) => (window.GGloom && GGloom.canopyAt ? GGloom.canopyAt(x, z) : 0);
    const sec = w.sector, inSec = (x, z, mg) => !sec || !sec.margin || sec.margin(x, z) > mg;
    const tr = g._C.traceRay, ray = new T.Raycaster();
    const o0 = c.pos.clone();
    let best = null;
    for (let gx = -150; gx <= 150 && !(best && best.d < 30); gx += 6) for (let gz = -150; gz <= 150; gz += 6) {
      const x = o0.x + gx, z = o0.z + gz, dd = Math.hypot(gx, gz);
      if (best && dd >= best.d) continue;
      if (!inSec(x, z, 6) || can(x, z) > 0.03) continue;
      for (let k = 0; k < 16; k++) {
        const yaw = k / 16 * Math.PI * 2, dx = -Math.sin(yaw), dz = -Math.cos(yaw);
        let ok = true;
        for (let s2 = 2; s2 <= 26 && ok; s2 += 2) { const qx = x + dx * s2, qz = z + dz * s2; if (!inSec(qx, qz, 2) || can(qx, qz) > 0.06 || Math.abs(hy(qx, qz) - hy(x, z)) > 1.2) ok = false; }
        if (!ok) continue;
        const P = new T.Vector3(x, hy(x, z) + 1.4, z); ray.set(P, new T.Vector3(dx, 0, dz)); ray.far = 26;
        const h = tr ? tr(ray) : null; if (h) continue;
        /* the picture must be clear too: foliage cards are not solid for bullets (soft trace) but hide the dot */
        const vis = g._C.worldVisibleExact;
        if (vis) { let clear = true; for (const yy of [1.25, 1.45, 1.6]) { const A = new T.Vector3(x, hy(x, z) + yy, z), B = A.clone().add(new T.Vector3(dx * 22, 0, dz * 22)); if (!vis(A, B)) { clear = false; break; } } if (!clear) continue; }
        { const A = new T.Vector3(x, hy(x, z) + 1.45, z), B = new T.Vector3(x + dx * 7, hy(x + dx * 7, z + dz * 7) + 0.05, z + dz * 7); if (vis && !vis(A, B)) continue; }
        best = { x, z, yaw, d: dd }; break;
      }
    }
    R.spot = best;
    if (!best) return R;
    const SP = { x: best.x, z: best.z }, yaw0 = best.yaw;
    c.pos.set(SP.x, hy(SP.x, SP.z) + 0.1, SP.z); c.vel.set(0, 0, 0); c.yaw = yaw0; c.pitch = -0.03;
    g.step(60, 1 / 60);
    const dir = new T.Vector3(-Math.sin(yaw0), 0, -Math.cos(yaw0));
    const P0 = c.pos.clone(); P0.y += 1.4;
    const m = g.squad.find((q) => q !== a && !q.dead && q.char);
    for (const o of g.squad) if (o !== a && o !== m && o.char) { o.char.root.visible = false; o.ctrl.pos.set(P0.x - 60, hy(P0.x - 60, P0.z - 60), P0.z - 60); }
    const park = () => { m.ctrl.pos.set(P0.x + 40, hy(P0.x + 40, P0.z - 40) + 0.05, P0.z - 40); m.char.root.visible = false; };
    const shots = [];
    const proj = (v) => { const q = v.clone().project(cam); return [Math.round((q.x + 1) / 2 * W), Math.round((1 - q.y) / 2 * H)]; };
    r.setPixelRatio(1); r.setSize(W, H); cam.aspect = W / H; cam.updateProjectionMatrix();
    const shot = (tag, extra) => {
      const url = g.renderPNG(1 / 60);
      const B = beam.material.uniforms.uB.value.clone();
      const U = dotM ? dotM.material.uniforms : null;
      shots.push(Object.assign({ tag, url, dot: proj(B), len: +beam.material.uniforms.uLen.value.toFixed(2), dotVis: dotM ? dotM.visible : null, pk: U ? +U.uPk.value.toExponential(3) : null, rs: U ? +U.uRs.value.toFixed(4) : null, el: U ? +U.uEl.value.toFixed(2) : null }, extra || {}));
    };
    park(); g.step(30, 1 / 60);
    R.exposure = r.toneMappingExposure; R.tm = r.toneMapping;
    const diag = (tag) => {
      if (!dotM) return;
      const U = dotM.material.uniforms, pk = U.uPk.value;
      dotM.material.depthTest = false; dotM.material.needsUpdate = true; shot(tag + '-nodepth'); dotM.material.depthTest = true; dotM.material.needsUpdate = true;
      const keep = dotM.onBeforeRender; dotM.onBeforeRender = () => { U.uPk.value = pk * 20; }; shot(tag + '-x20'); dotM.onBeforeRender = keep;
    };
    c.pitch = -0.03; g.step(20, 1 / 60); shot('far'); diag('far');
    for (const D of [5, 10, 15]) {
      const q = P0.clone().addScaledVector(dir, D);
      m.ctrl.pos.set(q.x, hy(q.x, q.z) + 0.05, q.z); m.ctrl.vel.set(0, 0, 0); m.motion = null; m._lodHid = false; m._lodI = 0; m._lodR = 0; m.tmShield = 0;
      m.ctrl.yaw = yaw0 + Math.PI; m.idleYaw = yaw0 + Math.PI; m.char.root.visible = true;
      c.yaw = yaw0; g.step(30, 1 / 60);
      const chest = m.ctrl.pos.clone(); chest.y += 1.25;
      const eye = cam.position.clone();
      c.pitch = Math.atan2(chest.y - eye.y, Math.hypot(chest.x - eye.x, chest.z - eye.z));
      g.step(40, 1 / 60);
      shot('soldier' + D, { D, mPos: m.ctrl.pos.toArray().map((x) => +x.toFixed(2)), mVis: m.char.root.visible });
    }
    park();
    c.pitch = -Math.atan2(1.4, 7); g.step(40, 1 / 60); shot('ground7'); diag('ground7');
    c.pitch = -Math.atan2(1.4, 12); g.step(40, 1 / 60); shot('ground12');
    R.shots = shots;
    return R;
  }, { PART, W, H, process_env: { SX: process.env.SX, SZ: process.env.SZ, YAW: process.env.YAW } });
  for (const s of res.shots || []) { fs.writeFileSync(`${OUTDIR}/ld-${TAG}-${s.tag}.png`, Buffer.from(s.url.split(',')[1], 'base64')); delete s.url; }
  fs.writeFileSync(`${OUTDIR}/ld-${TAG}.json`, JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
