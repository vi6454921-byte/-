const fs = require("fs"),
  vm = require("vm"),
  assert = require("node:assert/strict"),
  path = require("path");
const base = path.resolve(__dirname, "../..");
(async () => {
  const ctx = {
    console,
    performance,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    Float32Array,
    Uint32Array,
    WebAssembly,
    Buffer,
    atob,
    btoa,
    setTimeout,
    clearTimeout,
  };
  ctx.self = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of [
    "js/lib/three.min.js",
    "vendor/rapier/rapier.js",
    "js/advanced/physics.js",
  ])
    vm.runInContext(fs.readFileSync(path.join(base, f), "utf8"), ctx, {
      filename: f,
    });
  await ctx.GPhysics.ready;
  const T = ctx.THREE,
    R = ctx.RAPIER,
    rows = [];
  const world = (colliders = []) => ({
    bounds: { x0: -60, x1: 60, z0: -10, z1: 10 },
    heightAt: () => 0,
    colliders,
  });
  const box = (x0, x1, z0, z1, y0, top) => ({
    type: "box",
    x0,
    x1,
    z0,
    z1,
    y0,
    _top: top,
  });
  const opts = (pos, vel) => ({
    pos: new T.Vector3(...pos),
    vel: new T.Vector3(...vel),
    q: new T.Quaternion(),
    spin: new T.Vector3(9, 13, -7),
    mass: 0.006,
    radius: 0.0046,
    capsule: 0.0149,
    colliderRotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 },
    collisionGroups: 0x00100001,
    kind: "brass",
    reportContacts: true,
    softCcdPrediction: 0.1,
    friction: 0.65,
    restitution: 0.28,
    drag: 0.08,
    angularDamping: 0.6,
    contactAngularDamping: 8,
    settleRadius: 0.0195,
  });
  for (const shape of ["brass", "magazine"])
    for (const dt of [1 / 60, 1 / 30, 1 / 20])
      for (const kind of ["ground", "platform", "wall"]) {
        const p = ctx.GPhysics.get(
          world(
            kind === "platform"
              ? [box(-3, 3, -3, 3, 0, 2)]
              : kind === "wall"
                ? [box(1, 1.3, -3, 3, 0, 3)]
                : [],
          ),
        );
        const k = {},
          y = kind === "platform" ? 3 : 1.5,
          options = opts(
            [0, y, 0],
            kind === "wall" ? [30, 1, 0] : [0.6, 0.5, 0],
          );
        if (shape === "magazine") {
          Object.assign(options, {
            halfExtents: { x: 0.04, y: 0.12, z: 0.025 },
            kind: "magazine",
            mass: 0.33,
            settleRadius: 0.13,
            contactAngularDamping: 4,
            softCcdPrediction: 0.15,
          });
          delete options.colliderRotation;
        }
        const o = p.resetObject(k, options);
        if (shape === "brass")
          assert(Math.abs(o.col.shape.halfHeight - 0.0149) < 1e-6);
        else assert(Math.abs(o.col.shape.halfExtents.y - 0.12) < 1e-6);
        assert.equal(o.col.collisionGroups(), 0x00100001);
        const axis = new T.Vector3(0, 1, 0).applyQuaternion(
          new T.Quaternion().copy(o.col.rotation()),
        );
        if (shape === "brass") assert(Math.abs(axis.x) > 0.99);
        let minY = Infinity,
          maxX = -Infinity,
          steps = 0;
        for (let t = 0; t < 10; t += dt) {
          p.begin(dt);
          steps++;
          const v = o.body.translation();
          assert([v.x, v.y, v.z].every(Number.isFinite));
          minY = Math.min(minY, v.y);
          maxX = Math.max(maxX, v.x);
        }
        const end = o.body.translation();
        assert(o.impacts > 0, kind + " no contact");
        assert(o.body.isSleeping(), kind + " not asleep");
        assert(
          minY > (kind === "platform" ? 1.985 : -0.015),
          JSON.stringify({ shape, kind, dt, minY, end, maxX }),
        );
        if (kind === "wall") assert(maxX < 1.025, "CCD tunneled through wall");
        const out = new T.Vector3(),
          q = new T.Quaternion();
        p.readObject(k, out, q);
        assert(out.distanceTo(new T.Vector3().copy(end)) < 1e-4);
        const impacts = o.impacts;
        const bodies = p.sim.bodies.len(),
          col = p.sim.colliders.len();
        p.disableObject(k);
        assert(!o.body.isEnabled());
        const reuse = p.resetObject(k, opts([-0.5, y, 0], [0, 0, 0]));
        assert.equal(reuse, o);
        assert.equal(p.sim.bodies.len(), bodies);
        assert.equal(p.sim.colliders.len(), col);
        assert.equal(o.impacts, 0);
        assert(o.body.isEnabled());
        p.removeObject(k);
        assert.equal(p.sim.bodies.len(), 0);
        assert.equal(p.objects.size, 0);
        rows.push({
          shape,
          kind,
          dt,
          steps,
          end,
          minY,
          maxX,
          contacts: impacts,
          passed: true,
        });
        p.sim.free();
      }
  // Sleeping magazines must wake and fall if their real support is destroyed.
  const source = { dead: false },
    support = box(-3, 3, -3, 3, 0, 2);
  support.source = source;
  const wake = ctx.GPhysics.get(world([support])),
    wakeKey = {},
    wo = opts([0, 3, 0], [0, 0, 0]);
  Object.assign(wo, {
    halfExtents: { x: 0.04, y: 0.12, z: 0.025 },
    kind: "magazine",
    mass: 0.33,
    settleRadius: 0.13,
    contactAngularDamping: 4,
    softCcdPrediction: 0.15,
  });
  delete wo.colliderRotation;
  const supported = wake.resetObject(wakeKey, wo);
  for (let i = 0; i < 600; i++) wake.begin(1 / 60);
  assert(supported.body.isSleeping());
  assert(supported.body.translation().y > 2);
  source.dead = true;
  for (let i = 0; i < 180; i++) wake.begin(1 / 60);
  assert(
    supported.body.translation().y < 0.2,
    "did not fall after support removal",
  );
  wake.removeObject(wakeKey);
  wake.sim.free();
  // No support: never force sleep on low instantaneous airborne velocity.
  const airWorld = world();
  airWorld.heightAt = () => -100;
  const air = ctx.GPhysics.get(airWorld),
    airKey = {},
    fall = air.resetObject(airKey, opts([0, 5, 0], [0, 0, 0]));
  for (let i = 0; i < 120; i++) air.begin(1 / 60);
  assert(!fall.body.isSleeping());
  assert.equal(fall.settleFrames, 0);
  assert(fall.body.translation().y < -10);
  air.removeObject(airKey);
  air.sim.free();
  // An actor-group obstacle must not block visual-only brass.
  const p = ctx.GPhysics.get(world());
  p.sim.createCollider(
    R.ColliderDesc.cuboid(0.1, 2, 3)
      .setTranslation(1, 1, 0)
      .setCollisionGroups(0x0002000f),
  );
  const k = {},
    o = p.resetObject(k, opts([0, 1.5, 0], [5, 0, 0]));
  for (let i = 0; i < 30; i++) p.begin(1 / 60);
  assert(o.body.translation().x > 1.5);
  p.removeObject(k);
  // Warm 26 slots, recycle 2,600 times, and fully tear down.
  const keys = Array.from({ length: 26 }, () => ({}));
  for (const key of keys) {
    p.resetObject(key, opts([0, 1, 0], [1, 2, 0]));
    p.disableObject(key);
  }
  const counts = [p.sim.bodies.len(), p.sim.colliders.len()];
  for (let i = 0; i < 2600; i++) {
    const key = keys[i % 26];
    p.resetObject(key, opts([0, 1, 0], [1, 2, 0]));
    p.begin(1 / 60);
    p.disableObject(key);
    assert.equal(p.sim.bodies.len(), counts[0]);
    assert.equal(p.sim.colliders.len(), counts[1]);
  }
  assert.equal(p.stats().brassPool.allocated, 26);
  assert.equal(p.stats().brassPool.active, 0);
  for (const key of keys) p.removeObject(key);
  assert.equal(p.objects.size, 0);
  assert.equal(p.sim.bodies.len(), 0);
  p.sim.free();
  const result = {
    pass: true,
    rows,
    actorFilter: true,
    airborneNoFreeze: true,
    removedSupportWake: true,
    reuses: 2600,
    poolCapacity: 26,
    fullCleanup: true,
  };
  fs.writeFileSync(
    path.join(__dirname, "brass.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
