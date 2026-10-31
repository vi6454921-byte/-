const assert = require("node:assert/strict"),
  fs = require("fs"),
  { environment } = require("./active-body-fixture.cjs");
(async () => {
  const { ctx, session, character, T } = await environment(),
    A = ctx.GActiveBody,
    p = session(),
    s = character(),
    r = A.attach(p, s),
    H = A.hooks(p),
    flags = ctx.RAPIER.SolverFlags.COMPUTE_IMPULSE;
  assert.equal(
    H.filterContactPair(r.byName.hips.col.handle, r.byName.hipR.col.handle),
    null,
    "adjacent excluded",
  );
  assert.equal(
    H.filterContactPair(r.byName.wristR.col.handle, r.byName.chest.col.handle),
    flags,
    "hand/torso collide",
  );
  assert.equal(
    H.filterContactPair(r.byName.kneeR.col.handle, r.byName.kneeL.col.handle),
    flags,
    "opposite shins collide",
  );
  assert.equal(
    H.filterContactPair(r.byName.wristR.col.handle, p.terrain.handle),
    flags,
    "floor preserved",
  );
  for (let i = 0; i < 120; i++) p.begin(1 / 60);
  const load = r.byName.ankleR.filteredLoad + r.byName.ankleL.filteredLoad;
  assert.ok(
    Math.abs(load - r.mass * 9.81) < r.mass * 9.81 * 0.2,
    "foot load roughly supports body weight",
  );
  const before = r.parts.map((a) => ({
    p: Object.values(a.body.translation()),
    q: Object.values(a.body.rotation()),
    v: Object.values(a.body.linvel()),
    w: Object.values(a.body.angvel()),
  }));
  A.release(s);
  let modeError = 0;
  for (const [i, a] of r.parts.entries()) {
    const now = {
      p: Object.values(a.body.translation()),
      q: Object.values(a.body.rotation()),
      v: Object.values(a.body.linvel()),
      w: Object.values(a.body.angvel()),
    };
    for (const key of ["p", "q", "v", "w"])
      for (let j = 0; j < now[key].length; j++)
        modeError = Math.max(
          modeError,
          Math.abs(now[key][j] - before[i][key][j]),
        );
  }
  assert.ok(
    modeError < 1e-5,
    "fall mode preserves all body transforms and velocities",
  );
  assert.equal(p.sim.multibodyJoints.len(), 0);
  assert.equal(p.sim.impulseJoints.len(), 18);
  let selfContacts = 0,
    handSupports = 0,
    kneeSupports = 0;
  for (let i = 0; i < 600; i++) {
    p.begin(1 / 60);
    for (const a of r.parts) {
      assert.ok(
        Object.values(a.body.translation()).every(Number.isFinite),
        "finite during full self-colliding fall",
      );
      p.sim.contactPairsWith(a.col, (o) => {
        const b = r.parts.find((x) => x.col.handle === o.handle);
        if (b && !a.exclusions.has(b))
          p.sim.contactPair(a.col, o, (m) => {
            if (m.numSolverContacts()) selfContacts++;
          });
      });
    }
    handSupports += r.contactSummary.hands;
    kneeSupports += r.contactSummary.knees;
  }
  assert.ok(selfContacts > 0, "real nonadjacent self contacts generated");
  A.detach(p, s);
  assert.equal(A.hooks(p), undefined);
  assert.equal(p.sim.bodies.len(), 0);
  assert.equal(p.sim.impulseJoints.len(), 0);
  assert.equal(p.sim.multibodyJoints.len(), 0);
  p.sim.free();
  const report = {
    status: "PASS",
    scope:
      "Self-contact filtering, measured foot load, dynamic fall transition, 10s finite fall, cleanup. Not get-up acceptance.",
    loadN: load,
    expectedWeightN: r.mass * 9.81,
    modeError,
    selfContacts,
    handSupports,
    kneeSupports,
  };
  fs.writeFileSync(
    __dirname + "/active-body-contacts.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
