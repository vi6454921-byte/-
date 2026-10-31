
/* ==========================================================================
   МОДУЛЬ: soldier/clothing.js
   ========================================================================== */
/* ============================================================================
   Одежда бойца: крой, камуфляж и ткань.

   1. КРОЙ. Рукава кителя объёмнее руки, брюки заправлены в берцы с
      напуском — вершины слоёв досаживаются по нормали в позе покоя.
   2. КАМУФЛЯЖ под референс: «Дельта-1» — мультикам (мягкие пятна и тонкие
      тёмные «ветки»), «Дельта-2» — серо-зелёный с «органическими
      пикселями», «Альфа-1» — чёрный почти без рисунка, «Альфа-2» —
      чёрно-зелёная цифра.
   3. ТКАНЬ. Шейдер формы добавляет складки там, где ткань мнётся: локоть,
      манжета, колено, напуск над берцами, пояс. Складки — процедурный
      рельеф по точке покоя (dFdx/dFdy), поэтому они гнутся вместе с телом.
      Сверху — пыль и вытертость (низ брюк, колени, локти) и бархатистый
      отлив ткани (sheen).
   ========================================================================== */
(function (root, factory) {
  const C = factory(root.GUtil, root.GTex);
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  else root.GCloth = C;
})(typeof self !== 'undefined' ? self : this, function (U, T) {
  'use strict';

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  /* ------------------------------------------------------------ крой -- */
  /* Рукав шире руки: от подмышки до манжеты, у манжеты прибавка меньше,
     чтобы рукав лёг поверх перчатки. Брюки над берцами — напуск. */
  function fit(group, pos, nrm, n, J) {
    const inv = nrm instanceof Int16Array ? 1 / 32767 : 1;
    const ankY = J && J.ankleR ? J.ankleR[1] : 0.085;
    for (let v = 0; v < n; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], ax = Math.abs(x);
      let d = 0;
      if (group === 'shirt' && ax >= 0.23) {
        d = sstep(0.24, 0.33, ax) * (0.0068 - 0.0016 * sstep(0.45, 0.60, ax)) * (1 - 0.45 * sstep(0.66, 0.76, ax));
        /* рукав кончается у запястья: дальше — манжета перчатки GLB.
           v25: рукав доходит почти до сустава (было −1,8 см — срез манжеты
           торчал наружу) и чуть расширяется к краю, чтобы манжета перчатки
           (у бойцов она удлинена и сужена, 05_viewmodel_ak.js) уходила под него. */
        const xEnd = (J && J.wristR ? Math.abs(J.wristR[0]) : 0.757) - 0.005;
        d += 0.0022 * sstep(xEnd - 0.045, xEnd - 0.004, ax);
        if (ax > xEnd) pos[v * 3] = Math.sign(x) * (xEnd + (ax - xEnd) * 0.12);
      } else if (group === 'pants') {
        const h = y - ankY;
        d = 0.006 * sstep(0.05, 0.12, h) * (1 - sstep(0.16, 0.26, h));
      }
      if (d <= 0) continue;
      d *= inv;
      pos[v * 3] += nrm[v * 3] * d;
      pos[v * 3 + 1] += nrm[v * 3 + 1] * d;
      pos[v * 3 + 2] += nrm[v * 3 + 2] * d;
    }
  }

  /* ------------------------------------------------------- камуфляж -- */
  /* Палитры под референс (sRGB 0..255). Размеры пятен — в пикселях тайла
     512 px на 0,42 м ткани. */
  const PAL = {
    delta_green: {
      base: [92, 96, 60],
      layers: [
        { col: [116, 112, 74], r: [34, 70], n: 16, wob: 0.44 },
        { col: [66, 82, 44], r: [26, 62], n: 22, wob: 0.48 },
        { col: [90, 68, 44], r: [16, 42], n: 24, wob: 0.52 },
        { col: [44, 54, 32], r: [10, 28], n: 34, wob: 0.55 }
      ],
      speck: [[44, 50, 30, 0.28], [130, 124, 88, 0.18]],
      branches: { col: [38, 38, 26], n: 28, w: [1.2, 2.6] }, blur: 1.0
    },
    delta_grey: {
      base: [124, 122, 104],
      pixel: 3,
      layers: [
        { col: [146, 140, 116], r: [34, 76], n: 16 },
        { col: [100, 106, 88], r: [24, 58], n: 22 },
        { col: [78, 82, 66], r: [14, 38], n: 28 },
        { col: [54, 56, 46], r: [8, 20], n: 34 }
      ],
      speck: [[74, 78, 62, 0.24], [156, 152, 130, 0.18]],
      branches: { col: [70, 72, 60], n: 14, w: [1.0, 2.0] }, blur: 0.6
    },
    alpha_black: {
      base: [36, 37, 40],
      layers: [
        { col: [44, 45, 49], r: [44, 96], n: 12, wob: 0.36 },
        { col: [29, 30, 33], r: [26, 62], n: 16, wob: 0.44 },
        { col: [50, 51, 56], r: [12, 30], n: 14, wob: 0.48 }
      ],
      speck: [[26, 27, 30, 0.3], [60, 62, 67, 0.12]], blur: 0.8
    },
    alpha_cadpat: {
      base: [30, 33, 30],
      pixel: 6,
      layers: [
        { col: [56, 70, 50], r: [36, 80], n: 16 },
        { col: [40, 51, 38], r: [24, 56], n: 20 },
        { col: [74, 88, 64], r: [12, 30], n: 22 },
        { col: [19, 21, 19], r: [10, 26], n: 24 }
      ],
      speck: [[50, 62, 46, 0.22], [18, 20, 18, 0.24]]
    }
  };
  /* v26: расцветки редактора внешнего вида (js/app/looks.js). Камуфляжи — те же
     слои пятен (sRGB 0..255, пиксели тайла 512 px на 0,42 м ткани); однотонные —
     только крапина и вытертость; тельняшки — полосы в шейдере ткани (stripes),
     текстура у них — средний цвет (для дальнего заменителя 29c_lod.js). */
  const sp = (a, b) => [[a[0], a[1], a[2], 0.22], [b[0], b[1], b[2], 0.16]];
  Object.assign(PAL, {
    multicam: {
      base: [150, 134, 102],
      layers: [
        { col: [124, 112, 80], r: [32, 72], n: 16, wob: 0.46 },
        { col: [98, 102, 66], r: [24, 60], n: 20, wob: 0.5 },
        { col: [122, 96, 66], r: [16, 40], n: 22, wob: 0.52 },
        { col: [72, 62, 46], r: [9, 24], n: 30, wob: 0.56 }
      ],
      speck: sp([96, 84, 62], [170, 156, 124]),
      branches: { col: [62, 54, 40], n: 26, w: [1.1, 2.3] }, blur: 1.0
    },
    flora: {
      base: [124, 134, 100],
      layers: [
        { col: [86, 106, 70], r: [20, 40], n: 22, wob: 0.55, ex: 2.6 },
        { col: [118, 92, 66], r: [12, 26], n: 18, wob: 0.55, ex: 2.4 },
        { col: [152, 152, 120], r: [9, 18], n: 12, wob: 0.5, ex: 2.2 }
      ],
      speck: sp([90, 104, 74], [150, 150, 122]), blur: 0.8
    },
    emr: {
      base: [128, 132, 106],
      pixel: 4,
      layers: [
        { col: [92, 108, 74], r: [30, 64], n: 18 },
        { col: [106, 86, 62], r: [20, 46], n: 20 },
        { col: [50, 52, 42], r: [12, 28], n: 24 },
        { col: [152, 150, 126], r: [8, 18], n: 14 }
      ],
      speck: sp([80, 92, 66], [150, 148, 124])
    },
    woodland: {
      base: [120, 114, 84],
      layers: [
        { col: [74, 90, 56], r: [44, 90], n: 14, wob: 0.42 },
        { col: [94, 74, 52], r: [30, 68], n: 16, wob: 0.48 },
        { col: [38, 38, 33], r: [14, 34], n: 22, wob: 0.56 }
      ],
      speck: sp([70, 80, 54], [140, 132, 100]), blur: 0.7
    },
    desert: {
      base: [190, 170, 132],
      layers: [
        { col: [160, 136, 100], r: [40, 88], n: 14, wob: 0.42 },
        { col: [130, 106, 78], r: [24, 58], n: 18, wob: 0.5 }
      ],
      speck: sp([150, 128, 96], [208, 192, 158]), blur: 0.9
    },
    winter: {
      base: [212, 214, 216],
      layers: [
        { col: [178, 182, 184], r: [30, 70], n: 16, wob: 0.46 },
        { col: [142, 146, 148], r: [12, 30], n: 18, wob: 0.52 }
      ],
      speck: sp([168, 172, 174], [226, 228, 230]), blur: 0.8
    },
    urban: {
      base: [122, 124, 126],
      layers: [
        { col: [92, 94, 98], r: [30, 70], n: 14, wob: 0.44 },
        { col: [62, 64, 68], r: [16, 40], n: 18, wob: 0.5 },
        { col: [160, 162, 162], r: [10, 26], n: 14, wob: 0.5 }
      ],
      speck: sp([80, 82, 86], [168, 170, 170]), blur: 0.7
    },
    olive: { base: [86, 90, 62], layers: [], speck: sp([72, 76, 52], [104, 108, 78]) },
    ranger: { base: [72, 78, 60], layers: [], speck: sp([60, 66, 50], [88, 94, 74]) },
    coyote: { base: [142, 118, 86], layers: [], speck: sp([120, 100, 72], [162, 138, 104]) },
    khaki: { base: [156, 146, 112], layers: [], speck: sp([134, 124, 94], [176, 166, 132]) },
    grey: { base: [96, 98, 100], layers: [], speck: sp([80, 82, 84], [114, 116, 118]) },
    black: { base: [34, 35, 37], layers: [], speck: sp([26, 27, 29], [48, 49, 52]), worn: 0.55 },
    /* тельняшки: белая полоса ~1,2 см, цветная ~0,9 см; рукава — кольцами */
    tel_blue: { stripes: { a: [226, 226, 222], b: [36, 70, 150], period: 0.021, duty: 0.43 } },
    tel_navy: { stripes: { a: [222, 222, 218], b: [22, 28, 58], period: 0.021, duty: 0.43 } },
    tel_green: { stripes: { a: [224, 224, 218], b: [38, 92, 50], period: 0.021, duty: 0.43 } },
    tel_black: { stripes: { a: [222, 222, 218], b: [24, 24, 26], period: 0.021, duty: 0.43 } }
  });
  /* v26: бельё и «без формы» (редактор внешнего вида: «вообще всё снять»).
     Своей сетки тела под формой у модели нет (кожа — только голова), поэтому
     открытые места рисуются на тех же сетках кителя и брюк: шейдер ткани по точке
     покоя (поза T, м) решает, где ткань, а где кожа (cut):
       arm   — |x| конца рукава (плечо 0,224, локоть 0,488): футболка 0,335, майка 0,175;
       neck  — горловина по высоте (воротник кителя 1,54–1,62), neckF — вырез спереди глубже,
               neckW — до какого |x| вырез (дальше — лямки майки);
       torso — верх снят целиком; hem — ниже этой высоты китель не рисуется (без «юбки»
               подола поверх трусов), там видны брюки/бельё;
       leg   — низ брючины: шорты 0,62 (колено 0,557), трусы-боксеры 0,80; ниже — кожа,
               а у берцев (y < 0,40) — носки. */
  const knit = (c, d) => sp(c.map((v) => Math.max(0, v - d)), c.map((v) => Math.min(255, v + d)));
  const TEE = { arm: 0.335, neck: 1.545, neckF: 0.03, neckW: 0.10 }, TANK = { arm: 0.175, neck: 1.50, neckF: 0.075, neckW: 0.095 };
  const SHORTS = { leg: 0.62 }, BRIEFS = { leg: 0.80 };
  const TEL = (b) => ({ a: [226, 226, 222], b, period: 0.021, duty: 0.43 });
  Object.assign(PAL, {
    tee_olive: { base: [92, 96, 68], layers: [], speck: knit([92, 96, 68], 10), cut: TEE, knit: 1 },
    tee_coyote: { base: [150, 126, 94], layers: [], speck: knit([150, 126, 94], 10), cut: TEE, knit: 1 },
    tee_black: { base: [36, 37, 39], layers: [], speck: knit([36, 37, 39], 7), cut: TEE, knit: 1 },
    tee_grey: { base: [124, 126, 124], layers: [], speck: knit([124, 126, 124], 18), cut: TEE, knit: 1 },
    tee_white: { base: [204, 204, 198], layers: [], speck: knit([204, 204, 198], 9), cut: TEE, knit: 1 },
    tee_tel: { stripes: TEL([36, 70, 150]), cut: TEE, knit: 1 },
    tank_tel: { stripes: TEL([36, 70, 150]), cut: TANK, knit: 1 },
    tank_olive: { base: [88, 92, 64], layers: [], speck: knit([88, 92, 64], 10), cut: TANK, knit: 1 },
    tank_black: { base: [36, 37, 39], layers: [], speck: knit([36, 37, 39], 7), cut: TANK, knit: 1 },
    tank_white: { base: [204, 204, 198], layers: [], speck: knit([204, 204, 198], 9), cut: TANK, knit: 1 },
    bare: { base: [176, 134, 106], layers: [], speck: [], cut: { torso: 1, hem: 1.0 } },
    shorts_olive: { base: [80, 86, 58], layers: [], speck: sp([68, 72, 50], [98, 102, 74]), cut: SHORTS },
    shorts_coyote: { base: [140, 116, 84], layers: [], speck: sp([120, 100, 72], [160, 136, 102]), cut: SHORTS },
    shorts_black: { base: [36, 37, 39], layers: [], speck: sp([28, 29, 31], [50, 51, 54]), cut: SHORTS },
    briefs_black: { base: [30, 31, 33], layers: [], speck: knit([30, 31, 33], 6), cut: BRIEFS, knit: 1 },
    briefs_navy: { base: [30, 40, 76], layers: [], speck: knit([30, 40, 76], 8), cut: BRIEFS, knit: 1 },
    briefs_olive: { base: [72, 78, 54], layers: [], speck: knit([72, 78, 54], 9), cut: BRIEFS, knit: 1 }
  });
  for (const k in PAL) {
    const Q = PAL[k];
    if (!Q.stripes) continue;
    const A = Q.stripes.a, B = Q.stripes.b, d = Q.stripes.duty;
    Q.base = A.map((v, i) => Math.round(v * (1 - d) + B[i] * d));
    Q.layers = []; Q.speck = [];
  }
  /* список для интерфейса: id, название, группа */
  const LIST = [
    ['delta_green', 'Лесной «Дельта»', 'camo'], ['multicam', 'Мультикам', 'camo'], ['flora', 'Флора', 'camo'],
    ['emr', 'Цифра (ЕМР)', 'camo'], ['woodland', 'Вудленд', 'camo'], ['delta_grey', 'Пиксель серо-зелёный', 'camo'],
    ['alpha_cadpat', 'Цифра тёмная «Альфа»', 'camo'], ['desert', 'Пустыня', 'camo'], ['urban', 'Город', 'camo'],
    ['winter', 'Зима', 'camo'],
    ['olive', 'Олива', 'plain'], ['ranger', 'Рейнджер-грин', 'plain'], ['coyote', 'Койот', 'plain'],
    ['khaki', 'Хаки', 'plain'], ['grey', 'Серый', 'plain'], ['alpha_black', 'Чёрный «Альфа»', 'plain'], ['black', 'Чёрный', 'plain'],
    ['tel_blue', 'Тельняшка (голубая)', 'stripes'], ['tel_navy', 'Тельняшка (тёмно-синяя)', 'stripes'],
    ['tel_green', 'Тельняшка (зелёная)', 'stripes'], ['tel_black', 'Тельняшка (чёрная)', 'stripes'],
    ['tee_olive', 'Футболка (олива)', 'tee'], ['tee_coyote', 'Футболка (койот)', 'tee'], ['tee_black', 'Футболка (чёрная)', 'tee'],
    ['tee_grey', 'Футболка (серый меланж)', 'tee'], ['tee_white', 'Футболка (белая)', 'tee'], ['tee_tel', 'Тельняшка-футболка', 'tee'],
    ['tank_tel', 'Тельник-майка', 'tank'], ['tank_olive', 'Майка (олива)', 'tank'], ['tank_black', 'Майка (чёрная)', 'tank'],
    ['tank_white', 'Майка (белая)', 'tank'], ['bare', 'Без верха', 'bare'],
    ['shorts_olive', 'Шорты (олива)', 'shorts'], ['shorts_coyote', 'Шорты (койот)', 'shorts'], ['shorts_black', 'Шорты (чёрные)', 'shorts'],
    ['briefs_black', 'Трусы (чёрные)', 'briefs'], ['briefs_navy', 'Трусы (тёмно-синие)', 'briefs'], ['briefs_olive', 'Трусы (олива)', 'briefs']
  ].map(([id, name, group]) => ({ id, name, group, base: PAL[id] && PAL[id].base }));
  const lin = (v) => Math.pow(v / 255, 2.2);
  /* полосы для шейдера ткани: линейные цвета, период (м), доля цветной полосы */
  function stripesOf(kind) {
    const Q = PAL[kind];
    if (!Q || !Q.stripes) return null;
    return { a: Q.stripes.a.map(lin), b: Q.stripes.b.map(lin), period: Q.stripes.period, duty: Q.stripes.duty };
  }
  /* v26: крой белья. part: 'top' — китель (рукава, горловина, торс), 'bottom' — брюки.
     null — обычная форма. Значения «выключено»: arm/neck 9, leg/hem −1. */
  function cutOf(kind, part) {
    const Q = PAL[kind], c = Q && Q.cut;
    if (!c) return null;
    if (part === 'bottom') return c.leg ? { arm: 9, torso: 0, neck: 9, neckF: 0, neckW: 9, hem: -1, leg: c.leg, sock: 0.40, knit: Q.knit || 0 } : null;
    if (!(c.arm || c.torso || c.neck)) return null;
    return { arm: c.arm || 9, torso: c.torso ? 1 : 0, neck: c.neck || 9, neckF: c.neckF || 0, neckW: c.neckW || 9, hem: c.hem || -1, leg: -1, sock: -1, knit: Q.knit || 0 };
  }
  /* верх не китель (тельняшка, футболка, майка, без верха): брюки и чехол «авто» — исходные */
  const isUnder = (kind) => !!(PAL[kind] && (PAL[kind].stripes || (PAL[kind].cut && !PAL[kind].cut.leg)));
  /* маска «кожа» по точке покоя — та же, что в шейдере (для дальнего заменителя 29c_lod.js) */
  function bareAt(B, x, y, z) {
    if (!B) return 0;
    const ax = Math.abs(x);
    if (B.torso || (ax > B.arm && y > 1.28)) return 1;
    const nY = B.neck - B.neckF * sstep(-0.03, -0.10, z);
    if (y > nY && ax < B.neckW) return 1;
    return y < B.leg ? 1 : 0;
  }
  if (T && T.PALETTES) for (const k in PAL) T.PALETTES[k] = PAL[k];

  /* тонкие изогнутые «ветки» мультикама, бесшовно по тайлу */
  function branches(c, B, seed) {
    const g = c.getContext('2d', { willReadFrequently: true }), S = c.width, sc = S / 512;
    const rnd = U.rng(seed);
    g.strokeStyle = 'rgb(' + B.col.join(',') + ')';
    g.lineCap = 'round';
    for (let i = 0; i < B.n; i++) {
      let x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2;
      const segs = 4 + Math.floor(rnd() * 6), step = (10 + rnd() * 16) * sc;
      g.lineWidth = U.lerp(B.w[0], B.w[1], rnd()) * sc;
      const pts = [[x, y]];
      for (let k = 0; k < segs; k++) {
        a += (rnd() - 0.5) * 1.3;
        x += Math.cos(a) * step; y += Math.sin(a) * step;
        pts.push([x, y]);
      }
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        g.beginPath();
        pts.forEach((p, k) => (k ? g.lineTo(p[0] + ox * S, p[1] + oy * S) : g.moveTo(p[0] + ox * S, p[1] + oy * S)));
        g.stroke();
      }
    }
  }
  /* мягкие края пятен: размытие по тайлу 3×3, чтобы не было шва */
  function soften(c, px) {
    const S = c.width;
    const big = document.createElement('canvas'); big.width = big.height = S * 3;
    const gb = big.getContext('2d', { willReadFrequently: true });
    for (let oy = 0; oy < 3; oy++) for (let ox = 0; ox < 3; ox++) gb.drawImage(c, ox * S, oy * S);
    const out = c.getContext('2d', { willReadFrequently: true });
    out.save();
    out.filter = 'blur(' + (px * S / 512).toFixed(2) + 'px)';
    out.drawImage(big, S, S, S, S, 0, 0, S, S);
    out.restore();
  }
  function camo(kind, seed, size) {
    const c = T.camoAlbedo(kind, seed, size);
    const P = PAL[kind];
    if (P && P.branches) branches(c, P.branches, seed + 77);
    if (P && P.blur && typeof document !== 'undefined') { try { soften(c, P.blur * 0.45); } catch (e) { /* без размытия */ } }
    return c;
  }

  /* ---------------------------------------------------------- ткань -- */
  const GLSL_FOLDS = `
    uniform vec4 uJ;          // x: |x| локтя, y: |x| запястья, z: y колена, w: y верха берца
    uniform vec2 uFold;       // x: сила складок, y: сила грязи

    uniform sampler2D uWeave; // рипстоп: высота нитей, тайл 24 мм
    uniform float uSeam;      // 0 — без швов, 1 — китель, 2 — брюки
    float weaveH(vec3 p, vec3 n) {
      vec3 w = pow(abs(n), vec3(8.0)); w /= max(w.x + w.y + w.z, 1e-4);
      vec3 q = p * (1.0 / 0.024);
      return texture2D(uWeave, q.zy).r * w.x + texture2D(uWeave, q.xz).r * w.y + texture2D(uWeave, q.xy).r * w.z;
    }
    /* расстояние до ближайшего шва по позе покоя, м; along — координата
       вдоль шва для пунктира строчки */
    float rectB(vec2 p, vec2 c, vec2 hs) { vec2 e = abs(p - c) - hs; return abs(length(max(e, 0.0)) + min(max(e.x, e.y), 0.0)); }
    float seamDist(vec3 p, out float along) {
      float d = 1.0; along = p.x + p.y + p.z;
      if (uSeam > 1.5) {
        if (p.y < 0.99) {
          vec2 q = vec2(abs(p.x) - 0.112, p.z - 0.012);
          float r = length(q), a = atan(q.y, q.x);
          d = min(d, abs(a) * r);
          d = min(d, (3.14159 - abs(a)) * r);
          along = p.y;
          /* накладной карман на бедре и клапан */
          float s = a * r;
          if (abs(a) < 1.3) {
            float pb = rectB(vec2(s, p.y), vec2(0.004, 0.71), vec2(0.056, 0.082));
            float fl = rectB(vec2(s, p.y), vec2(0.004, 0.778), vec2(0.06, 0.02));
            if (pb < d) { d = pb; along = s + p.y; }
            if (fl < d) { d = fl; along = s + p.y; }
          }
          /* вытачки над коленом (анатомический крой) */
          if (a < -0.6 && a > -2.5) d = min(d, abs(p.y - uJ.z - 0.075) + abs(a + 1.57) * 0.004);
        } else {
          d = min(d, abs(p.y - 1.055));
          along = p.x + p.z;
        }
      } else if (uSeam > 0.5) {
        float ax = abs(p.x);
        if (ax > 0.25 && p.y > 1.36) {
          vec2 q = vec2(p.y - 1.484, p.z + 0.015);
          float r = length(q), a = atan(q.y, q.x);
          d = min(d, (3.14159 - abs(a)) * r);
          along = ax;
          float sh = abs(ax - 0.262); if (sh < d) { d = sh; along = a * r; }
          float cf = abs(ax - (uJ.y - 0.075)); if (cf < d) { d = cf; along = a * r; }
          float el = rectB(vec2(ax, (a - 1.5708) * r), vec2(uJ.x + 0.01, 0.0), vec2(0.07, 0.048));
          if (el < d) { d = el; along = ax + a * r; }
          float pk = rectB(vec2(ax, a * r), vec2(0.335, 0.004), vec2(0.052, 0.048));
          if (pk < d) { d = pk; along = ax + a * r; }
        } else if (p.y > 1.0 && p.z < 0.0) {
          d = min(d, abs(abs(p.x) - 0.012));
          along = p.y;
        }
      }
      return d;
    }
    float hsh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float vnoise(vec3 x) {
      vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hsh(i), hsh(i + vec3(1,0,0)), f.x), mix(hsh(i + vec3(0,1,0)), hsh(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(hsh(i + vec3(0,0,1)), hsh(i + vec3(1,0,1)), f.x), mix(hsh(i + vec3(0,1,1)), hsh(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    /* рельеф складок, м: кольца на локте и манжете, над коленом и в
       напуске над берцами, горизонтальные — на поясе */
    float foldH(vec3 p) {
      float ax = abs(p.x), h = 0.0;
      float arm = smoothstep(0.26, 0.32, ax) * (1.0 - smoothstep(uJ.y - 0.01, uJ.y + 0.02, ax)) * step(1.30, p.y);
      /* фаза складки гуляет по окружности конечности и вдоль неё — иначе
         кольца читаются как ровные полосы */
      float wob = vnoise(p * 31.0) * 3.2 + vnoise(p * 8.0) * 2.4 + vnoise(p * 83.0) * 0.8;
      float amp = 0.55 + 0.9 * vnoise(p * 17.0 + 3.1);
      float e = ax - uJ.x;
      h += arm * exp(-e * e / 0.0030) * sin(e * 210.0 + wob) * 0.0011 * amp;
      float c = ax - (uJ.y - 0.055);
      h += arm * exp(-c * c / 0.0008) * sin(c * 300.0 + wob * 1.3) * 0.0008 * amp;
      float sh = ax - 0.30;
      h += arm * exp(-sh * sh / 0.0025) * sin((p.y * 0.8 + p.z * 1.2) * 170.0 + wob) * 0.0005 * amp;
      float leg = 1.0 - smoothstep(0.95, 1.05, p.y);
      float k = p.y - uJ.z - 0.03;
      h += leg * exp(-k * k / 0.0042) * sin(k * 160.0 + wob) * 0.0012 * amp;
      float b = p.y - uJ.w;
      h += leg * smoothstep(-0.01, 0.03, b) * (1.0 - smoothstep(0.10, 0.18, b)) * sin(b * 200.0 + wob * 1.4) * 0.0015 * amp;
      float wst = p.y - 1.02;
      h += smoothstep(0.12, 0.0, abs(wst)) * sin(wst * 240.0 + wob) * 0.0005 * amp;
      return h * uFold.x;
    }
    /* рельеф без развёртки (Mikkelsen): высота в метрах, позиция в метрах */
    vec3 bumpN(vec3 sp, vec3 n, float h, float fd) {
      vec3 sx = dFdx(sp), sy = dFdy(sp);
      vec3 r1 = cross(sy, n), r2 = cross(n, sx);
      float det = dot(sx, r1) * fd;
      vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
      return normalize(abs(det) * n - grad);
    }`;

  /* Материал формы: камуфляж трипланарно по позе покоя, фактура вещи из её
     текстуры (швы, карманы) умножается как яркость, складки и пыль —
     процедурно. opt: detail, normal, mean, detailK, tile, side, nScale,
     rough, joints (J модели), folds, dirt. */
  /* Рипстоп: полотняное переплетение 1 мм нитью + усиленная клетка 4,8 мм. */
  let weaveCanvas = null;
  function weaveTex(THREE) {
    if (!weaveCanvas && typeof document !== 'undefined') {
      const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d', { willReadFrequently: true }), img = g.createImageData(S, S), d = img.data;
      const hsh = (i) => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S * 24, v = y / S * 24, cu = Math.floor(u), cv = Math.floor(v);
        const fu = u - cu, fv = v - cv;
        const over = (cu + cv) % 2 === 0;
        let h = over ? 0.45 + 0.4 * Math.sin(fu * Math.PI) : 0.45 + 0.4 * Math.sin(fv * Math.PI);
        const gx = (x / S * 5) % 1, gy = (y / S * 5) % 1;
        const rib = Math.max(Math.exp(-Math.pow((gx - 0.5) / 0.035, 2)), Math.exp(-Math.pow((gy - 0.5) / 0.035, 2)));
        h = h * (1 - 0.35 * rib) + rib * 0.55 + (hsh(cu * 97 + cv * 13) - 0.5) * 0.12;
        const i = (y * S + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, h * 255)); d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      weaveCanvas = c;
    }
    if (!weaveCanvas) return null;
    const t = new THREE.CanvasTexture(weaveCanvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }

  function garmentMat(THREE, camoTex, opt) {
    const J = opt.joints || {};
    const ST = opt.stripes || null;
    /* v26: бельё — где вместо ткани кожа (cutOf), skin/sock — линейные цвета */
    const BR = opt.bare || null;
    /* v26: трикотаж / голый торс — сетка кителя без пуговиц, воротника и клапанов (атрибуты bodyAttrs) */
    const BD = !!opt.body;
    const jv = new THREE.Vector4(
      Math.abs(J.elbowR ? J.elbowR[0] : 0.49), Math.abs(J.wristR ? J.wristR[0] : 0.76),
      J.kneeR ? J.kneeR[1] : 0.53, (J.ankleR ? J.ankleR[1] : 0.085) + 0.17);
    const Phys = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;
    const mat = new Phys({
      map: opt.detail || null, normalMap: opt.normal || null,
      normalScale: new THREE.Vector2(opt.nScale || 1, opt.nScale || 1),
      roughness: opt.rough === undefined ? 0.95 : opt.rough, metalness: 0,
      side: opt.side || THREE.FrontSide
    });
    if (mat.isMeshPhysicalMaterial && opt.sheen !== 0) {
      mat.sheen = (opt.sheen === undefined ? 0.45 : opt.sheen) * 0.45;
      mat.sheenRoughness = 0.85;
      mat.sheenColor = new THREE.Color(0.32, 0.32, 0.3);
    }
    if (mat.isMeshPhysicalMaterial) mat.specularIntensity = 0.28;
    mat.envMapIntensity = 0.6;
    const weave = weaveTex(THREE);
    const mean = opt.mean || (opt.detail ? opt.detail.userData.mean : [1, 1, 1]);
    const lm = 0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2];
    const folds = opt.folds === undefined ? 1 : opt.folds, dirt = opt.dirt === undefined ? 1 : opt.dirt;
    /* v24: раскладка камуфляжа для дальнего заменителя (29c_lod.js) — цвет вершин по тому же правилу */
    mat.userData.lodCamo = { tex: camoTex, tile: 1 / (opt.tile || 0.42), k: opt.detailK === undefined ? 1 : opt.detailK, mean: Math.max(lm, 1e-3), pw: 12, off: [0.37, 0.61, 0.13, 0.29], dirt };
    if (BR) mat.userData.lodCamo.bare = BR;
    if (BD) mat.userData.needBody = true;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCamo = { value: camoTex };
      sh.uniforms.uTile = { value: 1 / (opt.tile || 0.42) };
      sh.uniforms.uDetail = { value: opt.detailK === undefined ? 1 : opt.detailK };
      sh.uniforms.uDetailMean = { value: Math.max(lm, 1e-3) };
      sh.uniforms.uJ = { value: jv };
      sh.uniforms.uFold = { value: new THREE.Vector2(folds, dirt) };
      sh.uniforms.uWeave = { value: weave };
      sh.uniforms.uSeam = { value: opt.seams || 0 };
      /* v26: тельняшка — полосы по позе покоя: корпус — по высоте, рукава — кольцами */
      if (ST) {
        sh.uniforms.uStrA = { value: new THREE.Vector3(ST.a[0], ST.a[1], ST.a[2]) };
        sh.uniforms.uStrB = { value: new THREE.Vector3(ST.b[0], ST.b[1], ST.b[2]) };
        sh.uniforms.uStrP = { value: new THREE.Vector3(ST.period, ST.duty, 0.262) };
      }
      if (BR) {
        const sk = BR.skin || [0.43, 0.24, 0.15], so = BR.sockCol || [0.035, 0.037, 0.028];
        sh.uniforms.uBareA = { value: new THREE.Vector4(BR.arm, BR.torso, BR.neck, BR.neckF) };
        sh.uniforms.uBareB = { value: new THREE.Vector4(BR.neckW, BR.hem, BR.leg, BR.sock) };
        sh.uniforms.uSkin = { value: new THREE.Vector3(sk[0], sk[1], sk[2]) };
        sh.uniforms.uSock = { value: new THREE.Vector4(so[0], so[1], so[2], BR.knit ? 1 : 0) };
      }
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vRestPos;
          varying vec3 vRestNrm;` + (BD ? `
          attribute vec3 aBody, aBodyN;
          attribute float aHide;
          varying float vHide;` : ''))
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>' + (BD ? `
          objectNormal = aBodyN;` : ''))
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vRestPos = position;
          vRestNrm = normal;` + (BD ? `
          /* v26: трикотаж — без пуговиц, воротника и клапанов (clothing.js: bodyAttrs) */
          transformed = aBody;
          vRestPos = aBody;
          vRestNrm = aBodyN;
          vHide = aHide;` : ''))
        .replace('#include <project_vertex>', '#include <project_vertex>' + (BD ? `
          if (aHide > 0.75) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);` : ''));
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uCamo;
          uniform float uTile, uDetail, uDetailMean;
          varying vec3 vRestPos;
          varying vec3 vRestNrm;` + (ST ? `
          #define GARM_STRIPES
          uniform vec3 uStrA, uStrB, uStrP;` : '') + (BR ? `
          #define GARM_BARE
          uniform vec4 uBareA, uBareB, uSock;
          uniform vec3 uSkin;` : '') + (BD ? `
          varying float vHide;` : '') + GLSL_FOLDS)
        .replace('#include <map_fragment>', (BD ? `
          if (vHide > 0.25) discard;` : '') + `
          float bareK = 0.0, sockK = 0.0, hemK = 0.0, bBn = 0.5;
          #ifdef GARM_BARE
          {
            /* кожа вместо ткани: конец рукава, горловина, низ брючины; подол — не рисуем */
            float bAx = abs(vRestPos.x);
            float bAw = max(fwidth(bAx), 1e-4), bYw = max(fwidth(vRestPos.y), 1e-4);
            if (vRestPos.y < uBareB.y) discard;
            /* вырез рукава — только выше подмышки: бока корпуса и бёдра (|x| тоже большой) остаются тканью */
            float bArmY = step(1.28, vRestPos.y);
            float bArm = clamp((bAx - uBareA.x) / bAw + 0.5, 0.0, 1.0) * bArmY;
            float bNY = uBareA.z - uBareA.w * (1.0 - smoothstep(-0.10, -0.03, vRestPos.z));
            float bNk = clamp((vRestPos.y - bNY) / bYw + 0.5, 0.0, 1.0) * (1.0 - clamp((bAx - uBareB.x) / bAw + 0.5, 0.0, 1.0));
            float bLg = clamp((uBareB.z - vRestPos.y) / bYw + 0.5, 0.0, 1.0);
            bareK = max(max(uBareA.y, bArm), max(bNk, bLg));
            sockK = clamp((uBareB.w - vRestPos.y) / bYw + 0.5, 0.0, 1.0);
            /* подгиб у края ткани: 1 см темнее, со строчкой */
            float hemD = min(bArmY > 0.5 ? uBareA.x - bAx : 1.0, vRestPos.y - uBareB.z);
            if (bAx < uBareB.x) hemD = min(hemD, bNY - vRestPos.y);
            hemK = (1.0 - smoothstep(0.008, 0.012, hemD)) * (1.0 - bareK);
            bBn = vnoise(vRestPos * 37.0) * 0.6 + vnoise(vRestPos * 113.0) * 0.4;
          }
          #endif
          vec3 tpN = abs(normalize(vRestNrm));
          tpN = pow(tpN, vec3(12.0));
          tpN /= max(tpN.x + tpN.y + tpN.z, 1e-4);
          vec3 tpP = vRestPos * uTile;
          vec4 camo = texture2D(uCamo, tpP.zy) * tpN.x + texture2D(uCamo, tpP.xz + vec2(0.37, 0.61)) * tpN.y + texture2D(uCamo, tpP.xy + vec2(0.13, 0.29)) * tpN.z;
          #ifdef GARM_STRIPES
          {
            float sAx = abs(vRestPos.x);
            float sC = (sAx > uStrP.z ? sAx : vRestPos.y) / uStrP.x;
            float sFw = max(fwidth(sC), 1e-4);
            float sF = abs(fract(sC) - 0.5);
            float sK = clamp((sF - 0.5 * (1.0 - uStrP.y)) / sFw + 0.5, 0.0, 1.0);
            /* полоса тоньше пикселя — средний цвет, без муара */
            sK = mix(sK, uStrP.y, smoothstep(0.25, 0.6, sFw));
            camo = vec4(mix(uStrA, uStrB, sK), 1.0);
          }
          #endif
          #ifdef USE_MAP
            vec3 det = texture2D(map, vMapUv).rgb;
            float dl = dot(det, vec3(0.2126, 0.7152, 0.0722)) / uDetailMean;
            camo.rgb *= mix(1.0, clamp(dl, 0.15, 1.8), uDetail);
          #endif
          /* нить и клетка рипстопа, швы со строчкой */
          float wv = weaveH(vRestPos, vRestNrm);
          camo.rgb *= 0.9 + 0.2 * wv;
          float seamAlong;
          float sd = uSeam > 0.5 ? seamDist(vRestPos, seamAlong) : 1.0;
          float stitch = step(0.45, fract(seamAlong * 330.0)) * (exp(-pow((sd - 0.0034) / 0.00055, 2.0)) + exp(-pow((sd - 0.0062) / 0.00055, 2.0)));
          camo.rgb *= 1.0 - 0.3 * exp(-sd * sd / 0.0000022) - 0.16 * stitch;
          /* пыль снизу брюк и на коленях, вытертость на локтях */
          float nz = vnoise(vRestPos * 23.0) * 0.6 + vnoise(vRestPos * 71.0) * 0.4;
          float low = 1.0 - smoothstep(0.08, 0.50, vRestPos.y);
          float knee = exp(-pow((vRestPos.y - uJ.z) / 0.07, 2.0)) * smoothstep(0.1, -0.4, vRestNrm.z) * step(vRestPos.y, 1.0);
          float elb = exp(-pow((abs(vRestPos.x) - uJ.x) / 0.05, 2.0)) * step(1.30, vRestPos.y);
          float dk = clamp((low * 0.75 + knee * 0.55 + elb * 0.35) * (0.45 + 0.8 * nz) * uFold.y, 0.0, 0.8);
          camo.rgb = mix(camo.rgb, camo.rgb * vec3(0.86, 0.80, 0.70) + vec3(0.035, 0.028, 0.018), dk);
          #ifdef GARM_BARE
          {
            /* трикотаж — без клетки рипстопа; кожа: тон лица, пятнистость, загар рук и шеи */
            if (uSock.w > 0.5) camo.rgb /= 0.9 + 0.2 * wv;
            float bTan = max(smoothstep(0.27, 0.42, abs(vRestPos.x)), smoothstep(1.50, 1.56, vRestPos.y));
            vec3 sk = uSkin * (0.93 + 0.14 * bBn) * mix(vec3(1.08, 1.07, 1.06), vec3(0.97, 0.95, 0.93), bTan);
            sk = mix(sk, sk * vec3(0.86, 0.80, 0.70) + vec3(0.03, 0.024, 0.016), dk * 0.6);
            vec3 so = uSock.rgb * (0.85 + 0.3 * wv);
            camo.rgb = mix(camo.rgb * (1.0 - 0.16 * hemK), mix(sk, so, sockK), bareK);
          }
          #endif
          diffuseColor *= camo;`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>' + (BD ? `
          /* изнанка в вырезе горловины — в тени передней части: подсветка, чтобы вырез читался кожей/тканью */
          if (!gl_FrontFacing) totalEmissiveRadiance += diffuseColor.rgb * 0.3;` : ''))
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor + (wv - 0.5) * 0.08 + dk * 0.04 - 0.05 * stitch, 0.6, 1.0);
          roughnessFactor = mix(roughnessFactor, mix(0.5 + 0.12 * bBn + dk * 0.2, 1.0, sockK), bareK);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          float hT = foldH(vRestPos) + wv * 0.00032 - 0.0007 * exp(-sd * sd / 0.0000028) + 0.00018 * stitch;
          #ifdef GARM_BARE
          if (uSock.w > 0.5) hT -= wv * 0.00024;
          /* на коже — без карты нормалей ткани (складки брюк) */
          normal = normalize(mix(normal, nonPerturbedNormal, bareK * (1.0 - sockK)));
          #endif
          hT = mix(hT, hT * sockK + bBn * 0.00022, bareK);
          hT += 0.0005 * hemK;
          normal = bumpN(-vViewPosition, normal, hT, faceDirection);
          #ifdef GARM_BODY
          /* изнанка в вырезе горловины (под воротником сетка кителя открыта) — как кожа/ткань к зрителю, чуть в тени */
          if (!gl_FrontFacing) normal = normalize(vec3(0.0, 0.3, 1.0));
          #endif`);
    };
    mat.customProgramCacheKey = () => 'garment3' + (opt.detail ? 1 : 0) + (opt.normal ? 1 : 0) + (mat.isMeshPhysicalMaterial ? 'p' : 's') + (ST ? 'st' : '') + (BR ? 'br' : '') + (BD ? 'bd' : '');
    return mat;
  }

  /* v26: трикотаж (тельняшка, футболка, майка) и голый торс на сетке кителя. Один раз на геометрию
     (она общая у всех бойцов), только когда такой верх кому-то выбран:
       aHide 1   — пуговицы (отдельные островки сетки): отсекаются в вершинном шейдере;
       aHide 0.5 — отложной воротник от края до сгиба: отбрасывается во фрагментном (стойка остаётся шеей);
       aBody/aBodyN — грудь и спина без клапанов карманов и планки: сглаживание Таубина (объём сохраняется). */
  function bodyAttrs(THREE, geo, skinGeo) {
    if (!geo || !geo.index || geo.attributes.aHide) return geo && geo.userData.bodyInfo;
    const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    const pos = geo.attributes.position, nrm = geo.attributes.normal, ix = geo.index.array, n = pos.count, PA = pos.array;
    /* сварка по положению: швы развёртки не рвут соседство */
    const key = new Map(), wid = new Int32Array(n), wp = [];
    for (let i = 0; i < n; i++) {
      const k = Math.round(PA[i * 3] * 1e4) + ',' + Math.round(PA[i * 3 + 1] * 1e4) + ',' + Math.round(PA[i * 3 + 2] * 1e4);
      let w = key.get(k);
      if (w === undefined) { w = wp.length / 3; key.set(k, w); wp.push(PA[i * 3], PA[i * 3 + 1], PA[i * 3 + 2]); }
      wid[i] = w;
    }
    const W = wp.length / 3, X = new Float64Array(wp), T = ix.length / 3;
    /* островки (пуговицы и нитки) — всё, что не самая большая связная часть */
    const par = new Int32Array(W); for (let i = 0; i < W; i++) par[i] = i;
    const root = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (let t = 0; t < T; t++) {
      const a = root(wid[ix[t * 3]]), b = root(wid[ix[t * 3 + 1]]), c = root(wid[ix[t * 3 + 2]]);
      par[b] = a; par[root(c)] = root(a);
    }
    const size = new Map();
    for (let i = 0; i < W; i++) { const r = root(i); size.set(r, (size.get(r) || 0) + 1); }
    let main = -1, best = 0;
    for (const [r, s] of size) if (s > best) { best = s; main = r; }
    const isMain = new Uint8Array(W); for (let i = 0; i < W; i++) isMain[i] = root(i) === main ? 1 : 0;
    /* рёбра: соседи (CSR) и края (ребро одного треугольника) */
    const E = new Map();
    const ek = (a, b) => (a < b ? a * W + b : b * W + a);
    for (let t = 0; t < T; t++) {
      const v0 = wid[ix[t * 3]], v1 = wid[ix[t * 3 + 1]], v2 = wid[ix[t * 3 + 2]];
      if (!isMain[v0]) continue;
      for (const [a, b] of [[v0, v1], [v1, v2], [v2, v0]]) { const k = ek(a, b); E.set(k, (E.get(k) || 0) + 1); }
    }
    const deg = new Int32Array(W + 1), bnd = new Uint8Array(W);
    for (const [k, c] of E) { const a = Math.floor(k / W), b = k - a * W; deg[a]++; deg[b]++; if (c === 1) bnd[a] = bnd[b] = 1; }
    const off = new Int32Array(W + 1); for (let i = 0; i < W; i++) off[i + 1] = off[i] + deg[i];
    const nb = new Int32Array(off[W]), fill = off.slice(0, W);
    for (const k of E.keys()) { const a = Math.floor(k / W), b = k - a * W; nb[fill[a]++] = b; nb[fill[b]++] = a; }
    /* край горловины — самый высокий контур; кольца от него (BFS): воротник — до сгиба (верхнего кольца) */
    const loopOf = new Int32Array(W).fill(-1), loops = [];
    for (let s = 0; s < W; s++) {
      if (!bnd[s] || loopOf[s] >= 0) continue;
      const L = [s]; loopOf[s] = loops.length;
      for (let q = 0; q < L.length; q++) { const a = L[q]; for (let j = off[a]; j < off[a + 1]; j++) { const b = nb[j]; if (bnd[b] && loopOf[b] < 0 && E.get(ek(a, b)) === 1) { loopOf[b] = loops.length; L.push(b); } } }
      loops.push(L);
    }
    let neck = null, ny = -9;
    for (const L of loops) { let y = 0; for (const a of L) y += X[a * 3 + 1]; y /= L.length; if (L.length > 12 && y > ny) { ny = y; neck = L; } }
    const ring = new Int32Array(W).fill(-1);
    let fold = 0;
    if (neck && ny > 1.3) {
      let cur = neck.slice(); for (const a of cur) ring[a] = 0;
      const meanY = [];
      for (let r = 0; r < 16 && cur.length; r++) {
        let y = 0; for (const a of cur) y += X[a * 3 + 1]; meanY.push(y / cur.length);
        const nxt = [];
        for (const a of cur) for (let j = off[a]; j < off[a + 1]; j++) { const b = nb[j]; if (ring[b] < 0) { ring[b] = r + 1; nxt.push(b); } }
        cur = nxt;
      }
      /* сгиб — кольцо с наибольшей средней высотой; если край и есть верх (воротника нет) — fold = 0 */
      for (let r = 1; r < meanY.length; r++) if (meanY[r] > meanY[fold] + 0.002) fold = r;
    }
    /* сглаживание груди и спины; плечи, рукава, стойка воротника и пояс (под брюками) не трогаем */
    const wgt = new Float32Array(W);
    for (let i = 0; i < W; i++) {
      if (!isMain[i] || bnd[i] || (ring[i] >= 0 && ring[i] <= fold)) continue;
      const ax = Math.abs(X[i * 3]), y = X[i * 3 + 1];
      wgt[i] = (1 - sstep(0.19, 0.25, ax)) * sstep(1.04, 1.10, y) * (1 - sstep(1.44, 1.50, y));
    }
    const S = Float64Array.from(X), D = new Float64Array(W * 3);
    /* стойка воротника выше нижнего края шеи (сетка головы) — внутрь шеи: нет щели между тканью и шеей */
    const mv = Float32Array.from(wgt), up = new Uint8Array(W);
    const sp = skinGeo && skinGeo.attributes && skinGeo.attributes.position;
    if (sp && fold > 0) {
      const NB = 24, ye = new Float64Array(NB).fill(9), re = new Float64Array(NB), rc = new Float64Array(NB);
      let z0 = 9, z1 = -9;
      for (let i = 0; i < sp.count; i++) if (sp.getY(i) < 1.60) { z0 = Math.min(z0, sp.getZ(i)); z1 = Math.max(z1, sp.getZ(i)); }
      const cz = (z0 + z1) / 2, bin = (x, z) => ((Math.floor((Math.atan2(z - cz, x) + Math.PI) / (2 * Math.PI) * NB) % NB) + NB) % NB;
      for (let i = 0; i < sp.count; i++) { const y = sp.getY(i); if (y < 1.62) { const b = bin(sp.getX(i), sp.getZ(i)); if (y < ye[b]) ye[b] = y; } }
      for (let i = 0; i < sp.count; i++) {
        const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i), b = bin(x, z);
        if (y < ye[b] + 0.004) { re[b] += Math.hypot(x, z - cz); rc[b]++; }
      }
      let ok = 0;
      for (let b = 0; b < NB; b++) if (rc[b]) { re[b] /= rc[b]; ok++; }
      for (let it = 0; it < NB && ok < NB; it++) for (let b = 0; b < NB; b++) if (!rc[b]) {
        const a = (b + NB - 1) % NB, c = (b + 1) % NB;
        if (rc[a] || rc[c]) { const m = (rc[a] ? 1 : 0) + (rc[c] ? 1 : 0); ye[b] = ((rc[a] ? ye[a] : 0) + (rc[c] ? ye[c] : 0)) / m; re[b] = ((rc[a] ? re[a] : 0) + (rc[c] ? re[c] : 0)) / m; rc[b] = -1; ok++; }
      }
      if (ok === NB) for (let i = 0; i < W; i++) {
        if (!isMain[i] || (ring[i] >= 0 && ring[i] < fold)) continue;
        const x = S[i * 3], y = S[i * 3 + 1], z = S[i * 3 + 2];
        if (y < 1.50) continue;
        const f = (Math.atan2(z - cz, x) + Math.PI) / (2 * Math.PI) * NB - 0.5, b0 = ((Math.floor(f) % NB) + NB) % NB, b1 = (b0 + 1) % NB, t = f - Math.floor(f);
        const yE = ye[b0] * (1 - t) + ye[b1] * t, rE = re[b0] * (1 - t) + re[b1] * t;
        const r = Math.hypot(x, z - cz), k = sstep(yE - 0.012, yE + 0.002, y);
        if (!k || r > rE + 0.05) continue;
        /* выше края шеи стойка не нужна (там шея) — отбрасываем, ниже — притягиваем к краю */
        if (y > yE + 0.002) up[i] = 1;
        if (r <= rE - 0.003) continue;
        const r2 = r - k * (r - (rE - 0.003));
        S[i * 3] = x * r2 / r; S[i * 3 + 2] = cz + (z - cz) * r2 / r;
        mv[i] = Math.max(mv[i], k);
      }
    }
    for (let it = 0; it < 24; it++) {
      const f = it & 1 ? -0.53 : 0.5;
      for (let i = 0; i < W; i++) {
        if (!wgt[i]) continue;
        let sx = 0, sy = 0, sz = 0; const c = off[i + 1] - off[i];
        for (let j = off[i]; j < off[i + 1]; j++) { const b = nb[j] * 3; sx += S[b]; sy += S[b + 1]; sz += S[b + 2]; }
        const k = f * wgt[i] / c;
        D[i * 3] = (sx - c * S[i * 3]) * k; D[i * 3 + 1] = (sy - c * S[i * 3 + 1]) * k; D[i * 3 + 2] = (sz - c * S[i * 3 + 2]) * k;
      }
      for (let i = 0; i < W; i++) if (wgt[i]) { S[i * 3] += D[i * 3]; S[i * 3 + 1] += D[i * 3 + 1]; S[i * 3 + 2] += D[i * 3 + 2]; }
    }
    /* нормали сглаженной поверхности по сваренным вершинам, плавный переход к исходным */
    const N = new Float64Array(W * 3);
    for (let t = 0; t < T; t++) {
      const a = wid[ix[t * 3]] * 3, b = wid[ix[t * 3 + 1]] * 3, c = wid[ix[t * 3 + 2]] * 3;
      const ux = S[b] - S[a], uy = S[b + 1] - S[a + 1], uz = S[b + 2] - S[a + 2];
      const vx = S[c] - S[a], vy = S[c + 1] - S[a + 1], vz = S[c + 2] - S[a + 2];
      const nx = uy * vz - uz * vy, ny2 = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const q of [a, b, c]) { N[q] += nx; N[q + 1] += ny2; N[q + 2] += nz; }
    }
    const body = new Float32Array(n * 3), bodyN = new Float32Array(n * 3), hide = new Float32Array(n);
    let nHide = 0, nCollar = 0;
    for (let i = 0; i < n; i++) {
      const w = wid[i], q = w * 3, k = mv[w];
      body[i * 3] = S[q]; body[i * 3 + 1] = S[q + 1]; body[i * 3 + 2] = S[q + 2];
      let ox = nrm.getX(i), oy = nrm.getY(i), oz = nrm.getZ(i);
      if (k > 0) {
        /* направление — по исходной нормали (обход треугольников в сетке может быть любым) */
        let l = Math.hypot(N[q], N[q + 1], N[q + 2]) || 1;
        if (N[q] * ox + N[q + 1] * oy + N[q + 2] * oz < 0) l = -l;
        const m = Math.min(1, k * 1.5);
        ox += (N[q] / l - ox) * m; oy += (N[q + 1] / l - oy) * m; oz += (N[q + 2] / l - oz) * m;
      }
      const l2 = Math.hypot(ox, oy, oz) || 1;
      bodyN[i * 3] = ox / l2; bodyN[i * 3 + 1] = oy / l2; bodyN[i * 3 + 2] = oz / l2;
      if (!isMain[w]) { hide[i] = 1; nHide++; } else if ((ring[w] >= 0 && ring[w] < fold) || up[w]) { hide[i] = 0.5; nCollar++; }
    }
    geo.setAttribute('aBody', new THREE.BufferAttribute(body, 3));
    geo.setAttribute('aBodyN', new THREE.BufferAttribute(bodyN, 3));
    geo.setAttribute('aHide', new THREE.BufferAttribute(hide, 1));
    geo.userData.bodyInfo = { islands: size.size - 1, hidden: nHide, collar: nCollar, fold, loops: loops.length,
      ms: Math.round((typeof performance !== 'undefined' ? performance : Date).now() - t0) };
    return geo.userData.bodyInfo;
  }

  return { PAL, LIST, fit, camo, garmentMat, stripesOf, cutOf, isUnder, bareAt, bodyAttrs };
});
