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
    s = s.replace("function renderFrame(dt) {", "function renderFrame(dt) { return;");
    s = s.replace(
      "const go = () => { warm(); startGame(); };",
      "const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();",
    );
    await route.fulfill({ response: r, body: s });
  });
  await p.goto((process.env.BASE_URL || "http://127.0.0.1:8000/") + "index.html");
  await p.waitForFunction(() => window.__GAME, null, { timeout: 180000 });
  console.log("ready");
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.start");
  const result = await p.evaluate(() => {
    const g = __GAME;
    g.state.paused = true;
    g.state.noRender = true;
    window.AEGIS_QTIER = "low";
    g.step(90);
    window.GPerf?.clear();
    const samples = [];
    for (let i = 0; i < 900; i++) {
      const begin = performance.now();
      g.step(1, 1 / 60);
      samples.push(performance.now() - begin);
    }
    const sorted = samples.slice().sort((a, b) => a - b);
    return {
      scenario: "low; four unarmed NPCs; CPU only; 90 warmup + 900 fixed 1/60 steps",
      samples,
      meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
      medianMs: sorted[450],
      p95Ms: sorted[855],
      timings: window.GPerf?.report(),
      physics: window.GPhysics?.stats(),
    };
  });
  const { profile } = await cdp.send("Profiler.stop");
  fs.writeFileSync(
    require("path").join(__dirname, "cpu-latest.json"),
    JSON.stringify({ result, errors, profile }, null, 2),
  );
  console.log(
    JSON.stringify({
      meanMs: result.meanMs,
      medianMs: result.medianMs,
      p95Ms: result.p95Ms,
      errors,
    }),
  );
  await b.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
