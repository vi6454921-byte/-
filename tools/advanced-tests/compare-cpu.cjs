const { chromium } = require("playwright"),
  fs = require("fs");
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } }),
    errors = [];
  p.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("PAGEERROR", e.message);
  });
  await p.addInitScript(() =>
    localStorage.setItem(
      "aegis.settings",
      JSON.stringify({ quality: "low", volume: 0 }),
    ),
  );
  await p.route("**/js/polygon/29_game.js", async (route) => {
    const r = await route.fetch();
    let text = process.env.BASELINE
      ? fs.readFileSync(
          require("path").join(
            process.env.ORIGINAL_DIR,
            "js/polygon/29_game.js",
          ),
          "utf8",
        )
      : await r.text();
    if (process.env.BASELINE)
      text = text.replace(
        "if (F.FLAGS) F.FLAGS.update(dt, camera);",
        "const flagStart=performance.now();if (F.FLAGS) F.FLAGS.update(dt, camera);root.GPerf?.record('flags',performance.now()-flagStart);",
      );
    text = text.replace(
      "function renderFrame(dt) {",
      "function renderFrame(dt) { return;",
    );
    text = text.replace(
      "const go = () => { warm(); startGame(); };",
      "const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();",
    );
    await route.fulfill({ response: r, body: text });
  });
  if (process.env.BASELINE) {
    await p.route("**/index.html", async (route) =>
      route.fulfill({
        body: fs
          .readFileSync(
            require("path").join(process.env.ORIGINAL_DIR, "index.html"),
            "utf8",
          )
          .replace(
            "<head>",
            '<head><script src="js/advanced/profiler.js"></script>',
          ),
        contentType: "text/html",
      }),
    );
    for (const f of [
      "20_player.js",
      "23_game_damage.js",
      "05d_grenades.js",
      "30_game_medic.js",
    ])
      await p.route("**/js/polygon/" + f, async (route) =>
        route.fulfill({
          body: fs.readFileSync(
            require("path").join(process.env.ORIGINAL_DIR, "js/polygon", f),
            "utf8",
          ),
          contentType: "application/javascript",
        }),
      );
    await p.route("**/js/polygon/27_game_flags.js", async (route) =>
      route.fulfill({
        body: fs.readFileSync(
          require("path").join(
            process.env.ORIGINAL_DIR,
            "js/polygon/27_game_flags.js",
          ),
          "utf8",
        ),
        contentType: "application/javascript",
      }),
    );
  }
  await p.goto(
    (process.env.BASE_URL || "http://127.0.0.1:8000/") +
      "index.html" +
      (process.env.MAP ? "?map=" + process.env.MAP : ""),
  );
  console.log("navigation done");
  await p.waitForFunction(() => window.__GAME, null, { timeout: 180000 });
  console.log("game ready");
  await p.evaluate(() => {
    __GAME.state.paused = true;
    __GAME.state.noRender = true;
    window.AEGIS_QTIER = "low";
  });
  console.log("paused");
  const c = await p.context().newCDPSession(p);
  await c.send("Profiler.enable");
  await c.send("Profiler.start");
  console.log("profiler ready");
  const bench = await p.evaluate(() => {
    const g = __GAME;
    g.step(90);
    window.GPerf?.clear();
    const rows = [];
    for (let i = 0; i < 900; i++) {
      const t = performance.now();
      g.step(1, 1 / 60);
      rows.push(performance.now() - t);
    }
    rows.sort((a, b) => a - b);
    return {
      mean: rows.reduce((a, b) => a + b, 0) / rows.length,
      p50: rows[450],
      p95: rows[855],
      samples: rows,
      physics: window.GPhysics?.stats(),
      ai: g.combat?.stats(),
      grips: g.gripCheck(),
      info: g.info(),
      perf: window.GPerf?.report(),
    };
  });
  console.log("bench finished");
  const { profile } = await c.send("Profiler.stop");
  const samples = new Map(),
    ids = new Map(profile.nodes.map((n) => [n.id, n]));
  for (const id of profile.samples || [])
    samples.set(id, (samples.get(id) || 0) + 1);
  const hot = [...samples]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([id, n]) => ({
      n,
      fn: ids.get(id).callFrame.functionName,
      url: ids.get(id).callFrame.url.split("/").slice(-1)[0],
      line: ids.get(id).callFrame.lineNumber + 1,
    }));
  fs.writeFileSync(
    process.env.OUT ||
      require("path").join(
        __dirname,
        process.env.BASELINE
          ? "cpu-baseline-local.json"
          : "cpu-updated-local.json",
      ),
    JSON.stringify({ bench, hot, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      mean: bench.mean,
      p95: bench.p95,
      hot: hot.slice(0, 7),
      errors,
    }),
  );
  await b.close({ reason: "CPU test complete" });
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
