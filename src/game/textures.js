/* ============================================================================
   Процедурные текстуры экипировки.

   Всё рисуется на <canvas> в момент загрузки: камуфляжи, нейлон строп,
   кожа, кевлар шлема, резина и металл. Внешних файлов нет, поэтому страница
   остаётся одним html и работает офлайн.

   Каждый камуфляж — это слоёная заливка пятнами по фрактальному шуму:
   сначала базовый тон, затем 3–4 слоя пятен с разной частотой, затем
   мелкий «дитер» (для цифровых рисунков — квадратная сетка), и в конце
   общий слой износа: пыль в швах и вытертость на выступающих местах.
   ========================================================================== */
(function (root, factory) {
  const T = factory(root.GUtil || (typeof require !== 'undefined' ? require('./util.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
  else root.GTex = T;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  const TAU = Math.PI * 2;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h || w;
    return c;
  }

  /* Контекст для процедурной генерации: почти все текстуры читают пиксели
     обратно через getImageData, поэтому просим у браузера «читаемый» буфер —
     иначе Chrome держит его в GPU и каждый readback стоит стола. */
  const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });

  const hex = (r, g, b) => 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';

  /* Пятно камуфляжа: замкнутый контур со «рваными» краями.
     Радиус модулируется двумя гармониками, поэтому форма получается
     органичной, а не звёздочкой. */
  function blob(g, x, y, r, r2, rnd, wobble) {
    const steps = 26;
    const w = wobble === undefined ? 0.34 : wobble;
    const p1 = rnd() * TAU, p2 = rnd() * TAU, p3 = rnd() * TAU;
    const k1 = 2 + Math.floor(rnd() * 2), k2 = 4 + Math.floor(rnd() * 3), k3 = 7 + Math.floor(rnd() * 4);
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * TAU;
      const m = 1 + w * (0.55 * Math.sin(a * k1 + p1) + 0.3 * Math.sin(a * k2 + p2) + 0.16 * Math.sin(a * k3 + p3));
      const px = x + Math.cos(a) * r * m;
      const py = y + Math.sin(a) * (r2 === undefined ? r : r2) * m;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  }

  /* Пиксельное пятно: заливка клетками сетки внутри эллипса. */
  function pixelBlob(g, x, y, r, cell, rnd, density) {
    const d = density === undefined ? 0.82 : density;
    const n = Math.ceil(r / cell);
    for (let iy = -n; iy <= n; iy++) {
      for (let ix = -n; ix <= n; ix++) {
        const dx = ix / n, dy = iy / n;
        const q = dx * dx + dy * dy;
        if (q > 1) continue;
        if (rnd() > d * (1 - q * 0.55)) continue;
        g.fillRect(Math.round(x + ix * cell), Math.round(y + iy * cell), cell, cell);
      }
    }
  }

  /* Тайлящийся слой: рисуем 9 раз со сдвигом, лишнее обрезается канвой.
     Даёт бесшовный повтор по обеим осям. */
  function tiled(g, w, h, draw) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        g.save();
        g.translate(ox * w, oy * h);
        draw(g);
        g.restore();
      }
    }
  }

  /* --------------------------------------------------------------- износ */
  /* Общий слой поверх любого камуфляжа: неравномерная выцветаемость,
     пыль снизу и тёмные затёки в складках. Без него ткань выглядит
     «нарисованной в фотошопе». */
  function wear(g, w, h, seed, amount) {
    const f = U.fbm(seed, 5, 0.55, 2.1);
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    const A = amount === undefined ? 1 : amount;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const n = f(x / w * 4.5, y / h * 4.5);
        const n2 = f(x / w * 17 + 40, y / h * 17 + 11);
        /* выцветание: светлее и менее насыщенно */
        const fade = (n - 0.5) * 0.20 * A;
        /* пыль: слегка бежевая вуаль, сильнее к низу текстуры */
        const dust = Math.max(0, n2 - 0.52) * 0.5 * A * (0.35 + 0.65 * (y / h));
        const gr = (d[i] + d[i + 1] + d[i + 2]) / 3;
        for (let k = 0; k < 3; k++) {
          let v = d[i + k];
          v = v + (gr - v) * Math.max(0, fade) * 1.4;      // обесцвечивание
          v *= 1 + fade;
          v = v * (1 - dust) + [176, 166, 143][k] * dust;  // пыль
          d[i + k] = U.clamp(v, 0, 255);
        }
      }
    }
    g.putImageData(img, 0, 0);
  }

  /* Мелкое переплетение ткани — в карту нормалей и лёгкая модуляция альбедо. */
  function weave(g, w, h, scale, strength) {
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    const s = scale || 220;
    const A = strength === undefined ? 0.06 : strength;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const t = (Math.sin(x / w * s * TAU) * 0.5 + Math.sin(y / h * s * TAU) * 0.5);
        const k = 1 + t * A;
        d[i] = U.clamp(d[i] * k, 0, 255);
        d[i + 1] = U.clamp(d[i + 1] * k, 0, 255);
        d[i + 2] = U.clamp(d[i + 2] * k, 0, 255);
      }
    }
    g.putImageData(img, 0, 0);
  }

  /* ======================================================== КАМУФЛЯЖИ ==== */

  /* Палитры сняты с референса:
     delta_green — «мультикам»-подобный лес: олива, хаки, тёмно-зелёный, бурый;
     delta_grey  — серо-зелёный ATACS-подобный: светлая основа, серые ветки;
     alpha_black — чёрный: угольная основа, графитовые разводы, почти без
                   контраста, работают только блики ткани;
     alpha_cadpat— чёрно-зелёный цифровой: чёрная основа, три зелёных тона. */
  const PALETTES = {
    delta_green: {
      base: [92, 96, 62],
      layers: [
        { col: [120, 118, 78], r: [46, 96], n: 16, wob: 0.38 },
        { col: [64, 74, 46], r: [34, 78], n: 18, wob: 0.42 },
        { col: [84, 66, 44], r: [20, 52], n: 20, wob: 0.46 },
        { col: [38, 45, 30], r: [10, 26], n: 34, wob: 0.5 }
      ],
      speck: [[46, 52, 34, 0.30], [128, 126, 88, 0.22]]
    },
    delta_grey: {
      base: [120, 124, 108],
      layers: [
        { col: [146, 148, 130], r: [50, 104], n: 14, wob: 0.34 },
        { col: [96, 104, 88], r: [30, 70], n: 20, wob: 0.44 },
        { col: [74, 82, 68], r: [16, 42], n: 26, wob: 0.5 },
        { col: [52, 58, 48], r: [8, 22], n: 34, wob: 0.54 }
      ],
      speck: [[70, 76, 62, 0.26], [158, 158, 140, 0.2]]
    },
    alpha_black: {
      base: [26, 27, 30],
      layers: [
        { col: [34, 35, 39], r: [48, 100], n: 12, wob: 0.36 },
        { col: [19, 20, 23], r: [28, 66], n: 16, wob: 0.44 },
        { col: [41, 42, 47], r: [14, 34], n: 18, wob: 0.48 }
      ],
      speck: [[15, 16, 18, 0.3], [48, 49, 54, 0.18]]
    },
    alpha_cadpat: {
      base: [24, 26, 24],
      pixel: 7,
      layers: [
        { col: [46, 58, 42], r: [40, 84], n: 15 },
        { col: [33, 44, 32], r: [26, 58], n: 18 },
        { col: [62, 76, 54], r: [14, 34], n: 20 },
        { col: [17, 19, 17], r: [10, 26], n: 22 }
      ],
      speck: [[40, 50, 38, 0.24], [14, 16, 14, 0.24]]
    }
  };

  /* Камуфляжная карта альбедо. size — сторона тайла в пикселях. */
  function camoAlbedo(kind, seed, size) {
    const P = PALETTES[kind] || PALETTES.delta_green;
    const S = size || 512;
    const c = canvas(S), g = ctx2d(c);
    const rnd = U.rng(seed);

    g.fillStyle = hex(P.base[0], P.base[1], P.base[2]);
    g.fillRect(0, 0, S, S);

    const sc = S / 512;
    for (const L of P.layers) {
      g.fillStyle = hex(L.col[0], L.col[1], L.col[2]);
      const n = Math.round(L.n * (S / 512) * (S / 512) + L.n * 0.2);
      for (let i = 0; i < n; i++) {
        const x = rnd() * S, y = rnd() * S;
        const r = U.lerp(L.r[0], L.r[1], rnd()) * sc;
        tiled(g, S, S, (gg) => {
          if (P.pixel) pixelBlob(gg, x, y, r, Math.max(2, Math.round(P.pixel * sc)), U.rng(seed + i * 31 + r), 0.86);
          else blob(gg, x, y, r, r * U.lerp(0.55, 1.15, rnd()), U.rng(seed + i * 17), L.wob);
        });
      }
    }

    /* мелкая крапина — разбивает «плакатность» больших пятен */
    for (const sp of P.speck) {
      g.fillStyle = 'rgba(' + sp[0] + ',' + sp[1] + ',' + sp[2] + ',' + sp[3] + ')';
      const cnt = Math.round(2600 * sc * sc);
      const cell = P.pixel ? Math.max(2, Math.round(P.pixel * sc)) : 0;
      for (let i = 0; i < cnt; i++) {
        const x = rnd() * S, y = rnd() * S;
        if (cell) g.fillRect(Math.round(x / cell) * cell, Math.round(y / cell) * cell, cell, cell);
        else { g.beginPath(); g.arc(x, y, U.lerp(0.7, 2.6, rnd()) * sc, 0, TAU); g.fill(); }
      }
    }

    weave(g, S, S, 150, 0.05);
    wear(g, S, S, seed + 991, kind === 'alpha_black' ? 0.55 : 1);
    return c;
  }

  /* Карта нормалей ткани: переплетение + крупные складки по шуму.
     Нормаль считается из высотного поля центральными разностями. */
  function fabricNormal(seed, size, weaveScale, foldAmp) {
    const S = size || 256;
    const c = canvas(S), g = ctx2d(c);
    const f = U.fbm(seed, 4, 0.5, 2.2);
    const ws = weaveScale || 46;
    const fa = foldAmp === undefined ? 1 : foldAmp;
    const H = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        /* полотняное переплетение: две ортогональные синусоиды в противофазе */
        const wv = Math.sin(u * ws * TAU) * Math.cos(v * ws * TAU);
        const fold = (f(u * 3.1, v * 3.1) - 0.5) * 2 * fa;
        H[y * S + x] = wv * 0.30 + fold * 0.85;
      }
    }
    const img = g.createImageData(S, S);
    const d = img.data;
    const at = (x, y) => H[((y + S) % S) * S + ((x + S) % S)];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * 2.1;
        const dy = (at(x, y + 1) - at(x, y - 1)) * 2.1;
        let nx = -dx, ny = -dy, nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l; ny /= l; nz /= l;
        const i = (y * S + x) * 4;
        d[i] = (nx * 0.5 + 0.5) * 255;
        d[i + 1] = (ny * 0.5 + 0.5) * 255;
        d[i + 2] = (nz * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* Карта шероховатости: ткань матовая, но на сгибах и вытертостях лоснится. */
  function roughnessMap(seed, size, lo, hi) {
    const S = size || 256;
    const c = canvas(S), g = ctx2d(c);
    const f = U.fbm(seed, 4, 0.55, 2.3);
    const img = g.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const n = f(x / S * 5.5, y / S * 5.5) * 0.7 + f(x / S * 19, y / S * 19) * 0.3;
        const v = U.lerp(lo === undefined ? 0.66 : lo, hi === undefined ? 0.98 : hi, n) * 255;
        const i = (y * S + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* --------------------------------------------------------------- нейлон */
  /* Ткань подсумков и строп: плотный рубчик, крупнее чем у формы. */
  function nylonAlbedo(col, seed, size) {
    const S = size || 256;
    const c = canvas(S), g = ctx2d(c);
    const rnd = U.rng(seed);
    g.fillStyle = hex(col[0], col[1], col[2]);
    g.fillRect(0, 0, S, S);
    /* продольный рубчик кордуры */
    for (let x = 0; x < S; x += 3) {
      const k = 1 + (rnd() - 0.5) * 0.14;
      g.fillStyle = 'rgba(' + Math.round(col[0] * k) + ',' + Math.round(col[1] * k) + ',' + Math.round(col[2] * k) + ',0.5)';
      g.fillRect(x, 0, 2, S);
    }
    for (let y = 0; y < S; y += 3) {
      const k = 1 + (rnd() - 0.5) * 0.1;
      g.fillStyle = 'rgba(' + Math.round(col[0] * k) + ',' + Math.round(col[1] * k) + ',' + Math.round(col[2] * k) + ',0.35)';
      g.fillRect(0, y, S, 2);
    }
    wear(g, S, S, seed + 7, 0.7);
    return c;
  }

  /* ----------------------------------------------------------------- кожа */
  /* Лицо и кисти: базовый тон + подкожная неравномерность + поры.
     Тон слегка различается у бойцов (seed), чтобы отряд не был клоном. */
  function skinAlbedo(seed, tone, size) {
    const S = size || 256;
    const c = canvas(S), g = ctx2d(c);
    const rnd = U.rng(seed);
    const base = tone || [196, 154, 128];
    g.fillStyle = hex(base[0], base[1], base[2]);
    g.fillRect(0, 0, S, S);

    /* крупная неравномерность: румянец, тень щетины на нижней части */
    const f = U.fbm(seed + 3, 4, 0.55, 2.2);
    const img = g.getImageData(0, 0, S, S), d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const n = f(x / S * 3.2, y / S * 3.2) - 0.5;
        const p = f(x / S * 40 + 9, y / S * 40 + 3) - 0.5;       // поры
        d[i] = U.clamp(d[i] * (1 + n * 0.16 + p * 0.06) + n * 16, 0, 255);
        d[i + 1] = U.clamp(d[i + 1] * (1 + n * 0.10 + p * 0.06), 0, 255);
        d[i + 2] = U.clamp(d[i + 2] * (1 + n * 0.07 + p * 0.06), 0, 255);
      }
    }
    g.putImageData(img, 0, 0);

    /* редкие веснушки/точки — помогают глазу поверить в кожу вблизи */
    for (let i = 0; i < 260; i++) {
      const a = 0.04 + rnd() * 0.07;
      g.fillStyle = 'rgba(' + Math.round(base[0] * 0.62) + ',' + Math.round(base[1] * 0.55) + ',' + Math.round(base[2] * 0.5) + ',' + a + ')';
      g.beginPath();
      g.arc(rnd() * S, rnd() * S, 0.6 + rnd() * 1.6, 0, TAU);
      g.fill();
    }
    return c;
  }

  /* --------------------------------------------------- шлем / каска / кевлар */
  function helmetAlbedo(kind, seed, size) {
    const S = size || 256;
    const c = canvas(S), g = ctx2d(c);
    /* Шлем красят тем же рисунком, что и форму, но «прижатым»: на каске
       пятна мельче, а поверх лежит матовый лак с сколами. */
    const src = camoAlbedo(kind, seed + 555, S);
    g.drawImage(src, 0, 0, S, S);
    const rnd = U.rng(seed + 88);
    /* сколы краски до чёрного композита */
    for (let i = 0; i < 90; i++) {
      g.fillStyle = 'rgba(28,28,30,' + (0.18 + rnd() * 0.4) + ')';
      blob(g, rnd() * S, rnd() * S, 1.2 + rnd() * 4.5, undefined, U.rng(seed + i), 0.6);
    }
    /* фактура кевларового плетения */
    const img = g.getImageData(0, 0, S, S), d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const w = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 1.035 : 0.965;
        d[i] = U.clamp(d[i] * w, 0, 255);
        d[i + 1] = U.clamp(d[i + 1] * w, 0, 255);
        d[i + 2] = U.clamp(d[i + 2] * w, 0, 255);
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* ------------------------------------------------------------ мишени */
  /* Стандартная поясная мишень: белое поле, чёрные концентрические зоны. */
  function targetFace(size) {
    const S = size || 512;
    const c = canvas(S), g = ctx2d(c);
    g.fillStyle = '#d9d6cc'; g.fillRect(0, 0, S, S);
    const cx = S * 0.5, cy = S * 0.46;
    const rings = [0.40, 0.335, 0.27, 0.205, 0.14, 0.075];
    g.strokeStyle = '#1b1c1e';
    for (let i = 0; i < rings.length; i++) {
      g.lineWidth = S * 0.006;
      g.beginPath(); g.arc(cx, cy, S * rings[i], 0, TAU); g.stroke();
    }
    g.fillStyle = '#1b1c1e';
    g.beginPath(); g.arc(cx, cy, S * 0.075, 0, TAU); g.fill();
    /* номера зон */
    g.fillStyle = '#1b1c1e';
    g.font = '600 ' + Math.round(S * 0.045) + 'px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < rings.length - 1; i++) {
      const r = S * (rings[i] + rings[i + 1]) * 0.5;
      g.fillText(String(i + 5), cx, cy - r);
    }
    /* пятна непогоды по краю картона */
    const rnd = U.rng(4242);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = 'rgba(120,110,92,' + (0.04 + rnd() * 0.09) + ')';
      blob(g, rnd() * S, rnd() * S, 4 + rnd() * 26, undefined, U.rng(i + 5), 0.5);
    }
    return c;
  }

  /* ------------------------------------------------------------- дерево */
  function woodAlbedo(seed, size, col) {
    const S = size || 256;
    const c = canvas(S), g = ctx2d(c);
    const base = col || [126, 96, 62];
    const f = U.fbm(seed, 4, 0.5, 2.3);
    const img = g.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        /* годовые кольца вдоль доски + продольные волокна */
        const warp = f(u * 2.2, v * 2.2) * 0.6;
        const rings = Math.sin((v * 13 + warp * 4) * Math.PI) * 0.5 + 0.5;
        const grain = f(u * 60, v * 4) * 0.5 + 0.5;
        const k = 0.72 + rings * 0.22 + grain * 0.2;
        const i = (y * S + x) * 4;
        d[i] = U.clamp(base[0] * k, 0, 255);
        d[i + 1] = U.clamp(base[1] * k, 0, 255);
        d[i + 2] = U.clamp(base[2] * k, 0, 255);
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* ------------------------------------------------------- грунт / трава */
  /* Карта газона: мозаика оттенков зелени + проплешины земли.
     Используется как альбедо земли под травяными билбордами. */
  function groundAlbedo(seed, size) {
    const S = size || 512;
    const c = canvas(S), g = ctx2d(c);
    const f1 = U.fbm(seed, 5, 0.55, 2.2);
    const f2 = U.fbm(seed + 17, 3, 0.5, 2.6);
    const img = g.createImageData(S, S), d = img.data;
    const GREEN_D = [46, 62, 30], GREEN_L = [104, 124, 58], SOIL = [96, 80, 58];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const n = f1(u * 6, v * 6);
        const fine = f2(u * 48, v * 48);
        const bare = U.clamp01((f1(u * 2.4 + 30, v * 2.4 + 12) - 0.62) * 4.2);
        const t = U.clamp01(n * 0.72 + fine * 0.28);
        const i = (y * S + x) * 4;
        for (let k = 0; k < 3; k++) {
          const grass = U.lerp(GREEN_D[k], GREEN_L[k], t);
          d[i + k] = U.clamp(U.lerp(grass, SOIL[k] * (0.8 + fine * 0.4), bare), 0, 255);
        }
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* Спрайт пучка травы: несколько изогнутых травинок с прозрачным фоном. */
  function grassBlade(seed, size) {
    const S = size || 128;
    const c = canvas(S, S), g = ctx2d(c);
    const rnd = U.rng(seed);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const x0 = S * (0.12 + rnd() * 0.76);
      const h = S * (0.5 + rnd() * 0.48);
      const bend = (rnd() - 0.5) * S * 0.42;
      const w = S * (0.026 + rnd() * 0.026);
      const dark = 0.55 + rnd() * 0.5;
      const grd = g.createLinearGradient(x0, S, x0 + bend, S - h);
      grd.addColorStop(0, 'rgba(' + Math.round(38 * dark) + ',' + Math.round(52 * dark) + ',' + Math.round(22 * dark) + ',1)');
      grd.addColorStop(0.55, 'rgba(' + Math.round(84 * dark) + ',' + Math.round(112 * dark) + ',' + Math.round(42 * dark) + ',1)');
      grd.addColorStop(1, 'rgba(' + Math.round(132 * dark) + ',' + Math.round(158 * dark) + ',' + Math.round(70 * dark) + ',0.92)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(x0 - w, S);
      g.quadraticCurveTo(x0 - w * 0.6 + bend * 0.5, S - h * 0.55, x0 + bend, S - h);
      g.quadraticCurveTo(x0 + w * 0.6 + bend * 0.5, S - h * 0.55, x0 + w, S);
      g.closePath();
      g.fill();
    }
    return c;
  }

  return {
    canvas, ctx2d, camoAlbedo, fabricNormal, roughnessMap, nylonAlbedo, skinAlbedo,
    helmetAlbedo, targetFace, woodAlbedo, groundAlbedo, grassBlade,
    blob, wear, PALETTES
  };
});