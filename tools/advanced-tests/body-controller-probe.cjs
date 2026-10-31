const { environment } = require("./active-body-fixture.cjs");
(async () => {
  const { ctx, T, character, session } = await environment(),
    A = ctx.GActiveBody;
  ctx.BODY_PROBE = JSON.parse(process.env.CONTROL || "{}");
  const p = session(),
    s = character(),
    r = A.attach(p, s),
    rows = [];
  p.sim.numSolverIterations = ctx.BODY_PROBE.iterations || 8;
  p.sim.numInternalPgsIterations = ctx.BODY_PROBE.pgs || 2;
  r.com = new T.Vector3();
  for (let i = 0; i < (+process.env.STEPS || 2400); i++) {
    if (i === 180 && process.env.PUSH) A.impulse(s, { x: 6, y: 0, z: 0 });
    if (process.env.WALK) {
      r.locomotion = true;
      r.wish.set(0, 0, i > 120 && i < 2100 ? -0.35 : 0);
    }
    p.begin(1 / 60);
    if (i % 30 === 0) {
      r.com.set(0, 0, 0);
      for (const a of r.parts)
        r.com.addScaledVector(a.body.worldCom(), a.mass / r.mass);
      const hip = r.byName.hips.body;
      rows.push({
        t: i / 60,
        tilt: r.tilt,
        yaw: new T.Euler().setFromQuaternion(
          new T.Quaternion().copy(hip.rotation()),
          "YXZ",
        ).y,
        support: r.support,
        steps: r.steps,
        completed: r.completedSteps,
        missed: r.missedSteps,
        state: r.state,
        gait: JSON.parse(JSON.stringify(r.gait)),
        balance: r.balanceGoal.toArray(),
        comVelocity: r.comVel.toArray(),
        feet: Object.values(r.feet).map((f) => ({
          side: f.side,
          at: Object.values(f.part.body.translation()),
          goal: f.goal.toArray(),
          contact: f.part.contact,load:f.part.filteredLoad,force:f.part.normalForce,
          swing: f.swing,
        })),
        hip: Object.values(hip.translation()),
        vel: Object.values(hip.linvel()),
        com: r.com.toArray(),
      });
    }
  }
  console.log(JSON.stringify(rows));
  if (process.env.DIAG) {
    console.log(
      JSON.stringify(
        r.parts
          .filter((a) => a.parent)
          .map((a) => {
            const actual = new T.Quaternion()
              .copy(a.parent.body.rotation())
              .invert()
              .multiply(new T.Quaternion().copy(a.body.rotation()));
            const pa = new T.Vector3()
                .copy(a.joint.anchor1())
                .applyQuaternion(
                  new T.Quaternion().copy(a.parent.body.rotation()),
                )
                .add(a.parent.body.translation()),
              pb = new T.Vector3()
                .copy(a.joint.anchor2())
                .applyQuaternion(new T.Quaternion().copy(a.body.rotation()))
                .add(a.body.translation());
            return {
              name: a.name,
              error: actual.angleTo(a.goal),
              actual: actual.toArray(),
              goal: a.goal.toArray(),
              gap: pa.distanceTo(pb),
            };
          }),
      ),
    );
  }
  A.detach(p, s);
  p.sim.free();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
