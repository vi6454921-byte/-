/* ============================================================================
   Генератор бойца: анатомия, форма, снаряжение.

   Тело строится не из примитивов, а из лофтов переменного сечения вокруг
   скелета, поэтому нет «кубиков»: плечо плавно переходит в предплечье,
   торс в талию, а кисть имеет пять пальцев с тремя фалангами.

   Каждая вершина получает веса костей прямо в момент создания — меш сразу
   готов к скиннингу. На стыках (локоть, колено, шея, запястье) веса
   смешиваются, поэтому при сгибе не рвётся поверхность.

   Материальные группы разделены: форма, кожа, перчатки, снаряжение, шлем,
   ботинки, «железо». Это даёт разные шероховатости и карты без ухищрений.
   ========================================================================== */
(function (root, factory) {
  const S = factory(root.GUtil, root.GBuf, root.GSkel);
  if (typeof module !== 'undefined' && module.exports) module.exports = S;
  else root.GSoldier = S;
})(typeof self !== 'undefined' ? self : this, function (U, B, SK) {
  'use strict';

  const TAU = Math.PI * 2;
  const { norm, cross, sub, add, scale, lerp3 } = B;

  /* Группы материалов: каждая едет в свой SkinnedMesh. */
  /* «mask» вынесена из «gear» отдельной группой намеренно: балаклава надета
     на голову, и когда игрок смотрит глазами этого бойца, её нужно скрыть
     вместе с головой. Будь она частью снаряжения, пришлось бы прятать заодно
     бронежилет и подсумки. */
  const GROUPS = ['uniform', 'skin', 'glove', 'gear', 'mask', 'helmet', 'boot', 'hard', 'eye', 'hair'];

  function newGroups() {
    const g = {};
    for (const k of GROUPS) g[k] = new B.Buf();
    return g;
  }

  /* --------------------------------------------------------------- веса */
  /* w('chest',0.7,'spine',0.3) -> [[idx,0.7],[idx,0.3]] */
  function makeW(BI) {
    return function () {
      const out = [];
      for (let i = 0; i < arguments.length; i += 2) {
        const n = arguments[i], v = arguments[i + 1];
        if (BI[n] === undefined) throw new Error('нет кости ' + n);
        if (v > 0.0005) out.push([BI[n], v]);
      }
      out.sort((a, b) => b[1] - a[1]);
      return out.slice(0, 4);
    };
  }

  /* Плавный переход весов между двумя костями по параметру t (0..1). */
  function blendW(W, a, b, t, extra, extraW) {
    const s = U.smoothstep(t);
    if (extra) return W(a, (1 - s) * (1 - extraW), b, s * (1 - extraW), extra, extraW);
    return W(a, 1 - s, b, s);
  }

  /* --------------------------------------------------- UV по длине лофта */
  /* Текстура камуфляжа должна иметь одинаковый масштаб на всех деталях,
     иначе на рукаве пятна крупнее, чем на груди. Поэтому U считается по
     обхвату сечения, V — по пройденной длине оси, обе делятся на tile. */
  function uvRings(rings, tile) {
    let len = 0;
    let circ = 0;
    for (let i = 0; i < rings.length; i++) {
      if (i > 0) {
        const a = rings[i - 1].c, b = rings[i].c;
        len += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      }
      rings[i].v = len / tile;
      circ += Math.PI * (rings[i].rx + (rings[i].ry === undefined ? rings[i].rx : rings[i].ry));
    }
    return (circ / rings.length) / tile;
  }

  /* ============================================================== ТОРС == */
  /* Сечения торса — суперэллипсы: у таза почти овал, у груди более
     «коробчатое» сечение с выраженной спиной. Куртка на 12–18 мм толще
     тела и слегка провисает на пояснице. */
  function buildTorso(G, M, W, cfg) {
    const rnd = cfg.rnd;
    const pad = 0.017;                         // толщина куртки
    const rows = [
      /* y,                     rx,             rz,          n,   кости */
      { y: M.hipY - 0.035, rx: M.hipRX * 0.98, rz: M.hipRZ * 0.98, n: 2.6, b: W('hips', 1) },
      { y: M.hipY + 0.030, rx: M.hipRX, rz: M.hipRZ, n: 2.7, b: W('hips', 1) },
      { y: M.waistY - 0.030, rx: M.waistRX * 1.02, rz: M.waistRZ * 1.01, n: 2.8, b: W('hips', 0.55, 'spine', 0.45) },
      { y: M.waistY + 0.035, rx: M.waistRX, rz: M.waistRZ, n: 2.9, b: W('spine', 0.9, 'hips', 0.1) },
      { y: M.waistY + 0.105, rx: U.lerp(M.waistRX, M.chestRX, 0.55), rz: U.lerp(M.waistRZ, M.chestRZ, 0.5), n: 3.0, b: W('spine', 0.6, 'chest', 0.4) },
      { y: M.chestY, rx: M.chestRX, rz: M.chestRZ, n: 3.1, b: W('chest', 0.95, 'spine', 0.05) },
      { y: M.chestY + 0.075, rx: M.chestRX * 0.99, rz: M.chestRZ * 0.98, n: 3.0, b: W('chest', 1) },
      { y: M.shoulderY - 0.010, rx: M.chestRX * 0.90, rz: M.chestRZ * 0.90, n: 2.8, b: W('chest', 1) },
      { y: M.neckY - 0.012, rx: M.chestRX * 0.62, rz: M.chestRZ * 0.80, n: 2.5, b: W('chest', 0.85, 'neck', 0.15) }
    ];

    const rings = rows.map((r, i) => {
      const t = i / (rows.length - 1);
      /* спина чуть площе груди: смещаем центр сечения вперёд */
      const zOff = U.lerp(0.004, -0.008, t);
      return {
        c: [0, r.y, zOff], rx: r.rx + pad, ry: r.rz + pad, n: r.n,
        axis: [0, 1, 0], up: [0, 0, -1], bones: r.b
      };
    });
    const uS = uvRings(rings, cfg.camoTile);
    B.loft(G.uniform, rings, 30, { uScale: uS, capStart: true, capEnd: false });

    /* Воротник-стойка: короткий раструб вокруг шеи. */
    const cr = [
      { c: [0, M.neckY - 0.016, -0.004], rx: M.neckR + 0.024, ry: M.neckR + 0.028, n: 2.4, axis: [0, 1, 0], up: [0, 0, -1], bones: W('chest', 0.6, 'neck', 0.4) },
      { c: [0, M.neckY + 0.038, -0.006], rx: M.neckR + 0.021, ry: M.neckR + 0.024, n: 2.3, axis: [0, 1, 0], up: [0, 0, -1], bones: W('neck', 0.85, 'chest', 0.15) },
      { c: [0, M.neckY + 0.072, -0.008], rx: M.neckR + 0.019, ry: M.neckR + 0.022, n: 2.3, axis: [0, 1, 0], up: [0, 0, -1], bones: W('neck', 1) }
    ];
    B.loft(G.uniform, cr, 24, { uScale: uvRings(cr, cfg.camoTile) });

    /* Планка застёжки и карманы на груди — мелочь, которая читается вблизи. */
    const fz = -(M.chestRZ + pad) - 0.001;
    B.panel(G.uniform, {
      origin: [-0.020, M.waistY + 0.02, fz], ex: [0.040, 0, 0], ey: [0, M.chestY + 0.06 - (M.waistY + 0.02), -0.012],
      segX: 3, segY: 10, bow: 0.004, thickness: 0.005, soft: 0,
      bones: W('chest', 0.6, 'spine', 0.4)
    });
    for (const s of [1, -1]) {
      B.panel(G.uniform, {
        origin: [s * 0.042 - (s > 0 ? 0 : 0.085), M.chestY - 0.005, fz - 0.004],
        ex: [0.085, 0, 0], ey: [0, 0.088, -0.010],
        segX: 5, segY: 5, bow: 0.006, thickness: 0.006, soft: 0.18,
        bones: W('chest', 1)
      });
    }
    return { pad };
  }

  /* ============================================================== ШЕЯ ==== */
  function buildNeck(G, M, W) {
    const rings = [
      { c: [0, M.neckY - 0.030, 0], rx: M.neckR * 1.12, ry: M.neckR * 1.18, n: 2.3, axis: [0, 1, 0], up: [0, 0, -1], bones: W('chest', 0.7, 'neck', 0.3) },
      { c: [0, M.neckY + 0.015, -0.002], rx: M.neckR, ry: M.neckR * 1.06, n: 2.2, axis: [0, 1, 0], up: [0, 0, -1], bones: W('neck', 0.9, 'chest', 0.1) },
      { c: [0, M.neckY + 0.060, -0.006], rx: M.neckR * 0.95, ry: M.neckR, n: 2.2, axis: [0, 1, 0], up: [0, 0, -1], bones: W('neck', 0.85, 'head', 0.15) },
      { c: [0, M.headY - 0.020, -0.010], rx: M.neckR * 0.92, ry: M.neckR * 0.98, n: 2.2, axis: [0, 1, 0], up: [0, 0, -1], bones: W('head', 0.8, 'neck', 0.2) }
    ];
    B.loft(G.skin, rings, 18, { uScale: uvRings(rings, 0.30) });
  }

  /* ============================================================ ГОЛОВА == */
  /* Череп лепится смещением сферической сетки: надбровье, глазницы, нос,
     скулы, губы, подбородок, угол челюсти. Формулы — гладкие «шишки»
     (гауссианы), поэтому силуэт остаётся человеческим с любого ракурса. */
  function headDisplace(M, cfg) {
    const f = cfg.face || {};
    const nose = f.nose === undefined ? 1 : f.nose;
    const jaw = f.jaw === undefined ? 1 : f.jaw;
    const brow = f.brow === undefined ? 1 : f.brow;

    /* гауссова шишка от точки p в локальных координатах головы */
    const bump = (x, y, z, px, py, pz, sx, sy, sz) =>
      Math.exp(-(Math.pow((x - px) / sx, 2) + Math.pow((y - py) / sy, 2) + Math.pow((z - pz) / sz, 2)));

    return function (p) {
      const x = p[0], y = p[1], z = p[2];
      const ax = Math.abs(x);
      let d = [0, 0, 0];
      const front = U.clamp01(-z / M.headRZ);            // 1 спереди, 0 сзади

      /* затылок чуть длиннее и ниже — типичная форма черепа */
      d[2] += U.clamp01(z / M.headRZ) * 0.012 * (1 - U.clamp01(Math.abs(y - 0.01) / 0.09));
      /* лоб слегка отклонён назад сверху */
      d[2] += U.clamp01((y - 0.035) / 0.06) * front * 0.008;

      /* надбровные дуги */
      const br = bump(ax, y, z, 0.030, 0.026, -M.headRZ * 0.86, 0.030, 0.014, 0.055);
      d[2] -= br * 0.011 * brow;
      d[1] += br * 0.003;

      /* глазницы — вдавливание под дугой */
      const so = bump(ax, y, z, 0.033, 0.006, -M.headRZ * 0.82, 0.026, 0.017, 0.05);
      d[2] += so * 0.013;

      /* скулы */
      const cb = bump(ax, y, z, 0.058, -0.012, -M.headRZ * 0.52, 0.026, 0.024, 0.06);
      d[0] += Math.sign(x || 1) * cb * 0.008;
      d[2] -= cb * 0.006;

      /* спинка и кончик носа */
      const bridge = Math.exp(-Math.pow(ax / 0.014, 2)) *
        Math.exp(-Math.pow((y - 0.004) / 0.040, 2)) * front;
      d[2] -= bridge * 0.020 * nose;
      const tip = bump(ax, y, z, 0.0, -0.030, -M.headRZ * 0.92, 0.016, 0.014, 0.05);
      d[2] -= tip * 0.017 * nose;
      d[1] -= tip * 0.004;
      /* крылья носа */
      const wing = bump(ax, y, z, 0.016, -0.034, -M.headRZ * 0.86, 0.010, 0.010, 0.04);
      d[0] += Math.sign(x || 1) * wing * 0.005;

      /* верхняя губа и подносовой желобок */
      const lipU = bump(ax, y, z, 0.0, -0.050, -M.headRZ * 0.86, 0.030, 0.008, 0.05);
      d[2] -= lipU * 0.006;
      const lipL = bump(ax, y, z, 0.0, -0.066, -M.headRZ * 0.85, 0.028, 0.009, 0.05);
      d[2] -= lipL * 0.005;
      /* щель рта */
      const slit = bump(ax, y, z, 0.0, -0.058, -M.headRZ * 0.88, 0.032, 0.0035, 0.05);
      d[2] += slit * 0.004;

      /* подбородок */
      const chin = bump(ax, y, z, 0.0, -0.090, -M.headRZ * 0.80, 0.030, 0.022, 0.06);
      d[2] -= chin * 0.012 * jaw;
      d[1] -= chin * 0.004;

      /* угол нижней челюсти: расширяем и «квадратим» низ */
      const ang = bump(ax, y, z, 0.062, -0.074, 0.0, 0.030, 0.028, 0.055);
      d[0] += Math.sign(x || 1) * ang * 0.010 * jaw;

      /* сужение черепа к низу (щёки) */
      const low = U.clamp01((-y - 0.030) / 0.070);
      d[0] -= x * low * 0.20;
      d[2] -= z * low * 0.10 * U.clamp01(z / M.headRZ);

      /* виски слегка вдавлены */
      const temple = bump(ax, y, z, 0.072, 0.030, -0.020, 0.022, 0.030, 0.05);
      d[0] -= Math.sign(x || 1) * temple * 0.005;

      return d;
    };
  }

  /* Сетка головы. Возвращает функцию точки, чтобы шапка/балаклава могли
     строиться по той же поверхности с отступом. */
  function headSurface(M, cfg) {
    const disp = headDisplace(M, cfg);
    return function (theta, phi, inflate) {
      const sp = Math.sin(phi), cp = Math.cos(phi);
      const nx = sp * Math.sin(theta), ny = cp, nz = -sp * Math.cos(theta);
      const k = inflate || 0;
      const p = [nx * (M.headRX + k), ny * (M.headRY + k), nz * (M.headRZ + k)];
      const d = disp(p);
      return [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
    };
  }

  function buildHead(G, M, W, cfg) {
    const surf = headSurface(M, cfg);
    const NT = 40, NP = 28;
    const oy = M.headC;
    const bones = W('head', 1);
    const grid = [];
    for (let ip = 0; ip <= NP; ip++) {
      const phi = (ip / NP) * Math.PI;
      const row = [];
      for (let it = 0; it <= NT; it++) {
        const th = (it / NT) * TAU;
        const p = surf(th, phi, 0);
        /* низ головы прячется в шею: поджимаем, чтобы не было «блюдца» */
        const pt = [p[0], p[1] + oy, p[2]];
        row.push(G.skin.vertex(pt, norm(p), [it / NT * 1.4, ip / NP * 1.4], bones));
      }
      grid.push(row);
    }
    for (let ip = 0; ip < NP; ip++)
      for (let it = 0; it < NT; it++)
        G.skin.quad(grid[ip][it], grid[ip][it + 1], grid[ip + 1][it + 1], grid[ip + 1][it]);

    /* уши: небольшая раковина по бокам */
    for (const s of [1, -1]) {
      const rings = [];
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        rings.push({
          c: [s * (M.headRX * 0.86 + t * 0.012), oy - 0.004 + Math.sin(t * Math.PI) * 0.002, 0.012],
          rx: U.lerp(0.0075, 0.0035, t), ry: U.lerp(0.026, 0.018, t), n: 2.2,
          axis: [s, 0, 0], up: [0, 1, 0], bones
        });
      }
      B.loft(G.skin, rings, 12, { capEnd: true, uScale: 0.2 });
    }

    /* глаза: сферы в глазницах + радужка отдельным материалом */
    const eyes = [];
    for (const s of [1, -1]) {
      const c = [s * 0.032, oy + 0.008, -M.headRZ * 0.80];
      eyes.push(c);
      sphere(G.eye, c, 0.0122, 14, 10, bones, [0, 0]);
    }
    return { surf, eyes, oy };
  }

  /* Простая UV-сфера — глазные яблоки, пуговицы, заклёпки. */
  function sphere(buf, c, r, nt, np, bones, uvOff, rz) {
    const grid = [];
    const RZ = rz === undefined ? r : rz;
    for (let ip = 0; ip <= np; ip++) {
      const phi = (ip / np) * Math.PI;
      const row = [];
      for (let it = 0; it <= nt; it++) {
        const th = (it / nt) * TAU;
        const n = [Math.sin(phi) * Math.sin(th), Math.cos(phi), -Math.sin(phi) * Math.cos(th)];
        row.push(buf.vertex([c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * RZ], n,
          [(uvOff ? uvOff[0] : 0) + it / nt, (uvOff ? uvOff[1] : 0) + ip / np], bones));
      }
      grid.push(row);
    }
    for (let ip = 0; ip < np; ip++)
      for (let it = 0; it < nt; it++)
        buf.quad(grid[ip][it], grid[ip][it + 1], grid[ip + 1][it + 1], grid[ip + 1][it]);
  }

  /* ============================================================== РУКИ == */
  /* Рукав: плечо -> локоть -> предплечье -> запястье. Сечение эллиптическое,
     радиус идёт по сплайну (дельтовидная толще, запястье тонкое). Ткань
     добавляет 10–14 мм и собирается в складки у локтя. */
  function buildArm(G, M, W, cfg, side) {
    const s = side;                      // +1 правая, -1 левая
    const SS = s > 0 ? 'R' : 'L';
    const R = cfg.rest;
    const sh = R['shoulder' + SS], el = R['elbow' + SS], wr = R['wrist' + SS];
    const pad = 0.013;

    /* Дельтовидная: «шапка» плеча на стыке торса и руки. Радиус берётся от
       обхвата плеча (≈0,050 м), а не задаётся отдельно: раньше он был вдвое
       больше и плечи выглядели как надутые шары. Привязка к ключице и плечу
       даёт натяжение при подъёме руки вместо провала внутрь торса. */
    const armR = 0.051 * cfg.build;
    const delt = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const c = lerp3([sh[0] - s * 0.030, sh[1] + 0.020, sh[2]], [sh[0] + s * 0.042, sh[1] - 0.006, sh[2]], t);
      /* профиль: у корпуса шире (переход в грудь), к руке сходит на нет */
      const k = U.splineAt([1.20, 1.24, 1.18, 1.10, 1.03, 0.99], t);
      delt.push({
        c, rx: armR * k * 0.90 + pad * 0.4, ry: armR * k + pad * 0.4, n: 2.4,
        axis: [s, -0.16, 0], up: [0, 1, 0],
        bones: i < 2 ? W('clav' + SS, 0.45, 'chest', 0.2, 'shoulder' + SS, 0.35)
          : W('shoulder' + SS, U.lerp(0.55, 0.95, (i - 1) / 4), 'clav' + SS, U.lerp(0.45, 0.05, (i - 1) / 4))
      });
    }
    B.loft(G.uniform, delt, 22, { uScale: uvRings(delt, cfg.camoTile), capStart: true });

    /* Плечо и предплечье одним лофтом через локоть: непрерывная поверхность. */
    const rings = [];
    const NA = 9;
    for (let i = 0; i <= NA; i++) {
      const t = i / NA;
      const c = lerp3(sh, el, t);
      /* бицепс/трицепс: утолщение в середине плеча */
      const r = U.splineAt([0.053, 0.055, 0.054, 0.050, 0.045, 0.041], t) * cfg.build;
      rings.push({
        c, rx: r + pad, ry: r * 1.04 + pad, n: 2.3,
        axis: [s, 0, 0], up: [0, 1, 0],
        bones: t < 0.14 ? W('shoulder' + SS, 0.82, 'clav' + SS, 0.18)
          : blendW(W, 'shoulder' + SS, 'elbow' + SS, U.clamp01((t - 0.62) / 0.38))
      });
    }
    const NF = 9;
    for (let i = 1; i <= NF; i++) {
      const t = i / NF;
      const c = lerp3(el, wr, t);
      /* предплечье: мышечное брюшко у локтя, сухожилия к запястью */
      const r = U.splineAt([0.041, 0.046, 0.044, 0.038, 0.032, 0.028], t) * cfg.build;
      const isCuff = t > 0.80;
      rings.push({
        c, rx: r + (isCuff ? 0.009 : pad), ry: r * 1.02 + (isCuff ? 0.009 : pad), n: 2.3,
        axis: [s, 0, 0], up: [0, 1, 0],
        bones: blendW(W, 'elbow' + SS, 'wrist' + SS, U.clamp01((t - 0.55) / 0.45))
      });
    }
    B.loft(G.uniform, rings, 20, { uScale: uvRings(rings, cfg.camoTile) });

    /* Наколенник-налокотник: жёсткая накладка поверх рукава. */
    const eb = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const c = lerp3(lerp3(sh, el, 0.88), lerp3(el, wr, 0.14), t);
      const r = U.splineAt([0.044, 0.050, 0.051, 0.048, 0.042], t) * cfg.build + pad + 0.006;
      eb.push({ c, rx: r, ry: r, n: 2.6, axis: [s, 0, 0], up: [0, 1, 0],
        bones: blendW(W, 'elbow' + SS, 'wrist' + SS, U.clamp01((t - 0.5) * 0.6)) });
    }
    /* накладка только на «внешней» половине окружности */
    const ebRows = [];
    for (const r0 of eb) {
      const row = [];
      for (let j = 0; j <= 10; j++) {
        const a = U.lerp(-0.95, 0.95, j / 10);   // сектор вокруг «верх-назад»
        const th = a + Math.PI * 0.5;
        const p = [r0.c[0], r0.c[1] + Math.sin(th) * r0.ry, r0.c[2] + Math.cos(th) * r0.rx];
        row.push(G.gear.vertex(p, norm([0, Math.sin(th), Math.cos(th)]), [j / 10 * 0.4, ebRows.length * 0.2], r0.bones));
      }
      ebRows.push(row);
    }
    for (let i = 0; i < ebRows.length - 1; i++)
      for (let j = 0; j < 10; j++)
        G.gear.quad(ebRows[i][j], ebRows[i][j + 1], ebRows[i + 1][j + 1], ebRows[i + 1][j]);

    buildHand(G, M, W, cfg, side);
  }

  /* ============================================================== КИСТЬ == */
  /* Перчатка с пятью пальцами. Пясть — сплюснутый лофт, пальцы — цепочки
     из трёх фаланг со скруглёнными подушечками. Каждая фаланга привязана
     к своей кости, поэтому хват на цевье считается обратной кинематикой,
     а не «прилеплен» к модели. */
  function buildHand(G, M, W, cfg, side) {
    const s = side;
    const SS = s > 0 ? 'R' : 'L';
    const R = cfg.rest;
    const wr = R['wrist' + SS], pm = R['palm' + SS];

    /* манжета перчатки заходит на рукав */
    const cuff = [
      { c: [wr[0] - s * 0.030, wr[1], wr[2]], rx: 0.031, ry: 0.030, n: 2.6, axis: [s, 0, 0], up: [0, 1, 0], bones: W('wrist' + SS, 0.7, 'elbow' + SS, 0.3) },
      { c: [wr[0] - s * 0.004, wr[1], wr[2]], rx: 0.030, ry: 0.028, n: 2.8, axis: [s, 0, 0], up: [0, 1, 0], bones: W('wrist' + SS, 1) },
      { c: [pm[0], pm[1] - 0.002, pm[2]], rx: 0.029, ry: 0.024, n: 3.0, axis: [s, 0, 0], up: [0, 1, 0], bones: W('palm' + SS, 0.75, 'wrist' + SS, 0.25) }
    ];
    B.loft(G.glove, cuff, 16, { uScale: 0.35, capStart: true });

    /* Пясть: от запястья к основаниям пальцев, сечение сплющено. */
    const palmRings = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const x = U.lerp(pm[0], pm[0] + s * 0.056, t);
      palmRings.push({
        c: [x, pm[1] - 0.003 * t, pm[2] + 0.004 * t],
        rx: U.lerp(0.029, 0.026, t), ry: U.lerp(0.024, 0.036, t), n: 3.2,
        axis: [s, 0, 0], up: [0, 1, 0],
        bones: W('palm' + SS, 1)
      });
    }
    /* сечение ладони: шире поперёк пальцев, тоньше по толщине */
    for (const r of palmRings) { const t = r.rx; r.rx = r.ry * 0.46; r.ry = r.ry; }
    const palmRings2 = palmRings.map((r, i) => ({
      c: r.c, n: 3.0, axis: [s, 0, 0], up: [0, 1, 0], bones: r.bones,
      shape: (u, th) => {
        /* ладонь: эллипс, сплюснутый по вертикали, с «подушкой» у мизинца */
        const w = U.lerp(0.030, 0.042, i / 4);     // ширина поперёк пальцев (Z)
        const h = U.lerp(0.026, 0.021, i / 4);     // толщина (Y)
        const c = Math.cos(th), sn = Math.sin(th);
        const pad = 1 + 0.16 * Math.exp(-Math.pow((th - Math.PI * 1.25) / 0.7, 2));
        return [sn * h * (sn < 0 ? 1.06 : 0.94), c * w * pad];
      }
    }));
    /* shape задаёт (по локальным осям side/up) => [вдоль up, вдоль side] */
    B.loft(G.glove, palmRings2, 20, { uScale: 0.4 });

    const knuckle = [pm[0] + s * 0.056, pm[1] - 0.004, pm[2] + 0.004];

    /* пальцы */
    for (const f of SK.FINGERS) {
      const b1 = R[f.key + SS + '1'], b2 = R[f.key + SS + '2'], b3 = R[f.key + SS + '3'], b4 = R[f.key + SS + '4'];
      finger(G.glove, [b1, b2, b3, b4], f.r, s, [
        W(f.key + SS + '1', 0.72, 'palm' + SS, 0.28),
        W(f.key + SS + '1', 1),
        W(f.key + SS + '2', 1),
        W(f.key + SS + '3', 1),
        W(f.key + SS + '4', 1)
      ]);
    }
    const t1 = R['thumb' + SS + '1'], t2 = R['thumb' + SS + '2'], t3 = R['thumb' + SS + '3'], t4 = R['thumb' + SS + '4'];
    finger(G.glove, [t1, t2, t3, t4], SK.THUMB.r, s, [
      W('thumb' + SS + '1', 0.6, 'palm' + SS, 0.4),
      W('thumb' + SS + '1', 1),
      W('thumb' + SS + '2', 1),
      W('thumb' + SS + '3', 1),
      W('thumb' + SS + '4', 1)
    ]);

    /* защитные накладки на костяшках — читаемая деталь тактической перчатки */
    for (const f of SK.FINGERS) {
      const b1 = R[f.key + SS + '1'];
      sphere(G.gear, [b1[0] + s * 0.004, b1[1] + 0.009, b1[2]], f.r * 0.92, 10, 7,
        W(f.key + SS + '1', 0.7, 'palm' + SS, 0.3), [0, 0], f.r * 0.6);
    }
  }

  /* Цепочка фаланг: лофт с сужением и округлой подушечкой на конце. */
  function finger(buf, joints, r, s, bones) {
    const rings = [];
    const segs = [];
    for (let i = 0; i < joints.length - 1; i++) segs.push([joints[i], joints[i + 1]]);
    let acc = 0;
    for (let si = 0; si < segs.length; si++) {
      const [a, b] = segs[si];
      const N = 3;
      for (let i = (si === 0 ? 0 : 1); i <= N; i++) {
        const t = i / N;
        const c = lerp3(a, b, t);
        /* сустав чуть толще, середина фаланги тоньше */
        const kSeg = 1 - si * 0.13;
        const bulge = 1 + 0.10 * Math.cos((t - 0.5) * Math.PI * 2);
        rings.push({
          c, rx: r * kSeg * bulge * 0.92, ry: r * kSeg * bulge, n: 2.6,
          axis: [s, 0, 0], up: [0, 1, 0],
          bones: bones[Math.min(bones.length - 1, si + (t > 0.55 ? 1 : 0))]
        });
      }
    }
    /* подушечка */
    const last = joints[joints.length - 1];
    rings.push({
      c: [last[0] + s * r * 0.55, last[1] - r * 0.12, last[2]], rx: r * 0.52, ry: r * 0.62, n: 2.2,
      axis: [s, 0, 0], up: [0, 1, 0], bones: bones[bones.length - 1]
    });
    B.loft(buf, rings, 10, { uScale: 0.12, capStart: true, capEnd: true });
  }

  /* =============================================================== НОГИ == */
  /* Штанина: бедро -> колено -> голень, с напуском на берце ботинка.
     Наколенник — отдельная накладка. */
  function buildLeg(G, M, W, cfg, side) {
    const s = side;
    const SS = s > 0 ? 'R' : 'L';
    const R = cfg.rest;
    const hip = R['hip' + SS], kn = R['knee' + SS], an = R['ankle' + SS];
    const pad = 0.016;
    const rings = [];
    const NT = 8;
    for (let i = 0; i <= NT; i++) {
      const t = i / NT;
      const c = lerp3(hip, kn, t);
      const r = U.splineAt([0.088, 0.086, 0.080, 0.072, 0.064, 0.058], t) * cfg.build;
      rings.push({
        c, rx: r + pad, ry: r * 1.04 + pad, n: 2.5, axis: [0, -1, 0], up: [0, 0, -1],
        bones: t < 0.12 ? W('hip' + SS, 0.75, 'hips', 0.25) : blendW(W, 'hip' + SS, 'knee' + SS, U.clamp01((t - 0.6) / 0.4))
      });
    }
    const NS = 8;
    for (let i = 1; i <= NS; i++) {
      const t = i / NS;
      const c = lerp3(kn, an, t);
      /* икра: заметное брюшко в верхней трети голени */
      const r = U.splineAt([0.057, 0.062, 0.059, 0.050, 0.042, 0.038], t) * cfg.build;
      /* низ штанины заправлен в ботинок — расширяем напуск */
      const blouse = t > 0.72 ? U.lerp(0, 0.016, U.clamp01((t - 0.72) / 0.28)) : 0;
      rings.push({
        c, rx: r + pad + blouse, ry: r * 1.02 + pad + blouse, n: 2.4, axis: [0, -1, 0], up: [0, 0, -1],
        bones: blendW(W, 'knee' + SS, 'ankle' + SS, U.clamp01((t - 0.5) / 0.5))
      });
    }
    B.loft(G.uniform, rings, 22, { uScale: uvRings(rings, cfg.camoTile), capStart: true });

    /* наколенник */
    const kp = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const c = lerp3(lerp3(hip, kn, 0.86), lerp3(kn, an, 0.16), t);
      const r = U.splineAt([0.060, 0.066, 0.068, 0.066, 0.060, 0.054], t) * cfg.build + pad + 0.007;
      kp.push({ c, r, bones: blendW(W, 'knee' + SS, 'ankle' + SS, U.clamp01((t - 0.55) * 0.5)) });
    }
    const kRows = [];
    for (let i = 0; i < kp.length; i++) {
      const row = [];
      for (let j = 0; j <= 12; j++) {
        const a = U.lerp(-1.15, 1.15, j / 12);      // сектор вперёд
        const p = [kp[i].c[0] + Math.sin(a) * kp[i].r * 0.92, kp[i].c[1], kp[i].c[2] - Math.cos(a) * kp[i].r];
        row.push(G.gear.vertex(p, norm([Math.sin(a), 0, -Math.cos(a)]), [j / 12 * 0.5, i / 5 * 0.5], kp[i].bones));
      }
      kRows.push(row);
    }
    for (let i = 0; i < kRows.length - 1; i++)
      for (let j = 0; j < 12; j++)
        G.gear.quad(kRows[i][j], kRows[i][j + 1], kRows[i + 1][j + 1], kRows[i + 1][j]);

    buildBoot(G, M, W, cfg, side);
  }

  /* ============================================================ БОТИНОК == */
  /* Берец: голенище, подъём, носок и подошва с рантом. Форма важна —
     именно по стопе глаз считывает, стоит ли человек на земле. */
  function buildBoot(G, M, W, cfg, side) {
    const s = side;
    const SS = s > 0 ? 'R' : 'L';
    const R = cfg.rest;
    const an = R['ankle' + SS];
    const bw = W('ankle' + SS, 0.85, 'knee' + SS, 0.15);
    const tw = W('toe' + SS, 0.8, 'ankle' + SS, 0.2);
    const soleY = 0.0;                              // земля
    const toeZ = -M.foot * 0.68;
    const heelZ = M.foot * 0.32;

    /* голенище */
    const shaft = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const y = U.lerp(an[1] + 0.085, an[1] - 0.012, t);
      const r = U.lerp(0.050, 0.046, t);
      shaft.push({
        c: [an[0], y, an[2] + U.lerp(0.004, 0.0, t)], rx: r, ry: r * 1.06, n: 2.6,
        axis: [0, -1, 0], up: [0, 0, -1],
        bones: i < 2 ? W('ankle' + SS, 0.6, 'knee' + SS, 0.4) : bw
      });
    }
    B.loft(G.boot, shaft, 18, { uScale: 0.5, capStart: true });

    /* корпус ботинка: сечения от пятки к носку */
    const rows = [
      { z: heelZ, w: 0.042, y0: soleY + 0.028, y1: an[1] + 0.010, b: bw },
      { z: heelZ * 0.35, w: 0.046, y0: soleY + 0.024, y1: an[1] + 0.028, b: bw },
      { z: -M.foot * 0.06, w: 0.049, y0: soleY + 0.022, y1: an[1] + 0.006, b: bw },
      { z: -M.foot * 0.30, w: 0.050, y0: soleY + 0.021, y1: soleY + 0.072, b: W('ankle' + SS, 0.6, 'toe' + SS, 0.4) },
      { z: -M.foot * 0.50, w: 0.048, y0: soleY + 0.021, y1: soleY + 0.058, b: tw },
      { z: toeZ, w: 0.040, y0: soleY + 0.022, y1: soleY + 0.043, b: tw },
      { z: toeZ - 0.024, w: 0.026, y0: soleY + 0.026, y1: soleY + 0.034, b: tw }
    ];
    const bootRings = rows.map((r) => ({
      c: [an[0], (r.y0 + r.y1) * 0.5, r.z],
      axis: [0, 0, -1], up: [0, 1, 0],
      bones: r.b,
      shape: (u, th) => {
        const hw = r.w, hh = (r.y1 - r.y0) * 0.5;
        /* верх подъёма скруглён, низ почти плоский (подошва) */
        const c = Math.cos(th), sn = Math.sin(th);
        const p = 2 / (sn > 0 ? 2.6 : 5.0);
        return [Math.sign(c) * Math.pow(Math.abs(c), p) * hw,
          Math.sign(sn) * Math.pow(Math.abs(sn), p) * hh];
      }
    }));
    B.loft(G.boot, bootRings, 20, { uScale: 0.6, capStart: true, capEnd: true });

    /* подошва с рантом и протектором */
    const sole = rows.map((r) => ({
      c: [an[0], soleY + 0.013, r.z],
      axis: [0, 0, -1], up: [0, 1, 0], bones: r.b,
      shape: (u, th) => {
        const hw = r.w + 0.005, hh = 0.014;
        const c = Math.cos(th), sn = Math.sin(th);
        const p = 2 / 6.0;
        return [Math.sign(c) * Math.pow(Math.abs(c), p) * hw,
          Math.sign(sn) * Math.pow(Math.abs(sn), p) * hh];
      }
    }));
    B.loft(G.hard, sole, 18, { uScale: 0.4, capStart: true, capEnd: true });

    /* шнуровка: перекрёстные стежки по подъёму */
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const z = U.lerp(-M.foot * 0.08, -M.foot * 0.40, t);
      const y = U.lerp(an[1] + 0.020, soleY + 0.062, t);
      B.strap(G.hard, [
        [an[0] - 0.030, y + 0.004, z], [an[0], y + 0.012, z - 0.006], [an[0] + 0.030, y + 0.004, z]
      ], 0.006, 0.003, [0, 0, -1], bw, 0.1);
    }
  }

  /* ========================================================= БРОНЕЖИЛЕТ == */
  /* Плитник как на референсе: передняя и задняя плиты, боковые стяжки,
     ряды MOLLE, подсумки под магазины, радиостанция, нашивка подразделения.
     Плита жёсткая — она привязана к груди целиком и не деформируется. */
  function buildArmor(G, M, W, cfg) {
    const cw = W('chest', 1);
    const pad = 0.017;
    const frontZ = -(M.chestRZ + pad) - 0.014;
    const backZ = (M.chestRZ + pad) + 0.013;
    const topY = M.chestY + 0.088;
    const botY = M.waistY + 0.010;
    const halfW = M.chestRX * 0.86;

    /* Плита: изогнутая панель, повторяющая грудную клетку. */
    const plate = (z, sign, wHalf, yTop, yBot, bones, thick) => {
      const NY = 9, NX = 11;
      const grid = [[], []];
      for (const face of [0, 1]) {
        for (let j = 0; j <= NY; j++) {
          const v = j / NY;
          const y = U.lerp(yTop, yBot, v);
          const row = [];
          for (let i = 0; i <= NX; i++) {
            const u = i / NX;
            const x = U.lerp(-wHalf, wHalf, u);
            /* обхват груди: плита загибается по бокам */
            const curve = Math.pow(Math.abs(x) / wHalf, 2.0) * 0.050 * -sign;
            /* верх плиты сужен под ключицы */
            const narrow = U.clamp01((0.18 - v) / 0.18);
            const xx = x * (1 - narrow * 0.22);
            const t = (face ? -1 : 1) * thick * 0.5;
            row.push(G.gear.vertex([xx, y, z + curve + t * sign],
              [0, 0, face ? -sign : sign], [u * 0.6, v * 0.75], bones));
          }
          grid[face].push(row);
        }
      }
      for (let j = 0; j < NY; j++)
        for (let i = 0; i < NX; i++) {
          G.gear.quad(grid[0][j][i], grid[0][j][i + 1], grid[0][j + 1][i + 1], grid[0][j + 1][i]);
          G.gear.quad(grid[1][j][i], grid[1][j + 1][i], grid[1][j + 1][i + 1], grid[1][j][i + 1]);
        }
      /* кромка */
      for (let i = 0; i < NX; i++) {
        G.gear.quad(grid[0][0][i], grid[1][0][i], grid[1][0][i + 1], grid[0][0][i + 1]);
        G.gear.quad(grid[0][NY][i + 1], grid[1][NY][i + 1], grid[1][NY][i], grid[0][NY][i]);
      }
      for (let j = 0; j < NY; j++) {
        G.gear.quad(grid[0][j][0], grid[1][j][0], grid[1][j + 1][0], grid[0][j + 1][0]);
        G.gear.quad(grid[0][j + 1][NX], grid[1][j + 1][NX], grid[1][j][NX], grid[0][j][NX]);
      }
      return grid[0];
    };

    plate(frontZ, -1, halfW, topY, botY, cw, 0.022);
    plate(backZ, 1, halfW * 1.02, topY + 0.010, botY + 0.012, cw, 0.020);

    /* Плечевые лямки через трапеции. */
    for (const s of [1, -1]) {
      B.strap(G.gear, [
        [s * halfW * 0.62, topY - 0.010, frontZ - 0.004],
        [s * halfW * 0.66, M.shoulderY + 0.030, frontZ * 0.55],
        [s * halfW * 0.70, M.shoulderY + 0.052, 0.004],
        [s * halfW * 0.66, M.shoulderY + 0.028, backZ * 0.55],
        [s * halfW * 0.64, topY + 0.004, backZ + 0.004]
      ], 0.070, 0.016, [s, 0.1, 0], cw, 0.6);
    }
    /* Боковые стяжки (камербанд). */
    for (const s of [1, -1]) {
      B.strap(G.gear, [
        [s * halfW * 0.92, M.chestY - 0.030, frontZ + 0.012],
        [s * (M.chestRX + pad + 0.012), M.chestY - 0.038, 0],
        [s * halfW * 0.92, M.chestY - 0.030, backZ - 0.012]
      ], 0.115, 0.018, [0, 1, 0], cw, 0.4);
    }

    /* Подсумки под магазины: три в ряд по центру живота. */
    const pouchY = M.waistY + 0.075;
    for (let i = -1; i <= 1; i++) {
      const x = i * 0.062;
      B.roundBox(G.gear, {
        center: [x, pouchY, frontZ - 0.040], size: [0.028, 0.062, 0.028],
        radius: 0.010, seg: 3, bones: cw, uvScale: 0.35
      });
      /* клапан с липучкой */
      B.panel(G.gear, {
        origin: [x - 0.028, pouchY + 0.062, frontZ - 0.070], ex: [0.056, 0, 0], ey: [0, -0.030, -0.004],
        segX: 4, segY: 3, bow: 0.003, thickness: 0.004, soft: 0.25, bones: cw
      });
    }
    /* Радиостанция слева и аптечка справа — асимметрия оживляет силуэт. */
    B.roundBox(G.gear, {
      center: [-halfW * 0.78, M.chestY + 0.010, frontZ - 0.030], size: [0.026, 0.050, 0.020],
      radius: 0.008, seg: 3, bones: cw, uvScale: 0.3
    });
    /* антенна */
    B.strap(G.hard, [
      [-halfW * 0.78, M.chestY + 0.058, frontZ - 0.030],
      [-halfW * 0.80, M.chestY + 0.120, frontZ - 0.020],
      [-halfW * 0.82, M.chestY + 0.168, frontZ - 0.004]
    ], 0.008, 0.008, [1, 0, 0], cw, 0.2);
    B.roundBox(G.gear, {
      center: [halfW * 0.80, M.waistY + 0.045, frontZ - 0.024], size: [0.030, 0.038, 0.018],
      radius: 0.008, seg: 3, bones: cw, uvScale: 0.3
    });

    /* Ряды MOLLE: горизонтальные стропы по плите. */
    for (let r = 0; r < 4; r++) {
      const y = botY + 0.030 + r * 0.042;
      if (y > topY - 0.030) break;
      B.strap(G.gear, [
        [-halfW * 0.88, y, frontZ - 0.006], [0, y, frontZ - 0.018], [halfW * 0.88, y, frontZ - 0.006]
      ], 0.016, 0.004, [0, 1, 0], cw, 0.3);
    }

    /* Нашивка подразделения: отдельная группа, чтобы наложить эмблему. */
    return {
      patch: {
        center: [halfW * 0.30, M.chestY + 0.042, frontZ - 0.012],
        bones: cw, size: 0.052
      },
      frontZ, backZ, topY, botY, halfW
    };
  }

  /* Нашивка с эмблемой — плоская панель со своим материалом. */
  function buildPatch(buf, p, quadFlip) {
    const h = p.size * 0.5;
    B.panel(buf, {
      origin: [p.center[0] - h, p.center[1] - h, p.center[2]],
      ex: [p.size, 0, 0], ey: [0, p.size, 0],
      segX: 2, segY: 2, bow: 0.001, thickness: 0.002, soft: 0,
      bones: p.bones, uv: quadFlip ? [1, 0, 0, 1] : [0, 0, 1, 1]
    });
  }

  /* ================================================================ ШЛЕМ = */
  /* Каска типа FAST: срезанные «уши», рельса по борту, крепление НВ спереди,
     затылочный амортизатор. Строится по поверхности головы с отступом. */
  function buildHelmet(G, M, W, cfg) {
    const surf = headSurface(M, cfg);
    const bw = W('head', 1);
    const oy = M.headC;
    const shell = 0.019;                       // толщина каски над головой
    const NT = 36, NP = 16;

    /* нижний край каски зависит от азимута: сзади ниже, у ушей вырез */
    const rim = (th) => {
      const c = Math.cos(th);                  // 1 вперёд... это -Z
      const front = -Math.cos(th);
      const sideAmt = Math.abs(Math.sin(th));
      /* base: доля дуги phi, где заканчивается каска */
      let v = 0.62;
      v -= sideAmt * 0.10;                     // вырез над ушами
      v += U.clamp01(Math.cos(th)) * 0.12;     // затылок ниже
      v -= U.clamp01(-Math.cos(th)) * 0.02;    // козырёк чуть выше бровей
      return v;
    };

    const grid = [];
    for (let ip = 0; ip <= NP; ip++) {
      const row = [];
      for (let it = 0; it <= NT; it++) {
        const th = (it / NT) * TAU;
        const phiMax = rim(th) * Math.PI;
        const phi = (ip / NP) * phiMax;
        const p = surf(th, phi, shell);
        row.push(G.helmet.vertex([p[0], p[1] + oy, p[2]], norm(p), [it / NT * 0.8, ip / NP * 0.5], bw));
      }
      grid.push(row);
    }
    for (let ip = 0; ip < NP; ip++)
      for (let it = 0; it < NT; it++)
        G.helmet.quad(grid[ip][it], grid[ip][it + 1], grid[ip + 1][it + 1], grid[ip + 1][it]);

    /* внутренняя поверхность и кромка — каска не «бумажная» */
    const inner = [];
    for (let it = 0; it <= NT; it++) {
      const th = (it / NT) * TAU;
      const phiMax = rim(th) * Math.PI;
      const pOut = surf(th, phiMax, shell);
      const pIn = surf(th, phiMax, shell - 0.008);
      inner.push([
        G.helmet.vertex([pOut[0], pOut[1] + oy, pOut[2]], [0, -1, 0], [it / NT * 0.8, 0.52], bw),
        G.helmet.vertex([pIn[0], pIn[1] + oy, pIn[2]], [0, -1, 0], [it / NT * 0.8, 0.56], bw)
      ]);
    }
    for (let it = 0; it < NT; it++)
      G.helmet.quad(inner[it][0], inner[it][1], inner[it + 1][1], inner[it + 1][0]);

    /* боковые рельсы ARC */
    for (const s of [1, -1]) {
      const pts = [];
      for (let i = 0; i <= 5; i++) {
        const th = s > 0 ? U.lerp(Math.PI * 0.30, Math.PI * 0.74, i / 5) : U.lerp(-Math.PI * 0.30, -Math.PI * 0.74, i / 5);
        const p = surf(th, Math.PI * 0.50, shell + 0.005);
        pts.push([p[0], p[1] + oy, p[2]]);
      }
      B.strap(G.hard, pts, 0.020, 0.008, [0, 1, 0], bw, 0.3);
    }

    /* крепление ПНВ (шрауд) на лбу */
    const fp = surf(Math.PI, Math.PI * 0.30, shell + 0.002);
    B.roundBox(G.hard, {
      center: [0, fp[1] + oy + 0.006, fp[2] - 0.010], size: [0.024, 0.015, 0.012],
      radius: 0.004, seg: 2, bones: bw, uvScale: 0.2
    });
    /* разъём/заглушка шрауда */
    B.roundBox(G.hard, {
      center: [0, fp[1] + oy + 0.004, fp[2] - 0.026], size: [0.013, 0.010, 0.010],
      radius: 0.003, seg: 2, bones: bw, uvScale: 0.2
    });

    /* затылочный амортизатор и ремешок */
    const bp = surf(0, Math.PI * 0.62, shell);
    B.roundBox(G.gear, {
      center: [0, bp[1] + oy - 0.010, bp[2] - 0.004], size: [0.045, 0.020, 0.014],
      radius: 0.008, seg: 2, bones: bw, uvScale: 0.25
    });
    for (const s of [1, -1]) {
      const a = surf(s * Math.PI * 0.52, Math.PI * 0.52, shell);
      B.strap(G.gear, [
        [a[0], a[1] + oy, a[2]],
        [a[0] * 0.92, oy - 0.055, a[2] * 0.55],
        [a[0] * 0.55, oy - 0.085, -M.headRZ * 0.42]
      ], 0.013, 0.004, [0, 0, -1], bw, 0.2);
    }
    return { surf, oy, shell };
  }

  /* ========================================================== ПАНАМА ===== */
  /* Boonie hat снайпера с референса: мягкая тулья и широкие обвисшие поля. */
  function buildBoonie(G, M, W, cfg) {
    const surf = headSurface(M, cfg);
    const bw = W('head', 1);
    const oy = M.headC;
    const NT = 36;

    /* тулья — приплюснутый купол поверх головы */
    const crown = [];
    const NP = 10;
    for (let ip = 0; ip <= NP; ip++) {
      const row = [];
      const phi = (ip / NP) * Math.PI * 0.52;
      for (let it = 0; it <= NT; it++) {
        const th = (it / NT) * TAU;
        const p = surf(th, phi, 0.017);
        /* мягкая ткань слегка проседает по бокам */
        const sag = Math.sin(phi) * 0.004;
        row.push(G.uniform.vertex([p[0], p[1] + oy - sag, p[2]], norm(p),
          [it / NT * 0.7, ip / NP * 0.35], bw));
      }
      crown.push(row);
    }
    for (let ip = 0; ip < NP; ip++)
      for (let it = 0; it < NT; it++)
        G.uniform.quad(crown[ip][it], crown[ip][it + 1], crown[ip + 1][it + 1], crown[ip + 1][it]);

    /* поля: кольцо, расходящееся наружу и опускающееся вниз */
    const brimIn = [], brimOut = [];
    for (let it = 0; it <= NT; it++) {
      const th = (it / NT) * TAU;
      const p = surf(th, Math.PI * 0.52, 0.017);
      const dir = norm([p[0], 0, p[2]]);
      /* спереди поля чуть шире, сзади опущены сильнее */
      const wide = 0.072 + 0.014 * U.clamp01(-Math.cos(th)) - 0.006 * U.clamp01(Math.cos(th));
      const drop = 0.030 + 0.020 * U.clamp01(Math.cos(th)) + 0.008 * Math.abs(Math.sin(th));
      /* лёгкая волна края — ткань не идеальный круг */
      const wob = Math.sin(th * 3 + 0.7) * 0.004;
      brimIn.push([p[0], p[1] + oy - 0.002, p[2]]);
      brimOut.push([p[0] + dir[0] * (wide + wob), p[1] + oy - drop, p[2] + dir[2] * (wide + wob)]);
    }
    const rowsA = [], rowsB = [];
    for (const face of [1, -1]) {
      const ra = [], rb = [];
      for (let it = 0; it <= NT; it++) {
        const n = [0, face, 0];
        ra.push(G.uniform.vertex([brimIn[it][0], brimIn[it][1] + face * 0.0015, brimIn[it][2]], n, [it / NT * 0.7, 0.4], bw));
        rb.push(G.uniform.vertex([brimOut[it][0], brimOut[it][1] + face * 0.0015, brimOut[it][2]], n, [it / NT * 0.7, 0.62], bw));
      }
      rowsA.push(ra); rowsB.push(rb);
      for (let it = 0; it < NT; it++) {
        if (face > 0) G.uniform.quad(ra[it], ra[it + 1], rb[it + 1], rb[it]);
        else G.uniform.quad(ra[it], rb[it], rb[it + 1], ra[it + 1]);
      }
    }
    /* кант по краю полей */
    for (let it = 0; it < NT; it++)
      G.uniform.quad(rowsB[0][it], rowsB[0][it + 1], rowsB[1][it + 1], rowsB[1][it]);

    /* лента вокруг тульи с петлями для веток */
    const band = [];
    for (let it = 0; it <= NT; it++) {
      const th = (it / NT) * TAU;
      const p = surf(th, Math.PI * 0.44, 0.019);
      band.push([p[0], p[1] + oy, p[2]]);
    }
    for (let it = 0; it < NT; it += 2) {
      B.strap(G.gear, [band[it], band[it + 1], band[Math.min(NT, it + 2)]], 0.024, 0.004, [0, 1, 0], bw, 0.1);
    }
    return { oy };
  }

  /* ======================================================== БАЛАКЛАВА ==== */
  /* Маска закрывает нижнюю половину лица: шея, подбородок, рот, нос до
     середины. Строится как «пояс» по поверхности головы с отступом. */
  function buildBalaclava(G, M, W, cfg) {
    const surf = headSurface(M, cfg);
    const bw = W('head', 1);
    const bwn = W('head', 0.6, 'neck', 0.4);
    const oy = M.headC;
    const NT = 34;
    const off = 0.005;

    /* верхняя кромка маски: спереди под глазами, сзади выше (закрывает затылок) */
    const topPhi = (th) => {
      const front = U.clamp01(-Math.cos(th));
      const back = U.clamp01(Math.cos(th));
      return Math.PI * (0.47 + front * 0.045 + back * 0.10 + Math.abs(Math.sin(th)) * 0.02);
    };
    const NP = 9;
    const grid = [];
    for (let ip = 0; ip <= NP; ip++) {
      const row = [];
      for (let it = 0; it <= NT; it++) {
        const th = (it / NT) * TAU;
        const p0 = topPhi(th);
        const phi = U.lerp(p0, Math.PI * 0.97, ip / NP);
        const p = surf(th, phi, off);
        row.push(G.mask.vertex([p[0], p[1] + oy, p[2]], norm(p), [it / NT * 0.9, ip / NP * 0.45],
          ip > NP - 3 ? bwn : bw));
      }
      grid.push(row);
    }
    for (let ip = 0; ip < NP; ip++)
      for (let it = 0; it < NT; it++)
        G.mask.quad(grid[ip][it], grid[ip][it + 1], grid[ip + 1][it + 1], grid[ip + 1][it]);

    /* воротник маски уходит под куртку */
    const collar = [];
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      const y = U.lerp(oy - M.headRY * 0.92, M.neckY - 0.010, t);
      const r = U.lerp(M.neckR * 1.02, M.neckR * 1.20, t);
      collar.push({ c: [0, y, -0.004], rx: r, ry: r * 1.06, n: 2.3, axis: [0, -1, 0], up: [0, 0, -1],
        bones: i < 2 ? bw : W('neck', 0.7, 'chest', 0.3) });
    }
    B.loft(G.mask, collar, 18, { uScale: 0.35 });
  }

  /* ============================================================= РЕМЕНЬ == */
  function buildBelt(G, M, W, cfg) {
    const hw = W('hips', 1);
    const pad = 0.017;
    const rings = [];
    for (let i = 0; i <= 2; i++) {
      const y = M.waistY - 0.012 + i * 0.026;
      rings.push({ c: [0, y, 0], rx: M.waistRX + pad + 0.006, ry: M.waistRZ + pad + 0.006, n: 2.9,
        axis: [0, 1, 0], up: [0, 0, -1], bones: hw });
    }
    B.loft(G.gear, rings, 24, { uScale: 1.0 });
    /* пряжка */
    B.roundBox(G.hard, {
      center: [0, M.waistY + 0.001, -(M.waistRZ + pad + 0.010)], size: [0.030, 0.019, 0.007],
      radius: 0.003, seg: 2, bones: hw, uvScale: 0.2
    });
    /* набедренная платформа с пистолетной кобурой справа */
    B.roundBox(G.gear, {
      center: [M.hipX + 0.052, M.hipY - 0.095, 0.006], size: [0.030, 0.082, 0.042],
      radius: 0.012, seg: 3, bones: W('hipR', 0.8, 'hips', 0.2), uvScale: 0.35
    });
    /* стяжка кобуры к бедру */
    B.strap(G.gear, [
      [M.hipX + 0.022, M.hipY - 0.150, 0.048], [M.hipX + 0.050, M.hipY - 0.156, 0.052],
      [M.hipX + 0.078, M.hipY - 0.150, 0.030], [M.hipX + 0.078, M.hipY - 0.150, -0.030],
      [M.hipX + 0.040, M.hipY - 0.156, -0.052], [M.hipX + 0.010, M.hipY - 0.150, -0.040]
    ], 0.022, 0.005, [0, 1, 0], W('hipR', 0.9, 'hips', 0.1), 0.4);
  }

  return { GROUPS, newGroups, makeW, blendW, uvRings, buildTorso, buildNeck, buildHead,
    headSurface, sphere, buildArm, buildHand, buildLeg, buildBoot, finger,
    buildArmor, buildPatch, buildHelmet, buildBoonie, buildBalaclava, buildBelt };
});