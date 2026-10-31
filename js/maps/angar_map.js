/* Extracted environment only from user supplied angar_map.html. Rebuild: tools/map-extraction/. No original input, renderer, player, weapons, artillery or drone boot. */
window.AEGIS_MAP_BUILDERS=window.AEGIS_MAP_BUILDERS||{};
window.AEGIS_MAP_BUILDERS['angar_map']=async function(ctx){

var __HK = { sound: null, fx: null, break: null };
var LIVE = { cell: 4, bins: new Map(), all: new Set() };
var __groundY = function (x, z) { return 0; };
function __qrot(v, q, inv) {
  var qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  if (inv) { qx = -qx; qy = -qy; qz = -qz; }
  var x = v[0], y = v[1], z = v[2];
  var tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  v[0] = x + qw * tx + qy * tz - qz * ty;
  v[1] = y + qw * ty + qz * tx - qx * tz;
  v[2] = z + qw * tz + qx * ty - qy * tx;
  return v;
}
function __aabb(c) {
  if (c.type === 0 || c.t === 0) return;
  if (c.hx === undefined) return;
  var hx = c.hx, hy = c.hy, hz = c.hz, ex = hx, ey = hy, ez = hz;
  if (c.q) {
    var m = [[hx, 0, 0], [0, hy, 0], [0, 0, hz]].map(function (a) { return __qrot(a, c.q, false); });
    ex = Math.abs(m[0][0]) + Math.abs(m[1][0]) + Math.abs(m[2][0]);
    ey = Math.abs(m[0][1]) + Math.abs(m[1][1]) + Math.abs(m[2][1]);
    ez = Math.abs(m[0][2]) + Math.abs(m[1][2]) + Math.abs(m[2][2]);
  }
  c.x0 = c.cx - ex; c.x1 = c.cx + ex; c.y0 = c.cy - ey; c.y1 = c.cy + ey; c.z0 = c.cz - ez; c.z1 = c.cz + ez;
}
function liveAdd(c) {
  __aabb(c);
  if (LIVE.all.has(c)) return;
  LIVE.all.add(c);
  var cs = LIVE.cell;
  for (var i = Math.floor(c.x0 / cs); i <= Math.floor(c.x1 / cs); i++)
    for (var j = Math.floor(c.z0 / cs); j <= Math.floor(c.z1 / cs); j++) {
      var k = i + "," + j, a = LIVE.bins.get(k);
      if (!a) LIVE.bins.set(k, a = []);
      a.push(c);
    }
}
function liveRemove(c) {
  c.dead = true;
  if (!LIVE.all.delete(c)) return;
  var cs = LIVE.cell;
  for (var i = Math.floor(c.x0 / cs); i <= Math.floor(c.x1 / cs); i++)
    for (var j = Math.floor(c.z0 / cs); j <= Math.floor(c.z1 / cs); j++) {
      var a = LIVE.bins.get(i + "," + j);
      if (a) { var n = a.indexOf(c); if (n >= 0) a.splice(n, 1); }
    }
}
function liveMoved(c) {
  var cs = LIVE.cell;
  for (var i = Math.floor(c.x0 / cs); i <= Math.floor(c.x1 / cs); i++)
    for (var j = Math.floor(c.z0 / cs); j <= Math.floor(c.z1 / cs); j++) {
      var a = LIVE.bins.get(i + "," + j);
      if (a) { var n = a.indexOf(c); if (n >= 0) a.splice(n, 1); }
    }
  LIVE.all.delete(c);
  liveAdd(c);
  c.moved = true;
}
function __rayBox(c, o, d, maxT, out) {
  var l = [o[0] - c.cx, o[1] - c.cy, o[2] - c.cz], ld = [d[0], d[1], d[2]];
  if (c.q) { __qrot(l, c.q, true); __qrot(ld, c.q, true); }
  var h = [c.hx, c.hy, c.hz], t0 = 0, t1 = maxT, ax = -1, sg = 0;
  for (var a = 0; a < 3; a++) {
    if (Math.abs(ld[a]) < 1e-9) { if (Math.abs(l[a]) > h[a]) return -1; continue; }
    var ta = (-h[a] - l[a]) / ld[a], tb = (h[a] - l[a]) / ld[a], s = -1;
    if (ta > tb) { var tt = ta; ta = tb; tb = tt; s = 1; }
    if (ta > t0) { t0 = ta; ax = a; sg = s; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  if (ax < 0) return -1;
  var n = [0, 0, 0]; n[ax] = sg;
  if (c.q) __qrot(n, c.q, false);
  out.n = n;
  return t0;
}
/* Closest hit along a segment. mode: 0 = everything, 1 = only owned (destructible) bodies */
function rayLive(ox, oy, oz, dx, dy, dz, maxT, ownedOnly) {
  var best = null, bt = maxT, seen = new Set(), o = [ox, oy, oz], d = [dx, dy, dz], cs = LIVE.cell, out = {};
  var steps = Math.max(1, Math.ceil(maxT / (cs * 0.5)));
  for (var s = 0; s <= steps; s++) {
    var t = Math.min(maxT, s * cs * 0.5), px = ox + dx * t, pz = oz + dz * t;
    for (var i = Math.floor((px - 0.01) / cs); i <= Math.floor((px + 0.01) / cs); i++)
      for (var j = Math.floor((pz - 0.01) / cs); j <= Math.floor((pz + 0.01) / cs); j++) {
        var a = LIVE.bins.get(i + "," + j);
        if (!a) continue;
        for (var k = 0; k < a.length; k++) {
          var c = a[k];
          if (seen.has(c) || c.dead) continue;
          seen.add(c);
          if (ownedOnly && !(c.idx >= 0)) continue;
          if (c.noRay) continue;
          var tt2 = __rayBox(c, o, d, bt, out);
          if (tt2 >= 0 && tt2 <= bt) { bt = tt2; best = { c: c, n: out.n, t: tt2 }; }
        }
      }
  }
  return best;
}
var PH = { owners: [], dyn: [], soft: [], ready: true, maxDyn: 220 };
function registerOwner(o) { PH.owners.push(o); return PH.owners.length - 1; }
var GRP = { STATIC: 1, DYN: 2, DEBRIS: 4, CHAR: 8, PROJ: 16 };
var SURF_CODE = { conc: -2, metal: -3, wood: -4, sand: -5, glass: -6 };
var SURF_NAME = { "-2": "conc", "-3": "metal", "-4": "wood", "-5": "sand", "-6": "glass" };
function addStaticCollider(c, userIndex) {
  normCollider(c);
  c.idx = userIndex ?? (SURF_CODE[c.surf] ?? -2);
  c.body = c;
  c.dyn = true;
  COLLIDERS.push(c);
  liveAdd(c);
  return c;
}
function addStaticCompound(parts, quat, userIndex, origin) {
  var q = [quat.x, quat.y, quat.z, quat.w], list = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    var c = { cx: p.cx, cy: p.cy, cz: p.cz, hx: Math.max(p.hx, 5e-3), hy: Math.max(p.hy, 5e-3), hz: Math.max(p.hz, 5e-3), q: q, surf: "wood" };
    list.push(addStaticCollider(c, userIndex));
  }
  return { parts: list };
}
function removeBody(b) {
  if (!b) return;
  if (b.parts) for (var i = 0; i < b.parts.length; i++) liveRemove(b.parts[i]);
  else liveRemove(b);
}
function blastImpulse() {}
function pokeCloth() {}
function rayFirst(from, to, mask) {
  var dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return null;
  dx /= len; dy /= len; dz /= len;
  var h = rayLive(from.x, from.y, from.z, dx, dy, dz, len, false), tb = h ? h.t : len + 1, out = null;
  if (h) out = { f: h.t / len, idx: h.c.idx ?? -2, p: new THREE.Vector3(from.x + dx * h.t, from.y + dy * h.t, from.z + dz * h.t), n: new THREE.Vector3(h.n[0], h.n[1], h.n[2]) };
  if (dy < -1e-4) {
    for (var s = 0; s <= 6; s++) {
      var t = len * s / 6, x = from.x + dx * t, z = from.z + dz * t, gy = __groundY(x, z), y = from.y + dy * t;
      if (y <= gy) { var tg = Math.max(0, (gy - from.y) / dy); if (tg < tb) out = { f: tg / len, idx: -2, p: new THREE.Vector3(from.x + dx * tg, gy, from.z + dz * tg), n: new THREE.Vector3(0, 1, 0) }; break; }
    }
  }
  return out;
}
function rayAll(from, to, mask) { var r = rayFirst(from, to, mask); return r ? [r] : []; }
var __DEB = { list: [] };
function __debFree(d) {
  if (d.mesh.parent) d.mesh.parent.remove(d.mesh);
  if (d.mesh.geometry && !d.mesh.geometry.userData?.shared) d.mesh.geometry.dispose?.();
}
function addDynamic(mesh, opt) {
  opt = opt || {};
  var max = (typeof Q !== "undefined" && Q.debris) ? Math.round(Q.debris * 0.5) : 80;
  while (__DEB.list.length >= max) __debFree(__DEB.list.shift());
  var rv = function (v) { return v ? [v.x, v.y, v.z] : [0, 0, 0]; };
  var d = { mesh: mesh, v: rv(opt.vel), w: rv(opt.spin), life: Math.min(opt.life || 20, 20), rest: false, r: Math.max(0.02, Math.min(0.4, (opt.size ? Math.max(opt.size[0], opt.size[1], opt.size[2]) : 0.2) * 0.4)) };
  __DEB.list.push(d);
  return d;
}
function __debUpdate(dt) {
  var L = __DEB.list;
  for (var i = L.length - 1; i >= 0; i--) {
    var d = L[i], m = d.mesh;
    d.life -= dt;
    if (d.life <= 0) { __debFree(d); L.splice(i, 1); continue; }
    if (d.rest) continue;
    d.v[1] -= 9.81 * dt;
    m.position.x += d.v[0] * dt; m.position.y += d.v[1] * dt; m.position.z += d.v[2] * dt;
    m.rotation.x += d.w[0] * dt; m.rotation.y += d.w[1] * dt; m.rotation.z += d.w[2] * dt;
    var h = rayLive(m.position.x, m.position.y + 0.4, m.position.z, 0, -1, 0, 0.4 + d.r + 0.05, false), gy = __groundY(m.position.x, m.position.z), fy = h ? m.position.y + 0.4 - h.t : -1e9;
    if (gy > fy) fy = gy;
    if (m.position.y - d.r <= fy) {
      m.position.y = fy + d.r;
      if (d.v[1] < -1.2) { d.v[1] *= -0.28; d.v[0] *= 0.6; d.v[2] *= 0.6; d.w[0] *= 0.5; d.w[1] *= 0.5; d.w[2] *= 0.5; }
      else { d.rest = true; d.life = Math.min(d.life, 12); }
    }
  }
}
var SND = new Proxy({}, { get: function (t, k) { return function (p, a) { if (__HK.sound) __HK.sound(String(k), p, a); }; } });
var __noopFn = function () { return __noopObj; };
var __noopObj = new Proxy(__noopFn, { get: function (t, k) { return k === Symbol.toPrimitive ? function () { return 0; } : __noopObj; }, apply: function () { return __noopObj; } });
var FXS = __noopObj;
function impactFX() {}
function __bulletAt(p, dir, power) {
  var h = rayLive(p.x - dir.x * 0.3, p.y - dir.y * 0.3, p.z - dir.z * 0.3, dir.x, dir.y, dir.z, 0.9, true);
  if (!h) return null;
  var hp = new THREE.Vector3(p.x - dir.x * 0.3 + dir.x * h.t, p.y - dir.y * 0.3 + dir.y * h.t, p.z - dir.z * 0.3 + dir.z * h.t);
  return bulletHit({ idx: h.c.idx, p: hp, n: new THREE.Vector3(h.n[0], h.n[1], h.n[2]) }, dir, power);
}

var THREE = ctx.THREE;
var BGU = ctx.BGU;
var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
var lerp = (a, b, t) => a + (b - a) * t;
var smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
var SEED = 20260920;
var srnd = () => {
  SEED = SEED * 1664525 + 1013904223 >>> 0;
  return SEED / 4294967296;
};
var sr = (a, b) => a + srnd() * (b - a);
var si = (a, b) => Math.floor(sr(a, b + 1));
var _seed2 = 424242;
var rnd2 = () => {
  _seed2 = _seed2 * 1664525 + 1013904223 >>> 0;
  return _seed2 / 4294967296;
};
var QPRESETS = {
  low: {
    pixelRatio: 1,
    shadow: 1024,
    shadowFar: 120,
    ao: false,
    bloom: false,
    smaa: false,
    tex: 0.5,
    dust: 900,
    lights: 4,
    spots: 2,
    shafts: 0.35,
    props: 0.55,
    debris: 120,
    anisotropy: 2,
    softShadow: false,
    cloth: 0.45,
    target: 45,
    minPR: 0.6
  },
  med: {
    pixelRatio: 1.25,
    shadow: 2048,
    shadowFar: 150,
    ao: false,
    bloom: true,
    smaa: true,
    tex: 0.75,
    dust: 2200,
    lights: 5,
    spots: 3,
    shafts: 0.7,
    props: 0.8,
    debris: 260,
    anisotropy: 4,
    softShadow: true,
    cloth: 0.7,
    target: 50,
    minPR: 0.7
  },
  high: {
    pixelRatio: 1.5,
    shadow: 3072,
    shadowFar: 170,
    ao: true,
    bloom: true,
    smaa: true,
    tex: 1,
    dust: 4200,
    lights: 6,
    spots: 4,
    shafts: 1,
    props: 1,
    debris: 420,
    anisotropy: 8,
    softShadow: true,
    cloth: 1,
    target: 55,
    minPR: 0.8
  },
  ultra: {
    pixelRatio: 1.75,
    shadow: 4096,
    shadowFar: 190,
    ao: true,
    bloom: true,
    smaa: true,
    tex: 1,
    dust: 6e3,
    lights: 8,
    spots: 4,
    shafts: 1,
    props: 1,
    debris: 600,
    anisotropy: 16,
    softShadow: true,
    cloth: 1,
    target: 58,
    minPR: 0.9
  }
};
var QNAME = (ctx.quality==='medium'?'med':ctx.quality==='high'?'high':'low');
var Q = QPRESETS[QNAME];
var TS = (n) => Math.max(128, Math.round(n * Q.tex / 64) * 64);
var renderer = ctx.renderer;
var scene = ctx.scene;
var camera = ctx.camera;
var DEBUG = new URLSearchParams();
var TEXK = DEBUG.has("fast") ? 0.12 : 1;
var rnd = (a, b) => a + Math.random() * (b - a);
function cv(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d", { willReadFrequently: true })];
}
function wrapDraw(x, size, fn) {
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    x.save();
    x.translate(ox * size, oy * size);
    fn();
    x.restore();
  }
}
function grain(x, w, h, amt) {
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amt * 255;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n, 0, 255);
  }
  x.putImageData(img, 0, 0);
}
function heightToAO(hc, power = 1) {
  const sz = hc.width, hx = hc.getContext("2d");
  const src = hx.getImageData(0, 0, sz, sz).data;
  const [ac, ax] = cv(sz, sz);
  const out = ax.createImageData(sz, sz), o = out.data;
  const H = (x, y) => src[((y + sz) % sz * sz + (x + sz) % sz) * 4] / 255;
  const R = 4;
  for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) {
    const h = H(x, y);
    let higher = 0, n = 0;
    for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) {
      if (!dx && !dy) continue;
      higher += Math.max(0, H(x + dx, y + dy) - h);
      n++;
    }
    const occ = clamp(1 - higher / n * 5 * power, 0, 1);
    const v = Math.round(clamp(0.35 + occ * 0.65, 0, 1) * 255);
    const i = (y * sz + x) * 4;
    o[i] = o[i + 1] = o[i + 2] = v;
    o[i + 3] = 255;
  }
  ax.putImageData(out, 0, 0);
  return ac;
}
function heightToNormal(hc, strength = 2) {
  const s = hc.width, hx = hc.getContext("2d");
  const src = hx.getImageData(0, 0, s, s).data;
  const [nc, nx] = cv(s, s);
  const out = nx.createImageData(s, s), o = out.data;
  const H = (x, y) => src[((y + s) % s * s + (x + s) % s) * 4] / 255;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    let nxv = -dx, nyv = -dy, nzv = 1;
    const l = Math.hypot(nxv, nyv, nzv);
    const i = (y * s + x) * 4;
    o[i] = (nxv / l * 0.5 + 0.5) * 255;
    o[i + 1] = (nyv / l * 0.5 + 0.5) * 255;
    o[i + 2] = (nzv / l * 0.5 + 0.5) * 255;
    o[i + 3] = 255;
  }
  nx.putImageData(out, 0, 0);
  return nc;
}
var MAXA = () => Math.min(renderer.capabilities.getMaxAnisotropy(), Q.anisotropy);
function T(canvas, rx = 1, ry = 1, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = MAXA();
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function osbMaps(size = 1024, tint = 1) {
  const [c, x] = cv(size, size);
  const [h, hx] = cv(size, size);
  const [rg, rx] = cv(size, size);
  x.fillStyle = `rgb(${212 * tint | 0},${183 * tint | 0},${133 * tint | 0})`;
  x.fillRect(0, 0, size, size);
  hx.fillStyle = "#6a6a6a";
  hx.fillRect(0, 0, size, size);
  rx.fillStyle = "#b8b8b8";
  rx.fillRect(0, 0, size, size);
  const layers = [
    { n: 1400, a: () => sr(0, 6.283), w: [44, 120], hgt: [9, 19], op: [0.55, 0.85], hz: [0.3, 0.48] },
    { n: 1100, a: () => sr(0, 6.283), w: [50, 132], hgt: [10, 21], op: [0.5, 0.82], hz: [0.46, 0.64] },
    // верхний слой ориентирован вдоль листа, но с широким разбросом ±35°
    { n: 1500, a: () => sr(-0.62, 0.62) + (srnd() < 0.18 ? 1.57 : 0), w: [56, 148], hgt: [10, 23], op: [0.55, 0.88], hz: [0.62, 0.84] }
  ];
  for (const L of layers) {
    for (let i = 0; i < L.n * TEXK; i++) {
      const w = sr(L.w[0], L.w[1]), hh = sr(L.hgt[0], L.hgt[1]), a = L.a();
      const px = srnd() * size, py = srnd() * size;
      const lum = sr(0.88, 1.08);
      const warm = sr(0.9, 1.04);
      const r = clamp(230 * lum * tint, 0, 255) | 0, g = clamp(198 * lum * tint * warm, 0, 255) | 0, b = clamp(144 * lum * tint * warm * sr(0.95, 1.04), 0, 255) | 0;
      const op = sr(L.op[0], L.op[1]);
      const hv = Math.round(sr(L.hz[0], L.hz[1]) * 255);
      const rr = Math.min(hh * 0.42, 5);
      const rv = si(140, 210);
      wrapDraw(x, size, () => {
        x.save();
        x.translate(px, py);
        x.rotate(a);
        x.fillStyle = `rgba(${r},${g},${b},${op})`;
        x.beginPath();
        x.roundRect(-w / 2, -hh / 2, w, hh, rr);
        x.fill();
        x.strokeStyle = `rgba(${clamp(r * 0.8, 0, 255) | 0},${clamp(g * 0.76, 0, 255) | 0},${clamp(b * 0.68, 0, 255) | 0},.14)`;
        x.lineWidth = 0.7;
        const fib = 2 + Math.floor(hh / 6);
        for (let k = 1; k < fib; k++) {
          const yy = -hh / 2 + hh * k / fib;
          x.beginPath();
          x.moveTo(-w / 2 + rr, yy);
          x.lineTo(w / 2 - rr, yy);
          x.stroke();
        }
        x.strokeStyle = `rgba(${clamp(r * 0.64, 0, 255) | 0},${clamp(g * 0.6, 0, 255) | 0},${clamp(b * 0.54, 0, 255) | 0},.20)`;
        x.lineWidth = 0.8;
        x.beginPath();
        x.roundRect(-w / 2, -hh / 2, w, hh, rr);
        x.stroke();
        x.restore();
      });
      wrapDraw(hx, size, () => {
        hx.save();
        hx.translate(px, py);
        hx.rotate(a);
        hx.fillStyle = `rgba(${hv},${hv},${hv},${op})`;
        hx.beginPath();
        hx.roundRect(-w / 2, -hh / 2, w, hh, rr);
        hx.fill();
        hx.strokeStyle = "rgba(32,32,32,.55)";
        hx.lineWidth = 1.3;
        hx.beginPath();
        hx.roundRect(-w / 2, -hh / 2, w, hh, rr);
        hx.stroke();
        hx.restore();
      });
      wrapDraw(rx, size, () => {
        rx.save();
        rx.translate(px, py);
        rx.rotate(a);
        rx.fillStyle = `rgba(${rv},${rv},${rv},${op * 0.8})`;
        rx.beginPath();
        rx.roundRect(-w / 2, -hh / 2, w, hh, rr);
        rx.fill();
        rx.strokeStyle = "rgba(248,248,248,.55)";
        rx.lineWidth = 1.4;
        rx.beginPath();
        rx.roundRect(-w / 2, -hh / 2, w, hh, rr);
        rx.stroke();
        rx.restore();
      });
    }
  }
  for (let i = 0; i < 110; i++) {
    const px = srnd() * size, py = srnd() * size, r = sr(20, 120), al = sr(0.05, 0.17);
    wrapDraw(x, size, () => {
      const g = x.createRadialGradient(px, py, 2, px, py, r);
      g.addColorStop(0, `rgba(146,116,72,${al * 0.8})`);
      g.addColorStop(1, "rgba(146,116,72,0)");
      x.fillStyle = g;
      x.beginPath();
      x.arc(px, py, r, 0, 7);
      x.fill();
    });
    wrapDraw(rx, size, () => {
      const g = rx.createRadialGradient(px, py, 2, px, py, r);
      g.addColorStop(0, `rgba(84,84,84,${al * 2.8})`);
      g.addColorStop(1, "rgba(84,84,84,0)");
      rx.fillStyle = g;
      rx.beginPath();
      rx.arc(px, py, r, 0, 7);
      rx.fill();
    });
  }
  for (let i = 0; i < 150; i++) {
    const px = srnd() * size, py = srnd() * size, r = sr(10, 58), v = si(186, 214);
    wrapDraw(x, size, () => {
      const g = x.createRadialGradient(px, py, 1, px, py, r);
      g.addColorStop(0, `rgba(${v + 22},${v + 8},${v - 18},${sr(0.06, 0.15)})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g;
      x.beginPath();
      x.arc(px, py, r, 0, 7);
      x.fill();
    });
  }
  grain(x, size, size, 0.028);
  return { albedo: c, height: h, rough: rg };
}
function concreteMaps(size = 768) {
  const [c, x] = cv(size, size);
  const [h, hx] = cv(size, size);
  const [rg, rx] = cv(size, size);
  x.fillStyle = "#86837d";
  x.fillRect(0, 0, size, size);
  hx.fillStyle = "#aaaaaa";
  hx.fillRect(0, 0, size, size);
  rx.fillStyle = "#e0e0e0";
  rx.fillRect(0, 0, size, size);
  for (let i = 0; i < 340; i++) {
    const v = si(98, 164);
    const px = srnd() * size, py = srnd() * size, r = sr(10, 70), al = sr(0.04, 0.16);
    wrapDraw(x, size, () => {
      x.fillStyle = `rgba(${v},${v - 2},${v - 7},${al})`;
      x.beginPath();
      x.arc(px, py, r, 0, 7);
      x.fill();
    });
  }
  for (let i = 0; i < 2400; i++) {
    const px = srnd() * size, py = srnd() * size, r = sr(0.7, 3.4);
    const dark = srnd() < 0.5;
    const hv = dark ? si(120, 150) : si(170, 205);
    wrapDraw(hx, size, () => {
      hx.fillStyle = `rgba(${hv},${hv},${hv},.6)`;
      hx.beginPath();
      hx.arc(px, py, r, 0, 7);
      hx.fill();
    });
    if (srnd() < 0.35) {
      const v = dark ? si(92, 126) : si(146, 176);
      wrapDraw(x, size, () => {
        x.fillStyle = `rgba(${v},${v - 1},${v - 4},.4)`;
        x.beginPath();
        x.arc(px, py, r, 0, 7);
        x.fill();
      });
    }
  }
  for (let i = 0; i < 26; i++) {
    const px = srnd() * size, py = srnd() * size, r = sr(40, 150), v = si(38, 68), al = sr(0.12, 0.3);
    wrapDraw(x, size, () => {
      const g = x.createRadialGradient(px, py, 2, px, py, r);
      g.addColorStop(0, `rgba(${v},${v - 1},${v + 2},${al})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g;
      x.beginPath();
      x.arc(px, py, r, 0, 7);
      x.fill();
    });
    wrapDraw(rx, size, () => {
      const g = rx.createRadialGradient(px, py, 2, px, py, r);
      g.addColorStop(0, `rgba(74,74,74,${al * 2.2})`);
      g.addColorStop(1, "rgba(74,74,74,0)");
      rx.fillStyle = g;
      rx.beginPath();
      rx.arc(px, py, r, 0, 7);
      rx.fill();
    });
  }
  for (let i = 0; i < 18; i++) {
    const px = srnd() * size, py = srnd() * size, r = sr(60, 180);
    wrapDraw(rx, size, () => {
      const g = rx.createRadialGradient(px, py, 2, px, py, r);
      g.addColorStop(0, `rgba(168,168,168,${sr(0.15, 0.4)})`);
      g.addColorStop(1, "rgba(168,168,168,0)");
      rx.fillStyle = g;
      rx.beginPath();
      rx.arc(px, py, r, 0, 7);
      rx.fill();
    });
    wrapDraw(x, size, () => {
      const v = si(150, 178);
      const g = x.createRadialGradient(px, py, 2, px, py, r);
      g.addColorStop(0, `rgba(${v},${v},${v - 3},${sr(0.04, 0.12)})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g;
      x.beginPath();
      x.arc(px, py, r, 0, 7);
      x.fill();
    });
  }
  function crack(ctx, px, py, ang, len, w, col) {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px, py);
    let cx = px, cy = py, a = ang;
    for (let j = 0; j < len; j++) {
      a += sr(-0.32, 0.32);
      cx += Math.cos(a) * sr(5, 13);
      cy += Math.sin(a) * sr(5, 13);
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    return [cx, cy, a];
  }
  for (let i = 0; i < 5; i++) {
    const px = srnd() * size, py = srnd() * size, a = sr(0, 6.28), w = sr(0.6, 1.3);
    wrapDraw(x, size, () => {
      const [ex, ey, ea] = crack(x, px, py, a, 9, w, "rgba(58,55,52,.34)");
      if (srnd() < 0.6) crack(x, ex, ey, ea + sr(0.5, 1.2), 5, w * 0.6, "rgba(58,55,52,.24)");
    });
    wrapDraw(hx, size, () => {
      const [ex, ey, ea] = crack(hx, px, py, a, 9, w * 1.3, "rgba(44,44,44,.7)");
      if (srnd() < 0.6) crack(hx, ex, ey, ea + sr(0.5, 1.2), 5, w * 0.8, "rgba(44,44,44,.5)");
    });
  }
  let cs = 60013;
  const cr = () => {
    cs = cs * 1664525 + 1013904223 >>> 0;
    return cs / 4294967296;
  }, cR = (a, b) => a + cr() * (b - a);
  const K = size / 768;
  for (let i = 0; i < 90; i++) {
    const px = cr() * size, py = cr() * size, r = cR(30, 150) * K, a0 = cR(0, 6.28), len = cR(1, 3.4), lw = cR(5, 16) * K;
    wrapDraw(rx, size, () => {
      rx.strokeStyle = `rgba(150,150,150,${cR(0.05, 0.14)})`;
      rx.lineWidth = lw;
      rx.beginPath();
      rx.arc(px, py, r, a0, a0 + len);
      rx.stroke();
    });
    wrapDraw(x, size, () => {
      x.strokeStyle = `rgba(160,158,152,${cR(0.015, 0.045)})`;
      x.lineWidth = lw;
      x.beginPath();
      x.arc(px, py, r, a0, a0 + len);
      x.stroke();
    });
  }
  for (let i = 0; i < 9e3 * K * K; i++) {
    const px = cr() * size, py = cr() * size, v = cr() < 0.5 ? cR(60, 95) : cR(170, 215), s2 = cR(0.6, 1.8) * K;
    x.fillStyle = `rgba(${v},${v - 2},${v - 6},${cR(0.25, 0.6)})`;
    x.fillRect(px, py, s2, s2);
    if (cr() < 0.3) {
      hx.fillStyle = `rgba(${v < 128 ? 110 : 180},${v < 128 ? 110 : 180},${v < 128 ? 110 : 180},.5)`;
      hx.fillRect(px, py, s2, s2);
    }
  }
  for (let i = 0; i < 9; i++) {
    const px = cr() * size, py = cr() * size, r = cR(20, 70) * K;
    wrapDraw(x, size, () => {
      for (let k = 0; k < 14; k++) {
        const qx = px + cR(-r, r), qy = py + cR(-r, r) * 0.6, rr = cR(4, 18) * K, g = x.createRadialGradient(qx, qy, 0, qx, qy, rr);
        g.addColorStop(0, `rgba(214,212,204,${cR(0.06, 0.16)})`);
        g.addColorStop(1, "rgba(214,212,204,0)");
        x.fillStyle = g;
        x.beginPath();
        x.arc(qx, qy, rr, 0, 7);
        x.fill();
      }
    });
    wrapDraw(rx, size, () => {
      rx.fillStyle = "rgba(250,250,250,.25)";
      rx.beginPath();
      rx.ellipse(px, py, r, r * 0.6, 0, 0, 7);
      rx.fill();
    });
  }
  for (let i = 0; i < 14; i++) {
    let cx = cr() * size, cy = cr() * size, a = cR(0, 6.28);
    const n = 6 + Math.floor(cr() * 10), pts = [[cx, cy]];
    for (let j = 0; j < n; j++) {
      a += cR(-0.5, 0.5);
      cx += Math.cos(a) * cR(4, 11) * K;
      cy += Math.sin(a) * cR(4, 11) * K;
      pts.push([cx, cy]);
    }
    wrapDraw(x, size, () => {
      x.strokeStyle = "rgba(62,60,56,.22)";
      x.lineWidth = 0.7 * K;
      x.beginPath();
      pts.forEach(([u, v], k) => k ? x.lineTo(u, v) : x.moveTo(u, v));
      x.stroke();
    });
    wrapDraw(hx, size, () => {
      hx.strokeStyle = "rgba(70,70,70,.6)";
      hx.lineWidth = 1.1 * K;
      hx.beginPath();
      pts.forEach(([u, v], k) => k ? hx.lineTo(u, v) : hx.moveTo(u, v));
      hx.stroke();
    });
  }
  grain(x, size, size, 0.035);
  return { albedo: c, height: h, rough: rg };
}
function lumberMaps(size = 512) {
  const [c, x] = cv(size, size);
  const [h, hx] = cv(size, size);
  const [rg, rx] = cv(size, size);
  x.fillStyle = "#c9b48f";
  x.fillRect(0, 0, size, size);
  hx.fillStyle = "#8c8c8c";
  hx.fillRect(0, 0, size, size);
  rx.fillStyle = "#cacaca";
  rx.fillRect(0, 0, size, size);
  let y = 0;
  while (y < size) {
    const early = sr(16, 44);
    const late = sr(1.4, 3.4);
    const wob = sr(6, 16);
    const phase = sr(0, 6.28);
    const lumE = sr(0.94, 1.06);
    const lumL = sr(0.76, 0.88);
    for (let px = 0; px < size; px++) {
      const off = Math.sin(px / size * Math.PI * 2 + phase) * wob * 0.35 + Math.sin(px / size * Math.PI * 6 + phase * 2) * wob * 0.12;
      const ye = y + off;
      x.fillStyle = `rgba(${clamp(214 * lumE, 0, 255) | 0},${clamp(189 * lumE, 0, 255) | 0},${clamp(146 * lumE, 0, 255) | 0},.85)`;
      x.fillRect(px, ye, 1, early);
      hx.fillStyle = `rgba(${clamp(176 * lumE, 0, 255) | 0},${clamp(176 * lumE, 0, 255) | 0},${clamp(176 * lumE, 0, 255) | 0},.8)`;
      hx.fillRect(px, ye, 1, early);
      rx.fillStyle = `rgba(${clamp(206 * lumE, 0, 255) | 0},${clamp(206 * lumE, 0, 255) | 0},${clamp(206 * lumE, 0, 255) | 0},.6)`;
      rx.fillRect(px, ye, 1, early);
      const yl = ye + early;
      x.fillStyle = `rgba(${clamp(168 * lumL * 1.15, 0, 255) | 0},${clamp(134 * lumL * 1.15, 0, 255) | 0},${clamp(92 * lumL * 1.15, 0, 255) | 0},.8)`;
      x.fillRect(px, yl, 1, late);
      hx.fillStyle = `rgba(${clamp(96 * lumL, 0, 255) | 0},${clamp(96 * lumL, 0, 255) | 0},${clamp(96 * lumL, 0, 255) | 0},.85)`;
      hx.fillRect(px, yl, 1, late);
      rx.fillStyle = "rgba(146,146,146,.55)";
      rx.fillRect(px, yl, 1, late);
    }
    y += early + late;
  }
  for (let i = 0; i < size * 1.1; i++) {
    const yy = srnd() * size, len = sr(size * 0.2, size), x0 = srnd() * size;
    const v = si(160, 215), a = sr(0.03, 0.09);
    x.strokeStyle = `rgba(${v},${v * 0.86 | 0},${v * 0.64 | 0},${a})`;
    x.lineWidth = sr(0.5, 1.4);
    x.beginPath();
    x.moveTo(x0, yy);
    x.bezierCurveTo(x0 + len * 0.33, yy + sr(-2.5, 2.5), x0 + len * 0.66, yy + sr(-2.5, 2.5), x0 + len, yy + sr(-3, 3));
    x.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const px = srnd() * size, py = srnd() * size, rr = sr(6, 15), ry = rr * sr(0.45, 0.75);
    wrapDraw(x, size, () => {
      x.strokeStyle = "rgba(126,96,54,.28)";
      x.lineWidth = 1.1;
      for (let k = 0; k < 7; k++) {
        const o = (k - 3) * rr * 0.5;
        x.beginPath();
        x.moveTo(px - rr * 3.4, py + o);
        x.quadraticCurveTo(px, py + o * sr(1.5, 2.4), px + rr * 3.4, py + o);
        x.stroke();
      }
      const g = x.createRadialGradient(px, py, 1, px, py, rr);
      g.addColorStop(0, "rgba(74,48,24,.95)");
      g.addColorStop(0.62, "rgba(104,70,36,.78)");
      g.addColorStop(1, "rgba(128,92,52,0)");
      x.fillStyle = g;
      x.beginPath();
      x.ellipse(px, py, rr, ry, sr(0, 3), 0, 7);
      x.fill();
    });
    wrapDraw(hx, size, () => {
      const g = hx.createRadialGradient(px, py, 1, px, py, rr);
      g.addColorStop(0, "rgba(54,54,54,.9)");
      g.addColorStop(1, "rgba(140,140,140,0)");
      hx.fillStyle = g;
      hx.beginPath();
      hx.ellipse(px, py, rr, ry, 0, 0, 7);
      hx.fill();
    });
    wrapDraw(rx, size, () => {
      const g = rx.createRadialGradient(px, py, 1, px, py, rr);
      g.addColorStop(0, "rgba(108,108,108,.8)");
      g.addColorStop(1, "rgba(108,108,108,0)");
      rx.fillStyle = g;
      rx.beginPath();
      rx.ellipse(px, py, rr, ry, 0, 0, 7);
      rx.fill();
    });
  }
  for (let i = 0; i < 8; i++) {
    const yy = srnd() * size;
    x.strokeStyle = `rgba(${si(160, 196)},${si(140, 172)},${si(110, 140)},.07)`;
    x.lineWidth = sr(1.5, 4);
    x.beginPath();
    x.moveTo(0, yy);
    x.lineTo(size, yy + sr(-3, 3));
    x.stroke();
  }
  for (let i = 0; i < 70; i++) {
    const px = srnd() * size, py = srnd() * size, r = sr(10, 54), v = si(120, 168);
    wrapDraw(x, size, () => {
      const g = x.createRadialGradient(px, py, 1, px, py, r);
      g.addColorStop(0, `rgba(${v},${v - 6},${v - 20},${sr(0.05, 0.16)})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g;
      x.beginPath();
      x.arc(px, py, r, 0, 7);
      x.fill();
    });
    wrapDraw(rx, size, () => {
      const g = rx.createRadialGradient(px, py, 1, px, py, r);
      g.addColorStop(0, `rgba(${si(150, 210)},${si(150, 210)},${si(150, 210)},${sr(0.08, 0.26)})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      rx.fillStyle = g;
      rx.beginPath();
      rx.arc(px, py, r, 0, 7);
      rx.fill();
    });
  }
  grain(x, size, size, 0.028);
  return { albedo: c, height: h, rough: rg };
}
function corrugatedMaps(size = 512, rust = 0.5, base2 = [118, 112, 104], ribs = 7) {
  const [c, x] = cv(size, size);
  const [h, hx] = cv(size, size);
  const [rg, rx] = cv(size, size);
  rx.fillStyle = "#8a8a8a";
  rx.fillRect(0, 0, size, size);
  for (let i = 0; i < size; i++) {
    const t = i / size * ribs % 1;
    let prof;
    if (t < 0.58) prof = 1;
    else if (t < 0.7) prof = 1 - (t - 0.58) / 0.12;
    else if (t < 0.88) prof = 0.06;
    else prof = (t - 0.88) / 0.12;
    const k = 0.8 + prof * 0.3 + (prof > 0.08 && prof < 0.94 ? -0.06 : 0);
    x.fillStyle = `rgb(${clamp(base2[0] * k, 0, 255) | 0},${clamp(base2[1] * k, 0, 255) | 0},${clamp(base2[2] * k, 0, 255) | 0})`;
    x.fillRect(i, 0, 1, size);
    const hv = Math.round(60 + prof * 175);
    hx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hx.fillRect(i, 0, 1, size);
  }
  for (let k = 0; k < 2; k++) {
    const y = size * (0.5 * k + 0.25);
    x.fillStyle = "rgba(72,66,60,.3)";
    x.fillRect(0, y, size, 2);
    hx.fillStyle = "rgba(30,30,30,.8)";
    hx.fillRect(0, y, size, 3);
  }
  for (let k = 0; k < 2; k++) {
    const y = size * (0.5 * k + 0.25) + 1;
    for (let i = 0; i < ribs; i++) {
      const px = (i + 0.5) * size / ribs;
      x.fillStyle = "rgba(86,78,70,.5)";
      x.beginPath();
      x.arc(px, y, 2.2, 0, 7);
      x.fill();
      hx.fillStyle = "rgba(230,230,230,.9)";
      hx.beginPath();
      hx.arc(px, y, 2.4, 0, 7);
      hx.fill();
    }
  }
  for (let i = 0; i < rust * 240; i++) {
    const px = srnd() * size, py = srnd() * size, r = sr(3, 30);
    const col = `rgba(${si(104, 152)},${si(68, 96)},${si(44, 62)},${sr(0.08, 0.34)})`;
    wrapDraw(x, size, () => {
      const g = x.createRadialGradient(px, py, 1, px, py, r);
      g.addColorStop(0, col);
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g;
      x.beginPath();
      x.arc(px, py, r, 0, 7);
      x.fill();
    });
    wrapDraw(rx, size, () => {
      const g = rx.createRadialGradient(px, py, 1, px, py, r);
      g.addColorStop(0, `rgba(240,240,240,${sr(0.2, 0.6)})`);
      g.addColorStop(1, "rgba(240,240,240,0)");
      rx.fillStyle = g;
      rx.beginPath();
      rx.arc(px, py, r, 0, 7);
      rx.fill();
    });
  }
  for (let i = 0; i < 22; i++) {
    const px = srnd() * size, w = sr(2, 9), y0 = srnd() * size;
    const g = x.createLinearGradient(px, y0, px, y0 + size * 0.5);
    g.addColorStop(0, `rgba(${si(88, 126)},${si(58, 80)},${si(38, 52)},.2)`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(px, y0, w, size * 0.5);
  }
  grain(x, size, size, 0.028);
  return { albedo: c, height: h, rough: rg };
}
function steelMaps(size = 512, baseCol = [64, 60, 58]) {
  const [c, x] = cv(size, size);
  const [h, hx] = cv(size, size);
  const [rg, rx] = cv(size, size);
  rx.fillStyle = "#6e6e6e";
  rx.fillRect(0, 0, size, size);
  x.fillStyle = `rgb(${baseCol[0]},${baseCol[1]},${baseCol[2]})`;
  x.fillRect(0, 0, size, size);
  hx.fillStyle = "#b4b4b4";
  hx.fillRect(0, 0, size, size);
  for (let i = 0; i < 420; i++) {
    const px = srnd() * size, py = srnd() * size, r = sr(3, 26);
    const col = `rgba(${si(96, 156)},${si(58, 90)},${si(36, 56)},${sr(0.14, 0.58)})`;
    wrapDraw(x, size, () => {
      const g = x.createRadialGradient(px, py, 1, px, py, r);
      g.addColorStop(0, col);
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g;
      x.beginPath();
      x.arc(px, py, r, 0, 7);
      x.fill();
    });
    wrapDraw(rx, size, () => {
      const g = rx.createRadialGradient(px, py, 1, px, py, r);
      g.addColorStop(0, `rgba(235,235,235,${sr(0.25, 0.7)})`);
      g.addColorStop(1, "rgba(235,235,235,0)");
      rx.fillStyle = g;
      rx.beginPath();
      rx.arc(px, py, r, 0, 7);
      rx.fill();
    });
    wrapDraw(hx, size, () => {
      const hv = si(130, 190);
      hx.fillStyle = `rgba(${hv},${hv},${hv},.25)`;
      hx.beginPath();
      hx.arc(px, py, r * 0.6, 0, 7);
      hx.fill();
    });
  }
  for (let i = 0; i < 26; i++) {
    const px = srnd() * size, w = sr(1.5, 7), y0 = srnd() * size;
    const g = x.createLinearGradient(px, y0, px, y0 + size * 0.6);
    g.addColorStop(0, `rgba(${si(96, 152)},${si(52, 82)},${si(24, 44)},.42)`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(px, y0, w, size * 0.6);
  }
  grain(x, size, size, 0.045);
  return { albedo: c, height: h, rough: rg };
}
function panelMaps(size = 768) {
  const [c, x] = cv(size, size);
  const [h, hx] = cv(size, size);
  const [rg, rx] = cv(size, size);
  x.fillStyle = "#8a8884";
  x.fillRect(0, 0, size, size);
  hx.fillStyle = "#b0b0b0";
  hx.fillRect(0, 0, size, size);
  rx.fillStyle = "#dcdcdc";
  rx.fillRect(0, 0, size, size);
  for (let i = 0; i < 420; i++) {
    const v = si(112, 162), px = srnd() * size, py = srnd() * size, r = sr(6, 40);
    wrapDraw(x, size, () => {
      x.fillStyle = `rgba(${v},${v - 2},${v - 8},${sr(0.04, 0.16)})`;
      x.beginPath();
      x.arc(px, py, r, 0, 7);
      x.fill();
    });
  }
  for (let i = 0; i < 1500; i++) {
    const px = srnd() * size, py = srnd() * size, r = sr(0.6, 2.6), hv = si(118, 150);
    wrapDraw(hx, size, () => {
      hx.fillStyle = `rgba(${hv},${hv},${hv},.5)`;
      hx.beginPath();
      hx.arc(px, py, r, 0, 7);
      hx.fill();
    });
  }
  const seam = (x0, y0, x1, y1) => {
    x.strokeStyle = "rgba(66,62,56,.55)";
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(x0, y0);
    x.lineTo(x1, y1);
    x.stroke();
    hx.strokeStyle = "rgba(48,48,48,.95)";
    hx.lineWidth = 6;
    hx.beginPath();
    hx.moveTo(x0, y0);
    hx.lineTo(x1, y1);
    hx.stroke();
  };
  seam(0, 0, size, 0);
  seam(0, size - 2, size, size - 2);
  seam(0, size / 2, size, size / 2);
  seam(0, 0, 0, size);
  seam(size - 2, 0, size - 2, size);
  for (let i = 0; i < 26; i++) {
    const px = srnd() * size, w = sr(4, 26);
    const g = x.createLinearGradient(px, 0, px, size);
    g.addColorStop(0, "rgba(58,52,44,.34)");
    g.addColorStop(0.6, "rgba(58,52,44,.08)");
    g.addColorStop(1, "rgba(58,52,44,0)");
    x.fillStyle = g;
    x.fillRect(px, 0, w, size);
  }
  const gm = x.createLinearGradient(0, size * 0.72, 0, size);
  gm.addColorStop(0, "rgba(48,50,40,0)");
  gm.addColorStop(1, "rgba(48,50,40,.38)");
  x.fillStyle = gm;
  x.fillRect(0, size * 0.72, size, size * 0.28);
  for (let i = 0; i < 20; i++) {
    const px = srnd() * size, w = sr(6, 30);
    const g = rx.createLinearGradient(px, 0, px, size);
    g.addColorStop(0, `rgba(120,120,120,${sr(0.2, 0.45)})`);
    g.addColorStop(1, "rgba(120,120,120,0)");
    rx.fillStyle = g;
    rx.fillRect(px, 0, w, size);
  }
  grain(x, size, size, 0.03);
  return { albedo: c, height: h, rough: rg };
}
function dirtyGlassMaps(size = 256) {
  const [c, x] = cv(size, size);
  x.fillStyle = "#d8e4ee";
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    const px = srnd() * size, w = sr(3, 26);
    const g = x.createLinearGradient(px, 0, px, size);
    g.addColorStop(0, `rgba(${si(120, 168)},${si(126, 172)},${si(120, 166)},${sr(0.08, 0.3)})`);
    g.addColorStop(1, "rgba(150,155,150,0)");
    x.fillStyle = g;
    x.fillRect(px, 0, w, size);
  }
  for (let i = 0; i < 120; i++) {
    const px = srnd() * size, py = srnd() * size, r = sr(4, 30);
    wrapDraw(x, size, () => {
      const g = x.createRadialGradient(px, py, 1, px, py, r);
      g.addColorStop(0, `rgba(${si(140, 190)},${si(144, 192)},${si(138, 186)},${sr(0.05, 0.22)})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g;
      x.beginPath();
      x.arc(px, py, r, 0, 7);
      x.fill();
    });
  }
  x.strokeStyle = "rgba(126,132,128,.30)";
  x.lineWidth = 1.1;
  for (let i = 0; i <= size; i += size / 10) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i, size);
    x.stroke();
    x.beginPath();
    x.moveTo(0, i);
    x.lineTo(size, i);
    x.stroke();
  }
  grain(x, size, size, 0.03);
  return c;
}
function flagTex(w = 512, h = 320) {
  const [c, x] = cv(w, h);
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#25242a");
  g.addColorStop(0.5, "#1b1a1f");
  g.addColorStop(1, "#2b2930");
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < h; i += 2) {
    x.fillStyle = `rgba(255,255,255,${sr(0.012, 0.03)})`;
    x.fillRect(0, i, w, 1);
  }
  for (let i = 0; i < w; i += 2) {
    x.fillStyle = `rgba(0,0,0,${sr(0.01, 0.028)})`;
    x.fillRect(i, 0, 1, h);
  }
  const cx = w * 0.5, cy = h * 0.44, S = h * 34e-4;
  x.save();
  x.translate(cx, cy);
  x.scale(S, S);
  x.fillStyle = "#d8d3c4";
  const bone = (ang) => {
    x.save();
    x.rotate(ang);
    x.beginPath();
    x.roundRect(-118, -9, 236, 18, 9);
    x.fill();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      x.beginPath();
      x.arc(sx * 124, sy * 13, 15, 0, 7);
      x.fill();
    }
    x.restore();
  };
  bone(0.62);
  bone(-0.62);
  x.beginPath();
  x.ellipse(0, -14, 62, 56, 0, 0, 7);
  x.fill();
  x.beginPath();
  x.roundRect(-34, 26, 68, 34, 12);
  x.fill();
  x.fillStyle = "#1b1a1f";
  x.beginPath();
  x.ellipse(-24, -18, 19, 22, 0.12, 0, 7);
  x.fill();
  x.beginPath();
  x.ellipse(24, -18, 19, 22, -0.12, 0, 7);
  x.fill();
  x.beginPath();
  x.moveTo(0, 4);
  x.lineTo(-11, 24);
  x.lineTo(11, 24);
  x.closePath();
  x.fill();
  for (let i = 0; i < 4; i++) {
    x.fillRect(-27 + i * 15, 28, 5, 30);
  }
  x.restore();
  for (let i = 0; i < 120; i++) {
    const px = srnd() * w, py = srnd() * h, r = sr(8, 60);
    const rg = x.createRadialGradient(px, py, 1, px, py, r);
    rg.addColorStop(0, `rgba(${si(120, 170)},${si(112, 160)},${si(100, 148)},${sr(0.03, 0.12)})`);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = rg;
    x.beginPath();
    x.arc(px, py, r, 0, 7);
    x.fill();
  }
  x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 26; i++) {
    const py = srnd() * h;
    x.beginPath();
    x.moveTo(w, py);
    x.lineTo(w - sr(6, 52), py + sr(-14, 14));
    x.lineTo(w, py + sr(8, 30));
    x.closePath();
    x.fill();
  }
  for (let i = 0; i < 7; i++) {
    x.beginPath();
    x.ellipse(sr(w * 0.25, w * 0.97), srnd() * h, sr(2, 11), sr(2, 9), sr(0, 3), 0, 7);
    x.fill();
  }
  x.globalCompositeOperation = "source-over";
  grain(x, w, h, 0.04);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAXA();
  return t;
}
function helipadTex(size = 1024) {
  const [c, x] = cv(size, size);
  const S = size / 2;
  x.fillStyle = "#4a4b4d";
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < 9e3; i++) {
    const v = si(48, 96);
    x.fillStyle = `rgba(${v},${v + 2},${v + 3},${sr(0.15, 0.55)})`;
    x.fillRect(srnd() * size, srnd() * size, sr(1, 3.4), sr(1, 3.4));
  }
  x.strokeStyle = "#c9b048";
  x.lineWidth = size * 0.026;
  x.beginPath();
  x.arc(S, S, size * 0.4, 0, 7);
  x.stroke();
  x.strokeStyle = "#e4e2da";
  x.lineWidth = size * 0.018;
  x.beginPath();
  x.arc(S, S, size * 0.455, 0, 7);
  x.stroke();
  x.fillStyle = "#e8e6de";
  const bw = size * 0.052, bh = size * 0.3, gap = size * 0.115;
  x.fillRect(S - gap - bw / 2, S - bh / 2, bw, bh);
  x.fillRect(S + gap - bw / 2, S - bh / 2, bw, bh);
  x.fillRect(S - gap, S - bw / 2, gap * 2, bw);
  x.fillStyle = "#d8d6cc";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = `700 ${Math.round(size * 0.055)}px Arial,Helvetica,sans-serif`;
  x.fillText("07", S, S + size * 0.245);
  x.font = `700 ${Math.round(size * 0.038)}px Arial,Helvetica,sans-serif`;
  x.fillText("1.4 t", S, S - size * 0.245);
  x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 260; i++) {
    x.globalAlpha = sr(0.1, 0.55);
    x.beginPath();
    x.ellipse(srnd() * size, srnd() * size, sr(3, 26), sr(3, 20), sr(0, 3), 0, 7);
    x.fill();
  }
  x.globalAlpha = 1;
  x.globalCompositeOperation = "source-over";
  for (const sx of [-1, 1]) {
    const px = S + sx * size * 0.135;
    const gr = x.createLinearGradient(px - size * 0.02, 0, px + size * 0.02, 0);
    gr.addColorStop(0, "rgba(30,30,32,0)");
    gr.addColorStop(0.5, "rgba(30,30,32,.35)");
    gr.addColorStop(1, "rgba(30,30,32,0)");
    x.fillStyle = gr;
    x.fillRect(px - size * 0.03, S - size * 0.22, size * 0.06, size * 0.44);
  }
  for (let i = 0; i < 40; i++) {
    const px = S + sr(-size * 0.12, size * 0.12), py = S + sr(-size * 0.1, size * 0.1), r = sr(4, 26);
    const rg = x.createRadialGradient(px, py, 1, px, py, r);
    rg.addColorStop(0, `rgba(22,20,18,${sr(0.1, 0.36)})`);
    rg.addColorStop(1, "rgba(22,20,18,0)");
    x.fillStyle = rg;
    x.beginPath();
    x.arc(px, py, r, 0, 7);
    x.fill();
  }
  grain(x, size, size, 0.05);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAXA();
  return t;
}
function parkingTex(size = 1024) {
  const [c, x] = cv(size, size);
  x.clearRect(0, 0, size, size);
  const px = (v) => v / 16 * size;
  x.strokeStyle = "rgba(226,220,196,.85)";
  x.lineCap = "butt";
  x.lineWidth = px(0.12);
  for (let i = 0; i <= 4; i++) {
    x.beginPath();
    x.moveTo(px(0.4 + i * 2.6), px(0.6));
    x.lineTo(px(0.4 + i * 2.6), px(5.6));
    x.stroke();
  }
  x.beginPath();
  x.moveTo(px(0.4), px(5.6));
  x.lineTo(px(10.8), px(5.6));
  x.stroke();
  x.fillStyle = "rgba(226,220,196,.8)";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = `700 ${Math.round(px(0.7))}px Arial,sans-serif`;
  for (let i = 0; i < 4; i++) x.fillText("P" + (i + 1), px(1.7 + i * 2.6), px(5));
  x.fillStyle = "rgba(226,220,196,.7)";
  x.save();
  x.translate(px(12.6), px(8));
  x.scale(px(1), px(1));
  x.beginPath();
  x.moveTo(0, -2.2);
  x.lineTo(0.85, -0.6);
  x.lineTo(0.32, -0.6);
  x.lineTo(0.32, 2.2);
  x.lineTo(-0.32, 2.2);
  x.lineTo(-0.32, -0.6);
  x.lineTo(-0.85, -0.6);
  x.closePath();
  x.fill();
  x.restore();
  x.strokeStyle = "rgba(198,168,74,.6)";
  x.lineWidth = px(0.1);
  for (let i = 0; i < 12; i++) {
    x.beginPath();
    x.moveTo(px(0.4 + i * 0.5), px(14.6));
    x.lineTo(px(0.9 + i * 0.5), px(13.4));
    x.stroke();
  }
  x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 420; i++) {
    x.globalAlpha = sr(0.15, 0.7);
    x.beginPath();
    x.ellipse(srnd() * size, srnd() * size, sr(2, 16), sr(2, 13), sr(0, 3), 0, 7);
    x.fill();
  }
  x.globalAlpha = 1;
  x.globalCompositeOperation = "source-over";
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAXA();
  return t;
}
function hazardMaps(size = 256) {
  const [c, x] = cv(size, size);
  const [h, hx] = cv(size, size);
  const [rg, rx] = cv(size, size);
  x.fillStyle = "#b2933f";
  x.fillRect(0, 0, size, size);
  hx.fillStyle = "#808080";
  hx.fillRect(0, 0, size, size);
  rx.fillStyle = "#7c7c7c";
  rx.fillRect(0, 0, size, size);
  x.strokeStyle = "#26241f";
  x.lineWidth = size * 0.14;
  for (let i = -2; i <= 6; i++) {
    x.beginPath();
    x.moveTo(i * size / 3, 0);
    x.lineTo(i * size / 3 + size, size);
    x.stroke();
  }
  for (let i = 0; i < 220; i++) {
    const px = srnd() * size, py = srnd() * size, r = sr(2, 13);
    wrapDraw(x, size, () => {
      x.fillStyle = `rgba(${si(96, 140)},${si(64, 92)},${si(44, 62)},${sr(0.25, 0.7)})`;
      x.beginPath();
      x.arc(px, py, r, 0, 7);
      x.fill();
    });
    wrapDraw(hx, size, () => {
      const v = si(88, 126);
      hx.fillStyle = `rgba(${v},${v},${v},.6)`;
      hx.beginPath();
      hx.arc(px, py, r, 0, 7);
      hx.fill();
    });
    wrapDraw(rx, size, () => {
      rx.fillStyle = `rgba(${si(150, 200)},${si(150, 200)},${si(150, 200)},.5)`;
      rx.beginPath();
      rx.arc(px, py, r, 0, 7);
      rx.fill();
    });
  }
  grain(x, size, size, 0.05);
  return { albedo: c, height: h, rough: rg };
}
var texOf = (c, srgb = true) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAXA();
  return t;
};
function camoCanvas(w, h, pal, scale = 1) {
  const [c, x] = cv(w, h);
  x.fillStyle = pal[0];
  x.fillRect(0, 0, w, h);
  for (let L = 1; L < pal.length; L++) {
    const n = Math.round(90 * scale / L), rMax = 70 * scale / Math.sqrt(L);
    x.fillStyle = pal[L];
    for (let i = 0; i < n; i++) {
      const px = srnd() * w, py = srnd() * h;
      x.beginPath();
      const pts = 9, r0 = sr(rMax * 0.3, rMax);
      for (let k = 0; k <= pts; k++) {
        const a = k / pts * Math.PI * 2, r = r0 * sr(0.55, 1.15);
        const qx = px + Math.cos(a) * r * 1.6, qy = py + Math.sin(a) * r * 0.8;
        k ? x.lineTo(qx, qy) : x.moveTo(qx, qy);
      }
      x.closePath();
      x.fill();
    }
  }
  return [c, x];
}
function drawAlpha(x, cx, cy, s, col) {
  x.save();
  x.translate(cx, cy);
  x.scale(s, s);
  x.fillStyle = col;
  x.beginPath();
  x.moveTo(0, -100);
  x.lineTo(88, 80);
  x.lineTo(48, 80);
  x.lineTo(0, -18);
  x.lineTo(-48, 80);
  x.lineTo(-88, 80);
  x.closePath();
  x.fill();
  x.beginPath();
  x.moveTo(-22, 52);
  x.lineTo(22, 52);
  x.lineTo(36, 80);
  x.lineTo(-36, 80);
  x.closePath();
  x.fill();
  x.restore();
}
function drawDelta(x, cx, cy, s, col) {
  x.save();
  x.translate(cx, cy);
  x.scale(s, s);
  x.fillStyle = col;
  x.beginPath();
  x.moveTo(0, -100);
  x.lineTo(92, 78);
  x.lineTo(-92, 78);
  x.closePath();
  x.fill();
  x.globalCompositeOperation = "destination-out";
  x.beginPath();
  x.moveTo(-58, 34);
  x.lineTo(58, 34);
  x.lineTo(50, 48);
  x.lineTo(-50, 48);
  x.closePath();
  x.fill();
  x.beginPath();
  x.moveTo(0, -54);
  x.lineTo(10, -34);
  x.lineTo(-10, -34);
  x.closePath();
  x.fill();
  x.globalCompositeOperation = "source-over";
  x.restore();
}
function teamFlagTex(team, w = 1024, h = 640) {
  let c, x;
  if (team === "ALPHA") {
    [c, x] = cv(w, h);
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#1d1f22");
    g.addColorStop(1, "#121315");
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  } else {
    [c, x] = camoCanvas(w, h, ["#6b6a4b", "#4d5536", "#8a7d58", "#3a3d2a", "#a39873", "#2c2d22"], 1.6);
  }
  for (let i = 0; i < h; i += 2) {
    x.fillStyle = `rgba(255,255,255,${sr(0.01, 0.03)})`;
    x.fillRect(0, i, w, 1);
  }
  for (let i = 0; i < w; i += 2) {
    x.fillStyle = `rgba(0,0,0,${sr(0.01, 0.03)})`;
    x.fillRect(i, 0, 1, h);
  }
  x.strokeStyle = team === "ALPHA" ? "rgba(230,232,236,.85)" : "rgba(30,32,24,.85)";
  x.lineWidth = h * 0.03;
  x.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
  const col = team === "ALPHA" ? "#e9eaec" : "#20241a";
  if (team === "ALPHA") drawAlpha(x, w * 0.5, h * 0.42, h * 26e-4, col);
  else {
    x.fillStyle = "rgba(20,22,16,.55)";
    x.beginPath();
    x.arc(w * 0.5, h * 0.42, h * 0.3, 0, 7);
    x.fill();
    drawDelta(x, w * 0.5, h * 0.43, h * 24e-4, "#9cc27a");
  }
  x.fillStyle = team === "ALPHA" ? "#e9eaec" : "#d9dccb";
  x.font = `700 ${Math.round(h * 0.105)}px "Segoe UI",Roboto,Arial,sans-serif`;
  x.textAlign = "center";
  x.textBaseline = "middle";
  const word = team.split("").join(String.fromCharCode(8202));
  x.fillText(word, w * 0.5, h * 0.83);
  for (let i = 0; i < 140; i++) {
    const px = srnd() * w, py = srnd() * h, r = sr(8, 70);
    const rg = x.createRadialGradient(px, py, 1, px, py, r);
    rg.addColorStop(0, `rgba(${si(110, 160)},${si(100, 150)},${si(80, 120)},${sr(0.02, 0.09)})`);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = rg;
    x.beginPath();
    x.arc(px, py, r, 0, 7);
    x.fill();
  }
  x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 30; i++) {
    const py = srnd() * h;
    x.beginPath();
    x.moveTo(w, py);
    x.lineTo(w - sr(4, 34), py + sr(-10, 10));
    x.lineTo(w, py + sr(6, 22));
    x.closePath();
    x.fill();
  }
  x.globalCompositeOperation = "source-over";
  grain(x, w, h, 0.035);
  return texOf(c);
}
function emblemDataURL(team, size = 128) {
  const [c, x] = cv(size, size);
  if (team === "ALPHA") drawAlpha(x, size / 2, size * 0.52, size * 42e-4, "#eceef0");
  else drawDelta(x, size / 2, size * 0.54, size * 42e-4, "#a9cf86");
  return c.toDataURL();
}
function decalAtlas(size = 1024) {
  const [c, x] = cv(size, size / 2);
  const S = size / 4;
  x.clearRect(0, 0, size, size / 2);
  const cell = (i, fn) => {
    x.save();
    x.translate(i % 4 * S + S / 2, Math.floor(i / 4) * S + S / 2);
    fn(S / 2);
    x.restore();
  };
  const woodHole = (R) => {
    for (let k = 0; k < 26; k++) {
      const a = sr(0, 6.283), l = sr(R * 0.18, R * 0.72), w = sr(1.5, 5);
      x.save();
      x.rotate(a);
      x.fillStyle = `rgba(${si(214, 238)},${si(186, 208)},${si(130, 156)},${sr(0.55, 0.95)})`;
      x.beginPath();
      x.moveTo(R * 0.08, -w);
      x.lineTo(l, 0);
      x.lineTo(R * 0.08, w);
      x.closePath();
      x.fill();
      x.restore();
    }
    const g = x.createRadialGradient(0, 0, 0, 0, 0, R * 0.42);
    g.addColorStop(0, "rgba(8,6,4,1)");
    g.addColorStop(0.45, "rgba(24,17,10,.98)");
    g.addColorStop(0.75, "rgba(90,64,36,.6)");
    g.addColorStop(1, "rgba(120,90,50,0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, R * 0.42, 0, 7);
    x.fill();
    x.fillStyle = "rgba(4,3,2,1)";
    x.beginPath();
    for (let k = 0; k <= 10; k++) {
      const a = k / 10 * 6.283, r = R * sr(0.1, 0.16);
      k ? x.lineTo(Math.cos(a) * r, Math.sin(a) * r) : x.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    x.fill();
  };
  cell(0, woodHole);
  cell(1, woodHole);
  cell(2, (R) => {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, R * 0.8);
    g.addColorStop(0, "rgba(30,30,30,1)");
    g.addColorStop(0.25, "rgba(70,68,64,.95)");
    g.addColorStop(0.5, "rgba(170,166,158,.6)");
    g.addColorStop(1, "rgba(200,196,188,0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, R * 0.8, 0, 7);
    x.fill();
    x.strokeStyle = "rgba(40,40,40,.6)";
    x.lineWidth = 1.2;
    for (let k = 0; k < 7; k++) {
      const a = sr(0, 6.28);
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(Math.cos(a) * R * sr(0.4, 0.8), Math.sin(a) * R * sr(0.4, 0.8));
      x.stroke();
    }
  });
  cell(3, (R) => {
    x.strokeStyle = "rgba(235,242,248,.9)";
    x.lineWidth = 1.4;
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * 6.283 + sr(-0.15, 0.15);
      let px = 0, py = 0;
      x.beginPath();
      x.moveTo(0, 0);
      for (let s = 0; s < 5; s++) {
        px += Math.cos(a + sr(-0.3, 0.3)) * R * 0.19;
        py += Math.sin(a + sr(-0.3, 0.3)) * R * 0.19;
        x.lineTo(px, py);
      }
      x.stroke();
    }
    for (let ring = 1; ring < 4; ring++) {
      x.beginPath();
      for (let k = 0; k <= 14; k++) {
        const a = k / 14 * 6.283, r = R * ring * 0.22 * sr(0.85, 1.1);
        k ? x.lineTo(Math.cos(a) * r, Math.sin(a) * r) : x.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      x.strokeStyle = `rgba(230,238,245,${0.7 - ring * 0.15})`;
      x.stroke();
    }
    x.fillStyle = "rgba(20,24,28,.95)";
    x.beginPath();
    x.arc(0, 0, R * 0.06, 0, 7);
    x.fill();
  });
  cell(4, (R) => {
    for (let k = 0; k < 40; k++) {
      const a = sr(0, 6.283), d = sr(0, R * 0.6), r = sr(R * 0.15, R * 0.45);
      const g = x.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, r);
      g.addColorStop(0, `rgba(12,10,9,${sr(0.25, 0.5)})`);
      g.addColorStop(1, "rgba(12,10,9,0)");
      x.fillStyle = g;
      x.beginPath();
      x.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, 7);
      x.fill();
    }
    for (let k = 0; k < 30; k++) {
      const a = sr(0, 6.283);
      x.strokeStyle = `rgba(14,12,10,${sr(0.15, 0.4)})`;
      x.lineWidth = sr(2, 7);
      x.beginPath();
      x.moveTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3);
      x.lineTo(Math.cos(a) * R * sr(0.7, 0.98), Math.sin(a) * R * sr(0.7, 0.98));
      x.stroke();
    }
  });
  cell(5, (R) => {
    const g = x.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 0.95);
    g.addColorStop(0, "rgba(5,4,3,1)");
    g.addColorStop(0.5, "rgba(22,15,9,.9)");
    g.addColorStop(0.8, "rgba(60,38,20,.45)");
    g.addColorStop(1, "rgba(60,38,20,0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, R * 0.95, 0, 7);
    x.fill();
  });
  cell(6, (R) => {
    x.fillStyle = "rgba(60,58,54,.9)";
    x.beginPath();
    for (let k = 0; k <= 12; k++) {
      const a = k / 12 * 6.283, r = R * sr(0.3, 0.6);
      k ? x.lineTo(Math.cos(a) * r, Math.sin(a) * r) : x.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    x.fill();
    const g = x.createRadialGradient(0, 0, R * 0.3, 0, 0, R);
    g.addColorStop(0, "rgba(190,186,176,.5)");
    g.addColorStop(1, "rgba(190,186,176,0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, R, 0, 7);
    x.fill();
  });
  cell(7, (R) => {
    for (let k = 0; k < 60; k++) {
      const a = sr(0, 6.283), d = sr(0, R * 0.9);
      x.fillStyle = `rgba(16,14,12,${sr(0.2, 0.6)})`;
      x.beginPath();
      x.arc(Math.cos(a) * d, Math.sin(a) * d, sr(1, 5), 0, 7);
      x.fill();
    }
  });
  return texOf(c);
}
function craterMaps(size = 512) {
  const [c, x] = cv(size, size), [h, hx] = cv(size, size);
  const C = size / 2;
  x.clearRect(0, 0, size, size);
  hx.fillStyle = "rgb(128,128,128)";
  hx.fillRect(0, 0, size, size);
  const img = hx.getImageData(0, 0, size, size), d = img.data;
  const ph = [sr(0, 6), sr(0, 6), sr(0, 6)];
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const dx = (px - C) / C, dy = (py - C) / C, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const wob = 1 + 0.08 * Math.sin(a * 5 + ph[0]) + 0.05 * Math.sin(a * 11 + ph[1]) + 0.03 * Math.sin(a * 23 + ph[2]);
    const rr = r / wob;
    let hv = 0;
    if (rr < 0.55) hv = -Math.cos(rr / 0.55 * Math.PI / 2) * 0.9;
    else if (rr < 0.8) hv = Math.sin((rr - 0.55) / 0.25 * Math.PI) * 0.35;
    hv += (Math.random() - 0.5) * 0.12;
    const v = clamp(128 + hv * 110, 0, 255), i = (py * size + px) * 4;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  hx.putImageData(img, 0, 0);
  for (let k = 0; k < 50; k++) {
    const a = sr(0, 6.283), dd = sr(0, C * 0.5), r = sr(C * 0.1, C * 0.35);
    const g2 = x.createRadialGradient(C + Math.cos(a) * dd, C + Math.sin(a) * dd, 0, C + Math.cos(a) * dd, C + Math.sin(a) * dd, r);
    g2.addColorStop(0, `rgba(${si(40, 70)},${si(38, 64)},${si(34, 58)},${sr(0.5, 0.8)})`);
    g2.addColorStop(1, "rgba(40,38,34,0)");
    x.fillStyle = g2;
    x.beginPath();
    x.arc(C + Math.cos(a) * dd, C + Math.sin(a) * dd, r, 0, 7);
    x.fill();
  }
  for (let k = 0; k < 80; k++) {
    const a = sr(0, 6.283), dd = C * sr(0.45, 0.85);
    x.fillStyle = `rgba(${si(120, 170)},${si(116, 164)},${si(108, 154)},${sr(0.5, 0.9)})`;
    x.beginPath();
    x.arc(C + Math.cos(a) * dd, C + Math.sin(a) * dd, sr(2, 7), 0, 7);
    x.fill();
  }
  for (let k = 0; k < 36; k++) {
    const a = sr(0, 6.283);
    x.strokeStyle = `rgba(14,12,10,${sr(0.12, 0.35)})`;
    x.lineWidth = sr(3, 10);
    x.beginPath();
    x.moveTo(C + Math.cos(a) * C * 0.4, C + Math.sin(a) * C * 0.4);
    x.lineTo(C + Math.cos(a) * C * sr(0.75, 1), C + Math.sin(a) * C * sr(0.75, 1));
    x.stroke();
  }
  const g = x.createRadialGradient(C, C, 0, C, C, C * 0.3);
  g.addColorStop(0, "rgba(10,9,8,.85)");
  g.addColorStop(1, "rgba(10,9,8,0)");
  x.fillStyle = g;
  x.beginPath();
  x.arc(C, C, C * 0.3, 0, 7);
  x.fill();
  const im = x.getImageData(0, 0, size, size), q = im.data;
  for (let i = 3; i < q.length; i += 4) {
    const p = (i - 3) / 4, px = p % size, py = Math.floor(p / size);
    const r = Math.hypot(px - C, py - C) / C;
    q[i] = q[i] * clamp((1 - r) / 0.18, 0, 1);
  }
  x.putImageData(im, 0, 0);
  const nrm = heightToNormal(h, 6);
  return { map: texOf(c), normal: texOf(nrm, false) };
}
function flameTex(size = 128) {
  const [c, x] = cv(size, size);
  const img = x.createImageData(size, size), d = img.data;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const u = (px / size - 0.5) * 2, v = py / size;
    const w = 0.25 + 0.75 * Math.pow(v, 0.7);
    const r = Math.abs(u) / w;
    let a = clamp(1 - r, 0, 1) * smoothstepJS(0, 0.35, v) * smoothstepJS(1, 0.72, v);
    a = Math.pow(a, 1.3);
    const i = (py * size + px) * 4;
    d[i] = 255;
    d[i + 1] = Math.round(150 + 105 * a);
    d[i + 2] = Math.round(60 + 150 * a * a);
    d[i + 3] = Math.round(255 * a);
  }
  x.putImageData(img, 0, 0);
  return texOf(c);
}
function smoothstepJS(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function smokeTex(size = 128) {
  const [c, x] = cv(size, size);
  const C = size / 2;
  for (let k = 0; k < 22; k++) {
    const a = sr(0, 6.283), dd = sr(0, C * 0.42), r = sr(C * 0.25, C * 0.55);
    const g = x.createRadialGradient(C + Math.cos(a) * dd, C + Math.sin(a) * dd, 0, C + Math.cos(a) * dd, C + Math.sin(a) * dd, r);
    g.addColorStop(0, "rgba(255,255,255,.22)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(C + Math.cos(a) * dd, C + Math.sin(a) * dd, r, 0, 7);
    x.fill();
  }
  return texOf(c);
}
function glowTex(size = 64) {
  const [c, x] = cv(size, size);
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,240,200,.8)");
  g.addColorStop(1, "rgba(255,200,120,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return texOf(c);
}
function gratingMaps(size = 256) {
  const [c, x] = cv(size, size), [h, hx] = cv(size, size);
  x.fillStyle = "#000";
  x.fillRect(0, 0, size, size);
  hx.fillStyle = "#000";
  hx.fillRect(0, 0, size, size);
  const n = 8, s = size / n;
  for (let i = 0; i <= n; i++) {
    x.fillStyle = "#5b5752";
    x.fillRect(i * s - 3, 0, 6, size);
    hx.fillStyle = "#fff";
    hx.fillRect(i * s - 3, 0, 6, size);
  }
  for (let j = 0; j <= n * 2; j++) {
    x.fillStyle = "#4e4a45";
    x.fillRect(0, j * s / 2 - 1.5, size, 3);
    hx.fillStyle = "#ccc";
    hx.fillRect(0, j * s / 2 - 1.5, size, 3);
  }
  for (let k = 0; k < 400; k++) {
    x.fillStyle = `rgba(${si(90, 130)},${si(50, 70)},${si(30, 40)},${sr(0.1, 0.4)})`;
    x.fillRect(srnd() * size, srnd() * size, sr(1, 4), sr(1, 4));
  }
  const alpha = x.getImageData(0, 0, size, size);
  const hd = hx.getImageData(0, 0, size, size).data;
  for (let i = 0; i < alpha.data.length; i += 4) alpha.data[i + 3] = hd[i] > 20 ? 255 : 0;
  x.putImageData(alpha, 0, 0);
  return { albedo: c, height: h };
}
function fabricMaps(size, base2, weave, dirt) {
  const [c, x] = cv(size, size), [h, hx] = cv(size, size);
  x.fillStyle = `rgb(${base2[0]},${base2[1]},${base2[2]})`;
  x.fillRect(0, 0, size, size);
  hx.fillStyle = "#808080";
  hx.fillRect(0, 0, size, size);
  const n = weave, s = size / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const over = (i + j) % 2 === 0;
    const g = hx.createLinearGradient(i * s, j * s, over ? (i + 1) * s : i * s, over ? j * s : (j + 1) * s);
    g.addColorStop(0, "#5a5a5a");
    g.addColorStop(0.5, "#d8d8d8");
    g.addColorStop(1, "#5a5a5a");
    hx.fillStyle = g;
    hx.fillRect(i * s + 0.5, j * s + 0.5, s - 1, s - 1);
    const k = 0.9 + rnd2() * 0.2;
    x.fillStyle = `rgba(${base2[0] * k | 0},${base2[1] * k | 0},${base2[2] * k | 0},0.6)`;
    x.fillRect(i * s, j * s, s, s);
  }
  wrapDraw(x, size, () => {
    for (let i = 0; i < dirt; i++) {
      const px = rnd2() * size, py = rnd2() * size, r = size * (0.04 + rnd2() * 0.16);
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      const d = rnd2() < 0.6;
      g.addColorStop(0, d ? "rgba(52,44,30,.28)" : "rgba(210,200,170,.18)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g;
      x.fillRect(px - r, py - r, r * 2, r * 2);
    }
  });
  grain(x, size, size, 0.05);
  return { albedo: c, height: h };
}
function hescoBulgeMaps(size, cells) {
  const [c, x] = cv(size, size), [h, hx] = cv(size, size);
  x.fillStyle = "#8f8466";
  x.fillRect(0, 0, size, size);
  hx.fillStyle = "#000";
  hx.fillRect(0, 0, size, size);
  const s = size / cells;
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    const g = hx.createRadialGradient((i + 0.5) * s, (j + 0.5) * s, 0, (i + 0.5) * s, (j + 0.5) * s, s * 0.62);
    g.addColorStop(0, "#fff");
    g.addColorStop(1, "#222");
    hx.fillStyle = g;
    hx.fillRect(i * s, j * s, s, s);
    const k = 0.92 + rnd2() * 0.16;
    x.fillStyle = `rgba(${143 * k | 0},${132 * k | 0},${102 * k | 0},.5)`;
    x.fillRect(i * s, j * s, s, s);
  }
  for (let i = 0; i < 60; i++) {
    x.fillStyle = `rgba(70,58,40,${0.05 + rnd2() * 0.1})`;
    x.fillRect(rnd2() * size, size * 0.55 + rnd2() * size * 0.45, 1 + rnd2() * 3, 8 + rnd2() * 40);
  }
  grain(x, size, size, 0.05);
  return { albedo: c, height: h };
}
function buildFabricMaterials() {
  const bag = fabricMaps(TS(256), [120, 112, 80], 24, 18);
  M.sandbag = new THREE.MeshStandardMaterial({
    map: T(bag.albedo, 2, 1),
    normalMap: T(heightToNormal(bag.height, 1.6), 2, 1, false),
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.96,
    metalness: 0,
    envMapIntensity: 0.35
  });
  const hb = hescoBulgeMaps(TS(256), 8);
  M.hesco = new THREE.MeshStandardMaterial({
    map: T(hb.albedo, 1.7, 2.2),
    normalMap: T(heightToNormal(hb.height, 3.2), 1.7, 2.2, false),
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.95,
    metalness: 0,
    envMapIntensity: 0.3
  });
}
var MAPS = {};
var M = {};
function buildMaterials() {
  const mk = (maps, rep, normScale, opts = {}) => {
    const albedo = T(maps.albedo, rep[0], rep[1]);
    const normal = T(heightToNormal(maps.height, opts.hStrength ?? 2.4), rep[0], rep[1], false);
    const roughMap = maps.rough ? T(maps.rough, rep[0], rep[1], false) : null;
    const aoMap = T(heightToAO(maps.height, opts.aoPower ?? 1), rep[0], rep[1], false);
    const mat = new THREE.MeshStandardMaterial({
      map: albedo,
      normalMap: normal,
      normalScale: new THREE.Vector2(normScale, normScale),
      roughnessMap: roughMap,
      aoMap,
      aoMapIntensity: opts.ao ?? 0.85,
      roughness: opts.rough ?? 0.92,
      metalness: opts.metal ?? 0,
      side: opts.side ?? THREE.FrontSide,
      envMapIntensity: opts.env ?? 0.55
    });
    return mat;
  };
  MAPS.osb = osbMaps(TS(1024), 1);
  MAPS.osb2 = osbMaps(TS(1024), 0.92);
  MAPS.conc = concreteMaps(TS(768));
  MAPS.wood = lumberMaps(TS(768));
  MAPS.corr = corrugatedMaps(TS(512), 0.45, [124, 118, 110], 7);
  MAPS.roof = corrugatedMaps(TS(512), 0.3, [138, 137, 132], 6);
  MAPS.steel = steelMaps(TS(512), [112, 106, 98]);
  MAPS.panel = panelMaps(TS(768));
  MAPS.hazard = hazardMaps(256);
  M.osb = mk(MAPS.osb, [1, 1], 1.05, { rough: 1, hStrength: 2.2, ao: 0.95, env: 0.28 });
  M.osb2 = mk(MAPS.osb2, [1, 1], 1.05, { rough: 1, hStrength: 2.2, ao: 0.95, env: 0.28 });
  M.conc = mk(MAPS.conc, [1, 1], 0.8, { rough: 1, ao: 0.95, env: 0.22, aoPower: 1.15 });
  M.wood = mk(MAPS.wood, [1, 1], 0.5, { rough: 1, ao: 0.75, env: 0.28, hStrength: 1.2 });
  M.corr = mk(MAPS.corr, [1, 1], 1.2, { rough: 1, metal: 0.25, side: THREE.DoubleSide, env: 1, ao: 0.6 });
  M.roof = mk(MAPS.roof, [1, 1], 1.15, { rough: 1, metal: 0.15, side: THREE.DoubleSide, env: 0.6, ao: 0.55 });
  M.roof.color.setRGB(0.78, 0.78, 0.76);
  M.steel = mk(MAPS.steel, [1, 1], 0.95, { rough: 1, metal: 0.35, env: 1, ao: 0.6 });
  M.panel = mk(MAPS.panel, [1, 1], 0.95, { rough: 1, ao: 0.95, env: 0.25, aoPower: 1.1 });
  M.hazard = mk(MAPS.hazard, [1, 1], 0.9, { rough: 1, metal: 0.28, env: 0.8, ao: 0.7 });
  M.dark = new THREE.MeshStandardMaterial({ color: 4867647, roughness: 0.7, metalness: 0.3, envMapIntensity: 1.1 });
  M.darker = new THREE.MeshStandardMaterial({ color: 2499360, roughness: 0.78, metalness: 0.45 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 1710877, roughness: 0.94, metalness: 0.03 });
  M.plastO = new THREE.MeshStandardMaterial({ color: 10245940, roughness: 0.66, metalness: 0.05 });
  M.plastB = new THREE.MeshStandardMaterial({ color: 3822704, roughness: 0.66, metalness: 0.06 });
  M.paintG = new THREE.MeshStandardMaterial({ color: 5134918, roughness: 0.68, metalness: 0.22 });
  M.paintY = new THREE.MeshStandardMaterial({ color: 11045452, roughness: 0.66, metalness: 0.25 });
  M.glass = new THREE.MeshStandardMaterial({
    color: 12898262,
    roughness: 0.46,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.78,
    emissive: 14212836,
    emissiveIntensity: 0.42,
    map: T(dirtyGlassMaps(TS(256)), 1, 1)
  });
  M.tarp = new THREE.MeshStandardMaterial({ color: 5528146, roughness: 0.92, side: THREE.DoubleSide });
  M.foam = new THREE.MeshStandardMaterial({ color: 12433060, roughness: 0.97 });
  M.cable = new THREE.MeshStandardMaterial({ color: 2237222, roughness: 0.82 });
  M.dirt = new THREE.MeshStandardMaterial({ color: 6971732, roughness: 0.98 });
  const carPaint = (col) => new THREE.MeshStandardMaterial({
    color: col,
    roughness: 0.42,
    metalness: 0.42,
    envMapIntensity: 1.15
  });
  M.carRed = carPaint(8203302);
  M.carBlue = carPaint(2900567);
  M.carWhite = carPaint(10132116);
  M.carSand = carPaint(9075282);
  M.carGreen = carPaint(4147768);
  M.carBlack = carPaint(1974050);
  M.carGlass = new THREE.MeshStandardMaterial({
    color: 2765112,
    roughness: 0.16,
    metalness: 0.2,
    envMapIntensity: 1.6,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide
  });
  M.chrome = new THREE.MeshStandardMaterial({ color: 11843772, roughness: 0.24, metalness: 0.92, envMapIntensity: 1.6 });
  M.lightRed = new THREE.MeshStandardMaterial({
    color: 9183516,
    roughness: 0.22,
    metalness: 0.1,
    emissive: 3803142,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.9
  });
  M.lightAmb = new THREE.MeshStandardMaterial({
    color: 11695646,
    roughness: 0.22,
    metalness: 0.1,
    emissive: 4533254,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.9
  });
  M.headlamp = new THREE.MeshStandardMaterial({
    color: 13620178,
    roughness: 0.12,
    metalness: 0.35,
    emissive: 2303530,
    emissiveIntensity: 0.3,
    envMapIntensity: 1.8
  });
  M.heliBody = new THREE.MeshStandardMaterial({ color: 3621946, roughness: 0.5, metalness: 0.38, envMapIntensity: 1.1 });
  M.heliTrim = new THREE.MeshStandardMaterial({ color: 10107426, roughness: 0.52, metalness: 0.3 });
  M.heliGlass = new THREE.MeshStandardMaterial({
    color: 8819868,
    roughness: 0.1,
    metalness: 0.05,
    envMapIntensity: 1.5,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  });
  M.flag = new THREE.MeshStandardMaterial({
    map: flagTex(TS(512), TS(320)),
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.35
  });
  M.helipad = new THREE.MeshStandardMaterial({
    map: helipadTex(TS(1024)),
    roughness: 0.93,
    metalness: 0.03,
    envMapIntensity: 0.3
  });
  M.parkLine = new THREE.MeshStandardMaterial({
    map: parkingTex(TS(1024)),
    transparent: true,
    depthWrite: false,
    roughness: 0.92,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });
}
var _matCache = /* @__PURE__ */ new Map();
function cmat(color, o = {}) {
  const key = color + "|" + JSON.stringify(o);
  let m = _matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial(Object.assign({ color }, o));
    _matCache.set(key, m);
  }
  return m;
}
var BURN_U = { uTime: { value: 0 } };
function makeBurnable(mat) {
  mat.userData.burnable = true;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = BURN_U.uTime;
    sh.uniforms.uGrime = { value: mat.userData.grime ? 1 : 0 };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>
        attribute vec2 aBurn; varying vec2 vBurn; varying vec3 vBurnPos;`).replace("#include <begin_vertex>", `#include <begin_vertex>
        vBurn = aBurn; vBurnPos = (modelMatrix*vec4(transformed,1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
        uniform float uTime, uGrime; varying vec2 vBurn; varying vec3 vBurnPos;
        float bh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
        float bnoise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(bh(i),bh(i+vec3(1,0,0)),f.x), mix(bh(i+vec3(0,1,0)),bh(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(bh(i+vec3(0,0,1)),bh(i+vec3(1,0,1)),f.x), mix(bh(i+vec3(0,1,1)),bh(i+vec3(1,1,1)),f.x),f.y), f.z); }
        // «крокодиловая кожа» угля: расстояние до границы ячеек Вороного
        float cracks(vec3 p){ vec3 i=floor(p), f=fract(p); float d1=8.0, d2=8.0;
          for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++){
            vec3 g=vec3(x,y,z); vec3 o=vec3(bh(i+g),bh(i+g+7.1),bh(i+g+3.3));
            float d=length(g+o-f); if(d<d1){d2=d1;d1=d;} else if(d<d2) d2=d; }
          return d2-d1; }`).replace("#include <map_fragment>", `#include <map_fragment>
        if(uGrime > 0.5){
          // обшивка: крупные пятна тона ломают повтор текстуры, у пола — грязь
          // и брызги, по листам — редкие вертикальные подтёки
          float gM = bnoise(vBurnPos*0.45)*0.6 + bnoise(vBurnPos*1.7)*0.4;
          diffuseColor.rgb *= 0.82 + 0.34*gM;
          float gY = vBurnPos.y < ${(F2 - 0.15).toFixed(3)} ? vBurnPos.y : vBurnPos.y - ${F2.toFixed(3)};
          float gN = bnoise(vec3(vBurnPos.x*3.1, vBurnPos.y*1.4, vBurnPos.z*3.1));
          float gGround = 1.0 - smoothstep(0.0, 0.35 + 0.45*gN, gY);
          float gStreak = smoothstep(0.6, 0.85, bnoise(vec3(vBurnPos.x*7.0, vBurnPos.y*0.22, vBurnPos.z*7.0)))
                        * smoothstep(0.4, 0.75, bnoise(vBurnPos*0.55 + 3.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(0.55,0.5,0.44), clamp(gGround*0.8 + gStreak*0.4, 0.0, 0.85));
        }
        float bN = bnoise(vBurnPos*5.0)*0.6 + bnoise(vBurnPos*17.0)*0.4;
        float bChar = clamp(vBurn.x*1.25 + (bN-0.5)*0.35, 0.0, 1.0);
        float bScorch = smoothstep(0.02, 0.35, bChar);
        float bBlack = smoothstep(0.35, 0.8, bChar);
        float bCr = cracks(vBurnPos*vec3(9.0,4.5,9.0));
        vec3 scorchCol = diffuseColor.rgb*vec3(0.52,0.36,0.22);
        vec3 charCol = mix(vec3(0.028,0.024,0.021), vec3(0.075,0.066,0.058), smoothstep(0.02,0.14,bCr));
        diffuseColor.rgb = mix(diffuseColor.rgb, scorchCol, bScorch);
        diffuseColor.rgb = mix(diffuseColor.rgb, charCol, bBlack);`).replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.97, bScorch);`).replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        float bHeat = vBurn.y * bBlack;
        float bFl = 0.65 + 0.35*sin(uTime*7.0 + bN*20.0)*sin(uTime*3.1 + bN*9.0);
        // светятся только тонкие трещины угля, и то пятнами — сплошной «лавы» нет
        float bPatch = smoothstep(0.35, 0.75, bnoise(vBurnPos*3.0 + uTime*0.15));
        float bEmb = (1.0 - smoothstep(0.0, 0.045, bCr)) * bHeat * bFl * (0.25 + 0.75*bPatch);
        totalEmissiveRadiance += vec3(1.0,0.30,0.05) * (bEmb*3.2 + bHeat*bHeat*0.06*bFl);`);
  };
  mat.customProgramCacheKey = () => "burn1";
  return mat;
}
var FX = {};
function buildExtraMaterials() {
  M.osb.color.setRGB(0.9, 0.86, 0.8);
  M.osb2.color.setRGB(0.84, 0.8, 0.74);
  M.wood.color.setRGB(0.82, 0.76, 0.68);
  for (const m of [M.osb, M.osb2, M.wood]) {
    m.envMapIntensity = 0.12;
  }
  M.osb.userData.grime = M.osb2.userData.grime = true;
  makeBurnable(M.osb);
  makeBurnable(M.osb2);
  makeBurnable(M.wood);
  M.woodDark = makeBurnable(M.wood.clone());
  M.woodDark.color = new THREE.Color(9075298);
  M.plywood = makeBurnable(M.osb.clone());
  M.plywood.color = new THREE.Color(13219731);
  M.plywood.userData.grime = true;
  M.flagAlpha = new THREE.MeshStandardMaterial({
    map: teamFlagTex("ALPHA", TS(1024), TS(640)),
    roughness: 0.9,
    side: THREE.DoubleSide,
    alphaTest: 0.4
  });
  M.flagDelta = new THREE.MeshStandardMaterial({
    map: teamFlagTex("DELTA", TS(1024), TS(640)),
    roughness: 0.92,
    side: THREE.DoubleSide,
    alphaTest: 0.4
  });
  const gr = gratingMaps(256);
  const grA = T(gr.albedo, 1, 1);
  M.grating = new THREE.MeshStandardMaterial({
    map: grA,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    normalMap: T(heightToNormal(gr.height, 3), 1, 1, false),
    roughness: 0.62,
    metalness: 0.55,
    envMapIntensity: 0.9
  });
  M.hesco = new THREE.MeshStandardMaterial({ color: 9405542, roughness: 0.96, metalness: 0 });
  M.hescoMesh = new THREE.MeshStandardMaterial({
    map: grA,
    alphaTest: 0.5,
    color: 11578532,
    roughness: 0.5,
    metalness: 0.7,
    side: THREE.DoubleSide
  });
  M.sand = new THREE.MeshStandardMaterial({ color: 9206876, roughness: 1 });
  M.sandbag = new THREE.MeshStandardMaterial({ color: 7827535, roughness: 0.97 });
  M.teamA = new THREE.MeshStandardMaterial({ color: 2763824, roughness: 0.6, metalness: 0.35 });
  M.teamD = new THREE.MeshStandardMaterial({ color: 5200442, roughness: 0.7, metalness: 0.2 });
  const [cc] = camoCanvas(512, 512, ["#6b6a4b", "#4d5536", "#8a7d58", "#3a3d2a", "#a39873"], 0.9);
  M.camo = new THREE.MeshStandardMaterial({ map: texOf(cc), roughness: 0.95 });
  M.stripeA = new THREE.MeshStandardMaterial({ color: 14212578, roughness: 0.6, emissive: 10138840, emissiveIntensity: 0 });
  M.stripeD = new THREE.MeshStandardMaterial({ color: 10273402, roughness: 0.6, emissive: 8040524, emissiveIntensity: 0 });
  FX.decalTex = decalAtlas(TS(1024));
  M.decal = new THREE.MeshStandardMaterial({
    map: FX.decalTex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    roughness: 0.95,
    alphaTest: 0.02
  });
  const cr = craterMaps(TS(512));
  M.crater = new THREE.MeshStandardMaterial({
    map: cr.map,
    normalMap: cr.normal,
    normalScale: new THREE.Vector2(2.2, 2.2),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    roughness: 1
  });
  M.concChunk = M.conc;
  M.ember = new THREE.MeshStandardMaterial({ color: 1709330, roughness: 1, emissive: 16734740, emissiveIntensity: 1.6 });
  FX.flame = flameTex(128);
  FX.smoke = smokeTex(128);
  FX.glow = glowTex(64);
  FX.flameAtlas = flameAtlas(Q.tex >= 0.75 ? 128 : 64);
  FX.smokeAtlas = smokeAtlas(Q.tex >= 0.75 ? 128 : 96);
}
function buildAllMaterials() {
  buildMaterials();
  buildExtraMaterials();
  globalThis.GImpactSurfaces?.tagTable(M);
}
var BUCKET = /* @__PURE__ */ new Map();
var COLLIDERS = [];
var bucket = (k) => {
  if (!BUCKET.has(k)) BUCKET.set(k, []);
  return BUCKET.get(k);
};
var _m4 = new THREE.Matrix4();
var _q = new THREE.Quaternion();
var _e$1 = new THREE.Euler();
var _v = new THREE.Vector3();
function surfOf(matKey) {
  if (!matKey) return "conc";
  if (/osb|wood|ply/i.test(matKey)) return "wood";
  if (/steel|dark|corr|roof|grating|hazard|chrome|teamA|teamD/i.test(matKey)) return "metal";
  if (/sand|bag|hesco|tarp|dirt/i.test(matKey)) return "sand";
  if (/glass/i.test(matKey)) return "glass";
  return "conc";
}
function uvBox(g, sx, sy, sz, d, alignGrain) {
  const uv = g.attributes.uv;
  const s = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    let u = uv.getX(k) * s[f][0] * d, v = uv.getY(k) * s[f][1] * d;
    if (alignGrain && s[f][1] > s[f][0]) {
      const t = u;
      u = v;
      v = t;
    }
    uv.setXY(k, u, v);
  }
  uv.needsUpdate = true;
}
function tintGeo(g, r, gg, b) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = r;
    col[i * 3 + 1] = gg;
    col[i * 3 + 2] = b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
function addBox(mat, cx, cy, cz, sx, sy, sz, o = {}) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  uvBox(g, sx, sy, sz, o.d ?? 0.5, o.grain);
  if (o.rotY || o.rotX || o.rotZ) {
    _e$1.set(o.rotX || 0, o.rotY || 0, o.rotZ || 0, o.order || "XYZ");
    _q.setFromEuler(_e$1);
  } else _q.identity();
  _m4.compose(_v.set(cx, cy, cz), _q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(_m4);
  if (o.tint) tintGeo(g, o.tint[0], o.tint[1], o.tint[2]);
  bucket(mat).push(g);
  if (o.collide !== false) {
    addOBB(cx, cy, cz, sx, sy, sz, o.rotY || o.rotX || o.rotZ ? _q.clone() : null, o.surf || surfOf(mat), o);
  }
  return g;
}
function addOBB(cx, cy, cz, sx, sy, sz, q = null, surf = "conc", extra = {}) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const c = { cx, cy, cz, hx, hy, hz, q: q ? [q.x, q.y, q.z, q.w] : null, surf };
  if (extra.noPlayer) c.noPlayer = true;
  if (extra.playerOnly) c.playerOnly = true;
  if (q) {
    const m = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q)).elements;
    const ex = Math.abs(m[0]) * hx + Math.abs(m[3]) * hy + Math.abs(m[6]) * hz;
    const ey = Math.abs(m[1]) * hx + Math.abs(m[4]) * hy + Math.abs(m[7]) * hz;
    const ez = Math.abs(m[2]) * hx + Math.abs(m[5]) * hy + Math.abs(m[8]) * hz;
    Object.assign(c, { x0: cx - ex, y0: cy - ey, z0: cz - ez, x1: cx + ex, y1: cy + ey, z1: cz + ez });
  } else Object.assign(c, { x0: cx - hx, y0: cy - hy, z0: cz - hz, x1: cx + hx, y1: cy + hy, z1: cz + hz });
  COLLIDERS.push(c);
  return c;
}
function addAABB(cx, cy, cz, sx, sy, sz, rotY = 0, surf = "conc") {
  return addOBB(cx, cy, cz, sx, sy, sz, rotY ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY) : null, surf);
}
function normCollider(c) {
  if (c.hx !== void 0) return c;
  c.cx = (c.x0 + c.x1) / 2;
  c.cy = (c.y0 + c.y1) / 2;
  c.cz = (c.z0 + c.z1) / 2;
  c.hx = (c.x1 - c.x0) / 2;
  c.hy = (c.y1 - c.y0) / 2;
  c.hz = (c.z1 - c.z0) / 2;
  c.q = null;
  c.surf = c.surf || "conc";
  return c;
}
function beamBetween(mat, a, b, w, h, o = {}) {
  const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
  const g = new THREE.BoxGeometry(w, h, len);
  uvBox(g, w, h, len, o.d ?? 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
  if (o.roll) {
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), o.roll));
  }
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
  if (o.tint) tintGeo(g, ...o.tint);
  bucket(mat).push(g);
  if (o.collide) addOBB(mid.x, mid.y, mid.z, w, h, len, q, o.surf || surfOf(mat));
  return g;
}
var BAKE_CELL = 60;
var PALETTE = /* @__PURE__ */ new Map();
function isPlainMat(m) {
  return m && m.type === "MeshStandardMaterial" && !m.map && !m.normalMap && !m.roughnessMap && !m.metalnessMap && !m.aoMap && !m.emissiveMap && !m.alphaMap && !m.transparent && !(m.alphaTest > 0) && m.emissive.getHex() === 0 && !m.userData.burnable && !m.userData.noPalette;
}
function paletteMat(m) {
  const rq = Math.round(m.roughness * 6) / 6, mq = m.metalness < 0.15 ? 0.05 : m.metalness < 0.6 ? 0.35 : 0.85;
  const key = [rq.toFixed(2), mq, m.side, m.userData.impactSurface || "concrete"].join("|");
  let pm = PALETTE.get(key);
  if (!pm) {
    pm = new THREE.MeshStandardMaterial({
      color: 16777215,
      roughness: rq,
      metalness: mq,
      envMapIntensity: mq > 0.5 ? 1.2 : 0.9,
      side: m.side,
      vertexColors: true
    });
    pm.name = "palette:" + key;
    pm.userData.impactSurface=m.userData.impactSurface;
    PALETTE.set(key, pm);
  }
  return pm;
}
function toPalette(e) {
  if (!isPlainMat(e.mat)) return;
  const g = e.geo, n = g.attributes.position.count, c = e.mat.color;
  const src = g.attributes.color, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = src ? src.getX(i) : 1, gg = src ? src.getY(i) : 1, b = src ? src.getZ(i) : 1;
    col[i * 3] = r * c.r;
    col[i * 3 + 1] = gg * c.g;
    col[i * 3 + 2] = b * c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  e.mat = paletteMat(e.mat);
}
var SHADOW_SRC = { front: [], double: [] };
var SMALL_CASTER = 0.22;
var KEEP = /* @__PURE__ */ new Set(["position", "normal", "uv", "color", "aBurn"]);
function unifyIndexing(list) {
  if (!list.some((g) => !g.index)) return list;
  return list.map((g) => {
    if (!g.index) return g;
    const out = g.toNonIndexed();
    out.userData = g.userData;
    return out;
  });
}
function normalizeAttrs(list, withColor, withBurn) {
  for (const g of list) {
    for (const k of Object.keys(g.attributes)) if (!KEEP.has(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (withColor && !g.attributes.color) tintGeo(g, 1, 1, 1);
    if (!withColor && g.attributes.color) g.deleteAttribute("color");
    if (withBurn && !g.attributes.aBurn) g.setAttribute("aBurn", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!withBurn && g.attributes.aBurn) g.deleteAttribute("aBurn");
  }
}
function bakeGroups(entries, tag) {
  for (const e of entries) {
    toPalette(e);
    if (e.cast) {
      e.geo.computeBoundingSphere();
      if (e.geo.boundingSphere.radius < SMALL_CASTER && !(e.geo.userData && e.geo.userData.onBaked)) e.cast = false;
    }
  }
  const needColor = /* @__PURE__ */ new Set();
  for (const e of entries) if (e.geo.attributes.color) needColor.add(e.mat.uuid);
  const cells = /* @__PURE__ */ new Map();
  const _c2 = new THREE.Vector3();
  for (const e of entries) {
    e.geo.computeBoundingSphere();
    _c2.copy(e.geo.boundingSphere.center);
    const grp = e.geo.userData && e.geo.userData.group || "";
    const key = e.mat.uuid + "|" + Math.floor(_c2.x / BAKE_CELL) + "|" + Math.floor((_c2.z + 45) / 90) + "|" + (e.cast ? 1 : 0) + (e.recv ? 1 : 0) + "|" + (e.order || 0) + "|" + grp;
    let c = cells.get(key);
    if (!c) {
      c = { mat: e.mat, cast: e.cast, recv: e.recv, order: e.order || 0, list: [] };
      cells.set(key, c);
    }
    c.list.push(e.geo);
  }
  let made = 0;
  for (const c of cells.values()) {
    const wc = needColor.has(c.mat.uuid);
    if (wc) c.mat.vertexColors = true;
    const wb = !!c.mat.userData.burnable;
    normalizeAttrs(c.list, wc, wb);
    c.list = unifyIndexing(c.list);
    let off = 0;
    const hooks = [];
    for (const g of c.list) {
      const n = g.attributes.position.count;
      if (g.userData && g.userData.onBaked) hooks.push([g.userData.onBaked, off, n]);
      off += n;
    }
    const merged = c.list.length === 1 ? c.list[0] : BGU.mergeGeometries(c.list, false);
    if (!merged) {
      console.warn("merge failed", c.mat.name);
      continue;
    }
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, c.mat);
    mesh.castShadow = c.cast;
    mesh.receiveShadow = c.recv;
    mesh.renderOrder = c.order;
    mesh.name = tag;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    scene.add(mesh);
    made++;
    if (c.cast && !hooks.length && !c.mat.alphaMap && !(c.mat.alphaTest > 0) && !c.mat.transparent) {
      const pg = new THREE.BufferGeometry();
      pg.setAttribute("position", merged.attributes.position);
      if (merged.index) pg.setIndex(merged.index);
      (c.mat.side === THREE.FrontSide ? SHADOW_SRC.front : SHADOW_SRC.double).push(pg);
      mesh.castShadow = false;
    }
    for (const [fn, start, count] of hooks) fn(mesh, start, count);
  }
  return made;
}
function flushBuckets() {
  globalThis.GImpactSurfaces?.tagTable(M);
  const entries = [];
  for (const [k, arr] of BUCKET) {
    const mat = M[k];
    if (!mat) {
      console.warn("no material", k);
      arr.length = 0;
      continue;
    }
    for (const g of arr) entries.push({ geo: g, mat, cast: !(g.userData && g.userData.noShadow), recv: true, order: 0 });
    arr.length = 0;
  }
  for (const e of PROP_BAKE) entries.push(e);
  PROP_BAKE.length = 0;
  return bakeGroups(entries, "baked_bucket");
}
function bakeScene() {
  const loose = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
    let p = o, skip = false;
    while (p) {
      if (p.userData && p.userData.nomerge) {
        skip = true;
        break;
      }
      p = p.parent;
    }
    if (skip) return;
    if (o.name === "sky" || o.name.startsWith("baked")) return;
    if (!o.geometry || !o.geometry.attributes.position) return;
    if (Array.isArray(o.material)) return;
    if (o.material.transparent && o.material.depthWrite === false) return;
    loose.push(o);
  });
  const entries = [];
  for (const o of loose) {
    o.updateWorldMatrix(true, false);
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    entries.push({ geo: g, mat: o.material, cast: o.castShadow, recv: o.receiveShadow, order: o.renderOrder });
  }
  for (const o of loose) {
    o.removeFromParent();
  }
  const empties = [];
  scene.traverse((o) => {
    if (o.isGroup && o.children.length === 0 && !o.userData.nomerge) empties.push(o);
  });
  for (const o of empties) {
    o.removeFromParent();
  }
  return bakeGroups(entries, "baked_loose");
}
function roundedBox(w, h, d, r = 0.12, seg = 3) {
  r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const p = g.attributes.position;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const cx = clamp(v.x, -hw, hw), cy = clamp(v.y, -hh, hh), cz = clamp(v.z, -hd, hd);
    const dx = v.x - cx, dy = v.y - cy, dz = v.z - cz;
    const l = Math.hypot(dx, dy, dz);
    if (l > 1e-6) p.setXYZ(i, cx + dx / l * r, cy + dy / l * r, cz + dz / l * r);
  }
  g.computeVertexNormals();
  return g;
}
function ensureColor(o) {
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  if (!o.geometry || o.geometry.attributes.color) return;
  if (mats.some((m) => m && m.vertexColors)) tintGeo(o.geometry, 1, 1, 1);
}
function ensureColorGeo(g, mat) {
  if (mat && mat.vertexColors && !g.attributes.color) tintGeo(g, 1, 1, 1);
}
var HW = 40;
var HD = 30;
var WALL_H = 5.6;
var EAVE = 9.2;
var RIDGE = 12.6;
var roofY = (z) => EAVE + (RIDGE - EAVE) * (1 - Math.abs(z) / HD);
var LAMPS = [];
var SUNHOLES = [];
var WINDOWS = [];
var FLOOR_TILES = [];
var COL_STEP = 7.5;
var COL_X = (() => {
  const out = [], n = Math.floor((HW - 4) / COL_STEP);
  for (let i = -n; i <= n; i++) out.push(i * COL_STEP);
  return out;
})();
function buildHangar() {
  for (let i = 0; i < Math.ceil(HW * 2 / 6); i++) for (let j = 0; j < Math.ceil(HD * 2 / 6); j++) {
    const x0 = -HW + i * 6, z0 = -HD + j * 6;
    const x1 = Math.min(x0 + 6, HW), z1 = Math.min(z0 + 6, HD);
    const rot = Math.floor(srnd() * 4) * Math.PI / 2, cs = Math.cos(rot), sn = Math.sin(rot);
    const ou = srnd() * 7, ov = srnd() * 7;
    FLOOR_TILES.push({ x0, z0, x1, z1, cs, sn, ou, ov });
    if (x1 < HW - 0.01) addBox("darker", x1, 4e-3, (z0 + z1) / 2, 0.035, 0.03, z1 - z0, { collide: false, d: 1 });
    if (z1 < HD - 0.01) addBox("darker", (x0 + x1) / 2, 4e-3, z1, x1 - x0, 0.03, 0.035, { collide: false, d: 1 });
  }
  COLLIDERS.push({ x0: -HW - 2, y0: -2, z0: -HD - 2, x1: HW + 2, y1: 0, z1: HD + 2 });
  const GLASS_Y0 = WALL_H, GLASS_H = 2.3;
  const wallSeg = (cx, cz, sx, sz) => {
    addBox("panel", cx, WALL_H / 2, cz, sx, WALL_H, sz, { d: 0.3 });
  };
  wallSeg(0, -HD, HW * 2 + 0.4, 0.44);
  wallSeg(0, HD, HW * 2 + 0.4, 0.44);
  for (const sx of [-1, 1]) {
    wallSeg(sx * HW, (-HD + 0.4) / 2, 0.44, HD + 0.4);
    wallSeg(sx * HW, (2 + HD) / 2, 0.44, HD - 2);
  }
  for (const s of [-1, 1]) {
    COLLIDERS.push({ x0: -HW - 0.3, y0: WALL_H, z0: s * HD - 0.25, x1: HW + 0.3, y1: EAVE, z1: s * HD + 0.25 });
    COLLIDERS.push({ x0: s * HW - 0.25, y0: WALL_H, z0: -HD - 0.3, x1: s * HW + 0.25, y1: EAVE, z1: HD + 0.3 });
  }
  function glazing(axis, sign) {
    const along = axis === "x" ? HW : HD;
    const n = axis === "x" ? Math.round(HW * 2 / 4.9) : Math.round(HD * 2 / 4.9);
    for (let i = 0; i < n; i++) {
      const t = -along + (i + 0.5) * (along * 2 / n);
      const wseg = along * 2 / n * 0.82;
      const px = axis === "x" ? t : sign * HW, pz = axis === "x" ? sign * HD : t;
      const yc = GLASS_Y0 + GLASS_H / 2;
      const g = new THREE.PlaneGeometry(wseg, GLASS_H);
      const m = new THREE.Mesh(g, M.glass);
      m.position.set(px, yc, pz);
      m.rotation.y = axis === "x" ? sign > 0 ? Math.PI : 0 : sign > 0 ? -Math.PI / 2 : Math.PI / 2;
      m.userData.glass = { w: wseg, h: GLASS_H };
      m.userData.nomerge = true;
      scene.add(m);
      WINDOWS.push({ pos: new THREE.Vector3(px, yc, pz), axis, sign, w: wseg, h: GLASS_H });
      const inw = axis === "x" ? 0 : -sign * 0.06, ind = axis === "x" ? -sign * 0.06 : 0;
      const cols = 5;
      for (let k = 0; k <= cols; k++) {
        const off = -wseg / 2 + k * wseg / cols;
        const bx = axis === "x" ? px + off : px + inw, bz = axis === "x" ? pz + ind : pz + off;
        addBox("dark", bx, yc, bz, axis === "x" ? 0.05 : 0.1, GLASS_H, axis === "x" ? 0.1 : 0.05, { collide: false, d: 1 });
      }
      for (const yy of [GLASS_Y0 + 0.02, GLASS_Y0 + GLASS_H - 0.02]) {
        const bx = axis === "x" ? px : px + inw, bz = axis === "x" ? pz + ind : pz;
        addBox("dark", bx, yy, bz, axis === "x" ? wseg : 0.1, 0.07, axis === "x" ? 0.1 : wseg, { collide: false, d: 1 });
      }
    }
    const topY0 = GLASS_Y0 + GLASS_H, topH = EAVE - topY0;
    {
      if (axis === "x") addBox("corr", 0, topY0 + topH / 2, sign * HD, HW * 2 + 0.4, topH, 0.3, { d: 0.45 });
      else addBox("corr", sign * HW, topY0 + topH / 2, 0, 0.3, topH, HD * 2, { d: 0.45 });
    }
  }
  glazing("x", -1);
  glazing("x", 1);
  glazing("z", -1);
  glazing("z", 1);
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-HD, EAVE);
    shape.lineTo(HD, EAVE);
    shape.lineTo(0, RIDGE);
    const g = new THREE.ShapeGeometry(shape);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.42, uv.getY(i) * 0.42);
    const m = new THREE.Mesh(g, M.corr);
    m.position.set(s * HW, 0, 0);
    m.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    for (const zz of [-HD * 0.5, 0, HD * 0.5]) {
      const top = roofY(zz);
      if (top - EAVE < 0.15) continue;
      addBox("steel", s * HW, (EAVE + top) / 2, zz, 0.2, top - EAVE, 0.14, { collide: false, d: 1.2 });
    }
  }
  for (const s of [-1, 1]) addBox("corr", 0, EAVE + 0.18, s * HD, HW * 2 + 0.4, 0.36, 0.3, { collide: false, d: 0.6 });
  const colX = COL_X;
  for (const cx of colX) {
    for (const cz of [-HD + 0.6, HD - 0.6]) {
      addBox("steel", cx, EAVE / 2, cz, 0.42, EAVE, 0.1, { d: 1.1 });
      addBox("steel", cx, EAVE / 2, cz - 0.14, 0.14, EAVE, 0.28, { collide: false, d: 1.1 });
      addBox("steel", cx, EAVE / 2, cz + 0.14, 0.14, EAVE, 0.28, { collide: false, d: 1.1 });
      addBox("dark", cx, 0.12, cz, 0.62, 0.24, 0.62, { d: 1.2 });
      addBox("steel", cx, EAVE - 0.5, cz + (cz < 0 ? 0.55 : -0.55), 0.3, 0.9, 1.3, { collide: false, d: 1 });
    }
  }
  for (const cx of colX) {
    const segs = Math.round(HD * 2 / 2.7);
    for (let i = 0; i < segs; i++) {
      const z0 = -HD + i * (HD * 2 / segs), z1 = -HD + (i + 1) * (HD * 2 / segs);
      const y0 = roofY(z0), y1 = roofY(z1);
      const len = Math.hypot(z1 - z0, y1 - y0);
      const g = new THREE.BoxGeometry(0.16, 0.2, len);
      uvBox(g, 0.16, 0.2, len, 1.2);
      _e$1.set(Math.atan2(y1 - y0, z1 - z0) * -1, 0, 0);
      _q.setFromEuler(_e$1);
      _m4.compose(new THREE.Vector3(cx, (y0 + y1) / 2 - 0.12, (z0 + z1) / 2), _q, new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(_m4);
      bucket("steel").push(g);
      const by = EAVE - 0.15;
      addBox("steel", cx, by, (z0 + z1) / 2, 0.14, 0.16, z1 - z0, { collide: false, d: 1.2 });
      const dy = (y0 + y1) / 2 - 0.2 - by;
      if (dy > 0.25) {
        addBox("steel", cx, by + dy / 2, (z0 + z1) / 2, 0.09, dy, 0.09, { collide: false, d: 1.2 });
        const dl = Math.hypot(dy, z1 - z0);
        const gd = new THREE.BoxGeometry(0.07, 0.07, dl);
        uvBox(gd, 0.07, 0.07, dl, 1.2);
        _e$1.set(Math.atan2(dy, z1 - z0) * -1, 0, 0);
        _q.setFromEuler(_e$1);
        _m4.compose(new THREE.Vector3(cx, by + dy / 2, (z0 + z1) / 2), _q, new THREE.Vector3(1, 1, 1));
        gd.applyMatrix4(_m4);
        bucket("steel").push(gd);
      }
    }
  }
  const purlinN = Math.round(HD * 2 / 2.1);
  for (let i = 0; i <= purlinN; i++) {
    const z = -HD + i * (HD * 2 / purlinN);
    addBox("steel", 0, roofY(z) - 0.3, z, HW * 2, 0.11, 0.13, { collide: false, d: 1.4 });
  }
  for (const cz of [-HD + 0.6, HD - 0.6]) addBox("steel", 0, EAVE - 0.15, cz, HW * 2, 0.18, 0.14, { collide: false, d: 1.4 });
}
var PITS = [];
var _fseed = 7331;
var frnd = () => {
  _fseed = _fseed * 1664525 + 1013904223 >>> 0;
  return _fseed / 4294967296;
};
var fr = (a, b) => a + frnd() * (b - a);
var PIT_SEG = 28;
function pitRadius(p, a) {
  const h = p.h;
  return p.R * (1 + h[0] * Math.sin(a * 3 + h[1]) + h[2] * Math.sin(a * 5 + h[3]) + h[4] * Math.sin(a * 11 + h[5]));
}
function pitProfile(f, kind) {
  if (kind === "crater") return Math.pow(Math.max(0, 1 - f * f), 0.85);
  return 1 - smoothstep(0.55, 1, f);
}
function floorDepthAt(x, z) {
  for (const p of PITS) {
    const dx = x - p.x, dz = z - p.z, d2 = dx * dx + dz * dz;
    if (d2 > p.Rmax * p.Rmax) continue;
    const f = Math.sqrt(d2) / pitRadius(p, Math.atan2(dz, dx));
    if (f < 1) return -p.depth * pitProfile(f, p.kind);
  }
  return 0;
}
function pitSpotFree(x, z, r, rHole) {
  if (Math.abs(x) > HW - 2.5 || Math.abs(z) > HD - 2.5) return false;
  if (Math.abs(x) < 16.4 && Math.abs(z) < 10.9) return false;
  if (Math.abs(x) > 31.2 && Math.abs(z) < 5.6) return false;
  if (Math.abs(Math.abs(x) - 27) < 3.2 && Math.abs(z) < 11.5) return false;
  for (const [hx, hz] of [[-21, 20.6], [21, -20.6]]) if (Math.hypot(x - hx, z - hz) < 7.6) return false;
  for (const d of DYN_PROPS) if (Math.hypot(x - d.mesh.position.x, z - d.mesh.position.z) < r + 1) return false;
  for (const p of PITS) if (Math.hypot(x - p.x, z - p.z) < r + p.Rmax + 1.2) return false;
  for (const c of COLLIDERS) {
    if (c.y0 > 2.2 || c.y1 < 0.05 || c.x1 - c.x0 > 30 || c.z1 - c.z0 > 30) continue;
    const qx = clamp(x, c.x0, c.x1), qz = clamp(z, c.z0, c.z1);
    if (Math.hypot(x - qx, z - qz) < r + 0.7) return false;
  }
  const tx = ((x + HW) % 6 + 6) % 6, tz = ((z + HD) % 6 + 6) % 6;
  return tx > rHole + 0.3 && tx < 6 - rHole - 0.3 && tz > rHole + 0.3 && tz < 6 - rHole - 0.3;
}
function placePits(kind, pairs, R0, R1, d0, d1) {
  for (let n = 0, tries = 0; n < pairs && tries < 1500; tries++) {
    const x = fr(-HW + 3, HW - 3), z = fr(-HD + 3, HD - 3), R = fr(R0, R1);
    const Rmax = R * (kind === "crater" ? 1.55 : 1.3), rHole = R * 1.25;
    if (!pitSpotFree(x, z, Rmax, rHole) || !pitSpotFree(-x, -z, Rmax, rHole)) continue;
    for (const s of [1, -1]) {
      PITS.push({
        kind,
        x: s * x,
        z: s * z,
        R,
        Rmax,
        depth: fr(d0, d1),
        h: [fr(0.05, 0.12), fr(0, 6.3), fr(0.03, 0.08), fr(0, 6.3), fr(0.015, 0.04), fr(0, 6.3)]
      });
    }
    n++;
  }
}
function floorDamageMaps(S) {
  const C = S / 2;
  const [c, x] = cv(S, S), [h, hx] = cv(S, S);
  x.clearRect(0, 0, S, S);
  hx.fillStyle = "rgb(128,128,128)";
  hx.fillRect(0, 0, S, S);
  const cell = (i, fn) => {
    const ox = i % 2 * C, oy = Math.floor(i / 2) * C;
    x.save();
    hx.save();
    x.translate(ox, oy);
    hx.translate(ox, oy);
    x.beginPath();
    x.rect(0, 0, C, C);
    x.clip();
    hx.beginPath();
    hx.rect(0, 0, C, C);
    hx.clip();
    fn(C / 2);
    x.restore();
    hx.restore();
  };
  const blob = (ctx, cx, cy, r, jag, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = k / 24 * 6.283, rr = r * (1 + (frnd() - 0.5) * jag);
      k ? ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  };
  const crackLine = (ctx, px, py, a, n, w, col) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px, py);
    for (let j = 0; j < n; j++) {
      a += fr(-0.45, 0.45);
      px += Math.cos(a) * fr(4, 10) * S / 512;
      py += Math.sin(a) * fr(4, 10) * S / 512;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    return [px, py, a];
  };
  cell(0, (m) => {
    for (let k = 0; k < 5; k++) {
      const g = hx.createRadialGradient(m, m, 0, m, m, m * 0.8);
      g.addColorStop(0, "rgba(70,70,70,.5)");
      g.addColorStop(0.7, "rgba(100,100,100,.35)");
      g.addColorStop(1, "rgba(128,128,128,0)");
      hx.fillStyle = g;
      hx.fillRect(0, 0, m * 2, m * 2);
    }
    blob(x, m, m, m * 0.62, 0.35, "rgba(92,88,82,.55)");
    blob(x, m, m, m * 0.42, 0.45, "rgba(70,67,62,.55)");
    for (let k = 0; k < 70; k++) {
      const a = fr(0, 6.28), r = m * fr(0.35, 0.72);
      x.fillStyle = `rgba(${170 + frnd() * 30 | 0},${166 + frnd() * 30 | 0},${158 + frnd() * 30 | 0},${fr(0.3, 0.7)})`;
      x.fillRect(m + Math.cos(a) * r, m + Math.sin(a) * r, fr(1, 4) * S / 512, fr(1, 4) * S / 512);
      hx.fillStyle = `rgba(60,60,60,${fr(0.3, 0.7)})`;
      hx.fillRect(m + Math.cos(a) * r, m + Math.sin(a) * r, fr(2, 5) * S / 512, fr(2, 5) * S / 512);
    }
    for (let k = 0; k < 4; k++) {
      const a = fr(0, 6.28);
      crackLine(x, m + Math.cos(a) * m * 0.5, m + Math.sin(a) * m * 0.5, a, 6, 0.8 * S / 512, "rgba(44,42,38,.4)");
      crackLine(hx, m + Math.cos(a) * m * 0.5, m + Math.sin(a) * m * 0.5, a, 6, 2 * S / 512, "rgba(40,40,40,.8)");
    }
  });
  cell(1, (m) => {
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * 6.283 + fr(-0.2, 0.2);
      const [ex, ey, ea] = crackLine(x, m, m, a, 16, fr(0.7, 1.3) * S / 512, "rgba(44,42,38,.5)");
      crackLine(hx, m, m, a, 16, fr(1.4, 2.2) * S / 512, "rgba(40,40,40,.85)");
      if (frnd() < 0.7) {
        crackLine(x, ex, ey, ea + fr(0.6, 1.2), 7, 0.6 * S / 512, "rgba(44,42,38,.35)");
      }
    }
    x.strokeStyle = "rgba(44,42,38,.22)";
    x.lineWidth = 0.7 * S / 512;
    for (const rr of [0.25, 0.45]) {
      x.beginPath();
      for (let k = 0; k <= 18; k++) {
        const a = k / 18 * 6.283, r = m * rr * (1 + fr(-0.15, 0.15));
        k ? x.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r) : x.moveTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
      }
      x.stroke();
    }
    blob(x, m, m, m * 0.1, 0.5, "rgba(60,57,52,.6)");
  });
  cell(2, (m) => {
    const g = x.createRadialGradient(m, m, 0, m, m, m * 0.95);
    g.addColorStop(0, "rgba(14,12,11,.92)");
    g.addColorStop(0.35, "rgba(22,20,18,.75)");
    g.addColorStop(0.7, "rgba(35,32,29,.3)");
    g.addColorStop(1, "rgba(40,36,32,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, m * 2, m * 2);
    for (let k = 0; k < 70; k++) {
      const a = fr(0, 6.283);
      x.strokeStyle = `rgba(16,14,12,${fr(0.05, 0.18)})`;
      x.lineWidth = fr(3, 14) * S / 512;
      x.beginPath();
      x.moveTo(m + Math.cos(a) * m * 0.2, m + Math.sin(a) * m * 0.2);
      x.lineTo(m + Math.cos(a) * m * fr(0.6, 0.98), m + Math.sin(a) * m * fr(0.6, 0.98));
      x.stroke();
    }
    for (let k = 0; k < 120; k++) {
      const a = fr(0, 6.283), r = m * fr(0.3, 0.9);
      x.fillStyle = `rgba(${120 + frnd() * 40 | 0},${115 + frnd() * 40 | 0},${105 + frnd() * 40 | 0},${fr(0.2, 0.6)})`;
      x.fillRect(m + Math.cos(a) * r, m + Math.sin(a) * r, fr(1, 3) * S / 512, fr(1, 3) * S / 512);
    }
  });
  cell(3, (m) => {
    for (let k = 0; k < 26; k++) {
      const px = m + fr(-0.7, 0.7) * m, py = m + fr(-0.7, 0.7) * m, r = fr(3, 14) * S / 512;
      if (Math.hypot(px - m, py - m) > m * 0.85) continue;
      const v = 84 + frnd() * 24 | 0;
      blob(x, px, py, r, 0.6, `rgba(${v},${v - 2},${v - 6},.55)`);
      blob(hx, px, py, r, 0.6, "rgba(70,70,70,.8)");
    }
  });
  const nrm = heightToNormal(h, 5);
  const map = texOf(c), normal = texOf(nrm, false);
  map.anisotropy = normal.anisotropy = MAXA();
  return { map, normal };
}
function buildFloor() {
  placePits("crater", 3, 1, 1.7, 0.2, 0.3);
  placePits("pothole", 6, 0.38, 0.72, 0.09, 0.15);
  const tiles = [];
  for (const T_ of FLOOR_TILES) {
    const { x0, z0, x1, z1, cs, sn, ou, ov } = T_;
    const inTile = PITS.filter((p) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1);
    let g;
    if (!inTile.length) {
      g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    } else {
      const sh = new THREE.Shape();
      sh.moveTo(x0, -z1);
      sh.lineTo(x1, -z1);
      sh.lineTo(x1, -z0);
      sh.lineTo(x0, -z0);
      sh.closePath();
      for (const p of inTile) {
        const hole = new THREE.Path();
        for (let i = 0; i < PIT_SEG; i++) {
          const a = i / PIT_SEG * Math.PI * 2, r = pitRadius(p, a);
          const px = p.x + Math.cos(a) * r, pz = p.z + Math.sin(a) * r;
          i ? hole.lineTo(px, -pz) : hole.moveTo(px, -pz);
        }
        hole.closePath();
        sh.holes.push(hole);
      }
      g = new THREE.ShapeGeometry(sh);
      g.rotateX(-Math.PI / 2);
    }
    const pa = g.attributes.position, uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) {
      const u0 = (pa.getX(k) - x0) * 0.42, v0 = (z1 - pa.getZ(k)) * 0.42;
      uv.setXY(k, u0 * cs - v0 * sn + ou, u0 * sn + v0 * cs + ov);
    }
    tiles.push(g);
  }
  const floor = new THREE.Mesh(BGU.mergeGeometries(tiles, false), M.conc);
  floor.receiveShadow = true;
  floor.name = "floor";
  scene.add(floor);
  const pitPos = [], pitCol = [], pitUv = [], pitIdx = [];
  const rubble = [], rebar = [];
  const rock = (r, x, y, z) => {
    const g = new THREE.DodecahedronGeometry(r, 0);
    g.scale(fr(0.8, 1.5), fr(0.45, 0.85), fr(0.8, 1.3));
    g.rotateY(fr(0, 6.28));
    g.rotateX(fr(-0.4, 0.4));
    g.translate(x, y, z);
    rubble.push(g.index ? g.toNonIndexed() : g);
  };
  for (const p of PITS) {
    const crater2 = p.kind === "crater";
    const rings = crater2 ? [0, 0.2, 0.4, 0.58, 0.74, 0.86, 0.95, 1, 1.12, 1.26, 1.42] : [0, 0.3, 0.5, 0.66, 0.78, 0.88, 0.95, 1];
    const base2 = pitPos.length / 3, NS = PIT_SEG;
    for (let j = 0; j < rings.length; j++) {
      const f = rings[j];
      for (let i = 0; i < NS; i++) {
        const a = i / NS * Math.PI * 2, r = pitRadius(p, a) * f;
        let y;
        if (f <= 1) {
          y = f >= 1 ? 0 : -p.depth * pitProfile(f, p.kind) * (1 + (frnd() - 0.5) * 0.35);
          if (f === 0.95) y = -p.depth * fr(0.25, 0.55);
        } else {
          const t = (f - 1) / 0.42;
          y = j === rings.length - 1 ? 4e-3 : 0.01 + 0.07 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (0.6 + frnd() * 0.7);
        }
        const jx = f > 0 && f < 1 ? fr(-0.03, 0.03) : 0, jz = f > 0 && f < 1 ? fr(-0.03, 0.03) : 0;
        const px = p.x + Math.cos(a) * r + jx, pz = p.z + Math.sin(a) * r + jz;
        pitPos.push(px, y, pz);
        let c = lerp(0.55, 1, Math.min(1, f));
        if (crater2) c = f <= 1 ? c * lerp(0.28, 0.62, f) : lerp(0.5, 0.86, (f - 1) / 0.42) * (0.9 + 0.2 * frnd());
        else if (f > 1) c *= 0.92;
        pitCol.push(c, c * 0.98, c * 0.95);
        pitUv.push(px * 0.42, pz * 0.42);
      }
    }
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < NS; i++) {
      const a = base2 + j * NS + i, b = base2 + j * NS + (i + 1) % NS, c2 = base2 + (j + 1) * NS + i, d = base2 + (j + 1) * NS + (i + 1) % NS;
      pitIdx.push(a, b, c2, b, d, c2);
    }
    const nIn = crater2 ? 22 : 9, nOut = crater2 ? 34 : 10;
    for (let k = 0; k < nIn; k++) {
      const a = fr(0, 6.28), f = Math.sqrt(frnd()) * 0.85, r = pitRadius(p, a) * f, s = fr(0.025, crater2 ? 0.11 : 0.07);
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      rock(s, x, -p.depth * pitProfile(f, p.kind) + s * 0.25, z);
    }
    for (let k = 0; k < nOut; k++) {
      const a = fr(0, 6.28), f = fr(1, crater2 ? 1.9 : 1.5), r = pitRadius(p, a) * f, s = fr(0.02, crater2 ? 0.12 : 0.06) * (1.6 - f * 0.4);
      rock(s, p.x + Math.cos(a) * r, s * 0.25 + (crater2 && f < 1.42 ? 0.05 : 0), p.z + Math.sin(a) * r);
    }
    const bars = crater2 ? 4 : 2;
    for (let k = 0; k < bars; k++) {
      const a = fr(0, Math.PI), off = fr(-0.35, 0.35) * p.R, L = p.R * fr(1.3, 1.9);
      const dx = Math.cos(a), dz = Math.sin(a);
      const cx = p.x - dz * off, cz = p.z + dx * off, y = -Math.min(0.06, p.depth * 0.4);
      const g = new THREE.CylinderGeometry(7e-3, 7e-3, L, 5);
      g.rotateZ(Math.PI / 2);
      if (crater2) {
        const pa = g.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          const t = pa.getX(i) / L;
          pa.setY(i, pa.getY(i) + Math.abs(t) * 0.3 * fr(0.6, 1.2));
        }
      }
      g.rotateY(-a);
      g.translate(cx, y, cz);
      rebar.push(g.index ? g.toNonIndexed() : g);
    }
  }
  if (PITS.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pitPos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(pitCol, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(pitUv, 2));
    g.setIndex(pitIdx);
    g.computeVertexNormals();
    M.concPit = M.conc.clone();
    M.concPit.vertexColors = true;
    const pm = new THREE.Mesh(g, M.concPit);
    pm.receiveShadow = true;
    pm.userData.nomerge = true;
    pm.name = "floor_pits";
    scene.add(pm);
    for (const r of rubble) for (const k of Object.keys(r.attributes)) if (!["position", "normal", "uv"].includes(k)) r.deleteAttribute(k);
    const rm = new THREE.Mesh(BGU.mergeGeometries(rubble, false), M.conc);
    rm.castShadow = true;
    rm.receiveShadow = true;
    rm.userData.nomerge = true;
    scene.add(rm);
    for (const r of rebar) for (const k of Object.keys(r.attributes)) if (!["position", "normal", "uv"].includes(k)) r.deleteAttribute(k);
    const bm = new THREE.Mesh(BGU.mergeGeometries(rebar, false), cmat(4863270, { roughness: 0.75, metalness: 0.55 }));
    bm.castShadow = true;
    bm.userData.nomerge = true;
    scene.add(bm);
  }
  const D2 = floorDamageMaps(TS(1024));
  const dmat = new THREE.MeshStandardMaterial({
    map: D2.map,
    normalMap: D2.normal,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughness: 1,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    envMapIntensity: 0.2
  });
  const quads = [];
  const decal = (x, z, size, cellI, rot) => {
    if (Math.abs(x) > HW - 0.6 || Math.abs(z) > HD - 0.6) return;
    const g = new THREE.PlaneGeometry(size, size);
    g.rotateX(-Math.PI / 2);
    g.rotateY(rot);
    g.translate(x, 35e-4 + quads.length * 1e-5, z);
    const uv = g.attributes.uv, ox = cellI % 2 * 0.5, oy = 0.5 - Math.floor(cellI / 2) * 0.5;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, ox + uv.getX(k) * 0.5, oy + uv.getY(k) * 0.5);
    quads.push(g);
  };
  const freeSpot = (r) => {
    for (let t = 0; t < 60; t++) {
      const x = fr(-HW + 2, HW - 2), z = fr(-HD + 2, HD - 2);
      if (Math.abs(x) < 15.6 && Math.abs(z) < 10.2) continue;
      if (PITS.some((p) => Math.hypot(x - p.x, z - p.z) < p.Rmax + r)) continue;
      return [x, z];
    }
    return null;
  };
  for (let k = 0; k < 36; k++) {
    const s = freeSpot(0.8);
    if (s) decal(s[0], s[1], fr(0.5, 1.4), 0, fr(0, 6.28));
  }
  for (let k = 0; k < 26; k++) {
    const s = freeSpot(1.2);
    if (s) decal(s[0], s[1], fr(1.4, 3.2), 1, fr(0, 6.28));
  }
  for (let k = 0; k < 18; k++) {
    const s = freeSpot(0.6);
    if (s) decal(s[0], s[1], fr(0.6, 1.3), 3, fr(0, 6.28));
  }
  for (const p of PITS) {
    if (p.kind === "crater") {
      decal(p.x, p.z, p.R * 4.2, 2, fr(0, 6.28));
      decal(p.x, p.z, p.R * 4.6, 1, fr(0, 6.28));
    } else {
      decal(p.x, p.z, p.R * 3, 3, fr(0, 6.28));
      if (frnd() < 0.6) decal(p.x + fr(-0.3, 0.3), p.z + fr(-0.3, 0.3), p.R * fr(3, 4.5), 1, fr(0, 6.28));
    }
  }
  const dm = new THREE.Mesh(BGU.mergeGeometries(quads, false), dmat);
  dm.receiveShadow = true;
  dm.renderOrder = 1;
  dm.userData.nomerge = true;
  dm.name = "floor_damage";
  scene.add(dm);
}
function floorDetailAtlas(C) {
  const W = C * 4, H = C * 2;
  let seed = 3301;
  const r = () => {
    seed = seed * 1664525 + 1013904223 >>> 0;
    return seed / 4294967296;
  }, R = (a, b) => a + r() * (b - a);
  const [ac, ax] = cv(W, H), [hc, hx] = cv(W, H), [oc, ox] = cv(W, H);
  ax.clearRect(0, 0, W, H);
  hx.fillStyle = "rgb(128,128,128)";
  hx.fillRect(0, 0, W, H);
  ox.fillStyle = "rgb(255,225,0)";
  ox.fillRect(0, 0, W, H);
  const cell = (i, fn) => {
    const x0 = i % 4 * C, y0 = Math.floor(i / 4) * C;
    for (const c of [ax, hx, ox]) {
      c.save();
      c.beginPath();
      c.rect(x0, y0, C, C);
      c.clip();
      c.translate(x0, y0);
    }
    fn(C);
    for (const c of [ax, hx, ox]) c.restore();
  };
  const wear = (x, y, w, h, n, a = 1) => {
    ax.save();
    ax.globalCompositeOperation = "destination-out";
    for (let k = 0; k < n; k++) {
      ax.fillStyle = `rgba(0,0,0,${R(0.3, 0.95) * a})`;
      ax.beginPath();
      ax.ellipse(x + r() * w, y + r() * h, R(1, 7) * C / 256, R(1, 4) * C / 256, R(0, 3), 0, 7);
      ax.fill();
    }
    ax.restore();
  };
  cell(0, (S) => {
    const y0 = S * 0.43, h = S * 0.14;
    ax.fillStyle = "rgba(214,168,34,.92)";
    ax.fillRect(0, y0, S, h);
    for (let k = 0; k < 60; k++) {
      ax.fillStyle = `rgba(120,98,40,${R(0.05, 0.2)})`;
      ax.fillRect(r() * S, y0 + r() * h, R(4, 30), R(1, 4));
    }
    ax.save();
    ax.globalCompositeOperation = "destination-out";
    for (let k = 0; k < 70; k++) {
      ax.fillStyle = `rgba(0,0,0,${R(0.25, 0.8)})`;
      ax.fillRect(r() * S, y0 + r() * h, R(10, 60) * S / 256, R(0.6, 2.2) * S / 256);
    }
    ax.restore();
    wear(0, y0, S, h, 40, 0.9);
    hx.fillStyle = "rgb(138,138,138)";
    hx.fillRect(0, y0, S, h);
    ox.fillStyle = "rgb(255,140,0)";
    ox.fillRect(0, y0, S, h);
  });
  cell(1, (S) => {
    ax.fillStyle = "rgba(28,26,22,.85)";
    ax.fillRect(0, 0, S, S);
    ax.fillStyle = "rgba(214,168,34,.92)";
    for (let k = -4; k < 8; k++) {
      ax.beginPath();
      ax.moveTo(k * S / 4, 0);
      ax.lineTo(k * S / 4 + S / 8, 0);
      ax.lineTo(k * S / 4 + S / 8 + S, S);
      ax.lineTo(k * S / 4 + S, S);
      ax.closePath();
      ax.fill();
    }
    wear(0, 0, S, S, 900, 0.85);
    ox.fillStyle = "rgb(255,150,0)";
    ox.fillRect(0, 0, S, S);
  });
  cell(2, (S) => {
    const y0 = S * 0.35, h = S * 0.3;
    ax.fillStyle = "rgba(70,72,72,1)";
    ax.fillRect(0, y0, S, h);
    ax.fillStyle = "rgba(8,8,8,1)";
    for (let k = 0; k < 24; k++) ax.fillRect(k * S / 24 + 2, y0 + h * 0.16, S / 24 - 4 * S / 256, h * 0.68);
    ax.fillStyle = "rgba(110,84,60,.35)";
    for (let k = 0; k < 40; k++) ax.fillRect(r() * S, y0 + R(0, h), R(2, 10), R(1, 4));
    hx.fillStyle = "rgb(150,150,150)";
    hx.fillRect(0, y0, S, h);
    hx.fillStyle = "rgb(30,30,30)";
    for (let k = 0; k < 24; k++) hx.fillRect(k * S / 24 + 2, y0 + h * 0.16, S / 24 - 4 * S / 256, h * 0.68);
    ox.fillStyle = "rgb(255,120,200)";
    ox.fillRect(0, y0, S, h);
  });
  cell(3, (S) => {
    const m = S / 2;
    const g = ax.createRadialGradient(m, m, S * 0.2, m, m, S * 0.5);
    g.addColorStop(0, "rgba(96,58,30,.45)");
    g.addColorStop(1, "rgba(96,58,30,0)");
    ax.fillStyle = g;
    ax.fillRect(0, 0, S, S);
    ax.fillStyle = "rgba(62,58,54,1)";
    ax.fillRect(m - S * 0.3, m - S * 0.3, S * 0.6, S * 0.6);
    for (let k = 0; k < 40; k++) {
      ax.fillStyle = `rgba(${R(90, 130)},${R(50, 70)},${R(24, 36)},${R(0.2, 0.5)})`;
      ax.beginPath();
      ax.arc(m + R(-0.28, 0.28) * S, m + R(-0.28, 0.28) * S, R(2, 9) * S / 256, 0, 7);
      ax.fill();
    }
    hx.fillStyle = "rgb(176,176,176)";
    hx.fillRect(m - S * 0.3, m - S * 0.3, S * 0.6, S * 0.6);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const bx = m + dx * S * 0.22, by = m + dy * S * 0.22;
      ax.fillStyle = "rgba(40,38,36,1)";
      ax.beginPath();
      ax.arc(bx, by, S * 0.045, 0, 7);
      ax.fill();
      ax.fillStyle = "rgba(120,112,100,1)";
      ax.beginPath();
      ax.arc(bx, by, S * 0.028, 0, 7);
      ax.fill();
      hx.fillStyle = "rgb(236,236,236)";
      hx.beginPath();
      hx.arc(bx, by, S * 0.04, 0, 7);
      hx.fill();
    }
    ox.fillStyle = "rgb(255,110,190)";
    ox.fillRect(m - S * 0.3, m - S * 0.3, S * 0.6, S * 0.6);
  });
  cell(4, (S) => {
    const m = S / 2;
    for (let k = 0; k < 26; k++) {
      const x = m + R(-0.2, 0.2) * S, y = m + R(-0.2, 0.2) * S, rr = R(0.08, 0.28) * S, g = ax.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, `rgba(16,14,12,${R(0.2, 0.4)})`);
      g.addColorStop(1, "rgba(16,14,12,0)");
      ax.fillStyle = g;
      ax.beginPath();
      ax.arc(x, y, rr, 0, 7);
      ax.fill();
      const go = ox.createRadialGradient(x, y, 0, x, y, rr);
      go.addColorStop(0, "rgba(255,50,0,.5)");
      go.addColorStop(1, "rgba(255,50,0,0)");
      ox.fillStyle = go;
      ox.beginPath();
      ox.arc(x, y, rr, 0, 7);
      ox.fill();
    }
  });
  cell(5, (S) => {
    const x0 = S * 0.08, y0 = S * 0.12, w = S * 0.84, h = S * 0.72;
    ax.fillStyle = "rgba(108,106,100,.55)";
    ax.fillRect(x0, y0, w, h);
    for (let k = 0; k < 500; k++) {
      const v = R(80, 150);
      ax.fillStyle = `rgba(${v},${v},${v - 4},${R(0.1, 0.3)})`;
      ax.fillRect(x0 + r() * w, y0 + r() * h, R(1, 3), R(1, 3));
    }
    ax.strokeStyle = "rgba(30,30,28,.8)";
    ax.lineWidth = 2 * S / 256;
    ax.strokeRect(x0, y0, w, h);
    hx.strokeStyle = "rgb(40,40,40)";
    hx.lineWidth = 3 * S / 256;
    hx.strokeRect(x0, y0, w, h);
    ox.fillStyle = "rgb(255,250,0)";
    ox.fillRect(x0, y0, w, h);
  });
  cell(6, (S) => {
    for (const off of [-0.18, 0.18]) {
      ax.strokeStyle = "rgba(20,18,16,.35)";
      ax.lineWidth = S * 0.09;
      ax.beginPath();
      ax.arc(S * 0.5, S * (1.6 + off), S * 1.25, -Math.PI * 0.72, -Math.PI * 0.28);
      ax.stroke();
      ax.strokeStyle = "rgba(20,18,16,.25)";
      ax.lineWidth = S * 0.012;
      ax.setLineDash([S * 0.02, S * 0.03]);
      ax.beginPath();
      ax.arc(S * 0.5, S * (1.6 + off), S * 1.25, -Math.PI * 0.72, -Math.PI * 0.28);
      ax.stroke();
      ax.setLineDash([]);
    }
    wear(0, 0, S, S, 200, 0.6);
  });
  cell(7, (S) => {
    const m = S / 2;
    ax.fillStyle = "rgba(66,66,64,1)";
    ax.beginPath();
    ax.arc(m, m, S * 0.36, 0, 7);
    ax.fill();
    ax.fillStyle = "rgba(6,6,6,1)";
    for (let k = -4; k <= 4; k++) {
      ax.fillRect(m + k * S * 0.07 - S * 0.02, m - Math.sqrt(Math.max(0, 0.3 * 0.3 - (k * 0.07) ** 2)) * S, S * 0.04, 2 * Math.sqrt(Math.max(0, 0.3 * 0.3 - (k * 0.07) ** 2)) * S);
    }
    const g = ax.createRadialGradient(m, m, S * 0.36, m, m, S * 0.5);
    g.addColorStop(0, "rgba(40,36,30,.5)");
    g.addColorStop(1, "rgba(40,36,30,0)");
    ax.fillStyle = g;
    ax.beginPath();
    ax.arc(m, m, S * 0.5, 0, 7);
    ax.fill();
    hx.fillStyle = "rgb(150,150,150)";
    hx.beginPath();
    hx.arc(m, m, S * 0.36, 0, 7);
    hx.fill();
    hx.fillStyle = "rgb(30,30,30)";
    for (let k = -4; k <= 4; k++) hx.fillRect(m + k * S * 0.07 - S * 0.02, m - S * 0.28, S * 0.04, S * 0.56);
    ox.fillStyle = "rgb(255,120,200)";
    ox.beginPath();
    ox.arc(m, m, S * 0.36, 0, 7);
    ox.fill();
  });
  return { albedo: ac, normal: heightToNormalRect(hc, 2.2), orm: oc };
}
function buildFloorDetails() {
  const A2 = floorDetailAtlas(TS(256));
  const mat = new THREE.MeshStandardMaterial({
    map: T(A2.albedo),
    normalMap: T(A2.normal, 1, 1, false),
    roughnessMap: T(A2.orm, 1, 1, false),
    metalnessMap: T(A2.orm, 1, 1, false),
    roughness: 1,
    metalness: 1,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    envMapIntensity: 0.6
  });
  for (const t of [mat.map, mat.normalMap, mat.roughnessMap]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  mat.metalnessMap = mat.roughnessMap;
  const quads = [];
  let seed = 7717;
  const r = () => {
    seed = seed * 1664525 + 1013904223 >>> 0;
    return seed / 4294967296;
  }, R = (a, b) => a + r() * (b - a);
  const free = (x, z, rad) => Math.abs(x) < HW - 0.8 && Math.abs(z) < HD - 0.8 && !PITS.some((p) => Math.hypot(x - p.x, z - p.z) < p.Rmax + rad);
  const quad = (x, z, w, d, rot, ci, v0 = 0, v1 = 1) => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    g.rotateY(rot);
    g.translate(x, 25e-4 + quads.length * 2e-6, z);
    const uv = g.attributes.uv, cu = ci % 4 * 0.25, cvv = 0.5 - Math.floor(ci / 4) * 0.5;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, cu + (4e-3 + uv.getX(k) * 0.992) * 0.25, cvv + (v0 + uv.getY(k) * (v1 - v0)) * 0.5);
    quads.push(g);
  };
  const line = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L)), rot = Math.atan2(-(z1 - z0), x1 - x0);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = lerp(x0, x1, t), z = lerp(z0, z1, t);
      if (!free(x, z, 0.3)) continue;
      if (r() < 0.06) continue;
      quad(x, z, L / n + 0.01, 0.13, rot, 0, 0.425, 0.575);
    }
  };
  const hx = 15.6 + 1.4, hz = 10.2 + 1.4;
  line(-hx, -hz, hx, -hz);
  line(-hx, hz, hx, hz);
  line(-hx, -hz, -hx, hz);
  line(hx, -hz, hx, hz);
  for (const z of [-13.4, 13.4]) {
    line(-37, z, -hx - 1.5, z);
    line(hx + 1.5, z, 37, z);
  }
  for (const sx of [-1, 1]) for (let k = -3; k < 3; k++) quad(sx * (HW - 1.6), k + 0.5, 1, 1, 0, 1);
  for (const sx of [-1, 1]) for (let k = -5; k < 5; k++) {
    const x = sx * (HW - 3.4), z = k + 0.5;
    if (free(x, z, 0.3)) quad(x, z, 0.3, 1, Math.PI / 2, 2, 0.35, 0.65);
  }
  for (const sz of [-1, 1]) for (let k = -14; k < 14; k++) {
    const x = k * 2.5 + 1.25, z = sz * (HD - 1.1);
    if (free(x, z, 0.3) && r() < 0.9) quad(x, z, 1, 0.3, 0, 2, 0.35, 0.65);
  }
  for (let k = 0; k < 14; k++) {
    const x = R(-HW + 3, HW - 3), z = (r() < 0.5 ? -1 : 1) * R(HD - 7, HD - 3.5);
    if (!free(x, z, 0.5)) continue;
    const rot = R(0, 0.1);
    for (const [dx, dz] of [[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.6], [0.9, 0.6]]) if (r() < 0.8) quad(x + dx, z + dz, 0.55, 0.55, rot, 3);
  }
  for (let k = 0; k < 22; k++) {
    const x = R(-HW + 3, HW - 3), z = R(-HD + 3, HD - 3);
    if (Math.abs(x) < 16.5 && Math.abs(z) < 11) continue;
    if (free(x, z, 1)) quad(x, z, R(0.8, 2.2), R(0.8, 2), R(0, 6.28), 4);
  }
  for (let k = 0; k < 12; k++) {
    const x = R(-HW + 4, HW - 4), z = R(-HD + 4, HD - 4);
    if (Math.abs(x) < 16.5 && Math.abs(z) < 11) continue;
    if (free(x, z, 1.3)) quad(x, z, R(1.2, 2.6), R(1, 2), Math.round(R(0, 3)) * Math.PI / 2, 5);
  }
  for (let k = 0; k < 14; k++) {
    const x = R(-HW + 4, HW - 4), z = R(-HD + 4, HD - 4);
    if (Math.abs(x) < 16.5 && Math.abs(z) < 11) continue;
    if (free(x, z, 1.5)) quad(x, z, R(2.5, 4), R(2.5, 4), R(0, 6.28), 6);
  }
  for (const [x, z] of [[-30, -10], [30, 10], [-8, -16], [8, 16], [-24, 3], [24, -3]]) if (free(x, z, 0.4)) quad(x, z, 0.5, 0.5, 0, 7);
  if (!quads.length) return;
  const m = new THREE.Mesh(BGU.mergeGeometries(quads, false), mat);
  m.receiveShadow = true;
  m.renderOrder = 1;
  m.userData.nomerge = true;
  m.name = "floor_details";
  scene.add(m);
}
function tagTex(text) {
  const [c, x] = cv(1024, 320);
  x.clearRect(0, 0, 1024, 320);
  x.font = '900 200px "Arial Black", Impact, "Segoe UI", Arial, sans-serif';
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.save();
  x.shadowColor = "rgba(200,52,28,0.95)";
  x.shadowBlur = 30;
  x.fillStyle = "rgba(190,48,24,0.55)";
  x.fillText(text, 512, 158);
  x.restore();
  x.lineJoin = "round";
  x.lineWidth = 20;
  x.strokeStyle = "rgba(22,19,18,0.96)";
  x.strokeText(text, 512, 158);
  const g = x.createLinearGradient(0, 70, 0, 250);
  g.addColorStop(0, "#f1ece0");
  g.addColorStop(1, "#d4ccba");
  x.fillStyle = g;
  x.fillText(text, 512, 158);
  x.lineWidth = 4;
  x.strokeStyle = "rgba(196,50,26,0.9)";
  x.strokeText(text, 516, 162);
  for (let k = 0; k < 22; k++) {
    const px = fr(150, 880), py = fr(205, 240), L = fr(18, 70);
    x.strokeStyle = `rgba(222,215,200,${fr(0.55, 0.9)})`;
    x.lineWidth = fr(2.5, 6);
    x.lineCap = "round";
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + fr(-2, 2), py + L);
    x.stroke();
  }
  x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 1800; i++) {
    x.fillStyle = `rgba(0,0,0,${frnd() * 0.55})`;
    x.fillRect(frnd() * 1024, frnd() * 320, 1 + frnd() * 9, 1 + frnd() * 3);
  }
  x.globalCompositeOperation = "source-over";
  const t = texOf(c);
  t.anisotropy = MAXA();
  return t;
}
function buildTag() {
  const mat = new THREE.MeshStandardMaterial({
    map: tagTex("badVIno"),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    roughness: 0.88,
    metalness: 0,
    envMapIntensity: 0.2
  });
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 2.12), mat);
    m.position.set(s * COL_STEP / 2, 4.38, s * (HD - 0.225));
    m.rotation.y = s < 0 ? 0 : Math.PI;
    m.receiveShadow = true;
    m.userData.nomerge = true;
    m.name = "tag_badVIno";
    scene.add(m);
  }
}
function buildRoof() {
  const holes = [];
  const holeN = Math.round(HW * 2 / 6);
  for (let i = 0; i < holeN; i++) {
    const x = -HW + 4 + i * ((HW * 2 - 8) / (holeN - 1)) + sr(-0.8, 0.8);
    const z = (i % 2 ? 1 : -1) * sr(4.5, HD - 5);
    const w = sr(2.4, 3.6), d = sr(1.8, 2.8);
    holes.push({ x, z, w, d, open: srnd() < 0.45 });
  }
  holes.push({ x: -6.5, z: 2, w: 4.6, d: 3.4, open: true });
  holes.push({ x: 11.5, z: -3.5, w: 4, d: 3, open: true });
  holes.push({ x: -24, z: -9, w: 4.2, d: 3.2, open: true });
  holes.push({ x: 25, z: 11, w: 4.4, d: 3.2, open: true });
  const stripN = Math.round(HD * 2 / 1.5);
  for (let i = 0; i < stripN; i++) {
    const z0 = -HD + i * (HD * 2 / stripN), z1 = -HD + (i + 1) * (HD * 2 / stripN);
    const zc = (z0 + z1) / 2;
    let spans = [[-HW - 0.3, HW + 0.3]];
    for (const h of holes) {
      if (zc < h.z - h.d / 2 || zc > h.z + h.d / 2) continue;
      const nx = [];
      for (const [a, b] of spans) {
        const c0 = h.x - h.w / 2, c1 = h.x + h.w / 2;
        if (c1 <= a || c0 >= b) {
          nx.push([a, b]);
          continue;
        }
        if (a < c0) nx.push([a, c0]);
        if (c1 < b) nx.push([c1, b]);
      }
      spans = nx;
    }
    for (const [a, b] of spans) {
      if (b - a < 0.12) continue;
      const y0 = roofY(z0), y1 = roofY(z1);
      const len = Math.hypot(z1 - z0, y1 - y0);
      const g = new THREE.PlaneGeometry(b - a, len);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (b - a) * 0.3, uv.getY(k) * len * 0.3);
      const m = new THREE.Mesh(g, M.roof);
      m.position.set((a + b) / 2, (y0 + y1) / 2, zc);
      m.rotation.x = -Math.PI / 2 + Math.atan2(y1 - y0, z1 - z0);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = "roofstrip";
      scene.add(m);
    }
  }
  addBox("roof", 0, RIDGE + 0.06, 0, HW * 2 + 0.6, 0.12, 0.85, { collide: false, d: 1.2 });
  const CEIL_N = 20;
  for (let i = 0; i < CEIL_N; i++) {
    const za = -HD + i * (HD * 2 / CEIL_N), zb = -HD + (i + 1) * (HD * 2 / CEIL_N);
    const zc = (za + zb) / 2, y = roofY(zc);
    let spans = [[-HW - 0.3, HW + 0.3]];
    for (const h of holes) {
      if (!h.open) continue;
      if (zc < h.z - h.d / 2 || zc > h.z + h.d / 2) continue;
      const nx = [];
      for (const [a, b] of spans) {
        const c0 = h.x - h.w / 2, c1 = h.x + h.w / 2;
        if (c1 <= a || c0 >= b) {
          nx.push([a, b]);
          continue;
        }
        if (a < c0) nx.push([a, c0]);
        if (c1 < b) nx.push([c1, b]);
      }
      spans = nx;
    }
    for (const [a, b] of spans) {
      if (b - a < 0.2) continue;
      COLLIDERS.push({ x0: a, y0: y - 0.12, z0: za, x1: b, y1: y + 0.9, z1: zb });
    }
  }
  for (const s of [-1, 1]) {
    COLLIDERS.push({ x0: s * HW - 0.35, y0: EAVE - 0.2, z0: -HD, x1: s * HW + 0.35, y1: RIDGE + 0.4, z1: HD });
    COLLIDERS.push({ x0: -HW, y0: EAVE - 0.2, z0: s * HD - 0.35, x1: HW, y1: roofY(s * HD) + 0.6, z1: s * HD + 0.35 });
  }
  for (const h of holes) {
    const y = roofY(h.z);
    if (!h.open) {
      const g = new THREE.PlaneGeometry(h.w, h.d);
      const m = new THREE.Mesh(g, M.glass);
      m.position.set(h.x, y - 0.02, h.z);
      m.rotation.x = -Math.PI / 2;
      scene.add(m);
    }
    addBox("steel", h.x, y - 0.08, h.z - h.d / 2, h.w + 0.2, 0.12, 0.12, { collide: false, d: 1.2 });
    addBox("steel", h.x, y - 0.08, h.z + h.d / 2, h.w + 0.2, 0.12, 0.12, { collide: false, d: 1.2 });
    SUNHOLES.push({ x: h.x, y, z: h.z, w: h.w, d: h.d, open: h.open });
  }
  for (let i = 0; i < 3; i++) {
    const zz = sr(-HD + 5, HD - 5);
    addBox("darker", -HW + 0.3, WALL_H + 2.8, zz, 0.06, sr(0.6, 1.4), sr(0.5, 1.2), { collide: false, d: 1 });
  }
}
var LAMP_MAT = new THREE.MeshStandardMaterial({
  color: 9343640,
  emissive: 16774364,
  emissiveIntensity: 0,
  roughness: 0.42,
  metalness: 0.05
});
var LAMP_DEAD = new THREE.MeshStandardMaterial({ color: 7238006, roughness: 0.62 });
var FLICKER = [];
function buildLamps() {
  const rows = Math.round(HD * 2 / 9), cols = Math.round(HW * 2 / 5.5);
  for (let r = 0; r < rows; r++) {
    const z = -HD + 4 + r * ((HD * 2 - 8) / Math.max(1, rows - 1));
    for (let i = 0; i < cols; i++) {
      const x = -HW + 4 + i * ((HW * 2 - 8) / Math.max(1, cols - 1));
      const y = roofY(z) - 1.25;
      addBox("dark", x, y + 0.12, z, 1.85, 0.11, 0.3, { collide: false, d: 1.4 });
      const on = srnd() < 0.86 ? 1 : 0;
      const flick = on && srnd() < 0.085;
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.048, 1.72, 8),
        flick ? LAMP_MAT.clone() : on ? LAMP_MAT : LAMP_DEAD
      );
      tube.rotation.z = Math.PI / 2;
      tube.position.set(x, y, z);
      if (flick) tube.userData.nomerge = true;
      scene.add(tube);
      for (const o of [-0.7, 0.7]) {
        addBox("dark", x + o, y + 0.62, z, 0.035, 0.9, 0.035, { collide: false, d: 1 });
      }
      const rec = {
        pos: new THREE.Vector3(x, y - 0.2, z),
        mesh: tube,
        on,
        flick,
        lit: 0,
        ph: sr(0, 99),
        rate: sr(5.5, 13)
      };
      LAMPS.push(rec);
      if (flick) FLICKER.push(rec);
    }
  }
}
var DEAD_LAMP = { rec: null, mat: null, spot: null, cone: null, halo: null, st: "off", tt: 0.5, sw: 0, flash: 0, k: 0 };
function buildDeadLamp() {
  let best = null, bd = 1e9;
  for (const l2 of LAMPS) {
    if (!l2.mesh || l2.warm) continue;
    const d = Math.hypot(l2.pos.x + 13, l2.pos.z - 13.5);
    if (d < bd) {
      bd = d;
      best = l2;
    }
  }
  if (!best) return;
  const l = best, i = FLICKER.indexOf(l);
  if (i >= 0) FLICKER.splice(i, 1);
  l.on = 0;
  l.flick = false;
  l.dead = true;
  DEAD_LAMP.rec = l;
  DEAD_LAMP.mat = new THREE.MeshStandardMaterial({ color: 10133670, emissive: 15331839, emissiveIntensity: 0, roughness: 0.35, metalness: 0.05 });
  l.mesh.material = DEAD_LAMP.mat;
  l.mesh.userData.nomerge = true;
  const p = l.mesh.position, floorY = 0;
  const spot = new THREE.SpotLight(15134719, 0, 24, 1.05, 0.6, 1.4);
  spot.position.set(p.x, p.y - 0.12, p.z);
  spot.target.position.set(p.x + 0.4, floorY, p.z + 0.3);
  if (Q.lights >= 6) {
    spot.castShadow = true;
    spot.shadow.mapSize.set(512, 512);
    spot.shadow.bias = -6e-4;
    spot.shadow.normalBias = 0.03;
    spot.shadow.camera.near = 0.2;
    spot.shadow.camera.far = 16;
    scene.add(spot);
    scene.add(spot.target);
  } else SPOT_SRC.push(spot);
  DEAD_LAMP.spot = spot;
  const h = p.y - 0.1 - floorY;
  const cg = new THREE.CylinderGeometry(0.28, 4.2, h, 40, 1, true);
  cg.translate(0, -h / 2, 0);
  DEAD_LAMP.cone = new THREE.Mesh(cg, new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uI: { value: 0 }, uCol: { value: new THREE.Color(0.8, 0.88, 1) } },
    vertexShader: `varying float vY; varying vec3 vN, vV;
      void main(){ vY = uv.y; vec4 mv = modelViewMatrix*vec4(position, 1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uI; uniform vec3 uCol; varying float vY; varying vec3 vN, vV;
      void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float a = uI*0.05*edge*pow(vY, 1.35);
        gl_FragColor = vec4(uCol*a, 1.0); }`
  }));
  DEAD_LAMP.cone.position.set(p.x, p.y - 0.1, p.z);
  DEAD_LAMP.cone.userData.nomerge = true;
  DEAD_LAMP.cone.renderOrder = 4;
  scene.add(DEAD_LAMP.cone);
  DEAD_LAMP.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: FX.glow, color: 14477567, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  DEAD_LAMP.halo.position.set(p.x, p.y - 0.05, p.z);
  DEAD_LAMP.halo.scale.set(2.6, 0.9, 1);
  DEAD_LAMP.halo.userData.nomerge = true;
  scene.add(DEAD_LAMP.halo);
}
var NIGHT_EMIS = [];
var FLOODS = [];
function nightMat(color, peak = 2.4) {
  const m = new THREE.MeshStandardMaterial({
    color: 2763308,
    emissive: color,
    emissiveIntensity: 0,
    roughness: 0.4,
    metalness: 0.1
  });
  NIGHT_EMIS.push({ mat: m, peak, base: new THREE.Color(color) });
  return m;
}
var MAT_SODIUM = nightMat(16754236, 3.1);
var MAT_FLOOD = nightMat(16773328, 3.6);
var MAT_EXIT = nightMat(3594602, 1.6);
function floodMast(x, z, aimX, aimZ, h = 9) {
  addBox("steel", x, h / 2, z, 0.22, h, 0.22, { d: 1.1 });
  addBox("dark", x, 0.16, z, 0.8, 0.32, 0.8, { d: 1.2 });
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const g = new THREE.BoxGeometry(0.08, 1.5, 0.08);
    g.rotateX(0.42);
    g.rotateY(a);
    g.translate(x + Math.cos(a) * 0.34, 0.8, z + Math.sin(a) * 0.34);
    bucket("steel").push(g);
  }
  const dirX = aimX - x, dirZ = aimZ - z;
  const dl = Math.hypot(dirX, dirZ) || 1;
  const yaw = Math.atan2(dirX / dl, dirZ / dl);
  for (const off of [-0.44, 0.44]) {
    const hx = x + Math.cos(yaw) * off + Math.sin(yaw) * 0.28;
    const hz = z - Math.sin(yaw) * off + Math.cos(yaw) * 0.28;
    const head = new THREE.Mesh(roundedBox(0.52, 0.4, 0.26, 0.05, 2), M.dark);
    head.position.set(hx, h - 0.3, hz);
    head.rotation.y = yaw;
    head.rotation.x = 0.55;
    head.castShadow = true;
    scene.add(head);
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), MAT_FLOOD);
    lens.position.set(hx + Math.sin(yaw) * 0.1, h - 0.42, hz + Math.cos(yaw) * 0.1);
    lens.rotation.y = yaw;
    lens.rotation.x = 0.55 - Math.PI / 2 + Math.PI / 2;
    lens.rotation.x = 0.55;
    scene.add(lens);
  }
  const spot = new THREE.SpotLight(16772301, 0, 52, 0.62, 0.55, 1.4);
  spot.position.set(x, h - 0.35, z);
  spot.target.position.set(aimX, 0.4, aimZ);
  SPOT_SRC.push(spot);
  FLOODS.push({ light: spot, peak: 55 });
}
function wallLamp(x, y, z, rotY) {
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.44, 7), M.dark);
  arm.rotation.z = Math.PI / 2;
  arm.rotation.y = rotY;
  arm.position.set(x + Math.sin(rotY) * 0.22, y, z + Math.cos(rotY) * 0.22);
  scene.add(arm);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), M.dark);
  hood.position.set(x + Math.sin(rotY) * 0.46, y + 0.03, z + Math.cos(rotY) * 0.46);
  hood.castShadow = true;
  scene.add(hood);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.115, 9, 7), MAT_SODIUM);
  bulb.position.set(x + Math.sin(rotY) * 0.46, y - 0.06, z + Math.cos(rotY) * 0.46);
  scene.add(bulb);
  LAMPS.push({
    pos: new THREE.Vector3(x + Math.sin(rotY) * 0.5, y - 0.15, z + Math.cos(rotY) * 0.5),
    mesh: bulb,
    on: 1,
    lit: 0,
    warm: true
  });
}
function exitSign(x, y, z, rotY) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.15, 0.05), M.darker);
  box.position.set(x, y, z);
  box.rotation.y = rotY;
  scene.add(box);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.12), MAT_EXIT);
  face.position.set(x + Math.sin(rotY) * 0.032, y, z + Math.cos(rotY) * 0.032);
  face.rotation.y = rotY;
  scene.add(face);
}
function buildNightLighting() {
  floodMast(-HW + 3, -HD + 3, -6, -4, 9.4);
  floodMast(HW - 3, -HD + 3, 6, -4, 9.4);
  floodMast(-HW + 3, HD - 3, -6, 4, 9.4);
  floodMast(HW - 3, HD - 3, 6, 4, 9.4);
  for (const z of [-20, -7, 7, 20]) {
    wallLamp(-HW + 0.6, 4.6, z, Math.PI / 2);
    wallLamp(HW - 0.6, 4.6, z, -Math.PI / 2);
  }
  for (const x of [-28, -10, 10, 28]) {
    wallLamp(x, 4.6, -HD + 0.6, 0);
    wallLamp(x, 4.6, HD - 0.6, Math.PI);
  }
}
function buildServices() {
  for (const z of [-HD + 3, -9, 9, HD - 3]) {
    addBox("dark", 0, EAVE - 0.62, z, HW * 2, 0.09, 0.26, { collide: false, d: 1.4 });
  }
  const cableMat = M.cable;
  for (let i = 0; i < 20; i++) {
    const z = sr(-HD + 2, HD - 2), x0 = sr(-HW + 2, 0), x1 = x0 + sr(6, 18);
    const y = EAVE - sr(0.7, 1.6), sag = sr(0.3, 1.1);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x0, y, z),
      new THREE.Vector3((x0 + x1) / 2, y - sag, z + sr(-0.4, 0.4)),
      new THREE.Vector3(x1, y, z)
    ]);
    const g = new THREE.TubeGeometry(curve, 14, sr(0.014, 0.03), 5, false);
    const m = new THREE.Mesh(g, cableMat);
    m.castShadow = true;
    scene.add(m);
  }
  for (const [x, z] of [[-18, 6], [3, -10], [19, 8], [-27, -14], [28, 16]]) {
    const y = roofY(z);
    addBox("dark", x, y + 0.55, z, 1.5, 1.1, 1.5, { collide: false, d: 0.8 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 14), M.dark);
    cap.position.set(x, y + 1.16, z);
    scene.add(cap);
  }
}
var sun;
var hemi;
var ambient;
var fillProbe;
var sunTarget;
function buildLights() {
  hemi = new THREE.HemisphereLight(11452368, 9076332, 0.68);
  scene.add(hemi);
  ambient = new THREE.AmbientLight(14672870, 0.16);
  scene.add(ambient);
  sun = new THREE.DirectionalLight(16773852, 5.4);
  sun.position.set(-46, 54, 30);
  sunTarget = new THREE.Object3D();
  sunTarget.position.set(2, 0, -4);
  scene.add(sunTarget);
  sun.target = sunTarget;
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  const c = sun.shadow.camera;
  c.left = -58;
  c.right = 58;
  c.top = 50;
  c.bottom = -50;
  c.near = 1;
  c.far = Q.shadowFar;
  sun.shadow.bias = -8e-4;
  sun.shadow.normalBias = 0.034;
  scene.add(sun);
  fillProbe = new THREE.LightProbe();
  scene.add(fillProbe);
  initLightPool();
}
var PPOOL = [];
var PREQ = [];
var PREQ_N = 0;
var SPOOL = [];
var SPOT_SRC = [];
function initLightPool() {
  for (let i = 0; i < Q.lights; i++) {
    const L = new THREE.PointLight(16777215, 0, 10, 2);
    L.position.set(0, -60, 0);
    scene.add(L);
    PPOOL.push(L);
  }
  for (let i = 0; i < Q.spots; i++) {
    const S = new THREE.SpotLight(16777215, 0, 30, 0.5, 0.5, 1.2);
    S.position.set(0, -60, 0);
    scene.add(S);
    scene.add(S.target);
    SPOOL.push(S);
  }
}
function lightReq(p, color, intensity, dist, decay = 2, prio = 1) {
  if (intensity < 0.02) return;
  let r = PREQ[PREQ_N];
  if (!r) {
    r = { p: new THREE.Vector3(), c: new THREE.Color(), I: 0, d: 0, k: 2, s: 0 };
    PREQ[PREQ_N] = r;
  }
  PREQ_N++;
  r.p.copy(p);
  if (typeof color === "number") r.c.setHex(color);
  else r.c.copy(color);
  r.I = intensity;
  r.d = dist;
  r.k = decay;
  const dc = p.distanceTo(camera.position);
  r.s = prio * intensity * clamp(1 - dc / (dist + 16), 0.02, 1);
}
var _kc = new THREE.Color();
var SUN_UP = true;
var GRP = GRP;
var SURF_NAME = SURF_NAME;
var PH = PH;
var addStaticCollider = addStaticCollider;
var addStaticCompound = addStaticCompound;
var removeBody = removeBody;
var registerOwner = registerOwner;
var addDynamic = addDynamic;
function impulse(body, ix, iy, iz, rx = 0, ry = 0, rz = 0) {
  body.activate(true);
  PH.v1.setValue(ix, iy, iz);
  PH.v2.setValue(rx, ry, rz);
  body.applyImpulse(PH.v1, PH.v2);
}
var blastImpulse = blastImpulse;
var rayFirst = rayFirst;
var pokeCloth = pokeCloth;
function makeNoise2(seed) {
  let s = seed >>> 0;
  const r = () => {
    s = s * 1664525 + 1013904223 >>> 0;
    return s / 4294967296;
  };
  const perm = new Uint8Array(512), val = new Float32Array(256), base2 = [];
  for (let i = 0; i < 256; i++) {
    base2.push(i);
    val[i] = r();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = base2[i];
    base2[i] = base2[j];
    base2[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = base2[i & 255];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), X = xi & 255, Y = yi & 255;
    const a = val[perm[perm[X] + Y]], b = val[perm[perm[X + 1] + Y]], c = val[perm[perm[X] + Y + 1]], d = val[perm[perm[X + 1] + Y + 1]];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function flameAtlas(S) {
  const C = 4, N = 16, [c, x] = cv(S * C, S * C), img = x.createImageData(S * C, S * C), d = img.data;
  const n1 = makeNoise2(11), n2 = makeNoise2(23);
  const fbm = (n, a, b) => n(a, b) * 0.55 + n(a * 2.03, b * 2.03) * 0.28 + n(a * 4.1, b * 4.1) * 0.17;
  for (let f = 0; f < N; f++) {
    const ox = f % C * S, oy = Math.floor(f / C) * S, tt = f / N;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const u = (px / S - 0.5) * 2, v = py / S, h = 1 - v;
      const y0 = h * 2.6 - tt * 2.6, y1 = h * 2.6 - (tt - 1) * 2.6;
      const sway = fbm(n1, u * 1.3 + 7, y0) * (1 - tt) + fbm(n1, u * 1.3 + 7, y1) * tt - 0.5;
      const w = 0.6 * Math.pow(1 - h, 0.6) + 0.05;
      const r = Math.abs(u + sway * 0.9 * h) / w;
      let a = clamp(1 - r, 0, 1) * smoothstepJS(1, 0.84, v);
      const brk = fbm(n2, u * 2.6 + 3, y0 * 1.6) * (1 - tt) + fbm(n2, u * 2.6 + 3, y1 * 1.6) * tt;
      a *= smoothstepJS(h * 0.9 - 0.12, h * 0.9 + 0.2, brk + 0.3 * (1 - h));
      a = Math.pow(a, 0.85);
      const core = Math.pow(clamp(1 - r * 1.7, 0, 1), 2) * (1 - h * 0.8);
      const i = ((oy + py) * S * C + ox + px) * 4;
      d[i] = 255;
      d[i + 1] = Math.round(150 + 105 * core);
      d[i + 2] = Math.round(70 + 185 * core * core);
      d[i + 3] = Math.round(255 * a);
    }
  }
  x.putImageData(img, 0, 0);
  return texOf(c);
}
function smokeAtlas(S) {
  const C = 2, [c, x] = cv(S * C, S * C), img = x.createImageData(S * C, S * C), d = img.data;
  const n1 = makeNoise2(5);
  const fbm = (a, b) => n1(a, b) * 0.5 + n1(a * 2.1, b * 2.1) * 0.3 + n1(a * 4.3, b * 4.3) * 0.2;
  const D2 = new Float32Array(S * S);
  for (let f = 0; f < C * C; f++) {
    const ox = f % C * S, oy = Math.floor(f / C) * S;
    const blobs = [];
    for (let k = 0; k < 9; k++) {
      const a = rnd2() * 6.283, rr = rnd2() * 0.28;
      blobs.push([Math.cos(a) * rr, Math.sin(a) * rr, 0.16 + rnd2() * 0.17]);
    }
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const u = px / S * 2 - 1, v = py / S * 2 - 1;
      let den = 0;
      for (const [bx, by, br] of blobs) {
        const q = ((u - bx) ** 2 + (v - by) ** 2) / (br * br);
        den += Math.exp(-q * 1.6);
      }
      den *= 0.25 + 1 * fbm(u * 2.2 + f * 3.1, v * 2.2 + f * 1.7);
      den = smoothstepJS(0.12, 0.95, den);
      den *= Math.pow(smoothstepJS(1, 0.15, Math.hypot(u, v)), 1.2);
      D2[py * S + px] = clamp(den, 0, 1);
    }
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const at = (xx, yy) => D2[clamp(yy, 0, S - 1) * S + clamp(xx, 0, S - 1)];
      const gx = at(px + 2, py) - at(px - 2, py), gy = at(px, py + 2) - at(px, py - 2);
      const den = D2[py * S + px];
      const i = ((oy + py) * S * C + ox + px) * 4;
      d[i] = Math.round(clamp(0.5 - gx * 1.6, 0, 1) * 255);
      d[i + 1] = Math.round(clamp(0.5 + gy * 1.6, 0, 1) * 255);
      d[i + 2] = Math.round(clamp(den, 0, 1) * 255);
      d[i + 3] = Math.round(clamp(Math.pow(den, 1.3) * 0.9, 0, 1) * 255);
    }
  }
  x.putImageData(img, 0, 0);
  const t = texOf(c, false);
  return t;
}
var Chips = class {
  constructor(geo, mat, max = 400) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.userData.nomerge = true;
    this.max = max;
    this.P = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    scene.add(this.mesh);
  }
  spawn(p, v, scale, floor = 0, life = 6) {
    this.changed = true;
    if (this.P.length >= this.max) this.P.shift();
    this.P.push({
      p: p.clone(),
      v: v.clone(),
      r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      w: new THREE.Vector3(rnd(-18, 18), rnd(-18, 18), rnd(-18, 18)),
      s: scale.clone ? scale.clone() : new THREE.Vector3(scale, scale, scale),
      floor,
      t: 0,
      life,
      rest: false
    });
  }
  update(dt) {
    const P = this.P;
    if (!P.length) {
      this.mesh.count = 0;
      return;
    }
    let changed = this.changed;
    this.changed = false;
    for (let i = P.length - 1; i >= 0; i--) {
      const c = P[i];
      c.t += dt;
      if (c.t > c.life) {
        P.splice(i, 1);
        changed = true;
        continue;
      }
      if (c.t > c.life - 0.6) changed = true;
      if (c.rest) continue;
      changed = true;
      c.v.y -= 9.81 * dt;
      c.p.addScaledVector(c.v, dt);
      c.r.addScaledVector(c.w, dt);
      if (c.p.y < c.floor + 4e-3) {
        c.p.y = c.floor + 4e-3;
        if (Math.abs(c.v.y) > 0.8) {
          if (this.onBounce && !c.bounced) {
            c.bounced = true;
            this.onBounce(c.p);
          }
          c.v.y *= -0.32;
          c.v.x *= 0.55;
          c.v.z *= 0.55;
          c.w.multiplyScalar(0.5);
        } else {
          c.rest = true;
          if (this.lie) {
            c.r.x = Math.PI / 2;
            c.r.z = 0;
            c.p.y = c.floor + c.s.x * 0.5;
          } else {
            c.r.x = Math.round(c.r.x / Math.PI) * Math.PI;
            c.r.z = Math.round(c.r.z / Math.PI) * Math.PI;
          }
        }
      }
    }
    if (!changed) return;
    const n = Math.min(P.length, this.max);
    for (let i = 0; i < n; i++) {
      const c = P[i];
      const sc = c.t > c.life - 0.6 ? Math.max(0.01, (c.life - c.t) / 0.6) : 1;
      this._e.set(c.r.x, c.r.y, c.r.z);
      this._q.setFromEuler(this._e);
      this._s.copy(c.s).multiplyScalar(sc);
      this._m.compose(c.p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
};
var SND = SND;
var FXS = FXS;
var DEST = { sheets: [], beams: [], glass: [], props: [], broken: 0, dirty: /* @__PURE__ */ new Set() };
var BUDGET = 60;
var HOOKS = { ignite: null, playerBlast: null, charBlast: null, onBreak: null };
var V$3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
var _a = V$3();
var _b = V$3();
var _c = V$3();
var HASH = /* @__PURE__ */ new Map();
var HC = 1;
var hk = (ix, iy, iz) => (ix + 512) * 1048576 + (iy + 64) * 2048 + (iz + 512);
function hashAdd(p, ref) {
  const k = hk(Math.floor(p.x / HC), Math.floor(p.y / HC), Math.floor(p.z / HC));
  let a = HASH.get(k);
  if (!a) {
    a = [];
    HASH.set(k, a);
  }
  a.push(ref);
}
function query(p, r, filter) {
  const out = [];
  const x0 = Math.floor((p.x - r) / HC), x1 = Math.floor((p.x + r) / HC), y0 = Math.floor((p.y - r) / HC), y1 = Math.floor((p.y + r) / HC), z0 = Math.floor((p.z - r) / HC), z1 = Math.floor((p.z + r) / HC);
  const seen = /* @__PURE__ */ new Set();
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    const a = HASH.get(hk(x, y, z));
    if (!a) continue;
    for (const ref of a) {
      if (!refAlive(ref)) continue;
      if (ref.t !== "c") {
        const key = ref.t === "b" ? ref.b : ref.t === "p" ? ref.p : ref.g;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      const pos = refPos(ref, p), d = pos.distanceTo(p);
      if (d <= r && (!filter || filter(ref))) out.push({ ref, pos, d });
    }
  }
  return out;
}
function refAlive(ref) {
  if (ref.t === "c") return ref.s.alive[ref.k] === 1;
  if (ref.t === "b") return !ref.b.dead;
  if (ref.t === "p") return !ref.p.dead;
  if (ref.t === "g") return !ref.g.dead;
  return false;
}
var _rp = V$3();
function refPos(ref, p) {
  if (ref.t === "c") return ref.s.chunkCenter[ref.k];
  if (ref.t === "b") {
    const b = ref.b;
    if (!p) return b.center;
    const t = clamp(_rp.subVectors(p, b.a).dot(b.axis), 0, b.L);
    return V$3().copy(b.a).addScaledVector(b.axis, t);
  }
  if (ref.t === "p") return ref.p.center;
  if (ref.t === "g") return ref.g.center;
}
var quadIdx = (idx, a, b, c, d) => {
  idx.push(a, b, c, a, c, d);
};
var CV = 8;
function createSheet(o) {
  const U = o.U.clone().normalize(), Vv = o.V.clone().normalize();
  const N = new THREE.Vector3().crossVectors(U, Vv).normalize();
  const nu = o.nu, nv = o.nv, w = o.w, h = o.h, t = o.t;
  const cw = w / nu, ch = h / nv;
  const G = [];
  const jit = o.jitter ?? 0.3;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    let u = -w / 2 + i * cw, v = -h / 2 + j * ch;
    if (i > 0 && i < nu) u += sr(-jit, jit) * cw;
    if (j > 0 && j < nv) v += sr(-jit, jit) * ch;
    G.push([u, v]);
  }
  const gp = (i, j) => G[j * (nu + 1) + i];
  const n = nu * nv, pos = new Float32Array(n * CV * 3), nrm = new Float32Array(n * CV * 3), uv = new Float32Array(n * CV * 2);
  const idx = [];
  const W = (u, v, s2) => [o.c.x + U.x * u + Vv.x * v + N.x * s2, o.c.y + U.y * u + Vv.y * v + N.y * s2, o.c.z + U.z * u + Vv.z * v + N.z * s2];
  const d = o.uvd ?? 0.82, ou = srnd() * 3, ov = srnd() * 3;
  const chunkCenter = [];
  let vi = 0;
  const put = (p, nn, uu, vv) => {
    pos.set(p, vi * 3);
    nrm.set(nn, vi * 3);
    uv[vi * 2] = uu;
    uv[vi * 2 + 1] = vv;
    vi++;
  };
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const q = [gp(i, j), gp(i + 1, j), gp(i + 1, j + 1), gp(i, j + 1)];
    const base2 = vi;
    for (const [u, v] of q) put(W(u, v, t / 2), [N.x, N.y, N.z], (u + ou) * d, (v + ov) * d);
    quadIdx(idx, base2, base2 + 1, base2 + 2, base2 + 3);
    const b2 = vi;
    for (let k = 3; k >= 0; k--) {
      const [u, v] = q[k];
      put(W(u, v, -t / 2), [-N.x, -N.y, -N.z], (-u + ou) * d, (v + ov) * d);
    }
    quadIdx(idx, b2, b2 + 1, b2 + 2, b2 + 3);
    let cu = 0, cv2 = 0;
    for (const [u, v] of q) {
      cu += u / 4;
      cv2 += v / 4;
    }
    chunkCenter.push(new THREE.Vector3(...W(cu, cv2, t / 2)));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  fixWinding(g);
  const tint = o.tint || [1, 1, 1];
  tintGeo(g, tint[0], tint[1], tint[2]);
  const s = {
    id: DEST.sheets.length,
    c: o.c.clone(),
    U,
    V: Vv,
    N,
    w,
    h,
    t,
    nu,
    nv,
    cw,
    ch,
    G,
    alive: new Uint8Array(n).fill(1),
    hp: new Float32Array(n).fill(o.hp ?? 100),
    char: new Float32Array(n),
    chunkCenter,
    mat: o.mat,
    tint,
    colDepth: o.colDepth ?? 0.08,
    kind: o.kind || "wall",
    body: null,
    mesh: null,
    base: 0,
    deadN: 0,
    surf: "wood"
  };
  g.userData.group = "dest";
  g.userData.onBaked = (mesh, start) => {
    s.mesh = mesh;
    s.base = start;
  };
  bucket(o.mat).push(g);
  DEST.sheets.push(s);
  for (let k = 0; k < n; k++) hashAdd(chunkCenter[k], { t: "c", s, k });
  return s;
}
function fixWinding(g) {
  const p = g.attributes.position, nn = g.attributes.normal, ix = g.index.array;
  const vn = V$3();
  for (let i = 0; i < ix.length; i += 3) {
    _a.fromBufferAttribute(p, ix[i]);
    _b.fromBufferAttribute(p, ix[i + 1]);
    _c.fromBufferAttribute(p, ix[i + 2]);
    _b.sub(_a);
    _c.sub(_a);
    _a.crossVectors(_b, _c);
    vn.fromBufferAttribute(nn, ix[i]);
    if (_a.dot(vn) < 0) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
  }
}
var EDGE_POOLS = {};
var EDGE_OF = /* @__PURE__ */ new Map();
function edgePool(mat) {
  if (EDGE_POOLS[mat]) return EDGE_POOLS[mat];
  const MAXQ = Q.debris >= 400 ? 9e3 : 5e3, NV = MAXQ * 4;
  const g = new THREE.BufferGeometry();
  const mk = (n) => new THREE.BufferAttribute(new Float32Array(NV * n), n).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute("position", mk(3));
  g.setAttribute("normal", mk(3));
  g.setAttribute("uv", mk(2));
  g.setAttribute("color", mk(3));
  g.setAttribute("aBurn", mk(2));
  const idx = new Uint32Array(MAXQ * 6);
  for (let i = 0; i < MAXQ; i++) {
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const m = new THREE.Mesh(g, M[mat]);
  m.castShadow = true;
  m.receiveShadow = true;
  m.frustumCulled = false;
  m.userData.nomerge = true;
  scene.add(m);
  return EDGE_POOLS[mat] = { mesh: m, g, free: [], next: 0, MAXQ };
}
function neighbor(s, k, e) {
  const i = k % s.nu, j = k / s.nu | 0;
  const [di, dj] = [[0, -1], [1, 0], [0, 1], [-1, 0]][e];
  const ii = i + di, jj = j + dj;
  return ii < 0 || jj < 0 || ii >= s.nu || jj >= s.nv ? -1 : jj * s.nu + ii;
}
var _en = V$3();
var _ea = V$3();
var _eb = V$3();
function edgeAdd(s, k, e) {
  const P = edgePool(s.mat);
  let slot = P.free.length ? P.free.pop() : P.next < P.MAXQ ? P.next++ : -1;
  if (slot < 0) return;
  const q = chunkPoly(s, k), [u0, v0] = q[e], [u1, v1] = q[(e + 1) % 4];
  const W = (u, v, n) => V$3(s.c.x + s.U.x * u + s.V.x * v + s.N.x * n, s.c.y + s.U.y * u + s.V.y * v + s.N.y * n, s.c.z + s.U.z * u + s.V.z * v + s.N.z * n);
  let pts = [W(u0, v0, s.t / 2), W(u0, v0, -s.t / 2), W(u1, v1, -s.t / 2), W(u1, v1, s.t / 2)];
  _ea.subVectors(pts[1], pts[0]);
  _eb.subVectors(pts[3], pts[0]);
  const ex = V$3().subVectors(W(u1, v1, 0), W(u0, v0, 0)).normalize();
  _en.crossVectors(ex, s.N).normalize();
  if (V$3().crossVectors(_ea, V$3().subVectors(pts[2], pts[0])).dot(_en) < 0) pts = [pts[0], pts[3], pts[2], pts[1]];
  const g = P.g, b = slot * 4, el = Math.hypot(u1 - u0, v1 - v0) * 0.82;
  const ch = s.char[k];
  for (let i = 0; i < 4; i++) {
    g.attributes.position.setXYZ(b + i, pts[i].x, pts[i].y, pts[i].z);
    g.attributes.normal.setXYZ(b + i, _en.x, _en.y, _en.z);
    g.attributes.color.setXYZ(b + i, s.tint[0] * 0.92, s.tint[1] * 0.88, s.tint[2] * 0.8);
    g.attributes.aBurn.setXY(b + i, ch, 0);
  }
  g.attributes.uv.setXY(b, 0, 0);
  g.attributes.uv.setXY(b + 1, 0, 0.01);
  g.attributes.uv.setXY(b + 2, el, 0.01);
  g.attributes.uv.setXY(b + 3, el, 0);
  for (const a of ["position", "normal", "color", "aBurn", "uv"]) {
    const at = g.attributes[a];
    at.addUpdateRange(b * at.itemSize, 4 * at.itemSize);
    at.needsUpdate = true;
  }
  const key = s.id * 4096 + k;
  let arr = EDGE_OF.get(key);
  if (!arr) {
    arr = [];
    EDGE_OF.set(key, arr);
  }
  arr.push({ P, slot });
}
function edgeRemoveChunk(s, k) {
  const key = s.id * 4096 + k, arr = EDGE_OF.get(key);
  if (!arr) return;
  for (const { P, slot } of arr) {
    const pa = P.g.attributes.position, b = slot * 4;
    for (let i = 0; i < 4; i++) pa.setXYZ(b + i, 0, -50, 0);
    pa.addUpdateRange(b * 3, 12);
    pa.needsUpdate = true;
    P.free.push(slot);
  }
  EDGE_OF.delete(key);
}
var _sm = new THREE.Matrix4();
function sheetQuat(s) {
  _sm.makeBasis(s.U, s.V, s.N);
  return new THREE.Quaternion().setFromRotationMatrix(_sm);
}
function rebuildSheetBody(s) {
  if (s.body) {
    removeBody(s.body);
    s.body = null;
  }
  const parts = [];
  const nOff = s.t / 2 - s.colDepth / 2;
  const add = (u0, u1, v0, v1) => {
    const u = (u0 + u1) / 2, v = (v0 + v1) / 2;
    parts.push({
      cx: s.c.x + s.U.x * u + s.V.x * v + s.N.x * nOff,
      cy: s.c.y + s.U.y * u + s.V.y * v + s.N.y * nOff,
      cz: s.c.z + s.U.z * u + s.V.z * v + s.N.z * nOff,
      hx: (u1 - u0) / 2,
      hy: (v1 - v0) / 2,
      hz: s.colDepth / 2
    });
  };
  if (s.deadN === 0) add(-s.w / 2, s.w / 2, -s.h / 2, s.h / 2);
  else for (let i = 0; i < s.nu; i++) {
    let j = 0;
    while (j < s.nv) {
      if (!s.alive[j * s.nu + i]) {
        j++;
        continue;
      }
      const j0 = j;
      while (j < s.nv && s.alive[j * s.nu + i]) j++;
      add(-s.w / 2 + i * s.cw, -s.w / 2 + (i + 1) * s.cw, -s.h / 2 + j0 * s.ch, -s.h / 2 + j * s.ch);
    }
  }
  if (!parts.length) return;
  s.body = addStaticCompound(parts, sheetQuat(s), s.owner, s.c);
}
function chunkAt(s, p) {
  _a.subVectors(p, s.c);
  const u = _a.dot(s.U), v = _a.dot(s.V);
  const i = clamp(Math.floor((u + s.w / 2) / s.cw), 0, s.nu - 1), j = clamp(Math.floor((v + s.h / 2) / s.ch), 0, s.nv - 1);
  return j * s.nu + i;
}
function collapseRange(mesh, start, count, center) {
  const pa = mesh.geometry.attributes.position;
  for (let i = start; i < start + count; i++) pa.setXYZ(i, center.x, center.y, center.z);
  pa.addUpdateRange(start * 3, count * 3);
  pa.needsUpdate = true;
}
function breakChunk(s, k, dir, power, mode) {
  if (!s.alive[k]) return;
  s.alive[k] = 0;
  s.deadN++;
  DEST.broken++;
  const cc = s.chunkCenter[k];
  if (s.mesh) collapseRange(s.mesh, s.base + k * CV, CV, cc);
  edgeRemoveChunk(s, k);
  for (let e = 0; e < 4; e++) {
    const nb = neighbor(s, k, e);
    if (nb >= 0 && s.alive[nb]) edgeAdd(s, nb, (e + 2) % 4);
  }
  FXS.decals.removeKey(s.id * 4096 + k);
  DEST.dirty.add(s);
  spawnChunkDebris(s, k, dir, power, mode);
  if (HOOKS.onBreak) HOOKS.onBreak("chunk", cc, mode);
}
function dropIslands(s, dir) {
  const nu = s.nu, nv = s.nv, seen = new Uint8Array(nu * nv), stack = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const k = j * nu + i;
    if ((i === 0 || j === 0 || i === nu - 1 || j === nv - 1) && s.alive[k]) {
      seen[k] = 1;
      stack.push(k);
    }
  }
  while (stack.length) {
    const k = stack.pop(), i = k % nu, j = k / nu | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nu || jj >= nv) continue;
      const q = jj * nu + ii;
      if (!seen[q] && s.alive[q]) {
        seen[q] = 1;
        stack.push(q);
      }
    }
  }
  for (let k = 0; k < nu * nv; k++) if (s.alive[k] && !seen[k]) breakChunk(s, k, dir, 0.3, "fall");
  if (s.deadN > nu * nv * 0.8) {
    for (let k = 0; k < nu * nv; k++) if (s.alive[k]) breakChunk(s, k, dir, 0.2, "fall");
  }
}
function chunkPoly(s, k) {
  const i = k % s.nu, j = k / s.nu | 0, G = s.G, nu1 = s.nu + 1;
  return [G[j * nu1 + i], G[j * nu1 + i + 1], G[(j + 1) * nu1 + i + 1], G[(j + 1) * nu1 + i]].map((p) => [p[0], p[1]]);
}
function splitPoly(poly) {
  let cx = 0, cy = 0;
  for (const p of poly) {
    cx += p[0] / poly.length;
    cy += p[1] / poly.length;
  }
  const a = Math.random() * Math.PI, nx = Math.cos(a), ny = Math.sin(a);
  const A2 = [], B = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const dp = (p[0] - cx) * nx + (p[1] - cy) * ny, dq = (q[0] - cx) * nx + (q[1] - cy) * ny;
    (dp >= 0 ? A2 : B).push(p);
    if (dp >= 0 !== dq >= 0) {
      const t = dp / (dp - dq);
      const m = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      A2.push(m);
      B.push(m);
    }
  }
  return [A2, B].filter((P) => P.length >= 3);
}
function spawnChunkDebris(s, k, dir, power, mode) {
  const poly = chunkPoly(s, k);
  const split = BUDGET > 20 && (mode === "blast" ? Math.random() < 0.7 : mode === "bullet" ? Math.random() < 0.5 : false);
  const pieces = BUDGET <= 0 ? [] : split ? splitPoly(poly) : [poly];
  BUDGET -= pieces.length;
  const charred = s.char[k];
  const q = sheetQuat(s);
  for (const P of pieces) {
    let cu = 0, cv2 = 0;
    for (const p of P) {
      cu += p[0] / P.length;
      cv2 += p[1] / P.length;
    }
    const shape = new THREE.Shape(P.map((p) => new THREE.Vector2(p[0] - cu, p[1] - cv2)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: s.t, bevelEnabled: false });
    g.translate(0, 0, -s.t / 2);
    const uv = g.attributes.uv, pa = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pa.getX(i) + cu) * 0.82, (pa.getY(i) + cv2) * 0.82);
    tintGeo(g, s.tint[0], s.tint[1], s.tint[2]);
    const nb = new Float32Array(pa.count * 2);
    for (let i = 0; i < pa.count; i++) {
      nb[i * 2] = charred;
      nb[i * 2 + 1] = mode === "fire" ? 1 : 0;
    }
    g.setAttribute("aBurn", new THREE.BufferAttribute(nb, 2));
    const mesh = new THREE.Mesh(g, M[s.mat] || M.osb);
    mesh.userData.ownGeo = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.quaternion.copy(q);
    mesh.position.set(s.c.x + s.U.x * cu + s.V.x * cv2, s.c.y + s.U.y * cu + s.V.y * cv2, s.c.z + s.U.z * cu + s.V.z * cv2);
    scene.add(mesh);
    let mu = 1e9, Mu = -1e9, mv = 1e9, Mv = -1e9;
    for (const p of P) {
      mu = Math.min(mu, p[0]);
      Mu = Math.max(Mu, p[0]);
      mv = Math.min(mv, p[1]);
      Mv = Math.max(Mv, p[1]);
    }
    const sp = power * (mode === "blast" ? 9 : mode === "bullet" ? 1.6 : 0.4);
    const vel = dir.clone().multiplyScalar(sp).add(V$3(rnd(-0.6, 0.6), rnd(0, 1) * (mode === "blast" ? 2 : 0.5), rnd(-0.6, 0.6)));
    addDynamic(mesh, {
      size: [Math.max(0.02, Mu - mu), Math.max(0.02, Mv - mv), s.t * 1.6],
      mass: Math.max(0.15, (Mu - mu) * (Mv - mv) * s.t * 620),
      vel,
      spin: V$3(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8)).multiplyScalar(mode === "blast" ? 1 : 0.4),
      friction: 0.8,
      restitution: 0.12,
      life: sr(25, 40),
      surf: "wood",
      group: GRP.DEBRIS
    });
  }
  const cc = s.chunkCenter[k];
  const nChips = (mode === "blast" ? 6 : mode === "bullet" ? 4 : 2) + (pieces.length ? 0 : 4);
  const fl = floorBelow(cc);
  for (let i = 0; i < nChips; i++) {
    const v = dir.clone().multiplyScalar(rnd(1, 4) * (mode === "blast" ? 2 : 1)).add(V$3(rnd(-1.5, 1.5), rnd(0, 2.5), rnd(-1.5, 1.5)));
    FXS.splinters.spawn(cc, v, V$3(rnd(0.08, 0.22), rnd(6e-3, 0.012), rnd(0.012, 0.03)), fl, rnd(6, 12));
  }
  FXS.dust.spawn({
    p: cc,
    v: dir.clone().multiplyScalar(0.6).add(V$3(0, 0.2, 0)),
    life: rnd(1.5, 3),
    s0: 0.25,
    s1: 1.1,
    col: mode === "fire" ? [0.18, 0.16, 0.15] : [0.72, 0.62, 0.48],
    a0: 0.35,
    a1: 0,
    drag: 1.5,
    g: 0.05
  });
}
function floorBelow(p) {
  const h = rayFirst(_b.set(p.x, p.y + 0.05, p.z), _c.set(p.x, p.y - 30, p.z), GRP.STATIC);
  if (!h) return floorDepthAt(p.x, p.z);
  return Math.abs(h.p.y) < 0.02 ? h.p.y + floorDepthAt(p.x, p.z) : h.p.y;
}
function createBeam(o) {
  const a = o.a.clone(), b = o.b.clone();
  const axis = V$3().subVectors(b, a);
  const L = axis.length();
  axis.normalize();
  const up = Math.abs(axis.y) > 0.9 ? V$3(1, 0, 0) : V$3(0, 1, 0);
  const side = o.side ? o.side.clone().normalize() : V$3().crossVectors(up, axis).normalize();
  const other = V$3().crossVectors(axis, side).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, other, axis));
  const center = V$3().addVectors(a, b).multiplyScalar(0.5);
  const g = new THREE.BoxGeometry(o.sx, o.sy, L);
  const uv = g.attributes.uv;
  const dd = o.uvd ?? 0.9;
  const s = [[L, o.sy], [L, o.sy], [o.sx, L], [o.sx, L], [o.sx, o.sy], [o.sx, o.sy]];
  const ro = srnd() * 2;
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    let u = uv.getX(k) * s[f][0] * dd, v = uv.getY(k) * s[f][1] * dd;
    if (s[f][1] > s[f][0]) {
      const t = u;
      u = v;
      v = t;
    }
    uv.setXY(k, u + ro, v);
  }
  g.applyMatrix4(new THREE.Matrix4().compose(center, q, V$3(1, 1, 1)));
  if (o.tint) tintGeo(g, ...o.tint);
  const bm = {
    id: DEST.beams.length,
    a,
    b,
    L,
    axis,
    side,
    q,
    center,
    sx: o.sx,
    sy: o.sy,
    mat: o.mat || "wood",
    hp: o.hp ?? 260,
    wood: o.wood !== false,
    char: 0,
    dead: false,
    mesh: null,
    base: 0,
    count: 24,
    collide: o.collide !== false,
    noPlayer: !!o.noPlayer,
    tint: o.tint || [1, 1, 1],
    surf: o.surf || (o.wood === false ? "metal" : "wood"),
    fragile: o.fragile ?? 1
  };
  g.userData.group = "dest";
  g.userData.onBaked = (mesh, start) => {
    bm.mesh = mesh;
    bm.base = start;
  };
  bucket(bm.mat).push(g);
  DEST.beams.push(bm);
  const nPts = Math.max(1, Math.round(L / 0.8));
  for (let i = 0; i < nPts; i++) hashAdd(V$3().lerpVectors(a, b, (i + 0.5) / nPts), { t: "b", b: bm });
  return bm;
}
function beamBody(bm) {
  const c = {
    cx: bm.center.x,
    cy: bm.center.y,
    cz: bm.center.z,
    hx: bm.sx / 2,
    hy: bm.sy / 2,
    hz: bm.L / 2,
    q: [bm.q.x, bm.q.y, bm.q.z, bm.q.w],
    surf: bm.surf,
    noPlayer: bm.noPlayer
  };
  bm.body = addStaticCollider(c, bm.owner);
}
function breakBeam(bm, hitP, dir, power, mode) {
  if (bm.dead) return;
  bm.dead = true;
  DEST.broken++;
  if (bm.mesh) collapseRange(bm.mesh, bm.base, bm.count, bm.center);
  if (bm.body) {
    removeBody(bm.body);
    bm.body = null;
  }
  FXS.decals.removeKey(1e5 + bm.id);
  const t = hitP ? clamp(V$3().subVectors(hitP, bm.a).dot(bm.axis), 0.12, bm.L - 0.12) : bm.L * sr(0.3, 0.7);
  for (const [t0, t1] of [[0, t], [t, bm.L]]) {
    const len = t1 - t0;
    if (len < 0.1) continue;
    const g = new THREE.BoxGeometry(bm.sx, bm.sy, len, 1, 1, 2);
    const pa = g.attributes.position, brokenEnd = t0 === 0 ? len / 2 : -len / 2;
    for (let i = 0; i < pa.count; i++)
      if (Math.abs(pa.getZ(i) - brokenEnd) < 1e-4) pa.setZ(i, pa.getZ(i) + (brokenEnd > 0 ? 1 : -1) * rnd(-0.07, 0.05));
    g.computeVertexNormals();
    tintGeo(g, ...bm.tint);
    const nb = new Float32Array(pa.count * 2);
    for (let i = 0; i < pa.count; i++) {
      nb[i * 2] = bm.char;
      nb[i * 2 + 1] = mode === "fire" ? 0.8 : 0;
    }
    g.setAttribute("aBurn", new THREE.BufferAttribute(nb, 2));
    const mesh = new THREE.Mesh(g, M[bm.mat] || M.wood);
    mesh.userData.ownGeo = true;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.quaternion.copy(bm.q);
    mesh.position.copy(bm.a).addScaledVector(bm.axis, (t0 + t1) / 2);
    scene.add(mesh);
    const k = mode === "blast" ? power * 6 : 0.6 * power;
    const vel = dir.clone().multiplyScalar(k).add(V$3(rnd(-0.3, 0.3), mode === "blast" ? rnd(0.5, 2) : 0, rnd(-0.3, 0.3)));
    addDynamic(mesh, {
      size: [bm.sx, bm.sy, len],
      mass: bm.sx * bm.sy * len * 520,
      vel,
      spin: V$3(rnd(-2, 2), rnd(-2, 2), rnd(-2, 2)).multiplyScalar(mode === "blast" ? 2 : 0.5),
      life: sr(40, 70),
      group: GRP.DYN,
      friction: 0.8,
      restitution: 0.08,
      surf: bm.surf
    });
  }
  const hp = hitP || bm.center;
  const fl = floorBelow(hp);
  for (let i = 0; i < 8; i++) FXS.splinters.spawn(
    hp,
    dir.clone().multiplyScalar(rnd(1, 3)).add(V$3(rnd(-1.5, 1.5), rnd(0, 2), rnd(-1.5, 1.5))),
    V$3(rnd(0.08, 0.3), rnd(8e-3, 0.02), rnd(0.012, 0.03)),
    fl,
    rnd(8, 14)
  );
  if (bm.wood) SND.wood(hp, 1.2);
  else SND.hit(hp, "metal");
  if (HOOKS.onBreak) HOOKS.onBreak("beam", hp, mode);
}
function registerGlass(mesh, o = {}) {
  mesh.updateWorldMatrix(true, false);
  const gl = {
    id: DEST.glass.length,
    mesh,
    w: mesh.userData.glass.w,
    h: mesh.userData.glass.h,
    hp: o.hp ?? 2,
    dead: false,
    center: V$3().setFromMatrixPosition(mesh.matrixWorld),
    q: new THREE.Quaternion().setFromRotationMatrix(mesh.matrixWorld),
    playerCollide: !!o.playerCollide
  };
  gl.N = V$3(0, 0, 1).applyQuaternion(gl.q);
  gl.U = V$3(1, 0, 0).applyQuaternion(gl.q);
  gl.Vv = V$3(0, 1, 0).applyQuaternion(gl.q);
  DEST.glass.push(gl);
  hashAdd(gl.center, { t: "g", g: gl });
  return gl;
}
function instanceGlass() {
  const groups = /* @__PURE__ */ new Map();
  for (const gl of DEST.glass) {
    const m = gl.mesh;
    if (!m || !m.parent || m.isInstancedMesh || Array.isArray(m.material)) continue;
    if (!groups.has(m.material)) groups.set(m.material, []);
    groups.get(m.material).push(gl);
  }
  const unit = new THREE.PlaneGeometry(1, 1), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const mw = new THREE.Matrix4(), sc = new THREE.Matrix4(), box = new THREE.Box3(), size = new THREE.Vector3(), ctr = new THREE.Vector3();
  for (const [mat, list] of groups) {
    if (list.length < 2) continue;
    const im = new THREE.InstancedMesh(unit, mat, list.length);
    im.userData.nomerge = true;
    im.castShadow = false;
    im.receiveShadow = list[0].mesh.receiveShadow;
    im.renderOrder = list[0].mesh.renderOrder;
    list.forEach((gl, i) => {
      const m = gl.mesh;
      m.updateWorldMatrix(true, false);
      m.geometry.computeBoundingBox();
      box.copy(m.geometry.boundingBox);
      box.getSize(size);
      box.getCenter(ctr);
      mw.copy(m.matrixWorld).multiply(sc.makeTranslation(ctr.x, ctr.y, ctr.z)).multiply(sc.makeScale(size.x || 1, size.y || 1, 1));
      im.setMatrixAt(i, mw);
      m.removeFromParent();
      gl.mesh = { material: mat, set visible(v) {
        if (!v) {
          im.setMatrixAt(i, zero);
          im.instanceMatrix.needsUpdate = true;
        }
      } };
    });
    im.computeBoundingSphere();
    scene.add(im);
  }
}
function glassBody(gl) {
  const c = {
    cx: gl.center.x,
    cy: gl.center.y,
    cz: gl.center.z,
    hx: gl.w / 2,
    hy: gl.h / 2,
    hz: 0.012,
    q: [gl.q.x, gl.q.y, gl.q.z, gl.q.w],
    surf: "glass",
    noPlayer: !gl.playerCollide
  };
  gl.body = addStaticCollider(c, gl.owner);
}
function clipRect(poly, hw, hh) {
  const clip = (P2, f) => {
    const out = [];
    for (let i = 0; i < P2.length; i++) {
      const a = P2[i], b = P2[(i + 1) % P2.length], fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if (fa >= 0 !== fb >= 0) {
        const t = fa / (fa - fb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  };
  let P = poly;
  for (const f of [(p) => p[0] + hw, (p) => hw - p[0], (p) => p[1] + hh, (p) => hh - p[1]]) {
    P = clip(P, f);
    if (P.length < 3) return null;
  }
  return P;
}
function shatterGlass(gl, hitP, dir, power) {
  if (gl.dead) return;
  gl.dead = true;
  DEST.broken++;
  if (gl.body) {
    removeBody(gl.body);
    gl.body = null;
  }
  gl.mesh.visible = false;
  FXS.decals.removeKey(2e5 + gl.id);
  const hp = hitP || gl.center;
  _a.subVectors(hp, gl.center);
  const iu = clamp(_a.dot(gl.U), -gl.w / 2, gl.w / 2), iv = clamp(_a.dot(gl.Vv), -gl.h / 2, gl.h / 2);
  const spokes = 9 + Math.floor(Math.random() * 5);
  const rings = [0.08, 0.22, 0.45, 0.8, 1.3].map((r) => r * Math.max(gl.w, gl.h));
  const ang = [];
  for (let i = 0; i < spokes; i++) ang.push((i + rnd(-0.3, 0.3)) / spokes * Math.PI * 2);
  const P = (a, r) => [iu + Math.cos(a) * r, iv + Math.sin(a) * r];
  const stay = [], fall = [];
  for (let s = 0; s < spokes; s++) for (let r = 0; r < rings.length; r++) {
    const a0 = ang[s], a1 = ang[(s + 1) % spokes] + (s === spokes - 1 ? Math.PI * 2 : 0);
    const r0 = r === 0 ? 0 : rings[r - 1] * rnd(0.9, 1.1), r1 = rings[r] * rnd(0.9, 1.1);
    const poly = r === 0 ? [[iu, iv], P(a0, r1), P(a1, r1)] : [P(a0, r0), P(a0, r1), P(a1, r1), P(a1, r0)];
    const cp = clipRect(poly, gl.w / 2, gl.h / 2);
    if (!cp) continue;
    const onEdge = cp.some((p) => Math.abs(Math.abs(p[0]) - gl.w / 2) < 1e-3 || Math.abs(Math.abs(p[1]) - gl.h / 2) < 1e-3);
    (onEdge && r >= 2 && Math.random() < 0.4 ? stay : fall).push(cp);
  }
  if (stay.length) {
    const parts = stay.map((cp) => new THREE.ShapeGeometry(new THREE.Shape(cp.map((p) => new THREE.Vector2(p[0], p[1])))));
    const g = BGU.mergeGeometries(parts, false);
    if (g) {
      const m = new THREE.Mesh(g, gl.mesh.material);
      m.position.copy(gl.center);
      m.quaternion.copy(gl.q);
      m.userData.nomerge = true;
      scene.add(m);
      gl.remnant = m;
    }
  }
  let dynLeft = Q.debris >= 400 ? 14 : 7;
  const area = (cp) => {
    let s = 0;
    for (let i = 0; i < cp.length; i++) {
      const a = cp[i], b = cp[(i + 1) % cp.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  };
  for (const cp of fall) {
    let cu = 0, cv2 = 0;
    for (const p of cp) {
      cu += p[0] / cp.length;
      cv2 += p[1] / cp.length;
    }
    const wp = V$3().copy(gl.center).addScaledVector(gl.U, cu).addScaledVector(gl.Vv, cv2);
    const A2 = area(cp);
    const out = dir.clone().multiplyScalar(power * rnd(1, 3)).add(V$3(rnd(-0.5, 0.5), rnd(-0.2, 0.6), rnd(-0.5, 0.5)));
    if (A2 > 0.01 && dynLeft-- > 0) {
      const shape = new THREE.Shape(cp.map((p) => new THREE.Vector2(p[0] - cu, p[1] - cv2)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: 6e-3, bevelEnabled: false });
      const m = new THREE.Mesh(g, gl.mesh.material);
      m.userData.ownGeo = true;
      m.position.copy(wp);
      m.quaternion.copy(gl.q);
      m.castShadow = true;
      scene.add(m);
      let mu = 1e9, Mu = -1e9, mv = 1e9, Mv = -1e9;
      for (const p of cp) {
        mu = Math.min(mu, p[0]);
        Mu = Math.max(Mu, p[0]);
        mv = Math.min(mv, p[1]);
        Mv = Math.max(Mv, p[1]);
      }
      addDynamic(m, {
        size: [Mu - mu, Mv - mv, 0.012],
        mass: A2 * 6e-3 * 2500,
        vel: out,
        spin: V$3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)),
        life: sr(12, 20),
        friction: 0.5,
        restitution: 0.05,
        surf: "glass",
        group: GRP.DEBRIS
      });
    } else {
      const fl = floorBelow(wp);
      for (let i = 0; i < 2; i++) FXS.glassChips.spawn(
        wp,
        out.clone().add(V$3(rnd(-1, 1), rnd(0, 1), rnd(-1, 1))),
        V$3(rnd(0.02, 0.07), rnd(0.02, 0.07), 1),
        fl,
        rnd(8, 15)
      );
    }
  }
  SND.glass(hp, 14);
  if (HOOKS.onBreak) HOOKS.onBreak("glass", hp, "blast");
}
var PROP_BAKE = [];
function registerProp(group, o = {}) {
  group.userData.nomerge = true;
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(V$3()), size = box.getSize(V$3());
  const p = {
    group,
    hp: o.hp ?? 150,
    dead: false,
    wood: o.wood ?? true,
    surf: o.surf || "wood",
    center,
    col: o.col || { cx: center.x, cy: center.y, cz: center.z, hx: size.x / 2, hy: size.y / 2, hz: size.z / 2, q: null },
    onBreak: o.onBreak || null,
    explosive: !!o.explosive,
    target: !!o.target,
    mass: o.mass ?? 8,
    burnHp: o.burnHp ?? 1,
    parts: [],
    ranges: []
  };
  group.traverse((m) => {
    if (!m.isMesh) return;
    p.parts.push({ geo: m.geometry, mat: m.material, mw: m.matrixWorld.clone(), cast: m.castShadow });
    if (Array.isArray(m.material)) return;
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    g.userData = { group: "prop", onBaked: (mesh, start, count) => p.ranges.push([mesh, start, count]) };
    PROP_BAKE.push({ geo: g, mat: m.material, cast: m.castShadow, recv: m.receiveShadow, order: m.renderOrder });
  });
  group.removeFromParent();
  DEST.props.push(p);
  hashAdd(center, { t: "p", p });
  return p;
}
function propBody(p) {
  const c = Object.assign({ surf: p.surf }, p.col);
  p.body = addStaticCollider(c, p.owner);
}
function breakProp(p, hitP, dir, power, mode) {
  if (p.dead) return;
  p.dead = true;
  DEST.broken++;
  if (p.body) {
    removeBody(p.body);
    p.body = null;
  }
  for (const [mesh, start, count] of p.ranges) collapseRange(mesh, start, count, p.center);
  const n = p.parts.length;
  const wq = new THREE.Quaternion(), ws = V$3(), wpos = V$3();
  for (const part of p.parts) {
    const g = part.geo;
    g.computeBoundingBox();
    const sz = g.boundingBox.getSize(V$3()), ctr = g.boundingBox.getCenter(V$3());
    const wp = ctr.clone().applyMatrix4(part.mw);
    part.mw.decompose(wpos, wq, ws);
    const geo = g.clone();
    geo.translate(-ctr.x, -ctr.y, -ctr.z);
    ensureColorGeo(geo, part.mat);
    const nm = new THREE.Mesh(geo, part.mat);
    nm.userData.ownGeo = true;
    nm.position.copy(wp);
    nm.quaternion.copy(wq);
    nm.scale.copy(ws);
    nm.castShadow = true;
    nm.receiveShadow = true;
    scene.add(nm);
    const away = V$3().subVectors(wp, hitP || p.center).normalize();
    const k = mode === "blast" ? power * 7 : 1.2;
    addDynamic(nm, {
      size: [Math.max(0.02, sz.x * ws.x), Math.max(0.02, sz.y * ws.y), Math.max(0.02, sz.z * ws.z)],
      mass: Math.max(0.3, p.mass / n),
      vel: away.multiplyScalar(k).addScaledVector(dir, k * 0.5).add(V$3(0, mode === "blast" ? rnd(1, 3) : 0.5, 0)),
      spin: V$3(rnd(-5, 5), rnd(-5, 5), rnd(-5, 5)),
      life: sr(35, 60),
      group: n > 12 ? GRP.DEBRIS : GRP.DYN,
      surf: p.surf
    });
  }
  if (p.explosive && HOOKS.barrel) HOOKS.barrel(p);
  if (p.wood) SND.wood(p.center, 1.5);
  if (p.onBreak) p.onBreak(p, hitP, dir, power, mode);
  if (HOOKS.onBreak) HOOKS.onBreak("prop", p.center, mode);
}
function initDestructiblePhysics() {
  for (const s of DEST.sheets) {
    s.owner = registerOwner({ type: "sheet", s });
    rebuildSheetBody(s);
  }
  for (const b of DEST.beams) {
    b.owner = registerOwner({ type: "beam", b });
    if (b.collide) beamBody(b);
  }
  for (const g of DEST.glass) {
    g.owner = registerOwner({ type: "glass", g });
    glassBody(g);
  }
  for (const p of DEST.props) {
    p.owner = registerOwner({ type: "prop", p });
    propBody(p);
  }
}
function flushDestruction() {
  let guard = 0;
  while (DEST.dirty.size && guard++ < 4) {
    const list = [...DEST.dirty];
    DEST.dirty.clear();
    for (const s of list) dropIslands(s, V$3(0, -1, 0));
    for (const s of list) rebuildSheetBody(s);
  }
}
function bulletHit(hit, dir, power) {
  const own = hit.idx >= 0 ? PH.owners[hit.idx] : null;
  const dmg = 34 * power;
  if (hit.idx === -1) {
    pokeCloth(hit.p, 0.35, 30 * power);
    return { stop: false, cost: 0.02, surf: "cloth" };
  }
  if (!own) {
    const surf = SURF_NAME[hit.idx] || "conc";
    impactFX(hit.p, hit.n, surf, dir);
    return { stop: surf !== "wood" && surf !== "glass", cost: surf === "wood" ? 0.5 : 1, surf };
  }
  if (own.type === "sheet") {
    const s = own.s;
    let dn = dir.dot(s.N);
    if (Math.abs(dn) < 0.05) dn = dn < 0 ? -0.05 : 0.05;
    _a.subVectors(hit.p, s.c);
    const off = _a.dot(s.N);
    const pf = hit.p.clone().addScaledVector(dir, (s.t / 2 - off) / dn);
    const k = chunkAt(s, pf);
    if (!s.alive[k]) return { stop: false, cost: 0, surf: "wood" };
    const out = dn < 0 ? s.N : s.N.clone().negate();
    FXS.decals.add(pf, s.N, rnd(0.07, 0.1), Math.random() < 0.5 ? 0 : 1, s.id * 4096 + k);
    const fl = floorBelow(pf);
    for (let i2 = 0; i2 < 3; i2++) FXS.splinters.spawn(
      pf,
      dir.clone().multiplyScalar(rnd(0.5, 2.5)).addScaledVector(out, rnd(0.2, 1)).add(V$3(rnd(-0.6, 0.6), rnd(0, 1), rnd(-0.6, 0.6))),
      V$3(rnd(0.03, 0.09), rnd(3e-3, 7e-3), rnd(6e-3, 0.014)),
      fl,
      rnd(5, 10)
    );
    FXS.dust.spawn({ p: pf, v: out.clone().multiplyScalar(0.8), life: rnd(0.8, 1.6), s0: 0.08, s1: 0.45, col: [0.75, 0.64, 0.5], a0: 0.4, a1: 0, drag: 2 });
    SND.hit(pf, "wood");
    damageChunk(s, k, dmg, dir, power, "bullet");
    const i = k % s.nu, j = k / s.nu | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii >= 0 && jj >= 0 && ii < s.nu && jj < s.nv) damageChunk(s, jj * s.nu + ii, dmg * 0.18, dir, power * 0.5, "bullet");
    }
    return { stop: false, cost: 0.12, surf: "wood" };
  }
  if (own.type === "beam") {
    const b = own.b;
    FXS.decals.add(hit.p, hit.n, rnd(0.06, 0.08), b.wood ? 0 : 2, 1e5 + b.id);
    impactFX(hit.p, hit.n, b.surf, dir);
    if (b.wood) {
      b.hp -= dmg * b.fragile;
      if (b.hp <= 0) breakBeam(b, hit.p, dir, power, "bullet");
    }
    return { stop: !b.wood, cost: b.wood ? Math.min(0.9, (b.sx + b.sy) * 2.2) : 1, surf: b.surf };
  }
  if (own.type === "glass") {
    const g = own.g;
    g.hp -= 1;
    if (g.hp <= 0) shatterGlass(g, hit.p, dir, power);
    else {
      FXS.decals.add(hit.p, hit.n.dot(dir) < 0 ? hit.n : hit.n.clone().negate(), rnd(0.35, 0.55), 3, 2e5 + g.id);
      SND.glass(hit.p, 3);
    }
    return { stop: false, cost: 0.05, surf: "glass" };
  }
  if (own.type === "prop") {
    const p = own.p;
    impactFX(hit.p, hit.n, p.surf, dir);
    p.hp -= dmg;
    if (p.explosive && p.hp < 60 && !p.leaking) {
      p.leaking = true;
      if (HOOKS.leak) HOOKS.leak(p, hit.p);
    }
    const killed = p.hp <= 0;
    if (killed) breakProp(p, hit.p, dir, power, "bullet");
    return { stop: !p.wood, cost: 0.5, surf: p.surf, feedback: p.target ? killed ? 2 : 1 : 0 };
  }
  if (own.type === "door") return doorBulletHit(own.d, hit, dir, power);
  if (own.type === "dyn") {
    const r = own.rec;
    impulse(r.body, dir.x * 2.5 * power, dir.y * 2.5 * power, dir.z * 2.5 * power, 0, 0, 0);
    impactFX(hit.p, hit.n, r.surf, dir);
    if (r.onHit) r.onHit(r, hit, dir, power);
    return { stop: r.surf !== "wood", cost: 0.35, surf: r.surf };
  }
  return { stop: true, cost: 1, surf: "conc" };
}
function damageChunk(s, k, dmg, dir, power, mode) {
  if (!s.alive[k]) return;
  s.hp[k] -= dmg;
  if (s.hp[k] <= 0) breakChunk(s, k, dir, power, mode);
}
var impactFX = impactFX;
function explode(p, o = {}) {
  const R = o.radius ?? 6, P = o.power ?? 1;
  const Rb = R * 0.42;
  for (const { ref, pos, d } of query(p, Rb)) {
    const k = Math.pow(1 - d / Rb, 1.2);
    const dir = V$3().subVectors(pos, p).normalize();
    const dmg = 760 * P * k;
    if (ref.t === "c") {
      ref.s.char[ref.k] = Math.max(ref.s.char[ref.k], 0.25 * k * P);
      damageChunk(ref.s, ref.k, dmg * (0.7 + Math.random() * 0.6), dir, P * k * 1.4, "blast");
    } else if (ref.t === "b") {
      ref.b.hp -= dmg * 0.8 * ref.b.fragile;
      if (ref.b.hp <= 0) breakBeam(ref.b, pos.clone().lerp(p, 0.3), dir, P * k * 1.4, "blast");
    } else if (ref.t === "p") {
      ref.p.hp -= dmg;
      if (ref.p.hp <= 0) breakProp(ref.p, p, dir, P * k * 1.4, "blast");
    }
  }
  for (const { ref, pos, d } of query(p, R * 1.6, (r) => r.t === "g")) {
    if (Math.random() < 1 - d / (R * 1.6) * 0.7) shatterGlass(ref.g, pos, V$3().subVectors(pos, p).normalize(), 1.5 * (1 - d / (R * 1.6)));
  }
  flushDestruction();
  blastImpulse(p, R * 1.3, 28 * P);
  pokeCloth(p, R * 2.5, 60 * P);
  if (HOOKS.playerBlast) HOOKS.playerBlast(p, R, P);
  if (HOOKS.doorBlast) HOOKS.doorBlast(p, R * 0.8, P);
  charSphere(p, R * 0.45, 0.35 * P, 0.15);
  if (HOOKS.ignite) {
    if (o.fire) HOOKS.ignite(p, o.fire, R * 0.5);
    else if (Math.random() < 0.45 * P) HOOKS.ignite(p, 0.5, R * 0.4);
  }
}
var HOT = /* @__PURE__ */ new Map();
function burnRange(mesh, start, count, p, r, dChar, heat) {
  const pa = mesh.geometry.attributes.position, ba = mesh.geometry.attributes.aBurn;
  if (!ba) return 0;
  let maxC = 0;
  for (let i = start; i < start + count; i++) {
    _a.fromBufferAttribute(pa, i);
    const d = _a.distanceTo(p);
    if (d > r) {
      maxC = Math.max(maxC, ba.getX(i));
      continue;
    }
    const k = 1 - d / r;
    const c = Math.min(1, ba.getX(i) + dChar * k);
    ba.setXY(i, c, Math.max(ba.getY(i), heat * k));
    maxC = Math.max(maxC, c);
  }
  ba.addUpdateRange(start * 2, count * 2);
  ba.needsUpdate = true;
  if (heat > 0) HOT.set(mesh.uuid + ":" + start, { mesh, start, count });
  return maxC;
}
function charSphere(p, r, dChar, heat) {
  for (const { ref } of query(p, r + 0.4)) {
    if (ref.t === "c") {
      const s = ref.s;
      if (!s.mesh) continue;
      s.char[ref.k] = burnRange(s.mesh, s.base + ref.k * CV, CV, p, r, dChar, heat);
    } else if (ref.t === "b" && ref.b.wood && ref.b.mesh) {
      const b = ref.b;
      b.char = burnRange(b.mesh, b.base, b.count, p, r, dChar, heat);
    }
  }
}
var BX0 = -15;
var BX1 = 15;
var BZ0 = -9.5;
var BZ1 = 9.5;
var H1 = 3.05;
var JOIST = 0.235;
var SUBF = 0.022;
var F2 = H1 + JOIST + SUBF;
var H2 = 2.9;
var TH = 0.14;
var SHEET = 0.0125;
var STUD = 0.045;
var STEP = 0.61;
var ATR = { x0: -4.5, z0: -3.5, x1: 4.5, z1: 3.5 };
var CZ = 1.3;
var PX = 9.75;
var STAIRS_IN = [
  // перед первой ступенью 1.3 м до стены коридора — место, чтобы развернуться
  { x0: -14.92, x1: -13.72, zBot: -2.6, dir: -1 },
  // СЗ комната, вверх на север
  { x0: 13.72, x1: 14.92, zBot: 2.6, dir: 1 }
  // ЮВ комната, вверх на юг
];
var RUN_IN = 4.8;
var STAIRS_OUT = [
  { x: -7.2, side: "n" },
  { x: 7.2, side: "s" }
];
var RUN_OUT = 5.4;
var PLAT_D = 1.8;
var PLAT_W = 2.4;
var WALLS = [];
var DOORS = [];
var DOOR_W = 1.2;
var DOOR_H = 2.1;
var D = (c, w = DOOR_W) => ({ at: c, w, y0: 0, y1: DOOR_H, door: true });
var Wn = (c, w = 1.2, glass = false) => ({ at: c, w, y0: 0.95, y1: 2, glass });
var Wl = (c, w = 2.2) => ({ at: c, w, y0: 1, y1: 2.05 });
function buildWall(x1, z1, x2, z2, y0, h, opt = {}) {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
  if (len < 0.05) return;
  const ang = Math.atan2(dx, dz);
  const ux = dx / len, uz = dz / len, nx = uz, nz = -ux;
  const ops = (opt.openings || []).map((o) => ({ ...o, t0: o.at - o.w / 2, t1: o.at + o.w / 2, y1: Math.min(o.y1, h - 0.2) })).sort((a, b) => a.t0 - b.t0);
  const P = (t, n, y) => new THREE.Vector3(x1 + ux * t + nx * n, y, z1 + uz * t + nz * n);
  const wallQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
  const plate = (t0, t1, yc, sy) => {
    const L = t1 - t0;
    if (L <= 0.02) return;
    const c = P(t0 + L / 2, 0, yc);
    const g = new THREE.BoxGeometry(TH * 0.98, sy, L);
    uvBox(g, TH, sy, L, 0.9, true);
    g.applyMatrix4(_m4.compose(c, wallQ, new THREE.Vector3(1, 1, 1)));
    bucket("wood").push(g);
  };
  let cur = 0;
  for (const o of ops) {
    if (o.y0 < 0.05) {
      plate(cur, o.t0 - 1e-3, y0 + 0.044, 0.088);
      cur = o.t1 + 1e-3;
    }
  }
  plate(cur, len, y0 + 0.044, 0.088);
  plate(0, len, y0 + h - 0.044, 0.088);
  plate(0, len, y0 + h - 0.132, 0.088);
  const inOp = (t, pad = 0.06) => ops.some((o) => t > o.t0 - pad && t < o.t1 + pad);
  const studH0 = y0 + 0.088, studH1 = y0 + h - 0.176;
  const studs = [];
  const stud = (t, y0s = studH0, y1s = studH1, hp = 220) => {
    if (y1s - y0s < 0.1) return;
    createBeam({ a: P(t, 0, y0s), b: P(t, 0, y1s), sx: STUD * 1.9, sy: TH * 0.98, side: new THREE.Vector3(ux, 0, uz), hp, mat: "wood" });
  };
  for (let t = STUD; t <= len - STUD + 1e-3; t += STEP) {
    const tt = Math.min(t, len - STUD);
    if (inOp(tt)) continue;
    stud(tt);
    studs.push(tt);
  }
  if (!studs.length || len - studs[studs.length - 1] > 0.2) {
    if (!inOp(len - STUD)) {
      stud(len - STUD);
      studs.push(len - STUD);
    }
  }
  for (const o of ops) {
    stud(o.t0 - STUD);
    stud(o.t1 + STUD);
    stud(o.t0 - STUD * 3, studH0, y0 + o.y1, 180);
    stud(o.t1 + STUD * 3, studH0, y0 + o.y1, 180);
    studs.push(o.t0 - STUD, o.t1 + STUD);
    createBeam({
      a: P(o.t0 - STUD * 4, 0, y0 + o.y1 + 0.1),
      b: P(o.t1 + STUD * 4, 0, y0 + o.y1 + 0.1),
      sx: TH * 0.98,
      sy: 0.2,
      side: new THREE.Vector3(nx, 0, nz),
      hp: 320,
      mat: "wood"
    });
    for (let t = o.t0 + 0.2; t < o.t1 - 0.1; t += STEP) stud(t, y0 + o.y1 + 0.2, studH1, 150);
    if (o.y0 > 0.05) {
      createBeam({
        a: P(o.t0, 0, y0 + o.y0 - 0.04),
        b: P(o.t1, 0, y0 + o.y0 - 0.04),
        sx: TH * 0.98,
        sy: 0.08,
        side: new THREE.Vector3(nx, 0, nz),
        hp: 160,
        mat: "wood"
      });
      for (let t = o.t0 + 0.2; t < o.t1 - 0.1; t += STEP) stud(t, studH0, y0 + o.y0 - 0.08, 120);
    }
    const jt = TH + SHEET * 2 + 4e-3;
    for (const tt of [o.t0 - 0.012, o.t1 + 0.012]) {
      const c = P(tt, 0, y0 + (o.y0 + o.y1) / 2);
      addBox(
        "wood",
        c.x,
        c.y,
        c.z,
        Math.abs(ux) > 0.5 ? 0.024 : jt,
        o.y1 - o.y0,
        Math.abs(ux) > 0.5 ? jt : 0.024,
        { collide: false, d: 1.2, tint: [0.92, 0.86, 0.76] }
      );
    }
    {
      const c = P((o.t0 + o.t1) / 2, 0, y0 + o.y1 + 0.012);
      addBox("wood", c.x, c.y, c.z, Math.abs(ux) > 0.5 ? o.w + 0.05 : jt, 0.024, Math.abs(ux) > 0.5 ? jt : o.w + 0.05, { collide: false, d: 1.2, tint: [0.92, 0.86, 0.76] });
    }
    if (o.y0 > 0.05) {
      const c = P((o.t0 + o.t1) / 2, 0, y0 + o.y0 - 0.012);
      addBox("wood", c.x, c.y, c.z, Math.abs(ux) > 0.5 ? o.w + 0.1 : jt + 0.06, 0.03, Math.abs(ux) > 0.5 ? jt + 0.06 : o.w + 0.1, { collide: false, d: 1.2, tint: [0.9, 0.84, 0.74] });
      if (o.glass) windowGlass(P((o.t0 + o.t1) / 2, 0, y0 + (o.y0 + o.y1) / 2), ang, o.w, o.y1 - o.y0);
    }
    if (o.door && y0 > 1) {
      const c = P((o.t0 + o.t1) / 2, 0, y0 - 0.012);
      addBox("wood", c.x, c.y, c.z, Math.abs(ux) > 0.5 ? o.w : TH + 0.12, 0.03, Math.abs(ux) > 0.5 ? TH + 0.12 : o.w, { d: 1.1, tint: [0.85, 0.8, 0.7] });
    }
    if (o.door) for (const s of [1, -1]) {
      const off = s * (TH / 2 + SHEET + 8e-3), ax = Math.abs(ux) > 0.5;
      for (const tt of [o.t0 - 0.035, o.t1 + 0.035]) {
        const c2 = P(tt, off, y0 + (o.y1 + 0.07) / 2);
        addBox("wood", c2.x, c2.y, c2.z, ax ? 0.07 : 0.016, o.y1 + 0.07, ax ? 0.016 : 0.07, { collide: false, d: 1.2, tint: [0.82, 0.8, 0.74] });
      }
      const c = P((o.t0 + o.t1) / 2, off, y0 + o.y1 + 0.035);
      addBox("wood", c.x, c.y, c.z, ax ? o.w + 0.14 : 0.016, 0.07, ax ? 0.016 : o.w + 0.14, { collide: false, d: 1.2, tint: [0.82, 0.8, 0.74] });
    }
    if (o.door) DOORS.push({ x: P((o.t0 + o.t1) / 2, 0, 0).x, z: P((o.t0 + o.t1) / 2, 0, 0).z, y: y0, ang, w: o.w });
  }
  if (h > 2.6) {
    studs.sort((a, b) => a - b);
    for (let i = 0; i < studs.length - 1; i++) {
      const a = studs[i] + STUD, b = studs[i + 1] - STUD;
      if (b - a < 0.05) continue;
      const mid = (a + b) / 2, yb = y0 + h * 0.5;
      if (ops.some((o) => mid > o.t0 - 0.05 && mid < o.t1 + 0.05 && yb > y0 + o.y0 - 0.1 && yb < y0 + o.y1 + 0.25)) continue;
      plate(a, b, yb, 0.088);
    }
  }
  const rects = [];
  cur = 0;
  for (const o of ops) {
    if (o.t0 - cur > 0.02) rects.push([cur, o.t0, 0, h]);
    if (o.y0 > 0.02) rects.push([o.t0, o.t1, 0, o.y0]);
    if (h - o.y1 > 0.02) rects.push([o.t0, o.t1, o.y1, h]);
    cur = o.t1;
  }
  if (len - cur > 0.02) rects.push([cur, len, 0, h]);
  const sides = opt.sheath === "none" ? [] : opt.sheath === "one" ? [opt.side ?? 1] : [1, -1];
  const CH = Q.tex >= 0.75 ? 0.41 : 0.6;
  const trim = TH / 2 + SHEET;
  for (const s of sides) {
    const outer = opt.outSide === s;
    const T0 = outer ? -trim : opt.trim0 === false ? 0 : trim;
    const T1 = outer ? len + trim : len - (opt.trim1 === false ? 0 : trim);
    const nOff = s * (TH / 2 + SHEET / 2);
    const N = new THREE.Vector3(nx * s, 0, nz * s);
    const Vv = new THREE.Vector3(0, 1, 0);
    const U = new THREE.Vector3().crossVectors(Vv, N);
    for (let [t0, t1, ry0, ry1] of rects) {
      t0 = Math.max(t0, T0);
      t1 = Math.min(t1, T1);
      if (t0 <= 1e-3 && T0 < 0 && rects[0][0] === 0) t0 = T0;
      if (t1 >= len - 1e-3 && T1 > len) t1 = T1;
      const L = t1 - t0, Hh = ry1 - ry0;
      if (L < 0.05 || Hh < 0.05) continue;
      const SW = 1.22, SH = 2.44, GAP = 4e-3;
      const cols = Math.max(1, Math.ceil(L / SW - 0.05)), rows = Math.max(1, Math.ceil(Hh / SH - 0.05));
      const cw = L / cols, chh = Hh / rows;
      for (let ci = 0; ci < cols; ci++) for (let ri = 0; ri < rows; ri++) {
        const lt0 = t0 + ci * cw + GAP / 2, ltW = cw - GAP, ly0 = ry0 + ri * chh + GAP / 2, lhH = chh - GAP;
        if (ltW < 0.04 || lhH < 0.04) continue;
        const c = P(lt0 + ltW / 2, nOff, y0 + ly0 + lhH / 2);
        const t0c = sr(0.84, 1.05), warm = sr(0.95, 1.03);
        createSheet({
          c,
          U,
          V: Vv,
          w: ltW,
          h: lhH,
          t: SHEET,
          nu: Math.max(1, Math.round(ltW / CH)),
          nv: Math.max(1, Math.round(lhH / CH)),
          mat: srnd() < 0.5 ? "osb" : "osb2",
          tint: [t0c * warm, t0c * sr(0.97, 1.01), t0c * sr(0.9, 1)],
          colDepth: TH / 2 + SHEET,
          hp: 100,
          kind: "wall"
        });
      }
    }
  }
  WALLS.push({ x1, z1, x2, z2, y0, h, ops, len, ang, nx, nz, sheath: opt.sheath || "both" });
}
function windowGlass(c, ang, w, h) {
  const g = new THREE.PlaneGeometry(w - 0.04, h - 0.04);
  const m = new THREE.Mesh(g, M.glass);
  m.position.copy(c);
  m.rotation.y = ang + Math.PI / 2;
  m.userData.glass = { w: w - 0.04, h: h - 0.04 };
  m.userData.nomerge = true;
  scene.add(m);
  registerGlass(m, { hp: 1, playerCollide: true });
}
function floorRect(x0, z0, x1, z1) {
  const yT = H1 + JOIST / 2 + 1e-3;
  for (let x = x0 + 0.1; x <= x1 - 0.05; x += STEP) {
    createBeam({
      a: new THREE.Vector3(x, yT, z0 + 0.02),
      b: new THREE.Vector3(x, yT, z1 - 0.02),
      sx: 0.045,
      sy: JOIST,
      side: new THREE.Vector3(1, 0, 0),
      hp: 340,
      mat: "wood",
      tint: [0.95, 0.92, 0.86]
    });
  }
  for (const x of [x0 + 0.025, x1 - 0.025])
    addBox("wood", x, yT, (z0 + z1) / 2, 0.045, JOIST, z1 - z0, { collide: false, d: 0.9, grain: true });
  const CH = Q.tex >= 0.75 ? 0.41 : 0.61;
  const U = new THREE.Vector3(1, 0, 0), Vv = new THREE.Vector3(0, 0, -1);
  const cols = Math.max(1, Math.ceil((x1 - x0) / 1.22 - 0.05)), rows = Math.max(1, Math.ceil((z1 - z0) / 2.44 - 0.05));
  const cw = (x1 - x0) / cols, rh = (z1 - z0) / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const w = cw - 3e-3, h = rh - 3e-3;
    const c = new THREE.Vector3(x0 + (i + 0.5) * cw, F2 - SUBF / 2, z0 + (j + 0.5) * rh);
    const tt = sr(0.8, 0.92);
    createSheet({
      c,
      U,
      V: Vv,
      w,
      h,
      t: SUBF,
      nu: Math.max(1, Math.round(w / CH)),
      nv: Math.max(1, Math.round(h / CH)),
      mat: "osb2",
      tint: [tt, tt * 0.98, tt * 0.93],
      colDepth: 0.06,
      hp: 140,
      kind: "floor",
      uvd: 0.82
    });
  }
}
function floorWithHoles(x0, z0, x1, z1, holes) {
  let rects = [[x0, z0, x1, z1]];
  for (const [hx0, hz0, hx1, hz1] of holes) {
    const next = [];
    for (const [ax0, az0, ax1, az1] of rects) {
      const ox0 = Math.max(ax0, hx0), oz0 = Math.max(az0, hz0), ox1 = Math.min(ax1, hx1), oz1 = Math.min(az1, hz1);
      if (ox0 >= ox1 || oz0 >= oz1) {
        next.push([ax0, az0, ax1, az1]);
        continue;
      }
      if (az0 < oz0) next.push([ax0, az0, ax1, oz0]);
      if (oz1 < az1) next.push([ax0, oz1, ax1, az1]);
      if (ax0 < ox0) next.push([ax0, oz0, ox0, oz1]);
      if (ox1 < ax1) next.push([ox1, oz0, ax1, oz1]);
    }
    rects = next;
  }
  for (const [a, b, c, d] of rects) if (c - a > 0.2 && d - b > 0.2) floorRect(a, b, c, d);
}
function woodRail(x1, z1, x2, z2, y, h = 1.05, opt = {}) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  if (len < 0.1) return;
  const ux = (x2 - x1) / len, uz = (z2 - z1) / len;
  const n = Math.max(1, Math.round(len / 1.2));
  for (let i = 0; i <= n; i++) {
    const t = i * len / n;
    createBeam({ a: new THREE.Vector3(x1 + ux * t, y, z1 + uz * t), b: new THREE.Vector3(x1 + ux * t, y + h, z1 + uz * t), sx: 0.07, sy: 0.07, hp: 160, collide: false });
  }
  for (const [yy, sz] of [[y + h - 0.03, 0.07], [y + h * 0.5, 0.045]])
    createBeam({ a: new THREE.Vector3(x1, yy, z1), b: new THREE.Vector3(x2, yy, z2), sx: sz, sy: 0.035, hp: 90, collide: false, noPlayer: true });
  addOBB((x1 + x2) / 2, y + h / 2, (z1 + z2) / 2, Math.abs(ux) > 0.5 ? len : 0.1, h, Math.abs(ux) > 0.5 ? 0.1 : len, null, "wood", { playerOnly: true });
}
function steelRail(x1, z1, x2, z2, y, h = 1.08) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  if (len < 0.1) return;
  const ux = (x2 - x1) / len, uz = (z2 - z1) / len;
  const n = Math.max(1, Math.round(len / 1.3));
  for (let i = 0; i <= n; i++) {
    const t = i * len / n;
    addBox("steel", x1 + ux * t, y + h / 2, z1 + uz * t, 0.045, h, 0.045, { collide: false, d: 1 });
  }
  const A2 = new THREE.Vector3(), B = new THREE.Vector3();
  for (const yy of [y + h - 0.02, y + h * 0.52]) {
    beamBetween("steel", A2.set(x1, yy, z1), B.set(x2, yy, z2), 0.042, 0.042, { d: 1 });
  }
  beamBetween("steel", A2.set(x1, y + 0.06, z1), B.set(x2, y + 0.06, z2), 0.012, 0.11, { d: 1 });
  addOBB((x1 + x2) / 2, y + h / 2, (z1 + z2) / 2, Math.abs(ux) > 0.5 ? len : 0.08, h, Math.abs(ux) > 0.5 ? 0.08 : len, null, "metal", { playerOnly: true });
}
function woodStairs(x0, x1, zBot, dir, y0, y1, run, wallSide) {
  const rise = y1 - y0, n = Math.max(12, Math.round(rise / 0.183)), r = rise / n, tr = run / n;
  const width = x1 - x0, xc = (x0 + x1) / 2;
  const Z = (s) => zBot + dir * s;
  for (let i = 0; i < n; i++) {
    const s0 = i * tr, yTop = y0 + r * (i + 1);
    const zc = Z(s0 + tr / 2);
    addBox("wood", xc, yTop - 0.016, zc - dir * 0.012, width - 0.02, 0.032, tr + 0.03, { collide: false, d: 1.1, grain: true, tint: [0.7, 0.6, 0.48] });
    addBox("osb2", xc, yTop - r / 2 - 0.016, Z(s0) + dir * 6e-3, width - 0.08, r - 0.03, 0.012, { collide: false, d: 0.8 });
  }
  for (const x of [x0 + 0.022, x1 - 0.022]) {
    const sh = new THREE.Shape();
    const depth = 0.29;
    sh.moveTo(0, 0);
    for (let i = 0; i < n; i++) {
      sh.lineTo(i * tr, (i + 1) * r - 0.032);
      sh.lineTo((i + 1) * tr, (i + 1) * r - 0.032);
    }
    const L2 = Math.hypot(run, rise), cs = run / L2, sn = rise / L2;
    sh.lineTo(run, rise - 0.032 - depth / cs * 0.9);
    sh.lineTo(depth * sn * 0.9, 0);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.038, bevelEnabled: false });
    g.translate(0, 0, -0.019);
    const m = new THREE.Matrix4();
    m.makeBasis(new THREE.Vector3(0, 0, dir), new THREE.Vector3(0, 1, 0), new THREE.Vector3(dir, 0, 0).negate());
    g.applyMatrix4(m);
    g.translate(x, y0, zBot);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.9, uv.getY(i) * 0.9);
    tintGeo(g, 0.62, 0.53, 0.43);
    bucket("wood").push(g);
  }
  const L = Math.hypot(run, rise), ang = Math.atan2(rise, run);
  const thick = 0.12;
  const mid = new THREE.Vector3(xc, y0 + rise / 2 - thick / 2 * Math.cos(ang), zBot + dir * (run / 2) + dir * thick / 2 * Math.sin(ang));
  mid.z -= dir * tr / 2;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(dir > 0 ? -ang : ang, 0, 0));
  addOBB(mid.x, mid.y, mid.z, width, thick, L, q, "wood");
  const open = wallSide < 0 ? x1 : x0, wallX = wallSide < 0 ? x0 + 0.06 : x1 - 0.06;
  const posts = 3;
  for (let i = 0; i <= posts; i++) {
    const s = i * run / posts, yb = y0 + rise * (s / run) + (i === 0 ? 0 : 0);
    createBeam({ a: new THREE.Vector3(open, yb, Z(s)), b: new THREE.Vector3(open, yb + 1 + (i === 0 ? 0.15 : 0), Z(s)), sx: 0.07, sy: 0.07, hp: 150, collide: false });
  }
  const hr0 = new THREE.Vector3(open, y0 + 0.95, Z(0)), hr1 = new THREE.Vector3(open, y1 + 0.95, Z(run));
  beamBetween("wood", hr0, hr1, 0.06, 0.045, { d: 1, tint: [0.55, 0.45, 0.35] });
  beamBetween("wood", hr0.clone().setY(y0 + 0.5), hr1.clone().setY(y1 + 0.5), 0.04, 0.03, { d: 1 });
  beamBetween("dark", new THREE.Vector3(wallX, y0 + 0.9, Z(0.2)), new THREE.Vector3(wallX, y1 + 0.9, Z(run - 0.2)), 0.04, 0.04, { d: 1 });
  for (let i = 0; i < 4; i++) {
    const s = 0.4 + i * (run - 0.8) / 3;
    addBox("dark", wallX + (wallSide < 0 ? -0.03 : 0.03), y0 + rise * (s / run) + 0.85, Z(s), 0.07, 0.03, 0.03, { collide: false });
  }
  const q2 = q.clone();
  addOBB(open, mid.y + 0.55, mid.z, 0.08, 1, L, q2, "wood", { playerOnly: true });
}
function steelStair(xc, zFace, out, y1) {
  const W = 1.2, n = Math.round(y1 / 0.19), r = y1 / n, tr = RUN_OUT / n;
  const zP0 = zFace + out * 0.09, zP1 = zFace + out * (0.09 + PLAT_D);
  const x0 = xc - PLAT_W / 2, x1 = xc + PLAT_W / 2;
  const pzc = (zP0 + zP1) / 2;
  addBox("grating", xc, y1 - 0.02, pzc, PLAT_W, 0.04, PLAT_D, { collide: false, d: 1.4 });
  addOBB(xc, y1 - 0.06, pzc, PLAT_W, 0.12, PLAT_D, null, "metal");
  for (const zz of [zP0 + out * 0.04, zP1 - out * 0.04]) addBox("steel", xc, y1 - 0.12, zz, PLAT_W, 0.18, 0.08, { collide: false, d: 1 });
  for (const xx of [x0 + 0.04, x1 - 0.04]) addBox("steel", xx, y1 - 0.12, pzc, 0.08, 0.18, PLAT_D, { collide: false, d: 1 });
  for (const xx of [x0 + 0.06, x1 - 0.06]) for (const zz of [zP0 + out * 0.06, zP1 - out * 0.06]) {
    addBox("steel", xx, (y1 - 0.2) / 2, zz, 0.1, y1 - 0.2, 0.1, { d: 1.1 });
    addBox("dark", xx, 0.02, zz, 0.26, 0.04, 0.26, { collide: false });
  }
  const A2 = new THREE.Vector3(), B = new THREE.Vector3();
  for (const zz of [zP0 + out * 0.06, zP1 - out * 0.06]) {
    beamBetween("steel", A2.set(x0 + 0.06, 0.3, zz), B.set(x1 - 0.06, y1 - 0.35, zz), 0.05, 0.05, { d: 1 });
  }
  const zS0 = zP1, zS1 = zP1 + out * RUN_OUT;
  const sx0 = xc - W / 2, sx1 = xc + W / 2;
  for (let i = 0; i < n - 1; i++) {
    const yTop = y1 - r * (i + 1);
    const zc = zS0 + out * (tr * (i + 0.5) + tr * 0.5);
    addBox("grating", xc, yTop - 0.018, zc, W - 0.06, 0.036, tr + 0.02, { collide: false, d: 1.6 });
    addBox("steel", xc, yTop - 0.03, zc - out * (tr / 2), W - 0.06, 0.06, 0.035, { collide: false, d: 1 });
  }
  const L = Math.hypot(RUN_OUT, y1), ang = Math.atan2(y1, RUN_OUT);
  for (const x of [sx0 - 0.03, sx1 + 0.03]) {
    const a = new THREE.Vector3(x, y1 - 0.12, zS0), b = new THREE.Vector3(x, -0.05, zS1);
    beamBetween("steel", a, b, 0.05, 0.22, { d: 1.2 });
    beamBetween("dark", a.clone().setY(a.y + 0.1).setX(x + (x < xc ? -0.03 : 0.03)), b.clone().setY(b.y + 0.1).setX(x + (x < xc ? -0.03 : 0.03)), 0.06, 0.02, { d: 1 });
    beamBetween("dark", a.clone().setY(a.y - 0.1).setX(x + (x < xc ? -0.03 : 0.03)), b.clone().setY(b.y - 0.1).setX(x + (x < xc ? -0.03 : 0.03)), 0.06, 0.02, { d: 1 });
    addBox("dark", x, 0.03, zS1 - out * 0.1, 0.2, 0.06, 0.3, { collide: false });
  }
  const thick = 0.12;
  const mid = new THREE.Vector3(xc, y1 / 2 - thick / 2 * Math.cos(ang), (zS0 + zS1) / 2 - out * thick / 2 * Math.sin(ang));
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(out > 0 ? ang : -ang, 0, 0));
  addOBB(mid.x, mid.y, mid.z, W, thick, L, q, "metal");
  for (const x of [sx0 - 0.02, sx1 + 0.02]) {
    for (let i = 0; i <= 4; i++) {
      const s = i * RUN_OUT / 4, yb = y1 - y1 * (s / RUN_OUT);
      addBox("steel", x, yb + 0.52, zS0 + out * s, 0.045, 1.04, 0.045, { collide: false, d: 1 });
    }
    beamBetween("steel", A2.set(x, y1 + 1.02, zS0), B.set(x, 1.02, zS1), 0.045, 0.045, { d: 1 });
    beamBetween("steel", A2.set(x, y1 + 0.52, zS0), B.set(x, 0.52, zS1), 0.035, 0.035, { d: 1 });
    addOBB(x, mid.y + 0.6, mid.z, 0.08, 1.1, L, q, "metal", { playerOnly: true });
  }
  steelRail(x0, zP0, x0, zP1, y1);
  steelRail(x1, zP0, x1, zP1, y1);
  steelRail(x0, zP1, sx0 - 0.02, zP1, y1);
  steelRail(sx1 + 0.02, zP1, x1, zP1, y1);
  const zm = zS0 + out * RUN_OUT * 0.55;
  addBox("steel", xc, (y1 * 0.45 - 0.2) / 2, zm, 0.1, y1 * 0.45 - 0.2, 0.1, { d: 1.1 });
  addBox("steel", xc, y1 * 0.45 - 0.22, zm, W + 0.1, 0.08, 0.08, { collide: false });
}
function buildHouse() {
  const y2 = F2;
  addBox("conc", 0, 0.02, 0, BX1 - BX0 + 0.5, 0.04, BZ1 - BZ0 + 0.5, { collide: false, d: 0.4 });
  const along = (x) => x - BX0, alongZ = (z) => z - BZ0;
  buildWall(BX0, BZ0, BX1, BZ0, 0, H1, { outSide: 1, openings: [
    Wn(along(-14)),
    D(along(-12.1)),
    Wn(along(-9)),
    D(along(-5.6)),
    Wn(along(-2.2)),
    D(along(1.2)),
    Wn(along(5.6), 1.2, true),
    D(along(8)),
    Wn(along(11.4)),
    Wn(along(13.9))
  ] });
  buildWall(BX0, BZ1, BX1, BZ1, 0, H1, { outSide: -1, openings: [
    Wn(along(-13.9)),
    Wn(along(-11.4)),
    D(along(-8)),
    Wn(along(-5.6), 1.2, true),
    D(along(-1.2)),
    Wn(along(2.2)),
    D(along(5.6)),
    Wn(along(9)),
    D(along(12.1)),
    Wn(along(14))
  ] });
  buildWall(BX0, BZ0, BX0, BZ1, 0, H1, { outSide: 1, openings: [Wn(alongZ(-8.4), 1), Wn(alongZ(3)), D(alongZ(6.2))] });
  buildWall(BX1, BZ0, BX1, BZ1, 0, H1, { outSide: -1, openings: [D(alongZ(-6.2)), Wn(alongZ(-3)), Wn(alongZ(8.4), 1)] });
  buildWall(BX0, -CZ, ATR.x0, -CZ, 0, H1, { openings: [D(along(-11.3)), D(along(-7.1)), Wn(along(-5.6), 0.9)] });
  buildWall(BX0, CZ, ATR.x0, CZ, 0, H1, { openings: [D(along(-12.4)), Wl(along(-9), 1.6), D(along(-7.1))] });
  buildWall(ATR.x1, -CZ, BX1, -CZ, 0, H1, { openings: [D(along(7.1) - ATR.x1 + BX0), Wl(along(9) - ATR.x1 + BX0, 1.6), D(along(12.4) - ATR.x1 + BX0)] });
  buildWall(ATR.x1, CZ, BX1, CZ, 0, H1, { openings: [Wn(along(5.6) - ATR.x1 + BX0, 0.9), D(along(7.1) - ATR.x1 + BX0), D(along(11.3) - ATR.x1 + BX0)] });
  buildWall(-PX, BZ0, -PX, -CZ, 0, H1, { openings: [D(3), Wn(6.4)] });
  buildWall(-PX, CZ, -PX, BZ1, 0, H1, { openings: [Wn(1.8), D(5.2)] });
  buildWall(PX, BZ0, PX, -CZ, 0, H1, { openings: [D(3), Wn(6.4)] });
  buildWall(PX, CZ, PX, BZ1, 0, H1, { openings: [Wn(1.8), D(5.2)] });
  const DC = 1.05;
  for (const y of [0, y2]) {
    const h = y ? H2 : H1;
    buildWall(-PX, -CZ, -PX, CZ, y, h, { openings: [D(2, DC)] });
    buildWall(PX, -CZ, PX, CZ, y, h, { openings: [D(0.6, DC)] });
    buildWall(ATR.x0, -CZ, ATR.x0, CZ, y, h, { openings: [D(y ? 1 : 0.6, DC)] });
    buildWall(ATR.x1, -CZ, ATR.x1, CZ, y, h, { openings: [D(y ? 1.6 : 2, DC)] });
  }
  buildWall(ATR.x0, BZ0, ATR.x0, -CZ, 0, H1, { openings: [D(3), Wn(6.9, 1)] });
  buildWall(ATR.x0, CZ, ATR.x0, BZ1, 0, H1, { openings: [D(3.4), Wn(6.8, 1)] });
  buildWall(ATR.x1, BZ0, ATR.x1, -CZ, 0, H1, { openings: [Wn(1.4, 1), D(4.8)] });
  buildWall(ATR.x1, CZ, ATR.x1, BZ1, 0, H1, { openings: [Wn(1.3, 1), D(5.2)] });
  buildWall(ATR.x0, ATR.z0, ATR.x1, ATR.z0, 0, H1, { openings: [D(3.4), Wl(7.6, 1.6)] });
  buildWall(ATR.x0, ATR.z1, ATR.x1, ATR.z1, 0, H1, { openings: [Wl(1.4, 1.6), D(5.6)] });
  buildWall(0, BZ0, 0, ATR.z0, 0, H1, { openings: [D(1.5)] });
  buildWall(0, ATR.z1, 0, BZ1, 0, H1, { openings: [D(4.5)] });
  const holes = [[ATR.x0, ATR.z0, ATR.x1, ATR.z1]];
  for (const s of STAIRS_IN) {
    const zTop = s.zBot + s.dir * RUN_IN;
    holes.push([s.x0 - 0.1, Math.min(s.zBot, zTop) - 0.05, s.x1 + 0.3, Math.max(s.zBot, zTop) + 0.05]);
  }
  const bands = [[BZ0, -CZ], [-CZ, CZ], [CZ, BZ1]];
  for (const [za, zb] of bands) {
    floorWithHoles(BX0 + 0.07, za + 0.07, ATR.x0, zb - 0.07, holes);
    floorWithHoles(ATR.x1, za + 0.07, BX1 - 0.07, zb - 0.07, holes);
  }
  floorWithHoles(ATR.x0, BZ0 + 0.07, ATR.x1, ATR.z0, holes);
  floorWithHoles(ATR.x0, ATR.z1, ATR.x1, BZ1 - 0.07, holes);
  for (const s of STAIRS_IN) {
    woodStairs(s.x0, s.x1, s.zBot, s.dir, 0, y2, RUN_IN, s.x0 < 0 ? -1 : 1);
    const zTop = s.zBot + s.dir * RUN_IN;
    const openX = s.x0 < 0 ? s.x1 + 0.3 : s.x0 - 0.3;
    woodRail(openX, s.zBot - s.dir * 0.05, openX, zTop, y2);
    woodRail(s.x0 < 0 ? BX0 + 0.1 : openX, s.zBot - s.dir * 0.05, s.x0 < 0 ? openX : BX1 - 0.1, s.zBot - s.dir * 0.05, y2);
  }
  buildWall(BX0, BZ0, BX1, BZ0, y2, H2, { outSide: 1, openings: [
    Wn(along(-13.2), 1.2, true),
    Wn(along(-10.4)),
    D(along(-7.2)),
    Wn(along(-2.2), 1.4, true),
    Wn(along(2.2)),
    Wn(along(7.2), 1.2, true),
    Wn(along(10.4)),
    Wn(along(13.2))
  ] });
  buildWall(BX0, BZ1, BX1, BZ1, y2, H2, { outSide: -1, openings: [
    Wn(along(-13.2)),
    Wn(along(-10.4)),
    Wn(along(-7.2), 1.2, true),
    Wn(along(-2.2)),
    Wn(along(2.2), 1.4, true),
    D(along(7.2)),
    Wn(along(10.4)),
    Wn(along(13.2), 1.2, true)
  ] });
  buildWall(BX0, BZ0, BX0, BZ1, y2, H2, { outSide: 1, openings: [Wn(alongZ(-8.2), 1, true), Wn(alongZ(3.2)), Wn(alongZ(6.4), 1.2, true)] });
  buildWall(BX1, BZ0, BX1, BZ1, y2, H2, { outSide: -1, openings: [Wn(alongZ(-6.4), 1.2, true), Wn(alongZ(-3.2)), Wn(alongZ(8.2), 1, true)] });
  buildWall(BX0, -CZ, ATR.x0, -CZ, y2, H2, { openings: [D(along(-11)), D(along(-7.1))] });
  buildWall(BX0, CZ, ATR.x0, CZ, y2, H2, { openings: [D(along(-12.4)), Wn(along(-9.6)), D(along(-7.1))] });
  buildWall(ATR.x1, -CZ, BX1, -CZ, y2, H2, { openings: [D(along(7.1) - ATR.x1 + BX0), Wn(along(9.6) - ATR.x1 + BX0), D(along(12.4) - ATR.x1 + BX0)] });
  buildWall(ATR.x1, CZ, BX1, CZ, y2, H2, { openings: [D(along(7.1) - ATR.x1 + BX0), D(along(11) - ATR.x1 + BX0)] });
  buildWall(-PX, BZ0, -PX, -CZ, y2, H2, { openings: [D(1.4), Wl(5, 1.6)] });
  buildWall(-PX, CZ, -PX, BZ1, y2, H2, { openings: [D(2.6), Wn(6.2)] });
  buildWall(PX, BZ0, PX, -CZ, y2, H2, { openings: [Wn(2), D(5.6)] });
  buildWall(PX, CZ, PX, BZ1, y2, H2, { openings: [Wl(3.2, 1.6), D(6.8)] });
  buildWall(ATR.x0, BZ0, ATR.x0, ATR.z0, y2, H2, { openings: [D(3)] });
  buildWall(ATR.x0, ATR.z1, ATR.x0, BZ1, y2, H2, { openings: [D(3)] });
  buildWall(ATR.x1, BZ0, ATR.x1, ATR.z0, y2, H2, { openings: [D(3)] });
  buildWall(ATR.x1, ATR.z1, ATR.x1, BZ1, y2, H2, { openings: [D(3)] });
  buildWall(ATR.x0, ATR.z0, ATR.x1, ATR.z0, y2, H2, { openings: [Wl(1.6, 1.8), D(4.5), Wl(7.4, 1.8)] });
  buildWall(ATR.x0, ATR.z1, ATR.x1, ATR.z1, y2, H2, { openings: [Wl(3.1, 1.2), D(4.5), Wl(5.9, 1.2)] });
  buildWall(0, BZ0, 0, ATR.z0, y2, H2, { openings: [D(1.5)] });
  buildWall(0, ATR.z1, 0, BZ1, y2, H2, { openings: [D(4.5)] });
  woodRail(ATR.x0 - 0.02, ATR.z0 + 0.1, ATR.x0 - 0.02, -CZ - 0.1, y2);
  woodRail(ATR.x0 - 0.02, CZ + 0.1, ATR.x0 - 0.02, ATR.z1 - 0.1, y2);
  woodRail(ATR.x1 + 0.02, ATR.z0 + 0.1, ATR.x1 + 0.02, -CZ - 0.1, y2);
  woodRail(ATR.x1 + 0.02, CZ + 0.1, ATR.x1 + 0.02, ATR.z1 - 0.1, y2);
  catwalk(ATR.x0, ATR.x1, y2);
  for (let x = BX0 + 0.6; x < BX1 - 0.3; x += 1.22) {
    if (x > ATR.x0 - 0.3 && x < ATR.x1 + 0.3) continue;
    addBox("wood", x, y2 + H2 + 0.12, 0, 0.045, 0.24, BZ1 - BZ0, { collide: false, d: 0.9, grain: true, tint: [0.9, 0.86, 0.78] });
  }
  for (const s of STAIRS_OUT) {
    const out = s.side === "n" ? -1 : 1;
    steelStair(s.x, s.side === "n" ? BZ0 : BZ1, out, y2);
    exitSign(s.x, y2 + 2.4, (s.side === "n" ? BZ0 : BZ1) + out * 0.1, s.side === "n" ? Math.PI : 0);
  }
  for (const d of DOORS) {
    if (d.y > 1) continue;
    if (Math.abs(Math.abs(d.z) - BZ1) < 0.01) exitSign(d.x, 2.35, d.z + Math.sign(d.z) * 0.1, d.z < 0 ? Math.PI : 0);
    if (Math.abs(Math.abs(d.x) - BX1) < 0.01) exitSign(d.x + Math.sign(d.x) * 0.1, 2.35, d.z, d.x < 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  buildInteriorLamps();
}
function catwalk(x0, x1, y) {
  const w = 1.5;
  addBox("grating", 0, y - 0.02, 0, x1 - x0, 0.04, w, { collide: false, d: 1.4 });
  addOBB(0, y - 0.06, 0, x1 - x0, 0.12, w, null, "metal");
  for (const z of [-w / 2 + 0.05, w / 2 - 0.05]) addBox("steel", 0, y - 0.16, z, x1 - x0, 0.26, 0.09, { collide: false, d: 1 });
  steelRail(x0, -w / 2, x1, -w / 2, y);
  steelRail(x0, w / 2, x1, w / 2, y);
  for (const x of [-2.2, 2.2]) for (const z of [-w / 2, w / 2]) addBox("steel", x, y + H2 / 2 + 0.1, z, 0.03, H2, 0.03, { collide: false });
  for (const x of [-2.2, 2.2]) {
    addBox("steel", x, y + H2 + 0.12, 0, 0.12, 0.24, ATR.z1 - ATR.z0 + 0.3, { collide: false, d: 1 });
    addBox("steel", x, y + H2 + 0.12, 0, 0.02, 0.2, ATR.z1 - ATR.z0 + 0.3, { collide: false, d: 1 });
  }
}
var INTERIOR = [];
var LAMP_INST = null;
function buildInteriorLamps() {
  const bulbMat = new THREE.MeshStandardMaterial({ color: 16773590, emissive: 16767392, emissiveIntensity: 1.3 });
  const spots = [
    [-11.2, -6.2, 0],
    [-7.1, -5.4, 0],
    [-12.4, 5.4, 0],
    [-7.1, 5.4, 0],
    [-12.4, 0, 0],
    [12.4, 0, 0],
    [-7.1, 0, 0],
    [7.1, 0, 0],
    [11.2, 6.2, 0],
    [7.1, 5.4, 0],
    [12.4, -5.4, 0],
    [7.1, -5.4, 0],
    [-2.2, -6.5, 0],
    [2.2, 6.5, 0],
    [2.2, -6.5, 0],
    [-2.2, 6.5, 0],
    [-12, -5, 1],
    [-7.1, -5.4, 1],
    [-12.2, 5.5, 1],
    [-7.1, 5.4, 1],
    [12, 5, 1],
    [7.1, 5.4, 1],
    [12.2, -5.5, 1],
    [7.1, -5.4, 1],
    [-2.2, -6.4, 1],
    [2.2, 6.4, 1],
    [2.4, -6.4, 1],
    [-2.4, 6.4, 1],
    [-12.4, 0, 1],
    [12.4, 0, 1],
    [-7.1, 0, 1],
    [7.1, 0, 1],
    [0, 2.4, 1],
    [0, -2.4, 1]
  ];
  const cordG = new THREE.CylinderGeometry(6e-3, 6e-3, 1, 4);
  const shadeG = new THREE.ConeGeometry(0.16, 0.14, 14, 1, true);
  const bulbG = new THREE.SphereGeometry(0.045, 10, 8);
  const mk = (g, m) => {
    const im = new THREE.InstancedMesh(g, m, spots.length);
    im.userData.nomerge = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    scene.add(im);
    return im;
  };
  LAMP_INST = {
    cord: mk(cordG, M.cable),
    shade: mk(shadeG, cmat(3816506, { roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide })),
    bulb: mk(bulbG, bulbMat),
    o: new THREE.Object3D()
  };
  for (const [x, z, fl] of spots) {
    const top = fl ? F2 + H2 + 0.05 : H1;
    const y = top - (fl ? 1.1 : 0.55);
    INTERIOR.push({ pos: new THREE.Vector3(x, y - 0.1, z), top, ax: 0, az: 0, vx: 0, vz: 0, len: top - y, x, z, alive: true, i: INTERIOR.length });
  }
  updateLamps(0, 0);
}
function snapSupport(x, z, y) {
  return y;
}
var HELI_HOOK = () => {
};
function setHeliHook(f) {
  HELI_HOOK = f;
}
function meshAt(geo, mat, x, y, z, opt = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (opt.rotY) m.rotation.y = opt.rotY;
  if (opt.rotX) m.rotation.x = opt.rotX;
  if (opt.rotZ) m.rotation.z = opt.rotZ;
  m.castShadow = opt.cast !== false;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
var barrelGeoCache = {};
function barrel(x, y, z, col, tipped) {
  y = snapSupport(x, z, y);
  if (y === null) return;
  const key = "b";
  if (!barrelGeoCache[key]) {
    const parts = [];
    const body = new THREE.CylinderGeometry(0.295, 0.295, 0.88, 20, 1);
    parts.push(body);
    for (const yy of [-0.22, 0, 0.22]) {
      const r = new THREE.TorusGeometry(0.3, 0.022, 6, 20);
      r.rotateX(Math.PI / 2);
      r.translate(0, yy, 0);
      parts.push(r);
    }
    const lid = new THREE.CylinderGeometry(0.3, 0.3, 0.035, 20);
    lid.translate(0, 0.45, 0);
    parts.push(lid);
    barrelGeoCache[key] = BGU.mergeGeometries(parts, false);
  }
  const mat = col === "green" ? M.paintG : col === "blue" ? M.plastB : col === "orange" ? M.plastO : M.steel;
  const m = meshAt(barrelGeoCache[key], mat, x, y + (tipped ? 0.3 : 0.44), z, { rotY: sr(0, 6.28) });
  if (tipped) {
    m.rotation.z = Math.PI / 2;
    m.rotation.y = sr(0, 6.28);
    COLLIDERS.push({ x0: x - 0.46, y0: y, z0: z - 0.46, x1: x + 0.46, y1: y + 0.6, z1: z + 0.46 });
  } else COLLIDERS.push({ x0: x - 0.31, y0: y, z0: z - 0.31, x1: x + 0.31, y1: y + 0.9, z1: z + 0.31 });
  return m;
}
var coneGeo;
function cone(x, y, z) {
  y = snapSupport(x, z, y);
  if (y === null) return;
  if (!coneGeo) {
    const parts = [new THREE.ConeGeometry(0.175, 0.55, 14)];
    parts[0].translate(0, 0.3, 0);
    const b = new THREE.BoxGeometry(0.34, 0.035, 0.34);
    b.translate(0, 0.018, 0);
    parts.push(b);
    coneGeo = BGU.mergeGeometries(parts, false);
  }
  meshAt(coneGeo, M.plastO, x, y, z, { rotY: sr(0, 6.28) });
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.115, 0.135, 0.08, 14),
    cmat(15262936, { roughness: 0.5 })
  );
  band.position.set(x, y + 0.33, z);
  scene.add(band);
}
function lumberPile(x, y, z, rotY, len = 3.4, rows = 7) {
  y = snapSupport(x, z, y);
  if (y === null) return;
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < 3; j++)
      addBox(
        "wood",
        x - Math.sin(rotY) * (-0.2 + j * 0.2),
        y + 0.05 + i * 0.082,
        z - Math.cos(rotY) * (-0.2 + j * 0.2),
        len,
        0.075,
        0.17,
        { rotY, collide: false, d: 1.2 }
      );
  addAABB(x, y + rows * 0.082 / 2, z, len, rows * 0.082 + 0.06, 0.66, rotY);
}
function osbStack(x, y, z, rotY, n = 8) {
  y = snapSupport(x, z, y);
  if (y === null) return;
  for (let i = 0; i < n; i++)
    addBox(i % 2 ? "osb" : "osb2", x, y + 0.02 + i * 0.0135, z, 2.5, 0.0125, 1.25, { rotY, collide: false, d: 0.85 });
  addAABB(x, y + n * 0.0135 / 2, z, 2.5, n * 0.0135 + 0.05, 1.25, rotY);
}
function sawhorse(x, y, z, rotY) {
  y = snapSupport(x, z, y);
  if (y === null) return;
  addBox("wood", x, y + 0.74, z, 1.5, 0.09, 0.12, { rotY, d: 1.1 });
  for (const sx of [-0.6, 0.6]) for (const sz of [-0.28, 0.28]) {
    const px = x + Math.cos(rotY) * sx - Math.sin(rotY) * sz;
    const pz = z - Math.sin(rotY) * sx - Math.cos(rotY) * sz;
    addBox("wood", px, y + 0.37, pz, 0.07, 0.74, 0.07, { collide: false, d: 1 });
  }
}
function jerseyBarrier(x, y, z, rotY) {
  y = snapSupport(x, z, y);
  if (y === null) return;
  addBox("panel", x, y + 0.18, z, 2.2, 0.36, 0.62, { rotY, d: 0.5 });
  addBox("panel", x, y + 0.62, z, 2.2, 0.55, 0.36, { rotY, d: 0.5 });
}
function toolCart(x, y, z, rotY) {
  y = snapSupport(x, z, y);
  if (y === null) return;
  const G = new THREE.Group();
  const body = new THREE.Mesh(roundedBox(0.78, 0.86, 0.48, 0.05, 2), M.plastB);
  body.position.y = 0.62;
  G.add(body);
  for (let i = 0; i < 3; i++) {
    const out = i === 1 ? 0.14 : i === 2 ? 0.05 : 0;
    const dr = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.21, 0.44 + out * 2), M.dark);
    dr.position.set(0, 0.34 + i * 0.26, out);
    G.add(dr);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.035), M.chrome);
    h.position.set(0, 0.34 + i * 0.26, 0.24 + out);
    G.add(h);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.04, 0.54), M.steel);
  top.position.y = 1.07;
  G.add(top);
  const wr = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.05), M.chrome);
  wr.position.set(0.14, 1.1, -0.1);
  wr.rotation.y = 0.4;
  G.add(wr);
  const box2 = new THREE.Mesh(roundedBox(0.34, 0.16, 0.2, 0.03, 2), M.plastO);
  box2.position.set(-0.18, 1.17, 0.06);
  box2.rotation.y = -0.3;
  G.add(box2);
  for (const sx of [-0.3, 0.3]) for (const sz of [-0.18, 0.18]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.032, 6, 10), M.rubber);
    w.position.set(sx, 0.08, sz);
    w.rotation.y = Math.PI / 2;
    G.add(w);
  }
  G.position.set(x, y, z);
  G.rotation.y = rotY;
  G.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(G);
  addAABB(x, y + 0.55, z, 0.9, 1.1, 0.6, rotY);
}
function siteToilet(x, y, z, rotY) {
  y = snapSupport(x, z, y);
  if (y === null) return;
  const shell = cmat(4156242, { roughness: 0.62, metalness: 0.04 });
  addBox("panel", x, y + 0.04, z, 1.24, 0.08, 1.24, { rotY, d: 0.5 });
  const G = new THREE.Group();
  for (const [dx, dz, sx, sz] of [
    [0, -0.56, 1.12, 0.05],
    [0.58, 0, 0.05, 1.12],
    [-0.58, 0, 0.05, 1.12]
  ]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(sx, 2.24, sz), shell);
    w.position.set(dx, 1.2, dz);
    G.add(w);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2.16, 0.05), shell);
  door.position.set(0.28, 1.16, 0.52);
  door.rotation.y = -0.62;
  G.add(door);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(1.26, 0.07, 1.26),
    cmat(10133916, { roughness: 0.7 })
  );
  roof.position.y = 2.36;
  G.add(roof);
  const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.7, 8), M.darker);
  vent.position.set(-0.44, 2.7, -0.44);
  G.add(vent);
  G.position.set(x, y + 0.08, z);
  G.rotation.y = rotY;
  G.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(G);
  addAABB(x, y + 1.2, z, 1.24, 2.4, 1.24, rotY);
}
function cableDrum(x, y, z) {
  y = snapSupport(x, z, y);
  if (y === null) return;
  const G = new THREE.Group();
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.52), M.steel);
    leg.position.set(s * 0.52, 0.31, 0);
    G.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.72), M.steel);
    foot.position.set(s * 0.52, 0.03, 0);
    G.add(foot);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.16, 8), M.chrome);
  axle.rotation.z = Math.PI / 2;
  axle.position.y = 0.62;
  G.add(axle);
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.045, 18), M.wood);
    cheek.rotation.z = Math.PI / 2;
    cheek.position.set(s * 0.22, 0.62, 0);
    G.add(cheek);
  }
  const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.38, 16), M.cable);
  coil.rotation.z = Math.PI / 2;
  coil.position.y = 0.62;
  G.add(coil);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.95, 0),
    new THREE.Vector3(0.5, 0.42, 0.3),
    new THREE.Vector3(1.1, 0.04, 0.55),
    new THREE.Vector3(1.9, 0.03, 0.3)
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.024, 5, false), M.cable);
  G.add(tail);
  G.position.set(x, y, z);
  G.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(G);
  COLLIDERS.push({ x0: x - 0.6, y0: y, z0: z - 0.45, x1: x + 0.6, y1: y + 1.05, z1: z + 0.45 });
}
function compressor(x, y, z, rotY) {
  y = snapSupport(x, z, y);
  if (y === null) return;
  const G = new THREE.Group();
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.92, 14),
    cmat(10242600, { roughness: 0.6, metalness: 0.3 })
  );
  tank.rotation.z = Math.PI / 2;
  tank.position.y = 0.3;
  G.add(tank);
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), tank.material);
    cap.position.set(s * 0.46, 0.3, 0);
    cap.scale.x = 0.55;
    G.add(cap);
  }
  const motor = new THREE.Mesh(roundedBox(0.4, 0.3, 0.3, 0.05, 2), M.dark);
  motor.position.set(-0.1, 0.66, 0);
  G.add(motor);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.24, 10), M.steel);
  head.position.set(0.22, 0.68, 0);
  G.add(head);
  for (let i = 0; i < 5; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.26), M.darker);
    fin.position.set(0.22 - i * 0.045, 0.82, 0);
    G.add(fin);
  }
  const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 10), M.chrome);
  gauge.rotation.x = Math.PI / 2;
  gauge.position.set(0.34, 0.56, 0.08);
  G.add(gauge);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.6, 7), M.steel);
  handle.rotation.z = 1;
  handle.position.set(-0.5, 0.5, 0);
  G.add(handle);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 6, 12), M.rubber);
    w.position.set(0.3, 0.12, s * 0.26);
    w.rotation.y = Math.PI / 2;
    G.add(w);
  }
  const hc = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.3, 0.5, 0.2),
    new THREE.Vector3(0.9, 0.08, 0.6),
    new THREE.Vector3(0.4, 0.05, 1.2),
    new THREE.Vector3(-0.3, 0.05, 0.8)
  ], true);
  G.add(new THREE.Mesh(new THREE.TubeGeometry(hc, 20, 0.018, 5, true), M.cable));
  G.position.set(x, y, z);
  G.rotation.y = rotY;
  G.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(G);
  addAABB(x, y + 0.45, z, 1.1, 0.9, 0.62, rotY);
}
function extinguisher(x, y, z, rotY) {
  y = snapSupport(x, z, y);
  if (y === null) return;
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.083, 0.083, 0.42, 12),
    cmat(9318438, { roughness: 0.5, metalness: 0.25 })
  );
  body.position.y = 0.24;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.083, 10, 6), body.material);
  top.position.y = 0.45;
  top.scale.y = 0.55;
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.09, 8), M.steel);
  valve.position.y = 0.53;
  g.add(body, top, valve);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.traverse((o) => o.castShadow = true);
  scene.add(g);
}
function wheelGroup(R = 0.36, W = 0.24, spokes = 5) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(R, R, W, 22, 1), M.rubber);
  tyre.rotation.z = Math.PI / 2;
  g.add(tyre);
  const tread = [];
  for (let i = 0; i < 22; i++) {
    const a = i / 22 * Math.PI * 2;
    const b = new THREE.BoxGeometry(W * 0.92, 0.035, R * 0.17);
    b.translate(0, R - 0.012, 0);
    b.rotateX(a);
    tread.push(b);
  }
  const tm = new THREE.Mesh(BGU.mergeGeometries(tread, false), M.rubber);
  tm.rotation.z = Math.PI / 2;
  g.add(tm);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.TorusGeometry(R * 0.88, R * 0.1, 6, 20), M.rubber);
    side.position.x = s * W * 0.44;
    side.rotation.y = Math.PI / 2;
    g.add(side);
  }
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.66, R * 0.66, W * 0.5, 18), M.chrome);
  disc.rotation.z = Math.PI / 2;
  g.add(disc);
  for (let i = 0; i < spokes; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(W * 0.3, R * 1.15, R * 0.16), M.chrome);
    sp.rotation.x = i * Math.PI / spokes;
    g.add(sp);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.2, R * 0.2, W * 0.62, 12), M.chrome);
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return g;
}
function van(x, y, z, rotY, mat, opt = {}) {
  y = snapSupport(x, z, y);
  if (y === null) return;
  const G = new THREE.Group();
  const L = opt.len ?? 5.2, W = opt.wid ?? 2, R = 0.37;
  const sill = 0.34, boxH = 1.72;
  const body = new THREE.Mesh(roundedBox(L * 0.74, boxH, W, 0.16, 4), mat);
  body.position.set(-L * 0.12, sill + boxH / 2, 0);
  G.add(body);
  const nose = new THREE.Mesh(roundedBox(L * 0.3, boxH * 0.62, W * 0.96, 0.22, 4), mat);
  nose.position.set(L * 0.34, sill + boxH * 0.34, 0);
  G.add(nose);
  const cabIn = new THREE.Mesh(
    new THREE.BoxGeometry(L * 0.2, boxH * 0.42, W * 0.86),
    cmat(1513499, { roughness: 0.95 })
  );
  cabIn.position.set(L * 0.16, sill + boxH * 0.7, 0);
  G.add(cabIn);
  const wind = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.88, boxH * 0.48), M.carGlass);
  wind.position.set(L * 0.2, sill + boxH * 0.72, 0);
  wind.rotation.set(0, Math.PI / 2, 0);
  wind.rotateX(-0.24);
  G.add(wind);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.2, boxH * 0.34), M.carGlass);
    side.position.set(L * 0.1, sill + boxH * 0.7, s * W * 0.502);
    side.rotation.set(0, s > 0 ? 0 : Math.PI, 0);
    G.add(side);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.05, boxH * 0.78, 0.03), mat);
    rib.position.set(-L * 0.42 + i * L * 0.1, sill + boxH * 0.48, s * W * 0.505);
    G.add(rib);
  }
  for (const s of [-1, 1]) {
    const dr = new THREE.Mesh(new THREE.BoxGeometry(0.05, boxH * 0.92, W * 0.46), mat);
    dr.position.set(-L * 0.485, sill + boxH * 0.5, s * W * 0.245);
    G.add(dr);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.36, boxH * 0.28), M.carGlass);
    gl.position.set(-L * 0.512, sill + boxH * 0.78, s * W * 0.245);
    gl.rotation.y = -Math.PI / 2;
    G.add(gl);
    const hd = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.04), M.chrome);
    hd.position.set(-L * 0.515, sill + boxH * 0.45, s * 0.1);
    G.add(hd);
    const tl = new THREE.Mesh(roundedBox(0.06, 0.34, 0.16, 0.04, 2), M.lightRed);
    tl.position.set(-L * 0.5, sill + 0.3, s * W * 0.42);
    G.add(tl);
    const hl = new THREE.Mesh(roundedBox(0.08, 0.18, 0.28, 0.05, 2), M.headlamp);
    hl.position.set(L * 0.485, sill + 0.46, s * W * 0.34);
    G.add(hl);
  }
  const bump = new THREE.Mesh(roundedBox(0.16, 0.26, W * 0.99, 0.07, 3), M.darker);
  bump.position.set(L * 0.49, sill + 0.1, 0);
  G.add(bump);
  const bumpR = new THREE.Mesh(roundedBox(0.14, 0.24, W * 0.99, 0.07, 3), M.darker);
  bumpR.position.set(-L * 0.5, sill + 0.1, 0);
  G.add(bumpR);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(L * 0.6, 0.05, 0.05), M.steel);
    rail.position.set(-L * 0.12, sill + boxH + 0.06, s * W * 0.36);
    G.add(rail);
  }
  for (let i = 0; i < 6; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.4), M.steel);
    st.position.set(-L * 0.52, sill + 0.34 + i * 0.26, W * 0.3);
    G.add(st);
  }
  for (const sx of [L * 0.32, -L * 0.28]) for (const sz of [-1, 1]) {
    const w = wheelGroup(R, 0.26, 6);
    w.position.set(sx, R, sz * (W / 2 - 0.11));
    G.add(w);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(R * 1.1, 0.06, 6, 14, Math.PI), M.darker);
    arch.position.set(sx, R, sz * (W / 2 - 0.01));
    arch.rotation.y = Math.PI / 2;
    G.add(arch);
  }
  G.position.set(x, y, z);
  G.rotation.y = rotY;
  G.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(G);
  addAABB(x, y + (sill + boxH) / 2, z, L, sill + boxH, W, rotY);
  return G;
}
function pickup(x, y, z, rotY, mat) {
  y = snapSupport(x, z, y);
  if (y === null) return;
  const G = new THREE.Group();
  const L = 5, W = 1.94, R = 0.4, sill = 0.46, cabH = 1.12;
  const frame2 = new THREE.Mesh(new THREE.BoxGeometry(L * 0.92, 0.16, W * 0.72), M.darker);
  frame2.position.y = sill - 0.08;
  G.add(frame2);
  const cab = new THREE.Mesh(roundedBox(L * 0.36, cabH, W, 0.18, 4), mat);
  cab.position.set(L * 0.1, sill + cabH / 2, 0);
  G.add(cab);
  const nose = new THREE.Mesh(roundedBox(L * 0.26, cabH * 0.62, W * 0.97, 0.16, 4), mat);
  nose.position.set(L * 0.4, sill + cabH * 0.3, 0);
  G.add(nose);
  const bedH = 0.56;
  for (const s of [-1, 1]) {
    const sidew = new THREE.Mesh(roundedBox(L * 0.44, bedH, 0.09, 0.04, 2), mat);
    sidew.position.set(-L * 0.24, sill + bedH / 2, s * (W / 2 - 0.05));
    G.add(sidew);
  }
  const tail = new THREE.Mesh(roundedBox(0.09, bedH, W * 0.96, 0.04, 2), mat);
  tail.position.set(-L * 0.455, sill + bedH / 2, 0);
  G.add(tail);
  const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(L * 0.46, 0.06, W * 0.9), M.darker);
  bedFloor.position.set(-L * 0.24, sill + 0.03, 0);
  G.add(bedFloor);
  for (const px of [-L * 0.08, -L * 0.24, -L * 0.4]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(W * 0.42, 0.035, 6, 14, Math.PI), M.steel);
    arc.position.set(px, sill + bedH, 0);
    arc.rotation.y = Math.PI / 2;
    G.add(arc);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(L * 0.36, 0.04, 0.04), M.steel);
  rail.position.set(-L * 0.24, sill + bedH + W * 0.42, 0);
  G.add(rail);
  const wY = sill + cabH * 0.68;
  const cabIn = new THREE.Mesh(
    new THREE.BoxGeometry(L * 0.34, cabH * 0.5, W * 0.86),
    cmat(1513499, { roughness: 0.95 })
  );
  cabIn.position.set(L * 0.1, wY - 0.04, 0);
  G.add(cabIn);
  const wind = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.86, cabH * 0.48), M.carGlass);
  wind.position.set(L * 0.275, wY, 0);
  wind.rotation.set(0, Math.PI / 2, 0);
  wind.rotateX(-0.28);
  G.add(wind);
  const rear = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.82, cabH * 0.38), M.carGlass);
  rear.position.set(-L * 0.072, wY, 0);
  rear.rotation.set(0, -Math.PI / 2, 0);
  G.add(rear);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.26, cabH * 0.38), M.carGlass);
    side.position.set(L * 0.1, wY, s * W * 0.502);
    side.rotation.set(0, s > 0 ? 0 : Math.PI, 0);
    G.add(side);
    const hl = new THREE.Mesh(roundedBox(0.08, 0.16, 0.3, 0.05, 2), M.headlamp);
    hl.position.set(L * 0.52, sill + 0.34, s * W * 0.32);
    G.add(hl);
    const tl = new THREE.Mesh(roundedBox(0.06, 0.2, 0.16, 0.04, 2), M.lightRed);
    tl.position.set(-L * 0.47, sill + 0.22, s * W * 0.42);
    G.add(tl);
  }
  const bull = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, W * 0.9), M.steel);
  bull.position.set(L * 0.53, sill + 0.16, 0);
  G.add(bull);
  for (const s of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), M.steel);
    bar.position.set(L * 0.53, sill + 0.4, s * 0.32);
    G.add(bar);
  }
  const snork = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 10), M.darker);
  snork.position.set(L * 0.26, sill + cabH * 0.6, W * 0.48);
  G.add(snork);
  for (const sx of [L * 0.34, -L * 0.3]) for (const sz of [-1, 1]) {
    const w = wheelGroup(R, 0.3, 6);
    w.position.set(sx, R, sz * (W / 2 - 0.1));
    G.add(w);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(R * 1.14, 0.07, 6, 14, Math.PI), M.darker);
    arch.position.set(sx, R, sz * (W / 2));
    arch.rotation.y = Math.PI / 2;
    G.add(arch);
  }
  G.position.set(x, y, z);
  G.rotation.y = rotY;
  G.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(G);
  addAABB(x, y + (sill + cabH) / 2, z, L, sill + cabH, W, rotY);
  return G;
}
function carWreck(x, y, z, rotY) {
  y = snapSupport(x, z, y);
  if (y === null) return;
  const G = new THREE.Group();
  const L = 4.1, W = 1.76, sill = 0.42, bodyH = 0.72, cabH = 0.5;
  const shell = new THREE.Mesh(roundedBox(L, bodyH, W, 0.24, 4), M.carBlack);
  shell.position.y = sill + bodyH / 2;
  G.add(shell);
  const cab = new THREE.Mesh(roundedBox(L * 0.44, cabH, W * 0.88, 0.2, 4), M.carBlack);
  cab.position.set(-L * 0.04, sill + bodyH + cabH / 2 - 0.06, 0);
  G.add(cab);
  for (const s of [-1, 1]) {
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.34, cabH * 0.6), M.darker);
    hole.position.set(-L * 0.04, sill + bodyH + cabH * 0.5, s * W * 0.442);
    hole.rotation.y = s > 0 ? 0 : Math.PI;
    G.add(hole);
  }
  for (const sx of [L * 0.3, -L * 0.3]) for (const sz of [-1, 1]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.22, sill, 0.22), M.wood);
    st.position.set(sx, sill / 2, sz * (W / 2 - 0.16));
    G.add(st);
  }
  G.position.set(x, y, z);
  G.rotation.y = rotY;
  G.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(G);
  addAABB(x, y + (sill + bodyH + cabH) / 2, z, L, sill + bodyH + cabH, W, rotY);
}
function helipad(cx, cz) {
  const R = 7.2;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.26, 48), M.helipad);
  pad.position.set(cx, 0.13, cz);
  pad.receiveShadow = true;
  pad.castShadow = true;
  scene.add(pad);
  COLLIDERS.push({ x0: cx - R, y0: 0, z0: cz - R, x1: cx + R, y1: 0.26, z1: cz + R });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.14, 8, 48), M.dark);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(cx, 0.24, cz);
  rim.castShadow = true;
  scene.add(rim);
  const fenceR = R + 1.9, posts = 28;
  const gates = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const atGate = (a) => gates.some((g) => {
    const d = Math.abs((a - g + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    return Math.PI - d < 0.42;
  });
  for (let i = 0; i < posts; i++) {
    const a = i / posts * Math.PI * 2;
    if (atGate(a)) continue;
    const px = cx + Math.cos(a) * fenceR, pz = cz + Math.sin(a) * fenceR;
    addBox("steel", px, 0.62, pz, 0.09, 1.24, 0.09, { collide: false, d: 1.1 });
    const a2 = (i + 1) / posts * Math.PI * 2;
    if (atGate(a2)) continue;
    const qx = cx + Math.cos(a2) * fenceR, qz = cz + Math.sin(a2) * fenceR;
    const len = Math.hypot(qx - px, qz - pz);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(len, 1.15),
      cmat(7172983, {
        roughness: 0.86,
        metalness: 0.4,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide
      })
    );
    mesh.position.set((px + qx) / 2, 0.66, (pz + qz) / 2);
    mesh.rotation.y = -Math.atan2(qz - pz, qx - px);
    scene.add(mesh);
    for (const yy of [0.12, 1.2]) {
      const g = new THREE.BoxGeometry(len, 0.045, 0.045);
      g.rotateY(-Math.atan2(qz - pz, qx - px));
      g.translate((px + qx) / 2, yy, (pz + qz) / 2);
      bucket("steel").push(g);
    }
    COLLIDERS.push({
      x0: Math.min(px, qx) - 0.08,
      y0: 0,
      z0: Math.min(pz, qz) - 0.08,
      x1: Math.max(px, qx) + 0.08,
      y1: 1.28,
      z1: Math.max(pz, qz) + 0.08
    });
  }
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    const px = cx + Math.cos(a) * (R - 0.5), pz = cz + Math.sin(a) * (R - 0.5);
    const base2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.14, 10), M.dark);
    base2.position.set(px, 0.32, pz);
    base2.castShadow = true;
    scene.add(base2);
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 8),
      i % 3 === 0 ? M.lightRed : M.lightAmb
    );
    lens.position.set(px, 0.44, pz);
    scene.add(lens);
  }
  const wsX = cx - fenceR - 0.9, wsZ = cz + fenceR * 0.55;
  addBox("steel", wsX, 2.4, wsZ, 0.12, 4.8, 0.12, { d: 1.1 });
  addBox("dark", wsX, 0.12, wsZ, 0.6, 0.24, 0.6, { d: 1.2 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 16), M.steel);
  ring.position.set(wsX + 0.36, 4.7, wsZ);
  ring.rotation.y = Math.PI / 2;
  scene.add(ring);
  for (let i = 0; i < 5; i++) {
    const r0 = 0.33 - i * 0.045, r1 = 0.33 - (i + 1) * 0.045;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(r1, r0, 0.42, 12, 1, true),
      i % 2 ? cmat(11841700, { roughness: 0.92, side: THREE.DoubleSide }) : cmat(10242600, { roughness: 0.92, side: THREE.DoubleSide })
    );
    seg.rotation.z = -Math.PI / 2 + 0.16;
    seg.position.set(wsX + 0.55 + i * 0.41, 4.7 - i * 0.07, wsZ);
    seg.castShadow = true;
    scene.add(seg);
  }
  HELI_HOOK(cx + 0.4, 0.26, cz - 0.3, -0.42);
  const cart = new THREE.Group();
  const cbody = new THREE.Mesh(roundedBox(1.5, 0.42, 0.9, 0.1, 3), M.paintY);
  cbody.position.y = 0.42;
  cart.add(cbody);
  const chandle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 8), M.steel);
  chandle.rotation.z = 0.9;
  chandle.position.set(1.05, 0.6, 0);
  cart.add(chandle);
  for (const sx of [-0.5, 0.5]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.055, 7, 12), M.rubber);
    w.position.set(sx, 0.17, sz * 0.42);
    w.rotation.y = Math.PI / 2;
    cart.add(w);
  }
  cart.position.set(cx - 4.6, 0.26, cz + 3.6);
  cart.rotation.y = 0.5;
  cart.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(cart);
  addAABB(cx - 4.6, 0.26 + 0.35, cz + 3.6, 1.8, 0.7, 1.1, 0.5);
  barrel(cx - 5.4, 0.26, cz - 3.2, "green");
  barrel(cx - 4.7, 0.26, cz - 3.8, "green");
  barrel(cx - 5.6, 0.26, cz - 4.2, null, true);
  extinguisher(cx + 4.8, 0.26, cz + 4.2, 0);
  extinguisher(cx + 5.2, 0.26, cz + 4.2, 0);
  cone(cx + 3.6, 0.26, cz + 5);
  cone(cx - 3.2, 0.26, cz + 5.2);
  const mx = cx + fenceR * 0.72, mz = cz - fenceR * 0.72;
  addBox("steel", mx, 3.3, mz, 0.16, 6.6, 0.16, { d: 1.1 });
  addBox("dark", mx, 0.14, mz, 0.7, 0.28, 0.7, { d: 1.2 });
  for (const a of [0.6, 1.2]) {
    const head = new THREE.Mesh(roundedBox(0.44, 0.3, 0.2, 0.05, 2), M.dark);
    head.position.set(mx - Math.cos(a) * 0.4, 6.5, mz + Math.sin(a) * 0.4);
    head.rotation.y = a;
    head.castShadow = true;
    scene.add(head);
    const lens = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.24),
      new THREE.MeshBasicMaterial({ color: 14341828 })
    );
    lens.position.set(mx - Math.cos(a) * 0.52, 6.45, mz + Math.sin(a) * 0.52);
    lens.rotation.y = a - Math.PI / 2;
    lens.rotation.x = -0.3;
    scene.add(lens);
  }
  return { cx, cz, R, fenceR };
}
function concBlock(x, y, z, rotY, len = 1.6, h = 0.62) {
  y = snapSupport(x, z, y);
  if (y === null) return;
  addBox("panel", x, y + h / 2, z, len, h, 0.6, { rotY, d: 0.5 });
  for (const s of [-1, 1]) {
    const o = s * len * 0.28;
    const lp = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.017, 5, 10, Math.PI), M.steel);
    lp.position.set(x + Math.cos(rotY) * o, y + h + 0.02, z - Math.sin(rotY) * o);
    lp.rotation.y = rotY;
    lp.castShadow = true;
    scene.add(lp);
  }
}
function blockWall(x, z, rotY, len = 6, rows = 2) {
  const n = Math.max(1, Math.round(len / 1.6));
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? 0.8 : 0;
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + 0.8 + i * 1.6 + off;
      if (Math.abs(t) > len / 2) continue;
      if (r > 0 && srnd() < 0.22) continue;
      const px = x + Math.cos(rotY) * t, pz = z - Math.sin(rotY) * t;
      concBlock(px, r * 0.62, pz, rotY + sr(-0.03, 0.03), 1.55, 0.62);
    }
  }
}
function cabin(x, y, z, rotY, w = 2.4, d = 5.6, h = 2.5, col = 8093814) {
  y = snapSupport(x, z, y);
  if (y === null) return;
  const mat = cmat(col, { roughness: 0.8, metalness: 0.32 });
  const G = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(d, h, w), mat);
  body.position.y = h / 2 + 0.16;
  G.add(body);
  for (let i = 0; i < Math.round(d / 0.4); i++) for (const s of [-1, 1]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, h * 0.9, 0.04), mat);
    rib.position.set(-d / 2 + 0.2 + i * 0.4, h / 2 + 0.16, s * (w / 2 + 0.02));
    G.add(rib);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(d + 0.2, 0.1, w + 0.2), M.roof);
  roof.position.y = h + 0.2;
  G.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2, 0.85), M.darker);
  door.position.set(d / 2 + 0.01, 1.16, -w * 0.2);
  G.add(door);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.2), M.chrome);
  hand.position.set(d / 2 + 0.06, 1.1, -w * 0.2 + 0.3);
  G.add(hand);
  for (const px of [-d * 0.3, d * 0.14]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.8), M.glass);
    win.position.set(px, 1.72, w / 2 + 0.03);
    win.rotation.y = 0;
    G.add(win);
    const fr2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.05), M.darker);
    fr2.position.set(px, 1.72, w / 2 + 0.01);
    G.add(fr2);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.82, 0.03), M.steel);
      b.position.set(px - 0.4 + i * 0.27, 1.72, w / 2 + 0.06);
      G.add(b);
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const blk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5), M.panel);
    blk.position.set(sx * (d / 2 - 0.5), 0.08, sz * (w / 2 - 0.4));
    G.add(blk);
  }
  const step2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 1), M.steel);
  step2.position.set(d / 2 + 0.32, 0.4, -w * 0.2);
  G.add(step2);
  G.position.set(x, y, z);
  G.rotation.y = rotY;
  G.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(G);
  addAABB(x, y + (h + 0.26) / 2, z, d, h + 0.26, w, rotY);
}
function pipeStack(x, y, z, rotY, n = 3) {
  y = snapSupport(x, z, y);
  if (y === null) return;
  const R = 0.72, L = 2.4;
  const lay = [[0, 0], [1, 0], [2, 0], [0.5, 1], [1.5, 1], [1, 2]];
  for (let i = 0; i < Math.min(n * 2, lay.length); i++) {
    const [c, r] = lay[i];
    const ox = (c - 1) * R * 2.05, oy = R + r * R * 1.78;
    const px = x - Math.sin(rotY) * ox, pz = z - Math.cos(rotY) * ox;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 20, 1, true), M.panel);
    tube.rotation.z = Math.PI / 2;
    tube.rotation.y = rotY;
    tube.position.set(px, y + oy, pz);
    tube.castShadow = tube.receiveShadow = true;
    scene.add(tube);
    const inner = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.82, R * 0.82, L * 0.99, 20, 1, true),
      cmat(7170659, { roughness: 0.96, side: THREE.BackSide })
    );
    inner.rotation.z = Math.PI / 2;
    inner.rotation.y = rotY;
    inner.position.copy(tube.position);
    scene.add(inner);
    for (const s of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.91, R * 0.09, 6, 20), M.panel);
      rim.position.set(px + Math.cos(rotY) * s * L / 2, y + oy, pz - Math.sin(rotY) * s * L / 2);
      rim.rotation.y = rotY + Math.PI / 2;
      scene.add(rim);
    }
    for (const so of [-1, 1])
      COLLIDERS.push({
        x0: px - (rotY ? 0.2 : L / 2) - 0.2,
        y0: y + oy + so * R * 0.86 - 0.16,
        z0: pz - (rotY ? L / 2 : 0.2) - 0.2,
        x1: px + (rotY ? 0.2 : L / 2) + 0.2,
        y1: y + oy + so * R * 0.86 + 0.16,
        z1: pz + (rotY ? L / 2 : 0.2) + 0.2
      });
  }
}
var V$2 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
var DYN_PROPS = [];
var shadowAll = (g) => g.traverse((o) => {
  if (o.isMesh) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
});
var HELI_SECS = [
  { x: 3.62, w: 0.04, ht: 0.04, hb: 0.04, yc: 0.99, sq: 2 },
  { x: 3.55, w: 0.22, ht: 0.2, hb: 0.22, yc: 0.99, sq: 2 },
  { x: 3.42, w: 0.38, ht: 0.34, hb: 0.35, yc: 1.01, sq: 2.1 },
  { x: 3.15, w: 0.62, ht: 0.6, hb: 0.45, yc: 1.1, sq: 2.3 },
  { x: 2.85, w: 0.82, ht: 0.8, hb: 0.54, yc: 1.2, sq: 2.5 },
  { x: 2.5, w: 0.98, ht: 0.94, hb: 0.61, yc: 1.29, sq: 2.9 },
  { x: 1.9, w: 1.12, ht: 1.03, hb: 0.66, yc: 1.34, sq: 3.3 },
  { x: 1.35, w: 1.16, ht: 1.06, hb: 0.68, yc: 1.36, sq: 3.6 },
  { x: 0.85, w: 1.16, ht: 1.06, hb: 0.68, yc: 1.36, sq: 3.6 },
  { x: 0.45, w: 1.16, ht: 1.06, hb: 0.68, yc: 1.36, sq: 3.6 },
  { x: 0.05, w: 1.16, ht: 1.06, hb: 0.68, yc: 1.36, sq: 3.6 },
  { x: -0.35, w: 1.16, ht: 1.06, hb: 0.68, yc: 1.36, sq: 3.6 },
  { x: -0.75, w: 1.16, ht: 1.06, hb: 0.68, yc: 1.36, sq: 3.6 },
  { x: -1.55, w: 1.14, ht: 1.04, hb: 0.62, yc: 1.4, sq: 3.5 },
  { x: -2.1, w: 0.98, ht: 0.92, hb: 0.44, yc: 1.54, sq: 3 },
  { x: -2.6, w: 0.74, ht: 0.72, hb: 0.34, yc: 1.7, sq: 2.6 },
  { x: -3.1, w: 0.52, ht: 0.52, hb: 0.3, yc: 1.86, sq: 2.4 },
  { x: -3.8, w: 0.4, ht: 0.42, hb: 0.29, yc: 1.94, sq: 2.3 },
  { x: -4.6, w: 0.34, ht: 0.36, hb: 0.28, yc: 2, sq: 2.2 },
  { x: -5.6, w: 0.29, ht: 0.31, hb: 0.25, yc: 2.05, sq: 2.1 },
  { x: -6.6, w: 0.24, ht: 0.26, hb: 0.22, yc: 2.1, sq: 2 },
  { x: -7.4, w: 0.2, ht: 0.22, hb: 0.19, yc: 2.14, sq: 2 },
  { x: -8, w: 0.17, ht: 0.19, hb: 0.17, yc: 2.16, sq: 2 },
  { x: -8.12, w: 0.02, ht: 0.02, hb: 0.02, yc: 2.16, sq: 2 }
];
var HELI_X0 = 3.62;
var HELI_LEN = 3.62 + 8.12;
var HELI_MAT = {};
var HELI_BEACONS = [];
var _hA = new THREE.Vector3();
var _hB = new THREE.Vector3();
function heliSecAt(x, S = HELI_SECS) {
  if (x >= S[0].x) return S[0];
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i], b = S[i + 1];
    if (x <= a.x && x >= b.x) {
      const k = (a.x - x) / (a.x - b.x || 1);
      return { x, w: lerp(a.w, b.w, k), ht: lerp(a.ht, b.ht, k), hb: lerp(a.hb, b.hb, k), yc: lerp(a.yc, b.yc, k), sq: lerp(a.sq, b.sq, k) };
    }
  }
  return S[S.length - 1];
}
function heliPt(s, th, grow = 0, out = new THREE.Vector3()) {
  const c = Math.cos(th), sn = Math.sin(th), e = 2 / (s.sq || 2.4);
  return out.set(
    s.x,
    s.yc + Math.max(4e-3, (sn > 0 ? s.ht : s.hb) + grow) * Math.sign(sn) * Math.pow(Math.abs(sn), e),
    Math.max(4e-3, s.w + grow) * Math.sign(c) * Math.pow(Math.abs(c), e)
  );
}
function heliTheta(s, y, side) {
  const t = y - s.yc, h = t > 0 ? s.ht : s.hb;
  const a = Math.asin(clamp(Math.sign(t) * Math.pow(Math.min(1, Math.abs(t) / h), (s.sq || 2.4) / 2), -1, 1));
  return side > 0 ? a : Math.PI - a;
}
function heliDsDth(s, th) {
  heliPt(s, th - 0.01, 0, _hA);
  heliPt(s, th + 0.01, 0, _hB);
  return Math.max(1e-3, _hA.distanceTo(_hB) / 0.02);
}
function heliLoft(S, M_, classify, group, o = {}) {
  const i0 = o.i0 ?? 0, i1 = o.i1 ?? S.length - 1, grow = o.grow || 0, R = M_ + 1, NG = o.groups || 3;
  const pos = [], uv = [], p = new THREE.Vector3(), q = new THREE.Vector3();
  const uvf = o.uv || ((x, th) => [(HELI_X0 - x) / HELI_LEN, (th + Math.PI / 2) / (Math.PI * 2)]);
  for (let i = i0; i <= i1; i++) for (let j = 0; j <= M_; j++) {
    const th = -Math.PI / 2 + j / M_ * Math.PI * 2;
    heliPt(S[i], th, grow, p);
    pos.push(p.x, p.y, p.z);
    const t = uvf(S[i].x, th);
    uv.push(t[0], t[1]);
  }
  const lists = Array.from({ length: NG }, () => []), codes = [];
  for (let i = 0; i < i1 - i0; i++) for (let j = 0; j < M_; j++) {
    const th = -Math.PI / 2 + (j + 0.5) / M_ * Math.PI * 2;
    heliPt(heliSecAt((S[i0 + i].x + S[i0 + i + 1].x) / 2, S), th, 0, q);
    const code = classify ? classify(i0 + i, th, q) : 0;
    codes.push(code);
    const gi = group ? group(code) : 0;
    if (gi < 0) continue;
    const a = i * R + j, b = a + 1, c = a + R, d = c + 1;
    if (o.inward) lists[gi].push(a, c, b, b, c, d);
    else lists[gi].push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  const idx = [];
  let off = 0;
  lists.forEach((L, k) => {
    if (L.length) g.addGroup(off, L.length, k);
    off += L.length;
    for (const v of L) idx.push(v);
  });
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, codes, M: M_, i0, i1, R };
}
function heliFrames(L, pick) {
  const pos = L.geo.attributes.position, nrm = L.geo.attributes.normal, out = [], NI = L.i1 - L.i0;
  const P = (k) => new THREE.Vector3().fromBufferAttribute(pos, k), N = (k) => new THREE.Vector3().fromBufferAttribute(nrm, k);
  const bar = (ka, kb, spec) => {
    const a = P(ka), b = P(kb), n = N(ka).add(N(kb)).normalize(), e = b.clone().sub(a), len = e.length();
    if (len < 1e-4) return;
    e.divideScalar(len);
    const sd = new THREE.Vector3().crossVectors(e, n).normalize();
    n.crossVectors(sd, e);
    const g = new THREE.BoxGeometry(len + spec.w * 0.7, spec.t, spec.w);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(e, n, sd));
    g.translate((a.x + b.x) / 2 + n.x * spec.off, (a.y + b.y) / 2 + n.y * spec.off, (a.z + b.z) / 2 + n.z * spec.off);
    out.push(g);
  };
  const C = (i, j) => L.codes[i * L.M + (j + L.M) % L.M];
  for (let i = 0; i < NI; i++) for (let j = 0; j < L.M; j++) {
    const c = C(i, j), cn = C(i, j + 1);
    if (c !== cn) {
      const s = pick(c, cn);
      if (s) bar(i * L.R + j + 1, (i + 1) * L.R + j + 1, s);
    }
    if (i < NI - 1) {
      const cl = C(i + 1, j);
      if (c !== cl) {
        const s = pick(c, cl);
        if (s) bar((i + 1) * L.R + j, (i + 1) * L.R + j + 1, s);
      }
    }
  }
  return out.length ? BGU.mergeGeometries(out, false) : null;
}
function heightToNormalRect(hc, strength) {
  const w = hc.width, h = hc.height, src = hc.getContext("2d").getImageData(0, 0, w, h).data;
  const [nc, nx] = cv(w, h), out = nx.createImageData(w, h), o = out.data;
  const H = (x, y) => src[((y + h) % h * w + (x + w) % w) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    o[i] = (-dx / l * 0.5 + 0.5) * 255;
    o[i + 1] = (-dy / l * 0.5 + 0.5) * 255;
    o[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    o[i + 3] = 255;
  }
  nx.putImageData(out, 0, 0);
  return nc;
}
function heliSkinMaps(W) {
  const H = W / 2, K = W / 2048;
  let seed = 90731;
  const r = () => {
    seed = seed * 1664525 + 1013904223 >>> 0;
    return seed / 4294967296;
  }, R = (a, b) => a + r() * (b - a);
  const [ac, ax] = cv(W, H), [hc, hx] = cv(W, H), [oc, ox] = cv(W, H);
  const X = (xm) => (HELI_X0 - xm) / HELI_LEN * W;
  const Y = (th) => (1 - (th + Math.PI / 2) / (Math.PI * 2)) * H;
  const PXM = W / HELI_LEN;
  const VPM = (xm, th) => H / (Math.PI * 2) / heliDsDth(heliSecAt(xm), th);
  const TH2 = (xm, y, side) => heliTheta(heliSecAt(xm), y, side);
  const poly = (ctx, pts, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.fill();
  };
  ax.fillStyle = "#4d5337";
  ax.fillRect(0, 0, W, H);
  hx.fillStyle = "rgb(128,128,128)";
  hx.fillRect(0, 0, W, H);
  ox.fillStyle = "rgb(255,150,18)";
  ox.fillRect(0, 0, W, H);
  for (let i = 0; i < 700; i++) {
    const x = r() * W, y = r() * H, rr = R(6, 70) * K, lite = r() < 0.5;
    ax.fillStyle = lite ? `rgba(118,124,92,${R(0.03, 0.09)})` : `rgba(30,34,20,${R(0.03, 0.1)})`;
    ax.beginPath();
    ax.ellipse(x, y, rr * R(1.2, 2.4), rr, R(-0.3, 0.3), 0, 7);
    ax.fill();
  }
  const band = (th, half, col, a) => {
    const y0 = Y(th + half), y1 = Y(th - half), g = ax.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, `rgba(${col},0)`);
    g.addColorStop(0.5, `rgba(${col},${a})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ax.fillStyle = g;
    ax.fillRect(0, y0, W, y1 - y0);
  };
  band(Math.PI / 2, 0.95, "156,154,130", 0.2);
  band(-Math.PI / 2, 0.55, "44,36,24", 0.6);
  band(Math.PI * 1.5, 0.55, "44,36,24", 0.6);
  for (const [y0, y1] of [[H * 0.86, H], [H * 0.14, 0]]) {
    const g = ox.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, "rgba(255,200,18,0)");
    g.addColorStop(1, "rgba(255,205,18,1)");
    ox.fillStyle = g;
    ox.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
  }
  const seamLine = (pts) => {
    for (const [ctx, col, lw] of [[ax, "rgba(16,18,10,.6)", 1.25 * K], [hx, "rgb(58,58,58)", 2.2 * K]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, lw);
      ctx.lineJoin = "round";
      ctx.beginPath();
      pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.stroke();
    }
  };
  const rivet = (x, y, rx, ry) => {
    hx.fillStyle = "rgba(200,200,200,.9)";
    hx.beginPath();
    hx.ellipse(x, y, Math.max(0.6, rx * 1.3), Math.max(0.6, ry * 1.3), 0, 0, 7);
    hx.fill();
    ax.fillStyle = "rgba(128,132,104,.35)";
    ax.beginPath();
    ax.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, 7);
    ax.fill();
  };
  const frameAt = (xm, th0 = -Math.PI / 2, th1 = Math.PI * 1.5) => {
    const x = X(xm);
    seamLine([[x, Y(th0)], [x, Y(th1)]]);
    const s = heliSecAt(xm);
    for (let th = th0; th < th1; ) {
      const d = heliDsDth(s, th), y = Y(th), vr = 35e-4 * H / (Math.PI * 2) / d;
      for (const sx of [-1, 1]) rivet(x + sx * 0.014 * PXM, y, 35e-4 * PXM, vr);
      th += 0.045 / d;
    }
  };
  const seamAlong = (th, x0, x1, rivets = true) => {
    const pts = [];
    for (let k = 0; k <= 24; k++) pts.push([X(lerp(x0, x1, k / 24)), Y(th)]);
    seamLine(pts);
    if (!rivets) return;
    for (let xm = x0; xm > x1; xm -= 0.045) {
      const v = VPM(xm, th);
      for (const sy of [-1, 1]) rivet(X(xm), Y(th) + sy * 0.014 * v, 35e-4 * PXM, 35e-4 * v);
    }
  };
  const outline = (x0, x1, y0, y1, side, screws = false) => {
    const pts = [], N = 10;
    for (let k = 0; k <= N; k++) {
      const xm = lerp(x0, x1, k / N);
      pts.push([X(xm), Y(TH2(xm, y0, side))]);
    }
    for (let k = 0; k <= N; k++) {
      const xm = lerp(x1, x0, k / N);
      pts.push([X(xm), Y(TH2(xm, y1, side))]);
    }
    pts.push(pts[0]);
    seamLine(pts);
    if (!screws) return;
    const ins = 0.025, sg = Math.sign(x1 - x0), xs = [x0 + sg * ins, (x0 + x1) / 2, x1 - sg * ins], ys = [y0 + ins, y1 - ins];
    for (const xm of xs) for (const yy of ys) {
      const th = TH2(xm, yy, side), v = VPM(xm, th), px = X(xm), py = Y(th);
      hx.fillStyle = "rgb(96,96,96)";
      hx.beginPath();
      hx.ellipse(px, py, 7e-3 * PXM, 7e-3 * v, 0, 0, 7);
      hx.fill();
      ax.fillStyle = "rgba(24,24,18,.5)";
      ax.beginPath();
      ax.ellipse(px, py, 6e-3 * PXM, 6e-3 * v, 0, 0, 7);
      ax.fill();
    }
  };
  const stencil = (txt, xm, y, side, hM, col = "rgba(212,208,186,.88)") => {
    const th = TH2(xm, y, side), v = VPM(xm, th);
    ax.save();
    ax.translate(X(xm), Y(th));
    ax.scale((side > 0 ? -1 : 1) * PXM / 100, (side > 0 ? 1 : -1) * v / 100);
    ax.font = `700 ${Math.round(hM * 100)}px "Arial Narrow","Segoe UI",Arial,sans-serif`;
    ax.textAlign = "center";
    ax.textBaseline = "middle";
    ax.fillStyle = col;
    ax.fillText(txt, 0, 0);
    ax.restore();
  };
  for (const xm of [3.42, 3.15, 2.5, 1.35, -0.75, -1.55, -2.1, -2.6, -3.1, -3.8, -4.6, -5.6, -6.6, -7.4, -8]) frameAt(xm);
  for (const s of [1, -1]) {
    const tl = (th) => s > 0 ? th : Math.PI - th;
    seamAlong(tl(-0.62), 3.2, -2.1);
    seamAlong(tl(0.66), 1.35, -2.1);
    seamAlong(tl(0.02), -2.1, -8);
    seamAlong(tl(1.1), -2.6, -8, false);
    outline(-0.73, 0.83, 0.88, 2, s);
    outline(1.37, 2.48, 0.86, 2.06, s);
    outline(-1.6, -2.3, 1.2, 1.75, s, true);
    outline(-2.75, -3.35, 1.72, 2.02, s, true);
    outline(-4.3, -4.8, 1.86, 2.1, s, true);
    outline(2.95, 3.25, 1.05, 1.28, s, true);
    for (const [xm, y] of [[1.2, 1.05], [-0.95, 1.55], [-1.05, 2.05]]) {
      const th = TH2(xm, y, s), v = VPM(xm, th);
      ax.fillStyle = "rgba(12,12,8,.85)";
      ax.fillRect(X(xm) - 0.07 * PXM, Y(th) - 0.025 * v, 0.14 * PXM, 0.05 * v);
      hx.fillStyle = "rgb(40,40,40)";
      hx.fillRect(X(xm) - 0.07 * PXM, Y(th) - 0.025 * v, 0.14 * PXM, 0.05 * v);
    }
    stencil("141", -3.95, 2, s, 0.3, "rgba(210,206,184,.92)");
    stencil("НЕ СТУПАТЬ", -2.9, 2.28, s, 0.045);
    stencil("ОСТОРОЖНО — РУЛЕВОЙ ВИНТ", -6.9, 2.08, s, 0.05, "rgba(206,60,40,.9)");
    stencil("АВАРИЙНЫЙ ВЫХОД", 1.93, 0.98, s, 0.04, "rgba(214,176,60,.9)");
    stencil("ЗАЗЕМЛЕНИЕ", -1.95, 1.1, s, 0.035);
    stencil("Т-1 · 1000 л", -2.05, 1.62, s, 0.035);
    for (let k = 0; k < 9; k++) {
      const xm = R(-1.8, 0.8), y0 = R(2.2, 2.34), len = R(0.2, 1), w = R(1.2, 3.2) * K;
      const ya = Y(TH2(xm, y0, s)), yb = Y(TH2(xm, y0 - len, s));
      const g = ax.createLinearGradient(0, ya, 0, yb);
      g.addColorStop(0, "rgba(22,18,10,.5)");
      g.addColorStop(1, "rgba(22,18,10,0)");
      ax.fillStyle = g;
      ax.fillRect(X(xm) - w / 2, Math.min(ya, yb), w, Math.abs(yb - ya));
      const go = ox.createLinearGradient(0, ya, 0, yb);
      go.addColorStop(0, "rgba(255,60,18,.9)");
      go.addColorStop(1, "rgba(255,60,18,0)");
      ox.fillStyle = go;
      ox.fillRect(X(xm) - w / 2, Math.min(ya, yb), w, Math.abs(yb - ya));
    }
    const chip = (xm, y, sz) => {
      const th = TH2(xm, y, s), v = VPM(xm, th), px = X(xm), py = Y(th), pts = [];
      for (let k = 0; k < 7; k++) {
        const a = k / 7 * 6.283, rr = sz * R(0.5, 1.2);
        pts.push([px + Math.cos(a) * rr * PXM, py + Math.sin(a) * rr * v]);
      }
      poly(ax, pts, "rgba(150,150,142,.9)");
      poly(ox, pts, "rgb(255,90,210)");
      poly(hx, pts, "rgb(112,112,112)");
    };
    for (let k = 0; k < 26; k++) chip(r() < 0.5 ? R(-0.76, -0.68) : R(0.78, 0.86), R(0.9, 2), R(4e-3, 0.012));
    for (let k = 0; k < 18; k++) chip(R(-1.2, 1.3), R(0.9, 1.15), R(3e-3, 0.01));
    for (let k = 0; k < 12; k++) chip(R(1.36, 1.45), R(0.9, 2), R(3e-3, 0.01));
    for (const [xm, y] of [[0.72, 1.35], [1.5, 1.45]]) for (let k = 0; k < 10; k++) {
      const th = TH2(xm, y, s), v = VPM(xm, th), px = X(xm + R(-0.06, 0.06)), py = Y(th) + R(-0.04, 0.04) * v, a = R(-0.4, 0.4), L = R(0.02, 0.06);
      ax.strokeStyle = "rgba(160,160,150,.45)";
      ax.lineWidth = Math.max(0.6, 0.8 * K);
      ax.beginPath();
      ax.moveTo(px, py);
      ax.lineTo(px + Math.cos(a) * L * PXM, py + Math.sin(a) * L * v);
      ax.stroke();
    }
  }
  for (const [x0, x1] of [[0.95, 0.15], [0.05, -0.85], [-0.95, -1.75]])
    seamLine([[X(x0), Y(Math.PI / 2 - 0.9)], [X(x1), Y(Math.PI / 2 - 0.9)], [X(x1), Y(Math.PI / 2 + 0.9)], [X(x0), Y(Math.PI / 2 + 0.9)], [X(x0), Y(Math.PI / 2 - 0.9)]]);
  for (const sgn of [1, -1]) {
    const th = Math.PI / 2 + sgn * 0.62, hh = 0.14 * H / (Math.PI * 2);
    for (let k = 0; k < 12; k++) {
      const xm = -0.2 - k * 0.05;
      ax.fillStyle = "rgba(10,10,8,.9)";
      ax.fillRect(X(xm), Y(th) - hh, 0.022 * PXM, hh * 2);
      hx.fillStyle = "rgb(50,50,50)";
      hx.fillRect(X(xm), Y(th) - hh, 0.022 * PXM, hh * 2);
    }
  }
  for (let k = 0; k < 160; k++) {
    const x0 = R(-1.9, -2.3), x1 = x0 - R(0.8, 4.2), th = Math.PI / 2 + R(-0.55, 0.55) * (0.6 + r() * 0.4), a = R(0.05, 0.14), w = R(2, 9) * K;
    const g = ax.createLinearGradient(X(x0), 0, X(x1), 0);
    g.addColorStop(0, `rgba(14,12,10,${a})`);
    g.addColorStop(1, "rgba(14,12,10,0)");
    ax.fillStyle = g;
    ax.fillRect(X(x0), Y(th) - w / 2, X(x1) - X(x0), w);
    const go = ox.createLinearGradient(X(x0), 0, X(x1), 0);
    go.addColorStop(0, `rgba(255,235,10,${Math.min(1, a * 4)})`);
    go.addColorStop(1, "rgba(255,235,10,0)");
    ox.fillStyle = go;
    ox.fillRect(X(x0), Y(th) - w / 2, X(x1) - X(x0), w);
  }
  {
    const g = ax.createLinearGradient(X(3.62), 0, X(3.3), 0);
    g.addColorStop(0, "rgba(120,122,110,.55)");
    g.addColorStop(1, "rgba(120,122,110,0)");
    ax.fillStyle = g;
    ax.fillRect(X(3.62), 0, X(3.3) - X(3.62), H);
  }
  grain(ax, W, H, 0.025);
  return { albedo: ac, normal: heightToNormalRect(hc, 3.2), orm: oc };
}
function cockpitPanelTex() {
  const [c, x] = cv(512, 192);
  x.fillStyle = "#141512";
  x.fillRect(0, 0, 512, 192);
  let seed = 4411;
  const r = () => {
    seed = seed * 1664525 + 1013904223 >>> 0;
    return seed / 4294967296;
  };
  const gauge = (cx, cy, R) => {
    x.fillStyle = "#050505";
    x.beginPath();
    x.arc(cx, cy, R, 0, 7);
    x.fill();
    x.strokeStyle = "#5b5d58";
    x.lineWidth = 2;
    x.beginPath();
    x.arc(cx, cy, R, 0, 7);
    x.stroke();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    if (r() < 0.6) for (const [f0, f1, col] of [[0.1, 0.6, "#2f9a3a"], [0.6, 0.8, "#c9a12b"], [0.8, 0.86, "#b8281e"]]) {
      x.strokeStyle = col;
      x.lineWidth = 3;
      x.beginPath();
      x.arc(cx, cy, R * 0.8, a0 + (a1 - a0) * f0, a0 + (a1 - a0) * f1);
      x.stroke();
    }
    x.strokeStyle = "#d8d8d0";
    x.lineWidth = 1;
    for (let k = 0; k <= 12; k++) {
      const a = a0 + (a1 - a0) * k / 12, l = k % 3 ? 0.12 : 0.22;
      x.beginPath();
      x.moveTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9);
      x.lineTo(cx + Math.cos(a) * R * (0.9 - l), cy + Math.sin(a) * R * (0.9 - l));
      x.stroke();
    }
    const an = a0 + (a1 - a0) * (0.2 + r() * 0.6);
    x.strokeStyle = "#f2f2ea";
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(cx, cy);
    x.lineTo(cx + Math.cos(an) * R * 0.75, cy + Math.sin(an) * R * 0.75);
    x.stroke();
  };
  for (let row = 0; row < 2; row++) for (let k = 0; k < 7; k++) {
    if (k === 3) continue;
    gauge(58 + k * 66, 52 + row * 72, row ? 24 : 27);
  }
  x.save();
  x.beginPath();
  x.arc(256, 88, 40, 0, 7);
  x.clip();
  x.fillStyle = "#2d5b8c";
  x.fillRect(200, 30, 112, 58);
  x.fillStyle = "#5a3a1e";
  x.fillRect(200, 88, 112, 60);
  x.strokeStyle = "#eee";
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(216, 88);
  x.lineTo(296, 88);
  x.stroke();
  x.strokeStyle = "#e8b830";
  x.beginPath();
  x.moveTo(236, 92);
  x.lineTo(250, 92);
  x.lineTo(256, 98);
  x.lineTo(262, 92);
  x.lineTo(276, 92);
  x.stroke();
  x.restore();
  ["#c98a1e", "#3aa048", "#c98a1e", "#b3261c", "#c98a1e", "#3aa048", "#c98a1e", "#c98a1e"].forEach((col, k) => {
    x.fillStyle = r() < 0.35 ? col : "#262620";
    x.fillRect(24 + k * 58, 160, 46, 16);
    x.strokeStyle = "#444";
    x.strokeRect(24 + k * 58, 160, 46, 16);
  });
  for (let k = 0; k < 22; k++) {
    x.fillStyle = "#9a9a92";
    x.fillRect(20 + k * 21.5, 140, 3, 9);
  }
  return c;
}
function helicopter(x, y, z, rotY) {
  const G = new THREE.Group();
  if (!HELI_MAT.skin) {
    const m = heliSkinMaps(TS(2048));
    HELI_MAT.skin = new THREE.MeshStandardMaterial({
      map: T(m.albedo),
      normalMap: T(m.normal, 1, 1, false),
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: T(m.orm, 1, 1, false),
      metalnessMap: T(m.orm, 1, 1, false),
      roughness: 1,
      metalness: 1,
      envMapIntensity: 1
    });
    const pc = T(cockpitPanelTex());
    HELI_MAT.panel = new THREE.MeshStandardMaterial({ map: pc, emissiveMap: pc, emissive: 16777215, emissiveIntensity: 0.22, roughness: 0.6, metalness: 0.1 });
    HELI_MAT.glass = new THREE.MeshStandardMaterial({
      color: 9413803,
      roughness: 0.04,
      metalness: 0.1,
      envMapIntensity: 2.4,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    HELI_MAT.tint = new THREE.MeshStandardMaterial({
      color: 5209442,
      roughness: 0.05,
      metalness: 0.1,
      envMapIntensity: 2,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }
  const skin = HELI_MAT.skin, glassM = HELI_MAT.glass, tintM = HELI_MAT.tint;
  const interior = cmat(3948853, { roughness: 0.86, metalness: 0.08 }), cabinFloor = cmat(2895402, { roughness: 0.9, metalness: 0.25 });
  const rubber = M.rubber, metal = M.steel, black = cmat(1842459, { roughness: 0.62, metalness: 0.2 });
  const alu = cmat(10132632, { roughness: 0.38, metalness: 0.85 }), hot = cmat(3812904, { roughness: 0.45, metalness: 0.85, side: THREE.DoubleSide });
  const redFab = cmat(8006432, { roughness: 0.95 }), seatFab = cmat(5001280, { roughness: 0.95 }), yellow = cmat(13214247, { roughness: 0.55 });
  const add = (geo, mat, px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.rotation.set(rx, ry, rz);
    G.add(m);
    return m;
  };
  const box = (sx, sy, sz, mat, px, py, pz, rx = 0, ry = 0, rz = 0) => add(new THREE.BoxGeometry(sx, sy, sz), mat, px, py, pz, rx, ry, rz);
  const cyl = (r0, r1, h, mat, px, py, pz, rx = 0, ry = 0, rz = 0, seg = 12) => add(new THREE.CylinderGeometry(r0, r1, h, seg), mat, px, py, pz, rx, ry, rz);
  const tube = (pts, r, mat, seg = 20, rs = 7) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.min(seg, 24), r, rs), mat);
  const rod = (a, b, r, mat, seg = 6) => {
    const d = b.clone().sub(a), L = d.length(), g = new THREE.CylinderGeometry(r, r, L, seg);
    g.translate(0, L / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V$2(0, 1, 0), d.normalize()));
    g.translate(a.x, a.y, a.z);
    return add(g, mat);
  };
  const V2 = (a, b) => new THREE.Vector2(a, b);
  const onHull = (xx, th, off = 0) => heliPt(heliSecAt(xx), th, off);
  const cls = (i, th, q2) => {
    const s = heliSecAt(q2.x), up = q2.y - s.yc, az = Math.abs(q2.z), side = q2.z >= 0 ? 1 : -1;
    if (side < 0 && q2.x < 0.85 && q2.x > -0.75 && q2.y > 0.88 && q2.y < 2 && az > 0.5) return -1;
    if (q2.x > 2.5 && q2.x < 3.42 && up > -0.03) return side > 0 ? 10 : 11;
    if (q2.x > 1.35 && q2.x < 2.5 && up > 0.74 && az < 0.6) return side > 0 ? 14 : 15;
    if (q2.x > 1.35 && q2.x < 2.5 && q2.y > 1.14 && q2.y < 2.02 && az > 0.6) return side > 0 ? 12 : 13;
    if (q2.x > 2.5 && q2.x < 3.3 && up < -0.12 && up > -0.46 && az > 0.14) return side > 0 ? 16 : 17;
    if (q2.x < 0.45 && q2.x > -0.35 && q2.y > 1.5 && q2.y < 1.98 && az > 0.5) return side > 0 ? 18 : -1;
    return 0;
  };
  const hull = heliLoft(HELI_SECS, 60, cls, (c2) => c2 === 0 ? 0 : c2 < 0 ? -1 : c2 === 14 || c2 === 15 ? 2 : 1);
  add(hull.geo, [skin, glassM, tintM]).userData.nomerge = true;
  const iF = HELI_SECS.findIndex((s) => s.x === 3.42), iR = HELI_SECS.findIndex((s) => s.x === -1.55);
  add(heliLoft(HELI_SECS, 60, cls, (c2) => c2 === 0 ? 0 : -1, { grow: -0.035, inward: true, i0: iF, i1: iR, groups: 1 }).geo, interior);
  for (const [xs, face] of [[-1.55, 1], [3.42, -1]]) {
    const s = HELI_SECS.find((q2) => q2.x === xs), sh = new THREE.Shape(), p = new THREE.Vector3();
    for (let k = 0; k < 48; k++) {
      heliPt(s, -Math.PI / 2 + k / 48 * Math.PI * 2, -0.035, p);
      k ? sh.lineTo(-face * p.z, p.y) : sh.moveTo(-face * p.z, p.y);
    }
    const g = new THREE.ShapeGeometry(sh);
    g.rotateY(face * Math.PI / 2);
    g.translate(xs, 0, 0);
    add(g, interior);
  }
  const frames = heliFrames(hull, (a, b) => {
    if (a < 0 || b < 0) return { w: 0.07, t: 0.075, off: -0.018 };
    if (a >= 10 || b >= 10) return { w: 0.04, t: 0.06, off: -0.01 };
    return null;
  });
  if (frames) add(frames, black);
  const iD0 = HELI_SECS.findIndex((s) => s.x === 0.85), iD1 = HELI_SECS.findIndex((s) => s.x === -0.75), SLIDE = -1.05;
  const doorCls = (i, th, q2) => q2.z > 0 || q2.y < 0.88 || q2.y > 2 ? -1 : q2.x < 0.45 && q2.x > -0.35 && q2.y > 1.5 && q2.y < 1.98 ? 18 : 0;
  for (const [grow, inward] of [[0.03, false], [4e-3, true]]) {
    const L = heliLoft(HELI_SECS, 60, doorCls, (c2) => c2 < 0 ? -1 : c2 === 0 ? 0 : inward ? -1 : 1, { grow, inward, i0: iD0, i1: iD1, groups: 2 });
    L.geo.translate(SLIDE, 0, 0);
    add(L.geo, inward ? [interior, glassM] : [skin, glassM]).userData.nomerge = true;
    if (!inward) {
      const f = heliFrames(L, (a, b) => a < 0 !== b < 0 ? { w: 0.035, t: 0.042, off: -0.012 } : a >= 10 || b >= 10 ? { w: 0.035, t: 0.045, off: 0 } : null);
      if (f) {
        f.translate(SLIDE, 0, 0);
        add(f, black);
      }
    }
  }
  for (const s of [-1, 1]) {
    box(2.6, 0.035, 0.05, alu, -0.45, 2.05, s * 1.11);
    box(2.6, 0.035, 0.05, alu, -0.45, 0.9, s * 1.1);
    box(0.16, 0.03, 0.04, M.chrome, s > 0 ? 0.72 : 0.72 + SLIDE, 1.35, s * (s > 0 ? 1.19 : 1.225));
    box(0.12, 0.025, 0.035, M.chrome, 1.5, 1.45, s * 1.18);
    for (const yy of [1.6, 2.1]) box(0.14, 0.018, 0.035, M.chrome, -1, yy, s * (yy > 2 ? 1.04 : 1.16));
    add(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: s < 0 ? 9051158 : 2062902, emissive: s < 0 ? 10492948 : 2067002, emissiveIntensity: 1.6 }), -4.9, 1.99, s * 1.18);
    tube([V$2(-2, 0.08, s * 1.25), V$2(1.4, 0.08, s * 1.25), V$2(1.95, 0.14, s * 1.25), V$2(2.2, 0.34, s * 1.25)], 0.045, alu, 32);
    for (const xx of [-1.2, 0.2]) box(0.5, 0.012, 0.05, metal, xx, 0.036, s * 1.25);
    cyl(0.046, 0.046, 0.02, black, -2, 0.08, s * 1.25, 0, 0, Math.PI / 2);
    box(0.6, 0.03, 0.2, black, 0.9, 0.44, s * 1.2);
    for (const xx of [0.66, 1.14]) box(0.03, 0.1, 0.03, alu, xx, 0.38, s * 1.22);
    for (const xx of [1.15, -1.05]) box(0.18, 0.1, 0.22, black, xx, 0.72, s * 0.8);
    for (const xx of [-1.6, 1.3]) rod(V$2(xx, 0.1, s * 1.25), V$2(xx + (xx > 0 ? 0.35 : -0.35), 5e-3, s * 1.62), 0.012, yellow, 4);
  }
  for (const xx of [1.15, -1.05])
    tube([V$2(xx, 0.08, -1.25), V$2(xx, 0.55, -1.12), V$2(xx, 0.71, -0.72), V$2(xx, 0.74, 0), V$2(xx, 0.71, 0.72), V$2(xx, 0.55, 1.12), V$2(xx, 0.08, 1.25)], 0.05, alu, 32, 10);
  {
    const sh = new THREE.Shape([[-1.52, -0.88], [1.9, -0.86], [2.6, -0.66], [3.05, -0.42], [3.05, 0.42], [2.6, 0.66], [1.9, 0.86], [-1.52, 0.88]].map(([a, b]) => V2(a, b)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    g.translate(0, 0.79, 0);
    add(g, cabinFloor);
  }
  for (let k = 0; k < 6; k++) for (const zz of [-0.6, 0.6]) add(new THREE.TorusGeometry(0.025, 6e-3, 5, 10), metal, -1.2 + k * 0.45, 0.795, zz, Math.PI / 2);
  {
    const g = new THREE.PlaneGeometry(1.46, 0.5);
    g.rotateX(-0.24);
    g.rotateY(-Math.PI / 2);
    g.translate(2.62, 1.36, 0);
    add(g, HELI_MAT.panel);
  }
  box(0.14, 0.52, 1.5, black, 2.7, 1.35, 0, 0, 0, -0.24);
  box(0.34, 0.05, 1.56, black, 2.55, 1.63, 0, 0, 0, 0.1);
  box(0.9, 0.2, 0.3, black, 2.2, 0.95, 0, 0, 0, 0.35);
  {
    const g = new THREE.PlaneGeometry(0.72, 0.26);
    g.rotateX(-Math.PI / 2);
    g.rotateZ(0.35);
    g.translate(2.2, 1.056, 0);
    add(g, HELI_MAT.panel);
  }
  box(0.9, 1.62, 0.5, interior, -0.05, 1.6, 0);
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
    const xc = -0.28 + k * 0.46;
    box(0.42, 0.03, 0.4, redFab, xc, 1.2, s * 0.47);
    box(0.42, 0.55, 0.03, redFab, xc, 1.52, s * 0.27);
    rod(V$2(xc, 0.8, s * 0.62), V$2(xc, 1.2, s * 0.62), 0.012, alu);
  }
  const armor = cmat(4081202, { roughness: 0.7, metalness: 0.3 }), belt = cmat(5919288, { roughness: 0.95 });
  for (const s of [-1, 1]) {
    const zc = s * 0.5;
    box(0.5, 0.09, 0.5, seatFab, 1.78, 1.06, zc);
    box(0.09, 0.78, 0.5, seatFab, 1.49, 1.47, zc, 0, 0, 0.14);
    box(0.06, 0.2, 0.3, seatFab, 1.42, 1.98, zc, 0, 0, 0.14);
    for (const sz of [-1, 1]) box(0.55, 0.62, 0.035, armor, 1.62, 1.3, zc + sz * 0.27, 0, 0, 0.1);
    box(0.3, 0.26, 0.4, metal, 1.78, 0.92, zc);
    rod(V$2(2.08, 0.8, zc), V$2(2.02, 1.3, zc), 0.014, black);
    cyl(0.022, 0.02, 0.12, rubber, 2.02, 1.35, zc);
    rod(V$2(1.55, 0.9, zc - s * 0.3), V$2(1.95, 1.08, zc - s * 0.3), 0.016, black);
    for (const pz of [-0.12, 0.12]) box(0.04, 0.16, 0.08, alu, 2.88, 0.9, zc + pz, 0, 0, 0.5);
    for (const pz of [-0.12, 0.12]) box(0.012, 0.55, 0.045, belt, 1.555, 1.5, zc + pz, 0, 0, 0.14);
  }
  for (let k = 0; k < 4; k++) {
    const zc = -0.75 + k * 0.5;
    box(0.44, 0.03, 0.46, redFab, -1.22, 1.2, zc);
    box(0.03, 0.62, 0.46, redFab, -1.47, 1.55, zc);
  }
  rod(V$2(-1, 1.19, -1), V$2(-1, 1.19, 1), 0.016, alu);
  rod(V$2(-1.45, 1.86, -1), V$2(-1.45, 1.86, 1), 0.016, alu);
  for (const zz of [-1, -0.5, 0, 0.5, 1]) rod(V$2(-1, 0.8, zz), V$2(-1, 1.19, zz), 0.014, alu);
  box(0.3, 0.2, 0.12, cmat(5002294, { roughness: 0.9 }), -1.44, 2, 0.72);
  box(0.1, 0.1, 0.02, cmat(11872800, { roughness: 0.9 }), -1.37, 2, 0.72, 0, Math.PI / 2, 0);
  cyl(0.06, 0.06, 0.4, cmat(10692124, { roughness: 0.5, metalness: 0.2 }), -1.4, 1.02, -0.9);
  const COWL = [
    { x: 1.25, w: 0.04, ht: 0.04, hb: 0.04, yc: 2.46, sq: 2 },
    { x: 1.15, w: 0.34, ht: 0.18, hb: 0.12, yc: 2.48, sq: 2.4 },
    { x: 0.85, w: 0.5, ht: 0.3, hb: 0.14, yc: 2.52, sq: 2.8 },
    { x: -0.4, w: 0.54, ht: 0.34, hb: 0.14, yc: 2.55, sq: 3 },
    { x: -1.4, w: 0.52, ht: 0.33, hb: 0.16, yc: 2.56, sq: 3 },
    { x: -1.95, w: 0.44, ht: 0.29, hb: 0.14, yc: 2.57, sq: 2.7 },
    { x: -2.2, w: 0.3, ht: 0.2, hb: 0.14, yc: 2.58, sq: 2.4 },
    { x: -2.24, w: 0.02, ht: 0.02, hb: 0.02, yc: 2.58, sq: 2 }
  ];
  add(heliLoft(COWL, 40, null, null, { groups: 1, uv: (xx, th) => [(HELI_X0 - xx) / HELI_LEN, (Math.PI / 2 + (th - Math.PI / 2) * 0.32 + Math.PI / 2) / (Math.PI * 2)] }).geo, skin);
  for (const s of [-1, 1]) {
    add(roundedBox(0.62, 0.3, 0.1, 0.04, 2), black, -0.45, 2.62, s * 0.5);
    for (let k = 0; k < 7; k++) box(0.58, 0.012, 0.02, metal, -0.45, 2.5 + k * 0.04, s * 0.555);
  }
  add(new THREE.CylinderGeometry(0.19, 0.23, 0.55, 18, 1, true), hot, -2.32, 2.68, 0, 0, 0, Math.PI / 2 - 0.28);
  cyl(0.17, 0.17, 0.02, cmat(789258, { roughness: 1 }), -2.45, 2.72, 0, 0, 0, Math.PI / 2 - 0.28);
  {
    const bm = new THREE.MeshStandardMaterial({ color: 10099732, emissive: 16720916, emissiveIntensity: 0.6, roughness: 0.2 });
    const b = add(new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bm, -1.5, 2.9, 0);
    HELI_BEACONS.push({ mat: bm, mesh: b, p: new THREE.Vector3(), ph: HELI_BEACONS.length * 0.37 });
  }
  cyl(0.08, 0.09, 0.04, black, -1.5, 2.89, 0);
  {
    const pts = [];
    for (let xx = -2.3; xx >= -7.35; xx -= 0.42) {
      const s = heliSecAt(xx);
      pts.push(V$2(xx, s.yc + s.ht + 0.03, 0));
    }
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], d = b.clone().sub(a);
      add(roundedBox(d.length() + 0.02, 0.08, 0.13, 0.03, 2), skin, (a.x + b.x) / 2, (a.y + b.y) / 2, 0, 0, 0, Math.atan2(d.y, d.x) - Math.PI);
    }
    for (let k = 1; k < pts.length - 1; k += 2) add(roundedBox(0.12, 0.1, 0.17, 0.03, 2), black, pts[k].x, pts[k].y + 0.01, 0);
  }
  const naca = (xx, t) => t * 5 * (0.2969 * Math.sqrt(xx) - 0.126 * xx - 0.3516 * xx * xx + 0.2843 * xx ** 3 - 0.1015 * xx ** 4);
  const airfoil = (chord, t) => {
    const sh = new THREE.Shape(), N = 10;
    for (let k = 0; k <= N; k++) {
      const xx = (1 - Math.cos(k / N * Math.PI)) / 2;
      k ? sh.lineTo(xx * chord, naca(xx, t) * chord) : sh.moveTo(0, 0);
    }
    for (let k = N - 1; k >= 1; k--) {
      const xx = (1 - Math.cos(k / N * Math.PI)) / 2;
      sh.lineTo(xx * chord, -naca(xx, t) * chord);
    }
    sh.closePath();
    return sh;
  };
  {
    const g = new THREE.ExtrudeGeometry(airfoil(0.62, 0.12), { depth: 2.36, bevelEnabled: false });
    g.translate(-0.31, 0, -1.18);
    g.rotateY(Math.PI);
    add(g, skin, -4.9, 1.99, 0);
  }
  {
    const sh = new THREE.Shape([V2(-7.15, 0), V2(-8.2, 0), V2(-8.45, 1.3), V2(-7.95, 1.32)]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2 });
    g.translate(0, 2.1, -0.05);
    add(g, skin);
  }
  add(roundedBox(0.44, 0.24, 0.26, 0.08, 3), skin, -8.22, 3.4, 0);
  add(roundedBox(0.3, 0.22, 0.24, 0.07, 3), skin, -7.3, 2.42, 0);
  cyl(0.07, 0.07, 0.26, metal, -8.25, 3.4, -0.2, Math.PI / 2);
  cyl(0.1, 0.06, 0.12, black, -8.25, 3.4, -0.36, Math.PI / 2);
  for (let k = 0; k < 2; k++) {
    const g = new THREE.ExtrudeGeometry(airfoil(0.15, 0.1), { depth: 0.92, bevelEnabled: false });
    g.translate(-0.075, 0, 0.08);
    g.rotateX(-Math.PI / 2);
    const tg = new THREE.BoxGeometry(0.155, 0.12, 0.018);
    tg.translate(0, 0.93, 0);
    for (const [gg, mm] of [[g, black], [tg, cmat(14209728, { roughness: 0.6 })]]) {
      const b = add(gg, mm, -8.25, 3.4, -0.36);
      b.rotation.z = k * Math.PI + 0.7;
      b.rotateY(0.1);
    }
  }
  tube([V$2(-7.35, 1.98, 0), V$2(-7.75, 1.62, 0), V$2(-8.05, 1.52, 0), V$2(-8.25, 1.56, 0)], 0.025, alu, 12);
  add(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshStandardMaterial({ color: 14211280, emissive: 16774368, emissiveIntensity: 0.9 }), -8.14, 2.18, 0);
  const ROT = 7.2, bladeAng = 0.42;
  cyl(0.26, 0.34, 0.18, skin, 0.1, 2.92, 0, 0, 0, 0, 20);
  cyl(0.09, 0.11, 0.62, M.chrome, 0.1, 3.3, 0);
  cyl(0.27, 0.27, 0.04, alu, 0.1, 3.1, 0, 0, 0, 0, 24);
  cyl(0.24, 0.24, 0.04, black, 0.1, 3.15, 0, 0, 0, 0, 24);
  for (const s of [-1, 1]) {
    const bx = Math.cos(bladeAng) * s, bz = Math.sin(bladeAng) * s;
    rod(V$2(0.1 + bx * 0.22, 3.17, bz * 0.22), V$2(0.1 + bx * 0.34, 3.56, bz * 0.34 + 0.08), 0.012, alu);
    rod(V$2(0.1 - bz * 0.2, 3.17, bx * 0.2), V$2(0.1 - bz * 0.2, 3.68, bx * 0.2), 0.01, metal);
  }
  {
    const hub = add(roundedBox(0.84, 0.16, 0.3, 0.05, 2), metal, 0.1, 3.58, 0);
    hub.rotation.y = -bladeAng;
  }
  for (const s of [-1, 1]) box(0.3, 0.12, 0.2, alu, 0.1 + Math.cos(bladeAng) * s * 0.5, 3.58, Math.sin(bladeAng) * s * 0.5, 0, -bladeAng, 0);
  cyl(0.05, 0.05, 0.1, alu, 0.1, 3.7, 0);
  {
    const px = -Math.sin(bladeAng), pz = Math.cos(bladeAng);
    rod(V$2(0.1 - px * 0.95, 3.72, -pz * 0.95), V$2(0.1 + px * 0.95, 3.72, pz * 0.95), 0.022, metal);
    for (const s of [-1, 1]) {
      const w = add(new THREE.SphereGeometry(0.07, 10, 8), metal, 0.1 + px * s * 0.95, 3.72, pz * s * 0.95);
      w.scale.set(1.8, 0.7, 1);
      w.rotation.y = -bladeAng;
    }
  }
  const droop = (rr) => -0.011 * Math.pow(rr, 1.6);
  for (let i = 0; i < 2; i++) {
    const g = new THREE.ExtrudeGeometry(airfoil(0.53, 0.11), { depth: ROT - 0.4, bevelEnabled: false, steps: 9 });
    g.translate(-0.265, 0, 0);
    g.rotateY(Math.PI / 2);
    g.translate(0.4, 0, 0);
    const pa = g.attributes.position;
    for (let k = 0; k < pa.count; k++) pa.setY(k, pa.getY(k) + droop(pa.getX(k)));
    g.computeVertexNormals();
    const blade = new THREE.Group();
    blade.add(new THREE.Mesh(g, black));
    const tg = new THREE.ExtrudeGeometry(airfoil(0.535, 0.115), { depth: 0.32, bevelEnabled: false });
    tg.translate(-0.2675, 0, 0);
    tg.rotateY(Math.PI / 2);
    tg.translate(ROT - 0.34, droop(ROT - 0.2), 0);
    blade.add(new THREE.Mesh(tg, yellow));
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.22), alu);
    grip.position.x = 0.55;
    blade.add(grip);
    if (i === 1) {
      const sg = new THREE.ExtrudeGeometry(airfoil(0.6, 0.2), { depth: 1, bevelEnabled: false });
      sg.translate(-0.3, 0, 0);
      sg.rotateY(Math.PI / 2);
      sg.translate(ROT - 1.05, droop(ROT - 0.5) - 0.01, 0);
      blade.add(new THREE.Mesh(sg, cmat(7038024, { roughness: 0.96 })));
    }
    blade.position.set(0.1, 3.6, 0);
    blade.rotation.y = -(bladeAng + i * Math.PI);
    G.add(blade);
  }
  const tipW = V$2(0.1 - Math.cos(bladeAng) * 6.6, 3.6 + droop(6.6) - 0.02, -Math.sin(bladeAng) * 6.6);
  tube([tipW, V$2(tipW.x - 0.05, 2.8, tipW.z * 0.65), V$2(-6, 2.35, -0.3), V$2(-6.05, 2.08, -0.26)], 9e-3, cmat(12035190, { roughness: 0.9 }), 16, 5);
  const fin = (pts, px, py) => add(new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => V2(a, b))), { depth: 0.012, bevelEnabled: false }), black, px, py, -6e-3);
  fin([[0, 0], [0.22, 0], [0.08, 0.3], [0.02, 0.3]], 1.33, 2.4);
  fin([[0, 0], [0.2, 0], [0.06, 0.26], [0.01, 0.26]], -3.4, 2.34);
  rod(V$2(-1.9, 2.42, 0.3), V$2(-2.5, 3.5, 0.42), 6e-3, black, 4);
  rod(V$2(-2.35, 2.52, 0), V$2(-8.1, 3.5, 0), 3e-3, black, 3);
  for (const xx of [-4.1, -5.3]) {
    for (const zz of [-0.1, 0.1]) rod(V$2(xx, 1.74, zz), V$2(xx, 1.6, zz), 6e-3, black, 4);
    rod(V$2(xx, 1.6, -0.12), V$2(xx, 1.6, 0.12), 8e-3, black, 4);
  }
  rod(V$2(2.42, 2.18, 0), V$2(2.42, 2.36, 0), 0.012, metal);
  rod(V$2(2.42, 2.36, 0), V$2(2.92, 2.36, 0), 9e-3, metal);
  box(0.12, 0.03, 0.03, cmat(11740700, { roughness: 0.9 }), 2.9, 2.36, 0);
  {
    const t = add(new THREE.PlaneGeometry(0.05, 0.36), cmat(11019290, { roughness: 0.9, side: THREE.DoubleSide }), 2.9, 2.17, 0);
    t.rotation.z = 0.12;
  }
  const lens = new THREE.MeshStandardMaterial({ color: 13620436, roughness: 0.08, metalness: 0.2, emissive: 16773848, emissiveIntensity: 0.15 });
  for (const [xx, zz] of [[3.18, 0.24], [2.95, -0.28]]) {
    cyl(0.1, 0.12, 0.08, black, xx, 0.67, zz, 0, 0, 0.5);
    const g = new THREE.CircleGeometry(0.085, 16);
    g.rotateX(Math.PI / 2);
    g.rotateZ(0.5);
    g.translate(xx + 0.021, 0.633, zz);
    add(g, lens);
  }
  for (const s of [-1, 1]) rod(onHull(3.28, s > 0 ? 0.5 : Math.PI - 0.5, 0.012), onHull(3, s > 0 ? 0.95 : Math.PI - 0.95, 0.012), 8e-3, black, 4);
  const tag = cmat(11019290, { roughness: 0.9, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const t = add(new THREE.PlaneGeometry(0.05, 0.4), tag, -0.3, 2.36, s * 0.57);
    t.rotation.z = 0.15;
  }
  {
    const m = new THREE.MeshStandardMaterial({ color: 1315084, roughness: 0.25, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const g = new THREE.CircleGeometry(0.55, 20);
    g.scale(1.6, 1, 1);
    g.rotateX(-Math.PI / 2);
    add(g, m, -0.9, 4e-3, 0.1);
  }
  {
    const sx = -0.5, sz = 1.95;
    for (const [dx, dz] of [[-0.45, -0.3], [0.45, -0.3], [-0.45, 0.3], [0.45, 0.3]]) rod(V$2(sx + dx, 0, sz + dz), V$2(sx + dx * 0.9, 1.72, sz + dz * 0.9), 0.022, alu);
    box(1, 0.05, 0.6, cmat(8356735, { roughness: 0.5, metalness: 0.7 }), sx, 1.74, sz);
    for (let k = 1; k < 5; k++) box(0.9, 0.03, 0.14, alu, sx, k * 0.34, sz + 0.34);
    rod(V$2(sx - 0.45, 1.74, sz - 0.3), V$2(sx - 0.45, 2.7, sz - 0.3), 0.018, yellow);
    rod(V$2(sx + 0.45, 1.74, sz - 0.3), V$2(sx + 0.45, 2.7, sz - 0.3), 0.018, yellow);
    rod(V$2(sx - 0.45, 2.7, sz - 0.3), V$2(sx + 0.45, 2.7, sz - 0.3), 0.018, yellow);
  }
  G.position.set(x, y, z);
  G.rotation.y = rotY;
  G.updateMatrixWorld(true);
  for (const b of HELI_BEACONS) if (b.mesh) {
    b.mesh.getWorldPosition(b.p);
    b.p.y += 0.1;
    b.mesh = null;
  }
  G.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.material !== glassM && o.material !== tintM && !o.material.transparent;
      o.receiveShadow = true;
    }
  });
  scene.add(G);
  const q = new THREE.Quaternion().setFromAxisAngle(V$2(0, 1, 0), rotY);
  const W = (lx, ly, lz) => V$2(lx, ly, lz).applyQuaternion(q).add(V$2(x, y, z));
  let c = W(0.9, 1.35, 0);
  addOBB(c.x, c.y, c.z, 5.2, 1.6, 2.3, q, "metal");
  c = W(-0.5, 2.6, 0);
  addOBB(c.x, c.y, c.z, 3.2, 0.6, 1.1, q, "metal");
  c = W(-5.2, 2.05, 0);
  addOBB(c.x, c.y, c.z, 6, 0.5, 0.5, q, "metal");
  c = W(-7.8, 2.8, 0);
  addOBB(c.x, c.y, c.z, 1, 1.4, 0.2, q, "metal");
  c = W(-0.5, 0.88, 1.95);
  addOBB(c.x, c.y, c.z, 1, 1.76, 0.7, q, "metal");
  return G;
}
var _hescoGeo = /* @__PURE__ */ new Map();
function hescoSandGeo(cell, h) {
  const key = cell + "|" + h;
  if (_hescoGeo.has(key)) return _hescoGeo.get(key);
  const seg = Q.tex >= 1 ? 3 : 2;
  const g = roundedBox(cell - 0.04, h - 0.04, cell - 0.04, 0.1, seg);
  const pa = g.attributes.position, v = new THREE.Vector3(), nrm = new THREE.Vector3();
  const half = (cell - 0.04) / 2;
  for (let i = 0; i < pa.count; i++) {
    v.fromBufferAttribute(pa, i);
    nrm.set(v.x / half, 0, v.z / half);
    const side = Math.max(Math.abs(nrm.x), Math.abs(nrm.z));
    const belly = (1 - Math.pow(Math.abs(v.y) / (h / 2), 2)) * 0.035;
    const k = side > 0.98 ? belly : 0;
    const len = Math.hypot(nrm.x, nrm.z) || 1;
    pa.setXYZ(i, v.x + nrm.x / len * k, v.y - (v.y > h / 2 - 0.12 ? 0.03 : 0), v.z + nrm.z / len * k);
  }
  g.computeVertexNormals();
  _hescoGeo.set(key, g);
  return g;
}
function hesco(x, z, rotY, n = 3, h = 1.35, y = 0) {
  const cell = 1.05;
  const L = n * cell;
  const G = new THREE.Group();
  const sandGeo = hescoSandGeo(cell, h);
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * cell;
    const sand = new THREE.Mesh(sandGeo, M.hesco);
    sand.position.set(off, h / 2, 0);
    sand.scale.set(1, 1, 1);
    G.add(sand);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.sand);
    top.scale.set(1, 0.18, 1);
    top.position.set(off, h - 0.03, 0);
    G.add(top);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(cell, h, cell), M.hescoMesh);
    const uv = mesh.geometry.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 2.2, uv.getY(k) * 2.8);
    mesh.position.set(off, h / 2, 0);
    G.add(mesh);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, 0.03), M.steel);
      post.position.set(off + sx * cell / 2, h / 2, sz * cell / 2);
      G.add(post);
    }
  }
  G.position.set(x, y, z);
  G.rotation.y = rotY;
  shadowAll(G);
  scene.add(G);
  addAABB(x, y + h / 2, z, L, h, cell, rotY, "sand");
  return G;
}
var _bagGeos = null;
function sandbagGeos() {
  if (_bagGeos) return _bagGeos;
  _bagGeos = [];
  const seg = Q.tex >= 1 ? 3 : 2;
  for (let vi = 0; vi < 3; vi++) {
    const bag = roundedBox(0.6, 0.16, 0.34, 0.065, seg);
    const pa = bag.attributes.position, ph = vi * 1.7;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), z = pa.getZ(i), y = pa.getY(i);
      const k = 1 - Math.pow(Math.abs(x) / 0.3, 4) * 0.35;
      const wr = (Math.sin(x * 38 + ph) * Math.sin(z * 29 - ph) + Math.sin(x * 71 + z * 53 + ph * 2) * 0.5) * 6e-3 * (y > 0 ? 1 : 0.4);
      pa.setXYZ(
        i,
        x * (1 + Math.sin(ph + z * 9) * 0.02),
        y * k + (y > 0 ? wr - Math.max(0, 0.02 - Math.abs(z) * 0.1) * (1 - Math.abs(x) / 0.3) : 0),
        z * (1 - Math.pow(Math.abs(x) / 0.3, 6) * 0.25) + wr * 0.5
      );
    }
    bag.computeVertexNormals();
    _bagGeos.push(bag);
  }
  return _bagGeos;
}
function sandbagWall(x, z, rotY, len = 3, rows = 4, y = 0) {
  const G = new THREE.Group();
  const bags = sandbagGeos();
  const per = Math.max(2, Math.round(len / 0.58));
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < per - r % 2; i++) {
      const off = (i - (per - 1 - r % 2) / 2) * 0.58;
      for (const dz of [-0.17, 0.17]) {
        const m = new THREE.Mesh(bags[(r * 7 + i * 3 + (dz > 0 ? 1 : 0)) % bags.length], M.sandbag);
        m.position.set(off + rnd(-0.02, 0.02), 0.075 + r * 0.145, dz + rnd(-0.02, 0.02));
        m.rotation.y = rnd(-0.06, 0.06);
        m.rotation.z = rnd(-0.04, 0.04);
        G.add(m);
      }
    }
  }
  G.position.set(x, y, z);
  G.rotation.y = rotY;
  shadowAll(G);
  scene.add(G);
  addAABB(x, y + rows * 0.145 / 2, z, per * 0.58, rows * 0.145, 0.7, rotY, "sand");
  return G;
}
var plank = (G, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  uvBox(g, w, h, d, 1.1, true);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  G.add(m);
  return m;
};
function crate(x, y, z, rotY, s = 0.9) {
  const G = new THREE.Group();
  const mat = M.woodDark, n = 4, bw = s / n;
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      plank(G, mat, s, bw - 0.01, 0.022, 0, bw * (i + 0.5), side * (s / 2 - 0.011));
      plank(G, mat, 0.022, bw - 0.01, s - 0.044, side * (s / 2 - 0.011), bw * (i + 0.5), 0);
    }
  }
  for (let i = 0; i < n; i++) plank(G, mat, s - 0.044, 0.022, bw - 0.01, 0, s - 0.011, -s / 2 + bw * (i + 0.5));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) plank(G, M.wood, 0.05, s, 0.05, sx * (s / 2 - 0.035), s / 2, sz * (s / 2 - 0.035));
  for (const side of [-1, 1]) plank(G, M.wood, s * 1.3, 0.07, 0.024, 0, s / 2, side * (s / 2 + 0.012), 0, 0, Math.atan2(s * 0.9, s) * 0.9);
  G.position.set(x, y, z);
  G.rotation.y = rotY;
  shadowAll(G);
  scene.add(G);
  return registerProp(G, { hp: 130, mass: 25, col: { cx: x, cy: y + s / 2, cz: z, hx: s / 2, hy: s / 2, hz: s / 2, q: qY(rotY) } });
}
var qY = (r) => {
  const q = new THREE.Quaternion().setFromAxisAngle(V$2(0, 1, 0), r);
  return [q.x, q.y, q.z, q.w];
};
function palletStack(x, y, z, rotY, n = 5) {
  const G = new THREE.Group();
  for (let k = 0; k < n; k++) {
    const yy = k * 0.144 + rnd(-5e-3, 5e-3), ry = rnd(-0.05, 0.05);
    const P = new THREE.Group();
    P.position.y = yy;
    P.rotation.y = ry;
    for (let i = 0; i < 7; i++) plank(P, M.wood, 0.1, 0.022, 0.8, -0.55 + i * 0.183, 0.133, 0);
    for (const o of [-0.34, 0, 0.34]) plank(P, M.woodDark, 1.2, 0.09, 0.1, 0, 0.078, o);
    for (let i = 0; i < 3; i++) plank(P, M.wood, 0.1, 0.022, 0.8, -0.5 + i * 0.5, 0.011, 0);
    G.add(P);
  }
  G.position.set(x, y, z);
  G.rotation.y = rotY;
  shadowAll(G);
  scene.add(G);
  return registerProp(G, { hp: 160, mass: 18 * n, col: { cx: x, cy: y + n * 0.072, cz: z, hx: 0.6, hy: n * 0.072, hz: 0.42, q: qY(rotY) } });
}
function barricade(x, y, z, rotY, w = 2.4, h = 1.15) {
  const G = new THREE.Group();
  const panels = Math.max(1, Math.round(w / 1.2));
  for (let i = 0; i < panels; i++) {
    const off = (i - (panels - 1) / 2) * (w / panels);
    plank(G, M.plywood, w / panels - 0.02, h, 0.018, off, h / 2 + 0.05, 0, 0, 0, rnd(-0.015, 0.015));
  }
  for (const s of [-1, 1]) {
    plank(G, M.wood, 0.07, h + 0.1, 0.07, s * (w / 2 - 0.1), (h + 0.1) / 2, -0.05);
    plank(G, M.wood, 0.06, 0.06, 0.7, s * (w / 2 - 0.1), 0.35, -0.3, 0.9, 0, 0);
  }
  plank(G, M.wood, w, 0.08, 0.04, 0, h * 0.7, -0.05);
  G.position.set(x, y, z);
  G.rotation.y = rotY;
  shadowAll(G);
  scene.add(G);
  return registerProp(G, { hp: 180, mass: 40, col: { cx: x, cy: y + h / 2 + 0.05, cz: z, hx: w / 2, hy: h / 2 + 0.05, hz: 0.12, q: qY(rotY) } });
}
var _tgtTex = null;
var _tgtMat = null;
var _fuelSignMat = null;
function targetTex() {
  if (_tgtTex) return _tgtTex;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 400;
  const x = c.getContext("2d");
  x.fillStyle = "#b89a6a";
  x.fillRect(0, 0, 256, 400);
  for (let i = 0; i < 600; i++) {
    x.fillStyle = `rgba(${90 + Math.random() * 60 | 0},${70 + Math.random() * 40 | 0},${40 + Math.random() * 30 | 0},${Math.random() * 0.12})`;
    x.fillRect(Math.random() * 256, Math.random() * 400, 2 + Math.random() * 30, 1 + Math.random() * 3);
  }
  x.strokeStyle = "rgba(60,40,20,.55)";
  x.lineWidth = 3;
  x.beginPath();
  x.ellipse(128, 60, 40, 48, 0, 0, 7);
  x.stroke();
  x.strokeRect(78, 150, 100, 150);
  x.strokeRect(98, 170, 60, 70);
  x.beginPath();
  x.moveTo(20, 400);
  x.lineTo(20, 160);
  x.lineTo(60, 120);
  x.lineTo(196, 120);
  x.lineTo(236, 160);
  x.lineTo(236, 400);
  x.stroke();
  x.fillStyle = "rgba(60,40,20,.7)";
  x.font = "700 22px Arial";
  x.fillText("A", 120, 210);
  _tgtTex = new THREE.CanvasTexture(c);
  _tgtTex.colorSpace = THREE.SRGBColorSpace;
  return _tgtTex;
}
function target(x, y, z, rotY) {
  const G = new THREE.Group();
  const sh = new THREE.Shape();
  sh.moveTo(-0.23, 0);
  sh.lineTo(0.23, 0);
  sh.lineTo(0.23, 0.44);
  sh.lineTo(0.16, 0.52);
  sh.lineTo(0.07, 0.52);
  sh.lineTo(0.07, 0.6);
  sh.quadraticCurveTo(0.1, 0.74, 0, 0.76);
  sh.quadraticCurveTo(-0.1, 0.74, -0.07, 0.6);
  sh.lineTo(-0.07, 0.52);
  sh.lineTo(-0.16, 0.52);
  sh.lineTo(-0.23, 0.44);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false });
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + 0.23) / 0.46, uv.getY(i) / 0.76);
  if (!_tgtMat) _tgtMat = new THREE.MeshStandardMaterial({ map: targetTex(), roughness: 0.95 });
  const face = new THREE.Mesh(g, _tgtMat);
  face.position.set(0, 0.95, 0);
  G.add(face);
  for (const s of [-1, 1]) plank(G, M.wood, 0.035, 1.05, 0.02, s * 0.14, 0.52, -0.02, 0, 0, s * 0.03);
  plank(G, M.woodDark, 0.5, 0.05, 0.3, 0, 0.025, -0.02);
  G.position.set(x, y, z);
  G.rotation.y = rotY;
  shadowAll(G);
  scene.add(G);
  return registerProp(G, { hp: 90, mass: 4, target: true, col: { cx: x, cy: y + 1.1, cz: z, hx: 0.24, hy: 0.55, hz: 0.05, q: qY(rotY) } });
}
function table(x, y, z, rotY, flipped = false) {
  const G = new THREE.Group();
  if (!flipped) {
    plank(G, M.plywood, 1.8, 0.03, 0.8, 0, 0.76, 0);
    for (const s of [-1, 1]) {
      plank(G, M.wood, 0.06, 0.74, 0.06, s * 0.8, 0.37, 0.32);
      plank(G, M.wood, 0.06, 0.74, 0.06, s * 0.8, 0.37, -0.32);
      plank(G, M.wood, 0.05, 0.05, 0.7, s * 0.8, 0.2, 0);
    }
  } else {
    plank(G, M.plywood, 1.8, 0.8, 0.03, 0, 0.4, 0);
    for (const s of [-1, 1]) {
      plank(G, M.wood, 0.06, 0.06, 0.74, s * 0.8, 0.72, -0.37);
      plank(G, M.wood, 0.06, 0.06, 0.74, s * 0.8, 0.08, -0.37);
    }
  }
  G.position.set(x, y, z);
  G.rotation.y = rotY;
  shadowAll(G);
  scene.add(G);
  return registerProp(G, { hp: 110, mass: 22, col: { cx: x, cy: y + 0.4, cz: z, hx: 0.9, hy: 0.4, hz: flipped ? 0.05 : 0.4, q: qY(rotY) } });
}
function fuelBarrel(x, y, z, rotY = 0, col = 9251356) {
  const G = new THREE.Group();
  const mat = cmat(col, { roughness: 0.55, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 20), mat);
  body.position.y = 0.44;
  G.add(body);
  for (const yy of [0.22, 0.44, 0.66]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.018, 6, 20), mat);
    r.rotation.x = Math.PI / 2;
    r.position.y = yy;
    G.add(r);
  }
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 20), M.dark);
  lid.position.y = 0.885;
  G.add(lid);
  if (!_fuelSignMat) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const xx = c.getContext("2d");
    xx.fillStyle = "#d8b030";
    xx.beginPath();
    xx.moveTo(32, 4);
    xx.lineTo(60, 56);
    xx.lineTo(4, 56);
    xx.closePath();
    xx.fill();
    xx.fillStyle = "#111";
    xx.font = "700 30px Arial";
    xx.textAlign = "center";
    xx.fillText("!", 32, 50);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    _fuelSignMat = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7 });
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), _fuelSignMat);
  sign.position.set(0, 0.5, 0.295);
  G.add(sign);
  G.position.set(x, y, z);
  G.rotation.y = rotY;
  shadowAll(G);
  scene.add(G);
  return registerProp(G, {
    hp: 120,
    mass: 60,
    wood: false,
    surf: "metal",
    explosive: true,
    burnHp: 1.6,
    col: { cx: x, cy: y + 0.44, cz: z, hx: 0.3, hy: 0.44, hz: 0.3, q: null }
  });
}
function dynBarrel(x, y, z, col = 5134918, tipped = false) {
  const mat = cmat(col, { roughness: 0.6, metalness: 0.35 });
  const parts = [new THREE.CylinderGeometry(0.29, 0.29, 0.88, 18)];
  for (const yy of [-0.22, 0, 0.22]) {
    const r = new THREE.TorusGeometry(0.295, 0.018, 5, 18);
    r.rotateX(Math.PI / 2);
    r.translate(0, yy, 0);
    parts.push(r);
  }
  const g = mergeParts(parts);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  m.position.set(x, y + (tipped ? 0.3 : 0.44), z);
  if (tipped) {
    m.rotation.z = Math.PI / 2;
    m.rotation.y = rnd(0, 6.28);
  }
  m.userData.nomerge = true;
  scene.add(m);
  DYN_PROPS.push({ mesh: m, shape: "cyl", size: [0.58, 0.88, 0.58], mass: 22, surf: "metal", friction: 0.6, restitution: 0.2 });
}
function dynCone(x, y, z) {
  const parts = [new THREE.ConeGeometry(0.17, 0.55, 14)];
  parts[0].translate(0, 0.3, 0);
  const b = new THREE.BoxGeometry(0.34, 0.035, 0.34);
  b.translate(0, 0.018, 0);
  parts.push(b);
  const g = mergeParts(parts);
  g.translate(0, -0.28, 0);
  const m = new THREE.Mesh(g, M.plastO);
  m.castShadow = true;
  m.position.set(x, y + 0.28, z);
  m.userData.nomerge = true;
  scene.add(m);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.125, 0.08, 14), cmat(15262936, { roughness: 0.5 }));
  band.position.y = 0.05;
  m.add(band);
  DYN_PROPS.push({ mesh: m, shape: "box", size: [0.3, 0.56, 0.3], mass: 2, surf: "sand", friction: 0.8 });
}
function dynTire(x, y, z) {
  const g = new THREE.TorusGeometry(0.36, 0.135, 9, 18);
  const m = new THREE.Mesh(g, M.rubber);
  m.castShadow = true;
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y + 0.14, z);
  m.userData.nomerge = true;
  scene.add(m);
  DYN_PROPS.push({ mesh: m, shape: "box", size: [0.98, 0.98, 0.27], mass: 9, surf: "sand", friction: 0.9, restitution: 0.35 });
}
function dynBox(x, y, z, rotY, s = [0.5, 0.35, 0.4], mat) {
  const g = new THREE.BoxGeometry(...s);
  uvBox(g, s[0], s[1], s[2], 1.2);
  const m = new THREE.Mesh(g, mat || M.foam);
  m.castShadow = m.receiveShadow = true;
  m.position.set(x, y + s[1] / 2, z);
  m.rotation.y = rotY;
  m.userData.nomerge = true;
  scene.add(m);
  DYN_PROPS.push({ mesh: m, shape: "box", size: s, mass: s[0] * s[1] * s[2] * 300, surf: "wood" });
}
function mergeParts(parts) {
  for (const p of parts) {
    for (const k of Object.keys(p.attributes)) if (!["position", "normal", "uv"].includes(k)) p.deleteAttribute(k);
  }
  const idx = parts.every((p) => p.index);
  return BGU.mergeGeometries(idx ? parts : parts.map((p) => p.index ? p.toNonIndexed() : p), false);
}
var sym = (fn, x, z, rotY = 0, ...rest) => {
  fn(x, z, rotY, ...rest);
  fn(-x, -z, rotY + Math.PI, ...rest);
};
var TEAMS = {
  ALPHA: {
    name: "ALPHA",
    color: "#d7dde4",
    accent: 12571886,
    side: -1,
    flag: { x: -31.2, z: -2.3 },
    spawns: [{ id: "A1", name: "Бункер", x: -35.4, z: 0 }, { id: "A2", name: "Север", x: -34.2, z: -14.5 }, { id: "A3", name: "Юг", x: -34.2, z: 14.5 }]
  },
  DELTA: {
    name: "DELTA",
    color: "#a9cf86",
    accent: 12116108,
    side: 1,
    flag: { x: 31.2, z: 2.3 },
    spawns: [{ id: "D1", name: "Бункер", x: 35.4, z: 0 }, { id: "D2", name: "Север", x: 34.2, z: -14.5 }, { id: "D3", name: "Юг", x: 34.2, z: 14.5 }]
  }
};
var GATES = [];
var TEAM_SPOTS = [];
var BASE_LIGHTS = [];
var _contMats = {};
function container(x, z, rotY, col = 5992314, y = 0) {
  let mat = _contMats[col];
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      map: M.corr.map,
      normalMap: M.corr.normalMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      color: new THREE.Color(col).multiplyScalar(4.2),
      roughness: 0.78,
      metalness: 0.15,
      envMapIntensity: 0.7
    });
    _contMats[col] = mat;
  }
  const L = 6.06, W = 2.44, H = 2.59;
  const G = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(L - 0.1, H - 0.12, W - 0.08), mat);
  const uv = body.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 1.3);
  body.position.y = H / 2;
  G.add(body);
  const frame2 = cmat(4869455, { roughness: 0.7, metalness: 0.4 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, H, 0.16), frame2);
    post.position.set(sx * (L / 2 - 0.08), H / 2, sz * (W / 2 - 0.08));
    G.add(post);
    const cast = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.18), frame2);
    cast.position.set(sx * (L / 2 - 0.08), H - 0.06, sz * (W / 2 - 0.08));
    G.add(cast);
  }
  for (const yy of [0.08, H - 0.08]) for (const sz of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(L, 0.14, 0.12), frame2);
    r.position.set(0, yy, sz * (W / 2 - 0.06));
    G.add(r);
  }
  for (const sz of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.05, H - 0.3, W / 2 - 0.1), mat);
    d.position.set(L / 2 - 0.02, H / 2, sz * W / 4);
    G.add(d);
    for (const o of [-0.35, 0.35]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, H - 0.2, 6), M.steel);
      bar.position.set(L / 2 + 0.03, H / 2, sz * W / 4 + o * 0.6);
      G.add(bar);
    }
  }
  G.position.set(x, y, z);
  G.rotation.y = rotY;
  G.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(G);
  addAABB(x, y + H / 2, z, L, H, W, rotY, "metal");
}
function fuelTank(x, z, rotY) {
  const G = new THREE.Group();
  const mat = cmat(7236182, { roughness: 0.55, metalness: 0.45 });
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 4.6, 24), mat);
  tank.rotation.z = Math.PI / 2;
  tank.position.y = 1.35;
  G.add(tank);
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), mat);
    cap.scale.set(0.3, 1, 1);
    cap.position.set(s * 2.3, 1.35, 0);
    G.add(cap);
    const sad = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 1.8), M.panel);
    sad.position.set(s * 1.4, 0.28, 0);
    G.add(sad);
  }
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.15, 14), M.dark);
  hatch.position.set(0.6, 2.4, 0);
  G.add(hatch);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), M.steel);
  pipe.position.set(-1.4, 0.7, 0.9);
  G.add(pipe);
  G.position.set(x, 0, z);
  G.rotation.y = rotY;
  G.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = true;
    }
  });
  scene.add(G);
  addAABB(x, 1.2, z, 5.2, 2.4, 2, rotY, "metal");
}
function floorMark(tex, x, z, w, h, rotY, opacity = 0.8) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    roughness: 0.9
  }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = rotY;
  m.position.set(x, 0.012, z);
  m.receiveShadow = true;
  m.userData.nomerge = true;
  scene.add(m);
}
function emblemFloorTex(team) {
  const [c, x] = cv(512, 512);
  x.clearRect(0, 0, 512, 512);
  const col = team === "ALPHA" ? "rgba(220,226,232,0.85)" : "rgba(160,200,120,0.85)";
  const img = new Image();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  img.onload = () => {
    x.globalAlpha = 0.9;
    x.drawImage(img, 56, 20, 400, 400);
    x.globalAlpha = 1;
    x.fillStyle = col;
    x.font = '700 64px "Segoe UI",Arial';
    x.textAlign = "center";
    x.fillText(team, 256, 490);
    x.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 500; i++) {
      x.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`;
      x.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 40, 1 + Math.random() * 4);
    }
    x.globalCompositeOperation = "source-over";
    t.needsUpdate = true;
  };
  img.src = emblemDataURL(team, 256);
  return t;
}
function stripeTex(col) {
  const [c, x] = cv(256, 32);
  x.fillStyle = col;
  x.fillRect(0, 0, 256, 32);
  x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 120; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.6})`;
    x.fillRect(Math.random() * 256, Math.random() * 32, 2 + Math.random() * 14, 1 + Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
function base(teamKey) {
  const T2 = TEAMS[teamKey], s = T2.side;
  const bx = s * 35.4;
  addBox("conc", bx, 0.04, 0, 6.4, 0.08, 8.6, { d: 0.4, collide: false });
  addOBB(bx, 0.04, 0, 6.4, 0.08, 8.6, null, "conc");
  for (const px of [bx - 2.9, bx + 2.9]) for (const pz of [-4, 4]) {
    addBox("steel", px, 1.45, pz, 0.14, 2.9, 0.14, { d: 1.1 });
  }
  for (const pz of [-4, 4]) addBox("steel", bx, 2.95, pz, 6.1, 0.18, 0.12, { collide: false, d: 1 });
  for (const px of [bx - 2.9, bx, bx + 2.9]) addBox("steel", px, 3, 0, 0.12, 0.16, 8.3, { collide: false, d: 1 });
  addBox("roof", bx, 3.12, 0, 6.8, 0.05, 9, { collide: false, d: 0.5 });
  addOBB(bx, 3.12, 0, 6.8, 0.1, 9, null, "metal");
  hesco(bx, -4.7, 0, 5, 1.6);
  hesco(bx, 4.7, 0, 5, 1.6);
  sandbagWall(bx - s * 3.6, 0, Math.PI / 2, 2.4, 6);
  const lampMat = new THREE.MeshStandardMaterial({ color: 2236962, emissive: T2.accent, emissiveIntensity: 1.1 });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.16), lampMat);
  lamp.position.set(bx, 2.88, 0);
  lamp.userData.nomerge = true;
  scene.add(lamp);
  BASE_LIGHTS.push({ p: new THREE.Vector3(bx, 2.6, 0), color: T2.accent });
  const fx = T2.flag.x, fz = T2.flag.z;
  addBox("conc", fx, 0.15, fz, 1.2, 0.3, 1.2, { d: 0.6 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 8, 12), M.chrome);
  pole.position.set(fx, 4.3, fz);
  pole.castShadow = true;
  scene.add(pole);
  addOBB(fx, 4.3, fz, 0.14, 8, 0.14, null, "metal");
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), cmat(12099680, { metalness: 0.8, roughness: 0.3 }));
  finial.position.set(fx, 8.36, fz);
  scene.add(finial);
  const hal = new THREE.Mesh(new THREE.CylinderGeometry(6e-3, 6e-3, 7.6, 4), M.cable);
  hal.position.set(fx + 0.07 * s * -1, 4.3, fz + 0.05);
  scene.add(hal);
  floorMark(emblemFloorTex(teamKey), s * 28.4, 0, 4.4, 4.4, s < 0 ? -Math.PI / 2 : Math.PI / 2, 0.75);
  const st = stripeTex(teamKey === "ALPHA" ? "#d9dee4" : "#9cc27a");
  st.repeat.set(10, 1);
  floorMark(st, s * 25.9, 0, 0.22, 22, 0, 0.85);
  const sp = new THREE.SpotLight(T2.accent, 0, 40, 0.7, 0.6, 1.2);
  sp.position.set(s * 38.5, 8.5, 0);
  sp.target.position.set(s * 30, 0, 0);
  SPOT_SRC.push(sp);
  TEAM_SPOTS.push(sp);
  ammoBox(bx + s * 1.9, 0.08, 0, Math.PI / 2);
  dynBox(bx + s * 1.8, 0.08, -3.3, 0.1, [0.7, 0.35, 0.4], M.teamD);
  dynBox(bx + s * 1.8, 0.08, 3.3, -0.1, [0.7, 0.35, 0.4], M.teamD);
}
function hangarGate(sx) {
  const x = sx * (HW - 0.3);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 6.6), new THREE.MeshBasicMaterial({ color: 16777215, map: outsideTex(), fog: false }));
  outside.position.set(sx * (HW + 0.25), 3.3, 1.2);
  outside.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
  outside.userData.nomerge = true;
  scene.add(outside);
  for (const [z0, z1] of [[-6.2, 0.4], [2, 6.2]]) {
    const zc = (z0 + z1) / 2, w = z1 - z0;
    addBox("corr", x + sx * 0.05, 3.4, zc, 0.12, 6.8, w, { d: 0.45, surf: "metal" });
    for (let i = 0; i < 4; i++) addBox("steel", x - sx * 0.03, 0.8 + i * 1.8, zc, 0.08, 0.12, w, { collide: false, d: 1 });
  }
  addBox("steel", x - sx * 0.05, 7, 0, 0.3, 0.35, 13, { collide: false, d: 1 });
  for (const z of [-6.4, 6.4]) addBox("steel", x - sx * 0.05, 3.5, z, 0.3, 7, 0.3, { d: 1 });
  const beam = new THREE.SpotLight(16773336, 30, 30, 0.22, 0.7, 1.1);
  beam.position.set(sx * (HW + 2), 4.5, 1.2);
  beam.target.position.set(sx * (HW - 12), 0, 1.2);
  SPOT_SRC.push(beam);
  GATES.push({ plane: outside, beam });
  addOBB(sx * (HW - 0.1), 3.3, 1.2, 0.3, 6.6, 1.6, null, "metal", { playerOnly: true });
  addOBB(sx * (HW + 1), 3, 1.2, 0.3, 6, 2.4, null, "metal", { noPlayer: true });
}
function overheadCrane() {
  const yR = EAVE - 1.15, zR = HD - 1.1, xB = 13.5;
  for (const s of [-1, 1]) {
    addBox("steel", 0, yR, s * zR, HW * 2 - 1.2, 0.36, 0.2, { collide: false, d: 1 });
    addBox("steel", 0, yR + 0.2, s * zR, HW * 2 - 1.2, 0.05, 0.08, { collide: false, d: 1 });
    for (let x = -HW + 3.75; x < HW - 1; x += COL_STEP) addBox("steel", x, yR - 0.35, s * (zR + 0.25), 0.18, 0.5, 0.5, { collide: false, d: 1 });
  }
  for (const dx of [-0.45, 0.45]) addBox("hazard", xB + dx, yR + 0.55, 0, 0.32, 0.62, zR * 2, { collide: false, d: 0.6 });
  for (const s of [-1, 1]) addBox("steel", xB, yR + 0.42, s * zR, 1.6, 0.34, 0.5, { collide: false, d: 1 });
  const hz = -4.2;
  addBox("steel", xB, yR + 0.1, hz, 0.8, 0.5, 0.7, { collide: false, d: 1 });
  addBox("darker", xB, yR - 0.25, hz, 0.4, 0.3, 0.4, { collide: false, d: 1 });
  const chainLen = 3.6, links = Math.round(chainLen / 0.09);
  for (let i = 0; i < links; i++) addBox("darker", xB, yR - 0.45 - i * 0.09, hz, i % 2 ? 0.012 : 0.04, 0.085, i % 2 ? 0.04 : 0.012, { collide: false, d: 4 });
  const hy = yR - 0.45 - chainLen;
  addBox("hazard", xB, hy - 0.1, hz, 0.22, 0.24, 0.12, { collide: false, d: 1.5 });
  const hook = new THREE.TorusGeometry(0.09, 0.025, 6, 12, Math.PI * 1.4);
  hook.rotateZ(-Math.PI * 0.2);
  hook.translate(xB, hy - 0.32, hz);
  bucket("darker").push(hook);
}
function cableTrays() {
  const y = WALL_H - 0.55;
  for (const s of [-1, 1]) {
    const z = s * (HD - 0.45);
    addBox("steel", 0, y, z, HW * 2 - 2, 0.03, 0.34, { collide: false, d: 1 });
    for (const e of [-1, 1]) addBox("steel", 0, y + 0.05, z + e * 0.17, HW * 2 - 2, 0.1, 0.012, { collide: false, d: 1 });
    for (let i = 0; i < 3; i++) addBox("cable", 0, y + 0.03 + i * 0.018, z - 0.06 + i * 0.06, HW * 2 - 2.2, 0.03, 0.03, { collide: false, d: 1 });
    for (let x = -HW + 2; x < HW - 1; x += 2.5) addBox("steel", x, y + 0.18, z + s * 0.2, 0.04, 0.36, 0.04, { collide: false, d: 1 });
    for (const x of [-26.25, -3.75, 18.75]) {
      addBox("steel", x, (y + 1.4) / 2, z + s * 0.12, 0.12, y - 1.4, 0.06, { collide: false, d: 1 });
      addBox("panel", x, 1.25, z + s * 0.05, 0.6, 0.8, 0.22, { collide: false, d: 1.2 });
      addBox("hazard", x, 1.25, z - s * 0.07, 0.12, 0.12, 0.012, { collide: false, d: 3 });
    }
  }
}
function roomLabels() {
  const labels = [];
  let n1 = 0, n2 = 0;
  for (const d of DOORS) {
    const fl = d.y > 1 ? 2 : 1, id = fl === 1 ? ++n1 : ++n2;
    labels.push({ d, text: `${fl}-${String(id).padStart(2, "0")}` });
  }
  if (!labels.length) return;
  const C = 8, W = 128, H = 64, R = Math.ceil(labels.length / C);
  const [c, x] = cv(C * W, R * H);
  x.clearRect(0, 0, C * W, R * H);
  labels.forEach((L, i) => {
    const ox = i % C * W, oy = Math.floor(i / C) * H;
    x.save();
    x.translate(ox + W / 2, oy + H / 2);
    x.rotate((rnd2() - 0.5) * 0.05);
    x.font = '700 38px "Arial Narrow",Arial,sans-serif';
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillStyle = "rgba(28,26,24,.88)";
    x.fillText(L.text, 0, 0);
    for (let k = 0; k < 4; k++) {
      x.fillRect(-40 + rnd2() * 80, 10, 1.5, 6 + rnd2() * 16);
    }
    x.restore();
  });
  x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < labels.length * 6; i++) {
    x.fillStyle = "rgba(0,0,0,.9)";
    x.fillRect(rnd2() * C * W, rnd2() * R * H, 2, 6);
  }
  x.globalCompositeOperation = "source-over";
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = MAXA();
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    roughness: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });
  const parts = [];
  labels.forEach((L, i) => {
    const u0 = i % C / C, v1 = 1 - Math.floor(i / C) / R, u1 = u0 + 1 / C, v0 = v1 - 1 / R;
    for (const side of [-1, 1]) {
      const g = new THREE.PlaneGeometry(0.34, 0.17);
      const uv = g.attributes.uv;
      uv.setXY(0, u0, v1);
      uv.setXY(1, u1, v1);
      uv.setXY(2, u0, v0);
      uv.setXY(3, u1, v0);
      const nx = Math.cos(L.d.ang), nz = -Math.sin(L.d.ang);
      const off = (TH / 2 + SHEET + 4e-3) * side;
      g.rotateY(Math.atan2(nx * side, nz * side));
      g.translate(L.d.x + nx * off, L.d.y + DOOR_H + 0.3, L.d.z + nz * off);
      parts.push(g);
    }
  });
  const m = new THREE.Mesh(BGU.mergeGeometries(parts, false), mat);
  m.userData.nomerge = true;
  m.receiveShadow = true;
  m.renderOrder = 2;
  scene.add(m);
}
var _outsideTex = null;
function outsideTex() {
  if (_outsideTex) return _outsideTex;
  const W = 256, H = 1024, [c, x] = cv(W, H);
  const sky = x.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, "#cfe0f2");
  sky.addColorStop(1, "#f4f1ea");
  x.fillStyle = sky;
  x.fillRect(0, 0, W, H * 0.62);
  x.fillStyle = "#6f7c64";
  x.beginPath();
  x.moveTo(0, H * 0.62);
  for (let i = 0; i <= 32; i++) x.lineTo(i * W / 32, H * 0.56 - Math.abs(Math.sin(i * 1.7)) * H * 0.03 - rnd2() * H * 0.02);
  x.lineTo(W, H * 0.62);
  x.fill();
  const gr = x.createLinearGradient(0, H * 0.62, 0, H);
  gr.addColorStop(0, "#a8a49c");
  gr.addColorStop(1, "#6c6962");
  x.fillStyle = gr;
  x.fillRect(0, H * 0.62, W, H * 0.38);
  x.fillStyle = "rgba(230,220,170,.7)";
  x.fillRect(W * 0.62, H * 0.64, 6, H * 0.36);
  x.strokeStyle = "rgba(70,74,70,.55)";
  x.lineWidth = 1;
  for (let i = 0; i < W; i += 6) {
    x.beginPath();
    x.moveTo(i, H * 0.5);
    x.lineTo(i + 12, H * 0.62);
    x.stroke();
    x.beginPath();
    x.moveTo(i + 12, H * 0.5);
    x.lineTo(i, H * 0.62);
    x.stroke();
  }
  x.fillStyle = "#4b4f4a";
  for (let i = 0; i < W; i += 64) x.fillRect(i, H * 0.48, 3, H * 0.14);
  grain(x, W, H, 0.03);
  _outsideTex = new THREE.CanvasTexture(c);
  _outsideTex.colorSpace = THREE.SRGBColorSpace;
  return _outsideTex;
}
function buildLayout() {
  setHeliHook((x, y, z, r) => helicopter(x, y, z, r));
  base("ALPHA");
  base("DELTA");
  hangarGate(-1);
  hangarGate(1);
  sym((x, z, r) => container(x, z, r, 5992314), -34, -18.2, 0);
  sym((x, z, r) => hesco(x, z, r, 2, 1.45), -30.4, -14.5, Math.PI / 2);
  sym((x, z, r) => cabin(x, 0, z, r, 2.4, 5.2, 2.5, 7436908), -34.2, 18.3, 0);
  sym((x, z, r) => hesco(x, z, r, 2, 1.45), -30.4, 14.5, Math.PI / 2);
  sym((x, z, r) => crate(x, 0, z, r, 0.9), -36.6, -12.2, 0.2);
  sym((x, z, r) => crate(x, 0, z, r, 0.8), -36.4, 12.4, -0.3);
  sym((x, z, r) => hesco(x, z, r, 3, 1.35), -27.4, -7, Math.PI / 2);
  sym((x, z, r) => hesco(x, z, r, 3, 1.35), -27.4, 7, Math.PI / 2);
  sym((x, z, r) => sandbagWall(x, z, r, 2.4, 5), -24.6, 0, Math.PI / 2);
  sym((x, z, r) => hesco(x, z, r, 2, 2), -27.2, 0, 0);
  sym((x, z, r) => hesco(x, z, r, 1, 2), -18.3, 0.2, 0);
  sym((x, z, r) => jerseyBarrier(x, 0, z, r), -22.5, -4.2, Math.PI / 2 + 0.1);
  sym((x, z, r) => jerseyBarrier(x, 0, z, r), -22.8, 4, Math.PI / 2 - 0.1);
  sym((x, z, r) => fuelTank(x, z, r), -33.5, -26.2, 0);
  for (const [bx, bz] of [[-29, -27.4], [-28.4, -26.8], [-29.5, -26.6], [-27.6, -27.6], [-26.2, -27.5]]) {
    fuelBarrel(bx, 0, bz, rnd(0, 6));
    fuelBarrel(-bx, 0, -bz, rnd(0, 6));
  }
  sym((x, z, r) => sandbagWall(x, z, r, 3, 4), -27.2, -24.6, 0);
  sym((x, z, r) => palletStack(x, 0, z, r, 4), -24.2, -27.6, 0.2);
  sym((x, z, r) => container(x, z, r, 8018498), -21.5, -16.4, 0.15);
  sym((x, z, r) => container(x, z, r, 5201738, 2.59), -21.3, -16.6, 0.18);
  sym((x, z, r) => container(x, z, r, 7173240), -21.8, -23.5, -0.1);
  sym((x, z, r) => carWreck(x, 0, z, r), -14.8, -22.8, 0.5);
  sym((x, z, r) => blockWall(x, z, r, 6, 2), -13.5, -14.6, 0.08);
  sym((x, z, r) => hesco(x, z, r, 3, 2), -19.6, -11.6, Math.PI / 2);
  sym((x, z, r) => crate(x, 0, z, r, 1), -10.6, -12.9, 0.3);
  sym((x, z, r) => crate(x, 0, z, r, 0.8), -10, -12, -0.2);
  sym((x, z, r) => pipeStack(x, 0, z, r, 3), -2.5, -25.8, Math.PI / 2);
  sym((x, z, r) => container(x, z, r, 7031354), 4.4, -12.64, Math.PI / 2);
  sym((x, z, r) => container(x, z, r, 5596238), 4.4, -18.7, Math.PI / 2);
  sym((x, z, r) => container(x, z, r, 5003878), 8.6, -26.55, Math.PI / 2);
  sym((x, z, r) => container(x, z, r, 8022600), 8.6, -20.45, Math.PI / 2);
  sym((x, z, r) => barricade(x, 0, z, r, 2.4), 10.2, -13, -0.12);
  sym((x, z, r) => palletStack(x, 0, z, r, 5), 16.2, -12.8, 0.3);
  sym((x, z, r) => pickup(x, 0, z, r, M.carSand), -8.5, -27, 0.08);
  sym((x, z, r) => van(x, 0, z, r, M.carWhite), 1, -22.5, Math.PI / 2 - 0.05);
  sym((x, z, r) => hesco(x, z, r, 2, 1.35), 0.5, -13.3, 0);
  helipad(-21, 20.6);
  helipad(21, -20.6);
  sym((x, z, r) => barricade(x, 0, z, r, 2.4), -17.6, 3, 0.05);
  sym((x, z, r) => crate(x, 0, z, r, 0.9), -16.4, -4.4, 0.1);
  sym((x, z, r) => hesco(x, z, r, 2, 2), -17.2, -3.2, 0);
  sym((x, z, r) => table(x, 0, z, r, true), -18.4, 8.4, 0);
  sym((x, z, r) => hesco(x, z, r, 2, 2), -17, -14, 0);
  sym((x, z, r) => hesco(x, z, r, 2, 2), -17, 14, 0);
  sym((x, z, r) => container(x, z, r, 5992314), -28, -11.5, 0);
  sym((x, z, r) => container(x, z, r, 7166792), -25.5, 11.5, 0);
  sym((x, z, r) => hesco(x, z, r, 1, 2), -39.2, -9.5, 0);
  sym((x, z, r) => hesco(x, z, r, 1, 2), -39.2, 9.5, 0);
  sym((x, z, r) => container(x, z, r, 4805452), -17.5, -28.3, 0);
  const dyn = [
    () => dynBarrel(-24.4, 0, -14.2),
    () => dynBarrel(-24.9, 0, -14.8, 3822704),
    () => dynBarrel(-12.2, 0, -18.5, 9079686, true),
    () => dynCone(-16.4, 0, -10.8),
    () => dynCone(-15.2, 0, -10.6),
    () => dynCone(-6.2, 0, -12.6),
    () => dynTire(-18.8, 0, -19.2),
    () => dynTire(-19.4, 0, -18.6),
    () => dynBox(-9.2, 0, -17.4, 0.3),
    () => dynBarrel(-2.8, 0, -14.2, 7222832),
    () => dynCone(6.5, 0, -11.6)
  ];
  for (const f of dyn) f();
  const mir = [[24.4, 0, 14.2], [24.9, 0, 14.8], [12.2, 0, 18.5], [16.4, 0, 10.8], [15.2, 0, 10.6], [6.2, 0, 12.6], [18.8, 0, 19.2], [19.4, 0, 18.6], [9.2, 0, 17.4], [2.8, 0, 14.2], [-6.5, 0, 11.6]];
  dynBarrel(...mir[0]);
  dynBarrel(...mir[1], 3822704);
  dynBarrel(...mir[2], 9079686, true);
  dynCone(...mir[3]);
  dynCone(...mir[4]);
  dynCone(...mir[5]);
  dynTire(...mir[6]);
  dynTire(...mir[7]);
  dynBox(...mir[8], 0.3);
  dynBarrel(...mir[9], 7222832);
  dynCone(...mir[10]);
  sym((x, z, r) => lumberPile(x, 0, z, r, 3.4, 7), -12, -28.8, 0);
  sym((x, z, r) => osbStack(x, 0, z, r, 12), -6.8, -28.7, 0);
  sym((x, z, r) => sawhorse(x, 0, z, r), -9.3, -28.2, 0.2);
  sym((x, z, r) => cableDrum(x, 0, z), 12.5, -28.4, 0);
  sym((x, z, r) => compressor(x, 0, z, r), 15.5, -28.6, 0.4);
  sym((x, z, r) => toolCart(x, 0, z, r), 18.2, -28.4, 0.1);
  sym((x, z, r) => siteToilet(x, 0, z, r), 38.6, -27.5, -Math.PI / 2);
  sym((x, z, r) => extinguisher(x, 0, z, r), -39.5, -7.6, Math.PI / 2);
  buildInterior();
  overheadCrane();
  cableTrays();
}
function buildInterior() {
  const y2 = F2;
  const S = (fn, x, y, z, r, ...a) => {
    fn(x, y, z, r, ...a);
    fn(-x, y, -z, r + Math.PI, ...a);
  };
  S(target, -11, 0, -8.8, 0);
  S(table, -11.8, 0, -4.4, Math.PI / 2, true);
  S(barricade, -7.1, 0, -4.2, 0, 2);
  S(target, -5.3, 0, -8.9, 0);
  S(palletStack, -14.2, 0, 8.6, 0.1, 4);
  S(table, -12.4, 0, 5.6, 0, false);
  S(target, -10.5, 0, 8.9, Math.PI);
  S(barricade, -7.2, 0, 6.4, 0, 1.6);
  S(crate, -5.2, 0, 2.1, 0.2, 0.8);
  S(crate, -3.6, 0, -8.7, 0.1, 0.9);
  S(target, -1, 0, -8.9, 0);
  S(palletStack, -2.2, 0, 0.9, 0.35, 4);
  S(barricade, 2.6, 0, -2.2, 0.1, 1.6);
  S(target, -10.4, y2, -2.1, Math.PI);
  S(crate, -10.3, y2, -8.9, 0.1, 0.8);
  S(barricade, -7.2, y2, -5.4, 0, 1.8);
  S(target, -5.2, y2, -8.9, 0);
  S(table, -12.4, y2, 5.2, 0, true);
  S(crate, -14.3, y2, 8.8, 0.3, 0.8);
  S(target, -7, y2, 8.9, Math.PI);
  S(palletStack, -3.5, y2, -8.7, 0.1, 3);
  S(target, -1.2, y2, -8.9, 0);
  S(barricade, -12.3, 0, -7.2, 0.05, 1.6);
  S(crate, -10.5, 0, -8.4, 0.15, 0.9);
  S(crate, -8.6, 0, -8.4, 0.2, 0.9);
  S(palletStack, -5.7, 0, -2.6, 0.1, 3);
  S(table, -2.4, 0, -5.6, 0, true);
  S(crate, -3.4, 0, 7.6, 0.3, 0.9);
  S(barricade, -2.2, 0, 5.3, 0, 1.6);
  S(crate, -10.6, 0, 3.2, 0.2, 0.9);
  S(barricade, -13.1, 0, 3.7, 0.1, 1.6);
  S(palletStack, -8.6, 0, 3.3, 0.2, 3);
  S(crate, -5.7, 0, 8.4, 0.1, 0.9);
  S(crate, -14.4, 0, -0.5, 0.1, 0.8);
  S(crate, -6.1, 0, 0.7, 0.3, 0.7);
  S((x, y, z, r, ...a) => sandbagWall(x, z, r, ...a, y), -0.6, 0, 1.7, 0, 1.6, 3);
  S(barricade, -11.2, y2, -5, Math.PI / 2, 1.6);
  S(crate, -8.8, y2, -3, 0.2, 0.9);
  S(crate, -5.4, y2, -2.6, 0.1, 0.8);
  S(table, -2.2, y2, -5.4, 0, true);
  S(crate, -3.2, y2, 5, 0.2, 0.9);
  S(barricade, -2, y2, 7.7, 0, 1.4);
  S(barricade, -11.2, y2, 7.4, 0.1, 1.6);
  S(crate, -14.2, y2, 3.2, 0.2, 0.8);
  S(palletStack, -6.2, y2, 4.4, 0.2, 3);
  S(crate, -8.8, y2, 7.6, 0.3, 0.9);
  S(crate, -14.4, y2, 0.4, 0.1, 0.8);
}
var V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
var DOOR_LEAVES = [];
var DOOR_T = 0.042;
var DOOR_OPEN = 1.62;
var DOOR = { leaf: null, handle: null, hinges: null, mat: null, chipMat: null, dmg: null, dirty: /* @__PURE__ */ new Set(), moving: false, wasMoving: false, tr: null };
var DMG_W = 96;
var DMG_H = 192;
var DCELL_Z = 4;
var DCELL_Y = 8;
var _dm = new THREE.Matrix4();
var _dq = new THREE.Quaternion();
var _dp = new THREE.Vector3();
var _ds = new THREE.Vector3();
var _dY = new THREE.Vector3(0, 1, 0);
var _dl = new THREE.Vector3();
var _dv = new THREE.Vector3();
var DOOR_PAINTS = [[0.44, 0.49, 0.42], [0.8, 0.78, 0.72], [0.42, 0.3, 0.2], [0.38, 0.46, 0.54], [0.31, 0.34, 0.25]];
function doorLayout(lw, lh) {
  const st = 0.12 / lw, mul = 0.05 / lw, top = 1 - 0.13 / lh, bot = 0.24 / lh, l0 = 0.93 / lh, l1 = 1.1 / lh;
  return { st, mul, top, bot, l0, l1, panels: [[st, 0.5 - mul, bot, l0], [0.5 + mul, 1 - st, bot, l0], [st, 0.5 - mul, l1, top], [0.5 + mul, 1 - st, l1, top]] };
}
function doorPaintMaps(W) {
  const H = W * 2;
  let seed = 5521;
  const r = () => {
    seed = seed * 1664525 + 1013904223 >>> 0;
    return seed / 4294967296;
  }, R = (a, b) => a + r() * (b - a);
  const [ac, ax] = cv(W, H), [hc, hx] = cv(W, H), [oc, ox] = cv(W, H);
  const Lo = doorLayout(DOOR_W - 0.03, DOOR_H - 0.03), X = (u) => u * W, Y = (v) => (1 - v) * H;
  ax.fillStyle = "#d6d2c8";
  ax.fillRect(0, 0, W, H);
  hx.fillStyle = "rgb(150,150,150)";
  hx.fillRect(0, 0, W, H);
  ox.fillStyle = "rgb(255,112,0)";
  ox.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const vert = r() < 0.6, x = r() * W, y = r() * H, L = R(20, 90) * W / 256;
    hx.strokeStyle = `rgba(${r() < 0.5 ? 170 : 130},${r() < 0.5 ? 170 : 130},${r() < 0.5 ? 170 : 130},.12)`;
    hx.lineWidth = R(0.6, 1.6);
    hx.beginPath();
    hx.moveTo(x, y);
    vert ? hx.lineTo(x + R(-1, 1), y + L) : hx.lineTo(x + L, y + R(-1, 1));
    hx.stroke();
  }
  const bev = 0.028;
  for (const [u0, u1, v0, v1] of Lo.panels) {
    const x0 = X(u0), x1 = X(u1), y0 = Y(v1), y1 = Y(v0), bw = bev / (DOOR_W - 0.03) * W, bh = bev / (DOOR_H - 0.03) * H;
    for (let k = 0; k < 8; k++) {
      const t = k / 8, c = Math.round(150 - 42 + t * 32);
      hx.fillStyle = `rgb(${c},${c},${c})`;
      hx.fillRect(x0 + bw * t, y0 + bh * t, x1 - x0 - 2 * bw * t, y1 - y0 - 2 * bh * t);
    }
    hx.fillStyle = "rgb(142,142,142)";
    hx.fillRect(x0 + bw, y0 + bh, x1 - x0 - 2 * bw, y1 - y0 - 2 * bh);
    hx.strokeStyle = "rgb(96,96,96)";
    hx.lineWidth = 1.2;
    hx.strokeRect(x0 - 1.5, y0 - 1.5, x1 - x0 + 3, y1 - y0 + 3);
    ax.strokeStyle = "rgba(40,36,30,.28)";
    ax.lineWidth = 1.4;
    ax.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ax.fillStyle = "rgba(60,54,44,.07)";
    ax.fillRect(x0, y0, x1 - x0, bh * 1.5);
  }
  ax.strokeStyle = "rgba(40,36,30,.22)";
  ax.lineWidth = 1;
  for (const v of [Lo.bot, Lo.l0, Lo.l1, Lo.top]) for (const u of [Lo.st, 1 - Lo.st]) {
    ax.beginPath();
    ax.moveTo(X(u), Y(v) - 6);
    ax.lineTo(X(u), Y(v) + 6);
    ax.stroke();
  }
  const smudge = (u, v, rx, ry, a, col = "52,44,34") => {
    const g = ax.createRadialGradient(X(u), Y(v), 0, X(u), Y(v), rx * W);
    g.addColorStop(0, `rgba(${col},${a})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ax.save();
    ax.translate(X(u), Y(v));
    ax.scale(1, ry / rx * H / W * 2);
    ax.translate(-X(u), -Y(v));
    ax.fillStyle = g;
    ax.beginPath();
    ax.arc(X(u), Y(v), rx * W, 0, 7);
    ax.fill();
    ax.restore();
    ox.fillStyle = `rgba(255,190,0,${a * 0.8})`;
    ox.beginPath();
    ox.ellipse(X(u), Y(v), rx * W, ry * H, 0, 0, 7);
    ox.fill();
  };
  smudge(0.92, 0.49, 0.1, 0.06, 0.35);
  smudge(0.9, 0.56, 0.07, 0.05, 0.25);
  smudge(0.5, 0.5, 0.25, 0.12, 0.08);
  for (let i = 0; i < 40; i++) {
    const u = R(0.08, 0.92), v = R(0.01, 0.12), L = R(0.02, 0.09);
    ax.strokeStyle = `rgba(30,26,22,${R(0.12, 0.35)})`;
    ax.lineWidth = R(1, 3) * W / 256;
    ax.beginPath();
    ax.moveTo(X(u), Y(v));
    ax.lineTo(X(u + L * R(-1, 1)), Y(v + R(-0.01, 0.02)));
    ax.stroke();
  }
  smudge(0.5, 0.05, 0.4, 0.06, 0.25, "46,40,32");
  for (let i = 0; i < 60; i++) {
    const edge = r() < 0.5, u = edge ? r() < 0.5 ? R(0, 0.02) : R(0.98, 1) : R(0, 1), v = edge ? R(0, 1) : r() < 0.5 ? R(0, 0.01) : R(0.99, 1);
    ax.fillStyle = "rgba(150,120,84,.8)";
    ax.beginPath();
    ax.ellipse(X(u), Y(v), R(1, 3), R(1, 5), 0, 0, 7);
    ax.fill();
  }
  for (let i = 0; i < 14; i++) {
    const x = R(0, W), y = R(0, H * 0.9), L = R(8, 30);
    const g = hx.createLinearGradient(0, y, 0, y + L);
    g.addColorStop(0, "rgba(170,170,170,0)");
    g.addColorStop(0.8, "rgba(176,176,176,.6)");
    g.addColorStop(1, "rgba(176,176,176,0)");
    hx.fillStyle = g;
    hx.fillRect(x, y, 1.6, L);
  }
  grain(ax, W, H, 0.03);
  return { albedo: ac, normal: heightToNormalRect(hc, 2.4), orm: oc };
}
function buildDoors() {
  if (!DOORS.length) return;
  const N = DOORS.length;
  const leafGeo = new THREE.BoxGeometry(DOOR_T, 1, 1, 1, 1, 1);
  leafGeo.translate(0, 0.5, 0.5);
  {
    const p = leafGeo.attributes.position, uv = leafGeo.attributes.uv;
    for (let k = 0; k < p.count; k++) uv.setXY(k, p.getZ(k), p.getY(k));
  }
  leafGeo.setAttribute("aDoorLayer", new THREE.InstancedBufferAttribute(new Float32Array(N).map((_, i2) => i2), 1));
  const pm = doorPaintMaps(TS(256));
  DOOR.mat = new THREE.MeshStandardMaterial({
    map: T(pm.albedo),
    normalMap: T(pm.normal, 1, 1, false),
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: T(pm.orm, 1, 1, false),
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.7
  });
  for (const t of [DOOR.mat.map, DOOR.mat.normalMap, DOOR.mat.roughnessMap]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const data = new Uint8Array(DMG_W * DMG_H * 4 * N);
  for (let i2 = 0; i2 < N; i2++) {
    const o = i2 * DMG_W * DMG_H * 4;
    for (let k = 3; k < DMG_W * DMG_H * 4; k += 4) data[o + k] = 255;
  }
  DOOR.dmg = new THREE.DataArrayTexture(data, DMG_W, DMG_H, N);
  DOOR.dmg.format = THREE.RGBAFormat;
  DOOR.dmg.type = THREE.UnsignedByteType;
  DOOR.dmg.minFilter = DOOR.dmg.magFilter = THREE.LinearFilter;
  DOOR.dmg.generateMipmaps = false;
  DOOR.dmg.wrapS = DOOR.dmg.wrapT = THREE.ClampToEdgeWrapping;
  DOOR.dmg.needsUpdate = true;
  const U = { uDoorDmg: { value: DOOR.dmg } };
  const vtx = (sh) => sh.vertexShader.replace("#include <common>", `#include <common>
      attribute float aDoorLayer; varying vec2 vDoorUv; varying float vDoorLayer, vDoorSide;`).replace("#include <begin_vertex>", `#include <begin_vertex>
      vDoorUv = vec2(position.z, position.y); vDoorLayer = aDoorLayer; vDoorSide = position.x;`);
  const pars = `uniform highp sampler2DArray uDoorDmg; varying vec2 vDoorUv; varying float vDoorLayer, vDoorSide;
      vec4 doorDmg(){ return texture(uDoorDmg, vec3(clamp(vDoorUv, 0.003, 0.997), floor(vDoorLayer + 0.5))); }`;
  DOOR.mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = vtx(sh);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + pars).replace("#include <color_fragment>", `#include <color_fragment>
        vec4 dd = doorDmg();
        if(dd.r > 0.5) discard;
        float dRim = vDoorSide > 0.0 ? dd.g : dd.b;
        // сколотая краска и щепа: светлое сырое дерево с волокнами поперёк полотна
        float dFib = fract(sin(dot(floor(vDoorUv*vec2(220.0, 34.0)), vec2(12.9898, 78.233)))*43758.5453);
        vec3 dRaw = vec3(0.74, 0.6, 0.42)*(0.78 + 0.4*dFib);
        diffuseColor.rgb = mix(diffuseColor.rgb, dRaw, clamp(dRim*1.15, 0.0, 1.0));
        // кромка пробоины: обугленная пороховыми газами и в тени торцов волокон
        float dEdge = smoothstep(0.1, 0.5, dd.r);
        diffuseColor.rgb *= 1.0 - dEdge*0.82;`).replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.92, clamp(dRim + dEdge, 0.0, 1.0));`);
  };
  DOOR.mat.customProgramCacheKey = () => "door-dmg";
  DOOR.leaf = new THREE.InstancedMesh(leafGeo, DOOR.mat, N);
  /* v22: дверное полотно — дерево толщиной DOOR_T: пуля пробивает его и летит дальше */
  DOOR.leaf.userData.mat = "wood"; DOOR.leaf.userData.door = true; DOOR.leaf.userData.thick = DOOR_T;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = vtx(sh);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + pars).replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n  if(doorDmg().r > 0.5) discard;");
  };
  depth.customProgramCacheKey = () => "door-dmg-depth";
  DOOR.leaf.customDepthMaterial = depth;
  const hp = [];
  for (const sx of [-1, 1]) {
    const rose = new THREE.CylinderGeometry(0.028, 0.028, 0.012, 14);
    rose.rotateZ(Math.PI / 2);
    rose.translate(sx * (DOOR_T / 2 + 6e-3), 0, 0);
    hp.push(rose);
    const lever = new THREE.BoxGeometry(0.018, 0.018, 0.13);
    lever.translate(sx * (DOOR_T / 2 + 0.04), 0, -0.05);
    hp.push(lever);
    const neck = new THREE.CylinderGeometry(8e-3, 8e-3, 0.04, 8);
    neck.rotateZ(Math.PI / 2);
    neck.translate(sx * (DOOR_T / 2 + 0.022), 0, 0);
    hp.push(neck);
    const esc = new THREE.BoxGeometry(6e-3, 0.07, 0.03);
    esc.translate(sx * (DOOR_T / 2 + 3e-3), -0.1, 0);
    hp.push(esc);
    const key = new THREE.BoxGeometry(8e-3, 0.02, 6e-3);
    key.translate(sx * (DOOR_T / 2 + 6e-3), -0.1, 0);
    hp.push(key);
  }
  DOOR.handle = new THREE.InstancedMesh(mergeParts(hp), M.chrome, N);
  const hg = [];
  for (const y of [0.22, 1.02, 1.82]) {
    const knuckle = new THREE.CylinderGeometry(0.011, 0.011, 0.11, 10);
    knuckle.translate(0, y, -4e-3);
    hg.push(knuckle);
    for (const sx of [-1, 1]) {
      const leaf = new THREE.BoxGeometry(3e-3, 0.1, 0.035);
      leaf.translate(sx * (DOOR_T / 2 + 15e-4), y, 0.014);
      hg.push(leaf);
    }
    const cap = new THREE.SphereGeometry(0.012, 8, 6);
    cap.translate(0, y + 0.058, -4e-3);
    hg.push(cap);
  }
  DOOR.hinges = new THREE.InstancedMesh(mergeParts(hg), cmat(5920076, { roughness: 0.45, metalness: 0.85 }), N);
  for (const im of [DOOR.leaf, DOOR.handle, DOOR.hinges]) {
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    im.userData.nomerge = true;
    im.receiveShadow = true;
    scene.add(im);
  }
  DOOR.leaf.castShadow = true;
  DOOR.chipMat = new THREE.MeshStandardMaterial({ color: 11836024, map: M.plywood.map, roughness: 0.85, metalness: 0 });
  DOOR.chunks = new Chips(new THREE.BoxGeometry(1, 1, 1), DOOR.chipMat, Q.debris >= 400 ? 260 : 160);
  let i = 0;
  for (const d of DOORS) {
    const lw = (d.w || DOOR_W) - 0.03, lh = DOOR_H - 0.03;
    const ux = Math.sin(d.ang), uz = Math.cos(d.ang);
    const hinge = new THREE.Vector3(d.x - ux * lw / 2, d.y + 0.012, d.z - uz * lw / 2);
    const outer = Math.abs(Math.abs(d.x) - BX1) < 0.05 || Math.abs(Math.abs(d.z) - BZ1) < 0.05;
    const r = rnd2(), open = outer ? 0 : (r < 0.45 ? 0 : r < 0.7 ? DOOR_OPEN * 0.35 : DOOR_OPEN) * (rnd2() < 0.5 ? -1 : 1);
    const paint = DOOR_PAINTS[Math.floor(rnd2() * DOOR_PAINTS.length)], tone = 0.9 + rnd2() * 0.2;
    DOOR.leaf.setColorAt(i, _kc.setRGB(paint[0] * tone, paint[1] * tone, paint[2] * tone));
    const L = {
      i: i++,
      d,
      lw,
      lh,
      hinge,
      ang: d.ang,
      open,
      target: open,
      speed: 2.6,
      body: null,
      idx: -1,
      n: new THREE.Vector3(uz, 0, -ux),
      c: new THREE.Vector3(d.x, d.y + lh / 2, d.z),
      lay: doorLayout(lw, lh),
      cells: new Float32Array(DCELL_Z * DCELL_Y),
      broken: new Uint8Array(DCELL_Z * DCELL_Y),
      chunks: 0
    };
    DOOR_LEAVES.push(L);
    doorWear(L);
  }
  DOOR.leaf.instanceColor.needsUpdate = true;
  for (const L of DOOR_LEAVES) doorPose(L);
  DOOR.leaf.instanceMatrix.needsUpdate = DOOR.handle.instanceMatrix.needsUpdate = DOOR.hinges.instanceMatrix.needsUpdate = true;
}
function doorWorld(L) {
  _dq.setFromAxisAngle(_dY, L.ang + L.open);
  _dp.set(0, L.lh / 2, L.lw / 2).applyQuaternion(_dq).add(L.hinge);
}
function doorPose(L) {
  _dq.setFromAxisAngle(_dY, L.ang + L.open);
  _dm.compose(L.hinge, _dq, _ds.set(1, L.lh, L.lw));
  DOOR.leaf.setMatrixAt(L.i, _dm);
  _dm.compose(L.hinge, _dq, _ds.set(1, 1, 1));
  DOOR.hinges.setMatrixAt(L.i, _dm);
  _dp.set(0, 1, L.lw - 0.075).applyQuaternion(_dq).add(L.hinge);
  _dm.compose(_dp, _dq, _ds.set(1, 1, 1));
  DOOR.handle.setMatrixAt(L.i, _dm);
  if (L.body) {
    doorWorld(L);
        __moveDoorBody(L.body, _dp, _dq);
  }
}
function updateDoors(dt) {
  let moving = false;
  for (const L of DOOR_LEAVES) {
    if (L.open === L.target) continue;
    const dA = L.target - L.open, stepA = L.speed * dt;
    L.open = Math.abs(dA) <= stepA ? L.target : L.open + Math.sign(dA) * stepA;
    if (L.open === L.target && L.speed > 6) SND.door(L.c, "close");
    else if (L.open === L.target && L.target === 0) SND.door(L.c, "close");
    doorPose(L);
    moving = true;
  }
  DOOR.chunks.update(dt);
  if (moving) DOOR.leaf.instanceMatrix.needsUpdate = DOOR.handle.instanceMatrix.needsUpdate = DOOR.hinges.instanceMatrix.needsUpdate = true;
  if (DOOR.dirty.size) {
    for (const i of DOOR.dirty) DOOR.dmg.addLayerUpdate(i);
    DOOR.dmg.needsUpdate = true;
    DOOR.dirty.clear();
    if (SUN_UP) renderer.shadowMap.needsUpdate = true;
  }
  if (DOOR.wasMoving && !moving && SUN_UP) renderer.shadowMap.needsUpdate = true;
  DOOR.wasMoving = moving;
}
var _dq2 = new THREE.Quaternion();
var dIdx = (L, x, y) => ((L.i * DMG_H + y) * DMG_W + x) * 4;
function dRange(L, z, y, rz, ry) {
  const sx = DMG_W / L.lw, sy = DMG_H / L.lh;
  return [
    Math.max(0, Math.floor((z - rz) * sx)),
    Math.min(DMG_W - 1, Math.ceil((z + rz) * sx)),
    Math.max(0, Math.floor((y - ry) * sy)),
    Math.min(DMG_H - 1, Math.ceil((y + ry) * sy)),
    sx,
    sy
  ];
}
function dPut(D2, i, v) {
  if (v > D2[i]) D2[i] = v;
}
function dSample(L, z, y) {
  const tx = clamp(Math.floor(z / L.lw * DMG_W), 0, DMG_W - 1), ty = clamp(Math.floor(y / L.lh * DMG_H), 0, DMG_H - 1);
  return DOOR.dmg.image.data[dIdx(L, tx, ty)];
}
function dHole(L, z, y, rad, ring) {
  const D2 = DOOR.dmg.image.data, [x0, x1, y0, y1, sx, sy] = dRange(L, z, y, rad + ring, rad + ring);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const d = Math.hypot((tx + 0.5) / sx - z, (ty + 0.5) / sy - y), i = dIdx(L, tx, ty);
    if (d < rad) D2[i] = 255;
    else if (d < rad + ring) dPut(D2, i, Math.round(112 * (1 - (d - rad) / ring)));
  }
  D2[dIdx(L, clamp(Math.floor(z * sx), 0, DMG_W - 1), clamp(Math.floor(y * sy), 0, DMG_H - 1))] = 255;
  DOOR.dirty.add(L.i);
}
function dRim(L, z, y, rad, ch, val, ay = 1.6, jag = 0.4) {
  const D2 = DOOR.dmg.image.data, [x0, x1, y0, y1, sx, sy] = dRange(L, z, y, rad * (1 + jag), rad * ay * (1 + jag));
  const ph = Math.random() * 6.28, ph2 = Math.random() * 6.28;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const dz = (tx + 0.5) / sx - z, dy = ((ty + 0.5) / sy - y) / ay, a = Math.atan2(dy, dz);
    const rr = rad * (1 + jag * (0.6 * Math.sin(a * 3 + ph) + 0.4 * Math.sin(a * 7 + ph2))), d = Math.hypot(dz, dy);
    if (d < rr) dPut(D2, dIdx(L, tx, ty) + ch, Math.round(val * Math.min(1, (rr - d) / (rr * 0.35) + 0.25)));
  }
  DOOR.dirty.add(L.i);
}
function dLine(L, z0, y0, z1, y1, ch, val) {
  const D2 = DOOR.dmg.image.data, sx = DMG_W / L.lw, sy = DMG_H / L.lh;
  const n = Math.max(2, Math.ceil(Math.hypot((z1 - z0) * sx, (y1 - y0) * sy) * 2));
  for (let k = 0; k <= n; k++) {
    const t = k / n, tx = Math.floor(lerp(z0, z1, t) * sx), ty = Math.floor(lerp(y0, y1, t) * sy);
    if (tx < 0 || ty < 0 || tx >= DMG_W || ty >= DMG_H) continue;
    dPut(D2, dIdx(L, tx, ty) + ch, Math.round(val * (1 - t * 0.6)));
  }
  DOOR.dirty.add(L.i);
}
function dPoly(L, pts, zMin = 0) {
  const D2 = DOOR.dmg.image.data;
  let a = 1e9, b = -1e9, c = 1e9, e = -1e9;
  for (const [z, y] of pts) {
    a = Math.min(a, z);
    b = Math.max(b, z);
    c = Math.min(c, y);
    e = Math.max(e, y);
  }
  const pad = 0.035, [x0, x1, y0, y1, sx, sy] = dRange(L, (a + b) / 2, (c + e) / 2, (b - a) / 2 + pad, (e - c) / 2 + pad);
  const inside = (z, y) => {
    let r = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [zi, yi] = pts[i], [zj, yj] = pts[j];
      if (yi > y !== yj > y && z < (zj - zi) * (y - yi) / (yj - yi) + zi) r = !r;
    }
    return r;
  };
  const edgeD = (z, y) => {
    let m = 1e9;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [zi, yi] = pts[i], [zj, yj] = pts[j], dz = zj - zi, dy = yj - yi, t = clamp(((z - zi) * dz + (y - yi) * dy) / (dz * dz + dy * dy || 1), 0, 1);
      m = Math.min(m, Math.hypot(z - zi - dz * t, y - yi - dy * t));
    }
    return m;
  };
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const z = (tx + 0.5) / sx, y = (ty + 0.5) / sy, i = dIdx(L, tx, ty);
    if (z < zMin) continue;
    if (inside(z, y)) {
      D2[i] = 255;
      continue;
    }
    const d = edgeD(z, y);
    if (d < 0.02) dPut(D2, i, Math.round(110 * (1 - d / 0.02)));
    if (d < pad) {
      const v = Math.round(255 * (1 - d / pad) * (0.6 + Math.random() * 0.4));
      dPut(D2, i + 1, v);
      dPut(D2, i + 2, v);
    }
  }
  DOOR.dirty.add(L.i);
}
function doorWear(L) {
  let s = 7919 * (L.i + 1);
  const r = () => {
    s = s * 1664525 + 1013904223 >>> 0;
    return s / 4294967296;
  };
  for (let k = 0; k < 22; k++) {
    const edge = r(), z = edge < 0.35 ? r() * 0.02 : edge < 0.7 ? L.lw - r() * 0.02 : r() * L.lw, y = edge < 0.7 ? r() * L.lh : r() * 0.12;
    for (const ch of [1, 2]) if (r() < 0.7) dRim(L, z, y, 4e-3 + r() * 0.01, ch, 200 + r() * 55, 1.4, 0.5);
  }
  for (let k = 0; k < 6; k++) dRim(L, L.lw - 0.075 + (r() - 0.5) * 0.06, 1 + (r() - 0.5) * 0.1, 3e-3 + r() * 5e-3, 1 + (k & 1), 220, 1, 0.4);
  DOOR.dirty.delete(L.i);
}
function dCell(L, z, y) {
  return clamp(Math.floor(y / L.lh * DCELL_Y), 0, DCELL_Y - 1) * DCELL_Z + clamp(Math.floor(z / L.lw * DCELL_Z), 0, DCELL_Z - 1);
}
function dCellThr(L, c) {
  const u = (c % DCELL_Z + 0.5) / DCELL_Z, v = (Math.floor(c / DCELL_Z) + 0.5) / DCELL_Y;
  return L.lay.panels.some(([u0, u1, v0, v1]) => u > u0 && u < u1 && v > v0 && v < v1) ? 4 : 11;
}
function doorToWorld(L, x, y, z, out) {
  _dq2.setFromAxisAngle(_dY, L.ang + L.open);
  return out.set(x, y, z).applyQuaternion(_dq2).add(L.hinge);
}
function breakCell(L, c, dir, maxChunks = 3) {
  if (L.broken[c]) return;
  L.broken[c] = 1;
  const cw = L.lw / DCELL_Z, ch = L.lh / DCELL_Y;
  const zc = (c % DCELL_Z + 0.5 + rnd(-0.15, 0.15)) * cw, yc = (Math.floor(c / DCELL_Z) + 0.5 + rnd(-0.15, 0.15)) * ch;
  const rz = cw * rnd(0.45, 0.7), ry = ch * rnd(0.5, 0.85), pts = [], N = 14;
  for (let k = 0; k < N; k++) {
    const a = k / N * Math.PI * 2, spike = k % 2 && Math.abs(Math.sin(a)) > 0.7 ? rnd(1.1, 1.6) : rnd(0.65, 1.05);
    pts.push([zc + Math.cos(a) * rz * rnd(0.75, 1.05), yc + Math.sin(a) * ry * spike]);
  }
  dPoly(L, pts, L.lay.st * L.lw * 0.85);
  for (let k = 0; k < 3; k++) dLine(L, zc + rnd(-rz, rz) * 0.6, yc + ry * 0.8, zc + rnd(-rz, rz) * 0.6, yc + ry * rnd(1.2, 2), 0, 96);
  const fl = L.d.y, n = Math.min(maxChunks, 1 + Math.floor(Math.random() * 3));
  for (let k = 0; k < n; k++) {
    const p = doorToWorld(L, rnd(-0.01, 0.01), yc + rnd(-ry, ry) * 0.5, clamp(zc + rnd(-rz, rz) * 0.5, 0.05, L.lw - 0.05), new THREE.Vector3());
    const v = dir.clone().multiplyScalar(rnd(1.2, 3.2)).add(_dv.set(rnd(-0.8, 0.8), rnd(0.2, 1.4), rnd(-0.8, 0.8)));
    DOOR.chunks.spawn(p, v, _ds.set(rnd(0.018, 0.032), ry * rnd(0.5, 1.1), rz * rnd(0.4, 0.9)), fl, rnd(70, 110));
  }
  const pc = doorToWorld(L, 0, yc, zc, new THREE.Vector3());
  for (let k = 0; k < 8; k++) FXS.splinters.spawn(
    pc,
    _dv.copy(dir).multiplyScalar(rnd(0.6, 3)).add(_ds.set(rnd(-1, 1), rnd(0, 1.6), rnd(-1, 1))),
    _ds.set(rnd(0.03, 0.11), rnd(3e-3, 8e-3), rnd(6e-3, 0.02)),
    fl,
    rnd(6, 12)
  );
  FXS.dust.spawn({ p: pc, v: dir.clone().multiplyScalar(0.9), life: rnd(1.2, 2.2), s0: 0.12, s1: 0.8, col: [0.74, 0.64, 0.5], a0: 0.45, a1: 0, drag: 2.2, g: -0.1 });
  SND.hit(pc, "wood");
  const i = c % DCELL_Z, j = Math.floor(c / DCELL_Z);
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ii = i + di, jj = j + dj;
    if (ii >= 0 && jj >= 0 && ii < DCELL_Z && jj < DCELL_Y) L.cells[jj * DCELL_Z + ii] += 1.2;
  }
  L.chunks++;
}
function dCheck(L, c, dir, maxChunks) {
  if (!L.broken[c] && L.cells[c] >= dCellThr(L, c)) breakCell(L, c, dir, maxChunks);
}
function doorBulletHit(L, hit, dir, power) {
  _dq2.setFromAxisAngle(_dY, L.ang + L.open).invert();
  _dl.copy(hit.p).sub(L.hinge).applyQuaternion(_dq2);
  const z = clamp(_dl.z, 4e-3, L.lw - 4e-3), y = clamp(_dl.y, 4e-3, L.lh - 4e-3);
  if (dSample(L, z, y) >= 128) return { stop: false, cost: 0, surf: "wood" };
  _dv.copy(dir).applyQuaternion(_dq2);
  const inCh = _dv.x > 0 ? 2 : 1, outCh = 3 - inCh;
  dHole(L, z, y, rnd(4e-3, 7e-3), rnd(8e-3, 0.013));
  dRim(L, z, y, rnd(7e-3, 0.012), inCh, 190, 1.2, 0.3);
  dRim(L, z, y, rnd(0.018, 0.034), outCh, 255, 1.9, 0.55);
  for (let k = 0, n = 3 + Math.floor(Math.random() * 4); k < n; k++) {
    const up = Math.random() < 0.5 ? -1 : 1;
    dLine(L, z + rnd(-6e-3, 6e-3), y, z + rnd(-0.014, 0.014), y + up * rnd(0.02, 0.075), outCh, 235);
  }
  if (Math.random() < 0.35) dLine(L, z, y, z + rnd(-4e-3, 4e-3), y + (Math.random() < 0.5 ? -1 : 1) * rnd(0.03, 0.12), 0, 92);
  const fl = L.d.y, ex = _ds.copy(hit.p).addScaledVector(dir, DOOR_T / Math.max(0.2, Math.abs(_dv.x))).clone();
  for (let i2 = 0; i2 < 2; i2++) FXS.splinters.spawn(
    hit.p,
    _dp.copy(dir).multiplyScalar(-rnd(0.3, 1.2)).add(_dl.set(rnd(-0.5, 0.5), rnd(0, 0.8), rnd(-0.5, 0.5))),
    _dv.set(rnd(0.015, 0.04), rnd(2e-3, 4e-3), rnd(4e-3, 8e-3)),
    fl,
    rnd(4, 8)
  );
  for (let i2 = 0; i2 < 5; i2++) FXS.splinters.spawn(
    ex,
    _dp.copy(dir).multiplyScalar(rnd(1, 3.5)).add(_dl.set(rnd(-0.7, 0.7), rnd(-0.2, 1), rnd(-0.7, 0.7))),
    _dv.set(rnd(0.03, 0.09), rnd(3e-3, 7e-3), rnd(6e-3, 0.016)),
    fl,
    rnd(5, 11)
  );
  if (Math.random() < 0.55) DOOR.chunks.spawn(
    ex,
    _dp.copy(dir).multiplyScalar(rnd(1, 2.5)).add(_dl.set(rnd(-0.5, 0.5), rnd(0, 0.8), rnd(-0.5, 0.5))),
    _dv.set(rnd(6e-3, 0.012), rnd(0.02, 0.05), rnd(0.012, 0.03)),
    fl,
    rnd(40, 80)
  );
  FXS.dust.spawn({ p: ex, v: _dp.copy(dir).multiplyScalar(0.8), life: rnd(0.7, 1.3), s0: 0.05, s1: 0.4, col: [0.76, 0.66, 0.52], a0: 0.4, a1: 0, drag: 2.6 });
  SND.hit(hit.p, "wood");
  const c = dCell(L, z, y);
  L.cells[c] += power;
  const i = c % DCELL_Z, j = Math.floor(c / DCELL_Z);
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ii = i + di, jj = j + dj;
    if (ii >= 0 && jj >= 0 && ii < DCELL_Z && jj < DCELL_Y) L.cells[jj * DCELL_Z + ii] += 0.22 * power;
  }
  dCheck(L, c, dir, 3);
  return { stop: false, cost: 0.16, surf: "wood" };
}
function doorBlast(p, R, P) {
  for (const L of DOOR_LEAVES) {
    const d = L.c.distanceTo(p);
    if (d > R) continue;
    const k = 1 - d / R;
    const dir = V().subVectors(L.c, p).setY(0).normalize();
    const side = Math.sign(dir.dot(L.n)) || 1;
    L.target = side * DOOR_OPEN;
    L.speed = 14;
    _dq2.setFromAxisAngle(_dY, L.ang + L.open).invert();
    _dv.copy(dir).applyQuaternion(_dq2);
    const outCh = _dv.x > 0 ? 1 : 2;
    for (let n = Math.min(40, Math.round(26 * k * P)); n > 0; n--) {
      const z = rnd(0.02, L.lw - 0.02), y = rnd(0.02, L.lh - 0.02);
      dHole(L, z, y, rnd(4e-3, 0.011), 0.012);
      dRim(L, z, y, rnd(0.02, 0.045), outCh, 255, 1.7, 0.6);
      L.cells[dCell(L, z, y)] += rnd(0.4, 1.4) * P;
    }
    let br = 0;
    for (let c = 0; c < L.cells.length && br < 5; c++) {
      const was = L.broken[c];
      L.cells[c] += 5 * k * k * P * Math.random();
      dCheck(L, c, dir, 2);
      if (!was && L.broken[c]) br++;
    }
  }
}
var AMMO_BOXES = [];
var _ammoTex = null;
function ammoStencil() {
  if (_ammoTex) return _ammoTex;
  const W = 512, H = 256, [c, x] = cv(W, H);
  x.fillStyle = "#4c5436";
  x.fillRect(0, 0, W, H);
  const q = (a, b) => a + rnd2() * (b - a);
  for (let i = 0; i < 260; i++) {
    x.fillStyle = `rgba(${q(20, 90) | 0},${q(30, 90) | 0},${q(15, 50) | 0},${q(0.04, 0.12)})`;
    x.fillRect(q(0, W), q(0, H), q(4, 60), q(2, 14));
  }
  x.strokeStyle = "rgba(20,22,14,.55)";
  x.lineWidth = 6;
  x.strokeRect(10, 10, W - 20, H - 20);
  x.fillStyle = "rgba(226,220,196,.88)";
  x.textAlign = "center";
  x.font = '700 52px "Arial Narrow",Arial,sans-serif';
  x.fillText("БОЕПРИПАСЫ", W / 2, 96);
  x.font = '600 30px "Arial Narrow",Arial,sans-serif';
  x.fillText("5,45×39 · 4 МАГ. · РГД-5 ×2", W / 2, 146);
  x.font = "600 24px ui-monospace,Consolas,monospace";
  x.fillText("ALPHA · DELTA · ПАРТ. 07-26", W / 2, 196);
  x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 700; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.35})`;
    x.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 6, 1 + Math.random() * 3);
  }
  x.globalCompositeOperation = "destination-over";
  x.fillStyle = "#4c5436";
  x.fillRect(0, 0, W, H);
  _ammoTex = new THREE.CanvasTexture(c);
  _ammoTex.colorSpace = THREE.SRGBColorSpace;
  _ammoTex.anisotropy = MAXA();
  _ammoTex.userData.mat = new THREE.MeshStandardMaterial({ map: _ammoTex, roughness: 0.78, metalness: 0.05 });
  return _ammoTex;
}
function ammoBox(x, y, z, rotY) {
  const G = new THREE.Group();
  const paint = ammoStencil().userData.mat;
  const L = 1.05, Wd = 0.56, Hb = 0.42;
  const body = new THREE.Mesh(roundedBox(L, Hb, Wd, 0.018, 1), paint);
  body.position.y = 0.1 + Hb / 2;
  G.add(body);
  for (const sz of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(L + 0.04, 0.1, 0.09), M.woodDark);
    skid.position.set(0, 0.05, sz * (Wd / 2 - 0.08));
    G.add(skid);
  }
  for (const sx of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 10, Math.PI), M.steel);
    handle.position.set(sx * (L / 2 + 0.012), 0.1 + Hb * 0.62, 0);
    handle.rotation.set(0, Math.PI / 2, Math.PI);
    G.add(handle);
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.02), M.steel);
    latch.position.set(sx * 0.32, 0.1 + Hb - 0.03, Wd / 2 + 0.01);
    G.add(latch);
  }
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.1 + Hb, -Wd / 2);
  const lid = new THREE.Mesh(roundedBox(L + 0.01, 0.06, Wd + 0.01, 0.015, 1), paint);
  lid.position.set(0, 0.03, Wd / 2);
  lidPivot.add(lid);
  lidPivot.userData.nomerge = true;
  G.add(lidPivot);
  G.position.set(x, y, z);
  G.rotation.y = rotY;
  shadowAll(G);
  scene.add(G);
  addAABB(x, y + 0.26, z, ...Math.abs(Math.sin(rotY)) > 0.7 ? [Wd, 0.52, L] : [L, 0.52, Wd], 0, "wood");
  AMMO_BOXES.push({ p: new THREE.Vector3(x, y + 0.5, z), lid: lidPivot, open: 0 });
}
var WIND = { dir: new THREE.Vector3(0.2, 0, 1).normalize(), base: 6.5, vec: new THREE.Vector3(), speed: 6.5 };
function collectGlass() {
  const out = [];
  scene.traverse((o) => {
    if (o.isMesh && o.userData.glass && !DEST.glass.some((g) => g.mesh === o)) out.push(o);
  });
  return out;
}
var _lampNear = [];
var _lampOff = new THREE.Vector3(0, -0.08, 0);
var _lampP = new THREE.Vector3();
function updateLamps(dt, t) {
  const LI = LAMP_INST, o = LI.o;
  let moved = false;
  for (const l of INTERIOR) {
    l.vx += (-9.81 / l.len * Math.sin(l.ax) + WIND.vec.x * 4e-3 * Math.sin(t * 0.7 + l.x)) * dt;
    l.vz += (-9.81 / l.len * Math.sin(l.az) + WIND.vec.z * 4e-3 * Math.cos(t * 0.6 + l.z)) * dt;
    l.vx *= Math.exp(-dt * 0.35);
    l.vz *= Math.exp(-dt * 0.35);
    l.ax = clamp(l.ax + l.vx * dt, -0.9, 0.9);
    l.az = clamp(l.az + l.vz * dt, -0.9, 0.9);
    l.flick = Math.max(0, (l.flick || 0) - dt);
    if (Math.abs(l.ax - (l.axU ?? 9)) < 15e-4 && Math.abs(l.az - (l.azU ?? 9)) < 15e-4) continue;
    l.axU = l.ax;
    l.azU = l.az;
    moved = true;
    const ox = Math.sin(l.ax) * l.len, oz = Math.sin(l.az) * l.len, oy = l.len * (1 - Math.cos(l.ax) * Math.cos(l.az));
    o.position.set(l.x + ox, l.top - l.len + oy, l.z + oz);
    o.rotation.set(l.az, 0, -l.ax);
    o.scale.set(1, 1, 1);
    o.updateMatrix();
    LI.shade.setMatrixAt(l.i, o.matrix);
    o.position.set(l.x + ox / 2, l.top - l.len / 2 + oy / 2, l.z + oz / 2);
    o.scale.set(1, l.len, 1);
    o.updateMatrix();
    LI.cord.setMatrixAt(l.i, o.matrix);
    o.position.set(l.x + ox * 1.05, l.top - l.len + oy - 0.06, l.z + oz * 1.05);
    o.rotation.set(0, 0, 0);
    o.scale.set(1, 1, 1);
    o.updateMatrix();
    LI.bulb.setMatrixAt(l.i, o.matrix);
    l.pos.copy(o.position);
  }
  if (moved) LI.shade.instanceMatrix.needsUpdate = LI.cord.instanceMatrix.needsUpdate = LI.bulb.instanceMatrix.needsUpdate = true;
  const cam = camera.position;
  _lampNear.length = 0;
  for (const l of INTERIOR) {
    l.d = l.pos.distanceToSquared(cam);
    if (l.d < 400) _lampNear.push(l);
  }
  _lampNear.sort((a, b) => a.d - b.d);
  const n = Math.min(_lampNear.length, Math.max(3, Math.min(6, Q.lights)));
  for (let i = 0; i < n; i++) {
    const l = _lampNear[i];
    const fl = l.flick > 0 ? Math.random() < 0.5 ? 0.1 : 1 : 1;
    lightReq(_lampP.copy(l.pos).add(_lampOff), 16767392, 4.5 * fl * clamp(1 - Math.sqrt(l.d) / 20, 0, 1), 8, 2, 1.2);
  }
}
await ctx.stage('buildAllMaterials');buildAllMaterials();
await ctx.stage('buildFabricMaterials');buildFabricMaterials();
await ctx.stage('buildLights');buildLights();
await ctx.stage('buildHangar');buildHangar();
await ctx.stage('buildRoof');buildRoof();
await ctx.stage('buildLamps');buildLamps();
await ctx.stage('buildDeadLamp');buildDeadLamp();
await ctx.stage('buildServices');buildServices();
await ctx.stage('buildNightLighting');buildNightLighting();
await ctx.stage('buildHouse');buildHouse();
await ctx.stage('buildDoors');buildDoors();
await ctx.stage('roomLabels');roomLabels();
await ctx.stage('buildLayout');buildLayout();
await ctx.stage('buildFloor');buildFloor();
await ctx.stage('buildFloorDetails');buildFloorDetails();
await ctx.stage('buildTag');buildTag();
await ctx.stage('flushBuckets');flushBuckets();
await ctx.stage('bakeScene');bakeScene();

for (const o of collectGlass()) registerGlass(o, { hp: 1 });
instanceGlass();
scene.traverse((o) => { if (o.isMesh) ensureColor(o); });
function initDoorPhysics() {
  for (const L of DOOR_LEAVES) {
    L.idx = registerOwner({ type: "door", d: L });
    doorWorld(L);
    const c = { cx: _dp.x, cy: _dp.y, cz: _dp.z, hx: DOOR_T / 2, hy: L.lh / 2, hz: L.lw / 2, q: [_dq.x, _dq.y, _dq.z, _dq.w], surf: "wood", door: true, nonav: true };
    L.body = addStaticCollider(c, L.idx);
  }
}
function __moveDoorBody(c, p, q) {
  c.cx = p.x; c.cy = p.y; c.cz = p.z; c.q = [q.x, q.y, q.z, q.w];
  __aabb(c);
  liveMoved(c);
}
HOOKS.doorBlast = doorBlast;
initDestructiblePhysics();
initDoorPhysics();
for (const c of COLLIDERS) liveAdd(c);

var __doorT = 0;
const native = COLLIDERS;
const __api = {
  native, heightAt: () => 0, bounds: { x0: -HW + .5, x1: HW - .5, z0: -HD + .5, z1: HD - .5 }, bases: { alpha: { x: -34, z: 0 }, delta: { x: 34, z: 0 } },
  hooks: __HK,
  crates: AMMO_BOXES.map((b, i) => ({ id: 'ammo' + i, kind: 'ammo', x: b.p.x, y: b.p.y, z: b.p.z, r: 1.9 })),
  doors: DOOR_LEAVES,
  dest: DEST, owners: PH.owners, live: LIVE,
  bulletHit(p, dir, power) { const r = __bulletAt(p, dir, power || 1); flushDestruction(); return r; },
  explode(p, o) { explode(p, o); },
  toggleDoor(L, fromPos) {
    const side = Math.sign((fromPos.x - L.c.x) * L.n.x + (fromPos.z - L.c.z) * L.n.z) || 1;
    L.speed = 2.6;
    if (Math.abs(L.target) > 0.1) L.target = 0; else { L.target = -side * DOOR_OPEN; SND.door(L.c, 'open'); }
  },
  doorNear(x, y, z, r) { let best = null, bd = r; for (const L of DOOR_LEAVES) { if (Math.abs(y - (L.d.y + 1)) > 1.6) continue; const d = Math.hypot(L.c.x - x, L.c.z - z); if (d < bd) { bd = d; best = L; } } return best; },
  update(dt, t, squad) {
    // AI soldiers open doors they walk into; the controlled soldier uses the key
    if (squad && (__doorT = (__doorT || 0) + dt) > 0.2) {
      __doorT = 0;
      for (const s of squad) {
        if (s.active || !s.ctrl || (s.hp !== undefined && s.hp <= 0)) continue;
        const L = this.doorNear(s.ctrl.pos.x, s.ctrl.pos.y, s.ctrl.pos.z, 1.5);
        if (!L || L.open !== L.target) continue;
        // v22: closed doors are opened, half-open ("ajar") leaves are swung fully open so they don't block the doorway
        if (Math.abs(L.target) < 0.1) this.toggleDoor(L, s.ctrl.pos);
        else if (Math.abs(L.target) < DOOR_OPEN * 0.9) { L.speed = 2.6; L.target = Math.sign(L.target) * DOOR_OPEN; }
      }
    }
    updateDoors(dt); __debUpdate(dt);
  },
  indoor(x, z) { return Math.abs(x) < HW - 0.3 && Math.abs(z) < HD - 0.3; },
  rayLive,
};
globalThis.GImpactSurfaces?.tagTable(M);
return __api;
};
