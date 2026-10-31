/* Node tests for js/app/teams.js pure rules: node tools/ai-tests/teams.cjs */
const assert = require('assert');
const G = require('../../js/app/teams.js');
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok', name); };

function stubWorld(mapId, half) {
  const obstacles = [];
  const rand = G.rng(5);
  for (let i = 0; i < 120; i++) obstacles.push({ x: (rand() - 0.5) * half * 2, z: (rand() - 0.5) * half * 2, r: 1 + rand() * 2 });
  const w = {
    mapId, bounds: { x0: -half, x1: half, z0: -half, z1: half }, heightAt: () => 0,
    bases: { alpha: { x: -half * 0.85, z: half * 0.85 }, delta: { x: half * 0.85, z: -half * 0.85 } },
    flags: [], obstacles,
    blocked: (x, z, y, pad) => obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad)
  };
  return w;
}
const actorOf = (s, extra) => Object.assign({ key: s.key, team: s.team, general: s.general, role: s.role, lives: s.lives, dead: false }, extra);

test('roleFor thirds', () => {
  const c = { push: 0, follow: 0, guard: 0 };
  for (let i = 0; i < 15; i++) c[G.roleFor(i, 15)]++;
  assert.deepStrictEqual(c, { push: 5, follow: 5, guard: 5 });
  const a = { push: 0, follow: 0, guard: 0 };
  for (let i = 0; i < 5; i++) a[G.roleFor(i, 5)]++;
  assert.deepStrictEqual(a, { push: 2, follow: 2, guard: 1 });
});

test('angar roster: 4 generals + 20 soldiers, 5 per general', () => {
  const spec = G.rosterSpec('angar_map');
  assert.strictEqual(spec.filter((s) => s.general).length, 4);
  assert.strictEqual(spec.filter((s) => !s.general).length, 20);
  for (const k of ['alpha_1', 'alpha_2', 'delta_1', 'delta_2']) assert.strictEqual(spec.filter((s) => s.leader === k).length, 5, k);
  assert.strictEqual(new Set(spec.map((s) => s.key)).size, spec.length);
  assert(spec.filter((s) => s.general).every((s) => s.lives === 3));
  assert(spec.filter((s) => !s.general).every((s) => s.lives === 2));
});

for (const id of ['forest_map_camp', 'stroyka_zarechye_v2']) {
  test(id + ' roster: 2 generals + 30 soldiers per team, 10/10/10 roles', () => {
    const spec = G.rosterSpec(id);
    assert.strictEqual(spec.length, 64);
    for (const team of ['alpha', 'delta']) {
      const t = spec.filter((s) => s.team === team);
      assert.strictEqual(t.filter((s) => s.general).length, 2);
      assert.strictEqual(t.filter((s) => !s.general).length, 30);
      for (const role of ['push', 'follow', 'guard']) assert.strictEqual(t.filter((s) => s.role === role).length, 10, team + role);
      assert.strictEqual(t.filter((s) => s.leader === team + '_1').length, 15);
    }
  });
}
test('unknown map has no roster', () => assert.strictEqual(G.rosterSpec('polygon'), null));

for (const [id, half] of [['forest_map_camp', 110], ['angar_map', 38]]) {
  test(id + ' placement: free, in bounds, spaced, flags + respawn points + cover', () => {
    const w = stubWorld(id, half);
    const spawns = G.rosterFor(id, w);
    assert.strictEqual(spawns.length, G.rosterSpec(id).length);
    const env = G.envFromWorld(w);
    for (const s of spawns) {
      assert(Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.yaw), s.key);
      assert(s.x > w.bounds.x0 && s.x < w.bounds.x1 && s.z > w.bounds.z0 && s.z < w.bounds.z1, s.key + ' in bounds');
      assert(!w.blocked(s.x, s.z, 0, 0.5), s.key + ' not inside geometry');
    }
    for (let i = 0; i < spawns.length; i++) for (let j = i + 1; j < spawns.length; j++)
      assert(Math.hypot(spawns[i].x - spawns[j].x, spawns[i].z - spawns[j].z) > 0.9, spawns[i].key + '/' + spawns[j].key);
    assert.strictEqual(w.flags.length, 2);
    const L = w.teamLayout;
    for (const team of ['alpha', 'delta']) {
      assert.strictEqual(L.teams[team].rp.soldier.length, 2);
      assert.strictEqual(L.teams[team].rp.general.length, 3);
      assert(env.ok(L.teams[team].flag.x, L.teams[team].flag.z, 0.3));
    }
    assert(L.cover.length >= 20, 'cover pieces ' + L.cover.length);
    for (const c of L.cover) for (const sp of spawns) {
      const dx = sp.x - c.x, dz = sp.z - c.z, a = -c.yaw, lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
      assert(!(Math.abs(lx) < c.len / 2 + 0.3 && Math.abs(lz) < c.th / 2 + 0.3), sp.key + ' inside cover');
    }
    assert.deepStrictEqual(spawns.map((s) => [s.key, +s.x.toFixed(3)]), G.rosterFor(id, stubWorld(id, half)).map((s) => [s.key, +s.x.toFixed(3)]), 'deterministic');
  });
}

test('lives accounting: respawns consumed, stop at 0', () => {
  const g = { lives: 3, dead: true }, b = { lives: 2, dead: true };
  assert(G.consumeLife(g) && G.consumeLife(g) && G.consumeLife(g) && g.lives === 0);
  assert.strictEqual(G.consumeLife(g), false);
  assert.strictEqual(g.out, true);
  assert(G.consumeLife(b) && G.consumeLife(b));
  assert.strictEqual(G.consumeLife(b), false);
});

test('win: elimination counts pending respawns; flag capture; draw', () => {
  const mk = (team, lives, dead) => ({ team, lives, dead });
  const A = [mk('alpha', 2, false), mk('alpha', 0, false)];
  const D = [mk('delta', 1, true), mk('delta', 0, false)];
  assert.strictEqual(G.evaluate(A.concat(D), null).over, false);
  D[1].dead = true; D[0].lives = 0;
  let r = G.evaluate(A.concat(D), null);
  assert.deepStrictEqual([r.over, r.winner, r.reason], [true, 'alpha', 'elimination']);
  A.forEach((a) => { a.dead = true; a.lives = 0; });
  assert.strictEqual(G.evaluate(A.concat(D), null).winner, 'draw');
  const live = [mk('alpha', 1, false), mk('delta', 1, false)];
  const zones = { alpha: G.newZone(), delta: G.newZone() };
  zones.delta.progress = 1;
  r = G.evaluate(live, zones);
  assert.deepStrictEqual([r.winner, r.reason], ['alpha', 'flag']);
});

test('flag zone: 12 s uncontested capture, contested stalls, decays when empty', () => {
  const z = G.newZone();
  for (let i = 0; i < 119; i++) G.stepZone(z, 0.1, 1, 0);
  assert(z.progress < 1 && z.progress > 0.95, 'z=' + z.progress);
  G.stepZone(z, 0.2, 1, 0);
  assert.strictEqual(z.progress, 1);
  const c = G.newZone(); c.progress = 0.5;
  G.stepZone(c, 5, 3, 1);
  assert.strictEqual(c.progress, 0.5); assert.strictEqual(c.state, 'contested');
  G.stepZone(c, 10, 0, 0);
  assert(c.progress < 0.5);
  const fast = G.newZone();
  for (let i = 0; i < 60; i++) G.stepZone(fast, 0.1, 5, 0);
  assert.strictEqual(fast.progress, 1);
});

test('respawn point choice avoids enemies', () => {
  const pts = [{ x: 0, z: 0 }, { x: 30, z: 0 }];
  assert.strictEqual(G.pickRespawn(pts, [{ x: 3, z: 0 }], G.rng(1)), pts[1]);
  assert.strictEqual(G.pickRespawn(pts, [{ x: 28, z: 1 }], G.rng(1)), pts[0]);
});

function planEnv(phase) {
  const flags = { alpha: { x: -80, z: 80 }, delta: { x: 80, z: -80 } };
  const lead = { x: -60, z: 60 };
  return { centre: { x: 0, z: 0 }, flag: (t) => flags[t], base: (t) => flags[t], heightAt: () => 0, phase: () => phase, leader: () => lead, spot: () => false, lead };
}
const bot = (key, team, role, x, z, extra) => Object.assign({ key, team, role, ctrl: { pos: { x, y: 0, z } } }, extra);

test('orders: followers loose cluster 2.5-9 m, re-rolled, speed jitter, not single file', () => {
  const env = planEnv('centre');
  const offs = new Set(), speeds = new Set(), angles = [];
  for (let i = 0; i < 10; i++) {
    const s = bot('alpha_soldier_' + i, 'alpha', 'follow', -58, 58);
    let last = null;
    for (let t = 0; t < 120; t += 0.5) {
      const o = G.planOrder(env, s, t);
      if (o.goal) {
        const d = Math.hypot(o.goal.x - env.lead.x, o.goal.z - env.lead.z);
        assert(d >= 2.49 && d <= 9.01, 'offset ' + d); /* v20: место за генералом — 2,5–9 м (teams.js planOrder) */
        const k = o.goal.x.toFixed(2) + ',' + o.goal.z.toFixed(2);
        if (k !== last) offs.add(k + s.key);
        last = k; speeds.add(o.speed.toFixed(2));
        if (t === 0) angles.push(Math.atan2(o.goal.z - env.lead.z, o.goal.x - env.lead.x));
      }
    }
  }
  assert(offs.size >= 40, 'offsets re-rolled: ' + offs.size);
  assert(speeds.size >= 8, 'speed jitter: ' + speeds.size);
  const spread = Math.max(...angles) - Math.min(...angles);
  assert(spread > 2, 'angular spread ' + spread);
});

test('orders: guards patrol within 7.1 m of own flag; push goes centre then enemy flag', () => {
  const env = planEnv('centre');
  const g = bot('alpha_soldier_20', 'alpha', 'guard', -78, 78);
  for (let t = 0; t < 200; t += 0.7) {
    const o = G.planOrder(env, g, t);
    if (o.goal) assert(Math.hypot(o.goal.x + 80, o.goal.z - 80) <= 7.01);
    assert(o.leash && o.leash.r === 30);
  }
  const p = bot('alpha_soldier_1', 'alpha', 'push', -70, 70);
  let o = G.planOrder(env, p, 0);
  assert(o.goal && Math.hypot(o.goal.x, o.goal.z) <= 12.1, 'centre');
  const env2 = planEnv('assault');
  const p2 = bot('alpha_soldier_2', 'alpha', 'push', -70, 70, { capturer: true });
  o = G.planOrder(env2, p2, 0);
  assert(Math.hypot(o.goal.x - 80, o.goal.z + 80) <= 3.01, 'capturer reaches the flag zone');
});

test('push phase switches after 60% reach centre or timeout', () => {
  const st = {};
  const far = Array.from({ length: 10 }, () => ({ x: -70, z: 70 }));
  assert.strictEqual(G.pushPhase(st, 'alpha', far, { x: 0, z: 0 }, 1), 'centre');
  const mixed = far.map((p, i) => (i < 6 ? { x: 3, z: 3 } : p));
  assert.strictEqual(G.pushPhase(st, 'alpha', mixed, { x: 0, z: 0 }, 5), 'assault');
  const st2 = {};
  G.pushPhase(st2, 'delta', far, { x: 0, z: 0 }, 0);
  assert.strictEqual(G.pushPhase(st2, 'delta', far, { x: 0, z: 0 }, 80), 'assault');
});

test('spatial hash returns only points inside radius', () => {
  const h = new G.SpatialHash(8), pts = [];
  const r = G.rng(3);
  for (let i = 0; i < 200; i++) { const p = { x: (r() - 0.5) * 200, z: (r() - 0.5) * 200 }; pts.push(p); h.add(p, p.x, p.z); }
  const out = [];
  h.query(10, -20, 15, out, (p) => p);
  const want = pts.filter((p) => Math.hypot(p.x - 10, p.z + 20) <= 15);
  assert.strictEqual(out.length, want.length);
});

test('grenade lob lands on target', () => {
  const from = { x: 0, y: 1.5, z: 0 }, to = { x: 20, y: 0, z: 10 };
  for (const ang of [0.3, 0.5, 0.7]) {
    const v = G.lobVelocity(from, to, ang, 9.81);
    assert(v, 'solution');
    const t = v.T, x = from.x + v.vx * t, z = from.z + v.vz * t, y = from.y + v.vy * t - 0.5 * 9.81 * t * t;
    assert(Math.hypot(x - to.x, z - to.z) < 0.05 && Math.abs(y - to.y) < 0.05, `land ${x} ${y} ${z}`);
  }
  assert.strictEqual(G.lobVelocity(from, { x: 140, y: 0, z: 0 }, 0.7, 9.81), null);
});

console.log(n + ' tests passed');
