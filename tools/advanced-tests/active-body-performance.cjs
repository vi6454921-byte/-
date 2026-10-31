/* CPU-only fixed-step fixture benchmark. NOT gameplay FPS. Run alone. */
const fs = require("fs"),
  { environment } = require("./active-body-fixture.cjs");
(async () => {
  const { ctx, session, character } = await environment(),
    A = ctx.GActiveBody,
    rows = [];
  for (const count of [1, 4, 12]) {
    ctx.BODY_PROBE = {};
    const p = session(),
      squad = [];
    for (let i = 0; i < count; i++) {
      const s = character({
        x: ((i % 4) - 1.5) * 4,
        z: (Math.floor(i / 4) - 1) * 4,
      });
      squad.push(s);
      A.attach(p, s);
    }
    let control = 0,
      solve = 0,
      contact = 0;
    const b = A.beforeStep,
      a = A.afterStep,
      step = p.sim.step.bind(p.sim),
      samples = [];
    A.beforeStep = (...x) => {
      const t = performance.now();
      b(...x);
      control += performance.now() - t;
    };
    A.afterStep = (...x) => {
      const t = performance.now();
      a(...x);
      contact += performance.now() - t;
    };
    p.sim.step = (...x) => {
      const t = performance.now();
      step(...x);
      solve += performance.now() - t;
    };
    try {
      for (let i = 0; i < 30; i++) p.begin(1 / 60);
      control = solve = contact = 0;
      for (let i = 0; i < 90; i++) {
        const t = performance.now();
        p.begin(1 / 60);
        samples.push(performance.now() - t);
      }
      const sort = [...samples].sort((a, b) => a - b);
      rows.push({
        profile: "default_full_articulation",
        count,
        meanStepMs: samples.reduce((a, b) => a + b, 0) / 90,
        p95StepMs: sort[Math.floor(sort.length * 0.95)],
        controlMs: control / 90,
        rapierMs: solve / 90,
        contactsMs: contact / 90,
        allFinite: squad.every((s) =>
          A.get(s).parts.every((a) =>
            Object.values(a.body.translation()).every(Number.isFinite),
          ),
        ),
        states: A.stats(p).map((r) => r.state),
      });
    } finally {
      A.beforeStep = b;
      A.afterStep = a;
      p.sim.step = step;
      for (const s of squad) A.detach(p, s);
      p.sim.free();
    }
  }
  const report = {
    scope:
      "CPU-only fixture in Node VM, 30 warmup+90 measured steps. No render, AI, navigation, guns or battle. Not FPS or hardware guarantee.",
    rows,
  };
  fs.writeFileSync(
    __dirname + "/active-body-performance.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
