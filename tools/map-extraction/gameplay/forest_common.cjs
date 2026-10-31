/* Gameplay runtime for the two forest-style maps (forest_map_camp, stroyka_zarechye_v2).
   Keeps the original panel/structure destruction (hitPanel, blastStructs, kill queue, support collapse),
   tree felling, glass panes and the lite debris system; ammo.js bodies are replaced by AEGIS colliders. */
const shared = require('./shared.cjs');
module.exports = function make(id) {
  const stroyka = id.startsWith('stroyka');
  return {
    prelude: String.raw`
var THREE = ctx.THREE;
var __HK = { sound: null, fx: null, break: null };
var __deepNoop = (function () { var f = function () { return p; }; var p = new Proxy(f, { get: function (t, k) { return k === Symbol.toPrimitive ? function () { return 0; } : p; }, apply: function () { return p; } }); return p; })();
`,
    overrides: {
      // physics / FX that only exist for the standalone page
      PHYS: '{ready:false,bodies:[],statics:new Map()}',
      addBody: 'function(o){ return __addBody(o); }',
      killBody: 'function(){}',
      removeStaticCollider: 'function(c){ if(c) c.dead = true; }',
      addStaticCollider: 'function(c){ if(c && !COLLIDERS.includes(c)) COLLIDERS.push(c); }',
      rayCast: 'function(){ return null; }',
      blastImpulse: 'function(){}', shockwave: 'function(){}', deformCrater: 'function(){}', scorch: 'function(){}', markPuddle: 'function(){}', clods: 'function(){}',
      ignite: 'function(){}', igniteTree: 'function(){}', igniteStruct: 'function(){}', charTree: 'function(){}', attachFire: 'function(){}',
      dustFrom: 'function(){}', dustAt: 'function(){}', puffAt: 'function(){}', sparksAt: 'function(){}',
      impactSound: 'function(){}', metalHitSound: 'function(){}', woodCrack: 'function(){}', glassSound: 'function(){}', creakSound: 'function(){}', sparkSound: 'function(){}', wireSnap: 'function(){}',
      splinterPuff: 'function(){}', splinters: 'function(){}', toast: 'function(){}', scareBirds: 'function(){}',
      FX: '__deepNoop',
    },
    unoverride: ['explode', 'ignite', 'buildMG'],
    stepInsert: { planLandmarks: 'planMG', buildGlass: 'buildMG' },
    roots: ['onBlast', 'hitPanel', 'kill', 'processQueue', 'supportPass', 'updateStructs', 'updateDestruction', 'breakPane', 'breakTree', 'treesNear', 'boardAt', 'knockBoard', 'structAt', 'PANES', 'STRUCTS', 'QUEUE', 'FALLING', 'LDEB', 'ldebAdd', 'LADDERS', 'MG', 'mgFarSet'],
    patches: [
      // every tree trunk blocks movement (the original only collided near the perimeter and walked trees via TREE_GRID)
      ['if (e < MAP.FENCE + 1) {\n      t.col = addCircle', 'if (true) {\n      t.col = addCircle'],
      ['g.setAttribute("aSplat", new THREE8.Float32BufferAttribute(spl, 4));\n  g.setIndex(idx2);\n  g.computeBoundingSphere();\n  g.computeBoundingBox();', 'g.setAttribute("aSplat", new THREE8.Float32BufferAttribute(spl, 4));\n  g.setAttribute("aAO", new THREE8.Float32BufferAttribute(ao, 1));\n  g.setIndex(idx2);\n  g.computeBoundingSphere();\n  g.computeBoundingBox();'],
    ],
    after: String.raw`
function __addBody(o) {
  o = o || {};
  var mesh = o.mesh || null, sz = o.size || [0.1, 0.1, 0.1];
  var rec = { body: __deepNoop, shape: null, children: [], idx: -1, ms: null, mesh: mesh, sync: o.sync || null, life: o.life ?? 8, age: 0, keep: !!o.keep, onDone: o.onDone || null, pos: o.pos ? o.pos.clone() : new THREE.Vector3(), quat: o.quat ? o.quat.clone() : new THREE.Quaternion(), dead: false };
  if (!mesh) return rec;
  if (o.pos) mesh.position.copy(o.pos);
  if (o.quat) mesh.quaternion.copy(o.quat);
  if (!mesh.parent) scene.add(mesh);
  if (o.keep) return rec;
  var he = [Math.max(0.02, (sz[0] || 0.1) * 0.5), Math.max(0.02, (sz[1] || 0.1) * 0.5), Math.max(0.02, (sz[2] || sz[0] || 0.1) * 0.5)];
  rec.deb = ldebAdd(mesh, { he: he, vel: o.vel ? o.vel.clone() : new THREE.Vector3(), ang: o.ang ? o.ang.clone() : new THREE.Vector3(), life: Math.min(o.life ?? 20, 20), bounce: 0.25, cast: false, dispose: false });
  return rec;
}
var __BC = { mg: { board: 1, panel: 0.2, pole: 0.2, tree: 1, sheet: 0.35 }, rifle: { board: 0.25, panel: 0.05, pole: 0, tree: 0.12, sheet: 0.12 } };
var __bv = new THREE.Vector3(), __bv2 = new THREE.Vector3();
function __hitPane(p, dir) {
  for (var i = 0; i < PANES.length; i++) {
    var pa = PANES[i];
    if (!pa.alive) continue;
    var R = Math.max(pa.w, pa.h);
    if (Math.abs(p.x - pa.pos.x) > R || Math.abs(p.z - pa.pos.z) > R || Math.abs(p.y - pa.pos.y) > R) continue;
    __bv.copy(p).sub(pa.pos);
    if (Math.abs(__bv.dot(pa.normal)) > 0.14) continue;
    var u = __bv2.set(1, 0, 0).applyQuaternion(pa.q), v = new THREE.Vector3(0, 1, 0).applyQuaternion(pa.q);
    if (Math.abs(__bv.dot(u)) > pa.w / 2 + 0.05 || Math.abs(__bv.dot(v)) > pa.h / 2 + 0.05) continue;
    breakPane(pa, dir.clone(), 2);
    return true;
  }
  return false;
}
function __bullet(p, dir, power) {
  var kind = power >= 2 ? "mg" : "rifle", C3 = __BC[kind];
  if (__hitPane(p, dir)) return { stop: false, cost: 0.05, surf: "glass" };
  var trees = treesNear(p.x, p.z, 2.2), bt = null, bd = 1e9;
  for (var i = 0; i < trees.length; i++) {
    var t = trees[i];
    if (t.broken || p.y < t.y - 0.2 || p.y > t.y + t.h) continue;
    var d = Math.hypot(t.x - p.x, t.z - p.z) - t.r;
    if (d < 0.16 && d < bd) { bd = d; bt = t; }
  }
  var best = null, bpd = 0.14;
  for (var s of structAt(p.x, p.z, 2)) {
    if (!s.panels) continue;
    for (var pk of s.panels) {
      if (pk.dead || !pk.box) continue;
      var pd = pk.box.distanceToPoint(p);
      if (pd < bpd) { bpd = pd; best = pk; }
    }
  }
  if (best && (!bt || bpd < bd)) {
    var pk = best, from = p.clone().addScaledVector(dir, -1);
    if (pk.boards) {
      var bdd = boardAt(pk, p);
      if (!bdd) return { stop: false, cost: 0, surf: "wood" };
      bdd.hp -= C3.board * (0.8 + Math.random() * 0.4);
      if (bdd.hp <= 0) knockBoard(pk, bdd, dir, kind === "mg" ? 5 : 2.5);
      if (!pk.dead) {
        pk.hp -= C3.panel;
        if (pk.hp <= 0 || pk.boardsLeft / pk.boards.length < 0.4) kill(pk, from, kind === "mg" ? 4 : 2, 0);
      }
    } else if (pk.armor === "pole") {
      if (C3.pole > 0) { pk.hp -= C3.pole; pk.hitY = p.y; if (pk.hp <= 0.001) kill(pk, from, 3, 0); }
    } else hitPanel(pk, p, dir.clone(), pk.kind === "wall" ? C3.panel : C3.sheet);
    return { stop: false, cost: 0.3, surf: "wood" };
  }
  if (bt) {
    bt.chop = (bt.chop || 0) + C3.tree;
    if (bt.chop >= 2 + bt.r * 18) breakTree(bt, new THREE.Vector3(dir.x, 0, dir.z).normalize(), 1.2);
    return { stop: true, cost: 1, surf: "wood" };
  }
  return null;
}
function __extra() {
  return {
    hooks: __HK,
    ladders: LADDERS,
    mg: MG,
    mgFarSet: mgFarSet,
    crates: CRATES.map(function (c, i) { return { id: "depot" + i, kind: "ammo", name: c.name, x: c.x, y: hFast(c.x, c.z), z: c.z, r: 4.6 * (c.s || 1) }; }),
    bulletHit: function (p, dir, power) { return __bullet(p, dir, power || 1); },
    explode: function (p, o) { o = o || {}; var size = Math.min(3, Math.max(0.3, (o.power || 1) * (o.radius || 6) / 6)); onBlast(p.x, hFast(p.x, p.z), p.z, size, false, {}); },
    indoor: function () { return false; },
    dest: { structs: STRUCTS, panes: PANES, queue: QUEUE, trees: TREES },
  };
}
function __stepGameplay(dt) { updateStructs(dt); updateDestruction(dt); }
`,
    ending: (base) => base.replace('return {native:COLLIDERS,', 'return {...__extra(), native:COLLIDERS,').replace('updateWind(t);', 'updateWind(t);__stepGameplay(dt);'),
  };
};
