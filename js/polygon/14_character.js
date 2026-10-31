
/* ==========================================================================
   МОДУЛЬ: character.js
   ========================================================================== */
/* ============================================================================
   Сборка бойца в three.js: скелет -> SkinnedMesh -> материалы.

   Один боец — четыре формы (как на референсе):
     delta_1 — «Дельта», зелёный лесной камуфляж, шлем FAST;
     delta_2 — «Дельта», серо-зелёный, панама вместо шлема;
     alpha_1 — «Альфа», полностью чёрный;
     alpha_2 — «Альфа», чёрно-зелёный цифровой камуфляж.

   Тело, форма и снаряжение у всех — одна и та же геометрия (один рост,
   одно телосложение), она строится один раз на тип головного убора и
   переиспользуется. Бойцы отличаются только материалами: камуфляж, цвет
   снаряжения и перчаток, нашивка подразделения.
   ========================================================================== */
(function (root, factory) {
  const C = factory(root.GUtil, root.GBuf, root.GSkel, root.GSoldier, root.GTex,
    root.GBody, root.GCloth, root.GGear, root.GAK, root.GKit, root.GCover);
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  else root.GChar = C;
})(typeof self !== 'undefined' ? self : this, function (U, B, SK, S, T, BODYMOD, CLOTH, GEAR, AKA, KIT, COVER) {
  'use strict';

  /* ---------------------------------------------------------- пресеты --- */
  /* Общие для всех параметры тела: «один перс» в четырёх формах. */
  const BODY = { height: 1.80, build: 1.0, skinTone: [196, 152, 126], geoSeed: 1701 };
  const PRESETS = {
    delta_1: {
      name: 'ДЕЛЬТА-1', faction: 'delta', callsign: 'Кедр',
      camo: 'delta_green',
      head: 'helmet',
      mask: false,
      gearCol: [96, 90, 64], hardCol: [58, 56, 44], maskCol: [52, 56, 40],
      bootCol: [112, 92, 66], gloveCol: [60, 58, 53], gloveHardCol: [26, 26, 25], patchCol: [[56, 60, 42], [178, 170, 132]],
      seed: 1201
    },
    delta_2: {
      name: 'ДЕЛЬТА-2', faction: 'delta', callsign: 'Сойка',
      camo: 'delta_grey',
      head: 'boonie',
      mask: true, kneePads: true, padCol: [62, 62, 54],
      gearCol: [88, 90, 74], hardCol: [48, 50, 46], maskCol: [62, 66, 54],
      bootCol: [104, 90, 70], gloveCol: [66, 62, 55], gloveHardCol: [30, 29, 27], patchCol: [[70, 72, 60], [190, 186, 160]],
      seed: 2402
    },
    alpha_1: {
      name: 'АЛЬФА-1', faction: 'alpha', callsign: 'Ворон',
      camo: 'alpha_black',
      head: 'helmet',
      mask: true, kneePads: true, padCol: [30, 31, 33],
      gearCol: [42, 44, 48], hardCol: [36, 37, 40], maskCol: [30, 30, 33],
      bootCol: [44, 44, 47], gloveCol: [50, 50, 53], gloveHardCol: [20, 20, 21], patchCol: [[40, 41, 45], [196, 199, 204]],
      seed: 3603
    },
    alpha_2: {
      name: 'АЛЬФА-2', faction: 'alpha', callsign: 'Тис',
      camo: 'alpha_cadpat',
      head: 'helmet',
      mask: true, kneePads: true, padCol: [34, 36, 33],
      gearCol: [46, 54, 42], hardCol: [36, 38, 36], maskCol: [30, 31, 30],
      bootCol: [46, 46, 45], gloveCol: [54, 55, 52], gloveHardCol: [22, 22, 22], patchCol: [[42, 48, 40], [188, 194, 190]],
      seed: 4804
    }
  };
  for (const k in PRESETS) {
    PRESETS[k].height = BODY.height;
    PRESETS[k].build = BODY.build;
    PRESETS[k].skinTone = BODY.skinTone;
  }
  /* Рост: люди в группе разные. Коэффициент к базовой модели (1,835 м до
     макушки): 1,84 / 1,77 / 1,88 / 1,81 м. Скелет и метрики масштабируются,
     геометрия остаётся общей и приводится к росту матрицей привязки. */
  PRESETS.delta_1.stature = 1.0;
  PRESETS.delta_2.stature = 0.966;
  PRESETS.alpha_1.stature = 1.025;
  PRESETS.alpha_2.stature = 0.988;
  /* Лицо: загар и обветренность, щетина, грязь — у каждого своё. */
  PRESETS.delta_1.face = { tone: [0.90, 0.80, 0.71], stub: 0.85, dirt: 0.55, red: 0.7 };
  PRESETS.delta_2.face = { tone: [0.95, 0.86, 0.78], stub: 0.6, dirt: 0.4, red: 0.5 };
  PRESETS.alpha_1.face = { tone: [0.80, 0.68, 0.58], stub: 0.7, dirt: 0.35, red: 0.35 };
  PRESETS.alpha_2.face = { tone: [0.93, 0.83, 0.75], stub: 0.5, dirt: 0.45, red: 0.55 };
  const ORDER = ['delta_1', 'delta_2', 'alpha_1', 'alpha_2'];
  /* v26: исходные пресеты — для «Сбросить» в редакторе внешнего вида */
  const BASE = JSON.parse(JSON.stringify(PRESETS));

  /* ------------------------------------------- v26: внешний вид --- */
  /* Образ (look) из редактора (js/app/looks.js) поверх исходного пресета:
     расцветки верха/низа/чехла, головной убор, балаклава, тип брони, цвета
     снаряжения, обувь, перчатки, наколенники, маскировка. Неизвестные
     значения игнорируются — сломанное сохранение не ломает бойца. */
  const HEADS = ['helmet', 'boonie', 'none'], ARMORS = ['plate', 'slick', 'soft', 'none'];
  const isCol = (c) => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isFinite(v) && v >= 0 && v <= 255);
  const camoOk = (id) => typeof id === 'string' && !!(CLOTH && CLOTH.PAL && CLOTH.PAL[id]);
  /* перчатки GLB-рук нарисованы в шейдере (койот ≈ sRGB 108,94,77): цвет — множителем */
  const GLOVE_BASE = [108, 94, 77];
  function withLook(key, look) {
    const B0 = BASE[key];
    if (!B0) return null;
    const P = JSON.parse(JSON.stringify(B0));
    const L = look && typeof look === 'object' ? look : null;
    if (!L) return P;
    if (camoOk(L.top)) P.camoTop = L.top;
    if (camoOk(L.bottom)) P.camoBottom = L.bottom;
    if (camoOk(L.headCover)) P.camoHead = L.headCover;
    if (HEADS.includes(L.head)) P.head = L.head;
    if (typeof L.mask === 'boolean') P.mask = L.mask;
    if (ARMORS.includes(L.armor)) P.armor = L.armor;
    if (typeof L.kneePads === 'boolean') P.kneePads = L.kneePads;
    for (const k of ['maskCol', 'gearCol', 'hardCol', 'bootCol', 'padCol']) if (isCol(L[k])) P[k] = L[k].map(Math.round);
    if (isCol(L.gloveCol)) {
      P.gloveCol = L.gloveCol.map(Math.round);
      const lin = (v) => Math.pow(Math.max(v, 1) / 255, 2.2);
      P.gloveTint = P.gloveCol.map((v, i) => Math.min(4, Math.max(0.04, lin(v) / lin(GLOVE_BASE[i]))));
    }
    if (!P.padCol) P.padCol = P.hardCol;
    if (COVER && COVER.KINDS[L.cover]) P.cover = L.cover;
    if (COVER && COVER.SCHEMES[L.coverCol]) P.coverCol = L.coverCol;
    if (Number.isInteger(L.coverDensity) && L.coverDensity >= 1 && L.coverDensity <= 5) P.coverDensity = L.coverDensity;
    P.look = JSON.parse(JSON.stringify(L));
    return P;
  }
  /* применить образы ко всем пресетам (до сборки бойцов) */
  function applyLooks(looks) {
    for (const k of ORDER) {
      const P = withLook(k, looks && looks[k]);
      if (P) PRESETS[k] = P;
    }
    return PRESETS;
  }
  /* камуфляжные холсты 1024² держим не больше десятка (редактор листает расцветки) */
  const camoLRU = new Map();
  function camoCanvas(kind, seed) {
    const k = kind + '_' + seed;
    let c = camoLRU.get(k);
    if (c) { camoLRU.delete(k); camoLRU.set(k, c); return c; }
    c = (CLOTH ? CLOTH.camo : T.camoAlbedo)(kind, seed, 1024);
    camoLRU.set(k, c);
    while (camoLRU.size > 10) camoLRU.delete(camoLRU.keys().next().value);
    return c;
  }

  /* ------------------------------------------- внешняя модель бойца --- */
  /* Реалистичный боец собирается в Blender из ассетов MakeHuman (тело,
     кожа по фотографиям, глаза, брови) и одежды с картами складок —
     скрипт game/tools/soldier/build.py. Результат лежит в assets/soldier:
     soldier.json (суставы, описание мешей и текстур) + soldier.bin (буферы).
     Меш привязан к тому же скелету, что и процедурный боец, поэтому риг,
     IK рук и хват оружия работают без изменений. Если пакет не загрузился,
     остаётся процедурная модель. */
  const PACK_DIR = 'assets/soldier/';
  const GA = typeof self !== 'undefined' ? self.GAssets : null;
  if (GA) GA.add('soldier', (async () => {
    const [hdr, bin] = await Promise.all([GA.fetchAny(PACK_DIR + 'soldier.json', 'json'), GA.fetchAny(PACK_DIR + 'soldier.bin')]);
    const files = new Set();
    for (const m of hdr.meshes) for (const k in (m.tex || {})) if (typeof m.tex[k] === 'string') files.add(m.tex[k]);
    const img = {};
    await Promise.all([...files].map(async (f) => { img[f] = await GA.image(PACK_DIR + 'tex/' + f); }));
    return { hdr, bin, img };
  })());
  const packData = () => (GA && GA.data.soldier) || null;

  /* --------------------------------------------------------- материалы -- */
  /* Кэш текстур: четыре бойца используют разные камуфляжи, но общие карты
     нормалей и шероховатости — генерировать их заново не нужно. */
  const texCache = new Map();
  function cached(key, make) {
    if (!texCache.has(key)) texCache.set(key, make());
    return texCache.get(key);
  }

  function mkTex(THREE, canvas, repeat, srgb) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (repeat) t.repeat.set(repeat, repeat);
    if (srgb && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }

  /* Цвет из «человеческих» 0..255 sRGB.
     THREE.Color принимает линейные значения, поэтому прямое деление на 255
     осветляло материал вдвое: чёрные берцы получались светло-серыми. */
  function srgb(THREE, rgb) {
    const c = new THREE.Color();
    if (c.setRGB.length >= 4) c.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
    else c.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255).convertSRGBToLinear();
    return c;
  }

  /* Трипланар: смешиваем три проекции по квадрату нормали. Работает и для
     SkinnedMesh — координаты берутся ДО скиннинга, из атрибута position. */
  function triplanar(THREE, mat, tile) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTile = { value: 1 / tile };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vRestPos;
          varying vec3 vRestNrm;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vRestPos = position;
          vRestNrm = normal;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uTile;
          varying vec3 vRestPos;
          varying vec3 vRestNrm;`)
        .replace('#include <map_fragment>', `
          vec3 tpN = abs(normalize(vRestNrm));
          tpN = pow(tpN, vec3(4.0));
          tpN /= max(tpN.x + tpN.y + tpN.z, 1e-4);
          vec3 tpP = vRestPos * uTile;
          vec4 tpX = texture2D(map, tpP.zy);
          vec4 tpY = texture2D(map, tpP.xz);
          vec4 tpZ = texture2D(map, tpP.xy);
          vec4 sampledDiffuseColor = tpX * tpN.x + tpY * tpN.y + tpZ * tpN.z;
          diffuseColor *= sampledDiffuseColor;`);
    };
    mat.customProgramCacheKey = () => 'triplanar' + tile;
  }

  /* ------------------------------------------------------- лицо ------- */
  /* Текстура головы в развёртке (θ, φ) — ровно так же, как строится сетка
     головы в soldier.js. Каждый пиксель переводится в точку на голове, и
     все черты задаются в метрах лица: брови, щетина, губы, ноздри,
     румянец, тени у век, короткая стрижка. Поэтому рисунок всегда совпадает
     с рельефом, а не «плывёт» относительно носа и глаз. */
  function faceAlbedo(seed, tone, W, H) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    const img = g.createImageData(W, H), d = img.data;
    const f1 = U.fbm(seed + 3, 4, 0.55, 2.2), f2 = U.fbm(seed + 11, 3, 0.5, 2.1), f3 = U.fbm(seed + 29, 2, 0.5, 2.0);
    const ss = U.smoothstep, lerp = U.lerp, cl = U.clamp01;
    const gs = (v) => Math.exp(-v * v);
    const hc = S.HEAD_C, EY = S.EYE_Y, EX = S.EYE_X;
    const hairline = (a) => {
      /* высота линии роста волос по азимуту |θ| (0 — лоб, π — затылок) */
      const T = [[0, 1.742], [0.55, 1.737], [0.85, 1.726], [1.05, 1.702], [1.2, 1.664], [1.34, 1.664],
        [1.45, 1.700], [1.75, 1.700], [1.95, 1.672], [2.35, 1.615], [Math.PI, 1.598]];
      for (let i = 0; i < T.length - 1; i++) if (a <= T[i + 1][0]) return lerp(T[i][1], T[i + 1][1], (a - T[i][0]) / (T[i + 1][0] - T[i][0]));
      return T[T.length - 1][1];
    };
    const base = tone;
    for (let j = 0; j < H; j++) {
      const ph = (j + 0.5) / H * Math.PI;
      for (let i = 0; i < W; i++) {
        const th = ((i + 0.5) / W - 0.5) * Math.PI * 2;
        const l = S.headLocal(th, ph, S.FACE);
        const x = l[0], ax = Math.abs(x), Y = hc[1] + l[1], sy = l[1] / 0.114;
        const fr = ss((-l[2] / 0.099 - 0.2) / 0.5);          // 1 на лице
        const at = Math.abs(th);
        /* шум по 3D-точке: нет шва на затылке */
        const nx = x * 60 + l[2] * 41, ny = Y * 60;
        const mott = f1(nx * 0.35, ny * 0.35) - 0.5;
        const pore = f2(x * 900 + l[2] * 610, Y * 900) - 0.5;
        const fine = f3(x * 800 + l[2] * 560, Y * 800) - 0.5;
        let r = base[0], gg = base[1], b = base[2];
        /* подкожная неравномерность и поры */
        r *= 1 + mott * 0.12 + pore * 0.05; gg *= 1 + mott * 0.08 + pore * 0.05; b *= 1 + mott * 0.06 + pore * 0.05;
        /* румянец: скулы, нос, уши, подбородок */
        const flush = fr * (0.55 * gs((ax - 0.045) / 0.02) * gs((sy + 0.3) / 0.14)
          + 0.6 * gs(x / 0.012) * gs((sy + 0.36) / 0.08) + 0.35 * gs((sy + 0.8) / 0.1) * gs(x / 0.03))
          + 0.5 * gs((at - Math.PI / 2) / 0.22) * gs((Y - 1.675) / 0.03);
        r += flush * 16; gg -= flush * 9; b -= flush * 7;
        /* губы */
        const lipU = gs((sy + 0.598) / 0.026) * gs(Math.pow(x / 0.0205, 2));
        const lipL = gs((sy + 0.648) / 0.03) * gs(Math.pow(x / 0.019, 2));
        const lip = fr * cl(lipU + lipL);
        r = lerp(r, 156, lip * 0.55); gg = lerp(gg, 96, lip * 0.6); b = lerp(b, 88, lip * 0.6);
        const mouth = fr * gs((sy + 0.62) / 0.0085) * gs(Math.pow(x / 0.023, 2));
        r = lerp(r, 82, mouth * 0.8); gg = lerp(gg, 48, mouth * 0.8); b = lerp(b, 44, mouth * 0.8);
        /* ноздри и тень под кончиком носа */
        const nost = fr * gs((sy + 0.438) / 0.012) * gs((ax - 0.0085) / 0.0048);
        const subn = fr * gs((sy + 0.455) / 0.022) * gs(x / 0.016) * 0.35;
        const ao = cl(nost * 0.9 + subn);
        r *= 1 - ao * 0.55; gg *= 1 - ao * 0.6; b *= 1 - ao * 0.6;
        /* веки: тень у внутреннего угла, линия ресниц, синева под глазом */
        const ey = Y - (EY - 0.0006), ex = ax - EX;
        const lash = fr * gs((ey - 0.0046 + 0.0026 * Math.pow(ex / 0.014, 2)) / 0.0010) * gs(Math.pow(ex / 0.0145, 4));
        const lid = fr * gs((ey - 0.0078) / 0.004) * gs(ex / 0.016) * 0.35
          + fr * gs((ey + 0.0085) / 0.0045) * gs(ex / 0.015) * 0.3
          + fr * gs((ax - 0.016) / 0.006) * gs((ey - 0.001) / 0.008) * 0.35;
        r = lerp(r, 58, cl(lash) * 0.85); gg = lerp(gg, 40, cl(lash) * 0.85); b = lerp(b, 36, cl(lash) * 0.85);
        r *= 1 - lid * 0.22; gg *= 1 - lid * 0.26; b *= 1 - lid * 0.2;
        /* щетина: челюсть, подбородок, усы, шея — сизая тень с «точками» */
        const beardTop = lerp(1.664, 1.628, cl((0.068 - ax) / 0.038)) + (mott * 0.006);
        let beard = cl((1 - ss((Y - beardTop) / 0.007)) * (1 - ss((at - 1.22) / 0.07)));
        beard *= 1 - ss((ph / Math.PI - 0.9) / 0.04);
        const must = fr * band2(sy, -0.575, -0.465, 0.02) * (1 - ss((ax - 0.026) / 0.006));
        beard = Math.max(beard * (1 - ss((sy + 0.47) / 0.03) * (1 - ss((ax - 0.03) / 0.01))), must);
        beard *= 1 - cl(lip * 1.4);
        const dots = ss((fine + 0.1) / 0.18);
        const bk = beard * (0.10 + 0.20 * dots) * (0.9 + mott);
        r = lerp(r, 92, bk); gg = lerp(gg, 88, bk); b = lerp(b, 90, bk);
        /* брови: пучки волос вдоль дуги, гуще у переносицы */
        const t = (ax - 0.012) / 0.037;
        if (fr > 0.2 && t > -0.2 && t < 1.2) {
          const yc = EY + 0.0150 + 0.0030 * Math.sin(Math.PI * cl(t) * 0.85) - 0.0012 * t * t;
          const hw = lerp(0.0040, 0.0016, cl(t));
          const e = Math.abs(Y - yc) / hw;
          const strand = f3(ax * 1600 - (Y - yc) * 700, (Y - yc) * 260) ;
          const brow = (1 - ss((e - 0.6) / 0.6)) * ss((t + 0.12) / 0.14) * (1 - ss((t - 1.0) / 0.12)) * (0.55 + 0.6 * strand) * fr;
          const k = cl(brow) * 0.8;
          r = lerp(r, 52, k); gg = lerp(gg, 40, k); b = lerp(b, 33, k);
        }
        /* короткая стрижка: тёмная «щетина» волос по линии роста */
        const hl = hairline(at);
        const hair = ss((Y - hl) / 0.005);
        if (hair > 0) {
          const hk = hair * (0.62 + 0.3 * ss((fine + 0.05) / 0.2)) * (0.9 + mott * 0.5);
          r = lerp(r, 40, hk); gg = lerp(gg, 33, hk); b = lerp(b, 29, hk);
        }
        const o = (j * W + i) * 4;
        d[o] = Math.max(0, Math.min(255, r)); d[o + 1] = Math.max(0, Math.min(255, gg));
        d[o + 2] = Math.max(0, Math.min(255, b)); d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  function band2(v, a, b, soft) { return U.smoothstep((v - a) / soft) * (1 - U.smoothstep((v - b) / soft)); }

  /* Склера: v = 0 — верх яблока (под веком, в тени), по бокам розоватые
     уголки, в середине — чуть серая, не «бумажно-белая». */
  function scleraCanvas() {
    const W = 64, H = 64, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }), img = g.createImageData(W, H), d = img.data;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = i / W, v = j / H;
      const side = Math.pow(Math.abs(Math.sin(u * Math.PI * 2)), 3);
      const lidSh = U.smoothstep((0.47 - v) / 0.08);
      let r = 214, gg = 204, b = 194;
      r = U.lerp(r, 196, side * 0.6); gg = U.lerp(gg, 150, side * 0.6); b = U.lerp(b, 142, side * 0.6);
      const k = 1 - lidSh * 0.55;
      const o = (j * W + i) * 4;
      d[o] = r * k; d[o + 1] = gg * k; d[o + 2] = b * k; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  /* Радужка: v — радиус (0 — центр). Зрачок, волокна, тёмный лимб. */
  function irisCanvas(seed, col) {
    const W = 128, H = 32, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }), img = g.createImageData(W, H), d = img.data;
    const f = U.fbm(seed, 3, 0.5, 2.0);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = i / W, v = (j + 0.5) / H;
      const fib = f(u * 40, v * 3) - 0.5;
      let r = col[0] * (1 + fib * 0.7), gg = col[1] * (1 + fib * 0.7), b = col[2] * (1 + fib * 0.6);
      const collar = Math.exp(-Math.pow((v - 0.45) / 0.08, 2));
      r += collar * 30; gg += collar * 22; b += collar * 10;
      const pupil = 1 - U.smoothstep((v - 0.30) / 0.05);
      const limb = U.smoothstep((v - 0.82) / 0.1);
      const k = Math.max(pupil, limb * 0.75);
      const o = (j * W + i) * 4;
      d[o] = U.lerp(r, 8, k); d[o + 1] = U.lerp(gg, 7, k); d[o + 2] = U.lerp(b, 7, k); d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function buildMaterials(THREE, cfg) {
    const seed = cfg.seed;
    const camoCv = cached('camo_' + cfg.camo + '_' + seed, () => T.camoAlbedo(cfg.camo, seed, 512));
    const fabN = cached('fabN', () => T.fabricNormal(77, 256, 52, 1));
    const fabR = cached('fabR', () => T.roughnessMap(91, 256, 0.70, 0.99));
    const nylN = cached('nylN', () => T.fabricNormal(31, 256, 96, 0.45));

    const uniform = new THREE.MeshStandardMaterial({
      map: mkTex(THREE, camoCv, 1, true),
      normalMap: mkTex(THREE, fabN, 3),
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: mkTex(THREE, fabR, 2),
      roughness: 1, metalness: 0.0
    });
    /* Трипланарная проекция камуфляжа.

       Тело — одна поверхность, снятая с поля; UV-развёртки, которая
       одинаково хорошо ложилась бы и на грудь, и на подмышку, у неё нет:
       любая цилиндрическая размотка растягивает пятна на плечах и на
       внутренней стороне рук. Поэтому текстура проецируется тремя
       плоскостями по координатам ПОЗЫ ПОКОЯ (position, а не мировые):
       рисунок остаётся приклеенным к ткани при любой анимации, а масштаб
       пятна везде одинаковый. */
    triplanar(THREE, uniform, cfg.camoTile || 0.42);

    const skinCv = cached('face_' + BODY.geoSeed, () => faceAlbedo(BODY.geoSeed, cfg.skinTone, 1024, 512));
    const faceTex = mkTex(THREE, skinCv, 1, true);
    faceTex.wrapT = THREE.ClampToEdgeWrapping;
    /* строка 0 канвы — макушка (φ = 0), как и v = 0 сетки */
    faceTex.flipY = false;
    const skin = new THREE.MeshStandardMaterial({
      map: faceTex,
      normalMap: mkTex(THREE, cached('poreN', () => T.fabricNormal(404, 256, 140, 0.25)), 9),
      normalScale: new THREE.Vector2(0.18, 0.18),
      roughness: 0.58, metalness: 0.0
    });
    /* лёгкое подповерхностное рассеивание: кожа не должна быть «пластиком» */
    skin.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
         float sss = pow(clamp(1.0 - dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
         reflectedLight.indirectDiffuse += sss * vec3(0.10, 0.028, 0.018) * diffuseColor.rgb;`
      );
    };

    const gCol = cfg.gloveCol || cfg.hardCol.map((c) => c * 0.8);
    const gloveCv = cached('glove_' + gCol.join('_'), () => T.nylonAlbedo(gCol, seed + 9, 256));
    const glove = new THREE.MeshStandardMaterial({
      map: mkTex(THREE, gloveCv, 2, true),
      normalMap: mkTex(THREE, nylN, 4),
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.82, metalness: 0.0
    });

    const gearCv = cached('gear_' + cfg.camo + '_' + cfg.gearCol.join('_'), () =>
      T.nylonAlbedo(cfg.gearCol, seed + 13, 256));
    const gear = new THREE.MeshStandardMaterial({
      map: mkTex(THREE, gearCv, 2, true),
      normalMap: mkTex(THREE, nylN, 5),
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.88, metalness: 0.0
    });

    const helmCv = cached('helm_' + cfg.camo + '_' + seed, () => T.helmetAlbedo(cfg.camo, seed, 256));
    const helmet = new THREE.MeshStandardMaterial({
      map: mkTex(THREE, helmCv, 1, true),
      normalMap: mkTex(THREE, fabN, 2),
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.72, metalness: 0.06
    });

    const boot = new THREE.MeshStandardMaterial({
      color: srgb(THREE, cfg.bootCol),
      normalMap: mkTex(THREE, nylN, 3),
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.74, metalness: 0.0
    });

    const hard = new THREE.MeshStandardMaterial({
      color: srgb(THREE, cfg.hardCol),
      roughness: 0.52, metalness: 0.12
    });

    const scTex = mkTex(THREE, cached('sclera', scleraCanvas), 1, true);
    scTex.flipY = false;
    const eye = new THREE.MeshStandardMaterial({ map: scTex, roughness: 0.12, metalness: 0 });
    /* группа hair — теперь радужка: волосы и брови нарисованы в текстуре лица */
    const irTex = mkTex(THREE, cached('iris_' + seed, () => irisCanvas(seed, [92, 104, 96])), 1, true);
    irTex.flipY = false;
    const hair = new THREE.MeshStandardMaterial({ map: irTex, roughness: 0.08, metalness: 0 });

    /* Балаклава — трикотаж своего цвета. Двусторонняя: край прорези для
       глаз иначе просвечивал бы изнанкой. */
    const maskCv = cached('mask_' + cfg.maskCol.join('_'), () => T.nylonAlbedo(cfg.maskCol, seed + 21, 256));
    const mask = new THREE.MeshStandardMaterial({
      map: mkTex(THREE, maskCv, 3, true),
      normalMap: mkTex(THREE, fabN, 6),
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide
    });

    /* Резина и шнуры: подошва, кант шлема, шнурки, резинки подсумков. */
    const rubber = new THREE.MeshStandardMaterial({
      color: srgb(THREE, [22, 22, 21]),
      normalMap: mkTex(THREE, nylN, 6),
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.9, metalness: 0.0
    });

    const patchCv = cached('patch_' + cfg.faction + '_' + cfg.patchCol.join('_'),
      () => patchCanvas(cfg.faction, cfg.patchCol[0], cfg.patchCol[1]));
    const patchTex = mkTex(THREE, patchCv, 0, true);
    patchTex.wrapS = patchTex.wrapT = THREE.ClampToEdgeWrapping;
    const patch = new THREE.MeshStandardMaterial({ map: patchTex, roughness: 0.9, metalness: 0.0 });

    /* Панама шьётся из той же ткани, что и форма. */
    return {
      uniform, hat: uniform, skin, glove, gear, mask, helmet, boot, rubber, hard, eye, hair, patch,
      headGear: gear, headHard: hard, headRubber: rubber
    };
  }

  /* Нашивка подразделения: эмблема на тканой основе с обмёткой по краю.
     «Дельта» — пирамида из трёх граней, «Альфа» — шеврон «А». */
  function patchCanvas(faction, base, ink) {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true });
    const col = (a, k) => 'rgba(' + a[0] + ',' + a[1] + ',' + a[2] + ',' + (k === undefined ? 1 : k) + ')';
    g.fillStyle = col(base);
    g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 2) {
      g.fillStyle = y % 4 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      g.fillRect(0, y, S, 1);
    }
    g.strokeStyle = col(ink, 0.55);
    g.lineWidth = 4;
    g.setLineDash([5, 3]);
    g.strokeRect(7, 7, S - 14, S - 14);
    g.setLineDash([]);
    g.fillStyle = col(ink);
    if (faction === 'delta') {
      const cx = 64, top = 24, bot = 100, hw = 44, mid = 80;
      g.beginPath(); g.moveTo(cx, top); g.lineTo(cx + hw, bot); g.lineTo(cx - hw, bot); g.closePath(); g.fill();
      /* грани пирамиды: правая светлее, левая темнее */
      g.fillStyle = col(base, 0.45);
      g.beginPath(); g.moveTo(cx, top); g.lineTo(cx, mid); g.lineTo(cx - hw, bot); g.closePath(); g.fill();
      g.strokeStyle = col(base);
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(cx, top + 4); g.lineTo(cx, mid); g.lineTo(cx + hw - 4, bot - 2);
      g.moveTo(cx, mid); g.lineTo(cx - hw + 4, bot - 2); g.stroke();
    } else {
      g.beginPath();
      g.moveTo(64, 20); g.lineTo(110, 104); g.lineTo(86, 104); g.lineTo(64, 62);
      g.lineTo(42, 104); g.lineTo(18, 104); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(64, 74); g.lineTo(76, 96); g.lineTo(52, 96); g.closePath(); g.fill();
    }
    return c;
  }

  /* ------------------------------------------------------------ сборка -- */

  /* ------------------------------------------------ глаза и веки --- */
  /* Центры глазных яблок — по сфере, вписанной в меш глаза методом
     наименьших квадратов (у MakeHuman глаз — сфера ~15,7 мм). Глаз
     поворачивается вокруг этого центра, веко — тоже: верхнее веко
     скользит по яблоку, а не проходит сквозь него. */
  let eyeFit = null;
  function eyeRig(pack) {
    if (eyeFit !== null) return eyeFit;
    eyeFit = false;
    const m = pack.hdr.meshes.find((x) => (x.group || x.name) === 'eye');
    if (!m) return eyeFit;
    const pos = new Float32Array(pack.bin, m.pos[0], m.pos[1]);
    const fit = (sgn) => {
      const A = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
      let n = 0;
      for (let v = 0; v < m.count; v++) {
        const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        if (x * sgn <= 0) continue;
        const r = [2 * x, 2 * y, 2 * z, 1], b = x * x + y * y + z * z;
        for (let i = 0; i < 4; i++) { for (let j = 0; j < 4; j++) A[i][j] += r[i] * r[j]; A[i][4] += r[i] * b; }
        n++;
      }
      if (n < 20) return null;
      for (let i = 0; i < 4; i++) {
        let mx = i;
        for (let k = i + 1; k < 4; k++) if (Math.abs(A[k][i]) > Math.abs(A[mx][i])) mx = k;
        const t = A[i]; A[i] = A[mx]; A[mx] = t;
        for (let k = 0; k < 4; k++) {
          if (k === i) continue;
          const f = A[k][i] / A[i][i];
          for (let j = i; j < 5; j++) A[k][j] -= f * A[i][j];
        }
      }
      const c = [A[0][4] / A[0][0], A[1][4] / A[1][1], A[2][4] / A[2][2]];
      return { c, r: Math.sqrt(A[3][4] / A[3][3] + c[0] * c[0] + c[1] * c[1] + c[2] * c[2]) };
    };
    const R = fit(1), L = fit(-1);
    if (R && L) eyeFit = { R, L };
    return eyeFit;
  }

  /* Глаз и роговица — целиком на кость глаза. Верхнее веко (кожа и
     верхние ресницы) — на кость века с плавным спадом к бровям и уголкам.
     Ресницы укорочены на треть: у модели они «накрашенные». Геометрия
     общая для всех бойцов, поэтому правка делается один раз. */
  function rigFace(geos, E, BI) {
    const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const side = (x) => (x >= 0 ? 'R' : 'L');
    for (const g of ['eye', 'cornea']) {
      const geo = geos[g];
      if (!geo || geo.userData.eyeRig) continue;
      geo.userData.eyeRig = true;
      const P = geo.attributes.position.array, si = geo.attributes.skinIndex.array, sw = geo.attributes.skinWeight.array;
      for (let v = 0; v < P.length / 3; v++) {
        si[v * 4] = BI['eye' + side(P[v * 3])]; si[v * 4 + 1] = si[v * 4 + 2] = si[v * 4 + 3] = 0;
        sw[v * 4] = 1; sw[v * 4 + 1] = sw[v * 4 + 2] = sw[v * 4 + 3] = 0;
      }
      geo.attributes.skinIndex.needsUpdate = geo.attributes.skinWeight.needsUpdate = true;
    }
    const lidW = (d, l, r, lash) => {
      const dx = Math.abs(d[0]) * 1000, dy = d[1] * 1000, dz = d[2] * 1000, rr = r * 1000, ll = l * 1000;
      let w = ss(-2.2, 0.3, dy) * (1 - ss(7, 12.5, dx));
      if (!lash) w *= (1 - ss(6, 13, dy)) * (1 - ss(rr + 3.5, rr + 8, ll)) * ss(-1.5, -6, dz);
      return w;
    };
    for (const g of ['skin', 'lash']) {
      const geo = geos[g];
      if (!geo || geo.userData.lidRig) continue;
      geo.userData.lidRig = true;
      const lash = g === 'lash';
      const P = geo.attributes.position.array, si = geo.attributes.skinIndex.array, sw = geo.attributes.skinWeight.array;
      for (let v = 0; v < P.length / 3; v++) {
        const S = side(P[v * 3]), e = E[S];
        const d = [P[v * 3] - e.c[0], P[v * 3 + 1] - e.c[1], P[v * 3 + 2] - e.c[2]];
        const l = Math.hypot(d[0], d[1], d[2]);
        if (l > 0.03) continue;
        if (lash && l > 0.0158) {
          const k = (0.0158 + (l - 0.0158) * 0.64) / l;
          P[v * 3] = e.c[0] + d[0] * k; P[v * 3 + 1] = e.c[1] + d[1] * k; P[v * 3 + 2] = e.c[2] + d[2] * k;
        }
        const w = lidW(d, l, e.r, lash);
        if (w < 0.01) continue;
        let slot = -1, mn = 2;
        for (let k = 0; k < 4; k++) {
          if (sw[v * 4 + k] === 0) { slot = k; break; }
          if (sw[v * 4 + k] < mn) { mn = sw[v * 4 + k]; slot = k; }
        }
        sw[v * 4 + slot] = 0;
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += sw[v * 4 + k];
        for (let k = 0; k < 4; k++) sw[v * 4 + k] = sum > 0 ? sw[v * 4 + k] / sum * (1 - w) : 0;
        si[v * 4 + slot] = BI['lid' + S];
        sw[v * 4 + slot] = sum > 0 ? w : 1;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.skinIndex.needsUpdate = geo.attributes.skinWeight.needsUpdate = true;
    }
  }

  /* геометрия и материалы бойца по пресету (общие для build и restyle) */
  function parts(THREE, P, pack, BI, EYE, M, rest) {
    P.camoTile = 0.42;
    const geos = pack ? packGeometry(THREE, pack, P, BI) : soldierGeometry(THREE, P, M, BI, rest);
    if (EYE) rigFace(geos, EYE, BI);
    const handAssets = typeof self !== 'undefined' && self.GAssets && self.GAssets.data.vm_hands;
    const glbHands = !!(pack && AKA && handAssets);
    if (glbHands) delete geos.glove;
    if (pack && GEAR) Object.assign(geos, GEAR.gearGeometry(THREE, pack.hdr.joints, BI, P));
    if (pack && KIT) KIT.apply(THREE, geos, pack, P, BI);
    /* v26: кикимора / маскировочная накидка — поверх всего снаряжения */
    if (pack && COVER && P.cover && P.cover !== 'none') Object.assign(geos, COVER.geometry(THREE, geos, P, BI));
    const mats = pack ? packMaterials(THREE, P, pack) : buildMaterials(THREE, P);
    /* v26: трикотажный верх — атрибуты сетки кителя (один раз, геометрия общая) */
    if (mats.shirt && mats.shirt.userData.needBody && geos.shirt && CLOTH && CLOTH.bodyAttrs) CLOTH.bodyAttrs(THREE, geos.shirt, geos.skin);
    return { geos, mats, glbHands, handAssets };
  }
  function makeMeshes(THREE, key, geos, mats, skeleton, K, bindM) {
    const meshes = {};
    for (const g of Object.keys(geos)) {
      const geo = geos[g];
      if (!geo || !mats[g]) continue;
      const mesh = new THREE.SkinnedMesh(geo, mats[g]);
      mesh.name = key + '_' + g;
      /* мелочь на лице и снаряжении тень не отбрасывает: экономия проходов */
      mesh.castShadow = !(mats[g] && mats[g].transparent) && !['brow', 'lash', 'cornea', 'eye', 'patch', 'headRubber', 'cable'].includes(g);
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      if (mats[g] && mats[g].transparent) mesh.renderOrder = 2;
      if (bindM) mesh.bind(skeleton, bindM.clone());
      else if (K !== 1) mesh.bind(skeleton, new THREE.Matrix4().makeScale(K, K, K));
      else mesh.bind(skeleton);
      if (g === 'cover' && COVER && COVER.attach) COVER.attach(mesh);
      meshes[g] = mesh;
    }
    return meshes;
  }

  /* v26: смена внешнего вида живого бойца без пересборки скелета: новые
     сетки и материалы на тех же костях (риг, ИИ, физика не трогаются).
     Возвращает старые { meshes, materials } — их освобождает вызывающий. */
  function restyle(THREE, ch, P) {
    const pack = packData();
    if (!pack || !ch || !ch.skeleton) return null;
    const K = ch.scale || 1;
    const keep = { name: ch.preset.name, callsign: ch.preset.callsign, general: ch.preset.general };
    const { geos, mats } = parts(THREE, P, pack, ch.boneIndex, ch.eyeFit, ch.metrics, ch.rest);
    const any = Object.values(ch.meshes)[0];
    const bindM = any ? any.bindMatrix : (K !== 1 ? new THREE.Matrix4().makeScale(K, K, K) : new THREE.Matrix4());
    const meshes = makeMeshes(THREE, ch.key, geos, mats, ch.skeleton, K, bindM);
    const old = { meshes: ch.meshes, materials: ch.materials };
    for (const g in old.meshes) if (old.meshes[g].parent) old.meshes[g].parent.remove(old.meshes[g]);
    for (const g in meshes) {
      const prevM = old.meshes[g];
      if (prevM) { meshes[g].visible = prevM.visible; }
      ch.root.add(meshes[g]);
    }
    enableDQS(THREE, ch.skeleton, Object.values(meshes));
    if (meshes.skin && meshes.skin.material && meshes.skin.material.userData) meshes.skin.material.userData.wndSkin = true;
    const GDm = typeof self !== 'undefined' ? self.GDamage : null;
    if (GDm && GDm.woundMaterials) ch.wounds = GDm.woundMaterials(THREE, Object.values(meshes).map((m) => m.material), ch.wounds) || ch.wounds;
    ch.meshes = meshes; ch.materials = mats;
    ch.preset = Object.assign(P, keep.general ? keep : { name: keep.name, callsign: keep.callsign });
    ch._torso = undefined;
    /* перчатки GLB-рук */
    if (ch.hands) for (const sd in ch.hands) tintGlove(ch.hands[sd], P);
    return old;
  }
  function tintGlove(h, P) {
    const u = h && h.material && h.material.userData && h.material.userData.uGloveTint;
    if (!u) return;
    const t = P.gloveTint || [1, 1, 1];
    u.value.set(t[0], t[1], t[2]);
  }
  /* освобождение материалов и текстур прежнего вида (общие кэши — не трогаем) */
  function disposeLook(old) {
    if (!old) return;
    const seen = new Set();
    const texOf = (m) => ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap', 'emissiveMap', 'bumpMap']
      .map((k) => m[k]).filter(Boolean);
    const mats = old.materials || {};
    for (const k in mats) {
      const m = mats[k];
      if (!m || !m.isMaterial || seen.has(m)) continue;
      seen.add(m);
      for (const t of texOf(m)) if (!seen.has(t) && !(t.userData && (t.userData.mean || t.userData.shared))) { seen.add(t); t.dispose(); }
      m.dispose();
    }
    for (const k of ['_camo', '_camoBottom', '_camoHead']) { const t = mats[k]; if (t && t.isTexture && !seen.has(t)) { seen.add(t); t.dispose(); } }
  }

  function build(THREE, key, presetOverride) {
    const P = presetOverride || PRESETS[key];
    if (!P) throw new Error('нет пресета бойца: ' + key);

    const pack = packData();
    const K = pack ? (P.stature || 1) : 1;
    let Jsc = pack ? pack.hdr.joints : null;
    if (pack && K !== 1) {
      Jsc = {};
      for (const n in pack.hdr.joints) {
        const v = pack.hdr.joints[n];
        Jsc[n] = Array.isArray(v) ? v.map((x) => (typeof x === 'number' ? x * K : x)) : v;
      }
    }
    const M = pack ? SK.metricsFromJoints(Jsc, P.height * K) : SK.metrics(P.height, P.build);
    const bones = SK.build(M);
    /* кости глаз и век — в центрах глазных яблок, дети головы */
    const EYE = pack ? eyeRig(pack) : null;
    if (EYE) {
      const hd = SK.restWorld(bones).head;
      for (const S of ['R', 'L']) {
        const c = EYE[S].c, lp = [c[0] * K - hd[0], c[1] * K - hd[1], c[2] * K - hd[2]];
        bones.push({ name: 'eye' + S, parent: 'head', pos: lp.slice() });
        bones.push({ name: 'lid' + S, parent: 'head', pos: lp.slice() });
      }
    }
    const BI = SK.indexOf(bones);
    const rest = SK.restWorld(bones);
    /* Размер тайла камуфляжа в метрах: 512-пиксельная текстура ложится
       на 0,42 м ткани, поэтому самое крупное пятно выходит ~11 см — как
       на реальной форме. Кисти — перчатки GLB рига (viewmodel/ak.js),
       перчатка модели — запасная; наколенники и нашивки (gear.js);
       снаряжение по поверхности формы (soldier/kit.js); v26: маскировка
       (soldier/cover.js) — всё в parts(). */
    const { geos, mats, glbHands, handAssets } = parts(THREE, P, pack, BI, EYE, M, rest);

    /* --- three-скелет --- */
    const tb = bones.map((b) => {
      const o = new THREE.Bone();
      o.name = b.name;
      o.position.set(b.pos[0], b.pos[1], b.pos[2]);
      return o;
    });
    for (let i = 0; i < bones.length; i++)
      if (bones[i].parent) tb[BI[bones[i].parent]].add(tb[i]);
    /* Матрицы костей обязаны быть актуальны ДО создания Skeleton: три.js
       считает обратные bind-матрицы из текущих matrixWorld. Без этого вызова
       они получаются единичными, и смещение позы покоя применяется дважды —
       меш «взрывается» и улетает вверх. */
    tb[0].updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(tb);

    const root = new THREE.Group();
    root.name = 'soldier_' + key;
    root.add(tb[0]);

    const order = pack ? Object.keys(geos) : S.GROUPS.filter((g) => geos[g]);
    const meshes = makeMeshes(THREE, key, Object.fromEntries(order.map((g) => [g, geos[g]])), mats, skeleton, K, null);
    for (const g in meshes) root.add(meshes[g]);
    enableDQS(THREE, skeleton, Object.values(meshes));
    /* пробоины и кровь на ткани и коже (game/damage.js): точки ран — в
       системе покоя, поэтому живут на одежде при любой позе */
    const GDm = typeof self !== 'undefined' ? self.GDamage : null;
    /* v16: на коже — круглое входное отверстие с осадным пояском, на ткани — звёздчатый разрыв */
    if (meshes.skin && meshes.skin.material && meshes.skin.material.userData) meshes.skin.material.userData.wndSkin = true;
    const wounds = GDm ? GDm.woundMaterials(THREE, Object.values(meshes).map((m) => m.material)) : null;

    const char = {
      key, preset: P, root, skeleton, bones: tb, boneIndex: BI, metrics: M,
      rest, meshes, materials: mats, scale: K, eyeFit: EYE || null, lidClose: 0.46, wounds,
      bone: (n) => tb[BI[n]]
    };
    if (glbHands) {
      char.hands = AKA.attachHands(char, handAssets);
      if (char.hands) for (const sd in char.hands) tintGlove(char.hands[sd], P);
    }
    return char;
  }

  /* ------------------------------------ dual quaternion skinning --- */
  /* Модель привязана к скелету в T-позе, и рука, опущенная к корпусу,
     поворачивается в плече на 60–70°. Линейное смешивание матриц на таком
     угле «сдувает» дельту и подмышку: плечо сужается, рукав проваливается
     в корпус — рука выглядит прилипшей к туловищу. Смешивание двойных
     кватернионов поворачивает вершину вокруг сустава и сохраняет объём.

     Кватернионы лежат в той же текстуре костей, после матриц: её three.js
     загружает при каждой отрисовке скиннированного меша. Матрицы остаются
     на месте — тени и AO (служебные материалы) считаются по ним. */
  function enableDQS(THREE, skeleton, meshes) {
    const nb = skeleton.bones.length;
    /* v26: скелет готовится один раз; повторный вызов (restyle) — только материалы */
    if (!skeleton._dqs) {
    skeleton._dqs = true;
    let size = 4;
    while (size * size < nb * 6) size += 4;
    const arr = new Float32Array(size * size * 4);
    arr.set(skeleton.boneMatrices);
    skeleton.boneMatrices = arr;
    skeleton.boneTexture = new THREE.DataTexture(arr, size, size, THREE.RGBAFormat, THREE.FloatType);
    skeleton.boneTexture.needsUpdate = true;
    const base = nb * 16, m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    const update = skeleton.update.bind(skeleton);
    skeleton.update = function () {
      update();
      const bm = this.boneMatrices;
      for (let i = 0; i < nb; i++) {
        q.setFromRotationMatrix(m4.fromArray(bm, i * 16));
        const tx = bm[i * 16 + 12], ty = bm[i * 16 + 13], tz = bm[i * 16 + 14], o = base + i * 8;
        bm[o] = q.x; bm[o + 1] = q.y; bm[o + 2] = q.z; bm[o + 3] = q.w;
        /* дуальная часть: 0,5 · t ⊗ q */
        bm[o + 4] = 0.5 * (tx * q.w + ty * q.z - tz * q.y);
        bm[o + 5] = 0.5 * (-tx * q.z + ty * q.w + tz * q.x);
        bm[o + 6] = 0.5 * (tx * q.y - ty * q.x + tz * q.w);
        bm[o + 7] = -0.5 * (tx * q.x + ty * q.y + tz * q.z);
      }
    };
    }
    const DQ0 = nb * 4;
    const pars = `
#ifdef USE_SKINNING
#define AEGIS_DQS 1
vec4 dqFetch(const in float i, const in int k) {
  int size = textureSize(boneTexture, 0).x;
  int j = ${DQ0} + int(i) * 2 + k;
  return texelFetch(boneTexture, ivec2(j % size, j / size), 0);
}
#endif`;
    const blend = `
#ifdef USE_SKINNING
vec4 dqR0 = dqFetch(skinIndex.x, 0), dqD0 = dqFetch(skinIndex.x, 1);
vec4 dqR1 = dqFetch(skinIndex.y, 0), dqD1 = dqFetch(skinIndex.y, 1);
vec4 dqR2 = dqFetch(skinIndex.z, 0), dqD2 = dqFetch(skinIndex.z, 1);
vec4 dqR3 = dqFetch(skinIndex.w, 0), dqD3 = dqFetch(skinIndex.w, 1);
vec4 dqW = skinWeight * vec4(1.0, sign(dot(dqR0, dqR1) + 1e-6), sign(dot(dqR0, dqR2) + 1e-6), sign(dot(dqR0, dqR3) + 1e-6));
vec4 dqR = dqW.x * dqR0 + dqW.y * dqR1 + dqW.z * dqR2 + dqW.w * dqR3;
vec4 dqD = dqW.x * dqD0 + dqW.y * dqD1 + dqW.z * dqD2 + dqW.w * dqD3;
float dqL = length(dqR);
dqR /= dqL; dqD /= dqL;
#endif`;
    const nrm = `
#ifdef USE_SKINNING
vec3 dqN = (bindMatrix * vec4(objectNormal, 0.0)).xyz;
dqN += 2.0 * cross(dqR.xyz, cross(dqR.xyz, dqN) + dqR.w * dqN);
objectNormal = (bindMatrixInverse * vec4(dqN, 0.0)).xyz;
#ifdef USE_TANGENT
vec3 dqT = (bindMatrix * vec4(objectTangent, 0.0)).xyz;
dqT += 2.0 * cross(dqR.xyz, cross(dqR.xyz, dqT) + dqR.w * dqT);
objectTangent = (bindMatrixInverse * vec4(dqT, 0.0)).xyz;
#endif
#endif`;
    const pos = `
#ifdef USE_SKINNING
vec3 dqP = (bindMatrix * vec4(transformed, 1.0)).xyz;
dqP += 2.0 * cross(dqR.xyz, cross(dqR.xyz, dqP) + dqR.w * dqP);
dqP += 2.0 * (dqR.w * dqD.xyz - dqD.w * dqR.xyz + cross(dqR.xyz, dqD.xyz));
transformed = (bindMatrixInverse * vec4(dqP, 1.0)).xyz;
#endif`;
    for (const mesh of meshes) {
      const mat = mesh.material;
      if (!mat || mat.userData.dqs) continue;
      mat.userData.dqs = true;
      const prev = mat.onBeforeCompile, key0 = mat.customProgramCacheKey();
      mat.onBeforeCompile = function (sh, r) {
        if (prev) prev.call(this, sh, r);
        sh.vertexShader = sh.vertexShader
          .replace('#include <skinning_pars_vertex>', '#include <skinning_pars_vertex>' + pars)
          .replace('#include <skinbase_vertex>', blend)
          .replace('#include <skinnormal_vertex>', nrm)
          .replace('#include <skinning_vertex>', pos);
      };
      mat.customProgramCacheKey = () => key0 + '|dqs' + DQ0;
      mat.needsUpdate = true;
    }
  }

  /* Геометрия бойца одна на всех: строится один раз на тип головного
     убора, дальше каждый боец получает свои SkinnedMesh поверх общих
     буферов (скелеты разные, геометрия общая). */
  const geoCache = new Map();
  function soldierGeometry(THREE, P, M, BI, rest) {
    const key = P.head + '|' + (P.mask ? 1 : 0) + '|' + M.H;
    if (geoCache.has(key)) return geoCache.get(key);
    const G = S.newGroups();
    S.buildSoldier(G, M, BI, rest, { seed: BODY.geoSeed, head: P.head, mask: P.mask });
    const out = {};
    for (const g of S.GROUPS) {
      const buf = G[g];
      if (!buf.index.length) continue;
      buf.weld(2e-4);
      buf.recomputeNormals();
      buf.normalizeWeights();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(buf.skinIndex, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(buf.skinWeight, 4));
      geo.setIndex(buf.index);
      geo.computeBoundingSphere();
      out[g] = geo;
    }
    geoCache.set(key, out);
    return out;
  }

  /* ----------------------------------------- геометрия из пакета ------ */
  /* Буферы общие для всех бойцов; какие меши надеть, решает пресет:
     поле when меша — условия на поля пресета (head, mask). */
  const packGeoCache = new Map();
  const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  /* Веса костей скручивания. У модели плечо и предплечье — по одной
     кости, и вся пронация кисти ложилась на узкую зону у запястья:
     рукав перекручивался «фантиком». Часть веса предплечья плавно
     переходит на foreTwist (0 у локтя -> 1 у запястья), часть веса плеча
     у дельты — на armTwist, который гасит скрутку плеча. */
  function splitTwist(si, sw, pos, n, BI, J) {
    const sides = ['R', 'L'].map((S) => ({
      sh: BI['shoulder' + S], el: BI['elbow' + S], at: BI['armTwist' + S], ft: BI['foreTwist' + S],
      xS: Math.abs(J['shoulder' + S][0]), xE: Math.abs(J['elbow' + S][0]), xW: Math.abs(J['wrist' + S][0])
    }));
    if (sides.some((d) => d.at === undefined || d.ft === undefined)) return false;
    const inf = new Map();
    let any = false;
    for (let v = 0; v < n; v++) {
      const x = pos[v * 3], d = sides[x >= 0 ? 0 : 1], ax = Math.abs(x);
      inf.clear();
      for (let k = 0; k < 4; k++) {
        const w = sw[v * 4 + k];
        if (w > 0) inf.set(si[v * 4 + k], (inf.get(si[v * 4 + k]) || 0) + w);
      }
      const wS = inf.get(d.sh) || 0, wE = inf.get(d.el) || 0;
      let touched = false;
      if (wS > 0) {
        const share = 1 - sstep(0, 0.9, (ax - d.xS) / (d.xE - d.xS));
        if (share > 0) { inf.set(d.sh, wS * (1 - share)); inf.set(d.at, (inf.get(d.at) || 0) + wS * share); touched = true; }
      }
      if (wE > 0) {
        const share = sstep(0.05, 0.95, (ax - d.xE) / (d.xW - d.xE));
        if (share > 0) { inf.set(d.el, wE * (1 - share)); inf.set(d.ft, (inf.get(d.ft) || 0) + wE * share); touched = true; }
      }
      if (!touched) continue;
      any = true;
      const top = [...inf.entries()].filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const tot = top.reduce((a, e) => a + e[1], 0) || 1;
      for (let k = 0; k < 4; k++) {
        si[v * 4 + k] = top[k] ? top[k][0] : 0;
        sw[v * 4 + k] = top[k] ? top[k][1] / tot : 0;
      }
    }
    return any;
  }

  /* Рукава кителя объёмнее: у модели они сидели почти по руке (радиус
     предплечья ~4 см), а куртка на референсе заметно шире. Раздувается
     только рукав — от подмышки до манжеты; корпус под жилетом не трогаем,
     у манжеты прибавка меньше, чтобы рукав оставался поверх перчатки. */
  function puffSleeves(pos, nrm, n) {
    for (let v = 0; v < n; v++) {
      const ax = Math.abs(pos[v * 3]);
      if (ax < 0.23) continue;
      const d = sstep(0.23, 0.31, ax) * (0.013 - 0.0025 * sstep(0.40, 0.55, ax)) * (1 - 0.5 * sstep(0.66, 0.77, ax)) / 32767;
      pos[v * 3] += nrm[v * 3] * d;
      pos[v * 3 + 1] += nrm[v * 3 + 1] * d;
      pos[v * 3 + 2] += nrm[v * 3 + 2] * d;
    }
  }

  /* Край рукава живёт с предплечьем: вес костей кисти и пальцев у кителя
     переходит на foreTwist, иначе манжета поворачивалась бы вместе с кистью. */
  function sleeveToForearm(si, sw, n, BI) {
    const HAND = /^(wrist|palm|thumb|index|middle|ring|pinky)([RL])/;
    const to = {};
    for (const name in BI) {
      const m = name.match(HAND);
      if (m) to[BI[name]] = BI['foreTwist' + m[2]] !== undefined ? BI['foreTwist' + m[2]] : BI['elbow' + m[2]];
    }
    for (let i = 0; i < n * 4; i++) if (sw[i] > 0 && to[si[i]] !== undefined) si[i] = to[si[i]];
  }

  function packGeometry(THREE, pack, P, BI) {
    const hdr = pack.hdr, bin = pack.bin;
    const remap = hdr.bones.map((n) => (BI[n] === undefined ? BI.hips : BI[n]));
    const out = {};
    for (const m of hdr.meshes) {
      if (m.when && Object.keys(m.when).some((k) => P[k] !== m.when[k])) continue;
      let geo = packGeoCache.get(m.name);
      if (!geo) {
        const n = m.count;
        geo = new THREE.BufferGeometry();
        const pos = new Float32Array(bin, m.pos[0], m.pos[1]).slice();
        const nrm = new Int16Array(bin, m.nrm[0], m.nrm[1]);
        /* телосложение (body.js), затем крой одежды (clothing.js) */
        const grp = m.group || m.name;
        if (BODYMOD) BODYMOD.shape(grp, pos, nrm, n, hdr.joints);
        if (CLOTH) CLOTH.fit(grp, pos, nrm, n, hdr.joints);
        else if (grp === 'shirt') puffSleeves(pos, nrm, n);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, m.uv[0], m.uv[1]), 2));
        const si = new Uint8Array(bin, m.si[0], m.si[1]), si16 = new Uint16Array(n * 4);
        for (let i = 0; i < si.length; i++) si16[i] = remap[si[i]];
        const sw8 = new Uint8Array(bin, m.sw[0], m.sw[1]), sw = new Float32Array(n * 4);
        for (let i = 0; i < sw.length; i++) sw[i] = sw8[i] / 255;
        splitTwist(si16, sw, pos, n, BI, hdr.joints);
        if (grp === 'shirt') sleeveToForearm(si16, sw, n, BI);
        geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si16, 4));
        geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
        geo.setIndex(new THREE.BufferAttribute(m.index32 ? new Uint32Array(bin, m.index[0], m.index[1])
          : new Uint16Array(bin, m.index[0], m.index[1]), 1));
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.2);
        packGeoCache.set(m.name, geo);
      }
      out[m.group || m.name] = geo;
    }
    return out;
  }

  /* ----------------------------------------- материалы пакета --------- */
  const packTexCache = new Map();
  function packTex(THREE, pack, file, color) {
    const k = file + (color ? '|c' : '');
    if (packTexCache.has(k)) return packTexCache.get(k);
    const img = pack.img[file];
    const t = new THREE.Texture(img);
    t.flipY = false;                       // ImageBitmap уже перевёрнут при декодировании
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    if (color && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    /* средний цвет (линейный) — для перекраски и нормировки деталей */
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    const lin = (v) => Math.pow(v / 255, 2.2);
    const avg = [0, 0, 0]; let wsum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] / 255; wsum += a;
      for (let j = 0; j < 3; j++) avg[j] += lin(d[i + j]) * a;
    }
    t.userData.mean = avg.map((v) => v / Math.max(wsum, 1e-3));
    packTexCache.set(k, t);
    return t;
  }

  /* Ткань формы: камуфляж проецируется трипланарно по позе покоя (пятна
     одного масштаба на всём теле, без швов), а фактура самой вещи —
     швы, карманы, складки, запечённые в её текстуре, — умножается сверху
     как яркость. Так один и тот же крой становится любой из четырёх форм. */
  function garmentMat(THREE, camoTex, opt) {
    const mat = new THREE.MeshStandardMaterial({
      map: opt.detail || null, normalMap: opt.normal || null,
      normalScale: new THREE.Vector2(opt.nScale || 1, opt.nScale || 1),
      roughness: opt.rough === undefined ? 0.93 : opt.rough, metalness: 0,
      side: opt.side || THREE.FrontSide
    });
    const mean = opt.mean || (opt.detail ? opt.detail.userData.mean : [1, 1, 1]);
    const lm = 0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2];
    /* v24: раскладка камуфляжа для дальнего заменителя (29c_lod.js) — цвет вершин по тому же правилу */
    mat.userData.lodCamo = { tex: camoTex, tile: 1 / (opt.tile || 0.42), k: opt.detailK === undefined ? 1 : opt.detailK, mean: Math.max(lm, 1e-3) };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCamo = { value: camoTex };
      sh.uniforms.uTile = { value: 1 / (opt.tile || 0.42) };
      sh.uniforms.uDetail = { value: opt.detailK === undefined ? 1 : opt.detailK };
      sh.uniforms.uDetailMean = { value: Math.max(lm, 1e-3) };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vRestPos;
          varying vec3 vRestNrm;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vRestPos = position;
          vRestNrm = normal;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uCamo;
          uniform float uTile, uDetail, uDetailMean;
          varying vec3 vRestPos;
          varying vec3 vRestNrm;`)
        .replace('#include <map_fragment>', `
          vec3 tpN = abs(normalize(vRestNrm));
          tpN = pow(tpN, vec3(4.0));
          tpN /= max(tpN.x + tpN.y + tpN.z, 1e-4);
          vec3 tpP = vRestPos * uTile;
          vec4 camo = texture2D(uCamo, tpP.zy) * tpN.x + texture2D(uCamo, tpP.xz) * tpN.y + texture2D(uCamo, tpP.xy) * tpN.z;
          #ifdef USE_MAP
            vec3 det = texture2D(map, vMapUv).rgb;
            float dl = dot(det, vec3(0.2126, 0.7152, 0.0722)) / uDetailMean;
            camo.rgb *= mix(1.0, clamp(dl, 0.15, 1.8), uDetail);
          #endif
          diffuseColor *= camo;`);
    };
    mat.customProgramCacheKey = () => 'garment' + (opt.detail ? 1 : 0) + (opt.normal ? 1 : 0);
    return mat;
  }

  /* Снаряжение с собственной текстурой: цвет переносится на целевой
     поканально — оттенки, пряжки и потёртости исходника сохраняются. */
  function tintedMat(THREE, pack, tex, target, extra) {
    const map = packTex(THREE, pack, tex.map, true);
    const m = tex.mean || map.userData.mean, lin = (v) => Math.pow(v / 255, 2.2);
    const gain = target ? target.map((v, i) => lin(v) / Math.max(m[i], 1e-3)) : [1, 1, 1];
    const c = new THREE.Color(gain[0], gain[1], gain[2]);
    const mat = new THREE.MeshStandardMaterial(Object.assign({
      map, color: c,
      normalMap: tex.normalMap ? packTex(THREE, pack, tex.normalMap) : null,
      roughnessMap: tex.roughnessMap ? packTex(THREE, pack, tex.roughnessMap) : null,
      roughness: 1, metalness: 0
    }, extra || {}));
    return mat;
  }

  function packMaterials(THREE, P, pack) {
    const texOf = {};
    for (const m of pack.hdr.meshes) texOf[m.group || m.name] = m.tex || {};
    const tx = (g, k, color) => (texOf[g] && texOf[g][k] ? packTex(THREE, pack, texOf[g][k], color) : null);
    /* v26: верх, низ и чехол головного убора — каждый своей расцветкой */
    /* тельняшка — только верх: брюки и чехол по умолчанию — исходной расцветки */
    const kTop = P.camoTop || P.camo;
    /* верх не китель (тельняшка, футболка, майка, без верха) — «авто» низ и чехол исходные */
    const stTop = !!(CLOTH && (CLOTH.isUnder ? CLOTH.isUnder(kTop) : CLOTH.PAL && CLOTH.PAL[kTop] && CLOTH.PAL[kTop].stripes));
    const kBot = P.camoBottom || (stTop ? P.camo : kTop), kHead = P.camoHead || (stTop ? P.camo : kTop);
    const camoTex = {};
    const camoT = (kind) => camoTex[kind] || (camoTex[kind] = mkTex(THREE, camoCanvas(kind, P.seed), 1, true));
    const camo = camoT(kTop), camoB = camoT(kBot), camoH = camoT(kHead);
    const stripes = (kind) => (CLOTH && CLOTH.stripesOf ? CLOTH.stripesOf(kind) : null);
    const out = {};
    /* ткань формы — clothing.js (складки, пыль, отлив); старый материал — запасной */
    const J = pack.hdr.joints;
    const garment = CLOTH ? (tex, o) => CLOTH.garmentMat(THREE, tex, Object.assign({ joints: J }, o)) : (tex, o) => garmentMat(THREE, tex, o);

    /* Кожа. Фототекстура MakeHuman — бледная «офисная» кожа; боец —
       загорелый, обветренный, небритый, в пыли. Всё это считается в
       шейдере по точке покоя вершины (координаты модели, м): тон, щетина
       (челюсть, подбородок, усы, бакенбарды; губы и нос чистые), румянец
       носа и скул, тени под глазами, пятна грязи, жирный блеск Т-зоны.
       Пушок и рассеивание — sheen и тёплый ореол по краю. */
    const FACE = P.face || { tone: [0.93, 0.85, 0.78], stub: 0.6, dirt: 0.35, red: 0.5 };
    const skin = new THREE.MeshPhysicalMaterial({
      map: tx('skin', 'map', true), normalMap: tx('skin', 'normalMap'),
      normalScale: new THREE.Vector2(0.34, 0.34),
      roughnessMap: tx('skin', 'roughnessMap'), roughness: 1, metalness: 0,
      envMapIntensity: 0.55, specularIntensity: 0.7,
      sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.55, 0.40, 0.33)
    });
    const faceSeed = (P.seed % 97) * 0.731;
    skin.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        uTone: { value: new THREE.Vector3(FACE.tone[0], FACE.tone[1], FACE.tone[2]) },
        uStub: { value: FACE.stub }, uDirt: { value: FACE.dirt }, uRed: { value: FACE.red }, uSeed: { value: faceSeed }
      });
      sh.vertexShader = 'varying vec3 vRP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRP = position;');
      sh.fragmentShader = `varying vec3 vRP;
uniform vec3 uTone; uniform float uStub, uDirt, uRed, uSeed;
float fh13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float fvn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fh13(i), fh13(i + vec3(1, 0, 0)), f.x), mix(fh13(i + vec3(0, 1, 0)), fh13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(fh13(i + vec3(0, 0, 1)), fh13(i + vec3(1, 0, 1)), f.x), mix(fh13(i + vec3(0, 1, 1)), fh13(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float fg3(vec3 p, vec3 c, vec3 s) { vec3 d = (p - c) / s; return exp(-dot(d, d)); }
` + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
  vec3 fp = vRP; float fax = abs(fp.x); vec3 fq = vec3(fax, fp.yz);
  diffuseColor.rgb *= uTone;
  float fUp = mix(1.673, 1.714, smoothstep(0.026, 0.066, fax));
  float fBeard = smoothstep(1.552, 1.586, fp.y) * (1.0 - smoothstep(fUp - 0.010, fUp, fp.y));
  fBeard *= 1.0 - smoothstep(-0.020, 0.004, fp.z);
  fBeard *= 1.0 - smoothstep(0.068, 0.078, fax) * smoothstep(1.655, 1.675, fp.y);
  fBeard *= 1.0 - (1.0 - smoothstep(0.019, 0.027, fax)) * smoothstep(1.625, 1.632, fp.y) * (1.0 - smoothstep(1.658, 1.665, fp.y)) * (1.0 - smoothstep(-0.152, -0.141, fp.z));
  fBeard *= 1.0 - (1.0 - smoothstep(0.015, 0.024, fax)) * smoothstep(1.668, 1.675, fp.y);
  fBeard *= uStub;
  float fPatch = 0.55 + 0.45 * fvn(fp * 380.0 + uSeed);
  float fDots = smoothstep(0.42, 0.92, fh13(floor(fp * 1900.0)));
  fDots = mix(fDots, 0.3, smoothstep(0.00035, 0.0011, length(fwidth(fp))));
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.80, 0.78, 0.79), fBeard * fPatch);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.075, 0.062, 0.055), fBeard * fPatch * fDots * 0.6);
  float fRed = fg3(fq, vec3(0.0, 1.683, -0.168), vec3(0.015, 0.016, 0.03)) * 0.8
             + fg3(fq, vec3(0.046, 1.690, -0.118), vec3(0.018, 0.018, 0.04)) * 0.55;
  diffuseColor.rgb *= mix(vec3(1.0), vec3(1.06, 0.88, 0.84), clamp(fRed * uRed, 0.0, 1.0));
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.84, 0.80, 0.84), fg3(fq, vec3(0.031, 1.7118, -0.130), vec3(0.015, 0.0055, 0.03)) * 0.7);
  float fDn = fvn(fp * 36.0 + uSeed) * 0.62 + fvn(fp * 110.0 + uSeed * 1.7) * 0.38;
  float fDirt = smoothstep(0.56, 0.80, fDn) * uDirt;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.70, 0.64, 0.56), fDirt * 0.7);
  float fTz = clamp(fg3(fq, vec3(0.0, 1.772, -0.115), vec3(0.045, 0.028, 0.06)) + fg3(fq, vec3(0.0, 1.70, -0.16), vec3(0.012, 0.03, 0.03)), 0.0, 1.0);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor * (1.0 - 0.25 * fTz) + fBeard * 0.18 + fDirt * 0.15, 0.28, 1.0);`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        float sssRim = pow(clamp(1.0 - dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.4);
        reflectedLight.indirectDiffuse += sssRim * vec3(0.07, 0.022, 0.012) * diffuseColor.rgb;
        reflectedLight.directDiffuse *= vec3(1.0, 0.95, 0.93);`);
    };
    out.skin = skin;
    /* Глаз: без лака (раньше лак отражал небо, и глаз казался стеклянным
       и белёсым). Склера приглушена, радужка темнее, у верхнего века — тень
       от века и ресниц, в уголках — розоватая слизистая и затенение. */
    const EF = typeof eyeFit === 'object' && eyeFit ? eyeFit : null;
    out.eye = new THREE.MeshStandardMaterial({ map: tx('eye', 'map', true), roughness: 0.3, metalness: 0, envMapIntensity: 0.3 });
    if (EF) out.eye.onBeforeCompile = (sh) => {
      sh.uniforms.uEyeR = { value: new THREE.Vector3(EF.R.c[0], EF.R.c[1], EF.R.c[2]) };
      sh.uniforms.uEyeL = { value: new THREE.Vector3(EF.L.c[0], EF.L.c[1], EF.L.c[2]) };
      sh.vertexShader = 'varying vec3 vRP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRP = position;');
      sh.fragmentShader = 'varying vec3 vRP;\nuniform vec3 uEyeR, uEyeL;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  vec3 eq = vRP - (vRP.x > 0.0 ? uEyeR : uEyeL);
  float eS = smoothstep(0.40, 0.62, dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)));
  diffuseColor.rgb *= mix(vec3(0.66, 0.64, 0.60), vec3(0.84, 0.81, 0.78), eS);
  float eC = smoothstep(0.005, 0.0125, abs(eq.x));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.02, 0.80, 0.76), eC * eS * 0.6);
  diffuseColor.rgb *= (1.0 - 0.5 * smoothstep(-0.0045, 0.0025, eq.y)) * (1.0 - 0.45 * eC);`);
    };
    /* роговица: только влажный блик (аддитивно), без белёсой плёнки */
    out.cornea = new THREE.MeshPhysicalMaterial({
      color: 0x000000, roughness: 0.04, metalness: 0, ior: 1.376, specularIntensity: 1, envMapIntensity: 0.8,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    for (const g of ['brow', 'lash']) {
      const lash = g === 'lash';
      out[g] = new THREE.MeshStandardMaterial({
        map: tx(g, 'map', true), color: lash ? new THREE.Color(0.22, 0.18, 0.15) : new THREE.Color(0.50, 0.41, 0.34),
        transparent: true, opacity: lash ? 0.72 : 0.95, depthWrite: false, alphaTest: lash ? 0.22 : 0.05,
        roughness: 0.75, metalness: 0, side: THREE.DoubleSide
      });
    }
    /* v26: бельё (футболка, майка, без верха, шорты, трусы) — открытая кожа на сетках
       кителя и брюк (clothing.js: cutOf); тон — средний цвет кожи лица × загар бойца */
    const skMap = tx('skin', 'map', true), skM = (skMap && skMap.userData.mean) || [0.42, 0.25, 0.17];
    const skinLin = [0, 1, 2].map((i) => skM[i] * FACE.tone[i]);
    const SOCK = [0.042, 0.042, 0.031];
    const cutT = CLOTH && CLOTH.cutOf ? CLOTH.cutOf(kTop, 'top') : null;
    const cutB = CLOTH && CLOTH.cutOf ? CLOTH.cutOf(kBot, 'bottom') : null;
    const bareOf = (c) => (c ? Object.assign({ skin: skinLin, sockCol: SOCK }, c) : null);
    /* трикотаж и голый торс: без пуговиц, воротника, клапанов и швов кителя (clothing.js: bodyAttrs) */
    out.shirt = garment(camo, { mean: texOf.shirt.mean, detail: tx('shirt', 'map', true), detailK: stTop ? 0.12 : 0.6, tile: P.camoTile, seams: stTop ? 0 : 1, stripes: stripes(kTop), bare: bareOf(cutT), body: stTop, side: stTop ? THREE.DoubleSide : undefined });
    out.pants = garment(camoB, { mean: texOf.pants.mean, detail: tx('pants', 'map', true), normal: tx('pants', 'normalMap'), detailK: 0.6, tile: P.camoTile, seams: 2, stripes: stripes(kBot), bare: bareOf(cutB) });
    out._skinLin = skinLin;
    out.vest = tintedMat(THREE, pack, texOf.vest, P.gearCol);
    out.boot = tintedMat(THREE, pack, texOf.boot, P.bootCol);
    out.glove = tintedMat(THREE, pack, texOf.glove, P.gloveCol, { roughness: 0.8 });
    /* камуфляж — рукавам рига от первого лица (game/bodycam.js) */
    out._camo = camo;
    if (camoB !== camo) out._camoBottom = camoB;
    if (camoH !== camo && camoH !== camoB) out._camoHead = camoH;

    /* Головные уборы и балаклава: развёртка у них в метрах, поэтому
       тканевые карты нормалей ложатся с реальным шагом нити. */
    const DS = THREE.DoubleSide;
    const fabN = cached('fabN', () => T.fabricNormal(77, 256, 52, 1));
    const nylN = cached('nylN', () => T.fabricNormal(31, 256, 96, 0.45));
    const nrmTex = (cv, rep) => { const t = mkTex(THREE, cv, 1); t.repeat.set(rep, rep); return t; };
    /* чехол шлема и панама: тельняшкой не шьют — у полосатого верха чехол однотонный */
    const hc = stripes(kHead) ? camoT('olive') : camoH;
    out.helmet = garment(hc, { tile: P.camoTile * 0.8, side: DS, normal: nrmTex(fabN, 1 / 0.05), nScale: 0.6, rough: 0.9, folds: 0, dirt: 0, sheen: 0.3 });
    out.hat = garment(hc, { tile: P.camoTile, side: DS, normal: nrmTex(fabN, 1 / 0.045), nScale: 0.8, rough: 0.95, folds: 0, dirt: 0, sheen: 0.4 });
    if (hc !== camo && hc !== camoB && hc !== camoH) out._camoHead2 = hc;
    out.headHard = new THREE.MeshStandardMaterial({ color: srgb(THREE, P.hardCol), roughness: 0.55, metalness: 0.05, side: DS });
    out.headGear = new THREE.MeshStandardMaterial({ color: srgb(THREE, P.gearCol), roughness: 1, metalness: 0, side: DS,
      normalMap: nrmTex(nylN, 1 / 0.03), normalScale: new THREE.Vector2(0.8, 0.8) });
    out.headRubber = new THREE.MeshStandardMaterial({ color: srgb(THREE, [26, 26, 25]), roughness: 0.85, metalness: 0, side: DS });
    const maskCv = cached('mask_' + P.maskCol.join('_'), () => T.nylonAlbedo(P.maskCol, P.seed + 21, 256));
    const maskMap = mkTex(THREE, maskCv, 1, true); maskMap.repeat.set(14, 14);
    const patchCv = cached('patch_' + P.faction + '_' + P.patchCol.join('_'), () => patchCanvas(P.faction, P.patchCol[0], P.patchCol[1]));
    const patchTex = mkTex(THREE, patchCv, 0, true);
    patchTex.wrapS = patchTex.wrapT = THREE.ClampToEdgeWrapping;
    out.patch = new THREE.MeshStandardMaterial({ map: patchTex, roughness: 0.92, metalness: 0, side: DS });
    /* на трикотаже и голом теле шевронов нет (липучка — на кителе); повязка команды остаётся */
    if (stTop) out.patch.visible = false;
    out.mask = new THREE.MeshStandardMaterial({ map: maskMap, normalMap: nrmTex(fabN, 30), normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.97, metalness: 0, side: DS });
    if (GEAR) Object.assign(out, GEAR.gearMaterials(THREE, P, srgb, out));
    /* напуск над берцами без брюк — край носка */
    const bareCuff = cutB ? Object.assign(bareOf(cutB), { leg: 9, sock: 9, knit: 1 }) : null;
    if (KIT) Object.assign(out, KIT.materials(THREE, P, srgb, out, { garment, camo, camoBottom: camoB, stripesBottom: stripes(kBot), bareCuff }));
    if (COVER && P.cover && P.cover !== 'none') { const cm = COVER.material(THREE, P); if (cm) out.cover = cm; }
    return out;
  }

  return { PRESETS, ORDER, BASE, build, buildMaterials, withLook, applyLooks, restyle, disposeLook, tintGlove };
});