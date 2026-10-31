/* ==========================================================================
   МОДУЛЬ: soldier/cover.js (v27)
   ==========================================================================
   Маскировка поверх снаряжения: «кикимора» (гилли) и маскировочная
   накидка-сетка «леший» (лоскуты-листья на сетке).

   Как устроен настоящий маскхалат «Кикимора»: основа — сетка (или куртка
   и брюки с нашитой сеткой), к ячейкам узлом привязаны пучки джутовых
   нитей / полосы мешковины длиной 15–30 см. Пучок держится только корнем
   (узлом) и висит под своим весом: на спине и ногах — вниз, на поднятой
   руке — вниз от руки, лёжа — ложится на спину. На груди и животе
   нитей мало (по ним ползут), на голове, плечах и спине — больше всего.

   Здесь так же:
   • карточка = пучок из 6–9 полос джута (текстура с волокнами, рваными
     концами и тёмным узлом у корня), альфа-срез без сортировки;
   • корень карточки прибит к поверхности бойца (веса скиннинга ближайшей
     вершины китель/плитник/шлем), а форма пучка досчитывается в вершинном
     шейдере ПОСЛЕ скиннинга: направление смешивается с «вниз по миру» с
     весом, растущим к концу нити, и никогда не уходит внутрь тела. Поэтому
     в любой позе (бег, присед, лёжа, руки с оружием) нити свисают, а не
     торчат «в воздух»; при беге — относит назад (скорость бойца);
   • освещение — по нормали поверхности под пучком (без переворота на
     изнанке): нет чёрных «каракулей» из обратных сторон карточек; у корня
     темнее (затенение массой нитей), к концу — светлее и суше;
   • плотность (количество пучков) — 5 уровней в редакторе внешнего вида;
   • дальность: карточки перемешаны, поэтому вдали рисуется только первая
     часть буфера (drawRange) — та же фигура, меньше пучков; на слабом
     качестве — меньше пучков и вблизи. Тени маскировка не отбрасывает.
   ========================================================================== */
(function (root, factory) {
  const C = factory(root.GUtil);
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  else root.GCover = C;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  /* расцветки (sRGB) по реальным джутовым наборам для кикимор: лес (олива,
     мох, бурый), осень (охра, ржавчина, сухая трава), степь/пустыня
     (солома, песок), зима (белый с серым) */
  const SCHEMES = {
    forest: { name: 'Лес', col: [[70, 78, 46], [88, 92, 54], [56, 64, 38], [104, 96, 64], [46, 52, 34], [82, 72, 48], [96, 104, 62]] },
    autumn: { name: 'Осень', col: [[120, 98, 58], [96, 80, 50], [140, 116, 72], [78, 70, 44], [108, 86, 52], [66, 70, 44], [128, 104, 70]] },
    steppe: { name: 'Степь', col: [[164, 146, 104], [140, 124, 86], [178, 162, 118], [120, 106, 74], [150, 138, 98], [132, 128, 92]] },
    winter: { name: 'Зима', col: [[222, 224, 224], [204, 208, 210], [236, 236, 234], [186, 192, 196], [214, 214, 208], [170, 176, 178]] }
  };
  const KINDS = { none: 'Нет', net: 'Маскировочная накидка', ghillie: 'Кикимора (гилли)' };
  /* плотность: множитель числа пучков по уровням 1…5 */
  const DENSITY = [0.5, 0.75, 1.0, 1.45, 2.0];
  const DENSITY_NAMES = ['Редко', 'Мало', 'Норма', 'Густо', 'Максимум'];
  const densOf = (P) => { const d = Math.round(+P.coverDensity || 3); return d >= 1 && d <= 5 ? d : 3; };

  function rng(seed) {
    if (U && U.rng) return U.rng(seed);
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e6) / 1e6; };
  }
  const lin = (v) => Math.pow(v / 255, 2.2);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  /* ------------------------------------------------------ текстуры --- */
  const texCanvas = {};
  /* Атлас джута 256×512: два варианта пучка (левая и правая половины).
     Полоса — сужающийся лоскут с продольными волокнами и пушком по краю,
     к концу расщепляется на 2–4 волокна. Яркость 0,55–1 (цвет даёт
     вершина), кончики чуть суше и желтее. */
  function strandCanvas() {
    if (texCanvas.strand) return texCanvas.strand;
    const W = 256, H = 512, CW = 128, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const r = rng(9137);
    g.clearRect(0, 0, W, H);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let col = 0; col < 2; col++) {
      const ox = col * CW, n = col ? 7 : 9;
      for (let i = 0; i < n; i++) {
        const x0 = ox + 14 + (CW - 28) * (i + 0.5 + (r() - 0.5) * 0.7) / n;
        const len = H * (0.62 + 0.38 * r()), w0 = 7 + r() * 7;
        const ph = r() * 6.28, amp = 2 + r() * 5, drift = (r() - 0.5) * 14;
        const lum = 140 + r() * 115, warm = r() < 0.4 ? 1 : 0;
        const cx = (t) => x0 + Math.sin(ph + t * 6.5) * amp * t + drift * t * t;
        const wd = (t) => w0 * (1 - 0.62 * t) * (0.86 + 0.14 * Math.sin(ph * 3 + t * 23));
        const fray = 0.74 + r() * 0.12;
        const tint = (l, t) => {
          const k = 1 + 0.12 * t;   // кончик выгорел
          const R = Math.min(255, l * k * (warm ? 1.04 : 1)), G = Math.min(255, l * k * (warm ? 0.98 : 1)), B = Math.min(255, l * k * (warm ? 0.84 : 0.95));
          return 'rgb(' + (R | 0) + ',' + (G | 0) + ',' + (B | 0) + ')';
        };
        /* тело лоскута — многоугольник по центральной линии */
        g.beginPath();
        const S = 28;
        for (let k = 0; k <= S; k++) { const t = (k / S) * fray; g.lineTo(cx(t) - wd(t) * 0.5, t * len); }
        for (let k = S; k >= 0; k--) { const t = (k / S) * fray; g.lineTo(cx(t) + wd(t) * 0.5, t * len); }
        g.closePath();
        g.fillStyle = tint(lum, 0.3); g.fill();
        /* продольные волокна: светлее и темнее основы */
        const nf = 3 + (r() * 3 | 0);
        for (let f = 0; f < nf; f++) {
          const o = (f / (nf - 1 || 1) - 0.5) * 0.8;
          g.strokeStyle = tint(lum * (f % 2 ? 0.72 : 1.18), 0.4); g.lineWidth = 1;
          g.beginPath();
          for (let k = 0; k <= S; k++) { const t = (k / S) * fray; g.lineTo(cx(t) + o * wd(t), t * len); }
          g.stroke();
        }
        /* расщеплённый конец: тонкие волокна расходятся */
        const nt = 2 + (r() * 3 | 0);
        for (let f = 0; f < nt; f++) {
          const sx = cx(fray) + (f / (nt - 1 || 1) - 0.5) * wd(fray), spread = (r() - 0.5) * 16;
          const el = len * (fray + (1 - fray) * (0.5 + 0.5 * r()));
          g.strokeStyle = tint(lum * (0.85 + r() * 0.3), 1); g.lineWidth = 1.2 + r() * 1.3;
          g.beginPath(); g.moveTo(sx, fray * len);
          g.quadraticCurveTo(sx + spread * 0.3, (fray * len + el) / 2, sx + spread, el);
          g.stroke();
        }
        /* пушок по краю — без резкого контура */
        g.lineWidth = 0.8;
        for (let f = 0; f < 22; f++) {
          const t = r() * fray, sd = r() < 0.5 ? -1 : 1, x = cx(t) + sd * wd(t) * 0.5, y = t * len;
          g.strokeStyle = tint(lum * 0.9, t);
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + sd * (2 + r() * 4), y + 3 + r() * 6); g.stroke();
        }
      }
      /* узел у корня: плотный тёмный жгут — пучок «сидит» на сетке */
      for (let k = 0; k < 40; k++) {
        const x = ox + 16 + r() * (CW - 32), y = r() * 18, rr = 3 + r() * 6;
        g.fillStyle = 'rgb(' + (95 + r() * 40 | 0) + ',' + (92 + r() * 36 | 0) + ',' + (80 + r() * 30 | 0) + ')';
        g.beginPath(); g.ellipse(x, y, rr * 1.4, rr, 0, 0, Math.PI * 2); g.fill();
      }
    }
    texCanvas.strand = c;
    return c;
  }
  /* Накидка «леший»: сетка ячейкой ~2 см, на ней лоскуты-листья с
     прожилкой и тёмной кромкой (ткань, вырезанная листом и подвёрнутая) */
  function leafCanvas() {
    if (texCanvas.leaf) return texCanvas.leaf;
    const S = 256, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const r = rng(5521);
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgb(110,108,98)'; g.lineWidth = 1.6;
    for (let k = -S; k < 2 * S; k += 22) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke();
      g.beginPath(); g.moveTo(k, S); g.lineTo(k + S, 0); g.stroke();
    }
    for (let i = 0; i < 46; i++) {
      const x = r() * S, y = r() * S, L = 22 + r() * 26, Wd = L * (0.38 + r() * 0.2), a = (r() - 0.5) * 2.4 + Math.PI / 2;
      const l = 130 + r() * 125, ca = Math.cos(a), sa = Math.sin(a);
      const P = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];
      g.beginPath();
      const N = 22;
      for (let k = 0; k <= N; k++) {
        const t = k / N, u = (t - 0.5) * L, prof = Math.sin(Math.PI * Math.pow(t, 0.8)) * Wd * 0.5;
        const jag = 1 + (k % 2 ? -0.18 : 0.08) * r();
        const p = P(u, prof * jag); if (k) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]);
      }
      for (let k = N; k >= 0; k--) {
        const t = k / N, u = (t - 0.5) * L, prof = Math.sin(Math.PI * Math.pow(t, 0.8)) * Wd * 0.5;
        const jag = 1 + (k % 2 ? -0.18 : 0.08) * r();
        const p = P(u, -prof * jag); g.lineTo(p[0], p[1]);
      }
      g.closePath();
      const gr = g.createLinearGradient(...P(-L / 2, 0), ...P(L / 2, 0));
      gr.addColorStop(0, 'rgb(' + (l * 0.8 | 0) + ',' + (l * 0.8 | 0) + ',' + (l * 0.78 | 0) + ')');
      gr.addColorStop(1, 'rgb(' + (l | 0) + ',' + (l | 0) + ',' + (l * 0.94 | 0) + ')');
      g.fillStyle = gr; g.fill();
      g.strokeStyle = 'rgba(40,40,36,0.55)'; g.lineWidth = 1.2; g.stroke();
      /* прожилки */
      g.strokeStyle = 'rgba(60,60,52,0.45)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(...P(-L * 0.48, 0)); g.lineTo(...P(L * 0.45, 0)); g.stroke();
      for (let v = 0; v < 3; v++) {
        const u = (-0.3 + v * 0.25) * L;
        for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(...P(u, 0)); g.lineTo(...P(u + L * 0.14, sd * Wd * 0.32)); g.stroke(); }
      }
    }
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 60; i++) {
      const side = i % 4, t = r() * S, rr = 4 + r() * 10;
      const x = side === 0 ? 0 : side === 1 ? S : t, y = side === 2 ? 0 : side === 3 ? S : t;
      g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    texCanvas.leaf = c;
    return c;
  }

  /* --------------------------------------------------- выборка точек --- */
  function triPool(geo, keep) {
    if (!geo || !geo.attributes || !geo.attributes.position || !geo.attributes.skinIndex) return null;
    const P = geo.attributes.position.array, N = geo.attributes.normal ? geo.attributes.normal : null;
    const I = geo.index ? geo.index.array : null, nt = I ? I.length / 3 : P.length / 9;
    const tris = [], cum = [];
    let A = 0;
    for (let t = 0; t < nt; t++) {
      const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2;
      const pa = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], pb = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], pc = [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]];
      const cen = mul(add(add(pa, pb), pc), 1 / 3);
      const cr = cross(sub(pb, pa), sub(pc, pa)), ar = 0.5 * Math.hypot(cr[0], cr[1], cr[2]);
      if (ar < 1e-7) continue;
      let n = nrm(cr);
      if (N) {
        const vn = nrm([N.getX(a) + N.getX(b) + N.getX(c), N.getY(a) + N.getY(b) + N.getY(c), N.getZ(a) + N.getZ(b) + N.getZ(c)]);
        if (dot(vn, n) < 0) n = mul(n, -1);
      }
      if (!keep(cen, n)) continue;
      A += ar; tris.push([a, b, c, pa, pb, pc, n]); cum.push(A);
    }
    return tris.length ? { geo, tris, cum, A } : null;
  }
  function pick(pool, r) {
    const x = r() * pool.A, cum = pool.cum;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < x) lo = m + 1; else hi = m; }
    const T = pool.tris[lo];
    let u = r(), v = r();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const p = add(add(mul(T[3], 1 - u - v), mul(T[4], u)), mul(T[5], v));
    const k = (1 - u - v) >= Math.max(u, v) ? T[0] : u >= v ? T[1] : T[2];
    return { p, n: T[6], v: k, geo: pool.geo };
  }

  /* ------------------------------------------------------ карточки --- */
  /* Атрибуты сверх обычных: cOff — смещение вершины от корня (поза покоя),
     cSide — поперечная часть этого смещения, cG — вес «гравитации» (0 у
     корня, растёт к концу). Шейдер по ним досчитывает провис после скиннинга. */
  function Builder() { this.p = []; this.n = []; this.uv = []; this.c = []; this.si = []; this.sw = []; this.ix = []; this.off = []; this.sd = []; this.g = []; }
  Builder.prototype.card = function (s, o) {
    const si = s.geo.attributes.skinIndex, sw = s.geo.attributes.skinWeight;
    const idx = [si.getX(s.v), si.getY(s.v), si.getZ(s.v), si.getW(s.v)];
    const wts = [sw.getX(s.v), sw.getY(s.v), sw.getZ(s.v), sw.getW(s.v)];
    const base = this.p.length / 3;
    const n = s.n, R = o.rows, dir = o.dir, side = o.side, L = o.L;
    for (let row = 0; row <= R; row++) {
      const t = row / R, a = L * t;
      /* дуга: середина отходит от поверхности (объём), hug — ложится по шлему */
      const out = o.bend * Math.sin(t * Math.PI * 0.85) - (o.hug ? (a * a) / (2 * o.hug) : 0);
      const c = add(add(s.p, mul(dir, a)), mul(n, out));
      const hw = o.W * (1 - 0.3 * t) * 0.5;
      /* у корня темнее: свет закрыт массой соседних пучков */
      const ao = 0.5 + 0.5 * Math.pow(t, 0.6);
      const gw = o.grav * Math.pow(t, 0.85);
      for (const sg of [-1, 1]) {
        const sv = mul(side, hw * sg), q = add(c, sv), d = sub(q, s.p);
        this.p.push(q[0], q[1], q[2]);
        this.n.push(n[0], n[1], n[2]);
        this.uv.push(o.u0 + (sg < 0 ? 0 : 0.5), 1 - t);
        this.c.push(o.col[0] * ao, o.col[1] * ao, o.col[2] * ao);
        this.si.push(idx[0], idx[1], idx[2], idx[3]);
        this.sw.push(wts[0], wts[1], wts[2], wts[3]);
        this.off.push(d[0], d[1], d[2]);
        this.sd.push(sv[0], sv[1], sv[2]);
        this.g.push(gw);
      }
    }
    for (let row = 0; row < R; row++) {
      const a = base + row * 2;
      this.ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };
  Builder.prototype.toGeo = function (THREE) {
    const g = new THREE.BufferGeometry();
    const F = (a, k) => new THREE.BufferAttribute(new Float32Array(a), k);
    g.setAttribute('position', F(this.p, 3));
    g.setAttribute('normal', F(this.n, 3));
    g.setAttribute('uv', F(this.uv, 2));
    g.setAttribute('color', F(this.c, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', F(this.sw, 4));
    g.setAttribute('cOff', F(this.off, 3));
    g.setAttribute('cSide', F(this.sd, 3));
    g.setAttribute('cG', F(this.g, 1));
    const nv = this.p.length / 3;
    g.setIndex(new THREE.BufferAttribute(nv > 65535 ? new Uint32Array(this.ix) : new Uint16Array(this.ix), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.4);
    return g;
  }

  /* направление пучка в позе покоя: вниз по касательной, на руках — к кисти */
  function hangDir(s, r, arm) {
    const n = s.n;
    let d = arm ? nrm([Math.sign(s.p[0]) * 0.75, -0.55, (r() - 0.5) * 0.3]) : [(r() - 0.5) * 0.3, -1, (r() - 0.5) * 0.3];
    d = sub(d, mul(n, dot(d, n)));
    if (Math.hypot(d[0], d[1], d[2]) < 0.25) {
      const t = nrm(cross(n, [r() - 0.5, r() - 0.5, r() - 0.5]));
      d = add(mul(t, 0.8), [0, -0.3, 0]);
    }
    return nrm(add(nrm(d), mul(n, 0.1 + r() * 0.1)));
  }

  const cache = new Map();
  function geometry(THREE, geos, P, BI) {
    const kind = P.cover || 'none';
    if (kind === 'none' || !geos.shirt) return {};
    const scheme = SCHEMES[P.coverCol] ? P.coverCol : 'forest';
    const dens = densOf(P);
    const key = [kind, scheme, dens, P.head, P.armor || 'plate', !!P.mask].join('|');
    if (cache.has(key)) return { cover: cache.get(key) };
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const r = rng(kind === 'ghillie' ? 7711 : 4409);
    const G = kind === 'ghillie';
    const headSrc = geos.helmet || geos.hat || geos.mask || geos.skin;
    const face = (c) => c[2] < -0.05 && c[1] < 1.80 && Math.abs(c[0]) < 0.08;
    const pools = {
      head: triPool(headSrc, (c, n) => c[1] > (geos.helmet ? 1.70 : 1.68) && !face(c) && n[1] > -0.35),
      back: triPool(geos.vest || geos.shirt, (c, n) => c[2] > 0.0 && c[1] > 1.04 && c[1] < 1.56 && Math.abs(c[0]) < 0.24 && n[2] > 0.1),
      backS: triPool(geos.shirt, (c, n) => c[2] > 0.0 && c[1] > 0.98 && c[1] < 1.58 && Math.abs(c[0]) < 0.25 && n[2] > 0.2),
      shoulder: triPool(geos.shirt, (c, n) => c[1] > 1.40 && Math.abs(c[0]) > 0.1 && Math.abs(c[0]) < 0.33 && n[1] > 0.15),
      front: triPool(geos.vest || geos.shirt, (c, n) => c[2] < 0.0 && c[1] > 1.12 && c[1] < 1.5 && Math.abs(c[0]) < 0.2 && n[2] < -0.2),
      arm: triPool(geos.shirt, (c, n) => Math.abs(c[0]) > 0.3 && Math.abs(c[0]) < 0.66 && n[1] > -0.25),
      leg: triPool(geos.pants, (c, n) => c[1] > 0.30 && c[1] < 0.98 && (n[2] > -0.35 || Math.abs(n[0]) > 0.5))
    };
    /* на груди мало (по ней ползут), больше всего — голова, плечи, спина */
    const plan = G
      ? { head: 95, back: 120, backS: 60, shoulder: 85, front: 26, arm: 105, leg: 135 }
      : { head: 40, back: 64, backS: 34, shoulder: 52, front: 14, arm: 40, leg: 0 };
    const kD = DENSITY[dens - 1];
    const cols = SCHEMES[scheme].col.map((c) => c.map(lin));
    const ROWS = G ? 4 : 2;
    const specs = [];
    for (const reg in plan) {
      const pool = pools[reg];
      if (!pool) continue;
      const N = Math.round(plan[reg] * kD);
      for (let i = 0; i < N; i++) {
        const s = pick(pool, r);
        const arm = reg === 'arm', head = reg === 'head';
        s.p = add(s.p, mul(s.n, G ? 0.005 + r() * 0.007 : 0.007 + r() * 0.008));
        const dir = hangDir(s, r, arm);
        let side = nrm(cross(dir, s.n));
        const tw = (r() - 0.5) * (G ? 1.0 : 0.5);
        side = nrm(add(mul(side, Math.cos(tw)), mul(s.n, Math.sin(tw))));
        /* у лица на шлеме — короче: вуаль, а не шторка на глазах */
        const front = head && s.p[2] < -0.02;
        const L = G
          ? (head ? (front ? 0.05 + r() * 0.05 : 0.08 + r() * 0.1) : reg === 'leg' ? 0.12 + r() * 0.14 : reg === 'front' ? 0.08 + r() * 0.08 : 0.13 + r() * 0.15)
          : 0.06 + r() * 0.06;
        const W = G ? 0.03 + r() * 0.025 : 0.06 + r() * 0.04;
        const bend = G ? (head ? 0.006 + r() * 0.008 : 0.012 + r() * 0.018) : 0.003 + r() * 0.005;
        const c0 = cols[Math.floor(r() * cols.length)], j = 0.82 + r() * 0.34;
        const hug = head ? 0.13 : reg === 'shoulder' ? 0.22 : 0;
        const grav = G ? (head ? 0.45 : reg === 'shoulder' ? 0.75 : 0.88) : (head ? 0.15 : 0.35);
        specs.push({ s, o: { dir, side, L, W, bend, col: [c0[0] * j, c0[1] * j, c0[2] * j], hug, grav, rows: ROWS, u0: G ? (r() < 0.5 ? 0 : 0.5) : 0 } });
        if (!G) specs[specs.length - 1].o.u0 = 0;
      }
    }
    /* перемешать: любой префикс буфера — равномерная выборка по всему телу (LOD) */
    for (let i = specs.length - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); const t = specs[i]; specs[i] = specs[k]; specs[k] = t; }
    const B = new Builder();
    for (const sp of specs) B.card(sp.s, G ? sp.o : Object.assign(sp.o, { u0: 0 }));
    const geo = B.toGeo(THREE);
    /* у накидки u в [0;1] — вся текстура: поправить половинки */
    if (!G) { const uv = geo.attributes.uv.array; for (let i = 0; i < uv.length; i += 2) uv[i] *= 2; }
    geo.userData.coverKey = key;
    geo.userData.cards = specs.length;
    geo.userData.idxPerCard = ROWS * 6;
    cache.set(key, geo);
    if (typeof console !== 'undefined' && console.debug) console.debug('cover', key, geo.attributes.position.count, 'верш.', ((typeof performance !== 'undefined' ? performance.now() : 0) - t0).toFixed(0) + ' мс');
    return { cover: geo };
  }

  /* ------------------------------------------------------ шейдер --- */
  const V_PARS = `
attribute vec3 cOff;
attribute vec3 cSide;
attribute float cG;
uniform float uCvT;
uniform vec3 uCvVel;
#ifdef USE_SKINNING
vec3 cvQ(vec3 v, vec4 q) {
  vec3 b = (bindMatrix * vec4(v, 0.0)).xyz;
  b += 2.0 * cross(q.xyz, cross(q.xyz, b) + q.w * b);
  return (bindMatrixInverse * vec4(b, 0.0)).xyz;
}
vec3 cvM(vec3 v, mat4 m) { return (bindMatrixInverse * (m * (bindMatrix * vec4(v, 0.0)))).xyz; }
#endif`;
  /* после скиннинга: корень остаётся на месте, направление нити тянется
     к «вниз» (в осях объекта) с весом cG; внутрь тела — не даём */
  const V_MAIN = `
#ifdef USE_SKINNING
{
#ifdef AEGIS_DQS
  vec3 cvS = cvQ(cSide, dqR);
  vec3 cvO = cvQ(cOff - cSide, dqR);
#else
  vec3 cvS = cvM(cSide, skinMatrix);
  vec3 cvO = cvM(cOff - cSide, skinMatrix);
#endif
  vec3 cvRoot = transformed - cvO - cvS;
  float cvL = length(cvO);
  if (cvL > 1e-5 && cG > 0.001) {
    mat3 cvMM = mat3(modelMatrix);
    vec3 cvDn = normalize(-vec3(cvMM[0].y, cvMM[1].y, cvMM[2].y));
    vec3 cvN = normalize(objectNormal);
    /* бег: нити относит назад (скорость в осях объекта) */
    vec3 cvV = transpose(cvMM) * uCvVel;
    float cvSc = length(cvMM[0]);
    cvV /= max(cvSc * cvSc, 1e-6);
    vec3 r0 = position - cOff;
    float ph = dot(r0, vec3(37.0, 21.0, 53.0));
    vec3 cvH = cvDn - cvV * 0.11 + cross(cvDn, cvN) * sin(uCvT * 1.7 + ph) * 0.06;
    float into = dot(cvH, cvN);
    cvH = normalize(cvH - cvN * min(into, 0.0) + cvN * 0.18);
    vec3 cvD = normalize(mix(cvO / cvL, cvH, clamp(cG, 0.0, 1.0)));
    cvO = cvD * cvL;
    cvS -= cvD * dot(cvS, cvD);
  }
  transformed = cvRoot + cvO + cvS;
}
#endif`;
  /* нормаль поверхности под пучком без переворота на изнанке */
  const F_NORMAL = `
float faceDirection = 1.0;
vec3 normal = normalize( vNormal );
vec3 nonPerturbedNormal = normal;`;

  const texCacheT = new Map();
  function material(THREE, P) {
    const kind = P.cover || 'none';
    if (kind === 'none') return null;
    const G = kind === 'ghillie';
    let tex = texCacheT.get(kind);
    if (!tex) {
      tex = new THREE.CanvasTexture(G ? strandCanvas() : leafCanvas());
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 4;
      if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
      tex.userData.shared = true;
      tex.needsUpdate = true;
      texCacheT.set(kind, tex);
    }
    const m = new THREE.MeshStandardMaterial({
      map: tex, vertexColors: true, alphaTest: G ? 0.36 : 0.42, side: THREE.DoubleSide,
      roughness: 0.97, metalness: 0, envMapIntensity: 0.4
    });
    m.userData.cover = kind;
    const uVel = { value: new THREE.Vector3() };
    m.userData.uCvVel = uVel;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uCvT = TIME;
      sh.uniforms.uCvVel = uVel;
      sh.vertexShader = sh.vertexShader
        .replace('#include <skinning_pars_vertex>', '#include <skinning_pars_vertex>\n' + V_PARS)
        .replace('#include <displacementmap_vertex>', V_MAIN + '\n#include <displacementmap_vertex>');
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', F_NORMAL);
    };
    m.customProgramCacheKey = () => 'aegisCover27';
    return m;
  }

  /* ---------------------------------------------- LOD и движение --- */
  const TIME = { value: 0 };
  const TIER_K = { low: 0.6, medium: 0.8, high: 1, ultra: 1 };
  /* доля пучков по расстоянию до камеры (м) */
  function lodFrac(d) {
    if (d < 7) return 1;
    if (d < 18) return 1 - 0.45 * (d - 7) / 11;
    if (d < 40) return 0.55 - 0.3 * (d - 18) / 22;
    if (d < 80) return 0.25;
    return 0;
  }
  /* вешается на SkinnedMesh маскировки (14_character makeMeshes) */
  function attach(mesh) {
    const geo = mesh.geometry, cards = geo.userData.cards || 0, per = geo.userData.idxPerCard || 12;
    mesh.castShadow = false;
    mesh.userData.wcover = true;      // 29c_lod: карточки не упрощать
    const st = { t: -1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    mesh.onBeforeRender = function (renderer, scene, camera, g, mat) {
      const e = this.matrixWorld.elements;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
      TIME.value = now;
      if (st.t < 0) { st.t = now; st.x = e[12]; st.y = e[13]; st.z = e[14]; }
      const dt = now - st.t;
      if (dt > 0.008) {
        const k = 1 - Math.exp(-dt * 5), idt = 1 / Math.min(dt, 0.1);
        st.vx += ((e[12] - st.x) * idt - st.vx) * k; st.vy += ((e[13] - st.y) * idt - st.vy) * k; st.vz += ((e[14] - st.z) * idt - st.vz) * k;
        const sp = Math.hypot(st.vx, st.vy, st.vz);
        if (sp > 7) { const s = 7 / sp; st.vx *= s; st.vy *= s; st.vz *= s; }
        st.x = e[12]; st.y = e[13]; st.z = e[14]; st.t = now;
        const u = mat && mat.userData && mat.userData.uCvVel;
        if (u) u.value.set(st.vx, st.vy, st.vz);
      }
      if (!cards) return;
      const cp = camera.matrixWorld.elements;
      const d = Math.hypot(cp[12] - e[12], cp[13] - e[13], cp[14] - e[14]) * (camera.zoom > 1.5 ? 1 / camera.zoom : 1);
      const tier = TIER_K[(typeof self !== 'undefined' && self.AEGIS_QTIER) || 'high'] || 1;
      const n = d < 3.5 ? cards : Math.ceil(cards * Math.min(1, lodFrac(d) * tier));
      g.setDrawRange(0, n * per);
    };
  }

  return { SCHEMES, KINDS, DENSITY, DENSITY_NAMES, densOf, geometry, material, attach };
});
