/* Numerical robustness only. Falling is allowed; this is NOT get-up acceptance. */
const assert = require("node:assert/strict"),
  fs = require("node:fs");
const { environment } = require("./active-body-fixture.cjs");
(async () => {
  const { ctx, session, character, T } = await environment(),
    A = ctx.GActiveBody,
    rows = [];
  const scenarios = [
    { name: "forward_60Ns", impulse: { x: 0, y: 0, z: -60 } },
    { name: "backward_60Ns", impulse: { x: 0, y: 0, z: 60 } },
    { name: "lateral_100Ns", impulse: { x: 100, y: 0, z: 0 } },
    { name: "diagonal_100Ns", impulse: { x: 70.71, y: 0, z: -70.71 } },
    { name: "airborne_2m", y: 2.025 },
  ];
  for (const c of scenarios) {
    const p = session(),
      s = character({ y: c.y ?? 0.025 }),
      r = A.attach(p, s);
    let maxGap = 0,
      maxTilt = 0,
      finiteSamples = 0;
    const va = new T.Vector3(),
      vb = new T.Vector3(),
      qa = new T.Quaternion(),
      qb = new T.Quaternion();
    for (let i = 0; i < 720; i++) {
      if (i === 90 && c.impulse) A.impulse(s, c.impulse);
      p.begin(1 / 60);
      maxTilt = Math.max(maxTilt, r.tilt);
      for (const a of r.parts) {
        const at = a.body.translation(),
          q = a.body.rotation();
        assert.ok(
          [
            ...Object.values(at),
            ...Object.values(q),
            ...Object.values(a.body.linvel()),
            ...Object.values(a.body.angvel()),
          ].every(Number.isFinite),
          c.name + " stays finite",
        );
        assert.ok(
          Math.max(Math.abs(at.x), Math.abs(at.z)) < 50 &&
            at.y > -0.5 &&
            at.y < 10,
          c.name + " stays bounded",
        );
        finiteSamples++;
        if (a.parent) {
          va.copy(a.joint.anchor1())
            .applyQuaternion(qa.copy(a.parent.body.rotation()))
            .add(a.parent.body.translation());
          vb.copy(a.joint.anchor2())
            .applyQuaternion(qb.copy(a.body.rotation()))
            .add(at);
          maxGap = Math.max(maxGap, va.distanceTo(vb));
        }
      }
    }
    assert.ok(maxGap < 0.25, c.name + " keeps joints connected " + maxGap);
    rows.push({
      name: c.name,
      durationSeconds: 12,
      finiteSamples,
      maxGap,
      maxTilt,
      state: r.state,
      rigMode: r.rigMode,
      physicalModeChanges: r.physicalModeChanges || 0,
    });
    A.detach(p, s);
    assert.equal(p.sim.bodies.len(), 0);
    assert.equal(p.sim.impulseJoints.len(), 0);
    assert.equal(p.sim.multibodyJoints.len(), 0);
    assert.equal(A.hooks(p), undefined);
    p.sim.free();
  }
  const report = {
    status: "PASS",
    scope:
      "Finite bounded dynamics, connected joints and cleanup under strong multidirectional pushes / a 2m drop. Falling is permitted. Does NOT certify get-up, gait, whole-game integration or FPS.",
    rows,
  };
  fs.writeFileSync(
    __dirname + "/active-body-robustness.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
