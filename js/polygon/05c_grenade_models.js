/* ==========================================================================
   AEGIS · модели гранат М67 (осколочная) и М84 (светозвуковая).
   Перенесены из присланных страниц m67_grenade_model.html и
   flashbang_m84.html (модули src/m67/model.js и src/m84/model.js) без
   изменений геометрии: корпус, запал, рычаг (спусковая скоба), чека с
   кольцом, предохранительный зажим. Текстуры М67 запекаются видеокартой
   один раз при загрузке полигона.
   ========================================================================== */
(function (root) {
  'use strict';
  const M67 = (function () {
// src/m67/model.js
const THREE8 = window.THREE;
const { mergeGeometries } = window.THREE_ADDONS["utils/BufferGeometryUtils.js"];
var R = 0.03175;
var HOLE_R = 98e-4;
var COLLAR_Y = 0.0328;
var FUZE_BASE_Y = 0.0318;
var PIN_C = new THREE8.Vector3(0.0114, 0.047, 0);
var HINGE = new THREE8.Vector3(-0.01, 0.0532, 0);
var THK = 9e-4;
var CROWN = 1e-3;
var PIN_TRAVEL = 0.024;
var CLIP_Y = 0.0395;
var MV = {
  FZ: [0.02, 0.3],
  FS: [0.32, 0.37],
  PN: [0.39, 0.43],
  RG: [0.45, 0.49],
  CL: [0.51, 0.55],
  LO: [0.58, 0.74],
  LI: [0.76, 0.9],
  LE: [0.92, 0.98]
};
var QI = { low: 0, med: 1, high: 2 };
var _a = new THREE8.Vector3();
var _b = new THREE8.Vector3();
var _c = new THREE8.Vector3();
var _n2 = new THREE8.Vector3();
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var lerp = (a, b, t) => a + (b - a) * t;
var sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function gridGeom(nu, nv, pos, rect, expect) {
  const n = (nu + 1) * (nv + 1);
  const P = new Float32Array(n * 3), UV = new Float32Array(n * 2), idx = [];
  const p = new THREE8.Vector3();
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const k = j * (nu + 1) + i, u = i / nu, v = j / nv;
    pos(u, v, p);
    P.set([p.x, p.y, p.z], k * 3);
    UV[k * 2] = lerp(rect[0], rect[2], u);
    UV[k * 2 + 1] = lerp(rect[1], rect[3], v);
  }
  let flip = false;
  if (expect) {
    const i = nu >> 1, j = nv >> 1, w = nu + 1;
    const A = j * w + i, B = A + 1, D = A + w + 1;
    _a.fromArray(P, A * 3);
    _b.fromArray(P, B * 3).sub(_a);
    _c.fromArray(P, D * 3).sub(_a);
    _n2.crossVectors(_b, _c);
    expect((i + 0.5) / nu, (j + 0.5) / nv, p);
    flip = _n2.dot(p) < 0;
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    if (flip) idx.push(a, d, b, a, c, d);
    else idx.push(a, b, d, a, d, c);
  }
  const g = new THREE8.BufferGeometry();
  g.setAttribute("position", new THREE8.BufferAttribute(P, 3));
  g.setAttribute("uv", new THREE8.BufferAttribute(UV, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function latheGeom(strips, seg, v0, v1, inward = false) {
  let total = 0;
  const lens = strips.map((s) => {
    const L = [0];
    for (let i = 1; i < s.length; i++) L.push(L[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
    return L;
  });
  const offs = [];
  for (const L of lens) {
    offs.push(total);
    total += L[L.length - 1];
  }
  const P = [], N = [], UV = [], idx = [], ranges = [];
  let base = 0;
  strips.forEach((s, si) => {
    const vs = [];
    for (let j = 0; j < s.length; j++) {
      let nr = 0, ny = 0;
      for (const k of [j - 1, j]) {
        if (k < 0 || k + 1 >= s.length) continue;
        const dr = s[k + 1][0] - s[k][0], dy = s[k + 1][1] - s[k][1], l2 = Math.hypot(dr, dy) || 1;
        nr += dy / l2;
        ny += -dr / l2;
      }
      const l = Math.hypot(nr, ny) || 1;
      nr /= l;
      ny /= l;
      if (inward) {
        nr = -nr;
        ny = -ny;
      }
      const v = lerp(v0, v1, (offs[si] + lens[si][j]) / total);
      vs.push(v);
      for (let i = 0; i <= seg; i++) {
        const u = i / seg, ph = (u - 0.5) * Math.PI * 2, sp = Math.sin(ph), cp = Math.cos(ph);
        P.push(s[j][0] * sp, s[j][1], s[j][0] * cp);
        N.push(nr * sp, ny, nr * cp);
        UV.push(u, v);
      }
    }
    ranges.push([vs[0], vs[vs.length - 1]]);
    for (let j = 0; j < s.length - 1; j++) for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      if (inward) idx.push(a, d, b, a, c, d);
      else idx.push(a, b, d, a, d, c);
    }
    base += s.length * (seg + 1);
  });
  const g = new THREE8.BufferGeometry();
  g.setAttribute("position", new THREE8.Float32BufferAttribute(P, 3));
  g.setAttribute("normal", new THREE8.Float32BufferAttribute(N, 3));
  g.setAttribute("uv", new THREE8.Float32BufferAttribute(UV, 2));
  g.setIndex(idx);
  g.userData.ranges = ranges;
  return g;
}
function remapUV(g, rect) {
  const uv = g.attributes.uv;
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
    v0 = Math.min(v0, v);
    v1 = Math.max(v1, v);
  }
  const du = u1 - u0 || 1, dv = v1 - v0 || 1;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, lerp(rect[0], rect[2], (uv.getX(i) - u0) / du), lerp(rect[1], rect[3], (uv.getY(i) - v0) / dv));
  }
  return g;
}
function merge(list) {
  const flat = list.map((g) => {
    const x = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(x.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") x.deleteAttribute(k);
    x.clearGroups();
    return x;
  });
  const m = mergeGeometries(flat, false);
  for (const g of list) g.dispose();
  for (const g of flat) g.dispose();
  return m;
}
function bodyGeometry(q) {
  const nu = [36, 56, 76][q], nr = [20, 30, 38][q];
  const th0 = Math.asin(HOLE_R / R);
  let th = [];
  for (let i = 0; i <= nr; i++) th.push(Math.PI - (Math.PI - th0) * i / nr);
  for (const d of [-0.05, -0.028, -0.016, -7e-3, 0, 7e-3, 0.016, 0.028, 0.05]) th.push(Math.PI / 2 + d);
  th.sort((a, b) => b - a);
  th = th.filter((t, i) => i === 0 || th[i - 1] - t > 4e-3 || i === th.length - 1);
  const bead = (t) => {
    const w = Math.abs(t - Math.PI / 2) * R / 9e-4;
    return w < 1 ? 11e-5 * (1 - w * w) ** 2 : 0;
  };
  const rows = th.map((t) => {
    const r = R + bead(t), dr = (bead(t + 1e-4) - bead(t - 1e-4)) / 2e-4;
    const st = Math.sin(t), ct = Math.cos(t);
    let nxz = r * st - dr * ct, ny = r * ct + dr * st;
    const l = Math.hypot(nxz, ny);
    nxz /= l;
    ny /= l;
    return { r: r * st, y: r * ct, nr: nxz, ny, v: 1 - t / Math.PI };
  });
  const y0 = rows[rows.length - 1].y;
  const collar = [
    { r: HOLE_R, y: y0, nr: 1, ny: 0, v: 0.903 },
    { r: HOLE_R, y: COLLAR_Y - 6e-4, nr: 1, ny: 0, v: 0.93 },
    { r: HOLE_R - 3e-4, y: COLLAR_Y - 1e-4, nr: 0.6, ny: 0.8, v: 0.95 },
    { r: HOLE_R - 8e-4, y: COLLAR_Y, nr: 0, ny: 1, v: 0.965 },
    { r: 8e-3, y: COLLAR_Y, nr: 0, ny: 1, v: 0.995 }
  ];
  const P = [], N = [], UV = [], idx = [];
  let base = 0;
  for (const strip of [rows, collar]) {
    for (const row of strip) for (let i = 0; i <= nu; i++) {
      const u = i / nu, ph = (u - 0.5) * Math.PI * 2, sp = Math.sin(ph), cp = Math.cos(ph);
      P.push(row.r * sp, row.y, row.r * cp);
      N.push(row.nr * sp, row.ny, row.nr * cp);
      UV.push(u, row.v);
    }
    for (let j = 0; j < strip.length - 1; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
    base += strip.length * (nu + 1);
  }
  const g = new THREE8.BufferGeometry();
  g.setAttribute("position", new THREE8.Float32BufferAttribute(P, 3));
  g.setAttribute("normal", new THREE8.Float32BufferAttribute(N, 3));
  g.setAttribute("uv", new THREE8.Float32BufferAttribute(UV, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return { geom: g, vHole: rows[rows.length - 1].v };
}
var FUZE_STRIPS = [
  [[79e-4, FUZE_BASE_Y], [79e-4, 0.033]],
  // резьба (внутри горловины)
  [[79e-4, 0.033], [0.0104, 0.033]],
  [[0.0104, 0.033], [0.0106, 0.0333], [0.0106, 0.0349], [0.0104, 0.0352]],
  // фланец на бурте корпуса
  [[0.0104, 0.0352], [95e-4, 0.0353]],
  [[95e-4, 0.0353], [95e-4, 0.0518], [93e-4, 0.0526], [88e-4, 0.0533], [82e-4, 0.0537]],
  [[82e-4, 0.0537], [78e-4, 0.0539], [4e-3, 0.0539], [0, 0.0539]]
];
var BORE_R = 33e-4;
var BORE_TOP = 0.0527;
function fuzeGeometry(q) {
  const seg = [20, 32, 44][q];
  const lathe = latheGeom(FUZE_STRIPS, seg, MV.FZ[0], MV.FZ[1]);
  const ranges = lathe.userData.ranges;
  const fs = MV.FS;
  const bore = remapUV(
    latheGeom([[[BORE_R, FUZE_BASE_Y], [BORE_R, BORE_TOP]], [[BORE_R, BORE_TOP], [0, BORE_TOP]]], 16, 0, 1, true),
    [0.7, fs[0], 0.99, fs[1]]
  );
  const lug = new THREE8.Shape();
  lug.moveTo(7e-3, 0.0432);
  lug.lineTo(PIN_C.x, 0.0432);
  lug.absarc(PIN_C.x, PIN_C.y, 38e-4, -Math.PI / 2, Math.PI / 2, false);
  lug.lineTo(7e-3, PIN_C.y + 38e-4);
  lug.lineTo(7e-3, 0.0432);
  const lugs = [5e-3, -62e-4].map((z, i) => {
    const g2 = new THREE8.ExtrudeGeometry(lug, { depth: 12e-4, bevelEnabled: false, curveSegments: [4, 6, 8][q] });
    g2.translate(0, 0, z);
    return remapUV(g2, [0.02 + i * 0.2, fs[0], 0.2 + i * 0.2, fs[1]]);
  });
  const lip = new THREE8.BoxGeometry(16e-4, 12e-4, 9e-3).translate(-98e-4, 0.0529, 0);
  const striker = new THREE8.BoxGeometry(0.012, 7e-4, 68e-4).translate(12e-4, 0.05425, 0);
  remapUV(lip, [0.42, fs[0], 0.52, fs[1]]);
  remapUV(striker, [0.54, fs[0], 0.68, fs[1]]);
  const g = merge([lathe, bore, ...lugs, lip, striker]);
  return { geom: g, ranges };
}
function sectionCapGeometry() {
  const outer = [];
  for (const s of FUZE_STRIPS) for (const p of s) {
    const last = outer[outer.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) outer.push(p);
  }
  const sh = new THREE8.Shape();
  sh.moveTo(outer[0][0], outer[0][1]);
  for (let i = 1; i < outer.length; i++) sh.lineTo(outer[i][0], outer[i][1]);
  for (let i = outer.length - 2; i >= 0; i--) sh.lineTo(-outer[i][0], outer[i][1]);
  sh.lineTo(-BORE_R, FUZE_BASE_Y);
  sh.lineTo(-BORE_R, BORE_TOP);
  sh.lineTo(BORE_R, BORE_TOP);
  sh.lineTo(BORE_R, FUZE_BASE_Y);
  const g = new THREE8.ShapeGeometry(sh);
  g.rotateY(-Math.PI / 2);
  g.translate(3e-5, 0, 0);
  return g;
}
function leverCurve() {
  const pts = [
    [-96e-4, 0.0517],
    [-0.011, 0.0521],
    [-0.0114, 0.0536],
    [-0.0102, 0.0552],
    [-74e-4, 0.0556],
    [0, 0.0556],
    [8e-3, 0.0556],
    [0.012, 0.055],
    [0.014, 0.053],
    [0.0148, 0.05],
    [0.015, 0.0455],
    [0.0153, 0.0405]
  ];
  const Rl = R + 26e-4;
  for (let k = 0; k <= 8; k++) {
    const t = lerp(0.5, Math.PI / 2 + 0.08, k / 8);
    pts.push([Rl * Math.sin(t), Rl * Math.cos(t)]);
  }
  return new THREE8.CatmullRomCurve3(pts.map((p) => new THREE8.Vector3(p[0], p[1], 0)), false, "centripetal");
}
function leverWidth(t, tPin) {
  const hook = sstep(0, 0.07, t);
  return lerp(92e-4, 0.016, hook) - 55e-4 * sstep(tPin + 0.04, 1, t);
}
function leverGeometry(q, curve) {
  const nt = [28, 48, 72][q], ns = [3, 6, 8][q];
  const T2 = [], C = [], Nn = [];
  for (let i = 0; i <= nt; i++) {
    const t = i / nt, c = curve.getPointAt(t), tg = curve.getTangentAt(t);
    T2.push(t);
    C.push(c);
    Nn.push(new THREE8.Vector3(-tg.y, tg.x, 0));
  }
  let tPin = 0, best = Infinity;
  for (let i = 0; i <= nt; i++) {
    const d = C[i].distanceToSquared(PIN_C);
    if (d < best) {
      best = d;
      tPin = T2[i];
    }
  }
  const at = (t, out) => {
    const f = Math.min(nt - 1e-6, t * nt), i = Math.floor(f), s = f - i;
    out.c = _a.copy(C[i]).lerp(C[i + 1], s);
    out.n = _b.copy(Nn[i]).lerp(Nn[i + 1], s).normalize();
    return out;
  };
  const tmp = {};
  const surf = (t, s, side, out) => {
    at(t, tmp);
    const w = leverWidth(t, tPin), lift = CROWN * (1 - s * s) + side * THK * 0.5;
    return out.set(tmp.c.x + tmp.n.x * lift, tmp.c.y + tmp.n.y * lift, s * w * 0.5);
  };
  const nrm = (t, out) => {
    at(t, tmp);
    return out.copy(tmp.n);
  };
  const parts = [];
  parts.push(gridGeom(nt, ns, (u, v, o) => surf(u, 1 - 2 * v, 1, o), [0.01, MV.LO[0], 0.99, MV.LO[1]], (u, v, o) => nrm(u, o)));
  parts.push(gridGeom(nt, ns, (u, v, o) => surf(u, 2 * v - 1, -1, o), [0.01, MV.LI[0], 0.99, MV.LI[1]], (u, v, o) => nrm(u, o).negate()));
  const le = MV.LE, eh = (le[1] - le[0]) / 4;
  [1, -1].forEach((s, k) => {
    parts.push(gridGeom(
      nt,
      1,
      (u, v, o) => surf(u, s, v * 2 - 1, o),
      [0.01, le[0] + k * eh, 0.99, le[0] + (k + 1) * eh * 0.8],
      (u, v, o) => o.set(0, 0, s)
    ));
  });
  [0, 1].forEach((t, k) => {
    parts.push(gridGeom(
      ns,
      1,
      (u, v, o) => surf(t, 1 - 2 * u, v * 2 - 1, o),
      [0.01 + k * 0.1, le[0] + 2 * eh, 0.09 + k * 0.1, le[0] + 2.8 * eh],
      (u, v, o) => o.copy(curve.getTangentAt(t)).multiplyScalar(t === 0 ? -1 : 1)
    ));
  });
  const fl = new THREE8.Shape();
  fl.moveTo(76e-4, 0.0552);
  fl.lineTo(0.012, 0.0548);
  fl.quadraticCurveTo(0.0146, 0.0535, 0.0149, 0.049);
  fl.lineTo(0.0149, PIN_C.y);
  fl.absarc(PIN_C.x, PIN_C.y, 35e-4, 0, -Math.PI, true);
  fl.lineTo(76e-4, 0.0552);
  const wPin = leverWidth(tPin, tPin);
  [1, -1].forEach((s, k) => {
    const g2 = new THREE8.ExtrudeGeometry(fl, { depth: 8e-4, bevelEnabled: false, curveSegments: [4, 6, 8][q] });
    g2.translate(0, 0, s > 0 ? wPin * 0.5 - 9e-4 : -wPin * 0.5 + 1e-4);
    parts.push(remapUV(g2, [0.22 + k * 0.2, le[0] + 3 * eh, 0.4 + k * 0.2, le[1]]));
  });
  const g = merge(parts);
  g.translate(-HINGE.x, -HINGE.y, -HINGE.z);
  return { geom: g, tPin };
}
var PIN_Z0 = -88e-4;
var PIN_Z1 = 0.01;
var LEG_R = 5e-4;
var EYE_R = 11e-4;
var EYE_Z = 0.011;
var RING_RM = 0.0115;
var RING_W = 9e-4;
var RING_TILT = 0.95;
function pinGeometry(q) {
  const rs = [6, 8, 10][q], pn = MV.PN;
  const legs = [1, -1].map((s, k) => {
    const g = new THREE8.CylinderGeometry(LEG_R, LEG_R, PIN_Z1 - PIN_Z0, rs, 1, true);
    g.rotateX(Math.PI / 2).translate(0, s * LEG_R, (PIN_Z0 + PIN_Z1) / 2);
    return remapUV(g, [0.02 + k * 0.3, pn[0], 0.3 + k * 0.3, pn[1]]);
  });
  const a1 = Math.PI - Math.asin(LEG_R / EYE_R), pts = [];
  for (let k = 0; k <= 16; k++) {
    const a = a1 - k / 16 * 2 * a1;
    pts.push(new THREE8.Vector3(0, EYE_R * Math.sin(a), EYE_Z + EYE_R * Math.cos(a)));
  }
  const eye = remapUV(new THREE8.TubeGeometry(new THREE8.CatmullRomCurve3(pts), [8, 12, 16][q], LEG_R, rs, false), [0.64, pn[0], 0.98, pn[1]]);
  const tip = new THREE8.CylinderGeometry(LEG_R * 0.8, LEG_R, 38e-4, rs, 1, false);
  tip.rotateX(Math.PI / 2).translate(0, 0, -19e-4);
  remapUV(tip, [0.02, pn[0], 0.3, pn[1]]);
  return { legs: merge([...legs, eye]), tip };
}
function ringGeometry(q) {
  const g = new THREE8.TorusGeometry(RING_RM, RING_W, [6, 8, 10][q], [24, 40, 56][q]);
  remapUV(g, [0.01, MV.RG[0], 0.99, MV.RG[1]]);
  const a = new THREE8.Vector3(0, -Math.sin(RING_TILT), Math.cos(RING_TILT));
  const x = new THREE8.Vector3(1, 0, 0);
  const m = new THREE8.Matrix4().makeBasis(a, x, new THREE8.Vector3().crossVectors(a, x));
  m.setPosition(a.clone().multiplyScalar(RING_RM));
  g.applyMatrix4(m);
  return { geom: g, center: a.multiplyScalar(RING_RM) };
}
function clipCurve(curve, tPin) {
  let best = Infinity, c = null, t0 = 0;
  for (let i = 0; i <= 400; i++) {
    const t = i / 400, p = curve.getPointAt(t), d = Math.abs(p.y - CLIP_Y);
    if (t > tPin && d < best) {
      best = d;
      c = p;
      t0 = t;
    }
  }
  const x0 = c.x, hw = leverWidth(t0, tPin) * 0.5, y = CLIP_Y, rn = 95e-4 + 58e-5, yn = CLIP_Y - 2e-4;
  const pts = [
    [x0 + THK * 0.5 + CROWN + 6e-4, y, 0],
    [x0 + THK * 0.5 + CROWN * 0.55 + 6e-4, y, -hw * 0.66],
    [x0 + 9e-4, y, -hw - 7e-4],
    [x0 - 16e-4, y - 1e-4, -hw - 9e-4],
    [x0 - 45e-4, yn, -86e-4]
  ];
  for (let k = 0; k <= 10; k++) {
    const ph = lerp(-1.15, -Math.PI * 2 + 1.15, k / 10);
    pts.push([rn * Math.cos(ph), yn, rn * Math.sin(ph)]);
  }
  pts.push(
    [x0 - 45e-4, yn, 86e-4],
    [x0 - 16e-4, y - 1e-4, hw + 9e-4],
    [x0 + 9e-4, y, hw + 7e-4],
    [x0 + THK * 0.5 + CROWN * 0.55 + 6e-4, y, hw * 0.66]
  );
  return {
    curve: new THREE8.CatmullRomCurve3(pts.map((p) => new THREE8.Vector3(p[0], p[1], p[2])), true, "centripetal"),
    pivot: new THREE8.Vector3(pts[0][0], pts[0][1], 0)
  };
}
function erode(x, n, rmin, rmax, area, rnd) {
  x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < n; i++) {
    const px = area[0] + rnd() * (area[2] - area[0]), py = area[1] + rnd() * (area[3] - area[1]);
    const r = rmin + rnd() * (rmax - rmin);
    x.globalAlpha = 0.25 + rnd() * 0.75;
    x.beginPath();
    x.ellipse(px, py, r, r * (0.35 + rnd() * 0.9), rnd() * 3.14, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  x.globalCompositeOperation = "source-over";
}
var FONT = "Arial Narrow, Arial, Helvetica, Liberation Sans, sans-serif";
function makeBodyDecal(W, vHole, rnd) {
  const H = W / 2, c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true });
  const yv = (v) => (1 - v) * H;
  const pxmm = H / (Math.PI * R * 1e3);
  const YEL = "rgba(214,184,70,";
  x.fillStyle = YEL + "0.92)";
  x.fillRect(0, yv(vHole - 0.012), W, yv(vHole - 0.04) - yv(vHole - 0.012));
  erode(x, W * 0.35, 1, 4 * W / 2048, [0, yv(vHole - 8e-3), W, yv(vHole - 0.044)], rnd);
  const lines = [
    ["GRENADE HAND FRAG", 0.7, 3.2],
    ["DELAY  M67", 0.652, 3.2],
    ["LOT MA-24J017-006", 0.608, 2.4]
  ];
  x.textAlign = "center";
  x.textBaseline = "alphabetic";
  for (const [txt, v, mm] of lines) {
    const st = Math.sin(Math.PI * (1 - v));
    x.save();
    x.translate(W * 0.5, yv(v));
    x.scale(1 / st, 1);
    x.fillStyle = YEL + "0.95)";
    x.font = `bold ${Math.round(mm * pxmm / 0.72)}px ${FONT}`;
    x.fillText(txt, 0, 0);
    x.restore();
  }
  x.globalCompositeOperation = "destination-out";
  x.fillStyle = "#000";
  for (const v of [0.712, 0.664, 0.617]) x.fillRect(0, yv(v), W, Math.max(1, W / 1400));
  x.globalCompositeOperation = "source-over";
  erode(x, W * 0.3, 0.8, 3.5 * W / 2048, [W * 0.3, yv(0.74), W * 0.7, yv(0.57)], rnd);
  return c;
}
function makeMetalDecal(S2, fz, rnd) {
  const c = document.createElement("canvas");
  c.width = S2;
  c.height = S2;
  const x = c.getContext("2d", { willReadFrequently: true });
  const yv = (v) => (1 - v) * S2;
  x.textBaseline = "middle";
  x.textAlign = "center";
  x.fillStyle = "rgba(8,8,8,0.95)";
  const lo = MV.LO, L = fz.leverLen, w = 0.016;
  const pxU = S2 * 0.98 / (L * 1e3), pxV = S2 * (lo[1] - lo[0]) / (w * 1e3);
  const stamp = (txt, u, v, mm) => {
    x.save();
    x.translate(S2 * (0.01 + 0.98 * u), yv(lerp(lo[0], lo[1], v)));
    x.scale(pxU / pxV, 1);
    x.font = `bold ${Math.round(mm * pxV / 0.72)}px ${FONT}`;
    x.fillText(txt, 0, 0);
    x.restore();
  };
  stamp("FUZE  M213   LOT  MA-24J-0613", fz.tStamp, 0.33, 1.7);
  stamp("DELAY 4–5.5 SEC", fz.tStamp, 0.68, 1.7);
  erode(x, S2 * 0.08, 0.5, 1.6 * S2 / 1024, [0, yv(lo[1]), S2, yv(lo[0])], rnd);
  const [m0, m1] = fz.mainV;
  const pxmmU = S2 / (2 * Math.PI * 95e-4 * 1e3), pxmmV = S2 * (m1 - m0) / (fz.mainLen * 1e3);
  x.save();
  x.textAlign = "center";
  x.translate(S2 * 0.5, yv(lerp(m0, m1, 0.38)));
  x.scale(pxmmU / pxmmV, 1);
  x.font = `bold ${Math.round(1.6 * pxmmV / 0.72)}px ${FONT}`;
  x.fillText("M213", 0, 0);
  x.restore();
  x.beginPath();
  x.ellipse(S2 * 0.5, yv(fz.ventV), 0.45 * pxmmU, 0.45 * pxmmV, 0, 0, Math.PI * 2);
  x.fill();
  return c;
}
var GLSL_NOISE = (
  /* glsl */
  `
float h21(vec2 p){ p += uSeed * 17.13; vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p, float px){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  vec2 a = i, b = i + vec2(1.0,0.0), c = i + vec2(0.0,1.0), d = i + vec2(1.0,1.0);
  if (px > 0.5){ a.x = mod(a.x, px); b.x = mod(b.x, px); c.x = mod(c.x, px); d.x = mod(d.x, px); }
  return mix(mix(h21(a), h21(b), f.x), mix(h21(c), h21(d), f.x), f.y);
}
float fbm(vec2 p, float px, int oct){
  float s = 0.0, a = 0.5, t = 0.0;
  for (int i = 0; i < 5; i++){ if (i >= oct) break; s += a*vn(p, px); t += a; p *= 2.0; px *= 2.0; a *= 0.5; }
  return s / t;
}
vec3 srgb2lin(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(0.04045, c)); }
float scratch(vec2 uv, float f1, float f2){
  float a = vn(vec2(uv.x*f1, uv.y*f1*0.03), f1);
  float b = vn(vec2(uv.x*f2*0.03, uv.y*f2), f2*0.03);
  float br = fbm(uv*vec2(60.0,30.0), 60.0, 2);
  return clamp(smoothstep(0.94, 0.995, a)*br*1.6 + smoothstep(0.95, 0.999, b)*br*1.3, 0.0, 1.0);
}
`
);
var BAKE_VS = (
  /* glsl */
  `
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`
);
var BAKE_HEAD = (
  /* glsl */
  `
precision highp float;
in vec2 vUv;
uniform sampler2D uDecal;
uniform vec2 uRes;
uniform float uWear, uRust, uSmudge, uSeed;
#ifdef AUX
layout(location = 0) out vec4 oAux;
#else
uniform sampler2D uAux;
layout(location = 0) out vec4 oAlb;
layout(location = 1) out vec4 oNrm;
layout(location = 2) out vec4 oOrm;
#endif
// высота (м) в aux-цели: кодировка годится и для RGBA8, и для half float
float encH(float h){ return h * 3500.0 + 0.5; }
float decH(float x){ return (x - 0.5) / 3500.0; }
const float PI = 3.14159265;
const vec3 OLIVE = vec3(0.078, 0.086, 0.043);
const vec3 RUSTC = vec3(0.115, 0.036, 0.013);
`
);
function bodyFS(vHole) {
  return BAKE_HEAD + GLSL_NOISE + /* glsl */
  `
const float R = ${R.toFixed(5)}, VH = ${vHole.toFixed(4)};
float seamM(vec2 uv){ return abs(uv.y - 0.5) * PI * R; }
float wellP(vec2 uv){ return smoothstep(VH - 0.06, VH, uv.y); }
float chipMask(vec2 uv){
  float zone = 0.8*exp(-seamM(uv)/0.0025) + 0.55*smoothstep(0.30, 0.03, uv.y) + 0.45*wellP(uv)
             + 0.5*smoothstep(0.5, 0.8, fbm(uv*vec2(8.0,4.0), 8.0, 3));
  float n = fbm(uv*vec2(170.0,85.0), 170.0, 4);
  float n2 = fbm(uv*vec2(40.0,20.0), 40.0, 3);
  float t = 0.86 - 0.24*uWear*(0.05 + 0.95*zone) - 0.05*n2;
  return smoothstep(t, t + 0.025, n);
}
float prints(vec2 uv){
  float s = 0.0;
  for (int i = 0; i < 3; i++){
    vec2 c = vec2(0.30 + 0.27*float(i), 0.47 + 0.09*float(i) - 0.04*float(i*i));
    vec2 d = (uv - c) * vec2(2.0, 1.0);
    float r = length(d);
    float ridge = 0.5 + 0.5*sin(r*1100.0 + 6.0*fbm(uv*vec2(50.0,25.0), 50.0, 2));
    s += smoothstep(0.045, 0.006, r) * (0.4 + 0.6*ridge);
  }
  return clamp(s, 0.0, 1.0);
}
float heightB(vec2 uv, float chip){
  float bm = 1.0 - smoothstep(0.0, 0.0011, seamM(uv));
  float h = bm * (0.00002 + 0.000008*sin(uv.x * PI * 2.0 * 230.0));      // рябь сварного шва
  h += (fbm(uv*vec2(900.0,450.0), 900.0, 2) - 0.5) * 0.000012;            // шагрень краски
  h -= smoothstep(0.70, 0.95, fbm(uv*vec2(14.0,7.0), 14.0, 3)) * 0.00005;  // мягкие вмятины
  h -= chip * 0.00005;
  h += texture(uDecal, uv).a * 0.000006;
  return h;
}
#ifdef AUX
void main(){ float c = chipMask(vUv); oAux = vec4(encH(heightB(vUv, c)), c, 0.0, 1.0); }
#else
void main(){
  vec2 uv = vUv;
  vec2 e = 1.0 / uRes;
  float st = max(sin(PI * uv.y), 0.08);
  vec4 a0 = texture(uAux, uv);
  float h0 = decH(a0.r), hx = decH(texture(uAux, uv + vec2(e.x, 0.0)).r), hy = decH(texture(uAux, uv + vec2(0.0, e.y)).r);
  vec2 dm = vec2(2.0*PI*R*st*e.x, PI*R*e.y);
  vec3 n = normalize(vec3((h0 - hx)/dm.x, (h0 - hy)/dm.y, 1.0));

  float chips = a0.g;
  float scr = scratch(uv, 560.0, 420.0) * (0.2 + 0.5*uWear);
  float bare = clamp(chips + scr*0.35, 0.0, 1.0);
  float mottle = fbm(uv*vec2(30.0,15.0), 30.0, 3);
  float dirt = smoothstep(0.35, 0.85, fbm(uv*vec2(16.0,8.0), 16.0, 3));
  float seamP = exp(-seamM(uv)/0.0012);
  float wp = wellP(uv);
  float rustN = smoothstep(0.42, 0.80, fbm(uv*vec2(60.0,30.0), 60.0, 3));
  float rust = clamp(uRust * (seamP*0.9 + wp*1.1 + chips*0.8 + 0.12) * rustN, 0.0, 1.0);
  vec4 dc = texture(uDecal, uv);
  float dca = dc.a * (1.0 - bare) * (1.0 - 0.4*rust);
  vec3 paint = OLIVE * (0.86 + 0.28*mottle);
  paint = mix(paint, srgb2lin(dc.rgb) * (0.82 + 0.3*mottle), dca);
  paint *= mix(1.0, 0.78, dirt*0.5);
  vec3 steel = vec3(0.20, 0.20, 0.21) * (0.8 + 0.4*mottle);
  vec3 albedo = mix(paint, steel, bare);
  albedo = mix(albedo, RUSTC * (0.7 + 0.6*rustN), rust);
  float pr = prints(uv) * uSmudge;
  float sm = smoothstep(0.42, 0.78, fbm(uv*vec2(9.0,4.5), 9.0, 3)) * uSmudge;
  float rough = mix(0.62 - 0.06*mottle + 0.10*dirt - 0.22*pr - 0.10*sm - 0.05*dca, 0.45 + 0.1*mottle, bare);
  rough = mix(rough, 0.92, rust);
  float metal = bare * (1.0 - rust);
  // тень под рычагом (+X, u = 0.75) и у горловины
  float du = abs(uv.x - 0.75) * 2.0 * PI * R * st;
  float under = exp(-pow(du/0.0085, 2.0)) * smoothstep(0.45, 0.50, uv.y) * (1.0 - smoothstep(VH - 0.01, VH + 0.02, uv.y));
  float ao = 1.0 - 0.38*under - 0.12*smoothstep(VH - 0.03, VH, uv.y) - 0.12*rust - 0.08*chips;
  ao *= 1.0 - 0.25*seamP;
  oAlb = vec4(clamp(albedo, 0.0, 1.0), 1.0);
  oNrm = vec4(n * 0.5 + 0.5, 1.0);
  oOrm = vec4(clamp(ao, 0.0, 1.0), clamp(rough, 0.04, 1.0), clamp(metal, 0.0, 1.0), 1.0);
}
#endif
`;
}
function metalFS(k) {
  const d = (n, v) => `const vec2 ${n} = vec2(${v[0].toFixed(4)}, ${v[1].toFixed(4)});`;
  return BAKE_HEAD + GLSL_NOISE + /* glsl */
  `
${d("FZ", MV.FZ)} ${d("FS", MV.FS)} ${d("PN", MV.PN)} ${d("RG", MV.RG)} ${d("CL", MV.CL)}
${d("LO", MV.LO)} ${d("LI", MV.LI)} ${d("LE", MV.LE)}
${d("THR", k.threadV)} ${d("MAIN", k.mainV)}
uniform float uMpt;
bool inR(float v, vec2 r){ return v >= r.x - 0.008 && v <= r.y + 0.008; }
float stampM(vec2 uv){ vec4 dc = texture(uDecal, uv); return step(dot(dc.rgb, vec3(0.333)), 0.2) * dc.a; }
float heightM(vec2 uv){
  float v = uv.y, h = 0.0;
  if (inR(v, FZ)){
    if (v >= THR.x && v <= THR.y){
      float f = fract((v - THR.x) / (THR.y - THR.x) * 6.0 - uv.x);
      h += 0.00012 * (1.0 - abs(2.0*f - 1.0));
    }
    h += sin(v * 5200.0) * 0.0000015 + (fbm(uv*vec2(260.0,540.0), 260.0, 2) - 0.5) * 0.000006;
    h -= stampM(uv) * 0.00004;
  } else if (v > LO.x - 0.01){
    h += (fbm(uv*vec2(300.0,300.0), 0.0, 2) - 0.5) * 0.000007;
    h -= stampM(uv) * 0.00005;
    h -= smoothstep(0.80, 0.86, fbm(uv*vec2(220.0,220.0), 0.0, 3)) * 0.00002;
  } else {
    h += (fbm(uv*vec2(3.0,400.0), 0.0, 2) - 0.5) * 0.000004;
  }
  return h;
}
#ifdef AUX
void main(){ oAux = vec4(encH(heightM(vUv)), 0.0, 0.0, 1.0); }
#else
void main(){
  vec2 uv = vUv;
  vec2 e = 1.0 / uRes;
  float h0 = decH(texture(uAux, uv).r), hx = decH(texture(uAux, uv + vec2(e.x, 0.0)).r), hy = decH(texture(uAux, uv + vec2(0.0, e.y)).r);
  vec3 n = normalize(vec3((h0 - hx)/uMpt, (h0 - hy)/uMpt, 1.0));
  float v = uv.y;
  float mott = fbm(uv*vec2(60.0,120.0), 60.0, 3);
  float rustN = smoothstep(0.62, 0.90, fbm(uv*vec2(80.0,40.0), 80.0, 3)) * uRust;
  float st = stampM(uv);
  vec3 albedo; float rough, metal, ao = 1.0;
  if (inR(v, FZ) || inR(v, FS)){
    // оцинковка с жёлтым хроматом пятнами
    float chrom = smoothstep(0.35, 0.75, fbm(uv*vec2(10.0,20.0), 10.0, 3));
    albedo = mix(vec3(0.24, 0.25, 0.235), vec3(0.28, 0.26, 0.16), chrom*0.5) * (0.85 + 0.25*mott);
    rough = 0.60 + 0.12*mott - 0.12*uSmudge*smoothstep(0.5, 0.8, fbm(uv*vec2(20.0,40.0), 20.0, 3));
    metal = 1.0;
    if (v >= THR.x && v <= THR.y){ albedo *= 0.55; rough = 0.34; }
    if (inR(v, FZ)) ao = 1.0 - 0.45*(1.0 - smoothstep(FZ.x, THR.y + 0.02, v));
    if (inR(v, FS)) ao = 0.85;
    albedo = mix(albedo, albedo*0.35, st);
    rough = mix(rough, 0.7, st);
    ao *= 1.0 - 0.6*st;
  } else if (v < LO.x - 0.01){
    // стальная проволока: чека, кольцо, клип
    float tarn = smoothstep(0.4, 0.8, fbm(uv*vec2(20.0,4.0), 20.0, 3));
    vec3 base = inR(v, CL) ? vec3(0.44, 0.44, 0.45) : vec3(0.60, 0.60, 0.61);
    albedo = base * (0.86 + 0.22*mott) * mix(1.0, 0.78, tarn*0.5);
    rough = (inR(v, CL) ? 0.36 : 0.26) + 0.12*tarn + 0.05*mott;
    metal = 1.0;
  } else {
    // рычаг: зелёная краска, стёртая по кромкам, выбитая маркировка
    vec2 r = inR(v, LO) ? LO : (inR(v, LI) ? LI : LE);
    float a = clamp((v - r.x) / (r.y - r.x), 0.0, 1.0);
    float edge = inR(v, LE) ? 0.7 : smoothstep(0.14, 0.0, min(a, 1.0 - a));
    edge = max(edge, smoothstep(0.05, 0.0, uv.x - 0.01) + smoothstep(0.96, 0.99, uv.x));
    float n1 = fbm(uv*vec2(150.0,150.0), 0.0, 4);
    float t = 0.84 - 0.30*uWear*(0.05 + 0.95*edge);
    float bare = smoothstep(t, t + 0.03, n1);
    float scr = inR(v, LO) ? scratch(uv, 420.0, 40.0) * (0.3 + 0.7*uWear) : 0.0;
    bare = clamp(bare + scr*0.5, 0.0, 1.0);
    vec3 paint = OLIVE * 1.05 * (0.86 + 0.28*mott);
    vec3 steel = vec3(0.40, 0.40, 0.41) * (0.8 + 0.3*mott);
    albedo = mix(paint, steel, bare);
    rough = mix(0.58 - 0.06*mott, 0.34, bare);
    metal = bare;
    albedo = mix(albedo, albedo*0.45, st);
    ao = (inR(v, LI) ? 0.62 : 1.0) * (1.0 - 0.45*st);
  }
  albedo = mix(albedo, RUSTC * (0.8 + 0.4*mott), rustN*0.5);
  rough = mix(rough, 0.88, rustN*0.5);
  metal = mix(metal, 0.0, rustN*0.5);
  oAlb = vec4(clamp(albedo, 0.0, 1.0), 1.0);
  oNrm = vec4(n * 0.5 + 0.5, 1.0);
  oOrm = vec4(clamp(ao, 0.0, 1.0), clamp(rough, 0.04, 1.0), clamp(metal, 0.0, 1.0), 1.0);
}
#endif
`;
}
function makeMRT(w, h, wrapS, aniso) {
  const rt = new THREE8.WebGLRenderTarget(w, h, {
    count: 3,
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: THREE8.LinearMipmapLinearFilter,
    magFilter: THREE8.LinearFilter,
    wrapS,
    wrapT: THREE8.ClampToEdgeWrapping,
    type: THREE8.UnsignedByteType
  });
  rt.textures[0].colorSpace = THREE8.SRGBColorSpace;
  rt.textures[1].colorSpace = THREE8.NoColorSpace;
  rt.textures[2].colorSpace = THREE8.NoColorSpace;
  for (const t of rt.textures) t.anisotropy = aniso;
  rt.textures[0].name = "albedo";
  rt.textures[1].name = "normal";
  rt.textures[2].name = "orm";
  return rt;
}
async function buildM67(opts = {}) {
  const renderer = opts.renderer;
  const q = QI[opts.quality] ?? 1;
  const params = { wear: opts.wear ?? 0.35, rust: opts.rust ?? 0.15, smudge: opts.smudge ?? 0.3, seed: opts.seed ?? 1 };
  const disposables = [];
  const own = (x) => {
    disposables.push(x);
    return x;
  };
  const group = new THREE8.Group();
  group.name = "M67";
  const body = bodyGeometry(q);
  const fuze = fuzeGeometry(q);
  const curve = leverCurve();
  const lever = leverGeometry(q, curve);
  const pin = pinGeometry(q);
  const ring = ringGeometry(q);
  const clip = clipCurve(curve, lever.tPin);
  const clipGeom = remapUV(new THREE8.TubeGeometry(clip.curve, [48, 80, 120][q], 55e-5, [5, 6, 8][q], true), [0.01, MV.CL[0], 0.99, MV.CL[1]]);
  clipGeom.translate(-clip.pivot.x, -clip.pivot.y, -clip.pivot.z);
  for (const g of [body.geom, fuze.geom, lever.geom, pin.legs, pin.tip, ring.geom, clipGeom]) own(g);
  const leverLen = curve.getLength();
  const s5 = FUZE_STRIPS[4];
  let s5len = 0;
  for (let i = 1; i < s5.length; i++) s5len += Math.hypot(s5[i][0] - s5[i - 1][0], s5[i][1] - s5[i - 1][1]);
  const vAtY = (y) => {
    const r = fuze.ranges[4], y0 = s5[0][1], y1 = s5[1][1];
    return lerp(r[0], r[0] + (r[1] - r[0]) * (y1 - y0) / s5len, (y - y0) / (y1 - y0));
  };
  const mainV = [vAtY(s5[0][1]), vAtY(s5[1][1])];
  const fz = { leverLen, tStamp: 0.72, mainV, mainLen: s5[1][1] - s5[0][1], ventV: vAtY(0.05), threadV: fuze.ranges[0] };
  const rnd = rng(28007 ^ params.seed);
  const bodyW = [512, 1024, 2048][q], metalS = [512, 1024, 1024][q];
  const decalBody = own(new THREE8.CanvasTexture(makeBodyDecal(Math.max(1024, bodyW), body.vHole, rnd)));
  const decalMetal = own(new THREE8.CanvasTexture(makeMetalDecal(1024, fz, rnd)));
  for (const t of [decalBody, decalMetal]) {
    t.colorSpace = THREE8.NoColorSpace;
    t.minFilter = THREE8.LinearMipmapLinearFilter;
    t.anisotropy = 4;
  }
  decalBody.wrapS = THREE8.RepeatWrapping;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const rtBody = own(makeMRT(bodyW, bodyW / 2, THREE8.RepeatWrapping, aniso));
  const rtMetal = own(makeMRT(metalS, metalS, THREE8.RepeatWrapping, aniso));
  const mkBake = (fs, decal, w, h, extra = {}) => {
    const uniforms = {
      uDecal: { value: decal },
      uRes: { value: new THREE8.Vector2(w, h) },
      uAux: { value: null },
      uWear: { value: 0 },
      uRust: { value: 0 },
      uSmudge: { value: 0 },
      uSeed: { value: 0 },
      ...extra
    };
    const mk = (defines) => own(new THREE8.RawShaderMaterial({
      glslVersion: THREE8.GLSL3,
      vertexShader: BAKE_VS,
      fragmentShader: fs,
      depthTest: false,
      depthWrite: false,
      defines,
      uniforms
    }));
    return { aux: mk({ AUX: "" }), main: mk({}), uniforms, w, h };
  };
  const bakes = [
    { ...mkBake(bodyFS(body.vHole), decalBody, bodyW, bodyW / 2), rt: rtBody, wrap: THREE8.RepeatWrapping },
    { ...mkBake(metalFS(fz), decalMetal, metalS, metalS, { uMpt: { value: 0.12 / metalS } }), rt: rtMetal, wrap: THREE8.RepeatWrapping }
  ];
  const auxType = renderer.extensions.has("EXT_color_buffer_float") ? THREE8.HalfFloatType : THREE8.UnsignedByteType;
  const quadGeom = own(new THREE8.PlaneGeometry(2, 2));
  const quad = new THREE8.Mesh(quadGeom, bakes[0].main);
  quad.frustumCulled = false;
  const bakeScene = new THREE8.Scene();
  bakeScene.add(quad);
  const bakeCam = new THREE8.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  function bake() {
    const prevRT = renderer.getRenderTarget(), prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    for (const b of bakes) {
      const u = b.uniforms;
      u.uWear.value = params.wear;
      u.uRust.value = params.rust;
      u.uSmudge.value = params.smudge;
      u.uSeed.value = params.seed % 97 * 0.37;
      const aux = new THREE8.WebGLRenderTarget(b.w, b.h, {
        depthBuffer: false,
        type: auxType,
        minFilter: THREE8.NearestFilter,
        magFilter: THREE8.NearestFilter,
        wrapS: b.wrap
      });
      quad.material = b.aux;
      renderer.setRenderTarget(aux);
      renderer.render(bakeScene, bakeCam);
      u.uAux.value = aux.texture;
      quad.material = b.main;
      renderer.setRenderTarget(b.rt);
      renderer.render(bakeScene, bakeCam);
      u.uAux.value = null;
      aux.dispose();
    }
    renderer.setRenderTarget(prevRT);
    renderer.autoClear = prevAuto;
  }
  bake();
  const orm = rtBody.textures[2], ormM = rtMetal.textures[2];
  const bodyMat = own(new THREE8.MeshStandardMaterial({
    name: "M67.body",
    map: rtBody.textures[0],
    normalMap: rtBody.textures[1],
    roughnessMap: orm,
    metalnessMap: orm,
    aoMap: orm,
    roughness: 1,
    metalness: 1
  }));
  const metalOpts = {
    map: rtMetal.textures[0],
    normalMap: rtMetal.textures[1],
    roughnessMap: ormM,
    metalnessMap: ormM,
    aoMap: ormM,
    roughness: 1,
    metalness: 1
  };
  const metalMat = own(new THREE8.MeshStandardMaterial({ name: "M67.metal", ...metalOpts }));
  const cutLocal = new THREE8.Plane(new THREE8.Vector3(1, 0, 0), 0);
  const cutWorld = new THREE8.Plane(new THREE8.Vector3(1, 0, 0), 1e6);
  const fuzeMat = own(new THREE8.MeshStandardMaterial({ name: "M67.fuze", ...metalOpts, side: THREE8.DoubleSide, clippingPlanes: [cutWorld] }));
  const mesh = (g, m2, name) => {
    const x = new THREE8.Mesh(g, m2);
    x.name = name;
    x.castShadow = true;
    x.receiveShadow = true;
    return x;
  };
  const pivot = (name, p) => {
    const o = new THREE8.Group();
    o.name = name;
    o.position.copy(p);
    return o;
  };
  const pBody = pivot("body", new THREE8.Vector3());
  const bodyMesh = mesh(body.geom, bodyMat, "M67.bodyMesh");
  pBody.add(bodyMesh);
  const fuzeBase = new THREE8.Vector3(0, FUZE_BASE_Y, 0);
  fuze.geom.translate(0, -FUZE_BASE_Y, 0);
  const pFuze = pivot("fuze", fuzeBase);
  const fuzeMesh = mesh(fuze.geom, fuzeMat, "M67.fuzeMesh");
  let cutOn = false;
  fuzeMesh.onBeforeRender = () => {
    if (cutOn) cutWorld.copy(cutLocal).applyMatrix4(fuzeMesh.matrixWorld);
  };
  pFuze.add(fuzeMesh);
  const capGeom = own(sectionCapGeometry().translate(0, -FUZE_BASE_Y, 0));
  const capMat = own(new THREE8.MeshStandardMaterial({ name: "M67.section", color: 12172480, metalness: 0.85, roughness: 0.32 }));
  const cutGroup = new THREE8.Group();
  cutGroup.name = "cutaway";
  cutGroup.visible = false;
  cutGroup.add(mesh(capGeom, capMat, "section"));
  const cyl = own(new THREE8.CylinderGeometry(1, 1, 1, 20, 1));
  const inner = (name, color, r, y0, y1, extra = {}) => {
    const m2 = mesh(cyl, own(new THREE8.MeshStandardMaterial({ name, color, ...extra })), name);
    m2.scale.set(r, y1 - y0, r);
    m2.position.y = (y0 + y1) / 2 - FUZE_BASE_Y;
    cutGroup.add(m2);
    return m2;
  };
  const DEL0 = 0.0395, DEL1 = 0.0508, DEL_R = 21e-4;
  inner("primer", 11569724, 25e-4, 0.0508, 0.0524, { metalness: 1, roughness: 0.35 });
  inner("detonator", 10922672, 28e-4, 0.03, DEL0, { metalness: 1, roughness: 0.4 });
  const ash = inner("delay.ash", 1381137, DEL_R, DEL1 - 1e-3, DEL1, { roughness: 0.95 });
  const front = inner("delay.front", 2756098, DEL_R * 1.02, DEL1 - 7e-4, DEL1, { roughness: 0.6, emissive: 16738834, emissiveIntensity: 6 });
  const fresh = inner("delay.fresh", 7170659, DEL_R, DEL0, DEL1, { roughness: 0.85 });
  front.castShadow = false;
  const span = (o, y0, y1) => {
    o.visible = y1 - y0 > 1e-6;
    o.scale.y = Math.max(1e-6, y1 - y0);
    o.position.y = (y0 + y1) / 2 - FUZE_BASE_Y;
  };
  pFuze.add(cutGroup);
  const pLever = pivot("lever", HINGE);
  pLever.add(mesh(lever.geom, metalMat, "M67.leverMesh"));
  const pPin = pivot("pin", PIN_C);
  pPin.add(mesh(pin.legs, metalMat, "M67.pinMesh"));
  const tipA = mesh(pin.tip, metalMat, "pinTipA"), tipB = mesh(pin.tip, metalMat, "pinTipB");
  tipA.position.set(0, LEG_R, PIN_Z0);
  tipB.position.set(0, -LEG_R, PIN_Z0);
  pPin.add(tipA, tipB);
  const TIP_ANG = 0.62;
  const pRing = pivot("ring", new THREE8.Vector3(0, 0, EYE_Z));
  pRing.add(mesh(ring.geom, metalMat, "M67.ringMesh"));
  pPin.add(pRing);
  const pClip = pivot("clip", clip.pivot);
  pClip.add(mesh(clipGeom, metalMat, "M67.clipMesh"));
  group.add(pBody, pFuze, pLever, pPin, pClip);
  const parts = { body: pBody, fuze: pFuze, lever: pLever, pin: pPin, ring: pRing, clip: pClip };
  const initial = Object.values(parts).map((o) => ({ o, parent: o.parent, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }));
  const clipInit = initial.find((x) => x.o === pClip);
  const axis = new THREE8.Vector3(0, 0, 1);
  const pinApi = {
    axis,
    travel: PIN_TRAVEL,
    d: 0,
    colliders: [
      { p: new THREE8.Vector3(0, 0, -5e-3), r: 12e-4 },
      { p: new THREE8.Vector3(0, 0, 6e-3), r: 12e-4 },
      { p: ring.center.clone().add(pRing.position), r: 3e-3 },
      ...[0, 2.1, 4.2].map((a) => ({ p: ring.center.clone().add(pRing.position).addScaledVector(new THREE8.Vector3(0, -Math.sin(RING_TILT), Math.cos(RING_TILT)), RING_RM * Math.cos(a)).add(new THREE8.Vector3(RING_RM * Math.sin(a), 0, 0)), r: 18e-4 }))
    ],
    set(d) {
      d = Math.min(PIN_TRAVEL, Math.max(0, d));
      pinApi.d = d;
      pPin.position.copy(PIN_C).addScaledVector(axis, d);
      const k = 1 - Math.min(1, d / (0.15 * PIN_TRAVEL));
      tipA.rotation.x = TIP_ANG * k;
      tipB.rotation.x = -TIP_ANG * k;
    }
  };
  pinApi.set(0);
  const leverCols = [0.12, 0.32, 0.52, 0.72, 0.93].map((t) => ({
    p: curve.getPointAt(t).sub(HINGE),
    r: t < 0.4 ? 6e-3 : lerp(6e-3, 48e-4, (t - 0.4) / 0.6)
  }));
  const clipCols = [0, 0.2, 0.5, 0.8].map((t) => ({ p: clip.curve.getPointAt(t).sub(clip.pivot), r: 26e-4 }));
  const box = new THREE8.Box3();
  group.updateMatrixWorld(true);
  box.setFromObject(group, true);
  const fuzeTop = box.max.y;
  const m = {
    group,
    parts,
    bodyMesh,
    pin: pinApi,
    lever: { hinge: HINGE.clone(), axis: new THREE8.Vector3(0, 0, 1), colliders: leverCols },
    ring: { colliders: pinApi.colliders.slice(2).map((c) => ({ p: c.p.clone().sub(pRing.position), r: c.r })) },
    clip: {
      colliders: clipCols,
      on: true,
      set(on) {
        m.clip.on = !!on;
        pClip.visible = !!on;
        if (on) {
          const s = clipInit;
          s.parent.add(pClip);
          pClip.position.copy(s.p);
          pClip.quaternion.copy(s.q);
        }
      }
    },
    fuzeVent: new THREE8.Vector3(0, 0.05, 96e-4),
    cutaway: {
      on: false,
      set(on) {
        cutOn = !!on;
        m.cutaway.on = cutOn;
        cutGroup.visible = cutOn;
        if (!cutOn) cutWorld.set(cutLocal.normal, 1e6);
      },
      burn(f) {
        f = Math.min(1, Math.max(0, f));
        const yf = DEL1 - f * (DEL1 - DEL0), fh = 6e-4;
        span(ash, yf, DEL1);
        span(fresh, DEL0, Math.max(DEL0, yf - fh));
        span(front, Math.max(DEL0, yf - fh), Math.min(DEL1, yf + fh * 0.2));
        front.visible = f > 0 && f < 1;
      }
    },
    maps: {
      map: rtBody.textures[0],
      normalMap: rtBody.textures[1],
      ormMap: orm,
      roughnessMap: orm,
      metalnessMap: orm,
      aoMap: orm,
      metal: { map: rtMetal.textures[0], normalMap: rtMetal.textures[1], ormMap: ormM }
    },
    materials: { body: bodyMat, metal: metalMat, fuze: fuzeMat },
    dims: { R, height: fuzeTop + R, fuzeTop, mass: 0.4 },
    rebake(o = {}) {
      if (o.wear !== void 0) params.wear = o.wear;
      if (o.rust !== void 0) params.rust = o.rust;
      if (o.smudge !== void 0) params.smudge = o.smudge;
      if (o.seed !== void 0) params.seed = o.seed;
      bake();
    },
    // Вернуть все детали на место (после броска/разлёта).
    reset() {
      for (const s of initial) {
        s.parent.add(s.o);
        s.o.position.copy(s.p);
        s.o.quaternion.copy(s.q);
        s.o.scale.copy(s.s);
        s.o.visible = true;
      }
      pinApi.set(0);
      m.clip.on = true;
    },
    dispose() {
      group.removeFromParent();
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    }
  };
  m.cutaway.burn(0);
  return m;
}

  return { buildM67 };
  })();
  const M84 = (function () {
// src/m84/model.js
const THREE8 = window.THREE;
function buildFlashbang(opts = {}) {
  const mm2 = (x) => x / 1e3;
  const TAU = Math.PI * 2;
  const o = Object.assign({ holes: true, wear: true }, opts);
  const SEG_BODY = 48;
  const SEG_SMALL = 24;
  const SEG_TUBE = 10;
  const SEG_RING = 32;
  const HOLE_SUB = 6;
  const HOLES_ON = !!o.holes;
  const WEAR_ON = !!o.wear;
  const group = new THREE8.Group();
  group.name = "M84_Flashbang";
  const steelDark = new THREE8.MeshStandardMaterial({ name: "steelDark", color: 3487804, metalness: 0.7, roughness: 0.52 });
  const chargeMat = new THREE8.MeshStandardMaterial({ name: "charge", color: 1316119, metalness: 0.15, roughness: 0.9 });
  const steel = new THREE8.MeshStandardMaterial({ name: "steel", color: 6974834, metalness: 0.85, roughness: 0.32 });
  const wearMat = new THREE8.MeshStandardMaterial({ name: "wear", color: 9409691, metalness: 0.94, roughness: 0.2 });
  const materials = [steelDark, chargeMat, steel, wearMat];
  function flipGeo(g) {
    const idx = g.index;
    if (idx) {
      const a = idx.array;
      for (let i = 0; i < a.length; i += 3) {
        const t = a[i];
        a[i] = a[i + 2];
        a[i + 2] = t;
      }
      idx.needsUpdate = true;
    }
    const n = g.attributes.normal;
    if (n) {
      const a = n.array;
      for (let i = 0; i < a.length; i++) a[i] = -a[i];
      n.needsUpdate = true;
    }
    return g;
  }
  function mergeGeos(list) {
    list = list.filter(Boolean);
    if (list.length === 1) return list[0];
    let verts = 0, inds = 0;
    for (const g of list) {
      verts += g.attributes.position.count;
      inds += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(verts * 3);
    const nrm = new Float32Array(verts * 3);
    const idx = new Uint32Array(inds);
    let vo = 0, io = 0;
    for (const g of list) {
      pos.set(g.attributes.position.array, vo * 3);
      if (g.attributes.normal) nrm.set(g.attributes.normal.array, vo * 3);
      if (g.index) {
        const gi = g.index.array;
        for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
        io += gi.length;
      } else {
        const c = g.attributes.position.count;
        for (let i = 0; i < c; i++) idx[io + i] = i + vo;
        io += c;
      }
      vo += g.attributes.position.count;
      g.dispose();
    }
    const out = new THREE8.BufferGeometry();
    out.setAttribute("position", new THREE8.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE8.BufferAttribute(nrm, 3));
    out.setIndex(new THREE8.BufferAttribute(idx, 1));
    return out;
  }
  const lathe = (pts, seg) => new THREE8.LatheGeometry(pts.map((p) => new THREE8.Vector2(p[0], p[1])), seg);
  const at = (g, x, y, z, rz) => {
    if (rz) g.rotateZ(rz);
    g.translate(x || 0, y || 0, z || 0);
    return g;
  };
  const box = (w, h, d) => new THREE8.BoxGeometry(w, h, d);
  const R_OUT = mm2(22.5);
  const R_IN = mm2(20.5);
  const H_BODY = mm2(133);
  const HY = H_BODY / 2;
  const R_FILLET = mm2(4);
  const HOLE_R = mm2(4);
  const N_HOLES = 6;
  const BELT_HI = mm2(33.25);
  const BELT_LO = mm2(-33.25);
  const FY = HY;
  const dys = [];
  for (let k = 0; k <= HOLE_SUB; k++) dys.push(-HOLE_R + 2 * HOLE_R * k / HOLE_SUB);
  const halfAngs = [];
  for (let k = 0; k < HOLE_SUB; k++) {
    const mid = (dys[k] + dys[k + 1]) / 2;
    const w = Math.sqrt(Math.max(0, HOLE_R * HOLE_R - mid * mid));
    halfAngs.push(Math.asin(Math.min(0.985, w / R_OUT)));
  }
  function sideWall(a, y0, y1, flip) {
    const s = Math.sin(a), c = Math.cos(a);
    const p = new Float32Array([
      R_IN * s,
      y0,
      R_IN * c,
      R_OUT * s,
      y0,
      R_OUT * c,
      R_OUT * s,
      y1,
      R_OUT * c,
      R_IN * s,
      y1,
      R_IN * c
    ]);
    const g = new THREE8.BufferGeometry();
    g.setAttribute("position", new THREE8.BufferAttribute(p, 3));
    g.setIndex(flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  }
  function ledge(center, y, from, to, up) {
    const a0 = Math.min(from, to), len = Math.abs(to - from);
    if (len < 1e-5) return null;
    const seg = Math.max(2, Math.min(8, Math.round(len / 0.04)));
    const g = new THREE8.RingGeometry(R_IN, R_OUT, seg, 1, a0, len);
    g.rotateX(-Math.PI / 2);
    g.rotateY(center - Math.PI / 2);
    g.translate(0, y, 0);
    if (!up) flipGeo(g);
    return g;
  }
  function solidBand(y0, y1) {
    if (y1 - y0 < 1e-6) return null;
    const g = new THREE8.CylinderGeometry(R_OUT, R_OUT, y1 - y0, SEG_BODY, 1, true);
    g.translate(0, (y0 + y1) / 2, 0);
    return g;
  }
  function holeBelt(beltY, out) {
    const step = TAU / N_HOLES;
    for (let k = 0; k < HOLE_SUB; k++) {
      const y0 = beltY + dys[k], y1 = beltY + dys[k + 1];
      const ha = halfAngs[k];
      const span = step - 2 * ha;
      const segs = Math.max(3, Math.round(SEG_BODY * span / TAU));
      for (let i = 0; i < N_HOLES; i++) {
        const c = i * step;
        const a0 = c + ha, a1 = c + step - ha;
        const arc = new THREE8.CylinderGeometry(R_OUT, R_OUT, y1 - y0, segs, 1, true, a0, span);
        arc.translate(0, (y0 + y1) / 2, 0);
        out.push(arc);
        out.push(sideWall(a0, y0, y1, false));
        out.push(sideWall(a1, y0, y1, true));
      }
    }
    for (let i = 0; i < N_HOLES; i++) {
      const c = i * step;
      for (let k = 0; k <= HOLE_SUB; k++) {
        const y = beltY + dys[k];
        const hp = k > 0 ? halfAngs[k - 1] : null;
        const hn = k < HOLE_SUB ? halfAngs[k] : null;
        if (hp === null) {
          out.push(ledge(c, y, -hn, hn, true));
          continue;
        }
        if (hn === null) {
          out.push(ledge(c, y, -hp, hp, false));
          continue;
        }
        if (Math.abs(hn - hp) < 1e-5) continue;
        const up = hn > hp;
        out.push(ledge(c, y, hp, hn, up));
        out.push(ledge(c, y, -hn, -hp, up));
      }
    }
  }
  const shell = [];
  if (HOLES_ON) {
    shell.push(solidBand(-HY + R_FILLET, BELT_LO - HOLE_R));
    holeBelt(BELT_LO, shell);
    shell.push(solidBand(BELT_LO + HOLE_R, BELT_HI - HOLE_R));
    holeBelt(BELT_HI, shell);
    shell.push(solidBand(BELT_HI + HOLE_R, HY - R_FILLET));
  } else {
    shell.push(solidBand(-HY + R_FILLET, HY - R_FILLET));
  }
  const fMid = R_FILLET * Math.SQRT1_2;
  const topProfile = [
    [R_IN, HY - mm2(7)],
    [mm2(11), HY - mm2(7)],
    [mm2(11), HY],
    [mm2(15.5), HY],
    [mm2(15.5), HY - mm2(1.6)],
    [mm2(18), HY - mm2(1.6)],
    [mm2(18), HY],
    [R_OUT - R_FILLET, HY],
    [R_OUT - R_FILLET + fMid, HY - R_FILLET + fMid],
    [R_OUT, HY - R_FILLET],
    [R_OUT, HY - mm2(6)]
  ];
  const botProfile = [
    [R_OUT, -HY + mm2(6)],
    [R_OUT, -HY + R_FILLET],
    [R_OUT - R_FILLET + fMid, -HY + R_FILLET - fMid],
    [R_OUT - R_FILLET, -HY],
    [mm2(17), -HY],
    [mm2(17), -HY + mm2(1.6)],
    [mm2(14), -HY + mm2(1.6)],
    [mm2(14), -HY],
    [0, -HY]
  ];
  shell.push(lathe(topProfile, SEG_BODY));
  shell.push(lathe(botProfile, SEG_BODY));
  const F_R = mm2(11), F_H = mm2(28);
  {
    const t = new THREE8.CylinderGeometry(F_R, F_R, F_H, SEG_SMALL, 1, false);
    t.translate(0, FY + F_H / 2, 0);
    shell.push(t);
    const NR = 20;
    for (let i = 0; i < NR; i++) {
      const a = i / NR * TAU;
      const r = box(mm2(1.5), mm2(14), mm2(2.2));
      r.translate(0, 0, F_R - mm2(0.4));
      r.rotateY(a);
      r.translate(0, FY + mm2(11), 0);
      shell.push(r);
    }
    shell.push(at(box(mm2(4.5), mm2(20), mm2(18)), mm2(12), mm2(89.5), 0));
  }
  const bodyGeo = mergeGeos(shell);
  bodyGeo.computeBoundingBox();
  const bodyMesh = new THREE8.Mesh(bodyGeo, steelDark);
  bodyMesh.name = "body_shell";
  bodyMesh.castShadow = bodyMesh.receiveShadow = true;
  const chargeParts = [new THREE8.CylinderGeometry(mm2(17), mm2(17), mm2(112), SEG_BODY, 1, false)];
  if (HOLES_ON) {
    const cav = new THREE8.CylinderGeometry(R_IN - mm2(0.4), R_IN - mm2(0.4), mm2(119), SEG_BODY, 1, true);
    chargeParts.push(flipGeo(cav));
  }
  const chargeGeo = mergeGeos(chargeParts);
  const chargeMesh = new THREE8.Mesh(chargeGeo, chargeMat);
  chargeMesh.name = "charge_core";
  chargeMesh.castShadow = false;
  chargeMesh.receiveShadow = true;
  let wearMesh = null;
  if (WEAR_ON) {
    const K = 1.006;
    const arc = (sign) => {
      const pts = [];
      for (let i = 0; i <= 3; i++) {
        const t = i / 3 * (Math.PI / 2);
        pts.push([
          R_OUT - R_FILLET + Math.sin(t) * R_FILLET * K,
          sign * (HY - R_FILLET + Math.cos(t) * R_FILLET * K)
        ]);
      }
      return lathe(pts, SEG_BODY);
    };
    const wg = mergeGeos([arc(1), arc(-1)]);
    wearMesh = new THREE8.Mesh(wg, wearMat);
    wearMesh.name = "body_wear";
    wearMesh.castShadow = wearMesh.receiveShadow = true;
  }
  const strikerGroup = new THREE8.Group();
  strikerGroup.name = "striker_group";
  strikerGroup.position.set(0, FY + F_H + mm2(2), 0);
  {
    const p = [];
    p.push(new THREE8.CylinderGeometry(mm2(6.5), mm2(6.5), mm2(4), SEG_SMALL, 1, false));
    const stem = new THREE8.CylinderGeometry(mm2(2.6), mm2(2.6), mm2(7), SEG_SMALL, 1, false);
    stem.translate(0, -mm2(5), 0);
    p.push(stem);
    const sm = new THREE8.Mesh(mergeGeos(p), steel);
    sm.name = "striker";
    sm.castShadow = sm.receiveShadow = true;
    strikerGroup.add(sm);
  }
  const spoonPivot = new THREE8.Group();
  spoonPivot.name = "spoon_pivot";
  spoonPivot.position.set(mm2(12), mm2(93), 0);
  {
    const p = [];
    p.push(box(mm2(7), mm2(7), mm2(18)));
    p.push(at(box(mm2(22), mm2(2.2), mm2(16)), mm2(-10), mm2(7.5), 0));
    p.push(at(box(mm2(5), mm2(9), mm2(16)), mm2(0.5), mm2(4), 0));
    p.push(at(box(mm2(13), mm2(2.4), mm2(16)), mm2(6), mm2(2.5), 0));
    p.push(at(box(mm2(2.4), mm2(80), mm2(16)), mm2(11.5), mm2(-37), 0));
    p.push(at(box(mm2(5), mm2(70), mm2(2.4)), mm2(14.3), mm2(-37), 0));
    p.push(at(box(mm2(4), mm2(74), mm2(1.6)), mm2(13.6), mm2(-37), mm2(7.2)));
    p.push(at(box(mm2(4), mm2(74), mm2(1.6)), mm2(13.6), mm2(-37), mm2(-7.2)));
    p.push(at(box(mm2(7), mm2(2.4), mm2(16)), mm2(9.6), mm2(-78.5), 0, -0.5));
    const sm = new THREE8.Mesh(mergeGeos(p), steel);
    sm.name = "spoon_lever";
    sm.castShadow = sm.receiveShadow = true;
    spoonPivot.add(sm);
  }
  const pinGroup = new THREE8.Group();
  pinGroup.name = "pin_group";
  pinGroup.position.set(0, mm2(86), 0);
  {
    const p = [];
    const sh = new THREE8.CylinderGeometry(mm2(1.5), mm2(1.5), mm2(34), SEG_TUBE, 1, false);
    sh.rotateX(Math.PI / 2);
    sh.translate(mm2(12), 0, mm2(2));
    p.push(sh);
    const t1 = new THREE8.CylinderGeometry(mm2(1.3), mm2(1.3), mm2(11), SEG_TUBE, 1, false);
    t1.rotateZ(Math.PI / 2);
    t1.translate(mm2(16.5), mm2(1.6), mm2(-14));
    p.push(t1);
    const t2 = new THREE8.CylinderGeometry(mm2(1.3), mm2(1.3), mm2(11), SEG_TUBE, 1, false);
    t2.rotateZ(Math.PI / 2);
    t2.translate(mm2(16.5), mm2(-1.6), mm2(-14));
    p.push(t2);
    const pm = new THREE8.Mesh(mergeGeos(p), steel);
    pm.name = "pin_shaft";
    pm.castShadow = pm.receiveShadow = true;
    pinGroup.add(pm);
  }
  const ringGroup = new THREE8.Group();
  ringGroup.name = "ring_group";
  ringGroup.position.set(mm2(12), 0, mm2(19));
  {
    const tg = new THREE8.TorusGeometry(mm2(12.5), mm2(1.3), SEG_TUBE, SEG_RING);
    tg.rotateY(Math.PI / 2);
    tg.translate(0, 0, mm2(12.5));
    const rm = new THREE8.Mesh(tg, steel);
    rm.name = "pull_ring";
    rm.castShadow = rm.receiveShadow = true;
    ringGroup.add(rm);
  }
  pinGroup.add(ringGroup);
  const bodyGroup = new THREE8.Group();
  bodyGroup.name = "body_group";
  bodyGroup.add(bodyMesh, chargeMesh);
  if (wearMesh) bodyGroup.add(wearMesh);
  bodyGroup.add(strikerGroup, spoonPivot, pinGroup);
  group.add(bodyGroup);
  const ports = [];
  for (const beltY of [BELT_LO, BELT_HI]) {
    for (let i = 0; i < N_HOLES; i++) {
      const a = i / N_HOLES * TAU;
      ports.push({
        pos: new THREE8.Vector3(R_OUT * Math.sin(a), beltY, R_OUT * Math.cos(a)),
        dir: new THREE8.Vector3(Math.sin(a), 0, Math.cos(a))
      });
    }
  }
  group.ports = ports;
  group.parts = { body: bodyGroup, spoon: spoonPivot, pin: pinGroup, ring: ringGroup, striker: strikerGroup };
  group.mats = { steelDark, chargeMat, steel, wearMat };
  group.userData.units = "meters";
  group.userData.dims = { R: R_OUT, H: HY, fuseTop: mm2(98.5), beltHi: BELT_HI, beltLo: BELT_LO };
  group.setGlow = (t) => {
    const k = Math.max(0, t);
    chargeMat.emissive.setRGB(1, 0.96 - 0.25 * Math.min(1, k * 0.35), 0.86 - 0.5 * Math.min(1, k * 0.5));
    chargeMat.emissiveIntensity = k;
  };
  group.setGlow(0);
  group.dispose = () => {
    group.traverse((c) => {
      if (c.isMesh && c.geometry) c.geometry.dispose();
    });
    materials.forEach((m) => m.dispose());
  };
  return group;
}

  return { buildFlashbang };
  })();
  root.GGrenadeModels = { buildM67: M67.buildM67, buildFlashbang: M84.buildFlashbang };
})(typeof self !== 'undefined' ? self : this);
