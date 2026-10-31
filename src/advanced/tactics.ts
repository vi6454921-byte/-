/** Medical decisions: reactive behavior tree; physiology/supplies remain GMedic. */
namespace AegisTactics {
  const root: any = globalThis;
  const team = (s: any) => s.char?.preset?.faction;
  export const alive = (s: any) =>
    !!s?.dmg &&
    !s.finished &&
    !s.dmg.ph?.dead &&
    !["cns", "fatal"].includes(s.deathKind);
  export function segmentDistance(p: any, a: any, b: any) {
    const x = b.x - a.x,
      y = b.y - a.y,
      z = b.z - a.z,
      L = x * x + y * y + z * z,
      u = L
        ? Math.max(
            0,
            Math.min(
              1,
              ((p.x - a.x) * x + (p.y - a.y) * y + (p.z - a.z) * z) / L,
            ),
          )
        : 0;
    return Math.hypot(p.x - a.x - u * x, p.y - a.y - u * y, p.z - a.z - u * z);
  }
  // Compatibility utility for external medical labs. The in-game drag uses impulses, not this teleport.
  export function translateBody(s: any, dx: number, dy: number, dz: number) {
    if (!s.rd) return false;
    for (const a of [
      s.rd.p,
      s.rd.pp,
      s.rd.tq,
      s.rd.P0?.p,
      s.rd.gun?.p,
      s.rd.gun?.pp,
    ])
      if (a)
        for (let i = 0; i < a.length; i += 3) {
          a[i] += dx;
          a[i + 1] += dy;
          a[i + 2] += dz;
        }
    root.GPhysics.translate(s, dx, dy, dz);
    s.ctrl.pos.x += dx;
    s.ctrl.pos.y += dy;
    s.ctrl.pos.z += dz;
    return true;
  }
  export function create(o: any) {
    const { squad, world, med, THREE: T } = o,
      B = root.GCombat,
      { Status: K } = B,
      nav = new B.Navigation(world),
      claims = new Map<any, any>(),
      events: any[] = [];
    const unreachable = new WeakMap<any, Map<any, number>>();
    const metrics = { stations: 0, replans: 0, stalls: 0, gripBreaks: 0 };
    let now = 0,
      next = 0,
      cursor = 0,
      voiceAt = -99;
    med.managedAI = true;
    const pos = (s: any) =>
      s.rd
        ? {
            x: s.rd.p[o.PI.pelvis * 3],
            y: s.rd.p[o.PI.pelvis * 3 + 1],
            z: s.rd.p[o.PI.pelvis * 3 + 2],
          }
        : s.ctrl.pos;
    med.position = pos;
    const dist = (a: any, b: any) => Math.hypot(a.x - b.x, a.z - b.z);
    const state = (s: any) =>
      s.tac ||
      (s.tac = {
        mode: "idle",
        target: null,
        until: 0,
        delay: 0,
        level: 0,
        lastNear: -99,
        from: null,
        nextAid: 0,
        pathAt: 0,
      });
    const say = (s: any, text: string, kind: string) => {
      if (now - voiceAt < 4) return;
      voiceAt = now;
      events.push({ who: s.key, text, t: now, kind });
      if (events.length > 32) events.shift();
      o.caption?.(s, text, now);
    };
    function reset(s: any, blocked = false) {
      const st = state(s);
      if (blocked && st.target) {
        let rejected = unreachable.get(s);
        if (!rejected) {
          rejected = new Map();
          unreachable.set(s, rejected);
        }
        rejected.set(st.target, now + 5);
      }

      if (claims.get(st.target)?.s === s) claims.delete(st.target);
      if (med.busy(s)) med.cancel(s);
      if (st.agent) nav.jobs = nav.jobs.filter((j: any) => j.s !== st.agent);
      Object.assign(st, {
        mode: "idle",
        target: null,
        station: null,
        agent: null,
        pathAt: 0,
      });
      s._tacHands = null;
      s._aidLow = false;
      s.ctrl.dragging = false;
      s.ctrl.aiWish = null;
      s.ctrl.aiProne = undefined;
    }
    const bleeding = (s: any) =>
      (s.dmg?.ph?.src || []).reduce(
        (n: number, e: any) => n + (e.tq ? 0 : e.rate || 0),
        0,
      );
    function route(a: any, b: any) {
      const aa = { x: a.x, y: a.y, z: a.z },
        bb = { x: b.x, y: b.y, z: b.z };
      return nav.clearLine(aa, bb, now) ? [bb] : null;
    }
    function setRoute(s: any, goal: any) {
      const st = state(s),
        direct = route(pos(s), goal);
      if (st.agent) nav.jobs = nav.jobs.filter((j: any) => j.s !== st.agent);
      st.pathAt = 0;
      st.goal = { ...goal };
      st.agent = {
        ctrl: s.ctrl,
        dead: false,
        battle: { path: direct || [], pending: false },
      };
      if (!direct) nav.request(st.agent, { ...goal }, now);
    }
    function aidPoint(s: any, p: any) {
      const side = p.side || "L",
        name =
          (
            {
              uarm: "shoulder",
              farm: "elbow",
              thigh: "hip",
              shin: "knee",
              foot: "ankle",
              hand: "wrist",
              pelvis: "pelvis",
              thorax: "chest",
              abdomen: "spine",
              neck: "neck",
            } as any
          )[p.zone] || "chest";
      if (s.rd) {
        const i = (o.PI[name + side] ?? o.PI[name] ?? o.PI.chest) * 3;
        return new T.Vector3(s.rd.p[i], s.rd.p[i + 1] + 0.04, s.rd.p[i + 2]);
      }
      return (
        s.char.bone(name === "pelvis" ? "hips" : name + side) ||
        s.char.bone(name) ||
        s.char.bone("chest")
      ).getWorldPosition(new T.Vector3());
    }
    function cover(s: any, target: any) {
      const st = state(s),
        p = pos(target);
      if (!st.from || !o.occluded) return null;
      let best: any = null,
        score = Infinity;
      for (const c of world.colliders) {
        if (c.source?.dead || c.tree) continue;
        const x = c.type === "box" ? (c.x0 + c.x1) / 2 : c.x,
          z = c.type === "box" ? (c.z0 + c.z1) / 2 : c.z,
          r = c.type === "box" ? Math.hypot(c.x1 - c.x0, c.z1 - c.z0) / 2 : c.r;
        if (r < 0.4 || dist({ x, z }, p) > 6) continue;
        const dx = x - st.from.x,
          dz = z - st.from.z,
          L = Math.hypot(dx, dz) || 1,
          g = { x: x + (dx / L) * (r + 0.9), z: z + (dz / L) * (r + 0.9) };
        if (world.blocked?.(g.x, g.z, world.heightAt(g.x, g.z), 0.5)) continue;
        if (!o.occluded(st.from, { ...g, y: world.heightAt(g.x, g.z) + 0.55 }))
          continue;
        const d = dist(p, g);
        if (d < score) {
          score = d;
          best = g;
        }
      }
      return best;
    }
    function contact(s: any) {
      return (
        !!s._tacHands &&
        ["R", "L"].every(
          (side) =>
            s.char
              .bone("wrist" + side)
              .getWorldPosition(new T.Vector3())
              .distanceTo(new T.Vector3().copy(s._tacHands[side])) < 0.04,
        )
      );
    }
    function station(s: any, q: any, avoid?: any) {
      const point = aidPoint(q, med.plan(q, s)),
        physics = root.GPhysics.get(world),
        at = pos(s);
      const angle = Math.atan2(at.z - point.z, at.x - point.x);
      let best: any = null,
        bestScore = Infinity;
      for (const radius of [0.38, 0.58, 0.78])
        for (let i = 0; i < 16; i++) {
          const a = angle + ((i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI) / 8;
          const x = point.x + Math.cos(a) * radius,
            z = point.z + Math.sin(a) * radius;
          const ground = world.heightAt(x, z),
            hit = physics.support(
              x,
              z,
              Math.max(ground, point.y) + 0.45,
              Math.max(1.5, point.y - ground + 1),
            );
          if (
            !hit ||
            hit.normal.y < 0.7 ||
            hit.y > point.y + 0.12 ||
            hit.y < point.y - 1.75
          )
            continue;
          const g = {
            x,
            y: hit.y + 0.018,
            z,
            woundX: point.x,
            woundZ: point.z,
          };
          const surface = root.GNavigation?.get(world);
          if (surface?.query && !surface.nearest(g, 0.25, 0.2)) continue;
          if (avoid && dist(g, avoid) < 0.3) continue;
          if (!physics.fits(s.ctrl, g, point.y - g.y < 0.85 ? 1.12 : 1.72))
            continue;
          // A nearby free capsule can still be separated from the wound by a wall.
          const chest = { x, y: g.y + (point.y - g.y < 0.65 ? 0.58 : 0.85), z },
            d = point.clone().sub(new T.Vector3().copy(chest));
          const L = d.length(),
            block =
              L > 0.001
                ? physics.ray(
                    chest,
                    d.multiplyScalar(1 / L),
                    Math.max(0, L - 0.06),
                  )
                : null;
          if (block) continue;
          const h = point.y - g.y;
          if (h < -0.08 || h > 1.65) continue;
          const clear = !!route(at, g);
          const preferred = point.y - g.y < 0.65 ? 0.58 : 0.42;
          const score =
            dist(at, g) * 0.45 +
            (clear ? 0 : 2) +
            Math.abs(radius - preferred) * 3 +
            Math.abs(a - angle) * 0.03;
          if (score < bestScore) {
            best = g;
            bestScore = score;
          }
        }
      if (best) metrics.stations++;
      return best;
    }
    function restation(s: any, q: any) {
      const st = state(s),
        next = station(s, q, st.station);
      metrics.replans++;
      if (!next) {
        reset(s, true);
        return false;
      }
      st.station = next;
      st.mode = "approach";
      st.contactWait = 0;
      st.progressAt = now;
      st.progressPos = { ...pos(s) };
      s._tacHands = null;
      setRoute(s, next);
      return true;
    }
    function acquire(s: any) {
      const st = state(s);
      let best: any = null,
        score = -Infinity;
      for (const q of squad) {
        if (q === s || team(q) !== team(s) || !alive(q)) continue;
        const d = dist(pos(s), pos(q));
        if (d > 20 || med.plan(q, s).none) continue;
        if ((unreachable.get(s)?.get(q) || 0) > now) continue;
        const claim = claims.get(q);
        if (claim && claim.s !== s && claim.until > now) continue;
        const v =
          bleeding(q) * 20 +
          (q.dead ? 5 : 0) +
          (q.dmg.ph?.shock || 0) * 3 -
          d * 0.25;
        if (v > score) {
          score = v;
          best = q;
        }
      }
      if (!best) return K.Failure;
      st.target = best;
      claims.set(best, { s, until: now + 2 });
      st.mode = "approach";
      st.deadline = now + 45;
      st.station = station(s, best);
      if (!st.station) {
        reset(s, true);
        return K.Failure;
      }
      st.contactWait = 0;
      st.progressAt = now;
      st.progressPos = { ...pos(s) };
      setRoute(s, st.station);
      say(s, "Иду к трёхсотому.", "aid");
      return K.Success;
    }
    function job(s: any) {
      const st = state(s),
        q = st.target;
      if (!q) return K.Failure;
      if (!alive(q) || team(s) !== team(q) || now > st.deadline) {
        reset(s);
        return K.Success;
      }
      claims.set(q, { s, until: now + 2 });
      if (med.plan(q, s).none && !med.busy(s)) {
        say(s, "Помощь оказана.", "done");
        reset(s);
        return K.Success;
      }
      if (
        st.mode === "approach" &&
        st.station &&
        dist(pos(s), st.station) < 0.28 &&
        Math.abs(pos(s).y - st.station.y) < 0.28
      ) {
        const cv = q.rd && bleeding(q) < 2 ? cover(s, q) : null;
        st.mode = cv ? "drag" : "treat";
        if (cv) {
          st.station = null;
          st.dragGrip = false;
          setRoute(s, cv);
        }
      }
      if (st.mode === "drag" && dist(pos(q), st.goal) < 0.7) {
        st.mode = "treat";
        st.station = station(s, q);
        s.ctrl.dragging = false;
      }
      if (st.mode === "treat") {
        if (dist(pos(s), pos(q)) > 1.6) {
          st.mode = "approach";
          restation(s, q);
        } else if (contact(s) && !med.busy(s)) {
          med.start(s, q);
          st.contactWait = 0;
        }
      }
      if (st.mode === "approach" && st.station) {
        const point = aidPoint(q, med.plan(q, s));
        if (
          Math.hypot(point.x - st.station.woundX, point.z - st.station.woundZ) >
          0.4
        )
          restation(s, q);
      }
      return K.Running;
    }
    const condition = (f: any) =>
        new B.Action((c: any) => (f(c.s) ? K.Success : K.Failure)),
      action = (f: any) => new B.Action((c: any) => f(c.s));
    const tree = new B.Selector([
      new B.Sequence([
        condition((s: any) => s.dead),
        action((s: any) => {
          reset(s);
          return K.Success;
        }),
      ]),
      new B.Sequence([
        condition((s: any) => now < state(s).until),
        action((s: any) => {
          if (state(s).target) reset(s);
          return K.Running;
        }),
      ]),
      new B.Sequence([
        condition((s: any) => bleeding(s) > 0.015 && !med.plan(s, s).none),
        action((s: any) => {
          if (state(s).target) reset(s);
          state(s).mode = "self-aid";
          if (!med.busy(s) && now >= state(s).nextAid) {
            med.start(s, s);
            state(s).nextAid = now + 2;
          }
          return K.Running;
        }),
      ]),
      new B.Sequence([condition((s: any) => !!state(s).target), action(job)]),
      new B.Sequence([
        condition((s: any) => s.ctrl.trait?.id === "medic"),
        action(acquire),
      ]),
      action((s: any) => {
        state(s).mode = med.busy(s) ? "self-aid" : "idle";
        return K.Success;
      }),
    ]);
    function think(t: number, active: any) {
      now = t;
      nav.process(t, 128);
      for (const [q, c] of claims)
        if (c.until < t || c.s === active || c.s.dead) claims.delete(q);
      if (t < next) return;
      const n = squad.length,
        big = n > 12;
      // Large squads: a rotating slice per call instead of one 0.2 s spike.
      next = t + (big ? 0.034 : 0.2);
      const count = big ? Math.ceil(n / 6) : n;
      for (let k = 0; k < count; k++) {
        const s = big ? squad[cursor++ % n] : squad[k];
        if (s === active) {
          if (state(s).mode !== "idle") reset(s);
          continue;
        }
        tree.tick({ s });
      }
    }
    function nearSegment(a: any, b: any, shooter: any, t: number) {
      for (const s of squad) {
        if (s === shooter || s.dead) continue;
        const p = pos(s);
        if (segmentDistance({ x: p.x, y: p.y + 1.2, z: p.z }, a, b) > 1.2)
          continue;
        const st = state(s);
        if (t - (st.lastNear ?? -99) > 0.12)
          st.level = Math.min(4, st.level + 1);
        st.lastNear = t;
        st.until = t + 5 + st.level;
        st.delay = t + 0.2;
        // v26: под боевым ИИ — только вздрогнуть/пригнуться 0,35–1 с; дальше он сам
        // уходит в укрытие и отвечает огнём (раньше боец замирал в поле на 5–9 с)
        st.flinch = t + 0.55 + 0.12 * st.level;
        st.from = shooter
          ? {
              x: shooter.ctrl.pos.x,
              y: shooter.ctrl.pos.y + 1.5,
              z: shooter.ctrl.pos.z,
            }
          : { ...a };
      }
    }
    function move(s: any, dest: any, look: any, speed: number) {
      const c = s.ctrl,
        dx = dest.x - c.pos.x,
        dz = dest.z - c.pos.z,
        L = Math.hypot(dx, dz);
      s.idleYaw = Math.atan2(-(look.x - c.pos.x), -(look.z - c.pos.z));
      const k = L > 0.07 ? Math.min(speed, L * 3) / L : 0,
        cos = Math.cos(c.yaw),
        sin = Math.sin(c.yaw);
      c.aiWish = k
        ? new T.Vector2((dx * cos - dz * sin) * k, (dx * sin + dz * cos) * k)
        : null;
    }
    function drive(s: any, dt: number, t: number, active: any) {
      if (s === active || s.dead) return;
      const st = state(s),
        c = s.ctrl;
      if (t < st.until && t >= st.delay && (!s.battle || t < (st.flinch ?? st.until))) {
        c.aiWish = null;
        c.aiSprint = false;
        c.aiCrouch = true;
        c.aiProne = st.level >= 3;
        c.aiReady = 1;
        st.suppressed = true;
        if (st.from)
          s.idleYaw = Math.atan2(
            -(st.from.x - c.pos.x),
            -(st.from.z - c.pos.z),
          );
        return;
      }
      if (st.suppressed) {
        c.aiProne = undefined;
        st.suppressed = false;
      }
      if (st.mode === "idle") return;
      c.aiReady = 0;
      c.aiSprint = false;
      c.aiProne = false;
      c.aiCrouch = st.mode !== "approach";
      if (st.mode === "self-aid") {
        c.aiWish = null;
        return;
      }
      const q = st.target;
      if (!q) {
        reset(s);
        return;
      }
      if (st.mode === "treat") {
        const p = med.plan(q, s),
          point = aidPoint(q, p);
        if (!st.station) {
          st.station = station(s, q);
          if (!st.station) {
            reset(s, true);
            return;
          }
        }
        const shifted =
          Math.hypot(
            (st.station.woundX ?? point.x) - point.x,
            (st.station.woundZ ?? point.z) - point.z,
          ) > 0.25;
        if (shifted && !med.busy(s)) {
          restation(s, q);
          return;
        }
        if (!med.busy(s) && !contact(s))
          st.contactWait = (st.contactWait || 0) + dt;
        if (st.contactWait > 4) {
          metrics.stalls++;
          restation(s, q);
          return;
        }
        const woundHeight = point.y - c.pos.y;
        c.aiCrouch = woundHeight < 0.85;
        s._aidLow = c.aiCrouch && woundHeight < 0.65;
        move(s, st.station, point, 0.45);
        s._tacHands = {
          R: { x: point.x - 0.05, y: point.y, z: point.z },
          L: { x: point.x + 0.05, y: point.y, z: point.z },
        };
        return;
      }
      const path = st.agent?.battle.path;
      if (!path?.length) {
        c.aiWish = null;
        if (!st.agent?.battle.pending) {
          reset(s, true);
        }
        return;
      }
      let dest = path[Math.min(st.pathAt, path.length - 1)];
      if (
        dist(c.pos, dest) <
          (root.GNavigation?.get(world)?.query ? 0.22 : 0.4) &&
        Math.abs(c.pos.y - dest.y) < 0.3 &&
        st.pathAt < path.length - 1
      )
        dest = path[++st.pathAt];
      if (
        st.mode === "approach" &&
        st.pathAt >= path.length - 1 &&
        dist(c.pos, dest) < 0.45 &&
        dist(c.pos, st.station || pos(q)) > 0.6
      ) {
        reset(s, true);
        return;
      }
      if (dt > 0 && now - (st.progressAt || 0) > 2.5) {
        const progress = dist(pos(s), st.progressPos || pos(s));
        st.progressAt = now;
        st.progressPos = { ...pos(s) };
        if (progress < 0.1 && dist(pos(s), st.goal) > 0.6) {
          metrics.stalls++;
          if (st.mode === "approach") restation(s, q);
          else reset(s, true);
          return;
        }
      }
      move(s, dest, dest, st.mode === "drag" ? 0.4 : 1);
      if (st.mode === "drag" && q.rd) {
        const p = pos(q),
          dx = c.pos.x - p.x,
          dz = c.pos.z - p.z,
          L = Math.hypot(dx, dz);
        c.aiCrouch = true;
        c.dragging = true;
        if (L > 1.35) {
          reset(s);
          return;
        }
        if (L < 0.45)
          move(
            s,
            {
              x: p.x + ((st.goal.x - p.x) / (dist(st.goal, p) || 1)) * 0.6,
              z: p.z + ((st.goal.z - p.z) / (dist(st.goal, p) || 1)) * 0.6,
            },
            p,
            0.4,
          );
        else move(s, dest, p, 0.4);
        s._tacHands = {};
        const yaw = c.yaw,
          forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) },
          right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
        for (const side of ["R", "L"]) {
          const sg = side === "R" ? 1 : -1,
            i = o.PI["shoulder" + side] * 3;
          const point = {
            x: q.rd.p[i],
            y: q.rd.p[i + 1] + 0.04,
            z: q.rd.p[i + 2],
          };
          // First reach the casualty; only then pull towards a reachable grip in front of the medic.
          s._tacHands[side] = st.dragGrip
            ? {
                x: c.pos.x + forward.x * 0.48 + right.x * sg * 0.14,
                y: c.pos.y + 0.55,
                z: c.pos.z + forward.z * 0.48 + right.z * sg * 0.14,
              }
            : point;
        }
        if (!st.dragGrip) {
          c.aiWish = null;
          if (contact(s)) st.dragGrip = true;
        } else if (dt > 0) {
          const result = root.GPhysics.get(world).pullCasualty(
            q,
            s._tacHands,
            dt,
            o.PI,
          );
          if (!result?.held) {
            metrics.gripBreaks++;
            reset(s, true);
            return;
          }
          if (result.maxError > 0.65) c.aiWish = null;
        }
      }
    }
    return {
      think,
      drive,
      nearSegment,
      reset,
      state,
      events,
      route,
      station,
      alive,
      pos,
      stats: () => ({
        ...metrics,
        claims: claims.size,
        queued: nav.jobs.length,
        expanded: nav.expanded,
        navigation: root.GNavigation?.get(world)?.stats(),
      }),
    };
  }
}
(globalThis as any).GTactics = AegisTactics;
