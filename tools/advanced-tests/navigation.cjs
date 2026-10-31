const fs = require("fs"),
  vm = require("vm"),
  assert = require("node:assert/strict"),
  path = require("path");
const base = path.resolve(__dirname, "../..");
(async () => {
  const C = await import(base + "/vendor/recast/core.mjs");
  const G = await import(base + "/vendor/recast/generators.mjs");
  await C.init();
  const ctx = {
    console,
    performance,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    Float32Array,
    Uint32Array,
    WebAssembly,
    Buffer,
    atob,
    btoa,
    setTimeout,
    clearTimeout,
    GRecastCore: C,
    GRecastGenerate: G.generateTiledNavMesh,
  };
  ctx.window = ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of [
    "js/lib/three.min.js",
    "vendor/rapier/rapier.js",
    "js/advanced/physics.js",
    "js/advanced/navigation.js",
    "js/advanced/combat.js",
  ])
    vm.runInContext(fs.readFileSync(base + "/" + f, "utf8"), ctx, {
      filename: f,
    });
  await ctx.GPhysics.ready;
  const rows = [];
  const P = (x, y, z) => ({ x, y, z });
  const world = () => ({
    bounds: { x0: -12, x1: 12, z0: -12, z1: 12 },
    heightAt: () => 0,
    colliders: [],
    blocked: () => false,
  });
  const box = (x0, x1, z0, z1, y0 = 0, top = 3) => ({
    type: "box",
    x0,
    x1,
    z0,
    z1,
    y0,
    _top: top,
  });
  async function run(name, w, a, b, expect, inspect) {
    const surf = await ctx.GNavigation.prepare(w),
      r = surf.plan(a, b);
    assert.equal(r.state, expect, name + ": " + r.state);
    assert.ok(r.path.every((p) => Object.values(p).every(Number.isFinite)));
    if (inspect) inspect(r, surf);
    rows.push({
      name,
      state: r.state,
      points: r.path.length,
      build: surf.stats(),
    });
    return { surf, r };
  }
  let w = world();
  w.colliders = [box(-0.15, 0.15, -5, 5)];
  await run("wall detour", w, P(-4, 0, 0), P(4, 0, 0), "complete", (r) =>
    assert.ok(r.path.some((p) => Math.abs(p.z) > 5.3)),
  );
  w = world();
  w.colliders = [box(-0.15, 0.15, -12, 12)];
  await run(
    "disconnected wall is partial, never complete",
    w,
    P(-4, 0, 0),
    P(4, 0, 0),
    "partial",
  );
  w = world();
  w.colliders = [box(-0.15, 0.15, -12, -0.7), box(-0.15, 0.15, 0.7, 12)];
  await run("1.4m doorway", w, P(-4, 0, 0), P(4, 0, 0), "complete");
  w = world();
  w.colliders = [box(-0.15, 0.15, -12, -0.5), box(-0.15, 0.15, 0.5, 12)];
  await run("1.0m doorway", w, P(-4, 0, 0), P(4, 0, 0), "complete");
  w = world();
  w.colliders = [box(-0.15, 0.15, -12, -0.2), box(-0.15, 0.15, 0.2, 12)];
  await run(
    "0.4m doorway rejected for capsule",
    w,
    P(-4, 0, 0),
    P(4, 0, 0),
    "partial",
  );
  w = world();
  w.colliders = [box(-3, 3, -3, 3, 2.4, 2.65)];
  await run(
    "stacked floors cannot shortcut vertically",
    w,
    P(0, 0, 0),
    P(0, 2.65, 0),
    "unreachable",
    (_, s) => assert.equal(s.clear(P(0, 0, 0), P(0, 2.65, 0)), false),
  );
  w = world();
  w.colliders = [box(0, 4, -2, 2, 1.8, 2)];
  for (let i = 0; i < 8; i++)
    w.colliders.push(
      box(-4 + i * 0.5, -3.5 + i * 0.5, -1.4, 1.4, 0, (i + 1) * 0.25),
    );
  await run(
    "stairs to elevated floor",
    w,
    P(-6, 0, 0),
    P(2, 2, 0),
    "complete",
    (r) => assert.ok(r.path.some((p) => p.y > 1.8)),
  );
  for (const dt of [1 / 60, 1 / 30, 1 / 20]) {
    const ph = ctx.GPhysics.get(w),
      c = {
        pos: new ctx.THREE.Vector3(-6, 0, 0),
        vel: new ctx.THREE.Vector3(0, 0, 0),
        grounded: true,
        crouch: 0,
        prone: 0,
      };
    let command = 0,
      maxDelta = 0;
    for (let i = 0; i < Math.round(8 / dt); i++) {
      const last = c.pos.clone();
      ph.begin(dt);
      const want = Math.min(3, Math.max(-3, (2 - c.pos.x) * 4));
      command += Math.max(-9 * dt, Math.min(9 * dt, want - command));
      c.vel.x = command;
      c.vel.z = 0;
      ph.move(c, dt, -9.81);
      maxDelta = Math.max(maxDelta, c.pos.distanceTo(last));
    }
    assert.ok(
      c.pos.x > 1.8 && c.pos.x < 2.2 && c.pos.y > 1.9,
      "physical stair ascent dt=" + dt,
    );
    assert.ok(maxDelta < 0.45, "bounded KCC displacement");
    rows.push({
      name: "physical stairs dt " + dt,
      state: "landed",
      pos: c.pos.toArray(),
      maxDelta,
    });
    ph.removeActor(c);
  }
  w = world();
  w.colliders = [box(-12, 12, -12, 12, 1.3, 1.5)];
  await run(
    "low ceiling rejects standing navigation",
    w,
    P(-4, 0, 0),
    P(4, 0, 0),
    "unreachable",
  );
  w = world();
  w.colliders = [{ type: "cyl", x: 0, z: 0, r: 1.3, y0: 0, _top: 3 }];
  await run("cylinder detour", w, P(-4, 0, 0), P(4, 0, 0), "complete", (r) =>
    assert.ok(r.path.some((p) => Math.abs(p.z) > 1.6)),
  );
  w = world();
  const d = box(-0.15, 0.15, -12, 12);
  d.source = { dead: false };
  w.colliders = [d];
  let { surf } = await run(
    "destructible wall before",
    w,
    P(-4, 0, 0),
    P(4, 0, 0),
    "partial",
  );
  d.source.dead = true;
  const ph = ctx.GPhysics.get(w);
  ph.begin(1 / 60);
  assert.equal(ph.navRevision, 1);
  await surf.rebuild();
  const after = surf.plan(P(-4, 0, 0), P(4, 0, 0));
  assert.equal(after.state, "complete");
  rows.push({
    name: "removed wall rebuild",
    state: after.state,
    generation: surf.generation,
  });
  // Regression: shared combat Navigation queues real Detour queries, not the grid fallback.
  const n = new ctx.GCombat.Navigation(w),
    actor = { ctrl: { pos: P(-4, 0, 0) }, battle: {} };
  n.request(actor, P(4, 0, 0), 1);
  assert.equal(actor.battle.pending, true);
  n.process(1);
  assert.equal(actor.battle.pending, false);
  assert.equal(actor.battle.pathState, "complete");
  assert.equal(n.expanded, 0);
  // The main-thread scheduler must never issue an unbounded batch of Detour searches.
  const queue = new ctx.GCombat.Navigation(w);
  for (let i = 0; i < 9; i++)
    queue.request({ ctrl: { pos: P(-4, 0, 0) }, battle: {} }, P(4, 0, 0), 2);
  queue.process(2);
  assert.equal(queue.jobs.length, 5);
  queue.process(3);
  assert.equal(queue.jobs.length, 1);
  queue.process(4);
  assert.equal(queue.jobs.length, 0);
  for (let i = 0; i < 200; i++) surf.plan(P(-4, 0, 0), P(4, 0, 0));
  const beforeHeap = C.Raw.Module.HEAPU8.buffer.byteLength;
  for (let i = 0; i < 10000; i++) surf.plan(P(-4, 0, 0), P(4, 0, 0));
  const afterHeap = C.Raw.Module.HEAPU8.buffer.byteLength;
  assert.equal(afterHeap, beforeHeap, "query arrays must be released");
  rows.push({
    name: "10000 repeated Detour queries",
    state: "bounded heap",
    beforeHeap,
    afterHeap,
  });
  assert.equal(surf.plan(P(0, 8, 0), P(4, 0, 0)).state, "unreachable");
  surf.dispose();
  assert.equal(ctx.GNavigation.get(w), null);
  fs.writeFileSync(
    __dirname + "/navigation.json",
    JSON.stringify(
      { pass: true, backend: "Recast/Detour WASM 0.43.1", tests: rows },
      null,
      2,
    ),
  );
  console.log(
    "PASS Recast fixtures",
    rows.map((x) => x.name + ": " + x.state),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
