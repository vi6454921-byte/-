/* Low-frequency FSM. No health regeneration: delegates finite supplies to GMedic.
   A casualty may be down (s.dead) but physiologically alive. */
(function (root, f) {
  const M = f();
  if (typeof module === "object" && module.exports) module.exports = M;
  else root.GTactics = M;
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const alive = (s) =>
    !!s &&
    !!s.dmg &&
    !s.finished &&
    !(s.dmg.ph && s.dmg.ph.dead) &&
    !["cns", "fatal"].includes(s.deathKind);
  function segmentDistance(p, a, b) {
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
  function translateBody(s, dx, dy, dz) {
    const r = s.rd;
    if (!r) return false;
    for (const arr of [
      r.p,
      r.pp,
      r.tq,
      r.P0 && r.P0.p,
      r.gun && r.gun.p,
      r.gun && r.gun.pp,
    ])
      if (arr)
        for (let i = 0; i < arr.length; i += 3) {
          arr[i] += dx;
          arr[i + 1] += dy;
          arr[i + 2] += dz;
        }
    if(globalThis.GPhysics)globalThis.GPhysics.translate(s,dx,dy,dz);
    s.ctrl.pos.x += dx;
    s.ctrl.pos.y += dy;
    s.ctrl.pos.z += dz;
    r.sleep = 0;
    r.sleepT = 0;
    return true;
  }
  function create(o) {
    const { squad, world, med, THREE } = o;
    let globalVoice = -99,
      nextThink = 0,
      lastThreat = null;
    const events = [];
    const pos = (s) =>
      s.rd
        ? {
            x: s.rd.p[o.PI.pelvis * 3],
            y: s.rd.p[o.PI.pelvis * 3 + 1],
            z: s.rd.p[o.PI.pelvis * 3 + 2],
          }
        : s.ctrl.pos;
    const state = (s) =>
      s.tac ||
      (s.tac = {
        mode: "idle",
        until: 0,
        delay: 0,
        level: 0,
        from: null,
        lastNear: -99,
        voice: -99,
        goal: null,
        target: null,
        path: null,
        pathI: 0,
        timeout: 0,
      });
    function say(s, text, t, kind) {
      const st = state(s);
      if (t - st.voice < 14 || t - globalVoice < 3) return false;
      st.voice = t;
      globalVoice = t;
      /* v25: реплику выбирает голосовой модуль (31c_voice.js) — субтитр по ней */
      let said = null;
      if (o.speech && o.speech() && o.speak) { const r = o.speak(s, text, kind); if (typeof r === 'string' && r) said = r; }
      if (said) text = said;
      events.push({ who: s.key, text, t, kind });
      if (events.length > 32) events.shift();
      o.caption && o.caption(s, text, t);
      const e = s.sfx;
      if (kind === "near" && e && e.B) {
        const bank = e.bank("yelp");
        if (bank) {
          e.mouth(bank.shortest(), e.now() + 0.08, { gain: 0.5, effort: 0.6 });
          e.nextBreath = e.now() + 1;
        }
      }
      return true;
    }
    function nearSegment(a, b, shooter, t) {
      for (const s of squad) {
        if (s === shooter || s.dead || !s.dmg) continue;
        const p = pos(s),
          head = { x: p.x, y: p.y + 1.25, z: p.z };
        if (segmentDistance(head, a, b) > 1.2) continue;
        const st = state(s);
        if (t - (st.countAt ?? -99) > 0.12) {
          st.level = Math.min(4, st.level + 1);
          st.countAt = t;
        }
        st.lastNear = t;
        st.until = t + 5 + Math.min(3, st.level);
        if (st.lastReactUntil === undefined || t > st.lastReactUntil)
          st.delay = t + 0.18 + (s.idleSeed % 1) * 0.2;
        st.lastReactUntil = st.until;
        st.from = shooter
          ? {
              x: shooter.ctrl.pos.x,
              y: shooter.ctrl.pos.y + 1.5,
              z: shooter.ctrl.pos.z,
            }
          : { ...a };
        lastThreat = st.from;
      }
    }
    function blocked(a, b, r = 0.32) {
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
      for (let j = 1; j <= n; j++) {
        const f = j / n,
          x = a.x + (b.x - a.x) * f,
          z = a.z + (b.z - a.z) * f;
        if (Math.abs(x) > 34 || Math.abs(z) > 39) return true;
        for (const c of world.colliders) {
          if (c.h < 0.35) continue;
          if (c.type === "box") {
            if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r)
              return true;
          } else if (Math.hypot(x - c.x, z - c.z) < (c.r || 0) + r) return true;
        }
      }
      return false;
    }
    function route(a, b) {
      if (!blocked(a, b)) return [b];
      const step = 0.8,
        origin = { x: a.x, z: a.z },
        key = (x, z) => x + "," + z,
        q = [{ x: 0, z: 0, parent: -1 }],
        seen = new Set(["0,0"]);
      for (let i = 0; i < q.length && i < 900; i++) {
        const n = q[i],
          p = { x: origin.x + n.x * step, z: origin.z + n.z * step };
        if (Math.hypot(p.x - b.x, p.z - b.z) < 1.2 && !blocked(p, b)) {
          const out = [b];
          for (let k = i; k > 0; k = q[k].parent)
            out.unshift({
              x: origin.x + q[k].x * step,
              z: origin.z + q[k].z * step,
            });
          return out;
        }
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const x = n.x + dx,
            z = n.z + dz,
            K = key(x, z);
          if (seen.has(K) || Math.abs(x) > 12 || Math.abs(z) > 12) continue;
          seen.add(K);
          const to = { x: origin.x + x * step, z: origin.z + z * step };
          if (!blocked(p, to)) q.push({ x, z, parent: i });
        }
      }
      return null;
    }
    function cover(s, target) {
      const st = state(s),
        p = pos(target);
      if (!st.from || !o.occluded) return null;
      let best = null,
        score = 1e9;
      for (const c of world.colliders) {
        if (c.tree || c.h < 0.6) continue;
        const x = c.type === "box" ? (c.x0 + c.x1) / 2 : c.x,
          z = c.type === "box" ? (c.z0 + c.z1) / 2 : c.z,
          r = c.type === "box" ? Math.hypot(c.x1 - c.x0, c.z1 - c.z0) / 2 : c.r;
        if (r < 0.4 || Math.hypot(x - p.x, z - p.z) > 7) continue;
        const dx = x - st.from.x,
          dz = z - st.from.z,
          L = Math.hypot(dx, dz) || 1,
          goal = { x: x + (dx / L) * (r + 1.4), z: z + (dz / L) * (r + 1.4) };
        if (blocked(goal, goal)) continue;
        const path = route(p, goal);
        if (
          !path ||
          !o.occluded(st.from, {
            ...goal,
            y: (world.heightAt ? world.heightAt(goal.x, goal.z) : 0) + 0.55,
          })
        )
          continue;
        const D = Math.hypot(goal.x - p.x, goal.z - p.z);
        if (D < score) {
          score = D;
          best = { goal, path };
        }
      }
      return best;
    }
    function reset(s) {
      const st = state(s);
      if (med.busy(s)) med.cancel(s);
      st.mode = "idle";
      st.target = null;
      st.path = null;
      st.station = null;
      st.dragAttached = false;
      s.ctrl.aiWish = null;
      s.ctrl.aiProne = undefined;
      s.ctrl.dragging = false;
      s._tacHands = null;
      s._aidLow = false;
    }
    function aidPoint(target, p) {
      const side = p.side || "L",
        name =
          {
            uarm: "shoulder",
            farm: "elbow",
            thigh: "hip",
            shin: "knee",
            foot: "ankle",
            hand: "wrist",
          }[p.zone] ||
          { neck: "neck", pelvis: "pelvis", thorax: "chest", abdomen: "spine" }[
            p.zone
          ] ||
          "chest";
      if (target.rd) {
        const r = target.rd,
          i = (o.PI[name + side] ?? o.PI[name] ?? o.PI.chest) * 3;
        return { x: r.p[i], y: r.p[i + 1] + 0.06, z: r.p[i + 2] };
      }
      const bn =
        target.char.bone(name === "pelvis" ? "hips" : name + side) ||
        target.char.bone(name) ||
        target.char.bone("chest");
      return bn.getWorldPosition(new THREE.Vector3());
    }
    function focusMove(s, dest, look, speed) {
      const c = s.ctrl,
        dx = dest.x - c.pos.x,
        dz = dest.z - c.pos.z,
        D = Math.hypot(dx, dz);
      s.idleYaw = Math.atan2(-(look.x - c.pos.x), -(look.z - c.pos.z));
      if (D < 0.07) {
        c.aiWish = null;
        return;
      }
      const k = Math.min(speed, D * 3) / D,
        cos = Math.cos(c.yaw),
        sin = Math.sin(c.yaw);
      c.aiWish = new THREE.Vector2(
        (dx * cos - dz * sin) * k,
        (dx * sin + dz * cos) * k,
      );
    }
    function contact(s, max = 0.04) {
      if (!s._tacHands) return false;
      return ["R", "L"].every((side) => {
        const p = s.char
            .bone("wrist" + side)
            .getWorldPosition(new THREE.Vector3()),
          q = s._tacHands[side];
        return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) <= max;
      });
    }
    function think(t, active) {
      if (t < nextThink) return;
      nextThink = t + 0.25;
      for (const s of squad) {
        const st = state(s);
        if (s === active || s.dead) {
          if (st.mode !== "idle") reset(s);
          continue;
        }
        if (st.target && !alive(st.target)) {
          reset(s);
          continue;
        }
        const danger =
          t < st.until || (s.thr && s.thr.mode && s.thr.mode !== "home");
        if (danger) {
          if (st.target) reset(s);
          continue;
        }
        if (s.ctrl.trait?.id !== "medic") continue;
        if (!st.from) st.from = lastThreat;
        if (st.mode === "idle") {
          let target = null,
            score = -1;
          for (const q of squad) {
            if (
              q === s ||
              !alive(q) ||
              med.plan(q, s).none ||
              Math.hypot(pos(q).x - pos(s).x, pos(q).z - pos(s).z) > 12
            )
              continue;
            const rate = (q.dmg.ph?.src || []).reduce(
              (a, e) => a + (e.tq ? 0 : e.rate || 0),
              0,
            );
            if (rate > score) {
              score = rate;
              target = q;
            }
          }
          if (target) {
            st.target = target;
            st.mode = "approach";
            st.path = route(pos(s), pos(target));
            st.pathI = 0;
            st.timeout = t + 30;
            if (!st.path) {
              reset(s);
              continue;
            }
            say(s, "Иду к трёхсотому, прикройте!", t, "aid");
          }
        }
        if (!st.target) continue;
        if (t > st.timeout) {
          reset(s);
          continue;
        }
        const d = Math.hypot(
          pos(s).x - pos(st.target).x,
          pos(s).z - pos(st.target).z,
        );
        if (st.mode === "approach" && d < 1.15) {
          const cv = st.target.rd ? cover(s, st.target) : null;
          if (cv) {
            st.mode = "drag";
            st.goal = cv.goal;
            st.path = cv.path;
            st.pathI = 0;
            st.timeout = t + 30;
            say(s, "Тащу в укрытие!", t, "drag");
          } else st.mode = "treat";
        }
        if (
          st.mode === "drag" &&
          Math.hypot(
            pos(st.target).x - st.goal.x,
            pos(st.target).z - st.goal.z,
          ) < 0.6
        ) {
          st.mode = "treat";
          s.ctrl.dragging = false;
          s._tacHands = null;
          s._aidLow = false;
        }
        if (st.mode === "treat") {
          const plan = med.plan(st.target, s),
            point = aidPoint(st.target, plan);
          if (!st.station) {
            const dx = s.ctrl.pos.x - point.x,
              dz = s.ctrl.pos.z - point.z,
              L = Math.hypot(dx, dz) || 1;
            st.station = {
              x: point.x + (dx / L) * 0.38,
              z: point.z + (dz / L) * 0.38,
            };
          }
          const near =
              Math.hypot(
                s.ctrl.pos.x - st.station.x,
                s.ctrl.pos.z - st.station.z,
              ) < 0.18,
            angle = Math.abs(
              Math.atan2(
                Math.sin(s.idleYaw - s.ctrl.yaw),
                Math.cos(s.idleYaw - s.ctrl.yaw),
              ),
            );
          if (d > 1.5) {
            st.mode = "approach";
            st.path = route(pos(s), pos(st.target));
            st.pathI = 0;
          } else if (near && angle < 0.3 && contact(s) && !med.busy(s)) {
            if (med.plan(st.target, s).none) {
              /* v26: после жгута — «Жгут наложил. Время засёк.» (время наложения — обязательная отметка) */
              const tq = !!(st.target.dmg && st.target.dmg.tq);
              say(s, tq ? "Жгут наложил. Время засёк." : "Перевязал. Жить будет.", t, tq ? "doneTq" : "done");
              reset(s);
            } else med.start(s, st.target);
          }
        }
      }
    }
    function drive(s, dt, t, active) {
      const st = state(s),
        c = s.ctrl;
      if (s === active || s.dead) return;
      if (s.thr && s.thr.mode && s.thr.mode !== "home") return;
      if (t < st.until && t >= st.delay) {
        st.wasSuppressed = true;
        c.aiWish = null;
        c.aiSprint = false;
        c.aiCrouch = true;
        c.aiProne = st.level >= 3;
        const a = st.from;
        if (a) s.idleYaw = Math.atan2(-(a.x - c.pos.x), -(a.z - c.pos.z));
        c.aiReady = 1;
        if (s.life) {
          s.life.crouchUntil = st.until;
          s.life.readyUntil = st.until;
          s.life.alertUntil = st.until;
          s.life.alert = 1;
          if (!st.flinched) {
            s.life.startle.v += 7;
            st.flinched = true;
            say(s, "Накрывают! В укрытие!", t, "near");
          }
        }
        return;
      }
      if (t >= st.until) {
        if (st.wasSuppressed) {
          c.aiProne = undefined;
          st.wasSuppressed = false;
        }
        st.level = Math.max(0, st.level - dt * 0.4);
        st.flinched = false;
        if (st.mode === "idle") return;
      }
      c.aiProne = false;
      c.aiSprint = false;
      c.aiCrouch = st.mode === "treat" || st.mode === "drag";
      c.aiReady = 0;
      if (st.mode === "treat") {
        const target = st.target,
          job = s.med && s.med.job,
          p = job ? job.p : med.plan(target, s),
          point = aidPoint(target, p);
        c.aiCrouch = !!target?.rd || ["thigh", "shin", "foot"].includes(p.zone);
        s._aidLow = c.aiCrouch;
        if (!st.station) {
          const dx = c.pos.x - point.x,
            dz = c.pos.z - point.z,
            L = Math.hypot(dx, dz) || 1;
          st.station = {
            x: point.x + (dx / L) * 0.38,
            z: point.z + (dz / L) * 0.38,
          };
        }
        focusMove(s, st.station, point, 0.45);
        s._tacHands = {
          R: { x: point.x - 0.05, y: point.y, z: point.z },
          L: { x: point.x + 0.05, y: point.y, z: point.z },
        };
        return;
      }

      const path = st.path;
      if (!path || !path.length) {
        reset(s);
        return;
      }
      let dest = path[Math.min(st.pathI, path.length - 1)];
      if (
        Math.hypot(dest.x - c.pos.x, dest.z - c.pos.z) < 0.35 &&
        st.pathI < path.length - 1
      )
        dest = path[++st.pathI];
      const dx = dest.x - c.pos.x,
        dz = dest.z - c.pos.z,
        yaw = Math.atan2(-dx, -dz);
      s.idleYaw = yaw;
      const angle = Math.atan2(Math.sin(yaw - c.yaw), Math.cos(yaw - c.yaw));
      c.aiWish =
        Math.abs(angle) < 0.7
          ? new THREE.Vector2(0, st.mode === "drag" ? -0.4 : -1)
          : null;
      if (st.mode === "drag" && st.target.rd) {
        const r0 = st.target.rd,
          pi0 = o.PI;
        const mid = {
          x: (r0.p[pi0.shoulderR * 3] + r0.p[pi0.shoulderL * 3]) * 0.5,
          z: (r0.p[pi0.shoulderR * 3 + 2] + r0.p[pi0.shoulderL * 3 + 2]) * 0.5,
        };
        const gx0 = st.goal.x - mid.x,
          gz0 = st.goal.z - mid.z,
          gl = Math.hypot(gx0, gz0) || 1;
        const station = {
          x: mid.x + (gx0 / gl) * 0.4,
          z: mid.z + (gz0 / gl) * 0.4,
        };
        if (!st.dragAttached) {
          focusMove(s, station, mid, 0.5);
          if (Math.hypot(c.pos.x - station.x, c.pos.z - station.z) < 0.12)
            st.dragAttached = true;
          else return;
        }
        focusMove(s, dest, mid, 0.4);
        if (
          st.target.rd.anim &&
          st.target.rd.te < st.target.rd.anim.dur + 2.4
        ) {
          c.aiWish = null;
          return;
        }
        const tp = pos(st.target),
          d = Math.hypot(c.pos.x - tp.x, c.pos.z - tp.z);
        if (d > 1.35) {
          reset(s);
          return;
        }
        const vx = c.vel.x * dt,
          vz = c.vel.z * dt,
          L = Math.hypot(vx, vz),
          scale = L > 0.65 * dt ? (0.65 * dt) / L : 1;
        const gx = tp.x + vx * scale,
          gz = tp.z + vz * scale;
        if (!blocked(tp, { x: gx, z: gz }, 0.35)) {
          const gy =
            (world.heightAt ? world.heightAt(gx, gz) : 0) -
            (world.heightAt ? world.heightAt(tp.x, tp.z) : 0);
          translateBody(st.target, vx * scale, gy, vz * scale);
          st.target.rd.obst = [];
          for (const c0 of world.colliders) {
            const cx = c0.type === "box" ? (c0.x0 + c0.x1) / 2 : c0.x,
              cz = c0.type === "box" ? (c0.z0 + c0.z1) / 2 : c0.z,
              rr =
                c0.type === "box"
                  ? Math.hypot(c0.x1 - c0.x0, c0.z1 - c0.z0) / 2
                  : c0.r;
            if (Math.hypot(cx - gx, cz - gz) < rr + 2.6)
              st.target.rd.obst.push({
                c: c0,
                top:
                  c0._top ??
                  (world.heightAt ? world.heightAt(cx, cz) : 0) + (c0.h || 2),
              });
          }
        }
        c.dragging = true;
        const r = st.target.rd,
          pi = o.PI;
        s._tacHands = {
          R: {
            x: r.p[pi.shoulderR * 3],
            y: r.p[pi.shoulderR * 3 + 1] + 0.06,
            z: r.p[pi.shoulderR * 3 + 2],
          },
          L: {
            x: r.p[pi.shoulderL * 3],
            y: r.p[pi.shoulderL * 3 + 1] + 0.06,
            z: r.p[pi.shoulderL * 3 + 2],
          },
        };
      }
    }
    return {
      nearSegment,
      think,
      drive,
      reset,
      events,
      state,
      route,
      alive,
      pos,
    };
  }
  return { alive, segmentDistance, translateBody, create };
});
