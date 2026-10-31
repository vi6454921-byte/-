const fs = require("fs"),
  vm = require("vm"),
  assert = require("node:assert/strict"),
  path = require("path");
const base = path.resolve(__dirname, "../.."),
  ctx = {
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
for (const p of [
  "js/lib/three.min.js",
  "vendor/rapier/rapier.js",
  "js/advanced/physics.js",
  "js/advanced/contacts.js",
])
  vm.runInContext(fs.readFileSync(path.join(base, p), "utf8"), ctx, {
    filename: p,
  });
(async () => {
  await ctx.GPhysics.ready;
  const T = ctx.THREE,
    results = [];
  for (const dt of [1 / 60, 1 / 30, 1 / 20]) {
    const w = {
      heightAt: () => 0,
      bounds: { x0: -5, x1: 5, z0: -5, z1: 5 },
      colliders: [
        {
          type: "box",
          x0: 0.65,
          x1: 0.85,
          z0: -0.4,
          z1: 0.4,
          y0: 0.8,
          _top: 1.8,
        },
      ],
    };
    const p = ctx.GPhysics.get(w),
      root = new T.Group(),
      bones = {};
    function b(n, pa, x, y, z) {
      const bone = new T.Bone();
      bone.name = n;
      bone.position.set(x, y, z);
      (bones[pa] || root).add(bone);
      bones[n] = bone;
    }
    b("hips", null, 0, 1, 0);
    b("spine", "hips", 0, 0.16, 0);
    b("chest", "spine", 0, 0.18, 0);
    b("neck", "chest", 0, 0.22, 0);
    b("head", "neck", 0, 0.12, 0);
    for (const S of ["R", "L"]) {
      const s = S === "R" ? 1 : -1;
      b("clav" + S, "chest", s * 0.08, 0.14, 0);
      b("shoulder" + S, "clav" + S, s * 0.1, 0, 0);
      b("elbow" + S, "shoulder" + S, s * 0.28, 0, 0);
      b("wrist" + S, "elbow" + S, s * 0.25, 0, 0);
      b("hip" + S, "hips", s * 0.09, -0.06, 0);
      b("knee" + S, "hip" + S, 0, -0.43, 0);
      b("ankle" + S, "knee" + S, 0, -0.42, 0);
      b("toe" + S, "ankle" + S, 0, 0, -0.12);
    }
    const s = {
      char: { root, bone: (n) => bones[n] },
      ctrl: { _physicsWorld: w, pos: new T.Vector3(), vel: new T.Vector3() },
      contactMode: "full",
    };
    let maxContacts = 0,
      maxJointGap = 0,
      minDist = 0,
      maxAngle = 0;
    for (let i = 0; i < Math.round(4 / dt); i++) {
      for (const b of Object.values(bones)) b.quaternion.identity();
      root.updateMatrixWorld(true);
      ctx.GContacts.update(s, dt);
      p.begin(dt);
      maxContacts = Math.max(maxContacts, s.contactDebug.contacts);
      maxAngle = Math.max(maxAngle, s.contactDebug.maxAngle);
      const rig = [...[]]; // Inspect actual Rapier spherical joint endpoints, not animation target errors.
      p.sim.impulseJoints.forEach((j) => {
        const a = j.body1(),
          b = j.body2(),
          pa = new T.Vector3()
            .copy(j.anchor1())
            .applyQuaternion(new T.Quaternion().copy(a.rotation()))
            .add(new T.Vector3().copy(a.translation())),
          pb = new T.Vector3()
            .copy(j.anchor2())
            .applyQuaternion(new T.Quaternion().copy(b.rotation()))
            .add(new T.Vector3().copy(b.translation()));
        maxJointGap = Math.max(maxJointGap, pa.distanceTo(pb));
      });
      p.sim.colliders.forEach((c) => {
        p.sim.contactPairsWith(c, (o) =>
          p.sim.contactPair(c, o, (m) => {
            for (let j = 0; j < m.numContacts(); j++) {
              if (i * dt > 0.75) minDist = Math.min(minDist, m.contactDist(j));
            }
          }),
        );
      });
      for (const bone of Object.values(bones))
        assert.ok(bone.quaternion.toArray().every(Number.isFinite));
    }
    console.log({ dt, maxContacts, maxJointGap, minDist, maxAngle });
    assert.ok(maxContacts > 0, "dynamic body contacts scenery");
    assert.ok(maxJointGap < 0.09, "coupled joints remain attached");
    assert.ok(minDist > -0.09, "bounded penetration");
    ctx.GContacts.drop(p, s);
    assert.equal(ctx.GContacts.stats(p).segments, 0);
    assert.equal(
      p.sim.bodies.len(),
      0,
      "all contact bodies and joints removed",
    );
    assert.equal(p.sim.impulseJoints.len(), 0);
    results.push({ dt, maxContacts, maxJointGap, minDist, maxAngle });
  }
  fs.writeFileSync(
    path.join(__dirname, "contact-rig.json"),
    JSON.stringify({ pass: true, results }, null, 2),
  );
  console.log(JSON.stringify({ pass: true, results }));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
