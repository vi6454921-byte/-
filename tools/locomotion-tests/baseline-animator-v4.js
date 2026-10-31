"use strict";
/** Distance-driven foot planner, Rapier ground probes and angular pose-space drives.
 * Skinning/analytic IK are geometric constraints; no old gait clips are evaluated. */
var AegisAnimator;
(function (AegisAnimator) {
    const root = globalThis;
    const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
    const mix = (a, b, k) => a + (b - a) * k;
    const smooth = (x) => {
        x = clamp(x);
        return x * x * (3 - 2 * x);
    };
    AegisAnimator.PRONE = { hipBack: 0.66, hipUp: 0.13, eyeY: 0.395, eyeFwd: 0.1 };
    /** 0 — шаг, 1 — бег. Боты бегут быстро и без флага sprint: раньше на
     *  3–4 м/с у них оставался шаговый цикл 1,32 м — ноги «семенили» по 5–6
     *  шагов в секунду при шаговой фазе опоры и низком подъёме стопы. */
    function runK(c) {
        return clamp(Math.max(c.sprint || 0, ((c.speed || 0) - 1.8) / 2.2));
    }
    AegisAnimator.runK = runK;
    function strideLength(c) {
        const sp = c.speed || 0;
        return mix(mix(1.32, 2.6, runK(c)), 0.64 + 0.45 * clamp((sp - 0.8) / 1.4), smooth(c.crouch || 0));
    }
    AegisAnimator.strideLength = strideLength;
    function cadence(speed, sprint = 0, crouch = 0) {
        return (mix(0.95, 1.22, clamp((speed - 0.6) / 2)) + 0.18 * sprint + 0.3 * crouch);
    }
    AegisAnimator.cadence = cadence;
    function crouchProfile(c, M) {
        const k = smooth(c.crouch || 0), m = smooth(c.crouchMove || 0), S = (M.thigh || 0.454) / 0.454;
        const profile = {
            k,
            m,
            S,
            hipY: mix(0.44, 0.735, m) * S,
            lean: mix(0.075, 0.44, m),
            yaw: -0.4 * (1 - m),
            eyeY: mix(1.14, 1.368, m) * S,
            eyeFwd: mix(0.01, 0.234, m) * S,
            pk: smooth(((c.prone || 0) - 0.12) / 0.88),
            pEyeY: AegisAnimator.PRONE.eyeY,
            pEyeFwd: AegisAnimator.PRONE.eyeFwd,
        };
        if (c.vault) {
            const u = c.vault.t / c.vault.dur, v = smooth(u / 0.14) * (1 - smooth((u - 0.72) / 0.28));
            profile.k = Math.max(profile.k, v);
            profile.hipY = 0.37 * S;
            profile.lean = 1.05;
            profile.yaw = 0;
            profile.m = 0;
            profile.eyeY = 1.15 * S;
            profile.eyeFwd = 0.17 * S;
        }
        return profile;
    }
    AegisAnimator.crouchProfile = crouchProfile;
    const core = ["hips", "spine", "chest", "neck", "head"];
    const legNames = [
        "hipR",
        "kneeR",
        "ankleR",
        "toeR",
        "hipL",
        "kneeL",
        "ankleL",
        "toeL",
    ];
    function solveHands(s) {
        if (!s._tacHands)
            return false;
        const T = root.THREE, ch = s.char;
        ch.root.updateMatrixWorld(true);
        for (const side of ["R", "L"]) {
            const sg = side === "R" ? 1 : -1, shoulder = ch.bone("shoulder" + side), elbow = ch.bone("elbow" + side), wrist = ch.bone("wrist" + side), target = new T.Vector3().copy(s._tacHands[side]), pole = ch.root.localToWorld(new T.Vector3(sg * 0.55, 0.2, -0.35));
            const axis = new T.Vector3().copy(elbow.position).normalize();
            root.GRig.twoBoneIK(T, {
                root: shoulder,
                mid: elbow,
                tip: wrist,
                target,
                pole,
                axis,
            });
        }
        ch.root.updateMatrixWorld(true);
        return true;
    }
    AegisAnimator.solveHands = solveHands;
    function solveTraversalHands(s) {
        const c = s.ctrl, a = c.vault, T = root.THREE;
        c._vaultHands = null;
        if (!a?.hands)
            return false;
        const u = a.t / a.dur;
        const amount = smooth((u - 0.05) / 0.1) * (1 - smooth((u - 0.38) / 0.14));
        if (amount < 0.001)
            return false;
        const hands = {};
        s.char.root.updateMatrixWorld(true);
        for (const side of ["R", "L"]) {
            const shoulder = s.char.bone("shoulder" + side), elbow = s.char.bone("elbow" + side), wrist = s.char.bone("wrist" + side);
            const target = new T.Vector3().copy(a.hands[side]), start = shoulder.getWorldPosition(new T.Vector3());
            const reach = elbow.position.length() + wrist.position.length();
            // Release rather than stretching arms or pulling them backwards beyond reach.
            if (start.distanceTo(target) > reach * 0.98)
                continue;
            target.lerp(wrist.getWorldPosition(new T.Vector3()), 1 - amount);
            const pole = s.char.root.localToWorld(new T.Vector3(side === "R" ? 0.65 : -0.65, 0.65, -0.5));
            root.GRig.twoBoneIK(T, {
                root: shoulder,
                mid: elbow,
                tip: wrist,
                target,
                pole,
                axis: elbow.position.clone().normalize(),
            });
            if (root.GVM?.gripMatrix && root.GAK?.wristQuat && s.char.hands?.[side]) {
                const basis = root.GVM.gripMatrix([target.x, target.y, target.z], [a.dx, 0, a.dz], [0, 1, 0]);
                const desired = root.GAK.wristQuat(new T.Quaternion().setFromRotationMatrix(basis), side, new T.Quaternion());
                const local = elbow
                    .getWorldQuaternion(new T.Quaternion())
                    .invert()
                    .multiply(desired);
                wrist.quaternion.slerp(local, amount);
                const open = root.GGrenades?.HANDS?.OPEN;
                if (open)
                    s.char.hands[side].setPose(open);
            }
            s.char.root.updateMatrixWorld(true);
            hands[side] = target;
        }
        c._vaultHands = hands;
        return Object.keys(hands).length > 0;
    }
    AegisAnimator.solveTraversalHands = solveTraversalHands;
    function pose(s, dt, active, t, damage) {
        const T = root.THREE, c = s.ctrl, ch = s.char, M = ch.metrics, b = (n) => ch.bone(n), rig = s.rig;
        const scene = root.GPhysics.get(c._physicsWorld), CP = crouchProfile(c, M), pk = CP.pk;
        let st = s.motion;
        if (!st || st.char !== ch) {
            st = s.motion = {
                char: ch,
                last: c.pos.clone(),
                phase: c.stepPhase || 0,
                lastYaw: c.yaw,
                feet: {},
                distance: 0,
                prevVel: new T.Vector3(),
                speed: 0,
                reset: true,
            };
        }
        const travelled = Math.hypot(c.pos.x - st.last.x, c.pos.z - st.last.z), teleport = travelled > Math.max(1.1, (c.speed || 0) * dt * 4), turn = Math.atan2(Math.sin(c.yaw - st.lastYaw), Math.cos(c.yaw - st.lastYaw));
        st.last.copy(c.pos);
        st.lastYaw = c.yaw;
        const moving = c.speed > 0.09 && !c.vault && c.grounded !== false;
        // Start with a shortened support phase: a resting foot cannot support a full stride behind the hip.
        if (moving && !st.wasMoving) {
            st.phase = Math.floor(st.phase) + 0.2;
            st.reset = true;
        }
        st.wasMoving = moving;
        st.speed += (c.speed - st.speed) * (1 - Math.exp(-dt * 12));
        const stride = strideLength(c);
        if (moving && !teleport) {
            st.phase += travelled / Math.max(0.42, stride);
            st.distance += travelled;
        }
        if (c._distancePhase)
            st.phase = c.stepPhase;
        if (teleport || Math.abs(turn) > 0.65)
            st.reset = true;
        const ph = st.phase * Math.PI * 2, gaitK = clamp(st.speed / 1.2), breath = Math.sin(t * 1.45 + (s.idleSeed || 0)), ready = smooth(c.ready ?? (active ? 1 : 0));
        const blade = 0.44 * ready * (1 - 0.5 * (c.sprint || 0)) * (1 - pk), lean = mix(0.025 + 0.095 * runK(c) + 0.035 * gaitK, CP.lean, CP.k) *
            (1 - pk);
        const lateral = (c.vel.x * Math.cos(c.yaw) - c.vel.z * Math.sin(c.yaw)) /
            Math.max(1, c.PHYS?.sprint || 4.5), bank = clamp(lateral * 0.07 + (turn / Math.max(dt, 0.01)) * 0.008, -0.12, 0.12);
        ch.root.position.copy(c.pos);
        ch.root.rotation.set(0, c.yaw, 0, "YXZ");
        const hips = b("hips");
        hips.position.set(Math.sin(ph) * 0.008 * gaitK, mix(M.hipY, CP.hipY, CP.k) +
            Math.cos(ph * 2) * (0.009 + 0.022 * runK(c)) * gaitK +
            (c.landDip || 0) -
            (c.vaultTuck || 0) * 0.15, 0);
        hips.rotation.set(-lean * 0.3, -blade * 0.3 + Math.sin(ph) * 0.035 * gaitK, bank * 0.4 - (c.lean || 0) * 0.1);
        b("spine").rotation.set(-lean * 0.35 + breath * 0.002, -blade * 0.3 - Math.sin(ph) * 0.03 * gaitK, -bank * 0.25 - (c.lean || 0) * 0.1);
        b("chest").rotation.set(-lean * 0.35 - (c.ads || 0) * 0.035 + breath * 0.003, -blade * 0.4, -bank * 0.35 - (c.lean || 0) * 0.09);
        b("neck").rotation.set(clamp(c.pitch * 0.4 + lean * 0.5, -0.65, 0.8), blade * 0.3, bank * 0.1, "YXZ");
        b("head").rotation.set(clamp(c.pitch * 0.6 + lean * 0.5, -0.85, 0.85), blade * 0.4, bank * 0.15, "YXZ");
        if (c.dragging || s._aidLow) {
            b("spine").rotation.x -= 0.84 * CP.k;
            b("chest").rotation.x -= 0.72 * CP.k;
            hips.position.y -= 0.16 * CP.k;
        }
        if (s._tacHands && !s._aidLow && !c.dragging) {
            b("spine").rotation.x -= 0.22;
            b("chest").rotation.x -= 0.25;
        }
        if (c.vr?.out && c.armed) {
            const r = c.vr.out;
            b("spine").rotation.x += (r.torso || 0) * 0.4;
            b("chest").rotation.x += (r.torso || 0) * 0.6;
            b("chest").rotation.y += r.twist || 0;
            b("head").rotation.x += r.nod || 0;
        }
        for (const side of [1, -1]) {
            const S = side > 0 ? "R" : "L";
            b("clav" + S).rotation.set(0, -blade * (side < 0 ? 0.3 : 0.1), -side * (0.05 + 0.05 * (c.ads || 0)));
        }
        s._proneK = pk;
        if (pk > 0.001) {
            const pitch = (-Math.PI / 2) * smooth(pk);
            ch.root.rotation.set(pitch, c.yaw, 0, "YXZ");
            const q = new T.Quaternion().setFromEuler(ch.root.rotation), hipWorld = c.pos
                .clone()
                .add(new T.Vector3(Math.sin(c.yaw) * AegisAnimator.PRONE.hipBack, 0, Math.cos(c.yaw) * AegisAnimator.PRONE.hipBack).multiplyScalar(pk));
            hipWorld.y = c.pos.y + mix(hips.position.y, AegisAnimator.PRONE.hipUp, pk);
            ch.root.position
                .copy(hipWorld)
                .sub(hips.position.clone().applyQuaternion(q));
            hips.rotation.x = mix(hips.rotation.x, 0, pk);
            b("spine").rotation.x = mix(b("spine").rotation.x, 0.17, pk);
            b("chest").rotation.x = mix(b("chest").rotation.x, 0.2, pk);
            b("neck").rotation.x = mix(b("neck").rotation.x, 0.52 + c.pitch * 0.35, pk);
            b("head").rotation.x = mix(b("head").rotation.x, 0.5 + c.pitch * 0.55, pk);
        }
        if (damage?.poseAdd)
            hips.position.y -= damage.poseAdd(s, b, dt);
        scene.servoPose(s, core);
        ch.root.updateMatrixWorld(true);
        const baseMatrix = hips.matrixWorld.elements;
        const cached = st.lower;
        if (cached)
            cached.age += dt;
        if (!st.reset &&
            !moving &&
            !c.vault &&
            c.grounded !== false &&
            cached &&
            cached.age < 0.2 &&
            Math.abs(c.prone - cached.prone) < 1e-5 &&
            Math.abs(c.crouch - cached.crouch) < 1e-5 &&
            baseMatrix.every((x, i) => Math.abs(x - cached.matrix[i]) < 0.002)) {
            hips.position.y -= cached.drop;
            for (const name of legNames)
                b(name).quaternion.copy(cached.quats[name]);
            ch.root.updateMatrixWorld(true);
            rig.hipDrop = cached.drop;
            return {
                moveAmt: 0,
                breath,
                lean,
                blade,
                crouch: CP,
                gait: { gaitK, phase: st.phase },
            };
        }
        const baseKey = baseMatrix.slice();
        const feet = {};
        const solve = (side, target, normal, kneel) => {
            const hip = b("hip" + side), knee = b("knee" + side), ankle = b("ankle" + side), sg = side === "R" ? 1 : -1;
            const pole = ch.root.localToWorld(new T.Vector3(sg * 0.14, CP.k > 0.3 ? 0.2 : 0.45, -0.75));
            root.GRig.twoBoneIK(T, {
                root: hip,
                mid: knee,
                tip: ankle,
                target,
                pole,
                axis: new T.Vector3(0, -1, 0),
            });
            const orient = new T.Quaternion().setFromEuler(new T.Euler(kneel ? -0.8 : 0, 0, 0));
            const nq = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(normal.x, normal.y, normal.z).normalize());
            const flat = new T.Quaternion()
                .setFromAxisAngle(new T.Vector3(0, 1, 0), c.yaw)
                .premultiply(nq)
                .multiply(orient);
            ankle.quaternion.copy(knee.getWorldQuaternion(new T.Quaternion()).invert().multiply(flat));
            b("toe" + side).rotation.x = kneel ? 0.75 : 0;
            ch.root.updateMatrixWorld(true);
        };
        for (const side of ["R", "L"]) {
            const sg = side === "R" ? 1 : -1, p = (((st.phase + (sg < 0 ? 0.5 : 0)) % 1) + 1) % 1, stance = mix(0.62, 0.4, runK(c));
            const width = (M.hipX || 0.09) + 0.025, local = new T.Vector3(sg * width, M.ankleY || 0.085, 0);
            if (CP.k > 0.001) {
                local.x = mix(local.x, sg * 0.13 * CP.S, CP.k);
                local.z = mix(0, side === "R" ? 0.31 * CP.S : -0.36 * CP.S, CP.k * (1 - CP.m));
            }
            const yawQ = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), c.yaw);
            const neutral = local.clone().applyQuaternion(yawQ).add(c.pos), ground = scene.support(neutral.x, neutral.z, c.pos.y + 0.65, 2);
            const normal = ground?.normal || { x: 0, y: 1, z: 0 };
            neutral.y = (ground?.y ?? c.pos.y) + (M.ankleY || 0.085);
            const kneel = side === "R" && CP.k > 0.8 && CP.m < 0.1;
            if (kneel)
                neutral.y = (ground?.y ?? c.pos.y) + 0.19 * CP.S;
            let f = st.feet[side];
            if (!f) {
                f = st.feet[side] = {
                    locked: neutral.clone(),
                    start: neutral.clone(),
                    end: neutral.clone(),
                    swing: false,
                    p,
                };
            }
            const swing = moving && p >= stance;
            if (st.reset || c.grounded === false) {
                f.locked.copy(neutral);
                f.start.copy(neutral);
                f.end.copy(neutral);
                f.swing = false;
            }
            let target = neutral.clone();
            if (moving && pk < 0.4) {
                if (swing) {
                    if (!f.swing) {
                        f.start.copy(f.locked);
                        f.end
                            .copy(neutral)
                            .addScaledVector(c.vel, (stride / Math.max(0.3, c.speed)) * (1 - stance * 0.5));
                        const hit = scene.support(f.end.x, f.end.z, c.pos.y + 0.75, 2.2);
                        f.end.y = (hit?.y ?? c.pos.y) + (M.ankleY || 0.085);
                    }
                    const u = clamp((p - stance) / (1 - stance));
                    target.copy(f.start).lerp(f.end, smooth(u));
                    target.y +=
                        Math.sin(Math.PI * u) *
                            mix(0.095, 0.24, runK(c)) *
                            (1 - CP.k * 0.45);
                }
                else {
                    if (f.swing)
                        f.locked.copy(f.end);
                    if (f.locked.distanceTo(neutral) > 0.8)
                        f.locked.copy(neutral);
                    target.copy(f.locked);
                }
            }
            else {
                f.locked.lerp(neutral, 1 - Math.exp(-dt * 12));
                target.copy(f.locked);
                f.start.copy(target);
                f.end.copy(target);
            }
            f.swing = swing;
            f.p = p;
            if (c.grounded === false && !c.vault) {
                target.copy(ch.root.localToWorld(new T.Vector3(sg * width, Math.max(0.16, M.hipY - 0.58), -0.18)));
            }
            if (c.vault) {
                target.copy(ch.root.localToWorld(new T.Vector3(sg * 0.15, 0.35, -0.12)));
            }
            if (pk > 0.001) {
                const crawl = Math.max(0, Math.sin(ph + (sg < 0 ? Math.PI : 0))) * gaitK;
                const proneTarget = c.pos
                    .clone()
                    .add(new T.Vector3(sg * 0.24, 0, 0.66 + (M.thigh + M.shin) * 0.92 - 0.15 * crawl).applyQuaternion(yawQ));
                const hit = scene.support(proneTarget.x, proneTarget.z, c.pos.y + 0.5, 1.5);
                proneTarget.y = (hit?.y ?? c.pos.y) + 0.08 + 0.06 * crawl;
                target.lerp(proneTarget, pk);
            }
            feet[side] = {
                target,
                normal,
                kneel,
                plant: !swing && c.grounded !== false,
            };
        }
        // Make stance contacts reachable without stretching the skin: lower the pelvis.
        let drop = 0;
        if (pk < 0.4 && !c.vault && c.grounded !== false) {
            for (const side of ["R", "L"]) {
                const f = feet[side];
                if (!f.plant)
                    continue;
                const hip = b("hip" + side).getWorldPosition(new T.Vector3()), reach = M.thigh + M.shin - 0.012, hd = Math.hypot(hip.x - f.target.x, hip.z - f.target.z), vertical = Math.sqrt(Math.max(0.04, reach * reach - hd * hd));
                drop = Math.max(drop, hip.y - f.target.y - vertical);
            }
            drop = clamp(drop, 0, 0.32);
            hips.position.y -= drop;
            ch.root.updateMatrixWorld(true);
        }
        for (const side of ["R", "L"]) {
            const f = feet[side];
            solve(side, f.target, f.normal, f.kneel);
        }
        // Rapier supplies angular lag; hard stance contacts remain final constraints.
        scene.servoPose(s, legNames);
        ch.root.updateMatrixWorld(true);
        for (const side of ["R", "L"]) {
            const f = feet[side], ankle = b("ankle" + side).getWorldPosition(new T.Vector3()), hit = scene.support(ankle.x, ankle.z, c.pos.y + 0.7, 2);
            if (f.plant || (hit && ankle.y < hit.y + (M.ankleY || 0.085) - 0.015))
                solve(side, f.target, f.normal, f.kneel);
        }
        if (!moving && !c.vault) {
            const quats = {};
            for (const name of legNames)
                quats[name] = b(name).quaternion.clone();
            st.lower = {
                age: 0,
                matrix: baseKey,
                drop,
                prone: c.prone,
                crouch: c.crouch,
                quats,
            };
        }
        st.reset = false;
        rig.footGap = {};
        rig.hipDrop = drop;
        for (const side of ["R", "L"]) {
            const a = b("ankle" + side).getWorldPosition(new T.Vector3()), g = scene.support(a.x, a.z, c.pos.y + 0.8, 2.4);
            rig.footGap[side] = g ? a.y - g.y - (M.ankleY || 0.085) : null;
        }
        s.motion.debug = {
            phase: st.phase,
            distance: st.distance,
            feet: Object.fromEntries(Object.entries(feet).map(([k, f]) => [
                k,
                { target: f.target.toArray(), plant: f.plant },
            ])),
        };
        return {
            moveAmt: clamp(c.speed / (c.PHYS?.sprint || 4.55)),
            breath,
            lean,
            blade,
            crouch: CP,
            gait: { gaitK, phase: st.phase },
        };
    }
    AegisAnimator.pose = pose;
})(AegisAnimator || (AegisAnimator = {}));
globalThis.GAnimator = AegisAnimator;
globalThis.GLoco = AegisAnimator;
