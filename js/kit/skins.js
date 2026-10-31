/* AEGIS v25 · окраски оружия.
   Все рисунки — свои, процедурные (canvas, без внешних файлов): у каждого
   образца заводская окраска и ещё 3–4 варианта — однотонные покрытия
   (песок, олива, чёрный) и камуфляжи (лес, «цифра», тигр, зима, пустыня,
   мультикам). Окраска хранится в конфигурации оружейной (cfg.skin) и
   применяется к сборке и в оружейной (wkit), и в игре (05b_guns.build).
   Красятся корпус и «мебель» (приклад, цевьё, рукоятка, крышка, ствол);
   прицелы, магазины, фонари, ДТК и резина остаются как были.
   Рисунок ложится трипланарно в системе детали (мм) — без развёртки; тот же
   рисунок по той же раскладке видит дальний заменитель (29c_lod: lodCamo).
   Потёртости кромок (wear-шейдер оружейной) открывают металл/полимер. */
(function (root) {
  'use strict';
  const THREE = root.THREE;
  if (!THREE) return;

  /* ------------------------------------------------------ рисунки --- */
  const N = 512;
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  /* неровное пятно; рисуется 9 раз со сдвигом на период — рисунок бесшовный */
  function blob(g, R, x, y, r, sq, rough) {
    const k = 3 + ((R() * 3) | 0), ph = [], am = [];
    for (let i = 0; i < k; i++) { ph.push(R() * 6.283); am.push((rough || 0.32) * (0.4 + R() * 0.6) / (i + 1)); }
    const rot = R() * 6.283, pts = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * 6.283;
      let f = 1;
      for (let j = 0; j < k; j++) f += am[j] * Math.sin(a * (j + 2) + ph[j]);
      const rx = r * f, ry = r * f * (sq || 1);
      pts.push([Math.cos(a) * rx, Math.sin(a) * ry]);
    }
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let ox = -N; ox <= N; ox += N) for (let oy = -N; oy <= N; oy += N) {
      if (x + ox < -r * 2 || x + ox > N + r * 2 || y + oy < -r * 2 || y + oy > N + r * 2) continue;
      g.beginPath();
      pts.forEach((p, i) => { const px = x + ox + p[0] * c - p[1] * s, py = y + oy + p[0] * s + p[1] * c; if (i) g.lineTo(px, py); else g.moveTo(px, py); });
      g.closePath(); g.fill();
    }
  }
  /* мелкая «краска»: зерно и лёгкая неравномерность слоя */
  function grain(g, R, k) {
    const d = g.getImageData(0, 0, N, N), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const n = (R() - 0.5) * k;
      a[i] = Math.max(0, Math.min(255, a[i] * (1 + n))); a[i + 1] = Math.max(0, Math.min(255, a[i + 1] * (1 + n))); a[i + 2] = Math.max(0, Math.min(255, a[i + 2] * (1 + n)));
    }
    g.putImageData(d, 0, 0);
  }
  /* периодический value-noise (для «цифры» и тигра) */
  function pnoise(R, cells) {
    const v = new Float32Array(cells * cells);
    for (let i = 0; i < v.length; i++) v[i] = R();
    return (x, y) => {
      const fx = (x / N) * cells, fy = (y / N) * cells, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const at = (i, j) => v[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
    };
  }
  /* лист: заострённый эллипс (для «Партизана»), бесшовно */
  function leaf(g, x, y, L, rot, wk) {
    const c = Math.cos(rot), s = Math.sin(rot), W = L * wk;
    for (let ox = -N; ox <= N; ox += N) for (let oy = -N; oy <= N; oy += N) {
      const px = x + ox, py = y + oy;
      if (px < -L || px > N + L || py < -L || py > N + L) continue;
      const P = (u, v) => [px + u * c - v * s, py + u * s + v * c];
      const a = P(-L, 0), b = P(L, 0), c1 = P(0, -W * 1.4), c2 = P(0, W * 1.4);
      g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(c1[0], c1[1], b[0], b[1]); g.quadraticCurveTo(c2[0], c2[1], a[0], a[1]); g.closePath(); g.fill();
    }
  }
  /* осколок: острый 3–5-угольник (для «Города»), бесшовно */
  function shard(g, R, x, y, r) {
    const k = 3 + ((R() * 3) | 0), pts = [], a0 = R() * 6.283;
    for (let i = 0; i < k; i++) { const a = a0 + (i / k) * 6.283 + (R() - 0.5) * 0.9, rr = r * (0.45 + R() * 0.75); pts.push([Math.cos(a) * rr, Math.sin(a) * rr * (0.5 + R() * 0.5)]); }
    for (let ox = -N; ox <= N; ox += N) for (let oy = -N; oy <= N; oy += N) {
      if (x + ox < -r * 2 || x + ox > N + r * 2 || y + oy < -r * 2 || y + oy > N + r * 2) continue;
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(x + ox + p[0], y + oy + p[1]) : g.moveTo(x + ox + p[0], y + oy + p[1]))); g.closePath(); g.fill();
    }
  }
  const PAT = {
    /* лес (woodland): зелень, коричневый, чёрные «ветви», светлый хаки */
    woodland(g, R) {
      g.fillStyle = hex(0x5d6b45); g.fillRect(0, 0, N, N);
      g.fillStyle = hex(0x857d58); for (let i = 0; i < 9; i++) blob(g, R, R() * N, R() * N, 34 + R() * 30, 0.55 + R() * 0.3);
      g.fillStyle = hex(0x5b4532); for (let i = 0; i < 12; i++) blob(g, R, R() * N, R() * N, 38 + R() * 34, 0.5 + R() * 0.35);
      g.fillStyle = hex(0x1f211b); for (let i = 0; i < 16; i++) blob(g, R, R() * N, R() * N, 14 + R() * 18, 0.35 + R() * 0.3, 0.45);
      grain(g, R, 0.08);
    },
    /* «цифра»: пиксельный рисунок в 4 цвета */
    digital(g, R) {
      const n1 = pnoise(R, 6), n2 = pnoise(R, 13), n3 = pnoise(R, 24), C = 8;
      const col = [0x8b8763, 0x6d7552, 0x4a5838, 0x2c3226];
      for (let y = 0; y < N; y += C) for (let x = 0; x < N; x += C) {
        const v = n1(x, y) * 0.55 + n2(x, y) * 0.3 + n3(x, y) * 0.15 + (R() - 0.5) * 0.08;
        const i = v < 0.36 ? 0 : v < 0.5 ? 1 : v < 0.64 ? 2 : 3;
        g.fillStyle = hex(col[i]); g.fillRect(x, y, C, C);
      }
      grain(g, R, 0.06);
    },
    /* тигр: рваные горизонтальные полосы */
    tiger(g, R) {
      g.fillStyle = hex(0x7d7a55); g.fillRect(0, 0, N, N);
      const nz = pnoise(R, 9);
      for (const [c, cnt, th] of [[0x46502f, 9, 22], [0x1d1f19, 11, 11]]) {
        g.fillStyle = hex(c);
        for (let s = 0; s < cnt; s++) {
          const y0 = R() * N, len = N * (0.35 + R() * 0.5), x0 = R() * N, amp = 10 + R() * 18, w = th * (0.6 + R() * 0.8);
          const top = [], bot = [];
          for (let t = 0; t <= 1.0001; t += 1 / 24) {
            const x = x0 + t * len, taper = Math.sin(Math.PI * t) ** 0.6;
            const yc = y0 + (nz(x, y0) - 0.5) * amp * 2 + Math.sin(t * 9 + s) * 4;
            const hw = w * taper * (0.6 + nz(x * 3, y0 + 50) * 0.8);
            top.push([x, yc - hw]); bot.push([x, yc + hw * 0.7]);
          }
          for (let ox = -N; ox <= N; ox += N) for (let oy = -N; oy <= N; oy += N) {
            g.beginPath();
            top.forEach((p, i) => (i ? g.lineTo(p[0] + ox, p[1] + oy) : g.moveTo(p[0] + ox, p[1] + oy)));
            for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0] + ox, bot[i][1] + oy);
            g.closePath(); g.fill();
          }
        }
      }
      grain(g, R, 0.08);
    },
    /* зима: белая краска, серые пятна */
    winter(g, R) {
      g.fillStyle = hex(0xd9dcda); g.fillRect(0, 0, N, N);
      g.fillStyle = hex(0xa9aeab); for (let i = 0; i < 14; i++) blob(g, R, R() * N, R() * N, 26 + R() * 30, 0.5 + R() * 0.4);
      g.fillStyle = hex(0x6c706d); for (let i = 0; i < 12; i++) blob(g, R, R() * N, R() * N, 10 + R() * 14, 0.4 + R() * 0.4, 0.45);
      grain(g, R, 0.06);
    },
    /* пустыня (трёхцветка) */
    desert(g, R) {
      g.fillStyle = hex(0xc0a57c); g.fillRect(0, 0, N, N);
      g.fillStyle = hex(0x9a7d57); for (let i = 0; i < 12; i++) blob(g, R, R() * N, R() * N, 34 + R() * 36, 0.45 + R() * 0.35);
      g.fillStyle = hex(0x6d583f); for (let i = 0; i < 11; i++) blob(g, R, R() * N, R() * N, 18 + R() * 22, 0.4 + R() * 0.35);
      grain(g, R, 0.07);
    },
    /* мультикам: мягкие переходы, мелкие тёмные «ветви» */
    multi(g, R) {
      const gr = g.createLinearGradient(0, 0, 0, N);
      gr.addColorStop(0, hex(0x9d8c68)); gr.addColorStop(0.5, hex(0x8f8a63)); gr.addColorStop(1, hex(0x9d8c68));
      g.fillStyle = gr; g.fillRect(0, 0, N, N);
      g.globalAlpha = 0.75;
      g.fillStyle = hex(0x6f6d4c); for (let i = 0; i < 12; i++) blob(g, R, R() * N, R() * N, 36 + R() * 34, 0.6 + R() * 0.3);
      g.fillStyle = hex(0x7a5f45); for (let i = 0; i < 10; i++) blob(g, R, R() * N, R() * N, 24 + R() * 24, 0.5 + R() * 0.3);
      g.fillStyle = hex(0xc4b38e); for (let i = 0; i < 8; i++) blob(g, R, R() * N, R() * N, 16 + R() * 18, 0.6 + R() * 0.3);
      g.globalAlpha = 1;
      g.fillStyle = hex(0x3d3427); for (let i = 0; i < 26; i++) blob(g, R, R() * N, R() * N, 4 + R() * 7, 0.3 + R() * 0.4, 0.5);
      grain(g, R, 0.06);
    },
    /* флектарн: россыпи мелких пятен пяти цветов на светлой оливе */
    fleck(g, R) {
      g.fillStyle = hex(0x8e9064); g.fillRect(0, 0, N, N);
      for (const [c, n] of [[0x667042, 95], [0x434d2c, 85], [0x5c4832, 70], [0x1f2019, 60]]) {
        g.fillStyle = hex(c);
        for (let i = 0; i < n; i++) {
          const cx = R() * N, cy = R() * N, k = 2 + ((R() * 4) | 0);
          for (let j = 0; j < k; j++) blob(g, R, cx + (R() - 0.5) * 24, cy + (R() - 0.5) * 24, 3.5 + R() * 6, 0.7 + R() * 0.5, 0.25);
        }
      }
      grain(g, R, 0.06);
    },
    /* «Берёзка»: светлый хаки, оливковые «листья» с просветами */
    birch(g, R) {
      g.fillStyle = hex(0xbfb78a); g.fillRect(0, 0, N, N);
      g.fillStyle = hex(0x7b7e4c); for (let i = 0; i < 48; i++) blob(g, R, R() * N, R() * N, 15 + R() * 20, 0.42 + R() * 0.3, 0.55);
      g.fillStyle = hex(0xbfb78a); for (let i = 0; i < 80; i++) blob(g, R, R() * N, R() * N, 4 + R() * 7, 0.6 + R() * 0.4, 0.4);
      g.fillStyle = hex(0x5c6038); for (let i = 0; i < 30; i++) blob(g, R, R() * N, R() * N, 5 + R() * 8, 0.5 + R() * 0.3, 0.5);
      grain(g, R, 0.06);
    },
    /* «Партизан» (СС-лето): листья трёх цветов внахлёст */
    partizan(g, R) {
      g.fillStyle = hex(0xa39871); g.fillRect(0, 0, N, N);
      for (const [c, n, a, b] of [[0x6d7046, 90, 10, 26], [0x5d4935, 70, 9, 22], [0x2f2e23, 46, 6, 14]]) {
        g.fillStyle = hex(c);
        for (let i = 0; i < n; i++) leaf(g, R() * N, R() * N, a + R() * (b - a), R() * 6.283, 0.32 + R() * 0.2);
      }
      grain(g, R, 0.07);
    },
    /* мультикам «блэк»: чёрный и графит */
    mcblack(g, R) {
      g.fillStyle = hex(0x242528); g.fillRect(0, 0, N, N);
      g.globalAlpha = 0.85;
      g.fillStyle = hex(0x3b3d41); for (let i = 0; i < 14; i++) blob(g, R, R() * N, R() * N, 34 + R() * 30, 0.6 + R() * 0.3);
      g.fillStyle = hex(0x4e5054); for (let i = 0; i < 9; i++) blob(g, R, R() * N, R() * N, 22 + R() * 22, 0.55 + R() * 0.3);
      g.globalAlpha = 1;
      g.fillStyle = hex(0x121315); for (let i = 0; i < 30; i++) blob(g, R, R() * N, R() * N, 4 + R() * 7, 0.3 + R() * 0.4, 0.5);
      grain(g, R, 0.05);
    },
    /* «Чешуя» (в духе Kryptek): пятна и слой шестигранных чешуек */
    scale(g, R) {
      const n1 = pnoise(R, 5), n2 = pnoise(R, 9), n3 = pnoise(R, 16);
      g.fillStyle = hex(0x7d7559); g.fillRect(0, 0, N, N);
      g.fillStyle = hex(0x5b5442); for (let i = 0; i < 12; i++) blob(g, R, R() * N, R() * N, 30 + R() * 34, 0.6 + R() * 0.3, 0.45);
      g.fillStyle = hex(0x9d9273); for (let i = 0; i < 8; i++) blob(g, R, R() * N, R() * N, 22 + R() * 26, 0.6 + R() * 0.3, 0.45);
      const C = 16, H = C * 0.866;
      for (let row = 0; row * H < N + H; row++) for (let col = 0; col * C < N + C; col++) {
        const x = col * C + (row % 2 ? C / 2 : 0), y = row * H;
        const xm = ((x % N) + N) % N, ym = ((y % N) + N) % N;
        const v = n1(xm, ym) * 0.6 + n2(xm, ym) * 0.4;
        if (v < 0.47) continue;
        const dark = n3(xm, ym) > 0.5;
        g.fillStyle = dark ? 'rgba(40,37,29,0.55)' : 'rgba(170,160,128,0.45)';
        for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
          const px = x + ox, py = y + oy;
          if (px < -C || px > N + C || py < -C || py > N + C) continue;
          g.beginPath();
          for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6, r = C * 0.42; if (k) g.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r); else g.moveTo(px + Math.cos(a) * r, py + Math.sin(a) * r); }
          g.closePath(); g.fill();
        }
      }
      grain(g, R, 0.05);
    },
    /* «Город»: серый осколочный рисунок */
    urban(g, R) {
      g.fillStyle = hex(0x8e9194); g.fillRect(0, 0, N, N);
      for (const [c, n] of [[0x63676b, 30], [0x404448, 22], [0xb4b7b9, 16]]) {
        g.fillStyle = hex(c);
        for (let i = 0; i < n; i++) shard(g, R, R() * N, R() * N, 22 + R() * 42);
      }
      grain(g, R, 0.05);
    },
    /* карбон: саржа 2×2, блик по волокну */
    carbon(g, R) {
      const C = 16;
      for (let y = 0; y < N; y += C) for (let x = 0; x < N; x += C) {
        const k = (((x / C) + (y / C)) % 4) < 2;
        const gr = k ? g.createLinearGradient(x, y, x + C, y) : g.createLinearGradient(x, y, x, y + C);
        gr.addColorStop(0, '#17181a'); gr.addColorStop(0.5, k ? '#3c3e42' : '#2b2d30'); gr.addColorStop(1, '#17181a');
        g.fillStyle = gr; g.fillRect(x, y, C, C);
      }
      grain(g, R, 0.03);
    },
    /* дамаск: слои стали, «текущие» волны */
    damascus(g, R) {
      const n1 = pnoise(R, 4), n2 = pnoise(R, 10), d = g.createImageData(N, N), a = d.data;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const w = (y / N) * 16 + n1(x, y) * 6 + n2(x, y) * 1.8;
        const v = Math.pow(0.5 + 0.5 * Math.sin(w * 6.2832), 1.6), c = 62 + v * 150, i = (y * N + x) * 4;
        a[i] = c * 0.97; a[i + 1] = c * 0.99; a[i + 2] = c * 1.03; a[i + 3] = 255;
      }
      g.putImageData(d, 0, 0);
    }
  };
  const texCache = {};
  function patternTex(id) {
    if (texCache[id]) return texCache[id];
    if (typeof document === 'undefined' || !PAT[id]) return null;
    const cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d', { willReadFrequently: true });
    PAT[id](g, rng(0x5EED + id.length * 977 + id.charCodeAt(0) * 31));
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.name = 'skin_' + id;
    return (texCache[id] = t);
  }

  /* ------------------------------------------------------- каталог --- */
  /* c — цвет покрытия, r/m — шероховатость/металличность краски, pat — рисунок,
     tile — мм на период рисунка; use — заменить материал готовым из набора.
     cat — раздел палитры: paint (однотонные, как Cerakote серии H), camo,
     special (металлик, карбон, дамаск). only — образцы, где окраска имеет смысл. */
  const PAINT = (c, r) => ({ c, r: r ?? 0.68, m: 0.08 });
  const METAL = (c, r, m) => ({ c, r, m });
  const CAMO = (pat, tile, r, m) => ({ pat, tile: tile || 300, r: r ?? 0.72, m: m ?? 0.06 });
  const SK = {
    factory: { name: 'Заводская', sw: null, cat: 'base' },
    walnut: { name: 'Тёмный орех', sw: 0x4a2c1c, wood: { use: 'woodDark' }, cat: 'paint', only: ['akm', 'svd', 'm870'] },
    black: { name: 'Чёрный', sw: 0x1d1e20, poly: PAINT(0x1b1c1e, 0.78), wood: PAINT(0x1b1c1e, 0.74), cat: 'paint' },
    tan: { name: 'Песок', sw: 0xb49a72, all: PAINT(0xb39a72), cat: 'paint' },
    fde: { name: 'Койот', sw: 0x7f6c50, all: PAINT(0x7d6a4e, 0.7), cat: 'paint' },
    od: { name: 'Олива', sw: 0x535a3d, all: PAINT(0x4f5639), cat: 'paint' },
    ranger: { name: 'Рейнджер', sw: 0x454b3b, all: PAINT(0x434939, 0.7), cat: 'paint' },
    sgrey: { name: 'Снайперский серый', sw: 0x5b5e5d, all: PAINT(0x595c5b, 0.66), cat: 'paint' },
    arctic: { name: 'Арктика', sw: 0xd6d7d1, all: PAINT(0xd2d3cd, 0.7), cat: 'paint' },
    twotone: { name: 'Двухцвет', sw: 0xa38b63, poly: PAINT(0xa98f68, 0.74), cat: 'paint' },
    woodland: { name: 'Лес', pat: 'woodland', all: CAMO('woodland', 320), cat: 'camo' },
    digital: { name: 'Цифра', pat: 'digital', all: CAMO('digital', 300), cat: 'camo' },
    multi: { name: 'Мультикам', pat: 'multi', all: CAMO('multi', 300), cat: 'camo' },
    fleck: { name: 'Флектарн', pat: 'fleck', all: CAMO('fleck', 260), cat: 'camo' },
    birch: { name: 'Берёзка', pat: 'birch', all: CAMO('birch', 320), cat: 'camo' },
    partizan: { name: 'Партизан', pat: 'partizan', all: CAMO('partizan', 300), cat: 'camo' },
    tiger: { name: 'Тигр', pat: 'tiger', all: CAMO('tiger', 340), cat: 'camo' },
    desert: { name: 'Пустыня', pat: 'desert', all: CAMO('desert', 340), cat: 'camo' },
    winter: { name: 'Зима', pat: 'winter', all: CAMO('winter', 320), cat: 'camo' },
    urban: { name: 'Город', pat: 'urban', all: CAMO('urban', 320), cat: 'camo' },
    mcblack: { name: 'Мультикам «Блэк»', pat: 'mcblack', all: CAMO('mcblack', 300), cat: 'camo' },
    scale: { name: 'Чешуя', pat: 'scale', all: CAMO('scale', 280), cat: 'camo' },
    tungsten: { name: 'Вольфрам', sw: 0x66696b, met: true, all: METAL(0x6a6d6f, 0.42, 0.55), cat: 'special' },
    bronze: { name: 'Бронза', sw: 0x80562f, met: true, all: METAL(0x8a5c32, 0.4, 0.6), cat: 'special' },
    gold: { name: 'Золото', sw: 0xb38d3f, met: true, all: METAL(0xc39a45, 0.3, 0.85), cat: 'special' },
    cobalt: { name: 'Кобальт', sw: 0x2f4f7a, all: METAL(0x2d4c78, 0.5, 0.25), cat: 'special' },
    crimson: { name: 'Багровый', sw: 0x72252a, all: PAINT(0x6e2226, 0.6), cat: 'special' },
    carbon: { name: 'Карбон', pat: 'carbon', poly: CAMO('carbon', 120, 0.3, 0.1), metal: CAMO('carbon', 120, 0.3, 0.12), wood: CAMO('carbon', 120, 0.3, 0.1), cat: 'special' },
    damascus: { name: 'Дамаск', pat: 'damascus', all: CAMO('damascus', 150, 0.34, 0.72), cat: 'special' }
  };
  /* «витрина» образца — 5 окрасок в компактной панели оружейной */
  const BY = {
    akm: ['factory', 'walnut', 'black', 'woodland', 'digital'],
    ak74: ['factory', 'black', 'partizan', 'woodland', 'digital'],
    m416: ['factory', 'tan', 'od', 'multi', 'winter'],
    ar15m4: ['factory', 'fde', 'od', 'tiger', 'desert'],
    scar: ['factory', 'tan', 'black', 'desert', 'woodland'],
    svd: ['factory', 'black', 'digital', 'winter', 'birch'],
    m870: ['factory', 'tan', 'od', 'woodland', 'winter'],
    mp5a3: ['factory', 'tan', 'od', 'digital', 'tiger'],
    glock18c: ['factory', 'tan', 'od', 'twotone', 'cobalt'],
    glock21: ['factory', 'fde', 'od', 'twotone', 'crimson']
  };
  const DEF_LIST = ['factory', 'tan', 'od', 'woodland', 'desert'];
  const CATS = [['paint', 'Однотонные'], ['camo', 'Камуфляж'], ['special', 'Особые']];
  const valid = (wid, sid) => !!sid && !!SK[sid] && (!SK[sid].only || SK[sid].only.includes(wid));
  const item = (id) => ({ id, name: SK[id].name, sw: SK[id].sw, pat: SK[id].pat || null, cat: SK[id].cat, met: !!SK[id].met });
  const list = (wid) => (BY[wid] || DEF_LIST).filter((id) => valid(wid, id)).map(item);
  /* вся палитра образца по разделам: [{ cat, name, items }] */
  const catalog = (wid) => CATS.map(([cat, name]) => ({ cat, name, items: Object.keys(SK).filter((id) => SK[id].cat === cat && valid(wid, id)).map(item) }));

  /* ------------------------------------------------ что и чем красить --- */
  const PAINT_SLOTS = new Set(['stock', 'handguard', 'pgrip', 'cover', 'barrel', 'slide', 'forend', 'trigger', 'backstrap', 'charger', 'frontsight', 'rearsight', 'irons', 'saddle']);
  const SKIP = /^(brass|copper|chrome|steelBright|spring|lead|steelCase|hull|rubber|white|paint|paper|target|lens|irLens|glass|em|tritium|lamp|laser|led|reflector)/;
  const names = new WeakMap();
  function learn(mats) {
    const all = mats && (mats.all || mats);
    if (!all || names.has(all)) return;
    names.set(all, true);
    for (const k in all) if (all[k] && all[k].isMaterial) names.set(all[k], k);
  }
  function kindOf(m) {
    if (!m || !m.isMaterial || m.transparent || m.visible === false) return null;
    if (m.emissive && m.emissiveIntensity > 0 && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05) return null;
    const nm = names.get(m);
    if (typeof nm === 'string') {
      if (SKIP.test(nm)) return null;
      if (/^wood/.test(nm)) return 'wood';
      if (/^(poly|bakelite)/.test(nm)) return 'poly';
      if (/^(steel|alu|cast)/.test(nm)) return 'metal';
      return null;
    }
    /* цветные варианты набора (poly#hex и т. п.) — по свойствам */
    if (!m.userData || !m.userData.wear) return null;
    if (m.map && m.clearcoat !== undefined) return 'wood';
    return (m.metalness || 0) >= 0.45 ? 'metal' : 'poly';
  }

  const SKIN_VS = 'varying vec3 vSkP; varying vec3 vSkN;';
  const SKIN_FS = 'uniform sampler2D tSkin; uniform float uSkT, uSkPw; uniform vec4 uSkO; varying vec3 vSkP; varying vec3 vSkN;';
  const SKIN_APPLY = `
      {
        vec3 sw = pow(abs(normalize(vSkN)), vec3(uSkPw)); sw /= max(1e-4, sw.x + sw.y + sw.z);
        vec3 sp = vSkP * uSkT;
        vec3 sc = texture2D(tSkin, sp.zy).rgb * sw.x + texture2D(tSkin, sp.xz + uSkO.xy).rgb * sw.y + texture2D(tSkin, sp.xy + uSkO.zw).rgb * sw.z;
        diffuseColor.rgb *= sc;
      }`;
  const OFF = [0.37, 0.61, 0.13, 0.29];
  const cache = new WeakMap();   // исходный материал → { skinId: материал }
  function skinMat(m, sk, sid, mats) {
    const kind = kindOf(m);
    if (!kind) return m;
    const spec = sk[kind] || sk.all;
    if (!spec) return m;
    let per = cache.get(m);
    if (!per) cache.set(m, (per = {}));
    if (per[sid]) return per[sid];
    if (spec.use) {
      const all = mats && (mats.all || mats);
      return (per[sid] = (all && all[spec.use]) || m);
    }
    const n = m.clone();
    n.name = (m.name || names.get(m) || 'mat') + '+' + sid;
    const tex = spec.pat ? patternTex(spec.pat) : null;
    n.color = new THREE.Color(tex ? 0xffffff : spec.c);
    if (tex || kind === 'wood') n.map = null;
    if (n.clearcoat !== undefined && kind === 'wood') n.clearcoat = 0.05;
    n.roughness = spec.r; n.metalness = spec.m;
    n.userData = Object.assign({}, m.userData);
    /* потёртости: краска сходит с кромок — под ней металл (воронение) или чёрный полимер */
    const w0 = m.userData && m.userData.wear;
    const U = w0 ? {
      uWear: { value: Math.min(0.85, (w0.uWear.value || 0.5) * 0.9) },
      uWearMetal: { value: kind === 'metal' ? 0.85 : 0.0 },
      uWearRough: { value: kind === 'metal' ? 0.38 : 0.62 },
      uGrime: { value: w0.uGrime.value },
      uWearCol: { value: new THREE.Color(kind === 'metal' ? 0x4a4c50 : kind === 'wood' ? 0x5b3a22 : 0x222325) }
    } : null;
    if (U) n.userData.wear = U;
    const SU = tex ? { tSkin: { value: tex }, uSkT: { value: 1 / spec.tile }, uSkPw: { value: 4 }, uSkO: { value: new THREE.Vector4(...OFF) } } : null;
    if (tex) n.userData.lodCamo = { tex, tile: 1 / spec.tile, k: 0, mean: 1, pw: 4, off: OFF };
    const base = m.onBeforeCompile;
    const baseKey = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
    n.onBeforeCompile = function (sh, r) {
      if (base) base.call(this, sh, r);
      if (U) Object.assign(sh.uniforms, U);
      if (SU) {
        Object.assign(sh.uniforms, SU);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + SKIN_VS).replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkP = position; vSkN = normal;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + SKIN_FS).replace('#include <map_fragment>', '#include <map_fragment>\n' + SKIN_APPLY);
      }
    };
    n.customProgramCacheKey = () => baseKey + (tex ? '+skin' : '+paint');
    n.needsUpdate = true;
    return (per[sid] = n);
  }

  /* модули (прицел, ДТК, магазин, ЛЦУ…) по умолчанию заводские; mods — { slotId: skinId | 'same' | 'factory',
     '*': умолчание для всех модулей }. Фурнитура (PAINT_SLOTS) и база всегда идут в цвет оружия, если
     для слота нет явного значения. */
  function normMods(mods) {
    if (!mods || typeof mods !== 'object') return null;
    const out = {};
    for (const k in mods) {
      const v = mods[k];
      if (k === 'ammo' || typeof v !== 'string') continue;
      if (v === 'same' || v === 'factory' || SK[v]) out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  }
  function effFor(slot, sid, mods) {
    if (slot === 'ammo') return 'factory';
    const furn = !slot || PAINT_SLOTS.has(slot);
    let v = mods && slot ? mods[slot] : undefined;
    if (v == null) v = furn ? 'same' : (mods && mods['*']) || 'factory';
    return v === 'same' ? sid : v;
  }
  /* есть ли у объекта (модуля) что красить */
  function paintable(obj) {
    let ok = false;
    if (obj) obj.traverse((o) => {
      if (ok || !o.isMesh || o.userData.reticle || o.userData.noSkin || o.userData.wcover || o.userData.lodProxy) return;
      const m = o.userData.skinOrig || o.material;
      ok = Array.isArray(m) ? m.some((x) => !!kindOf(x)) : !!kindOf(m);
    });
    return ok;
  }

  /* окраска сборки: rootObj — корень сборки (asm.root), wid — образец, sid — окраска оружия, mods — модули */
  function apply(rootObj, wid, sid, mats, mods) {
    if (!rootObj) return;
    learn(mats);
    rootObj.traverse((o) => { if (o.isMesh && o.userData.skinOrig) { o.material = o.userData.skinOrig; delete o.userData.skinOrig; } });
    if (!valid(wid, sid)) sid = 'factory';
    mods = normMods(mods);
    rootObj.userData.skin = sid;
    rootObj.userData.skinMods = mods;
    if (sid === 'factory' && !mods) return;
    rootObj.traverse((o) => {
      if (!o.isMesh || o.userData.reticle || o.userData.noSkin || o.userData.lodProxy || o.userData.wcover) return;
      const e = effFor(o.userData.slotId, sid, mods);
      if (e === 'factory' || !valid(wid, e)) return;
      const sk = SK[e];
      const orig = o.material;
      const nm = Array.isArray(orig) ? orig.map((m) => skinMat(m, sk, e, mats)) : skinMat(orig, sk, e, mats);
      const changed = Array.isArray(orig) ? nm.some((m, i) => m !== orig[i]) : nm !== orig;
      if (changed) { o.userData.skinOrig = orig; o.material = nm; }
    });
  }

  /* образец для кнопки выбора (CSS-фон) — маленькая миниатюра, считается один раз */
  const thumbs = {};
  function swatchURL(sid) {
    const s = SK[sid];
    if (!s || !s.pat) return null;
    if (thumbs[sid] !== undefined) return thumbs[sid];
    const t = patternTex(s.pat);
    let url = null;
    try {
      if (t && t.image) {
        const cv = document.createElement('canvas'); cv.width = cv.height = 72;
        cv.getContext('2d').drawImage(t.image, 0, 0, t.image.width * 0.42, t.image.height * 0.42, 0, 0, 72, 72);
        url = cv.toDataURL('image/jpeg', 0.82);
      }
    } catch (e) { url = null; }
    return (thumbs[sid] = url);
  }

  root.GSkins = { list, catalog, CATS, valid, apply, normMods, effFor, paintable, PAINT_SLOTS, swatchURL, name: (sid) => (SK[sid] ? SK[sid].name : ''), SK, BY, patternTex };
})(typeof window !== 'undefined' ? window : globalThis);
