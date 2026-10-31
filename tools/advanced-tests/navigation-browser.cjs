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
  await p
    .waitForFunction(() => window.__GAME, null, { timeout: 180000 })
    .catch(async (e) => {
      console.error(
        "BOOT FAILURE",
        (await p.locator("body").innerText()).slice(-2800),
      );
      await b.close();
      throw e;
    });
  console.log("ready");
  const result = await p.evaluate(() => {
    const g = __GAME,
      surface = GNavigation.get(g.world),
      rows = [],
      counts = {};
    if (!surface?.query) throw Error("Recast not active");
    for (let i = 0; i < g.squad.length; i++)
      for (let j = 0; j < g.squad.length; j++)
        if (i !== j) {
          const a = g.squad[i].ctrl.pos,
            b = g.squad[j].ctrl.pos,
            r = surface.plan(a, b);
          if (r.path.some((p) => ![p.x, p.y, p.z].every(Number.isFinite)))
            throw Error("Nonfinite path");
          if (r.state === "complete") {
            const p = r.path.at(-1);
            if (
              Math.hypot(p.x - b.x, p.z - b.z) > 0.2 ||
              Math.abs(p.y - b.y) > 0.22
            )
              throw Error("False complete endpoint");
          }
          counts[r.state] = (counts[r.state] || 0) + 1;
          rows.push({
            from: g.squad[i].key,
            to: g.squad[j].key,
            state: r.state,
            reason: r.reason,
            start: a.toArray(),
            end: b.toArray(),
            endpoint: r.endpoint,
            points: r.path.length,
          });
        }
    return { map: g.world.mapId, rows, counts, stats: surface.stats() };
  });
  fs.writeFileSync(
    __dirname + "/navigation-" + (process.env.MAP || "angar_map") + ".json",
    JSON.stringify({ result, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      map: result.map,
      counts: result.counts,
      stats: result.stats,
      errors,
    }),
  );
  await b.close();
  // v20: 24 бойца на angar_map -> 24 × 23 = 552 маршрута (тест ждал 12 × 11 = 132 и падал уже в v19)
  if (errors.length || result.rows.length !== 552 || !result.counts.complete)
    process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
