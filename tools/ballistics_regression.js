"use strict";
const assert = require("assert"),
  B = require("../js/polygon/05f_ballistics"),
  T = require("../js/polygon/30b_tactics"),
  M = require("../js/polygon/30_game_medic"),
  fs = require("fs");
let cases = 0;
const check = (v, m) => {
  assert(v, m);
  cases++;
};
const rows = [];
for (const [cal, ids] of Object.entries({
  545: ["7N6", "7N10", "7N24"],
  556: ["M855", "M855A1", "M995"],
  "762x39": ["57N231", "7N23", "57N231U"],
  "762x51": ["M80", "M80A1", "M993"],
  "762x54R": ["7N1", "57N323S", "7N14"],
  "9x19": ["57N181S", "7N21", "JHP"],
  "12ga": ["buck00", "shot4", "slug"],
}))
  for (const id of ids) {
    const s = B.spec(cal, id),
      v = cal === "12ga" ? 420 : cal === "9x19" ? 360 : 880;
    const tr = B.trajectory(
      s,
      v,
      0,
      cal === "9x19" || cal === "12ga" ? 200 : 1200,
      50,
    );
    check(tr.length > 1, id + " trajectory");
    check(
      tr.every((p) => Number.isFinite(p.y) && p.v > 0),
      id + " finite",
    );
    check(
      tr.slice(1).every((p, i) => p.v <= tr[i].v + 0.01),
      id + " speed",
    );
    for (const R of [25, 50, 100, 200]) {
      const sol = B.zero(s, v, 0.06, 0, R);
      if (!sol.unreachable) {
        const p = B.trajectory(s, v, sol.elev, R, R).at(-1);
        check(Math.abs(p.y - 0.06) < 0.0001, id + " zero " + R);
      }
    }
    for (const mat of ["wood", "metal"]) {
      let prev = v;
      for (const thickness of [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.3, 0.5]) {
        const r = B.penetrate(s, v, mat, thickness, 3, v);
        check(r.speed <= prev + 1e-6, id + " " + mat + " residual");
        prev = r.speed;
      }
    }
    rows.push({ id, cal, end: tr.at(-1) });
  }
const s = B.spec("545", "7N6"),
  calm = B.trajectory(s, 880, 0, 800, 800).at(-1),
  w = B.trajectory(s, 880, 0, 800, 800, B.AIR, 5).at(-1),
  reverse = B.trajectory(s, 880, 0, 800, 800, B.AIR, -5).at(-1);
check(calm.x === 800, "800m");
check(w.z > 0 && reverse.z < 0, "wind sign");
check(Math.abs(w.z + reverse.z) < 1e-9, "wind symmetry");
check(Math.abs(w.z - 5 * (w.t - 800 / 880)) < 0.02, "McCoy drift identity");
check(B.windAt(0, 10, 0, 0, 0).x === 0, "calm field");
check(
  Math.hypot(...Object.values(B.windAt(0, 2, 0, 0, 1, 1))) <
    Math.hypot(...Object.values(B.windAt(0, 2, 0, 0, 1, 0))),
  "canopy",
);
check(B.atmosphere(-10).rho > B.atmosphere(30).rho, "density");
check(!B.penetrate(s, 880, "ground", 0.1, 3).pass, "ground stop");
// Medical stand: fallen yet physiologically alive, inventories, treatment and cancellation.
const make = () => ({
  dead: false,
  finished: false,
  dmg: {
    ph: {
      dead: false,
      src: [
        {
          key: "arm",
          zone: "uarm",
          side: "L",
          comp: "limb",
          art: true,
          rate: 8,
          dressed: 0,
        },
      ],
    },
  },
  ctrl: {
    trait: { id: "medic", heal: 0.5 },
    reload: -1,
    pos: { x: 0, z: 0 },
    pullTrigger() {},
    sprint: 0,
  },
});
const med = M.create({ audio: {}, AE: {} }),
  actor = make(),
  patient = make();
patient.dead = true;
check(med.plan(patient, actor).kind === "tq", "fallen alive triage");
check(med.start(actor, patient), "med start");
med.update(3, [actor], null);
check(patient.dmg.ph.src[0].tq, "external bleeding stopped");
check(actor.med.tq === 1, "finite supplies");
patient.dmg.ph.dead = true;
check(!!med.plan(patient, actor).none, "no aid corpse");
const body = {
  ctrl: { pos: { x: 0, y: 0, z: 0 } },
  rd: {
    p: new Float32Array([0, 1, 0, 1, 1, 1]),
    pp: new Float32Array([-0.1, 0.9, -0.1, 0.9, 0.9, 0.9]),
    tq: new Float32Array([0, 1, 0, 1, 1, 1]),
  },
};
const before = body.rd.p.map((v, i) => v - body.rd.pp[i]);
T.translateBody(body, 1, 0.1, 2);
check(
  body.rd.p.every((v, i) => Math.abs(v - body.rd.pp[i] - before[i]) < 1e-6),
  "drag no phantom impulse",
);
check(
  T.segmentDistance(
    { x: 0, y: 1, z: 0 },
    { x: -1, y: 1, z: 0 },
    { x: 1, y: 1, z: 0 },
  ) === 0,
  "near segment",
);
check(!T.alive(patient), "dead excluded");
fs.mkdirSync("tools/pack-tests", { recursive: true });
fs.writeFileSync(
  "tools/pack-tests/ballistics.json",
  JSON.stringify({ cases, rows, wind: { calm, w, reverse } }, null, 2),
);
console.log("PASS", cases, "ballistics / medical / drag assertions");
