/* AEGIS v24 · статический батчинг окружения (только рендер-копии).
   Зачем: на слабых ПК кадр упирается не в пиксели, а в число вызовов
   отрисовки — каждый мелкий меш карты (доска, мешок, ящик, бревно) это
   отдельный draw call в кадре и ещё один в карте теней. Здесь неподвижные
   непрозрачные меши одного материала, лежащие в одной клетке 32×32 м,
   склеиваются в один меш (вершины переводятся в мировые координаты).

   Оригиналы НЕ удаляются и не скрываются через visible: они уходят на слой
   28 — их не видят ни камера, ни карта теней, но пуля (GTrace смотрит на
   visible и сам вызывает raycast), декали (луч со всеми слоями), физика и
   звук работают с ними как раньше. Склейка — чистая картинка: raycast у неё
   пустой, в индекс трассировки она не попадает (лежит вне level_environment).

   Сторож: каждый кадр проверяется часть оригиналов (матрица, видимость
   по цепочке родителей, материал, геометрия и её версия, слой). Если что-то
   поменялось (дверь открылась, стену разрушили, ткань шевельнулась, карта
   спрятала кусок) — группа сразу разбирается (оригиналы возвращаются на
   слой 0), изменившийся меш навсегда исключается, остальные через ~2 с
   склеиваются заново уже без него. Отключение: ?batch=0. */
(function (root) {
  'use strict';
  const HID = 28, HMASK = 1 << HID;
  function create(THREE, scene, roots, opts) {
    opts = opts || {};
    const BGU = root.THREE_ADDONS && root.THREE_ADDONS['utils/BufferGeometryUtils.js'];
    if (!BGU || !BGU.mergeGeometries) return null;
    const CELL = opts.cell || 32, MAXV = opts.maxVerts || 40000, GMAXV = opts.groupVerts || 400000;
    const holder = new THREE.Group();
    holder.name = 'level_batches';
    holder.matrixAutoUpdate = false;
    scene.add(holder);
    const S = { groups: [], entries: [], i: 0, queue: [], frame: 0, stats: { meshes: 0, groups: 0, removed: 0, rebuilt: 0, skipped: {}, culprits: [] } };
    const baseOBR = THREE.Object3D.prototype.onBeforeRender, baseOAR = THREE.Object3D.prototype.onAfterRender;
    let lastWhy = '';
    const skip = (why) => { lastWhy = why; S.stats.skipped[why] = (S.stats.skipped[why] || 0) + 1; return null; };
    const visChain = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
    const _v = new THREE.Vector3();
    function attrSig(g) {
      const names = Object.keys(g.attributes).sort(), parts = [];
      for (const n of names) {
        const a = g.attributes[n];
        if (a.isInterleavedBufferAttribute || !a.array) return null;
        parts.push(n + ':' + a.itemSize + ':' + (a.normalized ? 1 : 0) + ':' + a.array.constructor.name);
      }
      return { names, key: parts.join(',') };
    }
    /* кандидат: неподвижный непрозрачный меш с одним стандартным материалом */
    function candidate(o) {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh) return null;
      const ud = o.userData || {};
      if (ud.noBatch || ud.traceOnly || ud.ground || ud.batch) return skip('flag');
      if (o.layers.mask !== 1) return skip('layer');
      if (o.frustumCulled === false || o.renderOrder !== 0) return skip('order');
      if (o.onBeforeRender !== baseOBR || o.onAfterRender !== baseOAR) return skip('hook');
      if (!visChain(o)) return skip('hidden');
      const m = o.material;
      if (!m || Array.isArray(m)) return skip('multimat');
      if (m.isShaderMaterial || m.isRawShaderMaterial || m.isPointsMaterial || m.isLineBasicMaterial) return skip('shader');
      if (m.transparent || m.opacity < 1 || m.depthWrite === false || m.blending !== THREE.NormalBlending) return skip('transp');
      const g = o.geometry;
      if (!g || !g.isBufferGeometry || !g.attributes.position) return skip('geo');
      if (g.morphAttributes && Object.keys(g.morphAttributes).length) return skip('morph');
      const n = g.attributes.position.count;
      if (n < 3) return skip('empty');
      if (n > MAXV) return skip('big');
      const dr = g.drawRange;
      if (dr.start !== 0 || (dr.count !== Infinity && dr.count < (g.index ? g.index.count : n))) return skip('range');
      const sig = attrSig(g);
      if (!sig) return skip('interleaved');
      if (!g.boundingSphere) g.computeBoundingSphere();
      _v.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld);
      const r = g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis();
      if (!(r < CELL)) return skip('large');
      const cx = Math.floor(_v.x / CELL), cz = Math.floor(_v.z / CELL);
      return { o, sig, key: m.uuid + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + sig.key + '|' + cx + ',' + cz, n };
    }
    function bake(o, names) {
      const g0 = o.geometry, g = new THREE.BufferGeometry();
      for (const name of names) g.setAttribute(name, g0.attributes[name].clone());
      if (g0.index) g.setIndex(g0.index.clone());
      else {
        const n = g0.attributes.position.count, idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
        for (let i = 0; i < n; i++) idx[i] = i;
        g.setIndex(new THREE.BufferAttribute(idx, 1));
      }
      g.applyMatrix4(o.matrixWorld);
      if (o.matrixWorld.determinant() < 0) {   // зеркальный меш: рендер переворачивал лицевую сторону сам, в склейке — порядок вершин
        const a = g.index.array;
        for (let i = 0; i + 2 < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
      }
      return g;
    }
    function entryOf(c) {
      const o = c.o, g = o.geometry;
      return { o, parent: o.parent, mat: o.material, geo: g, pv: g.attributes.position.version, iv: g.index ? g.index.version : -1,
        mw: Float32Array.from(o.matrixWorld.elements), grp: null };
    }
    function buildGroup(list) {
      const mat = list[0].o.material, parts = [];
      for (const c of list) parts.push(bake(c.o, list[0].sig.names));
      let merged = null;
      try { merged = BGU.mergeGeometries(parts, false); } catch (e) { merged = null; }
      for (const p of parts) p.dispose();
      if (!merged) return null;
      merged.computeBoundingSphere(); merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = 'batch';
      mesh.castShadow = list[0].o.castShadow; mesh.receiveShadow = list[0].o.receiveShadow;
      mesh.matrixAutoUpdate = false; mesh.updateMatrixWorld(true);
      mesh.userData = { batch: true, noTrace: true, noImpact: true };
      mesh.raycast = () => {};
      holder.add(mesh);
      const G = { mesh, entries: [], alive: true, verts: merged.attributes.position.count };
      for (const c of list) {
        const e = entryOf(c); e.grp = G; G.entries.push(e); S.entries.push(e);
        c.o.layers.mask = HMASK;
      }
      S.groups.push(G);
      return G;
    }
    function batch(cands) {
      const by = new Map();
      for (const c of cands) { let l = by.get(c.key); if (!l) by.set(c.key, (l = [])); l.push(c); }
      let made = 0;
      for (const list of by.values()) {
        if (list.length < 2) continue;
        /* большие группы режем, чтобы склейка не была гигантской */
        let chunk = [], v = 0;
        const flush = () => { if (chunk.length >= 2 && buildGroup(chunk)) { made++; S.stats.meshes += chunk.length; } chunk = []; v = 0; };
        for (const c of list) { if (v + c.n > GMAXV) flush(); chunk.push(c); v += c.n; }
        flush();
      }
      S.stats.groups = S.groups.filter((g) => g.alive).length;
      return made;
    }
    function unbatch(G, culprit) {
      if (!G.alive) return;
      G.alive = false;
      if (G.mesh.parent) G.mesh.parent.remove(G.mesh);
      G.mesh.geometry.dispose();
      const rest = [];
      for (const e of G.entries) {
        e.grp = null;
        if (e.o.layers.mask === HMASK) e.o.layers.mask = 1;
        if (e === culprit) {
        e.o.userData.noBatch = true;
        if (S.stats.culprits.length < 24) S.stats.culprits.push((e.o.name || '?') + '<' + ((e.o.parent && e.o.parent.name) || '?') + '>' + (S.stats.lastWhy || ''));
        continue;
      }
        rest.push(e.o);
      }
      S.stats.removed++;
      S.queue.push({ at: S.frame + 120, objs: rest });
    }
    const why = (k) => { const W = S.stats.why || (S.stats.why = {}); W[k] = (W[k] || 0) + 1; S.stats.lastWhy = k; return true; };
    function changed(e) {
      const o = e.o;
      if (o.parent !== e.parent) return why('parent');
      if (o.material !== e.mat || o.geometry !== e.geo) return why('swap');
      if (o.layers.mask !== HMASK) return why('layer');
      const g = o.geometry;
      if (g.attributes.position.version !== e.pv || (g.index ? g.index.version : -1) !== e.iv) return why('verts');
      if (!visChain(o)) return why('hidden');
      const a = o.matrixWorld.elements, b = e.mw;
      for (let k = 0; k < 16; k++) if (Math.abs(a[k] - b[k]) > 1e-4 * (1 + Math.abs(b[k]))) return why('moved');
      return false;
    }
    S.update = () => {
      S.frame++;
      const E = S.entries;
      if (E.length) {
        const cnt = Math.min(E.length, Math.max(64, Math.ceil(E.length / 4)));
        for (let k = 0; k < cnt; k++) {
          S.i = (S.i + 1) % E.length;
          const e = E[S.i];
          if (e.grp && e.grp.alive && changed(e)) unbatch(e.grp, e);
        }
        if (S.stats.removed && S.frame % 60 === 0) {   // чистка мёртвых записей
          let w = 0;
          for (let k = 0; k < E.length; k++) if (E[k].grp && E[k].grp.alive) E[w++] = E[k];
          E.length = w; S.i = 0;
          S.groups = S.groups.filter((g) => g.alive);
        }
      }
      if (S.queue.length && S.queue[0].at <= S.frame) {
        const q = S.queue.shift(), cands = [];
        for (const o of q.objs) { o.updateMatrixWorld(true); const c = candidate(o); if (c) cands.push(c); }
        if (cands.length >= 2) { batch(cands); S.stats.rebuilt++; }
      }
    };
    S.explain = (o) => { lastWhy = ''; const c = candidate(o); return c ? 'ok' : lastWhy; };
    S.dispose = () => {
      for (const G of S.groups) unbatch(G, null);
      S.queue.length = 0;
      if (holder.parent) holder.parent.remove(holder);
    };
    /* сбор */
    const t0 = performance.now(), cands = [];
    for (const r of roots) {
      if (!r) continue;
      r.updateMatrixWorld(true);
      r.traverse((o) => { if (o.isMesh) { const c = candidate(o); if (c) cands.push(c); } });
    }
    S.stats.candidates = cands.length;
    batch(cands);
    S.stats.ms = Math.round(performance.now() - t0);
    S.stats.verts = S.groups.reduce((a, g) => a + g.verts, 0);
    return S;
  }
  root.GBatch = { create, HID };
})(typeof self !== 'undefined' ? self : this);
