/* ==========================================================================
   МОДУЛЬ: soldier/cover.js (v26)
   ==========================================================================
   Маскировка поверх снаряжения: «кикимора» (гилли — пучки джутовых нитей)
   и маскировочная накидка-сетка (лоскуты-«листья» на сетке).

   Дёшево: это не ткань и не физика, а плоские карточки с альфа-срезом
   (alphaTest, без сортировки прозрачности) — 3–5 тыс. вершин на бойца,
   один SkinnedMesh и один материал. Карточки ставятся в позе покоя на
   внешний слой бойца (шлем/панама/голова, плитоноска, китель, брюки) и
   получают веса скиннинга ближайшей вершины поверхности — поэтому
   двигаются вместе с телом без пересчёта на процессоре.

   Направление нитей задано в позе покоя: на корпусе и ногах — вниз, на
   руках (в Т-позе руки горизонтальны) — вдоль руки к кисти, т. е. вниз,
   когда руки опущены. Геометрия кэшируется по набору «маскировка × голова
   × броня × балаклава × расцветка».
   ========================================================================== */
(function (root, factory) {
  const C = factory(root.GUtil);
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  else root.GCover = C;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  /* расцветки (sRGB): лес, осень, степь (сухая трава), зима */
  const SCHEMES = {
    forest: { name: 'Лес', col: [[78, 86, 52], [96, 98, 60], [62, 70, 42], [112, 104, 70], [52, 58, 38], [88, 78, 52]] },
    autumn: { name: 'Осень', col: [[122, 100, 60], [98, 84, 52], [142, 120, 76], [80, 72, 46], [106, 94, 58], [70, 76, 48]] },
    steppe: { name: 'Степь', col: [[164, 148, 106], [142, 126, 88], [180, 166, 124], [122, 108, 76], [150, 140, 100]] },
    winter: { name: 'Зима', col: [[222, 224, 224], [202, 206, 208], [236, 236, 236], [184, 190, 194], [214, 214, 210]] }
  };
  const KINDS = { none: 'Нет', net: 'Маскировочная накидка', ghillie: 'Кикимора (гилли)' };

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
  function strandCanvas() {
    /* джут: 18 нитей сверху вниз, волнистые, разной длины и толщины, к концу —
       бахрома. Яркость 0,7–1 (цвет даёт вершина), альфа — сама нить. */
    if (texCanvas.strand) return texCanvas.strand;
    const W = 64, H = 256, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const r = rng(9137);
    g.clearRect(0, 0, W, H);
    g.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const x0 = 4 + r() * (W - 8), len = H * (0.55 + 0.45 * r()), w = 1.6 + r() * 2.6;
      const l = Math.round(170 + r() * 85);
      g.strokeStyle = 'rgb(' + l + ',' + l + ',' + l + ')';
      let x = x0, y = 0;
      const ph = r() * 6.28, amp = 1 + r() * 3;
      for (let k = 1; k <= 16; k++) {
        const t = k / 16, nx = x0 + Math.sin(ph + t * 7) * amp * t + (r() - 0.5) * 1.2, ny = len * t;
        g.lineWidth = w * (1 - 0.55 * t);
        g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        x = nx; y = ny;
      }
    }
    /* корень пучка: плотная полоса сверху — карточка «сидит» на ткани */
    const gr = g.createLinearGradient(0, 0, 0, 22);
    gr.addColorStop(0, 'rgba(200,200,200,1)'); gr.addColorStop(1, 'rgba(200,200,200,0)');
    g.fillStyle = gr; g.fillRect(6, 0, W - 12, 22);
    texCanvas.strand = c;
    return c;
  }
  function leafCanvas() {
    /* накидка: сетка ячейкой ~2 см и лоскуты-«листья» трёх оттенков */
    if (texCanvas.leaf) return texCanvas.leaf;
    const S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const r = rng(5521);
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgb(150,150,150)'; g.lineWidth = 1.4;
    for (let k = -S; k < 2 * S; k += 14) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke();
      g.beginPath(); g.moveTo(k, S); g.lineTo(k + S, 0); g.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const x = r() * S, y = r() * S, rx = 8 + r() * 14, ry = 5 + r() * 9, a = r() * 3.14;
      const l = Math.round(150 + r() * 105);
      g.fillStyle = 'rgb(' + l + ',' + l + ',' + l + ')';
      g.beginPath();
      for (let k = 0; k <= 18; k++) {
        const t = k / 18 * Math.PI * 2, jag = 1 + (k % 2 ? -0.22 : 0.12) * r();
        const px = Math.cos(t) * rx * jag, py = Math.sin(t) * ry * jag;
        const qx = x + px * Math.cos(a) - py * Math.sin(a), qy = y + px * Math.sin(a) + py * Math.cos(a);
        if (k) g.lineTo(qx, qy); else g.moveTo(qx, qy);
      }
      g.fill();
    }
    /* края карточки — рваные: без прямых срезов в силуэте */
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 40; i++) {
      const side = i % 4, t = r() * S, rr = 3 + r() * 7;
      const x = side === 0 ? 0 : side === 1 ? S : t, y = side === 2 ? 0 : side === 3 ? S : t;
      g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    texCanvas.leaf = c;
    return c;
  }

  /* --------------------------------------------------- выборка точек --- */
  /* треугольники источника, прошедшие фильтр по центру; выборка по площади */
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
    /* веса — от ближайшей вершины треугольника */
    const k = (1 - u - v) >= Math.max(u, v) ? T[0] : u >= v ? T[1] : T[2];
    return { p, n: T[6], v: k, geo: pool.geo };
  }

  /* ------------------------------------------------------ карточки --- */
  function Builder() { this.p = []; this.n = []; this.uv = []; this.c = []; this.si = []; this.sw = []; this.ix = []; }
  /* hug — радиус кривизны опоры (шлем, плечо): нить ложится по ней, а не
     торчит по касательной; droop — провис под весом к концу */
  Builder.prototype.card = function (s, dir, side, L, Wd, bend, col, hug, droop, rows) {
    const si = s.geo.attributes.skinIndex, sw = s.geo.attributes.skinWeight;
    const idx = [si.getX(s.v), si.getY(s.v), si.getZ(s.v), si.getW(s.v)];
    const wts = [sw.getX(s.v), sw.getY(s.v), sw.getZ(s.v), sw.getW(s.v)];
    const base = this.p.length / 3;
    const n = s.n, R = rows || 2;
    for (let row = 0; row <= R; row++) {
      const t = row / R, a = L * t;
      /* дуга: середина отходит от поверхности, конец свисает */
      const out = bend * Math.sin(t * Math.PI * 0.9) - (hug ? (a * a) / (2 * hug) : 0);
      let c = add(add(s.p, mul(dir, a)), mul(n, out));
      if (droop) c[1] -= droop * t * t;
      const hw = Wd * (1 - 0.25 * t);
      for (const sg of [-1, 1]) {
        const q = add(c, mul(side, hw * 0.5 * sg));
        this.p.push(q[0], q[1], q[2]);
        this.n.push(n[0], n[1], n[2]);
        this.uv.push(sg < 0 ? 0 : 1, t);
        this.c.push(col[0], col[1], col[2]);
        this.si.push(idx[0], idx[1], idx[2], idx[3]);
        this.sw.push(wts[0], wts[1], wts[2], wts[3]);
      }
    }
    for (let row = 0; row < R; row++) {
      const a = base + row * 2;
      this.ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };
  Builder.prototype.toGeo = function (THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(this.sw), 4));
    const nv = this.p.length / 3;
    g.setIndex(new THREE.BufferAttribute(nv > 65535 ? new Uint32Array(this.ix) : new Uint16Array(this.ix), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.3);
    return g;
  };

  /* куда свисает карточка: вниз по касательной, на руках — к кисти */
  function hangDir(s, r, arm) {
    const n = s.n;
    let d = arm ? nrm([Math.sign(s.p[0]) * 0.8, -0.45, (r() - 0.5) * 0.3]) : [(r() - 0.5) * 0.35, -1, (r() - 0.5) * 0.35];
    d = sub(d, mul(n, dot(d, n)));
    if (Math.hypot(d[0], d[1], d[2]) < 0.25) {
      /* верх шлема и плеч: нить ложится по поверхности в случайную сторону */
      const t = nrm(cross(n, [r() - 0.5, r() - 0.5, r() - 0.5]));
      d = add(mul(t, 0.8), [0, -0.3, 0]);
    }
    return nrm(add(nrm(d), mul(n, 0.12 + r() * 0.12)));
  }

  const cache = new Map();
  function geometry(THREE, geos, P, BI) {
    const kind = P.cover || 'none';
    if (kind === 'none' || !geos.shirt) return {};
    const scheme = SCHEMES[P.coverCol] ? P.coverCol : 'forest';
    const key = [kind, scheme, P.head, P.armor || 'plate', !!P.mask].join('|');
    if (cache.has(key)) return { cover: cache.get(key) };
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const r = rng(kind === 'ghillie' ? 7711 : 4409);
    const G = kind === 'ghillie';
    /* внешний слой головы: шлем → панама → балаклава/кожа (лицо открыто) */
    const headSrc = geos.helmet || geos.hat || geos.mask || geos.skin;
    const face = (c) => c[2] < -0.055 && c[1] < 1.79 && Math.abs(c[0]) < 0.075;
    const pools = {
      head: triPool(headSrc, (c, n) => c[1] > (geos.helmet ? 1.70 : 1.68) && !face(c) && n[1] > -0.35),
      back: triPool(geos.vest || geos.shirt, (c, n) => c[2] > 0.0 && c[1] > 1.06 && c[1] < 1.56 && Math.abs(c[0]) < 0.24 && n[2] > 0.1),
      backS: triPool(geos.shirt, (c, n) => c[2] > 0.0 && c[1] > 1.02 && c[1] < 1.58 && Math.abs(c[0]) < 0.25 && n[2] > 0.2),
      shoulder: triPool(geos.shirt, (c, n) => c[1] > 1.40 && Math.abs(c[0]) > 0.1 && Math.abs(c[0]) < 0.33 && n[1] > 0.15),
      front: triPool(geos.vest || geos.shirt, (c, n) => c[2] < 0.0 && c[1] > 1.12 && c[1] < 1.5 && Math.abs(c[0]) < 0.2 && n[2] < -0.2),
      arm: triPool(geos.shirt, (c, n) => Math.abs(c[0]) > 0.3 && Math.abs(c[0]) < 0.68 && n[1] > -0.2),
      leg: triPool(geos.pants, (c, n) => c[1] > 0.34 && c[1] < 0.96 && (n[2] > -0.35 || Math.abs(n[0]) > 0.5))
    };
    const plan = G
      ? { head: 110, back: 120, backS: 70, shoulder: 90, front: 46, arm: 120, leg: 150 }
      : { head: 46, back: 60, backS: 34, shoulder: 54, front: 18, arm: 40, leg: 0 };
    const cols = SCHEMES[scheme].col.map((c) => c.map(lin));
    const B = new Builder();
    for (const reg in plan) {
      const pool = pools[reg];
      if (!pool) continue;
      for (let i = 0; i < plan[reg]; i++) {
        const s = pick(pool, r);
        const arm = reg === 'arm';
        const off = G ? 0.006 + r() * 0.008 : 0.008 + r() * 0.01;
        s.p = add(s.p, mul(s.n, off));
        let dir = hangDir(s, r, arm);
        let side = nrm(cross(dir, s.n));
        /* поворот карточки вокруг нити: часть смотрит вбок — объём в силуэте */
        const tw = (r() - 0.5) * (G ? 1.6 : 0.6);
        side = nrm(add(mul(side, Math.cos(tw)), mul(s.n, Math.sin(tw))));
        const head = reg === 'head';
        const L = G ? (head ? 0.06 + r() * 0.08 : reg === 'leg' ? 0.08 + r() * 0.1 : 0.09 + r() * 0.1) : 0.05 + r() * 0.05;
        const Wd = G ? 0.024 + r() * 0.02 : 0.05 + r() * 0.035;
        const bend = G ? (head ? 0.006 + r() * 0.01 : 0.012 + r() * 0.02) : 0.004 + r() * 0.006;
        const c0 = cols[Math.floor(r() * cols.length)], j = 0.85 + r() * 0.3;
        /* на голове и плечах нить облегает опору (радиус ~13 / 20 см) и провисает */
        const hug = head ? 0.13 : reg === 'shoulder' ? 0.2 : 0;
        B.card(s, dir, side, L, Wd, bend, [c0[0] * j, c0[1] * j, c0[2] * j], hug, G ? L * 0.22 : 0, G ? 3 : 2);
      }
    }
    const geo = B.toGeo(THREE);
    geo.userData.coverKey = key;
    cache.set(key, geo);
    if (typeof console !== 'undefined') console.info('cover', key, geo.attributes.position.count, 'верш.', ((typeof performance !== 'undefined' ? performance.now() : 0) - t0).toFixed(0) + ' мс');
    return { cover: geo };
  }

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
      map: tex, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide,
      roughness: 0.96, metalness: 0, envMapIntensity: 0.45
    });
    m.userData.cover = kind;
    return m;
  }

  return { SCHEMES, KINDS, geometry, material };
});
