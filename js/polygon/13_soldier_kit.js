
/* ==========================================================================
   МОДУЛЬ: soldier/kit.js
   ========================================================================== */
/* ============================================================================
   Снаряжение бойца, построенное заново (замена «нарисованного» жилета,
   резиновых бахил, мятой панамы и плоской балаклавы из пакета MakeHuman).

   Всё строится в позе покоя ПО РЕАЛЬНОЙ ПОВЕРХНОСТИ одежды: лучи от оси
   тела ищут внешнюю сторону кителя и брюк, поэтому каждая деталь лежит на
   ткани с зазором в несколько миллиметров, а не висит и не тонет в ней.

     • плитоноска: передняя и задняя плиты SAPI с честной толщиной (плита +
       чехол ≈ 3 см), камербанд, плечевые лямки с накладками, стропы MOLLE
       (лента 25 мм, шаг 50 мм, закрепки через 38 мм), тройной подсумок под
       магазины АК с резинками, админ-панель с липучкой и шевроном, подсумки
       под радиостанцию и аптечку, эвакуационная ручка;
     • боевой пояс с пряжкой и подсумком;
     • ботинки (класс LOWA/Salomon mid): резиновая подошва с рантом и
       протектором, носок с резиновой накладкой, мягкий кант, крючки и
       перекрёстная шнуровка, язык;
     • напуск брюк на берцы с манжетой на липучке, наколенники по колену;
     • панама: шесть клиньев со швами, стёжка полей, лента с петлями,
       люверсы; поля мягко провисают;
     • балаклава: подвёрнутый кант выреза, шов по темени, сборки на шее,
       вязаная фактура (рельеф и альбедо).

   Веса костей для мягких деталей переносятся с ближайших вершин одежды,
   жёсткие (плиты, подсумки) сидят на кости груди.
   ========================================================================== */
(function (root, factory) {
  const K = factory(root.GUtil, root.GTex);
  if (typeof module !== 'undefined' && module.exports) module.exports = K;
  else root.GKit = K;
})(typeof self !== 'undefined' ? self : this, function (U, T) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
  /* детерминированный шум: одна и та же форма у всех запусков */
  const hash = (x) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const vn1 = (x, seed) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return lerp(hash(i + seed * 17.3), hash(i + 1 + seed * 17.3), u) * 2 - 1;
  };

  /* ------------------------------------------------------ накопитель -- */
  function Acc(wf) { this.p = []; this.uv = []; this.si = []; this.sw = []; this.ix = []; this.wf = wf || null; }
  Acc.prototype.count = function () { return this.p.length / 3; };
  Acc.prototype.v = function (p, uv, W) {
    const w = W || (this.wf ? this.wf(p) : [[0, 1]]);
    this.p.push(p[0], p[1], p[2]); this.uv.push(uv[0], uv[1]);
    const top = w.slice().sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = top.reduce((s, e) => s + e[1], 0) || 1;
    for (let k = 0; k < 4; k++) { this.si.push(top[k] ? top[k][0] : 0); this.sw.push(top[k] ? top[k][1] / tot : 0); }
    return this.count() - 1;
  };
  Acc.prototype.tri = function (a, b, c) { this.ix.push(a, b, c); };
  Acc.prototype.quad = function (a, b, c, d) { this.ix.push(a, b, c, a, c, d); };
  /* перевернуть обход треугольников с индекса i0 */
  Acc.prototype.flipFrom = function (i0) {
    for (let i = i0; i < this.ix.length; i += 3) { const t = this.ix[i + 1]; this.ix[i + 1] = this.ix[i + 2]; this.ix[i + 2] = t; }
  };
  Acc.prototype.triNormal = function (i) {
    const I = this.ix, P = this.p;
    const a = [P[I[i] * 3], P[I[i] * 3 + 1], P[I[i] * 3 + 2]];
    const b = [P[I[i + 1] * 3], P[I[i + 1] * 3 + 1], P[I[i + 1] * 3 + 2]];
    const c = [P[I[i + 2] * 3], P[I[i + 2] * 3 + 1], P[I[i + 2] * 3 + 2]];
    return cross(sub(b, a), sub(c, a));
  };
  Acc.prototype.append = function (o) {
    const off = this.count();
    for (const k of ['p', 'uv', 'si', 'sw']) for (let i = 0; i < o[k].length; i++) this[k].push(o[k][i]);
    for (let i = 0; i < o.ix.length; i++) this.ix.push(o.ix[i] + off);
    return this;
  };

  function toGeo(THREE, a) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(a.p), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(a.uv), 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(a.si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(a.sw), 4));
    g.setIndex(a.count() > 65535 ? new THREE.Uint32BufferAttribute(a.ix, 1) : new THREE.Uint16BufferAttribute(a.ix, 1));
    g.computeVertexNormals();
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.2);
    return g;
  }

  /* ---------------------------------------------- лучи по одежде ------ */
  /* Треугольники меша раскладываются по корзинам вдоль оси `axis`; луч
     обязан лежать в плоскости axis = const (горизонтальные лучи — axis 1,
     лучи в плоскости YZ — axis 0). Возвращает самое дальнее попадание. */
  function TriSet(sources, axis, cell) {
    const C = cell || 0.01;
    const bins = new Map();
    const tris = [];
    for (const src of sources) {
      const P = src.pos, I = src.index, keep = src.keep;
      for (let i = 0; i < I.length; i += 3) {
        const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
        const cx = (P[a] + P[b] + P[c]) / 3, cy = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
        if (keep && !keep(cx, cy, cz)) continue;
        const t = tris.length / 9;
        tris.push(P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2], P[c], P[c + 1], P[c + 2]);
        const lo = Math.min(P[a + axis], P[b + axis], P[c + axis]), hi = Math.max(P[a + axis], P[b + axis], P[c + axis]);
        for (let k = Math.floor(lo / C); k <= Math.floor(hi / C); k++) {
          let arr = bins.get(k);
          if (!arr) bins.set(k, arr = []);
          arr.push(t);
        }
      }
    }
    const F = new Float64Array(tris);
    function cast(o, d, mode) {
      const arr = bins.get(Math.floor(o[axis] / C));
      if (!arr) return null;
      let best = null;
      for (const t of arr) {
        const i = t * 9;
        const e1x = F[i + 3] - F[i], e1y = F[i + 4] - F[i + 1], e1z = F[i + 5] - F[i + 2];
        const e2x = F[i + 6] - F[i], e2y = F[i + 7] - F[i + 1], e2z = F[i + 8] - F[i + 2];
        const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det;
        const sx = o[0] - F[i], sy = o[1] - F[i + 1], sz = o[2] - F[i + 2];
        const u = (sx * px + sy * py + sz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (tt <= 1e-5) continue;
        if (best === null || (mode === 'near' ? tt < best : tt > best)) best = tt;
      }
      return best;
    }
    return { cast, count: tris.length / 9 };
  }

  /* ----------------------------------------- перенос весов костей ----- */
  /* Вес мягкой детали = взвешенная смесь весов ближайших вершин одежды
     под ней: деталь гнётся ровно так же, как ткань. */
  function WeightField(sources, cell) {
    const C = cell || 0.02;
    const KEY = (i, j, k) => ((i + 2048) * 4096 + (j + 2048)) * 4096 + (k + 2048);
    const grid = new Map();
    const pts = [];
    for (const g of sources) {
      const P = g.pos, SI = g.si, SW = g.sw, keep = g.keep;
      for (let v = 0; v < P.length / 3; v++) {
        const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
        if (keep && !keep(x, y, z)) continue;
        const w = [];
        for (let k = 0; k < 4; k++) if (SW[v * 4 + k] > 1e-4) w.push([SI[v * 4 + k], SW[v * 4 + k]]);
        const id = pts.length;
        pts.push({ x, y, z, w });
        const key = KEY(Math.floor(x / C), Math.floor(y / C), Math.floor(z / C));
        let arr = grid.get(key);
        if (!arr) grid.set(key, arr = []);
        arr.push(id);
      }
    }
    /* те же 6 ближайших, что давала устойчивая сортировка, но без строковых
       ключей и сортировки всего списка: перенос весов был заметной долей загрузки */
    const bId = new Int32Array(6), bD = new Float64Array(6);
    return function (p) {
      const ix = Math.floor(p[0] / C), iy = Math.floor(p[1] / C), iz = Math.floor(p[2] / C);
      let nf = 0, nb = 0;
      for (let r = 1; r <= 4 && nf < 6; r++) {
        nf = 0; nb = 0;
        for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
          const arr = grid.get(KEY(ix + a, iy + b, iz + c));
          if (!arr) continue;
          for (let j = 0; j < arr.length; j++) {
            const id = arr[j], q = pts[id];
            nf++;
            const d2 = (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2 + (q.z - p[2]) ** 2;
            if (nb === 6 && !(d2 < bD[5])) continue;
            let at = nb < 6 ? nb : 5;
            while (at > 0 && bD[at - 1] > d2) { if (at < 6) { bD[at] = bD[at - 1]; bId[at] = bId[at - 1]; } at--; }
            bD[at] = d2; bId[at] = id;
            if (nb < 6) nb++;
          }
        }
      }
      if (!nf) return null;
      const acc = new Map();
      for (let j = 0; j < nb; j++) {
        const k = 1 / (bD[j] + 1e-6), w = pts[bId[j]].w;
        for (let m = 0; m < w.length; m++) { const bi = w[m][0]; acc.set(bi, (acc.get(bi) || 0) + w[m][1] * k); }
      }
      return [...acc.entries()];
    };
  }
  /* смесь двух наборов весов */
  function mixW(a, b, t) {
    const m = new Map();
    for (const [i, w] of a) m.set(i, (m.get(i) || 0) + w * (1 - t));
    for (const [i, w] of b) m.set(i, (m.get(i) || 0) + w * t);
    return [...m.entries()];
  }

  /* --------------------------------------------------- «подушка» ------ */
  /* Скруглённый прямоугольник со вставкой d от края; радиусы углов
     R = [нл, нп, вп, вл]. Число точек не зависит от d — кольца
     разной вставки сшиваются полосами. */
  function outline(w, h, R, d, seg, cs) {
    const S = seg || 0.012, CS = cs || 4;
    const sx = Math.max(1, Math.ceil(w / S)), sy = Math.max(1, Math.ceil(h / S));
    const C = R.map((r) => { const re = Math.max(r - d, 0.00015); return { re, o: d + re }; });
    const cBL = [C[0].o, C[0].o], cBR = [w - C[1].o, C[1].o], cTR = [w - C[2].o, h - C[2].o], cTL = [C[3].o, h - C[3].o];
    const pts = [];
    const arc = (c, r, a0) => { for (let k = 0; k < CS; k++) { const a = a0 + (k / CS) * Math.PI / 2; pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); } };
    for (let k = 0; k < sx; k++) pts.push([lerp(cBL[0], cBR[0], k / sx), d]);
    arc(cBR, C[1].re, -Math.PI / 2);
    for (let k = 0; k < sy; k++) pts.push([w - d, lerp(cBR[1], cTR[1], k / sy)]);
    arc(cTR, C[2].re, 0);
    for (let k = 0; k < sx; k++) pts.push([lerp(cTR[0], cTL[0], k / sx), h - d]);
    arc(cTL, C[3].re, Math.PI / 2);
    for (let k = 0; k < sy; k++) pts.push([d, lerp(cTL[1], cBL[1], k / sy)]);
    arc(cBL, C[0].re, Math.PI);
    return pts;
  }

  /* Объёмная деталь на листе sheet(x, y) -> {p, n}. o: x, y (левый нижний
     угол на листе), w, h, R (радиус углов или массив), d (толщина),
     q (радиус закругления кромки), bulge (выпуклость лица), back (закрыть
     изнанку), uv: 'm' (метры) | 'unit' (0..1), W (веса), seg. */
  function pad(acc, sheet, o) {
    const w = o.w, h = o.h, d = o.d;
    const R0 = Array.isArray(o.R) ? o.R : [o.R, o.R, o.R, o.R];
    const R = R0.map((r) => Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4));
    const q = Math.min(o.q === undefined ? d * 0.45 : o.q, d * 0.95, Math.min(w, h) * 0.3);
    const bulge = o.bulge || 0;
    const i0 = acc.ix.length;
    const rings = [];
    const sink = o.sink === undefined ? 0.0015 : o.sink;
    rings.push({ d: 0, z: -sink });
    if (d - q > 0.0004) rings.push({ d: 0, z: d - q });
    const RS = o.rimSteps || 4;
    for (let k = 1; k <= RS; k++) { const a = k / RS * Math.PI / 2; rings.push({ d: q * (1 - Math.cos(a)), z: d - q + q * Math.sin(a) }); }
    const inner = o.inner || [0.82, 0.58, 0.34, 0.12];
    const base = outline(w, h, R, q, o.seg, o.cs);
    const cx = w / 2, cy = h / 2;
    const ringPts = rings.map((r) => ({ pts: r.d === q ? base : outline(w, h, R, r.d, o.seg, o.cs), z: r.z }));
    for (const k of inner) ringPts.push({ pts: base.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]), z: d + bulge * (1 - k * k) });
    const map = (x, y, z) => {
      const s = sheet(o.x + x, o.y + y);
      return madd(s.p, s.n, z);
    };
    const uvf = (x, y, z) => (o.uv === 'unit' ? [x / w, y / h] : [o.x + x + z * 0.7, o.y + y + z * 0.7]);
    const Wf = o.W || null;
    const ids = [];
    for (const r of ringPts) {
      const row = [];
      for (const [x, y] of r.pts) { const P = map(x, y, r.z); row.push(acc.v(P, uvf(x, y, r.z), Wf ? Wf(P) : null)); }
      ids.push(row);
    }
    const ctr = map(cx, cy, d + bulge);
    const cId = acc.v(ctr, uvf(cx, cy, d + bulge), Wf ? Wf(ctr) : null);
    const N = base.length;
    for (let r = 0; r + 1 < ids.length; r++) for (let k = 0; k < N; k++) {
      const k1 = (k + 1) % N;
      acc.quad(ids[r][k], ids[r][k1], ids[r + 1][k1], ids[r + 1][k]);
    }
    const last = ids[ids.length - 1];
    for (let k = 0; k < N; k++) acc.tri(last[k], last[(k + 1) % N], cId);
    /* лицо должно смотреть наружу листа */
    const tn = acc.triNormal(acc.ix.length - 3);
    const sc = sheet(o.x + cx, o.y + cy);
    if (dot(tn, sc.n) < 0) acc.flipFrom(i0);
    if (o.back !== false) {
      const j0 = acc.ix.length;
      const bpts = outline(w, h, R, Math.min(q, 0.003), o.seg, o.cs);
      const brow = bpts.map(([x, y]) => { const P = map(x, y, -sink); return acc.v(P, uvf(x, y, 0), Wf ? Wf(P) : null); });
      const bc = map(cx, cy, -sink);
      const bId = acc.v(bc, uvf(cx, cy, 0), Wf ? Wf(bc) : null);
      for (let k = 0; k < N; k++) {
        const k1 = (k + 1) % N;
        acc.quad(ids[0][k1], ids[0][k], brow[k], brow[k1]);
        acc.tri(brow[k1], brow[k], bId);
      }
      const bn = acc.triNormal(acc.ix.length - 3);
      if (dot(bn, sc.n) > 0) acc.flipFrom(j0);
    }
    return { top: (x, y) => map(x - o.x, y - o.y, d) };
  }

  /* лист, смещённый по нормали */
  const offsetSheet = (sheet, dd) => (x, y) => { const s = sheet(x, y); return { p: madd(s.p, s.n, dd), n: s.n }; };
  /* нормаль листа по конечным разностям (ориентация — по подсказке out) */
  function sheetNormal(f, x, y, out) {
    const e = 0.002;
    const px = sub(f(x + e, y), f(x - e, y)), py = sub(f(x, y + e), f(x, y - e));
    let n = nrm(cross(px, py));
    if (out && dot(n, out) < 0) n = mul(n, -1);
    return n;
  }

  /* Трубка вдоль ломаной (шнурки, резинки, кант). pts — точки, r — радиус,
     sides — число граней, flat — сплющивание по нормали up (0..1). */
  function tube(acc, pts, r, sides, W, opt) {
    const o = opt || {};
    const S = sides || 6;
    const rows = [];
    let prevN = null;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const t = nrm(sub(b, a));
      let up = o.up ? (typeof o.up === 'function' ? o.up(i) : o.up) : (prevN || (Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
      let nx = nrm(cross(t, up));
      if (!isFinite(nx[0]) || len(nx) < 0.5) nx = nrm(cross(t, [0.3, 0.8, 0.5]));
      const ny = cross(nx, t);
      prevN = ny;
      const rr = typeof r === 'function' ? r(i) : r;
      const row = [];
      for (let k = 0; k < S; k++) {
        const a2 = k / S * TAU;
        const P = add(pts[i], add(mul(nx, Math.cos(a2) * rr * (o.wide || 1)), mul(ny, Math.sin(a2) * rr * (1 - (o.flat || 0)))));
        row.push(acc.v(P, [i * 0.01, k / S * 0.01], W ? W(pts[i]) : null));
      }
      rows.push(row);
    }
    for (let i = 0; i + 1 < rows.length; i++) for (let k = 0; k < S; k++) {
      const k1 = (k + 1) % S;
      acc.quad(rows[i][k], rows[i + 1][k], rows[i + 1][k1], rows[i][k1]);
    }
    if (o.caps !== false) {
      for (const [row, fl] of [[rows[0], true], [rows[rows.length - 1], false]]) {
        const c = row.map((id) => [acc.p[id * 3], acc.p[id * 3 + 1], acc.p[id * 3 + 2]]).reduce((s, p) => add(s, p), [0, 0, 0]);
        const C = mul(c, 1 / S);
        const cid = acc.v(C, [0, 0], W ? W(C) : null);
        for (let k = 0; k < S; k++) { const k1 = (k + 1) % S; if (fl) acc.tri(row[k1], row[k], cid); else acc.tri(row[k], row[k1], cid); }
      }
    }
  }

  /* Тор/кольцо (люверсы, крючки). c — центр, n — ось. */
  function ring(acc, c, n, R, r, W) {
    const t1 = nrm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = cross(n, t1);
    const pts = [];
    for (let k = 0; k <= 12; k++) { const a = k / 12 * TAU; pts.push(add(c, add(mul(t1, Math.cos(a) * R), mul(t2, Math.sin(a) * R)))); }
    tube(acc, pts, r, 5, W, { caps: false, up: n });
  }

  /* Сетка поверхности f(u, v) -> точка, u, v ∈ [0, 1]; wrapU — замкнуть по u. */
  function grid(acc, f, nu, nv, W, opt) {
    const o = opt || {};
    const i0 = acc.ix.length;
    const ids = [];
    for (let j = 0; j <= nv; j++) {
      const row = [];
      for (let i = 0; i <= nu; i++) {
        if (o.wrapU && i === nu) { row.push(row[0]); continue; }
        const u = i / nu, v = j / nv;
        const P = f(u, v);
        row.push(acc.v(P, o.uv ? o.uv(u, v, P) : [u, v], W ? W(P, u, v) : null));
      }
      ids.push(row);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) acc.quad(ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]);
    if (o.out) {
      /* ориентация по подсказке: out(P) — направление «наружу» */
      let s = 0;
      for (let i = i0; i < acc.ix.length; i += 3 * 7) {
        const P = [acc.p[acc.ix[i] * 3], acc.p[acc.ix[i] * 3 + 1], acc.p[acc.ix[i] * 3 + 2]];
        s += Math.sign(dot(acc.triNormal(i), o.out(P)));
      }
      if (s < 0) acc.flipFrom(i0);
    }
    return ids;
  }

  /* ============================================================ ПЛИТОНОСКА */
  /* Лист плиты: z = z0 + c·x² + t·(y − ym) (перед; для спины знаки
     зеркальны). z0 и наклон t подбираются так, чтобы внутренняя сторона
     плиты везде была на gap впереди кителя и при этом прилегала. */
  function fitPlate(TS, front, x0, x1, y0, y1, c, gap, pct) {
    const S = [];
    const PCT = pct || 0;
    for (let x = x0; x <= x1 + 1e-6; x += (x1 - x0) / 12) for (let y = y0; y <= y1 + 1e-6; y += (y1 - y0) / 12) {
      const o = front ? [x, y, 0.0] : [x, y, -0.03];
      const t = TS.cast(o, [0, 0, front ? -1 : 1], 'far');
      if (t !== null) S.push([x, y, front ? -t : -0.03 + t]);
    }
    const ym = (y0 + y1) / 2;
    let best = null;
    for (let tt = -0.25; tt <= 0.35; tt += 0.01) {
      let z0 = front ? Infinity : -Infinity;
      const vals = [];
      for (const [x, y, z] of S) {
        const v = front ? z - gap - c * x * x - tt * (y - ym) : z + gap + c * x * x - tt * (y - ym);
        z0 = front ? Math.min(z0, v) : Math.max(z0, v);
        vals.push(v);
      }
      /* v25: плита ложится по большей части груди (перцентиль), а не по
         самой выпуклой складке кителя: выступающая ткань поджимается под
         плиту (tuck), и между плитой и телом нет щели в 3–4 см */
      if (PCT > 0 && vals.length > 8) {
        vals.sort((a, b) => a - b);
        const k = Math.floor(vals.length * PCT);
        z0 = front ? vals[k] : vals[vals.length - 1 - k];
      }
      let cost = 0;
      for (const [x, y, z] of S) cost += Math.abs(z - (front ? z0 + c * x * x : z0 - c * x * x) - tt * (y - ym));
      if (!best || cost < best.cost) best = { cost, z0, t: tt };
    }
    const { z0, t } = best;
    const sheet = front
      ? (x, y) => ({ p: [x, y, z0 + c * x * x + t * (y - ym)], n: nrm([2 * c * x, t, -1]) })
      : (x, y) => ({ p: [x, y, z0 - c * x * x + t * (y - ym)], n: nrm([2 * c * x, -t, 1]) });
    sheet.zAt = front ? (x, y) => z0 + c * x * x + t * (y - ym) : (x, y) => z0 - c * x * x + t * (y - ym);
    return sheet;
  }

  /* Лист «обёртки» вокруг оси тела: радиус снят лучами с одежды. */
  function wrapSheet(TS, cx, zc, y0, y1, gap, RREF, smooth) {
    const NA = 180, dy = 0.01;
    const ny = Math.ceil((y1 - y0) / dy) + 1;
    const R = new Float32Array(NA * ny);
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * dy;
      for (let i = 0; i < NA; i++) {
        const th = i / NA * TAU - Math.PI;
        const t = TS.cast([cx, y, zc], [Math.sin(th), 0, -Math.cos(th)], 'far');
        R[j * NA + i] = t === null ? NaN : t;
      }
    }
    /* дыры (нет попадания) — соседними значениями; затем сглаживание */
    for (let j = 0; j < ny; j++) for (let i = 0; i < NA; i++) {
      if (!isNaN(R[j * NA + i])) continue;
      for (let k = 1; k < NA / 2; k++) {
        const a = R[j * NA + (i + k) % NA], b = R[j * NA + (i - k + NA) % NA];
        if (!isNaN(a) || !isNaN(b)) { R[j * NA + i] = isNaN(a) ? b : isNaN(b) ? a : Math.max(a, b); break; }
      }
      if (isNaN(R[j * NA + i])) R[j * NA + i] = 0.15;
    }
    /* огибающая: ремни и камербанд натянуты, во впадины не проваливаются */
    const out = new Float32Array(R);
    const sm = smooth || 4;
    for (let j = 0; j < ny; j++) for (let i = 0; i < NA; i++) {
      let m = 0;
      for (let k = -sm; k <= sm; k++) for (let l = -1; l <= 1; l++) {
        const jj = clamp(j + l, 0, ny - 1);
        m = Math.max(m, R[jj * NA + (i + k + NA) % NA] - Math.abs(k) * 0.0006);
      }
      out[j * NA + i] = m;
    }
    const Rat = (th, y) => {
      let a = ((th + Math.PI) / TAU) * NA;
      a = ((a % NA) + NA) % NA;
      const i0 = Math.floor(a), i1 = (i0 + 1) % NA, fa = a - i0;
      const fy = clamp((y - y0) / dy, 0, ny - 1.001), j0 = Math.floor(fy), j1 = Math.min(ny - 1, j0 + 1), fj = fy - j0;
      const v0 = lerp(out[j0 * NA + i0], out[j0 * NA + i1], fa), v1 = lerp(out[j1 * NA + i0], out[j1 * NA + i1], fa);
      return lerp(v0, v1, fj);
    };
    const pos = (x, y) => {
      const th = x / RREF;
      const r = Rat(th, y) + gap;
      return [cx + Math.sin(th) * r, y, zc - Math.cos(th) * r];
    };
    const sheet = (x, y) => {
      const p = pos(x, y);
      const th = x / RREF;
      return { p, n: sheetNormal(pos, x, y, [Math.sin(th), 0, -Math.cos(th)]) };
    };
    sheet.R = Rat;
    return sheet;
  }

  /* Лямка через плечо: путь по верху кителя в плоскости x = xs. */
  function strapSheet(TSx, xs, yc, zc, a0, a1, halfW, gap) {
    const N = 40, P = [];
    for (let i = 0; i <= N; i++) {
      const a = lerp(a0, a1, i / N);
      const dir = [0, Math.sin(a), -Math.cos(a)];
      /* v25: пять лучей по ширине и 70-й перцентиль вместо максимума.
         Максимум цеплял гребень трапеции/ворот у шеи — лямка вставала над
         плечом «плавником». Остаток ткани поджимается под лямку (tuck). */
      const rs = [];
      for (const dx of [-0.8, -0.4, 0, 0.4, 0.8]) {
        const t = TSx.cast([xs + dx * halfW, yc, zc], dir, 'far');
        if (t !== null) rs.push(t);
      }
      rs.sort((p, q) => p - q);
      P.push({ a, r: rs.length ? rs[Math.min(rs.length - 1, Math.floor(rs.length * 0.7))] : 0.1 });
    }
    /* огибающая по соседям — лямка не повторяет мелкие складки */
    const R = P.map((p, i) => Math.max(...P.slice(Math.max(0, i - 1), i + 2).map((q) => q.r)));
    const pts = P.map((p, i) => [xs, yc + Math.sin(p.a) * (R[i] + gap), zc - Math.cos(p.a) * (R[i] + gap)]);
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + len(sub(pts[i], pts[i - 1])));
    const at = (s) => {
      const ss = clamp(s, 0, L[L.length - 1]);
      let i = 0;
      while (i < L.length - 2 && L[i + 1] < ss) i++;
      const f = (ss - L[i]) / Math.max(L[i + 1] - L[i], 1e-6);
      const a = lerp(P[i].a, P[i + 1].a, f);
      return { p: [pts[i][0], lerp(pts[i][1], pts[i + 1][1], f), lerp(pts[i][2], pts[i + 1][2], f)], a };
    };
    const sheet = (x, y) => {
      const q = at(y);
      return { p: [q.p[0] + x, q.p[1], q.p[2]], n: [0, Math.sin(q.a), -Math.cos(q.a)] };
    };
    sheet.L = L[L.length - 1];
    /* радиус внутренней стороны лямки по углу (для поджатия кителя) */
    sheet.rAt = (a) => {
      const f = clamp((a - a0) / (a1 - a0), 0, 1) * N, i = Math.min(N - 1, Math.floor(f)), k = f - i;
      return lerp(R[i], R[i + 1], k) + gap;
    };
    Object.assign(sheet, { xs, yc, zc, a0, a1, halfW });
    return sheet;
  }

  /* ряд строп MOLLE: лента 25 мм, закрепки через 38 мм — отдельные петли */
  function molleRow(acc, sheet, x0, x1, yc, W) {
    const pitch = 0.038, n = Math.max(1, Math.round((x1 - x0) / pitch));
    const step = (x1 - x0) / n;
    for (let k = 0; k < n; k++) {
      pad(acc, sheet, { x: x0 + k * step + 0.0012, y: yc - 0.0125, w: step - 0.0024, h: 0.025, R: 0.0012, d: 0.0021, q: 0.0009,
        bulge: 0.0, seg: 0.02, cs: 2, rimSteps: 2, inner: [0.5], back: false, sink: 0.0008, W });
    }
  }

  /* v26: типы брони (редактор внешнего вида): plate — штурмовая плитоноска (плиты,
     подсумки, рация, аптечка); slick — лёгкая плитоноска (плиты и стропы MOLLE, без
     подсумков на груди); soft — мягкий бронежилет (тонкие панели, без плит и строп);
     none — без бронежилета (остаётся пояс). */
  function buildCarrier(env) {
    const { shirtTS, shirtTSx, wShirt, BI } = env;
    const AT = env.armor || 'plate', SOFTV = AT === 'soft';
    const vest = new Acc(), dark = new Acc(), hard = new Acc(), mag = new Acc();
    const chestW = [[BI.chest, 1]];
    const RIG = () => chestW;
    const SOFT = (k) => (p) => { const w = wShirt(p); return w ? mixW(chestW, w, k) : chestW; };
    for (const a of [vest, dark, hard, mag]) a.wf = RIG;
    if (AT === 'none') return { vest, dark, hard, mag, none: true };

    /* ---------------- передняя плита ---------------- */
    const FX = SOFTV ? 0.148 : 0.128, FY0 = SOFTV ? 1.105 : 1.135, FY1 = SOFTV ? 1.452 : 1.462;
    const sheetF = fitPlate(shirtTS, true, -FX, FX, FY0, FY1, 1.0, 0.0045, 0.12);
    const FD = SOFTV ? 0.015 : 0.030;
    pad(vest, sheetF, { x: -FX, y: FY0, w: FX * 2, h: FY1 - FY0, R: SOFTV ? [0.045, 0.045, 0.06, 0.06] : [0.022, 0.022, 0.05, 0.05], d: FD, q: SOFTV ? 0.006 : 0.011, bulge: 0 });
    const Fo = offsetSheet(sheetF, FD + 0.0004);
    /* лёгкая плитоноска: вместо подсумков — стропы по всей плите */
    if (AT === 'slick') for (const yc of [1.17, 1.22, 1.27]) molleRow(vest, Fo, -0.112, 0.112, yc, null);
    /* тройной подсумок АК: магазин 5,45 стоит широкой стороной наружу */
    const MY0 = 1.148, MY1 = 1.268, MW = 0.082;
    for (const cx of (AT === 'plate' ? [-0.086, 0, 0.086] : [])) {
      pad(vest, Fo, { x: cx - MW / 2, y: MY0, w: MW, h: MY1 - MY0, R: 0.008, d: 0.046, q: 0.006, bulge: 0.0025 });
      /* магазин: выступает над подсумком на 3,5 см */
      const Mo = offsetSheet(Fo, 0.007);
      pad(mag, Mo, { x: cx - 0.035, y: MY1 - 0.04, w: 0.070, h: 0.078, R: [0.004, 0.004, 0.009, 0.006], d: 0.030, q: 0.006, bulge: 0.001 });
      /* резинка-фиксатор с язычком */
      const Bo = offsetSheet(Fo, 0.0375);
      pad(dark, Bo, { x: cx - 0.039, y: MY1 + 0.012, w: 0.078, h: 0.0075, R: 0.0035, d: 0.0035, q: 0.0016 });
      pad(dark, Bo, { x: cx - 0.009, y: MY1 + 0.016, w: 0.018, h: 0.024, R: 0.006, d: 0.004, q: 0.0018 });
      /* эластичная лента поперёк лица подсумка */
      const Po = offsetSheet(Fo, 0.0487);
      pad(dark, Po, { x: cx - MW / 2 + 0.004, y: 1.196, w: MW - 0.008, h: 0.02, R: 0.002, d: 0.0018, q: 0.0008, back: false });
    }
    /* стропы над подсумками и админ-панель с шевроном */
    if (!SOFTV) {
      for (const yc of [1.302, 1.352, 1.402]) molleRow(vest, Fo, -0.112, 0.112, yc, null);
      pad(vest, Fo, { x: -0.068, y: 1.288, w: 0.136, h: 0.118, R: 0.012, d: 0.021, q: 0.007, bulge: 0.003 });
      const Ao = offsetSheet(Fo, 0.0245);
      env.patchAcc && pad(env.patchAcc, Ao, { x: -0.03, y: 1.318, w: 0.06, h: 0.058, R: 0.005, d: 0.0024, q: 0.001, uv: 'unit' });
      pad(hard, Ao, { x: -0.062, y: 1.392, w: 0.124, h: 0.0045, R: 0.0015, d: 0.0015, q: 0.0007, back: false });
      pad(hard, Ao, { x: 0.046, y: 1.384, w: 0.009, h: 0.02, R: 0.002, d: 0.003, q: 0.001 });
    } else {
      /* мягкий жилет: шеврон на липучке прямо на панели */
      pad(dark, Fo, { x: -0.034, y: 1.314, w: 0.068, h: 0.066, R: 0.006, d: 0.0018, q: 0.0008, back: false });
      env.patchAcc && pad(env.patchAcc, offsetSheet(Fo, 0.002), { x: -0.03, y: 1.318, w: 0.06, h: 0.058, R: 0.005, d: 0.0024, q: 0.001, uv: 'unit' });
    }
    /* липучка под позывной */
    pad(dark, Fo, { x: -0.062, y: 1.418, w: 0.124, h: 0.027, R: 0.003, d: 0.0018, q: 0.0008, back: false });

    /* ---------------- задняя плита ---------------- */
    const BY0 = SOFTV ? 1.12 : 1.162, BY1 = SOFTV ? 1.48 : 1.49;
    const sheetB = fitPlate(shirtTS, false, -FX, FX, BY0, BY1, 1.0, 0.0045, 0.12);
    const BD = SOFTV ? 0.014 : 0.028;
    pad(vest, sheetB, { x: -FX, y: BY0, w: FX * 2, h: BY1 - BY0, R: SOFTV ? [0.045, 0.045, 0.06, 0.06] : [0.022, 0.022, 0.045, 0.045], d: BD, q: SOFTV ? 0.006 : 0.01, bulge: 0 });
    const Bo = offsetSheet(sheetB, BD + 0.0004);
    if (!SOFTV) {
      /* v25: середину закрывает чехол гидратора (buildExtras) — стропы только по краям */
      for (let k = 0; k < 6; k++) { molleRow(vest, Bo, -0.124, -0.096, 1.198 + k * 0.05, null); molleRow(vest, Bo, 0.096, 0.124, 1.198 + k * 0.05, null); }
      /* эвакуационная ручка */
      pad(dark, Bo, { x: -0.042, y: 1.455, w: 0.084, h: 0.032, R: 0.01, d: 0.006, q: 0.0025, bulge: 0.009 });
    }

    /* ---------------- камербанд ---------------- */
    const RREF = 0.16;
    const wrap = wrapSheet(shirtTS, 0, -0.035, 1.10, 1.34, 0.0045, RREF, 4);
    const CW = SOFT(0.55);
    for (const s of [1, -1]) {
      const a0 = SOFTV ? 0.86 : 0.70, a1 = 2.46;
      const x0 = s > 0 ? a0 * RREF : -a1 * RREF, x1 = s > 0 ? a1 * RREF : -a0 * RREF;
      if (SOFTV) {
        /* мягкий жилет: боковые панели без строп и подсумков */
        pad(vest, wrap, { x: x0, y: 1.118, w: x1 - x0, h: 0.2, R: 0.02, d: 0.008, q: 0.003, bulge: 0.001, W: CW });
        continue;
      }
      pad(vest, wrap, { x: x0, y: 1.140, w: x1 - x0, h: 0.165, R: 0.012, d: 0.009, q: 0.0035, bulge: 0.0012, W: CW });
      const Co = offsetSheet(wrap, 0.0094);
      for (const yc of [1.170, 1.220, 1.270]) molleRow(vest, Co, x0 + 0.02, x1 - 0.02, yc, CW);
      if (s > 0 && AT !== 'plate') continue;           // лёгкая плитоноска: без аптечки
      if (s < 0) {
        /* радиостанция: подсумок, корпус и антенна */
        const cx = -1.62 * RREF;
        pad(vest, Co, { x: cx - 0.038, y: 1.128, w: 0.076, h: 0.13, R: 0.008, d: 0.045, q: 0.007, bulge: 0.002, W: CW });
        const Ro = offsetSheet(Co, 0.005);
        pad(hard, Ro, { x: cx - 0.031, y: 1.25, w: 0.062, h: 0.035, R: 0.006, d: 0.036, q: 0.005, W: CW });
        /* v25: антенна — гибкий штырь ~33 см, уведён назад за плечо
           (так носят радиостанции на боку: штырь не бьёт по руке и прикладу);
           внизу — жёсткое основание с гайкой */
        const top = Ro(cx + 0.018, 1.284), n = top.n;
        const base = madd(top.p, n, 0.02);
        tube(hard, [base, madd(base, [0, 1, 0], 0.022), madd(base, [0, 1, 0], 0.040)], (i) => (i === 0 ? 0.0068 : i === 1 ? 0.0058 : 0.0042), 8, CW);
        const a0 = madd(base, [0, 1, 0], 0.04);
        const whip = [];
        for (let k = 0; k <= 10; k++) {
          const t = k / 10;
          whip.push(add(a0, [0.018 * t * t, 0.30 * t, 0.05 * t + 0.085 * t * t]));
        }
        tube(hard, whip, (i) => lerp(0.0032, 0.0017, i / 10), 6, CW);
        tube(hard, [whip[10], madd(whip[10], nrm(sub(whip[10], whip[9])), 0.008)], 0.0034, 6, CW);
        env.radioTop = madd(top.p, n, 0.004);
        env.radioJack = add(madd(top.p, n, 0.012), [0.012, 0.004, 0]);
      } else {
        /* аптечка с молнией и ручкой-язычком */
        const cx = 1.60 * RREF;
        pad(vest, Co, { x: cx - 0.052, y: 1.152, w: 0.104, h: 0.1, R: 0.018, d: 0.042, q: 0.012, bulge: 0.004, W: CW });
        const Io = offsetSheet(Co, 0.0466);
        pad(hard, Io, { x: cx - 0.045, y: 1.24, w: 0.09, h: 0.004, R: 0.0015, d: 0.0014, q: 0.0006, back: false, W: CW });
        pad(dark, Io, { x: cx - 0.018, y: 1.212, w: 0.036, h: 0.018, R: 0.004, d: 0.002, q: 0.0009, W: CW });
      }
    }

    /* ---------------- плечевые лямки ---------------- */
    const SW = SOFT(0.3);
    const straps = {};
    for (const s of [1, -1]) {
      const st = strapSheet(shirtTSx, s * 0.104, 1.40, -0.015, 0.36, 2.55, 0.026, 0.0025);
      straps[s] = st;
      pad(vest, st, { x: -0.026, y: 0.0, w: 0.052, h: st.L, R: 0.01, d: SOFTV ? 0.006 : 0.0085, q: 0.0035, bulge: 0.0018, W: SW });
      if (SOFTV) continue;
      /* накладка-пенал для кабеля/трубки и регулировочная лента */
      const So = offsetSheet(st, 0.0153);
      pad(dark, So, { x: -0.015, y: st.L * 0.18, w: 0.030, h: 0.03, R: 0.004, d: 0.0022, q: 0.001, W: SW });
      pad(dark, So, { x: -0.015, y: st.L * 0.78, w: 0.030, h: 0.03, R: 0.004, d: 0.0022, q: 0.001, W: SW });
      pad(hard, So, { x: -0.017, y: st.L * 0.25, w: 0.034, h: 0.011, R: 0.003, d: 0.004, q: 0.0015, W: SW });
    }
    return { vest, dark, hard, mag, sheetF, sheetB, FX, FY0, FY1, BY0, BY1, straps, wrap, RREF, SW, CW, AT };
  }

  /* ============================================================== ПОЯС */
  function buildBelt(env) {
    const { beltTS, wPants, BI } = env;
    const belt = new Acc(), hard = new Acc();
    const W = (p) => wPants(p) || [[BI.hips, 1]];
    belt.wf = W; hard.wf = W;
    const RREF = 0.16;
    /* v25: пояс снимается с брюк (не с подола кителя) и затянут: китель под
       ним поджимается (tuck), над поясом — лёгкий напуск. Раньше луч брал
       дальний край свободного подола, и пояс висел кольцом в 2–5 см от тела. */
    const BELT_GAP = 0.0085;
    const wrap = wrapSheet(beltTS, 0, -0.012, 0.93, 1.07, BELT_GAP, RREF, 3);
    const Y0 = 0.978, H = 0.05;
    pad(belt, wrap, { x: -Math.PI * RREF + 0.002, y: Y0, w: TAU * RREF - 0.004, h: H, R: 0.006, d: 0.009, q: 0.0035, bulge: 0.001, seg: 0.015 });
    const Bo = offsetSheet(wrap, 0.0102);
    /* внешняя лента со стропами */
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const th = k * 0.42;
      pad(belt, Bo, { x: th * RREF - 0.017, y: Y0 + 0.012, w: 0.034, h: 0.026, R: 0.0012, d: 0.0021, q: 0.0009, bulge: 0, cs: 2, rimSteps: 2, inner: [0.5], back: false });
    }
    /* пряжка кобра */
    pad(hard, Bo, { x: -0.03, y: Y0 + 0.001, w: 0.06, h: 0.048, R: [0.006, 0.006, 0.006, 0.006], d: 0.011, q: 0.003, bulge: 0.001 });
    pad(hard, offsetSheet(Bo, 0.011), { x: -0.012, y: Y0 + 0.017, w: 0.024, h: 0.016, R: 0.004, d: 0.0025, q: 0.001 });
    /* подсумок сзади справа */
    const cx = 2.35 * RREF;
    pad(belt, Bo, { x: cx - 0.055, y: Y0 - 0.06, w: 0.11, h: 0.105, R: 0.014, d: 0.042, q: 0.012, bulge: 0.004 });
    pad(hard, offsetSheet(Bo, 0.045), { x: cx - 0.048, y: Y0 + 0.028, w: 0.096, h: 0.004, R: 0.0015, d: 0.0014, q: 0.0006, back: false });
    /* сброс (свёрнутый мешок) сзади слева */
    {
      const dx = -2.30 * RREF;
      pad(belt, Bo, { x: dx - 0.06, y: Y0 - 0.012, w: 0.12, h: 0.062, R: 0.025, d: 0.034, q: 0.014, bulge: 0.008 });
      pad(env.darkAcc || belt, offsetSheet(Bo, 0.036), { x: dx - 0.012, y: Y0 - 0.014, w: 0.024, h: 0.066, R: 0.004, d: 0.003, q: 0.0012, W });
    }
    /* нож в ножнах спереди слева: ножны ниже пояса, рукоять вверх */
    {
      const kx = -0.62 * RREF;
      pad(belt, Bo, { x: kx - 0.02, y: Y0 - 0.115, w: 0.04, h: 0.15, R: [0.016, 0.016, 0.006, 0.006], d: 0.012, q: 0.005, bulge: 0.002 });
      const Ko = offsetSheet(Bo, 0.0125);
      pad(env.darkAcc || belt, Ko, { x: kx - 0.021, y: Y0 + 0.006, w: 0.042, h: 0.012, R: 0.003, d: 0.003, q: 0.0012, W });
      const h0 = Ko(kx, Y0 + 0.034).p, h1 = Ko(kx + 0.004, Y0 + 0.118).p;
      const nn = Ko(kx, Y0 + 0.07).n;
      const P = (t) => madd(add(mul(h0, 1 - t), mul(h1, t)), nn, 0.008);
      tube(hard, [P(0), P(0.12), P(0.5), P(0.88), P(1)], (i) => [0.0095, 0.0118, 0.0112, 0.0118, 0.0102][i], 8, null, { flat: 0.3, up: nn });
      tube(hard, [madd(P(0), [0, 1, 0], -0.004), madd(P(0), [0, 1, 0], 0.003)], 0.0135, 8, null, { flat: 0.45, up: nn });
    }
    return { belt, hard, wrap, Y0, H, gap: BELT_GAP };
  }

  /* ============================================================ БОТИНКИ */
  /* Кусочно-гладкая таблица: [[x, y], ...] -> y(x) со сглаживанием. */
  function pl(x, T) {
    if (x <= T[0][0]) return T[0][1];
    for (let i = 0; i + 1 < T.length; i++) {
      if (x <= T[i + 1][0]) { const t = (x - T[i][0]) / (T[i + 1][0] - T[i][0]); const s = t * t * (3 - 2 * t); return lerp(T[i][1], T[i + 1][1], s); }
    }
    return T[T.length - 1][1];
  }
  /* Геометрия ботинка (класс LOWA Zephyr / Salomon Quest mid): габариты
     сняты с пакета (длина 30 см, ширина 11,3 см), высота берца 22 см. */
  const BOOT = {
    zf: [[0.0, -0.209], [0.03, -0.209], [0.040, -0.2075], [0.050, -0.203], [0.060, -0.194], [0.068, -0.181], [0.074, -0.168],
      [0.100, -0.139], [0.125, -0.107], [0.150, -0.072], [0.168, -0.052], [0.230, -0.055]],
    zb: [[0.0, 0.086], [0.03, 0.086], [0.05, 0.090], [0.075, 0.089], [0.10, 0.082], [0.13, 0.071], [0.165, 0.067], [0.205, 0.071], [0.230, 0.079]],
    foot: [[0, 0.041], [0.2, 0.045], [0.42, 0.046], [0.66, 0.057], [0.84, 0.054], [1, 0.047]],
    top: 0.222
  };
  function bootSlice(s, y, grow) {
    const g = grow || 0;
    const zf = pl(y, BOOT.zf) - g, zb = pl(y, BOOT.zb) + g;
    const cx = s * 0.1095;
    const sh = sstep(0.074, 0.17, y);
    const toeTop = 1 - 0.13 * sstep(0.045, 0.074, y);
    const shaftHW = 0.0445 + 0.004 * sstep(0.2, 0.226, y);
    return (phi) => {
      const c = Math.cos(phi), sn = Math.sin(phi);
      const zm = (zf + zb) / 2, A = (zf - zb) / 2;
      const z = zm + A * Math.sign(c) * Math.pow(Math.abs(c), 0.72);
      const u = clamp((zb - z) / (zb - zf), 0, 1);
      const hw = lerp(pl(u, BOOT.foot) * toeTop, shaftHW, sh) + g;
      const x = cx + s * Math.sign(sn) * Math.pow(Math.abs(sn), 0.8) * hw;
      return [x, y, z];
    };
  }
  /* радиус ботинка от оси голени в направлении th (для напуска брюк) */
  function bootRadius(s, y, cx, cz) {
    const f = bootSlice(s, y, 0);
    const pts = [];
    for (let i = 0; i < 96; i++) pts.push(f(i / 96 * TAU));
    return (th) => {
      const d = [Math.sin(th), -Math.cos(th)];
      let best = 0;
      for (const p of pts) {
        const vx = p[0] - cx, vz = p[2] - cz, r = Math.hypot(vx, vz);
        const c = (vx * d[0] + vz * d[1]) / (r || 1);
        if (c > 0.985) best = Math.max(best, r * c);
      }
      return best || 0.05;
    };
  }

  function buildBoots(env) {
    const { BI } = env;
    const upper = new Acc(), sole = new Acc(), lace = new Acc(), hard = new Acc();
    for (const s of [1, -1]) {
      const S = s > 0 ? 'R' : 'L';
      const W = (p) => {
        const kW = 0.75 * sstep(0.11, 0.21, p[1]);
        const tW = sstep(-0.095, -0.145, p[2]) * (1 - kW) * (1 - sstep(0.08, 0.12, p[1]));
        return [[BI['knee' + S], kW], [BI['toe' + S], tW], [BI['ankle' + S], Math.max(0, 1 - kW - tW)]];
      };
      const NA = 64;
      const out = (P) => [P[0] - s * 0.1095, 0, P[2] + 0.06];
      /* --- верх: горизонтальные срезы от подошвы до канта, затем подклад --- */
      const Y = [0.028, 0.034, 0.041, 0.048, 0.055, 0.062, 0.068, 0.074, 0.082, 0.091, 0.100, 0.110, 0.120, 0.130,
        0.140, 0.150, 0.160, 0.170, 0.180, 0.190, 0.200, 0.208, 0.214, 0.219];
      const rows = Y.map((y) => ({ f: bootSlice(s, y, 0), k: 1, y }));
      /* мягкий кант: валик наружу, перегиб и подклад внутрь */
      const collar = [[0.2225, 1.03], [0.2255, 1.035], [0.228, 1.0], [0.2275, 0.955], [0.224, 0.925], [0.205, 0.915]];
      const topF = bootSlice(s, BOOT.top, 0);
      for (const [y, k] of collar) rows.push({ f: topF, k, y });
      const cxz = (y) => { const f = bootSlice(s, y, 0); const a = f(0), b = f(Math.PI); return [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2]; };
      const cTop = cxz(BOOT.top);
      grid(upper, (u, v) => {
        const i = Math.round(v * (rows.length - 1));
        const r = rows[i];
        const P = r.f(u * TAU);
        /* складки на сгибе стопы и лёгкая «мятость» верха */
        const crease = 0.0012 * Math.sin(u * TAU * 5 + 1.3) * Math.exp(-(((r.y - 0.1) / 0.02) ** 2)) * (Math.cos(u * TAU) > 0.2 ? 1 : 0);
        let x = P[0], z = P[2];
        if (r.k !== 1 || r.y > BOOT.top) { x = cTop[0] + (x - cTop[0]) * r.k; z = cTop[1] + (z - cTop[1]) * r.k; }
        const d = out([x, 0, z]), l = Math.hypot(d[0], d[2]) || 1;
        return [x + d[0] / l * crease, r.y, z + d[2] / l * crease];
      }, NA, rows.length - 1, W, { wrapU: true, out, uv: (u, v, P) => [u * 0.34, P[1] * 1.0] });

      /* --- подошва: рант, канавка, протектор --- */
      const SL = [[0.004, 0.002], [0.0065, 0.0052], [0.010, 0.0062], [0.0135, 0.0046], [0.0175, 0.0064], [0.029, 0.006], [0.0335, 0.0038], [0.036, 0.0005]];
      const base = (y, g) => bootSlice(s, 0.03, g);
      grid(sole, (u, v) => {
        const i = Math.round(v * (SL.length - 1));
        const [y, g] = SL[i];
        const P = base(y, g)(u * TAU);
        /* каблук и носок чуть приподняты — «рокер» подошвы */
        const lift = 0.006 * sstep(-0.17, -0.215, P[2]);
        return [P[0], y + lift * (1 - y / 0.036), P[2]];
      }, NA, SL.length - 1, W, { wrapU: true, out });
      /* дно — веер к центру; протектор — отдельные грунтозацепы */
      {
        const f = base(0, 0.002);
        const ids = [];
        for (let i = 0; i < NA; i++) { const P = f(i / NA * TAU); P[1] = 0.004 + 0.006 * sstep(-0.17, -0.215, P[2]); ids.push(sole.v(P, [P[0], P[2]])); }
        const c = [s * 0.1095, 0.0055, -0.06];
        const cid = sole.v(c, [c[0], c[2]]);
        const i0 = sole.ix.length;
        for (let i = 0; i < NA; i++) sole.tri(ids[i], ids[(i + 1) % NA], cid);
        if (sole.triNormal(sole.ix.length - 3)[1] > 0) sole.flipFrom(i0);
        const ground = (x, y) => ({ p: [x, 0.0046, y], n: [0, -1, 0] });
        const inside = (x, z) => {
          const u = clamp((0.086 - z) / (0.086 + 0.209), 0, 1);
          return Math.abs(x - s * 0.1095) < pl(u, BOOT.foot) * 0.82 && z > -0.19 && z < 0.07 && (z < -0.02 || z > 0.02);
        };
        for (let zi = 0; zi < 13; zi++) for (let xi = -2; xi <= 2; xi++) {
          const z = -0.185 + zi * 0.02, x = s * 0.1095 + xi * 0.02 + (zi % 2) * 0.01;
          if (!inside(x, z)) continue;
          pad(sole, ground, { x: x - 0.007, y: z - 0.005, w: 0.014, h: 0.01, R: 0.002, d: 0.0045, q: 0.0012, seg: 0.02, cs: 2, rimSteps: 2, inner: [0.4], back: false, sink: 0.0005, W });
        }
      }
      /* --- резиновая накладка носка и задник --- */
      const shell = (y0, y1, a0, a1, g, acc) => grid(acc, (u, v) => {
        const y = lerp(y0, y1, v);
        const phi = lerp(a0, a1, u);
        const topCut = 1 - 0.35 * Math.pow(Math.abs(u * 2 - 1), 2);
        const yy = lerp(y0, y0 + (y1 - y0) * topCut, v);
        return bootSlice(s, yy, g)(phi);
      }, 24, 5, W, { out });
      shell(0.028, 0.066, -1.35, 1.35, 0.0016, sole);
      shell(0.028, 0.072, Math.PI - 1.05, Math.PI + 1.05, 0.0016, sole);
      /* --- шнуровка: 4 люверса и 3 крючка на сторону, крест-накрест --- */
      const front = (y, off, lift) => {
        const f = bootSlice(s, y, 0);
        const hw = lerp(pl(1, BOOT.foot), 0.0445, sstep(0.074, 0.17, y));
        const a = Math.asin(clamp(Math.pow(Math.abs(off) / Math.max(hw, 1e-3), 1 / 0.8), 0, 1)) * Math.sign(off) * s;
        const P = f(a);
        const P2 = bootSlice(s, y + 0.004, 0)(a), P3 = f(a + 0.03);
        let n = nrm(cross(sub(P2, P), sub(P3, P)));
        const o = out(P);
        if (dot(n, o) < 0) n = mul(n, -1);
        return madd(P, n, lift || 0);
      };
      const LY = [0.092, 0.111, 0.130, 0.149, 0.170, 0.190, 0.210];
      const eL = LY.map((y) => front(y, -0.0165, 0.0025)), eR = LY.map((y) => front(y, 0.0165, 0.0025));
      const nAt = (y, off) => { const a = front(y, off, 0), b = front(y, off, 0.01); return nrm(sub(b, a)); };
      LY.forEach((y, j) => {
        for (const [e, off] of [[eL[j], -0.0165], [eR[j], 0.0165]]) {
          const n = nAt(y, off);
          if (j < 4) ring(hard, e, n, 0.0036, 0.0012, W);
          else { ring(hard, madd(e, n, 0.001), [0, 1, 0], 0.0034, 0.0013, W); }
        }
      });
      /* язык над кантом */
      {
        const tongue = (x, y) => { const P = front(y, x, 0.0005); return { p: P, n: nAt(y, x) }; };
        pad(upper, tongue, { x: -0.021, y: 0.168, w: 0.042, h: 0.07, R: [0.004, 0.004, 0.016, 0.016], d: 0.0045, q: 0.002, bulge: 0.0015, W });
      }
      const lift = (a, b, k) => {
        const m = mul(add(a, b), 0.5);
        const y = m[1];
        return madd(m, nAt(y, 0), k);
      };
      for (let j = 0; j + 1 < LY.length; j++) {
        tube(lace, [eL[j], lift(eL[j], eR[j + 1], 0.0045), eR[j + 1]], 0.0021, 5, W);
        tube(lace, [eR[j], lift(eR[j], eL[j + 1], 0.0058), eL[j + 1]], 0.0021, 5, W);
      }
      tube(lace, [eL[0], lift(eL[0], eR[0], 0.0035), eR[0]], 0.0021, 5, W);
      /* бантик и хвосты */
      const knot = lift(eL[6], eR[6], 0.008);
      const nk = nAt(0.21, 0);
      for (const side of [-1, 1]) {
        const loop = [];
        for (let k = 0; k <= 8; k++) {
          const a = k / 8 * Math.PI;
          loop.push(add(knot, [side * s * Math.sin(a) * 0.022, Math.cos(a) * -0.006 + 0.004 - Math.sin(a) * 0.012, 0]).map((v, i) => v + nk[i] * 0.004 * Math.sin(a)));
        }
        tube(lace, loop, 0.0021, 5, W);
        tube(lace, [knot, add(knot, [side * s * 0.008, -0.02, 0]), add(knot, [side * s * 0.012, -0.045, 0.004])], 0.0019, 5, W);
      }
      /* петля-ушко на заднике */
      {
        const f = bootSlice(s, BOOT.top, 0), P = f(Math.PI);
        const pts = [];
        for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI; pts.push([P[0] + Math.cos(a) * 0.008 * s, BOOT.top - 0.012 + Math.sin(a) * 0.026, P[2] + 0.003 + Math.sin(a) * 0.004]); }
        tube(lace, pts, 0.0028, 5, W, { flat: 0.55 });
      }
    }
    return { upper, sole, lace, hard };
  }

  /* ================================================ НАПУСК БРЮК НА БЕРЦЫ */
  function buildCuffs(env) {
    const { pantsTS, wPants } = env;
    const acc = new Acc();
    acc.wf = (p) => wPants(p);
    for (const s of [1, -1]) {
      const cx = s * 0.112, cz = 0.013;
      const TS = pantsTS[s > 0 ? 'R' : 'L'];
      const NA = 72;
      const rTop = [], rBot = [];
      const bootR = bootRadius(s, 0.2255, cx, cz);
      for (let i = 0; i < NA; i++) {
        const th = i / NA * TAU;
        const t = TS.cast([cx, 0.318, cz], [Math.sin(th), 0, -Math.cos(th)], 'far');
        rTop.push((t || 0.055) + 0.0015);
        rBot.push(bootR(th) + 0.004);
      }
      const R = (i) => rTop[((i % NA) + NA) % NA];
      const rows = [];
      rows.push({ y: 0.2045, v: -0.2 });
      rows.push({ y: 0.196, v: -0.1 });
      for (let k = 0; k <= 14; k++) { const v = k / 14; rows.push({ y: lerp(0.199, 0.318, v), v }); }
      const shape = (i, row, folds) => {
        const th = i / NA * TAU;
        const v = row.v;
        const rb = rBot[i % NA], rt = (R(i - 1) + R(i) * 2 + R(i + 1)) / 4;
        let r;
        if (v < 0) r = v < -0.15 ? rb - 0.0025 : rb + 0.0025;
        else {
          r = lerp(rb + 0.0035, rt, sstep(0.3, 1, v));
          r += 0.0135 * Math.exp(-(((v - 0.26) / 0.2) ** 2));
          if (folds) {
            const env = Math.exp(-(((v - 0.3) / 0.28) ** 2));
            r += 0.0042 * Math.sin(th * 8 + 1.7 * vn1(th * 1.6, 3 + s) + v * 3) * env;
            r += 0.0016 * Math.sin(th * 13 + 2.1 * vn1(th * 2.3, 5 + s)) * env * (1 - v);
            r += 0.0012 * Math.sin(v * 30 + th * 2) * (1 - v) * (1 - v);
          }
          r *= 1 + 0.03 * Math.exp(-(((v - 0.25) / 0.2) ** 2)) * vn1(th * 2.1, 9 + s);
        }
        const sag = v >= 0 ? -0.006 * Math.exp(-(((v - 0.25) / 0.2) ** 2)) * (0.6 + 0.4 * vn1(th * 1.7, 2 + s)) : 0;
        return [cx + Math.sin(th) * r, row.y + sag, cz - Math.cos(th) * r];
      };
      grid(acc, (u, v) => {
        const i = Math.round(u * NA), row = rows[Math.round(v * (rows.length - 1))];
        return shape(i % NA, row, true);
      }, NA, rows.length - 1, null, { wrapU: true, out: (P) => [P[0] - cx, 0, P[2] - cz], uv: (u, v, P) => [u * 0.35, P[1]] });
      /* манжета на липучке по внешней стороне */
      const RREF = 0.06;
      const band = (x, y) => {
        const th = s * x / RREF;
        const f = (xx) => {
          const t2 = s * xx / RREF;
          const i = ((t2 / TAU) * NA % NA + NA) % NA;
          const i0 = Math.floor(i), fr = i - i0;
          const row = { y, v: (y - 0.199) / (0.318 - 0.199) };
          const a = shape(i0, row, false), b = shape((i0 + 1) % NA, row, false);
          const p = [lerp(a[0], b[0], fr), y, lerp(a[2], b[2], fr)];
          const d = nrm([p[0] - cx, 0, p[2] - cz]);
          return madd(p, d, 0.0046);
        };
        const p = f(x);
        return { p, n: nrm([Math.sin(th), 0, -Math.cos(th)]) };
      };
      pad(acc, band, { x: -0.3 * RREF, y: 0.222, w: 2.5 * RREF, h: 0.021, R: 0.004, d: 0.0028, q: 0.0012, bulge: 0.0006 });
      pad(acc, band, { x: 2.1 * RREF, y: 0.217, w: 0.03, h: 0.031, R: 0.008, d: 0.0034, q: 0.0015, bulge: 0.0008 });
    }
    return acc;
  }

  /* ========================================================= НАКОЛЕННИКИ */
  function buildKneePads(env) {
    const { pantsTS, wPants, J } = env;
    const cap = new Acc(), base = new Acc();
    const W = (p) => wPants(p);
    cap.wf = W; base.wf = W;
    for (const s of [1, -1]) {
      const S = s > 0 ? 'R' : 'L';
      const K = J['knee' + S];
      const TS = pantsTS[S];
      const RREF = 0.07;
      const sheet = wrapSheet(TS, K[0], K[2], K[1] - 0.14, K[1] + 0.14, 0.0022, RREF, 3);
      const sh = (x, y) => sheet(s * x, y);
      const y0 = K[1] - 0.072;
      pad(base, sh, { x: -0.066, y: y0 - 0.012, w: 0.132, h: 0.172, R: 0.034, d: 0.009, q: 0.0035, bulge: 0.002 });
      const Bo = offsetSheet(sh, 0.0111);
      pad(cap, Bo, { x: -0.056, y: y0, w: 0.112, h: 0.142, R: [0.03, 0.03, 0.045, 0.045], d: 0.012, q: 0.005, bulge: 0.009 });
      /* ребро жёсткости по центру чашки */
      const Co = offsetSheet(Bo, 0.0205);
      pad(cap, Co, { x: -0.028, y: y0 + 0.05, w: 0.056, h: 0.012, R: 0.005, d: 0.003, q: 0.0014 });
      /* резинки над и под коленом — вокруг всей ноги */
      for (const yc of [K[1] + 0.082, K[1] - 0.086]) {
        pad(base, sh, { x: -Math.PI * RREF + 0.004, y: yc - 0.011, w: TAU * RREF - 0.008, h: 0.022, R: 0.003, d: 0.0032, q: 0.0012, bulge: 0.0005, seg: 0.015 });
      }
    }
    return { cap, base };
  }

  /* ============================================================== ПАНАМА */
  function buildBoonie(env) {
    const { headTS, BI, headTop } = env;
    const hat = new Acc(), hard = new Acc();
    const HW = [[BI.head, 1]];
    hat.wf = () => HW; hard.wf = () => HW;
    const ZC = -0.062;
    const NA = 96;
    const dirOf = (th) => [Math.sin(th), 0, -Math.cos(th)];
    const headR = (th, y) => {
      let r = 0;
      for (const dy of [-0.004, 0, 0.004]) { const t = headTS.cast([0, y + dy, ZC], dirOf(th), 'far'); if (t !== null) r = Math.max(r, t); }
      return r || 0.08;
    };
    const yb = (th) => 1.769 + 0.005 * Math.cos(th);
    const yt = headTop + 0.015;
    /* радиус тульи: по голове с запасом, плюс мягкая «неровность» ткани */
    const RB = [], RW = [];
    const F = [0, 0.1, 0.22, 0.36, 0.5, 0.64, 0.78, 0.9, 1];
    for (let i = 0; i < NA; i++) {
      const th = i / NA * TAU;
      const rb = headR(th, yb(th)) + 0.008;
      RB.push(rb);
      RW.push(F.map((f) => {
        const y = lerp(yb(th), yt - 0.012, f);
        const rh = headR(th, y) + 0.0075;
        return Math.max(rh, rb * (1 - 0.07 * f * f)) + 0.0022 * vn1(th * 2.5 + f * 1.7, 4) * f;
      }));
    }
    /* сглаживание по окружности */
    const RWs = RW.map((row, i) => row.map((_, k) => (RW[(i + NA - 1) % NA][k] + RW[i][k] * 2 + RW[(i + 1) % NA][k]) / 4));
    const seam = (i) => (((i - 8) % 16) + 16) % 16 === 0 ? -0.0012 : (((i - 8) % 16 + 16) % 16 === 1 || ((i - 8) % 16 + 16) % 16 === 15 ? 0.0003 : 0);
    const crownRows = [];
    F.forEach((f, k) => crownRows.push({ k, f, dr: 0, dy: 0 }));
    /* скругление к донышку и донышко */
    const roll = [[-0.004, 0.006], [-0.0095, 0.0105], [-0.015, 0.012]];
    roll.forEach(([dr, dy], j) => crownRows.push({ k: F.length - 1, f: 1, dr, dy, groove: j === 1 }));
    const topK = [0.78, 0.55, 0.3, 0.08];
    const crownP = (i, row, kk) => {
      const th = i / NA * TAU, d = dirOf(th);
      const r0 = RWs[i % NA][row.k];
      let r = r0 + row.dr + (row.groove ? -0.0008 : 0) + (row.f < 1 || row.dr === 0 ? seam(i) : 0);
      let y = lerp(yb(th), yt - 0.012, row.f) + row.dy;
      if (kk !== undefined) {
        r = (r0 - 0.015) * kk;
        y = yt + 0.0045 * (1 - kk * kk) + 0.002 * vn1(th * 1.3 + kk * 2, 6) * (1 - kk) - 0.003 * Math.exp(-(((kk - 0.3) / 0.25) ** 2)) * (Math.cos(th) > 0 ? 1 : 0.4);
      }
      return [d[0] * r, y, ZC + d[2] * r];
    };
    const rowsAll = crownRows.map((r) => ({ r })).concat(topK.map((kk) => ({ r: crownRows[crownRows.length - 1], kk })));
    grid(hat, (u, v) => {
      const i = Math.round(u * NA) % NA, R = rowsAll[Math.round(v * (rowsAll.length - 1))];
      return crownP(i, R.r, R.kk);
    }, NA, rowsAll.length - 1, null, { wrapU: true, out: (P) => [P[0], (P[1] - 1.8) * 2, P[2] - ZC], uv: (u, v, P) => [u * 0.6, P[1] + v * 0.1] });
    /* заглушка на макушке */
    {
      const ids = [];
      const last = rowsAll[rowsAll.length - 1];
      for (let i = 0; i < NA; i++) ids.push(hat.v(crownP(i, last.r, last.kk), [0, 0]));
      const c = hat.v([0, yt + 0.0045, ZC], [0, 0]);
      const i0 = hat.ix.length;
      for (let i = 0; i < NA; i++) hat.tri(ids[i], ids[(i + 1) % NA], c);
      if (hat.triNormal(hat.ix.length - 3)[1] < 0) hat.flipFrom(i0);
    }
    /* лента с петлями под маскировку: закрепки через 45° */
    {
      const fr = [0.03, 0.09, 0.2, 0.3, 0.36];
      grid(hat, (u, v) => {
        const i = Math.round(u * NA) % NA, th = i / NA * TAU, d = dirOf(th);
        const k = Math.round(v * (fr.length - 1));
        const f = fr[k];
        const rw = lerp(RWs[i][0], RWs[i][1], f / 0.1 > 1 ? 1 : f / 0.1) + (f > 0.1 ? (RWs[i][2] - RWs[i][1]) * (f - 0.1) / 0.12 : 0);
        const tack = (i % 12 === 0) ? -0.0022 : (i % 12 === 1 || i % 12 === 11 ? -0.0009 : 0.0006 * Math.sin((i % 12) / 12 * Math.PI));
        const edge = (k === 0 || k === fr.length - 1) ? -0.0026 : 0;
        const r = rw + 0.0034 + tack + edge;
        const y = lerp(yb(th), yt - 0.012, f);
        return [d[0] * r, y, ZC + d[2] * r];
      }, NA, fr.length - 1, null, { wrapU: true, out: (P) => [P[0], 0, P[2] - ZC], uv: (u, v, P) => [u * 0.6, P[1]] });
    }
    /* поля: верх, кант, низ; концентрическая стёжка через 8,5 мм */
    {
      const BWf = (th) => 0.064 + 0.006 * Math.pow(Math.sin(th), 2);
      const H = 0.0018;
      const droop = (th, d, bw) => {
        const t = d / bw;
        return Math.pow(t, 1.6) * (0.017 + 0.006 * Math.cos(2 * th)) + 0.0065 * t * t * vn1(th * 2.2, 7) + 0.003 * t * t * Math.sin(3 * th + 0.6);
      };
      const D = [0, 0.003];
      for (let k = 0; k < 7; k++) { const c = 0.009 + k * 0.0085; D.push(c - 0.0012, c, c + 0.0012); }
      const rows = [];
      for (const d of D) rows.push({ d, side: 1, g: D.indexOf(d) >= 2 && (D.indexOf(d) - 2) % 3 === 1 });
      rows.push({ d: 1, side: 0.6, edge: true }, { d: 1.02, side: 0, edge: true }, { d: 1, side: -0.6, edge: true });
      for (let j = D.length - 1; j >= 0; j--) rows.push({ d: D[j], side: -1, g: j >= 2 && (j - 2) % 3 === 1 });
      grid(hat, (u, v) => {
        const i = Math.round(u * NA) % NA, th = i / NA * TAU, dd = dirOf(th);
        const row = rows[Math.round(v * (rows.length - 1))];
        const bw = BWf(th);
        const d = row.edge ? bw * row.d + 0.0005 : Math.min(row.d, bw - 0.002);
        const r0 = RWs[i][0] + 0.0005;
        const y0 = yb(th) - droop(th, d, bw);
        /* касательная и нормаль к полю в радиальной плоскости */
        const d2 = Math.min(d + 0.002, bw + 0.002);
        const slope = -(droop(th, d2, bw) - droop(th, d, bw)) / Math.max(d2 - d, 1e-4);
        const nr = -slope / Math.hypot(1, slope), ny = 1 / Math.hypot(1, slope);
        const off = row.edge ? row.side * H : row.side * (H - (row.g ? 0.0006 : 0));
        const r = r0 + d + nr * off;
        return [dd[0] * r, y0 + ny * off, ZC + dd[2] * r];
      }, NA, rows.length - 1, null, { wrapU: true, out: (P) => [P[0] * 0.2, 1, (P[2] - ZC) * 0.2], uv: (u, v, P) => [P[0], P[2]] });
    }
    /* вентиляционные люверсы */
    for (const th of [Math.PI / 2 - 0.13, Math.PI / 2 + 0.13, -Math.PI / 2 - 0.13, -Math.PI / 2 + 0.13]) {
      const i = Math.round(((th + TAU) % TAU) / TAU * NA) % NA;
      const P = crownP(i, crownRows[5]);
      const n = nrm([P[0], 0, P[2] - ZC]);
      ring(hard, madd(P, n, 0.0006), n, 0.0034, 0.0011, null);
    }
    return { hat, hard };
  }

  /* ========================================================== БАЛАКЛАВА */
  /* Кант выреза: граничные рёбра маски после сварки по позиции. */
  function boundaryLoops(pos, index) {
    const key = (i) => Math.round(pos[i * 3] * 2e4) + '_' + Math.round(pos[i * 3 + 1] * 2e4) + '_' + Math.round(pos[i * 3 + 2] * 2e4);
    const weld = new Map(), rep = new Int32Array(pos.length / 3);
    for (let i = 0; i < rep.length; i++) { const k = key(i); if (!weld.has(k)) weld.set(k, i); rep[i] = weld.get(k); }
    const edges = new Map();
    for (let t = 0; t < index.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = rep[index[t + e]], b = rep[index[t + (e + 1) % 3]];
      const k = a < b ? a + ',' + b : b + ',' + a;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
    const adj = new Map();
    for (const [k, c] of edges) {
      if (c !== 1) continue;
      const [a, b] = k.split(',').map(Number);
      if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push(b); adj.get(b).push(a);
    }
    const seen = new Set(), loops = [];
    for (const start of adj.keys()) {
      if (seen.has(start)) continue;
      const loop = [start]; seen.add(start);
      let prev = -1, cur = start;
      for (;;) {
        const nb = (adj.get(cur) || []).find((x) => x !== prev && !seen.has(x));
        if (nb === undefined) break;
        loop.push(nb); seen.add(nb); prev = cur; cur = nb;
      }
      if (loop.length > 8) loops.push(loop);
    }
    return loops;
  }

  function buildMask(env) {
    const { maskGeo, wMask } = env;
    const pos = maskGeo.attributes.position.array;
    let nr = maskGeo.attributes.normal;
    const idx = maskGeo.index.array;
    const n = pos.length / 3;
    /* В пакете у маски часть треугольников (всё лицо) обойдена наизнанку:
       при двусторонней отрисовке three брал обратную нормаль, и ткань на
       лице выходила чёрной, без рельефа. Обход выравнивается по нормалям
       вершин. */
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const A = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]];
      const g = cross(sub([pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]], A), sub([pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]], A));
      /* «наружу» — от центра головы (для шеи — от оси шеи) */
      const cy = (A[1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3;
      const O = cy > 1.62 ? [0, 1.69, -0.045] : [0, cy, -0.03];
      const M = [(A[0] + pos[b * 3] + pos[c * 3]) / 3, cy, (A[2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3];
      if (dot(g, sub(M, O)) < 0) { idx[t + 1] = c; idx[t + 2] = b; }
    }
    maskGeo.index.needsUpdate = true;
    /* нормали пакета — Int16: пересчёт в них обнулял большую часть вершин */
    maskGeo.deleteAttribute('normal');
    maskGeo.computeVertexNormals();
    nr = maskGeo.attributes.normal;
    /* сборки на шее и чуть более толстое полотно */
    for (let v = 0; v < n; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      const nx = nr.getX(v), ny = nr.getY(v), nz = nr.getZ(v);
      const th = Math.atan2(x, -(z + 0.03));
      const neck = sstep(1.545, 1.57, y) * (1 - sstep(1.615, 1.645, y));
      const d = 0.0009 + neck * (0.0024 + 0.0017 * Math.sin(y * 460 + 2.2 * Math.sin(th * 3) + th * 1.5) + 0.0009 * Math.sin(th * 11 + y * 90));
      pos[v * 3] += nx * d; pos[v * 3 + 1] += ny * d; pos[v * 3 + 2] += nz * d;
    }
    maskGeo.attributes.position.needsUpdate = true;
    maskGeo.computeVertexNormals();
    /* Натяжение трикотажа. Маска была снята с кожи и повторяла каждую
       ямку — выглядела латексной. Настоящая балаклава перекидывается через
       впадины: крылья носа, носогубные складки, губы, ямку под нижней
       губой, угол под подбородком. Итеративное сглаживание Лапласа по
       сваренной сетке, где вершина может только подниматься по своей
       нормали (внутрь, в кожу, — никогда). У выреза и вне лица — не
       действует: кромка остаётся на месте. */
    {
      const key = (i) => Math.round(pos[i * 3] * 2e4) + '_' + Math.round(pos[i * 3 + 1] * 2e4) + '_' + Math.round(pos[i * 3 + 2] * 2e4);
      const weld = new Map(), rep = new Int32Array(n);
      for (let i = 0; i < n; i++) { const k = key(i); if (!weld.has(k)) weld.set(k, i); rep[i] = weld.get(k); }
      const nb = new Map(), ecount = new Map();
      for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
        const a = rep[idx[t + e]], b = rep[idx[t + (e + 1) % 3]];
        if (a === b) continue;
        if (!nb.has(a)) nb.set(a, new Set());
        if (!nb.has(b)) nb.set(b, new Set());
        nb.get(a).add(b); nb.get(b).add(a);
        const k = a < b ? a * n + b : b * n + a;
        ecount.set(k, (ecount.get(k) || 0) + 1);
      }
      const bp = [];
      for (const [k, c] of ecount) if (c === 1) {
        for (const i of [Math.floor(k / n), k % n]) bp.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      }
      const reps = [...nb.keys()];
      const P0 = pos.slice(), N0 = maskGeo.attributes.normal.array.slice();
      const W = new Float32Array(n), cur = new Float32Array(n * 3);
      for (const r of reps) {
        const x = pos[r * 3], y = pos[r * 3 + 1], z = pos[r * 3 + 2];
        const face = sstep(1.535, 1.575, y) * (1 - sstep(1.76, 1.80, y)) * sstep(0.01, -0.05, z);
        if (face <= 0) continue;
        let d2 = 1;
        for (let j = 0; j < bp.length; j += 3) {
          const dx = bp[j] - x, dy = bp[j + 1] - y, dz = bp[j + 2] - z, d = dx * dx + dy * dy + dz * dz;
          if (d < d2) d2 = d;
        }
        W[r] = face * sstep(0.004, 0.018, Math.sqrt(d2));
      }
      const act = reps.filter((r) => W[r] > 0);
      for (let it = 0; it < 32; it++) {
        for (const r of act) {
          let sx = 0, sy = 0, sz = 0;
          const S = nb.get(r);
          for (const q of S) { sx += pos[q * 3]; sy += pos[q * 3 + 1]; sz += pos[q * 3 + 2]; }
          const k = 1 / S.size;
          cur[r * 3] = sx * k; cur[r * 3 + 1] = sy * k; cur[r * 3 + 2] = sz * k;
        }
        for (const r of act) {
          const nx = N0[r * 3], ny = N0[r * 3 + 1], nz = N0[r * 3 + 2];
          /* подъём смещённой точки по нормали, не больше 14 мм */
          const lift = (cur[r * 3] - P0[r * 3]) * nx + (cur[r * 3 + 1] - P0[r * 3 + 1]) * ny + (cur[r * 3 + 2] - P0[r * 3 + 2]) * nz;
          const now = (pos[r * 3] - P0[r * 3]) * nx + (pos[r * 3 + 1] - P0[r * 3 + 1]) * ny + (pos[r * 3 + 2] - P0[r * 3 + 2]) * nz;
          const h = Math.min(0.014, Math.max(0, now + (lift - now) * 0.6 * W[r]));
          pos[r * 3] = P0[r * 3] + nx * h; pos[r * 3 + 1] = P0[r * 3 + 1] + ny * h; pos[r * 3 + 2] = P0[r * 3 + 2] + nz * h;
        }
      }
      for (let i = 0; i < n; i++) if (rep[i] !== i) {
        pos[i * 3] = pos[rep[i] * 3]; pos[i * 3 + 1] = pos[rep[i] * 3 + 1]; pos[i * 3 + 2] = pos[rep[i] * 3 + 2];
      }
      maskGeo.attributes.position.needsUpdate = true;
      maskGeo.computeVertexNormals();
    }
    /* собственная развёртка: у пакета UV на лице вырождены (карта нормалей
       давала NaN → чёрное пятно). Цилиндр вокруг головы, в метрах ×5. */
    {
      const uv = new Float32Array(n * 2);
      for (let v = 0; v < n; v++) {
        const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        const th = Math.atan2(x, -(z + 0.045));
        uv[v * 2] = th * 0.105 * 5;
        uv[v * 2 + 1] = y * 5;
      }
      maskGeo.setAttribute('uv', new maskGeo.attributes.position.constructor(uv, 2));
    }
    const loops = boundaryLoops(pos, idx);
    const acc = new Acc();
    acc.wf = (p) => wMask(p);
    const N = maskGeo.attributes.normal;
    for (const L of loops) {
      let c = [0, 0, 0];
      for (const i of L) c = add(c, [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
      c = mul(c, 1 / L.length);
      /* только вырез лица: впереди и на уровне глаз */
      if (!(c[2] < -0.06 && c[1] > 1.64 && c[1] < 1.8)) continue;
      const pts = [];
      for (let k = 0; k <= L.length; k++) {
        const i = L[k % L.length];
        const P = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
        const q = [N.getX(i), N.getY(i), N.getZ(i)];
        const inward = nrm(sub(c, P));
        pts.push(add(P, add(mul(q, 0.0011), mul(inward, -0.0016))));
      }
      /* сглаживание кромки */
      for (let it = 0; it < 3; it++) {
        const cp = pts.map((p) => p.slice());
        for (let k = 1; k < pts.length - 1; k++) pts[k] = mul(add(add(cp[k - 1], cp[k + 1]), mul(cp[k], 2)), 0.25);
        pts[pts.length - 1] = pts[0];
      }
      tube(acc, pts, 0.0034, 8, null, { caps: false, flat: 0.70, up: (i) => { const j = L[i % L.length]; return [N.getX(j), N.getY(j), N.getZ(j)]; } });
    }
    return acc;
  }

  /* ======================================================= ГАРНИТУРА v25 */
  /* Активные наушники класса Peltor ComTac: чашка-эллипс 8,8 × 7,2 см над
     ушной раковиной, амбушюра повторяет висок (лучи по коже), жёсткая
     чашка — плоскость, подобранная по виску (МНК), с куполом 2,6 см;
     адаптер к рельсу шлема, микрофон на гибкой штанге у угла рта, спуск
     кабеля к тангенте на левой лямке. Старые «диски» пакета убираются. */
  const CUP = { cy: 1.711, cz: -0.037, AY: 0.044, AZ: 0.036, RIN: 0.66, CUSH: 0.0125, DOME: 0.026 };
  function cupFrame(skinTS, s) {
    const { cy, cz, AY, AZ } = CUP;
    const NA = 48, smp = [];
    for (let i = 0; i < NA; i++) {
      const th = i / NA * TAU;
      const y = cy + Math.cos(th) * AY, z = cz + Math.sin(th) * AZ;
      const t = skinTS.cast([0, y, z], [s, 0, 0], 'far');
      smp.push({ th, y, z, f: t === null ? NaN : t });
    }
    const ok = smp.filter((q) => isFinite(q.f));
    const mean = ok.reduce((a, q) => a + q.f, 0) / Math.max(1, ok.length);
    for (const q of smp) if (!isFinite(q.f)) q.f = mean;
    /* МНК-плоскость f = a + b·dy + c·dz */
    let Syy = 0, Szz = 0, Syz = 0, Sy = 0, Sz = 0, Sf = 0, Syf = 0, Szf = 0;
    const n = smp.length;
    for (const q of smp) { const dy = q.y - cy, dz = q.z - cz; Sy += dy; Sz += dz; Sf += q.f; Syy += dy * dy; Szz += dz * dz; Syz += dy * dz; Syf += dy * q.f; Szf += dz * q.f; }
    const my = Sy / n, mz = Sz / n, mf = Sf / n;
    const cyy = Syy / n - my * my, czz = Szz / n - mz * mz, cyz = Syz / n - my * mz, cyf = Syf / n - my * mf, czf = Szf / n - mz * mf;
    const det = cyy * czz - cyz * cyz || 1e-9;
    const b = (cyf * czz - czf * cyz) / det, c = (czf * cyy - cyf * cyz) / det;
    const a = mf - b * my - c * mz;
    let o = 0;
    for (const q of smp) o = Math.max(o, q.f - (a + b * (q.y - cy) + c * (q.z - cz)));
    const plane = (y, z) => a + o + b * (y - cy) + c * (z - cz);           // |x| поверхности виска под чашкой
    const faceAt = (th) => {
      const f = ((th % TAU) + TAU) % TAU / TAU * NA, i = Math.floor(f) % NA, k = f - Math.floor(f);
      return lerp(smp[i].f, smp[(i + 1) % NA].f, k);
    };
    return { s, plane, faceAt, b, c, shellBase: (y, z) => plane(y, z) + CUP.CUSH };
  }
  function buildHeadset(env) {
    const { skinTS, sideTS, BI } = env;
    const hard = new Acc(), rub = new Acc();
    const HW = [[BI.head, 1]];
    hard.wf = rub.wf = () => HW;
    const { cy, cz, AY, AZ, RIN, CUSH, DOME } = CUP;
    const cups = {};
    const P3 = (s, X, y, z) => [s * X, y, z];
    for (const s of [1, -1]) {
      const F = cupFrame(skinTS, s);
      cups[s] = F;
      /* --- амбушюра: кольцо со скруглённым сечением; изнанка вжата в кожу на 1,5 мм --- */
      const prof = [];
      const RR = 0.0055;
      for (let k = 0; k <= 6; k++) { const a = Math.PI + k / 6 * Math.PI / 2; prof.push([RIN + 0.02 + Math.cos(a) * 0.02, 0.0045 + Math.sin(a) * 0.006]); }
      for (let k = 0; k <= 6; k++) { const a = Math.PI / 2 + k / 6 * Math.PI / 2; prof.push([RIN + 0.03 + Math.cos(a) * 0.03, CUSH - RR + Math.sin(a) * RR]); }
      for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI / 2; prof.push([1.0 - 0.03 + Math.cos(a) * 0.03, CUSH - RR + Math.sin(a) * RR]); }
      for (let k = 0; k <= 6; k++) { const a = -k / 6 * Math.PI / 2; prof.push([1.0 - 0.02 + Math.cos(a) * 0.02, 0.0045 + Math.sin(a) * 0.006]); }
      const NT = 48;
      grid(rub, (u, v) => {
        const th = u * TAU;
        const i = Math.round(v * (prof.length - 1));
        const [rho, hgt] = prof[Math.min(prof.length - 1, i)];
        const y = cy + Math.cos(th) * AY * rho, z = cz + Math.sin(th) * AZ * rho;
        /* изнанка — по коже, лицевая сторона — по плоскости чашки */
        const skin = F.faceAt(th) - 0.0015, top = F.shellBase(y, z);
        const k = clamp(hgt / CUSH, 0, 1);
        const X = lerp(skin, top + 0.0012, k * k * (3 - 2 * k));
        return P3(s, X, y, z);
      }, NT, prof.length - 1, null, { wrapU: true, out: (P) => [s * 0.3, P[1] - cy, P[2] - cz] });
      /* --- чашка: купол над плоскостью, кромка-губа и рёбрышко --- */
      const NR = 12;
      const shellRows = [];
      for (let j = 0; j <= NR; j++) {
        const t = j / NR;
        const rho = 1.035 * (1 - t * t * 0.0) * (1 - t) + 0.0;
        shellRows.push(rho);
      }
      grid(hard, (u, v) => {
        const th = u * TAU;
        const rho = 1.035 * (1 - v);
        const y = cy + Math.cos(th) * AY * rho, z = cz + Math.sin(th) * AZ * rho;
        const h = DOME * Math.sqrt(Math.max(0, 1 - Math.pow(Math.min(1, rho / 1.035), 3.2)));
        /* ребро по контуру лицевой панели */
        const rib = 0.0012 * Math.exp(-(((rho - 0.78) / 0.025) ** 2));
        return P3(s, F.shellBase(y, z) + h + rib, y, z);
      }, NT, 18, null, { out: (P) => [s, 0, 0] });
      /* губа кромки (закрывает стык с амбушюрой) */
      {
        const pts = [];
        for (let k = 0; k <= NT; k++) { const th = k / NT * TAU; const y = cy + Math.cos(th) * AY * 1.035, z = cz + Math.sin(th) * AZ * 1.035; pts.push(P3(s, F.shellBase(y, z) + 0.0016, y, z)); }
        tube(hard, pts, 0.0022, 6, null, { caps: false });
      }
      /* выпуклая лицевая панель с логотипом-выступом */
      {
        const pts = [];
        for (let k = 0; k <= 32; k++) {
          const th = k / 32 * TAU, rho = 0.5;
          const y = cy + 0.004 + Math.cos(th) * AY * rho, z = cz + Math.sin(th) * AZ * rho * 0.9;
          const h = DOME * Math.sqrt(Math.max(0, 1 - Math.pow(rho / 1.035, 3.2)));
          pts.push(P3(s, F.shellBase(y, z) + h + 0.0012, y, z));
        }
        tube(hard, pts, 0.0016, 5, null, { caps: false });
      }
      /* внешний микрофон спереди и кнопки громкости снизу (правая) / крышка батареи (левая) */
      {
        const y = cy - AY * 0.25, z = cz - AZ * 0.86;
        const base = P3(s, F.shellBase(y, z) + DOME * 0.62, y, z);
        tube(hard, [base, add(base, [s * 0.004, 0, -0.006]), add(base, [s * 0.006, 0, -0.0085])], (i) => [0.0062, 0.0058, 0.0048][i], 10, null);
      }
      for (const dz of s > 0 ? [-0.012, 0.012] : [0]) {
        const y = cy - AY * 0.93, z = cz + dz;
        const b0 = P3(s, F.shellBase(y, z) + DOME * 0.32, y, z);
        if (s > 0) tube(hard, [b0, add(b0, [0, -0.0055, 0])], 0.0042, 8, null);
        else tube(hard, [add(b0, [0, 0.001, -0.016]), add(b0, [0, -0.004, -0.016]), add(b0, [0, -0.004, 0.016]), add(b0, [0, 0.001, 0.016])], 0.0045, 6, null, { flat: 0.4 });
      }
      /* адаптер к рельсу шлема: шарнир на верху чашки и пластина вверх */
      {
        const y = cy + AY * 0.92, z = cz;
        const pv = P3(s, F.shellBase(y, z) + DOME * 0.42, y, z);
        tube(hard, [add(pv, [0, 0, -0.011]), add(pv, [0, 0, 0.011])], 0.0052, 10, null);
        const up = [s * 0.103, 1.779, cz];
        tube(hard, [pv, add(mul(add(pv, up), 0.5), [s * 0.004, 0, 0]), up], 0.0058, 6, null, { flat: 0.55, up: [s, 0, 0] });
        tube(hard, [add(up, [0, 0, -0.012]), add(up, [0, 0, 0.012])], 0.0046, 6, null, { flat: 0.3 });
      }
    }
    /* --- микрофон на гибкой штанге (левая чашка) --- */
    {
      const s = -1, F = cups[s];
      const skinX = (y, z, d) => { const t = sideTS.cast([0, y, z], [s, 0, 0], 'far'); return (t === null ? 0.06 : t) + d; };
      const y0 = cy - AY * 0.55, z0 = cz - AZ * 0.72;
      const p0 = P3(s, F.shellBase(y0, z0) + DOME * 0.35, y0, z0);
      const pts = [p0];
      const ctrl = [[1.676, -0.088, 0.017], [1.656, -0.118, 0.015], [1.643, -0.142, 0.013], [1.637, -0.158, 0.012]];
      for (const [y, z, d] of ctrl) pts.push(P3(s, skinX(y, z, d), y, z));
      /* сглаживание ломаной: промежуточные точки */
      const sm = [];
      for (let i = 0; i + 1 < pts.length; i++) for (let k = 0; k < 4; k++) sm.push(add(mul(pts[i], 1 - k / 4), mul(pts[i + 1], k / 4)));
      sm.push(pts[pts.length - 1]);
      tube(rub, sm, 0.0021, 6, null);
      const tip = pts[pts.length - 1], dir = nrm(sub(tip, pts[pts.length - 2]));
      const cap = [madd(tip, dir, -0.004), madd(tip, dir, 0.004), madd(tip, dir, 0.012), madd(tip, dir, 0.019)];
      tube(rub, cap, (i) => [0.005, 0.0085, 0.0088, 0.0062][i], 10, null);
    }
    return { hard, rub, cups };
  }
  /* Проекция на поверхность головы: k ближайших вершин внешнего слоя
     (балаклава или кожа; только крупные компоненты — без рта и глаз),
     плоскость по усреднённой нормали. */
  function surfProj(geo) {
    const P = geo.attributes.position.array, N = geo.attributes.normal, n = geo.attributes.position.count, I = geo.index.array;
    const par = new Int32Array(n);
    for (let i = 0; i < n; i++) par[i] = i;
    const f = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    for (let i = 0; i < I.length; i += 3) { const a = f(I[i]); par[f(I[i + 1])] = a; par[f(I[i + 2])] = a; }
    const cnt = new Map(), xr = new Map();
    for (let v = 0; v < n; v++) {
      const r = f(v); cnt.set(r, (cnt.get(r) || 0) + 1);
      const e = xr.get(r) || [1e9, -1e9]; e[0] = Math.min(e[0], P[v * 3]); e[1] = Math.max(e[1], P[v * 3]); xr.set(r, e);
    }
    const C = 0.012, grid = new Map(), K = (i, j, k) => (i + 512) * 1048576 + (j + 512) * 1024 + (k + 512);
    for (let v = 0; v < n; v++) {
      const r = f(v), e = xr.get(r);
      if (cnt.get(r) < 800 || e[1] - e[0] < 0.1 || P[v * 3 + 1] < 1.5) continue;
      const k = K(Math.floor(P[v * 3] / C), Math.floor(P[v * 3 + 1] / C), Math.floor(P[v * 3 + 2] / C));
      let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(v);
    }
    return (p, off) => {
      const i0 = Math.floor(p[0] / C), j0 = Math.floor(p[1] / C), k0 = Math.floor(p[2] / C);
      const best = [];
      for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (let k = k0 - 1; k <= k0 + 1; k++) {
        const a = grid.get(K(i, j, k)); if (!a) continue;
        for (const v of a) {
          const d = (P[v * 3] - p[0]) ** 2 + (P[v * 3 + 1] - p[1]) ** 2 + (P[v * 3 + 2] - p[2]) ** 2;
          if (best.length < 6 || d < best[best.length - 1][0]) { best.push([d, v]); best.sort((x, y) => x[0] - y[0]); if (best.length > 6) best.pop(); }
        }
      }
      if (!best.length) return { p: p.slice(), n: [Math.sign(p[0]) || 1, 0, 0] };
      let c = [0, 0, 0], nn = [0, 0, 0], ws = 0;
      for (const [d, v] of best) {
        const w = 1 / (d + 1e-6); ws += w;
        c = madd(c, [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], w);
        nn = madd(nn, [N.getX(v), N.getY(v), N.getZ(v)], w);
      }
      c = mul(c, 1 / ws); nn = nrm(nn);
      const dd = dot(sub(p, c), nn);
      return { p: madd(sub(p, mul(nn, dd)), nn, off), n: nn };
    };
  }
  /* Сглаженный путь по контрольным точкам (Катмулл–Ром), прижатый к коже. */
  function skinPath(proj, ctrl, step, off) {
    const pts = [];
    for (let i = 0; i + 1 < ctrl.length; i++) {
      const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
      const n = Math.max(2, Math.ceil(len(sub(p2, p1)) / step));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        pts.push([0, 1, 2].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
      }
    }
    pts.push(ctrl[ctrl.length - 1].slice());
    let q = pts.map((p) => proj(p, off));
    for (let it = 0; it < 2; it++) {
      const sm = q.map((e, i) => (i === 0 || i === q.length - 1 ? e.p : mul(add(add(q[i - 1].p, q[i + 1].p), mul(e.p, 2)), 0.25)));
      q = sm.map((p) => proj(p, off));
    }
    return q;
  }
  /* Подвесная система шлема: Y-ремни под чашками с пряжкой-регулятором
     и подбородочный ремень с чашкой (старые висячие ремни пакета убраны). */
  function buildChinStraps(env) {
    const proj = surfProj(env.headLayer);
    const gear = new Acc(), hard = new Acc();
    const HW = [[env.BI.head, 1]];
    gear.wf = hard.wf = () => HW;
    const band = (acc, q, w, th) => {
      const r = (i) => (typeof w === 'function' ? w(i, q.length) : w);
      const flat = (i) => 1 - th / (2 * r(i));
      /* постоянная толщина: сплющивание пересчитывается по ширине */
      const P = q.map((e) => e.p), U = q.map((e) => e.n);
      const S = 8, rows = [];
      let prevN = null;
      for (let i = 0; i < P.length; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
        const t = nrm(sub(b, a));
        let nx = nrm(cross(t, U[i]));
        if (!isFinite(nx[0])) nx = prevN || [1, 0, 0];
        prevN = nx;
        const ny = cross(nx, t), rr = r(i), fl = flat(i);
        const row = [];
        for (let k = 0; k < S; k++) {
          const a2 = k / S * TAU;
          row.push(acc.v(add(P[i], add(mul(nx, Math.cos(a2) * rr), mul(ny, Math.sin(a2) * rr * (1 - fl)))), [i * 0.02, k / S], null));
        }
        rows.push(row);
      }
      for (let i = 0; i + 1 < rows.length; i++) for (let k = 0; k < S; k++) { const k1 = (k + 1) % S; acc.quad(rows[i][k], rows[i + 1][k], rows[i + 1][k1], rows[i][k1]); }
    };
    for (const s of [1, -1]) {
      const X = (p) => [s * p[0], p[1], p[2]];
      const J = X([0.070, 1.650, -0.064]);
      const front = [X([0.083, 1.753, -0.106]), X([0.080, 1.726, -0.093]), X([0.077, 1.697, -0.083]), X([0.074, 1.670, -0.073]), J];
      const rear = [X([0.083, 1.738, 0.016]), X([0.081, 1.703, 0.006]), X([0.078, 1.672, -0.010]), X([0.074, 1.656, -0.038]), J];
      band(gear, skinPath(proj, front, 0.005, 0.0024), 0.0085, 0.0028);
      band(gear, skinPath(proj, rear, 0.005, 0.0024), 0.0085, 0.0028);
      /* пряжка-регулятор в месте схода ремней */
      const q = proj(J, 0.0048), t = nrm(sub(X([0.064, 1.632, -0.082]), J));
      tube(hard, [madd(q.p, t, -0.009), madd(q.p, t, 0.009)], 0.0105, 4, null, { flat: 0.62, up: q.n });
    }
    /* подбородочный ремень: от пряжки под челюстью к чашке под подбородком */
    const chin = [];
    for (const s of [-1, 1]) {
      const X = (p) => [s * p[0], p[1], p[2]];
      const side = [X([0.070, 1.650, -0.064]), X([0.064, 1.632, -0.082]), X([0.055, 1.617, -0.099]), X([0.040, 1.607, -0.113]), X([0.021, 1.602, -0.124])];
      chin.push(s < 0 ? side : side.slice().reverse());
    }
    const all = chin[0].concat([[0, 1.600, -0.130]], chin[1]);
    const q = skinPath(proj, all, 0.005, 0.0026);
    band(gear, q, (i, n) => { const u = Math.abs(i / (n - 1) - 0.5) * 2; return lerp(0.017, 0.0085, sstep(0.0, 0.42, u)); }, 0.003);
    return { gear, hard };
  }
  /* Ухо под амбушюрой прижимается к виску: вершины кожи (и балаклавы)
     внутри контура чашки не выходят за изнанку амбушюры / за купол. */
  function earSquash(pos, cups, extra) {
    const ex = extra || 0;
    const { cy, cz, AY, AZ, RIN, CUSH, DOME } = CUP;
    for (let v = 0; v < pos.length; v += 3) {
      const x = pos[v], y = pos[v + 1], z = pos[v + 2];
      const s = x > 0 ? 1 : -1, F = cups[s];
      if (!F || Math.abs(x) < 0.04) continue;
      const ey = (y - cy) / AY, ez = (z - cz) / AZ, r = Math.hypot(ey, ez);
      if (r > 1.03) continue;
      const th = Math.atan2(ez, ey);
      const lim = (r < RIN ? F.shellBase(y, z) + DOME * 0.55 : F.faceAt(th) - 0.0018) - ex;
      if (Math.abs(x) > lim) pos[v] = s * lim;
    }
  }

  /* ============================================== МЕЛОЧИ СНАРЯЖЕНИЯ v25 */
  /* Тангента на левой лямке с кабелями к гарнитуре и рации, жгут CAT на
     камербанде справа, трубка гидратора через правое плечо с клапаном на
     лямке, два гранатных подсумка слева. */
  function buildExtras(env, C) {
    const { BI, sideTS } = env;
    const { vest, dark, hard, straps, wrap, RREF, SW, CW } = C;
    const out = { cable: new Acc() };
    const chestW = [[BI.chest, 1]];
    out.cable.wf = () => chestW;
    /* --- тангента PTT --- */
    const stL = straps[-1];
    const So = offsetSheet(stL, 0.0086);
    pad(hard, So, { x: -0.019, y: stL.L * 0.075, w: 0.038, h: 0.05, R: 0.007, d: 0.017, q: 0.004, bulge: 0.002, W: SW });
    const ptt = So(0, stL.L * 0.075 + 0.025);
    const pf = madd(ptt.p, ptt.n, 0.017);
    tube(hard, [madd(pf, ptt.n, -0.001), madd(pf, ptt.n, 0.0045)], (i) => (i ? 0.0105 : 0.0118), 12, SW);
    pad(dark, So, { x: -0.024, y: stL.L * 0.06, w: 0.048, h: 0.012, R: 0.003, d: 0.0025, q: 0.001, W: SW });
    /* кабель от гарнитуры: низ левой чашки → за челюстью → по шее → по лямке к тангенте */
    const HW = (p) => {
      const kH = sstep(1.6, 1.675, p[1]), kN = (1 - kH) * sstep(1.52, 1.6, p[1]);
      return [[BI.head, kH], [BI.neck, kN], [BI.chest, Math.max(0, 1 - kH - kN)]];
    };
    if (env.cups && env.cups[-1]) {
      const F = env.cups[-1], s = -1;
      const y0 = CUP.cy - CUP.AY * 0.98, z0 = CUP.cz + CUP.AZ * 0.15;
      const c0 = [s * (F.shellBase(y0, z0) + 0.004), y0 - 0.004, z0];
      const surf = (y, z, d) => { const t = sideTS.cast([0, y, z], [s, 0, 0], 'far'); return [s * ((t === null ? 0.07 : t) + d), y, z]; };
      const strapPt = (f, d) => { const q = stL(stL.halfW * 0.25, stL.L * f); return madd(q.p, q.n, 0.0086 + d); };
      const pts = [c0, surf(1.635, -0.022, 0.006), surf(1.598, -0.025, 0.007), surf(1.565, -0.038, 0.007), strapPt(0.36, 0.004), strapPt(0.25, 0.004), strapPt(0.16, 0.004), madd(ptt.p, ptt.n, 0.006)];
      const sm = [];
      for (let i = 0; i + 1 < pts.length; i++) for (let k = 0; k < 3; k++) sm.push(add(mul(pts[i], 1 - k / 3), mul(pts[i + 1], k / 3)));
      sm.push(pts[pts.length - 1]);
      tube(out.cable, sm, 0.0021, 5, HW);
    }
    /* кабель тангента → рация: вниз по краю плиты и по камербанду */
    if (env.radioJack) {
      const q0 = So(0, stL.L * 0.075);
      const a = madd(q0.p, q0.n, 0.006);
      const sh = C.sheetF;
      const zf = (x, y) => sh.zAt(x, y) - 0.034;
      const wp = (th, y, d) => { const q = offsetSheet(wrap, 0.0094 + d)(th * RREF, y); return q.p; };
      const pts = [a, [-0.118, 1.40, zf(-0.118, 1.40)], [-0.132, 1.33, zf(-0.132, 1.33)], wp(-0.86, 1.29, 0.006), wp(-1.15, 1.295, 0.006), add(env.radioJack, [0.0, 0.012, 0])];
      const sm = [];
      for (let i = 0; i + 1 < pts.length; i++) for (let k = 0; k < 3; k++) sm.push(add(mul(pts[i], 1 - k / 3), mul(pts[i + 1], k / 3)));
      sm.push(env.radioJack);
      tube(out.cable, sm, 0.0024, 5, CW);
    }
    /* --- жгут CAT на камербанде справа (вертикально, под резинкой) --- */
    {
      const Co = offsetSheet(wrap, 0.0094);
      const tx = 0.98 * RREF;
      const b0 = Co(tx, 1.165), b1 = Co(tx, 1.282);
      const nn = Co(tx, 1.22).n;
      const P = (t) => madd(add(mul(b0.p, 1 - t), mul(b1.p, t)), nn, 0.0165);
      tube(dark, [P(0), P(0.05), P(0.5), P(0.95), P(1)], (i) => [0.012, 0.0165, 0.0172, 0.0165, 0.012][i], 10, CW, { flat: 0.32, up: nn });
      /* ворот (стержень) поперёк и красный язычок (тёмный) */
      const w0 = P(0.78);
      tube(hard, [madd(w0, cross(nn, [0, 1, 0]), -0.024), madd(w0, cross(nn, [0, 1, 0]), 0.024)].map((p) => madd(p, nn, 0.011)), 0.0042, 6, CW);
      pad(dark, Co, { x: tx - 0.026, y: 1.205, w: 0.052, h: 0.014, R: 0.003, d: 0.022, q: 0.004, W: CW });
    }
    /* --- гранатные подсумки слева от плиты (только штурмовая плитоноска) --- */
    if (C.AT === 'plate') {
      const Co = offsetSheet(wrap, 0.0094);
      for (const [gx, gy] of [[-0.93 * RREF, 1.145]]) {
        pad(vest, Co, { x: gx - 0.031, y: gy, w: 0.062, h: 0.088, R: 0.02, d: 0.05, q: 0.016, bulge: 0.006, W: CW });
        const Lo = offsetSheet(Co, 0.051);
        pad(dark, Lo, { x: gx - 0.03, y: gy + 0.062, w: 0.06, h: 0.03, R: [0.004, 0.004, 0.014, 0.014], d: 0.004, q: 0.0016, W: CW });
        pad(hard, Lo, { x: gx - 0.007, y: gy + 0.05, w: 0.014, h: 0.016, R: 0.003, d: 0.005, q: 0.0016, W: CW });
      }
    }
    /* --- гидратор: чехол с питьевой системой на задней плите, трубка
           выходит из верхнего угла и идёт по правой лямке на грудь --- */
    {
      const bb = C.sheetB;
      const Bo = offsetSheet(bb, 0.028 + 0.0004);
      const HX = 0.094, HY0 = 1.196, HY1 = 1.452;
      pad(vest, Bo, { x: -HX, y: HY0, w: HX * 2, h: HY1 - HY0, R: [0.03, 0.03, 0.022, 0.022], d: 0.03, q: 0.012, bulge: 0.009 });
      const Ho = offsetSheet(Bo, 0.0395);
      /* молния-«клапан» по верху и стропы MOLLE на лицевой стороне */
      pad(dark, Ho, { x: -HX + 0.012, y: HY1 - 0.026, w: HX * 2 - 0.024, h: 0.006, R: 0.002, d: 0.0018, q: 0.0008, back: false });
      for (const yc of [1.25, 1.30, 1.35]) molleRow(vest, offsetSheet(Bo, 0.0385), -0.075, 0.075, yc, null);
      const st = straps[1];
      const pts = [];
      const tp = Bo(0.072, HY1 - 0.004);
      pts.push(madd(tp.p, tp.n, 0.024));
      const t2 = Bo(0.084, HY1 + 0.018);
      pts.push(madd(t2.p, t2.n, 0.016));
      for (const f of [0.95, 0.88, 0.78, 0.66, 0.54, 0.42, 0.31, 0.22, 0.14]) {
        const q = st(-st.halfW * 0.3, st.L * f);
        pts.push(madd(q.p, q.n, 0.0085 + 0.006));
      }
      const sm = [];
      for (let i = 0; i + 1 < pts.length; i++) for (let k = 0; k < 3; k++) sm.push(add(mul(pts[i], 1 - k / 3), mul(pts[i + 1], k / 3)));
      sm.push(pts[pts.length - 1]);
      tube(dark, sm, 0.0056, 8, SW);
      const e = pts[pts.length - 1], d0 = nrm(sub(e, pts[pts.length - 2]));
      /* клапан-«загубник» с колпачком */
      tube(hard, [e, madd(e, d0, 0.012), madd(e, d0, 0.03), madd(e, d0, 0.036)], (i) => [0.0066, 0.007, 0.0064, 0.0044][i], 8, SW);
      /* держатель трубки на лямке */
      pad(dark, offsetSheet(st, 0.0086), { x: -st.halfW * 0.75, y: st.L * 0.3, w: st.halfW * 1.1, h: 0.014, R: 0.003, d: 0.0135, q: 0.004, W: SW });
    }
    return out;
  }

  /* ===================================================== ПОДЖАТИЕ ТКАНИ */
  /* Китель под жёстким снаряжением поджимается к его изнанке: плитоноска,
     лямки и пояс лежат на ткани без щели, ткань не протыкает их при
     движении. Меняется только копия позиций кителя. */
  function tuckShirt(pos, C, B) {
    const n = pos.length / 3;
    const sstep01 = (a, b, x) => sstep(a, b, x);
    for (let v = 0; v < n; v++) {
      let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      if (y < 0.9) continue;
      /* передняя и задняя плиты (v26: без бронежилета — только пояс) */
      if (C && !C.none && y > C.FY0 - 0.02 && y < C.BY1 + 0.02 && Math.abs(x) < C.FX + 0.02) {
        const ex = sstep01(C.FX + 0.016, C.FX - 0.004, Math.abs(x));
        if (z < 0) {
          const ey = sstep01(C.FY0 - 0.016, C.FY0 + 0.004, y) * sstep01(C.FY1 + 0.012, C.FY1 - 0.004, y);
          const lim = C.sheetF.zAt(x, y) + 0.0045;
          const k = ex * ey;
          if (k > 0 && z < lim) z = lerp(z, lim, k);
        } else {
          const ey = sstep01(C.BY0 - 0.016, C.BY0 + 0.004, y) * sstep01(C.BY1 + 0.012, C.BY1 - 0.004, y);
          const lim = C.sheetB.zAt(x, y) - 0.0045;
          const k = ex * ey;
          if (k > 0 && z > lim) z = lerp(z, lim, k);
        }
      }
      /* лямки */
      for (const s of (C && !C.none ? [1, -1] : [])) {
        const st = C.straps[s];
        const dx = Math.abs(x - st.xs);
        if (dx > st.halfW + 0.012 || y < st.yc) continue;
        const a = Math.atan2(y - st.yc, -(z - st.zc));
        if (a < st.a0 - 0.05 || a > st.a1 + 0.05) continue;
        const r = Math.hypot(y - st.yc, z - st.zc), lim = st.rAt(a) - 0.002;
        const k = sstep01(st.halfW + 0.012, st.halfW - 0.002, dx);
        if (r > lim && k > 0) {
          const rr = lerp(r, lim, k);
          y = st.yc + (y - st.yc) * rr / r; z = st.zc + (z - st.zc) * rr / r;
        }
      }
      /* пояс: под ним ткань затянута, выше — напуск, ниже — подол */
      if (B && y < B.Y0 + B.H + 0.06) {
        const cx = 0, zc = -0.012;
        const th = Math.atan2(x - cx, -(z - zc));
        const r = Math.hypot(x - cx, z - zc);
        const yy = clamp(y, B.Y0, B.Y0 + B.H);
        const rin = B.wrap.R(th, yy) + B.gap - 0.0032;
        let lim = rin;
        if (y > B.Y0 + B.H + 0.004) lim = rin + (y - (B.Y0 + B.H + 0.004)) * 0.85;
        else if (y < B.Y0 - 0.004) lim = rin + (B.Y0 - 0.004 - y) * 0.55;
        if (r > lim) { x = cx + (x - cx) * lim / r; z = zc + (z - zc) * lim / r; }
      }
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    }
  }

  /* Фильтр треугольников геометрии пакета (атрибуты общие, новый индекс)
     и слияние с деталями накопителя. */
  function mergeGeo(THREE, base, drop, acc) {
    const P = base.attributes.position.array, I = base.index.array;
    const keep = [];
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      const cx = (P[a] + P[b] + P[c]) / 3, cy = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
      if (drop && drop(cx, cy, cz, I[i], I[i + 1], I[i + 2])) continue;
      keep.push(I[i], I[i + 1], I[i + 2]);
    }
    const nb = base.attributes.position.count;
    const ga = acc && acc.count() ? toGeo(THREE, acc) : null;
    const na = ga ? ga.attributes.position.count : 0;
    const g = new THREE.BufferGeometry();
    const cat = (name, size, Arr) => {
      const A = base.attributes[name], B = ga ? ga.attributes[name] : null;
      const out = new Arr((nb + na) * size);
      if (A) {
        if (A.normalized && name === 'normal') { for (let i = 0; i < nb * size; i++) out[i] = A.array[i] / 32767; }
        else out.set(A.array.subarray(0, nb * size), 0);
      }
      if (B) out.set(B.array, nb * size);
      return out;
    };
    g.setAttribute('position', new THREE.BufferAttribute(cat('position', 3, Float32Array), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(cat('normal', 3, Float32Array), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(cat('uv', 2, Float32Array), 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(cat('skinIndex', 4, Uint16Array), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(cat('skinWeight', 4, Float32Array), 4));
    if (ga) { const J = ga.index.array; for (let i = 0; i < J.length; i++) keep.push(J[i] + nb); }
    g.setIndex(nb + na > 65535 ? new THREE.Uint32BufferAttribute(keep, 1) : new THREE.Uint16BufferAttribute(keep, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.2);
    return g;
  }

  /* ============================================================ ТЕКСТУРЫ */
  function heightCanvas(S, fn) {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const H = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) H[y * S + x] = fn(x / S, y / S);
    return { c, H, S };
  }
  function toNormal(h, k) {
    const { c, H, S } = h, g = c.getContext('2d', { willReadFrequently: true }), img = g.createImageData(S, S), d = img.data;
    const at = (x, y) => H[((y + S) % S) * S + ((x + S) % S)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k;
      const l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  function toGray(h, lo, hi, noise) {
    const { c, H, S } = h, g = c.getContext('2d', { willReadFrequently: true }), img = g.createImageData(S, S), d = img.data;
    for (let i = 0; i < S * S; i++) {
      const v = clamp(lerp(lo, hi, H[i]) + (hash(i * 0.37) - 0.5) * (noise || 0), 0, 1) * 255;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  /* кордура 500D: корзиночное переплетение, 16 нитей на тайл */
  const cordura = () => heightCanvas(128, (u, v) => {
    const N = 16, cu = Math.floor(u * N), cv = Math.floor(v * N), fu = u * N - cu, fv = v * N - cv;
    const over = ((cu >> 1) + (cv >> 1)) % 2 === 0;
    const warp = Math.sin(fu * Math.PI), weft = Math.sin(fv * Math.PI);
    return (over ? 0.55 + 0.45 * warp * (0.8 + 0.2 * weft) : 0.35 + 0.45 * weft * (0.8 + 0.2 * warp)) + 0.06 * (hash(cu * 31 + cv * 7) - 0.5);
  });
  /* вязка 1×1 с резинкой: столбики «V»-петель */
  const knit = () => heightCanvas(256, (u, v) => {
    const C = 12, Rr = 16;
    const col = Math.floor(u * C), fu = u * C - col, fv = (v * Rr) % 1;
    const lobe = (cx, a) => {
      const x = fu - cx, y = fv - 0.5;
      const xr = x * Math.cos(a) - y * Math.sin(a), yr = x * Math.sin(a) + y * Math.cos(a);
      return Math.sqrt(Math.max(0, 1 - (xr / 0.24) ** 2 - (yr / 0.56) ** 2));
    };
    const h = Math.max(lobe(0.28, 0.42), lobe(0.72, -0.42));
    const purl = col % 3 === 2;
    return purl ? h * 0.45 + 0.05 : h * 0.9 + 0.1 * hash(col * 13 + Math.floor(v * Rr));
  });
  /* мелкое зерно (резина, замша) */
  const grain = (S, f, seed) => heightCanvas(S, (u, v) => {
    let s = 0, a = 1, tot = 0;
    for (let o = 0; o < 3; o++) {
      const x = u * f * (1 << o), y = v * f * (1 << o), X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y;
      const P = f * (1 << o);
      const h = (i, j) => hash(((i % P) + P) % P * 57 + (((j % P) + P) % P) * 131 + seed * 7);
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      s += a * lerp(lerp(h(X, Y), h(X + 1, Y), sx), lerp(h(X, Y + 1), h(X + 1, Y + 1), sx), sy); tot += a; a *= 0.5;
    }
    return s / tot;
  });

  const texCache = new Map();
  function tex(THREE, key, make, rep, srgb) {
    let base = texCache.get(key);
    if (!base) { base = make(); texCache.set(key, base); }
    const t = new THREE.CanvasTexture(base);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.repeat.set(rep, rep);
    if (srgb && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }

  /* ========================================================== МАТЕРИАЛЫ */
  function materials(THREE, P, srgb, base, helpers) {
    const out = {};
    const Std = THREE.MeshStandardMaterial, Phys = THREE.MeshPhysicalMaterial || Std;
    const cordN = () => tex(THREE, 'cordN', () => toNormal(cordura(), 2.2), 1 / 0.011);
    const cordA = () => tex(THREE, 'cordA', () => toGray(grain(128, 6, 3), 0.84, 1.0, 0.05), 1 / 0.18, true);
    const nyl = (col, rough, k) => new Std({
      color: srgb(THREE, col.map((c) => c * (k || 1))), map: cordA(), normalMap: cordN(),
      normalScale: new THREE.Vector2(0.85, 0.85), roughness: rough, metalness: 0, envMapIntensity: 0.55
    });
    out.vest = nyl(P.gearCol, 0.86, 1);
    out.vestDark = nyl(P.gearCol, 0.96, 0.74);
    out.vestHard = new Std({ color: srgb(THREE, P.hardCol), roughness: 0.52, metalness: 0.02, envMapIntensity: 0.7,
      normalMap: tex(THREE, 'hardN', () => toNormal(grain(128, 24, 5), 0.6), 1 / 0.02), normalScale: new THREE.Vector2(0.4, 0.4) });
    /* магазины АК-74: сливовый полиамид */
    out.vestMag = new Std({ color: srgb(THREE, P.faction === 'alpha' ? [34, 33, 32] : [92, 50, 38]), roughness: 0.46, metalness: 0,
      envMapIntensity: 0.8, normalMap: tex(THREE, 'magN', () => toNormal(grain(128, 30, 9), 0.5), 1 / 0.03),
      normalScale: new THREE.Vector2(0.35, 0.35) });
    /* ботинки: замша + кордура, резина подошвы, шнурки, металл крючков */
    out.boot = new Std({ color: srgb(THREE, P.bootCol), map: tex(THREE, 'suedeA', () => toGray(grain(256, 10, 11), 0.78, 1.0, 0.08), 1 / 0.09, true),
      normalMap: tex(THREE, 'suedeN', () => toNormal(grain(256, 40, 13), 1.4), 1 / 0.03), normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.84, metalness: 0, envMapIntensity: 0.55 });
    /* v25: ботинок из панелей — резиновые носок и задник (темнее, глаже),
       замша низа, кордура верха, мягкий кант, строчка по швам и пыль у
       подошвы; координаты — поза покоя (vRestPos), без лишних текстур */
    out.boot.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRestPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRestPos = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRestPos;\nfloat bootCap;')
        .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 p = vRestPos;
          float zb = -0.128 - 1.15 * max(p.y - 0.028, 0.0);
          float toe = (1.0 - smoothstep(-0.004, 0.004, p.z - zb)) * (1.0 - smoothstep(0.072, 0.079, p.y));
          float zh = 0.046 + 0.25 * max(p.y - 0.03, 0.0);
          float heel = smoothstep(-0.004, 0.004, p.z - zh) * (1.0 - smoothstep(0.108, 0.115, p.y));
          float rand = 1.0 - smoothstep(0.031, 0.036, p.y);
          bootCap = max(max(toe, heel), rand);
          float upper = smoothstep(0.094, 0.099, p.y) * (1.0 - bootCap);
          float collar = smoothstep(0.199, 0.205, p.y);
          float dash = step(0.45, fract((p.z + p.x) * 330.0));
          float st = exp(-pow((p.y - 0.1015) / 0.0008, 2.0)) * dash * (1.0 - bootCap);
          st += exp(-pow((p.z - zb + 0.0045) / 0.0008, 2.0)) * (1.0 - smoothstep(0.072, 0.079, p.y)) * step(0.45, fract(p.y * 330.0 + p.x * 330.0));
          st += exp(-pow((p.z - zh - 0.0045) / 0.0008, 2.0)) * (1.0 - smoothstep(0.108, 0.115, p.y)) * step(0.45, fract(p.y * 330.0 + p.x * 330.0));
          st += exp(-pow((p.y - 0.196) / 0.0008, 2.0)) * dash;
          diffuseColor.rgb *= mix(1.0, 0.58, bootCap);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.86, 0.88, 0.84), upper);
          diffuseColor.rgb *= mix(1.0, 0.72, collar);
          diffuseColor.rgb *= 1.0 - 0.38 * clamp(st, 0.0, 1.0);
          float dust = (1.0 - smoothstep(0.022, 0.06, p.y)) * (1.0 - bootCap * 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.26, 0.2), dust * 0.3);
        }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.64, bootCap);`);
    };
    out.boot.customProgramCacheKey = () => 'kitBoot';
    out.bootSole = new Std({ color: srgb(THREE, [30, 29, 28]), roughness: 0.72, metalness: 0, envMapIntensity: 0.6,
      normalMap: tex(THREE, 'rubN', () => toNormal(grain(128, 28, 17), 0.8), 1 / 0.015), normalScale: new THREE.Vector2(0.45, 0.45) });
    out.bootLace = new Std({ color: srgb(THREE, P.bootCol.map((c) => c * 0.72)), roughness: 0.92, metalness: 0,
      normalMap: cordN(), normalScale: new THREE.Vector2(1, 1) });
    out.bootHard = new Std({ color: srgb(THREE, [52, 52, 54]), roughness: 0.4, metalness: 0.75, envMapIntensity: 0.9 });
    out.hatHard = out.bootHard;
    /* v25: кабели гарнитуры и тангенты — чёрная резина */
    out.cable = new Std({ color: srgb(THREE, [20, 20, 21]), roughness: 0.5, metalness: 0, envMapIntensity: 0.6 });
    /* напуск брюк — та же ткань, что брюки (камуфляж по позе покоя) */
    if (helpers && helpers.garment) out.cuff = helpers.garment(helpers.camoBottom || helpers.camo, { tile: P.camoTile, seams: 0, stripes: helpers.bareCuff ? null : helpers.stripesBottom || null, bare: helpers.bareCuff || null });
    /* балаклава: трикотаж, ворс (sheen), шов по темени */
    if (P.mask) {
      const col = P.maskCol;
      const kA = tex(THREE, 'knitA_' + col.join('_'), () => {
        const h = knit();
        const c = toGray(h, 0.74, 1.0, 0.1);
        const g = c.getContext('2d', { willReadFrequently: true });
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = 'rgb(' + col.join(',') + ')';
        g.fillRect(0, 0, c.width, c.height);
        return c;
      }, 20, true);
      const kN = tex(THREE, 'knitN', () => toNormal(knit(), 1.7), 20);
      const m = new Phys({ map: kA, normalMap: kN, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.98, metalness: 0,
        side: THREE.DoubleSide, envMapIntensity: 0.45 });
      if (m.isMeshPhysicalMaterial) { m.sheen = 0.7; m.sheenRoughness = 0.55; m.sheenColor = srgb(THREE, col.map((c) => Math.min(255, c * 1.9 + 20))); m.specularIntensity = 0.3; }
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRestPos;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRestPos = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec3 vRestPos;
          float maskSeamH(vec3 p) {
            float act = smoothstep(1.60, 1.645, p.y) * smoothstep(-0.105, -0.08, p.z);
            float d = abs(p.x);
            float st = step(0.5, fract((p.y + p.z) * 260.0));
            return act * (-0.0011 * exp(-d * d / 0.0000035) + 0.00022 * st * exp(-pow((d - 0.0032) / 0.0007, 2.0)) + 0.00022 * st * exp(-pow((d + 0.0032) / 0.0007, 2.0)));
          }`)
          .replace('#include <map_fragment>', `#include <map_fragment>
          {
            float act = smoothstep(1.60, 1.645, vRestPos.y) * smoothstep(-0.105, -0.08, vRestPos.z);
            diffuseColor.rgb *= 1.0 - 0.35 * act * exp(-vRestPos.x * vRestPos.x / 0.000004);
          }`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            vec3 sp = -vViewPosition;
            float h = maskSeamH(vRestPos);
            vec3 sx = dFdx(sp), sy = dFdy(sp);
            vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
            float det = dot(sx, r1) * faceDirection;
            vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
            normal = normalize(abs(det) * normal - grad);
          }`);
      };
      m.customProgramCacheKey = () => 'kitMask';
      out.mask = m;
      out.maskHem = m;
    }
    return out;
  }

  /* ============================================================= СБОРКА */
  const geoCache = new Map();
  function attrs(g) {
    return {
      pos: g.attributes.position.array, index: g.index.array,
      si: g.attributes.skinIndex.array, sw: g.attributes.skinWeight.array
    };
  }
  /* Компоненты связности меша: флаг «убрать» для вершин компонент, чей
     габарит удовлетворяет условию (старые чашки наушников, штанга). */
  function compDrop(geo, pred) {
    const P = geo.attributes.position.array, I = geo.index.array, n = geo.attributes.position.count;
    const par = new Int32Array(n);
    for (let i = 0; i < n; i++) par[i] = i;
    const f = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    for (let i = 0; i < I.length; i += 3) { const a = f(I[i]); par[f(I[i + 1])] = a; par[f(I[i + 2])] = a; }
    const box = new Map();
    for (let v = 0; v < n; v++) {
      const r = f(v);
      let b = box.get(r);
      if (!b) box.set(r, b = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9], n: 0 });
      b.n++;
      for (let k = 0; k < 3; k++) { b.mn[k] = Math.min(b.mn[k], P[v * 3 + k]); b.mx[k] = Math.max(b.mx[k], P[v * 3 + k]); }
    }
    const flag = new Uint8Array(n);
    for (let v = 0; v < n; v++) if (pred(box.get(f(v)))) flag[v] = 1;
    return (cx, cy, cz, a) => flag[a] === 1;
  }
  function apply(THREE, geos, pack, P, BI) {
    if (!geos.shirt || !geos.pants) return geos;
    const key = [P.head, P.mask, !!P.kneePads, P.armor || 'plate'].join('|');
    let res = geoCache.get(key);
    if (!res) {
      const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
      const J = pack.hdr.joints;
      const shirt = attrs(geos.shirt);
      /* v25: копия кителя — ткань поджимается под плиты, лямки и пояс */
      const shirtGeo = geos.shirt.clone();
      /* брюки: низ штанины убирается под напуск (своя копия геометрии) */
      const pantsGeo = geos.pants.clone();
      {
        const p = pantsGeo.attributes.position.array;
        for (let v = 0; v < p.length / 3; v++) {
          const y = p[v * 3 + 1];
          if (y > 0.314) continue;
          const cx = Math.sign(p[v * 3]) * 0.112, cz = 0.013;
          /* v25: в голенище (ниже 0,2 м) штанина сжата сильнее — не проступает сквозь ботинок */
          const k = lerp(1, 0.8, sstep(0.314, 0.296, y)) * lerp(1, 0.72, sstep(0.215, 0.18, y));
          p[v * 3] = cx + (p[v * 3] - cx) * k;
          p[v * 3 + 2] = cz + (p[v * 3 + 2] - cz) * k;
        }
        pantsGeo.attributes.position.needsUpdate = true;
      }
      const pants = attrs(geos.pants);
      const shirtTS = TriSet([{ pos: shirt.pos, index: shirt.index, keep: (x, y) => Math.abs(x) < 0.235 && y > 1.0 && y < 1.64 }], 1, 0.01);
      const shirtTSx = TriSet([{ pos: shirt.pos, index: shirt.index, keep: (x, y) => Math.abs(x) < 0.2 && y > 1.22 }], 0, 0.006);
      const pantsTS = {
        R: TriSet([{ pos: pants.pos, index: pants.index, keep: (x, y) => x > 0.01 && y < 0.8 }], 1, 0.01),
        L: TriSet([{ pos: pants.pos, index: pants.index, keep: (x, y) => x < -0.01 && y < 0.8 }], 1, 0.01)
      };
      /* v25: пояс — по брюкам (подол кителя под ним поджимается) */
      const beltTS = TriSet([{ pos: pants.pos, index: pants.index, keep: (x, y) => y > 0.9 && y < 1.1 }], 1, 0.01);
      const wShirt = WeightField([{ pos: shirt.pos, si: shirt.si, sw: shirt.sw, keep: (x) => Math.abs(x) < 0.26 }]);
      const wPants = WeightField([{ pos: pants.pos, si: pants.si, sw: pants.sw }]);
      const env = { shirtTS, shirtTSx, pantsTS, beltTS, wShirt, wPants, BI, J, armor: P.armor || 'plate' };
      const patchAcc = new Acc(); patchAcc.wf = () => [[BI.chest, 1]];
      env.patchAcc = patchAcc;
      const C = buildCarrier(env);
      env.darkAcc = C.dark;
      const Bt = buildBelt(env);
      C.vest.append(Bt.belt); C.hard.append(Bt.hard);
      const boots = buildBoots(env);
      const cuffs = buildCuffs(env);
      /* голова: балаклава (внешний слой) и кожа */
      let maskGeo = null, hemAcc = null;
      if (P.mask && geos.mask) {
        maskGeo = geos.mask.clone();
        const m = attrs(maskGeo);
        const wMask = WeightField([{ pos: m.pos, si: m.si, sw: m.sw }], 0.01);
        hemAcc = buildMask({ maskGeo, wMask });
      }
      const layers = [];
      if (maskGeo) layers.push(maskGeo);
      if (geos.skin) layers.push(geos.skin);
      const layerSrc = (keep) => layers.map((g) => ({ pos: g.attributes.position.array, index: g.index.array, keep }));
      env.sideTS = TriSet(layerSrc((x, y) => y > 1.45).concat([{ pos: shirt.pos, index: shirt.index, keep: (x, y) => y > 1.45 && Math.abs(x) < 0.2 }]), 1, 0.005);
      /* v25: гарнитура на шлеме (активные наушники, микрофон) */
      let HS = null;
      if (P.head === 'helmet' && geos.skin && geos.headHard && geos.headRubber) {
        env.skinTS = TriSet(layerSrc((x, y) => Math.abs(x) > 0.03 && y > 1.58), 1, 0.004);
        HS = buildHeadset(env);
        env.cups = HS.cups;
      }
      /* v25: тангента и кабели, жгут, гранатный подсумок, трубка гидратора */
      const X = (C.AT === 'plate' || C.AT === 'slick') ? buildExtras(env, C) : { cable: new Acc() };
      tuckShirt(shirtGeo.attributes.position.array, C, Bt);
      shirtGeo.attributes.position.needsUpdate = true;
      const out = {
        vest: C.vest, vestDark: C.dark, vestHard: C.hard, vestMag: C.mag, patch: patchAcc,
        boot: boots.upper, bootSole: boots.sole, bootLace: boots.lace, bootHard: boots.hard, cuff: cuffs,
        cable: X.cable
      };
      if (P.kneePads) { const K = buildKneePads(env); out.kneePad = K.cap; out.vestDark.append(K.base); }
      res = {};
      for (const k in out) if (out[k].count()) res[k] = toGeo(THREE, out[k]);
      res.pants = pantsGeo;
      res.shirt = shirtGeo;
      if (maskGeo) { res.mask = maskGeo; res.maskHem = toGeo(THREE, hemAcc); }
      if (HS) {
        /* ухо под амбушюрой прижато; старые «диски» и штанга пакета убраны */
        const skinGeo = geos.skin.clone();
        earSquash(skinGeo.attributes.position.array, HS.cups, maskGeo ? 0.0025 : 0);
        skinGeo.attributes.position.needsUpdate = true;
        res.skin = skinGeo;
        if (maskGeo) { earSquash(maskGeo.attributes.position.array, HS.cups, 0); maskGeo.attributes.position.needsUpdate = true; }
        /* новые ремни подвесной системы по прижатой коже/балаклаве */
        if (geos.headGear) {
          const CS = buildChinStraps({ headLayer: maskGeo || skinGeo, BI });
          HS.hard.append(CS.hard);
          res.headGear = mergeGeo(THREE, geos.headGear, compDrop(geos.headGear, (b) => b.mn[1] < 1.6), CS.gear);
        }
        const side = (b) => b.mn[0] > 0.09 || b.mx[0] < -0.09;
        res.headHard = mergeGeo(THREE, geos.headHard,
          compDrop(geos.headHard, (b) => (b.mn[0] > 0.105 || b.mx[0] < -0.105) && b.mx[1] < 1.765 && b.mn[2] > -0.075 && b.mx[2] < 0.012), HS.hard);
        res.headRubber = mergeGeo(THREE, geos.headRubber,
          compDrop(geos.headRubber, (b) => (side(b) && b.mn[1] < 1.805 && b.mn[2] > -0.07 && b.mx[2] < 0.012) ||
            (b.mx[1] < 1.73 && b.mn[2] < -0.05 && b.mx[0] < 0)), HS.rub);
      }
      /* панама */
      const headSrc = layers.map((g) => ({ pos: g.attributes.position.array, index: g.index.array }));
      if (P.head === 'boonie' && headSrc.length) {
        let top = 0;
        for (const s of headSrc) for (let i = 1; i < s.pos.length; i += 3) top = Math.max(top, s.pos[i]);
        const headTS = TriSet(headSrc.map((s) => ({ pos: s.pos, index: s.index, keep: (x, y, z) => y > 1.7 })), 1, 0.004);
        const H = buildBoonie({ headTS, BI, headTop: top });
        res.hat = toGeo(THREE, H.hat);
        res.hatHard = toGeo(THREE, H.hard);
      }
      let nv = 0;
      for (const k in out) nv += out[k].count();
      if (HS) nv += HS.hard.count() + HS.rub.count();
      res._stats = { verts: nv, ms: (typeof performance !== 'undefined' ? performance.now() : 0) - t0 };
      geoCache.set(key, res);
      if (typeof console !== 'undefined') console.info('kit', key, JSON.stringify(res._stats));
    }
    for (const k in res) if (k[0] !== '_') geos[k] = res[k];
    return geos;
  }

  return { apply, materials, bootSlice, BOOT };
});
