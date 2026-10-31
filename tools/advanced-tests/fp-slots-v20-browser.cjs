// v20 FP regression (PC build): weapon and hands must stay on screen after reload,
// grenade round-trips and pressing the slot of the item already held.
// v19: a single press of the current slot holstered the item -> "hands and weapon vanish".
// Run: CHROMIUM_PATH=... BASE_URL=http://127.0.0.1:8000/ npm run test:fp:v20
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
    s = s.replace("const MOVE_ACT = { fwd: 1,", "window.__ACT=(a,d,r)=>doAction(a,d,r); const MOVE_ACT = { fwd: 1,");
    await route.fulfill({ response: r, body: s });
  });
  await p.goto((process.env.BASE_URL || "http://127.0.0.1:8000/") + "index.html?map=" + MAP);
  await p.waitForFunction(() => window.__GAME && window.AEGIS_GAME, null, { timeout: 600000 });
  const res = await p.evaluate(() => {
    try { AEGIS_INTRO && AEGIS_INTRO.close(); } catch (e) {}
    const g = __GAME, S = g.state, T = THREE, cam = g.camera, BC = g.BC;
    S.paused = true;
    let idx = g.squad.findIndex((s) => s.team === "alpha" && s.L && s.L.slots.some((x) => x && x.t === "grenade"));
    if (idx < 0) { idx = g.squad.findIndex((s) => !s.general && s.team === "alpha"); const L = g.squad[idx].L; L.slots[3] = { t: "grenade", g: "m67" }; L.slots[4] = { t: "grenade", g: "m84" }; g.squad[idx].used = {}; }
    g.embody(idx >= 0 ? idx : 0); g.setInput({ lock: true });
    // keep the test soldier safe from the battle: freeze AI enemies far away
    const s = g.squad[S.activeIdx];
    const run = (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) { s.dmg && s.dmg.ph && (s.dmg.ph.hp = 100); g.step(1, 1 / 60); } };
    const tap = (a) => { __ACT(a, true); __ACT(a, false); };
    const slotOf = (t) => s.L.slots.findIndex((x) => x && x.t === t);
    const view = () => {
      const it = BC.item, rig = BC.rig;
      let ndc = null, onScreen = false;
      if (it && it.kind === "gun") { it.w.root.updateMatrixWorld(true); const v = new T.Box3().setFromObject(it.w.root).getCenter(new T.Vector3()).project(cam); ndc = [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(3)]; onScreen = Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1; }
      return { item: it ? it.kind : null, slot: s.slot, rig: !!rig.root.visible, gun: !!(it && it.kind === "gun" && it.w.root.visible), ndc, onScreen, lowerW: +rig.lowerW.toFixed(2), heals: BC.healCount ? BC.healCount() : -1 };
    };
    const out = {};
    run(1.5);
    const wi = slotOf("gun"), gi = slotOf("grenade");
    out.start = view(); out.slots = s.L.slots.map((x) => x && x.t);
    tap("slot" + (wi + 1)); run(1.2); out.pressCurrentSlot = view();
    if (!BC.item) { tap("slot" + (wi + 1)); run(1.2); }
    s.ctrl.mag = Math.max(0, (s.ctrl.mag || 30) - 7); tap("reload"); run(3.5); out.afterReload = view();
    tap("slot" + (wi + 1)); run(1.2); out.reloadThenSlot = view();
    if (!BC.item) { tap("slot" + (wi + 1)); run(1.2); }
    if (gi >= 0) {
      tap("slot" + (gi + 1)); run(1.0); out.grenadeInHand = view();
      __ACT("fire", true); run(0.25); __ACT("fire", false); run(3.0); out.afterThrow = view();
      tap("slot" + (wi + 1)); run(1.2); out.throwThenSlot = view();
      if (!BC.item) { tap("slot" + (wi + 1)); run(1.2); }
    }
    tap("grenade"); run(0.8); tap("grenade"); run(3.0); out.afterQuickG = view();
    tap("slot" + (wi + 1)); run(1.2); out.quickGThenSlot = view();
    if (!BC.item) { tap("slot" + (wi + 1)); run(1.2); }
    // explicit holster = double tap
    tap("slot" + (wi + 1)); tap("slot" + (wi + 1)); run(1.2); out.doubleTap = view();
    tap("slot" + (wi + 1)); run(1.2); out.redraw = view();
    return out;
  });
  res.errors = errors;
  fs.writeFileSync(__dirname + "/fp-slots-v20.json", JSON.stringify(res, null, 1));
  for (const [k, v] of Object.entries(res)) console.log(k, JSON.stringify(v));
  await b.close();
  const held = (v) => v && v.item === "gun" && v.rig && v.gun && v.onScreen;
  const fails = [];
  for (const k of ["start", "pressCurrentSlot", "afterReload", "reloadThenSlot", "afterThrow", "throwThenSlot", "afterQuickG", "quickGThenSlot", "redraw"])
    if (k in res && !held(res[k])) fails.push(k + ": weapon/hands not on screen");
  if (!res.doubleTap || res.doubleTap.item !== null) fails.push("doubleTap: double press must holster");
  if (Object.values(res).some((v) => v && v.heals > 0)) fails.push("view-model needed a NaN reset (healRig)");
  if (errors.length) fails.push("page errors: " + errors.length);
  if (fails.length) { console.error("FAIL", fails.join("; ")); process.exit(1); }
  console.log("PASS first-person weapon and hands stay visible (" + Object.keys(res).length + " states)");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
