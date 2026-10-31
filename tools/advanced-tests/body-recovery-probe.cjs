const { environment } = require("./active-body-fixture.cjs");
(async () => {
  const { ctx, T, character, session } = await environment();
  ctx.BODY_PROBE = JSON.parse(process.env.CONTROL || "{}");
  const A = ctx.GActiveBody,
    p = session(),
    s = character(),
    r = A.attach(p, s);
  p.sim.numSolverIterations = 8;
  const rows = [];
  for (let i = 0; i < (+process.env.STEPS || 1500); i++) {
    if (i === 60)
      A.impulse(s, JSON.parse(process.env.PUSH || '{"x":60,"y":0,"z":0}'));
    if (i === 300) A.recover(s);
    p.begin(1 / 60);
    if (i % 30 === 0)
      rows.push({
        t: i / 60,
        state: r.state,
        phase: r.recoverPhase,contacts:r.contactSummary,
        rotation: Object.values(r.byName.hips.body.rotation()),
        tilt: r.tilt,
        hip: Object.values(r.byName.hips.body.translation()),
        feet: Object.values(r.feet).map((f) => ({
          at: Object.values(f.part.body.translation()),
          contact: f.part.contact,
        })),
        com: r.com.toArray(),
      });
  }
  console.log(JSON.stringify(rows));
  A.detach(p, s);
  p.sim.free();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
