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
  await p.evaluate(() => {
    const g = __GAME,
      s = g.squad[0];
    g.state.paused = true;
    g.state.noRender = true;
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
    g.equipStand(0, 0);
    s.spawn.yaw = 0;
    g.poseStand(0, { ready: 1 });
    for (const o of g.scene.children)
      o.visible = o.isLight || o === s.char.root || o === s.gun.root;
    s.char.root.visible = true;
    s.gun.root.visible = true;
    g.scene.fog = null;
    g.scene.background = new THREE.Color(0x667680);
    const grid = new THREE.GridHelper(10, 30, 0x99aaa8, 0x697a80);
    grid.name = "qa_grid";
    grid.position.copy(s.ctrl.pos);
    g.scene.add(grid);
    g.camera.position.copy(s.ctrl.pos).add(new THREE.Vector3(2, 1.5, -3.3));
    g.camera.lookAt(s.ctrl.pos.clone().add(new THREE.Vector3(0, 0.95, 0)));
    g.camera.fov = 40;
    g.camera.updateProjectionMatrix();
    g.renderer.shadowMap.enabled = false;
    g.renderer.setSize(800, 600);
    g.renderer.render(g.scene, g.camera);
    document.body.querySelectorAll("body > :not(canvas)").forEach((e) => {
      if (e.tagName !== "SCRIPT" && !e.contains(g.renderer.domElement))
        e.style.display = "none";
    });
    g.renderer.domElement.style.cssText =
      "position:fixed;inset:0;width:800px;height:600px;z-index:999999";
  });
  await p.setViewportSize({ width: 800, height: 600 });
  await p.screenshot({
    path: require("path").join(__dirname, "visual-standing.png"),
    timeout: 120000,
  });
  console.log("standing captured");
  for (const [name, opt] of [
    ["crouch", { ready: 1, crouch: 1 }],
    ["prone", { ready: 1, prone: 1 }],
  ]) {
    await p.evaluate((opt) => {
      const g = __GAME;
      g.poseStand(0, opt);
      g.renderer.render(g.scene, g.camera);
    }, opt);
    await p.screenshot({
      path: require("path").join(__dirname, "visual-" + name + ".png"),
      timeout: 120000,
    });
    console.log(name + " captured");
  }
  await p.evaluate(() => __GAME.poseStand(0, { ready: 1 }));
  await p.evaluate(() => {
    const g = __GAME,
      s = g.squad[0];
    g.dmg._standCollapse(s);
    g.step(300);
    g.camera.position.copy(s.ctrl.pos).add(new THREE.Vector3(2, 1.5, -3.3));
    g.camera.lookAt(s.ctrl.pos.clone().add(new THREE.Vector3(0, 0.45, 0)));
    g.camera.fov = 40;
    g.camera.updateProjectionMatrix();
    for (const o of g.scene.children)
      o.visible = !!(
        o.isLight ||
        o === s.char.root ||
        o === s.gun.root ||
        o.name === "qa_grid"
      );
    g.renderer.render(g.scene, g.camera);
  });
  await p.screenshot({
    path: require("path").join(__dirname, "visual-fallen.png"),
    timeout: 120000,
  });
  fs.writeFileSync(
    __dirname + "/visual-smoke.json",
    JSON.stringify(
      { poses: ["standing", "crouch", "prone", "fallen"], errors },
      null,
      2,
    ),
  );
  console.log("fallen captured", errors);
  await b.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
