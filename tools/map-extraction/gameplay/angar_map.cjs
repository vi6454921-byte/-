const sh = require('./shared.cjs');
module.exports = {
  prelude: sh.prelude,
  overrides: { ...sh.overrides, initDoorPhysics: 'initDoorPhysics' },
  unoverride: ['registerGlass', 'explode'],
  roots: ['collectGlass', 'registerGlass', 'instanceGlass', 'ensureColor', 'initDestructiblePhysics', 'flushDestruction', 'bulletHit', 'explode', 'updateDoors', 'doorBlast', 'doorBulletHit', 'doorPose', 'doorWorld', 'DOOR_LEAVES', 'DOOR', 'AMMO_BOXES', 'HOOKS', 'DEST', 'PH', 'sheetQuat'],
  patches: [
    // the door body is kinematic: move the shared collider record instead of an ammo.js body
    [`L.body.getMotionState().setWorldTransform(tr);\n    L.body.setWorldTransform(tr);`, `__moveDoorBody(L.body, _dp, _dq);`],
    [`const tr = DOOR.tr;\n    tr.setIdentity();\n    PH.v1.setValue(_dp.x, _dp.y, _dp.z);\n    tr.setOrigin(PH.v1);\n    PH.q1.setValue(_dq.x, _dq.y, _dq.z, _dq.w);\n    tr.setRotation(PH.q1);\n`, ``],
  ],
  after: String.raw`
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
`,
  ending: () => String.raw`var __doorT = 0;
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
        if (L && Math.abs(L.target) < 0.1 && L.open === L.target) this.toggleDoor(L, s.ctrl.pos);
      }
    }
    updateDoors(dt); __debUpdate(dt);
  },
  indoor(x, z) { return Math.abs(x) < HW - 0.3 && Math.abs(z) < HD - 0.3; },
  rayLive,
};
return __api;`,
};
