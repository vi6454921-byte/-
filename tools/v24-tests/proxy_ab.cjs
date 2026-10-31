// v24: дальний заменитель против полной модели — один и тот же кадр, одна и та же поза.
// Камера и поза заморожены, кадр рисуется напрямую (renderer.render, без бодикам-эффектов, у которых
// есть память между кадрами — размытие при повороте, покачивание). Для каждой дистанции:
//   A_off — полная модель, A_on — заменитель, B — без цели;
//   маска цели |A−B| > 10 (яркость), пересечение масок (IoU), средний контраст цели к фону |A−B|,
//   разница заменителя и оригинала |A_on−A_off| по маске.
// Размер цели на экране — как при 1920×1080 на дистанции D1080 (окно меньше — дистанция пропорционально ближе).
// Запуск: MAP=stroyka_zarechye_v2 node tools/v24-tests/proxy_ab.cjs   (env: D1080=35,60,100,135, W, H, OUT_DIR)
const L = require('./lib.cjs');
const sharp = require('sharp');
const path = require('path'), fs = require('fs');
(async () => {
  const MAP = process.env.MAP === 'polygon' ? '' : (process.env.MAP || 'stroyka_zarechye_v2');
  const VW = +(process.env.W || 640), VH = +(process.env.H || 360);
  const D1080 = (process.env.D1080 || '35,60,100,135').split(',').map(Number);
  const OUT = process.env.OUT_DIR || path.join(__dirname, 'out');
  fs.mkdirSync(OUT, { recursive: true });
  const { b, p, errs, loadS } = await L.open({ map: MAP, q: process.env.Q || 'low', w: VW, h: VH, weather: process.env.WEATHER || 'day' });
  await p.evaluate(() => { GLod.setProxyMs && GLod.setProxyMs(40); const G = __GAME;
    if (!(G.state.activeIdx >= 0)) G.embody(G.squad.findIndex((s) => !s.dead));
    const mute = (o, k) => { if (o && typeof o[k] === 'function') { o['_m' + k] = o[k]; o[k] = () => {}; } };
    for (const k of ['update', 'drive', 'fire']) mute(G._C.combat, k); for (const k of ['think', 'drive']) mute(G._C.tactics, k); });
  await L.step(p, 60);
  /* уровни LOD деталей в игре достраиваются за первые секунды боя — здесь дожимаем очередь сразу */
  await p.evaluate(() => { let n = 0; while (GLod.stats().queued > 0 && n++ < 400) GLod.pump(50); });
  const setup = await p.evaluate(() => {
    const G = __GAME, S = G.state, sq = G.squad, me = sq[S.activeIdx], w = G.world, RA = globalThis.RAPIER, sim = GPhysics.get(w).sim;
    const e = sq.find((s) => s !== me && !s.dead && s.team !== me.team) || sq.find((s) => s !== me && !s.dead);
    const o = me.ctrl.pos, eye = { x: o.x, y: o.y + 1.6, z: o.z };
    const clear = (x, z) => { const y = w.heightAt(x, z) + 1.2; const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z, Ln = Math.hypot(dx, dy, dz);
      const ux = dx / Ln, uy = dy / Ln, uz = dz / Ln, o0 = { x: eye.x + ux * 0.7, y: eye.y + uy * 0.7, z: eye.z + uz * 0.7 };
      const hit = sim.castRay(new RA.Ray(o0, { x: ux, y: uy, z: uz }), Ln - 0.7, true, RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_DYNAMIC | RA.QueryFilterFlags.EXCLUDE_KINEMATIC);
      return !hit || hit.timeOfImpact >= Ln - 1.3; };
    let best = null;
    for (let a = 0; a < 360; a += 6) { const r = a * Math.PI / 180, dx = Math.sin(r), dz = Math.cos(r); let far = 0;
      for (let d = 6; d <= 60; d += 3) { if (!clear(o.x + dx * d, o.z + dz * d)) break; far = d; }
      if (!best || far > best.far) best = { a, far, dx, dz }; }
    window.__ab = { e: sq.indexOf(e), best };
    return { best, e: sq.indexOf(e), me: S.activeIdx };
  });
  const rows = [], tiles = [];
  for (const D of D1080) {
    const r = await p.evaluate(async (D) => {
      const G = __GAME, S = G.state, sq = G.squad, me = sq[S.activeIdx], e = sq[__ab.e], bst = __ab.best, w = G.world, T = THREE, R = G.renderer, cam = G.camera;
      /* та же высота цели на экране, что при 1080p на D: d = D · (VH/1080) · tan(fov1080/2)/tan(fov/2) — fov тот же → d = D·VH/1080 */
      const d = D * innerHeight / 1080;
      const o = me.ctrl.pos, x = o.x + bst.dx * d, z = o.z + bst.dz * d, y = w.heightAt(x, z);
      const place = () => { e.ctrl.pos.set(x, y + 0.02, z); e.ctrl.vel.set(0, 0, 0); e.ctrl.yaw = Math.atan2(bst.dx, bst.dz) + 0.8; if (e.maxHp) e.hp = e.maxHp; };
      const dir = new T.Vector3(x - o.x, y + 1.0 - (o.y + 1.6), z - o.z);
      me.ctrl.yaw = Math.atan2(-dir.x, -dir.z); me.ctrl.pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
      GLod.setProxy(false);
      for (let i = 0; i < 4; i++) { place(); G.step(1, 1 / 60); G._C.renderFrame(1 / 60); }
      const cp = cam.position.clone(), cq = cam.quaternion.clone(), pm = cam.projectionMatrix.clone(), pmi = cam.projectionMatrixInverse.clone();
      const raw = () => { cam.position.copy(cp); cam.quaternion.copy(cq); cam.updateMatrixWorld(true); cam.projectionMatrix.copy(pm); cam.projectionMatrixInverse.copy(pmi);
        R.setRenderTarget(null); R.render(G.scene, cam); return R.domElement.toDataURL('image/png'); };
      const roots = [e.char.root, e.gun && e.gun.root].filter(Boolean);
      const hide = (h) => { for (const r0 of roots) r0.visible = !h; };
      const tr = () => e._lodBodyTr, gt = () => e._lodGunTr;
      const Aoff = raw(); hide(true); const B = raw(); hide(false);
      const offCalls = (() => { let n = 0; const orig = R.renderBufferDirect; const mine = (ob) => { for (let q = ob; q; q = q.parent) if (roots.includes(q)) return true; return false; };
        R.renderBufferDirect = function (c, s, g, m, ob, gr) { if (s !== null && mine(ob)) n++; return orig.call(this, c, s, g, m, ob, gr); }; raw(); R.renderBufferDirect = orig; return n; })();
      GLod.setProxy(true);
      /* GLod.frame вызывается из шага симуляции, а не из renderFrame — зовём напрямую (поза не меняется) */
      const lodF = () => GLod.frame(cam, R.domElement.height || 720, sq, (s) => s.active && !S.spectate);
      let k = 0; while (k < 60 && !(tr() && tr().pxOn && (!gt() || gt().pxOn))) { lodF(); k++; }
      for (let i = 0; i < 2; i++) G._C.renderFrame(1 / 60);
      const onCalls = (() => { let n = 0; const orig = R.renderBufferDirect; const mine = (ob) => { for (let q = ob; q; q = q.parent) if (roots.includes(q)) return true; return false; };
        R.renderBufferDirect = function (c, s, g, m, ob, gr) { if (s !== null && mine(ob)) n++; return orig.call(this, c, s, g, m, ob, gr); }; raw(); R.renderBufferDirect = orig; return n; })();
      const Aon = raw();
      const v = new T.Vector3(x, y + 0.95, z).project(cam);
      return { D, d: +d.toFixed(1), Aoff, Aon, B, sx: (v.x * 0.5 + 0.5) * innerWidth, sy: (-v.y * 0.5 + 0.5) * innerHeight, bodyPx: !!(tr() && tr().pxOn), gunPx: !!(gt() && gt().pxOn), offCalls, onCalls, waited: k,
        gun: e.gun ? { tracked: !!gt(), wait: !!(gt() && gt().pxWait), fail: !!(gt() && gt().pxFail), vis: !!(e.gun.root && e.gun.root.visible), R: gt() ? +((gt().gunR || 0.45) * (R.domElement.height || 720) / (2 * Math.tan(cam.fov * Math.PI / 360)) / d).toFixed(1) : null } : null, queued: GLod.stats().queued };
    }, D);
    const hPx = 1.8 * VH / (2 * Math.tan(39.56 * Math.PI / 180)) / r.d;   // ≈ рост цели в пикселях (fov 79°)
    const RW = Math.max(10, Math.round(hPx * 0.9)), RH = Math.max(14, Math.round(hPx * 0.85));
    const cx = Math.round(Math.min(VW - RW - 1, Math.max(RW, r.sx))), cy = Math.round(Math.min(VH - RH - 1, Math.max(RH, r.sy)));
    const clip = { left: cx - RW, top: cy - RH, width: 2 * RW, height: 2 * RH };
    const dec = async (u) => { const buf = Buffer.from(u.split(',')[1], 'base64'); const im = sharp(buf).resize(VW, VH, { fit: 'fill' }).extract(clip).removeAlpha();
      return { png: await im.clone().png().toBuffer(), raw: await im.raw().toBuffer() }; };
    const Aoff = await dec(r.Aoff), Aon = await dec(r.Aon), B = await dec(r.B);
    const Y = (a, i) => 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2];
    let nOff = 0, nOn = 0, nAnd = 0, nOr = 0, cOff = 0, cOn = 0, dS = 0;
    for (let i = 0; i < B.raw.length; i += 3) {
      const yo = Math.abs(Y(Aoff.raw, i) - Y(B.raw, i)), yn = Math.abs(Y(Aon.raw, i) - Y(B.raw, i));
      const mo = yo > 10, mn = yn > 10;
      if (mo) { nOff++; cOff += yo; } if (mn) { nOn++; cOn += yn; }
      if (mo && mn) nAnd++; if (mo || mn) { nOr++; dS += (Math.abs(Aon.raw[i] - Aoff.raw[i]) + Math.abs(Aon.raw[i + 1] - Aoff.raw[i + 1]) + Math.abs(Aon.raw[i + 2] - Aoff.raw[i + 2])) / 3; }
    }
    const row = { D1080: r.D, d: r.d, hPx: +hPx.toFixed(1), bodyPx: r.bodyPx, gunPx: r.gunPx, gun: r.gun, queued: r.queued, calls: [r.offCalls, r.onCalls], pixels: [nOff, nOn], IoU: +(nAnd / Math.max(1, nOr)).toFixed(2),
      contrast: [+(cOff / Math.max(1, nOff)).toFixed(1), +(cOn / Math.max(1, nOn)).toFixed(1)], diffRGB: +(dS / Math.max(1, nOr)).toFixed(1) };
    rows.push(row); console.error(JSON.stringify(row));
    const S = Math.max(4, Math.round(160 / (2 * RH)));
    for (const t of [Aoff, Aon, B]) tiles.push(await sharp(t.png).resize(2 * RW * S, 2 * RH * S, { kernel: 'nearest' }).png().toBuffer());
    tiles.W = 2 * RW * S; tiles.H = 2 * RH * S;
  }
  // лист: строка на дистанцию — оригинал | заменитель | без цели (каждая плитка — своего размера, кладём в ячейки 240×200)
  const CW = 240, CH = 200, sheet = [];
  for (let i = 0; i < tiles.length; i++) { const m = await sharp(tiles[i]).resize(CW, CH, { fit: 'contain', background: '#000', kernel: 'nearest' }).png().toBuffer(); sheet.push({ input: m, left: (i % 3) * CW, top: Math.floor(i / 3) * CH }); }
  await sharp({ create: { width: CW * 3, height: CH * Math.ceil(tiles.length / 3), channels: 3, background: '#000' } }).composite(sheet).png().toFile(path.join(OUT, 'proxy_ab_' + (MAP || 'polygon') + '.png'));
  const res = { MAP, VW, VH, loadS, setup, rows, errs: errs.slice(0, 10) };
  fs.writeFileSync(path.join(OUT, 'proxy_ab_' + (MAP || 'polygon') + '.json'), JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res));
  await b.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
