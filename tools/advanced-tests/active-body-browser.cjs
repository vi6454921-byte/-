const { chromium } = require("playwright"),
  fs = require("fs"),
  assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/local/bin/chromium",
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  try {
    const p = await b.newPage({ viewport: { width: 1000, height: 700 } }),
      errors = [];
    p.on("pageerror", (e) => {
      errors.push(e.message);
      console.error(e.message);
    });
    await p.addInitScript(() => {
      window.__ACTIVEBODY_RENDER = false;
      localStorage.setItem(
        "aegis.settings",
        JSON.stringify({ quality: "low", volume: 0, calloutSpeech: false }),
      );
    });
    await p.route("**/js/polygon/29_game.js", async (route) => {
      const r = await route.fetch();
      let s = await r.text();
      s = s.replace(
        "const go = () => { warm(); startGame(); };",
        "const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();",
      );
      await route.fulfill({ response: r, body: s });
    });
    await p.goto(
      (process.env.BASE_URL || "http://127.0.0.1:8774/") +
        "index.html?activebodylab&map=angar_map",
    );
    await p.waitForFunction(() => window.__ACTIVEBODYLAB, null, {
      timeout: 180000,
    });
    const result = await p.evaluate(() => {
      const L = __ACTIVEBODYLAB,
        T = THREE;
      L.state.paused = true;
      const results = [];
      const indices = [
        ...new Map(__GAME.squad.map((s, i) => [s.char.key, i])).values(),
      ];
      for (const i of indices) {
        L.state.i = i;
        L.state.offset = 0;
        const r = L.reset(),
          rows = [];
        let maxTilt = 0,
          minHeight = 99,
          maxGap = 0;
        for (let n = 0; n < 900; n++) {
          if (n === 180) GActiveBody.impulse(L.soldier, { x: 6, y: 0, z: 0 });
          L.step(1 / 60);
          if (n > 60) {
            maxTilt = Math.max(maxTilt, r.tilt);
            minHeight = Math.min(minHeight, r.byName.hips.currP.y);
          }
          for (const a of r.parts)
            if (a.parent) {
              const aa = new T.Vector3()
                  .copy(a.joint.anchor1())
                  .applyQuaternion(
                    new T.Quaternion().copy(a.parent.body.rotation()),
                  )
                  .add(a.parent.body.translation()),
                bb = new T.Vector3()
                  .copy(a.joint.anchor2())
                  .applyQuaternion(new T.Quaternion().copy(a.body.rotation()))
                  .add(a.body.translation());
              maxGap = Math.max(maxGap, aa.distanceTo(bb));
            }
          if (n % 60 === 0)
            rows.push({
              t: n / 60,
              state: r.state,
              support: r.support,
              tilt: r.tilt,
              hip: r.byName.hips.currP.toArray(),
            });
        }
        results.push({
          i,
          key: L.soldier.key,
          preset: L.soldier.char.key,
          hipHeight: r.hipHeight,
          parts: r.parts.length,
          allDynamic: r.parts.every(
            (a) => a.body.isDynamic() && a.body.gravityScale() === 1,
          ),
          hiddenActors: L.physics.actors.size,
          maxTilt,
          minHeight,
          maxGap,
          stats: GActiveBody.stats(L.physics)[0],
          rows,
        });
      }
      L.state.i = 0;
      L.state.offset = 0;
      L.reset();
      for (let n = 0; n < 120; n++) L.step(1 / 60);
      GActiveBody.impulse(L.soldier, { x: 60, y: 0, z: 0 });
      const strong = [];
      for (let n = 0; n < 600; n++) {
        L.step(1 / 60);
        if (n % 60 === 0)
          strong.push({
            t: n / 60,
            ...GActiveBody.stats(L.physics)[0],
            hip: GActiveBody.get(L.soldier).byName.hips.currP.toArray(),
            allFinite: GActiveBody.get(L.soldier).parts.every((a) =>
              [
                ...Object.values(a.body.translation()),
                ...Object.values(a.body.rotation()),
                ...Object.values(a.body.linvel()),
                ...Object.values(a.body.angvel()),
              ].every(Number.isFinite),
            ),
          });
      }
      L.state.offset = 2;
      L.reset();
      const air = [];
      for (let n = 0; n < 30; n++) {
        L.step(1 / 60);
        if (n % 5 === 0)
          air.push({
            t: (n + 1) / 60,
            support: GActiveBody.get(L.soldier).support,
            y: GActiveBody.get(L.soldier).byName.hips.currP.y,
          });
      }
      L.state.offset = 0;
      L.reset();
      for (let n = 0; n < 120; n++) L.step(1 / 60);
      GActiveBody.captureAndApply(L.soldier, false);
      const g = __GAME,
        hip = GActiveBody.get(L.soldier).byName.hips.currP;
      g.camera.position.copy(hip).add(new T.Vector3(2, 1, -3));
      g.camera.lookAt(hip);
      g.camera.updateProjectionMatrix();
      g.renderer.render(g.scene, g.camera);
      return {
        scope:
          "Rendering / integration diagnostic only. Does not certify balance or locomotion.",
        results,
        strong,
        air,
        glError: g.renderer.getContext().getError(),
        png: g.renderer.domElement.toDataURL("image/png"),
      };
    });
    fs.writeFileSync(
      __dirname + "/active-body-preview.png",
      Buffer.from(result.png.split(",")[1], "base64"),
    );
    delete result.png;
    fs.writeFileSync(
      __dirname + "/active-body-browser.json",
      JSON.stringify({ result, errors }, null, 2),
    );
    console.log(
      JSON.stringify({
        models: result.results.map((x) => ({
          key: x.key,
          minHeight: x.minHeight,
          maxTilt: x.maxTilt,
          maxGap: x.maxGap,
          state: x.stats.state,
        })),
        strong: result.strong.map((x) => ({
          t: x.t,
          state: x.state,
          y: x.hip[1],
        })),
        air: result.air,
        errors,
        glError: result.glError,
      }),
    );
    assert.equal(errors.length, 0);
    assert.equal(result.glError, 0);
    assert.equal(result.results.length, 4);
    for (const model of result.results) {
      assert.equal(model.parts, 19);
      assert.equal(model.allDynamic, true);
      assert.equal(model.hiddenActors, 0);
      assert.ok(model.maxGap < 0.2);
      assert.equal(model.stats.state, "standing");
      assert.ok(model.minHeight > model.hipHeight * 0.8);
      assert.ok(model.maxTilt < 0.5);
    }
    assert.ok(
      result.strong.every((x) => x.allFinite),
      "strong push stays numerically finite",
    );
    assert.ok(result.air.every((x) => x.support === 0));
    assert.ok(result.air.at(-1).y < result.air[0].y - 0.6);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
