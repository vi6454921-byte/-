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

  const result = await p.evaluate((armed) => {
    const g = __GAME,
      T = THREE;
    g.state.activeIdx = -1;
    g.state.paused = true;
    const rows = [];
    let vaultSnapshot = false;
    GContacts.config.projectArms = false;
    for (const index of [0, 1, 6, 7]) {
      const s = g.squad[index],
        c = s.ctrl;
      g.poseStand(index, {});
      const w = {
        bounds: { x0: -8, x1: 8, z0: -8, z1: 8 },
        heightAt: () => 0,
        blocked: () => false,
        colliders: [
          {
            type: "box",
            x0: 0.65,
            x1: 0.85,
            z0: -0.4,
            z1: 0.4,
            y0: 0.8,
            _top: 1.8,
          },
        ],
      };
      const p = GPhysics.get(w);
      c._physicsWorld = w;
      c.pos.set(0, 0.02, 0);
      c.yaw = 0;
      c.speed = 0;
      c.crouch = 0;
      c.prone = 0;
      s.motion = null;
      s.contactMode = "full";
      GAnimator.pose(s, 1 / 60, false, 0);
      s.rig.relaxArms(0, 0);
      s.char.root.updateMatrixWorld(true);
      const sh = s.char.bone("shoulderR"),
        el = s.char.bone("elbowR"),
        wr = s.char.bone("wristR"),
        start = sh.getWorldPosition(new T.Vector3());
      GRig.twoBoneIK(T, {
        root: sh,
        mid: el,
        tip: wr,
        target: new T.Vector3(0.72, start.y, 0),
        pole: new T.Vector3(0.3, start.y, -0.5),
        axis: el.position.clone().normalize(),
      });
      s.char.root.updateMatrixWorld(true);
      const qs = s.char.bones.map((b) => b.quaternion.clone()),
        lens = s.char.bones.map((b) => b.position.length());
      let contacts = 0,
        angle = 0,
        finite = true,
        maxGap = 0;
      for (let i = 0; i < 180; i++) {
        p.begin(1 / 60);
        s.char.bones.forEach((b, j) => b.quaternion.copy(qs[j]));
        s.char.root.updateMatrixWorld(true);
        GContacts.update(s, 1 / 60);
        contacts = Math.max(contacts, s.contactDebug?.contacts || 0);
        angle = Math.max(angle, s.contactDebug?.maxAngle || 0);
        for (let j = 0; j < s.char.bones.length; j++) {
          const b = s.char.bones[j];
          finite &&= b.quaternion.toArray().every(Number.isFinite);
          if (Math.abs(b.position.length() - lens[j]) > 1e-8)
            throw Error("stretched bind length");
        }
        p.sim.impulseJoints.forEach((j) => {
          const a = j.body1(),
            b = j.body2(),
            pa = new T.Vector3()
              .copy(j.anchor1())
              .applyQuaternion(new T.Quaternion().copy(a.rotation()))
              .add(new T.Vector3().copy(a.translation())),
            pb = new T.Vector3()
              .copy(j.anchor2())
              .applyQuaternion(new T.Quaternion().copy(b.rotation()))
              .add(new T.Vector3().copy(b.translation()));
          maxGap = Math.max(maxGap, pa.distanceTo(pb));
        });
      }
      rows.push({
        key: s.key,
        finite,
        contacts,
        angle,
        maxGap,
        parts: s.contactDebug?.parts,
      });
      GContacts.drop(p, s);
      p.dropPose(s);
      s.contactMode = null;
    }
    GContacts.config.projectArms = true;
    const s = g.squad[0],
      c = s.ctrl;
    const w = {
        bounds: { x0: -8, x1: 8, z0: -8, z1: 8 },
        heightAt: () => 0,
        blocked: () => false,
        colliders: [
          { type: "box", x0: -1, x1: 1, z0: -1.2, z1: -0.6, y0: 0, _top: 0.65 },
        ],
      },
      p = GPhysics.get(w);
    c._physicsWorld = w;
    c.pos.set(0, 0.025, 0);
    c.vel.set(0, 0, 0);
    c.yaw = 0;
    c.pitch = 0;
    c.speed = 0;
    c.crouch = 0;
    c.prone = 0;
    c.grounded = true;
    c.stamina = 10;
    c.injLeg = 0;
    c.injArm = 0;
    s.motion = null;
    g.embody(0);
    AEGIS_GAME.setLoadout(s.key, {
      slots: armed
        ? [
            { t: "gun", id: "ak74" },
            null,
            { t: "ammo", w: "primary" },
            null,
            null,
            null,
          ]
        : [null, null, null, null, null, null],
      cfg: {},
    });
    g.equipStand(0, 0);
    const oldGun = s.gun;
    c.armed = armed;
    let maxFPError = 0,
      fpFrames = 0,
      hiddenGunFrames = 0;

    p.begin(1 / 60);
    p.move(c, 1 / 60, -9.81);
    p.begin(1 / 60);
    c.grounded = true;
    if (!GTraversal.tryStart(c, w, { vaultMax: 1.3, stepUp: 0.32 }))
      throw Error("vault start rejected");
    let frames = 0,
      handsOff = false,
      handFrames = 0,
      maxHandError = 0,
      contactFrames = 0,
      maxAngle = 0;
    while (c.vault && frames++ < 180) {
      p.begin(1 / 60);
      GTraversal.update(c, w, 1 / 60);
      GAnimator.pose(s, 1 / 60, false, frames / 60);
      s.rig.relaxArms(0, 0);
      GAnimator.solveTraversalHands(s);
      GContacts.update(s, 1 / 60);
      GAnimator.solveTraversalHands(s);
      g.BC.update(1 / 60, s, "fp");
      // v23: низкое перешагивание с оружием в руках — без упора ладонями (c.vault.handsOff)
      if (c.vault?.handsOff) handsOff = true;
      /* v23: руки от первого лица рисуются только в упоре (вне его риг скрыт) и в упоре
         ладони чуть дальше по верху преграды (до 14 см) — сверяем видимые кадры с допуском */
      if (c.vault && !c.vault.handsOff && g.BC.rig.root.visible) {
        fpFrames++;
        g.BC.rig.root.updateMatrixWorld(true);
        for (const side of ["R", "L"]) {
          const glove = side === "R" ? g.BC.rig.right : g.BC.rig.left;
          const a = glove.anchor.getWorldPosition(new T.Vector3()),
            q = s.char.hands[side].anchor.getWorldPosition(new T.Vector3());
          maxFPError = Math.max(maxFPError, a.distanceTo(q));
          if (!a.toArray().every(Number.isFinite))
            throw Error("nonfinite first-person hand");
        }
        if (s.gun?.root.visible === false) hiddenGunFrames++;
      } else if (c.vault && armed && s.gun?.root.visible === false) hiddenGunFrames++;
      if (c._vaultHands && Object.keys(c._vaultHands).length) {
        handFrames++;
        for (const side of Object.keys(c._vaultHands))
          maxHandError = Math.max(
            maxHandError,
            s.char
              .bone("wrist" + side)
              .getWorldPosition(new T.Vector3())
              .distanceTo(new T.Vector3().copy(c._vaultHands[side])),
          );
      }
      if (s.contactDebug?.contacts) contactFrames++;
      maxAngle = Math.max(maxAngle, s.contactDebug?.maxAngle || 0);
      if (c.vault && !vaultSnapshot && c.vault.t / c.vault.dur > 0.22) {
        for (const o of g.scene.children)
          o.visible = o.isLight || o === s.char.root;
        s.char.root.visible = true;
        const mat = new T.MeshStandardMaterial({ color: 0x808a88 }),
          box = new T.Mesh(new T.BoxGeometry(2, 0.65, 0.6), mat);
        box.position.set(0, 0.325, -0.9);
        g.scene.add(box);
        const grid = new T.GridHelper(8, 24, 0xaaaaaa, 0x697a80);
        g.scene.add(grid);
        g.scene.fog = null;
        g.scene.background = new T.Color(0x667680);
        g.camera.position.set(2, 1.7, 2.4);
        g.camera.lookAt(0, 0.9, -0.6);
        g.camera.fov = 42;
        g.camera.updateProjectionMatrix();
        g.renderer.setSize(800, 600);
        g.renderer.shadowMap.enabled = false;
        g.renderer.render(g.scene, g.camera);
        window.__vaultPNG = g.renderer.domElement.toDataURL("image/png");
        box.visible = false;
        grid.visible = false;
        vaultSnapshot = true;
      }
    }
    const vault = {
      armed,
      handsOff,
      maxFPError,
      fpFrames,
      hiddenGunFrames,
      result: c._vaultResult,
      frames,
      handFrames,
      maxHandError,
      contactFrames,
      maxAngle,
      pos: c.pos.toArray(),
    };
    GContacts.drop(p, s);
    p.dropPose(s);
    g.BC.update(1 / 60, s, "fp");
    vault.restoredWeapon = !armed || s.gun.root.visible;
    s.gun = oldGun;
    return { rows, vault, geometry: GGeometry.stats() };
  }, !!process.env.ARMED);
  const png = await p.evaluate(() => window.__vaultPNG);
  if (png)
    fs.writeFileSync(
      __dirname +
        (process.env.ARMED
          ? "/visual-vault-armed-v3.png"
          : "/visual-vault-v3.png"),
      Buffer.from(png.split(",")[1], "base64"),
    );
  fs.writeFileSync(
    __dirname +
      (process.env.ARMED
        ? "/quality-v3-browser-armed.json"
        : "/quality-v3-browser.json"),
    JSON.stringify({ result, errors }, null, 2),
  );
  console.log(JSON.stringify({ result, errors }));
  await b.close();
  if (
    errors.length ||
    result.rows.some((x) => !x.finite || x.maxGap > 0.09) ||
    result.vault.result !== "landed" ||
    (result.vault.handsOff
      ? result.vault.handFrames > 0 || (result.vault.armed && result.vault.hiddenGunFrames > 0)
      : result.vault.handFrames < 5 ||
        result.vault.maxHandError > 0.16 ||
        result.vault.fpFrames < 5 ||
        result.vault.maxFPError > 0.2) ||
    !result.vault.restoredWeapon ||
    result.geometry.failures > 0
  )
    process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
