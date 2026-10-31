"use strict";
/** Contact-driven balance reactions for the normal KCC/IK game.
 * Stagger is controlled animation + collision-resolved movement; a lost balance
 * transfers to the same dynamic Rapier ragdoll as casualties, without killing or
 * healing the actor. Get-up is a clearance-gated pose blend, NOT an active-body
 * self-balancing controller. */
var AegisStumble;
(function (AegisStumble) {
    const root = globalThis;
    const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
    const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
    const totals = { triggered: 0, caught: 0, falls: 0, recovered: 0, blocked: 0, vaults: 0, rescued: 0 };
    function event(b, name) {
        b.events.push({ name, time: b.clock });
        if (b.events.length > 24)
            b.events.shift();
    }
    function balance(s) {
        let b = s._balance;
        if (!b) {
            b = s._balance = { state: "stable", clock: 0, age: 0, cooldown: 0,
                strength: 0, load: 0, leanX: 0, leanZ: 0, vx: 0, vz: 0,
                dir: new root.THREE.Vector3(0, 0, -1), kick: new root.THREE.Vector3(),
                down: false, recovering: false, events: [], stableTime: 0 };
        }
        s.ctrl._soldier = s;
        s.ctrl.balance = b;
        return b;
    }
    function trigger(s, direction, severity = 0.4, opt = {}) {
        if (!s?.ctrl || !s?.char || s.dead || s.finished || s.ctrl._activeBody || s.ctrl.vault || s.ctrl.mounted || s.ctrl.ladder)
            return false;
        if (![direction?.x, direction?.z, severity].every(Number.isFinite) || severity <= 0)
            return false;
        const b = balance(s), c = s.ctrl;
        if (b.down || b.recovering || (b.cooldown > 0 && !opt.force && !opt.hit))
            return false;
        const dir = new root.THREE.Vector3(direction.x, 0, direction.z);
        if (dir.lengthSq() < 1e-8)
            dir.set(-Math.sin(c.yaw || 0), 0, -Math.cos(c.yaw || 0));
        dir.normalize();
        const vulnerability = 1 + clamp(c.limp || 0) * 0.25 + (c.exhausted ? 0.12 : 0), k = clamp(severity * vulnerability, 0.08, 2);
        b.load = Math.min(2, b.load + k * (opt.hit ? 0.8 : 1));
        b.strength = Math.max(b.strength, Math.min(1, k));
        b.dir.copy(dir);
        b.age = 0;
        b.cooldown = 0.65;
        b.reason = opt.reason || "external";
        b.state = "stagger";
        b.kick.addScaledVector(dir, Math.min(1.15, k * 0.8)).clampLength(0, 1.8);
        b.fallWanted = opt.fall === true || b.load > 1.2 || k >= 1.18;
        if (opt.noFall) {
            b.fallWanted = false;
            b.load = Math.min(b.load, 0.6);
        }
        if (c.prone > 0.65) {
            b.fallWanted = false;
            b.strength *= 0.3;
        }
        totals.triggered++;
        event(b, b.reason);
        return true;
    }
    AegisStumble.trigger = trigger;
    function impulse(s, impulse, at) {
        if (![impulse?.x, impulse?.y, impulse?.z].every(Number.isFinite))
            return false;
        if (s.rd && s.ctrl?._physicsWorld)
            return root.GPhysics.get(s.ctrl._physicsWorld).ragdollImpulse(s, impulse, at || s.char.bone("chest").getWorldPosition(new root.THREE.Vector3()));
        return trigger(s, impulse, Math.hypot(impulse.x, impulse.y, impulse.z) / 65, { force: true, reason: "impulse" });
    }
    AegisStumble.impulse = impulse;
    function hit(s, direction, zone, damage) {
        const leg = /^(thigh|shin|foot)$/.test(zone), k = leg ? 0.34 + clamp(damage / 60) * 0.38 + clamp((s.ctrl.speed || 0) / 5) * 0.15
            : zone === "plate" ? 0.20 : zone === "helmet" ? 0.28 : 0.16 + clamp(damage / 90) * 0.2;
        return trigger(s, direction, k, { hit: true, reason: leg ? "leg-hit" : "hit" });
    }
    AegisStumble.hit = hit;
    /* v20: a bot that runs into a low obstacle (sandbags, crates, fences up to
       PHYS.vaultMax) climbs over it with the same collision-verified traversal
       (step-over / speed vault / mantle mocap) the player uses on Space,
       instead of tripping and falling. Attempts are throttled per actor. */
    function tryAutoVault(s, c, m) {
        const world = c._physicsWorld, phys = c.PHYS;
        if (!world || !phys || !root.GTraversal?.tryStart)
            return false;
        const now = (root.performance?.now?.() ?? Date.now()) / 1000;
        if (now < (c._autoVaultT || 0))
            return false;
        c._autoVaultT = now + 0.35;
        const L = Math.hypot(m.wantedX, m.wantedZ);
        if (!(L > 1e-3))
            return false;
        const dx = m.wantedX / L, dz = m.wantedZ / L, g = s.battle?.goal;
        if (g && Number.isFinite(g.x)) {
            // Never hop over the cover the bot was sent to: the destination must
            // lie beyond the obstacle, along the blocked direction.
            const gx = g.x - c.pos.x, gz = g.z - c.pos.z, gd = Math.hypot(gx, gz);
            if (gd < 1.8 || (gx * dx + gz * dz) / gd < 0.25)
                return false;
        }
        const ok = root.GTraversal.tryStart(c, world, phys, { x: dx, z: dz, npc: true });
        if (ok) {
            totals.vaults++;
            if (s._balance)
                event(s._balance, "auto-vault");
        }
        return ok;
    }
    function motion(c, m) {
        const s = c._soldier;
        if (!s || s.dead || c._balanceBusy || c.vault || c.ladder || c.prone > 0.5)
            return;
        const intended = Math.hypot(m.wantedX, m.wantedZ), actual = Math.hypot(m.actualX, m.actualZ), b = s._balance;
        // Blocked bots look for a vault even while a previous stagger cools down.
        const blocked = m.was && c.grounded && intended > 0.9 && actual < intended * 0.5;
        if (blocked && !s.active) {
            let wall = false;
            for (let i = 0; i < m.kcc.numComputedCollisions(); i++) {
                const hit = m.kcc.computedCollision(i);
                if (hit && Math.abs(hit.normal1?.y ?? 1) <= 0.65) {
                    wall = true;
                    break;
                }
            }
            if (wall && tryAutoVault(s, c, m))
                return;
        }
        if (b && b.cooldown > 0)
            return;
        if (!m.was && c.grounded && Math.abs(m.vy) > 4.8) {
            trigger(s, { x: m.wantedX || -Math.sin(c.yaw), z: m.wantedZ || -Math.cos(c.yaw) }, clamp((Math.abs(m.vy) - 4.5) / 5, 0.22, 1.6), { reason: "hard-landing" });
        }
        else if (blocked && intended > 3.0) {
            let low = false, wall = false;
            for (let i = 0; i < m.kcc.numComputedCollisions(); i++) {
                const hit = m.kcc.computedCollision(i);
                if (!hit || Math.abs(hit.normal1?.y ?? 1) > 0.65)
                    continue;
                wall = true;
                const shape = hit.collider?.shape, center = hit.collider?.translation(), halfHeight = shape?.halfExtents?.y ?? shape?.halfHeight;
                // A contact near the capsule's lower end is not by itself a trip:
                // tall walls also have low witness points. Check obstacle height.
                if (center && Number.isFinite(halfHeight)) {
                    const top = center.y + halfHeight;
                    if (top > c.pos.y + 0.12 && top < c.pos.y + 0.72)
                        low = true;
                }
            }
            // v20: running into cover is a brief catch-step, never a ragdoll fall
            // (bots piled up at the sandbag horseshoes of the respawns; the player
            // lost the view model in third-person fall camera). Plain walls do not
            // stagger at all; a low obstacle gives a light stumble.
            if (wall && low)
                trigger(s, { x: m.wantedX, z: m.wantedZ }, Math.min(0.42, 0.22 + (intended - 3) * 0.12), { reason: "trip-obstacle", noFall: true });
        }
    }
    AegisStumble.motion = motion;
    function motor(c, dt) {
        const b = c.balance;
        if (!b || b.down || b.recovering || b.state === "stable")
            return;
        c.vel.add(b.kick);
        b.kick.multiplyScalar(Math.exp(-dt * 5));
        c.ads = Math.max(0, (c.ads || 0) - dt * (1.0 + b.strength));
        c.sprint = Math.max(0, (c.sprint || 0) - dt * 4);
        // A compensating foot cycle is allowed even when a wall prevents movement.
        c.stepPhase += dt * 0.8 * b.strength;
    }
    AegisStumble.motor = motor;
    function snapshot(s) {
        const nodes = [];
        s.char.root.traverse((o) => { if (o.isBone)
            nodes.push({ bone: o, p: o.position.clone(), q: o.quaternion.clone() }); });
        return { nodes, rootP: s.char.root.position.clone(), rootQ: s.char.root.quaternion.clone(),
            gunP: s.gun?.root.position.clone(), gunQ: s.gun?.root.quaternion.clone() };
    }
    // v23: broken legs / paralysis — no get-up clip. The actor stays where the
    // ragdoll came to rest and continues lying on the back (head at the old
    // position, legs along the body), then crawls/rolls. The ragdoll pose is
    // blended into the supine pose by settlePose().
    function settleSupine(s, b, c, p, spot) {
        const T = root.THREE, ch = s.char;
        const hip = ch.bone("hips").getWorldPosition(new T.Vector3()), head = (ch.bone("head") || ch.bone("chest")).getWorldPosition(new T.Vector3());
        let fx = hip.x - head.x, fz = hip.z - head.z;
        const fl = Math.hypot(fx, fz);
        if (fl > 0.15) {
            fx /= fl;
            fz /= fl;
            c.yaw = Math.atan2(-fx, -fz);
        }
        else {
            fx = -Math.sin(c.yaw);
            fz = -Math.cos(c.yaw);
        }
        // supine pose: head at the controller point, hips 0.42 m forward
        let at = new T.Vector3(spot.x - fx * 0.42, spot.y, spot.z - fz * 0.42);
        const g = p.support(at.x, at.z, spot.y + 0.5, 1.2);
        if (g && Math.abs(g.y - spot.y) < 0.4 && p.canOccupy(s, { x: at.x, y: g.y + 0.025, z: at.z }, 0.6))
            at.y = g.y + 0.025;
        else
            at = new T.Vector3(spot.x, spot.y, spot.z);
        b.settle = { snap: snapshot(s), t: 0, dur: 1.15 };
        c._facingTarget = c.yaw;
        c._facingVelocity = 0;
        s.idleYaw = c.yaw;
        b.contacts12 = {};
        c._jump12 = null;
        b.down = false;
        b.recovering = false;
        b.state = "stable";
        b.age = 0;
        b.blocked = false;
        b.strength = b.load = 0;
        b.leanX = b.leanZ = b.vx = b.vz = 0;
        b.cooldown = 1.2;
        b.start = null;
        c.pos.copy(at);
        c.vel.set(0, 0, 0);
        c._motorVX = c._motorVZ = 0;
        c.crouch = 1;
        c.prone = 1;
        c.proneWant = true;
        c.crouchWant = true;
        c.grounded = true;
        c.rollDir = 0;
        c._rollEnd = null;
        c.rollPh = 0;
        c._stumbleDown = c._balanceBusy = false;
        p.dropRagdoll(s);
        s.rd = null;
        s.motion = null;
        s._posed = false;
        s._fallVelocity = null;
        s._fallRoot = null;
        totals.recovered++;
        event(b, "legs-out-supine");
    }
    function settlePose(s, dt) {
        const b = s._balance, st = b?.settle;
        if (!st)
            return;
        st.t += dt;
        if (st.t >= st.dur || b.down || b.recovering || s.dead) {
            b.settle = null;
            return;
        }
        const a = smooth(st.t / st.dur), start = st.snap, ch = s.char;
        ch.root.position.lerpVectors(start.rootP, ch.root.position, a);
        ch.root.quaternion.slerpQuaternions(start.rootQ, ch.root.quaternion, a);
        for (const n of start.nodes) {
            n.bone.position.lerpVectors(n.p, n.bone.position, a);
            n.bone.quaternion.slerpQuaternions(n.q, n.bone.quaternion, a);
        }
        ch.root.updateMatrixWorld(true);
    }
    AegisStumble.settlePose = settlePose;
    function update(s, dt, damage) {
        const b = s._balance;
        if (!b) {
            if (s.ctrl)
                s.ctrl._soldier = s;
            return;
        }
        const c = s.ctrl;
        b.clock += dt;
        b.age += dt;
        b.cooldown = Math.max(0, b.cooldown - dt);
        if (s.dead || s.finished) {
            b.down = b.recovering = false;
            b.state = "stable";
            c._balanceBusy = c._stumbleDown = false;
            b.strength = 0;
            return; // A fatal hit keeps the replacement casualty ragdoll and wounds.
        }
        if (b.down) {
            const p = root.GPhysics.get(c._physicsWorld), r = p.ragdolls.get(s);
            if (!r || !s.rd)
                return;
            const pelvis = r.groups.find((g) => g.name === "pelvis");
            if (pelvis) {
                c.pos.x = pelvis.curr.x;
                c.pos.z = pelvis.curr.z;
                const ground = p.support(c.pos.x, c.pos.z, pelvis.curr.y + 0.5, 2);
                c.pos.y = ground ? ground.y + 0.025 : pelvis.curr.y;
            }
            // v23: legs out (fracture, paralysis) no longer pins the actor in the
            // ragdoll forever: once the body has settled it lies on its back where
            // it came to rest (supine, torso raised, 20_player.js P.supine).
            if (s.unconscious || s.dmg?.ph?.unc || s.dmg?.ph?.dead || b.age < (c.legDown ? 1.6 : 1.15))
                return;
            // v20: a crowded spot (other bodies, sandbags) must not pin the actor
            // to the ground forever: after 2.5 s search a wider ring, after 9 s
            // accept any supported spot (the capsules separate on their own).
            let spot = p.recoverySpot(s);
            if (!spot && b.age > 2.5 && p.recoverySpotWide) {
                b._wideT = (b._wideT || 0) - dt;
                if (b._wideT <= 0) {
                    b._wideT = 0.25;
                    b._wideSpot = p.recoverySpotWide(s, b.age > 9);
                }
                spot = b._wideSpot || null;
            }
            else
                b._wideSpot = null;
            if (spot && b.blocked) {
                totals.rescued++;
                event(b, "get-up-rescued");
            }
            b.stableTime = spot ? b.stableTime + dt : 0;
            if (!spot) {
                if (b.age > 4 && !b.blocked) {
                    b.blocked = true;
                    totals.blocked++;
                    event(b, "get-up-blocked");
                }
                return;
            }
            if (b.stableTime < 0.45)
                return;
            if (c.legDown) {
                settleSupine(s, b, c, p, spot);
                return;
            }
            b.start = snapshot(s);
            const T = root.THREE, chestBone = s.char.bone("chest"), hipBone = s.char.bone("hips");
            const chestQ = chestBone.getWorldQuaternion(new T.Quaternion()), face = new T.Vector3(0, 0, -1).applyQuaternion(chestQ);
            b.clip12 = Math.abs(face.y) < .42 ? "getUpSide" : face.y > 0 ? "getUpBack" : "getUpFront";
            b.duration12 = b.clip12 === "getUpFront" ? 3.2 : b.clip12 === "getUpSide" ? 3.45 : 3.6;
            b.hipOffset12 = hipBone.getWorldPosition(new T.Vector3()).sub(new T.Vector3(spot.x, spot.y, spot.z));
            b.hipOffset12.y = 0;
            const right = new T.Vector3(1, 0, 0).applyQuaternion(hipBone.getWorldQuaternion(new T.Quaternion()));
            if (Math.hypot(right.x, right.z) > .35)
                c.yaw = Math.atan2(-right.z, right.x);
            c._facingTarget = c.yaw;
            c._facingVelocity = 0;
            s.idleYaw = c.yaw;
            b.contacts12 = {};
            c._jump12 = null;
            b.down = false;
            b.recovering = true;
            b.state = "getting-up";
            b.age = 0;
            b.blocked = false;
            c.pos.copy(spot);
            c.vel.set(0, 0, 0);
            c._motorVX = c._motorVZ = 0;
            c.crouch = 1;
            c.prone = 0;
            c.grounded = true;
            b.savedCrouchWant = c.crouchWant;
            b.savedProneWant = c.proneWant;
            c.proneWant = false;
            c.crouchWant = true;
            c._stumbleDown = false;
            p.dropRagdoll(s);
            s.rd = null;
            s.motion = null;
            s._posed = false;
            event(b, "get-up-start");
            return;
        }
        if (b.recovering) {
            // Stay low through the hand/knee support phase, then stand if clearance
            // allows it. The query excludes the actor's own capsule.
            const duration = root.GTraversalData ? (b.duration12 || 3.2) : 1.75;
            const intendedCrouch = 1 - smooth((b.age / duration - .66) / .32), clear = root.GPhysics.get(c._physicsWorld).canOccupy(s, c.pos, 1.72 - 0.58 * intendedCrouch);
            c.crouch = clear ? intendedCrouch : 1;
            b.lowCeiling = !clear;
            const support = root.GPhysics.get(c._physicsWorld).support(c.pos.x, c.pos.z, c.pos.y + .3, .7);
            if (!support || Math.abs(support.y + .025 - c.pos.y) > .28) {
                b.recovering = false;
                b.start = null;
                b.fallWanted = true;
                c._stumbleDown = false;
                event(b, "get-up-support-lost");
                return;
            }
            if (b.age >= duration) {
                b.recovering = false;
                b.state = "stable";
                b.age = 0;
                b.strength = b.load = 0;
                b.leanX = b.leanZ = b.vx = b.vz = 0;
                c._balanceBusy = false;
                c.crouchWant = b.lowCeiling || b.savedCrouchWant;
                c.proneWant = b.savedProneWant;
                b.cooldown = 1.2;
                b.start = null;
                s.motion = null;
                s._fallVelocity = null;
                s._fallRoot = null;
                totals.recovered++;
                event(b, "recovered");
            }
            return;
        }
        if (c._balanceBusy && !b.fallWanted) {
            // Recovery aborted without a new fall: never leave the controller frozen.
            c._balanceBusy = c._stumbleDown = false;
        }
        if (b.fallWanted && damage?.startFall) {
            b.fallWanted = false;
            if (!damage.startFall(s)) {
                c._balanceBusy = c._stumbleDown = false;
                b.state = "stable";
                b.strength = b.load = 0;
                return;
            }
            {
                s._fallVelocity = null;
                s._fallRoot = null;
                b.down = true;
                b.state = "down";
                b.age = 0;
                b.stableTime = 0;
                c._stumbleDown = c._balanceBusy = true;
                c.ads = c.sprint = 0;
                c.reload = -1;
                c.reloadPlan = null;
                c.inspect = -1;
                s._tacHands = null;
                const p = root.GPhysics.get(c._physicsWorld);
                p.ragdoll(s, 0, damage.PI);
                // Controlled balance loss, not ballistic knockback; preserve the
                // actor's actual locomotion velocity already captured by startFall.
                p.ragdollImpulse(s, b.dir.clone().multiplyScalar(12 * b.strength), s.char.bone("chest").getWorldPosition(new root.THREE.Vector3()));
                totals.falls++;
                event(b, "fall");
            }
            return;
        }
        const decay = Math.exp(-dt * 1.55);
        b.strength *= decay;
        b.load *= Math.exp(-dt * 0.95);
        const localX = b.dir.x * Math.cos(c.yaw) - b.dir.z * Math.sin(c.yaw), localZ = b.dir.x * Math.sin(c.yaw) + b.dir.z * Math.cos(c.yaw), targetX = localZ * b.strength * 0.48, targetZ = -localX * b.strength * 0.44;
        // Substepped damped angular response is independent of frame grouping.
        const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
        for (let i = 0; i < n; i++) {
            b.vx += ((targetX - b.leanX) * 110 - b.vx * 13) * h;
            b.vz += ((targetZ - b.leanZ) * 110 - b.vz * 13) * h;
            b.leanX += b.vx * h;
            b.leanZ += b.vz * h;
        }
        if (b.state === "stagger" && b.age > 0.18) {
            b.state = "catch";
            event(b, "catch-step");
        }
        if (b.state !== "stable" && b.strength < 0.025 && Math.hypot(b.leanX, b.leanZ) < 0.025) {
            b.state = "stable";
            b.strength = b.load = 0;
            b.kick.set(0, 0, 0);
            totals.caught++;
            event(b, "caught");
        }
    }
    AegisStumble.update = update;
    function pose(s, bone) {
        const b = s._balance;
        if (!b || b.down || b.recovering)
            return 0;
        bone("hips").rotation.x += b.leanX * 0.3;
        bone("hips").rotation.z += b.leanZ * 0.35;
        bone("spine").rotation.x += b.leanX * 0.45;
        bone("spine").rotation.z += b.leanZ * 0.4;
        bone("chest").rotation.x += b.leanX * 0.25;
        bone("chest").rotation.z += b.leanZ * 0.25;
        bone("head").rotation.x -= b.leanX * 0.45;
        bone("head").rotation.z -= b.leanZ * 0.45;
        return b.strength * 0.11;
    }
    AegisStumble.pose = pose;
    function arms(s) {
        const b = s._balance;
        if (!b || b.down || b.recovering || s.gun || b.strength < 0.12 || !root.GRig)
            return;
        const T = root.THREE, ch = s.char;
        ch.root.updateMatrixWorld(true);
        for (const side of ["R", "L"]) {
            const sg = side === "R" ? 1 : -1, shoulder = ch.bone("shoulder" + side), elbow = ch.bone("elbow" + side), wrist = ch.bone("wrist" + side), qs = shoulder.quaternion.clone(), qe = elbow.quaternion.clone(), target = ch.root.localToWorld(new T.Vector3(sg * (0.36 + b.strength * 0.16), 1.08, -0.28));
            root.GRig.twoBoneIK(T, { root: shoulder, mid: elbow, tip: wrist, target,
                pole: ch.root.localToWorld(new T.Vector3(sg * 0.7, 0.8, -0.05)), axis: elbow.position.clone().normalize() });
            shoulder.quaternion.slerp(qs, 1 - clamp(b.strength));
            elbow.quaternion.slerp(qe, 1 - clamp(b.strength));
        }
        ch.root.updateMatrixWorld(true);
    }
    AegisStumble.arms = arms;
    function recoveryPose(s) {
        const b = s._balance;
        if (!b?.recovering || !b.start)
            return;
        if (root.GMocap12?.recovery(s))
            return;
        const a = smooth(b.age / 1.7), start = b.start, ch = s.char;
        ch.root.position.lerpVectors(start.rootP, ch.root.position, a);
        ch.root.quaternion.slerpQuaternions(start.rootQ, ch.root.quaternion, a);
        for (const n of start.nodes) {
            n.bone.position.lerpVectors(n.p, n.bone.position, a);
            n.bone.quaternion.slerpQuaternions(n.q, n.bone.quaternion, a);
        }
        if (s.gun && start.gunP) {
            s.gun.root.position.lerpVectors(start.gunP, s.gun.root.position, a);
            s.gun.root.quaternion.slerpQuaternions(start.gunQ, s.gun.root.quaternion, a);
        }
        ch.root.updateMatrixWorld(true);
    }
    AegisStumble.recoveryPose = recoveryPose;
    function record(s, dt) {
        if (s.dead || s._balance?.down || s._balance?.recovering || dt <= 0 || dt > 0.15)
            return;
        const T = root.THREE, previous = s._fallVelocity || new Map(), next = new Map(), rootAt = s.char.root.getWorldPosition(new T.Vector3()), rootVelocity = new T.Vector3();
        if (s._fallRoot && rootAt.distanceTo(s._fallRoot) < 0.8)
            rootVelocity.copy(rootAt).sub(s._fallRoot).multiplyScalar(1 / dt);
        s._fallRoot = rootAt;
        for (const name of ["hips", "spine", "chest", "neck", "head", "hipR", "hipL", "kneeR", "kneeL", "ankleR", "ankleL", "toeR", "toeL"]) {
            const bone = s.char.bone(name);
            if (!bone)
                continue;
            const at = bone.getWorldPosition(new T.Vector3()), old = previous.get(name), residual = new T.Vector3();
            if (old && at.distanceTo(old.at) < 0.8) {
                residual.copy(at).sub(old.at).multiplyScalar(1 / dt);
                residual.sub(rootVelocity);
                residual.clampLength(0, 6);
            }
            next.set(name, { at, residual });
        }
        s._fallVelocity = next;
    }
    AegisStumble.record = record;
    function velocity(s, bone) {
        return s._fallVelocity?.get(bone)?.residual || null;
    }
    AegisStumble.velocity = velocity;
    function reset(s) {
        if (s.ctrl) {
            s.ctrl.balance = null;
            s.ctrl._jump12 = null;
            s.ctrl._stumbleDown = s.ctrl._balanceBusy = false;
        }
        s._balance = null;
        s._fallVelocity = null;
        s._fallRoot = null;
    }
    AegisStumble.reset = reset;
    function stats() { return { ...totals }; }
    AegisStumble.stats = stats;
})(AegisStumble || (AegisStumble = {}));
globalThis.GStumble = AegisStumble;
