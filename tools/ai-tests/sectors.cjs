/* Node tests for js/app/sectors.js (v21 mini-maps) + sector roster in teams.js:
   node tools/ai-tests/sectors.cjs */
const assert = require('assert');
const S = require('../../js/app/sectors.js');
const G = require('../../js/app/teams.js');
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok', name); };

test('clip: square by half-plane keeps the inside part', () => {
  const sq = [[-10, -10], [10, -10], [10, 10], [-10, 10]];
  const p = S.clip(sq, [1, 0, 0]); // x <= 0
  assert.strictEqual(Math.round(Math.abs(S.area(p))), 200);
  assert(p.every(([x]) => x <= 1e-9));
});

for (const mapId of Object.keys(S.DEFS)) {
  const def = S.DEFS[mapId];
  test(mapId + ': three sectors with sane polygons', () => {
    assert.strictEqual(def.sectors.length, 3);
    for (const sec of def.sectors) {
      const poly = S.polygonOf(def, sec), a = Math.abs(S.area(poly));
      assert(poly.length >= 3, sec.name);
      assert(a > 9000 && a < 26000, sec.name + ' area ' + a);
      for (const [x, z] of poly) assert(Math.abs(x) <= def.half + 1e-6 && Math.abs(z) <= def.half + 1e-6, sec.name);
    }
  });
  test(mapId + ': every base candidate and meeting point is well inside', () => {
    for (const sec of def.sectors) {
      const poly = S.polygonOf(def, sec);
      for (const side of sec.sides) for (const [x, z] of side) assert(S.margin(poly, x, z) >= 12, sec.name + ' base ' + x + ',' + z + ' margin ' + S.margin(poly, x, z));
      for (const [x, z] of sec.centre) assert(S.margin(poly, x, z) >= 8, sec.name + ' centre ' + x + ',' + z);
      /* стороны далеко друг от друга: бой не начинается в упор */
      for (const a of sec.sides[0]) for (const b of sec.sides[1]) assert(Math.hypot(a[0] - b[0], a[1] - b[1]) > 60, sec.name + ' sides too close');
    }
  });
  test(mapId + ': random battles vary sector, sides and bases', () => {
    const ids = new Set(), combos = new Set();
    for (let seed = 1; seed < 400; seed++) {
      const r = S.resolve(mapId, 'random', seed * 2654435761 >>> 0);
      ids.add(r.id);
      combos.add(r.id + ':' + r.bases.alpha.x.toFixed(1) + ',' + r.bases.alpha.z.toFixed(1) + '/' + r.bases.delta.x.toFixed(1));
      assert(r.poly.length >= 3 && r.area > 0);
    }
    assert.strictEqual(ids.size, 3);
    assert(combos.size >= 18, 'combos ' + combos.size);
    assert.strictEqual(S.resolve(mapId, 'all', 5), null);
    for (const id of [1, 2, 3]) assert.strictEqual(S.resolve(mapId, String(id), 9).id, id);
  });
  test(mapId + ': inside() pulls an outside point back over the red line', () => {
    for (const sec of def.sectors) {
      const poly = S.polygonOf(def, sec);
      for (let k = 0; k < 200; k++) {
        const x = (Math.sin(k * 12.9898) * 0.5) * def.half * 2.4, z = (Math.sin(k * 78.233) * 0.5) * def.half * 2.4;
        const p = S.inside(poly, x, z, 2.5), m = S.margin(poly, p.x, p.z);
        assert(m >= 2.4, sec.name + ' ' + x.toFixed(1) + ',' + z.toFixed(1) + ' -> ' + m);
        assert.strictEqual(S.contains(poly, x, z), S.margin(poly, x, z) > 0);
      }
    }
  });
}

test('sector roster: 2 generals + 9 soldiers per team (3x fewer than 32)', () => {
  for (const id of ['forest_map_camp', 'stroyka_zarechye_v2']) {
    const full = G.rosterSpec(id), sec = G.rosterSpec(id, G.CFG.sector);
    assert.strictEqual(full.length, 64);
    assert.strictEqual(sec.length, 22);
    for (const t of ['alpha', 'delta']) {
      const team = sec.filter((s) => s.team === t);
      assert.strictEqual(team.filter((s) => s.general).length, 2);
      assert.strictEqual(team.filter((s) => !s.general).length, 9);
      assert.strictEqual(team.filter((s) => s.leader === t + '_1').length, 5);
      assert.strictEqual(team.filter((s) => s.leader === t + '_2').length, 4);
      const roles = {}; for (const s of team) roles[s.role] = (roles[s.role] || 0) + 1;
      assert(roles.push >= 4 && roles.follow >= 3 && roles.guard >= 2, JSON.stringify(roles));
    }
    assert.strictEqual(new Set(sec.map((s) => s.key)).size, sec.length);
  }
});

test('sector layout: flags, respawns and soldiers inside the red line, new layout per battle', () => {
  const def = S.DEFS.forest_map_camp;
  const seen = new Set();
  for (let seed = 11; seed < 31; seed++) {
    const r = S.resolve('forest_map_camp', String(1 + (seed % 3)), seed * 977);
    const poly = r.poly;
    const sec = Object.assign({}, r, { margin: (x, z) => S.margin(poly, x, z), inside: (x, z, m) => S.inside(poly, x, z, m), contains: (x, z) => S.contains(poly, x, z) });
    const world = { mapId: 'forest_map_camp', bounds: S.bbox(poly, 30), heightAt: () => 0, bases: r.bases, sector: sec, blocked: () => false, flags: [] };
    const spawns = G.rosterFor('forest_map_camp', world);
    assert.strictEqual(spawns.length, 22);
    for (const p of spawns) assert(S.margin(poly, p.x, p.z) >= G.CFG.sectorMargin - 0.01, 'spawn outside ' + p.key);
    for (const f of world.flags) assert(S.margin(poly, f.x, f.z) >= G.CFG.sectorMargin - 0.01, 'flag outside');
    for (const t of ['alpha', 'delta']) for (const k of ['general', 'soldier']) for (const q of world.teamLayout.teams[t].rp[k]) assert(S.margin(poly, q.x, q.z) >= G.CFG.sectorMargin - 0.01);
    seen.add(world.flags.map((f) => f.x.toFixed(1) + ',' + f.z.toFixed(1)).join('/'));
    /* приказы не уводят за линию */
    const env = G.envFromWorld(world);
    const far = env.clamp({ x: 500, z: -500 });
    assert(S.margin(poly, far.x, far.z) >= 2.4);
  }
  assert(seen.size >= 15, 'layouts ' + seen.size);
  void def;
});

console.log(n + ' sector tests passed');
