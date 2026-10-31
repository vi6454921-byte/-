
/* ==========================================================================
   МОДУЛЬ: soldier.js
   ========================================================================== */
/* ============================================================================
   Боец, собранный из частей.

   Сначала — тело: туловище, плечевой пояс, руки, кисти с пятью пальцами
   (по три фаланги), ноги, голова. Каждая часть — параметрическая
   поверхность: профиль сечения, протянутый вдоль костей скелета. Веса
   костей считаются по положению вершины, поэтому на стыках (плечо, локоть,
   колено, фаланги) поверхность гнётся плавно.

   Затем — форма, надетая на те же функции поверхности: куртка с воротником
   и карманами на рукавах, брюки с накладными карманами и наколенниками,
   перчатки с защитой костяшек, ботинки со шнуровкой, плитник с подсумками,
   РПС-пояс, балаклава, шлем FAST или панама. Раз снаряжение строится от
   поверхности тела, оно всегда прилегает и нигде не висит в воздухе.

   Все четыре бойца — ОДИН и тот же код и одна геометрия. Отличаются только
   материалы (камуфляж, цвет снаряжения, нашивка), головной убор и
   балаклава/открытое лицо — тело и снаряжение у всех одинаковые.

   Система координат: метры, Y вверх, боец смотрит в -Z, правая сторона
   тела — +X. Геометрия считается для эталонного роста 1,80 м и
   масштабируется при записи вершины.
   ========================================================================== */
(function (root, factory) {
  const S = factory(root.GUtil, root.GBuf, root.GSkel);
  if (typeof module !== 'undefined' && module.exports) module.exports = S;
  else root.GSoldier = S;
})(typeof self !== 'undefined' ? self : this, function (U, B, SK) {
  'use strict';

  const TAU = Math.PI * 2;
  const { norm, cross, sub, add, scale, dot, len } = B;
  const ss = U.smoothstep, lerp = U.lerp;
  const gauss = (x) => Math.exp(-x * x);
  /* 1 внутри [a, b], мягкие края шириной soft */
  const band = (v, a, b, soft) => ss((v - a) / soft) * (1 - ss((v - b) / soft));
  const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

  /* Группы материалов: каждая едет в свой SkinnedMesh.
     hat   — панама (ткань формы), прячется в виде от первого лица;
     patch — нашивки с эмблемой подразделения;
     rubber— подошва, шнурки и резинки;
     head*  — снаряжение головы (ремешок, рельсы, гарнитура, шнуры) с теми же
              материалами, что gear/hard/rubber, но отдельными мешами: в виде
              от первого лица их прячут вместе со шлемом. */
  const GROUPS = ['uniform', 'skin', 'glove', 'gear', 'mask', 'helmet', 'hat',
    'boot', 'rubber', 'hard', 'eye', 'hair', 'patch', 'headGear', 'headHard', 'headRubber'];

  function newGroups() {
    const g = {};
    for (const k of GROUPS) g[k] = new B.Buf();
    return g;
  }

  /* ---------------------------------------------------------------- веса */
  /* {chest: 0.7, spine: 0.3} -> [[idx, w], ...], не больше четырёх костей */
  function makeW(BI) {
    return function (o) {
      const out = [];
      for (const k in o) {
        const w = o[k];
        if (!(w > 1e-4)) continue;
        if (BI[k] === undefined) throw new Error('нет кости ' + k);
        out.push([BI[k], w]);
      }
      out.sort((a, b) => b[1] - a[1]);
      const r = out.slice(0, 4);
      let t = 0;
      for (const e of r) t += e[1];
      for (const e of r) e[1] /= t || 1;
      return r.length ? r : [[0, 1]];
    };
  }

  /* Часть меша: буфер группы + функция весов по положению вершины. */
  function Part(K, buf, wfn) { this.K = K; this.buf = buf; this.wfn = wfn; }
  Part.prototype.v = function (p, uv) {
    const h = this.K.h;
    return this.buf.vertex([p[0] * h, p[1] * h, p[2] * h], [0, 1, 0], uv || [0, 0], this.wfn(p));
  };

  /* Профиль по таблице [ключ, ...значения] (ключи по возрастанию).
     Между строками — Catmull-Rom: силуэт без изломов. */
  function table(rows) {
    const keys = rows.map((r) => r[0]);
    const cols = [];
    for (let c = 1; c < rows[0].length; c++) cols.push(rows.map((r) => r[c]));
    const n = rows.length;
    return function (k) {
      let i = 0;
      if (k >= keys[n - 1]) i = n - 2;
      else while (i < n - 2 && k > keys[i + 1]) i++;
      const f = U.clamp01((k - keys[i]) / (keys[i + 1] - keys[i]));
      const t = (i + f) / (n - 1);
      return cols.map((col) => U.splineAt(col, t));
    };
  }

  /* ------------------------------------------------------- сетки и тела */
  /* Сетка (NU+1)×(NV+1) по параметрической поверхности P(u, v).
     Ориентация граней выбирается голосованием по подсказке out(p, u, v):
     нормаль обязана смотреть наружу, иначе грань отсечётся как задняя. */
  function grid(part, NU, NV, P, o) {
    o = o || {};
    const uvs = o.uv || [NU / 12, NV / 12];
    const rows = [];
    for (let j = 0; j <= NV; j++) {
      const row = [];
      for (let i = 0; i <= NU; i++) {
        const u = i / NU, v = j / NV;
        row.push(part.v(P(o.wrapU && i === NU ? 0 : u, v), o.uvFn ? o.uvFn(u, v) : [u * uvs[0], v * uvs[1]]));
      }
      rows.push(row);
    }
    const pos = part.buf.pos, h = part.K.h;
    const at = (k) => [pos[k * 3] / h, pos[k * 3 + 1] / h, pos[k * 3 + 2] / h];
    let flip = false;
    if (o.out) {
      let vote = 0;
      for (let j = 0; j < NV; j++) {
        for (let i = 0; i < NU; i++) {
          const a = at(rows[j][i]);
          const n = cross(sub(at(rows[j][i + 1]), a), sub(at(rows[j + 1][i]), a));
          if (len(n) < 1e-14) continue;
          vote += Math.sign(dot(n, o.out(a, i / NU, j / NV)));
        }
      }
      flip = vote < 0;
    }
    for (let j = 0; j < NV; j++) {
      for (let i = 0; i < NU; i++) {
        if (o.skip && o.skip(i, j)) continue;
        const a = rows[j][i], b = rows[j][i + 1], c = rows[j + 1][i + 1], d = rows[j + 1][i];
        if (flip) part.buf.quad(a, d, c, b); else part.buf.quad(a, b, c, d);
      }
    }
    return rows;
  }

  /* Труба по списку колец: ring(θ) -> точка. */
  function tube(part, rings, NU, out) {
    const NV = rings.length - 1;
    return grid(part, NU, NV, (u, v) => rings[Math.round(v * NV)](u * TAU), { wrapU: true, out });
  }

  /* Толстая накладка на поверхность S(u,v) -> [точка, нормаль наружу].
     Низ на отступе t0, верх — t0 + t1(u,v); торцы замкнуты. Этим строятся
     карманы, ремни, камербанд, стропы MOLLE, липучки, наколенники. */
  function slab(part, NU, NV, S, o) {
    const T0 = typeof o.t0 === 'function' ? o.t0 : () => (o.t0 || 0);
    const T1 = typeof o.t1 === 'function' ? o.t1 : () => o.t1;
    const top = (u, v) => { const s = S(u, v); return add(s[0], scale(s[1], T0(u, v) + T1(u, v))); };
    const bot = (u, v) => { const s = S(u, v); return add(s[0], scale(s[1], T0(u, v))); };
    const e = 1e-3;
    const tanU = (u, v) => sub(S(Math.min(1, u + e), v)[0], S(Math.max(0, u - e), v)[0]);
    const tanV = (u, v) => sub(S(u, Math.min(1, v + e))[0], S(u, Math.max(0, v - e))[0]);
    grid(part, NU, NV, top, { wrapU: o.wrapU, uv: o.uv, out: (p, u, v) => S(u, v)[1] });
    if (!o.noBottom) grid(part, NU, NV, bot, { wrapU: o.wrapU, out: (p, u, v) => scale(S(u, v)[1], -1) });
    if (!o.wrapU) {
      grid(part, NV, 1, (a, w) => (w ? top : bot)(0, a), { out: (p, a) => scale(tanU(0, a), -1) });
      grid(part, NV, 1, (a, w) => (w ? top : bot)(1, a), { out: (p, a) => tanU(1, a) });
    }
    grid(part, NU, 1, (a, w) => (w ? top : bot)(a, 0), { wrapU: o.wrapU, out: (p, a) => scale(tanV(a, 0), -1) });
    grid(part, NU, 1, (a, w) => (w ? top : bot)(a, 1), { wrapU: o.wrapU, out: (p, a) => tanV(a, 1) });
  }

  /* Протяжка сечения вдоль пути. nrm[i] — нормаль поверхности, на которой
     лежит лента; shape(θ) -> [вдоль ширины, вдоль нормали]. */
  function sweep(part, pts, nrm, shape, NS, o) {
    o = o || {};
    const n = pts.length;
    const F = pts.map((p, i) => {
      const t = norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
      const N = norm(sub(nrm[i], scale(t, dot(nrm[i], t))));
      return { p, t, N, b: cross(t, N) };
    });
    const at = (i, th) => {
      const s = shape(th, i / (n - 1));
      return add(F[i].p, add(scale(F[i].b, s[0]), scale(F[i].N, s[1])));
    };
    grid(part, NS, n - 1, (u, v) => at(Math.round(v * (n - 1)), u * TAU),
      { wrapU: true, out: (p, u, v) => sub(p, F[Math.round(v * (n - 1))].p) });
    if (o.caps) {
      for (const [i, sg] of [[0, -1], [n - 1, 1]]) {
        const c = part.v(F[i].p);
        const ring = [];
        for (let k = 0; k < NS; k++) ring.push(part.v(at(i, (k / NS) * TAU)));
        const a = at(i, 0), b = at(i, TAU / NS);
        const fl = dot(cross(sub(a, F[i].p), sub(b, F[i].p)), scale(F[i].t, sg)) < 0;
        for (let k = 0; k < NS; k++) {
          const k2 = (k + 1) % NS;
          if (fl) part.buf.tri(c, ring[k2], ring[k]); else part.buf.tri(c, ring[k], ring[k2]);
        }
      }
    }
  }

  /* Сглаживание ломаной (Чайкин) — ровные ремни и канты. */
  function chaikin(pts, it) {
    let P = pts;
    for (let k = 0; k < (it || 1); k++) {
      const Q = [P[0]];
      for (let i = 0; i < P.length - 1; i++) {
        Q.push(B.lerp3(P[i], P[i + 1], 0.25), B.lerp3(P[i], P[i + 1], 0.75));
      }
      Q.push(P[P.length - 1]);
      P = Q;
    }
    return P;
  }

  function quatFromBasis(ex, ey, ez) {
    const m00 = ex[0], m01 = ey[0], m02 = ez[0];
    const m10 = ex[1], m11 = ey[1], m12 = ez[1];
    const m20 = ex[2], m21 = ey[2], m22 = ez[2];
    const tr = m00 + m11 + m22;
    let x, y, z, w, s;
    if (tr > 0) { s = 0.5 / Math.sqrt(tr + 1); w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s; }
    else if (m00 > m11 && m00 > m22) { s = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
    else if (m11 > m22) { s = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
    else { s = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
    return [x, y, z, w];
  }

  /* Базис «наружу n, вверх up»: ex — вбок, ey — вверх по поверхности. */
  function basisN(n, up) {
    const ez = norm(n);
    const ex = norm(cross(up || [0, 1, 0], ez));
    const ey = cross(ez, ex);
    return [ex, ey, ez];
  }

  /* Скруглённый бокс; веса раздаются по положению вершин. */
  function box(part, c, size, basis, r, seg) {
    const start = part.buf.count();
    const h = part.K.h;
    B.roundBox(part.buf, {
      center: [c[0] * h, c[1] * h, c[2] * h],
      size: [size[0] * h, size[1] * h, size[2] * h],
      radius: (r === undefined ? 0.006 : r) * h, seg: seg || 3,
      quat: basis ? quatFromBasis(basis[0], basis[1], basis[2]) : null
    });
    const b = part.buf;
    for (let k = start; k < b.count(); k++) {
      const w = part.wfn([b.pos[k * 3] / h, b.pos[k * 3 + 1] / h, b.pos[k * 3 + 2] / h]);
      for (let i = 0; i < 4; i++) {
        b.skinIndex[k * 4 + i] = w[i] ? w[i][0] : 0;
        b.skinWeight[k * 4 + i] = w[i] ? w[i][1] : 0;
      }
    }
  }

  /* ============================================================ ТУЛОВИЩЕ */
  /* Сечения куртки по высоте: [y, полуширина, перед, спина, степень].
     Это тело плюс ~1 см ткани. Ниже 0,95 — подол, свободно лежащий на
     брюках; выше 1,44 — плечевой скат и трапеция к шее. */
  const TORSO = table([
    [0.855, 0.198, 0.124, 0.146, 2.4],
    [0.900, 0.193, 0.120, 0.140, 2.4],
    [0.950, 0.184, 0.115, 0.132, 2.4],
    [1.000, 0.175, 0.112, 0.121, 2.4],
    [1.060, 0.168, 0.113, 0.111, 2.4],
    [1.120, 0.170, 0.119, 0.109, 2.4],
    [1.200, 0.178, 0.127, 0.113, 2.4],
    [1.270, 0.189, 0.134, 0.119, 2.5],
    [1.330, 0.198, 0.137, 0.123, 2.5],
    [1.390, 0.204, 0.128, 0.122, 2.5],
    [1.435, 0.200, 0.110, 0.110, 2.6],
    [1.465, 0.184, 0.095, 0.098, 2.5],
    [1.490, 0.150, 0.086, 0.090, 2.3],
    [1.510, 0.110, 0.080, 0.083, 2.2],
    [1.530, 0.082, 0.073, 0.075, 2.1],
    [1.550, 0.071, 0.068, 0.069, 2.0],
    [1.570, 0.068, 0.066, 0.066, 2.0]
  ]);

  /* θ = 0 — правый бок (+X), θ = π/2 — грудь (-Z), π — левый бок, 3π/2 — спина. */
  function torsoPt(K, y, th, smooth) {
    const pr = TORSO(y);
    /* свободный крой куртки: чуть шире тела, у горловины — по шее */
    const kb = 1 + 0.035 * (1 - ss((y - 1.47) / 0.06));
    const rx = pr[0] * kb, zf = pr[1] * kb, zb = pr[2] * kb, e = 2 / pr[3];
    const c = Math.cos(th), s = Math.sin(th);
    const X = rx * spow(c, e);
    let Z = (s >= 0 ? zf : zb) * spow(s, e);
    const ax = Math.abs(X);
    if (s > 0) {
      Z += 0.008 * gauss((ax - 0.085) / 0.05) * gauss((y - 1.33) / 0.05) * s;            // грудные
    } else {
      Z -= 0.006 * gauss((ax - 0.09) / 0.045) * gauss((y - 1.37) / 0.06) * (-s);          // лопатки
      Z += 0.005 * gauss(X / 0.02) * band(y, 1.06, 1.42, 0.04) * (-s);                    // ложбина позвоночника
    }
    let f = 1;
    if (!smooth) {
      /* ткань: крупные мягкие складки + мелкая рябь; ниже жилета —
         горизонтальные заломы там, где куртку прижимает пояс */
      f += (K.n1(th * 1.7 + 3.1, y * 9) - 0.5) * 0.030 + (K.n2(th * 4.1, y * 26) - 0.5) * 0.010;
      f += band(y, 0.88, 1.07, 0.02) * 0.010 * Math.sin(y * 160 + 7 * K.n1(th * 1.3, y * 3));
    }
    return [X * f, y, -Z * f];
  }

  function torsoN(K, y, th) {
    const e = 1e-3;
    const dth = sub(torsoPt(K, y, th + e, true), torsoPt(K, y, th - e, true));
    const dy = sub(torsoPt(K, y + e, th, true), torsoPt(K, y - e, th, true));
    return norm(cross(dth, dy));
  }

  /* θ точки на груди (back = false) или спине с заданной координатой x. */
  function torsoTheta(y, x, back) {
    const pr = TORSO(y), rx = pr[0] * (1 + 0.035 * (1 - ss((y - 1.47) / 0.06))), e = 2 / pr[3];
    const xc = Math.max(-rx * 0.999, Math.min(rx * 0.999, x));
    let lo = back ? Math.PI : 0, hi = back ? TAU : Math.PI;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2, X = rx * spow(Math.cos(m), e);
      if (back ? X < xc : X > xc) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }

  function insideTorso(p) {
    const pr = TORSO(p[1]);
    const kb = 1 + 0.035 * (1 - ss((p[1] - 1.47) / 0.06));
    const Z = -p[2];
    const rz = (Z >= 0 ? pr[1] : pr[2]) * kb;
    return Math.pow(Math.abs(p[0]) / (pr[0] * kb), pr[3]) + Math.pow(Math.abs(Z) / rz, pr[3]) < 1;
  }

  function torsoW(K) {
    return (p) => {
      const y = p[1], ax = Math.abs(p[0]), S = p[0] >= 0 ? 'R' : 'L';
      const t1 = ss((y - 0.97) / 0.15), t2 = ss((y - 1.15) / 0.17);
      const t3 = ss((y - 1.50) / 0.05), t4 = ss((y - 1.585) / 0.03);
      /* плечевой пояс: верх куртки у плеча идёт за рукой */
      const k = ss((ax - 0.11) / 0.09) * ss((y - 1.36) / 0.07) * 0.5;
      /* низ подола у бёдер слегка тянется за ногой */
      const g = (1 - ss((y - 0.86) / 0.12)) * ss((ax - 0.03) / 0.07) * 0.45;
      const r = 1 - k - g;
      const o = {
        hips: (1 - t1) * r, spine: t1 * (1 - t2) * r, chest: t2 * (1 - t3) * r,
        neck: t3 * (1 - t4) * r, head: t4 * r
      };
      o['clav' + S] = k * 0.55;
      o['shoulder' + S] = k * 0.45;
      o['hip' + S] = g;
      return K.W(o);
    };
  }

  /* Жилет и пояс — жёсткие: почти целиком на груди/тазе, без «перегиба». */
  function vestW(K) {
    return (p) => {
      const t = ss((p[1] - 1.05) / 0.12);
      return K.W({ chest: t, spine: (1 - t) * 0.8, hips: (1 - t) * 0.2 });
    };
  }
  function beltW(K) { return () => K.W({ hips: 1 }); }

  function buildTorso(K) {
    const part = new Part(K, K.G.uniform, torsoW(K));
    const out = (p) => [p[0], 0, p[2]];
    const shrink = (y, k) => (t) => { const p = torsoPt(K, y, t); return [p[0] * k, y, p[2] * k]; };
    const rings = [shrink(0.885, 0.955), shrink(0.864, 0.978)];
    for (let y = 0.855; y <= 1.5705; y += 0.0105) rings.push(((yy) => (t) => torsoPt(K, yy, t))(y));
    tube(part, rings, 72, out);

    /* Дно горловины: в виде от первого лица сквозь неё не должно быть
       видно «пустоты» внутри корпуса. */
    const capP = new Part(K, K.G.rubber, torsoW(K));
    grid(capP, 24, 1, (u, v) => {
      const p = torsoPt(K, 1.548, u * TAU, true);
      return [p[0] * (1 - v), 1.548, p[2] * (1 - v) + 0.004 * v];
    }, { wrapU: true, out: () => [0, 1, 0] });

    /* Стойка воротника: открыта спереди, толщина 4,5 мм. */
    const col = new Part(K, K.G.uniform, torsoW(K));
    const open = 0.30;
    slab(col, 40, 5, (u, v) => {
      const th = Math.PI / 2 + open + u * (TAU - 2 * open);
      const y = lerp(1.512, 1.588, v);
      const rx = lerp(0.086, 0.079, v), zf = lerp(0.082, 0.076, v), zb = lerp(0.083, 0.078, v);
      const c = Math.cos(th), s = Math.sin(th);
      const rz = s >= 0 ? zf : zb;
      return [[rx * c, y, -rz * s + 0.004], norm([c / rx, 0, -s / rz])];
    }, { t0: 0, t1: 0.0045 });

    /* Планка молнии ниже жилета. */
    const plk = new Part(K, K.G.uniform, torsoW(K));
    slab(plk, 2, 12, (u, v) => {
      const y = lerp(0.858, 1.10, v), x = lerp(0.017, -0.017, u);
      const th = torsoTheta(y, x, false);
      return [torsoPt(K, y, th, true), torsoN(K, y, th)];
    }, { t0: 0.002, t1: 0.0025 });
  }

  /* Таз брюк под подолом: закрывает промежность между бёдрами. */
  const PELVIS = table([
    [0.800, 0.050, 0.040, 0.050],
    [0.830, 0.118, 0.082, 0.096],
    [0.870, 0.158, 0.100, 0.118],
    [0.930, 0.170, 0.106, 0.126],
    [1.000, 0.165, 0.105, 0.118]
  ]);
  function buildPelvis(K) {
    const part = new Part(K, K.G.uniform, torsoW(K));
    const rings = [];
    for (let y = 0.80; y <= 1.0001; y += 0.01) {
      rings.push(((yy) => (t) => {
        const pr = PELVIS(yy), c = Math.cos(t), s = Math.sin(t);
        return [pr[0] * spow(c, 0.85), yy, -(s >= 0 ? pr[1] : pr[2]) * spow(s, 0.85)];
      })(y));
    }
    tube(part, rings, 40, (p) => [p[0], p[1] - 0.95, p[2]]);
  }

  /* ================================================================ РУКИ */
  /* Рукав по оси руки (T-поза, рука вдоль ±X): [x наружу, верх, низ, перед,
     зад, сдвиг центра]. В начале рукав сидит глубоко в корпусе, у сустава
     даёт дельту, дальше — бицепс, локоть, предплечье и манжет. */
  const ARM = table([
    [0.110, 0.040, 0.078, 0.088, 0.088, 0.000],
    [0.150, 0.042, 0.071, 0.078, 0.078, 0.000],
    [0.190, 0.046, 0.064, 0.067, 0.068, 0.000],
    [0.230, 0.051, 0.059, 0.061, 0.063, -0.001],
    [0.270, 0.053, 0.055, 0.058, 0.060, -0.002],
    [0.330, 0.050, 0.052, 0.055, 0.056, -0.003],
    [0.400, 0.047, 0.049, 0.052, 0.052, -0.004],
    [0.460, 0.045, 0.047, 0.048, 0.049, -0.004],
    [0.500, 0.044, 0.046, 0.046, 0.050, -0.004],
    [0.550, 0.046, 0.047, 0.046, 0.046, -0.004],
    [0.610, 0.044, 0.045, 0.043, 0.043, -0.004],
    [0.670, 0.041, 0.042, 0.040, 0.040, -0.004],
    [0.715, 0.039, 0.040, 0.038, 0.038, -0.004],
    [0.742, 0.041, 0.042, 0.040, 0.040, -0.004]
  ]);

  /* θ = 0 — верх руки (в опущенной руке это наружная сторона), π/2 — перед. */
  function armPt(K, s, x, th, smooth) {
    const pr = ARM(x);
    const c = Math.cos(th), sn = Math.sin(th);
    /* рукав свободнее руки */
    const kb = 1 + 0.15 * ss((x - 0.2) / 0.08) * (1 - 0.45 * ss((x - 0.66) / 0.06));
    const ry = (c >= 0 ? pr[0] : pr[1]) * kb;
    let rz = (sn >= 0 ? pr[2] : pr[3]) * kb;
    let f = 1;
    if (!smooth) {
      /* налокотник, вшитый в рукав */
      if (sn < 0) rz += 0.006 * gauss((x - 0.50) / 0.03) * Math.pow(-sn, 2);
      /* заломы на сгибе локтя */
      if (sn > 0) f -= 0.07 * Math.max(0, Math.sin((x - 0.5) * TAU / 0.024)) * gauss((x - 0.5) / 0.035) * sn;
      /* ткань собирается в подмышке и тянется диагоналями от неё к бицепсу */
      if (c < 0) f += 0.05 * band(x, 0.15, 0.27, 0.03) * Math.sin(th * 6 + x * 70 + 3 * K.n1(x * 5, s)) * (-c);
      f += 0.022 * band(x, 0.24, 0.44, 0.04) * Math.sin((x * 42 + th * 1.6 * s) * TAU / 2.4);
      /* напуск над манжетой: рукав шире предплечья и лежит гармошкой */
      f += 0.045 * band(x, 0.62, 0.715, 0.015) * Math.max(0, Math.sin(x * 390 + 4 * K.n1(th * 1.2 + s, 2.1)));
      /* мягкие складки ткани */
      f += (K.n1(th * 1.4 + s * 5, x * 8) - 0.5) * 0.06 + (K.n2(th * 3 + s, x * 22) - 0.5) * 0.02;
      /* манжет стянут липучкой */
      f += band(x, 0.724, 0.75, 0.006) * 0.03;
    }
    return [s * x, 1.452 + pr[4] + ry * c * f, -rz * sn * f];
  }

  function armN(K, s, x, th) {
    const e = 1e-3;
    const a = sub(armPt(K, s, x, th + e, true), armPt(K, s, x, th - e, true));
    const b = sub(armPt(K, s, x + e, th, true), armPt(K, s, x - e, th, true));
    const n = norm(cross(a, b));
    const p = armPt(K, s, x, th, true);
    return dot(n, [0, p[1] - 1.452, p[2]]) < 0 ? scale(n, -1) : n;
  }

  function armW(K, s) {
    const S = s > 0 ? 'R' : 'L';
    return (p) => {
      const x = s * p[0];
      const a = ss((x - 0.09) / 0.07);
      const b = ss((x - 0.13) / 0.085);
      const c = ss((x - 0.466) / 0.06);
      const d = ss((x - 0.70) / 0.055);
      const o = { chest: 1 - a };
      o['clav' + S] = a * (1 - b);
      o['shoulder' + S] = a * b * (1 - c);
      o['elbow' + S] = a * b * c * (1 - d);
      o['wrist' + S] = a * b * c * d;
      return K.W(o);
    };
  }

  function buildArm(K, s) {
    const part = new Part(K, K.G.uniform, armW(K, s));
    const rings = [];
    for (let x = 0.11; x <= 0.7425; x += 0.0095) rings.push(((xx) => (t) => armPt(K, s, xx, t))(x));
    /* подгиб манжета внутрь */
    const hem = (x, k) => (t) => { const p = armPt(K, s, 0.742, t); return [s * x, 1.448 + (p[1] - 1.448) * k, p[2] * k]; };
    rings.push(hem(0.745, 0.90), hem(0.72, 0.86));
    tube(part, rings, 44, (p) => [0, p[1] - 1.45, p[2]]);

    /* Карман на плече с клапаном; на левом — нашивка подразделения. */
    const pk = new Part(K, K.G.uniform, armW(K, s));
    const pocket = (u, v) => {
      const th = lerp(-0.78, 0.78, u), x = lerp(0.262, 0.382, v);
      return [armPt(K, s, x, th, true), armN(K, s, x, th)];
    };
    const pth = (u, v) => 0.009 * (0.35 + 0.65 * ss(Math.min(u, 1 - u, v * 1.5, 1 - v) / 0.18));
    slab(pk, 10, 8, pocket, { t0: 0.001, t1: pth });
    slab(pk, 10, 3, (u, v) => {
      const th = lerp(-0.84, 0.84, u), x = lerp(0.252, 0.296, v);
      return [armPt(K, s, x, th, true), armN(K, s, x, th)];
    }, { t0: (u, v) => 0.0015 + pth(U.clamp01((u - 0.04) / 0.92), U.clamp01((v * 0.044 + 0.252 - 0.262) / 0.12)), t1: 0.0035 });
    const patchP = new Part(K, s < 0 ? K.G.patch : K.G.gear, armW(K, s));
    slab(patchP, 6, 6, (u, v) => {
      const th = lerp(0.36, -0.36, u), x = lerp(0.372, 0.305, v);
      return [armPt(K, s, x, th, true), armN(K, s, x, th)];
    }, { t0: (u, v) => 0.001 + pth(0.5 + (u - 0.5) * 0.46, 0.35 + v * 0.55), t1: 0.0022, uv: [1, 1] });
  }

  /* =============================================================== КИСТИ */
  function handW(K, s) {
    const S = s > 0 ? 'R' : 'L';
    return (p) => {
      const d = ss((s * p[0] - 0.700) / 0.045);
      const o = {};
      o['elbow' + S] = 1 - d;
      o['wrist' + S] = d;
      return K.W(o);
    };
  }

  /* Палец (или большой палец) по цепочке точек J[0..3]; кончик скруглён.
     radK — множители радиуса в суставах. */
  function buildFinger(K, part, s, J, r, back, radK) {
    const RK = radK || [1.04, 1.0, 0.94, 0.88];
    const ax = norm(sub(J[1], J[0]));
    const start = sub(J[0], scale(ax, back));
    const segs = [[start, J[0], RK[0], RK[0]], [J[0], J[1], RK[0], RK[1]], [J[1], J[2], RK[1], RK[2]], [J[2], J[3], RK[2], RK[3]]];
    const rings = [];
    const ring = (c, a, rr) => {
      /* сечение чуть сплющено: ладонная сторона площе */
      let up = [0, 1, 0];
      const sd = norm(cross(up, a));
      up = cross(a, sd);
      return (t) => {
        const cy = Math.sin(t), cx = Math.cos(t);
        const ry = rr * (cy < 0 ? 0.84 : 0.92);
        return add(c, add(scale(sd, rr * cx), scale(up, ry * cy)));
      };
    };
    for (let k = 0; k < segs.length; k++) {
      const [A, Bp, ra, rb] = segs[k];
      const a = norm(sub(Bp, A));
      const n = k === 0 ? 2 : 4;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        /* между суставами фаланга чуть тоньше */
        const pinch = k > 0 ? 1 - 0.06 * Math.sin(Math.PI * t) : 1;
        rings.push(ring(B.lerp3(A, Bp, t), a, r * lerp(ra, rb, t) * pinch));
      }
    }
    const aT = norm(sub(J[3], J[2]));
    const rt = r * RK[3];
    for (let i = 0; i <= 5; i++) {
      const g = (i / 5) * Math.PI / 2;
      rings.push(ring(add(J[3], scale(aT, rt * 0.2 + Math.sin(g) * rt * 0.95)), aT, Math.max(rt * Math.cos(g), rt * 0.05)));
    }
    const C = [start].concat(J);
    tube(part, rings, 14, (p) => {
      let best = J[0], bd = 1e9;
      for (let k = 0; k < C.length - 1; k++) {
        const d = sub(C[k + 1], C[k]);
        const t = U.clamp01(dot(sub(p, C[k]), d) / dot(d, d));
        const q = add(C[k], scale(d, t));
        const dd = len(sub(p, q));
        if (dd < bd) { bd = dd; best = q; }
      }
      return sub(p, best);
    });
  }

  /* Перчатка: манжет, ладонь, пять пальцев, накладка на костяшки. */
  function buildHand(K, s) {
    const S = s > 0 ? 'R' : 'L';
    const R = (n) => K.R(n);
    const gl = new Part(K, K.G.glove, handW(K, s));
    /* [x, полуширина (z), полутолщина (y), центр z, центр y, степень] */
    const PALM = table([
      [0.700, 0.034, 0.028, 0.004, 0.000, 2.2],
      [0.745, 0.031, 0.022, 0.004, -0.001, 2.4],
      [0.775, 0.037, 0.019, 0.005, -0.002, 2.8],
      [0.805, 0.043, 0.018, 0.007, -0.003, 3.0],
      [0.832, 0.044, 0.016, 0.007, -0.003, 3.0],
      [0.848, 0.041, 0.013, 0.007, -0.003, 2.8],
      [0.856, 0.030, 0.008, 0.007, -0.003, 2.4]
    ]);
    const palmPt = (x, th) => {
      const pr = PALM(x), c = Math.cos(th), sn = Math.sin(th), e = 2 / pr[4];
      let ry = pr[1];
      /* мякоть ладони пухлее тыльной стороны */
      if (sn < 0) ry *= 1.12 + 0.12 * gauss((x - 0.79) / 0.03);
      return [s * x, 1.452 + pr[3] + ry * spow(sn, e), pr[2] - pr[0] * spow(c, e)];
    };
    const rings = [];
    for (let x = 0.700; x <= 0.8561; x += 0.0065) rings.push(((xx) => (t) => palmPt(xx, t))(x));
    tube(gl, rings, 32, (p) => [0, p[1] - 1.45, p[2] - 0.006]);
    /* липучка манжета на тыльной стороне */
    slab(new Part(K, K.G.glove, handW(K, s)), 3, 3, (u, v) => {
      const x = lerp(0.712, 0.752, u), z = lerp(-0.012, 0.024, v);
      const pr = PALM(x);
      return [[s * x, 1.452 + pr[3] + pr[1], z], [0, 1, 0]];
    }, { t0: 0.0005, t1: 0.0035 });

    /* Пальцы: суставы берутся из скелета, фаланги утолщены в суставах. */
    const fingers = SK.FINGERS.map((f) => ({ key: f.key, r: f.r / K.h + 0.0017, bones: [1, 2, 3, 4].map((i) => f.key + S + i) }));
    for (const f of fingers) {
      const J = f.bones.map((b) => R(b));
      const W = (p) => {
        const x = s * p[0];
        const x1 = s * J[0][0], x2 = s * J[1][0], x3 = s * J[2][0];
        const a = ss((x - (x1 - 0.010)) / 0.012);
        const b = ss((x - (x2 - 0.005)) / 0.010);
        const c = ss((x - (x3 - 0.004)) / 0.008);
        const o = {};
        o['wrist' + S] = 1 - a;
        o[f.bones[0]] = a * (1 - b);
        o[f.bones[1]] = a * b * (1 - c);
        o[f.bones[2]] = a * b * c;
        return K.W(o);
      };
      buildFinger(K, new Part(K, K.G.glove, W), s, J, f.r, 0.014);
    }
    /* большой палец: возвышение от запястья + две фаланги */
    const T = [1, 2, 3, 4].map((i) => R('thumb' + S + i));
    const TW = (p) => {
      const d1 = sub(T[1], T[0]);
      const t = dot(sub(p, T[0]), d1) / dot(d1, d1);
      const d3 = sub(T[3], T[2]);
      const t3 = dot(sub(p, T[2]), d3) / dot(d3, d3);
      const a = ss((t + 0.6) / 0.6);
      const b = ss((t - 0.85) / 0.3);
      const c = ss((t3 + 0.15) / 0.3);
      const o = {};
      o['wrist' + S] = 1 - a;
      o['thumb' + S + '1'] = a * (1 - b);
      o['thumb' + S + '2'] = a * b * (1 - c);
      o['thumb' + S + '3'] = a * b * c;
      return K.W(o);
    };
    const base = [s * 0.772, 1.444, -0.012];
    buildFinger(K, new Part(K, K.G.glove, TW), s, [base, T[1], T[2], T[3]], 0.0138, 0.004,
      [0.0175 / 0.0138, 1.0, 0.95, 0.9]);

    /* Жёсткая накладка на костяшки. */
    slab(new Part(K, K.G.hard, handW(K, s)), 8, 4, (u, v) => {
      const x = lerp(0.812, 0.852, v), th = lerp(0.35, 2.75, u);
      const p = palmPt(x, th);
      const q = palmPt(x, th + 0.01);
      const r2 = palmPt(Math.min(0.856, x + 0.004), th);
      let n = norm(cross(sub(q, p), sub(r2, p)));
      if (n[1] < 0) n = scale(n, -1);
      return [p, n];
    }, { t0: 0.0012, t1: (u, v) => 0.0055 * (0.4 + 0.6 * ss(Math.min(u, 1 - u, v, 1 - v) / 0.2)) });
    /* Накладка из искусственной замши на ладони: от основания пальцев до
       запястья, по ребру ладони заходит на бок. */
    slab(new Part(K, K.G.hard, handW(K, s)), 10, 6, (u, v) => {
      const x = lerp(0.762, 0.851, v), th = lerp(Math.PI + 0.28, TAU - 0.28, u);
      const p = palmPt(x, th);
      const q = palmPt(x, th + 0.01);
      const r2 = palmPt(Math.min(0.856, x + 0.004), th);
      let n = norm(cross(sub(q, p), sub(r2, p)));
      if (n[1] > 0) n = scale(n, -1);
      return [p, n];
    }, { t0: 0.0006, t1: (u, v) => 0.0018 * (0.4 + 0.6 * ss(Math.min(u, 1 - u, v, 1 - v) / 0.15)) });
    /* накладки на основные фаланги */
    for (const f of fingers) {
      const J = f.bones.map((b) => R(b));
      const c = B.lerp3(J[0], J[1], 0.55);
      box(new Part(K, K.G.hard, () => K.W({ [f.bones[0]]: 1 })),
        [c[0], c[1] + f.r * 0.92, c[2]], [0.009, 0.0022, f.r * 0.72], null, 0.002, 2);
    }
  }

  /* ================================================================ НОГИ */
  /* Брючина: [y, наружу, внутрь, перед, зад, сдвиг центра наружу]. */
  const LEG = table([
    [0.185, 0.046, 0.044, 0.050, 0.052, 0.000],
    [0.205, 0.054, 0.052, 0.058, 0.060, 0.000],
    [0.235, 0.057, 0.055, 0.059, 0.063, 0.000],
    [0.270, 0.050, 0.048, 0.050, 0.060, 0.000],
    [0.340, 0.053, 0.050, 0.052, 0.068, 0.000],
    [0.410, 0.055, 0.052, 0.054, 0.068, 0.000],
    [0.470, 0.056, 0.054, 0.058, 0.060, 0.000],
    [0.520, 0.059, 0.056, 0.064, 0.058, 0.000],
    [0.580, 0.066, 0.060, 0.068, 0.066, 0.000],
    [0.680, 0.075, 0.066, 0.076, 0.078, 0.002],
    [0.780, 0.082, 0.071, 0.082, 0.088, 0.004],
    [0.860, 0.087, 0.075, 0.090, 0.102, 0.006],
    [0.930, 0.090, 0.079, 0.096, 0.116, 0.006],
    [1.000, 0.092, 0.080, 0.100, 0.120, 0.004]
  ]);

  /* θ = 0 — наружная сторона, π/2 — перед, π — внутренняя, 3π/2 — зад. */
  function legPt(K, s, y, th, smooth) {
    const pr = LEG(y);
    const c = Math.cos(th), sn = Math.sin(th);
    /* брюки свободного кроя; внизу заправлены в берцы. Внутрь и у паха
       прибавка меньше — брючины не должны врезаться друг в друга и в подол. */
    const grow = ss((y - 0.27) / 0.1) * (1 - 0.55 * ss((y - 0.80) / 0.12));
    const kb = 1 + 0.17 * grow, ki = 1 + 0.09 * grow;
    const rx = (c >= 0 ? pr[0] * kb : pr[1] * ki), rz = (sn >= 0 ? pr[2] : pr[3]) * kb;
    let f = 1;
    if (!smooth) {
      f += (K.n1(th * 1.3 + s * 9, y * 6) - 0.5) * 0.06 + (K.n2(th * 4 + s * 3, y * 24) - 0.5) * 0.018;
      /* напуск над берцами */
      f += band(y, 0.235, 0.33, 0.02) * 0.08 * Math.max(-0.3, Math.sin(y * 300 + 5 * K.n1(th * 1.1 + s, 1.3)));
      /* брючина свисает с колена вертикальными волнами */
      f += band(y, 0.29, 0.45, 0.03) * 0.035 * Math.sin(th * 3 + s + 3 * K.n1(y * 4, th));
      /* горизонтальные заломы на бедре спереди — ткань тянет к колену */
      if (sn > 0) f -= band(y, 0.64, 0.84, 0.03) * 0.02 * Math.max(0, Math.sin(y * 150 + th * 3 * s)) * sn;
      /* заломы под коленом */
      if (sn < 0) f -= band(y, 0.45, 0.535, 0.015) * 0.05 * Math.max(0, Math.sin(y * 300 + th * 2)) * (-sn);
      /* вытачки над коленом */
      if (sn > 0) f -= band(y, 0.575, 0.62, 0.01) * 0.03 * Math.max(0, Math.sin(th * 9)) * sn;
    }
    return [s * (0.092 + pr[4] + rx * c * f), y, -rz * sn * f];
  }

  function legN(K, s, y, th) {
    const e = 1e-3;
    const a = sub(legPt(K, s, y, th + e, true), legPt(K, s, y, th - e, true));
    const b = sub(legPt(K, s, y + e, th, true), legPt(K, s, y - e, th, true));
    const n = norm(cross(a, b));
    const p = legPt(K, s, y, th, true);
    return dot(n, [p[0] - s * 0.092, 0, p[2]]) < 0 ? scale(n, -1) : n;
  }

  function legW(K, s) {
    const S = s > 0 ? 'R' : 'L';
    return (p) => {
      const y = p[1];
      const a = 1 - ss((y - 0.86) / 0.13);
      const b = 1 - ss((y - 0.465) / 0.07);
      const c = 1 - ss((y - 0.095) / 0.05);
      const o = { hips: 1 - a };
      o['hip' + S] = a * (1 - b);
      o['knee' + S] = a * b * (1 - c);
      o['ankle' + S] = a * b * c;
      return K.W(o);
    };
  }

  function buildLeg(K, s) {
    const part = new Part(K, K.G.uniform, legW(K, s));
    const rings = [];
    for (let y = 1.0; y >= 0.1849; y -= 0.0115) rings.push(((yy) => (t) => legPt(K, s, yy, t))(y));
    tube(part, rings, 48, (p) => [p[0] - s * 0.092, 0, p[2]]);

    /* Накладной карман с клапаном на бедре. */
    const pk = new Part(K, K.G.uniform, legW(K, s));
    const pS = (u, v) => {
      const th = lerp(-0.30, 0.78, u), y = lerp(0.605, 0.765, v);
      return [legPt(K, s, y, th, true), legN(K, s, y, th)];
    };
    const pth = (u, v) => 0.016 * (0.3 + 0.7 * ss(Math.min(u, 1 - u, v, 1 - v * 0.8) / 0.22)) * (0.8 + 0.2 * v);
    slab(pk, 10, 10, pS, { t0: 0.001, t1: pth });
    slab(pk, 10, 3, (u, v) => {
      const th = lerp(-0.36, 0.84, u), y = lerp(0.728, 0.785, v);
      return [legPt(K, s, y, th, true), legN(K, s, y, th)];
    }, { t0: (u, v) => 0.0015 + pth(U.clamp01((u - 0.05) / 0.9), U.clamp01((lerp(0.728, 0.785, v) - 0.605) / 0.16)), t1: 0.004 });

    /* Наколенник: жёсткая чашка поверх ткани и две резинки. */
    const kp = new Part(K, K.G.gear, legW(K, s));
    slab(kp, 12, 10, (u, v) => {
      const th = lerp(0.92, 2.22, u), y = lerp(0.448, 0.588, v);
      return [legPt(K, s, y, th, true), legN(K, s, y, th)];
    }, { t0: 0.0025, t1: (u, v) => 0.017 * (0.35 + 0.65 * ss(Math.min(u, 1 - u, v, 1 - v) / 0.25)) * (1 + 0.25 * gauss((v - 0.55) / 0.25) * gauss((u - 0.5) / 0.3)) });
    for (const y0 of [0.462, 0.566]) {
      slab(kp, 40, 1, (u, v) => {
        const th = u * TAU, y = y0 + (v - 0.5) * 0.018;
        return [legPt(K, s, y, th, true), legN(K, s, y, th)];
      }, { t0: 0.001, t1: 0.0028, wrapU: true });
    }
  }

  /* ============================================================= БОТИНКИ */
  function bootW(K, s) {
    const S = s > 0 ? 'R' : 'L';
    return (p) => {
      const k = ss((p[1] - 0.12) / 0.09);
      const t = (1 - k) * ss((-p[2] - 0.095) / 0.045);
      const o = {};
      o['knee' + S] = k;
      o['ankle' + S] = (1 - k) * (1 - t);
      o['toe' + S] = t;
      return K.W(o);
    };
  }

  /* Стопа по длине: [z (вперёд — минус), полуширина, верх, сдвиг внутрь]. */
  const FOOT = table([
    [-0.219, 0.016, 0.046, 0.004],
    [-0.210, 0.033, 0.056, 0.004],
    [-0.192, 0.045, 0.064, 0.004],
    [-0.160, 0.052, 0.072, 0.003],
    [-0.120, 0.055, 0.085, 0.002],
    [-0.080, 0.053, 0.106, 0.001],
    [-0.040, 0.050, 0.128, 0.000],
    [0.000, 0.047, 0.140, 0.000],
    [0.030, 0.045, 0.130, 0.000],
    [0.060, 0.041, 0.115, 0.000],
    [0.072, 0.034, 0.104, 0.000],
    [0.079, 0.018, 0.084, 0.000]
  ]);
  const SOLE_Y = 0.034;

  function buildBoot(K, s) {
    const W = bootW(K, s);
    const bt = new Part(K, K.G.boot, W);
    const footPt = (z, th) => {
      const pr = FOOT(z);
      const yb = SOLE_Y - 0.002, ry = (pr[1] - yb) / 2, yc = yb + ry;
      const c = Math.cos(th), sn = Math.sin(th);
      /* низ плоский, верх — свод стопы */
      const y = yc + (sn >= 0 ? ry * spow(sn, 0.9) : ry * spow(sn, 0.35));
      return [s * (0.092 - pr[2] + pr[0] * spow(c, 0.8)), y, z];
    };
    const shrink = (z, k) => (t) => { const p = footPt(z, t); return [s * 0.092 + (p[0] - s * 0.092) * k, 0.06 + (p[1] - 0.06) * k, p[2]]; };
    const rings = [shrink(0.0795, 0.15)];
    for (let z = 0.079; z >= -0.2191; z -= 0.0075) rings.push(((zz) => (t) => footPt(zz, t))(z));
    rings.push(shrink(-0.2195, 0.15));
    tube(bt, rings, 36, (p) => [p[0] - s * 0.092, p[1] - 0.07, 0]);

    /* Накладки поверх кожи: резиновый бампер на носке (по бокам уходит
       дальше назад, чем сверху) и жёсткий задник вокруг пятки. */
    const footN = (z, th) => {
      const e = 1e-3, p = footPt(z, th), pr = FOOT(z);
      const n = norm(cross(sub(footPt(z, th + e), footPt(z, th - e)), sub(footPt(z + e, th), footPt(z - e, th))));
      const cc = [s * (0.092 - pr[2]), (SOLE_Y + pr[1]) / 2, z];
      return dot(n, sub(p, cc)) < 0 ? scale(n, -1) : n;
    };
    const edge = (v, w) => 0.35 + 0.65 * ss(Math.min(v, 1 - v) / w);
    slab(new Part(K, K.G.rubber, W), 26, 8, (u, v) => {
      const th = lerp(-0.32, Math.PI + 0.32, u);
      const z = lerp(-0.2182, lerp(-0.118, -0.172, Math.max(0, Math.sin(th))), v);
      return [footPt(z, th), footN(z, th)];
    }, { t0: 0.0004, t1: (u, v) => 0.0026 * edge(v, 0.25) * edge(u, 0.08) });
    slab(new Part(K, K.G.boot, W), 24, 6, (u, v) => {
      const th = lerp(-0.30, Math.PI + 0.30, u);
      const z = lerp(lerp(0.036, 0.018, Math.max(0, Math.sin(th))), 0.0783, v);
      return [footPt(z, th), footN(z, th)];
    }, { t0: 0.0004, t1: (u, v) => 0.003 * edge(v, 0.2) * edge(u, 0.08) });

    /* Голенище вокруг лодыжки, сверху — мягкий кант. */
    const SH = table([
      [0.090, 0.049, 0.064, 0.060],
      [0.130, 0.049, 0.058, 0.057],
      [0.170, 0.047, 0.054, 0.055],
      [0.215, 0.049, 0.055, 0.057],
      [0.236, 0.052, 0.058, 0.060]
    ]);
    const shPt = (y, th, k) => {
      const pr = SH(y), c = Math.cos(th), sn = Math.sin(th);
      const kk = k || 1;
      return [s * 0.092 + pr[0] * c * kk, y, 0.006 - (sn >= 0 ? pr[1] : pr[2]) * sn * kk];
    };
    const sr = [];
    for (let y = 0.09; y <= 0.2361; y += 0.0125) sr.push(((yy) => (t) => shPt(yy, t))(y));
    sr.push((t) => shPt(0.236, t, 1.07), (t) => { const p = shPt(0.236, t, 1.07); return [p[0], 0.244, p[2]]; },
      (t) => { const p = shPt(0.236, t, 0.93); return [p[0], 0.246, p[2]]; }, (t) => shPt(0.225, t, 0.86));
    tube(bt, sr, 36, (p) => [p[0] - s * 0.092, 0, p[2] - 0.006]);

    /* Язык и шнуровка: крючки и перекрещенные шнурки. */
    const LP = [[-0.090, 0.104], [-0.070, 0.117], [-0.058, 0.134], [-0.0575, 0.160], [-0.0575, 0.186], [-0.058, 0.212], [-0.0605, 0.236]];
    const front = (t) => {
      const f = U.clamp01(t) * (LP.length - 1), i = Math.min(LP.length - 2, Math.floor(f)), g = f - i;
      return [lerp(LP[i][0], LP[i + 1][0], g), lerp(LP[i][1], LP[i + 1][1], g)];
    };
    /* точка на линии шнуровки: сдвиг вбок и подъём над ней по нормали */
    const lacePt = (t, off, lift) => {
      const q = front(t), q2 = front(Math.min(1, t + 0.02)), q1 = front(Math.max(0, t - 0.02));
      const tz = q2[0] - q1[0], ty = q2[1] - q1[1];
      const L = Math.hypot(tz, ty) || 1;
      let n = [0, -tz / L, ty / L];
      if (n[2] > 0) n = [0, -n[1], -n[2]];
      return [[s * 0.092 + off, q[1] + n[1] * lift, q[0] + n[2] * lift], n];
    };
    slab(new Part(K, K.G.boot, W), 2, 12, (u, v) => {
      const r = lacePt(v, lerp(-0.016, 0.016, u), 0);
      return [r[0], r[1]];
    }, { t0: 0.0005, t1: 0.003 });
    const lace = new Part(K, K.G.rubber, W);
    const hooks = new Part(K, K.G.hard, W);
    const NL = 7;
    for (let i = 0; i < NL; i++) {
      const t0 = i / NL, t1 = (i + 1) / NL;
      for (const sd of [-1, 1]) {
        const a = lacePt(t0, sd * 0.017, 0.0045)[0], b = lacePt(t1, -sd * 0.017, 0.0045)[0];
        const n = lacePt((t0 + t1) / 2, 0, 0)[1];
        sweep(lace, [a, B.lerp3(a, b, 0.5), b], [n, n, n], (th) => [Math.cos(th) * 0.0022, Math.sin(th) * 0.0012], 6);
        const hp = lacePt(t0, sd * 0.021, 0.004);
        box(hooks, hp[0], [0.0035, 0.0035, 0.0035], basisN(hp[1]), 0.0015, 2);
      }
    }

    /* Подошва: рант по контуру стопы, каблук выше свода, грунтозацепы. */
    const sole = new Part(K, K.G.rubber, W);
    const solePt = (z, th) => {
      const pr = FOOT(z);
      const c = Math.cos(th), sn = Math.sin(th);
      const arch = band(-z, 0.015, 0.075, 0.012) * 0.010;
      const yTop = SOLE_Y + 0.001;
      const y = sn >= 0 ? lerp(yTop - 0.004, yTop, spow(sn, 0.3)) : lerp(yTop - 0.004, arch, Math.pow(-sn, 0.35));
      const w = pr[0] + 0.005;
      return [s * (0.092 - pr[2] + w * spow(c, 0.6)), y, z];
    };
    /* торцы подошвы чуть выступают за ботинок и скруглены */
    const sRing = (zz, k) => (t) => {
      const p = solePt(Math.max(-0.219, Math.min(0.079, zz)), t);
      return [s * 0.092 + (p[0] - s * 0.092) * k, 0.018 + (p[1] - 0.018) * Math.min(1, k * 1.3), zz];
    };
    const srr = [sRing(0.0835, 0.2), sRing(0.083, 0.62), sRing(0.0815, 0.9)];
    for (let z = 0.079; z >= -0.2191; z -= 0.0075) srr.push(sRing(z, 1));
    srr.push(sRing(-0.2215, 0.9), sRing(-0.2232, 0.62), sRing(-0.2237, 0.2));
    tube(sole, srr, 28, (p) => [p[0] - s * 0.092, p[1] - 0.02, 0]);
    for (let z = -0.19; z < 0.07; z += 0.028) {
      if (z > -0.075 && z < -0.02) continue;
      const pr = FOOT(z);
      box(sole, [s * (0.092 - pr[2]), 0.0025, z], [pr[0] * 0.8, 0.003, 0.0065], null, 0.002, 2);
    }
  }

  /* =============================================================== ГОЛОВА */
  const HEAD_C = [0, 1.688, -0.004];

  /* Поверхность головы по сферическим углам: θ — азимут (0 — лицо),
     φ — от макушки. F — выраженность черт (под балаклавой они мягче). */
  function headLocal(th, ph, F) {
    const sx = Math.sin(ph) * Math.sin(th), sy = Math.cos(ph), sz = -Math.sin(ph) * Math.cos(th);
    let x = sx * 0.079, y = sy * 0.114, z = sz * 0.099;
    const front = ss((-sz - 0.2) / 0.5);
    /* Череп: нижняя треть уже, но с углом челюсти (не «яйцо»), виски
       чуть впалые, затылок полнее, лицо площе. */
    x *= 1 - 0.25 * ss((-0.15 - sy) / 0.75);
    x *= 1 + 0.085 * gauss((sy + 0.66) / 0.2) * gauss((sz - 0.05) / 0.5);
    x *= 1 - 0.035 * gauss((sy - 0.12) / 0.16) * gauss((sz + 0.45) / 0.3);
    if (z > 0) z *= 1 + 0.05 * ss((sy + 0.3) / 0.6);
    else z *= 1 - 0.05 * front + 0.17 * gauss((sy + 0.6) / 0.3) * front;
    if (z < 0) {
      const ax = Math.abs(x);
      /* надбровные дуги и переносица */
      z -= 0.0065 * gauss((sy - 0.03) / 0.065) * gauss((ax - 0.03) / 0.033) * front;
      z -= 0.0022 * gauss((sy - 0.06) / 0.06) * gauss(x / 0.012) * front;
      /* глазница: впадина + миндалевидный разрез век, сквозь который видно
         яблоко; вне разреза веки закрывают его */
      /* Верхнее веко прикрывает край радужки, нижнее касается её снизу:
         при раскрытом над радужкой белке взгляд выходил испуганным. */
      const ey = sy * 0.114 - (EYE_Y - 0.0006 - HEAD_C[1]);
      const alm = ss((1 - Math.pow((ax - EYE_X) / 0.0136, 2) - Math.pow(ey / (ey > 0 ? 0.0047 : 0.0046), 2)) / 0.35);
      z += F.socket * (0.0034 * gauss((sy + 0.10) / 0.07) * gauss((ax - EYE_X) / 0.021) + 0.0068 * alm) * front;
      /* складка верхнего века и валик нижнего */
      z -= F.socket * 0.0012 * gauss((ey - 0.0085) / 0.0025) * gauss((ax - EYE_X) / 0.013) * front;
      z -= F.socket * 0.0009 * gauss((ey + 0.0062) / 0.002) * gauss((ax - EYE_X) / 0.012) * front;
      /* скулы вперёд и в стороны, под ними — лёгкая впалость щёк */
      x *= 1 + 0.045 * gauss((sy + 0.2) / 0.14) * front;
      z -= 0.0040 * gauss((sy + 0.24) / 0.09) * gauss((ax - 0.047) / 0.018) * front;
      z += 0.0026 * gauss((sy + 0.44) / 0.11) * gauss((ax - 0.046) / 0.015) * front;
      /* нос: спинка, шарик кончика, крылья, впадина под носом */
      const nH = sy > -0.05 ? 0.003 * gauss((sy + 0.05) / 0.05)
        : lerp(0.004, 0.0165, U.clamp01((-0.05 - sy) / 0.35)) * (1 - ss((-sy - 0.42) / 0.05));
      const nW = lerp(0.0058, 0.0092, U.clamp01((-0.05 - sy) / 0.37));
      const tip = 0.0030 * gauss((sy + 0.39) / 0.05) * gauss(x / 0.0082);
      const alae = 0.0042 * gauss((sy + 0.405) / 0.04) * gauss((ax - 0.0128) / 0.006);
      z -= F.nose * (nH * gauss(x / nW) + tip + alae) * front;
      z += F.nose * 0.0020 * gauss((sy + 0.455) / 0.02) * gauss(x / 0.02) * front;
      /* носогубные складки: от крыла носа к углу рта */
      const tl = U.clamp01((-sy - 0.42) / 0.24);
      z += 0.0013 * gauss((ax - lerp(0.021, 0.031, tl)) / 0.0035) * band(-sy, 0.42, 0.66, 0.03) * front;
      /* губы: верхняя, нижняя, линия рта, желобок, подбородочная складка */
      z += F.lips * 0.0008 * gauss(x / 0.0035) * band(-sy, 0.47, 0.57, 0.02) * front;
      z -= F.lips * (0.0040 * gauss((sy + 0.585) / 0.032) * gauss(x / 0.019)
        + 0.0046 * gauss((sy + 0.655) / 0.035) * gauss(x / 0.017)) * front;
      z += F.lips * 0.0019 * gauss((sy + 0.62) / 0.011) * gauss(x / 0.023) * front;
      z += F.lips * 0.0017 * gauss((sy + 0.725) / 0.03) * gauss(x / 0.02) * front;
      /* подбородок */
      z -= 0.0095 * gauss((sy + 0.85) / 0.1) * gauss(x / 0.032) * front;
    }
    return [x, y, z];
  }
  function headPt(th, ph, F, off) {
    const l = headLocal(th, ph, F);
    const k = 1 + (off || 0) / (len(l) || 1);
    return [HEAD_C[0] + l[0] * k, HEAD_C[1] + l[1] * k, HEAD_C[2] + l[2] * k];
  }
  /* (θ, φ) точки головы с заданными x, y (решаем Ньютоном). */
  function headSolve(x, y, F, off) {
    let th = Math.asin(U.clamp(x / 0.08, -0.95, 0.95));
    let ph = Math.acos(U.clamp((y - HEAD_C[1]) / 0.114, -0.99, 0.99));
    for (let i = 0; i < 14; i++) {
      const p = headPt(th, ph, F, off), e = 1e-4;
      const a = headPt(th + e, ph, F, off), b = headPt(th, ph + e, F, off);
      const j00 = (a[0] - p[0]) / e, j01 = (b[0] - p[0]) / e, j10 = (a[1] - p[1]) / e, j11 = (b[1] - p[1]) / e;
      const det = j00 * j11 - j01 * j10;
      if (Math.abs(det) < 1e-12) break;
      const dx = x - p[0], dy = y - p[1];
      th += (j11 * dx - j01 * dy) / det;
      ph += (-j10 * dx + j00 * dy) / det;
    }
    return [th, ph];
  }

  function headW(K) {
    return (p) => {
      const t = ss((p[1] - 1.50) / 0.10);
      const c = 1 - ss((p[1] - 1.47) / 0.05);
      return K.W({ chest: c, neck: (1 - t) * (1 - c), head: t });
    };
  }

  const FACE = { nose: 1, socket: 1, lips: 1 };
  const MASKF = { nose: 0.7, socket: 0.22, lips: 0.3 };
  const EYE_Y = 1.675, EYE_X = 0.031, EYE_R = 0.0115;

  function buildHead(K) {
    const sk = new Part(K, K.G.skin, headW(K));
    /* под балаклавой нос и губы не выступают за ткань */
    const F = K.masked ? { nose: MASKF.nose, socket: 1, lips: MASKF.lips } : FACE;
    /* Шов развёртки — на затылке (θ = ±π), а не посреди лица: вершины шва
       не свариваются (у них разные UV), и на лице был бы виден излом
       нормалей. UV = (θ, φ) — по ним рисуется текстура лица. */
    grid(sk, K.masked ? 120 : 180, K.masked ? 96 : 140, (u, v) => headPt((u - 0.5) * TAU, v * Math.PI, F, 0),
      { wrapU: true, out: (p) => sub(p, HEAD_C), uv: [1, 1] });
    /* шея: UV указывает на участок текстуры под подбородком (кожа) */
    const nr = [];
    for (let y = 1.49; y <= 1.6301; y += 0.014) nr.push(((yy) => (t) => [0.058 * Math.cos(t), yy, 0.006 - 0.060 * Math.sin(t)])(y));
    grid(sk, 24, nr.length - 1, (u, v) => nr[Math.round(v * (nr.length - 1))]((u - 0.25) * TAU),
      { wrapU: true, out: (p) => [p[0], 0, p[2] - 0.006], uvFn: (u) => [u, 0.97] });

    /* Глаза: яблоко в глазнице + радужка. */
    const ey = new Part(K, K.G.eye, () => K.W({ head: 1 }));
    const ir = new Part(K, K.G.hair, () => K.W({ head: 1 }));
    const noSock = { nose: F.nose, socket: 0, lips: F.lips };
    for (const sx of [1, -1]) {
      const a = headSolve(sx * EYE_X, EYE_Y, noSock, 0);
      const sp = headPt(a[0], a[1], noSock, 0);
      /* яблоко утоплено за край век: иначе оно выпирает круглым «мультяшным» глазом */
      const c = [sx * EYE_X, EYE_Y, sp[2] + EYE_R + 0.0034];
      grid(ey, 24, 16, (u, v) => {
        const ph = v * Math.PI, th = u * TAU;
        return [c[0] + EYE_R * Math.sin(ph) * Math.sin(th), c[1] + EYE_R * Math.cos(ph), c[2] - EYE_R * Math.sin(ph) * Math.cos(th)];
      }, { wrapU: true, out: (p) => sub(p, c), uv: [1, 1] });
      /* взгляд сведён к точке в 8 м */
      const bs = basisN(norm([-sx * EYE_X, 0, -8]));
      grid(ir, 24, 5, (u, v) => {
        /* радужка чуть выпуклая (роговица), v — радиус от зрачка */
        const al = v * 0.50, be = u * TAU, r = EYE_R + 0.0003 + 0.0006 * (1 - v * v);
        const d = add(scale(bs[2], Math.cos(al)), add(scale(bs[0], Math.sin(al) * Math.cos(be)), scale(bs[1], Math.sin(al) * Math.sin(be))));
        return add(c, scale(d, r));
      }, { wrapU: true, out: (p) => sub(p, c), uv: [1, 1] });
    }
  }

  /* Балаклава: голова + 3,5 мм ткани, прорезь для глаз с подрубленным
     краем, горловина заправлена под воротник. */
  const SLIT = { a: 0.063, b: 0.0175, y: EYE_Y + 0.001 };
  function inSlit(p) {
    const dx = p[0] / SLIT.a, dy = (p[1] - SLIT.y) / SLIT.b;
    return p[2] < HEAD_C[2] - 0.04 && Math.pow(Math.abs(dx), 4) + Math.pow(Math.abs(dy), 4) < 1;
  }
  function buildBalaclava(K) {
    const part = new Part(K, K.G.mask, headW(K));
    const off = 0.0035;
    const NU = 128, NV = 88;
    const P = (u, v) => headPt((u - 0.5) * TAU, v * Math.PI, MASKF, off);
    grid(part, NU, NV, P, {
      wrapU: true, out: (p) => sub(p, HEAD_C),
      skip: (i, j) => inSlit(P((i + 0.5) / NU, (j + 0.5) / NV))
    });
    /* подрубленный край прорези */
    const rim = [], rn = [];
    for (let k = 0; k <= 64; k++) {
      const t = (k / 64) * TAU;
      const e = U.superellipse(SLIT.a, SLIT.b, 4, t);
      const a = headSolve(e[0], SLIT.y + e[1], MASKF, off);
      const p = headPt(a[0], a[1], MASKF, off);
      rim.push(p);
      rn.push(norm(sub(p, HEAD_C)));
    }
    sweep(part, rim, rn, (th) => [Math.cos(th) * 0.0034, Math.sin(th) * 0.0024 - 0.0008], 8);
    /* горловина со складками */
    const nr = [];
    for (let y = 1.478; y <= 1.6401; y += 0.009) {
      nr.push(((yy) => (t) => {
        const k = 1 + 0.035 * Math.sin(yy * 220 + 3 * K.n1(t * 1.2, 2.0)) * band(yy, 1.5, 1.6, 0.02) + (K.n2(t * 3, yy * 20) - 0.5) * 0.03;
        const r = lerp(0.075, 0.063, ss((yy - 1.478) / 0.08)) * k;
        return [r * Math.cos(t), yy, 0.006 - r * 1.03 * Math.sin(t)];
      })(y));
    }
    tube(part, nr, 40, (p) => [p[0], 0, p[2] - 0.006]);
  }

  /* ============================================================ ШЛЕМ FAST */
  const HELM = { c: [0, 1.700, 0.004], rx: 0.109, ry: 0.118, rz: 0.131 };
  /* нижняя кромка: φ по азимуту — высокий вырез над ухом, затылок закрыт */
  const HELM_EDGE = table([
    [0, 74], [30, 78], [55, 90], [75, 90], [95, 79], [115, 85], [135, 101], [160, 108], [180, 110]
  ]);
  function helmPhi(th) {
    const a = Math.abs(U.wrapPI(th)) * 180 / Math.PI;
    return HELM_EDGE(a)[0] * Math.PI / 180;
  }
  function helmPt(th, ph, off) {
    const sp = Math.sin(ph);
    return [
      HELM.c[0] + (HELM.rx + off) * sp * spow(Math.sin(th), 0.86),
      HELM.c[1] + (HELM.ry + off) * Math.cos(ph),
      HELM.c[2] - (HELM.rz + off) * sp * spow(Math.cos(th), 0.9)
    ];
  }
  function helmN(th, ph) {
    const e = 1e-3;
    const a = sub(helmPt(th + e, ph, 0), helmPt(th - e, ph, 0));
    const b = sub(helmPt(th, ph + e, 0), helmPt(th, ph - e, 0));
    let n = norm(cross(a, b));
    if (dot(n, sub(helmPt(th, ph, 0), HELM.c)) < 0) n = scale(n, -1);
    return n;
  }

  function buildHelmet(K) {
    const HW = () => K.W({ head: 1 });
    const sh = new Part(K, K.G.helmet, HW);
    const out = (p) => sub(p, HELM.c);
    grid(sh, 96, 26, (u, v) => { const th = u * TAU; return helmPt(th, Math.max(0.02, v) * helmPhi(th), 0); },
      { wrapU: true, out });
    grid(sh, 64, 14, (u, v) => { const th = u * TAU; return helmPt(th, Math.max(0.02, v) * helmPhi(th), -0.009); },
      { wrapU: true, out: (p) => scale(out(p), -1) });
    /* резиновый кант по кромке */
    const rim = [], rn = [];
    for (let k = 0; k <= 128; k++) {
      const th = (k / 128) * TAU, ph = helmPhi(th);
      rim.push(helmPt(th, ph + 0.012, -0.0045));
      rn.push(helmN(th, ph));
    }
    sweep(new Part(K, K.G.headRubber, HW), rim, rn, (t) => [Math.cos(t) * 0.0048, Math.sin(t) * 0.0062], 8);

    /* липучки: макушка и затылок */
    const vel = new Part(K, K.G.headGear, HW);
    const patch = (a0, a1, p0, p1) => slab(vel, 12, 6, (u, v) => {
      const th = lerp(a0, a1, u), ph = lerp(p0, p1, v);
      return [helmPt(th, ph, 0), helmN(th, ph)];
    }, { t0: 0.0006, t1: 0.0022 });
    patch(-0.72, 0.72, 0.14, 0.62);
    patch(Math.PI - 0.55, Math.PI + 0.55, 0.95, 1.42);

    const hard = new Part(K, K.G.headHard, HW);
    /* рельсы ARC по бокам */
    for (const sd of [1, -1]) {
      const pts = [], ns = [];
      for (let k = 0; k <= 20; k++) {
        const th = sd * lerp(0.74, 2.20, k / 20), ph = helmPhi(th) - 0.17;
        pts.push(helmPt(th, ph, 0.0035));
        ns.push(helmN(th, ph));
      }
      sweep(hard, pts, ns, (t) => { const e = U.superellipse(0.011, 0.0042, 5, t); return [e[0], e[1]]; }, 12, { caps: true });
      for (const k of [3, 10, 17]) {
        box(hard, add(pts[k], scale(ns[k], 0.0045)), [0.0032, 0.0032, 0.0016], basisN(ns[k]), 0.0012, 2);
      }
    }
    /* платформа ПНВ (шрауд) */
    {
      const p = helmPt(0, 0.98, 0), n = helmN(0, 0.98);
      const bs = basisN(n);
      box(hard, add(p, scale(n, 0.006)), [0.029, 0.023, 0.006], bs, 0.004, 3);
      box(hard, add(add(p, scale(n, 0.012)), scale(bs[1], -0.010)), [0.014, 0.008, 0.005], bs, 0.002, 2);
    }
    /* противовес на затылке */
    {
      const p = helmPt(Math.PI, 1.62, 0), n = helmN(Math.PI, 1.62);
      box(vel, add(p, scale(n, 0.013)), [0.036, 0.022, 0.012], basisN(n), 0.006, 3);
    }
    /* банджи-шнуры на затылке */
    const cord = new Part(K, K.G.headRubber, HW);
    for (const ph of [1.02, 1.24]) {
      const pts = [], ns = [];
      for (let k = 0; k <= 16; k++) {
        const th = lerp(2.1, TAU - 2.1, k / 16);
        pts.push(helmPt(th, ph, 0.004));
        ns.push(helmN(th, ph));
      }
      sweep(cord, pts, ns, (t) => [Math.cos(t) * 0.0019, Math.sin(t) * 0.0019], 6);
    }
    /* подбородочный ремень поверх балаклавы */
    const strap = new Part(K, K.G.headGear, HW);
    const route = [[1.57, 1.28], [1.52, 1.62], [1.36, 1.98], [1.05, 2.30], [0.62, 2.55], [0.0, 2.66]];
    const full = route.concat(route.slice(0, -1).reverse().map((r) => [-r[0], r[1]]));
    const SF = K.masked ? MASKF : FACE, so = K.masked ? 0.0035 : 0;
    const sp = full.map(([th, ph]) => headPt(th, ph, SF, so + 0.0022));
    const top = (sd) => { const th = sd * 1.57; return helmPt(th, helmPhi(th) - 0.08, -0.012); };
    const S1 = chaikin([top(1)].concat(sp).concat([top(-1)]), 2);
    sweep(strap, S1, S1.map((p) => norm(sub(p, HEAD_C))), (t) => [Math.cos(t) * 0.0085, Math.sin(t) * 0.0016], 8);
    box(strap, headPt(0, 2.62, SF, so + 0.0085), [0.024, 0.009, 0.006], basisN(norm(sub(headPt(0, 2.62, SF, 0), HEAD_C))), 0.004, 2);
    if (!K.masked) buildHeadset(K);
  }

  /* Гарнитура (ComTac-подобная): чашки на рельсах ARC закрывают уши. */
  function buildHeadset(K) {
    const HW = () => K.W({ head: 1 });
    const hard = new Part(K, K.G.headHard, HW);
    const rub = new Part(K, K.G.headRubber, HW);
    for (const sd of [1, -1]) {
      const bs = basisN([sd, 0, 0]);
      const c = [sd * 0.094, 1.664, 0.006];
      box(rub, add(c, [-sd * 0.008, 0, 0]), [0.031, 0.039, 0.008], bs, 0.007, 3);
      box(hard, c, [0.029, 0.037, 0.014], bs, 0.013, 4);
      box(hard, add(c, [sd * 0.013, 0.004, 0]), [0.018, 0.022, 0.004], bs, 0.004, 2);
      /* кронштейн к рельсу */
      box(hard, add(c, [sd * 0.004, 0.046, -0.004]), [0.007, 0.016, 0.006], bs, 0.002, 2);
    }
    /* штанга микрофона слева */
    const pts = chaikin([[-0.094, 1.652, -0.018], [-0.090, 1.628, -0.052], [-0.066, 1.604, -0.088], [-0.030, 1.598, -0.104]], 2);
    sweep(hard, pts, pts.map(() => [0, 1, 0]), (t) => [Math.cos(t) * 0.0024, Math.sin(t) * 0.0024], 6, { caps: true });
    box(rub, [-0.026, 1.598, -0.105], [0.008, 0.007, 0.007], null, 0.006, 3);
  }

  /* Открытое лицо: брови, короткая стрижка, горловой шарф-«труба»
     спущен на шею. */
  function buildFaceKit(K) {
    /* Брови, щетина и короткая стрижка нарисованы в текстуре лица
       (character.js, faceAlbedo): геометрические «брови-дуги» читались
       как нарисованные маркером. Здесь — только шарф на шее. */
    /* шарф: мягкие складки, верх завёрнут валиком */
    const sc = new Part(K, K.G.mask, headW(K));
    const rings = [];
    const R = (y, t, extra) => {
      /* валик ложится поверх воротника куртки (его верх — y 1.57, r ≈ 0.068) */
      const b = 0.008 + 0.019 * gauss((y - 1.574) / 0.018) + 0.0035 * Math.sin(7 * t + 40 * y) * gauss((y - 1.572) / 0.03) + extra;
      return [(0.058 + b) * Math.cos(t), y, 0.006 - (0.060 + b) * Math.sin(t)];
    };
    for (let y = 1.50; y <= 1.5901; y += 0.006) rings.push(((yy) => (t) => R(yy, t, 0))(y));
    rings.push((t) => R(1.594, t, -0.008), (t) => R(1.595, t, -0.016));
    tube(sc, rings, 40, (p) => [p[0], 0, p[2] - 0.006]);
  }


  /* ============================================================== ПАНАМА */
  function buildBoonie(K) {
    const HW = () => K.W({ head: 1 });
    const hat = new Part(K, K.G.hat, HW);
    const cz = 0.006;
    const CROWN = [[0.1045, 1.712], [0.104, 1.700], [0.1035, 1.735], [0.100, 1.768], [0.094, 1.795],
      [0.083, 1.813], [0.062, 1.825], [0.034, 1.832], [0.006, 1.834]];
    const cPt = (r, y, t) => {
      const k = 1 + (K.n1(t * 1.5 + 11, y * 12) - 0.5) * 0.05;
      return [r * 0.88 * k * Math.cos(t), y, cz - r * 1.1 * k * Math.sin(t)];
    };
    const rings = [(t) => cPt(0.100, 1.716, t)];
    for (let i = 1; i < CROWN.length - 1; i++) {
      const [r0, y0] = CROWN[i], [r1, y1] = CROWN[i + 1];
      for (let k = 0; k < 3; k++) rings.push(((r, y) => (t) => cPt(r, y, t))(lerp(r0, r1, k / 3), lerp(y0, y1, k / 3)));
    }
    rings.push((t) => cPt(0.0005, 1.834, t));
    tube(hat, rings, 48, (p) => [p[0], p[1] - 1.7, p[2] - cz]);
    /* лента тульи с петлями под маскировку */
    const bandS = (u, v) => {
      const t = u * TAU, y = lerp(1.702, 1.730, v);
      const p = cPt(lerp(0.104, 0.1035, v), y, t);
      return [p, norm([Math.cos(t) / 0.88, 0, -Math.sin(t) / 1.1])];
    };
    slab(hat, 48, 2, bandS, { t0: 0.0006, t1: 0.0028, wrapU: true });
    for (let k = 0; k < 12; k++) {
      const [p, n] = bandS((k + 0.5) / 12, 0.5);
      box(hat, add(p, scale(n, 0.0045)), [0.0045, 0.012, 0.0012], basisN(n), 0.001, 2);
    }
    /* поля: волнистые, опущены к краю, со строчкой */
    const brim = (u, v) => {
      const t = u * TAU;
      const w = 0.064 * v;
      const droop = (0.004 + 0.034 * Math.pow(v, 1.5)) * (1 + 0.22 * Math.sin(3 * t + 0.7) + 0.14 * Math.sin(5 * t + 2.1));
      return [(0.0915 + w) * Math.cos(t), 1.703 - droop, cz - (0.114 + w) * Math.sin(t)];
    };
    const brimN = (u, v) => {
      const e = 1e-3;
      const a = sub(brim(u + e, v), brim(u - e, v)), b = sub(brim(u, Math.min(1, v + e)), brim(u, Math.max(0, v - e)));
      let n = norm(cross(a, b));
      if (n[1] < 0) n = scale(n, -1);
      return n;
    };
    slab(hat, 72, 8, (u, v) => [brim(u, v), brimN(u, v)], { t0: -0.0015, t1: 0.003, wrapU: true });
    for (const v0 of [0.3, 0.55, 0.8]) {
      slab(hat, 72, 1, (u, v) => { const vv = v0 + (v - 0.5) * 0.03; return [brim(u, vv), brimN(u, vv)]; },
        { t0: 0.0015, t1: 0.0007, wrapU: true });
    }
    const edge = [], en = [];
    for (let k = 0; k <= 96; k++) { const u = (k / 96) % 1; edge.push(brim(u, 1)); en.push(brimN(u, 1)); }
    sweep(hat, edge, en, (t) => [Math.cos(t) * 0.0028, Math.sin(t) * 0.0028], 6);
    /* шнурок под подбородком */
    const cordP = [[1.45, 1.62], [1.36, 1.98], [1.05, 2.30], [0.62, 2.55], [0, 2.66], [-0.62, 2.55], [-1.05, 2.30], [-1.36, 1.98], [-1.45, 1.62]]
      .map(([th, ph]) => headPt(th, ph, MASKF, 0.006));
    const C1 = chaikin(cordP, 2);
    sweep(new Part(K, K.G.headRubber, HW), C1, C1.map((p) => norm(sub(p, HEAD_C))), (t) => [Math.cos(t) * 0.0016, Math.sin(t) * 0.0016], 6);
  }

  /* ============================================================= ПЛИТНИК */
  /* Жёсткая плита не повторяет живот: её тыльная поверхность — слегка
     изогнутая плоскость, касающаяся груди. Возвращает z(x, y) тыла плиты. */
  function plateSurface(K, back, y0, y1, hw) {
    const sg = back ? 1 : -1, R = 0.30, d0 = 0.006;
    const m = (y) => {
      let best = sg > 0 ? -1e9 : 1e9;
      for (let i = 0; i <= 16; i++) {
        const x = lerp(-hw(y), hw(y), i / 16);
        const th = torsoTheta(y, x, back);
        const need = torsoPt(K, y, th, true)[2] + sg * d0 + sg * x * x / (2 * R);
        best = sg > 0 ? Math.max(best, need) : Math.min(best, need);
      }
      return best;
    };
    const k = (m(y1) - m(y0)) / (y1 - y0);
    let z0 = sg > 0 ? -1e9 : 1e9;
    for (let i = 0; i <= 20; i++) {
      const y = lerp(y0, y1, i / 20);
      const c = m(y) - k * (y - y0);
      z0 = sg > 0 ? Math.max(z0, c) : Math.min(z0, c);
    }
    return { z: (x, y) => z0 + k * (y - y0) - sg * x * x / (2 * R), slope: k, sg };
  }

  /* Панель плиты: лицевая поверхность — карта высот, борта — до тела. */
  function platePanel(part, K, o) {
    const { y0, y1, hw, surf, thick } = o;
    const sg = surf.sg;
    const X = (u, v) => { const y = lerp(y0, y1, v); return lerp(hw(y), -hw(y), u); };
    const Hh = y1 - y0;
    const pil = (u, v) => {
      const y = lerp(y0, y1, v), w = 2 * hw(y);
      const e = Math.min(u * w, (1 - u) * w, v * Hh, (1 - v) * Hh);
      return 0.45 + 0.55 * ss(e / 0.016);
    };
    const front = (u, v) => { const x = X(u, v), y = lerp(y0, y1, v); return [x, y, surf.z(x, y) + sg * thick * pil(u, v)]; };
    const body = (u, v) => {
      const x = X(u, v), y = lerp(y0, y1, v);
      const th = torsoTheta(y, x, sg > 0);
      return add(torsoPt(K, y, th, true), scale(torsoN(K, y, th), 0.004));
    };
    const NU = o.NU || 16, NV = o.NV || 16;
    grid(part, NU, NV, front, { out: () => [0, 0, sg] });
    const c = [0, (y0 + y1) / 2, surf.z(0, (y0 + y1) / 2) - sg * 0.1];
    const wall = (n, f) => grid(part, n, 1, (a, w) => (w ? front : body)(f(a)[0], f(a)[1]),
      { out: (p) => { const q = sub(p, c); q[2] = 0; return q; } });
    wall(NV, (a) => [0, a]); wall(NV, (a) => [1, a]); wall(NU, (a) => [a, 0]); wall(NU, (a) => [a, 1]);
    return {
      front: (x, y) => {
        const v = U.clamp01((y - y0) / Hh), w = hw(y);
        return surf.z(x, y) + sg * thick * pil(U.clamp01((w - x) / (2 * w)), v);
      }
    };
  }

  /* Ряды строп MOLLE: лента 25 мм, прошивка через 38 мм. */
  function molleRows(part, zf, sg, x0, x1, ys) {
    const L = x1 - x0;
    for (const yc of ys) {
      slab(part, Math.max(4, Math.round(L / 0.006)), 1, (u, v) => {
        const x = lerp(x1, x0, u), y = yc + (v - 0.5) * 0.025;
        return [[x, y, zf(x, y)], [0, 0, sg]];
      }, {
        t0: 0, t1: (u) => {
          const d = Math.abs((((u * L) / 0.038) % 1) - 0.5);
          return 0.0026 * (0.3 + 0.7 * ss((0.5 - d) / 0.08));
        }
      });
    }
  }

  function pouchBasis(zf, x, y) {
    const e = 1e-3;
    const tx = norm([2 * e, 0, zf(x + e, y) - zf(x - e, y)]);
    const ty = norm([0, 2 * e, zf(x, y + e) - zf(x, y - e)]);
    return [tx, ty, cross(tx, ty)];
  }

  function buildVest(K) {
    const G = K.G;
    const gear = new Part(K, G.gear, vestW(K));
    const hard = new Part(K, G.hard, vestW(K));
    const rub = new Part(K, G.rubber, vestW(K));

    /* --- перед --- */
    const fy0 = 1.07, fy1 = 1.432;
    const fhw = (y) => 0.128 - Math.max(0, y - 1.35) * 0.30 - 0.004 * ss((y - 1.41) / 0.02);
    const fS = plateSurface(K, false, fy0, fy1, fhw);
    const F = platePanel(gear, K, { y0: fy0, y1: fy1, hw: fhw, surf: fS, thick: 0.026, NU: 18, NV: 20 });
    const fz = F.front;
    molleRows(gear, fz, -1, -0.118, 0.118, [1.092, 1.130, 1.168, 1.206]);
    /* три подсумка под магазины АК */
    for (const x of [-0.079, 0, 0.079]) {
      const y = 1.140;
      const bs = pouchBasis(fz, x, y);
      const n = scale(bs[2], -1);
      const c = add([x, y, fz(x, y)], scale(n, 0.027));
      box(gear, c, [0.035, 0.072, 0.024], bs, 0.009, 3);
      /* клапан с кантом и тянущий язычок */
      box(gear, add(add(c, scale(bs[1], 0.073)), scale(n, 0.002)), [0.037, 0.005, 0.0265], bs, 0.003, 2);
      box(gear, add(add(c, scale(bs[1], 0.054)), scale(n, 0.0265)), [0.037, 0.024, 0.0034], bs, 0.0025, 2);
      box(rub, add(add(c, scale(bs[1], 0.026)), scale(n, 0.0295)), [0.009, 0.014, 0.0022], bs, 0.0015, 2);
      /* стропы MOLLE поперёк подсумка */
      for (const dy of [-0.030, -0.058]) box(gear, add(add(c, scale(bs[1], dy)), scale(n, 0.0245)), [0.036, 0.0065, 0.0016], bs, 0.0012, 2);
    }
    /* админ-подсумок */
    {
      const y = 1.258, bs = pouchBasis(fz, 0, y), n = scale(bs[2], -1);
      box(gear, add([0, y, fz(0, y)], scale(n, 0.012)), [0.100, 0.030, 0.0115], bs, 0.006, 3);
      box(gear, add([0, y + 0.021, fz(0, y + 0.021)], scale(n, 0.025)), [0.101, 0.012, 0.0025], bs, 0.002, 2);
    }
    /* поле липучки и нашивка с эмблемой */
    slab(gear, 6, 5, (u, v) => {
      const x = lerp(0.056, -0.056, u), y = lerp(1.303, 1.392, v);
      return [[x, y, fz(x, y)], [0, 0, -1]];
    }, { t0: 0, t1: 0.0014 });
    slab(new Part(K, G.patch, vestW(K)), 4, 4, (u, v) => {
      const x = lerp(0.037, -0.037, u), y = lerp(1.311, 1.384, v);
      return [[x, y, fz(x, y)], [0, 0, -1]];
    }, { t0: 0.0014, t1: 0.0016, uv: [1, 1] });

    /* --- спина --- */
    const by0 = 1.082, by1 = 1.448;
    const bhw = (y) => 0.136 - 0.012 * ss((y - 1.41) / 0.035) - Math.max(0, y - 1.43) * 0.6;
    const bS = plateSurface(K, true, by0, by1, bhw);
    const Bk = platePanel(gear, K, { y0: by0, y1: by1, hw: bhw, surf: bS, thick: 0.024, NU: 18, NV: 20 });
    const bz = Bk.front;
    molleRows(gear, bz, 1, -0.124, 0.124, [1.105, 1.143, 1.181, 1.219, 1.257, 1.295, 1.333, 1.371]);
    /* сбрасываемая панель */
    {
      const y = 1.225, bs = pouchBasis(bz, 0, y);
      const c = add([0, y, bz(0, y)], scale(bs[2], 0.027));
      box(gear, c, [0.104, 0.118, 0.026], bs, 0.012, 3);
      const pz = (xx, yy) => c[2] + 0.026 + (yy - y) * bS.slope;
      molleRows(gear, pz, 1, -0.094, 0.094, [1.16, 1.198, 1.236, 1.274]);
      /* эвакуационная петля */
      const hy = by1 - 0.006, hz = bz(0, hy);
      const lp = chaikin([[-0.034, hy, hz], [-0.026, hy + 0.028, hz + 0.012], [0.026, hy + 0.028, hz + 0.012], [0.034, hy, hz]], 2);
      sweep(gear, lp, lp.map(() => norm([0, 0.3, 1])), (t) => [Math.cos(t) * 0.0125, Math.sin(t) * 0.0028], 8);
    }

    /* --- камербанд по бокам --- */
    const cy0 = 1.075, cy1 = 1.258;
    for (const sd of [1, -1]) {
      const cS = (u, v) => {
        const y = lerp(cy0, cy1, v);
        const tf = torsoTheta(y, sd * 0.112, false), tb = torsoTheta(y, sd * 0.118, true);
        const th = sd > 0 ? lerp(tf, tb - TAU, u) : lerp(tf, tb, u);
        return [torsoPt(K, y, th, true), torsoN(K, y, th)];
      };
      const cth = (u, v) => 0.012 * (0.5 + 0.5 * ss(Math.min(v, 1 - v) / 0.2));
      slab(gear, 24, 6, cS, { t0: 0.004, t1: cth });
      for (const v0 of [0.18, 0.40, 0.62, 0.84]) {
        slab(gear, 24, 1, (u, v) => cS(u, v0 + (v - 0.5) * 0.137), {
          t0: (u) => 0.004 + cth(u, v0),
          t1: (u) => 0.0025 * (0.3 + 0.7 * ss((0.5 - Math.abs(((u * 6) % 1) - 0.5)) / 0.08))
        });
      }
      /* боковой подсумок: слева — радиостанция, справа — аптечка */
      const [p, n] = cS(0.5, 0.52);
      const bs = basisN(n);
      const sz = sd < 0 ? [0.030, 0.062, 0.024] : [0.042, 0.042, 0.020];
      const pc = add(p, scale(n, 0.017 + sz[2]));
      box(gear, pc, sz, bs, 0.008, 3);
      box(gear, add(pc, scale(bs[1], sz[1] - 0.004)), [sz[0] + 0.002, 0.006, sz[2] + 0.002], bs, 0.003, 2);
      if (sd < 0) {
        const a0 = add(pc, scale(bs[1], sz[1]));
        const ant = [a0, add(a0, [0, 0.06, 0.006]), add(a0, [0, 0.12, 0.018])];
        sweep(rub, ant, [n, n, n], (t) => [Math.cos(t) * 0.0035, Math.sin(t) * 0.0035], 6, { caps: true });
      }
    }

    /* --- плечевые лямки поверх трапеции --- */
    for (const sd of [1, -1]) {
      const x = sd * 0.100;
      const cc = [x, 1.43, 0];
      const pts = [];
      for (let k = 0; k <= 24; k++) {
        const b = lerp(0.18, Math.PI - 0.12, k / 24);
        const d = [0, Math.sin(b), -Math.cos(b)];
        let lo = 0, hi = 0.3;
        for (let i = 0; i < 30; i++) {
          const m = (lo + hi) / 2;
          if (insideTorso(add(cc, scale(d, m)))) lo = m; else hi = m;
        }
        pts.push(add(cc, scale(d, lo + 0.010)));
      }
      const f0 = [x, fy1 - 0.012, fz(x, fy1 - 0.012) + 0.006], b0 = [x, by1 - 0.010, bz(x, by1 - 0.010) - 0.006];
      const P = chaikin([f0].concat(pts.slice(3, -2)).concat([b0]), 2);
      const N = P.map((p) => { const d = sub(p, cc); d[0] = 0; return norm(d); });
      sweep(gear, P, N, (t) => { const e = U.superellipse(0.027, 0.0068, 3.5, t); return [e[0], e[1]]; }, 14);
      const bp = pouchBasis(fz, x, fy1 - 0.03);
      box(hard, add([x, fy1 - 0.03, fz(x, fy1 - 0.03)], scale(bp[2], -0.004)), [0.018, 0.010, 0.0035], bp, 0.002, 2);
    }
  }

  /* ================================================================ ПОЯС */
  function buildBelt(K) {
    const gear = new Part(K, K.G.gear, beltW(K));
    const y0 = 0.972, y1 = 1.028;
    const S = (u, v) => {
      const y = lerp(y0, y1, v), th = u * TAU;
      return [torsoPt(K, y, th, true), torsoN(K, y, th)];
    };
    slab(gear, 72, 4, S, { t0: 0.006, t1: (u, v) => 0.011 * (0.55 + 0.45 * ss(Math.min(v, 1 - v) / 0.25)), wrapU: true });
    /* пряжка «кобра» */
    const [pf, nf] = S(0.25, 0.5);
    box(new Part(K, K.G.hard, beltW(K)), add(pf, scale(nf, 0.02)), [0.028, 0.021, 0.006], basisN(nf), 0.004, 3);
    /* подсумки: положение в долях оборота (0,25 — перед, 0,75 — спина) */
    const pouches = [
      [0.12, [0.034, 0.046, 0.017]],   // спаренный пистолетный — справа
      [0.06, [0.022, 0.040, 0.016]],   // турникет
      [0.40, [0.046, 0.052, 0.026]],   // утилитарный — слева
      [0.62, [0.050, 0.042, 0.022]],   // сброс — сзади слева
      [0.80, [0.082, 0.046, 0.034]]    // аптечка — сзади
    ];
    for (const [u, sz] of pouches) {
      const [p, n] = S(u, 0.5);
      const bs = basisN(n);
      const c = add(add(p, scale(n, 0.017 + sz[2])), [0, -sz[1] * 0.45, 0]);
      box(gear, c, sz, bs, 0.008, 3);
      box(gear, add(c, add(scale(bs[1], sz[1] - 0.006), scale(n, 0.001))), [sz[0] + 0.002, 0.0065, sz[2] + 0.002], bs, 0.003, 2);
    }
  }

  /* ============================================================== СБОРКА */
  /* cfg: { seed, head: 'helmet' | 'boonie', mask } */
  function buildSoldier(G, M, BI, rest, cfg) {
    const h = M.H / 1.80;
    const K = {
      G, M, h, BI, W: makeW(BI),
      n1: U.fbm(cfg.seed + 1, 3, 0.5, 2.1),
      n2: U.fbm(cfg.seed + 7, 2, 0.5, 2.3),
      R: (n) => [rest[n][0] / h, rest[n][1] / h, rest[n][2] / h]
    };
    K.masked = cfg.mask !== false;
    buildTorso(K);
    buildPelvis(K);
    for (const s of [1, -1]) {
      buildArm(K, s);
      buildHand(K, s);
      buildLeg(K, s);
      buildBoot(K, s);
    }
    buildHead(K);
    if (cfg.mask !== false) buildBalaclava(K); else buildFaceKit(K);
    if (cfg.head === 'boonie') buildBoonie(K); else buildHelmet(K);
    buildVest(K);
    buildBelt(K);
    return K;
  }

  return { GROUPS, newGroups, makeW, buildSoldier, torsoPt, headPt, headLocal, HEAD_C, EYE_Y, EYE_X, FACE };
});