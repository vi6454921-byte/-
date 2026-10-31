// Профиль вызовов отрисовки одного кадра: по корневым группам сцены, отдельно основной проход и тени
const L = require('./lib.cjs');
(async () => {
  const MAP = process.env.MAP === 'polygon' ? '' : (process.env.MAP || 'forest_map_camp'), Q = process.env.Q || 'low';
  const { b, p, errs, loadS } = await L.open({ map: MAP, q: Q, base: process.env.BASE, qs: process.env.QS || '' });
  await L.step(p, 120);
  /* дальние заменители строятся в фоне по ≤2,5 мс за кадр — для замера ускоряем сборку */
  await p.evaluate(() => { if (window.GLod && GLod.setProxyMs) GLod.setProxyMs(40); });
  await L.render(p, +(process.env.FRAMES || 4));
  const res = await p.evaluate(() => {
    const G = __GAME, R = G.renderer, sc = G.scene;
    const rootOf = (o) => { let x = o, path = []; while (x && x.parent && x.parent !== sc) { x = x.parent; } return x; };
    const soldierOf = (o) => { let x = o; while (x) { if (x.userData && x.userData.soldierKey) return x.userData.soldierKey; x = x.parent; } return null; };
    const sq = new Map(); for (const s of G.squad) { s.char.root.traverse(o => { sq.set(o, s.key); }); }
    const stats = { main: {}, shadow: {}, other: {} };
    const orig = R.renderBufferDirect.bind(R);
    let pass = 'main';
    R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      const isShadow = scene === null && camera && camera.isOrthographicCamera !== undefined && material && (material.isMeshDepthMaterial || material.isMeshDistanceMaterial || material.type === 'ShaderMaterial' && /depth/i.test(material.name || ''));
      const P = scene === null ? 'shadow' : (camera === G.camera ? 'main' : 'other');
      let key = object.userData && object.userData.lodProxy ? 'proxy' : sq.get(object) ? 'soldier' : (rootOf(object)?.name || rootOf(object)?.type || '?');
      if (key === 'level_environment') { // уровень детальнее: второй уровень
        let x = object; while (x.parent && x.parent.name !== 'level_environment') x = x.parent; key = 'env/' + (x.name || x.type);
      }
      const idx = geometry.index, cnt = (group ? group.count : (idx ? idx.count : (geometry.attributes.position ? geometry.attributes.position.count : 0)));
      const inst = object.isInstancedMesh ? object.count : (geometry.isInstancedBufferGeometry ? geometry.instanceCount : 1);
      const tri = (cnt / 3) * (inst || 1);
      const S = stats[P][key] || (stats[P][key] = { calls: 0, tri: 0, skinned: 0 });
      S.calls++; S.tri += tri; if (object.isSkinnedMesh) S.skinned++;
      return orig(camera, scene, geometry, material, object, group);
    };
    R.shadowMap.needsUpdate = true;
    G.step(1, 1 / 60); G._C.renderFrame(1 / 60);
    R.renderBufferDirect = orig;
    const fmt = (o) => Object.entries(o).sort((a, b) => b[1].calls - a[1].calls).slice(0, 25).map(([k, v]) => [k, v.calls, Math.round(v.tri / 1000) + 'k', v.skinned]);
    const tot = (o) => Object.values(o).reduce((a, v) => [a[0] + v.calls, a[1] + v.tri], [0, 0]);
    const alive = G.squad.filter(s => !s.dead).length;
    // видимые солдаты в кадре
    return { lod: (GLod.stats() || {}).proxy || null, batch: G.batch ? G.batch() : null, total: { main: tot(stats.main), shadow: tot(stats.shadow), other: tot(stats.other) }, main: fmt(stats.main), shadow: fmt(stats.shadow), other: fmt(stats.other), squad: G.squad.length, alive };
  });
  if (process.env.SHOT) await L.shot(p, process.env.SHOT, 2);
  console.log(JSON.stringify({ MAP, Q, loadS, ...res, errs: errs.slice(0, 10) }, null, 0).replace(/\],\[/g, '],\n['));
  await b.close(); process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });

