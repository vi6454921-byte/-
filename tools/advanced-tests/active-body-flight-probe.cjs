const { environment } = require("./active-body-fixture.cjs");
(async () => {
  const { ctx, session, character } = await environment(),
    A = ctx.GActiveBody,
    rows = [];
  for (const release of [false, true]) {
    ctx.BODY_PROBE = {};
    const p = session(),
      s = character({ y: 2.025 }),
      r = A.attach(p, s);
    if (release) A.release(s);
    const com = () =>
        r.parts.reduce(
          (a, b) => a + (b.mass * b.body.worldCom().y) / r.mass,
          0,
        ),
      y = com();
    for (let i = 0; i < 24; i++) p.begin(1 / 60);
    rows.push({
      release,
      fall: y - com(),
      vy: r.parts.reduce(
        (a, b) => a + (b.mass * b.body.linvel().y) / r.mass,
        0,
      ),
      masses: r.parts.map((a) => [a.name, a.mass, a.body.mass()]),
      support: r.support,
      hip: r.byName.hips.body.translation(),
    });
    A.detach(p, s);
    p.sim.free();
  }
  console.log(JSON.stringify(rows));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
