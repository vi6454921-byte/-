"use strict";
/** Budgeted, joint-coupled living skeleton. Kinematic pelvis is controlled by KCC;
 * dynamic segments collide with scenery, follow torque targets and feed skinning.
 * This is an animation-assisted contact rig, NOT an autonomous balance controller. */
var AegisContacts;
(function (AegisContacts) {
    const root = globalThis, R = root.RAPIER;
    const sessions = new WeakMap();
    const indexes = new WeakMap();
    AegisContacts.config = {
        enabled: true,
        maxRigs: 3,
        autoUnarmed: true,
        autoArmed: true,
        projectArms: true,
    };
    const zero = () => ({ x: 0, y: 0, z: 0 });
    const entries = (p) => {
        let m = sessions.get(p);
        if (!m) {
            m = new Map();
            sessions.set(p, m);
        }
        return m;
    };
    const names = [
        "hips",
        "spine",
        "chest",
        "neck",
        "head",
        "clavR",
        "shoulderR",
        "elbowR",
        "clavL",
        "shoulderL",
        "elbowL",
        "hipR",
        "kneeR",
        "ankleR",
        "hipL",
        "kneeL",
        "ankleL",
    ];
    const ends = {
        hips: "spine",
        spine: "chest",
        chest: "neck",
        neck: "head",
        head: null,
        clavR: "shoulderR",
        shoulderR: "elbowR",
        elbowR: "wristR",
        clavL: "shoulderL",
        shoulderL: "elbowL",
        elbowL: "wristL",
        hipR: "kneeR",
        kneeR: "ankleR",
        ankleR: "toeR",
        hipL: "kneeL",
        kneeL: "ankleL",
        ankleL: "toeL",
    };
    function has(s) {
        const p = s.ctrl?._physicsWorld && root.GPhysics.get(s.ctrl._physicsWorld);
        return !!(p && sessions.get(p)?.has(s));
    }
    AegisContacts.has = has;
    function drop(p, s) {
        const m = sessions.get(p), rig = m?.get(s);
        if (!rig)
            return;
        for (const b of rig.parts)
            p.sim.removeRigidBody(b.body);
        m.delete(s);
        s.contactDebug = null;
    }
    AegisContacts.drop = drop;
    function create(p, s) {
        const T = root.THREE, parts = [], byBone = new Map();
        s.char.root.updateMatrixWorld(true);
        const vault = !!s.ctrl.vault;
        for (const name of vault
            ? ["clavR", "shoulderR", "elbowR", "clavL", "shoulderL", "elbowL"]
            : names) {
            const bone = s.char.bone(name);
            if (!bone)
                continue;
            const pos = bone.getWorldPosition(new T.Vector3()), q = bone.getWorldQuaternion(new T.Quaternion()), kin = name === "hips" || (vault && name.startsWith("clav"));
            const mass = /^(chest|hips)$/.test(name)
                ? 12
                : /^(hip|knee)/.test(name)
                    ? 4
                    : 1.5;
            const inertia = mass * 0.025;
            const desc = (kin
                ? R.RigidBodyDesc.kinematicPositionBased()
                : R.RigidBodyDesc.dynamic())
                .setTranslation(pos.x, pos.y, pos.z)
                .setRotation(q)
                .setGravityScale(0)
                .setLinearDamping(3)
                .setAngularDamping(2)
                .setCcdEnabled(true)
                .setCanSleep(true)
                .setAdditionalMassProperties(mass, zero(), { x: inertia, y: inertia, z: inertia }, { x: 0, y: 0, z: 0, w: 1 });
            const body = p.sim.createRigidBody(desc);
            const endBone = s.char.bone(ends[name]), offset = endBone
                ? endBone
                    .getWorldPosition(new T.Vector3())
                    .sub(pos)
                    .applyQuaternion(q.clone().invert())
                : new T.Vector3(0, 0.1, 0);
            let col = null;
            if (name !== "hips" && !name.startsWith("clav") && name !== "neck") {
                const radius = name === "chest"
                    ? 0.105
                    : name === "spine"
                        ? 0.085
                        : name === "head"
                            ? 0.095
                            : name.startsWith("hip")
                                ? 0.065
                                : 0.035;
                const len = offset.length(), mid = offset.clone().multiplyScalar(0.5);
                const shape = name === "head"
                    ? R.ColliderDesc.ball(radius)
                    : R.ColliderDesc.capsule(Math.max(0.004, len * 0.5 - radius), radius);
                shape.setTranslation(mid.x, mid.y, mid.z);
                if (len > 0.001)
                    shape.setRotation(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), offset.clone().normalize()));
                col = p.sim.createCollider(shape
                    .setDensity(0)
                    .setFriction(0.5)
                    .setRestitution(0)
                    .setCollisionGroups(0x00100001), body);
            }
            let parent = bone.parent;
            while (parent && !byBone.has(parent))
                parent = parent.parent;
            const pa = byBone.get(parent);
            let joint = null;
            if (pa) {
                const anchor = pos
                    .clone()
                    .sub(pa.targetP)
                    .applyQuaternion(pa.targetQ.clone().invert());
                joint = p.sim.createImpulseJoint(R.JointData.spherical(anchor, zero()), pa.body, body, true);
                joint.setContactsEnabled(false);
            }
            const part = {
                name,
                bone,
                body,
                col,
                kin,
                joint,
                parent: pa,
                mass,
                inertia,
                offset,
                targetP: pos.clone(),
                targetQ: q.clone(),
                prevQ: q.clone(),
                currQ: q.clone(),
                prevP: pos.clone(),
                currP: pos.clone(),
                targetV: new T.Vector3(),
            };
            parts.push(part);
            byBone.set(bone, part);
        }
        const rig = {
            char: s.char,
            vault,
            parts,
            root: s.ctrl.pos.clone(),
            last: p.steps,
            contacts: 0,
            peak: 0,
        };
        entries(p).set(s, rig);
        p.dropPose(s);
        return rig;
    }
    function nearScenery(p, s) {
        const at = s.ctrl.pos;
        let index = indexes.get(p);
        const source = p.world.colliders || [];
        if (!index || index.length !== source.length) {
            const bins = new Map(), large = [];
            for (const c of source) {
                const x0 = c.type === "box" ? c.x0 : c.x - (c.r || 0), x1 = c.type === "box" ? c.x1 : c.x + (c.r || 0), z0 = c.type === "box" ? c.z0 : c.z - (c.r || 0), z1 = c.type === "box" ? c.z1 : c.z + (c.r || 0), a = Math.floor(x0 / 3), b = Math.floor(x1 / 3), d = Math.floor(z0 / 3), e = Math.floor(z1 / 3);
                if (![a, b, d, e].every(Number.isFinite))
                    continue;
                if ((b - a + 1) * (e - d + 1) > 400) {
                    large.push(c);
                    continue;
                }
                for (let x = a; x <= b; x++)
                    for (let z = d; z <= e; z++) {
                        const key = x + ":" + z;
                        if (!bins.has(key))
                            bins.set(key, []);
                        bins.get(key).push(c);
                    }
            }
            index = { length: source.length, bins, large };
            indexes.set(p, index);
        }
        const candidates = new Set(index.large);
        for (let x = Math.floor((at.x - 1.05) / 3); x <= Math.floor((at.x + 1.05) / 3); x++)
            for (let z = Math.floor((at.z - 1.05) / 3); z <= Math.floor((at.z + 1.05) / 3); z++)
                for (const c of index.bins.get(x + ":" + z) || [])
                    candidates.add(c);
        for (const c of candidates) {
            if (c.source?.dead)
                continue;
            const top = c._top ?? p.world.heightAt(at.x, at.z) + (c.h || 2);
            if (top < at.y + 0.4 || (c.y0 ?? -Infinity) > at.y + 1.9)
                continue;
            const dx = c.type === "box"
                ? Math.max(c.x0 - at.x, 0, at.x - c.x1)
                : Math.max(0, Math.abs(c.x - at.x) - (c.r || 0));
            const dz = c.type === "box"
                ? Math.max(c.z0 - at.z, 0, at.z - c.z1)
                : Math.max(0, Math.abs(c.z - at.z) - (c.r || 0));
            if (dx * dx + dz * dz < 1.05 * 1.05)
                return true;
        }
        return false;
    }
    function avoidArms(p, s) {
        const T = root.THREE;
        if (!root.GRig?.twoBoneIK)
            return;
        s.char.root.updateMatrixWorld(true);
        for (const side of ["R", "L"]) {
            const shoulder = s.char.bone("shoulder" + side), elbow = s.char.bone("elbow" + side), wrist = s.char.bone("wrist" + side);
            if (!shoulder || !elbow || !wrist)
                continue;
            const a = shoulder.getWorldPosition(new T.Vector3()), target = wrist.getWorldPosition(new T.Vector3()), d = target.clone().sub(a), length = d.length();
            if (length < 0.01)
                continue;
            d.multiplyScalar(1 / length);
            const hit = p.sim.castShape(a, { x: 0, y: 0, z: 0, w: 1 }, d, new R.Ball(0.045), 0.008, length, true, R.QueryFilterFlags.EXCLUDE_SENSORS, 0x00100001);
            if (!hit || hit.time_of_impact >= length - 0.01)
                continue;
            target
                .copy(a)
                .addScaledVector(d, Math.max(0.08, hit.time_of_impact - 0.025));
            const pole = s.char.root.localToWorld(new T.Vector3(side === "R" ? 0.55 : -0.55, 0.8, 0.45));
            root.GRig.twoBoneIK(T, {
                root: shoulder,
                mid: elbow,
                tip: wrist,
                target,
                pole,
                axis: elbow.position.clone().normalize(),
            });
            s.char.root.updateMatrixWorld(true);
        }
    }
    function update(s, dt, visible = true) {
        if (s.ctrl?._activeBody)
            return false;
        const p = root.GPhysics.get(s.ctrl._physicsWorld), all = entries(p);
        // Medical hands and ordinary firearm grips retain exact analytic constraints.
        // Full-contact mode can be explicitly requested in the development lab.
        const wanted = AegisContacts.config.enabled &&
            visible &&
            !s.dead &&
            !s.finished &&
            !s._tacHands &&
            !s.ctrl.treating &&
            !s.ctrl.dragging &&
            (s.contactMode === "full" ||
                s.ctrl.vault ||
                (((AegisContacts.config.autoUnarmed && !s.gun) || (AegisContacts.config.autoArmed && s.gun)) &&
                    nearScenery(p, s)));
        if (!wanted) {
            drop(p, s);
            return;
        }
        if (AegisContacts.config.projectArms)
            avoidArms(p, s);
        let rig = all.get(s);
        if (rig &&
            (rig.char !== s.char ||
                rig.vault !== !!s.ctrl.vault ||
                rig.root.distanceTo(s.ctrl.pos) > 1.5)) {
            drop(p, s);
            rig = null;
        }
        if (!rig && all.size >= AegisContacts.config.maxRigs && !s.ctrl.vault)
            return;
        if (!rig && all.size >= AegisContacts.config.maxRigs) {
            const old = Array.from(all.keys()).find((q) => !q.ctrl.vault);
            if (old)
                drop(p, old);
            else
                return;
        }
        if (!rig)
            rig = create(p, s);
        rig.last = p.steps;
        rig.root.copy(s.ctrl.pos);
        const T = root.THREE, inverse = new T.Quaternion();
        s.char.root.updateMatrixWorld(true);
        // Capture ALL animation goals first, before the skinning feedback modifies parents.
        for (const a of rig.parts) {
            const desired = a.bone.getWorldPosition(new T.Vector3());
            a.targetV
                .copy(desired)
                .sub(a.targetP)
                .divideScalar(Math.max(dt, 1 / 120))
                .clampLength(0, 6);
            a.targetP.copy(desired);
            a.bone.getWorldQuaternion(a.targetQ);
        }
        let maxError = 0;
        for (const a of rig.parts) {
            if (a.kin)
                continue;
            const q = a.prevQ.clone().slerp(a.currQ, p.alpha), err = q.angleTo(a.targetQ);
            maxError = Math.max(maxError, err);
            // No translational bone edits: bind lengths are invariant even under contact.
            // World-space torque tracking is bounded to avoid folded limbs after a teleport.
            if (err < 0.9) {
                a.bone.parent.getWorldQuaternion(inverse).invert();
                a.bone.quaternion.copy(inverse.multiply(q));
                a.bone.updateMatrixWorld(true);
            }
        }
        s.contactDebug = {
            parts: rig.parts.length,
            contacts: rig.contacts,
            maxAngle: maxError,
            peakImpulse: rig.peak,
        };
    }
    AegisContacts.update = update;
    function beforeStep(p, h) {
        const all = sessions.get(p);
        if (!all)
            return;
        const T = root.THREE, e = new T.Quaternion(), inv = new T.Quaternion();
        for (const [s, rig] of all) {
            if (s.dead ||
                s.finished ||
                rig.char !== s.char ||
                p.steps - rig.last > 12) {
                drop(p, s);
                continue;
            }
            rig.contacts = 0;
            rig.peak = 0;
            for (const a of rig.parts) {
                a.prevQ.copy(a.currQ);
                a.prevP.copy(a.currP);
                if (a.kin) {
                    a.body.setNextKinematicTranslation(a.targetP);
                    a.body.setNextKinematicRotation(a.targetQ);
                    continue;
                }
                e.copy(a.targetQ).multiply(inv.copy(a.currQ).invert());
                if (e.w < 0)
                    e.set(-e.x, -e.y, -e.z, -e.w);
                const len = Math.hypot(e.x, e.y, e.z), scale = len > 1e-7 ? (2 * Math.atan2(len, Math.max(0, e.w))) / len : 0;
                const w = a.body.angvel(), k = a.inertia * (rig.vault ? 500 : scale * len > 0.8 ? 360 : 180), d = a.inertia * (rig.vault ? 44 : 25);
                const torque = new T.Vector3(e.x * scale * k - w.x * d, e.y * scale * k - w.y * d, e.z * scale * k - w.z * d).clampLength(0, 35);
                a.body.resetTorques(false);
                a.body.addTorque(torque, true);
                // Low-gain distributed position springs damp joint drift, not a teleport.
                const pos = a.body.translation(), vel = a.body.linvel(), force = new T.Vector3((a.targetP.x - pos.x) * 35 * a.mass +
                    (a.targetV.x - vel.x) * 3 * a.mass, (a.targetP.y - pos.y) * 35 * a.mass +
                    (a.targetV.y - vel.y) * 3 * a.mass, (a.targetP.z - pos.z) * 35 * a.mass +
                    (a.targetV.z - vel.z) * 3 * a.mass).clampLength(0, 150);
                a.body.resetForces(false);
                a.body.addForce(force, true);
                const side = a.name.startsWith("elbow") ? a.name.slice(-1) : null;
                const grip = side && s.ctrl._vaultHands?.[side];
                if (grip) {
                    const at = a.offset.clone().applyQuaternion(a.currQ).add(a.currP), pv = a.body.velocityAtPoint(at);
                    const pull = new T.Vector3((grip.x - at.x) * 500 - pv.x * 35, (grip.y - at.y) * 500 - pv.y * 35, (grip.z - at.z) * 500 - pv.z * 35)
                        .clampLength(0, 180)
                        .multiplyScalar(h);
                    a.body.applyImpulseAtPoint(pull, at, true);
                }
            }
        }
    }
    AegisContacts.beforeStep = beforeStep;
    function afterStep(p) {
        for (const rig of sessions.get(p)?.values() || [])
            for (const a of rig.parts) {
                a.currP.copy(a.body.translation());
                a.currQ.copy(a.body.rotation());
                if (a.col)
                    p.sim.contactPairsWith(a.col, (other) => {
                        p.sim.contactPair(a.col, other, (m) => {
                            if (m.numSolverContacts() > 0) {
                                rig.contacts++;
                                for (let i = 0; i < m.numContacts(); i++)
                                    rig.peak = Math.max(rig.peak, m.contactImpulse(i));
                            }
                        });
                    });
            }
    }
    AegisContacts.afterStep = afterStep;
    function stats(p) {
        const rigs = sessions.get(p);
        return {
            rigs: rigs?.size || 0,
            segments: Array.from(rigs?.values() || []).reduce((n, r) => n + r.parts.length, 0),
        };
    }
    AegisContacts.stats = stats;
})(AegisContacts || (AegisContacts = {}));
globalThis.GContacts = AegisContacts;
