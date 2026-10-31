const g = __GAME, w = g.world, C = g._C, T = THREE;
const out = [];
for (const L of w.doors.slice(0, 4)) {
  const c = L.c, n = L.n;
  const from = new T.Vector3(c.x + n.x * 1.5, (L.d.y || 0) + 1.2, c.z + n.z * 1.5);
  const dir = new T.Vector3(-n.x, 0, -n.z).normalize();
  const r = new T.Raycaster(from, dir, 0, 3);
  const h = C.traceRay(r);
  out.push({ i: L.i, c: [c.x, c.y, c.z].map(v => +v.toFixed(2)), n: [n.x, n.z].map(v => +v.toFixed(2)), open: L.open, target: L.target,
    hit: h ? { name: h.object.name, type: h.object.type, ud: Object.keys(h.object.userData || {}), mat: h.object.userData && h.object.userData.mat, d: +h.distance.toFixed(3), exit: h.exitDistance, inst: h.instanceId, parent: h.object.parent && h.object.parent.name } : null });
}
return out;
