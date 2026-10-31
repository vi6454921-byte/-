/* Fails until the requested full migration actually works.
   A PASS in active-body.cjs certifies infrastructure, not this contract. */
const fs = require("fs"),
  { environment } = require("./active-body-fixture.cjs");
(async () => {
  const { ctx, session, character } = await environment(),
    A = ctx.GActiveBody,
    results = [];
  function sample(r, t) {
    return {
      t,
      state: r.state,
      hips: r.byName.hips.currP.toArray(),
      support: r.support,
      tilt: r.tilt,
      speed: r.comVel.length(),
      steps: r.steps,
    };
  }
  function run(name, setup, input, finish) {
    const p = session(),
      s = character(),
      r = A.attach(p, s),
      rows = [];
    setup(r, s);
    let peakTilt = 0,
      stable = 0;
    for (let i = 0; i < 1800; i++) {
      const t = i / 60;
      input(r, s, t);
      p.begin(1 / 60);
      peakTilt = Math.max(peakTilt, r.tilt);
      if (
        r.byName.hips.currP.y > r.hipHeight * 0.8 &&
        r.tilt < 0.2 &&
        r.comVel.length() < 0.35 &&
        r.support === 2
      )
        stable += 1 / 60;
      else stable = 0;
      if (i % 30 === 0) rows.push(sample(r, t));
    }
    const result = { name, ...finish(r, rows, stable), peakTilt, rows };
    results.push(result);
    A.detach(p, s);
    p.sim.free();
  }
  run(
    "30s_balance_with_6Ns_chest_push",
    () => {},
    (r, s, t) => {
      if (Math.abs(t - 3) < 1e-5) A.impulse(s, { x: 6, y: 0, z: 0 });
    },
    (r, rows, stable) => ({
      pass:
        rows.every(
          (x) =>
            x.hips[1] > 0.8 * r.hipHeight &&
            x.tilt < 0.5 &&
            x.state !== "fallen",
        ) && stable > 2,
      stableAtEnd: stable,
    }),
  );
  run(
    "physical_walk_6m_and_stop",
    (r, s) => A.setLocomotion(s, true),
    (r, s, t) => r.wish.set(0, 0, t >= 2 && t < 22 ? -0.35 : 0),
    (r, rows, stable) => ({
      pass:
        r.byName.hips.currP.z < -6 &&
        rows.every((x) => x.state !== "fallen") &&
        stable > 2,
      actualDistance: -r.byName.hips.currP.z,
      stepsStarted: r.steps,
      stableAtEnd: stable,
    }),
  );
  let requested = false;
  run(
    "60Ns_forward_push_fall_get_up",
    () => {},
    (r, s, t) => {
      if (Math.abs(t - 1) < 1e-5) A.impulse(s, { x: 0, y: 0, z: -60 });
      if (Math.abs(t - 5) < 1e-5) requested = A.recover(s);
    },
    (r, rows, stable) => ({
      pass:
        requested &&
        rows.some((x) => x.state === "fallen") &&
        r.state === "standing" &&
        stable > 2,
      recoveryRequested: requested,
      stableAtEnd: stable,
    }),
  );
  const report = {
    status: results.every((x) => x.pass) ? "PASS" : "FAIL",
    scope:
      "Requested autonomous balance / walking / getting up. These are NOT complete.",
    results,
  };
  fs.writeFileSync(
    __dirname + "/active-body-acceptance.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      { status: report.status, results: results.map(({ rows, ...r }) => r) },
      null,
      2,
    ),
  );
  if (report.status !== "PASS") process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
