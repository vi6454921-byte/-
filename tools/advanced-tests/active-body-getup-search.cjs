/* Offline posture exploration only, never a get-up acceptance test. */
const fs = require("fs"),
  { environment } = require("./active-body-fixture.cjs");
(async () => {
  const { ctx, session, character } = await environment(),
    A = ctx.GActiveBody,
    rows = [];
  for (const hip of [0.9, 1.3, 1.7, 2.1])
    for (const spine of [-1.2, -0.8, -0.4]) {
      ctx.BODY_PROBE = {
        recoveryHip: hip,
        recoveryKnee: -2.4,
        recoverySpine: spine,
        riseGate: 0,
      };
      const p = session(),
        s = character(),
        r = A.attach(p, s);
      let finite = true;
      try {
        for (let i = 0; i < 300; i++) {
          if (i === 60) A.impulse(s, { x: 0, y: 0, z: -60 });
          p.begin(1 / 60);
        }
        const requested = A.recover(s);
        for (let i = 0; i < 780; i++) {
          p.begin(1 / 60);
          if (
            !r.parts.every((a) =>
              Object.values(a.body.translation()).every(Number.isFinite),
            )
          ) {
            finite = false;
            break;
          }
        }
        const load =
            (r.byName.ankleR.filteredLoad || 0) +
            (r.byName.ankleL.filteredLoad || 0),
          ratio = load / (r.mass * 9.81),
          up = Math.max(0, 1 - r.tilt / (Math.PI / 2)),
          at = r.byName.hips.body.translation();
        rows.push({
          hip,
          spine,
          requested,
          finite,
          tilt: r.tilt,
          hipPosition: at,
          contacts: r.contactSummary,
          loadRatio: ratio,
          score: finite ? Math.min(1, ratio) * 3 + up * 2 + at.y : -1,
        });
      } finally {
        A.detach(p, s);
        p.sim.free();
      }
    }
  rows.sort((a, b) => b.score - a.score);
  fs.writeFileSync(
    __dirname + "/active-body-getup-search.json",
    JSON.stringify(
      {
        scope: "Offline posture search, not recovery/standing certification.",
        rows,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(rows.slice(0, 6)));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
