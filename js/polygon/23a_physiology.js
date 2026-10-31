/* ==========================================================================
   AEGIS v13 · физиология ранения (вместо «очков здоровья»)
   --------------------------------------------------------------------------
   Зачем: в v12 урон считался «из 100»: две пули в шею могли дать 90 и боец
   стоял. У живого человека нет полоски здоровья — есть органы, кровь и
   нервная система. Опора (раневая баллистика и военная медицина):
     • мгновенно выключает только ЦНС: головной мозг, ствол, верхний
       шейный отдел спинного мозга (C1–C4); ниже — паралич: C5–T1 — падает
       сразу (руки и ноги), грудной/поясничный — отказывают ноги;
     • сердце, аорта, полые вены, лёгочные сосуды — потеря сознания за
       5–15 с (падение давления), смерть — за минуты;
     • крупные артерии конечностей (бедренная, плечевая) — минуты, жгут
       останавливает полностью;
     • потеря крови: класс I < 15 % (без признаков), II 15–30 % (слабость,
       сердцебиение), III 30–40 % (спутанность, падает), IV > 40 %
       (без сознания). Объём крови бойца — ~70 мл/кг ≈ 5,5 л;
     • перелом бедра, таза, большеберцовой кости — на ногу не встать
       (только ползком); ранение мышц ноги — хромота, бег невозможен;
     • пуля НЕ отбрасывает тело (импульс 3,4 г × 880 м/с ≈ 3 Н·с).
   Пуля: раневой канал прокладывается в системе покоя модели. Для каждого
   патрона — постоянная полость (что разрушено) и временная (растяжение
   тканей: у винтовочных пуль после начала кувырка 5–9 см; рвёт печень,
   селезёнку, может сломать кость и контузить спинной мозг рядом с каналом,
   у пистолетных почти нет). Канал проверяется по органам (капсулы).
   Данные: Fackler (кувырок 5,45 на ~7 см, 7,62×39 на ~26 см, фрагментация
   5,56 M855 > 760 м/с), Karger 1996 (нет отбрасывания), ATLS (классы
   кровопотери), TCCC (жгут, тампонада, окклюзионная повязка).
   ========================================================================== */
(function (root, factory) {
  const M = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else root.GPhys = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const rnd = Math.random;

  /* --------------------------------------------- патроны (раневое действие)
     d — калибр, м; yaw — глубина начала кувырка, м (999 — не кувыркается);
     perm — радиус постоянной полости после кувырка/деформации, м;
     cav — максимальный радиус временной полости, м; depth — глубина канала
     в тканях, м; frag — дробится при скорости выше fragV. */
  const BAL = {
    '7N6': { d: 0.0056, yaw: 0.07, perm: 0.012, cav: 0.055, depth: 0.50 },
    '7N10': { d: 0.0056, yaw: 0.07, perm: 0.012, cav: 0.055, depth: 0.50 },
    '7N24': { d: 0.0056, yaw: 0.09, perm: 0.010, cav: 0.050, depth: 0.55 },
    '57N231': { d: 0.0079, yaw: 0.25, perm: 0.015, cav: 0.060, depth: 0.60 },
    '7N23': { d: 0.0079, yaw: 0.25, perm: 0.014, cav: 0.058, depth: 0.62 },
    '57N231U': { d: 0.0079, yaw: 0.25, perm: 0.010, cav: 0.025, depth: 0.55 },
    'M855': { d: 0.0057, yaw: 0.11, perm: 0.020, cav: 0.065, depth: 0.45, frag: 1, fragV: 760 },
    'M855A1': { d: 0.0057, yaw: 0.08, perm: 0.020, cav: 0.065, depth: 0.45, frag: 1, fragV: 700 },
    'M995': { d: 0.0057, yaw: 0.12, perm: 0.012, cav: 0.055, depth: 0.55 },
    'M80': { d: 0.0078, yaw: 0.14, perm: 0.020, cav: 0.090, depth: 0.70, frag: 1, fragV: 790 },
    'M80A1': { d: 0.0078, yaw: 0.09, perm: 0.022, cav: 0.090, depth: 0.70, frag: 1, fragV: 700 },
    'M993': { d: 0.0078, yaw: 0.16, perm: 0.014, cav: 0.080, depth: 0.75 },
    '7N1': { d: 0.0079, yaw: 0.16, perm: 0.018, cav: 0.085, depth: 0.70 },
    '57N323S': { d: 0.0079, yaw: 0.16, perm: 0.018, cav: 0.085, depth: 0.70 },
    '7N14': { d: 0.0079, yaw: 0.18, perm: 0.016, cav: 0.080, depth: 0.75 },
    '57N181S': { d: 0.0090, yaw: 999, perm: 0.0055, cav: 0.020, depth: 0.55 },
    '7N21': { d: 0.0090, yaw: 999, perm: 0.0050, cav: 0.020, depth: 0.50 },
    'JHP': { d: 0.0090, yaw: 999, perm: 0.0090, cav: 0.026, depth: 0.32 },
    'buck00': { d: 0.0084, yaw: 999, perm: 0.0045, cav: 0.012, depth: 0.35 },
    'shot4': { d: 0.0061, yaw: 999, perm: 0.0030, cav: 0.006, depth: 0.14 },
    'slug': { d: 0.0180, yaw: 999, perm: 0.0140, cav: 0.050, depth: 0.45 },
    frag: { d: 0.006, yaw: 999, perm: 0.004, cav: 0.010, depth: 0.12 }
  };
  const BAL_DEF = BAL['7N10'];

  /* ------------------------------------------------- органы (система покоя)
     kind: cns — мозг/ствол/C1–C4; cordHi — C5–T1; cordLo — грудной и
     поясничный отделы; cauda — конский хвост; heart; art / vein — сосуд;
     lung; air — дыхательные пути; solid — паренхиматозный орган; hollow —
     полый; bone; face.
     bleed — мл/с при полном повреждении; tau — с, свёртывание (0 — нет);
     comp — чем останавливается: limb (жгут), junc (тампонада), chest
     (окклюзионная повязка, внутреннее не остановить), none. */
  const TORSO = [
    ['brain', 'головной мозг', 'cns', [0, 1.765, -0.08], [0, 1.765, -0.005], 0.06],
    ['cereb', 'мозжечок', 'cns', [0, 1.70, 0.012], [0, 1.705, 0.012], 0.034],
    ['stem', 'ствол мозга', 'cns', [0, 1.705, -0.022], [0, 1.655, -0.006], 0.015],
    ['cordC1', 'спинной мозг C1–C4', 'cns', [0, 1.655, -0.004], [0, 1.578, 0.02], 0.011],
    ['vertC1', 'шейные позвонки', 'bone', [0, 1.65, -0.018], [0, 1.578, 0.004], 0.02, { cavCord: 'cordC1' }],
    ['cordC5', 'спинной мозг C5–T1', 'cordHi', [0, 1.578, 0.02], [0, 1.48, 0.045], 0.011],
    ['vertC5', 'шейные позвонки', 'bone', [0, 1.578, 0.004], [0, 1.48, 0.028], 0.021, { cavCord: 'cordC5' }],
    ['cordT', 'спинной мозг (грудной)', 'cordLo', [0, 1.48, 0.045], [0, 1.22, 0.075], 0.009],
    ['vertT', 'грудные позвонки', 'bone', [0, 1.48, 0.024], [0, 1.22, 0.05], 0.022, { cavCord: 'cordT' }],
    ['cordL', 'спинной мозг (поясничный)', 'cordLo', [0, 1.22, 0.075], [0, 1.12, 0.07], 0.009],
    ['cauda', 'конский хвост', 'cauda', [0, 1.12, 0.07], [0, 0.98, 0.07], 0.012],
    ['vertL', 'поясничные позвонки', 'bone', [0, 1.22, 0.05], [0, 0.98, 0.04], 0.024, { cavCord: 'cordL' }],
    ['face', 'лицо, челюсть', 'face', [0, 1.64, -0.11], [0, 1.70, -0.12], 0.035, { bleed: 3, tau: 200 }],
    ['carR', 'сонная артерия справа', 'art', [0.022, 1.50, -0.035], [0.026, 1.645, -0.045], 0.0045, { bleed: 30, comp: 'junc' }],
    ['carL', 'сонная артерия слева', 'art', [-0.022, 1.50, -0.035], [-0.026, 1.645, -0.045], 0.0045, { bleed: 30, comp: 'junc' }],
    ['jugR', 'ярёмная вена справа', 'vein', [0.036, 1.50, -0.025], [0.04, 1.635, -0.03], 0.007, { bleed: 14, comp: 'junc', tau: 0 }],
    ['jugL', 'ярёмная вена слева', 'vein', [-0.036, 1.50, -0.025], [-0.04, 1.635, -0.03], 0.007, { bleed: 14, comp: 'junc', tau: 0 }],
    /* v14: шея — самая «плотная» по сосудам часть тела. Кроме сонных и
       ярёмных: позвоночные артерии (в отверстиях поперечных отростков, их
       не прижать), наружные ярёмные вены под кожей, щитовидная железа с
       артериями и венозные сплетения. Поэтому сквозное ранение шеи почти
       никогда не бывает «чистым». */
    ['vrtR', 'позвоночная артерия справа', 'art', [0.026, 1.50, 0.0], [0.024, 1.64, -0.004], 0.0035, { bleed: 14 }],
    ['vrtL', 'позвоночная артерия слева', 'art', [-0.026, 1.50, 0.0], [-0.024, 1.64, -0.004], 0.0035, { bleed: 14 }],
    ['ejR', 'наружная ярёмная вена справа', 'vein', [0.05, 1.50, -0.045], [0.045, 1.63, -0.04], 0.004, { bleed: 6, comp: 'junc', tau: 900 }],
    ['ejL', 'наружная ярёмная вена слева', 'vein', [-0.05, 1.50, -0.045], [-0.045, 1.63, -0.04], 0.004, { bleed: 6, comp: 'junc', tau: 900 }],
    ['thyr', 'щитовидная железа', 'solid', [-0.03, 1.50, -0.058], [0.03, 1.50, -0.058], 0.012, { bleed: 7, tau: 1200, cavK: 1.5, comp: 'junc' }],
    ['trach', 'гортань и трахея', 'air', [0, 1.48, -0.05], [0, 1.62, -0.062], 0.012],
    ['esoph', 'пищевод', 'hollow', [0, 1.46, -0.024], [0, 1.62, -0.03], 0.008, { bleed: 1 }],
    ['sclR', 'подключичная артерия справа', 'art', [0.02, 1.47, -0.02], [0.18, 1.46, -0.01], 0.006, { bleed: 35, comp: 'junc' }],
    ['sclL', 'подключичная артерия слева', 'art', [-0.02, 1.47, -0.02], [-0.18, 1.46, -0.01], 0.006, { bleed: 35, comp: 'junc' }],
    ['clavR', 'ключица справа', 'bone', [0.02, 1.50, -0.07], [0.17, 1.515, -0.035], 0.009, { arm: 'R', armK: 0.5 }],
    ['clavL', 'ключица слева', 'bone', [-0.02, 1.50, -0.07], [-0.17, 1.515, -0.035], 0.009, { arm: 'L', armK: 0.5 }],
    ['heart', 'сердце', 'heart', [0.005, 1.39, -0.062], [-0.05, 1.30, -0.085], 0.046, { bleed: 150 }],
    ['aortA', 'аорта', 'art', [0, 1.36, -0.06], [0, 1.445, -0.035], 0.013, { bleed: 160, central: 1 }],
    ['aortD', 'аорта', 'art', [-0.018, 1.44, 0.03], [-0.015, 1.08, 0.038], 0.012, { bleed: 160, central: 1 }],
    ['aortB', 'брюшная аорта', 'art', [-0.012, 1.08, 0.038], [-0.008, 0.98, 0.012], 0.011, { bleed: 120, central: 1 }],
    ['svc', 'верхняя полая вена', 'vein', [0.022, 1.46, -0.03], [0.022, 1.36, -0.045], 0.01, { bleed: 50, tau: 0, central: 1 }],
    ['ivc', 'нижняя полая вена', 'vein', [0.022, 1.32, 0.0], [0.024, 0.98, 0.02], 0.012, { bleed: 60, tau: 0, central: 1 }],
    ['pulm', 'сосуды корня лёгких', 'art', [0.045, 1.38, -0.015], [-0.045, 1.38, -0.015], 0.017, { bleed: 80, central: 1 }],
    ['lungR', 'правое лёгкое', 'lung', [0.085, 1.24, -0.02], [0.085, 1.47, -0.005], 0.064, { bleed: 5, tau: 600 }],
    ['lungL', 'левое лёгкое', 'lung', [-0.09, 1.25, -0.01], [-0.085, 1.47, 0.0], 0.056, { bleed: 5, tau: 600 }],
    ['liver', 'печень', 'solid', [0.11, 1.205, -0.03], [-0.02, 1.225, -0.065], 0.05, { bleed: 12, tau: 900, cavK: 2 }],
    ['spleen', 'селезёнка', 'solid', [-0.10, 1.225, 0.03], [-0.10, 1.195, 0.035], 0.03, { bleed: 10, tau: 900, cavK: 2 }],
    ['stom', 'желудок', 'hollow', [-0.065, 1.19, -0.075], [-0.02, 1.15, -0.085], 0.035, { bleed: 2 }],
    ['kidR', 'правая почка', 'solid', [0.065, 1.155, 0.06], [0.07, 1.07, 0.06], 0.028, { bleed: 6, tau: 900, cavK: 1.5 }],
    ['kidL', 'левая почка', 'solid', [-0.065, 1.165, 0.06], [-0.07, 1.08, 0.06], 0.028, { bleed: 6, tau: 900, cavK: 1.5 }],
    ['gut1', 'кишечник', 'hollow', [-0.09, 1.075, -0.06], [0.09, 1.075, -0.06], 0.05, { bleed: 1.5 }],
    ['gut2', 'кишечник', 'hollow', [-0.08, 0.97, -0.065], [0.08, 0.97, -0.065], 0.045, { bleed: 1.5 }],
    ['blad', 'мочевой пузырь', 'hollow', [0, 0.93, -0.07], [0, 0.925, -0.07], 0.03, { bleed: 1 }],
    ['iliR', 'подвздошная артерия справа', 'art', [-0.006, 0.985, 0.012], [0.07, 0.895, -0.035], 0.007, { bleed: 45, comp: 'junc' }],
    ['iliL', 'подвздошная артерия слева', 'art', [-0.008, 0.985, 0.012], [-0.07, 0.895, -0.035], 0.007, { bleed: 45, comp: 'junc' }],
    ['femCR', 'бедренная артерия справа (пах)', 'art', [0.07, 0.895, -0.035], [0.085, 0.855, -0.07], 0.0065, { bleed: 32, comp: 'junc' }],
    ['femCL', 'бедренная артерия слева (пах)', 'art', [-0.07, 0.895, -0.035], [-0.085, 0.855, -0.07], 0.0065, { bleed: 32, comp: 'junc' }],
    ['ilwR', 'кости таза', 'bone', [0.12, 1.03, 0.02], [0.10, 0.92, -0.01], 0.026, { legDown: 1, bleed: 4, tau: 600 }],
    ['ilwL', 'кости таза', 'bone', [-0.12, 1.03, 0.02], [-0.10, 0.92, -0.01], 0.026, { legDown: 1, bleed: 4, tau: 600 }],
    ['sacr', 'крестец', 'bone', [0, 0.99, 0.075], [0, 0.91, 0.08], 0.03, { legDown: 1, bleed: 3, tau: 600, cavCord: 'cauda' }],
    ['pubR', 'лобковая кость', 'bone', [0.065, 0.885, -0.065], [0.005, 0.885, -0.08], 0.015, { legDown: 1, bleed: 3, tau: 600 }],
    ['pubL', 'лобковая кость', 'bone', [-0.065, 0.885, -0.065], [-0.005, 0.885, -0.08], 0.015, { legDown: 1, bleed: 3, tau: 600 }]
  ];
  /* конечности: строятся от суставов покоя (a, b — суставы; off — сдвиг
     от оси долей медиального/переднего направления, м) */
  const LIMB = {
    thigh: [
      ['femur', 'бедренная кость', 'bone', 0.015, 0, 0, { legDown: 1, bleed: 2.5, tau: 600 }],
      ['femA', 'бедренная артерия', 'art', 0.0055, 0.03, -0.03, { bleed: 22, comp: 'limb', taper: [1, 0.4, 1] }],
      ['femP', 'глубокая артерия бедра', 'art', 0.004, 0.012, 0.02, { bleed: 14, comp: 'limb', t1: 0.55 }],
      ['femV', 'бедренная вена', 'vein', 0.006, 0.038, -0.022, { bleed: 8, comp: 'limb', tau: 240 }]
    ],
    shin: [
      ['tibia', 'большеберцовая кость', 'bone', 0.012, 0.01, -0.012, { legDown: 1, bleed: 1.2, tau: 400 }],
      ['fibula', 'малоберцовая кость', 'bone', 0.006, -0.03, 0.005, { limp: 0.45, bleed: 0.4, tau: 300 }],
      ['popl', 'подколенная артерия', 'art', 0.0045, 0.0, 0.03, { bleed: 12, comp: 'limb', t1: 0.18 }],
      ['tibA', 'артерии голени', 'art', 0.0025, 0.0, 0.015, { bleed: 4, comp: 'limb', t0: 0.15, tau: 400 }]
    ],
    foot: [['footB', 'кости стопы', 'bone', 0.02, 0, 0, { limp: 0.75, bleed: 0.6, tau: 300 }]],
    uarm: [
      ['hum', 'плечевая кость', 'bone', 0.012, 0, 0, { armK: 1, bleed: 1.2, tau: 400 }],
      ['brach', 'плечевая артерия', 'art', 0.0035, 0.02, 0, { bleed: 10, comp: 'limb' }]
    ],
    farm: [
      ['rad', 'кости предплечья', 'bone', 0.012, 0, 0, { armK: 0.75, bleed: 0.6, tau: 300 }],
      ['radA', 'лучевая/локтевая артерия', 'art', 0.002, 0.016, 0, { bleed: 2.5, comp: 'limb', tau: 600 }]
    ],
    hand: [['handB', 'кости кисти', 'bone', 0.016, 0, 0, { armK: 0.55, bleed: 0.5, tau: 300 }]]
  };
  const LIMB_JOINTS = { thigh: ['hip', 'knee'], shin: ['knee', 'ankle'], foot: ['ankle', 'toe'], uarm: ['shoulder', 'elbow'], farm: ['elbow', 'wrist'], hand: ['wrist', null] };
  const ZONE_NAME = { head: 'голова', helmet: 'голова', neck: 'шея', thorax: 'грудь', abdomen: 'живот', pelvis: 'таз', uarm: 'плечо', farm: 'предплечье',
    hand: 'кисть', thigh: 'бедро', shin: 'голень', foot: 'стопа', plate: 'плита', blast: 'подрыв', frag: 'осколки' };
  const SIDE_NAME = { L: ' лев.', R: ' прав.' };
  const TORSO_Z = { head: 1, helmet: 1, neck: 1, thorax: 1, abdomen: 1, pelvis: 1 };

  /* ------------------------------------------------------------ геометрия */
  function segDist2(p, a, b) {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const L = abx * abx + aby * aby + abz * abz;
    let t = L > 1e-12 ? ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz) / L : 0;
    t = clamp(t, 0, 1);
    const x = a[0] + abx * t - p[0], y = a[1] + aby * t - p[1], z = a[2] + abz * t - p[2];
    return x * x + y * y + z * z;
  }

  /* Органы бойца: туловище — как есть (база модели), конечности — от
     суставов его скелета в покое. */
  function buildOrgans(restOf) {
    const out = [];
    for (const r of TORSO) {
      const o = Object.assign({ key: r[0], name: r[1], kind: r[2], a: r[3], b: r[4], r: r[5], region: 'torso' }, r[6] || {});
      out.push(o);
    }
    for (const S of ['R', 'L']) {
      const sg = S === 'R' ? 1 : -1;
      for (const zone in LIMB) {
        const [ja, jb] = LIMB_JOINTS[zone];
        const A = restOf(ja + S);
        let B = jb ? restOf(jb + S) : null;
        if (!A) continue;
        if (!B) B = [A[0] + sg * 0.09, A[1] - 0.005, A[2]];
        const ax = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], al = Math.hypot(ax[0], ax[1], ax[2]) || 1;
        ax[0] /= al; ax[1] /= al; ax[2] /= al;
        /* медиальное (к средней линии) и переднее направления, ортогональные оси */
        const ortho = (v) => { const d = v[0] * ax[0] + v[1] * ax[1] + v[2] * ax[2]; const w = [v[0] - ax[0] * d, v[1] - ax[1] * d, v[2] - ax[2] * d]; const l = Math.hypot(w[0], w[1], w[2]); return l > 1e-4 ? [w[0] / l, w[1] / l, w[2] / l] : [0, 0, 0]; };
        let med = ortho([-sg, 0, 0]);
        if (Math.hypot(med[0], med[1], med[2]) < 0.5) med = ortho([0, -1, 0]);
        const ant = ortho([0, 0, -1]);
        for (const L of LIMB[zone]) {
          const ex = L[6] || {};
          const t0 = ex.t0 || 0, t1 = ex.t1 || 1;
          const off = [med[0] * L[4] + ant[0] * L[5], med[1] * L[4] + ant[1] * L[5], med[2] * L[4] + ant[2] * L[5]];
          const P = (t) => [A[0] + (B[0] - A[0]) * t + off[0], A[1] + (B[1] - A[1]) * t + off[1], A[2] + (B[2] - A[2]) * t + off[2]];
          out.push(Object.assign({ key: L[0] + S, name: L[1] + SIDE_NAME[S].replace('.', '.'), kind: L[2], a: P(t0), b: P(t1), r: L[3], region: zone + S, zone, side: S }, ex));
        }
      }
    }
    return out;
  }

  /* --------------------------------------------------------- раневой канал */
  function permR(B, s, fragOn) {
    const r0 = B.d * 0.5;
    if (s < B.yaw) return r0;
    const k = clamp((s - B.yaw) / 0.04, 0, 1);
    let r = r0 + (B.perm - r0) * k;
    if (!fragOn && s > B.yaw + 0.16) r = Math.max(r0, r * (1 - clamp((s - B.yaw - 0.16) / 0.2, 0, 0.45)));
    return r;
  }
  function cavR(B, s, eK) {
    const base = B.yaw >= 999 ? B.cav : (s < B.yaw ? B.cav * 0.28 : B.cav * clamp(0.28 + (s - B.yaw) / 0.05, 0.28, 1));
    return base * Math.sqrt(clamp(eK, 0.05, 1.2));
  }

  /* ------------------------------------------------------------ состояние */
  function initState(trait) {
    const t = trait || {};
    return {
      vol: 5500 * (t.hp || 1), lost: 0,
      src: [],                    // источники кровотечения
      inj: [],                    // список повреждений (для HUD и осмотра)
      pain: 0, painFloor: 0,
      breath: 1,                  // доля нормального дыхания
      limp: { L: 0, R: 0 }, legDown: false, para: false,
      arm: { L: 0, R: 0 },
      koT: Infinity,              // через сколько секунд потеря сознания (сердце/аорта)
      colTh: 0.33 + rnd() * 0.08, // доля кровопотери до обморока (индивидуально)
      stun: 0, concussion: 0,
      bleedMul: (t.bleed || 1),
      /* v14: смерть — не «полоска ноль». Потеря сознания (colTh) и
         необратимая остановка (deathTh, ~50 % объёма, класс IV); аспирация
         крови при ранении шеи — удушье; nPen — сколько пуль вошло в
         туловище/шею (каждая следующая роняет почти наверняка). */
      deathTh: 0.48 + rnd() * 0.07, unc: false, uncT: 0, dead: false,
      asp: 0, hyp: 0, nPen: 0, nNeck: 0, conscious: 1
    };
  }
  function addInj(st, key, text, sev, zone, side) {
    const k = key + (side || '');
    const e = st.inj.find((x) => x.k === k);
    if (e) { e.sev = Math.max(e.sev, sev); e.n++; e.text = text; return e; }
    const n = { k, text, sev, zone, side: side || '', n: 1 };
    st.inj.push(n);
    return n;
  }
  function addSrc(st, o, rate, opt) {
    opt = opt || {};
    const key = o.key;
    let e = st.src.find((x) => x.key === key);
    if (!e) { e = { key, name: o.name, art: o.kind === 'art' || o.kind === 'heart', comp: o.comp || (o.region && o.region !== 'torso' ? 'limb' : 'none'), zone: o.zone || opt.zone, side: o.side || opt.side || '', rate: 0, tau: o.tau === undefined ? (o.kind === 'art' || o.kind === 'heart' ? 0 : 120) : o.tau, tq: false, dressed: 0, central: !!o.central }; st.src.push(e); }
    e.rate += rate * st.bleedMul;
    return e;
  }

  /* --------------------------------------------------------------- рана ---
     a: { q, db, zone, side, ammo (id), v, v0, eK, frag, pen (пробита ли броня
     или брони нет), layerKind, organs }
     Возвращает: { cns, collapse ('cord'|'tetra'), organs:[...], name, fracture,
     vessel, legDown, para } */
  function wound(st, a) {
    const B = BAL[a.ammo] || (a.frag ? BAL.frag : BAL_DEF);
    const eK = clamp(a.eK === undefined ? 1 : a.eK, 0.05, 1.2);
    const R = { organs: [], cns: false, collapse: null, vessel: null, fracture: false, name: null, sev: 0 };
    if (!a.pen) {
      /* заброневая травма: удар, боль, при плите — возможны переломы рёбер;
         шлем — сотрясение, редко — потеря сознания */
      if (a.layerKind === 'helmet') {
        st.concussion = Math.min(1, st.concussion + 0.35 * eK);
        st.stun = Math.max(st.stun, 1.2 + 1.8 * eK);
        st.pain += 0.25;
        addInj(st, 'conc', 'Удар в шлем — оглушение', 1, 'head');
        if (rnd() < 0.06 * eK) R.collapse = 'ko';
      } else {
        st.pain += a.layerKind === 'soft' ? 0.35 : 0.3 + 0.2 * eK;
        st.stun = Math.max(st.stun, 0.5 + 0.6 * eK);
        if (a.layerKind !== 'soft' && rnd() < 0.18 * eK) { addInj(st, 'rib', 'Ушиб под плитой, сломано ребро', 1, 'thorax'); st.breath = Math.min(st.breath, 0.85); }
        else addInj(st, 'bat', 'Удар в бронежилет — ушиб', 0, a.zone);
      }
      R.name = a.layerKind === 'helmet' ? 'удар в шлем' : 'заброневая травма';
      return R;
    }
    const fragOn = B.frag && a.v > (B.fragV || 760);
    const depth = B.depth * clamp(0.35 + 0.65 * eK, 0.2, 1) * (a.layerKind === 'plate' ? 0.6 : 1);
    const torso = TORSO_Z[a.zone];
    const reg = torso ? 'torso' : a.zone + (a.side || '');
    const orgs = a.organs.filter((o) => o.region === reg);
    const hitMin = new Map();
    const step = 0.01, n = Math.ceil(depth / step);
    const p = [0, 0, 0];
    for (let i = 0; i <= n; i++) {
      const s = i * step;
      p[0] = a.q[0] + a.db[0] * s; p[1] = a.q[1] + a.db[1] * s; p[2] = a.q[2] + a.db[2] * s;
      const rp = permR(B, s, fragOn) * (fragOn && s > B.yaw ? 1.25 : 1), rc = cavR(B, s, eK);
      for (const o of orgs) {
        const d = Math.sqrt(segDist2(p, o.a, o.b)) - o.r;
        const prev = hitMin.get(o);
        const score = d - rp;           // < 0 — постоянная полость задела орган
        if (!prev || score < prev.score) hitMin.set(o, { score, d, rp, rc, s });
      }
    }
    let pain = 0;
    const cordHit = (key) => { const o = orgs.find((x) => x.key === key); if (o && !hitMin.get(o).direct) { hitMin.get(o).cav = true; } };
    /* попадания: прямое (постоянная полость) или от временной полости */
    const hits = [];
    for (const [o, h] of hitMin) {
      let direct = h.score < 0, cav = false;
      if (!direct) {
        const dc = h.d;               // расстояние от края органа до оси канала
        if (o.kind === 'solid' || o.kind === 'cns') cav = dc < h.rc * (o.kind === 'cns' ? 0.35 : 0.8);
        else if (o.kind === 'cordHi' || o.kind === 'cordLo' || o.kind === 'cauda') cav = dc < h.rc * 0.45 && rnd() < 0.7;
        else if (o.kind === 'bone') cav = dc < h.rc * 0.22 && rnd() < 0.5;
        else if (o.kind === 'art' || o.kind === 'vein' || o.kind === 'heart') cav = a.zone === 'neck'
          /* в шее ткани зажаты между позвоночником и кожей: временная полость
             винтовочной пули рвёт сосуды в радиусе нескольких сантиметров */
          ? dc < h.rc * 0.75 && rnd() < 0.8
          : dc < h.rc * 0.3 && rnd() < 0.35;
        else if (o.kind === 'lung' || o.kind === 'hollow' || o.kind === 'air') cav = dc < h.rc * 0.25;
      }
      if (direct || cav) hits.push({ o, direct, cav, h });
    }
    /* контузия спинного мозга при переломе позвонка с винтовочной полостью */
    for (const x of hits) if (x.o.cavCord && x.h.rc > 0.03 && !hits.some((y) => y.o.key === x.o.cavCord) && rnd() < 0.45) {
      const co = orgs.find((y) => y.key === x.o.cavCord);
      if (co) hits.push({ o: co, direct: false, cav: true, h: hitMin.get(co) });
    }
    /* мышцы и мягкие ткани: всегда — кровотечение по размеру канала */
    const trackK = clamp((B.perm / 0.012) * Math.min(1, depth / 0.25), 0.3, 1.8);
    let soft = 0.5 + 1.1 * trackK * eK;
    for (const x of hits) {
      const o = x.o, sevK = x.direct ? 1 : 0.55;
      R.organs.push(o.name);
      switch (o.kind) {
        case 'cns':
          /* v14: C1–C4 — не мгновенная смерть: паралич дыхательных мышц
             (диафрагма C3–C5). Человек оседает обмякшим, без голоса, теряет
             сознание за ~1 мин гипоксии и умирает через несколько минут.
             Контузия от временной полости — не всегда полный разрыв. */
          if (o.key === 'cordC1' && (x.direct || rnd() < 0.6)) {
            R.collapse = 'tetra'; st.apnea = true; if (!R.cns) R.name = o.name; R.sev = 3;
            addInj(st, o.key, 'Высокая травма шеи — паралич, остановка дыхания', 3, a.zone); break;
          }
          if (o.key === 'cordC1') { R.collapse = 'tetra'; if (!R.cns) R.name = o.name; R.sev = 3; addInj(st, o.key, 'Повреждён спинной мозг — паралич', 3, a.zone); break; }
          if (!R.cns) R.name = o.name; R.cns = true; R.sev = 3; break;
        case 'cordHi': R.collapse = 'tetra'; if (!R.cns) R.name = o.name; addInj(st, o.key, 'Повреждён спинной мозг — паралич', 3, a.zone); R.sev = 3; break;
        case 'cordLo': st.para = true; st.legDown = true; addInj(st, o.key, 'Повреждён спинной мозг — ноги не слушаются', 3, a.zone); pain += 0.5; R.sev = Math.max(R.sev, 3); if (!R.cns && R.collapse !== 'tetra') R.name = o.name; break;
        case 'cauda': st.limp.L = st.limp.R = 0.9; if (rnd() < 0.5) st.legDown = true; addInj(st, o.key, 'Повреждены нервы ног — слабость в ногах', 2, a.zone); pain += 0.6; break;
        case 'heart': addSrc(st, o, o.bleed * sevK); st.koT = Math.min(st.koT, 5 + 9 * rnd()); addInj(st, o.key, 'Ранение сердца', 3, a.zone); R.vessel = o.name; R.sev = 3; break;
        case 'art': {
          const big = !!o.central;
          const rate = o.bleed * (x.direct ? clamp(0.6 + x.h.rp / 0.01, 0.6, 1) : 0.45);
          addSrc(st, o, rate, { zone: a.zone, side: a.side });
          if (big) st.koT = Math.min(st.koT, 8 + 12 * rnd());
          addInj(st, o.key, 'Артериальное кровотечение · ' + o.name, 3, o.zone || a.zone, o.side || a.side);
          R.vessel = R.vessel || o.name; R.sev = Math.max(R.sev, 2); break;
        }
        case 'vein': addSrc(st, o, o.bleed * sevK, { zone: a.zone, side: a.side }); addInj(st, o.key, 'Сильное кровотечение · ' + o.name, 2, o.zone || a.zone, o.side || a.side); R.vessel = R.vessel || o.name; R.sev = Math.max(R.sev, 2); break;
        case 'lung': addSrc(st, o, o.bleed * sevK); st.breath = Math.min(st.breath, st.inj.some((i) => /лёгк/.test(i.text)) ? 0.3 : 0.6); addInj(st, o.key, 'Пробито ' + o.name + ' — одышка', 2, a.zone); pain += 0.35; break;
        case 'air': st.breath = Math.min(st.breath, 0.45); addSrc(st, { key: o.key, name: o.name, tau: 300 }, 2.5); addInj(st, o.key, 'Ранение гортани — трудно дышать', 2, a.zone); pain += 0.4; break;
        case 'solid': addSrc(st, o, o.bleed * (x.direct ? 1 : 0.5) * (x.h.rc > 0.035 ? (o.cavK || 1) : 1)); addInj(st, o.key, 'Ранение органа · ' + o.name, 2, a.zone); pain += 0.45; break;
        case 'hollow': addSrc(st, o, o.bleed); addInj(st, o.key, 'Ранение · ' + o.name, 1, a.zone); pain += 0.5; break;
        case 'face': addSrc(st, o, o.bleed); addInj(st, o.key, 'Ранение лица', 2, 'head'); pain += 0.7; st.stun = Math.max(st.stun, 1.5); break;
        case 'bone': {
          R.fracture = true; pain += 0.7;
          if (o.bleed) addSrc(st, o, o.bleed);
          if (o.legDown) { st.legDown = true; addInj(st, o.key, 'Перелом · ' + o.name + ' — стоять нельзя', 3, o.zone || a.zone, o.side || a.side); }
          else if (o.limp) { const S = o.side || a.side || 'R'; st.limp[S] = Math.max(st.limp[S], o.limp); addInj(st, o.key, 'Перелом · ' + o.name + ' — хромота', 2, o.zone, S); }
          else if (o.armK) { const S = o.arm || o.side || a.side || 'R'; st.arm[S] = Math.max(st.arm[S], o.armK); addInj(st, o.key, 'Перелом · ' + o.name + (o.armK >= 1 ? ' — рука не держит' : ''), 2, o.zone || a.zone, S); }
          else { addInj(st, o.key, 'Перелом · ' + o.name, 2, a.zone); pain += 0.5; }
          break;
        }
      }
    }
    /* мягкие ткани */
    if (!torso || !hits.length) {
      const zn = ZONE_NAME[a.zone] || a.zone;
      addSrc(st, { key: 'soft_' + a.zone + (a.side || ''), name: 'рана · ' + zn + (SIDE_NAME[a.side] || ''), tau: 150, zone: a.zone, side: a.side, region: torso ? 'torso' : 'limb', comp: torso ? (a.zone === 'neck' || a.zone === 'pelvis' ? 'junc' : 'chest') : 'limb' }, soft, { zone: a.zone, side: a.side });
      if (a.zone === 'thigh' || a.zone === 'shin' || a.zone === 'foot') {
        const S = a.side || 'R';
        st.limp[S] = Math.max(st.limp[S], clamp(0.25 + 0.25 * trackK * eK, 0.2, 0.6) + (st.limp[S] > 0 ? 0.15 : 0));
        if (!hits.length) addInj(st, 'mus_' + a.zone, 'Ранение мышц · ' + zn + ' — хромота, бег невозможен', 1, a.zone, S);
      } else if (a.zone === 'uarm' || a.zone === 'farm' || a.zone === 'hand') {
        const S = a.side || 'R';
        st.arm[S] = Math.max(st.arm[S], 0.3 + 0.15 * trackK);
        if (!hits.length) addInj(st, 'mus_' + a.zone, 'Ранение · ' + zn + ' — рука слабеет', 1, a.zone, S);
      } else if (!hits.length) addInj(st, 'soft_' + a.zone, 'Касательное/мягких тканей · ' + zn, 1, a.zone, a.side);
    } else {
      /* мягкие ткани туловища вдоль канала */
      addSrc(st, { key: 'soft_' + a.zone, name: 'рана · ' + (ZONE_NAME[a.zone] || a.zone), tau: 150, region: 'torso', comp: a.zone === 'neck' || a.zone === 'pelvis' ? 'junc' : 'chest', zone: a.zone }, soft * 0.6, { zone: a.zone });
    }
    /* v14: внутреннее кровотечение по ходу канала. Между «именованными»
       органами — брыжейка и сосуды кишечника (живот), межрёберные сосуды и
       ткань лёгкого (грудь), венозные сплетения таза, мышцы и сплетения
       шеи. Это не капилляры: без хирурга оно не останавливается (τ ≈ 15 мин). */
    const INT = { neck: 12, thorax: 4.5, abdomen: 5.5, pelvis: 4.5 };
    if (INT[a.zone]) {
      const rate = INT[a.zone] * (0.55 + 0.45 * trackK) * (0.5 + 0.5 * eK);
      addSrc(st, { key: 'int_' + a.zone, name: a.zone === 'neck' ? 'кровотечение из тканей шеи' : 'внутреннее кровотечение · ' + ZONE_NAME[a.zone], tau: 900, region: 'torso', comp: a.zone === 'neck' ? 'junc' : 'none', zone: a.zone }, rate, { zone: a.zone });
    }
    /* шея: кровь затекает в дыхательные пути — человек давится и хрипит */
    if (a.zone === 'neck') {
      st.nNeck++;
      const air = hits.some((x) => x.o.kind === 'air' || x.o.kind === 'art' || x.o.kind === 'vein' || x.o.kind === 'face');
      st.asp = Math.min(1, st.asp + (air ? 0.45 : 0.2));
      st.breath = Math.min(st.breath, air ? 0.4 : 0.65);
      if (!st.inj.some((i) => i.k === 'neckw')) addInj(st, 'neckw', 'Ранение шеи — кровь в дыхательных путях', 3, 'neck');
    }
    /* v14: «остановка» без поражения ЦНС. Пуля в туловище — шок, боль и
       страх: большинство падает сразу (данные полицейских перестрелок и
       военной медицины — человек оседает в первые секунды), со второй пулей
       в корпус — почти всегда. В шею — всегда: схватился за горло и упал. */
    if (TORSO_Z[a.zone] && a.zone !== 'head' && a.zone !== 'helmet' && !R.cns) {
      st.nPen++;
      const pistol = B.yaw >= 999 && B.cav < 0.03;
      if (a.zone === 'neck') R.collapse = R.collapse || 'neck';
      else {
        const base = (pistol ? 0.32 : 0.55) + (a.zone === 'abdomen' ? 0.08 : a.zone === 'pelvis' ? 0.1 : 0);
        const p = clamp(base + 0.4 * (st.nPen - 1) + (R.sev >= 2 ? 0.18 : 0) + (st.legDown ? 0.3 : 0) + (st.shock || 0) * 0.3, 0, 1);
        if (rnd() < p) R.collapse = R.collapse || 'down';
      }
    }
    st.pain += 0.25 + pain + 0.15 * eK;
    st.painFloor = Math.max(st.painFloor, Math.min(0.6, st.painFloor + 0.08 + pain * 0.2));
    R.name = R.name || (R.organs[0] || null);
    return R;
  }

  /* --------------------------------------------------------- обновление ---
     Возвращает 'ko' (потеря сознания: падает) или null. */
  function update(st, dt, out) {
    const lossF = st.lost / st.vol;
    /* давление падает с объёмом — кровотечение слабеет */
    const pf = clamp(1 - lossF / 0.62, 0.12, 1);
    let tot = 0, art = 0;
    for (const e of st.src) {
      if (e.tq) { e.cur = 0; continue; }
      if (e.tau > 0) e.rate *= Math.exp(-dt / e.tau);
      const r = e.rate * (e.art ? pf : (0.4 + 0.6 * pf));
      e.cur = r;
      tot += r; if (e.art) art += r;
    }
    st.src = st.src.filter((e) => e.tq || e.rate > 0.05);
    st.lost += tot * dt;
    st.bleed = tot; st.bleedArt = art;
    st.pain = Math.max(st.painFloor, st.pain * Math.exp(-dt / 25));
    if (st.stun > 0) st.stun = Math.max(0, st.stun - dt);
    st.concussion = Math.max(0, st.concussion - dt * 0.02);
    if (st.koT < Infinity) st.koT -= dt;
    const lf = st.lost / st.vol;
    st.lossF = lf;
    st.shock = clamp((lf - 0.15) / (st.colTh - 0.15), 0, 1);
    /* удушье: кровь в дыхательных путях (ранение шеи) — гипоксия копится,
       пока человек не потеряет сознание (обычно минута-две) */
    if (st.apnea) { st.breath = 0; st.hyp = Math.min(1.2, st.hyp + dt / 55); }
    if (st.asp > 0) {
      st.asp = Math.min(1, st.asp + dt * 0.004 * (st.bleed > 3 ? 1 : 0.3));
      st.breath = Math.min(st.breath, 1 - 0.7 * st.asp);
      st.hyp = Math.min(1.2, st.hyp + dt * st.asp / 75);
    }
    /* сознание 1 → 0: кровопотеря и гипоксия (для «живости» агонии) */
    st.conscious = st.unc ? 0 : clamp(1 - Math.max(st.shock * 0.85, (st.hyp - 0.3) / 0.7), 0, 1);
    if (st.unc) {
      st.uncT += dt;
      /* без сознания: кровотечение продолжается; необратимая остановка — при
         потере ~50 % крови, при остановке сердца или долгой гипоксии */
      if (!st.dead && (lf >= st.deathTh || (st.koT <= -60) || (st.hyp >= 1.15 && st.uncT > (st.apnea ? 150 : 0)) || (st.uncT > 240 && st.bleed < 0.5))) { st.dead = true; return 'dead'; }
      return null;
    }
    if (st.koT <= 0) { st.unc = true; return 'ko_heart'; }
    if (lf >= st.colTh) { st.unc = true; return 'ko'; }
    if (st.hyp >= 1) { st.unc = true; return 'ko_hyp'; }
    return null;
  }

  /* --------------------------------- функциональные последствия для бойца */
  function apply(st, c) {
    if (!c) return;
    const limp = Math.max(st.limp.L, st.limp.R);
    c.limp = clamp(limp + st.shock * 0.25, 0, 1);
    c.injLeg = limp > 0.12 || st.legDown;
    c.legDown = st.legDown;
    c.armK = clamp(Math.max(st.arm.L * 0.8, st.arm.R) + st.pain * 0.15 + st.shock * 0.3, 0, 2);
    c.injArm = c.armK > 0.25;
    c.breathK = clamp(st.breath * (1 - st.shock * 0.5), 0.1, 1);
    c.shockK = st.shock;
    c.stun = st.stun;
    c.painK = st.pain;
  }

  /* ------------------------------------------------- текст для экрана ---- */
  function symptoms(st) {
    const lf = st.lossF || 0;
    if (lf > st.colTh * 0.88) return { t: 'Темнеет в глазах', c: 3 };
    if (lf > 0.25) return { t: 'Кружится голова, руки дрожат', c: 2 };
    if (lf > 0.15) return { t: 'Слабость, частый пульс', c: 1 };
    if (st.breath < 0.7) return { t: 'Одышка', c: 1 };
    if (st.stun > 0.3) return { t: 'Оглушение', c: 1 };
    if (st.pain > 0.9) return { t: 'Сильная боль', c: 1 };
    return null;
  }
  function causeText(st, R, zone) {
    if (R && R.cns) return 'Поражение ЦНС · ' + R.name;
    if (R && R.collapse === 'tetra') return 'Ранение позвоночника · паралич';
    return null;
  }

  return { BAL, TORSO, LIMB, buildOrgans, initState, wound, update, apply, symptoms, causeText, addInj, addSrc, ZONE_NAME, SIDE_NAME };
});
