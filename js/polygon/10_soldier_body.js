
/* ==========================================================================
   МОДУЛЬ: soldier/body.js
   ========================================================================== */
/* ============================================================================
   Туловище и телосложение бойца.

   Базовое тело MakeHuman — «средний» мужчина: узкие плечи, тонкая шея,
   плоская грудь. Боец на референсе — атлет под грузом: развитые дельты и
   трапеции, широкая спина, мощные бёдра. Форма тела здесь задаётся полем
   объёмов вокруг костей скелета: каждая вершина сдвигается по своей
   нормали на величину поля в её точке покоя.

   Поле одинаково для всех слоёв (кожа, китель, жилет, брюки, балаклава),
   поэтому слои сдвигаются вместе и не прорастают друг сквозь друга.
   ========================================================================== */
(function (root, factory) {
  const B = factory(root.GUtil || (typeof require !== 'undefined' ? require('../core/util.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = B;
  else root.GBody = B;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  /* Объёмы: отрезок между суставами (# — сторона), смещение отрезка (м),
     радиус влияния r и прибавка a по нормали (м). a1 — прибавка на втором
     конце (сужение к запястью, к колену). */
  const BULK = [
    { seg: ['shoulder#', 'shoulder#'], off: [0.014, 0.012, 0.004], r: 0.100, a: 0.008 },          // дельта
    { seg: ['neck', 'shoulder#'], off: [0, 0.024, 0.014], r: 0.064, a: 0.010 },                   // трапеция
    { seg: ['shoulder#', 'elbow#'], off: [0, 0, 0], r: 0.070, a: 0.005, a1: 0.003 },               // плечо
    { seg: ['elbow#', 'wrist#'], off: [0, 0, 0], r: 0.050, a: 0.002, a1: 0.0 },                    // предплечье
    { seg: ['chest', 'chest'], off: [0, 0.06, -0.10], r: 0.16, a: 0.006, mirror: false },           // грудь
    { seg: ['chest', 'chest'], off: [0.12, 0.02, 0.07], r: 0.13, a: 0.006 },                       // широчайшие
    { seg: ['neck', 'head'], off: [0, -0.01, 0.005], r: 0.055, a: 0.004, mirror: false, yMax: 1.66 }, // шея
    { seg: ['hip#', 'knee#'], off: [0, 0, 0], r: 0.125, a: 0.015, a1: 0.006 },                     // бедро
    { seg: ['knee#', 'ankle#'], off: [0, 0.03, 0.02], r: 0.080, a: 0.010, a1: 0.002 }                // икра
  ];

  /* Слои, к которым применяется поле (головные уборы и глаза не трогаем). */
  const LAYERS = { skin: 1, shirt: 1, pants: 1, vest: 1, boot: 1, mask: 1, patch: 1 };

  function segs(J) {
    const out = [];
    for (const b of BULK) {
      const sides = b.seg.some((n) => n.includes('#')) ? [1, -1] : (b.mirror === false ? [0] : [1, -1]);
      for (const s of sides) {
        const S = s < 0 ? 'L' : 'R';
        const A = J[b.seg[0].replace('#', S)], Bp = J[b.seg[1].replace('#', S)];
        if (!A || !Bp) continue;
        const o = [b.off[0] * (s || 1), b.off[1], b.off[2]];
        out.push({ a: [A[0] + o[0], A[1] + o[1], A[2] + o[2]], b: [Bp[0] + o[0], Bp[1] + o[1], Bp[2] + o[2]], r: b.r, k0: b.a, k1: b.a1 === undefined ? b.a : b.a1, yMax: b.yMax });
      }
    }
    return out;
  }

  /* Поле объёма в точке p: максимум вкладов, а не сумма — соседние
     объёмы не складываются в «опухоль» на стыке. */
  function amount(S, p) {
    let best = 0;
    for (const s of S) {
      if (s.yMax !== undefined && p[1] > s.yMax) continue;
      const ab = [s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]];
      const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
      const t = l2 > 1e-9 ? clamp(((p[0] - s.a[0]) * ab[0] + (p[1] - s.a[1]) * ab[1] + (p[2] - s.a[2]) * ab[2]) / l2, 0, 1) : 0;
      const d = Math.hypot(p[0] - s.a[0] - ab[0] * t, p[1] - s.a[1] - ab[1] * t, p[2] - s.a[2] - ab[2] * t);
      const w = 1 - sstep(s.r * 0.35, s.r, d);
      if (w > 0) best = Math.max(best, w * (s.k0 + (s.k1 - s.k0) * t));
    }
    return best;
  }

  /* Сдвиг вершин слоя по нормали. pos — Float32Array (м), nrm — Int16
     нормализованные (как в пакете модели). Кисти (x дальше запястья)
     не трогаются — там процедурная перчатка. */
  function shape(group, pos, nrm, n, J) {
    if (!LAYERS[group] || !J) return false;
    const S = segs(J);
    const wx = Math.abs(J.wristR ? J.wristR[0] : 0.75) - 0.01;
    const inv = nrm instanceof Int16Array ? 1 / 32767 : 1;
    for (let v = 0; v < n; v++) {
      const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
      if (Math.abs(p[0]) > wx) continue;
      const d = amount(S, p) * inv;
      if (d <= 0) continue;
      pos[v * 3] += nrm[v * 3] * d;
      pos[v * 3 + 1] += nrm[v * 3 + 1] * d;
      pos[v * 3 + 2] += nrm[v * 3 + 2] * d;
    }
    return true;
  }

  return { BULK, LAYERS, shape, amount: (J, p) => amount(segs(J), p) };
});
