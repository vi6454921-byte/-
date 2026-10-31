/* ==========================================================================
   AEGIS v26 · маскировка оружия (js/kit/wcover.js)
   ==========================================================================
   Как в жизни: на цевьё и приклад наматывают маскировочную сетку
   (скрим-сеть с лоскутами ткани, «вуаль снайпера») или «кикимору» —
   пучки джутовых нитей на сетчатой основе. Прицельная линия, ствольная
   коробка, окно выброса, магазин, рукоятка и дульное устройство остаются
   открытыми: сетка только там, где её привязывают на оружии.

   Устроено дёшево (слабые ПК):
   • оболочка — «чулок» по форме детали: срезы вдоль оси, в каждом —
     суперэллипс, в который гарантированно помещаются все вершины детали
     (+4 мм); нити и хвосты сетки — плоские карточки с альфа-срезом;
   • 2 общих материала (сеть, нити) на всё оружие игры, цвет — в вершинах
     (расцветки как у маскировки бойцов: лес, осень, степь, зима);
   • сетки кэшируются по «образец × деталь × вид × расцветка»; без теней,
     без пересчёта на процессоре: чулок — дочерний узел детали и
     двигается вместе с ней (складной приклад, цевьё помпы);
   • лучи (прицеливание оружейной, подбор модуля мышью) сквозь неё
     проходят; дальний заменитель (29c_lod) её не берёт — вдали прячется.

   Система координат — как у сборки оружейной: мм, +X к дулу, +Y вверх.
   ========================================================================== */
(function (root) {
  'use strict';
  const THREE = root.THREE;
  if (!THREE) return;

  /* расцветки (sRGB) — те же, что у маскировки бойца (13b_soldier_cover) */
  const SCHEMES = {
    forest: { name: 'Лес', col: [[78, 86, 52], [96, 98, 60], [62, 70, 42], [112, 104, 70], [52, 58, 38], [88, 78, 52]] },
    autumn: { name: 'Осень', col: [[122, 100, 60], [98, 84, 52], [142, 120, 76], [80, 72, 46], [106, 94, 58], [70, 76, 48]] },
    steppe: { name: 'Степь', col: [[164, 148, 106], [142, 126, 88], [180, 166, 124], [122, 108, 76], [150, 140, 100]] },
    winter: { name: 'Зима', col: [[222, 224, 224], [202, 206, 208], [236, 236, 236], [184, 190, 194], [214, 214, 210]] }
  };
  const KINDS = { none: 'Нет', net: 'Сеть', ghillie: 'Кикимора' };

  /* где наматывают: деталь-слот (чулок крепится к ней) или участок основы
     (интегральное цевьё SCAR, AR-15 из GLB) — x/y в мм системы сборки */
  const ZONES = {
    akm: [{ slot: 'handguard', role: 'hg' }, { slot: 'stock', role: 'stock' }],
    ak74: [{ slot: 'handguard', role: 'hg' }, { slot: 'stock', role: 'stock' }],
    m416: [{ slot: 'handguard', role: 'hg' }, { slot: 'stock', role: 'stock' }],
    svd: [{ slot: 'handguard', role: 'hg' }, { slot: 'stock', role: 'stock' }],
    mp5a3: [{ slot: 'handguard', role: 'hg' }, { slot: 'stock', role: 'stock' }],
    m870: [{ slot: 'forend', role: 'hg' }, { slot: 'stock', role: 'stock' }],
    scar: [{ base: true, x: [118, 330], y: [-40, 40], role: 'hg' }, { slot: 'stock', role: 'stock' }],
    ar15m4: [{ base: true, x: [62, 236], y: [-34, 26], role: 'hg' }, { base: true, x: [-372, -196], y: [-120, 40], role: 'stock' }]
  };
  const supports = (wid) => !!ZONES[wid];

  /* --------------------------------------------------------- утилиты --- */
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const lin = (v) => Math.pow(v / 255, 2.2);
  const spow = (t, e) => Math.sign(t) * Math.pow(Math.abs(t), e);

  /* ------------------------------------------------------- текстуры --- */
  const canv = {};
  /* сеть: ромбическая ячейка ~9 мм, узлы, рваные лоскуты ткани (скрим);
     яркость 0,55–0,95, цвет даёт вершина; альфа — шнур и ткань */
  function netCanvas() {
    if (canv.net) return canv.net;
    const S = 256, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d'), R = rng(4242);
    g.clearRect(0, 0, S, S);
    const rag = (x, y, L, W, a, v) => {
      g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      const ca = Math.cos(a), sa = Math.sin(a), pts = [], n = 9;
      for (let i = 0; i <= n; i++) { const t = i / n - 0.5; pts.push([t * L, -W * 0.5 * (0.7 + R() * 0.6)]); }
      for (let i = n; i >= 0; i--) { const t = i / n - 0.5; pts.push([t * L, W * 0.5 * (0.7 + R() * 0.6)]); }
      for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
        if (x + ox < -L || x + ox > S + L || y + oy < -L || y + oy > S + L) continue;
        g.beginPath();
        pts.forEach((p, i) => { const px = x + ox + p[0] * ca - p[1] * sa, py = y + oy + p[0] * sa + p[1] * ca; if (i) g.lineTo(px, py); else g.moveTo(px, py); });
        g.closePath(); g.fill();
      }
    };
    /* шнур сетки */
    const P = 32;
    g.lineCap = 'round';
    g.strokeStyle = 'rgb(196,196,196)'; g.lineWidth = 2.6;
    for (let k = -S; k <= 2 * S; k += P) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke();
      g.beginPath(); g.moveTo(k, S); g.lineTo(k + S, 0); g.stroke();
    }
    g.fillStyle = 'rgb(160,160,160)';
    for (let y = 0; y <= S; y += P / 2) for (let x = 0; x <= S; x += P / 2) {
      if (((x + y) / (P / 2)) % 2) continue;
      g.beginPath(); g.arc(x, y, 3.2, 0, 6.283); g.fill();
    }
    /* лоскуты: полосы ткани, привязанные к сетке, ~40 % площади */
    for (let i = 0; i < 30; i++) rag(R() * S, R() * S, 26 + R() * 44, 9 + R() * 12, R() * Math.PI, Math.round(135 + R() * 110));
    canv.net = c;
    return c;
  }
  /* джут: пучок из 18 нитей от корня (v = 0) вниз, к концу — тоньше */
  function strandCanvas() {
    if (canv.strand) return canv.strand;
    const W = 64, H = 256, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d'), r = rng(9137);
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
    const gr = g.createLinearGradient(0, 0, 0, 22);
    gr.addColorStop(0, 'rgba(200,200,200,1)'); gr.addColorStop(1, 'rgba(200,200,200,0)');
    g.fillStyle = gr; g.fillRect(6, 0, W - 12, 22);
    canv.strand = c;
    return c;
  }
  const mats = {};
  function material(kind) {
    if (mats[kind]) return mats[kind];
    if (typeof document === 'undefined') return null;
    const t = new THREE.CanvasTexture(kind === 'strand' ? strandCanvas() : netCanvas());
    t.wrapS = t.wrapT = kind === 'strand' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.anisotropy = 4;
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    t.userData.shared = true;
    /* те же параметры, что у маскировки бойца — общая программа шейдера */
    const m = new THREE.MeshStandardMaterial({ map: t, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.96, metalness: 0, envMapIntensity: 0.45 });
    m.name = 'wcover_' + kind;
    m.userData.shared = true;
    m.userData.wcover = kind;
    /* нити и хвосты — пучки волокон, свет рассеивают во все стороны: нормаль карточки
       общая для обеих сторон (без разворота к камере), наклонена вверх — сверху освещены,
       как настоящая джутовая нить; иначе при верхнем свете висящие карточки чернели */
    m.onBeforeCompile = (sh) => {
      const nb = THREE.ShaderChunk.normal_fragment_begin;
      if (nb && nb.indexOf('normal *= faceDirection;') >= 0) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', nb.replace('normal *= faceDirection;', ''));
    };
    m.customProgramCacheKey = () => 'wcover-nf';
    return (mats[kind] = m);
  }

  /* ---------------------------------------------- сбор геометрии --- */
  class Builder {
    constructor() { this.P = []; this.N = []; this.U = []; this.C = []; this.I = []; this.n = 0; }
    v(p, nr, u, w, c) { this.P.push(p[0], p[1], p[2]); this.N.push(nr[0], nr[1], nr[2]); this.U.push(u, w); this.C.push(c[0], c[1], c[2]); return this.n++; }
    quad(a, b, c, d) { this.I.push(a, b, d, a, d, c); }
    toGeo() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
      g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      return g;
    }
  }

  /* точки детали в системе узла host (мм) */
  function zonePoints(host, meshes, z) {
    const out = [], v = new THREE.Vector3(), M = new THREE.Matrix4();
    const toRoot = root.AEGIS_WK && root.AEGIS_WK.toRoot;
    for (const o of meshes) {
      const pos = o.geometry && o.geometry.attributes.position;
      if (!pos) continue;
      if (toRoot) M.copy(toRoot(o, host));
      else { host.updateMatrixWorld(true); M.copy(host.matrixWorld).invert().multiply(o.matrixWorld); }
      const step = pos.count > 40000 ? 3 : pos.count > 15000 ? 2 : 1;
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(M);
        if (z && z.x && (v.x < z.x[0] || v.x > z.x[1])) continue;
        if (z && z.y && (v.y < z.y[0] || v.y > z.y[1])) continue;
        out.push(v.x, v.y, v.z);
      }
    }
    return out;
  }

  /* профиль «чулка»: срезы вдоль X, в каждом центр и полуоси суперэллипса
     (степень E), в который помещаются все точки среза; затем сглаживание */
  const E = 4, MARGIN = 4;
  function profile(pts) {
    const n = pts.length / 3;
    if (n < 12) return null;
    const xs = new Float32Array(n);
    for (let i = 0; i < n; i++) xs[i] = pts[i * 3];
    const sorted = Array.from(xs).sort((a, b) => a - b);
    const x0 = sorted[Math.floor(n * 0.004)], x1 = sorted[Math.min(n - 1, Math.ceil(n * 0.996))];
    const len = x1 - x0;
    if (len < 30) return null;
    const K = Math.max(6, Math.min(44, Math.round(len / 9)));
    const yl = new Float32Array(K).fill(Infinity), yh = new Float32Array(K).fill(-Infinity), zl = new Float32Array(K).fill(Infinity), zh = new Float32Array(K).fill(-Infinity);
    const bin = (x) => Math.max(0, Math.min(K - 1, Math.floor((x - x0) / len * K)));
    for (let i = 0; i < n; i++) {
      const x = pts[i * 3]; if (x < x0 || x > x1) continue;
      const k = bin(x), y = pts[i * 3 + 1], z = pts[i * 3 + 2];
      if (y < yl[k]) yl[k] = y; if (y > yh[k]) yh[k] = y; if (z < zl[k]) zl[k] = z; if (z > zh[k]) zh[k] = z;
    }
    /* пустые срезы (просвет в каркасном прикладе) — по соседям */
    for (let k = 0; k < K; k++) if (yl[k] === Infinity) {
      let a = k - 1, b = k + 1;
      while (a >= 0 && yl[a] === Infinity) a--;
      while (b < K && yl[b] === Infinity) b++;
      const src = a >= 0 ? a : b;
      if (src < 0 || src >= K) return null;
      yl[k] = yl[src]; yh[k] = yh[src]; zl[k] = zl[src]; zh[k] = zh[src];
    }
    const S = [];
    for (let k = 0; k < K; k++) S.push({ cy: (yl[k] + yh[k]) / 2, cz: (zl[k] + zh[k]) / 2, ry: Math.max(3, (yh[k] - yl[k]) / 2), rz: Math.max(3, (zh[k] - zl[k]) / 2), q: 1 });
    /* все точки внутри суперэллипса: масштаб по худшей точке среза */
    for (let i = 0; i < n; i++) {
      const x = pts[i * 3]; if (x < x0 || x > x1) continue;
      const s = S[bin(x)], dy = Math.abs(pts[i * 3 + 1] - s.cy) / s.ry, dz = Math.abs(pts[i * 3 + 2] - s.cz) / s.rz;
      const q = Math.pow(Math.pow(dy, E) + Math.pow(dz, E), 1 / E);
      if (q > s.q) s.q = q;
    }
    for (const s of S) { s.ry *= s.q; s.rz *= s.q; }
    /* без «ступенек»: максимум соседей, затем среднее */
    const mx = S.map((s, k) => {
      const a = S[Math.max(0, k - 1)], b = S[Math.min(K - 1, k + 1)];
      const top = Math.max(a.cy + a.ry, s.cy + s.ry, b.cy + b.ry), bot = Math.min(a.cy - a.ry, s.cy - s.ry, b.cy - b.ry);
      const rgt = Math.max(a.cz + a.rz, s.cz + s.rz, b.cz + b.rz), lft = Math.min(a.cz - a.rz, s.cz - s.rz, b.cz - b.rz);
      return { cy: (top + bot) / 2, cz: (rgt + lft) / 2, ry: (top - bot) / 2, rz: (rgt - lft) / 2 };
    });
    const out = mx.map((s, k) => {
      const a = mx[Math.max(0, k - 1)], b = mx[Math.min(K - 1, k + 1)];
      return { x: x0 + (k + 0.5) / K * len, cy: (a.cy + 2 * s.cy + b.cy) / 4, cz: (a.cz + 2 * s.cz + b.cz) / 4, ry: Math.max(s.ry, (a.ry + 2 * s.ry + b.ry) / 4) + MARGIN, rz: Math.max(s.rz, (a.rz + 2 * s.rz + b.rz) / 4) + MARGIN };
    });
    out.x0 = x0; out.x1 = x1;
    return out;
  }

  /* точка и нормаль чулка: φ = 0 сверху, π/2 — справа (+Z), π — снизу */
  function ringAt(s, phi, out, nOut) {
    const c = Math.cos(phi), sn = Math.sin(phi), e = 2 / E;
    const y = s.cy + s.ry * spow(c, e), z = s.cz + s.rz * spow(sn, e);
    out[0] = s.x; out[1] = y; out[2] = z;
    if (nOut) {
      /* нормаль суперэллипса: градиент |y/ry|^E + |z/rz|^E */
      const ny = Math.sign(c) * Math.pow(Math.abs(c), 2 - e) / s.ry, nz = Math.sign(sn) * Math.pow(Math.abs(sn), 2 - e) / s.rz;
      const l = Math.hypot(ny, nz) || 1;
      nOut[0] = 0; nOut[1] = ny / l; nOut[2] = nz / l;
    }
    return out;
  }
  function lerpS(S, t) {
    const f = Math.max(0, Math.min(S.length - 1.001, t * (S.length - 1))), i = Math.floor(f), k = f - i, a = S[i], b = S[i + 1];
    return { x: a.x + (b.x - a.x) * k, cy: a.cy + (b.cy - a.cy) * k, cz: a.cz + (b.cz - a.cz) * k, ry: a.ry + (b.ry - a.ry) * k, rz: a.rz + (b.rz - a.rz) * k };
  }

  const TILE = 70;   // мм на период сетки
  /* чулок: кольца по срезам, концы чуть стянуты (привязано шнуром) */
  function sleeve(B, S, R, cols, dark) {
    const M = 18, K = S.length, rings = [];
    const p = [0, 0, 0], nr = [0, 0, 0];
    /* крупные цветовые пятна расцветки: случайный цвет на узлах грубой решётки */
    const GU = 6, GV = Math.max(2, Math.round(K / 4) + 1), grid = [];
    for (let i = 0; i < GU * GV; i++) grid.push(cols[Math.floor(R() * cols.length)]);
    const colAt = (u, v) => {
      const fu = u * GU, fv = v * (GV - 1), iu = Math.floor(fu), iv = Math.min(GV - 2, Math.floor(fv)), tu = fu - iu, tv = fv - iv;
      const g = (a, b) => grid[((a % GU) + GU) % GU + Math.min(GV - 1, b) * GU];
      const c00 = g(iu, iv), c10 = g(iu + 1, iv), c01 = g(iu, iv + 1), c11 = g(iu + 1, iv + 1), o = [0, 0, 0];
      for (let j = 0; j < 3; j++) o[j] = ((c00[j] * (1 - tu) + c10[j] * tu) * (1 - tv) + (c01[j] * (1 - tu) + c11[j] * tu) * tv);
      return o;
    };
    const per = 2 * Math.PI * Math.sqrt((S[0].ry * S[0].ry + S[0].rz * S[0].rz) / 2);
    const cyc = Math.max(1, Math.round(per / TILE));
    for (let k = 0; k < K; k++) {
      const s = Object.assign({}, S[k]);
      const end = k === 0 || k === K - 1 ? 0.9 : 1;
      s.ry *= end; s.rz *= end;
      const ring = [];
      let first = null;
      for (let j = 0; j <= M; j++) {
        const phi = (j / M) * Math.PI * 2;
        ringAt(s, phi, p, nr);
        /* складки ткани, снизу — провис; шов (j = M) повторяет j = 0 */
        const d = j === M ? first : { wob: (R() - 0.5) * 1.6 + (Math.cos(phi) < -0.3 ? 1.4 * R() : 0), dx: (R() - 0.5) * 1.2, jj: dark ? 0.68 + R() * 0.17 : 0.85 + R() * 0.25 };
        if (j === 0) first = d;
        const q = [p[0] + d.dx, p[1] + nr[1] * d.wob, p[2] + nr[2] * d.wob];
        const c = colAt(j / M, k / Math.max(1, K - 1));
        ring.push(B.v(q, nr, (j / M) * cyc, s.x / TILE, [lin(c[0] * d.jj), lin(c[1] * d.jj), lin(c[2] * d.jj)]));
      }
      rings.push(ring);
    }
    for (let k = 0; k < K - 1; k++) for (let j = 0; j < M; j++) B.quad(rings[k][j], rings[k][j + 1], rings[k + 1][j], rings[k + 1][j + 1]);
  }

  /* нормаль карточки: своя (к лицевой стороне) + наклон вверх; лицевая сторона — та, что смотрит наружу/вверх */
  function upN(n) {
    let l = Math.hypot(n[0], n[1], n[2]) || 1;
    let x = n[0] / l, y = n[1] / l, z = n[2] / l;
    if (y < 0) { x = -x; y = -y; z = -z; }
    x *= 0.5; y = y * 0.5 + 0.8; z *= 0.5;
    l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  }
  /* карточка по ломаной: точки pts (оси), вектор ширины w, uv по длине */
  function card(B, pts, w, width, col, u0, u1, vScale) {
    const rows = [];
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      let n = [t[1] * w[2] - t[2] * w[1], t[2] * w[0] - t[0] * w[2], t[0] * w[1] - t[1] * w[0]];
      n = upN(n);
      const h = width * 0.5 * (1 - 0.25 * i / (pts.length - 1)), p = pts[i];
      const v = vScale ? acc / vScale : i / (pts.length - 1);
      rows.push([B.v([p[0] - w[0] * h, p[1] - w[1] * h, p[2] - w[2] * h], n, u0, v, col), B.v([p[0] + w[0] * h, p[1] + w[1] * h, p[2] + w[2] * h], n, u1, v, col)]);
    }
    for (let i = 0; i < rows.length - 1; i++) B.quad(rows[i][0], rows[i][1], rows[i + 1][0], rows[i + 1][1]);
  }

  /* хвост сетки: ширина сужается к концу до taper, текстура сети — в мм */
  function cardT(B, pts, w, width, col, u0, tile, taper) {
    const rows = [];
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      let n = [t[1] * w[2] - t[2] * w[1], t[2] * w[0] - t[0] * w[2], t[0] * w[1] - t[1] * w[0]];
      n = upN(n);
      const k = i / (pts.length - 1), h = width * 0.5 * (1 - (1 - taper) * k), p = pts[i];
      rows.push([B.v([p[0] - w[0] * h, p[1] - w[1] * h, p[2] - w[2] * h], n, u0 - h / tile, acc / tile, col), B.v([p[0] + w[0] * h, p[1] + w[1] * h, p[2] + w[2] * h], n, u0 + h / tile, acc / tile, col)]);
    }
    for (let i = 0; i < rows.length - 1; i++) B.quad(rows[i][0], rows[i][1], rows[i + 1][0], rows[i + 1][1]);
  }

  /* нить, переброшенная через деталь: от корня по поверхности к боку,
     дальше висит вниз (снизу и с нижней половины — сразу вниз) */
  function drape(S, t0, phi0, L, side, R) {
    const s0 = lerpS(S, t0), p = [0, 0, 0], nr = [0, 0, 0];
    const Ravg = (s0.ry + s0.rz) / 2, off = 1.5 + R() * 1.5, sway = (R() - 0.5) * 0.5, out = 0.12 + 0.1 * R();
    const lim = side > 0 ? Math.PI * 0.55 : Math.PI * 1.45;
    if (side < 0 && phi0 < Math.PI) phi0 += Math.PI * 2;
    const onLen = Math.max(0, Math.min(L, (side > 0 ? lim - phi0 : phi0 - lim) * Ravg));
    const at = (s) => { ringAt(s0, phi0 + side * s / Ravg, p, nr); return [p[0] + sway * s * 0.4, p[1] + nr[1] * off, p[2] + nr[2] * off]; };
    const h = at(onLen), pts = [], NP = 5;
    for (let i = 0; i < NP; i++) {
      const s = (i / (NP - 1)) * L;
      if (s <= onLen) { pts.push(at(s)); continue; }
      const d = s - onLen;
      pts.push([h[0] + sway * d * 0.5, h[1] - d, h[2] + side * d * out]);
    }
    return pts;
  }

  function zoneGeo(S, kind, role, cols, seed) {
    const R = rng(seed), B = new Builder();
    const len = S[S.length - 1].x - S[0].x;
    sleeve(B, S, R, cols, kind === 'ghillie');
    const sleeveIdx = B.I.length;
    const C = (j) => { const c = cols[Math.floor(R() * cols.length)]; return [lin(c[0] * j), lin(c[1] * j), lin(c[2] * j)]; };
    if (kind === 'ghillie') {
      /* пучки: плотность ~1 на 3 см² поверхности (основа почти не видна); на прикладе — не на гребне (щека) */
      const per = 2 * Math.PI * Math.sqrt((S[0].ry * S[0].ry + S[0].rz * S[0].rz) / 2);
      const n = Math.round(Math.min(260, len * per / 290));
      const p = [0, 0, 0], nr = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        const t = 0.04 + R() * 0.92;
        /* четверть пучков лежит вдоль оружия (привязаны за середину) — объём и рваный силуэт */
        /* на прикладе — только по бокам (гребень под щёку свободен) */
        if (R() < (role === 'stock' ? 0.25 : 0.4)) {
          const s0 = lerpS(S, t), dir = R() < 0.5 ? 1 : -1, L = 26 + R() * 40, pts = [];
          const phi = role === 'stock' ? (R() < 0.5 ? 1 : -1) * (1.0 + R() * 1.0) : (R() - 0.5) * 2.2;
          for (let k = 0; k < 4; k++) {
            const d = (k / 3) * L, ph = phi + (R() - 0.5) * 0.25;
            ringAt(lerpS(S, Math.max(0, Math.min(1, t + dir * d / Math.max(1, len)))), ph, p, nr);
            const lift = 1.5 + k * (0.6 + R() * 1.4);
            pts.push([p[0], p[1] + nr[1] * lift, p[2] + nr[2] * lift]);
          }
          void s0;
          const tw = (R() - 0.5) * 0.8;
          card(B, pts, [0, Math.sin(tw) * 0.3, Math.cos(tw)], 12 + R() * 10, C(0.85 + R() * 0.3), 0, 1, 0);
          continue;
        }
        let phi;
        if (role === 'stock') phi = (R() < 0.5 ? 1 : -1) * (0.95 + R() * 1.9);
        else phi = (R() - 0.5) * 2 * (R() < 0.6 ? 1.2 : 3.0);
        const side = Math.abs(Math.sin(phi)) < 0.05 ? (R() < 0.5 ? 1 : -1) : Math.sign(Math.sin(phi));
        const phiN = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        /* как у настоящей обмотки: больше коротких и средних нитей, длинные — редкие */
        const q = R();
        const L = role === 'stock' ? 22 + R() * 38 : (q < 0.35 ? 18 + R() * 18 : q < 0.85 ? 34 + R() * 30 : 60 + R() * 36);
        const pts = drape(S, t, phiN, L, side, R);
        const tw = (R() - 0.5) * 1.6;
        card(B, pts, [Math.cos(tw), 0, Math.sin(tw)], 14 + R() * 12, C(0.85 + R() * 0.3), 0, 1, 0);
      }
    } else {
      /* хвосты сетки: 2–4 рваных конца свисают снизу и с боков, сужаются книзу */
      const n = role === 'stock' ? 1 + Math.floor(R() * 2) : 2 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        const t = 0.12 + R() * 0.76, s = lerpS(S, t), side = R() < 0.5 ? 1 : -1;
        const phi = side > 0 ? Math.PI * (0.62 + R() * 0.3) : Math.PI * (1.08 + R() * 0.3);
        const p = [0, 0, 0], nr = [0, 0, 0];
        ringAt(s, phi, p, nr);
        const L = 40 + R() * 70, pts = [], sw = (R() - 0.5) * 0.6;
        for (let k = 0; k < 5; k++) { const d = (k / 4) * L; pts.push([p[0] + sw * d + Math.sin(k * 1.7 + i) * 2, p[1] + nr[1] * 1.5 - d, p[2] + nr[2] * (1.5 + d * 0.16) + (R() - 0.5) * 3]); }
        const W = 16 + R() * 16, tw = (R() - 0.5) * 1.2;
        cardT(B, pts, [Math.cos(tw), 0, Math.sin(tw)], W, C(0.85 + R() * 0.25), R() * 2, TILE, 0.35);
      }
    }
    const geo = B.toGeo();
    geo.userData.sleeveIdx = sleeveIdx;
    return geo;
  }

  /* ---------------------------------------------- деталь и узел --- */
  function visibleIn(o, top) { for (let p = o; p && p !== top; p = p.parent) if (!p.visible) return false; return true; }
  function zoneMeshes(asm, z) {
    const out = [];
    if (z.base) {
      const b = asm.base && asm.base.root;
      if (!b) return { host: null, meshes: out };
      b.traverse((o) => { if (o.isMesh && !o.userData.slotId && !o.userData.wcover && !o.userData.reticle && visibleIn(o, b)) out.push(o); });
      return { host: b, meshes: out };
    }
    const it = asm.installed && asm.installed.get(z.slot);
    if (!it || !it.obj) return { host: null, meshes: out };
    it.obj.traverse((o) => { if (o.isMesh && o.userData.slotId === z.slot && !o.userData.wcover && !o.userData.reticle && !o.userData.lens && visibleIn(o, it.obj)) out.push(o); });
    /* узел: общий предок всех сеток детали (складной приклад, ползун цевья) */
    let host = it.obj;
    if (out.length) {
      const chain = (o) => { const c = []; for (let p = o.parent; p && p !== it.obj.parent; p = p.parent) c.unshift(p); return c; };
      let common = chain(out[0]);
      for (let i = 1; i < out.length && common.length; i++) {
        const c = chain(out[i]);
        let k = 0;
        while (k < common.length && k < c.length && common[k] === c[k]) k++;
        common = common.slice(0, k);
      }
      if (common.length) host = common[common.length - 1];
    }
    return { host, meshes: out, partId: it.part && it.part.id };
  }

  const geoCache = new Map();
  function remove(asm) {
    const list = asm && asm.root && asm.root.userData.wcoverList;
    if (list) for (const m of list) if (m.parent) m.parent.remove(m);
    if (asm && asm.root) asm.root.userData.wcoverList = [];
  }
  const norm = (w) => {
    if (!w || typeof w !== 'object') return null;
    const t = KINDS[w.t] && w.t !== 'none' ? w.t : null;
    if (!t) return null;
    return { t, c: SCHEMES[w.c] ? w.c : 'forest' };
  };
  /* наложить (или снять) маскировку на сборку оружейной; возвращает число сеток */
  function apply(asm, wid, wrap) {
    if (!asm || !asm.root) return 0;
    remove(asm);
    const W = norm(wrap), zones = ZONES[wid];
    if (!W || !zones) return 0;
    const cols = SCHEMES[W.c].col;
    let n = 0;
    for (const z of zones) {
      const { host, meshes, partId } = zoneMeshes(asm, z);
      if (!host || !meshes.length) continue;
      const key = wid + '|' + (z.slot || 'base_' + z.role) + '|' + (partId || '') + '|' + W.t + '|' + W.c;
      let geo = geoCache.get(key);
      if (geo === undefined) {
        const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
        const S = profile(zonePoints(host, meshes, z));
        geo = S ? zoneGeo(S, W.t, z.role, cols, hash(key)) : null;
        geoCache.set(key, geo);
        if (geo && typeof console !== 'undefined' && root.__WCOVER_LOG) console.info('wcover', key, geo.attributes.position.count, 'верш.', ((typeof performance !== 'undefined' ? performance.now() : 0) - t0).toFixed(1) + ' мс');
      }
      if (!geo) continue;
      const mat = material(W.t === 'ghillie' ? 'strand' : 'net');
      /* у «кикиморы» основа — тёмная сетка, нити — отдельной карточкой того же меша:
         две группы, два материала (сеть + нить) */
      let mesh;
      if (W.t === 'ghillie') {
        if (!geo.userData.split) splitGhillie(geo);
        mesh = new THREE.Mesh(geo, [material('net'), mat]);
      } else mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'wcover_' + (z.slot || 'base_' + z.role);
      mesh.userData.wcover = W.t; mesh.userData.noSkin = true; mesh.userData.noTrace = true; mesh.userData.noImpact = true; mesh.userData.noBatch = true;
      mesh.castShadow = false; mesh.receiveShadow = false;
      mesh.raycast = () => {};
      host.add(mesh);
      asm.root.userData.wcoverList.push(mesh);
      n++;
    }
    return n;
  }
  /* «кикимора»: первые вершины — чулок (сеть), остальные — нити */
  function splitGhillie(geo) {
    geo.userData.split = true;
    const idx = geo.index.count;
    /* чулок пишется первым: его индексы — до первой карточки */
    const sl = geo.userData.sleeveIdx || idx;
    geo.clearGroups();
    geo.addGroup(0, sl, 0);
    if (idx > sl) geo.addGroup(sl, idx - sl, 1);
  }

  root.GWCover = { SCHEMES, KINDS, ZONES, supports, apply, remove, norm, material, _cache: geoCache, _profile: profile, _points: zonePoints, _zoneMeshes: zoneMeshes };
})(typeof window !== 'undefined' ? window : globalThis);
