const { chromium } = require("playwright"),
  fs = require("fs"),
  path = require("path"),
  assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const errors = [];
  try {
    const p = await b.newPage({ viewport: { width: 640, height: 400 } });
    p.on("pageerror", (e) => errors.push(e.message));
    await p.addInitScript(() =>
      localStorage.setItem(
        "aegis.settings",
        JSON.stringify({ quality: "low", volume: 0, calloutSpeech: false }),
      ),
    );
    await p.route("**/js/polygon/29_game.js", async (route) => {
      const r = await route.fetch();
      let s = await r.text();
      s = s
        .replace(
          "function renderFrame(dt) {",
          "function renderFrame(dt) { return;",
        )
        .replace(
          "const go = () => { warm(); startGame(); };",
          "const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();",
        );
      await route.fulfill({ response: r, body: s });
    });
    await p.goto(
      (process.env.BASE_URL || "http://127.0.0.1:8772/") +
        "index.html?map=angar_map",
    );
    await p.waitForFunction(() => window.__GAME, null, { timeout: 180000 });
    const result = await p.evaluate(() => {
      const g = __GAME,
        T = THREE;
      g.pause(true);
      g.state.noRender = true;
      const check = (v, msg) => {
        if (!v) throw Error(msg);
      };
      check(g.fx.caseStats().backend === "Rapier", "main game FX not wired");
      const originalRandom = Math.random;
      let seed = 0x1840a3;
      Math.random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const rows = [];
      for (const dt of [1 / 60, 1 / 30, 1 / 20]) {
        const scene = new T.Scene(),
          f = GFX.create(T, scene),
          world = {
            bounds: { x0: -30, x1: 30, z0: -30, z1: 30 },
            heightAt: () => 0,
            colliders: [
              { type: "box", x0: -20, x1: 20, z0: -20, z1: 20, y0: 0, _top: 2 },
            ],
          },
          physics = GPhysics.get(world);
        f.setCasePhysics(physics);
        let sounds = 0;
        f.onCaseLand = () => sounds++;
        for (let i = 0; i < 130; i++)
          f.ejectCase(
            new T.Vector3(0, 3, 0),
            new T.Vector3(1, 0, 0),
            new T.Vector3(0, 1, 0),
          );
        check(physics.objects.size === 26, "pool grew above 26");
        for (let t = 0; t < 8; t += dt) {
          physics.begin(dt);
          f.update(dt, 0);
        }
        const brass = scene.getObjectByName("spentBrass"),
          m = new T.Matrix4(),
          pos = new T.Vector3(),
          q = new T.Quaternion(),
          scale = new T.Vector3();
        let minY = Infinity,
          maxY = -Infinity;
        for (let i = 0; i < brass.count; i++) {
          brass.getMatrixAt(i, m);
          m.decompose(pos, q, scale);
          check(pos.toArray().every(Number.isFinite), "non-finite bake");
          minY = Math.min(minY, pos.y);
          maxY = Math.max(maxY, pos.y);
        }
        check(
          brass.count === 26,
          "not all cases settled on platform: " + brass.count,
        );
        check(minY > 1.985 && maxY < 2.03, "brass not on actual platform");
        check(f.caseStats().active === 0, "active case leak");
        check(physics.stats().brassPool.active === 0, "enabled body leak");
        // Re-enable a retired slot, then dispose while still airborne.
        f.ejectCase(
          new T.Vector3(0, 3, 0),
          new T.Vector3(1, 0, 0),
          new T.Vector3(0, 1, 0),
        );
        check(physics.stats().brassPool.active === 1, "slot did not re-enable");
        f.dispose();
        check(
          physics.objects.size === 0 && physics.sim.bodies.len() === 0,
          "dispose leaked Rapier bodies",
        );
        rows.push({
          dt,
          emitted: 131,
          capacity: 26,
          spent: brass.count,
          minY,
          maxY,
          sounds,
          disposed: true,
        });
        physics.sim.free();
      }
      Math.random = originalRandom;
      // Use the real game magazine drop function with AK-74, not a synthetic visual.
      const s = g.squad[0];
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
      g.step(2);
      const p = GPhysics.get(g.world);
      for (let i = 0; i < 13; i++) {
        check(g.dropMagazine(0), "AK-74 magazine clone failed");
        check(g.mags().length <= 8, "magazine list overflow");
        check(
          [...p.objects.values()].filter((o) => o.kind === "magazine").length <=
            8,
          "magazine body overflow",
        );
      }
      g.step(600);
      let mags = g.mags();
      check(mags.length === 8, "unexpected magazine cleanup");
      check(
        mags.every((m) => m.p.every(Number.isFinite)),
        "invalid magazine transform",
      );
      check(
        mags.every((m) => m.rest),
        "magazines did not settle",
      );
      check(
        [...p.objects.values()].filter(
          (o) => o.kind === "magazine" && !o.body.isSleeping(),
        ).length === 0,
        "resting magazines not sleeping",
      );
      const sleeping = [...p.objects.values()].find(
        (o) => o.kind === "magazine",
      );
      sleeping.body.applyImpulse({ x: 0, y: 0.66, z: 0 }, true);
      g.step(10);
      check(
        g.mags().some((m) => !m.rest),
        "magazine visual did not resume after physics wake",
      );
      g.step(300);
      mags = g.mags();
      check(
        mags.every((m) => m.rest),
        "woken magazine did not settle again",
      );
      return {
        pass: true,
        fixtureSeed: "0x1840a3",
        brass: rows,
        magazines: {
          drops: 13,
          wakeVisualResumed: true,
          retained: mags.length,
          resting: mags.filter((m) => m.rest).length,
          items: mags,
        },
        mainFx: g.fx.caseStats(),
        physics: p.stats(),
      };
    });
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(__dirname, "brass-browser.json"),
      JSON.stringify({ result, errors }, null, 2),
    );
    console.log(JSON.stringify({ result, errors }));
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
