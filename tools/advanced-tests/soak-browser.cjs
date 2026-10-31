const { chromium } = require("playwright"),
  fs = require("fs");
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } }),
    errors = [];
  p.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("PAGEERROR", e.message);
  });
  await p.addInitScript(() =>
    localStorage.setItem(
      "aegis.settings",
      JSON.stringify({ quality: "low", volume: 0, calloutSpeech: false }),
    ),
  );
  await p.route("**/js/polygon/29_game.js", async (route) => {
    let r = await route.fetch(),
      s = await r.text();
    s = s.replace(
      "function renderFrame(dt) {",
      "function renderFrame(dt) { return;",
    );
    s = s.replace(
      "const go = () => { warm(); startGame(); };",
      "const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();",
    );
    await route.fulfill({ response: r, body: s });
  });
  await p.goto(
    (process.env.BASE_URL || "http://127.0.0.1:8000/") +
      "index.html?map=" +
      (process.env.MAP || "angar_map"),
  );
  await p.waitForFunction(() => window.__GAME, null, { timeout: 180000 }).catch(async e=>{console.error('BOOT FAILURE', (await p.locator('body').innerText()).slice(-2800));await b.close();throw e;});
  console.log("ready");

  await p.evaluate((exact) => {
    const g = __GAME;
    if (exact) g._C.worldVisible = g._C.worldVisibleExact;
    g.state.activeIdx = -1;
    g.state.noRender = true;
    g.state.paused = true;
    for (let i = 0; i < g.squad.length; i++) {
      const s = g.squad[i];
      AEGIS_GAME.setLoadout(s.key, {
        slots: [
          { t: "gun", id: "ak74" },
          null,
          { t: "ammo", w: "primary" },
          null,
          null,
          null,
        ],
        cfg: {},
      });
      g.equipStand(i, 0);
    }
    window.__soakStart = g.squad.map((s) => s.ctrl.pos.toArray());
    GPerf.clear();
  }, !!process.env.EXACT_VISIBILITY);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.start");
  const samples = [],
    frames = Number(process.env.SOAK_SECONDS || 90) * 60;
  for (let n = 0; n < frames; n += 120) {
    const sample = await p.evaluate(() => {
      const g = __GAME,
        t = performance.now();
      g.step(120);
      const ms = performance.now() - t;
      let finite = true;
      const bb = g.world.bounds;
      for (const s of g.squad) {
        finite &&= s.ctrl.pos.toArray().every(Number.isFinite);
        if (s.rd) finite &&= Array.from(s.rd.p).every(Number.isFinite);
        if (Math.abs(s.ctrl.pos.x) > 1e4) throw Error("actor escaped");
      }
      const ph = GPhysics.stats();
      if (!finite) throw Error("nonfinite soak");
      if (ph.bodies > 450) throw Error("unbounded rigid body count");
      return {
        time: g.state.time,
        ms,
        alive: g.squad.filter((s) => !s.dead).length,
        wounded: g.squad.filter((s) => (s.dmg?.ph?.src || []).length > 0)
          .length,
        fallen: g.squad.filter((s) => !!s.rd).length,
        ai: g.combat.stats(),
        physics: ph,
        medical: g._C.tactics.stats(),
        finite,
        positions: g.squad.map((s) => s.ctrl.pos.toArray()),
      };
    });
    samples.push(sample);
    if (samples.length % 5 === 0)
      console.log(
        JSON.stringify({
          checkpoint: sample.time,
          shots: sample.ai.shots,
          bodies: sample.physics.bodies,
          ms: sample.ms,
        }),
      );
  }
  const { profile } = await cdp.send("Profiler.stop");
  const counts = new Map(),
    nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  for (const id of profile.samples || [])
    counts.set(id, (counts.get(id) || 0) + 1);
  const hot = [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id, n]) => ({
      n,
      fn: nodes.get(id).callFrame.functionName,
      url: nodes.get(id).callFrame.url.split("/").at(-1),
      line: nodes.get(id).callFrame.lineNumber + 1,
    }));
  const final = await p.evaluate(() => ({
    info: __GAME.info(),
    start: window.__soakStart,
    perf: GPerf.summary?.() || GPerf.report?.(),
    end: __GAME.squad.map((s) => ({
      key: s.key,
      pos: s.ctrl.pos.toArray(),
      dead: s.dead,
      mode: s.battle?.mode,
      path: s.battle?.pathState,
      goal: s.battle?.goal,
      ammo: s.ctrl.ammo,
      reserve: s.ctrl.reserve,
      wounds: (s.dmg?.ph?.src || []).length,
      collapsed: !!s.rd,
    })),
  }));
  const result = {
    scenario:
      "Natural base spawns; no injected duel, no rendering; 12 AK74 NPCs; CPU sampling profiler",
    map: process.env.MAP || "angar_map",
    seconds: frames / 60,
    samples,
    final,
    hot,
    errors,
  };
  fs.writeFileSync(
    process.env.OUT || __dirname + "/soak-" + result.map + ".json",
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify({
      map: result.map,
      seconds: result.seconds,
      errors,
      shots: samples.at(-1).ai.shots,
      alive: samples.at(-1).alive,
      peakBodies: Math.max(...samples.map((s) => s.physics.bodies)),
      queued: samples.at(-1).ai.queued,
      movement: final.end.map((s, i) => ({
        key: s.key,
        moved: Math.hypot(
          s.pos[0] - final.start[i][0],
          s.pos[2] - final.start[i][2],
        ),
        mode: s.mode,
        path: s.path,
      })),
    }),
  );
  await b.close();
  if (errors.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
