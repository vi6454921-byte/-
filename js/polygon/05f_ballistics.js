/* Shared point-mass model. BC variants and barrier strength are game approximations.
   Pure module: node stand and both game/armory use the same solver. */
(function (root, f) {
  const B = f();
  if (typeof module === "object" && module.exports) module.exports = B;
  else root.GBallistics = B;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const G1 = [
      [0, 0.2629],
      [0.05, 0.2558],
      [0.1, 0.2487],
      [0.15, 0.2413],
      [0.2, 0.2344],
      [0.25, 0.2278],
      [0.3, 0.2214],
      [0.35, 0.2155],
      [0.4, 0.2104],
      [0.45, 0.2061],
      [0.5, 0.2032],
      [0.55, 0.202],
      [0.6, 0.2034],
      [0.7, 0.2165],
      [0.725, 0.223],
      [0.75, 0.2313],
      [0.775, 0.2417],
      [0.8, 0.2546],
      [0.825, 0.2706],
      [0.85, 0.2901],
      [0.875, 0.3136],
      [0.9, 0.3415],
      [0.925, 0.3734],
      [0.95, 0.4084],
      [0.975, 0.4448],
      [1, 0.4805],
      [1.025, 0.5136],
      [1.05, 0.5427],
      [1.075, 0.5677],
      [1.1, 0.5883],
      [1.125, 0.6053],
      [1.15, 0.6191],
      [1.2, 0.6393],
      [1.25, 0.6518],
      [1.3, 0.6589],
      [1.35, 0.6621],
      [1.4, 0.6625],
      [1.45, 0.6607],
      [1.5, 0.6573],
      [1.55, 0.6528],
      [1.6, 0.6474],
      [1.65, 0.6413],
      [1.7, 0.6347],
      [1.75, 0.628],
      [1.8, 0.621],
      [1.85, 0.6141],
      [1.9, 0.6072],
      [1.95, 0.6003],
      [2, 0.5934],
      [2.05, 0.5867],
      [2.1, 0.5804],
      [2.15, 0.5743],
      [2.2, 0.5685],
      [2.25, 0.563],
      [2.3, 0.5577],
      [2.35, 0.5527],
      [2.4, 0.5481],
      [2.45, 0.5438],
      [2.5, 0.5397],
      [2.6, 0.5325],
      [2.7, 0.5264],
      [2.8, 0.5211],
      [2.9, 0.5168],
      [3, 0.5133],
      [3.2, 0.5077],
      [3.4, 0.5041],
      [3.6, 0.5019],
      [4, 0.4993],
    ],
    G7 = [
      [0.0, 0.1198],
      [0.05, 0.1197],
      [0.1, 0.1196],
      [0.15, 0.1194],
      [0.2, 0.1193],
      [0.25, 0.1194],
      [0.3, 0.1194],
      [0.35, 0.1194],
      [0.4, 0.1193],
      [0.45, 0.1193],
      [0.5, 0.1194],
      [0.55, 0.1193],
      [0.6, 0.1194],
      [0.65, 0.1197],
      [0.7, 0.1202],
      [0.725, 0.1207],
      [0.75, 0.1215],
      [0.775, 0.1226],
      [0.8, 0.1242],
      [0.825, 0.1266],
      [0.85, 0.1306],
      [0.875, 0.1368],
      [0.9, 0.1464],
      [0.925, 0.166],
      [0.95, 0.2054],
      [0.975, 0.2993],
      [1.0, 0.3803],
      [1.025, 0.4015],
      [1.05, 0.4043],
      [1.075, 0.4034],
      [1.1, 0.4014],
      [1.125, 0.3987],
      [1.15, 0.3955],
      [1.2, 0.3884],
      [1.25, 0.381],
      [1.3, 0.3732],
      [1.35, 0.3657],
      [1.4, 0.358],
      [1.5, 0.344],
      [1.55, 0.3376],
      [1.6, 0.3315],
      [1.65, 0.326],
      [1.7, 0.3209],
      [1.75, 0.316],
      [1.8, 0.3117],
      [1.85, 0.3078],
      [1.9, 0.3042],
      [1.95, 0.301],
      [2.0, 0.298],
      [2.05, 0.2951],
      [2.1, 0.2922],
      [2.15, 0.2892],
      [2.2, 0.2864],
      [2.25, 0.2835],
      [2.3, 0.2807],
      [2.35, 0.2779],
      [2.4, 0.2752],
      [2.45, 0.2725],
      [2.5, 0.2697],
      [2.55, 0.267],
      [2.6, 0.2643],
      [2.65, 0.2615],
      [2.7, 0.2588],
      [2.75, 0.2561],
      [2.8, 0.2533],
      [2.85, 0.2506],
      [2.9, 0.2479],
      [2.95, 0.2451],
      [3.0, 0.2424],
      [3.1, 0.2368],
      [3.2, 0.2313],
      [3.3, 0.2258],
      [3.4, 0.2205],
      [3.5, 0.2154],
      [3.6, 0.2106],
      [3.7, 0.206],
      [3.8, 0.2017],
      [3.9, 0.1975],
      [4.0, 0.1935],
      [4.2, 0.1861],
      [4.4, 0.1793],
      [4.6, 0.173],
      [4.8, 0.1672],
      [5.0, 0.1618],
    ],
    SPHERE = [
      [0, 0.47],
      [0.5, 0.47],
      [0.6, 0.49],
      [0.7, 0.53],
      [0.8, 0.6],
      [0.9, 0.72],
      [1, 0.86],
      [1.1, 0.94],
      [1.2, 0.97],
      [1.5, 0.98],
      [2, 0.96],
      [3, 0.94],
    ];
  const AIR = { rho: 1.225, sound: 340.3, g: 9.80665 };
  const BASE = {
    556: { name: "M855", mass: 4, g7: 0.151, bc: 0.304, d: 5.7, twist: 178 },
    545: { name: "7N6", mass: 3.42, g7: 0.168, bc: 0.336, d: 5.6, twist: 255 },
    "762x39": {
      name: "57N231",
      mass: 7.9,
      g7: 0.14,
      bc: 0.275,
      d: 7.9,
      twist: 240,
    },
    "762x51": {
      name: "M80",
      mass: 9.5,
      g7: 0.2,
      bc: 0.393,
      d: 7.82,
      twist: 305,
    },
    "762x54R": {
      name: "7N1",
      mass: 9.8,
      g7: 0.21,
      bc: 0.42,
      d: 7.92,
      twist: 320,
    },
    /* v21: .50 BMG для M2HB — M33 Ball 42 г, G1 0,67 (G7 ≈0,33), калибр 12,98 мм, шаг 381 мм */
    "127x99": { name: "M33", mass: 42, g7: 0.33, bc: 0.67, d: 12.98, twist: 381 },
    "45acp": { name: "45FMJ", mass: 14.9, bc: 0.195, d: 11.43, twist: 406 },
    "9x19": { name: "57N181S", mass: 8, bc: 0.145, d: 9.01, twist: 250 },
    "12ga": { name: "buck00", mass: 3.48, d: 8.38, sphere: true },
  };
  const VAR = {
    "45FMJ": { mass: 14.9, bc: 0.195, d: 11.43 },
    "45JHP": { mass: 14.9, bc: 0.16, d: 11.43 },
    "7N10": { mass: 3.6, g7: 0.17 },
    "7N24": { mass: 4.1, g7: 0.18 },
    "7N23": { mass: 7.9, g7: 0.14 },
    "57N231U": { mass: 12.5, g7: 0, bc: 0.36 },
    M855A1: { mass: 4, g7: 0.152 },
    M995: { mass: 3.4, g7: 0.145 },
    M80A1: { mass: 8.4, g7: 0.19 },
    M993: { mass: 8.2, g7: 0.19 },
    "57N323S": { mass: 9.6, g7: 0.2 },
    "7N14": { mass: 9.8, g7: 0.21 },
    "7N21": { mass: 5.4, bc: 0.12 },
    JHP: { mass: 8, bc: 0.14 },
    shot4: { mass: 1.34, d: 6.1, sphere: true },
    slug: { mass: 31.5, d: 18.5, g7: 0, bc: 0.078, sphere: false, twist: 0 },
  };
  const specs = new Map();
  function spec(cal, id) {
    const k = cal + "|" + id;
    if (!specs.has(k))
      specs.set(
        k,
        Object.freeze({
          ...(BASE[cal] || BASE["556"]),
          ...VAR[id],
          name: id || BASE[cal]?.name || "M855",
          tracer: ["545", "762x39", "762x54R"].includes(cal)
            ? 6750070
            : 16725558,
        }),
      );
    return specs.get(k);
  }
  function lookup(T, m) {
    let a = 0,
      b = T.length - 1;
    if (m <= T[0][0]) return T[0][1];
    if (m >= T[b][0]) return T[b][1];
    while (b - a > 1) {
      const c = (a + b) >> 1;
      if (T[c][0] > m) b = c;
      else a = c;
    }
    return (
      T[a][1] + ((T[b][1] - T[a][1]) * (m - T[a][0])) / (T[b][0] - T[a][0])
    );
  }
  function atmosphere(temp = 15, pressure = 101325) {
    const K = Math.max(200, temp + 273.15);
    return {
      rho: pressure / (287.05 * K),
      sound: Math.sqrt(1.4 * 287.05 * K),
      g: AIR.g,
    };
  }
  function dragK(s, m, air = AIR) {
    if (s.sphere)
      return (
        (air.rho * lookup(SPHERE, m) * Math.PI * (s.d / 2000) ** 2) /
        ((2 * s.mass) / 1000)
      );
    return (
      (Math.PI * air.rho * lookup(s.g7 ? G7 : G1, m)) /
      (8 * (s.g7 || s.bc) * 703.0696)
    );
  }
  function spin(s, t) {
    return s.twist ? 1.25 * 2.9 * Math.pow(t, 1.83) * 0.0254 : 0;
  }
  function advance(p, v, s, dt, w = { x: 0, y: 0, z: 0 }, air = AIR, mul = 1) {
    const x = v.x - w.x,
      y = v.y - (w.y || 0),
      z = v.z - w.z,
      V = Math.hypot(x, y, z),
      k = dragK(s, V / air.sound, air) * V * mul;
    // midpoint velocity: consistent 0.5 ms solver and 2 ms collision integration
    const ax = -k * x,
      ay = -k * y - air.g,
      az = -k * z;
    p.x += (v.x + ax * dt * 0.5) * dt;
    p.y += (v.y + ay * dt * 0.5) * dt;
    p.z += (v.z + az * dt * 0.5) * dt;
    v.x += ax * dt;
    v.y += ay * dt;
    v.z += az * dt;
  }
  function trajectory(s, v0, a, R, dx = 1, air = AIR, wind = 0) {
    const p = { x: 0, y: 0, z: 0 },
      v = { x: v0 * Math.cos(a), y: v0 * Math.sin(a), z: 0 },
      out = [{ x: 0, y: 0, z: 0, t: 0, v: v0 }];
    let next = dx,
      t = 0;
    const dt = 0.0005;
    while (p.x < R && t < 8 && v.x > 30) {
      const old = { ...p };
      advance(p, v, s, dt, { x: 0, y: 0, z: wind }, air);
      t += dt;
      while (next <= p.x && next <= R) {
        const f = (next - old.x) / (p.x - old.x);
        out.push({
          x: next,
          y: old.y + (p.y - old.y) * f,
          z: old.z + (p.z - old.z) * f,
          t: t - dt + dt * f,
          v: Math.hypot(v.x, v.y, v.z),
        });
        next += dx;
      }
    }
    return out;
  }
  const zcache = new Map();
  function zero(s, v, h, z, R, air = AIR) {
    const key = [s.name, s.g7, s.bc, v, h, z, R, air.rho, air.sound].join("|");
    if (zcache.has(key)) return zcache.get(key);
    let lo = -0.05,
      hi = 0.2,
      p;
    for (let i = 0; i < 24; i++) {
      const a = (lo + hi) * 0.5;
      p = trajectory(s, v, a, R, R, air).at(-1);
      if (p.x < R - 1e-5)
        return { elev: 0, wind: 0, Z: R, h, z, v0: v, unreachable: true };
      if (p.y < h) lo = a;
      else hi = a;
    }
    const sol = {
      elev: (lo + hi) * 0.5,
      wind: Math.atan2(z - spin(s, p.t), R),
      Z: R,
      h,
      z,
      v0: v,
    };
    zcache.set(key, sol);
    if (zcache.size > 128) zcache.delete(zcache.keys().next().value);
    return sol;
  }
  function holdovers(s, v, sol, ranges, air = AIR) {
    const tr = trajectory(s, v, sol.elev, Math.max(...ranges), 1, air);
    return ranges.map((R) => {
      const p = tr[Math.round(R)];
      return p
        ? {
            R,
            moa: (Math.atan2(sol.h - p.y, R) * 10800) / Math.PI,
            mrad: Math.atan2(sol.h - p.y, R) * 1000,
            t: p.t,
            v: p.v,
          }
        : null;
    });
  }
  function windAt(x, y, z, t, strength = 1, canopy = 0, ground = 0) {
    const a =
      Math.atan2(0.57, 0.82) +
      0.12 * Math.sin(t * 0.07) +
      0.05 * Math.sin(t * 0.19);
    const gust =
      1 +
      0.18 * Math.sin(t * 0.37) +
      0.12 * Math.sin(x * 0.021 + z * 0.017 - t * 0.45);
    const h = Math.max(0.15, y - ground);
    const u =
      4.5 *
      strength *
      gust *
      Math.min(1.3, Math.log((h + 0.1) / 0.1) / Math.log(101)) *
      (1 - 0.85 * Math.max(0, Math.min(1, canopy)));
    return { x: Math.cos(a) * u, y: 0, z: Math.sin(a) * u };
  }
  function penetrate(s, speed, material, thickness, pen = 1, reference = 880) {
    if (!(thickness > 0) || !Number.isFinite(thickness))
      return { pass: false, speed: 0 };
    let v2;
    if (material === "metal" || material === "steel") {
      const cap =
        0.002 *
        Math.pow(Math.max(0.1, pen), 1.3) *
        Math.pow(speed / reference, 1.43);
      v2 = speed * speed * (1 - Math.pow(thickness / cap, 1.4));
    } else if (["wood", "sand", "soil", "rubber", "glass"].includes(material)) {
      const soil = material === "sand" || material === "soil",
        area = Math.PI * (s.d / 2000) ** 2 * (soil ? 2.2 : 1),
        m = s.mass / 1000,
        rho = soil ? 1600 : material === "glass" ? 2500 : 600,
        sigma = soil ? 50e6 : material === "rubber" ? 12e6 : 35e6;
      const q = (rho * area) / m;
      v2 =
        (speed * speed + (2 * sigma) / rho) * Math.exp(-q * thickness) -
        (2 * sigma) / rho;
    } else return { pass: false, speed: 0 };
    return {
      pass: v2 > 3600,
      speed: Math.sqrt(Math.max(0, v2)),
      deflect: Math.min(0.035, 0.003 + thickness * 0.04),
      tumble: 1 + Math.min(2, thickness * 4),
    };
  }
  return {
    AIR,
    G1,
    G7,
    SPHERE,
    BASE,
    VAR,
    spec,
    dragK,
    atmosphere,
    advance,
    trajectory,
    zero,
    holdovers,
    spin,
    windAt,
    penetrate,
  };
});
