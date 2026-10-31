/* Extracted environment only from user supplied stroyka_zarechye_v2.html. Rebuild: tools/map-extraction/. No original input, renderer, player, weapons, artillery or drone boot. */
window.AEGIS_MAP_BUILDERS=window.AEGIS_MAP_BUILDERS||{};
window.AEGIS_MAP_BUILDERS['stroyka_zarechye_v2']=async function(ctx){

var THREE = ctx.THREE;
var __HK = { sound: null, fx: null, break: null };
var __deepNoop = (function () { var f = function () { return p; }; var p = new Proxy(f, { get: function (t, k) { return k === Symbol.toPrimitive ? function () { return 0; } : p; }, apply: function () { return p; } }); return p; })();

var THREE35 = ctx.THREE;
var PRESETS = {
  potato: {
    name: "минимальное",
    shadow: 512,
    grass: 4e3,
    grassR: 18,
    trees: 0.6,
    treeNearR: 28,
    bloom: false,
    smaa: false,
    pixel: 0.75,
    refl: 0,
    cloth: 6,
    lights: 1,
    spotShadows: 0,
    lampPoints: 1,
    fireLights: 1,
    tex: 0.35,
    ferns: 0.35,
    dust: 300,
    shadowTrees: false,
    tufts: false,
    shadowEvery: 3,
    rain: 0.35,
    softShadow: false,
    aniso: 2,
    bodies: 45,
    physStep: 1 / 40,
    physSub: 2,
    fx: 0.5,
    pool: 360,
    floraR: 30,
    flora: 0.25,
    clothR: 45,
    minPr: 0.5,
    groundNormals: false,
    outPr: 1,
    cas: 0.3
  },
  low: {
    name: "низкое",
    shadow: 1024,
    grass: 9e3,
    grassR: 24,
    trees: 0.72,
    treeNearR: 42,
    bloom: false,
    smaa: false,
    pixel: 1,
    refl: 0,
    cloth: 10,
    lights: 2,
    spotShadows: 0,
    lampPoints: 2,
    fireLights: 2,
    tex: 0.5,
    ferns: 0.55,
    dust: 900,
    shadowTrees: false,
    tufts: true,
    shadowEvery: 2,
    rain: 0.6,
    softShadow: false,
    aniso: 4,
    bodies: 80,
    physStep: 1 / 50,
    physSub: 2,
    fx: 0.7,
    pool: 480,
    floraR: 55,
    flora: 0.6,
    clothR: 70,
    minPr: 0.55,
    groundNormals: true,
    outPr: 1,
    cas: 0.3
  },
  medium: {
    name: "среднее",
    shadow: 2048,
    grass: 26e3,
    grassR: 34,
    trees: 0.9,
    treeNearR: 62,
    bloom: true,
    smaa: true,
    pixel: 1.25,
    refl: 384,
    cloth: 14,
    lights: 4,
    spotShadows: 1,
    lampPoints: 2,
    fireLights: 3,
    tex: 0.75,
    ferns: 0.8,
    dust: 1800,
    shadowTrees: true,
    tufts: true,
    shadowEvery: 1,
    rain: 0.85,
    softShadow: true,
    aniso: 8,
    bodies: 130,
    physStep: 1 / 60,
    physSub: 2,
    fx: 0.85,
    pool: 640,
    floraR: 75,
    flora: 0.85,
    clothR: 100,
    minPr: 0.6,
    groundNormals: true,
    outPr: 1.5,
    cas: 0.25
  },
  high: {
    name: "высокое",
    shadow: 4096,
    grass: 6e4,
    grassR: 44,
    trees: 1,
    treeNearR: 85,
    bloom: true,
    smaa: true,
    pixel: 1.6,
    refl: 640,
    cloth: 18,
    lights: 6,
    spotShadows: 2,
    lampPoints: 3,
    fireLights: 4,
    tex: 1,
    ferns: 1,
    dust: 3e3,
    shadowTrees: true,
    tufts: true,
    shadowEvery: 1,
    rain: 1,
    softShadow: true,
    aniso: 16,
    bodies: 180,
    physStep: 1 / 60,
    physSub: 3,
    fx: 1,
    pool: 800,
    floraR: 95,
    flora: 1,
    clothR: 140,
    minPr: 0.65,
    groundNormals: true,
    outPr: 2,
    cas: 0.2
  }
};
var QNAME = (ctx.quality==='ultra'?'potato':ctx.quality);
var Q = PRESETS[QNAME];
/* v22: растительности в 1,5 раза меньше — трава, папоротник, подлесок, цветы, деревья, кусты */
var VEG = 1 / 1.5;
Q = Object.assign({}, Q, { grass: Math.round(Q.grass * VEG), trees: Q.trees * VEG, ferns: Q.ferns * VEG, flora: Q.flora * VEG });
var V22 = { map: "stroyka_zarechye_v2", spots: [], zones: [], debris: [], cars: [], trails: 0, moved: 0, craters: 0 };
var renderer = ctx.renderer;
var scene = ctx.scene;
var camera = ctx.camera;
var MAXA = () => Math.min(Q.aniso, renderer.capabilities.getMaxAnisotropy());
var FRAME = { t: 0, dt: 0.016, n: 0 };
var NO_REFLECT = [];
var $ = (s) => document.querySelector(s);
var PERF = { pr: Math.min(devicePixelRatio, Q.pixel), minPr: Math.min(Q.minPr, Q.pixel), maxPr: Math.min(devicePixelRatio, Q.pixel), acc: 0, n: 0, t: 0, load: 0, auto: true, frameMs: 16, lvl: 0, calm: 0, shadowEvery: Q.shadowEvery };
var CELL = 4;
var GRID = /* @__PURE__ */ new Map();
var COLLIDERS = [];
var key = (ix, iz) => ix * 8192 + iz;
var CAPTURE = { list: null };
function insert(c, minx, minz, maxx, maxz) {
  if (CAPTURE.list) {
    CAPTURE.list.push(c);
    c.panel = CAPTURE.panel;
  }
  for (let ix = Math.floor(minx / CELL); ix <= Math.floor(maxx / CELL); ix++)
    for (let iz = Math.floor(minz / CELL); iz <= Math.floor(maxz / CELL); iz++) {
      const k = key(ix, iz);
      if (!GRID.has(k)) GRID.set(k, []);
      GRID.get(k).push(c);
    }
  COLLIDERS.push(c);
  return c;
}
function addCircle(x, z, r, y0, y1) {
  return insert({ t: 0, x, z, r, y0, y1 }, x - r, z - r, x + r, z + r);
}
function addBox(cx, cy, cz, sx, sy, sz, rot = 0, opt = {}) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const hw = sx / 2, hd = sz / 2;
  const ex = Math.abs(c) * hw + Math.abs(s) * hd, ez = Math.abs(s) * hw + Math.abs(c) * hd;
  return insert(
    { t: 1, x: cx, z: cz, y0: cy - sy / 2, y1: cy + sy / 2, hw, hd, c, s, walk: opt.walk !== false },
    cx - ex,
    cz - ez,
    cx + ex,
    cz + ez
  );
}
var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
var lerp = (a, b, t) => a + (b - a) * t;
var smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
var TAU = Math.PI * 2;
var SEED = 20260922;
var srnd = () => {
  SEED = SEED * 1664525 + 1013904223 >>> 0;
  return SEED / 4294967296;
};
var sr = (a, b) => a + srnd() * (b - a);
var si = (a, b) => Math.floor(sr(a, b + 1));
function rng(seed) {
  let s = seed >>> 0;
  const f = () => {
    s = s * 1664525 + 1013904223 >>> 0;
    return s / 4294967296;
  };
  f.range = (a, b) => a + f() * (b - a);
  f.int = (a, b) => Math.floor(a + f() * (b - a + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}
function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}
function fbm(x, z, oct = 4, lac = 2.03, gain = 0.5) {
  let s = 0, a = 0.5, f = 1, n2 = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, z * f);
    n2 += a;
    a *= gain;
    f *= lac;
  }
  return s / n2;
}
function polyDist(x, z, pts, out) {
  let best = 1e9, bestS = 0, acc3 = 0, bestSeg = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz, L = Math.sqrt(L2);
    let t = L2 > 0 ? ((x - ax) * vx + (z - az) * vz) / L2 : 0;
    t = clamp(t, 0, 1);
    const dx = x - (ax + vx * t), dz = z - (az + vz * t);
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      bestS = acc3 + t * L;
      bestSeg = i;
    }
    acc3 += L;
  }
  if (out) {
    out.s = bestS;
    out.len = acc3;
    out.seg = bestSeg;
  }
  return Math.sqrt(best);
}
function polyLength(pts) {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return L;
}
function polyAt(pts, s) {
  let acc3 = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const L = Math.hypot(bx - ax, bz - az);
    if (acc3 + L >= s || i === pts.length - 2) {
      const t = L > 0 ? clamp((s - acc3) / L, 0, 1) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / (L || 1), tz: (bz - az) / (L || 1) };
    }
    acc3 += L;
  }
  const p = pts[pts.length - 1];
  return { x: p[0], z: p[1], tx: 1, tz: 0 };
}
function chaikin(pts, iter = 2, closed = false) {
  let p = pts;
  for (let k = 0; k < iter; k++) {
    const o = closed ? [] : [p[0]];
    const n2 = closed ? p.length : p.length - 1;
    for (let i = 0; i < n2; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      o.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) o.push(p[p.length - 1]);
    p = o;
  }
  return p;
}
var MAP = {
  PLAY: 150,
  // внутреннее ограждение (полуразмер квадрата): колючая проволока на бетонных столбах
  KSP0: 152.4,
  KSP1: 157.9,
  // контрольно-следовая полоса: вспаханная и проборонованная земля — на ней остаются следы
  MINE1: 158.3,
  // внешнее ограждение (имя оставлено для совместимости): дальше хода нет
  FENCE: 158.6,
  CUT: 171,
  // внешняя граница просеки
  WORLD: 430,
  // визуальный лес до горизонта
  WATER_Y: -1.25,
  NAME: "STROYKA-12"
};
var SPAWNS = {
  A: { team: "A", name: "ALPHA", x: 0, z: -118, color: 2905728, where: "ферма" },
  D: { team: "D", name: "DELTA", x: 84, z: 84, color: 9713183, where: "склад ГСМ" }
};
for (const s of Object.values(SPAWNS)) {
  const l = Math.hypot(s.x, s.z);
  s.fx = -s.x / l;
  s.fz = -s.z / l;
  s.yaw = Math.atan2(-s.fx, -s.fz);
  s.r = 14;
}
var S2 = Math.SQRT1_2;
function lakeRho(x, z) {
  return 99;
}
var HG = { a: 31, b: 43, W: 15, L: 24, HW: 4, HA: 13.5, R: 16.59, YC: -3.09, rot: -Math.PI / 4, y: 0, fy: 0 };
var hgW = (lx, lz) => [(lx - lz) * S2, (lx + lz) * S2];
function hgRho(x, z) {
  return Math.max(Math.abs((x + z) * S2) / HG.a, Math.abs((z - x) * S2) / HG.b);
}
var hgOnSlab = (x, z) => {
  const lx = Math.abs((x + z) * S2), lz = Math.abs((z - x) * S2);
  return lx < HG.W + 1.2 && lz < HG.L + 1.2 || lx < 11.2 && lz < 33.3;
};
var ISLAND = { x: 0, z: 0, r: 0 };
var MOUNDS = [];
var PATHS = [];
function addPath(pts, w, kind, opt = {}) {
  const sm = opt.closed ? chaikin(pts, 3, true) : chaikin(pts, 3);
  if (opt.closed) sm.push(sm[0]);
  const p = { pts: sm, w, kind, lit: !!opt.lit, name: opt.name || "", len: polyLength(sm) };
  PATHS.push(p);
  return p;
}
var VU = [-0.92388, 0.38268];
var VN = [0.38268, 0.92388];
var vxz = (a, b) => [VU[0] * a + VN[0] * b, VU[1] * a + VN[1] * b];
var vab = (x, z) => [x * VU[0] + z * VU[1], x * VN[0] + z * VN[1]];
var VIL = {
  name: "Заречье",
  street: 117,
  // ось улицы (a)
  inner0: 97.5,
  // задворки ближнего к ангару порядка: дальше — склон оврага
  outer1: 138,
  // задворки дальнего порядка
  b0: -54,
  b1: 54,
  field0: 52,
  // заросшее поле между двором ангара и оврагом
  field1: 74
};
var RESP = { A: [SPAWNS.A], D: [SPAWNS.D] };
SPAWNS.A.id = 1;
SPAWNS.D.id = 1;
SPAWNS.A.label = "респ 1 · база, ферма";
SPAWNS.D.label = "респ 1 · база, склад ГСМ";
for (const [team, sgn, where] of [["A", -1, "Заречье, северный край"], ["D", 1, "Заречье, южный край"]]) {
  const [x, z] = vxz(VIL.street, sgn * 61), fx = -sgn * VN[0], fz = -sgn * VN[1];
  RESP[team].push({ team, id: 2, name: SPAWNS[team].name + "-2", x, z, fx, fz, yaw: Math.atan2(-fx, -fz), r: 8, color: SPAWNS[team].color, where, label: "респ 2 · " + where, village: true });
}
var RIVER_A = (b) => 83 + 2.5 * Math.sin(b * 0.043 + 0.6) + 1.2 * Math.sin(b * 0.107 + 2.1);
var RIVER = { pts: [], fords: [{ b: -42, name: "брод", kind: "ford" }, { b: 40, name: "перекат", kind: "riffle" }], bridgeB: 0.4 };
for (let b = -212; b <= 146; b += 6) RIVER.pts.push(vxz(RIVER_A(b), b));
var riverXZ = (b, off = 0) => vxz(RIVER_A(b) + off, b);
var ROADS = {};
ROADS.main = addPath([hgW(0, 27.5), hgW(0, 40), hgW(0, 49), vxz(58, 17.5), vxz(67, 9), vxz(74.5, 1.2)], 4.6, "road", { name: "дорога на Заречье" });
ROADS.main2 = addPath([vxz(96, 0.4), vxz(104, 0.2), vxz(111, 0), vxz(VIL.street, 0)], 4.6, "road", { name: "дорога на Заречье" });
{
  const st = [];
  for (const [b, da] of [[-62, 1.5], [-48, 0.6], [-30, -0.7], [-12, 0.2], [6, 0.9], [24, -0.2], [42, -0.9], [62, 0.8]]) st.push(vxz(VIL.street + da, b));
  ROADS.street = addPath(st, 5, "road", { lit: true, name: "улица" });
}
ROADS.farm = addPath([hgW(0, -27.5), hgW(0, -40), hgW(0, -49), [24, -60], [14, -80], [6, -96], [2, -104]], 4.2, "road", { name: "дорога на ферму" });
ROADS.depot = addPath([hgW(26.5, -9), hgW(33, -9), hgW(42, -9.5), [48, 46], [58, 59], [68, 70], [75, 76]], 4.2, "road", { name: "дорога на склад ГСМ" });
ROADS.north = addPath([vxz(VIL.street + 1.5, -62), vxz(112, -70), vxz(102, -64), riverXZ(-42, 7), riverXZ(-42, -7), vxz(66, -52), [-58, -58], [-36, -86], [-14, -106], [-4, -114]], 3.4, "road", { name: "просёлок через брод" });
ROADS.south = addPath([vxz(VIL.street + 0.8, 62), vxz(111, 69), vxz(101, 61.5), riverXZ(40, 7), riverXZ(40, -7), vxz(65, 51), [-4, 86], [38, 92], [62, 92], [72, 88]], 3.4, "road", { name: "просёлок через перекат" });
addPath([[-6, -106], [-22, -84], [-36, -62], [-44, -40], vxz(60, -20)], 2, "trail", { name: "тропа к полю С" });
addPath([[70, 74], [46, 82], [22, 72], [-2, 62], vxz(60, 22)], 2, "trail", { name: "тропа к полю Ю" });
addPath([[14, -106], [40, -96], [64, -70], [70, -40], [52, -22]], 1.8, "trail", { name: "восточная тропа" });
addPath([[90, 70], [104, 44], [102, 14], [86, -14], [56, -20]], 1.8, "trail", { name: "дальняя тропа" });
addPath([riverXZ(-44, -11), riverXZ(-22, -11.5), riverXZ(-6, -11), riverXZ(10, -11.5), riverXZ(28, -11), riverXZ(42, -11)], 1.5, "trail", { name: "над оврагом" });
var inCamp = (x, z, pad = 0) => false;
var PADS = [];
function addPad(x, z, hw, hd, rot = 0, m = 3) {
  const p = { x, z, hw, hd, rot, m };
  PADS.push(p);
  return p;
}
HG.y = baseH(0, 0) + 1.1;
HG.fy = HG.y + 0.14;
HG.pad = addPad(0, 0, HG.a + 2.2, HG.b + 2.2, HG.rot, 0.01);
HG.pad.y = HG.y;
HG.pad.embank = true;
var CELL2 = 8;
function makeIndex(lines, pad) {
  const grid = /* @__PURE__ */ new Map();
  lines.forEach((ln, li) => {
    let acc3 = 0;
    for (let i = 0; i < ln.pts.length - 1; i++) {
      const [ax, az] = ln.pts[i], [bx, bz] = ln.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const r = (ln.w ? ln.w * 0.5 : 0) + pad;
      const x0 = Math.floor((Math.min(ax, bx) - r) / CELL2), x1 = Math.floor((Math.max(ax, bx) + r) / CELL2);
      const z0 = Math.floor((Math.min(az, bz) - r) / CELL2), z1 = Math.floor((Math.max(az, bz) + r) / CELL2);
      const seg = { ax, az, bx, bz, L, s0: acc3, li };
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
        const k = gx * 4096 + gz;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(seg);
      }
      acc3 += L;
    }
  });
  return grid;
}
var PATH_IDX = makeIndex(PATHS, 3);
var TRENCHES = [];
var DYN_CRATERS = [];
var TW = { wall: 0.66, floor: 0.8, top: 1.1, cap: 1.08, ramp: 3.2 };
var TRENCH_PLAN = [];
for (let i = 0; i < TRENCH_PLAN.length; i++) {
  const { pts, opt } = TRENCH_PLAN[i];
  const near = (p) => {
    let best = 1e9;
    TRENCH_PLAN.forEach((o, j) => {
      if (j !== i) best = Math.min(best, polyDist(p[0], p[1], o.pts));
    });
    return best;
  };
  const len = polyLength(pts);
  TRENCHES.push({
    pts,
    len,
    depth: opt.depth ?? 1.8,
    name: opt.name || "",
    open0: near(pts[0]) < 1.3,
    open1: near(pts[pts.length - 1]) < 1.3,
    bays: !!opt.bays,
    dugout0: !!opt.dugout0,
    dugout1: !!opt.dugout1,
    nest1: !!opt.nest1,
    lake: !!opt.lake,
    covered: !!opt.covered
  });
}
var TRENCH_IDX = makeIndex(TRENCHES, 4);
var _q = { d: 0, s: 0, seg: null };
function nearestSeg(grid, x, z, out = _q) {
  const list = grid.get(Math.floor(x / CELL2) * 4096 + Math.floor(z / CELL2));
  out.d = 1e9;
  out.seg = null;
  if (!list) return out;
  for (const g of list) {
    const vx = g.bx - g.ax, vz = g.bz - g.az, L2 = vx * vx + vz * vz;
    let t = L2 > 0 ? ((x - g.ax) * vx + (z - g.az) * vz) / L2 : 0;
    t = clamp(t, 0, 1);
    const dx = x - g.ax - vx * t, dz = z - g.az - vz * t, d = Math.sqrt(dx * dx + dz * dz);
    if (d < out.d) {
      out.d = d;
      out.s = g.s0 + t * g.L;
      out.seg = g;
    }
  }
  return out;
}
function pathInfluence(x, z, extra = 0, info) {
  const list = PATH_IDX.get(Math.floor(x / CELL2) * 4096 + Math.floor(z / CELL2));
  let best = 0, road = 0, dist = 1e9;
  if (!list) {
    if (info) {
      info.road = 0;
      info.d = 1e9;
    }
    return 0;
  }
  for (const g of list) {
    const vx = g.bx - g.ax, vz = g.bz - g.az, L2 = vx * vx + vz * vz;
    let t = L2 > 0 ? ((x - g.ax) * vx + (z - g.az) * vz) / L2 : 0;
    t = clamp(t, 0, 1);
    const d = Math.hypot(x - g.ax - vx * t, z - g.az - vz * t);
    const p = PATHS[g.li];
    const hw = p.w * 0.5 * (1 + (vnoise(x * 0.35, z * 0.35) - 0.5) * 0.45) + extra;
    const v = 1 - smoothstep(hw * 0.55, hw, d);
    if (v > best) {
      best = v;
      road = p.kind === "road" ? 1 : 0;
    }
    if (d < dist) dist = d;
  }
  if (info) {
    info.road = road;
    info.d = dist;
  }
  return best;
}
function trenchDist(x, z, out) {
  const r = nearestSeg(TRENCH_IDX, x, z, out || { d: 0, s: 0, seg: null });
  return r.d;
}
var STREAMS = [];
var STREAM_BW = 2.3;
var RAV = { w: 6.5, d: 3.3 };
var STREAM_IDX = makeIndex(STREAMS, STREAM_BW + 16 + 13);
function streamAt(x, z, out = {}) {
  const r = nearestSeg(STREAM_IDX, x, z, { d: 0, s: 0, seg: null });
  if (!r.seg) {
    out.d = 1e9;
    return out;
  }
  const st = STREAMS[r.seg.li], i = clamp(r.s, 0, st.bed.length - 1.001), i0 = Math.floor(i);
  out.d = r.d;
  out.s = r.s;
  out.st = st;
  out.bed = lerp(st.bed[i0], st.bed[i0 + 1], i - i0);
  out.water = lerp(st.water[i0], st.water[i0 + 1], i - i0);
  return out;
}
var _sq = {};
function streamCarve(x, z, h) {
  streamAt(x, z, _sq);
  // дальняя граница выемки зависит от съезда к переправе (wall до 16 м): раньше обрезалась жёстко на 20,8 м —
  // у съездов получался вертикальный уступ грунта до 4 м; теперь выемка плавно сходит на нет
  if (_sq.d > STREAM_BW + 16 + 12) return h;
  const d = _sq.d, bw = STREAM_BW;
  // дно корытом, урез, крутой склон оврага, бровка и пологий выход на поле; у переправ — съезды
  let ramp = 0;
  for (const f of _sq.st.cross) ramp = Math.max(ramp, 1 - smoothstep(4, 9, Math.abs(_sq.s - f.s)));
  const wall = lerp(RAV.w, 16, ramp);
  const n = (vnoise(x * 0.21, z * 0.21) - 0.5) * 0.5;
  const bank = _sq.bed - 0.25 * (1 - smoothstep(0, bw, d)) + RAV.d * smoothstep(bw * 0.8, bw + wall, d) + Math.max(0, d - bw - wall) * 0.42 + n * smoothstep(bw, bw + 2, d);
  const k = 0.35;
  const m = h - bank;
  // гладкий минимум (полиномиальный smin): прежняя формула давала ступеньку 0,35 м по всей бровке оврага
  const c = m > k ? bank : m < -k ? h : h - (m + k) * (m + k) / (4 * k);
  const fade = smoothstep(bw + wall + 6, bw + wall + 12, d);
  return fade > 0 ? lerp(c, h, fade) : c;
}
var BOGS = [];
var symN = (x, z, f, o = 0) => 0.5 * (vnoise(x * f + o, z * f - o) + vnoise(-x * f + o, -z * f - o));
function bogShape(b, x, z) {
  const dx = x - b.x, dz = z - b.z, a = Math.atan2(dz * Math.sign(b.z), dx * Math.sign(b.z));
  const rr = b.r * (1 + 0.16 * Math.sin(2 * a + 0.7) + 0.08 * Math.sin(4 * a + 1.9));
  return Math.hypot(dx, dz) / rr;
}
function bogLevel(b) {
  if (b.level === void 0) {
    let lo = 1e9;
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2;
      lo = Math.min(lo, baseH(b.x + Math.cos(a) * b.r * 1.25, b.z + Math.sin(a) * b.r * 1.25));
    }
    b.level = Math.min(lo, baseH(b.x, b.z)) - 0.32;
  }
  return b.level;
}
function inBog(x, z) {
  let m = 0;
  for (const b of BOGS) {
    const q = bogShape(b, x, z);
    if (q < 1.15) m = Math.max(m, 1 - smoothstep(0.7, 1.15, q));
  }
  return m;
}
function bogCarve(x, z, h) {
  for (const b of BOGS) {
    const q = bogShape(b, x, z);
    if (q >= 1.15) continue;
    const m = 1 - smoothstep(0.7, 1.15, q);
    const hum = (symN(x, z, 0.75) - 0.5) * 0.55 + (symN(x, z, 2.1, 7) - 0.5) * 0.16 + 0.07;
    h = lerp(h, bogLevel(b) + hum, m);
  }
  return h;
}
var FORDS = [];
function fordBed(x, z, bed) {
  for (const f of FORDS) {
    const d = polyDist(x, z, [f.a, f.b]);
    if (d > 3.4) continue;
    const top = MAP.WATER_Y - 0.4 + (symN(x, z, 0.9) - 0.5) * 0.14;
    bed = Math.max(bed, lerp(top, bed, smoothstep(1.4, 3.4, d)));
  }
  return bed;
}
var DIGS = [];
function addDig(o) {
  DIGS.push(o);
  return o;
}
function digCarve(x, z, h) {
  for (const g of DIGS) {
    const d = padRectDist(g, x, z);
    if (d > 0.8) continue;
    const bottom = g.pad.y - g.depth;
    h = Math.min(h, lerp(bottom, h, smoothstep(0, 0.8, d)));
  }
  return h;
}
/* ===================================================================== *
 *  v22 · сектора и поле боя.
 *  1) У каждой точки возрождения сектора (все кандидаты из GSectors.DEFS) —
 *     поляна: деревьев почти нет в радиусе ~10 м, подлеска и высокой травы нет,
 *     земля утоптана. Кандидаты, попавшие в ручей/болото/окоп, сдвигаются на
 *     ближайшее сухое место (DEFS правится до GSectors.apply).
 *  2) От поляны — тропа к ближайшей дороге/тропе в сторону центра сектора
 *     (в обход воды, болот, окопов и построек): со старта видно, куда идти.
 *  3) Места боёв (точки встречи сектора и середины подходов к ним) — без травы
 *     и подлеска, деревья прорежены; вместо травы — воронки, гарь, обгоревшие
 *     брёвна, доски, листы железа, пни, ящики и сгоревшая легковушка.
 * ===================================================================== */
function v22Glade(x, z) {
  if (!V22) return 0;
  let m = 0;
  for (let i = 0; i < V22.spots.length; i++) {
    const s = V22.spots[i], dx = x - s.x, dz = z - s.z;
    if (dx > 15 || dx < -15 || dz > 15 || dz < -15) continue;
    const q = Math.sqrt(dx * dx + dz * dz);
    if (q < 15) m = Math.max(m, 1 - smoothstep(8.5, 15, q));
  }
  return m;
}
function v22Zone(x, z) {
  if (!V22) return 0;
  let m = 0;
  for (let i = 0; i < V22.zones.length; i++) {
    const c = V22.zones[i], dx = x - c.x, dz = z - c.z;
    if (dx > c.r || dx < -c.r || dz > c.r || dz < -c.r) continue;
    const q = Math.sqrt(dx * dx + dz * dz);
    if (q < c.r) m = Math.max(m, 1 - smoothstep(c.r * 0.6, c.r, q));
  }
  return m;
}
function v22Clear(x, z) {
  return V22 && (V22.spots.length || V22.zones.length) ? Math.max(v22Glade(x, z), v22Zone(x, z)) : 0;
}
/* множитель густоты леса: поляны у баз и прореженные места боёв */
function v22TreeK(x, z) {
  if (!V22) return 1;
  let k = 1;
  for (let i = 0; i < V22.spots.length; i++) {
    const s = V22.spots[i], dx = x - s.x, dz = z - s.z;
    if (dx > 23 || dx < -23 || dz > 23 || dz < -23) continue;
    const q = Math.sqrt(dx * dx + dz * dz);
    if (q < 23) k *= 0.06 + 0.94 * smoothstep(10, 23, q);
  }
  for (let i = 0; i < V22.zones.length; i++) {
    const c = V22.zones[i], R = c.r * 1.15, dx = x - c.x, dz = z - c.z;
    if (dx > R || dx < -R || dz > R || dz < -R) continue;
    const q = Math.sqrt(dx * dx + dz * dz);
    if (q < R) k *= 0.4 + 0.6 * smoothstep(c.r * 0.45, R, q);
  }
  return k;
}
/* трава: на местах боёв — ноль, на полянах — реже и ниже */
function v22GrassK(x, z) {
  if (!V22 || !(V22.spots.length || V22.zones.length)) return 1;
  return (1 - v22Zone(x, z)) * (1 - 0.6 * v22Glade(x, z));
}
/* утоптанная земля поляны (канал троп) и перепаханная земля мест боёв */
function v22Pi(x, z, pi) {
  if (!V22 || !V22.spots.length) return pi;
  const g = v22Glade(x, z);
  if (g <= 0) return pi;
  return Math.max(pi, g * 0.62 * smoothstep(0.2, 0.75, vnoise(x * 0.23 + 5.1, z * 0.23 - 2.7) * 0.55 + g * 0.5));
}
function v22Dug(x, z, dug) {
  if (!V22 || !V22.zones.length) return dug;
  const k = v22Zone(x, z);
  if (k <= 0) return dug;
  return Math.max(dug, k * 0.62 * smoothstep(0.32, 0.78, vnoise(x * 0.19 - 4.3, z * 0.19 + 8.2)));
}
function v22Plan() {
  const GS = globalThis.GSectors, def = GS && GS.DEFS && GS.DEFS[V22.map];
  if (!def) return;
  const R2 = rng(2207);
  const mean = (a) => {
    let x = 0, z = 0;
    for (const p of a) {
      x += p[0];
      z += p[1];
    }
    return [x / a.length, z / a.length];
  };
  /* 1) точки возрождения: с воды/болота/окопа — на ближайшее сухое место */
  for (const sec of def.sectors) {
    const poly = GS.polygonOf(def, sec), cm = mean(sec.centre);
    for (const side of sec.sides) for (let i = 0; i < side.length; i++) {
      let b = side[i];
      if (v22Skip(b[0], b[1])) continue;
      if (v22Wet(b[0], b[1], 2.5)) {
        let best = null;
        for (let r = 2; r <= 18 && !best; r += 2) for (let k = 0; k < 16; k++) {
          const a = k / 16 * Math.PI * 2, x = b[0] + Math.cos(a) * r, z = b[1] + Math.sin(a) * r;
          if (GS.margin(poly, x, z) < 8 || v22Wet(x, z, 2.5) || v22Blocked(x, z, 0.5)) continue;
          best = [Math.round(x * 10) / 10, Math.round(z * 10) / 10];
          break;
        }
        if (best) {
          side[i] = best;
          b = best;
          V22.moved++;
        }
      }
      const dx = cm[0] - b[0], dz = cm[1] - b[1], L = Math.hypot(dx, dz) || 1;
      V22.spots.push({ x: b[0], z: b[1], dx: dx / L, dz: dz / L, cx: cm[0], cz: cm[1] });
    }
  }
  /* 2) тропы от полян к ближайшей дороге/тропе — в сторону центра сектора */
  const onPath = (x, z) => pathInfluence(x, z, 0.5) > 0;
  for (const s of V22.spots) {
    if (onPath(s.x, s.z)) continue;
    const pts = [[s.x - s.dx * 4, s.z - s.dz * 4], [s.x, s.z]];
    let x = s.x, z = s.z, ok = false, last = 0;
    for (let k = 0; k < 90; k++) {
      const want = Math.atan2(s.cz - z, s.cx - x);
      let moved = false;
      for (const da of [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.3, -1.3]) {
        const nx = x + Math.cos(want + da) * 2, nz = z + Math.sin(want + da) * 2;
        if (v22Blocked(nx, nz, 0)) continue;
        x = nx;
        z = nz;
        moved = true;
        break;
      }
      if (!moved) break;
      if (onPath(x, z) || Math.hypot(s.cx - x, s.cz - z) < 8) {
        pts.push([x, z]);
        ok = true;
        break;
      }
      if (k - last >= 3) {
        pts.push([x, z]);
        last = k;
      }
    }
    if (ok) {
      addPath(pts, 2.4, "trail", { name: "тропа от базы" });
      V22.trails++;
    }
  }
  if (V22.trails) PATH_IDX = makeIndex(PATHS, 3);
  /* 3) места боёв: точки встречи и середины подходов к ним */
  for (const sec of def.sectors) {
    const groups = [];
    for (const c of sec.centre) {
      const g = groups.find((q) => Math.hypot(q.x - c[0], q.z - c[1]) < 22);
      if (g) {
        g.n++;
        g.x += (c[0] - g.x) / g.n;
        g.z += (c[1] - g.z) / g.n;
      } else groups.push({ x: c[0], z: c[1], n: 1 });
      V22.zones.push({ x: c[0], z: c[1], r: 15, kind: "centre", sec: sec.id });
    }
    for (const side of sec.sides) {
      const sm = mean(side);
      for (const g of groups) V22.zones.push({ x: lerp(sm[0], g.x, 0.52), z: lerp(sm[1], g.z, 0.52), r: 12.5, kind: "front", sec: sec.id });
    }
  }
  const farFromSpots = (x, z, r) => V22.spots.every((s) => Math.hypot(x - s.x, z - s.z) > 13 + r);
  /* 4) воронки — вне троп, построек, полян; свежие и оплывшие */
  for (const c of V22.zones) {
    const want = c.kind === "centre" ? 4 : 3;
    let n2 = 0;
    for (let t = 0; t < 70 && n2 < want; t++) {
      const a = R2() * Math.PI * 2, d = Math.sqrt(R2()) * c.r * 0.85, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, r = R2.range(1.3, 2.7);
      if (!v22CraterOk(x, z, r) || !isFree(x, z, r + 0.6, { pathPad: 0.3, trenchPad: 1.2 }) || !farFromSpots(x, z, r)) continue;
      if (CRATERS.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r + 0.8)) continue;
      CRATERS.push({ x, z, r, old: R2() < 0.3, v22: true });
      n2++;
      V22.craters++;
    }
  }
  /* 5) обгоревшие обломки */
  const kinds = ["log", "log", "planks", "planks", "sheet", "stump", "crate"];
  for (const c of V22.zones) {
    const want = c.kind === "centre" ? 6 : 5;
    let n2 = 0;
    for (let t = 0; t < 80 && n2 < want; t++) {
      const a = R2() * Math.PI * 2, d = Math.sqrt(R2()) * c.r * 0.9, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      const kind = kinds[R2.int(0, kinds.length - 1)], sz = kind === "log" ? 1.5 : kind === "planks" ? 1.2 : 0.8;
      if (!isFree(x, z, sz, { pathPad: 0.2, trenchPad: 1 }) || !farFromSpots(x, z, 1)) continue;
      if (CRATERS.some((q) => Math.hypot(q.x - x, q.z - z) < q.r * 0.9 + sz)) continue;
      V22.debris.push({ kind, x, z, rot: R2() * Math.PI * 2, s: R2.range(0.8, 1.2), seed: R2.int(1, 1e6) });
      keep(x, z, sz * 0.8);
      n2++;
    }
  }
  /* сгоревшая легковушка — по одной на сектор, на подходе к центру */
  for (const sec of def.sectors) {
    let done = false;
    for (const c of V22.zones) {
      if (done || c.sec !== sec.id || c.kind !== "front") continue;
      for (let t = 0; t < 40 && !done; t++) {
        const a = R2() * Math.PI * 2, d = Math.sqrt(R2()) * c.r * 0.7, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
        if (!v22CraterOk(x, z, 3) || !isFree(x, z, 3.4, { pathPad: 0.6, trenchPad: 1.5 }) || !farFromSpots(x, z, 4)) continue;
        if (CRATERS.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + 3.6)) continue;
        V22.cars.push({ x, z, rot: R2() * Math.PI * 2, seed: 300 + sec.id });
        keep(x, z, 3.2);
        done = true;
      }
    }
  }
  /* 6) гарь на земле (канал R текстуры гари) и обугленная растительность (A) */
  const paint = (x, z, r, k) => {
    const N2 = BURN.N, i0 = Math.max(0, Math.floor(x - r - BURN.X0)), i1 = Math.min(N2 - 1, Math.ceil(x + r - BURN.X0)), j0 = Math.max(0, Math.floor(z - r - BURN.X0)), j1 = Math.min(N2 - 1, Math.ceil(z + r - BURN.X0));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const wx = BURN.X0 + i + 0.5, wz = BURN.X0 + j + 0.5, q = Math.hypot(wx - x, wz - z) / r;
      if (q >= 1.15) continue;
      const v = (1 - smoothstep(0.3, 1, q + (vnoise(wx * 0.45 + 3.1, wz * 0.45 - 1.7) - 0.5) * 0.55)) * k;
      if (v <= 0) continue;
      const o = (j * N2 + i) * 4;
      burnData[o] = Math.max(burnData[o], Math.min(255, Math.round(v * 255)));
      burnData[o + 3] = Math.max(burnData[o + 3], Math.min(255, Math.round(v * 210)));
    }
  };
  for (const c of CRATERS) if (c.v22) paint(c.x, c.z, c.r * 1.9, c.old ? 0.45 : 0.8);
  for (const d of V22.debris) paint(d.x, d.z, 2.3 * d.s, 0.55);
  for (const car of V22.cars) paint(car.x, car.z, 4.8, 0.9);
  burnTex.needsUpdate = true;
  globalThis.AEGIS_V22 = V22;
  console.info(`[v22] ${V22.map}: поляны ${V22.spots.length} (сдвинуто ${V22.moved}), троп ${V22.trails}, мест боёв ${V22.zones.length}, воронок ${V22.craters}, обломков ${V22.debris.length}, машин ${V22.cars.length}`);
}
function v22Build() {
  if (!V22 || !V22.debris.length && !V22.cars.length) return;
  M.charLog ??= std({ color: 1841167, roughness: 1, metalness: 0 });
  M.v22Ash ??= std({ color: 2631205, roughness: 1, metalness: 0 });
  const ch = M.charLog;
  for (const d of V22.debris) {
    const R2 = rng(d.seed), y = hFast(d.x, d.z), s = d.s, c = Math.cos(d.rot), sn = Math.sin(d.rot);
    if (d.kind === "log") {
      const L = R2.range(1.8, 3) * s, r = R2.range(0.13, 0.2) * s, tilt = R2.range(-0.06, 0.06);
      cyl(ch, d.x, y + r * 0.75, d.z, r, r * 0.82, L, { seg: 9, rot: [Math.PI / 2, d.rot, tilt] });
      /* обломанные сучья */
      for (let k = 0; k < 2; k++) {
        const t = R2.range(-0.35, 0.35) * L, px = d.x + sn * t, pz = d.z + c * t, side = k ? 1 : -1;
        const a = V4(px, y + r * 0.9, pz), b = V4(px + c * side * 0.45 * s, y + r * 0.9 + R2.range(0.15, 0.35), pz - sn * side * 0.45 * s);
        beam(ch, a, b, 0.035 * s, { seg: 5 });
      }
      addBox(d.x, y + r * 0.75, d.z, r * 2, r * 1.6, L, d.rot, { walk: true });
    } else if (d.kind === "planks") {
      const n2 = R2.int(3, 5);
      for (let k = 0; k < n2; k++) {
        const L = R2.range(1.1, 2.4) * s, a = d.rot + R2.range(-0.6, 0.6), ox = R2.range(-0.7, 0.7), oz = R2.range(-0.7, 0.7);
        const px = d.x + ox, pz = d.z + oz;
        box(k % 3 ? ch : M.v22Ash, px, hFast(px, pz) + 0.03 + k * 0.035, pz, 0.19, 0.035, L, { rot: a, rx: R2.range(-0.08, 0.08), rz: R2.range(-0.12, 0.12), tile: 1, cast: false });
      }
      /* обугленный столбик, оставшийся стоять */
      if (R2() < 0.5) cyl(ch, d.x + R2.range(-0.5, 0.5), y + 0.35, d.z + R2.range(-0.5, 0.5), 0.07, 0.05, 0.7, { seg: 6, rot: [R2.range(-0.25, 0.25), 0, R2.range(-0.25, 0.25)] });
    } else if (d.kind === "sheet") {
      const w = R2.range(1.1, 1.7) * s, l = R2.range(0.8, 1.2) * s;
      box(M.armorBurnt, d.x, y + 0.05, d.z, w, 0.02, l, { rot: d.rot, rx: R2.range(-0.1, 0.1), rz: R2.range(0.08, 0.2), tile: 1, cast: false });
      /* загнутый край */
      const ex = d.x + c * w * 0.52, ez = d.z - sn * w * 0.52;
      box(M.armorBurnt, ex, y + 0.18, ez, 0.4 * s, 0.02, l * 0.9, { rot: d.rot, rz: 0.9 + R2.range(-0.2, 0.3), tile: 1, cast: false });
    } else if (d.kind === "stump") {
      const h = R2.range(0.5, 1.5) * s, r = R2.range(0.2, 0.3) * s;
      cyl(ch, d.x, y + h / 2 - 0.05, d.z, r * 1.15, r, h, { seg: 9 });
      /* расщеплённая верхушка */
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * Math.PI * 2 + R2() * 0.6, px = d.x + Math.cos(a) * r * 0.45, pz = d.z + Math.sin(a) * r * 0.45;
        beam(ch, V4(px, y + h - 0.08, pz), V4(px + Math.cos(a) * 0.1, y + h + R2.range(0.15, 0.4), pz + Math.sin(a) * 0.1), r * 0.32, { seg: 4, r1: 0.01 });
      }
      addCircle(d.x, d.z, r * 1.1, y - 0.1, y + h);
    } else {
      /* сгоревший ящик из-под боеприпасов */
      const w = 0.78 * s, hh = 0.3 * s, dd = 0.42 * s;
      box(M.burnt, d.x, y + hh / 2, d.z, w, hh, dd, { rot: d.rot, rz: R2.range(-0.05, 0.05), tile: 1 });
      const lx = d.x + c * 0.25 + sn * 0.3, lz = d.z - sn * 0.25 + c * 0.3;
      box(ch, lx, hFast(lx, lz) + 0.04, lz, w * 0.95, 0.03, dd, { rot: d.rot + 0.7, rx: 0.15, tile: 1, cast: false });
      addBox(d.x, y + hh / 2, d.z, w, hh, dd, d.rot, { walk: true });
    }
  }
  for (const car of V22.cars) {
    try {
      vehicle("sedan", car.x, car.z, car.rot, { seed: car.seed, burnt: true });
    } catch (e) {
      console.warn("[v22] машина", e && e.message);
    }
  }
}
/* v22: препятствия для троп и точек возрождения на «Заречье» */
function v22Skip(x, z) {
  return hgRho(x, z) < 1.5;
}
function v22Wet(x, z, pad) {
  return inBog(x, z) > 0.02 || streamAt(x, z).d < STREAM_BW + RAV.w + 1 + pad || trenchDist(x, z) < 2.2 + pad;
}
function v22Blocked(x, z, pad) {
  if (v22Wet(x, z, pad) || hgRho(x, z) < 1.1 || edgeDist(x, z) > MAP.PLAY - 4 || inPlan(x, z, 1.2 + pad)) return true;
  for (const k of KEEPOUT) {
    const dx = x - k.x, dz = z - k.z, R2 = k.r + 1 + pad;
    if (dx * dx + dz * dz < R2 * R2) return true;
  }
  for (const p of PADS) if (padRectDist(p, x, z) < 1.2 + pad) return true;
  return false;
}
function v22CraterOk(x, z, r) {
  return !inVillage(x, z, 6) && !inPlan(x, z, r + 2) && hgRho(x, z) > 1.3 && streamAt(x, z).d > r + STREAM_BW + RAV.w + 3;
}
var CRATERS = [];
function planCraters() {
  const R2 = rng(771);
  let tries = 0;
  while (CRATERS.length < 46 && tries++ < 4e3) {
    const x = R2.range(-140, 140), z = R2.range(-140, 140), r = R2.range(1.5, 3.2);
    if (hgRho(x, z) < 1.3) continue;
    if (pathInfluence(x, z, 2) > 0 || trenchDist(x, z) < r + 2.5) continue;
    if (streamAt(x, z).d < r + STREAM_BW + RAV.w + 3) continue;
    if (Math.hypot(x - SPAWNS.A.x, z - SPAWNS.A.z) < 30 || Math.hypot(x - SPAWNS.D.x, z - SPAWNS.D.z) < 30) continue;
    if (inVillage(x, z, 6) || inPlan(x, z, r + 2)) continue;
    CRATERS.push({ x, z, r, old: R2() < 0.6 });
  }
}
function edgeDist(x, z) {
  return Math.max(Math.abs(x), Math.abs(z));
}
function inVillage(x, z, pad = 0) {
  const [a, b] = vab(x, z);
  return a > VIL.inner0 - pad && a < VIL.outer1 + pad && b > VIL.b0 - 8 - pad && b < VIL.b1 + 8 + pad;
}
function inField(x, z) {
  const [a, b] = vab(x, z);
  if (b < -62 || b > 62) return 0;
  const ra = RIVER_A(b) - STREAM_BW - RAV.w - 3;
  return smoothstep(VIL.field0 - 6, VIL.field0 + 2, a) * (1 - smoothstep(ra - 2, ra + 2, a)) * (1 - smoothstep(52, 62, Math.abs(b)));
}
var PLANS = [];
function inPlan(x, z, pad = 0) {
  for (const p of PLANS) if (padRectDist(p, x, z) < pad) return true;
  return false;
}
function hills(x, z) {
  return (fbm(x * 0.0105 + 3.1, z * 0.0105 - 7.7, 4) - 0.5) * 7.5 + (fbm(x * 0.041 + 9, z * 0.041 - 3, 3) - 0.5) * 1.5;
}
function baseH(x, z) {
  let h = hills(x, z);
  for (const s of Object.values(SPAWNS)) {
    const d = Math.hypot(x - s.x, z - s.z);
    h += 2.4 * Math.exp(-(d * d) / (22 * 22));
  }
  h += smoothstep(MAP.CUT, 330, edgeDist(x, z)) * 18;
  // насыпные высоты под пулемётные гнёзда: плоская макушка, пологие склоны, лёгкая неровность
  for (let i = 0; i < MOUNDS.length; i++) {
    const m = MOUNDS[i], dx = x - m.x, dz = z - m.z;
    if (dx > m.r || dx < -m.r || dz > m.r || dz < -m.r) continue;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= m.r) continue;
    const k = 1 - smoothstep(m.top, m.r, d);
    h = Math.max(h, lerp(h, m.base + m.h, k * k * (3 - 2 * k)) + (d > m.top ? Math.sin(dx * 1.3 + dz * 0.7) * 0.08 * k : 0));
  }
  return h;
}
function padRectDist(p, x, z) {
  const c = Math.cos(p.rot), s = Math.sin(p.rot);
  const dx = x - p.x, dz = z - p.z;
  const lx = Math.abs(dx * c - dz * s) - p.hw, lz = Math.abs(dx * s + dz * c) - p.hd;
  return Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) + Math.min(Math.max(lx, lz), 0);
}
var _pi = { road: 0, d: 0 };
var _tq = { d: 0, s: 0, seg: null };
function trenchTaper(tr, s) {
  return (tr.open0 ? 1 : smoothstep(0, TW.ramp, s)) * (tr.open1 ? 1 : smoothstep(0, TW.ramp, tr.len - s));
}
function terrainH(x, z) {
  let h = baseH(x, z);
  const rho = lakeRho(x, z);
  if (rho < 2.2) {
    const shore = MAP.WATER_Y + 0.12 + Math.max(0, rho - 1) * 3.2;
    const land = lerp(shore, h, smoothstep(1, 2.2, rho));
    const bed = MAP.WATER_Y + 0.12 - 3.4 * smoothstep(1, 0.45, rho) - 0.35 * smoothstep(1, 0.9, rho);
    h = rho >= 1 ? land : fordBed(x, z, bed);
    const di = Math.hypot(x - ISLAND.x, z - ISLAND.z);
    if (di < ISLAND.r + 3) h = Math.max(h, MAP.WATER_Y - 2.5 + 3.4 * (1 - smoothstep(2.2, ISLAND.r, di)));
  }
  h = streamCarve(x, z, h);
  h = bogCarve(x, z, h);
  for (const p of PADS) {
    if (p.embank) continue;
    const d = padRectDist(p, x, z);
    if (d > p.m) continue;
    if (p.y === void 0) p.y = baseH(p.x, p.z);
    h = lerp(h, p.y, 1 - smoothstep(0, p.m, d));
  }
  {
    // насыпь: откос 1:2 (у дорог — пандус ~1:8), у подошвы — кювет глубиной ~0,45 м, под дорогой — труба
    const p = HG.pad, d = padRectDist(p, x, z);
    if (d < 14) {
      const rk = pathInfluence(x, z, 1.8), run = lerp(2.3, 9, rk), drop = p.y - h;
      if (d <= 0) h = p.y;
      else if (drop > 0) {
        const t = clamp(d / (run * Math.max(0.3, drop / 1.1)), 0, 1);
        h = lerp(p.y, h, t * t * (3 - 2 * t) * 0.35 + t * 0.65);
      } else h = lerp(p.y, h, smoothstep(0, run, d));
      const toe = run * Math.max(0.3, Math.max(0, drop) / 1.1) + 1;
      h -= 0.45 * Math.exp(-Math.pow((d - toe) / 0.55, 2)) * (1 - smoothstep(0.05, 0.4, rk));
    }
  }
  h = digCarve(x, z, h);
  let carve = 0, parapet = 0;
  nearestSeg(TRENCH_IDX, x, z, _tq);
  if (_tq.seg && _tq.d < 3.2) {
    const tr = TRENCHES[_tq.seg.li];
    const s = _tq.s, taper = trenchTaper(tr, s);
    carve = (1 - smoothstep(TW.floor, TW.top, _tq.d)) * taper;
    parapet = (tr.lake ? 0.75 : 0.42) * Math.exp(-Math.pow((_tq.d - 1.6) / 0.5, 2)) * (0.4 + 0.6 * taper);
    if (tr.lake) h += Math.max(0, MAP.WATER_Y + 1.75 - h) * (1 - smoothstep(1.3, 3.2, _tq.d)) * smoothstep(0, 2, Math.min(s, tr.len - s) + 1);
    const cut = h - tr.depth * carve;
    h = rho < 2.5 ? lerp(h, Math.max(cut, MAP.WATER_Y + 0.3), carve > 0 ? 1 : 0) : cut;
  }
  const pi = pathInfluence(x, z, 0, _pi);
  const yard = 1 - smoothstep(0.96, 1.06, hgRho(x, z));
  h += (vnoise(x * 0.55, z * 0.55) - 0.5) * 0.22 * (1 - pi) * (1 - carve) * (1 - 0.65 * yard) + parapet;
  if (hgOnSlab(x, z)) return HG.fy - 0.03;
  if (pi > 0) {
    h -= pi * 0.07;
    if (_pi.road) h -= 0.07 * Math.exp(-Math.pow((_pi.d - 0.95) / 0.28, 2)) * pi;
  }
  for (const c of CRATERS) {
    const dx = x - c.x, dz = z - c.z;
    if (Math.abs(dx) > c.r * 1.6 || Math.abs(dz) > c.r * 1.6) continue;
    const d = Math.hypot(dx, dz) / c.r;
    if (d < 1.6) h += (c.old ? 0.55 : 1) * (-0.55 * c.r * 0.32 * Math.max(0, 1 - d * d) + 0.16 * c.r * 0.3 * Math.exp(-Math.pow((d - 1.05) / (c.old ? 0.4 : 0.25), 2)));
  }
  for (let i = 0; i < DYN_CRATERS.length; i++) {
    const c = DYN_CRATERS[i], dx = x - c.x, dz = z - c.z, R2 = c.r * 1.6;
    if (dx > R2 || dx < -R2 || dz > R2 || dz < -R2) continue;
    h += craterDelta(c, x, z);
  }
  return h;
}
function craterDelta(c, x, z) {
  const d = Math.hypot(x - c.x, z - c.z) / c.r;
  if (d >= 1.6) return 0;
  return -c.dep * Math.max(0, 1 - d * d) * (1 - 0.25 * d * d) + c.rim * Math.exp(-Math.pow((d - 1.02) / 0.22, 2));
}
function splat(x, z, out) {
  const pi = pathInfluence(x, z);
  const rho = lakeRho(x, z);
  let mud2 = 1 - smoothstep(1.02, 1.28, rho);
  const di = Math.hypot(x, z);
  if (di < ISLAND.r + 2) mud2 = Math.max(mud2 * smoothstep(2, ISLAND.r - 1.5, di), 0);
  let dug = 0;
  const td = trenchDist(x, z);
  if (td < 2.6) dug = 1 - smoothstep(1.6, 2.6, td);
  for (const c of CRATERS) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < c.r * 1.5) dug = Math.max(dug, (c.old ? 0.25 : 1) * (1 - smoothstep(c.r * 0.8, c.r * 1.5, d)));
  }
  const e = edgeDist(x, z);
  // КСП: вспаханная и проборонованная полоса — сплошная свежая земля с бороздами вдоль ограждения
  if (e > MAP.KSP0 - 0.6 && e < MAP.KSP1 + 0.6) dug = Math.max(dug, (0.82 + 0.18 * Math.sin(e * 9.5)) * smoothstep(MAP.KSP0 - 0.6, MAP.KSP0 + 0.2, e) * (1 - smoothstep(MAP.KSP1 - 0.2, MAP.KSP1 + 0.6, e)));
  // тропа часового между ограждениями — утоптанная
  if (e > MAP.PLAY + 0.5 && e < MAP.KSP0 - 0.3) dug = Math.max(dug, 0.25);
  const bog2 = inBog(x, z);
  if (bog2 > 0) mud2 = Math.max(mud2, bog2 * 0.95);
  // площадка за оградой: укатанный щебень и пятна грязи от колёс
  const hr = hgRho(x, z);
  if (hr < 1.04) {
    const yk = 1 - smoothstep(0.95, 1.04, hr);
    out[0] = Math.max(pi, yk * (0.72 + 0.28 * vnoise(x * 0.31, z * 0.31)));
    out[1] = Math.max(mud2, yk * 0.5 * smoothstep(0.55, 0.85, vnoise(x * 0.09 + 3, z * 0.09 - 2)));
    out[2] = Math.max(dug, yk * 0.25 * smoothstep(0.6, 0.9, vnoise(x * 0.2 - 5, z * 0.2 + 1)));
    return out;
  }
  const sq = streamAt(x, z);
  if (sq.d < STREAM_BW + 3) mud2 = Math.max(mud2, 1 - smoothstep(STREAM_BW * 0.7, STREAM_BW + 3, sq.d));
  // огороды и вытоптанные дворы
  const vy = villageSplat(x, z);
  if (vy) dug = Math.max(dug, vy);
  out[0] = v22Pi(x, z, pi);
  out[1] = mud2;
  out[2] = v22Dug(x, z, dug);
  return out;
}
var KEEPOUT = [];
var keep = (x, z, r) => KEEPOUT.push({ x, z, r });
function isFree(x, z, r = 1, opt = {}) {
  if (hgRho(x, z) < (opt.lake ?? 1.08)) return false;
  if (Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.r && opt.island !== true) return false;
  if (pathInfluence(x, z, r + (opt.pathPad ?? 0.6)) > 0) return false;
  if (trenchDist(x, z) < r + (opt.trenchPad ?? 1.8)) return false;
  if (opt.stream !== true && streamAt(x, z).d < r + STREAM_BW + 3.4) return false;
  if (opt.bog !== true && inBog(x, z) > 0.05) return false;
  for (const k of KEEPOUT) {
    const dx = x - k.x, dz = z - k.z, R2 = k.r + r;
    if (dx * dx + dz * dz < R2 * R2) return false;
  }
  for (const p of PADS) if (padRectDist(p, x, z) < r + 0.5) return false;
  if (opt.plan !== true && inPlan(x, z, r + 0.3)) return false;
  return true;
}
var THREE5 = ctx.THREE;
var THREE2 = ctx.THREE;
function cv(w, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d", { willReadFrequently: true })];
}
var TS = (n2) => Math.max(64, Math.round(n2 * Q.tex / 64) * 64);
function wrapDraw(x, w, h, fn) {
  for (const [ox, oy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    x.save();
    x.translate(ox * w, oy * h);
    fn();
    x.restore();
  }
}
function grain(x, w, h, amt) {
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n2 = (srnd() - 0.5) * amt * 255;
    d[i] = clamp(d[i] + n2, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n2, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n2, 0, 255);
  }
  x.putImageData(img, 0, 0);
}
function heightToNormal(hc, strength = 2) {
  const w = hc.width, h = hc.height, [o, ox] = cv(w, h);
  const src = hc.getContext("2d").getImageData(0, 0, w, h).data;
  const out = ox.createImageData(w, h), d = out.data;
  const H2 = (x, y) => src[((y + h) % h * w + (x + w) % w) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H2(x + 1, y) - H2(x - 1, y)) * strength;
    const dy = (H2(x, y + 1) - H2(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * w + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255;
    d[i + 1] = (dy / l * 0.5 + 0.5) * 255;
    d[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    d[i + 3] = 255;
  }
  ox.putImageData(out, 0, 0);
  return o;
}
function sharpenAlpha(c, cut = 0.45) {
  const x = c.getContext("2d");
  const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] / 255 < cut ? 0 : 255;
  x.putImageData(img, 0, 0);
  return c;
}
function bleedColor(c, passes = 4) {
  const x = c.getContext("2d"), w = c.width, h = c.height;
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let p = 0; p < passes; p++) {
    const src = new Uint8ClampedArray(d);
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
      const i = (y * w + xx) * 4;
      if (src[i + 3] > 0 || d[i] + d[i + 1] + d[i + 2] > 0) continue;
      let r = 0, g = 0, b = 0, n2 = 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = xx + ox, Y = y + oy;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = (Y * w + X) * 4;
        if (src[j] + src[j + 1] + src[j + 2] === 0) continue;
        r += src[j];
        g += src[j + 1];
        b += src[j + 2];
        n2++;
      }
      if (n2) {
        d[i] = r / n2;
        d[i + 1] = g / n2;
        d[i + 2] = b / n2;
      }
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}
function tex(canvas, rx = 1, ry = 1, srgb = true) {
  const t = new THREE2.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE2.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = Math.min(8, MAXA());
  t.colorSpace = srgb ? THREE2.SRGBColorSpace : THREE2.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE2.LinearMipmapLinearFilter;
  return t;
}
var rgba = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
function blob(x, px, py, r, col, a0 = 1) {
  const g = x.createRadialGradient(px, py, 0, px, py, r);
  g.addColorStop(0, rgba(col[0], col[1], col[2], a0));
  g.addColorStop(1, rgba(col[0], col[1], col[2], 0));
  x.fillStyle = g;
  x.beginPath();
  x.arc(px, py, r, 0, 7);
  x.fill();
}
function forestFloor() {
  const S = TS(1024), K = S / 1024;
  const [c, x] = cv(S), [h, hx2] = cv(S);
  x.fillStyle = "#3a3122";
  x.fillRect(0, 0, S, S);
  hx2.fillStyle = "#808080";
  hx2.fillRect(0, 0, S, S);
  for (let i = 0; i < 520 * K; i++) {
    const px = srnd() * S, py = srnd() * S, r = sr(18, 120) * K;
    const k = srnd();
    const col = k < 0.35 ? [si(52, 78), si(66, 92), si(30, 44)] : k < 0.7 ? [si(92, 124), si(66, 88), si(38, 52)] : [si(40, 58), si(32, 44), si(24, 32)];
    wrapDraw(x, S, S, () => blob(x, px, py, r, col, sr(0.18, 0.5)));
    if (k < 0.35) wrapDraw(hx2, S, S, () => blob(hx2, px, py, r, [170, 170, 170], 0.35));
  }
  for (let i = 0; i < 16e3 * K * K; i++) {
    const px = srnd() * S, py = srnd() * S, a = sr(0, TAU), L = sr(5, 15) * K;
    const v = si(70, 150), dry = srnd() < 0.7;
    x.strokeStyle = dry ? rgba(v, v * 0.7, v * 0.4, sr(0.35, 0.8)) : rgba(v * 0.55, v * 0.62, v * 0.32, sr(0.3, 0.6));
    x.lineWidth = sr(0.7, 1.6) * K;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L);
    x.stroke();
    hx2.strokeStyle = rgba(si(150, 210), si(150, 210), si(150, 210), 0.45);
    hx2.lineWidth = x.lineWidth * 1.2;
    hx2.beginPath();
    hx2.moveTo(px, py);
    hx2.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L);
    hx2.stroke();
  }
  for (let i = 0; i < 90 * K; i++) {
    const px = srnd() * S, py = srnd() * S, a = sr(0, TAU), L = sr(20, 70) * K;
    const v = si(60, 100);
    wrapDraw(x, S, S, () => {
      x.strokeStyle = rgba(v, v * 0.78, v * 0.55, 0.9);
      x.lineWidth = sr(1.5, 3.5) * K;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L);
      x.stroke();
    });
    wrapDraw(hx2, S, S, () => {
      hx2.strokeStyle = "rgba(235,235,235,.9)";
      hx2.lineWidth = sr(2, 4) * K;
      hx2.beginPath();
      hx2.moveTo(px, py);
      hx2.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L);
      hx2.stroke();
    });
  }
  for (let i = 0; i < 70 * K; i++) {
    const px = srnd() * S, py = srnd() * S, a = sr(0, TAU), r = sr(6, 11) * K;
    wrapDraw(x, S, S, () => {
      x.save();
      x.translate(px, py);
      x.rotate(a);
      x.fillStyle = rgba(si(78, 104), si(54, 70), si(32, 42), 1);
      x.beginPath();
      x.ellipse(0, 0, r, r * 0.45, 0, 0, 7);
      x.fill();
      x.strokeStyle = "rgba(30,20,12,.7)";
      x.lineWidth = K;
      for (let k = -2; k <= 2; k++) {
        x.beginPath();
        x.moveTo(k * r * 0.3, -r * 0.4);
        x.lineTo(k * r * 0.3 + 2 * K, r * 0.4);
        x.stroke();
      }
      x.restore();
    });
    wrapDraw(hx2, S, S, () => blob(hx2, px, py, r, [250, 250, 250], 0.9));
  }
  grain(x, S, S, 0.05);
  return { map: tex(c), normal: tex(heightToNormal(h, 2.6), 1, 1, false) };
}
function dirtPath() {
  const S = TS(512), K = S / 512;
  const [c, x] = cv(S), [h, hx2] = cv(S);
  x.fillStyle = "#5c4a36";
  x.fillRect(0, 0, S, S);
  hx2.fillStyle = "#909090";
  hx2.fillRect(0, 0, S, S);
  for (let i = 0; i < 260 * K; i++) {
    const px = srnd() * S, py = srnd() * S, r = sr(10, 70) * K;
    const wet = srnd() < 0.4, v = wet ? si(52, 70) : si(96, 128);
    wrapDraw(x, S, S, () => blob(x, px, py, r, [v, v * 0.82, v * 0.62], sr(0.2, 0.45)));
    if (wet) wrapDraw(hx2, S, S, () => blob(hx2, px, py, r, [90, 90, 90], 0.35));
  }
  for (let i = 0; i < 2600 * K * K; i++) {
    const px = srnd() * S, py = srnd() * S, r = sr(0.8, 3.2) * K, v = si(110, 170);
    wrapDraw(x, S, S, () => {
      x.fillStyle = rgba(v, v - 8, v - 22, sr(0.3, 0.8));
      x.beginPath();
      x.arc(px, py, r, 0, 7);
      x.fill();
    });
    wrapDraw(hx2, S, S, () => {
      hx2.fillStyle = rgba(220, 220, 220, 0.8);
      hx2.beginPath();
      hx2.arc(px, py, r, 0, 7);
      hx2.fill();
    });
  }
  for (let i = 0; i < 9; i++) {
    let px = srnd() * S, py = srnd() * S, a = sr(0, TAU);
    const w = sr(3, 7) * K, v = si(70, 96);
    const pts = [];
    for (let k = 0; k < 10; k++) {
      pts.push([px, py]);
      a += sr(-0.4, 0.4);
      px += Math.cos(a) * 14 * K;
      py += Math.sin(a) * 14 * K;
    }
    for (const [ctx, col, lw] of [[x, rgba(v, v * 0.72, v * 0.5, 0.95), w], [hx2, "rgba(240,240,240,1)", w * 1.1]]) {
      wrapDraw(ctx, S, S, () => {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts) ctx.lineTo(p[0], p[1]);
        ctx.stroke();
      });
    }
  }
  for (let i = 0; i < 1400 * K * K; i++) {
    const px = srnd() * S, py = srnd() * S, a = sr(0, TAU), L = sr(4, 10) * K, v = si(90, 140);
    x.strokeStyle = rgba(v, v * 0.7, v * 0.4, 0.5);
    x.lineWidth = K;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L);
    x.stroke();
  }
  grain(x, S, S, 0.05);
  return { map: tex(c), normal: tex(heightToNormal(h, 2.2), 1, 1, false) };
}
function mud() {
  const S = TS(512), K = S / 512;
  const [c, x] = cv(S), [h, hx2] = cv(S);
  x.fillStyle = "#3b3326";
  x.fillRect(0, 0, S, S);
  hx2.fillStyle = "#7a7a7a";
  hx2.fillRect(0, 0, S, S);
  for (let i = 0; i < 300 * K; i++) {
    const px = srnd() * S, py = srnd() * S, r = sr(12, 80) * K;
    const sand = srnd() < 0.35;
    const col = sand ? [si(110, 140), si(98, 122), si(70, 88)] : [si(34, 52), si(30, 44), si(22, 32)];
    wrapDraw(x, S, S, () => blob(x, px, py, r, col, sr(0.2, 0.5)));
    wrapDraw(hx2, S, S, () => blob(hx2, px, py, r, sand ? [150, 150, 150] : [60, 60, 60], 0.3));
  }
  for (let i = 0; i < 40 * K; i++) {
    const px = srnd() * S, py = srnd() * S, a = sr(0, TAU);
    wrapDraw(hx2, S, S, () => {
      hx2.save();
      hx2.translate(px, py);
      hx2.rotate(a);
      hx2.fillStyle = "rgba(40,40,40,.6)";
      hx2.beginPath();
      hx2.ellipse(0, 0, 7 * K, 16 * K, 0, 0, 7);
      hx2.fill();
      hx2.restore();
    });
  }
  for (let i = 0; i < 1600 * K * K; i++) {
    const px = srnd() * S, py = srnd() * S, r = sr(0.6, 2) * K, v = si(100, 150);
    x.fillStyle = rgba(v, v - 6, v - 20, 0.6);
    x.beginPath();
    x.arc(px, py, r, 0, 7);
    x.fill();
  }
  grain(x, S, S, 0.04);
  return { map: tex(c), normal: tex(heightToNormal(h, 1.8), 1, 1, false) };
}
function dugEarth() {
  const S = TS(512), K = S / 512;
  const [c, x] = cv(S), [h, hx2] = cv(S);
  x.fillStyle = "#4e3a28";
  x.fillRect(0, 0, S, S);
  hx2.fillStyle = "#808080";
  hx2.fillRect(0, 0, S, S);
  for (let i = 0; i < 1800 * K * K; i++) {
    const px = srnd() * S, py = srnd() * S, r = sr(2, 12) * K;
    const v = si(56, 118), clay = srnd() < 0.3;
    const col = clay ? [v * 1.2, v * 0.86, v * 0.55] : [v, v * 0.78, v * 0.56];
    wrapDraw(x, S, S, () => {
      x.fillStyle = rgba(col[0], col[1], col[2], sr(0.5, 0.95));
      x.beginPath();
      x.ellipse(px, py, r, r * sr(0.6, 1), sr(0, 3), 0, 7);
      x.fill();
    });
    const hv = si(120, 250);
    wrapDraw(hx2, S, S, () => blob(hx2, px, py, r * 1.2, [hv, hv, hv], 0.8));
  }
  for (let i = 0; i < 60 * K; i++) {
    const px = srnd() * S, py = srnd() * S, a = sr(-0.4, 0.4);
    wrapDraw(hx2, S, S, () => {
      hx2.save();
      hx2.translate(px, py);
      hx2.rotate(a);
      hx2.fillStyle = "rgba(40,40,40,.5)";
      hx2.fillRect(-14 * K, -2 * K, 28 * K, 4 * K);
      hx2.restore();
    });
  }
  grain(x, S, S, 0.06);
  return { map: tex(c), normal: tex(heightToNormal(h, 2.4), 1, 1, false) };
}
function bark(kind = "spruce") {
  const W = TS(256), H2 = TS(512), K = W / 256;
  const [c, x] = cv(W, H2), [h, hx2] = cv(W, H2);
  const base2 = kind === "pine" ? [96, 70, 52] : [78, 68, 58];
  x.fillStyle = rgba(...base2);
  x.fillRect(0, 0, W, H2);
  hx2.fillStyle = "#707070";
  hx2.fillRect(0, 0, W, H2);
  const plates = kind === "pine" ? 180 : 360;
  for (let i = 0; i < plates * K; i++) {
    const px = srnd() * W, py = srnd() * H2;
    const w = (kind === "pine" ? sr(14, 34) : sr(6, 16)) * K, hh = (kind === "pine" ? sr(26, 80) : sr(8, 22)) * K;
    const v = sr(0.7, 1.25);
    wrapDraw(x, W, H2, () => {
      x.save();
      x.translate(px, py);
      x.rotate(sr(-0.1, 0.1));
      x.fillStyle = rgba(base2[0] * v, base2[1] * v, base2[2] * v, sr(0.5, 0.95));
      x.beginPath();
      x.roundRect(-w / 2, -hh / 2, w, hh, 3 * K);
      x.fill();
      x.restore();
    });
    wrapDraw(hx2, W, H2, () => {
      hx2.save();
      hx2.translate(px, py);
      hx2.rotate(sr(-0.1, 0.1));
      const hv = si(150, 230);
      hx2.fillStyle = rgba(hv, hv, hv, 0.9);
      hx2.beginPath();
      hx2.roundRect(-w / 2, -hh / 2, w, hh, 3 * K);
      hx2.fill();
      hx2.strokeStyle = "rgba(10,10,10,.9)";
      hx2.lineWidth = (kind === "pine" ? 3 : 1.6) * K;
      hx2.stroke();
      hx2.restore();
    });
  }
  for (let i = 0; i < 40 * K; i++) {
    const px = srnd() * W, py = srnd() * H2;
    wrapDraw(x, W, H2, () => blob(x, px, py, sr(6, 22) * K, [110, 122, 96], sr(0.2, 0.45)));
  }
  grain(x, W, H2, 0.06);
  return { map: tex(c), normal: tex(heightToNormal(h, 3), 1, 1, false) };
}
function birchBark() {
  const W = TS(256), H2 = TS(512), K = W / 256;
  const [c, x] = cv(W, H2), [h, hx2] = cv(W, H2);
  x.fillStyle = "#d8d4c8";
  x.fillRect(0, 0, W, H2);
  hx2.fillStyle = "#909090";
  hx2.fillRect(0, 0, W, H2);
  for (let i = 0; i < 160 * K; i++) {
    const px = srnd() * W, py = srnd() * H2, w = sr(10, 60) * K, hh = sr(1.5, 5) * K;
    wrapDraw(x, W, H2, () => {
      x.fillStyle = rgba(si(20, 50), si(20, 44), si(18, 36), sr(0.6, 0.95));
      x.beginPath();
      x.ellipse(px, py, w / 2, hh, 0, 0, 7);
      x.fill();
    });
    wrapDraw(hx2, W, H2, () => {
      hx2.fillStyle = "rgba(40,40,40,.8)";
      hx2.beginPath();
      hx2.ellipse(px, py, w / 2, hh, 0, 0, 7);
      hx2.fill();
    });
  }
  for (let i = 0; i < 90 * K; i++) {
    const px = srnd() * W, py = srnd() * H2;
    wrapDraw(x, W, H2, () => blob(x, px, py, sr(8, 30) * K, [150, 140, 120], 0.25));
  }
  grain(x, W, H2, 0.05);
  return { map: tex(c), normal: tex(heightToNormal(h, 1.6), 1, 1, false) };
}
function spruceBranch(x, W, H2, hue) {
  const cy = H2 * 0.5;
  const K = W / 256;
  const stem = (x02, y0, x12, y1, lw, depth) => {
    const col = rgba(hue[0] * 0.55, hue[1] * 0.5, hue[2] * 0.45, 1);
    x.strokeStyle = col;
    x.lineWidth = lw;
    x.beginPath();
    x.moveTo(x02, y0);
    x.lineTo(x12, y1);
    x.stroke();
    const L = Math.hypot(x12 - x02, y1 - y0), ux = (x12 - x02) / L, uy = (y1 - y0) / L;
    const n2 = Math.floor(L / ((depth ? 0.8 : 1.1) * K));
    for (let i = 0; i < n2; i++) {
      const t = i / n2, px = x02 + (x12 - x02) * t, py = y0 + (y1 - y0) * t;
      const len = (depth ? 10 : 13) * (1 - t * 0.45) * K;
      for (const s of [-1, 1]) {
        const a = Math.atan2(uy, ux) + s * sr(0.7, 1.35);
        const v = sr(0.75, 1.2);
        x.strokeStyle = rgba(hue[0] * v, hue[1] * v, hue[2] * v, 1);
        x.lineWidth = sr(1.3, 2.2) * K;
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
        x.stroke();
      }
    }
  };
  const x0 = W * 0.02, x1 = W * 0.97;
  stem(x0, cy, x1, cy + sr(-3, 3), 2.6 * K, 0);
  for (let i = 0; i < 13; i++) {
    const t = 0.06 + i * 0.07, px = x0 + (x1 - x0) * t;
    for (const s of [-1, 1]) {
      const L = Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.6 + 0.3) * (1 - t * 0.7) * H2 * 0.4 + H2 * 0.05;
      const a = s * sr(0.45, 0.8);
      stem(px, cy, px + Math.cos(a) * L, cy + Math.sin(a) * L, 1.5 * K, 1);
    }
  }
}
function spruceAtlas() {
  const S = TS(512), [c, x] = cv(S);
  const hues = [[46, 74, 40], [40, 66, 42], [54, 80, 44], [38, 60, 36]];
  for (let q = 0; q < 4; q++) {
    x.save();
    x.translate(q % 2 * S / 2, Math.floor(q / 2) * S / 2);
    x.beginPath();
    x.rect(0, 0, S / 2, S / 2);
    x.clip();
    x.lineCap = "round";
    spruceBranch(x, S / 2, S / 2, hues[q]);
    x.restore();
  }
  sharpenAlpha(c, 0.4);
  bleedColor(c, 3);
  return tex(c, 1, 1);
}
function pineAtlas() {
  const S = TS(512), [c, x] = cv(S), K = S / 512;
  const hues = [[50, 74, 44], [46, 68, 44], [58, 80, 46], [44, 64, 40]];
  x.lineCap = "round";
  for (let q = 0; q < 4; q++) {
    const ox = q % 2 * S / 2, oy = Math.floor(q / 2) * S / 2, W = S / 2;
    x.save();
    x.translate(ox, oy);
    x.beginPath();
    x.rect(0, 0, W, W);
    x.clip();
    const hue = hues[q];
    for (let t = 0; t < 15; t++) {
      const cx = sr(0.2, 0.8) * W, cy2 = sr(0.16, 0.7) * W;
      x.strokeStyle = "rgba(92,62,40,1)";
      x.lineWidth = 2.2 * K;
      x.beginPath();
      x.moveTo(W * 0.5, W * 0.95);
      x.quadraticCurveTo(W * 0.5, cy2 + 30 * K, cx, cy2);
      x.stroke();
      for (let i = 0; i < 64; i++) {
        const a = -Math.PI / 2 + sr(-1.9, 1.9) * (srnd() < 0.8 ? 1 : 1.6), L = sr(22, 46) * K, v = sr(0.7, 1.3);
        x.strokeStyle = rgba(hue[0] * v, hue[1] * v, hue[2] * v, 1);
        x.lineWidth = sr(1.1, 1.8) * K;
        x.beginPath();
        x.moveTo(cx, cy2);
        x.quadraticCurveTo(cx + Math.cos(a) * L * 0.5, cy2 + Math.sin(a) * L * 0.5 - 3 * K, cx + Math.cos(a) * L, cy2 + Math.sin(a) * L * 0.85);
        x.stroke();
      }
    }
    x.restore();
  }
  sharpenAlpha(c, 0.4);
  bleedColor(c, 3);
  return tex(c);
}
function birchAtlas() {
  const S = TS(512), [c, x] = cv(S), K = S / 512;
  const hues = [[206, 166, 52], [222, 182, 64], [178, 150, 58], [196, 128, 46]];
  for (let q = 0; q < 4; q++) {
    const ox = q % 2 * S / 2, oy = Math.floor(q / 2) * S / 2, W = S / 2;
    x.save();
    x.translate(ox, oy);
    x.beginPath();
    x.rect(0, 0, W, W);
    x.clip();
    for (let i = 0; i < 420; i++) {
      const a = sr(0, TAU), r = Math.sqrt(srnd()) * W * 0.44;
      const px = W / 2 + Math.cos(a) * r, py = W / 2 + Math.sin(a) * r * 0.9;
      const v = sr(0.7, 1.25), s = sr(5, 9) * K;
      x.save();
      x.translate(px, py);
      x.rotate(sr(0, TAU));
      x.fillStyle = rgba(hues[q][0] * v, hues[q][1] * v, hues[q][2] * v, 1);
      x.beginPath();
      x.moveTo(0, -s);
      x.quadraticCurveTo(s * 0.9, 0, 0, s);
      x.quadraticCurveTo(-s * 0.9, 0, 0, -s);
      x.fill();
      x.restore();
    }
    x.restore();
  }
  sharpenAlpha(c, 0.45);
  bleedColor(c, 3);
  return tex(c);
}
function grassTex() {
  const W = TS(128), H2 = TS(256), [c, x] = cv(W, H2);
  for (let k = 0; k < 9; k++) {
    // листья уже, цвет приглушён: без кислотного лайма
    const bx = W * sr(0.08, 0.92), bw = W * sr(0.015, 0.032), bh = H2 * sr(0.45, 0.98);
    const lean = sr(-0.25, 0.25) * W;
    const g = x.createLinearGradient(0, H2, 0, H2 - bh);
    const dry = srnd() < 0.34;
    const top = dry ? [146, 134, 92] : [si(92, 108), si(100, 116), si(62, 74)];
    g.addColorStop(0, "rgb(46,52,30)");
    g.addColorStop(0.6, rgba(top[0] * 0.8, top[1] * 0.8, top[2] * 0.8));
    g.addColorStop(1, rgba(...top));
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(bx - bw, H2);
    x.quadraticCurveTo(bx - bw * 0.3, H2 - bh * 0.6, bx + lean, H2 - bh);
    x.quadraticCurveTo(bx + bw * 0.4, H2 - bh * 0.55, bx + bw, H2);
    x.closePath();
    x.fill();
  }
  sharpenAlpha(c, 0.5);
  bleedColor(c, 2);
  return tex(c, 1, 1);
}
function fernTex() {
  const S = TS(256), [c, x] = cv(S), K = S / 256;
  x.lineCap = "round";
  const cx = S * 0.5, base2 = S * 0.98;
  x.strokeStyle = "rgb(60,78,36)";
  x.lineWidth = 2.4 * K;
  x.beginPath();
  x.moveTo(cx, base2);
  x.quadraticCurveTo(cx + 8 * K, S * 0.5, cx - 4 * K, S * 0.04);
  x.stroke();
  for (let i = 0; i < 26; i++) {
    const t = i / 26, py = base2 - (base2 - S * 0.05) * t, px = cx + Math.sin(t * 3) * 4 * K;
    const L = Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.9) * S * 0.36 + 4 * K;
    for (const s of [-1, 1]) {
      const v = sr(0.8, 1.2);
      x.fillStyle = rgba(70 * v, 104 * v, 42 * v, 1);
      x.beginPath();
      x.moveTo(px, py);
      x.quadraticCurveTo(px + s * L * 0.5, py - L * 0.28, px + s * L, py - L * 0.12);
      x.quadraticCurveTo(px + s * L * 0.5, py + 3 * K, px, py + 3 * K);
      x.fill();
    }
  }
  sharpenAlpha(c, 0.4);
  bleedColor(c, 2);
  return tex(c);
}
function shrubTex() {
  const S = TS(256), [c, x] = cv(S), K = S / 256;
  for (let i = 0; i < 360; i++) {
    const t = srnd(), px = S * 0.5 + (srnd() - 0.5) * S * 0.9 * (0.4 + t * 0.6), py = S - t * S * 0.8 - 6 * K;
    const v = sr(0.7, 1.2), s = sr(4, 8) * K;
    x.fillStyle = rgba(52 * v, 84 * v, 38 * v, 1);
    x.beginPath();
    x.ellipse(px, py, s, s * 0.62, sr(0, 3), 0, 7);
    x.fill();
    if (srnd() < 0.05) {
      x.fillStyle = srnd() < 0.5 ? "#2b2e52" : "#8a2622";
      x.beginPath();
      x.arc(px, py, 2.4 * K, 0, 7);
      x.fill();
    }
  }
  x.strokeStyle = "rgba(70,50,34,1)";
  x.lineWidth = 1.4 * K;
  for (let i = 0; i < 12; i++) {
    const px = S * sr(0.2, 0.8);
    x.beginPath();
    x.moveTo(S / 2, S);
    x.lineTo(px, S * sr(0.3, 0.6));
    x.stroke();
  }
  sharpenAlpha(c, 0.45);
  bleedColor(c, 2);
  return tex(c);
}
function reedTex() {
  const W = TS(256), H2 = TS(512), [c, x] = cv(W, H2), K = W / 256;
  x.lineCap = "round";
  for (let k = 0; k < 16; k++) {
    const bx = W * sr(0.1, 0.9), bh = H2 * sr(0.55, 0.98), lean = sr(-0.3, 0.3) * W * 0.4;
    const v = sr(0.75, 1.2), dry = srnd() < 0.35;
    const col = dry ? [140 * v, 124 * v, 76 * v] : [86 * v, 108 * v, 54 * v];
    x.strokeStyle = rgba(...col);
    x.lineWidth = sr(2.5, 5) * K;
    x.beginPath();
    x.moveTo(bx, H2);
    x.quadraticCurveTo(bx + lean * 0.2, H2 - bh * 0.6, bx + lean, H2 - bh);
    x.stroke();
  }
  for (let k = 0; k < 4; k++) {
    const bx = W * sr(0.2, 0.8), top = H2 * sr(0.04, 0.2);
    x.strokeStyle = "rgb(96,104,58)";
    x.lineWidth = 2 * K;
    x.beginPath();
    x.moveTo(bx, H2);
    x.lineTo(bx + sr(-4, 4) * K, top);
    x.stroke();
    x.fillStyle = rgba(si(74, 96), si(48, 60), si(30, 38));
    x.beginPath();
    x.roundRect(bx - 5 * K, top + 10 * K, 10 * K, 46 * K, 5 * K);
    x.fill();
  }
  sharpenAlpha(c, 0.45);
  bleedColor(c, 2);
  return tex(c);
}
function planks(tint = [118, 108, 94], boards = 6) {
  const S = TS(512), [c, x] = cv(S), [h, hx2] = cv(S), K = S / 512;
  x.fillStyle = rgba(...tint);
  x.fillRect(0, 0, S, S);
  hx2.fillStyle = "#b0b0b0";
  hx2.fillRect(0, 0, S, S);
  const bh = S / boards;
  for (let b = 0; b < boards; b++) {
    const v = sr(0.78, 1.18), y0 = b * bh;
    x.fillStyle = rgba(tint[0] * v, tint[1] * v, tint[2] * v);
    x.fillRect(0, y0, S, bh);
    for (let i = 0; i < 70; i++) {
      const yy = y0 + srnd() * bh, w = sr(0.5, 1.6) * K, d = sr(0.6, 0.9);
      x.fillStyle = rgba(tint[0] * v * d, tint[1] * v * d, tint[2] * v * d, sr(0.3, 0.7));
      x.fillRect(0, yy, S, w);
      hx2.fillStyle = `rgba(90,90,90,${sr(0.2, 0.5)})`;
      hx2.fillRect(0, yy, S, w);
    }
    for (let i = 0; i < 2; i++) {
      const px = srnd() * S, py = y0 + sr(0.3, 0.7) * bh;
      blob(x, px, py, sr(4, 9) * K, [60, 44, 32], 0.8);
      blob(hx2, px, py, 8 * K, [40, 40, 40], 0.6);
    }
    x.fillStyle = "rgba(20,16,12,.9)";
    x.fillRect(0, y0, S, 2.5 * K);
    hx2.fillStyle = "rgba(0,0,0,1)";
    hx2.fillRect(0, y0, S, 3 * K);
    for (const px of [S * 0.08, S * 0.58]) {
      x.fillStyle = "rgb(60,40,28)";
      x.beginPath();
      x.arc(px, y0 + bh * 0.5, 2.5 * K, 0, 7);
      x.fill();
      const g = x.createLinearGradient(0, y0 + bh * 0.5, 0, y0 + bh);
      g.addColorStop(0, "rgba(110,56,28,.5)");
      g.addColorStop(1, "rgba(110,56,28,0)");
      x.fillStyle = g;
      x.fillRect(px - 2 * K, y0 + bh * 0.5, 4 * K, bh * 0.5);
    }
  }
  for (let i = 0; i < 60; i++) blob(x, srnd() * S, srnd() * S, sr(10, 50) * K, [70, 80, 52], sr(0.08, 0.2));
  grain(x, S, S, 0.05);
  return { map: tex(c), normal: tex(heightToNormal(h, 2), 1, 1, false) };
}
function logWall() {
  const S = TS(512), [c, x] = cv(S), [h, hx2] = cv(S), K = S / 512;
  const logs = 4, lh = S / logs;
  for (let i = 0; i < logs; i++) {
    const y0 = i * lh, v = sr(0.8, 1.12);
    const g = x.createLinearGradient(0, y0, 0, y0 + lh);
    g.addColorStop(0, rgba(52 * v, 42 * v, 32 * v));
    g.addColorStop(0.3, rgba(108 * v, 92 * v, 72 * v));
    g.addColorStop(0.7, rgba(96 * v, 80 * v, 62 * v));
    g.addColorStop(1, rgba(40 * v, 32 * v, 24 * v));
    x.fillStyle = g;
    x.fillRect(0, y0, S, lh);
    const hg = hx2.createLinearGradient(0, y0, 0, y0 + lh);
    hg.addColorStop(0, "#202020");
    hg.addColorStop(0.5, "#e0e0e0");
    hg.addColorStop(1, "#202020");
    hx2.fillStyle = hg;
    hx2.fillRect(0, y0, S, lh);
    for (let k = 0; k < 14; k++) {
      const yy = y0 + lh * sr(0.25, 0.75), x0 = srnd() * S, L = sr(40, 200) * K;
      x.strokeStyle = "rgba(30,22,16,.7)";
      x.lineWidth = sr(0.8, 2) * K;
      x.beginPath();
      x.moveTo(x0, yy);
      x.lineTo(x0 + L, yy + sr(-3, 3));
      x.stroke();
      hx2.strokeStyle = "rgba(60,60,60,.9)";
      hx2.lineWidth = x.lineWidth;
      hx2.beginPath();
      hx2.moveTo(x0, yy);
      hx2.lineTo(x0 + L, yy);
      hx2.stroke();
    }
    for (let k = 0; k < 30; k++) blob(x, srnd() * S, y0 + sr(-3, 3) * K, sr(3, 8) * K, [88, 90, 60], 0.7);
  }
  grain(x, S, S, 0.05);
  return { map: tex(c), normal: tex(heightToNormal(h, 2.2), 1, 1, false) };
}
function rustMetal(paint = [72, 96, 110], rust = 0.6, size = 512) {
  const S = TS(size), [c, x] = cv(S), [h, hx2] = cv(S), K = S / 512;
  x.fillStyle = rgba(...paint);
  x.fillRect(0, 0, S, S);
  hx2.fillStyle = "#a0a0a0";
  hx2.fillRect(0, 0, S, S);
  for (let i = 0; i < 80; i++) blob(x, srnd() * S, srnd() * S, sr(20, 90) * K, [paint[0] * 1.25, paint[1] * 1.2, paint[2] * 1.15], 0.25);
  for (let i = 0; i < 200 * rust; i++) {
    const px = srnd() * S, py = srnd() * S, r = sr(6, 70) * K * (0.5 + rust);
    wrapDraw(x, S, S, () => {
      blob(x, px, py, r * 1.4, [128, 70, 34], 0.55);
      blob(x, px, py, r, [88, 44, 22], 0.8);
      blob(x, px, py, r * 0.5, [52, 30, 18], 0.85);
    });
    wrapDraw(hx2, S, S, () => blob(hx2, px, py, r, [60, 60, 60], 0.6));
  }
  for (let i = 0; i < 90 * rust; i++) {
    const px = srnd() * S, py = srnd() * S, L = sr(30, 160) * K, w = sr(2, 7) * K;
    const g = x.createLinearGradient(0, py, 0, py + L);
    g.addColorStop(0, "rgba(120,58,26,.65)");
    g.addColorStop(1, "rgba(120,58,26,0)");
    x.fillStyle = g;
    x.fillRect(px, py, w, L);
  }
  for (let i = 0; i < 3e3 * K * K; i++) {
    const px = srnd() * S, py = srnd() * S;
    x.fillStyle = rgba(si(60, 140), si(34, 66), si(16, 30), sr(0.2, 0.6));
    x.fillRect(px, py, K * 1.5, K * 1.5);
    hx2.fillStyle = "rgba(200,200,200,.5)";
    hx2.fillRect(px, py, K * 1.5, K * 1.5);
  }
  grain(x, S, S, 0.06);
  return { map: tex(c), normal: tex(heightToNormal(h, 1.8), 1, 1, false) };
}
function corrugated(paint = [96, 98, 92], rust = 0.8, aged = 0) {
  const r = rustMetal(paint, rust, 512);
  const S = r.map.image.width, [h, hx2] = cv(S), ribs = 10, K = S / 512;
  for (let i = 0; i < S; i++) {
    const v = 128 + Math.sin(i / S * ribs * TAU) * 110;
    hx2.fillStyle = rgba(v, v, v);
    hx2.fillRect(i, 0, 1, S);
  }
  if (aged > 0) {
    const c = r.map.image, x = c.getContext("2d");
    const id = x.getImageData(0, 0, S, S), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15, k = 0.5 * aged;
      d[i] = (d[i] + (l - d[i]) * k) * (1 - 0.14 * aged);
      d[i + 1] = (d[i + 1] + (l - d[i + 1]) * k) * (1 - 0.1 * aged);
      d[i + 2] = (d[i + 2] + (l - d[i + 2]) * k) * (1 - 0.08 * aged);
    }
    x.putImageData(id, 0, 0);
    for (let i = 0; i < 70 * aged; i++) {
      const rib = Math.floor(srnd() * ribs), px = (rib + 0.5) / ribs * S + sr(-4, 4) * K, py = srnd() * S, L = sr(60, 260) * K;
      const g = x.createLinearGradient(0, py, 0, py + L);
      g.addColorStop(0, "rgba(30,26,20,0)");
      g.addColorStop(0.3, "rgba(30,26,20,.35)");
      g.addColorStop(1, "rgba(30,26,20,0)");
      x.fillStyle = g;
      x.fillRect(px - 3 * K, py, sr(3, 8) * K, L);
    }
    for (let i = 0; i < 160 * aged; i++) {
      const low = srnd() < 0.6, px = srnd() * S, py = low ? S - Math.pow(srnd(), 2) * S * 0.35 : srnd() * S;
      const rr = sr(4, 20) * K, lich = srnd() < 0.35;
      wrapDraw(x, S, S, () => blob(x, px, py, rr, lich ? [150, 156, 128] : [62, 76, 38], lich ? 0.35 : 0.55));
    }
    for (let i = 0; i < 1400 * aged * K * K; i++) {
      const rib = Math.floor(srnd() * ribs), px = (rib + 0.5) / ribs * S + sr(-6, 6) * K, py = srnd() * S;
      x.fillStyle = rgba(si(70, 110), si(58, 80), si(36, 50), sr(0.3, 0.7));
      x.fillRect(px, py, sr(1, 2) * K, sr(3, 9) * K);
    }
    r.map.needsUpdate = true;
  }
  const nrm = tex(heightToNormal(h, 4), 1, 1, false);
  return { map: r.map, normal: nrm };
}
function stumpTop() {
  const S = TS(256), [c, x] = cv(S), K = S / 256, C2 = S / 2;
  x.fillStyle = "#4a3a2a";
  x.fillRect(0, 0, S, S);
  const R0 = S * 0.47;
  for (let r = R0; r > 2; r -= sr(2.2, 4.5) * K) {
    const v = sr(0.85, 1.12), k = r / R0;
    x.strokeStyle = rgba(170 * v - 40 * k, 136 * v - 36 * k, 96 * v - 30 * k, 0.9);
    x.lineWidth = sr(1.2, 2.6) * K;
    x.beginPath();
    for (let a = 0; a <= TAU + 0.01; a += 0.12) {
      const w = r * (1 + 0.035 * Math.sin(a * 3 + r * 0.1) + 0.02 * Math.sin(a * 7));
      a === 0 ? x.moveTo(C2 + Math.cos(a) * w, C2 + Math.sin(a) * w) : x.lineTo(C2 + Math.cos(a) * w, C2 + Math.sin(a) * w);
    }
    x.stroke();
  }
  x.strokeStyle = "#2a2016";
  x.lineWidth = 9 * K;
  x.beginPath();
  x.arc(C2, C2, R0 + 3 * K, 0, TAU);
  x.stroke();
  for (let i = 0; i < 7; i++) {
    const a = sr(0, TAU), L = sr(0.3, 0.9) * R0;
    x.strokeStyle = "rgba(28,20,12,.85)";
    x.lineWidth = sr(1, 3) * K;
    x.beginPath();
    x.moveTo(C2 + Math.cos(a) * 4, C2 + Math.sin(a) * 4);
    x.lineTo(C2 + Math.cos(a + sr(-0.05, 0.05)) * L, C2 + Math.sin(a) * L);
    x.stroke();
  }
  for (let i = 0; i < 30; i++) {
    const a = sr(0, TAU), rr = sr(0.5, 1) * R0;
    blob(x, C2 + Math.cos(a) * rr, C2 + Math.sin(a) * rr, sr(8, 26) * K, srnd() < 0.5 ? [120, 116, 104] : [70, 86, 44], 0.35);
  }
  grain(x, S, S, 0.06);
  const t = tex(c);
  t.wrapS = t.wrapT = 1001;
  return t;
}
function bulletHoles() {
  const S = 256, H2 = S / 2, [c, x] = cv(S);
  const cell = (i, fn) => {
    x.save();
    x.translate(i % 2 * H2 + H2 / 2, (i >> 1) * H2 + H2 / 2);
    fn();
    x.restore();
  };
  cell(0, () => {
    for (let k = 0; k < 9; k++) {
      const a = sr(0, TAU), L = sr(14, 34);
      x.strokeStyle = rgba(196, 170, 128, sr(0.6, 0.95));
      x.lineWidth = sr(2, 5);
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(Math.cos(a) * L, Math.sin(a) * L);
      x.stroke();
    }
    blob(x, 0, 0, 22, [30, 22, 14], 0.9);
    blob(x, 0, 0, 9, [6, 4, 2], 1);
  });
  cell(1, () => {
    blob(x, 0, 0, 26, [150, 150, 146], 0.8);
    x.strokeStyle = "rgba(210,210,200,.9)";
    x.lineWidth = 3;
    x.beginPath();
    x.arc(0, 0, 11, 0, TAU);
    x.stroke();
    blob(x, 0, 0, 10, [4, 4, 4], 1);
    blob(x, 0, 0, 36, [60, 40, 26], 0.25);
  });
  cell(2, () => {
    for (let k = 0; k < 14; k++) {
      const a = sr(0, TAU), r = sr(10, 30);
      blob(x, Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, sr(6, 14), [120, 116, 104], 0.6);
    }
    blob(x, 0, 0, 14, [40, 36, 32], 0.95);
    blob(x, 0, 0, 6, [8, 8, 8], 1);
  });
  cell(3, () => {
    const g = x.createLinearGradient(-40, 0, 40, 0);
    g.addColorStop(0, "rgba(20,16,10,0)");
    g.addColorStop(0.7, "rgba(20,16,10,.85)");
    g.addColorStop(1, "rgba(20,16,10,0)");
    x.fillStyle = g;
    x.beginPath();
    x.ellipse(0, 0, 40, 7, 0, 0, TAU);
    x.fill();
  });
  const t = tex(c);
  t.wrapS = t.wrapT = 1001;
  return t;
}
function paperSheet(lines, o = {}) {
  const W = o.w || 256, Hh = o.h || 340, [c, x] = cv(W, Hh);
  x.fillStyle = o.bg || "#d9d2bd";
  x.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 18; i++) blob(x, srnd() * W, srnd() * Hh, sr(10, 60), [150, 132, 96], sr(0.05, 0.16));
  if (o.grid) {
    x.strokeStyle = "rgba(80,110,150,.35)";
    x.lineWidth = 1;
    for (let i = 8; i < W; i += 12) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i, Hh);
      x.stroke();
    }
    for (let i = 8; i < Hh; i += 12) {
      x.beginPath();
      x.moveTo(0, i);
      x.lineTo(W, i);
      x.stroke();
    }
  }
  x.fillStyle = o.ink || "#1f2a4a";
  x.textBaseline = "top";
  let y = 16;
  for (const ln of lines) {
    const big = ln.startsWith("#"), t = big ? ln.slice(1) : ln;
    x.font = `${big ? "bold " : "italic "}${big ? 22 : 17}px "Segoe Print","Comic Sans MS","Bradley Hand",cursive`;
    x.save();
    x.translate(14 + sr(-2, 2), y);
    x.rotate(sr(-0.02, 0.02));
    x.fillText(t, 0, 0);
    x.restore();
    y += big ? 30 : 24;
  }
  if (o.sketch) {
    x.strokeStyle = o.ink || "#1f2a4a";
    x.lineWidth = 2.5;
    x.beginPath();
    for (let i = 0; i <= 8; i++) {
      const px = 20 + i * (W - 40) / 8, py = Hh - 110 + (i % 2 ? -10 : 10);
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.stroke();
    x.strokeStyle = "#8a1e18";
    x.lineWidth = 3;
    for (const [ax, ay, bx, by] of [[50, Hh - 40, 80, Hh - 95], [W - 60, Hh - 40, W - 90, Hh - 98]]) {
      x.beginPath();
      x.moveTo(ax, ay);
      x.lineTo(bx, by);
      x.lineTo(bx - 10, by + 6);
      x.moveTo(bx, by);
      x.lineTo(bx + 4, by + 12);
      x.stroke();
    }
    x.beginPath();
    x.moveTo(W / 2 - 8, Hh - 150);
    x.lineTo(W / 2 + 8, Hh - 134);
    x.moveTo(W / 2 + 8, Hh - 150);
    x.lineTo(W / 2 - 8, Hh - 134);
    x.stroke();
  }
  x.strokeStyle = "rgba(90,80,60,.35)";
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(W / 2, 0);
  x.lineTo(W / 2, Hh);
  x.moveTo(0, Hh / 2);
  x.lineTo(W, Hh / 2);
  x.stroke();
  x.strokeStyle = "rgba(255,255,245,.25)";
  x.beginPath();
  x.moveTo(W / 2 + 2, 0);
  x.lineTo(W / 2 + 2, Hh);
  x.stroke();
  blob(x, W / 2, 10, 7, [150, 30, 24], 1);
  blob(x, W / 2 - 2, 8, 2, [255, 200, 190], 0.8);
  grain(x, W, Hh, 0.05);
  return tex(c);
}
function sackcloth() {
  const S = TS(256), [c, x] = cv(S), [h, hx2] = cv(S), K = S / 256;
  x.fillStyle = "#77694c";
  x.fillRect(0, 0, S, S);
  hx2.fillStyle = "#808080";
  hx2.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 3 * K) {
    x.fillStyle = "rgba(40,32,20,.18)";
    x.fillRect(i, 0, K, S);
    x.fillRect(0, i, S, K);
    hx2.fillStyle = "rgba(40,40,40,.4)";
    hx2.fillRect(i, 0, K, S);
    hx2.fillRect(0, i, S, K);
  }
  for (let i = 0; i < 40; i++) blob(x, srnd() * S, srnd() * S, sr(10, 50) * K, [60, 48, 32], 0.3);
  grain(x, S, S, 0.07);
  return { map: tex(c), normal: tex(heightToNormal(h, 1.5), 1, 1, false) };
}
function camoNet() {
  const S = TS(512), [c, x] = cv(S), K = S / 512;
  const cols = [[62, 72, 46], [84, 86, 58], [48, 54, 38], [98, 88, 62]];
  x.strokeStyle = "rgba(40,42,30,1)";
  x.lineWidth = 1.5 * K;
  for (let i = 0; i < S; i += 16 * K) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + S * 0.1, S);
    x.stroke();
    x.beginPath();
    x.moveTo(0, i);
    x.lineTo(S, i + S * 0.1);
    x.stroke();
  }
  for (let i = 0; i < 900 * K * K; i++) {
    const px = srnd() * S, py = srnd() * S, s = sr(5, 14) * K, col = cols[si(0, 3)];
    wrapDraw(x, S, S, () => {
      x.save();
      x.translate(px, py);
      x.rotate(sr(0, TAU));
      x.fillStyle = rgba(...col);
      x.beginPath();
      x.moveTo(-s, 0);
      x.lineTo(0, -s * 0.6);
      x.lineTo(s, 0);
      x.lineTo(s * 0.2, s * 0.7);
      x.closePath();
      x.fill();
      x.restore();
    });
  }
  sharpenAlpha(c, 0.5);
  bleedColor(c, 2);
  return tex(c, 3, 3);
}
function mineSign(variant = 0) {
  const W = 256, H2 = 256, [c, x] = cv(W, H2);
  x.fillStyle = "#b8b0a0";
  x.fillRect(0, 0, W, H2);
  if (variant === 0) {
    x.fillStyle = "#9c1b14";
    x.beginPath();
    x.moveTo(W / 2, 16);
    x.lineTo(W - 12, H2 - 30);
    x.lineTo(12, H2 - 30);
    x.closePath();
    x.fill();
    x.fillStyle = "#ece6d6";
    x.beginPath();
    x.moveTo(W / 2, 46);
    x.lineTo(W - 40, H2 - 46);
    x.lineTo(40, H2 - 46);
    x.closePath();
    x.fill();
    x.fillStyle = "#141414";
    x.beginPath();
    x.arc(W / 2, 120, 30, 0, 7);
    x.fill();
    x.fillRect(W / 2 - 18, 138, 36, 26);
    x.fillStyle = "#ece6d6";
    x.beginPath();
    x.arc(W / 2 - 12, 118, 8, 0, 7);
    x.arc(W / 2 + 12, 118, 8, 0, 7);
    x.fill();
    for (let i = -1; i <= 1; i++) x.fillRect(W / 2 + i * 10 - 2, 152, 4, 12);
    x.font = "bold 34px Arial, sans-serif";
    x.textAlign = "center";
    x.fillStyle = "#141414";
    x.fillText("МИНЫ", W / 2, H2 - 50);
    x.fillStyle = "#9c1b14";
    x.font = "bold 22px Arial, sans-serif";
    x.fillText("MINES", W / 2, H2 - 8);
  } else {
    x.fillStyle = "#9c1b14";
    x.fillRect(8, 8, W - 16, H2 - 16);
    x.fillStyle = "#ece6d6";
    x.textAlign = "center";
    x.font = "bold 40px Arial, sans-serif";
    x.fillText("СТОЙ!", W / 2, 70);
    x.font = "bold 44px Arial, sans-serif";
    x.fillText("МИНЫ", W / 2, 136);
    x.font = "bold 24px Arial, sans-serif";
    x.fillText("ПРОХОД", W / 2, 186);
    x.fillText("ЗАПРЕЩЁН", W / 2, 216);
  }
  for (let i = 0; i < 70; i++) blob(x, srnd() * W, srnd() * H2, sr(3, 16), [120, 70, 40], sr(0.2, 0.6));
  for (let i = 0; i < si(2, 6); i++) {
    const px = sr(20, W - 20), py = sr(20, H2 - 20);
    blob(x, px, py, 9, [60, 40, 26], 0.9);
    x.fillStyle = "#050505";
    x.beginPath();
    x.arc(px, py, 3.2, 0, 7);
    x.fill();
  }
  grain(x, W, H2, 0.08);
  const t = tex(c);
  t.wrapS = t.wrapT = 1001;
  return t;
}
function boardSign(lines, bg = "#2f4a3a", fg = "#e2dcc6", w = 512, h = 256) {
  const [c, x] = cv(w, h);
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  x.strokeStyle = fg;
  x.lineWidth = 6;
  x.strokeRect(14, 14, w - 28, h - 28);
  x.fillStyle = fg;
  x.textAlign = "center";
  const n2 = lines.length;
  lines.forEach((ln, i) => {
    x.font = `bold ${i === 0 ? 54 : 34}px Arial, sans-serif`;
    x.fillText(ln, w / 2, h / 2 + (i - (n2 - 1) / 2) * 62 + 16);
  });
  for (let i = 0; i < 120; i++) blob(x, srnd() * w, srnd() * h, sr(4, 26), [90, 80, 64], sr(0.15, 0.5));
  grain(x, w, h, 0.08);
  const t = tex(c);
  t.wrapS = t.wrapT = 1001;
  return t;
}
function teamFlag(team) {
  /* v25: флаг базы — общий «настоящий» флаг из GFlags (27_game_flags.js):
     шляпка с люверсами, подгибы, вышитая эмблема команды, выгорание,
     бахрома; атлас лицо/изнанка — надпись читается с обеих сторон */
  if (globalThis.GFlags && globalThis.GFlags.texture && globalThis.THREE) {
    const W0 = TS(1024);
    return globalThis.GFlags.texture(globalThis.THREE, team === "A" ? "alpha" : "delta", { w: W0, h: Math.round(W0 / 1.6), wear: 0.8, fray: true });
  }
  const W = TS(1024), H2 = W * 0.64, [c, x] = cv(W, H2), K = W / 1024;
  const A2 = team === "A";
  const field = A2 ? ["#1f3f63", "#2c5680"] : ["#6e2419", "#94361f"];
  const g = x.createLinearGradient(0, 0, W, H2);
  g.addColorStop(0, field[0]);
  g.addColorStop(1, field[1]);
  x.fillStyle = g;
  x.fillRect(0, 0, W, H2);
  x.fillStyle = "rgba(230,226,210,.9)";
  x.fillRect(0, 0, 38 * K, H2);
  x.fillStyle = field[0];
  x.fillRect(46 * K, 0, 14 * K, H2);
  const cx = W * 0.54, cy = H2 * 0.44;
  x.save();
  x.translate(cx, cy);
  x.fillStyle = "#e8e2cc";
  x.strokeStyle = "#e8e2cc";
  x.lineWidth = 16 * K;
  x.lineJoin = "round";
  if (A2) {
    x.beginPath();
    x.moveTo(-150 * K, -170 * K);
    x.lineTo(150 * K, -170 * K);
    x.lineTo(150 * K, 20 * K);
    x.quadraticCurveTo(150 * K, 140 * K, 0, 200 * K);
    x.quadraticCurveTo(-150 * K, 140 * K, -150 * K, 20 * K);
    x.closePath();
    x.stroke();
    x.font = `900 ${250 * K}px "Arial Black", Arial, sans-serif`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText("A", 0, -10 * K);
    x.beginPath();
    x.moveTo(-110 * K, 110 * K);
    x.lineTo(0, 60 * K);
    x.lineTo(110 * K, 110 * K);
    x.stroke();
  } else {
    x.beginPath();
    x.arc(0, 10 * K, 190 * K, 0, 7);
    x.stroke();
    x.beginPath();
    x.moveTo(0, -150 * K);
    x.lineTo(145 * K, 115 * K);
    x.lineTo(-145 * K, 115 * K);
    x.closePath();
    x.lineWidth = 26 * K;
    x.stroke();
    x.beginPath();
    x.moveTo(0, -60 * K);
    x.lineTo(70 * K, 70 * K);
    x.lineTo(-70 * K, 70 * K);
    x.closePath();
    x.fill();
  }
  x.restore();
  x.font = `900 ${96 * K}px "Arial Black", Arial, sans-serif`;
  x.textAlign = "center";
  x.textBaseline = "alphabetic";
  x.fillStyle = "#e8e2cc";
  x.fillText(A2 ? "ALPHA" : "DELTA", cx, H2 - 44 * K);
  for (let i = 0; i < 90; i++) blob(x, srnd() * W, srnd() * H2, sr(20, 110) * K, [40, 36, 30], sr(0.05, 0.16));
  x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 26; i++) {
    const px = W - sr(0, 60) * K, py = srnd() * H2;
    x.beginPath();
    x.ellipse(px, py, sr(8, 40) * K, sr(4, 14) * K, sr(0, 3), 0, 7);
    x.fill();
  }
  for (let i = 0; i < 6; i++) {
    x.beginPath();
    x.arc(sr(0.2, 0.9) * W, sr(0.1, 0.9) * H2, sr(3, 7) * K, 0, 7);
    x.fill();
  }
  x.globalCompositeOperation = "source-over";
  grain(x, W, H2, 0.06);
  const t = tex(c);
  t.wrapS = t.wrapT = 1001;
  return t;
}
function pennant(team) {
  const [c, x] = cv(64, 64);
  x.fillStyle = team === "A" ? "#2c5680" : "#94361f";
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = "#e8e2cc";
  x.font = "bold 34px Arial";
  x.textAlign = "center";
  x.fillText(team, 32, 45);
  const t = tex(c);
  t.wrapS = t.wrapT = 1001;
  return t;
}
function radial(stops, size = 128) {
  const [c, x] = cv(size);
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [p, col] of stops) g.addColorStop(p, col);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const t = tex(c);
  t.wrapS = t.wrapT = 1001;
  return t;
}
function smokeTex() {
  const S = 128, [c, x] = cv(S);
  for (let i = 0; i < 26; i++) {
    const a = sr(0, TAU), r = sr(0, 26);
    blob(x, 64 + Math.cos(a) * r, 64 + Math.sin(a) * r, sr(18, 40), [255, 255, 255], sr(0.12, 0.3));
  }
  const t = tex(c);
  t.wrapS = t.wrapT = 1001;
  return t;
}
function fireAtlas() {
  const S = 256, H2 = S / 2, [c, x] = cv(S);
  const cell = (i, fn) => {
    x.save();
    x.translate(i % 2 * H2, (i >> 1) * H2);
    x.beginPath();
    x.rect(0, 0, H2, H2);
    x.clip();
    fn();
    x.restore();
  };
  const grad = (cx, cy, r) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, "rgba(255,250,228,1)");
    g.addColorStop(0.3, "rgba(255,200,100,.92)");
    g.addColorStop(0.65, "rgba(230,92,24,.45)");
    g.addColorStop(1, "rgba(130,24,0,0)");
    return g;
  };
  cell(0, () => {
    x.fillStyle = grad(64, 64, 60);
    x.fillRect(0, 0, H2, H2);
  });
  const tongue = (cx, base2, w, h, lean) => {
    x.beginPath();
    x.moveTo(cx - w, base2);
    x.bezierCurveTo(cx - w * 1.1, base2 - h * 0.45, cx + lean * 0.5 - w * 0.3, base2 - h * 0.75, cx + lean, base2 - h);
    x.bezierCurveTo(cx + lean * 0.5 + w * 0.4, base2 - h * 0.7, cx + w * 1.1, base2 - h * 0.4, cx + w, base2);
    x.closePath();
    x.fill();
  };
  for (const i of [1, 2]) cell(i, () => {
    x.filter = "blur(5px)";
    const R2 = i === 1 ? [0.2, -0.3, 0.5] : [-0.4, 0.35, -0.1];
    x.fillStyle = grad(64, 100, 70);
    tongue(64, 118, 30, 96, R2[0] * 20);
    x.fillStyle = grad(64, 104, 52);
    tongue(44, 116, 14, 66 + R2[1] * 20, R2[1] * 22);
    tongue(84, 116, 14, 62 - R2[2] * 18, R2[2] * 26);
    x.globalCompositeOperation = "lighter";
    x.fillStyle = "rgba(255,245,210,.55)";
    tongue(64, 116, 14, 46, R2[0] * 8);
    x.globalCompositeOperation = "source-over";
    x.filter = "none";
  });
  cell(3, () => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 24);
    g.addColorStop(0, "rgba(255,255,240,1)");
    g.addColorStop(0.4, "rgba(255,210,140,.8)");
    g.addColorStop(1, "rgba(255,140,40,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, H2, H2);
  });
  const t = tex(c);
  t.wrapS = t.wrapT = 1001;
  return t;
}
function smokeAtlas() {
  const S = 256, H2 = S / 2, [c, x] = cv(S);
  for (let i = 0; i < 4; i++) {
    const ox = i % 2 * H2, oy = (i >> 1) * H2;
    x.save();
    x.beginPath();
    x.rect(ox, oy, H2, H2);
    x.clip();
    for (let k = 0; k < 34; k++) {
      const a = sr(0, TAU), r = Math.sqrt(srnd()) * 30, px = 64 + Math.cos(a) * r, py = 64 + Math.sin(a) * r * 0.85;
      const light = clamp(0.62 + (64 - py) / 90 + (64 - px) / 260, 0.35, 1);
      const v = 150 + 105 * light;
      blob(x, ox + px, oy + py, sr(12, 30), [v, v, v * 0.98], sr(0.1, 0.24));
    }
    x.restore();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = 1001;
  return t;
}
function craterTex() {
  const S = 256, [c, x] = cv(S);
  blob(x, 128, 128, 120, [36, 28, 20], 0.85);
  blob(x, 128, 128, 60, [14, 12, 10], 0.95);
  for (let i = 0; i < 40; i++) {
    const a = sr(0, TAU), L = sr(50, 120);
    x.strokeStyle = rgba(70, 52, 36, sr(0.3, 0.7));
    x.lineWidth = sr(3, 10);
    x.beginPath();
    x.moveTo(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30);
    x.lineTo(128 + Math.cos(a) * L, 128 + Math.sin(a) * L);
    x.stroke();
  }
  x.globalCompositeOperation = "destination-in";
  const g = x.createRadialGradient(128, 128, 40, 128, 128, 128);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  const t = tex(c);
  t.wrapS = t.wrapT = 1001;
  return t;
}
function waterNormals() {
  const S = TS(512), [h, hx2] = cv(S);
  const img = hx2.createImageData(S, S), d = img.data;
  const waves = [];
  for (let i = 0; i < 18; i++) waves.push({ kx: si(-7, 7), ky: si(-7, 7), a: sr(0.3, 1), p: sr(0, TAU) });
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (const w of waves) v += Math.sin((w.kx * x + w.ky * y) / S * TAU + w.p) * w.a;
    const i = (y * S + x) * 4, g = clamp(128 + v * 12, 0, 255);
    d[i] = d[i + 1] = d[i + 2] = g;
    d[i + 3] = 255;
  }
  hx2.putImageData(img, 0, 0);
  return tex(heightToNormal(h, 3.5), 1, 1, false);
}
function wattle() {
  const S = TS(256), [c, x] = cv(S), [h, hx2] = cv(S), K = S / 256;
  x.fillStyle = "#2a2118";
  x.fillRect(0, 0, S, S);
  hx2.fillStyle = "#202020";
  hx2.fillRect(0, 0, S, S);
  const rod = 9 * K, stake = S / 4;
  for (let y = 0, r = 0; y < S; y += rod, r++) {
    for (let k = 0; k < 4; k++) {
      const front = (r + k) % 2 === 0, x0 = k * stake, v = sr(0.8, 1.15);
      const g = x.createLinearGradient(0, y, 0, y + rod);
      g.addColorStop(0, rgba(70 * v, 56 * v, 40 * v));
      g.addColorStop(0.45, rgba(118 * v, 96 * v, 70 * v));
      g.addColorStop(1, rgba(44 * v, 34 * v, 24 * v));
      x.fillStyle = g;
      x.fillRect(x0, y + 0.5 * K, stake, rod - 1 * K);
      const hg = hx2.createLinearGradient(0, y, 0, y + rod);
      hg.addColorStop(0, "#404040");
      hg.addColorStop(0.5, front ? "#f0f0f0" : "#b0b0b0");
      hg.addColorStop(1, "#404040");
      hx2.fillStyle = hg;
      hx2.fillRect(x0, y + 0.5 * K, stake, rod - 1 * K);
    }
  }
  for (let k = 0; k < 4; k++) {
    x.fillStyle = "rgba(30,22,16,.85)";
    x.fillRect(k * stake - 3 * K, 0, 6 * K, S);
    hx2.fillStyle = "#909090";
    hx2.fillRect(k * stake - 3 * K, 0, 6 * K, S);
  }
  grain(x, S, S, 0.08);
  return { map: tex(c), normal: tex(heightToNormal(h, 2.2), 1, 1, false) };
}
function campSign(lines, o = {}) {
  const w = o.w ?? 1024, h = o.h ?? 256, [c, x] = cv(w, h);
  const bg = o.bg ?? "#b9302a", fg = o.fg ?? "#ece3c8";
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(${o.dark ? "20,20,18" : "255,240,210"},${sr(0.02, 0.07)})`;
    x.fillRect(0, srnd() * h, w, sr(2, 12));
  }
  x.strokeStyle = fg;
  x.lineWidth = 8;
  x.strokeRect(18, 18, w - 36, h - 36);
  x.fillStyle = fg;
  x.textAlign = "center";
  x.textBaseline = "middle";
  const n2 = lines.length;
  lines.forEach((ln, i) => {
    const sz = o.sizes?.[i] ?? (i === 0 ? h * 0.36 / Math.max(1, n2 * 0.7) : h * 0.2);
    x.font = `bold ${sz}px "Arial Narrow", Arial, sans-serif`;
    x.fillText(ln, w / 2, h / 2 + (i - (n2 - 1) / 2) * (h * 0.78 / n2));
  });
  for (let i = 0; i < 90; i++) blob(x, srnd() * w, srnd() * h, sr(4, 30), [110, 70, 40], sr(0.25, 0.8));
  for (let i = 0; i < 26; i++) {
    const px = srnd() * w, py = srnd() * h * 0.6, g = x.createLinearGradient(0, py, 0, py + sr(40, 160));
    g.addColorStop(0, "rgba(90,50,24,.6)");
    g.addColorStop(1, "rgba(90,50,24,0)");
    x.fillStyle = g;
    x.fillRect(px, py, sr(3, 9), 160);
  }
  for (let i = 0; i < 40; i++) blob(x, srnd() * w, srnd() * h, sr(3, 14), [40, 36, 30], sr(0.3, 0.9));
  grain(x, w, h, 0.1);
  const t = tex(c);
  t.wrapS = t.wrapT = 1001;
  return t;
}
function wolfBadge() {
  const [c, x] = cv(256);
  x.fillStyle = "#d8cfb2";
  x.beginPath();
  x.arc(128, 128, 120, 0, 7);
  x.fill();
  x.fillStyle = "#9b2a22";
  x.beginPath();
  x.arc(128, 128, 104, 0, 7);
  x.fill();
  x.fillStyle = "#3a3530";
  x.beginPath();
  x.moveTo(70, 70);
  x.lineTo(96, 118);
  x.lineTo(60, 128);
  x.closePath();
  x.fill();
  x.beginPath();
  x.moveTo(186, 70);
  x.lineTo(160, 118);
  x.lineTo(196, 128);
  x.closePath();
  x.fill();
  x.beginPath();
  x.moveTo(64, 120);
  x.quadraticCurveTo(128, 90, 192, 120);
  x.lineTo(150, 196);
  x.lineTo(128, 214);
  x.lineTo(106, 196);
  x.closePath();
  x.fill();
  x.fillStyle = "#d8cfb2";
  x.beginPath();
  x.arc(106, 140, 7, 0, 7);
  x.arc(150, 140, 7, 0, 7);
  x.fill();
  for (let i = 0; i < 50; i++) blob(x, srnd() * 256, srnd() * 256, sr(3, 16), [100, 70, 44], sr(0.2, 0.7));
  grain(x, 256, 256, 0.1);
  return tex(c);
}
var THREE4 = ctx.THREE;
var THREE3 = ctx.THREE;
var BURN = { N: 320, X0: -160, SIZE: 320 };
var burnData = new Uint8Array(BURN.N * BURN.N * 4);
var burnTex = new THREE3.DataTexture(burnData, BURN.N, BURN.N, THREE3.RGBAFormat);
burnTex.magFilter = THREE3.LinearFilter;
burnTex.minFilter = THREE3.LinearFilter;
burnTex.wrapS = burnTex.wrapT = THREE3.ClampToEdgeWrapping;
burnTex.needsUpdate = true;
var charData = new Uint8Array(BURN.N * BURN.N * 4);
var charTex = new THREE3.DataTexture(charData, BURN.N, BURN.N, THREE3.RGBAFormat);
charTex.magFilter = THREE3.LinearFilter;
charTex.minFilter = THREE3.LinearFilter;
charTex.needsUpdate = true;
var FXU = {
  uBurn: { value: burnTex },
  uChar: { value: charTex },
  uBurnBox: { value: new THREE3.Vector3(BURN.X0, BURN.X0, 1 / BURN.SIZE) },
  uWetG: { value: 0 },
  // намокание поверхностей 0..1
  uRain: { value: 0 },
  // сила дождя сейчас 0..1
  uFxT: { value: 0 },
  uFlash: { value: 0 },
  // вспышка молнии 0..1
  uCaus: { value: 0 }
  // сила бликов-каустик на дне (от солнца)
};
var FXU_GLSL = (
  /* glsl */
  `
uniform sampler2D uBurn, uChar; uniform vec3 uBurnBox; uniform float uWetG, uRain, uFxT, uFlash, uCaus;
vec4 burnAt(vec2 xz) { return texture2D(uBurn, (xz - uBurnBox.xy) * uBurnBox.z); }
vec4 charAt(vec2 xz) { return texture2D(uChar, (xz - uBurnBox.xy) * uBurnBox.z); }
float sfxHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sfxNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sfxHash(i), sfxHash(i + vec3(1, 0, 0)), f.x), mix(sfxHash(i + vec3(0, 1, 0)), sfxHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(sfxHash(i + vec3(0, 0, 1)), sfxHash(i + vec3(1, 0, 1)), f.x), mix(sfxHash(i + vec3(0, 1, 1)), sfxHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`
);
var cdirty = false;
var markCharDirty = () => {
  cdirty = true;
};
var WIND = { dir: new THREE4.Vector2(0.8, 0.6).normalize(), strength: 0.6, gust: 0.5, angle: 0.64, base: 0.6 };
var windUniforms = {
  uTime: { value: 0 },
  uWind: { value: new THREE4.Vector2(0.8, 0.6) },
  uWindAmp: { value: 0.6 },
  uPlayer: { value: new THREE4.Vector3(0, -999, 0) },
  uBlast: { value: new THREE4.Vector4(0, -999, 0, 99) },
  uBlastStr: { value: 0 }
};
function updateWind(t) {
  const g = 0.5 + 0.34 * Math.sin(t * 0.19) + 0.22 * Math.sin(t * 0.51 + 1.7) + 0.14 * Math.sin(t * 1.23 + 0.4);
  WIND.gust = clamp(g, 0, 1.4);
  WIND.strength = WIND.base * (0.45 + WIND.gust);
  WIND.angle = 0.64 + Math.sin(t * 0.06) * 0.28;
  WIND.dir.set(Math.cos(WIND.angle), Math.sin(WIND.angle));
  windUniforms.uTime.value = t;
  windUniforms.uWind.value.copy(WIND.dir);
  windUniforms.uWindAmp.value = WIND.strength;
}
var WIND_GLSL = (
  /* glsl */
  `
uniform float uTime;
uniform vec2 uWind;
uniform float uWindAmp;
uniform vec3 uPlayer;
uniform vec4 uBlast;
uniform float uBlastStr;
`
);
function injectWind(mat, o = {}) {
  const amp = (o.amp ?? 0.3).toFixed(4), stiff = (o.stiff ?? 2).toFixed(3);
  const refH = (o.refH ?? 10).toFixed(3), flutter = (o.flutter ?? 0.02).toFixed(4);
  const blast = (o.blast ?? 1).toFixed(3);
  const trample = !!o.trample;
  const burn = !!o.burn;
  const dither = !!o.dither;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, windUniforms);
    if (dither) {
      // плавная смена LOD: экземпляр растворяется «шумом» по aHide (0 — виден, 1 — скрыт); без атрибута aHide = 0
      sh.vertexShader = "attribute float aHide;\nvarying float vHide;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n#ifdef USE_INSTANCING\nvHide = aHide;\n#else\nvHide = 0.0;\n#endif");
      sh.fragmentShader = "varying float vHide;\n" + sh.fragmentShader.replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (vHide > 0.001 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) < vHide) discard;");
    }
    if (burn) {
      Object.assign(sh.uniforms, FXU);
      sh.fragmentShader = FXU_GLSL + "varying vec2 vBurn;\n" + sh.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.03, 0.025), clamp(vBurn.x * 1.2, 0.0, 1.0));").replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance = totalEmissiveRadiance * (1.0 - vBurn.x) + vec3(1.0, 0.36, 0.06) * vBurn.y * (0.7 + 0.3 * sin(uFxT * 11.0 + vBurn.y * 20.0)) * 1.6;");
    }
    sh.vertexShader = WIND_GLSL + (burn ? FXU_GLSL + "varying vec2 vBurn;\n" : "") + sh.vertexShader.replace(
      "#include <begin_vertex>",
      /* glsl */
      `
      #include <begin_vertex>
      {
        #ifdef USE_INSTANCING
          mat4 mw = modelMatrix * instanceMatrix;
        #else
          mat4 mw = modelMatrix;
        #endif
        vec3 root = (mw * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        ${burn ? `vec4 bm = burnAt(root.xz); vBurn = vec2(bm.a, bm.g); transformed.y *= 1.0 - bm.a * 0.88;` : ""}
        vec3 wp = (mw * vec4(transformed, 1.0)).xyz;
        float hh = max(wp.y - root.y, 0.0);
        float k = pow(hh / ${refH}, ${stiff});
        float ph = dot(root.xz, vec2(0.31, 0.27));
        float sway = sin(uTime * 1.05 + ph) * 0.55 + sin(uTime * 2.2 + ph * 1.7) * 0.25 + sin(uTime * 0.43 + ph * 0.5) * 0.35;
        // порыв: широкая волна бежит по лесу по ветру, сверху — мелкая дрожь хвои
        float gw = 0.5 + 0.5 * sin(dot(root.xz, uWind) * 0.045 - uTime * 1.25 + sin(uTime * 0.17 + root.x * 0.01) * 2.0);
        float gust = gw * gw * gw * uWindAmp;
        vec3 disp = vec3(uWind.x, 0.0, uWind.y) * (0.55 + sway + gust * 1.1) * uWindAmp * ${amp} * k;
        float fl = ${flutter} * uWindAmp * min(k, 1.5) * (1.0 + gust * 1.6);
        disp += vec3(sin(uTime * 6.1 + wp.x * 2.3 + wp.y * 1.3), sin(uTime * 5.3 + wp.z * 2.1) * 0.5,
                     cos(uTime * 6.7 + wp.z * 2.2 + wp.y * 1.1)) * fl;
        // ударная волна: фронт ~70 м/с, затухающее колебание после прохода
        vec2 bd = wp.xz - uBlast.xz;
        float bdist = length(bd);
        float tau = uBlast.w - bdist / 70.0;
        if (tau > 0.0 && tau < 2.5 && uBlastStr > 0.0) {
          float push = exp(-tau * 3.2) * sin(tau * 11.0 + 1.2) * uBlastStr * exp(-bdist / 24.0) * ${blast};
          disp.xz += (bdist > 0.01 ? bd / bdist : vec2(1.0, 0.0)) * push * min(k, 1.2);
          disp.y -= abs(push) * 0.2 * min(k, 1.0);
        }
        ${trample ? `
        vec2 pd = root.xz - uPlayer.xz;
        float pdist = length(pd);
        float press = (1.0 - smoothstep(0.2, 1.1, pdist)) * (1.0 - smoothstep(0.6, 1.8, abs(root.y - uPlayer.y)));
        if (press > 0.001) {
          disp.xz += (pdist > 0.001 ? pd / pdist : vec2(1.0, 0.0)) * press * hh * 0.7;
          disp.y -= press * hh * 0.55;
        }` : ""}
        transformed += inverse(mat3(mw)) * disp;
      }
    `
    );
  };
  const key2 = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => key2 + "|wind" + amp + stiff + refH + flutter + trample + blast + burn + dither;
  return mat;
}
function injectStructFX(mat, mineral) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, windUniforms, FXU);
    sh.vertexShader = (sh.vertexShader.includes("uniform vec4 uBlast") ? "" : WIND_GLSL) + "varying vec3 vSW;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      {
        #ifdef USE_INSTANCING
          vec4 sw = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #else
          vec4 sw = modelMatrix * vec4(transformed, 1.0);
        #endif
        vSW = sw.xyz;
        vec2 bd = sw.xz - uBlast.xz; float bdist = length(bd);
        float tau = uBlast.w - bdist / 340.0;
        if (tau > 0.0 && tau < 0.8 && uBlastStr > 0.0) {
          float push = exp(-tau * 7.0) * sin(tau * 60.0) * uBlastStr * exp(-bdist / 9.0) * 0.035;
          vec3 d = vec3(bdist > 0.01 ? bd / bdist : vec2(1.0, 0.0), 0.0).xzy;
          #ifdef USE_INSTANCING
            transformed += inverse(mat3(modelMatrix * instanceMatrix)) * d * push;
          #else
            transformed += inverse(mat3(modelMatrix)) * d * push;
          #endif
        }
      }`);
    sh.fragmentShader = (sh.fragmentShader.includes("uniform sampler2D uBurn") ? "varying vec3 vSW;\n" : FXU_GLSL + "varying vec3 vSW;\n") + sh.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
        vec4 chS = charAt(vSW.xz);
        float chn = sfxNoise(vSW * 2.3) * 0.65 + sfxNoise(vSW * 6.1 + 7.0) * 0.35;
        float chK = smoothstep(0.02, 0.55, chS.r + (chn - 0.5) * 0.3 * chS.r);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.022, 0.02) * (0.6 + chn * 0.8), chK * ${mineral ? "0.78 * smoothstep(0.25, 0.75, chn + 0.25)" : "0.96"});`).replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        {
          // тлеющие трещины: гребни шума (изолинии) — рваная сетка без регулярной решётки, только по сильно обугленному
          float fl = 0.6 + 0.4 * sfxNoise(vec3(vSW.xz * 0.8, uFxT * 1.7));
          // крупные пятна углей в «крокодиловой коже» обугливания, а не тонкие червячки
          float n1 = sfxNoise(vSW * 1.7 + vec3(3.7, 1.1, 9.2)), n2 = sfxNoise(vSW * 4.3 + vec3(1.3, 5.7, 2.1));
          float cr = smoothstep(0.6, 0.85, n1 * 0.6 + n2 * 0.4) * 0.6;
          float g = chS.g * chS.g * smoothstep(0.45, 0.95, chS.r);
          ${mineral ? "// камень/металл не тлеет — только копоть" : "totalEmissiveRadiance += vec3(1.0, 0.28, 0.04) * g * (0.02 + cr * smoothstep(0.8, 1.0, chS.r)) * fl;"}
        }`);
  };
  const key2 = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => key2 + (mineral ? "|sfxm" : "|sfx");
  return mat;
}
var M = {};
var TEX = {};
var std = (o) => new THREE5.MeshStandardMaterial(o);
function surf(maps, o = {}) {
  const m = std({ map: maps.map, normalMap: maps.normal, roughness: o.rough ?? 0.9, metalness: o.metal ?? 0, color: o.color ?? 16777215, ...o.extra });
  if (o.nscale) m.normalScale.set(o.nscale, o.nscale);
  return m;
}
function foliage(map, o = {}) {
  const m = std({
    map,
    alphaTest: o.alphaTest ?? 0.5,
    side: THREE5.DoubleSide,
    roughness: o.rough ?? 0.85,
    color: o.color ?? 16777215,
    metalness: 0
  });
  m.emissive = new THREE5.Color(o.glow ?? 725510);
  // ночью листва не проваливается в чёрное: лунный контровой свет по кромкам карточек
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMoonRim = MOONRIM;
    sh.fragmentShader = "uniform vec3 uMoonRim;\n" + sh.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      { float rimK = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.5);
        totalEmissiveRadiance += uMoonRim * diffuseColor.rgb * (0.35 + rimK * 2.2); }`);
  };
  m.customProgramCacheKey = () => "foliage-rim";
  return m;
}
var MOONRIM = { value: new THREE5.Color(0, 0, 0) };
function depthFor(mat, wind) {
  const d = new THREE5.MeshDepthMaterial({ depthPacking: THREE5.RGBADepthPacking, map: mat.map, alphaTest: mat.alphaTest, side: THREE5.DoubleSide });
  if (wind) injectWind(d, wind);
  return d;
}
function buildMaterials() {
  TEX.floor = forestFloor();
  TEX.path = dirtPath();
  TEX.mud = mud();
  TEX.dug = dugEarth();
  {
    const m = TEX.dug.map.clone(), n2 = TEX.dug.normal.clone();
    m.repeat.set(4, 2);
    n2.repeat.set(4, 2);
    m.needsUpdate = n2.needsUpdate = true;
    M.dirtMound = new THREE5.MeshStandardMaterial({ map: m, normalMap: n2, roughness: 1 });
  }
  const spruceBark = bark("spruce"), pineBark = bark("pine"), birch = birchBark();
  M.barkSpruce = surf(spruceBark, { rough: 0.95, nscale: 1.2, extra: { vertexColors: true } });
  M.barkPine = surf(pineBark, { rough: 0.92, nscale: 1.4, extra: { vertexColors: true } });
  M.barkBirch = surf(birch, { rough: 0.8, extra: { vertexColors: true } });
  M.deadwood = surf(spruceBark, { rough: 0.98, color: 10130570 });
  TEX.spruce = spruceAtlas();
  TEX.pine = pineAtlas();
  TEX.birch = birchAtlas();
  M.spruce = foliage(TEX.spruce, { rough: 0.9, glow: 462086 });
  M.pine = foliage(TEX.pine, { rough: 0.85, glow: 659463 });
  M.birch = foliage(TEX.birch, { rough: 0.8, glow: 1054726 });
  M.grass = foliage(grassTex(), { alphaTest: 0.45, rough: 0.95, glow: 659974 });
  M.fern = foliage(fernTex(), { alphaTest: 0.45, glow: 660486 });
  M.shrub = foliage(shrubTex(), { alphaTest: 0.45, glow: 528390 });
  M.reed = foliage(reedTex(), { alphaTest: 0.45, rough: 0.8, glow: 791046 });
  const pl = planks([116, 108, 96]);
  M.planks = surf(pl, { rough: 0.92 });
  M.planksDark = surf(planks([84, 72, 60]), { rough: 0.95 });
  M.planksPaint = surf(planks([88, 104, 90]), { rough: 0.9 });
  M.logWall = surf(logWall(), { rough: 0.95, nscale: 1.3 });
  M.logEnd = std({ color: 9073752, roughness: 0.95 });
  M.roofRust = surf(corrugated([88, 92, 86], 0.7, 1), { rough: 0.7, metal: 0.35, extra: { side: THREE5.DoubleSide } });
  M.roofTar = surf(rustMetal([42, 42, 40], 0.05), { rough: 0.95, extra: { side: THREE5.DoubleSide } });
  M.concrete = surf(rustMetal([122, 120, 114], 0.12), { rough: 0.95, nscale: 0.6 });
  M.brick = std({ color: 8276534, roughness: 0.95 });
  const paints = [[78, 104, 118], [124, 118, 92], [104, 44, 36], [72, 88, 62], [150, 146, 136]];
  M.carPaint = paints.map((p) => surf(rustMetal(p, 0.9), { rough: 0.62, metal: 0.4 }));
  M.burnt = surf(rustMetal([48, 40, 34], 0.8), { rough: 0.9, metal: 0.25, color: 9209216 });
  M.barrel = [[60, 84, 110], [120, 40, 32], [70, 86, 58], [118, 104, 60]].map((p) => surf(rustMetal(p, 0.8, 256), { rough: 0.6, metal: 0.45 }));
  M.steel = std({ color: 3948094, roughness: 0.55, metalness: 0.7 });
  M.rust = surf(rustMetal([96, 60, 40], 1, 256), { rough: 0.8, metal: 0.4 });
  M.dark = std({ color: 1842460, roughness: 0.7, metalness: 0.3 });
  M.rubber = std({ color: 1381653, roughness: 0.92 });
  M.glass = std({ color: 1844264, roughness: 0.08, metalness: 0.9, transparent: true, opacity: 0.55 });
  M.sack = surf(sackcloth(), { rough: 0.98 });
  M.wattle = surf(wattle(), { rough: 0.97, nscale: 1.2 });
  M.canvas = std({ color: 6118980, roughness: 0.95, side: THREE5.DoubleSide });
  M.camo = std({ map: camoNet(), alphaTest: 0.5, side: THREE5.DoubleSide, roughness: 0.95 });
  M.wire = std({ color: 4866104, roughness: 0.6, metalness: 0.6 });
  M.rope = std({ color: 7168592, roughness: 0.95 });
  M.stone = surf(rustMetal([108, 110, 104], 0, 256), { rough: 0.95, nscale: 1.4, extra: { vertexColors: true } });
  M.crate = surf(planks([98, 102, 70], 4), { rough: 0.92 });
  M.bone = std({ color: 14209728, roughness: 0.8 });
  M.lampGlass = std({ color: 9277322, emissive: 16761466, emissiveIntensity: 0, roughness: 0.3 });
  TEX.mineSign = [mineSign(0), mineSign(1)];
  TEX.flagA = teamFlag("A");
  TEX.flagD = teamFlag("D");
  TEX.pennantA = pennant("A");
  TEX.pennantD = pennant("D");
  TEX.glow = radial([[0, "rgba(255,236,200,1)"], [0.18, "rgba(255,200,130,.55)"], [0.5, "rgba(255,170,90,.12)"], [1, "rgba(255,160,80,0)"]]);
  TEX.pool = radial([[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,255,255,.55)"], [0.7, "rgba(255,255,255,.14)"], [1, "rgba(255,255,255,0)"]], 256);
  TEX.smoke = smokeTex();
  TEX.smokeAtlas = smokeAtlas();
  TEX.fireAtlas = fireAtlas();
  TEX.fire = radial([[0, "rgba(255,250,220,1)"], [0.25, "rgba(255,190,90,.9)"], [0.6, "rgba(220,80,20,.35)"], [1, "rgba(120,20,0,0)"]]);
  TEX.crater = craterTex();
  TEX.water = waterNormals();
  TEX.board = boardSign(["ТУРБАЗА", "«ЛЕСНОЕ»", "добро пожаловать"]);
  TEX.boardK = boardSign(["ЛЕСНИЧЕСТВО", "КОРДОН №4", "берегите лес"], "#3b3a2c");
  M.planksCamp = surf(planks([92, 118, 128]), { rough: 0.9 });
  M.planksWhite = surf(planks([176, 172, 158]), { rough: 0.88 });
  M.planksCream = surf(planks([150, 132, 96]), { rough: 0.9 });
  M.roofCamp = surf(corrugated([88, 102, 96], 0.55, 1), { rough: 0.72, metal: 0.35, extra: { side: THREE5.DoubleSide } });
  M.plaster = std({ color: 11841700, roughness: 0.97 });
  M.paintRed = surf(rustMetal([140, 44, 36], 0.9, 256), { rough: 0.65, metal: 0.3 });
  M.steelPipe = surf(rustMetal([110, 116, 112], 1.1, 256), { rough: 0.6, metal: 0.55 });
  M.barkLog = surf(planks([96, 78, 60], 3), { rough: 0.95 });
  const sign2 = (t) => std({ map: t, roughness: 0.8, side: THREE5.DoubleSide });
  M.signGate = sign2(campSign(["ПИОНЕРСКИЙ ЛАГЕРЬ", "«ВОЛЧОНОК»"], { w: 1024, h: 200, sizes: [52, 84] }));
  M.signDining = sign2(campSign(["СТОЛОВАЯ"], { w: 512, h: 128, bg: "#e2dccb", fg: "#9b2a22", sizes: [80] }));
  M.signWC = sign2(campSign(["М", "Ж"], { w: 256, h: 128, bg: "#dcd6c4", fg: "#2c4f6e", sizes: [70, 70] }));
  M.signWash = sign2(campSign(["УМЫВАЛЬНИК"], { w: 512, h: 96, bg: "#2f5a6e", fg: "#e8e0c8", sizes: [60] }));
  M.signShower = sign2(campSign(["ДУШ"], { w: 256, h: 96, bg: "#2f5a6e", fg: "#e8e0c8", sizes: [64] }));
  M.signMotto = sign2(campSign(["БУДЬ ГОТОВ!", "ВСЕГДА ГОТОВ!"], { w: 1024, h: 256, bg: "#a82a22", fg: "#efe6c8", sizes: [96, 96] }));
  M.signCabin = [1, 2, 3, 4, 5, 6].map((n2) => sign2(campSign([`ОТРЯД ${n2}`], { w: 256, h: 96, bg: "#e2dccb", fg: "#2c4f6e", sizes: [58] })));
  M.wolf = sign2(wolfBadge());
  M.flagRag = std({ color: 9316898, roughness: 0.95, side: THREE5.DoubleSide });
  M.stumpTop = std({ map: stumpTop(), roughness: 0.95 });
  M.holes = std({ map: bulletHoles(), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  {
    const sheets = [
      ["#ПОЗЫВНЫЕ", "Берёза-1 — КП", "Гром — миномёт", "Сокол — птичка (дрон)", "Ветер-2 — лев. фланг", "Ветер-3 — прав. фланг", "Лесник — разведка", "Кедр — эвакуация", "", "не путать Ветер с Вепрем!"],
      ["#СВЯЗЬ", "осн. 146.500", "зап. 147.225", "шифр. таблица — у ст.", "", "#ПАРОЛЬ", "ЗВЕЗДА — отзыв МАЯК", "с 00:00 — ИВОЛГА /", "                     КОСТЁР"],
      ["#ОРИЕНТИРЫ", "1 — вышка (пожарная)", "2 — водокачка", "3 — сгоревшая БМП", "4 — ангар № 3 (КПП!)", "5 — кран — не лезть"],
      ["#СХЕМА", "наши —", "они — >", "X — пулемёт"]
    ].map((l, i) => paperSheet(l, { grid: i === 3, sketch: i === 3, bg: i === 1 ? "#e2dcc6" : void 0, ink: i === 2 ? "#2a2a2a" : void 0 }).image);
    const W = sheets[0].width, H2 = sheets[0].height, c = document.createElement("canvas");
    c.width = W * 2;
    c.height = H2 * 2;
    const x = c.getContext("2d");
    sheets.forEach((im3, i) => x.drawImage(im3, i % 2 * W, (i >> 1) * H2));
    const t = new THREE5.CanvasTexture(c);
    t.colorSpace = THREE5.SRGBColorSpace;
    t.anisotropy = 4;
    M.paperAtlas = std({ map: t, roughness: 0.9, side: THREE5.DoubleSide });
    M.paper = [0, 1, 2, 3].map((i) => ({ atlas: i }));
  }
  M.towerSteel = surf(rustMetal([88, 98, 90], 0.55, 256), { rough: 0.62, metal: 0.55 });
  M.towerRed = surf(rustMetal([150, 58, 44], 0.45, 256), { rough: 0.6, metal: 0.45 });
  M.tankCamp = surf(rustMetal([96, 130, 150], 0.5), { rough: 0.55, metal: 0.5 });
  M.tankGrey = surf(rustMetal([104, 112, 104], 0.6), { rough: 0.55, metal: 0.5 });
  M.grate = std({ color: 4145212, roughness: 0.6, metalness: 0.6 });
  M.armor = surf(rustMetal([66, 72, 50], 0.35), { rough: 0.7, metal: 0.4 });
  M.armorBurnt = surf(rustMetal([40, 38, 36], 0.45), { rough: 0.88, metal: 0.3, color: 7828076 });
  M.heli = surf(rustMetal([78, 88, 64], 0.18), { rough: 0.62, metal: 0.35 });
  M.heliBelly = surf(rustMetal([120, 136, 140], 0.3), { rough: 0.6, metal: 0.35 });
  M.brass = std({ color: 11569724, roughness: 0.35, metalness: 0.9 });
  M.olive = std({ color: 4870710, roughness: 0.6, metalness: 0.3 });
  M.peat = new THREE5.MeshStandardMaterial({ color: 2763032, roughness: 0.1, metalness: 0.2 });
  for (const m of [
    M.planks,
    M.planksDark,
    M.planksPaint,
    M.logWall,
    M.logEnd,
    M.roofRust,
    M.roofTar,
    M.deadwood,
    M.crate,
    M.wattle,
    M.sack,
    M.canvas,
    M.brick,
    M.concrete,
    M.planksCamp,
    M.planksWhite,
    M.planksCream,
    M.roofCamp,
    M.plaster,
    M.paintRed,
    M.steelPipe,
    M.barkLog,
    M.rust,
    M.burnt,
    M.dark,
    ...M.carPaint,
    M.towerSteel,
    M.towerRed,
    M.tankCamp,
    M.tankGrey,
    M.grate,
    M.armor,
    M.armorBurnt,
    M.heli,
    M.heliBelly,
    M.stumpTop,
    M.stone
  ]) injectStructFX(m, [M.brick, M.concrete, M.plaster, M.steelPipe, M.rust, M.roofRust, M.burnt, M.dark, ...M.carPaint, M.towerSteel, M.towerRed, M.tankCamp, M.tankGrey, M.grate, M.armor, M.armorBurnt, M.heli, M.heliBelly, M.stone].includes(m));
}
var THREE6 = ctx.THREE;
function rawDensity(x, z) {
  return 0.3 + 0.7 * smoothstep(0.3, 0.64, fbm(x * 0.02 + 4.2, z * 0.02 - 8.1, 3));
}
function forestDensity(x, z) {
  let d = rawDensity(x, z);
  d *= smoothstep(1.14, 1.6, hgRho(x, z));
  for (const s of Object.values(SPAWNS)) d *= 0.05 + 0.95 * smoothstep(24, 40, Math.hypot(x - s.x, z - s.z));
  // поле: только редкий самосев по краям; деревня: деревья только свои (яблони, берёзы у домов)
  d *= 1 - 0.97 * smoothstep(0.1, 0.6, inField(x, z));
  if (inVillage(x, z, 4)) d *= 0.04;
  for (const p of PLANS) {
    const pd = padRectDist(p, x, z);
    if (pd < 9) d *= 0.05 + 0.95 * smoothstep(1, 9, pd);
  }
  // склоны оврага: ивняк и ольха — реже, чем в лесу
  const sq = streamAt(x, z);
  if (sq.d < STREAM_BW + RAV.w + 2) d *= 0.35 * smoothstep(STREAM_BW, STREAM_BW + 2, sq.d);
  if (V22 && (V22.spots.length || V22.zones.length)) d *= v22TreeK(x, z);
  const e = edgeDist(x, z);
  // просека вдоль запретки: 12 м за внешним ограждением вырублено (только пни и молодая поросль)
  if (e > MAP.PLAY - 3 && e < MAP.CUT) d *= e > MAP.FENCE + 2 ? 0.08 : 0.02;
  if (e > MAP.CUT) d = Math.max(d, 0.85 * smoothstep(MAP.CUT, MAP.CUT + 6, e));
  return clamp(d, 0, 1);
}
var Geo = class {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.c = [];
    this.i = [];
  }
  get count() {
    return this.p.length / 3;
  }
  v(x, y, z, nx, ny, nz, u, vv, r, g, b) {
    this.p.push(x, y, z);
    this.n.push(nx, ny, nz);
    this.uv.push(u, vv);
    this.c.push(r, g, b);
    return this.count - 1;
  }
  build() {
    const g = new THREE6.BufferGeometry();
    g.setAttribute("position", new THREE6.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE6.Float32BufferAttribute(this.n, 3));
    g.setAttribute("uv", new THREE6.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE6.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
};
var V3 = THREE6.Vector3;
function trunk(G2, R2, o) {
  const segs = o.segs ?? 7, rings = o.rings ?? 6;
  const bendA = R2.range(0, TAU), bend = o.bend ?? 0.012;
  const base2 = G2.count;
  for (let j = 0; j <= rings; j++) {
    const t = j / rings, y = t * o.h;
    const r = lerp(o.r0, o.r1, Math.pow(t, 0.8)) * (1 + 0.9 * Math.exp(-t * 26));
    const ox = Math.cos(bendA) * Math.sin(t * Math.PI) * bend, oz = Math.sin(bendA) * Math.sin(t * Math.PI) * bend;
    const col = o.color(t);
    for (let i = 0; i <= segs; i++) {
      const a = i / segs * TAU, cx = Math.cos(a), cz = Math.sin(a);
      G2.v(ox + cx * r, y, oz + cz * r, cx, 0.15, cz, i / segs * 2, y * (o.vScale ?? 6), col[0], col[1], col[2]);
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) {
    const a = base2 + j * (segs + 1) + i, b = a + 1, c = a + segs + 1, d = c + 1;
    G2.i.push(a, c, b, b, c, d);
  }
}
var _a = new V3();
var _b = new V3();
var _n = new V3();
function branchCard(G2, org, dir2, side2, L, W, droop, quad, center, ao) {
  const base2 = G2.count;
  for (let k = 0; k <= 2; k++) {
    const s = k / 2;
    const dy = -droop * L * s * s;
    _a.copy(org).addScaledVector(dir2, L * s);
    _a.y += dy;
    for (let e = 0; e <= 1; e++) {
      const w = (e - 0.5) * W * (k === 0 ? 0.55 : 1);
      _b.copy(_a).addScaledVector(side2, w);
      _n.copy(_b).sub(center).normalize();
      _n.y = _n.y * 0.6 + 0.5;
      _n.normalize();
      const shade = lerp(ao, 1, s);
      G2.v(_b.x, _b.y, _b.z, _n.x, _n.y, _n.z, quad[0] + s * 0.5, quad[1] + e * 0.5, shade, shade, shade);
    }
  }
  for (let k = 0; k < 2; k++) {
    const a = base2 + k * 2, b = a + 1, c = a + 2, d = a + 3;
    G2.i.push(a, c, b, b, c, d);
  }
}
function clump(G2, c, up, size, quad, center, ao, planes = 3) {
  const t1 = new V3(up.z, 0, -up.x);
  if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0);
  t1.normalize();
  const t2 = new V3().crossVectors(up, t1).normalize();
  for (let p = 0; p < planes; p++) {
    const a = p / planes * Math.PI + srnd() * 0.4;
    const side2 = new V3().copy(t1).multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a));
    const base2 = G2.count;
    for (let k = 0; k <= 1; k++) for (let e = 0; e <= 1; e++) {
      _b.copy(c).addScaledVector(up, (k - 0.5) * size).addScaledVector(side2, (e - 0.5) * size);
      _n.copy(_b).sub(center).normalize();
      _n.y = _n.y * 0.6 + 0.45;
      _n.normalize();
      const shade = lerp(ao, 1, 0.5 + k * 0.5);
      G2.v(_b.x, _b.y, _b.z, _n.x, _n.y, _n.z, quad[0] + e * 0.5, quad[1] + k * 0.5, shade, shade, shade);
    }
    G2.i.push(base2, base2 + 2, base2 + 1, base2 + 1, base2 + 2, base2 + 3);
  }
}
var QUADS = [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]];
function spruceVariant(seed, lod) {
  const R2 = rng(seed);
  const T = new Geo(), F = new Geo();
  const hi = lod === 0;
  trunk(T, R2, {
    h: 1,
    r0: 0.02,
    r1: 3e-3,
    segs: hi ? 7 : 5,
    rings: hi ? 6 : 3,
    bend: 6e-3,
    color: (t) => [lerp(0.62, 0.9, t), lerp(0.56, 0.8, t), lerp(0.5, 0.72, t)]
  });
  const y0 = R2.range(0.06, 0.13), whorls = hi ? 21 : 8, center = new V3(0, 0.42, 0);
  for (let w = 0; w < whorls; w++) {
    const t = w / (whorls - 1), y = lerp(y0, 0.96, Math.pow(t, 0.92));
    const L = (0.26 * Math.pow(1 - t, 0.9) + 0.035) * R2.range(0.88, 1.12) * (hi ? 1 : 1.18);
    const n2 = hi ? R2.int(6, 7) : 4, a0 = R2.range(0, TAU);
    for (let b = 0; b < n2; b++) {
      const a = a0 + b / n2 * TAU + R2.range(-0.25, 0.25);
      const dir2 = new V3(Math.cos(a), R2.range(-0.05, 0.12), Math.sin(a)).normalize();
      const side2 = new V3(-Math.sin(a), R2.range(-0.2, 0.2), Math.cos(a)).normalize();
      const W = L * (hi ? 1 : 1.6);
      branchCard(F, new V3(0, y, 0), dir2, side2, L, W, R2.range(0.35, 0.6) + (1 - t) * 0.25, QUADS[R2.int(0, 3)], center, 0.42 + t * 0.2);
    }
  }
  clump(F, new V3(0, 0.98, 0), new V3(0, 1, 0), 0.07, QUADS[0], center, 0.8, 2);
  return { trunk: T.build(), crown: F.build() };
}
function pineVariant(seed, lod) {
  const R2 = rng(seed);
  const T = new Geo(), F = new Geo();
  const hi = lod === 0;
  const orange = R2.range(0.42, 0.55);
  const bendA = R2.range(0, TAU), bend = R2.range(8e-3, 0.02);
  trunk(T, R2, {
    h: 1,
    r0: 0.019,
    r1: 5e-3,
    segs: hi ? 7 : 5,
    rings: hi ? 8 : 4,
    bend,
    color: (t) => {
      const k = smoothstep(orange - 0.12, orange + 0.08, t);
      // верх ствола сосны рыжеватый, но не оранжевый
      return [lerp(0.66, 1.06, k), lerp(0.56, 0.7, k), lerp(0.5, 0.56, k)];
    }
  });
  const center = new V3(0, 0.82, 0);
  const nb = hi ? R2.int(10, 12) : 7;
  for (let b = 0; b < nb; b++) {
    const t = b / (nb - 1);
    const y = lerp(0.6, 0.95, t) + R2.range(-0.02, 0.02);
    const a = b * 2.4 + R2.range(-0.4, 0.4);
    const reach = lerp(0.17, 0.06, t) * R2.range(0.8, 1.2);
    const rise = R2.range(0.04, 0.1);
    const tip = new V3(Math.cos(a) * reach, y + rise, Math.sin(a) * reach);
    if (hi) {
      const org = new V3(0, y, 0), d = tip.clone().sub(org), L = d.length();
      d.normalize();
      const s1 = new V3(-d.z, 0, d.x).normalize().multiplyScalar(35e-4), s2 = new V3().crossVectors(d, s1).normalize().multiplyScalar(35e-4);
      const base2 = T.count;
      for (const p of [org, tip]) for (const s of [s1, s2, s1.clone().negate(), s2.clone().negate()]) {
        T.v(p.x + s.x, p.y + s.y, p.z + s.z, s.x, s.y, s.z, 0, p === org ? 0 : L * 6, 0.8, 0.6, 0.48);
      }
      for (let k = 0; k < 4; k++) {
        const a0 = base2 + k, a1 = base2 + (k + 1) % 4;
        T.i.push(a0, a0 + 4, a1, a1, a0 + 4, a1 + 4);
      }
    }
    const nc = hi ? R2.int(4, 5) : 3;
    for (let c = 0; c < nc; c++) {
      const k = 1 - c * 0.22;
      const p = new V3(tip.x * k, lerp(y, tip.y, k) + R2.range(-0.01, 0.02), tip.z * k);
      p.x += R2.range(-0.025, 0.025);
      p.z += R2.range(-0.025, 0.025);
      const up = new V3(tip.x * 0.4, 1, tip.z * 0.4).normalize();
      clump(F, p, up, R2.range(0.1, 0.135) * (hi ? 1 : 1.25), QUADS[R2.int(0, 3)], center, 0.55, hi ? 3 : 2);
    }
  }
  clump(F, new V3(0, 0.98, 0), new V3(0, 1, 0), 0.12, QUADS[1], center, 0.8, 3);
  return { trunk: T.build(), crown: F.build() };
}
function birchVariant(seed, lod) {
  const R2 = rng(seed);
  const T = new Geo(), F = new Geo();
  const hi = lod === 0;
  trunk(T, R2, { h: 1, r0: 0.014, r1: 4e-3, segs: hi ? 6 : 4, rings: hi ? 6 : 3, bend: 0.03, vScale: 3, color: (t) => [1, 1, 1] });
  const center = new V3(0, 0.66, 0);
  const n2 = hi ? 34 : 14;
  for (let i = 0; i < n2; i++) {
    const t = R2();
    const y = lerp(0.42, 1, Math.sqrt(t));
    const rr = Math.sin(lerp(0.2, 1, 1 - t) * Math.PI * 0.8) * 0.16 * R2.range(0.6, 1.1);
    const a = R2.range(0, TAU);
    const p = new V3(Math.cos(a) * rr, y, Math.sin(a) * rr);
    const up = new V3(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3).normalize();
    clump(F, p, up, R2.range(0.1, 0.15) * (hi ? 1 : 1.35), QUADS[R2.int(0, 3)], center, 0.5, 2);
  }
  return { trunk: T.build(), crown: F.build() };
}
function silhouetteAtlas() {
  const S = 512, [c, x] = cv(S);
  x.lineCap = "round";
  const spruce = (ox, oy, W, H2, hue) => {
    const cx = ox + W / 2;
    x.strokeStyle = "rgb(60,48,38)";
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(cx, oy + H2);
    x.lineTo(cx, oy + 4);
    x.stroke();
    for (let k = 0; k < 34; k++) {
      const t = k / 33, y = oy + H2 * (0.9 - t * 0.88), L = (1 - t) * W * 0.46 + 4;
      for (const s of [-1, 1]) {
        for (let q = 0; q < 16; q++) {
          const u = q / 16, px = cx + s * L * u, py = y + u * u * L * 0.35;
          const v = sr(0.7, 1.2);
          x.strokeStyle = rgba(hue[0] * v, hue[1] * v, hue[2] * v, 1);
          x.lineWidth = 2.2;
          x.beginPath();
          x.moveTo(px, py);
          x.lineTo(px + s * 4, py + sr(3, 7));
          x.stroke();
        }
      }
    }
  };
  const pine = (ox, oy, W, H2) => {
    const cx = ox + W / 2;
    x.strokeStyle = "rgb(150,92,60)";
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(cx, oy + H2);
    x.lineTo(cx + 3, oy + H2 * 0.2);
    x.stroke();
    for (let k = 0; k < 16; k++) {
      const px = cx + sr(-W * 0.36, W * 0.36), py = oy + sr(H2 * 0.04, H2 * 0.36);
      for (let q = 0; q < 70; q++) {
        const a = sr(0, TAU), L = sr(4, 14), v = sr(0.7, 1.2);
        x.strokeStyle = rgba(58 * v, 80 * v, 44 * v, 1);
        x.lineWidth = 2;
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L * 0.7);
        x.stroke();
      }
    }
  };
  spruce(0, 0, 256, 256, [44, 70, 40]);
  spruce(256, 0, 256, 256, [38, 60, 38]);
  pine(0, 256, 256, 256);
  for (let k = 0; k < 900; k++) {
    const a = sr(0, TAU), r = Math.sqrt(srnd()) * 110, px = 384 + Math.cos(a) * r, py = 384 + Math.sin(a) * r;
    const v = sr(0.6, 1.2) * (1 - r / 200);
    x.strokeStyle = rgba(44 * v, 70 * v, 40 * v, 1);
    x.lineWidth = 2.4;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * 8, py + Math.sin(a) * 8);
    x.stroke();
  }
  sharpenAlpha(c, 0.4);
  bleedColor(c, 3);
  return tex(c);
}
function farGeo(quad = [0, 0.5], w = 0.62, cap = true) {
  const G2 = new Geo();
  for (let p = 0; p < 2; p++) {
    const a = p * Math.PI / 2, cx = Math.cos(a), cz = Math.sin(a);
    const base3 = G2.count;
    for (let k = 0; k <= 1; k++) for (let e = 0; e <= 1; e++) {
      const s = e - 0.5;
      G2.v(cx * s * w, k, cz * s * w, -cz * 0.5, 0.8, cx * 0.5, quad[0] + e * 0.5, quad[1] + k * 0.5, 0.6 + k * 0.4, 0.6 + k * 0.4, 0.6 + k * 0.4);
    }
    G2.i.push(base3, base3 + 2, base3 + 1, base3 + 1, base3 + 2, base3 + 3);
  }
  if (!cap) return G2.build();
  const base2 = G2.count;
  for (let k = 0; k <= 1; k++) for (let e = 0; e <= 1; e++) {
    G2.v((e - 0.5) * w * 0.8, 0.42, (k - 0.5) * w * 0.8, 0, 1, 0, 0.5 + e * 0.5, k * 0.5, 0.7, 0.7, 0.7);
  }
  G2.i.push(base2, base2 + 1, base2 + 2, base2 + 1, base2 + 3, base2 + 2);
  return G2.build();
}
var SIL = null;
function silMaterial() {
  if (SIL) return SIL;
  SIL = new THREE6.MeshStandardMaterial({ map: silhouetteAtlas(), alphaTest: 0.5, side: THREE6.DoubleSide, roughness: 0.9, vertexColors: true });
  SIL.emissive = new THREE6.Color(395781);
  injectWind(SIL, { amp: 0.5, stiff: 2.2, refH: 18, flutter: 0, blast: 0.5 });
  return SIL;
}
var TREES = [];
var TREE_GRID = /* @__PURE__ */ new Map();
var tkey = (x, z) => Math.floor(x / 6) * 4096 + Math.floor(z / 6);
function treesNear(x, z, r) {
  const out = [], n2 = Math.ceil(r / 6);
  for (let i = -n2; i <= n2; i++) for (let j = -n2; j <= n2; j++) {
    const L = TREE_GRID.get(tkey(x + i * 6, z + j * 6));
    if (!L) continue;
    for (const t of L) if (!t.broken && (t.x - x) ** 2 + (t.z - z) ** 2 < r * r) out.push(t);
  }
  return out;
}
var _zero = new THREE6.Matrix4().makeScale(0, 0, 0);
function hideTree(t) {
  t.broken = true;
  treeTraceHide(t);
  if (t.core) {
    t.core.im.setMatrixAt(t.core.i, _zero);
    t.core.im.instanceMatrix.needsUpdate = true;
  }
  updateForestLOD(true);
}
var charTree = function(){};
function thinTree(t, k) {
  t.thin = Math.min(1, (t.thin || 0) + k);
  t.color.multiplyScalar(1 - k * 0.25);
  updateForestLOD(true);
}
var treeGeo = (t) => ({ trunk: t.L.trunkIM.geometry, crown: t.L.hiIM.geometry, bark: t.L.trunkIM.material, foliage: t.L.hiIM.material, sp: t.L.sp });
function treeNear(x, z, r) {
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const L = TREE_GRID.get(tkey(x + i * 6, z + j * 6));
    if (!L) continue;
    for (const t of L) {
      const dx = t.x - x, dz = t.z - z, R2 = r + t.r;
      if (dx * dx + dz * dz < R2 * R2) return t;
    }
  }
  return null;
}
var SPECIES = {
  spruce: { make: spruceVariant, n: 3, bark: "barkSpruce", foliage: "spruce" },
  pine: { make: pineVariant, n: 3, bark: "barkPine", foliage: "pine" },
  birch: { make: birchVariant, n: 2, bark: "barkBirch", foliage: "birch" }
};
var LODS = [];
var farIM = null;
function chooseSpecies(x, z, R2) {
  const dry = fbm(x * 0.013 + 40, z * 0.013 - 12, 2);
  const nearWater = lakeRho(x, z) < 2.3;
  const mix = fbm(x * 0.021 - 7, z * 0.021 + 3, 2);
  const pB = 0.07 + 0.42 * smoothstep(0.52, 0.7, mix) + (nearWater || forestDensity(x, z) < 0.35 ? 0.22 : 0);
  if (R2() < pB) return "birch";
  return R2() < smoothstep(0.35, 0.65, dry) * 0.85 + 0.08 ? "pine" : "spruce";
}
/* v21: неподвижный набор деревьев для пуль, лазера и видимости ботов (слой 31 — не рисуется ни
   в кадре, ни в тенях). Рисуемые наборы теперь меняются от взгляда камеры, а этот — нет: пуля
   попадает в дерево за спиной, а след от пули остаётся на своём стволе. */
function treeTraceSet(v, sp, name, n2) {
  const trunk = new THREE6.InstancedMesh(v.hi.trunk, M[sp.bark], n2), crown = new THREE6.InstancedMesh(v.hi.crown, M[sp.foliage], n2);
  trunk.name = "tree_trunk_" + name; crown.name = "tree_crown_" + name;
  for (const im3 of [trunk, crown]) {
    im3.layers.set(31);
    im3.castShadow = false;
    im3.receiveShadow = false;
    im3.userData.traceOnly = true;
    scene.add(im3);
  }
  return { trunk, crown };
}
function treeTraceHide(t) {
  const tr = t.L && t.L.trace;
  if (!tr) return;
  for (const im3 of [tr.trunk, tr.crown]) {
    im3.setMatrixAt(t.i, _zero);
    im3.instanceMatrix.needsUpdate = true;
    globalThis.GTrace?.patchHidden?.(im3, t.i);
  }
}
function buildForest() {
  const R2 = rng(9001);
  M.spruce.vertexColors = M.pine.vertexColors = M.birch.vertexColors = true;
  const windCrown = { amp: 0.55, stiff: 2.2, refH: 18, flutter: 0.035, blast: 0.6, dither: true };
  const windTrunk = { amp: 0.55, stiff: 2.2, refH: 18, flutter: 0, blast: 0.6 };
  for (const k of ["spruce", "pine", "birch"]) injectWind(M[k], windCrown);
  for (const k of ["barkSpruce", "barkPine", "barkBirch"]) injectWind(M[k], windTrunk);
  const cell = 3.4, lim = MAP.FENCE + 14;
  const spots = [];
  let rejD = 0, rejF = 0;
  for (let gx = -lim; gx < lim; gx += cell) for (let gz = -lim; gz < lim; gz += cell) {
    const x = gx + R2() * cell, z = gz + R2() * cell;
    const d = forestDensity(x, z);
    if (R2() > smoothstep(0.05, 0.75, d) * 0.9 * Q.trees + 0.02) {
      rejD++;
      continue;
    }
    if (!isFree(x, z, 0.8, { lake: 1.08, pathPad: 1.2, trenchPad: 1.4 })) {
      rejF++;
      continue;
    }
    spots.push([x, z]);
  }
  console.info(`[forest] точек ${spots.length}, отказ по плотности ${rejD}, по занятости ${rejF}`);
  const variants = {};
  let seed = 100;
  for (const [name, sp] of Object.entries(SPECIES)) {
    variants[name] = [];
    for (let v = 0; v < sp.n; v++) {
      const hi = sp.make(seed, 0), lo = sp.make(seed, 1);
      seed += 17;
      variants[name].push({ hi, lo, species: name, trees: [] });
    }
  }
  for (const s of spots) {
    const [x, z] = s;
    const sp = s[2] || chooseSpecies(x, z, R2);
    const e = edgeDist(x, z);
    const deadZone = e > MAP.PLAY - 3 && e < MAP.FENCE + 4;
    const h = s[3] || (sp === "birch" ? R2.range(9, 15) : sp === "pine" ? R2.range(16, 26) : R2.range(9, 22)) * (deadZone ? 0.75 : 1);
    const vi = R2.int(0, SPECIES[sp].n - 1);
    const t = { x, y: terrainH(x, z) - 0.15, z, h, sp, vi, rot: R2.range(0, TAU), r: h * 0.019, tint: R2.range(0.8, 1.15), dead: deadZone && R2() < 0.5 };
    TREES.push(t);
    variants[sp][vi].trees.push(t);
    const k = tkey(x, z);
    if (!TREE_GRID.has(k)) TREE_GRID.set(k, []);
    TREE_GRID.get(k).push(t);
    if (true) {
      t.col = addCircle(x, z, Math.max(0.18, t.r * 1.05), t.y, t.y + h);
      t.col.tree = t;
    }
  }
  for (const [name, list] of Object.entries(variants)) {
    const sp = SPECIES[name];
    for (const v of list) {
      const n2 = v.trees.length;
      if (!n2) continue;
      const trunkIM = new THREE6.InstancedMesh(v.hi.trunk, M[sp.bark], n2);
      const hiIM = new THREE6.InstancedMesh(v.hi.crown, M[sp.foliage], n2);
      const loIM = new THREE6.InstancedMesh(v.lo.crown, M[sp.foliage], n2);
      // LOD ствола: вблизи — детальный ствол с сучьями, дальше — 5-гранный; дальние кроны тень не отбрасывают (её дают «ядра»)
      const trunkLoIM = new THREE6.InstancedMesh(v.lo.trunk, M[sp.bark], n2);
      trunkIM.name = "tree_trunk_" + name; hiIM.name = "tree_hi_" + name; loIM.name = "tree_lo_" + name; trunkLoIM.name = "tree_trunkLo_" + name;
      for (const im3 of [trunkIM, hiIM, loIM, trunkLoIM]) {
        im3.castShadow = Q.shadowTrees && (im3 === trunkIM || im3 === hiIM);
        im3.receiveShadow = true;
        im3.frustumCulled = false;
        im3.userData.noTrace = true;
        scene.add(im3);
      }
      const trace = treeTraceSet(v, sp, name, n2);
      hiIM.customDepthMaterial = loIM.customDepthMaterial = depthFor(M[sp.foliage], windCrown);
      trunkIM.receiveShadow = true;
      const m = new THREE6.Matrix4(), q = new THREE6.Quaternion(), p = new V3(), sc = new V3(), col = new THREE6.Color();
      v.trees.forEach((t, i) => {
        p.set(t.x, t.y, t.z);
        q.setFromAxisAngle(new V3(0, 1, 0), t.rot);
        sc.setScalar(t.h);
        m.compose(p, q, sc);
        t.matrix = m.clone();
        t.i = i;
        trace.trunk.setMatrixAt(i, m);
        trace.crown.setMatrixAt(i, t.dead ? _zero : m);
        const k = t.tint;
        col.setRGB(k, k, k);
        if (t.dead) col.setRGB(0.55, 0.5, 0.45);
        t.tcolor = col.clone();
        if (t.dead) col.setRGB(0.95, 0.62, 0.32);
        else if (name === "spruce") col.setRGB(0.66 * k, 0.8 * k, 0.76 * k);
        else if (name === "pine") col.setRGB(0.78 * k, 0.86 * k, 0.72 * k);
        else {
          const a = (t.x * 12.9898 + t.z * 78.233) % 1, u = Math.abs(a);
          if (u < 0.18) col.setRGB(1.1 * k, 0.7 * k, 0.55 * k);
          else if (u < 0.36) col.setRGB(0.78 * k, 1 * k, 0.72 * k);
          else col.setRGB(1 * k, 0.98 * k, 0.8 * k);
        }
        t.color = col.clone();
      });
      for (const im3 of [hiIM, loIM, trunkIM, trunkLoIM]) {
        im3.count = 0;
        im3.setColorAt(0, col);
      }
      const rec = { trunkIM, trunkLoIM, hiIM, loIM, trees: v.trees, dead: false, sp: name, trace };
      for (const t of v.trees) t.L = rec;
      LODS.push(rec);
    }
  }
  buildCores(variants);
  buildFarForest(R2);
  updateForestLOD(true);
}
function buildCores(variants) {
  const mat = silMaterial();
  for (const [name, quad, w] of [["spruce", [0, 0.5], 0.46], ["pine", [0, 0], 0.4]]) {
    const trees = variants[name].flatMap((v) => v.trees).filter((t) => !t.dead);
    if (!trees.length) continue;
    const im3 = new THREE6.InstancedMesh(farGeo(quad, w, false), mat, trees.length);
    const col = new THREE6.Color();
    trees.forEach((t, i) => {
      im3.setMatrixAt(i, t.matrix);
      col.copy(t.color).multiplyScalar(0.85);
      im3.setColorAt(i, col);
      t.core = { im: im3, i };
    });
    im3.castShadow = Q.shadowTrees;
    im3.receiveShadow = true;
    im3.frustumCulled = false;
    im3.customDepthMaterial = depthFor(mat, { amp: 0.5, stiff: 2.2, refH: 18, flutter: 0, blast: 0.5 });
    im3.name = "tree_cores_" + name;
    scene.add(im3);
  }
}
function buildFarForest(R2) {
  const mat = silMaterial();
  const pts = [];
  const inner = MAP.FENCE + 14, outer = MAP.WORLD - 20, step = 5.2;
  for (let x = -outer; x < outer; x += step) for (let z = -outer; z < outer; z += step) {
    const px = x + R2() * step, pz = z + R2() * step, e = edgeDist(px, pz);
    if (e < inner || e > outer) continue;
    if (R2() > 0.78) continue;
    pts.push([px, pz]);
  }
  const groups = [[], [], []];
  for (const p of pts) groups[R2() < 0.45 ? 0 : R2() < 0.6 ? 1 : 2].push(p);
  const geos = [farGeo([0, 0.5]), farGeo([0.5, 0.5]), farGeo([0, 0], 0.5)];
  let total = 0;
  groups.forEach((list, gi) => {
    const im3 = new THREE6.InstancedMesh(geos[gi], mat, list.length);
    const m = new THREE6.Matrix4(), q = new THREE6.Quaternion(), p = new V3(), sc = new V3(), col = new THREE6.Color();
    list.forEach(([x, z], i) => {
      const h = gi === 2 ? R2.range(18, 27) : R2.range(13, 24);
      p.set(x, terrainH(x, z) - 0.3, z);
      q.setFromAxisAngle(new V3(0, 1, 0), R2.range(0, TAU));
      sc.set(h * R2.range(0.8, 1.1), h, h * R2.range(0.8, 1.1));
      m.compose(p, q, sc);
      im3.setMatrixAt(i, m);
      const k = R2.range(0.7, 1.05);
      col.setRGB(k * 0.9, k, k * 0.9);
      im3.setColorAt(i, col);
    });
    im3.castShadow = false;
    im3.receiveShadow = true;
    im3.frustumCulled = false;
    im3.name = "far_forest";
    scene.add(im3);
    total += list.length;
  });
  farIM = { count: total };
}
var lastLOD = new V3(1e9, 0, 0);
function lodHide(im3) {
  let a = im3.geometry.getAttribute("aHide");
  if (!a || a.count < im3.instanceMatrix.count) {
    a = new THREE6.InstancedBufferAttribute(new Float32Array(im3.instanceMatrix.count), 1);
    a.setUsage(THREE6.DynamicDrawUsage);
    im3.geometry.setAttribute("aHide", a);
  }
  return a;
}
/* v21: деревья рисуются только там, куда смотрит камера (кластерное отсечение, как HISM в UE
   и отсечение по пирамиде видимости в RAGE/GTA V). Лес разбит на клетки 16 м; клетка вне пирамиды
   обзора (с запасом на крону и на тень, которая может лечь в кадр) выпадает из инстанс-буферов —
   её не обрабатывают ни основной проход, ни проход теней. Пули и видимость ботов от этого не
   зависят: у них свой неподвижный «трассировочный» набор стволов и крон (слой 31, не рисуется). */
function lodF(t, cp, r0, r1) {
  const dx = t.x - cp.x, dy = t.y + t.h * 0.5 - cp.y, dz = t.z - cp.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return d <= r0 ? 0 : d >= r1 ? 1 : smoothstep(r0, r1, d);
}
function lodTree(t, f) {
  const L = t.L;
  if (f === null || t.broken) {
    for (let w = 0; w < 4; w++) lodSet(L, w, t, null);
    return;
  }
  lodSet(L, 0, t, !t.dead && f < 1 ? f : null);
  lodSet(L, 1, t, !t.dead && f > 0 ? 1 - f : null);
  lodSet(L, 2, t, f < 0.5 ? 1 : null);
  lodSet(L, 3, t, f >= 0.5 ? 1 : null);
}
function updateForestLOD(force) {
  const cp = camera.position;
  if (!force && lastLOD.distanceToSquared(cp) < 6.25) return;
  // при обычном движении пересчитываем только клетки у кольца перехода и переписываем лишь изменившиеся слоты
  if (!force && lodFull.distanceToSquared(cp) < 400 && Math.abs(lodFull.y - cp.y) < 6 && LODS.length && LODS[0].lists) {
    lastLOD.copy(cp);
    return updateForestLODCells(cp);
  }
  lastLOD.copy(cp);
  lodFull.copy(cp);
  // полоса перехода: в ней крона есть в обоих LOD, и одна растворяется, пока проявляется другая; ствол переключается посередине
  const R = Q.treeNearR, band = Math.max(6, R * 0.16), r0 = R - band / 2, r1 = R + band / 2;
  for (const L of LODS) {
    const ims = lodIMs(L), A = [lodHide(L.hiIM).array, lodHide(L.loIM).array];
    L.lists = [[], [], [], []];
    for (const t of L.trees) {
      t._s = [-1, -1, -1, -1];
      if (t.broken || (t.cell && !t.cell.vis)) continue;
      const f = lodF(t, cp, r0, r1);
      const want = [t.dead || f >= 1 ? null : f, t.dead || f <= 0 ? null : 1 - f, f < 0.5 ? 1 : null, f >= 0.5 ? 1 : null];
      for (let w = 0; w < 4; w++) {
        if (want[w] === null) continue;
        const list = L.lists[w], s2 = list.length;
        ims[w].setMatrixAt(s2, t.matrix);
        ims[w].setColorAt(s2, w < 2 ? t.color : t.tcolor);
        if (w < 2) A[w][s2] = want[w];
        t._s[w] = s2;
        list.push(t);
      }
    }
    for (let w = 0; w < 4; w++) {
      const im3 = ims[w];
      im3.count = L.lists[w].length;
      // полная перезапись: частичные диапазоны прошлых правок сбрасываем, иначе ушла бы только их часть
      for (const attr of [im3.instanceMatrix, im3.instanceColor, w < 2 ? im3.geometry.attributes.aHide : null]) {
        if (!attr) continue;
        attr.clearUpdateRanges();
        attr.needsUpdate = true;
      }
    }
    L.dirty = null;
  }
}
var lodIMs = (L) => L.ims ??= [L.hiIM, L.loIM, L.trunkIM, L.trunkLoIM];
var lodFull = new V3(1e9, 0, 0);
var LOD_GRID = null;
function lodGrid() {
  if (LOD_GRID) return LOD_GRID;
  LOD_GRID = new Map();
  for (const L of LODS) for (const t of L.trees) {
    const k = Math.floor(t.x / 16) * 1e4 + Math.floor(t.z / 16);
    if (!LOD_GRID.has(k)) LOD_GRID.set(k, []);
    LOD_GRID.get(k).push(t);
  }
  return LOD_GRID;
}
function lodSet(L, w, t, val) {
  const im3 = lodIMs(L)[w], list = L.lists[w], A3 = w < 2 ? lodHide(im3).array : null;
  let s = t._s[w];
  if (val === null) {
    if (s < 0) return;
    const last = list.pop();
    if (last !== t) {
      list[s] = last;
      last._s[w] = s;
      im3.setMatrixAt(s, last.matrix);
      im3.setColorAt(s, w < 2 ? last.color : last.tcolor);
      if (A3) A3[s] = A3[list.length];
      lodDirty(L, w, s);
    }
    t._s[w] = -1;
    im3.count = list.length;
    return;
  }
  if (s < 0) {
    if (list.length >= im3.instanceMatrix.count) return;
    s = list.length;
    list.push(t);
    t._s[w] = s;
    im3.setMatrixAt(s, t.matrix);
    im3.setColorAt(s, w < 2 ? t.color : t.tcolor);
    im3.count = list.length;
  } else if (!A3 || Math.abs(A3[s] - val) < 1e-3) return;
  if (A3) A3[s] = val;
  lodDirty(L, w, s);
}
function lodDirty(L, w, s) {
  const d = L.dirty ??= [[1e9, -1], [1e9, -1], [1e9, -1], [1e9, -1]];
  d[w][0] = Math.min(d[w][0], s);
  d[w][1] = Math.max(d[w][1], s);
}
function lodFlush() {
  for (const L of LODS) {
    if (!L.dirty) continue;
    const ims = lodIMs(L);
    for (let w = 0; w < 4; w++) {
      const [a, b] = L.dirty[w];
      if (b < a) continue;
      const im3 = ims[w], n2 = b - a + 1;
      for (const [attr, sz] of [[im3.instanceMatrix, 16], [im3.instanceColor, 3], [w < 2 ? im3.geometry.attributes.aHide : null, 1]]) {
        if (!attr) continue;
        attr.addUpdateRange(a * sz, n2 * sz);
        attr.needsUpdate = true;
      }
    }
    L.dirty = null;
  }
}
function updateForestLODCells(cp) {
  const R = Q.treeNearR, band = Math.max(6, R * 0.16), r0 = R - band / 2, r1 = R + band / 2;
  // кольцо по горизонтали: с высоты дрона граница перехода ближе к центру
  const hy = Math.abs(cp.y - hFast(cp.x, cp.z)) + 20;
  const G3 = lodGrid(), inner = Math.max(0, Math.sqrt(Math.max(0, r0 * r0 - hy * hy)) - 24), outer = r1 + 24;
  const c0x = Math.floor((cp.x - outer) / 16), c1x = Math.floor((cp.x + outer) / 16), c0z = Math.floor((cp.z - outer) / 16), c1z = Math.floor((cp.z + outer) / 16);
  for (let ix = c0x; ix <= c1x; ix++) for (let iz = c0z; iz <= c1z; iz++) {
    const cx = (ix + 0.5) * 16 - cp.x, cz = (iz + 0.5) * 16 - cp.z, cd = Math.hypot(cx, cz);
    if (cd < inner - 12 || cd > outer + 12) continue;
    const list = G3.get(ix * 1e4 + iz);
    if (!list) continue;
    for (const t of list) {
      if (t.broken || (t.cell && !t.cell.vis)) continue;
      lodTree(t, lodF(t, cp, r0, r1));
    }
  }
  lodFlush();
}
var CULL = { on: true, cells: null, fr: null, pm: null, box: null, v: null, n: 0, vis: 0, flips: 0 };
function cullCells() {
  if (CULL.cells) return CULL.cells;
  const cells = [];
  for (const list of lodGrid().values()) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const t of list) {
      const r = t.h * 0.36 + 0.6;
      x0 = Math.min(x0, t.x - r); x1 = Math.max(x1, t.x + r);
      z0 = Math.min(z0, t.z - r); z1 = Math.max(z1, t.z + r);
      y0 = Math.min(y0, t.y - 0.6); y1 = Math.max(y1, t.y + t.h * 1.06 + 0.6);
    }
    const c = { list, vis: true, box: new THREE6.Box3(new V3(x0, y0, z0), new V3(x1, y1, z1)), cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hmax: y1 - y0 };
    for (const t of list) t.cell = c;
    cells.push(c);
  }
  return CULL.cells = cells;
}
/* раз в кадр перед рендером: cam — камера кадра, sun — направление НА солнце, shR — полуширина карты теней */
function cullForest(cam, sun, shR) {
  if (!LODS.length || !LODS[0].lists) return;
  const cells = cullCells();
  if (!CULL.fr) { CULL.fr = new THREE6.Frustum(); CULL.pm = new THREE6.Matrix4(); CULL.box = new THREE6.Box3(); CULL.v = new V3(); }
  if (!CULL.on) {
    // выключено (сравнение «до/после»): все клетки видимы
    let f = 0;
    for (const c of cells) if (!c.vis) { c.vis = true; f++; }
    if (f) updateForestLOD(true);
    return;
  }
  cam.updateWorldMatrix(true, false);
  CULL.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  CULL.fr.setFromProjectionMatrix(CULL.pm);
  const cp = cam.position, shOn = !!(Q.shadowTrees && sun && sun.y > 0.05), R2s = ((shR || 30) + 32) ** 2;
  const R = Q.treeNearR, band = Math.max(6, R * 0.16), r0 = R - band / 2, r1 = R + band / 2;
  let nv = 0, flips = 0;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    let v = CULL.fr.intersectsBox(c.box);
    if (!v && shOn) {
      // дерево вне кадра, но его тень может лечь в кадр: коробка, протянутая вдоль луча солнца до земли
      const dx = c.cx - cp.x, dz = c.cz - cp.z;
      if (dx * dx + dz * dz < R2s) {
        const s = Math.min(90, c.hmax / sun.y), B = CULL.box.copy(c.box);
        B.expandByPoint(CULL.v.set(c.box.min.x - sun.x * s, c.box.min.y - sun.y * s, c.box.min.z - sun.z * s));
        B.expandByPoint(CULL.v.set(c.box.max.x - sun.x * s, c.box.max.y - sun.y * s, c.box.max.z - sun.z * s));
        v = CULL.fr.intersectsBox(B);
      }
    }
    if (v) nv++;
    if (v === c.vis) continue;
    c.vis = v;
    flips++;
    for (const t of c.list) lodTree(t, v && !t.broken ? lodF(t, cp, r0, r1) : null);
  }
  CULL.vis = nv;
  CULL.n = cells.length;
  CULL.flips += flips;
  if (flips) lodFlush();
}
function saplingGeo() {
  return spruceVariant(555, 1).crown;
}
var R = 184;
var HS = 0.5;
var HN = Math.round(R * 2 / HS) + 1;
var DS = 1;
var DN = Math.round(R * 2 / DS) + 1;
var H = null;
var GD = null;
var FD = null;
function buildHeightCache() {
  H = new Float32Array(HN * HN);
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) H[j * HN + i] = terrainH(-R + i * HS, -R + j * HS);
  GD = new Float32Array(DN * DN);
  FD = new Float32Array(DN * DN);
  for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) FD[j * DN + i] = forestDensity(-R + i * DS, -R + j * DS);
  for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) GD[j * DN + i] = grassDensityExact(-R + i * DS, -R + j * DS);
}
function forestFast(x, z) {
  if (!FD || x <= -R || z <= -R || x >= R - DS || z >= R - DS) return forestDensity(x, z);
  const fx = (x + R) / DS, fz = (z + R) / DS, i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
  const a = FD[j * DN + i], b = FD[j * DN + i + 1], c = FD[(j + 1) * DN + i], d = FD[(j + 1) * DN + i + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}
function hFast(x, z) {
  if (!H || x <= -R || z <= -R || x >= R - HS || z >= R - HS) return terrainH(x, z);
  const fx = (x + R) / HS, fz = (z + R) / HS, i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
  const a = H[j * HN + i], b = H[j * HN + i + 1], c = H[(j + 1) * HN + i], d = H[(j + 1) * HN + i + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}
var GEX = /* @__PURE__ */ new Map();
function gexAdd(p) {
  const e = p.r ?? Math.hypot(p.hw, p.hd);
  for (let i = Math.floor((p.x - e) / 8); i <= Math.floor((p.x + e) / 8); i++) for (let j = Math.floor((p.z - e) / 8); j <= Math.floor((p.z + e) / 8); j++) {
    const k = i * 4096 + j;
    if (!GEX.has(k)) GEX.set(k, []);
    GEX.get(k).push(p);
  }
}
function grassBlocked(x, z) {
  const L = GEX.get(Math.floor(x / 8) * 4096 + Math.floor(z / 8));
  if (!L) return false;
  for (const p of L) if (p.r !== void 0 ? (x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r : padRectDist(p, x, z) < 0) return true;
  return false;
}
function grassDensity(x, z) {
  if (!GD || x <= -R || z <= -R || x >= R - DS || z >= R - DS) return grassDensityExact(x, z);
  const fx = (x + R) / DS, fz = (z + R) / DS, i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
  const a = GD[j * DN + i], b = GD[j * DN + i + 1], c = GD[(j + 1) * DN + i], d = GD[(j + 1) * DN + i + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}
function grassDensityExact(x, z) {
  const rho = 99;
  if (hgRho(x, z) < 0.985) return 0;
  const pi = pathInfluence(x, z, 0.4);
  if (pi > 0.5) return 0;
  const edge = pathInfluence(x, z, 1.6) > 0 ? 0.35 : 0;
  const td = trenchDist(x, z);
  if (td < 1.2) return 0;
  if (streamAt(x, z).d < STREAM_BW + 0.25) return 0;
  const bog2 = inBog(x, z);
  if (bog2 > 0.35) return 0;
  let d = (1 - (FD ? forestFast(x, z) : forestDensity(x, z))) * 0.85 + 0.12 + edge;
  d += (1 - smoothstep(1.05, 1.6, rho)) * 0.6;
  const e = edgeDist(x, z);
  if (e > MAP.PLAY + 0.3 && e < MAP.MINE1) return 0.05;
  if (e > MAP.FENCE && e < MAP.CUT) d += 0.35;
  d += inField(x, z) * 0.55;
  if (inPlan(x, z, 0.2)) d *= 0.25;
  for (const s of Object.values(SPAWNS)) if (Math.hypot(x - s.x, z - s.z) < 9) d *= 0.4;
  if (td < 2.2) d += 0.3;
  return clamp(d * (1 - bog2 * 2.2) * v22GrassK(x, z), 0, 1.3);
}
var PHYS = {ready:false,bodies:[],statics:new Map()};
var V0 = null;
var V1 = null;
var addStaticCollider = function(c){ if(c && !COLLIDERS.includes(c)) COLLIDERS.push(c); };
var removeStaticCollider = function(c){ if(c) c.dead = true; };
var BODY_IDX0 = 1e6;
var addBody = function(o){ return __addBody(o); };
var killBody = function(){};
function freezeBody(b) {
  if (!b?.body) return;
  const i = PHYS.bodies.indexOf(b);
  if (i >= 0) PHYS.bodies.splice(i, 1);
  if (V0) V0.setValue(0, 0, 0); /* v21: Ammo-векторы больше не создаются — раньше падение дерева роняло кадр исключением */
  if (V1) V1.setValue(0, 0, 0);
  b.body.setLinearVelocity(V0);
  b.body.setAngularVelocity(V1);
  b.body.setMassProps(0, V0);
  b.body.setCollisionFlags(b.body.getCollisionFlags() | 1);
  b.body.setActivationState(2);
  b.frozen = true;
}
var isSleeping = (b) => b?.body && !b.body.isActive();
var blastImpulse = function(){};
var rayCast = function(){ return null; };
var THREE8 = ctx.THREE;
var CH = 16;
var INNER = 176;
var TERRAIN = { chunks: [], mat: null };
function chunkStep(x0, z0) {
  const pad = 3.5, x1 = x0 + CH, z1 = z0 + CH;
  const inBox = (x, z) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad;
  for (const t of TRENCHES) for (const p of t.pts) if (inBox(p[0], p[1])) return Q.tex < 0.6 ? 0.32 : 0.25;
  for (const c of CRATERS) if (inBox(c.x, c.z)) return 0.5;
  for (const g of DIGS) if (inBox(g.x, g.z)) return 0.35;
  for (const st of STREAMS) for (let i = 0; i < st.pts.length; i += 2) if (inBox(st.pts[i][0], st.pts[i][1])) return 0.64;
  for (const b of BOGS) if (b.x > x0 - b.r - 2 && b.x < x1 + b.r + 2 && b.z > z0 - b.r - 2 && b.z < z1 + b.r + 2) return 0.6;
  for (const f of FORDS) for (let t = 0; t <= 1; t += 0.1) if (inBox(f.a[0] + (f.b[0] - f.a[0]) * t, f.a[1] + (f.b[1] - f.a[1]) * t)) return 0.6;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    const r = hgRho(x0 + i * 4, z0 + j * 4);
    if (r > 0.85 && r < 1.4) return 0.6;
    if (pathInfluence(x0 + i * 4, z0 + j * 4, 2) > 0) return 1;
  }
  for (const p of PADS) if (inBox(p.x, p.z)) return 0.8;
  let fd = 1;
  for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]]) fd = Math.min(fd, forestFast(x0 + i * CH, z0 + j * CH));
  if (fd > 0.55) return 1.6;
  if (fd > 0.3) return 1.15;
  return 1;
}
function aoAt(x, z, h) {
  let s = 0;
  for (const [dx, dz] of [[1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3], [0.9, 0.9], [-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9]]) s += Math.max(0, hFast(x + dx, z + dz) - h);
  return Math.max(0.42, 1 - s / 8 * 0.55);
}
function gridChunk(x0, z0, size, step, skirt) {
  const n2 = Math.round(size / step), s = size / n2;
  const N2 = n2 + 3;
  const H2 = new Float32Array(N2 * N2);
  for (let j = 0; j < N2; j++) for (let i = 0; i < N2; i++) H2[j * N2 + i] = terrainH(x0 + (i - 1) * s, z0 + (j - 1) * s);
  const V7 = n2 + 1, pos = [], nrm = [], spl = [], idx2 = [], ao = [];
  const sp = [0, 0, 0];
  for (let j = 0; j < V7; j++) for (let i = 0; i < V7; i++) {
    const x = x0 + i * s, z = z0 + j * s, gi = (j + 1) * N2 + (i + 1);
    pos.push(x, H2[gi], z);
    const nx = H2[gi - 1] - H2[gi + 1], nz = H2[gi - N2] - H2[gi + N2], ny = 2 * s, l = Math.hypot(nx, ny, nz);
    nrm.push(nx / l, ny / l, nz / l);
    splat(x, z, sp);
    spl.push(sp[0], sp[1], sp[2], forestDensity(x, z));
    ao.push(aoAt(x, z, H2[gi]));
  }
  for (let j = 0; j < n2; j++) for (let i = 0; i < n2; i++) {
    const a = j * V7 + i, b = a + 1, c = a + V7, d = c + 1;
    if ((i + j) % 2) idx2.push(a, c, b, b, c, d);
    else idx2.push(a, c, d, a, d, b);
  }
  if (skirt) {
    const edges = [];
    for (let i = 0; i < n2; i++) edges.push([i, 0, i + 1, 0], [i + 1, n2, i, n2], [0, i + 1, 0, i], [n2, i, n2, i + 1]);
    for (const [ia, ja, ib, jb] of edges) {
      const a = ja * V7 + ia, b = jb * V7 + ib, base2 = pos.length / 3;
      for (const k of [a, b]) {
        pos.push(pos[k * 3], pos[k * 3 + 1] - 1.2, pos[k * 3 + 2]);
        nrm.push(nrm[k * 3], nrm[k * 3 + 1], nrm[k * 3 + 2]);
        spl.push(spl[k * 4], spl[k * 4 + 1], spl[k * 4 + 2], spl[k * 4 + 3]);
        ao.push(ao[k]);
      }
      idx2.push(a, b, base2, b, base2 + 1, base2);
    }
  }
  const g = new THREE8.BufferGeometry();
  g.setAttribute("position", new THREE8.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE8.Float32BufferAttribute(nrm, 3));
  g.setAttribute("aSplat", new THREE8.Float32BufferAttribute(spl, 4));
  g.setAttribute("aAO", new THREE8.Float32BufferAttribute(ao, 1));
  g.setIndex(idx2);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
function outerRing() {
  const step = 6, R2 = MAP.WORLD, n2 = Math.ceil(R2 * 2 / step);
  const pos = [], nrm = [], spl = [], idx2 = [];
  const map = new Int32Array((n2 + 1) * (n2 + 1)).fill(-1);
  const inside = (x, z) => Math.max(Math.abs(x), Math.abs(z)) < INNER - step;
  const sp = [0, 0, 0];
  for (let j = 0; j <= n2; j++) for (let i = 0; i <= n2; i++) {
    const x = -R2 + i * step, z = -R2 + j * step;
    if (inside(x, z) && inside(x + step, z + step) && inside(x - step, z - step)) continue;
    map[j * (n2 + 1) + i] = pos.length / 3;
    const h = terrainH(x, z);
    pos.push(x, h - (edgeDist(x, z) < INNER + 1 ? 0.25 : 0), z);
    const nx = terrainH(x - 2, z) - terrainH(x + 2, z), nz = terrainH(x, z - 2) - terrainH(x, z + 2), l = Math.hypot(nx, 4, nz);
    nrm.push(nx / l, 4 / l, nz / l);
    splat(x, z, sp);
    spl.push(0, 0, sp[2], forestDensity(x, z));
  }
  const aoOuter = new Float32Array(pos.length / 3).fill(1);
  for (let j = 0; j < n2; j++) for (let i = 0; i < n2; i++) {
    const a = map[j * (n2 + 1) + i], b = map[j * (n2 + 1) + i + 1], c = map[(j + 1) * (n2 + 1) + i], d = map[(j + 1) * (n2 + 1) + i + 1];
    if (a < 0 || b < 0 || c < 0 || d < 0) continue;
    const cx = -R2 + (i + 0.5) * step, cz = -R2 + (j + 0.5) * step;
    if (Math.max(Math.abs(cx), Math.abs(cz)) < INNER - 0.5) continue;
    idx2.push(a, c, b, b, c, d);
  }
  const g = new THREE8.BufferGeometry();
  g.setAttribute("position", new THREE8.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE8.Float32BufferAttribute(nrm, 3));
  g.setAttribute("aSplat", new THREE8.Float32BufferAttribute(spl, 4));
  g.setAttribute("aAO", new THREE8.BufferAttribute(aoOuter, 1));
  g.setIndex(idx2);
  g.computeBoundingSphere();
  return g;
}
function groundMaterial() {
  const m = new THREE8.MeshStandardMaterial({ color: 16777215, roughness: 0.95, metalness: 0 });
  const U = {
    tFloor: { value: TEX.floor.map },
    tFloorN: { value: TEX.floor.normal },
    tPath: { value: TEX.path.map },
    tPathN: { value: TEX.path.normal },
    tMud: { value: TEX.mud.map },
    tMudN: { value: TEX.mud.normal },
    tDug: { value: TEX.dug.map },
    tDugN: { value: TEX.dug.normal },
    uWet: { value: 0 }
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    Object.assign(sh.uniforms, FXU);
    sh.vertexShader = "attribute vec4 aSplat;\nattribute float aAO;\nvarying vec4 vSplat;\nvarying vec3 vWPos;\nvarying vec3 vWN;\nvarying float vAO;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvSplat = aSplat;\nvAO = aAO;\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);");
    sh.fragmentShader = /* glsl */
    `
      uniform sampler2D tFloor, tFloorN, tPath, tPathN, tMud, tMudN, tDug, tDugN;
      uniform float uWet;
      varying vec4 vSplat; varying vec3 vWPos; varying vec3 vWN; varying float vAO;
      ${FXU_GLSL}
      vec4 gBurn; float gPuddle; float gWetK; vec2 gRipple;
      float gHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float gNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(gHash(i), gHash(i+vec2(1,0)), f.x), mix(gHash(i+vec2(0,1)), gHash(i+vec2(1,1)), f.x), f.y); }
      vec3 gW; float gMacro;
    ` + sh.fragmentShader.replace(
      "#include <map_fragment>",
      /* glsl */
      `
        vec2 wuv = vWPos.xz;
        float macro = gNoise(wuv * 0.018) * 0.6 + gNoise(wuv * 0.07) * 0.4;
        gMacro = macro;
        vec3 cF = texture2D(tFloor, wuv * 0.21).rgb;
        vec3 cF2 = texture2D(tFloor, wuv * 0.047 + 0.37).rgb;
        cF = mix(cF, cF2, 0.4 + 0.3 * (macro - 0.5));
        // мох на открытых местах, сухая рыжая хвоя под плотными кронами
        float canopy = vSplat.w;
        vec3 moss = vec3(0.075, 0.105, 0.035);
        vec3 needles = vec3(0.16, 0.085, 0.035);
        cF = mix(cF, cF * moss / 0.07, smoothstep(0.45, 0.8, macro) * (1.0 - canopy) * 0.55);
        cF = mix(cF, cF * needles / 0.1, smoothstep(0.5, 0.9, canopy) * 0.35);
        vec3 cP = texture2D(tPath, wuv * 0.33).rgb;
        vec3 cM = texture2D(tMud, wuv * 0.28).rgb;
        vec3 cD = texture2D(tDug, wuv * 0.3).rgb;
        // шум на границах слоёв: переходы рваные, а не градиентные
        float edgeN = gNoise(wuv * 0.9) - 0.5;
        float wP = smoothstep(0.15, 0.75, vSplat.x + edgeN * 0.35);
        float wM = smoothstep(0.1, 0.8, vSplat.y + edgeN * 0.3);
        float wD = smoothstep(0.1, 0.7, vSplat.z + edgeN * 0.4);
        vec3 col = cF;
        col = mix(col, cD, wD);
        col = mix(col, cP, wP);
        col = mix(col, cM, wM);
        gW = vec3(wP, wM, wD);
        // затопленный берег темнее, дно под водой — ещё темнее
        col *= mix(1.0, 0.55, smoothstep(0.35, 0.95, vSplat.y) * (1.0 - wP));
        // гарь: копоть с пятнами пепла
        gBurn = burnAt(wuv);
        float ash = gNoise(wuv * 2.3);
        col = mix(col, mix(vec3(0.028, 0.025, 0.022), vec3(0.16, 0.15, 0.14), smoothstep(0.62, 0.9, ash) * 0.6), gBurn.r * 0.92);
        // мокрая земля темнее; лужи — в колеях, низинах, воронках и на дне окопов
        gWetK = uWetG * (1.0 - smoothstep(0.35, 0.9, vSplat.w) * 0.35);
        float low = smoothstep(0.92, 0.6, vAO);
        float pn = gNoise(wuv * 0.23) * 0.65 + gNoise(wuv * 0.9) * 0.35;
        gPuddle = smoothstep(0.58, 0.68, pn + low * 0.28 + wP * 0.12 + wD * 0.1 + gBurn.b * 0.6) * smoothstep(0.25, 0.8, uWetG) * (1.0 - wM * 0.5);
        col *= mix(1.0, 0.6 - wP * 0.1, gWetK);
        col = mix(col, col * vec3(0.55, 0.52, 0.5) + vec3(0.012, 0.014, 0.016), gPuddle);
        diffuseColor.rgb *= col;
        diffuseColor.rgb *= mix(1.0, vAO, 0.55);
      `
    ).replace(
      "#include <roughnessmap_fragment>",
      /* glsl */
      `
        float roughnessFactor = roughness;
        roughnessFactor = mix(roughnessFactor, 0.82, gW.x);
        roughnessFactor = mix(roughnessFactor, 0.48 - uWet * 0.2, smoothstep(0.4, 1.0, gW.y));
        roughnessFactor = mix(roughnessFactor, 0.97, gW.z);
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.5, gWetK);
        roughnessFactor = mix(roughnessFactor, 0.04, gPuddle);
      `
    ).replace(
      "#include <normal_fragment_maps>",
      /* glsl */
      `
        {
          vec2 wuv = vWPos.xz;
          vec3 nF = texture2D(tFloorN, wuv * 0.21).xyz * 2.0 - 1.0;
          vec3 nP = texture2D(tPathN, wuv * 0.33).xyz * 2.0 - 1.0;
          vec3 nM = texture2D(tMudN, wuv * 0.28).xyz * 2.0 - 1.0;
          vec3 nD = texture2D(tDugN, wuv * 0.3).xyz * 2.0 - 1.0;
          vec3 nt = nF;
          nt = mix(nt, nD, gW.z); nt = mix(nt, nP, gW.x); nt = mix(nt, nM * vec3(0.6, 0.6, 1.0), gW.y);
          vec3 nW = normalize(normalize(vWN) + vec3(nt.x, 0.0, nt.y) * 0.9 * (1.0 - gPuddle * 0.9));
          // капли по лужам: расходящиеся кольца в ячейках со случайной фазой
          if (gPuddle > 0.01 && uRain > 0.01) {
            vec2 rp = vec2(0.0);
            for (int k = 0; k < 2; k++) {
              vec2 cuv = wuv * (2.6 + float(k) * 1.7) + float(k) * 7.3;
              vec2 ci = floor(cuv), cf = fract(cuv) - 0.5;
              float h = gHash(ci + float(k) * 13.0);
              vec2 o = vec2(gHash(ci + 3.1), gHash(ci + 5.7)) - 0.5;
              float ph = fract(uFxT * (0.9 + h * 0.6) + h);
              vec2 d = cf - o * 0.6; float r = length(d);
              float ring = sin((r - ph * 0.5) * 60.0) * smoothstep(0.0, 0.05, ph * 0.5 - r + 0.05) * (1.0 - ph) * step(h, uRain * 0.9 + 0.1);
              rp += d / max(r, 1e-3) * ring;
            }
            nW = normalize(nW + vec3(rp.x, 0.0, rp.y) * 0.35 * gPuddle);
          }
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }
      `
    ).replace(
      "#include <aomap_fragment>",
      /* glsl */
      `
        reflectedLight.indirectDiffuse *= vAO;
        reflectedLight.indirectSpecular *= mix(vAO, 1.0, gPuddle * 0.6);
      `
    ).replace(
      "#include <emissivemap_fragment>",
      /* glsl */
      `
        // тлеющие угли: мерцают под пеплом, ночью заметно подсвечивают землю
        float emb = gBurn.g * (0.6 + 0.4 * sin(uFxT * 7.0 + gNoise(vWPos.xz * 3.0) * 12.0)) * smoothstep(0.45, 0.85, gNoise(vWPos.xz * 4.3 + uFxT * 0.2));
        totalEmissiveRadiance += vec3(1.0, 0.3, 0.05) * emb * emb * 1.4;
        // каустики: пляшущая сетка света на дне у берега
        float uw = clamp((${MAP.WATER_Y.toFixed(3)} - vWPos.y) * 3.0, 0.0, 1.0) * clamp(1.0 - (${MAP.WATER_Y.toFixed(3)} - vWPos.y) * 0.35, 0.0, 1.0);
        if (uw > 0.0 && uCaus > 0.0) {
          vec2 cp = vWPos.xz * 0.9;
          float c1 = abs(sin(cp.x * 2.1 + sin(cp.y * 1.7 + uFxT * 0.9) * 1.6 + uFxT * 0.7));
          float c2 = abs(sin(cp.y * 2.3 + sin(cp.x * 1.3 - uFxT * 0.8) * 1.8 - uFxT * 0.6));
          float caus = pow(1.0 - min(c1, c2), 6.0);
          totalEmissiveRadiance += diffuseColor.rgb * caus * uw * uCaus * 2.5;
        }
      `
    );
  };
  m.customProgramCacheKey = () => "ground-v2";
  return m;
}
function buildTerrain() {
  const mat = groundMaterial();
  TERRAIN.mat = mat;
  // куски 16 м сшиваются по 3×3 в один меш (48 м): в разы меньше вызовов отрисовки,
  // юбки между кусками разного шага остаются внутри — щелей нет, отсечение по пирамиде работает
  const groups = /* @__PURE__ */ new Map();
  for (let z0 = -INNER; z0 < INNER; z0 += CH) for (let x0 = -INNER; x0 < INNER; x0 += CH) {
    const step = chunkStep(x0, z0);
    const g = gridChunk(x0, z0, CH, step, true);
    const k = Math.floor((x0 + INNER) / (CH * 6)) * 64 + Math.floor((z0 + INNER) / (CH * 6));
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(g);
  }
  for (const geos of groups.values()) {
    const g = geos.length > 1 ? BGU.mergeGeometries(geos, false) : geos[0];
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const mesh = new THREE8.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.name = "terrain";
    scene.add(mesh);
    TERRAIN.chunks.push(mesh);
  }
  const outer = new THREE8.Mesh(outerRing(), mat);
  outer.receiveShadow = true;
  outer.name = "terrain_outer";
  scene.add(outer);
  TERRAIN.chunks.push(outer);
}
var THREE9 = ctx.THREE;
var WEATHER = {
  mode: "clear",
  auto: true,
  next: 240,
  ov: 0.05,
  rain: 0,
  storm: 0,
  fogK: 0,
  wet: 0,
  flash: 0,
  flashDir: new THREE9.Vector3(0, 1, 0),
  onStrike: null,
  strikes: 0
};
var THREE11 = ctx.THREE;
var GRASS = { im: null, center: new THREE11.Vector2(1e9, 1e9), count: 0, cap: 1 };
function clumpGeo(planes, w, h, segs = 2) {
  const parts = [];
  for (let p = 0; p < planes; p++) {
    const g = new THREE11.PlaneGeometry(w, h, 1, segs);
    g.translate(0, h / 2, 0);
    g.rotateY(p / planes * Math.PI + 0.2);
    const n2 = g.attributes.normal;
    for (let i = 0; i < n2.count; i++) n2.setXYZ(i, n2.getX(i) * 0.3, 0.9, n2.getZ(i) * 0.3);
    parts.push(g);
  }
  const merged = new THREE11.BufferGeometry();
  const pos = [], nrm = [], uv = [], idx2 = [];
  let off = 0;
  for (const g of parts) {
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
    uv.push(...g.attributes.uv.array);
    for (const i of g.index.array) idx2.push(i + off);
    off += g.attributes.position.count;
  }
  merged.setAttribute("position", new THREE11.Float32BufferAttribute(pos, 3));
  merged.setAttribute("normal", new THREE11.Float32BufferAttribute(nrm, 3));
  merged.setAttribute("uv", new THREE11.Float32BufferAttribute(uv, 2));
  merged.setIndex(idx2);
  return merged;
}
function tuftGeo(blades = Q.tex > 0.9 ? 17 : 15, segs = Q.tex > 0.6 ? 4 : 3, wMul = 1) {
  // пучок: тонкие заострённые листья разной длины, изогнутые и чуть закрученные;
  // низ пучка темнее (затенение), кончики — светлее и суше
  const pos = [], nrm = [], col = [], idx2 = [];
  let v = 0;
  const R2 = (k) => {
    const x = Math.sin(k * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let b = 0; b < blades; b++) {
    const a = R2(b) * Math.PI * 2, rr = Math.sqrt(R2(b + 17)) * 0.1;
    const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
    const short = R2(b + 5) < 0.45;
    const h = short ? 0.1 + R2(b + 31) * 0.14 : 0.2 + R2(b + 31) * 0.28, w = (0.0078 + R2(b + 43) * 0.009) * wMul;
    const lean = 0.2 + R2(b + 57) * 0.55, la = a + (R2(b + 71) - 0.5) * 1.1, twist = (R2(b + 91) - 0.5) * 1.4;
    const lx = Math.cos(la), lz = Math.sin(la);
    const dry = R2(b + 83), hue = R2(b + 13);
    for (let k = 0; k <= segs; k++) {
      const t = k / segs, y = h * (t - lean * 0.35 * t * t), off = lean * h * t * t;
      const cx = bx + lx * off, cz = bz + lz * off, ww = w * (1 - Math.pow(t, 1.6)) + 4e-4;
      const ang = la + Math.PI / 2 + twist * t, sx = Math.cos(ang), sz = Math.sin(ang);
      for (const e of [-1, 1]) {
        pos.push(cx + sx * ww * e, y, cz + sz * ww * e);
        nrm.push(lx * (0.25 + t * 0.35) + sx * e * 0.3, 0.8, lz * (0.25 + t * 0.35) + sz * e * 0.3);
        const ao = 0.28 + 0.72 * Math.pow(t, 0.8), tip = dry * t * t;
        col.push(ao * (0.5 + hue * 0.14 + tip * 0.5), ao * (0.8 + hue * 0.1 + tip * 0.02), ao * (0.3 + hue * 0.06 - tip * 0.12));
      }
      if (k < segs) {
        const q = v + k * 2;
        idx2.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      }
    }
    v += (segs + 1) * 2;
    if (!short && R2(b + 97) > 0.86) {
      // метёлка на стебле
      const tx = bx + lx * lean * h, tz = bz + lz * lean * h, L = 0.05 + R2(b + 101) * 0.04, sw = 0.01, sx = -lz, sz = lx;
      for (const [ex, ez] of [[sx, sz], [lx, lz]]) {
        const q = v;
        pos.push(tx - ex * sw, h * 0.92, tz - ez * sw, tx + ex * sw, h * 0.92, tz + ez * sw, tx + lx * 0.02 - ex * sw * 0.4, h * 0.92 + L, tz + lz * 0.02 - ez * sw * 0.4, tx + lx * 0.02 + ex * sw * 0.4, h * 0.92 + L, tz + lz * 0.02 + ez * sw * 0.4);
        for (let r = 0; r < 4; r++) {
          nrm.push(lx * 0.3, 0.9, lz * 0.3);
          col.push(0.66, 0.6, 0.4);
        }
        idx2.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
        v += 4;
      }
    }
  }
  const g = new THREE11.BufferGeometry();
  g.setAttribute("position", new THREE11.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE11.Float32BufferAttribute(nrm, 3));
  g.setAttribute("color", new THREE11.Float32BufferAttribute(col, 3));
  g.setIndex(idx2);
  g.computeBoundingSphere();
  return g;
}
var dryPatch = (x, z) => 0.75 * smoothstep(0.5, 0.78, vnoise(x * 0.045 + 11, z * 0.045 - 7)) + 0.25 * smoothstep(0.55, 0.8, vnoise(x * 0.17 - 3, z * 0.17 + 5));
var TUFTS = { im: null, center: new THREE11.Vector2(1e9, 1e9), count: 0, R: 12 };
function buildGrass() {
  injectWind(M.grass, { amp: 0.16, stiff: 1.6, refH: 0.8, flutter: 0.04, trample: true, blast: 1.4, burn: true });
  const im3 = new THREE11.InstancedMesh(clumpGeo(3, 0.62, 0.62), M.grass, Q.grass);
  im3.count = 0;
  im3.frustumCulled = false;
  im3.receiveShadow = true;
  im3.castShadow = false;
  im3.instanceMatrix.setUsage(THREE11.DynamicDrawUsage);
  im3.name = "grass";
  scene.add(im3);
  NO_REFLECT.push(im3);
  GRASS.im = im3;
  M.blades = new THREE11.MeshStandardMaterial({ vertexColors: true, side: THREE11.DoubleSide, roughness: 0.72, metalness: 0, color: 7903562 });
  // лёгкое «просвечивание» листа
  M.blades.emissive = new THREE11.Color(724231);
  injectWind(M.blades, { amp: 0.14, stiff: 1.5, refH: 0.6, flutter: 0.05, trample: true, blast: 1.5, burn: true });
  TUFTS.R = Math.round(9 + 7 * Q.tex);
  const n2 = Q.tufts === false ? 1 : Math.round(Q.grass * 0.28);
  const tim = new THREE11.InstancedMesh(tuftGeo(), M.blades, n2);
  tim.count = 0;
  tim.frustumCulled = false;
  tim.receiveShadow = true;
  // тень от пучков почти не видна в каскадах, а стоила ~0.9 млн треугольников за кадр
  tim.castShadow = false;
  tim.instanceMatrix.setUsage(THREE11.DynamicDrawUsage);
  tim.name = "grass_tufts";
  scene.add(tim);
  NO_REFLECT.push(tim);
  TUFTS.im = tim;
  TUFTS.max = n2;
  // дальний пучок (за ~8 м): 8 широких листьев по 2 сегмента вместо 17×4 — разница на таком расстоянии не видна
  const tlo = new THREE11.InstancedMesh(tuftGeo(8, 2, 1.7), M.blades, n2);
  tlo.count = 0;
  tlo.frustumCulled = false;
  tlo.receiveShadow = true;
  tlo.castShadow = false;
  tlo.instanceMatrix.setUsage(THREE11.DynamicDrawUsage);
  tlo.name = "grass_tufts_lo";
  scene.add(tlo);
  NO_REFLECT.push(tlo);
  TUFTS.lo = tlo;
  TUFTS.RN = TUFTS.R * 0.4;
  refreshGrass(true);
}
var _m2 = new THREE11.Matrix4();
var _q3 = new THREE11.Quaternion();
var _p = new THREE11.Vector3();
var _s = new THREE11.Vector3();
var _c = new THREE11.Color();
var _up2 = new THREE11.Vector3(0, 1, 0);
function runGrassJob(T, make, budget) {
  if (make) T.job = make();
  if (!T.job) return;
  const t0 = performance.now();
  for (;;) {
    if (T.job.next().done) {
      T.job = null;
      return;
    }
    if (performance.now() - t0 > budget) return;
  }
}
function commitInstances(im3, M2, C, n2) {
  if (!im3.instanceColor) im3.setColorAt(0, _c);
  im3.instanceMatrix.array.set(M2.subarray(0, n2 * 16));
  im3.instanceColor.array.set(C.subarray(0, n2 * 3));
  im3.count = n2;
  im3.instanceMatrix.clearUpdateRanges();
  im3.instanceMatrix.addUpdateRange(0, Math.max(1, n2) * 16);
  im3.instanceMatrix.needsUpdate = true;
  im3.instanceColor.clearUpdateRanges();
  im3.instanceColor.addUpdateRange(0, Math.max(1, n2) * 3);
  im3.instanceColor.needsUpdate = true;
}
function* tuftJob(cx, cz) {
  const T = TUFTS, im3 = T.im;
  const M2 = T.stM ??= new Float32Array(im3.instanceMatrix.array.length), C = T.stC ??= new Float32Array(im3.instanceMatrix.count * 3);
  const M3 = T.stM2 ??= new Float32Array(im3.instanceMatrix.array.length), C3 = T.stC2 ??= new Float32Array(im3.instanceMatrix.count * 3);
  const RN2 = T.RN * T.RN;
  let n3 = 0, nT = 0;
  const max = Math.max(1, Math.round(T.max * GRASS.cap));
  const R2 = T.R, step = Math.sqrt(Math.PI * R2 * R2 / max) * 0.95;
  let n2 = 0, cells = 0;
  const i0 = Math.floor((cx - R2) / step), i1 = Math.floor((cx + R2) / step), j0 = Math.floor((cz - R2) / step), j1 = Math.floor((cz + R2) / step);
  for (let i = i0; i <= i1 && nT < max; i++) for (let j = j0; j <= j1 && nT < max; j++) {
    if ((++cells & 255) === 0) yield;
    const h1 = hash2(i + 501, j - 77), h2 = hash2(j + 913, i + 41), h3 = hash2(i * 5 - 3, j * 3 + 11);
    const x = (i + h1) * step, z = (j + h2) * step, dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
    if (d2 > R2 * R2) continue;
    const dens = grassDensity(x, z);
    // пореже и ниже: трава по щиколотку-колено, а не стеной
    if (h3 > dens * (0.18 + (1 - d2 / (R2 * R2)) * 0.5)) continue;
    if (GEX.size && grassBlocked(x, z)) continue;
    const e = edgeDist(x, z);
    const tall = e > MAP.PLAY - 2 && e < MAP.FENCE ? 1.25 : lakeRho(x, z) < 1.5 ? 1.12 : 1;
    const sc = lerp(0.65, 1.15, hash2(i + 3, j + 7)) * tall;
    _p.set(x, hFast(x, z) - 0.02, z);
    _q3.setFromAxisAngle(_up2, h1 * TAU);
    _s.set(sc, sc * lerp(0.75, 1.25, h2), sc);
    const nearT = d2 < RN2, MM = nearT ? M2 : M3, CC = nearT ? C : C3, ni = nearT ? n2 : n3;
    _m2.compose(_p, _q3, _s).toArray(MM, ni * 16);
    const dry = Math.max(tall > 1.4 ? 0.5 : (1 - forestFast(x, z)) * 0.25, dryPatch(x, z)), v = lerp(0.85, 1.12, h3);
    CC[ni * 3] = v * lerp(0.93, 1.32, dry);
    CC[ni * 3 + 1] = v * lerp(0.93, 0.95, dry);
    CC[ni * 3 + 2] = v * lerp(0.86, 0.62, dry);
    if (nearT) n2++;
    else n3++;
    nT++;
  }
  commitInstances(im3, M2, C, n2);
  commitInstances(T.lo, M3, C3, n3);
  T.count = nT;
}
function refreshTufts(force, cx, cz) {
  const T = TUFTS;
  if (!T.im) return;
  const dx = T.center.x - cx, dz = T.center.y - cz;
  if (force || !T.job && dx * dx + dz * dz >= 1.8 * 1.8) {
    T.center.set(cx, cz);
    runGrassJob(T, () => tuftJob(cx, cz), force || T.im.count === 0 ? Infinity : 1);
  } else if (T.job) runGrassJob(T, null, 1);
}
function* grassJob(cx, cz) {
  const im3 = GRASS.im, R2 = Q.grassR;
  const M2 = GRASS.stM ??= new Float32Array(im3.instanceMatrix.array.length), C = GRASS.stC ??= new Float32Array(im3.instanceMatrix.count * 3);
  const maxG = Math.round(Q.grass * GRASS.cap);
  const step = Math.sqrt(Math.PI * R2 * R2 / maxG) * 0.92;
  const RN = TUFTS.R * 0.55;
  let n2 = 0, cells = 0;
  const i0 = Math.floor((cx - R2) / step), i1 = Math.floor((cx + R2) / step);
  const j0 = Math.floor((cz - R2) / step), j1 = Math.floor((cz + R2) / step);
  for (let i = i0; i <= i1 && n2 < maxG; i++) for (let j = j0; j <= j1 && n2 < maxG; j++) {
    if ((++cells & 511) === 0) yield;
    const h1 = hash2(i, j), h2 = hash2(j + 77, i - 31), h3 = hash2(i * 3 + 5, j * 7 - 2);
    const x = (i + h1) * step, z = (j + h2) * step;
    const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
    if (d2 > R2 * R2) continue;
    if (Q.tufts !== false && d2 < RN * RN && h1 < 0.55) continue;
    const fade = 1 - d2 / (R2 * R2);
    const dens = grassDensity(x, z);
    if (h3 > dens * (0.22 + fade * 0.5)) continue;
    if (GEX.size && grassBlocked(x, z)) continue;
    const y = hFast(x, z);
    const e = edgeDist(x, z);
    const tall = e > MAP.PLAY - 2 && e < MAP.FENCE ? 1.3 : lakeRho(x, z) < 1.5 ? 1.12 : 1;
    const sc = lerp(0.42, 0.9, hash2(i + 9, j + 13)) * tall;
    _p.set(x, y - 0.03, z);
    _q3.setFromAxisAngle(_up2, h1 * TAU);
    _s.set(sc, sc * lerp(0.7, 1.2, h2), sc);
    _m2.compose(_p, _q3, _s).toArray(M2, n2 * 16);
    const dry = Math.max(tall > 1.5 ? 0.55 : (1 - forestFast(x, z)) * 0.25, dryPatch(x, z));
    const v = lerp(0.8, 1.1, h3);
    C[n2 * 3] = v * lerp(0.88, 1.28, dry);
    C[n2 * 3 + 1] = v * lerp(0.9, 0.96, dry);
    C[n2 * 3 + 2] = v * lerp(0.76, 0.58, dry);
    n2++;
  }
  commitInstances(im3, M2, C, n2);
  GRASS.count = n2;
}
function refreshGrass(force) {
  const im3 = GRASS.im;
  if (!im3) return;
  const cx = camera.position.x, cz = camera.position.z;
  const agl = camera.position.y - hFast(cx, cz);
  if (agl > 55) {
    if (im3.count) {
      im3.count = 0;
      TUFTS.im.count = 0;
      TUFTS.lo.count = 0;
    }
    GRASS.job = TUFTS.job = null;
    GRASS.center.set(1e9, 1e9);
    TUFTS.center.set(1e9, 1e9);
    return;
  }
  if (agl < 25 && Q.tufts !== false) refreshTufts(force, cx, cz);
  else if (TUFTS.im.count || TUFTS.lo.count) {
    TUFTS.im.count = 0;
    TUFTS.lo.count = 0;
    TUFTS.job = null;
    TUFTS.center.set(1e9, 1e9);
  }
  const R2 = Q.grassR, dx = GRASS.center.x - cx, dz = GRASS.center.y - cz;
  // с высоты травы нет вовсе — первый набор собираем сразу, иначе вокруг будет «лысое» пятно
  if (force || !GRASS.job && dx * dx + dz * dz >= (R2 * 0.22) ** 2) {
    GRASS.center.set(cx, cz);
    runGrassJob(GRASS, () => grassJob(cx, cz), force || im3.count === 0 ? Infinity : 1.5);
  } else if (GRASS.job) runGrassJob(GRASS, null, 1.5);
}
var TILE = 64;
var FLORA = { tiles: [], drawn: 0 };
var BUSHES = /* @__PURE__ */ new Map();
function scatter(R2, count, mat, geo, test, scale, tint, o = {}) {
  const buckets = /* @__PURE__ */ new Map();
  let placed = 0;
  for (let k = 0; k < count * 6 && placed < count; k++) {
    const x = R2.range(-MAP.FENCE, MAP.FENCE), z = R2.range(-MAP.FENCE, MAP.FENCE);
    if (!test(x, z)) continue;
    if (!o.v22keep && v22Clear(x, z) > 0.3) {
      placed++;
      continue;
    }
    const key2 = Math.floor(x / TILE) * 64 + Math.floor(z / TILE);
    if (!buckets.has(key2)) buckets.set(key2, []);
    const rec = [x, z, R2.range(scale[0], scale[1]), R2.range(0, TAU), R2.range(0.8, 1.15), R2.range(0.75, 1.15)];
    buckets.get(key2).push(rec);
    if (o.record) {
      const k2 = Math.floor(x / 4) * 4096 + Math.floor(z / 4);
      if (!BUSHES.has(k2)) BUSHES.set(k2, []);
      BUSHES.get(k2).push([x, z, rec[2]]);
    }
    placed++;
  }
  for (const pts of buckets.values()) {
    const im3 = new THREE11.InstancedMesh(geo, mat, pts.length);
    let cx = 0, cz = 0;
    pts.forEach(([x, z, s, a, sy, v], i) => {
      _p.set(x, hFast(x, z) - (o.sink ?? 0.04), z);
      _q3.setFromAxisAngle(_up2, a);
      _s.set(s, s * sy, s);
      _m2.compose(_p, _q3, _s);
      im3.setMatrixAt(i, _m2);
      const t = typeof tint === "function" ? tint(x, z, v) : tint;
      _c.setRGB(v * t[0], v * t[1], v * t[2]);
      im3.setColorAt(i, _c);
      cx += x;
      cz += z;
    });
    im3.computeBoundingSphere();
    im3.receiveShadow = true;
    im3.castShadow = !!o.cast;
    im3.frustumCulled = true;
    im3.name = o.name || "flora";
    scene.add(im3);
    NO_REFLECT.push(im3);
    FLORA.tiles.push({ im: im3, x: cx / pts.length, z: cz / pts.length, far: o.far ?? Infinity });
  }
  return placed;
}
function buildUndergrowth() {
  const R2 = rng(4242);
  injectWind(M.fern, { amp: 0.12, stiff: 1.5, refH: 0.9, flutter: 0.05, trample: true, blast: 1.2, burn: true });
  injectWind(M.shrub, { amp: 0.05, stiff: 1.5, refH: 0.5, flutter: 0.03, trample: true, blast: 1, burn: true });
  const smallFar = Q.floraR;
  scatter(R2, Math.round(9e3 * Q.ferns), M.fern, fernGeo(), (x, z) => {
    const d = forestFast(x, z);
    return R2() < d * 0.9 && isFree(x, z, 0.4, { pathPad: 0.2, trenchPad: 0.8 }) && !treeNear(x, z, 0.4) && edgeDist(x, z) < MAP.PLAY - 1;
  }, [0.7, 1.3], [0.95, 1, 0.9], { far: smallFar + 20, name: "ferns" });
  scatter(R2, Math.round(7e3 * Q.ferns), M.shrub, clumpGeo(2, 0.7, 0.42, 1), (x, z) => {
    const d = forestFast(x, z);
    return R2() < 0.25 + d * 0.5 && isFree(x, z, 0.35, { pathPad: 0.2, trenchPad: 0.8 }) && !treeNear(x, z, 0.3);
  }, [0.7, 1.4], [1, 1, 1], { far: smallFar, name: "shrub" });
  const sap = saplingGeo();
  scatter(R2, Math.round(1400 * Q.trees), M.spruce, sap, (x, z) => {
    const d = forestFast(x, z);
    return R2() < d * 0.7 && isFree(x, z, 0.6, { pathPad: 0.8, trenchPad: 1.2 }) && !treeNear(x, z, 1.2) && edgeDist(x, z) < MAP.FENCE;
  }, [1.2, 3.2], [0.8, 0.95, 0.85], { name: "saplings", far: 70 });
  buildFlora(R2);
}
function buildFlora(R2) {
  M.bush = new THREE11.MeshStandardMaterial({ map: M.birch.map, alphaTest: 0.5, side: THREE11.DoubleSide, roughness: 0.85, metalness: 0, vertexColors: true });
  M.bush.emissive = new THREE11.Color(725510);
  injectWind(M.bush, { amp: 0.16, stiff: 1.6, refH: 2.2, flutter: 0.05, trample: true, blast: 1, burn: true });
  M.flora = new THREE11.MeshStandardMaterial({ vertexColors: true, side: THREE11.DoubleSide, roughness: 0.8, metalness: 0 });
  M.flora.emissive = new THREE11.Color(527365);
  injectWind(M.flora, { amp: 0.12, stiff: 1.5, refH: 0.8, flutter: 0.06, trample: true, blast: 1.4, burn: true });
  scatter(R2, Math.round(900 * VEG), M.bush, bushGeo(), (x, z) => {
    const d = forestFast(x, z), rho = lakeRho(x, z);
    const edge = d > 0.25 && d < 0.7 ? 0.5 : 0.08, shore = rho > 1.05 && rho < 1.45 ? 0.7 : 0;
    return R2() < Math.max(edge, shore) && isFree(x, z, 1, { pathPad: 0.8, trenchPad: 1.4 }) && !treeNear(x, z, 1.1) && edgeDist(x, z) < MAP.PLAY - 2;
  }, [0.8, 1.5], (x, z, v) => lakeRho(x, z) < 1.5 ? [0.72, 0.86, 0.6] : [0.86, 0.95, 0.66], { name: "bushes", sink: 0.1, record: true });
  const fl = Q.flora;
  const light = (x, z) => 1 - forestFast(x, z);
  scatter(R2, Math.round(2600 * fl), M.flora, fireweedGeo(), (x, z) => {
    const e = edgeDist(x, z), mine = e > MAP.PLAY - 2 && e < MAP.FENCE;
    return R2() < (mine ? 0.6 : light(x, z) * 0.35) && isFree(x, z, 0.3, { pathPad: 0.4, trenchPad: 1 }) && !treeNear(x, z, 0.5) && lakeRho(x, z) > 1.15;
  }, [0.75, 1.3], [1, 1, 1], { far: Q.floraR, name: "fireweed" });
  const kinds = [[15921122, 15253552], [6976720, 4870824], [13066366, 11027558], [15251514, 13933088]];
  kinds.forEach(([petal, heart], i) => {
    scatter(R2, Math.round(2200 * fl), M.flora, flowerGeo(petal, heart, i), (x, z) => {
      return R2() < light(x, z) * 0.55 + (lakeRho(x, z) < 1.6 ? 0.2 : 0) && grassDensity(x, z) > 0.35 && isFree(x, z, 0.2, { pathPad: 0.2, trenchPad: 0.9 }) && lakeRho(x, z) > 1.08;
    }, [0.8, 1.25], [1, 1, 1], { far: Q.floraR * 0.6, name: "flowers" });
  });
  scatter(R2, Math.round(3e3 * fl), M.flora, weedGeo(), (x, z) => {
    const e = edgeDist(x, z);
    return R2() < (e > MAP.PLAY - 2 && e < MAP.FENCE ? 0.7 : 0.3) && grassDensity(x, z) > 0.25 && isFree(x, z, 0.2, { pathPad: 0.1, trenchPad: 0.9 });
  }, [0.8, 1.4], [1, 1, 1], { far: Q.floraR * 0.8, name: "weeds" });
}
var VG = class {
  constructor() {
    this.p = [];
    this.n = [];
    this.c = [];
    this.uv = [];
    this.i = [];
  }
  quad(a, b, c, d, col, nrm = [0, 1, 0], uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const o = this.p.length / 3;
    for (const [k, v] of [a, b, c, d].entries()) {
      this.p.push(...v);
      this.n.push(...nrm);
      this.c.push(...Array.isArray(col[0]) ? col[k] : col);
      this.uv.push(...uv[k]);
    }
    this.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  /** Стебель: узкая лента от a до b (две скрещённые). */
  stem(a, b, w, c0, c1) {
    for (const r of [0, Math.PI / 2]) {
      const dx = Math.cos(r) * w, dz = Math.sin(r) * w;
      this.quad([a[0] - dx, a[1], a[2] - dz], [a[0] + dx, a[1], a[2] + dz], [b[0] + dx * 0.6, b[1], b[2] + dz * 0.6], [b[0] - dx * 0.6, b[1], b[2] - dz * 0.6], [c0, c0, c1, c1], [0.3, 0.8, 0.3]);
    }
  }
  build() {
    const g = new THREE11.BufferGeometry();
    g.setAttribute("position", new THREE11.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE11.Float32BufferAttribute(this.n, 3));
    g.setAttribute("color", new THREE11.Float32BufferAttribute(this.c, 3));
    g.setAttribute("uv", new THREE11.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
};
var hx = (k) => {
  const x = Math.sin(k * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
};
var rgb = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
var cellUV = (k) => {
  const u = (k & 1) * 0.5, v = (k >> 1 & 1) * 0.5;
  return [[u, v], [u + 0.5, v], [u + 0.5, v + 0.5], [u, v + 0.5]];
};
function bushGeo() {
  const G2 = new VG();
  for (let k = 0; k < 14; k++) {
    const a = hx(k) * TAU, r = 0.15 + hx(k + 7) * 0.55, y = 0.35 + hx(k + 3) * 1.1, s = 0.55 + hx(k + 11) * 0.45;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r, rr = hx(k + 5) * Math.PI;
    const dx = Math.cos(rr) * s, dz = Math.sin(rr) * s, sh = 0.55 + 0.45 * (y / 1.45);
    const col = [0.6 * sh, 0.7 * sh, 0.5 * sh];
    G2.quad([cx - dx, y - s * 0.6, cz - dz], [cx + dx, y - s * 0.6, cz + dz], [cx + dx, y + s * 0.6, cz + dz], [cx - dx, y + s * 0.6, cz - dz], col, [Math.cos(a) * 0.4, 0.8, Math.sin(a) * 0.4], cellUV(k));
  }
  for (let k = 0; k < 5; k++) {
    const a = hx(k + 40) * TAU;
    G2.stem([0, 0, 0], [Math.cos(a) * 0.4, 0.9, Math.sin(a) * 0.4], 0.025, [0.22, 0.17, 0.12], [0.3, 0.25, 0.18]);
  }
  return G2.build();
}
function fireweedGeo() {
  const G2 = new VG(), pink = rgb(12734602), pinkD = rgb(9057384), green = [0.22, 0.36, 0.14], greenL = [0.35, 0.5, 0.2];
  for (let k = 0; k < 5; k++) {
    const a = hx(k + 1) * TAU, r = hx(k + 9) * 0.18, h = 0.8 + hx(k + 17) * 0.55, lean = (hx(k + 23) - 0.5) * 0.15;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r, tx = bx + lean, tz = bz + lean * 0.5;
    G2.stem([bx, 0, bz], [tx, h, tz], 0.012, green, greenL);
    for (let j = 0; j < 4; j++) {
      const y = h * (0.2 + j * 0.15), la = a + j * 2.1, L = 0.16;
      const px = bx + (tx - bx) * (y / h), pz = bz + (tz - bz) * (y / h);
      G2.quad([px, y, pz], [px + Math.cos(la) * L, y + 0.05, pz + Math.sin(la) * L], [px + Math.cos(la) * L * 1.1, y + 0.07, pz + Math.sin(la) * L * 1.1], [px, y + 0.03, pz], green, [0, 1, 0]);
    }
    const y0 = h * 0.72;
    for (const rr of [0, Math.PI / 2]) {
      const dx = Math.cos(rr) * 0.055, dz = Math.sin(rr) * 0.055;
      G2.quad([tx - dx, y0, tz - dz], [tx + dx, y0, tz + dz], [tx + dx * 0.2, h + 0.08, tz + dz * 0.2], [tx - dx * 0.2, h + 0.08, tz - dz * 0.2], [pink, pink, pinkD, pinkD], [0.3, 0.8, 0.3]);
    }
  }
  return G2.build();
}
function flowerGeo(petal, heart, i) {
  const G2 = new VG(), P2 = rgb(petal), Hc = rgb(heart), green = [0.2, 0.34, 0.12], greenL = [0.3, 0.46, 0.18];
  const n2 = i === 2 ? 7 : 5;
  for (let k = 0; k < n2; k++) {
    const a = hx(k * 3 + i) * TAU, r = 0.04 + hx(k + i * 7) * 0.14, h = (i === 2 ? 0.14 : 0.28) + hx(k + 31 + i) * 0.22;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r, tx = bx + (hx(k + 5) - 0.5) * 0.08, tz = bz + (hx(k + 6) - 0.5) * 0.08;
    G2.stem([bx, 0, bz], [tx, h, tz], 6e-3, green, greenL);
    const s = i === 0 ? 0.05 : i === 1 ? 0.035 : 0.03;
    if (i === 1) {
      for (const rr of [0, Math.PI / 2]) {
        const dx = Math.cos(rr) * s, dz = Math.sin(rr) * s;
        G2.quad([tx - dx, h - 0.06, tz - dz], [tx + dx, h - 0.06, tz + dz], [tx + dx * 0.3, h, tz + dz * 0.3], [tx - dx * 0.3, h, tz - dz * 0.3], [P2, P2, Hc, Hc], [0.3, 0.7, 0.3]);
      }
    } else {
      const tilt = 0.25;
      G2.quad([tx - s, h + tilt * s, tz - s], [tx + s, h - tilt * s, tz - s], [tx + s, h - tilt * s, tz + s], [tx - s, h + tilt * s, tz + s], [P2, P2, P2, P2], [0, 1, 0]);
      const c = s * 0.38;
      G2.quad([tx - c, h + 4e-3, tz - c], [tx + c, h + 4e-3, tz - c], [tx + c, h + 4e-3, tz + c], [tx - c, h + 4e-3, tz + c], Hc, [0, 1, 0]);
    }
  }
  return G2.build();
}
function weedGeo() {
  const G2 = new VG(), dry0 = [0.36, 0.3, 0.17], dry1 = [0.62, 0.55, 0.36], seed = [0.5, 0.42, 0.26];
  for (let k = 0; k < 7; k++) {
    const a = hx(k + 50) * TAU, r = hx(k + 60) * 0.12, h = 0.55 + hx(k + 70) * 0.5, lean = 0.1 + hx(k + 80) * 0.2;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r, tx = bx + Math.cos(a) * lean, tz = bz + Math.sin(a) * lean;
    G2.stem([bx, 0, bz], [tx, h, tz], 4e-3, dry0, dry1);
    for (let j = 0; j < 6; j++) {
      const y = h - 0.02 - j * 0.035, ba = a + j * 2.4 + hx(k * 7 + j), L = 0.05 + hx(k + j * 3) * 0.04;
      const px = bx + (tx - bx) * (y / h), pz = bz + (tz - bz) * (y / h);
      const ex = px + Math.cos(ba) * L, ez = pz + Math.sin(ba) * L, ey = y + L * 0.9;
      const sx = -Math.sin(ba) * 6e-3, sz = Math.cos(ba) * 6e-3;
      G2.quad([px - sx, y, pz - sz], [px + sx, y, pz + sz], [ex + sx * 1.6, ey, ez + sz * 1.6], [ex - sx * 1.6, ey, ez - sz * 1.6], seed, [0.3, 0.8, 0.3]);
    }
  }
  return G2.build();
}
function fernGeo() {
  const pos = [], nrm = [], uv = [], idx2 = [];
  const fronds = 7;
  for (let f = 0; f < fronds; f++) {
    const a = f / fronds * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const base2 = pos.length / 3;
    for (let k = 0; k <= 2; k++) {
      const t = k / 2, L = 0.62 * t;
      const y = Math.sin(t * 1.9) * 0.34;
      for (let e = 0; e <= 1; e++) {
        const w = (e - 0.5) * 0.34;
        pos.push(ca * L - sa * w, y, sa * L + ca * w);
        nrm.push(ca * 0.2, 0.95, sa * 0.2);
        uv.push(e, t);
      }
    }
    for (let k = 0; k < 2; k++) {
      const i = base2 + k * 2;
      idx2.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
    }
  }
  const g = new THREE11.BufferGeometry();
  g.setAttribute("position", new THREE11.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE11.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE11.Float32BufferAttribute(uv, 2));
  g.setIndex(idx2);
  return g;
}
var THREE12 = ctx.THREE;
var LAKE = { mesh: null, mat: null, ripples: [], mirror: null };
function addRipple(x, z, strength = 1) {
}
function mergeSimple(geos) {
  const pos = [], nrm = [], uv = [], idx2 = [];
  let off = 0;
  for (const g of geos) {
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
    uv.push(...g.attributes.uv.array);
    for (const i of g.index.array) idx2.push(i + off);
    off += g.attributes.position.count;
  }
  const out = new THREE12.BufferGeometry();
  out.setAttribute("position", new THREE12.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE12.Float32BufferAttribute(nrm, 3));
  out.setAttribute("uv", new THREE12.Float32BufferAttribute(uv, 2));
  out.setIndex(idx2);
  return out;
}
var THREE30 = ctx.THREE;
var THREE28 = ctx.THREE;
var THREE13 = ctx.THREE;
var BGU = ctx.BGU;
var BUCKETS = /* @__PURE__ */ new Map();
var TILE2 = 200;
var STATIC_ONECAST = false;
var _m3 = new THREE13.Matrix4();
var _q4 = new THREE13.Quaternion();
var _e = new THREE13.Euler();
var _v = new THREE13.Vector3();
var _s2 = new THREE13.Vector3();
var STRUCTS = [];
var CUR = null;
var PANEL = null;
var PTAG = 0;
var TAGN = 1;
var boardTag = (on = true) => PTAG = on ? TAGN++ : 0;
function beginStruct(o) {
  CUR = { id: STRUCTS.length, panels: [], burn: 0, fuel: o.fuel ?? 1, charred: 0, ...o };
  STRUCTS.push(CUR);
  PANEL = null;
  CAPTURE.list = null;
  return CUR;
}
function panel(kind, o = {}) {
  if (!CUR) return null;
  PANEL = {
    s: CUR,
    kind,
    mode: o.mode ?? (kind === "wall" ? "shatter" : "rigid"),
    hp: o.hp ?? 1,
    parts: [],
    cols: [],
    ranges: [],
    dead: false,
    sup: o.sup || null,
    load: !!o.load,
    mat: o.mat || null,
    dims: o.dims || null,
    density: o.density ?? 500,
    float: o.float ?? 1.6,
    burnable: o.burnable !== false
  };
  CUR.panels.push(PANEL);
  CAPTURE.list = PANEL.cols;
  CAPTURE.panel = PANEL;
  return PANEL;
}
function attachMesh(mesh) {
  if (!PANEL) return;
  mesh.updateMatrixWorld(true);
  PANEL.parts.push({ mat: mesh.material, geo: mesh.geometry.clone().applyMatrix4(mesh.matrixWorld) });
  PANEL.mesh = mesh;
}
var curPanel = () => PANEL;
var inStruct = () => !!CUR;
function noPanel() {
  PANEL = null;
  CAPTURE.list = null;
  CAPTURE.panel = null;
}
function endStruct() {
  const s = CUR;
  CUR = null;
  PANEL = null;
  CAPTURE.list = null;
  CAPTURE.panel = null;
  if (s) {
    const bb = new THREE13.Box3();
    for (const p of s.panels) for (const q of p.parts) {
      q.geo.computeBoundingBox();
      bb.union(q.geo.boundingBox);
    }
    s.box = bb;
    s.center = bb.getCenter(new THREE13.Vector3());
    s.radius = bb.getSize(new THREE13.Vector3()).length() / 2;
    for (const p of s.panels) {
      const b = new THREE13.Box3();
      for (const q of p.parts) b.union(q.geo.boundingBox);
      p.box = b;
      p.center = b.getCenter(new THREE13.Vector3());
      const tags = /* @__PURE__ */ new Map();
      for (const q of p.parts) if (q.tag) {
        if (!tags.has(q.tag)) tags.set(q.tag, { tag: q.tag, box: new THREE13.Box3(), alive: true, hp: 1 });
        tags.get(q.tag).box.union(q.geo.boundingBox);
      }
      if (tags.size) {
        p.boards = [...tags.values()];
        p.boardsLeft = p.boards.length;
      }
    }
    s.panels = s.panels.filter((p) => p.parts.length || p.cols.length);
  }
  return s;
}
function put(mat, geo, cast = true) {
  geo.computeBoundingSphere();
  const c = geo.boundingSphere.center;
  const k = Math.floor((c.x + TILE2) / TILE2) * 64 + Math.floor((c.z + TILE2) / TILE2) + (cast || STATIC_ONECAST ? 0 : 1e5);
  if (!BUCKETS.has(mat)) BUCKETS.set(mat, /* @__PURE__ */ new Map());
  const b = BUCKETS.get(mat);
  if (!b.has(k)) b.set(k, []);
  b.get(k).push({ geo, panel: PANEL, tag: PANEL ? PTAG : 0 });
  if (PANEL) PANEL.parts.push({ mat, geo, tag: PTAG });
}
function normalize(g, mat) {
  let out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) if (!["position", "normal", "uv", "color"].includes(name)) out.deleteAttribute(name);
  if (!out.attributes.uv) out.setAttribute("uv", new THREE13.Float32BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  if (mat.vertexColors) {
    if (!out.attributes.color) out.setAttribute("color", new THREE13.Float32BufferAttribute(new Float32Array(out.attributes.position.count * 3).fill(1), 3));
  } else if (out.attributes.color) out.deleteAttribute("color");
  return out;
}
function place(mat, geo, x, y, z, rot = 0, scale = 1, opt = {}) {
  const g = geo.clone();
  const r = typeof rot === "number" ? [0, rot, 0] : rot;
  _e.set(r[0], r[1], r[2], "YXZ");
  _q4.setFromEuler(_e);
  if (typeof scale === "number") _s2.setScalar(scale);
  else _s2.set(scale[0], scale[1], scale[2]);
  _m3.compose(_v.set(x, y, z), _q4, _s2);
  g.applyMatrix4(_m3);
  put(mat, normalize(g, mat), opt.cast !== false);
  return g;
}
function uvBox(g, sx, sy, sz, tile = 1.5, vertical = false) {
  const uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    let u = uv.getX(i) * dims[f][0] / tile, v = uv.getY(i) * dims[f][1] / tile;
    if (vertical) [u, v] = [v, u];
    uv.setXY(i, u, v);
  }
  return g;
}
function box(mat, x, y, z, sx, sy, sz, o = {}) {
  const g = uvBox(new THREE13.BoxGeometry(sx, sy, sz), sx, sy, sz, o.tile ?? 1.5, o.vertical);
  if (o.uvOff) {
    const uv = g.attributes.uv, t = o.tile ?? 1.5, du = o.uvOff[0] / t, dv = o.uvOff[1] / t;
    for (let i = 16; i < 24; i++) uv.setXY(i, uv.getX(i) + (o.vertical ? dv : du), uv.getY(i) + (o.vertical ? du : dv));
  }
  const ry = o.rot ?? 0;
  place(mat, g, x, y, z, [o.rx ?? 0, ry, o.rz ?? 0], 1, o);
  if (o.collide) addBox(x, y, z, sx, sy, sz, ry, { walk: o.walk !== false });
}
function cyl(mat, x, y, z, r0, r1, h, o = {}) {
  const g = new THREE13.CylinderGeometry(r1, r0, h, o.seg ?? 8, 1, o.open ?? false);
  if (o.tile) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r0 / o.tile, uv.getY(i) * h / o.tile);
  }
  place(mat, g, x, y, z, o.rot ?? 0, 1, o);
}
var _up3 = new THREE13.Vector3(0, 1, 0);
function beam(mat, a, b, r, o = {}) {
  const d = new THREE13.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE13.CylinderGeometry(o.r1 ?? r, r, L, o.seg ?? 7, 1, false);
  if (o.tile) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * L / o.tile);
  }
  const q = new THREE13.Quaternion().setFromUnitVectors(_up3, d.normalize());
  g.applyQuaternion(q);
  const c = a.clone().add(b).multiplyScalar(0.5);
  g.translate(c.x, c.y, c.z);
  put(mat, normalize(g, mat), o.cast !== false);
}
function frame(x, z, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return {
    x,
    z,
    rot,
    p: (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c]
  };
}
var _baseOBC = new THREE13.MeshStandardMaterial().onBeforeCompile;
function plainSig(m) {
  if (!m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isShaderMaterial) return null;
  if (m.map || m.normalMap || m.roughnessMap || m.metalnessMap || m.emissiveMap || m.alphaMap || m.aoMap || m.bumpMap || m.lightMap || m.envMap) return null;
  if (m.transparent || m.opacity < 1 || m.alphaTest > 0 || m.wireframe || m.polygonOffset || !m.depthWrite) return null;
  if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) * m.emissiveIntensity > 1e-3) return null;
  if (m.onBeforeCompile !== _baseOBC || m.userData.keep || m.customProgramCacheKey !== _baseMat.customProgramCacheKey) return null;
  return [m.side, m.flatShading ? 1 : 0, Math.round(m.roughness * 10) / 10, Math.round(m.metalness * 5) / 5, m.envMapIntensity, m.userData.impactSurface || "concrete"].join("|");
}
var _baseMat = new THREE13.MeshStandardMaterial();
var PLAIN = new Map();
function plainMat(sig, m) {
  if (!PLAIN.has(sig)) {
    const [side, flat, r, mt] = sig.split("|").map(Number);
    const pm = new THREE13.MeshStandardMaterial({ vertexColors: true, side, flatShading: !!flat, roughness: r, metalness: mt });
    pm.name = "plain_" + sig;
    pm.userData.impactSurface=m.userData.impactSurface;
    PLAIN.set(sig, pm);
  }
  return PLAIN.get(sig);
}
var SHADOW_PROXIES = [];
var SHADOW_PROXY_MAT = {};
function proxyOK(m) {
  // тени рисуются MeshDepthMaterial — onBeforeCompile исходного материала в них и так не участвует
  return !m.transparent && !(m.alphaTest > 0) && !m.alphaMap && m.depthWrite !== false && !m.isShaderMaterial && !m.displacementMap;
}
function flushStatic() {
  globalThis.GImpactSurfaces?.tagTable(M);
  const pAcc = new Map();
  for (const [k, m] of Object.entries(M)) if (m && m.isMaterial && !m.name) m.name = k;
  let draws2 = 0, plainIn = 0;
  // группировка: [материал отрисовки][тайл] → записи с исходным материалом
  const groups = new Map();
  for (const [mat, tiles] of BUCKETS) {
    const sig = plainSig(mat), gm = sig ? plainMat(sig, mat) : mat;
    if (sig) plainIn++;
    if (!groups.has(gm)) groups.set(gm, new Map());
    const G2 = groups.get(gm);
    for (const [k, list] of tiles) {
      if (!G2.has(k)) G2.set(k, []);
      const L = G2.get(k);
      for (const e of list) {
        if (sig) {
          const n2 = e.geo.attributes.position.count, col = mat.color;
          let g = e.geo;
          if (g.attributes.color) {
            g = g.clone();
            const a = g.attributes.color.array;
            for (let i = 0; i < a.length; i += 3) {
              a[i] *= col.r;
              a[i + 1] *= col.g;
              a[i + 2] *= col.b;
            }
          } else {
            const a = new Float32Array(n2 * 3);
            for (let i = 0; i < a.length; i += 3) {
              a[i] = col.r;
              a[i + 1] = col.g;
              a[i + 2] = col.b;
            }
            g.setAttribute("color", new THREE13.Float32BufferAttribute(a, 3));
          }
          L.push({ ...e, geo: g });
        } else L.push(e);
      }
    }
  }
  for (const [mat, tiles] of groups) for (const [k, list] of tiles) {
    const merged = BGU.mergeGeometries(list.map((e) => e.geo), false);
    if (!merged) {
      console.warn("merge failed", mat);
      continue;
    }
    merged.computeBoundingSphere();
    const mesh = new THREE13.Mesh(merged, mat);
    let off = 0;
    for (const e of list) {
      const n2 = e.geo.attributes.position.count;
      if (e.panel) e.panel.ranges.push({ mesh, start: off, count: n2, tag: e.tag });
      off += n2;
    }
    mesh.castShadow = k < 1e5 - 5e3;
    mesh.receiveShadow = true;
    mesh.name = "static";
    scene.add(mesh);
    draws2++;
    // тень непрозрачной статики рисуется одним «теневым двойником» на тайл: позиции без материалов
    if (mesh.castShadow && proxyOK(mat)) {
      mesh.castShadow = false;
      for (const e of list) {
        const pa = e.geo.attributes.position, n2 = pa.count;
        const cx = Math.floor(pa.array[0] / 48), cz = Math.floor(pa.array[2] / 48);
        const pk = cx * 1e3 + cz + "|" + (mat.side === THREE13.DoubleSide ? 2 : mat.side);
        if (!pAcc.has(pk)) pAcc.set(pk, { geos: [], recs: [], n: 0, side: mat.side });
        const P = pAcc.get(pk), g = new THREE13.BufferGeometry();
        g.setAttribute("position", pa);
        if (e.panel) P.recs.push([e.panel, P.n, n2, e.tag]);
        P.n += n2;
        P.geos.push(g);
      }
    }
  }
  let pv = 0;
  for (const P of pAcc.values()) {
    const g = BGU.mergeGeometries(P.geos, false);
    g.computeBoundingSphere();
    const pm = SHADOW_PROXY_MAT[P.side] ??= new THREE13.MeshBasicMaterial({ side: P.side, colorWrite: false });
    const mesh = new THREE13.Mesh(g, pm);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.visible = false;
    mesh.name = "static_shadow";
    for (const [panel, start, count, tag] of P.recs) panel.ranges.push({ mesh, start, count, tag });
    scene.add(mesh);
    SHADOW_PROXIES.push(mesh);
    pv += P.n;
  }
  console.info(`[static] материалов ${BUCKETS.size} (одноцветных ${plainIn} → ${PLAIN.size}), мешей ${draws2}, теневых двойников ${pAcc.size} (${Math.round(pv / 1e3)}k вершин)`);
  BUCKETS.clear();
  return draws2;
}
function collapsePanel(p) {
  for (const r of p.ranges) {
    const pos = r.mesh.geometry.attributes.position, a = pos.array, i0 = r.start * 3;
    const x = a[i0], y = a[i0 + 1], z = a[i0 + 2];
    for (let i = i0; i < (r.start + r.count) * 3; i += 3) {
      a[i] = x;
      a[i + 1] = y;
      a[i + 2] = z;
    }
    pos.addUpdateRange(i0, r.count * 3);
    pos.needsUpdate = true;
  }
}
var THREE14 = ctx.THREE;
var LAMPS = [];
var KIND = {
  post: { power: 45, range: 24, color: 16761470, glow: 1.6, pool: 8.5, weight: 1, cone: true },
  flood: { power: 160, range: 44, color: 15921407, glow: 2.2, pool: 13, weight: 1.6, cone: true },
  window: { power: 5, range: 9, color: 16754784, glow: 0.9, pool: 2.6, weight: 0.4, cone: false },
  fire: { power: 14, range: 14, color: 16747066, glow: 1.4, pool: 5, weight: 0.8, cone: false },
  bulb: { power: 4, range: 8, color: 16767392, glow: 0.45, pool: 2.4, weight: 0.3, cone: false }
};
function addLamp(o) {
  const k = KIND[o.kind];
  const L = {
    pos: new THREE14.Vector3(o.x, o.y, o.z),
    kind: o.kind,
    on: o.on ?? true,
    flick: o.flick ?? 0,
    ground: o.ground ?? hFast(o.x, o.z),
    color: new THREE14.Color(o.color ?? k.color),
    dir: o.dir || null,
    power: o.power ?? k.power,
    range: o.range ?? k.range,
    lens: o.lens || null,
    level: 0,
    seed: LAMPS.length * 13.7,
    pool: o.pool ?? k.pool,
    camp: !!o.camp,
    blink: !!o.blink,
    breakable: o.breakable !== false,
    inside: !!o.inside,
    hg: !!o.hg
  };
  LAMPS.push(L);
  return L;
}
var POSTS = [];
function planLamps() {
  const R2 = rng(3131);
  for (const p of PATHS) {
    if (!p.lit) continue;
    const spacing = p.kind === "road" ? 19 : 13;
    let side2 = R2() < 0.5 ? -1 : 1, prev = null;
    for (let s = spacing * 0.5; s < p.len - 2; s += spacing * R2.range(0.9, 1.1)) {
      const a = polyAt(p.pts, s);
      const nx = -a.tz, nz = a.tx, off = p.w * 0.5 + 0.9;
      let x = a.x + nx * off * side2, z = a.z + nz * off * side2;
      if (lakeRho(x, z) < 1.25) {
        side2 = -side2;
        x = a.x + nx * off * side2;
        z = a.z + nz * off * side2;
      }
      if (!isFree(x, z, 0.25, { pathPad: -0.55, trenchPad: 1, lake: 1.06 })) {
        const x2 = a.x - nx * off * side2, z2 = a.z - nz * off * side2;
        if (!isFree(x2, z2, 0.25, { pathPad: -0.55, trenchPad: 1, lake: 1.06 })) continue;
        x = x2;
        z = z2;
        side2 = -side2;
      }
      const post = { x, z, rot: Math.atan2(-nx * side2, -nz * side2), path: p, prev, on: R2() < (p.camp ? 0.75 : 0.8), flick: p.camp ? R2.range(0.5, 1) : R2() < 0.22 ? R2.range(0.4, 1) : 0, bench: !p.camp && R2() < 0.3, camp: !!p.camp };
      POSTS.push(post);
      keep(x, z, 0.6);
      if (post.bench) {
        const bx = a.x + nx * (off + 0.2) * side2 + a.tx * 1.8, bz = a.z + nz * (off + 0.2) * side2 + a.tz * 1.8;
        // лавка не ставится поперёк калитки и ворот дворов
        if (!VILLAGE.yards.some((Y) => Y.gatePts?.some(([gx, gz]) => Math.hypot(gx - bx, gz - bz) < 2.4))) {
          post.benchAt = { x: bx, z: bz, rot: post.rot };
          keep(bx, bz, 1.2);
        }
      }
      prev = post;
      side2 = -side2;
    }
  }
}
function buildPost(p) {
  const y = terrainH(p.x, p.z), H2 = 4.4;
  const fx = Math.sin(p.rot), fz = Math.cos(p.rot);
  // деревянный столб — постройка: горит, перебивается пулемётом/взрывом и валится (см. collapse.js)
  const S = beginStruct({ kind: "lamppost", name: "фонарь", x: p.x, z: p.z, rot: p.rot, w: 0.5, d: 0.5, h: H2, fy: y, fuel: 0.45, thin: 1.4, quiet: true });
  const pole = panel("wall", { hp: 1.1, mode: "rigid", density: 600 });
  cyl(M.deadwood, p.x, y + H2 / 2 - 0.3, p.z, 0.11, 0.08, H2 + 0.6, { seg: 7, tile: 1.2 });
  const pc = addCircle(p.x, p.z, 0.14, y, y + H2);
  // фонари строятся после статического мира ammo.js — столб регистрируем сами, иначе пули проходят насквозь
  if (PHYS.hf) addStaticCollider(pc);
  pole.center = new THREE14.Vector3(p.x, y + 1.2, p.z);
  pole.armor = "pole";
  pole.maxBlast = 0.7;
  pole.pole = { a: new THREE14.Vector3(p.x, y - 0.25, p.z), b: new THREE14.Vector3(p.x, y + H2 + 0.3, p.z), r: 0.11, r1: 0.08, mat: M.deadwood };
  const head = panel("prop", { hp: 99, mode: "rigid", density: 700, sup: { list: [pole], frac: 0.99 } });
  S.towerTop = head;
  head.hingeHalf = 0.05;
  head.hingeLen = H2;
  head.pivotAtBreak = true;
  beam(M.deadwood, new THREE14.Vector3(p.x - fx * 0.9, y - 0.1, p.z - fz * 0.9), new THREE14.Vector3(p.x - fx * 0.08, y + 1.6, p.z - fz * 0.08), 0.06);
  const ax = p.x + fx * 1.1, az = p.z + fz * 1.1, ay = y + H2 - 0.1;
  beam(M.steel, new THREE14.Vector3(p.x, y + H2 - 0.5, p.z), new THREE14.Vector3(ax, ay, az), 0.025);
  beam(M.steel, new THREE14.Vector3(p.x, y + H2 - 0.05, p.z), new THREE14.Vector3(ax, ay, az), 0.02);
  const shade = new THREE14.ConeGeometry(0.26, 0.2, 12, 1, true);
  place(p.camp ? M.bone : M.carPaint[3], shade, ax, ay - 0.12, az, 0);
  place(M.dark, new THREE14.CylinderGeometry(0.04, 0.05, 0.1, 8), ax, ay, az, 0);
  const lens = M.lampGlass.clone();
  const bulb = new THREE14.Mesh(new THREE14.SphereGeometry(0.085, 10, 8), lens);
  bulb.position.set(ax, ay - 0.2, az);
  scene.add(bulb);
  place(M.bone, new THREE14.CylinderGeometry(0.03, 0.04, 0.08, 6), p.x, y + H2 + 0.02, p.z, 0);
  S.carry = [bulb];
  S.post = p;
  p.struct = S;
  if (p.prev) {
    const a = new THREE14.Vector3(p.prev.x, terrainH(p.prev.x, p.prev.z) + H2 + 0.05, p.prev.z), b = new THREE14.Vector3(p.x, y + H2 + 0.05, p.z);
    if (a.distanceTo(b) < 30) {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push(new THREE14.Vector3().lerpVectors(a, b, t).add(new THREE14.Vector3(0, -Math.sin(t * Math.PI) * 0.55, 0)));
      }
      const tube = new THREE14.Mesh(new THREE14.TubeGeometry(new THREE14.CatmullRomCurve3(pts), 16, 8e-3, 3), M.dark);
      scene.add(tube);
      (p.wires ??= []).push(tube);
      (p.prev.wires ??= []).push(tube);
    }
  }
  addLamp({ kind: "post", x: ax, y: ay - 0.22, z: az, ground: hFast(ax, az), on: p.on, flick: p.flick, lens, dir: new THREE14.Vector3(0, -1, 0), camp: p.camp, color: p.camp ? 15131298 : void 0, power: p.camp ? 26 : void 0 }).panel = head;
  endStruct();
}
function bench(x, z, rot, R2, o = {}) {
  const y = hFast(x, z);
  const c = Math.cos(rot), s = Math.sin(rot);
  const P2 = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  beginStruct({ kind: "bench", x, z, rot, w: 1.8, d: 0.6, h: 0.9, fy: y, fuel: 0.35 });
  noPanel();
  for (const lx of [-0.75, 0.75]) {
    const [px, pz] = P2(lx, 0);
    box(o.leg ?? M.concrete, px, y + 0.22, pz, 0.12, 0.45, 0.46, { rot, tile: 0.8 });
  }
  panel("prop", { hp: 0.3, density: 500 });
  const broken = R2() < 0.35, slat = o.slat ?? M.planksDark;
  for (let i = 0; i < 3; i++) {
    const [px, pz] = P2(0, -0.15 + i * 0.15);
    if (broken && i === 2 && R2() < 0.5) continue;
    box(slat, px, y + 0.47, pz, 1.8, 0.04, 0.11, { rot, tile: 1.2 });
  }
  if (!broken) for (let i = 0; i < 2; i++) {
    const [px, pz] = P2(0, -0.27);
    box(slat, px, y + 0.68 + i * 0.16, pz, 1.8, 0.1, 0.035, { rot, rx: -0.15, tile: 1.2 });
  }
  const [cx, cz] = P2(0, 0);
  addCircle(cx, cz, 0.45, y, y + 0.5);
  if (R2() < 0.6) {
    const [ux, uz] = P2(1.35, 0);
    panel("prop", { hp: 0.25, density: 700, float: 0, burnable: false });
    cyl(M.rust, ux, y + 0.33, uz, 0.2, 0.24, 0.66, { seg: 10, open: true });
  }
  endStruct();
}
var glowIM;
var coneIM;
var poolMesh;
var poolU;
var SPOTS = [];
var POINTS = [];
var GLOW_VS = (
  /* glsl */
  `
  attribute float aI; attribute vec3 aCol; attribute float aSize;
  varying float vI; varying vec3 vCol; varying vec2 vUv;
  void main(){
    vUv = uv; vI = aI; vCol = aCol;
    vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // ореол не меньше пары пикселей вдали — фонари видны с дрона цепочкой огней
    float dist = -c.z;
    float s = aSize * max(1.0, dist * 0.012);
    c.xy += position.xy * s;
    gl_Position = projectionMatrix * c;
  }`
);
var GLOW_FS = (
  /* glsl */
  `
  uniform sampler2D tMap; uniform float uFog;
  varying float vI; varying vec3 vCol; varying vec2 vUv;
  void main(){
    vec4 t = texture2D(tMap, vUv);
    gl_FragColor = vec4(vCol * t.rgb * vI, t.a * vI);
    if (gl_FragColor.a < 0.003) discard;
  }`
);
var CONE_VS = (
  /* glsl */
  `
  attribute float aI; attribute vec3 aCol;
  varying float vI; varying vec3 vCol; varying float vH; varying vec3 vN; varying vec3 vV;
  void main(){
    vI = aI; vCol = aCol; vH = -position.y;
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vV = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`
);
var CONE_FS = (
  /* glsl */
  `
  varying float vI; varying vec3 vCol; varying float vH; varying vec3 vN; varying vec3 vV;
  void main(){
    // луч в сыром воздухе: гуще у плафона, мягкий край по силуэту
    float edge = pow(abs(dot(normalize(vN), vV)), 1.6);
    float a = vI * edge * (1.0 - smoothstep(0.0, 1.0, vH)) * 0.14;
    gl_FragColor = vec4(vCol * a, a);
  }`
);
function buildLamps() {
  const R2 = rng(3232);
  for (const p of POSTS) {
    buildPost(p);
    if (p.benchAt) bench(p.benchAt.x, p.benchAt.z, p.benchAt.rot, R2);
  }
}
function finishLamps() {
  const n2 = LAMPS.length;
  const quad = new THREE14.PlaneGeometry(1, 1);
  const gm = new THREE14.ShaderMaterial({
    uniforms: { tMap: { value: TEX.glow }, uFog: { value: 0 } },
    vertexShader: GLOW_VS,
    fragmentShader: GLOW_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE14.AdditiveBlending
  });
  glowIM = new THREE14.InstancedMesh(quad, gm, n2);
  const aI = new Float32Array(n2), aCol = new Float32Array(n2 * 3), aSize = new Float32Array(n2);
  const m = new THREE14.Matrix4();
  LAMPS.forEach((L, i) => {
    m.makeTranslation(L.pos.x, L.pos.y, L.pos.z);
    glowIM.setMatrixAt(i, m);
    aCol[i * 3] = L.color.r;
    aCol[i * 3 + 1] = L.color.g;
    aCol[i * 3 + 2] = L.color.b;
    aSize[i] = KIND[L.kind].glow;
  });
  quad.setAttribute("aI", new THREE14.InstancedBufferAttribute(aI, 1));
  quad.setAttribute("aCol", new THREE14.InstancedBufferAttribute(aCol, 3));
  quad.setAttribute("aSize", new THREE14.InstancedBufferAttribute(aSize, 1));
  glowIM.frustumCulled = false;
  glowIM.renderOrder = 5;
  scene.add(glowIM);
  const coneLamps = LAMPS.filter((L) => KIND[L.kind].cone);
  const cg = new THREE14.ConeGeometry(1, 1, 18, 1, true);
  cg.translate(0, -0.5, 0);
  const cm = new THREE14.ShaderMaterial({
    vertexShader: CONE_VS,
    fragmentShader: CONE_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE14.AdditiveBlending,
    side: THREE14.DoubleSide
  });
  coneIM = new THREE14.InstancedMesh(cg, cm, coneLamps.length);
  const cI = new Float32Array(coneLamps.length), cC = new Float32Array(coneLamps.length * 3);
  const q = new THREE14.Quaternion(), s = new THREE14.Vector3(), p = new THREE14.Vector3();
  coneLamps.forEach((L, i) => {
    const h = Math.max(1, L.pos.y - L.ground);
    const dir2 = L.dir || new THREE14.Vector3(0, -1, 0);
    q.setFromUnitVectors(new THREE14.Vector3(0, -1, 0), dir2.clone().normalize());
    const len = L.kind === "flood" ? 16 : h;
    s.set(len * (L.kind === "flood" ? 0.45 : 0.62), len, len * (L.kind === "flood" ? 0.45 : 0.62));
    coneIM.setMatrixAt(i, m.compose(p.copy(L.pos), q, s));
    cC[i * 3] = L.color.r;
    cC[i * 3 + 1] = L.color.g;
    cC[i * 3 + 2] = L.color.b;
    L.coneIndex = i;
  });
  cg.setAttribute("aI", new THREE14.InstancedBufferAttribute(cI, 1));
  cg.setAttribute("aCol", new THREE14.InstancedBufferAttribute(cC, 3));
  coneIM.frustumCulled = false;
  coneIM.renderOrder = 4;
  scene.add(coneIM);
  NO_REFLECT.push(coneIM);
  const pos = [], uv = [], li = [], idx2 = [];
  const G2 = 10;
  LAMPS.forEach((L, i) => {
    const r = L.pool, base2 = pos.length / 3;
    let cx = L.pos.x, cz = L.pos.z;
    if (L.kind === "flood" && L.dir) {
      cx += L.dir.x * 9;
      cz += L.dir.z * 9;
    }
    for (let j = 0; j <= G2; j++) for (let k = 0; k <= G2; k++) {
      const x = cx + (k / G2 - 0.5) * 2 * r, z = cz + (j / G2 - 0.5) * 2 * r;
      pos.push(x, hFast(x, z) + 0.06, z);
      uv.push(k / G2, j / G2);
      li.push(i);
    }
    for (let j = 0; j < G2; j++) for (let k = 0; k < G2; k++) {
      const a = base2 + j * (G2 + 1) + k;
      idx2.push(a, a + G2 + 1, a + 1, a + 1, a + G2 + 1, a + G2 + 2);
    }
  });
  const pg = new THREE14.BufferGeometry();
  pg.setAttribute("position", new THREE14.Float32BufferAttribute(pos, 3));
  pg.setAttribute("uv", new THREE14.Float32BufferAttribute(uv, 2));
  pg.setAttribute("aLamp", new THREE14.Float32BufferAttribute(li, 1));
  pg.setIndex(idx2);
  poolU = { tMap: { value: TEX.pool }, uI: { value: new Float32Array(Math.max(1, n2)) }, uC: { value: LAMPS.map((L) => L.color.clone()) } };
  const pm = new THREE14.ShaderMaterial({
    uniforms: poolU,
    transparent: true,
    depthWrite: false,
    blending: THREE14.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    vertexShader: `attribute float aLamp; uniform float uI[${Math.max(1, n2)}]; uniform vec3 uC[${Math.max(1, n2)}];
      varying vec2 vUv; varying float vI; varying vec3 vC;
      void main(){ vUv = uv; int k = int(aLamp + 0.5); vI = uI[k]; vC = uC[k] * vec3(1.0, 0.78, 0.55);
        // вблизи пятно рисует настоящий источник света, декаль нужна для дальнего плана
        vI *= 0.25 + 0.75 * smoothstep(12.0, 45.0, distance(cameraPosition, position));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tMap; varying vec2 vUv; varying float vI; varying vec3 vC;
      void main(){ float t = texture2D(tMap, vUv).a; float a = t * t * vI * 0.62; gl_FragColor = vec4(vC * a, a); }`
  });
  poolMesh = new THREE14.Mesh(pg, pm);
  poolMesh.frustumCulled = false;
  poolMesh.renderOrder = 3;
  scene.add(poolMesh);
  for (let i = 0; i < Q.lights; i++) {
    // широкий мягкий край: пятно не режет кусты жёсткой оранжевой границей
    const sp = new THREE14.SpotLight(16763274, 0, 24, 1.2, 1, 1.6);
    sp.castShadow = i < Q.spotShadows;
    if (sp.castShadow) {
      sp.shadow.mapSize.set(512, 512);
      sp.shadow.bias = -8e-4;
      sp.shadow.camera.near = 0.3;
      sp.shadow.camera.far = 30;
      sp.shadow.autoUpdate = false;
    }
    sp.position.set(0, -500, 0);
    sp.target.position.set(0, -501, 0);
    scene.add(sp, sp.target);
    SPOTS.push(sp);
  }
  for (let i = 0; i < Q.lampPoints; i++) {
    const pl = new THREE14.PointLight(16754784, 0, 10, 1.8);
    pl.position.set(0, -500, 0);
    scene.add(pl);
    POINTS.push(pl);
  }
}
var FX = __deepNoop;
var FLAME = { list: [], mesh: null, max: 220, P: null, S: null, L: null };
function flameAdd(o) {
  const f = { x: o.x, y: o.y, z: o.z, w: o.w, h: o.h, h0: o.h, i: o.i ?? 1, lean: o.lean ?? 0.4, lx: o.lx ?? 0, lz: o.lz ?? 0, soot: o.soot ?? 0.35, seed: o.seed ?? srnd(), dead: false };
  FLAME.list.push(f);
  return f;
}
var FSND = { heat: 0, x: 0, nextPop: 0, acc: 0, px: 0, pz: 0, best: 1e9 };
function fireNear(pos, power) {
  const d = Math.max(0.6, camera.position.distanceTo(pos));
  const k = power / (1 + d * d / 9);
  FSND.acc += k;
  if (d < FSND.best) {
    FSND.best = d;
    FSND.px = pos.x;
    FSND.pz = pos.z;
  }
}
var AUDIO = { ctx: null, master: null, on: true, t: 0, nextBird: 3, nextCricket: 0, nextShell: 20, nextOwl: 30 };
var noiseBuf;
function burst(t, { type = "bandpass", f = 1e3, f1 = null, q = 1, vol = 0.3, a = 2e-3, dec = 0.3, x = 0, len = 1 }) {
  const ctx = AUDIO.ctx;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  fl.Q.value = q;
  if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + a + dec);
  const g = ctx.createGain();
  env(g, t, a, vol, dec);
  const p = pan(ctx, x);
  src.connect(fl);
  fl.connect(g);
  g.connect(p);
  p.connect(AUDIO.sfx || AUDIO.master);
  src.start(t, Math.random() * 3);
  src.stop(t + a + dec + len * 0.1 + 0.05);
}
var ready = () => AUDIO.ctx && AUDIO.on;
var glassSound = function(){};
var woodCrack = function(){};
function env(g, t0, a, peak, dec) {
  g.gain.cancelScheduledValues(t0);
  g.gain.setValueAtTime(1e-4, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(1e-4, t0 + a + dec);
}
function pan(ctx, x) {
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
  if (p.pan) p.pan.value = clamp(x, -1, 1);
  return p;
}
function boom(dist, size = 1, x = 0, occl = 0, lake = false) {
  const ctx = AUDIO.ctx;
  if (!ctx || !AUDIO.on) return;
  const t = ctx.currentTime + dist / 343;
  // за препятствием (стена, бруствер, холм) — глуше и тише
  const vol = clamp(size * 1.6 / (1 + dist / 25), 0.02, 1.4) * (1 - occl * 0.45);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(lerp(5e3, 700, clamp(dist / 250, 0, 1)) * (1 - occl * 0.65), t);
  if (lake) {
    // эхо над озером: отражение от дальнего берега, глухое и запаздывающее
    for (const [dl, k] of [[0.55 + dist / 900, 0.32], [1.25 + dist / 700, 0.16]]) {
      const e = ctx.createBufferSource(), ef = ctx.createBiquadFilter(), eg = ctx.createGain();
      e.buffer = noiseBuf;
      ef.type = "lowpass";
      ef.frequency.value = 650;
      env(eg, t + dl, 0.03, vol * k, 1.6);
      e.connect(ef);
      ef.connect(eg);
      eg.connect(pan(ctx, -x * 0.6)).connect(AUDIO.sfx || AUDIO.master);
      e.start(t + dl, Math.random() * 2);
      e.stop(t + dl + 2.2);
    }
  }
  f.frequency.exponentialRampToValueAtTime(120, t + 1.8);
  const g = ctx.createGain();
  env(g, t, 5e-3, vol, 1.6 + size * 0.6);
  const p = pan(ctx, x);
  src.connect(f);
  f.connect(g);
  g.connect(p);
  p.connect(AUDIO.sfx || AUDIO.master);
  src.start(t, Math.random() * 2);
  src.stop(t + 3);
  const o = ctx.createOscillator(), og = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(70, t);
  o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
  env(og, t, 4e-3, vol * 0.9, 0.7);
  o.connect(og);
  og.connect(AUDIO.sfx || AUDIO.master);
  o.start(t);
  o.stop(t + 1);
}
function click() {
  const ctx = AUDIO.ctx;
  if (!ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "square";
  o.frequency.setValueAtTime(1800, t);
  o.frequency.exponentialRampToValueAtTime(400, t + 0.03);
  env(g, t, 1e-3, 0.2, 0.05);
  o.connect(g);
  g.connect(AUDIO.sfx || AUDIO.master);
  o.start(t);
  o.stop(t + 0.1);
}
function tinnitus(k) {
  const ctx = AUDIO.ctx;
  if (!ctx || k < 0.1) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = 3900;
  g.gain.setValueAtTime(1e-4, t);
  g.gain.linearRampToValueAtTime(0.05 * k, t + 0.1);
  g.gain.exponentialRampToValueAtTime(1e-4, t + 4 * k);
  o.connect(g);
  g.connect(AUDIO.sfx || AUDIO.master);
  o.start(t);
  o.stop(t + 4.5);
  AUDIO.master.gain.setValueAtTime(0.25, t);
  AUDIO.master.gain.linearRampToValueAtTime(0.8, t + 3 * k);
}
var creakSound = function(){};
var wireSnap = function(){};
var sparkSound = function(){};
var THREE27 = ctx.THREE;
var BGU2 = ctx.BGU;
var THREE26 = ctx.THREE;
var THREE18 = ctx.THREE;
var THREE17 = ctx.THREE;
var THREE16 = ctx.THREE;
var PANES = [];
var im = null;
var shardMat = null;
var SHARDS = { im: null, free: [], cap: 320 };
var _ZERO_M = new THREE16.Matrix4().makeScale(0, 0, 0);
var _m4 = new THREE16.Matrix4();
var _p2 = new THREE16.Vector3();
var _s3 = new THREE16.Vector3();
var _e2 = new THREE16.Euler();
function addPane(x, y, z, rot, w, h, o = {}) {
  _e2.set(rot[0], rot[1], rot[2], "YXZ");
  const q = new THREE16.Quaternion().setFromEuler(_e2);
  const p = { pos: new THREE16.Vector3(x, y, z), q, w, h, alive: true, i: PANES.length, tint: o.tint ?? 0, normal: new THREE16.Vector3(0, 0, 1).applyQuaternion(q) };
  PANES.push(p);
  if (Math.abs(rot[0]) < 0.35 && Math.abs(rot[2]) < 0.35) {
    p.col = addBox(x, y, z, w, h * Math.cos(rot[0]), 0.05, rot[1], { walk: false });
    p.col.dyn = true;
    p.col.pane = p;
  }
  p.panel = CAPTURE.panel || null;
  return p;
}
function buildGlass() {
  const mat = new THREE16.MeshPhysicalMaterial({ color: 10465976, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, reflectivity: 0.9, side: THREE16.DoubleSide, depthWrite: false });
  shardMat = mat.clone();
  shardMat.opacity = 0.55;
  const sg = new THREE16.BufferGeometry();
  sg.setAttribute("position", new THREE16.BufferAttribute(new Float32Array([0, 1, 0, -0.8, -0.5, 0, 0.8, -0.4, 0]), 3));
  sg.computeVertexNormals();
  SHARDS.im = new THREE16.InstancedMesh(sg, shardMat, SHARDS.cap);
  SHARDS.im.frustumCulled = false;
  SHARDS.im.renderOrder = 3;
  for (let i = 0; i < SHARDS.cap; i++) {
    SHARDS.im.setMatrixAt(i, _ZERO_M);
    SHARDS.free.push(SHARDS.cap - 1 - i);
  }
  scene.add(SHARDS.im);
  im = new THREE16.InstancedMesh(new THREE16.BoxGeometry(1, 1, 1), mat, Math.max(1, PANES.length));
  im.count = PANES.length;
  im.frustumCulled = false;
  im.renderOrder = 3;
  for (const p of PANES) writePane(p);
  scene.add(im);
  if (PHYS.ready) for (const p of PANES) p.body = paneBody(p);
}
function writePane(p) {
  _s3.set(p.alive ? p.w : 0, p.alive ? p.h : 0, 8e-3);
  im.setMatrixAt(p.i, _m4.compose(p.pos, p.q, _s3));
  im.instanceMatrix.needsUpdate = true;
}
function paneBody(p) {
  const A2 = PHYS.A;
  const he = new A2.btVector3(p.w / 2, p.h / 2, 0.01), org = new A2.btVector3(p.pos.x, p.pos.y, p.pos.z);
  const rq = new A2.btQuaternion(p.q.x, p.q.y, p.q.z, p.q.w), zero = new A2.btVector3(0, 0, 0);
  const shape = new A2.btBoxShape(he);
  const tr = new A2.btTransform();
  tr.setIdentity();
  tr.setOrigin(org);
  tr.setRotation(rq);
  const ms = new A2.btDefaultMotionState(tr);
  const info = new A2.btRigidBodyConstructionInfo(0, ms, shape, zero);
  const b = new A2.btRigidBody(info);
  for (const o of [info, tr, he, org, rq, zero]) A2.destroy(o);
  b.__ms = ms;
  b.__shape = shape;
  b.setUserIndex(-1e3 - p.i);
  PHYS.world.addRigidBody(b, 2, -1);
  return b;
}
function breakPane(p, dir2, force = 4, hit = null) {
  if (!p.alive) return;
  p.alive = false;
  writePane(p);
  if (p.col) p.col.dead = true;
  if (p.body) {
    PHYS.world.removeRigidBody(p.body);
    PHYS.A.destroy(p.body.__ms);
    PHYS.A.destroy(p.body.__shape);
    PHYS.A.destroy(p.body);
    p.body = null;
  }
  const right2 = new THREE16.Vector3(1, 0, 0).applyQuaternion(p.q), up = new THREE16.Vector3(0, 1, 0).applyQuaternion(p.q);
  const n2 = Math.min(16, 5 + Math.round(p.w * p.h * 14));
  for (let i = 0; i < n2; i++) {
    const u = sr(-0.5, 0.5), v = sr(-0.5, 0.5), s = sr(0.04, 0.22) * Math.min(1, p.w + p.h);
    const pos = p.pos.clone().addScaledVector(right2, u * p.w).addScaledVector(up, v * p.h);
    if (hit) pos.lerp(hit, 0.2);
    const vel = dir2.clone().multiplyScalar(force * sr(0.4, 1.2)).add(new THREE16.Vector3(sr(-1, 1), sr(-0.3, 1.2), sr(-1, 1)));
    const q = new THREE16.Quaternion().setFromEuler(new THREE16.Euler(srnd() * TAU, srnd() * TAU, srnd() * TAU));
    if (!SHARDS.free.length) break;
    const slot = SHARDS.free.pop(), sx = s * sr(0.5, 1), sy = s * sr(0.5, 1);
    const put2 = (pp, qq, f) => {
      _s3.set(sx * f, sy * f, 1);
      SHARDS.im.setMatrixAt(slot, _m4.compose(pp, qq, _s3));
      SHARDS.im.instanceMatrix.needsUpdate = true;
    };
    const release = () => {
      SHARDS.im.setMatrixAt(slot, _ZERO_M);
      SHARDS.im.instanceMatrix.needsUpdate = true;
      SHARDS.free.push(slot);
    };
    put2(pos, q, 1);
    const b = addBody({
      shape: "box",
      size: [s, s * 0.8, 0.03],
      mass: 0.08,
      pos,
      quat: q,
      vel,
      ang: new THREE16.Vector3(sr(-15, 15), sr(-15, 15), sr(-15, 15)),
      life: sr(14, 24),
      friction: 0.5,
      restitution: 0.35,
      ccd: 0.02,
      float: 0,
      rad: 0.02,
      sync: (pp, qq, f) => put2(pp, qq, Math.max(0.01, f)),
      onDone: release
    });
    if (!b) release();
  }
  for (let i = 0; i < 14; i++) FX.add.spawn({ x: p.pos.x + sr(-p.w, p.w) * 0.5, y: p.pos.y + sr(-p.h, p.h) * 0.5, z: p.pos.z + sr(-0.2, 0.2), vx: dir2.x * force * 0.5 + sr(-1, 1), vy: sr(-0.5, 2), vz: dir2.z * force * 0.5 + sr(-1, 1), size: 0.03, life: sr(0.4, 1.2), col: [1.6, 1.7, 1.8], a: 0.8, grav: 9.8, drag: 0.5 });
  const d = camera.position.distanceTo(p.pos);
  const rightC = new THREE16.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  glassSound(0, rightC.dot(p.pos.clone().sub(camera.position).normalize()) * (d > 1 ? 1 : 0));
}
var PENDING = [];
function blastGlass(x, y, z, size) {
  const R2 = 16 * size + 6;
  for (const p of PANES) {
    if (!p.alive) continue;
    const d = p.pos.distanceTo(_p2.set(x, y, z));
    if (d > R2) continue;
    const chance = d < R2 * 0.45 ? 1 : 1 - (d - R2 * 0.45) / (R2 * 0.55);
    if (Math.random() > chance) continue;
    const dir2 = p.pos.clone().sub(_p2).normalize();
    PENDING.push({ p, t: FRAME.t + d / 343, dir: dir2, force: Math.max(1.5, 9 * size / (1 + d * 0.3)) });
  }
}
var breakPaneRef = (p, dir2, force) => breakPane(p, dir2, force);
var TYPES = {
  sedan: {
    L: 4.1,
    W: 1.62,
    H: 1.4,
    clear: 0.3,
    wheelR: 0.3,
    axle: [1.25, -1.2],
    profile: [[-2.05, 0.35], [-2.05, 0.82], [-0.95, 0.86], [-0.55, 1.36], [0.75, 1.38], [1.15, 0.9], [2.05, 0.84], [2.05, 0.35]],
    windows: [[-0.5, -0.02, 0.92, 1.3], [0.1, 0.7, 0.92, 1.3]],
    shield: [-0.95, 0.86, -0.55, 1.36],
    rear: [0.75, 1.38, 1.15, 0.9]
  },
  van: {
    L: 4.4,
    W: 1.95,
    H: 2.1,
    clear: 0.35,
    wheelR: 0.38,
    axle: [1.35, -1.3],
    profile: [[-2.2, 0.45], [-2.2, 1.35], [-2, 1.95], [-1.7, 2.08], [1.9, 2.08], [2.2, 1.9], [2.2, 0.45]],
    windows: [[-1.9, -1.1, 1.3, 1.85], [-0.6, 0.4, 1.35, 1.8], [0.7, 1.7, 1.35, 1.8]],
    shield: [-2.2, 1.35, -2, 1.92]
  },
  bus: {
    L: 7.4,
    W: 2.4,
    H: 2.9,
    clear: 0.4,
    wheelR: 0.46,
    axle: [2.3, -2.6],
    profile: [[-3.7, 0.5], [-3.7, 1.55], [-3.55, 2.6], [-3.2, 2.9], [3.4, 2.9], [3.7, 2.6], [3.7, 0.5]],
    windows: [[-2.8, -1.8, 1.6, 2.5], [-1.6, -0.6, 1.6, 2.5], [-0.4, 0.6, 1.6, 2.5], [0.8, 1.8, 1.6, 2.5], [2, 3.2, 1.6, 2.5]],
    shield: [-3.7, 1.55, -3.55, 2.6]
  },
  truck: {
    L: 6.2,
    W: 2.3,
    H: 2.5,
    clear: 0.55,
    wheelR: 0.55,
    axle: [2, -1.9],
    profile: [[-3.1, 0.7], [-3.1, 1.55], [-2.9, 2.4], [-1.3, 2.45], [-1.3, 0.7]],
    windows: [[-2.7, -1.6, 1.6, 2.2]],
    shield: [-3.1, 1.55, -2.9, 2.4],
    bed: true
  }
};
function bodyGeo(T) {
  const s = new THREE17.Shape();
  T.profile.forEach(([z, y], i) => i ? s.lineTo(z, y) : s.moveTo(z, y));
  s.closePath();
  const g = new THREE17.ExtrudeGeometry(s, { depth: T.W - 0.08, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.04, bevelSegments: 2, curveSegments: 4 });
  g.rotateY(-Math.PI / 2);
  g.translate((T.W - 0.08) / 2, 0, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.45, uv.getY(i) * 0.45);
  g.computeVertexNormals();
  return g;
}
var GEO = {};
function vehicle(type, x, z, rot, o = {}) {
  const T = TYPES[type], R2 = rng(o.seed ?? 5);
  GEO[type] ??= bodyGeo(T);
  const burnt = !!o.burnt;
  const paint = burnt ? M.burnt : M.carPaint[(o.paint ?? R2.int(0, M.carPaint.length - 1)) % M.carPaint.length];
  const ground = terrainH(x, z);
  const tiltX = (o.tilt ?? R2.range(-0.04, 0.04)) + (burnt ? 0.03 : 0), tiltZ = o.roll ?? R2.range(-0.06, 0.06);
  const drop = burnt ? T.clear * 0.8 : R2.range(0.05, 0.18);
  const y = ground + T.clear - drop;
  const rotE = [tiltX, rot, tiltZ];
  const c = Math.cos(rot), s = Math.sin(rot);
  const W = (lx, ly, lz) => [x + lx * c + lz * s, y + ly - tiltX * lz * 0.9 + tiltZ * lx, z - lx * s + lz * c];
  if (o.flip) {
    place(paint, GEO[type], x, ground + T.H - T.clear + 0.05, z, [0.05, rot, Math.PI - 0.08]);
    addBox(x, ground + T.H / 2, z, T.W, T.H, T.L, rot).car = type;
    return;
  }
  place(paint, GEO[type], x, y - T.clear, z, rotE);
  const [ux, uy, uz] = W(0, T.clear * 0.2, 0);
  box(M.dark, ux, uy - T.clear + 0.35, uz, T.W - 0.2, 0.08, T.L - 0.4, { rot, rx: tiltX, rz: tiltZ });
  for (const [z0, z1, y0, y1] of T.windows) for (const side2 of [-1, 1]) {
    const glass = !burnt && R2() < 0.7;
    const [wx, wy, wz] = W(side2 * (T.W / 2 + 5e-3), (y0 + y1) / 2 - T.clear, (z0 + z1) / 2);
    box(M.dark, wx - side2 * Math.cos(rot) * 0.03, wy, wz + side2 * Math.sin(rot) * 0.03, 0.02, y1 - y0, z1 - z0, { rot, rx: tiltX, rz: tiltZ, tile: 1 });
    if (glass) addPane(wx + side2 * Math.cos(rot) * 0.01, wy, wz - side2 * Math.sin(rot) * 0.01, [tiltX, rot + Math.PI / 2, tiltZ], z1 - z0 - 0.04, y1 - y0 - 0.04);
  }
  for (const key2 of ["shield", "rear"]) {
    const sh = T[key2];
    if (!sh) continue;
    const [z0, y0, z1, y1] = sh, len = Math.hypot(z1 - z0, y1 - y0), ang = Math.atan2(z1 - z0, y1 - y0);
    const [wx, wy, wz] = W(0, (y0 + y1) / 2 - T.clear, (z0 + z1) / 2 + (key2 === "shield" ? -0.02 : 0.02));
    const intact = !burnt && R2() < 0.65;
    box(M.dark, wx, wy, wz, T.W - 0.3, len, 0.02, { rot, rx: tiltX + ang, rz: tiltZ, tile: 1 });
    if (intact) {
      const off = key2 === "shield" ? -0.03 : 0.03;
      addPane(wx + Math.sin(rot) * off, wy + 0.01, wz + Math.cos(rot) * off, [tiltX + ang, rot, tiltZ], T.W - 0.36, len - 0.04);
    }
  }
  const [bx, by, bz] = W(0, 0.45 - T.clear + 0.15, -T.L / 2 - 0.06);
  box(M.steel, bx, by, bz, T.W, 0.12, 0.08, { rot, rx: tiltX, rz: tiltZ });
  if (T.bed) {
    const [fx, fy, fz] = W(0, 1.25 - T.clear, 1.2);
    box(M.planksDark, fx, fy, fz, T.W, 0.1, 3.6, { rot, rx: tiltX, rz: tiltZ, tile: 1.2 });
    for (const side2 of [-1, 1]) {
      const [sx2, sy2, sz2] = W(side2 * (T.W / 2 - 0.04), 1.65 - T.clear, 1.2);
      if (R2() < 0.8) box(M.planksPaint, sx2, sy2, sz2, 0.06, 0.7, 3.6, { rot, rx: tiltX, rz: tiltZ + side2 * (R2() < 0.3 ? 0.4 : 0), tile: 1.2 });
    }
    const [tx, ty, tz] = W(0, 1.65 - T.clear, 3);
    box(M.planksPaint, tx, ty, tz, T.W, 0.7, 0.06, { rot, rx: tiltX + (R2() < 0.5 ? 0.9 : 0), rz: tiltZ, tile: 1.2 });
    const [rx2, ry2, rz2] = W(0, 0.95 - T.clear, 1.2);
    box(M.dark, rx2, ry2, rz2, 0.25, 0.25, 4.5, { rot, rx: tiltX, rz: tiltZ });
  }
  const tire = new THREE17.CylinderGeometry(T.wheelR, T.wheelR, 0.26, 14);
  const rim = new THREE17.CylinderGeometry(T.wheelR * 0.55, T.wheelR * 0.55, 0.28, 10);
  for (const az of T.axle) for (const side2 of [-1, 1]) {
    const gone = burnt || R2() < 0.25;
    const [wx, wy, wz] = W(side2 * (T.W / 2 - 0.12), T.wheelR - T.clear + (gone ? -T.wheelR * 0.4 : 0) + drop * 0.6, az);
    if (!gone || burnt) place(M.rust, rim, wx, Math.max(wy, ground + T.wheelR * 0.45), wz, [0, rot, Math.PI / 2]);
    if (!gone) place(M.rubber, tire, wx, Math.max(wy, ground + T.wheelR * 0.8), wz, [0, rot, Math.PI / 2], [1, 1, 0.85]);
  }
  if (R2() < 0.35 && type !== "bus") {
    const side2 = R2() < 0.5 ? -1 : 1;
    const [dx, , dz] = W(side2 * (T.W / 2 + 0.9), 0, -0.2);
    box(paint, dx, terrainH(dx, dz) + 0.05, dz, 1, 0.05, 0.9, { rot: rot + R2.range(-0.5, 0.5), rx: 0.06, tile: 1 });
  }
  addBox(x, ground + T.H / 2 - drop / 2, z, T.W, T.H - drop, T.L, rot, { walk: false }).car = type;
}
function carFree(x, z, rot, L, W) {
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const [a, b] of [[0, 0], [-W / 2, -L / 2], [W / 2, -L / 2], [-W / 2, L / 2], [W / 2, L / 2], [0, -L / 2], [0, L / 2]]) {
    const px = x + a * c + b * s, pz = z - a * s + b * c;
    if (trenchDist(px, pz) < TW.cap + 0.7 || hgRho(px, pz) < 1.1 || inCamp(px, pz, 1) || streamAt(px, pz).d < 6 || inBog(px, pz) > 0) return false;
    for (const p of PADS) if (padRectDist(p, px, pz) < 0.6) return false;
    for (const k of KEEPOUT) if ((k.x - px) ** 2 + (k.z - pz) ** 2 < (k.r + 0.3) ** 2) return false;
  }
  return true;
}
var CAR_DIM = { sedan: [4.2, 1.7], van: [4.4, 2] };
var ROAD_CARS = [["дорога на Заречье", 0.35, "van", 3.4, 0.2, { paint: 3 }], ["просёлок через брод", 0.62, "sedan", 3, 0.3, { burnt: true }], ["дорога на склад ГСМ", 0.55, "sedan", -3.2, -0.3, { paint: 0, flip: true }], ["улица", 0.18, "sedan", 3.4, 0.15, { paint: 2 }], ["дорога на ферму", 0.7, "van", -3.4, 0.4, { paint: 1, tilt: 0.1, roll: 0.12 }]];
function planProps() {
  for (const car of ROAD_CARS) {
    const [name, t, type, off, rotAdd] = car, [L, W] = CAR_DIM[type], p = PATHS.find((q) => q.name === name);
    if (!p) continue;
    for (let i = 0; i < 40; i++) {
      const s = p.len * clamp(t + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 0.02, 0.05, 0.95), q = polyAt(p.pts, s);
      const x = q.x - q.tz * off, z = q.z + q.tx * off, rot = Math.atan2(q.tx, q.tz) + rotAdd;
      if (!carFree(x, z, rot, L, W) || inPlan(x, z, 2.5)) continue;
      car.at = [x, z, rot];
      keep(x, z, type === "van" ? 3 : 2.6);
      break;
    }
  }
}
var BARRELS = [];
var barrelIMs = [];
function buildBarrels(R2) {
  const spots = [];
  const D0 = BASES.depot.F, at = (a, b) => D0.p(a, b);
  const clusters = [[...at(-12, 6), 6], [...at(9, 13), 5], [...at(-6, 10), 3], [12, -96, 3], [-20, -132, 3], [...vxz(VIL.street + 7, -22), 2], [...vxz(VIL.street - 6, 35), 2], [44, 30, 3], [-30, 30, 2], [30, -40, 2]];
  for (const [cx, cz, n2] of clusters) for (const s of [1]) for (let i = 0; i < n2; i++) {
    for (let t = 0; t < 12; t++) {
      const x = cx + R2.range(-2.5, 2.5), z = cz + R2.range(-2.5, 2.5);
      if (!isFree(x, z, 0.4, { pathPad: 0.3 }) || treeNear(x, z, 0.5)) continue;
      spots.push([x, z, R2() < 0.25]);
      keep(x, z, 0.5);
      break;
    }
  }
  const geo = new THREE18.CylinderGeometry(0.3, 0.3, 0.88, 16, 1);
  const ribs = new THREE18.TorusGeometry(0.3, 0.018, 4, 16);
  ribs.rotateX(Math.PI / 2);
  const merged = [geo, ribs.clone().translate(0, 0.2, 0), ribs.clone().translate(0, -0.2, 0)];
  const pos = [], nrm = [], uv = [], idx2 = [];
  let off = 0;
  for (const g of merged) {
    const u = g.attributes.uv.array.slice();
    if (g === geo) for (let i = 0; i < u.length; i += 2) {
      u[i] *= 2;
    }
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
    uv.push(...u);
    for (const i of g.index.array) idx2.push(i + off);
    off += g.attributes.position.count;
  }
  const bg = new THREE18.BufferGeometry();
  bg.setAttribute("position", new THREE18.Float32BufferAttribute(pos, 3));
  bg.setAttribute("normal", new THREE18.Float32BufferAttribute(nrm, 3));
  bg.setAttribute("uv", new THREE18.Float32BufferAttribute(uv, 2));
  bg.setIndex(idx2);
  const per = M.barrel.map(() => []);
  spots.forEach(([x, z, tipped], i) => per[i % M.barrel.length].push([x, z, tipped]));
  barrelIMs = per.map((list, mi) => {
    const im3 = new THREE18.InstancedMesh(bg, M.barrel[mi], Math.max(1, list.length));
    im3.count = list.length;
    im3.castShadow = true;
    im3.receiveShadow = true;
    im3.frustumCulled = false;
    scene.add(im3);
    list.forEach(([x, z, tipped], k) => {
      const b = { im: im3, k, pos: new THREE18.Vector3(x, 0, z), vel: new THREE18.Vector3(), q: new THREE18.Quaternion(), w: new THREE18.Vector3(), rest: 0, tipped };
      const y = hFast(x, z);
      if (tipped) {
        b.q.setFromEuler(new THREE18.Euler(Math.PI / 2, R2() * TAU, 0, "YXZ"));
        b.pos.y = y + 0.3;
      } else {
        b.q.setFromAxisAngle(new THREE18.Vector3(0, 1, 0), R2() * TAU);
        b.pos.y = y + 0.44;
      }
      b.col = addCircle(x, z, 0.33, y, y + 0.9);
      b.col.dyn = true;
      BARRELS.push(b);
      writeBarrel(b);
      if (PHYS.ready) {
        b.phys = addBody({
          shape: "cyl",
          size: [0.3, 0.88],
          mass: 18,
          pos: b.pos,
          quat: b.q,
          keep: true,
          friction: 0.7,
          restitution: 0.25,
          rolling: 0.02,
          damp: [0.08, 0.25],
          float: 2.4,
          rad: 0.3,
          sync: (p, q) => {
            b.pos.copy(p);
            b.q.copy(q);
            b.col.x = p.x;
            b.col.z = p.z;
            b.col.y0 = p.y - 0.45;
            b.col.y1 = p.y + 0.45;
            writeBarrel(b);
          }
        });
      }
    });
    return im3;
  });
}
var _m5 = new THREE18.Matrix4();
var _one = new THREE18.Vector3(1, 1, 1);
function writeBarrel(b) {
  b.im.setMatrixAt(b.k, _m5.compose(b.pos, b.q, _one));
  b.im.instanceMatrix.needsUpdate = true;
}
function blastBarrels(x, y, z, power) {
  if (PHYS.ready) return;
  for (const b of BARRELS) {
    const dx = b.pos.x - x, dy = b.pos.y - y, dz = b.pos.z - z, d = Math.hypot(dx, dy, dz);
    if (d > 9) continue;
    const f = power * (1 - d / 9) * (1 - d / 9) * 14;
    b.vel.x += dx / (d + 0.3) * f;
    b.vel.z += dz / (d + 0.3) * f;
    b.vel.y += f * 0.7 + 1.5;
    b.w.set((Math.random() - 0.5) * f * 2, (Math.random() - 0.5) * f, (Math.random() - 0.5) * f * 2);
    b.rest = 0;
  }
}
function fallenLog(x, z, rot, L, r, R2) {
  const y = hFast(x, z);
  const a = Math.cos(rot), s = Math.sin(rot);
  const y2 = hFast(x + s * L / 2, z + a * L / 2), y1 = hFast(x - s * L / 2, z - a * L / 2);
  const pitch = Math.atan2(y2 - y1, L);
  const g = new THREE18.CylinderGeometry(r * 0.75, r, L, 9, 1);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * L / 1.2);
  place(M.barkPine, g, x, y + r * 0.8, z, [Math.PI / 2 - pitch, rot, 0]);
  for (let i = 0; i < 4; i++) {
    const t = R2.range(-0.4, 0.45) * L, bx = x + s * t, bz = z + a * t;
    cyl(M.deadwood, bx, y + r * 1.4 + 0.2, bz, 0.04, 0.02, R2.range(0.5, 1.1), { seg: 4, rot: [R2.range(-0.8, 0.8), R2() * TAU, R2.range(-0.8, 0.8)] });
  }
  if (R2() < 0.5) {
    const rx = x - s * L / 2, rz = z - a * L / 2;
    const disc = new THREE18.IcosahedronGeometry(1, 1);
    const pa = disc.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const k = 1 + 0.28 * Math.sin(pa.getX(i) * 4.1 + pa.getY(i) * 3.3) + R2.range(-0.08, 0.08);
      pa.setXYZ(i, pa.getX(i) * k * r * 3, pa.getY(i) * k * r * 2.6, pa.getZ(i) * 0.22);
    }
    disc.computeVertexNormals();
    const gy = hFast(rx, rz) + r * 2;
    place(M.dirtMound, disc, rx, gy, rz, [0.1, rot, R2.range(-0.3, 0.3)]);
    for (let k = 0; k < 7; k++) {
      const ang = R2() * TAU, len = R2.range(0.6, 1.4);
      cyl(M.deadwood, rx + Math.cos(ang) * r * 2 * Math.cos(rot), gy + Math.sin(ang) * r * 2, rz - Math.cos(ang) * r * 2 * Math.sin(rot), 0.05, 0.015, len, { seg: 4, rot: [R2.range(-1.2, 1.2), rot + R2.range(-0.5, 0.5), ang] });
    }
    addBox(rx, hFast(rx, rz) + r * 2.2, rz, r * 6, r * 5.5, 0.5, rot);
  }
  addBox(x, y + r * 0.8, z, r * 1.8, r * 1.8, L, rot);
}
function makeStump(x, z, R2, o = {}) {
  const y = hFast(x, z) - 0.06, r = o.r ?? R2.range(0.2, 0.42), h = o.h ?? R2.range(0.3, 0.8), sawn = o.sawn ?? R2() < 0.6;
  const bark2 = o.bark ?? (R2() < 0.5 ? M.barkPine : M.barkSpruce);
  const g = new THREE18.CylinderGeometry(r, r * 1.3, h, 12, 3);
  const pa = g.attributes.position, col = new Float32Array(pa.count * 3);
  const ta = R2() * TAU, tilt = sawn ? R2.range(0.05, 0.16) : 0, tx = Math.cos(ta), tz = Math.sin(ta);
  for (let i = 0; i < pa.count; i++) {
    let vx = pa.getX(i), vy = pa.getY(i), vz = pa.getZ(i);
    const a = Math.atan2(vz, vx), k = 1 + 0.09 * Math.sin(a * 3 + r * 10) + 0.05 * Math.sin(a * 7);
    const t = (vy + h / 2) / h;
    vx *= k * (1 + (1 - t) * (1 - t) * 0.25);
    vz *= k * (1 + (1 - t) * (1 - t) * 0.25);
    if (t > 0.99) vy += (vx * tx + vz * tz) * tilt;
    pa.setXYZ(i, vx, vy, vz);
    const moss = (1 - t) * (0.5 + 0.5 * Math.max(0, Math.sin(a - 1))), grey = t * 0.25;
    col[i * 3] = 1 - moss * 0.45 + grey * 0.2;
    col[i * 3 + 1] = 1 - moss * 0.1 + grey * 0.2;
    col[i * 3 + 2] = 1 - moss * 0.6 + grey * 0.25;
  }
  g.setAttribute("color", new THREE18.BufferAttribute(col, 3));
  g.computeVertexNormals();
  place(bark2, g, x, y + h / 2, z, 0);
  if (sawn) {
    const cap = new THREE18.CircleGeometry(r * 1.02, 14);
    cap.rotateX(-Math.PI / 2);
    const cp = cap.attributes.position;
    for (let i = 0; i < cp.count; i++) cp.setY(i, (cp.getX(i) * tx + cp.getZ(i) * tz) * tilt);
    cap.computeVertexNormals();
    place(M.stumpTop, cap, x, y + h + 3e-3, z, 0);
  } else {
    const sp = new THREE18.ConeGeometry(r * 0.95, r * 1.4, 9, 1, true), sa = sp.attributes.position;
    for (let i = 0; i < sa.count; i++) if (sa.getY(i) > 0) sa.setXYZ(i, sa.getX(i) + R2.range(-0.08, 0.08), sa.getY(i) * R2.range(0.4, 1.3), sa.getZ(i) + R2.range(-0.08, 0.08));
    sp.computeVertexNormals();
    place(M.logEnd, sp, x, y + h + r * 0.5, z, [R2.range(-0.2, 0.2), R2() * TAU, R2.range(-0.2, 0.2)]);
    place(M.stumpTop, new THREE18.CircleGeometry(r * 0.98, 12), x, y + h - 0.01, z, [-Math.PI / 2, 0, 0]);
  }
  const nr = 4 + R2.int(0, 2);
  for (let i = 0; i < nr; i++) {
    const a = i / nr * TAU + R2.range(-0.3, 0.3), L = R2.range(0.45, 0.9);
    const a0 = new THREE18.Vector3(x + Math.cos(a) * r * 0.9, y + 0.18, z + Math.sin(a) * r * 0.9), b0 = new THREE18.Vector3(x + Math.cos(a) * (r + L), hFast(x + Math.cos(a) * (r + L), z + Math.sin(a) * (r + L)) - 0.08, z + Math.sin(a) * (r + L));
    beam(bark2, a0, b0, r * 0.32, { r1: 0.025, seg: 6 });
  }
  if (!sawn || R2() < 0.3) for (let i = 0; i < 2 + R2.int(0, 2); i++) {
    const a = R2() * TAU, fy2 = y + R2.range(0.15, h * 0.85), fr = R2.range(0.06, 0.12);
    const fg = new THREE18.CylinderGeometry(fr, fr * 0.8, 0.035, 10, 1, false, 0, Math.PI);
    place(M.logEnd, fg, x + Math.cos(a) * r * 1.05, fy2, z + Math.sin(a) * r * 1.05, [0, -a + Math.PI / 2, 0]);
  }
  addCircle(x, z, r * 1.2, y, y + h);
}
function stump(x, z, R2) {
  makeStump(x, z, R2);
}
function boulder(x, z, s, R2) {
  const g = new THREE18.IcosahedronGeometry(1, 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const n2 = 1 + 0.18 * Math.sin(vx * 3.1 + vz * 2.3) + 0.12 * Math.sin(vy * 5.2 + vx * 1.7);
    p.setXYZ(i, vx * n2 * R2.range(0.95, 1.05), vy * n2 * 0.62, vz * n2);
    const moss = clamp(vy * 1.4, 0, 1);
    col[i * 3] = 1 - moss * 0.45;
    col[i * 3 + 1] = 1 - moss * 0.12;
    col[i * 3 + 2] = 1 - moss * 0.6;
  }
  g.setAttribute("color", new THREE18.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const y = hFast(x, z);
  place(M.stone, g, x, y + s * 0.18, z, R2() * TAU, [s * R2.range(1, 1.5), s, s * R2.range(0.8, 1.2)]);
  addCircle(x, z, s * 1.05, y, y + s * 0.8);
}
function buildProps() {
  const R2 = rng(2468);
  ROAD_CARS.forEach((car, i) => {
    if (!car.at) return;
    const [x, z, rot] = car.at;
    vehicle(car[2], x, z, rot, { ...car[5], seed: 40 + i });
  });
  buildBarrels(R2);
  // бурелом: группы поваленных стволов крест-накрест, вывороченные корни
  let n2 = 0;
  for (let t = 0; t < 5e3 && n2 < 80; t++) {
    const x = R2.range(-MAP.PLAY + 6, MAP.PLAY - 6), z = R2.range(-MAP.PLAY + 6, MAP.PLAY - 6);
    if (forestFast(x, z) < 0.45) continue;
    const k = R2() < 0.3 ? 3 : 1;
    for (let j = 0; j < k; j++) {
      const rot = R2() * TAU, L = R2.range(6, 13), r = R2.range(0.2, 0.38), px = x + R2.range(-2, 2) * (k > 1), pz = z + R2.range(-2, 2) * (k > 1), ca = Math.cos(rot), sa = Math.sin(rot);
      let ok = true;
      for (const q of [-0.5, 0, 0.5]) if (!isFree(px + sa * L * q, pz + ca * L * q, 1, { pathPad: 0.6 }) || treeNear(px + sa * L * q, pz + ca * L * q, 0.8)) ok = false;
      if (!ok) continue;
      fallenLog(px, pz, rot, L, r, R2);
      keep(px, pz, L / 2);
      n2++;
    }
  }
  for (let t = 0; t < 3e3 && n2 < 330; t++) {
    const x = R2.range(-MAP.PLAY, MAP.PLAY), z = R2.range(-MAP.PLAY, MAP.PLAY);
    if (!isFree(x, z, 0.5) || treeNear(x, z, 0.6)) continue;
    stump(x, z, R2);
    n2++;
  }
  let b = 0;
  for (let t = 0; t < 3e3 && b < 60; t++) {
    const x = R2.range(-MAP.PLAY + 4, MAP.PLAY - 4), z = R2.range(-MAP.PLAY + 4, MAP.PLAY - 4), s = R2.range(0.6, 1.5);
    if (!isFree(x, z, s + 0.4) || treeNear(x, z, s)) continue;
    boulder(x, z, s, R2);
    keep(x, z, s);
    b++;
  }
}
var THREE19 = ctx.THREE;
var CLOTHS = [];
function makeCloth({ nx, ny, place: place2, pinFn, material, drag = 0.985, wind = 1, stiff = 5, uvScale = [1, 1] }) {
  const geo = new THREE19.PlaneGeometry(1, 1, nx - 1, ny - 1);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]);
  const N2 = nx * ny;
  const P2 = new Float32Array(N2 * 3), O = new Float32Array(N2 * 3), pin = new Uint8Array(N2);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, p = place2(i / (nx - 1), j / (ny - 1));
    P2[k * 3] = O[k * 3] = p.x;
    P2[k * 3 + 1] = O[k * 3 + 1] = p.y;
    P2[k * 3 + 2] = O[k * 3 + 2] = p.z;
    pin[k] = pinFn(i, j) ? 1 : 0;
  }
  const links = [];
  const L = (a, b) => links.push(a, b, Math.hypot(P2[a * 3] - P2[b * 3], P2[a * 3 + 1] - P2[b * 3 + 1], P2[a * 3 + 2] - P2[b * 3 + 2]));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (i + 1 < nx) L(k, k + 1);
    if (j + 1 < ny) L(k, k + nx);
    if (i + 1 < nx && j + 1 < ny) {
      L(k, k + nx + 1);
      L(k + 1, k + nx);
    }
    if (i + 2 < nx) L(k, k + 2);
    if (j + 2 < ny) L(k, k + 2 * nx);
  }
  const mesh = new THREE19.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const pos = geo.attributes.position;
  for (let k = 0; k < N2; k++) pos.setXYZ(k, P2[k * 3], P2[k * 3 + 1], P2[k * 3 + 2]);
  geo.computeVertexNormals();
  const c = {
    mesh,
    geo,
    P: P2,
    O,
    pin,
    links: new Float32Array(links),
    N: N2,
    drag,
    wind,
    stiff,
    frame: 0,
    center: new THREE19.Vector3(P2[0], P2[1], P2[2]),
    phase: Math.random() * 10
  };
  CLOTHS.push(c);
  return c;
}
// шаг ткани (флаги, тенты) — при извлечении карты из HTML вызов потерялся, флаги висели неподвижно
var CLOTH_G = -9.8;
var _bl = new THREE.Vector4();
var _fr = new THREE.Frustum();
var _pm = new THREE.Matrix4();
var _sp = new THREE.Sphere();
function stepCloth(dt, t) {
  if (!(dt > 1e-4)) return;
  const h = Math.min(dt, 1 / 40);
  const wx0 = WIND.dir.x * WIND.strength * 9, wz0 = WIND.dir.y * WIND.strength * 9;
  _bl.copy(windUniforms.uBlast.value);
  const blastStr = windUniforms.uBlastStr.value;
  _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _fr.setFromProjectionMatrix(_pm);
  const far2 = Q.clothR * Q.clothR;
  for (const c of CLOTHS) {
    const d2 = c.center.distanceToSquared(camera.position);
    if (d2 > far2 && c.frame > 0) {
      c.frame++;
      continue;
    }
    const vis = _fr.intersectsSphere(_sp.set(c.center, 7));
    const every = !vis ? 8 : d2 > 22500 ? 4 : d2 > 3600 ? 2 : 1;
    if (c.frame++ % every !== 0) continue;
    const step = h * every, s2 = step * step;
    const { P: P2, O, pin, N: N2 } = c;
    const nrm = c.geo.attributes.normal.array;
    const turbT = t + c.phase;
    for (let k = 0; k < N2; k++) {
      if (pin[k]) continue;
      const i3 = k * 3;
      const x = P2[i3], y = P2[i3 + 1], z = P2[i3 + 2];
      const vx = (x - O[i3]) * c.drag, vy = (y - O[i3 + 1]) * c.drag, vz = (z - O[i3 + 2]) * c.drag;
      O[i3] = x;
      O[i3 + 1] = y;
      O[i3 + 2] = z;
      const tb = Math.sin(turbT * 3.1 + k * 0.23) * 0.45 + Math.sin(turbT * 7.7 + k * 0.61) * 0.25;
      let wx = wx0 * (1 + tb) * c.wind, wz = wz0 * (1 + tb) * c.wind, wy = tb * 1.6 * c.wind;
      if (blastStr > 0) {
        const bx = x - _bl.x, bz = z - _bl.z, bd = Math.hypot(bx, bz) + 0.01, tau = _bl.w - bd / 70;
        if (tau > 0 && tau < 1.5) {
          const push = Math.exp(-tau * 4) * blastStr * 60 * Math.exp(-bd / 20);
          wx += bx / bd * push;
          wz += bz / bd * push;
          wy += push * 0.3;
        }
      }
      const nxv = nrm[i3], nyv = nrm[i3 + 1], nzv = nrm[i3 + 2];
      const rel = (wx - vx / step) * nxv + (wy - vy / step) * nyv + (wz - vz / step) * nzv;
      const fx = nxv * rel * 1.4 + wx * 0.12, fy = nyv * rel * 1.4 + CLOTH_G, fz = nzv * rel * 1.4 + wz * 0.12;
      P2[i3] = x + vx + fx * s2;
      P2[i3 + 1] = y + vy + fy * s2;
      P2[i3 + 2] = z + vz + fz * s2;
    }
    const Lk = c.links, n2 = Lk.length;
    for (let it = 0; it < c.stiff; it++) {
      for (let q = 0; q < n2; q += 3) {
        const a = Lk[q] * 3, b = Lk[q + 1] * 3, rest = Lk[q + 2];
        const dx = P2[b] - P2[a], dy = P2[b + 1] - P2[a + 1], dz = P2[b + 2] - P2[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const pa = pin[Lk[q]], pb = pin[Lk[q + 1]];
        if (pa && pb) continue;
        const diff = (d - rest) / d * (pa || pb ? 1 : 0.5);
        if (!pa) {
          P2[a] += dx * diff;
          P2[a + 1] += dy * diff;
          P2[a + 2] += dz * diff;
        }
        if (!pb) {
          P2[b] -= dx * diff;
          P2[b + 1] -= dy * diff;
          P2[b + 2] -= dz * diff;
        }
      }
    }
    const pos = c.geo.attributes.position;
    pos.array.set(P2);
    pos.needsUpdate = true;
    c.geo.computeVertexNormals();
  }
}
function nudgeCloth(x, y, z, r, power) {
  for (const c of CLOTHS) {
    if (c.center.distanceTo({ x, y, z }) > r + 8) continue;
    for (let k = 0; k < c.N; k++) {
      if (c.pin[k]) continue;
      const i3 = k * 3, dx = c.P[i3] - x, dy = c.P[i3 + 1] - y, dz = c.P[i3 + 2] - z, d = Math.hypot(dx, dy, dz);
      if (d > r) continue;
      const f = (1 - d / r) * power;
      c.O[i3] -= dx / (d + 0.1) * f * 0.02;
      c.O[i3 + 1] -= dy / (d + 0.1) * f * 0.02;
      c.O[i3 + 2] -= dz / (d + 0.1) * f * 0.02;
    }
  }
}
var THREE21 = ctx.THREE;
var N = BURN.N;
var fuel = new Float32Array(N * N);
var heat = new Float32Array(N * N);
var state = new Uint8Array(N * N);
var active = [];
var FIRE = { cells: 0, trees: [], brands: [], lights: [], near: 0, structs: [] };
var MAXC = () => Math.round(500 + 900 * Q.tex);
var idx = (x, z) => {
  const i = Math.floor(x - BURN.X0), j = Math.floor(z - BURN.X0);
  return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i;
};
function lightCell(k, h) {
  if (state[k] !== 0 || fuel[k] < 0.12 || active.length >= MAXC()) return false;
  state[k] = 1;
  heat[k] = h;
  active.push(k);
  return true;
}
function ignite(x, z, r, strength = 1) {
  const wet = WEATHER.wet;
  let n2 = 0;
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dz * dz > r * r) continue;
    const k = idx(x + dx, z + dz);
    if (k < 0) continue;
    if (Math.random() < strength * (1 - wet * 0.85) && lightCell(k, 0.3 + Math.random() * 0.5)) n2++;
  }
  return n2;
}
var scorch = function(){};
var markPuddle = function(){};
var heatAt = (x, z) => {
  const k = idx(x, z);
  return k < 0 ? 0 : heat[k];
};
var igniteTree = function(){};
var attachFire = function(){};
var _d2 = new THREE21.Vector3();
var FALLING = [];
var deformCrater = function(){};
var clods = function(){};
var splinters = function(){};
var BRANCH_GEO = {};
function branchGeo(sp) {
  if (BRANCH_GEO[sp]) return BRANCH_GEO[sp];
  const stick = new THREE21.CylinderGeometry(0.018, 0.032, 1, 5, 1).rotateZ(Math.PI / 2).toNonIndexed();
  const cards = [];
  for (let k = 0; k < 4; k++) {
    const c = new THREE21.PlaneGeometry(0.5, 0.36).toNonIndexed();
    const uv2 = c.attributes.uv;
    for (let i = 0; i < uv2.count; i++) uv2.setXY(i, uv2.getX(i) * 0.5 + k % 2 * 0.5, uv2.getY(i) * 0.5 + (k > 1 ? 0.5 : 0));
    c.rotateX(-Math.PI / 2 + (k % 2 ? 0.5 : -0.5));
    c.translate(-0.1 + k * 0.18, 0.02, 0);
    cards.push(c);
  }
  const g = new THREE21.BufferGeometry();
  const parts = [stick, ...cards];
  let n2 = 0;
  for (const p of parts) n2 += p.attributes.position.count;
  const pos = new Float32Array(n2 * 3), nrm = new Float32Array(n2 * 3), uv = new Float32Array(n2 * 2), col = new Float32Array(n2 * 3).fill(0.85);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nrm.set(p.attributes.normal.array, o * 3);
    uv.set(p.attributes.uv.array, o * 2);
    o += p.attributes.position.count;
  }
  g.setAttribute("position", new THREE21.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE21.BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE21.BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE21.BufferAttribute(col, 3));
  g.addGroup(0, stick.attributes.position.count, 0);
  g.addGroup(stick.attributes.position.count, n2 - stick.attributes.position.count, 1);
  return BRANCH_GEO[sp] = g;
}
function dropBranches(t, dir2, n2, hot) {
  const G2 = treeGeo(t);
  for (let i = 0; i < n2; i++) {
    const L = sr(0.6, 1.7) * (t.h / 16), y = t.y + t.h * sr(0.35, 0.85), a = Math.atan2(dir2.z, dir2.x) + sr(-1.3, 1.3), r = sr(0.3, 1) * t.h * 0.1;
    const pos = new THREE21.Vector3(t.x + Math.cos(a) * r, y, t.z + Math.sin(a) * r);
    const mesh = new THREE21.Mesh(branchGeo(G2.sp), [M.deadwood, G2.foliage]);
    mesh.scale.setScalar(L);
    scene.add(mesh);
    const vel = new THREE21.Vector3(dir2.x * sr(1, 5) + sr(-1, 1), sr(-0.5, 2.5), dir2.z * sr(1, 5) + sr(-1, 1));
    const b = addBody({
      shape: "box",
      size: [L, 0.1 * L, 0.3 * L],
      mass: 3 * L,
      pos,
      quat: new THREE21.Quaternion().setFromEuler(new THREE21.Euler(sr(-0.4, 0.4), srnd() * TAU, sr(-0.4, 0.4))),
      vel,
      ang: new THREE21.Vector3(sr(-4, 4), sr(-4, 4), sr(-4, 4)),
      life: sr(25, 45),
      friction: 0.9,
      restitution: 0.05,
      damp: [0.35, 0.6],
      float: 1.6,
      rad: 0.06 * L,
      onDone: () => scene.remove(mesh)
    });
    if (!b) {
      scene.remove(mesh);
      continue;
    }
    b.sync = (p, q, f) => {
      mesh.position.copy(p);
      mesh.quaternion.copy(q);
      mesh.scale.setScalar(L * f);
    };
    if (hot && Math.random() < 0.45 * (1 - WEATHER.wet)) attachFire(b, sr(5, 12));
  }
  for (let i = 0; i < 26; i++) FX.alpha.spawn({
    x: t.x + sr(-1.5, 1.5),
    y: t.y + t.h * sr(0.4, 0.9),
    z: t.z + sr(-1.5, 1.5),
    vx: dir2.x * sr(0.5, 3),
    vy: sr(-0.5, 0.5),
    vz: dir2.z * sr(0.5, 3),
    size: sr(0.06, 0.16),
    life: sr(2.5, 5),
    col: [0.22, 0.2, 0.1],
    a: 0.9,
    grav: 1.4,
    drag: 1.2,
    windK: 1,
    floor: hFast(t.x, t.z)
  });
}
function colorize(g, c) {
  const n2 = g.attributes.position.count, col = g.attributes.color ? g.attributes.color.array : new Float32Array(n2 * 3).fill(1);
  for (let i = 0; i < n2; i++) {
    col[i * 3] *= c.r;
    col[i * 3 + 1] *= c.g;
    col[i * 3 + 2] *= c.b;
  }
  g.setAttribute("color", new THREE21.BufferAttribute(col, 3));
  return g;
}
function breakTree(t, dir2, k) {
  const G2 = treeGeo(t);
  hideTree(t);
  const hb = clamp(sr(0.5, 2.4) / (1 + k * 0.12), 0.35, t.h * 0.3), L = t.h - hb;
  const tint = new THREE21.Color(t.tint, t.tint, t.tint).multiplyScalar(1 - (t.char || 0) * 0.7);
  const rBase = t.r * 1.05, rB = t.r * (1 - 0.6 * hb / t.h);
  const sg = new THREE21.CylinderGeometry(rB, rBase, hb, 10, 1, false);
  const sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) if (sp.getY(i) > hb / 2 - 1e-3 && Math.abs(sp.getX(i)) + Math.abs(sp.getZ(i)) > 1e-4) sp.setY(i, hb / 2 + sr(-0.05, 0.25));
  sg.computeVertexNormals();
  const stump2 = new THREE21.Mesh(colorize(sg, tint), G2.bark);
  stump2.position.set(t.x, t.y + hb / 2, t.z);
  stump2.castShadow = stump2.receiveShadow = true;
  scene.add(stump2);
  const cap = new THREE21.Mesh(new THREE21.CircleGeometry(rB * 0.9, 10), M.logEnd);
  cap.rotation.x = -Math.PI / 2;
  cap.position.set(t.x, t.y + hb + 0.04, t.z);
  scene.add(cap);
  if (t.col) {
    removeStaticCollider(t.col);
    t.col.y1 = t.y + hb;
    addStaticCollider(t.col);
  }
  splinters(t.x, t.y + hb, t.z, dir2, 7);
  const yc = L * 0.4;
  const tg = colorize(new THREE21.CylinderGeometry(t.r * 0.15, rB * 0.97, L, 8, 3).translate(0, L / 2 - yc, 0), tint);
  let cg = G2.crown.index ? G2.crown.toNonIndexed() : G2.crown.clone();
  cg.scale(t.h, t.h, t.h);
  cg.rotateY(t.rot);
  cg.translate(0, -hb, 0);
  {
    const p = cg.attributes.position, keep2 = [];
    for (let i = 0; i < p.count; i += 3) if (Math.min(p.getY(i), p.getY(i + 1), p.getY(i + 2)) > 0.05) keep2.push(i);
    const out = new THREE21.BufferGeometry();
    for (const name of ["position", "normal", "uv", "color"]) {
      const a = cg.attributes[name];
      if (!a) continue;
      const arr = new Float32Array(keep2.length * 3 * a.itemSize);
      keep2.forEach((i, n2) => {
        for (let v = 0; v < 3; v++) for (let c = 0; c < a.itemSize; c++) arr[(n2 * 3 + v) * a.itemSize + c] = a.array[(i + v) * a.itemSize + c];
      });
      out.setAttribute(name, new THREE21.BufferAttribute(arr, a.itemSize));
    }
    cg = colorize(out, t.color);
    cg.translate(0, -yc, 0);
  }
  const group = new THREE21.Group();
  const trunkM = new THREE21.Mesh(tg, G2.bark), crownM = new THREE21.Mesh(cg, G2.foliage);
  trunkM.castShadow = crownM.castShadow = true;
  trunkM.receiveShadow = crownM.receiveShadow = true;
  crownM.customDepthMaterial = t.L.hiIM.customDepthMaterial;
  group.add(trunkM, crownM);
  scene.add(group);
  const start = new THREE21.Vector3(t.x, t.y + hb + yc + 0.02, t.z);
  group.position.copy(start);
  const axis = new THREE21.Vector3(dir2.z, 0, -dir2.x).normalize();
  const tilt = new THREE21.Quaternion().setFromAxisAngle(axis, 0.04 + k * 0.02);
  const crownR = t.h * (t.sp === "birch" ? 0.1 : 0.12);
  const fall = { t, group, age: 0, L, hb, yc, frozen: false, axis, ang: 0.04, w: 0.35 + k * 0.4 };
  fall.b = addBody({
    shape: "compound",
    mass: 120 + 900 * t.r * t.r * t.h,
    pos: start,
    quat: tilt,
    keep: true,
    friction: 1,
    restitution: 0.05,
    damp: [0.08, 0.35],
    float: 1.3,
    rad: Math.max(0.1, rB),
    parts: [{ type: "cyl", size: [Math.max(0.08, rB * 0.8), L], pos: [0, L / 2 - yc, 0] }, { type: "cyl", size: [crownR, L * 0.5], pos: [0, L * 0.68 - yc, 0] }],
    vel: new THREE21.Vector3(dir2.x * (0.6 + k * 0.5), 0.2, dir2.z * (0.6 + k * 0.5)),
    ang: axis.clone().multiplyScalar(0.35 + k * 0.45),
    sync: (p, q) => {
      group.position.copy(p);
      group.quaternion.copy(q);
    }
  });
  if (!fall.b) group.quaternion.copy(tilt);
  FALLING.push(fall);
  const d = camera.position.distanceTo(start);
  woodCrack(d, 0, 1);
  if (t.char > 0.3 || Math.random() < 0.2) igniteTree({ ...t, h: L, y: t.y + hb, x: t.x + dir2.x * L * 0.6, z: t.z + dir2.z * L * 0.6 }, 6 + k * 4);
}
function updateFalling(dt) {
  for (const f of FALLING) {
    if (f.frozen) continue;
    f.age += dt;
    if (!f.b) {
      f.w += dt * 1.4 * Math.sin(f.ang) * 9.8 / f.L;
      f.ang = Math.min(1.45, f.ang + f.w * dt);
      const q = new THREE21.Quaternion().setFromAxisAngle(f.axis, f.ang);
      const base2 = new THREE21.Vector3(f.t.x, f.t.y + f.hb, f.t.z);
      f.group.quaternion.copy(q);
      f.group.position.copy(base2).add(new THREE21.Vector3(0, f.yc, 0).applyQuaternion(q));
      if (f.ang >= 1.45) settle(f);
      continue;
    }
    if (f.age > 1.5 && !f.b.wet && (isSleeping(f.b) || f.age > 16)) settle(f);
  }
}
function settle(f) {
  f.frozen = true;
  if (f.b) freezeBody(f.b);
  const up = new THREE21.Vector3(0, 1, 0).applyQuaternion(f.group.quaternion);
  const base2 = f.group.position.clone().addScaledVector(up, -f.yc);
  const r = Math.max(0.15, f.t.r * 0.8);
  for (let s = 0.3; s < f.L * 0.75; s += 0.8) {
    const p = base2.clone().addScaledVector(up, s);
    addCircle(p.x, p.z, r, p.y - r, p.y + r).dyn = true;
  }
}
var WAVES = [];
var shockwave = function(){};
function updateWaves(dt) {
  for (let i = WAVES.length - 1; i >= 0; i--) {
    const w = WAVES[i];
    w.age += dt;
    const k = w.age / 0.32;
    if (k >= 1) {
      w.m.visible = false;
      WAVES.splice(i, 1);
      continue;
    }
    w.m.scale.setScalar(0.6 + k * 8 * w.size);
    w.m.material.uniforms.uA.value = (1 - k) * (1 - k) * 0.55;
  }
}
function onBlast(x, gy, z, size, water, opt = {}) {
  if (!water && !opt.deck) {
    const r = 0.85 + 0.75 * size;
    deformCrater(x, z, r);
    scorch(x, z, Math.ceil(r * 1.7), 1);
    markPuddle(x, z, Math.ceil(r));
    clods(x, gy, z, size, Math.round((5 + 5 * size) * (0.5 + Q.tex * 0.5)));
    const dry = 1 - WEATHER.wet;
    if (Math.random() < 0.25 + 0.7 * dry) ignite(x, z, Math.ceil(r * 1.2 + size), 0.25 + 0.5 * dry);
  }
  const wet = WEATHER.wet;
  let leafBudget = 260;
  for (const t of treesNear(x, z, 9 * size + 3)) {
    const d = Math.max(0.45, Math.hypot(t.x - x, t.z - z) - t.r);
    const k = size * 2.2 / Math.pow(d, 1.15);
    const strength = Math.max(0.5, t.r / 0.3);
    _d2.set(t.x - x, 0, t.z - z).normalize();
    if (k > 1.15 * strength && Math.random() < 0.92) {
      breakTree(t, _d2.clone(), k);
      continue;
    }
    if (!t.dead && k > 0.08 && leafBudget > 0) {
      const nl = Math.min(leafBudget, 8 + k * 40);
      leafBudget -= nl;
      leafBurst(t.x, t.y + t.h * sr(0.45, 0.85), t.z, nl, t.sp, _d2, t.h * 0.12);
    }
    if (!t.dead && k > 0.22) {
      dropBranches(t, _d2, Math.min(9, Math.round(1 + k * 5 * (0.6 + Q.tex * 0.4))), d < 3 * size);
      thinTree(t, Math.min(0.5, k * 0.25));
    }
    if (!t.dead && d < 3.5 * size && Math.random() < 0.5 * (1 - wet)) {
      igniteTree(t, 8 + k * 10);
      charTree(t, 0.55);
    } else if (d < 3 * size) charTree(t, 0.25);
  }
  blastGlass(x, gy, z, size);
  blastStructs(x, gy, z, size);
  blastImpulse(x, gy, z, 9 * size + 4, 9 * size);
  shockwave(x, gy, z, size, water);
  return true;
}
function updateDestruction(dt) {
  updateFalling(dt);
  updateWaves(dt);
}
var THREE25 = ctx.THREE;
var THREE24 = ctx.THREE;
var THREE23 = ctx.THREE;
var THREE22 = ctx.THREE;
var LADDERS = [];
function addLadder(o) {
  const L = { w: 0.5, ...o, panel: CAPTURE.panel || null };
  const l = Math.hypot(L.nx, L.nz);
  L.nx /= l;
  L.nz /= l;
  LADDERS.push(L);
  return L;
}
var V = (x, y, z) => new THREE22.Vector3(x, y, z);
var LANDMARKS = { towers: [], stands: [], water: [], bridges: [], fords: [], boats: [], culverts: [], scorch: [], sites: [] };
function findSpot(tx, tz, r, o = {}) {
  const ok = (x, z) => isFree(x, z, r, { pathPad: o.pathPad ?? 1, trenchPad: o.trenchPad ?? 2.5 }) && streamAt(x, z).d > r + 4 && inBog(x, z) === 0 && !CRATERS.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r + 1);
  for (let k = 0; k < 400; k++) {
    const a = k * 2.39996, d = Math.sqrt(k) * 1.1;
    const x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d;
    if (ok(x, z) && (!o.sym || ok(-x, -z))) return [x, z];
  }
  return [tx, tz];
}
function planLandmarks() {
  planExtraLandmarks();
}
function ladderGeo(mat, x, z, y0, y1, tx, tz, w = 0.5, hoops = null) {
  for (const e of [-1, 1]) beam(mat, V(x + tx * e * w / 2, y0, z + tz * e * w / 2), V(x + tx * e * w / 2, y1 + 0.9, z + tz * e * w / 2), 0.025, { seg: 5 });
  for (let y = y0 + 0.28; y < y1 + 0.05; y += 0.3) beam(mat, V(x - tx * w / 2, y, z - tz * w / 2), V(x + tx * w / 2, y, z + tz * w / 2), 0.016, { seg: 4, cast: false });
  if (hoops) {
    // ограждение-«корзина» по правилам работ на высоте: дуги R 0,35–0,4 м с шагом 0,8 м от высоты 2,4 м, дальняя
    // точка дуги в 0,7–0,8 м от лестницы, пять вертикальных полос. Дуга лежит в плоскости (вдоль ступени t, от стены n):
    // раньше тор был повёрнут поперёк и висел сбоку от лестницы; добавлены кронштейны дуги к тетивам
    const [nx, nz] = hoops, r = 0.38, c0 = 0.38;
    const arc2 = new THREE22.TorusGeometry(r, 0.018, 4, 12, Math.PI);
    const t3 = new THREE22.Vector3(tx, 0, tz).normalize(), n3 = new THREE22.Vector3(nx, 0, nz).normalize(), b3 = new THREE22.Vector3().crossVectors(t3, n3).normalize();
    arc2.applyMatrix4(new THREE22.Matrix4().makeBasis(t3, n3, b3));
    for (let y = y0 + 2.4; y < y1 + 0.8; y += 0.8) {
      const g = arc2.clone().translate(x + nx * c0, y, z + nz * c0);
      put(mat, normalize(g, mat), true);
      for (const e of [-1, 1]) beam(mat, V(x + tx * e * w / 2, y, z + tz * e * w / 2), V(x + tx * e * r + nx * c0, y, z + tz * e * r + nz * c0), 0.014, { seg: 3, cast: false });
    }
    for (const a of [0, 0.25, 0.5, 0.75, 1]) {
      const ang = a * Math.PI, ox = Math.cos(ang) * r, oz = Math.sin(ang) * r;
      const px = x + nx * c0 + tx * ox + nx * oz, pz = z + nz * c0 + tz * ox + nz * oz;
      beam(mat, V(px, y0 + 2.4, pz), V(px, y1 + 0.8, pz), 0.012, { seg: 3, cast: false });
    }
  }
}
function waterTower(t, R2) {
  const { x, z, rot } = t, y = terrainH(x, z) - 0.05, HC = 14, HT = 3.2;
  const paint = t.paint === "camp" ? M.tankCamp : M.tankGrey;
  const c = Math.cos(rot), s = Math.sin(rot);
  const S = beginStruct({ kind: "tower", name: "водокачка", x, z, rot, w: 5, d: 5, h: HC + HT + 1.4, fy: y, fuel: 0.1, quiet: true });
  noPanel();
  cyl(M.concrete, x, y + 0.3, z, 1.55, 1.5, 0.7, { seg: 20, tile: 1 });
  const base2 = panel("wall", { hp: 2.4, mode: "rigid", density: 4e3, float: 0, burnable: false });
  cyl(paint, x, y + 2.2, z, 1.2, 1.2, 3.2, { seg: 20, tile: 1.6 });
  addCircle(x, z, 1.25, y, y + 3.8);
  base2.center = V(x, y + 2, z);
  const up = panel("prop", { hp: 99, mode: "rigid", density: 900, float: 0, burnable: false, sup: { list: [base2], frac: 0.99 } });
  up.big = true;
  S.towerTop = up;
  up.hingeHalf = 2.3;
  up.hingeLen = HC + HT + 1.4;
  cyl(paint, x, y + 3.8 + (HC - 3.8) / 2, z, 1.18, 1.2, HC - 3.8, { seg: 20, tile: 1.6 });
  addCircle(x, z, 1.25, y + 3.8, y + HC);
  cyl(paint, x, y + HC + HT / 2, z, 1.85, 1.85, HT, { seg: 24, tile: 1.6 });
  cyl(M.steel, x, y + HC + 0.05, z, 1.9, 1.3, 0.3, { seg: 24 });
  cyl(M.rust, x, y + HC + HT * 0.66, z, 1.87, 1.87, 0.06, { seg: 24 });
  const cone = new THREE22.ConeGeometry(1.98, 1.1, 24, 1, true);
  place(t.paint === "camp" ? M.roofCamp : M.roofRust, cone, x, y + HC + HT + 0.55, z, 0);
  cyl(M.steel, x, y + HC + HT + 1.25, z, 0.12, 0.08, 0.3, { seg: 8 });
  const tank2 = addCircle(x, z, 1.88, y + HC, y + HC + HT);
  tank2.leak = { x, z, r: 1.85, y0: y + HC, y1: y + HC + HT };
  addCircle(x, z, 1.4, y + HC + HT, y + HC + HT + 1);
  if (t.paint === "camp") {
    const star = new THREE22.Shape();
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 0.2 : 0.5;
      i ? star.lineTo(Math.cos(a) * r, -Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, -Math.sin(a) * r);
    }
    const sg = new THREE22.ShapeGeometry(star);
    place(M.paintRed, sg, x + s * 1.87, y + HC + HT * 0.45, z + c * 1.87, rot);
  }
  const GR0 = 1.9, GR1 = 2.65, gy = y + HC - 0.02;
  for (let i = 0; i < 12; i++) {
    const a = rot + (i + 0.5) / 12 * TAU, ca = Math.cos(a), sa = Math.sin(a), r = (GR0 + GR1) / 2;
    const px2 = x + sa * r, pz2 = z + ca * r, wd = 2 * Math.PI * GR1 / 12 + 0.05;
    box(M.grate, px2, gy, pz2, wd, 0.05, GR1 - GR0 + 0.05, { rot: a, tile: 0.5 });
    if (i !== 0 && i !== 11) addBox(px2, gy - 0.05, pz2, wd, 0.12, GR1 - GR0, a, { walk: true });
    const rx = x + sa * GR1, rz = z + ca * GR1;
    beam(M.steel, V(rx, gy, rz), V(rx, gy + 1.05, rz), 0.02, { seg: 4, cast: false });
    const a2 = rot + (i + 1.5) / 12 * TAU;
    beam(M.steel, V(rx, gy + 1.05, rz), V(x + Math.sin(a2) * GR1, gy + 1.05, z + Math.cos(a2) * GR1), 0.018, { seg: 4, cast: false });
    if (i !== 0 && i !== 11) addBox(rx, gy + 0.6, rz, wd, 1.2, 0.1, a, { walk: false });
  }
  for (let i = 0; i < 12; i++) {
    const a = rot + i / 12 * TAU;
    beam(M.steel, V(x + Math.sin(a) * 1.25, gy - 1.3, z + Math.cos(a) * 1.25), V(x + Math.sin(a) * GR1, gy - 0.03, z + Math.cos(a) * GR1), 0.03, { seg: 4, cast: false });
  }
  const lx = x + s * 1.23, lz = z + c * 1.23;
  ladderGeo(M.steel, lx, lz, y + 0.6, gy, c, -s, 0.46, [s, c]);
  const ea = rot + 1.5 / 12 * TAU;
  addLadder({ x: lx, z: lz, nx: s, nz: c, y0: y + 0.05, y1: gy, w: 0.46, exit: [x + Math.sin(ea) * 2.25, gy + 0.03, z + Math.cos(ea) * 2.25] });
  const px = x - s * 1.3, pz = z - c * 1.3;
  cyl(M.rust, px, y + HC / 2, pz, 0.09, 0.09, HC, { seg: 8 });
  cyl(M.rust, px, y + 0.9, pz, 0.16, 0.16, 0.3, { seg: 10, rot: [Math.PI / 2, rot, 0] });
  endStruct();
  t.struct = S;
}
var STREAM_VS = (
  /* glsl */
  `
  attribute float aS; attribute float aSlope;
  varying vec3 vW; varying vec2 vUv; varying float vSlope;
  #include <fog_pars_vertex>
  void main(){
    vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vUv = vec2(uv.x, aS); vSlope = aSlope;
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`
);
var STREAM_FS = (
  /* glsl */
  `
  uniform float uT; uniform vec3 uSky, uSun, uDeep; uniform vec3 uSunDir;
  varying vec3 vW; varying vec2 vUv; varying float vSlope;
  #include <fog_pars_fragment>
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  void main(){
    // струи вытянуты вдоль течения (изотропный шум читается как гравий), на перекатах быстрее
    float sp = 1.1 + vSlope * 40.0;
    vec2 q = vec2(vUv.x * 8.0, vUv.y * 0.55 - uT * sp);
    float r1 = n(q * 1.5), r2 = n(q * 3.2 + 3.1), r3 = n(vec2(vUv.x * 18.0, vUv.y * 1.4 - uT * sp * 1.6));
    vec3 nrm = normalize(vec3((r1 - 0.5) * 0.3 + (r3 - 0.5) * 0.12, 1.0, (r2 - 0.5) * 0.25));
    vec3 V = normalize(cameraPosition - vW);
    float fr = pow(1.0 - max(dot(nrm, V), 0.0), 5.0);
    // торфяная вода: тёмная, чай с зеленью; небо — только бликами под острым углом
    // вывод в линейном цвете: небо в тени оврага отражается слабо
    vec3 col = mix(uDeep * (0.8 + 0.4 * r1), uSky * 0.3, clamp(fr * 0.9, 0.0, 0.7));
    vec3 Hh = normalize(uSunDir + V);
    col += uSun * pow(max(dot(nrm, Hh), 0.0), 220.0) * 0.8;
    // пена только на крутых перекатах, узкими струями
    float foam = smoothstep(0.78, 0.95, r3) * smoothstep(0.012, 0.035, vSlope);
    col = mix(col, vec3(0.18, 0.19, 0.17) * (0.4 + 0.3 * length(uSky)), foam * 0.5);
    float a = mix(0.72, 0.9, fr) * (1.0 - smoothstep(0.4, 0.5, abs(vUv.x - 0.5)) * 0.75);
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
  }`
);
var STREAM_FX = { mat: null };
function streamWater(st) {
  const w = STREAM_BW + 0.35, pos = [], uv = [], aS = [], aSl = [], idx2 = [];
  const n2 = Math.floor(st.len);
  for (let i = 0; i <= n2; i++) {
    const q = polyAt(st.pts, i), y = (st.water ? st.water[Math.min(i, st.water.length - 1)] : st.bed[Math.min(i, st.bed.length - 1)] + 0.2);
    const slope = i > 0 ? Math.max(0, st.bed[i - 1] - st.bed[Math.min(i, st.bed.length - 1)]) : 0;
    for (const e of [-1, 1]) {
      pos.push(q.x - q.tz * w * e, y, q.z + q.tx * w * e);
      uv.push(e < 0 ? 0 : 1, 0);
      aS.push(i);
      aSl.push(slope);
    }
    if (i < n2) {
      const k = i * 2;
      idx2.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE22.BufferGeometry();
  g.setAttribute("position", new THREE22.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE22.Float32BufferAttribute(uv, 2));
  g.setAttribute("aS", new THREE22.Float32BufferAttribute(aS, 1));
  g.setAttribute("aSlope", new THREE22.Float32BufferAttribute(aSl, 1));
  g.setIndex(idx2);
  g.computeBoundingSphere();
  STREAM_FX.mat ??= new THREE22.ShaderMaterial({
    uniforms: THREE22.UniformsUtils.merge([THREE22.UniformsLib.fog, { uT: { value: 0 }, uSky: { value: new THREE22.Color(0.5, 0.6, 0.7) }, uSun: { value: new THREE22.Color(1, 1, 1) }, uDeep: { value: new THREE22.Color(0.012, 0.014, 8e-3) }, uSunDir: { value: V(0.3, 0.8, 0.2) } }]),
    vertexShader: STREAM_VS,
    fragmentShader: STREAM_FS,
    transparent: true,
    depthWrite: false,
    fog: true
  });
  const m = new THREE22.Mesh(g, STREAM_FX.mat);
  m.renderOrder = 2;
  m.name = "stream";
  scene.add(m);
  const R2 = rng(st.name.length * 97 + Math.round(st.pts[0][0]));
  const rock = new THREE22.DodecahedronGeometry(1, 0);
  for (let s = 3; s < st.len - 6; s += R2.range(1.5, 4)) {
    const q = polyAt(st.pts, s), e = R2.range(-1.4, 1.4), x = q.x - q.tz * e, z = q.z + q.tx * e, r = R2.range(0.12, 0.38);
    place(M.stone, rock, x, hFast(x, z) + r * 0.15, z, [R2() * 3, R2() * 3, R2() * 3], [r * 1.3, r * 0.8, r]);
  }
}
function buildLandmarks() {
  const R2 = rng(5151);
  for (const st of STREAMS) streamWater(st);
  ravineBridge(R2);
  fordStones(R2);
  buildReedsRiver();
}
var V2 = (x, y, z) => new THREE23.Vector3(x, y, z);
var WRECKS = { heli: null, art: null, mg: [], bmp: null, tank: null, smokes: [] };
function sheet(i, x, y, z, rot, o = {}) {
  const g = paperGeo(i, o.w ?? 0.21, o.h ?? 0.28);
  if (o.flat) place(M.paperAtlas, g, x, y + 4e-3, z, [-Math.PI / 2, rot, 0]);
  else place(M.paperAtlas, g, x, y, z, [o.tilt ?? 0, rot, sr(-0.08, 0.08)]);
}
function paperGeo(i, w, h) {
  const g = new THREE23.PlaneGeometry(w, h), uv = g.attributes.uv, u0 = i % 2 * 0.5, v0 = 0.5 - (i % 4 >> 1) * 0.5;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * 0.5, v0 + uv.getY(k) * 0.5);
  return g;
}
function casings(x, z, n2, big, R2, spread = 1.4, dirA = 0) {
  const g = big ? new THREE23.CylinderGeometry(0.075, 0.08, 0.45, 10) : new THREE23.CylinderGeometry(6e-3, 65e-4, 0.054, 6);
  for (let i = 0; i < n2; i++) {
    const a = dirA + sr(-1.1, 1.1), r = Math.pow(R2(), 0.6) * spread, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const y = hFast(px, pz) + (big ? 0.075 : 6e-3);
    place(M.brass, g, px, y, pz, [Math.PI / 2 + sr(-0.1, 0.1), R2() * TAU, 0]);
  }
}
function numberTex(txt, col = "#c9b04a") {
  const [c, x] = cv(256, 128);
  x.clearRect(0, 0, 256, 128);
  x.font = "bold 96px Arial, sans-serif";
  x.fillStyle = col;
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(txt, 128, 68);
  const t = tex(c);
  t.wrapS = t.wrapT = 1001;
  return t;
}
function planWrecks() {
  const [hx2, hz] = findSpot(...vxz(63, 24), 6.5);
  WRECKS.heli = { x: hx2, z: hz, rot: 0.9 };
  const [ax, az] = findSpot(40, 18, 3.5);
  WRECKS.art = { x: ax, z: az, rot: Math.atan2(-ax, -az) };
  keep(hx2, hz, 11);
  keep(ax, az, 7);
  const onRoad = (name, tx, tz, off) => {
    const p = PATHS.find((q) => q.name === name);
    let best = null, bd = 1e9;
    for (let s = 0; s < p.len; s += 0.5) {
      const q = polyAt(p.pts, s), d = Math.hypot(q.x - tx, q.z - tz);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return { x: best.x - best.tz * off, z: best.z + best.tx * off, rot: Math.atan2(best.tx, best.tz) };
  };
  WRECKS.bmp = onRoad("просёлок через брод", -46, -72, 2);
  WRECKS.bmp.rot += 0.35;
  WRECKS.tank = onRoad("просёлок через перекат", 20, 90, -2.2);
  WRECKS.tank.rot -= 0.3;
  keep(WRECKS.bmp.x, WRECKS.bmp.z, 4.2);
  keep(WRECKS.tank.x, WRECKS.tank.z, 4.4);
}
function helicopter(o, R2) {
  const { x, z, rot } = o, g0 = terrainH(x, z);
  M.heliV ??= (() => {
    const m = M.heli.clone();
    m.vertexColors = true;
    // корпус — тонкая обшивка с рваным хвостовым срезом: видна и изнутри
    m.side = THREE23.DoubleSide;
    return m;
  })();
  const Q2 = new THREE23.Quaternion().setFromEuler(new THREE23.Euler(0.08, rot, 1.22, "YXZ"));
  const T = new THREE23.Matrix4().compose(V2(x, g0 + 1.25, z), Q2, V2(1, 1, 1));
  const add = (mat, geo, lx = 0, ly = 0, lz = 0, e = [0, 0, 0], sc = 1) => {
    const m = new THREE23.Matrix4().compose(V2(lx, ly, lz), new THREE23.Quaternion().setFromEuler(new THREE23.Euler(e[0], e[1], e[2])), typeof sc === "number" ? V2(sc, sc, sc) : V2(...sc));
    geo.applyMatrix4(m).applyMatrix4(T);
    place(mat, geo, 0, 0, 0, 0);
  };
  const prof = [[0, 8.4], [0.55, 8.15], [0.95, 7.6], [1.2, 6.8], [1.3, 5.8], [1.32, 0], [1.25, -2.2], [1.02, -3.4], [0.62, -4.4], [0.46, -4.8]].reverse().map(([r, zz]) => new THREE23.Vector2(r, zz));
  const fus = new THREE23.LatheGeometry(prof, 22);
  fus.rotateX(Math.PI / 2);
  fus.rotateZ(Math.PI / 2);
  const fp = fus.attributes.position, fc = new Float32Array(fp.count * 3);
  for (let i = 0; i < fp.count; i++) {
    let vx = fp.getX(i), vy = fp.getY(i), vz = fp.getZ(i);
    vy *= 1.12;
    if (vz > 6.2) {
      const k = (vz - 6.2) / 2.2;
      vy *= 1 - 0.35 * k;
      vx += k * 0.5 * Math.sign(vx);
      vz -= k * k * 0.6;
    }
    fp.setXYZ(i, vx, vy, vz);
    const glass = vz > 6.6 && vy > 0.05;
    const soot = clamp((-vz - 1) / 4, 0, 1) * 0.7;
    const v = glass ? 0.08 : 1 - soot;
    fc[i * 3] = v;
    fc[i * 3 + 1] = v;
    fc[i * 3 + 2] = v * (glass ? 1.3 : 1);
  }
  fus.setAttribute("color", new THREE23.BufferAttribute(fc, 3));
  fus.computeVertexNormals();
  add(M.heliV, fus);
  // хвостовая балка оторвана: срез закрыт закопчённой переборкой, обшивка не просвечивает
  add(M.dark, new THREE23.CircleGeometry(0.47, 22), 0, 0, -4.74, [0, Math.PI, 0], [1, 1.12, 1]);
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) add(M.dark, new THREE23.CircleGeometry(0.2, 12), sx * 1.34, 0.3, -1 + k * 1.1, [0, sx * Math.PI / 2, 0]);
  add(M.dark, new THREE23.PlaneGeometry(1.3, 1.45), -1.345, -0.05, 2.6, [0, -Math.PI / 2, 0]);
  add(M.heli, new THREE23.BoxGeometry(0.05, 1.45, 1.3), -1.42, -0.05, 1.2);
  M.heliNum ??= new THREE23.MeshStandardMaterial({ map: numberTex("22"), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.7 });
  add(M.heliNum, new THREE23.PlaneGeometry(1.1, 0.55), 1.345, 0.6, 4.3, [0, Math.PI / 2, 0]);
  for (const sx of [-0.48, 0.48]) {
    add(M.heliV, new THREE23.CylinderGeometry(0.42, 0.45, 3.2, 14), sx, 1.38, 2.6, [Math.PI / 2, 0, 0]);
    add(M.dark, new THREE23.CircleGeometry(0.38, 14), sx, 1.38, 4.21, [0, 0, 0]);
    M.burntDS ??= (() => {
      const m = M.burnt.clone();
      m.side = THREE23.DoubleSide;
      return m;
    })();
    add(M.burntDS, new THREE23.CylinderGeometry(0.2, 0.26, 0.9, 10, 1, true), sx * 1.5, 1.35, 0.8, [Math.PI / 2, sx * 1.2, 0]);
  }
  add(M.steel, new THREE23.CylinderGeometry(0.2, 0.26, 0.8, 10), 0, 1.95, 1.5);
  add(M.steel, new THREE23.CylinderGeometry(0.5, 0.5, 0.22, 12), 0, 2.35, 1.5);
  const blade = (a, segs) => {
    let px = 0, py = 2.35, pz = 1.5, dir2 = a, droop = 0;
    for (const [len, dd] of segs) {
      const ex = px + Math.cos(dir2) * len * Math.cos(droop), ez = pz + Math.sin(dir2) * len * Math.cos(droop), ey = py - Math.sin(droop) * len;
      const bg = new THREE23.BoxGeometry(0.52, 0.06, len);
      const mid = V2((px + ex) / 2, (py + ey) / 2, (pz + ez) / 2), d = V2(ex - px, ey - py, ez - pz).normalize();
      const q = new THREE23.Quaternion().setFromUnitVectors(V2(0, 0, 1), d);
      bg.applyQuaternion(q);
      bg.translate(mid.x, mid.y, mid.z);
      add(M.dark, bg);
      px = ex;
      py = ey;
      pz = ez;
      droop += dd;
    }
  };
  blade(0.3, [[3, 0.25], [2.5, 0.5], [2, 0.7]]);
  blade(1.55, [[3.2, 0.15], [3, 0.35]]);
  blade(2.8, [[1.6, 0]]);
  blade(4.1, [[1.1, 0]]);
  add(M.heliV, new THREE23.CylinderGeometry(0.45, 0.45, 3.4, 14), 1.55, -0.55, 1.8, [Math.PI / 2, 0, 0]);
  add(M.steel, new THREE23.CylinderGeometry(0.06, 0.06, 1.1, 6), 0.9, -1.35, -0.6, [0.3, 0, 0.4]);
  add(M.rubber ?? M.dark, new THREE23.CylinderGeometry(0.36, 0.36, 0.25, 12), 1.15, -1.75, -0.8, [0, 0, Math.PI / 2]);
  {
    const c2 = Math.cos(rot), s2 = Math.sin(rot), bx = x - s2 * 6.5 + c2 * 2.8, bz = z - c2 * 6.5 - s2 * 2.8, by = hFast(bx, bz) + 0.4;
    const Qb = new THREE23.Quaternion().setFromEuler(new THREE23.Euler(-0.05, rot + 0.7, 0.35, "YXZ"));
    const Tb = new THREE23.Matrix4().compose(V2(bx, by, bz), Qb, V2(1, 1, 1));
    const addB = (mat, geo, lx = 0, ly = 0, lz = 0, e = [0, 0, 0]) => {
      geo.applyMatrix4(new THREE23.Matrix4().compose(V2(lx, ly, lz), new THREE23.Quaternion().setFromEuler(new THREE23.Euler(...e)), V2(1, 1, 1))).applyMatrix4(Tb);
      place(mat, geo, 0, 0, 0, 0);
    };
    addB(M.armorBurnt, new THREE23.CylinderGeometry(0.26, 0.44, 7.2, 12), 0, 0, -3.6, [Math.PI / 2, 0, 0]);
    addB(M.heli, new THREE23.BoxGeometry(0.1, 1.8, 1.3), 0, 0.9, -7.1, [0.25, 0, 0]);
    addB(M.heli, new THREE23.BoxGeometry(1.8, 0.06, 0.6), 0, 0.1, -5.6);
    for (let k = 0; k < 3; k++) addB(M.dark, new THREE23.BoxGeometry(0.03, 1.6, 0.18), 0.12, 1.2, -7.3, [0, 0, k * 2.09]);
    addB(M.dark, new THREE23.CylinderGeometry(0.46, 0.46, 0.05, 14), 0, 0, 0.02, [Math.PI / 2, 0, 0]);
    addBox(bx - Math.sin(rot + 0.7) * 3.6, by, bz - Math.cos(rot + 0.7) * 3.6, 1, 0.9, 7.2, rot + 0.7, { walk: false });
  }
  const c = Math.cos(rot), s = Math.sin(rot);
  addBox(x + s * 1.5, g0 + 1.25, z + c * 1.5, 2.6, 2.5, 10, rot, { walk: true }).car = "heli";
  addCircle(x - c * 1.6 + s * 1.8, z + s * 1.6 + c * 1.8, 0.5, g0, g0 + 1.2);
  for (let i = 0; i < 5; i++) {
    const a = rot + sr(-0.6, 0.6) + (i % 2 ? Math.PI : 0), d = sr(5, 9), px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d, py = hFast(px, pz), h = sr(1.8, 4.2);
    cyl(M.barkPine, px, py + h / 2, pz, 0.22, 0.26, h, { seg: 9 });
    const sp = new THREE23.ConeGeometry(0.22, 0.7, 7, 1, true);
    place(M.logEnd, sp, px, py + h + 0.3, pz, [sr(-0.3, 0.3), R2() * TAU, sr(-0.3, 0.3)]);
    addCircle(px, pz, 0.28, py, py + h);
  }
  for (let i = 0; i < 3; i++) {
    const a = rot + Math.PI / 2 + sr(-0.5, 0.5), L = sr(8, 13), px = x + Math.cos(rot) * sr(-6, 6) + Math.sin(rot) * sr(-8, 8), pz = z + sr(-6, 6);
    const py = hFast(px, pz);
    const g = new THREE23.CylinderGeometry(0.16, 0.24, L, 9);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 2, uv.getY(k) * L / 1.2);
    place(M.barkPine, g, px, py + 0.25, pz, [Math.PI / 2, a, 0]);
    addBox(px, py + 0.25, pz, 0.5, 0.5, L, a, { walk: true });
  }
  for (let i = 0; i < 9; i++) {
    const px = x + sr(-8, 8), pz = z + sr(-8, 8), py = hFast(px, pz);
    box(i % 3 ? M.heli : M.armorBurnt, px, py + 0.03, pz, sr(0.4, 1.4), 0.03, sr(0.3, 1), { rot: R2() * TAU, rx: sr(-0.2, 0.2), rz: sr(-0.3, 0.3), tile: 1 });
  }
  const nx = x + s * 8.5 + c * 1.5, nz = z + c * 8.5 - s * 1.5;
  sheet(3, nx, hFast(nx, nz), nz, rot + 0.5, { flat: true, w: 0.42, h: 0.56 });
  box(M.olive, nx - 1.2, hFast(nx - 1.2, nz) + 0.15, nz + 0.4, 0.6, 0.3, 0.35, { rot: rot + 1, tile: 1, collide: true });
  LANDMARKS.scorch.push({ x, z, r: 7 });
  WRECKS.smokes.push({ x: x + s * 0.8, y: g0 + 2.2, z: z + c * 0.8, k: 1 });
  addLamp({ kind: "fire", x: x + s * 0.5, y: g0 + 1.6, z: z + c * 0.5, power: 5, range: 8, ground: g0 });
}
function artillery(o, R2) {
  const { x, z, rot } = o, y = terrainH(x, z), F = frame(x, z, rot), c = Math.cos(rot), s = Math.sin(rot);
  const home = Math.atan2(SPAWNS.D.z - z, SPAWNS.D.x - x);
  sandbagRing(x, z, 4.3, 3, home, 2.4, R2);
  const L = (lx, ly, lz) => {
    const [wx, wz] = F.p(lx, lz);
    return V2(wx, y + ly, wz);
  };
  for (const a of [0, 2.09, 4.19]) {
    const e = L(Math.sin(a) * 1.8, 0.12, -Math.cos(a) * 1.8);
    beam(M.armor, L(0, 0.35, 0), e, 0.11, { seg: 4 });
  }
  const cr = L(0, 1, 0);
  box(M.armor, cr.x, cr.y, cr.z, 0.7, 0.5, 1.5, { rot, tile: 1, collide: true });
  const muzzle = L(0, 1 + Math.sin(0.2) * 4.9, Math.cos(0.2) * 4.9);
  beam(M.armor, V2(cr.x, cr.y + 0.1, cr.z), muzzle, 0.085, { seg: 10 });
  beam(M.dark, muzzle, V2(muzzle.x + s * 0.5, muzzle.y + 0.1, muzzle.z + c * 0.5), 0.15, { seg: 10 });
  for (const e of [-0.14, 0.14]) beam(M.steel, L(e, 1.28, -0.3), L(e, 1.28 + 0.3, 1.4), 0.05, { seg: 6 });
  for (const [lx, a] of [[-0.8, 0.35], [0, 0], [0.8, -0.35]]) {
    const q = L(lx, 1.25, 0.9);
    box(M.armor, q.x, q.y, q.z, 0.85, 0.95, 0.03, { rot: rot + a, rx: -0.12, tile: 1 });
  }
  for (const e of [-1, 1]) {
    const q = L(e * 1.05, 1, 0.1);
    cyl(M.rubber ?? M.dark, q.x, q.y, q.z, 0.55, 0.55, 0.3, { seg: 16, rot: [0, rot, Math.PI / 2] });
  }
  for (let i = 0; i < 8; i++) {
    // второй ряд (i ≥ 6) кладётся на ящики первого ряда (i − 4), а не в пустоту
    const k = i >= 6 ? 1 : 0, j = k ? i - 4 : i, q = L(-2.3 + j % 2 * 0.5, 0, -1.2 + Math.floor(j / 2) * 0.55);
    box(M.crate, q.x, y + 0.22 + k * 0.44, q.z, 1.3, 0.42, 0.5, { rot: rot + sr(-0.1, 0.1), tile: 0.8, collide: true });
  }
  for (let i = 0; i < 2; i++) {
    const q = L(2.2, 0, -1 + i * 0.7);
    box(M.crate, q.x, y + 0.14, q.z, 1.3, 0.26, 0.5, { rot, tile: 0.8, collide: true });
    for (let k = 0; k < 2; k++) {
      const w = L(2.2 - 0.3 + k * 0.1, 0.3, -1 + i * 0.7 + (k - 0.5) * 0.2);
      beam(M.armor, w, V2(w.x + s * 0.9, w.y, w.z + c * 0.9), 0.06, { seg: 8 });
    }
    const lid = L(2.9, 0.02, -1 + i * 0.7);
    box(M.crate, lid.x, lid.y, lid.z, 1.3, 0.03, 0.5, { rot: rot + 0.4, tile: 0.8 });
  }
  const cp = L(0.8, 0, -2.2);
  casings(cp.x, cp.z, 26, true, R2, 1.8, rot + Math.PI);
  // бланк лежит на крышке ящика первого ряда (верх y + 0.43)
  sheet(1, L(-2.3, 0, -1.2).x, y + 0.445, L(-2.3, 0, -1.2).z, rot, { flat: true });
  const pole = L(-3, 2.4, 2), pole2 = L(3, 2.4, 2);
  for (const p of [pole, pole2]) {
    cyl(M.deadwood, p.x, y + 1.2, p.z, 0.04, 0.04, 2.4, { seg: 5 });
    addCircle(p.x, p.z, 0.06, y, y + 2.4);
  }
  const net = new THREE23.PlaneGeometry(6.4, 4, 8, 5), np = net.attributes.position;
  for (let i = 0; i < np.count; i++) {
    const v = np.getY(i);
    np.setZ(i, Math.sin(np.getX(i) * 1.3) * 0.15 + (v < 0 ? v * v * 0.1 : 0));
  }
  net.computeVertexNormals();
  const nc = L(0, 1.4, 1.1);
  place(M.camo, net, nc.x, nc.y, nc.z, [-1.05, rot, 0]);
}
function mgNest(o, R2) {
  const { x, z, home } = o, y = terrainH(x, z);
  const back = Math.atan2(home.z - z, home.x - x), fwd2 = back + Math.PI;
  sandbagRing(x, z, 1.75, 3, back, 1.3, R2);
  const fx = Math.cos(fwd2), fz = Math.sin(fwd2), rot = Math.atan2(fx, fz);
  const mx = x + fx * 1.35, mz = z + fz * 1.35, my = hFast(mx, mz) + 0.62;
  box(M.dark, mx, my + 0.08, mz, 0.1, 0.13, 0.5, { rot, tile: 1 });
  beam(M.dark, V2(mx + fx * 0.25, my + 0.1, mz + fz * 0.25), V2(mx + fx * 0.85, my + 0.1, mz + fz * 0.85), 0.012, { seg: 6 });
  box(M.planksDark, mx - fx * 0.38, my + 0.05, mz - fz * 0.38, 0.06, 0.14, 0.32, { rot, tile: 1 });
  for (const e of [-1, 1]) beam(M.dark, V2(mx + fx * 0.55, my + 0.08, mz + fz * 0.55), V2(mx + fx * 0.7 - fz * e * 0.18, my - 0.12, mz + fz * 0.7 + fx * e * 0.18), 8e-3, { seg: 4, cast: false });
  box(M.olive, mx + fz * 0.14, my + 0.04, mz - fx * 0.14, 0.12, 0.1, 0.18, { rot, tile: 1 });
  for (let i = 0; i < 4; i++) {
    const a = back + sr(-0.9, 0.9), r = sr(0.4, 1.1), px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    box(M.olive, px, hFast(px, pz) + 0.1, pz, 0.28, 0.2, 0.16, { rot: R2() * TAU, tile: 1 });
  }
  const bx = x + Math.cos(back) * 0.5, bz = z + Math.sin(back) * 0.5, by = hFast(bx, bz);
  box(M.crate, bx, by + 0.18, bz, 0.8, 0.36, 0.45, { rot: back, tile: 0.8, collide: true });
  sheet(0, bx, by + 0.37, bz, back + 0.4, { flat: true });
  place(M.stone, new THREE23.DodecahedronGeometry(0.06, 0), bx + 0.05, by + 0.4, bz + 0.05, 0);
  const hg = new THREE23.SphereGeometry(0.14, 12, 6, 0, TAU, 0, Math.PI / 2);
  place(M.olive, hg, x - fz * 0.8, y + 0.02, z + fx * 0.8, [0.4, R2() * TAU, 0.2]);
  for (let i = 0; i < 3; i++) cyl(M.steel, x + sr(-1, 1), y + 0.05, z + sr(-1, 1), 0.04, 0.04, 0.1, { seg: 8, rot: [i ? Math.PI / 2 : 0, R2() * TAU, 0] });
  casings(mx + fz * 0.4, mz - fx * 0.4, 160, false, R2, 1.2, Math.atan2(-fx, fz));
}
function hullGeo(profile, W) {
  const sh = new THREE23.Shape();
  profile.forEach(([zz, yy], i) => i ? sh.lineTo(zz, yy) : sh.moveTo(zz, yy));
  sh.closePath();
  const g = new THREE23.ExtrudeGeometry(sh, { depth: W, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
  g.rotateY(-Math.PI / 2);
  g.translate(W / 2, 0, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.4, uv.getY(i) * 0.4);
  g.computeVertexNormals();
  return g;
}
function tracks(W, L, wr, n2, mat, x, y, z, rot, tilt, R2, broken = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const P2 = (lx, ly, lz) => [x + lx * c + lz * s, y + ly - tilt * lz, z - lx * s + lz * c];
  const wheel = new THREE23.CylinderGeometry(wr, wr, 0.3, 14);
  for (const side2 of [-1, 1]) {
    const lx = side2 * (W / 2 - 0.25);
    for (let i = 0; i < n2; i++) {
      const lz = -L / 2 + 0.8 + i * (L - 1.6) / (n2 - 1), [px, py, pz] = P2(lx, wr, lz);
      place(M.rust, wheel, px, py, pz, [0, rot, Math.PI / 2]);
    }
    if (side2 === broken) continue;
    const [bx, by, bz] = P2(lx, 0.06, 0);
    box(M.dark, bx, by, bz, 0.5, 0.08, L - 0.5, { rot, rx: tilt, tile: 1 });
    const [tx, ty, tz] = P2(lx, wr * 2 + 0.05, 0);
    box(M.dark, tx, ty, tz, 0.5, 0.06, L - 1.2, { rot, rx: tilt, tile: 1 });
    for (const e of [-1, 1]) {
      const [ex, ey, ez] = P2(lx, wr + 0.06, e * (L / 2 - 0.35));
      cyl(M.dark, ex, ey, ez, wr + 0.08, wr + 0.08, 0.5, { seg: 12, rot: [0, rot, Math.PI / 2] });
    }
  }
  if (broken) {
    const [bx, , bz] = P2(broken * (W / 2 + 0.9), 0, -1.5);
    box(M.dark, bx, hFast(bx, bz) + 0.05, bz, 0.5, 0.07, L + 1.5, { rot: rot + 0.12, tile: 1 });
  }
}
function bmp(o, R2) {
  const { x, z, rot } = o, g = terrainH(x, z), tilt = 0.05, W = 3.05, y = g - 0.05, c = Math.cos(rot), s = Math.sin(rot);
  const hull = hullGeo([[-3.3, 0.45], [-3.3, 1.62], [0.9, 1.72], [3.35, 0.95], [3.2, 0.45]], W);
  place(M.armorBurnt, hull, x, y, z, [tilt, rot, 0.02]);
  for (let k = 0; k < 4; k++) {
    const lz = 1.5 + k * 0.4, ly = 1.72 - (lz - 0.9) * 0.31;
    box(M.armorBurnt, x + s * lz, y + ly + 0.02 - tilt * lz, z + c * lz, W - 0.4, 0.04, 0.06, { rot, rx: tilt + 0.3, tile: 1 });
  }
  tracks(W, 6.6, 0.34, 6, M.rust, x, y, z, rot, tilt, R2, 1);
  const tr = rot + 0.9, tx = x + s * 0.2, tz = z + c * 0.2, ty = y + 1.74 - tilt * 0.2;
  cyl(M.armorBurnt, tx, ty + 0.25, tz, 0.95, 0.75, 0.5, { seg: 16 });
  const gx = tx + Math.sin(tr) * 0.8, gz = tz + Math.cos(tr) * 0.8;
  beam(M.dark, V2(gx, ty + 0.35, gz), V2(gx + Math.sin(tr) * 2.6, ty + 0.12, gz + Math.cos(tr) * 2.6), 0.045, { seg: 8 });
  beam(M.armorBurnt, V2(tx - Math.cos(tr) * 0.6, ty + 0.62, tz + Math.sin(tr) * 0.6), V2(tx - Math.cos(tr) * 0.6 + Math.sin(tr) * 1.1, ty + 0.62, tz + Math.sin(tr) * 0.6 + Math.cos(tr) * 1.1), 0.08, { seg: 8 });
  for (const e of [-0.35, 0.35]) cyl(M.armorBurnt, tx + Math.cos(tr) * e, ty + 0.62, tz - Math.sin(tr) * e, 0.3, 0.3, 0.04, { seg: 12, rot: [1.2, tr, 0] });
  place(M.dark, new THREE23.CircleGeometry(0.3, 12), tx, ty + 0.51, tz, [-Math.PI / 2, 0, 0]);
  for (const e of [-1, 1]) {
    const hx2 = x - s * 3.32 + c * e * 0.75, hz = z - c * 3.32 - s * e * 0.75, a = rot + e * 1.2;
    box(M.armorBurnt, hx2 - Math.cos(a) * e * 0.35, y + 1 + tilt * 3.3, hz + Math.sin(a) * e * 0.35, 0.7, 0.95, 0.12, { rot: a, tile: 1 });
  }
  box(M.dark, x - s * 3.3, y + 1 + tilt * 3.3, z - c * 3.3, W - 0.8, 0.95, 0.04, { rot, tile: 1 });
  addBox(x, g + 0.9, z, W, 1.8, 6.7, rot, { walk: true }).car = "bmp";
  addCircle(tx, tz, 0.9, ty, ty + 0.7);
  WRECKS.smokes.push({ x: tx, y: ty + 0.6, z: tz, k: 0.4 });
}
function tank(o, R2) {
  const { x, z, rot } = o, g = terrainH(x, z), tilt = -0.04, W = 3.5, y = g - 0.05, c = Math.cos(rot), s = Math.sin(rot);
  const hull = hullGeo([[-3.45, 0.45], [-3.45, 1.32], [2.2, 1.38], [3.45, 0.82], [3.3, 0.45]], W);
  place(M.armorBurnt, hull, x, y, z, [tilt, rot, -0.03]);
  tracks(W, 6.9, 0.39, 6, M.rust, x, y, z, rot, tilt, R2, 0);
  for (const e of [-1, 1]) for (let k = 0; k < 4; k++) if (R2() < 0.5) {
    const lz = -2.4 + k * 1.6, px = x + c * e * (W / 2 + 0.03) + s * lz, pz = z - s * e * (W / 2 + 0.03) + c * lz;
    box(M.dark, px, y + 1 - tilt * lz, pz, 0.03, 0.55, 1.5, { rot, rz: e * 0.1, tile: 1 });
  }
  for (const e of [-0.7, 0.7]) cyl(M.barrel?.[2] ?? M.rust, x - s * 3.7 + c * e, y + 1.2 + tilt * 3.7, z - c * 3.7 - s * e, 0.28, 0.28, 0.85, { seg: 12, rot: [0, rot, Math.PI / 2] });
  place(M.dark, new THREE23.CircleGeometry(1.05, 20), x + s * 0.4, y + 1.4 - tilt * 0.4, z + c * 0.4, [-Math.PI / 2, 0, 0]);
  cyl(M.armorBurnt, x + s * 0.4, y + 1.42 - tilt * 0.4, z + c * 0.4, 1.12, 1.12, 0.06, { seg: 20, open: true });
  const ta = rot + 2.2, tx = x + Math.sin(ta) * 6.8, tz = z + Math.cos(ta) * 6.8, ty = hFast(tx, tz);
  const dome = new THREE23.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2);
  dome.scale(1.15, 0.5, 1.3);
  place(M.armorBurnt, dome, tx, ty + 0.5, tz, [Math.PI + 0.2, ta, 0.15]);
  place(M.dark, new THREE23.CircleGeometry(1, 20), tx, ty + 0.52, tz, [-Math.PI / 2 + 0.2, ta, 0.15]);
  const b0 = V2(tx + Math.sin(ta + 0.4) * 1.1, ty + 0.35, tz + Math.cos(ta + 0.4) * 1.1), b1 = b0.clone().add(V2(Math.sin(ta + 0.5) * 2.8, -0.1, Math.cos(ta + 0.5) * 2.8)), b2 = b1.clone().add(V2(Math.sin(ta + 0.85) * 2.4, -0.25, Math.cos(ta + 0.85) * 2.4));
  beam(M.armorBurnt, b0, b1, 0.1, { seg: 10 });
  beam(M.armorBurnt, b1, b2, 0.085, { seg: 10 });
  for (const t of [0.3, 0.6]) cyl(M.dark, lerp(b0.x, b1.x, t), lerp(b0.y, b1.y, t), lerp(b0.z, b1.z, t), 0.13, 0.13, 0.25, { seg: 10, rot: [Math.PI / 2, Math.atan2(b1.x - b0.x, b1.z - b0.z), 0] });
  addBox(x, g + 0.7, z, W, 1.4, 6.9, rot, { walk: true }).car = "tank";
  addBox(tx, ty + 0.5, tz, 2.3, 1, 2.6, ta, { walk: true }).car = "turret";
  addBox((b0.x + b2.x) / 2, (b0.y + b2.y) / 2, (b0.z + b2.z) / 2, 0.25, 0.25, b0.distanceTo(b2), Math.atan2(b2.x - b0.x, b2.z - b0.z), { walk: false });
}
function buildWrecks() {
  const R2 = rng(6161);
  helicopter(WRECKS.heli, R2);
  artillery(WRECKS.art, R2);
  for (const m of WRECKS.mg) mgNest(m, R2);
  bmp(WRECKS.bmp, R2);
  tank(WRECKS.tank, R2);
}
var V4 = (x, y, z) => new THREE24.Vector3(x, y, z);
var bagGeo = null;
var bag = (x, y, z, rot, rx = 0, rz = 0) => {
  bagGeo ??= (() => {
    const g = new THREE24.SphereGeometry(1, 9, 5);
    g.scale(0.3, 0.1, 0.18);
    return g;
  })();
  place(M.sack, bagGeo, x, y, z, [rx, rot, rz]);
};
function sandbagWall(x0, z0, x1, z1, rows = 3, R2 = rng(1), collide = true) {
  const L = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
  const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, g = hFast(cx, cz);
  const own = !inStruct();
  const wall = { bags: [], base: g, col: null };
  if (own) beginStruct({ kind: "sandbags", x: cx, z: cz, rot, w: L, d: 0.5, h: rows * 0.17, fy: g, fuel: 0, quiet: true });
  for (let r = 0; r < rows; r++) {
    for (let s = r % 2 * 0.28; s < L; s += 0.56) {
      if (r === rows - 1 && R2() < 0.18) continue;
      const x = x0 + ux * s, z = z0 + uz * s, y = hFast(x, z) + 0.08 + r * 0.17;
      if (own) {
        const p = panel("bag", { hp: 1, mode: "sag", density: 1600, float: 0, burnable: false });
        p.quiet = true;
        p.wall = wall;
        p.top0 = y + 0.1;
        p.base0 = y - 0.1;
        wall.bags.push(p);
      }
      bag(x, y, z, rot + R2.range(-0.12, 0.12), R2.range(-0.05, 0.05), R2.range(-0.08, 0.08));
    }
  }
  if (own) noPanel();
  if (collide) {
    wall.col = addBox(cx, g + rows * 0.09, cz, 0.4, rows * 0.18 + 0.05, L, rot - Math.PI / 2, { walk: true });
    if (own) wall.col.sandWall = wall;
  }
  if (own) endStruct();
  return wall;
}
function sandbagRing(x, z, r, rows, gapA, gapW, R2) {
  const n2 = Math.round(TAU * r / 0.9);
  for (let i = 0; i < n2; i++) {
    const a0 = i / n2 * TAU, a1 = (i + 1) / n2 * TAU, am = (a0 + a1) / 2;
    let da = Math.abs((am - gapA + Math.PI * 3) % TAU - Math.PI);
    if (da < gapW / 2) continue;
    sandbagWall(x + Math.cos(a0) * r, z + Math.sin(a0) * r, x + Math.cos(a1) * r, z + Math.sin(a1) * r, rows, R2);
  }
}
var lanternMat = null;
var BASE = [];
function baseLocal(s) {
  const fx = s.fx, fz = s.fz, rx = -fz, rz = fx;
  return { p: (a, b) => [s.x + fx * a + rx * b, s.z + fz * a + rz * b], rot: Math.atan2(fx, fz) };
}
function planMilitary() {
  for (const s of Object.values(SPAWNS)) {
    const L = baseLocal(s);
    const [fx, fz] = L.p(-6, 0), [nx, nz] = L.p(-2.5, 9.5), [gx, gz] = L.p(3.5, -6.5), [tx, tz] = L.p(-7.5, 7);
    BASE.push({ s, L, flag: [fx, fz], net: [nx, nz], gen: [gx, gz], tent: [tx, tz] });
    keep(fx, fz, 2.5);
    keep(nx, nz, 4.5);
    keep(gx, gz, 1.8);
    addPad(tx, tz, 2.4, 2.9, L.rot + 0.4, 2);
    addPad(s.x, s.z, 7, 7, L.rot, 6);
  }
}
function buildBase(B, R2) {
  const { s, L } = B;
  const A2 = s.team === "A";
  buildFlag(B.flag[0], B.flag[1], L.rot, A2 ? TEX.flagA : TEX.flagD);
  for (const sgn of [-1, 1]) {
    const [x0, z0] = L.p(10.5, sgn * 3), [x1, z1] = L.p(9.5, sgn * 7.5), [x2, z2] = L.p(7, sgn * 10.5);
    sandbagWall(x0, z0, x1, z1, 3, R2);
    sandbagWall(x1, z1, x2, z2, 3, R2);
  }
  camoNet2(B.net[0], B.net[1], L.rot, 7, 5.5, R2);
  for (let i = 0; i < 7; i++) {
    const [cx, cz] = L.p(-2.5 + R2.range(-2.5, 2.5), 9.5 + R2.range(-2, 2));
    crate(cx, cz, L.rot + R2.range(-0.3, 0.3), R2, R2() < 0.4 ? 2 : 1);
  }
  generator(B.gen[0], B.gen[1], L.rot, R2, s);
  const [mx, mz] = L.p(1.5, -3);
  floodMast(mx, mz, L, R2);
  const [fbx, fbz] = L.p(1, 4);
  fireBarrel(fbx, fbz);
  for (let i = 0; i < 4; i++) {
    const [px, pz] = L.p(2 + R2.range(-1, 1), 5.5 + R2.range(-1, 1));
    barrelStatic(px, pz, R2);
  }
  tent(B.tent[0], B.tent[1], L.rot + 0.4, R2);
  const pen = new THREE24.MeshStandardMaterial({ map: A2 ? TEX.pennantA : TEX.pennantD, side: THREE24.DoubleSide, roughness: 0.9 });
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU, x = s.x + Math.cos(a) * s.r, z = s.z + Math.sin(a) * s.r;
    if (pathInfluence(x, z, 0.3) > 0 || edgeDist(x, z) > MAP.PLAY - 1) continue;
    const y = hFast(x, z);
    cyl(M.deadwood, x, y + 0.7, z, 0.035, 0.03, 1.4, { seg: 5 });
    const ux = Math.cos(a + 1.3), uz = Math.sin(a + 1.3);
    makeCloth({
      nx: 5,
      ny: 4,
      material: pen,
      wind: 1.2,
      stiff: 3,
      place: (u, v) => new THREE24.Vector3(x + ux * u * 0.45, y + 1.38 - v * (0.3 - u * 0.24), z + uz * u * 0.45),
      pinFn: (i2) => i2 === 0
    });
  }
}
var FLAGS = [];
function buildFlag(x, z, rot, map) {
  const y = terrainH(x, z), H2 = 13;
  box(M.concrete, x, y + 0.15, z, 1.1, 0.5, 1.1, { rot, tile: 0.8, collide: true });
  cyl(M.steel, x, y + H2 / 2, z, 0.1, 0.065, H2, { seg: 12 });
  place(M.steel, new THREE24.SphereGeometry(0.12, 10, 8), x, y + H2 + 0.05, z, 0);
  addCircle(x, z, 0.16, y, y + H2);
  for (let i = 0; i < 3; i++) {
    const a = rot + i * TAU / 3 + 0.5;
    const gx = x + Math.cos(a) * 4.2, gz = z + Math.sin(a) * 4.2;
    beam(M.wire, V4(x, y + H2 * 0.72, z), V4(gx, terrainH(gx, gz) + 0.1, gz), 0.012, { seg: 3, cast: false });
    cyl(M.deadwood, gx, terrainH(gx, gz) + 0.2, gz, 0.06, 0.05, 0.6, { seg: 5 });
  }
  beam(M.rope, V4(x + 0.09, y + 1.2, z), V4(x + 0.09, y + H2 - 0.2, z), 8e-3, { seg: 3, cast: false });
  const mat = new THREE24.MeshStandardMaterial({ map, side: THREE24.DoubleSide, alphaTest: 0.5, roughness: 0.92 });
  if (map && map.userData && map.userData.atlas && globalThis.GFlags) globalThis.GFlags.fabric(mat);
  const FW = 5.6, FH = 3.5, top = y + H2 - 0.35;
  const nx = Q.cloth + 4, ny = Math.round((Q.cloth + 4) * 0.62);
  const dir2 = [Math.cos(0.64), Math.sin(0.64)];
  const c = makeCloth({
    nx,
    ny,
    material: mat,
    wind: 1.35,
    stiff: 6,
    drag: 0.982,
    place: (u, v) => V4(x + dir2[0] * u * FW, top - v * FH, z + dir2[1] * u * FW),
    pinFn: (i, j) => i === 0 && (j === 0 || j === ny - 1 || j % 2 === 0)
  });
  FLAGS.push({ x, z, cloth: c });
}
function camoNet2(x, z, rot, w, d, R2) {
  const F = frame(x, z, rot), g = terrainH(x, z);
  const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]];
  // стойки вкапывают на 0,3 м: низ — от грунта под каждой стойкой (на склоне углы на разной высоте), верх — общий
  for (const [lx, lz] of corners) {
    const [px, pz] = F.p(lx, lz), gp = terrainH(px, pz) - 0.3, top = g + 2.6;
    cyl(M.deadwood, px, (gp + top) / 2, pz, 0.06, 0.05, top - gp, { seg: 6 });
    addCircle(px, pz, 0.08, gp, top);
  }
  const [cx, cz] = F.p(0, 0), gc = terrainH(cx, cz) - 0.3;
  cyl(M.deadwood, cx, (gc + g + 3.2) / 2, cz, 0.06, 0.05, g + 3.2 - gc, { seg: 6 });
  const nx = Math.max(8, Q.cloth), ny = Math.max(6, Math.round(Q.cloth * 0.8));
  makeCloth({
    nx,
    ny,
    material: M.camo,
    wind: 0.55,
    stiff: 3,
    drag: 0.97,
    uvScale: [2, 1.6],
    place: (u, v) => {
      const [px, pz] = F.p((u - 0.5) * w, (v - 0.5) * d);
      return V4(px, g + 2.55, pz);
    },
    pinFn: (i, j) => (i === 0 || i === nx - 1) && (j === 0 || j === ny - 1) || i === Math.floor(nx / 2) && j === Math.floor(ny / 2)
  });
}
function crate(x, z, rot, R2, stack = 1) {
  const y = hFast(x, z);
  for (let k = 0; k < stack; k++) {
    box(M.crate, x, y + 0.2 + k * 0.4, z, 1, 0.4, 0.55, { rot: rot + k * R2.range(-0.2, 0.2), tile: 0.8, collide: true });
  }
}
function barrelStatic(x, z, R2) {
  const y = hFast(x, z);
  const mat = M.barrel[R2.int(0, M.barrel.length - 1)];
  cyl(mat, x, y + 0.44, z, 0.3, 0.3, 0.88, { seg: 14, tile: 1.9 });
  for (const yy of [0.25, 0.62]) cyl(mat, x, y + yy, z, 0.31, 0.31, 0.04, { seg: 14 });
  addCircle(x, z, 0.32, y, y + 0.9);
}
function generator(x, z, rot, R2, s) {
  const y = hFast(x, z), F = frame(x, z, rot);
  beginStruct({ kind: "generator", x, z, rot, w: 1.6, d: 1, h: 1.2, fy: y, fuel: 0, quiet: true });
  const p = panel("prop", { hp: 0.9, mode: "rigid", density: 1400, float: 0, burnable: false });
  box(M.carPaint[3], x, y + 0.45, z, 1.4, 0.8, 0.8, { rot, tile: 1, collide: true });
  box(M.dark, x, y + 0.9, z, 1.2, 0.12, 0.7, { rot, tile: 1 });
  const [rx, rz] = F.p(-0.71, 0);
  box(M.dark, rx, y + 0.5, rz, 0.02, 0.5, 0.6, { rot, tile: 1 });
  const [bx, bz] = F.p(0.2, 0.41);
  box(M.steel, bx, y + 0.6, bz, 0.4, 0.3, 0.02, { rot, tile: 1 });
  noPanel();
  const [ex, ez] = F.p(0.8, 0);
  cyl(M.rust, ex, y + 1.2, ez, 0.05, 0.05, 1.1, { seg: 6 });
  const [kx, kz] = F.p(-1.2, 0.3);
  cyl(M.barrel[1], kx, y + 0.3, kz, 0.18, 0.18, 0.5, { seg: 10 });
  endStruct();
  addGenerator({ x, y: y + 0.5, z, panel: p, ex, ey: y + 1.75, ez, cx: s.x, cz: s.z, r: 36 });
}
function floodMast(x, z, L, R2) {
  const y = terrainH(x, z), H2 = 6.2;
  cyl(M.steel, x, y + H2 / 2, z, 0.08, 0.06, H2, { seg: 8 });
  addCircle(x, z, 0.12, y, y + H2);
  for (const [a, b] of [[6, -4], [8, 5]]) {
    const [tx, tz] = L.p(a, b);
    const dir2 = V4(tx - x, terrainH(tx, tz) - (y + H2), tz - z).normalize();
    const px = x + dir2.x * 0.4, pz = z + dir2.z * 0.4, py = y + H2 - 0.1;
    const head = new THREE24.Mesh(new THREE24.BoxGeometry(0.44, 0.34, 0.28), M.dark);
    head.position.set(px, py, pz);
    head.lookAt(px + dir2.x, py + dir2.y, pz + dir2.z);
    head.castShadow = true;
    scene.add(head);
    const lens = M.lampGlass.clone();
    const glass = new THREE24.Mesh(new THREE24.PlaneGeometry(0.38, 0.28), lens);
    glass.position.set(px + dir2.x * 0.15, py + dir2.y * 0.15, pz + dir2.z * 0.15);
    glass.lookAt(px + dir2.x * 2, py + dir2.y * 2, pz + dir2.z * 2);
    scene.add(glass);
    addLamp({ kind: "flood", x: px + dir2.x * 0.2, y: py + dir2.y * 0.2, z: pz + dir2.z * 0.2, dir: dir2, lens, on: true, flick: R2() < 0.3 ? 0.25 : 0 });
  }
}
var FIRES = [];
function coalsMat() {
  const [c, x] = cv(128);
  x.fillStyle = "#1a0c06";
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 90; i++) blob(x, srnd() * 128, srnd() * 128, sr(3, 14), [255, sr(90, 170), 30], sr(0.3, 0.9));
  for (let i = 0; i < 40; i++) blob(x, srnd() * 128, srnd() * 128, sr(4, 12), [20, 10, 6], 0.9);
  const t = tex(c);
  return std({ color: 1706504, emissive: 16739866, emissiveMap: t, emissiveIntensity: 2.4, roughness: 1, metalness: 0 });
}
function fireBarrel(x, z) {
  const y = hFast(x, z);
  cyl(M.burnt, x, y + 0.44, z, 0.3, 0.3, 0.88, { seg: 14, open: true, tile: 1.9 });
  M.coals ??= coalsMat();
  M.charLog ??= std({ color: 1841167, roughness: 1, metalness: 0 });
  place(M.coals, new THREE24.CylinderGeometry(0.285, 0.285, 0.03, 14), x, y + 0.72, z, 0, 1, { cast: false });
  // обугленные поленья торчат над кромкой
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + srnd() * 0.5;
    beam(M.charLog, new THREE24.Vector3(x + Math.cos(a) * 0.08, y + 0.64, z + Math.sin(a) * 0.08), new THREE24.Vector3(x + Math.cos(a) * 0.27, y + 1.01 + srnd() * 0.08, z + Math.sin(a) * 0.27), 0.035, { seg: 6 });
  }
  // пробитые для тяги дыры в стенке светятся изнутри
  const hole = new THREE24.CircleGeometry(0.024, 8);
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + srnd() * 0.4, hy = y + 0.12 + (i % 2) * 0.1;
    place(M.coals, hole, x + Math.sin(a) * 0.303, hy, z + Math.cos(a) * 0.303, a, 1, { cast: false });
  }
  addCircle(x, z, 0.32, y, y + 0.9);
  addLamp({ kind: "fire", x, y: y + 1.1, z, ground: y });
  FIRES.push({ x, y: y + 0.85, z, r: 0.22 });
}
function tent(x, z, rot, R2) {
  const y = terrainH(x, z) - 0.02;
  const shape = new THREE24.Shape();
  shape.moveTo(-1.9, 0);
  shape.lineTo(-1.8, 0.9);
  shape.quadraticCurveTo(-0.9, 2.05, 0, 2.2);
  shape.quadraticCurveTo(0.9, 2.05, 1.8, 0.9);
  shape.lineTo(1.9, 0);
  shape.lineTo(1.84, 0);
  shape.lineTo(1.74, 0.88);
  shape.quadraticCurveTo(0.86, 1.98, 0, 2.13);
  shape.quadraticCurveTo(-0.86, 1.98, -1.74, 0.88);
  shape.lineTo(-1.84, 0);
  const g = new THREE24.ExtrudeGeometry(shape, { depth: 4.4, bevelEnabled: false });
  g.translate(0, 0, -2.2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.4, uv.getY(i) * 0.4);
  place(M.canvas, g, x, y, z, rot);
  const back = new THREE24.ShapeGeometry(new THREE24.Shape([new THREE24.Vector2(-1.9, 0), new THREE24.Vector2(-1.8, 0.9), new THREE24.Vector2(0, 2.2), new THREE24.Vector2(1.8, 0.9), new THREE24.Vector2(1.9, 0)]));
  const F = frame(x, z, rot);
  const [bx, bz] = F.p(0, -2.2);
  place(M.canvas, back, bx, y, bz, rot);
  for (const lz of [-2.2, 0, 2.2]) {
    const [px2, pz2] = F.p(0, lz);
    cyl(M.deadwood, px2, y + 1.1, pz2, 0.04, 0.04, 2.2, { seg: 5 });
  }
  for (const s of [-1, 1]) {
    const [px2, pz2] = F.p(s * 1.85, 0);
    addBox(px2, y + 0.6, pz2, 0.3, 1.2, 4.4, rot, { walk: false });
  }
  const [px, pz] = F.p(0, -2.2);
  addBox(px, y + 1, pz, 3.6, 2, 0.2, rot, { walk: false });
  addBox(x, y + 1.85, z, 3.2, 0.6, 4.4, rot, { walk: true });
}
function hedgehog(x, z, R2) {
  const y = hFast(x, z) + 0.55, rot = R2() * TAU;
  for (let i = 0; i < 3; i++) {
    const a = [[0.95, 0, 0], [0, 0, 0.95], [0.6, 0.6, 0]][i];
    const d = V4(Math.cos(rot + i * 2.1) * a[0], i === 2 ? 1 : 0.6, Math.sin(rot + i * 2.1) * a[0]).normalize().multiplyScalar(0.9);
    const p0 = V4(x, y, z).sub(d), p1 = V4(x, y, z).add(d);
    beam(M.rust, p0, p1, 0.07, { seg: 4 });
  }
  addCircle(x, z, 0.8, y - 0.6, y + 0.8);
}
function buildMilitary() {
  const R2 = rng(1212);
  lanternMat = new THREE24.MeshStandardMaterial({ color: 9277322, emissive: 16757850, emissiveIntensity: 0, roughness: 0.3 });
  for (const B of BASE) buildBase(B, R2);
  buildZone(R2);
}
var PL = {pos:ctx.camera.position,vel:new THREE.Vector3(),mode:"walk",yaw:0,pitch:0,dead:0,agl:2};
function die(msg, kind, at) {
  if (PL.dead > 0) return;
  PL.dead = 3.2;
  PL.deathMsg = msg;
  if (kind === "mine") click();
  const x = at?.x ?? PL.pos.x, z = at?.z ?? PL.pos.z;
  if (kind === "mine") setTimeout(() => explode(x, terrainH(x, z), z, at?.type || "pmn"), 180);
}
var _oa = new THREE25.Vector3();
var _ob = new THREE25.Vector3();
function losClear(ax, ay, az, bx, by, bz) {
  const L = Math.hypot(bx - ax, by - ay, bz - az), n2 = Math.max(2, Math.ceil(L / 0.3));
  for (let i = 1; i < n2; i++) {
    const t = i / n2, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    if (y < hFast(x, z) - 0.04) return false;
  }
  if (!PHYS.ready || L < 0.4) return true;
  const h = rayCast(_oa.set(ax, ay, az), _ob.set(bx, by, bz));
  if (!h || h.dist > L - 0.25) return true;
  if (h.idx === -1) return false;
  if (h.idx < 0 || h.idx >= BODY_IDX0) return true;
  const c = COLLIDERS[h.idx];
  return !c || c.dead || !!c.tree || !!c.wire || !!c.pane;
}
function blastExposure(x, y, z, drone) {
  const px = PL.pos.x, py = PL.pos.y, pz = PL.pos.z, oy = y + 0.35;
  if (drone) return losClear(x, oy, z, px, py, pz) ? 1 : 0.15;
  let v = 0;
  for (const hy of [0.25, 0.95, 1.55]) v += losClear(x, oy, z, px, py + hy * lerp(1, 0.62, PL.crouch), pz) ? 1 : 0;
  return v / 3;
}
function blastKnock(x, y, z, size) {
  if (PL.dead > 0 || PL.cine) return;
  const dx = PL.pos.x - x, dy = PL.pos.y + 0.9 - y, dz = PL.pos.z - z, d = Math.hypot(dx, dy, dz);
  if (d > 14 * size) return;
  const ex = blastExposure(x, y, z, PL.mode === "drone");
  PL.lastExposure = ex;
  if (PL.mode === "walk") {
    if (d < 1.9 * size * (0.3 + 0.7 * ex)) {
      die("ПОГИБ ОТ РАЗРЫВА", "blast");
      return;
    }
    if (d < 12 * size) {
      const k = 9 * size / (1 + d * 0.9) * (0.12 + 0.88 * ex);
      PL.vel.x += dx / d * k;
      PL.vel.z += dz / d * k;
      PL.vel.y += k * 0.35;
      PL.onGround = false;
    }
  } else if (d < 9 * size) {
    const k = 14 * size / (1 + d) * (0.2 + 0.8 * ex);
    PL.vel.x += dx / d * k;
    PL.vel.y += dy / d * k;
    PL.vel.z += dz / d * k;
    if (d < 1.6 * size * (0.3 + 0.7 * ex)) die("ДРОН УНИЧТОЖЕН ВЗРЫВОМ", "blast");
  }
}
var BLAST = { shake: 0, flash: null, craters: [], debris: null, chunks: [], last: null, hooks: [] };
var craterI = 0;
function crater(x, z, r) {
  const m = BLAST.craters[craterI++ % BLAST.craters.length];
  const p = m.geometry.attributes.position;
  if (!m.userData.base) m.userData.base = p.array.slice();
  const b = m.userData.base;
  for (let i = 0; i < p.count; i++) {
    const lx = b[i * 3] * r * 2, lz = b[i * 3 + 2] * r * 2;
    p.setXYZ(i, lx, hFast(x + lx, z + lz) + 0.05, lz);
  }
  p.needsUpdate = true;
  m.geometry.computeVertexNormals();
  m.geometry.computeBoundingSphere();
  m.position.set(x, 0, z);
  m.rotation.y = srnd() * TAU;
  m.visible = true;
}
function explode(x, y, z, kind = "pmn") {
  const size = kind === "tm" ? 2.2 : kind === "shell" ? 1.8 : kind === "ozm" ? 1.3 : kind === "vog" ? 0.8 : 1;
  const ground0 = terrainH(x, z);
  // взрыв на настиле (мост, мостки, крыша): без воронки в грунте, осколки дерева вместо земли
  const deck = y > Math.max(ground0, MAP.WATER_Y) + 0.3;
  const water = !deck && lakeRho(x, z) < 0.98 && y < MAP.WATER_Y + 0.6;
  const gy = water ? MAP.WATER_Y : deck ? y : ground0;
  BLAST.last = { x, y: gy, z, t: FRAME.t, size };
  for (const f of BLAST.hooks) f(x, gy, z, size);
  BLAST.flash.position.set(x, gy + 1.5, z);
  BLAST.flash.intensity = 520 * size;
  BLAST.flash.userData.t = 0;
  for (let i = 0; i < 12 * size; i++) {
    const a = srnd() * TAU, u = srnd();
    FX.add.spawn({
      x: x + Math.cos(a) * 0.3,
      y: gy + 0.4 + u,
      z: z + Math.sin(a) * 0.3,
      vx: Math.cos(a) * sr(1, 5) * size,
      vy: sr(2, 8) * size,
      vz: Math.sin(a) * sr(1, 5) * size,
      size: sr(0.8, 1.8) * size,
      grow: 3 * size,
      life: sr(0.18, 0.4),
      col: [3.2, 1.9, 0.8],
      a: 1,
      cool: 0.35,
      drag: 3
    });
  }
  for (let i = 0; i < 18 * size; i++) {
    const a = srnd() * TAU, e = sr(0.3, 1.3);
    FX.add.spawn({
      x,
      y: gy + 0.3,
      z,
      vx: Math.cos(a) * Math.cos(e) * sr(8, 22),
      vy: Math.sin(e) * sr(8, 20),
      vz: Math.sin(a) * Math.cos(e) * sr(8, 22),
      size: 0.07,
      life: sr(0.3, 0.9),
      col: [3, 1.8, 0.7],
      a: 1,
      grav: 9,
      drag: 0.6
    });
  }
  if (water) {
    for (let i = 0; i < 40 * size; i++) {
      const a = srnd() * TAU, r = sr(0, 0.8);
      FX.alpha.spawn({
        x: x + Math.cos(a) * r,
        y: gy,
        z: z + Math.sin(a) * r,
        vx: Math.cos(a) * sr(0.5, 3),
        vy: sr(5, 14) * size,
        vz: Math.sin(a) * sr(0.5, 3),
        size: sr(0.5, 1.2),
        grow: 1.5,
        life: sr(1.2, 2.2),
        col: [0.72, 0.76, 0.78],
        a: 0.6,
        grav: 9.8,
        drag: 0.4,
        floor: gy
      });
    }
    addRipple(x, z, 1.2 * size);
    onBlast(x, gy, z, size, true);
  } else {
    for (let i = 0; i < 46 * size; i++) {
      const a = srnd() * TAU, e = sr(0.9, 1.5);
      const sp = sr(4, 13) * size;
      FX.dirt.spawn({
        x: x + sr(-0.3, 0.3),
        y: gy + 0.2,
        z: z + sr(-0.3, 0.3),
        vx: Math.cos(a) * Math.cos(e) * sp,
        vy: Math.sin(e) * sp,
        vz: Math.sin(a) * Math.cos(e) * sp,
        size: sr(0.25, 0.8) * size,
        grow: 0.6,
        life: sr(1.2, 2.4),
        col: [0.16, 0.12, 0.09],
        a: 0.95,
        grav: 9.8,
        drag: 0.35,
        floor: gy - 0.2,
        fade: 2
      });
    }
    for (let i = 0; i < 26 * size; i++) {
      const a = srnd() * TAU, e = sr(0.5, 1.4), sp = sr(4, 12) * size;
      BLAST.chunks.push({ p: new THREE26.Vector3(x, gy + 0.2, z), v: new THREE26.Vector3(Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp), life: sr(2.5, 4.5), s: sr(0.6, 1.6), r: new THREE26.Euler(srnd() * 6, srnd() * 6, 0) });
    }
    if (BLAST.chunks.length > 220) BLAST.chunks.splice(0, BLAST.chunks.length - 220);
    onBlast(x, gy, z, size, false, { deck });
    if (!deck) crater(x, z, 1.4 * size);
    else splinters(x, gy + 0.2, z, new THREE26.Vector3(0, 1, 0), Math.round(8 * size), M.logEnd, 0.5);
  }
  blastKnock(x, gy, z, size);
  for (let i = 0; i < 14 * size; i++) {
    FX.alpha.spawn({
      x: x + sr(-1, 1),
      y: gy + sr(0.3, 2.5),
      z: z + sr(-1, 1),
      vx: sr(-0.8, 0.8),
      vy: sr(0.6, 2.2),
      vz: sr(-0.8, 0.8),
      size: sr(1.4, 2.6) * size,
      grow: 1.1,
      life: sr(5, 9),
      col: water ? [0.7, 0.72, 0.74] : [0.13, 0.11, 0.09],
      col2: water ? [0.8, 0.82, 0.84] : [0.44, 0.41, 0.37],
      glow: water ? 0 : 0.5,
      a: 0.5,
      fadeIn: 0.25,
      windK: 1.5,
      drag: 0.5
    });
  }
  windUniforms.uBlast.value.set(x, gy, z, 0);
  windUniforms.uBlastStr.value = 1.6 * size;
  blastBarrels(x, gy, z, size);
  nudgeCloth(x, gy, z, 16, 30 * size);
  const d = camera.position.distanceTo(new THREE26.Vector3(x, gy, z));
  BLAST.shake = Math.max(BLAST.shake, clamp(2.4 * size / (1 + d / 6), 0, 1.6));
  const right2 = new THREE26.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const panX = right2.dot(new THREE26.Vector3(x - camera.position.x, 0, z - camera.position.z).normalize());
  const cp0 = camera.position, occl = d > 1.5 && !losClear(x, gy + 0.6, z, cp0.x, cp0.y, cp0.z) ? 1 : 0;
  boom(d, size, panX, occl, lakeRho(x, z) < 1.5 || lakeRho(cp0.x, cp0.z) < 1.4);
  if (d < 9) tinnitus(clamp(1 - d / 9, 0, 1));
  return d;
}
var QUEUE = [];
var BUDGET = () => Math.round(Q.bodies * 0.38 * (1 - PERF.load * 0.6));
var bodiesThisBlast = 0;
var bodiesThisFrame = 0;
var _v4 = new THREE27.Vector3();
var _q7 = new THREE27.Quaternion();
var _up4 = new THREE27.Vector3(0, 1, 0);
var LOG_GEO = new THREE27.CylinderGeometry(0.11, 0.11, 1, 7).rotateZ(Math.PI / 2);
function blastStructs(x, y, z, size) {
  bodiesThisBlast = 0;
  _v4.set(x, y, z);
  const R2 = 5 + 7 * size;
  for (const s of STRUCTS) {
    if (!s.center || s.center.distanceTo(_v4) > R2 + s.radius) continue;
    let any = false;
    for (const p of s.panels) {
      if (p.dead || !p.box) continue;
      const d = p.box.distanceToPoint(_v4);
      if (d > R2) continue;
      // граната выбивает кусок стены вплотную, снаряд/ТМ — несколько секций и крышу над ними
      const dmg = size * 2.6 / Math.pow(0.5 + d, 1.5);
      if (p.mode === "sag") {
        sagPanel(p, dmg * 0.9, _v4);
        continue;
      }
      if (p.onBlast) {
        p.onBlast(p, _v4, size, d);
        continue;
      }
      if (p === s.towerTop) continue;
      // стойка вышки: граната отнимает не больше половины — ломают две, снаряд/ТМ — сразу
      p.hp -= p.maxBlast && size < 1.3 ? Math.min(dmg * sr(0.8, 1.2), p.maxBlast) : dmg * sr(0.8, 1.2);
      if (p.pole) p.hitY = Math.min(p.pole.b.y - 0.3, Math.max(p.pole.a.y + 0.25, y + sr(0.2, 1.2)));
      if (p.hp <= 0) {
        kill(p, _v4, Math.min(14, 7 * size / (0.8 + d * 0.5)), 0);
        any = true;
      }
    }
    if (any) s.shake = 1;
    // взрывом вышку не просто лишает опор, а толкает прочь от взрыва: падает быстрее и в сторону от воронки
    if (any && s.towerTop) {
      s.blastW = Math.min(0.9, 0.25 + size * 0.35);
      s.blastDir = new THREE27.Vector3(s.x - x, 0, s.z - z).normalize();
      s.blastT = FRAME.t;
    }
    if (!s.quiet && s.center.distanceTo(_v4) < R2) dustFrom(s, 10);
    if (Math.random() < 0.6 * (1 - WEATHER.wet) && s.center.distanceTo(_v4) < 3.5 + 2.5 * size + s.radius * 0.5 && size >= 0.8) igniteStruct(s, 0.3);
  }
}
function hitPanel(p, point, dir2, dmg = 0.08) {
  if (!p || p.dead) return;
  if (p.mode === "sag") {
    sagPanel(p, 0.24, point, dir2);
    return;
  }
  if (p.onHit) p.onHit(p, point, dir2);
  p.hp -= dmg;
  splinterPuff(point, dir2);
  if (p.hp <= 0) kill(p, point.clone().addScaledVector(dir2, -1), 3, 0);
}
function kill(p, from, force, delay) {
  if (p.dead) return;
  p.dead = true;
  QUEUE.push({ p, from: from.clone(), force, t: FRAME.t + delay });
}
function boardAt(p, point, pad = 0.06) {
  if (!p.boards) return null;
  let best = null, bd = pad;
  for (const bd2 of p.boards) {
    if (!bd2.alive) continue;
    const d = bd2.box.distanceToPoint(point);
    if (d < bd) {
      bd = d;
      best = bd2;
    }
  }
  return best;
}
function knockBoard(p, bd, dir2, force = 4) {
  if (!bd.alive || p.dead) return;
  bd.alive = false;
  p.boardsLeft--;
  for (const r of p.ranges) {
    if (r.tag !== bd.tag) continue;
    const pos = r.mesh.geometry.attributes.position, a = pos.array, i0 = r.start * 3;
    for (let i = i0; i < (r.start + r.count) * 3; i += 3) {
      a[i] = a[i0];
      a[i + 1] = a[i0 + 1];
      a[i + 2] = a[i0 + 2];
    }
    pos.addUpdateRange(i0, r.count * 3);
    pos.needsUpdate = true;
  }
  const mine = p.parts.filter((q) => q.tag === bd.tag);
  p.parts = p.parts.filter((q) => q.tag !== bd.tag);
  const c = bd.box.getCenter(new THREE27.Vector3());
  if (!p.quiet) dustAt(c, bd.box, 3, false);
  splinterPuff(c, dir2);
  if (!PHYS.ready || !mine.length || bodiesThisFrame > 6) return;
  const rot = p.dims?.rot ?? p.s.rot ?? 0, qInv = new THREE27.Quaternion().setFromAxisAngle(_up4, -rot);
  const group = new THREE27.Group(), lb = new THREE27.Box3();
  for (const part of mine) {
    const g = part.geo.clone().translate(-c.x, -c.y, -c.z).applyQuaternion(qInv);
    g.computeBoundingBox();
    lb.union(g.boundingBox);
    const m = new THREE27.Mesh(g, part.mat);
    m.castShadow = true;
    group.add(m);
  }
  const ls = lb.getSize(new THREE27.Vector3()), lm = lb.getCenter(new THREE27.Vector3());
  for (const m of group.children) m.geometry.translate(-lm.x, -lm.y, -lm.z);
  const qa = new THREE27.Quaternion().setFromAxisAngle(_up4, rot);
  const pos = c.clone().add(lm.applyQuaternion(qa));
  group.position.copy(pos);
  group.quaternion.copy(qa);
  scene.add(group);
  const size = [Math.max(0.03, ls.x), Math.max(0.03, ls.y), Math.max(0.03, ls.z)];
  const b = addBody({
    shape: "box", size, pos, quat: qa,
    mass: clamp(size[0] * size[1] * size[2] * 550, 1, 80),
    vel: dir2.clone().multiplyScalar(force * sr(0.4, 1)).add(new THREE27.Vector3(sr(-0.6, 0.6), sr(0.2, 1.5), sr(-0.6, 0.6))),
    ang: new THREE27.Vector3(sr(-4, 4), sr(-4, 4), sr(-4, 4)),
    life: sr(30, 50), friction: 0.9, restitution: 0.08, damp: [0.1, 0.35], float: 1.7, rad: Math.min(...size) / 2, ccd: 0.05,
    onDone: () => { scene.remove(group); group.traverse((o) => o.geometry?.dispose()); },
    sync: (q, r, f) => { group.position.copy(q); group.quaternion.copy(r); if (f < 1) group.scale.setScalar(Math.max(0.01, f)); }
  });
  if (!b) {
    scene.remove(group);
    return;
  }
  bodiesThisFrame++;
  if (p.s.burn > 0.3 && Math.random() < 0.4) attachFire(b, sr(4, 9));
}
var onGone = null;
function removePanel(p) {
  if (p.mesh) {
    p.mesh.parent?.updateMatrixWorld(true);
    const g = p.mesh.geometry.clone().applyMatrix4(p.mesh.matrixWorld);
    g.computeBoundingBox();
    p.parts = [{ mat: p.mesh.material, geo: g }];
    p.box = g.boundingBox.clone();
    p.center = p.box.getCenter(new THREE27.Vector3());
    p.mesh.parent?.remove(p.mesh);
  }
  collapsePanel(p);
  if (onGone) onGone(p);
  for (const c of p.cols) {
    c.dead = true;
    removeStaticCollider(c);
  }
  for (const pane of PANES) if (pane.panel === p && pane.alive) breakPane(pane, new THREE27.Vector3(sr(-1, 1), 0.3, sr(-1, 1)).normalize(), 2);
}
function processQueue() {
  let n2 = 0;
  bodiesThisFrame = 0;
  const perFrame = Math.max(4, Math.round(Q.bodies * 0.1));
  for (let i = 0; i < QUEUE.length && n2 < 6 && bodiesThisFrame < perFrame; i++) {
    const e = QUEUE[i];
    if (FRAME.t < e.t) continue;
    QUEUE.splice(i--, 1);
    n2++;
    // сбой в обломках не должен оставить висящими опиравшиеся на панель части
    try {
      removePanel(e.p);
      debris(e.p, e.from, e.force, e.fire);
      if (e.p.onKill) e.p.onKill(e.p);
    } catch (err) {
      console.warn("[struct] debris", err);
    }
    e.p.s.supDirty = true;
    supportPass(e.p.s);
  }
}
function supLost(p) {
  const S3 = p.sup, groups = S3.groups || [S3.list];
  for (const L of groups) {
    if (!L || !L.length) continue;
    let alive = 0;
    for (const q of L) if (!q.dead) alive++;
    if (alive / L.length < S3.frac) return L;
  }
  return null;
}
function supportPass(s) {
  let any = false;
  for (const p of s.panels) {
    if (p.dead || !p.sup) continue;
    // связи и настил вышки держатся за каркас, пока он цел: падают вместе с ним одной группой
    if (p.hingeKeep && s.towerTop && !s.towerTop.dead) continue;
    if (p === s.towerTop) {
      towerSupport(p, p.sup.list, !!supLost(p));
      continue;
    }
    const L = supLost(p);
    if (L) {
      any = true;
      if (p.big) {
        const d = new THREE27.Vector3();
        for (const q of L) if (q.dead) d.add(q.center);
        d.divideScalar(Math.max(1, L.filter((q) => q.dead).length)).sub(p.center);
        d.y = 0;
        p.topple = d.lengthSq() > 1e-4 ? d.normalize() : new THREE27.Vector3(1, 0, 0);
        if (p.onTopple) p.onTopple(p, p.topple);
      }
      kill(p, _v4.copy(p.center).add(new THREE27.Vector3(0, 2, 0)), 0.5, p.big ? 0.12 : sr(0.05, 0.45));
    }
  }
  s.supDirty = any;
}
function localBox(p, rot) {
  const q = _q7.setFromAxisAngle(_up4, -rot), b = new THREE27.Box3();
  for (const part of p.parts) {
    const pos = part.geo.attributes.position;
    for (let i = 0; i < pos.count; i += 3) b.expandByPoint(_v4.fromBufferAttribute(pos, i).sub(p.center).applyQuaternion(q));
  }
  return b;
}
function debris(p, from, force, fire) {
  const s = p.s, canBody = PHYS.ready && (bodiesThisBlast < BUDGET() || p.big);
  const dir2 = new THREE27.Vector3().subVectors(p.center, from);
  dir2.y = Math.max(dir2.y, 0.2);
  dir2.normalize();
  if (!p.quiet) dustAt(p.center, p.box, p.big ? 30 : p.kind === "roof" ? 6 : 10, fire);
  if (p.mode === "none" || p.mode === "dust") return;
  if (p.pole && PHYS.ready) return poleDebris(p, dir2, force, fire);
  if (p.mode === "shatter" && p.dims) return shatter(p, dir2, force, fire, canBody);
  if (!canBody || !p.parts.length) return;
  const rot = s.rot ?? 0, lb = localBox(p, rot), size = lb.getSize(new THREE27.Vector3()), mid = lb.getCenter(new THREE27.Vector3());
  if (size.x * size.y * size.z > 60 && !p.big) return;
  const qInv = new THREE27.Quaternion().setFromAxisAngle(_up4, -rot);
  const group = new THREE27.Group();
  const byMat = /* @__PURE__ */ new Map();
  for (const part of p.parts) {
    if (!byMat.has(part.mat)) byMat.set(part.mat, []);
    byMat.get(part.mat).push(part.geo);
  }
  for (const [mat, geos] of byMat) {
    const list = geos.length > 6 ? [BGU2.mergeGeometries(geos, false) || geos[0]] : geos;
    for (const g0 of list) {
      const g = g0.clone().translate(-p.center.x, -p.center.y, -p.center.z).applyQuaternion(qInv).translate(-mid.x, -mid.y, -mid.z);
      const m = new THREE27.Mesh(g, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
  }
  const pos = p.center.clone().add(mid.clone().applyQuaternion(_q7.setFromAxisAngle(_up4, rot)));
  group.position.copy(pos);
  group.quaternion.setFromAxisAngle(_up4, rot);
  scene.add(group);
  const hs = [Math.max(0.04, size.x), Math.max(0.04, size.y), Math.max(0.04, size.z)];
  const mass = p.big ? 2500 : clamp(hs[0] * hs[1] * hs[2] * p.density * 0.5, 2, 400);
  const tp = p.topple;
  const vel = p.big ? new THREE27.Vector3(tp.x * 0.6, -0.2, tp.z * 0.6) : dir2.clone().multiplyScalar(force * sr(0.5, 1.1)).add(new THREE27.Vector3(0, force * 0.2, 0));
  const ang = p.big ? new THREE27.Vector3(tp.z, 0, -tp.x).multiplyScalar(0.28) : new THREE27.Vector3(sr(-2, 2), sr(-2, 2), sr(-2, 2)).multiplyScalar(Math.min(3, force * 0.3));
  const b = addBody({
    shape: "box",
    size: hs,
    mass,
    pos,
    quat: group.quaternion,
    vel,
    keep: !!p.big,
    ang,
    life: p.kind === "prop" ? 40 : 60,
    friction: 0.8,
    restitution: 0.1,
    damp: [0.1, 0.3],
    float: p.float,
    rad: Math.min(hs[0], hs[1], hs[2]) / 2,
    onDone: () => {
      scene.remove(group);
      group.traverse((o) => o.geometry?.dispose());
    },
    sync: (q, r, f) => {
      group.position.copy(q);
      group.quaternion.copy(r);
      if (f < 1) group.scale.setScalar(Math.max(0.01, f));
    }
  });
  if (b) {
    bodiesThisBlast++;
    bodiesThisFrame++;
    if (fire && p.burnable) attachFire(b, sr(5, 10));
    if (p.big) {
      TOPPLED.push({ b, group, p, age: 0, hs, m0: new THREE27.Matrix4().compose(pos, group.quaternion, new THREE27.Vector3(1, 1, 1)), vy: 0 });
      woodCrack(camera.position.distanceTo(pos), 0, 1.5);
    }
  } else {
    scene.remove(group);
  }
}
function shatter(p, dir2, force, fire, canBody) {
  const D = p.dims, c = Math.cos(D.rot), s = Math.sin(D.rot);
  const ux = c, uz = -s;
  const pieces = [];
  if (D.log) {
    const rows = Math.max(1, Math.round(D.sy / 0.225)), segs = Math.max(1, Math.round(D.sx / 1.6));
    for (let r = 0; r < rows; r++) for (let k = 0; k < segs; k++) {
      const L = D.sx / segs, t = -D.sx / 2 + L * (k + 0.5), y = D.y - D.sy / 2 + (r + 0.5) * (D.sy / rows);
      pieces.push({ x: D.x + ux * t, y, z: D.z + uz * t, L: L * sr(0.8, 1), log: true, bi: r });
    }
  } else {
    const n2 = Math.max(1, Math.round(D.sx / 0.2));
    for (let k = 0; k < n2; k++) {
      const t = -D.sx / 2 + (k + 0.5) * (D.sx / n2), cut = D.sy > 1.2 && Math.random() < 0.6 ? 2 : 1;
      for (let q = 0; q < cut; q++) pieces.push({ x: D.x + ux * t, y: D.y - D.sy / 2 + (q + 0.5) * D.sy / cut, z: D.z + uz * t, L: D.sy / cut * sr(0.7, 1), log: false, w: D.sx / n2, bi: k });
    }
  }
  // кирпичная кладка рассыпается кусками в несколько кирпичей
  if (D.brick) {
    pieces.length = 0;
    const cols = Math.max(1, Math.round(D.sx / 0.5)), rows = Math.max(1, Math.round(D.sy / 0.42));
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const w = D.sx / cols, t = -D.sx / 2 + (k + 0.5) * w + sr(-0.04, 0.04), y = D.y - D.sy / 2 + (r + 0.5) * (D.sy / rows);
      pieces.push({ x: D.x + ux * t, y, z: D.z + uz * t, L: D.sy / rows * sr(0.7, 0.95), log: false, w: w * sr(0.75, 1), bi: k, brick: true });
    }
  }
  // уже выбитые пулями доски не появляются второй раз
  if (p.boards && p.boards.length === (D.log ? Math.max(1, Math.round(D.sy / 0.225)) : Math.max(1, Math.round(D.sx / 0.2)))) {
    for (let i = pieces.length - 1; i >= 0; i--) if (!p.boards[pieces[i].bi].alive) pieces.splice(i, 1);
  }
  const maxBodies = Math.min(pieces.length, Math.round(3 + Q.bodies / 18));
  pieces.sort(() => Math.random() - 0.5);
  pieces.forEach((pc, i) => {
    if (i >= maxBodies || !canBody || bodiesThisBlast >= BUDGET()) {
      if (i < 12) (pc.brick ? hgBrickChip : splinterPuff)(_v4.set(pc.x, pc.y, pc.z), dir2);
      return;
    }
    let mesh, size, qa;
    if (pc.log) {
      mesh = new THREE27.Mesh(LOG_GEO, M.logEnd === D.mat ? M.logEnd : M.barkLog || M.logEnd);
      mesh.scale.set(pc.L, 1, 1);
      qa = new THREE27.Quaternion().setFromAxisAngle(_up4, D.rot);
      size = [pc.L, 0.22, 0.22];
    } else {
      const g = uvBox(new THREE27.BoxGeometry(pc.w * 0.9, pc.L, D.sz * 0.8), pc.w * 0.9, pc.L, D.sz * 0.8, 1.5, false);
      mesh = new THREE27.Mesh(g, D.mat ?? p.mat ?? M.planks);
      qa = new THREE27.Quaternion().setFromEuler(new THREE27.Euler(sr(-0.1, 0.1), D.rot, sr(-0.15, 0.15)));
      size = [pc.w * 0.9, pc.L, D.sz * 0.8];
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const pos = new THREE27.Vector3(pc.x, pc.y, pc.z);
    const sc = mesh.scale.clone();
    const b = addBody({
      shape: "box",
      size,
      mass: size[0] * size[1] * size[2] * (pc.brick ? 1500 : 550) + 1,
      pos,
      quat: qa,
      vel: dir2.clone().multiplyScalar(force * sr(0.3, 1.1)).add(new THREE27.Vector3(sr(-1, 1), sr(0, 2) * Math.min(1, force / 4), sr(-1, 1))),
      ang: new THREE27.Vector3(sr(-3, 3), sr(-3, 3), sr(-3, 3)),
      life: sr(35, 60),
      friction: 0.9,
      restitution: 0.05,
      damp: [0.1, 0.35],
      float: 1.7,
      rad: 0.1,
      ccd: 0.08,
      onDone: () => {
        scene.remove(mesh);
        if (!pc.log) mesh.geometry.dispose();
      },
      sync: (q, r, f) => {
        mesh.position.copy(q);
        mesh.quaternion.copy(r);
        mesh.scale.copy(sc).multiplyScalar(clamp(f, 0.01, 1));
      }
    });
    if (!b) {
      scene.remove(mesh);
      return;
    }
    bodiesThisBlast++;
    bodiesThisFrame++;
    if (fire && Math.random() < 0.3) attachFire(b, sr(5, 10));
  });
  const d = camera.position.distanceTo(_v4.set(D.x, D.y, D.z));
  if (D.brick) {
    hgBrickDust(D);
    if (d < 220) impactSound("stone", d);
  } else if (d < 120) woodCrack(d, 0, 0.6);
}
function hgBrickChip(p, dir2) {
  for (let i = 0; i < 4; i++) FX.dirt.spawn({ x: p.x, y: p.y, z: p.z, vx: dir2.x * sr(1, 4) + sr(-1, 1), vy: sr(0.5, 3), vz: dir2.z * sr(1, 4) + sr(-1, 1), size: sr(0.05, 0.11), life: 1.4, col: [0.46, 0.25, 0.18], a: 0.95, grav: 9.8, floor: hFast(p.x, p.z) });
  FX.alpha.spawn({ x: p.x, y: p.y, z: p.z, vx: dir2.x, vy: 0.3, vz: dir2.z, size: 0.4, grow: 1, life: 1.6, col: [0.56, 0.46, 0.4], a: 0.4, drag: 2 });
}
function hgBrickDust(D) {
  const c = Math.cos(D.rot), s = Math.sin(D.rot);
  for (let i = 0; i < 12; i++) {
    const t = sr(-0.5, 0.5) * D.sx, y = D.y + sr(-0.5, 0.5) * D.sy;
    FX.alpha.spawn({ x: D.x + c * t, y, z: D.z - s * t, vx: sr(-0.6, 0.6), vy: sr(0, 0.7), vz: sr(-0.6, 0.6), size: sr(0.5, 1.1), grow: 1.2, life: sr(2, 4), col: [0.55, 0.43, 0.37], a: 0.42, drag: 1.5 });
  }
}
var splinterPuff = function(){};
var dustAt = function(){};
var dustFrom = function(){};
var TOPPLED = [];
function updateToppled(dt) {
  for (let i = TOPPLED.length - 1; i >= 0; i--) {
    const t = TOPPLED[i];
    t.age += dt;
    if (!t.b.body) {
      TOPPLED.splice(i, 1);
      continue;
    }
    // вышка разваливается от удара о землю: резкая потеря скорости после падения
    if (t.p.breakOnImpact) {
      const lv = t.b.body.getLinearVelocity(), sp = Math.hypot(lv.x(), lv.y(), lv.z());
      const hitNow = t.age > 0.5 && t.sp0 !== void 0 && t.sp0 - sp > 2.2 && t.sp0 > 3;
      t.sp0 = Math.max(sp, (t.sp0 ?? 0) * 0.9);
      if (hitNow || t.age > 6) {
        breakApart(t);
        TOPPLED.splice(i, 1);
        continue;
      }
    }
    if (!t.hit && t.age > 0.6 && t.b.pos.y < hFast(t.b.pos.x, t.b.pos.z) + Math.min(t.hs[0], t.hs[2]) * 0.8) {
      t.hit = true;
      BLAST.shake = Math.max(BLAST.shake, 0.5 / (1 + camera.position.distanceTo(t.b.pos) / 40));
      for (let k = 0; k < 30; k++) {
        const s2 = sr(-0.5, 0.5) * t.hs[1];
        const up = new THREE27.Vector3(0, 1, 0).applyQuaternion(t.b.quat);
        FX.alpha.spawn({ x: t.b.pos.x + up.x * s2 + sr(-1, 1), y: hFast(t.b.pos.x, t.b.pos.z) + 0.3, z: t.b.pos.z + up.z * s2 + sr(-1, 1), vx: sr(-1.5, 1.5), vy: sr(0.3, 1.2), vz: sr(-1.5, 1.5), size: sr(1, 2.2), grow: 1.4, life: sr(3, 6), col: [0.44, 0.4, 0.34], a: 0.4, drag: 1.2, windK: 0.8 });
      }
      woodCrack(camera.position.distanceTo(t.b.pos), 0, 2);
    }
    if (t.age > 2 && (isSleeping(t.b) || t.age > 18)) {
      freezeBody(t.b);
      const up = new THREE27.Vector3(0, 1, 0).applyQuaternion(t.b.quat);
      const yaw = Math.atan2(up.x, up.z), L = t.hs[1], w = Math.max(t.hs[0], t.hs[2]);
      const c = addBox(t.b.pos.x, t.b.pos.y, t.b.pos.z, w * 0.8, Math.min(t.hs[0], t.hs[2]) * 0.9, L * Math.hypot(up.x, up.z) + w * 0.5, yaw, { walk: true });
      c.dyn = true;
      TOPPLED.splice(i, 1);
    }
  }
}
function poleDebris(p, dir2, force, fire) {
  const P3 = p.pole, a = P3.a, b = P3.b, H3 = b.y - a.y;
  const f = clamp(p.hitY !== void 0 ? (p.hitY - a.y) / H3 : sr(0.2, 0.75), 0.12, 0.85);
  const m = a.clone().lerp(b, f);
  // стойка вышки: пенёк остаётся стоять, верх остаётся прибит к каркасу и уходит в крен/падение вместе с ним
  if (p.s.towerTop && !p.s.towerTop.dead) {
    const mk = (s0, s1, r0, r1) => {
      const d = new THREE27.Vector3().subVectors(s1, s0), L = d.length();
      const g = new THREE27.CylinderGeometry(r1, r0, L, 7).applyQuaternion(new THREE27.Quaternion().setFromUnitVectors(_up4, d.normalize()));
      const c = s0.clone().add(s1).multiplyScalar(0.5);
      return g.translate(c.x, c.y, c.z);
    };
    const rm = lerp(P3.r, P3.r1, f);
    const stump = new THREE27.Mesh(mk(a, m.clone().add(new THREE27.Vector3(0, -0.04, 0)), P3.r, rm), P3.mat);
    stump.castShadow = true;
    stump.receiveShadow = true;
    scene.add(stump);
    p.s.breakY = m.y;
    if (p.hinged) return;
    // излом: верхний обломок чуть сдвинут от пенька — видно, что стойка перебита
    const off = new THREE27.Vector3(dir2.x, 0, dir2.z).normalize().multiplyScalar(0.06);
    (p.s.hingeExtra ??= []).push({ geo: mk(m.clone().add(off).add(new THREE27.Vector3(0, 0.05, 0)), b, rm, P3.r1), mat: P3.mat });
    splinters(m.x, m.y, m.z, dir2, 8, M.logEnd, 0.3);
    woodCrack(camera.position.distanceTo(m), panOf(m), 1.1);
    if (fire) for (let k = 0; k < 6; k++) FX.add.spawn({ x: m.x, y: m.y, z: m.z, vx: sr(-1.5, 1.5), vy: sr(1, 3), vz: sr(-1.5, 1.5), size: 0.05, life: sr(0.8, 1.6), col: [3, 1.3, 0.4], a: 1, grav: 3 });
    return;
  }
  const segs = [[a.clone().add(new THREE27.Vector3(0, 0.02, 0)), m, P3.r, lerp(P3.r, P3.r1, f), 0.05], [m.clone(), b, lerp(P3.r, P3.r1, f), P3.r1, 1]];
  for (const [s0, s1, r0, r1, k] of segs) {
    const d = new THREE27.Vector3().subVectors(s1, s0), L = d.length();
    if (L < 0.15) continue;
    const g = new THREE27.CylinderGeometry(r1, r0, L, 7);
    const mesh = new THREE27.Mesh(g, P3.mat);
    mesh.castShadow = true;
    scene.add(mesh);
    const q = new THREE27.Quaternion().setFromUnitVectors(_up4, d.clone().normalize());
    const pos = s0.clone().add(s1).multiplyScalar(0.5);
    const tp = p.topple || dir2;
    const bb = addBody({
      shape: "cyl", size: [Math.max(r0, r1), L], mass: 30 * L, pos, quat: q,
      vel: new THREE27.Vector3(tp.x, 0, tp.z).multiplyScalar(force * 0.5 * k),
      ang: new THREE27.Vector3(tp.z, 0, -tp.x).multiplyScalar(1.2 * k + sr(-0.2, 0.2)),
      life: sr(40, 70), friction: 0.9, restitution: 0.05, damp: [0.1, 0.3], float: 1.5, rad: r0,
      onDone: () => { scene.remove(mesh); g.dispose(); },
      sync: (pp, r, fd) => { mesh.position.copy(pp); mesh.quaternion.copy(r); if (fd < 1) mesh.scale.setScalar(Math.max(0.01, fd)); }
    });
    if (!bb) { scene.remove(mesh); g.dispose(); continue; }
    if (fire && Math.random() < 0.5) attachFire(bb, sr(4, 9));
  }
  splinters(m.x, m.y, m.z, dir2, 6, M.logEnd, 0.3);
  woodCrack(camera.position.distanceTo(m), 0, 1);
}
var _one = new THREE27.Vector3(1, 1, 1);
function breakApart(t) {
  const b = t.b, p = t.p;
  const lv = b.body.getLinearVelocity(), vx = lv.x(), vy = lv.y(), vz = lv.z();
  const M1 = new THREE27.Matrix4().compose(b.pos.clone(), b.quat.clone(), _one), q = b.quat.clone();
  const inv0 = t.m0.clone().invert();
  const burning = p.s.burn > 0.2;
  killBody(b);
  BLAST.shake = Math.max(BLAST.shake, 0.45 / (1 + camera.position.distanceTo(_v4.setFromMatrixPosition(M1)) / 40));
  const items = [];
  for (const part of p.parts) {
    const g = part.geo.clone().applyMatrix4(inv0);
    g.computeBoundingBox();
    const sz = g.boundingBox.getSize(new THREE27.Vector3());
    items.push({ g, mat: part.mat, sz, vol: Math.max(sz.x, 0.03) * Math.max(sz.y, 0.03) * Math.max(sz.z, 0.03) });
  }
  items.sort((a, c) => c.vol - a.vol);
  const N = Math.min(items.length, Math.round(8 + Q.bodies / 5));
  const rest = [];
  items.forEach((it, i) => {
    if (i >= N || Math.max(it.sz.x, it.sz.y, it.sz.z) < 0.15) {
      if (Math.max(it.sz.x, it.sz.y, it.sz.z) >= 0.15) rest.push(it);
      it.g.dispose();
      return;
    }
    const c = it.g.boundingBox.getCenter(new THREE27.Vector3());
    it.g.translate(-c.x, -c.y, -c.z);
    const mesh = new THREE27.Mesh(it.g, it.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const pos = c.applyMatrix4(M1), size = [Math.max(0.04, it.sz.x), Math.max(0.04, it.sz.y), Math.max(0.04, it.sz.z)];
    const bb = addBody({
      shape: "box", size, pos, quat: q,
      mass: clamp(size[0] * size[1] * size[2] * 600, 2, 250),
      vel: new THREE27.Vector3(vx * 0.5 + sr(-2, 2), Math.abs(vy) * 0.25 + sr(0.5, 3), vz * 0.5 + sr(-2, 2)),
      ang: new THREE27.Vector3(sr(-4, 4), sr(-4, 4), sr(-4, 4)),
      life: sr(40, 70), friction: 0.85, restitution: 0.12, damp: [0.1, 0.3], float: 1.6,
      rad: Math.min(...size) / 2, ccd: 0.06,
      onDone: () => { scene.remove(mesh); it.g.dispose(); },
      sync: (pp, r, f) => { mesh.position.copy(pp); mesh.quaternion.copy(r); if (f < 1) mesh.scale.setScalar(Math.max(0.01, f)); }
    });
    if (!bb) { scene.remove(mesh); it.g.dispose(); return; }
    if (burning && Math.random() < 0.35) attachFire(bb, sr(5, 12));
  });
  const cp = _v4.setFromMatrixPosition(M1);
  dustAt(cp, new THREE27.Box3().setFromCenterAndSize(cp.clone(), new THREE27.Vector3(4, 1.5, 4)), 26, burning);
  woodCrack(camera.position.distanceTo(cp), 0, 2.2);
}
function sagPanel(p, amt, point, dir2) {
  if (p.dead) return;
  p.sag = Math.min(1, (p.sag || 0) + amt * sr(0.7, 1.2));
  if (point) for (let i = 0; i < 6; i++) FX.dirt.spawn({ x: point.x, y: point.y, z: point.z, vx: (dir2 ? -dir2.x : 0) * sr(0.3, 1.2) + sr(-0.4, 0.4), vy: sr(-0.5, 0.6), vz: (dir2 ? -dir2.z : 0) * sr(0.3, 1.2) + sr(-0.4, 0.4), size: sr(0.02, 0.05), life: 1.4, col: [0.5, 0.44, 0.3], a: 0.95, grav: 9.8, floor: hFast(point.x, point.z) });
  if (point) FX.alpha.spawn({ x: point.x, y: point.y, z: point.z, vx: 0, vy: 0.2, vz: 0, size: 0.25, grow: 0.8, life: 1.2, col: [0.55, 0.5, 0.38], a: 0.35, drag: 2 });
  if (p.sag >= 1 && amt > 0.5) {
    kill(p, point || p.center, 1, 0);
    p.wall && updateWall(p.wall);
    return;
  }
  for (const r of p.ranges) {
    const pos = r.mesh.geometry.attributes.position, a = pos.array, i0 = r.start * 3, n2 = r.count * 3;
    if (!r.orig) {
      r.orig = a.slice(i0, i0 + n2);
      let lo = 1e9, cx = 0, cz = 0;
      for (let i = 0; i < n2; i += 3) {
        lo = Math.min(lo, r.orig[i + 1]);
        cx += r.orig[i];
        cz += r.orig[i + 2];
      }
      r.lo = lo;
      r.cx = cx / (n2 / 3);
      r.cz = cz / (n2 / 3);
    }
    const ky = 1 - 0.58 * p.sag, kx = 1 + 0.28 * p.sag;
    for (let i = 0; i < n2; i += 3) {
      a[i0 + i] = r.cx + (r.orig[i] - r.cx) * kx;
      a[i0 + i + 1] = r.lo + (r.orig[i + 1] - r.lo) * ky;
      a[i0 + i + 2] = r.cz + (r.orig[i + 2] - r.cz) * kx;
    }
    pos.addUpdateRange(i0, n2);
    pos.needsUpdate = true;
  }
  if (p.wall) updateWall(p.wall);
}
function updateWall(w) {
  let top = w.base;
  for (const q of w.bags) if (!q.dead) top = Math.max(top, q.top0 - (q.top0 - q.base0) * 0.58 * (q.sag || 0));
  const c = w.col;
  w.y1max ??= c.y1;
  top = Math.min(top, w.y1max);
  if (Math.abs(c.y1 - top) < 0.02) return;
  removeStaticCollider(c);
  c.y1 = Math.max(c.y0 + 0.05, top);
  addStaticCollider(c);
}
var BURNING = [];
var igniteStruct = function(){};
var charCell = (x, z, amt, glow) => {
  const i = Math.floor(x - BURN.X0), j = Math.floor(z - BURN.X0);
  if (i < 0 || j < 0 || i >= BURN.N || j >= BURN.N) return;
  const k = (j * BURN.N + i) * 4;
  charData[k] = Math.min(255, charData[k] + Math.floor(amt * 255 + Math.random()));
  if (glow >= 0) charData[k + 1] = Math.min(255, Math.max(0, glow * 255));
};
var acc2 = 0;
function updateBurning(dt) {
  acc2 += dt;
  const step = acc2 >= 0.25;
  const st = acc2;
  if (step) acc2 = 0;
  const cp = camera.position;
  FIRE.structs = [];
  for (let i = BURNING.length - 1; i >= 0; i--) {
    const s = BURNING[i];
    const alive = s.panels.filter((p) => !p.dead && p.burnable && p.parts.length);
    if (step) {
      const rain = WEATHER.rain;
      // дождь: рост огня почти останавливается, а гашение сильнее — открытый огонь (мост, навес) гаснет быстрее дома
      const open = s.kind === "bridge" || s.kind === "stand" || s.kind === "porch" ? 1.6 : 1;
      s.burn = clamp(s.burn + st * (0.035 * (s.thin ?? 1) * (1 - rain * 0.9) - rain * open * (s.burn < 0.5 ? 0.07 : 0.035)), 0, 1);
      s.fuel -= st * s.burn * 9e-3 * (s.thin ?? 1);
      s.burnT += st;
      s.dose = (s.dose ?? 0) + st * s.burn;
      if (s.fuel <= 0 || s.burn <= 0.01 || !alive.length) {
        // прогорело: тонкие деревянные постройки (лабазы, мост, столбы, навесы) не остаются стоять на обугленных опорах
        if (s.burnT > 12 && THIN_BURN.has(s.kind)) {
          for (const p of alive) if (p !== s.towerTop && !p.dead) burnThrough(s, p);
        }
        if (s.burnT > 20 && WEATHER.rain < 0.5) {
          s.smolder = sr(70, 130);
          s.smolder0 = s.smolder;
          if (!SMOLDER.includes(s)) SMOLDER.push(s);
        }
        s.charred = 1;
        structFlamesOff(s);
        if (s.kind === "house") burnItems(s);
        if (s.kind === "house" || s.kind === "shed" || s.kind === "porch") charPile(s);
        s.burn = 0;
        BURNING.splice(i, 1);
        for (const p of s.panels) if (p.box) forFootprint(p, (x, z) => charCell(x, z, 0.1, 0));
        markCharDirty();
        continue;
      }
      for (const p of s.panels) if (p.box && !p.dead && Math.random() < 0.5) forFootprint(p, p.burnable ? (x, z) => charCell(x, z, st * 0.05 * s.burn, s.burn * sr(0.6, 1)) : (x, z) => charCell(x, z, st * 0.012 * s.burn, -1));
      markCharDirty();
      for (const p of alive) {
        const k = p.kind === "roof" ? 1.6 : p.kind === "wall" ? 0.5 : 1;
        p.hp -= st * s.burn * 0.012 * k * sr(0.3, 1.7) * (s.log ? 0.7 : 1) * (s.thin ?? 1);
        // «доза» огня: каждая деталь прогорает на своём пороге — стойки раньше, толстые стены сруба позже
        p.burnAt ??= burnThreshold(s, p);
        if (p === s.towerTop || p.dead) continue;
        if (p.hp <= 0 || s.dose > p.burnAt) burnThrough(s, p);
      }
      // стёкла лопаются от жара (~через минуту прогрева у настоящего пожара): осколки падают наружу, проём начинает «дышать»
      if (s.burn > 0.3 && Math.random() < st * 0.6) {
        s.panes ??= PANES.filter((q) => q.alive && Math.hypot(q.pos.x - s.center.x, q.pos.z - s.center.z) < (s.radius ?? 5) + 0.6);
        const q = s.panes.find((q2) => q2.alive);
        if (q) breakPaneRef(q, q.pos.clone().sub(s.center).setY(0.2).normalize(), 1.2);
      }
      if (s.burn > 0.5 && Math.random() < st * 0.8) ignite(s.x + sr(-1, 1) * ((s.w ?? 3) / 2 + 1.5), s.z + sr(-1, 1) * ((s.d ?? 3) / 2 + 1.5), 1, 0.8);
      if (s.burn > 0.7 && Math.random() < st * 0.02) {
        for (const o of STRUCTS) if (o !== s && o.center && o.center.distanceTo(s.center) < 7 + o.radius) igniteStruct(o, 0.1);
      }
    }
    const d2 = (s.x - cp.x) ** 2 + (s.z - cp.z) ** 2;
    FIRE.structs.push({ x: s.center.x, z: s.center.z, y: s.fy + 1.2, p: s.burn * 8 });
    structFlames(s, alive, dt);
    fireNear(s.center, s.burn * 7);
    if (d2 > 170 * 170) continue;
    // искры и угольки: летят из самих языков пламени, а не из центра постройки
    if (s.fl && s.fl.length && Math.random() < dt * s.burn * 6 * (0.5 + Q.fx * 0.5)) {
      const f = s.fl[Math.random() * s.fl.length | 0];
      if (f.i > 0.2 && f.y > -900) FX.add.spawn({ x: f.x + sr(-0.2, 0.2), y: f.y + f.h * sr(0.4, 0.9), z: f.z + sr(-0.2, 0.2), vx: sr(-0.6, 0.6) + f.lx * 2, vy: sr(2, 5), vz: sr(-0.6, 0.6) + f.lz * 2, size: sr(0.025, 0.055), life: sr(1.2, 2.8), col: [2.6, 1.2, 0.4], a: 1, grav: -0.2, windK: 1.3, drag: 0.6, cool: 0.25 });
    }
    // дым. Начальная стадия: серый, струится из проёмов и из-под карниза (дом «дымит», огня снаружи нет).
    // После вспышки — густой бурый, почти чёрный у основания, подсвеченный снизу огнём столб над кровлей
    const smokeRate = (4 + s.burn * 18) * (0.6 + Q.fx * 0.4);
    const vents = s.vents, early = s.burn < 0.35, roofY = s.fy + (s.h ?? 2.5) + (s.hr ?? 0) * 0.6;
    let sk = dt * smokeRate;
    while (sk > 0) {
      if (Math.random() < sk) {
        const steam = WEATHER.rain > 0.3 && Math.random() < WEATHER.rain * 0.6;
        const dark = early ? 0.16 : 0.05 + (1 - s.burn) * 0.08;
        let x, y, z, vx = sr(-0.3, 0.3), vz = sr(-0.3, 0.3), size = sr(1.6, 3.2) * (0.6 + s.burn * 0.7), vy = sr(2, 3.6) * (0.6 + s.burn * 0.6);
        if (vents && vents.length && (early || Math.random() < 0.3)) {
          const v = vents[Math.random() * vents.length | 0];
          x = v.x + v.nx * 0.25;
          z = v.z + v.nz * 0.25;
          y = v.y1 - 0.12;
          vx = v.nx * sr(0.5, 1.1);
          vz = v.nz * sr(0.5, 1.1);
          vy = sr(0.8, 1.6);
          size = sr(0.5, 1) * (0.7 + s.burn);
        } else {
          x = s.center.x + sr(-1.2, 1.2) * ((s.w ?? 3) / 3);
          y = (vents ? roofY : s.fy + (s.h ?? 2.5)) * 1 + sr(0, 1) * (vents ? 1 : 1);
          z = s.center.z + sr(-1.2, 1.2) * ((s.d ?? 3) / 3);
        }
        FX.alpha.spawn({
          x,
          y,
          z,
          vx,
          vy,
          vz,
          size,
          grow: sr(1.8, 2.8),
          life: sr(8, 16),
          col: steam ? [0.62, 0.62, 0.63] : [dark * 1.1, dark, dark * 0.9],
          col2: steam ? [0.78, 0.78, 0.8] : early ? [0.5, 0.49, 0.47] : [0.34, 0.32, 0.3],
          shift: 1.1,
          a: steam ? 0.35 : early ? 0.38 + s.burn : 0.55 + s.burn * 0.2,
          fadeIn: 0.5,
          windK: 2.6,
          drag: 0.22,
          glow: steam || early ? 0.1 * s.burn : 0.55 * s.burn
        });
      }
      sk -= 1;
    }
    if (alive.length && Math.random() < dt * 6 * s.burn) {
      const p = alive[Math.random() * alive.length | 0], b = p.box;
      FX.alpha.spawn({ x: sr(b.min.x, b.max.x), y: sr(b.min.y, b.max.y), z: sr(b.min.z, b.max.z), vx: 0, vy: sr(0.4, 0.9), vz: 0, size: sr(0.3, 0.6), grow: 0.8, life: sr(2, 4), col: [0.18, 0.17, 0.16], a: 0.3, fadeIn: 0.3, windK: 1.2, drag: 0.4, glow: 0.2 });
    }
  }
}
function placeStructFlame(s, alive, f) {
  const b = s.burn, house = s.kind === "house" && s.hr !== void 0;
  const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0), W = s.w ?? 3, D = s.d ?? 3, H = s.h ?? 2.5;
  const toW = (lx, lz) => [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c];
  const roofGone = house && s.panels.some((p) => p.kind === "roof" && p.dead);
  const vents = house ? s.vents || [] : [];
  const wIn = house ? (b < 0.3 ? 3 : 0.8) : 0;
  const wVent = vents.length && b > 0.3 ? (b > 0.45 ? 5 : 2.5) : 0;
  const wRoof = house && b > 0.5 ? (s.roofBurn || roofGone ? 4.5 : b > 0.75 ? 1.2 : 0) : 0;
  const walls = house ? alive.filter((p) => p.kind !== "roof" && p.kind !== "prop") : alive;
  const wPan = walls.length ? house ? b > 0.42 ? 3 : 0 : 5 : 0;
  const tot = wIn + wVent + wRoof + wPan;
  if (tot <= 0) return false;
  let r = Math.random() * tot;
  f.p = null;
  f.lx = 0;
  f.lz = 0;
  f.lean = 0.35;
  if (s.name === "стог") {
    // стог горит по всей поверхности, сильнее у верха
    const a = Math.random() * TAU, u = Math.sqrt(Math.random()) * 0.85, R0 = W / 2, rr = R0 * (1 - u * u * 0.75) * 1.02;
    f.x = s.x + Math.cos(a) * rr;
    f.z = s.z + Math.sin(a) * rr;
    f.y = s.fy + H * u - 0.1;
    f.w = sr(0.8, 1.5) * (0.6 + b * 0.6);
    f.h0 = sr(1.2, 2.6) * (0.5 + b);
    f.lx = Math.cos(a) * 0.12;
    f.lz = Math.sin(a) * 0.12;
    f.soot = 0.55;
    f.k = 1.05;
    f.p = alive[0];
  } else if ((r -= wIn) < 0) {
    // очаг внутри: на полу, у мебели — виден в окнах
    const [x, z] = toW(sr(-1, 1) * (W / 2 - 0.9), sr(-1, 1) * (D / 2 - 0.9));
    f.x = x;
    f.z = z;
    f.y = s.fy + 0.02;
    f.w = sr(0.6, 1.2) * (0.6 + b);
    f.h0 = Math.min(H * 0.95, sr(0.7, 1.5) * (0.6 + b * 1.6));
    f.soot = 0.6;
    f.k = 1;
  } else if ((r -= wVent) < 0) {
    // выброс пламени из проёма: из верхней трети окна наружу и вверх по стене
    const v = vents[Math.random() * vents.length | 0], hv = v.y1 - v.y0, o = sr(0.02, 0.14);
    const along = sr(-0.3, 0.3) * v.w, tx = -v.nz, tz = v.nx;
    f.x = v.x + v.nx * o + tx * along;
    f.z = v.z + v.nz * o + tz * along;
    f.y = v.y1 - Math.min(0.55, hv * 0.38) * sr(0.5, 1);
    f.w = v.w * sr(0.6, 1.05) * (0.8 + b * 0.6);
    f.h0 = sr(1.3, 2.6) * (0.45 + b * 1.25);
    f.lx = v.nx * sr(0.18, 0.45);
    f.lz = v.nz * sr(0.18, 0.45);
    f.soot = 0.7;
    f.k = 1.1;
  } else if ((r -= wRoof) < 0) {
    // кровля: по скатам и коньку; прогоревшая — языки из-под обрешётки и изнутри
    const lz = sr(-1, 1) * D / 2 * 0.85, [x, z] = toW(sr(-1, 1) * W / 2 * 0.9, lz);
    f.x = x;
    f.z = z;
    f.y = roofGone ? s.fy + H * sr(0.35, 0.95) : s.fy + H + s.hr * (1 - Math.abs(lz) / (D / 2)) - 0.12;
    f.w = sr(1.3, 2.5) * (0.6 + b * 0.8);
    f.h0 = sr(2.2, 4.4) * (0.45 + b) * (s.roofBurn || roofGone ? 1 : 0.6);
    f.soot = 0.8;
    f.k = 1.2;
  } else {
    // горит сама деталь: язык с верхней кромки, вынесен наружу по нормали
    const p = walls[Math.random() * walls.length | 0], bx = p?.box;
    if (!bx) return false;
    let x = sr(bx.min.x, bx.max.x), z = sr(bx.min.z, bx.max.z);
    const top = p.kind === "roof" || Math.random() < 0.7;
    const y = top ? lerp(bx.min.y, bx.max.y, sr(0.55, 0.95)) : sr(bx.min.y, lerp(bx.min.y, bx.max.y, 0.6));
    if (p.dims) {
      const nx = Math.sin(p.dims.rot), nz = Math.cos(p.dims.rot), sg = (x - s.center.x) * nx + (z - s.center.z) * nz > 0 ? 1 : -1;
      x += nx * sg * sr(0.12, 0.3);
      z += nz * sg * sr(0.12, 0.3);
      f.lx = nx * sg * 0.15;
      f.lz = nz * sg * 0.15;
    }
    f.p = p;
    f.x = x;
    f.y = y - 0.15;
    f.z = z;
    f.w = sr(0.6, 1.3) * (0.55 + b * 0.7);
    f.h0 = f.w * sr(1.6, 2.6);
    f.soot = 0.5;
    f.k = 1;
  }
  f.h = f.h0;
  return true;
}
function structFlames(s, alive, dt) {
  const wet = 1 - WEATHER.rain * 0.55;
  const area = Math.min(1.8, (s.w ?? 3) * (s.d ?? 3) / 18 + 0.35);
  const want = alive.length ? Math.min(Q.fx >= 1 ? 20 : 14, Math.round((1 + s.burn * 13) * area * (0.6 + 0.4 * Math.min(1, Q.fx)))) : 0;
  s.fl ??= [];
  while (s.fl.length < want) s.fl.push(Object.assign(flameAdd({ x: 0, y: -999, z: 0, w: 1, h: 1, i: 0 }), { age: 9, life: 0, k: 1 }));
  while (s.fl.length > want) s.fl.pop().dead = true;
  for (const f of s.fl) {
    f.age += dt;
    if (f.age >= f.life || f.p?.dead) {
      f.age = 0;
      if (!placeStructFlame(s, alive, f)) {
        f.i = 0;
        f.y = -999;
        f.life = 0.4;
        continue;
      }
      f.seed = Math.random();
      f.life = sr(1.6, 4.2);
    }
    const u = f.age / Math.max(0.01, f.life);
    // разгорается за доли секунды, гаснет плавно; «дышит» вместе с тягой
    const puls = 0.85 + 0.15 * Math.sin(FRAME.t * (5 + f.seed * 4) + f.seed * 20);
    f.i = (f.k ?? 1) * Math.min(1, 0.35 + s.burn) * wet * Math.min(1, u * 4) * Math.min(1, (1 - u) * 2.5) * puls;
    f.h = f.h0 * (0.82 + 0.22 * puls);
  }
}
function structFlamesOff(s) {
  if (s.fl) for (const f of s.fl) f.dead = true;
  s.fl = null;
}
var THIN_BURN = /* @__PURE__ */ new Set(["stand", "bridge", "lamppost", "porch", "roofnest", "shed", "fence", "bench"]);
function burnThreshold(s, p) {
  if (p.pole) return sr(12, 26);
  if (p.kind === "roof") return sr(14, 28);
  if (p.kind === "prop" || p.kind === "trim") return sr(8, 18);
  if (p.kind === "wall") return s.kind === "house" ? (s.log ? sr(55, 95) : sr(38, 70)) * (p.y0 > 0.4 ? 0.8 : 1.15) : sr(18, 34);
  return sr(16, 32);
}
function burnThrough(s, p) {
  if (p.dead) return;
  p.fireKill = true;
  if (p.kind === "wall" && p.dims && s.kind === "house" && (!p.sup || p.sup.list.every((q) => q.dead)) && HINGES.length < 10) {
    const D = p.dims, nx = Math.sin(D.rot), nz = Math.cos(D.rot);
    const out = (D.x - s.x) * nx + (D.z - s.z) * nz > 0 ? 1 : -1, sg = Math.random() < 0.55 ? out : -out;
    const above = s.panels.filter((q) => !q.dead && q.sup?.list?.length === 1 && q.sup.list[0] === p);
    const H = hingeStart({ s: null, panels: [p, ...above], pivot: new THREE27.Vector3(D.x - nx * sg * D.sz * 0.5, D.y - D.sy / 2, D.z - nz * sg * D.sz * 0.5), dir: new THREE27.Vector3(nx * sg, 0, nz * sg), mode: "fall", th: 0.03, burning: true, len: D.sy + above.reduce((a, q) => a + (q.dims?.sy ?? 0), 0), kind: "wall", maxTh: 1.62 });
    H.onBreak = () => {
      s.supDirty = true;
    };
    hingeFall(H);
    removeGone(p);
    for (const q of above) removeGone(q);
    s.supDirty = true;
    supportPass(s);
    return;
  }
  kill(p, _v4.copy(p.center).add(new THREE27.Vector3(sr(-1, 1), 3, sr(-1, 1))), 0.6, 0);
  QUEUE[QUEUE.length - 1].fire = true;
  // рухнувшая кровля выбрасывает сноп искр и пламени
  if (p.kind === "roof" && s.kind === "house") {
    const c = p.center;
    for (let k = 0; k < 40; k++) FX.add.spawn({ x: c.x + sr(-1.5, 1.5), y: c.y, z: c.z + sr(-1.5, 1.5), vx: sr(-2, 2), vy: sr(4, 10), vz: sr(-2, 2), size: sr(0.03, 0.07), life: sr(1.2, 3), col: [3, 1.35, 0.4], a: 1, grav: 1.5, windK: 1.2, drag: 0.5 });
    s.burn = Math.min(1, s.burn + 0.15);
    woodCrack(camera.position.distanceTo(c), panOf(c), 1.6);
  }
}
function removeGone(p) {
  p.dead = true;
  if (onGone) onGone(p);
  for (const c of p.cols) {
    c.dead = true;
    removeStaticCollider(c);
  }
}
function forFootprint(p, fn) {
  const b = p.box;
  for (let x = Math.floor(b.min.x); x <= Math.ceil(b.max.x); x++) for (let z = Math.floor(b.min.z); z <= Math.ceil(b.max.z); z++) fn(x + 0.5, z + 0.5);
}
function grassToStruct() {
  for (const s of STRUCTS) {
    if (!s.center || s.burn > 0 || s.fuel <= 0.05 || s.kind === "bench" && Math.random() < 0.5) continue;
    const r = Math.max(s.w ?? 1, s.d ?? 1) / 2 + 0.8;
    for (let k = 0; k < 4; k++) {
      const a = Math.random() * TAU;
      if (heatAt(s.center.x + Math.cos(a) * r, s.center.z + Math.sin(a) * r) > 0.5 && Math.random() < 0.15 * (1 - WEATHER.wet)) {
        igniteStruct(s, 0.15);
        break;
      }
    }
  }
}
var PILE = null;
function charPile(s) {
  if (!PILE) {
    const mat = new THREE27.MeshStandardMaterial({ color: 1511951, roughness: 1, metalness: 0 });
    injectStructFX(mat);
    PILE = new THREE27.InstancedMesh(new THREE27.BoxGeometry(1, 1, 1), mat, 400);
    PILE.count = 0;
    PILE.castShadow = true;
    PILE.receiveShadow = true;
    PILE.frustumCulled = false;
    scene.add(PILE);
  }
  const n2 = Math.round(6 + (s.w ?? 3) * (s.d ?? 3) * 0.35), c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0);
  const m = new THREE27.Matrix4(), q = new THREE27.Quaternion(), e = new THREE27.Euler(), p = new THREE27.Vector3(), sc = new THREE27.Vector3();
  for (let k = 0; k < n2 && PILE.count < 400; k++) {
    const lx = sr(-0.42, 0.42) * (s.w ?? 3), lz = sr(-0.42, 0.42) * (s.d ?? 3), L = sr(0.8, 2.6), log = s.log || Math.random() < 0.3;
    const x = s.x + lx * c + lz * sn, z = s.z - lx * sn + lz * c;
    e.set(sr(-0.25, 0.25), Math.random() * TAU, sr(-0.35, 0.35) * (k % 3 === 0 ? 1.6 : 1));
    sc.set(L, log ? 0.2 : 0.06, log ? 0.2 : sr(0.12, 0.2));
    p.set(x, (s.fy ?? hFast(x, z)) + sc.y / 2 + Math.random() * 0.12, z);
    PILE.setMatrixAt(PILE.count++, m.compose(p, q.setFromEuler(e), sc));
  }
  PILE.instanceMatrix.needsUpdate = true;
}
var SMOLDER = [];
function updateSmolder(dt, step) {
  const cp = camera.position;
  for (let i = SMOLDER.length - 1; i >= 0; i--) {
    const s = SMOLDER[i];
    s.smolder -= dt * (1 + WEATHER.rain * 6);
    if (s.smolder <= 0 || s.burn > 0) {
      SMOLDER.splice(i, 1);
      continue;
    }
    const k = s.smolder / s.smolder0;
    if (step) {
      for (const p of s.panels) if (p.box && p.burnable && Math.random() < 0.25) forFootprint(p, (x, z) => charCell(x, z, 0, k * sr(0.15, 0.5)));
      markCharDirty();
    }
    if ((s.x - cp.x) ** 2 + (s.z - cp.z) ** 2 > 140 * 140) continue;
    const w2 = (s.w ?? 3) * 0.45, d2 = (s.d ?? 3) * 0.45, c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0);
    const at = () => {
      const lx = sr(-w2, w2), lz = sr(-d2, d2);
      return [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c];
    };
    if (Math.random() < dt * 5 * k) {
      const [x, z] = at();
      FX.alpha.spawn({ x, y: s.fy + 0.2, z, vx: 0, vy: sr(0.5, 1.1), vz: 0, size: sr(0.4, 0.9), grow: 0.9, life: sr(4, 8), col: [0.3, 0.29, 0.28], a: 0.22 * (0.4 + k), fadeIn: 0.8, windK: 1.6, drag: 0.3, glow: 0.12 * k });
    }
    if (Math.random() < dt * 2.5 * k) {
      const [x, z] = at();
      FX.add.spawn({ x, y: s.fy + 0.1, z, vx: sr(-0.4, 0.4), vy: sr(1, 2.5), vz: sr(-0.4, 0.4), size: 0.05, life: sr(0.8, 1.6), col: [2.6, 1.1, 0.35], a: 1, grav: 1, windK: 0.9, drag: 0.4 });
    }
    if (k > 0.65 && Math.random() < dt * 3 * (k - 0.5)) {
      const [x, z] = at();
      FX.add.spawn({ flame: true, x, y: s.fy + 0.05, z, vx: 0, vy: sr(0.4, 0.9), vz: 0, size: sr(0.25, 0.5), grow: -0.2, life: sr(0.4, 0.8), col: [1.7, 0.75, 0.28], a: 0.8, cool: 0.4, windK: 0.5 });
    }
    FIRE.structs.push({ x: s.center.x, z: s.center.z, y: s.fy + 0.4, p: k * 1.5 });
  }
}
var gT = 0;
var sT = 0;
function updateStructs(dt) {
  processQueue();
  updateToppled(dt);
  updateHinges(dt);
  updateLdeb(dt);
  updateBurning(dt);
  sT += dt;
  // страховка: повторная проверка опор у построек с разрушениями (раз в 0.5 с)
  if (sT > 0.5) for (const s of STRUCTS) if (s.supDirty && !QUEUE.some((e) => e.p.s === s)) supportPass(s);
  updateSmolder(dt, sT > 0.5);
  if (sT > 0.5) sT = 0;
  gT += dt;
  if (gT > 1) {
    gT = 0;
    if (FIRE.cells > 0) grassToStruct();
  }
}
var structAt = (x, z, r = 2) => STRUCTS.filter((s) => s.center && Math.hypot(s.center.x - x, s.center.z - z) < s.radius + r);
var LDEB = { list: [], max: 420 };
var _lq = new THREE27.Quaternion();
var _lq2 = new THREE27.Quaternion();
var _lv = new THREE27.Vector3();
var _lu = new THREE27.Vector3();
var _lax = [new THREE27.Vector3(), new THREE27.Vector3(), new THREE27.Vector3()];
var _lup = new THREE27.Vector3(0, 1, 0);
function ldebAdd(mesh, o) {
  if (LDEB.list.length >= LDEB.max) ldebKill(LDEB.list[0], 0);
  if (!mesh.parent) scene.add(mesh);
  mesh.castShadow = o.cast ?? true;
  mesh.receiveShadow = true;
  const d = { mesh, v: o.vel ? o.vel.clone() : new THREE27.Vector3(), w: o.ang ? o.ang.clone() : new THREE27.Vector3(), he: o.he || [0.05, 0.05, 0.05], floor: o.floor || null, onHit: o.onHit || null, life: o.life ?? sr(35, 60), age: 0, rest: 0, bounce: o.bounce ?? 0.28, dispose: o.dispose ?? true, sleep: false, sc: mesh.scale.clone() };
  LDEB.list.push(d);
  return d;
}
function ldebKill(d, i = LDEB.list.indexOf(d)) {
  if (i >= 0) LDEB.list.splice(i, 1);
  d.mesh.parent?.remove(d.mesh);
  if (d.dispose) d.mesh.geometry?.dispose();
}
function ldebFloor(d) {
  const p = d.mesh.position;
  return d.floor ? d.floor(p.x, p.z, p.y) : hFast(p.x, p.z);
}
function updateLdeb(dt) {
  const L = LDEB.list;
  for (let i = L.length - 1; i >= 0; i--) {
    const d = L[i], m = d.mesh, p = m.position;
    d.age += dt;
    if (d.age > d.life) {
      // исчезает, «врастая» в землю, а не пропадая разом
      const k = 1 - (d.age - d.life) / 1.5;
      if (k <= 0) {
        ldebKill(d, i);
        continue;
      }
      p.y -= dt * 0.05;
      m.scale.copy(d.sc).multiplyScalar(Math.max(0.01, k));
      continue;
    }
    if (d.sleep) continue;
    d.v.y -= 9.8 * dt;
    p.addScaledVector(d.v, dt);
    const wl = d.w.length();
    if (wl > 1e-4) {
      _lq.setFromAxisAngle(_lv.copy(d.w).divideScalar(wl), wl * dt);
      m.quaternion.premultiply(_lq);
    }
    // опорная функция бокса: насколько низ куска ниже центра при текущем повороте
    _lax[0].set(1, 0, 0).applyQuaternion(m.quaternion);
    _lax[1].set(0, 1, 0).applyQuaternion(m.quaternion);
    _lax[2].set(0, 0, 1).applyQuaternion(m.quaternion);
    const s = m.scale.x / (d.sc.x || 1);
    const r = (Math.abs(_lax[0].y) * d.he[0] + Math.abs(_lax[1].y) * d.he[1] + Math.abs(_lax[2].y) * d.he[2]) * s;
    const fl = ldebFloor(d);
    if (p.y - r < fl) {
      p.y = fl + r;
      const sp = -d.v.y;
      if (sp > 0) {
        if (d.onHit && sp > 1.2) d.onHit(d, sp);
        if (!d.mesh.parent) {
          ldebKill(d, L.indexOf(d));
          continue;
        }
        d.v.y = sp > 0.9 ? sp * d.bounce : 0;
        d.v.x *= 0.62;
        d.v.z *= 0.62;
        d.w.multiplyScalar(0.55);
      }
      // трение скольжения и укладка на самую плоскую грань
      const fr = Math.exp(-dt * 6);
      d.v.x *= fr;
      d.v.z *= fr;
      let best = 0, bv = 0;
      for (let k = 0; k < 3; k++) if (Math.abs(_lax[k].y) > bv) {
        bv = Math.abs(_lax[k].y);
        best = k;
      }
      _lu.copy(_lax[best]).multiplyScalar(Math.sign(_lax[best].y) || 1);
      _lq.setFromUnitVectors(_lu, _lup);
      m.quaternion.premultiply(_lq2.identity().slerp(_lq, Math.min(1, dt * 7)));
      d.w.multiplyScalar(Math.exp(-dt * 5));
      if (d.v.lengthSq() < 0.02 && d.w.lengthSq() < 0.05 && bv > 0.995) {
        d.rest += dt;
        if (d.rest > 0.4) {
          d.sleep = true;
          d.v.set(0, 0, 0);
          d.w.set(0, 0, 0);
        }
      } else d.rest = 0;
    }
  }
}
var HINGES = [];
var _hq = new THREE27.Quaternion();
var _hq2 = new THREE27.Quaternion();
var _hv = new THREE27.Vector3();
var _hw = new THREE27.Vector3();
var _hy = new THREE27.Vector3(0, 1, 0);
function hingeStart(o) {
  const pivot = o.pivot.clone(), group = new THREE27.Group();
  group.position.copy(pivot);
  const list = [];
  for (const p of o.panels) {
    if (p.hinged) continue;
    p.hinged = true;
    for (const q of p.parts) list.push({ geo: q.geo, mat: q.mat });
    collapsePanel(p);
    if (p.mesh) p.mesh.parent?.remove(p.mesh);
  }
  for (const e of o.extra || []) list.push(e);
  const H = { s: o.s, panels: o.panels.slice(), group, pivot, parts: [], bb: new THREE27.Box3(), dir: o.dir.clone().setY(0).normalize(), th: o.th ?? 0, w: o.w ?? 0, mode: o.mode, lean: o.lean ?? 0, age: 0, vy: 0, tw: o.tw ?? 0, twist: 0, burning: !!o.burning, onSettle: o.onSettle || null, onBreak: o.onBreak || null, maxTh: o.maxTh ?? 1.72, kind: o.kind || "tower", creakT: 0 };
  H.axis = new THREE27.Vector3(H.dir.z, 0, -H.dir.x);
  hingeAdd(H, list);
  scene.add(group);
  // корпус падает как стержень, закреплённый нижним концом
  H.L = Math.max(1, o.len ?? H.bb.max.y);
  H.G = 1.5 * 9.8 / H.L;
  HINGES.push(H);
  if (o.s) o.s.hinge = H;
  return H;
}
function hingeAdd(H, list) {
  if (!list.length) return;
  H.group.updateMatrixWorld(true);
  const inv = H.group.matrixWorld.clone().invert();
  const byMat = /* @__PURE__ */ new Map();
  for (const it of list) {
    let g = it.geo.clone().applyMatrix4(inv);
    g = normalize(g, it.mat);
    g.computeBoundingBox();
    H.bb.union(g.boundingBox);
    H.parts.push({ geo: g, mat: it.mat });
    if (!byMat.has(it.mat)) byMat.set(it.mat, []);
    byMat.get(it.mat).push(g);
  }
  for (const [mat, geos] of byMat) {
    const merged = geos.length > 1 ? BGU2.mergeGeometries(geos, false) : geos[0].clone();
    for (const g of merged ? [merged] : geos.map((q) => q.clone())) {
      const m = new THREE27.Mesh(g, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.hingeMerged = true;
      H.group.add(m);
    }
  }
  // точки для проверки касания земли — дальние от оси углы габарита
  const b = H.bb, pts = [];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new THREE27.Vector3(x, y, z));
  const far = Math.max(...pts.map((q) => q.length()));
  H.corners = pts.filter((q) => q.length() > far * 0.55);
  H.far = far;
}
function hingeFall(H, o = {}) {
  if (o.dir && H.mode === "lean" && H.th < 0.02) {
    H.dir.copy(o.dir).setY(0).normalize();
    H.axis.set(H.dir.z, 0, -H.dir.x);
  }
  H.mode = o.mode ?? "fall";
  H.w = Math.max(H.w, o.w ?? 0);
  if (H.mode === "drop") {
    H.tw = sr(-0.6, 0.6);
    H.w = sr(0.15, 0.35);
  }
  for (const p of H.panels) {
    if (!p.dead) {
      p.dead = true;
      for (const c of p.cols) {
        c.dead = true;
        removeStaticCollider(c);
      }
    }
    for (const pane of PANES) if (pane.panel === p && pane.alive) breakPane(pane, H.dir.clone().setY(0.3), 3);
  }
  const d = camera.position.distanceTo(H.pivot);
  woodCrack(d, 0, H.kind === "wall" ? 1.2 : 2);
  if (H.kind !== "wall") creakSound(d, false);
}
function updateHinges(dt) {
  for (let i = HINGES.length - 1; i >= 0; i--) {
    const H = HINGES[i];
    H.age += dt;
    if (H.mode === "lean") {
      // пружинит к углу крена с затуханием; пока качается — скрипит
      H.w += ((H.lean - H.th) * 26 - H.w * 5) * dt;
      H.th += H.w * dt;
      H.creakT -= dt;
      if (Math.abs(H.w) > 0.015 && H.creakT <= 0) {
        creakSound(camera.position.distanceTo(H.pivot), Math.random() < 0.5);
        H.creakT = sr(0.5, 1.3);
      }
    } else if (H.mode === "fall") {
      H.w += H.G * Math.sin(Math.max(0.015, H.th)) * dt;
      H.th += H.w * dt;
    } else if (H.mode === "drop") {
      H.vy -= 9.8 * dt;
      H.group.position.y += H.vy * dt;
      H.th += H.w * dt;
      H.twist += H.tw * dt;
    } else if (H.mode === "swing") {
      // балка на одном конце: момент тяжести ∝ cosθ, затухание — трение в изломе
      H.w += (H.G * Math.cos(H.th) - H.w * 0.6) * dt;
      H.th += H.w * dt;
    }
    _hq.setFromAxisAngle(H.axis, H.th);
    if (H.twist) _hq.multiply(_hq2.setFromAxisAngle(_hy, H.twist));
    H.group.quaternion.copy(_hq);
    H.group.updateMatrixWorld(true);
    if (H.burning && H.mode !== "lean" && Math.random() < dt * 14) {
      const c = H.corners[Math.random() * H.corners.length | 0];
      _hv.copy(c).multiplyScalar(sr(0.3, 1)).applyMatrix4(H.group.matrixWorld);
      FX.add.spawn({ flame: true, x: _hv.x, y: _hv.y, z: _hv.z, vx: 0, vy: sr(1, 2), vz: 0, size: sr(0.6, 1.2), grow: -0.4, life: sr(0.4, 0.8), col: [1.8, 0.8, 0.28], a: 0.9, cool: 0.4, windK: 1 });
      if (Math.random() < 0.4) FX.alpha.spawn({ x: _hv.x, y: _hv.y + 0.5, z: _hv.z, vx: 0, vy: sr(1, 2), vz: 0, size: sr(0.8, 1.4), grow: 1.4, life: sr(4, 7), col: [0.08, 0.075, 0.07], col2: [0.3, 0.29, 0.28], a: 0.5, glow: 0.4, windK: 2, drag: 0.3 });
    }
    if (H.mode === "lean") continue;
    let hit = H.th >= H.maxTh || H.age > 14;
    if (!hit && (H.th > 0.2 || H.mode === "drop" || H.mode === "swing")) {
      for (const c of H.corners) {
        _hv.copy(c).applyMatrix4(H.group.matrixWorld);
        const g = Math.max(hFast(_hv.x, _hv.z), H.water ?? -1e9);
        if (_hv.y < g + 0.04) {
          hit = true;
          break;
        }
      }
    }
    if (!hit) continue;
    if (H.mode === "swing") {
      // провисший пролёт остаётся висеть концом в воде
      H.mode = "hang";
      HINGES.splice(i, 1);
      if (H.onSettle) H.onSettle(H);
      continue;
    }
    HINGES.splice(i, 1);
    hingeBreak(H);
  }
}
function hingeBreak(H) {
  const M1 = H.group.matrixWorld.clone(), q = H.group.quaternion.clone(), piv = H.group.position.clone();
  // чужие объекты в группе (прожектор с вышки) падают дальше сами по себе
  for (const ch of H.group.children.slice()) {
    if (ch.userData.hingeMerged) continue;
    scene.attach(ch);
    ldebAdd(ch, { he: [0.25, 0.25, 0.25], vel: new THREE27.Vector3(sr(-1, 1), 1.5, sr(-1, 1)), ang: new THREE27.Vector3(sr(-3, 3), sr(-3, 3), sr(-3, 3)), dispose: false, life: 90 });
  }
  scene.remove(H.group);
  H.group.traverse((o) => {
    if (o.userData.hingeMerged) o.geometry.dispose();
  });
  _hw.copy(H.axis).multiplyScalar(H.w);
  const items = H.parts.map((it) => {
    const sz = it.geo.boundingBox.getSize(new THREE27.Vector3());
    return { ...it, sz, vol: Math.max(sz.x, 0.03) * Math.max(sz.y, 0.03) * Math.max(sz.z, 0.03) };
  }).sort((a, c) => c.vol - a.vol);
  const nBody = Math.min(items.length, Math.round(6 + Q.bodies / 6));
  const burning = H.burning || (H.s?.burn ?? 0) > 0.2;
  const tip = new THREE27.Vector3();
  let tipD = -1;
  items.forEach((it, idx) => {
    const c = it.geo.boundingBox.getCenter(new THREE27.Vector3());
    const g = it.geo.clone().translate(-c.x, -c.y, -c.z);
    const pos = c.clone().applyMatrix4(M1);
    const r = pos.clone().sub(piv), dd = r.length();
    if (dd > tipD) {
      tipD = dd;
      tip.copy(pos);
    }
    const vel = new THREE27.Vector3().crossVectors(_hw, r).multiplyScalar(0.55).add(new THREE27.Vector3(sr(-1.2, 1.2), sr(0.4, 2.2) + H.vy * 0.4, sr(-1.2, 1.2)));
    const ang = new THREE27.Vector3(sr(-4, 4), sr(-4, 4), sr(-4, 4));
    const mesh = new THREE27.Mesh(g, it.mat);
    mesh.position.copy(pos);
    mesh.quaternion.copy(q);
    const size = [Math.max(0.04, it.sz.x), Math.max(0.04, it.sz.y), Math.max(0.04, it.sz.z)];
    if (idx < nBody && Math.max(...size) > 0.25 && PHYS.ready) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      const bb = addBody({
        shape: "box", size, pos, quat: q, mass: clamp(size[0] * size[1] * size[2] * 600, 2, 250), vel, ang,
        life: sr(45, 80), friction: 0.85, restitution: 0.1, damp: [0.1, 0.3], float: 1.6, rad: Math.min(...size) / 2, ccd: 0.06,
        onDone: () => { scene.remove(mesh); g.dispose(); },
        sync: (pp, rr, f) => { mesh.position.copy(pp); mesh.quaternion.copy(rr); if (f < 1) mesh.scale.setScalar(Math.max(0.01, f)); }
      });
      if (!bb) {
        scene.remove(mesh);
        ldebAdd(mesh, { he: size.map((v) => v / 2), vel, ang });
      } else if (burning && Math.random() < 0.45) attachFire(bb, sr(6, 14));
    } else ldebAdd(mesh, { he: size.map((v) => v / 2), vel, ang, cast: Math.max(...size) > 0.3 });
  });
  const dist = camera.position.distanceTo(tip);
  BLAST.shake = Math.max(BLAST.shake, (H.kind === "wall" ? 0.25 : 0.6) / (1 + dist / 30));
  woodCrack(dist, panOf(tip), H.kind === "wall" ? 1.4 : 2.4);
  boom(dist, H.kind === "wall" ? 0.25 : 0.55, panOf(tip), 0.6);
  // пыль и пепел вдоль всей упавшей длины; у горящих — сноп искр и разлёт головней
  const nD = H.kind === "wall" ? 14 : 34;
  for (let k = 0; k < nD; k++) {
    _hv.lerpVectors(piv, tip, Math.random());
    const gy = hFast(_hv.x, _hv.z);
    FX.alpha.spawn({ x: _hv.x + sr(-0.8, 0.8), y: gy + 0.3, z: _hv.z + sr(-0.8, 0.8), vx: sr(-2, 2), vy: sr(0.3, 1.4), vz: sr(-2, 2), size: sr(0.8, 2), grow: 1.5, life: sr(3, 6), col: burning ? [0.14, 0.13, 0.12] : [0.46, 0.42, 0.36], a: 0.45, drag: 1.3, windK: 0.8 });
  }
  if (burning) {
    for (let k = 0; k < 70; k++) {
      _hv.lerpVectors(piv, tip, Math.random());
      FX.add.spawn({ x: _hv.x, y: hFast(_hv.x, _hv.z) + 0.3, z: _hv.z, vx: sr(-3, 3), vy: sr(3, 9), vz: sr(-3, 3), size: sr(0.03, 0.07), life: sr(1, 2.8), col: [3, 1.4, 0.4], a: 1, grav: 2, windK: 1, drag: 0.5 });
    }
    for (let k = 0; k < 3; k++) {
      _hv.lerpVectors(piv, tip, Math.random());
      ignite(_hv.x, _hv.z, 1, 0.9);
    }
  }
  // деревья на линии падения ломаются, стрелка под вышкой — насмерть
  if (H.kind !== "wall") {
    for (const t of treesNear(tip.x, tip.z, 2.2)) if (t.r < 0.35) breakTree(t, H.dir.clone(), 1);
  }
  if (PL.mode === "walk" && PL.dead <= 0) {
    _hv.subVectors(tip, piv).setY(0);
    const L = _hv.length(), px = PL.pos.x - piv.x, pz = PL.pos.z - piv.z;
    const u = clamp((px * _hv.x + pz * _hv.z) / (L * L || 1), 0, 1), ex = px - _hv.x * u, ez = pz - _hv.z * u;
    if (Math.hypot(ex, ez) < (H.kind === "wall" ? 0.7 : 1.3) && u > 0.25 && PL.pos.y < tip.y + 2.5) die(H.kind === "wall" ? "ПРИДАВИЛО СТЕНОЙ" : "РАЗДАВЛЕН РУХНУВШЕЙ ВЫШКОЙ", "crush");
  }
  if (H.onBreak) H.onBreak(H, tip);
}
function leanDir(s, supports) {
  const d = new THREE27.Vector3();
  let n2 = 0;
  for (const q of supports) if (q.dead) {
    const c = q.pole ? q.pole.a : q.center;
    d.x += c.x - s.x;
    d.z += c.z - s.z;
    n2++;
  }
  if (!n2) return null;
  d.divideScalar(n2);
  return d.length() < 0.25 * (s.w ?? 2) / 2 ? null : d.normalize();
}
function hingePivot(s, dir, half) {
  return new THREE27.Vector3(s.x + dir.x * half, s.fy, s.z + dir.z * half);
}
function towerSupport(top, supports, lost) {
  const s = top.s, dead = supports.filter((q) => q.dead).length;
  if (!dead || top.dead) return;
  const others = s.panels.filter((p) => !p.dead && p !== top && !supports.includes(p));
  const alive = supports.filter((q) => !q.dead);
  const half = (top.hingeHalf ?? (s.w ?? 2) / 2);
  const burning = s.burn > 0.2;
  let dir = leanDir(s, supports);
  if (s.blastT !== void 0 && FRAME.t - s.blastT < 1.5) dir = s.blastDir;
  else if (!dir && supports.length === 1) dir = new THREE27.Vector3(sr(-1, 1), 0, sr(-1, 1)).normalize();
  if (!s.hinge) {
    const d0 = dir || new THREE27.Vector3(sr(-1, 1), 0, sr(-1, 1)).normalize();
    const lean = lost ? 0 : clamp(0.045 + 0.07 * dead / supports.length, 0.03, 0.12) * (top.leanK ?? 1);
    const pv = hingePivot(s, d0, half);
    if (top.pivotAtBreak && s.breakY !== void 0) pv.y = s.breakY;
    hingeStart({ s, panels: [top, ...others, ...alive], extra: s.hingeExtra || [], pivot: pv, dir: d0, mode: "lean", lean, th: 0, burning, len: top.hingeLen, kind: "tower" });
    s.hingeExtra = [];
  } else if (s.hingeExtra?.length) {
    hingeAdd(s.hinge, s.hingeExtra);
    s.hingeExtra = [];
  }
  const H = s.hinge;
  H.burning ||= burning;
  if (!lost) {
    // ещё стоит: с каждой выбитой опорой крен сильнее
    H.lean = Math.max(H.lean, clamp(0.045 + 0.07 * dead / supports.length, 0.03, 0.14) * (top.leanK ?? 1));
    return;
  }
  top.dead = true;
  for (const m of s.carry || []) H.group.attach(m);
  // провода рвутся: хлопок, искры с конца
  for (const t of s.post?.wires || []) if (t.parent) {
    t.parent.remove(t);
    const d = camera.position.distanceTo(H.pivot);
    wireSnap(d);
    sparkSound(d, 1);
    const hy = s.fy + (s.h ?? 4);
    for (let k = 0; k < 24; k++) FX.add.spawn({ x: s.x, y: hy, z: s.z, vx: sr(-3, 3), vy: sr(-1, 3), vz: sr(-3, 3), size: 0.03, life: sr(0.3, 0.9), col: [2.6, 2.4, 1.8], a: 1, grav: 9.8 });
  }
  // прожектор в будке падает вместе с ней
  for (const sl of SL) if (sl.panel === top && sl.group && !sl.falling) {
    sl.falling = true;
    sl.on = false;
    if (SLOP.cur === sl) releaseSearchlight();
    if (sl.beam) sl.beam.visible = false;
    if (sl.glare) sl.glare.visible = false;
    H.group.attach(sl.group);
  }
  if (!dir && H.th < 0.05) hingeFall(H, { mode: "drop" });
  else hingeFall(H, { dir: dir || H.dir, w: s.blastW || 0 });
  s.blastW = 0;
  for (const q of alive) q.dead = true;
  if (top.onKill) top.onKill(top);
}
var V5 = (x, y, z) => new THREE28.Vector3(x, y, z);
var DOORS = [];
function addDoor({ hx: hx2, hz, y, closed, openBy, w = 0.9, h = 2, t = 0.05, mat = M.planksDark, startOpen = true }) {
  const g = new THREE28.BoxGeometry(w, h, t);
  g.translate(w / 2, h / 2, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * h / 1.2, uv.getX(i) * w / 1.2);
  const pivot = new THREE28.Group();
  pivot.position.set(hx2, y, hz);
  const mesh = new THREE28.Mesh(g, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  pivot.add(mesh);
  scene.add(pivot);
  const cur = startOpen ? openBy : 0;
  pivot.rotation.y = closed + cur;
  const col = (a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return addBox(hx2 + c * w / 2, y + h / 2, hz - s * w / 2, w, h, 0.08, a, { walk: false });
  };
  const cClosed = col(closed), cOpen = col(closed + openBy);
  (startOpen ? cClosed : cOpen).dead = true;
  const d = { pivot, mesh, closed, openBy, cur, target: cur, w, h, hx: hx2, hz, y, cClosed, cOpen, panel: curPanel() };
  pivot.updateMatrixWorld(true);
  attachMesh(mesh);
  DOORS.push(d);
  return d;
}
var GENS = [];
function addGenerator(o) {
  const g = { ...o, alive: true, fire: 0 };
  GENS.push(g);
  if (o.panel) o.panel.onKill = () => powerOut(g);
  return g;
}
function powerOut(g) {
  if (!g.alive) return;
  g.alive = false;
  g.fire = 45;
  sparkSound(camera.position.distanceTo(V5(g.x, g.y, g.z)), 1.5);
  const lamps = LAMPS.filter((L) => L.on && L.kind !== "fire" && L.kind !== "window" && Math.hypot(L.pos.x - g.cx, L.pos.z - g.cz) < g.r);
  lamps.forEach((L, i) => {
    L.flick = 1;
    setTimeout(() => {
      L.on = false;
      for (let k = 0; k < 8; k++) FX.add.spawn({ x: L.pos.x, y: L.pos.y, z: L.pos.z, vx: sr(-1.5, 1.5), vy: sr(-0.5, 2), vz: sr(-1.5, 1.5), size: 0.03, life: sr(0.4, 1.1), col: [2.4, 2, 1.2], a: 1, grav: 9.8, must: true });
    }, 250 + i * 180 + Math.random() * 300);
  });
  g.dark = lamps;
}
function holeGeo(cell, size) {
  const g = new THREE28.PlaneGeometry(size, size), uv = g.attributes.uv, u0 = cell % 2 * 0.5, v0 = 0.5 - (cell >> 1) * 0.5;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
  return g;
}
function holeCluster(x, y, z, rot, n2, spread, kind, R2) {
  const g = holeGeo(kind, 0.12);
  for (let i = 0; i < n2; i++) {
    const a = R2() * TAU, r = Math.sqrt(R2()) * spread;
    place(M.holes, g, x + Math.cos(rot) * Math.cos(a) * r, y + Math.sin(a) * r * 0.7, z - Math.sin(rot) * Math.cos(a) * r, [0, rot, R2() * TAU], R2.range(0.7, 1.3));
  }
}
var THREE29 = ctx.THREE;
var WALL_T = 0.2;
var HOUSES = [];
function wallPieces(len, h, openings) {
  const out = [], ops = openings.map((o) => ({ u0: o.at - o.w / 2 + len / 2, u1: o.at + o.w / 2 + len / 2, y0: o.y0, y1: o.y1 })).sort((a, b) => a.u0 - b.u0);
  let u = 0;
  for (const o of ops) {
    if (o.u0 > u + 0.01) out.push([u, o.u0, 0, h]);
    if (o.y0 > 0.01) out.push([o.u0, o.u1, 0, o.y0]);
    if (o.y1 < h - 0.01) out.push([o.u0, o.u1, o.y1, h]);
    u = o.u1;
  }
  if (u < len - 0.01) out.push([u, len, 0, h]);
  return out;
}
function house(o) {
  const R2 = rng(o.seed ?? 1);
  const F = frame(o.x, o.z, o.rot);
  const { w, d } = o, h = o.h ?? 2.5;
  const base2 = o.pad.y ?? terrainH(o.x, o.z);
  const fy = base2 + 0.42;
  const wallMat = o.wallMat ?? (o.style === "log" ? M.logWall : o.style === "paint" ? M.planksPaint : M.planks);
  const trimMat = o.trimMat ?? M.planks;
  const tile = o.style === "log" ? 0.9 : 1.5;
  const P2 = (lx, lz) => F.p(lx, lz);
  const B = (mat, lx, ly, lz, sx, sy, sz, extra = {}) => {
    const [x, z] = P2(lx, lz);
    box(mat, x, ly, z, sx, sy, sz, { rot: o.rot + (extra.r ?? 0), rx: extra.rx, rz: extra.rz, tile: extra.tile ?? tile, collide: extra.collide, walk: extra.walk, vertical: extra.vertical, uvOff: extra.uvOff });
  };
  gexAdd({ x: o.x, z: o.z, hw: w / 2 + 0.06, hd: d / 2 + 0.06, rot: o.rot });
  const S = beginStruct({ kind: "house", name: o.id, x: o.x, z: o.z, rot: o.rot, w, d, h, fy, fuel: o.style === "log" ? 1.4 : o.style === "brick" ? 0.35 : 1, log: o.style === "log" });
  // надпись «badVIno» — примерно на каждом третьем доме, на одной стене
  o.__graf = GRAF.n++ % 3 === 1 ? ["front", "left", "right", "back"][GRAF.n % 4] : null;
  noPanel();
  for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, -d / 2], [0, d / 2]])
    B(M.concrete, lx * 0.96, base2 + 0.12, lz * 0.96, 0.4, 0.62, 0.4, { tile: 0.8 });
  B(M.planksDark, 0, base2 + 0.2, d / 2 - 0.05, w, 0.36, 0.06, { tile: 1.2 });
  B(M.planksDark, 0, base2 + 0.2, -d / 2 + 0.05, w, 0.36, 0.06, { tile: 1.2 });
  for (const sx of [-1, 1]) B(M.planksDark, sx * (w / 2 - 0.05), base2 + 0.2, 0, 0.06, 0.36, d - 0.1, { tile: 1.2 });
  const C2 = o.cellar;
  if (!C2) B(M.planksDark, 0, fy - 0.05, 0, w - 0.1, 0.1, d - 0.1, { tile: 1.2, collide: true });
  else {
    const X0 = -w / 2 + 0.05, X1 = w / 2 - 0.05, Z0 = -d / 2 + 0.05, Z1 = d / 2 - 0.05;
    for (const [a0, a1, b0, b1] of [[X0, X1, C2.hz1, Z1], [X0, X1, Z0, C2.hz0], [X0, C2.hx0, C2.hz0, C2.hz1], [C2.hx1, X1, C2.hz0, C2.hz1]])
      if (a1 - a0 > 0.02 && b1 - b0 > 0.02) B(M.planksDark, (a0 + a1) / 2, fy - 0.05, (b0 + b1) / 2, a1 - a0, 0.1, b1 - b0, { tile: 1.2, collide: true });
    cellarRoom(o, C2, fy, B, R2, F);
  }
  const openings = { front: [], back: [], left: [], right: [] };
  const door = o.door ?? { side: "front", at: 0 };
  openings[door.side].push({ at: door.at, w: 1, y0: 0, y1: 2.05, door: true });
  if (o.door2) openings[o.door2.side].push({ at: o.door2.at, w: 1, y0: 0, y1: 2.05, door: true });
  for (const win of o.windows || []) openings[win.side].push({ at: win.at, w: win.w ?? 1, y0: win.y0 ?? 0.85, y1: win.y1 ?? 1.85, win: true, bars: win.bars });
  const sides = {
    front: { len: w, c: [0, d / 2 - WALL_T / 2], r: 0, axis: [1, 0] },
    back: { len: w, c: [0, -d / 2 + WALL_T / 2], r: 0, axis: [1, 0] },
    left: { len: d - 2 * WALL_T, c: [-w / 2 + WALL_T / 2, 0], r: Math.PI / 2, axis: [0, -1] },
    right: { len: d - 2 * WALL_T, c: [w / 2 - WALL_T / 2, 0], r: Math.PI / 2, axis: [0, -1] }
  };
  const walls = [], bySide = {};
  for (const [name, S22] of Object.entries(sides)) {
    bySide[name] = [];
    const pieces = [];
    for (const [u0, u1, y0, y1] of wallPieces(S22.len, h, openings[name])) {
      const nu = Math.max(1, Math.round((u1 - u0) / 1));
      let ys = [y0, y1];
      if (y1 - y0 > 1.5) {
        let m = (y0 + y1) / 2;
        if (o.style === "log") m = Math.round(m / 0.225) * 0.225;
        ys = [y0, m, y1];
      }
      for (let a = 0; a < nu; a++) {
        const a0 = u0 + (u1 - u0) * a / nu, a1 = u0 + (u1 - u0) * (a + 1) / nu;
        let below = null;
        for (let r = 0; r < ys.length - 1; r++) {
          const pc = [a0, a1, ys[r], ys[r + 1], below];
          pieces.push(pc);
          below = pc;
        }
      }
    }
    for (const pc of pieces) {
      const [u0, u1, y0, y1, below] = pc;
      const uc = (u0 + u1) / 2 - S22.len / 2;
      const lx = S22.c[0] + S22.axis[0] * uc, lz = S22.c[1] + S22.axis[1] * uc;
      const [wx, wz] = P2(lx, lz);
      const pn = panel("wall", {
        hp: o.style === "log" ? 1.7 : o.style === "brick" ? 2.8 : 1,
        load: true,
        // кладка не горит: огонь в кирпичном доме — внутри (мебель, полы, перекрытие, стропила) и рвётся из проёмов
        burnable: !(o.style === "brick" || wallMat === M.hgBrick || wallMat === M.brick),
        mat: wallMat,
        sup: below ? { list: [below.pn], frac: 0.99 } : null,
        dims: { x: wx, y: fy + (y0 + y1) / 2, z: wz, sx: u1 - u0, sy: y1 - y0, sz: WALL_T, rot: o.rot + S22.r, log: o.style === "log" }
      });
      pn.u0 = u0;
      pn.u1 = u1;
      pn.y0 = y0;
      pn.y1 = y1;
      pc.pn = pn;
      // секция стены собрана из отдельных досок (у сруба — брёвен): пули выбивают их по одной
      const [cwx, cwz] = P2(lx, lz);
      addBox(cwx, fy + (y0 + y1) / 2, cwz, u1 - u0, y1 - y0, WALL_T, o.rot + S22.r, { walk: false });
      if (o.style === "log") {
        const rows = Math.max(1, Math.round((y1 - y0) / 0.225)), rh = (y1 - y0) / rows;
        for (let r = 0; r < rows; r++) {
          boardTag();
          B(wallMat, lx, fy + y0 + (r + 0.5) * rh, lz, u1 - u0, rh, WALL_T, { r: S22.r, uvOff: [u0, y0 + r * rh] });
        }
      } else if (o.style === "brick") {
        B(wallMat, lx, fy + (y0 + y1) / 2, lz, u1 - u0, y1 - y0, WALL_T + 0.04, { r: S22.r, tile: 1.2, uvOff: [u0, y0] });
      } else {
        const nb = Math.max(1, Math.round((u1 - u0) / 0.2)), bw = (u1 - u0) / nb;
        for (let k = 0; k < nb; k++) {
          const uk = (k + 0.5) * bw - (u1 - u0) / 2;
          boardTag();
          B(wallMat, lx + S22.axis[0] * uk, fy + (y0 + y1) / 2, lz + S22.axis[1] * uk, bw, y1 - y0, WALL_T, { r: S22.r, uvOff: [u0 + k * bw, y0] });
        }
      }
      boardTag(false);
      graffitiOn(o, name, lx, lz, fy, pc, P2);
      walls.push(pn);
      bySide[name].push(pn);
      if (R2() < (o.camp ? 0.1 : 0.14) && y1 - y0 > 0.8) {
        const nO = name === "front" ? [0, 1] : name === "back" ? [0, -1] : name === "left" ? [-1, 0] : [1, 0];
        const [hx2, hz] = P2(lx + nO[0] * (WALL_T / 2 + 4e-3), lz + nO[1] * (WALL_T / 2 + 4e-3)), [ox, oz] = P2(nO[0], nO[1]);
        holeCluster(hx2, fy + (y0 + y1) / 2 + R2.range(-0.2, 0.3), hz, Math.atan2(ox - o.x, oz - o.z), R2.int(4, 11), Math.min(0.5, (u1 - u0) * 0.4), o.style === "log" || !o.camp ? 0 : 2, R2);
      }
    }
    for (const op of openings[name]) {
      const lx = S22.c[0] + S22.axis[0] * op.at, lz = S22.c[1] + S22.axis[1] * op.at;
      const ax = S22.axis[0], az = S22.axis[1];
      const nOut = name === "front" ? [0, 1] : name === "back" ? [0, -1] : name === "left" ? [-1, 0] : [1, 0];
      // проём — «вентиляция» пожара: отсюда идёт дым, а после вспышки — языки пламени по фасаду
      {
        const [vx, vz] = P2(lx + nOut[0] * WALL_T * 0.5, lz + nOut[1] * WALL_T * 0.5), [ox2, oz2] = P2(lx + nOut[0] * 1.5, lz + nOut[1] * 1.5);
        const nl = Math.hypot(ox2 - vx, oz2 - vz) || 1;
        (S.vents ??= []).push({ x: vx, z: vz, y0: fy + op.y0, y1: fy + op.y1, w: op.w, nx: (ox2 - vx) / nl, nz: (oz2 - vz) / nl, door: !!op.door });
      }
      const fw = op.w, fh = op.y1 - op.y0, cy = fy + (op.y0 + op.y1) / 2;
      const ou0 = op.at - fw / 2 + S22.len / 2, ou1 = op.at + fw / 2 + S22.len / 2;
      const around = bySide[name].filter((q) => q.u1 > ou0 - 0.05 && q.u0 < ou1 + 0.05);
      panel("trim", { hp: 0.5, sup: { list: around, frac: 0.99 }, density: 450 });
      for (const s2 of [-1, 1]) B(trimMat, lx + ax * s2 * (fw / 2 + 0.04) + nOut[0] * 0.11, cy, lz + az * s2 * (fw / 2 + 0.04) + nOut[1] * 0.11, 0.08, fh + 0.1, 0.04, { r: S22.r, tile: 1 });
      B(trimMat, lx + nOut[0] * 0.11, fy + op.y1 + 0.06, lz + nOut[1] * 0.11, fw + 0.2, 0.1, 0.05, { r: S22.r, tile: 1 });
      if (op.win) {
        B(trimMat, lx + nOut[0] * 0.12, fy + op.y0 - 0.03, lz + nOut[1] * 0.12, fw + 0.2, 0.06, 0.12, { r: S22.r, tile: 1 });
        const state2 = R2();
        if (o.style !== "camp" && state2 >= 0.28 && R2() < 0.55) {
          for (const e of [-1, 1]) {
            if (R2() < 0.18) continue;
            const hang = R2() < 0.2;
            const [hx2, hz] = P2(lx + ax * e * (fw / 2 + 0.06) + nOut[0] * 0.14, lz + az * e * (fw / 2 + 0.06) + nOut[1] * 0.14);
            const [ox, oz] = P2(nOut[0], nOut[1]), nx0 = ox - o.x, nz0 = oz - o.z;
            const base3 = o.rot + S22.r, sw = fw / 2, amt = R2.range(0.4, 1.4);
            const endAt = (sg2) => {
              const a = base3 + sg2 * amt;
              return [e * Math.cos(a), -e * Math.sin(a)];
            };
            const [ex1, ez1] = endAt(1), sg = ex1 * nx0 + ez1 * nz0 > 0 ? 1 : -1;
            const ang = base3 + sg * amt, c = Math.cos(ang), s3 = Math.sin(ang);
            box(o.style === "log" ? M.planksPaint : trimMat, hx2 + c * e * sw / 2, cy - (hang ? 0.15 : 0), hz - s3 * e * sw / 2, sw, fh * 0.98, 0.035, { rot: ang, rz: hang ? e * 0.3 : 0, tile: 1, vertical: true });
          }
        }
        if (op.bars) for (let k = 1; k < 5; k++) {
          const [bx2, bz2] = P2(lx + ax * (k / 5 - 0.5) * fw + nOut[0] * 0.15, lz + az * (k / 5 - 0.5) * fw + nOut[1] * 0.15);
          cyl(M.rust, bx2, cy, bz2, 0.012, 0.012, fh, { seg: 4, cast: false });
        }
        if (state2 < 0.28) {
          const [x, z] = P2(lx + nOut[0] * 0.14, lz + nOut[1] * 0.14);
          for (const a of [0.7, -0.6]) box(M.planksDark, x, cy, z, fw * 1.25, 0.12, 0.03, { rot: o.rot + S22.r, rz: a * (R2() < 0.3 ? 0.4 : 1), tile: 1 });
          if (R2() < 0.5) box(M.planksDark, x, cy + 0.25, z, fw * 1.1, 0.12, 0.03, { rot: o.rot + S22.r, rz: 0.08, tile: 1 });
        } else {
          B(trimMat, lx, cy, lz, 0.05, fh, 0.06, { r: S22.r, tile: 1 });
          B(trimMat, lx, cy + 0.15, lz, fw, 0.05, 0.06, { r: S22.r, tile: 1 });
          if (state2 < 0.45) B(M.glass, lx + ax * fw * 0.25, cy - 0.2, lz + az * fw * 0.25, fw * 0.4, 0.5, 0.01, { r: S22.r });
          else {
            const yb = cy + 0.15, yTop = fy + op.y1, yBot = fy + op.y0;
            for (const e of [-1, 1]) for (const [ya, yb2] of [[yBot, yb - 0.025], [yb + 0.025, yTop]]) {
              if (R2() < 0.12) continue;
              const [px, pz] = P2(lx + ax * e * fw * 0.25, lz + az * e * fw * 0.25);
              addPane(px, (ya + yb2) / 2, pz, [0, o.rot + S22.r, 0], fw / 2 - 0.05, yb2 - ya - 0.02);
            }
          }
        }
      }
      if (op.door) {
        const st = R2();
        const [hx2, hz] = P2(lx - ax * fw / 2 + nOut[0] * 0.05, lz - az * fw / 2 + nOut[1] * 0.05);
        panel("door", { hp: 0.4, density: 450 });
        if (st < 0.62) {
          const a = o.rot + S22.r, amt = R2.range(1, 1.7);
          const [ox, oz] = P2(nOut[0], nOut[1]), nwx = ox - o.x, nwz = oz - o.z;
          const sgn = Math.cos(a + 1) * nwx - Math.sin(a + 1) * nwz > 0 ? 1 : -1;
          addDoor({ hx: hx2, hz, y: fy + 0.01, closed: a, openBy: sgn * amt, w: 0.9, h: 2, mat: M.planksDark, startOpen: R2() < 0.6 });
        } else if (st < 0.8) {
          const [x, z] = P2(lx + nOut[0] * 1.6, lz + nOut[1] * 1.6);
          box(M.planksDark, x, terrainH(x, z) + 0.06, z, 0.9, 0.05, 2, { rot: o.rot + S22.r + R2.range(-0.4, 0.4), rx: 0.05, tile: 1.2 });
        }
        noPanel();
        for (let k = 0; k < 2; k++) {
          const off = 0.35 + k * 0.32;
          B(M.planksDark, lx + nOut[0] * off, base2 + 0.1 + (1 - k) * 0.16, lz + nOut[1] * off, name === "front" || name === "back" ? 1.3 : 0.32, 0.18 + (1 - k) * 0.16, name === "front" || name === "back" ? 0.32 : 1.3, { collide: true, tile: 1 });
        }
        {
          // если рельеф у входа ниже площадки — доращиваем лестницу до земли (подъём ≤ 0,25), иначе в дом не забраться
          let topY = base2 + 0.19, off = 0.67;
          for (let k = 0; k < 6; k++) {
            const nx = lx + nOut[0] * (off + 0.32), nz = lz + nOut[1] * (off + 0.32), [gx, gz] = P2(nx, nz), g = terrainH(gx, gz);
            if (topY - g < 0.3) break;
            off += 0.32;
            topY -= Math.min(0.24, (topY - g) / 2 + 0.02);
            const y0 = g - 0.15;
            B(M.planksDark, nx, (topY + y0) / 2, nz, name === "front" || name === "back" ? 1.3 : 0.32, topY - y0, name === "front" || name === "back" ? 0.32 : 1.3, { collide: true, tile: 1 });
          }
        }
      }
    }
  }
  const edge = (name, atStart) => bySide[name].filter((q) => atStart ? q.u0 < 0.05 : q.u1 > sides[name].len - 0.05);
  const corners = { "-1,1": [...edge("front", true), ...edge("left", true)], "1,1": [...edge("front", false), ...edge("right", true)], "-1,-1": [...edge("back", true), ...edge("left", false)], "1,-1": [...edge("back", false), ...edge("right", false)] };
  if (o.style !== "log" && o.style !== "brick") {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      panel("trim", { hp: 0.6, sup: { list: corners[sx + "," + sz], frac: 0.5 }, density: 450 });
      B(trimMat, sx * (w / 2 + 0.015), fy + h / 2, sz * (d / 2 - 0.06), 0.05, h + 0.05, 0.14, { tile: 1, vertical: true });
      B(trimMat, sx * (w / 2 - 0.06), fy + h / 2, sz * (d / 2 + 0.015), 0.14, h + 0.05, 0.05, { tile: 1, vertical: true });
    }
    for (const [name, sgn] of [["front", 1], ["back", -1]]) {
      panel("trim", { hp: 0.5, sup: { list: bySide[name].filter((q) => q.y0 < 0.05), frac: 0.5 }, density: 450 });
      B(trimMat, 0, fy + 0.06, sgn * (d / 2 + 0.03), w + 0.04, 0.12, 0.05, { tile: 1 });
    }
  }
  if (o.style === "log") {
    const stub = new THREE30.CylinderGeometry(0.12, 0.12, 0.62, 7);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      panel("trim", { hp: 1.2, sup: { list: corners[sx + "," + sz], frac: 0.99 }, density: 500 });
      for (let y = 0.1; y < h; y += 0.225) {
        const [x, z] = P2(sx * (w / 2 - 0.1), sz * (d / 2 - 0.1));
        const dir2 = Math.round(y / 0.225) % 2 ? o.rot : o.rot + Math.PI / 2;
        place(M.logEnd, stub, x, fy + y, z, [0, dir2, Math.PI / 2]);
      }
    }
  }
  const pitch = o.pitch ?? 0.6, over = 0.38, top = fy + h;
  const D2 = d / 2 + over, hr = d / 2 * Math.tan(pitch), Ls = D2 / Math.cos(pitch);
  S.hr = hr;
  S.roofBurn = o.roof === "tar" || o.roof === "shingle";
  const roofMat = o.roofMat ?? (o.roof === "tar" ? M.roofTar : M.roofRust);
  const nP = Math.ceil((w + 0.8) / 1.05), pw = (w + 0.8) / nP;
  const damage = o.damage ?? 0.3;
  const roofSup = { list: walls, frac: 0.5 };
  // стропило лежит на верхних кусках передней и задней стены рядом с собой: выбита любая опора — стропило падает
  const topNear = (name, lx) => bySide[name].filter((q) => q.y1 > h - 0.05 && Math.abs((q.u0 + q.u1) / 2 - w / 2 - lx) < 1.3);
  const rafters = [];
  const MZ = o.mezz ? { x0: -o.mezz.w / 2, x1: o.mezz.w / 2, z0: d / 2 - o.mezz.d } : null;
  for (let i = 0; i <= nP; i += 1) {
    const lx = -w / 2 - 0.4 + pw * i;
    const fr = topNear("front", lx), bk = topNear("back", lx);
    const pr = panel("roof", { hp: 0.8, sup: fr.length && bk.length ? { groups: [fr, bk], frac: 0.34 } : roofSup, density: 500 });
    pr.lx = lx;
    rafters.push(pr);
    for (const s2 of [-1, 1]) {
      // над мезонином передний скат стропил доходит только до его задней стены — дальше светёлка
      if (MZ && s2 > 0 && lx > MZ.x0 - 0.06 && lx < MZ.x1 + 0.06) {
        B(M.planksDark, lx, top + hr - MZ.z0 / 2 * Math.tan(pitch) - 0.08, MZ.z0 / 2, 0.08, 0.12, MZ.z0 / Math.cos(pitch) + 0.06, { rx: pitch, tile: 1 });
        continue;
      }
      B(M.planksDark, lx, top + hr - D2 / 2 * Math.tan(pitch) - 0.08, s2 * D2 / 2, 0.08, 0.12, Ls, { rx: s2 * pitch, tile: 1 });
    }
  }
  const raftSup = { list: rafters, frac: 0.5 };
  for (let i = 0; i < nP; i++) {
    const lx = -w / 2 - 0.4 + pw * (i + 0.5);
    for (const s2 of [-1, 1]) {
      if (R2() < damage * 0.4) continue;
      const sag = R2() < damage * 0.3 ? R2.range(0.05, 0.14) : 0;
      // лист кровли держат ближайшие к нему куски стены (и фронтон у торца): выбило стену — просел этот участок крыши
      const side2 = bySide[s2 > 0 ? "front" : "back"].filter((q) => Math.abs((q.u0 + q.u1) / 2 - w / 2 - lx) < 1.7);
      const gable = Math.abs(lx) > w / 2 - 1.2 ? bySide[lx < 0 ? "left" : "right"].filter((q) => s2 * ((q.u0 + q.u1) / 2 - (d - 2 * WALL_T) / 2) < 0.8) : [];
      const near = side2.concat(gable);
      const pair = [rafters[i], rafters[i + 1]];
      panel("roof", { hp: 0.6, sup: near.length ? { groups: [near, pair], frac: R2.range(0.5, 0.7) } : { groups: [walls, pair], frac: R2.range(0.4, 0.62) }, density: 1400, float: 0, burnable: o.roof === "tar" || o.roof === "shingle" });
      const rxs = s2 * pitch + R2.range(-0.02, 0.02);
      if (MZ && s2 > 0 && lx + pw / 2 > MZ.x0 && lx - pw / 2 < MZ.x1) {
        // лист под мезонином: снаружи светёлки — во весь скат, внутри — только от конька до её задней стены
        const a = lx - pw / 2 + 0.01, b = lx + pw / 2 - 0.01;
        for (const [u0, u1] of [[a, Math.min(b, MZ.x0)], [Math.max(a, MZ.x1), b]]) if (u1 - u0 > 0.02) B(roofMat, (u0 + u1) / 2, top + hr - D2 / 2 * Math.tan(pitch) - sag, D2 / 2, u1 - u0, 0.03, Ls, { rx: rxs, tile: 1.2 });
        const u0 = Math.max(a, MZ.x0), u1 = Math.min(b, MZ.x1);
        if (u1 - u0 > 0.02) B(roofMat, (u0 + u1) / 2, top + hr - (MZ.z0 + 0.1) / 2 * Math.tan(pitch) - sag, (MZ.z0 + 0.1) / 2, u1 - u0, 0.03, (MZ.z0 + 0.1) / Math.cos(pitch), { rx: rxs, tile: 1.2 });
        continue;
      }
      B(roofMat, lx, top + hr - D2 / 2 * Math.tan(pitch) - sag, s2 * D2 / 2, pw - 0.02, 0.03, Ls, { rx: rxs, tile: 1.2 });
    }
  }
  panel("roof", { hp: 1, sup: raftSup, density: 500 });
  B(M.planksDark, 0, top + hr - 0.02, 0, w + 0.8, 0.14, 0.14, { tile: 1 });
  for (const s2 of [-1, 1]) {
    panel("roof", { hp: 0.6, sup: raftSup, density: 450 });
    B(trimMat, 0, top + hr - D2 * Math.tan(pitch) - 0.07, s2 * (D2 - 0.02), w + 0.84, 0.16, 0.035, { tile: 1 });
    for (const e of [-1, 1]) B(trimMat, e * (w / 2 + 0.42), top + hr - D2 / 2 * Math.tan(pitch) - 0.03, s2 * D2 / 2, 0.035, 0.16, Ls, { rx: s2 * pitch, tile: 1 });
  }
  panel("roofcol", { mode: "none", sup: roofSup });
  for (let k = 0; k < 4; k++) {
    const y0 = top + hr * k / 4 - 0.05, y1 = top + hr * (k + 1) / 4 + 0.05;
    const half = D2 * (1 - (k + 0.5) / 4);
    if (MZ) {
      // в полосе мезонина «крыша» есть только позади светёлки
      const L0 = MZ.x0 - (-w / 2 - 0.4), L1 = w / 2 + 0.4 - MZ.x1;
      for (const [lx2, L] of [[-w / 2 - 0.4 + L0 / 2, L0], [MZ.x1 + L1 / 2, L1]]) {
        const [cx, cz] = P2(lx2, 0);
        addBox(cx, (y0 + y1) / 2, cz, L, y1 - y0, half * 2, o.rot, { walk: true });
      }
      const zb = Math.min(half, MZ.z0);
      if (zb + half > 0.05) {
        const [cx, cz] = P2(0, (zb - half) / 2);
        addBox(cx, (y0 + y1) / 2, cz, MZ.x1 - MZ.x0, y1 - y0, zb + half, o.rot, { walk: true });
      }
      continue;
    }
    const [cx, cz] = P2(0, 0);
    addBox(cx, (y0 + y1) / 2, cz, w + 0.8, y1 - y0, half * 2, o.rot, { walk: true });
  }
  const tri = new THREE30.Shape();
  tri.moveTo(-d / 2, 0);
  tri.lineTo(d / 2, 0);
  tri.lineTo(0, hr);
  tri.closePath();
  const tg = new THREE30.ExtrudeGeometry(tri, { depth: 0.08, bevelEnabled: false });
  const tuv = tg.attributes.uv;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i) / 1.5, tuv.getY(i) / 1.5);
  for (const s2 of [-1, 1]) {
    const [x, z] = P2(s2 * (w / 2 - 0.04) - 0.04, 0);
    panel("wall", { hp: 0.9, sup: { list: bySide[s2 < 0 ? "left" : "right"], frac: 0.5 }, mode: "rigid", density: 450 });
    place(o.gableMat ?? (o.style === "log" ? M.planksDark : wallMat), tg, x, top, z, [0, o.rot + Math.PI / 2, 0]);
  }
  noPanel();
  if (o.stove) {
    const sx = o.stove[0], sz = o.stove[1];
    B(M.brick, sx, fy + 0.5, sz, 1, 1, 1.1, { collide: true, tile: 0.6 });
    B(M.brick, sx, fy + 1.6, sz - 0.2, 0.5, 1.2, 0.5, { tile: 0.6 });
    B(M.brick, sx, (fy + 2.2 + top) / 2, sz - 0.2, 0.42, top - fy - 2.2 + 0.02, 0.42, { tile: 0.6 });
    const [cx, cz] = P2(sx, sz - 0.2);
    addBox(cx, (fy + 1 + top) / 2, cz, 0.5, top - fy - 1, 0.5, o.rot);
    panel("prop", { hp: 2.4, mode: "rigid", density: 1800, float: 0, burnable: false });
    B(M.brick, sx, top + (hr * 1.4 + 0.3) / 2, sz - 0.2, 0.42, hr * 1.4 + 0.3, 0.42, { tile: 0.6 });
    B(M.concrete, sx, top + hr * 1.4 + 0.34, sz - 0.2, 0.54, 0.08, 0.54, { tile: 0.6 });
    addBox(cx, top + (hr * 1.4 + 0.3) / 2, cz, 0.5, hr * 1.4 + 0.3, 0.5, o.rot);
    noPanel();
  }
  if (o.interior !== false) (o.furnish ?? furnish)(o, R2, F, fy, B);
  noPanel();
  if (o.glow) {
    const [x, z] = P2(o.glow[0], o.glow[1]);
    S.glowLamp = addLamp({ kind: "window", x, y: fy + 1.2, z, flick: 0.3, on: true, ground: fy });
    place(M.dark, new THREE30.CylinderGeometry(0.06, 0.07, 0.22, 8), x, fy + 0.86, z, 0);
  }
  if (o.decor) o.decor(o, R2, F, fy, B, S);
  endStruct();
  HOUSES.push({ ...o, fy, top: top + hr, struct: S });
  return S;
}
function cellarRoom(o, C2, fy, B, R2, F) {
  const bottom = o.pad.y - C2.depth, fl = bottom + 0.12, ceil = fy - 0.1;
  const cx = (C2.rx0 + C2.rx1) / 2, cz = (C2.rz0 + C2.rz1) / 2, rw = C2.rx1 - C2.rx0, rd = C2.rz1 - C2.rz0, hh = ceil - fl;
  const wmat = C2.kind === "basement" ? M.brick : M.planksDark, tile = C2.kind === "basement" ? 0.6 : 1.2;
  B(M.planksDark, cx, fl - 0.05, cz, rw, 0.1, rd, { tile: 1.2, collide: true });
  for (const [lx2, lz2, sx2, sz] of [[cx, C2.rz0 - 0.1, rw + 0.4, 0.2], [cx, C2.rz1 + 0.1, rw + 0.4, 0.2], [C2.rx0 - 0.1, cz, 0.2, rd], [C2.rx1 + 0.1, cz, 0.2, rd]])
    B(wmat, lx2, fl + hh / 2, lz2, sx2, hh, sz, { tile, collide: true, walk: false, vertical: wmat !== M.brick });
  for (let x = C2.rx0 + 0.6; x < C2.rx1; x += 1.2) B(M.planksDark, x, ceil - 0.09, cz, 0.14, 0.16, rd, { tile: 1 });
  if (C2.kind === "basement") for (const x of [cx - rw * 0.22, cx + rw * 0.22]) B(M.brick, x, fl + hh / 2, cz - 0.4, 0.38, hh, 0.38, { tile: 0.6, collide: true, walk: false });
  const n2 = C2.steps, rise = (fy - fl) / n2, run = C2.run;
  const sx = (C2.hx0 + C2.hx1) / 2, sw = C2.hx1 - C2.hx0 - 0.06;
  for (let k = 0; k < n2; k++) {
    const top = fy - rise * (k + 1), z = C2.hz1 - run * (k + 0.5);
    B(M.planks, sx, top - 0.03, z, sw, 0.06, run + 0.02, { tile: 1, collide: true });
  }
  for (const e of [-1, 1]) {
    const x = sx + e * (sw / 2 + 0.03), L = run * n2, zc = C2.hz1 - L / 2, yc = (fy + fl) / 2 - 0.1;
    const [wx, wz] = F.p(x, zc);
    box(M.planksDark, wx, yc, wz, 0.05, 0.22, Math.hypot(L, fy - fl), { rot: o.rot, rx: -Math.atan2(fy - fl, L), tile: 1 });
  }
  B(M.planksDark, sx + sw / 2 + 0.55, fy + 0.03, (C2.hz0 + C2.hz1) / 2, 0.85, 0.05, C2.hz1 - C2.hz0, { tile: 1, rz: 0.12 });
  const shelves = (x, z) => {
    for (let k = 0; k < 3; k++) B(M.planks, x, fl + 0.5 + k * 0.55, z, 0.4, 0.04, 1.6, { tile: 1 });
    for (const e of [-0.75, 0.75]) B(M.planksDark, x, fl + 0.8, z + e, 0.05, 1.6, 0.05, { tile: 1 });
    for (let k = 0; k < 7; k++) {
      const [jx, jz] = F.p(x + R2.range(-0.12, 0.12), z + R2.range(-0.7, 0.7));
      cyl(M.glass, jx, fl + 0.6 + R2.int(0, 2) * 0.55, jz, 0.05, 0.05, 0.16, { seg: 8 });
    }
  };
  shelves(C2.rx0 + 0.25, cz - rd * 0.2);
  for (let k = 0; k < 3; k++) {
    const [bx, bz] = F.p(C2.rx0 + 0.45 + k * 0.62, C2.rz0 + 0.45);
    cyl(M.planksDark, bx, fl + 0.4, bz, 0.26, 0.26, 0.8, { seg: 12, tile: 1 });
    cyl(M.rust, bx, fl + 0.62, bz, 0.27, 0.27, 0.04, { seg: 12 });
  }
  const [lx, lz] = F.p(cx, cz);
  addLamp({ kind: "bulb", x: lx, y: ceil - 0.35, z: lz, flick: 0.45, on: true, ground: fl, power: 3.5, range: 7 });
  place(M.lampGlass, new THREE30.SphereGeometry(0.05, 8, 6), lx, ceil - 0.32, lz, 0);
  cyl(M.dark, lx, ceil - 0.18, lz, 4e-3, 4e-3, 0.3, { seg: 3 });
  if (C2.kind === "basement") {
    const tx = C2.rx1 - 1.2, tz = cz + 1;
    B(M.planks, tx, fl + 0.74, tz, 1.4, 0.05, 0.8, { tile: 1, collide: true });
    for (const [a, b] of [[-0.62, -0.32], [0.62, -0.32], [-0.62, 0.32], [0.62, 0.32]]) B(M.planksDark, tx + a, fl + 0.37, tz + b, 0.06, 0.72, 0.06, { tile: 1 });
    B(M.olive, tx + 0.35, fl + 0.9, tz - 0.1, 0.4, 0.26, 0.3, { tile: 1 });
    const [ax, az] = F.p(tx + 0.45, tz - 0.1);
    cyl(M.dark, ax, fl + 1.3, az, 6e-3, 6e-3, 0.6, { seg: 3 });
    const [mx, mz] = F.p(tx - 0.3, tz);
    sheet(3, mx, fl + 0.77, mz, o.rot + 0.2, { flat: true, w: 0.42, h: 0.56 });
    for (let k = 0; k < 3; k++) {
      const [px, pz] = F.p(C2.rx1 - 5e-3, cz - 1.2 + k * 0.4);
      sheet(k, px, fl + 1.35 + k % 2 * 0.12, pz, o.rot - Math.PI / 2);
    }
    for (const y2 of [0.45, 1.3]) B(M.planks, C2.rx0 + 1.9, fl + y2, C2.rz1 - 0.45, 1.9, 0.06, 0.75, { tile: 1, collide: y2 < 1 });
    B(M.canvas, C2.rx0 + 1.9, fl + 0.5, C2.rz1 - 0.45, 1.8, 0.05, 0.7, { tile: 1 });
    B(M.crate, cx + 0.3, fl + 0.2, C2.rz0 + 0.35, 1, 0.4, 0.55, { tile: 0.8, collide: true });
  } else {
    const [px, pz] = F.p(C2.rx1 - 5e-3, cz);
    sheet(1, px, fl + 1.3, pz, o.rot - Math.PI / 2);
    B(M.sack, C2.rx1 - 0.5, fl + 0.22, C2.rz0 + 0.5, 0.7, 0.45, 0.5, { tile: 1 });
    B(M.sack, C2.rx1 - 0.6, fl + 0.6, C2.rz0 + 0.5, 0.6, 0.35, 0.45, { tile: 1, r: 0.3 });
  }
}
var IP = { houses: [], list: [], meshes: [], built: false };
var _ipm = new THREE29.Matrix4();
var _ipq = new THREE29.Quaternion();
var _ipv = new THREE29.Vector3();
var _ips = new THREE29.Vector3(1, 1, 1);
var _ipe = new THREE29.Euler();
var _ipZ = new THREE29.Matrix4().makeScale(0, 0, 0);
var _ipUp = new THREE29.Vector3(0, 1, 0);
function houseRec(o, fy) {
  if (o.__ip) return o.__ip;
  const H = { o, x: o.x, z: o.z, rot: o.rot, w: o.w, d: o.d, fy, s: CUR, items: [], tops: [], c: Math.cos(o.rot), sn: Math.sin(o.rot) };
  H.P = (lx, lz) => [H.x + lx * H.c + lz * H.sn, H.z - lx * H.sn + lz * H.c];
  H.L = (x, z) => {
    const dx = x - H.x, dz = z - H.z;
    return [dx * H.c - dz * H.sn, dx * H.sn + dz * H.c];
  };
  IP.houses.push(H);
  return o.__ip = H;
}
function ipTop(H, lx, lz, hw, hd, y, panel2 = null, item = null) {
  const t = { lx, lz, hw, hd, y, panel: panel2, item };
  H.tops.push(t);
  return t;
}
var topAlive = (t) => !(t.panel?.dead || t.item && !t.item.alive);
function ipAdd(H, type, lx, lz, rot) {
  const it = { H, type, lx, lz, rot, alive: true, hp: IPT_HP[type], top: null, y: H.fy, idx: -1 };
  H.items.push(it);
  IP.list.push(it);
  return it;
}
var IPT_HP = { table: 1.6, longtable: 2, chair: 0.8, stool: 0.6, shelf: 0.7, frame: 0.3, cup: 0.1, mug: 0.2, plate: 0.1, jar: 0.1, bottle: 0.1 };
var IPT_TOP = { table: [1.2, 0.72, 0.77], longtable: [2.4, 0.8, 0.77] };
function ipSet(H, T, R2, n2 = 4) {
  const D = IPT_TOP[T.type], c = Math.cos(T.rot), s = Math.sin(T.rot);
  T.topRef = ipTop(H, T.lx, T.lz, D[0] / 2, D[1] / 2, H.fy + D[2], null, T);
  T.topRef.rot = T.rot;
  for (let i = 0; i < n2; i++) {
    const u = R2.range(-D[0] / 2 + 0.12, D[0] / 2 - 0.12), v = R2.range(-D[1] / 2 + 0.1, D[1] / 2 - 0.1);
    const it = ipAdd(H, ["plate", "cup", "mug", "plate", "bottle", "jar"][R2.int(0, 5)], T.lx + u * c + v * s, T.lz - u * s + v * c, R2() * TAU);
    it.top = T.topRef;
  }
}
function interiorWalls(o, R2, fy) {
  const H = houseRec(o, fy), wt = WALL_T;
  const dr = o.door ?? { side: "front", at: 0 };
  const busy = (side2, at) => (o.windows || []).some((w) => w.side === side2 && Math.abs(w.at - at) < 0.9) || dr.side === side2 && Math.abs(dr.at - at) < 1 || !!o.door2 && o.door2.side === side2 && Math.abs(o.door2.at - at) < 1;
  const at = R2.range(-o.w * 0.25, o.w * 0.25);
  if (!busy("back", at)) {
    const lz = -o.d / 2 + wt + 0.12, y = fy + 1.45;
    const sh = ipAdd(H, "shelf", at, lz, 0);
    sh.y = y;
    sh.topRef = ipTop(H, at, lz, 0.45, 0.1, y + 0.015, null, sh);
    for (let i = 0; i < 4; i++) if (R2() < 0.8) {
      const it = ipAdd(H, ["jar", "jar", "bottle", "mug"][R2.int(0, 3)], at - 0.36 + i * 0.24, lz, R2() * TAU);
      it.top = sh.topRef;
    }
  }
  for (const side2 of ["left", "right"]) {
    const a2 = R2.range(-o.d * 0.2, o.d * 0.2);
    if (busy(side2, -a2) || busy(side2, a2) || R2() < 0.35) continue;
    const lx = (side2 === "left" ? -1 : 1) * (o.w / 2 - wt - 0.015);
    const pic = ipAdd(H, "frame", lx, a2, side2 === "left" ? Math.PI / 2 : -Math.PI / 2);
    pic.y = fy + R2.range(1.35, 1.6);
  }
}
var IPT = {};
function ipDefs() {
  const B = (x, y, z, sx, sy, sz, col) => ({ c: [x, y, z], s: [sx, sy, sz], col, cyl: false });
  const C = (x, y, z, r, h, col, r1 = r) => ({ c: [x, y, z], s: [r * 2, h, r * 2], r, r1, col, cyl: true });
  const legs = (hx, hz, h, t) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => B(a * hx, h / 2, b * hz, t, h, t));
  Object.assign(IPT, {
    table: { wood: true, parts: [B(0, 0.745, 0, 1.2, 0.045, 0.72), B(0, 0.67, 0, 1.08, 0.08, 0.6), ...legs(0.54, 0.3, 0.72, 0.055)] },
    longtable: { wood: true, parts: [B(0, 0.745, 0, 2.4, 0.045, 0.8), B(0, 0.67, 0, 2.2, 0.08, 0.66), ...legs(1.1, 0.34, 0.72, 0.055)] },
    chair: { wood: true, parts: [B(0, 0.45, 0, 0.42, 0.035, 0.42), ...legs(0.18, 0.18, 0.45, 0.035), B(-0.18, 0.72, -0.19, 0.035, 0.52, 0.035), B(0.18, 0.72, -0.19, 0.035, 0.52, 0.035), B(0, 0.86, -0.19, 0.4, 0.1, 0.022), B(0, 0.66, -0.19, 0.4, 0.06, 0.022)] },
    stool: { wood: true, parts: [B(0, 0.5, 0, 0.32, 0.04, 0.32), ...legs(0.12, 0.12, 0.5, 0.035)] },
    shelf: { wood: true, hangs: true, parts: [B(0, 0, 0, 0.95, 0.03, 0.22), B(-0.38, -0.08, 0.02, 0.03, 0.16, 0.16), B(0.38, -0.08, 0.02, 0.03, 0.16, 0.16)] },
    frame: { frag: true, glass: false, hangs: true, parts: [B(0, 0, 0, 0.42, 0.32, 0.02, [0.3, 0.2, 0.12]), B(0, 0, 0.011, 0.36, 0.26, 0.004, [0.62, 0.58, 0.45])] },
    cup: { frag: true, parts: [C(0, 0.045, 0, 0.04, 0.09, [0.88, 0.88, 0.84], 0.036), B(0.048, 0.05, 0, 0.012, 0.045, 0.008, [0.88, 0.88, 0.84])] },
    mug: { frag: true, parts: [C(0, 0.05, 0, 0.045, 0.1, [0.32, 0.46, 0.34]), C(0, 0.101, 0, 0.046, 0.006, [0.1, 0.12, 0.2]), B(0.054, 0.05, 0, 0.014, 0.05, 0.008, [0.32, 0.46, 0.34])] },
    plate: { frag: true, parts: [C(0, 0.008, 0, 0.11, 0.016, [0.9, 0.9, 0.87], 0.08), C(0, 0.017, 0, 0.112, 0.003, [0.25, 0.35, 0.6], 0.112)] },
    jar: { frag: true, glass: true, parts: [C(0, 0.065, 0, 0.05, 0.13, [0.55, 0.62, 0.45]), C(0, 0.135, 0, 0.042, 0.014, [0.55, 0.45, 0.2])] },
    bottle: { frag: true, glass: true, parts: [C(0, 0.09, 0, 0.035, 0.18, [0.12, 0.26, 0.14]), C(0, 0.21, 0, 0.014, 0.07, [0.12, 0.26, 0.14], 0.03)] }
  });
  IP.cer = new THREE29.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.02 });
  IP.glass = new THREE29.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.15 });
  for (const D of Object.values(IPT)) {
    D.mat = D.wood ? M.planks : D.glass ? IP.glass : IP.cer;
    D.geos = D.parts.map((q) => {
      let g = q.cyl ? new THREE29.CylinderGeometry(q.r1, q.r, q.s[1], 12) : new THREE29.BoxGeometry(...q.s);
      if (!q.cyl && D.wood) uvBox(g, q.s[0], q.s[1], q.s[2], 0.8);
      g = g.index ? g.toNonIndexed() : g;
      if (!D.wood) {
        const n2 = g.attributes.position.count, cl = new Float32Array(n2 * 3);
        for (let i = 0; i < n2; i++) cl.set(q.col, i * 3);
        g.setAttribute("color", new THREE29.BufferAttribute(cl, 3));
      }
      q.he = q.s.map((v) => v / 2);
      return g;
    });
    D.geo = BGU.mergeGeometries(D.geos.map((g, i) => g.clone().translate(...D.parts[i].c)), false);
    D.geo.computeBoundingBox();
    const bb = D.geo.boundingBox;
    D.he = bb.getSize(new THREE29.Vector3()).multiplyScalar(0.5).toArray();
    D.cy = bb.getCenter(new THREE29.Vector3()).y;
  }
  // осколки посуды: тонкие пластинки; щепа мебели
  IP.shard = new THREE29.BoxGeometry(0.035, 0.005, 0.022).toNonIndexed();
  IP.shard.setAttribute("color", new THREE29.BufferAttribute(new Float32Array(IP.shard.attributes.position.count * 3).fill(0.88), 3));
  IP.splinter = uvBox(new THREE29.BoxGeometry(0.02, 0.02, 0.14), 0.02, 0.02, 0.14, 0.8);
}
function ipMatrix(it, out) {
  const [x, z] = it.H.P(it.lx, it.lz), D = IPT[it.type];
  it.wx = x;
  it.wz = z;
  const wr = it.H.rot + it.rot;
  if (it.fallen) {
    // повалено ещё до игры: лежит на боку на полу
    _ipe.set(Math.PI / 2, wr, 0, "YXZ");
    _ipq.setFromEuler(_ipe);
    it.wy = it.H.fy + D.he[2] - D.cy;
    it.lying = true;
    return out.compose(_ipv.set(x, it.H.fy + D.he[2], z).addScaledVector(new THREE29.Vector3(0, 0, -D.cy).applyQuaternion(_ipq), 1), _ipq, _ips);
  }
  it.wy = it.top ? it.top.y : it.y;
  _ipq.setFromAxisAngle(_ipUp, wr);
  return out.compose(_ipv.set(x, it.wy, z), _ipq, _ips);
}
function buildInteriorProps() {
  ipDefs();
  const byType = {};
  for (const it of IP.list) (byType[it.type] ??= []).push(it);
  for (const [type, list] of Object.entries(byType)) {
    const D = IPT[type], im = new THREE29.InstancedMesh(D.geo, D.mat, list.length);
    list.forEach((it, i) => {
      it.idx = i;
      it.im = im;
      im.setMatrixAt(i, ipMatrix(it, _ipm));
      // стол — препятствие (на него можно залезть); сломали — коллайдер убираем
      if (IPT_TOP[type] && !it.fallen) it.col = addBox(it.wx, it.H.fy + 0.39, it.wz, IPT_TOP[type][0], 0.78, IPT_TOP[type][1], it.H.rot + it.rot, { walk: true });
    });
    im.castShadow = !D.frag;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    scene.add(im);
    IP.meshes.push(im);
  }
  IP.built = true;
  console.info(`[interior] предметов: ${IP.list.length}, домов: ${IP.houses.length}`);
}
function ipHide(it) {
  it.alive = false;
  it.im.setMatrixAt(it.idx, _ipZ);
  it.im.instanceMatrix.needsUpdate = true;
  if (it.col && !it.col.dead) {
    it.col.dead = true;
    removeStaticCollider(it.col);
  }
}
function ipFloor(H) {
  return (x, z, y) => {
    const [lx, lz] = H.L(x, z);
    let f = Math.abs(lx) < H.w / 2 && Math.abs(lz) < H.d / 2 ? H.fy : hFast(x, z);
    for (const t of H.tops) {
      if (!topAlive(t) || t.y > y + 0.05 || t.y <= f) continue;
      let u = lx - t.lx, v = lz - t.lz;
      if (t.rot) {
        const c = Math.cos(t.rot), s = Math.sin(t.rot);
        [u, v] = [u * c - v * s, u * s + v * c];
      }
      if (Math.abs(u) < t.hw && Math.abs(v) < t.hd) f = t.y;
    }
    return f;
  };
}
function ceramicSound(dist, x, glass) {
  if (!ready() || dist > 70) return;
  const ctx = AUDIO.ctx, t = ctx.currentTime + dist / 343, v = clamp(0.9 / (1 + dist / 5), 0.01, 0.5);
  for (let i = 0; i < 5; i++) burst(t + i * sr(4e-3, 0.03), { type: "bandpass", f: (glass ? 5200 : 3200) * sr(0.7, 1.4), q: glass ? 12 : 7, vol: v * sr(0.4, 1), a: 1e-3, dec: sr(0.03, glass ? 0.2 : 0.09), x, len: 0.3 });
  burst(t, { type: "lowpass", f: 900, q: 1, vol: v * 0.5, a: 1e-3, dec: 0.05, x, len: 0.2 });
}
function ipLoose(it, vel, ang) {
  if (!it.alive) return null;
  const D = IPT[it.type];
  ipHide(it);
  const m = new THREE29.Mesh(D.geo.clone().translate(0, -D.cy, 0), D.mat);
  ipMatrix(it, _ipm).decompose(m.position, m.quaternion, _ipv);
  m.position.add(new THREE29.Vector3(0, D.cy, 0).applyQuaternion(m.quaternion));
  return ldebAdd(m, { he: D.he, vel, ang, floor: ipFloor(it.H), bounce: D.frag ? 0.2 : 0.3, life: 150, cast: !D.frag, onHit: (d, sp) => {
    const p = d.mesh.position;
    if (D.frag && sp > 2.1) {
      ipShards(p.clone(), D, it.H, _ipUp, sp * 0.3);
      ldebKill(d);
    } else if (sp > 1.6) {
      if (D.wood) woodCrack(camera.position.distanceTo(p), panOf(p), 0.25);
      else ceramicSound(camera.position.distanceTo(p) + 8, panOf(p), false);
    }
  } });
}
function ipShards(p, D, H, dir2, k = 1) {
  const n2 = Math.round(sr(7, 12) * (0.6 + Q.fx * 0.4)), floor = ipFloor(H), col = D.parts[D.parts.length > 1 && D.hangs ? 1 : 0].col;
  for (let i = 0; i < n2; i++) {
    const g = IP.shard.clone(), cl = g.attributes.color.array;
    for (let j = 0; j < cl.length; j += 3) cl.set(col, j);
    const m = new THREE29.Mesh(g, D.mat === M.planks ? IP.cer : D.mat);
    m.position.set(p.x + sr(-0.04, 0.04), p.y + sr(0, 0.06), p.z + sr(-0.04, 0.04));
    m.scale.set(sr(0.5, 1.5), 1, sr(0.5, 1.5));
    m.rotation.set(sr(0, 6), sr(0, 6), sr(0, 6));
    ldebAdd(m, { he: [0.018 * m.scale.x, 3e-3, 0.011 * m.scale.z], vel: new THREE29.Vector3(dir2.x * sr(0.5, 2) * k + sr(-1.4, 1.4), sr(0.5, 2.6), dir2.z * sr(0.5, 2) * k + sr(-1.4, 1.4)), ang: new THREE29.Vector3(sr(-20, 20), sr(-20, 20), sr(-20, 20)), floor, bounce: 0.15, life: sr(40, 80), cast: false });
  }
  for (let i = 0; i < 3; i++) FX.alpha.spawn({ x: p.x, y: p.y + 0.05, z: p.z, vx: sr(-0.3, 0.3), vy: sr(0.1, 0.4), vz: sr(-0.3, 0.3), size: 0.12, grow: 0.4, life: 0.8, col: [0.8, 0.8, 0.78], a: 0.25, drag: 2 });
  ceramicSound(camera.position.distanceTo(p), panOf(p), !!D.glass);
}
function burnItems(s) {
  for (const H of IP.houses) if (H.s === s) for (const it of H.items) {
    if (!it.alive) continue;
    if (IPT[it.type].wood) ipHide(it);
    else ipLoose(it, new THREE29.Vector3(), new THREE29.Vector3(sr(-1, 1), 0, sr(-1, 1)));
  }
}
function furnish(o, R2, F, fy, B) {
  const { w, d } = o;
  const tx = R2.range(-w * 0.2, w * 0.2), tz = R2.range(-d * 0.15, d * 0.1);
  const flipped = R2() < 0.35;
  panel("prop", { hp: 0.35, density: 450 });
  if (!flipped) {
    // стол — живой: пули щепят, стол рассыпается на столешницу и ножки, посуда летит на пол и бьётся
    const H = houseRec(o, fy);
    const T = ipAdd(H, "table", tx, tz, R2.range(-0.08, 0.08));
    ipSet(H, T, R2);
    for (const [cx, cz, cr] of [[0.2, 0.62, Math.PI], [-0.35, -0.62, 0], [0.8, 0.05, -Math.PI / 2]]) if (R2() < 0.8) {
      const ch = ipAdd(H, R2() < 0.25 ? "stool" : "chair", tx + cx, tz + cz, cr + R2.range(-0.3, 0.3));
      if (R2() < 0.15) ch.fallen = true;
    }
  } else {
    B(M.planks, tx, fy + 0.38, tz, 1.3, 0.75, 0.05, { tile: 1, collide: true, walk: false });
    for (const a of [-0.58, 0.58]) for (const b of [0.2, 0.55]) B(M.planksDark, tx + a, fy + 0.72 - 0.35 + b * 0, tz + b, 0.06, 0.06, 0.72, { tile: 1 });
    // опрокинутый стол: посуда уже на полу, часть — осколками
    const H = houseRec(o, fy);
    for (let i = 0; i < 4; i++) ipAdd(H, ["cup", "plate", "mug", "bottle"][i], tx + R2.range(-0.9, 0.9), tz + R2.range(0.2, 1), R2() * TAU).fallen = true;
    const ch = ipAdd(H, "chair", tx + 0.9, tz - 0.5, R2() * TAU);
    ch.fallen = true;
  }
  interiorWalls(o, R2, fy);
  if (w > 4) {
    panel("prop", { hp: 0.5, density: 1200, float: 0, burnable: false });
    const bx = -w / 2 + 1.1, bz = -d / 2 + 0.6;
    B(M.rust, bx, fy + 0.45, bz, 1.9, 0.05, 0.85, { tile: 1 });
    for (const [a, b] of [[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]]) B(M.rust, bx + a, fy + 0.3, bz + b, 0.05, 0.6, 0.05, { tile: 1 });
  }
  noPanel();
  for (let i = 0; i < 4; i++) {
    const px = R2.range(-w * 0.35, w * 0.35), pz = R2.range(-d * 0.35, d * 0.35), L = R2.range(0.8, 1.8);
    if (o.cellar && px > o.cellar.hx0 - 1 && px < o.cellar.hx1 + 1 && pz > o.cellar.hz0 - 1 && pz < o.cellar.hz1 + 1) continue;
    B(M.planksDark, px, fy + 0.04, pz, L, 0.03, 0.14, { r: R2.range(0, TAU), rz: R2.range(-0.08, 0.08), tile: 1 });
  }
}
function woodpile(x, z, rot, len = 3, rows = 5) {
  const R2 = rng(Math.floor(x * 31 + z * 17));
  const y = terrainH(x, z);
  const c = Math.cos(rot), s = Math.sin(rot);
  const g = new THREE30.CylinderGeometry(0.08, 0.08, 0.5, 6);
  for (let r = 0; r < rows; r++) for (let i = 0; i < len / 0.17; i++) {
    if (r === rows - 1 && R2() < 0.5) continue;
    const lx = -len / 2 + i * 0.17 + r % 2 * 0.08 + R2.range(-0.02, 0.02);
    place(M.logEnd, g, x + lx * c, y + 0.09 + r * 0.155, z - lx * s, [Math.PI / 2 + R2.range(-0.08, 0.08), rot, 0]);
  }
  box(M.roofRust, x, y + rows * 0.16 + 0.1, z, len + 0.3, 0.03, 0.8, { rot, rx: 0.12, tile: 1.2 });
  addBox(x, y + rows * 0.08, z, len, rows * 0.16, 0.55, rot);
}
function planBuildings() {
  planVillage();
  planBases();
}
function buildBuildings() {
  buildVillage();
  buildInteriorProps();
}
var toast = function(){};
var CRATES = [];
function planExtraLandmarks() {
  const addCrate = (tx, tz, name) => {
    const [x, z] = findSpot(tx, tz, 4.3, { pathPad: 0.4, trenchPad: 1.6 });
    CRATES.push({ x, z, rot: Math.atan2(-x, -z), name, s: 1 });
    keep(x, z, 4.8);
  };
  for (const s of Object.values(SPAWNS)) addCrate(s.x + s.fx * 6 + s.fz * 3.5, s.z + s.fz * 6 - s.fx * 3.5, "база " + s.name);
  // центр карты — ангар: малый склад у самолёта, место выбрано вручную (площадка исключена из findSpot)
  {
    const [x, z] = hgW(-3.2, -14.6);
    CRATES.push({ x, z, rot: HG.rot + Math.PI / 2, name: "ангар", s: 0.62 });
  }
}
var STENCIL = { cols: 4, rows: 8, mat: null };
var STENCIL_TXT = [
  ["БОЕПРИПАСЫ", 0], ["ОГНЕОПАСНО", 1], ["НЕ КУРИТЬ", 1], ["СКЛАД № 3 · В/Ч 42717", 0],
  ["7,62×39 ПС ГЖ", 0], ["1320 ШТ · ПАРТ. 118-87", 0], ["РГД-5 · 20 ШТ", 0], ["ЗАПАЛЫ УЗРГМ", 0],
  ["ВОГ-25 · 48 ШТ", 0], ["ГРУЗ ОПАСНЫЙ", 2], ["НЕ БРОСАТЬ", 0], ["5,45×39 7Н6", 0],
  ["ВЕС 32 КГ", 0], ["03", 3], ["ОСКОЛОЧНЫЕ", 0], ["1.1D", 4],
  ["ЦИНК 7,62", 0], ["ПОЖАРНЫЙ ЩИТ", 5], ["ОТВ. ЛЕЙТ. ГРОМОВ", 0], ["ВХОД ЗАПРЕЩЁН", 1],
  ["▲ ВЕРХ ▲", 0], ["12,7×108 Б-32", 0], ["ПГ-7В · 2 ШТ", 0], ["ТРОТИЛ 400 Г", 0]
];
function stencilAtlas() {
  const CW = 512, CH = 128, [c, x] = cv(CW * STENCIL.cols, CH * STENCIL.rows);
  x.clearRect(0, 0, c.width, c.height);
  x.textAlign = "center";
  x.textBaseline = "middle";
  STENCIL_TXT.forEach(([t, style], i) => {
    const cx = (i % STENCIL.cols) * CW, cy = Math.floor(i / STENCIL.cols) * CH;
    x.save();
    x.beginPath();
    x.rect(cx, cy, CW, CH);
    x.clip();
    let fs = style === 3 ? 118 : Math.min(84, Math.floor(CW * 1.55 / Math.max(6, t.length)));
    if (style === 1 || style === 2 || style === 5) {
      // табличка: белая эмаль с красным текстом / жёлтая «опасный груз» / красный щит
      x.fillStyle = style === 2 ? "rgba(214,176,52,.97)" : style === 5 ? "rgba(168,32,26,.97)" : "rgba(226,222,208,.97)";
      x.fillRect(cx + 10, cy + 14, CW - 20, CH - 28);
      x.strokeStyle = style === 5 ? "rgba(240,236,220,.95)" : "rgba(30,26,22,.9)";
      x.lineWidth = 5;
      x.strokeRect(cx + 18, cy + 22, CW - 36, CH - 44);
      x.fillStyle = style === 1 ? "rgba(178,30,24,1)" : style === 5 ? "rgba(240,236,220,1)" : "rgba(24,22,18,1)";
      fs = Math.min(fs, 60);
    } else if (style === 4) {
      // ромб класса опасности 1.1D: оранжевый, с бомбой-кругом
      x.translate(cx + CW / 2, cy + CH / 2);
      x.rotate(Math.PI / 4);
      x.fillStyle = "rgba(226,110,26,.98)";
      x.fillRect(-40, -40, 80, 80);
      x.rotate(-Math.PI / 4);
      x.fillStyle = "rgba(20,16,12,1)";
      x.font = "bold 26px 'Courier New', monospace";
      x.fillText(t, 0, 16);
      x.beginPath();
      x.arc(0, -12, 9, 0, TAU);
      x.fill();
      x.restore();
      return;
    } else x.fillStyle = "rgba(232,226,200,.94)";
    x.font = `bold ${fs}px 'Courier New', monospace`;
    x.fillText(t, cx + CW / 2, cy + CH / 2 + 4);
    // трафаретные перемычки и облезлость краски
    x.globalCompositeOperation = "destination-out";
    if (style === 0 || style === 3) {
      const n2 = t.length, w = x.measureText(t).width;
      for (let k = 0; k < n2; k++) {
        const lx = cx + CW / 2 - w / 2 + (k + 0.5) * w / n2;
        x.fillRect(lx - 1.5, cy + CH / 2 - fs * 0.05, 3, fs * 0.12);
      }
    }
    for (let k = 0; k < 260; k++) x.fillRect(cx + srnd() * CW, cy + srnd() * CH, sr(1, 5), sr(1, 3));
    x.restore();
  });
  const t = tex(c);
  t.anisotropy = MAXA();
  return t;
}
function stencilGeo(i, w, h) {
  const g = new THREE35.PlaneGeometry(w, h), uv = g.attributes.uv;
  const u0 = (i % STENCIL.cols) / STENCIL.cols, v1 = 1 - Math.floor(i / STENCIL.cols) / STENCIL.rows;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / STENCIL.cols, v1 - (1 - uv.getY(k)) / STENCIL.rows);
  return g;
}
function ammoBox(B, S, lx, ly, lz, sx, sy, sz, r, label, open = false) {
  B(M.crate, lx, ly + sy / 2, lz, sx, sy, sz, { r, tile: 0.7 });
  const c = Math.cos(r), s = Math.sin(r);
  const L = (u, w) => [lx + u * c + w * s, lz - u * s + w * c];
  for (const e of [-1, 1]) {
    const [ex, ez] = L(e * (sx / 2 + 0.012), 0);
    B(M.crate, ex, ly + sy / 2, ez, 0.024, sy * 1.02, sz * 1.02, { r, tile: 0.5 });
    const [hx2, hz] = L(e * (sx / 2 + 0.03), 0);
    B(M.rope, hx2, ly + sy * 0.62, hz, 0.02, 0.03, sz * 0.4, { r, tile: 1 });
  }
  if (!open) B(M.crate, lx, ly + sy + 0.012, lz, sx * 0.98, 0.024, sz * 0.98, { r, tile: 0.7 });
  if (label !== void 0) {
    const [fx, fz] = L(0, sz / 2 + 4e-3);
    S(label, fx, ly + sy * 0.5, fz, r, sx * 0.8, sx * 0.2);
    const [bx, bz] = L(0, -sz / 2 - 4e-3);
    S((label + 1) % STENCIL_TXT.length, bx, ly + sy * 0.5, bz, r + Math.PI, sx * 0.8, sx * 0.2);
  }
}
function buildDepot(c) {
  const k = c.s ?? 1, y = terrainH(c.x, c.z) - 0.02, F2 = frame(c.x, c.z, c.rot), R2 = rng(Math.round(c.x * 31 + c.z * 7));
  c.y = y;
  c.reach = 5.4 * k;
  const B = (mat, lx, ly, lz, sx, sy, sz, o = {}) => {
    const [wx, wz] = F2.p(lx * k, lz * k);
    box(mat, wx, y + ly * k, wz, sx * k, sy * k, sz * k, { rot: c.rot + (o.r ?? 0), rx: o.rx, rz: o.rz, tile: o.tile ?? 1, collide: o.collide, walk: o.walk, cast: o.cast });
  };
  const Cy = (mat, lx, ly, lz, r0, h, o = {}) => {
    const [wx, wz] = F2.p(lx * k, lz * k);
    cyl(mat, wx, y + ly * k, wz, r0 * k, (o.r1 ?? r0) * k, h * k, { seg: o.seg ?? 10, rot: o.rot ?? 0 });
  };
  const S = (i, lx, ly, lz, r, w, h, o = {}) => {
    const [wx, wz] = F2.p(lx * k, lz * k);
    place(STENCIL.mat, stencilGeo(i, w * k, h * k), wx, y + ly * k, wz, [o.rx ?? 0, c.rot + r, 0], 1, { cast: false });
  };
  const W = 5, H2 = 2.9, D = 1.9, Z0 = -1.35, front = Z0 + D / 2, P = M.depotPaint, Pd = M.depotPaintDark;
  // бетонная площадка и поддоны-лаги под шкафом
  // площадка заглублена: на склоне не висит над землёй
  B(M.concrete, 0, -0.22, -0.25, 7.8, 0.8, 5.4, { tile: 3 });
  for (const lx of [-2.2, -0.7, 0.7, 2.2]) B(M.planksDark, lx, 0.24, Z0, 0.14, 0.12, D + 0.1, { tile: 0.8 });
  const y0 = 0.3;
  // корпус: задняя стенка, бока, дно, крыша со свесом и капельником, внутренняя перегородка и полки
  B(P, 0, y0 + H2 / 2, Z0 - D / 2 + 0.03, W, H2, 0.06, { tile: 1.4 });
  for (const e of [-1, 1]) {
    B(P, e * (W / 2 - 0.03), y0 + H2 / 2, Z0, 0.06, H2, D, { tile: 1.4 });
    // рёбра жёсткости на боковинах
    for (const fz of [-0.5, 0.1, 0.6]) B(Pd, e * (W / 2 + 0.01), y0 + H2 / 2, Z0 + fz, 0.03, H2 - 0.2, 0.06, { tile: 1 });
  }
  B(Pd, 0, y0 + 0.03, Z0, W, 0.06, D, { tile: 1.4 });
  B(P, 0, y0 + H2 + 0.05, Z0 + 0.02, W + 0.24, 0.1, D + 0.28, { tile: 1.4 });
  B(Pd, 0, y0 + H2 - 0.02, front + 0.13, W + 0.24, 0.12, 0.04, { tile: 1 });
  B(Pd, 0, y0 + H2 / 2, Z0, 0.05, H2 - 0.1, D - 0.1, { tile: 1.4 });
  for (const sy of [0.95, 1.85]) B(Pd, 0, y0 + sy, Z0 + 0.05, W - 0.14, 0.04, D - 0.25, { tile: 1.2 });
  // содержимое правой (открытой) половины: цинки и ящики на полках
  for (const [sy, n2] of [[0.06, 4], [0.97, 5], [1.87, 5]]) for (let i = 0; i < n2; i++) {
    const lx = 0.35 + i * (2.1 / n2) + 0.2, zz = Z0 + sr(-0.15, 0.2);
    if (R2() < 0.15) continue;
    if (sy < 0.5) ammoBox(B, S, lx, y0 + sy, zz, 0.46, 0.34, 0.8, sr(-0.05, 0.05), 4 + 4 * R2.int(0, 3));
    else B(M.olive, lx, y0 + sy + 0.13, zz, 0.36, 0.26, 0.5, { r: sr(-0.08, 0.08), tile: 0.6 });
  }
  // левая створка закрыта, правая распахнута наружу на ~105°
  const DW = W / 2 - 0.04, DH = H2 - 0.1, DT = 0.05, dz = front + DT / 2;
  // створка: петли на ребре hx2, полотно уходит в сторону du (+1 вправо, −1 влево), открыта наружу на угол ang.
  // at(u, w): точка на полотне (u — вдоль от петель, w — по наружной нормали)
  const door = (hx2, du, ang) => {
    const c2 = Math.cos(ang), s2 = Math.sin(ang), r = -ang * du;
    const at = (u, w) => [hx2 + du * c2 * u - du * s2 * w, dz + s2 * u + c2 * w];
    const mid = at(DW / 2, 0);
    B(P, mid[0], y0 + 0.05 + DH / 2, mid[1], DW, DH, DT, { r, tile: 1.4, collide: true, walk: false });
    // наружные филёнки и жалюзи-продухи вверху
    for (const [py, ph] of [[0.75, 1.1], [1.95, 0.9]]) {
      const q = at(DW / 2, DT / 2 + 0.012);
      B(Pd, q[0], y0 + py, q[1], DW - 0.3, ph, 0.02, { r, tile: 1 });
    }
    for (let i = 0; i < 5; i++) {
      const q = at(DW / 2, DT / 2 + 0.03);
      B(Pd, q[0], y0 + DH - 0.28 - i * 0.07, q[1], DW * 0.45, 0.012, 0.05, { r, rx: -0.6, tile: 1 });
    }
    // петли — три «кулака» на ребре створки
    for (const hy of [0.35, DH / 2, DH - 0.3]) Cy(M.steel, hx2, y0 + hy, dz + 0.03, 0.028, 0.16, { seg: 8 });
    // вертикальная ручка-штанга
    const hq = at(DW - 0.22, DT / 2 + 0.06);
    Cy(M.steel, hq[0], y0 + 1.25, hq[1], 0.018, 0.5, { seg: 8 });
    for (const hy of [1.02, 1.48]) {
      const hb = at(DW - 0.22, DT / 2 + 0.03);
      B(M.steel, hb[0], y0 + hy, hb[1], 0.03, 0.03, 0.06, { r, tile: 1 });
    }
    return { at, r };
  };
  const { at: atL } = door(-W / 2 + 0.02, 1, 0);
  const { at: atR, r: rR } = door(W / 2 - 0.02, -1, 1.83);
  // засов с навесным замком на закрытой створке (висит на одной проушине — склад вскрыт)
  const hq = atL(DW - 0.05, DT / 2 + 0.05);
  B(M.steel, hq[0], y0 + 1.25, hq[1], 0.2, 0.04, 0.03, { tile: 1 });
  B(M.dark, hq[0] + 0.02, y0 + 1.13, hq[1] + 0.01, 0.06, 0.08, 0.03, { rz: 0.3, tile: 1 });
  // трафареты: «БОЕПРИПАСЫ», номер склада, «ОГНЕОПАСНО», «НЕ КУРИТЬ», «ВХОД ЗАПРЕЩЁН», класс 1.1D, ответственный
  const sL = (u, h, i, w, hh) => {
    const q = atL(u, DT / 2 + 0.028);
    S(i, q[0], y0 + h, q[1], 0, w, hh);
  };
  sL(DW / 2, 2.0, 0, 2.1, 0.52);
  sL(DW / 2, 1.38, 13, 0.9, 0.5);
  sL(DW / 2, 0.72, 1, 1.4, 0.36);
  sL(DW / 2, 0.36, 18, 1.5, 0.3);
  S(3, 0, y0 + H2 + 0.05, front + 0.16, 0, 3.2, 0.2);
  for (const e of [-1, 1]) {
    S(e > 0 ? 2 : 19, e * (W / 2 + 0.03), y0 + 1.7, Z0 + 0.25, e * Math.PI / 2, 1.3, 0.34);
    S(15, e * (W / 2 + 0.03), y0 + 1.05, Z0 + 0.3, e * Math.PI / 2, 0.8, 0.2);
  }
  const qR = atR(DW / 2, DT / 2 + 0.028);
  S(0, qR[0], y0 + 2.0, qR[1], rR, 2.1, 0.52);
  const Col = (lx, ly, lz, sx, sy, sz, walk) => {
    const [wx, wz] = F2.p(lx * k, lz * k);
    addBox(wx, y + ly * k, wz, sx * k, sy * k, sz * k, c.rot, { walk });
  };
  addBox(...(() => {
    const [wx, wz] = F2.p(0, (Z0 - 0.04) * k);
    return [wx, y + (y0 + H2 / 2) * k, wz];
  })(), W * k, H2 * k, (D - 0.1) * k, c.rot, { walk: false });
  // штабель ящиков слева спереди: 2×2 в основании, выше — вразнобой
  for (let row = 0; row < 3; row++) for (let i = 0; i < (row === 2 ? 2 : 4); i++) {
    const lx = -3.2 + (i % 2) * 0.86 + sr(-0.03, 0.03), lz = 0.35 + Math.floor(i / 2) * 0.5, ry = sr(-0.04, 0.04) + (row === 2 ? 0.25 : 0);
    ammoBox(B, S, lx, 0.18 + row * 0.345, lz, 0.82, 0.33, 0.46, ry, [4, 6, 8, 11][R2.int(0, 3)]);
  }
  Col(-2.77, 0.18 + 0.52, 0.6, 1.72, 1.04, 0.98, true);
  // поддон справа: ящики с гранатами, один вскрыт
  B(M.planksDark, 2.9, 0.23, 1.1, 1.25, 0.1, 1.05, { tile: 0.8 });
  for (const e of [-0.45, 0, 0.45]) B(M.planks, 2.9, 0.3, 1.1 + e, 1.25, 0.03, 0.14, { tile: 0.8 });
  ammoBox(B, S, 2.62, 0.315, 0.86, 0.62, 0.3, 0.42, 0.02, 6);
  ammoBox(B, S, 3.2, 0.315, 0.86, 0.62, 0.3, 0.42, -0.03, 8);
  ammoBox(B, S, 2.9, 0.315, 1.36, 0.8, 0.3, 0.42, 0.04, 6, true);
  B(M.crate, 3.45, 0.47, 1.62, 0.8, 0.024, 0.42, { r: 0.5, rz: 0.35, tile: 0.7 });
  const gg = new THREE35.SphereGeometry(0.035 * k, 8, 6);
  for (let i = 0; i < 10; i++) {
    const [gx, gz] = F2.p((2.62 + (i % 5) * 0.14) * k, (1.28 + Math.floor(i / 5) * 0.16) * k);
    place(M.olive, gg, gx, y + 0.68 * k, gz, 0, [1, 1.35, 1]);
  }
  Col(2.9, 0.18 + 0.3, 1.1, 1.25, 0.62, 1.05, true);
  // цинки россыпью у двери и под открытой створкой
  for (let i = 0; i < 4; i++) B(M.olive, sr(0.6, 2.2), 0.18 + 0.13, sr(0, 0.8), 0.36, 0.26, 0.5, { r: sr(-0.6, 0.6), tile: 0.6 });
  // пожарный щит у левой боковины: красная доска, топор, багор, конусное ведро, огнетушитель
  B(M.planksDark, -3.35, 1.1, -1.1, 0.1, 2.2, 0.1, { tile: 1 });
  B(M.planksDark, -3.35, 1.1, -2.0, 0.1, 2.2, 0.1, { tile: 1 });
  B(M.fireRed, -3.3, 1.35, -1.55, 0.04, 1.2, 1.05, { tile: 1 });
  S(17, -3.27, 1.85, -1.55, -Math.PI / 2, 0.9, 0.22);
  B(M.planksDark, -3.26, 1.35, -1.25, 0.03, 0.03, 0.55, { rx: 0.6, tile: 1 });
  B(M.steel, -3.26, 1.52, -1.1, 0.03, 0.12, 0.16, { tile: 1 });
  B(M.steel, -3.26, 1.1, -1.9, 0.03, 0.03, 0.9, { tile: 1 });
  Cy(M.fireRed, -3.2, 0.95, -1.45, 0.09, 0.26, { r1: 0.02, seg: 10 });
  Cy(M.fireRed, -3.15, 0.45, -1.75, 0.08, 0.5, { seg: 12 });
  Cy(M.dark, -3.15, 0.74, -1.75, 0.03, 0.08, { seg: 8 });
  // химсвет на ящике: ночью по нему находят склад
  const [kx, kz] = F2.p(-2.9 * k, 0.5 * k);
  cyl(STENCIL.glow, kx, y + 1.27 * k, kz, 0.018, 0.018, 0.16, { seg: 6, rot: [0, 0, Math.PI / 2 - 0.2], cast: false });
  // бочка-печка у склада: караул греется
  if (k >= 1) {
    const [bx, bz] = F2.p(-3.9, 2.1);
    fireBarrel(bx, bz);
  }
}
function buildCrates() {
  STENCIL.mat = new THREE35.MeshStandardMaterial({ map: stencilAtlas(), transparent: true, alphaTest: 0.35, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
  STENCIL.glow = new THREE35.MeshBasicMaterial({ color: 12648280 });
  M.depotPaint = surf(rustMetal([56, 74, 46], 0), { rough: 0.62, metal: 0.25 });
  M.depotPaintDark = surf(rustMetal([46, 62, 38], 0.02, 256), { rough: 0.66, metal: 0.25 });
  M.fireRed = surf(rustMetal([150, 30, 24], 0.2, 256), { rough: 0.55, metal: 0.1 });
  for (const c of CRATES) buildDepot(c);
}
function flagClothTex(text, mirror, sub) {
  const W = 1024, H2 = 640, [c, x] = cv(W, H2);
  x.fillStyle = "#f1efe7";
  x.fillRect(0, 0, W, H2);
  grain(x, W, H2, 10);
  // складки и лёгкая грязь по краю
  for (let i = 0; i < 9; i++) {
    const gx = srnd() * W, g = x.createLinearGradient(gx - 40, 0, gx + 40, 0);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, "rgba(80,78,70,.07)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(gx - 40, 0, 80, H2);
  }
  const eg = x.createLinearGradient(0, H2, 0, H2 - 90);
  eg.addColorStop(0, "rgba(90,80,60,.28)");
  eg.addColorStop(1, "rgba(90,80,60,0)");
  x.fillStyle = eg;
  x.fillRect(0, H2 - 90, W, 90);
  x.save();
  if (mirror) {
    x.translate(W, 0);
    x.scale(-1, 1);
  }
  x.fillStyle = "#15181d";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = `bold ${text.length > 5 ? 190 : 260}px Georgia, 'Times New Roman', serif`;
  x.fillText(text, W / 2, H2 * 0.47);
  x.fillStyle = "#8f1f1a";
  x.fillRect(W * 0.18, H2 * 0.74, W * 0.64, 12);
  if (sub) {
    x.fillStyle = "#15181d";
    x.font = "600 44px Georgia, serif";
    x.fillText(sub, W / 2, H2 * 0.85);
  }
  x.restore();
  return tex(c);
}
function buildBigFlag() {
  const x = 0, z = 0, y = HG.fy + HG.HA + 0.18, H2 = 9;
  box(M.steel, x, y + 0.1, z, 0.7, 0.3, 0.7, { tile: 0.8, rot: HG.rot });
  cyl(M.steel, x, y + H2 / 2, z, 0.11, 0.07, H2, { seg: 12 });
  place(M.steel, new THREE35.SphereGeometry(0.14, 10, 8), x, y + H2 + 0.07, z, 0);
  addCircle(x, z, 0.16, y, y + H2);
  beam(M.rope, new THREE35.Vector3(x + 0.1, y + 1.2, z), new THREE35.Vector3(x + 0.1, y + H2 - 0.2, z), 8e-3, { seg: 3, cast: false });
  const front = new THREE35.MeshStandardMaterial({ map: flagClothTex("badVIno", false), side: THREE35.FrontSide, roughness: 0.9 });
  const back = new THREE35.MeshStandardMaterial({ map: flagClothTex("2026", true), side: THREE35.BackSide, roughness: 0.9 });
  const FW = 6.4, FH = 4, top = y + H2 - 0.3;
  const nx = Q.cloth + 6, ny = Math.round((Q.cloth + 6) * 0.62);
  const dir2 = [Math.cos(0.64), Math.sin(0.64)];
  const c = makeCloth({
    nx,
    ny,
    material: front,
    wind: 1.3,
    stiff: 6,
    drag: 0.982,
    place: (u, v) => new THREE35.Vector3(x + dir2[0] * u * FW, top - v * FH, z + dir2[1] * u * FW),
    pinFn: (i, j) => i === 0 && (j === 0 || j === ny - 1 || j % 2 === 0)
  });
  // обратная сторона — та же сетка ткани, свой материал с надписью «2026»
  const bm = new THREE35.Mesh(c.geo, back);
  bm.frustumCulled = false;
  bm.receiveShadow = true;
  scene.add(bm);
  FLAGS.push({ x, z, cloth: c });
}
var GRAF = { n: 0, mats: null, geo: null };
function graffitiTex(variant) {
  const [c, x] = cv(512, 200);
  x.clearRect(0, 0, 512, 200);
  const col = ["#141414", "#a8231c", "#e9e4d6"][variant % 3];
  x.save();
  x.translate(256, 96);
  x.rotate((variant - 1) * 0.06);
  x.font = "italic bold 112px 'Arial Black', Impact, sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.shadowColor = col;
  x.shadowBlur = 14;
  x.fillStyle = col;
  x.globalAlpha = 0.9;
  x.fillText("badVIno", 0, 0);
  x.shadowBlur = 0;
  x.globalAlpha = 0.75;
  // подтёки краски
  for (let i = 0; i < 9; i++) {
    const dx = sr(-200, 200), len = sr(12, 55);
    x.fillRect(dx, 34, 3, len);
    x.beginPath();
    x.arc(dx + 1.5, 34 + len, 3, 0, 7);
    x.fill();
  }
  x.restore();
  return tex(c);
}
function graffitiOn(o, name, lx, lz, fy, piece, P2) {
  const [u0, u1, y0, y1] = piece;
  if (o.__graf !== name || o.__grafDone || u1 - u0 < 1.05 || y1 - y0 < 0.95 || y0 > 0.05) return;
  o.__grafDone = true;
  if (!GRAF.mats) {
    GRAF.mats = [0, 1, 2].map((v) => new THREE35.MeshStandardMaterial({ map: graffitiTex(v), transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    GRAF.geo = new THREE35.PlaneGeometry(1, 0.39);
  }
  const nO = name === "front" ? [0, 1] : name === "back" ? [0, -1] : name === "left" ? [-1, 0] : [1, 0];
  const [gx, gz] = P2(lx + nO[0] * (WALL_T / 2 + 0.012), lz + nO[1] * (WALL_T / 2 + 0.012));
  const ang = o.rot + (name === "front" ? 0 : name === "back" ? Math.PI : name === "left" ? -Math.PI / 2 : Math.PI / 2);
  const w = Math.min(1.35, (u1 - u0) * 0.92);
  place(GRAF.mats[GRAF.n % 3], GRAF.geo, gx, fy + y0 + 0.62, gz, ang, [w, w, 1], { cast: false });
}
var LEAVES = { im: null, list: [], cap: 640 };
var _lq = new THREE35.Quaternion();
function leafBurst(x, y, z, n2, sp, dir2, spread = 1.2) {
  if (!LEAVES.im) return;
  n2 = Math.round(n2 * (0.5 + Q.fx * 0.5));
  for (let i = 0; i < n2; i++) {
    if (LEAVES.list.length >= LEAVES.cap) LEAVES.list.shift();
    const needle = sp !== "birch", k = srnd();
    const col = needle ? k < 0.25 ? [0.36, 0.25, 0.12] : [0.16 + k * 0.06, 0.24 + k * 0.08, 0.1] : k < 0.3 ? [0.62, 0.52, 0.18] : [0.32, 0.42, 0.14];
    LEAVES.list.push({
      p: new THREE35.Vector3(x + sr(-spread, spread), y + sr(-spread, spread) * 0.6, z + sr(-spread, spread)),
      v: new THREE35.Vector3((dir2?.x ?? 0) * sr(0, 2.2) + sr(-0.7, 0.7), sr(-0.2, 1.4), (dir2?.z ?? 0) * sr(0, 2.2) + sr(-0.7, 0.7)),
      r: [srnd() * TAU, srnd() * TAU, srnd() * TAU],
      w: [sr(-7, 7), sr(-5, 5), sr(-7, 7)],
      sx: needle ? 0.016 : sr(0.05, 0.075),
      sy: needle ? sr(0.08, 0.13) : sr(0.045, 0.07),
      fall: needle ? sr(1.6, 2.4) : sr(0.6, 1),
      life: sr(20, 34),
      col,
      ph: srnd() * 10,
      landed: false
    });
  }
}
var THREE40 = ctx.THREE;
var BGU40 = ctx.BGU;
function m2Model(lod) {
  // --- начало кода модели из пулимет.html ---
const V={add:(a,b)=>a.map((x,i)=>x+b[i]),sub:(a,b)=>a.map((x,i)=>x-b[i]),mul:(a,s)=>a.map(x=>x*s),dot:(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len:a=>Math.hypot(...a),norm:a=>{let l=Math.hypot(...a)||1;return a.map(x=>x/l)},mix:(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t)};
const M={id:()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),mul:(a,b)=>{let o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o},tr:(x=0,y=0,z=0)=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]),rx:a=>{let c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1])},ry:a=>{let c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1])},rz:a=>{let c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1])},point:(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]],dir:(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2],m[1]*p[0]+m[5]*p[1]+m[9]*p[2],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]],perspective:(f,a,n,fa)=>{let t=1/Math.tan(f/2),d=1/(n-fa);return new Float32Array([t/a,0,0,0,0,t,0,0,0,0,(fa+n)*d,-1,0,0,2*fa*n*d,0])},ortho:(l,r,b,t,n,f)=>new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,-2/(f-n),0,-(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1]),look:(e,t)=>{let z=V.norm(V.sub(e,t)),x=V.norm(V.cross([0,1,0],z)),y=V.cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-V.dot(x,e),-V.dot(y,e),-V.dot(z,e),1])}};
const compose=(...ms)=>ms.reduce((a,b)=>M.mul(a,b),M.id()),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));let seed=8317;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
class Geo{constructor(){this.v=[];this.i=[]}vertex(p,n,uv=[0,0]){this.v.push(...p,...n,...uv);return this.v.length/8-1}quad(a,b,c,d){this.i.push(a,b,c,a,c,d)}add(g,m=M.id()){let off=this.v.length/8;for(let k=0;k<g.v.length;k+=8)this.v.push(...M.point(m,g.v.slice(k,k+3)),...V.norm(M.dir(m,g.v.slice(k+3,k+6))),g.v[k+6],g.v[k+7]);this.i.push(...g.i.map(x=>x+off));return this}}
function box(w,h,d,r=.001){let g=new Geo(),hh=[w/2,h/2,d/2];r=Math.min(r,w/2,h/2,d/2);for(let [a,u,v,s]of[[0,1,2,1],[0,2,1,-1],[1,2,0,1],[1,0,2,-1],[2,0,1,1],[2,1,0,-1]]){let hu=hh[u],hv=hh[v],us=r?[-hu,-hu+r,hu-r,hu]:[-hu,hu],vs=r?[-hv,-hv+r,hv-r,hv]:[-hv,hv],base=g.v.length/8;for(let j=0;j<vs.length;j++)for(let i=0;i<us.length;i++){let p=[0,0,0],n=[0,0,0];p[a]=hh[a]*s;p[u]=us[i];p[v]=vs[j];n[a]=s;if(r){let q=p.map((x,k)=>clamp(x,-hh[k]+r,hh[k]-r));n=V.norm(V.sub(p,q));p=V.add(q,V.mul(n,r))}g.vertex(p,n,[i/(us.length-1),j/(vs.length-1)])}for(let j=0;j<vs.length-1;j++)for(let i=0;i<us.length-1;i++){let a=base+j*us.length+i;g.quad(a,a+1,a+1+us.length,a+us.length)}}return g}
function lathe(ps,n=20,start=0,span=Math.PI*2){let g=new Geo();for(let j=0;j<ps.length;j++){let [x,r]=ps[j],a=ps[Math.max(0,j-1)],b=ps[Math.min(ps.length-1,j+1)];for(let k=0;k<=n;k++){let t=start+k/n*span,c=Math.cos(t),s=Math.sin(t);g.vertex([x,r*c,r*s],V.norm([a[1]-b[1],(b[0]-a[0])*c,(b[0]-a[0])*s]),[k/n,j/(ps.length-1)])}}for(let j=0;j<ps.length-1;j++)for(let k=0;k<n;k++){let a=j*(n+1)+k;g.quad(a,a+n+1,a+n+2,a+1)}return g}
const cyl=(l,r,r2=r,n=20)=>lathe([[-l/2,0],[-l/2,r],[l/2,r2],[l/2,0]],n),tube=(l,r,ri,n=20)=>lathe([[-l/2,ri],[-l/2,r],[l/2,r],[l/2,ri],[-l/2,ri]],n);
function rod(a,b,r,n=10){let d=V.sub(b,a),x=V.norm(d),z=V.norm(V.cross(x,Math.abs(x[1])>.9?[0,0,1]:[0,1,0])),y=V.cross(z,x);return new Geo().add(cyl(V.len(d),r,r,n),new Float32Array([...x,0,...y,0,...z,0,...V.mix(a,b,.5),1]))}
function ring(r,w,n=20,s=5,start=0,span=Math.PI*2){let g=new Geo();for(let j=0;j<=n;j++)for(let k=0;k<=s;k++){let a=start+j/n*span,b=k/s*Math.PI*2,c=Math.cos(b),sn=Math.sin(b),ca=Math.cos(a),sa=Math.sin(a);g.vertex([w*sn,(r+w*c)*ca,(r+w*c)*sa],[sn,c*ca,c*sa])}for(let j=0;j<n;j++)for(let k=0;k<s;k++){let a=j*(s+1)+k;g.quad(a,a+s+1,a+s+2,a+1)}return g}
function plane(w,h){let g=new Geo;for(let[p,uv]of[[[-w/2,-h/2,0],[0,0]],[[w/2,-h/2,0],[1,0]],[[w/2,h/2,0],[1,1]],[[-w/2,h/2,0],[0,1]]])g.vertex(p,[0,0,1],uv);g.quad(0,1,2,3);return g}
function disk(r,n=16){let g=new Geo;g.vertex([0,0,0],[1,0,0],[.5,.5]);for(let i=0;i<=n;i++){let t=i/n*Math.PI*2;g.vertex([0,r*Math.cos(t),r*Math.sin(t)],[1,0,0],[.5+.5*Math.cos(t),.5+.5*Math.sin(t)])}for(let i=1;i<=n;i++)g.i.push(0,i,i+1);return g}
class Group{constructor(){this.parts=new Map;this.children=[];this.matrix=M.id()}add(mat,g,m=M.id()){if(!this.parts.has(mat))this.parts.set(mat,new Geo);this.parts.get(mat).add(g,m)}child(){let g=new Group;this.children.push(g);return g}upload(R){this.meshes=[...this.parts].map(([m,g])=>({m,g:R.upload(g)}));this.parts.clear();this.children.forEach(g=>g.upload(R))}}
function materials(R){let mat=(c,m,r,type=0)=>({c,m,r,type}),o={steel:mat([.31,.335,.35],.68,.59,1),edge:mat([.48,.50,.51],.96,.28,2),machine:mat([.38,.40,.415],.94,.34,2),barrel:mat([.31,.335,.35],.90,.41,13),dark:mat([.115,.125,.13],.68,.62,1),paint:mat([.30,.325,.235],.04,.67,3),paintDark:mat([.215,.24,.17],.04,.69,3),primer:mat([.36,.31,.225],0,.81,3),wood:mat([.345,.19,.095],0,.42,4),oilWood:mat([.205,.098,.045],0,.28,4),brass:mat([.72,.57,.30],.98,.30,5),copper:mat([.67,.37,.235],.99,.32,6),links:mat([.17,.19,.20],.82,.44,1),grease:mat([.105,.105,.083],.01,.27),soot:mat([.07,.073,.075],0,.98),dust:mat([.245,.23,.18],0,.93),white:mat([.67,.67,.565],0,.79),ground:mat([.20,.21,.22],0,.88,10)};
function label(key,w,h,fn){let c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);o[key]={...mat([1,1,1],key==='stamp'?.6:0,.66),tex:R.texture(c)}}
label('stamp',1024,384,(c,w,h)=>{c.fillStyle='#4b5051';c.fillRect(0,0,w,h);c.fillStyle='#252b2c';c.textAlign='center';c.font='bold 55px monospace';c.fillText('BROWNING MACHINE GUN',w/2,90);c.font='48px monospace';c.fillText('CAL .50 M2 — HB',w/2,166);c.font='38px monospace';c.fillText('No. 008317 • U.S. PROPERTY',w/2,247);c.lineWidth=3;c.strokeStyle='#303737';c.strokeRect(27,28,w-54,h-56);c.font='24px monospace';c.fillText('VISUAL REFERENCE / NON-SERVICE ASSET',w/2,316)});
label('canText',1024,512,(c,w,h)=>{c.fillStyle='#adb092';c.textAlign='center';c.font='bold 90px monospace';c.fillText('CAL .50 LINKED',w/2,140);c.font='52px monospace';c.fillText('LINKED AMMUNITION',w/2,242);c.font='38px monospace';c.fillText('LOT 0083 • STEEL LINKS',w/2,326);c.font='27px monospace';c.fillText('KEEP DRY / HANDLE WITH CARE',w/2,421);c.globalCompositeOperation='destination-out';for(let i=0;i<70;i++)c.fillRect(rand()*w,rand()*h,1+rand()*8,1+rand()*2)});
label('head',512,512,(c,w,h)=>{c.fillStyle='#8d7a50';c.fillRect(0,0,w,h);c.strokeStyle='#514532';c.lineWidth=9;for(let r of[202,86]){c.beginPath();c.arc(256,256,r,0,Math.PI*2);c.stroke()}c.fillStyle='#b4a276';c.beginPath();c.arc(256,256,72,0,Math.PI*2);c.fill();c.fillStyle='#493d2a';c.textAlign='center';c.textBaseline='middle';c.font='bold 51px monospace';c.fillText('L C',256,120);c.fillText('5 4',256,386);c.font='38px monospace';c.save();c.translate(120,255);c.rotate(-Math.PI/2);c.fillText('50',0,0);c.restore();c.save();c.translate(392,255);c.rotate(Math.PI/2);c.fillText('BMG',0,0);c.restore()});return o}
function modelBuild(R,m,lod=1){let seg=[24,20,14,10,7][lod],sm=[12,10,8,6,5][lod],rs=[12,10,8,7,6][lod],bev=lod<3?.0015:0;let root=new Group,yaw=root.child(),gun=yaw.child(),barrel=gun.child(),cover=gun.child(),bolt=gun.child(),handle=gun.child(),trigger=gun.child();
const B=(g,mat,s,p,rot=M.id(),r=bev)=>g.add(mat,box(...s,r),compose(M.tr(...p),rot)),C=(g,mat,l,r,p,rot=M.id(),r2=r,n=seg)=>g.add(mat,cyl(l,r,r2,n),compose(M.tr(...p),rot)),T=(g,mat,l,r,ri,p,rot=M.id())=>g.add(mat,tube(l,r,ri,seg),compose(M.tr(...p),rot)),D=(g,mat,a,b,r,n=sm)=>g.add(mat,rod(a,b,r,n)),O=(g,mat,r,w,p,rot=M.id(),n=seg)=>g.add(mat,ring(r,w,n,4),compose(M.tr(...p),rot));
const rivet=(g,p,side=1,r=.0048)=>{g.add(m.steel,lathe([[-.001,0],[-.001,r],[.001,r],[.003,r*.8],[.004,0]],sm),compose(M.tr(...p),M.ry(-side*Math.PI/2)));if(lod<2)C(g,m.edge,.00035,r*.4,[p[0],p[1],p[2]+side*.0037],M.ry(-side*Math.PI/2),r*.4,sm)};
B(gun,m.steel,[.442,.153,.137],[-.243,.137,0],M.id(),.003);B(gun,m.dark,[.423,.015,.142],[-.247,.060,0]);B(gun,m.machine,[.352,.008,.101],[-.258,.217,0]);B(gun,m.dark,[.306,.009,.074],[-.265,.215,0]);for(let z of[-.052,.052]){B(gun,m.edge,[.314,.006,.009],[-.266,.227,z]);B(gun,m.grease,[.259,.002,.002],[-.258,.231,z+.006],M.id(),0)}for(let side of[-1,1]){B(gun,m.steel,[.455,.011,.008],[-.245,.203,side*.070]);for(let i=0;i<8;i++){rivet(gun,[-.435+i*.054,.079,side*.070],side);if(i<7)rivet(gun,[-.428+i*.057,.19,side*.070],side)}B(gun,m.steel,[.024,.155,.011],[-.451,.138,side*.073]);}
B(gun,m.machine,[.169,.048,.002],[-.275,.144,.0705],M.id(),.0005);gun.add(m.stamp,plane(.158,.041),M.tr(-.275,.144,.072));for(let x of[-.355,-.195])for(let y of[.124,.164])rivet(gun,[x,y,.0725],1,.0018);
B(gun,m.dark,[.122,.055,.002],[-.243,.117,-.070],M.id(),.002);B(gun,m.soot,[.105,.041,.001],[-.243,.118,-.0713]);B(gun,m.edge,[.117,.003,.004],[-.243,.091,-.072]);B(gun,m.machine,[.019,.044,.004],[-.181,.117,-.072]);for(let i=0;i<(lod<2?9:4);i++)B(gun,i%3?m.machine:m.brass,[.013+rand()*.025,.0003,.0004],[-.21-rand()*.05,.092+rand()*.013,-.0741],M.id(),0);B(gun,m.dark,[.13,.001,.061],[-.275,.051,0],M.id(),0);
B(bolt,m.machine,[.105,.014,.045],[-.30,.211,0]);B(bolt,m.dark,[.032,.003,.012],[-.315,.219,0]);B(gun,m.dark,[.252,.014,.005],[-.286,.149,-.073]);B(gun,m.edge,[.249,.001,.001],[-.286,.157,-.076],M.id(),0);B(handle,m.machine,[.043,.022,.013],[-.337,.15,-.083]);C(handle,m.machine,.039,.006,[-.335,.15,-.106],M.ry(Math.PI/2));C(handle,m.steel,.033,.012,[-.335,.15,-.134],M.ry(Math.PI/2));if(lod<3)for(let i=0;i<18;i++){let a=i/18*Math.PI*2;D(handle,m.edge,[-.335+.0115*Math.cos(a),.15+.0115*Math.sin(a),-.146],[-.334+.0115*Math.cos(a+.09),.15+.0115*Math.sin(a+.09),-.121],.00035,4)}
cover.matrix=M.tr(-.066,.243,0);B(cover,m.steel,[.354,.025,.156],[-.171,0,0],M.id(),.0045);B(cover,m.steel,[.288,.009,.116],[-.18,.015,0],M.id(),.002);B(cover,m.dark,[.306,.003,.117],[-.178,-.015,0]);for(let z of[-.044,.044])B(cover,m.machine,[.241,.007,.008],[-.173,-.021,z]);B(cover,m.machine,[.095,.009,.098],[-.21,-.023,0]);if(lod<4){for(let i=0;i<11;i++)B(cover,m.edge,[.028,.006,.003],[-.228,-.03,-.045+i*.009],M.rz(.13),.0005);for(let z of[-.06,.06]){C(cover,m.grease,.064,.003,[-.17,-.015,z]);for(let x of[-.31,-.055]){C(cover,m.machine,.003,.0034,[x,.020,z],M.rz(Math.PI/2));B(cover,m.dark,[.0045,.0004,.0007],[x,.0217,z],M.id(),0)}}}for(let z of[-.075,-.031,.032,.076])C(gun,m.steel,.031,.014,[-.066,.243,z],M.ry(-Math.PI/2));C(gun,m.edge,.184,.004,[-.066,.243,0],M.ry(-Math.PI/2));B(cover,m.machine,[.023,.015,.053],[-.355,-.004,0]);B(cover,m.edge,[.006,.023,.060],[-.363,-.01,0]);B(gun,m.steel,[.123,.032,.018],[-.246,.204,.09]);B(gun,m.edge,[.134,.002,.035],[-.248,.22,.091]);B(gun,m.grease,[.031,.003,.05],[-.278,.221,.081]);C(gun,m.machine,.132,.004,[-.245,.226,.107]);
B(gun,m.steel,[.028,.187,.149],[-.474,.14,0]);for(let z of[-.097,.097]){B(gun,m.machine,[.068,.017,.026],[-.488,.219,z]);B(gun,m.machine,[.068,.017,.026],[-.488,.064,z]);D(gun,m.dark,[-.514,.065,z],[-.514,.218,z],.01);C(gun,m.wood,.117,.0165,[-.514,.142,z],M.rz(Math.PI/2));for(let y of[.079,.205])C(gun,m.oilWood,.012,.0167,[-.514,y,z],M.rz(Math.PI/2));for(let y of[.071,.212])C(gun,m.machine,.008,.0178,[-.514,y,z],M.rz(Math.PI/2));}B(trigger,m.machine,[.008,.034,.079],[-.498,.142,0],M.id(),.004);for(let z of[-.024,.024])B(trigger,m.edge,[.001,.018,.020],[-.503,.149,z],M.id(),.001);B(gun,m.machine,[.012,.018,.018],[-.486,.248,0]);
B(gun,m.dark,[.044,.016,.058],[-.411,.246,0]);for(let z of[-.019,.019])B(gun,m.machine,[.010,.050,.005],[-.414,.278,z]);B(gun,m.edge,[.009,.004,.042],[-.414,.299,0]);B(gun,m.machine,[.014,.007,.019],[-.414,.275,0]);if(lod<3)for(let i=0;i<5;i++)B(gun,m.white,[.0005,.0015,.008],[-.4195,.255+i*.008,.019],M.id(),0);B(gun,m.steel,[.04,.069,.03],[-.04,.24,0]);B(gun,m.edge,[.004,.038,.004],[-.034,.278,0]);for(let z of[-.017,.017])B(gun,m.steel,[.018,.04,.007],[-.034,.280,z],M.rx(z*4));
barrel.add(m.barrel,lathe([[-.028,0],[-.028,.032],[.024,.032],[.06,.030],[.17,.027],[.76,.0214],[1.072,.0185],[1.10,.019],[1.112,.019],[1.113,.011],[1.075,.011]],seg),M.tr(0,.155,0));for(let x of[-.006,.034,.078,.122,.166])T(barrel,m.steel,.012,.043,.029,[x,.155,0]);for(let j=0;j<4;j++)for(let k=0;k<10;k++){let a=.001+j*.043;barrel.add(m.steel,lathe([[a,.042],[a+.034,.042]],3,k*Math.PI*.2,.245),M.tr(0,.155,0))}T(barrel,m.machine,.014,.030,.026,[.183,.155,0]);barrel.add(m.steel,lathe([[1.083,.020],[1.087,.0245],[1.118,.0245],[1.125,.022],[1.125,.0115],[1.108,.0115]],seg),M.tr(0,.155,0));T(barrel,m.soot,.015,.0117,.0096,[1.117,.155,0]);C(barrel,m.soot,.001,.0097,[1.09,.155,0]);for(let k=0;k<8;k++){let a=k*Math.PI/4;B(barrel,m.soot,[.016,.0005,.006],[1.101,.155+Math.cos(a)*.0245,Math.sin(a)*.0245],M.rx(a),.0002)}T(gun,m.machine,.022,.029,.024,[.22,.155,0]);for(let x of[.16,.28])D(gun,m.machine,[x,.184,.018],[x,.267,.041],.006);C(gun,m.dark,.129,.0135,[.22,.270,.041]);for(let x of[.158,.282])T(gun,m.machine,.006,.015,.007,[x,.270,.041]);if(lod<3)for(let i=0;i<16;i++)T(gun,m.steel,.0018,.014,.012,[.17+i*.006,.270,.041]);
C(root,m.paint,.08,.070,[-.19,.402,0],M.rz(Math.PI/2));C(root,m.dark,.018,.074,[-.19,.452,0],M.rz(Math.PI/2));C(root,m.machine,.235,.025,[-.19,.571,0],M.rz(Math.PI/2));C(root,m.grease,.012,.027,[-.19,.683,0],M.rz(Math.PI/2));C(root,m.paint,.115,.042,[-.19,.678,0],M.rz(Math.PI/2));B(yaw,m.paint,[.108,.036,.194],[0,-.042,0]);for(let z of[-.087,.087]){B(yaw,m.paint,[.088,.135,.024],[0,.018,z],M.id(),.005);C(yaw,m.machine,.029,.024,[0,.075,z],M.ry(-Math.PI/2));}C(yaw,m.edge,.211,.011,[0,.075,0],M.ry(-Math.PI/2));O(yaw,m.machine,.016,.0016,[0,.075,.115],M.rz(Math.PI/2));let wire=[[0,.071,.128],[.02,.027,.13],[.045,-.01,.12],[.033,-.045,.112],[-.03,-.045,.106],[-.041,-.01,.102]];for(let i=1;i<wire.length;i++)D(yaw,m.machine,wire[i-1],wire[i],.00065,4);
let pivots=[[-.18,.411,0],[-.207,.40,.019],[-.207,.40,-.019]],ends=[[.66,.032,0],[-.93,.032,.60],[-.93,.032,-.60]],legs=[];for(let j=0;j<3;j++){let leg=root.child(),p=pivots[j],e=V.sub(ends[j],p),mid=V.mul(e,.59),join=V.mul(e,.62);leg.matrix=M.tr(...p);legs.push(leg);D(leg,m.paint,[0,0,0],mid,j===0?.032:.028,seg);D(leg,m.paintDark,V.mul(e,.54),e,.022,seg);D(leg,m.machine,mid,V.mix(mid,e,.035),.024,seg);D(leg,m.grease,V.mix(mid,e,.039),V.mix(mid,e,.052),.023,sm);B(leg,m.paint,[.106,.013,.10],V.add(e,[0,-.008,0]),M.ry(j===0?0:j===1?.25:-.25),.003);if(j===0)B(leg,m.paint,[.026,.041,.109],V.add(e,[.04,.008,0]),M.rz(-.28),.002);B(leg,m.primer,[.033,.0009,.019],V.add(e,[-.022,0,.028]),M.ry(.2),.001);B(leg,m.machine,[.02,.0011,.007],V.add(e,[-.026,.0002,.033]),M.ry(.24),0);C(leg,m.machine,.074,.0042,V.add(join,[0,.004,0]),M.ry(-Math.PI/2),.0042,sm);O(leg,m.machine,.009,.0012,V.add(join,[0,.004,.046]),M.id(),sm);if(lod<3){for(let k=0;k<6;k++)O(leg,m.machine,.0052,.001,V.add(join,[.004*Math.sin(k*.8),-.013-k*.009,.043]),k%2?M.ry(Math.PI/2):M.id(),sm);for(let k=0;k<4;k++){let a=V.add(V.mul(mid,.35+k*.085),[0,.024,.01]);D(leg,m.primer,a,V.add(a,V.mul(V.norm(e),.02)),.00045,4)}}}
B(root,m.paint,[.045,.039,.62],[-.535,.25,0]);for(let z of[-.315,.315])B(root,m.paint,[.066,.081,.04],[-.535,.235,z]);if(lod<3)for(let i=0;i<=24;i++)B(root,m.white,[i%4===0?.022:.013,.0005,.0012],[-.535,.270,-.286+i*.0238],M.id(),0);C(root,m.dark,.277,.017,[-.40,.478,0],M.rz(Math.PI/2));C(root,m.machine,.303,.0115,[-.40,.592,0],M.rz(Math.PI/2));if(lod<3){let prev;for(let i=0;i<200;i++){let a=i/200*Math.PI*44,p=[-.40+.0128*Math.cos(a),.435+i/200*.287,.0128*Math.sin(a)];if(prev)D(root,m.edge,prev,p,.00085,4);prev=p}}B(root,m.machine,[.048,.053,.055],[-.4,.714,0]);C(root,m.machine,.141,.009,[-.4,.723,0],M.ry(-Math.PI/2));B(root,m.paint,[.196,.026,.056],[-.449,.292,0],M.rz(.11));C(root,m.machine,.165,.006,[-.40,.48,.015],M.ry(-Math.PI/2));C(root,m.machine,.13,.005,[-.48,.297,.015],M.ry(-Math.PI/2));let wheel1=root.child(),wheel2=root.child();for(let[g,r]of[[wheel1,.044],[wheel2,.03]]){O(g,m.brass,r,.004,[0,0,0],M.ry(-Math.PI/2));C(g,m.brass,.018,.01,[0,0,0],M.ry(-Math.PI/2));for(let i=0;i<5;i++){let a=i*Math.PI*.4;D(g,m.brass,[.006*Math.cos(a),.006*Math.sin(a),0],[r*.94*Math.cos(a),r*.94*Math.sin(a),0],.0026)}C(g,m.machine,.019,.0033,[r*.72,.002,.012],M.ry(-Math.PI/2))}
let can=root.child();can.matrix=M.tr(-.475,.165,.515);for(let z of[-.097,.097])B(can,m.paint,[.31,.266,.004],[0,0,z],M.id(),.002);for(let x of[-.153,.153])B(can,m.paintDark,[.004,.266,.194],[x,0,0]);B(can,m.paintDark,[.306,.008,.194],[0,-.131,0]);for(let z of[-.098,.098])B(can,m.paint,[.323,.012,.010],[0,.133,z]);for(let x of[-.157,.157])B(can,m.paint,[.010,.012,.207],[x,.133,0]);can.add(m.canText,plane(.254,.126),M.tr(0,.008,.0995));B(can,m.dark,[.278,.016,.153],[0,-.07,0]);B(can,m.primer,[.037,.024,.001],[-.121,-.108,.1],M.rz(.2));B(can,m.machine,[.017,.009,.0014],[-.132,-.115,.1006],M.rz(.2),0);let lid=can.child();lid.matrix=compose(M.tr(0,.136,-.096),M.rx(-1.21),M.tr(0,0,.098));B(lid,m.paint,[.326,.011,.211],[0,0,0],M.id(),.003);B(lid,m.paintDark,[.297,.004,.174],[0,-.009,0]);for(let x of[-.06,.06])D(lid,m.machine,[x,.014,-.003],[x,.06,-.003],.004);D(lid,m.paint,[-.06,.06,-.003],[.06,.06,-.003],.005);C(can,m.machine,.175,.004,[0,.135,-.1]);B(can,m.paint,[.015,.056,.039],[.161,.087,0]);B(can,m.machine,[.003,.032,.026],[.170,.09,0]);for(let i=0;i<4;i++)B(can,m.edge,[.001,.001,.014],[.172,.078+i*.006,.001*i],M.id(),0);
if(lod<2)for(let p of ends)for(let i=0;i<6;i++)C(root,m.dust,.0018,.001+rand()*.001,V.add(p,[(rand()-.5)*.077,-.023,(rand()-.5)*.067]),M.rz(rand()*3),.0008,5);
let caseGeo=lathe([[-.053,0],[-.053,.010],[-.05,.010],[-.049,.0088],[-.046,.0094],[.023,.008],[.031,.0065],[.044,.0065]],rs),bullet=lathe([[.042,.00625],[.061,.00625],[.073,.0054],[.084,.0031],[.091,0]],rs),link=new Geo;for(let x of[-.03,.006])link.add(ring(.010,.0016,Math.max(7,rs),4,.1,Math.PI*1.7),M.tr(x,0,0));link.add(box(.025,.003,.007,0),M.tr(-.016,-.010,.011));link.add(box(.016,.003,.011,0),M.tr(.007,-.01,-.009));let head=new Geo().add(disk(.0093,rs),compose(M.tr(-.0534,0,0),M.ry(Math.PI))),spent=new Geo().add(caseGeo);for(let i=0;i<spent.v.length;i+=8)if(spent.v[i]>.03){let a=Math.atan2(spent.v[i+2],spent.v[i+1]),d=1-.08*Math.pow(Math.max(0,Math.cos(a+.3)),7);spent.v[i+1]*=d;spent.v[i+2]*=d}spent.add(tube(.009,.0065,.00555,rs),M.tr(.04,0,0));const mesh=(g,m)=>({g:R.upload(g),m});let belt=[mesh(caseGeo,m.brass),mesh(bullet,m.copper),mesh(link,m.links),mesh(head,m.head)],cases=[mesh(spent,m.brass),mesh(head,m.head),mesh(lathe([[.033,.0056],[.045,.0056]],rs),m.soot)],links=mesh(link,m.links);root.upload(R);return{root,yaw,gun,barrel,cover,bolt,handle,trigger,legs,pivots,wheel1,wheel2,belt,cases,links,floor:mesh(plane(100,100),m.ground),gm:M.id(),lod}}
// --- конец кода модели ---
  const R = { texture: (c) => c, upload: (g) => g };
  const mats = materials(R);
  const A = modelBuild(R, mats, lod);
  A.wheel1.matrix = M.tr(-0.4, 0.48, 0.08);
  A.wheel2.matrix = M.tr(-0.48, 0.297, 0.075);
  return { A, mats };
}
function gunMicro(mat, paint) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vGP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvGP = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 vGP;
float gh3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gh3(i), gh3(i + vec3(1,0,0)), f.x), mix(gh3(i + vec3(0,1,0)), gh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gh3(i + vec3(0,0,1)), gh3(i + vec3(1,0,1)), f.x), mix(gh3(i + vec3(0,1,1)), gh3(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
  float gFine = gn3(vGP * 260.0), gMid = gn3(vGP * 38.0 + 7.0), gBig = gn3(vGP * 7.0 + 3.0);
  float gWear = smoothstep(0.62, 0.8, gMid * 0.6 + gBig * 0.4);
  diffuseColor.rgb *= 0.86 + 0.2 * gFine;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * ${paint ? "vec3(1.35, 1.3, 1.2)" : "vec3(1.5)"}, gWear * ${paint ? "0.55" : "0.4"});
  diffuseColor.rgb *= 1.0 - 0.25 * smoothstep(0.55, 0.9, gn3(vGP * 16.0 + 11.0)) * (1.0 - gWear);`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor * (0.8 + 0.4 * gFine) - gWear * ${paint ? "0.25" : "0.18"} + 0.12 * smoothstep(0.5, 0.9, gBig), 0.12, 1.0);`)
      .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>
  ${paint ? "metalnessFactor = mix(metalnessFactor, 0.75, gWear * 0.6);" : ""}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
  { float e = 0.0012; vec3 q = vGP * 260.0;
    vec3 gg = vec3(gn3(q + vec3(e * 260.0, 0, 0)) - gFine, gn3(q + vec3(0, e * 260.0, 0)) - gFine, gn3(q + vec3(0, 0, e * 260.0)) - gFine);
    normal = normalize(normal - 0.35 * (mat3(viewMatrix) * gg)); }`);
  };
  mat.customProgramCacheKey = () => "gunMicro" + (paint ? 1 : 0);
}
function m2Proto(lod, hero = false) {
  const { A } = m2Model(lod);
  const lin = (c) => new THREE40.Color().setRGB(c[0], c[1], c[2], THREE40.LinearSRGBColorSpace);
  const buckets = [new Map(), new Map(), new Map()];
  const mul = (a, b) => new THREE40.Matrix4().fromArray(a).multiply(new THREE40.Matrix4().fromArray(b)).toArray();
  const walk = (g, mtx, level) => {
    for (const { m, g: geo } of g.meshes || []) {
      if (!geo.i.length) continue;
      const key = m.tex ? "tex:" + (m.tex.__id ??= Math.random()) : m.m > 0.5 ? "metal" : "paint";
      const B2 = buckets[level];
      if (!B2.has(key)) B2.set(key, { m, list: [] });
      B2.get(key).list.push({ geo, mtx: mtx.slice(), col: lin(m.c) });
    }
    for (const c of g.children) {
      const lv = c === A.yaw ? 1 : c === A.gun ? 2 : level;
      const cm = c === A.yaw ? new THREE40.Matrix4().identity().toArray() : c === A.gun ? new THREE40.Matrix4().makeTranslation(0.14, 0, 0).toArray() : mul(mtx, c.matrix);
      walk(c, cm, lv);
    }
  };
  walk(A.root, new THREE40.Matrix4().identity().toArray(), 0);
  const matCache = {};
  const makeMat = (key, m) => {
    if (matCache[key]) return matCache[key];
    let mat;
    if (m.tex) {
      const t = new THREE40.CanvasTexture(m.tex);
      t.colorSpace = THREE40.SRGBColorSpace;
      t.anisotropy = 4;
      mat = new THREE40.MeshStandardMaterial({ map: t, metalness: m.m * 0.6, roughness: m.r });
    } else if (key === "metal") mat = new THREE40.MeshStandardMaterial({ vertexColors: true, metalness: 0.62, roughness: 0.42 });
    else mat = new THREE40.MeshStandardMaterial({ vertexColors: true, metalness: 0.02, roughness: 0.74 });
    if (hero && !m.tex) gunMicro(mat, key !== "metal");
    return matCache[key] = mat;
  };
  const out = [[], [], []];
  buckets.forEach((B2, level) => {
    for (const [key, { m, list }] of B2) {
      const geos = list.map(({ geo, mtx, col }) => {
        const n2 = geo.v.length / 8, pos = new Float32Array(n2 * 3), nor = new Float32Array(n2 * 3), uv = new Float32Array(n2 * 2), cl = new Float32Array(n2 * 3);
        for (let i = 0; i < n2; i++) {
          pos.set(geo.v.slice(i * 8, i * 8 + 3), i * 3);
          nor.set(geo.v.slice(i * 8 + 3, i * 8 + 6), i * 3);
          uv.set(geo.v.slice(i * 8 + 6, i * 8 + 8), i * 2);
          cl[i * 3] = col.r;
          cl[i * 3 + 1] = col.g;
          cl[i * 3 + 2] = col.b;
        }
        const bg = new THREE40.BufferGeometry();
        bg.setAttribute("position", new THREE40.BufferAttribute(pos, 3));
        bg.setAttribute("normal", new THREE40.BufferAttribute(nor, 3));
        bg.setAttribute("uv", new THREE40.BufferAttribute(uv, 2));
        bg.setAttribute("color", new THREE40.BufferAttribute(cl, 3));
        bg.setIndex(geo.i.slice());
        bg.applyMatrix4(new THREE40.Matrix4().fromArray(mtx));
        return bg;
      });
      const merged = BGU40.mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      out[level].push({ geo: merged, mat: makeMat(key, m) });
    }
  });
  return out;
}
var MG = { nests: [], plan: [], protoN: null, protoF: null, cur: null, bags: null, bagN: 0, bagList: [], aim: 0, fire: false, lastShot: -9, towers: [] };
var MG_BELT = 100;
var MG_RESERVE = 300;
function mgTargetDir(x, z, tx, tz) {
  return Math.atan2(tx - x, tz - z);
}
function planMG() {
  for (const s of Object.values(SPAWNS)) {
    for (const side2 of [-1, 1]) {
      const tx = s.x + s.fx * 15 - s.fz * 10 * side2, tz = s.z + s.fz * 15 + s.fx * 10 * side2;
      const [x, z] = findSpot(tx, tz, 2.4, { pathPad: 0.6, trenchPad: 2 });
      MG.plan.push({ kind: "ground", x, z, face: mgTargetDir(x, z, 0, 0), name: "база " + s.name });
      keep(x, z, 3);
    }
  }
  // поле: два гнезда на насыпных высотках — смотрят на ангар и на деревню
  for (const [a, b, hh] of [[60, -34, 2.6], [62, 38, 2.6]]) {
    const [tx, tz] = vxz(a, b), [x, z] = findSpot(tx, tz, 6.5, { pathPad: 1, trenchPad: 3 });
    MOUNDS.push({ x, z, r: 9.5, top: 2.6, h: hh, base: baseH(x, z) });
    keep(x, z, 7.5);
    MG.plan.push({ kind: "ground", x, z, face: mgTargetDir(x, z, 0, 0), name: "высота у поля", hill: true });
  }
}
function buildMG() {
  MG.protoN = m2Proto(2);
  MG.protoF = m2Proto(4);
  MG.protoH = m2Proto(1, true);
  const club = HOUSES.find((h) => h.id === "club");
  if (club) MG.plan.push({ kind: "roof", house: club, face: mgTargetDir(club.x, club.z, 0, 0), name: "крыша клуба" });
  const R2 = rng(7707);
  for (const pl of MG.plan) (pl.kind === "roof" ? roofNest : pl.kind === "slab" ? slabNest : groundNest)(pl, R2);
  buildMGFar();
  buildBagMesh();
  buildTracers();
  buildCasings();
  console.info(`[mg] гнёзд: ${MG.nests.length}, мешков: ${MG.bagList.length}`);
}
var _mgZ = new THREE40.Matrix4().makeScale(0, 0, 0);
function buildMGFar() {
  const off = new THREE40.Matrix4().makeTranslation(-0.19, 0.73, 0), byMat = /* @__PURE__ */ new Map();
  MG.protoF.forEach((list, level) => {
    for (const { geo, mat } of list) {
      const g = geo.clone();
      if (level > 0) g.applyMatrix4(off);
      if (!byMat.has(mat)) byMat.set(mat, []);
      byMat.get(mat).push(g);
    }
  });
  MG.far = [];
  for (const [mat, geos] of byMat) {
    const g = BGU40.mergeGeometries(geos, false);
    if (!g) continue;
    const im = new THREE40.InstancedMesh(g, mat, MG.nests.length);
    im.castShadow = false;
    im.receiveShadow = true;
    im.name = "mgFar";
    for (let i = 0; i < MG.nests.length; i++) im.setMatrixAt(i, _mgZ);
    im.count = 0;
    scene.add(im);
    MG.far.push(im);
  }
  MG.nests.forEach((N, i) => N.farI = i);
}
/* v21: дальние пулемёты — плотная пачка: рисуются только включённые копии
   (count = их число), а не все гнёзда карты с нулевым масштабом */
function mgFarSet(N, on) {
  const L = MG.farOn || (MG.farOn = []), k = L.indexOf(N);
  if (on) {
    N.root.updateMatrixWorld(true);
    if (k < 0) L.push(N);
  } else if (k >= 0) L.splice(k, 1);
  else return;
  for (const im of MG.far) {
    for (let i = 0; i < L.length; i++) im.setMatrixAt(i, L[i].root.matrixWorld);
    im.count = L.length;
    im.instanceMatrix.needsUpdate = true;
    im.boundingSphere = null;
  }
}
function bagGeometry(sx = 6, sy = 2, sz = 4) {
  const g = new THREE40.BoxGeometry(0.5, 0.16, 0.3, sx, sy, sz), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(x / 0.25), az = Math.abs(z / 0.15), ay = Math.abs(y / 0.08);
    y *= 1 - 0.38 * Math.pow(ax, 3) - 0.3 * Math.pow(az, 3);
    x *= 1 - 0.1 * ay * ay;
    z *= 1 - 0.14 * ay * ay;
    if (y > 0) y -= 0.012 * Math.cos(x * 9) * (1 - ax);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
function nestBag(N, x, y, z, rot, row) {
  const b = { nest: N, i: MG.bagList.length, pos: new THREE40.Vector3(x, y, z), rot, row, hp: 1, alive: true, sup: [], tilt: [sr(-0.06, 0.06), sr(-0.05, 0.05)], leak: 0, col: null, tint: sr(0.82, 1.08) };
  b.col = addBox(x, y, z, 0.5, 0.17, 0.3, rot, { walk: true });
  b.col.nestBag = b;
  N.bags.push(b);
  MG.bagList.push(b);
  return b;
}
function bagRing(N, cx, cz, baseY, R3, rowsSide, rowsFront, gapH, gapW, face, R2) {
  const n2 = Math.round(TAU * R3 / 0.5), gapA = Math.PI / 2 - gapH, frontA = Math.PI / 2 - face;
  for (let r = 0; r < rowsSide; r++) {
    for (let i = 0; i < n2; i++) {
      const a = (i + (r % 2) * 0.5) / n2 * TAU;
      if (Math.abs((a - gapA + Math.PI * 3) % TAU - Math.PI) < gapW / 2) continue;
      const front = Math.abs((a - frontA + Math.PI * 3) % TAU - Math.PI) < 0.95;
      if (front && r >= rowsFront) continue;
      const x = cx + Math.cos(a) * R3, z = cz + Math.sin(a) * R3;
      const y = (baseY ?? hFast(x, z)) + 0.08 + r * 0.155;
      nestBag(N, x, y, z, -a - Math.PI / 2 + R2.range(-0.08, 0.08), r);
    }
  }
}
function linkBags(N) {
  for (const b of N.bags) {
    if (b.row === 0) continue;
    for (const c of N.bags) if (c.row === b.row - 1 && Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z) < 0.46) b.sup.push(c);
  }
}
function makeNest(pl, x, z, y, face) {
  const N = { ...pl, x, z, y, face, bags: [], hp: 1, dead: false, ammo: MG_BELT, reserve: MG_RESERVE, reload: 0, yaw: face, pitch: 0, heat: 0, kick: 0, flashT: 0 };
  const fx = Math.sin(face), fz = Math.cos(face);
  N.gx = x + fx * 0.35;
  N.gz = z + fz * 0.35;
  N.gy = y;
  N.root = new THREE40.Group();
  N.root.position.set(N.gx, N.gy, N.gz);
  N.root.rotation.y = face - Math.PI / 2;
  N.yawG = new THREE40.Group();
  N.yawG.position.set(-0.19, 0.73, 0);
  N.gunG = new THREE40.Group();
  N.yawG.add(N.gunG);
  N.root.add(N.yawG);
  N.lodMeshes = [[], [], []];
  // 2 — «геройская» детализация: только у пулемёта, за которым стоит игрок
  for (const [li, proto] of [[0, MG.protoN], [1, MG.protoF], [2, MG.protoH]]) {
    // дальняя детализация — общая пачка инстансов на все гнёзда (см. buildMGFar)
    if (li === 1) continue;
    proto.forEach((list, level) => {
      for (const { geo, mat } of list) {
        const m = new THREE40.Mesh(geo, mat);
        m.castShadow = true;
        m.receiveShadow = true;
        m.visible = li === 0;
        (level === 0 ? N.root : level === 1 ? N.yawG : N.gunG).add(m);
        N.lodMeshes[li].push(m);
      }
    });
  }
  N.lod = 0;
  scene.add(N.root);
  // корпус пулемёта ловит пули и мешает пройти сквозь станок
  N.col = addBox(N.gx + fx * 0.3, N.gy + 0.5, N.gz + fz * 0.3, 0.55, 1, 1.5, face, { walk: false });
  N.col.mgGun = N;
  // дульное пламя создаём заранее: его шейдер компилируется при загрузке, а не на первом выстреле
  makeFlash(N);
  MG.nests.push(N);
  return N;
}
function groundNest(pl, R2) {
  const { x, z, face } = pl, y = hFast(x, z);
  const N = makeNest(pl, x, z, y, face);
  bagRing(N, x, z, null, 1.85, 5, 3, face + Math.PI, 1.15, face, R2);
  linkBags(N);
  // пол из досок и ящики с лентами
  const fx = Math.sin(face), fz = Math.cos(face);
  box(M.planksDark, x - fx * 0.7, hFast(x - fx * 0.7, z - fz * 0.7) + 0.02, z - fz * 0.7, 1.4, 0.04, 1.1, { rot: face, tile: 1 });
  let pb = null;
  for (let i = 0; i < 3; i++) {
    const a = face + Math.PI + sr(-1.3, 1.3), r = sr(0.9, 1.4);
    let px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r, ry = R2() * TAU, gy = hFast(px, pz);
    if (i === 2 && pb) [px, pz, ry, gy] = [pb[0], pb[1], pb[2] + sr(-0.25, 0.25), pb[3]];
    box(M.olive, px, gy + 0.09 + (i === 2 ? 0.18 : 0), pz, 0.3, 0.18, 0.16, { rot: ry, tile: 1 });
    pb = [px, pz, ry, gy];
  }
  casings(x + fz * 0.4, z - fx * 0.4, 60, true, R2, 0.8, face);
}
function roofNest(pl, R2) {
  const h = pl.house, S = h.struct, c = Math.cos(h.rot), s = Math.sin(h.rot);
  const P2 = (lx, lz) => [h.x + lx * c + lz * s, h.z - lx * s + lz * c];
  const topY = h.top + 0.12, lx0 = h.w / 2 + 0.45 - 1.9, slope = Math.tan(h.pitch ?? 0.6);
  const [x, z] = P2(lx0, 0);
  const rafters = S.panels.filter((p) => p.kind === "roof" && p.lx !== void 0);
  beginStruct({ kind: "roofnest", name: pl.name, x, z, rot: h.rot, w: 3.6, d: 3.6, h: 1, fy: topY, fuel: 0.6 });
  const deck = panel("roof", { hp: 3, mode: "rigid", density: 500, sup: { list: rafters.filter((p) => Math.abs(p.lx - lx0) < 2.4), frac: 0.5 } });
  box(M.planksDark, x, topY, z, 3.8, 0.08, 3.8, { rot: h.rot, tile: 1.2 });
  addBox(x, topY - 0.02, z, 3.8, 0.14, 3.8, h.rot, { walk: true });
  for (const e of [-1, 1]) for (const f of [-1, 1]) {
    const [px, pz] = P2(lx0 + e * 1.7, f * 1.7);
    beam(M.planksDark, V(px, topY, pz), V(px, h.top - 1.7 * slope, pz), 0.06, { seg: 5 });
  }
  // лестница по наружной стороне фронтона, за свесом кровли
  const [lxw, lzw] = P2(h.w / 2 + 0.55, 0.6), lnx = c, lnz = -s;
  ladderGeo(M.planksDark, lxw, lzw, h.fy - 0.4, topY, s, c, 0.5);
  addBox(lxw, (h.fy - 0.4 + topY + 0.9) / 2, lzw, 0.08, topY - h.fy + 1.3, 0.56, h.rot, { walk: false });
  const [ex, ez] = P2(h.w / 2 - 0.5, 0.6);
  addLadder({ x: lxw, z: lzw, nx: lnx, nz: lnz, y0: h.fy - 0.4, y1: topY + 0.04, w: 0.5, exit: [ex, topY + 0.06, ez], metal: false });
  endStruct();
  const N = makeNest(pl, x, z, topY + 0.04, pl.face);
  N.deck = deck;
  deck.onKill = () => nestCollapse(N, null);
  bagRing(N, x, z, topY + 0.04, 1.55, 3, 2, Math.atan2(c, -s), 1.05, pl.face, R2);
  linkBags(N);
}
var BAG_GEO = null;
var _bm = new THREE40.Matrix4();
var _bq = new THREE40.Quaternion();
var _be = new THREE40.Euler();
var _bs = new THREE40.Vector3();
var _bc = new THREE40.Color();
function buildBagMesh() {
  BAG_GEO = bagGeometry();
  // дальше 35 м мешок — «подушка» из 3×1×2 сегментов: 176 → 44 треугольника, на таком расстоянии разницы не видно
  MG.bagLo = bagGeometry(3, 1, 2);
  // своя пачка мешков у каждого гнезда: тень и кадр отсекают дальние гнёзда целиком
  // (раньше все ~1200 мешков карты рисовались в каждом проходе тени)
  const byNest = /* @__PURE__ */ new Map();
  for (const b of MG.bagList) {
    if (!byNest.has(b.nest)) byNest.set(b.nest, []);
    byNest.get(b.nest).push(b);
  }
  for (const list of byNest.values()) {
    const im3 = new THREE40.InstancedMesh(BAG_GEO, M.sack, list.length);
    im3.castShadow = true;
    im3.receiveShadow = true;
    im3.name = "nestBags";
    list[0].nest.bagIM = im3;
    list.forEach((b, j) => {
      b.im = im3;
      b.j = j;
      writeBag(b);
      im3.setColorAt(j, _bc.setRGB(b.tint, b.tint * 0.97, b.tint * 0.88));
    });
    im3.instanceMatrix.needsUpdate = true;
    im3.computeBoundingSphere();
    scene.add(im3);
    MG.bags ??= im3;
  }
}
function writeBag(b) {
  if (!b.alive) _bm.makeScale(0, 0, 0).setPosition(b.pos);
  else {
    const k = 0.45 + 0.55 * b.hp;
    _be.set(b.tilt[0] * (2 - b.hp), b.rot, b.tilt[1] * (2 - b.hp), "YXZ");
    _bq.setFromEuler(_be);
    _bs.set(1 + (1 - b.hp) * 0.12, k, 1 + (1 - b.hp) * 0.18);
    _bm.compose(_v40.set(b.pos.x, b.pos.y - 0.08 * (1 - k), b.pos.z), _bq, _bs);
  }
  b.im.setMatrixAt(b.j, _bm);
  b.im.instanceMatrix.needsUpdate = true;
  b.im.boundingSphere = null;
}
var _v40 = new THREE40.Vector3();
var _v41 = new THREE40.Vector3();
var _v42 = new THREE40.Vector3();
var SAND = [0.62, 0.53, 0.37];
function sandBurst(p, dir2, n2 = 10, big = 1) {
  for (let i = 0; i < n2; i++) FX.dirt.spawn({ x: p.x, y: p.y, z: p.z, vx: -dir2.x * sr(0.5, 2.5) * big + sr(-0.8, 0.8), vy: sr(0.3, 2.4) * big, vz: -dir2.z * sr(0.5, 2.5) * big + sr(-0.8, 0.8), size: sr(0.015, 0.04), life: sr(0.8, 1.6), col: SAND, a: 0.95, grav: 9.8, floor: hFast(p.x, p.z) });
  for (let i = 0; i < 2 + big * 2; i++) FX.alpha.spawn({ x: p.x, y: p.y, z: p.z, vx: -dir2.x * 0.6 + sr(-0.3, 0.3), vy: sr(0.1, 0.5), vz: -dir2.z * 0.6 + sr(-0.3, 0.3), size: sr(0.2, 0.45) * big, grow: 0.9, life: sr(1, 2.2), col: [0.6, 0.54, 0.42], a: 0.35, drag: 2, windK: 0.6 });
}
var FALLING_BAGS = [];
function dropBag(b, vel) {
  if (!b.alive) return;
  b.alive = false;
  b.col.dead = true;
  removeStaticCollider(b.col);
  writeBag(b);
  for (const o of b.nest.bags) if (o.alive && o.sup.length && o.sup.every((q) => !q.alive)) FALLING_BAGS.push({ b: o, t: sr(0.05, 0.3), v: vel.clone().multiplyScalar(0.4) });
  if (!PHYS.ready) return;
  const mesh = new THREE40.Mesh(BAG_GEO, M.sack);
  const k = 0.45 + 0.55 * Math.max(0.2, b.hp);
  mesh.scale.set(1.05, k, 1.1);
  mesh.castShadow = true;
  scene.add(mesh);
  _be.set(0, b.rot, 0, "YXZ");
  const body = addBody({
    shape: "box", size: [0.48, 0.15 * k, 0.28], mass: 18 * k, pos: b.pos.clone(), quat: new THREE40.Quaternion().setFromEuler(_be),
    vel, ang: new THREE40.Vector3(sr(-1.5, 1.5), sr(-1, 1), sr(-1.5, 1.5)),
    life: sr(50, 80), friction: 1, restitution: 0.02, damp: [0.2, 0.6], float: 0, rad: 0.07,
    onDone: () => scene.remove(mesh),
    sync: (q, r, f) => { mesh.position.copy(q); mesh.quaternion.copy(r); if (f < 1) mesh.scale.setScalar(Math.max(0.01, f)); }
  });
  if (!body) scene.remove(mesh);
}
function nestCollapse(N, from, power = 5) {
  for (const b of N.bags) {
    if (!b.alive) continue;
    const d = from ? _v41.subVectors(b.pos, from) : _v41.set(sr(-1, 1), 0.3, sr(-1, 1));
    const L = Math.max(0.4, d.length());
    d.normalize();
    const v = d.multiplyScalar(from ? power * 2.2 / L : 1).add(_v42.set(sr(-0.6, 0.6), from ? sr(1, 3) / L : 0, sr(-0.6, 0.6)));
    b.hp = Math.min(b.hp, sr(0.3, 0.9));
    dropBag(b, v.clone());
    if (Math.random() < 0.4) sandBurst(b.pos, d.clone().negate(), 6, 1.4);
  }
  if (!N.dead) destroyGun(N, from || N.root.position.clone(), 4);
}
function destroyGun(N, from, force) {
  if (N.dead) return;
  N.dead = true;
  N.hp = 0;
  N.smoke = 14;
  if (MG.cur === N) mgDismount();
  // вдали пулемёт нарисован общим инстансом — для обломков нужна своя модель
  if (N.lod !== 0) {
    for (let li = 0; li < 3; li++) N.lodMeshes[li].forEach((m) => m.visible = li === 0);
    if (N.lod === 1) mgFarSet(N, false);
    N.lod = 0;
  }
  N.col.dead = true;
  removeStaticCollider(N.col);
  const wp = new THREE40.Vector3(), wq = new THREE40.Quaternion();
  N.root.updateMatrixWorld(true);
  N.yawG.getWorldPosition(wp);
  N.yawG.getWorldQuaternion(wq);
  const piece = new THREE40.Group();
  for (const m of N.yawG.children.concat(N.gunG.children)) if (m.isMesh && m.visible) {
    const c = m.clone();
    if (m.parent === N.gunG) c.applyMatrix4(new THREE40.Matrix4().makeRotationZ(N.gunG.rotation.z));
    piece.add(c);
  }
  N.yawG.visible = false;
  scene.add(piece);
  piece.position.copy(wp);
  piece.quaternion.copy(wq);
  const dir2 = new THREE40.Vector3().subVectors(wp, from);
  dir2.y = Math.max(0.4, dir2.y);
  dir2.normalize();
  const b = PHYS.ready ? addBody({
    shape: "box", size: [1.3, 0.3, 0.3], mass: 38, pos: wp.clone().add(new THREE40.Vector3(0, 0.15, 0)), quat: wq,
    vel: dir2.multiplyScalar(force), ang: new THREE40.Vector3(sr(-3, 3), sr(-2, 2), sr(-3, 3)), keep: true,
    friction: 0.8, restitution: 0.15, damp: [0.1, 0.3], rad: 0.12,
    sync: (q, r) => { piece.position.copy(q); piece.quaternion.copy(r); }
  }) : null;
  if (!b) {
    piece.position.y -= 0.5;
    piece.rotation.z += 0.8;
  }
  N.root.rotation.x = sr(0.5, 1.2) * (Math.random() < 0.5 ? -1 : 1);
  N.root.position.y -= 0.12;
  sparksAt(wp, dir2, 20);
  metalHitSound(camera.position.distanceTo(wp), 1.6);
  woodCrack(camera.position.distanceTo(wp), 0, 0.5);
  toast(`пулемёт уничтожен · ${N.name}`);
}
var sparksAt = function(){};
function mgDismount() {
  const N = MG.cur;
  if (!N) return;
  MG.cur = null;
  MG.fire = false;
  MG.ads = false;
  N.recP = N.recY = N.recZ = 0;
  poseGun(N);
  $("#cross").style.visibility = "";
  camera.fov = MG.fov0 || 72;
  camera.updateProjectionMatrix();
  PL.pos.set(N.gx - Math.sin(N.yaw) * 1.05, N.gy + 0.02, N.gz - Math.cos(N.yaw) * 1.05);
  PL.pitch = clamp(PL.pitch, -0.6, 0.6);
  PL.onGround = true;
}
function poseGun(N) {
  N.yawG.rotation.y = N.yaw - N.face + (N.recY || 0);
  N.gunG.rotation.z = N.pitch + N.kick * 0.6 + (N.recP || 0);
  N.gunG.position.x = -N.kick * 0.25 - (N.recZ || 0);
}
var _flashTex = null;
function flashTex() {
  if (_flashTex) return _flashTex;
  const [c, x] = cv(128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,250,230,1)");
  g.addColorStop(0.15, "rgba(255,210,120,0.9)");
  g.addColorStop(0.5, "rgba(255,120,30,0.25)");
  g.addColorStop(1, "rgba(255,80,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  x.globalCompositeOperation = "lighter";
  for (let i = 0; i < 7; i++) {
    x.save();
    x.translate(64, 64);
    x.rotate(i / 7 * TAU + 0.3);
    const gg = x.createLinearGradient(0, 0, 60, 0);
    gg.addColorStop(0, "rgba(255,230,160,0.9)");
    gg.addColorStop(1, "rgba(255,120,20,0)");
    x.fillStyle = gg;
    x.beginPath();
    x.moveTo(0, -5);
    x.lineTo(62, 0);
    x.lineTo(0, 5);
    x.fill();
    x.restore();
  }
  _flashTex = new THREE40.CanvasTexture(c);
  _flashTex.colorSpace = THREE40.SRGBColorSpace;
  return _flashTex;
}
var _flashMat = null;
function makeFlash(N) {
  const mat = _flashMat ??= new THREE40.MeshBasicMaterial({ map: flashTex(), color: new THREE40.Color(3, 2.2, 1.4), transparent: true, blending: THREE40.AdditiveBlending, depthWrite: false, side: THREE40.DoubleSide, toneMapped: false });
  const g = new THREE40.Group();
  const cross = new THREE40.Mesh(new THREE40.PlaneGeometry(0.42, 0.42).rotateY(Math.PI / 2), mat);
  g.add(cross);
  for (const r of [0, Math.PI / 2]) {
    const q = new THREE40.Mesh(new THREE40.PlaneGeometry(0.7, 0.26).rotateX(r), mat);
    q.position.x = 0.3;
    g.add(q);
  }
  g.position.set(1.28, 0.155, 0);
  g.visible = false;
  g.renderOrder = 8;
  N.gunG.add(g);
  N.flash = g;
}
var REED = { im: null, pts: null, grid: null, cut: null };
function indexReeds(im3, pts) {
  REED.im = im3;
  REED.pts = pts;
  REED.cut = new Uint8Array(pts.length);
  REED.grid = new Map();
  pts.forEach(([x, z], i) => {
    const k = Math.floor(x / 2) * 1e4 + Math.floor(z / 2);
    if (!REED.grid.has(k)) REED.grid.set(k, []);
    REED.grid.get(k).push(i);
  });
}
var TRC = { mesh: null, A: null, B: null, C: null, max: 160 };
function buildTracers() {
  const g = new THREE40.InstancedBufferGeometry();
  g.setAttribute("position", new THREE40.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  TRC.A = new Float32Array(TRC.max * 3);
  TRC.B = new Float32Array(TRC.max * 3);
  TRC.C = new Float32Array(TRC.max * 4);
  g.setAttribute("aA", new THREE40.InstancedBufferAttribute(TRC.A, 3).setUsage(THREE40.DynamicDrawUsage));
  g.setAttribute("aB", new THREE40.InstancedBufferAttribute(TRC.B, 3).setUsage(THREE40.DynamicDrawUsage));
  g.setAttribute("aC", new THREE40.InstancedBufferAttribute(TRC.C, 4).setUsage(THREE40.DynamicDrawUsage));
  g.instanceCount = 0;
  const m = new THREE40.ShaderMaterial({
    vertexShader: `attribute vec3 aA, aB; attribute vec4 aC; varying vec2 vQ; varying vec4 vC;
      void main(){
        vec3 p = mix(aA, aB, position.x);
        vec3 d = aB - aA; vec3 toCam = cameraPosition - p;
        vec3 side = normalize(cross(d, toCam) + 1e-5);
        float dist = length(toCam);
        // толщина растёт с расстоянием медленнее перспективы: вдали трассер остаётся виден линией
        float w = aC.w * mix(0.35, 1.0, position.x) * (1.0 + dist * 0.012);
        p += side * position.y * w;
        vQ = position.xy; vC = aC;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `varying vec2 vQ; varying vec4 vC;
      void main(){
        float core = exp(-vQ.y * vQ.y * 5.0);
        float along = smoothstep(0.0, 0.9, vQ.x);
        vec3 c = vC.rgb * core * (0.15 + along) + vec3(1.0, 0.95, 0.85) * pow(core, 6.0) * along * 1.5;
        gl_FragColor = vec4(c, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE40.AdditiveBlending, toneMapped: false
  });
  TRC.mesh = new THREE40.Mesh(g, m);
  TRC.mesh.frustumCulled = false;
  TRC.mesh.renderOrder = 9;
  scene.add(TRC.mesh);
}
var CAS = { im: null, list: [], max: 300, n: 0 };
function buildCasings() {
  const g = new THREE40.CylinderGeometry(0.0075, 0.01, 0.1, 7).rotateZ(Math.PI / 2);
  const m = new THREE40.MeshStandardMaterial({ color: 12163189, metalness: 0.85, roughness: 0.32 });
  CAS.im = new THREE40.InstancedMesh(g, m, CAS.max);
  CAS.im.count = 0;
  CAS.im.castShadow = false;
  CAS.im.frustumCulled = false;
  scene.add(CAS.im);
}
var _sv = new THREE40.Vector3();
function panOf(p) {
  if (!p) return 0;
  _sv.subVectors(p, camera.position).normalize();
  const r = _v42.set(1, 0, 0).applyQuaternion(camera.quaternion);
  return clamp(_sv.dot(r), -1, 1) * 0.8;
}
var impactSound = function(){};
var metalHitSound = function(){};
var SL = [];
var SLOP = { cur: null, zoom: 0, zoomHeld: false, fov0: 72 };
function releaseSearchlight() {
  if (!SLOP.cur) return;
  SLOP.cur = null;
  SLOP.zoomHeld = false;
  SLOP.zoom = 0;
  camera.fov = SLOP.fov0 || 72;
  camera.updateProjectionMatrix();
  PL.pitch = clamp(PL.pitch, -0.6, 0.6);
  PL.onGround = true;
}
var THREEH = ctx.THREE;
var HGX = { shafts: [], beacons: [], jib: null, hook: null, load: null, motes: null, t: 0, yaw: 0.9, swing: 0, swingV: 0, beaconMat: null, holes: [], skylights: [] };
var HGB = { x0: 18.6, x1: 27.4, z0: -9, z1: 9, h1: 3.3, h2: 6.6, t: 0.24 };
var HGC = { lx: -24, lz: 13, H: 30 };
var hgV = (x, y, z) => new THREEH.Vector3(x, y, z);
var hgAR = (lx) => HG.YC + Math.sqrt(Math.max(0, HG.R * HG.R - lx * lx));
function hgP(lx, y, lz) {
  const [x, z] = hgW(lx, lz);
  return hgV(x, HG.fy + y, z);
}
function hgBox(mat, lx, y, lz, sx, sy, sz, o = {}) {
  const [x, z] = hgW(lx, lz);
  box(mat, x, HG.fy + y, z, sx, sy, sz, { ...o, rot: HG.rot + (o.r ?? 0) });
}
function hgCol(lx, y, lz, sx, sy, sz, o = {}) {
  const [x, z] = hgW(lx, lz);
  return addBox(x, HG.fy + y, z, sx, sy, sz, HG.rot + (o.r ?? 0), { walk: o.walk });
}
function hgCyl(mat, lx, y, lz, r0, r1, h, o = {}) {
  const [x, z] = hgW(lx, lz);
  cyl(mat, x, HG.fy + y, z, r0, r1, h, o);
}
function hgBeam(mat, a, b, r, o = {}) {
  beam(mat, hgP(a[0], a[1], a[2]), hgP(b[0], b[1], b[2]), r, o);
}
function hgPut(mat, geo, lx, y, lz, opt = {}) {
  const [x, z] = hgW(lx, lz);
  place(mat, geo, x, HG.fy + y, z, opt.rot ?? HG.rot, opt.scale ?? 1, opt);
}
function hgChainTex() {
  const S = 128, [c, x] = cv(S);
  x.clearRect(0, 0, S, S);
  x.strokeStyle = "rgba(160,162,156,1)";
  x.lineWidth = 3.4;
  const n2 = 4, d = S / n2;
  for (let i = -n2; i <= 2 * n2; i++) {
    x.beginPath();
    x.moveTo(i * d, 0);
    x.lineTo(i * d + S, S);
    x.stroke();
    x.beginPath();
    x.moveTo(i * d, S);
    x.lineTo(i * d + S, 0);
    x.stroke();
  }
  x.globalCompositeOperation = "source-atop";
  for (let i = 0; i < 220; i++) {
    x.fillStyle = rgba(si(90, 140), si(50, 72), si(28, 40), sr(0.35, 0.85));
    x.fillRect(srnd() * S, srnd() * S, sr(2, 7), sr(2, 7));
  }
  x.globalCompositeOperation = "source-over";
  return tex(c);
}
function hgBrickTex() {
  const S = TS(512), [c, x] = cv(S), [h, hx2] = cv(S), K = S / 512;
  x.fillStyle = "#8d877c";
  x.fillRect(0, 0, S, S);
  hx2.fillStyle = "#3a3a3a";
  hx2.fillRect(0, 0, S, S);
  const rows = 12, cols = 4, rh = S / rows, cw = S / cols, m = 3 * K;
  for (let r = 0; r < rows; r++) for (let k = -1; k < cols; k++) {
    const x0 = k * cw + (r % 2 ? cw / 2 : 0), y0 = r * rh;
    const v = sr(0.78, 1.12), burnt = srnd() < 0.08;
    const col = burnt ? [86 * v, 50 * v, 38 * v] : [150 * v, 74 * v, 52 * v];
    x.fillStyle = rgba(...col);
    x.fillRect(x0 + m, y0 + m, cw - 2 * m, rh - 2 * m);
    for (let i = 0; i < 10; i++) blob(x, x0 + sr(0, cw), y0 + sr(0, rh), sr(4, 16) * K, [col[0] * 1.15, col[1] * 1.1, col[2] * 1.05], 0.25);
    hx2.fillStyle = rgba(170 + sr(-25, 25), 170, 170);
    hx2.fillRect(x0 + m, y0 + m, cw - 2 * m, rh - 2 * m);
  }
  for (let i = 0; i < 26; i++) blob(x, srnd() * S, srnd() * S, sr(20, 70) * K, [210, 205, 190], 0.18);
  for (let i = 0; i < 12; i++) {
    const px = srnd() * S, L = sr(60, 240) * K, g = x.createLinearGradient(0, 0, 0, L);
    g.addColorStop(0, "rgba(40,36,30,.35)");
    g.addColorStop(1, "rgba(40,36,30,0)");
    x.fillStyle = g;
    x.fillRect(px, 0, sr(6, 18) * K, L);
  }
  grain(x, S, S, 0.08);
  return { map: tex(c), normal: tex(heightToNormal(h, 2.2), 1, 1, false) };
}
function hgCorrTex(paint, o = {}) {
  const S = TS(512), [c, x] = cv(S), [h, hx2] = cv(S), K = S / 512, ribs = 10;
  x.fillStyle = rgba(...paint);
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 46; i++) {
    const px = srnd() * S, py = srnd() * S, r = sr(40, 150) * K, k = sr(0.86, 1.16);
    wrapDraw(x, S, S, () => blob(x, px, py, r, paint.map((v) => v * k), 0.32));
  }
  for (let i = 0; i < S; i++) {
    const v = Math.sin(i / S * ribs * TAU);
    x.fillStyle = v < 0 ? `rgba(20,20,18,${(-v * 0.16).toFixed(3)})` : `rgba(255,255,250,${(v * 0.05).toFixed(3)})`;
    x.fillRect(i, 0, 1, S);
  }
  for (let i = 0; i < (o.streaks ?? 70); i++) {
    const rib = Math.floor(srnd() * ribs), px = (rib + sr(0.15, 0.85)) / ribs * S, py = srnd() < 0.6 ? sr(0.03, 0.07) * S : srnd() * S * 0.9, L = sr(50, 260) * K;
    const rust = srnd() < (o.rust ?? 0.45), col = rust ? "118,60,28" : "36,34,28", a = sr(0.25, 0.55);
    const g = x.createLinearGradient(0, py, 0, py + L);
    g.addColorStop(0, `rgba(${col},${a.toFixed(2)})`);
    g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g;
    x.fillRect(px, py, sr(2, 7) * K, L);
  }
  for (let i = 0; i < (o.patches ?? 7); i++) {
    const px = srnd() * S, py = srnd() * S, r = sr(8, 36) * K;
    wrapDraw(x, S, S, () => {
      blob(x, px, py, r * 1.5, [130, 74, 38], 0.35);
      blob(x, px, py, r, [94, 50, 26], 0.65);
      blob(x, px, py, r * 0.45, [60, 34, 20], 0.7);
    });
  }
  for (let rib = 0; rib < ribs; rib++) for (const yy of [0.035, 0.965]) {
    x.fillStyle = "rgba(46,40,32,.85)";
    x.beginPath();
    x.arc((rib + 0.5) / ribs * S, yy * S, 2.4 * K, 0, 7);
    x.fill();
  }
  x.fillStyle = "rgba(30,28,24,.35)";
  x.fillRect(0, 0, S, 2 * K);
  grain(x, S, S, 0.05);
  for (let i = 0; i < S; i++) {
    const v = 128 + Math.sin(i / S * ribs * TAU) * 110;
    hx2.fillStyle = rgba(v, v, v);
    hx2.fillRect(i, 0, 1, S);
  }
  return { map: tex(c), normal: tex(heightToNormal(h, 4), 1, 1, false) };
}
function hgConcTex(base = [130, 128, 121], o = {}) {
  const S = TS(512), [c, x] = cv(S), [h, hx2] = cv(S), K = S / 512;
  x.fillStyle = rgba(...base);
  x.fillRect(0, 0, S, S);
  hx2.fillStyle = "#8c8c8c";
  hx2.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const px = srnd() * S, py = srnd() * S, r = sr(30, 130) * K, k = srnd() < 0.5 ? sr(1.05, 1.14) : sr(0.84, 0.95);
    wrapDraw(x, S, S, () => blob(x, px, py, r, base.map((v) => v * k), 0.3));
  }
  for (let i = 0; i < (o.stain ?? 14); i++) {
    const px = srnd() * S, py = srnd() * S, r = sr(18, 90) * K, a = sr(0.12, 0.32);
    wrapDraw(x, S, S, () => blob(x, px, py, r, [64, 62, 56], a));
  }
  for (let i = 0; i < (o.moss ?? 0); i++) {
    const px = srnd() * S, py = srnd() * S, r = sr(10, 40) * K;
    wrapDraw(x, S, S, () => blob(x, px, py, r, [70, 82, 46], 0.3));
  }
  for (let i = 0; i < 5200 * K * K; i++) {
    const v = si(80, 185);
    x.fillStyle = rgba(v, v * 0.985, v * 0.95, sr(0.12, 0.4));
    x.fillRect(srnd() * S, srnd() * S, K * sr(1, 2.4), K * sr(1, 2.4));
  }
  for (let i = 0; i < 1600 * K * K; i++) {
    const px = srnd() * S, py = srnd() * S, r = K * sr(0.8, 2);
    hx2.fillStyle = "rgba(30,30,30,.75)";
    hx2.fillRect(px, py, r, r);
    x.fillStyle = "rgba(58,56,52,.4)";
    x.fillRect(px, py, r, r);
  }
  for (let i = 0; i < (o.cracks ?? 5); i++) {
    let px = srnd() * S, py = srnd() * S, a = srnd() * TAU;
    x.strokeStyle = "rgba(38,36,32,.6)";
    hx2.strokeStyle = "rgba(20,20,20,.95)";
    x.lineWidth = hx2.lineWidth = sr(0.8, 1.6) * K;
    x.beginPath();
    hx2.beginPath();
    x.moveTo(px, py);
    hx2.moveTo(px, py);
    for (let k = 0; k < 14; k++) {
      a += sr(-0.7, 0.7);
      px += Math.cos(a) * sr(8, 26) * K;
      py += Math.sin(a) * sr(8, 26) * K;
      x.lineTo(px, py);
      hx2.lineTo(px, py);
    }
    x.stroke();
    hx2.stroke();
  }
  if (o.seams) for (let k = 0; k < 2; k++) {
    x.fillStyle = "rgba(48,46,42,.55)";
    x.fillRect(0, k * S / 2, S, 2.5 * K);
    x.fillRect(k * S / 2, 0, 2.5 * K, S);
    hx2.fillStyle = "rgba(20,20,20,1)";
    hx2.fillRect(0, k * S / 2, S, 2.5 * K);
    hx2.fillRect(k * S / 2, 0, 2.5 * K, S);
  }
  grain(x, S, S, 0.05);
  return { map: tex(c), normal: tex(heightToNormal(h, 1.5), 1, 1, false) };
}
function hgFloorTex() {
  const r = hgConcTex([118, 116, 110], { stain: 10, cracks: 7 }), cvs = r.map.image, x = cvs.getContext("2d"), S = cvs.width, K = S / 512;
  for (let i = 0; i < 9; i++) blob(x, srnd() * S, srnd() * S, sr(30, 110) * K, [36, 34, 30], sr(0.18, 0.42));
  for (let i = 0; i < 5; i++) blob(x, srnd() * S, srnd() * S, sr(14, 40) * K, [18, 16, 14], 0.5);
  x.strokeStyle = "rgba(40,38,34,.8)";
  x.lineWidth = 3 * K;
  x.strokeRect(1.5 * K, 1.5 * K, S - 3 * K, S - 3 * K);
  x.strokeStyle = "rgba(30,28,25,.35)";
  x.lineWidth = 1.2 * K;
  for (let i = 0; i < 6; i++) {
    x.beginPath();
    let px = srnd() * S, py = srnd() * S;
    x.moveTo(px, py);
    for (let k = 0; k < 8; k++) {
      px += sr(-30, 30) * K;
      py += sr(-30, 30) * K;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  r.map.needsUpdate = true;
  return r;
}
function hgHazardTex() {
  const [c, x] = cv(128);
  x.fillStyle = "#d9a91c";
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = "#1b1a17";
  for (let i = -2; i < 4; i++) {
    x.beginPath();
    x.moveTo(i * 64, 0);
    x.lineTo(i * 64 + 32, 0);
    x.lineTo(i * 64 + 160, 128);
    x.lineTo(i * 64 + 128, 128);
    x.fill();
  }
  for (let i = 0; i < 300; i++) {
    x.fillStyle = rgba(si(60, 110), si(46, 70), si(30, 40), sr(0.2, 0.7));
    x.fillRect(srnd() * 128, srnd() * 128, sr(1, 4), sr(1, 4));
  }
  return tex(c);
}
function hgTextTex(w, h, bg, draw) {
  const [c, x] = cv(w, h);
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  draw(x, w, h);
  for (let i = 0; i < w * h / 900; i++) {
    x.fillStyle = rgba(si(70, 120), si(56, 80), si(40, 52), sr(0.08, 0.35));
    x.fillRect(srnd() * w, srnd() * h, sr(1, 5), sr(1, 5));
  }
  return tex(c);
}
function hgMats() {
  M.hgSheet = surf(hgCorrTex([120, 124, 118], { streaks: 50, rust: 0.45, patches: 9 }), { rough: 0.56, metal: 0.42 });
  M.hgSheet2 = surf(hgCorrTex([160, 164, 160], { streaks: 18, rust: 0.2, patches: 1 }), { rough: 0.42, metal: 0.55 });
  M.hgSheetG = surf(hgCorrTex([74, 92, 70], { streaks: 60, rust: 0.5, patches: 6 }), { rough: 0.62, metal: 0.3 });
  M.hgWall = surf(hgCorrTex([104, 120, 98], { streaks: 70, rust: 0.4, patches: 6 }), { rough: 0.62, metal: 0.3 });
  M.hgRib = surf(rustMetal([70, 78, 82], 0.5, 256), { rough: 0.55, metal: 0.6 });
  M.hgPoly = std({ color: 14019799, transparent: true, opacity: 0.42, roughness: 0.35, metalness: 0, side: THREEH.DoubleSide, depthWrite: false, emissive: 2236448 });
  M.hgFloor = surf(hgFloorTex(), { rough: 0.9, nscale: 0.5 });
  M.hgApron = surf(hgConcTex([100, 99, 94], { stain: 26, cracks: 9, seams: true, moss: 6 }), { rough: 0.96, nscale: 0.8 });
  M.hgHazard = std({ map: hgHazardTex(), roughness: 0.7 });
  M.hgYellow = surf(rustMetal([196, 150, 38], 0.32, 256), { rough: 0.6, metal: 0.35 });
  M.hgPaintY = std({ color: 13151772, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 });
  M.hgPaintW = std({ color: 13883577, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
  M.hgOil = std({ color: 789000, transparent: true, opacity: 0.42, roughness: 0.25, metalness: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  M.hgChain = std({ map: hgChainTex(), transparent: true, alphaTest: 0.25, side: THREEH.DoubleSide, roughness: 0.55, metalness: 0.6, depthWrite: true });
  M.hgBrick = surf(hgBrickTex(), { rough: 0.95 });
  injectStructFX(M.hgBrick, true);
  M.hgConc = surf(hgConcTex([116, 114, 107], { stain: 16, cracks: 4, moss: 3 }), { rough: 0.95, nscale: 0.9 });
  M.hgCont1 = surf(corrugated([128, 52, 36], 0.6, 0.5), { rough: 0.65, metal: 0.4 });
  M.hgCont2 = surf(corrugated([40, 82, 120], 0.45, 0.5), { rough: 0.62, metal: 0.4 });
  M.hgCont3 = surf(corrugated([74, 96, 58], 0.5, 0.5), { rough: 0.62, metal: 0.4 });
  M.hgCabin = surf(corrugated([66, 104, 148], 0.35, 0.4), { rough: 0.6, metal: 0.35 });
  M.hgAn = surf(rustMetal([92, 110, 74], 0.14, 256), { rough: 0.55, metal: 0.3 });
  M.hgAnLight = surf(rustMetal([170, 174, 166], 0.1, 256), { rough: 0.45, metal: 0.5 });
  M.hgGlassDark = std({ color: 1253929, roughness: 0.1, metalness: 0.85 });
  M.hgExit = std({ color: 1067546, emissive: 2817840, emissiveIntensity: 1.8, roughness: 0.4 });
  M.hgRed = std({ color: 9441306, roughness: 0.5 });
  M.hgSignA = std({ map: hgTextTex(1024, 256, "#2c3a2c", (x, w, h) => {
    x.fillStyle = "#e6e0cc";
    x.font = "bold 150px 'Arial Black', Impact, sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText("АНГАР № 3", w / 2, h * 0.47);
    x.fillStyle = "#d9a91c";
    x.fillRect(40, h - 34, w - 80, 14);
  }), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
  M.hgSignB = std({ map: hgTextTex(1024, 512, "#e8e4d8", (x, w, h) => {
    x.fillStyle = "#a8231c";
    x.fillRect(0, 0, w, 120);
    x.fillStyle = "#f1ece0";
    x.font = "bold 92px 'Arial Black', Impact, sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText("СТРОЙКА-12", w / 2, 64);
    x.fillStyle = "#1d1d1d";
    x.font = "bold 46px Arial, sans-serif";
    x.fillText("ОБЪЕКТ В/Ч 41709 · СПЕЦМОНТАЖ", w / 2, 190);
    x.font = "38px Arial, sans-serif";
    x.fillText("Начало работ: май 1989", w / 2, 270);
    x.fillText("Окончание: IV квартал 1991", w / 2, 330);
    x.font = "bold 44px Arial, sans-serif";
    x.fillStyle = "#a8231c";
    x.fillText("ВХОД ПОСТОРОННИМ ЗАПРЕЩЁН", w / 2, 430);
  }), roughness: 0.85 });
  M.hgSignKPP = std({ map: hgTextTex(512, 256, "#e9e4d6", (x, w, h) => {
    x.fillStyle = "#a8231c";
    x.font = "bold 120px 'Arial Black', Impact, sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText("СТОЙ!", w / 2, 86);
    x.fillStyle = "#1d1d1d";
    x.font = "bold 40px Arial, sans-serif";
    x.fillText("ПРЕДЪЯВИ ПРОПУСК", w / 2, 190);
  }), roughness: 0.85 });
  M.hgStripe = std({ map: hgTextTex(256, 32, "#e9e4d6", (x, w, h) => {
    x.fillStyle = "#b02a1e";
    for (let i = 0; i < 8; i += 2) x.fillRect(i * 32, 0, 32, h);
  }), roughness: 0.6 });
  HGX.beaconMat = new THREEH.MeshBasicMaterial({ color: 16719904 });
}
function hgEndShape(x0, x1, y0, yTop, t) {
  const sh = new THREEH.Shape();
  sh.moveTo(x0, y0);
  sh.lineTo(x1, y0);
  sh.lineTo(x1, yTop(x1));
  const n2 = 4;
  for (let i = 1; i < n2; i++) {
    const xx = x1 + (x0 - x1) * i / n2;
    sh.lineTo(xx, yTop(xx));
  }
  sh.lineTo(x0, yTop(x0));
  sh.lineTo(x0, y0);
  const g = new THREEH.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -t / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.5, uv.getY(i) / 1.5);
  return g;
}
function hgHangar(R) {
  const W = HG.W, L = HG.L, HW = HG.HW, RR = HG.R, YC = HG.YC;
  const th0 = Math.atan2(HW - YC, W), NS = 28, dth = (Math.PI - 2 * th0) / NS, BAYS = 8, BL = 2 * L / BAYS;
  HG.th0 = th0;
  HG.dth = dth;
  HG.NS = NS;
  const S = beginStruct({ kind: "hangar", name: "ангар № 3", x: 0, z: 0, rot: HG.rot, w: 2 * W, d: 2 * L, h: HG.HA, fy: HG.fy, fuel: 0.12 });
  HG.struct = S;
  noPanel();
  // пол: бетонная плита с деформационными швами
  hgBox(M.hgFloor, 0, -0.17, 0, 2 * W + 1, 0.34, 2 * L + 1, { tile: 6, cast: false });
  // фундаментный цоколь по периметру
  for (const sx of [-1, 1]) hgBox(M.hgConc, sx * (W + 0.05), 0.05, 0, 0.5, 0.4, 2 * L + 0.6, { tile: 1.2 });
  // рёбра арки — постоянный каркас
  for (let i = 0; i <= BAYS; i++) {
    const lz = -L + i * BL, end = i === 0 || i === BAYS;
    for (const sx of [-1, 1]) {
      hgBox(M.hgRib, sx * (W - 0.16), HW / 2, lz, 0.24, HW, 0.32, { tile: 1 });
      hgBox(M.hgRib, sx * (W - 0.16), 0.12, lz, 0.5, 0.24, 0.5, { tile: 1 });
      hgCol(sx * (W - 0.16), HW / 2, lz, 0.26, HW, 0.34, { walk: false });
    }
    for (let j = 0; j < NS; j++) {
      const a = th0 + (j + 0.5) * dth, rr = RR - 0.22;
      hgBox(M.hgRib, rr * Math.cos(a), YC + rr * Math.sin(a), lz, rr * dth + 0.04, 0.36, end ? 0.3 : 0.22, { rz: a - Math.PI / 2, tile: 1 });
      // решётчатые раскосы внутреннего пояса
      if (!end && j % 2 === 0) {
        const r2 = RR - 0.75, b0 = th0 + j * dth, b1 = b0 + 2 * dth;
        hgBeam(M.hgRib, [r2 * Math.cos(b0), YC + r2 * Math.sin(b0), lz], [r2 * Math.cos(b1), YC + r2 * Math.sin(b1), lz], 0.05, { seg: 5, cast: false });
        hgBeam(M.hgRib, [r2 * Math.cos(b0), YC + r2 * Math.sin(b0), lz], [(RR - 0.3) * Math.cos(b0 + dth), YC + (RR - 0.3) * Math.sin(b0 + dth), lz], 0.035, { seg: 4, cast: false });
        hgBeam(M.hgRib, [r2 * Math.cos(b1), YC + r2 * Math.sin(b1), lz], [(RR - 0.3) * Math.cos(b0 + dth), YC + (RR - 0.3) * Math.sin(b0 + dth), lz], 0.035, { seg: 4, cast: false });
      }
    }
  }
  // прогоны вдоль ангара и ригели стен
  for (let j = 2; j < NS; j += 3) {
    const a = th0 + j * dth, rr = RR - 0.42;
    hgBox(M.hgRib, rr * Math.cos(a), YC + rr * Math.sin(a), 0, 0.14, 0.18, 2 * L, { rz: a - Math.PI / 2, tile: 1, cast: false });
  }
  for (const sx of [-1, 1]) for (const y of [1.3, 2.4, 3.6]) hgBox(M.hgRib, sx * (W - 0.12), y, 0, 0.1, 0.16, 2 * L, { tile: 1, cast: false });
  // крестовые связи в торцевых пролётах
  for (const e of [-1, 1]) for (const j of [6, 14, 21]) {
    const a0 = th0 + j * dth, a1 = a0 + 3 * dth, rr = RR - 0.3, z0 = e * L, z1 = e * (L - BL);
    hgBeam(M.steel, [rr * Math.cos(a0), YC + rr * Math.sin(a0), z0], [rr * Math.cos(a1), YC + rr * Math.sin(a1), z1], 0.025, { seg: 4, cast: false });
    hgBeam(M.steel, [rr * Math.cos(a1), YC + rr * Math.sin(a1), z0], [rr * Math.cos(a0), YC + rr * Math.sin(a0), z1], 0.025, { seg: 4, cast: false });
  }
  // кровля: по два листа в панели; световые полосы из поликарбоната, несколько листов сорвано
  const holes = new Set(["2:12", "2:13", "5:15", "6:8", "1:18", "3:20"]);
  const skyJ = new Set([9, 18]);
  for (let i = 0; i < BAYS; i++) {
    const lz = -L + (i + 0.5) * BL;
    for (let j = 0; j < NS; j += 2) {
      const pn = panel("roof", { hp: 1.3, mode: "rigid", density: 260, float: 0, burnable: false, mat: M.hgSheet });
      pn.metal = true;
      for (let k = j; k < Math.min(NS, j + 2); k++) {
        const a0 = th0 + k * dth, a1 = a0 + dth, am = (a0 + a1) / 2;
        const rr = RR + 0.02, ch = 2 * rr * Math.sin(dth / 2);
        const hole = holes.has(i + ":" + k);
        const sky = !hole && skyJ.has(k) && i % 3 !== 2;
        if (hole || sky) (sky ? HGX.skylights : HGX.holes).push({ lx: rr * Math.cos(am), y: YC + rr * Math.sin(am), lz, w: ch * Math.abs(Math.sin(am)) * 0.92, d: BL * 0.9, nx: Math.cos(am), ny: Math.sin(am) });
        if (hole) continue;
        const mat = sky ? M.hgPoly : R() < 0.1 ? M.hgSheet2 : R() < 0.06 ? M.hgSheetG : M.hgSheet;
        hgBox(mat, rr * Math.cos(am), YC + rr * Math.sin(am), lz, ch + 0.06, 0.035, BL + 0.1, { rz: am - Math.PI / 2, tile: 1.5, vertical: true, cast: !sky });
        const ax = RR * Math.cos(a0), ay = YC + RR * Math.sin(a0), bx = RR * Math.cos(a1), by = YC + RR * Math.sin(a1);
        hgCol((ax + bx) / 2, (ay + by) / 2, lz, Math.abs(bx - ax) + 0.1, Math.abs(by - ay) + 0.1, BL);
      }
    }
  }
  noPanel();
  // сорванный лист висит на одном крае
  {
    const a = th0 + 15.5 * dth, rr = RR - 0.1, lz = -L + 5.5 * BL;
    hgBox(M.hgSheet, rr * Math.cos(a) + 0.5, YC + rr * Math.sin(a) - 0.95, lz + 0.4, 1.4, 0.035, BL * 0.8, { rz: a - Math.PI / 2 + 1.05, r: 0.12, tile: 1.5, vertical: true });
  }
  // боковые стены: гофра по пролётам, полоса окон, двери
  for (const sx of [-1, 1]) for (let i = 0; i < BAYS; i++) {
    const z0 = -L + i * BL, z1 = z0 + BL, zc = (z0 + z1) / 2, X = sx * (W + 0.03);
    const door = sx > 0 && i === 2 || sx < 0 && i === 5;
    const win = !door && i % 2 === 1;
    const pn = panel("sheet", { hp: 1.6, mode: "rigid", density: 300, float: 0, burnable: false, mat: M.hgWall });
    pn.metal = true;
    const strip = (za, zb, ya, yb) => {
      if (zb - za < 0.05 || yb - ya < 0.05) return;
      hgBox(M.hgWall, X, (ya + yb) / 2, (za + zb) / 2, 0.05, yb - ya, zb - za, { tile: 1.5 });
      hgCol(sx * (W + 0.02), (ya + yb) / 2, (za + zb) / 2, 0.14, yb - ya, zb - za, { walk: false });
    };
    if (door) {
      const dz0 = zc - 0.55, dz1 = zc + 0.55;
      strip(z0, dz0, 0, HW);
      strip(dz1, z1, 0, HW);
      strip(dz0, dz1, 2.15, HW);
      noPanel();
      hgBox(M.hgRib, X + sx * 0.03, 2.2, zc, 0.08, 0.1, 1.3, { tile: 1 });
      for (const e of [-1, 1]) hgBox(M.hgRib, X + sx * 0.03, 1.08, zc + e * 0.6, 0.08, 2.16, 0.08, { tile: 1 });
      const [hx2, hz] = hgW(sx * (W + 0.06), dz0);
      addDoor({ hx: hx2, hz, y: HG.fy, closed: HG.rot - Math.PI / 2, openBy: sx * (i === 2 ? 1.25 : -0.5), w: 1.1, h: 2.12, t: 0.05, mat: M.hgCont3, startOpen: true });
      // табличка «ВЫХОД» над дверью внутри
      hgBox(M.hgExit, sx * (W - 0.08), 2.5, zc, 0.04, 0.2, 0.6, { tile: 1, cast: false });
    } else if (win) {
      strip(z0, z1, 0, 2.3);
      strip(z0, z1, 3.3, HW);
      noPanel();
      for (let k = 0; k < 4; k++) {
        const zz = z0 + (k + 0.5) * BL / 4;
        hgBox(M.hgRib, X, 2.8, z0 + k * BL / 4, 0.08, 1, 0.08, { tile: 1 });
        if (R() < 0.3) continue;
        const [px, pz] = hgW(X, zz);
        const [qx, qz] = hgW(X + sx, zz);
        addPane(px, HG.fy + 2.8, pz, [0, Math.atan2(qx - px, qz - pz), 0], BL / 4 - 0.12, 0.92);
      }
      hgBox(M.hgRib, X, 2.31, zc, 0.12, 0.06, BL, { tile: 1 });
      hgBox(M.hgRib, X, 3.29, zc, 0.12, 0.06, BL, { tile: 1 });
    } else strip(z0, z1, 0, HW);
  }
  noPanel();
  // торцы: проём ворот 16×8, гофра по контуру арки, вывеска
  const GW = 8, GH = 8;
  for (const e of [-1, 1]) {
    const Z = e * (L + 0.02);
    const pieces = [];
    for (let x0 = -W; x0 < W - 0.01; x0 += 1) pieces.push([x0, x0 + 1]);
    for (let p = 0; p < pieces.length; p += 2) {
      const pn = panel("sheet", { hp: 1.8, mode: "rigid", density: 300, float: 0, burnable: false, mat: M.hgWall });
      pn.metal = true;
      for (const [x0, x1] of pieces.slice(p, p + 2)) {
        const mid = (x0 + x1) / 2, inGate = Math.abs(mid) < GW;
        const y0 = inGate ? GH + 0.3 : 0;
        const g = hgEndShape(x0, x1, y0, (xx) => hgAR(xx) + 0.06, 0.05);
        hgPut(M.hgWall, g, 0, 0, Z);
        const top = Math.min(hgAR(x0), hgAR(x1));
        hgCol(mid, (y0 + top) / 2, Z, 1, top - y0, 0.14, { walk: false });
      }
    }
    noPanel();
    // рама ворот: стойки и ригель, «зебра»
    hgBox(M.hgRib, 0, GH + 0.15, Z, 2 * GW + 0.5, 0.36, 0.4, { tile: 1 });
    for (const s of [-1, 1]) {
      hgBox(M.hgHazard, s * (GW + 0.12), GH / 2, Z + e * 0.05, 0.3, GH, 0.36, { tile: 0.6 });
      hgCol(s * (GW + 0.12), GH / 2, Z, 0.3, GH, 0.4, { walk: false });
    }
    // вывеска на фронтоне
    const sg = new THREEH.PlaneGeometry(7.2, 1.8);
    hgPut(M.hgSignA, sg, 0, 10.4, Z + e * 0.05, { rot: HG.rot + (e > 0 ? 0 : Math.PI), cast: false });
    // красные лампы «габаритов» на коньке торца
    HGX.beacons.push(hgP(0, HG.HA + 0.2, Z));
  }
  endStruct();
  // откатные створки, рельсы и рубильник — в m/gates.js
  hgGates(R);
}
function hgAn2(lx0, lz0, R) {
  const parts = [];
  const pitch = 0.075, cp = Math.cos(pitch), sp = Math.sin(pitch);
  // локальная система самолёта: x — по размаху, y — вверх, z — к носу; поворот по тангажу вокруг x у основных колёс (z=2.6)
  const T = (x, y, z) => {
    const dz = z - 2.6, dy = y;
    return [x, dy * cp + dz * sp, dz * cp - dy * sp + 2.6];
  };
  const mBase = new THREEH.Matrix4();
  const putG = (mat, g, x, y, z, e = [0, 0, 0]) => {
    const [px, py, pz] = T(x, y, z);
    const m = new THREEH.Matrix4().compose(hgV(px, py, pz), new THREEH.Quaternion().setFromEuler(new THREEH.Euler(e[0] - pitch, e[1], e[2], "YXZ")), hgV(1, 1, 1));
    g.applyMatrix4(m);
    hgPut(mat, g, lx0, 0, lz0);
  };
  // фюзеляж
  const prof = [[0.12, -6.4], [0.34, -5.6], [0.6, -4], [0.82, -2], [0.92, 0], [0.96, 2.2], [0.93, 3.8], [0.86, 4.7], [0.8, 5.3]].map(([r, z]) => new THREEH.Vector2(r, z));
  const fus = new THREEH.LatheGeometry(prof, 18);
  fus.rotateX(Math.PI / 2);
  fus.scale(1, 1.12, 1);
  putG(M.hgAn, fus, 0, 1.75, 0);
  // капот двигателя, кок, винт
  putG(M.hgAnLight, new THREEH.CylinderGeometry(0.82, 0.8, 0.9, 18, 1, true), 0, 1.75, 5.65, [Math.PI / 2, 0, 0]);
  putG(M.dark, new THREEH.CircleGeometry(0.8, 18), 0, 1.75, 6.08, [0, 0, 0]);
  putG(M.hgAnLight, new THREEH.ConeGeometry(0.22, 0.5, 12), 0, 1.75, 6.35, [Math.PI / 2, 0, 0]);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + 0.4;
    const g = new THREEH.BoxGeometry(0.2, 1.75, 0.05);
    g.translate(0, 0.95, 0);
    putG(M.dark, g, 0, 1.75, 6.15, [0, 0, a]);
  }
  // кабина
  putG(M.hgGlassDark, new THREEH.BoxGeometry(1.2, 0.42, 1.1), 0, 2.72, 4.15, [-0.35, 0, 0]);
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) putG(M.hgGlassDark, new THREEH.PlaneGeometry(0.3, 0.32), s * 0.98, 1.95, 1.6 - k * 0.85, [0, s * Math.PI / 2, 0]);
  putG(M.dark, new THREEH.PlaneGeometry(0.75, 1.45), -0.985, 1.6, -2.4, [0, -Math.PI / 2, 0]);
  // крылья: верхнее 18 м, нижнее 14 м
  putG(M.hgAn, uvBox(new THREEH.BoxGeometry(18.2, 0.2, 2.4), 18.2, 0.2, 2.4, 1.5), 0, 3.55, 2.9);
  putG(M.hgAn, uvBox(new THREEH.BoxGeometry(14.2, 0.18, 2.2), 14.2, 0.18, 2.2, 1.5), 0, 1.05, 2.7);
  for (const s of [-1, 1]) {
    putG(M.hgRed, new THREEH.BoxGeometry(0.5, 0.21, 2.41), s * 8.85, 3.55, 2.9);
    // стойки бипланной коробки и расчалки
    for (const dz of [-0.6, 0.6]) {
      const [ax, ay, az] = T(s * 5.3, 1.1, 2.7 + dz), [bx, by, bz] = T(s * 5.6, 3.48, 2.9 + dz);
      beam(M.hgAnLight, hgP(...hgLW(lx0, lz0, ax, ay, az)), hgP(...hgLW(lx0, lz0, bx, by, bz)), 0.045, { seg: 6 });
    }
    for (const [a, b] of [[[s * 0.9, 1.0, 2.7], [s * 5.4, 3.5, 2.9]], [[s * 5.3, 1.1, 2.7], [s * 0.8, 2.6, 2.9]]]) {
      beam(M.steel, hgP(...hgLW(lx0, lz0, ...T(...a))), hgP(...hgLW(lx0, lz0, ...T(...b))), 0.012, { seg: 3, cast: false });
    }
    // стойки шасси и колёса
    const wheel = new THREEH.CylinderGeometry(0.46, 0.46, 0.3, 16);
    wheel.rotateZ(Math.PI / 2);
    putG(M.rubber ?? M.dark, wheel, s * 1.7, 0.46 - 0.0, 2.6);
    beam(M.hgAnLight, hgP(...hgLW(lx0, lz0, ...T(s * 1.7, 0.5, 2.6))), hgP(...hgLW(lx0, lz0, ...T(s * 0.6, 1.0, 2.5))), 0.06, { seg: 6 });
    beam(M.hgAnLight, hgP(...hgLW(lx0, lz0, ...T(s * 1.7, 0.5, 2.6))), hgP(...hgLW(lx0, lz0, ...T(s * 1.2, 1.05, 3.4))), 0.04, { seg: 6 });
  }
  // оперение: стабилизатор и киль со звездой
  putG(M.hgAn, uvBox(new THREEH.BoxGeometry(7.2, 0.1, 1.5), 7.2, 0.1, 1.5, 1.5), 0, 1.85, -5.5);
  const fin = new THREEH.Shape();
  fin.moveTo(-6.4, 1.8);
  fin.lineTo(-4.8, 1.9);
  fin.lineTo(-5.7, 4.2);
  fin.lineTo(-6.6, 4.3);
  fin.lineTo(-7.0, 2.2);
  fin.lineTo(-6.4, 1.8);
  const fg = new THREEH.ExtrudeGeometry(fin, { depth: 0.1, bevelEnabled: false });
  fg.translate(0, 0, -0.05);
  fg.rotateY(-Math.PI / 2);
  putG(M.hgAn, fg, 0, 0, 0);
  const star = new THREEH.Shape();
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 0.17 : 0.42;
    i ? star.lineTo(Math.cos(a) * r, -Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, -Math.sin(a) * r);
  }
  for (const s of [-1, 1]) putG(M.paintRed, new THREEH.ShapeGeometry(star), s * 0.06, 3.0, -6.0, [0, s * Math.PI / 2, 0]);
  const tw = new THREEH.CylinderGeometry(0.17, 0.17, 0.12, 12);
  tw.rotateZ(Math.PI / 2);
  putG(M.rubber ?? M.dark, tw, 0, 0.82, -6.0);
  beam(M.hgAnLight, hgP(...hgLW(lx0, lz0, ...T(0, 0.82, -6.0))), hgP(...hgLW(lx0, lz0, ...T(0, 1.45, -5.7))), 0.035, { seg: 5 });
  // коллизии: фюзеляж, крылья (на нижнее можно встать), хвост
  const fz = (z) => hgLW(lx0, lz0, ...T(0, 0, z));
  {
    const [x, , z] = fz(0);
    addBox(...hgW(x, z).flatMap((v, i) => i === 0 ? [v, HG.fy + 1.75] : [v]), 1.9, 2.1, 11.6, HG.rot, { walk: true }).car = "plane";
  }
  {
    const [x, , z] = fz(2.7);
    addBox(...hgW(x, z).flatMap((v, i) => i === 0 ? [v, HG.fy + 1.05] : [v]), 14.2, 0.24, 2.2, HG.rot, { walk: true }).car = "plane";
    addBox(...hgW(x, z).flatMap((v, i) => i === 0 ? [v, HG.fy + 3.75] : [v]), 18.2, 0.24, 2.4, HG.rot, { walk: true }).car = "plane";
  }
  {
    const [x, , z] = fz(-5.6);
    addBox(...hgW(x, z).flatMap((v, i) => i === 0 ? [v, HG.fy + 2.6] : [v]), 7.2, 1.6, 1.6, HG.rot, { walk: false }).car = "plane";
  }
}
var hgLW = (lx0, lz0, x, y, z) => [lx0 + x, y, lz0 + z];
function hgLamp(lx, lz, y, R, warm) {
  const top = hgAR(lx) - 0.35;
  hgBeam(M.steel, [lx, top, lz], [lx, y + 0.45, lz], 0.012, { seg: 3, cast: false });
  const shade = new THREEH.ConeGeometry(0.42, 0.45, 14, 1, true);
  hgPut(M.dark, shade, lx, y + 0.2, lz, { rot: 0 });
  hgCyl(M.dark, lx, y + 0.5, lz, 0.14, 0.14, 0.2, { seg: 8 });
  const lens = M.lampGlass.clone();
  hgPut(lens, new THREEH.CircleGeometry(0.36, 14), lx, y - 0.02, lz, { rot: [Math.PI / 2, 0, 0], cast: false });
  const p = hgP(lx, y - 0.1, lz);
  addLamp({ kind: "post", x: p.x, y: p.y, z: p.z, dir: hgV(0, -1, 0), lens, on: R() > 0.08, flick: R() < 0.2 ? 0.6 : 0, inside: true, hg: true, power: 70, range: 26, pool: 9, color: warm ? 16764810 : 14477567, ground: HG.fy });
}
function hgMezz(sgn, R) {
  // антресоль вдоль стены: настил на высоте 4.2 м, лестница, ограждение; под ней — конторка с окнами
  const x0 = sgn * 10.5, x1 = sgn * (HG.W - 0.3), z0 = sgn * 3, z1 = sgn * 21, Y = 4.2;
  const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
  hgBox(M.grate, xm, Y - 0.06, zm, dx, 0.08, dz, { tile: 0.6 });
  hgBox(M.hgRib, x0, Y - 0.22, zm, 0.16, 0.3, dz, { tile: 1 });
  hgCol(xm, Y - 0.1, zm, dx, 0.2, dz, { walk: true });
  for (let k = 0; k <= 4; k++) {
    const zz = z0 + (z1 - z0) * k / 4;
    hgBox(M.hgRib, x0, (Y - 0.2) / 2, zz, 0.2, Y - 0.2, 0.2, { tile: 1 });
    hgCol(x0, (Y - 0.2) / 2, zz, 0.22, Y - 0.2, 0.22, { walk: false });
    hgBox(M.hgRib, xm, Y - 0.3, zz, dx, 0.18, 0.12, { tile: 1, cast: false });
  }
  // перила по краю с проходом к лестнице
  const ladZ = z0 + sgn * 0.9;
  for (let k = 0; k <= 12; k++) {
    const zz = z0 + (z1 - z0) * k / 12;
    if (Math.abs(zz - ladZ) < 0.5) continue;
    hgBeam(M.hgYellow, [x0, Y, zz], [x0, Y + 1.05, zz], 0.025, { seg: 4, cast: false });
  }
  for (const yy of [0.55, 1.05]) {
    hgBeam(M.hgYellow, [x0, Y + yy, ladZ + sgn * 0.45], [x0, Y + yy, z1], 0.022, { seg: 4, cast: false });
    hgBeam(M.hgYellow, [x0, Y + yy, z1], [x1, Y + yy, z1], 0.022, { seg: 4, cast: false });
  }
  hgCol(x0, Y + 0.55, (ladZ + sgn * 0.45 + z1) / 2, 0.1, 1.1, Math.abs(z1 - ladZ) - 0.45, { walk: false });
  // стремянка с пола на антресоль
  const [lx2, lz2] = hgW(x0 - sgn * 0.12, ladZ), [tx, tz] = hgW(x0 - sgn * 0.12, ladZ + 1), [nx2, nz2] = hgW(x0 - sgn * 1.12, ladZ);
  ladderGeo(M.hgYellow, lx2, lz2, HG.fy, HG.fy + Y, tx - lx2, tz - lz2, 0.5);
  const [ex, ez] = hgW(x0 + sgn * 0.7, ladZ);
  addLadder({ x: lx2, z: lz2, nx: nx2 - lx2, nz: nz2 - lz2, y0: HG.fy, y1: HG.fy + Y, w: 0.5, exit: [ex, HG.fy + Y + 0.05, ez], metal: true });
  // конторка под антресолью
  const oz0 = sgn * 12, oz1 = sgn * 20.6, ox = x0 + sgn * 0.25, ozm = (oz0 + oz1) / 2, odz = Math.abs(oz1 - oz0);
  const [cx, cz] = hgW((ox + x1) / 2, ozm);
  beginStruct({ kind: "shed", name: "конторка", x: cx, z: cz, rot: HG.rot, w: Math.abs(x1 - ox), d: odz, h: 3, fy: HG.fy, fuel: 0.6 });
  for (const [a, b] of [[0, 0.95], [2.05, 3.0]]) {
    panel("wall", { hp: 1, mode: "shatter", mat: M.plaster, dims: { ...(() => { const [wx, wz] = hgW(ox, ozm); return { x: wx, z: wz }; })(), y: HG.fy + (a + b) / 2, sx: odz, sy: b - a, sz: 0.12, rot: HG.rot + Math.PI / 2 } });
    hgBox(M.plaster, ox, (a + b) / 2, ozm, 0.12, b - a, odz, { tile: 1.2 });
    hgCol(ox, (a + b) / 2, ozm, 0.12, b - a, odz, { walk: false });
  }
  noPanel();
  for (let k = 0; k < 4; k++) {
    const zz = oz0 + (oz1 - oz0) * (k + 0.5) / 4;
    hgBox(M.planksDark, ox, 1.5, oz0 + (oz1 - oz0) * k / 4, 0.14, 1.1, 0.1, { tile: 1 });
    if (k === 1) continue;
    const [px, pz] = hgW(ox - sgn * 0.01, zz), [qx, qz] = hgW(ox - sgn, zz);
    addPane(px, HG.fy + 1.5, pz, [0, Math.atan2(qx - px, qz - pz), 0], odz / 4 - 0.14, 1.0);
  }
  // дверь в торце конторки
  {
    const ez0 = oz0, xa = ox + sgn * 0.2, xb = x1;
    panel("wall", { hp: 1, mode: "shatter", mat: M.plaster, dims: { ...(() => { const [wx, wz] = hgW((xa + xb) / 2 + sgn * 0.5, ez0); return { x: wx, z: wz }; })(), y: HG.fy + 1.5, sx: Math.abs(xb - xa) - 1, sy: 3, sz: 0.12, rot: HG.rot } });
    hgBox(M.plaster, (xa + xb) / 2 + sgn * 0.5, 1.5, ez0, Math.abs(xb - xa) - 1, 3, 0.12, { tile: 1.2 });
    hgCol((xa + xb) / 2 + sgn * 0.5, 1.5, ez0, Math.abs(xb - xa) - 1, 3, 0.12, { walk: false });
    noPanel();
    const [hx2, hz] = hgW(xa, ez0);
    addDoor({ hx: hx2, hz, y: HG.fy, closed: HG.rot + (sgn > 0 ? 0 : Math.PI), openBy: -sgn * 1.2, w: 0.95, h: 2.05, t: 0.05, mat: M.planksPaint, startOpen: true });
  }
  endStruct();
  // свет в конторке и барахло на антресоли
  {
    const p = hgP((ox + x1) / 2, 2.7, ozm);
    addLamp({ kind: "bulb", x: p.x, y: p.y, z: p.z, inside: true, hg: true, flick: 0.3, ground: HG.fy });
    hgBox(M.planks, (ox + x1) / 2, 0.75, ozm + sgn * 1.2, 1.6, 0.06, 0.8, { tile: 1, collide: true });
    hgBox(M.olive, x1 - sgn * 0.4, 0.9, ozm - sgn * 2.2, 0.6, 1.8, 0.5, { tile: 1, collide: true });
  }
  for (let k = 0; k < 5; k++) {
    const zz = z0 + sgn * (6.5 + k * 1.3);
    hgBox(M.olive, x1 - sgn * 0.6, Y + 0.3 + (k % 2) * 0.6, zz, 1, 0.6 + (k % 2) * 0.6, 0.62, { tile: 1, collide: true, r: R.range(-0.08, 0.08) });
  }
}
function hgGantry(lz, R) {
  // мостовой кран: подкрановые балки вдоль стен, мост поперёк, таль с подвешенным двигателем
  const Y = 8.4;
  for (const sx of [-1, 1]) {
    hgBox(M.hgYellow, sx * 13.6, Y, 0, 0.32, 0.45, 2 * HG.L - 0.6, { tile: 1, cast: false });
    for (let i = 0; i <= 8; i++) {
      const zz = -HG.L + i * 6;
      if (Math.abs(zz) > HG.L - 0.2) continue;
      hgBox(M.hgRib, sx * 13.95, Y / 2, zz, 0.3, Y, 0.3, { tile: 1 });
      hgCol(sx * 13.95, Y / 2, zz, 0.3, Y, 0.3, { walk: false });
    }
  }
  hgBox(M.hgYellow, 0, Y + 0.6, lz, 27.4, 0.75, 0.5, { tile: 1 });
  hgBox(M.hgHazard, 0, Y + 0.6, lz + 0.26, 26, 0.7, 0.02, { tile: 0.8, cast: false });
  for (const sx of [-1, 1]) hgBox(M.hgYellow, sx * 13.6, Y + 0.45, lz, 0.6, 0.5, 2.6, { tile: 1 });
  const tx = 2.6;
  hgBox(M.dark, tx, Y + 0.05, lz, 1.2, 0.7, 0.9, { tile: 1 });
  hgBeam(M.steel, [tx, Y - 0.3, lz], [tx, 3.6, lz], 0.03, { seg: 4 });
  hgBox(M.hgYellow, tx, 3.45, lz, 0.4, 0.4, 0.25, { tile: 1 });
  hgBox(M.dark, tx, 2.45, lz, 1.4, 1.1, 0.95, { tile: 1, collide: true });
  hgBox(M.rust, tx + 0.3, 2.95, lz, 0.5, 0.25, 0.5, { tile: 1 });
  for (const s of [-1, 1]) hgBeam(M.steel, [tx, 3.3, lz], [tx + s * 0.6, 3.0, lz + s * 0.3], 0.012, { seg: 3, cast: false });
}
function hgInterior(R) {
  hgAn2(0, 0.5, R);
  hgMezz(1, R);
  hgMezz(-1, R);
  hgGantry(-9.5, R);
  // высокие светильники: 2 ряда по 4
  for (const lx of [-6, 6]) for (const lz of [-18, -6, 6, 18]) hgLamp(lx, lz, hgAR(lx) - 1.6, R, (lx > 0) === (lz > 0));
  // разметка: проезды, зебра у ворот, стоянка самолёта, пятна масла
  for (const sx of [-1, 1]) hgBox(M.hgPaintY, sx * 9.8, 0.006, 0, 0.14, 0.012, 2 * HG.L - 2.5, { tile: 1, cast: false });
  hgBox(M.hgPaintW, 0, 0.006, 13, 0.16, 0.012, 9, { tile: 1, cast: false });
  hgBox(M.hgPaintW, 0, 0.006, 8.4, 3.2, 0.012, 0.16, { tile: 1, cast: false });
  for (const e of [-1, 1]) {
    hgBox(M.hgHazard, 0, 0.007, e * (HG.L - 0.9), 15.6, 0.012, 1.2, { tile: 1.2, cast: false });
    for (const sx of [-1, 1]) hgBox(M.hgPaintY, sx * 3.2, 0.006, e * (HG.L - 6), 0.14, 0.012, 7, { tile: 1, cast: false });
  }
  const oil = new THREEH.CircleGeometry(1, 18);
  oil.rotateX(-Math.PI / 2);
  for (const [lx, lz, r] of [[0, 6.6, 1.3], [0.4, 5.2, 0.6], [6.5, -13.4, 1.2], [6.2, -17.6, 0.8], [-6.5, 15.5, 1], [-3, -2, 0.5], [11.8, -9, 0.9], [-11.6, 9.5, 0.9]]) hgPut(M.hgOil, oil.clone(), lx, 0.012, lz, { rot: R() * TAU, scale: [r * R.range(0.8, 1.3), 1, r], cast: false });
  // техника: грузовик и «буханка»
  {
    const [x, z] = hgW(6.6, -15);
    vehicle("truck", x, z, HG.rot + Math.PI, { seed: 41, paint: 3, tilt: 0.01 });
    const [vx, vz] = hgW(-6.6, 15.5);
    vehicle("van", vx, vz, HG.rot, { seed: 42, paint: 1, tilt: 0.01 });
  }
  // склад ящиков, бочки, покрышки, верстак — точечно-симметрично
  for (const sgn of [1, -1]) {
    const P = (lx, lz) => hgW(sgn * lx, sgn * lz);
    for (let k = 0; k < 7; k++) {
      const [x, z] = P(-12.6 + (k % 2) * 1.2, 6.5 + k * 1.9);
      crate(x, z, HG.rot + R.range(-0.2, 0.2), R, 1 + (k * 7 % 3));
    }
    for (let k = 0; k < 9; k++) {
      const [x, z] = P(-11 + (k % 3) * 0.66, 15.5 + Math.floor(k / 3) * 0.66);
      barrelStatic(x, z, R);
    }
    for (let k = 0; k < 4; k++) {
      const [x, z] = P(-13.6, -3 + k * 0.05);
      const tire = new THREEH.TorusGeometry(0.42, 0.16, 8, 16);
      tire.rotateX(Math.PI / 2);
      place(M.rubber ?? M.dark, tire, x, hFast(x, z) + 0.16 + k * 0.31, z, R() * TAU);
    }
    {
      const [x, z] = P(-13.6, -3);
      addCircle(x, z, 0.6, HG.fy, HG.fy + 1.3);
    }
    // верстак у стены
    {
      const wx = -14.2, wz = -7.5;
      hgBox(M.planksDark, sgn * wx, 0.9, sgn * wz, 0.9, 0.08, 3, { tile: 1, collide: true });
      for (const dz of [-1.4, 1.4]) for (const dx of [-0.38, 0.38]) hgBox(M.steel, sgn * (wx + dx), 0.45, sgn * (wz + dz), 0.05, 0.9, 0.05, { tile: 1 });
      hgBox(M.dark, sgn * wx, 1.0, sgn * (wz - 0.6), 0.25, 0.14, 0.4, { tile: 1 });
      hgBox(M.steelPipe, sgn * (wx + 0.3), 1.8, sgn * wz, 0.04, 1.2, 2.6, { tile: 1 });
      hgBox(M.paintRed, sgn * wx, 1.15, sgn * (wz + 1.1), 0.5, 0.4, 0.3, { tile: 1 });
    }
  }
  // бочка-печка у южных ворот, кресла вокруг
  {
    const [x, z] = hgW(5.5, -21.2);
    fireBarrel(x, z);
    for (const [dx, dz] of [[1.2, 0.3], [-0.5, 1.2], [-1.1, -0.6]]) {
      const [px, pz] = hgW(5.5 + dx, -21.2 + dz);
      box(M.olive, px, hFast(px, pz) + 0.22, pz, 0.5, 0.44, 0.5, { rot: HG.rot + Math.atan2(dx, dz), tile: 1, collide: true });
    }
  }
}
function hgChainGeo(L, H) {
  const g = new THREEH.PlaneGeometry(L, H), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 0.42, uv.getY(i) * H / 0.42);
  return g;
}
var hgGY = (lx, lz) => {
  const [x, z] = hgW(lx, lz);
  return terrainH(x, z) - HG.fy;
};
function hgFence(R) {
  const A = HG.a, B = HG.b, GATE = 5.2, H = 2.2;
  const runs = [[A, -B, A, B], [-A, B, -A, -B], [A, B, GATE, B], [-GATE, B, -A, B], [-A, -B, -GATE, -B], [GATE, -B, A, -B]];
  const breach = (lx, lz) => Math.abs(lx) > A - 0.5 && Math.abs(lz - Math.sign(lx) * 11.5) < 1.6 || Math.abs(lz) > B - 0.5 && Math.abs(lx + Math.sign(lz) * 19) < 1.6;
  const coil = new THREEH.TorusGeometry(0.27, 9e-3, 3, 10);
  for (const [ax, az, bx, bz] of runs) {
    const L = Math.hypot(bx - ax, bz - az), n2 = Math.max(1, Math.round(L / 3)), ux = (bx - ax) / L, uz = (bz - az) / L;
    const alongZ = Math.abs(uz) > 0.5, nx = alongZ ? Math.sign(ax) : 0, nz = alongZ ? 0 : Math.sign(az);
    const pr = HG.rot + (alongZ ? -Math.PI / 2 : 0);
    const [mx, mz] = hgW((ax + bx) / 2, (az + bz) / 2);
    beginStruct({ kind: "fence", name: "ограда", x: mx, z: mz, rot: pr, w: L, d: 0.4, h: 3, fy: HG.y, fuel: 0, quiet: true });
    const top = [];
    for (let k = 0; k <= n2; k++) {
      const t = k / n2 * L, px = ax + ux * t, pz = az + uz * t, gy = hgGY(px, pz);
      const lean = R.range(-0.03, 0.03);
      top.push({ px, pz, gy });
      noPanel();
      hgBox(M.hgConc, px, gy + 1.2, pz, 0.15, 2.75, 0.15, { tile: 0.8, rx: alongZ ? 0 : lean, rz: alongZ ? lean : 0 });
      hgBox(M.hgConc, px, gy + 0.1, pz, 0.32, 0.3, 0.32, { tile: 0.8, cast: false });
      const [wx, wz] = hgW(px, pz);
      addCircle(wx, wz, 0.1, HG.fy + gy, HG.fy + gy + 2.7);
      hgBeam(M.steel, [px, gy + 2.5, pz], [px + nx * 0.48, gy + 2.98, pz + nz * 0.48], 0.022, { seg: 4, cast: false });
      if (k === n2) break;
      const t1 = (k + 1) / n2 * L, tm = (t + t1) / 2, sl = t1 - t, cx = ax + ux * tm, cz = az + uz * tm, cgy = hgGY(cx, cz);
      const gone = breach(cx, cz);
      const pn = panel("wall", { hp: 0.9, mode: "rigid", density: 90, float: 0, burnable: false });
      pn.metal = true;
      if (gone) {
        // прорезанный лаз: сетка отогнута клапаном
        hgPut(M.hgChain, hgChainGeo(sl * 0.45, H * 0.8), cx - ux * sl * 0.28 + nx * 0.35, cgy + H * 0.45, cz - uz * sl * 0.28 + nz * 0.35, { rot: pr + 0.75, cast: false });
        hgPut(M.hgChain, hgChainGeo(sl - 0.12, 0.5), cx, cgy + H - 0.15, cz, { rot: pr, cast: false });
      } else {
        hgPut(M.hgChain, hgChainGeo(sl - 0.1, H), cx, cgy + 0.12 + H / 2, cz, { rot: pr, cast: false });
        const c2 = hgCol(cx, cgy + 1.25, cz, alongZ ? 0.08 : sl - 0.1, 2.5, alongZ ? sl - 0.1 : 0.08, { walk: false });
        c2.pass = true;
      }
      for (const y of [0.14, H + 0.1]) hgBeam(M.steel, [ax + ux * t, cgy + y, az + uz * t], [ax + ux * t1, cgy + y, az + uz * t1], 0.012, { seg: 3, cast: false });
      // колючка по козырьку и спираль
      for (const f of [0.35, 0.7, 1]) hgBeam(M.wire, [ax + ux * t + nx * 0.48 * f, top[k].gy + 2.5 + 0.48 * f, az + uz * t + nz * 0.48 * f], [ax + ux * t1 + nx * 0.48 * f, cgy + 2.5 + 0.48 * f, az + uz * t1 + nz * 0.48 * f], 7e-3, { seg: 3, cast: false });
      for (let s = 0.15; s < sl; s += 0.32) {
        const qx = ax + ux * (t + s), qz = az + uz * (t + s);
        hgPut(M.wire, coil.clone(), qx + nx * 0.2, cgy + 2.86, qz + nz * 0.2, { rot: [R.range(-0.25, 0.25), pr + Math.PI / 2 + R.range(-0.2, 0.2), 0], cast: false });
      }
    }
    endStruct();
  }
  // ворота: усиленные столбы, откатная створка из рабицы, шлагбаум снаружи
  for (const e of [-1, 1]) {
    const Z = e * B;
    for (const s of [-1, 1]) {
      const gy = hgGY(s * GATE, Z);
      hgBox(M.hgStripe, s * (GATE + 0.12), gy + 1.4, Z, 0.32, 2.8, 0.32, { tile: 0.7 });
      hgCol(s * (GATE + 0.12), gy + 1.4, Z, 0.34, 2.8, 0.34, { walk: false });
    }
    const lx0 = e * (GATE + 0.3), lx1 = e * (GATE + 5.6), gz = Z - e * 0.4, gy = hgGY((lx0 + lx1) / 2, gz);
    for (const y of [0.2, 2.3]) hgBeam(M.steelPipe, [lx0, gy + y, gz], [lx1, gy + y, gz], 0.03, { seg: 6 });
    for (const xx of [lx0, (lx0 + lx1) / 2, lx1]) hgBeam(M.steelPipe, [xx, gy + 0.2, gz], [xx, gy + 2.3, gz], 0.03, { seg: 6 });
    hgPut(M.hgChain, hgChainGeo(5.2, 2.05), (lx0 + lx1) / 2, gy + 1.25, gz, { rot: HG.rot, cast: false });
    for (const xx of [lx0 + e * 0.3, lx1 - e * 0.3]) hgCyl(M.dark, xx, gy + 0.1, gz, 0.1, 0.1, 0.06, { seg: 10, rot: [0, HG.rot, Math.PI / 2] });
    // шлагбаум: на северных воротах поднят, на южных опущен
    const bx = -e * 6.2, bz = Z + e * 2.6, by = hgGY(bx, bz);
    hgBox(M.hgStripe, bx, by + 0.6, bz, 0.26, 1.2, 0.26, { tile: 0.6, collide: true });
    hgBox(M.dark, bx, by + 1.05, bz, 0.5, 0.4, 0.4, { tile: 1 });
    if (e > 0) hgBeam(M.hgStripe, [bx, by + 1.15, bz], [bx + 1.6, by + 6.6, bz], 0.06, { seg: 6 });
    else hgBeam(M.hgStripe, [bx, by + 1.15, bz], [bx + e * 9.6, by + 1.0, bz], 0.06, { seg: 6 });
    // фонарь на воротах
    {
      const s = e, p = hgP(s * (GATE + 0.12), hgGY(s * GATE, Z) + 3.05, Z);
      hgCyl(M.dark, s * (GATE + 0.12), hgGY(s * GATE, Z) + 2.95, Z, 0.16, 0.22, 0.22, { seg: 10 });
      const lens = M.lampGlass.clone();
      hgPut(lens, new THREEH.CircleGeometry(0.15, 10), s * (GATE + 0.12), hgGY(s * GATE, Z) + 2.83, Z, { rot: [Math.PI / 2, 0, 0], cast: false });
      addLamp({ kind: "post", x: p.x, y: p.y - 0.3, z: p.z, dir: hgV(0, -1, 0), lens, on: true, flick: 0.25, power: 30, range: 16 });
    }
  }
}
function hgBooth(lx, lz, rot, R) {
  const w = 2.6, d = 2.6, h = 2.55, gy = hgGY(lx, lz) + 0.12, c = Math.cos(rot), s = Math.sin(rot);
  const L = (a, b) => [lx + a * c + b * s, lz - a * s + b * c];
  const [wx, wz] = hgW(lx, lz);
  beginStruct({ kind: "shed", name: "КПП", x: wx, z: wz, rot: HG.rot + rot, w, d, h, fy: HG.fy + gy, fuel: 0.5 });
  noPanel();
  hgBox(M.hgConc, lx, gy - 0.08, lz, w + 0.6, 0.3, d + 0.6, { tile: 1.2, r: rot, collide: true });
  const walls = [];
  const sides = [[0, d / 2, 0], [0, -d / 2, 0], [w / 2, 0, Math.PI / 2], [-w / 2, 0, Math.PI / 2]];
  sides.forEach(([a, b, rr], si2) => {
    const len = si2 < 2 ? w : d - 0.24, [px, pz] = L(a, b), door = si2 === 3;
    const segs = door ? [[-len / 2, len / 2 - 1.05, 0, h], [len / 2 - 0.15, len / 2, 0, h], [len / 2 - 1.05, len / 2 - 0.15, 2.1, h]] : [[-len / 2, len / 2, 0, 0.95], [-len / 2, len / 2, 2.05, h], [-len / 2, -len / 2 + 0.2, 0.95, 2.05], [len / 2 - 0.2, len / 2, 0.95, 2.05]];
    for (const [u0, u1, y0, y1] of segs) {
      const um = (u0 + u1) / 2, ca = Math.cos(rot + rr), sa = Math.sin(rot + rr);
      const qx = px + um * ca, qz = pz - um * sa, [qwx, qwz] = hgW(qx, qz);
      const pn = panel("wall", { hp: 1, mode: "shatter", mat: M.hgBrick, load: true, dims: { x: qwx, y: HG.fy + gy + (y0 + y1) / 2, z: qwz, sx: u1 - u0, sy: y1 - y0, sz: 0.24, rot: HG.rot + rot + rr, brick: true } });
      hgBox(M.hgBrick, qx, gy + (y0 + y1) / 2, qz, u1 - u0, y1 - y0, 0.24, { r: rot + rr, tile: 0.9 });
      hgCol(qx, gy + (y0 + y1) / 2, qz, u1 - u0, y1 - y0, 0.24, { r: rot + rr, walk: false });
      walls.push(pn);
    }
    noPanel();
    if (!door) {
      const ca = Math.cos(rot + rr), sa = Math.sin(rot + rr), [qwx, qwz] = hgW(px, pz);
      const nrm = [Math.sin(HG.rot + rot + rr), Math.cos(HG.rot + rot + rr)];
      if (R() > 0.25) addPane(qwx, HG.fy + gy + 1.5, qwz, [0, HG.rot + rot + rr, 0], len - 0.45, 1.05);
      hgBox(M.planksDark, px, gy + 1.5, pz, len - 0.38, 0.06, 0.1, { r: rot + rr, tile: 1 });
    }
  });
  const roof = panel("roof", { hp: 1.4, mode: "rigid", density: 600, sup: { list: walls, frac: 0.6 }, mat: M.hgConc });
  hgBox(M.hgConc, lx, gy + h + 0.1, lz, w + 0.7, 0.2, d + 0.7, { r: rot, tile: 1.2 });
  hgBox(M.roofTar, lx, gy + h + 0.21, lz, w + 0.66, 0.03, d + 0.66, { r: rot, tile: 1.5 });
  hgCol(lx, gy + h + 0.1, lz, w + 0.7, 0.24, d + 0.7, { r: rot, walk: true });
  noPanel();
  const [dx, dz] = L(-w / 2 - 0.02, -1.03);
  const [hwx, hwz] = hgW(dx, dz);
  addDoor({ hx: hwx, hz: hwz, y: HG.fy + gy, closed: HG.rot + rot - Math.PI / 2, openBy: -1.3, w: 0.9, h: 2.08, mat: M.hgCont3, startOpen: true });
  // внутри: стол, телефон, лампочка
  {
    const [tx, tz] = L(0.5, -0.6);
    hgBox(M.planks, tx, gy + 0.75, tz, 1.2, 0.05, 0.6, { r: rot, tile: 1, collide: true });
    hgBox(M.dark, tx + 0.2, gy + 0.83, tz, 0.22, 0.1, 0.18, { r: rot, tile: 1 });
    const p = hgP(lx, gy + 2.35, lz);
    addLamp({ kind: "bulb", x: p.x, y: p.y, z: p.z, flick: 0.2 });
  }
  endStruct();
  // табличка «СТОЙ!» у будки
  const [sx2, sz2] = L(-w / 2 - 0.9, d / 2 + 0.6);
  const sgy = hgGY(sx2, sz2);
  for (const o of [-0.45, 0.45]) hgBox(M.steel, sx2 + o * c, sgy + 0.8, sz2 - o * s, 0.05, 1.6, 0.05, { tile: 1 });
  hgPut(M.hgSignKPP, new THREEH.PlaneGeometry(1.2, 0.6), sx2, sgy + 1.55, sz2, { rot: HG.rot + rot + Math.PI / 2 * 0, cast: false });
}
function hgBrickPiece(side, at, u0, u1, y0, y1, sup, t = 0.25) {
  const uc = (u0 + u1) / 2, yc = (y0 + y1) / 2, Lw = u1 - u0, Hh = y1 - y0;
  if (Lw < 0.05 || Hh < 0.05) return null;
  const lx = side === "x" ? at : uc, lz = side === "x" ? uc : at, r = side === "x" ? Math.PI / 2 : 0;
  const [wx, wz] = hgW(lx, lz);
  const pn = panel("wall", { hp: 1.1, mode: "shatter", load: true, mat: M.hgBrick, sup: sup && sup.length ? { list: sup, frac: 0.5 } : null, burnable: false, dims: { x: wx, y: HG.fy + yc, z: wz, sx: Lw, sy: Hh, sz: t, rot: HG.rot + r, brick: true } });
  hgBox(M.hgBrick, lx, yc, lz, Lw, Hh, t, { r, tile: 0.9, uvOff: [u0, y0] });
  hgCol(lx, yc, lz, Lw, Hh, t, { r, walk: false });
  return pn;
}
function hgBrickBay(side, at, u0, u1, y0, y1, win) {
  if (!win) {
    const lo = hgBrickPiece(side, at, u0, u1, y0, y0 + (y1 - y0) * 0.5, null);
    hgBrickPiece(side, at, u0, u1, y0 + (y1 - y0) * 0.5, y1, lo ? [lo] : null);
    return;
  }
  const w0 = (u0 + u1) / 2 - 0.65, w1 = (u0 + u1) / 2 + 0.65, wy0 = y0 + 0.9, wy1 = y0 + 2.2;
  const lo = hgBrickPiece(side, at, u0, u1, y0, wy0, null);
  const pa = hgBrickPiece(side, at, u0, w0, wy0, wy1, lo ? [lo] : null), pb = hgBrickPiece(side, at, w1, u1, wy0, wy1, lo ? [lo] : null);
  hgBrickPiece(side, at, u0, u1, wy1, y1, [pa, pb].filter(Boolean));
}
function hgBuilding(R) {
  const { x0, x1, z0, z1, h1, h2, t } = HGB, xs = [x0, (x0 + x1) / 2, x1], zs = [-9, -6, -3, 0, 3, 6, 9];
  const [cx, cz] = hgW((x0 + x1) / 2, 0);
  const S = beginStruct({ kind: "building", name: "STROYKA-12", x: cx, z: cz, rot: HG.rot, w: x1 - x0, d: z1 - z0, h: h2, fy: HG.fy, fuel: 0.15 });
  noPanel();
  // цоколь и фундаментная плита
  hgBox(M.hgConc, (x0 + x1) / 2, -0.12, 0, x1 - x0 + 0.6, 0.56, z1 - z0 + 0.6, { tile: 1.5, collide: true });
  // колонны и ригели
  for (const lx of xs) for (const lz of zs) {
    const tall = R() < 0.35 && lz < 3;
    hgBox(M.hgConc, lx, (0.16 + h2) / 2, lz, 0.4, h2 - 0.16, 0.4, { tile: 1 });
    hgCol(lx, (0.16 + h2) / 2, lz, 0.4, h2 - 0.16, 0.4, { walk: false });
    if (tall) {
      hgBox(M.hgConc, lx, h2 + 0.7, lz, 0.4, 1.4, 0.4, { tile: 1 });
      hgCol(lx, h2 + 0.7, lz, 0.4, 1.4, 0.4, { walk: false });
    }
    const ty = tall ? h2 + 1.4 : h2;
    for (const [ox, oz] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) {
      const bend = R.range(-0.25, 0.25);
      hgBeam(M.rust, [lx + ox, ty - 0.1, lz + oz], [lx + ox + bend * 0.3, ty + R.range(0.6, 1.2), lz + oz + bend * 0.2], 0.012, { seg: 3, cast: false });
    }
  }
  // перекрытия: проём лестницы, на кровле недоложены плиты
  const slab = (y, holes) => {
    const cells = [];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 6; j++) {
      const ax = xs[i] - (i === 0 ? 0.2 : 0), bx = xs[i + 1] + (i === 1 ? 0.2 : 0), az = zs[j] - (j === 0 ? 0.2 : 0), bz = zs[j + 1] + (j === 5 ? 0.2 : 0);
      if (holes.some(([hi, hj]) => hi === i && hj === j)) continue;
      cells.push([ax, bx, az, bz]);
    }
    for (const [ax, bx, az, bz] of cells) {
      hgBox(M.hgConc, (ax + bx) / 2, y - t / 2, (az + bz) / 2, bx - ax, t, bz - az, { tile: 1.5 });
      hgCol((ax + bx) / 2, y - t / 2, (az + bz) / 2, bx - ax, t, bz - az, { walk: true });
    }
    for (const lx of xs) hgBox(M.hgConc, lx, y - t - 0.18, 0, 0.36, 0.36, z1 - z0, { tile: 1.2, cast: false });
  };
  slab(h1, [[1, 0]]);
  slab(h2, [[1, 0], [0, 4], [0, 5], [1, 5]]);
  // кирпичное заполнение: наружная стена — окна, торцы — частично, со стороны ангара — открыто
  for (let j = 0; j < 6; j++) {
    const u0 = zs[j] + 0.2, u1 = zs[j + 1] - 0.2;
    hgBrickBay("x", x1, u0, u1, 0.16, h1 - t - 0.36, j !== 2);
    if (j < 4) hgBrickBay("x", x1, u0, u1, h1, h2 - t - 0.36, j % 2 === 0);
  }
  noPanel();
  for (const e of [-1, 1]) {
    const Z = e * 9;
    hgBrickBay("z", Z, xs[1] + 0.2, x1 - 0.2, 0.16, h1 - t - 0.36, false);
    if (e < 0) hgBrickBay("z", Z, x0 + 0.2, xs[1] - 0.2, h1, h2 - t - 0.36, true);
  }
  hgBrickBay("x", x0, zs[0] + 0.2, zs[1] - 0.2, 0.16, h1 - t - 0.36, false);
  hgBrickBay("x", x0, zs[1] + 0.2, zs[2] - 0.2, 0.16, 1.4, false);
  noPanel();
  // лестничный проём: металлические стремянки на второй этаж и на кровлю
  for (const [ya, yb] of [[0.16, h1], [h1, h2]]) {
    const lxL = xs[1] + 0.9, lzL = zs[0] + 0.5;
    const [lw, lwz] = hgW(lxL, lzL), [tx, tz] = hgW(lxL + 1, lzL), [nx, nz] = hgW(lxL, lzL + 1);
    ladderGeo(M.steel, lw, lwz, HG.fy + ya, HG.fy + yb, tx - lw, tz - lwz, 0.5);
    const [ex, ez] = hgW(lxL, lzL + 3.4);
    addLadder({ x: lw, z: lwz, nx: nx - lw, nz: nz - lwz, y0: HG.fy + ya, y1: HG.fy + yb, w: 0.5, exit: [ex, HG.fy + yb + 0.05, ez], metal: true });
  }
  endStruct();
  HOUSES.push({ id: "stroyka", x: cx, z: cz, rot: HG.rot, w: x1 - x0, d: z1 - z0, fy: HG.fy + 0.16, top: HG.fy + h1, struct: S });
  // леса со стороны ангара: трубы, настилы, стремянки
  const sx0 = x0 - 1.35, sx1 = x0 - 0.35;
  for (let k = 0; k <= 9; k++) {
    const lz = -9 + k * 2;
    for (const lx of [sx0, sx1]) hgBeam(M.steelPipe, [lx, 0, lz], [lx, h2 + 1.1, lz], 0.024, { seg: 5 });
    for (const y of [0.25, 1.7, h1 + 0.02, h1 + 1.1, h2 + 0.02, h2 + 1.05]) hgBeam(M.steelPipe, [sx0, y, lz], [sx1, y, lz], 0.02, { seg: 4, cast: false });
    if (k < 9) for (const lx of [sx0, sx1]) hgBeam(M.steelPipe, [lx, 0.25, lz], [lx, h1, lz + 2], 0.018, { seg: 4, cast: false });
  }
  for (const lx of [sx0, sx1]) for (const y of [1.7, h1 + 0.02, h1 + 1.1, h2 + 0.02, h2 + 1.05]) hgBeam(M.steelPipe, [lx, y, -9], [lx, y, 9], 0.02, { seg: 4, cast: false });
  for (const y of [h1 + 0.06, h2 + 0.06]) {
    for (let k = 0; k < 5; k++) hgBox(M.planks, (sx0 + sx1) / 2 + (k - 2) * 0.21, y, 0, 0.2, 0.04, 18, { tile: 1.2 });
    hgCol((sx0 + sx1) / 2 + 0.2, y - 0.02, 0, 1.4, 0.1, 18, { walk: true });
  }
  for (const [lz, ya, yb] of [[-7.3, 0, h1], [7.3, h1, h2]]) {
    const lx = sx0 - 0.25;
    const [lw, lwz] = hgW(lx, lz), [tx, tz] = hgW(lx, lz + 1), [nx, nz] = hgW(lx - 1, lz);
    ladderGeo(M.steel, lw, lwz, HG.fy + ya, HG.fy + yb, tx - lw, tz - lwz, 0.46);
    const [ex, ez] = hgW((sx0 + sx1) / 2, lz);
    addLadder({ x: lw, z: lwz, nx: nx - lw, nz: nz - lwz, y0: HG.fy + ya, y1: HG.fy + yb, w: 0.46, exit: [ex, HG.fy + yb + 0.1, ez], metal: true });
  }
  // таблички «СТРОЙКА-12» на торцах
  for (const e of [-1, 1]) {
    const lz = e * 10.6, lx = x1 - 2.2, gy = hgGY(lx, lz);
    for (const o of [-1.5, 1.5]) {
      hgBox(M.planksDark, lx + o, gy + 1.4, lz, 0.1, 2.8, 0.1, { tile: 1 });
      hgCol(lx + o, gy + 1.4, lz, 0.12, 2.8, 0.12, { walk: false });
    }
    hgPut(M.hgSignB, new THREEH.PlaneGeometry(3.4, 1.7), lx, gy + 2.0, lz + e * 0.06, { rot: HG.rot + (e > 0 ? 0 : Math.PI), cast: false });
    hgBox(M.planksDark, lx, gy + 2.0, lz, 3.5, 1.8, 0.05, { tile: 1 });
  }
  // стройматериалы внутри и у стен
  for (let k = 0; k < 4; k++) {
    hgBox(M.planks, x1 - 1.4, 0.3, -6.5 + k * 3.2, 1.1, 0.12, 1.1, { tile: 1, collide: true });
    hgBox(M.hgBrick, x1 - 1.4, 0.75, -6.5 + k * 3.2, 1, 0.8, 1, { tile: 0.9, collide: true, r: R.range(-0.1, 0.1) });
  }
  for (let k = 0; k < 6; k++) hgBox(M.sack ?? M.canvas, x0 + 1.2 + (k % 3) * 0.55, h1 + 0.12 + Math.floor(k / 3) * 0.2, 4.2, 0.5, 0.2, 0.8, { tile: 1, collide: true });
}
function hgContainer(lx, y, lz, mat, R, o = {}) {
  const Lc = o.L ?? 6.06, Wc = 2.44, Hc = 2.59, r = o.r ?? 0;
  hgBox(mat, lx, y + Hc / 2, lz, Wc, Hc, Lc, { r, tile: 1.4 });
  hgCol(lx, y + Hc / 2, lz, Wc, Hc, Lc, { r, walk: true }).metal = true;
  const c = Math.cos(r), s = Math.sin(r);
  const P = (a, b) => [lx + a * c + b * s, lz - a * s + b * c];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const yy of [0.08, Hc - 0.08]) {
    const [px, pz] = P(a * (Wc / 2 - 0.08), b * (Lc / 2 - 0.08));
    hgBox(M.dark, px, y + yy, pz, 0.18, 0.16, 0.18, { r, tile: 1, cast: false });
  }
  // двери с запорными штангами на торце
  const [dx, dz] = P(0, -Lc / 2 - 0.02);
  hgBox(M.dark, dx, y + Hc / 2, dz, Wc - 0.1, Hc - 0.2, 0.02, { r, tile: 1, cast: false });
  for (const a of [-0.85, -0.35, 0.35, 0.85]) {
    const [bx, bz] = P(a, -Lc / 2 - 0.06);
    hgCyl(M.steel, bx, y + Hc / 2, bz, 0.025, 0.025, Hc - 0.3, { seg: 5 });
  }
}
function hgCabin(lx, lz, R, o = {}) {
  const Lc = 6, Wc = 2.4, Hc = 2.5, y = hgGY(lx, lz) + 0.25;
  for (const b of [-2.4, 0, 2.4]) hgBox(M.planksDark, lx, y - 0.15, lz + b, Wc + 0.2, 0.3, 0.3, { tile: 1 });
  const [wx, wz] = hgW(lx, lz);
  beginStruct({ kind: "shed", name: "бытовка", x: wx, z: wz, rot: HG.rot, w: Wc, d: Lc, h: Hc, fy: HG.fy + y, fuel: 0.7 });
  const walls = [];
  const sgnW = o.face ?? 1;
  for (const s of [-1, 1]) {
    const pn = panel("wall", { hp: 1.2, mode: "rigid", density: 300, mat: M.hgCabin });
    pn.metal = true;
    walls.push(pn);
    if (s === sgnW) {
      for (const [z0, z1, y0, y1] of [[-Lc / 2, -1.8, 0, Hc], [-0.6, 0.9, 0, Hc], [1.9, Lc / 2, 0, Hc], [-1.8, -0.6, 0, 0.9], [-1.8, -0.6, 2.0, Hc], [0.9, 1.9, 2.05, Hc]]) {
        hgBox(M.hgCabin, lx + s * Wc / 2, y + (y0 + y1) / 2, lz + (z0 + z1) / 2, 0.06, y1 - y0, z1 - z0, { tile: 1.4 });
        hgCol(lx + s * Wc / 2, y + (y0 + y1) / 2, lz + (z0 + z1) / 2, 0.1, y1 - y0, z1 - z0, { walk: false });
      }
    } else {
      hgBox(M.hgCabin, lx + s * Wc / 2, y + Hc / 2, lz, 0.06, Hc, Lc, { tile: 1.4 });
      hgCol(lx + s * Wc / 2, y + Hc / 2, lz, 0.1, Hc, Lc, { walk: false });
    }
  }
  for (const e of [-1, 1]) {
    hgBox(M.hgCabin, lx, y + Hc / 2, lz + e * Lc / 2, Wc, Hc, 0.06, { tile: 1.4 });
    hgCol(lx, y + Hc / 2, lz + e * Lc / 2, Wc, Hc, 0.1, { walk: false });
  }
  panel("roof", { hp: 1.5, mode: "rigid", density: 300, sup: { list: walls, frac: 0.5 }, mat: M.hgSheet });
  hgBox(M.hgSheet, lx, y + Hc + 0.05, lz, Wc + 0.2, 0.08, Lc + 0.2, { tile: 1.5 });
  hgCol(lx, y + Hc + 0.05, lz, Wc + 0.2, 0.12, Lc + 0.2, { walk: true });
  noPanel();
  const sx = lx + sgnW * (Wc / 2 + 0.02);
  const [px, pz] = hgW(sx, lz - 1.2), [qx, qz] = hgW(sx + sgnW, lz - 1.2);
  addPane(px, HG.fy + y + 1.45, pz, [0, Math.atan2(qx - px, qz - pz), 0], 1.1, 1);
  const [hx2, hz] = hgW(sx, lz + 0.9);
  addDoor({ hx: hx2, hz, y: HG.fy + y, closed: HG.rot - Math.PI / 2 + (sgnW > 0 ? Math.PI : 0), openBy: sgnW * 0.9, w: 1, h: 2.02, mat: M.hgCabin, startOpen: true });
  {
    const p = hgP(lx, y + 2.3, lz);
    addLamp({ kind: "window", x: p.x, y: p.y, z: p.z, flick: 0.15 });
    hgBox(M.planks, lx - sgnW * 0.6, y + 0.75, lz - 1.6, 0.7, 0.05, 1.4, { tile: 1, collide: true });
    hgBox(M.olive, lx - sgnW * 0.75, y + 0.45, lz + 1.8, 0.5, 0.9, 1.8, { tile: 1, collide: true });
  }
  endStruct();
}
function hgYard(R) {
  // −x: башенный кран, штабель контейнеров с гнездом, бытовки, склад плит и колец
  hgContainer(-23.5, hgGY(-23.5, -4) + 0.02, -4, M.hgCont1, R);
  hgContainer(-23.5, hgGY(-23.5, -4) + 2.61, -4.3, M.hgCont2, R, { r: 0.03 });
  HGX.contTop = HG.fy + hgGY(-23.5, -4) + 2.61 + 2.59;
  {
    const lx = -23.5 + 1.25, lz = -2.2, y0 = hgGY(lx, lz);
    const [lw, lwz] = hgW(lx, lz), [tx, tz] = hgW(lx, lz + 1), [nx, nz] = hgW(lx + 1, lz);
    ladderGeo(M.steel, lw, lwz, HG.fy + y0, HG.fy + y0 + 5.2, tx - lw, tz - lwz, 0.46);
    const [ex, ez] = hgW(-23.2, -2.3);
    addLadder({ x: lw, z: lwz, nx: nx - lw, nz: nz - lwz, y0: HG.fy + y0, y1: HG.fy + y0 + 5.2, w: 0.46, exit: [ex, HG.fy + y0 + 5.25, ez], metal: true });
  }
  hgContainer(23.6, hgGY(23.6, 18.5) + 0.02, 18.5, M.hgCont3, R);
  hgContainer(-27.4, hgGY(-27.4, 33) + 0.02, 33, M.hgCont1, R, { r: Math.PI / 2 + 0.05 });
  hgContainer(27.4, hgGY(27.4, -33) + 0.02, -33, M.hgCont2, R, { r: Math.PI / 2 - 0.04 });
  hgCabin(-27.6, -15.5, R, { face: 1 });
  hgCabin(-27.6, -22.3, R, { face: 1 });
  hgCabin(27.6, 26.5, R, { face: -1 });
  // штабели плит, бетонные кольца, поддоны кирпича, катушки кабеля
  for (const sgn of [1, -1]) {
    const P = (lx, lz) => [sgn * lx, sgn * lz];
    {
      const [lx, lz] = P(-20.5, -20), gy = hgGY(lx, lz);
      for (let k = 0; k < 4; k++) hgBox(M.hgConc, lx, gy + 0.11 + k * 0.23, lz + R.range(-0.08, 0.08), 3, 0.2, 6, { tile: 1.5, r: R.range(-0.03, 0.03) });
      for (const b of [-2, 0, 2]) hgBox(M.planksDark, lx, gy + 0.03, lz + b, 3.1, 0.06, 0.12, { tile: 1 });
      hgCol(lx, gy + 0.5, lz, 3, 1, 6, { walk: true });
    }
    for (let k = 0; k < 3; k++) {
      const [lx, lz] = P(-20 + (k % 2) * 0.2, -26.5 - k * 1.9), gy = hgGY(lx, lz);
      const ring = new THREEH.CylinderGeometry(0.85, 0.85, 1, 18, 1, true);
      hgPut(M.hgConc, ring, lx, gy + 0.5, lz, { rot: 0 });
      hgPut(M.hgConc, new THREEH.CylinderGeometry(0.72, 0.72, 1.01, 18, 1, true), lx, gy + 0.5, lz, { rot: 0 });
      const [wx, wz] = hgW(lx, lz);
      addCircle(wx, wz, 0.86, HG.fy + gy, HG.fy + gy + 1);
    }
    for (let k = 0; k < 3; k++) {
      const [lx, lz] = P(19.5 + k * 1.3, -15.5), gy = hgGY(lx, lz);
      hgBox(M.planks, lx, gy + 0.07, lz, 1.1, 0.14, 1.1, { tile: 1 });
      hgBox(M.hgBrick, lx, gy + 0.55, lz, 1, 0.82, 1, { tile: 0.9, collide: true });
    }
    {
      const [lx, lz] = P(21, 16.5), gy = hgGY(lx, lz);
      const sp = new THREEH.CylinderGeometry(0.8, 0.8, 0.9, 16);
      hgPut(M.planksDark, sp, lx, gy + 0.8, lz, { rot: [Math.PI / 2, HG.rot, 0] });
      hgCyl(M.dark, lx, gy + 0.8, lz, 0.55, 0.55, 0.92, { seg: 14, rot: [Math.PI / 2, HG.rot, 0] });
      hgCol(lx, gy + 0.8, lz, 1.6, 1.6, 0.9, { walk: true });
    }
  }
  // песок и бетономешалка
  {
    const lx = 22.5, lz = 12.2, gy = hgGY(lx, lz);
    const pile = new THREEH.ConeGeometry(2.2, 1.3, 16, 2);
    const pp = pile.attributes.position;
    for (let i = 0; i < pp.count; i++) pp.setY(i, pp.getY(i) + Math.sin(pp.getX(i) * 3) * 0.06);
    pile.computeVertexNormals();
    hgPut(M.dirtMound, pile, lx, gy + 0.6, lz, { rot: 0 });
    const [wx, wz] = hgW(lx, lz);
    addCircle(wx, wz, 1.4, HG.fy + gy, HG.fy + gy + 0.9);
    const mx = 25.6, mz = 13.5, my = hgGY(mx, mz);
    hgCyl(M.hgYellow, mx, my + 1.1, mz, 0.55, 0.38, 1.1, { seg: 14, rot: [0.9, HG.rot + 0.4, 0] });
    for (const o of [-0.5, 0.5]) hgBox(M.steel, mx + o, my + 0.4, mz, 0.08, 0.8, 0.08, { tile: 1 });
    hgCol(mx, my + 0.8, mz, 1.3, 1.6, 1.3, { walk: false });
  }
}
function hgCrane(R) {
  const { lx, lz, H } = HGC, B = 0.85, gy = hgGY(lx, lz);
  hgBox(M.hgConc, lx, gy + 0.3, lz, 4.6, 0.9, 4.6, { tile: 1.5, collide: true });
  for (const [a, b] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) hgBox(M.hgConc, lx + a, gy + 1.05, lz + b, 1.2, 0.6, 1.2, { tile: 1, collide: true });
  const y0 = gy + 0.75;
  for (const [a, b] of [[-B, -B], [B, -B], [-B, B], [B, B]]) {
    hgBox(M.hgYellow, lx + a, y0 + H / 2, lz + b, 0.14, H, 0.14, { tile: 1 });
    const [wx, wz] = hgW(lx + a, lz + b);
    addCircle(wx, wz, 0.12, HG.fy + y0, HG.fy + y0 + H);
  }
  const step = 2.5;
  for (let y = 0; y < H - 0.1; y += step) {
    const ya = y0 + y, yb = ya + step;
    for (const [a0, b0, a1, b1] of [[-B, -B, B, -B], [B, -B, B, B], [B, B, -B, B], [-B, B, -B, -B]]) {
      hgBeam(M.hgYellow, [lx + a0, ya, lz + b0], [lx + a1, ya, lz + b1], 0.035, { seg: 4 });
      hgBeam(M.hgYellow, [lx + a0, ya, lz + b0], [lx + a1, yb, lz + b1], 0.03, { seg: 4 });
    }
  }
  // лестница с дугами по внешней грани и площадка наверху
  const top = y0 + H;
  {
    const ax = lx - B - 0.08, az = lz;
    const [lw, lwz] = hgW(ax, az), [tx, tz] = hgW(ax, az + 1), [nx, nz] = hgW(ax - 1, az);
    ladderGeo(M.steel, lw, lwz, HG.fy + y0, HG.fy + top, tx - lw, tz - lwz, 0.46, [nx - lw, nz - lwz]);
    const [ex, ez] = hgW(lx - 0.9, lz + 0.9);
    addLadder({ x: lw, z: lwz, nx: nx - lw, nz: nz - lwz, y0: HG.fy + y0, y1: HG.fy + top, w: 0.46, exit: [ex, HG.fy + top + 0.12, ez], metal: true });
  }
  // настил с люком над лестницей (иначе снизу не пролезть)
  for (const [a0, a1, b0, b1] of [[-0.55, 1.7, -1.7, 1.7], [-1.7, -0.55, 0.45, 1.7], [-1.7, -0.55, -1.7, -0.45]]) {
    const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
    hgBox(M.grate, lx + ca, top + 0.04, lz + cb, a1 - a0, 0.08, b1 - b0, { tile: 0.6 });
    hgCol(lx + ca, top, lz + cb, a1 - a0, 0.16, b1 - b0, { walk: true }).metal = true;
  }
  for (const s of [-1, 1]) hgBox(M.hgYellow, lx - 1.125, top + 0.03, lz + s * 0.47, 1.15, 0.1, 0.05, { tile: 1, cast: false });
  // опорное кольцо поворотной части на четырёх стойках — под ним можно стоять
  for (const [a, b] of [[-B, -B], [B, -B], [-B, B], [B, B]]) {
    hgBox(M.hgYellow, lx + a, top + 1.05, lz + b, 0.16, 2.1, 0.16, { tile: 1 });
    hgCol(lx + a, top + 1.05, lz + b, 0.18, 2.1, 0.18, { walk: false });
  }
  hgBox(M.hgYellow, lx, top + 2.05, lz, 2.1, 0.18, 2.1, { tile: 1 });
  for (const [a0, b0, a1, b1] of [[-1.7, -1.7, 1.7, -1.7], [1.7, -1.7, 1.7, 1.7], [1.7, 1.7, -1.7, 1.7], [-1.7, 1.7, -1.7, -1.7]]) {
    hgBeam(M.hgYellow, [lx + a0, top + 1.05, lz + b0], [lx + a1, top + 1.05, lz + b1], 0.025, { seg: 4, cast: false });
    const mx = (a0 + a1) / 2, mz = (b0 + b1) / 2, L = Math.hypot(a1 - a0, b1 - b0);
    hgCol(lx + mx, top + 0.6, lz + mz, Math.abs(a1 - a0) + 0.06, 1.1, Math.abs(b1 - b0) + 0.06, { walk: false });
    for (let k = 0; k <= Math.round(L / 1.1); k++) {
      const t = k / Math.max(1, Math.round(L / 1.1));
      hgBeam(M.hgYellow, [lx + a0 + (a1 - a0) * t, top, lz + b0 + (b1 - b0) * t], [lx + a0 + (a1 - a0) * t, top + 1.05, lz + b0 + (b1 - b0) * t], 0.02, { seg: 3, cast: false });
    }
  }
  // поворотная часть: отдельная группа, вращается каждый кадр
  const lists = new Map();
  const add = (mat, g) => {
    if (!lists.has(mat)) lists.set(mat, []);
    lists.get(mat).push(normalize(g, mat));
  };
  const gBox = (mat, x, y, z, sx, sy, sz, rz = 0) => {
    const g = uvBox(new THREEH.BoxGeometry(sx, sy, sz), sx, sy, sz, 1);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    add(mat, g);
  };
  const gBeam = (mat, a, b, r) => {
    const va = hgV(...a), vb = hgV(...b), d = vb.clone().sub(va), L = d.length();
    const g = new THREEH.CylinderGeometry(r, r, L, 4, 1, false);
    g.applyQuaternion(new THREEH.Quaternion().setFromUnitVectors(hgV(0, 1, 0), d.normalize()));
    const c = va.add(vb).multiplyScalar(0.5);
    g.translate(c.x, c.y, c.z);
    add(mat, g);
  };
  const JL = 36, CJ = 11.5;
  gBox(M.hgYellow, 0, 0.35, 0, 2.6, 0.7, 2.6);
  // стрела: трёхгранная ферма
  for (let x = 1; x < JL; x += 1.5) {
    const x1 = Math.min(JL, x + 1.5);
    gBeam(M.hgYellow, [x, 0.7, -0.6], [x1, 0.7, -0.6], 0.045);
    gBeam(M.hgYellow, [x, 0.7, 0.6], [x1, 0.7, 0.6], 0.045);
    gBeam(M.hgYellow, [x, 1.9, 0], [x1, 1.9, 0], 0.045);
    gBeam(M.hgYellow, [x, 0.7, -0.6], [x1, 1.9, 0], 0.025);
    gBeam(M.hgYellow, [x, 0.7, 0.6], [x1, 1.9, 0], 0.025);
    gBeam(M.hgYellow, [x1, 0.7, -0.6], [x1, 0.7, 0.6], 0.02);
  }
  // противовесная консоль с бетонными блоками
  gBox(M.hgYellow, -CJ / 2, 0.75, 0, CJ, 0.3, 1.6);
  gBox(M.grate, -CJ / 2, 0.92, 0, CJ, 0.04, 1.5);
  for (let k = 0; k < 4; k++) gBox(M.hgConc, -CJ + 0.55 + k * 0.9, -0.4, 0, 0.8, 2.2, 1.7);
  gBox(M.dark, -CJ + 4.6, 1.3, 0, 1.6, 0.9, 1.1);
  // оголовок и тяги
  for (const [a, b] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) gBeam(M.hgYellow, [a, 0.7, b], [0, 7, 0], 0.06);
  gBeam(M.steel, [0, 7, 0], [24, 1.95, 0], 0.025);
  gBeam(M.steel, [0, 7, 0], [-CJ + 0.4, 0.95, 0], 0.025);
  // кабина крановщика
  gBox(M.hgYellow, 1.6, -0.1, 2.45, 2, 1.9, 1.7);
  gBox(M.hgGlassDark, 2.62, 0.05, 2.45, 0.04, 1.1, 1.4);
  gBox(M.hgGlassDark, 1.6, 0.05, 3.31, 1.7, 1.1, 0.04);
  gBox(M.grate, 1.6, -1.07, 2.45, 2.2, 0.05, 1.9);
  // тележка грузовой лебёдки
  const TX = 19;
  gBox(M.dark, TX, 0.45, 0, 1.3, 0.35, 1.5);
  const grp = new THREEH.Group();
  for (const [mat, list] of lists) {
    const g = BGU.mergeGeometries(list, false);
    const m = new THREEH.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    grp.add(m);
  }
  const pivot = hgP(lx, top + 2.15, lz);
  grp.position.copy(pivot);
  scene.add(grp);
  HGX.jib = grp;
  HGX.yaw = Math.atan2(-WIND.dir.y, WIND.dir.x);
  grp.rotation.y = HGX.yaw;
  HGX.TX = TX;
  // крюковая подвеска с поддоном плит — маятник
  const hook = new THREEH.Group(), CL = 12;
  HGX.CL = CL;
  const cable = new THREEH.Mesh(new THREEH.CylinderGeometry(0.018, 0.018, CL, 4), M.steel);
  cable.position.y = -CL / 2;
  hook.add(cable);
  const blk = new THREEH.Mesh(new THREEH.BoxGeometry(0.5, 0.6, 0.35), M.hgYellow);
  blk.position.y = -CL - 0.3;
  hook.add(blk);
  const ld = new THREEH.Mesh(uvBox(new THREEH.BoxGeometry(3.2, 0.32, 1.4), 3.2, 0.32, 1.4, 1.5), M.hgConc);
  ld.position.y = -CL - 2.2;
  ld.castShadow = true;
  hook.add(ld);
  HGX.load = ld;
  for (const [a, b] of [[-1.4, -0.6], [1.4, -0.6], [-1.4, 0.6], [1.4, 0.6]]) {
    const v0 = hgV(0, -CL - 0.6, 0), v1 = hgV(a, -CL - 2.05, b), d = v1.clone().sub(v0), L = d.length();
    const s = new THREEH.Mesh(new THREEH.CylinderGeometry(0.01, 0.01, L, 3), M.steel);
    s.position.copy(v0).add(v1).multiplyScalar(0.5);
    s.quaternion.setFromUnitVectors(hgV(0, 1, 0), d.normalize());
    hook.add(s);
  }
  hook.position.set(TX, 0.3, 0);
  for (const m of hook.children) m.castShadow = true;
  grp.add(hook);
  HGX.hook = hook;
  // сигнальные огни: концы стрелы и консоли, оголовок (мигают ночью)
  const bg = new THREEH.SphereGeometry(0.16, 8, 6);
  for (const p of [[JL, 2, 0], [-CJ, 1.2, 0], [0, 7.2, 0]]) {
    const s = new THREEH.Mesh(bg, HGX.beaconMat);
    s.position.set(...p);
    grp.add(s);
  }
  {
    const p = hgP(lx, top + 9.45, lz);
    addLamp({ kind: "bulb", x: p.x, y: p.y, z: p.z, color: 16719904, power: 6, range: 14, blink: true, pool: 0, ground: hFast(p.x, p.z) });
  }
}
function hgFBS(lx, lz, r, stack) {
  const gy = hgGY(lx, lz);
  for (let k = 0; k < stack; k++) hgBox(M.hgConc, lx, gy + 0.3 + k * 0.6, lz, 2.4, 0.58, 0.6, { r: r + (k ? 0.04 : 0), tile: 1.2, collide: true });
}
function hgAprons(R) {
  for (const e of [-1, 1]) {
    const P = (lx, lz) => [e * lx, e * lz];
    // бетонный фартук
    hgBox(M.hgApron, 0, -0.17, e * 29, 22.4, 0.34, 8.6, { tile: 4, cast: false });
    hgBox(M.hgHazard, 0, 0.006, e * 33.1, 22.4, 0.012, 0.25, { tile: 1, cast: false });
    // блоки ФБС ломаной линией и мешки у ворот
    hgFBS(...P(-8.5, 36.5), 0.1, 2);
    hgFBS(...P(-5.9, 36.8), -0.05, 1);
    hgFBS(...P(7.4, 31.5), 0.2, 1);
    hgFBS(...P(9.9, 31.2), -0.1, 2);
    hgFBS(...P(-14.5, 27.5), Math.PI / 2, 2);
    hgFBS(...P(16.5, 37), Math.PI / 2 + 0.1, 1);
    {
      const [ax, az] = hgW(...P(-3.2, 40.2)), [bx, bz] = hgW(...P(-0.4, 40.5));
      sandbagWall(ax, az, bx, bz, 4, R);
      const [cx, cz] = hgW(...P(12.6, 39.8)), [dx, dz] = hgW(...P(15.6, 39.4));
      sandbagWall(cx, cz, dx, dz, 3, R);
    }
    // грузовик и топливозаправщик
    {
      const [x, z] = hgW(...P(-12.6, 35.5));
      vehicle("truck", x, z, HG.rot + (e > 0 ? 0.04 : Math.PI + 0.04), { seed: 51 + e, paint: e > 0 ? 2 : 0, tilt: 0.02 });
    }
    {
      const [lx, lz] = P(15.6, 30.5), gy = hgGY(lx, lz);
      for (const b of [-1.8, 1.8]) hgBox(M.planksDark, lx, gy + 0.15, lz + b, 2.2, 0.3, 0.3, { tile: 1 });
      hgCyl(M.steelPipe, lx, gy + 1.25, lz, 0.95, 0.95, 5.2, { seg: 18, rot: [Math.PI / 2, HG.rot, 0], tile: 1.6 });
      for (const b of [-2.6, 2.6]) hgCyl(M.steel, lx, gy + 1.25, lz + b, 0.97, 0.97, 0.06, { seg: 18, rot: [Math.PI / 2, HG.rot, 0] });
      hgBox(M.hgRed, lx, gy + 1.25, lz, 1.96, 0.3, 5.0, { tile: 1, cast: false });
      hgCyl(M.dark, lx, gy + 2.25, lz + 1.2, 0.25, 0.25, 0.12, { seg: 10 });
      const c2 = hgCol(lx, gy + 1.25, lz, 1.9, 1.9, 5.2, { walk: true });
      const [wx, wz] = hgW(lx, lz);
      c2.leak = { x: wx, z: wz, r: 0.95, y0: HG.fy + gy + 0.3, y1: HG.fy + gy + 2.2 };
      c2.metal = true;
    }
    for (let k = 0; k < 5; k++) {
      const [x, z] = hgW(...P(18.5 + (k % 3) * 0.66, 32 + Math.floor(k / 3) * 0.66));
      barrelStatic(x, z, R);
    }
    for (let k = 0; k < 3; k++) {
      const [x, z] = hgW(...P(-17 + k * 1.15, 40.6));
      crate(x, z, HG.rot + R.range(-0.3, 0.3), R, 1 + (k % 2));
    }
    // ежи на подъезде за оградой
    for (const [a, b] of [[-7.8, 47.5], [7.5, 48.6], [-9.5, 50.2]]) {
      const [x, z] = hgW(...P(a, b));
      hedgehog(x, z, R);
    }
  }
}
function hgFloods(R) {
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const lx = sx * (HG.a - 2.2), lz = sz * (HG.b - 2.2), gy = hgGY(lx, lz), H = 9.5;
    hgBox(M.hgConc, lx, gy + 0.2, lz, 1, 0.5, 1, { tile: 1 });
    for (const [a, b] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) hgBeam(M.steel, [lx + a, gy + 0.4, lz + b], [lx + a * 0.4, gy + H, lz + b * 0.4], 0.035, { seg: 4 });
    for (let y = 1.2; y < H; y += 1.6) hgBox(M.steel, lx, gy + y, lz, 0.5, 0.03, 0.5, { tile: 1, cast: false });
    const [wx, wz] = hgW(lx, lz);
    addCircle(wx, wz, 0.35, HG.fy + gy, HG.fy + gy + H);
    hgBox(M.grate, lx, gy + H, lz, 1.2, 0.06, 1.2, { tile: 0.6 });
    for (const [tx, tz] of [[0, sz * 26], [-sx * 4, sz * (HG.b + 8)]]) {
      const head = hgP(lx - sx * 0.35, gy + H + 0.45, lz - sz * 0.2), tgt = hgP(tx, 0, tz), d = tgt.clone().sub(head).normalize();
      const m = new THREEH.Mesh(new THREEH.BoxGeometry(0.46, 0.36, 0.3), M.dark);
      m.position.copy(head);
      m.lookAt(head.clone().add(d));
      m.castShadow = true;
      scene.add(m);
      const lens = M.lampGlass.clone();
      const gl = new THREEH.Mesh(new THREEH.PlaneGeometry(0.4, 0.3), lens);
      gl.position.copy(head).addScaledVector(d, 0.16);
      gl.lookAt(head.clone().addScaledVector(d, 2));
      scene.add(gl);
      addLamp({ kind: "flood", x: head.x + d.x * 0.2, y: head.y + d.y * 0.2, z: head.z + d.z * 0.2, dir: d, lens, on: R() > 0.12, flick: R() < 0.3 ? 0.3 : 0 });
    }
  }
}
var HGS = { list: [], dust: null, upd: 0, sl: [0, -1, 0], sw: new THREEH.Vector3(), first: true, ci: 0, k: 1 };
var HGS_NS = QNAME === "potato" ? 3 : QNAME === "low" ? 4 : 7;
function hgShaftMat() {
  return new THREEH.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREEH.BackSide,
    blending: THREEH.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    uniforms: { uCamL: { value: new THREEH.Vector3() }, uA: { value: new THREEH.Matrix4() }, uCol: { value: new THREEH.Color() }, uI: { value: 0 }, uT: { value: 0 }, uFy: { value: HG.fy + 0.02 } },
    vertexShader: `varying vec3 vL; varying vec3 vW;
      void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uCamL, uCol; uniform mat4 uA; uniform float uI, uT, uFy; varying vec3 vL; varying vec3 vW;
      void main(){
        // луч камеры в осях параллелепипеда (u, v — сечение дыры, s — вдоль света): вход по слэбам, выход — эта задняя грань
        vec3 rd = vL - uCamL;
        vec3 inv = 1.0 / (rd + vec3(1e-6));
        vec3 t0 = (vec3(-0.5, -0.5, 0.0) - uCamL) * inv, t1 = (vec3(0.5, 0.5, 1.0) - uCamL) * inv;
        vec3 tm = min(t0, t1);
        float tn = clamp(max(max(tm.x, tm.y), tm.z), 0.0, 1.0);
        float segW = (1.0 - tn) * length(vW - cameraPosition);
        float acc = 0.0;
        for (int i = 0; i < ${HGS_NS}; i++) {
          float t = mix(tn, 1.0, (float(i) + 0.5) / float(${HGS_NS}));
          vec3 p = uCamL + rd * t;
          vec3 w = (uA * vec4(p, 1.0)).xyz;
          float e = smoothstep(0.5, 0.18, abs(p.x)) * smoothstep(0.5, 0.26, abs(p.y));
          float f = smoothstep(0.0, 0.06, p.z) * (1.0 - 0.6 * p.z);
          float n = 0.62 + 0.38 * sin(w.x * 1.31 + uT * 0.37) * sin(w.y * 1.73 - uT * 0.29) * sin(w.z * 1.13 + uT * 0.21 + w.x * 0.4);
          acc += e * f * n * step(uFy, w.y);
        }
        float d = acc / float(${HGS_NS}) * min(segW, 24.0);
        gl_FragColor = vec4(uCol * (uI * d), 1.0);
      }`
  });
}
function hgShafts() {
  const geo = new THREEH.BoxGeometry(1, 1, 1);
  geo.translate(0, 0, 0.5);
  const src = [...HGX.holes.map((h) => [h, 1]), ...HGX.skylights.map((h) => [h, 0.42])].slice(0, 20);
  const base = hgShaftMat();
  for (const [h, k] of src) {
    const m = new THREEH.Mesh(geo, base.clone());
    m.matrixAutoUpdate = false;
    m.frustumCulled = true;
    m.renderOrder = 7;
    m.visible = false;
    scene.add(m);
    NO_REFLECT.push(m);
    HGS.list.push({ h, k, mesh: m, A: new THREEH.Matrix4(), inv: new THREEH.Matrix4(), vis: 0, ok: false, clear: 1, clearT: 1, wc: hgP(h.lx, h.y, h.lz), I: 0 });
  }
}
function hgDust() {
  const N = Math.round(clamp(Q.dust * 5, 1200, 4200)), pos = new Float32Array(N * 3), rnd = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    let lx, y, lz;
    do {
      lx = sr(-14.6, 14.6);
      y = sr(0.15, 12.8);
      lz = sr(-23.6, 23.6);
    } while (y > hgAR(lx) - 0.25);
    const p = hgP(lx, y, lz);
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;
    for (let k = 0; k < 4; k++) rnd[i * 4 + k] = srnd();
  }
  const g = new THREEH.BufferGeometry();
  g.setAttribute("position", new THREEH.BufferAttribute(pos, 3));
  g.setAttribute("aR", new THREEH.BufferAttribute(rnd, 4));
  const n = HGS.list.length || 1;
  const m = new THREEH.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREEH.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uInv: { value: HGS.list.length ? HGS.list.map((s) => s.inv) : [new THREEH.Matrix4()] }, uShI: { value: new Array(n).fill(0) }, uCol: { value: new THREEH.Color() }, uBase: { value: 0.02 }, uLamp: { value: new THREEH.Color(1, 0.9, 0.75) } },
    vertexShader: `attribute vec4 aR; uniform float uT, uBase; uniform mat4 uInv[${n}]; uniform float uShI[${n}]; varying float vA; varying float vS;
      void main(){
        vec3 p = position;
        float t = uT * (0.04 + aR.x * 0.07);
        p += vec3(sin(t + aR.y * 6.283) * 0.7, sin(t * 1.3 + aR.z * 6.283) * 0.4, cos(t * 0.8 + aR.w * 6.283) * 0.7);
        float g = 0.0;
        for (int i = 0; i < ${n}; i++) {
          if (uShI[i] <= 0.0) continue;
          vec3 q = (uInv[i] * vec4(p, 1.0)).xyz;
          vec3 a = abs(q - vec3(0.0, 0.0, 0.5));
          if (a.x < 0.5 && a.y < 0.5 && a.z < 0.5) g += uShI[i] * smoothstep(0.5, 0.28, a.x) * smoothstep(0.5, 0.32, a.y) * (1.0 - 0.5 * q.z);
        }
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        gl_PointSize = clamp(30.0 / d, 1.0, 4.0);
        float tw = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(uT * (1.2 + aR.x * 2.6) + aR.y * 40.0), 3.0);
        vS = clamp(g * 4.0, 0.0, 1.0);
        vA = (g * tw * 3.2 + uBase) * smoothstep(0.3, 1.1, d) * smoothstep(34.0, 14.0, d);
      }`,
    fragmentShader: `uniform vec3 uCol, uLamp; varying float vA; varying float vS;
      void main(){ float a = smoothstep(0.5, 0.08, length(gl_PointCoord - 0.5)) * vA; if (a < 0.002) discard; gl_FragColor = vec4(mix(uLamp, uCol, vS) * a, 1.0); }`
  });
  const pts = new THREEH.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 8;
  scene.add(pts);
  NO_REFLECT.push(pts);
  HGS.dust = pts;
}
function planCompound() {
  const [bx, bz] = hgW(25.2, 1.5), [cx, cz] = hgW(-23.5, -5.6);
  MG.plan.push({ kind: "slab", x: bx, z: bz, y: HG.fy + HGB.h2, r: 1.85, rows: 4, front: 3, face: -Math.PI / 4, name: "крыша «Стройки»" });
  MG.plan.push({ kind: "slab", x: cx, z: cz, y: null, r: 1.08, rows: 3, front: 2, face: 3 * Math.PI / 4, name: "контейнеры" });
}
function slabNest(pl, R2) {
  const y = pl.y ?? HGX.contTop ?? HG.fy + 5.2, { x, z, face } = pl, r = pl.r ?? 1.85;
  const N = makeNest(pl, x, z, y, face);
  bagRing(N, x, z, y, r, pl.rows ?? 4, pl.front ?? 3, face + Math.PI, r < 1.3 ? 1.35 : 1.15, face, R2);
  linkBags(N);
  const fx = Math.sin(face), fz = Math.cos(face);
  box(M.planksDark, x - fx * 0.55, y + 0.02, z - fz * 0.55, 1.2, 0.04, 1, { rot: face, tile: 1 });
  // третий ящик с лентой стоит на втором, а не висит над случайной точкой
  let pb = null;
  for (let i = 0; i < 3; i++) {
    const a = face + Math.PI + sr(-1.2, 1.2), rr = sr(0.55, Math.max(0.7, r - 0.45));
    let px = x + Math.sin(a) * rr, pz = z + Math.cos(a) * rr, ry = R2() * TAU;
    if (i === 2 && pb) [px, pz, ry] = [pb[0], pb[1], pb[2] + sr(-0.25, 0.25)];
    box(M.olive, px, y + 0.09 + (i === 2 ? 0.18 : 0), pz, 0.3, 0.18, 0.16, { rot: ry, tile: 1 });
    pb = [px, pz, ry];
  }
  const g = new THREEH.CylinderGeometry(0.075, 0.08, 0.45, 10);
  for (let i = 0; i < 26; i++) {
    const a = face + Math.PI / 2 + sr(-1, 1), rr = Math.pow(R2(), 0.6) * (r - 0.4), px = x + Math.sin(a) * rr, pz = z + Math.cos(a) * rr;
    place(M.brass, g, px, y + 0.075, pz, [Math.PI / 2 + sr(-0.1, 0.1), R2() * TAU, 0]);
  }
}
function hgBeacons() {
  const g = new THREEH.SphereGeometry(0.13, 10, 8);
  for (const p of HGX.beacons) {
    const s = new THREEH.Mesh(g, HGX.beaconMat);
    s.position.copy(p);
    scene.add(s);
    addLamp({ kind: "bulb", x: p.x, y: p.y + 0.1, z: p.z, color: 16719904, power: 3, range: 9, blink: true, pool: 0, ground: HG.fy });
  }
}
function buildCompound() {
  const R = rng(1212);
  hgMats();
  hgHangar(R);
  hgInterior(R);
  hgFence(R);
  hgBooth(8.6, 39.4, 0, R);
  hgBooth(-8.6, -39.4, Math.PI, R);
  hgBuilding(R);
  hgYard(R);
  hgCrane(R);
  hgAprons(R);
  hgFloods(R);
  hgBeacons();
  hgShafts();
  hgDust();
  // все проблесковые огни площадки мигают в такт
  for (const L of LAMPS) if (L.blink && hgRho(L.pos.x, L.pos.z) < 1.4) L.seed = 0;
  HGX.built = true;
}
var THREEV = ctx.THREE;
var VV = (x, y, z) => new THREEV.Vector3(x, y, z);
function slateTex() {
  const S = TS(512), [c, x] = cv(S), [h, hx] = cv(S), K = S / 512;
  x.fillStyle = "#8d8f88";
  x.fillRect(0, 0, S, S);
  const waves = 8, wl = S / waves;
  for (let i = 0; i < S; i++) {
    const p = Math.sin(i / wl * TAU), v = 0.5 + 0.5 * p;
    x.fillStyle = `rgba(${150 + 30 * v | 0},${150 + 30 * v | 0},${142 + 28 * v | 0},.55)`;
    x.fillRect(i, 0, 1, S);
    hx.fillStyle = `rgb(${v * 255 | 0},${v * 255 | 0},${v * 255 | 0})`;
    hx.fillRect(i, 0, 1, S);
  }
  // нахлёст листов по высоте и чёрные потёки от гвоздей
  for (const y of [S * 0.33, S * 0.66]) {
    x.fillStyle = "rgba(40,40,36,.55)";
    x.fillRect(0, y, S, 3 * K);
    for (let i = 0; i < waves; i++) {
      const px = (i + 0.5) * wl, g = x.createLinearGradient(0, y, 0, y + 40 * K);
      g.addColorStop(0, "rgba(50,44,36,.5)");
      g.addColorStop(1, "rgba(50,44,36,0)");
      x.fillStyle = g;
      x.fillRect(px - 2 * K, y, 4 * K, 40 * K);
    }
  }
  // лишайник (жёлто-зелёные и серые пятна) и мох по впадинам
  for (let i = 0; i < 70; i++) blob(x, srnd() * S, srnd() * S, sr(4, 22) * K, srnd() < 0.5 ? [150, 156, 80] : [92, 104, 66], sr(0.25, 0.6));
  for (let i = 0; i < 260; i++) blob(x, srnd() * S, srnd() * S, sr(1, 4) * K, [60, 62, 52], sr(0.2, 0.5));
  grain(x, S, S, 0.08);
  return { map: tex(c), normal: tex(heightToNormal(h, 3.2), 1, 1, false) };
}
function shingleTex() {
  const S = TS(512), [c, x] = cv(S), [h, hx] = cv(S), K = S / 512;
  x.fillStyle = "#6f6a60";
  x.fillRect(0, 0, S, S);
  hx.fillStyle = "#808080";
  hx.fillRect(0, 0, S, S);
  const rows = 10, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let u = r % 2 ? -sr(4, 14) * K : 0;
    while (u < S) {
      const w = sr(16, 30) * K, v = sr(0.75, 1.2), y0 = r * rh;
      x.fillStyle = rgba(118 * v, 112 * v, 100 * v);
      x.fillRect(u, y0, w - 1.5 * K, rh);
      const g = hx.createLinearGradient(0, y0, 0, y0 + rh);
      g.addColorStop(0, "#606060");
      g.addColorStop(1, "#d0d0d0");
      hx.fillStyle = g;
      hx.fillRect(u, y0, w - 1.5 * K, rh);
      for (let k = 0; k < 4; k++) {
        x.fillStyle = `rgba(50,46,40,${sr(0.15, 0.4)})`;
        x.fillRect(u + srnd() * w, y0, 1 * K, rh);
      }
      x.fillStyle = "rgba(25,22,18,.85)";
      x.fillRect(u + w - 1.5 * K, y0, 1.5 * K, rh);
      u += w;
    }
    x.fillStyle = "rgba(20,18,14,.75)";
    x.fillRect(0, (r + 1) * rh - 2.5 * K, S, 2.5 * K);
    hx.fillStyle = "#000";
    hx.fillRect(0, (r + 1) * rh - 3 * K, S, 3 * K);
  }
  for (let i = 0; i < 40; i++) blob(x, srnd() * S, srnd() * S, sr(10, 40) * K, [70, 88, 46], sr(0.15, 0.4));
  grain(x, S, S, 0.07);
  return { map: tex(c), normal: tex(heightToNormal(h, 2.4), 1, 1, false) };
}
function nalAtlas() {
  const W = 1024, Hh = 256, [c, x] = cv(W, Hh);
  x.clearRect(0, 0, W, Hh);
  const cell = W / 4;
  const paint = (k) => k === 0 ? ["#e9e6dc", "#c8c3b4"] : ["#6c93b8", "#4d7194"];
  for (let i = 0; i < 4; i++) {
    const [fg, sh] = paint(i % 2), x0 = i * cell, top = i < 2;
    x.save();
    x.translate(x0, 0);
    x.fillStyle = fg;
    if (top) {
      // кокошник: фронтон с волютами, солярная розетка, подвески-капли
      x.beginPath();
      x.moveTo(6, Hh - 20);
      x.lineTo(6, Hh - 70);
      x.quadraticCurveTo(cell * 0.18, Hh - 110, cell * 0.3, Hh - 150);
      x.quadraticCurveTo(cell * 0.5, 10, cell * 0.7, Hh - 150);
      x.quadraticCurveTo(cell * 0.82, Hh - 110, cell - 6, Hh - 70);
      x.lineTo(cell - 6, Hh - 20);
      x.closePath();
      x.fill();
      x.globalCompositeOperation = "destination-out";
      x.beginPath();
      x.arc(cell / 2, Hh - 110, 34, 0, TAU);
      x.fill();
      for (let k = 0; k < 7; k++) {
        x.beginPath();
        x.arc(28 + k * (cell - 56) / 6, Hh - 46, 9, 0, TAU);
        x.fill();
      }
      x.globalCompositeOperation = "source-over";
      x.fillStyle = fg;
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * TAU;
        x.beginPath();
        x.ellipse(cell / 2 + Math.cos(a) * 18, Hh - 110 + Math.sin(a) * 18, 12, 4, a, 0, TAU);
        x.fill();
      }
      x.beginPath();
      x.arc(cell / 2, Hh - 110, 7, 0, TAU);
      x.fill();
      for (let k = 0; k < 9; k++) {
        const px = 16 + k * (cell - 32) / 8;
        x.beginPath();
        x.moveTo(px - 7, Hh - 22);
        x.lineTo(px + 7, Hh - 22);
        x.lineTo(px, Hh - 4);
        x.closePath();
        x.fill();
      }
      x.fillStyle = sh;
      x.fillRect(6, Hh - 26, cell - 12, 6);
    } else {
      // полотенце под подоконником: доска с городками и капельками
      x.fillRect(10, 10, cell - 20, 70);
      x.globalCompositeOperation = "destination-out";
      for (let k = 0; k < 6; k++) {
        x.beginPath();
        x.moveTo(30 + k * 36, 30);
        x.lineTo(44 + k * 36, 50);
        x.lineTo(30 + k * 36, 70);
        x.lineTo(16 + k * 36, 50);
        x.closePath();
        x.fill();
      }
      x.globalCompositeOperation = "source-over";
      x.fillStyle = fg;
      for (let k = 0; k < 11; k++) {
        const px = 18 + k * (cell - 36) / 10;
        x.beginPath();
        x.moveTo(px - 8, 78);
        x.quadraticCurveTo(px, 120, px + 8, 78);
        x.fill();
      }
      x.fillStyle = sh;
      x.fillRect(10, 10, cell - 20, 6);
    }
    x.restore();
  }
  // выветренная краска: облупы до дерева
  x.globalCompositeOperation = "source-atop";
  for (let i = 0; i < 260; i++) blob(x, srnd() * W, srnd() * Hh, sr(2, 9), [96, 84, 66], sr(0.3, 0.7));
  x.globalCompositeOperation = "source-over";
  const t = tex(c);
  t.wrapS = t.wrapT = THREEV.ClampToEdgeWrapping;
  return t;
}
var VSIGN = { cols: 2, rows: 4, list: ["ЗАРЕЧЬЕ", "ПРОДУКТЫ", "КЛУБ", "ПОЖАРНЫЙ ВОДОЁМ", "ВЕЧНАЯ ПАМЯТЬ", "ЗАРЕЧЬЕ ✕", "ОСТОРОЖНО ДЕТИ", "СЕЛЬПО №4"] };
function vSignAtlas() {
  const W = 1024, Hh = 1024, [c, x] = cv(W, Hh), cw = W / 2, ch = Hh / 4;
  const style = [["#f2f0e8", "#151515", 1], ["#2f5f8c", "#f0ecdc", 0], ["#a8261e", "#f2e6c8", 0], ["#d8d2c0", "#a8261e", 0], ["#2a2a28", "#d9b45a", 0], ["#f2f0e8", "#151515", 2], ["#e8c22a", "#151515", 0], ["#e6dcc4", "#2b4e7a", 0]];
  VSIGN.list.forEach((txt, i) => {
    const u = i % 2 * cw, v = Math.floor(i / 2) * ch, [bg, fg, kind] = style[i];
    x.fillStyle = bg;
    x.fillRect(u + 6, v + 6, cw - 12, ch - 12);
    x.strokeStyle = fg;
    x.lineWidth = 8;
    x.strokeRect(u + 18, v + 18, cw - 36, ch - 36);
    x.fillStyle = fg;
    x.textAlign = "center";
    x.textBaseline = "middle";
    const txt2 = txt.replace(" ✕", "");
    let fs = 92;
    x.font = `bold ${fs}px 'Arial Narrow', Arial, sans-serif`;
    while (x.measureText(txt2).width > cw - 70 && fs > 30) x.font = `bold ${fs -= 4}px 'Arial Narrow', Arial, sans-serif`;
    x.fillText(txt2, u + cw / 2, v + ch / 2 + 4);
    if (kind === 2) {
      // конец населённого пункта: красная диагональ
      x.strokeStyle = "#b8231a";
      x.lineWidth = 16;
      x.beginPath();
      x.moveTo(u + 40, v + ch - 40);
      x.lineTo(u + cw - 40, v + 40);
      x.stroke();
    }
    for (let k = 0; k < 40; k++) blob(x, u + srnd() * cw, v + srnd() * ch, sr(2, 10), [90, 70, 50], sr(0.1, 0.4));
  });
  return tex(c);
}
function vSignGeo(i, w, h, bk = i) {
  const cell = (j) => {
    const g = new THREEV.PlaneGeometry(w, h), uv = g.attributes.uv, cu = j % 2, cr = Math.floor(j / 2);
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (cu + uv.getX(k)) / 2, 1 - (cr + 1 - uv.getY(k)) / 4);
    return g;
  };
  /* v24: знак был одной DoubleSide-плоскостью — сзади надпись шла зеркально («ЕЬЧЕ»). Теперь две грани спиной
     к спине (материал FrontSide), оборот развёрнут на 180° и читается; bk — ячейка оборота (у дорожного
     въездного «ЗАРЕЧЬЕ» — перечёркнутое «ЗАРЕЧЬЕ», конец населённого пункта, как на настоящих указателях) */
  const back = cell(bk).rotateY(Math.PI);
  return ctx.BGU.mergeGeometries([cell(i), back], false) || cell(i);
}
function nalGeo(i, w, h) {
  const g = new THREEV.PlaneGeometry(w, h), uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (i + uv.getX(k)) / 4, uv.getY(k));
  return g;
}
function villageMats() {
  if (M.roofSlate) return;
  M.roofSlate = surf(slateTex(), { rough: 0.88, extra: { side: THREEV.DoubleSide } });
  M.roofShingle = surf(shingleTex(), { rough: 0.95, extra: { side: THREEV.DoubleSide } });
  M.planksBlue = surf(planks([82, 112, 140]), { rough: 0.88 });
  M.planksOchre = surf(planks([164, 132, 70]), { rough: 0.88 });
  M.planksGreen = surf(planks([84, 118, 84]), { rough: 0.88 });
  M.planksGrey = surf(planks([126, 122, 112]), { rough: 0.95 });
  M.charLog = surf(logWall(), { rough: 1, color: 2763308 });
  M.whitewash = std({ color: 14275784, roughness: 0.97 });
  M.soil = std({ color: 3812137, roughness: 1 });
  M.film = std({ color: 14214624, roughness: 0.35, transparent: true, opacity: 0.38, side: THREEV.DoubleSide, depthWrite: false });
  M.nal = std({ map: nalAtlas(), alphaTest: 0.5, side: THREEV.DoubleSide, roughness: 0.85 });
  M.vsign = std({ map: vSignAtlas(), roughness: 0.75, side: THREEV.FrontSide });  /* v24: оборот — своя грань в vSignGeo */
  M.puddle = std({ color: 1513233, roughness: 0.04, metalness: 0.05, transparent: true, opacity: 0.82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  M.hay = surf(hayTex(), { rough: 1, nscale: 1.2 });
  M.slab = surf(rustMetal([134, 132, 124], 0.05), { rough: 0.95, nscale: 0.6 });
  M.galv = std({ color: 9079434, roughness: 0.45, metalness: 0.75 });
  M.leafApple = foliage(shrubTex(), { alphaTest: 0.45, color: 12036180, glow: 723462 });
  M.leafLilac = foliage(shrubTex(), { alphaTest: 0.45, color: 7377746, glow: 528390 });
  M.apple = std({ color: 10760744, roughness: 0.55 });
}
var VILLAGE = { yards: [], items: [], beds: [], wells: [], puddles: [] };
function yardFrame(Y) {
  const sgn = Y.row === "in" ? -1 : 1, af = VIL.street + sgn * 3.6;
  return {
    p: (s, f) => vxz(af + sgn * f, Y.b + s),
    // поворот, при котором локальная ось +x постройки смотрит на улицу, а +z — вдоль улицы в сторону двора
    toStreet: (() => {
      const [dx, dz] = [-sgn * VU[0], -sgn * VU[1]];
      return Math.atan2(-dz, dx);
    })(),
    // лицом (+z) к улице
    face: Math.atan2(-sgn * VU[0], -sgn * VU[1]),
    // лицом вглубь двора
    back: Math.atan2(sgn * VU[0], sgn * VU[1]),
    // вдоль улицы (+s)
    along: Math.atan2(VN[0], VN[1]),
    sgn
  };
}
var VTYPES = {
  // изба-пятистенок: сруб 9×6,4, фасад на улицу — три окна в наличниках, кровля на 40°
  izba: (o) => ({ style: "log", w: 9.2, d: 6.4, h: 2.75, pitch: 0.72, fifth: 9.2 / 2 - 4.5 }),
  // дом с мезонином: каркас, обшит доской и покрашен; светёлка-мезонин над уличным фасадом, застеклённая веранда
  mezz: (o) => ({ style: "paint", w: 8.4, d: 7.2, h: 2.85, pitch: 0.62, mezz: { w: 3.4, d: 3.2, h: 2.25 } }),
  // совхозный кирпичный дом 1970-х: кладка в полтора кирпича, низкий шифер, без наличников
  brick: (o) => ({ style: "brick", w: 9.6, d: 7.6, h: 2.7, pitch: 0.42 })
};
var YARDS = [
  { row: "in", b: -46, W: 16, type: "izba", roof: "shingle", nal: 0, furnish: true, well: true, banya: true, green: false, apples: 3 },
  { row: "in", b: -30, W: 16, type: "burnt", banya: false, apples: 1 },
  { row: "in", b: -15, W: 15, type: "mezz", paint: "blue", roof: "rust", furnish: true, veranda: true, green: true, apples: 2, glow: true },
  { row: "in", b: 15, W: 15, type: "brick", roof: "slate", furnish: true, green: true, apples: 1, car: "sedan" },
  { row: "in", b: 30, W: 15.5, type: "izba", roof: "slate", nal: 1, banya: true, well: true, apples: 3 },
  { row: "in", b: 46, W: 16, type: "burnt", banya: true, apples: 2 },
  { row: "out", b: -46, W: 17, type: "brick", roof: "slate", apples: 2, green: true, car: "van" },
  { row: "out", b: -28, W: 17, type: "izba", roof: "rust", nal: 0, furnish: true, apples: 2, banya: false },
  { row: "out", b: 28, W: 17, type: "mezz", paint: "ochre", roof: "slate", furnish: true, veranda: true, well: true, apples: 2 },
  { row: "out", b: 46, W: 17, type: "izba", roof: "shingle", nal: 1, damage: 0.75, apples: 3, abandoned: true }
];
var vPad = (x, z, hw, hd, rot, m = 2.5) => {
  const p = addPad(x, z, hw, hd, rot, m);
  PLANS.push({ x, z, hw: hw - 0.3, hd: hd - 0.3, rot });
  return p;
};
function planVillage() {
  const R2 = rng(4242);
  for (const Y of YARDS) {
    const F = yardFrame(Y), D = Y.row === "in" ? VIL.street - 3.6 - VIL.inner0 : VIL.outer1 - VIL.street - 3.6;
    Y.D = D;
    Y.F = F;
    VILLAGE.yards.push(Y);
    // дом: торцом на улицу (у мезонина — длинным фасадом), отступ палисадника 3 м
    const side = Y.row === "in" ? 1 : -1;
    if (Y.type === "burnt") {
      const w = 8.6, d = 6.2, s = side * (Y.W / 2 - d / 2 - 1.1), f = 3 + w / 2, [x, z] = F.p(s, f);
      Y.house = { kind: "burnt", x, z, rot: F.toStreet, w, d, seed: 900 + Math.round(Y.b) };
      Y.house.pad = vPad(x, z, w / 2 + 0.5, d / 2 + 0.5, F.toStreet, 2.5);
    } else {
      const T = VTYPES[Y.type](Y), long = Y.type === "mezz";
      const w = T.w, d = T.d;
      // мезонинный дом стоит длинной стороной к улице: его «front» (+z) — на улицу
      let s = long ? side * (Y.W / 2 - w / 2 - 1.2) : side * (Y.W / 2 - d / 2 - 1.1);
      const f = long ? 3 + d / 2 : 3 + w / 2;
      const rot = long ? F.face : F.toStreet;
      if (Y.veranda) {
        // веранда пристроена к правому (+x) торцу: дом сдвигается так, чтобы она с крыльцом помещалась во дворе,
        // а не упиралась в соседский забор (раньше забор проходил прямо через веранду и вход был закрыт)
        const [ax, az] = F.p(0, f), [bx, bz] = F.p(1, f), k = Math.sign((bx - ax) * Math.cos(rot) - (bz - az) * Math.sin(rot)) || 1;
        s = -k * 1.0;
      }
      const [x, z] = F.p(s, f);
      const H = {
        kind: "house",
        id: "vil_" + Y.row + Y.b,
        vtype: Y.type,
        x,
        z,
        rot,
        ...T,
        seed: 500 + Math.round(Y.b * 3) + (Y.row === "in" ? 0 : 77),
        damage: Y.damage ?? (Y.type === "brick" ? 0.22 : 0.38),
        roof: Y.roof,
        nal: Y.nal,
        interior: !!Y.furnish,
        furnish: Y.furnish ? villageFurnish : (o, R3, F2, fy, B) => {
          interiorWalls(o, R3, fy);
        },
        glow: Y.glow ? Y.type === "mezz" ? [T.w / 2 - 1.35, T.d / 2 - 1.15] : [0.5, 0.5] : void 0
      };
      if (Y.type === "izba") {
        // фасад: три окна в улицу; по длинным стенам — по два-три; вход с крыльцом со двора, в сенях
        H.windows = [{ side: "right", at: -1.95, w: 0.85 }, { side: "right", at: 0, w: 0.85 }, { side: "right", at: 1.95, w: 0.85 }, { side: "front", at: 2.6, w: 0.85 }, { side: "front", at: 0.6, w: 0.85 }, { side: "back", at: 2.6, w: 0.85 }, { side: "back", at: -1.2, w: 0.85 }, { side: "left", at: 1.4, w: 0.7 }];
        H.door = { side: "front", at: -2.6 };
        H.wallMat = M.logWall;
        H.trimMat = Y.nal === 1 ? M.planksBlue : M.planksWhite;
        H.rstove = [H.fifth - 1.05, -H.d / 2 + 1.15];
        H.cellarHatch = true;
      } else if (Y.type === "mezz") {
        H.windows = [{ side: "front", at: -2.6 }, { side: "front", at: 2.6 }, { side: "back", at: -2 }, { side: "back", at: 1.5 }, { side: "left", at: 1.6 }, { side: "left", at: -1.6 }, { side: "right", at: -1.6 }];
        H.door = { side: "right", at: 1.6 };
        H.wallMat = Y.paint === "blue" ? M.planksBlue : M.planksOchre;
        H.trimMat = M.planksWhite;
        H.rstove = [-H.w / 2 + 1.3, -H.d / 2 + 1.2];
        H.veranda = Y.veranda ? { side: "right", w: 4.2, d: 2.6 } : null;
      } else {
        H.windows = [{ side: "right", at: -2, w: 1.4, y0: 0.8, y1: 2.05 }, { side: "right", at: 2, w: 1.4, y0: 0.8, y1: 2.05 }, { side: "front", at: 2.4, w: 1.4, y0: 0.8, y1: 2.05 }, { side: "front", at: -1.2, w: 1.1, y0: 0.8, y1: 2.05 }, { side: "back", at: 1.8, w: 1.4, y0: 0.8, y1: 2.05 }, { side: "back", at: -2.4, w: 1.1, y0: 0.8, y1: 2.05 }, { side: "left", at: 1.8, w: 0.7, y0: 1.2, y1: 2 }];
        H.door = { side: "front", at: -3.4 };
        H.wallMat = M.hgBrick;
        H.trimMat = M.planksWhite;
        H.gableMat = M.planksGrey;
        H.stove = [-H.w / 2 + 1.2, -H.d / 2 + 1.4];
      }
      H.pad = vPad(x, z, w / 2 + 0.7, d / 2 + 1.2, rot, 3);
      Y.house = H;
    }
    // хозяйственный угол: сарай на задворках, баня у оврага, поленница у сарая
    const yardSide = -side;
    Y.shed = { at: Y.F.p(yardSide * (Y.W / 2 - 2.6), D - 2.2), rot: F.back };
    {
      const [x, z] = Y.shed.at;
      Y.shed.pad = vPad(x, z, 2.4, 1.9, F.back, 2);
    }
    if (Y.banya) {
      Y.banyaAt = { at: Y.F.p(side * (Y.W / 2 - 2.3), D - 2), rot: F.face };
      {
        // дверь бани — в торце, обращённом во двор: фасадом она смотрит в заднюю стену дома, там не пройти
        const [ax, az] = F.p(0, 0), [bx, bz] = F.p(1, 0), k = Math.sign((bx - ax) * Math.cos(F.face) - (bz - az) * Math.sin(F.face)) || 1;
        Y.banyaAt.door = k * side > 0 ? "left" : "right";
      }
      const [x, z] = Y.banyaAt.at;
      Y.banyaAt.pad = vPad(x, z, 2.2, 1.9, F.face, 2);
    }
    // огород: гряды поперёк двора; теплица из дуг под плёнкой
    Y.beds = [];
    const s0 = yardSide * 1.2, s1 = yardSide * (Y.W / 2 - 1.2);
    for (let k = 0; k < 4; k++) Y.beds.push({ s: (s0 + s1) / 2, f: 6.5 + k * 1.5, L: Math.abs(s1 - s0) - 0.6 });
    if (Y.green) {
      Y.greenAt = { at: Y.F.p(yardSide * (Y.W / 2 - 2.4), D - 7.2), rot: F.face };
      const [x, z] = Y.greenAt.at;
      keep(x, z, 2.9);
      Y.beds = Y.beds.filter((g) => Math.abs(g.f - (D - 7.2)) > 1.9);
    }
    // колодец-журавль у палисадника
    if (Y.well) {
      const [x, z] = Y.F.p(yardSide * (Y.W / 2 - 1.8), 1.8);
      VILLAGE.wells.push({ x, z, rot: F.along + R2.range(-0.5, 0.5) });
      keep(x, z, 1.5);
    }
    // ворота и калитка — между домом и огородом; машина во дворе
    Y.gateS = yardSide * 1.8;
    Y.gatePts = [Y.F.p(Y.gateS, 0), Y.F.p(Y.gateS + yardSide * 3, 0), Y.F.p(Y.gateS + yardSide * 3, 1.2)];
    // проход к калитке и воротам свободен: ни пней, ни машин, ни лавок
    for (const [gx, gz] of Y.gatePts) keep(gx, gz, 1.6);
    for (const f of [-1.6, -3]) keep(...Y.F.p(Y.gateS + yardSide * 3, f), 1.4);
    if (Y.car) {
      // машина — прямо за воротами, калитка и проход к дому свободны
      const [x, z] = Y.F.p(Y.gateS, 4.9);
      Y.carAt = { x, z, rot: F.back + R2.range(-0.08, 0.08) };
      keep(x, z, 2.6);
    }
  }
  // площадь: обелиск напротив въезда, сельпо и клуб по сторонам, остановка
  {
    const [x, z] = vxz(VIL.street + 9.5, 0.4);
    VILLAGE.obelisk = { x, z, rot: Math.atan2(-VU[0], -VU[1]) };
    vPad(x, z, 3.4, 3.4, VILLAGE.obelisk.rot, 3);
  }
  {
    const Fc = yardFrame({ row: "out", b: -11 }), [x, z] = Fc.p(0, 3.2 + 3.6);
    VILLAGE.club = { kind: "house", id: "club", x, z, rot: Fc.face, style: "paint", w: 11.5, d: 7.2, h: 3.3, pitch: 0.5, roof: "rust", wallMat: M.planksGreen, trimMat: M.planksWhite, seed: 811, damage: 0.4, windows: [{ side: "front", at: -3.8, w: 1.2, y0: 0.9, y1: 2.4 }, { side: "front", at: 3.8, w: 1.2, y0: 0.9, y1: 2.4 }, { side: "back", at: -3, w: 1.2, y0: 0.9, y1: 2.4 }, { side: "back", at: 3, w: 1.2, y0: 0.9, y1: 2.4 }, { side: "left", at: 0, w: 1.2, y0: 0.9, y1: 2.4 }], door: { side: "front", at: 0 }, door2: { side: "back", at: -4.6 }, interior: true, furnish: clubFurnish, signIdx: 2 };
    VILLAGE.club.pad = vPad(x, z, 6.4, 5.4, Fc.face, 3);
  }
  {
    const Fs = yardFrame({ row: "out", b: 11.5 }), [x, z] = Fs.p(0, 2.6 + 3);
    VILLAGE.shop = { kind: "house", id: "shop", x, z, rot: Fs.face, style: "brick", w: 8, d: 6, h: 2.9, pitch: 0.4, roof: "slate", wallMat: M.hgBrick, trimMat: M.planksWhite, gableMat: M.planksGrey, seed: 822, damage: 0.3, windows: [{ side: "front", at: -2.3, w: 1.5, y0: 0.9, y1: 2.2, bars: true }, { side: "left", at: 0, w: 0.9, y0: 1.2, y1: 2.1, bars: true }, { side: "back", at: 1.8, w: 0.8, y0: 1.3, y1: 2.1, bars: true }], door: { side: "front", at: 1.6 }, interior: true, furnish: shopFurnish, signIdx: 1 };
    VILLAGE.shop.pad = vPad(x, z, 4.6, 4.2, Fs.face, 3);
    // остановка у площади
    const [bx, bz] = vxz(VIL.street + 4.6, 5.6);
    VILLAGE.stop = { x: bx, z: bz, rot: Math.atan2(-VU[0], -VU[1]) };
    keep(bx, bz, 2.6);
  }
  // пожарный водоём на северном конце улицы
  {
    const [x, z] = vxz(VIL.street + 13, -64);
    VILLAGE.pond = { x, z, rot: Math.atan2(VN[0], VN[1]), hw: 4.6, hd: 4.6 };
    const p = vPad(x, z, 6.2, 6.2, VILLAGE.pond.rot, 3);
    addDig({ x, z, hw: 4.6, hd: 4.6, rot: VILLAGE.pond.rot, depth: 1.9, pad: p });
  }
  // ящик с боеприпасами — во дворе клуба (нейтральный, на равном расстоянии от обеих баз)
  {
    const Fc = yardFrame({ row: "out", b: -11 }), [x, z] = Fc.p(-4.6, 13.5);
    CRATES.push({ x, z, rot: Fc.back, name: "Заречье, клуб", s: 0.62 });
    keep(x, z, 3.2);
  }
  // общий журавль на площади
  {
    const [x, z] = vxz(VIL.street - 5.2, 5.5);
    VILLAGE.wells.push({ x, z, rot: 0.4 });
    keep(x, z, 1.5);
  }
  // дорожные знаки населённого пункта
  VILLAGE.signs = [[vxz(98.5, -3.4), Math.atan2(VU[0], VU[1]), 0], [vxz(VIL.street + 3.8, -60), Math.atan2(VN[0], VN[1]), 0], [vxz(VIL.street - 3.8, 61), Math.atan2(-VN[0], -VN[1]), 0]];
  for (const [[x, z]] of VILLAGE.signs) keep(x, z, 0.8);
  // лужи в колеях
  const Rp = rng(919);
  for (const p of [ROADS.street, ROADS.main2, ROADS.north, ROADS.south, ROADS.main]) {
    for (let s = 3; s < p.len - 3; s += Rp.range(4, 9)) {
      if (Rp() < 0.45) continue;
      const q = polyAt(p.pts, s), e = Rp() < 0.5 ? -1 : 1;
      if (streamAt(q.x, q.z).d < STREAM_BW + RAV.w + 3) continue;
      VILLAGE.puddles.push({ x: q.x - q.tz * 0.95 * e, z: q.z + q.tx * 0.95 * e, rot: Math.atan2(q.tx, q.tz), L: Rp.range(1.2, 3.4), W: Rp.range(0.45, 0.9) });
      if (Rp() < 0.3) VILLAGE.puddles.push({ x: q.x, z: q.z, rot: Math.atan2(q.tx, q.tz) + Rp.range(-0.4, 0.4), L: Rp.range(1.5, 3), W: Rp.range(1, 2.2) });
    }
  }
}
function villageSplat(x, z) {
  if (!VILLAGE.yards.length) return 0;
  if (!inVillage(x, z, 0)) return 0;
  const [a, b] = vab(x, z);
  for (const Y of VILLAGE.yards) {
    if (Math.abs(b - Y.b) > Y.W / 2) continue;
    const f = Y.row === "in" ? VIL.street - 3.6 - a : a - VIL.street - 3.6, s = b - Y.b;
    if (f < 0 || f > Y.D) continue;
    for (const g of Y.beds) if (Math.abs(f - g.f) < 0.75 && Math.abs(s - g.s) < g.L / 2 + 0.4) return 0.85;
    // вытоптанный двор у крыльца и ворот
    if (f < 6 && Math.abs(s - Y.gateS) < 3) return 0.3;
  }
  return 0;
}
var VB = { lilac: [], apples: [] };
var _vsides = (o) => {
  const WT = WALL_T, w = o.w, d = o.d;
  return {
    front: { c: [0, d / 2 - WT / 2], ax: [1, 0], n: [0, 1], r: 0 },
    back: { c: [0, -d / 2 + WT / 2], ax: [1, 0], n: [0, -1], r: Math.PI },
    left: { c: [-w / 2 + WT / 2, 0], ax: [0, -1], n: [-1, 0], r: -Math.PI / 2 },
    right: { c: [w / 2 - WT / 2, 0], ax: [0, -1], n: [1, 0], r: Math.PI / 2 }
  };
};
var _wallsOf = (S) => S.panels.filter((p) => p.kind === "wall");
function vNalichniki(o, F, fy, S) {
  if (o.nal === void 0 || o.nal === null) return;
  const sd = _vsides(o), ti = o.nal === 1 ? 1 : 0;
  panel("trim", { hp: 0.3, sup: { list: _wallsOf(S), frac: 0.45 }, density: 400 });
  for (const win of o.windows || []) {
    const q = sd[win.side], fw = win.w ?? 1, y0 = win.y0 ?? 0.85, y1 = win.y1 ?? 1.85;
    const lx = q.c[0] + q.ax[0] * win.at + q.n[0] * 0.135, lz = q.c[1] + q.ax[1] * win.at + q.n[1] * 0.135;
    const [x, z] = F.p(lx, lz), rot = o.rot + q.r;
    place(M.nal, nalGeo(ti, fw + 0.56, 0.6), x, fy + y1 + 0.38, z, rot, 1, { cast: false });
    place(M.nal, nalGeo(2 + ti, fw + 0.36, 0.34), x, fy + y0 - 0.22, z, rot, 1, { cast: false });
  }
  noPanel();
}
function vRussianStove(o, B, F, fy, top, hr) {
  const [sx, sz] = o.rstove;
  panel("prop", { hp: 3, mode: "rigid", density: 1800, float: 0, burnable: false });
  B(M.whitewash, sx, fy + 0.8, sz, 1.5, 1.6, 2, { collide: true, tile: 1 });
  B(M.whitewash, sx, fy + 1.95, sz + 0.55, 1.3, 0.7, 0.8, { tile: 1 });
  B(M.whitewash, sx, fy + 0.86, sz + 1.12, 1.3, 0.08, 0.28, { tile: 1 });
  B(M.dark, sx, fy + 1.05, sz + 1.005, 0.5, 0.4, 0.02, { tile: 1 });
  B(M.dark, sx, fy + 0.3, sz + 1.005, 0.6, 0.32, 0.02, { tile: 1 });
  B(M.brick, sx, (fy + 2.3 + top) / 2, sz + 0.55, 0.52, top - fy - 2.3 + 0.02, 0.52, { tile: 0.6 });
  const [cx, cz] = F.p(sx, sz + 0.55);
  addBox(cx, (fy + 1.6 + top) / 2, cz, 0.55, top - fy - 1.6, 0.55, o.rot);
  const roofY = top + hr * Math.max(0, 1 - Math.abs(sz + 0.55) / (o.d / 2)), ch = roofY - top + 0.75;
  panel("prop", { hp: 2.2, mode: "rigid", density: 1800, float: 0, burnable: false });
  B(M.brick, sx, top + ch / 2, sz + 0.55, 0.52, ch, 0.52, { tile: 0.6 });
  B(M.brick, sx, top + ch + 0.04, sz + 0.55, 0.64, 0.08, 0.64, { tile: 0.6 });
  addBox(cx, top + ch / 2, cz, 0.55, ch, 0.55, o.rot);
  VCHIM.push({ x: cx, z: cz, y: top + ch + 0.12, o, pn: curPanel() });
  noPanel();
}
function vFifthWall(o, B, F, fy) {
  const x = o.fifth, h = o.h, d = o.d, WT = WALL_T, L = d - 2 * WT;
  panel("wall", { hp: 1.6, mode: "rigid", density: 600 });
  const rows = Math.round(h / 0.225), rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const y = fy + (r + 0.5) * rh;
    if (y - fy < 2.05) {
      const a = (L / 2 - 0.5) / 2;
      boardTag();
      B(M.logWall, x, y, -0.5 - a, WT, rh, L / 2 - 0.5, { tile: 0.9 });
      boardTag();
      B(M.logWall, x, y, 0.5 + a, WT, rh, L / 2 - 0.5, { tile: 0.9 });
    } else {
      boardTag();
      B(M.logWall, x, y, 0, WT, rh, L, { tile: 0.9 });
    }
  }
  boardTag(false);
  for (const e of [-1, 1]) {
    const [cx, cz] = F.p(x, e * (L / 4 + 0.25));
    addBox(cx, fy + h / 2, cz, WT, h, L / 2 - 0.5, o.rot, { walk: false });
  }
  noPanel();
  const stub = new THREEV.CylinderGeometry(0.115, 0.115, 0.36, 7);
  for (const e of [-1, 1]) for (let y = 0.1; y < h; y += 0.45) {
    const [px, pz] = F.p(x, e * (d / 2 + 0.1));
    place(M.logEnd, stub, px, fy + y, pz, [Math.PI / 2, o.rot, 0]);
  }
}
function vMezzanine(o, B, F, fy, S) {
  const m = o.mezz, mw = m.w, md = m.d, mh = m.h, top = fy + o.h, WT = 0.12;
  const z1 = o.d / 2, z0 = z1 - md, zc = (z0 + z1) / 2, mat = o.wallMat, sup = { list: _wallsOf(S), frac: 0.4 };
  panel("wall", { hp: 0.9, sup, density: 450 });
  for (const e of [-1, 1]) B(mat, e * (mw / 2 - WT / 2), top + mh / 2, zc, WT, mh, md, { tile: 1.5, vertical: true });
  B(mat, 0, top + mh / 2, z0 + WT / 2, mw, mh, WT, { tile: 1.5, vertical: true });
  // фасад с окном 0,9×1,0
  const wy0 = 0.55, wy1 = 1.6, ww = 0.9;
  B(mat, -(mw / 4 + ww / 4), top + mh / 2, z1 - WT / 2, mw / 2 - ww / 2, mh, WT, { tile: 1.5, vertical: true });
  B(mat, mw / 4 + ww / 4, top + mh / 2, z1 - WT / 2, mw / 2 - ww / 2, mh, WT, { tile: 1.5, vertical: true });
  B(mat, 0, top + wy0 / 2, z1 - WT / 2, ww, wy0, WT, { tile: 1.5 });
  B(mat, 0, top + (wy1 + mh) / 2, z1 - WT / 2, ww, mh - wy1, WT, { tile: 1.5 });
  for (const e of [-1, 1]) B(o.trimMat, e * (ww / 2 + 0.04), top + (wy0 + wy1) / 2, z1 + 0.02, 0.08, wy1 - wy0 + 0.1, 0.04, { tile: 1 });
  B(o.trimMat, 0, top + wy1 + 0.06, z1 + 0.02, ww + 0.2, 0.1, 0.05, { tile: 1 });
  B(o.trimMat, 0, top + wy0 - 0.03, z1 + 0.05, ww + 0.2, 0.06, 0.12, { tile: 1 });
  B(o.trimMat, 0, top + (wy0 + wy1) / 2, z1 - 0.06, 0.05, wy1 - wy0, 0.05, { tile: 1 });
  for (const e of [-1, 1]) {
    const [px, pz] = F.p(e * ww / 4, z1 - 0.06);
    addPane(px, top + (wy0 + wy1) / 2, pz, [0, o.rot, 0], ww / 2 - 0.05, wy1 - wy0 - 0.04);
  }
  for (const e of [-1, 1]) {
    const [px, pz] = F.p(e * (mw / 2 - WT / 2), zc);
    addBox(px, top + mh / 2, pz, WT, mh, md, o.rot, { walk: false });
  }
  // кровля мезонина: двускатная, конёк перпендикулярен основному
  const p = 0.72, hrm = mw / 2 * Math.tan(p), Dm = mw / 2 + 0.3, Lm = Dm / Math.cos(p), mt = top + mh;
  panel("roof", { hp: 0.7, sup: { list: S.panels.slice(-3), frac: 0.5 }, density: 1200, float: 0, burnable: o.roof === "shingle" });
  for (const e of [-1, 1]) B(o.roofMat, e * Dm / 2, mt + hrm - Dm / 2 * Math.tan(p), zc + 0.2, Lm, 0.03, md + 0.75, { rz: -e * p, tile: 1.2 });
  B(M.planksDark, 0, mt + hrm - 0.02, zc + 0.2, 0.14, 0.14, md + 0.8, { tile: 1 });
  const tri = new THREEV.Shape();
  tri.moveTo(-mw / 2, 0);
  tri.lineTo(mw / 2, 0);
  tri.lineTo(0, hrm);
  tri.closePath();
  const tg = new THREEV.ExtrudeGeometry(tri, { depth: 0.08, bevelEnabled: false });
  for (const zz of [z1 - 0.08, z0]) {
    const [gx, gz] = F.p(0, zz);
    place(mat, tg, gx, mt, gz, o.rot);
  }
  const [cx, cz] = F.p(0, zc);
  addBox(cx, mt + hrm / 2, cz, mw + 0.6, hrm, md + 0.7, o.rot, { walk: true });
  vMezzRoom(o, B, F, fy, S, { mw, md, mh, top, WT, z0, z1, wallP: S.panels[S.panels.length - 2] });
  noPanel();
}
function vMezzRoom(o, B, F, fy, S, m) {
  const { mw, mh, top, WT, z0, z1 } = m, R2 = rng(o.seed + 31);
  const iw = mw / 2 - WT, zi0 = z0 + WT, zi1 = z1 - WT;
  const nS = 12, rise = o.h / nS, run = 0.26, Xt = iw - 0.28, X0 = Xt - (nS - 1) * run;
  const hx0 = X0 + 3 * run - 0.04, hz1 = 1.62, sz0 = zi0 + 0.06, sz1 = hz1 - 0.08, szc = (sz0 + sz1) / 2;
  // перекрытие: балки + пол, по краю проёма — обвязка
  const fl = panel("prop", { hp: 1.4, sup: { list: _wallsOf(S), frac: 0.4 }, density: 520 });
  for (const [a0, a1, b0, b1] of [[-iw, hx0, zi0, hz1], [-iw, iw, hz1, zi1], [Xt, iw, zi0, hz1]])
    B(M.planks, (a0 + a1) / 2, top - 0.05, (b0 + b1) / 2, a1 - a0, 0.1, b1 - b0, { tile: 1.2, collide: true });
  for (const zz of [hz1 + 0.06, 2.4, 3.05]) if (zz < zi1 - 0.1) B(M.planksDark, 0, top - 0.17, zz, mw - 0.1, 0.16, 0.1, { tile: 1 });
  B(M.planksDark, (hx0 - iw) / 2 - 0.05, top - 0.17, (zi0 + hz1) / 2, 0.1, 0.16, hz1 - zi0, { tile: 1 });
  B(M.planksDark, hx0 + 0.05, top - 0.17, (zi0 + hz1) / 2, 0.1, 0.16, hz1 - zi0, { tile: 1 });
  // лестница
  panel("prop", { hp: 1.2, density: 520 });
  for (let k = 1; k < nS; k++) {
    const xa = X0 + (k - 1) * run, y = fy + k * rise;
    B(M.planks, xa + run / 2 + 0.015, y - 0.022, szc, run + 0.03, 0.045, sz1 - sz0, { tile: 1 });
    B(M.planksDark, xa + 0.012, y - rise / 2 - 0.02, szc, 0.024, rise - 0.04, sz1 - sz0 - 0.06, { tile: 1 });
    const [px, pz] = F.p(xa + run / 2, szc);
    addBox(px, fy + k * rise / 2, pz, run, k * rise, sz1 - sz0, o.rot, { walk: true });
  }
  const Ls = Math.hypot(Xt - X0, o.h - rise), aS = Math.atan2(o.h - rise, Xt - X0);
  for (const zz of [sz0 + 0.025, sz1 - 0.025]) B(M.planksDark, (X0 + Xt) / 2, fy + (o.h - rise) / 2 - 0.1, zz, Ls + 0.1, 0.24, 0.05, { rz: aS, tile: 1 });
  // перила марша и ограждение проёма
  const bal = (lx, lz, y0, hh) => B(M.planksWhite, lx, y0 + hh / 2, lz, 0.045, hh, 0.045, { tile: 1 });
  B(M.planksWhite, (X0 + Xt) / 2, fy + (o.h - rise) / 2 + 0.92, sz1 + 0.03, Ls, 0.06, 0.07, { rz: aS, tile: 1 });
  for (let k = 1; k < nS; k += 2) bal(X0 + (k - 0.5) * run, sz1 + 0.03, fy + k * rise, 0.9);
  const ry = top + 0.95, rail = hx0 + 1.25;
  B(M.planksWhite, (hx0 + rail) / 2, ry, hz1 + 0.04, rail - hx0, 0.06, 0.07, { tile: 1 });
  B(M.planksWhite, hx0 - 0.04, ry, (zi0 + hz1) / 2, 0.07, 0.06, hz1 - zi0, { tile: 1 });
  for (let x = hx0; x <= rail + 0.01; x += (rail - hx0) / 4) bal(x, hz1 + 0.04, top, 0.95);
  for (let z = zi0 + 0.1; z < hz1; z += (hz1 - zi0) / 3) bal(hx0 - 0.04, z, top, 0.95);
  for (const [lx, lz, sx, sz] of [[(hx0 + rail) / 2, hz1 + 0.04, rail - hx0, 0.08], [hx0 - 0.04, (zi0 + hz1) / 2, 0.08, hz1 - zi0]]) {
    const [px, pz] = F.p(lx, lz);
    addBox(px, top + 0.5, pz, sx, 1, sz, o.rot, { walk: false });
  }
  // задняя и уличная стены светёлки — тоже препятствие
  panel("prop", { hp: 0.6, sup: { list: [fl], frac: 0.5 }, density: 600 });
  for (const zz of [z0 + WT / 2, z1 - WT / 2]) {
    const [px, pz] = F.p(0, zz);
    addBox(px, top + mh / 2, pz, mw, mh, WT, o.rot, { walk: false });
  }
  // обстановка: железная кровать у окна, сундук, половик
  const bx = -iw + 1.05, bz = zi1 - 0.5;
  B(M.rust, bx, top + 0.42, bz, 1.95, 0.04, 0.9, { tile: 1, collide: true });
  for (const e of [-1, 1]) B(M.rust, bx + e * 0.97, top + (e < 0 ? 0.55 : 0.45), bz, 0.04, e < 0 ? 1.1 : 0.9, 0.9, { tile: 1 });
  B(M.canvas, bx, top + 0.52, bz, 1.85, 0.14, 0.82, { tile: 1, r: R2.range(-0.05, 0.05) });
  B(M.plaster, bx - 0.7, top + 0.65, bz, 0.4, 0.12, 0.6, { tile: 1 });
  B(M.planksDark, iw - 0.45, top + 0.27, zi1 - 0.45, 0.8, 0.54, 0.5, { tile: 1, collide: true, r: R2.range(-0.1, 0.1) });
  B(M.canvas, 0.2, top + 0.008, 2.25, 1.6, 0.012, 0.8, { tile: 1, r: R2.range(-0.15, 0.15) });
}
function vVeranda(o, B, F, fy, S) {
  const v = o.veranda, door = o.door, vw = v.w, vd = v.d, h = 2.3;
  const zc = clamp(-door.at, -o.d / 2 + vw / 2, o.d / 2 - vw / 2), x0 = o.w / 2, x1 = x0 + vd, xc = (x0 + x1) / 2;
  {
    const [gx, gz] = F.p(xc, zc);
    gexAdd({ x: gx, z: gz, hw: vd / 2 + 0.05, hd: vw / 2 + 0.05, rot: o.rot });
  }
  const posts = [];
  panel("prop", { hp: 0.7, density: 450 });
  B(M.planksDark, xc, fy - 0.05, zc, vd, 0.1, vw, { tile: 1.2, collide: true });
  for (const [a, b] of [[x1 - 0.05, zc - vw / 2 + 0.05], [x1 - 0.05, zc + vw / 2 - 0.05], [x0 + 0.05, zc - vw / 2 + 0.05], [x0 + 0.05, zc + vw / 2 - 0.05]]) {
    B(M.planksWhite, a, fy + h / 2, b, 0.1, h, 0.1, { tile: 1, vertical: true });
    B(M.concrete, a, fy - 0.25, b, 0.3, 0.5, 0.3, { tile: 0.8 });
  }
  posts.push(curPanel());
  const faces = [
    { L: vw, p: (u) => [x1 - 0.03, zc - vw / 2 + u], r: Math.PI / 2, door: true },
    { L: vd, p: (u) => [x0 + u, zc - vw / 2 + 0.03], r: Math.PI },
    { L: vd, p: (u) => [x0 + u, zc + vw / 2 - 0.03], r: 0 }
  ];
  const R2 = rng(o.seed + 77);
  for (const f of faces) {
    const nc = Math.max(2, Math.round(f.L / 0.42)), cw = f.L / nc, dc = f.door ? [Math.floor(nc / 2) - 1, Math.floor(nc / 2)] : [];
    panel("wall", { hp: 0.6, sup: { list: posts, frac: 0.5 }, density: 450 });
    for (let i = 0; i < nc; i++) {
      const u = (i + 0.5) * cw, [lx, lz] = f.p(u), isDoor = dc.includes(i);
      if (!isDoor) B(M.planksWhite, lx, fy + 0.45, lz, cw, 0.9, 0.04, { r: f.r, tile: 1, vertical: true });
      const [mx, mz] = f.p(i * cw);
      if (i > 0) B(M.planksWhite, mx, fy + (isDoor ? 1.05 : 1.5), mz, 0.04, isDoor ? 2.1 : 1.3, 0.05, { r: f.r, tile: 1 });
      for (let r = 0; r < 3; r++) {
        const y0 = 0.9 + r * 0.42, [px, pz] = F.p(lx, lz);
        if (isDoor && r < 3 && y0 < 2.05) continue;
        if (R2() < 0.22) continue;
        addPane(px, fy + y0 + 0.21, pz, [0, o.rot + f.r, 0], cw - 0.05, 0.38, { tint: 1 });
      }
    }
    for (const y of [0.9, 1.32, 1.74, 2.16]) {
      const [lx, lz] = f.p(f.L / 2);
      B(M.planksWhite, lx, fy + y, lz, f.L, 0.04, 0.05, { r: f.r, tile: 1 });
    }
    // у дверной стороны в ограждении — проём (раньше коллизия перекрывала его целиком и на веранду было не войти)
    const segs = f.door ? [[0, dc[0] * cw], [(dc[dc.length - 1] + 1) * cw, f.L]] : [[0, f.L]];
    for (const [u0, u1] of segs) {
      const [lx, lz] = f.p((u0 + u1) / 2), [wx, wz] = F.p(lx, lz);
      addBox(wx, fy + 0.45, wz, u1 - u0, 0.9, 0.06, o.rot + f.r, { walk: false });
    }
    if (f.door) {
      // ступенька у входа: пол веранды на 0,42 выше земли
      const [lx, lz] = f.p((dc[0] + 1) * cw);
      B(M.planksDark, lx + 0.25, fy - 0.24, lz, 0.42, 0.06, cw * 2 + 0.3, { tile: 1, collide: true });
      for (const e of [-1, 1]) B(M.planksDark, lx + 0.25, fy - 0.45, lz + e * (cw + 0.05), 0.4, 0.4, 0.06, { tile: 1 });
    }
  }
  // односкатная крыша от стены дома
  const y0 = fy + o.h - 0.05, y1 = fy + h + 0.08, slope = Math.atan2(y0 - y1, vd + 0.3), Lr = Math.hypot(vd + 0.3, y0 - y1);
  panel("roof", { hp: 0.6, sup: { list: posts, frac: 0.5 }, density: 1200, float: 0, burnable: o.roof === "shingle" });
  B(o.roofMat, xc + 0.15, (y0 + y1) / 2 + 0.05, zc, Lr, 0.03, vw + 0.4, { rz: -slope, tile: 1.2 });
  const [rx, rz] = F.p(xc, zc);
  addBox(rx, (y0 + y1) / 2 + 0.1, rz, vd, 0.2, vw, o.rot, { walk: true });
  noPanel();
}
function vCanopy(o, F, fy, S) {
  const sd = _vsides(o), dr = o.door, q = sd[dr.side];
  if (dr.side === "right" && o.veranda) return;
  const n = q.n, ax = q.ax, lx = q.c[0] + ax[0] * dr.at, lz = q.c[1] + ax[1] * dr.at;
  const posts = [];
  panel("prop", { hp: 0.5, density: 450 });
  for (const e of [-0.75, 0.75]) {
    const [px, pz] = F.p(lx + ax[0] * e + n[0] * 1.15, lz + ax[1] * e + n[1] * 1.15);
    cyl(M.planksDark, px, fy + 1.1, pz, 0.06, 0.06, 2.3, { seg: 6 });
    addCircle(px, pz, 0.08, fy - 0.4, fy + 2.3);
  }
  posts.push(curPanel());
  const [cx, cz] = F.p(lx + n[0] * 0.65, lz + n[1] * 0.65);
  panel("roof", { hp: 0.4, sup: { list: posts, frac: 0.5 }, density: 900, float: 0, burnable: o.roof === "shingle" });
  const along = Math.abs(n[1]) > 0.5;
  box(o.roofMat, cx, fy + 2.4, cz, along ? 1.9 : 1.45, 0.03, along ? 1.45 : 1.9, { rot: o.rot, rx: along ? n[1] * 0.25 : 0, rz: along ? 0 : -n[0] * 0.25, tile: 1.2 });
  noPanel();
}
function vDecor(o, R2, F, fy, B, S) {
  const top = fy + o.h, hr = o.d / 2 * Math.tan(o.pitch ?? 0.6);
  vNalichniki(o, F, fy, S);
  if (o.fifth !== void 0) vFifthWall(o, B, F, fy);
  if (o.rstove) vRussianStove(o, B, F, fy, top, hr);
  if (o.mezz) vMezzanine(o, B, F, fy, S);
  if (o.veranda) vVeranda(o, B, F, fy, S);
  if (o.porchRoof !== false && o.vtype) vCanopy(o, F, fy, S);
  if (o.signIdx !== void 0) {
    const sd = _vsides(o), q = sd.front, [x, z] = F.p(0 + (o.signAt ?? 0), o.d / 2 + 0.05);
    panel("trim", { hp: 0.3, sup: { list: _wallsOf(S), frac: 0.5 }, density: 400 });
    place(M.vsign, vSignGeo(o.signIdx, 2.4, 0.6), x, fy + o.h - 0.35, z, o.rot, 1, { cast: false });
    noPanel();
  }
}
var VROOF = () => ({ slate: M.roofSlate, shingle: M.roofShingle, rust: M.roofRust, tar: M.roofTar });
function vHouse(H) {
  H.roofMat = VROOF()[H.roof] ?? M.roofRust;
  if (H.vtype === "brick" || H.style === "brick") H.wallMat = M.hgBrick;
  H.decor = vDecor;
  return house(H);
}
function burntHouse(o) {
  const R2 = rng(o.seed), F = frame(o.x, o.z, o.rot), { w, d } = o, base = o.pad.y, fy = base + 0.42;
  const B = (mat, lx, ly, lz, sx, sy, sz, e = {}) => {
    const [x, z] = F.p(lx, lz);
    box(mat, x, ly, z, sx, sy, sz, { rot: o.rot + (e.r ?? 0), rx: e.rx, rz: e.rz, tile: e.tile ?? 0.9, collide: e.collide, walk: e.walk });
  };
  beginStruct({ kind: "ruin", name: "пепелище", x: o.x, z: o.z, rot: o.rot, w, d, h: 1.5, fy, fuel: 0.15, log: true });
  noPanel();
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) B(M.concrete, a * w * 0.48, base + 0.12, b * d * 0.48, 0.4, 0.62, 0.4, { tile: 0.8 });
  const sides = [[0, d / 2 - 0.1, w, 0], [0, -d / 2 + 0.1, w, 0], [-w / 2 + 0.1, 0, d - 0.4, Math.PI / 2], [w / 2 - 0.1, 0, d - 0.4, Math.PI / 2]];
  for (const [cx, cz, L, r] of sides) {
    const nseg = 3, sl = L / nseg;
    for (let k = 0; k < nseg; k++) {
      const rows = R2.int(0, 5);
      if (!rows) continue;
      const u = -L / 2 + (k + 0.5) * sl, lx = cx + (r ? 0 : u), lz = cz + (r ? -u : 0);
      panel("wall", { hp: 1.2, mode: "rigid", density: 650, burnable: false });
      for (let q = 0; q < rows; q++) {
        boardTag();
        const lenK = q === rows - 1 ? R2.range(0.5, 1) : 1;
        B(M.charLog, lx, fy - 0.3 + (q + 0.5) * 0.225, lz, sl * lenK, 0.225, 0.22, { r });
      }
      boardTag(false);
      const [wx, wz] = F.p(lx, lz);
      addBox(wx, fy - 0.3 + rows * 0.1125, wz, sl, rows * 0.225, 0.22, o.rot + r, { walk: true });
    }
  }
  noPanel();
  // обгоревшие брёвна и стропила внутри, обвалившиеся листы кровли
  for (let i = 0; i < 9; i++) B(M.charLog, R2.range(-w * 0.35, w * 0.35), base + 0.15 + R2.range(0, 0.3), R2.range(-d * 0.35, d * 0.35), R2.range(1.5, 4), 0.2, 0.2, { r: R2.range(0, TAU), rz: R2.range(-0.25, 0.25), rx: R2.range(-0.1, 0.1) });
  for (let i = 0; i < 5; i++) B(M.roofRust, R2.range(-w * 0.35, w * 0.35), base + 0.3 + R2.range(0, 0.4), R2.range(-d * 0.35, d * 0.35), 1.05, 0.02, R2.range(1.6, 2.6), { r: R2.range(0, TAU), rx: R2.range(-0.4, 0.4), rz: R2.range(-0.3, 0.3), tile: 1.2 });
  // печь с трубой — всё, что осталось от дома
  const sx = -w / 2 + 1.5, sz = -d / 2 + 1.3;
  panel("prop", { hp: 3, mode: "rigid", density: 1800, float: 0, burnable: false });
  B(M.brick, sx, base + 0.95, sz, 1.5, 1.9, 2, { collide: true, tile: 0.6 });
  B(M.dark, sx, base + 1.1, sz + 1.005, 0.5, 0.42, 0.02, { tile: 1 });
  B(M.brick, sx, base + 1.9 + 1.7, sz + 0.5, 0.52, 3.4, 0.52, { tile: 0.6 });
  B(M.brick, sx, base + 5.34, sz + 0.5, 0.64, 0.08, 0.64, { tile: 0.6 });
  const [cx, cz] = F.p(sx, sz + 0.5);
  addBox(cx, base + 3.6, cz, 0.55, 3.4, 0.55, o.rot);
  noPanel();
  // железная кровать
  const bx = w / 2 - 1.4, bz = -d / 2 + 1.4;
  B(M.rust, bx, base + 0.42, bz, 0.9, 0.04, 1.95, { tile: 1 });
  for (const e of [-1, 1]) B(M.rust, bx, base + 0.5, bz + e * 0.97, 0.9, 0.7, 0.04, { tile: 1, rx: e * 0.05 });
  endStruct();
  LANDMARKS.scorch.push({ x: o.x, z: o.z, r: 6.5 });
}
function vFence(xa, za, xb, zb, kind, R2, mat = M.planksWhite) {
  const L = Math.hypot(xb - xa, zb - za), n = Math.max(1, Math.ceil(L / 2.4));
  const picket = kind === "picket" ? new THREEV.BoxGeometry(0.085, 1.2, 0.022) : new THREEV.BoxGeometry(0.21, 1.75, 0.03);
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n, ax = lerp(xa, xb, t0), az = lerp(za, zb, t0), bx = lerp(xa, xb, t1), bz = lerp(za, zb, t1);
    const sl = L / n, rot = Math.atan2(bx - ax, bz - az) - Math.PI / 2, mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const ya = hFast(ax, az), yb = hFast(bx, bz), Hh = kind === "picket" ? 1.25 : kind === "slab" ? 1.8 : 1.3;
    beginStruct({ kind: "fence", x: mx, z: mz, rot, w: sl, d: 0.2, h: Hh, fy: Math.min(ya, yb), fuel: 0.25 });
    noPanel();
    cyl(M.deadwood, ax, ya + Hh / 2, az, 0.065, 0.055, Hh + 0.2, { seg: 6, rot: [R2.range(-0.05, 0.05), 0, R2.range(-0.05, 0.05)] });
    const fallen = R2() < 0.08, lean = fallen ? 0 : R2() < 0.25 ? R2.range(-0.14, 0.14) : 0;
    panel("prop", { hp: kind === "rail" ? 0.5 : 0.35, density: 450 });
    if (kind === "rail") {
      for (const hh of [0.45, 0.85, 1.22]) if (R2() > 0.08) beam(M.deadwood, VV(ax, ya + hh, az), VV(bx, yb + hh + R2.range(-0.08, 0.05), bz), 0.045, { seg: 5 });
      /* v22: у жердевой ограды не было коллайдера — сквозь неё проходили. Теперь
         это преграда по верхнюю жердь (~1,2 м), на уклоне — двумя участками вдоль
         склона: через неё перелезают (Пробел), ставя ногу на нижнюю жердь (rail —
         допуск по высоте чуть больше). Сквозь жерди видно и простреливается, укрытием
         для ботов не считается */
      const parts = Math.abs(yb - ya) > 0.06 ? 2 : 1;
      for (let p = 0; p < parts; p++) {
        const fm = (p + 0.5) / parts;
        addBox(lerp(ax, bx, fm), lerp(ya, yb, fm) + 0.6, lerp(az, bz, fm), sl / parts, 1.2, 0.12, rot, { walk: false }).rail = true;
      }
      endStruct();
      continue;
    }
    if (fallen) {
      const y = hFast(mx, mz) + 0.05;
      for (let i = 0; i < sl / 0.2; i++) {
        if (R2() < 0.25) continue;
        const t = -sl / 2 + i * 0.2 + 0.1;
        place(mat, picket, mx + Math.cos(rot) * t, y, mz - Math.sin(rot) * t, [Math.PI / 2, rot, R2.range(-0.1, 0.1)]);
      }
      endStruct();
      continue;
    }
    for (const hh of kind === "picket" ? [0.3, 1] : [0.35, 1.45]) beam(M.planksDark, VV(ax, ya + hh, az), VV(bx, yb + hh, bz), 0.03, { seg: 4 });
    const step = kind === "picket" ? 0.14 : 0.2;
    for (let i = 0; i < sl / step; i++) {
      // выбитые и выломанные доски — каждая доска отдельно отстреливается
      if (R2() < (kind === "picket" ? 0.1 : 0.07)) continue;
      const t = (i + 0.5) / (sl / step), px = lerp(ax, bx, t), pz = lerp(az, bz, t), py = lerp(ya, yb, t);
      const tilt = R2() < 0.04 ? R2.range(-0.5, 0.5) : R2.range(-0.03, 0.03);
      boardTag();
      place(kind === "slab" ? R2() < 0.5 ? M.planksDark : M.planks : mat, picket, px, py + Hh / 2 - (kind === "slab" ? 0 : 0.03) + R2.range(-0.04, 0.04), pz, [lean + R2.range(-0.03, 0.03), rot, tilt], [1, R2.range(0.93, 1.05), 1]);
    }
    boardTag(false);
    addBox(mx, (ya + yb) / 2 + Hh / 2, mz, sl, Hh, 0.14, rot, { walk: false });
    endStruct();
  }
}
function craneWell(wl) {
  const { x, z, rot } = wl, y = terrainH(x, z), c = Math.cos(rot), s = Math.sin(rot);
  beginStruct({ kind: "well", name: "журавль", x, z, rot, w: 1.3, d: 1.3, h: 4.2, fy: y, fuel: 0.4 });
  panel("prop", { hp: 1.5, mode: "rigid", density: 600 });
  const lg = new THREEV.CylinderGeometry(0.1, 0.1, 1.25, 7);
  for (let k = 0; k < 5; k++) for (let q = 0; q < 4; q++) {
    const a = rot + q * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    place(M.logEnd, lg, x + sa * 0.52, y + 0.1 + k * 0.19, z + ca * 0.52, [0, a + Math.PI / 2, Math.PI / 2]);
  }
  box(M.planksDark, x, y + 1.02, z, 1.25, 0.04, 0.5, { rot, tile: 1 });
  addBox(x, y + 0.5, z, 1.25, 1, 1.25, rot);
  // стойка в 3,4 м от сруба
  const px = x - s * 3.4, pz = z - c * 3.4, H = 4.1;
  panel("prop", { hp: 1.2, mode: "rigid", density: 600 });
  cyl(M.deadwood, px, y + H / 2, pz, 0.14, 0.11, H, { seg: 7 });
  for (const e of [-1, 1]) cyl(M.deadwood, px + c * e * 0.1, y + H + 0.2, pz - s * e * 0.1, 0.05, 0.05, 0.45, { seg: 5 });
  addCircle(px, pz, 0.15, y, y + H);
  // балансир: длинное плечо к срубу опущено (ведро в колодце), короткое с грузом поднято
  const pv = VV(px, y + H + 0.15, pz), endL = VV(x - s * 0.1, y + 2.5, z - c * 0.1), dir = endL.clone().sub(pv).normalize();
  const endS = pv.clone().addScaledVector(dir, -2.4);
  panel("prop", { hp: 0.8, density: 500 });
  beam(M.deadwood, endS, endL, 0.07, { seg: 6, r1: 0.05 });
  box(M.stone, endS.x + dir.x * 0.3, endS.y - 0.05, endS.z + dir.z * 0.3, 0.4, 0.35, 0.4, { rot: rot + 0.3, tile: 0.8 });
  beam(M.deadwood, endL, VV(x - s * 0.1, y + 0.75, z - c * 0.1), 0.025, { seg: 4 });
  cyl(M.galv, x - s * 0.1, y + 0.62, z - c * 0.1, 0.1, 0.13, 0.26, { seg: 10, open: true });
  endStruct();
}
function fruitTree(x, z, R2, kind = "apple") {
  const y = terrainH(x, z), Ht = kind === "apple" ? R2.range(1.3, 1.8) : 0.2, crown = kind === "apple" ? R2.range(1.4, 2) : R2.range(0.9, 1.3);
  if (kind === "apple") {
    const lean = R2.range(-0.12, 0.12);
    beam(M.barkPine, VV(x, y - 0.1, z), VV(x + lean, y + Ht, z + lean * 0.5), 0.1, { seg: 6, r1: 0.07 });
    for (let k = 0; k < 3; k++) {
      const a = R2() * TAU;
      beam(M.barkPine, VV(x + lean, y + Ht - 0.1, z + lean * 0.5), VV(x + Math.cos(a) * crown * 0.7, y + Ht + crown * R2.range(0.5, 0.9), z + Math.sin(a) * crown * 0.7), 0.05, { seg: 5, r1: 0.025 });
    }
    addCircle(x, z, 0.12, y, y + Ht);
  }
  const mat = kind === "apple" ? M.leafApple : M.leafLilac, cy = y + Ht + crown * (kind === "apple" ? 0.85 : 0.75), g = new THREEV.PlaneGeometry(1.5, 1.5);
  const n = kind === "apple" ? 14 : 9;
  for (let i = 0; i < n; i++) {
    const a = R2() * TAU, r = crown * Math.sqrt(R2()) * 0.6, yy = cy + R2.range(-0.45, 0.45) * crown;
    place(mat, g, x + Math.cos(a) * r, yy, z + Math.sin(a) * r, [R2.range(-0.6, 0.6), R2() * TAU, R2.range(-0.4, 0.4)], crown * R2.range(0.55, 0.85), { cast: true });
  }
  if (kind === "apple") {
    const ag = new THREEV.SphereGeometry(0.04, 6, 4);
    for (let i = 0; i < 26; i++) {
      // яблоки висят внутри кроны (там, где листва), падалица — на земле
      const a = R2() * TAU, fall = R2() < 0.35, r = crown * (fall ? R2.range(0.3, 0.95) : R2.range(0.2, 0.62));
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      place(M.apple, ag, px, fall ? terrainH(px, pz) + 0.03 : cy + R2.range(-0.38, 0.32) * crown, pz, 0, 1, { cast: false });
    }
  }
}
function greenhouse(gx, gz, rot, R2) {
  const y = terrainH(gx, gz), L = 4.2, R = 1.25, c = Math.cos(rot), s = Math.sin(rot), nA = 7;
  beginStruct({ kind: "shed", name: "теплица", x: gx, z: gz, rot, w: 2.6, d: L, h: 1.9, fy: y, fuel: 0.15 });
  panel("prop", { hp: 0.6, density: 500, burnable: false });
  const arc = (t, u) => {
    const a = Math.PI * u, lx = Math.cos(a) * R, ly = Math.sin(a) * R * 1.45, lz = -L / 2 + t * L;
    return VV(gx + lx * c + lz * s, y + ly, gz - lx * s + lz * c);
  };
  for (let i = 0; i <= 5; i++) for (let k = 0; k < nA; k++) beam(M.galv, arc(i / 5, k / nA), arc(i / 5, (k + 1) / nA), 0.016, { seg: 4, cast: false });
  beam(M.galv, arc(0, 0.5), arc(1, 0.5), 0.016, { seg: 4, cast: false });
  // плёнка: полосы между дугами, часть сорвана
  const pos = [];
  for (let i = 0; i < 5; i++) for (let k = 0; k < nA; k++) {
    if (R2() < 0.3) continue;
    const a = arc(i / 5, k / nA), b = arc((i + 1) / 5, k / nA), cc = arc((i + 1) / 5, (k + 1) / nA), d = arc(i / 5, (k + 1) / nA);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, cc.x, cc.y, cc.z, a.x, a.y, a.z, cc.x, cc.y, cc.z, d.x, d.y, d.z);
  }
  const fg = new THREEV.BufferGeometry();
  fg.setAttribute("position", new THREEV.Float32BufferAttribute(pos, 3));
  fg.computeVertexNormals();
  put(M.film, normalize(fg, M.film), false);
  addBox(gx, y + 0.9, gz, 2.5, 1.8, L, rot, { walk: false });
  endStruct();
  const p0 = arc(0.4, 0.5), p1 = arc(0.6, 0.5), dx = p1.x - p0.x, dz = p1.z - p0.z;
  makeCloth({ nx: 5, ny: 5, material: M.film, wind: 1.6, stiff: 2, place: (u, v) => new THREEV.Vector3(p0.x + dx * u + c * v * 0.8, p0.y - v * 0.6, p0.z + dz * u - s * v * 0.8), pinFn: (i, j) => j === 0 });
}
function busStop(o) {
  const { x, z, rot } = o, F = frame(x, z, rot), y = terrainH(x, z);
  beginStruct({ kind: "shed", name: "остановка", x, z, rot, w: 3.4, d: 1.6, h: 2.5, fy: y, fuel: 0 });
  const B = (mat, lx, ly, lz, sx, sy, sz, e = {}) => {
    const [px, pz] = F.p(lx, lz);
    box(mat, px, y + ly, pz, sx, sy, sz, { rot, tile: e.tile ?? 1, collide: e.collide, rx: e.rx });
  };
  const walls = [];
  walls.push(panel("wall", { hp: 2.5, mode: "rigid", density: 2400, float: 0, burnable: false }));
  B(M.hgConc, 0, 1.2, -0.75, 3.4, 2.4, 0.12, { collide: true });
  walls.push(panel("wall", { hp: 2, mode: "rigid", density: 2400, float: 0, burnable: false }));
  for (const e of [-1, 1]) B(M.hgConc, e * 1.64, 1.2, -0.1, 0.12, 2.4, 1.4, { collide: true });
  panel("roof", { hp: 2, sup: { list: walls, frac: 0.5 }, mode: "rigid", density: 2400, float: 0, burnable: false });
  B(M.hgConc, 0, 2.45, -0.05, 3.7, 0.12, 1.75, { collide: true, rx: 0.04 });
  noPanel();
  B(M.planksDark, 0, 0.45, -0.45, 2.8, 0.05, 0.38, { collide: true });
  for (const e of [-1.2, 1.2]) B(M.rust, e, 0.22, -0.45, 0.06, 0.44, 0.3);
  const [sx, sz] = F.p(0, 0.85);
  place(M.vsign, vSignGeo(0, 1.5, 0.38), sx, y + 2.25, sz, rot, 1, { cast: false });
  endStruct();
}
function obelisk(o) {
  const { x, z, rot } = o, y = terrainH(x, z), F = frame(x, z, rot);
  beginStruct({ kind: "tower", name: "обелиск", x, z, rot, w: 3, d: 3, h: 5.2, fy: y, fuel: 0, quiet: true });
  panel("prop", { hp: 6, mode: "rigid", density: 2400, float: 0, burnable: false });
  box(M.concrete, x, y + 0.12, z, 3.2, 0.3, 3.2, { rot, tile: 1, collide: true });
  box(M.concrete, x, y + 0.42, z, 2.2, 0.3, 2.2, { rot, tile: 1, collide: true });
  const st = new THREEV.CylinderGeometry(0.22, 0.5, 4.2, 4, 1);
  place(M.whitewash, st, x, y + 2.67, z, rot + Math.PI / 4);
  addBox(x, y + 2.6, z, 0.8, 4.2, 0.8, rot);
  const sh = new THREEV.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.12 : 0.3;
    i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const sg = new THREEV.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false });
  sg.translate(0, 0, -0.03);
  // звезда на штыре: нижние лучи касаются торца стелы (верх стелы y+4.77, нижний луч звезды −0.243)
  cyl(M.steel, x, y + 4.9, z, 0.018, 0.018, 0.3, { seg: 5, cast: false });
  place(M.paintRed, sg, x, y + 4.77 + 0.25, z, rot);
  const [px, pz] = F.p(0, 0.5);
  place(M.vsign, vSignGeo(4, 0.9, 0.42), px, y + 1.3, pz, [-0.12, rot, 0], 1, { cast: false });
  noPanel();
  // ограда из столбиков с цепью
  for (let i = 0; i < 12; i++) {
    const a = rot + i / 12 * TAU, qx = x + Math.sin(a) * 2.6, qz = z + Math.cos(a) * 2.6;
    if (i === 0) continue;
    cyl(M.whitewash, qx, terrainH(qx, qz) + 0.35, qz, 0.06, 0.06, 0.7, { seg: 6 });
  }
  for (let i = 0; i < 18; i++) {
    const a = rot + i / 18 * TAU, r = R => [x + Math.sin(rot + R * TAU) * 2.0, z + Math.cos(rot + R * TAU) * 2.0];
    const [fx, fz] = r(i / 18);
    place(M.leafLilac, new THREEV.PlaneGeometry(0.6, 0.4), fx, terrainH(fx, fz) + 0.18, fz, [0.5, a, 0], 1, { cast: false });
  }
  endStruct();
}
function firePond(p) {
  const y = p.pad?.y ?? terrainH(p.x, p.z), wy = y - 0.95;
  M.pondWater ??= std({ color: 1714714, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.9 });
  const g = new THREEV.PlaneGeometry(p.hw * 2 + 1.2, p.hd * 2 + 1.2);
  g.rotateX(-Math.PI / 2);
  place(M.pondWater, g, p.x, wy, p.z, p.rot, 1, { cast: false });
  const F = frame(p.x, p.z, p.rot);
  beginStruct({ kind: "shed", name: "мостки", x: p.x, z: p.z, rot: p.rot, w: 1.2, d: 3, h: 1, fy: y, fuel: 0.4 });
  panel("prop", { hp: 0.6, density: 450 });
  const [mx, mz] = F.p(0, p.hd - 0.6);
  box(M.planksDark, mx, y + 0.02, mz, 1.2, 0.06, 2.6, { rot: p.rot, tile: 1, collide: true });
  for (const [a, b] of [[-0.5, -0.6], [0.5, -0.6], [-0.5, 0.6], [0.5, 0.6]]) {
    const [qx, qz] = F.p(a, p.hd - 0.6 + b);
    cyl(M.deadwood, qx, y - 0.7, qz, 0.06, 0.06, 1.5, { seg: 5 });
  }
  endStruct();
  const [sx, sz] = F.p(1.6, p.hd + 1.6), sy = terrainH(sx, sz);
  cyl(M.galv, sx, sy + 1.1, sz, 0.04, 0.04, 2.2, { seg: 6 });
  place(M.vsign, vSignGeo(3, 1.3, 0.34), sx + Math.sin(p.rot) * 0.05, sy + 2.05, sz + Math.cos(p.rot) * 0.05, p.rot, 1, { cast: false });  /* v24: щиток перед трубой */
}
function roadSign(x, z, rot, idx) {
  const y = terrainH(x, z);
  beginStruct({ kind: "sign", name: "знак", x, z, rot, w: 1.4, d: 0.2, h: 2.4, fy: y, fuel: 0 });
  panel("prop", { hp: 0.6, density: 1400, float: 0, burnable: false });
  cyl(M.galv, x, y + 1.15, z, 0.035, 0.035, 2.3, { seg: 6 });
  /* v24: щиток сидел по оси трубы — труба проходила сквозь надпись; теперь он на лицевой стороне трубы */
  const ox = Math.sin(rot) * 0.045, oz = Math.cos(rot) * 0.045;
  place(M.vsign, vSignGeo(idx, 1.3, 0.62, idx === 0 ? 5 : idx), x + ox, y + 2.05, z + oz, [0, rot, R2s() * 0.08], 1, { cast: false });
  endStruct();
}
var R2s = rng(1717);
function buildPuddles() {
  const g0 = new THREEV.CircleGeometry(1, 14);
  g0.rotateX(-Math.PI / 2);
  for (const p of VILLAGE.puddles) place(M.puddle, g0, p.x, terrainH(p.x, p.z) + 0.035, p.z, p.rot, [p.W / 2, 1, p.L / 2], { cast: false });
}
function hayTex() {
  const S = TS(512), [c, x] = cv(S), [h, hx2] = cv(S), K = S / 512;
  x.fillStyle = "rgb(128,104,58)";
  x.fillRect(0, 0, S, S);
  hx2.fillStyle = "#606060";
  hx2.fillRect(0, 0, S, S);
  const strand = (ctx, px, py, L, a, w, col) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      ctx.beginPath();
      ctx.moveTo(px + ox, py + oy);
      ctx.quadraticCurveTo(px + ox + Math.sin(a) * L * 0.5 + sr(-3, 3) * K, py + oy + Math.cos(a) * L * 0.5, px + ox + Math.sin(a) * L, py + oy + Math.cos(a) * L);
      ctx.stroke();
    }
  };
  for (let i = 0; i < 4200; i++) {
    const px = srnd() * S, py = srnd() * S, L = sr(14, 46) * K, a = sr(-0.55, 0.55) + (srnd() < 0.15 ? sr(-1, 1) : 0);
    const v = sr(0.62, 1.22), dry = srnd() < 0.25;
    const col = dry ? rgba(150 * v, 138 * v, 104 * v, 0.85) : rgba(190 * v, 156 * v, 80 * v, 0.8);
    strand(x, px, py, L, a, sr(0.8, 2) * K, col);
    if (i % 2 === 0) strand(hx2, px, py, L, a, sr(1, 2.2) * K, `rgba(${200 + sr(0, 55) | 0},${200 + sr(0, 55) | 0},${200 + sr(0, 55) | 0},0.7)`);
  }
  for (let i = 0; i < 900; i++) strand(x, srnd() * S, srnd() * S, sr(8, 22) * K, sr(-0.6, 0.6), 1.2 * K, "rgba(46,36,20,0.45)");
  for (let i = 0; i < 40; i++) blob(x, srnd() * S, srnd() * S, sr(15, 60) * K, [80, 84, 60], sr(0.08, 0.2));
  return { map: tex(c), normal: tex(heightToNormal(h, 2.4), 1, 1, false) };
}
function hayFringeTex() {
  const S = TS(256), [c, x] = cv(S), K = S / 256;
  x.clearRect(0, 0, S, S);
  for (let i = 0; i < 520; i++) {
    // прядь начинается не от края карточки — верхняя кромка рваная и не видна прямой линией
    const px = sr(0.04, 0.96) * S, y0 = sr(0, 0.45) * S, L = sr(0.25, 0.55) * S, a = sr(-0.3, 0.3), v = sr(0.6, 1.2);
    x.strokeStyle = srnd() < 0.3 ? rgba(150 * v, 138 * v, 106 * v, 1) : rgba(186 * v, 150 * v, 78 * v, 1);
    x.lineWidth = sr(1, 2.2) * K;
    x.beginPath();
    x.moveTo(px, y0);
    x.quadraticCurveTo(px + Math.sin(a) * L * 0.6 + sr(-6, 6) * K, y0 + L * 0.5, px + Math.sin(a) * L, Math.min(S - 1, y0 + L));
    x.stroke();
  }
  const t = tex(c);
  t.wrapT = THREE2.ClampToEdgeWrapping;
  return t;
}
function haystack(x, z, R2) {
  const y = terrainH(x, z), r = R2.range(1.7, 2.2), h = R2.range(3.7, 4.6);
  if (!M.hayV) {
    M.hayV = surf(hayTex(), { rough: 1, nscale: 1.2, extra: { vertexColors: true } });
    injectStructFX(M.hayV);
    M.hayFringe = std({ map: hayFringeTex(), alphaTest: 0.5, side: THREEV.DoubleSide, roughness: 1, color: 12105383 });
  }
  // деревья, выросшие «в стогу», и трава сквозь сено — убираем
  for (const t of treesNear(x, z, r + 2.6)) {
    if (t.col) t.col.dead = true;
    try {
      hideTree(t);
    } catch (e) {
    }
  }
  gexAdd({ x, z, r: r * 1.02 });
  beginStruct({ kind: "shed", name: "стог", x, z, rot: 0, w: r * 2, d: r * 2, h, fy: y, fuel: 2.5 });
  panel("prop", { hp: 1.5, density: 160, float: 1.2 });
  const prof = [];
  const NV = 16;
  for (let k = 0; k <= NV; k++) {
    const t = k / NV;
    // профиль: осевший низ, «пузо» на трети высоты, плавное сужение и тупая макушка
    const rr = t < 0.3 ? lerp(0.86, 1, Math.sin(t / 0.3 * Math.PI / 2)) : Math.cos((t - 0.3) / 0.7 * Math.PI / 2) ** 0.85 * (1 - 0.08 * (t - 0.3));
    prof.push(new THREEV.Vector2(Math.max(0.001, rr), t));
  }
  const g = new THREEV.LatheGeometry(prof, 22);
  const pa = g.attributes.position, uv = g.attributes.uv, col = new Float32Array(pa.count * 3);
  const ph = R2() * TAU, wind = R2() * TAU, lean = R2.range(-0.12, 0.12);
  for (let i = 0; i < pa.count; i++) {
    const px = pa.getX(i), t = pa.getY(i), pz = pa.getZ(i), a = Math.atan2(pz, px);
    const lump = 1 + 0.07 * Math.sin(a * 3 + ph + t * 4) * Math.sin(t * 7 + ph) + 0.035 * Math.sin(a * 9 + t * 13 + ph * 2) + 0.02 * Math.sin(a * 17 - t * 23);
    const sag = t > 0.85 ? 1 - (t - 0.85) * 0.6 : 1;
    pa.setXYZ(i, px * r * lump * sag + lean * t * t * r, t * h, pz * r * lump * sag);
    uv.setXY(i, uv.getX(i) * TAU * r / 1.6, t * h / 1.6);
    // посеревший верх и наветренный бок, тёмный сырой низ, редкие свежие пряди
    const windK = 0.5 + 0.5 * Math.cos(a - wind);
    const grey = smoothstep(0.45, 0.95, t) * 0.75 + windK * 0.25 * t;
    const damp = 1 - smoothstep(0, 0.14, t);
    let cr = lerp(1, 0.78, grey), cg = lerp(1, 0.8, grey), cb = lerp(1, 0.86, grey);
    const dk = 1 - damp * 0.45;
    cr *= dk;
    cg *= dk * (1 + damp * 0.04);
    cb *= dk;
    const sp = 0.92 + 0.16 * Math.sin(a * 5 + t * 11 + ph);
    col[i * 3] = cr * sp * (1 + grey * 0.12);
    col[i * 3 + 1] = cg * sp * (1 + grey * 0.1);
    col[i * 3 + 2] = cb * sp * (1 + grey * 0.22);
  }
  g.setAttribute("color", new THREEV.BufferAttribute(col, 3));
  g.computeVertexNormals();
  place(M.hayV, g, x, y - 0.12, z, 0);
  addCircle(x, z, r * 0.92, y, y + h * 0.8);
  const surfR = (t) => r * (t < 0.3 ? lerp(0.86, 1, Math.sin(t / 0.3 * Math.PI / 2)) : Math.cos((t - 0.3) / 0.7 * Math.PI / 2) ** 0.85);
  // бахрома: низ и «плечи»
  const fr = new THREEV.PlaneGeometry(0.75, 0.55);
  fr.translate(0, -0.275, 0);
  for (const [t, n2, sc] of [[0.1, 16, 1], [0.36, 10, 0.8]]) {
    const R3 = surfR(t) * 1.01;
    for (let k = 0; k < n2; k++) {
      const a = (k + R2.range(-0.3, 0.3)) / n2 * TAU;
      place(M.hayFringe, fr, x + Math.cos(a) * R3, y + h * t + 0.1, z + Math.sin(a) * R3, [R2.range(0.15, 0.35), -a + Math.PI / 2, R2.range(-0.15, 0.15)], [sc * R2.range(0.8, 1.2), sc * R2.range(0.8, 1.3), 1], { cast: false });
    }
  }
  // стожар
  const top = y + h - 0.12;
  beam(M.deadwood, VV(x, y - 0.2, z), VV(x + lean * r * 0.9 + R2.range(-0.05, 0.05), top + R2.range(0.6, 1.1), z + R2.range(-0.05, 0.05)), 0.055, { seg: 6, r1: 0.035 });
  // вицы: две пары жердей, перекинутых через макушку
  for (let p = 0; p < 2; p++) {
    const a = ph + p * Math.PI / 2 + R2.range(-0.2, 0.2);
    for (const sg of [-1, 1]) {
      const t1 = R2.range(0.55, 0.7), rr = surfR(t1) * 1.03;
      const A = VV(x + Math.cos(a) * rr * sg, y + h * t1, z + Math.sin(a) * rr * sg), Bt = VV(x + lean * r * 0.8 + Math.cos(a) * 0.2 * sg, top + 0.05, z + Math.sin(a) * 0.2 * sg);
      const mid = VV((A.x + Bt.x) / 2 + Math.cos(a) * sg * 0.25, (A.y + Bt.y) / 2 + 0.15, (A.z + Bt.z) / 2 + Math.sin(a) * sg * 0.25);
      beam(M.deadwood, A, mid, 0.03, { seg: 4, cast: false });
      beam(M.deadwood, mid, Bt, 0.03, { seg: 4, cast: false });
    }
  }
  noPanel();
  // подпорки и подстожье
  const np = R2.int(1, 3);
  for (let k = 0; k < np; k++) {
    const a = ph + k * TAU / np + R2.range(-0.4, 0.4), t1 = R2.range(0.45, 0.6), rr = surfR(t1);
    beam(M.deadwood, VV(x + Math.cos(a) * (r + 1.1), hFast(x + Math.cos(a) * (r + 1.1), z + Math.sin(a) * (r + 1.1)) - 0.05, z + Math.sin(a) * (r + 1.1)), VV(x + Math.cos(a) * rr * 0.98, y + h * t1, z + Math.sin(a) * rr * 0.98), 0.04, { seg: 5, cast: false });
  }
  for (let k = 0; k < 7; k++) {
    const a = R2() * TAU, L = R2.range(0.5, 1.1);
    beam(M.deadwood, VV(x + Math.cos(a) * r * 0.6, y + 0.05, z + Math.sin(a) * r * 0.6), VV(x + Math.cos(a) * (r * 0.9 + L), hFast(x + Math.cos(a) * (r * 0.9 + L), z + Math.sin(a) * (r * 0.9 + L)) + 0.04, z + Math.sin(a) * (r * 0.9 + L)), 0.03, { seg: 4, cast: false });
  }
  // осыпавшееся сено вокруг
  for (let k = 0; k < 10; k++) {
    const a = R2() * TAU, d = r * R2.range(0.95, 1.5), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    place(M.hayFringe, fr, px, hFast(px, pz) + 0.03, pz, [-Math.PI / 2 + R2.range(-0.2, 0.2), R2() * TAU, 0], [R2.range(0.8, 1.6), R2.range(0.8, 1.4), 1], { cast: false });
  }
  endStruct();
}
function tallWeeds(cx, cz, n, kind, R2) {
  M.hogweed ??= foliage(shrubTex(), { alphaTest: 0.45, color: 9741408, glow: 528390 });
  M.fireweed ??= foliage(shrubTex(), { alphaTest: 0.45, color: 11364744, glow: 657930 });
  M.umbel ??= std({ color: 15132376, roughness: 0.9, side: THREEV.DoubleSide });
  const g = new THREEV.PlaneGeometry(0.9, 1.6), um = new THREEV.CircleGeometry(0.28, 9);
  um.rotateX(-Math.PI / 2);
  for (let i = 0; i < n; i++) {
    const x = cx + R2.range(-3, 3), z = cz + R2.range(-3, 3);
    if (!isFree(x, z, 0.3, { pathPad: 0.2 })) continue;
    const y = terrainH(x, z), hh = kind === "hog" ? R2.range(1.8, 2.8) : R2.range(1.1, 1.6);
    for (const a of [0, Math.PI / 2]) place(kind === "hog" ? M.hogweed : M.fireweed, g, x, y + hh * 0.48, z, [0, a + R2() * 0.5, 0], [hh / 1.6 * 0.9, hh / 1.6, 1], { cast: false });
    if (kind === "hog") {
      cyl(M.leafApple, x, y + hh / 2, z, 0.025, 0.02, hh, { seg: 4, cast: false });
      place(M.umbel, um, x, y + hh + 0.02, z, 0, R2.range(0.8, 1.3), { cast: false });
    }
  }
}
function vBed(B, lx, lz, fy, R2) {
  panel("prop", { hp: 0.6, density: 900, burnable: true });
  B(M.rust, lx, fy + 0.42, lz, 1.95, 0.04, 0.9, { tile: 1, collide: true });
  for (const e of [-1, 1]) B(M.rust, lx + e * 0.97, fy + (e < 0 ? 0.55 : 0.45), lz, 0.04, e < 0 ? 1.1 : 0.9, 0.9, { tile: 1 });
  B(M.canvas, lx + R2.range(-0.05, 0.05), fy + 0.52, lz, 1.85, 0.14, 0.82, { tile: 1, r: R2.range(-0.05, 0.05) });
  B(M.plaster, lx - 0.7, fy + 0.65, lz, 0.4, 0.12, 0.6, { tile: 1 });
  noPanel();
}
function vSideboard(H, B, lx, lz, fy, R2) {
  panel("prop", { hp: 0.8, density: 600 });
  B(M.planksDark, lx, fy + 0.45, lz, 1.3, 0.9, 0.48, { tile: 1, collide: true });
  B(M.planksDark, lx, fy + 1.45, lz - 0.08, 1.3, 1.1, 0.32, { tile: 1 });
  B(M.glass, lx, fy + 1.45, lz + 0.085, 1.2, 1, 0.01, { tile: 1 });
  noPanel();
  const t = ipTop(H, lx, lz + 0.05, 0.6, 0.18, fy + 0.905);
  for (let i = 0; i < 4; i++) if (R2() < 0.8) ipAdd(H, ["cup", "plate", "jar", "bottle"][i], lx - 0.45 + i * 0.3, lz + 0.05, R2() * TAU).top = t;
}
function villageFurnish(o, R2, F, fy, B) {
  const { w, d } = o, H = houseRec(o, fy);
  const tx = w / 2 - 1.35, tz = d / 2 - 1.15;
  if (R2() < 0.8) {
    const T = ipAdd(H, "table", tx, tz, R2.range(-0.06, 0.06));
    ipSet(H, T, R2, 5);
    for (const [cx, cz, cr] of [[0, -0.6, 0], [-0.75, 0, Math.PI / 2], [0.35, -0.62, 0]]) if (R2() < 0.75) ipAdd(H, R2() < 0.3 ? "stool" : "chair", tx + cx, tz + cz, cr + R2.range(-0.3, 0.3)).fallen = R2() < 0.15;
  } else for (let i = 0; i < 3; i++) ipAdd(H, ["chair", "plate", "bottle"][i], tx + R2.range(-0.8, 0.5), tz + R2.range(-0.8, 0.2), R2() * TAU).fallen = true;
  vBed(B, w / 2 - 1.35, -d / 2 + 0.62, fy, R2);
  vSideboard(H, B, o.vtype === "izba" ? 1.15 : 0.1, -d / 2 + 0.36, fy, R2);
  interiorWalls(o, R2, fy);
  // половики и мусор на полу
  for (let i = 0; i < 3; i++) B(R2() < 0.5 ? M.canvas : M.planksDark, R2.range(-w * 0.3, w * 0.3), fy + 0.012, R2.range(-d * 0.25, d * 0.25), R2.range(0.6, 1.8), 0.012, R2.range(0.5, 0.9), { r: R2.range(-0.3, 0.3), tile: 1 });
}
function clubFurnish(o, R2, F, fy, B) {
  const { w, d } = o, H = houseRec(o, fy);
  panel("prop", { hp: 1.5, density: 600 });
  // сцена не доходит до левого угла — там запасной выход (door2)
  B(M.planksDark, 0.7, fy + 0.3, -d / 2 + 1.3, w - 2.6, 0.6, 2.2, { tile: 1.2, collide: true });
  B(M.paintRed, 0, fy + 2.55, -d / 2 + 0.13, 4.2, 0.6, 0.02, { tile: 1 });
  noPanel();
  for (let r = 0; r < 4; r++) for (let k = 0; k < 7; k++) {
    if (R2() < 0.18) continue;
    const ch = ipAdd(H, "chair", -2.7 + k * 0.9 + R2.range(-0.08, 0.08), -0.4 + r * 0.9, Math.PI + R2.range(-0.2, 0.2));
    ch.fallen = R2() < 0.12;
  }
  interiorWalls(o, R2, fy);
}
function shopFurnish(o, R2, F, fy, B) {
  const { w, d } = o, H = houseRec(o, fy);
  panel("prop", { hp: 1.2, density: 600 });
  B(M.planksDark, 0.4, fy + 0.5, -0.4, 4.6, 1, 0.7, { tile: 1, collide: true });
  B(M.glass, -1.2, fy + 1.15, -0.4, 1.4, 0.3, 0.6, { tile: 1 });
  for (let k = 0; k < 3; k++) B(M.planks, 0.4, fy + 0.9 + k * 0.5, -d / 2 + 0.4, 5.2, 0.04, 0.42, { tile: 1 });
  for (const e of [-2.2, 3]) B(M.planksDark, e, fy + 1.25, -d / 2 + 0.4, 0.05, 2.4, 0.42, { tile: 1, collide: true });
  noPanel();
  for (let k = 0; k < 3; k++) {
    const t = ipTop(H, 0.4, -d / 2 + 0.4, 2.6, 0.2, fy + 0.92 + k * 0.5);
    for (let i = 0; i < 9; i++) if (R2() < 0.6) ipAdd(H, R2() < 0.6 ? "jar" : "bottle", -2 + i * 0.6 + R2.range(-0.1, 0.1), -d / 2 + 0.4, R2() * TAU).top = t;
  }
  const t = ipTop(H, 0.4, -0.4, 2.3, 0.35, fy + 1.0);
  for (let i = 0; i < 4; i++) ipAdd(H, ["bottle", "mug", "jar", "bottle"][i], 0.6 + i * 0.45, -0.4 + R2.range(-0.2, 0.2), R2() * TAU).top = t;
  interiorWalls(o, R2, fy);
}
function vShed(Y, R2) {
  const [x, z] = Y.shed.at;
  vHouse({ kind: "house", id: "сарай", x, z, rot: Y.shed.rot, style: "plank", w: 4.4, d: 3.4, h: 2.15, pitch: 0.38, roof: R2() < 0.5 ? "rust" : "slate", wallMat: R2() < 0.5 ? M.planksDark : M.planksGrey, trimMat: M.planksDark, door: { side: "front", at: 0.9 }, windows: [], interior: false, damage: 0.55, seed: 3000 + Math.round(Y.b * 7) + (Y.row === "in" ? 0 : 1), pad: Y.shed.pad });
  const F = frame(x, z, Y.shed.rot), [wx, wz] = F.p(-2.6, 0.2);
  woodpile(wx, wz, Y.shed.rot + Math.PI / 2, 2.6, R2.int(4, 7));
}
function vBanya(Y, R2) {
  const [x, z] = Y.banyaAt.at;
  vHouse({ kind: "house", id: "баня", x, z, rot: Y.banyaAt.rot, style: "log", w: 3.8, d: 3.2, h: 2.0, pitch: 0.42, roof: R2() < 0.5 ? "rust" : "shingle", trimMat: M.planksDark, door: { side: Y.banyaAt.door ?? "front", at: Y.banyaAt.door === "right" ? -0.55 : Y.banyaAt.door ? 0.55 : -1.05 }, windows: [{ side: "back", at: 0.8, w: 0.5, y0: 1.0, y1: 1.45 }], stove: Y.banyaAt.door === "right" ? [1.1, -0.85] : [1.1, -0.65], interior: false, damage: 0.45, seed: 4000 + Math.round(Y.b * 7), pad: Y.banyaAt.pad });
}
function buildVillage() {
  const R2 = rng(5353);
  for (const Y of VILLAGE.yards) {
    const F = Y.F, side = Y.row === "in" ? 1 : -1, ys = -side, D = Y.D;
    if (Y.house.kind === "burnt") burntHouse(Y.house);
    else vHouse(Y.house);
    vShed(Y, R2);
    if (Y.banyaAt) vBanya(Y, R2);
    // заборы
    const fenceMat = [M.planksGreen, M.planksBlue, M.planksWhite, M.planks][R2.int(0, 3)];
    const g0 = Y.gateS - 1.7, g1 = Y.gateS + 1.7, wk = Y.gateS + ys * 2.5;
    const cuts = [[Math.min(g0, g1), Math.max(g0, g1)], [Math.min(wk, wk + ys * 1.0) - 0.05, Math.max(wk, wk + ys * 1.0) + 0.05]].sort((a, b) => a[0] - b[0]);
    let s = -Y.W / 2;
    for (const [c0, c1] of cuts) {
      if (c0 - s > 0.3) vFence(...F.p(s, 0), ...F.p(c0, 0), "picket", R2, fenceMat);
      s = c1;
    }
    if (Y.W / 2 - s > 0.3) vFence(...F.p(s, 0), ...F.p(Y.W / 2, 0), "picket", R2, fenceMat);
    // калитка — настоящая, открывается на E
    {
      const [hx, hz] = F.p(Math.min(wk, wk + ys), 0), [ex, ez] = F.p(Math.max(wk, wk + ys), 0);
      const a = Math.atan2(ex - hx, ez - hz) - Math.PI / 2;
      addDoor({ hx, hz, y: hFast(hx, hz) + 0.05, closed: a, openBy: -1.3 * side, w: 0.95, h: 1.2, t: 0.04, mat: fenceMat, startOpen: R2() < 0.5 });
    }
    // ворота: одна створка закрыта, вторая распахнута и вросла в траву
    {
      const [ax, az] = F.p(g0, 0), [bx, bz] = F.p(g1, 0), a = Math.atan2(bx - ax, bz - az) - Math.PI / 2, y = hFast(ax, az);
      beginStruct({ kind: "fence", x: (ax + bx) / 2, z: (az + bz) / 2, rot: a, w: 3.4, d: 0.2, h: 1.6, fy: y, fuel: 0.3 });
      panel("prop", { hp: 0.5, density: 450 });
      for (const [px, pz] of [[ax, az], [bx, bz]]) cyl(M.deadwood, px, y + 0.9, pz, 0.09, 0.08, 1.9, { seg: 7 });
      const [mx, mz] = F.p(g0 + 0.85, 0);
      box(M.planksDark, mx, y + 0.85, mz, 1.65, 1.4, 0.05, { rot: a, tile: 1.2, vertical: true, collide: true, walk: false });
      const oa = a + side * 1.25, [qx, qz] = F.p(g1, 0);
      box(M.planksDark, qx - Math.cos(oa) * 0.85, y + 0.85, qz + Math.sin(oa) * 0.85, 1.65, 1.4, 0.05, { rot: oa, rz: 0.04, tile: 1.2, vertical: true, collide: true, walk: false });
      endStruct();
    }
    // межа с соседом — горбыль, зады — жерди
    const nb = (e) => VILLAGE.yards.some((q) => q !== Y && q.row === Y.row && Math.abs(q.b - (Y.b + e * (Y.W + q.W) / 2)) < 1.2);
    for (const e of [-1, 1]) {
      if (e < 0 && nb(-1)) continue;
      vFence(...F.p(e * Y.W / 2, 0.2), ...F.p(e * Y.W / 2, D), "slab", R2);
    }
    vFence(...F.p(-Y.W / 2, D), ...F.p(Y.W / 2, D), "rail", R2);
    // огород и теплица
    for (const g of Y.beds) {
      const [bx, bz] = F.p(ys * Math.abs(g.s), g.f);
      box(M.soil, bx, terrainH(bx, bz) + 0.05, bz, 0.85, 0.16, g.L, { rot: F.along, tile: 1, cast: false });
    }
    if (Y.greenAt) greenhouse(Y.greenAt.at[0], Y.greenAt.at[1], F.along, R2);
    if (Y.carAt) vehicle(Y.car, Y.carAt.x, Y.carAt.z, Y.carAt.rot, { seed: 70 + Math.round(Y.b), paint: R2.int(0, 4), burnt: R2() < 0.3, tilt: 0.05 });
    // палисадник: сирень и крапива у забора, яблони в огороде
    for (let k = 0; k < 2; k++) {
      const [lx, lz] = F.p(side * R2.range(1.5, Y.W / 2 - 1.5), R2.range(0.9, 1.9));
      fruitTree(lx, lz, R2, "lilac");
    }
    let na = 0;
    for (let t = 0; t < 40 && na < (Y.apples ?? 1); t++) {
      const sA = R2.range(-Y.W / 2 + 1.5, Y.W / 2 - 1.5), fA = R2.range(4, D - 1.5), [ax, az] = F.p(sA, fA);
      if (!isFree(ax, az, 1.6, { pathPad: 0.5 }) || VB.apples.some((p) => Math.hypot(p[0] - ax, p[1] - az) < 3.5)) continue;
      fruitTree(ax, az, R2, "apple");
      VB.apples.push([ax, az]);
      keep(ax, az, 1.2);
      na++;
    }
    for (let k = 0; k < 3; k++) {
      const [nx, nz] = F.p(R2.range(-Y.W / 2 + 0.8, Y.W / 2 - 0.8), D - R2.range(0.5, 1.2));
      tallWeeds(nx, nz, 4, "fire", R2);
    }
  }
  for (const wl of VILLAGE.wells) craneWell(wl);
  obelisk(VILLAGE.obelisk);
  vHouse(VILLAGE.club);
  vHouse(VILLAGE.shop);
  busStop(VILLAGE.stop);
  firePond(VILLAGE.pond);
  for (const [[x, z], rot, idx] of VILLAGE.signs) roadSign(x, z, rot, idx);
  {
    const [x, z] = vxz(VIL.street - 3.8, -4.5);
    roadSign(x, z, Math.atan2(VU[0], VU[1]), 6);
  }
  buildPuddles();
}
var BASES = { farm: {}, depot: {} };
function planBases() {
  const A = SPAWNS.A, D = SPAWNS.D;
  // ферма: коровник 30×10 за спиной базы, водонапорная башня Рожновского, сенной навес, силосная траншея
  const f = BASES.farm;
  f.cow = { kind: "house", id: "коровник", x: -4, z: A.z - 21, rot: 0, style: "brick", w: 30, d: 10, h: 3, pitch: 0.3, roof: "slate", trimMat: M.planksDark, gableMat: M.planksGrey, damage: 0.75, seed: 6101, interior: false, door: { side: "front", at: -8 }, door2: { side: "back", at: 9 }, windows: [-12, -4, 0, 4, 8, 12].map((at) => ({ side: "front", at, w: 1.2, y0: 1.5, y1: 2.3 })).concat([-12, -8, -4, 0, 4, 13].map((at) => ({ side: "back", at, w: 1.2, y0: 1.5, y1: 2.3 }))) };
  f.cow.pad = addPad(f.cow.x, f.cow.z, 15.8, 5.8, 0, 3);
  PLANS.push({ x: f.cow.x, z: f.cow.z, hw: 15.5, hd: 5.5, rot: 0 });
  f.tower = { x: 24, z: A.z - 10, rot: 0.4, paint: "grey" };
  keep(f.tower.x, f.tower.z, 3);
  f.barn = { x: -27, z: A.z + 2, rot: Math.PI / 2, w: 12, d: 6.5 };
  f.barn.pad = addPad(f.barn.x, f.barn.z, 6.6, 3.8, f.barn.rot, 2.5);
  PLANS.push({ x: f.barn.x, z: f.barn.z, hw: 6.3, hd: 3.5, rot: f.barn.rot });
  f.silo = { x: 25, z: A.z + 13, rot: 0, w: 8, L: 18 };
  f.silo.pad = addPad(f.silo.x, f.silo.z, 4.8, 9.6, 0, 2.5);
  PLANS.push({ x: f.silo.x, z: f.silo.z, hw: 4.6, hd: 9.4, rot: 0 });
  f.wreck = { x: -18, z: A.z - 8, rot: 0.35 };
  keep(f.wreck.x, f.wreck.z, 4);
  // склад ГСМ: обвалованный парк из трёх РГС-50, вертикальный РВС-100, насосная, эстакада налива
  const d = BASES.depot, rot = Math.atan2(D.fx, D.fz);
  d.F = frame(D.x - D.fx * 22, D.z - D.fz * 22, rot);
  d.rot = rot;
  const reg = (lx, lz, hw, hd, m = 2.5) => {
    const [x, z] = d.F.p(lx, lz), p = addPad(x, z, hw, hd, rot, m);
    PLANS.push({ x, z, hw: hw - 0.3, hd: hd - 0.3, rot });
    return { x, z, pad: p };
  };
  d.park = reg(0, 0, 8.5, 8.2, 3);
  d.rvs = reg(15, -1, 3.6, 3.6);
  d.pump = { ...reg(-15, 2, 3.8, 3, 2.5) };
  d.rack = reg(13, 11, 5, 2.4);
  d.tanker = d.F.p(13, 11);
  BASES.depot.signs = [[-9.5, 9.2], [9.5, 9.2], [-15, 5.4]].map(([a, b]) => d.F.p(a, b));
}
function hayBarn(o, R2) {
  const { x, z, rot, w, d } = o, F = frame(x, z, rot), y = o.pad.y ?? terrainH(x, z);
  beginStruct({ kind: "shed", name: "сенной навес", x, z, rot, w, d, h: 4.6, fy: y, fuel: 2 });
  const posts = [];
  for (let a = -w / 2; a <= w / 2 + 0.01; a += w / 4) for (const b of [-d / 2, d / 2]) {
    const [px, pz] = F.p(a, b);
    posts.push(panel("prop", { hp: 0.8, density: 500 }));
    cyl(M.deadwood, px, y + 2.1, pz, 0.12, 0.1, 4.3, { seg: 7 });
    addCircle(px, pz, 0.14, y, y + 4.2);
  }
  const p = 0.33, hr = d / 2 * Math.tan(p), D2 = d / 2 + 0.5, Ls = D2 / Math.cos(p);
  for (let i = 0; i < 6; i++) for (const s2 of [-1, 1]) {
    if (R2() < 0.25) continue;
    const lx = -w / 2 + (i + 0.5) * w / 6, [px, pz] = F.p(lx, s2 * D2 / 2);
    panel("roof", { hp: 0.5, sup: { list: posts, frac: 0.5 }, density: 1200, float: 0, burnable: false });
    box(M.roofRust, px, y + 4.2 + hr - D2 / 2 * Math.tan(p), pz, w / 6 - 0.05, 0.03, Ls, { rot, rx: s2 * p + R2.range(-0.04, 0.04), tile: 1.2 });
  }
  noPanel();
  const [cx, cz] = F.p(0, 0);
  addBox(cx, y + 4.3 + hr / 2, cz, w + 0.4, hr, d + 1, rot, { walk: true });
  // тюки сена: как укладывают в сенниках — штабелями «в перевязку» (каждый ряд повёрнут на 90° к нижнему),
  // ячейка 1,1×1,1 м = два тюка 1,1×0,5; верх штабеля ступенями — его разбирают с края. Каждый тюк лежит на
  // нижнем ряду или на земле: висящих в воздухе тюков нет
  panel("prop", { hp: 1, density: 200 });
  const CELL = 1.12, ncx = Math.max(1, Math.floor((w - 1.6) / CELL)), ncz = Math.max(1, Math.floor((d - 1.4) / CELL));
  const ox = -ncx * CELL / 2 + CELL / 2, oz = -ncz * CELL / 2 + CELL / 2;
  for (let ix = 0; ix < ncx; ix++) for (let iz = 0; iz < ncz; iz++) {
    // высота штабеля: в глубине выше, к проходу ниже; часть ячеек уже выбрана
    const depth = iz / Math.max(1, ncz - 1), hgt = Math.max(0, Math.min(3, Math.round(1 + depth * 1.6 + R2.range(-0.7, 0.7))));
    if (R2() < 0.12) continue;
    for (let lv = 0; lv < hgt; lv++) {
      const cross = (lv + ix + iz) % 2 === 1;
      for (const k of [-1, 1]) {
        if (lv === hgt - 1 && hgt > 1 && R2() < 0.12) continue; // верхний тюк уже унесли
        const lx = ox + ix * CELL + (cross ? 0 : k * 0.27) + R2.range(-0.03, 0.03), lz = oz + iz * CELL + (cross ? k * 0.27 : 0) + R2.range(-0.03, 0.03);
        const [bx, bz] = F.p(lx, lz);
        box(M.hay, bx, y + 0.3 + lv * 0.6, bz, cross ? 1.1 : 0.5, 0.6, cross ? 0.5 : 1.1, { rot: rot + R2.range(-0.04, 0.04), tile: 0.8, collide: true });
      }
    }
  }
  endStruct();
}
function siloTrench(o, R2) {
  const { x, z, rot, w, L } = o, F = frame(x, z, rot), y = o.pad.y ?? terrainH(x, z);
  beginStruct({ kind: "shed", name: "силосная траншея", x, z, rot, w, d: L, h: 2.4, fy: y, fuel: 0 });
  for (const e of [-1, 1]) for (let k = 0; k < 6; k++) {
    const lz = -L / 2 + (k + 0.5) * L / 6, [px, pz] = F.p(e * w / 2, lz);
    panel("wall", { hp: 3, mode: "rigid", density: 2400, float: 0, burnable: false });
    box(M.hgConc, px, y + 1.2, pz, 0.3, 2.4, L / 6 - 0.04, { rot: rot + (R2() < 0.2 ? R2.range(-0.08, 0.08) : 0), rz: R2() < 0.25 ? e * R2.range(0.03, 0.12) : 0, tile: 1, collide: true });
  }
  noPanel();
  const [cx, cz] = F.p(0, -2);
  place(M.dirtMound, new THREEV.SphereGeometry(1, 10, 5, 0, TAU, 0, Math.PI / 2), cx, y, cz, rot, [w / 2 - 0.3, 0.9, L / 3]);
  endStruct();
}
function tankH(x, z, rot, y, R2) {
  const L = 9, R = 1.38;
  const S = beginStruct({ kind: "tank", name: "РГС-50", x, z, rot, w: L, d: 2.8, h: 2.8, fy: y, fuel: 0.4, quiet: true });
  noPanel();
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const a of [-3, 0, 3]) box(M.hgConc, x + c * a, y + 0.35, z - s * a, 0.5, 0.7, 2.4, { rot, tile: 1 });
  panel("prop", { hp: 4, mode: "rigid", density: 900, float: 0, burnable: false });
  const g = new THREEV.CylinderGeometry(R, R, L, 22, 1);
  g.rotateZ(Math.PI / 2);
  place(M.tankGrey, g, x, y + 0.5 + R, z, rot);
  for (const e of [-1, 1]) {
    const cap = new THREEV.SphereGeometry(R, 22, 8, 0, TAU, 0, 0.42);
    cap.translate(0, -R * Math.cos(0.42), 0);
    cap.rotateZ(-e * Math.PI / 2);
    place(M.tankGrey, cap, x + c * e * L / 2, y + 0.5 + R, z - s * e * L / 2, rot);
  }
  cyl(M.rust, x + c * 2, y + 0.5 + 2 * R + 0.12, z - s * 2, 0.32, 0.32, 0.25, { seg: 12 });
  cyl(M.rust, x - c * 1.5, y + 0.5 + 2 * R + 0.3, z + s * 1.5, 0.05, 0.05, 0.6, { seg: 6 });
  const tc = addBox(x, y + 0.5 + R, z, L + 0.6, 2 * R, 2 * R, rot, { walk: true });
  fuelTankReg(S, x, y + 0.5 + R, z, R, "h", tc).pn = curPanel();
  endStruct();
}
function tankV(x, z, y, R2) {
  const R = 2.365, H = 5.96;
  const S = beginStruct({ kind: "tank", name: "РВС-100", x, z, rot: 0, w: 4.8, d: 4.8, h: H, fy: y, fuel: 0.4, quiet: true });
  noPanel();
  cyl(M.hgConc, x, y + 0.15, z, R + 0.4, R + 0.45, 0.3, { seg: 24, tile: 1 });
  panel("prop", { hp: 6, mode: "rigid", density: 900, float: 0, burnable: false });
  cyl(M.tankGrey, x, y + 0.3 + H / 2, z, R, R, H, { seg: 28, tile: 1.6 });
  place(M.tankGrey, new THREEV.ConeGeometry(R + 0.04, 0.45, 28, 1, true), x, y + 0.3 + H + 0.22, z, 0);
  const tc = addCircle(x, z, R + 0.05, y, y + H + 0.6);
  fuelTankReg(S, x, y + 0.3 + H / 2, z, R, "v", tc).pn = curPanel();
  // лестница с ограждением на крышу
  const lx = x + R + 0.25, lz = z;
  ladderGeo(M.rust, lx, lz, y + 0.3, y + H + 0.3, 0, 1, 0.5, [1, 0]);
  addLadder({ x: lx, z: lz, nx: 1, nz: 0, y0: y + 0.3, y1: y + H + 0.32, w: 0.5, exit: [x + R - 0.6, y + H + 0.62, z] });
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU, a2 = (i + 1) / 16 * TAU, r = R - 0.1;
    beam(M.rust, VV(x + Math.cos(a) * r, y + H + 1.35, z + Math.sin(a) * r), VV(x + Math.cos(a2) * r, y + H + 1.35, z + Math.sin(a2) * r), 0.02, { seg: 4, cast: false });
    if (i % 2 === 0) beam(M.rust, VV(x + Math.cos(a) * r, y + H + 0.35, z + Math.sin(a) * r), VV(x + Math.cos(a) * r, y + H + 1.35, z + Math.sin(a) * r), 0.018, { seg: 4, cast: false });
  }
  addBox(x, y + H + 0.45, z, R * 1.6, 0.3, R * 1.6, 0, { walk: true });
  endStruct();
}
function loadingRack(o, rot, R2) {
  const { x, z } = o, y = o.pad.y ?? terrainH(x, z), F = frame(x, z, rot);
  beginStruct({ kind: "tower", name: "эстакада налива", x, z, rot, w: 8, d: 3, h: 4.5, fy: y, fuel: 0, quiet: true });
  const posts = [];
  for (const a of [-3.6, 0, 3.6]) for (const b of [-1.4, -0.4]) {
    const [px, pz] = F.p(a, b);
    posts.push(panel("prop", { hp: 2, mode: "rigid", density: 2e3, float: 0, burnable: false }));
    cyl(M.towerSteel, px, y + 1.6, pz, 0.08, 0.08, 3.2, { seg: 6 });
    addCircle(px, pz, 0.1, y, y + 3.2);
  }
  panel("prop", { hp: 3, sup: { list: posts, frac: 0.5 }, mode: "rigid", density: 2e3, float: 0, burnable: false });
  const [dx, dz] = F.p(0, -0.9);
  box(M.grate, dx, y + 3.2, dz, 8, 0.06, 1.4, { rot, tile: 1, collide: true });
  for (const a of [-4, 4]) for (const yy of [3.7, 4.2]) {
    const [p0x, p0z] = F.p(a, -0.25), [p1x, p1z] = F.p(a, -1.55);
    beam(M.towerRed, VV(p0x, y + yy, p0z), VV(p1x, y + yy, p1z), 0.025, { seg: 4 });
  }
  for (const yy of [3.7, 4.2]) {
    const [p0x, p0z] = F.p(-4, -0.25), [p1x, p1z] = F.p(4, -0.25);
    beam(M.towerRed, VV(p0x, y + yy, p0z), VV(p1x, y + yy, p1z), 0.025, { seg: 4 });
  }
  // наливные стояки с шарнирными рукавами
  for (const a of [-2, 2]) {
    const [px, pz] = F.p(a, -1.2), [qx, qz] = F.p(a + 0.4, 1.1);
    beam(M.steelPipe, VV(px, y, pz), VV(px, y + 3.9, pz), 0.07, { seg: 8 });
    beam(M.steelPipe, VV(px, y + 3.9, pz), VV(qx, y + 3.3, qz), 0.05, { seg: 6 });
    beam(M.steelPipe, VV(qx, y + 3.3, qz), VV(qx, y + 2.4, qz), 0.05, { seg: 6 });
  }
  // лестница на площадку
  const [sx, sz] = F.p(-4.6, -0.9);
  ladderGeo(M.towerSteel, sx, sz, y, y + 3.2, Math.sin(rot + Math.PI / 2) * 0 + Math.cos(rot) * 0 + -Math.sin(rot), -Math.cos(rot), 0.6);
  addLadder({ x: sx, z: sz, nx: -Math.cos(rot), nz: Math.sin(rot), y0: y, y1: y + 3.22, w: 0.6, exit: [dx, y + 3.26, dz] });
  noPanel();
  endStruct();
}
function bund(F, rot, hw, hd, y, R2) {
  // обвалование 1 м: земляной вал, по гребню — бетонные плиты; проём для прохода
  const seg = (a0, b0, a1, b1) => {
    const L = Math.hypot(a1 - a0, b1 - b0), n = Math.ceil(L / 3);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, a = lerp(a0, a1, t), b = lerp(b0, b1, t), [x, z] = F.p(a, b);
      const r = rot + Math.atan2(a1 - a0, b1 - b0);
      if (R2() < 0.06) continue;
      box(M.hgConc, x, y + 0.5, z, 0.25, 1, L / n - 0.05, { rot: r, tile: 1, collide: true });
    }
  };
  seg(-hw, -hd, hw, -hd);
  seg(hw, -hd, hw, hd);
  seg(-hw, hd, -1.5, hd);
  seg(1.5, hd, hw, hd);
  seg(-hw, -hd, -hw, hd);
}
function stencilSign(x, z, rot, idx, w = 1.2) {
  const y = terrainH(x, z);
  cyl(M.galv, x, y + 0.85, z, 0.035, 0.035, 1.7, { seg: 6 });
  box(M.whitewash, x, y + 1.45, z, w + 0.06, w * 0.3, 0.02, { rot, tile: 1, cast: false });
  for (const e of [0, Math.PI]) {
    const fx = Math.sin(rot + e) * 0.012, fz = Math.cos(rot + e) * 0.012;
    place(STENCIL.mat, stencilGeo(idx, w, w * 0.25), x + fx, y + 1.45, z + fz, rot + e, 1, { cast: false });
  }
}
function buildBases() {
  const R2 = rng(8181), f = BASES.farm, d = BASES.depot;
  vHouse(f.cow);
  waterTower(f.tower, R2);
  hayBarn(f.barn, R2);
  siloTrench(f.silo, R2);
  vehicle("truck", f.wreck.x, f.wreck.z, f.wreck.rot, { seed: 91, burnt: true, tilt: 0.08 });
  for (let i = 0; i < 3; i++) haystack(f.barn.x + 9.5 + i * 5, f.barn.z - 9.5 + R2.range(-1, 1), R2);
  tallWeeds(f.cow.x + 4, f.cow.z + 7.5, 14, "hog", R2);
  tallWeeds(f.silo.x - 7, f.silo.z - 4, 10, "hog", R2);
  // склад ГСМ
  const py = d.park.pad.y ?? terrainH(d.park.x, d.park.z);
  bund(d.F, d.rot, 8, 7.8, py, R2);
  for (const b of [-4.2, 0, 4.2]) {
    const [x, z] = d.F.p(0, b);
    tankH(x, z, d.rot, py, R2);
  }
  tankV(d.rvs.x, d.rvs.z, d.rvs.pad.y ?? terrainH(d.rvs.x, d.rvs.z), R2);
  vHouse({ kind: "house", id: "насосная", x: d.pump.x, z: d.pump.z, rot: d.rot, style: "brick", w: 6.4, d: 4.8, h: 3, pitch: 0.18, roof: "rust", trimMat: M.planksDark, gableMat: M.planksGrey, damage: 0.35, seed: 6202, interior: false, door: { side: "front", at: 1.6 }, windows: [{ side: "front", at: -1.4, w: 1, y0: 1.2, y1: 2.1, bars: true }, { side: "left", at: 0, w: 1, y0: 1.2, y1: 2.1 }], pad: d.pump.pad });
  loadingRack(d.rack, d.rot, R2);
  vehicle("truck", d.tanker[0], d.tanker[1], d.rot + Math.PI / 2, { seed: 92, paint: 3, tilt: 0.03 });
  for (const [x, z] of d.signs) stencilSign(x, z, d.rot, R2() < 0.5 ? 1 : 2);
  // трубопроводы от парка к насосной и на эстакаду
  for (const [a0, b0, a1, b1] of [[-8.5, 1, -11.5, 1], [8.5, 2, 12, 2], [12, 2, 12, 9.8]]) {
    const [x0, z0] = d.F.p(a0, b0), [x1, z1] = d.F.p(a1, b1);
    beam(M.steelPipe, VV(x0, terrainH(x0, z0) + 0.45, z0), VV(x1, terrainH(x1, z1) + 0.45, z1), 0.08, { seg: 8 });
  }
}
function zoneSignTex() {
  const [c, x] = cv(512, 256);
  for (const [i, top, bot] of [[0, "ЗАПРЕТНАЯ ЗОНА", "ПРОХОД ЗАПРЕЩЁН"], [1, "СТОЙ!", "ЗАПРЕТНАЯ ЗОНА"]]) {
    const u = i * 256;
    x.fillStyle = "#efeadf";
    x.fillRect(u + 4, 4, 248, 248);
    x.strokeStyle = "#b3241b";
    x.lineWidth = 14;
    x.strokeRect(u + 14, 14, 228, 228);
    x.fillStyle = i ? "#b3241b" : "#141414";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.font = "bold 46px 'Arial Narrow', Arial, sans-serif";
    x.fillText(top, u + 128, 92, 210);
    x.fillStyle = "#141414";
    x.font = "bold 30px 'Arial Narrow', Arial, sans-serif";
    x.fillText(bot, u + 128, 160, 210);
    for (let k = 0; k < 30; k++) blob(x, u + srnd() * 256, srnd() * 256, sr(2, 9), [120, 80, 40], sr(0.1, 0.35));
  }
  return tex(c);
}
function buildZone(R2) {
  M.zoneSign ??= std({ map: zoneSignTex(), roughness: 0.8, side: THREEV.DoubleSide });
  const sg = (i) => {
    const g = new THREEV.PlaneGeometry(0.7, 0.7), uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 2);
    return g;
  };
  const sgs = [sg(0), sg(1)], post = new THREEV.BoxGeometry(0.14, 1, 0.14);
  const line = (e, kind) => {
    const ring = [[-e, -e], [e, -e], [e, e], [-e, e], [-e, -e]], helix = [];
    for (let k = 0; k < 4; k++) {
      const [ax, az] = ring[k], [bx, bz] = ring[k + 1], L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, ox = uz, oz = -ux;
      let prev = null, n = 0;
      for (let s = 0; s <= L + 0.01; s += 3) {
        const x = ax + ux * s, z = az + uz * s, y = hFast(x, z), H = kind === "in" ? 2.5 : 2.3;
        const lean = R2() < 0.03 ? R2.range(-0.25, 0.25) : 0;
        place(M.concrete, post, x, y + H / 2 - 0.3, z, [lean * uz, 0, lean * ux], [1, H + 0.6, 1]);
        // козырёк столба — наружу, под 45°
        const tx = x + ox * 0.35, tz = z + oz * 0.35;
        beam(M.rust, VV(x, y + H - 0.1, z), VV(tx, y + H + 0.3, tz), 0.025, { seg: 4, cast: false });
        if (prev) {
          for (const hh of kind === "in" ? [0.3, 0.7, 1.1, 1.5, 1.9, 2.3] : [0.4, 0.9, 1.4, 1.9]) if (R2() > 0.03) beam(M.wire, VV(prev[0], prev[1] + hh, prev[2]), VV(x, y + hh - 0.02, z), 5e-3, { seg: 3, cast: false });
          for (const q of [0.5, 0.95]) beam(M.wire, VV(prev[0] + ox * 0.35 * q, prev[1] + H - 0.1 + 0.4 * q, prev[2] + oz * 0.35 * q), VV(tx - ox * 0.35 * (1 - q), y + H - 0.1 + 0.4 * q, tz - oz * 0.35 * (1 - q)), 5e-3, { seg: 3, cast: false });
          addBox((prev[0] + x) / 2, Math.min(prev[1], y) + 1.4, (prev[2] + z) / 2, 3, 2.8 + Math.abs(prev[1] - y), 0.12, Math.atan2(ux, uz) + Math.PI / 2, { walk: false });
        }
        prev = [x, y, z];
        if (++n % 10 === 5) {
          const sx = x - ox * (kind === "in" ? 0.12 : -0.12), sz = z - oz * (kind === "in" ? 0.12 : -0.12);
          place(M.zoneSign, sgs[kind === "in" ? 0 : 1], sx, y + 1.5, sz, Math.atan2(kind === "in" ? -ox : ox, kind === "in" ? -oz : oz), 1, { cast: false });
        }
      }
      if (kind === "out") for (let s = 0; s <= L; s += 0.32) {
        const cx = ax + ux * s, cz = az + uz * s, ang = s / 0.32 * (TAU / 6), r = 0.42;
        helix.push(VV(cx + ox * Math.cos(ang) * r + ux * Math.cos(ang) * 0.12, hFast(cx, cz) + 2.3 + 0.42 + Math.sin(ang) * r, cz + oz * Math.cos(ang) * r + uz * Math.cos(ang) * 0.12));
      }
    }
    for (let i = 0; i < helix.length - 1; i += 1400) {
      const part = helix.slice(i, i + 1401), tube = new THREEV.Mesh(new THREEV.TubeGeometry(new THREEV.CatmullRomCurve3(part), part.length, 0.012, 3), M.wire);
      tube.castShadow = false;
      tube.name = "egoza";
      scene.add(tube);
    }
  };
  line(MAP.PLAY, "in");
  line(MAP.MINE1, "out");
  // решётки водопропусков, где река проходит под ограждениями
  for (const st of STREAMS) for (const e of [MAP.PLAY, MAP.MINE1]) for (let s = 0; s < st.len - 1; s += 1) {
    const a = polyAt(st.pts, s), b = polyAt(st.pts, s + 1);
    if ((edgeDist(a.x, a.z) - e) * (edgeDist(b.x, b.z) - e) > 0) continue;
    const nx = -a.tz, nz = a.tx, wy = streamAt(a.x, a.z).water ?? MAP.WATER_Y;
    for (let k = -8; k <= 8; k++) {
      const px = a.x + nx * k * 0.3, pz = a.z + nz * k * 0.3, y0 = hFast(px, pz) - 0.3;
      beam(M.rust, VV(px, y0, pz), VV(px, Math.max(y0 + 0.5, wy + 2.2), pz), 0.02, { seg: 4, cast: false });
    }
    beam(M.rust, VV(a.x - nx * 2.4, wy + 2.1, a.z - nz * 2.4), VV(a.x + nx * 2.4, wy + 2.1, a.z + nz * 2.4), 0.04, { seg: 4 });
  }
  // просека: пни и порубочные остатки
  for (let t = 0, n = 0; t < 4e3 && n < 160; t++) {
    const x = R2.range(-MAP.CUT, MAP.CUT), z = R2.range(-MAP.CUT, MAP.CUT), e = edgeDist(x, z);
    if (e < MAP.MINE1 + 1.5 || e > MAP.CUT - 1 || streamAt(x, z).d < STREAM_BW + 3) continue;
    stump(x, z, R2);
    n++;
  }
}
function ravineBridge(R2) {
  // Конструкция по образцу сельских балочных мостов на сваях («Строительство моста своими руками», пособия по
  // деревянным мостам): сваи → насадка (поперечный брус на головах свай, на хомутах) → прогоны строго над осями
  // свай и крайние прогоны под консолями настила → поперечный настил из пластин → колейный настил из досок вдоль
  // моста → колесоотбойные брусья. Перильные стойки пришиты к крайним прогонам и опущены ниже настила, к каждой —
  // подкос от насадки/прогона. На концах — береговые устои: короткие сваи с насадкой и заборной стенкой из наката.
  const pm = ROADS.main.pts, a = pm[pm.length - 1], b = ROADS.main2.pts[0];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = -uz, nz = ux;
  const ya = hFast(a[0], a[1]) + 0.12, yb = hFast(b[0], b[1]) + 0.12, rot = Math.atan2(ux, uz), W = 4.2;
  const P = (t, e = 0) => [a[0] + ux * t + nx * e, a[1] + uz * t + nz * e];
  const Y = (t) => lerp(ya, yb, clamp(t / L, 0, 1));
  const gAt = (t, e = 0) => hFast(...P(t, e));
  // вертикальный пакет относительно верха настила Y: пластины 8 см, прогоны Ø30 см, насадка Ø26 см
  const DECK_T = 0.08, STR_R = 0.15, STR_Y = -DECK_T - STR_R + 0.02, CAP_R = 0.13, CAP_Y = STR_Y - STR_R - CAP_R + 0.05;
  const PILE_E = [-1.6, 0, 1.6], STR_E = [-2.02, -1.6, -0.8, 0, 0.8, 1.6, 2.02], POST_E = 2.02 + 0.12 + 0.07;
  beginStruct({ kind: "bridge", name: "мост", x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, rot, w: W, d: L, h: 6, fy: Math.min(ya, yb), fuel: 0.8 });
  noPanel();
  // опора: сваи до насадки (только если свая видна над грунтом), насадка с выпусками под крайние прогоны,
  // диагональная схватка между крайними сваями — только когда обе сваи есть
  const support = (t, abut) => {
    const y = Y(t), capY = y + CAP_Y, piles = [];
    for (const e of abut ? [-2.0, -1.0, 0, 1.0, 2.0] : PILE_E) {
      const [x, z] = P(t, e), gr = hFast(x, z);
      if (capY - CAP_R - gr < 0.06) continue; // насадка лежит на грунте — свая не нужна
      beam(M.barkLog, VV(x, gr - 0.6, z), VV(x, capY + 0.02, z), abut ? 0.12 : 0.14, { seg: 7 });
      addCircle(x, z, 0.15, gr - 0.6, capY);
      piles.push({ e, gr });
    }
    const [x0, z0] = P(t, -2.3), [x1, z1] = P(t, 2.3);
    beam(M.barkLog, VV(x0, capY, z0), VV(x1, capY, z1), CAP_R, { seg: 6 });
    // хомуты насадки на сваях
    for (const p of piles) {
      const [hx, hz] = P(t, p.e);
      box(M.rust, hx, capY - 0.02, hz, 0.34, 0.05, 0.34, { rot, tile: 1, cast: false });
    }
    const l = piles.find((p) => p.e <= -1.5), r = piles.find((p) => p.e >= 1.5);
    if (!abut && l && r) {
      const lo = Math.max(r.gr + 0.3, capY - 2.6);
      if (capY - 0.15 - lo > 0.5) {
        const [p0x, p0z] = P(t, l.e), [p1x, p1z] = P(t, r.e);
        beam(M.barkLog, VV(p0x, capY - 0.15, p0z), VV(p1x, lo, p1z), 0.07, { seg: 5, cast: false });
      }
    }
    return piles.length;
  };
  // береговые устои: короткие сваи + насадка, со стороны оврага — заборная стенка из наката до грунта
  for (const [t, dir] of [[0.7, 1], [L - 0.7, -1]]) {
    support(t, true);
    const y = Y(t), capY = y + CAP_Y;
    for (let k = 0; k < 6; k++) {
      const ly = capY - CAP_R - 0.11 - k * 0.22, [wx, wz] = P(t + dir * 0.18);
      if (ly < Math.min(gAt(t + dir * 0.18, -2), gAt(t + dir * 0.18, 2)) - 0.1) break;
      const [qx0, qz0] = P(t + dir * 0.18, -2.25), [qx1, qz1] = P(t + dir * 0.18, 2.25);
      beam(M.barkLog, VV(qx0, ly, qz0), VV(qx1, ly, qz1), 0.11, { seg: 6, cast: k < 2 });
      if (k === 0) addBox(wx, ly, wz, 4.6, 0.22, 0.22, rot, { walk: false });
    }
  }
  const trest = [];
  for (let t = 4; t < L - 2; t += 4.5) {
    const pn = panel("prop", { hp: 4.5, mode: "rigid", density: 650, float: 1.2 });
    support(t, false);
    trest.push({ t, pn });
  }
  noPanel();
  // пролёты: прогоны + настил + колеи + колесоотбой + перила — одна деталь на пролёт
  const plank = new THREEV.BoxGeometry(4.24, DECK_T, 0.24);
  const track = new THREEV.BoxGeometry(0.2, 0.045, 1);
  const bounds = [-1, ...trest.map((q) => q.t), L + 1];
  for (let i = 0; i < bounds.length - 1; i++) {
    const t0 = bounds[i], t1 = bounds[i + 1], sups = [];
    if (i > 0) sups.push(trest[i - 1].pn);
    if (i < trest.length) sups.push(trest[i].pn);
    const span = panel("prop", { hp: 4, mode: "rigid", density: 520, float: 1.4, sup: sups.length ? { list: sups, frac: 0.99 } : null });
    span.bridgeSpan = true;
    // прогоны: над осями свай и крайние — под концами пластин (на них же держатся перильные стойки)
    for (const e of STR_E) {
      const r = Math.abs(e) > 1.9 ? 0.12 : e === 0 ? STR_R : 0.14;
      const [x0, z0] = P(t0 - 0.05, e), [x1, z1] = P(t1 + 0.05, e);
      beam(M.barkLog, VV(x0, Y(t0) + STR_Y + (STR_R - r), z0), VV(x1, Y(t1) + STR_Y + (STR_R - r), z1), r, { seg: 7 });
    }
    // поперечный настил из пластин (длинная сторона — поперёк моста), редкие выбитые
    for (let t = Math.ceil((t0 + 1) / 0.26) * 0.26 - 1; t < t1 - 1e-6; t += 0.26) {
      if (t < t0 - 1e-6) continue;
      if (R2() < 0.03 && t > 3 && t < L - 3) continue;
      const [x, z] = P(t, R2.range(-0.05, 0.05));
      place(R2() < 0.5 ? M.planksDark : M.planks, plank, x, Y(t) - DECK_T / 2, z, [R2.range(-0.012, 0.012), rot, R2.range(-0.006, 0.006)]);
    }
    // колейный настил: по три доски вдоль моста под каждое колесо
    const nT = Math.max(1, Math.round((t1 - t0) / 1));
    for (const ce of [-0.85, 0.85]) for (const de of [-0.21, 0, 0.21]) for (let k = 0; k < nT; k++) {
      const ta = t0 + (k + 0.5) * (t1 - t0) / nT, [x, z] = P(ta, ce + de + R2.range(-0.015, 0.015)), len = (t1 - t0) / nT - 0.02;
      const pitch = Math.atan2(Y(t1) - Y(t0), t1 - t0);
      place(M.planks, track, x, Y(ta) + 0.022, z, [-pitch, rot, 0], [1, 1, len]);
    }
    // колесоотбойные брусья на подкладках
    for (const e of [-1, 1]) {
      const [x0, z0] = P(t0 + 0.05, e * 1.88), [x1, z1] = P(t1 - 0.05, e * 1.88);
      beam(M.barkLog, VV(x0, Y(t0) + 0.13, z0), VV(x1, Y(t1) + 0.13, z1), 0.1, { seg: 6 });
      const tm = (t0 + t1) / 2, [gx, gz] = P(tm, e * 1.88);
      addBox(gx, Y(tm) + 0.12, gz, 0.2, 0.24, t1 - t0, rot, { walk: true });
    }
    // перила: стойка пришита к крайнему прогону (низ ниже настила), подкос к прогону, поручень и средний брус
    for (const e of [-1, 1]) {
      let prev = null;
      for (let t = Math.ceil(Math.max(0, t0) / 2) * 2; t < t1 - 1e-6 && t <= L + 0.01; t += 2) {
        const [x, z] = P(t, e * POST_E), y = Y(t);
        if (R2() < 0.08 && t > 2 && t < L - 2) {
          prev = null;
          continue;
        }
        const bot = y + STR_Y - 0.12, top = y + 1.1;
        box(M.planks, x, (bot + top) / 2, z, 0.13, top - bot, 0.13, { rot, tile: 1 });
        // болт крепления к прогону
        const [bx2, bz2] = P(t, e * (POST_E + 0.07));
        box(M.rust, bx2, y + STR_Y, bz2, 0.03, 0.05, 0.05, { rot, tile: 1, cast: false });
        // подкос: от стойки на 0,45 м над настилом вниз-внутрь к крайнему прогону под настилом
        const [kx0, kz0] = P(t + 0.02, e * (POST_E - 0.04)), [kx1, kz1] = P(t + 0.02, e * 2.02);
        if (R2() > 0.15) beam(M.planks, VV(kx0, y + 0.45, kz0), VV(kx1 + ux * 0.55, y + 0.05, kz1 + uz * 0.55), 0.035, { seg: 4, cast: false });
        if (prev && R2() > 0.1) {
          beam(M.planks, VV(prev[0], prev[1] + 1.05, prev[2]), VV(x, y + 1.05, z), 0.05, { seg: 5 });
          if (R2() > 0.15) beam(M.planks, VV(prev[0], prev[1] + 0.55, prev[2]), VV(x, y + 0.55, z), 0.04, { seg: 5, cast: false });
        }
        prev = [x, y, z];
      }
    }
    // коллайдеры настила кусками ≤2,3 м (уклон моста), перила — по пролёту
    const n = Math.max(1, Math.ceil((t1 - t0) / 2.3)), seg = (t1 - t0) / n;
    for (let k = 0; k < n; k++) {
      const tm = t0 + (k + 0.5) * seg, [x, z] = P(tm);
      addBox(x, Y(tm) - 0.1, z, W, 0.3, seg + 0.04, rot, { walk: true });
    }
    const tm = (t0 + t1) / 2;
    for (const e of [-1, 1]) {
      const [rx, rz] = P(tm, e * POST_E);
      addBox(rx, Y(tm) + 0.6, rz, 0.13, 1.1, t1 - t0, rot, { walk: false });
    }
  }
  noPanel();
  endStruct();
  LANDMARKS.bridges.push({ a, b, deck: (ya + yb) / 2 });
}
function fordStones(R2) {
  const rock = new THREEV.DodecahedronGeometry(1, 0);
  for (const st of STREAMS) for (const c of st.cross || []) {
    const q = polyAt(st.pts, c.s), nx = -q.tz, nz = q.tx;
    for (let k = 0; k < 26; k++) {
      const along = R2.range(-4.5, 4.5), e = R2.range(-STREAM_BW - 0.8, STREAM_BW + 0.8), x = q.x + q.tx * along + nx * e, z = q.z + q.tz * along + nz * e, r = R2.range(0.15, 0.42);
      place(M.stone, rock, x, hFast(x, z) + r * 0.2, z, [R2() * 3, R2() * 3, R2() * 3], [r * 1.4, r * 0.6, r]);
    }
  }
}
function buildReedsRiver() {
  const R2 = rng(5150);
  injectWind(M.reed, { amp: 0.35, stiff: 1.7, refH: 2.2, flutter: 0.05, trample: true, blast: 1.3 });
  const planes = [];
  for (let p2 = 0; p2 < 3; p2++) {
    const g = new THREEV.PlaneGeometry(1.1, 2.2, 1, 3);
    g.translate(0, 1.1, 0);
    g.rotateY(p2 * Math.PI / 3);
    const nn = g.attributes.normal;
    for (let i = 0; i < nn.count; i++) nn.setXYZ(i, nn.getX(i) * 0.3, 0.9, nn.getZ(i) * 0.3);
    planes.push(g);
  }
  const geo = mergeSimple(planes), pts = [];
  for (const st of STREAMS) for (let k = 0; k < 9e3 && pts.length < 1800; k++) {
    const s = R2() * st.len, q = polyAt(st.pts, s), e = (R2() < 0.5 ? -1 : 1) * R2.range(STREAM_BW - 0.6, STREAM_BW + 1.6);
    const x = q.x - q.tz * e, z = q.z + q.tx * e;
    if (edgeDist(x, z) > MAP.CUT + 20) continue;
    if (fbm(x * 0.09 + 3, z * 0.09 - 5, 2) < 0.45) continue;
    if (pathInfluence(x, z, 2.5) > 0) continue;
    if ((st.cross || []).some((c) => Math.abs(c.s - s) < 7)) continue;
    pts.push([x, z]);
  }
  const im3 = new THREEV.InstancedMesh(geo, M.reed, Math.max(1, pts.length));
  const m = new THREEV.Matrix4(), q = new THREEV.Quaternion(), p = new THREEV.Vector3(), sc = new THREEV.Vector3(), c = new THREEV.Color(), up = new THREEV.Vector3(0, 1, 0);
  pts.forEach(([x, z], i) => {
    const y = hFast(x, z) - 0.05, h = R2.range(0.75, 1.2);
    p.set(x, y, z);
    q.setFromAxisAngle(up, R2() * TAU);
    sc.set(R2.range(0.8, 1.2), h, R2.range(0.8, 1.2));
    m.compose(p, q, sc);
    im3.setMatrixAt(i, m);
    // бабье лето: камыш выгорел до соломенного
    const v = R2.range(0.85, 1.15);
    c.setRGB(v * 1.12, v, v * 0.62);
    im3.setColorAt(i, c);
    pts[i].push(y);
  });
  im3.count = pts.length;
  im3.receiveShadow = true;
  im3.castShadow = false;
  im3.name = "reeds";
  scene.add(im3);
  indexReeds(im3, pts);
}
function sapling(x, z, R2) {
  const y = terrainH(x, z), h = R2.range(2.2, 4.2);
  beam(M.barkBirch, VV(x, y - 0.1, z), VV(x + R2.range(-0.15, 0.15), y + h, z + R2.range(-0.15, 0.15)), 0.045, { seg: 5, r1: 0.02 });
  M.leafBirch ??= foliage(shrubTex(), { alphaTest: 0.45, color: 14204494, glow: 789516 });
  const g = new THREEV.PlaneGeometry(1.1, 1.3);
  for (let i = 0; i < 6; i++) place(M.leafBirch, g, x + R2.range(-0.4, 0.4), y + h * R2.range(0.55, 0.95), z + R2.range(-0.4, 0.4), [R2.range(-0.4, 0.4), R2() * TAU, 0], R2.range(0.7, 1.1), { cast: false });
}
function buildField() {
  const R2 = rng(4646), FIELD = { stacks: [] };
  const pick = (r, tries = 200) => {
    for (let t = 0; t < tries; t++) {
      const [x, z] = vxz(R2.range(VIL.field0 - 2, VIL.field1 + 4), R2.range(-55, 55));
      if (inField(x, z) < 0.6 || !isFree(x, z, r, { pathPad: 1.2 })) continue;
      return [x, z];
    }
    return null;
  };
  for (let i = 0; i < 7; i++) {
    const p = pick(2.6);
    if (!p) continue;
    haystack(p[0], p[1], R2);
    keep(p[0], p[1], 2.6);
    FIELD.stacks.push(p);
  }
  for (let i = 0; i < 6; i++) {
    const p = pick(1);
    if (p) tallWeeds(p[0], p[1], 12, "hog", R2);
  }
  for (let i = 0; i < 10; i++) {
    const p = pick(1);
    if (p) tallWeeds(p[0], p[1], 10, "fire", R2);
  }
  for (let i = 0; i < 26; i++) {
    const p = pick(0.8);
    if (!p) continue;
    for (let k = 0; k < R2.int(1, 3); k++) sapling(p[0] + R2.range(-2, 2), p[1] + R2.range(-2, 2), R2);
  }
  return FIELD;
}
var HGATE = { leaves: [], power: true, lv: 1, ramp: 1, sw: null, snd: null, moving: 0 };
function gBox(list, sx, sy, sz, x, y, z, tile = 1.5) {
  const g = uvBox(new THREEH.BoxGeometry(sx, sy, sz), sx, sy, sz, tile);
  g.translate(x, y, z);
  list.push(g);
}
function gBeam(list, a, b, r, seg = 6) {
  const A2 = new THREEH.Vector3(...a), B2 = new THREEH.Vector3(...b), L = A2.distanceTo(B2);
  const g = new THREEH.CylinderGeometry(r, r, L, seg, 1, true);
  g.applyQuaternion(new THREEH.Quaternion().setFromUnitVectors(new THREEH.Vector3(0, 1, 0), B2.clone().sub(A2).normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  list.push(g);
}
function gMesh(parent, mat, list, cast = true) {
  if (!list.length) return null;
  const g = BGU.mergeGeometries(list.map((x) => normalize(x, mat)), false);
  g.computeBoundingSphere();
  const m = new THREEH.Mesh(g, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  m.name = "hg_gate";
  parent.add(m);
  return m;
}
function hgGateLeaf(e, closedX, openX, startX, o = {}) {
  const Zl = e * (HG.L + 0.36), lead = -Math.sign(closedX) * 3.95;
  const grp = new THREEH.Group();
  const [x0, z0] = hgW(startX, Zl);
  grp.position.set(x0, HG.fy, z0);
  grp.rotation.y = HG.rot;
  scene.add(grp);
  const sheet = [], rib = [], steel = [], haz = [], dark = [];
  const wx = o.wicket ? -lead * 0.55 : null, ww = 0.5, wh = 2.2;
  // обшивка (профлист) — с вырезом под калитку
  if (wx === null) gBox(sheet, 7.9, 7.7, 0.05, 0, 3.95, 0);
  else {
    const l0 = -3.95, l1 = wx - ww, r0 = wx + ww, r1 = 3.95;
    gBox(sheet, l1 - l0, 7.7, 0.05, (l0 + l1) / 2, 3.95, 0);
    gBox(sheet, r1 - r0, 7.7, 0.05, (r0 + r1) / 2, 3.95, 0);
    gBox(sheet, 2 * ww, 7.8 - wh, 0.05, wx, (wh + 7.8) / 2, 0);
  }
  // рама: пояса, стойки, раскос; по обе стороны листа
  for (const s of [-1, 1]) {
    const zz = s * 0.06;
    for (const yy of [0.15, 3.95, 7.75]) {
      if (wx !== null && yy < 1) {
        gBox(rib, wx - ww + 3.95, 0.14, 0.08, (-3.95 + wx - ww) / 2, yy, zz, 1);
        gBox(rib, 3.95 - wx - ww, 0.14, 0.08, (3.95 + wx + ww) / 2, yy, zz, 1);
      } else gBox(rib, 8, 0.14, 0.08, 0, yy, zz, 1);
    }
    for (const xx of [-3.95, 3.95]) gBox(rib, 0.12, 7.9, 0.08, xx, 3.95, zz, 1);
    if (wx !== null) {
      for (const xx of [wx - ww - 0.05, wx + ww + 0.05]) gBox(rib, 0.08, wh, 0.08, xx, wh / 2, zz, 1);
      gBox(rib, 2 * ww + 0.2, 0.1, 0.08, wx, wh + 0.05, zz, 1);
      gBeam(rib, [-3.9, 3.95, zz], [3.9, 7.7, zz], 0.04, 5);
    } else gBeam(rib, [-3.9, 0.2, zz], [3.9, 7.7, zz], 0.04, 5);
    // «зебра» на набегающей кромке и ручка-скоба
    gBox(haz, 0.2, 7.6, 0.02, lead - Math.sign(lead) * 0.16, 3.95, s * 0.035, 0.6);
    gBeam(dark, [lead - Math.sign(lead) * 0.45, 0.95, s * 0.16], [lead - Math.sign(lead) * 0.45, 1.6, s * 0.16], 0.022, 6);
    for (const yy of [0.95, 1.6]) gBox(dark, 0.03, 0.03, 0.12, lead - Math.sign(lead) * 0.45, yy, s * 0.1, 1);
  }
  // тележки: щека, ось, два ролика на полке рельса; внизу — направляющий ролик в швеллере
  for (const tx of [-2.7, 2.7]) {
    gBox(steel, 0.32, 0.62, 0.05, tx, 8.12, e * 0.06, 1);
    for (const rx of [-0.11, 0.11]) {
      const w = new THREEH.CylinderGeometry(0.075, 0.075, 0.06, 10);
      w.rotateX(Math.PI / 2);
      w.translate(tx + rx, 8.42, e * 0.1);
      steel.push(w);
    }
    gBox(steel, 0.16, 0.12, 0.12, tx * 1.2, 0.02, 0, 1);
  }
  const L = {
    e, Zl, grp, closedX, openX, x: startX, target: startX, v: 0, dir: 0, cols: [], wicket: null,
    meshes: [gMesh(grp, M.hgSheetG, sheet), gMesh(grp, M.hgRib, rib), gMesh(grp, M.steel, steel), gMesh(grp, M.hgHazard, haz, false), gMesh(grp, M.dark, dark, false)]
  };
  // калитка: на петлях, открывается наружу
  if (wx !== null) {
    const piv = new THREEH.Group();
    piv.position.set(wx - ww, 0.12, 0);
    grp.add(piv);
    const ws = [], wr = [], wd = [];
    gBox(ws, 2 * ww - 0.04, wh - 0.16, 0.04, ww, (wh - 0.16) / 2, 0);
    for (const s of [-1, 1]) {
      gBox(wr, 2 * ww, 0.08, 0.06, ww, 0.04 + 0.0, s * 0.04, 1);
      gBox(wr, 2 * ww, 0.08, 0.06, ww, wh - 0.2, s * 0.04, 1);
      gBox(wr, 0.07, wh - 0.16, 0.06, 0.035, (wh - 0.16) / 2, s * 0.04, 1);
      gBox(wr, 0.07, wh - 0.16, 0.06, 2 * ww - 0.035, (wh - 0.16) / 2, s * 0.04, 1);
      gBox(wd, 0.14, 0.03, 0.05, 2 * ww - 0.16, 0.98, s * 0.07, 1);
    }
    gMesh(piv, M.hgSheetG, ws);
    gMesh(piv, M.hgRib, wr);
    gMesh(piv, M.dark, wd, false);
    L.wicket = { piv, lx: wx, ang: 0, target: 0, open: -e * 1.45, col: null };
  }
  // коллайдеры в осях створки: { lx, ly, hw, hh }
  const parts = wx === null ? [[0, 3.95, 4, 3.95]] : [[(-4 + wx - ww) / 2, 3.95, (wx - ww + 4) / 2, 3.95], [(4 + wx + ww) / 2, 3.95, (4 - wx - ww) / 2, 3.95], [wx, (wh + 7.9) / 2, ww, (7.9 - wh) / 2]];
  if (wx !== null) parts.push([wx, wh / 2, ww, wh / 2, true]);
  const lo = Math.min(closedX, openX), hi = Math.max(closedX, openX), c = Math.cos(HG.rot), s = Math.sin(HG.rot);
  for (const [lx, ly, hw, hh, isW] of parts) {
    const [cx, cz] = hgW(startX + lx, Zl);
    const pts = [hgW(lo + lx - hw, Zl), hgW(hi + lx + hw, Zl)];
    const col = insert({ t: 1, x: cx, z: cz, y0: HG.fy + ly - hh, y1: HG.fy + ly + hh, hw, hd: 0.12, c, s, walk: false, metal: true }, Math.min(pts[0][0], pts[1][0]) - 0.4, Math.min(pts[0][1], pts[1][1]) - 0.4, Math.max(pts[0][0], pts[1][0]) + 0.4, Math.max(pts[0][1], pts[1][1]) + 0.4);
    col.glx = lx;
    if (isW) L.wicket.col = col;
    else L.cols.push(col);
  }
  HGATE.leaves.push(L);
  return L;
}
function hgGates(R) {
  const GH = 8;
  noPanel();
  for (const e of [-1, 1]) {
    const Zr = e * (HG.L + 0.34);
    hgBox(M.steel, 0, GH + 0.52, Zr, 32.4, 0.03, 0.16, { tile: 1 });
    hgBox(M.steel, 0, GH + 0.43, Zr, 32.4, 0.16, 0.025, { tile: 1 });
    hgBox(M.steel, 0, GH + 0.34, Zr, 32.4, 0.03, 0.16, { tile: 1, cast: false });
    for (const x of [-14.6, -10.4, -6, -2, 2, 6, 10.4, 14.6]) hgBox(M.steel, x, GH + 0.47, e * (HG.L + 0.2), 0.12, 0.26, 0.3, { tile: 1 });
    for (const sx of [-1, 1]) {
      hgBox(M.hgRib, sx * 16.15, (GH + 0.6) / 2, Zr, 0.18, GH + 0.6, 0.18, { tile: 1 });
      hgBeam(M.hgRib, [sx * 16.1, GH - 1.2, Zr], [sx * 15.05, GH - 2.6, e * (HG.L + 0.06)], 0.05, { seg: 5 });
      hgCol(sx * 16.15, (GH + 0.6) / 2, Zr, 0.2, GH + 0.6, 0.2, { walk: false });
      hgBox(M.dark, sx * 16.0, GH + 0.43, Zr, 0.14, 0.22, 0.2, { tile: 1 });
    }
    hgBox(M.steel, 0, 0.015, e * (HG.L + 0.36), 32.2, 0.05, 0.16, { tile: 1, cast: false });
  }
  // север: открытая створка справа, левая с калиткой закрыта; юг: левая прикрыта не до конца
  hgGateLeaf(1, 4, 12, 12);
  hgGateLeaf(1, -4, -12, -4, { wicket: true });
  hgGateLeaf(-1, -4, -12, -10.5);
  // правая южная створка сошла с рельса и висит, упёршись низом в отмостку — статичная, разрушаемая
  {
    const e = -1, Z = e * (HG.L + 0.36), cx = 4, tilt = 0.09;
    const [x, z] = hgW(cx, Z);
    beginStruct({ kind: "gate", name: "створка ворот", x, z, rot: HG.rot, w: 8, d: 0.2, h: 8, fy: HG.fy, fuel: 0.05, quiet: true });
    const pn = panel("sheet", { hp: 3, mode: "rigid", density: 220, float: 0, burnable: false, mat: M.hgSheet });
    pn.metal = true;
    pn.big = true;
    const dz = e * tilt * 3.2;
    hgBox(M.hgSheetG, cx, 3.95, Z + dz * 0.5, 7.9, 7.7, 0.05, { tile: 1.5, rx: e * tilt });
    for (const yy of [0.15, 3.95, 7.75]) hgBox(M.hgRib, cx, yy, Z + e * 0.05 + dz * (yy / 7.9), 8, 0.14, 0.1, { tile: 1, rx: e * tilt });
    for (const s of [-1, 1]) hgBox(M.hgRib, cx + s * 3.95, 3.95, Z + e * 0.05 + dz * 0.5, 0.12, 7.9, 0.1, { tile: 1, rx: e * tilt });
    hgBeam(M.hgRib, [cx - 3.9, 0.2, Z + e * 0.06], [cx + 3.9, 7.7, Z + e * 0.06 + dz], 0.045, { seg: 5 });
    hgCol(cx, 3.95, Z + dz * 0.5, 8, 7.9, 0.2, { walk: false });
    endStruct();
  }
  hgBreaker();
}
function hgBreaker() {
  const lx = -10.6, lz = HG.L - 0.22, y = 1.45;
  hgBox(M.hgRib, lx, y, lz, 0.5, 0.72, 0.2, { tile: 1 });
  hgBox(M.dark, lx, y + 0.42, lz + 0.02, 0.56, 0.06, 0.26, { tile: 1, cast: false });
  hgBeam(M.dark, [lx + 0.18, y + 0.36, lz], [lx + 0.18, HG.HA - 4, lz], 0.025, { seg: 5, cast: false });
  const tex = hgTextTex(128, 64, "#d9c22a", (x) => {
    x.fillStyle = "#111";
    x.beginPath();
    x.moveTo(64, 4);
    x.lineTo(118, 60);
    x.lineTo(10, 60);
    x.closePath();
    x.fill();
    x.fillStyle = "#d9c22a";
    x.beginPath();
    x.moveTo(70, 18);
    x.lineTo(52, 42);
    x.lineTo(64, 42);
    x.lineTo(56, 58);
    x.lineTo(76, 34);
    x.lineTo(64, 34);
    x.closePath();
    x.fill();
  });
  const sm = new THREEH.MeshStandardMaterial({ map: tex, roughness: 0.7 });
  hgPut(sm, new THREEH.PlaneGeometry(0.22, 0.11), lx, y + 0.22, lz - 0.105, { rot: HG.rot + Math.PI, cast: false });
  const piv = new THREEH.Group(), p = hgP(lx + 0.27, y, lz - 0.02);
  piv.position.copy(p);
  piv.rotation.set(0, HG.rot, 0, "YXZ");
  scene.add(piv);
  const arm = [], knob = [];
  gBox(arm, 0.03, 0.34, 0.03, 0.04, 0.16, -0.05, 1);
  gBox(arm, 0.05, 0.05, 0.05, 0.04, 0, 0, 1);
  gBox(knob, 0.07, 0.07, 0.14, 0.04, 0.33, -0.09, 1);
  gMesh(piv, M.steel, arm, false);
  gMesh(piv, M.hazard ?? M.hgHazard, knob, false);
  HGATE.sw = { piv, pos: p.clone(), ang: 0 };
  piv.rotation.x = 0;
}
var EXTRA = { pigeons: null, tanks: [], pools: null, queue: [], chims: [], stats: { culled: 0, scares: 0, booms: 0, leaks: 0 }, t: 0 };
var VCHIM = [];
function pigeonGeo() {
  const parts = [], colOf = [];
  const add = (g, col, wing = 0) => {
    g = g.index ? g.toNonIndexed() : g;
    g.deleteAttribute("uv");
    const n = g.attributes.position.count, c = new Float32Array(n * 3), w = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const y = g.attributes.position.getY(i), x = g.attributes.position.getX(i), z = g.attributes.position.getZ(i);
      const k = typeof col === "function" ? col(x, y, z) : col;
      c.set(k, i * 3);
      w[i] = wing ? Math.min(1, Math.abs(x) / 0.3) : 0;
    }
    g.setAttribute("color", new THREEH.BufferAttribute(c, 3));
    g.setAttribute("aW", new THREEH.BufferAttribute(w, 1));
    parts.push(g);
  };
  const body = new THREEH.SphereGeometry(1, 8, 6);
  body.scale(0.07, 0.068, 0.15);
  add(body, (x, y, z) => z > 0.05 ? [0.3, 0.36, 0.36] : y < -0.02 ? [0.52, 0.53, 0.57] : [0.44, 0.46, 0.52]);
  const head = new THREEH.SphereGeometry(0.042, 7, 5);
  head.translate(0, 0.065, 0.13);
  add(head, [0.33, 0.35, 0.4]);
  const beak = new THREEH.ConeGeometry(0.01, 0.03, 4);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.06, 0.18);
  add(beak, [0.2, 0.18, 0.17]);
  const tail = new THREEH.BoxGeometry(0.08, 0.012, 0.11);
  tail.translate(0, 0.005, -0.19);
  add(tail, [0.22, 0.23, 0.26]);
  for (const s of [-1, 1]) {
    const w = new THREEH.BufferGeometry();
    const P = [[0.035, 0, 0.06], [0.3, 0.01, 0.0], [0.27, 0.01, -0.08], [0.035, 0, -0.07]].map(([x, y, z]) => [x * s, y + 0.035, z]);
    const v = [...P[0], ...P[1], ...P[2], ...P[0], ...P[2], ...P[3]];
    w.setAttribute("position", new THREEH.Float32BufferAttribute(v, 3));
    w.computeVertexNormals();
    add(w, (x, y, z) => z < -0.04 && Math.abs(x) > 0.12 ? [0.18, 0.19, 0.22] : Math.abs(x) > 0.1 && z < 0 ? [0.6, 0.62, 0.66] : [0.5, 0.52, 0.57], 1);
  }
  const g = BGU.mergeGeometries(parts, false);
  g.computeBoundingSphere();
  return g;
}
function buildPigeons() {
  const N = Q.tex < 0.6 ? 6 : 11, Y = 8.4;
  const perches = [];
  for (let i = 0; i < 4; i++) perches.push([-7.5 + i * 4.6 + sr(-0.6, 0.6), Y + 0.6 + 0.375, -9.5 + (i % 2 ? 0.19 : -0.19)]);
  for (let i = 0; perches.length < N; i++) {
    const sx = i % 2 ? 1 : -1;
    perches.push([sx * 13.48, Y + 0.225, -HG.L + 4 + (i >> 1) * 6.3 + sr(-1, 1)]);
  }
  const geo = pigeonGeo(), fl = new Float32Array(N * 3);
  geo.setAttribute("aFl", new THREEH.InstancedBufferAttribute(fl, 3));
  const mat = new THREEH.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREEH.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aW; attribute vec3 aFl;").replace("#include <begin_vertex>", `#include <begin_vertex>
      { float fold = aFl.z, fa = sin(aFl.x) * aFl.y;
        transformed.y += aW * fa * 0.2 - aW * abs(fa) * 0.04;
        transformed.x *= mix(1.0, 0.24, fold * step(0.001, aW)) * (1.0 - 0.18 * abs(fa) * aW);
        transformed.z -= fold * aW * 0.08; }`);
  };
  mat.customProgramCacheKey = () => "pigeon1";
  const im = new THREEH.InstancedMesh(geo, mat, N);
  im.castShadow = false;
  im.receiveShadow = true;
  im.frustumCulled = false;
  im.name = "pigeons";
  // v21: голубей нет (птицы убраны по запросу) — меш не добавляется в сцену
  im.visible = false;
  const birds = perches.map((p, i) => {
    const w = hgP(p[0], p[1], p[2]);
    return { perch: w, lp: p, pos: w.clone(), v: new THREEH.Vector3(), st: 0, t: sr(0, 9), ph: srnd() * TAU, yaw: HG.rot + (p[0] > 0 ? -Math.PI / 2 : Math.PI / 2) + sr(-0.4, 0.4), fly: 0, orbit: srnd() < 0.5 ? 1 : -1, bob: 0, i };
  });
  EXTRA.pigeons = { im, birds, fl, nextCoo: 6, calm: 0, m: new THREEH.Matrix4(), q: new THREEH.Quaternion(), e: new THREEH.Euler(0, 0, 0, "YXZ"), s: new THREEH.Vector3(1, 1, 1) };
  pigeonSync(0);
  // помёт под насестами: белёсые кляксы на бетоне
  const mDrop = new THREEH.MeshStandardMaterial({ color: 0xcfcbbd, roughness: 0.95, map: dropTex(), alphaTest: 0.5, transparent: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const p of perches) for (let k = 0; k < 3; k++) {
    const g = new THREEH.PlaneGeometry(0.35, 0.35);
    g.rotateX(-Math.PI / 2);
    const lx = p[0] + sr(-0.6, 0.6) * (Math.abs(p[0]) > 13 ? 0.4 : 1) - Math.sign(p[0]) * (Math.abs(p[0]) > 13 ? 0.35 : 0), lz = p[2] + sr(-0.5, 0.5);
    const w = hgP(lx, 0.012 + k * 1e-3, lz);
    place(mDrop, g, w.x, w.y, w.z, srnd() * TAU, sr(0.6, 1.4));
  }
}
function dropTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  x.fillStyle = "rgba(0,0,0,0)";
  x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 9; i++) {
    x.fillStyle = i < 2 ? "#6b6a62" : "#e7e4d8";
    x.beginPath();
    x.arc(32 + sr(-14, 14), 32 + sr(-14, 14), sr(2, 7), 0, TAU);
    x.fill();
  }
  const t = new THREEH.CanvasTexture(c);
  t.colorSpace = THREEH.SRGBColorSpace;
  return t;
}
function pigeonSync(flying) {
  const P = EXTRA.pigeons;
  for (const b of P.birds) {
    P.e.set(b.st ? -clamp(b.v.y * 0.12, -0.5, 0.5) : b.bob, b.yaw, 0);
    P.q.setFromEuler(P.e);
    P.m.compose(b.pos, P.q, P.s);
    P.im.setMatrixAt(b.i, P.m);
    // планирование: иногда крылья замирают раскрытыми
    const glide = b.st === 1 && Math.sin(b.t * 1.3 + b.i) > 0.75;
    P.fl[b.i * 3] = b.ph;
    P.fl[b.i * 3 + 1] = b.st ? glide ? 0.08 : 1 : 0;
    P.fl[b.i * 3 + 2] = b.st ? 0 : 1;
  }
  P.im.instanceMatrix.needsUpdate = true;
  P.im.geometry.attributes.aFl.needsUpdate = true;
}
function fuelTankReg(S, x, y, z, r, kind, col) {
  const T = { S, x, y, z, r, kind, col, hp: kind === "v" ? 9 : 6, fuel: true, leaks: 0, pool: null, burn: 0, burnT: 0, boomAt: 0, gone: false, i: EXTRA.tanks.length };
  if (col) col.leak = T;
  EXTRA.tanks.push(T);
  return T;
}
function buildVillageProps() {
  const R2 = rng(7373), V = (x, y, z) => new THREEH.Vector3(x, y, z);
  let ant = 0, scare = 0;
  for (const Y of VILLAGE.yards || []) {
    const H = Y.house;
    if (!H || H.kind === "burnt" || !H.w) continue;
    const c = Math.cos(H.rot), s = Math.sin(H.rot), P = (lx, lz) => [H.x + c * lx + s * lz, H.z - s * lx + c * lz];
    if (!Y.abandoned && ant < 6 && R2() < 0.8) {
      ant++;
      const side = R2() < 0.5 ? -1 : 1, [x, z] = P(side * (H.w / 2 + 0.45), R2.range(-0.3, 0.3) * H.d), g = hFast(x, z) - 0.3;
      const top = g + 8.6 + R2.range(-0.6, 0.8), lean = R2.range(-0.12, 0.12);
      const tx = x + Math.cos(H.rot) * lean, tz = z - Math.sin(H.rot) * lean;
      beam(M.deadwood, V(x, g, z), V(tx, top, tz), 0.065, { seg: 6 });
      addCircle(x, z, 0.09, g, top);
      // «ёлочка» на метровой траверсе: директор, вибратор, рефлектор — смотрит на далёкий ретранслятор
      const ay = R2.range(0, TAU), ux = Math.cos(ay), uz = Math.sin(ay);
      beam(M.steel, V(tx - ux * 0.6, top - 0.15, tz - uz * 0.6), V(tx + ux * 0.6, top - 0.15, tz + uz * 0.6), 0.012, { seg: 4, cast: false });
      for (let k = 0; k < 5; k++) {
        const t = -0.55 + k * 0.27, hl = 0.48 - k * 0.05, px = tx + ux * t, pz = tz + uz * t;
        beam(M.steel, V(px + uz * hl, top - 0.15, pz - ux * hl), V(px - uz * hl, top - 0.15, pz + ux * hl), 0.006, { seg: 3, cast: false });
      }
      beam(M.dark, V(tx, top - 0.2, tz), V(x + Math.cos(H.rot) * side * -0.6, g + 2.6, z - Math.sin(H.rot) * side * -0.6), 0.004, { seg: 3, cast: false });
    }
    if (scare < 3 && Y.beds && Y.beds.length > 1 && R2() < 0.45) {
      scare++;
      const bd = Y.beds[1], [x, z] = Y.F.p(bd.s + R2.range(-1, 1), bd.f + 0.7), g = hFast(x, z), r = R2.range(0, TAU), cx = Math.cos(r), cz = Math.sin(r);
      beam(M.deadwood, V(x, g - 0.3, z), V(x, g + 1.75, z), 0.035, { seg: 5 });
      beam(M.deadwood, V(x - cx * 0.65, g + 1.42, z - cz * 0.65), V(x + cx * 0.65, g + 1.38, z + cz * 0.65), 0.025, { seg: 4 });
      box(M.sack, x, g + 1.2, z, 0.5, 0.62, 0.16, { rot: -r + Math.PI / 2, tile: 1 });
      const hd = new THREEH.SphereGeometry(0.16, 8, 6);
      place(M.sack, hd, x, g + 1.78, z, 0);
      const hat = new THREEH.CylinderGeometry(0.2, 0.22, 0.04, 10);
      place(M.dark, hat, x, g + 1.9, z, 0);
      const crown = new THREEH.CylinderGeometry(0.11, 0.13, 0.13, 8);
      place(M.dark, crown, x, g + 1.98, z, 0);
      addCircle(x, z, 0.12, g, g + 1.9);
    }
  }
  EXTRA.props = { ant, scare };
}
function buildExtraStatic() {
  buildPigeons();
  buildVillageProps();
}
for(const s of Object.values(SPAWNS)){const l=Math.hypot(s.x,s.z);s.fx=-s.x/l;s.fz=-s.z/l;s.yaw=Math.atan2(-s.fx,-s.fz);s.r=14;}
await ctx.stage('buildMaterials');buildMaterials();globalThis.GImpactSurfaces?.tagTable(M);
await ctx.stage('villageMats');villageMats();
await ctx.stage('planCompound');planCompound();
await ctx.stage('planBuildings');planBuildings();
await ctx.stage('planMilitary');planMilitary();
await ctx.stage('planCraters');planCraters();
await ctx.stage('planProps');planProps();
await ctx.stage('planLamps');planLamps();
await ctx.stage('planLandmarks');planLandmarks();
await ctx.stage('planMG');planMG();
await ctx.stage('planWrecks');planWrecks();
await ctx.stage('v22Plan');v22Plan();
await ctx.stage('buildHeightCache');buildHeightCache();
await ctx.stage('buildTerrain');buildTerrain();
await ctx.stage('buildForest');buildForest();
await ctx.stage('buildUndergrowth');buildUndergrowth();
await ctx.stage('buildGrass');buildGrass();
await ctx.stage('buildCompound');buildCompound();
await ctx.stage('buildBuildings');buildBuildings();
await ctx.stage('buildMilitary');buildMilitary();
await ctx.stage('buildLandmarks');buildLandmarks();
await ctx.stage('buildField');buildField();
await ctx.stage('buildWrecks');buildWrecks();
await ctx.stage('v22Build');v22Build();
await ctx.stage('buildProps');buildProps();
await ctx.stage('buildCrates');buildCrates();
await ctx.stage('buildBases');buildBases();
await ctx.stage('buildExtraStatic');buildExtraStatic();
await ctx.stage('buildBigFlag');buildBigFlag();
await ctx.stage('buildGlass');buildGlass();
await ctx.stage('buildMG');buildMG();
await ctx.stage('buildLamps');buildLamps();
await ctx.stage('finishLamps');finishLamps();
await ctx.stage('flushStatic');flushStatic();

function __addBody(o) {
  o = o || {};
  var mesh = o.mesh || null, sz = o.size || [0.1, 0.1, 0.1];
  var rec = { body: __deepNoop, shape: null, children: [], idx: -1, ms: null, mesh: mesh, sync: o.sync || null, life: o.life ?? 8, age: 0, keep: !!o.keep, onDone: o.onDone || null, pos: o.pos ? o.pos.clone() : new THREE.Vector3(), quat: o.quat ? o.quat.clone() : new THREE.Quaternion(), dead: false };
  if (!mesh) return rec;
  if (o.pos) mesh.position.copy(o.pos);
  if (o.quat) mesh.quaternion.copy(o.quat);
  if (!mesh.parent) scene.add(mesh);
  if (o.keep) return rec;
  var he = [Math.max(0.02, (sz[0] || 0.1) * 0.5), Math.max(0.02, (sz[1] || 0.1) * 0.5), Math.max(0.02, (sz[2] || sz[0] || 0.1) * 0.5)];
  rec.deb = ldebAdd(mesh, { he: he, vel: o.vel ? o.vel.clone() : new THREE.Vector3(), ang: o.ang ? o.ang.clone() : new THREE.Vector3(), life: Math.min(o.life ?? 20, 20), bounce: 0.25, cast: false, dispose: false });
  return rec;
}
var __BC = { mg: { board: 1, panel: 0.2, pole: 0.2, tree: 1, sheet: 0.35 }, rifle: { board: 0.25, panel: 0.05, pole: 0, tree: 0.12, sheet: 0.12 } };
var __bv = new THREE.Vector3(), __bv2 = new THREE.Vector3();
function __hitPane(p, dir) {
  for (var i = 0; i < PANES.length; i++) {
    var pa = PANES[i];
    if (!pa.alive) continue;
    var R = Math.max(pa.w, pa.h);
    if (Math.abs(p.x - pa.pos.x) > R || Math.abs(p.z - pa.pos.z) > R || Math.abs(p.y - pa.pos.y) > R) continue;
    __bv.copy(p).sub(pa.pos);
    if (Math.abs(__bv.dot(pa.normal)) > 0.14) continue;
    var u = __bv2.set(1, 0, 0).applyQuaternion(pa.q), v = new THREE.Vector3(0, 1, 0).applyQuaternion(pa.q);
    if (Math.abs(__bv.dot(u)) > pa.w / 2 + 0.05 || Math.abs(__bv.dot(v)) > pa.h / 2 + 0.05) continue;
    breakPane(pa, dir.clone(), 2);
    return true;
  }
  return false;
}
function __bullet(p, dir, power) {
  var kind = power >= 2 ? "mg" : "rifle", C3 = __BC[kind];
  if (__hitPane(p, dir)) return { stop: false, cost: 0.05, surf: "glass" };
  var trees = treesNear(p.x, p.z, 2.2), bt = null, bd = 1e9;
  for (var i = 0; i < trees.length; i++) {
    var t = trees[i];
    if (t.broken || p.y < t.y - 0.2 || p.y > t.y + t.h) continue;
    var d = Math.hypot(t.x - p.x, t.z - p.z) - t.r;
    if (d < 0.16 && d < bd) { bd = d; bt = t; }
  }
  var best = null, bpd = 0.14;
  for (var s of structAt(p.x, p.z, 2)) {
    if (!s.panels) continue;
    for (var pk of s.panels) {
      if (pk.dead || !pk.box) continue;
      var pd = pk.box.distanceToPoint(p);
      if (pd < bpd) { bpd = pd; best = pk; }
    }
  }
  if (best && (!bt || bpd < bd)) {
    var pk = best, from = p.clone().addScaledVector(dir, -1);
    if (pk.boards) {
      var bdd = boardAt(pk, p);
      if (!bdd) return { stop: false, cost: 0, surf: "wood" };
      bdd.hp -= C3.board * (0.8 + Math.random() * 0.4);
      if (bdd.hp <= 0) knockBoard(pk, bdd, dir, kind === "mg" ? 5 : 2.5);
      if (!pk.dead) {
        pk.hp -= C3.panel;
        if (pk.hp <= 0 || pk.boardsLeft / pk.boards.length < 0.4) kill(pk, from, kind === "mg" ? 4 : 2, 0);
      }
    } else if (pk.armor === "pole") {
      if (C3.pole > 0) { pk.hp -= C3.pole; pk.hitY = p.y; if (pk.hp <= 0.001) kill(pk, from, 3, 0); }
    } else hitPanel(pk, p, dir.clone(), pk.kind === "wall" ? C3.panel : C3.sheet);
    return { stop: false, cost: 0.3, surf: "wood" };
  }
  if (bt) {
    bt.chop = (bt.chop || 0) + C3.tree;
    if (bt.chop >= 2 + bt.r * 18) breakTree(bt, new THREE.Vector3(dir.x, 0, dir.z).normalize(), 1.2);
    return { stop: true, cost: 1, surf: "wood" };
  }
  return null;
}
function __extra() {
  return {
    hooks: __HK,
    ladders: LADDERS,
    mg: MG,
    mgFarSet: mgFarSet,
    crates: CRATES.map(function (c, i) { return { id: "depot" + i, kind: "ammo", name: c.name, x: c.x, y: hFast(c.x, c.z), z: c.z, r: 4.6 * (c.s || 1) }; }),
    bulletHit: function (p, dir, power) { return __bullet(p, dir, power || 1); },
    explode: function (p, o) { o = o || {}; var size = Math.min(3, Math.max(0.3, (o.power || 1) * (o.radius || 6) / 6)); onBlast(p.x, hFast(p.x, p.z), p.z, size, false, {}); },
    indoor: function () { return false; },
    dest: { structs: STRUCTS, panes: PANES, queue: QUEUE, trees: TREES },
  };
}
function __stepGameplay(dt) { updateStructs(dt); updateDestruction(dt); }

globalThis.GImpactSurfaces?.tagTable(M);
const bases={alpha:{x:SPAWNS.A.x,z:SPAWNS.A.z},delta:{x:SPAWNS.D.x,z:SPAWNS.D.z}}; GRASS.center.set(1e9,1e9);refreshGrass(true);updateForestLOD(true);return {...__extra(), native:COLLIDERS,heightAt:hFast,bounds:{x0:-MAP.PLAY,x1:MAP.PLAY,z0:-MAP.PLAY,z1:MAP.PLAY},bases,waterY:MAP.WATER_Y,preRender:(cam,sun,shR)=>{try{cullForest(cam,sun,shR);}catch(e){console.warn("cull",e&&e.message);CULL.on=false;}},cull:CULL,update:(dt,t)=>{FRAME.t=t;FRAME.dt=dt;FRAME.n++;FXU.uFxT.value=t;if(typeof LAKE!=='undefined'&&LAKE.mat){LAKE.mat.uniforms.uTime.value=t;LAKE.mat.uniforms.uFxT.value=t;};updateWind(t);try{stepCloth(dt,t);}catch(e){};__stepGameplay(dt);if(FRAME.n%20===0){updateForestLOD(false);refreshGrass();}}};
};
