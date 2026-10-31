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
  const result = await p.evaluate(() => {
    const g = __GAME,
      T = THREE;
    g.state.paused = true;
    g.state.noRender = true;
    const poses = [];
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
      for (const opt of [
        { ready: 0 },
        { ready: 1 },
        { ready: 1, crouch: 1 },
        { ready: 1, prone: 1 },
        { ads: 1 },
      ]) {
        const grip = g.poseStand(i, opt);
        let finite = true;
        s.char.root.traverse((b) => {
          if (b.isBone)
            finite &&= [
              ...b.position.toArray(),
              ...b.quaternion.toArray(),
            ].every(Number.isFinite);
        });
        poses.push({
          key: s.key,
          preset: s.char.preset.id,
          opt,
          grip,
          finite,
          footGap: { ...s.rig.footGap },
        });
      }
    }
    const s = g.squad[0],
      c = s.ctrl,
      old = { world: c._physicsWorld, pos: c.pos.clone(), yaw: c.yaw };
    const w = {
        bounds: { x0: -10, x1: 10, z0: -10, z1: 10 },
        heightAt: () => 0,
        colliders: [],
        blocked: () => false,
      },
      p = GPhysics.get(w);
    c._physicsWorld = w;
    c._distancePhase = false;
    c.pos.set(0, 0.025, 0);
    c.yaw = 0;
    c.prone = 0;
    c.crouch = 0;
    c.crouchMove = 0;
    c.speed = 1.5;
    c.sprint = 0;
    c.grounded = true;
    c.ready = 1;
    s.motion = null;
    const movement = [];
    for (let i = 0; i < 180; i++) {
      p.begin(1 / 60);
      c.vel.set(1.5, 0, 0);
      p.move(c, 1 / 60, -9.81);
      GAnimator.pose(s, 1 / 60, false, i / 60);
      let finite = true;
      s.char.root.traverse((b) => {
        if (b.isBone) finite &&= b.quaternion.toArray().every(Number.isFinite);
      });
      const feet = {};
      for (const side of ["R", "L"]) {
        const f = s.motion.debug.feet[side],
          a = s.char.bone("ankle" + side).getWorldPosition(new T.Vector3());
        feet[side] = {
          ...f,
          error: a.distanceTo(new T.Vector3().fromArray(f.target)),
          gap: s.rig.footGap[side],
        };
      }
      movement.push({
        i,
        finite,
        pos: c.pos.toArray(),
        phase: s.motion.debug.phase,
        feet,
      });
    }
    p.dropPose(s);
    p.removeActor(c);
    c._physicsWorld = old.world;
    c.pos.copy(old.pos);
    c.yaw = old.yaw;
    s.motion = null;
    // Real grenade API and shared-world cleanup.
    const sim = g._C.GSIM,
      physics = GPhysics.get(g.world),
      before = physics.stats().dynamicObjects;
    const obj = sim.add(
      "m67",
      c.pos.clone().add(new T.Vector3(0, 1, 0)),
      new T.Vector3(1, 1, 0),
      new T.Quaternion(),
      new T.Vector3(2, 0, 0),
      20,
    );
    g.step(30);
    const owned = [...sim.list, ...sim.spent.map(s => s.g), ...sim.debris];
    const unrelated = [...physics.objects.keys()].filter(k => !owned.includes(k));
    const grenade = {
      finite: obj.pos.toArray().every(Number.isFinite),
      objects: owned.filter(k => physics.objects.has(k)).length,
      beforeTotal: before,
    };
    sim.clear();
    grenade.afterClear = owned.filter(k => physics.objects.has(k)).length;
    grenade.unrelatedRetained = unrelated.every(k => physics.objects.has(k));
    grenade.afterTotal = physics.stats().dynamicObjects;
    return { poses, movement, grenade };
  });
  fs.writeFileSync(
    __dirname + "/continuation-browser.json",
    JSON.stringify({ result, errors }, null, 2),
  );
  const badPoses = result.poses.filter(
    (x) =>
      !x.finite ||
      !x.grip ||
      ["palmR", "palmL", "wristErrorR", "wristErrorL"].some(
        (k) => !Number.isFinite(x.grip[k]) || Math.abs(x.grip[k]) > 0.04,
      ),
  );
  const m = result.movement,
    plant = m.flatMap((f) =>
      Object.values(f.feet)
        .filter((x) => x.plant)
        .map((x) => x.error),
    );
  console.log(
    JSON.stringify({
      errors,
      poses: result.poses.length,
      badPoses,
      maxPlantError: Math.max(...plant),
      allFinite: m.every((x) => x.finite),
      grenade: result.grenade,
    }),
  );
  await b.close();
  if (
    errors.length ||
    badPoses.length ||
    !m.every((x) => x.finite) ||
    Math.max(...plant) > 0.08 ||
    !result.grenade.finite ||
    result.grenade.afterClear !== 0 ||
    !result.grenade.unrelatedRetained
  )
    process.exit(1);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
