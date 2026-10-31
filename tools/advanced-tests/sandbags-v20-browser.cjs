// v20 (PC build): NPCs must get over sandbag walls (respawn horseshoes ~1.05 m and map
// sandbag walls 0.6-0.8 m) by vaulting, without stumbling into a ragdoll fall.
// Run: CHROMIUM_PATH=... BASE_URL=http://127.0.0.1:8000/ npm run test:sandbags:v20
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const MAP = process.env.MAP || "stroyka_zarechye_v2";
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  p.on("pageerror", (e) => { errors.push(e.message); console.log("PAGEERROR", e.message); });
  await p.addInitScript(() => localStorage.setItem("aegis.settings", JSON.stringify({ quality: "low", volume: 0, calloutSpeech: false })));
  await p.route("**/js/polygon/29_game.js", async (route) => {
    let r = await route.fetch(), s = await r.text();
    s = s.replace("function renderFrame(dt) {", "function renderFrame(dt) { return;");
    s = s.replace("const go = () => { warm(); startGame(); };", "const go = () => { unhide(); S.noRender=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();");
    await route.fulfill({ response: r, body: s });
  });
  // v23: вся карта (?sector=all): с v21 бой идёт в секторе, и стенки вне его недостижимы
  await p.goto((process.env.BASE_URL || "http://127.0.0.1:8000/") + "index.html?map=" + MAP + "&sector=" + (process.env.SECTOR || "all"));
  await p.waitForFunction(() => window.__GAME && window.AEGIS_GAME, null, { timeout: 600000 });
  const res = await p.evaluate(() => {
    try { AEGIS_INTRO && AEGIS_INTRO.close(); } catch (e) {}
    const g = __GAME, S = g.state, W = g.world;
    S.paused = true;
    g.step(30, 1 / 60);
    const walls = [];
    for (const c of W.colliders) {
      if (c.type !== "box" || !c.obb || !c.source) continue;
      const kind = c.source.idx === -5 ? "respawn" : c.source.sandWall ? "mapbags" : null;
      if (!kind) continue;
      const o = c.obb;
      walls.push({ kind, o, x: o.x, z: o.z, h: +(c._top - c.y0).toFixed(2), th: 2 * Math.min(o.hw, o.hd), len: 2 * Math.max(o.hw, o.hd) });
    }
    const pick = [];
    const resp = walls.filter((w) => w.kind === "respawn" && w.len > 1.2), mb = walls.filter((w) => w.kind === "mapbags" && w.len > 1.2);
    for (let i = 0; i < 4 && i < resp.length; i++) pick.push(resp[(i * 5) % resp.length]);
    for (let i = 0; i < 4 && i < mb.length; i++) pick.push(mb[(i * 11) % mb.length]);
    const bots = g.squad.filter((s) => !s.general && !s.active);
    const comb = g.combat, oDrive = comb.drive.bind(comb), oFire = comb.fire;
    let test = null; const wish = new THREE.Vector2(0, -1);
    comb.drive = function (s, ...a) { if (s === test) { s.ctrl.aiWish = wish; s.ctrl.aiSprint = true; return; } return oDrive(s, ...a); };
    comb.fire = () => {}; // nobody shoots during the test: a bot must not die mid-run
    const results = [];
    /* v23: падения считаются только у испытуемого бота — глобальный счётчик GStumble
       ловил спотыкания других бойцов на карте (ложные провалы) */
    const fallLog = [], DMo = g.dmg, oSF = DMo && DMo.startFall;
    let curK = -1;
    if (oSF) DMo.startFall = function (s2) { const r = oSF.apply(this, arguments); if (r) fallLog.push({ k: curK, test: s2 === test, x: +s2.ctrl.pos.x.toFixed(1), z: +s2.ctrl.pos.z.toFixed(1) }); return r; };
    for (let k = 0; k < pick.length; k++) {
      curK = k;
      const wl = pick[k], s = bots[k];
      test = s; s.battle = null;
      const o = wl.o, thinX = o.hw < o.hd;
      const ax = thinX ? [o.c, -o.s] : [o.s, o.c]; const nx = ax[0], nz = ax[1];
      const side = k % 2 ? 1 : -1, dist = 2.0 + wl.th / 2;
      const x = wl.x + nx * side * dist, z = wl.z + nz * side * dist;
      const yawToWall = Math.atan2(-(wl.x - x), -(wl.z - z));
      const c = s.ctrl;
      c.pos.set(x, W.heightAt(x, z) + 0.05, z); c.vel.set(0, 0, 0); c.stamina = c.PHYS ? c.PHYS.staminaMax : 7; c.reload = -1;
      const off = (k % 3 - 1) * 0.6; // straight on and at ±0.6 rad
      c.yaw = yawToWall + off; s.idleYaw = c.yaw;
      const far = { x: wl.x - nx * side * 6, y: 0, z: wl.z - nz * side * 6 };
      const st0 = Object.assign({}, GStumble.stats());
      let vaulted = false, fell = false;
      for (let i = 0; i < 60 * 4; i++) {
        const d = yawToWall - c.yaw; wish.set(-Math.sin(d), -Math.cos(d));
        s.idleYaw = c.yaw;
        if (s.battle && !s.battle._locked) { Object.defineProperty(s.battle, "goal", { get: () => far, set() {}, configurable: true }); s.battle._locked = true; }
        g.step(1, 1 / 60);
        if (c.vault) vaulted = true;
        if (s._balance && s._balance.down) fell = true;
      }
      if (s.battle && s.battle._locked) { delete s.battle.goal; s.battle.goal = null; s.battle._locked = false; }
      const crossed = ((c.pos.x - wl.x) * nx + (c.pos.z - wl.z) * nz) * side < 0;
      const st1 = GStumble.stats();
      results.push({ k, kind: wl.kind, h: wl.h, off, vaulted, crossed, fell, dead: !!s.dead, falls: fallLog.filter((f) => f.k === k && f.test).length, worldFalls: st1.falls - st0.falls });
    }
    comb.drive = oDrive; comb.fire = oFire;
    if (oSF) DMo.startFall = oSF;
    return { walls: walls.length, results, fallLog, stumble: GStumble.stats() };
  });
  res.errors = errors;
  fs.writeFileSync(__dirname + "/sandbags-v20.json", JSON.stringify(res, null, 1));
  for (const r of res.results) console.log(JSON.stringify(r));
  await b.close();
  const live = res.results.filter((r) => !r.dead), fails = [];
  if (res.results.length < 6) fails.push("not enough sandbag walls found: " + res.results.length);
  if (live.length < res.results.length - 1) fails.push("bots died during the test: " + (res.results.length - live.length));
  for (const r of live) {
    if (r.fell || r.falls) fails.push(`#${r.k} ${r.kind} h=${r.h}: fell`);
    if (!r.crossed) fails.push(`#${r.k} ${r.kind} h=${r.h}: did not get over`);
  }
  if (errors.length) fails.push("page errors: " + errors.length);
  if (fails.length) { console.error("FAIL", fails.join("; ")); process.exit(1); }
  console.log(`PASS ${live.length} NPCs got over sandbag walls without falling`);
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
