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
      s = g.squad[0];
    g.state.noRender = true;
    g.state.paused = true;
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
    // Clear line of fire: the spawn group can legitimately force weapon tuck.
    const bounds = g.world.bounds;
    let clear = null;
    outer: for (let x = bounds.x0 + 5; x < bounds.x1 - 5; x += 3)
      for (let z = bounds.z0 + 12; z < bounds.z1 - 5; z += 3) {
        const y = g.world.heightAt(x, z);
        if (
          g.squad.some(
            (q) =>
              q !== s && Math.hypot(q.ctrl.pos.x - x, q.ctrl.pos.z - z) < 6,
          )
        )
          continue;
        if (
          [0, 1, 2, 3, 4, 5, 6, 7, 8].some(
            (k) =>
              Math.abs(g.world.heightAt(x, z - k) - y) > 0.05 ||
              g.world.blocked(x, z - k, y, 2.2),
          )
        )
          continue;
        if (
          !g._C.worldVisibleExact(
            new THREE.Vector3(x, y + 1.3, z),
            new THREE.Vector3(x, y + 1.3, z - 8),
          )
        )
          continue;
        clear = { x, y, z };
        break outer;
      }
    if (!clear) throw Error("No clear FP rendering floor");
    s.ctrl.pos.set(clear.x, clear.y + 0.02, clear.z);
    s.ctrl.yaw = 0;
    s.ctrl.pitch = 0;
    s.ctrl.vel.set(0, 0, 0);
    g.embody(0);
    g.setInput({ lock: true, ads: true });
    g.step(45);
    g.renderNow(1 / 60);
    g.renderNow(1 / 60);
    const chain = (o) => {
      const a = [];
      for (; o; o = o.parent)
        a.push({ name: o.name || o.type, visible: o.visible });
      return a;
    };
    const fp = {
      visible: g.BC.rig.root.visible,
      fov: g.camera.fov,
      gunVisible: s.gun?.root.visible,
      curKind: g.BC.item?.kind,
      rigTuck: g.BC.rig.tuck,
      gunChain: chain(s.gun?.root),
      rigChain: chain(g.BC.rig.root),
      camera: g.camera.position.toArray(),
      muzzle: s.gun?.gun
        .localToWorld(s.gun.muzzleLocal.clone())
        .project(g.camera)
        .toArray(),
      rightHand: g.BC.rig.right.anchor
        .getWorldPosition(new THREE.Vector3())
        .project(g.camera)
        .toArray(),
    };
    const fpPNG = g.renderer.domElement.toDataURL("image/png");
    g.setInput({ lock: false, ads: false });
    g.disembody();
    g.step(1);
    g.camera.position.copy(s.ctrl.pos).add(new THREE.Vector3(3, 2.8, 4));
    g.camera.lookAt(s.ctrl.pos.clone().add(new THREE.Vector3(0, 1, 0)));
    g.camera.fov = 65;
    g.camera.updateProjectionMatrix();
    g.renderNow(1 / 60);
    return {
      fp,
      fpPNG,
      info: g.info(),
      render: g.renderer.info.render,
      glError: g.renderer.getContext().getError(),
      geometry: GGeometry.stats(),
      png: g.renderer.domElement.toDataURL("image/png"),
    };
  });
  fs.writeFileSync(
    __dirname + "/visual-main-fp.png",
    Buffer.from(result.fpPNG.split(",")[1], "base64"),
  );
  delete result.fpPNG;
  fs.writeFileSync(
    __dirname + "/visual-main-map.png",
    Buffer.from(result.png.split(",")[1], "base64"),
  );
  delete result.png;
  fs.writeFileSync(
    __dirname + "/render-browser.json",
    JSON.stringify({ result, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      fp: result.fp,
      render: result.render,
      glError: result.glError,
      errors,
    }),
  );
  await b.close();
  if (
    errors.length ||
    result.glError ||
    !result.fp.visible ||
    result.fp.curKind !== "gun" ||
    !result.fp.gunVisible ||
    Math.abs(result.fp.muzzle[0]) > 1 ||
    Math.abs(result.fp.muzzle[1]) > 1
  )
    process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
