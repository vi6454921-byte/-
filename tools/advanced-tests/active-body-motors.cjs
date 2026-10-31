/* Contract for pinned Rapier 0.19.3 GenericImpulseJoint motor coordinates.
   The fixed parent belongs ONLY to this isolated calibration test. */
const assert = require("node:assert/strict"),
  fs = require("fs");
const { environment } = require("./active-body-fixture.cjs");
(async () => {
  const { ctx, T } = await environment(),
    R = ctx.RAPIER,
    rows = [];
  assert.equal(R.version(), "0.19.3");
  for (const target of [
    [0.5, 0.4, 0.3],
    [0.4, 0.2, 0],
    [-0.4, 0.2, 0],
    [0.2, -0.2, 0.1],
    [1, 1, 0],
  ]) {
    const w = new R.World({ x: 0, y: 0, z: 0 });
    try {
      w.numSolverIterations = 20;
      const pa = w.createRigidBody(R.RigidBodyDesc.fixed()),
        ch = w.createRigidBody(R.RigidBodyDesc.dynamic());
      w.createCollider(R.ColliderDesc.ball(0.1).setMass(4), ch);
      const j = w.createImpulseJoint(
        R.JointData.generic(
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          7,
        ),
        pa,
        ch,
        true,
      );
      for (let a = 0; a < 3; a++) {
        j.rawSet.jointConfigureMotorModel(j.handle, 3 + a, 1);
        j.rawSet.jointConfigureMotor(j.handle, 3 + a, target[a], 0, 16000, 500);
      }
      for (let n = 0; n < 300; n++) w.step();
      const q = new T.Quaternion().copy(ch.rotation());
      if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      const actual = [
          2 * Math.asin(q.x),
          -2 * Math.asin(q.z),
          2 * Math.asin(q.y),
        ],
        error = Math.max(...actual.map((v, i) => Math.abs(v - target[i])));
      assert.ok(
        error < 0.002,
        "angular motor calibration " +
          JSON.stringify({ target, actual, error }),
      );
      rows.push({ target, actual, error });
    } finally {
      w.free();
    }
  }
  fs.writeFileSync(
    __dirname + "/active-body-motors.json",
    JSON.stringify(
      {
        status: "PASS",
        rapier: R.version(),
        scope: "Motor calibration only. Not locomotion/get-up acceptance.",
        rows,
      },
      null,
      2,
    ),
  );
  console.log("PASS angular motor calibration: 5 compound rotations");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
