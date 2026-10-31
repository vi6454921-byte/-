/* AEGIS · геометрический LOD бойцов и их оружия.
   Боец ≈230 тыс. треугольников (25 скин-мешей), автомат ≈75 тыс. (30+ мешей);
   на лесе и стройке это 64 × 300 тыс. ≈ 20 млн треугольников за кадр плюс проход
   теней. Уровни строятся meshoptimizer'ом в фоне (по сигнатуре геометрии, общий
   кэш на всех бойцов) и переключаются по экранной ошибке: уровень берётся, только
   если его геометрическая погрешность на экране меньше TOL_PX пикселя — разницы
   глазом не видно, в прицел (узкий FOV) детализация возвращается автоматически.
   Скин-меши делят буферы вершин с оригиналом (меняется только индекс), поэтому
   веса костей и рэгдолл не затрагиваются. */
(function (root) {
  'use strict';
  const THREE = root.THREE, MS = root.MeshoptSimplifier;
  const TOL_PX = 0.6;          // допустимая погрешность силуэта на экране, px
  const TINY_PX = 0.9;         // мелкая деталь оружия (радиус на экране, px) меньше этого — не рисуется (v21: было 0.45 — винты, штифты, антабки по 1–2 px съедали 40–80 вызовов отрисовки за кадр)
  /* v21: мелкие части тела (глаза, ресницы, брови, зубы) — радиус на экране
     меньше 0.3 px (пятно < 0.6 px: растеризатор и так почти не закрашивает
     пиксель) — не рисуются; в тени не участвуют никогда (они внутри тени головы) */
  const TINY_BODY_PX = 0.3, TINY_BODY_R = 0.035;
  const HIDE_LAYER = 30;
  const BODY_LEVELS = [[0.4, 0.0015], [0.16, 0.005], [0.06, 0.015], [0.022, 0.045]];
  const GUN_LEVELS = [[0.35, 0.004], [0.12, 0.015], [0.04, 0.05]];
  const MIN_TRIS = 300;
  /* v25: перчатки (свой скелет кисти, пальцы согнуты хватом) — уровни строятся
     по позе привязки с прямыми пальцами, и схлопнутые у суставов рёбра в хвате
     мнут кисть в «варежку» с торчащим пальцем. Пока перчатка на экране крупнее
     ART_PX пикселей в радиусе (≈ до 12 м при 1080p), рисуется полная сетка. */
  const ART_PX = 6;

  let ready = false;
  if (MS && MS.ready) MS.ready.then(() => { ready = true; }).catch(() => { });

  const bySig = new Map();      // сигнатура → { state, levels:[{index|geo, err}] }
  const perGeo = new WeakMap(); // исходная геометрия → массив LOD-геометрий
  const queue = [];
  const owners = new WeakMap(); // корень объекта → { entries }
  const stats = { built: 0, skipped: 0, ms: 0 };
  let recN = 0;

  function sigOf(g) {
    const p = g.attributes.position;
    let h = (g.index ? 'i' + g.index.count : 'n') + ':' + p.count + ':';
    const step = Math.max(1, (p.count / 11) | 0);
    for (let i = 0; i < p.count; i += step) h += p.getX(i).toFixed(4) + ',' + p.getY(i).toFixed(4) + ';';
    return h;
  }
  function plainFloat(a) { return a && !a.isInterleavedBufferAttribute && a.array instanceof Float32Array; }

  /* неиндексированная геометрия (оружие) — склейка одинаковых вершин,
     иначе каждый треугольник «остров» и упрощать нечего */
  function weld(g) {
    const names = Object.keys(g.attributes), at = names.map((n) => g.attributes[n]);
    if (!at.every(plainFloat)) return null;
    const n = g.attributes.position.count;
    const u = at.map((a) => new Uint32Array(a.array.buffer, a.array.byteOffset, a.array.length));
    const isz = at.map((a) => a.itemSize);
    let cap = 1; while (cap < n * 2) cap <<= 1;
    const table = new Int32Array(cap).fill(-1), mask = cap - 1;
    const remap = new Uint32Array(n), first = new Uint32Array(n);
    let uniq = 0;
    for (let i = 0; i < n; i++) {
      let h = 2166136261 >>> 0;
      for (let k = 0; k < u.length; k++) { const s = isz[k], b = i * s, uk = u[k]; for (let c = 0; c < s; c++) h = Math.imul(h ^ uk[b + c], 16777619) >>> 0; }
      let slot = h & mask;
      for (;;) {
        const j = table[slot];
        if (j < 0) { table[slot] = uniq; first[uniq] = i; remap[i] = uniq++; break; }
        const f = first[j]; let same = true;
        for (let k = 0; k < u.length && same; k++) { const s = isz[k], uk = u[k]; for (let c = 0; c < s; c++) if (uk[f * s + c] !== uk[i * s + c]) { same = false; break; } }
        if (same) { remap[i] = j; break; }
        slot = (slot + 1) & mask;
      }
    }
    const out = new THREE.BufferGeometry();
    for (let k = 0; k < names.length; k++) {
      const s = isz[k], src = at[k].array, dst = new Float32Array(uniq * s);
      for (let j = 0; j < uniq; j++) { const f = first[j]; for (let c = 0; c < s; c++) dst[j * s + c] = src[f * s + c]; }
      out.setAttribute(names[k], new THREE.BufferAttribute(dst, s, at[k].normalized));
    }
    return { geo: out, index: remap, count: uniq };
  }

  function idxAttr(a, vcount) { return new THREE.BufferAttribute(vcount < 65536 ? new Uint16Array(a) : new Uint32Array(a), 1); }

  function build(job) {
    const t0 = performance.now(), g = job.geo, rec = job.rec;
    try {
      let base = g, index, pos;
      if (g.index) {
        if (!plainFloat(g.attributes.position)) throw 0;
        index = g.index.array instanceof Uint32Array ? g.index.array : new Uint32Array(g.index.array);
        pos = g.attributes.position.array;
      } else {
        const w = weld(g);
        if (!w) throw 0;
        base = w.geo; index = w.index; pos = w.geo.attributes.position.array;
      }
      const tris = index.length / 3;
      if (tris < MIN_TRIS) throw 0;
      const scale = MS.getScale(pos, 3), vcount = pos.length / 3;
      let prev = index.length;
      for (const [ratio, err] of job.levels) {
        const target = Math.max(3, Math.floor(tris * ratio) * 3);
        const r = MS.simplify(index, pos, 3, target, err, []);
        const idx = r[0], e = r[1] * scale;
        if (idx.length > prev * 0.8 || idx.length < 3) continue;
        prev = idx.length;
        const ia = idxAttr(idx, vcount);
        if (g.index) rec.levels.push({ index: ia, err: e });
        else {
          const lg = new THREE.BufferGeometry();
          for (const n in base.attributes) lg.setAttribute(n, base.attributes[n]);
          lg.setIndex(ia);
          if (g.boundingSphere) lg.boundingSphere = g.boundingSphere.clone();
          if (g.boundingBox) lg.boundingBox = g.boundingBox.clone();
          rec.levels.push({ geo: lg, err: e });
        }
      }
      rec.state = rec.levels.length ? 'ready' : 'skip';
      if (rec.levels.length) stats.built++; else stats.skipped++;
    } catch (e) {
      rec.state = 'skip'; stats.skipped++;
    }
    stats.ms += performance.now() - t0;
  }

  function lodGeos(mesh, rec) {
    const g = mesh.userData.lodBase;
    let arr = perGeo.get(g);
    if (arr) return arr;
    arr = rec.levels.map((L) => {
      if (L.geo) return L.geo;
      const lg = new THREE.BufferGeometry();
      for (const n in g.attributes) lg.setAttribute(n, g.attributes[n]);
      lg.setIndex(L.index);
      lg.boundingSphere = g.boundingSphere; lg.boundingBox = g.boundingBox;
      return lg;
    });
    perGeo.set(g, arr);
    return arr;
  }

  function track(obj, kind) {
    const entries = [];
    obj.updateMatrixWorld(true);
    obj.traverse((m) => {
      if (!m.isMesh || m.isInstancedMesh || !m.geometry || Array.isArray(m.material) || m.morphTargetInfluences || m.userData.wcover) return;
      const g = m.userData.lodBase || m.geometry;
      if (!g.attributes || !g.attributes.position || g.morphAttributes && Object.keys(g.morphAttributes).length) return;
      if (g.groups && g.groups.length > 1) return;
      m.userData.lodBase = g;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const sig = sigOf(g);
      let rec = bySig.get(sig);
      if (!rec) {
        rec = { id: ++recN, state: 'queued', levels: [] };
        bySig.set(sig, rec);
        queue.push({ geo: g, rec, levels: kind === 'gun' ? GUN_LEVELS : BODY_LEVELS });
      }
      const sc = new THREE.Vector3(); m.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
      const scale = Math.max(Math.abs(sc.x), Math.abs(sc.y), Math.abs(sc.z)) || 1;
      entries.push({ m, rec, geos: null, scale, r: (g.boundingSphere ? g.boundingSphere.radius : 1) * scale, lvl: -1, hid: false, mask: m.layers.mask, gun: kind === 'gun', art: !!m.userData.lodArt });
    });
    return { obj, entries };
  }

  function pump(budgetMs) {
    if (!ready || !queue.length) return;
    const end = performance.now() + budgetMs;
    do { build(queue.shift()); } while (queue.length && performance.now() < end);
  }

  function apply(tr, dist, K, full) {
    for (const e of tr.entries) {
      if (e.inPx) continue;      // v24: деталь сейчас нарисована дальним заменителем
      const m = e.m;
      let lvl = 0;
      if (!full && e.rec.state === 'ready') {
        if (!e.geos) e.geos = lodGeos(m, e.rec);
        const L = e.rec.levels;
        for (let i = L.length - 1; i >= 0; i--) if (L[i].err * e.scale * K <= TOL_PX * dist) { lvl = i + 1; break; }
        if (e.art && lvl && e.r * K > ART_PX * dist) lvl = 0;
      }
      if (lvl !== e.lvl) { e.lvl = lvl; m.geometry = lvl ? e.geos[lvl - 1] : m.userData.lodBase; }
      const hide = !full && (e.gun ? e.r * K < TINY_PX * dist : e.r < TINY_BODY_R && e.r * K < TINY_BODY_PX * dist);
      if (!e.gun && e.r < TINY_BODY_R && m.castShadow) m.castShadow = false;
      if (e.gun) {
        if (e.cs0 === undefined) e.cs0 = m.castShadow;
        const cs = e.cs0 && (full || dist * 716 < 26 * K);
        if (m.castShadow !== cs) m.castShadow = cs;
      }
      if (hide !== e.hid) { e.hid = hide; if (hide) { e.mask = m.layers.mask; m.layers.set(HIDE_LAYER); } else m.layers.mask = e.mask; }
    }
  }

  /* ------------------------------------------ v24: дальний заменитель --- */
  /* Вдали боец — 15–25 скин-мешей (кожа, форма, плитоноска, ботинки, …),
     автомат — 20–40 деталей. Каждая деталь — отдельный вызов отрисовки, а на
     встроенной графике вызов стоит дороже его треугольников: на лесе бойцы и
     оружие давали ~320 вызовов из ~870 за кадр. Когда фигура на экране меньше
     ~18 px в радиусе (автомат — 10 px; от бедра при 1080p — с ≈35 м, 720p — 23 м,
     1440p — 46 м; в прицел — с ≈80 м при 1080p), её детали заменяются ОДНИМ мешем: грубые уровни LOD,
     склеенные в общее пространство; цвет детали = цвет материала × цвет её
     текстуры (сетка 8×8 средних в линейном пространстве — то, что GPU и так
     показывает с мип-уровня на этой дистанции; камуфляж формы — по той же
     триплинарной раскладке, что в шейдере) в атрибуте вершин.
     Боец остаётся скин-мешем на ТОМ ЖЕ скелете: позу, рэгдолл и наклон
     повторяет кадр в кадр (без DQS — на 30 px разницы нет). Силуэт, цвет и
     яркость не меняются — дальняя цель читается так же. Геометрия общая для
     бойцов с одинаковым набором (кэш по содержимому деталей), строится в фоне
     кусками ≤ 2,5 мс за кадр. Отключение: ?proxy=0. */
  const PXK = { bodyOn: 18, bodyOff: 21, gunOn: 10, gunOff: 12, bodyR: 0.95 };
  const PX_TOL = 1.0;   // погрешность силуэта заменителя на пороге, px (дальше — меньше)
  const PX_SKIP = /(^|_)(brow|lash|cornea|eye|teeth|tongue|tear)$/i;
  let PX_ON = true;
  try { PX_ON = !/[?&]proxy=0\b/.test(root.location ? root.location.search : ''); } catch (e) { /* */ }
  const pxCache = new Map();
  const pxStats = { body: 0, gun: 0, builds: 0, cached: 0, ms: 0, tris: 0 };
  const _pm = new THREE.Matrix4(), _pm2 = new THREE.Matrix4(), _pv = new THREE.Vector3(), _pb = new THREE.Box3();

  /* сетка 8×8 средних цветов текстуры (линейные), кэш на текстуру */
  const G8 = 8, texCache = new WeakMap(), LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  let _cv = null, _cx = null;
  function texGrid(tex) {
    if (!tex) return null;
    let r = texCache.get(tex);
    if (r !== undefined) return r;
    r = null;
    try {
      const img = tex.image, srgb = tex.colorSpace === THREE.SRGBColorSpace;
      const acc = new Float32Array(G8 * G8 * 3), cnt = new Float32Array(G8 * G8);
      const put = (x, y, W, H, R, G, B) => { const c = ((y * G8 / H) | 0) * G8 + ((x * G8 / W) | 0); acc[c * 3] += R; acc[c * 3 + 1] += G; acc[c * 3 + 2] += B; cnt[c]++; };
      let d = null, W = 0, H = 0;
      if (img && img.data && img.width && img.height && (img.data instanceof Uint8Array || img.data instanceof Uint8ClampedArray) && img.data.length >= img.width * img.height * 4) {
        d = img.data; W = img.width; H = img.height;
      } else if (img && img.width > 0 && img.height > 0 && typeof document !== 'undefined') {
        if (!_cv) { _cv = document.createElement('canvas'); _cv.width = _cv.height = 64; _cx = _cv.getContext('2d', { willReadFrequently: true }); }
        _cx.imageSmoothingEnabled = true; _cx.imageSmoothingQuality = 'high';
        _cx.clearRect(0, 0, 64, 64);
        _cx.drawImage(img, 0, 0, 64, 64);
        d = _cx.getImageData(0, 0, 64, 64).data; W = H = 64;
      }
      if (d) {
        const sx = Math.max(1, (W / 64) | 0), sy = Math.max(1, (H / 64) | 0);
        for (let y = 0; y < H; y += sy) for (let x = 0; x < W; x += sx) {
          const o = (y * W + x) * 4;
          if (srgb) put(x, y, W, H, LIN[d[o]], LIN[d[o + 1]], LIN[d[o + 2]]);
          else put(x, y, W, H, d[o] / 255, d[o + 1] / 255, d[o + 2] / 255);
        }
        for (let c = 0; c < G8 * G8; c++) { const n = Math.max(1, cnt[c]); acc[c * 3] /= n; acc[c * 3 + 1] /= n; acc[c * 3 + 2] /= n; }
        r = acc;
      }
    } catch (e) { r = null; }
    texCache.set(tex, r);
    return r;
  }
  /* цвет текстуры в точке uv (как texture2D: перенос/повтор/flipY), билинейно по сетке */
  const _tc = [0, 0, 0];
  function wrapUV(x, mode) {
    if (mode === THREE.ClampToEdgeWrapping) return Math.min(1, Math.max(0, x));
    if (mode === THREE.MirroredRepeatWrapping) { const f = x - 2 * Math.floor(x / 2); return f > 1 ? 2 - f : f; }
    return x - Math.floor(x);
  }
  function texAt(G, tex, u, v, useM) {
    if (useM) { const e = tex.matrix.elements; const x = e[0] * u + e[3] * v + e[6], y = e[1] * u + e[4] * v + e[7]; u = x; v = y; }
    u = wrapUV(u, tex.wrapS); v = wrapUV(v, tex.wrapT);
    if (tex.flipY) v = 1 - v;
    const fx = u * G8 - 0.5, fy = v * G8 - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    const cl = tex.wrapS === THREE.ClampToEdgeWrapping;
    const ix = (x) => cl ? Math.min(G8 - 1, Math.max(0, x)) : ((x % G8) + G8) % G8;
    const iy = (y) => tex.wrapT === THREE.ClampToEdgeWrapping ? Math.min(G8 - 1, Math.max(0, y)) : ((y % G8) + G8) % G8;
    const a = (iy(y0) * G8 + ix(x0)) * 3, b = (iy(y0) * G8 + ix(x0 + 1)) * 3, c = (iy(y0 + 1) * G8 + ix(x0)) * 3, d = (iy(y0 + 1) * G8 + ix(x0 + 1)) * 3;
    for (let k = 0; k < 3; k++) _tc[k] = (G[a + k] * (1 - ax) + G[b + k] * ax) * (1 - ay) + (G[c + k] * (1 - ax) + G[d + k] * ax) * ay;
    return _tc;
  }

  const ZOFF = [0, 0, 0, 0];
  function matOk(mt) { return !!mt && !mt.transparent && !(mt.alphaTest > 0) && mt.visible !== false && mt.colorWrite !== false; }
  /* деталь видна: сама и предки до корня объекта (и действительно внутри него) */
  function partOn(c, stop) {
    const m = c.m;
    if (!m.visible || !m.geometry || !m.geometry.attributes.position) return false;
    let p = m.parent;
    while (p && p !== stop) { if (!p.visible) return false; p = p.parent; }
    if (!p) return false;
    const mt = m.material;
    return Array.isArray(mt) ? mt.length > 0 && mt.every(matOk) : matOk(mt);
  }
  function pxHash(cands, stop) {
    let h = 17;
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      if (!partOn(c, stop)) continue;
      const mt = c.m.material;
      h = (Math.imul(h, 31) + i + 1 + (Array.isArray(mt) ? 0 : mt.id * 977) + c.m.geometry.id * 131) | 0;
    }
    return h;
  }

  function bodyCands(tr, ch) {
    const out = [], names = new Map(), ent = new Map(tr.entries.map((e) => [e.m, e])), bones = new Set(ch.bones);
    for (const g in ch.meshes) if (ch.meshes[g]) names.set(ch.meshes[g], g);
    ch.root.traverse((m) => {
      if (!m.isMesh || m.isInstancedMesh || m.userData.lodProxy || !m.geometry || !m.geometry.attributes.position || !m.geometry.attributes.normal) return;
      if (PX_SKIP.test(names.get(m) || m.name || '')) return;
      const e = ent.get(m) || null;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      if ((e ? e.r : m.geometry.boundingSphere.radius) < TINY_BODY_R) return;   // глаза, винтики — вдали не видны и так
      if (m.isSkinnedMesh) {
        if (m.skeleton !== ch.skeleton || !m.geometry.attributes.skinIndex || !m.geometry.attributes.skinWeight) return;
        out.push({ m, e, bone: -1 });
      } else {
        let p = m.parent;
        while (p && !bones.has(p) && p !== ch.root) p = p.parent;
        if (!p || p === ch.root) return;
        out.push({ m, e, bone: ch.bones.indexOf(p), b: p });
      }
    });
    return out;
  }
  function gunCands(tr) {
    const out = [], ent = new Map(tr.entries.map((e) => [e.m, e]));
    tr.obj.updateMatrixWorld(true);
    _pm.copy(tr.obj.matrixWorld).invert();
    _pb.makeEmpty();
    /* v26: маскировочная сетка в заменитель не запекается (прозрачные нити) — гасится вместе с моделью */
    tr.covers = [];
    tr.obj.traverse((m) => {
      if (m.isMesh && m.userData.wcover) { tr.covers.push(m); return; }
      if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || m.userData.lodProxy || !m.geometry || !m.geometry.attributes.position || !m.geometry.attributes.normal) return;
      out.push({ m, e: ent.get(m) || null, bone: -1 });
      const g = m.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      _pm2.multiplyMatrices(_pm, m.matrixWorld);
      const sc = Math.cbrt(Math.abs(_pm2.determinant())) || 1, rr = g.boundingSphere.radius * sc;
      _pv.copy(g.boundingSphere.center).applyMatrix4(_pm2);
      _pb.expandByPoint(_pv.clone().addScalar(rr)); _pb.expandByPoint(_pv.clone().addScalar(-rr));
    });
    tr.gunR = _pb.isEmpty() ? 0.45 : Math.min(1.2, Math.max(0.15, _pb.getSize(_pv).length() * 0.5));
    /* винты, штифты, мелкие планки: на пороге заменителя они < TINY_PX на экране и у полной
       модели уже скрыты (apply) — в заменитель не берём */
    const rMin = TINY_PX * tr.gunR / PXK.gunOn;
    return out.filter((c) => !c.e || c.e.r >= rMin);
  }

  /* уровень LOD детали для заменителя: самый грубый с погрешностью ≤ allow (м) */
  function partSrc(c, allow) {
    const m = c.m, e = c.e, base = (e && m.userData.lodBase) || m.geometry;
    if (e && e.rec.state === 'queued') return null;
    if (e && e.rec.state === 'ready' && !Array.isArray(m.material)) {
      const L = e.rec.levels;
      for (let i = L.length - 1; i >= 0; i--) if (L[i].err * e.scale <= allow) {
        if (L[i].geo) return { g: L[i].geo, idx: L[i].geo.index.array, lvl: i + 1 };
        return { g: base, idx: L[i].index.array, lvl: i + 1 };
      }
    }
    return { g: base, idx: base.index ? base.index.array : null, lvl: 0 };
  }
  function matKey(mt) {
    const lc = mt.userData && mt.userData.lodCamo;
    return (mt.color ? mt.color.getHexString() : 'w') + (mt.map ? mt.map.uuid.slice(0, 8) : '-') + (lc ? lc.tex.uuid.slice(0, 8) : '') + (mt.vertexColors ? 'v' : '') + (mt.side === THREE.DoubleSide ? 'D' : '');
  }
  function pxKey(tr, kind, allow) {
    let k = kind;
    for (let i = 0; i < tr.cands.length; i++) {
      const c = tr.cands[i];
      if (!partOn(c, tr.obj)) continue;
      const src = partSrc(c, allow);
      if (!src) return null;
      const mt = c.m.material;
      k += '|' + (c.e ? 'r' + c.e.rec.id : c.m.geometry.uuid.slice(0, 8)) + ':' + src.lvl + ':' + (Array.isArray(mt) ? mt.map(matKey).join(',') : matKey(mt));
      if (kind === 'body') k += c.bone >= 0 ? ':b' + c.bone : ':' + c.m.bindMatrix.elements[0].toFixed(3);
    }
    return k;
  }

  /* склейка: позиции/нормали в общем пространстве, цвет вершин, кости */
  /* v24: сборка — генератор, отдаёт управление каждые ~600 индексов; frame() крутит его
     не дольше PX_MS за кадр (раньше ~50 мс одним куском на бойца → рывок кадра) */
  function* buildPxGen(tr, kind, allow, ch) {
    let t0 = performance.now(), spent = 0, work = 0;
    const P = [], N = [], C = [], SI = [], SW = [], I = [];
    const _pv = new THREE.Vector3(), _pn = new THREE.Matrix3(), inv = new THREE.Matrix4(), cands = tr.cands.slice();
    let nv = 0, side = THREE.FrontSide, rough = 0, metal = 0, wsum = 0, glk = null;
    for (const c of cands) {
      if (!partOn(c, tr.obj)) continue;
      const m = c.m, src = partSrc(c, allow);
      if (!src) return null;
      const g = src.g, A = g.attributes, pos = A.position, nrm = A.normal, uv = A.uv, vc = A.color;
      const M = new THREE.Matrix4();
      /* матрицы мира обновляются каждый кадр вместе — относительное положение детали
         считаем целиком в одном шаге, без общих временных матриц */
      if (kind === 'gun') M.multiplyMatrices(inv.copy(tr.obj.matrixWorld).invert(), m.matrixWorld);
      else if (c.bone >= 0) M.copy(ch.skeleton.boneInverses[c.bone]).invert().multiply(inv.copy(c.b.matrixWorld).invert()).multiply(m.matrixWorld);
      else M.copy(m.bindMatrix);
      _pn.getNormalMatrix(M);
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const ranges = Array.isArray(m.material) && g.groups.length && src.lvl === 0
        ? g.groups.map((gr) => [gr.start, gr.count, mats[gr.materialIndex] || mats[0]])
        : [[0, src.idx ? src.idx.length : pos.count, mats[0]]];
      const remap = new Int32Array(pos.count).fill(-1);
      for (const [start, count, mt] of ranges) {
        if (!mt) continue;
        if (mt.side === THREE.DoubleSide) side = THREE.DoubleSide;
        const lc = mt.userData && mt.userData.lodCamo;
        const GD = mt.map ? texGrid(mt.map) : null, GC = lc ? texGrid(lc.tex) : null;
        if (mt.map && mt.map.matrixAutoUpdate) mt.map.updateMatrix();
        const cr = mt.color ? mt.color.r : 1, cg = mt.color ? mt.color.g : 1, cb = mt.color ? mt.color.b : 1;
        const useVC = mt.vertexColors && vc;
        const tris = count / 3;
        rough += (mt.roughness !== undefined ? mt.roughness : 0.8) * tris; metal += (mt.metalness || 0) * tris; wsum += tris;
        if (glk === null && mt._glU) glk = mt._glU.value;
        const end = Math.min(start + count, src.idx ? src.idx.length : pos.count);
        for (let t = start; t < end; t++) {
          const vi = src.idx ? src.idx[t] : t;
          let k = remap[vi];
          if (k < 0) {
            k = remap[vi] = nv++;
            const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
            _pv.set(x, y, z).applyMatrix4(M); P.push(_pv.x, _pv.y, _pv.z);
            const nx = nrm.getX(vi), ny = nrm.getY(vi), nz = nrm.getZ(vi);
            _pv.set(nx, ny, nz).applyMatrix3(_pn).normalize(); N.push(_pv.x, _pv.y, _pv.z);
            let r = cr, gg = cg, b = cb;
            if (lc) {
              if (GC) {
                const nl = Math.hypot(nx, ny, nz) || 1, pw = lc.pw || 4, O = lc.off || ZOFF;
                const ax = Math.pow(Math.abs(nx) / nl, pw), ay = Math.pow(Math.abs(ny) / nl, pw), az = Math.pow(Math.abs(nz) / nl, pw);
                const s = Math.max(ax + ay + az, 1e-4), T = lc.tile, cx = lc.tex;
                let q = texAt(GC, cx, z * T, y * T, false); let sr = q[0] * ax, sg = q[1] * ax, sb = q[2] * ax;
                q = texAt(GC, cx, x * T + O[0], z * T + O[1], false); sr += q[0] * ay; sg += q[1] * ay; sb += q[2] * ay;
                q = texAt(GC, cx, x * T + O[2], y * T + O[3], false); sr += q[0] * az; sg += q[1] * az; sb += q[2] * az;
                r *= sr / s; gg *= sg / s; b *= sb / s;
              }
              /* пыль на брючинах снизу (11_soldier_clothing: dk) — в среднем */
              if (lc.dirt) {
                const t = Math.min(1, Math.max(0, (y - 0.08) / 0.42)), low = 1 - t * t * (3 - 2 * t);
                const dk = Math.min(0.8, low * 0.75 * 0.85 * lc.dirt);
                if (dk > 0) { r += (r * 0.86 + 0.035 - r) * dk; gg += (gg * 0.8 + 0.028 - gg) * dk; b += (b * 0.7 + 0.018 - b) * dk; }
              }
              if (GD && uv) {
                const q = texAt(GD, mt.map, uv.getX(vi), uv.getY(vi), true);
                const l = (0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2]) / Math.max(lc.mean, 1e-3);
                const f = 1 + (Math.min(1.8, Math.max(0.15, l)) - 1) * lc.k;
                r *= f; gg *= f; b *= f;
              }
              /* v26: бельё — открытая кожа и носки (та же маска, что в шейдере ткани) */
              if (lc.bare) {
                const B = lc.bare, CL = self.GCloth;
                if (CL && CL.bareAt && CL.bareAt(B, x, y, z) > 0) {
                  const sock = y < B.sock, S = sock ? B.sockCol : B.skin;
                  const tn = sock ? 1 : (Math.abs(x) > 0.3 || y > 1.52) ? 0.96 : 1.07;
                  r = S[0] * tn; gg = S[1] * tn; b = S[2] * tn;
                }
              }
            } else if (GD && uv) {
              const q = texAt(GD, mt.map, uv.getX(vi), uv.getY(vi), true);
              r *= q[0]; gg *= q[1]; b *= q[2];
            }
            if (useVC) { r *= vc.getX(vi); gg *= vc.getY(vi); b *= vc.getZ(vi); }
            C.push(r, gg, b);
            if (kind === 'body') {
              if (c.bone >= 0) { SI.push(c.bone, 0, 0, 0); SW.push(1, 0, 0, 0); }
              else {
                const si = A.skinIndex, sw = A.skinWeight;
                SI.push(si.getX(vi), si.getY(vi), si.getZ(vi), si.getW(vi));
                SW.push(sw.getX(vi), sw.getY(vi), sw.getZ(vi), sw.getW(vi));
              }
            }
          }
          I.push(k);
          if ((++work & 511) === 0) { spent += performance.now() - t0; yield; t0 = performance.now(); }
        }
      }
    }
    if (!I.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(C), 3));
    if (kind === 'body') {
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(SI), 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(SW), 4));
    }
    geo.setIndex(idxAttr(I, nv));
    geo.computeBoundingSphere();
    geo.userData.px = { side, rough: wsum ? rough / wsum : 0.8, metal: wsum ? metal / wsum : 0, glk: glk ? [glk.x, glk.y] : null, tris: I.length / 3 };
    pxStats.builds++; pxStats.ms += spent + performance.now() - t0;
    return geo;
  }
  let PX_MS = 2.5;
  let pxJob = null;
  function pxRun() {
    if (!pxJob) return;
    const end = performance.now() + PX_MS;
    let r = null;
    try { do { r = pxJob.it.next(); } while (!r.done && performance.now() < end); }
    catch (e) { r = { done: true, value: null }; console.warn('lod proxy', e && e.message); }
    if (!r.done) return;
    const j = pxJob; pxJob = null;
    if (r.value) { pxCache.set(j.key, r.value); pxStats.tris += r.value.userData.px.tris; }
    else j.tr.pxFail = j.key;
  }

  const pxMats = new Map();
  function pxMat(kind, info) {
    const r = Math.round(info.rough * 10) / 10, mtl = Math.round(info.metal * 10) / 10;
    const k = kind + info.side + ':' + r + ':' + mtl + ':' + (info.glk ? info.glk.join(',') : '');
    let m = pxMats.get(k);
    if (m) return m;
    m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: r, metalness: mtl, side: info.side, envMapIntensity: kind === 'gun' ? 0.9 : 0.7 });
    m.name = 'lod_proxy_' + kind;
    const GG = root.GGloom;
    if (GG) GG.setK(m, info.glk ? info.glk[0] : kind === 'body' ? 0.5 : 1, info.glk ? info.glk[1] : kind === 'body' ? 0 : 1);
    pxMats.set(k, m);
    return m;
  }

  function pxHide(tr) {
    for (const c of tr.pxParts) { c.mask0 = c.m.layers.mask; c.m.layers.set(HIDE_LAYER); if (c.e) c.e.inPx = true; }
    if (tr.covers) for (const m of tr.covers) { if (m.userData.pxMask0 === undefined) m.userData.pxMask0 = m.layers.mask; m.layers.set(HIDE_LAYER); }
  }
  function pxShow(tr) {
    for (const c of tr.pxParts) { c.m.layers.mask = c.mask0; if (c.e) c.e.inPx = false; }
    if (tr.covers) for (const m of tr.covers) if (m.userData.pxMask0 !== undefined) { m.layers.mask = m.userData.pxMask0; delete m.userData.pxMask0; }
  }
  function pxOff(tr) {
    if (!tr || !tr.pxOn) return;
    pxShow(tr);
    tr.pxOn = false;
    if (tr.pxMesh) tr.pxMesh.visible = false;
    pxStats[tr.kind]--;
  }
  function pxSet(tr, geo, kind, ch) {
    const info = geo.userData.px, mat = pxMat(kind, info);
    if (tr.pxOn) pxShow(tr);
    let m = tr.pxMesh;
    if (!m) {
      if (kind === 'body') { m = new THREE.SkinnedMesh(geo, mat); m.bind(ch.skeleton, new THREE.Matrix4()); m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; }
      else { m = new THREE.Mesh(geo, mat); m.castShadow = false; m.receiveShadow = false; }
      m.name = 'lod_proxy_' + kind;
      m.userData.lodProxy = true; m.userData.noTrace = true; m.userData.noImpact = true; m.userData.noBatch = true;
      m.raycast = () => { };
      m.visible = false;
      tr.obj.add(m);
      tr.pxMesh = m;
    } else { m.geometry = geo; m.material = mat; }
    tr.pxParts = tr.cands.filter((c) => partOn(c, tr.obj));
    if (tr.pxOn) pxHide(tr);
  }
  /* вкл/выкл заменителя по экранному радиусу (с гистерезисом) */
  function pxStep(tr, s, d, K, full, kind) {
    const R = (kind === 'body' ? PXK.bodyR : tr.gunR || 0.45) * K / d;
    if (!tr.cands) { tr.kind = kind; tr.cands = kind === 'body' ? bodyCands(tr, s.char) : gunCands(tr); }
    const want = PX_ON && !full && R < (tr.pxOn ? (kind === 'body' ? PXK.bodyOff : PXK.gunOff) : (kind === 'body' ? PXK.bodyOn : PXK.gunOn));
    if (!want) { if (tr.pxOn) pxOff(tr); return; }
    const h = pxHash(tr.cands, tr.obj);
    if (tr.pxH !== h) {
      /* погрешность заменителя ≤ PX_TOL на пороге включения (дальше — меньше) */
      const allow = PX_TOL * (kind === 'body' ? PXK.bodyR / PXK.bodyOn : (tr.gunR || 0.45) / PXK.gunOn);
      const key = pxKey(tr, kind, allow);
      if (key === null) { if (tr.pxOn) pxOff(tr); return; }      // уровни LOD ещё строятся
      let geo = pxCache.get(key);
      if (geo) { if (tr.pxWait !== key) pxStats.cached++; tr.pxWait = null; }
      else {
        /* строится в фоне (по кускам в frame); пока — полная модель */
        if (tr.pxOn) pxOff(tr);
        if (tr.pxFail === key) return;
        if (!pxJob) { pxJob = { tr, key, it: buildPxGen(tr, kind, allow, s.char) }; tr.pxWait = key; }
        return;
      }
      pxSet(tr, geo, kind, s.char);
      tr.pxH = h;
    }
    if (!tr.pxOn) { pxHide(tr); tr.pxOn = true; tr.pxMesh.visible = true; pxStats[kind]++; }
    /* тень заменителя — как у бойца (teams.js гасит тени дальних) */
    if (kind === 'body') { const cs = s._lodShadow !== false; if (tr.pxMesh.castShadow !== cs) tr.pxMesh.castShadow = cs; }
  }

  function trackedFor(key, obj, kind) {
    if (!obj) return null;
    let o = owners.get(obj);
    if (!o) { o = track(obj, kind); owners.set(obj, o); }
    return o;
  }

  /* раз в кадр: камера, высота буфера в пикселях, список бойцов */
  function frame(camera, heightPx, squad, isFull) {
    if (!MS) return;
    pump(queue.length > 40 ? 8 : 4);
    if (!ready) return;
    const K = heightPx / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const cp = camera.position;
    for (const s of squad) {
      if (!s.char) continue;
      const p = s.ctrl.pos, d = Math.max(0.5, Math.hypot(p.x - cp.x, p.y - cp.y, p.z - cp.z));
      const full = !!(isFull && isFull(s));
      const body = trackedFor(s, s.char.root, 'body');
      /* v24: сменился персонаж или оружие — заменитель прежнего снять */
      if (s._lodBodyTr && s._lodBodyTr !== body) pxOff(s._lodBodyTr);
      s._lodBodyTr = body;
      if (body) { pxStep(body, s, d, K, full, 'body'); apply(body, d, K, full); }
      const gun = s.gun && s.gun.root ? trackedFor(s, s.gun.root, 'gun') : null;
      if (s._lodGunTr && s._lodGunTr !== gun) pxOff(s._lodGunTr);
      s._lodGunTr = gun;
      if (gun) { pxStep(gun, s, d, K, full, 'gun'); apply(gun, d, K, full); }
    }
    pxRun();
  }

  /* v26: объект пересобран (смена внешнего вида бойца) — снять заменитель
     и забыть прежние сетки; при следующем кадре объект трекается заново */
  function forget(obj) {
    const o = obj && owners.get(obj);
    if (!o) return;
    if (o.pxOn) pxOff(o);
    if (pxJob && pxJob.tr === o) pxJob = null;
    if (o.pxMesh) { if (o.pxMesh.parent) o.pxMesh.parent.remove(o.pxMesh); o.pxMesh = null; }
    owners.delete(obj);
  }

  root.GLod = {
    frame, pump, forget, TOL_PX, PXK,
    stats: () => Object.assign({ queued: queue.length, ready, proxy: Object.assign({ on: PX_ON, geos: pxCache.size }, pxStats) }, stats),
    setProxy: (on) => { PX_ON = !!on; },
    setProxyMs: (ms) => { PX_MS = +ms > 0 ? +ms : 2.5; }   // бюджет фоновой сборки заменителей, мс/кадр (стенды)
  };
})(window);
