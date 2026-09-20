/* ============================================================================
   Скелет бойца.

   Пропорции взяты от реального человека ростом 1,80 м (канон «7,5 голов»):
   голова 0,235 м, длина плеча 0,32 м, предплечья 0,27 м, бедра 0,44 м,
   голени 0,42 м. Кисть разложена на пясть и три фаланги каждого пальца —
   это нужно, чтобы пальцы реально обхватывали цевьё и рукоятку, а
   указательный лежал на спуске.

   Иерархия задана плоским списком: имя, родитель, смещение от родителя
   в T-позе (метры, мировая ось). Дальше из него строится THREE.Skeleton.
   ========================================================================== */
(function (root, factory) {
  const S = factory(root.GUtil || (typeof require !== 'undefined' ? require('./util.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = S;
  else root.GSkel = S;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  /* Опорные размеры, м. Меняя H, получаем бойцов разного роста. */
  function metrics(H, build) {
    const h = H / 1.80;                       // масштаб относительно эталона
    const b = build || 1;                     // «плотность» телосложения
    return {
      H: H,
      hipY: 0.955 * h,                        // тазобедренный сустав
      waistY: 1.075 * h,
      chestY: 1.285 * h,
      neckY: 1.455 * h,
      headY: 1.545 * h,
      eyeY: 1.660 * h,
      topY: 1.800 * h,
      shoulderY: 1.415 * h,
      shoulderX: 0.196 * h * b,               // полуширина плеч по суставам
      upperArm: 0.300 * h,
      foreArm: 0.262 * h,
      hand: 0.100 * h,
      hipX: 0.092 * h,
      thigh: 0.435 * h,
      shin: 0.415 * h,
      foot: 0.265 * h,
      ankleY: 0.085 * h,
      /* обхваты (полуоси сечений) */
      chestRX: 0.196 * h * b, chestRZ: 0.124 * h * b,
      waistRX: 0.158 * h * b, waistRZ: 0.112 * h * b,
      hipRX: 0.172 * h * b, hipRZ: 0.120 * h * b,
      neckR: 0.062 * h * b,
      headRX: 0.082 * h, headRY: 0.108 * h, headRZ: 0.098 * h,
      armR: 0.049 * h * b, elbowR: 0.040 * h * b, wristR: 0.030 * h,
      thighR: 0.079 * h * b, kneeR: 0.058 * h * b, ankleR: 0.040 * h
    };
  }

  /* Пальцы: длины фаланг в долях длины кисти и разведение по пясти.
     Мизинец короче, большой палец сидит отдельно и противопоставлен. */
  const FINGERS = [
    { key: 'index',  spread: -0.024, ph: [0.045, 0.026, 0.020], base: 0.055, r: 0.0098 },
    { key: 'middle', spread: -0.002, ph: [0.049, 0.030, 0.021], base: 0.058, r: 0.0100 },
    { key: 'ring',   spread: 0.019,  ph: [0.045, 0.027, 0.019], base: 0.055, r: 0.0094 },
    { key: 'pinky',  spread: 0.038,  ph: [0.036, 0.020, 0.016], base: 0.050, r: 0.0082 }
  ];
  const THUMB = { ph: [0.038, 0.031, 0.024], r: 0.0115 };

  /* Построение списка костей. Каждая запись: {name, parent, pos:[x,y,z]},
     pos — смещение относительно родителя в системе покоя. */
  function build(M) {
    const B = [];
    const add = (name, parent, pos) => { B.push({ name, parent, pos }); return name; };

    add('root', null, [0, 0, 0]);
    add('hips', 'root', [0, M.hipY, 0]);
    add('spine', 'hips', [0, M.waistY - M.hipY, 0]);
    add('chest', 'spine', [0, M.chestY - M.waistY, 0]);
    add('neck', 'chest', [0, M.neckY - M.chestY, 0]);
    add('head', 'neck', [0, M.headY - M.neckY, 0]);
    /* челюсть — для дыхания и небольшой мимики под балаклавой */
    add('jaw', 'head', [0, -0.028, -0.030]);

    for (const s of [1, -1]) {
      const S = s > 0 ? 'R' : 'L';
      /* ключица идёт от центра груди наружу и чуть вперёд */
      add('clav' + S, 'chest', [s * 0.040, M.shoulderY - M.chestY - 0.012, -0.012]);
      add('shoulder' + S, 'clav' + S, [s * (M.shoulderX - 0.040), 0.012, 0.012]);
      add('elbow' + S, 'shoulder' + S, [s * M.upperArm, 0, 0]);
      add('wrist' + S, 'elbow' + S, [s * M.foreArm, 0, 0]);
      add('palm' + S, 'wrist' + S, [s * 0.028, 0, 0]);

      /* пальцы: пясть -> 3 фаланги. Ось X — вдоль руки наружу. */
      for (const f of FINGERS) {
        const p0 = f.key + S + '1';
        add(p0, 'palm' + S, [s * f.base, -0.004, f.spread]);
        add(f.key + S + '2', p0, [s * f.ph[0], 0, 0]);
        add(f.key + S + '3', f.key + S + '2', [s * f.ph[1], 0, 0]);
        add(f.key + S + '4', f.key + S + '3', [s * f.ph[2], 0, 0]);
      }
      /* большой палец: основание на ребре ладони, ось развёрнута */
      add('thumb' + S + '1', 'palm' + S, [s * 0.012, -0.010, -0.030]);
      add('thumb' + S + '2', 'thumb' + S + '1', [s * THUMB.ph[0], 0, -0.012]);
      add('thumb' + S + '3', 'thumb' + S + '2', [s * THUMB.ph[1], 0, -0.006]);
      add('thumb' + S + '4', 'thumb' + S + '3', [s * THUMB.ph[2], 0, 0]);

      /* ноги */
      add('hip' + S, 'hips', [s * M.hipX, -0.020, 0]);
      add('knee' + S, 'hip' + S, [0, -M.thigh, 0]);
      add('ankle' + S, 'knee' + S, [0, -M.shin, 0]);
      add('toe' + S, 'ankle' + S, [0, -0.045, -M.foot * 0.52]);
    }
    return B;
  }

  /* Мировые позиции костей в позе покоя — нужны генератору меша. */
  function restWorld(bones) {
    const map = {}, out = {};
    for (const b of bones) map[b.name] = b;
    const solve = (name) => {
      if (out[name]) return out[name];
      const b = map[name];
      const p = b.parent ? solve(b.parent) : [0, 0, 0];
      out[name] = [p[0] + b.pos[0], p[1] + b.pos[1], p[2] + b.pos[2]];
      return out[name];
    };
    for (const b of bones) solve(b.name);
    return out;
  }

  function indexOf(bones) {
    const m = {};
    for (let i = 0; i < bones.length; i++) m[bones[i].name] = i;
    return m;
  }

  return { metrics, build, restWorld, indexOf, FINGERS, THUMB };
});