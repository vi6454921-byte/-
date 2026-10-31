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
    s = s.replace(
      "      const dir0 = new THREE.Vector3(Math.tan(zsol.wind),Math.tan(zsol.elev),-1).normalize().applyQuaternion(wq).normalize();",
      `      const dir0 = new THREE.Vector3(Math.tan(zsol.wind),Math.tan(zsol.elev),-1).normalize().applyQuaternion(wq).normalize();
      if(window.__recordAim){const q=squad.find(q=>!q.dead&&q.char.preset.faction!==s.char.preset.faction);if(q){const target=q.ctrl.pos.clone().add(new THREE.Vector3(0,s.battle?.aimHeight||1.25,0)),v=target.sub(origin),along=v.dot(dir0),miss=v.addScaledVector(dir0,-along).length();(window.__aimSamples||(window.__aimSamples=[])).push({key:s.key,ads:c.ads,pitch:c.pitch,miss,along,observedHeight:s.battle?.aimHeight,targetCrouch:q.ctrl.crouch,targetProne:q.ctrl.prone});}}`,
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
      T = THREE,
      left = g.squad.find((s) => s.char.preset.faction === "delta"),
      right = g.squad.find((s) => s.char.preset.faction === "alpha");
    for (const s of g.squad)
      if (s !== left && s !== right) {
        s.dead = true;
        s.finished = true;
        s.char.root.visible = false;
      }
    g.embody(g.squad.indexOf(right));
    g.setInput({ lock: false, trigger: false, ads: false });
    for (const s of [left, right]) {
      AEGIS_GAME.setLoadout(s.key, {
        slots:
          s === left
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
      g.equipStand(g.squad.indexOf(s), 0);
      s.thr = null;
      s.tac = null;
      s.battle = null;
      s.ctrl.vel.set(0, 0, 0);
      s.ctrl.reload = -1;
    }
    const w = g.world,
      b = w.bounds;
    let spawn = null;
    outer: for (let x = b.x0 + 4; x < b.x1 - 4; x += 3)
      for (let z = b.z0 + 13; z < b.z1 - 4; z += 3) {
        const y = w.heightAt(x, z);
        let okay = true;
        for (let k = 0; k <= 8; k++) {
          const yy = w.heightAt(x, z - k);
          if (Math.abs(yy - y) > 0.05 || w.blocked(x, z - k, yy, 2.2)) {
            okay = false;
            break;
          }
        }
        if (
          okay &&
          g._C.worldVisibleExact(
            new T.Vector3(x, y + 1.3, z),
            new T.Vector3(x, y + 1.3, z - 8),
          )
        ) {
          spawn = { x, y, z };
          break outer;
        }
      }
    if (!spawn) throw Error("No clear duel floor");
    left.ctrl.pos.set(spawn.x, spawn.y + 0.02, spawn.z);
    right.ctrl.pos.set(spawn.x, spawn.y + 0.02, spawn.z - 8);
    left.ctrl.yaw = left.idleYaw = 0;
    right.ctrl.yaw = right.idleYaw = Math.PI;
    g.poseStand(g.squad.indexOf(left), { ready: 1, ads: 1 });
    left.ctrl.yaw = left.idleYaw = 0;
    left.ctrl.lagYaw = 0;
    g.poseStand(g.squad.indexOf(right), {});
    right.ctrl.yaw = Math.PI;
    window.__recordAim = true;
    const before = (right.dmg?.ph?.src || []).length;
    for (let i = 0; i < 1200 && !right.dead && !right.rd; i++) g.step(1);
    return {
      spawn,
      before,
      wounds: right.dmg?.ph?.src,
      after: (right.dmg?.ph?.src || []).length,
      dead: !!right.dead,
      collapsed: !!right.rd,
      shots: window.__aimSamples || [],
      ai: g.combat.stats(),
      geometry: GGeometry.stats(),
    };
  });
  fs.writeFileSync(
    __dirname + "/combat-aim-browser.json",
    JSON.stringify({ result, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      hit: result.after > result.before || result.dead || result.collapsed,
      shots: result.shots.length,
      minBoreMiss: Math.min(...result.shots.map((s) => s.miss)),
      errors,
    }),
  );
  await b.close();
  if (
    errors.length ||
    !result.shots.length ||
    !(result.after > result.before || result.dead || result.collapsed)
  )
    process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
