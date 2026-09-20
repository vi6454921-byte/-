/* ============================================================================
   Общие утилиты полигона: математика, кривые, детерминированный шум.
   Модуль не зависит от three.js и переиспользуется генераторами геометрии.
   ========================================================================== */
(function (root, factory) {
  const U = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = U;
  else root.GUtil = U;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = lerp;
  const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const smootherstep = (t) => { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };
  const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  const remap = (v, a, b, c, d) => lerp(c, d, clamp01(invLerp(a, b, v)));

  /* Приближение к цели с постоянной «половиной времени»: не зависит от fps.
     rate — во сколько раз сокращается ошибка за секунду. */
  const approach = (cur, dst, rate, dt) => dst + (cur - dst) * Math.exp(-rate * dt);

  /* Пружина второго порядка (критическое демпфирование) — для отдачи и веса. */
  function spring(state, target, omega, dt, zeta) {
    const z = zeta === undefined ? 1 : zeta;
    /* полунеявный Эйлер устойчив при больших dt */
    const f = omega * omega;
    const a = (target - state.x) * f - 2 * z * omega * state.v;
    state.v += a * dt;
    state.x += state.v * dt;
    return state.x;
  }

  /* ------------------------------------------------------- случайность */
  /* mulberry32: быстрый детерминированный ГПСЧ. Каждый боец получает свой
     seed, поэтому камуфляж, потёртости и мимика стабильны между кадрами. */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    const f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (lo, hi) => lo + f() * (hi - lo);
    f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
    f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
    f.sign = () => (f() < 0.5 ? -1 : 1);
    return f;
  }

  /* ------------------------------------------------------- шум (2D value) */
  function noise2D(seed) {
    const P = new Uint8Array(512);
    const r = rng(seed);
    for (let i = 0; i < 256; i++) P[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = P[i]; P[i] = P[j]; P[j] = t;
    }
    for (let i = 0; i < 256; i++) P[256 + i] = P[i];

    const grad = (h, x, y) => {
      const u = (h & 1) ? x : y, v = (h & 2) ? y : x;
      return ((h & 4) ? -u : u) + ((h & 8) ? -v : v) * 0.5;
    };
    return function (x, y) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      x -= Math.floor(x); y -= Math.floor(y);
      const u = smootherstep(x), v = smootherstep(y);
      const A = P[X] + Y, B = P[X + 1] + Y;
      const n = lerp(
        lerp(grad(P[A], x, y), grad(P[B], x - 1, y), u),
        lerp(grad(P[A + 1], x, y - 1), grad(P[B + 1], x - 1, y - 1), u), v);
      return clamp(n * 0.7 + 0.5, 0, 1);
    };
  }

  /* Фрактальный шум: несколько октав value-шума. */
  function fbm(seed, octaves, gain, lac) {
    const n = noise2D(seed);
    const O = octaves || 4, G = gain === undefined ? 0.5 : gain, L = lac || 2;
    return function (x, y) {
      let a = 0.5, f = 1, s = 0, norm = 0;
      for (let i = 0; i < O; i++) { s += a * n(x * f, y * f); norm += a; a *= G; f *= L; }
      return s / norm;
    };
  }

  /* --------------------------------------------------------------- кривые */
  /* Профиль сечения: замкнутая суперэллипса. Мягко переходит от круга (n=2)
     к скруглённому прямоугольнику (n=4..6) — так строятся торс и приклад. */
  function superellipse(a, b, n, t) {
    const c = Math.cos(t), s = Math.sin(t);
    const p = 2 / n;
    return [
      a * Math.sign(c) * Math.pow(Math.abs(c), p),
      b * Math.sign(s) * Math.pow(Math.abs(s), p)
    ];
  }

  /* Catmull-Rom по массиву чисел — плавные профили радиусов конечностей. */
  function splineAt(pts, t) {
    const n = pts.length;
    if (n === 0) return 0;
    if (n === 1) return pts[0];
    const x = clamp01(t) * (n - 1);
    const i = Math.min(n - 2, Math.floor(x));
    const f = x - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const f2 = f * f, f3 = f2 * f;
    return 0.5 * ((2 * p1) + (-p0 + p2) * f
      + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2
      + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
  }

  /* Угол в диапазон (-PI, PI] — для доворота корпуса за взглядом. */
  function wrapPI(a) {
    while (a > Math.PI) a -= TAU;
    while (a <= -Math.PI) a += TAU;
    return a;
  }

  const damp = (cur, dst, lambda, dt) => lerp(cur, dst, 1 - Math.exp(-lambda * dt));

  function dampAngle(cur, dst, lambda, dt) {
    return cur + wrapPI(dst - cur) * (1 - Math.exp(-lambda * dt));
  }

  return {
    TAU, DEG, clamp, clamp01, lerp, mix, smoothstep, smootherstep, invLerp, remap,
    approach, spring, rng, noise2D, fbm, superellipse, splineAt, wrapPI, damp, dampAngle
  };
});