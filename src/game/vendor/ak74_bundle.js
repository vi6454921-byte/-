const __ATTACH = (function () {
  const __M = {};
  const __C = {};
  function __def(n, f) { __M[n] = f; }
  function __req(n) {
    if (__C[n]) return __C[n].exports;
    const m = { exports: {} };
    __C[n] = m;
    __M[n](m, m.exports);
    return m.exports;
  }

__def("kernel", function (module, exports) {
/* Геометрическое ядро: треугольный суп {p:[],n:[]} в миллиметрах.
   Извлечено из модели АК-74 и вынесено в общий модуль без изменений логики. */
/* ============================================================================
   AKGeom — компактное ядро процедурной геометрии (без внешних зависимостей).
   Выдаёт «суп» треугольников {p:[x,y,z...], n:[nx,ny,nz...]}.
   Работает и в Node (экспорт/рендер-проверка), и в браузере.
   ========================================================================== */
(function (root, factory) {
  const G = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  else root.AKGeom = G;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const EPS = 1e-9;

  /* ---------------------------------------------------------------- базовое */
  const geo = () => ({ p: [], n: [] });

  function tri(g, A, B, C, nA, nB, nC) {
    g.p.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
    g.n.push(nA[0], nA[1], nA[2], nB[0], nB[1], nB[2], nC[0], nC[1], nC[2]);
  }
  function quad(g, A, B, C, D, nA, nB, nC, nD) {
    tri(g, A, B, C, nA, nB, nC);
    tri(g, A, C, D, nA, nC, nD);
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  const faceN = (A, B, C) => norm(cross(sub(B, A), sub(C, A)));

  /* треугольник с плоской нормалью */
  function triFlat(g, A, B, C) { const n = faceN(A, B, C); tri(g, A, B, C, n, n, n); }
  function quadFlat(g, A, B, C, D) { triFlat(g, A, B, C); triFlat(g, A, C, D); }

  /* убрать вырожденные треугольники и починить нормали */
  function clean(g) {
    const out = geo(), p = g.p, n = g.n;
    for (let i = 0; i < p.length; i += 9) {
      const A = [p[i], p[i + 1], p[i + 2]], B = [p[i + 3], p[i + 4], p[i + 5]], C = [p[i + 6], p[i + 7], p[i + 8]];
      if (!isFinite(A[0] + A[1] + A[2] + B[0] + B[1] + B[2] + C[0] + C[1] + C[2])) continue;
      const c = cross(sub(B, A), sub(C, A));
      const a2 = Math.hypot(c[0], c[1], c[2]);
      if (!(a2 > 1e-6)) continue;
      const fn = [c[0] / a2, c[1] / a2, c[2] / a2];
      out.p.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
      for (let k = 0; k < 3; k++) {
        const o = i + k * 3, l = Math.hypot(n[o], n[o + 1], n[o + 2]);
        if (!(l > 1e-4)) out.n.push(fn[0], fn[1], fn[2]);
        else out.n.push(n[o] / l, n[o + 1] / l, n[o + 2] / l);
      }
    }
    return out;
  }

  function merge(list) {
    const out = geo();
    for (const g of list) {
      if (!g) continue;
      const gp = g.p, gn = g.n;
      for (let i = 0; i < gp.length; i++) out.p.push(gp[i]);
      for (let i = 0; i < gn.length; i++) out.n.push(gn[i]);
    }
    return out;
  }

  /* ------------------------------------------------------------ трансформы */
  function transform(g, m) {                       // m — 4x4, column-major (как в three)
    const p = g.p, n = g.n;
    // нормальная матрица = верхняя 3x3 без переноса (масштаб у нас однородный)
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      p[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
      p[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      p[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      const a = n[i], b = n[i + 1], c = n[i + 2];
      let nx = m[0] * a + m[4] * b + m[8] * c;
      let ny = m[1] * a + m[5] * b + m[9] * c;
      let nz = m[2] * a + m[6] * b + m[10] * c;
      const l = Math.hypot(nx, ny, nz) || 1;
      n[i] = nx / l; n[i + 1] = ny / l; n[i + 2] = nz / l;
    }
    return g;
  }
  const mIdent = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function mMul(a, b) {                            // a*b
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  const mTrans = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  const mScale = (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
  const mRotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
  const mRotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
  const mRotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
  /* базис из трёх ортов + начало координат */
  const mBasis = (e1, e2, e3, o) => [e1[0], e1[1], e1[2], 0, e2[0], e2[1], e2[2], 0, e3[0], e3[1], e3[2], 0, o[0], o[1], o[2], 1];

  const tr = (g, x, y, z) => transform(g, mTrans(x, y, z));
  const rx = (g, a) => transform(g, mRotX(a));
  const ry = (g, a) => transform(g, mRotY(a));
  const rz = (g, a) => transform(g, mRotZ(a));

  /* зеркало по X с исправлением обхода треугольников */
  function mirrorX(src) {
    const g = { p: src.p.slice(), n: src.n.slice() };
    for (let i = 0; i < g.p.length; i += 3) { g.p[i] = -g.p[i]; g.n[i] = -g.n[i]; }
    for (let i = 0; i < g.p.length; i += 9) {       // поменять местами 2-ю и 3-ю вершины
      for (let k = 0; k < 3; k++) {
        let t = g.p[i + 3 + k]; g.p[i + 3 + k] = g.p[i + 6 + k]; g.p[i + 6 + k] = t;
        t = g.n[i + 3 + k]; g.n[i + 3 + k] = g.n[i + 6 + k]; g.n[i + 6 + k] = t;
      }
    }
    return g;
  }

  /* ------------------------------------------------------- 2D: контуры */
  /* pts: [[x,y] | [x,y,r]] — замкнутый многоугольник; r — радиус скругления угла.
     Возврат: [{x,y,s}] где s=true — гладкая стыковка с предыдущим ребром. */
  function round(pts, defR) {
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const c = pts[i], p0 = pts[(i - 1 + n) % n], p1 = pts[(i + 1) % n];
      const r = c.length > 2 ? c[2] : (defR || 0);
      const d0 = [p0[0] - c[0], p0[1] - c[1]], d1 = [p1[0] - c[0], p1[1] - c[1]];
      const l0 = Math.hypot(d0[0], d0[1]), l1 = Math.hypot(d1[0], d1[1]);
      if (r <= 1e-6 || l0 < EPS || l1 < EPS) { out.push({ x: c[0], y: c[1], s: false }); continue; }
      const rr = Math.min(r, l0 * 0.499, l1 * 0.499);
      const u0 = [d0[0] / l0, d0[1] / l0], u1 = [d1[0] / l1, d1[1] / l1];
      const A = [c[0] + u0[0] * rr, c[1] + u0[1] * rr];
      const B = [c[0] + u1[0] * rr, c[1] + u1[1] * rr];
      const dot = Math.max(-1, Math.min(1, u0[0] * u1[0] + u0[1] * u1[1]));
      const segs = Math.max(2, Math.min(14, Math.ceil((Math.PI - Math.acos(dot)) / 0.26)));
      for (let k = 0; k <= segs; k++) {
        const t = k / segs, it = 1 - t;
        out.push({
          x: it * it * A[0] + 2 * it * t * c[0] + t * t * B[0],
          y: it * it * A[1] + 2 * it * t * c[1] + t * t * B[1],
          s: true
        });
      }
    }
    return out;
  }
  const rect = (x0, y0, x1, y1, r) => round([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], r || 0);
  function circle(cx, cy, r, seg) {
    seg = seg || Math.max(16, Math.ceil(r * 6));
    const o = [];
    for (let i = 0; i < seg; i++) { const a = i / seg * TAU; o.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, s: true }); }
    return o;
  }
  function ellipse(cx, cy, rx0, ry0, seg) {
    seg = seg || 40; const o = [];
    for (let i = 0; i < seg; i++) { const a = i / seg * TAU; o.push({ x: cx + Math.cos(a) * rx0, y: cy + Math.sin(a) * ry0, s: true }); }
    return o;
  }
  const area2 = (c) => { let a = 0; for (let i = 0, n = c.length; i < n; i++) { const p = c[i], q = c[(i + 1) % n]; a += p.x * q.y - q.x * p.y; } return a / 2; };
  const ccw = (c) => (area2(c) < 0 ? c.slice().reverse() : c);
  const cw = (c) => (area2(c) > 0 ? c.slice().reverse() : c);

  /* --------------------------------------------------- триангуляция (ear) */
  function bridgeHoles(outer, holes) {
    let poly = outer.map((p, i) => ({ x: p.x, y: p.y, s: p.s }));
    const hs = holes.slice().sort((a, b) => hMaxX(b) - hMaxX(a));
    for (const h of hs) poly = bridgeOne(poly, h);
    return poly;
  }
  function hMaxX(h) { let m = -Infinity; for (const p of h) m = Math.max(m, p.x); return m; }
  function bridgeOne(poly, hole) {
    let hi = 0;
    for (let i = 1; i < hole.length; i++) if (hole[i].x > hole[hi].x) hi = i;
    const H = hole[hi];
    let best = -1, bestD = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i];
      const d = (P.x - H.x) * (P.x - H.x) + (P.y - H.y) * (P.y - H.y);
      if (d >= bestD) continue;
      if (!visible(poly, hole, H, P, i, hi)) continue;
      best = i; bestD = d;
    }
    if (best < 0) best = 0;
    const out = poly.slice(0, best + 1);
    for (let k = 0; k <= hole.length; k++) out.push(hole[(hi + k) % hole.length]);
    out.push(poly[best]);
    return out.concat(poly.slice(best + 1));
  }
  function visible(poly, hole, A, B, ai, bi) {
    const test = (arr) => {
      for (let i = 0, n = arr.length; i < n; i++) {
        const P = arr[i], Q = arr[(i + 1) % n];
        if (segInt(A, B, P, Q)) return false;
      }
      return true;
    };
    return test(poly) && test(hole);
  }
  function segInt(a, b, c, d) {
    const sameP = (p, q) => Math.abs(p.x - q.x) < 1e-7 && Math.abs(p.y - q.y) < 1e-7;
    if (sameP(a, c) || sameP(a, d) || sameP(b, c) || sameP(b, d)) return false;
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
  }
  /* ear clipping для простого многоугольника (CCW) → массив индексов */
  function earcut(poly) {
    const n = poly.length;
    const idx = []; for (let i = 0; i < n; i++) idx.push(i);
    const out = [];
    let guard = 0;
    const A = (i, j, k) => {
      const p = poly[i], q = poly[j], r = poly[k];
      return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    };
    const inTri = (a, b, c, p) => {
      const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
      const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
      const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
      const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
      const pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      return !(neg && pos);
    };
    while (idx.length > 3 && guard++ < 40000) {
      let clipped = false;
      for (let i = 0; i < idx.length; i++) {
        const i0 = idx[(i - 1 + idx.length) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length];
        if (A(i0, i1, i2) <= 1e-12) continue;
        let ok = true;
        for (let j = 0; j < idx.length; j++) {
          const jj = idx[j];
          if (jj === i0 || jj === i1 || jj === i2) continue;
          if (inTri(poly[i0], poly[i1], poly[i2], poly[jj])) { ok = false; break; }
        }
        if (!ok) continue;
        out.push(i0, i1, i2);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
      if (!clipped) { idx.splice(1, 1); }        // аварийный выход из вырожденного случая
    }
    if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
    return out;
  }

  /* --------------------------------------------------------------- контур */
  /* нормали рёбер и вершин контура */
  function contourNormals(c) {
    const n = c.length, en = [], vn = [];
    for (let i = 0; i < n; i++) {
      const a = c[i], b = c[(i + 1) % n];
      let dx = b.x - a.x, dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      en.push([dy / l, -dx / l]);
    }
    for (let i = 0; i < n; i++) {
      const prev = en[(i - 1 + n) % n], cur = en[i];
      if (c[i].s) {
        let x = prev[0] + cur[0], y = prev[1] + cur[1];
        const l = Math.hypot(x, y) || 1;
        vn.push({ a: [x / l, y / l], b: [x / l, y / l] });
      } else vn.push({ a: prev, b: cur });
    }
    return { en, vn };
  }
  /* смещение контура внутрь материала на d (митра с ограничением) */
  function offsetContour(c, d) {
    const { en } = contourNormals(c), n = c.length, out = [];
    for (let i = 0; i < n; i++) {
      const prev = en[(i - 1 + n) % n], cur = en[i];
      let mx = prev[0] + cur[0], my = prev[1] + cur[1];
      const l = Math.hypot(mx, my);
      if (l < 1e-6) { out.push({ x: c[i].x, y: c[i].y, s: c[i].s }); continue; }
      mx /= l; my /= l;
      let k = d / Math.max(0.4, mx * cur[0] + my * cur[1]);
      out.push({ x: c[i].x - mx * k, y: c[i].y - my * k, s: c[i].s });
    }
    return out;
  }

  /* ------------------------------------------------------------- extrude */
  /* shape: {outer:[pts], holes:[[pts],...]}  |  просто контур
     o: {z0, z1, ch (фаска), capA, capB} */
  function extrude(shape, o) {
    o = o || {};
    const outer = ccw(Array.isArray(shape) ? shape : shape.outer);
    const holes = ((shape.holes) || []).map(cw);
    const z0 = o.z0 !== undefined ? o.z0 : 0;
    const z1 = o.z1 !== undefined ? o.z1 : (z0 + (o.depth || 1));
    const ch = Math.max(0, Math.min(o.ch === undefined ? 0 : o.ch, Math.abs(z1 - z0) * 0.45));
    const capA = o.capA !== false, capB = o.capB !== false;
    const g = geo();
    const zs = ch > 0 ? [z0, z0 + ch, z1 - ch, z1] : [z0, z1];
    const offs = ch > 0 ? [ch, 0, 0, ch] : [0, 0];
    const all = [outer].concat(holes);

    for (const c of all) {
      const rings = offs.map((d) => (d > 0 ? offsetContour(c, d) : c));
      const nrm = rings.map(contourNormals);
      for (let L = 0; L < zs.length - 1; L++) {
        const cA = rings[L], cB = rings[L + 1], zA = zs[L], zB = zs[L + 1];
        const bevel = offs[L] !== offs[L + 1];
        const zdir = offs[L] > offs[L + 1] ? -1 : 1;   // фаска у ближнего или дальнего торца
        const sgn = L === 0 ? -1 : 1;
        const nA = nrm[L], nB = nrm[L + 1];
        for (let i = 0, n = cA.length; i < n; i++) {
          const j = (i + 1) % n;
          const P0 = [cA[i].x, cA[i].y, zA], P1 = [cA[j].x, cA[j].y, zA];
          const P2 = [cB[j].x, cB[j].y, zB], P3 = [cB[i].x, cB[i].y, zB];
          const e = nA.en[i];
          let n0, n1;
          if (bevel) {
            const kz = (offs[L] > offs[L + 1]) ? -1 : 1;
            const w = norm([e[0], e[1], kz * 1.0]);
            n0 = w; n1 = w;
          } else {
            n0 = [nA.vn[i].b[0], nA.vn[i].b[1], 0];
            n1 = [nA.vn[j].a[0], nA.vn[j].a[1], 0];
          }
          const m0 = bevel ? n0 : n0, m1 = bevel ? n1 : n1;
          quad(g, P0, P1, P2, P3, m0, m1, m1, m0);
        }
      }
    }
    /* торцы */
    const capRing = (d) => ({
      outer: d > 0 ? offsetContour(outer, d) : outer,
      holes: holes.map((h) => (d > 0 ? offsetContour(h, d) : h))
    });
    if (capB) {
      const r = capRing(offs[offs.length - 1]);
      const poly = r.holes.length ? bridgeHoles(r.outer, r.holes) : r.outer;
      const ids = earcut(poly);
      const N = [0, 0, 1];
      for (let i = 0; i < ids.length; i += 3) {
        tri(g, [poly[ids[i]].x, poly[ids[i]].y, z1], [poly[ids[i + 1]].x, poly[ids[i + 1]].y, z1],
          [poly[ids[i + 2]].x, poly[ids[i + 2]].y, z1], N, N, N);
      }
    }
    if (capA) {
      const r = capRing(offs[0]);
      const poly = r.holes.length ? bridgeHoles(r.outer, r.holes) : r.outer;
      const ids = earcut(poly);
      const N = [0, 0, -1];
      for (let i = 0; i < ids.length; i += 3) {
        tri(g, [poly[ids[i]].x, poly[ids[i]].y, z0], [poly[ids[i + 2]].x, poly[ids[i + 2]].y, z0],
          [poly[ids[i + 1]].x, poly[ids[i + 1]].y, z0], N, N, N);
      }
    }
    return g;
  }
  /* удобные обёртки: выдавливание вдоль X и Y */
  const extrudeX = (s, o) => ry(extrude(s, o), Math.PI / 2);   // локальные (u,v)→(z→x)
  const extrudeY = (s, o) => rx(extrude(s, o), -Math.PI / 2);

  /* --------------------------------------------------------------- lathe */
  /* профиль: [{r,z,s}] — обход «материал слева»; вращение вокруг оси Z */
  function lathe(profile, seg, closed, arc, a0) {
    seg = seg || 48; arc = arc === undefined ? TAU : arc; a0 = a0 || 0;
    const g = geo();
    /* профиль должен быть CCW в плоскости (r,z) — иначе нормали смотрят внутрь */
    {
      let ar = 0;
      for (let i = 0; i < profile.length; i++) {
        const a = profile[i], b = profile[(i + 1) % profile.length];
        ar += a.r * b.z - b.r * a.z;
      }
      if (ar < 0) profile = profile.slice().reverse();
    }
    const N = profile.length;
    const last = closed ? N : N - 1;
    // нормали в плоскости (r,z)
    const en = [];
    for (let i = 0; i < last; i++) {
      const a = profile[i], b = profile[(i + 1) % N];
      let dr = b.r - a.r, dz = b.z - a.z;
      const l = Math.hypot(dr, dz) || 1;
      en.push([dz / l, -dr / l]);
    }
    const vnA = [], vnB = [];
    for (let i = 0; i < N; i++) {
      const pe = en[(i - 1 + last) % last], ce = en[Math.min(i, last - 1)];
      const usePrev = closed || i > 0, useCur = closed || i < last;
      const P = usePrev ? pe : ce, C = useCur ? ce : pe;
      if (profile[i].s) {
        let x = P[0] + C[0], y = P[1] + C[1];
        const l = Math.hypot(x, y) || 1;
        vnA.push([x / l, y / l]); vnB.push([x / l, y / l]);
      } else { vnA.push(P); vnB.push(C); }
    }
    const full = Math.abs(arc - TAU) < 1e-6;
    for (let s = 0; s < seg; s++) {
      const t0 = a0 + arc * s / seg, t1 = a0 + arc * (s + 1) / seg;
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      for (let i = 0; i < last; i++) {
        const a = profile[i], b = profile[(i + 1) % N];
        if (a.r < EPS && b.r < EPS) continue;
        const nA = vnB[i], nB = vnA[(i + 1) % N];
        const A0 = [a.r * c0, a.r * s0, a.z], A1 = [a.r * c1, a.r * s1, a.z];
        const B0 = [b.r * c0, b.r * s0, b.z], B1 = [b.r * c1, b.r * s1, b.z];
        const na0 = [nA[0] * c0, nA[0] * s0, nA[1]], na1 = [nA[0] * c1, nA[0] * s1, nA[1]];
        const nb0 = [nB[0] * c0, nB[0] * s0, nB[1]], nb1 = [nB[0] * c1, nB[0] * s1, nB[1]];
        if (a.r < EPS) tri(g, A0, B1, B0, na0, nb1, nb0);
        else if (b.r < EPS) tri(g, A0, A1, B0, na0, na1, nb0);
        else quad(g, A1, B1, B0, A0, na1, nb1, nb0, na0);
      }
    }
    if (!full) {                                   // боковые «щёки» у сектора
      [[a0, -1], [a0 + arc, 1]].forEach(([t, sg]) => {
        const c = Math.cos(t), s = Math.sin(t);
        const nx = -Math.sin(t) * sg, ny = Math.cos(t) * sg;
        const NN = [nx, ny, 0];
        const poly = profile.map((q) => ({ x: q.r, y: q.z }));
        const ids = earcut(ccw(poly.map((q) => ({ x: q.x, y: q.y, s: false }))));
        const src = ccw(poly.map((q) => ({ x: q.x, y: q.y, s: false })));
        for (let i = 0; i < ids.length; i += 3) {
          const P = [0, 1, 2].map((k) => {
            const q = src[ids[i + k]];
            return [q.x * c, q.x * s, q.y];
          });
          if (sg > 0) tri(g, P[0], P[2], P[1], NN, NN, NN);
          else tri(g, P[0], P[1], P[2], NN, NN, NN);
        }
      });
    }
    return g;
  }

  /* цилиндр/труба вдоль Z */
  function cyl(r0, r1, z0, z1, seg, caps) {
    const pr = [];
    if (caps !== false) pr.push({ r: 0, z: z0, s: false });
    pr.push({ r: r0, z: z0, s: false }, { r: r1, z: z1, s: false });
    if (caps !== false) pr.push({ r: 0, z: z1, s: false });
    return lathe(pr, seg || 32, false);
  }
  function tube(rIn, rOut, z0, z1, seg) {
    return lathe([{ r: rIn, z: z0, s: false }, { r: rOut, z: z0, s: false },
    { r: rOut, z: z1, s: false }, { r: rIn, z: z1, s: false }], seg || 40, true);
  }
  function torus(R, r, segA, segB, arc, a0) {
    segA = segA || 40; segB = segB || 16; arc = arc === undefined ? TAU : arc; a0 = a0 || 0;
    const pr = [];
    for (let i = 0; i < segB; i++) {
      const a = i / segB * TAU;
      pr.push({ r: R + Math.cos(a) * r, z: Math.sin(a) * r, s: true });
    }
    return lathe(pr, segA, true, arc, a0);
  }

  /* ---------------------------------------------------------------- loft */
  /* rings: [[ [x,y,z] × K ] × M] — замкнутые кольца одинаковой длины */
  function loft(rings, capA, capB, openRing) {
    const M = rings.length, K = rings[0].length;
    const acc = [];
    for (let s = 0; s < M; s++) { acc.push([]); for (let i = 0; i < K; i++) acc[s].push([0, 0, 0]); }
    const kEnd = openRing ? K - 1 : K;
    const addN = (s, i, n) => { const a = acc[s][i]; a[0] += n[0]; a[1] += n[1]; a[2] += n[2]; };
    for (let s = 0; s < M - 1; s++) {
      for (let i = 0; i < kEnd; i++) {
        const j = (i + 1) % K;
        const A = rings[s][i], B = rings[s][j], C = rings[s + 1][j], D = rings[s + 1][i];
        const n = norm(cross(sub(B, A), sub(D, A)));
        addN(s, i, n); addN(s, j, n); addN(s + 1, j, n); addN(s + 1, i, n);
      }
    }
    for (let s = 0; s < M; s++) for (let i = 0; i < K; i++) acc[s][i] = norm(acc[s][i]);
    const g = geo();
    for (let s = 0; s < M - 1; s++) {
      for (let i = 0; i < kEnd; i++) {
        const j = (i + 1) % K;
        quad(g, rings[s][i], rings[s][j], rings[s + 1][j], rings[s + 1][i],
          acc[s][i], acc[s][j], acc[s + 1][j], acc[s + 1][i]);
      }
    }
    const cap = (ring, flip) => {
      const c = [0, 0, 0];
      for (const p of ring) { c[0] += p[0] / K; c[1] += p[1] / K; c[2] += p[2] / K; }
      for (let i = 0; i < K; i++) {
        const j = (i + 1) % K;
        if (flip) triFlat(g, c, ring[j], ring[i]); else triFlat(g, c, ring[i], ring[j]);
      }
    };
    if (capA) cap(rings[0], true);
    if (capB) cap(rings[M - 1], false);
    return g;
  }

  /* суперэллипс — база для рукояток, прикладов, магазинов */
  function superRing(a, bUp, bDn, k, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = i / n * TAU, c = Math.cos(t), s = Math.sin(t);
      const b = s >= 0 ? bUp : bDn;
      out.push([
        Math.sign(c) * a * Math.pow(Math.abs(c), 2 / k),
        Math.sign(s) * b * Math.pow(Math.abs(s), 2 / k)
      ]);
    }
    return out;
  }

  /* сетка-оболочка с отверстиями (дульный тормоз, кожухи) */
  function perfShell(o) {
    const rO = o.rOut, rI = o.rIn, th = o.thetas, zs = o.zs, hole = o.hole;
    const g = geo();
    const V = (r, t, z) => [Math.cos(t) * r, Math.sin(t) * r, z];
    const nT = th.length - 1, nZ = zs.length - 1, open = [];
    for (let i = 0; i < nT; i++) { open.push([]); for (let j = 0; j < nZ; j++) open[i].push(hole((th[i] + th[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2)); }
    for (let i = 0; i < nT; i++) for (let j = 0; j < nZ; j++) {
      const t0 = th[i], t1 = th[i + 1], z0 = zs[j], z1 = zs[j + 1];
      const n0 = [Math.cos(t0), Math.sin(t0), 0], n1 = [Math.cos(t1), Math.sin(t1), 0];
      const m0 = [-n0[0], -n0[1], 0], m1 = [-n1[0], -n1[1], 0];
      if (!open[i][j]) {
        quad(g, V(rO, t0, z0), V(rO, t1, z0), V(rO, t1, z1), V(rO, t0, z1), n0, n1, n1, n0);
        quad(g, V(rI, t0, z0), V(rI, t0, z1), V(rI, t1, z1), V(rI, t1, z0), m0, m0, m1, m1);
        if (o.capBack && j === 0) { const n = [0, 0, -1]; quad(g, V(rI, t1, z0), V(rO, t1, z0), V(rO, t0, z0), V(rI, t0, z0), n, n, n, n); }
        if (o.capFront && j === nZ - 1) { const n = [0, 0, 1]; quad(g, V(rO, t0, z1), V(rO, t1, z1), V(rI, t1, z1), V(rI, t0, z1), n, n, n, n); }
      } else {
        const L = open[(i - 1 + nT) % nT][j], R = open[(i + 1) % nT][j];
        const B = j > 0 ? open[i][j - 1] : true, F = j < nZ - 1 ? open[i][j + 1] : true;
        if (!L) { const n = [-Math.sin(t0), Math.cos(t0), 0]; quad(g, V(rI, t0, z1), V(rO, t0, z1), V(rO, t0, z0), V(rI, t0, z0), n, n, n, n); }
        if (!R) { const n = [Math.sin(t1), -Math.cos(t1), 0]; quad(g, V(rO, t1, z0), V(rO, t1, z1), V(rI, t1, z1), V(rI, t1, z0), n, n, n, n); }
        if (!B) { const n = [0, 0, 1]; quad(g, V(rO, t0, z0), V(rO, t1, z0), V(rI, t1, z0), V(rI, t0, z0), n, n, n, n); }
        if (!F) { const n = [0, 0, -1]; quad(g, V(rI, t1, z1), V(rO, t1, z1), V(rO, t0, z1), V(rI, t0, z1), n, n, n, n); }
      }
    }
    return g;
  }

  function bounds(g) {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < g.p.length; i += 3) for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], g.p[i + k]); mx[k] = Math.max(mx[k], g.p[i + k]);
    }
    return { min: mn, max: mx };
  }

  return {
    TAU, geo, tri, quad, triFlat, quadFlat, merge, transform, bounds,
    mIdent, mMul, mTrans, mScale, mRotX, mRotY, mRotZ, mBasis,
    tr, rx, ry, rz, mirrorX, norm, cross, sub,
    round, rect, circle, ellipse, ccw, cw, offsetContour,
    extrude, extrudeX, extrudeY, lathe, cyl, tube, torus, loft, superRing, perfShell, earcut, bridgeHoles, clean
  };
});
});

__def("common", function (module, exports) {
/* ============================================================================
   Общая библиотека деталей навесных модулей.

   Единицы — миллиметры. Локальная система координат модуля:
     X — вправо, Y — вверх, Z — назад (дуло смотрит в −Z).
   Начало координат модуля — точка посадки:
     · для «планочных» модулей   — центр верхней плоскости планки Пикатинни;
     · для дульных               — торец резьбы ствола, ось канала по Y=0;
     · для магазинов             — плоскость шахты (верх магазина).
   Такая привязка позволяет оружию задавать слот одной точкой + поворотом.
   ========================================================================== */
module.exports = function (G) {
  const PI = Math.PI, TAU = PI * 2, D = (d) => d * PI / 180;
  const { tr, rx, ry, rz, merge, extrude, extrudeX, lathe, cyl, tube, torus, round, circle, mirrorX, loft } = G;

  /* ------------------------------------------------------------ материалы */
  /* Цвет — линейный RGB, metal/rough — как в PBR. Адаптеры движков
     переводят эти записи в свои материалы. alpha<1 → прозрачная деталь. */
  const MATS = {
    anod:     { color: [0.040, 0.042, 0.046], metal: 0.82, rough: 0.45 },  // чёрный анодированный алюминий
    anodMatt: { color: [0.030, 0.031, 0.033], metal: 0.55, rough: 0.66 },  // матовая анодировка корпусов
    fde:      { color: [0.170, 0.132, 0.077], metal: 0.06, rough: 0.63 },  // FDE-полимер / Cerakote
    od:       { color: [0.044, 0.052, 0.030], metal: 0.10, rough: 0.62 },  // olive drab
    steel:    { color: [0.165, 0.170, 0.180], metal: 1.00, rough: 0.33 },
    steelDk:  { color: [0.072, 0.075, 0.080], metal: 0.95, rough: 0.44 },
    nitride:  { color: [0.042, 0.043, 0.046], metal: 0.92, rough: 0.36 },  // нитрид/QPQ дульных устройств
    park:     { color: [0.052, 0.052, 0.050], metal: 0.90, rough: 0.58 },  // фосфатирование (АК)
    inconel:  { color: [0.205, 0.198, 0.186], metal: 1.00, rough: 0.41 },  // перегородки глушителя
    poly:     { color: [0.052, 0.054, 0.058], metal: 0.02, rough: 0.55 },  // чёрный полимер
    wood:     { color: [0.196, 0.083, 0.031], metal: 0.00, rough: 0.44 },  // лакированная берёза
    woodDk:   { color: [0.118, 0.046, 0.017], metal: 0.00, rough: 0.50 },
    bakelite: { color: [0.245, 0.072, 0.062], metal: 0.06, rough: 0.38 },  // «слива»
    rubber:   { color: [0.011, 0.011, 0.013], metal: 0.00, rough: 0.93 },
    glass:    { color: [0.780, 0.850, 0.840], metal: 0.00, rough: 0.03, alpha: 0.07, coat: 1 },
    glassAR:  { color: [0.420, 0.640, 0.590], metal: 0.06, rough: 0.03, alpha: 0.12, coat: 1 },  // просветление
    reticle:  { color: [0.000, 0.000, 0.000], metal: 0.00, rough: 1.00, emis: [2.60, 0.22, 0.10], alpha: 0.95 },
    lampHot:  { color: [0.000, 0.000, 0.000], metal: 0.00, rough: 1.00, emis: [3.00, 2.70, 2.20] },
    laserRed: { color: [0.000, 0.000, 0.000], metal: 0.00, rough: 1.00, emis: [4.00, 0.10, 0.05] },
    laserIR:  { color: [0.020, 0.004, 0.004], metal: 0.00, rough: 0.80, emis: [0.30, 0.02, 0.02] },
    mark:     { color: [0.520, 0.525, 0.530], metal: 0.30, rough: 0.52 },  // белая/серая маркировка
    brass:    { color: [0.620, 0.465, 0.170], metal: 1.00, rough: 0.25 },
    copper:   { color: [0.575, 0.320, 0.160], metal: 1.00, rough: 0.29 },
    lead:     { color: [0.330, 0.335, 0.345], metal: 1.00, rough: 0.45 },
    bore:     { color: [0.009, 0.009, 0.011], metal: 0.35, rough: 0.82 }
  };

  /* ------------------------------------------------- накопитель деталей */
  function bag() {
    const list = [];
    const api = {
      list,
      add(name, mat, geo) { if (geo && geo.p.length) list.push({ name, mat, geo }); return geo; },
      addAll(src, prefix) {
        for (const p of src) api.add(prefix ? prefix + '_' + p.name : p.name, p.mat, p.geo);
        return api;
      },
      /* сдвинуть/повернуть всё содержимое */
      xform(m) { for (const p of list) G.transform(p.geo, m); return api; }
    };
    return api;
  }

  /* --------------------------------------------------------- примитивы */
  /* коробка со скруглением углов в XY, вытянутая по Z */
  const boxZ = (x0, y0, x1, y1, z0, z1, r, ch) =>
    extrude(round([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], r || 0), { z0, z1, ch: ch === undefined ? 0.25 : ch });

  /* коробка, заданная центром и габаритами */
  const boxC = (cx, cy, cz, w, h, l, r, ch) =>
    boxZ(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, cz - l / 2, cz + l / 2, r, ch);

  /* профиль в плоскости (Z,Y) → толщина по X (полезно для щёк, кронштейнов) */
  const plateZY = (pts, x0, x1, ch) =>
    extrudeX(round(pts.map((p) => (p.length > 2 ? [-p[0], p[1], p[2]] : [-p[0], p[1]])), 0),
      { z0: x0, z1: x1, ch: ch === undefined ? 0.25 : ch });

  /* цилиндр вдоль X / Y */
  const cylX = (r0, r1, x0, x1, seg, caps) => tr(ry(cyl(r0, r1, 0, x1 - x0, seg || 24, caps !== false), PI / 2), x0, 0, 0);
  const cylY = (r0, r1, y0, y1, seg, caps) => tr(rx(cyl(r0, r1, 0, y1 - y0, seg || 24, caps !== false), -PI / 2), 0, y0, 0);

  function sphere(r, seg) {
    const p = [], n = seg || 16;
    for (let i = 0; i <= n; i++) { const a = -PI / 2 + PI * i / n; p.push({ r: r * Math.cos(a), z: r * Math.sin(a), s: true }); }
    p[0].s = false; p[p.length - 1].s = false;
    return lathe(p, (seg || 16) * 2, false);
  }

  /* --------------------------------------------- планка Пикатинни (1913) */
  /* Сечение: верх 15,7 мм, скос 45° до 21,2 мм, далее вертикальные борта.
     Верхняя плоскость лежит на y = 0, тело уходит вниз. Пазы 5,35 / шаг 10,16. */
  const RAIL = { top: 15.7, wide: 21.2, bevel: 2.75, slotW: 5.35, pitch: 10.16, slotD: 3.0, base: 4.6 };

  function railCrossSection(h) {
    const hh = h === undefined ? RAIL.base : h;
    return round([
      [-RAIL.top / 2, 0], [RAIL.top / 2, 0],
      [RAIL.wide / 2, -RAIL.bevel], [RAIL.wide / 2, -RAIL.bevel - 0.9],
      [RAIL.wide / 2 - 1.1, -hh], [-RAIL.wide / 2 + 1.1, -hh],
      [-RAIL.wide / 2, -RAIL.bevel - 0.9], [-RAIL.wide / 2, -RAIL.bevel]
    ], 0.25);
  }

  /* Отрезок планки: длина len, задний торец в z = zBack, пазы нарезаны.
     phase — смещение первого паза, чтобы пазы соседних секций совпадали. */
  function railStrip(len, zBack, h, phase) {
    const hh = h === undefined ? RAIL.base : h;
    const z0 = zBack - len, z1 = zBack;
    const g = [];
    const sec = railCrossSection(hh);
    /* тело планки режем на «зубья» между пазами */
    const cuts = [];
    let z = z1 - (phase === undefined ? (RAIL.pitch - RAIL.slotW) / 2 : phase);
    while (z - RAIL.slotW > z0) { cuts.push([z - RAIL.slotW, z]); z -= RAIL.pitch; }
    let cur = z1;
    const solid = [];
    for (const c of cuts) { if (cur - c[1] > 0.05) solid.push([c[1], cur]); cur = c[0]; }
    if (cur - z0 > 0.05) solid.push([z0, cur]);
    for (const s of solid) g.push(extrude(sec, { z0: s[0], z1: s[1], ch: 0.3 }));
    /* дно паза — сплошная подошва высотой (hh − slotD) */
    const floorSec = round([
      [-RAIL.wide / 2 + 1.1, -hh], [RAIL.wide / 2 - 1.1, -hh],
      [RAIL.wide / 2 - 0.4, -RAIL.slotD], [-RAIL.wide / 2 + 0.4, -RAIL.slotD]
    ], 0.2);
    g.push(extrude(floorSec, { z0: z0, z1: z1, ch: 0.2 }));
    return merge(g);
  }

  /* Индексы пазов относительно точки посадки — для «щелчка» при установке. */
  const railSlotZ = (n, zBack) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push((zBack || 0) - (RAIL.pitch - RAIL.slotW) / 2 - RAIL.slotW / 2 - i * RAIL.pitch);
    return out;
  };

  /* ------------------------------------------- зажим модуля на планку */
  /* Губки охватывают скосы планки снизу, поперечный винт с барашком/рычагом.
     opts: {len, style:'crossbolt'|'qd'|'thumb', side:+1|-1, lugs:[z...], base} */
  function railClamp(opts) {
    const O = Object.assign({ len: 40, style: 'crossbolt', side: 1, lugs: [], base: 5.0, width: 26 }, opts);
    const P = bag();
    const zB = O.len / 2, zF = -O.len / 2;
    const bodyTop = O.base;                    // низ модуля над планкой

    /* корпус-подошва над планкой */
    P.add('clampBody', 'anod', boxZ(-O.width / 2, 0.15, O.width / 2, bodyTop, zF, zB, 1.6, 0.5));

    /* неподвижная губка (слева) и подвижная (справа) — обе цепляют скос 45° */
    for (const s of [-1, 1]) {
      const moving = s === O.side;
      const xOut = RAIL.wide / 2 + (moving ? 3.4 : 2.6);
      const xIn = RAIL.top / 2 - 0.2;
      const jaw = round([
        [s * xIn, 0.1], [s * xOut, 0.1],
        [s * xOut, -RAIL.bevel - 3.2], [s * (xOut - 1.0), -RAIL.bevel - 3.4],
        [s * (RAIL.wide / 2 - 0.15), -RAIL.bevel - 0.15], [s * (xIn + 0.1), -0.05]
      ], 0.35);
      const zj0 = moving ? zF + 2.5 : zF + 1.0, zj1 = moving ? zB - 2.5 : zB - 1.0;
      P.add(moving ? 'clampJawMove' : 'clampJawFix', 'anod', extrude(jaw, { z0: zj0, z1: zj1, ch: 0.4 }));
    }

    /* поперечные винты/рычаги */
    const nz = O.len > 52 ? 2 : 1;
    for (let i = 0; i < nz; i++) {
      const zc = nz === 1 ? 0 : (i === 0 ? zF + O.len * 0.28 : zB - O.len * 0.28);
      const xHead = O.side * (RAIL.wide / 2 + 4.0);
      /* стержень винта сквозь обе губки */
      P.add('clampBolt', 'steel', tr(cylX(2.4, 2.4, -RAIL.wide / 2 - 3.6, RAIL.wide / 2 + 3.6, 18), 0, -RAIL.bevel - 1.4, zc));
      if (O.style === 'thumb') {
        /* барашек с насечкой */
        P.add('clampNut', 'steelDk', tr(cylX(6.6, 6.6, xHead, xHead + O.side * 3.4, 22), 0, -RAIL.bevel - 1.4, zc));
        P.addAll(knurlBand({ r: 6.6, seg: 22, n: 18, depth: 0.55, axis: 'x',
          a0: xHead, a1: xHead + O.side * 3.4, at: [0, -RAIL.bevel - 1.4, zc], mat: 'steelDk' }));
      } else if (O.style === 'qd') {
        /* рычаг быстросъёма: ось, эксцентрик, рукоять с пружиной */
        const ax = xHead;
        P.add('qdCam', 'steel', tr(cylX(5.2, 5.2, ax, ax + O.side * 5.0, 20), 0, -RAIL.bevel - 1.4, zc));
        const lever = round([[0, -1.9], [17.5, -3.4], [19.2, -1.2], [19.2, 1.6], [16.5, 3.2], [0, 2.4]], 1.0);
        P.add('qdLever', 'anod', tr(rz(extrudeX(lever, { z0: ax + O.side * 1.2, z1: ax + O.side * 4.2, ch: 0.4 }), 0),
          0, -RAIL.bevel - 1.4, zc));
        P.add('qdSpring', 'steel', tr(cylX(3.1, 3.1, ax + O.side * 5.0, ax + O.side * 6.2, 16), 0, -RAIL.bevel - 1.4, zc));
      } else {
        /* обычный винт под шестигранник с гайкой */
        P.add('clampHead', 'steel', tr(hexHeadX(4.6, 2.8, O.side), xHead, -RAIL.bevel - 1.4, zc));
        P.add('clampNut', 'steelDk', tr(hexHeadX(4.2, 2.4, -O.side), -xHead, -RAIL.bevel - 1.4, zc));
      }
    }

    /* отдачный упор (штифт) в паз планки — то, чем модуль держит отдачу */
    for (const lz of (O.lugs.length ? O.lugs : [0])) {
      P.add('recoilLug', 'steel', boxC(0, -1.4, lz, RAIL.slotW - 0.25, 3.1, RAIL.top - 3.0, 0.3, 0.2));
    }
    return P.list;
  }

  /* шестигранная головка вдоль X (толщина t, «размер под ключ» 2r) */
  function hexHeadX(r, t, dir) {
    const pts = [];
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + PI / 6; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    const g = extrudeX(round(pts, 0.18), { z0: 0, z1: (dir < 0 ? -t : t), ch: 0.25 });
    /* утопленный шестигранник под ключ */
    const key = [];
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; key.push([Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52]); }
    const hole = extrudeX(round(key, 0.1), { z0: (dir < 0 ? -t * 0.98 : t * 0.98), z1: (dir < 0 ? -t * 0.25 : t * 0.25), ch: 0.1 });
    return merge([g, hole]);
  }

  /* винт с цилиндрической головкой и шлицем Torx, ось +Z */
  function capScrew(d, len, headH) {
    const r = d / 2, hR = r * 1.55, hH = headH === undefined ? r * 0.95 : headH;
    const g = [cyl(r, r, -len, 0, 18, true), cyl(hR, hR, 0, hH, 22, true)];
    /* шлиц Torx — шесть лепестков-впадин */
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      g.push(tr(cyl(hR * 0.19, hR * 0.19, hH - 0.55, hH + 0.02, 10, true), Math.cos(a) * hR * 0.42, Math.sin(a) * hR * 0.42, 0));
    }
    g.push(cyl(hR * 0.36, hR * 0.36, hH - 0.55, hH + 0.02, 14, true));
    return merge(g);
  }

  /* --------------------------------------------------------- накатка */
  /* Кольцевая насечка: n продольных или ромбических валиков по радиусу r.
     axis: 'z' (по умолчанию) | 'x'; для 'x' задаются a0/a1 и точка at. */
  function knurlBand(o) {
    const O = Object.assign({ r: 10, z0: 0, z1: 10, n: 24, depth: 0.42, seg: 8, mat: 'steel', axis: 'z', at: [0, 0, 0] }, o);
    const P = bag();
    const zA = O.axis === 'x' ? O.a0 : O.z0, zB = O.axis === 'x' ? O.a1 : O.z1;
    const len = Math.abs(zB - zA);
    const g = [];
    for (let i = 0; i < O.n; i++) {
      const a = i / O.n * TAU;
      const rib = cyl(O.depth, O.depth * 0.75, Math.min(zA, zB) + 0.3, Math.max(zA, zB) - 0.3, 6, false);
      g.push(tr(rib, Math.cos(a) * O.r, Math.sin(a) * O.r, 0));
    }
    let m = merge(g);
    if (O.axis === 'x') m = tr(ry(m, PI / 2), O.at[0], O.at[1], O.at[2]);
    P.add('knurl', O.mat, m);
    return P.list;
  }

  /* Продольные рифления на плоскости y = const (кнопки, площадки) */
  function ribsZ(n, z0, z1, x0, x1, y, h, w) {
    const g = [];
    for (let i = 0; i < n; i++) {
      const zc = z0 + (z1 - z0) * (i + 0.5) / n;
      g.push(boxZ(x0, y - h, x1, y + h * 0.1, zc - w / 2, zc + w / 2, w * 0.45, 0.1));
    }
    return merge(g);
  }

  /* -------------------------------------------------------- резьба */
  /* Витки резьбы как наклонная спираль — видно на срезе дульного устройства. */
  function threadHelix(rOut, rIn, z0, z1, pitch, seg) {
    const turns = Math.abs(z1 - z0) / pitch;
    const steps = Math.max(12, Math.round(turns * (seg || 26)));
    const rings = [];
    const K = 7;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, a = t * turns * TAU, z = z0 + (z1 - z0) * t;
      const cx = Math.cos(a), cy = Math.sin(a);
      const ring = [];
      const rm = (rOut + rIn) / 2, w = (rOut - rIn) / 2, h = pitch * 0.34;
      for (let k = 0; k < K; k++) {
        const b = k / K * TAU;
        const dr = Math.cos(b) * w, dz = Math.sin(b) * h;
        ring.push([cx * (rm + dr), cy * (rm + dr), z + dz]);
      }
      rings.push(ring);
    }
    return loft(rings, true, true);
  }

  /* ------------------------------------------------------- оптика */
  /* Линза: двояковыпуклое стекло радиуса r, стрелка прогиба sag, центр в z. */
  function lens(r, thick, sagF, sagB, seg) {
    const n = seg || 28, prof = [];
    const zF = -thick / 2, zB = thick / 2;
    for (let i = 0; i <= n; i++) {
      const t = i / n, rr = r * t;
      prof.push({ r: rr, z: zF - (sagF || 0) * (1 - (rr / r) * (rr / r)), s: true });
    }
    for (let i = n; i >= 0; i--) {
      const t = i / n, rr = r * t;
      prof.push({ r: rr, z: zB + (sagB || 0) * (1 - (rr / r) * (rr / r)), s: true });
    }
    return lathe(prof, 48, true);
  }

  /* Кольцо-оправа линзы с резьбовым буртиком */
  function lensRing(rIn, rOut, z0, z1) {
    return lathe([
      { r: rIn, z: z0 }, { r: rOut, z: z0 }, { r: rOut, z: z1 }, { r: rIn, z: z1 }
    ], 48, true);
  }

  /* Сетка прицела как набор плоских полос в плоскости z = zR */
  function reticleShapes(list, zR) {
    const g = [];
    for (const s of list) {
      if (s.k === 'bar') g.push(boxZ(s.x0, s.y0, s.x1, s.y1, zR, zR + 0.05, 0, 0));
      else if (s.k === 'dot') g.push(tr(cyl(s.r, s.r, zR, zR + 0.05, 16, true), s.x || 0, s.y || 0, 0));
      else if (s.k === 'ring') g.push(tr(tube(s.r - s.w, s.r, zR, zR + 0.05, 64), s.x || 0, s.y || 0, 0));
      else if (s.k === 'chevron') {
        const t = s.w, h = s.h, x = s.x || 0, y = s.y || 0;
        g.push(tr(extrude(round([[-h, -h], [-h + t, -h], [0, -t * 0.4], [h - t, -h], [h, -h], [0, t * 0.6]], 0), { z0: zR, z1: zR + 0.05 }), x, y, 0));
      }
    }
    return merge(g);
  }

  /* ------------------------------------------------- прочая мелочёвка */
  /* Витая пружина вдоль Z */
  function spring(R, wire, z0, z1, turns, seg) {
    const steps = Math.max(24, Math.round(turns * (seg || 20)));
    const rings = [], K = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, a = t * turns * TAU, z = z0 + (z1 - z0) * t;
      const cx = Math.cos(a), cy = Math.sin(a);
      const ring = [];
      for (let k = 0; k < K; k++) {
        const b = k / K * TAU;
        ring.push([cx * (R + Math.cos(b) * wire), cy * (R + Math.cos(b) * wire), z + Math.sin(b) * wire]);
      }
      rings.push(ring);
    }
    return loft(rings, true, true);
  }

  /* Крышка батарейного отсека с накаткой и уплотнением */
  function batteryCap(r, z0, z1, mat) {
    const P = bag();
    P.add('battCap', mat || 'anod', lathe([
      { r: 0, z: z0 }, { r: r * 0.92, z: z0 }, { r: r, z: z0 + 0.8, s: true },
      { r: r, z: z1 - 0.6, s: true }, { r: r * 0.86, z: z1 }, { r: 0, z: z1 }
    ], 36, true));
    P.addAll(knurlBand({ r: r + 0.06, z0: z0 + 1.0, z1: z1 - 1.0, n: 26, depth: 0.32, mat: mat || 'anod' }));
    P.add('battSeal', 'rubber', tube(r * 0.80, r * 0.94, z0 - 0.7, z0 - 0.1, 30));
    return P.list;
  }

  /* Резиновая кнопка-«пятак» с рифлением, ось +Y */
  function padButton(r, y0, h, at) {
    const g = [
      tr(cylY(r, r * 0.96, y0, y0 + h, 24), at[0], 0, at[2]),
      tr(rx(lathe([{ r: 0, z: 0 }, { r: r * 0.96, z: 0 }, { r: r * 0.72, z: h * 0.45, s: true }, { r: 0, z: h * 0.55 }], 24, true), -PI / 2), at[0], y0 + h, at[2])
    ];
    return merge(g);
  }

  return {
    PI, TAU, D, MATS, RAIL,
    bag, boxZ, boxC, plateZY, cylX, cylY, sphere,
    railCrossSection, railStrip, railSlotZ, railClamp, hexHeadX, capScrew,
    knurlBand, ribsZ, threadHelix, lens, lensRing, reticleShapes, spring, batteryCap, padButton
  };
};
});

__def("optics", function (module, exports) {
/* ============================================================================
   Оптика: коллиматоры, голографический прицел, кратные прицелы, магнифер,
   ночной монокуляр и складная механика. Размеры в миллиметрах.

   Посадка: начало координат — центр верхней плоскости планки Пикатинни,
   +Z назад, дуло в −Z. Каждый модуль возвращает
     { parts:[{name,mat,geo}], meta:{...} }
   opticY — высота оптической оси над планкой (нужна камере ADS),
   glass  — имена деталей-стёкол (адаптер делает их прозрачными).

   Удаление зрачка (eyeRelief) отсчитывается от заднего среза окуляра:
   это расстояние, на котором глаз видит полное поле зрения. Камера ADS
   ставится именно туда, поэтому eyeRelief обязан быть больше нуля —
   иначе «глаз» окажется внутри трубы и картинка будет чёрной.
   ocularZ — Z заднего среза окуляра в системе модуля.
   ========================================================================== */
module.exports = function (G, C) {
  const { PI, TAU, D } = C;
  const { tr, rx, ry, rz, merge, extrude, lathe, cyl, tube } = G;
  const { bag, boxC, plateZY, cylX, cylY, railClamp, capScrew, knurlBand,
    lens, lensRing, reticleShapes, batteryCap, padButton, spring } = C;

  const OUT = {};

  /* Барабанчик поправок: гнездо, головка с накаткой, риски, шлиц под монету. */
  function turret(at, dir, o) {
    const O = Object.assign({ r: 6.0, h: 7.5, clicks: 12, mat: 'anod' }, o || {});
    const g = [];
    g.push(lathe([{ r: 0, z: 0 }, { r: O.r + 1.6, z: 0 }, { r: O.r + 1.6, z: 1.8, s: true },
      { r: O.r + 0.4, z: 2.4 }, { r: 0, z: 2.4 }], 28, true));
    g.push(tr(lathe([{ r: 0, z: 0 }, { r: O.r, z: 0 }, { r: O.r, z: O.h - 1.0, s: true },
      { r: O.r - 1.1, z: O.h }, { r: 0, z: O.h }], 30, true), 0, 0, 2.2));
    for (let i = 0; i < O.clicks; i++) {
      const a = i / O.clicks * TAU, long = i % 3 === 0;
      g.push(tr(cyl(0.3, 0.22, 3.2, 3.2 + (long ? 2.4 : 1.4), 6, true),
        Math.cos(a) * (O.r + 0.05), Math.sin(a) * (O.r + 0.05), 0));
    }
    g.push(C.boxZ(-O.r * 0.75, -0.8, O.r * 0.75, 0.8, O.h + 1.5, O.h + 2.4, 0.1, 0));
    for (const k of knurlBand({ r: O.r + 0.05, z0: 3.4, z1: O.h + 1.0, n: 28, depth: 0.34 })) g.push(k.geo);
    let all = merge(g);
    if (dir === 'up') all = rx(all, -PI / 2);
    else if (dir === 'right') all = ry(all, PI / 2);
    else if (dir === 'left') all = ry(all, -PI / 2);
    return [{ name: 'turret', mat: O.mat, geo: tr(all, at[0], at[1], at[2]) }];
  }

  /* Поднять детали модуля на высоту оптической оси, кроме деталей зажима. */
  const liftAll = (list, y) => {
    const m = G.mTrans(0, y, 0);
    for (const p of list) G.transform(p.geo, m);
    return list;
  };

  /* ==================================================================
     1. Коллиматор закрытого типа T-2: труба Ø30, QD-кронштейн lower 1/3
     ================================================================== */
  OUT.reddot_t2 = function (o) {
    const O = Object.assign({ mount: 'lower13', color: 'red' }, o || {});
    const P = bag();
    const OPT_Y = O.mount === 'absolute' ? 38.1 : 22.3;
    const R_OUT = 15.0, R_IN = 11.6, Z0 = -33, Z1 = 33;

    P.add('tube', 'anod', lathe([
      { r: R_IN, z: Z0 }, { r: R_OUT, z: Z0 }, { r: R_OUT, z: Z0 + 7, s: true },
      { r: R_OUT - 1.1, z: Z0 + 9, s: true }, { r: R_OUT - 1.1, z: Z1 - 9, s: true },
      { r: R_OUT, z: Z1 - 7, s: true }, { r: R_OUT, z: Z1 }, { r: R_IN, z: Z1 }], 48, true));
    P.add('lensFront', 'glassAR', tr(lens(R_IN - 0.3, 3.0, 0.9, 0.5, 30), 0, 0, Z0 + 5.5));
    P.add('lensRear', 'glass', tr(lens(R_IN - 0.3, 2.6, 0.5, 0.8, 30), 0, 0, Z1 - 5.5));
    P.add('lensRingF', 'steelDk', lensRing(R_IN - 0.4, R_IN + 0.5, Z0 + 3.4, Z0 + 4.1));
    P.add('lensRingR', 'steelDk', lensRing(R_IN - 0.4, R_IN + 0.5, Z1 - 4.1, Z1 - 3.4));

    P.add('turretBoss', 'anod', boxC(0, 0, 4.0, 26, 26, 22, 3.0, 0.4));
    P.addAll(turret([0, 13.0, 4.0], 'up', { r: 6.4, h: 8.0 }));
    P.addAll(turret([13.0, 0, 4.0], 'right', { r: 6.4, h: 8.0 }));

    P.add('battBoss', 'anod', tr(ry(lathe([{ r: 0, z: 0 }, { r: 10.5, z: 0 },
      { r: 10.5, z: 5.5, s: true }, { r: 0, z: 5.5 }], 32, true), -PI / 2), -13.0, 0, 4.0));
    for (const p of batteryCap(10.0, 5.2, 9.6, 'anod'))
      P.add(p.name, p.mat, tr(ry(p.geo, -PI / 2), -13.0, 0, 4.0));

    P.add('brightKnob', 'steelDk', tr(ry(lathe([{ r: 0, z: 0 }, { r: 7.0, z: 0 },
      { r: 7.0, z: 3.2, s: true }, { r: 5.6, z: 4.0 }, { r: 0, z: 4.0 }], 28, true), PI / 2), 13.4, 0, -10.0));
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      P.add('brightTick', 'mark', tr(ry(cyl(0.32, 0.32, 0, 1.2, 8, true), PI / 2),
        14.0, Math.sin(a) * 5.4, -10.0 + Math.cos(a) * 5.4));
    }

    /* Откидные крышки линз в боевом положении прижаты к трубе сбоку, а не
       подняты над прицелом: поднятая крышка закрывала обзор в прицеле. */
    for (const [z, nm] of [[Z0 + 2.0, 'capFront'], [Z1 - 2.0, 'capRear']]) {
      P.add(nm, 'poly', tr(rz(lathe([{ r: 0, z: 0 }, { r: R_OUT + 0.4, z: 0 },
        { r: R_OUT + 0.4, z: 1.5, s: true }, { r: 0, z: 1.5 }], 34, true), PI / 2),
        -(R_OUT + 2.2), 0, z));
      P.add(nm + 'Hinge', 'poly', tr(cylX(2.0, 2.0, -(R_OUT + 3.0), -(R_OUT + 0.5), 14), 0, 0, z));
    }

    P.add('mountPost', 'anod', boxC(0, -OPT_Y / 2 + 2, 0, 24, OPT_Y - 6, 44, 2.4, 0.4));
    P.add('mountFoot', 'anod', boxC(0, -OPT_Y + 4.0, 0, 26, 8.0, 52, 2.0, 0.4));
    P.add('mountRing', 'anod', tube(R_OUT, R_OUT + 3.4, -14, 14, 40));
    P.add('mountRingSplit', 'anod', boxC(0, -R_OUT - 3.0, 0, 9.0, 8.0, 28, 1.0, 0.3));
    for (const z of [-11, 11]) P.add('ringScrew', 'steel', tr(rx(capScrew(3.0, 7, 1.5), PI), 0, -R_OUT - 6.4, z));
    P.add('reticle', 'reticle', tr(reticleShapes([{ k: 'dot', x: 0, y: 0, r: 0.30 }], 0), 0, 0, Z0 + 7.0));

    liftAll(P.list, OPT_Y);
    for (const p of railClamp({ len: 52, style: 'qd', side: -1, lugs: [-10.16, 0, 10.16], base: 4.2, width: 26 }))
      P.add(p.name, p.mat, p.geo);

    return { parts: P.list, meta: {
      slot: 'optic', name: 'Коллиматор T-2', short: 'T-2', opticY: OPT_Y,
      /* коллиматор безпараллаксный: глаз может стоять где угодно позади */
      ocularZ: Z1, eyeRelief: 210, eyeBox: 40, eyeZ: Z1 + 210,
      exitPupil: 62, magnify: 1, glass: ['lensFront', 'lensRear'],
      /* внутренний диаметр трубы — из него считается «тоннель» в прицеле */
      tubeInner: R_IN - 0.4, tubeFrontZ: Z0,
      reticle: { part: 'reticle', color: O.color, moa: 2 }, weight: 145, zeroClickMOA: 0.5,
      stats: { adsSpeed: -4, precision: 8, hipSpread: 0 }, foldIrons: true } };
  };

  /* ==================================================================
     2. Голографический прицел EXPS3: тоннель 52x54, окно 33x23
     ================================================================== */
  OUT.holo_exps3 = function (o) {
    const O = Object.assign({ color: 'red' }, o || {});
    const P = bag();
    const MH = 12, OPT_Y = 35, SH_W = 52, SH_H = 54, WW = 33, WH = 23, WR = 3;
    const Z0 = -34, Z1 = 54, CY = SH_H / 2;

    const outer = G.round([[-SH_W / 2, -SH_H / 2], [SH_W / 2, -SH_H / 2],
      [SH_W / 2, SH_H / 2], [-SH_W / 2, SH_H / 2]], 5);
    const win = G.round([[-WW / 2, OPT_Y - CY - WH / 2], [WW / 2, OPT_Y - CY - WH / 2],
      [WW / 2, OPT_Y - CY + WH / 2], [-WW / 2, OPT_Y - CY + WH / 2]], WR);
    P.add('shell', 'anodMatt', tr(extrude({ outer, holes: [win] }, { z0: Z0, z1: Z1, ch: 0.6 }), 0, MH + CY, 0));

    for (let i = 0; i < 3; i++)
      P.add('ribTop', 'anodMatt', boxC(0, MH + SH_H + 0.4, 6 + i * 12, SH_W - 6, 2.2, 3.2, 0.6, 0.2));
    P.add('ribSpine', 'anodMatt', boxC(0, MH + SH_H + 0.6, 12, 10, 2.4, 70, 1.0, 0.3));
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++)
      P.add('vent', 'anodMatt', boxC(s * (SH_W / 2 + 0.3), 20 + i * 6, 30, 1.6, 4.5, 22, 0.4, 0.1));

    P.add('window', 'glassAR', tr(rx(C.boxZ(-WW / 2 + 0.6, -WH / 2 + 0.6, WW / 2 - 0.6, WH / 2 - 0.6,
      -1.1, 1.1, WR - 0.6, 0.2), D(6)), 0, MH + OPT_Y, -30));
    P.add('windowRear', 'glass', tr(C.boxZ(-WW / 2 + 1.4, -WH / 2 + 1.4, WW / 2 - 1.4, WH / 2 - 1.4,
      -0.7, 0.7, WR - 1, 0.2), 0, MH + OPT_Y, 44));
    P.add('reticle', 'reticle', tr(reticleShapes([{ k: 'ring', r: 5.9, w: 0.42 },
      { k: 'dot', x: 0, y: 0, r: 0.22 }], 0), 0, MH + OPT_Y, -29));

    P.addAll(turret([0, MH + SH_H, 40], 'up', { r: 6.0, h: 5.0, clicks: 10, mat: 'anodMatt' }));
    P.addAll(turret([SH_W / 2, MH + 30, 40], 'right', { r: 6.0, h: 5.0, clicks: 10, mat: 'anodMatt' }));

    P.add('battBody', 'anodMatt', boxC(0, MH + 19.5, -27, 25, 15, 30, 2.5, 0.4));
    for (const p of batteryCap(5.6, 0, 3.4, 'anodMatt'))
      P.add(p.name, p.mat, tr(rx(p.geo, -PI / 2), 0, MH + 19.5, -43.0));

    P.add('btnBoss', 'anodMatt', tr(ry(boxC(0, 0, 0, 16, 30, 4, 2.5, 0.4), PI / 2), -SH_W / 2 - 0.6, MH + 24, 34));
    for (const dz of [-5.5, 5.5])
      P.add('button', 'rubber', tr(rz(padButton(4.6, 0, 1.6, [0, 0, 0]), PI / 2), -SH_W / 2 - 1.0, MH + 24, 34 + dz));

    P.add('mountBody', 'anodMatt', boxC(0, MH / 2 + 2.2, 0, 28, MH - 3.4, 60, 2.0, 0.4));
    for (const p of railClamp({ len: 58, style: 'qd', side: -1, lugs: [-10.16, 0, 10.16], base: 4.4, width: 26 }))
      P.add(p.name, p.mat, p.geo);

    return { parts: P.list, meta: {
      slot: 'optic', name: 'Голографический EXPS3', short: 'EXPS3', opticY: MH + OPT_Y,
      ocularZ: Z1, eyeRelief: 200, eyeBox: 46, eyeZ: Z1 + 200,
      exitPupil: 70, magnify: 1, glass: ['window', 'windowRear'],
      windowW: WW, windowH: WH,
      reticle: { part: 'reticle', color: O.color, moa: 68 }, weight: 320, zeroClickMOA: 0.5,
      stats: { adsSpeed: -6, precision: 10, hipSpread: 0 }, foldIrons: true } };
  };

  /* ==================================================================
     3. Мини-коллиматор RMR: открытый, ставится на затвор или на 45°
     ================================================================== */
  OUT.reddot_rmr = function (o) {
    const O = Object.assign({ color: 'red', lowMount: true }, o || {});
    const P = bag();
    const BASE = O.lowMount ? 2.2 : 7.0, OPT_Y = BASE + 13.6, W = 25.6, L = 45.0;

    for (const s of [-1, 1]) {
      const side = [[-L / 2, BASE], [L / 2 - 2, BASE], [L / 2 - 1, BASE + 6],
        [L / 2 - 2.5, BASE + 20], [-L / 2 + 4, BASE + 21.5], [-L / 2, BASE + 12]];
      P.add('body', 'anod', tr(plateZY(side, 0, 3.4), s * (W / 2 - 1.7), 0, 0));
    }
    P.add('bridge', 'anod', boxC(0, BASE + 19.5, L / 2 - 4.0, W, 4.2, 7.0, 1.4, 0.3));
    P.add('floor', 'anod', boxC(0, BASE + 1.6, 0, W, 3.2, L - 3, 1.4, 0.3));
    P.add('window', 'glassAR', tr(rx(C.boxZ(-9.5, -7.5, 9.5, 7.5, -0.6, 0.6, 1.6, 0.2), D(8)), 0, OPT_Y, -6.0));
    P.add('reticle', 'reticle', tr(reticleShapes([{ k: 'dot', r: 0.26 }], 0), 0, OPT_Y, -5.2));
    P.addAll(turret([0, BASE + 21.5, -14], 'up', { r: 4.2, h: 3.4, clicks: 8 }));
    P.addAll(turret([W / 2 - 1.2, OPT_Y - 2, -14], 'right', { r: 4.2, h: 3.4, clicks: 8 }));
    P.add('battTray', 'anod', boxC(0, BASE + 0.8, -L / 2 + 8, 17, 2.6, 15, 1.2, 0.2));
    for (const z of [-12, 12]) {
      P.add('rmrPin', 'steel', tr(cylY(2.0, 2.0, BASE - 3.2, BASE, 14), 0, 0, z));
      P.add('rmrScrew', 'steel', tr(rx(capScrew(3.0, 6.5, 1.4), PI), 0, BASE + 4.6, z + (z > 0 ? -5 : 5)));
    }
    if (!O.lowMount)
      for (const p of railClamp({ len: 38, style: 'crossbolt', side: 1, lugs: [0], base: 3.4, width: 24 }))
        P.add(p.name, p.mat, p.geo);

    return { parts: P.list, meta: {
      slot: 'optic', name: 'Мини-коллиматор RMR', short: 'RMR', opticY: OPT_Y,
      ocularZ: L / 2, eyeRelief: 220, eyeBox: 60, eyeZ: L / 2 + 220,
      exitPupil: 999, magnify: 1, glass: ['window'],
      reticle: { part: 'reticle', color: O.color, moa: 3.25 }, weight: 32, zeroClickMOA: 1,
      stats: { adsSpeed: -1, precision: 5, hipSpread: 0 }, foldIrons: false, canBeOffset: true } };
  };

  /* ==================================================================
     4. Прицел 1-6x24: труба Ø30, кольца, кольцо кратности, сетка с падением
     ================================================================== */
  OUT.scope_1_6x = function (o) {
    const O = Object.assign({ mag: 4 }, o || {});
    const P = bag();
    const OPT_Y = 38.0, R_T = 15.0, R_OBJ = 21.0, R_OC = 20.0, Z_OBJ = -118, Z_OC = 112;

    P.add('objBell', 'anod', lathe([
      { r: R_OBJ - 1.2, z: Z_OBJ }, { r: R_OBJ, z: Z_OBJ }, { r: R_OBJ, z: Z_OBJ + 26, s: true },
      { r: R_T, z: Z_OBJ + 44, s: true }, { r: R_T, z: Z_OBJ + 52 }, { r: R_T - 1.4, z: Z_OBJ + 52 },
      { r: R_T - 1.4, z: Z_OBJ + 44, s: true }, { r: R_OBJ - 1.2, z: Z_OBJ + 26, s: true }], 44, true));
    P.add('tube', 'anod', tube(R_T - 1.4, R_T, Z_OBJ + 52, 46, 44));
    P.add('ocBell', 'anod', lathe([
      { r: R_T - 1.4, z: 46 }, { r: R_T, z: 46 }, { r: R_OC, z: 70, s: true },
      { r: R_OC, z: Z_OC - 8, s: true }, { r: R_OC + 1.4, z: Z_OC - 6, s: true },
      { r: R_OC + 1.4, z: Z_OC }, { r: R_OC - 2.0, z: Z_OC },
      { r: R_OC - 2.0, z: Z_OC - 6, s: true }, { r: R_T - 1.4, z: 70, s: true }], 44, true));
    P.add('lensObj', 'glassAR', tr(lens(R_OBJ - 2.0, 5.5, 1.8, 1.0, 34), 0, 0, Z_OBJ + 6));
    P.add('lensOc', 'glass', tr(lens(R_OC - 3.0, 4.0, 0.9, 1.4, 32), 0, 0, Z_OC - 8));
    P.add('lensErector', 'glass', tr(lens(R_T - 4.0, 3.0, 0.8, 0.8, 26), 0, 0, -20));

    P.add('magRing', 'anodMatt', lathe([{ r: R_T - 1.0, z: 58 }, { r: R_OC - 1.0, z: 58 },
      { r: R_OC - 1.0, z: 80, s: true }, { r: R_T - 1.0, z: 80 }], 40, true));
    P.addAll(knurlBand({ r: R_OC - 0.9, z0: 60, z1: 78, n: 40, depth: 0.45, mat: 'anodMatt' }));
    P.add('magLever', 'anod', tr(rz(boxC(0, 9.0, 0, 5.0, 18.0, 6.0, 1.4, 0.3), D(-28)), 0, R_OC - 2, 69));
    for (let i = 1; i <= 6; i++) {
      const a = D(-60 + i * 22);
      P.add('magMark', 'mark', tr(cyl(0.4, 0.4, 0, 1.0, 8, true),
        Math.sin(a) * (R_OC - 0.5), Math.cos(a) * (R_OC - 0.5), 82));
    }

    P.add('turretBoss', 'anod', tr(lathe([{ r: 0, z: 0 }, { r: 19.0, z: 0 },
      { r: 19.0, z: 24, s: true }, { r: 0, z: 24 }], 34, true), 0, 0, -30));
    P.addAll(turret([0, 18.0, -18], 'up', { r: 8.5, h: 11.0, clicks: 16 }));
    P.addAll(turret([18.0, 0, -18], 'right', { r: 8.0, h: 10.0, clicks: 16 }));
    P.addAll(turret([-18.0, 0, -18], 'left', { r: 7.0, h: 7.0, clicks: 8 }));

    P.add('eyecup', 'rubber', tr(lathe([{ r: R_OC - 2.0, z: 0 }, { r: R_OC + 1.8, z: 0 },
      { r: R_OC + 1.8, z: 10, s: true }, { r: R_OC - 1.0, z: 12 }, { r: R_OC - 3.0, z: 12 },
      { r: R_OC - 3.0, z: 2, s: true }], 40, true), 0, 0, Z_OC));
    P.add('sunshade', 'anod', tube(R_OBJ - 1.2, R_OBJ, Z_OBJ - 26, Z_OBJ, 40));

    const ret = [
      { k: 'bar', x0: -6.2, y0: -0.10, x1: -0.7, y1: 0.10 },
      { k: 'bar', x0: 0.7, y0: -0.10, x1: 6.2, y1: 0.10 },
      { k: 'bar', x0: -0.10, y0: 0.7, x1: 0.10, y1: 6.2 },
      { k: 'dot', x: 0, y: 0, r: 0.13 }];
    for (let i = 1; i <= 5; i++) {
      const y = -0.9 - i * 0.95, w = 0.95 - i * 0.11;
      ret.push({ k: 'bar', x0: -w, y0: y - 0.07, x1: w, y1: y + 0.07 });
    }
    for (const s of [-1, 1]) for (let i = 1; i <= 4; i++)
      ret.push({ k: 'bar', x0: s * i * 1.6 - 0.07, y0: -0.45, x1: s * i * 1.6 + 0.07, y1: 0.45 });
    P.add('reticle', 'reticle', tr(reticleShapes(ret, 0), 0, 0, 40));

    for (const z of [-60, 20]) {
      P.add('ring', 'anod', tr(tube(R_T, R_T + 4.2, -9, 9, 36), 0, 0, z));
      P.add('ringFoot', 'anod', boxC(0, -R_T - 6.0, z, 24, 8.0, 20, 1.6, 0.3));
      for (const s of [-1, 1]) {
        P.add('ringScrew', 'steel', tr(rx(capScrew(3.4, 8, 1.6), PI), s * 9.0, -R_T - 9.2, z));
        P.add('ringScrewTop', 'steel', tr(capScrew(3.4, 8, 1.6), s * 9.0, R_T + 1.2, z));
      }
    }
    P.add('mountBar', 'anod', boxC(0, -R_T - 11.0, -20, 26, 6.0, 108, 1.6, 0.3));
    liftAll(P.list, OPT_Y);
    for (const p of railClamp({ len: 104, style: 'crossbolt', side: 1, lugs: [-30, -10, 10, 30], base: 4.4, width: 26 }))
      P.add(p.name, p.mat, tr(p.geo, 0, 0, -20));

    return { parts: P.list, meta: {
      slot: 'optic', name: 'Прицел 1-6x24', short: '1-6x', opticY: OPT_Y,
      /* кратный прицел: жёсткое удаление зрачка ~90 мм за окуляром */
      ocularZ: Z_OC, eyeRelief: 95, eyeBox: 14, eyeZ: Z_OC + 95,
      exitPupil: 88, fov: 10.5, magnify: O.mag, magRange: [1, 6],
      tubeInner: R_OC - 3.0, tubeFrontZ: Z_OBJ,
      glass: ['lensObj', 'lensOc', 'lensErector'], reticle: { part: 'reticle', color: 'red', moa: 0.8 },
      weight: 620, zeroClickMOA: 0.25, stats: { adsSpeed: -14, precision: 26, hipSpread: 6 },
      foldIrons: true, scopeShadow: true } };
  };

  /* ==================================================================
     5. ПСО-1 4×24 на боковом кронштейне «ласточкин хвост»
     ================================================================== */
  OUT.scope_pso1 = function () {
    const P = bag();
    const OPT_Y = 60.0, R_T = 17.0, R_OBJ = 19.0, Z_OBJ = -128, Z_OC = 96;

    P.add('objBell', 'anodMatt', lathe([
      { r: R_OBJ - 1.4, z: Z_OBJ }, { r: R_OBJ, z: Z_OBJ }, { r: R_OBJ, z: Z_OBJ + 60, s: true },
      { r: R_T, z: Z_OBJ + 70, s: true }, { r: R_T, z: Z_OBJ + 76 }, { r: R_T - 1.5, z: Z_OBJ + 76 },
      { r: R_T - 1.5, z: Z_OBJ + 70, s: true }, { r: R_OBJ - 1.4, z: Z_OBJ + 60, s: true }], 40, true));
    P.add('tube', 'anodMatt', tube(R_T - 1.5, R_T, Z_OBJ + 76, 60, 40));
    P.add('ocBell', 'anodMatt', lathe([{ r: R_T - 1.5, z: 60 }, { r: R_T, z: 60 },
      { r: 19.5, z: 74, s: true }, { r: 19.5, z: Z_OC, s: true }, { r: 16.5, z: Z_OC },
      { r: 16.5, z: 74, s: true }], 40, true));
    P.add('lensObj', 'glassAR', tr(lens(R_OBJ - 2.4, 5.0, 1.6, 0.9, 32), 0, 0, Z_OBJ + 7));
    P.add('lensOc', 'glass', tr(lens(15.5, 3.6, 0.8, 1.2, 30), 0, 0, Z_OC - 7));
    P.add('eyecup', 'rubber', tr(lathe([{ r: 16.0, z: 0 }, { r: 21.0, z: 0 },
      { r: 21.0, z: 14, s: true }, { r: 17.5, z: 16 }, { r: 15.0, z: 16 },
      { r: 15.0, z: 2, s: true }], 36, true), 0, 0, Z_OC));

    P.add('turretHousing', 'anodMatt', boxC(0, 6.0, -34, 30, 24, 34, 3.0, 0.5));
    P.addAll(turret([0, 19.0, -34], 'up', { r: 10.5, h: 14.0, clicks: 10, mat: 'anodMatt' }));
    P.addAll(turret([16.0, 2.0, -34], 'right', { r: 9.5, h: 12.0, clicks: 10, mat: 'anodMatt' }));
    P.add('illumBody', 'anodMatt', tr(ry(lathe([{ r: 0, z: 0 }, { r: 9.0, z: 0 },
      { r: 9.0, z: 26, s: true }, { r: 7.4, z: 28 }, { r: 0, z: 28 }], 28, true), -PI / 2), -14.0, -2.0, -34));
    P.add('illumSwitch', 'poly', tr(boxC(0, 0, 0, 5.0, 9.0, 5.0, 1.0, 0.2), -42.0, 2.0, -34));
    P.add('sunFilter', 'poly', tr(rx(tube(11.0, R_OBJ - 1.0, 0, 2.4, 30), D(-70)), 0, R_OBJ + 8, Z_OBJ + 2));
    P.add('filterArm', 'anodMatt', tr(boxC(0, 0, 0, 3.0, 14.0, 3.0, 0.8, 0.2), 0, R_OBJ + 3, Z_OBJ + 8));

    const ret = [{ k: 'chevron', x: 0, y: 0, w: 0.16, h: 1.15 }];
    for (let i = 1; i <= 3; i++) ret.push({ k: 'chevron', x: 0, y: -1.5 * i, w: 0.13, h: 0.72 });
    for (const s of [-1, 1]) for (let i = 1; i <= 5; i++)
      ret.push({ k: 'bar', x0: s * i * 1.05 - 0.07, y0: 0, x1: s * i * 1.05 + 0.07, y1: i % 2 ? 0.38 : 0.60 });
    for (let i = 0; i < 7; i++) {
      const x = -6.4 + i * 0.52;
      ret.push({ k: 'bar', x0: x - 0.05, y0: -2.0, x1: x + 0.05, y1: -2.0 + 0.36 + i * 0.075 });
    }
    ret.push({ k: 'bar', x0: -6.6, y0: -2.06, x1: -3.0, y1: -1.94 });
    P.add('reticle', 'reticle', tr(reticleShapes(ret, 0), 0, 0, 30));

    P.add('mountBody', 'anodMatt', tr(boxC(0, 0, 0, 16, 46, 72, 3.0, 0.5), -16.0, -OPT_Y + 26, -18));
    P.add('mountArm', 'anodMatt', tr(boxC(0, 0, 0, 30, 14, 40, 2.4, 0.4), -6.0, -OPT_Y + 46, -18));
    P.add('mountDovetail', 'steelDk', tr(rz(boxC(0, 0, 0, 12, 10, 68, 1.0, 0.3), D(6)), -24.0, -OPT_Y + 14, -18));
    P.add('mountLever', 'steel', tr(cylX(4.0, 4.0, -34, -18, 18), 0, -OPT_Y + 12, 6));
    P.add('mountLeverArm', 'anodMatt', tr(boxC(0, 0, 0, 5.0, 26.0, 8.0, 1.6, 0.3), -32.0, -OPT_Y + 22, 6));
    for (const z of [-40, 4]) P.add('mountRing', 'anodMatt', tr(tube(R_T, R_T + 4.0, -8, 8, 34), 0, 0, z));

    liftAll(P.list, OPT_Y);
    return { parts: P.list, meta: {
      /* ПСО-1 продаётся вместе со своим кронштейном под «ласточкин хвост»,
         поэтому он не садится на планку Пикатинни, а занимает отдельный
         слот бокового крепления оружия. */
      slot: 'sideoptic', name: 'ПСО-1 4×24', short: 'ПСО-1', opticY: OPT_Y,
      /* ПСО-1: наглазник задаёт посадку глаза в 70 мм за окуляром */
      ocularZ: Z_OC + 16, eyeRelief: 70, eyeBox: 12, eyeZ: Z_OC + 86,
      exitPupil: 68, fov: 6.0, magnify: 4, glass: ['lensObj', 'lensOc'],
      tubeInner: 15.0, tubeFrontZ: Z_OBJ,
      reticle: { part: 'reticle', color: 'red', moa: 0.6 }, weight: 580, zeroClickMOA: 0.34,
      mountType: 'sidemount', stats: { adsSpeed: -18, precision: 30, hipSpread: 8 },
      foldIrons: false, scopeShadow: true } };
  };

  /* ==================================================================
     6. Магнифер 3x на откидном кронштейне
     ================================================================== */
  OUT.magnifier_3x = function () {
    const P = bag();
    const OPT_Y = 22.3, R = 17.5, Z0 = -40, Z1 = 40;
    P.add('body', 'anod', lathe([{ r: R - 1.6, z: Z0 }, { r: R, z: Z0 },
      { r: R, z: Z0 + 10, s: true }, { r: R - 0.8, z: Z0 + 13, s: true },
      { r: R - 0.8, z: Z1 - 16, s: true }, { r: R, z: Z1 - 13, s: true },
      { r: R, z: Z1 }, { r: R - 1.6, z: Z1 }], 42, true));
    P.add('lensFront', 'glassAR', tr(lens(R - 3.0, 4.2, 1.3, 0.8, 30), 0, 0, Z0 + 6));
    P.add('lensRear', 'glass', tr(lens(R - 3.4, 3.4, 0.7, 1.1, 30), 0, 0, Z1 - 7));
    P.add('diopterRing', 'anodMatt', lathe([{ r: R - 0.7, z: Z1 - 14 }, { r: R + 1.2, z: Z1 - 14 },
      { r: R + 1.2, z: Z1 - 2, s: true }, { r: R - 0.7, z: Z1 - 2 }], 36, true));
    P.addAll(knurlBand({ r: R + 1.25, z0: Z1 - 12, z1: Z1 - 4, n: 34, depth: 0.4, mat: 'anodMatt' }));
    P.add('eyecup', 'rubber', tube(R - 2.0, R + 1.0, Z1, Z1 + 6, 36));
    P.add('mountRing', 'anod', tube(R, R + 3.6, -12, 12, 34));
    P.add('mountArm', 'anod', tr(boxC(0, 0, 0, 9.0, OPT_Y + 4, 22, 1.8, 0.3), -(R + 6.0), -OPT_Y / 2 + 2, 0));
    P.add('flipPivot', 'steel', tr(cylY(3.2, 3.2, -OPT_Y + 2, 6, 18), -(R + 6.0), 0, 0));
    P.add('flipLatch', 'steel', tr(boxC(0, 0, 0, 5.0, 6.0, 16, 1.0, 0.2), R + 5.0, -OPT_Y + 8, 0));
    P.add('mountBase', 'anod', tr(boxC(0, 0, 0, 26, 7.0, 54, 1.8, 0.3), 0, -OPT_Y + 3.5, 0));
    liftAll(P.list, OPT_Y);
    for (const p of railClamp({ len: 54, style: 'thumb', side: 1, lugs: [-10.16, 10.16], base: 4.0, width: 26 }))
      P.add(p.name, p.mat, p.geo);

    return { parts: P.list, meta: {
      slot: 'magnifier', name: 'Магнифер 3x', short: '3x', opticY: OPT_Y, magnify: 3,
      glass: ['lensFront', 'lensRear'], weight: 260,
      flipAxis: { pivot: [-(R + 6.0), OPT_Y, 0], axis: 'y', angle: 90 },
      pivotParts: ['body', 'lensFront', 'lensRear', 'diopterRing', 'eyecup', 'mountRing', 'flipLatch'],
      stats: { adsSpeed: -6, precision: 12, hipSpread: 0 } } };
  };

  /* ==================================================================
     7. Складная механика BUIS: целик с диоптром / мушка в подкове
     ================================================================== */
  OUT.irons_buis = function (o) {
    const O = Object.assign({ which: 'rear' }, o || {});
    const P = bag();
    const H = 36.0;
    P.add('base', 'anod', boxC(0, 3.0, 0, 20, 6.0, 26, 1.4, 0.3));
    P.add('hinge', 'steel', tr(cylX(2.6, 2.6, -8, 8, 16), 0, 6.5, 10.0));

    if (O.which === 'rear') {
      for (const s of [-1, 1])
        P.add('ear', 'anod', tr(plateZY([[-9, 6], [9, 6], [7, H], [4, H + 3], [-4, H + 3], [-7, H]], 0, 2.6), s * 7.0, 0, 0));
      P.add('aperture', 'anod', tr(tube(2.1, 5.2, -1.4, 1.4, 28), 0, H - 4, 0));
      P.add('apertureBig', 'anod', tr(tube(3.6, 6.4, -1.4, 1.4, 28), 0, H - 4, 9.0));
      P.add('windageKnob', 'steelDk', tr(cylX(3.6, 3.6, 9.4, 13.0, 18), 0, H - 8, 0));
      P.addAll(knurlBand({ r: 3.6, a0: 9.6, a1: 12.8, n: 16, depth: 0.28, axis: 'x', at: [0, H - 8, 0], mat: 'steelDk' }));
      P.add('detentSpring', 'steel', tr(spring(2.2, 0.5, 0, 7, 5), 0, 8.0, 6.0));
    } else {
      P.add('wing', 'anod', tr(tube(5.0, 7.2, -3.0, 3.0, 26), 0, H - 6, 0));
      for (const s of [-1, 1])
        P.add('wingLeg', 'anod', boxC(s * 5.6, H / 2 + 3, 0, 2.8, H - 10, 6.0, 0.8, 0.2));
      P.add('post', 'steelDk', tr(cylY(1.1, 0.9, H - 12, H - 2.0, 14), 0, 0, 0));
      P.add('postBase', 'steelDk', tr(cylY(2.6, 2.6, H - 14, H - 12, 16), 0, 0, 0));
    }
    for (const p of railClamp({ len: 26, style: 'crossbolt', side: 1, lugs: [0], base: 3.0, width: 20 }))
      P.add(p.name, p.mat, p.geo);

    return { parts: P.list, meta: {
      slot: O.which === 'rear' ? 'ironRear' : 'ironFront',
      name: O.which === 'rear' ? 'Складной целик' : 'Складная мушка',
      short: 'BUIS', opticY: H - 4, weight: 60,
      foldAxis: { pivot: [0, 6.5, 10.0], axis: 'x', angle: -88 },
      stats: { adsSpeed: 0, precision: 2, hipSpread: 0 } } };
  };

  /* ==================================================================
     8. Ночной монокуляр PVS-14 за коллиматором
     ================================================================== */
  OUT.nvg_pvs14 = function () {
    const P = bag();
    const OPT_Y = 22.3, R = 17.0, Z0 = -46, Z1 = 52;
    P.add('body', 'od', lathe([{ r: R - 2.0, z: Z0 }, { r: R, z: Z0 },
      { r: R, z: Z0 + 20, s: true }, { r: R + 2.6, z: Z0 + 24, s: true },
      { r: R + 2.6, z: Z1 - 26, s: true }, { r: R, z: Z1 - 22, s: true },
      { r: R, z: Z1 }, { r: R - 2.0, z: Z1 }], 40, true));
    P.add('objLens', 'glassAR', tr(lens(R - 3.4, 4.0, 1.2, 0.7, 30), 0, 0, Z0 + 6));
    P.add('ocLens', 'glass', tr(lens(R - 4.0, 3.2, 0.7, 1.0, 30), 0, 0, Z1 - 8));
    P.add('screen', 'laserIR', cyl(R - 5.0, R - 5.0, 6, 6.4, 30, true));
    P.add('gainKnob', 'od', tr(ry(cyl(5.4, 5.4, 0, 4.0, 22, true), PI / 2), R + 1.0, 0, 8));
    P.add('battTube', 'od', tr(ry(cyl(8.0, 8.0, 0, 34, 26, true), -PI / 2), -R - 4, 0, 24));
    for (const p of batteryCap(8.2, 0, 5.0, 'od'))
      P.add(p.name, p.mat, tr(ry(p.geo, -PI / 2), -R - 38, 0, 24));
    P.add('mountBase', 'od', boxC(0, -OPT_Y + 4, 0, 24, 8.0, 44, 1.6, 0.3));
    liftAll(P.list, OPT_Y);
    for (const p of railClamp({ len: 44, style: 'thumb', side: 1, lugs: [-10.16, 10.16], base: 4.0, width: 24 }))
      P.add(p.name, p.mat, p.geo);

    return { parts: P.list, meta: {
      slot: 'magnifier', name: 'Монокуляр PVS-14', short: 'PVS-14', opticY: OPT_Y,
      magnify: 1, glass: ['objLens', 'ocLens'], weight: 340, nightVision: true,
      stats: { adsSpeed: -8, precision: 4, hipSpread: 0 } } };
  };

  return OUT;
};
});

__def("muzzle", function (module, exports) {
/* ============================================================================
   Дульные устройства: пламегасители, компенсаторы, ДТК, глушители.

   Посадка: начало координат — торец дульной резьбы, ось канала по (0,0),
   устройство растёт в −Z. Метаданные:
     tip        — вылет среза от посадки (мм, отрицательный), точка вспышки;
     flash      — множитель размера дульной вспышки (0 = скрыта);
     sound      — 'normal' | 'loud' | 'suppressed';
     gasPorts   — точки боковых струй газа [x,y,z,dx,dy,dz];
     stats      — влияние на отдачу/разброс/скорость.
   ========================================================================== */
module.exports = function (G, C) {
  const { PI, TAU, D } = C;
  const { tr, rx, ry, rz, merge, extrude, lathe, cyl, tube } = G;
  const { bag, boxC, boxZ, cylX, knurlBand, threadHelix, capScrew } = C;

  const OUT = {};

  /* Резьбовая муфта: внутренняя резьба + лыски под ключ. Общая для всех. */
  function threadMount(o) {
    const O = Object.assign({ rOut: 9.6, rIn: 7.0, len: 16, flats: true, mat: 'nitride' }, o || {});
    const P = bag();
    P.add('mount', O.mat, lathe([
      { r: O.rIn, z: -O.len }, { r: O.rOut, z: -O.len }, { r: O.rOut, z: -1.2, s: true },
      { r: O.rOut + 0.6, z: 0 }, { r: O.rIn, z: 0 }], 36, true));
    /* внутренняя резьба видна с торца */
    P.add('thread', 'steelDk', threadHelix(O.rIn + 0.55, O.rIn + 0.05, -O.len + 1, -1.5, 1.0, 22));
    if (O.flats) for (const s of [-1, 1])
      P.add('wrenchFlat', O.mat, boxC(s * (O.rOut - 0.45), 0, -O.len / 2, 1.2, O.rOut * 1.5, O.len - 3, 0.3, 0.2));
    return P.list;
  }

  /* ==================================================================
     1. Классический пламегаситель-«птичья клетка» A2: 5 прорезей
     ================================================================== */
  OUT.flash_a2 = function () {
    const P = bag();
    const R = 11.0, L = 50.0, rBore = 5.6;
    P.addAll(threadMount({ rOut: R - 0.4, rIn: 7.6, len: 14 }));

    /* тело: конус с расширением к срезу */
    P.add('body', 'nitride', lathe([
      { r: rBore, z: -L }, { r: R - 0.8, z: -L }, { r: R - 0.8, z: -L + 4, s: true },
      { r: R - 1.8, z: -L + 8, s: true }, { r: R - 1.6, z: -16, s: true },
      { r: R - 0.2, z: -14 }, { r: rBore, z: -14 }], 34, true));

    /* пять прорезей: сверху и по бокам, снизу глухо (не поднимает пыль) */
    for (let i = 0; i < 5; i++) {
      const a = D(-72 + i * 36);                 // веер в верхней полусфере
      const w = 2.9;
      for (const zc of [-L + 8, -L + 18, -L + 28]) {
        P.add('tine', 'nitride', tr(rz(boxC(0, R - 1.2, zc, w, 3.0, 8.0, 0.4, 0.15), a), 0, 0, 0));
      }
    }
    /* перемычки между прорезями: кольца жёсткости */
    for (const z of [-L + 13, -L + 23, -16.5])
      P.add('ring', 'nitride', tube(R - 2.2, R - 0.6, z - 1.3, z + 1.3, 34));
    P.add('bore', 'bore', tube(rBore - 0.15, rBore, -L, 0, 30));

    return { parts: P.list, meta: {
      slot: 'muzzle', name: 'Пламегаситель A2', short: 'A2', tip: -L,
      flash: 0.55, sound: 'normal', weight: 85,
      gasPorts: [[0, 7, -L + 20, 0.4, 0.9, -0.2], [0, -7, -L + 20, 0.2, -0.9, -0.2]],
      stats: { vertRecoil: -8, horizRecoil: -4, hipSpread: 0, adsSpeed: -1, sound: 0, flashHide: 70 } } };
  };

  /* ==================================================================
     2. Дульный тормоз-компенсатор с боковыми камерами (в духе АК-74)
     ================================================================== */
  OUT.brake_ak = function () {
    const P = bag();
    const R = 11.6, L = 82.0, rBore = 5.8;
    P.addAll(threadMount({ rOut: R - 1.2, rIn: 7.2, len: 18, mat: 'park' }));

    /* передняя камера с двумя большими боковыми окнами */
    P.add('chamberFront', 'park', G.perfShell({
      rOut: R, rIn: R - 2.2,
      thetas: (() => { const t = []; for (let i = 0; i <= 64; i++) t.push(i / 64 * TAU); return t; })(),
      zs: (() => { const z = []; for (let i = 0; i <= 16; i++) z.push(-L + i * (34 / 16)); return z; })(),
      hole: (th, z) => {
        const a = ((th % TAU) + TAU) % TAU;
        const side = (a > D(50) && a < D(130)) || (a > D(230) && a < D(310));
        return side && z > -L + 6 && z < -L + 28;
      }, capFront: true, capBack: false }));

    /* задняя камера: три круглых отверстия с каждой стороны */
    P.add('chamberRear', 'park', G.perfShell({
      rOut: R, rIn: R - 2.2,
      thetas: (() => { const t = []; for (let i = 0; i <= 72; i++) t.push(i / 72 * TAU); return t; })(),
      zs: (() => { const z = []; for (let i = 0; i <= 18; i++) z.push(-L + 34 + i * (30 / 18)); return z; })(),
      hole: (th, z) => {
        const a = ((th % TAU) + TAU) % TAU;
        for (let k = 0; k < 3; k++) {
          const zc = -L + 40 + k * 9;
          for (const ac of [D(90), D(270)]) {
            const da = Math.abs(((a - ac + PI) % TAU) - PI);
            if (da < D(17) && Math.abs(z - zc) < 3.2) return true;
          }
        }
        return false;
      }, capFront: false, capBack: false }));

    /* передний обод и косой срез компенсатора */
    P.add('crown', 'park', lathe([{ r: rBore, z: -L }, { r: R + 0.6, z: -L },
      { r: R + 0.6, z: -L + 3, s: true }, { r: R, z: -L + 5 }, { r: rBore, z: -L + 5 }], 40, true));
    /* перегородка между камерами */
    P.add('baffle', 'park', tr(tube(rBore + 0.6, R - 2.0, -1.6, 1.6, 34), 0, 0, -L + 34));
    /* нижняя перемычка (компенсатор не выбрасывает газ вниз) */
    P.add('strut', 'park', boxC(0, -(R - 1.2), -L + 17, 4.0, 2.6, 26, 0.5, 0.2));
    P.add('bore', 'bore', tube(rBore - 0.15, rBore, -L, 0, 30));
    for (const s of [-1, 1])
      P.add('pinDetent', 'steel', tr(cylX(1.5, 1.5, s * (R - 2.4), s * (R + 0.4), 12), 0, 0, -8));

    return { parts: P.list, meta: {
      slot: 'muzzle', name: 'ДТК компенсатор', short: 'ДТК', tip: -L,
      flash: 1.25, sound: 'loud', weight: 195,
      gasPorts: [[10, 0, -L + 18, 0.95, 0.12, -0.28], [-10, 0, -L + 18, -0.95, 0.12, -0.28],
        [9, 0, -L + 46, 0.9, 0.2, -0.3], [-9, 0, -L + 46, -0.9, 0.2, -0.3]],
      stats: { vertRecoil: -26, horizRecoil: -18, hipSpread: 4, adsSpeed: -3, sound: 12, flashHide: -20 } } };
  };

  /* ==================================================================
     3. Линейный компенсатор («blast can») — гонит газ вперёд
     ================================================================== */
  OUT.comp_linear = function () {
    const P = bag();
    const R = 13.5, L = 62.0, rBore = 6.2;
    P.addAll(threadMount({ rOut: 10.4, rIn: 7.4, len: 15 }));
    P.add('body', 'nitride', lathe([
      { r: rBore, z: -L }, { r: R, z: -L }, { r: R, z: -L + 6, s: true },
      { r: R - 0.6, z: -L + 10, s: true }, { r: R - 0.6, z: -18, s: true },
      { r: 10.4, z: -15 }, { r: rBore, z: -15 }], 40, true));
    P.addAll(knurlBand({ r: R - 0.55, z0: -L + 14, z1: -22, n: 44, depth: 0.5, mat: 'nitride' }));
    /* конус-«воронка» внутри, который направляет газ вперёд */
    P.add('cone', 'inconel', lathe([{ r: rBore, z: -L + 4 }, { r: R - 2.4, z: -16 },
      { r: R - 1.6, z: -16 }, { r: rBore + 0.8, z: -L + 4 }], 34, true));
    P.add('bore', 'bore', tube(rBore - 0.15, rBore, -L, 0, 30));
    /* отверстия сброса газа в крыше — уводят подброс ствола вниз */
    for (let i = 0; i < 6; i++)
      P.add('port', 'bore', tr(rx(cyl(1.5, 1.5, R - 2.4, R + 0.3, 12, true), -PI / 2), 0, 0, -26 - i * 5));

    return { parts: P.list, meta: {
      slot: 'muzzle', name: 'Линейный компенсатор', short: 'LINEAR', tip: -L,
      flash: 0.9, sound: 'loud', weight: 150,
      gasPorts: [[0, 0, -L, 0, 0, -1]],
      stats: { vertRecoil: -10, horizRecoil: -6, hipSpread: 0, adsSpeed: -2, sound: 8, flashHide: 20 } } };
  };

  /* ==================================================================
     4. Быстросъёмный глушитель: корпус, перегородки, тепловой кожух
     ================================================================== */
  OUT.suppressor_qd = function (o) {
    const O = Object.assign({ baffles: 7, cover: true }, o || {});
    const P = bag();
    const R = 19.0, L = 178.0, rBore = 6.4;

    /* корпус: труба с коническим носом и утолщением у казны */
    P.add('tube', 'nitride', lathe([
      { r: R - 4.2, z: -L }, { r: R - 1.6, z: -L }, { r: R, z: -L + 10, s: true },
      { r: R, z: -22, s: true }, { r: R + 1.4, z: -18, s: true },
      { r: R + 1.4, z: -4 }, { r: R - 5.0, z: -4 }, { r: R - 5.0, z: -L + 10, s: true }], 48, true));
    /* передний торец с фаской */
    P.add('endCap', 'nitride', lathe([{ r: rBore, z: -L - 2 }, { r: R - 1.6, z: -L - 2 },
      { r: R - 1.6, z: -L + 1 }, { r: rBore + 1.2, z: -L + 4 }, { r: rBore, z: -L + 4 }], 40, true));

    /* перегородки-конусы внутри: видны через срез и определяют звук */
    const step = (L - 34) / O.baffles;
    for (let i = 0; i < O.baffles; i++) {
      const z = -20 - i * step;
      P.add('baffle', 'inconel', lathe([
        { r: rBore, z: z }, { r: R - 5.2, z: z - step * 0.62 },
        { r: R - 5.2, z: z - step * 0.62 - 1.6 }, { r: rBore, z: z - 1.6 }], 30, true));
      P.add('baffleClip', 'inconel', tr(tube(R - 5.4, R - 4.6, -1.0, 1.0, 30), 0, 0, z - step * 0.62 - 0.8));
    }
    /* «клиппинг» газа: первая расширительная камера длиннее */
    P.add('blastChamber', 'inconel', tr(tube(R - 5.2, R - 4.4, -9, 9, 32), 0, 0, -12));

    /* QD-хвостовик: байонет с зубьями под дульное устройство */
    P.add('qdCollar', 'steelDk', lathe([{ r: 9.2, z: -4 }, { r: R + 1.4, z: -4 },
      { r: R + 1.4, z: 0 }, { r: 9.2, z: 0 }], 34, true));
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      P.add('qdTooth', 'steelDk', tr(boxC(0, 0, 0, 3.4, 3.0, 5.0, 0.4, 0.15),
        Math.cos(a) * 11.0, Math.sin(a) * 11.0, -1.8));
    }
    P.addAll(knurlBand({ r: R + 1.45, z0: -17, z1: -5, n: 46, depth: 0.5, mat: 'steelDk' }));
    P.add('qdLatch', 'steel', tr(boxC(0, 0, 0, 6.0, 4.0, 14, 1.0, 0.2), 0, R + 2.0, -11));

    /* тепловой кожух-чехол с продольными прорезями */
    if (O.cover) {
      P.add('cover', 'rubber', tube(R + 0.2, R + 2.2, -L + 14, -26, 44));
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * TAU;
        P.add('coverRib', 'rubber', tr(cyl(1.1, 1.1, -L + 18, -30, 8, false),
          Math.cos(a) * (R + 2.3), Math.sin(a) * (R + 2.3), 0));
      }
    }
    P.add('bore', 'bore', tube(rBore - 0.2, rBore, -L, -4, 28));

    return { parts: P.list, meta: {
      slot: 'muzzle', name: 'Глушитель QD', short: 'SUPP', tip: -L - 2,
      flash: 0.18, sound: 'suppressed', weight: 480,
      gasPorts: [[0, 0, -L, 0, 0, -1]],
      heatHaze: true,
      stats: { vertRecoil: -14, horizRecoil: -8, hipSpread: -6, adsSpeed: -12,
        sound: -70, flashHide: 85, range: 6, velocity: 3 } } };
  };

  /* ==================================================================
     5. Компактный «моноблок» — короткий пламегаситель-хайдер
     ================================================================== */
  OUT.flash_cone = function () {
    const P = bag();
    const R = 13.0, L = 46.0, rBore = 6.0;
    P.addAll(threadMount({ rOut: 9.8, rIn: 7.2, len: 13 }));
    /* раструб-конус с тремя продольными прорезями */
    P.add('cone', 'nitride', lathe([
      { r: rBore, z: -L }, { r: R, z: -L }, { r: R - 1.0, z: -L + 3, s: true },
      { r: 9.9, z: -14, s: true }, { r: 9.9, z: -13 }, { r: rBore, z: -13 }], 42, true));
    for (let i = 0; i < 3; i++) {
      const a = D(90 + i * 120);
      P.add('slot', 'nitride', tr(rz(boxC(0, R - 1.6, -L + 12, 2.6, 3.2, 20, 0.4, 0.15), a), 0, 0, 0));
    }
    P.add('crown', 'nitride', lathe([{ r: R - 1.4, z: -L - 1.5 }, { r: R + 0.4, z: -L - 1.5 },
      { r: R + 0.4, z: -L + 1 }, { r: R - 1.4, z: -L + 1 }], 42, true));
    P.add('bore', 'bore', tube(rBore - 0.15, rBore, -L, 0, 28));

    return { parts: P.list, meta: {
      slot: 'muzzle', name: 'Конусный пламегаситель', short: 'CONE', tip: -L - 1.5,
      flash: 0.4, sound: 'normal', weight: 96,
      gasPorts: [[0, 8, -L + 10, 0.2, 0.9, -0.3]],
      stats: { vertRecoil: -5, horizRecoil: -3, hipSpread: -2, adsSpeed: -1, sound: 0, flashHide: 80 } } };
  };

  /* ==================================================================
     6. Голый ствол: защитная гайка на резьбу
     ================================================================== */
  OUT.thread_cap = function () {
    const P = bag();
    P.add('cap', 'nitride', lathe([{ r: 6.0, z: -12 }, { r: 9.2, z: -12 },
      { r: 9.2, z: -1.0, s: true }, { r: 8.4, z: 0 }, { r: 6.0, z: 0 }], 30, true));
    P.addAll(knurlBand({ r: 9.25, z0: -10.5, z1: -2.0, n: 26, depth: 0.42, mat: 'nitride' }));
    P.add('bore', 'bore', tube(5.85, 6.0, -12, 0, 26));
    return { parts: P.list, meta: {
      slot: 'muzzle', name: 'Дульная гайка', short: 'CAP', tip: -12,
      flash: 1.0, sound: 'loud', weight: 22, gasPorts: [],
      stats: { vertRecoil: 0, horizRecoil: 0, hipSpread: 0, adsSpeed: 2, sound: 0, flashHide: 0 } } };
  };

  return OUT;
};
});

__def("tactical", function (module, exports) {
/* ============================================================================
   Тактические модули: фонарь, лазерный целеуказатель, комбо-блок,
   передние рукоятки, упор кисти, сошки.

   Посадка: начало координат — центр верхней плоскости планки Пикатинни.
   Для нижних слотов оружие само поворачивает модуль на 180° вокруг Z,
   поэтому все модули строятся в «нормальной» ориентации (вверх от планки).
   ========================================================================== */
module.exports = function (G, C) {
  const { PI, TAU, D } = C;
  const { tr, rx, ry, rz, merge, lathe, cyl, tube, loft } = G;
  const { bag, boxC, boxZ, plateZY, cylX, cylY, sphere, railClamp, capScrew,
    knurlBand, lens, batteryCap, padButton, spring } = C;

  const OUT = {};

  /* Единая система: модуль растёт в +Y от плоскости планки, зажим смотрит в −Y.
     Нижние модули (рукоятки, сошки) удобнее строить «свисающими», поэтому после
     сборки их тело разворачивается на 180° вокруг Z. Слот нижней планки сам
     повернёт готовый модуль обратно вниз. */
  const flipUp = (list) => { for (const p of list) G.transform(p.geo, G.mRotZ(PI)); return list; };

  /* Хвостовик фонаря: колпачок с накаткой, резиновая кнопка, гнездо выноса. */
  function tailCap(r, z0, len, mat) {
    const P = bag();
    P.add('tailBody', mat || 'anod', lathe([
      { r: 0, z: z0 }, { r: r, z: z0 }, { r: r, z: z0 + len - 2.5, s: true },
      { r: r - 1.6, z: z0 + len }, { r: 0, z: z0 + len }], 30, true));
    P.addAll(knurlBand({ r: r + 0.05, z0: z0 + 1.5, z1: z0 + len - 3.5, n: 24, depth: 0.36, mat: mat || 'anod' }));
    P.add('tailButton', 'rubber', tr(lathe([{ r: 0, z: 0 }, { r: r - 2.6, z: 0 },
      { r: r - 3.2, z: 1.8, s: true }, { r: 0, z: 2.4 }], 24, true), 0, 0, z0 + len));
    P.add('remotePort', 'steelDk', tr(ry(cyl(2.6, 2.6, 0, 3.4, 16, true), PI / 2), r - 0.8, 0, z0 + len * 0.45));
    return P.list;
  }

  /* ==================================================================
     1. Тактический фонарь: безель-корона, параболический рефлектор, LED
     ================================================================== */
  OUT.light_tac = function (o) {
    const O = Object.assign({ mat: 'anod' }, o || {});
    const P = bag();
    const Y = 30.0, R_HEAD = 15.4, R_BODY = 11.6, Z_LENS = -66, Z_TAIL = 34;

    P.add('bezel', O.mat, lathe([
      { r: R_HEAD - 3.0, z: Z_LENS }, { r: R_HEAD, z: Z_LENS },
      { r: R_HEAD, z: Z_LENS + 6, s: true }, { r: R_HEAD - 0.8, z: Z_LENS + 9, s: true },
      { r: R_HEAD - 0.8, z: Z_LENS + 22, s: true }, { r: R_BODY + 0.6, z: Z_LENS + 28, s: true },
      { r: R_BODY - 1.4, z: Z_LENS + 28 }, { r: R_BODY - 1.4, z: Z_LENS + 22, s: true },
      { r: R_HEAD - 3.0, z: Z_LENS + 9, s: true }], 44, true));
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      P.add('crenel', O.mat, tr(cyl(1.9, 1.5, Z_LENS - 2.6, Z_LENS, 10, true),
        Math.cos(a) * (R_HEAD - 1.6), Math.sin(a) * (R_HEAD - 1.6), 0));
    }
    const refl = [], F = 2.0;
    for (let i = 0; i <= 22; i++) { const rr = 1.4 + (R_HEAD - 4.4) * (i / 22); refl.push({ r: rr, z: Z_LENS + 20 - rr * rr / (4 * F) * 0.62, s: true }); }
    for (let i = 22; i >= 0; i--) { const rr = 1.4 + (R_HEAD - 4.4) * (i / 22); refl.push({ r: rr, z: Z_LENS + 20.6 - rr * rr / (4 * F) * 0.62, s: true }); }
    P.add('reflector', 'steel', lathe(refl, 48, true));
    P.add('lens', 'glass', tr(lens(R_HEAD - 3.2, 2.2, 0.0, 0.0, 34), 0, 0, Z_LENS + 4.6));
    P.add('led', 'lampHot', tr(cyl(1.9, 1.9, 0, 0.9, 16, true), 0, 0, Z_LENS + 19.6));
    P.add('ledBoard', 'steelDk', tr(cyl(4.4, 4.4, -0.8, 0, 20, true), 0, 0, Z_LENS + 19.6));

    P.add('body', O.mat, lathe([
      { r: R_BODY - 1.6, z: Z_LENS + 28 }, { r: R_BODY, z: Z_LENS + 28 },
      { r: R_BODY, z: Z_TAIL - 6, s: true }, { r: R_BODY + 0.8, z: Z_TAIL - 4, s: true },
      { r: R_BODY + 0.8, z: Z_TAIL }, { r: R_BODY - 1.6, z: Z_TAIL }], 40, true));
    for (let i = 0; i < 5; i++)
      P.add('fin', O.mat, tr(tube(R_BODY - 0.2, R_BODY + 1.3, -1.0, 1.0, 40), 0, 0, Z_LENS + 34 + i * 6));
    P.addAll(knurlBand({ r: R_BODY + 0.05, z0: Z_LENS + 70, z1: Z_TAIL - 8, n: 34, depth: 0.42, mat: O.mat }));
    P.addAll(tailCap(R_BODY + 0.8, Z_TAIL, 9, O.mat));

    P.add('ringMount', O.mat, tr(tube(R_BODY, R_BODY + 3.4, -9, 9, 36), 0, 0, -10));
    P.add('ringGap', O.mat, boxC(0, -R_BODY - 3.0, -10, 8.0, 7.0, 18, 1.0, 0.3));
    P.add('ringScrew', 'steel', tr(rx(capScrew(3.0, 8, 1.5), PI), 0, -R_BODY - 6.6, -10));
    P.add('mountArm', O.mat, boxC(0, -Y / 2 - 1, -10, 16, Y - 8, 22, 1.6, 0.3));
    P.add('mountFoot', O.mat, boxC(0, -Y + 4.0, -10, 24, 8.0, 40, 1.6, 0.3));
    P.add('remotePad', 'rubber', tr(boxC(0, 0, 0, 22, 4.2, 30, 3.0, 0.4), 0, -Y + 3.0, 42));
    P.add('remoteCable', 'rubber', (() => {
      const rings = [];
      for (let i = 0; i <= 18; i++) {
        const t = i / 18, z = 24 + t * 20, y = -Y + 6 + Math.sin(t * PI) * 5.5, x = (1 - t) * (R_BODY + 1.5);
        const ring = [];
        for (let k = 0; k < 7; k++) { const b = k / 7 * TAU; ring.push([x + Math.cos(b) * 1.5, y + Math.sin(b) * 1.5, z]); }
        rings.push(ring);
      }
      return loft(rings, true, true);
    })());

    const lift = G.mTrans(0, Y, 0);
    for (const p of P.list) G.transform(p.geo, lift);
    for (const p of railClamp({ len: 40, style: 'thumb', side: 1, lugs: [-10.16, 10.16], base: 4.0, width: 24 }))
      P.add(p.name, p.mat, tr(p.geo, 0, 0, -10));

    return { parts: P.list, meta: {
      slot: 'tactical', name: 'Тактический фонарь', short: 'ФОНАРЬ', weight: 168,
      emitter: { pos: [0, Y, Z_LENS + 4], dir: [0, 0, -1], type: 'light',
        hotAngle: 0.125, spillAngle: 0.40, color: 0xfff1dc, lumens: 1000 },
      toggle: ['off', 'low', 'high', 'strobe'],
      glass: ['lens'], emissive: ['led'],
      stats: { adsSpeed: -2, hipSpread: 0, stealth: -15, visibility: 40 } } };
  };

  /* ==================================================================
     2. ЛЦУ / ИК-блок: корпус 40×35×75, видимый и ИК каналы, винты пристрелки
     ================================================================== */
  OUT.laser_dbal = function (o) {
    const O = Object.assign({ mat: 'od' }, o || {});
    const P = bag();
    const BW = 40, BH = 35, BL = 75, CLAMP_H = 12.6;
    const BY = CLAMP_H + BH / 2, TOP = BY + BH / 2, EMIT_Y = BY + 4;
    const ZF = -BL / 2, ZB = BL / 2;

    P.add('body', O.mat, boxC(0, BY, 0, BW, BH, BL, 3.0, 0.8));
    /* облегчающие карманы: неглубокая утопленная панель с рамкой по контуру */
    for (const s of [-1, 1]) {
      const px = s * (BW / 2 - 0.9);
      P.add('pocket', 'anodMatt', boxC(px, BY, 2, 1.8, BH - 13, BL - 24, 3.0, 0.4));
      for (const dy of [-1, 1])
        P.add('pocketEdge', O.mat, boxC(s * (BW / 2 + 0.15), BY + dy * (BH - 12) / 2, 2, 0.9, 1.8, BL - 22, 0.4, 0.15));
      for (const dz of [-1, 1])
        P.add('pocketEdge', O.mat, boxC(s * (BW / 2 + 0.15), BY, 2 + dz * (BL - 22) / 2, 0.9, BH - 11, 1.8, 0.4, 0.15));
    }
    for (const [dx, nm, mat] of [[-9.5, 'emitVis', 'laserRed'], [9.5, 'emitIR', 'laserIR']]) {
      P.add('emitWell', O.mat, tr(cyl(7.5, 7.5, ZF, ZF + 4, 24, true), dx, EMIT_Y, 0));
      P.add('emitBore', 'bore', tr(tube(5.6, 6.0, ZF - 0.4, ZF + 3.6, 24), dx, EMIT_Y, 0));
      P.add(nm, mat, tr(cyl(3.6, 3.6, ZF + 1.0, ZF + 1.4, 20, true), dx, EMIT_Y, 0));
      P.add(nm + 'Lens', 'glassAR', tr(lens(3.9, 1.4, 0.2, 0.2, 20), dx, EMIT_Y, ZF + 2.0));
    }
    for (const [pos, dir] of [[[-9.5, TOP, ZF + 16], 'up'], [[BW / 2, EMIT_Y, ZF + 16], 'right']]) {
      const g = [cyl(4.5, 4.5, 0, 1.6, 22, true), cyl(2.5, 2.5, 1.6, 4.0, 20, true),
        boxZ(-2.3, -0.4, 2.3, 0.4, 3.6, 4.2, 0.1, 0), boxZ(-0.4, -2.3, 0.4, 2.3, 3.6, 4.2, 0.1, 0)];
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU;
        g.push(tr(cyl(0.34, 0.34, 0.2, 1.0, 8, true), Math.cos(a) * 5.6, Math.sin(a) * 5.6, 0));
      }
      let m = merge(g);
      m = dir === 'up' ? rx(m, -PI / 2) : ry(m, PI / 2);
      P.add('zeroScrew', 'steelDk', tr(m, pos[0], pos[1], pos[2]));
    }
    P.add('modeDial', 'steelDk', tr(lathe([{ r: 0, z: 0 }, { r: 8.5, z: 0 },
      { r: 8.5, z: 4.5, s: true }, { r: 7.0, z: 5.4 }, { r: 0, z: 5.4 }], 28, true), 0, BY, ZB));
    for (const k of knurlBand({ r: 8.55, z0: 0.8, z1: 4.0, n: 24, depth: 0.38, mat: 'steelDk' }))
      P.add(k.name, k.mat, tr(k.geo, 0, BY, ZB));
    P.add('modePointer', 'mark', boxC(0, BY + 6.2, ZB + 3.0, 1.4, 4.4, 1.0, 0.2, 0.1));
    for (let i = 0; i < 4; i++) {
      const a = D(-60 + i * 40);
      P.add('modeMark', 'mark', tr(cyl(0.45, 0.45, 0, 1.0, 8, true),
        Math.sin(a) * 10.5, BY + Math.cos(a) * 10.5, ZB + 0.2));
    }
    P.add('battDoor', O.mat, boxC(0, CLAMP_H + 3.0, ZB - 22, BW - 8, 5.0, 30, 2.0, 0.3));
    P.add('battScrew', 'steel', tr(rx(capScrew(3.0, 6, 1.4), PI), 0, CLAMP_H + 1.0, ZB - 34));
    P.add('pushButton', 'rubber', tr(padButton(5.0, 0, 2.0, [0, 0, 0]), -12, TOP, ZB - 12));
    P.add('remotePort', 'steelDk', tr(ry(cyl(3.0, 3.0, 0, 4.0, 16, true), -PI / 2), -BW / 2 - 2, BY - 8, ZB - 8));

    for (const p of railClamp({ len: 66, style: 'thumb', side: 1, lugs: [-20.32, -10.16, 0, 10.16], base: 4.2, width: 30 }))
      P.add(p.name, p.mat, p.geo);

    return { parts: P.list, meta: {
      slot: 'tactical', name: 'ЛЦУ / ИК-блок', short: 'ЛЦУ', weight: 260,
      emitter: { pos: [-9.5, EMIT_Y, ZF], dir: [0, 0, -1], type: 'laser',
        color: 0xff2020, divergence: 0.0006, beamR: 0.9 },
      emitterIR: { pos: [9.5, EMIT_Y, ZF], dir: [0, 0, -1], type: 'ir', color: 0x330404 },
      toggle: ['off', 'visible', 'ir', 'ir_illum'],
      glass: ['emitVisLens', 'emitIRLens'], emissive: ['emitVis', 'emitIR'],
      stats: { adsSpeed: -1, hipSpread: -22, precision: 4, stealth: -10 } } };
  };

  /* ==================================================================
     3. Комбо-блок «свет + лазер»
     ================================================================== */
  OUT.combo_light_laser = function () {
    const P = bag();
    const W = 46, H = 30, L = 82, CY = 6.0 + H / 2;

    P.add('body', 'anod', boxC(0, CY, 0, W, H, L, 3.4, 0.8));
    P.add('lightTube', 'anod', tr(lathe([{ r: 0, z: -L / 2 - 6 }, { r: 13.0, z: -L / 2 - 6 },
      { r: 13.0, z: -L / 2 + 2, s: true }, { r: 11.5, z: -L / 2 + 6 }, { r: 0, z: -L / 2 + 6 }], 34, true), -11.5, CY, 0));
    P.add('reflector', 'steel', (() => {
      const pr = [];
      for (let i = 0; i <= 18; i++) { const rr = 1.2 + 9.4 * (i / 18); pr.push({ r: rr, z: -L / 2 + 14 - rr * rr / 9, s: true }); }
      for (let i = 18; i >= 0; i--) { const rr = 1.2 + 9.4 * (i / 18); pr.push({ r: rr, z: -L / 2 + 14.5 - rr * rr / 9, s: true }); }
      return tr(lathe(pr, 40, true), -11.5, CY, 0);
    })());
    P.add('lightLens', 'glass', tr(lens(10.6, 2.0, 0, 0, 30), -11.5, CY, -L / 2 - 1.5));
    P.add('led', 'lampHot', tr(cyl(1.8, 1.8, 0, 0.8, 14, true), -11.5, CY, -L / 2 + 13.5));
    P.add('laserWell', 'anod', tr(cyl(6.8, 6.8, -L / 2 - 4, -L / 2 + 3, 24, true), 12.0, CY + 2, 0));
    P.add('laserBore', 'bore', tr(tube(4.8, 5.2, -L / 2 - 4.4, -L / 2 + 2.6, 22), 12.0, CY + 2, 0));
    P.add('laserDiode', 'laserRed', tr(cyl(3.2, 3.2, -L / 2 - 2.6, -L / 2 - 2.2, 18, true), 12.0, CY + 2, 0));
    P.add('laserLens', 'glassAR', tr(lens(3.4, 1.2, 0.2, 0.2, 18), 12.0, CY + 2, -L / 2 - 1.6));
    for (const [dx, nm] of [[-11.5, 'swLight'], [12.0, 'swLaser']])
      P.add(nm, 'rubber', tr(padButton(4.4, 0, 1.8, [0, 0, 0]), dx, CY + H / 2, L / 2 - 10));
    P.add('modeSlider', 'steelDk', boxC(0, CY + H / 2 + 1.0, L / 2 - 28, 7.0, 4.0, 16, 1.2, 0.3));
    for (const p of batteryCap(9.0, 0, 6.0, 'anod'))
      P.add(p.name, p.mat, tr(rx(p.geo, -PI / 2), 0, 6.5, L / 2 - 6));
    for (const p of railClamp({ len: 60, style: 'thumb', side: 1, lugs: [-10.16, 0, 10.16], base: 4.2, width: 30 }))
      P.add(p.name, p.mat, p.geo);

    return { parts: P.list, meta: {
      slot: 'tactical', name: 'Комбо-блок свет+лазер', short: 'КОМБО', weight: 310,
      emitter: { pos: [-11.5, CY, -L / 2 - 2], dir: [0, 0, -1], type: 'light',
        hotAngle: 0.14, spillAngle: 0.44, color: 0xfff0d8, lumens: 800 },
      emitterLaser: { pos: [12.0, CY + 2, -L / 2 - 2], dir: [0, 0, -1], type: 'laser', color: 0xff2020 },
      toggle: ['off', 'light', 'laser', 'both'],
      glass: ['lightLens', 'laserLens'], emissive: ['led', 'laserDiode'],
      stats: { adsSpeed: -3, hipSpread: -18, stealth: -18, visibility: 35 } } };
  };

  /* ==================================================================
     4. Вертикальная передняя рукоятка: колонна с «талией» и насечкой
     ================================================================== */
  OUT.grip_vertical = function (o) {
    const O = Object.assign({ mat: 'fde', len: 108 }, o || {});
    const P = bag();
    const L = O.len, TOP = -4.0;

    const rings = [], N = 26;
    for (let i = 0; i <= N; i++) {
      const t = i / N, y = TOP - t * L;
      const waist = 1 - 0.14 * Math.sin(t * PI) + 0.10 * Math.pow(t, 2.4);
      const a = 13.6 * waist, b = 15.4 * waist, ring = [];
      for (let k = 0; k < 28; k++) {
        const th = k / 28 * TAU, cs = Math.cos(th), sn = Math.sin(th), p = 2.7;
        ring.push([a * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / p), y,
          b * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p)]);
      }
      rings.push(ring);
    }
    P.add('column', O.mat, loft(rings, true, true));
    P.add('capBottom', O.mat, tr(rx(lathe([{ r: 0, z: 0 }, { r: 13.2, z: 0 },
      { r: 13.6, z: 2.6, s: true }, { r: 12.0, z: 4.4 }, { r: 0, z: 4.4 }], 30, true), PI / 2),
      0, TOP - L - 0.4, 0));
    P.add('capScrew', 'steel', tr(rx(capScrew(3.0, 7, 1.4), PI), 0, TOP - L - 4.8, 0));
    for (let i = 0; i < 14; i++) {
      const y = TOP - 14 - i * (L - 26) / 14;
      for (const sz of [-1, 1])
        P.add('grooveRib', O.mat, tr(ry(cyl(1.15, 1.15, -11.5, 11.5, 8, false), PI / 2), 0, y, sz * 14.6));
    }
    for (const sx of [-1, 1])
      P.add('fingerSwell', O.mat, tr(sphere(6.2, 14), sx * 12.0, TOP - L * 0.42, 0));
    P.add('flange', O.mat, boxC(0, TOP - 3.0, 0, 26, 7.0, 44, 2.2, 0.4));
    /* рукоятка строится «свисающей», а хранится в общей системе (тело вверх от планки) */
    flipUp(P.list);
    for (const p of railClamp({ len: 42, style: 'crossbolt', side: 1, lugs: [-10.16, 10.16], base: 0.6, width: 24 }))
      P.add(p.name, p.mat, p.geo);

    return { parts: P.list, meta: {
      slot: 'under', name: 'Вертикальная рукоятка', short: 'VFG', weight: 96,
      gripNode: [0, -(TOP - L * 0.55), 0], handPose: 'vertical', flipForUnder: true,
      stats: { vertRecoil: -12, horizRecoil: -6, hipSpread: -4, adsSpeed: -3, mobility: -2 } } };
  };

  /* ==================================================================
     5. Угловая рукоятка AFG
     ================================================================== */
  OUT.grip_angled = function (o) {
    const O = Object.assign({ mat: 'poly' }, o || {});
    const P = bag();
    const prof = [[-52, -2], [16, -2], [20, -8], [16, -34], [-16, -40], [-52, -18]];
    P.add('body', O.mat, plateZY(prof, -13.0, 13.0));
    for (let i = 0; i < 12; i++) {
      const t = i / 11, z = -44 + t * 52, y = -6 - t * 24;
      P.add('rib', O.mat, boxC(0, y, z, 26, 1.6, 2.6, 0.5, 0.15));
    }
    P.add('thumbRest', O.mat, tr(sphere(8.0, 16), 0, -6.0, 14.0));
    P.add('flange', O.mat, boxC(0, -2.2, -16, 26, 5.0, 52, 2.0, 0.4));
    flipUp(P.list);
    for (const p of railClamp({ len: 50, style: 'crossbolt', side: 1, lugs: [-10.16, 10.16], base: 0.6, width: 24 }))
      P.add(p.name, p.mat, tr(p.geo, 0, 0, -16));

    return { parts: P.list, meta: {
      slot: 'under', name: 'Угловая рукоятка', short: 'AFG', weight: 62,
      gripNode: [0, 22, -14], handPose: 'angled', flipForUnder: true,
      stats: { vertRecoil: -6, horizRecoil: -10, hipSpread: -2, adsSpeed: 2, mobility: 0 } } };
  };

  /* ==================================================================
     6. Упор кисти
     ================================================================== */
  OUT.handstop = function () {
    const P = bag();
    P.add('body', 'poly', plateZY([[-16, -2], [14, -2], [16, -10], [8, -24], [-10, -22], [-16, -10]], -11, 11));
    for (let i = 0; i < 5; i++)
      P.add('rib', 'poly', boxC(0, -8 - i * 3.0, 6 - i * 2.0, 22, 1.4, 2.2, 0.4, 0.15));
    P.add('flange', 'poly', boxC(0, -2.0, -2, 24, 4.4, 30, 1.8, 0.3));
    flipUp(P.list);
    for (const p of railClamp({ len: 28, style: 'crossbolt', side: 1, lugs: [0], base: 0.6, width: 22 }))
      P.add(p.name, p.mat, tr(p.geo, 0, 0, -2));
    return { parts: P.list, meta: {
      slot: 'under', name: 'Упор кисти', short: 'STOP', weight: 28,
      gripNode: [0, 14, -4], handPose: 'extended', flipForUnder: true,
      stats: { vertRecoil: -2, horizRecoil: -4, hipSpread: -6, adsSpeed: 3, mobility: 2 } } };
  };

  /* ==================================================================
     7. Сошки: качание, складывание, выдвижные ноги с фиксатором
     ================================================================== */
  OUT.bipod = function (o) {
    const O = Object.assign({ mat: 'anod' }, o || {});
    const P = bag();
    const PIVOT_Y = -18.0;

    P.add('head', O.mat, boxC(0, -9.0, 0, 30, 18, 46, 3.0, 0.5));
    P.add('panAxis', 'steel', tr(cylY(4.0, 4.0, -22, 4, 20), 0, 0, 0));
    P.add('tiltLock', 'steelDk', tr(cylX(5.0, 5.0, 15, 21, 18), 0, -9.0, 12));
    P.addAll(knurlBand({ r: 5.0, a0: 15.4, a1: 20.6, n: 20, depth: 0.34, axis: 'x', at: [0, -9.0, 12], mat: 'steelDk' }));
    P.add('legAxis', 'steel', tr(cylX(3.2, 3.2, -26, 26, 18), 0, PIVOT_Y, -6));

    for (const s of [-1, 1]) {
      const ox = s * 15.0;
      const legParts = [
        ['legTube', O.mat, cyl(7.0, 7.0, -96, -4, 24, true)],
        ['legTubeIn', 'bore', tube(5.4, 5.8, -95, -6, 22)],
        ['legButton', 'steelDk', tr(rx(cyl(3.6, 3.6, -8.8, -6.6, 16, true), PI / 2), 0, 0, -88)],
        ['legSpring', 'steel', spring(4.4, 0.8, -144, -99, 9)],
        ['legExt', 'steel', cyl(5.2, 5.2, -150, -92, 20, true)],
        ['foot', 'rubber', lathe([{ r: 0, z: -162 }, { r: 8.4, z: -162 },
          { r: 8.8, z: -156, s: true }, { r: 6.2, z: -150 }, { r: 0, z: -150 }], 26, true)],
        ['footTread', 'rubber', tube(5.0, 8.6, -163.4, -161.6, 26)]
      ];
      for (let i = 0; i < 5; i++)
        legParts.push(['legHole', 'bore', tr(rx(cyl(2.0, 2.0, -7.6, -6.4, 12, true), PI / 2), 0, 0, -30 - i * 14.34)]);
      for (const [n, m, g0] of legParts) {
        let g = rx(g0, -PI / 2);
        g = rz(g, s * D(12));
        P.add(n, m, tr(g, ox, PIVOT_Y, -6));
      }
      P.add('legYoke', O.mat, boxC(ox, PIVOT_Y + 4, -6, 7.0, 16, 12, 1.4, 0.3));
    }

    P.add('mountBase', O.mat, boxC(0, -2.6, 0, 26, 6.0, 48, 2.0, 0.4));
    flipUp(P.list);
    for (const p of railClamp({ len: 46, style: 'thumb', side: 1, lugs: [-10.16, 10.16], base: 0.6, width: 26 }))
      P.add(p.name, p.mat, p.geo);

    return { parts: P.list, meta: {
      slot: 'under', name: 'Сошки', short: 'СОШКИ', weight: 380, flipForUnder: true,
      deploy: { pivot: [0, -PIVOT_Y, -6], axis: 'x', foldedAngle: 86, deployedAngle: 0,
        parts: ['legTube', 'legTubeIn', 'legHole', 'legButton', 'legSpring', 'legExt', 'foot', 'footTread'] },
      heightRange: [152, 224], panRange: 32, tiltRange: 28,
      stats: { vertRecoil: -34, horizRecoil: -28, hipSpread: 14, adsSpeed: -8, mobility: -10, proneBonus: 40 } } };
  };

  return OUT;
};
});

__def("mags_stocks", function (module, exports) {
/* ============================================================================
   Магазины, приклады, цевья и боковые модули.

   Магазин: начало координат — плоскость шахты (верх магазина), корпус растёт
   вниз по −Y, изгиб задаётся радиусом. Приклад: начало — торец коробки,
   растёт в +Z. Цевьё: начало — стык со ствольной коробкой.
   ========================================================================== */
module.exports = function (G, C) {
  const { PI, TAU, D } = C;
  const { tr, rx, ry, rz, merge, extrude, lathe, cyl, tube, loft, mBasis } = G;
  const { bag, boxC, boxZ, plateZY, cylX, cylY, sphere, railStrip, railClamp,
    capScrew, knurlBand, spring, padButton, RAIL } = C;

  const OUT = {};

  /* --------------------------------------------------------------------
     Изогнутый магазин: дуга радиуса R, сечение ширина W × глубина Dz.
     cap — ёмкость, влияет на длину; window — окна контроля патронов.
     -------------------------------------------------------------------- */
  function curvedMag(o) {
    const O = Object.assign({ R: 380, len: 172, W: 26, Dz: 64, cap: 30,
      tilt: 5, mat: 'poly', window: false, ribs: 7, floorplate: true }, o || {});
    const P = bag();
    const HW = O.W / 2, HD = O.Dz / 2;
    const T0 = [-Math.sin(D(O.tilt)), -Math.cos(D(O.tilt))];
    const CEN = [O.R * T0[1], -O.R * T0[0]];
    const rot = (v, a) => [v[0] * Math.cos(a) + v[1] * Math.sin(a), -v[0] * Math.sin(a) + v[1] * Math.cos(a)];
    /* s ∈ [0..1] вдоль магазина; кадр даёт точку и нормаль дуги в (z,y) */
    function frame(s) {
      const phi = s * O.len / O.R;
      const rp = rot([-CEN[0], -CEN[1]], phi);
      return { P: [CEN[0] + rp[0], CEN[1] + rp[1]], T: rot(T0, phi) };
    }
    /* кольцо сечения магазина в мировых координатах */
    const ring = (s, shrink, nSeg) => {
      const f = frame(s), T = f.T, N = [-T[1], T[0]];
      const out = [], n = nSeg || 4;
      const w = HW * (1 - shrink * 0.10), d = HD * (1 - shrink * 0.06);
      const corners = [[-w, -d], [w, -d], [w, d], [-w, d]];
      for (const [x, v] of corners) {
        /* скругление углов — по 3 точки на угол */
        out.push([x, f.P[1] + v * N[1], f.P[0] + v * N[0]]);
        out.push([x, f.P[1] + v * N[1], f.P[0] + v * N[0]]);
      }
      return out;
    };
    /* корпус лофтом по дуге, с сужением книзу */
    const rings = [];
    const NS = 16;
    for (let i = 0; i <= NS; i++) {
      const s = i / NS;
      const f = frame(s), T = f.T, N = [-T[1], T[0]];
      const taper = 1 - 0.045 * s;
      const w = HW * taper, d = HD * taper;
      const rr = [];
      const pts = [];
      const R2 = 3.2;
      /* прямоугольник со скруглёнными углами в плоскости (x, N) */
      for (const [cx, cv, a0] of [[-w + R2, -d + R2, PI], [w - R2, -d + R2, -PI / 2],
        [w - R2, d - R2, 0], [-w + R2, d - R2, PI / 2]]) {
        for (let k = 0; k <= 4; k++) {
          const a = a0 + k / 4 * (PI / 2);
          pts.push([cx + Math.cos(a) * R2, cv + Math.sin(a) * R2]);
        }
      }
      for (const [x, v] of pts) rr.push([x, f.P[1] + v * N[1], f.P[0] + v * N[0]]);
      rings.push(rr);
    }
    P.add('magBody', O.mat, loft(rings, true, true));

    /* рёбра жёсткости поперёк корпуса */
    for (let i = 1; i <= O.ribs; i++) {
      const s = i / (O.ribs + 1);
      const f = frame(s), T = f.T, N = [-T[1], T[0]];
      const rr = [];
      for (const ds of [-0.022, 0.022]) {
        const g = frame(s + ds), Tg = g.T, Ng = [-Tg[1], Tg[0]];
        const row = [];
        const w = HW * 1.03, d = HD * 1.02;
        for (let k = 0; k < 20; k++) {
          const a = k / 20 * TAU;
          const cx = Math.cos(a) * w, cv = Math.sin(a) * d * 0.98;
          row.push([cx, g.P[1] + cv * Ng[1], g.P[0] + cv * Ng[0]]);
        }
        rr.push(row);
      }
      P.add('magRib', O.mat, loft(rr, false, false));
    }

    /* горловина: губки подачи и зацеп за шахту */
    const f0 = frame(0), N0 = [f0.T[1] * -1, f0.T[0]];
    P.add('magMouth', 'steelDk', boxC(0, -3.0, -2.0, O.W + 0.6, 8.0, O.Dz * 0.94, 2.0, 0.4));
    P.add('magLugFront', 'steelDk', boxC(0, -9.0, -HD + 3.0, O.W - 6, 10.0, 5.0, 1.0, 0.3));
    P.add('magLugRear', 'steelDk', boxC(0, -12.0, HD - 4.0, O.W - 8, 14.0, 6.0, 1.2, 0.3));

    /* окна контроля патронов */
    if (O.window) for (let i = 0; i < 4; i++) {
      const s = 0.25 + i * 0.16;
      const f = frame(s), T = f.T, N = [-T[1], T[0]];
      P.add('magWindow', 'bore', tr(rz(boxC(0, 0, 0, 3.0, 22, 8.0, 1.0, 0.2), 0),
        HW - 0.6, f.P[1], f.P[0]));
    }

    /* пятка и подаватель */
    if (O.floorplate) {
      const fe = frame(1.0), Te = fe.T, Ne = [-Te[1], Te[0]];
      P.add('magFloor', 'steelDk', tr(rz(boxC(0, 0, 0, O.W + 2.4, 6.0, O.Dz + 1.0, 2.2, 0.4),
        Math.atan2(Te[0], -Te[1])), 0, fe.P[1] - 1.0, fe.P[0]));
      P.add('magFloorLatch', 'steelDk', tr(boxC(0, 0, 0, 8.0, 4.0, 6.0, 0.8, 0.2),
        0, fe.P[1] + 4.0, fe.P[0] - HD + 5));
    }
    const fF = frame(0.06), NF = [-fF.T[1], fF.T[0]];
    P.add('magFollower', 'poly', tr(boxC(0, 0, 0, O.W - 4.0, 7.0, O.Dz - 6.0, 1.5, 0.3),
      0, fF.P[1], fF.P[0]));

    return { parts: P.list, frame, meta: { cap: O.cap, len: O.len } };
  }

  /* Патрон: гильза + пуля, ось +Z вперёд; используется как «верхний патрон». */
  function cartridge(o) {
    const O = Object.assign({ caseL: 39, caseR: 5.0, rimR: 5.6, bulletL: 25, bulletR: 2.8 }, o || {});
    const P = bag();
    P.add('case', 'brass', lathe([
      { r: 0, z: 0 }, { r: O.rimR, z: 0 }, { r: O.rimR, z: 1.4, s: true },
      { r: O.caseR * 0.92, z: 3.0, s: true }, { r: O.caseR, z: O.caseL * 0.62, s: true },
      { r: O.bulletR + 0.4, z: O.caseL - 3, s: true }, { r: O.bulletR + 0.4, z: O.caseL },
      { r: 0, z: O.caseL }], 26, true));
    P.add('bullet', 'copper', tr(lathe([
      { r: 0, z: 0 }, { r: O.bulletR, z: 0 }, { r: O.bulletR, z: O.bulletL * 0.42, s: true },
      { r: O.bulletR * 0.62, z: O.bulletL * 0.82, s: true }, { r: 0, z: O.bulletL }], 24, true),
      0, 0, O.caseL - 4));
    return P.list;
  }
  OUT._cartridge = cartridge;

  /* ==================================================================
     Магазины
     ================================================================== */
  OUT.mag_ak_30 = function () {
    const m = curvedMag({ R: 380, len: 172, W: 26, Dz: 64, cap: 30, tilt: 5, mat: 'poly', ribs: 7 });
    return { parts: m.parts, meta: {
      slot: 'mag', name: 'Магазин 30 (7,62/5,45)', short: '30', cap: 30, weight: 330,
      caliber: 'auto', reloadMod: 0,
      stats: { reload: 0, mobility: 0, ergonomics: 0 } } };
  };

  OUT.mag_ak_45 = function () {
    const m = curvedMag({ R: 420, len: 236, W: 26, Dz: 64, cap: 45, tilt: 5, mat: 'poly', ribs: 10 });
    return { parts: m.parts, meta: {
      slot: 'mag', name: 'Магазин 45 (РПК)', short: '45', cap: 45, weight: 470,
      caliber: 'auto', reloadMod: -10,
      stats: { reload: -12, mobility: -4, ergonomics: -3 } } };
  };

  OUT.mag_stanag_30 = function () {
    const m = curvedMag({ R: 560, len: 178, W: 24, Dz: 58, cap: 30, tilt: 3, mat: 'poly', ribs: 6, window: true });
    return { parts: m.parts, meta: {
      slot: 'mag', name: 'Магазин STANAG 30', short: '30', cap: 30, weight: 280,
      caliber: '5.56', reloadMod: 0,
      stats: { reload: 0, mobility: 0, ergonomics: 0 } } };
  };

  /* Барабан на 75 патронов снят с вооружения: он крепился «в воздухе» над
     шахтой и ломал и силуэт, и перезарядку. Штатный ряд коробчатых
     магазинов покрывает все сценарии. */

  OUT.mag_pistol_17 = function () {
    const P = bag();
    const W = 21, Dz = 32, L = 108;
    P.add('magBody', 'poly', boxC(0, -L / 2, 0, W, L, Dz, 2.4, 0.5));
    /* контрольные отверстия с нумерацией по задней стенке */
    for (let i = 0; i < 9; i++)
      P.add('magWitness', 'bore', tr(ry(cyl(1.5, 1.5, W / 2 - 1.4, W / 2 + 0.2, 12, true), PI / 2),
        0, -16 - i * 9.5, Dz / 2 - 6));
    P.add('magFloor', 'poly', boxC(0, -L - 3.0, 0, W + 2.0, 7.0, Dz + 2.0, 2.0, 0.4));
    P.add('magFollower', 'poly', boxC(0, -8.0, 0, W - 3.0, 6.0, Dz - 4.0, 1.4, 0.3));
    P.add('magLugRear', 'steelDk', boxC(0, -14.0, Dz / 2 - 2.0, 10, 12.0, 4.0, 1.0, 0.2));
    return { parts: P.list, meta: {
      slot: 'mag', name: 'Пистолетный 17', short: '17', cap: 17, weight: 190,
      caliber: '9mm', reloadMod: 0, stats: { reload: 0, mobility: 0, ergonomics: 0 } } };
  };

  OUT.mag_pistol_33 = function () {
    const P = bag();
    const W = 21, Dz = 32, L = 196;
    P.add('magBody', 'poly', boxC(0, -L / 2, 0, W, L, Dz, 2.4, 0.5));
    P.add('magFloor', 'poly', boxC(0, -L - 3.0, 0, W + 2.0, 7.0, Dz + 2.0, 2.0, 0.4));
    P.add('magFollower', 'poly', boxC(0, -8.0, 0, W - 3.0, 6.0, Dz - 4.0, 1.4, 0.3));
    P.add('magLugRear', 'steelDk', boxC(0, -14.0, Dz / 2 - 2.0, 10, 12.0, 4.0, 1.0, 0.2));
    for (let i = 0; i < 6; i++)
      P.add('magRib', 'poly', boxC(0, -30 - i * 28, 0, W + 1.2, 3.0, Dz + 1.0, 1.0, 0.2));
    return { parts: P.list, meta: {
      slot: 'mag', name: 'Пистолетный 33', short: '33', cap: 33, weight: 300,
      caliber: '9mm', reloadMod: -8, stats: { reload: -10, mobility: -3, ergonomics: -4 } } };
  };


  OUT.mag_762_20 = function () {
    const m = curvedMag({ R: 480, len: 182, W: 26, Dz: 72, cap: 20, tilt: 4, mat: 'poly', ribs: 6 });
    return { parts: m.parts, meta: {
      slot: 'mag', name: 'Магазин 20 (7,62×51)', short: '20', cap: 20, weight: 310,
      caliber: '7.62', reloadMod: 0,
      stats: { reload: 4, mobility: 2, ergonomics: 2 } } };
  };

  OUT.mag_762_25 = function () {
    const m = curvedMag({ R: 470, len: 218, W: 26, Dz: 72, cap: 25, tilt: 4, mat: 'poly', ribs: 8, window: true });
    return { parts: m.parts, meta: {
      slot: 'mag', name: 'Магазин 25 (7,62×51)', short: '25', cap: 25, weight: 390,
      caliber: '7.62', reloadMod: -6,
      stats: { reload: -6, mobility: -2, ergonomics: -1 } } };
  };

  OUT.mag_svd_10 = function () {
    const m = curvedMag({ R: 620, len: 132, W: 24, Dz: 74, cap: 10, tilt: 3, mat: 'steelDk', ribs: 4 });
    return { parts: m.parts, meta: {
      slot: 'mag', name: 'Магазин 10 (СВД)', short: '10', cap: 10, weight: 240,
      caliber: '7.62', reloadMod: 0,
      stats: { reload: 6, mobility: 3, ergonomics: 2 } } };
  };

  /* ==================================================================
     Приклады. Начало координат — торец ствольной коробки, рост в +Z.
     ================================================================== */

  /* --------------------------------------------------------------------
     Общий каркас приклада.

     Посадка (0,0,0) — задний торец ствольной коробки, ось приклада идёт
     в +Z. Силуэт задаётся таблицей сечений [t, верх, низ, полуширина],
     где t — доля длины от шейки к затыльнику, а верх/низ — отступы от
     линии посадки. Так приклад всегда вырастает из коробки, а не висит
     рядом с ней отдельной деталью.

     Хвост ствольной коробки АК занимает по высоте примерно 30…93 мм над
     плоскостью магазина, а слот приклада стоит на 48 мм. Поэтому сечение
     на стыке (t=0) имеет верх +45 и низ −18 — приклад садится на торец
     коробки заподлицо, без ступеньки и зазора.
     -------------------------------------------------------------------- */
  function stockBody(P, name, mat, L, Y, TAB, o) {
    const O = Object.assign({ rings: 26, seg: 30, power: 4.4 }, o || {});
    const at = (t, i) => {
      for (let k = 1; k < TAB.length; k++) {
        if (t <= TAB[k][0]) {
          const a = TAB[k - 1], b = TAB[k];
          const u = (t - a[0]) / (b[0] - a[0] || 1);
          return a[i] + (b[i] - a[i]) * u;
        }
      }
      return TAB[TAB.length - 1][i];
    };
    const rings = [];
    for (let i = 0; i <= O.rings; i++) {
      const t = i / O.rings, z = t * L;
      const top = Y + at(t, 1), bot = Y + at(t, 2), hw = at(t, 3);
      const yc = (top + bot) / 2, hh = (top - bot) / 2;
      const ring = [];
      for (let k = 0; k < O.seg; k++) {
        const a = k / O.seg * TAU, cs = Math.cos(a), sn = Math.sin(a), p = O.power;
        ring.push([hw * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / p),
          yc + hh * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p), z]);
      }
      rings.push(ring);
    }
    P.add(name, mat, loft(rings, true, true));
    return { at, top: (t) => Y + at(t, 1), bot: (t) => Y + at(t, 2), hw: (t) => at(t, 3) };
  }

  /* Затыльник по обводу торца: пятка, резиновый амортизатор, насечка. */
  function buttPad(P, mat, z, Y, halfW, top, bot, o) {
    const O = Object.assign({ plate: 6, pad: 11, grooves: 5 }, o || {});
    const h = top - bot, yc = (top + bot) / 2;
    P.add('buttPlate', mat, boxC(0, yc, z + O.plate / 2, halfW * 2 + 2.5, h + 3.0, O.plate, 3.0, 0.6));
    P.add('recoilPad', 'rubber', boxC(0, yc, z + O.plate + O.pad / 2, halfW * 2 + 2.0, h + 2.4, O.pad, 3.2, 0.6));
    for (let i = 0; i < O.grooves; i++)
      P.add('padGroove', 'rubber', boxC(0, bot + 6 + i * (h - 12) / (O.grooves - 1),
        z + O.plate + O.pad - 0.6, halfW * 2, 2.0, 1.4, 0.5, 0.1));
    return z + O.plate + O.pad;
  }

  /* Телескопический приклад: буферная труба, салазка с щекой, затыльник.
     Труба выходит из коробки по её оси, салазка обхватывает трубу — в
     прежней версии «коробка» висела рядом и не касалась трубы. */
  OUT.stock_telescopic = function (o) {
    const O = Object.assign({ mat: 'poly', ext: 2, mounts: 6 }, o || {});
    const P = bag();
    const Y = 36.0;                          // ось трубы на высоте хвоста коробки
    const R_T = 14.6;                        // труба Ø29,2 (карабинная)
    const L_T = 168;
    const STEP = 17.5;
    const pos = 30 + O.ext * STEP;           // вылет салазки по фиксатору
    const bodyL = 92;

    P.add('castleNut', 'steelDk', tr(cyl(R_T + 4.2, R_T + 4.2, -8, -1, 30, true), 0, Y, 0));
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      P.add('castleSlot', 'bore', tr(cyl(1.8, 1.8, -8.2, -0.8, 10, true),
        Math.cos(a) * (R_T + 3.4), Y + Math.sin(a) * (R_T + 3.4), 0));
    }
    P.add('bufferTube', 'anod', tr(cyl(R_T, R_T, -2, L_T, 34, true), 0, Y, 0));
    P.add('tubeRib', 'anod', tr(boxC(0, 0, 0, 9.0, 5.0, L_T - 14, 1.2, 0.3), 0, Y - R_T - 1.2, L_T / 2));
    for (let i = 0; i < O.mounts; i++)
      P.add('detentNotch', 'bore', tr(cyl(3.2, 3.2, -4.4, 1.6, 12, true), 0, Y - R_T - 1.2, 34 + i * STEP));

    /* Салазка: стенки обхватывают трубу сверху и снизу, между ними — паз. */
    const HW = 20.0;
    for (const s of [-1, 1])
      P.add('sliderWall', O.mat, boxC(s * (HW - 2.4), Y - 2.0, pos + bodyL / 2, 5.0, 46, bodyL, 3.0, 0.6));
    P.add('sliderTop', O.mat, boxC(0, Y + 20.0, pos + bodyL / 2, HW * 2 - 2, 8.0, bodyL, 3.0, 0.6));
    P.add('sliderBottom', O.mat, boxC(0, Y - 24.0, pos + bodyL / 2, HW * 2 - 2, 8.0, bodyL - 10, 3.0, 0.6));
    P.add('sliderNose', O.mat, tr(tube(R_T + 0.6, R_T + 5.0, pos - 6, pos + 6, 30), 0, Y, 0));

    /* щека и накладка под скулу */
    P.add('cheek', O.mat, boxC(0, Y + 27.0, pos + bodyL / 2 + 6, 30, 10.0, bodyL - 18, 4.0, 0.8));
    P.add('cheekPad', 'rubber', boxC(0, Y + 32.4, pos + bodyL / 2 + 6, 27, 3.0, bodyL - 26, 3.0, 0.5));

    /* рычаг фиксатора длины под трубой */
    P.add('lockLever', 'poly', boxC(0, Y - 30.0, pos + 26, 24, 8.0, 34, 2.4, 0.5));
    P.add('lockPin', 'steel', tr(cylY(2.6, 2.6, Y - 28, Y - 16, 14), 0, 0, pos + 26));
    P.add('lockSpring', 'steel', tr(spring(3.2, 0.7, 0, 9, 6), 0, Y - 26, pos + 26));

    const zEnd = pos + bodyL;
    const butt = buttPad(P, O.mat, zEnd, Y, 21.0, Y + 26.0, Y - 28.0, { plate: 6, pad: 12 });

    for (const s of [-1, 1])
      P.add('qdSocket', 'steelDk', tr(cylX(5.0, 5.0, s * 18.0, s * 21.0, 18), 0, Y - 12, pos + 22));
    P.add('slingLoop', 'steelDk', tr(rx(tube(4.0, 6.4, -2.0, 2.0, 22), PI / 2), 0, Y - 30, zEnd - 10));

    return { parts: P.list, meta: {
      slot: 'stock', name: 'Телескопический приклад', short: 'ТЕЛЕСКОП', weight: 340,
      lengthOfPull: butt, adjust: { steps: O.mounts, step: STEP, current: O.ext },
      cheekY: Y + 30, buttZ: butt,
      stats: { vertRecoil: -16, horizRecoil: -10, adsSpeed: -2, mobility: -2, ergonomics: 6 } } };
  };

  /* Складной рамочный приклад в духе АКМС/АКС-74.

     Рама — штампованный треугольник: два плеча, сходящиеся от шарнира у
     коробки к плоскому затыльнику. Плечи идут наклонно (верхнее почти по
     оси, нижнее — вниз и назад), как у настоящего АКС; прежняя версия
     ставила две параллельные трубки в пустоте без связи с коробкой. */
  OUT.stock_folding = function (o) {
    const O = Object.assign({ mat: 'steelDk' }, o || {});
    const P = bag();
    const Y = 30.0, L = 236;
    const HINGE = [-14.0, Y - 4, 6];

    /* проушина шарнира на хвосте коробки */
    P.add('hingeBlock', O.mat, boxC(HINGE[0], HINGE[1], HINGE[2], 20, 42, 26, 3.0, 0.5));
    P.add('hingeAxis', 'steel', tr(cylY(4.2, 4.2, HINGE[1] - 26, HINGE[1] + 26, 18), HINGE[0], 0, HINGE[2]));
    P.add('hingeLatch', 'steel', boxC(HINGE[0], HINGE[1] - 24, 22, 9.0, 9.0, 18, 1.2, 0.3));
    P.add('latchSpring', 'steel', tr(spring(3.0, 0.6, 0, 9, 5), HINGE[0], HINGE[1] - 26, 22));

    /* корень рамы: обойма, которой плечи сидят на проушине */
    P.add('frameRoot', O.mat, boxC(-2.0, Y, 16, 34, 44, 22, 3.0, 0.5));

    /* два плеча-штамповки прямоугольного сечения, сходящиеся к затыльнику */
    const armRings = (y0, y1, dy) => {
      const rings = [];
      const NS = 12;
      for (let i = 0; i <= NS; i++) {
        const t = i / NS, z = 16 + t * (L - 34);
        const yc = y0 + (y1 - y0) * t;
        const hw = 5.0 - 1.0 * t, hh = 8.0 - 2.4 * t;
        const ring = [];
        for (let k = 0; k < 14; k++) {
          const a = k / 14 * TAU, cs = Math.cos(a), sn = Math.sin(a), p = 3.2;
          ring.push([hw * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / p),
            yc + dy + hh * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p), z]);
        }
        rings.push(ring);
      }
      return loft(rings, true, true);
    };
    /* верхнее плечо идёт почти по оси, нижнее опускается под щёку */
    P.add('armUpper', O.mat, armRings(Y + 16, Y + 12, 0));
    P.add('armLower', O.mat, armRings(Y - 22, Y - 14, 0));
    /* перемычка жёсткости посередине рамы */
    P.add('frameBrace', O.mat, tr(boxC(0, 0, 0, 9.0, 34, 7.0, 1.4, 0.3), 0, Y - 2, 16 + (L - 34) * 0.58));

    /* плоский затыльник-«лопата» с резиновой накладкой */
    const zEnd = L - 18;
    P.add('buttPlate', O.mat, boxC(0, Y, zEnd + 5, 44, 62, 9, 5.0, 0.8));
    P.add('buttPad', 'rubber', boxC(0, Y, zEnd + 13, 43, 60, 8, 5.0, 0.8));
    for (let i = 0; i < 4; i++)
      P.add('padGroove', 'rubber', boxC(0, Y - 22 + i * 14, zEnd + 16.6, 41, 2.2, 1.4, 0.5, 0.1));
    P.add('slingLoop', O.mat, tr(rx(tube(4.0, 6.4, -2.0, 2.0, 22), PI / 2), 0, Y - 30, 40));

    return { parts: P.list, meta: {
      slot: 'stock', name: 'Складной рамочный', short: 'СКЛАДНОЙ', weight: 520,
      lengthOfPull: zEnd + 17, cheekY: Y + 18, buttZ: zEnd + 17,
      /* складывается влево вокруг проушины — как у АКС */
      fold: { pivot: HINGE, axis: 'y', angle: 176,
        parts: ['frameRoot', 'armUpper', 'armLower', 'frameBrace',
          'buttPlate', 'buttPad', 'padGroove', 'slingLoop'] },
      stats: { vertRecoil: -12, horizRecoil: -8, adsSpeed: 0, mobility: 6, ergonomics: 2 } } };
  };

  /* Классический деревянный приклад АКМ.

     Силуэт настоящего АК: из хвоста коробки выходит узкая шейка, гребень
     идёт почти горизонтально до затыльника, а низ круто уходит вниз и
     назад, образуя характерный «живот» под щёку. Пятка затыльника выше
     носка, поэтому приклад «ложится» в плечо. */
  OUT.stock_wood = function (o) {
    const O = Object.assign({ mat: 'wood' }, o || {});
    const P = bag();
    /* Y — линия посадки слота (48 мм над плоскостью магазина). Верх стыка
       +45 совпадает с крышкой коробки (93 мм), низ −18 — с её дном. */
    const Y = 0.0, L = 246;
    /* [t, верх, низ, полуширина] — отсчёт от линии посадки */
    const TAB = [
      [0.00, 45, -18, 16.0],   // стык с хвостом коробки
      [0.07, 44, -22, 16.2],   // шейка
      [0.20, 43, -33, 16.8],
      [0.36, 43, -42, 17.4],
      [0.54, 44, -48, 17.9],
      [0.72, 46, -51, 18.3],
      [0.88, 48, -52, 18.6],
      [1.00, 50, -50, 18.8]    // пятка выше носка — приклад ложится в плечо
    ];
    const prof = stockBody(P, 'stockBody', O.mat, L, Y, TAB, { rings: 26, seg: 30, power: 4.6 });

    /* стальной затыльник по обводу торца и винты пятки/носка */
    const top = prof.top(1), bot = prof.bot(1), hw = prof.hw(1);
    P.add('buttPlate', 'steelDk', boxC(0, (top + bot) / 2, L + 3.5, hw * 2 + 1.6, top - bot + 2.0, 7, 3.0, 0.6));
    P.add('buttSerration', 'steelDk', boxC(0, (top + bot) / 2, L + 7.2, hw * 2 - 2, top - bot - 4, 1.2, 2.0, 0.2));
    P.add('buttScrew', 'steel', tr(capScrew(4.0, 8, 2.0), 0, top - 7, L + 7));
    P.add('buttScrewLow', 'steel', tr(capScrew(4.0, 8, 2.0), 0, bot + 8, L + 7));
    /* лючок пенала принадлежностей в пятке */
    P.add('cleaningTrap', 'steelDk', tr(cyl(7.0, 7.0, L + 2, L + 6, 22, true), 0, Y + 34, 0));
    /* антабка на левой стороне ложи */
    /* Антабка утоплена в древесину: прорезь в ложе и стальная скоба в ней,
       как на АКМ. Накладная «шайба» снаружи выглядела чужеродной. */
    const swZ = L * 0.30, swX = prof.hw(0.30) - 1.2, swY = Y - 26;
    P.add('slingSlot', 'woodDk', tr(boxC(0, 0, 0, 5.0, 13, 34, 1.5, 0.3), -swX, swY, swZ));
    P.add('slingLoop', 'steelDk', tr(ry(G.torus(5.6, 1.7, 20, 9), 0), -swX - 0.4, swY, swZ));
    P.add('slingPin', 'steel', tr(cylX(1.6, 1.6, -swX - 3.0, -swX + 3.0, 12), 0, swY + 5.2, swZ));

    return { parts: P.list, meta: {
      slot: 'stock', name: 'Деревянный приклад', short: 'ДЕРЕВО', weight: 640,
      lengthOfPull: L + 7, cheekY: Y + 44, buttZ: L + 7,
      stats: { vertRecoil: -20, horizRecoil: -14, adsSpeed: -4, mobility: -6, ergonomics: 4 } } };
  };

  /* «Пистолетная» заглушка вместо приклада (труба без салазки) */
  OUT.stock_none = function () {
    const P = bag();
    const Y = 18.0, R_T = 14.6;
    P.add('bufferTube', 'anod', tr(cyl(R_T, R_T, 0, 88, 32, true), 0, Y, 0));
    P.add('tubeCap', 'anod', tr(lathe([{ r: 0, z: 88 }, { r: R_T, z: 88 },
      { r: R_T - 1.5, z: 92 }, { r: 0, z: 92 }], 30, true), 0, Y, 0));
    P.add('castleNut', 'steelDk', tr(cyl(R_T + 4.0, R_T + 4.0, -6, 0, 30, true), 0, Y, 0));
    P.add('slingLoop', 'steelDk', tr(rx(tube(3.6, 5.8, -2.0, 2.0, 20), PI / 2), 0, Y - 16, 20));
    return { parts: P.list, meta: {
      slot: 'stock', name: 'Без приклада', short: 'НЕТ', weight: 120,
      lengthOfPull: 92, cheekY: Y + 14, buttZ: 92,
      stats: { vertRecoil: 22, horizRecoil: 16, adsSpeed: 6, mobility: 14, ergonomics: -12 } } };
  };

  /* ==================================================================
     Цевья. Начало координат — стык с коробкой, рост в −Z.
     ================================================================== */

  /* Модульное цевьё M-LOK: труба с гранями, планка сверху, слоты по бокам */
  OUT.handguard_mlok = function (o) {
    const O = Object.assign({ len: 240, mat: 'anod', slots: true }, o || {});
    const P = bag();
    const L = O.len, R = 21.0, Y = 0;

    /* восьмигранная труба */
    const rings = [];
    for (const z of [-L, -L + 6, -8, 0]) {
      const ring = [];
      const rr = (z > -10) ? R + 2.2 : R;
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU + PI / 8;
        ring.push([Math.cos(a) * rr, Math.sin(a) * rr, z]);
        ring.push([Math.cos(a) * rr, Math.sin(a) * rr, z]);
      }
      rings.push(ring);
    }
    P.add('shell', O.mat, loft(rings, false, false));
    /* внутренняя стенка, чтобы труба не была «бумажной» */
    const ringsIn = rings.map((r) => r.map((p) => {
      const l = Math.hypot(p[0], p[1]) || 1;
      return [p[0] / l * (l - 3.0), p[1] / l * (l - 3.0), p[2]];
    }));
    P.add('shellInner', 'bore', loft(ringsIn, false, false));
    P.add('capFront', O.mat, tr(tube(R - 3.2, R + 0.3, -L - 3, -L, 26), 0, 0, 0));

    /* верхняя планка по всей длине */
    for (const p of [{ g: railStrip(L - 4, -4, 5.2, 4.2) }])
      P.add('topRail', O.mat, tr(p.g, 0, R + 4.6, 0));

    /* M-LOK слоты: по 3 ряда на каждой из нижних граней */
    if (O.slots) {
      for (const side of [-1, 1, 0]) {
        const a = side === 0 ? -PI / 2 : (side > 0 ? 0 : PI);
        for (let i = 0; i < Math.floor((L - 40) / 42); i++) {
          const z = -30 - i * 42;
          const g = boxC(0, 0, z, 6.0, 3.0, 32, 1.5, 0.3);
          P.add('mlokSlot', 'bore', tr(rz(tr(g, 0, R - 1.0, 0), a), 0, 0, 0));
        }
      }
    }
    /* вентиляционные отверстия по верхним скосам */
    for (const s of [-1, 1]) for (let i = 0; i < Math.floor((L - 50) / 30); i++) {
      const a = s * D(45);
      P.add('vent', 'bore', tr(rz(tr(cyl(4.6, 4.6, R - 3.4, R + 0.6, 16, true), 0, 0, 0), 0), 0, 0, 0));
      P.list.pop();
      const g = rx(cyl(4.6, 4.6, R - 3.4, R + 0.6, 16, true), -PI / 2);
      P.add('vent', 'bore', tr(rz(tr(g, 0, 0, -36 - i * 30), a), 0, 0, 0));
    }
    /* гайка ствола и антиротационные зубья */
    P.add('barrelNut', 'steelDk', tr(tube(15.0, R - 1.6, -6, 10, 30), 0, 0, 0));
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      P.add('nutTooth', 'steelDk', tr(cyl(1.6, 1.6, -5, 8, 8, true),
        Math.cos(a) * (R - 3.4), Math.sin(a) * (R - 3.4), 0));
    }
    for (const s of [-1, 1])
      P.add('clampScrew', 'steel', tr(rx(capScrew(3.4, 9, 1.6), PI), s * 12.0, -R - 2.0, -6));

    return { parts: P.list, meta: {
      slot: 'handguard', name: 'Цевьё M-LOK', short: 'M-LOK', weight: 320, len: L,
      rails: {
        top: { pos: [0, R + 4.6, -4], rot: [0, 0, 0], len: L - 4 },
        bottom: { pos: [0, -R - 0.6, -30], rot: [0, 0, PI], len: L - 60 },
        left: { pos: [-R - 0.6, 0, -30], rot: [0, 0, PI / 2], len: L - 60 },
        right: { pos: [R + 0.6, 0, -30], rot: [0, 0, -PI / 2], len: L - 60 }
      },
      stats: { vertRecoil: -4, adsSpeed: -1, mobility: 0, ergonomics: 6 } } };
  };

  /* Классическое деревянное цевьё с газовой трубкой */
  OUT.handguard_wood = function (o) {
    const O = Object.assign({ len: 200, mat: 'wood' }, o || {});
    const P = bag();
    const L = O.len;
    /* нижняя накладка */
    const rings = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, z = -t * L;
      const w = 20.5 - 2.6 * Math.pow(t, 1.6), h = 17.5 - 3.5 * t;
      const ring = [];
      for (let k = 0; k < 20; k++) {
        const a = k / 20 * TAU, cs = Math.cos(a), sn = Math.sin(a), p = 2.4;
        ring.push([w * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / p),
          -6 + h * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p) * (sn < 0 ? 1.15 : 0.8), z]);
      }
      rings.push(ring);
    }
    P.add('lowerWood', O.mat, loft(rings, true, true));
    /* верхняя накладка над газовой трубкой */
    const ringsUp = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, z = -8 - t * (L - 30);
      const w = 14.5 - 1.6 * t, h = 11.0 - 1.4 * t;
      const ring = [];
      for (let k = 0; k < 18; k++) {
        const a = k / 18 * TAU, cs = Math.cos(a), sn = Math.sin(a), p = 2.3;
        ring.push([w * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / p),
          26 + h * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p), z]);
      }
      ringsUp.push(ring);
    }
    P.add('upperWood', O.mat, loft(ringsUp, true, true));
    /* стальные обоймицы и «ласточкин хвост» под боковой кронштейн */
    for (const z of [-12, -L + 16])
      P.add('ferrule', 'steelDk', tr(tube(19.0, 21.4, z - 4, z + 4, 26), 0, -6, 0));
    /* пальцевые выемки — тёмные полосы заподлицо с боковиной */
    /* пальцевые выемки — неглубокие овальные впадины на боковинах */
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++)
      P.add('grooveCut', 'woodDk', tr(ry(cyl(5.4, 5.4, 0, 1.6, 20, true), PI / 2),
        s * 19.0, -6, -40 - i * 26));

    return { parts: P.list, meta: {
      slot: 'handguard', name: 'Деревянное цевьё', short: 'ДЕРЕВО', weight: 260, len: L,
      rails: {},
      stats: { vertRecoil: 0, adsSpeed: 1, mobility: 2, ergonomics: -4 } } };
  };

  /* Цевьё с «квад-рейл»: четыре планки Пикатинни */
  OUT.handguard_quad = function (o) {
    const O = Object.assign({ len: 230, mat: 'anod' }, o || {});
    const P = bag();
    const L = O.len, R = 19.5;
    P.add('core', O.mat, tube(R - 3.0, R, -L, 0, 26));
    for (const [nm, a, y, x] of [['top', 0, R, 0], ['bottom', PI, -R, 0],
      ['left', PI / 2, 0, -R], ['right', -PI / 2, 0, R]]) {
      const strip = railStrip(L - 8, -6, 5.0, 4.2);
      P.add(nm + 'Rail', O.mat, tr(rz(tr(strip, 0, R + 4.4, 0), a), 0, 0, 0));
    }
    P.add('barrelNut', 'steelDk', tr(tube(14.6, R - 1.4, -6, 12, 28), 0, 0, 0));
    for (const s of [-1, 1])
      P.add('clampScrew', 'steel', tr(rx(capScrew(3.4, 9, 1.6), PI), s * 11.0, -R - 6.5, -8));
    return { parts: P.list, meta: {
      slot: 'handguard', name: 'Квад-рейл', short: 'QUAD', weight: 430, len: L,
      rails: {
        top: { pos: [0, R + 4.4, -6], rot: [0, 0, 0], len: L - 8 },
        bottom: { pos: [0, -R - 4.4, -6], rot: [0, 0, PI], len: L - 8 },
        left: { pos: [-R - 4.4, 0, -6], rot: [0, 0, PI / 2], len: L - 8 },
        right: { pos: [R + 4.4, 0, -6], rot: [0, 0, -PI / 2], len: L - 8 }
      },
      stats: { vertRecoil: -6, adsSpeed: -3, mobility: -4, ergonomics: 8 } } };
  };


  /* ==================================================================
     ОПТИЧЕСКИЕ КРОНШТЕЙНЫ (OPTIC MOUNT)

     Отдельный слот-переходник: на АК прицел нельзя поставить напрямую,
     сначала ставится кронштейн, и уже он даёт планку под оптику.
     Каждый кронштейн объявляет rails.top — система подхватывает её как
     дочерний слот и предлагает туда прицелы.
     ================================================================== */

  /* Крышка ствольной коробки с планкой (самый частый вариант на АК) */
  OUT.mount_dustcover = function (o) {
    const O = Object.assign({ mat: 'anod' }, o || {});
    const P = bag();
    /* Крышка садится на коробку: ширина по щекам 36 мм, подъём арки над
       посадочной плоскостью 17 мм — как у штатной крышки АК. Высокая арка
       из прежней версии поднимала прицел на «ходули». */
    const L = 200, W = 36, H = 17;
    const RAIL_Y = H + 3.4;                  // низ планки лежит на спине крышки

    /* корпус крышки: арочный профиль с рёбрами жёсткости */
    const arch = [];
    for (let k = 0; k <= 16; k++) {
      const a = PI * (k / 16);
      arch.push([Math.cos(a) * (W / 2), Math.sin(a) * H * 0.92]);
    }
    arch.push([-W / 2, -2], [W / 2, -2]);
    P.add('cover', O.mat, extrude(G.round(arch, 1.2), { z0: -L, z1: 0, ch: 0.5 }));
    for (let i = 0; i < 5; i++)
      P.add('coverRib', O.mat, boxC(0, H * 0.45, -18 - i * 40, W + 0.8, H * 0.6, 3.0, 1.0, 0.2));

    /* передний зацеп и задняя защёлка — то, чем крышка держится */
    P.add('frontLug', 'steelDk', boxC(0, 4.0, -L + 4, W - 6, 7.0, 10, 1.0, 0.3));
    P.add('rearLatch', 'steelDk', boxC(0, 5.5, -6, 14, 10.0, 12, 1.2, 0.3));
    P.add('latchSpring', 'steel', tr(spring(3.0, 0.6, 0, 8, 5), 0, 9.0, -10));

    /* планка Пикатинни сверху, на всю длину крышки */
    P.add('rail', O.mat, tr(railStrip(L - 16, -8, 5.2, 4.2), 0, RAIL_Y, 0));
    /* усиленные боковые щёки — крышка с планкой не «гуляет» */
    for (const s of [-1, 1])
      P.add('sideWall', O.mat, boxC(s * (W / 2 - 1.2), H * 0.4, -L / 2, 2.4, H * 0.75, L - 20, 1.0, 0.3));

    return { parts: P.list, meta: {
      slot: 'mount', name: 'Крышка с планкой', short: 'КРЫШКА', weight: 240,
      rails: { top: { pos: [0, RAIL_Y, -8], rot: [0, 0, 0], len: L - 16, accepts: ['optic', 'magnifier'] } },
      stats: { adsSpeed: -1, ergonomics: 4 } } };
  };

  /* Боковой кронштейн-переходник на «ласточкин хвост» АК */
  OUT.mount_side = function (o) {
    const O = Object.assign({ mat: 'anod' }, o || {});
    const P = bag();
    const RAIL_Y = 58;                        // планка над осью канала ствола

    /* зажим на боковую планку: скоба + прижимной рычаг */
    P.add('clampPlate', O.mat, boxC(0, 14, 0, 10, 40, 78, 2.4, 0.5));
    P.add('dovetailJaw', 'steelDk', tr(rz(boxC(0, 0, 0, 8, 11, 74, 1.0, 0.3), D(6)), -4.0, 2.0, 0));
    P.add('lever', 'steel', tr(cylX(4.2, 4.2, -17, -7, 18), 0, 8.0, 24));
    P.add('leverArm', O.mat, boxC(-14.0, 22.0, 24, 5.0, 30.0, 8.0, 1.6, 0.3));
    P.add('leverSpring', 'steel', tr(spring(3.0, 0.6, 0, 8, 5), -10.0, 8.0, 12));

    /* вынос вверх и вперёд — прицел встаёт над ствольной коробкой */
    P.add('arm', O.mat, boxC(6.0, RAIL_Y - 14, -6, 22, 26, 68, 2.4, 0.5));
    P.add('armRib', O.mat, boxC(6.0, RAIL_Y - 24, -6, 10, 14, 64, 1.4, 0.3));
    P.add('rail', O.mat, tr(railStrip(84, 34, 5.2, 4.2), 0, RAIL_Y, 0));

    return { parts: P.list, meta: {
      slot: 'mount', name: 'Боковой кронштейн', short: 'БОК', weight: 290,
      rails: { top: { pos: [0, RAIL_Y, 34], rot: [0, 0, 0], len: 84, accepts: ['optic', 'magnifier'] } },
      stats: { adsSpeed: -2, mobility: -1, ergonomics: 2 } } };
  };

  /* Низкий переходник: просто планка поверх штатной колодки прицела */
  OUT.mount_rearsight = function (o) {
    const O = Object.assign({ mat: 'anod' }, o || {});
    const P = bag();
    const RAIL_Y = 12.4;
    P.add('base', O.mat, boxC(0, 4.0, 0, 24, 8.0, 64, 2.0, 0.4));
    for (const s of [-1, 1])
      P.add('clawJaw', 'steelDk', boxC(s * 11.0, 1.0, 0, 4.0, 10.0, 56, 1.0, 0.3));
    for (const z of [-20, 20])
      P.add('clampScrew', 'steel', tr(rx(capScrew(3.4, 9, 1.6), PI), 11.0, -2.0, z));
    P.add('rail', O.mat, tr(railStrip(60, -2, 5.0, 4.2), 0, RAIL_Y, 0));
    return { parts: P.list, meta: {
      slot: 'mount', name: 'Низкий переходник', short: 'НИЗКИЙ', weight: 90,
      rails: { top: { pos: [0, RAIL_Y, -2], rot: [0, 0, 0], len: 60, accepts: ['optic'] } },
      stats: { adsSpeed: 1, ergonomics: 1 } } };
  };

  /* «Горка» — цельнофрезерованная платформа поверх крышки коробки.

     Классический тюнинг АК: длинная планка с рёбрами охлаждения по бокам,
     облегчающими окнами и собственным «завалённым» местом под мини-
     коллиматор. В отличие от штатной крышки держит нулевую точку, потому
     что опирается сразу на колодку прицела и на хвостовик коробки. */
  OUT.mount_topcover_rail = function (o) {
    const O = Object.assign({ mat: 'anodMatt' }, o || {});
    const P = bag();
    const L = 228, W = 38, H = 20;
    const RAIL_Y = H + 3.2;

    /* корпус: плоская спина с покатыми боками */
    const body = G.round([
      [-W / 2, 0], [W / 2, 0], [W / 2, H - 7], [W / 2 - 5.5, H],
      [-W / 2 + 5.5, H], [-W / 2, H - 7]
    ], 1.6);
    P.add('shell', O.mat, extrude(body, { z0: -L, z1: 0, ch: 0.6 }));

    /* косые рёбра охлаждения по бокам — узнаваемый признак «горки» */
    for (const s of [-1, 1])
      for (let i = 0; i < 16; i++)
        P.add('coolFin', O.mat, tr(rz(boxC(0, 0, 0, 3.4, H - 9, 4.6, 0.8, 0.2), s * D(16)),
          s * (W / 2 - 1.0), H / 2 - 1.0, -26 - i * 11));

    /* облегчающие окна в боковинах ближе к хвосту */
    for (const s of [-1, 1])
      for (let i = 0; i < 3; i++)
        P.add('lightHole', 'bore', tr(ry(cyl(4.4, 4.4, s * (W / 2 - 3.0), s * (W / 2 + 0.6), 18, true), PI / 2),
          0, H / 2, -186 - i * 13));

    /* опора на колодку прицела спереди и на хвостовик коробки сзади */
    P.add('frontClaw', 'steelDk', boxC(0, -3.0, -L + 12, W - 8, 14.0, 24, 1.6, 0.4));
    P.add('frontPin', 'steel', tr(cylX(2.6, 2.6, -14, 14, 16), 0, -4.0, -L + 12));
    P.add('rearBlock', 'steelDk', boxC(0, -2.0, -10, 18, 12.0, 20, 1.4, 0.3));
    P.add('rearScrew', 'steel', tr(rx(capScrew(3.6, 10, 1.8), PI), 0, 6.0, -10));

    /* основная планка сверху и «завалённая» площадка под мини-коллиматор */
    P.add('rail', O.mat, tr(railStrip(L - 24, -12, 5.2, 4.2), 0, RAIL_Y, 0));
    P.add('cantedPad', O.mat, tr(rz(boxC(0, 0, 0, 22, 7.0, 54, 1.6, 0.3), D(45)),
      -(W / 2 - 2.0), H / 2 + 2.0, -62));

    return { parts: P.list, meta: {
      slot: 'mount', name: 'Горка (планка на коробку)', short: 'ГОРКА', weight: 310,
      rails: {
        top: { pos: [0, RAIL_Y, -12], rot: [0, 0, 0], len: L - 24,
          accepts: ['optic', 'magnifier', 'ironRear'] },
        /* левая площадка под «завалённый» коллиматор */
        left: { pos: [-(W / 2 + 2.0), H / 2 + 7.0, -62], rot: [0, 0, D(45)], len: 50,
          accepts: ['optic_offset'], maxWeight: 120 }
      },
      stats: { adsSpeed: -2, mobility: -1, ergonomics: 7, precision: 4 } } };
  };

  /* Боковая планка под фонарь/ЛЦУ (SIDERAIL) — вешается на цевьё */
  OUT.siderail_short = function (o) {
    const O = Object.assign({ mat: 'anod', len: 76 }, o || {});
    const P = bag();
    const L = O.len;
    P.add('base', O.mat, boxC(0, 3.0, 0, 22, 6.0, L, 1.8, 0.4));
    P.add('rail', O.mat, tr(railStrip(L - 8, (L - 8) / 2, 5.0, 4.2), 0, 9.6, 0));
    for (const z of [-L / 2 + 12, L / 2 - 12])
      P.add('screw', 'steel', tr(rx(capScrew(3.0, 7, 1.4), PI), 0, 0.5, z));
    return { parts: P.list, meta: {
      slot: 'siderail', name: 'Боковая планка', short: 'ПЛАНКА', weight: 58, len: L,
      rails: { top: { pos: [0, 9.6, (L - 8) / 2], rot: [0, 0, 0], len: L - 8,
        accepts: ['tactical'] } },
      stats: { mobility: -1, ergonomics: 2 } } };
  };

  /* ==================================================================
     Боковые модули и мелочи
     ================================================================== */

  /* Боковая планка-переходник (для АК: планка на левую стенку) */
  OUT.sidemount_rail = function () {
    const P = bag();
    P.add('plate', 'anod', boxC(0, 0, 0, 8.0, 34, 86, 2.4, 0.5));
    P.add('dovetail', 'steelDk', tr(rz(boxC(0, 0, 0, 7.0, 12, 82, 1.0, 0.3), D(6)), -5.0, -12, 0));
    P.add('lever', 'steel', tr(cylX(4.5, 4.5, -18, -6, 18), 0, -6, 24));
    P.add('leverArm', 'anod', boxC(-16.0, 6.0, 24, 5.0, 28, 8.0, 1.6, 0.3));
    P.add('topRail', 'anod', tr(railStrip(80, 40, 5.0, 4.2), 0, 21.0, 0));
    return { parts: P.list, meta: {
      slot: 'sidemount', name: 'Боковая планка', short: 'ПЛАНКА', weight: 130,
      rails: { top: { pos: [0, 21.0, 40], rot: [0, 0, 0], len: 80 } },
      stats: { adsSpeed: -1, mobility: -1, ergonomics: 2 } } };
  };

  /* Ремень-антабка QD */
  OUT.sling_qd = function () {
    const P = bag();
    P.add('socket', 'steelDk', tr(cylX(5.6, 5.6, -4, 4, 20), 0, 0, 0));
    P.add('pushButton', 'steel', tr(cylX(2.4, 2.4, 4, 6.4, 14), 0, 0, 0));
    P.add('loop', 'steelDk', tr(ry(G.torus(8.0, 2.2, 26, 12), 0), 0, -10.0, 0));
    P.add('strap', 'rubber', boxC(0, -22.0, 0, 3.0, 22, 26, 1.0, 0.2));
    return { parts: P.list, meta: {
      slot: 'sling', name: 'Антабка QD', short: 'РЕМЕНЬ', weight: 40,
      stats: { adsSpeed: 1, mobility: 3, ergonomics: 2 } } };
  };

  return OUT;
};
});

__def("system", function (module, exports) {
/* ============================================================================
   Система навески модулей.

   Оружие объявляет набор слотов (SLOTS), система:
     · собирает геометрию выбранных модулей и ставит её по трансформу слота;
     · проверяет совместимость (тип слота, калибр, конфликты, занятые пазы);
     · агрегирует характеристики (отдача, разброс, скорость прицеливания…);
     · отдаёт итоговые узлы (точка вспышки, оптическая ось, хват, эмиттеры).

   Слот описывается так:
     { key:'optic', type:'rail', pos:[x,y,z], rot:[rx,ry,rz],
       accepts:['optic','magnifier'], length: 140, blocks:['ironRear'],
       railSlots: 12, order: 0 }
   pos/rot — положение посадочной точки в системе оружия (мм, радианы).
   Для планочных слотов посадка — верхняя плоскость планки.
   ========================================================================== */
module.exports = function (G, C) {
  const { PI } = C;

  /* --------------------------------------------------------------------
     Роль посадочного места. Планка, смотрящая вниз, физически не может
     нести прицел, а боковая — сошки. Роль вычисляется из поворота слота
     вокруг оси канала ствола (rot[2]) и задаёт, что на планку встанет.
     -------------------------------------------------------------------- */
  const FACE = {
    /* вверх: прицелы, магниферы, механика, тактические блоки */
    top: ['optic', 'magnifier', 'ironRear', 'ironFront', 'tactical'],
    /* вниз: передние рукоятки, упор кисти, сошки, тактика */
    bottom: ['under', 'tactical'],
    /* бок: тактика и вынесенные («завалённые») коллиматоры */
    side: ['tactical', 'optic_offset']
  };

  /* Нормализация угла к [-PI, PI]. */
  const wrapPi = (a) => {
    let x = a % (PI * 2);
    if (x > PI) x -= PI * 2;
    if (x < -PI) x += PI * 2;
    return x;
  };

  /* Направление «верха» планки по повороту слота вокруг Z. */
  function slotFace(slot) {
    if (slot.face) return slot.face;
    const rz = wrapPi(((slot.rot || [0, 0, 0])[2]) || 0);
    const a = Math.abs(rz);
    if (a < PI / 4) return 'top';
    if (a > PI * 3 / 4) return 'bottom';
    return 'side';
  }

  /* Что физически можно повесить на это место. */
  function slotAccepts(slot) {
    if (slot.accepts) return slot.accepts;
    if (slot.type === 'rail') return FACE[slotFace(slot)] || FACE.top;
    return [slot.key];
  }

  /* Читаемая подпись производной планки: «ЦЕВЬЁ СВЕРХУ», а не «ЦЕВЬЁ / top». */
  const RAIL_SIDE = { top: 'СВЕРХУ', bottom: 'СНИЗУ', left: 'СЛЕВА', right: 'СПРАВА' };
  function railLabel(slot, railKey) {
    const base = (slot.shortLabel || slot.label || slot.key).toUpperCase();
    return base + ' ' + (RAIL_SIDE[railKey] || railKey.toUpperCase());
  }

  /* Матрица слота: перенос + повороты XYZ (порядок Rz·Ry·Rx, как в three 'XYZ'). */
  function slotMatrix(slot) {
    const p = slot.pos || [0, 0, 0], r = slot.rot || [0, 0, 0];
    let m = G.mIdent();
    if (r[2]) m = G.mMul(G.mRotZ(r[2]), m);
    if (r[1]) m = G.mMul(G.mRotY(r[1]), m);
    if (r[0]) m = G.mMul(G.mRotX(r[0]), m);
    m = G.mMul(G.mTrans(p[0], p[1], p[2]), m);
    return m;
  }

  /* Перенос точки/направления модуля в систему оружия. */
  function xformPoint(m, v) {
    return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
      m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
      m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
  }
  function xformDir(m, v) {
    const o = [m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
      m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
      m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
    const l = Math.hypot(o[0], o[1], o[2]) || 1;
    return [o[0] / l, o[1] / l, o[2] / l];
  }

  /* -------------------------------------------------------------------
     Реестр модулей: объединяет каталоги в единый справочник по ключу.
     ------------------------------------------------------------------- */
  function registry(catalogs) {
    const items = {};
    for (const cat of catalogs)
      for (const key of Object.keys(cat)) {
        if (key[0] === '_') continue;
        items[key] = cat[key];
      }
    return {
      keys: () => Object.keys(items),
      has: (k) => !!items[k],
      build(key, opts) {
        const f = items[key];
        if (!f) throw new Error('Неизвестный модуль: ' + key);
        const r = f(opts || {});
        r.key = key;
        return r;
      },
      /* метаданные без построения геометрии — для списков в интерфейсе */
      meta(key, opts) { return this.build(key, opts).meta; },
      /* Умеет ли модуль строиться под заданную длину (цевья, планки). */
      fitsLength(key) {
        const f = items[key];
        if (!f) return false;
        try { return f({ len: 111 }).meta.len === 111; } catch (e) { return false; }
      }
    };
  }

  /* -------------------------------------------------------------------
     Проверка совместимости модуля со слотом.
     ------------------------------------------------------------------- */
  function checkFit(slot, meta, weapon, current) {
    const errs = [];
    const accepts = slotAccepts(slot);
    const face = slotFace(slot);
    /* Коллиматор на боковой планке ставится «завалённым» — это отдельный
       тип посадки, обычная оптика на бок не встаёт. */
    const wants = meta.slot === 'optic' && face === 'side' && meta.canBeOffset
      ? 'optic_offset' : meta.slot;
    if (accepts.indexOf(wants) < 0)
      errs.push('Слот «' + (slot.label || slot.key) + '» не принимает модуль типа «' + meta.slot + '»');
    /* длина: модуль не должен быть длиннее посадочного места */
    if (slot.length && meta.len && meta.len > slot.length + 0.5)
      errs.push('Модуль длиннее посадочного места (' + meta.len + ' > ' + slot.length + ' мм)');
    /* вес: хлипкая планка не держит тяжёлый блок */
    if (slot.maxWeight && meta.weight && meta.weight > slot.maxWeight)
      errs.push('Слишком тяжёлый для этого места (' + meta.weight + ' > ' + slot.maxWeight + ' г)');
    /* калибр магазина */
    if (meta.slot === 'mag' && weapon.caliber && meta.caliber && meta.caliber !== 'auto'
      && meta.caliber !== weapon.caliber)
      errs.push('Магазин под ' + meta.caliber + ', оружие под ' + weapon.caliber);
    /* явные ограничения слота */
    if (slot.only && slot.only.indexOf(meta.key || '') < 0 && slot.only.length)
      errs.push('Слот принимает только: ' + slot.only.join(', '));
    if (slot.deny && meta.key && slot.deny.indexOf(meta.key) >= 0)
      errs.push('Этот модуль несовместим со слотом');
    /* взаимные конфликты уже установленных модулей */
    for (const k in current) {
      const cm = current[k];
      if (!cm || k === slot.key) continue;
      if (cm.conflicts && meta.slot && cm.conflicts.indexOf(meta.slot) >= 0)
        errs.push('Конфликт с модулем «' + cm.name + '»');
      if (meta.conflicts && meta.conflicts.indexOf(cm.slot) >= 0)
        errs.push('Конфликт с модулем «' + cm.name + '»');
    }
    return { ok: errs.length === 0, errors: errs };
  }

  /* -------------------------------------------------------------------
     Сбор конфигурации: геометрия + узлы + характеристики.
     weapon: { base, slots, stats, caliber, nodes }
     config: { slotKey: moduleKey | {key, opts} | null }
     ------------------------------------------------------------------- */
  function assemble(weapon, reg, config, opts) {
    const O = Object.assign({ strict: false }, opts || {});
    const out = {
      parts: [],                 // детали базы + модулей (геометрия в системе оружия)
      modules: {},               // slotKey -> {key, meta, matrix, parts:[имена]}
      nodes: Object.assign({}, weapon.nodes || {}),
      stats: Object.assign({}, weapon.stats || {}),
      weight: weapon.weight || 0,
      warnings: [], errors: [],
      emitters: [], glass: [], emissive: [], reticles: []
    };

    /* база оружия */
    for (const p of weapon.base) out.parts.push({ name: p.name, mat: p.mat, geo: p.geo, group: p.group || 'body', src: 'base' });

    /* порядок сборки: сначала носители (цевьё/планки), затем то, что на них */
    const slots = weapon.slots.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    /* цевьё может добавлять новые слоты — собираем их динамически */
    const dynamic = [];
    const resolved = {};

    const pickSpec = (key) => {
      const raw = config[key];
      if (!raw) return null;
      return typeof raw === 'string' ? { key: raw, opts: {} } : { key: raw.key, opts: raw.opts || {} };
    };

    const process = (slot) => {
      const spec = pickSpec(slot.key);
      if (!spec || !spec.key || spec.key === 'none') return;
      if (!reg.has(spec.key)) { out.errors.push('Нет модуля «' + spec.key + '» для слота ' + slot.key); return; }
      /* Цевьё и планки выпускаются разной длины: подгоняем модуль под
         посадочное место оружия, вместо того чтобы браковать его. */
      const opts = Object.assign({}, spec.opts);
      if (slot.length && opts.len === undefined && reg.fitsLength(spec.key))
        opts.len = slot.length;
      const built = reg.build(spec.key, opts);
      const meta = Object.assign({ key: spec.key }, built.meta);
      const fit = checkFit(slot, meta, weapon, resolved);
      if (!fit.ok) {
        if (O.strict) { out.errors.push.apply(out.errors, fit.errors); return; }
        out.warnings.push.apply(out.warnings, fit.errors);
      }
      const M = slotMatrix(slot);
      const names = [];
      for (const p of built.parts) {
        const geo = { p: p.geo.p.slice(), n: p.geo.n.slice() };
        G.transform(geo, M);
        const nm = slot.key + ':' + p.name;
        names.push(nm);
        out.parts.push({ name: nm, mat: p.mat, geo, group: slot.group || 'body', src: slot.key, module: spec.key });
      }
      resolved[slot.key] = meta;
      out.modules[slot.key] = { key: spec.key, meta, matrix: M, parts: names, slot };

      /* стёкла, эмиссивные детали, сетки — адаптеру рендера */
      for (const gname of meta.glass || []) out.glass.push(slot.key + ':' + gname);
      for (const ename of meta.emissive || []) out.emissive.push(slot.key + ':' + ename);
      if (meta.reticle) out.reticles.push({
        part: slot.key + ':' + meta.reticle.part, color: meta.reticle.color, moa: meta.reticle.moa });

      /* узлы модуля в системе оружия */
      const isOptic = meta.slot === 'optic' || meta.slot === 'sideoptic';
      if (meta.opticY !== undefined && (isOptic || meta.slot === 'magnifier')) {
        out.nodes[slot.key + 'Axis'] = xformPoint(M, [0, meta.opticY, 0]);
        if (isOptic) {
          out.nodes.sightAxis = out.nodes[slot.key + 'Axis'];
          /* Глаз стрелка — на удалении зрачка позади заднего среза окуляра.
             Считаем от геометрии прицела, иначе камера попадает внутрь
             трубы и в прицел «ничего не видно». */
          const ocular = meta.ocularZ !== undefined ? meta.ocularZ : 0;
          const relief = meta.eyeRelief !== undefined ? meta.eyeRelief
            : Math.max(60, (meta.eyeZ || 100) - ocular);
          out.nodes.eye = xformPoint(M, [0, meta.opticY, ocular + relief]);
          out.nodes.eyeDir = xformDir(M, [0, 0, -1]);
          out.activeOptic = { slot: slot.key, meta,
            eyeRelief: relief, ocularZ: ocular,
            fov: meta.fov, magnify: meta.magnify || 1 };
        }
      }
      if (meta.tip !== undefined) {
        out.nodes.muzzle = xformPoint(M, [0, 0, meta.tip]);
        out.nodes.muzzleDir = xformDir(M, [0, 0, -1]);
        out.muzzleMeta = meta;
      }
      if (meta.gripNode) out.nodes.gripL = xformPoint(M, meta.gripNode);
      if (meta.buttZ !== undefined) {
        out.nodes.butt = xformPoint(M, [0, meta.cheekY || 0, meta.buttZ]);
        out.nodes.cheek = xformPoint(M, [0, meta.cheekY || 0, meta.buttZ - 60]);
      }
      for (const ek of ['emitter', 'emitterIR', 'emitterLaser']) {
        const e = meta[ek];
        if (!e) continue;
        out.emitters.push(Object.assign({}, e, {
          slot: slot.key, module: spec.key,
          pos: xformPoint(M, e.pos), dir: xformDir(M, e.dir)
        }));
      }

      /* характеристики */
      out.weight += meta.weight || 0;
      for (const k in meta.stats || {}) out.stats[k] = (out.stats[k] || 0) + meta.stats[k];
      if (meta.cap) out.magCap = meta.cap;

      /* носитель добавил свои планки — регистрируем производные слоты */
      if (meta.rails) {
        for (const rk in meta.rails) {
          const r = meta.rails[rk];
          const childKey = slot.key + '.' + rk;
          const rot = [(slot.rot || [0, 0, 0])[0] + (r.rot || [0, 0, 0])[0],
            (slot.rot || [0, 0, 0])[1] + (r.rot || [0, 0, 0])[1],
            (slot.rot || [0, 0, 0])[2] + (r.rot || [0, 0, 0])[2]];
          const child = {
            key: childKey, label: railLabel(slot, rk),
            type: 'rail', parent: slot.key,
            pos: xformPoint(M, r.pos), rot,
            length: r.len, maxWeight: r.maxWeight,
            order: (slot.order || 0) + 1
          };
          /* Что примет планка, решает её ориентация: вниз — только хват и
             приборы, вверх — прицелы. Носитель может сузить список. */
          child.accepts = r.accepts || slotAccepts(child);
          dynamic.push(child);
        }
      }
    };

    for (const s of slots) process(s);
    /* динамические слоты цевья — второй проход */
    let guard = 0;
    while (dynamic.length && guard++ < 4) {
      const wave = dynamic.splice(0, dynamic.length).sort((a, b) => (a.order || 0) - (b.order || 0));
      for (const s of wave) { out.slotsDynamic = (out.slotsDynamic || []).concat([s]); process(s); }
    }

    /* правила, зависящие от комбинации */
    const optic = resolved.optic;
    if (optic && optic.foldIrons) out.foldIrons = true;
    if (optic && optic.mountType === 'sidemount' && !resolved.sidemount)
      out.warnings.push('Прицелу нужен боковой кронштейн');
    if (resolved.magnifier && !optic)
      out.warnings.push('Магнифер без коллиматора бесполезен');
    if (out.muzzleMeta && out.muzzleMeta.sound === 'suppressed') out.suppressed = true;

    /* производные показатели */
    out.derived = derive(weapon, out);
    return out;
  }

  /* -------------------------------------------------------------------
     Пересчёт «сырых» баллов в игровые величины.
     Базовые значения оружия — в weapon.base stats (проценты/абсолюты).
     ------------------------------------------------------------------- */
  function derive(weapon, asm) {
    const b = weapon.ballistics || {};
    const s = asm.stats;
    const pct = (v) => 1 + (v || 0) / 100;
    const baseWeight = weapon.weight || 3000;
    const massFactor = 1 + (asm.weight - baseWeight) / Math.max(baseWeight, 1) * 0.35;

    return {
      /* подброс и увод: модули уменьшают, тяжёлый ствол гасит */
      vertRecoil: (b.vertRecoil || 1) * pct(s.vertRecoil) / Math.max(0.7, massFactor * 0.6 + 0.4),
      horizRecoil: (b.horizRecoil || 1) * pct(s.horizRecoil) / Math.max(0.7, massFactor * 0.6 + 0.4),
      /* разброс от бедра */
      hipSpread: Math.max(0.05, (b.hipSpread || 1) * pct(s.hipSpread)),
      /* скорость вскидки: тяжёлое оружие вскидывается дольше */
      adsTime: Math.max(0.08, (b.adsTime || 0.25) * (1 - (s.adsSpeed || 0) / 100) * massFactor),
      /* подвижность */
      mobility: Math.max(20, (b.mobility || 100) * pct(s.mobility) / massFactor),
      /* перезарядка */
      reloadTime: Math.max(0.6, (b.reloadTime || 2.2) * (1 - (s.reload || 0) / 100)),
      /* дальность/скорость пули и звук */
      muzzleVelocity: (b.muzzleVelocity || 880) * pct(s.velocity),
      effectiveRange: (b.effectiveRange || 300) * pct(s.range),
      loudness: Math.max(0, (b.loudness || 100) + (s.sound || 0)),
      flashVisible: Math.max(0, 100 - (s.flashHide || 0)),
      magCap: asm.magCap || (b.magCap || 30),
      weight: asm.weight,
      /* точность серии — сводный показатель для интерфейса */
      precision: Math.round(50 + (s.precision || 0) - (s.hipSpread || 0) * 0.3)
    };
  }

  /* -------------------------------------------------------------------
     Пресеты: сохранение/загрузка сборок.
     ------------------------------------------------------------------- */
  function presetCodec() {
    return {
      encode(config) {
        const keys = Object.keys(config).filter((k) => config[k]).sort();
        return keys.map((k) => k + '=' + (typeof config[k] === 'string' ? config[k] : config[k].key)).join(';');
      },
      decode(str) {
        const out = {};
        for (const part of String(str || '').split(';')) {
          if (!part) continue;
          const i = part.indexOf('=');
          if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
        }
        return out;
      }
    };
  }

  return { slotMatrix, xformPoint, xformDir, registry, checkFit, assemble, derive,
    presetCodec, slotFace, slotAccepts, railLabel };
};
});

__def("occlude", function (module, exports) {
/* ============================================================================
   Скрытие заменяемых деталей базовой модели.

   Проблема: у разных файлов оружия детали называются по-разному, а в части
   моделей они вообще слиты в один меш по материалу. Поэтому скрытие работает
   двумя способами, которые дополняют друг друга:

     1) по имени/группе  — когда деталь существует отдельным мешем;
     2) по зоне (боксу)  — деталь вырезается из общего меша на уровне
        треугольников: всё, что попало в зону слота, помечается невидимым.

   Зона задаётся в системе координат оружия, в миллиметрах:
     { box:[x0,y0,z0,x1,y1,z1], when:'always'|'ifModule', slot:'handguard' }
   ========================================================================== */
module.exports = function () {

  /* Зоны для каждого оружия: что убрать, когда в слоте стоит модуль.
     Координаты получены обмером реальных моделей (tools/measure.js). */
  const ZONES = {
    ak74: {
      /* цевьё: нижняя и верхняя накладки между газблоком и коробкой */
      handguard: [{ box: [-26, 30, -500, 26, 118, -296] }],
      /* приклад: всё позади коробки */
      stock: [{ box: [-30, -20, 4, 30, 110, 300] }],
      /* дульное устройство: от резьбы вперёд */
      muzzle: [{ box: [-16, 58, -722, 16, 92, -634] }],
      /* магазин живёт в своей группе — убираем целиком */
      mag: [{ group: 'magazine' }],
      /* штатная крышка коробки заменяется крышкой с планкой */
      mount: [{ box: [-21, 96, -258, 21, 126, 16] }]
    },
    akm: {
      handguard: [{ box: [-26, 28, -478, 26, 124, -285] }],
      stock: [{ box: [-30, -30, 30, 30, 100, 300] }],
      muzzle: [{ box: [-16, 58, -670, 16, 92, -638] }],
      mag: [{ group: 'magazine' }],
      mount: [{ box: [-21, 92, -250, 21, 124, 20] }]
    },
    m416: {
      /* Штатные механические прицелы стоят на планке (ось 138 мм) и
         перекрывают любой установленный прицел — при установке оптики
         они «складываются», то есть убираются. */
      /* Обмер модели: целик стоит на планке у ресивера (Z -12..21,
         X -18..18, Y 109..150), складная мушка — на газблоке (Z -410..-390).
         Прежние зоны были взяты «на глаз» и не задевали ни одну деталь,
         поэтому механика торчала сквозь установленную оптику. */
      optic: [
        { box: [-20, 109, -20, 20, 152, 24] },      // целик у ресивера
        { box: [-14, 109, -414, 14, 150, -386] }    // мушка на газблоке
      ],
      /* Штатное цевьё: труба вокруг ствола и планка над ней. Зона не должна
         задевать сам ствол (Ø~20 у оси 70) и газблок, поэтому вырезаем
         только «скорлупу»: два боковых и верхний объёмы. */
      handguard: [
        { box: [-30, 84, -400, 30, 110, -40] },    // верхняя планка цевья
        { box: [-30, 40, -400, -12, 100, -40] },   // левая стенка
        { box: [12, 40, -400, 30, 100, -40] },     // правая стенка
        { box: [-30, 40, -400, 30, 58, -40] }      // низ
      ],
      stock: [{ box: [-34, -10, 0, 34, 116, 300] }],
      muzzle: [{ box: [-16, 54, -575, 16, 88, -518] }],
      mag: [{ group: 'magazine' }]
    },
    scarh: {
      handguard: [{ box: [-30, -30, -330, 30, 40, -60] }],
      stock: [{ box: [-40, -60, 0, 40, 60, 320] }],
      muzzle: [{ box: [-18, -20, -505, 18, 20, -425] }],
      mag: [{ group: 'magazine' }]
    },
    /* MP5: модель авторская в миллиметрах, ствол оканчивается на Z≈-190,
       цевьё Z -166..-60, приклад уходит в +Z. */
    mp5a3: {
      handguard: [{ box: [-34, -20, -170, 34, 34, -58] }],
      stock: [{ box: [-40, -46, 40, 40, 60, 330] }],
      muzzle: [{ box: [-20, -20, -196, 20, 20, -168] }],
      mag: [{ group: 'magazine' }]
    },
    svd: { muzzle: [{ box: [-18, -20, -600, 18, 20, -545] }] },
    remington870: { muzzle: [{ box: [-18, -20, -505, 18, 20, -455] }] },
    glock18c: { muzzle: [{ box: [-14, -16, -125, 14, 16, -108] }] }
  };

  /* Проверка: попадает ли точка в зону (с допуском). */
  const inBox = (b, x, y, z, eps) => {
    const e = eps || 0;
    return x >= b[0] - e && x <= b[3] + e && y >= b[1] - e && y <= b[4] + e
      && z >= b[2] - e && z <= b[5] + e;
  };

  /* Активные зоны для текущей конфигурации: слот занят → его зона включается. */
  function activeZones(weaponKey, config) {
    const table = ZONES[weaponKey] || {};
    const out = [];
    for (const slot in table) {
      const mod = config[slot];
      if (!mod) continue;                        // модуль не установлен — базовая деталь остаётся
      for (const z of table[slot]) out.push(Object.assign({ slot }, z));
    }
    return out;
  }

  /* Вырезание треугольников меша, попавших в зоны.
     Работает с BufferGeometry three.js: помечает вершины «схлопнутыми»
     (все три в одну точку), поэтому треугольник исчезает без перестройки
     индексов. Исходные координаты сохраняются, чтобы вернуть деталь. */
  function carveGeometry(THREE, mesh, zones, matrixToWeapon, unit) {
    unit = unit || 1000;
    const geo = mesh.geometry;
    if (!geo || !geo.attributes || !geo.attributes.position) return 0;
    const pos = geo.attributes.position;
    if (!mesh.userData.__origPos) mesh.userData.__origPos = pos.array.slice();
    const orig = mesh.userData.__origPos;
    const arr = pos.array;
    arr.set(orig);
    if (!zones.length) { pos.needsUpdate = true; return 0; }

    const v = new THREE.Vector3();
    let cut = 0;
    const n = arr.length / 9;                    // треугольников (неиндексированная геометрия)
    for (let t = 0; t < n; t++) {
      const o = t * 9;
      let inside = 0;
      for (let k = 0; k < 3; k++) {
        v.set(orig[o + k * 3], orig[o + k * 3 + 1], orig[o + k * 3 + 2]);
        if (matrixToWeapon) v.applyMatrix4(matrixToWeapon);
        const x = v.x * unit, y = v.y * unit, z = v.z * unit;
        for (const zn of zones) if (inBox(zn.box, x, y, z, 1.5)) { inside++; break; }
      }
      /* треугольник убираем, если он целиком внутри зоны */
      if (inside === 3) {
        for (let k = 1; k < 3; k++) {
          arr[o + k * 3] = arr[o];
          arr[o + k * 3 + 1] = arr[o + 1];
          arr[o + k * 3 + 2] = arr[o + 2];
        }
        cut++;
      }
    }
    pos.needsUpdate = true;
    geo.computeBoundingSphere();
    return cut;
  }

  /* Индексированная геометрия (у некоторых моделей): убираем индексы. */
  function carveIndexed(THREE, mesh, zones, matrixToWeapon, unit) {
    unit = unit || 1000;
    const geo = mesh.geometry;
    const idx = geo.index;
    if (!idx) return carveGeometry(THREE, mesh, zones, matrixToWeapon, unit);
    if (!mesh.userData.__origIdx) mesh.userData.__origIdx = idx.array.slice();
    const orig = mesh.userData.__origIdx;
    const arr = idx.array;
    arr.set(orig);
    if (!zones.length) { idx.needsUpdate = true; return 0; }
    const pos = geo.attributes.position.array;
    const v = new THREE.Vector3();
    let cut = 0;
    for (let t = 0; t < orig.length / 3; t++) {
      let inside = 0;
      for (let k = 0; k < 3; k++) {
        const vi = orig[t * 3 + k] * 3;
        v.set(pos[vi], pos[vi + 1], pos[vi + 2]);
        if (matrixToWeapon) v.applyMatrix4(matrixToWeapon);
        for (const zn of zones) if (inBox(zn.box, v.x * unit, v.y * unit, v.z * unit, 1.5)) { inside++; break; }
      }
      if (inside === 3) {
        arr[t * 3] = arr[t * 3 + 1] = arr[t * 3 + 2] = orig[t * 3];
        cut++;
      }
    }
    idx.needsUpdate = true;
    return cut;
  }

  /* Главная функция: применить скрытие ко всей базовой модели. */
  /* Во сколько раз координаты модели больше метров: у большинства файлов
     геометрия в метрах (1), у MP5 — в миллиметрах (0.001 на единицу). */
  const UNIT = { mp5a3: 1 };

  function apply(THREE, host, weaponKey, config, opts) {
    const O = Object.assign({ names: {}, groups: {} }, opts || {});
    const unit = O.unit !== undefined ? O.unit : (UNIT[weaponKey] !== undefined ? UNIT[weaponKey] : 1000);
    const zones = activeZones(weaponKey, config);
    const byGroup = {};
    for (const z of zones) if (z.group) (byGroup[z.group] = byGroup[z.group] || []).push(z);

    host.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(host.matrixWorld).invert();
    let cutTotal = 0, hidden = 0;

    /* Сначала вернуть всё, что скрывали раньше: снятие модуля возвращает
       базовую деталь на место. */
    host.traverse((o) => {
      if (o.isMesh && o.userData && o.userData.__occHidden && !(o.userData.attachModule)) {
        o.visible = true;
        o.userData.__occHidden = false;
      }
    });

    host.traverse((o) => {
      if (o.userData && o.userData.attachModule) return;   // сами модули не трогаем

      /* Группа-носитель (например «magazine») содержит и базовый магазин,
         и модуль: скрываем в ней только базовые меши, иначе исчезнет и модуль. */
      /* Группа-носитель опознаётся по метке, а не по имени: в части моделей
         магазин назван по-русски и по имени не совпал бы с ключом зоны. */
      const gTag = (o.userData && o.userData.__occGroup) || o.name;
      if (!o.isMesh && gTag && byGroup[gTag]) {
        o.traverse((c) => {
          if (c.isMesh && !(c.userData && c.userData.attachModule)) {
            c.visible = false; c.userData.__occHidden = true; hidden++;
          }
        });
        return;
      }

      if (!o.isMesh) return;
      /* точечное скрытие по имени детали */
      const byName = O.names[o.name];
      if (byName && config[byName]) { o.visible = false; o.userData.__occHidden = true; hidden++; return; }

      /* геометрическое вырезание по зонам */
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      const own = zones.filter((z) => !z.group && z.box);
      cutTotal += o.geometry && o.geometry.index
        ? carveIndexed(THREE, o, own, m, unit)
        : carveGeometry(THREE, o, own, m, unit);
    });

    return { zones: zones.length, cut: cutTotal, hidden };
  }

  return { ZONES, activeZones, apply, carveGeometry, carveIndexed };
};
});

__def("ui", function (module, exports) {
/* ============================================================================
   Интерфейс кастомизации: список слотов, карусель модулей, панель
   характеристик со стрелками +/− (в духе экрана модификации из Bodycam).
   Интерфейс намеренно простой — вся глубина в моделях и в системе слотов.
   ========================================================================== */
module.exports = function () {
  const CSS = `
/* Панель кастомизации.
   Раскладка — вертикальный стек фиксированной высоты, закреплённый у низа
   экрана: подсказка, предупреждение, лента модулей, ряд слотов. Каждая
   секция занимает собственную строку grid, поэтому ничто не наезжает друг
   на друга даже при узком окне и длинных названиях. */
#cust{position:fixed;left:0;right:0;bottom:0;z-index:20;pointer-events:none;
  display:flex;flex-direction:column;justify-content:flex-end;gap:8px;
  padding:0 16px calc(12px + env(safe-area-inset-bottom));
  background:linear-gradient(to top,rgba(6,7,9,.92) 0%,rgba(6,7,9,.72) 55%,rgba(6,7,9,0) 100%);
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,Arial,sans-serif}
#cust.hidden{display:none}
#cust *{box-sizing:border-box}

/* Ряд слотов: одна строка, горизонтальная прокрутка, без переноса. */
#custSlots{display:flex;gap:8px;justify-content:flex-start;align-items:stretch;
  pointer-events:auto;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;
  padding:2px 0;scroll-behavior:smooth}
#custSlots::-webkit-scrollbar{display:none}
.cslot{flex:0 0 auto;width:150px;height:56px;border:1px solid rgba(255,255,255,.14);
  border-radius:9px;background:rgba(14,16,19,.92);backdrop-filter:blur(14px);
  padding:8px 11px;cursor:pointer;transition:border-color .14s,background .14s;
  display:flex;flex-direction:column;justify-content:center;gap:3px;overflow:hidden}
.cslot:hover{background:rgba(30,34,40,.92);border-color:rgba(255,255,255,.26)}
.cslot.on{border-color:#e8b45c;background:rgba(232,180,92,.18)}
.cslot .k{font-size:9.5px;line-height:1.15;letter-spacing:.08em;text-transform:uppercase;
  color:rgba(255,255,255,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cslot .v{font-size:12.5px;line-height:1.25;color:#fff;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.cslot.empty .v{color:rgba(255,255,255,.34)}

/* Лента модулей активного слота — отдельная строка над слотами. */
#custList{display:flex;gap:7px;justify-content:flex-start;padding:2px 0;
  pointer-events:auto;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;
  scroll-behavior:smooth}
#custList::-webkit-scrollbar{display:none}
#custList:empty{display:none}
.copt{flex:0 0 auto;height:38px;display:flex;align-items:center;
  border:1px solid rgba(255,255,255,.14);border-radius:8px;
  background:rgba(14,16,19,.9);padding:0 14px;cursor:pointer;font-size:12.5px;
  line-height:1;color:#dfe3e8;white-space:nowrap;transition:background .14s,border-color .14s}
.copt:hover{background:rgba(32,36,42,.94)}
.copt.sel{border-color:#e8b45c;color:#ffd79a;background:rgba(232,180,92,.16)}

#custStats{position:fixed;left:18px;top:84px;z-index:20;pointer-events:none;
  width:238px;display:flex;flex-direction:column;gap:2px;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif}
.cstat{display:flex;align-items:baseline;justify-content:space-between;gap:12px;
  padding:4px 10px;border-radius:5px;background:rgba(10,12,15,.78);
  border-left:2px solid rgba(255,255,255,.18);font-size:11.5px;line-height:1.35}
.cstat span{color:rgba(255,255,255,.62);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cstat b{font-weight:600;font-variant-numeric:tabular-nums;color:#f0f2f5;white-space:nowrap}
.cstat.up{border-left-color:#63c97a}
.cstat.up b{color:#96e6a6}
.cstat.dn{border-left-color:#e07a6a}
.cstat.dn b{color:#f0a598}
.cstat i{font-style:normal;font-size:10px;margin-left:5px;opacity:.85}

/* Подсказка и предупреждение — собственные строки фиксированной высоты,
   поэтому появление текста не двигает ряды кнопок. */
#custHint{text-align:center;font-size:11px;line-height:16px;height:16px;
  color:rgba(255,255,255,.38);letter-spacing:.02em;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
#custWarn{text-align:center;font-size:11.5px;line-height:16px;min-height:16px;
  color:#e8b45c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#custWarn:empty{display:none}
@media (max-width:900px){
  .cslot{width:126px;height:52px}
  .copt{height:34px;padding:0 11px;font-size:12px}
  #custStats{width:190px;top:70px;left:10px}
  #custHint{font-size:10px}
}
`;

  /* Подписи и порядок показа характеристик. up=true — больше значит лучше. */
  const STAT_DEFS = [
    { k: 'vertRecoil', label: 'Подброс', up: false, fmt: (v) => v.toFixed(2) },
    { k: 'horizRecoil', label: 'Увод', up: false, fmt: (v) => v.toFixed(2) },
    { k: 'hipSpread', label: 'Разброс от бедра', up: false, fmt: (v) => v.toFixed(2) },
    { k: 'adsTime', label: 'Вскидка, с', up: false, fmt: (v) => v.toFixed(3) },
    { k: 'mobility', label: 'Подвижность', up: true, fmt: (v) => v.toFixed(0) },
    { k: 'reloadTime', label: 'Перезарядка, с', up: false, fmt: (v) => v.toFixed(2) },
    { k: 'muzzleVelocity', label: 'Скорость, м/с', up: true, fmt: (v) => v.toFixed(0) },
    { k: 'effectiveRange', label: 'Дальность, м', up: true, fmt: (v) => v.toFixed(0) },
    { k: 'loudness', label: 'Громкость', up: false, fmt: (v) => v.toFixed(0) },
    { k: 'flashVisible', label: 'Заметность вспышки', up: false, fmt: (v) => v.toFixed(0) },
    { k: 'weight', label: 'Масса, г', up: false, fmt: (v) => v.toFixed(0) },
    { k: 'magCap', label: 'Ёмкость', up: true, fmt: (v) => v.toFixed(0) }
  ];

  /* Возвращает исходник браузерного модуля интерфейса (строкой). */
  function source() {
    return `
/* --- интерфейс кастомизации (генерируется src/attach/ui.js) --- */
const CUST_CSS = ${JSON.stringify(CSS)};
const STAT_DEFS = ${JSON.stringify(STAT_DEFS.map((s) => ({ k: s.k, label: s.label, up: s.up, d: s.k === 'vertRecoil' || s.k === 'horizRecoil' || s.k === 'hipSpread' ? 2 : (s.k === 'adsTime' || s.k === 'reloadTime' ? 3 : 0) })))};

function createCustomizer(opts) {
  const style = document.createElement('style');
  style.textContent = CUST_CSS;
  document.head.appendChild(style);

  const host = document.createElement('div'); host.id = 'cust';
  const warn = document.createElement('div'); warn.id = 'custWarn';
  const list = document.createElement('div'); list.id = 'custList';
  const slots = document.createElement('div'); slots.id = 'custSlots';
  const hint = document.createElement('div'); hint.id = 'custHint';
  hint.textContent = 'TAB — панель · 1…9 — слот · ← → — модуль · B — сошки/приклад · C — фонарь · Z — ЛЦУ · X — режим огня';
  /* Порядок строк сверху вниз: подсказка, сообщение, модули, слоты. */
  host.append(hint, warn, list, slots);
  document.body.appendChild(host);

  const statBox = document.createElement('div'); statBox.id = 'custStats';
  document.body.appendChild(statBox);

  let active = null, prevStats = null, notice = '', noticeTimer = 0;

  function renderSlots(defs, cfg) {
    slots.innerHTML = '';
    defs.forEach((s, i) => {
      const cur = cfg[s.key];
      const el = document.createElement('div');
      el.className = 'cslot' + (active === s.key ? ' on' : '') + (cur ? '' : ' empty');
      const k = document.createElement('div'); k.className = 'k';
      k.textContent = (i < 9 ? (i + 1) + ' · ' : '') + s.label;
      k.title = s.label;
      const v = document.createElement('div'); v.className = 'v';
      v.textContent = cur ? opts.nameOf(cur) : '—';
      v.title = v.textContent;
      el.append(k, v);
      el.onclick = () => { active = s.key; render(); };
      slots.appendChild(el);
      if (active === s.key) requestAnimationFrame(() => {
        el.scrollIntoView({ block: 'nearest', inline: 'center' });
      });
    });
  }

  function renderOptions(cfg) {
    list.innerHTML = '';
    if (!active) return;
    let selected = null;
    for (const o of opts.optionsFor(active)) {
      const el = document.createElement('div');
      const isSel = (cfg[active] || null) === o.key;
      el.className = 'copt' + (isSel ? ' sel' : '');
      el.textContent = o.label;
      el.title = o.label;
      el.onclick = () => { opts.setModule(active, o.key); render(); };
      list.appendChild(el);
      if (isSel) selected = el;
    }
    if (selected) requestAnimationFrame(() => {
      selected.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
  }

  function renderStats() {
    const st = opts.getStats();
    statBox.innerHTML = '';
    for (const d of STAT_DEFS) {
      if (st[d.k] === undefined) continue;
      const v = st[d.k], pv = prevStats ? prevStats[d.k] : undefined;
      const changed = pv !== undefined && Math.abs(v - pv) > 1e-6;
      let cls = 'cstat';
      if (changed) cls += ((v > pv) === d.up) ? ' up' : ' dn';
      const row = document.createElement('div');
      row.className = cls;
      const name = document.createElement('span'); name.textContent = d.label;
      const val = document.createElement('b');
      val.textContent = v.toFixed(d.d);
      if (changed) {
        const diff = document.createElement('i');
        const delta = v - pv;
        diff.textContent = (delta > 0 ? '▲' : '▼') + Math.abs(delta).toFixed(d.d);
        val.appendChild(diff);
      }
      row.append(name, val);
      statBox.appendChild(row);
    }
  }

  function render() {
    const cfg = opts.getConfig(), defs = opts.getSlots();
    if (active && !defs.some((s) => s.key === active)) active = null;
    renderSlots(defs, cfg);
    renderOptions(cfg);
    renderStats();
    const w = opts.getWarnings();
    warn.textContent = notice || (w && w.length ? w.join(' · ') : '');
  }

  return {
    render,
    markStats() { prevStats = Object.assign({}, opts.getStats()); },
    setActive(k) { active = k; render(); },
    getActive() { return active; },
    /* Короткое сообщение поверх предупреждений сборки (гаснет само). */
    notify(text) {
      notice = text || '';
      warn.textContent = notice;
      clearTimeout(noticeTimer);
      if (notice) noticeTimer = setTimeout(() => { notice = ''; render(); }, 2600);
    },
    toggle(on) {
      const show = on !== false;
      host.classList.toggle('hidden', !show);
      statBox.style.display = show ? '' : 'none';
      if (show) render();
    },
    visible() { return !host.classList.contains('hidden'); }
  };
}
`;
  }

  return { CSS, STAT_DEFS, source };
};
});

__def("three_adapter", function (module, exports) {
/* ============================================================================
   Адаптер three.js: превращает сборку системы модулей в Object3D.

   На вход — результат assemble() и палитра материалов (common.MATS).
   На выходе — группа с подгруппами по слотам, узлами-ориентирами,
   лучом фонаря, лазерным лучом и API управления модулями в рантайме.

   Геометрия считается в миллиметрах, сцена — в метрах (масштаб 0.001).
   ========================================================================== */
module.exports = function (G, C) {
  const S = 0.001;

  function build(THREE, asm, opts) {
    const O = Object.assign({ scale: S, shadows: true, envIntensity: 1 }, opts || {});
    const root = new THREE.Group();
    root.name = 'weapon';

    const geos = [], mats = [], matMap = {};
    const glassSet = new Set(asm.glass || []);
    const emisSet = new Set(asm.emissive || []);

    const mkMat = (key, partName) => {
      const isGlass = glassSet.has(partName);
      const isEmis = emisSet.has(partName);
      const id = key + (isGlass ? '|g' : '') + (isEmis ? '|e' : '');
      if (matMap[id]) return matMap[id];
      const d = C.MATS[key] || C.MATS.steel;
      let m;
      if (d.alpha !== undefined && d.alpha < 1) {
        m = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(d.color[0], d.color[1], d.color[2]),
          metalness: d.metal, roughness: d.rough,
          transparent: true, opacity: d.alpha, side: THREE.DoubleSide,
          clearcoat: d.coat || 0, clearcoatRoughness: 0.04, depthWrite: false
        });
      } else {
        m = new THREE.MeshStandardMaterial({
          color: new THREE.Color(d.color[0], d.color[1], d.color[2]),
          metalness: d.metal, roughness: d.rough
        });
      }
      if (d.emis) {
        m.emissive = new THREE.Color(d.emis[0], d.emis[1], d.emis[2]);
        m.emissiveIntensity = 1;
        m.toneMapped = false;
      }
      m.envMapIntensity = O.envIntensity;
      matMap[id] = m; mats.push(m);
      return m;
    };

    const toGeo = (raw) => {
      const n = raw.p.length;
      const pos = new Float32Array(n), nrm = new Float32Array(n);
      for (let i = 0; i < n; i++) { pos[i] = raw.p[i] * O.scale; nrm[i] = raw.n[i]; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.computeBoundingSphere();
      geos.push(g);
      return g;
    };

    /* группировка: слот + материал, чтобы модуль можно было скрыть целиком */
    const buckets = {}, order = [];
    for (const p of asm.parts) {
      const grp = p.src || 'base';
      const anim = p.group || 'body';
      /* стёкла и эмиссив держим отдельными мешами — им нужен свой материал */
      const solo = glassSet.has(p.name) || emisSet.has(p.name);
      const key = grp + '|' + anim + '|' + p.mat + (solo ? '|' + p.name : '');
      if (!buckets[key]) { buckets[key] = { grp, anim, mat: p.mat, name: p.name, list: [] }; order.push(key); }
      buckets[key].list.push(p.geo);
    }

    const slotGroups = {}, animGroups = {};
    const groupFor = (slot, anim) => {
      if (!slotGroups[slot]) {
        const g = new THREE.Group();
        g.name = 'slot:' + slot;
        /* пометка нужна системе скрытия: детали модулей она не трогает,
           даже если слот живёт в чужой группе (магазин, затвор) */
        g.userData.attachModule = true;
        /* хост может увести слот в свою анимируемую группу (магазин, затвор) */
        let host = O.parentFor && O.parentFor(slot);
        if (host && typeof host.add !== 'function') host = host.group || host.obj || null;
        const parent = (host && typeof host.add === 'function') ? host : root;
        parent.add(g);
        /* Геометрия модуля уже посчитана в координатах оружия, а группа-
           носитель (магазин, затвор) несёт собственное смещение внутри
           оружия. Без компенсации модуль уезжает на это смещение. */
        if (parent !== root && O.hostRoot) {
          const off = new THREE.Vector3();
          for (let o = parent; o && o !== O.hostRoot; o = o.parent) off.add(o.position);
          g.position.copy(off).negate();
        }
        slotGroups[slot] = g;
      }
      const key = slot + '|' + anim;
      if (!animGroups[key]) {
        const g = new THREE.Group();
        g.name = anim;
        g.userData.attachModule = true;
        slotGroups[slot].add(g);
        animGroups[key] = g;
      }
      return animGroups[key];
    };

    const meshByPart = {};
    for (const k of order) {
      const b = buckets[k];
      const mesh = new THREE.Mesh(toGeo(G.merge(b.list)), mkMat(b.mat, b.name));
      mesh.name = k;
      mesh.userData.attachModule = true;
      mesh.castShadow = O.shadows;
      mesh.receiveShadow = O.shadows;
      groupFor(b.grp, b.anim).add(mesh);
      meshByPart[b.name] = mesh;
    }

    /* узлы-ориентиры */
    const nodes = {};
    for (const nk in asm.nodes) {
      const v = asm.nodes[nk];
      if (!Array.isArray(v) || v.length !== 3) continue;
      const o = new THREE.Object3D();
      o.name = nk;
      o.position.set(v[0] * O.scale, v[1] * O.scale, v[2] * O.scale);
      root.add(o);
      nodes[nk] = o;
    }

    /* ---- луч фонаря и лазер как объекты сцены ---- */
    const beams = [];
    for (const e of asm.emitters || []) {
      const anchor = new THREE.Object3D();
      anchor.position.set(e.pos[0] * O.scale, e.pos[1] * O.scale, e.pos[2] * O.scale);
      const d = new THREE.Vector3(e.dir[0], e.dir[1], e.dir[2]);
      anchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), d);
      anchor.name = 'emitter:' + e.slot + ':' + e.type;
      root.add(anchor);

      if (e.type === 'light') {
        const spot = new THREE.SpotLight(e.color || 0xfff1dc, 0, 60, e.spillAngle || 0.4, 0.45, 1.2);
        spot.position.set(0, 0, 0);
        spot.target.position.set(0, 0, -20);
        anchor.add(spot, spot.target);
        /* видимый конус рассеяния */
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(Math.tan(e.spillAngle || 0.4) * 18, 18, 28, 1, true),
          new THREE.MeshBasicMaterial({ color: e.color || 0xfff1dc, transparent: true,
            opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
        );
        cone.rotation.x = Math.PI / 2;
        cone.position.z = -9;
        anchor.add(cone);
        geos.push(cone.geometry); mats.push(cone.material);
        beams.push({ kind: 'light', slot: e.slot, anchor, spot, cone, meta: e, level: 0 });
      } else {
        const len = 80;
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry((e.beamR || 0.9) * 0.001, (e.beamR || 0.9) * 0.0028, len, 8, 1, true),
          new THREE.MeshBasicMaterial({ color: e.color || 0xff2020, transparent: true,
            opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        beam.rotation.x = -Math.PI / 2;
        beam.position.z = -len / 2;
        anchor.add(beam);
        const dot = new THREE.Sprite(new THREE.SpriteMaterial({ color: e.color || 0xff2020,
          transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        dot.scale.setScalar(0.02);
        anchor.add(dot);
        geos.push(beam.geometry); mats.push(beam.material, dot.material);
        beams.push({ kind: e.type === 'ir' ? 'ir' : 'laser', slot: e.slot, anchor, beam, dot, meta: e, level: 0 });
      }
    }

    /* ---- API рантайма ---- */
    const api = {
      root, nodes, slots: slotGroups, meshes: meshByPart, beams,
      modules: asm.modules, stats: asm.derived, warnings: asm.warnings, errors: asm.errors,

      /* показать/скрыть модуль слота без пересборки */
      setSlotVisible(slotKey, on) {
        const g = slotGroups[slotKey];
        if (g) g.visible = on !== false;
      },

      /* включение фонаря/лазера: level 0..1 */
      setBeam(kind, level, slotKey) {
        for (const b of beams) {
          if (b.kind !== kind) continue;
          if (slotKey && b.slot !== slotKey) continue;
          b.level = Math.max(0, Math.min(1, level));
          if (b.kind === 'light') {
            b.spot.intensity = b.level * (b.meta.lumens ? b.meta.lumens / 120 : 8);
            b.cone.material.opacity = b.level * 0.10;
          } else {
            const vis = b.kind === 'ir' ? b.level * 0.18 : b.level;
            b.beam.material.opacity = vis * 0.30;
            b.dot.material.opacity = vis * 0.95;
          }
        }
      },

      /* подсветка марки прицела */
      setReticle(on, brightness) {
        for (const r of asm.reticles || []) {
          const m = meshByPart[r.part];
          if (!m) continue;
          m.visible = on !== false;
          if (m.material.emissiveIntensity !== undefined)
            m.material.emissiveIntensity = 0.4 + 3.2 * (brightness === undefined ? 1 : brightness);
        }
      },

      /* складывание/раскладывание подвижных модулей (сошки, приклад, магнифер) */
      setDeploy(slotKey, t) {
        const mod = asm.modules[slotKey];
        if (!mod) return;
        const d = mod.meta.deploy || mod.meta.fold || mod.meta.flipAxis;
        if (!d) return;
        const g = slotGroups[slotKey];
        if (!g) return;
        const a0 = d.foldedAngle !== undefined ? d.foldedAngle : 0;
        const a1 = d.deployedAngle !== undefined ? d.deployedAngle : (d.angle || 0);
        const ang = (a0 + (a1 - a0) * t) * Math.PI / 180;
        /* поворот вокруг оси модуля: пивот задан в мм локально */
        const piv = d.pivot || [0, 0, 0];
        const M = mod.matrix;
        const wp = require_xform(M, piv);
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0);
        const v = new THREE.Vector3(wp[0] * O.scale, wp[1] * O.scale, wp[2] * O.scale);
        const q = new THREE.Quaternion().setFromAxisAngle(
          d.axis === 'y' ? new THREE.Vector3(0, 1, 0) : d.axis === 'z'
            ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), ang);
        g.position.copy(v).applyQuaternion(q).multiplyScalar(-1).add(v);
        g.quaternion.copy(q);
      },

      /* Полное снятие сборки со сцены.
         Важно: группы слотов могут висеть не на root, а в анимируемых ригах
         оружия (магазин, затвор). Если удалять только root, такие группы
         остаются в сцене и новые модули накладываются на старые. */
      dispose() {
        for (const k in slotGroups) {
          const g = slotGroups[k];
          if (g.parent) g.parent.remove(g);
        }
        if (root.parent) root.parent.remove(root);
        for (const b of beams) if (b.anchor && b.anchor.parent) b.anchor.parent.remove(b.anchor);
        for (const g of geos) g.dispose();
        for (const m of mats) m.dispose();
        geos.length = 0; mats.length = 0;
      }
    };

    function require_xform(M, v) {
      return [M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12],
        M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13],
        M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14]];
    }

    api.setReticle(true, 1);
    api.setBeam('light', 0); api.setBeam('laser', 0); api.setBeam('ir', 0);
    return api;
  }

  return { build };
};
});

__def("raw_adapter", function (module, exports) {
/* ============================================================================
   Адаптер для «сырых» WebGL-движков (СВД, Remington 870, Glock 18C).

   Эти файлы рисуют индексированные меши собственного формата и не используют
   three.js. Адаптер конвертирует треугольный суп системы модулей в нужный
   формат и отдаёт материалы в терминах конкретного движка.

   Поддерживаемые форматы:
     'pnti' — {p,n,t,e,i}  (СВД): позиция, нормаль, UV, ребро, индексы;
     'pni'  — {p,n,i}      (Glock);
     'posTri' — {pos,nrm,tri} (Remington).
   ========================================================================== */
module.exports = function (G, C) {

  /* Сварка вершин: суп → индексированный меш. Порог 0,02 мм. */
  function weld(raw, fmt) {
    const map = new Map();
    const P = [], N = [], I = [];
    const Q = 50;                                   // 1/0.02 мм
    const n = raw.p.length / 3;
    for (let i = 0; i < n; i++) {
      const x = raw.p[i * 3], y = raw.p[i * 3 + 1], z = raw.p[i * 3 + 2];
      const nx = raw.n[i * 3], ny = raw.n[i * 3 + 1], nz = raw.n[i * 3 + 2];
      /* нормаль входит в ключ: острые рёбра не сглаживаются */
      const k = Math.round(x * Q) + ',' + Math.round(y * Q) + ',' + Math.round(z * Q) + '|' +
        Math.round(nx * 16) + ',' + Math.round(ny * 16) + ',' + Math.round(nz * 16);
      let idx = map.get(k);
      if (idx === undefined) {
        idx = P.length / 3;
        P.push(x, y, z); N.push(nx, ny, nz);
        map.set(k, idx);
      }
      I.push(idx);
    }
    const vc = P.length / 3;
    if (fmt === 'pni') return { p: P, n: N, i: I };
    if (fmt === 'posTri') return { pos: P, nrm: N, tri: I };
    /* pnti: UV по проекции + признак ребра */
    const T = new Array(vc * 2).fill(0), E = new Array(vc).fill(0);
    for (let v = 0; v < vc; v++) {
      T[v * 2] = P[v * 3] * 0.01;
      T[v * 2 + 1] = P[v * 3 + 2] * 0.01;
    }
    return { p: P, n: N, t: T, e: E, i: I };
  }

  /* Материал системы → материал движка. */
  function material(matKey, engine) {
    const d = C.MATS[matKey] || C.MATS.steel;
    if (engine === 'svd') {
      return { base: d.color.slice(), metal: d.metal, rough: d.rough, kind: 0,
        wear: 0.35, axis: 2, opacity: d.alpha === undefined ? 1 : d.alpha,
        emis: d.emis ? d.emis.slice() : [0, 0, 0], aoStr: 1, name: matKey };
    }
    if (engine === 'glock') {
      return { a: d.color.slice(), m: d.metal, r: d.rough, cc: d.coat || 0,
        d: 0, mk: 0, emis: d.emis ? d.emis.slice() : null, alpha: d.alpha };
    }
    /* remington */
    return { base: d.color.slice(), metal: d.metal, rough: d.rough, type: 0,
      ao: 1.0, emis: d.emis ? d.emis.slice() : undefined, alpha: d.alpha };
  }

  /* Разложить сборку по деталям в формате движка.
     scale — множитель (движки работают в мм или в метрах). */
  function convert(asm, o) {
    const O = Object.assign({ fmt: 'pnti', engine: 'svd', scale: 1 }, o || {});
    const out = [];
    for (const p of asm.parts) {
      const raw = O.scale === 1 ? p.geo
        : { p: p.geo.p.map((v) => v * O.scale), n: p.geo.n.slice() };
      out.push({
        name: p.name, slot: p.src, module: p.module,
        mesh: weld(raw, O.fmt),
        mat: material(p.mat, O.engine),
        matKey: p.mat,
        glass: (asm.glass || []).indexOf(p.name) >= 0,
        emissive: (asm.emissive || []).indexOf(p.name) >= 0
      });
    }
    return out;
  }

  return { weld, material, convert };
};
});

__def("slots", function (module, exports) {
/* ============================================================================
   Описания слотов и базовая баллистика по каждому оружию.

   Координаты слотов заданы в системе конкретной модели (мм), взяты из её
   собственных узлов: ось канала ствола, верх крышки/планки, окно магазина.
   pos для планочного слота — центр верхней плоскости планки.
   ========================================================================== */
module.exports = {

  /* --------------------------------------------------------------- АК-74 */
  ak74: {
    title: 'АК-74',
    caliber: 'auto', weight: 3300,
    ballistics: { vertRecoil: 1.35, horizRecoil: 0.80, hipSpread: 2.6, adsTime: 0.30,
      mobility: 100, reloadTime: 2.48, muzzleVelocity: 900, effectiveRange: 400,
      loudness: 100, magCap: 30 },
    /* BORE = 75, крышка коробки ~ y=128, колодка прицела z=-248 */
    slots: [
      { key: 'muzzle', label: 'ДУЛО', type: 'thread', pos: [0, 75, -636], rot: [0, 0, 0],
        accepts: ['muzzle'], order: 0, group: 'body' },
      { key: 'handguard', label: 'ЦЕВЬЁ', type: 'barrel', pos: [0, 75, -300], rot: [0, 0, 0],
        accepts: ['handguard'], length: 240, order: 0, group: 'body' },
      /* Прицел ставится не напрямую, а через кронштейн: крышка с планкой
         садится на коробку (верх коробки y≈100, длина крышки 200 мм назад
         от колодки), боковой — на «ласточкин хвост» слева. */
      { key: 'mount', label: 'КРОНШТЕЙН', type: 'mount', pos: [0, 98, -8], rot: [0, 0, 0],
        accepts: ['mount'], order: 1, group: 'body' },
      /* Штатная планка «ласточкин хвост» на левой стенке коробки: на неё
         садятся прицелы со своим кронштейном (ПСО-1 и подобные). */
      { key: 'sideoptic', label: 'БОК. ПРИЦЕЛ', type: 'dovetail', pos: [-17, 96, -120],
        rot: [0, 0, 0], accepts: ['sideoptic'], order: 1, group: 'body' },
      /* планка крепится на левую щеку цевья: наружная стенка x=-21,
         поэтому посадка чуть дальше и развёрнута наружу (+90° по Z) */
      { key: 'siderail', label: 'БОК. ПЛАНКА', type: 'rail', pos: [-22, 78, -400],
        rot: [0, 0, Math.PI / 2], accepts: ['siderail'], length: 90, order: 1, group: 'body' },
      { key: 'mag', label: 'МАГАЗИН', type: 'well', pos: [0, 42, -122], rot: [0, 0, 0],
        accepts: ['mag'], order: 0, group: 'magazine' },
      { key: 'stock', label: 'ПРИКЛАД', type: 'rear', pos: [0, 48, 6], rot: [0, 0, 0],
        accepts: ['stock'], order: 0, group: 'body' }
    ],
    defaults: { muzzle: 'brake_ak', handguard: 'handguard_wood', mag: 'mag_ak_30',
      stock: 'stock_wood' }
  },

  /* ---------------------------------------------------------------- АКМ */
  akm: {
    title: 'АКМ',
    caliber: 'auto', weight: 3600,
    ballistics: { vertRecoil: 1.70, horizRecoil: 1.05, hipSpread: 2.9, adsTime: 0.32,
      mobility: 96, reloadTime: 2.55, muzzleVelocity: 715, effectiveRange: 350,
      loudness: 106, magCap: 30 },
    slots: [
      { key: 'muzzle', label: 'ДУЛО', type: 'thread', pos: [0, 75, -600], rot: [0, 0, 0],
        accepts: ['muzzle'], order: 0, group: 'body' },
      { key: 'handguard', label: 'ЦЕВЬЁ', type: 'barrel', pos: [0, 75, -290], rot: [0, 0, 0],
        accepts: ['handguard'], length: 220, order: 0, group: 'body' },
      { key: 'mount', label: 'КРОНШТЕЙН', type: 'mount', pos: [0, 97, -10], rot: [0, 0, 0],
        accepts: ['mount'], order: 1, group: 'body' },
      /* «Ласточкин хвост» АКМ: боковая планка на левой стенке (x=-17..-26,
         y=54..80, z=-120..-60) — посадка прицелов с собственным кронштейном. */
      { key: 'sideoptic', label: 'БОК. ПРИЦЕЛ', type: 'dovetail', pos: [-17, 94, -118],
        rot: [0, 0, 0], accepts: ['sideoptic'], order: 1, group: 'body' },
      { key: 'siderail', label: 'БОК. ПЛАНКА', type: 'rail', pos: [-25, 54, -380],
        rot: [0, 0, Math.PI / 2], accepts: ['siderail'], length: 90, order: 1, group: 'body' },
      { key: 'mag', label: 'МАГАЗИН', type: 'well', pos: [0, 42, -120], rot: [0, 0, 0],
        accepts: ['mag'], order: 0, group: 'magazine' },
      { key: 'stock', label: 'ПРИКЛАД', type: 'rear', pos: [0, 48, 8], rot: [0, 0, 0],
        accepts: ['stock'], order: 0, group: 'body' }
    ],
    defaults: { muzzle: 'flash_cone', handguard: 'handguard_wood', mag: 'mag_ak_30',
      stock: 'stock_wood' }
  },

  /* --------------------------------------------------------------- M416 */
  m416: {
    title: 'M416',
    caliber: '5.56', weight: 3200,
    ballistics: { vertRecoil: 1.05, horizRecoil: 0.62, hipSpread: 2.2, adsTime: 0.27,
      mobility: 104, reloadTime: 2.30, muzzleVelocity: 880, effectiveRange: 420,
      loudness: 98, magCap: 30 },
    /* BORE = 70, верхняя планка ресивера y=98..104, длина цевья 240 */
    slots: [
      { key: 'muzzle', label: 'ДУЛО', type: 'thread', pos: [0, 70, -500], rot: [0, 0, 0],
        accepts: ['muzzle'], order: 0, group: 'body' },
      /* цевьё садится на гайку ствола у ресивера: Z=-36, ось канала 70 */
      { key: 'handguard', label: 'ЦЕВЬЁ', type: 'barrel', pos: [0, 70, -36], rot: [0, 0, 0],
        accepts: ['handguard'], length: 260, order: 0, group: 'body' },
      /* штатная планка ресивера: верх на y=104 (98 + 6 высоты основания) */
      { key: 'optic', label: 'ПРИЦЕЛ', type: 'rail', pos: [0, 104, -10], rot: [0, 0, 0],
        accepts: ['optic', 'magnifier', 'ironRear'], length: 170, order: 2, group: 'body' },
      { key: 'mag', label: 'МАГАЗИН', type: 'well', pos: [0, 52, -92], rot: [0, 0, 0],
        accepts: ['mag'], order: 0, group: 'magazine' },
      { key: 'stock', label: 'ПРИКЛАД', type: 'rear', pos: [0, 58, 10], rot: [0, 0, 0],
        accepts: ['stock'], order: 0, group: 'body' }
    ],
    defaults: { muzzle: 'flash_a2', handguard: 'handguard_mlok', mag: 'mag_stanag_30',
      stock: 'stock_telescopic', optic: 'reddot_t2' }
  },

  /* -------------------------------------------------------------- MP5A3 */
  mp5a3: {
    title: 'MP5A3',
    caliber: '9mm', weight: 2900,
    ballistics: { vertRecoil: 0.72, horizRecoil: 0.45, hipSpread: 1.9, adsTime: 0.23,
      mobility: 112, reloadTime: 2.35, muzzleVelocity: 400, effectiveRange: 180,
      loudness: 92, magCap: 30 },
    slots: [
      /* координаты по обмеру модели: дуло -190, цевьё -166..-60, ось 0 */
      { key: 'muzzle', label: 'ДУЛО', type: 'thread', pos: [0, 0, -188], rot: [0, 0, 0],
        accepts: ['muzzle'], order: 0, group: 'body' },
      { key: 'handguard', label: 'ЦЕВЬЁ', type: 'barrel', pos: [0, 0, -62], rot: [0, 0, 0],
        accepts: ['handguard'], length: 200, order: 0, group: 'body' },
      { key: 'optic', label: 'ПРИЦЕЛ', type: 'rail', pos: [0, 40, -30], rot: [0, 0, 0],
        accepts: ['optic', 'magnifier', 'ironRear'], length: 150, order: 2, group: 'body' },
      { key: 'mag', label: 'МАГАЗИН', type: 'well', pos: [0, -14, -96], rot: [0, 0, 0],
        accepts: ['mag'], order: 0, group: 'magazine' },
      { key: 'stock', label: 'ПРИКЛАД', type: 'rear', pos: [0, 4, 40], rot: [0, 0, 0],
        accepts: ['stock'], order: 0, group: 'body' }
    ],
    defaults: { muzzle: 'thread_cap', mag: 'mag_pistol_33', stock: 'stock_telescopic' }
  },

  /* ------------------------------------------------------------- SCAR-H */
  scarh: {
    title: 'SCAR-H',
    caliber: '7.62', weight: 3580,
    ballistics: { vertRecoil: 1.55, horizRecoil: 0.95, hipSpread: 2.7, adsTime: 0.31,
      mobility: 94, reloadTime: 2.60, muzzleVelocity: 800, effectiveRange: 500,
      loudness: 104, magCap: 20 },
    slots: [
      { key: 'muzzle', label: 'ДУЛО', type: 'thread', pos: [0, 0, -430], rot: [0, 0, 0],
        accepts: ['muzzle'], order: 0, group: 'body' },
      { key: 'optic', label: 'ПРИЦЕЛ', type: 'rail', pos: [0, 40, -60], rot: [0, 0, 0],
        accepts: ['optic', 'magnifier', 'ironRear'], length: 200, order: 2, group: 'body' },
      { key: 'under', label: 'НИЖНЯЯ', type: 'rail', pos: [0, -26, -220], rot: [0, 0, Math.PI],
        accepts: ['under'], length: 110, order: 2, group: 'body' },
      { key: 'tactical', label: 'БОКОВАЯ', type: 'rail', pos: [-26, 0, -230], rot: [0, 0, Math.PI / 2],
        accepts: ['tactical'], length: 110, order: 2, group: 'body' },
      { key: 'mag', label: 'МАГАЗИН', type: 'well', pos: [0, -28, -120], rot: [0, 0, 0],
        accepts: ['mag'], order: 0, group: 'magazine' },
      { key: 'stock', label: 'ПРИКЛАД', type: 'rear', pos: [0, -10, 20], rot: [0, 0, 0],
        accepts: ['stock'], order: 0, group: 'body' }
    ],
    defaults: { muzzle: 'flash_a2', optic: 'reddot_t2', mag: 'mag_762_20',
      stock: 'stock_telescopic' }
  },

  /* ----------------------------------------------------------------- СВД */
  svd: {
    title: 'СВД',
    caliber: '7.62', weight: 4300,
    ballistics: { vertRecoil: 2.10, horizRecoil: 1.20, hipSpread: 3.4, adsTime: 0.38,
      mobility: 84, reloadTime: 2.90, muzzleVelocity: 830, effectiveRange: 800,
      loudness: 112, magCap: 10 },
    slots: [
      { key: 'muzzle', label: 'ДУЛО', type: 'thread', pos: [0, 0, -560], rot: [0, 0, 0],
        accepts: ['muzzle'], order: 0, group: 'body' },
      { key: 'sidemount', label: 'КРОНШТЕЙН', type: 'side', pos: [-18, 30, -140], rot: [0, 0, 0],
        accepts: ['sidemount'], order: 1, group: 'body' },
      { key: 'optic', label: 'ПРИЦЕЛ', type: 'rail', pos: [0, 44, -150], rot: [0, 0, 0],
        accepts: ['optic', 'magnifier'], length: 260, order: 2, group: 'body' },
      { key: 'under', label: 'СОШКИ', type: 'rail', pos: [0, -26, -330], rot: [0, 0, Math.PI],
        accepts: ['under'], length: 100, order: 2, group: 'body' },
      { key: 'tactical', label: 'ТАКТИКА', type: 'rail', pos: [-24, -6, -300], rot: [0, 0, Math.PI / 2],
        accepts: ['tactical'], length: 100, order: 2, group: 'body' }
    ],
    /* приклад, магазин и штатный ПСО остаются от базовой модели винтовки */
    defaults: { muzzle: 'flash_cone', under: 'bipod' }
  },

  /* --------------------------------------------------------- Remington 870 */
  remington870: {
    title: 'Remington 870',
    caliber: '12ga', weight: 3600,
    ballistics: { vertRecoil: 3.20, horizRecoil: 1.60, hipSpread: 5.0, adsTime: 0.34,
      mobility: 92, reloadTime: 0.85, muzzleVelocity: 400, effectiveRange: 60,
      loudness: 118, magCap: 5 },
    slots: [
      { key: 'muzzle', label: 'ДУЛО', type: 'thread', pos: [0, 0, -480], rot: [0, 0, 0],
        accepts: ['muzzle'], order: 0, group: 'body' },
      { key: 'optic', label: 'ПРИЦЕЛ', type: 'rail', pos: [0, 32, -60], rot: [0, 0, 0],
        accepts: ['optic', 'ironRear'], length: 120, order: 2, group: 'body' },
      { key: 'tactical', label: 'ФОНАРЬ', type: 'rail', pos: [-22, -8, -300], rot: [0, 0, Math.PI / 2],
        accepts: ['tactical'], length: 90, order: 2, group: 'body' }
    ],
    /* приклад и цевьё — от базовой модели ружья */
    defaults: { optic: 'reddot_rmr', tactical: 'light_tac' }
  },

  /* ---------------------------------------------------------- Glock 18C */
  glock18c: {
    title: 'Glock 18C',
    caliber: '9mm', weight: 620,
    ballistics: { vertRecoil: 0.95, horizRecoil: 0.70, hipSpread: 2.8, adsTime: 0.18,
      mobility: 126, reloadTime: 1.85, muzzleVelocity: 375, effectiveRange: 90,
      loudness: 94, magCap: 17 },
    slots: [
      { key: 'muzzle', label: 'ДУЛО', type: 'thread', pos: [0, 0, -114], rot: [0, 0, 0],
        accepts: ['muzzle'], order: 0, group: 'body' },
      { key: 'optic', label: 'ПРИЦЕЛ', type: 'rail', pos: [0, 15, 40], rot: [0, 0, 0],
        accepts: ['optic'], length: 50, order: 2, group: 'slide' },
      { key: 'tactical', label: 'ФОНАРЬ', type: 'rail', pos: [0, -28, -62], rot: [0, 0, Math.PI],
        accepts: ['tactical'], length: 40, order: 2, group: 'body' }
    ],
    /* магазин — от базовой модели пистолета (он анимирован в перезарядке) */
    defaults: { optic: 'reddot_rmr' }
  }
};
});

  const G = __req('kernel');
  const C = __req('common')(G);
  const SYS = __req('system')(G, C);
  const CATALOGS = [
    __req('optics')(G, C), __req('muzzle')(G, C),
    __req('tactical')(G, C), __req('mags_stocks')(G, C)
  ];
  const REG = SYS.registry(CATALOGS);
  const ADAPTER = __req('three_adapter')(G, C);
  const RAW = __req('raw_adapter')(G, C);
  const OCC = __req('occlude')();
  const UI = __req('ui')();
  const SLOTS = __req('slots');
  return { G, C, SYS, REG, ADAPTER, RAW, OCC, UI, SLOTS, catalogs: CATALOGS };
})();


/* --- интерфейс кастомизации (генерируется src/attach/ui.js) --- */
const CUST_CSS = "\n/* Панель кастомизации.\n   Раскладка — вертикальный стек фиксированной высоты, закреплённый у низа\n   экрана: подсказка, предупреждение, лента модулей, ряд слотов. Каждая\n   секция занимает собственную строку grid, поэтому ничто не наезжает друг\n   на друга даже при узком окне и длинных названиях. */\n#cust{position:fixed;left:0;right:0;bottom:0;z-index:20;pointer-events:none;\n  display:flex;flex-direction:column;justify-content:flex-end;gap:8px;\n  padding:0 16px calc(12px + env(safe-area-inset-bottom));\n  background:linear-gradient(to top,rgba(6,7,9,.92) 0%,rgba(6,7,9,.72) 55%,rgba(6,7,9,0) 100%);\n  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,Arial,sans-serif}\n#cust.hidden{display:none}\n#cust *{box-sizing:border-box}\n\n/* Ряд слотов: одна строка, горизонтальная прокрутка, без переноса. */\n#custSlots{display:flex;gap:8px;justify-content:flex-start;align-items:stretch;\n  pointer-events:auto;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;\n  padding:2px 0;scroll-behavior:smooth}\n#custSlots::-webkit-scrollbar{display:none}\n.cslot{flex:0 0 auto;width:150px;height:56px;border:1px solid rgba(255,255,255,.14);\n  border-radius:9px;background:rgba(14,16,19,.92);backdrop-filter:blur(14px);\n  padding:8px 11px;cursor:pointer;transition:border-color .14s,background .14s;\n  display:flex;flex-direction:column;justify-content:center;gap:3px;overflow:hidden}\n.cslot:hover{background:rgba(30,34,40,.92);border-color:rgba(255,255,255,.26)}\n.cslot.on{border-color:#e8b45c;background:rgba(232,180,92,.18)}\n.cslot .k{font-size:9.5px;line-height:1.15;letter-spacing:.08em;text-transform:uppercase;\n  color:rgba(255,255,255,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.cslot .v{font-size:12.5px;line-height:1.25;color:#fff;white-space:nowrap;\n  overflow:hidden;text-overflow:ellipsis}\n.cslot.empty .v{color:rgba(255,255,255,.34)}\n\n/* Лента модулей активного слота — отдельная строка над слотами. */\n#custList{display:flex;gap:7px;justify-content:flex-start;padding:2px 0;\n  pointer-events:auto;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;\n  scroll-behavior:smooth}\n#custList::-webkit-scrollbar{display:none}\n#custList:empty{display:none}\n.copt{flex:0 0 auto;height:38px;display:flex;align-items:center;\n  border:1px solid rgba(255,255,255,.14);border-radius:8px;\n  background:rgba(14,16,19,.9);padding:0 14px;cursor:pointer;font-size:12.5px;\n  line-height:1;color:#dfe3e8;white-space:nowrap;transition:background .14s,border-color .14s}\n.copt:hover{background:rgba(32,36,42,.94)}\n.copt.sel{border-color:#e8b45c;color:#ffd79a;background:rgba(232,180,92,.16)}\n\n#custStats{position:fixed;left:18px;top:84px;z-index:20;pointer-events:none;\n  width:238px;display:flex;flex-direction:column;gap:2px;\n  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif}\n.cstat{display:flex;align-items:baseline;justify-content:space-between;gap:12px;\n  padding:4px 10px;border-radius:5px;background:rgba(10,12,15,.78);\n  border-left:2px solid rgba(255,255,255,.18);font-size:11.5px;line-height:1.35}\n.cstat span{color:rgba(255,255,255,.62);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.cstat b{font-weight:600;font-variant-numeric:tabular-nums;color:#f0f2f5;white-space:nowrap}\n.cstat.up{border-left-color:#63c97a}\n.cstat.up b{color:#96e6a6}\n.cstat.dn{border-left-color:#e07a6a}\n.cstat.dn b{color:#f0a598}\n.cstat i{font-style:normal;font-size:10px;margin-left:5px;opacity:.85}\n\n/* Подсказка и предупреждение — собственные строки фиксированной высоты,\n   поэтому появление текста не двигает ряды кнопок. */\n#custHint{text-align:center;font-size:11px;line-height:16px;height:16px;\n  color:rgba(255,255,255,.38);letter-spacing:.02em;white-space:nowrap;\n  overflow:hidden;text-overflow:ellipsis}\n#custWarn{text-align:center;font-size:11.5px;line-height:16px;min-height:16px;\n  color:#e8b45c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n#custWarn:empty{display:none}\n@media (max-width:900px){\n  .cslot{width:126px;height:52px}\n  .copt{height:34px;padding:0 11px;font-size:12px}\n  #custStats{width:190px;top:70px;left:10px}\n  #custHint{font-size:10px}\n}\n";
const STAT_DEFS = [{"k":"vertRecoil","label":"Подброс","up":false,"d":2},{"k":"horizRecoil","label":"Увод","up":false,"d":2},{"k":"hipSpread","label":"Разброс от бедра","up":false,"d":2},{"k":"adsTime","label":"Вскидка, с","up":false,"d":3},{"k":"mobility","label":"Подвижность","up":true,"d":0},{"k":"reloadTime","label":"Перезарядка, с","up":false,"d":3},{"k":"muzzleVelocity","label":"Скорость, м/с","up":true,"d":0},{"k":"effectiveRange","label":"Дальность, м","up":true,"d":0},{"k":"loudness","label":"Громкость","up":false,"d":0},{"k":"flashVisible","label":"Заметность вспышки","up":false,"d":0},{"k":"weight","label":"Масса, г","up":false,"d":0},{"k":"magCap","label":"Ёмкость","up":true,"d":0}];

function createCustomizer(opts) {
  const style = document.createElement('style');
  style.textContent = CUST_CSS;
  document.head.appendChild(style);

  const host = document.createElement('div'); host.id = 'cust';
  const warn = document.createElement('div'); warn.id = 'custWarn';
  const list = document.createElement('div'); list.id = 'custList';
  const slots = document.createElement('div'); slots.id = 'custSlots';
  const hint = document.createElement('div'); hint.id = 'custHint';
  hint.textContent = 'TAB — панель · 1…9 — слот · ← → — модуль · B — сошки/приклад · C — фонарь · Z — ЛЦУ · X — режим огня';
  /* Порядок строк сверху вниз: подсказка, сообщение, модули, слоты. */
  host.append(hint, warn, list, slots);
  document.body.appendChild(host);

  const statBox = document.createElement('div'); statBox.id = 'custStats';
  document.body.appendChild(statBox);

  let active = null, prevStats = null, notice = '', noticeTimer = 0;

  function renderSlots(defs, cfg) {
    slots.innerHTML = '';
    defs.forEach((s, i) => {
      const cur = cfg[s.key];
      const el = document.createElement('div');
      el.className = 'cslot' + (active === s.key ? ' on' : '') + (cur ? '' : ' empty');
      const k = document.createElement('div'); k.className = 'k';
      k.textContent = (i < 9 ? (i + 1) + ' · ' : '') + s.label;
      k.title = s.label;
      const v = document.createElement('div'); v.className = 'v';
      v.textContent = cur ? opts.nameOf(cur) : '—';
      v.title = v.textContent;
      el.append(k, v);
      el.onclick = () => { active = s.key; render(); };
      slots.appendChild(el);
      if (active === s.key) requestAnimationFrame(() => {
        el.scrollIntoView({ block: 'nearest', inline: 'center' });
      });
    });
  }

  function renderOptions(cfg) {
    list.innerHTML = '';
    if (!active) return;
    let selected = null;
    for (const o of opts.optionsFor(active)) {
      const el = document.createElement('div');
      const isSel = (cfg[active] || null) === o.key;
      el.className = 'copt' + (isSel ? ' sel' : '');
      el.textContent = o.label;
      el.title = o.label;
      el.onclick = () => { opts.setModule(active, o.key); render(); };
      list.appendChild(el);
      if (isSel) selected = el;
    }
    if (selected) requestAnimationFrame(() => {
      selected.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
  }

  function renderStats() {
    const st = opts.getStats();
    statBox.innerHTML = '';
    for (const d of STAT_DEFS) {
      if (st[d.k] === undefined) continue;
      const v = st[d.k], pv = prevStats ? prevStats[d.k] : undefined;
      const changed = pv !== undefined && Math.abs(v - pv) > 1e-6;
      let cls = 'cstat';
      if (changed) cls += ((v > pv) === d.up) ? ' up' : ' dn';
      const row = document.createElement('div');
      row.className = cls;
      const name = document.createElement('span'); name.textContent = d.label;
      const val = document.createElement('b');
      val.textContent = v.toFixed(d.d);
      if (changed) {
        const diff = document.createElement('i');
        const delta = v - pv;
        diff.textContent = (delta > 0 ? '▲' : '▼') + Math.abs(delta).toFixed(d.d);
        val.appendChild(diff);
      }
      row.append(name, val);
      statBox.appendChild(row);
    }
  }

  function render() {
    const cfg = opts.getConfig(), defs = opts.getSlots();
    if (active && !defs.some((s) => s.key === active)) active = null;
    renderSlots(defs, cfg);
    renderOptions(cfg);
    renderStats();
    const w = opts.getWarnings();
    warn.textContent = notice || (w && w.length ? w.join(' · ') : '');
  }

  return {
    render,
    markStats() { prevStats = Object.assign({}, opts.getStats()); },
    setActive(k) { active = k; render(); },
    getActive() { return active; },
    /* Короткое сообщение поверх предупреждений сборки (гаснет само). */
    notify(text) {
      notice = text || '';
      warn.textContent = notice;
      clearTimeout(noticeTimer);
      if (notice) noticeTimer = setTimeout(() => { notice = ''; render(); }, 2600);
    },
    toggle(on) {
      const show = on !== false;
      host.classList.toggle('hidden', !show);
      statBox.style.display = show ? '' : 'none';
      if (show) render();
    },
    visible() { return !host.classList.contains('hidden'); }
  };
}


/* ---- интеграция кастомизации (шаблон, подставляется tools/build.js) ---- */
const ATTACH_DEF = __ATTACH.SLOTS["ak74"];
const ATTACH_STATE = {
  config: Object.assign({}, ATTACH_DEF.defaults),
  asm: null, view: null, ui: null,
  toggles: { light: 0, laser: 0, ir: 0, deploy: {} }
};
/* деталь базовой модели -> слот, который её заменяет (для точечного скрытия) */
const ATTACH_HIDE_BY_NAME = {"muzzleBrake":"muzzle","handguardLower":"handguard","hgFerrule":"handguard","handguardUpper":"handguard","hgFerruleUp":"handguard","stock":"stock","buttPlate":"stock","buttTrap":"stock","slingLoop":"stock","magBody":"mag","magLugFront":"mag","magLugRear":"mag","magMouth":"mag","magTopRound":"mag","dustCover":"mount"};

/* Список модулей, подходящих слоту (для интерфейса).
   В списке остаётся только то, что реально встаёт на это место: серые
   «ненажимаемые» карточки не показываются, иначе меню забито мусором. */
function attachOptionsFor(slotKey) {
  const slot = attachSlots().find((s) => s.key === slotKey);
  if (!slot) return [];
  const accepts = __ATTACH.SYS.slotAccepts(slot);
  const out = [{ key: null, label: '— НЕТ —', fits: true }];
  for (const key of __ATTACH.REG.keys()) {
    let meta;
    /* модули с регулируемой длиной оцениваем уже подогнанными под слот */
    const opts = (slot.length && __ATTACH.REG.fitsLength(key)) ? { len: slot.length } : {};
    try { meta = __ATTACH.REG.meta(key, opts); } catch (e) { continue; }
    const face = __ATTACH.SYS.slotFace(slot);
    const wants = meta.slot === 'optic' && face === 'side' && meta.canBeOffset
      ? 'optic_offset' : meta.slot;
    if (accepts.indexOf(wants) < 0) continue;
    const fit = __ATTACH.SYS.checkFit(slot, Object.assign({ key }, meta),
      { caliber: ATTACH_DEF.caliber }, {});
    if (!fit.ok) continue;                    // несовместимое просто не предлагаем
    out.push({ key, label: meta.name, short: meta.short, fits: true });
  }
  return out;
}

/* Слоты: статические из описания + динамические от цевья. */
function attachSlots() {
  const base = ATTACH_DEF.slots.slice();
  if (ATTACH_STATE.asm && ATTACH_STATE.asm.slotsDynamic)
    for (const d of ATTACH_STATE.asm.slotsDynamic)
      if (!base.some((b) => b.key === d.key)) base.push(d);
  return base;
}

function attachNameOf(key) {
  try { return __ATTACH.REG.meta(key).name; } catch (e) { return String(key); }
}

/* Пересборка: снять старую группу, собрать новую, вернуть узлы. */
function attachRebuild(THREE, parent, baseParts, weaponNodes) {
  if (ATTACH_STATE.view) {
    parent.remove(ATTACH_STATE.view.root);
    ATTACH_STATE.view.dispose();
  }
  const weapon = {
    caliber: ATTACH_DEF.caliber, weight: ATTACH_DEF.weight,
    ballistics: ATTACH_DEF.ballistics, stats: {},
    base: baseParts || [], nodes: weaponNodes || {}, slots: attachSlots()
  };
  const asm = __ATTACH.SYS.assemble(weapon, __ATTACH.REG, ATTACH_STATE.config);
  const view = __ATTACH.ADAPTER.build(THREE, asm, { scale: 0.001 });
  parent.add(view.root);
  ATTACH_STATE.asm = asm;
  ATTACH_STATE.view = view;
  /* вернуть прежние состояния переключателей */
  view.setBeam('light', ATTACH_STATE.toggles.light);
  view.setBeam('laser', ATTACH_STATE.toggles.laser);
  view.setBeam('ir', ATTACH_STATE.toggles.ir);
  for (const k in ATTACH_STATE.toggles.deploy) view.setDeploy(k, ATTACH_STATE.toggles.deploy[k]);
  return asm;
}

/* Скрытие заменяемых деталей базовой модели: зоны включаются по конфигурации.
   Вызывается после каждой пересборки, поэтому снятие модуля возвращает
   исходную деталь на место. */
function attachOcclude(THREE, host) {
  if (!host) return null;
  return __ATTACH.OCC.apply(THREE, host, "ak74", ATTACH_STATE.config, {
    names: ATTACH_HIDE_BY_NAME, groups: {}
  });
}

/* Публичный API: смена модулей из консоли, автотестов и внешнего интерфейса.
   Реальная функция подстановки регистрируется интеграцией оружия. */
window.ATTACH = {
  set(slotKey, moduleKey) {
    if (!ATTACH_STATE.apply) throw new Error('система ещё не готова');
    ATTACH_STATE.apply(slotKey, moduleKey);
    return window.__ATTACH_DEBUG();
  },
  get: () => Object.assign({}, ATTACH_STATE.config),
  slots: () => attachSlots().map((s) => s.key),
  options: (slotKey) => attachOptionsFor(slotKey),
  preset: {
    save: () => __ATTACH.SYS.presetCodec().encode(ATTACH_STATE.config),
    load(code) {
      const cfg = __ATTACH.SYS.presetCodec().decode(code);
      /* Слоты-потомки (планки цевья и кронштейна) появляются только после
         установки носителя, поэтому список слотов перечитывается на каждом
         шаге, а проход повторяется, пока не перестанут возникать новые. */
      const done = {};
      for (let pass = 0; pass < 4; pass++) {
        const keys = attachSlots().map((s) => s.key);
        let changed = false;
        for (const k of keys) {
          if (done[k]) continue;
          done[k] = true;
          changed = true;
          window.ATTACH.set(k, cfg[k] || null);
        }
        if (!changed) break;
      }
      return window.__ATTACH_DEBUG();
    }
  },
  beam: (kind, level) => ATTACH_STATE.view.setBeam(kind, level),
  deploy: (slotKey, t) => ATTACH_STATE.view.setDeploy(slotKey, t),
  stats: () => (ATTACH_STATE.asm ? ATTACH_STATE.asm.derived : {})
};

/* Отладочный хук: состояние сборки доступно из консоли и автотестов. */
window.__ATTACH_DEBUG = () => ({
  weapon: "ak74",
  config: ATTACH_STATE.config,
  modules: ATTACH_STATE.asm ? Object.keys(ATTACH_STATE.asm.modules) : [],
  parts: ATTACH_STATE.asm ? ATTACH_STATE.asm.parts.length : 0,
  errors: ATTACH_STATE.asm ? ATTACH_STATE.asm.errors : [],
  warnings: ATTACH_STATE.asm ? ATTACH_STATE.asm.warnings : [],
  stats: ATTACH_STATE.asm ? ATTACH_STATE.asm.derived : {}
});

/* Управление с клавиатуры: TAB — панель, цифры — слот, стрелки — перебор. */

/* Есть ли на оружии прибор, который умеет светить/давать луч нужного типа.
   Физика простая: включать можно только то, что установлено. Клавиша не
   доставляет приборы «из воздуха» — она лишь щёлкает выключателем. */
function attachHasEmitter(kind) {
  const asm = ATTACH_STATE.asm;
  if (!asm) return false;
  for (const e of asm.emitters || []) {
    if (kind === 'light' && e.type === 'light') return true;
    if (kind === 'laser' && e.type === 'laser') return true;
    if (kind === 'ir' && e.type === 'ir') return true;
  }
  return false;
}

/* Короткое сообщение в панели: почему клавиша «не сработала». */
function attachNotify(text) {
  if (ATTACH_STATE.ui && ATTACH_STATE.ui.notify) ATTACH_STATE.ui.notify(text);
}

const BEAM_NAME = { light: 'фонарь', laser: 'ЛЦУ', ir: 'ИК-луч' };

function attachToggleBeam(kind) {
  if (!ATTACH_STATE.view) return;
  if (!attachHasEmitter(kind)) {
    /* прибора нет — гасим возможный остаточный флаг и сообщаем стрелку */
    ATTACH_STATE.toggles[kind] = 0;
    ATTACH_STATE.view.setBeam(kind, 0);
    attachNotify('Не установлен ' + (BEAM_NAME[kind] || kind) + ' — повесьте прибор на планку');
    return;
  }
  ATTACH_STATE.toggles[kind] = ATTACH_STATE.toggles[kind] ? 0 : 1;
  ATTACH_STATE.view.setBeam(kind, ATTACH_STATE.toggles[kind]);
}

/* После каждой пересборки: снятый прибор уносит с собой своё свечение. */
function attachSyncBeams() {
  for (const kind of ['light', 'laser', 'ir']) {
    if (!attachHasEmitter(kind)) ATTACH_STATE.toggles[kind] = 0;
    if (ATTACH_STATE.view) ATTACH_STATE.view.setBeam(kind, ATTACH_STATE.toggles[kind]);
  }
}

/* Складные узлы (сошки, приклад, магнифер) — то же правило: состояние
   живёт ровно столько, сколько стоит сам модуль. */
function attachSyncDeploy() {
  const asm = ATTACH_STATE.asm;
  const dep = ATTACH_STATE.toggles.deploy;
  for (const k in dep) if (!asm || !asm.modules[k]) delete dep[k];
  if (!ATTACH_STATE.view) return;
  for (const k in dep) ATTACH_STATE.view.setDeploy(k, dep[k]);
}

/* Модули, у которых есть подвижная часть. */
function attachFoldables() {
  const asm = ATTACH_STATE.asm;
  if (!asm) return [];
  return Object.keys(asm.modules).filter((sk) => {
    const m = asm.modules[sk].meta;
    return !!(m.deploy || m.fold || m.flipAxis || m.foldAxis);
  });
}

function attachBindKeys(onChange) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const ui = ATTACH_STATE.ui;
    if (e.code === 'Tab') { e.preventDefault(); if (ui) ui.toggle(!ui.visible()); return; }
    if (e.code === 'KeyC') { attachToggleBeam('light'); return; }
    if (e.code === 'KeyZ') { attachToggleBeam('laser'); return; }
    if (e.code === 'KeyX') { if (typeof window.__cycleFireMode === 'function') window.__cycleFireMode(); return; }
    if (e.code === 'KeyB') {
      const list = attachFoldables();
      if (!list.length) { attachNotify('Складывать нечего: сошки и складной приклад не установлены'); return; }
      for (const sk of list) {
        const cur = ATTACH_STATE.toggles.deploy[sk] || 0;
        const next = cur > 0.5 ? 0 : 1;
        ATTACH_STATE.toggles.deploy[sk] = next;
        ATTACH_STATE.view.setDeploy(sk, next);
      }
      return;
    }
    if (!ui || !ui.visible()) return;
    const slots = attachSlots();
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= slots.length) { ui.setActive(slots[n - 1].key); return; }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      const act = ui.getActive();
      if (!act) return;
      e.preventDefault();
      const opts = attachOptionsFor(act).filter((o) => o.fits);
      const cur = ATTACH_STATE.config[act] || null;
      let i = opts.findIndex((o) => o.key === cur);
      if (i < 0) i = 0;
      i = (i + (e.code === 'ArrowRight' ? 1 : opts.length - 1)) % opts.length;
      onChange(act, opts[i].key);
      ui.render();
    }
  });
}



/* --- процедурная геометрия АК-74: ядро + модули деталей --- */
const __AKM = {};
function __akdef(name, fn) { const module = { exports: {} }; fn(module, module.exports); __AKM[name] = module.exports; }
__akdef("geom", function (module, exports) {
/* ============================================================================
   AKGeom — компактное ядро процедурной геометрии (без внешних зависимостей).
   Выдаёт «суп» треугольников {p:[x,y,z...], n:[nx,ny,nz...]}.
   Работает и в Node (экспорт/рендер-проверка), и в браузере.
   ========================================================================== */
(function (root, factory) {
  const G = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  else root.AKGeom = G;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const EPS = 1e-9;

  /* ---------------------------------------------------------------- базовое */
  const geo = () => ({ p: [], n: [] });

  function tri(g, A, B, C, nA, nB, nC) {
    g.p.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
    g.n.push(nA[0], nA[1], nA[2], nB[0], nB[1], nB[2], nC[0], nC[1], nC[2]);
  }
  function quad(g, A, B, C, D, nA, nB, nC, nD) {
    tri(g, A, B, C, nA, nB, nC);
    tri(g, A, C, D, nA, nC, nD);
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  const faceN = (A, B, C) => norm(cross(sub(B, A), sub(C, A)));

  /* треугольник с плоской нормалью */
  function triFlat(g, A, B, C) { const n = faceN(A, B, C); tri(g, A, B, C, n, n, n); }
  function quadFlat(g, A, B, C, D) { triFlat(g, A, B, C); triFlat(g, A, C, D); }

  /* убрать вырожденные треугольники и починить нормали */
  function clean(g) {
    const out = geo(), p = g.p, n = g.n;
    for (let i = 0; i < p.length; i += 9) {
      const A = [p[i], p[i + 1], p[i + 2]], B = [p[i + 3], p[i + 4], p[i + 5]], C = [p[i + 6], p[i + 7], p[i + 8]];
      if (!isFinite(A[0] + A[1] + A[2] + B[0] + B[1] + B[2] + C[0] + C[1] + C[2])) continue;
      const c = cross(sub(B, A), sub(C, A));
      const a2 = Math.hypot(c[0], c[1], c[2]);
      if (!(a2 > 1e-6)) continue;
      const fn = [c[0] / a2, c[1] / a2, c[2] / a2];
      out.p.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
      for (let k = 0; k < 3; k++) {
        const o = i + k * 3, l = Math.hypot(n[o], n[o + 1], n[o + 2]);
        if (!(l > 1e-4)) out.n.push(fn[0], fn[1], fn[2]);
        else out.n.push(n[o] / l, n[o + 1] / l, n[o + 2] / l);
      }
    }
    return out;
  }

  function merge(list) {
    const out = geo();
    for (const g of list) {
      if (!g) continue;
      const gp = g.p, gn = g.n;
      for (let i = 0; i < gp.length; i++) out.p.push(gp[i]);
      for (let i = 0; i < gn.length; i++) out.n.push(gn[i]);
    }
    return out;
  }

  /* ------------------------------------------------------------ трансформы */
  function transform(g, m) {                       // m — 4x4, column-major (как в three)
    const p = g.p, n = g.n;
    // нормальная матрица = верхняя 3x3 без переноса (масштаб у нас однородный)
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      p[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
      p[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      p[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      const a = n[i], b = n[i + 1], c = n[i + 2];
      let nx = m[0] * a + m[4] * b + m[8] * c;
      let ny = m[1] * a + m[5] * b + m[9] * c;
      let nz = m[2] * a + m[6] * b + m[10] * c;
      const l = Math.hypot(nx, ny, nz) || 1;
      n[i] = nx / l; n[i + 1] = ny / l; n[i + 2] = nz / l;
    }
    return g;
  }
  const mIdent = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function mMul(a, b) {                            // a*b
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  const mTrans = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  const mScale = (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
  const mRotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
  const mRotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
  const mRotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
  /* базис из трёх ортов + начало координат */
  const mBasis = (e1, e2, e3, o) => [e1[0], e1[1], e1[2], 0, e2[0], e2[1], e2[2], 0, e3[0], e3[1], e3[2], 0, o[0], o[1], o[2], 1];

  const tr = (g, x, y, z) => transform(g, mTrans(x, y, z));
  const rx = (g, a) => transform(g, mRotX(a));
  const ry = (g, a) => transform(g, mRotY(a));
  const rz = (g, a) => transform(g, mRotZ(a));

  /* зеркало по X с исправлением обхода треугольников */
  function mirrorX(src) {
    const g = { p: src.p.slice(), n: src.n.slice() };
    for (let i = 0; i < g.p.length; i += 3) { g.p[i] = -g.p[i]; g.n[i] = -g.n[i]; }
    for (let i = 0; i < g.p.length; i += 9) {       // поменять местами 2-ю и 3-ю вершины
      for (let k = 0; k < 3; k++) {
        let t = g.p[i + 3 + k]; g.p[i + 3 + k] = g.p[i + 6 + k]; g.p[i + 6 + k] = t;
        t = g.n[i + 3 + k]; g.n[i + 3 + k] = g.n[i + 6 + k]; g.n[i + 6 + k] = t;
      }
    }
    return g;
  }

  /* ------------------------------------------------------- 2D: контуры */
  /* pts: [[x,y] | [x,y,r]] — замкнутый многоугольник; r — радиус скругления угла.
     Возврат: [{x,y,s}] где s=true — гладкая стыковка с предыдущим ребром. */
  function round(pts, defR) {
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const c = pts[i], p0 = pts[(i - 1 + n) % n], p1 = pts[(i + 1) % n];
      const r = c.length > 2 ? c[2] : (defR || 0);
      const d0 = [p0[0] - c[0], p0[1] - c[1]], d1 = [p1[0] - c[0], p1[1] - c[1]];
      const l0 = Math.hypot(d0[0], d0[1]), l1 = Math.hypot(d1[0], d1[1]);
      if (r <= 1e-6 || l0 < EPS || l1 < EPS) { out.push({ x: c[0], y: c[1], s: false }); continue; }
      const rr = Math.min(r, l0 * 0.499, l1 * 0.499);
      const u0 = [d0[0] / l0, d0[1] / l0], u1 = [d1[0] / l1, d1[1] / l1];
      const A = [c[0] + u0[0] * rr, c[1] + u0[1] * rr];
      const B = [c[0] + u1[0] * rr, c[1] + u1[1] * rr];
      const dot = Math.max(-1, Math.min(1, u0[0] * u1[0] + u0[1] * u1[1]));
      const segs = Math.max(2, Math.min(14, Math.ceil((Math.PI - Math.acos(dot)) / 0.26)));
      for (let k = 0; k <= segs; k++) {
        const t = k / segs, it = 1 - t;
        out.push({
          x: it * it * A[0] + 2 * it * t * c[0] + t * t * B[0],
          y: it * it * A[1] + 2 * it * t * c[1] + t * t * B[1],
          s: true
        });
      }
    }
    return out;
  }
  const rect = (x0, y0, x1, y1, r) => round([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], r || 0);
  function circle(cx, cy, r, seg) {
    seg = seg || Math.max(16, Math.ceil(r * 6));
    const o = [];
    for (let i = 0; i < seg; i++) { const a = i / seg * TAU; o.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, s: true }); }
    return o;
  }
  function ellipse(cx, cy, rx0, ry0, seg) {
    seg = seg || 40; const o = [];
    for (let i = 0; i < seg; i++) { const a = i / seg * TAU; o.push({ x: cx + Math.cos(a) * rx0, y: cy + Math.sin(a) * ry0, s: true }); }
    return o;
  }
  const area2 = (c) => { let a = 0; for (let i = 0, n = c.length; i < n; i++) { const p = c[i], q = c[(i + 1) % n]; a += p.x * q.y - q.x * p.y; } return a / 2; };
  const ccw = (c) => (area2(c) < 0 ? c.slice().reverse() : c);
  const cw = (c) => (area2(c) > 0 ? c.slice().reverse() : c);

  /* --------------------------------------------------- триангуляция (ear) */
  function bridgeHoles(outer, holes) {
    let poly = outer.map((p, i) => ({ x: p.x, y: p.y, s: p.s }));
    const hs = holes.slice().sort((a, b) => hMaxX(b) - hMaxX(a));
    for (const h of hs) poly = bridgeOne(poly, h);
    return poly;
  }
  function hMaxX(h) { let m = -Infinity; for (const p of h) m = Math.max(m, p.x); return m; }
  function bridgeOne(poly, hole) {
    let hi = 0;
    for (let i = 1; i < hole.length; i++) if (hole[i].x > hole[hi].x) hi = i;
    const H = hole[hi];
    let best = -1, bestD = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i];
      const d = (P.x - H.x) * (P.x - H.x) + (P.y - H.y) * (P.y - H.y);
      if (d >= bestD) continue;
      if (!visible(poly, hole, H, P, i, hi)) continue;
      best = i; bestD = d;
    }
    if (best < 0) best = 0;
    const out = poly.slice(0, best + 1);
    for (let k = 0; k <= hole.length; k++) out.push(hole[(hi + k) % hole.length]);
    out.push(poly[best]);
    return out.concat(poly.slice(best + 1));
  }
  function visible(poly, hole, A, B, ai, bi) {
    const test = (arr) => {
      for (let i = 0, n = arr.length; i < n; i++) {
        const P = arr[i], Q = arr[(i + 1) % n];
        if (segInt(A, B, P, Q)) return false;
      }
      return true;
    };
    return test(poly) && test(hole);
  }
  function segInt(a, b, c, d) {
    const sameP = (p, q) => Math.abs(p.x - q.x) < 1e-7 && Math.abs(p.y - q.y) < 1e-7;
    if (sameP(a, c) || sameP(a, d) || sameP(b, c) || sameP(b, d)) return false;
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
  }
  /* ear clipping для простого многоугольника (CCW) → массив индексов */
  function earcut(poly) {
    const n = poly.length;
    const idx = []; for (let i = 0; i < n; i++) idx.push(i);
    const out = [];
    let guard = 0;
    const A = (i, j, k) => {
      const p = poly[i], q = poly[j], r = poly[k];
      return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    };
    const inTri = (a, b, c, p) => {
      const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
      const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
      const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
      const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
      const pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      return !(neg && pos);
    };
    while (idx.length > 3 && guard++ < 40000) {
      let clipped = false;
      for (let i = 0; i < idx.length; i++) {
        const i0 = idx[(i - 1 + idx.length) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length];
        if (A(i0, i1, i2) <= 1e-12) continue;
        let ok = true;
        for (let j = 0; j < idx.length; j++) {
          const jj = idx[j];
          if (jj === i0 || jj === i1 || jj === i2) continue;
          if (inTri(poly[i0], poly[i1], poly[i2], poly[jj])) { ok = false; break; }
        }
        if (!ok) continue;
        out.push(i0, i1, i2);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
      if (!clipped) { idx.splice(1, 1); }        // аварийный выход из вырожденного случая
    }
    if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
    return out;
  }

  /* --------------------------------------------------------------- контур */
  /* нормали рёбер и вершин контура */
  function contourNormals(c) {
    const n = c.length, en = [], vn = [];
    for (let i = 0; i < n; i++) {
      const a = c[i], b = c[(i + 1) % n];
      let dx = b.x - a.x, dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      en.push([dy / l, -dx / l]);
    }
    for (let i = 0; i < n; i++) {
      const prev = en[(i - 1 + n) % n], cur = en[i];
      if (c[i].s) {
        let x = prev[0] + cur[0], y = prev[1] + cur[1];
        const l = Math.hypot(x, y) || 1;
        vn.push({ a: [x / l, y / l], b: [x / l, y / l] });
      } else vn.push({ a: prev, b: cur });
    }
    return { en, vn };
  }
  /* смещение контура внутрь материала на d (митра с ограничением) */
  function offsetContour(c, d) {
    const { en } = contourNormals(c), n = c.length, out = [];
    for (let i = 0; i < n; i++) {
      const prev = en[(i - 1 + n) % n], cur = en[i];
      let mx = prev[0] + cur[0], my = prev[1] + cur[1];
      const l = Math.hypot(mx, my);
      if (l < 1e-6) { out.push({ x: c[i].x, y: c[i].y, s: c[i].s }); continue; }
      mx /= l; my /= l;
      let k = d / Math.max(0.4, mx * cur[0] + my * cur[1]);
      out.push({ x: c[i].x - mx * k, y: c[i].y - my * k, s: c[i].s });
    }
    return out;
  }

  /* ------------------------------------------------------------- extrude */
  /* shape: {outer:[pts], holes:[[pts],...]}  |  просто контур
     o: {z0, z1, ch (фаска), capA, capB} */
  function extrude(shape, o) {
    o = o || {};
    const outer = ccw(Array.isArray(shape) ? shape : shape.outer);
    const holes = ((shape.holes) || []).map(cw);
    const z0 = o.z0 !== undefined ? o.z0 : 0;
    const z1 = o.z1 !== undefined ? o.z1 : (z0 + (o.depth || 1));
    const ch = Math.max(0, Math.min(o.ch === undefined ? 0 : o.ch, Math.abs(z1 - z0) * 0.45));
    const capA = o.capA !== false, capB = o.capB !== false;
    const g = geo();
    const zs = ch > 0 ? [z0, z0 + ch, z1 - ch, z1] : [z0, z1];
    const offs = ch > 0 ? [ch, 0, 0, ch] : [0, 0];
    const all = [outer].concat(holes);

    for (const c of all) {
      const rings = offs.map((d) => (d > 0 ? offsetContour(c, d) : c));
      const nrm = rings.map(contourNormals);
      for (let L = 0; L < zs.length - 1; L++) {
        const cA = rings[L], cB = rings[L + 1], zA = zs[L], zB = zs[L + 1];
        const bevel = offs[L] !== offs[L + 1];
        const zdir = offs[L] > offs[L + 1] ? -1 : 1;   // фаска у ближнего или дальнего торца
        const sgn = L === 0 ? -1 : 1;
        const nA = nrm[L], nB = nrm[L + 1];
        for (let i = 0, n = cA.length; i < n; i++) {
          const j = (i + 1) % n;
          const P0 = [cA[i].x, cA[i].y, zA], P1 = [cA[j].x, cA[j].y, zA];
          const P2 = [cB[j].x, cB[j].y, zB], P3 = [cB[i].x, cB[i].y, zB];
          const e = nA.en[i];
          let n0, n1;
          if (bevel) {
            const kz = (offs[L] > offs[L + 1]) ? -1 : 1;
            const w = norm([e[0], e[1], kz * 1.0]);
            n0 = w; n1 = w;
          } else {
            n0 = [nA.vn[i].b[0], nA.vn[i].b[1], 0];
            n1 = [nA.vn[j].a[0], nA.vn[j].a[1], 0];
          }
          const m0 = bevel ? n0 : n0, m1 = bevel ? n1 : n1;
          quad(g, P0, P1, P2, P3, m0, m1, m1, m0);
        }
      }
    }
    /* торцы */
    const capRing = (d) => ({
      outer: d > 0 ? offsetContour(outer, d) : outer,
      holes: holes.map((h) => (d > 0 ? offsetContour(h, d) : h))
    });
    if (capB) {
      const r = capRing(offs[offs.length - 1]);
      const poly = r.holes.length ? bridgeHoles(r.outer, r.holes) : r.outer;
      const ids = earcut(poly);
      const N = [0, 0, 1];
      for (let i = 0; i < ids.length; i += 3) {
        tri(g, [poly[ids[i]].x, poly[ids[i]].y, z1], [poly[ids[i + 1]].x, poly[ids[i + 1]].y, z1],
          [poly[ids[i + 2]].x, poly[ids[i + 2]].y, z1], N, N, N);
      }
    }
    if (capA) {
      const r = capRing(offs[0]);
      const poly = r.holes.length ? bridgeHoles(r.outer, r.holes) : r.outer;
      const ids = earcut(poly);
      const N = [0, 0, -1];
      for (let i = 0; i < ids.length; i += 3) {
        tri(g, [poly[ids[i]].x, poly[ids[i]].y, z0], [poly[ids[i + 2]].x, poly[ids[i + 2]].y, z0],
          [poly[ids[i + 1]].x, poly[ids[i + 1]].y, z0], N, N, N);
      }
    }
    return g;
  }
  /* удобные обёртки: выдавливание вдоль X и Y */
  const extrudeX = (s, o) => ry(extrude(s, o), Math.PI / 2);   // локальные (u,v)→(z→x)
  const extrudeY = (s, o) => rx(extrude(s, o), -Math.PI / 2);

  /* --------------------------------------------------------------- lathe */
  /* профиль: [{r,z,s}] — обход «материал слева»; вращение вокруг оси Z */
  function lathe(profile, seg, closed, arc, a0) {
    seg = seg || 48; arc = arc === undefined ? TAU : arc; a0 = a0 || 0;
    const g = geo();
    /* профиль должен быть CCW в плоскости (r,z) — иначе нормали смотрят внутрь */
    {
      let ar = 0;
      for (let i = 0; i < profile.length; i++) {
        const a = profile[i], b = profile[(i + 1) % profile.length];
        ar += a.r * b.z - b.r * a.z;
      }
      if (ar < 0) profile = profile.slice().reverse();
    }
    const N = profile.length;
    const last = closed ? N : N - 1;
    // нормали в плоскости (r,z)
    const en = [];
    for (let i = 0; i < last; i++) {
      const a = profile[i], b = profile[(i + 1) % N];
      let dr = b.r - a.r, dz = b.z - a.z;
      const l = Math.hypot(dr, dz) || 1;
      en.push([dz / l, -dr / l]);
    }
    const vnA = [], vnB = [];
    for (let i = 0; i < N; i++) {
      const pe = en[(i - 1 + last) % last], ce = en[Math.min(i, last - 1)];
      const usePrev = closed || i > 0, useCur = closed || i < last;
      const P = usePrev ? pe : ce, C = useCur ? ce : pe;
      if (profile[i].s) {
        let x = P[0] + C[0], y = P[1] + C[1];
        const l = Math.hypot(x, y) || 1;
        vnA.push([x / l, y / l]); vnB.push([x / l, y / l]);
      } else { vnA.push(P); vnB.push(C); }
    }
    const full = Math.abs(arc - TAU) < 1e-6;
    for (let s = 0; s < seg; s++) {
      const t0 = a0 + arc * s / seg, t1 = a0 + arc * (s + 1) / seg;
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      for (let i = 0; i < last; i++) {
        const a = profile[i], b = profile[(i + 1) % N];
        if (a.r < EPS && b.r < EPS) continue;
        const nA = vnB[i], nB = vnA[(i + 1) % N];
        const A0 = [a.r * c0, a.r * s0, a.z], A1 = [a.r * c1, a.r * s1, a.z];
        const B0 = [b.r * c0, b.r * s0, b.z], B1 = [b.r * c1, b.r * s1, b.z];
        const na0 = [nA[0] * c0, nA[0] * s0, nA[1]], na1 = [nA[0] * c1, nA[0] * s1, nA[1]];
        const nb0 = [nB[0] * c0, nB[0] * s0, nB[1]], nb1 = [nB[0] * c1, nB[0] * s1, nB[1]];
        if (a.r < EPS) tri(g, A0, B1, B0, na0, nb1, nb0);
        else if (b.r < EPS) tri(g, A0, A1, B0, na0, na1, nb0);
        else quad(g, A1, B1, B0, A0, na1, nb1, nb0, na0);
      }
    }
    if (!full) {                                   // боковые «щёки» у сектора
      [[a0, -1], [a0 + arc, 1]].forEach(([t, sg]) => {
        const c = Math.cos(t), s = Math.sin(t);
        const nx = -Math.sin(t) * sg, ny = Math.cos(t) * sg;
        const NN = [nx, ny, 0];
        const poly = profile.map((q) => ({ x: q.r, y: q.z }));
        const ids = earcut(ccw(poly.map((q) => ({ x: q.x, y: q.y, s: false }))));
        const src = ccw(poly.map((q) => ({ x: q.x, y: q.y, s: false })));
        for (let i = 0; i < ids.length; i += 3) {
          const P = [0, 1, 2].map((k) => {
            const q = src[ids[i + k]];
            return [q.x * c, q.x * s, q.y];
          });
          if (sg > 0) tri(g, P[0], P[2], P[1], NN, NN, NN);
          else tri(g, P[0], P[1], P[2], NN, NN, NN);
        }
      });
    }
    return g;
  }

  /* цилиндр/труба вдоль Z */
  function cyl(r0, r1, z0, z1, seg, caps) {
    const pr = [];
    if (caps !== false) pr.push({ r: 0, z: z0, s: false });
    pr.push({ r: r0, z: z0, s: false }, { r: r1, z: z1, s: false });
    if (caps !== false) pr.push({ r: 0, z: z1, s: false });
    return lathe(pr, seg || 32, false);
  }
  function tube(rIn, rOut, z0, z1, seg) {
    return lathe([{ r: rIn, z: z0, s: false }, { r: rOut, z: z0, s: false },
    { r: rOut, z: z1, s: false }, { r: rIn, z: z1, s: false }], seg || 40, true);
  }
  function torus(R, r, segA, segB, arc, a0) {
    segA = segA || 40; segB = segB || 16; arc = arc === undefined ? TAU : arc; a0 = a0 || 0;
    const pr = [];
    for (let i = 0; i < segB; i++) {
      const a = i / segB * TAU;
      pr.push({ r: R + Math.cos(a) * r, z: Math.sin(a) * r, s: true });
    }
    return lathe(pr, segA, true, arc, a0);
  }

  /* ---------------------------------------------------------------- loft */
  /* rings: [[ [x,y,z] × K ] × M] — замкнутые кольца одинаковой длины */
  function loft(rings, capA, capB, openRing) {
    const M = rings.length, K = rings[0].length;
    const acc = [];
    for (let s = 0; s < M; s++) { acc.push([]); for (let i = 0; i < K; i++) acc[s].push([0, 0, 0]); }
    const kEnd = openRing ? K - 1 : K;
    const addN = (s, i, n) => { const a = acc[s][i]; a[0] += n[0]; a[1] += n[1]; a[2] += n[2]; };
    for (let s = 0; s < M - 1; s++) {
      for (let i = 0; i < kEnd; i++) {
        const j = (i + 1) % K;
        const A = rings[s][i], B = rings[s][j], C = rings[s + 1][j], D = rings[s + 1][i];
        const n = norm(cross(sub(B, A), sub(D, A)));
        addN(s, i, n); addN(s, j, n); addN(s + 1, j, n); addN(s + 1, i, n);
      }
    }
    for (let s = 0; s < M; s++) for (let i = 0; i < K; i++) acc[s][i] = norm(acc[s][i]);
    const g = geo();
    for (let s = 0; s < M - 1; s++) {
      for (let i = 0; i < kEnd; i++) {
        const j = (i + 1) % K;
        quad(g, rings[s][i], rings[s][j], rings[s + 1][j], rings[s + 1][i],
          acc[s][i], acc[s][j], acc[s + 1][j], acc[s + 1][i]);
      }
    }
    const cap = (ring, flip) => {
      const c = [0, 0, 0];
      for (const p of ring) { c[0] += p[0] / K; c[1] += p[1] / K; c[2] += p[2] / K; }
      for (let i = 0; i < K; i++) {
        const j = (i + 1) % K;
        if (flip) triFlat(g, c, ring[j], ring[i]); else triFlat(g, c, ring[i], ring[j]);
      }
    };
    if (capA) cap(rings[0], true);
    if (capB) cap(rings[M - 1], false);
    return g;
  }

  /* суперэллипс — база для рукояток, прикладов, магазинов */
  function superRing(a, bUp, bDn, k, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = i / n * TAU, c = Math.cos(t), s = Math.sin(t);
      const b = s >= 0 ? bUp : bDn;
      out.push([
        Math.sign(c) * a * Math.pow(Math.abs(c), 2 / k),
        Math.sign(s) * b * Math.pow(Math.abs(s), 2 / k)
      ]);
    }
    return out;
  }

  /* сетка-оболочка с отверстиями (дульный тормоз, кожухи) */
  function perfShell(o) {
    const rO = o.rOut, rI = o.rIn, th = o.thetas, zs = o.zs, hole = o.hole;
    const g = geo();
    const V = (r, t, z) => [Math.cos(t) * r, Math.sin(t) * r, z];
    const nT = th.length - 1, nZ = zs.length - 1, open = [];
    for (let i = 0; i < nT; i++) { open.push([]); for (let j = 0; j < nZ; j++) open[i].push(hole((th[i] + th[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2)); }
    for (let i = 0; i < nT; i++) for (let j = 0; j < nZ; j++) {
      const t0 = th[i], t1 = th[i + 1], z0 = zs[j], z1 = zs[j + 1];
      const n0 = [Math.cos(t0), Math.sin(t0), 0], n1 = [Math.cos(t1), Math.sin(t1), 0];
      const m0 = [-n0[0], -n0[1], 0], m1 = [-n1[0], -n1[1], 0];
      if (!open[i][j]) {
        quad(g, V(rO, t0, z0), V(rO, t1, z0), V(rO, t1, z1), V(rO, t0, z1), n0, n1, n1, n0);
        quad(g, V(rI, t0, z0), V(rI, t0, z1), V(rI, t1, z1), V(rI, t1, z0), m0, m0, m1, m1);
        if (o.capBack && j === 0) { const n = [0, 0, -1]; quad(g, V(rI, t1, z0), V(rO, t1, z0), V(rO, t0, z0), V(rI, t0, z0), n, n, n, n); }
        if (o.capFront && j === nZ - 1) { const n = [0, 0, 1]; quad(g, V(rO, t0, z1), V(rO, t1, z1), V(rI, t1, z1), V(rI, t0, z1), n, n, n, n); }
      } else {
        const L = open[(i - 1 + nT) % nT][j], R = open[(i + 1) % nT][j];
        const B = j > 0 ? open[i][j - 1] : true, F = j < nZ - 1 ? open[i][j + 1] : true;
        if (!L) { const n = [-Math.sin(t0), Math.cos(t0), 0]; quad(g, V(rI, t0, z1), V(rO, t0, z1), V(rO, t0, z0), V(rI, t0, z0), n, n, n, n); }
        if (!R) { const n = [Math.sin(t1), -Math.cos(t1), 0]; quad(g, V(rO, t1, z0), V(rO, t1, z1), V(rI, t1, z1), V(rI, t1, z0), n, n, n, n); }
        if (!B) { const n = [0, 0, 1]; quad(g, V(rO, t0, z0), V(rO, t1, z0), V(rI, t1, z0), V(rI, t0, z0), n, n, n, n); }
        if (!F) { const n = [0, 0, -1]; quad(g, V(rI, t1, z1), V(rO, t1, z1), V(rO, t0, z1), V(rI, t0, z1), n, n, n, n); }
      }
    }
    return g;
  }

  function bounds(g) {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < g.p.length; i += 3) for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], g.p[i + k]); mx[k] = Math.max(mx[k], g.p[i + k]);
    }
    return { min: mn, max: mx };
  }

  return {
    TAU, geo, tri, quad, triFlat, quadFlat, merge, transform, bounds,
    mIdent, mMul, mTrans, mScale, mRotX, mRotY, mRotZ, mBasis,
    tr, rx, ry, rz, mirrorX, norm, cross, sub,
    round, rect, circle, ellipse, ccw, cw, offsetContour,
    extrude, extrudeX, extrudeY, lathe, cyl, tube, torus, loft, superRing, perfShell, earcut, bridgeHoles, clean
  };
});

});
__akdef("helpers", function (module, exports) {
/* Общие хелперы и константы модели АК-74 (всё в мм) */
module.exports = function (G) {
  const PI = Math.PI, TAU = PI * 2, D = (d) => d * PI / 180;
  const { round, extrude, lathe, merge, tr, rx, ry, rz, cyl } = G;

  const MATS = {
    blued:  { color: [0.070, 0.074, 0.081], metal: 1.00, rough: 0.28 },
    park:   { color: [0.098, 0.097, 0.094], metal: 0.92, rough: 0.54 },
    steel:  { color: [0.165, 0.170, 0.180], metal: 1.00, rough: 0.33 },
    wood:   { color: [0.330, 0.130, 0.046], metal: 0.00, rough: 0.38 },
    woodDk: { color: [0.198, 0.074, 0.026], metal: 0.00, rough: 0.44 },
    plum:   { color: [0.245, 0.072, 0.062], metal: 0.06, rough: 0.36 },
    poly:   { color: [0.040, 0.040, 0.043], metal: 0.00, rough: 0.50 },
    brass:  { color: [0.620, 0.465, 0.170], metal: 1.00, rough: 0.25 },
    copper: { color: [0.575, 0.320, 0.160], metal: 1.00, rough: 0.29 },
    lead:   { color: [0.330, 0.335, 0.345], metal: 1.00, rough: 0.45 },
    bore:   { color: [0.010, 0.010, 0.012], metal: 0.30, rough: 0.85 },
    mark:   { color: [0.560, 0.560, 0.560], metal: 0.40, rough: 0.50 }
  };

  const BORE = 75;
  const Z = {
    butt: 225, recvRear: 8, recvFront: -242,
    rsbRear: -242, rsbFront: -302, notch: -248,
    hgRear: -306, hgFront: -492,
    gasRear: -494, gasFront: -534,
    fsbRear: -611, fsbFront: -641, post: -626,
    brakeRear: -636, brakeFront: -718,
    boltFace: -211,
    portRear: -124, portFront: -168,
    magRear: -88, magFront: -158
  };

  /* —— сглаживание ОТКРЫТОЙ ломаной (концы остаются острыми) —— */
  function smoothPath(pts, defR) {
    const out = [{ x: pts[0][0], y: pts[0][1], s: false }];
    for (let i = 1; i < pts.length - 1; i++) {
      const c = pts[i], p0 = pts[i - 1], p1 = pts[i + 1];
      const r = c.length > 2 ? c[2] : (defR || 0);
      const d0 = [p0[0] - c[0], p0[1] - c[1]], d1 = [p1[0] - c[0], p1[1] - c[1]];
      const l0 = Math.hypot(d0[0], d0[1]), l1 = Math.hypot(d1[0], d1[1]);
      if (r <= 1e-6 || l0 < 1e-9 || l1 < 1e-9) { out.push({ x: c[0], y: c[1], s: false }); continue; }
      const rr = Math.min(r, l0 * 0.49, l1 * 0.49);
      const u0 = [d0[0] / l0, d0[1] / l0], u1 = [d1[0] / l1, d1[1] / l1];
      const A = [c[0] + u0[0] * rr, c[1] + u0[1] * rr], B = [c[0] + u1[0] * rr, c[1] + u1[1] * rr];
      const dot = Math.max(-1, Math.min(1, u0[0] * u1[0] + u0[1] * u1[1]));
      const segs = Math.max(2, Math.min(12, Math.ceil((PI - Math.acos(dot)) / 0.28)));
      for (let k = 0; k <= segs; k++) {
        const t = k / segs, it = 1 - t;
        out.push({ x: it * it * A[0] + 2 * it * t * c[0] + t * t * B[0],
                   y: it * it * A[1] + 2 * it * t * c[1] + t * t * B[1], s: true });
      }
    }
    const L = pts[pts.length - 1];
    out.push({ x: L[0], y: L[1], s: false });
    return out;
  }

  /* нормали открытой ломаной (side=+1 — справа по ходу движения) */
  function pathNormals(P, side) {
    const n = P.length, en = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = P[i + 1].x - P[i].x, dy = P[i + 1].y - P[i].y, l = Math.hypot(dx, dy) || 1;
      en.push([side * dy / l, -side * dx / l]);
    }
    const vn = [];
    for (let i = 0; i < n; i++) {
      const a = en[Math.max(0, i - 1)], b = en[Math.min(en.length - 1, i)];
      let x = a[0] + b[0], y = a[1] + b[1]; const l = Math.hypot(x, y) || 1;
      vn.push([x / l, y / l]);
    }
    return vn;
  }

  /* замкнутый контур полосы толщины t вдоль открытой ломаной */
  function bandContour(pts, r, t, side) {
    const P = smoothPath(pts, r), N = pathNormals(P, side);
    const outer = P.map((p) => ({ x: p.x, y: p.y, s: p.s }));
    const inner = P.map((p, i) => ({ x: p.x - N[i][0] * t, y: p.y - N[i][1] * t, s: p.s }));
    outer[0].s = false; outer[outer.length - 1].s = false;
    inner[0].s = false; inner[inner.length - 1].s = false;
    return outer.concat(inner.reverse());
  }

  /* сечение → кольцо loft'а; точки с s=false дублируются → резкое ребро */
  function ringOf(sec, f) {
    const out = [];
    for (const p of sec) { if (!p.s) out.push(f(p)); out.push(f(p)); }
    return out;
  }

  const prof = (a) => a.map((p) => ({ r: p[0], z: p[1], s: p[2] === 's' }));

  /* заклёпка с полукруглой головкой, ось +Z (профиль в CCW порядке) */
  function rivet(d, h, seg) {
    const r = d / 2, p = [{ r: 0, z: -0.6, s: false }, { r: r, z: -0.6, s: false }, { r: r, z: 0, s: false }];
    const n = 6;
    for (let i = 1; i <= n; i++) { const a = i / n * PI / 2; p.push({ r: r * Math.cos(a), z: h * Math.sin(a), s: true }); }
    return lathe(p, seg || 18, false);
  }
  const rivetX = (x, y, z, d, h) => tr(ry(rivet(d, h), Math.sign(x) * PI / 2), x, y, z);
  const rivetY = (x, y, z, d, h, dir) => tr(rx(rivet(d, h), (dir < 0 ? 1 : -1) * PI / 2), x, y, z);
  const rivetZ = (x, y, z, d, h, dir) => tr((dir < 0 ? rx(rivet(d, h), PI) : rivet(d, h)), x, y, z);

  /* штифт/ось вдоль X с головками */
  function pinX(x0, x1, r, y, z, head) {
    const g = [tr(ry(cyl(r, r, 0, x1 - x0, 20), PI / 2), x0, y, z)];
    if (head) {
      g.push(tr(ry(cyl(r + 0.9, r + 0.9, -0.8, 0, 20), PI / 2), x0, y, z));
      g.push(tr(ry(cyl(r + 0.9, r + 0.9, x1 - x0, x1 - x0 + 0.8, 20), PI / 2), x0, y, z));
    }
    return merge(g);
  }

  /* шар */
  function sphere(r, seg) {
    const p = [], n = seg || 14;
    for (let i = 0; i <= n; i++) { const a = -PI / 2 + PI * i / n; p.push({ r: r * Math.cos(a), z: r * Math.sin(a), s: true }); }
    p[0].s = false; p[p.length - 1].s = false;
    return lathe(p, (seg || 14) * 2, false);
  }

  /* коробка со скруглёнными углами в XY, вытянутая по Z */
  const boxZ = (x0, y0, x1, y1, z0, z1, r, ch) =>
    extrude(round([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], r || 0), { z0, z1, ch: ch === undefined ? 0.3 : ch });

  /* то же, но сечение в (Z,Y), толщина по X */
  const boxX = (z0, y0, z1, y1, x0, x1, r, ch) =>
    G.extrudeX(round([[-z0, y0], [-z1, y0], [-z1, y1], [-z0, y1]], r || 0), { z0: x0, z1: x1, ch: ch === undefined ? 0.3 : ch });

  /* профиль в (Z,Y) → геометрия толщиной по X. pts: [[z,y] | [z,y,r]] */
  const plateZY = (pts, x0, x1, ch) =>
    G.extrudeX(round(pts.map((p) => (p.length > 2 ? [-p[0], p[1], p[2]] : [-p[0], p[1]])), 0), { z0: x0, z1: x1, ch: ch === undefined ? 0.3 : ch });

  /* профиль в (X,Z) → геометрия толщиной по Y. pts: [[x,z] | [x,z,r]] */
  const plateXZ = (pts, y0, y1, ch) =>
    G.extrudeY(round(pts.map((p) => (p.length > 2 ? [p[0], -p[1], p[2]] : [p[0], -p[1]])), 0), { z0: y0, z1: y1, ch: ch === undefined ? 0.3 : ch });

  /* рифлёние: набор параллельных валиков вдоль X на поверхности y=const */
  function ribsZ(n, z0, z1, x0, x1, y, h, w) {
    const g = [];
    for (let i = 0; i < n; i++) {
      const zc = z0 + (z1 - z0) * (i + 0.5) / n;
      g.push(G.extrudeX(round([[-(zc - w / 2), y - h], [-(zc + w / 2), y - h], [-(zc + w / 2), y + h * 0.15], [-(zc - w / 2), y + h * 0.15]], w * 0.45), { z0: x0, z1: x1, ch: 0.15 }));
    }
    return merge(g);
  }

  return {
    PI, TAU, D, MATS, BORE, Z,
    smoothPath, pathNormals, bandContour, ringOf, prof,
    rivet, rivetX, rivetY, rivetZ, pinX, sphere, boxZ, boxX, plateZY, plateXZ, ribsZ
  };
};

});
__akdef("p_receiver", function (module, exports) {
/* Ствольная коробка, крышка, колодка прицела */
module.exports = function (G, H, C) {
  const { round, extrude, lathe, cyl, tube, merge, tr, rx, ry, rz, loft } = G;
  const { PI, D, BORE, Z, bandContour, ringOf, plateZY, rivetX, rivetY, pinX } = H;
  const parts = [];
  const add = (name, mat, geo) => { parts.push({ name, mat, geo }); return geo; };

  const RX = 17.5, WT = 1.05, RBOT = 30, RTOP = 93, RCOR = 6;
  C.RX = RX; C.RTOP = RTOP; C.RBOT = RBOT;

  /* ================= корпус (штампованный лист) ================= */
  const shell = [];

  /* дно со скруглёнными нижними углами */
  const bottomSec = (xa, xb) => bandContour(
    [[xa, RBOT + RCOR], [xa, RBOT, RCOR], [xb, RBOT, RCOR], [xb, RBOT + RCOR]], 0, WT, -1);
  const bottomSeg = (z0, z1, xa, xb) =>
    extrude(bottomSec(xa === undefined ? RX : xa, xb === undefined ? -RX : xb), { z0, z1, ch: 0.25 });

  shell.push(bottomSeg(Z.recvFront, Z.magFront));
  shell.push(bottomSeg(Z.magRear, -76));
  shell.push(bottomSeg(-76, -30, RX, 8), bottomSeg(-76, -30, -8, -RX));
  shell.push(bottomSeg(-30, Z.recvRear));

  /* боковые стенки */
  const yBot = RBOT + RCOR - 0.5;
  shell.push(plateZY([[Z.recvRear, yBot], [Z.recvRear, RTOP, 2], [Z.recvFront, RTOP, 2], [Z.recvFront, yBot]], -RX, -RX + WT, 0.3));
  const zSlot = -40, ySlot = 82;
  shell.push(plateZY([[Z.recvRear, yBot], [Z.recvRear, RTOP, 2], [zSlot, RTOP, 1.5], [zSlot, ySlot, 1.5],
  [Z.portRear, ySlot, 2], [Z.portRear, 70, 3], [Z.portFront, 70, 3], [Z.portFront, RTOP, 2],
  [Z.recvFront, RTOP, 2], [Z.recvFront, yBot]], RX - WT, RX, 0.3));

  /* отбортовка нижней кромки окна выброса */
  shell.push(plateZY([[Z.portRear - 4, 70], [Z.portRear - 4, 65.5, 1.6], [Z.portFront + 4, 65.5, 1.6], [Z.portFront + 4, 70]], RX - WT, RX + 0.8, 0.3));

  /* верхние направляющие (загиб внутрь) */
  const rail = (side) => bandContour([[side * RX, RTOP], [side * (RX - 5.5), RTOP]], 0, WT, side);
  shell.push(extrude(rail(1), { z0: Z.recvFront, z1: Z.portFront, ch: 0.2 }));
  shell.push(extrude(rail(1), { z0: zSlot, z1: Z.recvRear, ch: 0.2 }));
  shell.push(extrude(rail(-1), { z0: Z.recvFront, z1: Z.recvRear, ch: 0.2 }));

  /* «губы» магазинного окна */
  const lip = (z0, z1) => extrude(round([[-RX + 0.7, RBOT - 0.3], [RX - 0.7, RBOT - 0.3], [RX - 0.7, RBOT + 5.5], [-RX + 0.7, RBOT + 5.5]], 1.2), { z0, z1, ch: 0.4 });
  shell.push(lip(Z.magFront - 4.5, Z.magFront + 1.5), lip(Z.magRear - 1.5, Z.magRear + 4.5));

  /* задняя стенка */
  shell.push(extrude(round([[-RX + WT, RBOT + 2], [RX - WT, RBOT + 2], [RX - WT, RTOP - 2], [-RX + WT, RTOP - 2]], 3), { z0: 1.5, z1: Z.recvRear, ch: 0.5 }));
  add('receiver', 'park', merge(shell));

  /* передняя колодка (вкладыш) */
  add('trunnion', 'steel', merge([
    extrude(round([[-15.9, 33], [15.9, 33], [15.9, 90], [-15.9, 90]], 4), { z0: Z.recvFront + 2, z1: Z.portFront + 4, ch: 0.7 }),
    tr(cyl(11.4, 11.4, Z.recvFront - 3, Z.recvFront + 4, 30), 0, BORE, 0)
  ]));

  /* заклёпки */
  const rv = [];
  [[-228, 45], [-228, 84], [-198, 45], [-198, 84], [-176, 64]].forEach(([z, y]) =>
    rv.push(rivetX(RX, y, z, 5.4, 1.6), rivetX(-RX, y, z, 5.4, 1.6)));
  [[-104, 43], [-100, 61]].forEach(([z, y]) =>
    rv.push(rivetX(RX, y, z, 5.0, 1.5), rivetX(-RX, y, z, 5.0, 1.5)));
  [[3, 47], [3, 74]].forEach(([z, y]) =>
    rv.push(rivetX(RX, y, z, 5.4, 1.6), rivetX(-RX, y, z, 5.4, 1.6)));
  [[-72, 12.5], [-26, 12.5]].forEach(([z, x]) =>
    rv.push(rivetY(x, RBOT - 0.3, z, 5, 1.5), rivetY(-x, RBOT - 0.3, z, 5, 1.5)));
  add('rivets', 'steel', merge(rv));

  /* упор переводчика (выступ на правой стенке) */
  add('selectorStop', 'park', plateZY([[-30, 74], [-30, 84, 2], [-58, 84, 2], [-58, 74]], RX, RX + 1.4, 0.4));

  /* ================= крышка ствольной коробки ================= */
  const COVX = RX + 1.7, COVY0 = 92, COVTOP = BORE + 38, COVTH = 1.15, KK = 2.60;
  function archBase() {
    const N = 44, pts = [];
    const a = COVX, b = COVTOP - COVY0;
    for (let i = 0; i <= N; i++) {
      const ang = PI * (1 - i / N);
      const c = Math.cos(ang), s = Math.max(0, Math.sin(ang));
      pts.push({
        x: Math.sign(c) * a * Math.pow(Math.abs(c), 2 / KK),
        y: COVY0 + b * Math.pow(s, 2 / KK)
      });
    }
    const nr = pts.map((p, i) => {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)];
      let dx = p1.x - p0.x, dy = p1.y - p0.y; const l = Math.hypot(dx, dy) || 1;
      return [dy / l, -dx / l];
    });
    return { pts, nr };
  }
  const ARCH = archBase();
  function coverRing(z, ribAmp) {
    const { pts, nr } = ARCH, a = COVX;
    const outer = pts.map((p, i) => {
      const q = Math.abs(p.x) / a;
      const bump = Math.exp(-Math.pow((q - 0.50) / 0.17, 2)) * (1 - Math.pow(q, 8));
      const o = ribAmp * bump;
      return { x: p.x + nr[i][0] * o, y: p.y + nr[i][1] * o, s: true };
    });
    const inner = pts.map((p, i) => ({ x: p.x - nr[i][0] * COVTH, y: p.y - nr[i][1] * COVTH, s: true }));
    outer[0].s = false; outer[outer.length - 1].s = false;
    inner[0].s = false; inner[inner.length - 1].s = false;
    const sec = [].concat(
      [{ x: a, y: COVY0 - 5.5, s: false }],
      outer,
      [{ x: -a, y: COVY0 - 5.5, s: false }, { x: -a + COVTH, y: COVY0 - 5.5, s: false }],
      inner.slice().reverse(),
      [{ x: a - COVTH, y: COVY0 - 5.5, s: false }]
    );
    return ringOf(sec, (p) => [p.x, p.y, z]);
  }
  {
    const z0 = -247, z1 = 9, st = [], N = 56;
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = z0 + (z1 - z0) * t;
      const fade = Math.min(1, Math.max(0, (t - 0.05) / 0.09)) * Math.min(1, Math.max(0, (0.96 - t) / 0.09));
      st.push(coverRing(z, 1.6 * fade));
    }
    add('dustCover', 'park', loft(st, true, true));
  }
  /* ================= колодка прицела + целик ================= */
  const LEAF_TOP = 113, SIGHT_Y = 116;
  C.SIGHT_Y = SIGHT_Y;
  {
    const p = [];
    p.push(extrude(round([[-14, BORE - 13], [14, BORE - 13], [14, BORE + 12], [11, BORE + 21],
    [11, LEAF_TOP - 4], [-11, LEAF_TOP - 4], [-11, BORE + 21], [-14, BORE + 12]], 2.0),
      { z0: Z.rsbFront, z1: Z.rsbRear, ch: 0.8 }));
    /* борта секторной планки */
    p.push(extrude(round([[-11, LEAF_TOP - 5.5], [-7.6, LEAF_TOP - 5.5], [-7.6, LEAF_TOP + 2.4], [-11, LEAF_TOP + 2.4]], 1.0), { z0: -298, z1: -243, ch: 0.4 }));
    p.push(extrude(round([[7.6, LEAF_TOP - 5.5], [11, LEAF_TOP - 5.5], [11, LEAF_TOP + 2.4], [7.6, LEAF_TOP + 2.4]], 1.0), { z0: -298, z1: -243, ch: 0.4 }));
    /* прилив снизу — упор цевья */
    p.push(extrude(round([[-11.5, BORE - 22], [11.5, BORE - 22], [11.5, BORE - 11], [-11.5, BORE - 11]], 2.5), { z0: -296, z1: -248, ch: 0.5 }));
    add('rearSightBlock', 'park', merge(p));
    add('rsbPin', 'steel', pinX(-15, 15, 2, BORE - 4, -272, true));

    /* прицельная планка */
    add('rearSightLeaf', 'blued', merge([
      extrude(round([[-7.4, LEAF_TOP - 3.6], [7.4, LEAF_TOP - 3.6], [7.4, LEAF_TOP], [-7.4, LEAF_TOP]], 0.7), { z0: -296, z1: -243.5, ch: 0.3 }),
      merge([1, 2, 3, 4, 5, 6, 7].map((i) => extrude(round([[-7.5, LEAF_TOP - 1.0], [7.5, LEAF_TOP - 1.0], [7.5, LEAF_TOP + 0.05], [-7.5, LEAF_TOP + 0.05]], 0.2),
        { z0: -292 + i * 6, z1: -291.1 + i * 6, ch: 0 })))
    ]));

    /* ползун с П-образной прорезью */
    const zA = Z.notch - 5, zB = Z.notch + 0.5;
    const nw = 2.5, nFloor = SIGHT_Y, TOPY = SIGHT_Y + 2.35;
    add('rearSightSlider', 'blued', merge([
      extrude(round([[-8.4, LEAF_TOP - 1.4], [-nw, LEAF_TOP - 1.4], [-nw, TOPY], [-8.4, TOPY]], 0.5), { z0: zA, z1: zB, ch: 0.3 }),
      extrude(round([[nw, LEAF_TOP - 1.4], [8.4, LEAF_TOP - 1.4], [8.4, TOPY], [nw, TOPY]], 0.5), { z0: zA, z1: zB, ch: 0.3 }),
      extrude(round([[-nw, LEAF_TOP - 1.4], [nw, LEAF_TOP - 1.4], [nw, nFloor], [-nw, nFloor]], 0.3), { z0: zA, z1: zB, ch: 0.2 }),
      merge([0, 1, 2].map((i) => extrude(round([[-8.8, LEAF_TOP - 0.7], [8.8, LEAF_TOP - 0.7], [8.8, TOPY - 0.7], [-8.8, TOPY - 0.7]], 0.3),
        { z0: zA + 0.8 + i * 1.4, z1: zA + 1.4 + i * 1.4, ch: 0.1 })))
    ]));
    add('notchShadow', 'bore', extrude(round([[-nw - 0.06, nFloor - 0.1], [nw + 0.06, nFloor - 0.1], [nw + 0.06, TOPY + 0.06], [-nw - 0.06, TOPY + 0.06]], 0.2),
      { z0: zA - 0.18, z1: zA + 0.12, ch: 0 }));
  }

  return parts;
};

});
__akdef("p_barrel", function (module, exports) {
/* Ствол, газовый узел, основание мушки, дульный тормоз, шомпол */
module.exports = function (G, H, C) {
  const { round, extrude, lathe, cyl, tube, torus, merge, tr, rx, ry, rz, perfShell, loft } = G;
  const { PI, TAU, D, BORE, Z, prof, plateZY, plateXZ, pinX, ringOf } = H;
  const parts = [];
  const add = (n, m, g) => { parts.push({ name: n, mat: m, geo: g }); return g; };
  const atY = (g) => tr(g, 0, BORE, 0);

  /* ============================ СТВОЛ ============================ */
  add('barrel', 'blued', atY(lathe(prof([
    [2.75, -676], [8.5, -676],                       // дульный торец (в тормозе)
    [8.5, -644], [8.9, -641, 's'], [8.9, -611], [8.5, -608, 's'],
    [7.65, -604, 's'], [7.65, -540], [8.6, -536, 's'],
    [8.6, -494], [9.5, -490, 's'], [9.5, -308], [10.6, -304, 's'],
    [10.6, -248], [11.9, -244, 's'], [11.9, -205],
    [2.75, -205]
  ]), 44, true)));
  add('bore', 'bore', atY(cyl(2.6, 2.6, -690, -208, 24)));

  /* ============================ ГАЗОВАЯ КАМОРА ============= */
  {
    const GY = BORE + 21;                            // ось газовой трубки
    C.GAS_Y = GY;
    const g = [];
    g.push(extrude(round([[-11, BORE - 12], [11, BORE - 12], [11, BORE + 12], [-11, BORE + 12]], 2.6),
      { z0: Z.gasFront, z1: Z.gasRear, ch: 0.8 }));
    /* верхний прилив и патрубок под газовую трубку */
    g.push(extrude(round([[-9.5, BORE + 8], [9.5, BORE + 8], [9.5, GY + 8], [-9.5, GY + 8]], 3),
      { z0: -528, z1: -500, ch: 0.7 }));
    g.push(tr(tube(8.6, 11.0, -516, -492, 30), 0, GY, 0));
    /* нижний прилив — канал шомпола */
    g.push(extrude(round([[-4.5, BORE - 18], [4.5, BORE - 18], [4.5, BORE - 9], [-4.5, BORE - 9]], 1.4),
      { z0: -530, z1: -498, ch: 0.4 }));
    add('gasBlock', 'park', merge(g));
    add('gasBlockPin', 'steel', pinX(-11.8, 11.8, 1.8, BORE + 2, -514, true));

    /* газовая трубка */
    add('gasTube', 'blued', merge([
      tr(tube(8.0, 9.2, -494, -299, 30), 0, GY, 0),
      tr(tube(9.0, 11.0, -312, -302, 30), 0, GY, 0)
    ]));
  }

  /* ============================ ОСНОВАНИЕ МУШКИ ============ */
  {
    const SY = C.SIGHT_Y || 116;                     // высота линии прицеливания
    const zc = Z.post, f = [];
    /* корпус */
    f.push(extrude(round([[-11, BORE - 11], [11, BORE - 11], [11, BORE + 10], [-11, BORE + 10]], 2.4),
      { z0: Z.fsbFront, z1: Z.fsbRear, ch: 0.8 }));
    /* kozhuh mushki: podkova s prorezyu */
    {
      const cy = SY - 3.6, RO = 9.6, RI = 5.9, sw = 2.65, yb = BORE + 8;
      const aO = Math.acos(sw / RO), aI = Math.acos(sw / RI);
      const P = [];
      const arc = (r, a0, a1, n, sm) => {
        for (let i = 0; i <= n; i++) {
          const a = a0 + (a1 - a0) * i / n;
          P.push({ x: r * Math.cos(a), y: cy + r * Math.sin(a), s: !!sm && i > 0 && i < n });
        }
      };
      arc(RO, PI - aO, PI, 7, true);
      P.push({ x: -RO, y: yb, s: false });
      P.push({ x: RO, y: yb, s: false });
      arc(RO, 0, aO, 7, true);
      P.push({ x: sw, y: cy + RI * Math.sin(aI), s: false });
      arc(RI, aI, aI - (PI + 2 * aI), 40, true);
      f.push(extrude(P, { z0: zc - 7.5, z1: zc + 7.5, ch: 0.5 }));
    }
    add('frontSightBase', 'park', merge(f));

    /* мушка: резьбовое основание + столбик с плоской вершиной */
    add('frontPost', 'blued', merge([
      tr(rx(lathe(prof([[0, 0], [3.1, 0], [3.1, 3.4], [2.4, 4.0, 's'], [2.4, 9.0], [1.15, 10.2, 's'],
        [1.15, SY - BORE - 8.6], [0, SY - BORE - 8.6]]), 22, false), -PI / 2), 0, BORE + 8.6, zc)
    ]));
    add('frontPostTip', 'mark', tr(rx(cyl(1.15, 1.08, 0, 1.3, 20), -PI / 2), 0, SY - 1.3, zc));

    /* штыковый упор и канал шомпола снизу */
    add('bayonetLug', 'park', merge([
      extrude(round([[-4.5, BORE - 20], [4.5, BORE - 20], [4.5, BORE - 10], [-4.5, BORE - 10]], 1.5), { z0: Z.fsbFront + 3, z1: Z.fsbRear - 3, ch: 0.4 }),
      extrude(round([[-7, BORE - 24], [7, BORE - 24], [7, BORE - 18], [-7, BORE - 18]], 1.8), { z0: -634, z1: -618, ch: 0.5 })
    ]));
    add('fsbPin', 'steel', pinX(-11.8, 11.8, 1.8, BORE - 4, -630, true));
  }

  /* ============================ ДУЛЬНЫЙ ТОРМОЗ ============== */
  {
    const RO = 12.4, RI = 9.3, zr = Z.brakeRear, zf = Z.brakeFront;
    const b = [];
    /* задняя муфта с лысками */
    b.push(tr(lathe(prof([[8.6, zr], [13.2, zr], [13.2, zr - 13], [RO, zr - 16, 's'], [RO, zr - 18], [8.6, zr - 18]]), 44, true), 0, BORE, 0));
    /* камеры с окнами */
    const thetas = []; for (let i = 0; i <= 72; i++) thetas.push(i / 72 * TAU);
    const zs = []; for (let z = zr - 18; z >= zf + 6; z -= 1.5) zs.push(z);
    const ventZ = [zr - 26, zr - 34, zr - 42];
    const holeFn = (t, z) => {
      const dR = Math.abs(Math.atan2(Math.sin(t), Math.cos(t)));
      const dL = Math.abs(PI - dR);
      const side = Math.min(dR, dL);
      /* три круглых отверстия с каждой стороны (задняя камера) */
      for (const vz of ventZ) {
        const dz = z - vz, da = (side - 0.30) * RO;
        if (dz * dz + da * da < 2.0 * 2.0) return true;
      }
      /* два больших боковых окна (передняя камера) */
      const ang = Math.atan2(Math.sin(t), Math.cos(t));
      const up = Math.abs(Math.atan2(Math.sin(t - 0.32), Math.cos(t - 0.32)));
      const upL = Math.abs(PI - Math.abs(Math.atan2(Math.sin(t + 0.32), Math.cos(t + 0.32))));
      const win = Math.min(up, upL) < 0.62;
      if (win && z < zr - 54 && z > zf + 12) return true;
      return false;
    };
    b.push(tr(perfShell({ rOut: RO, rIn: RI, thetas, zs: zs.slice().reverse(), hole: holeFn, capBack: true, capFront: true }), 0, BORE, 0));
    /* передний обод */
    b.push(tr(lathe(prof([[10.4, zf + 6], [RO, zf + 6], [RO, zf + 1], [11.6, zf, 's'], [10.4, zf]]), 44, true), 0, BORE, 0));
    add('muzzleBrake', 'park', merge(b));
  }

  /* ============================ ШОМПОЛ ============================ */
  add('cleaningRod', 'steel', tr(cyl(2.15, 2.15, -641, -300, 16), 0, BORE - 14.5, 0));

  return parts;
};

});
__akdef("p_furn", function (module, exports) {
/* Цевьё (нижнее и верхнее), пистолетная рукоятка, приклад */
module.exports = function (G, H, C) {
  const { round, circle, extrude, lathe, cyl, tube, merge, tr, rx, ry, rz, loft,
    transform, mBasis, ccw, cw, superRing, offsetContour } = G;
  const { PI, D, BORE, Z, prof, ringOf, smoothPath, boxZ, pinX } = H;
  const parts = [];
  const add = (n, m, g) => { parts.push({ name: n, mat: m, geo: g }); return g; };
  const W = C.furniture === 'polymer' ? 'poly' : 'wood';
  const WD = C.furniture === 'polymer' ? 'poly' : 'woodDk';
  const lerpAt = (tab, x) => {
    if (x <= tab[0][0]) return tab[0][1];
    for (let i = 1; i < tab.length; i++) {
      if (x <= tab[i][0]) {
        const t = (x - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]);
        const u = t * t * (3 - 2 * t);
        return tab[i - 1][1] * (1 - u) + tab[i][1] * u;
      }
    }
    return tab[tab.length - 1][1];
  };
  /* внешние нормали замкнутого CCW-контура */
  function cNormals(c) {
    const n = c.length, en = [], vn = [];
    for (let i = 0; i < n; i++) {
      const a = c[i], b = c[(i + 1) % n];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      en.push([dy / l, -dx / l]);
    }
    for (let i = 0; i < n; i++) {
      const p = en[(i - 1 + n) % n], q = en[i];
      let mx = p[0] + q[0], my = p[1] + q[1];
      const l = Math.hypot(mx, my) || 1;
      vn.push([mx / l, my / l]);
    }
    return vn;
  }
  const swell = (base, nrm, k) => base.map((p, i) =>
    p.o ? { x: p.x + nrm[i][0] * k, y: p.y + nrm[i][1] * k, s: p.s } : p);

  /* ======================= НИЖНЕЕ ЦЕВЬЁ ======================= */
  const LOW = (function () {
    const c = smoothPath([[19.2, 80], [20.6, 65, 10], [17.2, 50, 11],
    [0, 43, 18], [-17.2, 50, 11], [-20.6, 65, 10], [-19.2, 80]], 0)
      .map((p) => ({ x: p.x, y: p.y, s: p.s, o: true }));
    c.push({ x: -15.6, y: 80, s: false, o: false });
    for (let i = 0; i <= 22; i++) {
      const a = PI + PI * i / 22;
      c.push({ x: 15.6 * Math.cos(a), y: 74 + 15.6 * Math.sin(a), s: i > 0 && i < 22, o: false });
    }
    c.push({ x: 15.6, y: 80, s: false, o: false });
    const cc = ccw(c);
    return { c: cc, nrm: cNormals(cc) };
  })();
  const lowRing = (z, k) => ringOf(swell(LOW.c, LOW.nrm, k), (p) => [p.x, p.y, z]);
  {
    const st = [[-492, -2.6], [-489.5, -0.9], [-486, 0], [-478, -0.15], [-464, -0.35], [-444, -0.5],
    [-420, -0.5], [-396, -0.35], [-368, -0.05], [-340, 0.3], [-312, 0.5], [-290, 0.45],
    [-274, 0.2], [-260, -0.3], [-252.5, -0.9], [-250, -2.6]];
    add('handguardLower', W, loft(st.map(([z, k]) => lowRing(z, k)), true, true));
    add('hgFerrule', 'park', loft([[-493.5, 0.5], [-492, 1.35], [-483, 1.35], [-481.5, 0.5]]
      .map(([z, k]) => lowRing(z, k)), true, true));
  }

  /* ======================= ВЕРХНЕЕ ЦЕВЬЁ ======================= */
  const GY = C.GAS_Y || (BORE + 21);
  const UP = (function () {
    const c = smoothPath([[17.4, 85], [18.8, 96, 9], [13.0, 109, 10],
    [0, 112, 15], [-13.0, 109, 10], [-18.8, 96, 9], [-17.4, 85]], 0)
      .map((p) => ({ x: p.x, y: p.y, s: p.s, o: true }));
    c.push({ x: -12.2, y: 85, s: false, o: false });
    for (let i = 0; i <= 20; i++) {
      const a = PI - PI * i / 20;
      c.push({ x: 11.4 * Math.cos(a), y: GY + 11.4 * Math.sin(a), s: i > 0 && i < 20, o: false });
    }
    c.push({ x: 12.2, y: 85, s: false, o: false });
    const cc = ccw(c);
    return { c: cc, nrm: cNormals(cc) };
  })();
  const upRing = (z, k) => ringOf(swell(UP.c, UP.nrm, k), (p) => [p.x, p.y, z]);
  {
    const st = [[-490, -2.4], [-487.5, -0.8], [-484, 0], [-474, -0.2], [-456, -0.45], [-434, -0.55],
    [-406, -0.5], [-378, -0.3], [-350, 0], [-330, 0.25], [-316, 0.15], [-309, -0.7], [-306, -2.4]];
    add('handguardUpper', W, loft(st.map(([z, k]) => upRing(z, k)), true, true));
    add('hgFerruleUp', 'park', loft([[-491.5, 0.5], [-490, 1.4], [-482, 1.4], [-480.5, 0.5]]
      .map(([z, k]) => upRing(z, k)), true, true));
  }

  /* ======================= ПИСТОЛЕТНАЯ РУКОЯТКА ============ */
  {
    const rake = D(21);
    const e2 = [0, -Math.cos(rake), Math.sin(rake)];
    const e3 = [0, -Math.sin(rake), -Math.cos(rake)];
    const O = [0, 25.5, -35], LEN = 100;
    const gsec = (t) => {
      const sw = Math.sin(PI * Math.min(1, t * 1.15));
      const hw = 14.6 + 1.5 * sw - 4.6 * Math.pow(t, 2.6);
      const grv = 0.75 * Math.cos(t * 20.5 - 1.2)
        * Math.min(1, Math.max(0, (t - 0.06) / 0.12)) * Math.min(1, Math.max(0, (0.92 - t) / 0.12));
      const df = 17.2 - 5.2 * Math.pow(t, 2.3) + grv;
      const dr = 15.8 + 2.4 * sw - 4.4 * Math.pow(t, 2.7);
      return cw(round([[-hw, -dr], [hw, -dr], [hw, df], [-hw, df]], 7.2));
    };
    const rings = [], NS = 40;
    for (let i = 0; i <= NS + 3; i++) {
      const t = Math.min(1, i / NS);
      const ex = Math.max(0, i - NS) / 3;
      const sc = 1 - 0.55 * ex * ex;
      const d = t * LEN + ex * 3.2;
      const o = [O[0] + e2[0] * d, O[1] + e2[1] * d, O[2] + e2[2] * d];
      rings.push(ringOf(gsec(t), (p) => [o[0] + p.x * sc, o[1] + p.y * e3[1] * sc, o[2] + p.y * e3[2] * sc]));
    }
    add('grip', 'poly', loft(rings, true, true));
    add('gripCollar', 'poly', boxZ(-15.4, 20.5, 15.4, 30.6, -57, -14, 6, 1.2));
    const bot = [O[0] + e2[0] * 103, O[1] + e2[1] * 103, O[2] + e2[2] * 103];
    add('gripScrew', 'steel', transform(cyl(4.2, 4.2, -1.4, 0.6, 20),
      mBasis([1, 0, 0], [0, e3[1], e3[2]], [0, -e2[1], -e2[2]], bot)));
  }

  /* ======================= ПРИКЛАД ================================ */
  const TOP = [[8, 92.2], [26, 92.0], [70, 90.2], [130, 88.0], [186, 86.6], [227, 86.0]];
  const BOT = [[8, 30.5], [24, 26.5], [60, 18.5], [110, 11.5], [170, 6.5], [227, 4.5]];
  const WID = [[8, 16.2], [30, 17.4], [80, 18.2], [150, 17.6], [200, 16.6], [227, 15.6]];
  function stockRing(z, shrink) {
    const top = lerpAt(TOP, z), bot = lerpAt(BOT, z), w = lerpAt(WID, z) - (shrink || 0);
    const yc = (top + bot) / 2, hh = (top - bot) / 2 - (shrink || 0) * 0.4;
    const c = superRing(w, hh, hh, 3.4, 60).map((p) => ({ x: p[0], y: yc + p[1], s: true }));
    return c.map((p) => {
      const u = (z - 116) / 52, v = (p.y - 47) / 21, d = Math.hypot(u, v);
      if (d >= 1) return p;
      const side = Math.min(1, Math.max(0, (Math.abs(p.x) / w - 0.55) / 0.3));
      const dep = 2.5 * Math.pow(Math.cos(d * PI / 2), 0.65) * side;
      return { x: p.x - Math.sign(p.x) * dep, y: p.y, s: true };
    });
  }
  {
    const zs = [];
    for (let z = 8; z <= 214; z += 6) zs.push(z);
    zs.push(218, 221);
    add('stock', WD, loft(zs.map((z) => ringOf(ccw(stockRing(z, 0)), (p) => [p.x, p.y, z])), true, true));

    const bp = [[220, 0.4], [222.5, -0.5], [226.5, -0.5], [228.2, 1.2], [229.2, 3.6]]
      .map(([z, sh]) => ringOf(ccw(stockRing(Math.min(z, 227), sh)), (p) => [p.x, p.y, z]));
    add('buttPlate', 'park', loft(bp, true, true));
    add('buttTrap', 'blued', tr(extrude(round([[-9, -13], [9, -13], [9, 13], [-9, 13]], 3.5),
      { z0: 228.4, z1: 229.6, ch: 0.4 }), 0, 46, 0));

    const loop = extrude({
      outer: round([[-11, -5], [11, -5], [11, 9], [-11, 9]], 5),
      holes: [circle(0, 2.5, 3.6, 18)]
    }, { z0: 0, z1: 2.6, ch: 0.5 });
    add('slingLoop', 'park', tr(ry(loop, -PI / 2), -17.6, 44, 62));
  }

  return parts;
};

});
__akdef("p_mag", function (module, exports) {
/* Магазин 5,45×39 на 30 патронов + патрон */
module.exports = function (G, H, C) {
  const { round, extrude, lathe, cyl, merge, tr, rx, ry, rz, loft, transform, mBasis, mMul, mRotX, mIdent, cw, offsetContour } = G;
  const { PI, D, BORE, Z, prof, ringOf } = H;
  const parts = [];
  const add = (n, m, g) => { parts.push({ name: n, mat: m, geo: g }); return g; };

  /* ---- геометрия дуги корпуса ---- */
  const R = 380, L = 172, TILT = D(5);
  const P0 = [-122, 42];                                  // (z, y) — верх магазина в окне коробки
  const T0 = [-Math.sin(TILT), -Math.cos(TILT)];
  const CEN = [P0[0] + R * T0[1], P0[1] - R * T0[0]];
  const rotm = (v, a) => [v[0] * Math.cos(a) + v[1] * Math.sin(a), -v[0] * Math.sin(a) + v[1] * Math.cos(a)];
  function frame(s) {
    const phi = s * L / R;
    const d = [P0[0] - CEN[0], P0[1] - CEN[1]];
    const rp = rotm(d, phi), P = [CEN[0] + rp[0], CEN[1] + rp[1]];
    const T = rotm(T0, phi);
    const N = [-T[1], T[0]];
    return { P, T, N };
  }
  /* локальные (x — поперёк, y — вверх по корпусу, z — к задней стенке) → мир */
  function mat(s) {
    const f = frame(s);
    return mBasis([1, 0, 0], [0, -f.T[1], -f.T[0]], [0, f.N[1], f.N[0]], [0, f.P[1], f.P[0]]);
  }
  const pt = (s, u, v) => {
    const f = frame(s);
    return [u, f.P[1] + v * f.N[1], f.P[0] + v * f.N[0]];
  };
  C.magFrame = mat;

  /* ---- сечение корпуса: 26 мм поперёк × 64 мм спереди-назад ---- */
  const HW = 13.0, HD = 32.0;
  const baseSec = round([[-HW, -HD, 8.5], [HW, -HD, 8.5], [HW, HD, 5.5], [-HW, HD, 5.5]], 0);
  function secAt(s, off) {
    const tu = 1 - 0.055 * s, tv = 1 - 0.045 * s;
    let c = baseSec.map((p) => ({ x: p.x * tu, y: p.y * tv, s: p.s }));
    if (off) c = offsetContour(c, -off);
    return c;
  }

  /* ---- станции с поперечными рёбрами жёсткости ---- */
  const ST = [];
  for (let i = 0; i <= 40; i++) ST.push({ s: i / 40 * 0.955, off: 0 });
  [0.20, 0.355, 0.51, 0.665, 0.82].forEach((rc) => {
    ST.push({ s: rc - 0.026, off: 0 }, { s: rc - 0.017, off: 0.85 },
      { s: rc + 0.017, off: 0.85 }, { s: rc + 0.026, off: 0 });
  });
  ST.push({ s: 0.955, off: 0 }, { s: 0.962, off: 1.6 }, { s: 0.995, off: 1.6 }, { s: 1.0, off: 0.9 });
  ST.sort((a, b) => a.s - b.s);

  const rings = ST.map((st) => {
    const c = G.ccw(secAt(st.s, st.off));
    const f = frame(st.s);
    return ringOf(c, (p) => [p.x, f.P[1] + p.y * f.N[1], f.P[0] + p.y * f.N[0]]);
  });
  add('magBody', 'plum', loft(rings, true, true));

  /* ---- зацеп спереди и опора защёлки сзади ---- */
  const localBox = (s, x0, y0, z0, x1, y1, z1, r) =>
    transform(extrude(round([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], r || 0.8),
      { z0, z1, ch: 0.4 }), mat(s));
  add('magLugFront', 'plum', localBox(0, -7.5, -17, -HD - 5.0, 7.5, -3, -HD + 1.5, 1.4));
  add('magLugRear', 'plum', localBox(0, -8.5, -23, HD - 1.5, 8.5, -4, HD + 5.4, 1.4));

  /* ---- тёмное нутро и верхний патрон ---- */
  add('magMouth', 'bore', transform(extrude(round([[-HW + 2.4, -HD + 3.0], [HW - 2.4, -HD + 3.0],
  [HW - 2.4, HD - 3.0], [-HW + 2.4, HD - 3.0]], 4.5), { z0: -6, z1: -2.5, ch: 0 }),
    mMul(mat(0), mRotX(-PI / 2))));

  /* ---- патрон 5,45×39 ---- */
  function cartridge(withBullet) {
    const g = [];
    g.push(lathe(prof([
      [0, 0], [5.0, 0], [5.0, 1.2], [4.9, 1.6, 's'], [4.75, 6], [4.6, 25, 's'],
      [4.55, 30], [3.3, 37.5, 's'], [3.15, 39.8]
    ].map((p) => [p[0], p[1], p[2]])), 26, false));
    if (withBullet) {
      g.push(lathe(prof([
        [3.15, 39.8], [2.9, 41], [2.85, 44, 's'], [2.6, 49, 's'], [1.9, 53.5, 's'], [0.9, 56.4, 's'], [0, 57]
      ].map((p) => [p[0], p[1], p[2]])), 26, false));
    }
    return merge(g);
  }
  const caseGeo = cartridge(false), fullGeo = cartridge(true);
  C.spentCase = caseGeo;
  C.cartridge = fullGeo;

  /* верхний патрон в горловине (виден при смене магазина) */
  add('magTopRound', 'brass', tr(ry(fullGeo, PI), 0, 38.6, -94.5));

  return parts;
};

});
__akdef("p_intern", function (module, exports) {
/* Затворная рама, рукоятка взведения, УСМ, переводчик */
module.exports = function (G, H, C) {
  const { round, extrude, lathe, cyl, tube, merge, tr, rx, ry, rz, loft } = G;
  const { PI, D, BORE, Z, prof, plateZY, boxZ, boxX, pinX, ribsZ, ringOf } = H;
  const parts = [];
  const add = (n, m, g) => { parts.push({ name: n, mat: m, geo: g }); return g; };
  const GY = C.GAS_Y || (BORE + 21);

  /* ===================== ЗАТВОРНАЯ РАМА ===================== */
  {
    const g = [];
    /* корпус рамы */
    g.push(boxZ(-12.8, 62, 12.8, 86, -204, -70, 4.5, 1.2));
    /* верхний гребень */
    g.push(boxZ(-8.5, 84, 8.5, 90, -198, -96, 2.5, 0.8));
    /* стойка к газовому поршню */
    g.push(boxZ(-5.5, 84, 5.5, GY + 2, -202, -178, 2, 0.6));
    /* шток поршня + поршень */
    g.push(tr(cyl(4.6, 4.6, -344, -186, 20), 0, GY, 0));
    g.push(tr(lathe(prof([[0, -358], [7.4, -358], [7.4, -352], [6.2, -350, 's'], [6.2, -344],
    [7.4, -342, 's'], [7.4, -336], [4.6, -334], [0, -334]]), 26, true), 0, GY, 0));
    /* возвратная пружина (видна в окне при откате) */
    add('boltCarrier', 'blued', merge(g));

    /* затвор */
    add('bolt', 'steel', merge([
      tr(lathe(prof([[0, -212], [8.6, -212], [8.6, -206], [7.2, -204, 's'], [7.2, -190],
      [8.4, -188, 's'], [8.4, -182], [0, -182]]), 30, true), 0, BORE, 0),
      tr(cyl(2.9, 2.9, -182, -168, 16), 0, BORE, 0)
    ]));

    /* рукоятка взведения */
    add('charging', 'blued', merge([
      boxX(-160, 82.5, -148, 90.5, 11.5, 20, 2, 0.6),
      boxX(-159, 81.5, -149, 91.5, 20, 23.5, 3, 0.8),
      tr(rx(cyl(5.2, 4.6, 0, 6.5, 22), 0), 23.2, 86.5, -154) &&
      tr(ry(cyl(5.4, 4.8, 0, 6.2, 24), PI / 2), 23.2, 86.5, -154)
    ]));
  }

  /* ===================== УСМ ===================== */
  add('triggerGuard', 'park', plateZY([
    [-24, 31], [-27, 8, 7], [-70, 1.5, 12], [-86, 24, 9], [-93, 31],
    [-86.5, 31], [-82, 25, 7], [-68, 8, 9], [-34, 12.5, 7], [-31.5, 31]
  ], -11, 11, 0.8));

  add('trigger', 'blued', plateZY([
    [-42, 37], [-53, 37], [-60, 24, 7], [-61.5, 11, 5], [-56, 5.5, 4.5],
    [-52.5, 13, 8], [-49, 26, 9], [-42, 31]
  ], -3.2, 3.2, 0.7));

  /* защёлка магазина */
  add('magCatch', 'park', merge([
    plateZY([[-88, 30], [-88, 14, 3], [-79, 12, 3], [-76, 24, 4], [-78, 30]], -5.5, 5.5, 0.6),
    pinX(-7.5, 7.5, 2.2, 27, -86, true)
  ]));

  /* ===================== ПЕРЕВОДЧИК ===================== */
  add('selector', 'park', merge([
    plateZY([[-38, 49], [-40, 66, 6], [-106, 86, 7], [-118, 82, 3], [-112, 74, 6], [-46, 55, 8], [-44, 49]], 17.8, 21.0, 0.7),
    tr(ry(cyl(6.5, 6.5, 0, 4.2, 24), PI / 2), 16.5, 55, -41),
    ribsZ(4, -117, -106, 20.6, 21.6, 82, 0.8, 2.2)
  ]));

  /* хвостовик направляющего стержня возвратной пружины */
  add('springTail', 'blued', merge([
    tr(cyl(4.6, 4.6, 4, 13.5, 20), 0, 99, 0),
    tr(cyl(6.2, 6.2, 12.5, 14.6, 20), 0, 99, 0)
  ]));

  return parts;
};

});
__akdef("model", function (module, exports) {
/* Сборка модели АК-74: группы, узлы, материалы */
module.exports = function (G, H, MODULES, opts) {
  const C = Object.assign({ furniture: 'wood' }, opts || {});
  const BORE = H.BORE;
  const parts = [];
  for (let i = 0; i < MODULES.length; i++) {
    const r = MODULES[i](G, H, C);
    for (let k = 0; k < r.length; k++) { r[k].geo = G.clean(r[k].geo); parts.push(r[k]); }
  }

  /* подвижные группы */
  const GRP = {
    magBody: 'magazine', magLugFront: 'magazine', magLugRear: 'magazine',
    magMouth: 'magazine', magTopRound: 'magazine',
    boltCarrier: 'bolt', bolt: 'bolt', charging: 'bolt',
    trigger: 'trigger', selector: 'selector'
  };

  const order = [];
  const buckets = {};
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const grp = GRP[p.name] || 'body';
    const key = grp + '|' + p.mat;
    if (!buckets[key]) { buckets[key] = { group: grp, mat: p.mat, list: [] }; order.push(key); }
    buckets[key].list.push(p.geo);
  }
  const meshes = order.map((k) => ({
    name: k, group: buckets[k].group, mat: buckets[k].mat, geo: G.merge(buckets[k].list)
  }));

  let tris = 0;
  for (let i = 0; i < meshes.length; i++) tris += meshes[i].geo.p.length / 9;

  const SY = C.SIGHT_Y || 116;
  const nodes = {
    muzzle: [0, BORE, -719],
    muzzleDir: [0, 0, -1],
    chamber: [0, BORE, -200],
    eject: [19, 80, -146],
    ejectDir: [0.86, 0.46, 0.22],
    sightRear: [0, SY, -248.5],
    sightFront: [0, SY, -626],
    sightAxis: [0, 0, -1],
    eye: [0, SY, -60],
    gripR: [0, -12, -72],
    gripL: [0, 52, -400],
    magSeat: [0, 0, 0],
    magDrop: [0, -152, -14],
    chargeRest: [0, 0, 0],
    chargePull: [0, 0, 106],
    boltRest: [0, 0, 0],
    boltTravel: [0, 0, 106],
    triggerPivot: [0, 34, -46],
    triggerPull: 0.20,
    selectorPivot: [19, 55, -41],
    caseSpawn: [10, 76, -186]
  };

  return {
    meshes: meshes,
    parts: parts,
    nodes: nodes,
    mats: H.MATS,
    extra: { spentCase: C.spentCase, cartridge: C.cartridge },
    stats: { tris: tris, parts: parts.length, meshes: meshes.length },
    C: C
  };
};

});



/* ================== СБОРКА THREE-ОБЪЕКТА ==================================
   Вся процедурная геометрия считается в миллиметрах и переводится в метры.
   ========================================================================= */
function buildAK74(THREE, opts) {
  opts = opts || {};
  const G = __AKM.geom;
  const H = __AKM.helpers(G);
  const M = __AKM.model(G, H,
    [__AKM.p_receiver, __AKM.p_barrel, __AKM.p_furn, __AKM.p_mag, __AKM.p_intern],
    { furniture: opts.furniture || 'wood' });

  /* ATTACH: детали, заменённые модулями */
  /* Дульный тормоз, цевьё, приклад и магазин приходят из системы модулей,
     поэтому одноимённые детали базовой модели исключаются из сборки. */
  if (opts.dropParts && opts.dropParts.length) {
    const drop = new Set(opts.dropParts);
    M.parts = M.parts.filter((p) => !drop.has(p.name));
    M.meshes = (function () {
      const buckets = {}, order = [];
      const GRP = {
        magBody: 'magazine', magLugFront: 'magazine', magLugRear: 'magazine',
        magMouth: 'magazine', magTopRound: 'magazine',
        boltCarrier: 'bolt', bolt: 'bolt', charging: 'bolt',
        trigger: 'trigger', selector: 'selector'
      };
      for (const p of M.parts) {
        const grp = GRP[p.name] || 'body', key = grp + '|' + p.mat;
        if (!buckets[key]) { buckets[key] = { group: grp, mat: p.mat, list: [] }; order.push(key); }
        buckets[key].list.push(p.geo);
      }
      return order.map((k) => ({ name: k, group: buckets[k].group, mat: buckets[k].mat,
        geo: G.merge(buckets[k].list) }));
    })();
  }

  const S = 0.001;                              // мм -> м
  const geos = [], matList = [], matMap = {};
  const DOUBLE = { bore: 1 };

  const mkMat = (key) => {
    if (matMap[key]) return matMap[key];
    const d = M.mats[key] || M.mats.park;
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(d.color[0], d.color[1], d.color[2]),
      metalness: d.metal,
      roughness: d.rough
    });
    if (DOUBLE[key]) m.side = THREE.DoubleSide;
    if (key === 'wood' || key === 'woodDk') m.envMapIntensity = 0.6;
    matMap[key] = m; matList.push(m);
    return m;
  };

  const toGeo = (raw, off) => {
    const n = raw.p.length;
    const pos = new Float32Array(n), nrm = new Float32Array(n);
    const ox = off ? off[0] : 0, oy = off ? off[1] : 0, oz = off ? off[2] : 0;
    for (let i = 0; i < n; i += 3) {
      pos[i] = (raw.p[i] - ox) * S;
      pos[i + 1] = (raw.p[i + 1] - oy) * S;
      pos[i + 2] = (raw.p[i + 2] - oz) * S;
      nrm[i] = raw.n[i]; nrm[i + 1] = raw.n[i + 1]; nrm[i + 2] = raw.n[i + 2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.computeBoundingSphere();
    geos.push(g);
    return g;
  };

  const group = new THREE.Group();
  group.name = 'AK-74';
  const N = M.nodes;
  const PIV = {
    body: [0, 0, 0], magazine: [0, 0, 0], bolt: [0, 0, 0],
    trigger: N.triggerPivot, selector: N.selectorPivot
  };
  const SUB = { body: group };
  ['magazine', 'bolt', 'trigger', 'selector'].forEach((k) => {
    const g = new THREE.Group();
    g.name = k;
    g.position.set(PIV[k][0] * S, PIV[k][1] * S, PIV[k][2] * S);
    group.add(g);
    SUB[k] = g;
  });

  for (let i = 0; i < M.meshes.length; i++) {
    const m = M.meshes[i];
    const mesh = new THREE.Mesh(toGeo(m.geo, PIV[m.group] || [0, 0, 0]), mkMat(m.mat));
    mesh.name = m.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    (SUB[m.group] || group).add(mesh);
  }

  /* ---- узлы-ориентиры (Object3D в системе оружия) ---- */
  const nodes = {};
  const nd = (name, v) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(v[0] * S, v[1] * S, v[2] * S);
    group.add(o);
    nodes[name] = o;
    return o;
  };
  ['muzzle', 'chamber', 'eject', 'sightRear', 'sightFront', 'eye', 'gripR', 'gripL',
    'magSeat', 'magDrop', 'chargeRest', 'chargePull', 'boltRest', 'boltTravel',
    'triggerPivot', 'selectorPivot', 'caseSpawn'].forEach((k) => nd(k, N[k]));
  nodes.sight = nodes.sightRear;            // совместимость со старым API
  nodes.ironSight = nodes.sightFront;
  nodes.handguard = nodes.gripL;

  group.nodes = nodes;
  group.dirs = { muzzle: N.muzzleDir, eject: N.ejectDir, sight: N.sightAxis };
  group.anim = { triggerPull: N.triggerPull, boltTravel: N.boltTravel[2] * S };
  group.parts = {
    magazine: SUB.magazine, bolt: SUB.bolt, charging: SUB.bolt,
    trigger: SUB.trigger, selector: SUB.selector
  };
  group.extra = {
    caseGeo: toGeo(M.extra.spentCase, [0, 0, 0]),
    cartGeo: toGeo(M.extra.cartridge, [0, 0, 0]),
    brass: mkMat('brass'), copper: mkMat('copper'), lead: mkMat('lead')
  };
  group.stats = M.stats;
  group.dispose = () => {
    geos.forEach((g) => g.dispose());
    matList.forEach((m) => m.dispose());
  };
  return group;
}
// ==== МОДЕЛЬ: КОНЕЦ ====
