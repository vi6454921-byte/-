
/* ==========================================================================
   МОДУЛЬ: world.js
   ========================================================================== */
/* ============================================================================
   Полигон: поляна в пасмурном сосновом лесу и стрельбище на просеке.

   Лес процедурный, но на CC0-фототекстурах (кора, подстилка, хвоя,
   папоротник, трава): стволы, кроны и подлесок — InstancedMesh, валежник
   слит в один буфер, поэтому тысячи деревьев стоят пару десятков draw
   call. Густота растёт от поляны вглубь, дымку задаёт туман в game.js.

   Мишени стоят на 5, 10, 20 и 30 метрах и падают от попадания.
   Функции домика, огорода и забора остались в модуле (экспортируются),
   но на этой карте не вызываются.
   ========================================================================== */
(function (root, factory) {
  const W = factory(root.GUtil, root.GTex);
  if (typeof module !== 'undefined' && module.exports) module.exports = W;
  else root.GWorld = W;
})(typeof self !== 'undefined' ? self : this, function (U, T) {
  'use strict';

  const TAU = Math.PI * 2;

  /* Габариты игровой зоны, м (сами границы движения — в player.js). */
  const FIELD = { x: 64, z: 74 };

  /* ------------------------------------------------ лес: внешние ассеты */
  /* CC0-фототекстуры Poly Haven (assets/env/CREDITS.md). Загрузка
     регистрируется в GAssets до старта игры; если файл не пришёл, эта часть
     мира строится на процедурной текстуре — сборка не падает. */
  const ENV_FILES = {
    bark_diff: 'bark_diff.jpg', bark_nor: 'bark_nor.jpg', bark_arm: 'bark_arm.jpg',
    floorA_diff: 'floor_a_diff.jpg', floorA_nor: 'floor_a_nor.jpg', floorA_arm: 'floor_a_arm.jpg',
    floorB_diff: 'floor_b_diff.jpg', floorB_nor: 'floor_b_nor.jpg', floorB_arm: 'floor_b_arm.jpg',
    deadwood: 'deadwood_diff.jpg', spray: 'pine_spray.webp', fern: 'fern_frond.webp', tufts: 'grass_tufts.webp',
    /* v6: третий слой подстилки (Forest Ground 03) и карты высот — в канале B у ARM всех трёх слоёв */
    floorC_diff: 'floor_c_diff.jpg', floorC_nor: 'floor_c_nor.jpg', floorC_arm: 'floor_c_arm.jpg'
  };
  const GA = (typeof self !== 'undefined' && self.GAssets) || null;
  if (GA && typeof createImageBitmap === 'function') {
    for (const k of Object.keys(ENV_FILES)) {
      /* premultiplyAlpha/colorSpaceConversion 'none': карты нормалей и
         альфа-карточки должны прийти в GPU байт в байт */
      GA.add('env_' + k, GA.fetchAny('assets/env/' + ENV_FILES[k], 'blob').then((b) =>
        (GA.bitmap || createImageBitmap)(b, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })));
    }
  }
  /* Текстуры стрельбища встроены прямо в html (webp в base64; Poly Haven,
     CC0): грязь, доски, ржавое железо, крашеный металл, жесть табличек,
     мшистый камень, старое дерево. Регистрируются как обычные env_*. */
  const EMB = (typeof self !== 'undefined' && self.__ENV_EMB) || null;
  if (GA && EMB && typeof createImageBitmap === 'function') {
    for (const k of Object.keys(EMB)) {
      GA.add('env_' + k, Promise.resolve().then(() => {
        const s = atob(EMB[k]), u8 = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
        return createImageBitmap(new Blob([u8], { type: 'image/webp' }),
          { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      }));
    }
  }
  const _texCache = {};
  function envTex(THREE, key, srgb, aniso) {
    const bmp = GA && GA.data['env_' + key];
    if (!bmp) return null;
    const t = (globalThis.GGPUCache&&globalThis.GGPUCache.texture(THREE,key,srgb))||new THREE.Texture(bmp);
    t.flipY = false;                 // ImageBitmap уже перевёрнут при декодировании
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso || 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }
  function canvasTex(THREE, cv, srgb) {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* Бесшовный value-шум (RGBA — четыре независимых поля) для смешивания
     слоёв грунта. Периоды решётки делят размер нацело, поэтому тайл
     повторяется без шва. */
  function noiseTexture(THREE, size) {
    const data = new Uint8Array(size * size * 4);
    const rnd = U.rng(4242);
    const sm = (t) => t * t * (3 - 2 * t);
    for (let c = 0; c < 4; c++) {
      const acc = new Float32Array(size * size);
      let amp = 1;
      for (const P of [4, 8, 16, 32, 64]) {
        const lat = new Float32Array(P * P);
        for (let i = 0; i < lat.length; i++) lat[i] = rnd();
        const cell = size / P;
        for (let y = 0; y < size; y++) {
          const fy = y / cell, iy = Math.floor(fy), ty = sm(fy - iy);
          const y0 = (iy % P) * P, y1 = ((iy + 1) % P) * P;
          for (let x = 0; x < size; x++) {
            const fx = x / cell, ix = Math.floor(fx), tx = sm(fx - ix);
            const x0 = ix % P, x1 = (ix + 1) % P;
            const a = lat[y0 + x0] + (lat[y0 + x1] - lat[y0 + x0]) * tx;
            const b = lat[y1 + x0] + (lat[y1 + x1] - lat[y1 + x0]) * tx;
            acc[y * size + x] += amp * (a + (b - a) * ty);
          }
        }
        amp *= 0.55;
      }
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < acc.length; i++) { lo = Math.min(lo, acc[i]); hi = Math.max(hi, acc[i]); }
      for (let i = 0; i < acc.length; i++) data[i * 4 + c] = Math.round((acc[i] - lo) / (hi - lo) * 255);
    }
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  }

  /* --------------------------------------------- построитель геометрии */
  /* Минимальный накопитель вершин: трубки (стволы, ветки), полосы
     (карточки хвои) и крышки. Всё пишется сразу в итоговые массивы, чтобы
     сотни веток сливались в один буфер = один draw call. */
  function Geo() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; }
  Geo.prototype.vert = function (p, n, uv, c) {
    this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]);
    this.u.push(uv[0], uv[1]); this.c.push(c[0], c[1], c[2]);
    return this.p.length / 3 - 1;
  };
  Geo.prototype.tube = function (pts, radii, seg, o) {
    o = o || {};
    const n = pts.length, base = this.p.length / 3;
    const dAll = v3norm(v3sub(pts[n - 1], pts[0]));
    const ref = Math.abs(dAll[1]) > 0.7 ? [1, 0, 0] : [0, 1, 0];
    let vAcc = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const t = v3norm(v3sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
      const nx = v3norm(v3cross(ref, t)), ny = v3cross(t, nx);
      if (i > 0) vAcc += v3len(v3sub(p, pts[i - 1]));
      const col = o.col ? o.col(i / (n - 1), p) : [1, 1, 1];
      for (let j = 0; j <= seg; j++) {
        const ang = (j / seg) * TAU, cs = Math.cos(ang), sn = Math.sin(ang);
        const d = [nx[0] * cs + ny[0] * sn, nx[1] * cs + ny[1] * sn, nx[2] * cs + ny[2] * sn];
        const r = radii[i] * (o.bump ? 1 + o.bump(i, j % seg) : 1);
        this.vert([p[0] + d[0] * r, p[1] + d[1] * r, p[2] + d[2] * r], d,
          [(j / seg) * (o.uRep || 1) + (o.u0 || 0), vAcc / (o.vScale || 1) + (o.v0 || 0)], col);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < seg; j++) {
        const a = base + i * (seg + 1) + j, b = a + seg + 1;
        this.i.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  };
  Geo.prototype.cap = function (c, nrm, r, seg, col) {
    const ref = Math.abs(nrm[1]) > 0.7 ? [1, 0, 0] : [0, 1, 0];
    const nx = v3norm(v3cross(ref, nrm)), ny = v3cross(nrm, nx);
    const ci = this.vert(c, nrm, [0.5, 0.5], col);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * TAU, cs = Math.cos(a), sn = Math.sin(a);
      this.vert([c[0] + (nx[0] * cs + ny[0] * sn) * r, c[1] + (nx[1] * cs + ny[1] * sn) * r, c[2] + (nx[2] * cs + ny[2] * sn) * r],
        nrm, [0.5 + cs * 0.25, 0.5 + sn * 0.25], col);
    }
    for (let j = 0; j < seg; j++) this.i.push(ci, ci + 1 + j, ci + 2 + j);
  };
  /* Полоса-карточка вдоль оси axis; side — боковой вектор в каждой точке. */
  Geo.prototype.strip = function (axis, side, width, nrm, col, uAlong) {
    const base = this.p.length / 3, n = axis.length;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1), w = width[k] * 0.5, s = side[k], p = axis[k];
      const c = col ? col(t) : [1, 1, 1], nn = nrm[k] || nrm[0];
      const uv0 = uAlong ? [t, 0] : [0, t], uv1 = uAlong ? [t, 1] : [1, t];
      this.vert([p[0] - s[0] * w, p[1] - s[1] * w, p[2] - s[2] * w], nn, uv0, c);
      this.vert([p[0] + s[0] * w, p[1] + s[1] * w, p[2] + s[2] * w], nn, uv1, c);
    }
    for (let k = 0; k < n - 1; k++) {
      const a = base + k * 2;
      this.i.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  };
  Geo.prototype.build = function (THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  };
  const v3sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const v3add = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const v3len = (a) => Math.hypot(a[0], a[1], a[2]);
  const v3norm = (a) => { const l = v3len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const v3cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const smooth01 = (t) => { t = U.clamp01(t); return t * t * (3 - 2 * t); };

  /* ------------------------------------------------------ планировка */
  /* Строй бойцов стоит на поляне (эллипс с «рваным» краем), от огневого
     рубежа на -Z уходит просека стрельбища. Ни одно дерево не ближе 6 м к
     шеренге и не стоит в секторе огня. Рельеф на поляне и просеке ровный,
     в лесу — пологие волны. */
  const SQUAD_LINE = { x0: -8.2, x1: 4.2, z: 1.2 };
  const CLEARING = { x: 0, z: 3.2, rx: 12.5, rz: 10.5 };
  /* Воронки от разрывов (центр, радиус, глубина, м); в части из них стоит
     мутная вода. Колея грунтовки заходит на поляну с северо-запада.
     Пулеулавливающий вал за мишенями — земляной гребень прямо в рельефе. */
  const CRATERS = [
    { x: -14.5, z: -6.5, R: 3.3, D: 0.80, water: true },
    { x: -14.0, z: 14.0, R: 2.7, D: 0.62 },
    { x: 16.0, z: -13.5, R: 3.6, D: 0.85, water: true },
    { x: 17.5, z: 14.5, R: 2.9, D: 0.66, water: true },
    { x: -21.0, z: 8.5, R: 3.1, D: 0.72 },
    { x: -2.0, z: -17.5, R: 2.8, D: 0.62, water: true },
    { x: 21.5, z: -1.5, R: 3.4, D: 0.80 },
    { x: -9.0, z: -25.5, R: 3.0, D: 0.70, water: true },
    { x: 18.5, z: -31.0, R: 3.2, D: 0.75 }
  ];
  const TRACK = [[-1.5, 6.5], [-4.5, 10.5], [-8.5, 15], [-12.5, 21], [-15, 28], [-19, 36], [-26, 45],
    [-36, 56], [-48, 68], [-62, 80]];
  const BERM = { x: 5.5, z: -25.6, hx: 9.5, hz: 3.3, h: 2.6 };
  /* v7: старая оплывшая траншея (ломаная с траверсами через ~4 м), за ней —
     блиндаж. За 80 лет стенки оплыли до глубины 0,6–0,8 м, бруствер осел. */
  const TRENCH = (() => {
    const A = [-26, 13], B = [-6, 27], n = 6, pts = [];
    const ex = B[0] - A[0], ez = B[1] - A[1], L = Math.hypot(ex, ez), nx = -ez / L, nz = ex / L;
    for (let i = 0; i <= n; i++) {
      const t = i / n, o = (i % 2 ? 1 : -1) * 0.85 * (i === 0 || i === n ? 0.3 : 1);
      pts.push([A[0] + ex * t + nx * o, A[1] + ez * t + nz * o]);
    }
    return { pts, nx, nz, dug: [A[0] + ex * 0.36 - nx * 3.6, A[1] + ez * 0.36 - nz * 3.6, Math.atan2(ex, ez)] };
  })();
  function forestLayout() {
    const edge = U.fbm(515, 3, 0.5, 2.1);
    const hA = U.fbm(909, 4, 0.5, 2.2), hB = U.fbm(313, 3, 0.5, 2.0), hC = U.fbm(4141, 3, 0.5, 2.1);
    const clearE = (x, z) => {
      const ex = (x - CLEARING.x) / CLEARING.rx, ez = (z - CLEARING.z) / CLEARING.rz;
      return Math.hypot(ex, ez) * (1 + (edge(x * 0.09 + 3, z * 0.09 + 7) - 0.5) * 0.35);
    };
    /* > 0 — снаружи просеки (прямоугольник от рубежа до вала) */
    const laneD = (x, z) => {
      const dx = Math.abs(x - FIRE_LINE.x) - 3.6;
      const dz = Math.max(z - (FIRE_LINE.z + 2.5), (FIRE_LINE.z - 37) - z);
      return Math.max(dx, dz);
    };
    const squadD = (x, z) => Math.hypot(x - U.clamp(x, SQUAD_LINE.x0, SQUAD_LINE.x1), z - SQUAD_LINE.z);
    const baseH = (x, z) => {
      const k = Math.min(U.clamp01((clearE(x, z) - 1.0) * 1.6), U.clamp01((laneD(x, z) - 1.0) / 6));
      if (k <= 0) return 0;
      return ((hA(x * 0.028 + 10, z * 0.028 + 4) - 0.5) * 2.4 + (hB(x * 0.09, z * 0.09) - 0.5) * 0.35) * k;
    };
    for (const c of CRATERS) c.h0 = baseH(c.x, c.z);
    /* расстояние до оси колеи; trS — путь вдоль неё до ближайшей точки */
    let trS = 0;
    const trackD = (x, z) => {
      let best = Infinity, acc = 0;
      for (let i = 0; i < TRACK.length - 1; i++) {
        const a = TRACK[i], b = TRACK[i + 1];
        const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez, L = Math.sqrt(L2);
        const t = U.clamp01(((x - a[0]) * ex + (z - a[1]) * ez) / L2);
        const d = Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t);
        if (d < best) { best = d; trS = acc + t * L; }
        acc += L;
      }
      return best;
    };
    const craterD = (x, z) => {
      let m = Infinity;
      for (const c of CRATERS) m = Math.min(m, Math.hypot(x - c.x, z - c.z) / c.R);
      return m;
    };
    const bermH = (x, z) => {
      const dx = Math.abs(x - BERM.x), dz = Math.abs(z - BERM.z);
      if (dx > BERM.hx || dz > BERM.hz) return 0;
      const kx = smooth01((BERM.hx - dx) / 2.6), kz = smooth01((BERM.hz - dz) / 2.5), f = kx * kz;
      /* v26: вал не гладкий «пирог»: на склонах — промоины от дождей (гребни
         ridged-шума вдоль ската, ~2 м между ними — сетка их ещё держит),
         по всему телу — комья и осыпи. Перед мишенями, где бревенчатая
         стенка, промоин меньше. Всё — в рельефе: в кадре ни треугольника. */
      const sz = kz * (1 - kz) * 4 * kx, sx = kx * (1 - kx) * 4 * kz;
      const rz = 1 - Math.abs(2 * hC(x * 0.5 + 11, z * 0.16 + 3) - 1), rx = 1 - Math.abs(2 * hC(z * 0.5 + 7, x * 0.16 + 13) - 1);
      const front = z > BERM.z && Math.abs(x - FIRE_LINE.x) < 5 ? 0.35 : 1;
      const gully = 0.16 * front * (sz * rz * rz * rz + sx * rx * rx * rx);
      const lumps = (hC(x * 1.3 + 2, z * 1.3 + 5) - 0.5) * 0.1 * Math.min(1, f * 3);
      return f * (BERM.h + (hB(x * 0.45 + 3, z * 0.45) - 0.5) * 0.6) - gully + lumps;
    };
    const heightAt = (x, z) => {
      let h = baseH(x, z);
      /* кочки и вмятины — везде, кроме просеки и места строя */
      const mk = Math.min(smooth01((laneD(x, z) - 0.3) / 2.5), smooth01((squadD(x, z) - 1.6) / 2.5));
      if (mk > 0) h += (hC(x * 0.35 + 5, z * 0.35 + 9) - 0.5) * 0.16 * mk;
      h += bermH(x, z);
      for (const c of CRATERS) {
        const dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz;
        if (d2 > c.R * c.R * 3.0) continue;
        const r = Math.sqrt(d2) / c.R;
        h += (c.h0 - h) * smooth01((1.7 - r) / 0.7);
        if (r < 1) { const q = 1 - r * r; h -= c.D * q * q; }
        h += c.D * 0.3 * Math.exp(-(r - 1.02) * (r - 1.02) / 0.075) * (0.7 + 0.6 * hC(dx * 0.9 + 17, dz * 0.9 + 3));
      }
      const td = trackD(x, z);
      if (td < 3.2) {
        const ru = td - 0.8;
        h -= smooth01(trS / 5) * (0.05 * smooth01((3.2 - td) / 1.6) + 0.075 * Math.exp(-ru * ru / 0.045));
      }
      return h;
    };
    /* v7: расстояние до оси траншеи */
    const trenchD = (x, z) => {
      const P = TRENCH.pts; let best = Infinity;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1], ex = b[0] - a[0], ez = b[1] - a[1];
        const t = U.clamp01(((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez));
        best = Math.min(best, Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t));
      }
      return best;
    };
    const heightAt0 = heightAt;
    const heightAtT = (x, z) => {
      let h = heightAt0(x, z);
      const P = TRENCH.pts;
      if (x < P[0][0] - 3 || x > P[P.length - 1][0] + 3 || z < P[0][1] - 3 || z > P[P.length - 1][1] + 3) return h;
      const d = trenchD(x, z);
      if (d > 2.4) return h;
      /* у колеи траншею засыпали при проезде техники */
      const fill = smooth01((trackD(x, z) - 1.6) / 1.8);
      const cut = 0.72 * (1 - smooth01((d - 0.45) / 0.75));
      const parapet = 0.2 * Math.exp(-(d - 1.55) * (d - 1.55) / 0.18);
      return h + (parapet - cut) * fill;
    };
    /* ------------------------------------------------ v8: новые зоны ---
       Овраг с ручьём (с востока, из-за минного поля, через юго-восток на юг),
       болотистая низина на юго-западе, гарь вокруг старой воронки на
       северо-востоке, вырубка на западе. Всё — в рельефе (heightAt), вода —
       там, где грунт ниже уровня (waterAt): ручей, болотные окна. */
    const ZN = U.fbm(8181, 3, 0.5, 2.1), ZN2 = U.fbm(2727, 2, 0.5, 2.0);
    const RV = { pts: [[54, -3], [41, -6.5], [32.5, -10], [26.8, -15.5], [24, -23], [24.3, -30.5], [26.6, -39.5], [30, -52], [33.5, -66]], W: 4.4, D: 2.1 };
    const rvL = [0];
    for (let i = 0; i < RV.pts.length - 1; i++) rvL.push(rvL[i] + Math.hypot(RV.pts[i + 1][0] - RV.pts[i][0], RV.pts[i + 1][1] - RV.pts[i][1]));
    RV.len = rvL[rvL.length - 1];
    let rvS = 0;
    const ravineD = (x, z) => {
      if (x < 15 || x > 62 || z < -74 || z > 6) return 99;
      let best = 99;
      for (let i = 0; i < RV.pts.length - 1; i++) {
        const a = RV.pts[i], b = RV.pts[i + 1], ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez;
        const t = U.clamp01(((x - a[0]) * ex + (z - a[1]) * ez) / L2);
        const d = Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t);
        if (d < best) { best = d; rvS = rvL[i] + t * Math.sqrt(L2); }
      }
      return best;
    };
    const rvAxis = (s) => {
      for (let i = 0; i < RV.pts.length - 1; i++) {
        if (s <= rvL[i + 1] || i === RV.pts.length - 2) {
          const a = RV.pts[i], b = RV.pts[i + 1], t = U.clamp01((s - rvL[i]) / (rvL[i + 1] - rvL[i]));
          return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[0] - a[0], b[1] - a[1])];
        }
      }
      return RV.pts[0];
    };
    /* дно: от рельефа по оси (сглажено), вниз по течению только опускается */
    const RVN = Math.ceil(RV.len) + 1, rvB = new Float32Array(RVN);
    {
      const raw = new Float32Array(RVN);
      for (let i = 0; i < RVN; i++) {
        const q = rvAxis(i);
        let m = Infinity;
        for (const o of [-2.5, 0, 2.5]) m = Math.min(m, heightAtT(q[0] + Math.cos(q[2]) * o, q[1] - Math.sin(q[2]) * o));
        raw[i] = m;
      }
      for (let i = 0; i < RVN; i++) {
        let acc = 0, n = 0;
        for (let k = -6; k <= 6; k++) { const j = Math.min(RVN - 1, Math.max(0, i + k)); acc += raw[j]; n++; }
        rvB[i] = acc / n - RV.D;
      }
      for (let i = 1; i < RVN; i++) rvB[i] = Math.min(rvB[i], rvB[i - 1] - 0.006);
    }
    const rvBed = (s) => { const f = U.clamp(s, 0, RVN - 1.001), i = Math.floor(f), t = f - i; return rvB[i] + (rvB[Math.min(RVN - 1, i + 1)] - rvB[i]) * t; };
    RV.bed = rvBed; RV.axis = rvAxis;
    const rvW = (s) => RV.W * (0.82 + 0.36 * ZN(s * 0.045 + 3, 1.7));
    /* болотистая низина */
    const SW = { x: -30, z: -34, rx: 13.5, rz: 10.5 };
    SW.L = Math.min(heightAtT(SW.x, SW.z), heightAtT(SW.x + 6, SW.z + 4), heightAtT(SW.x - 3, SW.z + 6)) - 0.3;
    const swampE = (x, z) => {
      if (x > -10 || z > -16) return 9;
      return Math.hypot((x - SW.x) / SW.rx, (z - SW.z) / SW.rz) * (1 + (ZN2(x * 0.06 + 4, z * 0.06 + 1) - 0.5) * 0.45);
    };
    /* гарь и вырубка */
    const BURN = { x: 19, z: 18.5, r: 8.5 };
    const burnAt = (x, z) => {
      const d = Math.hypot(x - BURN.x, z - BURN.z) / BURN.r * (1 + (ZN(x * 0.12 + 9, z * 0.12) - 0.5) * 0.6);
      return U.clamp01((1.05 - d) / 0.3);
    };
    const LOGC = { x: -22.5, z: -1.2, r: 5.8 };
    const heightAtZ = (x, z) => {
      let h = heightAtT(x, z);
      const d = ravineD(x, z);
      if (d < 7.5) {
        const s = rvS, W = rvW(s), r = d / W;
        if (r < 1) {
          const b = rvBed(s);
          const bed = d < 0.75 ? b - 0.09 * (1 - (d / 0.75) * (d / 0.75)) : b + (d - 0.75) * 0.13 + 0.035 * (ZN(x * 1.3, z * 1.3) - 0.5);
          const f = r < 0.2 ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * (r - 0.2) / 0.8);
          let hh = h + (bed - h) * f;
          /* подмытые, неровные бровки */
          hh += (ZN(x * 0.32 + 5, z * 0.32) - 0.5) * 0.5 * f * (1 - f) * 4 * (r > 0.25 ? 1 : 0);
          h = Math.min(h, hh);
        }
      }
      const e = swampE(x, z);
      if (e < 1.3) {
        const k = smooth01((1.3 - e) / 0.5);
        const n = ZN(x * 0.21 + 2, z * 0.21 + 8), n2 = ZN2(x * 0.9, z * 0.9);
        let g = SW.L + 0.07 + (n2 - 0.5) * 0.12;
        g -= 0.3 * smooth01((n - 0.47) / 0.1);                      // окна воды
        g += 0.18 * smooth01((0.4 - n) / 0.12) * (0.6 + 0.8 * n2);   // кочкарник
        h += (Math.min(h, g + 0.25) - h) * k;
        h += (g - h) * k * 0.85;
      }
      return h;
    };
    /* уровень воды (или null): ручей и болотные окна */
    const waterAt = (x, z) => {
      const d = ravineD(x, z);
      if (d < 2.4) { const lv = rvBed(rvS) + 0.05; if (heightAtZ(x, z) < lv) return lv; }
      if (swampE(x, z) < 1.3 && heightAtZ(x, z) < SW.L) return SW.L;
      return null;
    };
    const zoneNoTree = (x, z) => ravineD(x, z) < 2.3 || (swampE(x, z) < 1.25 && heightAtZ(x, z) < SW.L + 0.08);
    const noTree = [
      { x0: BERM.x - BERM.hx - 1.5, x1: BERM.x + BERM.hx + 1.5, z0: BERM.z - BERM.hz - 1.5, z1: BERM.z + BERM.hz + 1.6 },
      { x: 11.6, z: 9.8, r: 1.6 }, { x: 11.1, z: 6.9, r: 1.6 }, { x: 9.7, z: 9.9, r: 1.0 },
      { x: -6.95, z: -1.3, r: 1.4 }, { x: 2.55, z: -1.3, r: 1.4 }, { x: -8.2, z: 1.2, r: 1.2 }, { x: -2, z: 10.2, r: 1.2 }
    ];
    for (const p of TRENCH.pts) noTree.push({ x: p[0], z: p[1], r: 1.5 });
    noTree.push({ x: TRENCH.dug[0], z: TRENCH.dug[1], r: 3.2 });
    noTree.push({ fn: zoneNoTree });
    return { clearE, laneD, squadD, heightAt: heightAtZ, craterD, trackD, trenchD, CRATERS, TRACK, BERM, TRENCH, noTree,
      RV, ravineD, ravineS: () => rvS, SW, swampE, BURN, burnAt, LOGC, waterAt, zoneNoTree };
  }

  /* v8: аналитические «тела» для трассера пуль: вертикальные цилиндры,
     повёрнутые боксы, сферы. Без рейкаста по мешам — дёшево для сотен
     объектов. Попадание отдаёт userData: mat ('wood'|'metal'|'sand'|'rock'|
     'ground'), tree (для щепы и хвои), onHit(hit, dir, shooter). */
  function makeHitProxies(THREE, scene) {
    const items = [], grp = new THREE.Group();
    grp.name = 'v8props';
    const CELL = 6, grid = new Map(), key = (i, j) => (i + 512) * 1024 + (j + 512);
    const put = (it) => {
      items.push(it);
      const i0 = Math.floor((it.cx - it.br) / CELL), i1 = Math.floor((it.cx + it.br) / CELL);
      const j0 = Math.floor((it.cz - it.br) / CELL), j1 = Math.floor((it.cz + it.br) / CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(it);
      }
      return it;
    };
    const proxyObj = (ud, name) => { const o = new THREE.Object3D(); o.name = name || 'v8prop'; Object.assign(o.userData, ud); return o; };
    const _n = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3();
    grp.cyl = (x, y0, z, r, h, ud) => put({ t: 0, cx: x, cz: z, y0, h, r, br: r, obj: proxyObj(ud, ud && ud.name) });
    grp.box = (x, y, z, hx, hy, hz, ry, ud) => put({ t: 1, cx: x, cy: y, cz: z, hx, hy, hz, c: Math.cos(ry || 0), s: Math.sin(ry || 0), br: Math.hypot(hx, hz), obj: proxyObj(ud, ud && ud.name) });
    grp.sph = (x, y, z, r, ud) => put({ t: 2, cx: x, cy: y, cz: z, r, br: r, obj: proxyObj(ud, ud && ud.name) });
    grp.items = items;
    grp.remove = (it) => {
      for (const l of grid.values()) { const i = l.indexOf(it); if (i >= 0) l.splice(i, 1); }
      const i = items.indexOf(it); if (i >= 0) items.splice(i, 1);
    };
    grp.move = (it, x, y, z) => { /* лёгкие предметы (каски): обновить позицию в сетке */
      grp.remove(it);
      it.cx = x; it.cz = z; if (it.cy !== undefined) it.cy = y; else it.y0 = y;
      put(it);
    };
    function hitIt(it, o, d, near, far, out) {
      if (it.t === 0) {
        const ox = o.x - it.cx, oz = o.z - it.cz, A = d.x * d.x + d.z * d.z;
        if (A < 1e-9) return;
        const B = 2 * (ox * d.x + oz * d.z), C = ox * ox + oz * oz - it.r * it.r, D = B * B - 4 * A * C;
        if (D < 0) return;
        const t = (-B - Math.sqrt(D)) / (2 * A);
        if (t < near || t > far) return;
        const y = o.y + d.y * t;
        if (y < it.y0 || y > it.y0 + it.h) return;
        const px = o.x + d.x * t, pz = o.z + d.z * t;
        out.push({ exitDistance: (-B + Math.sqrt(D)) / (2 * A), distance: t, point: new THREE.Vector3(px, y, pz), object: it.obj, tree: it.obj.userData.tree,
          face: { a: 0, b: 0, c: 0, normal: new THREE.Vector3(px - it.cx, 0, pz - it.cz).normalize(), materialIndex: 0 } });
      } else if (it.t === 1) {
        /* в локальные оси бокса (поворот вокруг Y) */
        const rx = o.x - it.cx, rz = o.z - it.cz;
        _o.set(rx * it.c - rz * it.s, o.y - it.cy, rx * it.s + rz * it.c);
        _d.set(d.x * it.c - d.z * it.s, d.y, d.x * it.s + d.z * it.c);
        let t0 = -Infinity, t1 = Infinity, ax = -1, sg = 1;
        const H = [it.hx, it.hy, it.hz], Oa = [_o.x, _o.y, _o.z], Da = [_d.x, _d.y, _d.z];
        for (let k = 0; k < 3; k++) {
          if (Math.abs(Da[k]) < 1e-9) { if (Math.abs(Oa[k]) > H[k]) return; continue; }
          let a = (-H[k] - Oa[k]) / Da[k], b = (H[k] - Oa[k]) / Da[k], s0 = -1;
          if (a > b) { const tt = a; a = b; b = tt; s0 = 1; }
          if (a > t0) { t0 = a; ax = k; sg = s0; }
          if (b < t1) t1 = b;
          if (t0 > t1) return;
        }
        if (t0 < near || t0 > far || ax < 0) return;
        _n.set(0, 0, 0); _n.setComponent(ax, sg);
        /* нормаль обратно в мир */
        const nx = _n.x * it.c + _n.z * it.s, nz = -_n.x * it.s + _n.z * it.c;
        out.push({ exitDistance: t1, distance: t0, point: new THREE.Vector3(o.x + d.x * t0, o.y + d.y * t0, o.z + d.z * t0), object: it.obj,
          face: { a: 0, b: 0, c: 0, normal: new THREE.Vector3(nx, _n.y, nz), materialIndex: 0 } });
      } else {
        const ox = o.x - it.cx, oy = o.y - it.cy, oz = o.z - it.cz;
        const B = ox * d.x + oy * d.y + oz * d.z, C = ox * ox + oy * oy + oz * oz - it.r * it.r, D = B * B - C;
        if (D < 0) return;
        const t = -B - Math.sqrt(D);
        if (t < near || t > far) return;
        const p = new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
        out.push({ exitDistance: -B + Math.sqrt(D), distance: t, point: p, object: it.obj,
          face: { a: 0, b: 0, c: 0, normal: new THREE.Vector3(p.x - it.cx, p.y - it.cy, p.z - it.cz).normalize(), materialIndex: 0 } });
      }
    }
    const seen = new Set();
    grp.raycast = function (raycaster, out) {
      if (!items.length) return;
      const o = raycaster.ray.origin, d = raycaster.ray.direction;
      const far = Math.min(raycaster.far, 200), near = raycaster.near;
      const x1 = o.x + d.x * far, z1 = o.z + d.z * far;
      const i0 = Math.floor(Math.min(o.x, x1) / CELL), i1 = Math.floor(Math.max(o.x, x1) / CELL);
      const j0 = Math.floor(Math.min(o.z, z1) / CELL), j1 = Math.floor(Math.max(o.z, z1) / CELL);
      if ((i1 - i0 + 1) * (j1 - j0 + 1) > 400) return;
      seen.clear();
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const l = grid.get(key(i, j));
        if (l) for (const it of l) { if (seen.has(it)) continue; seen.add(it); hitIt(it, o, d, near, far, out); }
      }
    };
    scene.add(grp);
    return grp;
  }

  function build(THREE, scene) {
    const api = {
      colliders: [],      // {type:'box'|'cyl', ...} — препятствия для игрока
      targets: [],        // мишени стрельбища
      hitboxes: [],       // цели для пуль (мишени + статика)
      update: null,
      _noGrass: []        // зоны без подлеска (рубеж, мишени, вал)
    };
    const F = forestLayout();
    api.heightAt = F.heightAt;
    api.layout = F;
    /* v8: вода ручья и болота; аналитические мишени для пуль (v8props) */
    api.waterAt = F.waterAt;
    api.v8props = makeHitProxies(THREE, scene);
    api.envTex = (key, srgb, aniso) => envTex(THREE, key, srgb, aniso);
    api._noGrass.push({ fn: F.zoneNoTree });
    for (const c of F.CRATERS) if (c.water) api._noGrass.push({ x: c.x, z: c.z, r: c.R * 0.78 });
    const M = forestMaterials(THREE);
    api.grassMat = M.grass;           // игра двигает uTime ветра через него
    api.env = M.env;                  // v6: общий ветер, следы, взрывные волны
    api.windTime = M.windTime;
    buildGround(THREE, scene, api, F, M);
    buildRange(THREE, scene, api, F, M);
    const trees = scatterTrees(F);
    api.trees = trees;
    if (api.fillCrown) api.fillCrown(trees);
    buildTrees(THREE, scene, api, F, M, trees);
    try { buildRocks(THREE, scene, api, F, trees); } catch (e) { console.warn('rocks:', e && e.message); }
    try { buildMinefield(THREE, scene, api, F, trees); } catch (e) { console.warn('minefield:', e && e.message, e && e.stack); }
    buildDeadwood(THREE, scene, api, F, M, trees);
    buildUndergrowth(THREE, scene, api, F, M, trees);
    try { buildDetails(THREE, scene, api, F, M, trees); } catch (e) { console.warn('details:', e && e.message, e && e.stack); }
    return api;
  }

  /* ------------------------------------------- v6: общий ветер и следы ---
     Одна карта порывов на всё живое (трава, папоротник, подрост, кроны):
     бесшовный шум 128² прокручивается по направлению ветра, поэтому порыв
     идёт по поляне волной и наклоняет траву, кусты и кроны согласованно
     (как глобальная wind-map в Ghost of Tsushima, GDC 2021).
     Карта следов (256², 0,5 м/тексель на 128 × 128 м): RG — куда примята
     растительность, B — насколько, A — срезано пулями. Бойцы «рисуют» в неё
     каждый кадр, примятость медленно отходит (~25 с) — остаётся тропа.
     uBlast — до 4 взрывных волн (кольцо идёт ~55 м/с, за ним — затухающее
     раскачивание), uShake — до 4 «встряхнутых» попаданием деревьев. */
  const WIND_GLSL = `
    uniform sampler2D tWind, tTrample;
    uniform vec2 uWindDir;
    uniform float uWindStr;
    uniform vec4 uBlast[4];
    uniform vec4 uShake[4];
    uniform float uBladeR;
    float fwGust(vec2 p, float t) {
      float g = texture2D(tWind, p * 0.021 - uWindDir * t * 0.07).r;
      float g2 = texture2D(tWind, p * 0.093 - uWindDir * t * 0.26 + 0.37).g;
      return smoothstep(0.32, 0.78, g) * 0.9 + (g2 - 0.5) * 0.35;
    }
    /* смещение (мир) точки на высоте h над корнем */
    vec3 fwWind(vec3 org, float h, float t, float flutter) {
      float g = fwGust(org.xz, t);
      float ph = dot(org.xz, vec2(0.37, 0.29));
      float sw = sin(t * 1.25 + ph) * 0.6 + 0.4 * sin(t * 2.9 + ph * 1.7 + flutter * 3.0);
      vec2 perp = vec2(-uWindDir.y, uWindDir.x);
      vec2 d = uWindDir * (0.3 + g) + (uWindDir * 0.55 + perp * 0.45) * sw * (0.25 + 0.55 * max(g, 0.0));
      d += perp * sin(t * 7.0 + ph * 5.0 + flutter * 11.0) * 0.12 * flutter * (0.4 + g);
      return vec3(d.x, 0.0, d.y) * (h * uWindStr);
    }
    vec3 fwBlast(vec3 org, float h, float t) {
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 4; i++) {
        vec4 b = uBlast[i];
        float age = t - b.z;
        if (b.w <= 0.0 || age < 0.0 || age > 5.0) continue;
        vec2 dv = org.xz - b.xy;
        float dist = length(dv) + 1e-3;
        float r = age * 55.0;
        float x = (dist - r) / 2.4;
        float front = exp(-x * x);
        float after = step(dist, r) * exp(-age * 1.4) * sin(age * 8.0 - dist * 0.45) * 0.45;
        acc.xz += dv / dist * b.w * (front + after) / (1.0 + dist * 0.16);
      }
      return acc * h;
    }
    vec3 fwShake(vec3 org, float h, float t) {
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 4; i++) {
        vec4 s = uShake[i];
        float age = t - s.z;
        if (s.w <= 0.0 || age < 0.0 || age > 4.0) continue;
        float k = 1.0 - smoothstep(0.4, 1.2, length(org.xz - s.xy));
        acc += vec3(sin(age * 13.0), 0.0, cos(age * 10.0 + 1.0)) * s.w * k * exp(-age * 2.2);
      }
      return acc * h;
    }
    vec4 fwTrample(vec2 xz) { return texture2D(tTrample, (xz + 64.0) / 128.0); }
  `;
  let FENV = null;
  function forestEnv(THREE, windTime) {
    const N = 256, data = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) { data[i * 4] = 128; data[i * 4 + 1] = 128; }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    const wind = noiseTexture(THREE, 128);
    const v4 = () => [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0));
    const uniforms = {
      tWind: { value: wind }, tTrample: { value: tex },
      uWindDir: { value: new THREE.Vector2(0.82, 0.57).normalize() }, uWindStr: { value: 1 },
      uBlast: { value: v4() }, uShake: { value: v4() }, uBladeR: { value: 0 }
    };
    /* «живые» тексели, которые ещё отходят: незачем гонять все 65 тыс. */
    const live = new Set();
    let bi = 0, si = 0, acc = 0, dirty = false;
    const E = {
      uniforms, windTime, GLSL: WIND_GLSL, data, N,
      /* примять: (x, z) — центр, r — радиус, k — сила 0..1, (dx, dz) — куда клонить (0 — от центра) */
      stamp(x, z, r, k, dx, dz) {
        const s = N / 128, i0 = Math.floor((x - r + 64) * s), i1 = Math.ceil((x + r + 64) * s);
        const j0 = Math.floor((z - r + 64) * s), j1 = Math.ceil((z + r + 64) * s);
        for (let j = Math.max(0, j0); j <= Math.min(N - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) {
          const px = (i + 0.5) / s - 64, pz = (j + 0.5) / s - 64, ex = px - x, ez = pz - z, d = Math.hypot(ex, ez);
          if (d > r) continue;
          const f = k * (1 - (d / r) * (d / r));
          const o = (j * N + i) * 4, cur = data[o + 2] / 255;
          if (f <= cur * 0.98) continue;
          let vx = dx || 0, vz = dz || 0;
          vx = vx * 0.6 + (ex / (d + 0.2)) * 0.8; vz = vz * 0.6 + (ez / (d + 0.2)) * 0.8;
          const l = Math.hypot(vx, vz) || 1;
          data[o] = 128 + Math.round(vx / l * 127); data[o + 1] = 128 + Math.round(vz / l * 127);
          data[o + 2] = Math.round(Math.min(1, f) * 255);
          live.add(o); dirty = true;
        }
      },
      /* срезать пулей / выжечь взрывом (A — не восстанавливается) */
      cut(x, z, r, k) {
        const s = N / 128;
        for (let j = Math.floor((z - r + 64) * s); j <= Math.ceil((z + r + 64) * s); j++) for (let i = Math.floor((x - r + 64) * s); i <= Math.ceil((x + r + 64) * s); i++) {
          if (i < 0 || j < 0 || i >= N || j >= N) continue;
          const d = Math.hypot((i + 0.5) / s - 64 - x, (j + 0.5) / s - 64 - z);
          if (d > r) continue;
          const o = (j * N + i) * 4;
          data[o + 3] = Math.min(255, data[o + 3] + Math.round(255 * k * (1 - d / r)));
          dirty = true;
        }
      },
      blast(x, z, amp) { const b = uniforms.uBlast.value[bi++ & 3]; b.set(x, z, windTime.value, amp); },
      shake(x, z, amp) { const b = uniforms.uShake.value[si++ & 3]; b.set(x, z, windTime.value, amp); },
      /* медленный отход примятой травы; загрузка в GPU — 10 раз в секунду */
      update(dt) {
        acc += dt;
        if (acc < 0.1) return;
        const k = Math.max(1, Math.round(acc * 255 / 25));
        acc = 0;
        for (const o of live) {
          const b = data[o + 2] - k;
          if (b <= 0) { data[o + 2] = 0; live.delete(o); } else data[o + 2] = b;
          dirty = true;
        }
        if (dirty) { tex.needsUpdate = true; dirty = false; }
      }
    };
    FENV = E;
    return E;
  }

  /* ------------------------------------------------------- материалы */
  function addWind(mat, windTime, amp, kind) {
    const E = FENV;
    const u = Object.assign({ uTime: windTime, uWindAmp: { value: amp }, uCell: { value: kind === 'grass' ? 0.5 : 1 } }, E ? E.uniforms : {});
    mat.userData.sh = { uniforms: u };
    mat.customProgramCacheKey = () => 'forest-wind12-' + kind;
    const low = kind === 'grass' || kind === 'fern' || kind === 'sapling' || kind === 'shrub';
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      /* высота над точкой крепления: у хвои крона начинается ~на 11 м */
      const h = kind === 'crown' ? 'max(position.y - 11.0, 0.0)' : kind === 'sapling' ? 'max(position.y - 0.4, 0.0) * 0.5' : 'max(position.y, 0.0)';
      const body = E ? `
          vec3 wD = fwWind(wOrg, wH * uWindAmp * 20.0, uTime, ${kind === 'crown' ? '0.3' : '1.0'}) * 0.05;
          wD += fwBlast(wOrg, wH * ${kind === 'crown' ? '0.02' : '0.9'}, uTime);
          ${kind === 'crown' || kind === 'sapling' ? 'wD += fwShake(wOrg, wH * ' + (kind === 'crown' ? '0.05' : '0.35') + ', uTime);' : ''}
          ${low ? `vec4 wTr = fwTrample(wOrg.xz);
          float wTk = wTr.b * ${kind === 'sapling' ? '0.35' : '1.0'};
          wD.xz += (wTr.rg * 2.0 - 1.0) * wTk * wH * 1.1;
          wD.y -= wTk * wH * 0.45 + wTr.a * wH * 0.5;` : ''}
          transformed += transpose(wIM) * wD / max(dot(wIM[0], wIM[0]), 1e-4);` : `
          float wS = sin(uTime * 1.2 + wOrg.x * 0.37 + wOrg.z * 0.29 + position.x * 0.6)
                   + 0.45 * sin(uTime * 2.7 + wOrg.z * 0.9 + position.z * 0.8);
          transformed.x += wS * uWindAmp * wH;
          transformed.z += wS * uWindAmp * 0.6 * wH;`;
      const fadeB = E && mat.userData.bladeFade ? `
          /* v6: вблизи пучки-карточки уступают место геометрическим травинкам */
          if (uBladeR > 0.5) transformed *= smoothstep(uBladeR * 0.62, uBladeR * 0.9, distance(wOrg.xz, cameraPosition.xz));` : '';
      sh.vertexShader = 'uniform float uTime;\nuniform float uWindAmp;\n' + (E ? E.GLSL : '') +
        (kind === 'grass' ? 'attribute vec2 aCell;\nuniform float uCell;\n' : '') +
        sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 wOrg = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
            mat3 wIM = mat3(modelMatrix) * mat3(instanceMatrix);
          #else
            vec3 wOrg = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            mat3 wIM = mat3(modelMatrix);
          #endif
          float wH = ${h};` + body + fadeB);
      if (kind === 'grass') {
        sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>',
          '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vMapUv * uCell + aCell;\n#endif');
      }
      /* Карточки листвы двусторонние, но нормаль у них «вверх» и не должна
         переворачиваться на изнанке: иначе пучок, повёрнутый к камере
         тыльной стороной, освещается снизу и выглядит чёрным пятном. */
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
        '#undef DOUBLE_SIDED\n#include <normal_fragment_begin>\n#define DOUBLE_SIDED');
      if (mat.userData.onShader) mat.userData.onShader(sh);
    };
  }

  /* Запасная карточка хвои, если фото-ветка не загрузилась. */
  function needleCanvas() {
    const c = T.canvas(256, 256), g = T.ctx2d(c), rnd = U.rng(88);
    g.clearRect(0, 0, 256, 256);
    g.strokeStyle = 'rgb(60,48,38)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(4, 128); g.lineTo(252, 120); g.stroke();
    for (let i = 0; i < 900; i++) {
      const t = rnd(), x = 10 + t * 240, y = 128 - t * 8;
      const a = (rnd() - 0.5) * 2.4 + (rnd() < 0.5 ? 0.6 : -0.6), L = 14 + rnd() * 26 * (1 - t * 0.5);
      g.strokeStyle = `rgb(${40 + rnd() * 25 | 0},${62 + rnd() * 30 | 0},${34 + rnd() * 18 | 0})`;
      g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L * 0.4, y + Math.sin(a) * L); g.stroke();
    }
    return c;
  }

  /* Мох и лишайник на коре: у комля и с теневой стороны ствола, на
     валежнике — сверху. Пятна — по бесшовному шуму в UV коры. */
  function addMoss(THREE, mat) {
    const u = { tMossNz: { value: noiseTexture(THREE, 128) } };
    mat.customProgramCacheKey = () => 'bark-moss';
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'varying vec3 vMossN;\nvarying float vMossH;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec3 mN = objectNormal;
          #ifdef USE_INSTANCING
            mN = mat3(instanceMatrix) * mN;
            vMossH = position.y;
          #else
            vMossH = -1.0;
          #endif
          vMossN = normalize(mat3(modelMatrix) * mN);
        }`);
      sh.fragmentShader = 'uniform sampler2D tMossNz;\nvarying vec3 vMossN;\nvarying float vMossH;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec4 mNz = texture2D(tMossNz, vMapUv * vec2(0.5, 0.17));
          vec4 mNz2 = texture2D(tMossNz, vMapUv * vec2(1.0, 0.55) + 0.37);
          float mBase, mSide;
          if (vMossH > -0.5) {
            mBase = 1.0 - smoothstep(0.2, 1.3 + 2.2 * mNz.r, vMossH);
            mSide = smoothstep(0.2, 0.9, dot(vMossN, vec3(-0.34, 0.18, -0.92))) * (1.0 - smoothstep(1.0, 4.5 + 4.0 * mNz2.g, vMossH));
          } else {
            mBase = 0.06;
            mSide = smoothstep(0.2, 0.9, vMossN.y) * 0.55;
          }
          float mossA = clamp(max(mBase, mSide * 0.9) * smoothstep(0.30, 0.62, mNz.g * 0.65 + mNz2.r * 0.55), 0.0, 1.0);
          vec3 mossC = mix(vec3(0.036, 0.050, 0.018), vec3(0.075, 0.088, 0.034), mNz2.b);
          diffuseColor.rgb = mix(diffuseColor.rgb, mossC, mossA);
          float lichA = smoothstep(0.64, 0.72, mNz2.a) * (1.0 - mossA) * step(-0.5, vMossH) * smoothstep(1.2, 2.5, vMossH) * 0.5;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.18, 0.14), lichA);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n          roughnessFactor = mix(roughnessFactor, 1.0, mossA);')
        .replace('#include <normal_fragment_maps>', 'vec3 mGeoN = normal;\n#include <normal_fragment_maps>\n          normal = normalize(mix(normal, mGeoN, mossA * 0.5));');
    };
  }

  /* v12: ОСВЕЩЕНИЕ ХВОИ. Карточки кроны имели «сферические» нормали вверх-
     наружу и не переворачивали их на изнанке, поэтому снизу (с земли) крона
     показывала освещённую небом верхнюю сторону — светло-серую, «в инее».
     В реальном сомкнутом сосняке кроны снизу — тёмные зелёно-бурые силуэты
     на светлом небе: нижнюю часть кроны закрывает от неба верхняя (само-
     затенение), прямого света туда почти не попадает. Как в движках
     (SpeedTree, UE Foliage: «crown AO» по высоте в кроне + ослабленный
     спекуляр у хвои — у матовых иголок нет зеркального блика от неба):
       • рассеянный свет гаснет к низу кроны (vFolH: 0 — низ, 1 — макушка);
       • при взгляде снизу вверх видна теневая сторона — свет слабее;
       • отражение неба (Френель на скользящих углах — именно оно давало
         белую кайму у каждой карточки) почти убрано. */
  const FOLIAGE_FRAG = `
    {
      vec3 fV = normalize(vFolWP - cameraPosition);
      float fUnder = smoothstep(0.08, 0.8, fV.y);
      float fAO = mix(0.34, 1.0, smoothstep(0.0, 0.95, vFolH));
      float fK = fAO * mix(1.0, 0.42, fUnder);
      reflectedLight.indirectDiffuse *= fK;
      reflectedLight.directDiffuse *= mix(1.0, 0.5, fUnder) * mix(0.55, 1.0, fAO);
      reflectedLight.indirectSpecular *= 0.08 * fK;
      reflectedLight.directSpecular *= 0.2;
    }`;
  function foliageShader(sh, hExpr, wpExpr) {
    sh.vertexShader = 'varying vec3 vFolWP;\nvarying float vFolH;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vFolH = clamp(${hExpr}, 0.0, 1.0);
      vFolWP = ${wpExpr};`);
    sh.fragmentShader = 'varying vec3 vFolWP;\nvarying float vFolH;\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + FOLIAGE_FRAG);
  }
  const FOL_WP_INST = `(modelMatrix * (
      #ifdef USE_INSTANCING
        instanceMatrix *
      #endif
      vec4(transformed, 1.0))).xyz`;

  function forestMaterials(THREE) {
    const M = { windTime: { value: 0 } };
    M.env = forestEnv(THREE, M.windTime);
    const bd = envTex(THREE, 'bark_diff', true), bn = envTex(THREE, 'bark_nor'), ba = envTex(THREE, 'bark_arm');
    /* Сосновая кора на фото рыже-красная; в пасмурном ельнике референса
       стволы тёмно-серо-бурые — отсюда приглушающий множитель. */
    M.bark = new THREE.MeshStandardMaterial({
      map: bd || canvasTex(THREE, T.woodAlbedo(314, 256, [84, 74, 64]), true),
      normalMap: bn, normalScale: new THREE.Vector2(1.4, 1.4),
      roughnessMap: ba, aoMap: ba, aoMapIntensity: 1.0,
      roughness: 1, metalness: 0, vertexColors: true,
      /* v12: кора тёплая серо-бурая (как у сосны в тени), а не нейтрально-серая */
      color: new THREE.Color(0.52, 0.45, 0.39)
    });
    addMoss(THREE, M.bark);

    const sp = envTex(THREE, 'spray', true, 4);
    M.needles = new THREE.MeshStandardMaterial({
      map: sp || canvasTex(THREE, needleCanvas(), true),
      alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide,
      roughness: 0.9, metalness: 0, vertexColors: true,
      color: new THREE.Color(0.36, 0.44, 0.30)
    });
    M.needles.userData.onShader = (sh) => foliageShader(sh, '(position.y - 11.0) / 10.0', FOL_WP_INST);
    addWind(M.needles, M.windTime, 0.012, 'crown');

    const dw = envTex(THREE, 'deadwood', true);
    M.deadwood = new THREE.MeshStandardMaterial({
      map: dw || canvasTex(THREE, T.woodAlbedo(515, 128, [96, 88, 80]), true),
      roughness: 0.95, metalness: 0, vertexColors: true,
      color: new THREE.Color(0.48, 0.46, 0.44)
    });

    const tf = envTex(THREE, 'tufts', true, 4);
    M.grass = new THREE.MeshStandardMaterial({
      map: tf || canvasTex(THREE, T.grassBlade(77, 128), true),
      alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide,
      roughness: 0.95, metalness: 0,
      color: new THREE.Color(0.50, 0.50, 0.43)
    });
    M.grass.map.wrapS = M.grass.map.wrapT = THREE.ClampToEdgeWrapping;
    M.grass.userData.bladeFade = true;
    addWind(M.grass, M.windTime, 0.05, 'grass');
    if (!tf) M.grass.userData.sh.uniforms.uCell.value = 1;
    M.grassAtlas = !!tf;

    const fe = envTex(THREE, 'fern', true, 4);
    M.fern = fe ? new THREE.MeshStandardMaterial({
      map: fe, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide,
      roughness: 0.9, metalness: 0,
      color: new THREE.Color(0.36, 0.41, 0.31)
    }) : null;
    if (M.fern) { M.fern.map.wrapS = M.fern.map.wrapT = THREE.ClampToEdgeWrapping; addWind(M.fern, M.windTime, 0.035, 'fern'); }
    return M;
  }

  /* ---------------------------------------------------------- грунт */
  /* v9: УПАКОВКА ТЕКСТУР ГРУНТА. Шейдер земли брал 17 текстур (3 набора ×
     альбедо/нормаль/ARM + грязь + шум + маска + окружение + тень + полог), а
     у большинства ПК под Windows (ANGLE/D3D11) предел — 16 текстур на
     фрагментный шейдер: программа не линковалась и земля просто не
     рисовалась (видно было небо/туман сквозь траву). Как в движках
     (Frostbite, UE «channel packing»): на GPU, один раз при загрузке,
     каждый набор сжимается из трёх карт в две:
       альбедо RGB + высота (ARM.b) в альфе — sRGB8_A8 (альфа линейна);
       нормаль XY + AO (ARM.r) + шероховатость (ARM.g) — Z нормали
       восстанавливается в шейдере (sqrt(1 − x² − y²)).
     Итого 12–13 текстур вместо 17, на 6 выборок меньше на пиксель, меньше
     видеопамяти — быстрее и на слабых видеокартах. */
  function packGroundLayer(THREE, renderer, dif, nor, arm, aniso) {
    if (!renderer || !dif || !nor || !arm) return null;
    const dim = (t) => [(t.image && t.image.width) || 1024, (t.image && t.image.height) || 1024];
    const mk = (wh, srgb) => new THREE.WebGLRenderTarget(wh[0], wh[1], {
      depthBuffer: false, stencilBuffer: false, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: aniso || 8,
      colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    });
    for (const t of [dif, nor, arm]) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.anisotropy = 1; }
    const dA = dim(dif), dN = dim(nor), dR = dim(arm);
    const alb = mk(dA, true), nrm = mk([Math.max(dN[0], dR[0]), Math.max(dN[1], dR[1])], false);
    const P = packGroundLayer.P || (packGroundLayer.P = (() => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { ta: { value: null }, tb: { value: null }, mode: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform sampler2D ta, tb; uniform float mode; varying vec2 vUv;\n' +
          'void main(){ vec4 a = texture2D(ta, vUv), b = texture2D(tb, vUv);\n' +
          '  gl_FragColor = mode < 0.5 ? vec4(a.rgb, b.b) : vec4(a.rg, b.r, b.g); }',
        depthTest: false, depthWrite: false, toneMapped: false
      });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      q.frustumCulled = false;
      const scn = new THREE.Scene(); scn.add(q);
      return { mat, scn, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
    })());
    const prev = renderer.getRenderTarget(), sh = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    try {
      const u = P.mat.uniforms;
      u.ta.value = dif; u.tb.value = arm; u.mode.value = 0;
      renderer.setRenderTarget(alb); renderer.render(P.scn, P.cam);
      u.ta.value = nor; u.tb.value = arm; u.mode.value = 1;
      renderer.setRenderTarget(nrm); renderer.render(P.scn, P.cam);
    } finally {
      renderer.setRenderTarget(prev);
      renderer.shadowMap.enabled = sh;
      P.mat.uniforms.ta.value = P.mat.uniforms.tb.value = null;
    }
    /* исходники в видеопамяти больше не нужны (ImageBitmap остаются для других материалов) */
    for (const t of [dif, nor, arm]) t.dispose();
    alb.texture.name = 'groundPackAlb'; nrm.texture.name = 'groundPackNrm';
    return { alb: alb.texture, nrm: nrm.texture, rts: [alb, nrm] };
  }

  /* Лесная подстилка: два фото-набора (хвоя с листвой и замшелая земля),
     у каждого альбедо/нормаль/ARM. Повтор тайла ломается шумом: второй
     сэмпл того же набора повёрнут и масштабирован, переход между ними и
     пятна мха заданы бесшовным шумом в мировых координатах. Поверх —
     третий набор, грязь: тропы, колея, вал и воронки по карте грунта;
     там же сырость — мокрая земля темнеет и блестит, в лужах стоит вода. */
  function buildGround(THREE, scene, api, F, M) {
    /* сетка неравномерная: шаг ~0.3 м у стрельбища и ~1.3 м на краю,
       где земля всё равно тонет в дымке */
    const HALF = 125, SEG = 300, EXP = 1.6;
    const geo = new THREE.PlaneGeometry(2, 2, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const warp = (u) => Math.sign(u) * Math.pow(Math.abs(u), EXP) * HALF;
    for (let i = 0; i < pos.count; i++) {
      const x = warp(pos.getX(i)), z = warp(pos.getZ(i));
      pos.setXYZ(i, x, F.heightAt(x, z), z);
      uv.setXY(i, x, -z);                    // UV в метрах
    }
    geo.computeVertexNormals();
    /* v10: высота ВИДИМОЙ поверхности. Сетка земли — треугольники с шагом
       0,3–1,3 м, а рельеф (кочки 16 см, воронки, траншея, овраг) задан
       функцией: между вершинами плоский треугольник расходится с функцией
       на сантиметры–дециметры, и всё, что ставилось по функции (бревна,
       мешки, гильзы, трава, ноги бойцов, пули), висело над землёй или
       тонуло в ней. Как Terrain.SampleHeight в Unity / ALandscape в Unreal:
       высота берётся из той же триангуляции, что рисуется (барицентрика
       внутри ячейки, диагональ PlaneGeometry b–d). Дальше вся игра (объекты,
       физика, пули) видит ровно ту землю, что на экране, а выборка — O(1)
       вместо обхода воронок и траншеи. За пределами сетки — функция. */
    {
      const N1 = SEG + 1, HY = new Float32Array(N1 * N1), AX = new Float64Array(N1);
      for (let i = 0; i < N1; i++) AX[i] = warp(-1 + 2 * i / SEG);
      for (let i = 0; i < pos.count; i++) HY[i] = pos.getY(i);
      const analytic = F.heightAt, IE = 1 / EXP;
      const cell = (x) => {
        /* обратный warp: индекс ячейки по оси */
        const u = Math.sign(x) * Math.pow(Math.abs(x) / HALF, IE);
        let i = Math.floor((u + 1) * 0.5 * SEG);
        if (i < 0) i = 0; else if (i > SEG - 1) i = SEG - 1;
        if (x < AX[i] && i > 0) i--; else if (x > AX[i + 1] && i < SEG - 1) i++;
        return i;
      };
      const surf = (x, z) => {
        if (!(x > -HALF && x < HALF && z > -HALF && z < HALF)) return analytic(x, z);
        const ix = cell(x), iz = cell(z);
        const s = (x - AX[ix]) / (AX[ix + 1] - AX[ix]), t = (z - AX[iz]) / (AX[iz + 1] - AX[iz]);
        const a = iz * N1 + ix, b = a + N1, c = b + 1, d = a + 1;
        if (s + t <= 1) return HY[a] + s * (HY[d] - HY[a]) + t * (HY[b] - HY[a]);
        return HY[c] + (1 - s) * (HY[b] - HY[c]) + (1 - t) * (HY[d] - HY[c]);
      };
      F.heightAtFn = analytic;
      F.heightAt = surf;
      api.heightAt = surf;
      api.heightAtFn = analytic;
    }
    const mask = groundMask(THREE, api, F);

    const TILE_A = 2.4, TILE_B = 3.2, TILE_M = 2.3;
    const aD = envTex(THREE, 'floorA_diff', true, 16), aN = envTex(THREE, 'floorA_nor', false, 16), aR = envTex(THREE, 'floorA_arm', false, 16);
    const bD = envTex(THREE, 'floorB_diff', true, 16), bN = envTex(THREE, 'floorB_nor', false, 16), bR = envTex(THREE, 'floorB_arm', false, 16);
    const mD = envTex(THREE, 'mud_diff', true, 16), mN = envTex(THREE, 'mud_nor', false, 16), mR = envTex(THREE, 'mud_arm', false, 16);
    const full = aD && aN && aR && bD && bN && bR;
    const mud = !!(mD && mN && mR);
    let mat;
    /* v9: упаковка 3 → 2 карты на набор (см. packGroundLayer) */
    const RND = (typeof self !== 'undefined' && self.__AEGIS_RENDERER) || null;
    let PA = null, PB = null, PC = null, PM = null, hasC = false;
    if (full && RND) {
      try {
        const cD = envTex(THREE, 'floorC_diff', true, 16), cN = envTex(THREE, 'floorC_nor', false, 16), cR = envTex(THREE, 'floorC_arm', false, 16);
        hasC = !!(cD && cN && cR);
        PA = packGroundLayer(THREE, RND, aD, aN, aR, 16);
        PB = packGroundLayer(THREE, RND, bD, bN, bR, 16);
        PC = hasC ? packGroundLayer(THREE, RND, cD, cN, cR, 16) : PB;
        PM = mud ? packGroundLayer(THREE, RND, mD, mN, mR, 16) : PB;
      } catch (e) { console.warn('ground pack failed:', e && e.message); PA = null; }
    }
    if (full && PA && PB && PC && PM) {
      for (const t of [PA.alb, PA.nrm]) t.repeat.set(1 / TILE_A, 1 / TILE_A);
      mat = new THREE.MeshStandardMaterial({
        map: PA.alb, normalMap: PA.nrm, normalScale: new THREE.Vector2(1.15, 1.15),
        roughness: 1, metalness: 0, color: new THREE.Color(0.74, 0.69, 0.62)
      });
      const E = M.env;
      const uni = {
        tNoise: { value: noiseTexture(THREE, 256) }, tBa: { value: PB.alb }, tBn: { value: PB.nrm },
        tCa: { value: PC.alb }, tCn: { value: PC.nrm },
        uTileA: { value: TILE_A }, uTileRatio: { value: TILE_A / TILE_B }, uTileC: { value: 1 / 2.9 },
        tMask: { value: mask.tex }, tMa: { value: PM.alb }, tMn: { value: PM.nrm },
        uTileM: { value: 1 / TILE_M }, uMudTint: { value: mud ? new THREE.Vector3(0.80, 0.64, 0.47) : new THREE.Vector3(0.45, 0.42, 0.36) },
        uPom: { value: 1 }, uPomDepth: { value: 0.045 }, uHexS: { value: 0.42 }, uRain: { value: 0 }, uGloom: { value: 0 }, uGTime: M.windTime,
        uBladeR: E.uniforms.uBladeR, uHasC: { value: hasC ? 1 : 0 }
      };
      api.groundUniforms = uni;
      /* POM — только «Высокая»/«Средняя»; на «Низкой» шейдер собирается без него */
      api.groundQuality = (q) => {
        const pom = q === 'low' ? 0 : q === 'medium' ? 6 : 10;
        if (mat.userData.pomSteps !== pom) { mat.userData.pomSteps = pom; mat.needsUpdate = true; api._groundSafeDone = false; }
      };
      mat.userData.pomSteps = 10;
      mat.customProgramCacheKey = () => 'forest-ground-v9-pack-pom' + mat.userData.pomSteps;
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uni);
        const POM = mat.userData.pomSteps | 0;
        sh.vertexShader = 'varying vec3 vGWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
            ${POM ? '#define GROUND_POM ' + POM : ''}
            varying vec3 vGWP;
            uniform sampler2D tNoise, tBa, tBn, tCa, tCn, tMa, tMn;
            uniform highp sampler2DArray tMask;
            uniform float uTileA, uTileRatio, uTileM, uTileC, uPom, uPomDepth, uHexS, uRain, uGloom, uGTime, uBladeR, uHasC;
            uniform vec3 uMudTint;
            vec2 gRot(vec2 p, float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c) * p; }
            /* ---- hex-tiling (Mikkelsen, «Practical Real-Time Hex-Tiling», JCGT 2022):
               треугольная сетка, в каждой вершине — свой сдвиг и поворот тайла,
               три выборки с весами барицентрик (заострёнными), производные — от исходных UV */
            vec2 gHash(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
            struct GHex { vec3 w; vec2 o1; vec2 o2; vec2 o3; vec3 a; };
            GHex gHexGrid(vec2 uv) {
              vec2 sk = mat2(1.0, -0.57735027, 0.0, 1.15470054) * (uv * uHexS * 3.4641016);
              vec2 b = floor(sk);
              vec3 t = vec3(fract(sk), 0.0); t.z = 1.0 - t.x - t.y;
              float s = step(0.0, -t.z), s2 = 2.0 * s - 1.0;
              GHex H;
              H.w = vec3(-t.z * s2, s - t.y * s2, s - t.x * s2);
              vec2 r1 = gHash(b + vec2(s, s)), r2 = gHash(b + vec2(s, 1.0 - s)), r3 = gHash(b + vec2(1.0 - s, s));
              H.o1 = r1; H.o2 = r2; H.o3 = r3;
              H.a = vec3(r1.x + r1.y, r2.x + r2.y, r3.x + r3.y) * 3.14159;
              H.w = H.w * H.w * H.w; H.w *= H.w; H.w /= dot(H.w, vec3(1.0));
              return H;
            }
            vec4 gHexTex(sampler2D t, vec2 uv, GHex H) {
              vec2 dx = dFdx(uv), dy = dFdy(uv);
              return textureGrad(t, gRot(uv, H.a.x) + H.o1, gRot(dx, H.a.x), gRot(dy, H.a.x)) * H.w.x
                   + textureGrad(t, gRot(uv, H.a.y) + H.o2, gRot(dx, H.a.y), gRot(dy, H.a.y)) * H.w.y
                   + textureGrad(t, gRot(uv, H.a.z) + H.o3, gRot(dx, H.a.z), gRot(dy, H.a.z)) * H.w.z;
            }
            /* упакованная карта: xy — нормаль (повёрнута обратно в систему тайла), zw — AO и шероховатость */
            vec4 gHexNrm(sampler2D t, vec2 uv, GHex H) {
              vec2 dx = dFdx(uv), dy = dFdy(uv);
              vec4 n1 = textureGrad(t, gRot(uv, H.a.x) + H.o1, gRot(dx, H.a.x), gRot(dy, H.a.x));
              vec4 n2 = textureGrad(t, gRot(uv, H.a.y) + H.o2, gRot(dx, H.a.y), gRot(dy, H.a.y));
              vec4 n3 = textureGrad(t, gRot(uv, H.a.z) + H.o3, gRot(dx, H.a.z), gRot(dy, H.a.z));
              vec2 x1 = gRot(n1.xy * 2.0 - 1.0, -H.a.x), x2 = gRot(n2.xy * 2.0 - 1.0, -H.a.y), x3 = gRot(n3.xy * 2.0 - 1.0, -H.a.z);
              return vec4(x1 * H.w.x + x2 * H.w.y + x3 * H.w.z, n1.zw * H.w.x + n2.zw * H.w.y + n3.zw * H.w.z);
            }
            /* высота слоя A для POM: без производных (внутри цикла), по заданному mip */
            float gHexH(sampler2D hm, vec2 uv, float lod) {
              GHex H = gHexGrid(uv);
              return textureLod(hm, gRot(uv, H.a.x) + H.o1, lod).a * H.w.x
                   + textureLod(hm, gRot(uv, H.a.y) + H.o2, lod).a * H.w.y
                   + textureLod(hm, gRot(uv, H.a.z) + H.o3, lod).a * H.w.z;
            }
            /* капли дождя по луже: расходящиеся кольца в ячейках 0,3 м со своей фазой */
            vec2 gRipple(vec2 p, float t) {
              vec2 acc = vec2(0.0);
              for (int k = 0; k < 2; k++) {
                vec2 q = p * (k == 0 ? 3.3 : 2.1) + float(k) * 7.31;
                vec2 c = floor(q), f = fract(q) - 0.5;
                vec2 h = gHash(c + float(k) * 3.7);
                float ph = fract(t * (0.9 + h.x * 0.6) + h.y);
                vec2 d = f - (h - 0.5) * 0.5;
                float r = length(d);
                float ring = sin((r - ph * 0.5) * 60.0) * (1.0 - ph) * smoothstep(0.5, 0.0, abs(r - ph * 0.5) * 6.0);
                acc += d / max(r, 1e-3) * ring;
              }
              return acc * 0.35;
            }`)
          .replace('#include <map_fragment>', `
            vec2 gW = vMapUv * uTileA;                     // мировые метры (x, -z)
            float gDist = length(vViewPosition);
            vec2 gMuv = vec2(gW.x + 64.0, 64.0 - gW.y) / 128.0;
            vec4 gMk = texture(tMask, vec3(gMuv, 0.0));     // R грязь, G сырость, B трава, A крона
            vec4 gSc = texture(tMask, vec3(gMuv, 1.0));     // R копоть, G вывороченная земля, B натоптано
            vec4 gNz = texture2D(tNoise, gW * 0.019);
            vec4 gNz2 = texture2D(tNoise, gW * 0.071 + 0.5);
            float gCrown = gMk.a;
            float gCollar = smoothstep(0.80, 0.90, gCrown) * (1.0 - smoothstep(0.96, 1.0, gCrown));
            float gMb0 = smoothstep(0.50, 0.72, gNz.r * 0.8 + gNz2.b * 0.3 - 0.05);
            gMb0 = clamp(gMb0 + gMk.b * 0.35 - gCrown * 0.55 + gCollar * 0.9, 0.0, 1.0);
            float gPud0 = smoothstep(0.66 - uRain * 0.2 - uGloom * 0.07, 0.84 - uRain * 0.2 - uGloom * 0.07, gMk.g + (gNz2.a - 0.5) * 0.35);
            /* POM: смещение UV по карте высот слоя хвои вдоль луча взгляда (до ~8 м) */
            #ifdef GROUND_POM
            {
              float gPk = (1.0 - smoothstep(4.0, 8.0, gDist)) * (1.0 - gPud0) * uPom;
              if (gPk > 0.01) {
                vec3 gV = normalize(cameraPosition - vGWP);
                vec2 gVt = vec2(gV.x, -gV.z) / max(gV.y, 0.35);
                vec2 gUv0 = gW / uTileA;
                vec2 gDx = dFdx(gUv0) * 1024.0, gDy = dFdy(gUv0) * 1024.0;
                float gLod = max(0.0, 0.5 * log2(max(dot(gDx, gDx), dot(gDy, gDy))));
                vec2 gStep = gVt * uPomDepth * gPk / float(GROUND_POM);
                float gLay = 1.0 / float(GROUND_POM), gCur = 0.0;
                vec2 gP = gW;
                float gH = 1.0 - gHexH(map, gP / uTileA, gLod);
                for (int i = 0; i < GROUND_POM; i++) {
                  if (gCur >= gH) break;
                  gP -= gStep; gH = 1.0 - gHexH(map, gP / uTileA, gLod); gCur += gLay;
                }
                vec2 gPrev = gP + gStep;
                float gAft = gH - gCur, gBef = (1.0 - gHexH(map, gPrev / uTileA, gLod)) - gCur + gLay;
                gW = mix(gP, gPrev, clamp(gAft / (gAft - gBef + 1e-5), 0.0, 1.0));
              }
            }
            #endif
            vec2 gUvA = gW / uTileA;
            GHex gHA = gHexGrid(gUvA);
            vec4 gA = gHexTex(map, gUvA, gHA);
            vec4 gNA4 = gHexNrm(normalMap, gUvA, gHA);
            vec4 gArmA = vec4(gNA4.z, gNA4.w, gA.a, 1.0);
            vec2 gUvC = gRot(gW, 0.4) * uTileC + vec2(0.31, 0.17);
            vec4 gC = texture2D(tCa, gUvC);
            vec4 gCn4 = texture2D(tCn, gUvC);
            vec4 gArmC = vec4(gCn4.z, gCn4.w, gC.a, 1.0);
            /* два набора хвойной подстилки: рыжая (Forest Leaves 04) и бурая с землёй (Forest Ground 03) — крупными пятнами, под кронами больше бурой */
            float gNC = uHasC * smoothstep(0.36, 0.66, texture2D(tNoise, gW * 0.012 + 0.31).b + gCrown * 0.3);
            vec4 gNeed = mix(gA, gC * vec4(0.92, 0.88, 0.84, 1.0), gNC);
            vec4 gArmN = mix(gArmA, gArmC, gNC);
            vec2 gUvB = gRot(gUvA, -0.6) * uTileRatio + vec2(0.13, 0.29);
            vec4 gB = texture2D(tBa, gUvB);
            vec4 gBn4 = texture2D(tBn, gUvB);
            vec4 gArmBv = vec4(gBn4.z, gBn4.w, gB.a, 1.0);
            gB.rgb *= vec3(0.80, 0.86, 0.66);
            vec2 gUvM = gRot(gW, 0.35) * uTileM;
            vec4 gMc = texture2D(tMa, gUvM);
            vec4 gMn4 = texture2D(tMn, gUvM);
            vec4 gMa = vec4(gMn4.z, gMn4.w, gMc.a, 1.0);
            float gMudH = dot(gMc.rgb, vec3(0.333));
            vec4 gNm = texture2D(tNoise, gW * 0.23 + 0.11);
            float gMudW = smoothstep(0.34, 0.80, gMk.r + (gNz2.r - 0.5) * 0.5 + (gNm.g - 0.5) * 0.45 + (texture2D(tNoise, gW * 0.9).b - 0.5) * 0.22 + gSc.b * 0.45);
            /* height blending (Mishkinis, «Advanced Terrain Texture Splatting»): побеждает слой,
               у которого «высота + вес» больше; хвоя — почти ровный уровень заполнения и
               затекает в ямки, мох — по своим буграм, грязь — между ними и на тропах */
            vec3 gHt = vec3(
              0.34 + 0.30 * gArmN.b + (1.0 - gMb0) * 0.55 + gCrown * 0.2,
              gArmBv.b * 0.95 + gMb0 * 0.7 - gCrown * 0.3 + gCollar * 0.4 + uGloom * 0.2,
              0.05 + gMudH * 0.7 + gMudW * 1.25 - 0.42 + uGloom * (0.08 + 0.25 * gMk.g));
            float gMx = max(max(gHt.x, gHt.y), gHt.z) - 0.13;
            vec3 gL = max(gHt - gMx, 0.0);
            gL /= (gL.x + gL.y + gL.z + 1e-5);
            float gMud = gL.z, gMb = gL.y;
            vec4 gCol = gNeed * gL.x + gB * gL.y + vec4(gMc.rgb * uMudTint, 1.0) * gL.z;
            gCol.a = 1.0;
            vec4 gArm = gArmN * gL.x + gArmBv * gL.y + gMa * gL.z;
            /* вблизи — второй, мелкий слой той же текстуры: хвоя и сор не расплываются у ног */
            float gNear = 1.0 - smoothstep(3.0, 10.0, gDist);
            if (gNear > 0.001) {
              vec2 gUvD = gRot(gUvA, 0.7) * 3.7 + vec2(0.21, 0.47);
              float gDl = dot(texture2D(map, gUvD).rgb, vec3(0.333));
              float gDa = dot(texture2D(map, gUvD, 5.0).rgb, vec3(0.333));
              gCol.rgb *= mix(1.0, clamp(gDl / max(gDa, 0.03), 0.55, 1.55), 0.45 * gNear * (1.0 - gMud));
            }
            /* крупные пятна: бурый перегной и зеленоватый мох */
            float gMac = texture2D(tNoise, gW * 0.0045 + 0.17).g;
            float gMac2 = texture2D(tNoise, gW * 0.011 + 0.63).r;
            gCol.rgb *= mix(vec3(1.06, 0.97, 0.86), vec3(0.86, 0.97, 0.76), smoothstep(0.3, 0.7, gMac)) * (0.9 + 0.2 * gMac2);
            /* макро-вариация на 20–50 м: там повтор тайла заметнее всего */
            float gFar = smoothstep(16.0, 45.0, gDist);
            float gMac3 = texture2D(tNoise, gW * 0.0021 + 0.71).a;
            gCol.rgb *= mix(vec3(1.0), mix(vec3(1.10, 1.0, 0.86), vec3(0.82, 0.90, 0.78), gMac3), gFar * 0.75);
            gCol.rgb = mix(vec3(dot(gCol.rgb, vec3(0.30, 0.59, 0.11))), gCol.rgb, 1.15);
            /* «ковёр» травы: под травинками — подсад, дальше пучков — сам ковёр */
            float gGr = gMk.b * (1.0 - gMud);
            float gCarpet = uBladeR > 0.5 ? smoothstep(uBladeR * 0.8, uBladeR + 14.0, gDist) : smoothstep(10.0, 22.0, gDist);
            vec3 gGrass = mix(vec3(0.115, 0.125, 0.052), vec3(0.17, 0.16, 0.075), gNz2.g);
            gCol.rgb = mix(gCol.rgb, gGrass, gGr * (0.22 + 0.5 * gCarpet));
            /* под кроной — сухо и темнее (хвойный опад, нет травы) */
            gCol.rgb *= 1.0 - gCrown * 0.22;
            float gWet = clamp(gMk.g * 1.3 - 0.12 + (gNz.b - 0.5) * 0.35 + gMud * 0.15, 0.0, 1.0) * (1.0 - gCrown * 0.5);
            gWet = max(gWet, uRain * (0.55 + 0.3 * gMud) * (1.0 - gCrown * 0.45));
            /* v7: мрачный лес — сырая земля, больше мха, грязи и луж, темнее перегной */
            gWet = max(gWet, uGloom * (0.28 + 0.3 * gMud) * (1.0 - gCrown * 0.4));
            gCol.rgb *= 1.0 - uGloom * 0.13;
            float gPud = smoothstep(0.66 - uRain * 0.2 - uGloom * 0.07, 0.84 - uRain * 0.2 - uGloom * 0.07, gMk.g + (gNz2.a - 0.5) * 0.35 - gMudH * 0.6);
            gCol.rgb *= (0.74 + 0.5 * gNz.a) * mix(1.0, gArm.r, 0.8);
            gCol.rgb *= mix(1.0, 0.52 + 0.14 * gMud, gWet);
            gCol.rgb = mix(gCol.rgb, vec3(0.028, 0.024, 0.017), gPud * 0.9);
            /* копоть разрыва: чёрное пятно с рваным краем */
            /* вывороченная взрывом/пулей земля: тёмный свежий грунт с комьями */
            vec4 gNh = texture2D(tNoise, gW * 0.55 + 0.3);
            float gDirt = smoothstep(0.2, 0.7, gSc.g + (gNh.r - 0.5) * 0.5);
            gCol.rgb = mix(gCol.rgb, vec3(0.075, 0.058, 0.04) * (0.7 + 0.6 * gNh.g) * (0.8 + 0.4 * gMudH), gDirt * 0.85);
            float gSo = smoothstep(0.15, 0.75, gSc.r + (gNh.b - 0.5) * 0.55 + (gNz2.g - 0.5) * 0.3);
            gCol.rgb = mix(gCol.rgb, vec3(0.03, 0.027, 0.024) * (0.7 + 0.6 * gNz2.b), gSo * 0.92);
            diffuseColor *= gCol;`)
          .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(roughness * mix(gArm.g, 0.06, max(gWet * 0.6 * (1.0 - 0.45 * gMud), gPud)), 1.0, gSo * 0.8);')
          .replace('#include <normal_fragment_maps>', `
            #ifdef USE_NORMALMAP_TANGENTSPACE
              /* упакованные нормали: только XY, Z — из длины (карты единичные) */
              vec2 gNA = gNA4.xy;
              vec2 gNCn = gRot(gCn4.xy * 2.0 - 1.0, -0.4);
              vec2 gNB = gRot(gBn4.xy * 2.0 - 1.0, 0.6);
              vec2 gNM = gRot(gMn4.xy * 2.0 - 1.0, -0.35);
              vec3 mapN = vec3(mix(gNA, gNCn, gNC) * gL.x + gNB * gL.y + gNM * gL.z, 0.0);
              mapN.z = sqrt(max(0.0, 1.0 - dot(mapN.xy, mapN.xy)));
              if (gNear > 0.001) {
                vec2 gND = gRot(texture2D(normalMap, gRot(gUvA, 0.7) * 3.7 + vec2(0.21, 0.47)).xy * 2.0 - 1.0, -0.7);
                mapN.xy += gND * 0.5 * gNear * (1.0 - gMud);
              }
              mapN.xy *= normalScale * (1.0 - 0.55 * gWet) * (1.0 - 0.95 * gPud) * (1.0 - 0.6 * gSo);
              if (uRain > 0.01 && gPud > 0.05) mapN.xy += gRipple(gW, uGTime) * gPud * uRain;
              normal = normalize(tbn * mapN);
            #else
              #include <normal_fragment_maps>
            #endif`);
      };
    } else {
      const gt = canvasTex(THREE, T.groundAlbedo(2024, 1024), true);
      gt.repeat.set(1 / 3, 1 / 3);
      mat = new THREE.MeshStandardMaterial({ map: gt, roughness: 0.97, metalness: 0, color: new THREE.Color(0.55, 0.51, 0.44) });
    }
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    ground.name = 'ground';
    /* v9: страховка — если драйвер не смог собрать шейдер земли (лимиты
       сэмплеров/инструкций на слабых GPU), подменяем материал простым,
       чтобы земля никогда не исчезала. */
    api.groundSafe = (renderer) => {
      try {
        if (!mat.onBeforeCompile || api._groundSafeDone) return;
        const gl = renderer.getContext();
        const props = renderer.properties.get(mat);
        const prog = props && props.currentProgram;
        if (!prog || !prog.program) return;
        api._groundSafeDone = true;
        if (gl.getProgramParameter(prog.program, gl.LINK_STATUS)) return;
        console.warn('AEGIS: ground shader failed to link — fallback material');
        const fb = new THREE.MeshStandardMaterial({ map: mat.map, normalMap: mat.normalMap, normalScale: mat.normalScale, roughness: 0.95, metalness: 0, color: mat.color });
        ground.material = fb;
      } catch (e) {}
    };
    /* Аналитический луч по карте высот: трассер пули бросает ~100 лучей
       на выстрел, по сетке из 180 тыс. треугольников это слишком дорого. */
    ground.raycast = function (raycaster, out) {
      const o = raycaster.ray.origin, d = raycaster.ray.direction;
      const far = Math.min(raycaster.far, 400);
      const hAt = (s) => o.y + d.y * s - F.heightAt(o.x + d.x * s, o.z + d.z * s);
      let s0 = raycaster.near;
      if (hAt(s0) < 0) return;
      const step = Math.max(0.35, Math.min(1.0, far / 6));
      while (s0 < far) {
        const s1 = Math.min(far, s0 + step);
        if (hAt(s1) <= 0) {
          let a = s0, b = s1;
          for (let k = 0; k < 12; k++) { const m = (a + b) * 0.5; if (hAt(m) > 0) a = m; else b = m; }
          const s = (a + b) * 0.5, px = o.x + d.x * s, pz = o.z + d.z * s, e = 0.15;
          const nrm = new THREE.Vector3(F.heightAt(px - e, pz) - F.heightAt(px + e, pz), 2 * e,
            F.heightAt(px, pz - e) - F.heightAt(px, pz + e)).normalize();
          out.push({ distance: s, point: new THREE.Vector3(px, o.y + d.y * s, pz), object: ground,
            face: { a: 0, b: 0, c: 0, normal: nrm, materialIndex: 0 } });
          return;
        }
        s0 = s1;
      }
    };
    scene.add(ground);
    api.ground = ground;

    /* мутная вода в низких воронках */
    const wN = envTex(THREE, 'mud_nor', false, 4);
    if (wN) wN.repeat.set(0.7, 0.7);
    /* мутная бурая вода: не зеркало, а торфяная жижа с мягким краем */
    const waterMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.052, 0.040, 0.026), roughness: 0.26, metalness: 0,
      normalMap: wN, normalScale: new THREE.Vector2(0.18, 0.18), envMapIntensity: 0.16,
      transparent: true, depthWrite: false
    });
    waterMat.customProgramCacheKey = () => 'mud-water-v6';
    /* v6: кольца на воде — до 8 источников (шаг, пуля, граната) + капли дождя */
    const RIP = []; for (let i = 0; i < 8; i++) RIP.push(new THREE.Vector4(0, 0, -99, 0));
    const wUni = { uRip: { value: RIP }, uWT: M.windTime, uRainW: { value: 0 } };
    let ripI = 0;
    api.waterRipple = (x, z, amp) => { RIP[ripI].set(x, z, M.windTime.value, amp || 1); ripI = (ripI + 1) % 8; };
    api.waterUniforms = wUni;
    api.waterMat = waterMat; api.waterNormal = wN;
    waterMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, wUni);
      sh.vertexShader = 'varying vec2 vWr;\nvarying vec3 vWw;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWr = position.xy; vWw = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = `varying vec2 vWr;
        varying vec3 vWw;
        uniform vec4 uRip[8];
        uniform float uWT, uRainW;
        vec2 wHash(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
        vec2 wRings(vec2 p) {
          vec2 acc = vec2(0.0);
          for (int i = 0; i < 8; i++) {
            float age = uWT - uRip[i].z;
            if (age < 0.0 || age > 3.0) continue;
            vec2 d = p - uRip[i].xy; float r = length(d);
            float front = age * 0.42;
            float w = exp(-age * 1.3) * uRip[i].w * smoothstep(0.35, 0.0, abs(r - front)) / (1.0 + r * 2.0);
            acc += d / max(r, 1e-3) * sin((r - front) * 38.0) * w;
          }
          if (uRainW > 0.01) {
            vec2 q = p * 3.0, c = floor(q), f = fract(q) - 0.5, h = wHash(c);
            float ph = fract(uWT * (0.9 + h.x * 0.6) + h.y);
            vec2 d = f - (h - 0.5) * 0.5; float r = length(d);
            acc += d / max(r, 1e-3) * sin((r - ph * 0.5) * 60.0) * (1.0 - ph) * smoothstep(0.5, 0.0, abs(r - ph * 0.5) * 6.0) * uRainW * 0.6;
          }
          return acc;
        }
      ` + sh.fragmentShader
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ vec2 rg = wRings(vWw.xz); normal = normalize(normal + (viewMatrix * vec4(rg.x * 0.22, 0.0, rg.y * 0.22, 0.0)).xyz); }')
        .replace('#include <dithering_fragment>',
        '#include <dithering_fragment>\ngl_FragColor.a *= 1.0 - smoothstep(0.55, 1.0, length(vWr));');
    };
    for (const c of F.CRATERS) {
      if (!c.water) continue;
      const w = new THREE.Mesh(new THREE.CircleGeometry(1, 48), waterMat);
      w.rotation.x = -Math.PI / 2;
      w.scale.set(c.R * 0.64, c.R * 0.64, 1);
      w.position.set(c.x, c.h0 - c.D * 0.5, c.z);
      w.receiveShadow = true;
      w.name = 'water';
      scene.add(w);
    }

    /* грунт для вала и доски огневого рубежа (для домика и огорода) */
    if (full) {
      const e = aD.clone(); e.repeat.set(7, 2); e.needsUpdate = true;
      api.earthMat = new THREE.MeshStandardMaterial({ map: e, roughness: 1, metalness: 0, color: new THREE.Color(0.62, 0.58, 0.54) });
    }
    api.padMat = new THREE.MeshStandardMaterial({
      map: canvasTex(THREE, T.woodAlbedo(41, 256, [84, 78, 70]), true), roughness: 0.93, metalness: 0
    });
  }

  /* Карта грунта 128 x 128 м (4 текселя на метр): R — грязь (тропы,
     колея, вытоптанные пятачки, вал, воронки), G — сырость и лужи.
     Рисуется на canvas в мировых метрах, затем размывается и ломается
     шумом. api.mudAt(x, z) отдаёт R — подлесок на грязи не растёт. */
  function groundMask(THREE, api, F) {
    const S = 512, K = S / 128, cv = T.canvas(S, S), g = T.ctx2d(cv), rnd = U.rng(5150);
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.setTransform(K, 0, 0, K, S / 2, S / 2);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = g.lineJoin = 'round';
    const col = (r, w) => 'rgb(' + (r | 0) + ',' + (w | 0) + ',0)';
    const line = (pts, w, r, wet) => {
      g.strokeStyle = col(r, wet); g.lineWidth = w;
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
    };
    const spot = (x, z, rx, rz, r, wet, rot) => {
      g.fillStyle = col(r, wet);
      g.beginPath(); g.ellipse(x, z, rx, rz, rot || 0, 0, TAU); g.fill();
    };
    const FL = FIRE_LINE;
    /* тропа вдоль просеки: к мишеням ходят смотреть пробоины */
    const laneX = (z) => FL.x + Math.sin(z * 0.37) * 0.3 + Math.sin(z * 0.11 + 1) * 0.35;
    const lane = [];
    for (let z = FL.z - 1.4; z > FL.z - 31.5; z -= 1.0) lane.push([laneX(z), z]);
    line(lane, 1.0, 170, 35);
    RANGES.forEach((dist, i) => {
      const x = FL.x + (i - 1.5) * 1.35, z = FL.z - dist;
      line([[laneX(z + 1.8), z + 1.8], [x, z + 0.9]], 0.75, 150, 30);
      spot(x, z + 0.95, 0.95, 0.55, 190, 60);
      spot(x, z - 0.3, 0.75, 0.45, 110, 25);
    });
    /* огневой рубеж и строй */
    spot(FL.x, FL.z, 3.3, 1.8, 170, 40);
    spot(FL.x, FL.z + 1.7, 2.4, 0.9, 200, 80);
    line([[-5.6, 1.7], [-2, 1.95], [2, 1.65], [5.4, 1.85]], 1.5, 130, 25);
    for (const fx of [-8.2, -5.75, 1.75, 4.2]) spot(fx, 1.25, 0.7, 0.55, 120, 35);
    line([[0.3, 2.3], [-0.8, 4.6], [-1.5, 6.5]], 1.0, 150, 35);
    line([[-1.5, 6.5], [1.2, 8.6], [3.9, 8.9]], 1.0, 160, 35);
    /* колея: разбитое полотно и две борозды с водой */
    const tr = F.TRACK;
    const off = (pts, dd) => pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1;
      return [p[0] - ez / l * dd, p[1] + ex / l * dd];
    });
    line(tr, 2.8, 95, 25);
    line(off(tr, 0.8), 0.55, 190, 110);
    line(off(tr, -0.8), 0.55, 190, 110);
    /* v7: старая траншея — тёмная сырая земля и вода на дне */
    if (F.TRENCH) {
      line(F.TRENCH.pts, 2.2, 70, 60);
      line(F.TRENCH.pts, 0.9, 120, 170);
      spot(F.TRENCH.dug[0], F.TRENCH.dug[1], 2.6, 2.2, 90, 50, -F.TRENCH.dug[2]);
    }
    /* вал: свежий грунт, у подножия сыро */
    const B = F.BERM;
    g.fillStyle = col(240, 20);
    g.fillRect(B.x - B.hx + 0.8, B.z - B.hz + 0.4, 2 * B.hx - 1.6, 2 * B.hz - 0.8);
    line([[B.x - B.hx + 1.5, B.z + B.hz - 0.5], [B.x + B.hx - 1.5, B.z + B.hz - 0.5]], 1.3, 90, 150);
    /* воронки: выброс грунта и сырое дно */
    for (const c of F.CRATERS) {
      spot(c.x, c.z, c.R * 1.25, c.R * 1.25, 120, 15);
      spot(c.x, c.z, c.R * 0.8, c.R * 0.8, 120, c.water ? 230 : 110);
    }
    /* v8: овраг — сырое илистое дно, мокрые склоны; болото; волок с вырубки */
    if (F.RV) {
      const pts = F.RV.pts;
      line(pts, 8.5, 45, 70);
      line(pts, 4.2, 110, 150);
      line(pts, 2.0, 150, 255);
    }
    if (F.SW) {
      const W = F.SW;
      spot(W.x, W.z, W.rx * 1.25, W.rz * 1.25, 30, 90);
      spot(W.x, W.z, W.rx * 0.95, W.rz * 0.95, 70, 200);
      for (let k = 0; k < 26; k++) {
        const a = rnd() * TAU, r = Math.sqrt(rnd());
        spot(W.x + Math.cos(a) * W.rx * r, W.z + Math.sin(a) * W.rz * r, 0.8 + rnd() * 2.2, 0.6 + rnd() * 1.5, 60 + rnd() * 60, 120 + rnd() * 120, rnd() * 3);
      }
    }
    if (F.LOGC) {
      const L = F.LOGC;
      spot(L.x, L.z, L.r * 0.9, L.r * 0.75, 70, 30, 0.4);
      const sk = [[L.x + 1, L.z + 1], [-17, 4.2], [-11.5, 8.6], [-6.5, 10.6]];
      line(sk, 2.2, 120, 40);
      line(off(sk, 0.55), 0.45, 170, 120);
      line(off(sk, -0.55), 0.45, 170, 120);
    }
    /* лужи в колее и на тропе */
    for (let k = 0; k < 18; k++) {
      let p, ang;
      if (k < 10) {
        const i = Math.floor(rnd() * 5), t = rnd(), a = tr[i], b = tr[i + 1];
        ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const s = rnd() < 0.5 ? 0.8 : -0.8;
        p = [a[0] + (b[0] - a[0]) * t - Math.sin(ang) * s, a[1] + (b[1] - a[1]) * t + Math.cos(ang) * s];
      } else {
        const q = lane[Math.floor(rnd() * lane.length)];
        ang = Math.PI / 2 + (rnd() - 0.5);
        p = [q[0] + (rnd() - 0.5) * 0.6, q[1]];
      }
      spot(p[0], p[1], 0.5 + rnd() * 0.9, 0.22 + rnd() * 0.25, 60, 255, ang);
    }
    /* натоптанные пятна по поляне */
    for (let k = 0; k < 34; k++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd()) * 0.95;
      spot(CLEARING.x + Math.cos(a) * CLEARING.rx * r, CLEARING.z + Math.sin(a) * CLEARING.rz * r,
        0.4 + rnd() * 1.4, 0.3 + rnd() * 0.9, 60 + rnd() * 80, 20 + rnd() * 40, rnd() * 3);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    const img = g.getImageData(0, 0, S, S).data;
    const R = new Float32Array(S * S), G = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) { R[i] = img[i * 4] / 255; G[i] = img[i * 4 + 1] / 255; }
    blur2(R, S, 2); blur2(G, S, 2);
    const nz = U.fbm(6262, 3, 0.5, 2.0);
    /* v6: массив из двух слоёв: 0 — (грязь, сырость, трава, крона),
       1 — шрамы боя (копоть, вывороченная земля, натоптано) */
    const data2 = new Uint8Array(S * S * 4 * 2);
    const data = data2.subarray(0, S * S * 4);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const k = j * S + i, n = nz(((i + 0.5) / K - 64) * 0.45 + 11, ((j + 0.5) / K - 64) * 0.45 + 5);
      data[k * 4] = U.clamp01(R[k] * (0.7 + 0.6 * n)) * 255;
      data[k * 4 + 1] = U.clamp01(G[k] * (0.6 + 0.8 * n)) * 255;
      data[k * 4 + 3] = 0;
    }
    const tex = new THREE.DataArrayTexture(data2, S, S, 2);
    tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    api.maskData = data; api.maskTex = tex; api.maskS = S; api.maskData2 = data2;
    /* A — «под кроной»: 1 у ствола → 0 на ~2.6·rs м. Сухое тёмное кольцо
       хвои, моховой воротник у комля, корни (шейдер грунта). */
    api.fillCrown = (trees) => {
      for (const t of trees) {
        const Rr = 2.6 * t.rs * (t.dead ? 0.7 : 1);
        const i0 = Math.max(0, Math.floor((t.x - Rr + 64) * K)), i1 = Math.min(S - 1, Math.ceil((t.x + Rr + 64) * K));
        const j0 = Math.max(0, Math.floor((t.z - Rr + 64) * K)), j1 = Math.min(S - 1, Math.ceil((t.z + Rr + 64) * K));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const dx = (i + 0.5) / K - 64 - t.x, dz = (j + 0.5) / K - 64 - t.z;
          const q = 1 - Math.hypot(dx, dz) / Rr;
          if (q <= 0) continue;
          const v = Math.round(255 * Math.min(1, q * (1.08 - 0.08 * q))), o = (j * S + i) * 4 + 3;
          if (v > data[o]) data[o] = v;
        }
      }
      tex.needsUpdate = true;
    };
    /* шрамы: слой 1. ch 0 копоть, 1 земля, 2 натоптано. Загрузка не чаще 4 Гц */
    let scarDirty = false, scarT = 0;
    const L1 = S * S * 4;
    api.scar = (x, z, r, ch, k) => {
      const i0 = Math.max(0, Math.floor((x - r + 64) * K)), i1 = Math.min(S - 1, Math.ceil((x + r + 64) * K));
      const j0 = Math.max(0, Math.floor((z - r + 64) * K)), j1 = Math.min(S - 1, Math.ceil((z + r + 64) * K));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dx = (i + 0.5) / K - 64 - x, dz = (j + 0.5) / K - 64 - z;
        let q = 1 - Math.hypot(dx, dz) / r;
        if (q <= 0) continue;
        q = q * q * (3 - 2 * q) * (0.75 + 0.5 * Math.random());
        const o = L1 + (j * S + i) * 4 + ch;
        data2[o] = Math.min(255, data2[o] + q * k * 255);
      }
      scarDirty = true;
    };
    /* v8: гарь — зола и копоть (слой шрамов, канал 0), неравномерно, пятнами */
    if (F.burnAt) {
      const B = F.BURN, r = B.r * 1.4;
      const i0 = Math.max(0, Math.floor((B.x - r + 64) * K)), i1 = Math.min(S - 1, Math.ceil((B.x + r + 64) * K));
      const j0 = Math.max(0, Math.floor((B.z - r + 64) * K)), j1 = Math.min(S - 1, Math.ceil((B.z + r + 64) * K));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) / K - 64, z = (j + 0.5) / K - 64;
        const b = F.burnAt(x, z) * (0.55 + 0.6 * nz(x * 0.7 + 3, z * 0.7 + 1));
        if (b > 0) { const o = L1 + (j * S + i) * 4; data2[o] = Math.max(data2[o], Math.min(255, b * 210)); }
      }
    }
    api.scarUpdate = (dt) => {
      scarT -= dt;
      if (scarDirty && scarT <= 0) { tex.needsUpdate = true; scarDirty = false; scarT = 0.25; }
    };
    /* v6: сырость (G) — для осоки у воды, луж под дождём, звука шагов */
    api.wetAt = (x, z) => {
      const i = Math.floor((x + 64) * K), j = Math.floor((z + 64) * K);
      if (i < 0 || j < 0 || i >= S || j >= S) return 0;
      return data[(j * S + i) * 4 + 1] / 255;
    };
    api.mudAt = (x, z) => {
      const i = Math.floor((x + 64) * K), j = Math.floor((z + 64) * K);
      if (i < 0 || j < 0 || i >= S || j >= S) return 0;
      return data[(j * S + i) * 4] / 255;
    };
    return { tex };
  }
  /* Двойное размытие окном (почти гаусс) квадратного поля S x S. */
  function blur2(A, S, r) {
    const B = new Float32Array(S * S), w = 2 * r + 1;
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < S; y++) {
        let acc = 0;
        for (let x = -r; x <= r; x++) acc += A[y * S + U.clamp(x, 0, S - 1)];
        for (let x = 0; x < S; x++) {
          B[y * S + x] = acc / w;
          acc += A[y * S + Math.min(S - 1, x + r + 1)] - A[y * S + Math.max(0, x - r)];
        }
      }
      for (let x = 0; x < S; x++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += B[U.clamp(y, 0, S - 1) * S + x];
        for (let y = 0; y < S; y++) {
          A[y * S + x] = acc / w;
          acc += B[Math.min(S - 1, y + r + 1) * S + x] - B[Math.max(0, y - r) * S + x];
        }
      }
    }
  }

  /* ------------------------------------------------------ деревья */
  function scatterTrees(F) {
    const rnd = U.rng(20240925);
    const R = 108, cell = 2.4, trees = [];
    const grid = new Map(), gkey = (i, j) => (i + 512) * 1024 + (j + 512);
    const dens = U.fbm(777, 3, 0.5, 2.0);
    for (let gx = -R; gx < R; gx += cell) {
      for (let gz = -R; gz < R; gz += cell) {
        const x = gx + rnd() * cell, z = gz + rnd() * cell;
        const pick = rnd(), sizeR = rnd(), sizeH = rnd(), vr = rnd(), rot = rnd(), lx = rnd(), lz = rnd(), tint = rnd();
        const d = Math.hypot(x, z - 2);
        if (d > R) continue;
        if (F.clearE(x, z) < 1 || F.laneD(x, z) < 0.8 || F.squadD(x, z) < 6.3) continue;
        if (F.craterD(x, z) < 1.1 || F.trackD(x, z) < 2.4 || inZones(F.noTree, x, z)) continue;
        /* густота растёт от края поляны вглубь, плюс пятна подроста */
        const t = smooth01((d - 10) / 42);
        let p = (0.16 + 0.60 * t) * (0.5 + 0.95 * dens(x * 0.035, z * 0.035));
        /* v8: в болоте лес редкий и угнетённый */
        const swe = F.swampE ? F.swampE(x, z) : 9;
        if (swe < 1.1) p *= 0.35 + 0.5 * smooth01((swe - 0.6) / 0.5);
        if (pick > p) continue;
        /* v8: вырубка — на месте деревьев остаются пни (их ставит 17e) */
        if (F.LOGC && Math.hypot(x - F.LOGC.x, z - F.LOGC.z) < F.LOGC.r * (0.85 + 0.3 * lx)) {
          (F.cuts || (F.cuts = [])).push({ x, z, y: F.heightAt(x, z), rs: 0.72 + sizeR * 0.62, rot: rot * TAU, age: tint });
          continue;
        }
        let ok = true;
        const ci = Math.floor(x / 2.4), cj = Math.floor(z / 2.4);
        for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1 && ok; b++) {
          const lst = grid.get(gkey(ci + a, cj + b));
          if (lst) for (const o of lst) if (Math.hypot(o.x - x, o.z - z) < 1.7) { ok = false; break; }
        }
        if (!ok) continue;
        const tr = {
          x, z, y: F.heightAt(x, z) - 0.05, d,
          rs: 0.72 + sizeR * 0.62, hs: 0.86 + sizeH * 0.34,
          v: Math.floor(vr * 3) % 3, rot: rot * TAU,
          lx: (lx - 0.5) * 0.035, lz: (lz - 0.5) * 0.035, tint, dead: tint > 0.93
        };
        /* v8: гарь — обугленный сухостой; в болоте — больше сухих */
        if (F.burnAt) { const b = F.burnAt(x, z); if (b > 0.35) { tr.dead = true; tr.burnt = b; } }
        if (swe < 1.1 && tint > 0.55) tr.dead = true;
        if (tr.dead) tr.hs *= tr.burnt ? 0.55 + 0.35 * sizeH : 0.8;
        trees.push(tr);
        const k = gkey(ci, cj);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(tr);
      }
    }
    trees.near = (x, z, r) => {
      const ci = Math.floor(x / 2.4), cj = Math.floor(z / 2.4), n = Math.ceil(r / 2.4);
      for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) {
        const lst = grid.get(gkey(ci + a, cj + b));
        if (lst) for (const o of lst) if (Math.hypot(o.x - x, o.z - z) < r + TREE_R * o.rs) return o;
      }
      return null;
    };
    return trees;
  }

  const TREE_H = 21, TREE_R = 0.24;

  /* Одна сосна: ствол с корневым наплывом и лёгким изгибом, сухие сучья
     ниже кроны (в сомкнутом лесу нижние ветви отмирают) и крона из мутовок
     хвойных карточек. lod — упрощённый вариант для деревьев дальше 45 м,
     которые всё равно тонут в дымке. */
  function treeGeometry(THREE, seed, lod) {
    const rnd = U.rng(seed);
    const H = TREE_H, r0 = TREE_R;
    const crown0 = H * (0.56 + rnd() * 0.08);
    const trunk = new Geo(), crown = new Geo();
    const bx = (rnd() - 0.5) * 0.7, bz = (rnd() - 0.5) * 0.7, ph = rnd() * TAU;
    const axis = (y) => [bx * Math.pow(Math.max(y, 0) / H, 1.6) + 0.05 * Math.sin(y * 0.45 + ph), y,
      bz * Math.pow(Math.max(y, 0) / H, 1.6) + 0.05 * Math.cos(y * 0.37 + ph)];
    const radius = (y) => r0 * (1 - 0.8 * Math.pow(Math.max(y, 0) / H, 1.05)) * (1 + 0.55 * Math.exp(-Math.max(y, 0) / 0.3));
    const ys = lod ? [-0.4, 0.3, 1.6, 5, 10, 15, H * 0.86, H]
      : [-0.4, 0, 0.12, 0.3, 0.6, 1.1, 1.9, 3.2, 5, 7.5, 10.5, 13.5, 16.5, 19, H];
    const bumpN = U.noise2D(seed + 3);
    trunk.tube(ys.map(axis), ys.map(radius), lod ? 6 : 10, {
      uRep: 2, vScale: 1.25,
      /* комель темнее и зеленее (мох, влага), выше — ровный тон коры */
      col: (t, p) => mixc([0.40, 0.44, 0.34], [1, 1, 1], smooth01(p[1] / 2.4)),
      bump: lod ? null : (i, j) => (bumpN(j * 0.9, ys[i] * 0.7) - 0.5) * (ys[i] < 0.7 ? 0.5 : 0.1)
    });
    if (!lod) {
      /* сухие сучья */
      const n = 13 + Math.floor(rnd() * 8);
      const dead = () => [0.62, 0.60, 0.58];
      for (let k = 0; k < n; k++) {
        const y = 1.8 + Math.pow(rnd(), 0.8) * (crown0 - 1.4);
        const a = rnd() * TAU, L = (0.25 + rnd() * 0.9) * (0.5 + 0.8 * y / crown0);
        const droop = -0.12 - rnd() * 0.55;
        const dir = [Math.cos(a) * Math.cos(droop), Math.sin(droop), Math.sin(a) * Math.cos(droop)];
        const c = axis(y), rr = radius(y) * 0.85;
        const p0 = [c[0] + dir[0] * rr, c[1], c[2] + dir[2] * rr];
        const p1 = v3add(p0, dir, L * 0.5), p2 = v3add(v3add(p0, dir, L), [0, -1, 0], L * 0.12);
        const br = 0.022 + 0.018 * rnd();
        trunk.tube([v3add(p0, dir, -rr * 0.6), p1, p2], [br, br * 0.55, 0.004], 4,
          { uRep: 1, vScale: 1.25, u0: rnd(), col: dead });
        if (L > 0.6 && rnd() < 0.7) {
          const sa = a + (rnd() < 0.5 ? 0.7 : -0.7), sd = [Math.cos(sa) * 0.8, -0.2 - rnd() * 0.3, Math.sin(sa) * 0.8];
          trunk.tube([p1, v3add(p1, sd, L * 0.35)], [br * 0.45, 0.003], 3, { uRep: 1, vScale: 1.25, col: dead });
        }
      }
    }
    /* крона: мутовки веток-карточек, профиль сосны — шире в середине,
       узкая макушка. Нормали карточек «сферические» (наружу + вверх),
       иначе плоские квады освещаются пятнами. */
    const whorl = lod ? 1.9 : 0.8;
    let ga = rnd() * TAU;
    for (let y = crown0; y < H - 0.4; y += whorl * (0.8 + rnd() * 0.4)) {
      const t = (y - crown0) / (H - crown0);
      const Lm = 0.9 + 2.5 * Math.pow(Math.sin(Math.PI * U.clamp(0.16 + 0.84 * t, 0, 1)), 0.7) * (1 - 0.25 * t);
      const nb = lod ? 4 : 5;
      for (let b = 0; b < nb; b++) {
        ga += 2.39996;                      // золотой угол
        const a = ga + (rnd() - 0.5) * 0.4;
        const L = Lm * (0.75 + rnd() * 0.45) * (lod ? 1.2 : 1);
        const pitch = -0.38 + 0.7 * t + (rnd() - 0.5) * 0.25;
        const c = axis(y + (rnd() - 0.5) * 0.3);
        const dh = [Math.cos(a), 0, Math.sin(a)];
        const dir = [dh[0] * Math.cos(pitch), Math.sin(pitch), dh[2] * Math.cos(pitch)];
        const side0 = v3norm(v3cross(dir, [0, 1, 0]));
        const up0 = v3cross(side0, dir);
        const side = v3norm(v3add(side0, up0, Math.tan((rnd() - 0.5) * 0.7)));
        const nrm = v3norm([dh[0] * 0.55, 0.9, dh[2] * 0.55]);
        const segs = lod ? 2 : 3;
        const axisPts = [], sides = [], widths = [], nrms = [];
        for (let k = 0; k < segs; k++) {
          const u = k / (segs - 1);
          axisPts.push(v3add(v3add(c, dir, 0.05 + u * L), [0, -1, 0], u * u * L * 0.22));
          sides.push(side); widths.push(L * 0.62); nrms.push(nrm);
        }
        const col = (u) => mixc([0.62, 0.62, 0.60], [1, 1, 1], u);
        crown.strip(axisPts, sides, widths, nrms, col, true);
        if (!lod) {
          const upv = v3norm(v3cross(side, dir));
          crown.strip(axisPts, axisPts.map(() => upv), widths.map((w) => w * 0.8), nrms, col, true);
        }
      }
    }
    /* макушка */
    for (let b = 0; b < 3; b++) {
      const a = b * 2.1 + rnd();
      const c = axis(H - 0.6), dir = v3norm([Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35]);
      const side = v3norm(v3cross(dir, [Math.sin(a), 0, -Math.cos(a)]));
      crown.strip([c, v3add(c, dir, 1.3)], [side, side], [0.8, 0.8], [[0, 1, 0]], null, true);
    }
    return { trunk: trunk.build(THREE), crown: crown.build(THREE), crown0 };
  }

  /* ============================================ v6: дальние деревья ===
     Октаэдрические импостеры (R. Brucks, «Octahedral Impostors», Fortnite /
     UE4; полусферный вариант для объектов на земле). Дальняя LOD-сосна
     заранее снимается ортокамерой с 8 × 8 направлений полусферы
     (hemi-octahedral раскладка) в атлас альбедо и атлас нормалей. Каждое
     дерево дальше 62 м — один квад к камере; в шейдере направление взгляда
     (в системе дерева, с учётом поворота) переводится в координату сетки,
     4 ближайших кадра смешиваются билинейно. Освещение — штатное
     MeshStandard (HDRI, солнце, «живой» туман) по нормали из атласа, крона
     качается тем же ветром (fwWind), что и вблизи. */
  function makeImpostorSystem(THREE, api, M, farGeos, list, group, fallback) {
    const N = 8, RES = 1024, FR = RES / N;
    const E = FENV;
    return function bake(renderer) {
      const cur = renderer.getRenderTarget();
      const vp = new THREE.Vector4(); renderer.getViewport(vp);
      const sci = renderer.getScissorTest();
      const cc = new THREE.Color(); renderer.getClearColor(cc); const ca = renderer.getClearAlpha();
      const atl = [];
      const bakeV = farGeos.map((G) => {
        G.trunk.computeBoundingBox(); G.crown.computeBoundingBox();
        const bb = G.trunk.boundingBox.clone().union(G.crown.boundingBox);
        const c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
        const rh = Math.max(Math.abs(bb.max.x - c.x), Math.abs(bb.min.x - c.x), Math.abs(bb.max.z - c.z), Math.abs(bb.min.z - c.z)) * 1.08;
        const R = sz.length() * 0.5;
        return { G, c, rh, R, hh: Math.max(sz.y * 0.5 * 1.02, rh) };
      });
      const vs = `varying vec2 vUv; varying vec3 vN, vP, vC;
        attribute vec3 color;
        void main() { vUv = uv; vC = color; vN = normalize(mat3(modelMatrix) * normal); vP = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }`;
      const mk = (map, col, aT, normalPass, crown, cen) => new THREE.ShaderMaterial({
        uniforms: { map: { value: map }, uC: { value: col }, uCen: { value: cen } },
        vertexShader: vs, side: THREE.DoubleSide,
        fragmentShader: `uniform sampler2D map; uniform vec3 uC, uCen; varying vec2 vUv; varying vec3 vN, vP, vC;
          void main() {
            vec4 t = texture2D(map, vUv);
            if (t.a < ${aT.toFixed(2)}) discard;
            ${normalPass
              ? `vec3 n = normalize(vN); ${crown ? 'vec3 s = normalize(vP - uCen); s.y = s.y * 0.6 + 0.35; n = normalize(mix(faceforward(n, -s, n), normalize(s), 0.65));' : ''}
                 gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);`
              : 'gl_FragColor = vec4(t.rgb * uC * vC, 1.0);'}
          }`
      });
      const scn = new THREE.Scene();
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
      const decode = (ex, ey) => {
        const tx = (ex + ey) * 0.5, tz = (ex - ey) * 0.5;
        return new THREE.Vector3(tx, 1 - Math.abs(tx) - Math.abs(tz), tz).normalize();
      };
      try {
        for (const B of bakeV) {
          const out = [];
          for (let pass = 0; pass < 2; pass++) {
            const rt = new THREE.WebGLRenderTarget(RES, RES, { type: THREE.HalfFloatType, depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
            const cen = new THREE.Vector3(B.c.x, B.c.y + B.hh * 0.3, B.c.z);
            const crownCen = new THREE.Vector3(0, B.G.crown.boundingBox.getCenter(new THREE.Vector3()).y, 0);
            const mt = mk(M.bark.map, M.bark.color, 0.0, pass === 1, false, cen);
            const mc = mk(M.needles.map, M.needles.color, 0.42, pass === 1, true, crownCen);
            const t = new THREE.Mesh(B.G.trunk, mt), c = new THREE.Mesh(B.G.crown, mc);
            scn.clear(); scn.add(t, c);
            rt.scissorTest = false; rt.viewport.set(0, 0, RES, RES);
            renderer.setRenderTarget(rt);
            /* v10: фон атласа нормалей — (0,0,0,0), как у альбедо: нормаль хранится
               «предумноженной» на покрытие и корректно смешивается мипами и
               билинейно; прежний фон 0x8080ff на краях хвои давал нормаль +Z
               дерева — со стороны такие пиксели были в тени: тёмные «дыры»
               в дальних кронах */
            renderer.setClearColor(0x000000, 0);
            renderer.clear(true, true, true);
            for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
              const d = decode(i / (N - 1) * 2 - 1, j / (N - 1) * 2 - 1);
              cam.left = -B.rh; cam.right = B.rh; cam.top = B.hh; cam.bottom = -B.hh;
              cam.position.copy(B.c).addScaledVector(d, B.R * 3);
              cam.up.set(0, 1, 0);
              if (d.y > 0.985) cam.up.set(0, 0, -1);
              cam.near = 0.1; cam.far = B.R * 6;
              cam.lookAt(B.c); cam.updateProjectionMatrix();
              rt.viewport.set(i * FR, j * FR, FR, FR);
              rt.scissor.set(i * FR, j * FR, FR, FR); rt.scissorTest = true;
              renderer.setRenderTarget(rt);
              renderer.render(scn, cam);
            }
            rt.scissorTest = false; rt.viewport.set(0, 0, RES, RES);
            out.push(rt);
            mt.dispose(); mc.dispose();
          }
          atl.push(out);
        }
      } finally {
        renderer.setScissorTest(sci);
        renderer.setRenderTarget(cur);
        renderer.setViewport(vp);
        renderer.setClearColor(cc, ca);
      }
      /* меш импостеров: по одному кваду на дерево, InstancedBufferGeometry */
      const meshes = [];
      bakeV.forEach((B, v) => {
        const L = list.filter((t) => (t.v & 1) === v);
        if (!L.length) return;
        const q = new THREE.PlaneGeometry(2, 2); q.translate(0, 1, 0);
        const g = new THREE.InstancedBufferGeometry();
        g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv); g.setAttribute('normal', q.attributes.normal);
        const A = new Float32Array(L.length * 4), Sx = new Float32Array(L.length * 4);
        L.forEach((t, i) => {
          A[i * 4] = t.x; A[i * 4 + 1] = t.y; A[i * 4 + 2] = t.z; A[i * 4 + 3] = t.rot;
          Sx[i * 4] = t.rs; Sx[i * 4 + 1] = t.hs; Sx[i * 4 + 2] = 0.84 + t.tint * 0.3; Sx[i * 4 + 3] = t.dead ? 1 : 0;
        });
        g.setAttribute('aT', new THREE.InstancedBufferAttribute(A, 4));
        g.setAttribute('aS', new THREE.InstancedBufferAttribute(Sx, 4));
        g.instanceCount = L.length;
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, 2), 140);
        const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, color: new THREE.Color(1, 1, 1) });
        const u = Object.assign({ tAlb: { value: atl[v][0].texture }, tNrm: { value: atl[v][1].texture },
          uRh: { value: B.rh }, uHh: { value: B.hh }, uCen: { value: B.c.clone() }, uTimeI: M.windTime }, E ? E.uniforms : {});
        mat.customProgramCacheKey = () => 'tree-impostor-v12';
        mat.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, u);
          sh.vertexShader = `attribute vec4 aT; attribute vec4 aS;
            varying vec3 vFolWP; varying float vFolH;
            uniform float uRh, uHh, uTimeI; uniform vec3 uCen;
            varying vec2 vGrid; varying vec2 vQ; varying float vYaw, vTint;
            ${E ? E.GLSL : ''}
            vec2 hoEnc(vec3 v) { v /= (abs(v.x) + abs(v.y) + abs(v.z)); return vec2(v.x + v.z, v.x - v.z); }
            ` + sh.vertexShader
            .replace('#include <beginnormal_vertex>', `
              vec3 iBase = aT.xyz;
              vec3 iCen = iBase + vec3(0.0, uCen.y * aS.y, 0.0);
              vec3 toC = cameraPosition - iCen;
              vec3 vd = normalize(toC);
              float cy = cos(aT.w), sy = sin(aT.w);
              /* в систему дерева: обратный поворот вокруг Y (Euler y = rot) */
              vec3 lv = vec3(cy * vd.x - sy * vd.z, max(vd.y, 0.0), sy * vd.x + cy * vd.z);
              lv = normalize(lv + vec3(0.0, 1e-4, 0.0));
              vGrid = (hoEnc(lv) * 0.5 + 0.5) * ${(N - 1).toFixed(1)};
              vYaw = aT.w; vTint = aS.z;
              vec3 objectNormal = vd;`)
            .replace('#include <begin_vertex>', `
              vec3 rgt = normalize(cross(vec3(0.0, 1.0, 0.0), vd));
              vec3 upv = normalize(cross(vd, rgt));
              vQ = uv;
              vec3 transformed = iCen + rgt * position.x * uRh * aS.x + upv * (position.y - 1.0) * uHh * aS.y;
              ${E ? `float wh = clamp(position.y - 0.9, 0.0, 1.1);
              transformed += fwWind(iBase, wh * wh * 2.0, uTimeI, 0.3) * 0.05 + fwBlast(iBase, wh * 0.25, uTimeI);` : ''}`)
            .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);\ngl_Position = projectionMatrix * mvPosition;\nvFolH = clamp((transformed.y - iBase.y - 11.0 * aS.y) / (10.0 * aS.y), 0.0, 1.0);\nvFolWP = transformed;')
            .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(transformed, 1.0);');
          sh.fragmentShader = `uniform sampler2D tAlb, tNrm;
            varying vec2 vGrid; varying vec2 vQ; varying float vYaw, vTint;
            varying vec3 vFolWP; varying float vFolH;
            ` + sh.fragmentShader
            .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + FOLIAGE_FRAG)
            .replace('#include <map_fragment>', `
              vec2 g0 = floor(vGrid), gf = vGrid - g0;
              g0 = clamp(g0, 0.0, ${(N - 2).toFixed(1)});
              gf = clamp(vGrid - g0, 0.0, 1.0);
              vec2 qq = clamp(vQ, 0.004, 0.996) / ${N.toFixed(1)};
              vec4 a00 = texture2D(tAlb, g0 / ${N.toFixed(1)} + qq);
              vec4 a10 = texture2D(tAlb, (g0 + vec2(1.0, 0.0)) / ${N.toFixed(1)} + qq);
              vec4 a01 = texture2D(tAlb, (g0 + vec2(0.0, 1.0)) / ${N.toFixed(1)} + qq);
              vec4 a11 = texture2D(tAlb, (g0 + vec2(1.0, 1.0)) / ${N.toFixed(1)} + qq);
              vec4 alb = mix(mix(a00, a10, gf.x), mix(a01, a11, gf.x), gf.y);
              if (alb.a < 0.5) discard;
              /* v10: нормаль — из тех же 4 кадров с теми же весами, что и
                 альбедо (раньше — из одного ближайшего кадра: где его пиксель
                 был фоном, а смешанный альфа-канал уже «хвоя», нормаль
                 бралась от фона), с предумноженным декодированием */
              vec4 n00 = texture2D(tNrm, g0 / ${N.toFixed(1)} + qq);
              vec4 n10 = texture2D(tNrm, (g0 + vec2(1.0, 0.0)) / ${N.toFixed(1)} + qq);
              vec4 n01 = texture2D(tNrm, (g0 + vec2(0.0, 1.0)) / ${N.toFixed(1)} + qq);
              vec4 n11 = texture2D(tNrm, (g0 + vec2(1.0, 1.0)) / ${N.toFixed(1)} + qq);
              vec4 nb = mix(mix(n00, n10, gf.x), mix(n01, n11, gf.x), gf.y);
              vec3 nL = nb.rgb * 2.0 - vec3(nb.a);
              nL = dot(nL, nL) > 1e-6 ? normalize(nL) : vec3(0.0, 1.0, 0.0);
              diffuseColor.rgb *= alb.rgb / max(alb.a, 1e-3) * vTint;`)
            .replace('#include <normal_fragment_begin>', `
              float cy = cos(vYaw), sy = sin(vYaw);
              vec3 nW = normalize(vec3(cy * nL.x + sy * nL.z, nL.y, -sy * nL.x + cy * nL.z));
              vec3 normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
              vec3 nonPerturbedNormal = normal;
              float faceDirection = 1.0;`)
            .replace('#include <normal_fragment_maps>', '');
        };
        const m = new THREE.Mesh(g, mat);
        m.frustumCulled = false; m.name = 'tree_impostors' + v; m.userData.noAO = true;
        m.castShadow = false; m.receiveShadow = false;
        group.add(m); meshes.push(m);
      });
      for (const f of fallback) f.visible = false;
      api.impostors = { meshes, atlases: atl, count: list.length };
      return api.impostors;
    };
  }

  function buildTrees(THREE, scene, api, F, M, trees) {
    const g = new THREE.Group();
    g.name = 'forest';
    const NEAR_R = 40, SHADOW_R = 30, SECT = 8;
    const nearV = [0, 1, 2].map((v) => treeGeometry(THREE, 101 + v * 17, false));
    const farV = [0, 1].map((v) => treeGeometry(THREE, 501 + v * 23, true));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(),
      sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color();
    const place = (t) => {
      eu.set(t.lx, t.rot, t.lz); q.setFromEuler(eu);
      sc.set(t.rs, t.hs, t.rs); ps.set(t.x, t.y, t.z);
      return m4.compose(ps, q, sc);
    };
    const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
    const tintOf = (t) => t.burnt ? col.setRGB(0.16 + 0.1 * (1 - t.burnt), 0.145 + 0.09 * (1 - t.burnt), 0.135 + 0.08 * (1 - t.burnt)) : t.dead ? col.setRGB(0.92, 1.0, 1.12) : col.setRGB(0.84 + t.tint * 0.3, 0.84 + t.tint * 0.28, 0.84 + t.tint * 0.26);
    const makeSet = (list, geos, near, name, shadow) => {
      if (!list.length) return;
      const trunk = new THREE.InstancedMesh(geos.trunk, M.bark, list.length);
      const crown = new THREE.InstancedMesh(geos.crown, M.needles, list.length);
      list.forEach((t, i) => {
        const m = place(t);
        trunk.setMatrixAt(i, m); crown.setMatrixAt(i, t.dead ? ZERO : m);
        trunk.setColorAt(i, tintOf(t));
      });
      trunk.name = name + '_trunk'; crown.name = name + '_crown';
      /* Тени отбрасывают только ближние стволы: карта теней покрывает
         ±26 м вокруг камеры. Кроны теней не дают — под пасмурным небом
         пятнистой тени от полога нет, а альфа-карточки в карте теней
         были самой дорогой частью кадра. */
      trunk.castShadow = !!shadow; trunk.receiveShadow = near;
      crown.castShadow = false; crown.receiveShadow = false;
      crown.userData.noAO = true;               // альфа-карточки не участвуют в GTAO
      trunk.computeBoundingSphere(); crown.computeBoundingSphere();
      g.add(trunk, crown);
    };
    for (let v = 0; v < 3; v++) {
      makeSet(trees.filter((t) => t.d < SHADOW_R && t.v === v), nearV[v], true, 'tree_s' + v, true);
      makeSet(trees.filter((t) => t.d >= SHADOW_R && t.d < NEAR_R && t.v === v), nearV[v], true, 'tree_n' + v, false);
    }
    /* дальние — секторами, чтобы работал фрустум-каллинг; дальше IMP_R —
       отдельные наборы, которые после «запекания» импостеров скрываются */
    const IMP_R = 62, impFall = [];
    for (let s = 0; s < SECT; s++) {
      for (let v = 0; v < 2; v++) {
        for (let band = 0; band < 2; band++) {
          const n0 = g.children.length;
          makeSet(trees.filter((t) => {
            if (t.d < NEAR_R || (t.v & 1) !== v) return false;
            const imp = t.d >= IMP_R && !t.dead;
            if (band === 0 ? imp : !imp) return false;
            const a = Math.atan2(t.z - 2, t.x) + Math.PI;
            return Math.min(SECT - 1, Math.floor(a / TAU * SECT)) === s;
          }), farV[v], false, 'tree_f' + s + '_' + v + (band ? 'x' : ''));
          if (band === 1) for (let k = n0; k < g.children.length; k++) impFall.push(g.children[k]);
        }
      }
    }
    api.makeImpostors = makeImpostorSystem(THREE, api, M, farV, trees.filter((t) => t.d >= IMP_R && !t.dead), g, impFall);
    /* сухостой вдали оставляем геометрией: у импостера нет кроны без хвои */
    api.impostorFallback = impFall;
    scene.add(g);
    api.forest = g;
    api.treeCount = trees.length;

    /* коллизии стволов в пределах игровой зоны.
       v10: зона — до внешнего края минного поля (туда игрок может дойти:
       20_player ограничивает |x| < 34,9, |z| < 39,9). Раньше коллизии были
       только до 31/36 м — 83 ствола у края участка игрок проходил насквозь. */
    for (const t of trees) {
      if (Math.abs(t.x) < PLAY_X && Math.abs(t.z) < PLAY_Z)
        api.colliders.push({ type: 'cyl', x: t.x, z: t.z, r: TREE_R * t.rs * 1.1 + 0.03, h: 3, tree: true });
    }

    /* Попадания пуль: аналитические вертикальные цилиндры вместо
       рейкаста по инстансам (тысячи мешей на каждом шаге трассера). */
    const grid = new Map(), CELL = 8;
    const key = (i, j) => (i + 256) * 512 + (j + 256);
    for (const t of trees) {
      /* All trees have ballistic proxies, independent of visual LOD. */
      const k = key(Math.floor(t.x / CELL), Math.floor(t.z / CELL));
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(t);
    }
    const proxy = new THREE.Object3D();
    proxy.name = 'trees';
    const test = (t, o, d, near, far, out) => {
      const r = TREE_R * t.rs * 0.95;
      const ox = o.x - t.x, oz = o.z - t.z;
      const A = d.x * d.x + d.z * d.z;
      if (A < 1e-9) return;
      const B = 2 * (ox * d.x + oz * d.z), C = ox * ox + oz * oz - r * r;
      const disc = B * B - 4 * A * C;
      if (disc < 0) return;
      const s = (-B - Math.sqrt(disc)) / (2 * A);
      if (s < near || s > far) return;
      const y = o.y + d.y * s;
      if (y < t.y - 0.2 || y > t.y + TREE_H * t.hs * 0.8) return;
      const px = o.x + d.x * s, pz = o.z + d.z * s;
      out.push({ exitDistance: (-B+Math.sqrt(disc))/(2*A), distance: s, point: new THREE.Vector3(px, y, pz), object: proxy, tree: t,
        face: { a: 0, b: 0, c: 0, normal: new THREE.Vector3(px - t.x, 0, pz - t.z).normalize(), materialIndex: 0 } });
    };
    proxy.raycast = function (raycaster, out) {
      const o = raycaster.ray.origin, d = raycaster.ray.direction;
      const far = Math.min(raycaster.far, 200), near = raycaster.near;
      const x1 = o.x + d.x * far, z1 = o.z + d.z * far;
      const i0 = Math.floor(Math.min(o.x, x1) / CELL) - 1, i1 = Math.floor(Math.max(o.x, x1) / CELL) + 1;
      const j0 = Math.floor(Math.min(o.z, z1) / CELL) - 1, j1 = Math.floor(Math.max(o.z, z1) / CELL) + 1;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const lst = grid.get(key(i, j));
        if (lst) for (const t of lst) test(t, o, d, near, far, out);
      }
    };
    const props = new THREE.Group();
    props.name = 'props';
    props.add(proxy);
    scene.add(props);
    api.props = props;
  }

  /* ===================================================== v6: детали ===
     Правила расстановки (как «ecotope rules» в Horizon Zero Dawn/Far Cry 5:
     каждый объект — от условий места, а не случайно по площади):
     - пни — по кромке поляны (здесь рубили лес), с годичными кольцами на
       срезе, корневыми лапами, мхом с северной стороны и сверху;
     - муравейник — у пня с южной, солнечной стороны;
     - опята — гроздьями у основания пней; боровики — у ёлочек и во мху;
       мухоморы — редко, по опушке;
     - поверхностные корни — у ближних сосен (3–5 лап, уходят в землю);
     - сфагнум — подушками по краю воды в воронках и на сырых местах;
     - кислица — ковриками у подроста ели (тень, кислая подстилка);
     - иван-чай — редкими куртинами на солнечной опушке. */
  function detailCanvases() {
    const C = {};
    /* срез пня: годичные кольца, тёмное ядро, трещины, серое выветривание, кора по краю */
    {
      const S = 256, c = T.canvas(S, S), g = T.ctx2d(c), rnd = U.rng(4242), m = S / 2;
      g.fillStyle = '#8c7b63'; g.fillRect(0, 0, S, S);
      const nz = U.noise2D(77);
      for (let r = 2; r < m * 0.9; r += 2.2 + rnd() * 3.2) {
        g.beginPath();
        for (let k = 0; k <= 64; k++) {
          const a = k / 64 * TAU, w = r * (1 + 0.04 * (nz(Math.cos(a) * 2 + r * 0.02, Math.sin(a) * 2) - 0.5));
          const x = m + Math.cos(a) * w, y = m + Math.sin(a) * w * 0.97;
          if (k) g.lineTo(x, y); else g.moveTo(x, y);
        }
        const dk = 60 + rnd() * 40;
        g.strokeStyle = `rgba(${dk | 0},${dk * 0.82 | 0},${dk * 0.62 | 0},${0.45 + rnd() * 0.35})`;
        g.lineWidth = 0.8 + rnd() * 1.2; g.stroke();
      }
      const hg = g.createRadialGradient(m, m, 0, m, m, m * 0.42);
      hg.addColorStop(0, 'rgba(70,48,30,0.55)'); hg.addColorStop(1, 'rgba(70,48,30,0)');
      g.fillStyle = hg; g.fillRect(0, 0, S, S);
      for (let k = 0; k < 7; k++) {
        const a = rnd() * TAU, l0 = rnd() * m * 0.2, l1 = m * (0.4 + rnd() * 0.48);
        g.strokeStyle = 'rgba(30,22,15,0.8)'; g.lineWidth = 1 + rnd() * 1.6;
        g.beginPath(); g.moveTo(m + Math.cos(a) * l0, m + Math.sin(a) * l0);
        g.lineTo(m + Math.cos(a + 0.05) * l1, m + Math.sin(a + 0.05) * l1); g.stroke();
      }
      const wg = g.createRadialGradient(m, m, m * 0.3, m, m, m * 0.92);
      wg.addColorStop(0, 'rgba(140,138,128,0.0)'); wg.addColorStop(1, 'rgba(120,118,110,0.45)');
      g.fillStyle = wg; g.fillRect(0, 0, S, S);
      g.lineWidth = m * 0.12; g.strokeStyle = '#3b2e24';
      g.beginPath(); g.arc(m, m, m * 0.94, 0, TAU); g.stroke();
      /* мох по краю среза */
      for (let k = 0; k < 40; k++) {
        const a = rnd() * TAU, rr = m * (0.72 + rnd() * 0.2);
        g.fillStyle = `rgba(${50 + rnd() * 30 | 0},${70 + rnd() * 30 | 0},${20 + rnd() * 15 | 0},${0.5 + rnd() * 0.4})`;
        g.beginPath(); g.arc(m + Math.cos(a) * rr, m + Math.sin(a) * rr, 3 + rnd() * 9, 0, TAU); g.fill();
      }
      C.rings = c;
    }
    /* подстилка муравейника: короткая рыжая хвоя и веточки */
    {
      const S = 256, c = T.canvas(S, S), g = T.ctx2d(c), rnd = U.rng(5151);
      g.fillStyle = '#4a3220'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 4200; i++) {
        const x = rnd() * S, y = rnd() * S, a = rnd() * TAU, l = 3 + rnd() * 7;
        const k = 0.6 + rnd() * 0.6;
        g.strokeStyle = `rgb(${120 * k | 0},${78 * k | 0},${42 * k | 0})`; g.lineWidth = 0.8 + rnd() * 0.7;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      C.hill = c;
    }
    /* сфагнум: звёздочки головок */
    {
      const S = 256, c = T.canvas(S, S), g = T.ctx2d(c), rnd = U.rng(6363);
      g.fillStyle = '#5b6428'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 1400; i++) {
        const x = rnd() * S, y = rnd() * S, r = 2 + rnd() * 3.5, k = 0.75 + rnd() * 0.6;
        g.fillStyle = `rgb(${140 * k | 0},${150 * k | 0},${70 * k | 0})`;
        for (let j = 0; j < 5; j++) { const a = j / 5 * TAU + rnd(); g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.55, r * 0.22, a, 0, TAU); g.fill(); }
        g.fillStyle = `rgba(40,45,15,0.5)`; g.beginPath(); g.arc(x, y, r * 0.25, 0, TAU); g.fill();
      }
      C.sph = c;
    }
    /* кислица: тройчатый лист (три «сердечка») + белый цветок справа */
    {
      const c = T.canvas(128, 64), g = T.ctx2d(c);
      g.clearRect(0, 0, 128, 64);
      for (let k = 0; k < 3; k++) {
        g.save(); g.translate(32, 32); g.rotate(k / 3 * TAU - Math.PI / 2);
        g.fillStyle = '#5e8f2e';
        g.beginPath(); g.moveTo(0, 0);
        g.bezierCurveTo(-20, 4, -20, 26, -6, 28); g.quadraticCurveTo(0, 22, 0, 18);
        g.quadraticCurveTo(0, 22, 6, 28); g.bezierCurveTo(20, 26, 20, 4, 0, 0); g.fill();
        g.strokeStyle = 'rgba(160,200,110,0.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 2); g.lineTo(0, 20); g.stroke();
        g.restore();
      }
      for (let k = 0; k < 5; k++) {
        g.save(); g.translate(96, 32); g.rotate(k / 5 * TAU);
        g.fillStyle = '#f2efe8'; g.beginPath(); g.ellipse(0, -12, 8, 13, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(170,120,170,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -20); g.stroke();
        g.restore();
      }
      g.fillStyle = '#e8d070'; g.beginPath(); g.arc(96, 32, 3, 0, TAU); g.fill();
      C.sorrel = c;
    }
    return C;
  }

  function buildDetails(THREE, scene, api, F, M, trees) {
    const rnd = U.rng(9191), H = F.heightAt;
    const blocked = (x, z, r) => inZones(api._noGrass, x, z) || !!trees.near(x, z, r) || F.squadD(x, z) < 1.6 || F.laneD(x, z) < 1.2 || F.trackD(x, z) < 2.4 || F.craterD(x, z) < 1.0;
    const inPlay = (x, z) => Math.abs(x) < PLAY_X && Math.abs(z) < PLAY_Z;
    const st = { stumps: 0, anthills: 0, mush: 0, sorrel: 0, fireweed: 0, sphagnum: 0, roots: 0 };
    const CV = detailCanvases();
    const ctex = (c, srgb, rep) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (rep) t.repeat.set(rep, rep); return t; };
    const bark = new Geo(), tops = new Geo(), hill = new Geo(), sph = new Geo(), mush = new Geo();
    /* диск-срез с UV радиусом 0.5 и поворотом */
    const disk = (G, c, nrm, r, seg, rot, col) => {
      const ref = Math.abs(nrm[1]) > 0.7 ? [1, 0, 0] : [0, 1, 0];
      const nx = v3norm(v3cross(ref, nrm)), ny = v3cross(nrm, nx);
      const ci = G.vert(c, nrm, [0.5, 0.5], col);
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * TAU, cs = Math.cos(a), sn = Math.sin(a);
        G.vert([c[0] + (nx[0] * cs + ny[0] * sn) * r, c[1] + (nx[1] * cs + ny[1] * sn) * r, c[2] + (nx[2] * cs + ny[2] * sn) * r],
          nrm, [0.5 + Math.cos(a + rot) * 0.5, 0.5 + Math.sin(a + rot) * 0.5], col);
      }
      for (let j = 0; j < seg; j++) G.i.push(ci, ci + 1 + j, ci + 2 + j);
    };
    /* корень: от точки у ствола наружу, горбится и уходит в землю */
    const root = (x, z, a, r0, L, rad) => {
      const pts = [], radii = [];
      for (let k = 0; k <= 5; k++) {
        const u = k / 5, d = r0 + u * L, aa = a + Math.sin(u * 2.2 + a) * 0.18;
        const px = x + Math.cos(aa) * d, pz = z + Math.sin(aa) * d;
        pts.push([px, H(px, pz) + rad * (0.55 - 1.4 * u * u) + Math.sin(u * Math.PI) * 0.03 + (1 - u) * 0.05, pz]);
        radii.push(rad * (1 - 0.7 * u));
      }
      bark.tube(pts, radii, 6, { uRep: 1, vScale: 1.25, u0: rnd(), col: () => [0.62, 0.62, 0.55] });
      st.roots++;
    };

    /* ---------------- пни */
    const stumps = [];
    for (let tries = 0; tries < 2500 && stumps.length < 16; tries++) {
      const a = rnd() * TAU, d = 8 + rnd() * 30;
      const x = Math.cos(a) * d, z = 2 + Math.sin(a) * d;
      const e = F.clearE(x, z);
      if (e < 0.97 || e > 1.9 || blocked(x, z, 1.1) || (api.mudAt && api.mudAt(x, z) > 0.3)) continue;
      if (stumps.some((s) => Math.hypot(s.x - x, s.z - z) < 4.5)) continue;
      const r = 0.17 + rnd() * 0.14, h = 0.18 + rnd() * 0.36, y = H(x, z), ph = rnd() * TAU, old = rnd();
      const ys = [-0.15, 0, 0.04, 0.1, 0.2, h * 0.65, h];
      bark.tube(ys.map((v) => [x, y + v, z]), ys.map((v) => r * (1 + 0.45 * Math.exp(-Math.max(v, 0) / 0.08))), 16, {
        uRep: 2, vScale: 1.25, u0: rnd(),
        col: (t, p) => mixc([0.42, 0.48, 0.32], [0.84, 0.8, 0.76], smooth01((p[1] - y) / 0.3)),
        bump: (i, j) => (i < 4 ? 0.3 * Math.pow(Math.max(0, Math.cos(j / 16 * TAU * 5 + ph)), 3) * (1 - i / 4) : 0)
      });
      const tl = (rnd() - 0.5) * 0.22;
      const tint = mixc([1, 1, 1], [0.72, 0.74, 0.7], old);       // старый пень серее
      disk(tops, [x, y + h + 0.002, z], v3norm([tl, 1, tl * 0.6]), r * 1.01, 20, rnd() * TAU, tint);
      for (let k = 0, n = 4 + (rnd() * 3 | 0); k < n; k++) root(x, z, ph + k / n * TAU + (rnd() - 0.5) * 0.4, r * 0.9, 0.35 + rnd() * 0.6, 0.05 + rnd() * 0.03);
      if (inPlay(x, z)) api.colliders.push({ type: 'cyl', x, z, r: r + 0.06, h });
      stumps.push({ x, z, r, h, y });
    }
    st.stumps = stumps.length;
    api.stumps = stumps;

    /* ---------------- корни ближних сосен */
    for (const t of trees) {
      if (t.d > 34 || F.clearE(t.x, t.z) < 0.9) continue;
      const rt = TREE_R * t.rs, n = 3 + ((t.tint * 97) % 3 | 0), a0 = t.rot;
      for (let k = 0; k < n; k++) {
        const a = a0 + k / n * TAU + (rnd() - 0.5) * 0.5;
        const ex = t.x + Math.cos(a) * (rt + 1.2), ez = t.z + Math.sin(a) * (rt + 1.2);
        if (F.laneD(ex, ez) < 0.6 || F.squadD(ex, ez) < 1.2) continue;
        root(t.x, t.z, a, rt * 0.8, 0.6 + rnd() * 0.9, rt * (0.28 + rnd() * 0.12));
      }
    }

    /* ---------------- муравейники: у пня с юга (+z), на солнце */
    const ants = [];
    for (const s of stumps) {
      if (ants.length >= 3 || rnd() < 0.55) continue;
      const a = Math.PI / 2 + (rnd() - 0.5) * 1.1;
      const R = 0.5 + rnd() * 0.35, Hh = R * (0.65 + rnd() * 0.25);
      const x = s.x + Math.cos(a) * (s.r + R * 0.75), z = s.z + Math.sin(a) * (s.r + R * 0.75);
      if (blocked(x, z, 0.3)) continue;
      const y = Math.min(H(x, z), H(x + R * 0.7, z), H(x - R * 0.7, z), H(x, z + R * 0.7), H(x, z - R * 0.7)) - 0.04;
      const nz = U.noise2D(900 + ants.length), SEG = 28, RING = 12, base = hill.p.length / 3;
      for (let i = 0; i <= RING; i++) {
        const th = i / RING * Math.PI * 0.5;
        for (let j = 0; j <= SEG; j++) {
          const az = j / SEG * TAU, n = (nz(Math.cos(az) * 1.3 + i * 0.3, Math.sin(az) * 1.3) - 0.5) * 0.16;
          const rr = R * Math.sin(th) * (1 + n) * (1 + 0.25 * Math.pow(Math.sin(th), 6));
          const hh = Hh * Math.pow(Math.cos(th), 1.15) * (1 + n * 0.6);
          const nn = v3norm([Math.cos(az) * Math.sin(th) / R, Math.cos(th) / Hh, Math.sin(az) * Math.sin(th) / R]);
          hill.vert([x + Math.cos(az) * rr, y + hh, z + Math.sin(az) * rr], nn, [j / SEG * 5, i / RING * 2.2], [1, 1, 1]);
        }
      }
      for (let i = 0; i < RING; i++) for (let j = 0; j < SEG; j++) {
        const q = base + i * (SEG + 1) + j, w = q + SEG + 1;
        hill.i.push(q, q + 1, w, q + 1, w + 1, w);
      }
      ants.push({ x, y, z, R, Hh });
      if (inPlay(x, z)) api.colliders.push({ type: 'cyl', x, z, r: R * 0.8, h: Hh });
    }
    st.anthills = ants.length;

    /* ---------------- сфагнум у воды и на сырых местах */
    const cushion = (x, z, R) => {
      const y = H(x, z) - 0.02, Hh = R * (0.25 + rnd() * 0.2), SEG = 10, RING = 4, base = sph.p.length / 3;
      const red = rnd() < 0.18, col = red ? [0.95, 0.55, 0.5] : rnd() < 0.5 ? [0.9, 0.95, 0.75] : [1.05, 1.05, 0.8];
      for (let i = 0; i <= RING; i++) {
        const th = i / RING * Math.PI * 0.5;
        for (let j = 0; j <= SEG; j++) {
          const az = j / SEG * TAU, w = 1 + 0.12 * Math.sin(az * 3 + x);
          const px = x + Math.cos(az) * R * Math.sin(th) * w, pz = z + Math.sin(az) * R * Math.sin(th) * w;
          sph.vert([px, Math.max(H(px, pz) - 0.01, y + Hh * Math.cos(th)), pz], v3norm([Math.cos(az) * Math.sin(th), Math.cos(th) * 1.5, Math.sin(az) * Math.sin(th)]), [px * 2.2, pz * 2.2], col);
        }
      }
      for (let i = 0; i < RING; i++) for (let j = 0; j < SEG; j++) {
        const q = base + i * (SEG + 1) + j, w = q + SEG + 1;
        sph.i.push(q, q + 1, w, q + 1, w + 1, w);
      }
      st.sphagnum++;
    };
    for (const c of F.CRATERS) {
      if (!c.water) continue;
      const n = 14 + (rnd() * 10 | 0);
      for (let k = 0; k < n; k++) {
        const a = rnd() * TAU, d = c.R * (0.66 + rnd() * 0.42);
        cushion(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, 0.14 + rnd() * 0.24);
      }
    }
    for (let tries = 0; tries < 2500 && st.sphagnum < 110; tries++) {
      const x = (rnd() - 0.5) * 80, z = 2 + (rnd() - 0.5) * 80;
      if (!api.wetAt || api.wetAt(x, z) < 0.5 || (api.mudAt && api.mudAt(x, z) > 0.35) || blocked(x, z, 0.3)) continue;
      for (let k = 0; k < 3; k++) cushion(x + (rnd() - 0.5) * 0.8, z + (rnd() - 0.5) * 0.8, 0.12 + rnd() * 0.2);
    }

    /* ---------------- грибы */
    const shroom = (x, z, kind, s) => {
      const y = H(x, z) - 0.01, lean = [(rnd() - 0.5) * 0.25, 1, (rnd() - 0.5) * 0.25];
      const K = kind === 'agaric' ? { h: 0.13, r: 0.012, cap: 0.065, stem: [0.92, 0.9, 0.84], c: [0.72, 0.08, 0.03], gill: [0.95, 0.93, 0.86], flat: 0.55 }
        : kind === 'bolete' ? { h: 0.08, r: 0.02, cap: 0.055, stem: [0.82, 0.78, 0.68], c: [0.38, 0.23, 0.12], gill: [0.78, 0.72, 0.42], flat: 0.62 }
          : { h: 0.06, r: 0.0045, cap: 0.022, stem: [0.72, 0.6, 0.42], c: [0.62, 0.42, 0.2], gill: [0.85, 0.78, 0.6], flat: 0.45 };
      const h = K.h * s, cr = K.cap * s, top = [x + lean[0] * h, y + h, z + lean[2] * h];
      mush.tube([[x, y - 0.01, z], [x + lean[0] * h * 0.5, y + h * 0.5, z + lean[2] * h * 0.5], top], [K.r * s * 1.25, K.r * s, K.r * s * 0.9], 6, { col: () => K.stem });
      /* шляпка: купол из колец, снизу — пластинки/трубочки */
      const SEG = 12, RING = 4, base = mush.p.length / 3;
      for (let i = 0; i <= RING; i++) {
        const th = i / RING * Math.PI * 0.5;
        for (let j = 0; j <= SEG; j++) {
          const az = j / SEG * TAU;
          const spot = kind === 'agaric' && i > 0 && i < RING && rnd() < 0.22;
          const dark = kind === 'honey' ? mixc(K.c, [0.32, 0.2, 0.1], 1 - i / RING) : K.c;
          mush.vert([top[0] + Math.cos(az) * cr * Math.sin(th), top[1] + cr * K.flat * Math.cos(th) - cr * 0.12, top[2] + Math.sin(az) * cr * Math.sin(th)],
            v3norm([Math.cos(az) * Math.sin(th), Math.cos(th) + 0.3, Math.sin(az) * Math.sin(th)]), [0, 0], spot ? [0.95, 0.93, 0.88] : dark);
        }
      }
      for (let i = 0; i < RING; i++) for (let j = 0; j < SEG; j++) {
        const q = base + i * (SEG + 1) + j, w = q + SEG + 1;
        mush.i.push(q, q + 1, w, q + 1, w + 1, w);
      }
      disk(mush, [top[0], top[1] - cr * 0.12, top[2]], [0, -1, 0], cr, SEG, 0, K.gill);
      st.mush++;
    };
    for (const s of stumps) {
      if (rnd() < 0.4) continue;
      const a0 = rnd() * TAU, n = 6 + (rnd() * 8 | 0);
      for (let k = 0; k < n; k++) {
        const a = a0 + (rnd() - 0.5) * 1.3, d = s.r * (1.05 + rnd() * 0.5);
        shroom(s.x + Math.cos(a) * d, s.z + Math.sin(a) * d, 'honey', 0.7 + rnd() * 0.6);
      }
    }
    const spr = api.spruces || [];
    for (let k = 0; k < 40 && spr.length; k++) {
      const q = spr[(rnd() * spr.length) | 0], a = rnd() * TAU, d = 0.5 + rnd() * 1.2;
      const x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d;
      if (blocked(x, z, 0.15)) continue;
      shroom(x, z, 'bolete', 0.75 + rnd() * 0.6);
    }
    for (let tries = 0, n = 0; tries < 600 && n < 9; tries++) {
      const a = rnd() * TAU, d = 9 + rnd() * 24, x = Math.cos(a) * d, z = 2 + Math.sin(a) * d;
      const e = F.clearE(x, z);
      if (e < 1.02 || e > 1.6 || blocked(x, z, 0.3)) continue;
      shroom(x, z, 'agaric', 0.8 + rnd() * 0.5); n++;
      if (rnd() < 0.5) shroom(x + 0.25, z + 0.1, 'agaric', 0.5 + rnd() * 0.3);
    }

    /* ---------------- меши */
    const add = (G, mat, name, cast) => {
      if (!G.i.length) return null;
      const m = new THREE.Mesh(G.build(THREE), mat);
      m.name = name; m.castShadow = !!cast; m.receiveShadow = true;
      scene.add(m); return m;
    };
    add(bark, M.bark, 'stumps_roots', true);
    const ringMat = new THREE.MeshStandardMaterial({ map: ctex(CV.rings, true), roughness: 0.92, metalness: 0, vertexColors: true, color: new THREE.Color(0.62, 0.58, 0.54) });
    add(tops, ringMat, 'stump_tops', false);
    const hillMat = new THREE.MeshStandardMaterial({ map: ctex(CV.hill, true), roughness: 1, metalness: 0, color: new THREE.Color(0.75, 0.68, 0.6) });
    add(hill, hillMat, 'anthills', true);
    const sphMat = new THREE.MeshStandardMaterial({ map: ctex(CV.sph, true), roughness: 0.78, metalness: 0, vertexColors: true, color: new THREE.Color(0.6, 0.62, 0.5) });
    add(sph, sphMat, 'sphagnum', false);
    const mushMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, vertexColors: true });
    add(mush, mushMat, 'mushrooms', false);

    /* муравьи: точки бегут по склону муравейника (анимация в шейдере) */
    if (ants.length) {
      const PER = 90, n = ants.length * PER, pos = new Float32Array(n * 3), sd = new Float32Array(n * 4), hl = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        const A = ants[(i / PER) | 0];
        pos[i * 3] = A.x; pos[i * 3 + 1] = A.y; pos[i * 3 + 2] = A.z;
        sd[i * 4] = rnd(); sd[i * 4 + 1] = rnd(); sd[i * 4 + 2] = rnd(); sd[i * 4 + 3] = rnd();
        hl[i * 4] = A.R; hl[i * 4 + 1] = A.Hh;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
      g.setAttribute('aHill', new THREE.BufferAttribute(hl, 4));
      const mat = new THREE.ShaderMaterial({
        uniforms: { uT: M.windTime, uVH: { value: 1080 } },
        vertexShader: `attribute vec4 aSeed; attribute vec4 aHill; uniform float uT, uVH;
          void main() {
            float dir = aSeed.z > 0.5 ? 1.0 : -1.0;
            float az = aSeed.x * 6.2832 + uT * (0.15 + aSeed.w * 0.3) * dir + sin(uT * (2.0 + aSeed.w * 3.0) + aSeed.y * 9.0) * 0.12;
            float th = mod(aSeed.y * 1.4 + uT * 0.05 * (aSeed.w - 0.5), 1.4);
            float rr = aHill.x * sin(th), hh = aHill.y * pow(cos(th), 1.15) + 0.006;
            vec3 p = position + vec3(cos(az) * rr, hh, sin(az) * rr);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = clamp(0.006 * projectionMatrix[1][1] * uVH * 0.5 / -mv.z, 0.0, 4.0);
            if (-mv.z > 9.0 || gl_PointSize < 0.6) gl_PointSize = 0.0;
          }`,
        fragmentShader: `void main() { vec2 q = gl_PointCoord - 0.5; if (dot(q, q) > 0.25) discard; gl_FragColor = vec4(0.03, 0.012, 0.006, 1.0); }`
      });
      const P = new THREE.Points(g, mat); P.frustumCulled = false; P.name = 'ants'; P.userData.noAO = true;
      api.antsMat = mat;
      scene.add(P);
    }

    /* кислица у подроста ели: инстансы «коврика» из 16 листиков и 1–2 цветков */
    {
      const G = new Geo();
      const leaf = (x, z, y, s, a, flower) => {
        const c = Math.cos(a), sn = Math.sin(a), tl = 0.25;
        const u0 = flower ? 0.5 : 0, u1 = flower ? 1 : 0.5;
        const b = G.p.length / 3, P = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (const [px, pz] of P) {
          const lx = (px * c - pz * sn) * s, lz = (px * sn + pz * c) * s;
          G.vert([x + lx, y + pz * s * tl, z + lz], [0, 1, 0], [u0 + (px * 0.5 + 0.5) * (u1 - u0), pz * 0.5 + 0.5], [1, 1, 1]);
        }
        G.i.push(b, b + 2, b + 1, b, b + 3, b + 2);
      };
      const r2 = U.rng(3131);
      for (let k = 0; k < 16; k++) { const a = r2() * TAU, d = Math.sqrt(r2()) * 0.22; leaf(Math.cos(a) * d, Math.sin(a) * d, 0.035 + r2() * 0.04, 0.022 + r2() * 0.01, r2() * TAU, false); }
      for (let k = 0; k < 2; k++) { const a = r2() * TAU, d = r2() * 0.15; leaf(Math.cos(a) * d, Math.sin(a) * d, 0.085, 0.011, r2() * TAU, true); }
      const geo = G.build(THREE);
      const sorMat = new THREE.MeshStandardMaterial({ map: ctex(CV.sorrel, true), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, metalness: 0, color: new THREE.Color(0.58, 0.62, 0.5) });
      sorMat.map.wrapS = sorMat.map.wrapT = THREE.ClampToEdgeWrapping;
      addWind(sorMat, M.windTime, 0.12, 'fern');
      const L = [];
      for (const q of spr) {
        if (Math.hypot(q.x, q.z - 2) > 45) continue;
        const n = 2 + (rnd() * 4 | 0);
        for (let k = 0; k < n; k++) {
          const a = rnd() * TAU, d = 0.35 + rnd() * 1.3, x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d;
          if (blocked(x, z, 0.1) || (api.mudAt && api.mudAt(x, z) > 0.25)) continue;
          L.push([x, z, 0.8 + rnd() * 0.6, rnd() * TAU]);
        }
      }
      if (L.length) {
        const im = new THREE.InstancedMesh(geo, sorMat, L.length), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
        L.forEach((o, i) => { q4.setFromAxisAngle(up, o[3]); sv.setScalar(o[2]); pv.set(o[0], H(o[0], o[1]) - 0.01, o[1]); m4.compose(pv, q4, sv); im.setMatrixAt(i, m4); });
        im.name = 'woodSorrel'; im.receiveShadow = true; im.userData.noAO = true;
        im.computeBoundingSphere(); scene.add(im);
        st.sorrel = L.length;
      }
    }

    /* иван-чай: 3 варианта стебля, инстансы куртинами на опушке */
    {
      const vars = [];
      for (let v = 0; v < 3; v++) {
        const G = new Geo(), r2 = U.rng(700 + v), Hh = 0.95 + v * 0.18;
        G.tube([[0, -0.02, 0], [0.01, Hh * 0.4, 0], [0.02, Hh * 0.8, 0.01], [0.025, Hh, 0.015]], [0.006, 0.005, 0.004, 0.002], 5, { col: (t) => mixc([0.32, 0.2, 0.15], [0.42, 0.22, 0.25], t) });
        /* листья: узкие ланцетные, по спирали, ниже — длиннее и свисают */
        const nL = 18;
        for (let k = 0; k < nL; k++) {
          const u = 0.1 + k / nL * 0.62, y = Hh * u, a = k * 2.4, L = 0.07 + (1 - u) * 0.08, droop = 0.25 + (1 - u) * 0.4;
          const ax = [], sd = [], w = [], nr = [];
          for (let j = 0; j <= 4; j++) {
            const t = j / 4, d = t * L;
            ax.push([Math.cos(a) * d + 0.012 * u, y + d * (0.6 - droop * t * 1.6), Math.sin(a) * d]);
            sd.push([-Math.sin(a), 0, Math.cos(a)]); w.push(0.016 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05)) + 0.001); nr.push([0, 1, 0]);
          }
          G.strip(ax, sd, w, nr, () => mixc([0.2, 0.33, 0.11], [0.3, 0.42, 0.16], r2()), false);
        }
        /* соцветие-кисть: внизу раскрытые цветки (4 лепестка), выше — бутоны */
        const nF = 22;
        for (let k = 0; k < nF; k++) {
          const u = k / nF, y = Hh * (0.74 + u * 0.26), a = k * 2.1, d = 0.025 * (1 - u * 0.7), s = 0.018 * (1 - u * 0.6);
          const cx = Math.cos(a) * d + 0.02, cz = Math.sin(a) * d + 0.012;
          const col = u < 0.6 ? mixc([0.78, 0.26, 0.55], [0.86, 0.38, 0.62], r2()) : [0.55, 0.18, 0.32];
          /* цветок — «крестик» из двух узких лепестковых пар (ромбы), не квадрат */
          const nrm = v3norm([Math.cos(a), 0.4, Math.sin(a)]);
          for (let pp = 0; pp < 2; pp++) {
            const aa = a + pp * Math.PI / 2, tx = [-Math.sin(aa), 0, Math.cos(aa)], b = G.p.length / 3, s2 = s * 0.8;
            G.vert([cx - tx[0] * s2, y, cz - tx[2] * s2], nrm, [0, 0.5], col);
            G.vert([cx, y - s2 * 0.35, cz], nrm, [0.5, 0], col);
            G.vert([cx + tx[0] * s2, y, cz + tx[2] * s2], nrm, [1, 0.5], col);
            G.vert([cx, y + s2 * 0.35, cz], nrm, [0.5, 1], col);
            G.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
            const b2 = G.p.length / 3;
            G.vert([cx, y - s2, cz], nrm, [0.5, 0], col);
            G.vert([cx + tx[0] * s2 * 0.3, y, cz + tx[2] * s2 * 0.3], nrm, [1, 0.5], col);
            G.vert([cx, y + s2, cz], nrm, [0.5, 1], col);
            G.vert([cx - tx[0] * s2 * 0.3, y, cz - tx[2] * s2 * 0.3], nrm, [0, 0.5], col);
            G.i.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3);
          }
        }
        vars.push(G.build(THREE));
      }
      const fwMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
      addWind(fwMat, M.windTime, 0.02, 'grass');
      const L = [[], [], []];
      for (let tries = 0, g = 0; tries < 800 && g < 7; tries++) {
        const a = rnd() * TAU, d = 9 + rnd() * 26, x = Math.cos(a) * d, z = 2 + Math.sin(a) * d;
        const e = F.clearE(x, z);
        if (e < 0.93 || e > 1.22 || blocked(x, z, 0.6) || (api.mudAt && api.mudAt(x, z) > 0.2)) continue;
        const n = 3 + (rnd() * 7 | 0);
        for (let k = 0; k < n; k++) {
          const px = x + (rnd() - 0.5) * 1.2, pz = z + (rnd() - 0.5) * 1.2;
          if (blocked(px, pz, 0.1)) continue;
          L[(rnd() * 3) | 0].push([px, pz, 0.8 + rnd() * 0.45, rnd() * TAU]);
        }
        g++;
      }
      const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      L.forEach((list, v) => {
        if (!list.length) return;
        const im = new THREE.InstancedMesh(vars[v], fwMat, list.length);
        list.forEach((o, i) => { q4.setFromAxisAngle(up, o[3]); sv.setScalar(o[2]); pv.set(o[0], H(o[0], o[1]), o[1]); m4.compose(pv, q4, sv); im.setMatrixAt(i, m4); });
        im.name = 'fireweed' + v; im.castShadow = true; im.receiveShadow = true;
        im.computeBoundingSphere(); scene.add(im);
        st.fireweed += list.length;
      });
    }
    api.detailStats = st;
  }

  /* ---------------------------------------------- валежник и пни */
  function buildDeadwood(THREE, scene, api, F, M, trees) {
    const rnd = U.rng(6061);
    const logs = new Geo(), sticks = new Geo();
    const H = F.heightAt;
    const inPlay = (x, z) => Math.abs(x) < PLAY_X && Math.abs(z) < PLAY_Z;
    const blocked = (x, z, r) => inZones(api._noGrass, x, z) || trees.near(x, z, r)
      || F.squadD(x, z) < 1.4 || Math.hypot(x, z - 8.4) < 1.5 || Math.hypot(x + 2, z - 10.2) < 1.5;
    /* брёвна и пни — только в лесу */
    let placed = 0;
    for (let tries = 0; tries < 900 && placed < 40; tries++) {
      const a = rnd() * TAU, d = 10 + rnd() * 48;
      const x = Math.cos(a) * d, z = 2 + Math.sin(a) * d;
      if (F.clearE(x, z) < 1.1 || F.laneD(x, z) < 1.5 || blocked(x, z, 1.0) || F.trackD(x, z) < 3.0 || F.craterD(x, z) < 1.0) continue;
      if (rnd() < 0.35) {
        const r = 0.2 + rnd() * 0.14, h = 0.3 + rnd() * 0.5, y = H(x, z);
        const pts = [[x, y - 0.25, z], [x, y + 0.05, z], [x, y + h * 0.5, z], [x, y + h, z]];
        logs.tube(pts, [r * 1.45, r * 1.3, r * 1.02, r], 10, { uRep: 2, vScale: 1.25, u0: rnd(),
          col: (t) => mixc([0.56, 0.50, 0.43], [0.9, 0.86, 0.8], t) });
        logs.cap([x, y + h, z], [0, 1, 0], r, 10, [1.25, 1.02, 0.78]);
        if (inPlay(x, z)) api.colliders.push({ type: 'cyl', x, z, r: r + 0.05, h });
      } else {
        const L = 3 + rnd() * 4.5, r = 0.11 + rnd() * 0.12, yaw = rnd() * TAU;
        const dx = Math.cos(yaw), dz = Math.sin(yaw), n = 6, pts = [], radii = [];
        let bad = false;
        for (let k = 0; k < n; k++) {
          const u = k / (n - 1), px = x + dx * (u - 0.5) * L, pz = z + dz * (u - 0.5) * L;
          if (F.clearE(px, pz) < 1.05 || F.laneD(px, pz) < 1.0 || trees.near(px, pz, 0.3) || F.trackD(px, pz) < 2.6 || F.craterD(px, pz) < 0.9 || inZones(api._noGrass, px, pz)) { bad = true; break; }
          const rr = r * (1 - 0.3 * u);
          pts.push([px, H(px, pz) + rr * 0.72 + Math.sin(u * 3.1) * 0.03, pz]); radii.push(rr);
        }
        if (bad) continue;
        const ph = rnd() * 6;
        logs.tube(pts, radii, 9, { uRep: 2, vScale: 1.25, u0: rnd(),
          col: (t) => mixc([0.62, 0.55, 0.48], [0.9, 0.85, 0.8], 0.35 + 0.4 * Math.sin(t * 9 + ph)) });
        const d0 = v3norm(v3sub(pts[0], pts[1])), d1 = v3norm(v3sub(pts[n - 1], pts[n - 2]));
        logs.cap(pts[0], d0, radii[0], 9, [1.1, 0.92, 0.72]);
        logs.cap(pts[n - 1], d1, radii[n - 1], 9, [1.1, 0.92, 0.72]);
        for (let k = 0; k < n; k += 2) {
          const p = pts[k];
          if (inPlay(p[0], p[2])) api.colliders.push({ type: 'cyl', x: p[0], z: p[2], r: radii[k] + 0.04, h: 0.5 });
        }
      }
      placed++;
    }
    /* мелкие сухие ветки — везде, на поляне реже */
    let sn = 0;
    for (let tries = 0; tries < 3000 && sn < 340; tries++) {
      const a = rnd() * TAU, d = 2 + Math.pow(rnd(), 0.8) * 46;
      const x = Math.cos(a) * d, z = 2 + Math.sin(a) * d;
      if (F.clearE(x, z) < 1 && rnd() < 0.55) continue;
      if (blocked(x, z, 0.2)) continue;
      const L = 0.4 + rnd() * 1.5, r = 0.012 + rnd() * 0.03, yaw = rnd() * TAU;
      const dx = Math.cos(yaw), dz = Math.sin(yaw);
      const pts = [], radii = [];
      for (let k = 0; k < 4; k++) {
        const u = k / 3, off = Math.sin(u * 3 + yaw) * 0.06;
        const px = x + dx * (u - 0.5) * L - dz * off, pz = z + dz * (u - 0.5) * L + dx * off;
        pts.push([px, H(px, pz) + r * 0.8 + Math.sin(u * Math.PI) * 0.04, pz]);
        radii.push(r * (1 - 0.6 * u));
      }
      const tone = 0.7 + rnd() * 0.4;
      const colf = () => [tone, tone * 0.97, tone * 0.93];
      sticks.tube(pts, radii, 5, { uRep: 1, vScale: 0.6, u0: rnd(), v0: rnd(), col: colf });
      const tw = Math.floor(rnd() * 3.5);
      for (let k = 0; k < tw; k++) {
        const b = pts[1 + Math.floor(rnd() * 2)], sa = yaw + (rnd() < 0.5 ? 0.8 : -0.8) + (rnd() - 0.5) * 0.4;
        const l2 = L * (0.2 + rnd() * 0.3);
        const e = [b[0] + Math.cos(sa) * l2, 0, b[2] + Math.sin(sa) * l2];
        e[1] = H(e[0], e[2]) + 0.02 + rnd() * 0.08;
        sticks.tube([b, e], [r * 0.45, 0.003], 3, { uRep: 1, vScale: 0.6, u0: rnd(), col: colf });
      }
      sn++;
    }
    const g = new THREE.Group();
    g.name = 'deadwood';
    const lm = new THREE.Mesh(logs.build(THREE), M.bark);
    lm.castShadow = lm.receiveShadow = true;
    const sm = new THREE.Mesh(sticks.build(THREE), M.deadwood);
    sm.receiveShadow = true;
    g.add(lm, sm);
    scene.add(g);
    api.deadwood = g;
  }

  /* ------------------------------------------------------- подлесок */
  function buildUndergrowth(THREE, scene, api, F, M, trees) {
    const rnd = U.rng(9091);
    const H = F.heightAt;
    const feet = [-8.2, -5.75, 1.75, 4.2];
    const blocked = (x, z) => inZones(api._noGrass, x, z) || trees.near(x, z, 0.15) ||
      (api.mudAt && api.mudAt(x, z) > 0.42) ||
      (Math.abs(z - SQUAD_LINE.z) < 0.9 && feet.some((fx) => Math.abs(x - fx) < 0.9)) ||
      Math.hypot(x, z - 8.4) < 1.0 || Math.hypot(x + 2, z - 10.2) < 1.0 || Math.hypot(x + 6.95, z + 1.3) < 0.6 || Math.hypot(x - 2.55, z + 1.3) < 0.6;
    const dummy = new THREE.Object3D();

    /* пучки травы: три скрещенные плоскости, ячейка атласа на инстанс */
    const tuft = new Geo();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI, s = [Math.cos(a), 0, Math.sin(a)];
      tuft.strip([[0, -0.02, 0], [0, 0.3, 0]], [s, s], [0.6, 0.6], [[0, 1, 0]], null, false);
    }
    const tuftGeo = tuft.build(THREE);
    const GN = 9000;
    const cells = new Float32Array(GN * 2);
    const grass = new THREE.InstancedMesh(tuftGeo, M.grass, GN);
    let gi = 0;
    const put = (x, z, s) => {
      if (gi >= GN || blocked(x, z)) return;
      dummy.position.set(x, H(x, z), z);
      dummy.rotation.set((rnd() - 0.5) * 0.15, rnd() * TAU, (rnd() - 0.5) * 0.15);
      dummy.scale.set(s, s * (0.7 + rnd() * 0.6), s);
      dummy.updateMatrix();
      grass.setMatrixAt(gi, dummy.matrix);
      if (M.grassAtlas) {
        cells[gi * 2] = rnd() < 0.5 ? 0 : 0.5;
        cells[gi * 2 + 1] = rnd() < 0.66 ? 0.5 : 0;   // верхний ряд атласа — сухая трава
      }
      gi++;
    };
    for (let c = 0; c < 480; c++) {
      const a = rnd() * TAU, d = 3 + Math.pow(rnd(), 0.7) * 55;
      const cx = Math.cos(a) * d, cz = 2 + Math.sin(a) * d, r = 0.6 + rnd() * 2.2;
      const n = (4 + Math.floor(rnd() * 22)) * (F.clearE(cx, cz) < 1 ? 0.4 : 1);
      for (let k = 0; k < n; k++) {
        const b = rnd() * TAU, rr = Math.sqrt(rnd()) * r;
        put(cx + Math.cos(b) * rr, cz + Math.sin(b) * rr, 0.6 + rnd() * 0.7);
      }
    }
    for (let k = 0; k < 1400; k++) {
      const a = rnd() * TAU, d = 2 + rnd() * 50;
      put(Math.cos(a) * d, 2 + Math.sin(a) * d, 0.5 + rnd() * 0.6);
    }
    grass.count = gi;
    tuftGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
    grass.instanceMatrix.needsUpdate = true;
    grass.receiveShadow = true;
    grass.userData.noAO = true;
    grass.name = 'grass';
    grass.computeBoundingSphere();
    scene.add(grass);
    api.grass = grass;

    /* папоротник: восемь изогнутых вай-карточек из одной точки */
    if (M.fern) {
    const fg = new Geo(), fr = U.rng(4);
    const nf = 8;
    for (let k = 0; k < nf; k++) {
      const a = (k / nf) * TAU + (fr() - 0.5) * 0.5;
      const L = 0.75 + fr() * 0.35, rise = 0.95 + fr() * 0.35;
      const dh = [Math.cos(a), 0, Math.sin(a)], side = [-Math.sin(a), 0, Math.cos(a)];
      const pts = [], sides = [], widths = [], nrms = [];
      for (let s = 0; s <= 5; s++) {
        const u = s / 5, el = rise * (1 - u * 1.25);
        const p = s === 0 ? [dh[0] * 0.03, 0.0, dh[2] * 0.03]
          : v3add(pts[s - 1], [dh[0] * Math.cos(el), Math.sin(el), dh[2] * Math.cos(el)], L / 5);
        pts.push(p);
        sides.push(v3norm([side[0], (u - 0.3) * 0.5, side[2]]));   // лёгкое скручивание вайи
        widths.push(0.24);
        nrms.push(v3norm([dh[0] * 0.4, 1, dh[2] * 0.4]));
      }
      fg.strip(pts, sides, widths, nrms, (u) => mixc([0.7, 0.7, 0.7], [1, 1, 1], u), false);
    }
    const FN = 850;
    const ferns = new THREE.InstancedMesh(fg.build(THREE), M.fern, FN);
    let fi = 0;
    for (let tries = 0; tries < 6000 && fi < FN; tries++) {
      /* куртины у стволов и по краю поляны */
      let x, z;
      if (rnd() < 0.55 && trees.length) {
        const t = trees[Math.floor(rnd() * trees.length)];
        if (t.d > 50) continue;
        const a = rnd() * TAU, r = 0.6 + rnd() * 1.8;
        x = t.x + Math.cos(a) * r; z = t.z + Math.sin(a) * r;
      } else {
        const a = rnd() * TAU, d = 9 + rnd() * 42;
        x = Math.cos(a) * d; z = 2 + Math.sin(a) * d;
      }
      if (F.clearE(x, z) < 0.92 || F.laneD(x, z) < 0.3 || blocked(x, z)) continue;
      const s = 0.7 + rnd() * 0.8;
      dummy.position.set(x, H(x, z) - 0.02, z);
      dummy.rotation.set((rnd() - 0.5) * 0.2, rnd() * TAU, (rnd() - 0.5) * 0.2);
      dummy.scale.set(s, s * (0.8 + rnd() * 0.4), s);
      dummy.updateMatrix();
      ferns.setMatrixAt(fi++, dummy.matrix);
    }
    ferns.count = fi;
    ferns.instanceMatrix.needsUpdate = true;
    ferns.receiveShadow = true;
    ferns.userData.noAO = true;
    ferns.name = 'ferns';
    ferns.computeBoundingSphere();
    scene.add(ferns);
    api.ferns = ferns;
    }
    /* v5: подрост ели, черничник, сухие ветки с хвоей, шишки */
    try { buildForestFloor(THREE, scene, api, F, M, trees, blocked, rnd); } catch (e) { console.warn('forest floor:', e && e.message); }
    /* качество: на «Низкой» мелочи меньше (инстансы перемешаны — прореживание равномерное) */
    const detailSets = [];
    for (const m of [api.grass, api.ferns, api.shrubs, api.drySprays, api.cones].concat(api.saplingMeshes || [])) if (m) detailSets.push({ m, n: m.count });
    api.setDetail = (k) => {
      k = Math.max(0.2, Math.min(1, k || 1));
      for (const d of detailSets) d.m.count = Math.max(1, Math.round(d.n * k));
    };
  }

  /* Перемешать инстансы (Фишер–Йетс по матрицам), чтобы count можно было урезать равномерно. */
  function shuffleInstances(mesh, n, rnd, extra) {
    const a = mesh.instanceMatrix.array;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      for (let k = 0; k < 16; k++) { const t = a[i * 16 + k]; a[i * 16 + k] = a[j * 16 + k]; a[j * 16 + k] = t; }
      if (extra) for (const e of extra) {
        const sz = e.itemSize, ar = e.array;
        for (let k = 0; k < sz; k++) { const t = ar[i * sz + k]; ar[i * sz + k] = ar[j * sz + k]; ar[j * sz + k] = t; }
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /* Ель-подрост: конус из мутовок хвойных карточек от самой земли.
     Заполняет «этаж» между подстилкой и высокими кронами сосен. */
  /* v26: ель-подрост. Было: 5 веток на мутовку из фото СОСНОВОЙ ветки
     (длинная редкая хвоя) + вертикальная карточка; вдали mip съедал альфу,
     и ёлки выглядели серыми рваными карточками с бледной верхушкой.
     Стало: мутовки по 5 «лап» (вверху 4), каждая — две полосы крест-накрест
     под малым углом к горизонту (объём сбоку без «картонки»), провис к
     середине и приподнятый кончик, затенение к стволу и вниз, верхушка —
     светлый, но зелёный побег с мутовкой почек. Треугольников — как раньше
     (~500 на ёлку): ёлок сотни, и все они — 2 InstancedMesh. */
  function spruceGeometry(THREE, seed) {
    const rnd = U.rng(seed), H = 3.0;
    const trunk = new Geo(), crown = new Geo();
    const ys = [-0.1, 0.6, 1.5, 2.2, H - 0.35];
    trunk.tube(ys.map((y) => [0, y, 0]), ys.map((y) => 0.05 * Math.pow(Math.max(0, 1 - y / H), 1.3) + 0.004), 6,
      { uRep: 1, vScale: 1.25, col: () => [0.5, 0.46, 0.42] });
    const UP = [0, 1, 0];
    /* одна «лапа»: c — у ствола, dh — направление в плане, L — длина */
    const paw = (c, dh, L, pitch, t, two, shade) => {
      const cp = Math.cos(pitch), dir = [dh[0] * cp, Math.sin(pitch), dh[2] * cp];
      const sideH = v3norm([-dh[2], 0, dh[0]]);
      const upv = v3norm(v3cross(sideH, dir));
      /* провис к середине, кончик приподнят */
      const sag = L * (0.07 + 0.11 * (1 - t));
      const pts = [c, v3add(v3add(c, dir, L * 0.52), UP, -sag), v3add(v3add(c, dir, L), UP, -sag * 0.55 + L * 0.07)];
      const nrm = v3norm([dh[0] * 0.55, 0.85, dh[2] * 0.55]), nrms = [nrm, nrm, nrm];
      const w = Math.max(0.1, L * 0.7), widths = [w * 0.55, w, w * 0.62];
      const k = shade * (0.9 + rnd() * 0.2);
      const col = (u) => { const m = 0.46 + 0.54 * Math.pow(u, 0.75); return [m * k, m * k * 1.02, m * k]; };
      const tw = (rnd() - 0.5) * 0.3, th = two ? 0.42 : 0;
      for (const sg of two ? [-1, 1] : [1]) {
        const a = th * sg + tw, ca = Math.cos(a), sa = Math.sin(a);
        const sd = v3norm([sideH[0] * ca + upv[0] * sa, sideH[1] * ca + upv[1] * sa, sideH[2] * ca + upv[2] * sa]);
        crown.strip(pts, [sd, sd, sd], widths, nrms, col, true);
      }
    };
    let ga = rnd() * TAU;
    for (let y = 0.16; y < H - 0.34;) {
      const t = y / H;
      const Lm = 0.13 + 0.92 * Math.pow(1 - t, 1.08);
      const nb = 5;
      ga += 0.6 + rnd() * 0.5;
      for (let b = 0; b < nb; b++) {
        const a = ga + b / nb * TAU + (rnd() - 0.5) * 0.6;
        const L = Lm * (0.8 + rnd() * 0.36);
        /* нижние лапы свисают, к верху — всё круче вверх */
        const pitch = -0.26 * (1 - t) + 0.5 * t * t + (rnd() - 0.5) * 0.16;
        const dh = [Math.cos(a), 0, Math.sin(a)];
        const c = [dh[0] * 0.012, y + (rnd() - 0.5) * 0.05, dh[2] * 0.012];
        /* внизу, в тени собственной кроны, хвоя темнее */
        paw(c, dh, L, pitch, t, L > 0.2, 0.74 + 0.3 * t);
      }
      y += (0.17 + 0.07 * rnd()) * (1 - 0.22 * t);
    }
    /* верхушка: прошлогодний побег и мутовка почек — зелёные, не белые */
    for (let b = 0; b < 4; b++) {
      const a = ga + b * Math.PI / 2 + rnd() * 0.4, dh = [Math.cos(a), 0, Math.sin(a)];
      paw([0, H - 0.3, 0], dh, 0.17 + rnd() * 0.05, 0.62, 0.95, false, 0.98);
    }
    for (let b = 0; b < 2; b++) {
      const a = b * Math.PI / 2 + rnd(), side = [Math.cos(a), 0, Math.sin(a)], c0 = [0, H - 0.4, 0], c1 = [0, H + 0.12, 0];
      crown.strip([c0, [0.01, H - 0.12, 0], c1], [side, side, side], [0.16, 0.12, 0.06], [[0, 1, 0]],
        (u) => [0.78 + 0.12 * u, 0.82 + 0.12 * u, 0.74 + 0.1 * u], true);
    }
    return { trunk: trunk.build(THREE), crown: crown.build(THREE) };
  }

  /* v26: «лапа» ели для подроста — плоская веточная спрея: ось вдоль u
     (v = 0,5), побеги 2-го и 3-го порядка в плоскости, густая короткая хвоя,
     светлые молодые приросты на концах. Текстура данных, а не canvas:
     — под прозрачными текселями цвет = средний цвет хвои (нет тёмной каймы
       на краях при фильтрации);
     — mip-уровни считаются здесь же с сохранением покрытия под alphaTest
       (Castaño): обычные mip усредняют тонкую хвою в полупрозрачность, и
       ёлка вдали «тает» в редкие клочья. Цена — один раз при загрузке
       (~30–60 мс), в кадре — ничего. */
  function spruceSprayTexture(THREE, alphaTest) {
    const W = 1024, Hh = 512, K = W / 512, c = T.canvas(W, Hh), g = T.ctx2d(c), rnd = U.rng(7311);
    g.clearRect(0, 0, W, Hh);
    g.lineCap = 'round';
    /* штрихи копятся по «корзинам» цвета/толщины и рисуются пачками */
    const layers = [new Map(), new Map(), new Map(), new Map()];
    const seg = (L, col, lw, x0, y0, x1, y1) => {
      const key = col + '|' + lw.toFixed(1);
      let a = layers[L].get(key);
      if (!a) layers[L].set(key, a = []);
      a.push(x0, y0, x1, y1);
    };
    const OLD = ['rgb(25,43,30)', 'rgb(30,50,33)', 'rgb(35,57,37)', 'rgb(40,63,40)', 'rgb(28,47,32)', 'rgb(45,68,43)'];
    const NEW = ['rgb(58,84,45)', 'rgb(64,92,48)', 'rgb(52,78,42)'];
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    /* веточка от (x0,y0) по углу ang длиной len: тёмная «подложка» хвои,
       хвоя по обе стороны и сверху, светлый прирост на последних 15 % */
    const twig = (x0, y0, ang, len, nl, lw, bend) => {
      const n = Math.max(2, Math.round(len / (2.5 * K)));
      let x = x0, y = y0, a = ang;
      const da = (bend || 0) / n;
      for (let i = 0; i < n; i++) {
        const t = i / n, step = len / n;
        const x1 = x + Math.cos(a) * step, y1 = y + Math.sin(a) * step;
        seg(1, 'rgb(62,46,33)', Math.max(1, lw * (1 - 0.6 * t)), x, y, x1, y1);
        if (t > 0.04 && t < 0.8) seg(0, 'rgb(17,30,21)', nl * 0.9 * (1 - 0.45 * t), x, y, x1, y1);
        const fresh = t > 0.85, L0 = nl * (1 - 0.3 * t);
        for (const s of [-1, 1]) {
          if (rnd() < 0.12) continue;
          const na = a + s * (0.8 + rnd() * 0.55), nlen = L0 * (0.7 + rnd() * 0.5);
          seg(fresh ? 3 : 2, pick(fresh ? NEW : OLD), (1.4 + rnd() * 0.6) * K, x, y, x + Math.cos(na) * nlen, y + Math.sin(na) * nlen);
        }
        if (rnd() < 0.4) {
          const na = a + (rnd() - 0.5) * 0.8, nlen = L0 * 0.65;
          seg(fresh ? 3 : 2, pick(fresh ? NEW : OLD), (1.5 + rnd() * 0.5) * K, x, y, x + Math.cos(na) * nlen, y + Math.sin(na) * nlen);
        }
        x = x1; y = y1; a += da;
      }
      return [x, y];
    };
    /* главная ось и контур лапы: шире всего на первой трети, к концу сужается,
       длина веточек — неровная (живой край, а не «перо») */
    const X0 = 10 * K, X1 = W - 26 * K, CY = Hh / 2;
    const halfW = (s) => (Hh * 0.43) * Math.pow(Math.max(0, 1 - s), 0.55) * Math.min(1, 0.4 + s * 4);
    const NB = 19;
    for (let i = 0; i < NB; i++) {
      for (const sd of [-1, 1]) {
        const s = 0.04 + (i + (sd > 0 ? 0.5 : 0) + (rnd() - 0.5) * 0.3) / NB * 0.9;
        if (s > 0.95 || rnd() < 0.08) continue;
        const bx = X0 + (X1 - X0) * s, by = CY + Math.sin(s * Math.PI) * 4 * K;
        const ang = sd * (0.55 + rnd() * 0.4 + 0.15 * s);
        const hw = halfW(s) * (0.62 + rnd() * 0.5);
        const len = hw / Math.max(0.4, Math.sin(Math.abs(ang)));
        const nl = (7 + rnd() * 2.2) * K * (1 - 0.2 * s);
        twig(bx, by, ang, len, nl, 1.8 * K, -sd * (0.15 + rnd() * 0.3));
        /* побеги 3-го порядка на длинных веточках */
        if (len > 55 * K) {
          const m = len > 110 * K ? 2 + (rnd() < 0.5 ? 1 : 0) : 1;
          for (let j = 0; j < m; j++) {
            const u = 0.28 + j * 0.24 + rnd() * 0.08, a2 = ang - sd * 0.1 * u;
            const px = bx + Math.cos(a2) * len * u, py = by + Math.sin(a2) * len * u;
            const s2 = (j % 2 ? -1 : 1) * sd;
            twig(px, py, a2 + s2 * (0.6 + rnd() * 0.35), len * (1 - u) * (0.32 + rnd() * 0.2), nl * 0.85, 1.1 * K, 0);
          }
        }
      }
    }
    const tip = twig(X0, CY, 0.005, X1 - X0, 8 * K, 3.0 * K, 0.01);
    /* конец лапы — «вилка»: верхушечный побег и два боковых */
    for (const sd of [-1, 1]) twig(tip[0] - 30 * K, tip[1], sd * 0.5, 26 * K, 6.5 * K, 1.4 * K, 0);
    for (const L of layers) for (const [key, a] of L) {
      const [col, lw] = key.split('|');
      g.strokeStyle = col; g.lineWidth = +lw;
      g.beginPath();
      for (let i = 0; i < a.length; i += 4) { g.moveTo(a[i], a[i + 1]); g.lineTo(a[i + 2], a[i + 3]); }
      g.stroke();
    }
    /* данные: строки снизу вверх (как у CanvasTexture с flipY) */
    const src = g.getImageData(0, 0, W, Hh).data, base = new Uint8Array(W * Hh * 4);
    let sr = 0, sg = 0, sb = 0, sn = 0;
    for (let y = 0; y < Hh; y++) {
      const ro = (Hh - 1 - y) * W * 4, wo = y * W * 4;
      for (let i = 0; i < W * 4; i += 4) {
        const al = src[ro + i + 3];
        base[wo + i] = src[ro + i]; base[wo + i + 1] = src[ro + i + 1]; base[wo + i + 2] = src[ro + i + 2]; base[wo + i + 3] = al;
        if (al > 200) { sr += src[ro + i]; sg += src[ro + i + 1]; sb += src[ro + i + 2]; sn++; }
      }
    }
    const ar = sn ? sr / sn : 40, ag = sn ? sg / sn : 64, ab = sn ? sb / sn : 36;
    for (let i = 0; i < base.length; i += 4) if (base[i + 3] === 0) { base[i] = ar; base[i + 1] = ag; base[i + 2] = ab; }
    /* цепочка mip: цвет — средний с весом альфы, альфа — масштаб под покрытие */
    const thr = Math.round((alphaTest || 0.4) * 255);
    const cover = (d) => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > thr) n++; return n / (d.length / 4); };
    const C0 = cover(base);
    const mips = [{ data: base, width: W, height: Hh }];
    let cur = base, cw = W, ch = Hh;
    while (cw > 1 || ch > 1) {
      const nw = Math.max(1, cw >> 1), nh = Math.max(1, ch >> 1), nd = new Uint8Array(nw * nh * 4);
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
        let r = 0, gg = 0, bb = 0, aa = 0, cnt = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(cw - 1, x * 2 + dx), sy = Math.min(ch - 1, y * 2 + dy), o = (sy * cw + sx) * 4, al = cur[o + 3];
          r += cur[o] * al; gg += cur[o + 1] * al; bb += cur[o + 2] * al; aa += al; cnt++;
        }
        const o = (y * nw + x) * 4;
        if (aa > 0) { nd[o] = r / aa; nd[o + 1] = gg / aa; nd[o + 2] = bb / aa; } else { nd[o] = ar; nd[o + 1] = ag; nd[o + 2] = ab; }
        nd[o + 3] = aa / cnt;
      }
      /* масштаб альфы: доля текселей выше порога — как на нулевом уровне */
      const hist = new Uint32Array(256);
      for (let i = 3; i < nd.length; i += 4) hist[nd[i]]++;
      const want = C0 * (nd.length / 4);
      let acc = 0, at = 255;
      while (at > 1 && acc + hist[at] < want) { acc += hist[at]; at--; }
      const sc = Math.min(4, Math.max(1, thr / Math.max(1, at)));
      const out = new Uint8Array(nd);
      if (sc > 1.001) for (let i = 3; i < out.length; i += 4) out[i] = Math.min(255, out[i] * sc);
      mips.push({ data: out, width: nw, height: nh });
      cur = nd; cw = nw; ch = nh;
    }
    const tex = new THREE.DataTexture(base, W, Hh, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.mipmaps = mips;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    tex.userData.coverage = C0;
    return tex;
  }

  /* Атлас кустиков черники (левая ячейка) и брусники (правая): стебли и
     мелкие овальные листья на прозрачном фоне. */
  function shrubCanvas() {
    const W = 512, Hh = 256, c = T.canvas(W, Hh), g = T.ctx2d(c), rnd = U.rng(3131);
    g.clearRect(0, 0, W, Hh);
    for (let cell = 0; cell < 2; cell++) {
      const ox = cell * 256, lingon = cell === 1;
      for (let st = 0; st < 16; st++) {
        const x0 = ox + 128 + (rnd() - 0.5) * 120, h = 110 + rnd() * 120;
        const lean = (rnd() - 0.5) * 70;
        g.strokeStyle = lingon ? 'rgb(70,48,34)' : 'rgb(64,84,40)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x0, 256); g.quadraticCurveTo(x0 + lean * 0.3, 256 - h * 0.6, x0 + lean, 256 - h); g.stroke();
        const nl = 10 + Math.floor(rnd() * 10);
        for (let k = 0; k < nl; k++) {
          const t = 0.25 + 0.75 * (k / nl) + (rnd() - 0.5) * 0.05;
          const px = x0 + lean * t * t + (rnd() - 0.5) * 6, py = 256 - h * t;
          const ang = (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.9) + lean * 0.004;
          const lw = lingon ? 7 + rnd() * 4 : 8 + rnd() * 6, lh = lw * (lingon ? 0.62 : 0.55);
          const gr = lingon ? 46 + rnd() * 30 : 70 + rnd() * 60, rr = lingon ? 22 + rnd() * 20 : 38 + rnd() * 40;
          g.save(); g.translate(px + Math.cos(ang) * lw * 0.7, py - Math.abs(Math.sin(ang)) * 3); g.rotate(ang * 0.6);
          g.fillStyle = 'rgb(' + (rr | 0) + ',' + (gr | 0) + ',' + ((lingon ? 18 : 22) + rnd() * 18 | 0) + ')';
          g.beginPath(); g.ellipse(0, 0, lw, lh, 0, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(20,30,10,0.45)'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(-lw * 0.9, 0); g.lineTo(lw * 0.9, 0); g.stroke();
          if (lingon) { g.fillStyle = 'rgba(255,255,240,0.10)'; g.beginPath(); g.ellipse(-lw * 0.2, -lh * 0.3, lw * 0.5, lh * 0.3, 0, 0, TAU); g.fill(); }
          g.restore();
          /* ягоды: черника — сизые, брусника — красные (редко) */
          if (rnd() < (lingon ? 0.05 : 0.035)) {
            g.fillStyle = lingon ? 'rgb(150,24,22)' : 'rgb(38,44,74)';
            g.beginPath(); g.arc(px + (rnd() - 0.5) * 8, py + 6, lingon ? 4 : 4.5, 0, TAU); g.fill();
          }
        }
      }
    }
    return c;
  }

  let _spruceTex = null;
  function saplingMaterial(THREE, M) {
    /* v26: своя текстура ели (см. spruceSprayTexture); без canvas — старое фото */
    let map = null;
    try { map = _spruceTex || (_spruceTex = spruceSprayTexture(THREE, 0.42)); } catch (e) { map = null; }
    const spr = new THREE.MeshStandardMaterial({
      map: map || M.needles.map, alphaTest: map ? 0.42 : 0.32, alphaToCoverage: true, side: THREE.DoubleSide,
      roughness: 0.88, metalness: 0, vertexColors: true,
      color: map ? new THREE.Color(0.84, 0.86, 0.76) : new THREE.Color(0.30, 0.37, 0.31)
    });
    addWind(spr, M.windTime, 0.018, 'sapling');
    return spr;
  }

  function buildForestFloor(THREE, scene, api, F, M, trees, blocked, rnd) {
    const H = F.heightAt, dummy = new THREE.Object3D();
    const inPlay = (x, z) => Math.abs(x) < PLAY_X && Math.abs(z) < PLAY_Z;
    const forestOK = (x, z, clr) => F.clearE(x, z) >= clr && F.laneD(x, z) > 1.6 && F.trackD(x, z) > 2.4 && F.craterD(x, z) > 0.8 && F.squadD(x, z) > 6.5;

    /* ---- ель-подрост ---- */
    if (M.needles && M.needles.map) {
      const spr = saplingMaterial(THREE, M);
      const vars = [0, 1].map((v) => spruceGeometry(THREE, 911 + v * 37));
      const SN = 380, pos = [];
      const tryPut = (x, z, s) => {
        if (pos.length >= SN || !forestOK(x, z, 1.05) || blocked(x, z) || trees.near(x, z, 0.7)) return;
        for (const o of pos) if (Math.abs(o.x - x) < 1.1 && Math.abs(o.z - z) < 1.1 && Math.hypot(o.x - x, o.z - z) < 0.9 * (o.s + s)) return;
        pos.push({ x, z, s, v: pos.length & 1, r: rnd() * TAU });
      };
      for (let c = 0; c < 90; c++) {
        const a = rnd() * TAU, d = 11 + Math.pow(rnd(), 0.8) * 60;
        const cx = Math.cos(a) * d, cz = 2 + Math.sin(a) * d, cr = 1.5 + rnd() * 3.5;
        const n = 2 + Math.floor(rnd() * 6);
        for (let k = 0; k < n; k++) { const b = rnd() * TAU, rr = Math.sqrt(rnd()) * cr; tryPut(cx + Math.cos(b) * rr, cz + Math.sin(b) * rr, 0.4 + rnd() * 1.1); }
      }
      for (let k = 0; k < 400; k++) { const a = rnd() * TAU, d = 10 + rnd() * 64; tryPut(Math.cos(a) * d, 2 + Math.sin(a) * d, 0.35 + rnd() * 0.8); }
      /* перемешать: при урезании count на «Низкой» прореживание равномерное */
      for (let i = pos.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = pos[i]; pos[i] = pos[j]; pos[j] = t; }
      const g = new THREE.Group(); g.name = 'saplings';
      const all = [];
      for (let v = 0; v < 2; v++) {
        const list = pos.filter((o) => o.v === v);
        if (!list.length) continue;
        const tr = new THREE.InstancedMesh(vars[v].trunk, M.bark, list.length);
        const cr = new THREE.InstancedMesh(vars[v].crown, spr, list.length);
        list.forEach((o, i) => {
          dummy.position.set(o.x, H(o.x, o.z) - 0.05, o.z);
          dummy.rotation.set((rnd() - 0.5) * 0.06, o.r, (rnd() - 0.5) * 0.06);
          dummy.scale.set(o.s * (0.9 + rnd() * 0.25), o.s, o.s * (0.9 + rnd() * 0.25));
          dummy.updateMatrix();
          tr.setMatrixAt(i, dummy.matrix); cr.setMatrixAt(i, dummy.matrix);
          if (inPlay(o.x, o.z) && o.s > 0.6) api.colliders.push({ type: 'cyl', x: o.x, z: o.z, r: 0.09 + 0.06 * o.s, h: 2 });
        });
        tr.castShadow = false; tr.receiveShadow = true;
        cr.castShadow = false; cr.receiveShadow = false;
        cr.userData.noAO = true;
        tr.computeBoundingSphere(); cr.computeBoundingSphere();
        g.add(tr, cr); all.push(tr, cr);
      }
      scene.add(g);
      /* для setDetail: одна «ручка» на все наборы */
      api.saplingMeshes = all;
      api.spruces = pos;
      api.saplingN = pos.length;
    }

    /* ---- черничник и брусничник ---- */
    {
      const tex = canvasTex(THREE, shrubCanvas(), true);
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 4;
      const mat = new THREE.MeshStandardMaterial({
        map: tex, alphaTest: 0.45, alphaToCoverage: true, side: THREE.DoubleSide,
        roughness: 0.82, metalness: 0, color: new THREE.Color(0.46, 0.48, 0.40)
      });
      addWind(mat, M.windTime, 0.04, 'grass');
      const bg = new Geo();
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI + 0.3, sv = [Math.cos(a), 0, Math.sin(a)];
        bg.strip([[0, -0.02, 0], [0, 0.3, 0]], [sv, sv], [0.62, 0.62], [[0, 1, 0]], null, false);
      }
      const geo = bg.build(THREE);
      const BN = 4200, cells = new Float32Array(BN * 2);
      const mesh = new THREE.InstancedMesh(geo, mat, BN);
      let n = 0;
      for (let c = 0; c < 260 && n < BN; c++) {
        const a = rnd() * TAU, d = 9 + Math.pow(rnd(), 0.75) * 56;
        const cx = Math.cos(a) * d, cz = 2 + Math.sin(a) * d, cr = 1.2 + rnd() * 3.8;
        const lingon = rnd() < 0.3;
        const k0 = 10 + Math.floor(rnd() * 26);
        for (let k = 0; k < k0 && n < BN; k++) {
          const b = rnd() * TAU, rr = Math.sqrt(rnd()) * cr, x = cx + Math.cos(b) * rr, z = cz + Math.sin(b) * rr;
          if (!forestOK(x, z, 0.98) || blocked(x, z)) continue;
          const sc = (lingon ? 0.55 : 0.7) + rnd() * 0.6;
          dummy.position.set(x, H(x, z) - 0.02, z);
          dummy.rotation.set((rnd() - 0.5) * 0.12, rnd() * TAU, (rnd() - 0.5) * 0.12);
          dummy.scale.set(sc, sc * (0.75 + rnd() * 0.5), sc);
          dummy.updateMatrix();
          mesh.setMatrixAt(n, dummy.matrix);
          cells[n * 2] = lingon ? 0.5 : 0; cells[n * 2 + 1] = 0;
          n++;
        }
      }
      mesh.count = n;
      const cellAttr = new THREE.InstancedBufferAttribute(cells, 2);
      shuffleInstances(mesh, n, rnd, [cellAttr]);
      geo.setAttribute('aCell', cellAttr);
      mat.userData.sh.uniforms.uCell.value = 0.5;
      /* у атласа одна строка: растягиваем V на всю высоту */
      const ob = mat.onBeforeCompile;
      mat.onBeforeCompile = (sh, r) => { ob(sh, r); sh.vertexShader = sh.vertexShader.replace('vMapUv = vMapUv * uCell + aCell;', 'vMapUv = vec2(vMapUv.x * uCell + aCell.x, vMapUv.y);'); };
      mat.customProgramCacheKey = () => 'forest-wind-shrub';
      mesh.receiveShadow = true;
      mesh.userData.noAO = true;
      mesh.name = 'shrubs';
      mesh.computeBoundingSphere();
      scene.add(mesh);
      api.shrubs = mesh;
    }

    /* ---- опавшие сухие ветки с хвоей (рыжие) ---- */
    if (M.needles && M.needles.map) {
      const mat = new THREE.MeshStandardMaterial({
        map: M.needles.map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95, metalness: 0,
        color: new THREE.Color(0.62, 0.42, 0.26)
      });
      const qg = new THREE.PlaneGeometry(0.9, 0.9);
      qg.rotateX(-Math.PI / 2);
      const DN = 900, mesh = new THREE.InstancedMesh(qg, mat, DN);
      let n = 0;
      for (let k = 0; k < 4000 && n < DN; k++) {
        const a = rnd() * TAU, d = 1.5 + Math.pow(rnd(), 0.85) * 52, x = Math.cos(a) * d, z = 2 + Math.sin(a) * d;
        if (blocked(x, z) || F.laneD(x, z) < 0.6 || (api.mudAt && api.mudAt(x, z) > 0.3)) continue;
        const sc = 0.4 + rnd() * 0.8;
        dummy.position.set(x, H(x, z) + 0.012, z);
        dummy.rotation.set((rnd() - 0.5) * 0.12, rnd() * TAU, (rnd() - 0.5) * 0.12);
        dummy.scale.set(sc, 1, sc * (0.6 + rnd() * 0.5));
        dummy.updateMatrix();
        mesh.setMatrixAt(n++, dummy.matrix);
      }
      mesh.count = n;
      shuffleInstances(mesh, n, rnd);
      mesh.receiveShadow = true;
      mesh.userData.noAO = true;
      mesh.name = 'drySprays';
      mesh.computeBoundingSphere();
      scene.add(mesh);
      api.drySprays = mesh;
    }

    /* ---- сосновые шишки ---- */
    {
      const cg = new THREE.SphereGeometry(1, 6, 4);
      cg.scale(0.026, 0.026, 0.05);
      const cc = [];
      const pa = cg.attributes.position;
      for (let i = 0; i < pa.count; i++) { const k = 0.75 + 0.25 * Math.sin(pa.getZ(i) * 300 + pa.getX(i) * 500); cc.push(0.36 * k, 0.24 * k, 0.15 * k); }
      cg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true });
      const CN = 1400, mesh = new THREE.InstancedMesh(cg, mat, CN);
      let n = 0;
      for (let k = 0; k < 5000 && n < CN; k++) {
        let x, z;
        if (rnd() < 0.7 && trees.length) {
          const t = trees[Math.floor(rnd() * trees.length)];
          if (t.d > 45) continue;
          const a = rnd() * TAU, r = 0.3 + Math.pow(rnd(), 0.7) * 3.5;
          x = t.x + Math.cos(a) * r; z = t.z + Math.sin(a) * r;
        } else { const a = rnd() * TAU, d = 2 + rnd() * 40; x = Math.cos(a) * d; z = 2 + Math.sin(a) * d; }
        if (blocked(x, z)) continue;
        const sc = 0.8 + rnd() * 0.5;
        dummy.position.set(x, H(x, z) + 0.02 * sc, z);
        dummy.rotation.set((rnd() - 0.5) * 0.5, rnd() * TAU, (rnd() - 0.5) * 0.5);
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();
        mesh.setMatrixAt(n++, dummy.matrix);
      }
      mesh.count = n;
      shuffleInstances(mesh, n, rnd);
      mesh.receiveShadow = true;
      mesh.userData.noAO = true;
      mesh.name = 'cones';
      mesh.computeBoundingSphere();
      scene.add(mesh);
      api.cones = mesh;
    }
  }

  function inZones(zones, x, z) {
    for (const q of zones) {
      if (q.fn) { if (q.fn(x, z)) return true; }
      else if (q.r !== undefined) { if ((x - q.x) * (x - q.x) + (z - q.z) * (z - q.z) < q.r * q.r) return true; }
      else if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1) return true;
    }
    return false;
  }

  /* ============================================================== ДОМИК = */
  /* Небольшой садовый дом: сруб из досок, двускатная крыша, крыльцо,
     окна и дверь — но закрытые. Внутрь не зайти: коллизия по всему объёму. */
  function buildHouse(THREE, scene, api) {
    const g = new THREE.Group();
    g.name = 'house';
    const HX = -13.5, HZ = -16.0;            // центр дома
    const W = 5.4, D = 4.4, H = 2.55;

    const woodTex = new THREE.CanvasTexture(T.woodAlbedo(11, 512, [118, 96, 70]));
    woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
    woodTex.anisotropy = 8;
    if ('colorSpace' in woodTex) woodTex.colorSpace = THREE.SRGBColorSpace;
    const woodNrm = new THREE.CanvasTexture(T.fabricNormal(12, 256, 18, 1.1));
    woodNrm.wrapS = woodNrm.wrapT = THREE.RepeatWrapping;

    const wood = new THREE.MeshStandardMaterial({
      map: woodTex, normalMap: woodNrm, normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.88, metalness: 0
    });
    const woodDark = new THREE.MeshStandardMaterial({
      map: woodTex.clone(), roughness: 0.84, metalness: 0,
      color: new THREE.Color(0.62, 0.58, 0.54)
    });
    woodDark.map.repeat.set(2, 2);
    woodDark.map.needsUpdate = true;

    /* фундамент */
    const found = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.38, D + 0.5),
      new THREE.MeshStandardMaterial({ color: 0x6d6963, roughness: 0.95 }));
    found.position.set(HX, 0.19, HZ);
    found.castShadow = found.receiveShadow = true;
    g.add(found);

    /* стены из бруса: горизонтальные брёвна дают силуэт сруба */
    const logR = 0.115;
    const rows = Math.floor(H / (logR * 2 * 0.92));
    for (let i = 0; i < rows; i++) {
      const y = 0.38 + logR + i * logR * 1.84;
      for (const [len, rot, px, pz] of [
        [W, 0, 0, -D / 2], [W, 0, 0, D / 2],
        [D, Math.PI / 2, -W / 2, 0], [D, Math.PI / 2, W / 2, 0]
      ]) {
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(logR, logR, len, 10, 1), wood);
        cyl.rotation.z = Math.PI / 2;
        cyl.rotation.y = rot;
        cyl.position.set(HX + px, y, HZ + pz);
        cyl.castShadow = cyl.receiveShadow = true;
        g.add(cyl);
      }
    }

    /* внутренняя «пробка»: дом непрозрачный, внутрь не видно */
    const core = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, H, D - 0.1),
      new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 1 }));
    core.position.set(HX, 0.38 + H / 2, HZ);
    core.castShadow = core.receiveShadow = true;
    g.add(core);

    /* фронтоны и двускатная крыша */
    const roofH = 1.25;
    for (const s of [1, -1]) {
      const tri = new THREE.Shape();
      tri.moveTo(-W / 2, 0); tri.lineTo(W / 2, 0); tri.lineTo(0, roofH); tri.closePath();
      const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), woodDark);
      m.position.set(HX, 0.38 + H, HZ + s * D / 2);
      if (s < 0) m.rotation.y = Math.PI;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    const slopeLen = Math.hypot(W / 2, roofH) + 0.22;
    const shingle = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.92, metalness: 0.02 });
    for (const s of [1, -1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.06, D + 0.6), shingle);
      p.position.set(HX + s * (W / 4 + 0.06), 0.38 + H + roofH / 2 + 0.02, HZ);
      p.rotation.z = -s * Math.atan2(roofH, W / 2);
      p.castShadow = p.receiveShadow = true;
      g.add(p);
    }

    /* дверь (закрытая) и наличники */
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.95, 0.07),
      new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8, color: new THREE.Color(0.72, 0.62, 0.5) }));
    door.position.set(HX + 1.05, 0.38 + 0.98, HZ + D / 2 + 0.06);
    door.castShadow = door.receiveShadow = true;
    g.add(door);
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a7a55, roughness: 0.4, metalness: 0.7 }));
    handle.position.set(HX + 0.70, 0.38 + 1.02, HZ + D / 2 + 0.11);
    g.add(handle);

    /* окна: тёмное стекло с рамой — внутрь всё равно не видно */
    const glass = new THREE.MeshStandardMaterial({
      color: 0x1b2429, roughness: 0.12, metalness: 0.35, envMapIntensity: 1.4
    });
    const frame = new THREE.MeshStandardMaterial({ color: 0xa9a294, roughness: 0.75 });
    const mkWindow = (x, y, z, w, h, ry) => {
      const gl = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), glass);
      gl.position.set(x, y, z); gl.rotation.y = ry;
      g.add(gl);
      for (const [ox, oy, sw, sh] of [[0, h / 2, w + 0.1, 0.07], [0, -h / 2, w + 0.1, 0.07],
        [-w / 2, 0, 0.07, h + 0.14], [w / 2, 0, 0.07, h + 0.14], [0, 0, 0.05, h]]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.07), frame);
        f.position.set(x + Math.cos(ry) * ox, y + oy, z - Math.sin(ry) * ox);
        f.rotation.y = ry;
        f.castShadow = true;
        g.add(f);
      }
    };
    mkWindow(HX - 1.30, 0.38 + 1.55, HZ + D / 2 + 0.06, 1.0, 0.85, 0);
    mkWindow(HX + W / 2 + 0.06, 0.38 + 1.55, HZ - 0.6, 0.9, 0.8, Math.PI / 2);
    mkWindow(HX - W / 2 - 0.06, 0.38 + 1.55, HZ + 0.4, 0.9, 0.8, Math.PI / 2);

    /* крыльцо со ступенями и навесом */
    const porch = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 1.1), woodDark);
    porch.position.set(HX + 1.05, 0.38 - 0.02, HZ + D / 2 + 0.62);
    porch.castShadow = porch.receiveShadow = true;
    g.add(porch);
    for (let i = 0; i < 2; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.13, 0.32), woodDark);
      st.position.set(HX + 1.05, 0.24 - i * 0.13, HZ + D / 2 + 1.25 + i * 0.30);
      st.castShadow = st.receiveShadow = true;
      g.add(st);
    }
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.1, 8), wood);
      post.position.set(HX + 1.05 + s * 0.78, 0.38 + 1.05, HZ + D / 2 + 1.0);
      post.castShadow = true;
      g.add(post);
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.07, 1.5), shingle);
    canopy.position.set(HX + 1.05, 0.38 + 2.12, HZ + D / 2 + 0.82);
    canopy.rotation.x = -0.12;
    canopy.castShadow = true;
    g.add(canopy);

    /* печная труба */
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.95, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x7d5c4e, roughness: 0.95 }));
    chim.position.set(HX - 1.4, 0.38 + H + roofH * 0.72, HZ - 0.8);
    chim.castShadow = true;
    g.add(chim);

    scene.add(g);
    /* коллизия по всему дому + крыльцу */
    api.colliders.push({ type: 'box', x0: HX - W / 2 - 0.3, x1: HX + W / 2 + 0.3, z0: HZ - D / 2 - 0.3, z1: HZ + D / 2 + 0.3, h: 3.4 });
    api.colliders.push({ type: 'box', x0: HX + 0.1, x1: HX + 2.0, z0: HZ + D / 2 + 0.05, z1: HZ + D / 2 + 1.2, h: 0.4 });
    api._noGrass.push({ x0: HX - W / 2 - 1.2, x1: HX + W / 2 + 1.2, z0: HZ - D / 2 - 1.2, z1: HZ + D / 2 + 2.2 });
    api.house = g;
  }

  /* =========================================================== ОГОРОД === */
  /* Садовый участок: вскопанные грядки с бортиками, посадки (капуста,
     лук, кусты томатов с подвязкой), парник, бочка, дорожка из плитки. */
  function buildGarden(THREE, scene, api) {
    const g = new THREE.Group();
    g.name = 'garden';
    const GX = -13.0, GZ = -5.5;            // центр огорода

    const soilTex = new THREE.CanvasTexture(soilCanvas());
    soilTex.wrapS = soilTex.wrapT = THREE.RepeatWrapping;
    soilTex.repeat.set(3, 1.6);
    soilTex.anisotropy = 8;
    if ('colorSpace' in soilTex) soilTex.colorSpace = THREE.SRGBColorSpace;
    const soilNrm = new THREE.CanvasTexture(T.fabricNormal(21, 256, 9, 2.2));
    soilNrm.wrapS = soilNrm.wrapT = THREE.RepeatWrapping;
    soilNrm.repeat.set(4, 2);
    const soilMat = new THREE.MeshStandardMaterial({
      map: soilTex, normalMap: soilNrm, normalScale: new THREE.Vector2(1.4, 1.4),
      roughness: 0.98, metalness: 0
    });
    const plankMat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(T.woodAlbedo(33, 256, [104, 86, 62])),
      roughness: 0.92, metalness: 0
    });
    plankMat.map.wrapS = plankMat.map.wrapT = THREE.RepeatWrapping;
    plankMat.map.repeat.set(3, 1);
    if ('colorSpace' in plankMat.map) plankMat.map.colorSpace = THREE.SRGBColorSpace;

    const BEDS = [
      { x: GX - 2.0, z: GZ - 2.6, w: 3.0, d: 1.25, crop: 'cabbage' },
      { x: GX - 2.0, z: GZ - 0.7, w: 3.0, d: 1.25, crop: 'onion' },
      { x: GX - 2.0, z: GZ + 1.2, w: 3.0, d: 1.25, crop: 'tomato' },
      { x: GX + 2.1, z: GZ - 1.8, w: 2.6, d: 1.15, crop: 'carrot' },
      { x: GX + 2.1, z: GZ + 0.4, w: 2.6, d: 1.15, crop: 'cabbage' }
    ];

    const rnd = U.rng(555);
    for (const b of BEDS) {
      /* земля грядки: слегка вспаханная поверхность с бороздами */
      const seg = 24;
      const geo = new THREE.PlaneGeometry(b.w, b.d, seg, Math.max(6, Math.round(seg * b.d / b.w)));
      geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const lx = p.getX(i), lz = p.getZ(i);
        /* борозды вдоль длинной стороны */
        const furrow = Math.sin(lz * 9.5) * 0.020;
        p.setY(i, 0.11 + furrow + (rnd() - 0.5) * 0.012);
      }
      geo.computeVertexNormals();
      const bed = new THREE.Mesh(geo, soilMat);
      bed.position.set(b.x, 0, b.z);
      bed.receiveShadow = true;
      g.add(bed);

      /* деревянный бортик */
      for (const [dx, dz, sx, sz] of [
        [0, -b.d / 2, b.w + 0.1, 0.05], [0, b.d / 2, b.w + 0.1, 0.05],
        [-b.w / 2, 0, 0.05, b.d], [b.w / 2, 0, 0.05, b.d]
      ]) {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.16, sz), plankMat);
        pl.position.set(b.x + dx, 0.08, b.z + dz);
        pl.castShadow = pl.receiveShadow = true;
        g.add(pl);
      }

      plantCrop(THREE, g, b, rnd);
      api._noGrass.push({ x0: b.x - b.w / 2 - 0.25, x1: b.x + b.w / 2 + 0.25, z0: b.z - b.d / 2 - 0.25, z1: b.z + b.d / 2 + 0.25 });
      api.colliders.push({ type: 'box', x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2, h: 0.20, step: true });
    }

    /* парник: дуги с полупрозрачной плёнкой */
    const filmMat = new THREE.MeshPhysicalMaterial({
      color: 0xdfece8, roughness: 0.42, metalness: 0, transmission: 0.55,
      transparent: true, opacity: 0.62, side: THREE.DoubleSide, thickness: 0.02
    });
    const arcMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.5, metalness: 0.6 });
    const gh = new THREE.Group();
    const GHX = GX + 0.2, GHZ = GZ + 3.4, GHL = 3.2, GHR = 0.85;
    for (let i = 0; i <= 6; i++) {
      const z = GHZ - GHL / 2 + (i / 6) * GHL;
      const arc = new THREE.Mesh(new THREE.TorusGeometry(GHR, 0.018, 6, 20, Math.PI), arcMat);
      arc.position.set(GHX, 0.02, z);
      arc.rotation.y = Math.PI / 2;
      arc.castShadow = true;
      gh.add(arc);
    }
    const film = new THREE.Mesh(new THREE.CylinderGeometry(GHR, GHR, GHL, 20, 1, true, 0, Math.PI), filmMat);
    film.rotation.z = Math.PI / 2;
    film.position.set(GHX, 0.02, GHZ);
    gh.add(film);
    g.add(gh);
    api.colliders.push({ type: 'box', x0: GHX - GHR, x1: GHX + GHR, z0: GHZ - GHL / 2, z1: GHZ + GHL / 2, h: 1.0 });
    api._noGrass.push({ x0: GHX - GHR - 0.3, x1: GHX + GHR + 0.3, z0: GHZ - GHL / 2 - 0.3, z1: GHZ + GHL / 2 + 0.3 });

    /* бочка для полива */
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.40, 0.92, 20, 1),
      new THREE.MeshStandardMaterial({ color: 0x3f5b4a, roughness: 0.72, metalness: 0.25 }));
    barrel.position.set(GX + 4.2, 0.46, GZ - 3.2);
    barrel.castShadow = barrel.receiveShadow = true;
    g.add(barrel);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.39, 20),
      new THREE.MeshStandardMaterial({ color: 0x24333a, roughness: 0.08, metalness: 0.2 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(GX + 4.2, 0.86, GZ - 3.2);
    g.add(water);
    api.colliders.push({ type: 'cyl', x: GX + 4.2, z: GZ - 3.2, r: 0.46, h: 0.95 });

    /* садовая дорожка из плитки */
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8d8880, roughness: 0.95 });
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const x = U.lerp(GX + 5.4, -9.0, t) + Math.sin(t * 5) * 0.5;
      const z = U.lerp(GZ + 4.0, -13.5, t);
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.44), stoneMat);
      s.position.set(x, 0.035, z);
      s.rotation.y = (U.rng(i + 3)() - 0.5) * 0.5;
      s.receiveShadow = true;
      g.add(s);
      api._noGrass.push({ x, z, r: 0.42 });
    }

    /* инструмент у стены: лопата и грабли */
    const tool = (x, z, headFn) => {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 1.5, 8), plankMat);
      handle.position.set(x, 0.75, z);
      handle.rotation.z = 0.22;
      handle.castShadow = true;
      g.add(handle);
      headFn(x - 0.17, z);
    };
    const metal = new THREE.MeshStandardMaterial({ color: 0x8b8f93, roughness: 0.45, metalness: 0.75 });
    tool(GX + 5.1, GZ + 1.2, (x, z) => {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.03), metal);
      bl.position.set(x, 0.16, z); bl.rotation.z = 0.22; bl.castShadow = true; g.add(bl);
    });
    tool(GX + 5.5, GZ + 1.5, (x, z) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.04), metal);
      bar.position.set(x, 0.10, z); bar.castShadow = true; g.add(bar);
      for (let i = 0; i < 6; i++) {
        const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.005, 0.11, 5), metal);
        t2.position.set(x - 0.15 + i * 0.06, 0.045, z); g.add(t2);
      }
    });

    scene.add(g);
    api.garden = g;
  }

  /* Земля грядки: тёмный влажный грунт с комьями. */
  function soilCanvas() {
    const S = 256;
    const c = T.canvas(S), gg = T.ctx2d(c);
    const f = U.fbm(4321, 5, 0.55, 2.3);
    const img = gg.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const n = f(x / S * 9, y / S * 9) * 0.65 + f(x / S * 34, y / S * 34) * 0.35;
        const i = (y * S + x) * 4;
        d[i] = U.clamp(44 + n * 46, 0, 255);
        d[i + 1] = U.clamp(33 + n * 36, 0, 255);
        d[i + 2] = U.clamp(24 + n * 26, 0, 255);
        d[i + 3] = 255;
      }
    }
    gg.putImageData(img, 0, 0);
    return c;
  }

  /* Посадки: простые, но узнаваемые силуэты. */
  function plantCrop(THREE, g, b, rnd) {
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x51762f, roughness: 0.82, metalness: 0, side: THREE.DoubleSide
    });
    const cabMat = new THREE.MeshStandardMaterial({ color: 0x86a05a, roughness: 0.74, side: THREE.DoubleSide });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x4a6a2c, roughness: 0.88 });
    const cols = Math.max(2, Math.floor(b.w / 0.52));
    const rows = Math.max(1, Math.floor(b.d / 0.55));
    for (let r = 0; r < rows; r++) {
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        const x = b.x - b.w / 2 + (cIdx + 0.5) * (b.w / cols) + (rnd() - 0.5) * 0.05;
        const z = b.z - b.d / 2 + (r + 0.5) * (b.d / rows) + (rnd() - 0.5) * 0.05;
        const y = 0.12;
        if (b.crop === 'cabbage') {
          /* кочан: вложенные изогнутые листья */
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 9), cabMat);
          head.position.set(x, y + 0.10, z);
          head.scale.y = 0.85;
          head.castShadow = head.receiveShadow = true;
          g.add(head);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU + rnd();
            const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.16, 8, 0, Math.PI), cabMat);
            leaf.position.set(x + Math.cos(a) * 0.09, y + 0.035, z + Math.sin(a) * 0.09);
            leaf.rotation.set(-Math.PI / 2 + 0.55, 0, a);
            leaf.castShadow = true;
            g.add(leaf);
          }
        } else if (b.crop === 'onion') {
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * TAU;
            const h = 0.22 + rnd() * 0.14;
            const bl = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.013, h, 5), stemMat);
            bl.position.set(x + Math.cos(a) * 0.03, y + h / 2, z + Math.sin(a) * 0.03);
            bl.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
            bl.castShadow = true;
            g.add(bl);
          }
        } else if (b.crop === 'carrot') {
          for (let i = 0; i < 9; i++) {
            const a = rnd() * TAU, rr = rnd() * 0.07;
            const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.19), leafMat);
            leaf.position.set(x + Math.cos(a) * rr, y + 0.09, z + Math.sin(a) * rr);
            leaf.rotation.set(-0.5 + rnd() * 0.4, a, 0);
            g.add(leaf);
          }
        } else {
          /* томат: стебель, подвязка к колышку, листья и плоды */
          const hgt = 0.62 + rnd() * 0.22;
          const st = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.016, hgt, 6), stemMat);
          st.position.set(x, y + hgt / 2, z);
          st.castShadow = true;
          g.add(st);
          const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, hgt + 0.20, 5),
            new THREE.MeshStandardMaterial({ color: 0x7d6446, roughness: 0.9 }));
          stake.position.set(x + 0.055, y + (hgt + 0.20) / 2, z);
          stake.castShadow = true;
          g.add(stake);
          for (let i = 0; i < 5; i++) {
            const hh = 0.14 + i * (hgt - 0.18) / 5;
            const a = i * 1.9;
            const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.10), leafMat);
            leaf.position.set(x + Math.cos(a) * 0.09, y + hh, z + Math.sin(a) * 0.09);
            leaf.rotation.set(-0.35, a, 0.2);
            leaf.castShadow = true;
            g.add(leaf);
          }
          if (rnd() > 0.35) {
            const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.030, 9, 7),
              new THREE.MeshStandardMaterial({ color: 0xa8341f, roughness: 0.42 }));
            fruit.position.set(x + 0.06, y + hgt * 0.55, z + 0.03);
            fruit.castShadow = true;
            g.add(fruit);
          }
        }
      }
    }
  }

  /* ========================================================= СТРЕЛЬБИЩЕ = */
  /* Огневой рубеж в точке FIRE_LINE, мишени строго на 5, 10, 20 и 30 м
     по оси -Z. Каждая мишень — поворотная рама: попадание роняет её,
     через пару секунд она поднимается. */
  const FIRE_LINE = { x: 6.5, z: 8.0 };
  const RANGES = [5, 10, 20, 30];

  /* ----------------------------------------- стрельбище: помощники */
  function cachedTex(THREE, key, srgb) {
    const k = key + (srgb ? ':s' : '');
    if (!(k in _texCache)) _texCache[k] = envTex(THREE, key, srgb);
    return _texCache[k];
  }
  /* PBR-материал из встроенного набора key_diff / key_nor / key_arm
     (ARM: R — затенение, G — шероховатость, B — металл). */
  function pbrMat(THREE, key, o) {
    o = o || {};
    const d = cachedTex(THREE, key + '_diff', true), n = cachedTex(THREE, key + '_nor'), a = cachedTex(THREE, key + '_arm');
    const metal = !!(o.metal && a);
    const c = d ? (o.tint || [1, 1, 1]) : (o.fb || [0.4, 0.37, 0.33]);
    const m = new THREE.MeshStandardMaterial({
      map: d, normalMap: n, roughnessMap: a, aoMap: a, metalnessMap: metal ? a : null,
      normalScale: new THREE.Vector2(o.ns || 1, o.ns || 1),
      roughness: a ? 1 : (o.rough || 0.9), metalness: metal ? 1 : 0,
      color: new THREE.Color(c[0], c[1], c[2])
    });
    return m;
  }
  /* UV коробки в метрах (тайл = tile м); сдвиг — чтобы одинаковые доски
     не повторяли рисунок. Только для BoxGeometry без сегментов. */
  function boxUV(geo, tile, ou, ov) {
    const p = geo.parameters, uv = geo.attributes.uv;
    const dims = [[p.depth, p.height], [p.depth, p.height], [p.width, p.depth], [p.width, p.depth], [p.width, p.height], [p.width, p.height]];
    for (let f = 0; f < 6; f++) for (let j = 0; j < 4; j++) {
      const i = f * 4 + j;
      uv.setXY(i, uv.getX(i) * dims[f][0] / tile + (ou || 0), uv.getY(i) * dims[f][1] / tile + (ov || 0));
    }
    return geo;
  }
  function scaleUV(geo, su, sv, ou, ov) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + (ou || 0), uv.getY(i) * sv + (ov || 0));
    return geo;
  }
  function xf(THREE, geo, x, y, z, rx, ry, rz) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0));
    m.setPosition(x, y, z);
    return geo.applyMatrix4(m);
  }
  /* Слияние индексированных геометрий (position/normal/uv) в одну. */
  function mergeGeos(THREE, list) {
    let nv = 0, ni = 0;
    for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), UV = new Float32Array(nv * 2), I = new Uint32Array(ni);
    let ov = 0, oi = 0;
    for (const g of list) {
      P.set(g.attributes.position.array, ov * 3);
      N.set(g.attributes.normal.array, ov * 3);
      UV.set(g.attributes.uv.array, ov * 2);
      const idx = g.index.array;
      for (let k = 0; k < idx.length; k++) I[oi + k] = idx[k] + ov;
      oi += idx.length; ov += g.attributes.position.count;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(P, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    out.setIndex(new THREE.BufferAttribute(I, 1));
    out.computeBoundingSphere();
    out.computeBoundingBox();
    return out;
  }
  function addMesh(THREE, parent, geo, mat, name, cast) {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = cast !== false;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  /* Бесшовный value-шум с периодом 1 по u и v (P узлов решётки). */
  function periodicNoise(seed, P) {
    const r = U.rng(seed), L = new Float32Array(P * P);
    for (let i = 0; i < L.length; i++) L[i] = r();
    const sm = (t) => t * t * (3 - 2 * t);
    return (u, v) => {
      const fx = (u - Math.floor(u)) * P, fy = (v - Math.floor(v)) * P;
      const ix = Math.floor(fx) % P, iy = Math.floor(fy) % P, tx = sm(fx - Math.floor(fx)), ty = sm(fy - Math.floor(fy));
      const x1 = (ix + 1) % P, y1 = (iy + 1) % P;
      const a = L[iy * P + ix] + (L[iy * P + x1] - L[iy * P + ix]) * tx;
      const b = L[y1 * P + ix] + (L[y1 * P + x1] - L[y1 * P + ix]) * tx;
      return a + (b - a) * ty;
    };
  }
  /* Поле высот S x S → карта нормалей (OpenGL, +V вверх). */
  function heightToNormal(H, S, k) {
    const c = T.canvas(S), g = T.ctx2d(c), img = g.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (H[y * S + (x + 1) % S] - H[y * S + (x + S - 1) % S]) * k;
      const dy = (H[((y + 1) % S) * S + x] - H[((y + S - 1) % S) * S + x]) * k;
      const l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* Мешковина: полотняное переплетение толстой нити, грязь, сырость. */
  function burlapTextures(THREE) {
    const S = 256, N = 32, rnd = U.rng(3131);
    const dirt = periodicNoise(4547, 6), fine = periodicNoise(911, 48);
    const jx = [], jy = [];
    for (let i = 0; i < N; i++) { jx.push(0.75 + rnd() * 0.5); jy.push(0.75 + rnd() * 0.5); }
    const Hh = new Float32Array(S * S);
    const c = T.canvas(S), g = T.ctx2d(c), img = g.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const fx = x * N / S, fy = y * N / S, ix = Math.floor(fx), iy = Math.floor(fy);
      const pw = Math.sin(Math.PI * (fx - ix)) * jx[ix], pf = Math.sin(Math.PI * (fy - iy)) * jy[iy];
      const h = ((ix + iy) & 1) ? pw * 0.85 + pf * 0.2 : pf * 0.85 + pw * 0.2;
      const u = x / S, v = y / S, fn = fine(u, v), dn = dirt(u, v);
      Hh[y * S + x] = h + (fn - 0.5) * 0.35;
      const k = (0.5 + 0.55 * h) * (0.82 + 0.36 * fn) * (0.6 + 0.55 * dn);
      const i = (y * S + x) * 4;
      d[i] = 118 * k; d[i + 1] = 102 * k; d[i + 2] = 74 * k; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const map = canvasTex(THREE, c, true), normal = canvasTex(THREE, heightToNormal(Hh, S, 2.2), false);
    map.repeat.set(6, 5); normal.repeat.set(6, 5);
    return { map, normal };
  }
  /* Мешок с песком: суперэллипсоид, завязки (полюса сферы) по длинной
     оси, концы тоньше, бока бугристые. */
  function sandbagGeometry(THREE) {
    const g = new THREE.SphereGeometry(1, 20, 12);
    g.rotateZ(Math.PI / 2);
    const p = g.attributes.position, nz = U.noise2D(77);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const sx = Math.sign(x) * Math.pow(Math.abs(x), 0.42);
      const sy = Math.sign(y) * Math.pow(Math.abs(y), 0.62);
      const sz = Math.sign(z) * Math.pow(Math.abs(z), 0.45);
      const sag = 1 - 0.3 * sx * sx;
      const lump = 1 + (nz(x * 2.3 + 4, z * 2.3 + y * 1.7) - 0.5) * 0.14;
      p.setXYZ(i, sx * 0.29, sy * 0.066 * sag * lump, sz * 0.17 * (0.78 + 0.22 * sag) * lump);
    }
    g.computeVertexNormals();
    return g;
  }

  /* Пробоина в жести: тёмная дыра, вывернутый светлый край, ржавый ореол. */
  function metalHole(g, x, y, r) {
    g.fillStyle = 'rgba(96,52,22,0.5)'; g.beginPath(); g.arc(x, y, r * 2.3, 0, TAU); g.fill();
    g.fillStyle = 'rgba(214,204,184,0.75)'; g.beginPath(); g.arc(x, y, r * 1.5, 0, TAU); g.fill();
    g.fillStyle = '#0b0a09'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  /* Грязь на табличке: ржавые потёки от болтов, копоть снизу, крап. */
  function grime(g, W, H, rnd, bolts) {
    for (const [bx, by] of bolts) {
      const gr = g.createLinearGradient(0, by, 0, by + H * (0.3 + rnd() * 0.4));
      gr.addColorStop(0, 'rgba(112,58,22,0.6)'); gr.addColorStop(1, 'rgba(112,58,22,0)');
      g.fillStyle = gr; g.fillRect(bx - 3, by, 5 + rnd() * 5, H * 0.7);
      g.fillStyle = '#2a2622'; g.beginPath(); g.arc(bx, by, Math.max(3, W * 0.018), 0, TAU); g.fill();
    }
    const gb = g.createLinearGradient(0, H * 0.6, 0, H);
    gb.addColorStop(0, 'rgba(46,38,28,0)'); gb.addColorStop(1, 'rgba(46,38,28,0.45)');
    g.fillStyle = gb; g.fillRect(0, H * 0.6, W, H * 0.4);
    for (let i = 0; i < W * 0.6; i++) {
      g.fillStyle = 'rgba(' + (50 + rnd() * 40 | 0) + ',' + (36 + rnd() * 26 | 0) + ',' + (22 + rnd() * 14 | 0) + ',' + (0.2 + rnd() * 0.5) + ')';
      g.beginPath(); g.arc(rnd() * W, H - Math.pow(rnd(), 2) * H * 0.8, 0.6 + rnd() * rnd() * W * 0.012, 0, TAU); g.fill();
    }
  }
  function signCanvas(text, seed) {
    const W = 256, H = 128, c = T.canvas(W, H), g = T.ctx2d(c), rnd = U.rng(seed);
    const bmp = GA && GA.data.env_sign_diff;
    g.fillStyle = '#cdc7b8'; g.fillRect(0, 0, W, H);
    if (bmp) { g.globalAlpha = 0.85; g.drawImage(bmp, rnd() * 250, rnd() * 370, 250, 125, 0, 0, W, H); g.globalAlpha = 1; }
    g.fillStyle = 'rgba(214,208,192,0.45)'; g.fillRect(16, 16, W - 32, H - 32);
    g.strokeStyle = 'rgba(28,28,26,0.85)'; g.lineWidth = 6; g.strokeRect(9, 9, W - 18, H - 18);
    g.fillStyle = 'rgba(20,20,19,0.92)';
    g.font = '900 64px Impact, "Arial Black", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, W / 2, 68, W - 50);
    grime(g, W, H, rnd, [[24, 26], [W - 24, 26]]);
    if (rnd() < 0.7) metalHole(g, 40 + rnd() * 170, 30 + rnd() * 70, 3.5);
    return c;
  }
  function warningCanvas() {
    const W = 768, H = 512, c = T.canvas(W, H), g = T.ctx2d(c), rnd = U.rng(2405);
    const bmp = GA && GA.data.env_sign_diff;
    g.fillStyle = '#d4cec0'; g.fillRect(0, 0, W, H);
    if (bmp) { g.globalAlpha = 0.9; g.drawImage(bmp, 0, 0, 512, 512, 0, 0, W, H); g.globalAlpha = 1; }
    g.fillStyle = 'rgba(222,216,200,0.5)'; g.fillRect(44, 44, W - 88, H - 88);
    g.strokeStyle = 'rgba(146,22,18,0.92)'; g.lineWidth = 30; g.strokeRect(26, 26, W - 52, H - 52);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(146,20,16,0.95)'; g.font = '900 176px Impact, "Arial Black", Arial, sans-serif';
    g.fillText('СТОЙ!', W / 2, 192, W - 140);
    g.fillStyle = 'rgba(24,22,20,0.95)'; g.font = '900 86px Impact, "Arial Black", Arial, sans-serif';
    g.fillText('ИДУТ СТРЕЛЬБЫ', W / 2, 352, W - 130);
    grime(g, W, H, rnd, [[70, 70], [W - 70, 70], [70, H - 70], [W - 70, H - 70]]);
    for (let k = 0; k < 5; k++) metalHole(g, 110 + rnd() * (W - 220), 80 + rnd() * (H - 160), 5 + rnd() * 3);
    return c;
  }
  /* Лицевая сторона мишени, 640 x 960 = 0,5 x 0,75 м (1280 px на метр):
     старый отсыревший картон, грудная фигура, круги зон в масштабе
     подсчёта очков, заклейки и непочиненные пробоины, грязь снизу. */
  function targetFaceCanvas(seed) {
    const Wp = 640, Hp = 960, c = T.canvas(Wp, Hp), g = T.ctx2d(c), rnd = U.rng(seed);
    const cx = Wp / 2, cy = Hp * (1 - 0.52), PX = Wp / 0.5;
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
    g.fillStyle = '#a39a83'; g.fillRect(0, 0, Wp, Hp);
    for (let i = 0; i < 150; i++) {
      g.fillStyle = rnd() < 0.55 ? 'rgba(72,64,48,' + (0.03 + rnd() * 0.07) + ')' : 'rgba(196,188,166,' + (0.03 + rnd() * 0.08) + ')';
      T.blob(g, rnd() * Wp, rnd() * Hp, 12 + rnd() * 95, undefined, U.rng(seed * 7 + i), 0.55);
    }
    for (let i = 0; i < 50; i++) {
      const x = rnd() * Wp, y0 = rnd() * Hp * 0.35, L = 120 + rnd() * 640, w = 2 + rnd() * 10;
      const gr = g.createLinearGradient(0, y0, 0, y0 + L);
      gr.addColorStop(0, 'rgba(58,50,36,0)'); gr.addColorStop(0.12, 'rgba(58,50,36,' + (0.07 + rnd() * 0.12) + ')'); gr.addColorStop(1, 'rgba(58,50,36,0)');
      g.fillStyle = gr; g.fillRect(x, y0, w, L);
    }
    /* грудная фигура — отдельным слоем, выцветает пятнами */
    const sc = T.canvas(Wp, Hp), s = T.ctx2d(sc);
    s.fillStyle = '#363b2a';
    s.beginPath(); s.ellipse(cx, 212, 92, 114, 0, 0, TAU); s.fill();
    s.beginPath();
    s.moveTo(cx - 60, 296); s.lineTo(cx - 70, 374);
    s.bezierCurveTo(cx - 190, 382, cx - 282, 432, cx - 297, 545);
    s.lineTo(cx - 302, Hp + 4); s.lineTo(cx + 302, Hp + 4); s.lineTo(cx + 297, 545);
    s.bezierCurveTo(cx + 282, 432, cx + 190, 382, cx + 70, 374);
    s.lineTo(cx + 60, 296); s.closePath(); s.fill();
    s.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 70; i++) {
      s.fillStyle = 'rgba(0,0,0,' + (0.05 + rnd() * 0.16) + ')';
      T.blob(s, rnd() * Wp, rnd() * Hp, 10 + rnd() * 60, undefined, U.rng(seed * 13 + i), 0.6);
    }
    s.globalCompositeOperation = 'source-over';
    g.drawImage(sc, 0, 0);
    /* круги зон: 10 — до 4,5 см, далее через 4,5 см */
    const RR = [0.045, 0.09, 0.135, 0.18, 0.225];
    g.strokeStyle = 'rgba(206,200,178,0.8)';
    for (let i = 0; i < RR.length; i++) { g.lineWidth = i === 0 ? 4 : 3; g.beginPath(); g.arc(cx, cy, RR[i] * PX, 0, TAU); g.stroke(); }
    g.fillStyle = 'rgba(206,200,178,0.75)';
    g.font = '700 30px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) {
      const r = (RR[i] + RR[i + 1]) * 0.5 * PX, n = String(9 - i);
      g.fillText(n, cx, cy - r); g.fillText(n, cx, cy + r); g.fillText(n, cx - r, cy); g.fillText(n, cx + r, cy);
    }
    /* заклейки старых пробоин: по фигуре — тёмные, по картону — светлые */
    const inSil = (x, y) => ((x - cx) / 92) ** 2 + ((y - 212) / 114) ** 2 < 1 || (y > 300 && Math.abs(x - cx) < 66) ||
      (y > 380 && Math.abs(x - cx) < Math.min(298, 190 + (y - 380) * 0.75));
    for (let i = 0; i < 34; i++) {
      const x = cx + gauss() * 170, y = cy + gauss() * 200, w = 20 + rnd() * 16, h = 16 + rnd() * 14;
      g.save(); g.translate(x, y); g.rotate((rnd() - 0.5) * 0.9);
      g.fillStyle = inSil(x, y) ? (rnd() < 0.5 ? '#3c4130' : '#2f3326') : (rnd() < 0.5 ? '#c3b99c' : '#b1a88d');
      g.globalAlpha = 0.88; g.fillRect(-w / 2, -h / 2, w, h);
      g.globalAlpha = 0.25; g.strokeStyle = '#1d1a14'; g.lineWidth = 1.5; g.strokeRect(-w / 2, -h / 2, w, h);
      g.restore(); g.globalAlpha = 1;
    }
    for (let i = 0; i < 26; i++) {
      const x = cx + gauss() * 150, y = cy + gauss() * 170;
      g.fillStyle = 'rgba(214,206,184,0.55)'; g.beginPath(); g.arc(x, y, 6 + rnd() * 2, 0, TAU); g.fill();
      g.fillStyle = '#120f0b'; g.beginPath(); g.arc(x + (rnd() - 0.5), y + (rnd() - 0.5), 3 + rnd() * 1.4, 0, TAU); g.fill();
    }
    /* брызги грязи снизу и затёртые края */
    const gr = g.createLinearGradient(0, Hp - 260, 0, Hp);
    gr.addColorStop(0, 'rgba(52,42,28,0)'); gr.addColorStop(1, 'rgba(52,42,28,0.55)');
    g.fillStyle = gr; g.fillRect(0, Hp - 260, Wp, 260);
    for (let i = 0; i < 420; i++) {
      const y = Hp - Math.abs(gauss()) * 230, x = rnd() * Wp, r = 0.8 + rnd() * rnd() * 7;
      g.fillStyle = 'rgba(' + (40 + rnd() * 20 | 0) + ',' + (32 + rnd() * 14 | 0) + ',' + (20 + rnd() * 10 | 0) + ',' + (0.4 + rnd() * 0.5) + ')';
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    g.strokeStyle = 'rgba(48,40,28,0.35)'; g.lineWidth = 26; g.strokeRect(0, 0, Wp, Hp);
    g.strokeStyle = 'rgba(48,40,28,0.22)'; g.lineWidth = 64; g.strokeRect(0, 0, Wp, Hp);
    const img = g.getImageData(0, 0, Wp, Hp), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 16; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9; }
    g.putImageData(img, 0, 0);
    return c;
  }
  /* Изнанка: гофрокартон с выходными отверстиями. */
  function targetBackCanvas(seed) {
    const Wp = 256, Hp = 384, c = T.canvas(Wp, Hp), g = T.ctx2d(c), rnd = U.rng(seed);
    g.fillStyle = '#74644a'; g.fillRect(0, 0, Wp, Hp);
    for (let x = 0; x < Wp; x += 5) { g.fillStyle = (x % 10 ? 'rgba(40,32,20,0.08)' : 'rgba(170,150,115,0.07)'); g.fillRect(x, 0, 2, Hp); }
    for (let i = 0; i < 60; i++) {
      g.fillStyle = 'rgba(50,40,26,' + (0.04 + rnd() * 0.1) + ')';
      T.blob(g, rnd() * Wp, rnd() * Hp, 6 + rnd() * 40, undefined, U.rng(seed + i), 0.5);
    }
    for (let i = 0; i < 18; i++) {
      const x = Wp / 2 + (rnd() - 0.5) * 140, y = Hp * 0.48 + (rnd() - 0.5) * 160;
      g.fillStyle = 'rgba(160,140,105,0.6)'; g.beginPath(); g.arc(x, y, 4 + rnd() * 2.5, 0, TAU); g.fill();
      g.fillStyle = '#0f0d0a'; g.beginPath(); g.arc(x, y, 2 + rnd(), 0, TAU); g.fill();
    }
    const gr = g.createLinearGradient(0, Hp - 110, 0, Hp);
    gr.addColorStop(0, 'rgba(40,32,20,0)'); gr.addColorStop(1, 'rgba(40,32,20,0.6)');
    g.fillStyle = gr; g.fillRect(0, Hp - 110, Wp, 110);
    return c;
  }

  /* ================================================== стрельбище == */
  function buildRange(THREE, scene, api, F, M) {
    const g = new THREE.Group();
    g.name = 'range';
    const H = F.heightAt, FL = FIRE_LINE, rnd = U.rng(1945);
    const R = {
      planks: pbrMat(THREE, 'planks', { tint: [0.80, 0.76, 0.72], fb: [0.33, 0.29, 0.25] }),
      wood: pbrMat(THREE, 'rwood', { tint: [0.74, 0.72, 0.68], fb: [0.38, 0.35, 0.31] }),
      rust: pbrMat(THREE, 'rust', { metal: true, tint: [0.82, 0.78, 0.74], fb: [0.30, 0.18, 0.11] }),
      paint: pbrMat(THREE, 'paint', { metal: true, tint: [0.78, 0.82, 0.76], fb: [0.18, 0.22, 0.14] }),
      crate: pbrMat(THREE, 'paint', { tint: [0.66, 0.72, 0.62], fb: [0.18, 0.22, 0.14] }),
      sign: pbrMat(THREE, 'sign', { metal: true, tint: [0.85, 0.83, 0.8], fb: [0.6, 0.58, 0.54] })
    };
    /* v26: материалы стрельбища доступны деталям мира (17d: доски траншеи) */
    api.rangeMats = R;
    const deco = (name, fn) => { try { fn(); } catch (e) { console.warn('range ' + name + ':', e && e.message); } };
    const bags = [];
    /* стенка из мешков от (x0,z0) до (x1,z1), ряды вперевязку */
    const wall = (x0, z0, x1, z1, rows) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 0.56));
      const yaw = Math.atan2(-(z1 - z0), x1 - x0);
      for (let r = 0; r < rows; r++) {
        const odd = r & 1, cnt = n - odd;
        for (let k = 0; k < cnt; k++) {
          const t = (k + 0.5 + odd * 0.5) / n;
          const x = x0 + (x1 - x0) * t + (rnd() - 0.5) * 0.03, z = z0 + (z1 - z0) * t + (rnd() - 0.5) * 0.03;
          /* v10: опора — по самой низкой точке под мешком (на склоне мешок
             ложится концом на грунт, а не висит над ним) */
          const ca = Math.cos(yaw) * 0.24, sa = -Math.sin(yaw) * 0.24;
          const gy = Math.min(H(x, z), H(x + ca, z + sa), H(x - ca, z - sa)) + 0.012;
          bags.push({ x, z, y: Math.min(gy, H(x, z)) + 0.058 + r * 0.112, yaw: yaw + (rnd() - 0.5) * 0.12, s: 0.93 + rnd() * 0.12,
            tx: (rnd() - 0.5) * 0.05, tz: (rnd() - 0.5) * 0.05, c: (0.78 + rnd() * 0.3) * (r === 0 ? 0.8 : 1) });
        }
      }
    };

    /* огневой рубеж: дощатый настил на лагах */
    const deckTop = 0.095;
    deco('deck', () => {
      const pl = [], sl = [];
      for (const dz of [-0.85, 0, 0.85])
        sl.push(xf(THREE, boxUV(new THREE.BoxGeometry(4.9, 0.075, 0.13), 1.2, rnd(), rnd()), FL.x, 0.022, FL.z + dz, 0, (rnd() - 0.5) * 0.02, 0));
      let z = FL.z - 1.1, k = 0;
      while (z < FL.z + 1.06) {
        const w = 0.165 + rnd() * 0.022;
        const L = k === 9 ? 3.1 : 4.6 + (rnd() - 0.5) * 0.12, ox = k === 9 ? -0.72 : (rnd() - 0.5) * 0.08;
        const geo = boxUV(new THREE.BoxGeometry(w, 0.034, L), 1.4, (k % 8) / 8 + 0.01, rnd());
        pl.push(xf(THREE, geo, FL.x + ox, deckTop - 0.017 + (rnd() - 0.5) * 0.006, z + w / 2,
          (rnd() - 0.5) * 0.012, Math.PI / 2 + (rnd() - 0.5) * 0.012, 0));
        z += w + 0.011 + rnd() * 0.006; k++;
      }
      addMesh(THREE, g, mergeGeos(THREE, pl), R.planks, 'deck_planks');
      addMesh(THREE, g, mergeGeos(THREE, sl), R.wood, 'deck_wood', false);
    });
    api._noGrass.push({ x0: FL.x - 2.5, x1: FL.x + 2.5, z0: FL.z - 1.25, z1: FL.z + 1.25 });

    /* стрелковый стол-упор, на нём цинки */
    const bx = FL.x - 1.2, bz = FL.z - 0.5, benchTop = 1.065;
    deco('bench', () => {
      const top = [], legs = [], cans = [];
      for (const dz of [-0.21, 0, 0.21])
        top.push(xf(THREE, boxUV(new THREE.BoxGeometry(0.2, 0.04, 1.62), 1.4, rnd(), rnd()), bx, benchTop - 0.02, bz + dz, 0, Math.PI / 2 + (rnd() - 0.5) * 0.01, 0));
      for (const [dx, dz] of [[-0.7, -0.24], [0.7, -0.24], [-0.7, 0.24], [0.7, 0.24]])
        legs.push(xf(THREE, boxUV(new THREE.BoxGeometry(0.075, 1.03, 0.075), 0.8, rnd(), rnd()), bx + dx, 0.51, bz + dz));
      for (const dz of [-0.29, 0.29])
        legs.push(xf(THREE, boxUV(new THREE.BoxGeometry(1.48, 0.06, 0.035), 0.8, rnd(), rnd()), bx, 0.32, bz + dz));
      for (const dx of [-0.75, 0.75])
        legs.push(xf(THREE, boxUV(new THREE.BoxGeometry(0.035, 0.06, 0.5), 0.8, rnd(), rnd()), bx + dx, 0.32, bz));
      cans.push(xf(THREE, boxUV(new THREE.BoxGeometry(0.28, 0.18, 0.1), 0.6, rnd(), rnd()), bx + 0.45, benchTop + 0.09, bz - 0.06, 0, 0.3, 0));
      cans.push(xf(THREE, boxUV(new THREE.BoxGeometry(0.28, 0.18, 0.1), 0.6, rnd(), rnd()), bx - 0.5, benchTop + 0.05, bz + 0.1, Math.PI / 2, 1.1, 0));
      addMesh(THREE, g, mergeGeos(THREE, top), R.planks, 'bench_planks');
      addMesh(THREE, g, mergeGeos(THREE, legs), R.wood, 'bench_wood');
      addMesh(THREE, g, mergeGeos(THREE, cans), R.paint, 'ammo_cans');
    });
    api.colliders.push({ type: 'box', x0: FL.x - 2.05, x1: FL.x - 0.35,
      z0: FL.z - 0.85, z1: FL.z - 0.15, h: 1.1, step: true });

    /* ящики с патронами: на настиле и за рубежом */
    deco('crates', () => {
      const cr = [];
      const crate = (x, y, z, yaw) => {
        cr.push(xf(THREE, boxUV(new THREE.BoxGeometry(0.64, 0.3, 0.38), 0.9, rnd(), rnd()), x, y + 0.15, z, 0, yaw, 0));
        for (const s of [-1, 1])
          cr.push(xf(THREE, boxUV(new THREE.BoxGeometry(0.03, 0.06, 0.3), 0.9, rnd(), rnd()),
            x + s * 0.335 * Math.cos(yaw), y + 0.2, z - s * 0.335 * Math.sin(yaw), 0, yaw, 0));
      };
      crate(FL.x + 1.55, deckTop, FL.z + 0.6, 0.22);
      const cx2 = FL.x - 1.7, cz2 = FL.z + 1.75, cy2 = H(cx2, cz2);
      crate(cx2, cy2, cz2, -0.35);
      crate(cx2 + 0.05, cy2 + 0.3, cz2 + 0.02, -0.12);
      addMesh(THREE, g, mergeGeos(THREE, cr), R.crate, 'crate');
      /* два ящика 0,64×0,38 м стопкой: цилиндр по меньшей стороне с запасом,
         прежний r 0,4 перекрывал проход у мешков */
      api.colliders.push({ type: 'cyl', x: cx2, z: cz2, r: 0.3, h: 0.6 });
    });

    /* стреляные гильзы (5,45 — стальные, лакированные) */
    deco('casings', () => {
      const N = 90, geo = new THREE.CylinderGeometry(0.0052, 0.0058, 0.039, 7);
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.20, 0.17, 0.09), metalness: 0.7, roughness: 0.42 });
      const im = new THREE.InstancedMesh(geo, mat, N), d = new THREE.Object3D();
      for (let i = 0; i < N; i++) {
        let x, z, y;
        if (i < 60) { x = FL.x - 1.8 + rnd() * 3.8; z = FL.z - 1.0 + rnd() * 2.0; y = deckTop + 0.0055; }
        else { x = FL.x - 2.4 + rnd() * 5.2; z = FL.z - 2.1 + rnd() * 0.5; y = H(x, z) + 0.004; }
        d.position.set(x, y, z); d.rotation.set(0, rnd() * TAU, Math.PI / 2); d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      }
      im.name = 'casings'; im.raycast = () => {};
      im.receiveShadow = true; im.userData.noAO = true;
      im.computeBoundingSphere();
      g.add(im);
    });

    /* брустверы рубежа из мешков: с флангов и спереди, с проходом */
    wall(FL.x - 2.75, FL.z - 1.25, FL.x - 2.75, FL.z + 1.25, 3);
    wall(FL.x + 2.75, FL.z - 1.25, FL.x + 2.75, FL.z + 1.25, 3);
    wall(FL.x - 2.6, FL.z - 1.48, FL.x - 0.7, FL.z - 1.48, 2);
    wall(FL.x + 0.7, FL.z - 1.48, FL.x + 2.6, FL.z - 1.48, 2);
    for (const s of [-1, 1]) {
      api.colliders.push({ type: 'box', x0: FL.x + s * 2.75 - 0.2, x1: FL.x + s * 2.75 + 0.2, z0: FL.z - 1.4, z1: FL.z + 1.4, h: 0.45 });
      const xa = FL.x + s * 0.62, xb = FL.x + s * 2.68;
      api.colliders.push({ type: 'box', x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: FL.z - 1.66, z1: FL.z - 1.3, h: 0.32 });
      api._noGrass.push({ x0: FL.x + s * 2.75 - 0.3, x1: FL.x + s * 2.75 + 0.3, z0: FL.z - 1.5, z1: FL.z + 1.5 });
    }
    api._noGrass.push({ x0: FL.x - 2.8, x1: FL.x + 2.8, z0: FL.z - 1.75, z1: FL.z - 1.2 });
    /* запас мешков кучей */
    for (let k = 0; k < 7; k++) {
      const a = rnd() * TAU, r = rnd() * 0.42, x = FL.x - 3.6 + Math.cos(a) * r, z = FL.z + 1.4 + Math.sin(a) * r;
      bags.push({ x, z, y: H(x, z) + 0.06 + (k > 3 ? 0.1 : 0), yaw: rnd() * TAU, s: 0.95 + rnd() * 0.1,
        tx: (rnd() - 0.5) * 0.25, tz: (rnd() - 0.5) * 0.25, c: 0.7 + rnd() * 0.3 });
    }
    api.colliders.push({ type: 'cyl', x: FL.x - 3.6, z: FL.z + 1.4, r: 0.55, h: 0.35 });

    /* мишени */
    const faceMats = [0, 1].map((k) => {
      const t = canvasTex(THREE, targetFaceCanvas(700 + k * 31), true);
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.94, metalness: 0 });
    });
    const backTex = canvasTex(THREE, targetBackCanvas(77), true);
    backTex.wrapS = backTex.wrapT = THREE.ClampToEdgeWrapping;
    const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.96, metalness: 0 });
    for (let i = 0; i < RANGES.length; i++) {
      const dist = RANGES[i];
      const x = FL.x + (i - 1.5) * 1.35;          // лёгкий веер, чтобы все были видны
      const z = FL.z - dist;
      const tg = makeTarget(THREE, faceMats[i & 1], backMat, R, dist, 900 + i * 7);
      tg.group.position.set(x, 0, z);
      g.add(tg.group);
      api.targets.push(tg);
      api._noGrass.push({ x, z, r: 0.85 });
      /* табличка с дистанцией */
      deco('sign', () => {
        const sign = makeSign(THREE, dist + ' м', R, 50 + i * 3);
        sign.position.set(x + 0.68, H(x + 0.68, z + 0.08), z + 0.08);
        sign.rotation.set((rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.08);
        g.add(sign);
      });
      /* мешки прикрывают стойку и механизм */
      wall(x - 0.58, z + 0.56, x + 0.58, z + 0.56, 3);
      api.colliders.push({ type: 'box', x0: x - 0.64, x1: x + 0.64, z0: z + 0.38, z1: z + 0.74, h: 0.42 });
      api._noGrass.push({ x0: x - 0.7, x1: x + 0.7, z0: z + 0.3, z1: z + 0.8 });
    }

    /* все мешки — один InstancedMesh */
    deco('sandbags', () => {
      const bt = burlapTextures(THREE);
      const mat = new THREE.MeshStandardMaterial({ map: bt.map, normalMap: bt.normal, normalScale: new THREE.Vector2(1.1, 1.1),
        roughness: 0.97, metalness: 0, color: new THREE.Color(0.86, 0.84, 0.8) });
      const im = new THREE.InstancedMesh(sandbagGeometry(THREE), mat, bags.length);
      const d = new THREE.Object3D(), col = new THREE.Color();
      bags.forEach((b, i) => {
        d.position.set(b.x, b.y, b.z); d.rotation.set(b.tx, b.yaw, b.tz);
        d.scale.set(b.s, b.s * (0.95 + rnd() * 0.1), b.s); d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
        im.setColorAt(i, col.setRGB(b.c, b.c * 0.97, b.c * 0.92));
      });
      im.name = 'sandbags';
      im.castShadow = im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
    });

    /* вал: бревенчатая подпорная стенка у подножия, колья, старые покрышки */
    const B = F.BERM, zf = B.z + B.hz - 0.55;
    deco('revetment', () => {
      const logs = new Geo();
      for (let r = 0; r < 3; r++) {
        let x = FL.x - 4.1 - rnd() * 0.3;
        while (x < FL.x + 4.1) {
          const L = 2.6 + rnd() * 1.8, x1 = Math.min(x + L, FL.x + 4.3);
          const rr = 0.15 + rnd() * 0.035, y = rr + r * 0.29 + 0.01;
          const zz = zf - r * 0.05 + (rnd() - 0.5) * 0.04, pts = [], radii = [];
          for (let k = 0; k <= 4; k++) {
            const u = k / 4;
            pts.push([x + (x1 - x) * u, y + Math.sin(u * Math.PI) * 0.015, zz + Math.sin(u * 2.3 + r) * 0.02]);
            radii.push(rr * (1 - 0.12 * u));
          }
          const ph = rnd() * 6;
          logs.tube(pts, radii, 10, { uRep: 2, vScale: 1.25, u0: rnd(),
            col: (t) => mixc([0.68, 0.70, 0.64], [0.95, 0.94, 0.92], 0.5 + 0.5 * Math.sin(t * 7 + ph)) });
          logs.cap(pts[0], [-1, 0, 0], radii[0], 10, [1.2, 1.0, 0.8]);
          logs.cap(pts[4], [1, 0, 0], radii[4], 10, [1.2, 1.0, 0.8]);
          x = x1 + 0.02;
        }
      }
      const lm = new THREE.Mesh(logs.build(THREE), M.bark);
      lm.name = 'revet_logs'; lm.castShadow = lm.receiveShadow = true;
      g.add(lm);
      const st = [];
      for (let x = FL.x - 4; x <= FL.x + 4.1; x += 2.0)
        st.push(xf(THREE, boxUV(new THREE.BoxGeometry(0.1, 1.15, 0.1), 0.8, rnd(), rnd()),
          x + (rnd() - 0.5) * 0.2, 0.47, zf + 0.25, (rnd() - 0.5) * 0.08, rnd(), (rnd() - 0.5) * 0.06));
      addMesh(THREE, g, mergeGeos(THREE, st), R.wood, 'revet_stakes');
      api.colliders.push({ type: 'box', x0: FL.x - 4.3, x1: FL.x + 4.4, z0: zf - 0.3, z1: zf + 0.35, h: 0.95 });
    });
    api._noGrass.push({ x0: B.x - B.hx, x1: B.x + B.hx, z0: B.z - B.hz, z1: B.z + B.hz + 0.3 });
    deco('tires', () => {
      const tg = [];
      const tire = (x, y, z, rx, ry) => tg.push(xf(THREE, scaleUV(new THREE.TorusGeometry(0.29, 0.1, 10, 24), 4, 1), x, y, z, rx, ry, 0));
      const x0 = FL.x - 4.9, y0 = H(x0, zf + 0.35);
      for (let k = 0; k < 3; k++) tire(x0 + (rnd() - 0.5) * 0.06, y0 + 0.1 + k * 0.19, zf + 0.35, Math.PI / 2 + (rnd() - 0.5) * 0.08, 0);
      tire(FL.x + 4.9, H(FL.x + 4.9, zf + 0.6) + 0.1, zf + 0.6, Math.PI / 2 + 0.1, 0);
      tire(FL.x + 5.35, H(FL.x + 5.35, zf + 1.3) + 0.27, zf + 1.3, 1.25, 0.6);
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.035, 0.035, 0.033), roughness: 0.82, metalness: 0,
        normalMap: cachedTex(THREE, 'mud_nor'), normalScale: new THREE.Vector2(0.6, 0.6) });
      addMesh(THREE, g, mergeGeos(THREE, tg), mat, 'tires');
      api.colliders.push({ type: 'cyl', x: x0, z: zf + 0.35, r: 0.42, h: 0.6 });
    });

    /* колючая проволока вдоль просеки */
    deco('wire', () => {
      const wg = new Geo(), stakes = [];
      for (const fx of [2.6, 10.4]) {
        const z0 = -0.5, z1 = -22.6, n = Math.round((z0 - z1) / 2.5), posts = [];
        for (let k = 0; k <= n; k++) {
          const z = z0 + (z1 - z0) * k / n + (k > 0 && k < n ? (rnd() - 0.5) * 0.3 : 0);
          const x = fx + (rnd() - 0.5) * 0.12, y = H(x, z);
          const p = { x, y, z, lx: (rnd() - 0.5) * 0.08, lz: (rnd() - 0.5) * 0.08, h: 1.28 + rnd() * 0.14, r: rnd() * TAU };
          posts.push(p); stakes.push(p);
        }
        for (const hh of [0.3, 0.64, 0.98]) {
          for (let k = 0; k < posts.length - 1; k++) {
            const a = posts[k], b = posts[k + 1];
            const ax = a.x + a.lx * hh + 0.045, az = a.z + a.lz * hh, bx2 = b.x + b.lx * hh + 0.045, bz2 = b.z + b.lz * hh;
            const L = Math.hypot(bx2 - ax, bz2 - az), m = Math.max(3, Math.ceil(L / 0.3)), sag = 0.025 + rnd() * 0.05;
            const at = (u) => [ax + (bx2 - ax) * u, a.y + (b.y - a.y) * u + hh - 0.2 - sag * 4 * u * (1 - u) + 0.2, az + (bz2 - az) * u];
            const pts = [];
            for (let s = 0; s <= m; s++) pts.push(at(s / m));
            wg.tube(pts, pts.map(() => 0.0024), 4, { vScale: 0.5 });
            for (let s = 0.08; s < L; s += 0.13 + rnd() * 0.02) {
              const c = at(s / L);
              for (let q = 0; q < 2; q++) {
                const ang = rnd() * TAU, dd = v3norm([Math.cos(ang) * 0.6, Math.sin(ang), (rnd() - 0.5) * 0.6]);
                wg.tube([v3add(c, dd, -0.018), v3add(c, dd, 0.018)], [0.0016, 0.0009], 3, {});
              }
            }
          }
        }
      }
      const wm = new THREE.Mesh(wg.build(THREE), R.rust);
      wm.name = 'wire'; wm.raycast = () => {};
      wm.castShadow = false; wm.receiveShadow = true; wm.userData.noAO = true;
      g.add(wm);
      const sg = boxUV(new THREE.BoxGeometry(0.07, 1, 0.07), 0.8, 0.1, 0.3);
      sg.translate(0, 0.5, 0);
      const im = new THREE.InstancedMesh(sg, R.wood, stakes.length);
      const UP = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), m4 = new THREE.Matrix4();
      stakes.forEach((p, i) => {
        q.setFromUnitVectors(UP, new THREE.Vector3(p.lx, 1, p.lz).normalize());
        qy.setFromAxisAngle(UP, p.r); q.multiply(qy);
        m4.compose(new THREE.Vector3(p.x, p.y - 0.2, p.z), q, new THREE.Vector3(1, p.h, 1));
        im.setMatrixAt(i, m4);
        if (Math.abs(p.z) < 36) api.colliders.push({ type: 'cyl', x: p.x, z: p.z, r: 0.07, h: 1.2 });
      });
      im.name = 'fence_stakes'; im.castShadow = im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
    });

    /* «СТОЙ! ИДУТ СТРЕЛЬБЫ» на въезде к рубежу, красный флаг над ним */
    deco('warning', () => {
      const x = 11.6, z = 9.8, grp = new THREE.Group();
      grp.name = 'warning_sign';
      const tex = canvasTex(THREE, warningCanvas(), true);
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.1,
        normalMap: R.sign.normalMap, normalScale: new THREE.Vector2(0.7, 0.7) });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.01), [R.sign, R.sign, R.sign, R.sign, face, R.sign]);
      plate.position.set(0, 1.45, 0.045); plate.rotation.z = 0.035;
      plate.castShadow = plate.receiveShadow = true; plate.name = 'warning_plate';
      grp.add(plate);
      const posts = [];
      for (const s of [-1, 1]) posts.push(xf(THREE, boxUV(new THREE.BoxGeometry(0.08, 2.0, 0.08), 0.8, rnd(), rnd()), s * 0.33, 0.8, 0, 0, 0, s * 0.02));
      addMesh(THREE, grp, mergeGeos(THREE, posts), R.wood, 'warning_post');
      grp.position.set(x, H(x, z), z);
      grp.rotation.y = Math.atan2(0 - x, 3 - z);
      g.add(grp);
      api.colliders.push({ type: 'cyl', x, z, r: 0.45, h: 2 });
      api._noGrass.push({ x, z, r: 0.45 });
    });
    deco('flag', () => {
      const x = FL.x + 3.2, z = FL.z + 1.9, y = H(x, z);
      addMesh(THREE, g, xf(THREE, scaleUV(new THREE.CylinderGeometry(0.022, 0.03, 3.6, 8), 0.2, 2.5), x, y + 1.6, z), R.rust, 'flag_pole');
      /* полотнище — тканевая симуляция (game/flags.js) */
      (api.flags || (api.flags = [])).push({ name: 'range', x, z, y0: y, poleH: 3.4, drop: 0.03, w: 0.8, h: 0.5, nx: 14, ny: 9,
        color: [0.30, 0.03, 0.025], pole: false, poleR: 0.03 });
      api.colliders.push({ type: 'cyl', x, z, r: 0.06, h: 3 });
    });

    /* бочки: зелёные у рубежа, ржавые у вала */
    deco('barrels', () => {
      const green = [], rusty = [];
      const barrel = (list, x, z, lying, yaw) => {
        const parts = [scaleUV(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 22, 1), 1.65, 0.8, rnd(), rnd())];
        for (const yy of [-0.29, 0.29]) parts.push(xf(THREE, scaleUV(new THREE.TorusGeometry(0.292, 0.012, 5, 22), 2, 0.05), 0, yy, 0, Math.PI / 2, 0, 0));
        const geo = mergeGeos(THREE, parts), y = H(x, z);
        if (lying) { xf(THREE, geo, x, y + 0.29, z, 0, yaw, Math.PI / 2); api.colliders.push({ type: 'cyl', x, z, r: 0.48, h: 0.6 }); }
        else { xf(THREE, geo, x, y + 0.44, z, 0, yaw, 0); api.colliders.push({ type: 'cyl', x, z, r: 0.33, h: 0.9 }); }
        list.push(geo);
      };
      barrel(green, 10.9, 7.0, false, 0.3);
      barrel(green, 11.5, 7.5, false, 1.2);
      barrel(rusty, 11.3, 6.1, true, 0.9);
      barrel(rusty, -1.9, -21.0, false, 0.2);
      barrel(green, 12.8, -21.6, true, -0.5);
      addMesh(THREE, g, mergeGeos(THREE, green), R.paint, 'barrels');
      addMesh(THREE, g, mergeGeos(THREE, rusty), R.rust, 'barrels_rust');
    });

    scene.add(g);
    api.range = g;
    api.fireLine = FIRE_LINE;
    api.ranges = RANGES;
  }

  /* Одна мишень: стойка, поворотная рама, картонное полотно.
     hinge — узел вращения; попадание переводит state в 'falling'. */
  function makeTarget(THREE, faceMat, backMat, R, dist, seed) {
    const group = new THREE.Group();
    group.name = 'target_' + dist;
    /* Реальный размер одинаковый (0,5 x 0,75 м, поясная), иначе теряется
       смысл дистанций. */
    const W = 0.50, H = 0.75, rnd = U.rng(seed);
    /* стойка: две ржавые трубы на деревянных лыжах и ось шарнира */
    const steel = [], wood = [];
    for (const s of [-1, 1]) {
      steel.push(xf(THREE, scaleUV(new THREE.CylinderGeometry(0.026, 0.03, 0.64, 10, 1), 0.2, 0.6, rnd(), rnd()),
        s * (W / 2 - 0.03), 0.3, 0, (rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.03));
      wood.push(xf(THREE, boxUV(new THREE.BoxGeometry(0.11, 0.07, 0.6), 0.9, rnd(), rnd()), s * 0.3, 0.03, 0));
    }
    steel.push(xf(THREE, scaleUV(new THREE.CylinderGeometry(0.017, 0.017, W + 0.12, 8, 1), 0.15, 0.6), 0, 0.6, 0, 0, 0, Math.PI / 2));
    wood.push(xf(THREE, boxUV(new THREE.BoxGeometry(W + 0.3, 0.07, 0.13), 0.9, rnd(), rnd()), 0, 0.095, 0));
    addMesh(THREE, group, mergeGeos(THREE, steel), R.rust, 'target_steel');
    addMesh(THREE, group, mergeGeos(THREE, wood), R.wood, 'target_wood');

    /* поворотная рама с полотном */
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.60, 0);
    group.add(hinge);
    const board = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.014), [
      backMat, backMat, backMat, backMat, faceMat, backMat
    ]);
    board.position.set(0, H / 2, 0);
    board.name = 'target_board';
    board.castShadow = board.receiveShadow = true;
    hinge.add(board);
    /* рамка чуть выступает перед картоном, сзади — поперечины */
    const fr = [];
    for (const [ox, oy, sx, sy] of [[0, H, W + 0.05, 0.035], [0, 0, W + 0.05, 0.035],
      [-W / 2, H / 2, 0.035, H], [W / 2, H / 2, 0.035, H]])
      fr.push(xf(THREE, boxUV(new THREE.BoxGeometry(sx, sy, 0.026), 0.9, rnd(), rnd()), ox, oy, -0.004));
    fr.push(xf(THREE, boxUV(new THREE.BoxGeometry(W, 0.05, 0.02), 0.9, rnd(), rnd()), 0, H * 0.5, -0.02));
    fr.push(xf(THREE, boxUV(new THREE.BoxGeometry(0.05, H, 0.02), 0.9, rnd(), rnd()), 0, H * 0.5, -0.02));
    addMesh(THREE, hinge, mergeGeos(THREE, fr), R.wood, 'target_frame_wood');

    return {
      dist, group, hinge, board,
      state: 'up', t: 0, hits: 0, lastHit: -1,
      /* габарит полотна в локальной системе hinge — для попаданий */
      W, H,
      decals: []
    };
  }

  /* Табличка с дистанцией: жесть на колышке. */
  function makeSign(THREE, text, R, seed) {
    const tex = canvasTex(THREE, signCanvas(text, seed), true);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.1,
      normalMap: R.sign.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) });
    const grp = new THREE.Group();
    grp.name = 'sign';
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.17, 0.006), [R.sign, R.sign, R.sign, R.sign, face, R.sign]);
    plate.position.set(0, 0.5, 0.03);
    plate.castShadow = true; plate.receiveShadow = true;
    plate.name = 'sign_plate';
    grp.add(plate);
    addMesh(THREE, grp, xf(THREE, boxUV(new THREE.BoxGeometry(0.05, 0.85, 0.05), 0.8, 0.2, 0.4), 0, 0.2, 0), R.wood, 'sign_post');
    return grp;
  }

  /* ---------------------------------------------------------- камни */
  /* Валуны и обломки у воронок: три формы (икосфера, смещённая 3D-шумом
     и срезанная плоскостями), мшистый камень в трипланарной проекции. */
  function noise3(seed) {
    const P = new Uint8Array(512), r = U.rng(seed), V = new Float32Array(256);
    for (let i = 0; i < 256; i++) { P[i] = i; V[i] = r(); }
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = P[i]; P[i] = P[j]; P[j] = t; }
    for (let i = 0; i < 256; i++) P[256 + i] = P[i];
    const sm = (t) => t * t * (3 - 2 * t), l = (a, b, t) => a + (b - a) * t;
    const h = (x, y, z) => V[P[P[P[x & 255] + (y & 255)] + (z & 255)]];
    return (x, y, z) => {
      const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
      const fx = sm(x - X), fy = sm(y - Y), fz = sm(z - Z);
      return l(l(l(h(X, Y, Z), h(X + 1, Y, Z), fx), l(h(X, Y + 1, Z), h(X + 1, Y + 1, Z), fx), fy),
        l(l(h(X, Y, Z + 1), h(X + 1, Y, Z + 1), fx), l(h(X, Y + 1, Z + 1), h(X + 1, Y + 1, Z + 1), fx), fy), fz);
    };
  }
  function rockGeometry(THREE, seed) {
    const base = new THREE.IcosahedronGeometry(1, 3), p = base.attributes.position;
    const map = new Map(), verts = [], idx = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const key = Math.round(x * 1e4) + ',' + Math.round(y * 1e4) + ',' + Math.round(z * 1e4);
      let j = map.get(key);
      if (j === undefined) { j = verts.length / 3; map.set(key, j); verts.push(x, y, z); }
      idx.push(j);
    }
    base.dispose();
    const n = noise3(seed), rnd = U.rng(seed + 1), cuts = [];
    for (let k = 0; k < 6; k++) cuts.push({ n: v3norm([rnd() - 0.5, (rnd() - 0.3) * 0.8, rnd() - 0.5]), c: 0.62 + rnd() * 0.3 });
    const sx = 0.85 + rnd() * 0.4, sz = 0.7 + rnd() * 0.35;
    for (let j = 0; j < verts.length; j += 3) {
      let v = [verts[j], verts[j + 1], verts[j + 2]];
      const d = 1 + 0.42 * (n(v[0] * 1.2 + 3, v[1] * 1.2, v[2] * 1.2) - 0.5) + 0.18 * (n(v[0] * 2.7 + 7, v[1] * 2.7, v[2] * 2.7) - 0.5)
        + 0.07 * (n(v[0] * 6 + 1, v[1] * 6, v[2] * 6) - 0.5);
      v = [v[0] * d, v[1] * d, v[2] * d];
      for (const c of cuts) {
        const t = v[0] * c.n[0] + v[1] * c.n[1] + v[2] * c.n[2];
        if (t > c.c) v = v3add(v, c.n, -(t - c.c) * 0.85);
      }
      if (v[1] < -0.3) v[1] = -0.3 + (v[1] + 0.3) * 0.35;
      verts[j] = v[0] * sx; verts[j + 1] = v[1] * 0.62; verts[j + 2] = v[2] * sz;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
  /* Трипланарная проекция в мировых координатах (работает и для инстансов):
     цвет, ARM и нормаль (whiteout-смешивание) из трёх проекций. */
  function triplanarMat(THREE, key, scale, tint) {
    const d = cachedTex(THREE, key + '_diff', true), n = cachedTex(THREE, key + '_nor'), a = cachedTex(THREE, key + '_arm');
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(tint[0], tint[1], tint[2]), roughness: 1, metalness: 0 });
    if (!d || !n || !a) { m.color.setRGB(0.3, 0.3, 0.28); m.roughness = 0.9; return m; }
    const u = { tTpD: { value: d }, tTpN: { value: n }, tTpA: { value: a }, uTpS: { value: 1 / scale } };
    m.customProgramCacheKey = () => 'triplanar-' + key;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'varying vec3 vTpW;\nvarying vec3 vTpN;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 tw = vec4(transformed, 1.0);
          vec3 tn = objectNormal;
          #ifdef USE_INSTANCING
            tw = instanceMatrix * tw;
            tn = mat3(instanceMatrix) * tn;
          #endif
          vTpW = (modelMatrix * tw).xyz;
          vTpN = normalize(mat3(modelMatrix) * tn);
        }`);
      sh.fragmentShader = 'uniform sampler2D tTpD, tTpN, tTpA;\nuniform float uTpS;\nvarying vec3 vTpW;\nvarying vec3 vTpN;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `
          vec3 tpN = normalize(vTpN);
          vec3 tpB = pow(abs(tpN), vec3(4.0)); tpB /= (tpB.x + tpB.y + tpB.z);
          vec2 tpUx = vTpW.zy * uTpS, tpUy = vTpW.xz * uTpS + 0.31, tpUz = vTpW.xy * uTpS + 0.67;
          vec4 tpC = texture2D(tTpD, tpUx) * tpB.x + texture2D(tTpD, tpUy) * tpB.y + texture2D(tTpD, tpUz) * tpB.z;
          vec4 tpA = texture2D(tTpA, tpUx) * tpB.x + texture2D(tTpA, tpUy) * tpB.y + texture2D(tTpA, tpUz) * tpB.z;
          diffuseColor.rgb *= tpC.rgb * mix(1.0, tpA.r, 0.7);`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * tpA.g;')
        .replace('#include <normal_fragment_maps>', `
          {
            vec3 nX = texture2D(tTpN, tpUx).xyz * 2.0 - 1.0;
            vec3 nY = texture2D(tTpN, tpUy).xyz * 2.0 - 1.0;
            vec3 nZ = texture2D(tTpN, tpUz).xyz * 2.0 - 1.0;
            nX = vec3(nX.xy + tpN.zy, abs(nX.z) * tpN.x);
            nY = vec3(nY.xy + tpN.xz, abs(nY.z) * tpN.y);
            nZ = vec3(nZ.xy + tpN.xy, abs(nZ.z) * tpN.z);
            vec3 tpWn = normalize(nX.zyx * tpB.x + nY.xzy * tpB.y + nZ.xyz * tpB.z);
            normal = normalize((viewMatrix * vec4(tpWn, 0.0)).xyz);
          }`);
    };
    return m;
  }
  /* ------------------------------------------------------- минное поле */
  /* Участок по периметру заминирован. Внутренняя граница — линия
     ограждения (IMAS 08.40, ГОСТ-практика инженерных войск): деревянные
     колья через 4–5 м, две нити колючей проволоки (0,5 и 0,95 м), на
     верхней — треугольные знаки вершиной вниз: красное поле, белые череп
     с костями и «МИНЫ», изнанка белая (сторона «опасно» — к полю зрения
     того, кто подходит изнутри). Знаки — через ~15 м и у каждого угла.

     За ограждением — пояс шириной ~7,5 м:
       * ПМН-2 (Ø121 × 54 мм, зелёный пластик, чёрная резиновая крышка с
         крестом) — четыре ряда в шахматном порядке, шаг в ряду ~1,75 м;
         большинство заглублено (виден только холмик потревоженного
         грунта), часть — заподлицо, немногие лежат на поверхности;
       * ОЗМ-72 (выпрыгивающая, взрыватель МУВ-2 с растяжками) — две
         сплошные «змейки» растяжек вдоль всего периметра: каждая мина —
         вершина ломаной, между минами — колышки. Замкнутую ломаную
         нельзя пересечь, не задев проволоку;
       * на выезде грунтовки — ряд ТМ-62М поперёк дороги (на поверхности,
         как это делают при быстром минировании) и две в колеях, спираль
         АКЛ поперёк проезда и щит «СТОЙ! МИНЫ».
     ТМ-62М срабатывает от 200 кг и выше — человек её не подорвёт. */
  const MINEFIELD = { x: 27, z: 32, depth: 7.6 };
  /* v10: границы, до которых нужны коллизии (край минного поля + запас) */
  const PLAY_X = MINEFIELD.x + MINEFIELD.depth + 1.5, PLAY_Z = MINEFIELD.z + MINEFIELD.depth + 1.5;

  /* Череп с костями (контур, как на знаках IMAS) */
  function skullGlyph(g, cx, cy, s, fill, hole) {
    g.save();
    g.translate(cx, cy);
    g.fillStyle = fill;
    const bone = (ang) => {
      g.save(); g.rotate(ang);
      const L = s * 1.08, w = s * 0.13;
      g.fillRect(-L / 2, -w / 2, L, w);
      for (const ex of [-L / 2, L / 2]) for (const ey of [-w * 0.5, w * 0.5]) { g.beginPath(); g.arc(ex, ey, w * 0.6, 0, TAU); g.fill(); }
      g.restore();
    };
    g.save(); g.translate(0, s * 0.36); bone(0.56); bone(-0.56); g.restore();
    g.beginPath(); g.ellipse(0, -s * 0.06, s * 0.34, s * 0.33, 0, 0, TAU); g.fill();
    g.beginPath();
    g.moveTo(-s * 0.21, s * 0.12); g.lineTo(s * 0.21, s * 0.12); g.lineTo(s * 0.18, s * 0.37); g.lineTo(-s * 0.18, s * 0.37); g.closePath(); g.fill();
    g.fillStyle = hole;
    for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * s * 0.135, -s * 0.03, s * 0.095, s * 0.105, sx * 0.25, 0, TAU); g.fill(); }
    g.beginPath(); g.moveTo(0, s * 0.08); g.lineTo(-s * 0.045, s * 0.17); g.lineTo(s * 0.045, s * 0.17); g.closePath(); g.fill();
    for (let k = -2; k <= 2; k++) g.fillRect(k * s * 0.072 - s * 0.009, s * 0.235, s * 0.018, s * 0.12);
    g.restore();
  }
  /* Треугольный знак вершиной вниз, 512 × 420 px ≈ 0,40 × 0,33 м. */
  function mineSignCanvas(seed, back) {
    const W = 512, Hh = 420, c = T.canvas(W, Hh), g = T.ctx2d(c), rnd = U.rng(seed);
    g.clearRect(0, 0, W, Hh);
    const A = [10, 12], B = [W - 10, 12], C = [W / 2, Hh - 8];
    /* вписанная окружность — для ровной каймы */
    const ab = Math.hypot(B[0] - A[0], B[1] - A[1]), bc = Math.hypot(C[0] - B[0], C[1] - B[1]), ca = Math.hypot(A[0] - C[0], A[1] - C[1]);
    const P = ab + bc + ca, ix = (bc * A[0] + ca * B[0] + ab * C[0]) / P, iy = (bc * A[1] + ca * B[1] + ab * C[1]) / P;
    const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2, rin = 2 * area / P;
    const tri = (e) => {
      const k = (rin - e) / rin;
      const q = (p) => [ix + (p[0] - ix) * k, iy + (p[1] - iy) * k];
      const a = q(A), b = q(B), cc = q(C);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(cc[0], cc[1]); g.closePath();
    };
    const bmp = GA && GA.data.env_sign_diff;
    g.save();
    tri(0); g.clip();
    if (back) {
      g.fillStyle = '#c9c6bc'; g.fillRect(0, 0, W, Hh);
      if (bmp) { g.globalAlpha = 0.7; g.drawImage(bmp, rnd() * 250, rnd() * 300, 300, 250, 0, 0, W, Hh); g.globalAlpha = 1; }
      g.fillStyle = 'rgba(226,222,212,0.55)'; g.fillRect(0, 0, W, Hh);
    } else {
      g.fillStyle = '#9c1d18'; g.fillRect(0, 0, W, Hh);
      if (bmp) { g.globalAlpha = 0.35; g.globalCompositeOperation = 'multiply'; g.drawImage(bmp, rnd() * 250, rnd() * 300, 300, 250, 0, 0, W, Hh); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
      /* выгоревшая краска: светлые пятна и потёртости */
      for (let i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(' + (190 + rnd() * 40 | 0) + ',' + (70 + rnd() * 40 | 0) + ',' + (60 + rnd() * 30 | 0) + ',' + (0.04 + rnd() * 0.08).toFixed(3) + ')';
        g.beginPath(); g.arc(rnd() * W, rnd() * Hh, 8 + rnd() * 40, 0, TAU); g.fill();
      }
      g.lineWidth = 9; g.strokeStyle = 'rgba(236,232,222,0.95)'; tri(14); g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(238,234,224,0.97)';
      g.font = '900 50px Impact, "Arial Black", Arial, sans-serif';
      g.fillText('ОПАСНО', W / 2, 62, 300);
      g.font = '900 96px Impact, "Arial Black", Arial, sans-serif';
      g.fillText('МИНЫ!', W / 2, 136, 330);
      skullGlyph(g, W / 2, 242, 112, 'rgba(238,234,224,0.97)', '#9c1d18');
    }
    g.restore();
    /* ржавые потёки от гвоздей, грязь снизу, крап */
    g.save(); tri(0); g.clip();
    grime(g, W, Hh, rnd, [[120, 40], [W - 120, 40]]);
    if (rnd() < 0.6) metalHole(g, 150 + rnd() * 210, 60 + rnd() * 160, 4 + rnd() * 2);
    g.restore();
    return c;
  }
  function stopMinesCanvas() {
    const W = 768, Hh = 512, c = T.canvas(W, Hh), g = T.ctx2d(c), rnd = U.rng(911);
    const bmp = GA && GA.data.env_sign_diff;
    g.fillStyle = '#d6d0c2'; g.fillRect(0, 0, W, Hh);
    if (bmp) { g.globalAlpha = 0.9; g.drawImage(bmp, 0, 0, 512, 512, 0, 0, W, Hh); g.globalAlpha = 1; }
    g.fillStyle = 'rgba(224,218,204,0.5)'; g.fillRect(44, 44, W - 88, Hh - 88);
    g.strokeStyle = 'rgba(150,22,18,0.94)'; g.lineWidth = 30; g.strokeRect(26, 26, W - 52, Hh - 52);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(150,20,16,0.96)'; g.font = '900 170px Impact, "Arial Black", Arial, sans-serif';
    g.fillText('СТОЙ!', W / 2 + 60, 170, W - 260);
    g.fillStyle = 'rgba(22,20,18,0.96)'; g.font = '900 150px Impact, "Arial Black", Arial, sans-serif';
    g.fillText('МИНЫ', W / 2 + 60, 340, W - 260);
    skullGlyph(g, 130, 250, 150, 'rgba(22,20,18,0.95)', '#d0cabb');
    grime(g, W, Hh, rnd, [[70, 70], [W - 70, 70], [70, Hh - 70], [W - 70, Hh - 70]]);
    for (let k = 0; k < 4; k++) metalHole(g, 110 + rnd() * (W - 220), 80 + rnd() * (Hh - 160), 5 + rnd() * 3);
    return c;
  }

  /* Тонкая проволока: лента к камере шириной max(реальная, ~1,5 px);
     если реальная толщина меньше пикселя, лента бледнее, а не толще —
     растяжку в траве видно только вблизи, как и в жизни. */
  /* Тонкая проволока. Трубка толщиной в миллиметры на расстоянии уже
     меньше пикселя и рвётся на пунктир. Поэтому проволока — лента,
     развёрнутая к камере в экранном пространстве, шириной не меньше
     1,5 px; если настоящая толщина меньше, лента бледнеет на долю
     покрытия пикселя. Свет обычный PBR (окружение, солнце, тени), нормаль
     поворачивается поперёк ленты, как у цилиндра. */
  function LineBuf() { this.P = []; this.O = []; this.S = []; this.R = []; this.I = []; }
  LineBuf.prototype.add = function (pts, rad) {
    const v0 = this.P.length / 3;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], base = this.P.length / 3;
      this.P.push(a[0], a[1], a[2], a[0], a[1], a[2], b[0], b[1], b[2], b[0], b[1], b[2]);
      this.O.push(b[0], b[1], b[2], b[0], b[1], b[2], a[0], a[1], a[2], a[0], a[1], a[2]);
      this.S.push(-1, 1, -1, 1);
      const r = typeof rad === 'number' ? rad : rad[k];
      this.R.push(r, r, r, r);
      this.I.push(base, base + 3, base + 2, base, base + 2, base + 1);
    }
    return [v0, this.P.length / 3];
  };
  LineBuf.prototype.build = function (THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('aOther', new THREE.Float32BufferAttribute(this.O, 3));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(this.S, 1));
    g.setAttribute('aRad', new THREE.Float32BufferAttribute(this.R, 1));
    const n = new Float32Array(this.P.length);
    for (let i = 1; i < n.length; i += 3) n[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    g.setIndex(this.I);
    g.computeBoundingSphere();
    return g;
  };
  const LINE_RES = { value: null };
  /* boost — «острота глаза»: пиксель экрана при 70° обзора ≈ 2 мрад, а
     глаз различает ≈ 0,3 мрад, поэтому проволока толщиной в доли пикселя
     в жизни видна заметно лучше, чем дала бы честная доля покрытия */
  function lineMat(THREE, params, boost) {
    if (!LINE_RES.value) LINE_RES.value = new THREE.Vector2(1920, 1080);
    const mat = new THREE.MeshStandardMaterial(Object.assign({ transparent: true, depthWrite: false }, params));
    const uBoost = { value: boost || 1 };
    mat.customProgramCacheKey = () => 'thin-line-std';
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uRes = LINE_RES;
      sh.uniforms.uBoost = uBoost;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 aOther; attribute float aSide; attribute float aRad;
          uniform vec2 uRes; uniform float uBoost; varying float vLineA;`)
        .replace('#include <project_vertex>', `#include <project_vertex>
          {
            vec4 mo = modelViewMatrix * vec4(aOther, 1.0);
            vec3 pa = mvPosition.xyz, pb = mo.xyz;
            if (pb.z > -0.02 && pa.z < -0.02) pb = pa + (pb - pa) * ((-0.02 - pa.z) / (pb.z - pa.z));
            vec4 c0 = projectionMatrix * vec4(pa, 1.0), c1 = projectionMatrix * vec4(pb, 1.0);
            vec2 s0 = c0.xy / c0.w * uRes, s1 = c1.xy / max(c1.w, 1e-4) * uRes;
            vec2 dir = s1 - s0; float L = length(dir);
            dir = L > 1e-5 ? dir / L : vec2(1.0, 0.0);
            vec2 nrm = vec2(-dir.y, dir.x);
            float pxm = projectionMatrix[1][1] * uRes.y * 0.5 / max(-pa.z, 1e-3);
            float wpx = aRad * pxm, hw = max(wpx, 0.75);
            vLineA = clamp(wpx * uBoost / hw, 0.0, 1.0);
            gl_Position.xy += nrm * aSide * hw * 2.0 / uRes * gl_Position.w;
            vec3 T = pb - pa; T = length(T) > 1e-6 ? normalize(T) : vec3(1.0, 0.0, 0.0);
            vec3 Vd = normalize(-pa);
            vec3 N0 = Vd - T * dot(Vd, T); N0 = length(N0) > 1e-5 ? normalize(N0) : Vd;
            vec3 Bv = normalize(cross(T, N0));
            float sg = dot(Bv.xy, nrm) >= 0.0 ? 1.0 : -1.0;
            vNormal = normalize(N0 * 0.35 + Bv * (sg * aSide * 0.94));
          }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vLineA;')
        .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n  diffuseColor.a *= vLineA;');
    };
    return mat;
  }
  function lineMesh(THREE, buf, mat, name) {
    const m = new THREE.Mesh(buf.build(THREE), mat);
    m.name = name; m.frustumCulled = false; m.raycast = () => {};
    m.castShadow = false; m.receiveShadow = true; m.renderOrder = 3; m.userData.noAO = true;
    const _rs = new THREE.Vector2();
    m.onBeforeRender = (r) => { r.getDrawingBufferSize(_rs); if (LINE_RES.value) LINE_RES.value.copy(_rs); };
    return m;
  }

  function buildMinefield(THREE, scene, api, F, trees) {
    const g = new THREE.Group();
    g.name = 'minefield';
    const H = F.heightAt, rnd = U.rng(5317);
    const XF = MINEFIELD.x, ZF = MINEFIELD.z;
    const LX = 2 * XF, LZ = 2 * ZF, PER = 2 * (LX + LZ);
    /* точка периметра: s — путь вдоль линии ограждения, d — отступ наружу;
       [x, z, nx, nz] (n — нормаль наружу) */
    const at = (s, d) => {
      s = ((s % PER) + PER) % PER;
      const ax = XF + d, az = ZF + d;
      if (s < LX) { const u = s / LX; return [-ax + 2 * ax * u, az, 0, 1]; }
      s -= LX;
      if (s < LZ) { const u = s / LZ; return [ax, az - 2 * az * u, 1, 0]; }
      s -= LZ;
      if (s < LX) { const u = s / LX; return [ax - 2 * ax * u, -az, 0, -1]; }
      s -= LX;
      const u = s / LZ; return [-ax, -az + 2 * az * u, -1, 0];
    };
    const outside = (x, z) => Math.max(Math.abs(x) - XF, Math.abs(z) - ZF);
    const treeAt = (x, z, r) => trees && trees.near ? trees.near(x, z, r) : null;
    const normalAt = (x, z) => {
      const e = 0.15, hx = H(x + e, z) - H(x - e, z), hz = H(x, z + e) - H(x, z - e);
      return new THREE.Vector3(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
    };
    const UP = new THREE.Vector3(0, 1, 0);
    const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

    /* ---- выезд грунтовки: где ось колеи пересекает линию ограждения */
    let roadS = -1, best = 9;
    for (let s = 0; s < PER; s += 0.1) { const p = at(s, 0), d = F.trackD(p[0], p[1]); if (d < best) { best = d; roadS = s; } }
    const road = best < 1 ? { s: roadS, p: at(roadS, 0) } : null;
    if (road) {
      /* направление дороги наружу — по точкам колеи за линией */
      let bx = 0, bz = 0;
      for (let k = 0; k < 2; k++) {
        const p0 = at(roadS, 0);
        let px = p0[0], pz = p0[1];
        /* шагаем наружу вдоль колеи: ищем ближайшую к оси точку на отступе 6 м */
        let bb = 9, bxx = 0, bzz = 0;
        for (let s = roadS - 8; s < roadS + 8; s += 0.1) { const q = at(s, 6), d = F.trackD(q[0], q[1]); if (d < bb) { bb = d; bxx = q[0]; bzz = q[1]; } }
        bx = bxx - px; bz = bzz - pz;
      }
      const L = Math.hypot(bx, bz) || 1;
      road.dx = bx / L; road.dz = bz / L;
    }
    const onRoad = (x, z, w) => F.trackD(x, z) < w;

    const mines = [], wires = [];
    const grid = new Map(), CELL = 1.0, gk = (i, j) => (i + 1000) * 4096 + (j + 1000);
    const addGrid = (m) => {
      const k = gk(Math.floor(m.x / CELL), Math.floor(m.z / CELL));
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(m);
    };
    const nearMines = (x, z, r, out) => {
      out = out || [];
      const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const L = grid.get(gk(i, j));
        if (L) for (const m of L) if (Math.hypot(m.x - x, m.z - z) < r) out.push(m);
      }
      return out;
    };
    const freeSpot = (x, z, r) => nearMines(x, z, r).length === 0;
    const addMine = (type, x, z, state, extra) => {
      const m = Object.assign({ id: mines.length, type, x, z, y: H(x, z), state, alive: true, yaw: rnd() * TAU, inst: [], wires: [] }, extra || {});
      mines.push(m); addGrid(m);
      return m;
    };

    /* ---- ОЗМ-72 и растяжки: две замкнутые «змейки» */
    const loops = [
      { dm: 2.9, dIn: 1.45, dOut: 4.35, ph: 1.7 },
      { dm: 6.05, dIn: 4.85, dOut: 7.25, ph: 1.7 + 5.4 }
    ];
    const pegs = [];
    const wireBlocked = (a, b) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 0.3);
      for (let k = 0; k <= n; k++) { const u = k / n; if (treeAt(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, 0.06)) return true; }
      return false;
    };
    for (const lp of loops) {
      const N = Math.round(PER / 10.6), step = PER / N;
      const verts = [];
      for (let k = 0; k < N; k++) {
        let sm = lp.ph + k * step, p = at(sm, lp.dm);
        for (let tr = 0; tr < 6 && (treeAt(p[0], p[1], 0.35) || F.craterD(p[0], p[1]) < 1.1); tr++) { sm += (tr % 2 ? -1 : 1) * 0.7 * (tr + 1); p = at(sm, lp.dm); }
        const m = addMine('ozm', p[0], p[1], 'flush', { s: sm });
        verts.push({ mine: m, x: p[0], z: p[1], s: sm });
        const sp = lp.ph + (k + 0.5) * step, dp = k % 2 ? lp.dOut : lp.dIn;
        let q = at(sp, dp);
        for (let tr = 0; tr < 6 && treeAt(q[0], q[1], 0.2); tr++) q = at(sp + (tr % 2 ? -1 : 1) * 0.5 * (tr + 1), dp);
        const peg = { x: q[0], z: q[1], y: H(q[0], q[1]), lean: (rnd() - 0.5) * 0.25, yaw: rnd() * TAU, h: 0.2 + rnd() * 0.06 };
        pegs.push(peg);
        verts.push({ peg, x: q[0], z: q[1] });
      }
      /* ломаная мина → колышек → мина … замкнута */
      for (let k = 0; k < verts.length; k++) {
        const a = verts[k], b = verts[(k + 1) % verts.length];
        const m = a.mine || b.mine;
        const ha = a.mine ? 0.068 : a.peg.h * 0.62, hb = b.mine ? 0.068 : b.peg.h * 0.62;
        const w = { ax: a.x, az: a.z, ay: H(a.x, a.z) + ha, bx: b.x, bz: b.z, by: H(b.x, b.z) + hb, mine: m, alive: true };
        wires.push(w); m.wires.push(w);
      }
    }

    /* ---- ПМН-2: четыре ряда в шахматном порядке */
    const rows = [1.15, 2.4, 4.6, 5.75];
    rows.forEach((d, ri) => {
      const sp = 1.75, n = Math.round(PER / sp);
      for (let k = 0; k < n; k++) {
        const s = k * PER / n + ri * 0.44 + (rnd() - 0.5) * 0.5;
        const p = at(s, d + (rnd() - 0.5) * 0.36);
        const x = p[0], z = p[1];
        if (treeAt(x, z, 0.25) || F.craterD(x, z) < 1.12) continue;
        if (road && onRoad(x, z, 1.75)) continue;
        if (!freeSpot(x, z, 0.75)) continue;
        const u = rnd();
        addMine('pmn', x, z, u < 0.70 ? 'buried' : u < 0.92 ? 'flush' : 'surface');
      }
    });
    /* обочины выезда — чаще: по ним объезжают */
    if (road) {
      const px = -road.dz, pz = road.dx;
      for (let k = 0; k < 14; k++) {
        const along = 0.8 + rnd() * 6.2, side = (k % 2 ? 1 : -1) * (1.95 + rnd() * 1.1);
        const x = road.p[0] + road.dx * along + px * side, z = road.p[1] + road.dz * along + pz * side;
        if (outside(x, z) < 0.6 || treeAt(x, z, 0.25) || !freeSpot(x, z, 0.6)) continue;
        addMine('pmn', x, z, rnd() < 0.55 ? 'buried' : 'flush');
      }
      /* ТМ-62М: ряд поперёк проезда на поверхности + две в колеях */
      for (let k = 0; k < 4; k++) {
        const side = -1.55 + k * 1.03 + (rnd() - 0.5) * 0.12, along = 3.1 + (rnd() - 0.5) * 0.25;
        addMine('tm', road.p[0] + road.dx * along + px * side, road.p[1] + road.dz * along + pz * side, 'surface');
      }
      for (const [along, side] of [[5.4, 0.8], [6.9, -0.8]])
        addMine('tm', road.p[0] + road.dx * along + px * side, road.p[1] + road.dz * along + pz * side, 'flush');
    }

    /* ------------------------------------------------ материалы --- */
    const wood = pbrMat(THREE, 'rwood', { tint: [0.70, 0.67, 0.62], fb: [0.36, 0.33, 0.29] });
    const rust = pbrMat(THREE, 'rust', { metal: true, tint: [0.78, 0.74, 0.70], fb: [0.30, 0.18, 0.11] });
    const signM = pbrMat(THREE, 'sign', { metal: true, tint: [0.85, 0.83, 0.8], fb: [0.6, 0.58, 0.54] });
    const plastic = pbrMat(THREE, 'paint', { tint: [0.50, 0.56, 0.40], fb: [0.10, 0.12, 0.06] });
    plastic.metalness = 0; plastic.metalnessMap = null; plastic.roughness = 1;
    const olive = pbrMat(THREE, 'paint', { metal: true, tint: [0.62, 0.68, 0.52], fb: [0.12, 0.14, 0.08] });
    const rubber = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.016, 0.016, 0.015), roughness: 0.86, metalness: 0 });
    const fuzeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.10, 0.105, 0.07), roughness: 0.5, metalness: 0.55 });
    const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.42, 0.42, 0.40), roughness: 0.42, metalness: 0.9 });
    const mudD = cachedTex(THREE, 'mud_diff', true), mudN = cachedTex(THREE, 'mud_nor'), mudA = cachedTex(THREE, 'mud_arm');
    const soil = new THREE.MeshStandardMaterial({ map: mudD, normalMap: mudN, roughnessMap: mudA, roughness: 1, metalness: 0,
      color: mudD ? new THREE.Color(0.60, 0.55, 0.50) : new THREE.Color(0.10, 0.08, 0.06) });

    /* ------------------------------------------------ геометрия мин --- */
    const merge = (list) => mergeGeos(THREE, list.map((x) => x.index ? x : x));
    const cyl = (r0, r1, h, y, seg) => xf(THREE, new THREE.CylinderGeometry(r0, r1, h, seg || 28, 1), 0, y, 0);
    /* ПМН-2: корпус + боковой механизм взведения; крышка + крест */
    const pmnBodyG = merge([
      cyl(0.0605, 0.0612, 0.040, 0.020), cyl(0.0545, 0.0605, 0.006, 0.043),
      xf(THREE, new THREE.CylinderGeometry(0.0105, 0.0105, 0.034, 12, 1), 0.071, 0.021, 0, 0, 0, Math.PI / 2),
      xf(THREE, new THREE.CylinderGeometry(0.0128, 0.0128, 0.006, 12, 1), 0.089, 0.021, 0, 0, 0, Math.PI / 2)
    ]);
    const pmnTopG = merge([
      cyl(0.0495, 0.0525, 0.0075, 0.0498),
      xf(THREE, new THREE.BoxGeometry(0.086, 0.004, 0.011), 0, 0.0553, 0, 0, Math.PI / 4, 0),
      xf(THREE, new THREE.BoxGeometry(0.086, 0.004, 0.011), 0, 0.0553, 0, 0, -Math.PI / 4, 0),
      cyl(0.012, 0.014, 0.004, 0.0555, 16)
    ]);
    /* ОЗМ-72: крышка корпуса (корпус в грунте) и взрыватель МУВ-2 с кольцом чеки */
    const ozmLidG = merge([cyl(0.054, 0.054, 0.012, 0.006), cyl(0.022, 0.026, 0.008, 0.016, 16)]);
    const ozmFuzeG = merge([
      cyl(0.0085, 0.0085, 0.052, 0.046, 12), cyl(0.0102, 0.0102, 0.007, 0.074, 12),
      xf(THREE, new THREE.TorusGeometry(0.0085, 0.0012, 5, 14), 0.0, 0.0875, 0, 0, Math.PI / 2, 0),
      xf(THREE, new THREE.BoxGeometry(0.003, 0.012, 0.003), 0.0, 0.080, 0)
    ]);
    /* ТМ-62М: корпус, фаска, взрыватель МВЧ-62, ручка */
    const tmBodyG = merge([
      cyl(0.160, 0.160, 0.092, 0.046, 40), cyl(0.132, 0.160, 0.018, 0.101, 40),
      xf(THREE, new THREE.BoxGeometry(0.05, 0.016, 0.03), 0.168, 0.06, 0)
    ]);
    const tmFuzeG = merge([cyl(0.046, 0.046, 0.026, 0.121, 24), cyl(0.040, 0.044, 0.012, 0.139, 24)]);
    /* холмик потревоженного грунта */
    const moundG = new THREE.SphereGeometry(1, 12, 4, 0, TAU, 0, Math.PI / 2); /* v15: 96 треуг. вместо 192 — холмик в траве, разницы не видно */
    scaleUV(moundG, 0.35, 0.18);

    const pick = (type, states) => mines.filter((m) => m.type === type && states.indexOf(m.state) >= 0);
    const inst = (geo, mat, list, place, name, cast) => {
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      im.count = list.length;
      list.forEach((m, i) => { place(m, _m); im.setMatrixAt(i, _m); m.inst.push([im, i]); });
      im.instanceMatrix.needsUpdate = true;
      im.name = name; im.castShadow = cast !== false; im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
      return im;
    };
    /* ориентация по нормали грунта + курс + наклон (для лежащих сверху) */
    const placeMine = (m, M4, dy, tilt) => {
      const n = normalAt(m.x, m.z);
      _q.setFromUnitVectors(UP, n);
      if (tilt) { _q2.setFromAxisAngle(_p.set(Math.cos(m.yaw * 1.7), 0, Math.sin(m.yaw * 1.7)), tilt); _q.premultiply(_q2); }
      _q.multiply(_q2.setFromAxisAngle(UP, m.yaw));
      M4.compose(_p.set(m.x, m.y + dy, m.z), _q, _s.set(1, 1, 1));
      return M4;
    };
    for (const m of mines) m.tilt = m.state === 'surface' ? 0.03 + rnd() * 0.09 : 0;
    const pmnDy = (m) => (m.state === 'flush' ? -0.042 : -0.004);
    const pmnVis = pick('pmn', ['flush', 'surface']);
    inst(pmnBodyG, plastic, pmnVis, (m, M4) => placeMine(m, M4, pmnDy(m), m.tilt), 'pmn2_body');
    inst(pmnTopG, rubber, pmnVis, (m, M4) => placeMine(m, M4, pmnDy(m), m.tilt), 'pmn2_top');
    const ozm = pick('ozm', ['flush']);
    inst(ozmLidG, olive, ozm, (m, M4) => placeMine(m, M4, -0.008, 0), 'ozm72_lid');
    inst(ozmFuzeG, fuzeMat, ozm, (m, M4) => placeMine(m, M4, -0.008, 0), 'ozm72_fuze');
    const tms = pick('tm', ['flush', 'surface']);
    const tmDy = (m) => (m.state === 'flush' ? -0.098 : -0.006);
    inst(tmBodyG, olive, tms, (m, M4) => placeMine(m, M4, tmDy(m), m.tilt), 'tm62_body');
    inst(tmFuzeG, fuzeMat, tms, (m, M4) => placeMine(m, M4, tmDy(m), m.tilt), 'tm62_fuze');
    /* холмики: над заглублёнными, вокруг уложенных заподлицо */
    const mounds = mines.filter((m) => m.state !== 'surface');
    const moundIm = inst(moundG, soil, mounds, (m, M4) => {
      const n = normalAt(m.x, m.z);
      _q.setFromUnitVectors(UP, n).multiply(_q2.setFromAxisAngle(UP, m.yaw * 2.3));
      const big = m.type === 'tm' ? 2.3 : 1, r = (m.state === 'flush' ? 0.15 : 0.13) * big * (0.85 + rnd() * 0.35);
      const h = m.state === 'flush' ? 0.010 : 0.014 + rnd() * 0.012;
      M4.compose(_p.set(m.x, m.y - 0.004, m.z), _q, _s.set(r * (1.1 + rnd() * 0.25), h * big, r));
      return M4;
    }, 'mine_mounds', false);
    const tint = new THREE.Color();
    mounds.forEach((m, i) => { const k = 0.72 + rnd() * 0.3; moundIm.setColorAt(i, tint.setRGB(k, k * 0.97, k * 0.93)); });
    if (moundIm.instanceColor) moundIm.instanceColor.needsUpdate = true;

    /* колышки растяжек */
    const pegG = boxUV(new THREE.BoxGeometry(0.024, 1, 0.024), 0.5, 0.2, 0.1);
    pegG.translate(0, 0.5, 0);
    const pegIm = new THREE.InstancedMesh(pegG, wood, pegs.length);
    pegs.forEach((p, i) => {
      _q.setFromAxisAngle(_p.set(Math.cos(p.yaw), 0, Math.sin(p.yaw)), p.lean * 0.4).multiply(_q2.setFromAxisAngle(UP, p.yaw));
      _m.compose(_p.set(p.x, p.y - 0.08, p.z), _q, _s.set(1, p.h + 0.08, 1));
      pegIm.setMatrixAt(i, _m);
    });
    pegIm.name = 'trip_pegs'; pegIm.castShadow = pegIm.receiveShadow = true;
    pegIm.computeBoundingSphere();
    g.add(pegIm);

    /* растяжки: стальная проволока Ø ≈1 мм, каждая — свой участок буфера */
    const wb = new LineBuf();
    for (const w of wires) {
      const L = Math.hypot(w.bx - w.ax, w.bz - w.az), n = Math.max(2, Math.ceil(L / 0.4));
      const pts = [];
      for (let k = 0; k <= n; k++) {
        const u = k / n, x = w.ax + (w.bx - w.ax) * u, z = w.az + (w.bz - w.az) * u;
        /* проволока натянута: почти прямая, но не ниже 3 см над грунтом */
        let y = w.ay + (w.by - w.ay) * u - 0.012 * 4 * u * (1 - u);
        y = Math.max(y, H(x, z) + 0.03);
        pts.push([x, y, z]);
      }
      const r = wb.add(pts, 0.0005);
      w.v0 = r[0]; w.v1 = r[1];
    }
    const wMesh = lineMesh(THREE, wb, lineMat(THREE, { color: new THREE.Color(0.20, 0.205, 0.18), roughness: 0.45, metalness: 0.7 }, 1.6), 'tripwires');
    const wGeo = wMesh.geometry;
    g.add(wMesh);

    /* --------------------------------------------- ограждение --- */
    const stakes = [];
    {
      let s = 0;
      const corners = [0, LX, LX + LZ, 2 * LX + LZ];
      while (s < PER - 0.5) {
        let ss = s;
        const p = at(ss, 0);
        if (road && onRoad(p[0], p[1], 2.9)) { s += 0.5; continue; }
        let q = p;
        for (let tr = 0; tr < 5 && treeAt(q[0], q[1], 0.12); tr++) { ss = s + (tr % 2 ? -1 : 1) * 0.45 * (tr + 1); q = at(ss, 0); }
        stakes.push({ s: ss, x: q[0], z: q[1], y: H(q[0], q[1]), nx: q[2], nz: q[3], lx: (rnd() - 0.5) * 0.07, lz: (rnd() - 0.5) * 0.07, h: 1.22 + rnd() * 0.16, r: rnd() * TAU });
        /* следующий кол: 4–5 м, углы — обязательно */
        let nx = s + 4.1 + rnd() * 0.9;
        for (const c of corners) if (c > s + 0.6 && c < nx + 0.6) nx = c;
        s = nx;
      }
    }
    const wg = new LineBuf();
    const strands = [0.48, 0.95];
    for (let k = 0; k < stakes.length; k++) {
      const a = stakes[k], b = stakes[(k + 1) % stakes.length];
      const gap = Math.hypot(b.x - a.x, b.z - a.z);
      if (gap > 6.5) continue;                 // разрыв у дороги
      for (const hh of strands) {
        const off = 0.045;
        const ax = a.x + a.lx * hh + a.nx * off, az = a.z + a.lz * hh + a.nz * off;
        const bx2 = b.x + b.lx * hh + b.nx * off, bz2 = b.z + b.lz * hh + b.nz * off;
        const L = Math.hypot(bx2 - ax, bz2 - az), m = Math.max(3, Math.ceil(L / 0.3)), sag = 0.03 + rnd() * 0.05;
        const atw = (u) => [ax + (bx2 - ax) * u, a.y + (b.y - a.y) * u + hh * (a.h / 1.3) - sag * 4 * u * (1 - u), az + (bz2 - az) * u];
        const pts = [];
        for (let s2 = 0; s2 <= m; s2++) pts.push(atw(s2 / m));
        if (hh > 0.9) { a.topW = atw; a.topL = L; }
        /* две свитые нити Ø 2,5 мм — общая толщина ~4 мм */
        wg.add(pts, 0.002);
        for (let s2 = 0.08; s2 < L; s2 += 0.13 + rnd() * 0.03) {
          const c = atw(s2 / L);
          for (let q = 0; q < 2; q++) {
            const ang = rnd() * TAU, dd = v3norm([Math.cos(ang) * 0.6, Math.sin(ang), (rnd() - 0.5) * 0.6]);
            wg.add([v3add(c, dd, -0.016), c, v3add(c, dd, 0.016)], [0.0011, 0.0007]);
          }
        }
      }
    }
    const fenceWire = lineMesh(THREE, wg, lineMat(THREE, { color: new THREE.Color(0.15, 0.10, 0.075), roughness: 0.8, metalness: 0.35 }, 3.2), 'minefield_wire');
    g.add(fenceWire);
    const sg = boxUV(new THREE.BoxGeometry(0.07, 1, 0.07), 0.8, 0.1, 0.3);
    sg.translate(0, 0.5, 0);
    const stakeIm = new THREE.InstancedMesh(sg, wood, stakes.length);
    stakes.forEach((p, i) => {
      _q.setFromUnitVectors(UP, _p.set(p.lx, 1, p.lz).normalize());
      _q2.setFromAxisAngle(UP, p.r); _q.multiply(_q2);
      _m.compose(_p.set(p.x, p.y - 0.25, p.z), _q, _s.set(1, p.h + 0.25, 1));
      stakeIm.setMatrixAt(i, _m);
      api.colliders.push({ type: 'cyl', x: p.x, z: p.z, r: 0.06, h: 1.3 });
    });
    stakeIm.name = 'minefield_stakes'; stakeIm.castShadow = stakeIm.receiveShadow = true;
    stakeIm.computeBoundingSphere();
    g.add(stakeIm);

    /* знаки: на верхней нити у кола, лицом внутрь участка */
    const signs = [];
    {
      let last = -99;
      const corners = [0, LX, LX + LZ, 2 * LX + LZ, PER];
      stakes.forEach((p, i) => {
        const nearCorner = corners.some((c) => Math.abs(p.s - c) > 2.5 && Math.abs(p.s - c) < 5.5);
        if (p.s - last >= 11 || (nearCorner && p.s - last > 4)) { signs.push(Object.assign({ k: i }, p)); last = p.s; }
      });
    }
    const VAR = 3, sGeo = new THREE.PlaneGeometry(0.40, 0.328);
    const fronts = [], backs = [];
    for (let v = 0; v < VAR; v++) {
      const ft = canvasTex(THREE, mineSignCanvas(331 + v * 17, false), true);
      const bt = canvasTex(THREE, mineSignCanvas(911 + v * 23, true), true);
      for (const t of [ft, bt]) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
      fronts.push(new THREE.MeshStandardMaterial({ map: ft, alphaTest: 0.5, roughness: 0.72, metalness: 0.12,
        normalMap: signM.normalMap, normalScale: new THREE.Vector2(0.5, 0.5) }));
      backs.push(new THREE.MeshStandardMaterial({ map: bt, alphaTest: 0.5, roughness: 0.8, metalness: 0.1,
        normalMap: signM.normalMap, normalScale: new THREE.Vector2(0.5, 0.5) }));
    }
    for (let v = 0; v < VAR; v++) {
      const list = signs.filter((_, i) => i % VAR === v);
      if (!list.length) continue;
      const fIm = new THREE.InstancedMesh(sGeo, fronts[v], list.length), bIm = new THREE.InstancedMesh(sGeo, backs[v], list.length);
      list.forEach((p, i) => {
        /* лицом внутрь: нормаль знака = −n */
        const yaw = Math.atan2(-p.nx, -p.nz) + (rnd() - 0.5) * 0.25;
        const roll = (rnd() - 0.5) * 0.16, pitch = -0.05 + (rnd() - 0.5) * 0.08;
        /* знак висит на верхней нити в пролёте, в 0,8–1,7 м от кола:
           иначе изнутри его загораживает сам кол */
        const own = stakes[p.k], prv = stakes[(p.k + stakes.length - 1) % stakes.length];
        const span = own.topW ? own : prv.topW ? prv : null;
        let x = p.x - p.nx * 0.008, y = p.y + 0.95 * (p.h / 1.3) - 0.17, z = p.z - p.nz * 0.008;
        if (span) {
          const d = 0.8 + rnd() * 0.9;
          const c = span.topW(span === own ? Math.min(0.45, d / span.topL) : Math.max(0.55, 1 - d / span.topL));
          x = c[0] - p.nx * 0.006; y = c[1] - 0.165 + (rnd() - 0.5) * 0.02; z = c[2] - p.nz * 0.006;
        }
        _q.setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
        _m.compose(_p.set(x - p.nx * 0.0, y, z), _q, _s.set(1, 1, 1));
        fIm.setMatrixAt(i, _m);
        _q2.setFromAxisAngle(UP, Math.PI); _q.multiply(_q2);
        _m.compose(_p.set(x + p.nx * 0.004, y, z + p.nz * 0.004), _q, _s.set(1, 1, 1));
        bIm.setMatrixAt(i, _m);
      });
      for (const im of [fIm, bIm]) { im.castShadow = im.receiveShadow = true; im.name = 'mine_signs'; im.computeBoundingSphere(); g.add(im); }
    }

    /* ----------------------------------- выезд: АКЛ и щит --- */
    if (road) {
      const px = -road.dz, pz = road.dx;
      const c0 = at(road.s - 3.6, 0.15), c1 = at(road.s + 3.6, 0.15);
      const cg = new LineBuf();
      const L = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]), ux = (c1[0] - c0[0]) / L, uz = (c1[1] - c0[1]) / L;
      const Rc = 0.42, pitch = 0.19, seg = 20, turns = Math.floor(L / pitch);
      const pts = [];
      for (let i = 0; i <= turns * seg; i++) {
        const a = i / seg * TAU, t = i / (turns * seg);
        const along = t * L + Math.sin(a + 0.4) * 0.05;
        const r = Rc * (1 + 0.07 * Math.sin(i * 0.031) + 0.04 * Math.sin(a * 2 + i * 0.013));
        const lat = Math.cos(a) * r, up = Math.sin(a) * r * 0.94;
        const x = c0[0] + ux * along - uz * lat, z = c0[1] + uz * along + ux * lat;
        const gy = H(x, z);
        const y = gy + Rc * 0.9 + up - 0.06 * Math.sin(Math.PI * t);
        pts.push([x, Math.max(gy + 0.012, y), z]);
      }
      cg.add(pts, 0.0013);
      /* лезвия «Егозы» */
      for (let i = 1; i < pts.length - 1; i += 2) {
        const a = pts[i], b = pts[i + 1], d = v3norm(v3sub(b, a));
        const side = v3norm(v3cross(d, [0, 1, 0]));
        for (const sgn of [-1, 1]) {
          const tip = v3add(v3add(a, side, sgn * 0.013), d, 0.008);
          cg.add([v3add(a, d, -0.006), tip], 0.0021);
        }
      }
      const coil = lineMesh(THREE, cg, lineMat(THREE, { color: new THREE.Color(0.62, 0.63, 0.60), roughness: 0.3, metalness: 0.92 }, 2.5), 'concertina');
      g.add(coil);
      /* пикеты по краям спирали */
      const pk = [];
      for (const c of [c0, c1]) pk.push(xf(THREE, boxUV(new THREE.BoxGeometry(0.035, 1.15, 0.035), 0.5, rnd(), rnd()), c[0], H(c[0], c[1]) + 0.45, c[1], 0, rnd(), 0));
      addMesh(THREE, g, mergeGeos(THREE, pk), rust, 'concertina_pickets');
      for (let t = 0; t <= 1.001; t += 0.25) {
        const x = c0[0] + (c1[0] - c0[0]) * t, z = c0[1] + (c1[1] - c0[1]) * t;
        api.colliders.push({ type: 'cyl', x, z, r: 0.5, h: 0.9 });
      }
      /* щит «СТОЙ! МИНЫ» на обочине, лицом внутрь участка */
      const sp = at(road.s + 3.9, -0.6);
      const grp = new THREE.Group(); grp.name = 'stop_mines_sign';
      const tex = canvasTex(THREE, stopMinesCanvas(), true);
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.1, normalMap: signM.normalMap, normalScale: new THREE.Vector2(0.7, 0.7) });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.012), [signM, signM, signM, signM, face, signM]);
      plate.position.set(0, 1.42, 0.045); plate.rotation.z = -0.03;
      plate.castShadow = plate.receiveShadow = true; plate.name = 'stop_mines_plate';
      grp.add(plate);
      const posts = [];
      for (const s2 of [-1, 1]) posts.push(xf(THREE, boxUV(new THREE.BoxGeometry(0.08, 2.0, 0.08), 0.8, rnd(), rnd()), s2 * 0.33, 0.8, 0, 0, 0, s2 * 0.02));
      addMesh(THREE, grp, mergeGeos(THREE, posts), wood, 'stop_mines_post');
      grp.position.set(sp[0], H(sp[0], sp[1]), sp[1]);
      /* к центру участка (на дорогу изнутри) */
      grp.rotation.y = Math.atan2(-sp[2], -sp[3]) - 0.35;
      g.add(grp);
      api.colliders.push({ type: 'cyl', x: sp[0], z: sp[1], r: 0.45, h: 2 });
    }

    scene.add(g);

    /* ------------------------------------------------ API для игры --- */
    const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const MF = {
      XF, ZF, depth: MINEFIELD.depth, PER, at, outside, mines, wires, road, group: g,
      near: nearMines,
      /* мина сработала: убрать её модели, оборвать растяжки */
      remove(m) {
        m.alive = false;
        for (const [im, i] of m.inst) { im.setMatrixAt(i, _zero); im.instanceMatrix.needsUpdate = true; }
        const P = wGeo.attributes.position.array, O = wGeo.attributes.aOther.array;
        for (const w of m.wires) {
          if (!w.alive) continue;
          w.alive = false;
          for (let v = w.v0; v < w.v1; v++) for (let c = 0; c < 3; c++) { P[v * 3 + c] = 0; O[v * 3 + c] = 0; }
        }
        wGeo.attributes.position.needsUpdate = true; wGeo.attributes.aOther.needsUpdate = true;
      },
      /* отрезок движения (x0,z0)→(x1,z1) задевает живую растяжку? */
      crossWire(x0, z0, x1, z1) {
        const minx = Math.min(x0, x1), maxx = Math.max(x0, x1), minz = Math.min(z0, z1), maxz = Math.max(z0, z1);
        for (const w of wires) {
          if (!w.alive) continue;
          if (Math.max(w.ax, w.bx) < minx || Math.min(w.ax, w.bx) > maxx || Math.max(w.az, w.bz) < minz || Math.min(w.az, w.bz) > maxz) continue;
          const d1x = x1 - x0, d1z = z1 - z0, d2x = w.bx - w.ax, d2z = w.bz - w.az;
          const den = d1x * d2z - d1z * d2x;
          if (Math.abs(den) < 1e-9) continue;
          const ex = w.ax - x0, ez = w.az - z0;
          const t = (ex * d2z - ez * d2x) / den, u = (ex * d1z - ez * d1x) / den;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { w, t, u, x: x0 + d1x * t, z: z0 + d1z * t };
        }
        return null;
      }
    };
    api.minefield = MF;
    return MF;
  }

  function buildRocks(THREE, scene, api, F, trees) {
    const mat = triplanarMat(THREE, 'rock', 1.5, [0.56, 0.56, 0.53]);
    const geos = [0, 1, 2].map((k) => rockGeometry(THREE, 300 + k * 41));
    const rnd = U.rng(8282), list = [[], [], []];
    const ok = (x, z, s) => F.laneD(x, z) > 1.0 + s && F.squadD(x, z) > 3 + s && F.trackD(x, z) > 2.0 + s &&
      F.craterD(x, z) > 0.95 && !trees.near(x, z, s * 0.9) && !inZones(api._noGrass, x, z) && !inZones(F.noTree, x, z);
    let n = 0;
    for (let t = 0; t < 3000 && n < 48; t++) {
      let x, z, s;
      if (rnd() < 0.35) {
        const c = F.CRATERS[Math.floor(rnd() * F.CRATERS.length)], a = rnd() * TAU, r = c.R * (1.05 + rnd() * 0.7);
        x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r; s = 0.12 + rnd() * 0.28;
      } else {
        const a = rnd() * TAU, d = 9 + Math.pow(rnd(), 0.8) * 45;
        x = Math.cos(a) * d; z = 2 + Math.sin(a) * d; s = 0.22 + Math.pow(rnd(), 2.2) * 1.0;
      }
      if (!ok(x, z, s)) continue;
      list[n % 3].push({ x, z, s, y: F.heightAt(x, z) - s * 0.22, yaw: rnd() * TAU, tx: (rnd() - 0.5) * 0.4, tz: (rnd() - 0.5) * 0.4, sy: 0.75 + rnd() * 0.45 });
      n++;
      api._noGrass.push({ x, z, r: s * 0.75 });
      if (s > 0.4 && Math.abs(x) < PLAY_X && Math.abs(z) < PLAY_Z) api.colliders.push({ type: 'cyl', x, z, r: s * 0.85, h: s * 0.7 });
    }
    const grp = new THREE.Group();
    grp.name = 'rocks';
    const d = new THREE.Object3D();
    list.forEach((L, v) => {
      if (!L.length) return;
      const im = new THREE.InstancedMesh(geos[v], mat, L.length);
      L.forEach((r, i) => {
        d.position.set(r.x, r.y, r.z); d.rotation.set(r.tx, r.yaw, r.tz);
        d.scale.set(r.s, r.s * r.sy, r.s); d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      });
      im.name = 'rocks';
      im.castShadow = im.receiveShadow = true;
      im.computeBoundingSphere();
      grp.add(im);
    });
    (api.props || scene).add(grp);
    api.rocks = grp;
  }

  /* ============================================================= ЗАБОР == */
  function buildFence(THREE, scene, api) {
    const g = new THREE.Group();
    g.name = 'fence';
    /* Ограждение полигона: серый выветренный брус вместо жёлтого штакетника.
       Базовый тон почти нейтральный, поэтому забор перестаёт быть самым
       ярким пятном на горизонте и читается как граница площадки. */
    const mat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(T.woodAlbedo(66, 256, [76, 76, 74])), roughness: 0.95
    });
    mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
    if ('colorSpace' in mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
    const postMat = new THREE.MeshStandardMaterial({ color: 0x55565a, roughness: 0.96 });

    const HX = FIELD.x / 2 - 3, HZ = FIELD.z / 2 - 3;
    const rnd = U.rng(707);
    const seg = 0.22;
    const sides = [
      { a: [-HX, HZ], b: [HX, HZ] }, { a: [HX, HZ], b: [HX, -HZ] },
      { a: [HX, -HZ], b: [-HX, -HZ] }, { a: [-HX, -HZ], b: [-HX, HZ] }
    ];
    for (const s of sides) {
      const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      const n = Math.floor(len / seg);
      const dx = (s.b[0] - s.a[0]) / n, dz = (s.b[1] - s.a[1]) / n;
      const ang = Math.atan2(dz, dx);
      for (let i = 0; i < n; i++) {
        const x = s.a[0] + dx * (i + 0.5), z = s.a[1] + dz * (i + 0.5);
        const h = 1.22 + rnd() * 0.10;
        const pl = new THREE.Mesh(new THREE.BoxGeometry(seg * 0.82, h, 0.035), mat);
        pl.position.set(x, h / 2, z);
        pl.rotation.y = -ang + (rnd() - 0.5) * 0.03;
        pl.castShadow = pl.receiveShadow = true;
        g.add(pl);
      }
      /* столбы и прожилины */
      for (let i = 0; i <= n; i += 12) {
        const x = s.a[0] + dx * i, z = s.a[1] + dz * i;
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.10, 1.55, 0.10), postMat);
        p.position.set(x, 0.78, z);
        p.castShadow = true;
        g.add(p);
      }
      api.colliders.push({
        type: 'box',
        x0: Math.min(s.a[0], s.b[0]) - 0.15, x1: Math.max(s.a[0], s.b[0]) + 0.15,
        z0: Math.min(s.a[1], s.b[1]) - 0.15, z1: Math.max(s.a[1], s.b[1]) + 0.15, h: 1.4
      });
    }
    scene.add(g);
    api.fence = g;
  }

  /* ======================================================== ОКРУЖЕНИЕ === */
  /* Деревья по периметру, кусты, поленница — дают глубину и ориентиры. */
  function buildProps(THREE, scene, api) {
    const g = new THREE.Group();
    g.name = 'props';
    const rnd = U.rng(9182);

    const barkMat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(T.woodAlbedo(44, 256, [86, 72, 56])), roughness: 0.96
    });
    barkMat.map.wrapS = barkMat.map.wrapT = THREE.RepeatWrapping;
    barkMat.map.repeat.set(2, 3);
    if ('colorSpace' in barkMat.map) barkMat.map.colorSpace = THREE.SRGBColorSpace;

    /* крона: облако сплюснутых сфер с разными оттенками */
    const leafMats = [0x3c5424, 0x47612a, 0x33491f].map((c) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0, flatShading: true }));

    const TREE_N = 26;
    for (let i = 0; i < TREE_N; i++) {
      const a = (i / TREE_N) * TAU + rnd() * 0.2;
      const rad = FIELD.x * 0.46 + rnd() * 4;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad * (FIELD.z / FIELD.x);
      if (Math.abs(x) > FIELD.x / 2 + 6 || Math.abs(z) > FIELD.z / 2 + 6) continue;
      const h = 5.2 + rnd() * 3.6;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 + rnd() * 0.07, 0.28 + rnd() * 0.1, h, 9), barkMat);
      trunk.position.set(x, h / 2, z);
      trunk.castShadow = trunk.receiveShadow = true;
      g.add(trunk);
      const blobs = 5 + Math.floor(rnd() * 3);
      for (let b = 0; b < blobs; b++) {
        const r = 1.35 + rnd() * 1.0;
        const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMats[b % 3]);
        cr.position.set(
          x + (rnd() - 0.5) * 2.1,
          h * 0.78 + (rnd() - 0.2) * 1.7,
          z + (rnd() - 0.5) * 2.1);
        cr.scale.y = 0.78;
        cr.castShadow = true;
        cr.receiveShadow = true;
        g.add(cr);
      }
      api.colliders.push({ type: 'cyl', x, z, r: 0.42, h: 3 });
    }

    /* кусты */
    for (let i = 0; i < 34; i++) {
      const x = (rnd() - 0.5) * (FIELD.x - 8), z = (rnd() - 0.5) * (FIELD.z - 8);
      if (Math.abs(x - FIELD.x * 0.1) < 9 && z > -26 && z < 12) continue;   // не мешать стрельбищу
      const r = 0.45 + rnd() * 0.5;
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMats[i % 3]);
      bush.position.set(x, r * 0.72, z);
      bush.scale.set(1, 0.72, 1);
      bush.castShadow = bush.receiveShadow = true;
      g.add(bush);
      api._noGrass.push({ x, z, r: r * 1.1 });
    }

    /* поленница у дома */
    const logMat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(T.woodAlbedo(21, 128, [122, 98, 68])), roughness: 0.94
    });
    if ('colorSpace' in logMat.map) logMat.map.colorSpace = THREE.SRGBColorSpace;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 9; c++) {
        const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.62, 7), logMat);
        lg.rotation.z = Math.PI / 2;
        lg.position.set(-8.6 + (r % 2) * 0.03, 0.09 + r * 0.155, -18.4 + c * 0.17);
        lg.castShadow = lg.receiveShadow = true;
        g.add(lg);
      }
    }
    api.colliders.push({ type: 'box', x0: -9.0, x1: -8.2, z0: -18.6, z1: -16.8, h: 0.9 });
    api._noGrass.push({ x0: -9.2, x1: -8.0, z0: -18.8, z1: -16.6 });

    scene.add(g);
    api.props = g;
  }

  return { build, _layout: forestLayout, FIELD, inZones, buildHouse, buildGarden, soilCanvas, plantCrop, triplanarMat,
    buildRange, buildFence, buildProps, makeTarget, makeSign, FIRE_LINE, RANGES,
    /* v26: для стенда tools/v26-stands/spruce.html */
    _spruce: { geometry: spruceGeometry, material: saplingMaterial, materials: forestMaterials, texture: spruceSprayTexture } };
});