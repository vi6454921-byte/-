const fs = require("fs"),
  vm = require("vm"),
  path = require("path");
const base = path.resolve(__dirname, "../..");
async function environment() {
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
  };
  ctx.self = ctx.window = ctx;
  vm.createContext(ctx);
  for (const p of [
    "js/lib/three.min.js",
    "js/polygon/08_skeleton.js",
    "vendor/rapier/rapier.js",
    "js/advanced/physics.js",
    "js/advanced/contacts.js",
    "js/advanced/active-body.js",
  ])
    vm.runInContext(fs.readFileSync(path.join(base, p), "utf8"), ctx, {
      filename: p,
    });
  await ctx.GPhysics.ready;
  const T = ctx.THREE;
  function character({ scale = 1, y = 0.025, x = 0, z = 0 } = {}) {
    const joints = JSON.parse(
      fs.readFileSync(path.join(__dirname, "body-joints.json"), "utf8"),
    );
    for (const key in joints) joints[key] = joints[key].map((v) => v * scale);
    const M = ctx.GSkel.metricsFromJoints(joints, 1.8 * scale),
      desc = ctx.GSkel.build(M),
      root = new T.Group(),
      bones = {};
    root.position.set(x, y, z);
    for (const d of desc) {
      const b = new T.Bone();
      b.name = d.name;
      b.position.fromArray(d.pos);
      (bones[d.parent] || root).add(b);
      bones[d.name] = b;
    }
    for (const side of ["R", "L"])
      bones["shoulder" + side].rotation.z = (side === "R" ? -1 : 1) * 1.2;
    return {
      key: "fixture-" + scale,
      char: {
        root,
        bones: Object.values(bones),
        rest: ctx.GSkel.restWorld(desc),
        metrics: M,
        bone: (n) => bones[n],
      },
      ctrl: { pos: new T.Vector3(x, y, z), vel: new T.Vector3(), yaw: 0 },
      contactMode: "full",
    };
  }
  function session({ ground = 0, colliders = [] } = {}) {
    const w = {
      heightAt: () => ground,
      bounds: { x0: -20, x1: 20, z0: -20, z1: 20 },
      colliders,
    };
    return ctx.GPhysics.get(w);
  }
  return { ctx, T, character, session };
}
module.exports = { environment };
