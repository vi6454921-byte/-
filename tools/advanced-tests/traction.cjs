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
vm.runInContext(`{ let seed=0x41454749; Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}; }`,ctx);
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
  const T = ctx.THREE;
  vm.runInContext(
    fs
      .readFileSync(base + "/js/polygon/23_game_damage.js", "utf8")
      .replace("DM._sim = sim;", "DM._testCollapse = die; DM._sim = sim;"),
    ctx,
  );
  const DM = ctx.GDamage.create(T),
    fixtures = JSON.parse(
      fs.readFileSync(base + "/tools/rig-tests/soldiers.json"),
    ),
    rows = [];
  for (const d of fixtures)
    for (const dt of [1 / 60, 1 / 30, 1 / 20]) {
      const w = {
          bounds: { x0: -15, x1: 15, z0: -15, z1: 15 },
          heightAt: () => 0,
          blocked: () => false,
          colliders: [],
        },
        physics = ctx.GPhysics.get(w),
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
      group.updateMatrixWorld(true);
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
      for (let i = 0; i < 3 / dt; i++) {
        physics.begin(dt);
        DM.ragdoll(s, dt);
      }
      const PI = DM.PI,
        pelvis = PI.pelvis * 3,
        start = s.rd.p[pelvis],
        targets = {};
      for (const side of ["R", "L"]) {
        const i = PI["shoulder" + side] * 3;
        targets[side] = {
          x: s.rd.p[i],
          y: s.rd.p[i + 1] + 0.16,
          z: s.rd.p[i + 2],
        };
      }
      let maxSpeed = 0,
        maxError = 0,
        held = 0,
        maxGap = 0,
        gripError=0;
      for (let i = 0; i < 6 / dt; i++) {
        // Match the actual medic: stop advancing when grip error grows, allowing
        // the physical body to catch up instead of driving a synthetic anchor away.
        if(gripError<.65)for (const t of Object.values(targets)) t.x += 0.28 * dt;
        const result = physics.pullCasualty(s, targets, dt, PI);
        gripError=result.maxError;
        if (result.held) held++;
        maxError = Math.max(maxError, result.maxError);
        physics.begin(dt);
        DM.ragdoll(s, dt);
        for (const b of physics.ragdolls.get(s).bodies) {
          const v = b.linvel();
          maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.y, v.z));
          assert.ok([v.x, v.y, v.z].every(Number.isFinite));
        }
        physics.sim.impulseJoints.forEach((j) => {
          if (
            j.type() !== ctx.RAPIER.JointType.Revolute &&
            j.type() !== ctx.RAPIER.JointType.Spherical
          )
            return;
          const a = j.body1(),
            b = j.body2(),
            p = new T.Vector3()
              .copy(j.anchor1())
              .applyQuaternion(new T.Quaternion().copy(a.rotation()))
              .add(new T.Vector3().copy(a.translation())),
            q = new T.Vector3()
              .copy(j.anchor2())
              .applyQuaternion(new T.Quaternion().copy(b.rotation()))
              .add(new T.Vector3().copy(b.translation()));
          maxGap = Math.max(maxGap, p.distanceTo(q));
        });
      }
      const moved = s.rd.p[pelvis] - start;
      console.log({ key: d.key, dt, moved, maxSpeed, maxError, maxGap, held });
      assert.ok(moved > 0.5, "physical traction translates casualty");
      assert.ok(maxSpeed < 5, "bounded drag energy");
      assert.ok(maxGap < 0.12, "joints attached while dragging");
      const before = physics.ragdolls
        .get(s)
        .groups.map((g) => ({ ...g.body.linvel() }));
      const broken = physics.pullCasualty(
        s,
        { R: { x: 100, y: 100, z: 100 }, L: { x: 100, y: 100, z: 100 } },
        dt,
        PI,
      );
      assert.equal(broken.held, false);
      assert.deepEqual(
        physics.ragdolls.get(s).groups.map((g) => ({ ...g.body.linvel() })),
        before,
        "broken grip applies no partial impulses",
      );
      DM.revive(s);
      physics.begin(dt);
      assert.equal(physics.stats().ragdolls, 0);
      rows.push({ key: d.key, dt, moved, maxSpeed, maxError, maxGap, held });
    }
  fs.writeFileSync(
    __dirname + "/traction.json",
    JSON.stringify({ pass: true, seed:"0x41454749",policy:"pause target advance above .65m grip error, matching in-game medic",rows }, null, 2),
  );
  console.log(JSON.stringify({ pass: true, rows }));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
