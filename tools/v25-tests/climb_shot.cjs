// Снимки перелаза через высокий забор (Заречье): бот от третьего лица (две камеры) и игрок от первого лица
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://127.0.0.1:8000/', OUT = process.env.OUT || __dirname + '/out/climb';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +(process.env.W || 640), height: +(process.env.H || 480) } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 300)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  await p.addInitScript(() => localStorage.setItem('aegis.settings', JSON.stringify({ quality: 'low', volume: 0, calloutSpeech: false, tutorialDone: true, tutDone: true })));
  await p.route('**/js/polygon/29_game.js', async (route) => {
    const r = await route.fetch(); let s = await r.text();
    s = s.replace('const go = () => { warm(); startGame(); };', 'const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();');
    await route.fulfill({ response: r, body: s });
  });
  const t0 = Date.now();
  await p.goto(BASE + 'index.html?map=stroyka_zarechye_v2&sector=1', { timeout: 300000 });
  await p.waitForFunction(() => window.__GAME, null, { timeout: 900000, polling: 1000 });
  await p.evaluate(() => { try { AEGIS_INTRO.markReady(); AEGIS_INTRO.close(); } catch (e) {} for (const id of ['hud','tutorial','intro','menu','loading']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; } });
  console.log('loaded', ((Date.now() - t0) / 1000).toFixed(0), 's');
  const WX = +(process.env.WX || -100.2), WZ = +(process.env.WZ || 33.4), SG = +(process.env.SG || -1);
  const setup = await p.evaluate(async ({ WX, WZ, SG: SG0, who }) => {
    let SG = SG0;
    const G = __GAME, T = THREE, sq = G.squad, w = G.world, S = G.state;
    for (const k of ['update', 'drive', 'fire']) G._C.combat[k] = () => {};
    for (const k of ['think', 'drive']) G._C.tactics[k] = () => {};
    G._C.teams.update = () => {};
    const P = GPhysics.get(w), sim = P.sim;
    /* выбор места: тонкий высокий забор, обе камеры не в стене и видят бойца до/после */
    const cand = [];
    sim.forEachCollider((col) => { const sh = col.shape; if (!sh || !sh.halfExtents) return; const b = col.parent(); if (b && !b.isFixed()) return;
      const h = sh.halfExtents; if (Math.min(h.x, h.z) < 0.12 && Math.max(h.x, h.z) > 0.8 && h.y > 0.8 && h.y < 1.08) cand.push(col); });
    let best = null, SGb = SG;
    const V = (x, y, z) => ({ x, y, z });
    const vis = (a, b) => { const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, L = Math.hypot(d.x, d.y, d.z); return !P.blocked(a, { x: d.x / L, y: d.y / L, z: d.z / L }, L - 0.3); };
    for (const col of cand) {
      const he = col.shape.halfExtents, t = col.translation(), r = col.rotation(), q = new T.Quaternion(r.x, r.y, r.z, r.w);
      const n = new T.Vector3(he.x < he.z ? 1 : 0, 0, he.x < he.z ? 0 : 1).applyQuaternion(q); n.y = 0; n.normalize();
      const u = new T.Vector3(he.x < he.z ? 0 : 1, 0, he.x < he.z ? 1 : 0).applyQuaternion(q); u.y = 0; u.normalize();
      const top = t.y + he.y;
      for (const sg of [1, -1]) {
        const g0 = w.heightAt(t.x + n.x * sg * 0.75, t.z + n.z * sg * 0.75), g1 = w.heightAt(t.x - n.x * sg * 0.9, t.z - n.z * sg * 0.9);
        if (Math.abs(g0 - g1) > 0.3 || top - g0 < 1.6) continue;
        const cA = V(t.x + n.x * sg * 2.4 + u.x * 1.6, top + 0.1, t.z + n.z * sg * 2.4 + u.z * 1.6), cB = V(t.x - n.x * sg * 2.4 + u.x * 1.6, top + 0.1, t.z - n.z * sg * 2.4 + u.z * 1.6);
        if (P.pointBlocked(cA, 0.25) || P.pointBlocked(cB, 0.25)) continue;
        const sA = V(t.x + n.x * sg * 0.75, g0 + 1.2, t.z + n.z * sg * 0.75), sB = V(t.x - n.x * sg * 0.6, g1 + 1.2, t.z - n.z * sg * 0.6);
        if (!vis(cA, sA) || !vis(cB, sB) || !vis(cA, V(t.x, top + 0.4, t.z)) || !vis(cB, V(t.x, top + 0.4, t.z))) continue;
        best = col; SGb = sg; break;
      }
      if (best) break;
    }
    if (!best) return { err: 'no spot', n: cand.length };
    SG = SGb;
    const he = best.shape.halfExtents, t = best.translation(), r = best.rotation(), q = new T.Quaternion(r.x, r.y, r.z, r.w);
    const n = new T.Vector3(he.x < he.z ? 1 : 0, 0, he.x < he.z ? 0 : 1).applyQuaternion(q); n.y = 0; n.normalize();
    const u = new T.Vector3(he.x < he.z ? 0 : 1, 0, he.x < he.z ? 1 : 0).applyQuaternion(q); u.y = 0; u.normalize();
    window.__CL = { c: { x: t.x, z: t.z }, n, u, top: t.y + he.y, sg: SG };
    let i = who === 'player' ? sq.findIndex((s) => s.team === 'alpha' && !s.dead) : -1;
    if (who === 'player') { G.embody(i); i = S.activeIdx; }
    else i = sq.findIndex((s, k) => k !== S.activeIdx && !s.dead && s.team === 'alpha');
    const s = sq[i], c = s.ctrl;
    const ox = t.x + n.x * SG * 0.75, oz = t.z + n.z * SG * 0.75;
    c.pos.set(ox, w.heightAt(ox, oz) + 0.05, oz); c.vel.set(0, 0, 0); c.vault = null; c.crouch = 0; c.prone = 0; c.reload = -1;
    const yaw = Math.atan2(n.x * SG, n.z * SG);
    for (let k = 0; k < 30; k++) { c.yaw = yaw; c.stamina = 1; G.step(1, 1 / 60); }
    c.stamina = 1;
    /* остальных бойцов убрать подальше от кадра */
    sq.forEach((o, k) => { if (k !== i && !o.dead) { o.ctrl.pos.x += 400; } });
    const ok = who === 'player' ? c.tryVault() : GTraversal.tryStart(c, w, c.PHYS, { x: -n.x * SG, z: -n.z * SG, npc: true });
    window.__CLI = i;
    return { ok, fail: c._vaultFail, dur: c.vault && c.vault.dur, h: c.vault && c.vault.h, i, top: window.__CL.top };
  }, { WX, WZ, SG, who: process.env.WHO || 'bot' });
  console.log('setup', JSON.stringify(setup));
  const us = (process.env.US || '0.08,0.2,0.32,0.44,0.56,0.68,0.8,0.92').split(',').map(Number);
  for (const uu of us) {
    const info = await p.evaluate(async ({ uu, cams }) => {
      const G = __GAME, T = THREE, s = G.squad[__CLI], c = s.ctrl, L = __CL;
      let guard = 0;
      while (c.vault && c.vault.t / c.vault.dur < uu && guard++ < 600) G.step(1, 1 / 60);
      const res = { u: c.vault ? +(c.vault.t / c.vault.dur).toFixed(2) : null, y: +c.pos.y.toFixed(2) };
      window.__SHOTS = [];
      const cam = G.camera, keep = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
      const mid = new T.Vector3(L.c.x, L.top - 0.45, L.c.z);
      const cfg = { A: [L.sg * 2.4, 1.6, 0.1], B: [-L.sg * 2.4, 1.6, 0.1], C: [L.sg * 0.2, 4.2, 1.2], S: [0.0, 3.4, 0.35], S2: [0.0, -3.4, 0.35] };
      for (const k of cams) {
        if (k === 'FP') { cam.position.copy(keep.p); cam.quaternion.copy(keep.q); cam.fov = keep.fov; }
        else {
          const o = cfg[k]; cam.position.set(L.c.x + L.n.x * o[0] + L.u.x * o[1], L.top + o[2], L.c.z + L.n.z * o[0] + L.u.z * o[1]);
          cam.fov = 50; cam.lookAt(mid);
        }
        cam.near = 0.03; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
        if (window.GLod) GLod.frame(cam, G.renderer.domElement.height || 480, G.squad, () => false);
        s.char.root.visible = true; s._lodHid = false; if (s.gun && s.gun.root) s.gun.root.visible = true;
        G.renderer.render(G.scene, cam);
        window.__SHOTS.push(G.renderer.domElement.toDataURL('image/jpeg', 0.85));
      }
      cam.position.copy(keep.p); cam.quaternion.copy(keep.q); cam.fov = keep.fov; cam.updateProjectionMatrix();
      return res;
    }, { uu, cams: (process.env.CAMS || 'A,B').split(',') });
    const shots = await p.evaluate(() => window.__SHOTS);
    shots.forEach((d, k) => fs.writeFileSync(`${OUT}/${process.env.PFX || 'cl'}_${String(uu).replace('.', '')}_${(process.env.CAMS || 'A,B').split(',')[k]}.jpg`, Buffer.from(d.split(',')[1], 'base64')));
    console.log('u', uu, JSON.stringify(info));
  }
  console.log('errors', errs.length, errs.slice(0, 6).join('\n'));
  await b.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
