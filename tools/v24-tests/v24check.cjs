// v24: визуальная проверка — FP, небо, дальние цели (прокси вкл/выкл, контраст), укрытия респауна
const L = require('./lib.cjs');
const sharp = require('sharp');
(async () => {
  const MAP = process.env.MAP === 'polygon' ? '' : (process.env.MAP || 'forest_map_camp'), Q = process.env.Q || 'low', TAG = process.env.TAG || 'v24', WX = process.env.WEATHER || 'day', QS = process.env.QS || '';
  const DIST = (process.env.DIST || '20,35,60,100,160').split(',').map(Number);
  const OUT = (process.env.OUT_DIR || require('path').join(__dirname, 'out')) + '/' + TAG + '_' + (MAP || 'polygon') + '_' + WX + '_';
  require('fs').mkdirSync(require('path').dirname(OUT + 'x'), { recursive: true });
  const PARTS = (process.env.PARTS || 'fp,sky,dist,cover').split(',');
  const VW = +(process.env.W || 640), VH = +(process.env.H || 360);
  const { b, p, errs, warns, loadS } = await L.open({ map: MAP, q: Q, qs: QS, weather: WX, w: VW, h: VH });
  await p.evaluate(() => GLod.setProxyMs && GLod.setProxyMs(40));
  await L.step(p, 90);
  const res = { MAP, Q, WX, loadS };
  await p.evaluate(() => { const G = __GAME; const mute = (o, k) => { if (o && typeof o[k] === 'function') { o['_m' + k] = o[k]; o[k] = () => {}; } };
    for (const k of ['update', 'drive', 'fire']) mute(G._C.combat, k); for (const k of ['think', 'drive']) mute(G._C.tactics, k); });
  if (PARTS.includes('fp')) {
    { const u = await p.evaluate(() => { const G = __GAME; for (let i = 0; i < 3; i++) { G.step(1, 1 / 60); G._C.renderFrame(1 / 60); } return G.renderer.domElement.toDataURL('image/png'); });
      require('fs').writeFileSync(OUT + 'fp_canvas.png', Buffer.from(u.split(',')[1], 'base64')); }
    await p.screenshot({ path: OUT + 'fp.png', timeout: 300000 });
    res.fp = await p.evaluate(() => { const G = __GAME, r = G.renderer.info; return { calls: r.render.calls, tris: r.render.triangles, lod: GLod.stats(), batch: G.batch ? G.batch() : null, teamsOn: document.body.classList.contains('teams-on'),
      score: (() => { const e = document.getElementById('score'); return e ? e.getBoundingClientRect().toJSON() : null; })(), teamsH: getComputedStyle(document.body).getPropertyValue('--teamsH') }; });
  }
  if (PARTS.includes('sky')) {
    await p.evaluate(() => { const G = __GAME, c = G.squad[G.state.activeIdx].ctrl; c.pitch = 0.42; });
    await L.shot(p, OUT + 'sky.png', 2);
    await p.evaluate(() => { const G = __GAME, c = G.squad[G.state.activeIdx].ctrl; c.yaw += Math.PI; });
    await L.shot(p, OUT + 'sky2.png', 2);
    await p.evaluate(() => { const G = __GAME, c = G.squad[G.state.activeIdx].ctrl; c.yaw -= Math.PI; c.pitch = 0; });
  }
  if (PARTS.includes('dist')) {
    // направление с самым длинным чистым лучом (Rapier) от глаз игрока
    await p.evaluate(() => { const G = __GAME; if (!(G.state.activeIdx >= 0)) G.embody(G.squad.findIndex((s) => !s.dead)); G.step(2, 1 / 60); });
    const setup = await p.evaluate(() => {
      const G = __GAME, S = G.state, sq = G.squad, me = sq[S.activeIdx], w = G.world, RA = globalThis.RAPIER, P = GPhysics.get(w), sim = P.sim;
      const en = sq.filter((s) => s.team !== me.team && !s.dead);
      const e = en[0] || sq.find((s) => s !== me && !s.dead); if (!e) return { err: 'no target' };   // полигон: противника может не быть — берём любого другого бойца
      const o = me.ctrl.pos, eye = { x: o.x, y: o.y + 1.6, z: o.z };
      const clear = (x, z) => { const y = w.heightAt(x, z) + 1.2; const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z, L = Math.hypot(dx, dy, dz);
        const ux = dx / L, uy = dy / L, uz = dz / L, o0 = { x: eye.x + ux * 0.7, y: eye.y + uy * 0.7, z: eye.z + uz * 0.7 };
        const hit = sim.castRay(new RA.Ray(o0, { x: ux, y: uy, z: uz }), L - 0.7, true, RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_DYNAMIC | RA.QueryFilterFlags.EXCLUDE_KINEMATIC);
        return !hit || hit.timeOfImpact >= L - 1.3; };
      let best = null;
      for (let a = 0; a < 360; a += 6) { const r = a * Math.PI / 180, dx = Math.sin(r), dz = Math.cos(r); let far = 0;
        for (let d = 10; d <= 170; d += 5) { if (!clear(o.x + dx * d, o.z + dz * d)) break; far = d; }
        if (!best || far > best.far) best = { a, far, dx, dz }; }
      window.__v24 = { e: sq.indexOf(e), best };
      return { best, enemy: sq.indexOf(e), me: S.activeIdx, n: en.length };
    });
    res.dist = { setup, rows: [] };
    const tiles = [];
    for (const d0 of DIST) {
      const d = Math.min(d0, setup.best.far || d0);
      const row = { d };
      for (const px of [false, true]) {
        const r = await p.evaluate(async ([d, px]) => {
          const G = __GAME, S = G.state, sq = G.squad, me = sq[S.activeIdx], e = sq[__v24.e], b = __v24.best, w = G.world, T = THREE;
          GLod.setProxy(px);
          const o = me.ctrl.pos, x = o.x + b.dx * d, z = o.z + b.dz * d, y = w.heightAt(x, z);
          const place = (hide) => { e.ctrl.pos.set(x, hide ? y - 60 : y + 0.02, z); e.ctrl.vel.set(0, 0, 0); e.ctrl.yaw = Math.atan2(b.dx, b.dz) + 0.8; if (e.hp !== undefined && e.maxHp) e.hp = e.maxHp; };
          place(false);
          const dir = new T.Vector3(x - o.x, y + 1.2 - (o.y + 1.6), z - o.z);
          me.ctrl.yaw = Math.atan2(-dir.x, -dir.z); me.ctrl.pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
          for (let i = 0; i < 3; i++) { place(false); G.step(1, 1 / 60); G._C.renderFrame(1 / 60); }
          /* заменитель строится в фоне (≤2,5 мс/кадр) — дождаться, если должен включиться */
          let extra = 0; const bt = () => e._lodBodyTr, wantPx = px && (0.95 * (innerHeight / (2 * Math.tan(G.camera.fov * Math.PI / 360)))) / d < 18;
          while (wantPx && extra < 150 && !(bt() && bt().pxOn && (!e._lodGunTr || e._lodGunTr.pxOn || extra > 120))) { place(false); G.step(1, 1 / 60); G._C.renderFrame(1 / 60); extra++; }
          G.renderer.getContext().finish();
          const Rr = G.renderer, orig = Rr.renderBufferDirect; let calls = 0, tris = 0, shCalls = 0; const names = [];
          const mine = (o) => { for (let q = o; q; q = q.parent) if (q === e.char.root || (e.gun && q === e.gun.root)) return true; return false; };
          Rr.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
            if (mine(object)) { if (scene === null) shCalls++; else { calls++; if (names.length < 12) names.push((object.name || object.type) + ':' + (object.parent && object.parent.name || '') + ':' + (geometry.index ? geometry.index.count / 3 : 0)); const ix = geometry.index; tris += (group ? group.count : ix ? ix.count : geometry.attributes.position.count) / 3; } }
            return orig.call(this, camera, scene, geometry, material, object, group); };
          place(false); G._C.renderFrame(1 / 60); Rr.renderBufferDirect = orig;
          const cam = G.camera; const v = new T.Vector3(x, y + 1.0, z).project(cam);
          const st = GLod.stats().proxy;
          return { names: px ? names : undefined, calls, tris: Math.round(tris), shCalls, extra, bodyPx: !!(bt() && bt().pxOn), gunPx: !!(e._lodGunTr && e._lodGunTr.pxOn), sx: (v.x * 0.5 + 0.5) * innerWidth, sy: (-v.y * 0.5 + 0.5) * innerHeight, vz: v.z, px: JSON.stringify(st), vis: e.char.root.visible, fov: cam.fov };
        }, [d, px]);
        console.error('dist', d, px, JSON.stringify(r));
        const R = Math.max(16, Math.min(70, Math.round(600 / d)));
        const cx = Math.round(Math.min(VW - R - 1, Math.max(R, isFinite(r.sx) ? r.sx : VW / 2))), cy = Math.round(Math.min(VH - 1.2 * R - 1, Math.max(1.2 * R, isFinite(r.sy) ? r.sy : VH / 2)));
        const clip = { left: cx - R, top: Math.round(cy - 1.2 * R), width: 2 * R, height: Math.round(2.4 * R) };
        const grab = async (hide) => Buffer.from((await p.evaluate((hide) => { const G = __GAME, e = G.squad[__v24.e], keep = [];
          if (hide) for (const r of [e.char.root, e.gun && e.gun.root]) if (r) r.traverse((o) => { keep.push([o, o.layers.mask]); o.layers.set(31); });
          G._C.renderFrame(1 / 60); const u = G.renderer.domElement.toDataURL('image/png'); for (const [o, m] of keep) o.layers.mask = m; return u; }, hide)).split(',')[1], 'base64');
        const fullA0 = await grab(false), fullB0 = await grab(true);
        
        const fullA = await sharp(fullA0).resize(VW, VH, { fit: 'fill' }).png().toBuffer(), fullB = await sharp(fullB0).resize(VW, VH, { fit: 'fill' }).png().toBuffer();
        const a = await sharp(fullA).extract(clip).png().toBuffer(), bimg = await sharp(fullB).extract(clip).png().toBuffer();
        // контраст цели: доля пикселей с |Δ| > 18 и средняя |Δ| по ним
        const A = await sharp(a).raw().toBuffer({ resolveWithObject: true }), B = await sharp(bimg).raw().toBuffer();
        let n = 0, s = 0; const ch = A.info.channels;
        for (let i = 0; i < A.data.length; i += ch) { const dl = Math.abs(0.3 * (A.data[i] - B[i]) + 0.59 * (A.data[i + 1] - B[i + 1]) + 0.11 * (A.data[i + 2] - B[i + 2])); if (dl > 18) { n++; s += dl; } }
        row[px ? 'on' : 'off'] = { calls: r.calls, tris: r.tris, shCalls: r.shCalls, bodyPx: r.bodyPx, gunPx: r.gunPx, px: n, meanD: n ? Math.round(s / n) : 0, sx: Math.round(r.sx), sy: Math.round(r.sy), vis: r.vis, st: r.px };
        tiles.push({ buf: await sharp(a).resize(240, 288, { kernel: 'nearest', fit: 'fill' }).png().toBuffer(), d, px });
        if (d === DIST[0] && !px) require('fs').writeFileSync(OUT + 'dist_full.png', fullA);
      }
      res.dist.rows.push(row);
    }
    const W = 240, H = 288, cols = 2, rows = Math.ceil(tiles.length / cols);
    await sharp({ create: { width: W * cols, height: H * rows, channels: 3, background: '#000' } }).composite(tiles.map((t, i) => ({ input: t.buf, left: (i % cols) * W, top: Math.floor(i / cols) * H }))).png().toFile(OUT + 'dist.png');
    await p.evaluate(() => GLod.setProxy(true));
  }
  if (PARTS.includes('cover')) {
    const cv = await p.evaluate(() => {
      const G = __GAME, sc = G.scene, me = G.squad[G.state.activeIdx], T = THREE; let im = null;
      sc.traverse((o) => { if (!im && o.name === 'respawn_sandbags') im = o; });
      if (!im) return { err: 'no sandbags' };
      const m = new T.Matrix4(); im.getMatrixAt(0, m); const pos = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3(); m.decompose(pos, q, s);
      const n = new T.Vector3(0, 0, 1).applyQuaternion(q), side = new T.Vector3(1, 0, 0).applyQuaternion(q);
      const cpos = pos.clone().addScaledVector(n, 3.2).addScaledVector(side, 1.2);
      me.ctrl.pos.set(cpos.x, G.world.heightAt(cpos.x, cpos.z) + 0.05, cpos.z); me.ctrl.vel.set(0, 0, 0);
      const dir = pos.clone().sub(me.ctrl.pos); me.ctrl.yaw = Math.atan2(-dir.x, -dir.z); me.ctrl.pitch = -0.28;
      return { n: im.count, pos: pos.toArray().map((v) => +v.toFixed(1)), scale: s.toArray().map((v) => +v.toFixed(2)) };
    });
    res.cover = cv;
    if (!cv.err) { const u = await p.evaluate(() => { const G = __GAME; for (let i = 0; i < 7; i++) { G.step(1, 1 / 60); G._C.renderFrame(1 / 60); } return G.renderer.domElement.toDataURL('image/png'); });
      require('fs').writeFileSync(OUT + 'cover.png', Buffer.from(u.split(',')[1], 'base64')); }
  }
  if (PARTS.includes('signs')) {
    // вывески: вид спереди и сзади — надпись с оборота не должна быть зеркальной (v24: twoFace / vSignGeo)
    const NAMES = ['vsign', 'signGate', 'signMotto', 'boardT'];   // отдельно стоящие (у настенных оборот смотрит в стену)
    const list = await p.evaluate((NAMES) => {
      const G = __GAME, out = [], T = THREE;
      G.scene.traverse((o) => {
        if (!o.isMesh || !o.material || !NAMES.includes(o.material.name)) return;
        const g = o.geometry, P = g.attributes.position, U = g.attributes.uv, n = P.count, blk = 12;
        for (let s = 0; s + blk <= n && out.length < 12; s += blk) {
          const a = new T.Vector3().fromBufferAttribute(P, s).applyMatrix4(o.matrixWorld), b = new T.Vector3().fromBufferAttribute(P, s + 1).applyMatrix4(o.matrixWorld), c = new T.Vector3().fromBufferAttribute(P, s + 2).applyMatrix4(o.matrixWorld);
          const nrm = new T.Vector3().subVectors(b, a).cross(new T.Vector3().subVectors(c, a)).normalize(), ctr = new T.Vector3();
          for (let k = 0; k < 6; k++) ctr.add(new T.Vector3().fromBufferAttribute(P, s + k).applyMatrix4(o.matrixWorld)); ctr.multiplyScalar(1 / 6);
          let cu = 0, cvv = 0; for (let k = 0; k < 3; k++) { cu += U.getX(s + k) / 3; cvv += U.getY(s + k) / 3; }
          const cell = o.material.name === 'vsign' ? Math.floor(cu * 2) + 2 * Math.floor((1 - cvv) * 4) : -1;
          if (o.material.name === 'vsign' && (![0, 5, 6].includes(cell) || Math.abs(Math.max(a.distanceTo(b), a.distanceTo(c)) - 1.3) > 0.05)) continue;   // дорожные знаки 1,3 м
          if (o.material.name !== 'vsign' && out.some((q) => q.name === o.material.name)) continue;
          if (out.some((q) => q.name === o.material.name && q.cell === cell)) continue;
          out.push({ name: o.material.name, cell, side: o.material.side, c: ctr.toArray(), n: nrm.toArray(), verts: n, w: +Math.max(a.distanceTo(b), a.distanceTo(c)).toFixed(2) });
        }
      });
      return out;
    }, NAMES);
    res.signs = list.map((q) => ({ name: q.name, cell: q.cell, side: q.side, verts: q.verts, w: q.w, c: q.c.map((v) => +v.toFixed(1)) }));
    const tiles = [];
    for (const q of list.slice(0, 6)) for (const back of [false, true]) {
      const u = await p.evaluate(([q, back]) => {
        const G = __GAME, me = G.squad[G.state.activeIdx], T = THREE, c = new T.Vector3(...q.c), n = new T.Vector3(...q.n);
        n.y = 0; n.normalize(); if (back) n.negate();
        const d = Math.max(2.6, q.w * 1.25), x = c.x + n.x * d, z = c.z + n.z * d, y = G.world.heightAt(x, z);
        me.ctrl.pos.set(x, y + 0.05, z); me.ctrl.vel.set(0, 0, 0);
        const eye = new T.Vector3(x, y + 1.62, z), dir = c.clone().sub(eye);
        me.ctrl.yaw = Math.atan2(-dir.x, -dir.z); me.ctrl.pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
        for (let i = 0; i < 5; i++) { G.step(1, 1 / 60); me.ctrl.pos.set(x, y + 0.05, z); me.ctrl.yaw = Math.atan2(-dir.x, -dir.z); me.ctrl.pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z)); G._C.renderFrame(1 / 60); }
        return G.renderer.domElement.toDataURL('image/png');
      }, [q, back]);
      tiles.push(await sharp(Buffer.from(u.split(',')[1], 'base64')).extract({ left: Math.round(VW / 2 - 160), top: Math.round(VH / 2 - 100), width: 320, height: 180 }).png().toBuffer());   // центр кадра 1:1
    }
    if (tiles.length) await sharp({ create: { width: 640, height: 180 * Math.ceil(tiles.length / 2), channels: 3, background: '#000' } })
      .composite(tiles.map((t, i) => ({ input: t, left: (i % 2) * 320, top: Math.floor(i / 2) * 180 }))).png().toFile(OUT + 'signs.png');
  }
  res.errs = errs.slice(0, 12); res.nwarn = warns.length; res.warns = warns.slice(0, 6);
  console.log(JSON.stringify(res, null, 1));
  await b.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
