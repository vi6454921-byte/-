const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert");
const c = { console, performance };
c.window = c;
c.self = c;
vm.createContext(c);
vm.runInContext(fs.readFileSync("js/lib/three.min.js", "utf8"), c);
vm.runInContext(fs.readFileSync("vendor/mesh-bvh/mesh-bvh.js", "utf8"), c);
vm.runInContext(fs.readFileSync("js/advanced/geometry.js", "utf8"), c);
vm.runInContext(fs.readFileSync("js/polygon/05g_trace.js", "utf8"), c);
const T = c.THREE,
  world = new T.Group();
let seed = 171;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
for (let i = 0; i < 150; i++) {
  const m = new T.Mesh(
    new T.BoxGeometry(
      0.1 + random() * 4,
      0.1 + random() * 4,
      0.1 + random() * 4,
      3,
      3,
      3,
    ),
    new T.MeshBasicMaterial(),
  );
  m.position.set(random() * 100 - 50, random() * 5, random() * 100 - 50);
  m.rotation.y = random() * 6;
  m.name = "box" + i;
  world.add(m);
}
const hinge = new T.Group(),
  board = new T.Mesh(new T.BoxGeometry(2, 2, 0.1), new T.MeshBasicMaterial());
hinge.add(board);
world.add(hinge);
world.updateMatrixWorld(true);
const fast = c.GTrace.create(T, [world], [board]);
let tests = 0;
for (let i = 0; i < 3000; i++) {
  hinge.rotation.x = i % 2 ? 0 : 1.2;
  world.updateMatrixWorld(true);
  const r = new T.Raycaster(
    new T.Vector3(random() * 100 - 50, random() * 5, random() * 100 - 50),
    new T.Vector3(
      random() * 2 - 1,
      random() * 0.5 - 0.25,
      random() * 2 - 1,
    ).normalize(),
    0,
    30,
  );
  c.GGeometry.config.enabled = false;
  const original = r.intersectObject(world, true)[0];
  c.GGeometry.config.enabled = true;
  const cached = fast.nearest(r);
  assert(!!original === !!cached, "hit mismatch " + i);
  if (original)
    assert(
      Math.abs(original.distance - cached.distance) < 1e-6,
      "nearest mismatch " + i,
    );
  tests++;
}
assert(c.GGeometry.stats().geometries > 0, "actual BVH acceleration exercised");
fs.writeFileSync(
  "tools/advanced-tests/trace-bvh.json",
  JSON.stringify({ tests, stats: fast.stats() }, null, 2),
);
console.log("PASS", tests, "BVH/original Three exact ray matches");
// Indexed groups and instances keep exact identity, not only nearest distance.
const shared = new T.BoxGeometry(2, 2, 2, 5, 5, 5),
  inst = new T.InstancedMesh(
    shared,
    Array.from({ length: 6 }, () => new T.MeshBasicMaterial()),
    4,
  );
for (let k = 0; k < 4; k++)
  inst.setMatrixAt(k, new T.Matrix4().makeTranslation(k * 4, 0, 0));
inst.updateMatrixWorld(true);
c.GGeometry.prepare(inst);
for (let k = 0; k < 4; k++)
  for (let n = 0; n < 25; n++) {
    const r = new T.Raycaster(
      new T.Vector3(k * 4 + (random() - 0.5), random() - 0.5, 6),
      new T.Vector3(0, 0, -1),
      0,
      20,
    );
    c.GGeometry.config.enabled = false;
    const a = r.intersectObject(inst)[0];
    c.GGeometry.config.enabled = true;
    const b = r.intersectObject(inst)[0];
    assert(a && b);
    assert.equal(a.instanceId, b.instanceId);
    assert.equal(a.faceIndex, b.faceIndex);
    assert.equal(
      a.face.materialIndex,
      b.face.materialIndex,
      JSON.stringify({
        a: { fi: a.faceIndex, mat: a.face.materialIndex },
        b: { fi: b.faceIndex, mat: b.face.materialIndex },
        roots: shared.boundsTree?._roots.length,
        groups: shared.groups,
      }),
    );
    assert(Math.abs(a.distance - b.distance) < 1e-6);
  }
const terrain = new T.Mesh(
  new T.PlaneGeometry(100, 100, 180, 180),
  new T.MeshBasicMaterial({ side: T.DoubleSide }),
);
terrain.rotateX(-Math.PI / 2);
terrain.updateMatrixWorld(true);
c.GGeometry.prepare(terrain);
const rays = Array.from(
  { length: 400 },
  () =>
    new T.Raycaster(
      new T.Vector3(random() * 98 - 49, 5, random() * 98 - 49),
      new T.Vector3(0, -1, 0),
      0,
      10,
    ),
);
const bench = (enabled) => {
  c.GGeometry.config.enabled = enabled;
  const t = performance.now();
  const hits = rays.map((r) => r.intersectObject(terrain)[0]);
  return { ms: performance.now() - t, hits };
};
bench(true);
const rounds = [];
for (let i = 0; i < 3; i++) {
  const a = bench(false),
    b = bench(true);
  a.hits.forEach((h, j) => {
    assert(h && b.hits[j]);
    assert(Math.abs(h.distance - b.hits[j].distance) < 1e-6);
    assert.equal(h.faceIndex, b.hits[j].faceIndex);
  });
  rounds.push({ originalMs: a.ms, bvhMs: b.ms });
}
c.GGeometry.config.enabled = true;
fs.writeFileSync(
  "tools/advanced-tests/trace-bvh.json",
  JSON.stringify(
    {
      tests,
      instanceIdentityCases: 100,
      benchmark: {
        rays: 400,
        triangles: 64800,
        rounds,
        note: "Node CPU microbenchmark of identical seeded rays; not gameplay FPS",
      },
      stats: fast.stats(),
    },
    null,
    2,
  ),
);
console.log(
  "PASS material-array fallback identity and seeded exact-ray benchmark",
  JSON.stringify(rounds),
);
