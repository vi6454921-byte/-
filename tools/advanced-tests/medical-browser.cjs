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
  const result = await p.evaluate(
    async ({ armed, barrier, elevated }) => {
      const g = __GAME,
        T = THREE;
      g.state.paused = true;
      g.state.noRender = true;
      g.state.activeIdx = -1;
      g.step(1);
      const m = g.squad[0],
        q = g.squad.find(
          (s, i) => i > 0 && s.char.preset.faction === m.char.preset.faction,
        );
      for (const s of g.squad)
        if (s !== m && s !== q) {
          s.dead = true;
          s.finished = true;
        }
      if (g.combat) {
        g.combat.update = () => {};
        g.combat.drive = () => {};
      }
      // A controlled clinical test needs an actually clear floor for BOTH actors.
      // Previously q=x+1.1 could begin inside a crate and be ejected onto its roof.
      const bounds = g.world.bounds;
      let p = null;
      outer: for (let x = bounds.x0 + 3; x < bounds.x1 - 3; x += 2)
        for (let z = bounds.z0 + 3; z < bounds.z1 - 3; z += 2) {
          const y = g.world.heightAt(x, z);
          if (
            g.world.blocked(x, z, y, 2.3) ||
            g.world.blocked(x - 1.5, z, y, 1)
          )
            continue;
          if (
            g.squad.some(
              (s) =>
                s !== m &&
                s !== q &&
                Math.hypot(s.ctrl.pos.x - x, s.ctrl.pos.z - z) < 4,
            )
          )
            continue;
          if (
            [
              [2, 2],
              [2, -2],
              [-2, 2],
              [-2, -2],
            ].some(
              ([dx, dz]) =>
                Math.abs(g.world.heightAt(x + dx, z + dz) - y) > 0.06,
            )
          )
            continue;
          p = { x, y, z };
          break outer;
        }
      if (!p) throw new Error("No clear controlled medical floor");
      if (elevated) {
        p = null;
        outerElevated: for (let x = bounds.x0 + 8; x < bounds.x1 - 6; x += 2)
          for (let z = bounds.z0 + 4; z < bounds.z1 - 4; z += 2) {
            const y = g.world.heightAt(x, z);
            let okay = true;
            for (let dx = -6; dx <= 4; dx += 0.5)
              for (let dz = -1.7; dz <= 1.7; dz += 0.7)
                if (
                  g.world.blocked(x + dx, z + dz, y, 0.38) ||
                  Math.abs(g.world.heightAt(x + dx, z + dz) - y) > 0.04
                )
                  okay = false;
            if (okay) {
              p = { x, y, z };
              break outerElevated;
            }
          }
        if (!p) throw Error("No clear elevated clinical fixture area");
        const ph = GPhysics.get(g.world);
        const add = (x0, x1, z0, z1, y0, y1) =>
          ph.sim.createCollider(
            RAPIER.ColliderDesc.cuboid(
              (x1 - x0) / 2,
              (y1 - y0) / 2,
              (z1 - z0) / 2,
            )
              .setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
              .setCollisionGroups(0x0001001e),
          );
        add(p.x, p.x + 4, p.z - 1.7, p.z + 1.7, p.y + 1.8, p.y + 2);
        for (let i = 0; i < 8; i++)
          add(
            p.x - 4 + i * 0.5,
            p.x - 3.5 + i * 0.5,
            p.z - 1.4,
            p.z + 1.4,
            p.y,
            p.y + (i + 1) * 0.25,
          );
        ph.navRevision++;
      }
      m.ctrl.pos.set(p.x - (elevated ? 5.2 : 1.5), p.y, p.z);
      q.ctrl.pos.set(
        p.x + (elevated ? 1.4 : 0),
        p.y + (elevated ? 2.02 : 0),
        p.z,
      );
      m.ctrl.vel.set(0, 0, 0);
      q.ctrl.vel.set(0, 0, 0);
      m.ctrl.trait = { ...m.ctrl.trait, id: "medic" };
      m.ctrl.reload = -1;
      m.thr = null;
      m.tac = null;
      q.thr = null;
      q.tac = null;
      if (armed) {
        AEGIS_GAME.setLoadout(m.key, {
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
        g.equipStand(g.squad.indexOf(m), 0);
      }
      g.poseStand(g.squad.indexOf(m), {});
      g.poseStand(g.squad.indexOf(q), {});
      g.dmg._standCollapse(q);
      q.deathKind = "leg";
      q.dmg.ph.src = [];
      g.step(180);
      if (barrier) {
        const obstacle = {
          type: "box",
          x0: p.x - 0.95,
          x1: p.x - 0.78,
          z0: p.z - 0.5,
          z1: p.z + 0.5,
          y0: p.y,
          _top: p.y + 1.25,
        };
        g.world.colliders.push(obstacle);
        const old = g.world.blocked.bind(g.world);
        g.world.blocked = (x, z, y, r = 0) =>
          old(x, z, y, r) ||
          (x > obstacle.x0 - r &&
            x < obstacle.x1 + r &&
            z > obstacle.z0 - r &&
            z < obstacle.z1 + r &&
            y < obstacle._top);
        GPhysics.get(g.world).sim.createCollider(
          RAPIER.ColliderDesc.cuboid(0.085, 0.625, 0.5)
            .setTranslation(p.x - 0.865, p.y + 0.625, p.z)
            .setCollisionGroups(0x0001001e),
        );
      }
      if ((barrier || elevated) && window.GNavigation) {
        if (barrier) GPhysics.get(g.world).navRevision++;
        await GNavigation.get(g.world).rebuild();
      }
      q.dmg.ph.src.push({
        key: "controlled-arterial-leg",
        zone: "thigh",
        side: "L",
        comp: "limb",
        rate: 4,
        art: true,
        dressed: 0,
      });
      const before = { ...g.med.kit(m) },
        samples = [];
      for (let i = 0; i < 2400; i++) {
        for (const x of g.squad) x.deadT = 0;
        g.step(1);
        if (i % 60 === 0)
          samples.push({
            t: i / 60,
            mode: m.tac?.mode,
            dist: Math.hypot(
              m.ctrl.pos.x - q.rd.p[g.dmg.PI.pelvis * 3],
              m.ctrl.pos.z - q.rd.p[g.dmg.PI.pelvis * 3 + 2],
            ),
            job: !!m.med?.job,
            hand: m._tacHands,
            prone: m.ctrl.prone,
          });
        if (q.dmg.ph.src[0]?.tq) break;
      }
      return {
        m: m.key,
        q: q.key,
        elevated: !!elevated,
        fixture: p,
        medicalFloorY: m.ctrl.pos.y,
        before: { tq: before.tq, bd: before.bd },
        after: { tq: m.med?.tq, bd: m.med?.bd },
        wound: q.dmg.ph.src[0],
        samples,
        medical: g._C.tactics?.stats(),
        debug: {
          pos: m.ctrl.pos.toArray(),
          patient: [
            q.rd.p[g.dmg.PI.pelvis * 3],
            q.rd.p[g.dmg.PI.pelvis * 3 + 1],
            q.rd.p[g.dmg.PI.pelvis * 3 + 2],
          ],
          goal: m.tac?.goal,
          path: m.tac?.agent?.battle?.path,
          pathAt: m.tac?.pathAt,
          wish: m.ctrl.aiWish?.toArray(),
          speed: m.ctrl.speed,
          hasGun: !!m.gun,
          arms: ["R", "L"].map((side) => ({
            side,
            wrist: m.char
              .bone("wrist" + side)
              .getWorldPosition(new T.Vector3())
              .toArray(),
            shoulder: m.char
              .bone("shoulder" + side)
              .getWorldPosition(new T.Vector3())
              .toArray(),
          })),
        },
      };
    },
    {
      armed: !!process.env.ARMED,
      barrier: !!process.env.BARRIER,
      elevated: !!process.env.ELEVATED,
    },
  );
  fs.writeFileSync(
    __dirname +
      (process.env.ELEVATED
        ? "/medical-elevated" + (process.env.ARMED ? "-armed" : "") + ".json"
        : process.env.BARRIER
          ? "/medical-barrier" + (process.env.ARMED ? "-armed" : "") + ".json"
          : process.env.ARMED
            ? "/medical-browser-armed.json"
            : "/medical-browser.json"),
    JSON.stringify({ result, errors }, null, 2),
  );
  console.log(JSON.stringify({ result, errors }));
  await b.close();
  process.exit(
    errors.length ||
      (process.env.ELEVATED && result.medicalFloorY < result.fixture.y + 1.8) ||
      !result.wound.tq ||
      result.after.tq !== result.before.tq - 1
      ? 1
      : 0,
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
