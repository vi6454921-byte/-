/** Fully dynamic experimental biped. No kinematic pelvis, gravity cancellation,
 * root teleport, world anchor or KCC while attached. Ground reactions are generated
 * by actual contact colliders, including hands and knees. Muscles are equal/opposite internal wrenches.
 * Reference angles are control inputs, never directly applied to the skin.
 * Full balance/gait/get-up acceptance currently FAILS. Lab only, not normal play. */
namespace AegisActiveBody {
  const root: any = globalThis,
    R: any = root.RAPIER;
  const all = new WeakMap<any, Map<any, any>>();
  const contactWorlds = new WeakMap<any, any>();
  function contactWorld(p: any) {
    let w = contactWorlds.get(p);
    if (!w) {
      const parts = new Map<number, any>();
      w = {
        parts,
        hooks: {
          filterContactPair(a: number, b: number) {
            const x = parts.get(a),
              y = parts.get(b);
            return x && y && x.rig === y.rig && x.exclusions.has(y)
              ? null
              : R.SolverFlags.COMPUTE_IMPULSE;
          },
          filterIntersectionPair() {
            return true;
          },
        },
      };
      contactWorlds.set(p, w);
    }
    return w;
  }
  export function hooks(p: any) {
    const w = contactWorlds.get(p);
    return w?.parts.size ? w.hooks : undefined;
  }
  function excludedPair(x: any, y: any) {
    let n = x;
    const ancestors = new Map();
    let i = 0;
    while (n) {
      ancestors.set(n, i++);
      n = n.parent;
    }
    n = y;
    i = 0;
    while (n && !ancestors.has(n)) {
      i++;
      n = n.parent;
    }
    if (n && i + ancestors.get(n) <= 2) return true;
    const trunk = /^(hips|spine|chest|neck|head|clav[RL])$/;
    return trunk.test(x.name) && trunk.test(y.name);
  }
  const names = [
    "hips",
    "spine",
    "chest",
    "neck",
    "head",
    "clavR",
    "shoulderR",
    "elbowR",
    "wristR",
    "clavL",
    "shoulderL",
    "elbowL",
    "wristL",
    "hipR",
    "kneeR",
    "ankleR",
    "hipL",
    "kneeL",
    "ankleL",
  ];
  const ends: any = {
    hips: "spine",
    spine: "chest",
    chest: "neck",
    neck: "head",
    clavR: "shoulderR",
    shoulderR: "elbowR",
    elbowR: "wristR",
    wristR: "palmR",
    clavL: "shoulderL",
    shoulderL: "elbowL",
    elbowL: "wristL",
    wristL: "palmL",
    hipR: "kneeR",
    kneeR: "ankleR",
    ankleR: "toeR",
    hipL: "kneeL",
    kneeL: "ankleL",
    ankleL: "toeL",
  };
  const zero = () => ({ x: 0, y: 0, z: 0 });
  export const config = { maxBodies: 12 };
  const tuning = {
    k: 16000,
    d: 500,
    feedback: 2,
    velocity: 1.5,
    transfer: 0.6,
    loadGate: true,
    stride: 0.28,
    swing: 0.6,
    ankleFeedback: 1,
    ankleD: 0.2,
    yaw: true,
  };
  let controls: any = tuning;
  function parameters() {
    return controls;
  }
  function list(p: any) {
    let a = all.get(p);
    if (!a) {
      a = new Map();
      all.set(p, a);
    }
    return a;
  }
  export function get(s: any) {
    return s.ctrl?._activeBody || null;
  }
  export function attach(p: any, s: any) {
    if (get(s)) {
      if (get(s).p !== p)
        throw Error("Active body belongs to another physics session");
      return get(s);
    }
    if (!p?.sim || !s?.char?.bone || !s?.ctrl)
      throw Error("Active body requires a physics session and a character");
    for (const n of names)
      if (!s.char.bone(n)) throw Error("Active body missing bone: " + n);
    const T = root.THREE,
      registry = list(p),
      used = new Set(Array.from(registry.values()).map((r: any) => r.group));
    const group = Array.from({ length: 12 }, (_, i) => 1 << (i + 4)).find(
      (x) => !used.has(x),
    );
    if (!group || registry.size >= config.maxBodies)
      throw Error("Active body capacity exceeded");
    if (
      R.version() !== "0.19.3" ||
      typeof p.sim.impulseJoints.raw.jointConfigureMotor !== "function"
    )
      throw Error(
        "Active body requires the bundled Rapier 0.19.3 motor bindings",
      );
    root.GContacts?.drop(p, s);
    p.dropPose(s);
    p.removeActor(s.ctrl);
    s.char.root.updateMatrixWorld(true);
    const allocated: any[] = [],
      parts: any[] = [],
      byBone = new Map<any, any>(),
      byName: any = {};
    const q = new T.Quaternion(),
      V = T.Vector3;
    try {
      for (const name of names) {
        const bone = s.char.bone(name);
        if (!bone) continue;
        const at = bone.getWorldPosition(new V());
        bone.getWorldQuaternion(q);
        const child = s.char.bone(ends[name]);
        const off = child
          ? child
              .getWorldPosition(new V())
              .sub(at)
              .applyQuaternion(q.clone().invert())
          : new V(0, 0.1, 0);
        const mass =
          name === "hips"
            ? 12
            : name === "spine"
              ? 7
              : name === "chest"
                ? 18
                : name === "head"
                  ? 4
                  : name === "neck"
                    ? 0.3
                    : name.startsWith("clav")
                      ? 0.2
                      : name.startsWith("shoulder")
                        ? 2.8
                        : name.startsWith("elbow")
                          ? 1.7
                          : name.startsWith("wrist")
                            ? 0.5
                            : name.startsWith("hip")
                              ? 7
                              : name.startsWith("knee")
                                ? 4
                                : 1.2;
        const body = p.sim.createRigidBody(
          R.RigidBodyDesc.dynamic()
            .setTranslation(at.x, at.y, at.z)
            .setRotation(q)
            .setLinearDamping(0.12)
            .setAngularDamping(0.7)
            .setCcdEnabled(true)
            .setCanSleep(false)
            .setAdditionalSolverIterations(12),
        );
        allocated.push(body);
        let shape: any;
        const radius =
          name === "hips"
            ? 0.12
            : name === "chest"
              ? 0.13
              : name === "spine"
                ? 0.09
                : name === "head"
                  ? 0.1
                  : name.startsWith("hip")
                    ? 0.067
                    : name.startsWith("knee")
                      ? 0.05
                      : 0.035;
        if (name.startsWith("ankle"))
          shape = R.ColliderDesc.cuboid(0.065, 0.035, 0.14).setTranslation(
            0,
            -0.035,
            -0.055,
          );
        else if (name.startsWith("wrist")) shape = R.ColliderDesc.ball(0.042);
        else if (name === "head")
          shape = R.ColliderDesc.ball(0.1).setTranslation(0, 0.045, 0);
        else {
          shape = R.ColliderDesc.capsule(
            Math.max(0.004, off.length() / 2 - radius),
            radius,
          ).setTranslation(off.x * 0.5, off.y * 0.5, off.z * 0.5);
          if (off.length() > 0.001)
            shape.setRotation(
              new T.Quaternion().setFromUnitVectors(
                new V(0, 1, 0),
                off.clone().normalize(),
              ),
            );
        }
        const col = p.sim.createCollider(
          shape
            .setMass(mass)
            .setFriction(
              name.startsWith("ankle")
                ? 1.5
                : /^(wrist|knee)/.test(name)
                  ? 1
                  : 0.7,
            )
            .setRestitution(0)
            .setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS)
            .setCollisionGroups(((group << 16) | 0xffff) >>> 0),
          body,
        );
        let parent = bone.parent;
        while (parent && !byBone.has(parent)) parent = parent.parent;
        const pa = byBone.get(parent);
        let joint: any = null,
          link: any = null;
        if (pa) {
          const anchor = at
            .clone()
            .sub(pa.at)
            .applyQuaternion(pa.q.clone().invert());
          joint = p.sim.createImpulseJoint(
            R.JointData.generic(anchor, zero(), { x: 1, y: 0, z: 0 }, 0),
            pa.body,
            body,
            true,
          );
          joint.setContactsEnabled(false);
          for (let axis = 3; axis < 6; axis++)
            joint.rawSet.jointConfigureMotorModel(joint.handle, axis, 1);
          // Multibody JointData limits alone are not enforced by this pinned
          // JS binding. Enforce the same X bound on the companion impulse joint.
          if (name.startsWith("knee"))
            joint.rawSet.jointSetLimits(joint.handle, 3, -2.7, 0.05);
          if (name.startsWith("elbow"))
            joint.rawSet.jointSetLimits(
              joint.handle,
              5,
              ...(name.endsWith("R") ? [0, 2.6] : [-2.6, 0]),
            );
          const data = name.startsWith("elbow")
            ? R.JointData.revolute(anchor, zero(), { x: 0, y: 1, z: 0 })
            : name.startsWith("knee")
              ? R.JointData.revolute(anchor, zero(), { x: 1, y: 0, z: 0 })
              : R.JointData.spherical(anchor, zero());
          if (name.startsWith("knee")) {
            data.limitsEnabled = true;
            data.limits = [-2.7, 0.05];
          }
          link = p.sim.createMultibodyJoint(data, pa.body, body, true);
          if (!link) throw Error("Multibody spherical joint unsupported");
          link.setContactsEnabled(false);
        }
        const a = {
          name,
          bone,
          body,
          col,
          colliderDesc: shape,
          mass,
          parent: pa,
          joint,
          link,
          at: at.clone(),
          q: q.clone(),
          prevP: at.clone(),
          currP: at.clone(),
          prevQ: q.clone(),
          currQ: q.clone(),
          goal: bone.quaternion.clone(),
          off,
          contact: false,
        };
        parts.push(a);
        byBone.set(bone, a);
        byName[name] = a;
      }
      for (const a of parts)
        a.descendants = parts.filter((d) => {
          let n = d;
          while (n) {
            if (n === a) return true;
            n = n.parent;
          }
          return false;
        });
      const rig: any = {
        s,
        p,
        rigMode: "articulated",
        character: s.char,
        parts,
        byName,
        group,
        hipHeight: s.char.metrics?.hipY || s.char.bone("hips").position.y,
        mass: parts.reduce((a, b) => a + b.mass, 0),
        state: "standing",
        time: 0,
        stateTime: 0,
        unsupported: 0,
        goalYaw: s.ctrl.yaw || 0,
        wish: new V(),
        phase: 0,
        steps: 0,
        completedSteps: 0,
        missedSteps: 0,
        targetYaw: s.ctrl.yaw || 0,
        feet: {},
        support: 0,
        com: new V(),
        comVel: new V(),
        recovery: 0,
        locomotion: false,
        autoRecover: false,
      };
      for (const side of ["R", "L"]) {
        const foot = byName["ankle" + side];
        rig.feet[side] = {
          side,
          part: foot,
          anchor: foot.currP.clone(),
          goal: foot.currP.clone(),
          start: foot.currP.clone(),
          end: foot.currP.clone(),
          swing: -1,
        };
      }
      rig.standHeight =
        byName.hips.at.y -
        (rig.feet.R.anchor.y + rig.feet.L.anchor.y) / 2 +
        0.075 -
        0.03;
      for (const f of Object.values(rig.feet) as any[]) {
        const g = p.support(f.anchor.x, f.anchor.z, f.anchor.y + 0.1, 0.4);
        if (g && Math.abs(f.anchor.y - g.y) < 0.3)
          f.anchor.y = f.goal.y = g.y + 0.075;
      }
      for (const a of parts) {
        a.rig = rig;
        a.exclusions = new Set(parts.filter((b) => excludedPair(a, b)));
        contactWorld(p).parts.set(a.col.handle, a);
      }
      registry.set(s, rig);
      s.ctrl._activeBody = rig;
      return rig;
    } catch (error) {
      for (const body of allocated) p.sim.removeRigidBody(body);
      throw error;
    }
  }
  export function detach(p: any, s: any) {
    const r = get(s);
    if (!r) return;
    if (r.p !== p)
      throw Error("Active body belongs to another physics session");
    for (const a of r.parts) {
      contactWorld(p).parts.delete(a.col.handle);
      p.sim.removeRigidBody(a.body);
    }
    list(p).delete(s);
    s.ctrl._activeBody = null;
  }
  export function request(p: any, c: any, dt: number) {
    const r = c._activeBody;
    if (!r || r.p !== p) return false;
    r.wish
      .set(
        Number.isFinite(c.vel.x) ? c.vel.x : 0,
        0,
        Number.isFinite(c.vel.z) ? c.vel.z : 0,
      )
      .clampLength(0, 2.4);
    if (Number.isFinite(c.yaw)) r.targetYaw = c.yaw;
    sync(r);
    return true;
  }
  function ragdollConstraints(r: any) {
    if (r.rigMode === "impulse") return;
    const copyV = (v: any) => ({ x: v.x, y: v.y, z: v.z }),
      snap = new Map();
    for (const a of r.parts)
      snap.set(a, {
        p: copyV(a.body.translation()),
        q: { ...a.body.rotation() },
        v: copyV(a.body.linvel()),
        w: copyV(a.body.angvel()),
        anchor: a.joint ? a.joint.anchor1() : null,
      });
    // Rapier 0.19.3 traps when dismantling a live multibody link-by-link and
    // reusing its bodies. Recreate a dynamic ragdoll with IDENTICAL transforms,
    // velocities, mass and shapes. This is a solver handover, never a get-up/reset.
    for (const a of r.parts) contactWorld(r.p).parts.delete(a.col.handle);
    for (const a of [...r.parts].reverse()) r.p.sim.removeRigidBody(a.body);
    for (const a of r.parts) {
      const v: any = snap.get(a);
      a.body = r.p.sim.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(v.p.x, v.p.y, v.p.z)
          .setRotation(v.q)
          .setLinvel(v.v.x, v.v.y, v.v.z)
          .setAngvel(v.w)
          .setLinearDamping(0.12)
          .setAngularDamping(0.7)
          .setCcdEnabled(true)
          .setCanSleep(false)
          .setAdditionalSolverIterations(12),
      );
      a.col = r.p.sim.createCollider(a.colliderDesc, a.body);
      a.joint = null;
      a.link = null;
      contactWorld(r.p).parts.set(a.col.handle, a);
    }
    for (const a of r.parts)
      if (a.parent) {
        const at: any = snap.get(a),
          mask = a.name.startsWith("knee")
            ? 55
            : a.name.startsWith("elbow")
              ? 31
              : 7,
          j = r.p.sim.createImpulseJoint(
            R.JointData.generic(at.anchor, zero(), { x: 1, y: 0, z: 0 }, mask),
            a.parent.body,
            a.body,
            true,
          );
        j.setContactsEnabled(false);
        for (let axis = 3; axis < 6; axis++) {
          j.rawSet.jointConfigureMotorModel(j.handle, axis, 1);
          j.rawSet.jointConfigureMotor(j.handle, axis, 0, 0, 0, 0.3);
        }
        if (a.name.startsWith("knee"))
          j.rawSet.jointSetLimits(j.handle, 3, -2.7, 0.05);
        if (a.name.startsWith("elbow"))
          j.rawSet.jointSetLimits(
            j.handle,
            5,
            ...(a.name.endsWith("R") ? [0, 2.6] : [-2.6, 0]),
          );
        a.joint = j;
        a.passive = true;
      }
    r.rigMode = "impulse";
    r.physicalModeChanges = (r.physicalModeChanges || 0) + 1;
  }
  function state(r: any, next: string) {
    if (r.state === next) return;
    if (next === "falling" || next === "fallen") ragdollConstraints(r);
    r.state = next;
    r.stateTime = 0;
    r.transitions = (r.transitions || [])
      .concat({ at: r.time, to: next })
      .slice(-32);
  }
  function sync(r: any) {
    const c = r.s.ctrl,
      hip = r.byName.hips.body.translation();
    c.pos.set(hip.x, hip.y - r.hipHeight, hip.z);
    c.vel.copy(r.byName.hips.body.linvel());
    c.speed = Math.hypot(c.vel.x, c.vel.z);
    c.grounded = r.support > 0;
  }
  function pairTorque(a: any, b: any, t: any) {
    a.addTorque(t, true);
    b.addTorque({ x: -t.x, y: -t.y, z: -t.z }, true);
  }
  function drive(a: any, h: number, active = true, freeYaw = true) {
    if (!active && a.passive) return;
    a.passive = !active;
    const q = a.goal.clone();
    if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    const angles = [
      2 * Math.asin(Math.max(-1, Math.min(1, q.x))),
      -2 * Math.asin(Math.max(-1, Math.min(1, q.z))),
      2 * Math.asin(Math.max(-1, Math.min(1, q.y))),
    ];
    const support = a.name.startsWith("ankle") && a.contact && !a.swing;
    for (let i = 0; i < 3; i++) {
      const soft =
        (a.name.startsWith("knee") && i > 0) ||
        (a.name.startsWith("elbow") && i !== 2) ||
        (support && i === 2 && parameters().yaw && freeYaw);
      a.joint.rawSet.jointConfigureMotor(
        a.joint.handle,
        3 + i,
        active
          ? a.name.startsWith("elbow") && i === 2
            ? Math.max(
                a.name.endsWith("R") ? 0 : -2.6,
                Math.min(a.name.endsWith("R") ? 2.6 : 0, angles[i]),
              )
            : angles[i]
          : 0,
        0,
        active && !soft ? (parameters().k ?? 16000) : 0,
        active ? (soft ? 1 : (parameters().d ?? 500)) : 0.3,
      );
    }
  }
  function reference(r: any, feet: any[], comGoal: any) {
    const T = root.THREE,
      V = T.Vector3,
      Q = T.Quaternion,
      yaw = new Q().setFromAxisAngle(new V(0, 1, 0), r.goalYaw);
    const center = feet[0].goal.clone().add(feet[1].goal).multiplyScalar(0.5),
      pelvis = r.pose || (r.pose = center.clone());
    const baseY =
      Math.min(feet[0].goal.y, feet[1].goal.y) +
      (r.recoveryHeight ?? r.standHeight) -
      0.075 -
      (r.gait?.emergency ? 0.08 : 0);
    pelvis.y = baseY;
    // Solve a reference skeleton, not a physics body. COM constraints adjust
    // muscle angles; they never move the live pelvis or attach it to the world.
    for (let iteration = 0; iteration < 5; iteration++) {
      pelvis.y = baseY;
      for (const side of ["R", "L"]) {
        const a = r.byName["hip" + side],
          b = r.byName["knee" + side],
          offset = new V().copy(a.joint.anchor1()).applyQuaternion(yaw),
          target = r.feet[side].goal,
          horizontal = Math.hypot(
            target.x - pelvis.x - offset.x,
            target.z - pelvis.z - offset.z,
          ),
          length = a.off.length() + b.off.length() - 0.012;
        pelvis.y = Math.min(
          pelvis.y,
          target.y -
            offset.y +
            Math.sqrt(
              Math.max(0.15, length * length - horizontal * horizontal),
            ),
        );
      }

      for (const side of ["R", "L"]) {
        const a = r.byName["hip" + side],
          b = r.byName["knee" + side],
          f = r.byName["ankle" + side],
          at = new V().copy(a.joint.anchor1()).applyQuaternion(yaw).add(pelvis),
          target = r.feet[side].goal;
        const d = target.clone().sub(at).applyQuaternion(yaw.clone().invert()),
          l1 = a.off.length(),
          l2 = b.off.length(),
          len = Math.max(0.12, Math.min(l1 + l2 - 0.005, d.length()));
        d.normalize();
        const pole = new V(0, 0, -1).addScaledVector(d, d.z).normalize();
        const along = (l1 * l1 - l2 * l2 + len * len) / (2 * len),
          height = Math.sqrt(Math.max(0, l1 * l1 - along * along)),
          knee = d.clone().multiplyScalar(along).addScaledVector(pole, height),
          ankle = d.clone().multiplyScalar(len);
        const axis = new V().crossVectors(d, pole).normalize(),
          frame = (direction: any) => {
            const y = direction.clone().normalize().multiplyScalar(-1),
              z = new V().crossVectors(axis, y).normalize();
            return new Q().setFromRotationMatrix(
              new T.Matrix4().makeBasis(axis, y, z),
            );
          },
          qa = frame(knee),
          qb = frame(ankle.sub(knee));
        a.goal.copy(qa);
        b.goal.copy(qa.clone().invert().multiply(qb));
        f.goal.copy(qb.clone().invert());
      }
      const com = new V();
      for (const a of r.parts) {
        a.refQ = a.parent
          ? a.parent.refQ.clone().multiply(a.goal)
          : yaw.clone();
        a.refP = a.parent
          ? new V()
              .copy(a.joint.anchor1())
              .applyQuaternion(a.parent.refQ)
              .add(a.parent.refP)
          : pelvis.clone();
        com.addScaledVector(
          new V().copy(a.body.localCom()).applyQuaternion(a.refQ).add(a.refP),
          a.mass / r.mass,
        );
      }
      pelvis.x += (comGoal.x - com.x) * 1.1;
      pelvis.z += (comGoal.z - com.z) * 1.1;
    }
  }
  function recoverStep(r: any, h: number) {
    const T = root.THREE,
      V = T.Vector3,
      Q = T.Quaternion;
    r.recovery += h;
    const previous = new Map(r.parts.map((a: any) => [a, a.goal.clone()]));
    const feet: any[] = Object.values(r.feet),
      hip = r.byName.hips.body;
    if (!r.recoverPhase) r.recoverPhase = "tuck";
    const tilt = r.tilt,
      ground = feet.filter((f) => f.part.contact),
      footLoad = feet.reduce((sum, f) => sum + (f.part.filteredLoad || 0), 0),
      midSole = feet[0].part.currP
        .clone()
        .add(feet[1].part.currP)
        .multiplyScalar(0.5)
        .add(new V(0, 0, -0.055)),
      comOverFeet = r.com.clone().sub(midSole).setY(0).length() < 0.15;
    if (
      (r.recovery > 5.2 &&
        ground.length === 2 &&
        footLoad > r.mass * 9.81 * 0.6 &&
        comOverFeet &&
        tilt < (parameters().riseGate ?? 0.5) &&
        hip.translation().y >
          Math.min(...feet.map((f) => f.part.currP.y)) + 0.15) ||
      r.recoverPhase === "rise"
    ) {
      if (r.recoverPhase !== "rise") {
        r.recoverPhase = "rise";
        r.riseTime = 0;
        r.recoveryHeight = 0.48;
        r.pose = null;
        for (const f of feet) {
          f.anchor.copy(f.part.body.translation());
          const g = r.p.support(f.anchor.x, f.anchor.z, f.anchor.y + 0.3, 1);
          if (g && g.normal.y > 0.55) f.anchor.y = g.y + 0.075;
        }
      }
      r.riseTime += h;
      r.recoveryHeight = Math.min(
        r.standHeight,
        0.48 + Math.max(0, r.riseTime - 3) * 0.065,
      );
      for (const f of feet) {
        if (f.part.contact && tilt < 0.4 && r.riseTime > 3)
          f.anchor.copy(f.part.body.translation());
        f.goal.copy(f.anchor);
        f.swing = -1;
      }
      const target = feet[0].anchor
        .clone()
        .add(feet[1].anchor)
        .multiplyScalar(0.5)
        .add(new V(0, 0, -0.055));
      target.add(
        target
          .clone()
          .sub(r.com)
          .setY(0)
          .multiplyScalar(1)
          .addScaledVector(r.comVel.clone().setY(0), -0.5)
          .clampLength(0, 0.15),
      );
      reference(r, feet, target);
      for (const side of ["R", "L"])
        r.byName["shoulder" + side].goal.setFromEuler(
          new T.Euler(0, 0, (side === "R" ? -1 : 1) * 1.2),
        );
      r.byName.spine.goal.identity();
      r.byName.chest.goal.identity();
      const stable =
        ground.length === 2 &&
        footLoad > r.mass * 9.81 * 0.8 &&
        comOverFeet &&
        tilt < 0.2 &&
        hip.translation().y >
          Math.min(...feet.map((f) => f.part.currP.y)) + r.standHeight * 0.8 &&
        r.comVel.length() < 0.3;
      r.recoveredStable = stable ? (r.recoveredStable || 0) + h : 0;
      if (r.recoveredStable > 2 && r.recoveryHeight >= r.standHeight) {
        state(r, "standing");
        r.recoveryHeight = null;
        r.recoverPhase = null;
        r.gait = null;
        r.balanceGoal = null;
      }
    } else {
      // Internal articulation only: fold the legs and use the arms/torso to rock
      // the centre of mass over the soles. No transform writes or world forces.
      const u = Math.min(1, r.recovery / 1.2),
        blend = u * u * (3 - 2 * u),
        rock = Math.max(0, Math.min(1, (r.recovery - 1.2) / 1.8));
      const goal = (name: string, x: number, y: number, z: number) => {
        const a = r.byName[name],
          q = new Q().setFromEuler(new T.Euler(x, y, z));
        a.goal.copy(r.recoveryStart[name]).slerp(q, blend);
      };
      for (const side of ["R", "L"]) {
        const sign = side === "R" ? 1 : -1;
        const hipEnd = parameters().recoveryHip ?? 0.9,
          kneeEnd = parameters().recoveryKnee ?? -2.4;
        goal("hip" + side, 1.8 + rock * (hipEnd - 1.8), 0, sign * 0.05);
        goal("knee" + side, -2.6 + rock * (kneeEnd + 2.6), 0, 0);
        goal("ankle" + side, 0.8 + rock * (-hipEnd - kneeEnd - 0.8), 0, 0);
        goal("shoulder" + side, 0, sign * 0.9, -sign * 1.1);
        goal("elbow" + side, 0, sign * 0.25, 0);
        goal("wrist" + side, 0, 0, 0);
      }
      goal(
        "spine",
        -0.6 + rock * ((parameters().recoverySpine ?? -1.2) + 0.6),
        0,
        0,
      );
      goal("chest", -0.25 * (1 - rock), 0, 0);
      if (r.recovery > 3) r.recoverPhase = "rock";
    }
    for (const a of r.parts)
      if (a.parent && r.recoverPhase === "rise") {
        const prev: any = previous.get(a),
          angle = prev.angleTo(a.goal);
        a.goal.copy(
          prev.slerp(
            a.goal,
            Math.min(
              1,
              ((parameters().riseRate ?? 0.6) * h) / Math.max(1e-6, angle),
            ),
          ),
        );
      }
    if (r.recoverPhase === "rise" && parameters().recoveryFeedback) {
      const yaw = new Q().setFromAxisAngle(new V(0, 1, 0), r.goalYaw),
        err = yaw.clone().invert().multiply(new Q().copy(hip.rotation()));
      if (err.w < 0) err.set(-err.x, -err.y, -err.z, -err.w);
      const l = Math.hypot(err.x, err.y, err.z),
        v = l > 1e-6 ? (2 * Math.atan2(l, err.w)) / l : 0,
        w = new V().copy(hip.angvel()).applyQuaternion(yaw.clone().invert());
      const correction = new V(err.x * v, 0, err.z * v)
          .multiplyScalar(parameters().recoveryFeedback)
          .addScaledVector(w, 0.2)
          .clampLength(0, 0.6),
        q = new Q().setFromEuler(new T.Euler(correction.x, 0, correction.z));
      for (const f of ground) f.part.goal.multiply(q);
    }
    if (r.recovery > 24) {
      state(r, "fallen");
      r.recoverPhase = null;
      r.recoveryHeight = null;
      r.recoveryFailure = "physical support/upright gate not reached";
    }
  }
  export function beforeStep(p: any, h: number) {
    controls = root.BODY_PROBE ? { ...tuning, ...root.BODY_PROBE } : tuning;
    for (const [s, r] of all.get(p) || []) {
      if (s.dead || s.finished || s.char !== r.character) {
        detach(p, s);
        continue;
      }
      const T = root.THREE,
        V = T.Vector3,
        Q = T.Quaternion,
        hip = r.byName.hips,
        hipPos = new V().copy(hip.body.translation());
      r.time += h;
      r.stateTime += h;
      const turn = Math.atan2(
        Math.sin(r.targetYaw - r.goalYaw),
        Math.cos(r.targetYaw - r.goalYaw),
      );
      r.goalYaw += Math.max(-1.2 * h, Math.min(1.2 * h, turn));
      r.com.set(0, 0, 0);
      r.comVel.set(0, 0, 0);
      for (const a of r.parts) {
        a.prevP.copy(a.currP);
        a.prevQ.copy(a.currQ);
        a.body.resetForces(false);
        a.body.resetTorques(false);
        r.com.addScaledVector(a.body.worldCom(), a.mass / r.mass);
        r.comVel.addScaledVector(a.body.linvel(), a.mass / r.mass);
      }
      const feet: any[] = Object.values(r.feet),
        grounded = feet.filter((f) => f.part.contact && f.swing < 0);
      r.support = grounded.length;
      const up = new V(0, 1, 0).applyQuaternion(
        new Q().copy(hip.body.rotation()),
      );
      r.tilt = Math.acos(Math.max(-1, Math.min(1, up.y)));
      if (
        (r.tilt > 1.1 ||
          hipPos.y - Math.min(r.feet.R.part.currP.y, r.feet.L.part.currP.y) <
            0.3) &&
        r.state === "standing"
      )
        state(r, "falling");
      if (r.state === "falling" && r.stateTime > 0.4) state(r, "fallen");
      if (r.state === "recovering") {
        recoverStep(r, h);
        for (const a of r.parts) if (a.parent) drive(a, h, true, false);
        continue;
      }
      const active = r.state !== "fallen" && r.state !== "falling";
      for (const f of feet)
        if (f.part.contact && f.swing < 0)
          f.anchor.copy(f.part.body.translation());
      const sole = (f: any) =>
        new V(0, 0, -0.055)
          .applyQuaternion(new Q().copy(f.part.body.rotation()))
          .add(f.anchor);
      const mid = sole(feet[0]).add(sole(feet[1])).multiplyScalar(0.5);
      r.balanceGoal = r.balanceGoal || mid.clone();
      r.gait = r.gait || { mode: "idle", t: 0, side: "R" };
      const gait = r.gait;
      for (const f of feet) f.goal.copy(f.anchor);
      if (active && r.locomotion && parameters().capture) {
        const capture = r.com
            .clone()
            .addScaledVector(
              r.comVel,
              Math.sqrt(Math.max(0.3, r.com.y - mid.y) / 9.81),
            ),
          lo = new V(Infinity, 0, Infinity),
          hi = new V(-Infinity, 0, -Infinity);
        for (const f of grounded) {
          const c = sole(f);
          lo.x = Math.min(lo.x, c.x - 0.055);
          hi.x = Math.max(hi.x, c.x + 0.055);
          lo.z = Math.min(lo.z, c.z - 0.13);
          hi.z = Math.max(hi.z, c.z + 0.13);
        }
        const outside =
          grounded.length &&
          (capture.x < lo.x - 0.02 ||
            capture.x > hi.x + 0.02 ||
            capture.z < lo.z - 0.02 ||
            capture.z > hi.z + 0.02);
        if (outside && gait.mode !== "swing" && r.time > 1) {
          const drift = capture.clone().sub(mid),
            side =
              Math.abs(drift.z) > Math.abs(drift.x)
                ? r.feet.R.anchor.z > r.feet.L.anchor.z
                  ? "R"
                  : "L"
                : drift.x > 0
                  ? "R"
                  : "L",
            f = r.feet[side],
            stance = r.feet[side === "R" ? "L" : "R"];
          gait.mode = "swing";
          gait.side = side;
          gait.emergency = true;
          gait.t = 0;
          f.start.copy(f.part.body.translation());
          f.end
            .copy(capture)
            .add(new V((side === "R" ? 1 : -1) * 0.08, 0, 0.055));
          f.end.y = stance.anchor.y;
          f.swing = 0;
          r.steps++;
        }
      }
      if (
        active &&
        r.locomotion &&
        (r.wish.length() > 0.02 ||
          gait.mode === "swing" ||
          gait.mode === "land")
      ) {
        if (gait.mode === "idle") {
          gait.mode = "transfer";
          gait.t = 0;
          gait.start = r.balanceGoal.clone();
          gait.side = r.steps % 2 ? "L" : "R";
        }
        const f = r.feet[gait.side],
          stance = r.feet[gait.side === "R" ? "L" : "R"];
        const stanceCenter = sole(stance);
        gait.t += h;
        if (gait.mode === "transfer") {
          const u = Math.min(1, gait.t / (parameters().transfer ?? 0.7)),
            e = u * u * (3 - 2 * u);
          r.balanceGoal.copy(gait.start).lerp(stanceCenter, e);
          const totalLoad =
              (stance.part.filteredLoad || 0) + (f.part.filteredLoad || 0),
            ratio = (stance.part.filteredLoad || 0) / Math.max(1, totalLoad),
            capture = r.com
              .clone()
              .addScaledVector(
                r.comVel,
                Math.sqrt(Math.max(0.3, r.com.y - stanceCenter.y) / 9.81),
              )
              .sub(stanceCenter)
              .applyQuaternion(
                new Q().setFromAxisAngle(new V(0, 1, 0), -r.goalYaw),
              );
          const loadReady =
            stance.part.contact &&
            totalLoad > r.mass * 9.81 * 0.5 &&
            ratio > (parameters().loadRatio ?? 0.9) &&
            Math.abs(capture.x) < 0.05 &&
            Math.abs(capture.z) < 0.11;
          const oldReady =
            r.com.clone().sub(stanceCenter).setY(0).length() <
              (parameters().gate ?? 0.02) &&
            Math.hypot(r.comVel.x, r.comVel.z) <
              (parameters().gateVelocity ?? 0.1);
          if (u === 1 && (parameters().loadGate ? loadReady : oldReady)) {
            gait.mode = "swing";
            gait.t = 0;
            f.start.copy(f.part.body.translation());
            const step = r.wish
                .clone()
                .normalize()
                .multiplyScalar(parameters().stride ?? 0.28),
              width = Math.abs(r.byName.hipR.joint.anchor1().x) * 2,
              sg = gait.side === "R" ? 1 : -1;
            f.end
              .copy(stance.anchor)
              .add(step)
              .add(
                new V(sg * width, 0, 0).applyQuaternion(
                  new Q().setFromAxisAngle(new V(0, 1, 0), r.goalYaw),
                ),
              );
            f.swing = 0;
            r.steps++;
          }
        } else if (gait.mode === "swing") {
          r.balanceGoal.copy(stanceCenter);
          const u = Math.min(
              1,
              gait.t / (gait.emergency ? 0.3 : (parameters().swing ?? 0.6)),
            ),
            e = u * u * (3 - 2 * u);
          f.goal.copy(f.start).lerp(f.end, e);
          f.goal.y += Math.sin(Math.PI * u) * 0.09;
          f.swing = u;
          if (u === 1) {
            f.anchor.copy(f.end);
            f.swing = -1;
            gait.mode = "land";
            gait.t = 0;
          }
        } else if (gait.mode === "land") {
          if (f.part.contact && gait.t > 0.08) {
            const at = new V().copy(f.part.body.translation()),
              distance = at.clone().sub(f.start).setY(0).length(),
              error = at.clone().sub(f.end).setY(0).length(),
              expected = f.end.clone().sub(f.start).setY(0).length(),
              success =
                distance >= Math.max(0.025, expected * 0.5) && error < 0.12;
            r.completedSteps += success ? 1 : 0;
            r.missedSteps += success ? 0 : 1;
            r.stepResults = (r.stepResults || [])
              .concat({
                at: r.time,
                side: f.side,
                success,
                distance,
                error,
                expected,
              })
              .slice(-32);
            f.anchor.copy(at);
            gait.mode = "idle";
            gait.emergency = false;
          } else if (gait.t > 1) {
            r.missedSteps++;
            gait.mode = "idle";
            gait.emergency = false;
          }
        }
      } else if (active) {
        r.balanceGoal.lerp(mid, Math.min(1, h * 3));
        gait.mode = "idle";
        for (const f of feet) f.swing = -1;
      }
      const correction = r.balanceGoal
        .clone()
        .sub(r.com)
        .setY(0)
        .multiplyScalar(parameters().feedback ?? 0.2)
        .addScaledVector(
          r.comVel.clone().setY(0),
          -(parameters().velocity ?? 0.1),
        )
        .clampLength(0, parameters().maxCorrection ?? 0.25);
      if (active) reference(r, feet, r.balanceGoal.clone().add(correction));
      if (active) {
        const yaw = new Q().setFromAxisAngle(new V(0, 1, 0), r.goalYaw),
          err = yaw
            .clone()
            .invert()
            .multiply(new Q().copy(hip.body.rotation()));
        if (err.w < 0) err.set(-err.x, -err.y, -err.z, -err.w);
        const l = Math.hypot(err.x, err.y, err.z),
          v = l > 1e-6 ? (2 * Math.atan2(l, err.w)) / l : 0,
          w = new V()
            .copy(hip.body.angvel())
            .applyQuaternion(yaw.clone().invert());
        const c = new V(err.x * v, err.y * v, err.z * v)
            .multiplyScalar(parameters().ankleFeedback ?? 1)
            .addScaledVector(w, parameters().ankleD ?? 0.2)
            .clampLength(0, 0.18),
          q = new Q().setFromEuler(new T.Euler(c.x, c.y, c.z, "XYZ"));
        for (const f of grounded) f.part.goal.multiply(q);
      }
      for (const f of feet) f.part.swing = f.swing >= 0;
      // A standing posture is a ground-contact controller, not an aerial anchor.
      // Release muscle stiffness when both soles are unsupported: gravity must
      // remain the only external force on an airborne character.
      for (const a of r.parts)
        if (a.parent) drive(a, h, active && r.support > 0);
      if (active && grounded.length && parameters().yaw) {
        const forward = new V(0, 0, -1).applyQuaternion(
            new Q().copy(hip.body.rotation()),
          ),
          actual = Math.atan2(-forward.x, -forward.z),
          error = Math.atan2(
            Math.sin(actual - r.goalYaw),
            Math.cos(actual - r.goalYaw),
          );
        const torque = Math.max(
          -(parameters().steerMax ?? 30),
          Math.min(
            parameters().steerMax ?? 30,
            error * (parameters().steerK ?? 100) +
              hip.body.angvel().y * (parameters().steerD ?? 50),
          ),
        );
        for (const f of grounded)
          pairTorque(
            f.part.body,
            f.part.parent.body,
            new V(0, torque / grounded.length, 0),
          );
      }
    }
  }
  export function afterStep(p: any) {
    for (const r of all.get(p)?.values() || []) {
      for (const a of r.parts) {
        a.currP.copy(a.body.translation());
        a.currQ.copy(a.body.rotation());
        a.contact = false;
        a.normalImpulse = 0;
        if (!/^(ankle|knee|wrist|elbow)[RL]$/.test(a.name)) continue;
        a.groundPoint = null;
        p.sim.contactPairsWith(a.col, (other: any) => {
          if (other.isSensor() || (other.collisionGroups() >>> 16) & r.group)
            return;
          p.sim.contactPair(a.col, other, (m: any) => {
            if (Math.abs(m.normal().y) < 0.55) return;
            let supported = false;
            for (let i = 0; i < m.numSolverContacts(); i++) {
              const at = m.solverContactPoint(i);
              if (at.y < a.currP.y - 0.02 && m.solverContactDist(i) < 0.02) {
                supported = true;
                a.contact = true;
                a.groundPoint = { x: at.x, y: at.y, z: at.z };
                break;
              }
            }
            if (supported)
              for (let i = 0; i < m.numContacts(); i++)
                a.normalImpulse +=
                  Math.max(0, m.contactImpulse(i)) * Math.abs(m.normal().y);
          });
        });
      }
      for (const a of r.parts) {
        a.normalForce = a.normalImpulse * 60;
        a.filteredLoad = (a.filteredLoad || 0) * 0.8 + a.normalForce * 0.2;
      }
      r.contactSummary = {
        feet: ["ankleR", "ankleL"].filter((n) => r.byName[n].contact).length,
        hands: ["wristR", "wristL"].filter((n) => r.byName[n].contact).length,
        knees: ["kneeR", "kneeL"].filter((n) => r.byName[n].contact).length,
        forearms: ["elbowR", "elbowL"].filter((n) => r.byName[n].contact)
          .length,
      };
      sync(r);
    }
  }
  export function captureAndApply(s: any, capture: boolean = true) {
    const r = get(s);
    if (!r) return;
    const T = root.THREE;
    for (const a of r.parts)
      if (capture && a.parent && !/^(hip|knee|ankle)[RL]$/.test(a.name)) {
        const pq = a.parent.bone.getWorldQuaternion(new T.Quaternion());
        a.goal.copy(
          pq.invert().multiply(a.bone.getWorldQuaternion(new T.Quaternion())),
        );
      }
    const hip = r.byName.hips,
      at = hip.prevP.clone().lerp(hip.currP, r.p.alpha);
    s.char.root.position.copy(at).add(new T.Vector3(0, -r.hipHeight, 0));
    s.char.root.quaternion.identity();
    s.char.root.updateMatrixWorld(true);
    for (const a of r.parts) {
      if (!a.parent) a.bone.position.set(0, r.hipHeight, 0);
      const q = a.prevQ.clone().slerp(a.currQ, r.p.alpha);
      a.bone.quaternion.copy(
        a.bone.parent
          .getWorldQuaternion(new T.Quaternion())
          .invert()
          .multiply(q),
      );
      a.bone.updateWorldMatrix(false, false);
    }
    s.char.root.updateMatrixWorld(true);
  }
  export function setLocomotion(s: any, enabled: boolean) {
    const r = get(s);
    if (!r) return false;
    r.locomotion = !!enabled;
    if (!enabled) {
      r.wish.set(0, 0, 0);
      r.prep = null;
    }
    return true;
  }
  export function recover(s: any) {
    const r = get(s);
    if (!r || r.state !== "fallen") return false;
    state(r, "recovering");
    r.recovery = 0;
    r.recoveredStable = 0;
    r.recoverPhase = null;
    r.recoveryFailure = null;
    r.recoveryHeight = null;
    r.wish.set(0, 0, 0);
    r.locomotion = false;
    r.recoveryStart = {};
    for (const a of r.parts)
      if (a.parent)
        r.recoveryStart[a.name] = new root.THREE.Quaternion()
          .copy(a.parent.body.rotation())
          .invert()
          .multiply(new root.THREE.Quaternion().copy(a.body.rotation()));
    for (const f of Object.values(r.feet) as any[]) {
      f.anchor.copy(f.part.body.translation());
      f.swing = -1;
    }
    return true;
  }
  export function release(s: any) {
    const r = get(s);
    if (!r) return false;
    state(r, "fallen");
    r.wish.set(0, 0, 0);
    r.prep = null;
    return true;
  }
  export function impulse(s: any, impulse: any, point?: any) {
    const r = get(s);
    if (!r) return false;
    if (
      !impulse ||
      !["x", "y", "z"].every((k) => Number.isFinite(impulse[k])) ||
      (point && !["x", "y", "z"].every((k) => Number.isFinite(point[k])))
    )
      throw new RangeError("Impulse and point must be finite");
    const b = r.byName.chest.body;
    if (point) b.applyImpulseAtPoint(impulse, point, true);
    else b.applyImpulse(impulse, true);
    return true;
  }
  export function stats(p: any) {
    return Array.from(all.get(p)?.values() || []).map((r: any) => ({
      key: r.s.key,
      rigMode: r.rigMode,
      multibodyLinks: r.parts.filter((a: any) => a.link?.isValid()).length,
      state: r.state,
      parts: r.parts.length,
      dynamic: r.parts.every((a: any) => a.body.isDynamic()),
      mass: r.mass,
      support: r.support,
      tilt: r.tilt,
      steps: r.steps,
      contacts: r.contactSummary || null,
      selfCollision: true,
      completedSteps: r.completedSteps,
      missedSteps: r.missedSteps,
      recoveryPhase: r.recoverPhase || null,
      recoveryFailure: r.recoveryFailure || null,
      locomotion: r.locomotion,
      autoRecover: r.autoRecover,
      transitions: r.transitions || [],
    }));
  }
}
(globalThis as any).GActiveBody = AegisActiveBody;
