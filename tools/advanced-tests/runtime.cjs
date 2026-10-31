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
])
  load(p);
(async () => {
  await ctx.GPhysics.ready;
  let checks = 0;
  const ok = (x, msg) => {
    assert.ok(x, msg);
    checks++;
  };
  const T = ctx.THREE;
  const { Heap, Action, Sequence, Selector, Status, Navigation } =
    ctx.GCombat.test;
  const h = new Heap();
  for (let i = 999; i >= 0; i--) h.push({ f: (i * 37) % 1000 });
  let last = -1;
  while (h.a.length) {
    const v = h.pop().f;
    ok(v >= last, "heap order");
    last = v;
  }
  let visits = 0;
  const fail = new Action(() => Status.Failure),
    yes = new Action(() => {
      visits++;
      return Status.Success;
    });
  ok(
    new Sequence([fail, yes]).tick({}) === Status.Failure && visits === 0,
    "sequence short circuit",
  );
  ok(
    new Selector([yes, yes]).tick({}) === Status.Success && visits === 1,
    "selector priority",
  );
  const flat = () => ({
    bounds: { x0: -12, x1: 12, z0: -12, z1: 12 },
    heightAt: () => 0,
    colliders: [],
    blocked: () => false,
  });
  const world = flat();
  world.colliders.push({
    type: "box",
    x0: 1,
    x1: 1.4,
    z0: -3,
    z1: 3,
    y0: 0,
    _top: 3,
  });
  world.blocked = (x, z, y, r) =>
    x > 1 - r && x < 1.4 + r && Math.abs(z) < 3 + r;
  const session = ctx.GPhysics.get(world),
    ctrl = {
      pos: new T.Vector3(0, 0, 0),
      vel: new T.Vector3(2, 0, 0),
      grounded: true,
      crouch: 0,
      prone: 0,
    };
  for (let i = 0; i < 180; i++) {
    session.begin(1 / 60);
    ctrl.vel.x = 2;
    session.move(ctrl, 1 / 60, -9.81);
  }
  ok(ctrl.pos.x < 0.72 && ctrl.pos.x > 0.4, "capsule stops at wall");
  ok(Math.abs(ctrl.pos.y) < 0.08, "ground stable");
  const walker = {
    ctrl: { pos: { x: -4, y: 0, z: 0 } },
    battle: {},
    char: { preset: { faction: "delta" } },
  };
  const nav = new Navigation(world);
  nav.request(walker, { x: 5, y: 0, z: 0 }, 0);
  let n = 0;
  while (nav.jobs.length && n++ < 100) {
    const before = nav.expanded;
    nav.process(n * 0.02, 80);
    ok(nav.expanded - before <= 80, "A* step budget");
  }
  ok(walker.battle.path.length > 0, "route found");
  ok(
    walker.battle.path.some((p) => Math.abs(p.z) > 3),
    "route around wall",
  );
  function soldier(key, team, x, z, yaw) {
    const c = {
      pos: new T.Vector3(x, 0, z),
      yaw,
      pitch: 0,
      ammo: 20,
      reserve: 60,
      reload: -1,
      canFire: () => true,
      fire() {
        this.ammo--;
      },
      startReload() {
        this.reload = 1;
      },
    };
    return {
      key,
      char: { preset: { faction: team } },
      ctrl: c,
      gun: {},
      idleYaw: yaw,
      formYaw: yaw,
    };
  }
  const squad = [
      soldier("a", "delta", 0, 0, 0),
      soldier("b", "alpha", 0, -20, Math.PI),
    ],
    open = flat();
  let visible = true;
  const ai = ctx.GCombat.create({
    THREE: T,
    world: open,
    squad,
    visible: () => visible,
  });
  function tick(t) {
    ai.update(t, null);
    for (const s of squad) ai.drive(s, 1 / 60, t, null);
    ai.fire(t);
  }
  for (let i = 0; i < 120; i++) tick(i / 60);
  ok(ai.stats().shots > 0, "BT engages visible hostile");
  const memory = squad[0].battle.memory.x;
  visible = false;
  squad[1].ctrl.pos.x = 9;
  for (let i = 120; i < 220; i++) tick(i / 60);
  ok(
    squad[0].battle.memory.x === memory,
    "occluded target position is not tracked",
  );
  const shots = ai.stats().shots;
  for (let i = 220; i < 300; i++) tick(i / 60);
  ok(ai.stats().shots === shots, "no firing through occlusion");
  const behind = [
    soldier("a", "delta", 0, 0, 0),
    soldier("b", "alpha", 0, 30, Math.PI),
  ];
  const blind = ctx.GCombat.create({
    THREE: T,
    world: open,
    squad: behind,
    visible: () => true,
  });
  blind.drive(behind[0], 1 / 60, 0, null);
  ok(!behind[0].battle.memory, "vision cone rejects behind target");
  const pals = [
    soldier("a", "delta", 0, 0, 0),
    soldier("friend", "delta", 0, -5, 0),
    soldier("b", "alpha", 0, -20, Math.PI),
  ];
  const safe = ctx.GCombat.create({
    THREE: T,
    world: open,
    squad: pals,
    visible: () => true,
  });
  for (let i = 0; i < 120; i++) {
    safe.update(i / 60, null);
    safe.drive(pals[0], 1 / 60, i / 60, null);
    safe.fire(i / 60);
  }
  ok(pals[0].ctrl.ammo === 20, "friendly corridor blocks shot");
  const bridge = [
    soldier("under", "delta", 0, 0, 0),
    soldier("on-bridge", "delta", 0, -8, 0),
    soldier("enemy", "alpha", 0, -18, 0),
  ];
  bridge[1].ctrl.pos.y = 3;
  const below = ctx.GCombat.create({
    THREE: T,
    world: open,
    squad: bridge,
    visible: () => true,
  });
  for (let i = 0; i < 240; i++) {
    below.update(i / 60, null);
    below.drive(bridge[0], 1 / 60, i / 60, null);
    below.fire(i / 60);
  }
  ok(
    bridge[0].ctrl.ammo < 20,
    "ally on another floor must not block a lower firing corridor",
  );
  const candidates = [
    soldier("observer", "delta", 0, 0, 0),
    soldier("hidden", "alpha", 0, -12, 0),
    soldier("visible", "alpha", 4, -16, 0),
  ];
  const multi = ctx.GCombat.create({
    THREE: T,
    world: open,
    squad: candidates,
    visible: (_from, to) => Math.abs(to.x) > 1,
  });
  multi.drive(candidates[0], 1 / 60, 0, null);
  ok(
    candidates[0].battle.target === candidates[2],
    "occluded nearest does not hide visible alternative",
  );
  const activeAmmo = candidates[0].ctrl.ammo;
  multi.update(1, candidates[0]);
  multi.drive(candidates[0], 1 / 60, 1, candidates[0]);
  multi.fire(1);
  ok(
    candidates[0].ctrl.ammo === activeAmmo,
    "active player excluded from AI fire",
  );
  const empty = [
    soldier("empty", "delta", 0, 0, 0),
    soldier("hostile", "alpha", 0, -20, 0),
  ];
  empty[0].ctrl.ammo = 0;
  const reload = ctx.GCombat.create({
    THREE: T,
    world: open,
    squad: empty,
    visible: () => true,
  });
  reload.drive(empty[0], 1 / 60, 0, null);
  ok(
    empty[0].ctrl.reload >= 0 && empty[0].battle.mode === "reload",
    "reload branch priority",
  );

  let damage = fs
    .readFileSync(base + "/js/polygon/23_game_damage.js", "utf8")
    .replace("DM._sim = sim;", "DM._testCollapse = die; DM._sim = sim;");
  vm.runInContext(damage, ctx);
  const DM = ctx.GDamage.create(T),
    fixtures = JSON.parse(
      fs.readFileSync(base + "/tools/rig-tests/soldiers.json"),
    );
  const corpses = [];
  for (const d of fixtures)
    for (const dt of [1 / 60, 1 / 30, 1 / 20])
      for (const slope of [0, -0.12, 0.12]) {
        const w = flat();
        w.heightAt = (x, z) => z * slope;
        const physics = ctx.GPhysics.get(w),
          group = new T.Group();
        new T.Matrix4()
          .fromArray(d.root)
          .decompose(group.position, group.quaternion, group.scale);
        const bones = {};
        for (const b of d.bones) {
          const bone = new T.Bone();
          const m = new T.Matrix4()
            .fromArray(d.root)
            .invert()
            .multiply(new T.Matrix4().fromArray(b.world));
          m.decompose(bone.position, bone.quaternion, bone.scale);
          group.add(bone);
          bones[b.name] = bone;
        }
        group.updateMatrixWorld(true); // Sloped collision mesh is built before dynamics start.
        const s = {
          char: {
            root: group,
            bone: (n) => bones[n],
            boneIndex: d.boneIndex,
            rest: d.rest,
            scale: d.scale,
            meshes: {},
          },
          ctrl: {
            pos: group.position.clone(),
            vel: new T.Vector3(),
            groundAt: w.heightAt,
            crouch: 0,
            yaw: 0,
            _physicsWorld: w,
          },
          dmg: {},
          deathFatal: true,
        };
        DM._testCollapse(
          s,
          bones.head.getWorldPosition(new T.Vector3()),
          new T.Vector3(0, 0, -1),
          "head",
          { quiet: true },
        );
        const PI = DM.PI;
        const pairs = [
          ["shoulderR", "elbowR"],
          ["elbowR", "wristR"],
          ["hipR", "kneeR"],
          ["kneeR", "ankleR"],
          ["shoulderL", "elbowL"],
          ["elbowL", "wristL"],
          ["hipL", "kneeL"],
          ["kneeL", "ankleL"],
        ];
        const length = (a, b) =>
          Math.hypot(
            ...[0, 1, 2].map(
              (k) => s.rd.p[PI[a] * 3 + k] - s.rd.p[PI[b] * 3 + k],
            ),
          );
        const rest = pairs.map(([a, b]) => length(a, b));
        let maxAngularError = 0;
        let maxJointError = 0,
          max = 0;
        for (let i = 0; i < 10 / dt; i++) {
          physics.begin(dt);
          DM.ragdoll(s, dt);
          const physical = physics.ragdolls.get(s);
          for (const limit of physical.limits) {
            const rel = new T.Quaternion()
                .copy(limit.a.rotation())
                .invert()
                .multiply(new T.Quaternion().copy(limit.b.rotation())),
              a =
                2 *
                Math.atan2(
                  rel.x * limit.axis.x +
                    rel.y * limit.axis.y +
                    rel.z * limit.axis.z,
                  rel.w,
                ),
              angle = Math.atan2(Math.sin(a), Math.cos(a));
            maxAngularError = Math.max(
              maxAngularError,
              limit.min - angle,
              angle - limit.max,
            );
          }
          for (const v of s.rd.p) {
            ok(Number.isFinite(v), "finite ragdoll");
            max = Math.max(max, Math.abs(v));
          }
          for (let j = 0; j < pairs.length; j++)
            maxJointError = Math.max(
              maxJointError,
              Math.abs(length(...pairs[j]) - rest[j]),
            );
        }
        ok(max < 30, "ragdoll bounded");
        ok(physics.stats().bodies >= 11, "articulated rigid bodies created");
        ok(maxJointError < 0.12, "bone length stability");
        ok(maxAngularError < 0.25, "hinge angular limits stable");
        const pelvis = DM.PI.pelvis * 3,
          oldX = s.rd.p[pelvis];
        ctx.GPhysics.translate(s, 0.04, 0, 0);
        for (const a of [s.rd.p, s.rd.pp])
          for (let k = 0; k < a.length; k += 3) a[k] += 0.04;
        physics.begin(dt);
        DM.ragdoll(s, dt);
        ok(
          Math.abs(s.rd.p[pelvis] - oldX - 0.04) < 0.06,
          "small medical drag preserved",
        );
        corpses.push({
          key: d.key,
          dt,
          slope,
          sleep: s.rd.sleep,
          max,
          maxJointError,
          maxAngularError,
        });
        DM.revive(s);
        physics.begin(dt);
        ok(physics.stats().ragdolls === 0, "revive cleans Rapier bodies");
      }
  const result = { checks, physics: session.stats(), ai: ai.stats(), corpses };
  fs.writeFileSync(
    base + "/tools/advanced-tests/results.json",
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        checks,
        corpses: corpses.length,
        shots: ai.stats().shots,
        physics: session.stats(),
      },
      null,
      2,
    ),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
