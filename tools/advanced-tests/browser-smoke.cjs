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
  await p.waitForFunction(() => window.__GAME, null, { timeout: 180000 });
  console.log("ready");
  const result = await p.evaluate(() => {
    const g = __GAME;
    g.state.paused = true;
    g.state.noRender = true;
    window.AEGIS_QTIER = "low";
    const before = g.info();
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
    g.step(120);
    const grips = g.gripCheck();
    const activeKey = g.squad[g.state.activeIdx]?.key;
    g.step(480);
    const after = g.info(),
      ai = g.combat.stats(),
      physics = GPhysics.stats();
    let finite = g.squad.every((s) =>
      s.ctrl.pos.toArray().every(Number.isFinite),
    );
    const duelBefore = g.combat.stats().shots;
    const duel = g.squad.filter((s) => !s.dead),
      left = duel.find((s) => s.char.preset.faction === "delta"),
      right = duel.find((s) => s.char.preset.faction === "alpha");
    if (left && right) {
      g.state.activeIdx = -1;
      for (const s of g.squad) if (s !== left && s !== right) s.dead = true;
      const p0 = g.world.safeSpawn("alpha", 70),
        p1 = g.world.safeSpawn("alpha", 71);
      for (const [s, p] of [
        [left, p0],
        [right, p1],
      ]) {
        s.ctrl.pos.set(p.x, p.y, p.z);
        s.ctrl.vel.set(0, 0, 0);
        s.ctrl.reload = -1;
        s.battle = null;
        s.thr = null;
        s.tac = null;
      }
      for (let n = 0; n < 90; n++) {
        for (const [s, q] of [
          [left, right],
          [right, left],
        ]) {
          s.ctrl.yaw = s.idleYaw = Math.atan2(
            -(q.ctrl.pos.x - s.ctrl.pos.x),
            -(q.ctrl.pos.z - s.ctrl.pos.z),
          );
        }
        g.step(1);
      }
    }
    const duelShots = g.combat.stats().shots - duelBefore;
    const soldier = g.squad.find((s) => !s.dead),
      idx = g.squad.indexOf(soldier);
    if (soldier) {
      g.testShot(idx, 1.74, {
        bone: "head",
        off: [0, 0.03, -0.055],
        ammo: "M993",
      });
      if (!soldier.rd) g.dmg._standCollapse(soldier);
      g.step(240);
    }
    const falls = g.squad
      .filter((s) => s.rd)
      .map((s) => ({
        key: s.key,
        sleep: s.rd.sleep,
        finite: Array.from(s.rd.p).every(Number.isFinite),
      }));
    return {
      duelShots,
      map: g.world.mapId,
      before,
      after,
      ai,
      physics,
      finite,
      grips,
      activeKey,
      falls,
      postPhysics: GPhysics.stats(),
      timings: GPerf.report(),
      weapons: g.squad.map((s) => ({
        key: s.key,
        gun: !!s.gun,
        dead: !!s.dead,
        ammo: s.ctrl.ammo,
      })),
    };
  });
  fs.writeFileSync(
    require("path").join(__dirname, "integration-") +
      (process.env.MAP || "angar_map") +
      ".json",
    JSON.stringify({ result, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      map: result.map,
      finite: result.finite,
      ai: result.ai,
      duelShots: result.duelShots,
      grips: result.grips.length,
      falls: result.falls,
      errors,
    }),
  );
  await b.close();
  const badGrip = result.grips
    .filter((x) => x.key !== result.activeKey)
    .some((x) =>
      ["palmR", "palmL", "wristErrorR", "wristErrorL"].some(
        (k) => !Number.isFinite(x[k]) || Math.abs(x[k]) > 0.04,
      ),
    );
  process.exit(
    errors.length ||
      !result.finite ||
      result.duelShots < 1 ||
      result.grips.length !== 24 || // v20: на angar_map 24 бойца (тест ждал 12 и падал уже в v19)
      badGrip ||
      !result.falls.length ||
      result.falls.some((x) => !x.finite)
      ? 1
      : 0,
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
