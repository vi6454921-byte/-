/* Infrastructure checks only. These do NOT certify autonomous balance or gait. */
const assert = require("node:assert/strict"),
  fs = require("fs"),
  { environment } = require("./active-body-fixture.cjs");
(async () => {
  const { ctx, T, character, session } = await environment(),
    A = ctx.GActiveBody,
    results = [];
  for (const scale of [1, 0.966, 1.025, 0.988])
    for (const dt of [1 / 60, 1 / 30, 1 / 20]) {
      const p = session(),
        s = character({ scale, y: 2.025 });
      s.ctrl._physicsWorld = p.world;
      p.actor(s.ctrl);
      const r = A.attach(p, s);
      assert.equal(p.actors.size, 0, "no hidden character capsule");
      assert.equal(r.parts.length, 19);
      assert.equal(p.sim.impulseJoints.len(), 18);
      assert.equal(
        p.sim.multibodyJoints.len(),
        18,
        "all anatomical links are articulated",
      );
      assert.ok(
        r.parts.every((a) => a.body.isDynamic() && a.body.gravityScale() === 1),
      );
      const y0 = r.parts.reduce(
        (v, a) => v + (a.mass * a.body.worldCom().y) / r.mass,
        0,
      );
      let peak = 0;
      for (let n = 0; n < Math.round(0.4 / dt); n++) {
        p.begin(dt);
        assert.equal(r.support, 0);
        for (const a of r.parts)
          assert.ok(Object.values(a.body.translation()).every(Number.isFinite));
      }
      const yf = r.parts.reduce(
          (v, a) => v + (a.mass * a.body.worldCom().y) / r.mass,
          0,
        ),
        expected = 0.5 * 9.81 * 0.4 * 0.4;
      assert.ok(
        Math.abs(y0 - yf - expected) < 0.08,
        "COM falls under gravity; no invisible support " +
          JSON.stringify({ scale, dt, y0, yf, delta: y0 - yf, expected }),
      );
      for (let n = 0; n < Math.round(5 / dt); n++) {
        p.begin(dt);
        for (const a of r.parts) {
          const t = a.body.translation();
          assert.ok([t.x, t.y, t.z].every(Number.isFinite));
          peak = Math.max(peak, Math.abs(t.x), Math.abs(t.z));
          assert.ok(t.y > -0.3 && t.y < 5);
        }
      }
      assert.ok(peak < 10, "no numerical explosion on landing");
      for (const side of ["R", "L"]) {
        const a = r.byName["knee" + side],
          q = new T.Quaternion()
            .copy(a.parent.body.rotation())
            .invert()
            .multiply(new T.Quaternion().copy(a.body.rotation()));
        if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        const angle = 2 * Math.atan2(q.x, q.w);
        assert.ok(Math.hypot(q.y, q.z) < 0.03, "knee hinge does not twist");
        assert.ok(
          angle >= -2.8 && angle <= 0.15,
          "anatomical knee range " +
            JSON.stringify({ scale, dt, side, angle, q: q.toArray() }),
        );
      }
      for (const side of ["R", "L"]) {
        const a = r.byName["elbow" + side],
          q = new T.Quaternion()
            .copy(a.parent.body.rotation())
            .invert()
            .multiply(new T.Quaternion().copy(a.body.rotation()));
        if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        const angle = 2 * Math.atan2(q.y, q.w);
        assert.ok(Math.hypot(q.x, q.z) < 0.03, "elbow hinge does not twist");
        assert.ok(
          side === "R"
            ? angle >= -0.15 && angle <= 2.8
            : angle >= -2.8 && angle <= 0.15,
          "anatomical elbow range",
        );
      }
      A.captureAndApply(s, false);
      assert.ok(
        s.char.bones.every((a) =>
          a.quaternion.toArray().every(Number.isFinite),
        ),
      );
      assert.throws(() => p.actor(s.ctrl), /KCC/);
      assert.equal(p.actors.size, 0);
      const before = p.sim.bodies.len();
      p.servoPose(s, ["spine", "chest"]);
      ctx.GContacts.update(s, dt, true);
      assert.equal(p.sim.bodies.len(), before, "no second skeleton solver");
      assert.throws(() => A.impulse(s, { x: NaN, y: 0, z: 0 }), /finite/);
      A.detach(p, s);
      assert.equal(p.sim.bodies.len(), 0);
      assert.equal(p.sim.impulseJoints.len(), 0);
      assert.equal(p.sim.multibodyJoints.len(), 0, "articulation cleanup");
      assert.equal(A.stats(p).length, 0);
      assert.equal(s.ctrl._activeBody, null);
      results.push({
        scale,
        dt,
        dynamicParts: 19,
        COMfall: y0 - yf,
        expectedFreeFall: expected,
        peakHorizontal: peak,
        ownershipAndCleanup: true,
      });
      p.sim.free();
    }
  // All generated muscle wrenches are internal, including force lever arms.
  {
    const p = session(),
      s = character({ y: 4 });
    const r = A.attach(p, s);
    const f = new T.Vector3(),
      torque = new T.Vector3();
    A.beforeStep(p, 1 / 60);
    for (const a of r.parts) {
      const force = new T.Vector3().copy(a.body.userForce());
      f.add(force);
      torque
        .add(a.body.userTorque())
        .add(
          new T.Vector3().crossVectors(
            new T.Vector3().copy(a.body.worldCom()),
            force,
          ),
        );
    }
    assert.ok(f.length() < 1e-3);
    assert.ok(torque.length() < 1e-3);
    A.detach(p, s);
    p.sim.free();
    results.push({
      internalForceResidual: f.length(),
      internalTorqueResidual: torque.length(),
    });
  }
  // A wall beside a foot is not a supporting floor.
  {
    const p = session({
        ground: -10,
        colliders: [
          {
            type: "box",
            x0: 0.17,
            x1: 0.6,
            z0: -0.5,
            z1: 0.5,
            y0: 0,
            h: 3,
            _top: 3,
          },
        ],
      }),
      s = character();
    const r = A.attach(p, s);
    let sideContacts = 0;
    for (let n = 0; n < 20; n++) {
      p.begin(1 / 60);
      for (const a of r.parts.filter((a) => a.name.startsWith("ankle")))
        p.sim.contactPairsWith(a.col, (other) =>
          p.sim.contactPair(a.col, other, (m) => {
            if (Math.abs(m.normal().x) > 0.8 && m.numSolverContacts())
              sideContacts++;
          }),
        );
      assert.equal(r.support, 0, "wall is not a sole contact");
    }
    assert.ok(sideContacts > 0, "wall test actually touches a foot");
    A.detach(p, s);
    p.sim.free();
    results.push({ wallContacts: sideContacts, falseSupports: 0 });
  }
  // Capacity, session ownership, failed attach and repeated reset cleanup.
  {
    const p = session(),
      q = session(),
      s = character();
    const n = p.sim.bodies.len();
    const invalid = character();
    const bone = invalid.char.bone;
    invalid.char.bone = (k) => (k === "hips" ? null : bone(k));
    assert.throws(() => A.attach(p, invalid), /missing bone/);
    assert.equal(p.sim.bodies.len(), n);
    const r = A.attach(p, s);
    assert.equal(A.attach(p, s), r);
    assert.throws(() => A.attach(q, s), /another physics/);
    assert.throws(() => A.detach(q, s), /another physics/);
    A.detach(p, s);
    for (let n = 0; n < 50; n++) {
      A.attach(p, s);
      A.detach(p, s);
    }
    assert.equal(p.sim.bodies.len(), 0);
    assert.equal(p.sim.impulseJoints.len(), 0);
    assert.equal(p.sim.multibodyJoints.len(), 0, "articulation cleanup");
    const squad = [];
    for (let n = 0; n < 12; n++) {
      const a = character({ x: n * 2 - 12 });
      squad.push(a);
      A.attach(p, a);
    }
    assert.equal(new Set(squad.map((a) => A.get(a).group)).size, 12);
    assert.throws(() => A.attach(p, character()), /capacity/);
    for (const s of squad) A.detach(p, s);
    assert.equal(p.sim.bodies.len(), 0);
    assert.equal(p.sim.impulseJoints.len(), 0);
    assert.equal(p.sim.multibodyJoints.len(), 0, "articulation cleanup");
    A.attach(p, s);
    s.char = character().char;
    p.begin(1 / 60);
    assert.equal(A.get(s), null, "replaced character releases old body");
    assert.equal(p.sim.bodies.len(), 0);
    results.push({
      resets: 50,
      capacity: 12,
      foreignSessionRejected: true,
      characterReplacementCleanup: true,
    });
    p.sim.free();
    q.sim.free();
  }
  fs.writeFileSync(
    __dirname + "/active-body-core.json",
    JSON.stringify(
      {
        scope:
          "infrastructure only; balance, walking and getting up NOT certified",
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS active-body infrastructure:",
    results.length,
    "scenarios. NOT a balance/gait acceptance test.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
