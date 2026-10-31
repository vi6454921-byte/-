const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert");
const c = { console };
c.window = c;
c.self = c;
vm.createContext(c);
vm.runInContext(fs.readFileSync("js/lib/three.min.js", "utf8"), c);
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
  const original = r.intersectObject(world, true)[0],
    cached = fast.nearest(r);
  assert(!!original === !!cached, "hit mismatch " + i);
  if (original)
    assert(
      Math.abs(original.distance - cached.distance) < 1e-6,
      "nearest mismatch " + i,
    );
  tests++;
}
fs.mkdirSync("tools/pack-tests", { recursive: true });
fs.writeFileSync(
  "tools/pack-tests/trace.json",
  JSON.stringify({ tests, stats: fast.stats() }, null, 2),
);
console.log("PASS", tests, "cached/native ray matches");
