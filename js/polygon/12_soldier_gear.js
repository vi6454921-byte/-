
/* ==========================================================================
   МОДУЛЬ: soldier/gear.js
   ========================================================================== */
/* ============================================================================
   Снаряжение поверх формы: наколенники и нашивки на рукавах.

   Детали строятся в позе покоя по суставам модели и привязываются к одной
   кости: наколенник — к голени (кость колена), нашивка — к плечу. Поверхность
   рукава берётся с учётом объёмов тела (body.js) и кроя (clothing.js),
   поэтому нашивка лежит на ткани, а не висит в воздухе и не тонет в ней.
   ========================================================================== */
(function (root, factory) {
  const G = factory(root.GUtil, root.GBody);
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  else root.GGear = G;
})(typeof self !== 'undefined' ? self : this, function (U, BODY) {
  'use strict';

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  function Acc() { this.p = []; this.n = []; this.uv = []; this.si = []; this.sw = []; this.ix = []; }
  Acc.prototype.v = function (p, n, uv, bone) {
    this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.uv.push(uv[0], uv[1]);
    this.si.push(bone, 0, 0, 0); this.sw.push(1, 0, 0, 0);
    return this.p.length / 3 - 1;
  };
  function geo(THREE, a) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(a.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(a.n), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(a.uv), 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(a.si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(a.sw), 4));
    g.setIndex(a.ix);
    g.computeVertexNormals();
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.2);
    return g;
  }

  /* Скруглённая пластина по сетке (u, v) ∈ [-1, 1]²: surf(u, v, off) даёт
     точку на лицевой (off = 1) или внутренней (off = 0) стороне. Квадрат
     переводится в «скруглённый» диск, края замыкаются бортиком. */
  function shell(a, surf, bone, N, M, uvf) {
    const face = (off, flip) => {
      const base = a.p.length / 3;
      for (let j = 0; j <= M; j++) for (let i = 0; i <= N; i++) {
        const s = i / N * 2 - 1, t = j / M * 2 - 1;
        const u = s * Math.sqrt(1 - t * t * 0.35), v = t * Math.sqrt(1 - s * s * 0.35);
        a.v(surf(u, v, off), [0, 0, 1], uvf ? uvf(u, v) : [(u + 1) / 2, (v + 1) / 2], bone);
      }
      for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
        const q = base + j * (N + 1) + i, r = q + N + 1;
        if (flip) a.ix.push(q, q + 1, r + 1, q, r + 1, r); else a.ix.push(q, r + 1, q + 1, q, r, r + 1);
      }
      return base;
    };
    const f0 = face(1, false), f1 = face(0, true);
    /* бортик по контуру */
    const ring = [];
    for (let i = 0; i < N; i++) ring.push([i, 0]);
    for (let j = 0; j < M; j++) ring.push([N, j]);
    for (let i = N; i > 0; i--) ring.push([i, M]);
    for (let j = M; j > 0; j--) ring.push([0, j]);
    for (let k = 0; k < ring.length; k++) {
      const [i0, j0] = ring[k], [i1, j1] = ring[(k + 1) % ring.length];
      const A = f0 + j0 * (N + 1) + i0, B = f0 + j1 * (N + 1) + i1;
      const C = f1 + j1 * (N + 1) + i1, D = f1 + j0 * (N + 1) + i0;
      a.ix.push(A, D, C, A, C, B);
    }
  }

  function gearGeometry(THREE, J, BI, P) {
    const out = {};
    /* ---- наколенники: купол перед коленом, чуть ниже сустава ---- */
    if (P.kneePads) {
      const a = new Acc();
      for (const s of [1, -1]) {
        const S = s > 0 ? 'R' : 'L';
        const K = J['knee' + S];
        const Rk = 0.074, zc = K[2];
        shell(a, (u, v, off) => {
          const th = u * 0.78;
          const dome = 0.013 * (1 - u * u) * (1 - v * v * 0.8);
          const r = Rk + 0.004 + (off ? 0.011 + dome : dome * 0.6);
          return [K[0] + s * Math.sin(th) * r * 0.95, K[1] - 0.018 + v * 0.074, zc - Math.cos(th) * r];
        }, BI['knee' + S], 14, 12);
        /* ремешки под и над чашкой */
        for (const dy of [0.085, -0.115]) {
          shell(a, (u, v, off) => {
            const th = u * Math.PI * 0.98;
            const r = (dy > 0 ? 0.068 : 0.058) + (off ? 0.0035 : 0.0005);
            return [K[0] + s * Math.sin(th) * r, K[1] + dy + v * 0.011, zc - Math.cos(th) * r];
          }, BI[(dy > 0 ? 'hip' : 'knee') + S], 20, 2);
        }
      }
      out.kneePad = geo(THREE, a);
    }
    /* ---- нашивки на рукавах: на наружной стороне плеча (в покое — сверху) ---- */
    {
      const a = new Acc();
      for (const s of [1, -1]) {
        const S = s > 0 ? 'R' : 'L';
        const sh = J['shoulder' + S], el = J['elbow' + S];
        const x0 = sh[0] + (el[0] - sh[0]) * 0.40;
        const axisY = sh[1] - 0.012, axisZ = sh[2] + 0.006;
        const top = 1.533 - axisY;                                  // радиус рукава сверху (замер)
        const lift = 0.013 + (BODY ? BODY.amount(J, [x0, axisY + top, axisZ]) : 0.004);
        const R = top + lift;
        /* верх логотипа — к плечу, без зеркала на левой руке */
        shell(a, (u, v, off) => {
          const th = u * 0.42;
          const r = R + 0.0006 + (off ? 0.0024 : 0);
          return [x0 + s * v * 0.040, axisY + Math.cos(th) * r, axisZ - Math.sin(th) * r];
        }, BI['armTwist' + S] !== undefined ? BI['armTwist' + S] : BI['shoulder' + S], 10, 8,
        (u, v) => [s > 0 ? (u + 1) / 2 : (1 - u) / 2, (1 - v) / 2]);
      }
      out.sleevePatch = geo(THREE, a);
    }
    return out;
  }

  function gearMaterials(THREE, P, srgb, mats) {
    const out = {};
    out.kneePad = new THREE.MeshStandardMaterial({
      color: srgb(THREE, P.padCol || P.hardCol), roughness: 0.55, metalness: 0, envMapIntensity: 0.9
    });
    if (mats.patch) out.sleevePatch = mats.patch;
    return out;
  }

  return { gearGeometry, gearMaterials };
});
