/* Shared AEGIS physics bridge injected into every extracted map builder.
   Replaces the ammo.js bodies of the standalone map pages by plain collider
   records (box with centre/half-extents/quaternion). The AEGIS adapter
   (js/app/maps.js) turns them into Rapier colliders; `dead` removes them. */
module.exports.prelude = String.raw`
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
`;
module.exports.overrides = Object.fromEntries(['PH','registerOwner','GRP','SURF_CODE','SURF_NAME','addStaticCollider','addStaticCompound','removeBody','blastImpulse','pokeCloth','rayFirst','rayAll','addDynamic','SND','FXS','impactFX'].map(n=>[n,n]));
