const fs = require("fs"),
  vm = require("vm"),
  assert = require("node:assert/strict"),
  path = require("path");
const base = path.resolve(__dirname, "../..");
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
ctx.self = ctx.window = ctx;
vm.createContext(ctx);
const load = (p) =>
  vm.runInContext(fs.readFileSync(base + "/" + p, "utf8"), ctx, {
    filename: p,
  });
for (const p of [
  "js/lib/three.min.js",
  "js/polygon/02_util.js",
  "vendor/rapier/rapier.js",
  "js/advanced/profiler.js",
  "js/advanced/physics.js",
  "js/advanced/combat.js",
  "js/advanced/traversal.js",
  "js/advanced/tactics.js",
  "js/polygon/30_game_medic.js",
])
  load(p);
(async () => {
  await ctx.GPhysics.ready;
  const T = ctx.THREE,
    tests = [];
  const flat = () => ({
    bounds: { x0: -8, x1: 8, z0: -8, z1: 8 },
    heightAt: () => 0,
    colliders: [],
    blocked: () => false,
  });
  for (const dt of [1 / 60, 1 / 30, 1 / 20]) {
    const w = flat();
    w.colliders.push({
      type: "box",
      x0: -1,
      x1: 1,
      z0: -1.2,
      z1: -0.6,
      y0: 0,
      _top: 0.65,
    });
    const p = ctx.GPhysics.get(w),
      c = {
        pos: new T.Vector3(0, 0.025, 0),
        vel: new T.Vector3(),
        yaw: 0,
        stamina: 10,
        grounded: true,
        crouch: 0,
        prone: 0,
        PHYS: { sprint: 4 },
      };
    p.begin(dt);
    p.move(c, dt, -9.81);
    p.begin(dt);
    c.grounded = true;
    assert.ok(
      ctx.GTraversal.tryStart(c, w, { vaultMax: 1.3, stepUp: 0.32 }),
      "start low box",
    );
    let maxStep = 0,
      old = c.pos.clone();
    for (let i = 0; i < 180 && c.vault; i++) {
      p.begin(dt);
      ctx.GTraversal.update(c, w, dt);
      maxStep = Math.max(maxStep, c.pos.distanceTo(old));
      old.copy(c.pos);
      assert.ok(c.pos.toArray().every(Number.isFinite));
    }
    tests.push({
      test: "vault",
      dt,
      result: c._vaultResult,
      pos: c.pos.toArray(),
      maxStep,
    });
    assert.equal(c._vaultResult, "landed");
    assert.ok(c.pos.z < -1.4);
    assert.ok(maxStep < 0.35);
  }
  {
    const w = flat();
    w.colliders.push(
      { type: "box", x0: -1, x1: 1, z0: -1.2, z1: -0.6, y0: 0, _top: 0.65 },
      { type: "box", x0: -2, x1: 2, z0: -2, z1: 1, y0: 1.6, _top: 1.9 },
    );
    const p = ctx.GPhysics.get(w),
      c = {
        pos: new T.Vector3(0, 0.025, 0),
        vel: new T.Vector3(),
        yaw: 0,
        stamina: 10,
        grounded: true,
      };
    p.begin(1 / 60);
    assert.equal(
      ctx.GTraversal.tryStart(c, w, { vaultMax: 1.3, stepUp: 0.32 }),
      false,
    );
    tests.push({ test: "vault low ceiling", rejected: true });
  }
  {
    const w = flat(),
      p = ctx.GPhysics.get(w),
      key = {},
      q = new T.Quaternion(),
      pos = new T.Vector3(0, 2, 0),
      vel = new T.Vector3(1, -1, 0);
    p.dynamicObject(key, {
      pos,
      q,
      vel,
      radius: 0.032,
      mass: 0.4,
      restitution: 0.26,
    });
    for (let i = 0; i < 240; i++) {
      p.begin(1 / 60);
      p.readObject(key, pos, q, vel);
      assert.ok(pos.toArray().every(Number.isFinite));
      assert.ok(pos.y > -0.04);
    }
    assert.ok(pos.y < 0.15);
    p.removeObject(key);
    assert.equal(p.stats().dynamicObjects, 0);
    tests.push({
      test: "dynamic object ground and cleanup",
      pos: pos.toArray(),
    });
  }
  {
    const w = flat(),
      p = ctx.GPhysics.get(w),
      bone = new T.Bone(),
      s = { char: { bone: () => bone } };
    p.servoPose(s, ["spine"]);
    bone.rotation.x = 0.5;
    p.servoPose(s, ["spine"]);
    for (let i = 0; i < 120; i++) p.begin(1 / 60);
    const m = p.poseMotors.get(s).bones.get("spine");
    assert.ok(m.curr.angleTo(m.target) < 0.02, "PD settles");
    p.dropPose(s);
    assert.equal(p.stats().liveAngularMotors, 0);
    tests.push({ test: "angular PD convergence and cleanup" });
  }
  {
    const w = flat(),
      sold = (f, x, medic = false) => ({
        key: f + x,
        char: {
          preset: { faction: f },
          bone: () => ({ getWorldPosition: (out) => out.set(x, 1.2, 0) }),
        },
        ctrl: {
          pos: new T.Vector3(x, 0, 0),
          vel: new T.Vector3(),
          trait: { id: medic ? "medic" : "rifleman" },
        },
        dmg: { ph: { src: [] } },
      });
    const m = sold("a", 0, true),
      ally = sold("a", 2),
      enemy = sold("b", 1),
      other = sold("a", -0.5, true);
    ally.dmg.ph.src = [{ rate: 0.01 }];
    enemy.dmg.ph.src = [{ rate: 0.5 }];
    const med = {
      plan: (q) => ({ none: !q.dmg.ph.src.length, zone: "thorax" }),
      busy: () => false,
      cancel: () => {},
      start: () => true,
    };
    const t = ctx.GTactics.create({
      squad: [m, other, ally, enemy],
      world: w,
      med,
      THREE: T,
      PI: { pelvis: 0 },
    });
    ctx.GPhysics.get(w).begin(1 / 60);
    t.think(0, null);
    assert.equal(m.tac.target, ally);
    assert.equal(other.tac.target, null, "claims prevent duplicate medic");
    assert.notEqual(m.tac.target, enemy);
    t.think(0.21, m);
    assert.equal(m.tac.target, null, "active medic releases");
    tests.push({ test: "medical ally filter, claim and player priority" });
  }
  {
    const w = flat();
    w.blocked = (x, z, y, r) =>
      Math.abs(x - 0.55) < 0.025 + r && Math.abs(z) < 1.4 + r;
    const n = new ctx.GCombat.Navigation(w);
    n.cell = 1.1;
    assert.equal(
      n.clearLine({ x: 0, y: 0, z: 0 }, { x: 1.1, y: 0, z: 0 }, 0),
      false,
      "edge crosses thin fence",
    );
    tests.push({ test: "thin wall between free grid centers is blocked" });
  }
  {
    const w = flat();
    w.colliders.push({
      type: "box",
      x0: -1,
      x1: 1,
      z0: -1.2,
      z1: -0.6,
      y0: 0,
      _top: 0.65,
    });
    const p = ctx.GPhysics.get(w),
      c = {
        pos: new T.Vector3(0, 0.025, 0),
        vel: new T.Vector3(),
        yaw: 0,
        stamina: 10,
        grounded: true,
        crouch: 0,
        prone: 0,
      };
    p.begin(1 / 60);
    assert.ok(ctx.GTraversal.tryStart(c, w, { vaultMax: 1.3, stepUp: 0.32 }));
    p.sim.createCollider(
      ctx.RAPIER.ColliderDesc.cuboid(2, 2, 0.15)
        .setTranslation(0, 2, -1.55)
        .setCollisionGroups(0x0001000e),
    );
    for (let i = 0; i < 180 && c.vault; i++) {
      p.begin(1 / 60);
      ctx.GTraversal.update(c, w, 1 / 60);
    }
    assert.equal(c._vaultResult, "blocked");
    assert.ok(c.pos.z > -1.2, "does not teleport through new wall");
    tests.push({
      test: "vault aborts at new obstruction",
      pos: c.pos.toArray(),
    });
  }
  {
    const med = ctx.GMedic.create({}),
      m = {
        ctrl: {
          pos: new T.Vector3(),
          reload: -1,
          speed: 0,
          sprint: 0,
          trait: {},
        },
        dmg: { ph: { src: [] } },
      },
      q = {
        dead: true,
        ctrl: { pos: new T.Vector3(100, 0, 0) },
        dmg: {
          ph: {
            src: [
              {
                key: "test",
                rate: 4,
                art: true,
                comp: "limb",
                zone: "thigh",
                side: "L",
                dressed: 0,
              },
            ],
          },
        },
      };
    med.position = (s) => (s === q ? new T.Vector3(0.4, 0, 0) : s.ctrl.pos);
    assert.ok(med.start(m, q));
    med.update(0.1, [m, q], null);
    assert.ok(
      med.busy(m),
      "medical distance follows physical casualty rather than original spawn",
    );
    tests.push({ test: "treatment distance follows moved casualty" });
  }
  {
    const w = flat();
    w.colliders.push({
      type: "box",
      x0: 0.9,
      x1: 1.1,
      z0: -0.8,
      z1: 0.8,
      y0: 0,
      _top: 2,
    });
    w.blocked = (x, z, y, r) =>
      x > 0.9 - r && x < 1.1 + r && Math.abs(z) < 0.8 + r;
    const n = new ctx.GCombat.Navigation(w),
      a = { ctrl: { pos: { x: 2.8, y: 0, z: 0 } }, battle: {}, dead: false };
    n.request(a, { x: 0.5, y: 0, z: 0 }, 0);
    for (let k = 0; n.jobs.length && k < 100; k++) n.process(k * 0.02, 80);
    assert.equal(
      a.battle.pathState,
      "complete",
      "precise endpoint linked around occupied nearest grid node",
    );
    assert.ok(Math.abs(a.battle.path.at(-1).x - 0.5) < 1e-8);
    n.request(a, { x: 1, y: 0, z: 0 }, 3);
    assert.equal(a.battle.pathState, "unreachable");
    assert.equal(
      n.jobs.length,
      0,
      "invalid exact goal fails without 2200 expansions",
    );
    tests.push({ test: "exact endpoint links and fast unreachable result" });
  }
  {
    const w = flat();
    w.colliders.push(
      { type: "box", x0: -1, x1: 1, z0: -1.5, z1: -0.6, y0: 0, _top: 0.65 },
      { type: "box", x0: -1, x1: 1, z0: -1.25, z1: -1.05, y0: 1.3, _top: 1.55 },
    );
    const p = ctx.GPhysics.get(w),
      c = {
        pos: new T.Vector3(0, 0.025, 0),
        vel: new T.Vector3(),
        yaw: 0,
        stamina: 10,
        grounded: true,
      };
    p.begin(1 / 60);
    assert.equal(
      ctx.GTraversal.tryStart(c, w, { vaultMax: 1.3, stepUp: 0.32 }),
      false,
      "ceiling in middle of swept corridor",
    );
    tests.push({ test: "mid-corridor overhang rejected" });
  }
  {
    const w = flat(),
      source = { dead: false };
    w.colliders.push({
      type: "box",
      x0: -1,
      x1: 1,
      z0: -1.2,
      z1: -0.6,
      y0: 0,
      _top: 0.65,
      source,
    });
    const p = ctx.GPhysics.get(w),
      c = {
        pos: new T.Vector3(0, 0.025, 0),
        vel: new T.Vector3(),
        yaw: 0,
        stamina: 10,
        grounded: true,
      };
    p.begin(1 / 60);
    assert.ok(ctx.GTraversal.tryStart(c, w, { vaultMax: 1.3, stepUp: 0.32 }));
    source.dead = true;
    p.begin(1 / 60);
    ctx.GTraversal.update(c, w, 1 / 60);
    assert.equal(c._vaultResult, "support-lost");
    assert.equal(c._traversalHeight, undefined);
    assert.equal(c._vaultHands, null);
    tests.push({
      test: "destroyed support releases traversal and hand contacts",
    });
  }
  {
    const w = flat();
    w.colliders.push({
      type: "box",
      x0: -4,
      x1: 4,
      z0: -4,
      z1: 4,
      y0: 3,
      _top: 4,
    });
    w.colliders.push({
      type: "box",
      x0: -1,
      x1: 1,
      z0: -1.2,
      z1: -1,
      y0: 0,
      _top: 2,
    });
    const p = ctx.GPhysics.get(w);
    p.begin(1 / 60);
    assert.equal(
      p.ray({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: 1 }, 2),
      null,
      "roof must not occupy space below its underside",
    );
    const wall = p.ray({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: -1 }, 2, true);
    assert(
      wall && Math.abs(wall.timeOfImpact - 1) < 0.01,
      "wall still blocks weapon",
    );
    assert(
      p.ray({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, 2),
      "terrain participates normally",
    );
    assert.equal(
      p.ray({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, 2, true),
      null,
      "no-ground ray excludes only terrain",
    );
    assert(
      p.ray({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 1, z: 0 }, 2, true),
      "ceiling remains solid from below",
    );
    tests.push({ test: "roof underside and no-ground weapon ray filters" });
  }
  fs.writeFileSync(
    __dirname + "/continuation-results.json",
    JSON.stringify({ tests }, null, 2),
  );
  console.log(JSON.stringify({ tests }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
