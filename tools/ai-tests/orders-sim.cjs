/* Headless logic sim: GTeams.planOrder + GCombat behaviour tree on 64 stub actors (no browser).
   node tools/ai-tests/orders-sim.cjs */
const assert = require('assert');
const G = require('../../js/app/teams.js');
require('../../js/advanced/combat.js');
class V2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } }
class V3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
const THREE = { Vector2: V2, Vector3: V3 };
const half = 110, centre = { x: 0, z: 0 };
const obst = []; const rr = G.rng(11);
for (let i = 0; i < 150; i++) obst.push({ x: (rr() - 0.5) * 2 * half, z: (rr() - 0.5) * 2 * half, r: 0.8 + rr() * 1.6 });
const world = {
  mapId: 'forest_map_camp', bounds: { x0: -half, x1: half, z0: -half, z1: half }, heightAt: () => 0, flags: [],
  bases: { alpha: { x: -84, z: 84 }, delta: { x: 84, z: -84 } },
  blocked: (x, z, y, pad = 0.38) => obst.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad)
};
const spawns = G.rosterFor(world.mapId, world);
const squad = spawns.map((sp) => ({
  key: sp.key, spawn: sp, role: sp.role, team: sp.team, capturer: sp.capturer, leaderKey: sp.leader, general: sp.general, dead: false, idleYaw: 0,
  char: { preset: { faction: sp.team }, metrics: { eyeY: 1.6 } },
  ctrl: { pos: new V3(sp.x, 0, sp.z), yaw: sp.yaw, crouch: 0, prone: 0, ammo: 30, reserve: 90, reload: -1, ads: 0, ready: 1, canFire: () => false, aiWish: null }
}));
const byKey = new Map(squad.map((s) => [s.key, s]));
const player = byKey.get('alpha_1');
player.active = true;
const combat = globalThis.GCombat.create({ THREE, world, squad, visible: () => false });
const phase = {};
const alive = (s) => !s.dead;
const env = {
  centre, flag: (t) => world.teamLayout.teams[t].flag, base: (t) => world.teamLayout.teams[t].base, heightAt: () => 0,
  phase: (t) => (phase[t] ? phase[t].phase : 'centre'),
  leader: (s) => { if (s.team === player.team && alive(player)) return player.ctrl.pos; const l = byKey.get(s.leaderKey); return l && alive(l) ? l.ctrl.pos : null; },
  spot: () => false
};
const SIMSEC = +process.env.SIMSEC || 240;
const dt = 1 / 30; let t = 0, rri = 0;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const t0 = process.hrtime.bigint();
let maxFrameMs = 0, sumMs = 0, frames = 0;
const log = {};
for (let f = 0; f < 30 * SIMSEC; f++) {
  t += dt;
  const fs = process.hrtime.bigint();
  if (f % 8 === 0) for (const team of G.TEAMS) G.pushPhase(phase, team, squad.filter((s) => s.team === team && s.role === 'push').map((s) => s.ctrl.pos), centre, t);
  for (let k = 0; k < 9; k++) { const s = squad[rri++ % squad.length]; if (s !== player) s.order = G.planOrder(env, s, t); }
  combat.update(t, player);
  for (const s of squad) {
    if (s === player) continue;
    combat.drive(s, dt, t, player);
    const c = s.ctrl, w = c.aiWish;
    c.yaw = s.idleYaw;
    if (w) {
      const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), mx = w.x * cs + w.y * sn, mz = -w.x * sn + w.y * cs, L = Math.hypot(mx, mz);
      const v = (c.aiSprint ? 5.5 : 3.2) * Math.min(1, L);
      if (L > 1e-6) {
        const nx = c.pos.x + (mx / L) * v * dt, nz = c.pos.z + (mz / L) * v * dt;
        if (!world.blocked(nx, nz, 0, 0.3)) { c.pos.x = nx; c.pos.z = nz; }
      }
    }
  }
  combat.fire(t);
  const ms = Number(process.hrtime.bigint() - fs) / 1e6; sumMs += ms; frames++; if (ms > maxFrameMs) maxFrameMs = ms;
  if (process.env.DEBUG_SIM && ms > 25) console.log("slow frame", f, ms.toFixed(1));
  if (f === 30 * 1 || f === 30 * 60 || f === 30 * 120 || f === 30 * (SIMSEC - 1)) {
    const snap = {};
    for (const team of G.TEAMS) {
      const L = squad.filter((s) => s.team === team);
      const own = env.flag(team), foe = env.flag(team === 'alpha' ? 'delta' : 'alpha');
      const avg = (role, to) => { const a = L.filter((s) => s.role === role); return +(a.reduce((n, s) => n + dist(s.ctrl.pos, to), 0) / a.length).toFixed(1); };
      snap[team] = { phase: phase[team] && phase[team].phase, pushToCentre: avg('push', centre), pushToEnemyFlag: avg('push', foe), guardToOwnFlag: avg('guard', own), followToLeader: +(L.filter((s) => s.role === 'follow').reduce((n, s) => n + dist(s.ctrl.pos, env.leader(s)), 0) / 10).toFixed(1) };
    }
    log['t' + Math.round(t)] = snap;
  }
}
console.log(JSON.stringify(log, null, 1));
for (const s of squad) assert(Number.isFinite(s.ctrl.pos.x) && Number.isFinite(s.ctrl.pos.z), s.key + ' NaN');
if (process.env.DEBUG_SIM) for (const k of ['delta_1', 'delta_2', 'alpha_1', 'alpha_2']) { const s = byKey.get(k); console.log(k, s.ctrl.pos.x.toFixed(1), s.ctrl.pos.z.toFixed(1), s.battle && s.battle.mode, JSON.stringify(s.order && { m: s.order.mode, g: s.order.goal })); }
const last = log["t" + (SIMSEC - 1)] || log[Object.keys(log).pop()];
for (const team of G.TEAMS) {
  assert(last[team].guardToOwnFlag < 25, team + ' guards stay near the flag: ' + last[team].guardToOwnFlag);
}
const first = log.t1, mid = log.t60;
if (!mid) { console.log('short run, skipping assertions'); process.exit(0); }
for (const team of G.TEAMS) assert(mid[team].pushToEnemyFlag < first[team].pushToEnemyFlag - 40, team + ' pushers advance');
assert(last.alpha.followToLeader < 15, 'followers stay in a loose cluster around the player: ' + last.alpha.followToLeader);
assert(last.delta.followToLeader < 25, 'AI-general followers stay with their general: ' + last.delta.followToLeader);
console.log(`avg ${(sumMs / frames).toFixed(3)} ms/frame, worst ${maxFrameMs.toFixed(2)} ms for 64 actors`);
console.log('orders-sim ok');
