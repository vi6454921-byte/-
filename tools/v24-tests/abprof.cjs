// v24 · A/B в одном кадре (Тихий бор, вид с точки старта): A — как в игре (заменители + склейка),
// B — без заменителей, C — без заменителей и без склейки (рисование как в v23). Сцена та же — сравнение честное.
// Запуск: node tools/v24-tests/abprof.cjs > out/abprof_forest.json   (env: MAP, SEED — зерно Math.random, BASE — другая сборка)
const L = require('./lib.cjs');
(async () => {
  const MAP = process.env.MAP === 'polygon' ? '' : (process.env.MAP || 'forest_map_camp'), Q = process.env.Q || 'low';
  const patch = (s) => s.replace('G.batch = () =>', 'G._QM = QM; G.batch = () =>');   // доступ к склейке только для стенда
  const { b, p, errs, loadS } = await L.open({ map: MAP, q: Q, base: process.env.BASE, qs: process.env.QS || '', patch, seed: +(process.env.SEED || 1) });
  await L.step(p, 120);
  await p.evaluate(() => { if (window.GLod && GLod.setProxyMs) GLod.setProxyMs(40); });
  await L.render(p, +(process.env.FRAMES || 4));
  const measure = () => p.evaluate(() => {
    const G = __GAME, R = G.renderer, sc = G.scene;
    const own = new Map(); for (const s of G.squad) s.char.root.traverse((o) => own.set(o, s));
    const top = (o) => { let x = o; while (x && x.parent && x.parent !== sc) x = x.parent; return x; };
    const st = { main: {}, shadow: {} }, orig = R.renderBufferDirect.bind(R);
    R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      const P = scene === null ? 'shadow' : camera === G.camera ? 'main' : null;
      if (P) {
        let k = object.userData && object.userData.lodProxy ? 'proxy' : own.get(object) ? 'soldier' : (top(object) && (top(object).name || top(object).type)) || '?';
        if (k === 'level_environment' || k === 'level_batches') k = 'env';
        else if (k !== 'soldier' && k !== 'proxy' && k !== 'weaponMount') k = 'other';
        const idx = geometry.index, cnt = group ? group.count : idx ? idx.count : geometry.attributes.position ? geometry.attributes.position.count : 0;
        const inst = object.isInstancedMesh ? object.count : geometry.isInstancedBufferGeometry ? geometry.instanceCount : 1;
        const S = st[P][k] || (st[P][k] = [0, 0]); S[0]++; S[1] += (cnt / 3) * (inst || 1);
      }
      return orig(camera, scene, geometry, material, object, group);
    };
    R.shadowMap.needsUpdate = true; G._C.renderFrame(1 / 60);
    R.renderBufferDirect = orig;
    const sum = (o) => Object.values(o).reduce((a, v) => [a[0] + v[0], a[1] + v[1]], [0, 0]);
    const fmt = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [v[0], Math.round(v[1] / 1000)]]));
    const cam = G.camera.position, vis = (s) => { let x = s.char.root; while (x) { if (!x.visible) return false; x = x.parent; } return true; };
    const shown = G.squad.filter((s) => !s.dead && vis(s)).map((s) => Math.round(Math.hypot(s.ctrl.pos.x - cam.x, s.ctrl.pos.y - cam.y, s.ctrl.pos.z - cam.z)));
    return { main: sum(st.main).map(Math.round), shadow: sum(st.shadow).map(Math.round), byMain: fmt(st.main), byShadow: fmt(st.shadow), soldiersShown: shown.sort((a, b) => a - b), proxy: window.GLod && GLod.stats ? GLod.stats().proxy || null : null };
  });
  /* GLod.frame вызывается из шага симуляции, а не из renderFrame — после переключения зовём его напрямую (без шага, сцена та же) */
  const warm = () => p.evaluate(() => { const G = __GAME, S = G.state;
    if (window.GLod && GLod.frame) for (let i = 0; i < 3; i++) GLod.frame(G.camera, G.renderer.domElement.height || 720, G.squad, (s) => s.active && !S.spectate);
    G._C.renderFrame(1 / 60); G._C.renderFrame(1 / 60); });
  const A = await measure();
  await p.evaluate(() => { if (window.GLod && GLod.setProxy) GLod.setProxy(false); }); await warm();
  const B = await measure();
  await p.evaluate(() => { const Q = __GAME._QM; if (Q && Q.batch) { Q.batch.dispose(); Q.batch = null; } if (window.AEGIS_TINY) { AEGIS_TINY.list = null; AEGIS_TINY.K = 0; } }); await warm();   // K = 0 → отсечение мелочи пересчитает весь список сразу (как в v23)
  const C = await measure();
  console.log(JSON.stringify({ MAP, Q, loadS, A, B, C, errs: errs.slice(0, 10) }));
  await b.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
