/* ============================================================================
   Буфер скиннингованной геометрии.

   Тело бойца строится как набор «обтекаемых» поверхностей (лофтов) вокруг
   скелета. Вершина сразу получает веса костей, поэтому дальше меш живёт как
   обычный THREE.SkinnedMesh: анимация идёт на GPU, а рёбра у локтей и колен
   не рвутся.

   Координаты — метры, ось Y вверх, -Z вперёд (как у three и у модели АК).
   ========================================================================== */
(function (root, factory) {
  const B = factory(root.GUtil || (typeof require !== 'undefined' ? require('./util.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = B;
  else root.GBuf = B;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  const TAU = Math.PI * 2;

  function Buf() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.skinIndex = [];
    this.skinWeight = [];
    this.index = [];
  }

  Buf.prototype.vertex = function (p, n, uv, bones) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.uv.push(uv[0], uv[1]);
    /* до 4 костей на вершину; недостающие добиваются нулями */
    const b = bones || [[0, 1]];
    for (let i = 0; i < 4; i++) {
      this.skinIndex.push(b[i] ? b[i][0] : 0);
      this.skinWeight.push(b[i] ? b[i][1] : 0);
    }
    return this.pos.length / 3 - 1;
  };

  Buf.prototype.tri = function (a, b, c) { this.index.push(a, b, c); };
  Buf.prototype.quad = function (a, b, c, d) { this.index.push(a, b, c, a, c, d); };
  Buf.prototype.count = function () { return this.pos.length / 3; };

  /* Нормализация весов: сумма должна быть ровно 1, иначе меш «сдувается». */
  Buf.prototype.normalizeWeights = function () {
    const w = this.skinWeight;
    for (let i = 0; i < w.length; i += 4) {
      const s = w[i] + w[i + 1] + w[i + 2] + w[i + 3];
      if (s > 1e-6) { w[i] /= s; w[i + 1] /= s; w[i + 2] /= s; w[i + 3] /= s; }
      else { w[i] = 1; w[i + 1] = w[i + 2] = w[i + 3] = 0; }
    }
  };

  /* Пересчёт нормалей по граням: нужен после того, как лофт получил
     нетривиальную форму (сужения, скосы) — аналитические нормали там врут. */
  Buf.prototype.recomputeNormals = function () {
    const P = this.pos, I = this.index;
    const N = new Float64Array(P.length);
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      N[a] += nx; N[a + 1] += ny; N[a + 2] += nz;
      N[b] += nx; N[b + 1] += ny; N[b + 2] += nz;
      N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
    }
    for (let i = 0; i < N.length; i += 3) {
      const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
      this.nrm[i] = N[i] / l; this.nrm[i + 1] = N[i + 1] / l; this.nrm[i + 2] = N[i + 2] / l;
    }
  };

  /* Сварка вершин по позиции: убирает видимые швы между сегментами лофта
     и даёт гладкие нормали на стыке плеча с торсом. */
  Buf.prototype.weld = function (eps) {
    const E = eps || 1e-4;
    const inv = 1 / E;
    const map = new Map();
    const remap = new Int32Array(this.count());
    const P = this.pos, N = this.nrm, UV = this.uv, SI = this.skinIndex, SW = this.skinWeight;
    const nP = [], nN = [], nUV = [], nSI = [], nSW = [];
    for (let i = 0; i < remap.length; i++) {
      const k = Math.round(P[i * 3] * inv) + '_' + Math.round(P[i * 3 + 1] * inv) + '_' +
        Math.round(P[i * 3 + 2] * inv) + '_' + Math.round(UV[i * 2] * 64) + '_' + Math.round(UV[i * 2 + 1] * 64);
      const hit = map.get(k);
      if (hit !== undefined) {
        remap[i] = hit;
        /* нормали суммируются — усреднение даст гладкий стык */
        nN[hit * 3] += N[i * 3]; nN[hit * 3 + 1] += N[i * 3 + 1]; nN[hit * 3 + 2] += N[i * 3 + 2];
        continue;
      }
      const j = nP.length / 3;
      map.set(k, j);
      remap[i] = j;
      nP.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      nN.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      nUV.push(UV[i * 2], UV[i * 2 + 1]);
      for (let k2 = 0; k2 < 4; k2++) { nSI.push(SI[i * 4 + k2]); nSW.push(SW[i * 4 + k2]); }
    }
    for (let i = 0; i < nN.length; i += 3) {
      const l = Math.hypot(nN[i], nN[i + 1], nN[i + 2]) || 1;
      nN[i] /= l; nN[i + 1] /= l; nN[i + 2] /= l;
    }
    this.pos = nP; this.nrm = nN; this.uv = nUV; this.skinIndex = nSI; this.skinWeight = nSW;
    for (let i = 0; i < this.index.length; i++) this.index[i] = remap[this.index[i]];
    return this;
  };

  /* Слияние двух буферов (со сдвигом индексов). */
  Buf.prototype.append = function (other) {
    const off = this.count();
    for (let i = 0; i < other.pos.length; i++) this.pos.push(other.pos[i]);
    for (let i = 0; i < other.nrm.length; i++) this.nrm.push(other.nrm[i]);
    for (let i = 0; i < other.uv.length; i++) this.uv.push(other.uv[i]);
    for (let i = 0; i < other.skinIndex.length; i++) this.skinIndex.push(other.skinIndex[i]);
    for (let i = 0; i < other.skinWeight.length; i++) this.skinWeight.push(other.skinWeight[i]);
    for (let i = 0; i < other.index.length; i++) this.index.push(other.index[i] + off);
    return this;
  };

  /* ======================================================== ЛОФТ ========= */
  /* Основной инструмент: труба переменного сечения вдоль ломаной оси.

     rings: [{ c:[x,y,z], // центр кольца
               rx, ry,    // полуоси сечения
               n,         // степень суперэллипсы (2 — эллипс, 4+ — «коробка»)
               rot,       // поворот сечения вокруг оси трубы, рад
               axis,      // направление оси в этой точке (нормируется)
               up,        // ориентир «верха» сечения
               bones,     // веса костей для вершин кольца
               v,         // координата V для UV
               shape      // необязательная функция (t)->[x,y] в локальной 2D
             }]
     seg:   количество вершин в кольце.
     caps:  замыкать ли торцы. */
  function loft(buf, rings, seg, opts) {
    opts = opts || {};
    const S = seg || 16;
    const uScale = opts.uScale === undefined ? 1 : opts.uScale;
    const uOff = opts.uOffset || 0;
    const rows = [];

    for (let i = 0; i < rings.length; i++) {
      const R = rings[i];
      /* базис кольца: ось трубы + два поперечных направления */
      let ax = R.axis ? norm(R.axis) : dirBetween(rings, i);
      let up = R.up || [0, 1, 0];
      let side = cross(up, ax);
      if (len(side) < 1e-5) { up = [0, 0, 1]; side = cross(up, ax); }
      side = norm(side);
      up = norm(cross(ax, side));

      const row = [];
      const rot = R.rot || 0;
      for (let j = 0; j < S; j++) {
        const t = (j / S) * TAU + rot;
        let lx, ly;
        if (R.shape) { const p = R.shape((j / S), t); lx = p[0]; ly = p[1]; }
        else {
          const e = U.superellipse(R.rx, R.ry === undefined ? R.rx : R.ry, R.n || 2, t);
          lx = e[0]; ly = e[1];
        }
        const p = [
          R.c[0] + side[0] * lx + up[0] * ly,
          R.c[1] + side[1] * lx + up[1] * ly,
          R.c[2] + side[2] * lx + up[2] * ly
        ];
        /* аналитическая нормаль: наружу от оси (уточняется в recomputeNormals) */
        const n = norm([
          side[0] * lx + up[0] * ly,
          side[1] * lx + up[1] * ly,
          side[2] * lx + up[2] * ly
        ]);
        const u = (j / S) * uScale + uOff;
        row.push(buf.vertex(p, n, [u, R.v === undefined ? i / (rings.length - 1) : R.v], R.bones));
      }
      /* дублирующая вершина шва, чтобы UV не «заворачивалось» */
      const R0 = rings[i];
      const seamT = rot;
      let sx, sy;
      if (R0.shape) { const p = R0.shape(0, seamT); sx = p[0]; sy = p[1]; }
      else { const e = U.superellipse(R0.rx, R0.ry === undefined ? R0.rx : R0.ry, R0.n || 2, seamT); sx = e[0]; sy = e[1]; }
      const sp = [
        R0.c[0] + side[0] * sx + up[0] * sy,
        R0.c[1] + side[1] * sx + up[1] * sy,
        R0.c[2] + side[2] * sx + up[2] * sy
      ];
      row.push(buf.vertex(sp, norm([side[0] * sx + up[0] * sy, side[1] * sx + up[1] * sy, side[2] * sx + up[2] * sy]),
        [uScale + uOff, R0.v === undefined ? i / (rings.length - 1) : R0.v], R0.bones));
      rows.push(row);
    }

    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      for (let j = 0; j < S; j++) buf.quad(a[j], a[j + 1], b[j + 1], b[j]);
    }

    if (opts.capStart) capRing(buf, rings[0], rows[0], S, -1);
    if (opts.capEnd) capRing(buf, rings[rings.length - 1], rows[rows.length - 1], S, 1);
    return rows;
  }

  /* Крышка торца: веер треугольников к центру. */
  function capRing(buf, R, row, S, sign) {
    const c = buf.vertex(R.c, [0, sign, 0], [0.5, R.v === undefined ? 0 : R.v], R.bones);
    for (let j = 0; j < S; j++) {
      if (sign > 0) buf.tri(c, row[j], row[j + 1]);
      else buf.tri(c, row[j + 1], row[j]);
    }
  }

  function dirBetween(rings, i) {
    const a = rings[Math.max(0, i - 1)].c, b = rings[Math.min(rings.length - 1, i + 1)].c;
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    return len(d) < 1e-7 ? [0, 1, 0] : norm(d);
  }

  /* ------------------------------------------------------- сглаженный бокс */
  /* Скруглённый параллелепипед: подсумки, магазины, плиты бронежилета,
     доски домика. Радиус скругления задаётся отдельно, поэтому рёбра
     ловят блик — без этого всё выглядит «кубиками». */
  function roundBox(buf, opts) {
    const c = opts.center || [0, 0, 0];
    const s = opts.size;                       // полуразмеры
    const r = Math.min(opts.radius === undefined ? 0.01 : opts.radius, Math.min(s[0], s[1], s[2]) * 0.98);
    const seg = opts.seg || 3;
    const bones = opts.bones;
    const uvScale = opts.uvScale || 1;
    const q = opts.quat;                        // необязательный поворот

    const put = (p, n, uv) => {
      let P = p, N = n;
      if (q) { P = qrot(q, p); N = qrot(q, n); }
      return buf.vertex([P[0] + c[0], P[1] + c[1], P[2] + c[2]], N, uv, bones);
    };

    /* Сфера-«кубоид»: параметризуем по сферическим углам и растягиваем
       центральную часть до полуразмеров. Даёт корректные скругления
       на всех 12 рёбрах и 8 углах сразу. */
    const NU = seg * 4, NV = seg * 2;
    const grid = [];
    for (let iv = 0; iv <= NV; iv++) {
      const row = [];
      const v = iv / NV;
      const phi = v * Math.PI;
      for (let iu = 0; iu <= NU; iu++) {
        const u = iu / NU;
        const th = u * TAU;
        const nx = Math.sin(phi) * Math.cos(th);
        const ny = Math.cos(phi);
        const nz = Math.sin(phi) * Math.sin(th);
        const l = Math.hypot(nx, ny, nz) || 1;
        const n = [nx / l, ny / l, nz / l];
        const p = [
          Math.sign(n[0]) * Math.min(Math.abs(n[0]) * r + (s[0] - r) * clampUnit(n[0] * 2.4), s[0]),
          Math.sign(n[1]) * Math.min(Math.abs(n[1]) * r + (s[1] - r) * clampUnit(n[1] * 2.4), s[1]),
          Math.sign(n[2]) * Math.min(Math.abs(n[2]) * r + (s[2] - r) * clampUnit(n[2] * 2.4), s[2])
        ];
        row.push(put(p, n, [u * uvScale, v * uvScale]));
      }
      grid.push(row);
    }
    for (let iv = 0; iv < NV; iv++)
      for (let iu = 0; iu < NU; iu++)
        buf.quad(grid[iv][iu], grid[iv][iu + 1], grid[iv + 1][iu + 1], grid[iv + 1][iu]);
  }

  const clampUnit = (v) => U.clamp(v, -1, 1);

  /* ------------------------------------------------------------- пластина */
  /* Плоская панель с прошивкой по краю: нашивки, клапаны подсумков, ремни.
     Слегка выгибается по заданной кривизне, чтобы облегать тело. */
  function panel(buf, opts) {
    const o = opts.origin, ex = opts.ex, ey = opts.ey;   // базис панели
    const nx = opts.segX || 6, ny = opts.segY || 6;
    const bow = opts.bow || 0;                            // выгиб по нормали
    const th = opts.thickness === undefined ? 0.004 : opts.thickness;
    const bones = opts.bones;
    const n0 = norm(cross(ex, ey));
    const uv = opts.uv || [0, 0, 1, 1];
    const soft = opts.soft === undefined ? 0 : opts.soft;  // скругление углов

    const faces = [];
    for (const side of [1, -1]) {
      const grid = [];
      for (let j = 0; j <= ny; j++) {
        const row = [];
        for (let i = 0; i <= nx; i++) {
          let u = i / nx, v = j / ny;
          /* скругление углов панели поджатием краёв */
          let sx = 1, sy = 1;
          if (soft > 0) {
            const du = Math.abs(u - 0.5) * 2, dv = Math.abs(v - 0.5) * 2;
            sx = 1 - soft * Math.pow(Math.max(0, dv - (1 - soft)) / soft, 2) * 0.5;
            sy = 1 - soft * Math.pow(Math.max(0, du - (1 - soft)) / soft, 2) * 0.5;
          }
          const cu = (u - 0.5) * sx + 0.5, cv = (v - 0.5) * sy + 0.5;
          const b = bow * Math.sin(cu * Math.PI) * Math.sin(cv * Math.PI);
          const p = [
            o[0] + ex[0] * cu + ey[0] * cv + n0[0] * (b + th * 0.5 * side),
            o[1] + ex[1] * cu + ey[1] * cv + n0[1] * (b + th * 0.5 * side),
            o[2] + ex[2] * cu + ey[2] * cv + n0[2] * (b + th * 0.5 * side)
          ];
          row.push(buf.vertex(p, [n0[0] * side, n0[1] * side, n0[2] * side],
            [U.lerp(uv[0], uv[2], u), U.lerp(uv[1], uv[3], v)], bones));
        }
        grid.push(row);
      }
      faces.push(grid);
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          if (side > 0) buf.quad(grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]);
          else buf.quad(grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1]);
        }
    }
    /* боковой рант — чтобы панель не была «бумажной» */
    const A = faces[0], B = faces[1];
    for (let i = 0; i < nx; i++) {
      buf.quad(A[0][i], B[0][i], B[0][i + 1], A[0][i + 1]);
      buf.quad(A[ny][i + 1], B[ny][i + 1], B[ny][i], A[ny][i]);
    }
    for (let j = 0; j < ny; j++) {
      buf.quad(A[j + 1][0], B[j + 1][0], B[j][0], A[j][0]);
      buf.quad(A[j][nx], B[j][nx], B[j + 1][nx], A[j + 1][nx]);
    }
    return faces;
  }

  /* --------------------------------------------------------------- строп */
  /* Ремень/стропа по ломаной: плоская лента, которая всегда повёрнута
     плашмя к заданной нормали. */
  function strap(buf, pts, width, thick, normalHint, bones, uvScale) {
    const W = width * 0.5, T = (thick === undefined ? 0.003 : thick) * 0.5;
    const rings = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const ax = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      rings.push({
        c: pts[i], axis: ax, up: normalHint || [0, 0, 1],
        rx: W, ry: T, n: 3.6, v: (i / (pts.length - 1)) * (uvScale || 1), bones:
          typeof bones === 'function' ? bones(i / (pts.length - 1), pts[i]) : bones
      });
    }
    loft(buf, rings, 8, { capStart: true, capEnd: true });
  }

  /* ------------------------------------------------------------ векторы */
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.hypot(a[0], a[1], a[2]); }
  function norm(a) { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function lerp3(a, b, t) { return [U.lerp(a[0], b[0], t), U.lerp(a[1], b[1], t), U.lerp(a[2], b[2], t)]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  /* поворот вектора кватернионом [x,y,z,w] */
  function qrot(q, v) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const ix = w * v[0] + y * v[2] - z * v[1];
    const iy = w * v[1] + z * v[0] - x * v[2];
    const iz = w * v[2] + x * v[1] - y * v[0];
    const iw = -x * v[0] - y * v[1] - z * v[2];
    return [
      ix * w + iw * -x + iy * -z - iz * -y,
      iy * w + iw * -y + iz * -x - ix * -z,
      iz * w + iw * -z + ix * -y - iy * -x
    ];
  }

  function qFromAxisAngle(axis, a) {
    const n = norm(axis), s = Math.sin(a / 2);
    return [n[0] * s, n[1] * s, n[2] * s, Math.cos(a / 2)];
  }

  return {
    Buf, loft, roundBox, panel, strap, capRing,
    cross, len, norm, add, sub, scale, lerp3, dot, qrot, qFromAxisAngle
  };
});