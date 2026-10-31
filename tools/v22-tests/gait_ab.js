"use strict";
/** CMU phase-space locomotion, distance-driven contacts, terrain IK and pose drives.
 * Mocap supplies cyclic trajectories; controller/physics retain world/root ownership. */
var AegisAnimatorBase;
(function (AegisAnimator) {
    const root = globalThis;
    const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
    const mix = (a, b, k) => a + (b - a) * k;
    const smooth = (x) => {
        x = clamp(x);
        return x * x * (3 - 2 * x);
    };
    // C2 easing for recovery/turn steps; swing clearance also has zero endpoint velocity.
    const smoother = (x) => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
    const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
    /** NPC facing has angular inertia, unlike the direct player mouse. Substep
     * the acceleration limiter so 20/30/60/120 Hz use the same turn response. */
    function turnController(c, target, dt, alert = false) {
        if (!Number.isFinite(target))
            return;
        c._facingTarget = target;
        let remaining = Math.min(.2, Math.max(0, dt));
        const limit = alert ? 4.2 : 3.0, acceleration = alert ? 18 : 11;
        while (remaining > 1e-7) {
            const h = Math.min(1 / 120, remaining), error = angleDelta(target, c.yaw);
            const want = clamp(error * (alert ? 8 : 5), -limit, limit), v = c._facingVelocity || 0;
            c._facingVelocity = v + clamp(want - v, -acceleration * h, acceleration * h);
            const step = c._facingVelocity * h;
            if (Math.abs(step) > Math.abs(error) && step * error > 0) {
                c.yaw = target;
                c._facingVelocity = 0;
            }
            else
                c.yaw += step;
            remaining -= h;
        }
    }
    AegisAnimator.turnController = turnController;
    AegisAnimator.PRONE = { hipBack: 0.66, hipUp: 0.13, eyeY: 0.395, eyeFwd: 0.1 };
    const GAITS = ["walk", "jog", "run", "crouch", "sneak"];
    /** Phase-aligned blend, not three unrelated clip clocks. No phase reset on speed changes. */
    function gaitWeights(speed, crouch = 0) {
        const j = smooth((speed - 1.55) / 1.15) * (1 - smooth(crouch)), r = smooth((speed - 2.85) / .95);
        if (!root.GSpecialMotion)
            return [1 - j, j * (1 - r), j * r];
        const low = smooth(crouch), stealth = smooth((1.15 - speed) / .65) * (1 - low), normal = 1 - low - stealth;
        return [(1 - j) * normal, j * (1 - r) * normal, j * r * normal, low, stealth];
    }
    AegisAnimator.gaitWeights = gaitWeights;
    function sampleTable(a, p, endpoint = false) {
        if (!a?.length)
            return 0;
        p = ((p % 1) + 1) % 1;
        const x = p * a.length, i = Math.floor(x), u = x - i, n = a.length;
        // Periodic Catmull-Rom is C1 across every sample, including the clip seam.
        // Swing progress is a nonperiodic 0->1 segment; its end must never wrap to zero.
        if (endpoint && i >= n - 2)
            return mix(a[i], i === n - 1 ? 1 : a[i + 1], u);
        const A = a[(i + n - 1) % n], B = a[i], C = a[(i + 1) % n], D = a[(i + 2) % n];
        return B + .5 * u * (C - A + u * (2 * A - 5 * B + 4 * C - D + u * (3 * (B - C) + D - A)));
    }
    AegisAnimator.sampleTable = sampleTable;
    function gaitMeta(key, w) {
        const data = root.GGaitData?.gaits;
        if (!data)
            return key === "stance" ? .6 : key === "freq" ? 1.2 : key === "speed" ? 2 : .85;
        return w.reduce((v, k, i) => v + k * (data[GAITS[i]][key] || 0), 0);
    }
    AegisAnimator.gaitMeta = gaitMeta;
    /** v21: доля опоры бега (duty factor) по скорости. Patoz et al., Front. Physiol. 2022
     * (115 бегунов, дорожка): 37,7 % при 9 км/ч, 34,7 % при 11, 32,6 % при 13 км/ч;
     * дальше — та же линия (~28 % на 16 км/ч). Записи CMU бега/трусцы короткие
     * (2–3 цикла) и дают 28 % на любой скорости — лишний полёт на трусце и был
     * «скачущим» бегом. */
    function runDuty(speed) {
        return clamp(0.377 - (speed - 2.5) * 0.0459, 0.27, 0.40);
    }
    AegisAnimator.runDuty = runDuty;
    /** v21: масштаб записанного подъёма-опускания таза. С пяткой, которая теперь
     * отрывается в конце опоры, таз больше не «проседает» к каждому касанию, и
     * вертикальное колебание держится в 7–9 см, как у бегунов-любителей
     * (Garmin Running Dynamics: обычно 6–10 см). */
    const BOB_K = .9;
    /** Расстояние голеностоп → подушечка стопы, м (поворот стопы на носке). */
    const FOOT_PIVOT = .14;
    /** Доля опоры, пройденная тазом до точки постановки: у бегуна стопа ставится
     * ближе к проекции центра масс (~40 % пятна опоры впереди), а отталкивается
     * дальше позади (~60 %). */
    const LAND_K = .42;
    function gaitStance(w, speed) {
        const data = root.GGaitData?.gaits;
        if (!data)
            return .6;
        let v = 0;
        for (let k = 0; k < w.length; k++)
            if (w[k] > 1e-6)
                v += w[k] * (GAITS[k] === "jog" || GAITS[k] === "run" ? runDuty(speed) : data[GAITS[k]].stance || 0);
        return v;
    }
    AegisAnimator.gaitStance = gaitStance;
    /** Перенос фазы записи на новую долю опоры: опора [0, S) полушага ложится на
     * записанную [0, gs), полёт — на остаток. События касания и середина опоры
     * (низшая точка таза) остаются согласованы со стопами. */
    function warpHalf(p, S, gs) {
        if (!(S < .49 && gs < .49) || Math.abs(S - gs) < 1e-4)
            return p;
        p = ((p % 1) + 1) % 1;
        const h = p >= .5 ? .5 : 0, q = p - h;
        return h + (q < S ? q / S * gs : gs + (q - S) / (.5 - S) * (.5 - gs));
    }
    function gaitSample(channel, p, w, foot = false, S) {
        const data = root.GGaitData?.gaits;
        if (!data)
            return 0;
        const stance = S ?? gaitMeta("stance", w);
        let v = 0;
        for (let k = 0; k < w.length; k++)
            if (w[k] > 1e-5) {
                const g = data[GAITS[k]];
                const phase = foot ? (p < stance ? p / stance * g.stance : g.stance + (p - stance) / (1 - stance) * (1 - g.stance)) : S === undefined ? p : warpHalf(p, stance, g.stance);
                v += w[k] * sampleTable(g.ch[channel], phase, channel === "SX");
            }
        return v;
    }
    AegisAnimator.gaitSample = gaitSample;
    function runK(c) {
        return smooth(((c.speed || 0) - 1.65) / 2.05);
    }
    AegisAnimator.runK = runK;
    /** Full cycles/second, two contacts per cycle. Captured cadence is speed-warped
     * modestly; faster motion uses both longer strides and quicker recovery. */
    function cadence(speed, sprint = 0, crouch = 0) {
        const w = gaitWeights(speed, crouch);
        return clamp(gaitMeta("freq", w) * Math.pow(Math.max(.1, speed) / Math.max(.2, gaitMeta("speed", w)), .38), .48, 1.95);
    }
    AegisAnimator.cadence = cadence;
    function strideLength(c) {
        return Math.max(.24, (c.speed || 0) / cadence(c.speed || 0, c.sprint || 0, c.crouch || 0)) * (c.gaitScale || 1);
    }
    AegisAnimator.strideLength = strideLength;
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
        const amount = smooth((u - 0.04) / 0.14) * (1 - smooth((u - 0.58) / 0.18));
        if (amount < 0.001)
            return false;
        const hands = {};
        s.char.root.updateMatrixWorld(true);
        for (const side of ["R", "L"]) {
            const shoulder = s.char.bone("shoulder" + side), elbow = s.char.bone("elbow" + side), wrist = s.char.bone("wrist" + side);
            const target = new T.Vector3().copy(a.hands[side]), start = shoulder.getWorldPosition(new T.Vector3());
            const reach = elbow.position.length() + wrist.position.length();
            // Release rather than stretching arms or pulling them backwards beyond reach.
            const delta = target.clone().sub(start);
            const reachable = smooth((reach * 1.08 - delta.length()) / (reach * .2));
            if (reachable < .001)
                continue;
            if (delta.length() > reach * .98)
                target.copy(start).add(delta.setLength(reach * .98));
            target.lerp(wrist.getWorldPosition(new T.Vector3()), 1 - amount * reachable);
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
                moveBlend: 0,
                bodyYaw: 0,
                accelLean: 0,
                pelvisDrop: 0,
                lastYaw: c.yaw,
                feet: {},
                distance: 0,
                prevVel: new T.Vector3(),
                speed: 0,
                reset: true,
            };
        }
        const action12 = root.GMocap12?.pose(s, dt, t);
        if (action12)
            return action12;
        st.action12 = null;
        const travelled = Math.hypot(c.pos.x - st.last.x, c.pos.z - st.last.z), teleport = travelled > Math.max(1.1, (c.speed || 0) * dt * 4), turn = Math.atan2(Math.sin(c.yaw - st.lastYaw), Math.cos(c.yaw - st.lastYaw));
        root.GActionMotion?.begin(s, dt, turn, active);
        st.last.copy(c.pos);
        st.lastYaw = c.yaw;
        const moving = (c.speed > (st.wasMoving ? 0.055 : 0.16) || (c.balance?.strength > 0.12 && !c._balanceBusy)) && !c.vault && c.grounded !== false;
        st.moveBlend += ((moving ? clamp(c.speed / 0.85) : 0) - st.moveBlend) * (1 - Math.exp(-dt * 10));
        // Start with a shortened support phase: a resting foot cannot support a full stride behind the hip.
        if (moving && !st.gaitStarted) {
            st.phase = Math.floor(st.phase) + (st.phase % 1 >= 0.5 ? 0.7 : 0.2);
            st.gaitStarted = true;
        }
        st.stopAge = moving ? 0 : (st.stopAge || 0) + dt;
        st.wasMoving = moving;
        st.speed += (c.speed - st.speed) * (1 - Math.exp(-dt * 12));
        const stride = strideLength(c);
        if (moving && !teleport) {
            st.phase += travelled / Math.max(0.42, stride);
            st.distance += travelled;
        }
        if (c._distancePhase)
            st.phase = c.stepPhase;
        if (teleport)
            st.reset = true;
        const ph = st.phase * Math.PI * 2, gaitK = st.moveBlend * (1 - pk), breath = Math.sin(t * 1.45 + (s.idleSeed || 0)), ready = smooth(c.ready ?? (active ? 1 : 0));
        st.run = mix(st.run ?? runK(c), runK(c), 1 - Math.exp(-dt * 7));
        const gw = gaitWeights(st.speed, (c.crouch || 0) * (c.crouchMove || 0));
        st.gaitWeights = gw;
        const GS = gaitStance(gw, st.speed);
        st.gaitStance = GS;
        const captured = !!root.GGaitData;
        const run = st.run, vx = c.vel.x * Math.cos(c.yaw) - c.vel.z * Math.sin(c.yaw), vf = -(c.vel.x * Math.sin(c.yaw) + c.vel.z * Math.cos(c.yaw)), forward = clamp(vf / Math.max(0.1, c.speed), -1, 1), sideMove = clamp(vx / Math.max(0.1, c.speed), -1, 1), freedom = (1 - CP.k * 0.65) * (1 - pk), twist = (captured ? clamp(gaitSample("PT", st.phase % 1, gw, false, GS), -.16, .16) : Math.sin(ph) * mix(.075, .15, run)) * gaitK * freedom, weight = (captured ? clamp(gaitSample("PX", st.phase % 1, gw, false, GS) * (M.thigh + M.shin), -.035, .035) : Math.sin(ph) * mix(.018, .028, run)) * gaitK * freedom;
        const mocapBob = captured ? clamp(gaitSample("PY", st.phase % 1, gw, false, GS) * (M.thigh + M.shin) * BOB_K, -.055, .065) : -Math.cos(ph * 2 - .45) * mix(.012, .034, run);
        const capturedLean = captured ? clamp(gaitSample("TP", st.phase % 1, gw, false, GS), -.05, .32) : .025 + .095 * run + .035 * gaitK;
        const pelvisPitch = captured ? clamp(gaitSample("PP", st.phase % 1, gw, false, GS), -.13, .16) * gaitK * freedom : 0;
        const pelvisRoll = captured ? clamp(gaitSample("PR", st.phase % 1, gw, false, GS), -.09, .09) * gaitK * freedom : 0;
        const chestTwist = captured ? clamp(gaitSample("TT", st.phase % 1, gw, false, GS), -.11, .11) * gaitK * freedom : -twist * .35;
        st.armBlend = gaitK * (1 - CP.k * .3);
        const desiredYaw = clamp(Math.atan2(-vx, Math.abs(vf) + 0.15), -0.55, 0.55) * gaitK * freedom;
        st.bodyYaw += (desiredYaw - st.bodyYaw) * (1 - Math.exp(-dt * 8));
        const acceleration = teleport ? 0 : ((c.vel.x - st.prevVel.x) * -Math.sin(c.yaw) +
            (c.vel.z - st.prevVel.z) * -Math.cos(c.yaw)) / Math.max(dt, 0.008);
        st.prevVel.copy(c.vel);
        st.accelLean += (clamp(acceleration * 0.014, -0.09, 0.12) - st.accelLean) * (1 - Math.exp(-dt * 7));
        const blade = 0.44 * ready * (1 - 0.5 * (c.sprint || 0)) * (1 - pk), lean = mix(.025 + (capturedLean - .025) * gaitK * forward + st.accelLean, CP.lean, CP.k) *
            (1 - pk);
        const lateral = (c.vel.x * Math.cos(c.yaw) - c.vel.z * Math.sin(c.yaw)) /
            Math.max(1, c.PHYS?.sprint || 4.5), bankTarget = clamp(lateral * 0.07 + (turn / Math.max(dt, 0.01)) * 0.008, -0.12, 0.12);
        st.bank = mix(st.bank || 0, bankTarget, 1 - Math.exp(-dt * 8));
        const bank = st.bank;
        ch.root.position.copy(c.pos);
        ch.root.rotation.set(0, c.yaw, 0, "YXZ");
        const hips = b("hips");
        hips.position.set(weight, mix(M.hipY, CP.hipY, CP.k) +
            mocapBob * gaitK * (1 - CP.k * 0.65) +
            (c.landDip || 0) -
            (c.vaultTuck || 0) * 0.15, -st.accelLean * 0.08 * freedom);
        hips.rotation.set(-lean * 0.3 - pelvisPitch * .4, -blade * 0.3 + twist + st.bodyYaw, bank * 0.4 - (c.lean || 0) * 0.1 - weight * 1.2 + pelvisRoll * .65);
        b("spine").rotation.set(-lean * 0.35 + breath * 0.002, -blade * 0.3 - twist * 0.65 - st.bodyYaw * 0.65, -bank * 0.25 - (c.lean || 0) * 0.1 + weight * 0.65);
        b("chest").rotation.set(-lean * 0.35 - (c.ads || 0) * 0.035 + breath * 0.003, -blade * 0.4 + chestTwist - twist * .25 - st.bodyYaw * 0.35, -bank * 0.35 - (c.lean || 0) * 0.09);
        b("neck").rotation.set(clamp(c.pitch * 0.4 + lean * 0.5, -0.65, 0.8), blade * 0.3, bank * 0.1, "YXZ");
        b("head").rotation.set(clamp(c.pitch * 0.6 + lean * 0.5, -0.85, 0.85), blade * 0.4, bank * 0.15, "YXZ");
        // Gaze leads a turn while the loaded pelvis catches up. This is visual
        // anticipation only: aim/hits, the capsule and weapon direction stay owned
        // by the controller, not by a second cosmetic yaw writer.
        const lookTarget = !active && !c.vault && !c._balanceBusy && pk < .2
            ? clamp(angleDelta(s.idleYaw ?? c.yaw, c.yaw), -.55, .55) * (1 - CP.k * .5) : 0;
        st.lookYaw = mix(st.lookYaw || 0, lookTarget, 1 - Math.exp(-dt * 9));
        b("neck").rotation.y += st.lookYaw * .42;
        b("head").rotation.y += st.lookYaw * .58;
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
        root.GActionMotion?.body(s);
        root.GActionMotion?.crawlBody(s);
        if (damage?.poseAdd)
            hips.position.y -= damage.poseAdd(s, b, dt);
        if (root.GStumble)
            hips.position.y -= root.GStumble.pose(s, b);
        scene.servoPose(s, core);
        ch.root.updateMatrixWorld(true);
        const baseMatrix = hips.matrixWorld.elements;
        const cached = st.lower;
        if (cached)
            cached.age += dt;
        if (!st.reset &&
            !moving &&
            st.stopAge > 0.65 && Math.abs(turn) < 0.0001 && !st.turnStep &&
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
            st.mwFresh = true; // v20: matrices are final, the caller may skip its full update
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
        const solve = (side, target, normal, kneel, pitch = 0, yaw = c.yaw) => {
            const hip = b("hip" + side), knee = b("knee" + side), ankle = b("ankle" + side), sg = side === "R" ? 1 : -1;
            const pole = ch.root.localToWorld(new T.Vector3(sg * 0.14, CP.k > 0.3 ? 0.2 : 0.45, -0.75));
            if (pk > .5 && root.GSpecialMotion) {
                pole.copy(c.pos).add(new T.Vector3(sg * .36, .11, .66 + (M.thigh + M.shin) * .43).applyAxisAngle(new T.Vector3(0, 1, 0), c.yaw));
                pitch = -.45 * pk;
                yaw += Math.PI * pk;
            }
            root.GRig.twoBoneIK(T, {
                root: hip,
                mid: knee,
                tip: ankle,
                target,
                pole,
                axis: new T.Vector3(0, -1, 0),
            });
            const orient = new T.Quaternion().setFromEuler(new T.Euler(kneel ? -0.8 : pitch, 0, 0));
            const nq = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(normal.x, normal.y, normal.z).normalize());
            const flat = new T.Quaternion()
                .setFromAxisAngle(new T.Vector3(0, 1, 0), yaw)
                .premultiply(nq)
                .multiply(orient);
            ankle.quaternion.copy(knee.getWorldQuaternion(new T.Quaternion()).invert().multiply(flat));
            b("toe" + side).rotation.x = kneel ? 0.75 : Math.max(0, -pitch) * 0.65;
            // v20: only this leg changed since the last full update — refresh its
            // subtree (hip → toe), not all ~160 bones and meshes of the fighter.
            hip.updateMatrixWorld(true);
        };
        for (const side of ["R", "L"]) {
            const sg = side === "R" ? 1 : -1, p = (((st.phase + (sg < 0 ? 0.5 : 0)) % 1) + 1) % 1, stance = captured ? GS : mix(0.64, 0.34, run);
            const width = (M.hipX || 0.09) + 0.025 + Math.abs(sideMove) * 0.025, local = new T.Vector3(sg * width, M.ankleY || 0.085, 0);
            if (captured && CP.k < .5) {
                const lateral = gaitSample("FL", p, gw, true, GS);
                local.x += sg * clamp(lateral - .1, -.018, .025) * gaitK;
            }
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
                    yaw: c.yaw, startYaw: c.yaw,
                    p,
                };
            }
            if (p < stance)
                f.holdUntilWrap = false;
            let swing = moving && p >= stance && !f.holdUntilWrap;
            if (st.reset || c.grounded === false) {
                f.locked.copy(neutral);
                f.start.copy(neutral);
                f.end.copy(neutral);
                f.swing = false;
                f.yaw = c.yaw;
                f.startYaw = c.yaw;
            }
            let target = neutral.clone(), footPitch = 0;
            if (moving && pk < 0.4) {
                if (swing) {
                    if (!f.swing)
                        f.swingStart = f.p < stance ? stance : p;
                    const u = clamp((p - (f.swingStart ?? stance)) / Math.max(.1, 1 - (f.swingStart ?? stance)));
                    if (!f.swing) {
                        f.start.copy(f.currentTarget || f.locked);
                        f.startYaw = f.yaw;
                        f.end
                            .copy(neutral)
                            .addScaledVector(c.vel, (stride / Math.max(0.3, c.speed)) * (stance * mix(.5, LAND_K, run) + 1 - p));
                        const hit = scene.support(f.end.x, f.end.z, c.pos.y + 0.75, 2.2);
                        f.end.y = (hit?.y ?? c.pos.y) + (M.ankleY || 0.085);
                        // Probe the transfer corridor once per step, not just the landing.
                        // Preserve the captured knee fold; add only clearance missing over an edge.
                        f.obstacleLift = 0;
                        for (let n = 1; n < 6; n++) {
                            const v = n / 6, probe = f.start.clone().lerp(f.end, v), h = scene.support(probe.x, probe.z, c.pos.y + .85, 2.5);
                            if (h)
                                f.obstacleLift = Math.max(f.obstacleLift, clamp(h.y + (M.ankleY || .085) - probe.y, 0, .28));
                        }
                    }
                    // Turn retargeting stays early; braking can still shorten the landing late in swing.
                    if (u < 0.75 || c.speed < st.speed - 0.12) {
                        const predicted = neutral.clone().addScaledVector(c.vel, stride / Math.max(0.3, c.speed) * (stance * mix(.5, LAND_K, run) + 1 - p));
                        const hit = scene.support(predicted.x, predicted.z, c.pos.y + 0.75, 2.2);
                        predicted.y = (hit?.y ?? c.pos.y) + (M.ankleY || 0.085);
                        f.end.lerp(predicted, 1 - Math.exp(-dt * (c.speed < st.speed - .12 ? 24 : 10)));
                    }
                    // Captured swing keeps the heel trailing after toe-off, then recovers
                    // under the pelvis. Unlike a sine arc it does not march straight forward.
                    const sampleP = stance + u * (1 - stance);
                    const rawProgress = captured ? clamp(gaitSample("SX", sampleP, gw, true, GS)) : smooth(u);
                    const entry = smoother(u / .12), exit = smoother((1 - u) / .12);
                    const progress = mix(mix(smooth(u), rawProgress, entry), smooth(u), 1 - exit);
                    target.copy(f.start).lerp(f.end, progress);
                    f.yaw = f.startYaw + angleDelta(c.yaw, f.startYaw) * smoother(u);
                    footPitch = (captured ? clamp(gaitSample("FP", sampleP, gw, true, GS), -.95, .4) : (-.38 * (1 - smooth(u / .35)) + .16 * smooth((u - .65) / .35))) * forward * (1 - CP.k);
                    const clearance = captured ? Math.max(0, gaitSample("SY", sampleP, gw, true, GS)) * (M.thigh + M.shin) : Math.pow(Math.sin(Math.PI * u), 2) * mix(.10, .19, run);
                    target.y += clearance * (1 - CP.k * .45) * Math.min(1, st.moveBlend + .2) + (f.obstacleLift || 0) * Math.pow(Math.sin(Math.PI * u), 2);
                }
                else {
                    if (f.swing)
                        f.locked.copy(f.end);
                    const reachLimit = Math.min(0.55, (M.thigh + M.shin) * 0.62);
                    if (f.locked.distanceTo(neutral) > reachLimit && !f.recovery) {
                        // Turns/braking can invalidate a contact. Take a short recovery
                        // step; never teleport the locked sole back under the pelvis.
                        f.recovery = { start: (f.currentTarget || f.locked).clone(),
                            end: neutral.clone().addScaledVector(c.vel, 0.10), age: 0 };
                    }
                    target.copy(f.locked);
                    footPitch = (captured ? clamp(gaitSample("FP", p, gw, true, GS), -.45, .38) : (.16 * (1 - smooth(p / .12)) - .34 * smooth((p / stance - .65) / .35))) * forward * (1 - CP.k);
                    target.y += Math.max(0, -footPitch) * 0.055;
                }
            }
            else {
                // After braking, finish a short recovery step instead of dragging both
                // soles towards the idle pose. Stagger the feet to keep one support.
                if (!moving && st.stopAge < 0.6 && CP.k < 0.1 && pk < 0.1 && !st.reset) {
                    if (!f.settle)
                        f.settle = { start: (f.currentTarget || f.locked).clone(), end: neutral.clone(), yaw: f.yaw };
                    const u = clamp((st.stopAge - (side === "R" ? 0 : 0.16)) / 0.26);
                    target.copy(f.settle.start).lerp(f.settle.end, smoother(u));
                    f.yaw = f.settle.yaw + angleDelta(c.yaw, f.settle.yaw) * smoother(u);
                    target.y += Math.pow(Math.sin(Math.PI * u), 2) * Math.min(0.075, f.settle.start.distanceTo(f.settle.end) * 0.35);
                    f.locked.copy(target);
                }
                else {
                    f.settle = null;
                    // Standing feet stay in world space until an actual turn/recovery
                    // step. Rotating the idle pelvis must not drag both soles in a circle.
                    if (CP.k > .02 || pk > .1 || st.reset || c.grounded === false)
                        f.locked.lerp(neutral, 1 - Math.exp(-dt * 12));
                    target.copy(f.locked);
                }
                f.start.copy(target);
                f.end.copy(target);
            }
            if (!st.special?.action && !moving && st.stopAge >= .6 && CP.k < .15 && pk < .1 && !c.vault && c.grounded !== false) {
                const other = st.feet[side === "R" ? "L" : "R"], otherNeeds = other && Math.abs(angleDelta(c.yaw, other.yaw)) > .32;
                if (!st.turnStep && (st.lastTurnSide !== side || !otherNeeds) && (Math.abs(angleDelta(c.yaw, f.yaw)) > .32 || Math.hypot(f.locked.x - neutral.x, f.locked.z - neutral.z) > .13)) {
                    st.turnStep = { side, age: 0, start: target.clone(), end: neutral.clone(), yaw: f.yaw, endYaw: c.yaw };
                }
                if (st.turnStep?.side === side) {
                    const r = st.turnStep;
                    r.age += dt;
                    const u = clamp(r.age / .3);
                    target.copy(r.start).lerp(r.end, smoother(u));
                    target.y += Math.pow(Math.sin(Math.PI * u), 2) * .055;
                    f.yaw = r.yaw + angleDelta(r.endYaw, r.yaw) * smoother(u);
                    f.locked.copy(target);
                    swing = u < 1;
                    if (u >= 1) {
                        st.lastTurnSide = side;
                        st.turnStep = null;
                    }
                }
            }
            else if (moving || st.reset)
                st.turnStep = null;
            if (moving)
                f.settle = null;
            if (f.recovery && moving && !st.reset) {
                const r = f.recovery;
                r.age += dt;
                const u = clamp(r.age / 0.22);
                target.copy(r.start).lerp(r.end, smoother(u));
                target.y += Math.pow(Math.sin(Math.PI * u), 2) * 0.09;
                f.yaw += angleDelta(c.yaw, f.yaw) * (1 - Math.exp(-dt * 12));
                footPitch = 0;
                swing = u < 1;
                if (u >= 1) {
                    f.locked.copy(r.end);
                    f.start.copy(r.end);
                    f.end.copy(r.end);
                    f.recovery = null;
                    f.holdUntilWrap = true;
                    swing = false;
                }
            }
            else if (!moving || st.reset)
                f.recovery = null;
            f.swing = swing;
            f.p = p;
            if (c.grounded === false && !c.vault) {
                target.copy(ch.root.localToWorld(new T.Vector3(sg * width, Math.max(0.16, M.hipY - 0.58), -0.18)));
            }
            if (c.vault) {
                target.copy(ch.root.localToWorld(new T.Vector3(sg * 0.15, 0.35, -0.12)));
            }
            let actionFoot = null;
            if (pk < .1 && CP.k < .3)
                actionFoot = root.GActionMotion?.foot(s, side, target, f, scene);
            if (pk > 0.001) {
                const crawl = Math.max(0, Math.sin(ph + (sg < 0 ? Math.PI : 0))) * gaitK;
                const proneTarget = c.pos
                    .clone()
                    .add(new T.Vector3(sg * 0.24, 0, 0.66 + (M.thigh + M.shin) * 0.92 - 0.15 * crawl).applyQuaternion(yawQ));
                const hit = scene.support(proneTarget.x, proneTarget.z, c.pos.y + 0.5, 1.5);
                proneTarget.y = (hit?.y ?? c.pos.y) + 0.08 + 0.06 * crawl;
                const capturedCrawl = root.GActionMotion?.crawlFoot(s, side, scene);
                target.lerp(capturedCrawl && moving ? capturedCrawl : proneTarget, pk);
            }
            f.currentTarget = target.clone();
            feet[side] = {
                target,
                normal,
                kneel,
                pitch: footPitch,
                yaw: f.yaw,
                plant: pk < .4 && (actionFoot ? actionFoot.plant : !swing) && c.grounded !== false && (!f.settle || target.y <= neutral.y + 0.005),
            };
        }
        // Make stance contacts reachable without stretching the skin: lower the pelvis.
        let drop = 0, futureDrop = 0;
        const stanceNow = captured ? GS : mix(.64, .34, run);
        if (pk < 0.4 && !c.vault && c.grounded !== false) {
            for (const side of ["R", "L"]) {
                const f = feet[side];
                if (!f.plant)
                    continue;
                const hip = b("hip" + side).getWorldPosition(new T.Vector3()), reach = M.thigh + M.shin - 0.012, hd = Math.hypot(hip.x - f.target.x, hip.z - f.target.z), vertical = Math.sqrt(Math.max(0.04, reach * reach - hd * hd));
                let need = hip.y - f.target.y - vertical;
                /* v21: стопа перекатывается на носок, а не таз приседает. В конце опоры
                   бегун отрывает пятку (до ~11 см голеностопа на спринте), при постановке
                   на спринте касается передним отделом (до ~4,5 см). Раньше голеностоп
                   держался у земли всю опору, и таз опускался на 20–30 см к каждому
                   касанию и толчку — бот «скакал» вприсядку. */
                if (need > 0 && moving && gaitK > .05 && CP.k < .3 && pk < .1) {
                    const fs = st.feet[side], u = clamp((fs?.p ?? 0) / Math.max(.05, stanceNow)), late = smooth((u - .3) / .5);
                    const allow = mix(mix(0, .045, run), mix(.03, .11, run), late) * gaitK;
                    const lift = Math.min(need, allow);
                    if (lift > 1e-4) {
                        f.target.y += lift;
                        f.pitch = Math.min(f.pitch, -Math.asin(clamp(lift / FOOT_PIVOT, 0, .9)));
                        need -= lift;
                    }
                }
                drop = Math.max(drop, need);
            }
            // Look ahead to the next contact while still in flight. Without this,
            // a short first run swing can demand 8cm of pelvis correction in one frame.
            // Preview influences the smooth goal only; an actual support remains exact.
            for (const side of ["R", "L"]) {
                const f = st.feet[side];
                if (!f?.swing || f.recovery)
                    continue;
                const remaining = (1 - f.p) * stride / Math.max(.3, c.speed);
                if (remaining > .42)
                    continue;
                const hip = b("hip" + side).getWorldPosition(new T.Vector3()).addScaledVector(c.vel, remaining);
                const nextPhase = ((st.phase + 1 - f.p) % 1 + 1) % 1;
                const nextBob = captured ? clamp(gaitSample("PY", nextPhase, gw, false, GS) * (M.thigh + M.shin) * BOB_K, -.055, .065) : mocapBob;
                hip.y += (nextBob - mocapBob) * gaitK;
                const reach = M.thigh + M.shin - .02, hd = Math.hypot(hip.x - f.end.x, hip.z - f.end.z);
                const needed = hip.y - f.end.y - Math.sqrt(Math.max(.04, reach * reach - hd * hd)) - mix(0, .045, run) * gaitK;
                futureDrop = Math.max(futureDrop, needed + .015);
            }
            // Anticipate the coming support excursion. Reacting only after a knee
            // straightens caused a repeated 20–30 cm squat at every foot contact.
            const stSpan = stride * stanceNow, legReach = M.thigh + M.shin - .018, ankle0 = M.hipY - (M.ankleY || .085) + .025;
            /* толчок: пятно опоры позади таза (до 60 %), пятка оторвана; постановка —
               впереди (40 %), на спринте — на передний отдел стопы */
            const spanBack = Math.min(.61, stSpan * mix(.5, 1 - LAND_K, run) + .035), spanFront = Math.min(.61, stSpan * mix(.5, LAND_K, run) + .035);
            const anticipatory = Math.max(0,
                ankle0 - Math.sqrt(Math.max(.04, legReach * legReach - spanBack * spanBack)) - mix(.03, .11, run) * gaitK,
                ankle0 - Math.sqrt(Math.max(.04, legReach * legReach - spanFront * spanFront)) - mix(0, .045, run) * gaitK);
            drop = Math.max(drop, anticipatory * st.moveBlend * (1 - CP.k));
            drop = clamp(drop, 0, 0.32);
            // Rate-limit the cosmetic anticipatory correction; support still wins below.
            const desiredDrop = mix(st.pelvisDrop, Math.max(drop, clamp(futureDrop, 0, .32)), 1 - Math.exp(-dt * 18));
            st.pelvisDrop += clamp(desiredDrop - st.pelvisDrop, -dt * .75, dt * 1.25);
            // A real support constraint wins over cosmetic smoothing. In ordinary
            // gait the anticipation term has already made room for this contact.
            st.pelvisDrop = Math.max(st.pelvisDrop, drop);
            drop = st.pelvisDrop;
            hips.position.y -= drop;
            // v20: only the pelvis moved since the full update above
            hips.updateMatrixWorld(true);
        }
        for (const side of ["R", "L"]) {
            const f = feet[side];
            if (!f.plant && !c.vault && pk < 0.4) {
                const hip = b("hip" + side).getWorldPosition(new T.Vector3()), delta = f.target.clone().sub(hip), reach = (M.thigh + M.shin) * 0.994;
                if (delta.length() > reach)
                    f.target.copy(hip).add(delta.setLength(reach));
            }
            solve(side, f.target, f.normal, f.kneel, f.pitch, f.yaw);
        }
        // Legs are final geometric constraints. Do not allocate eight Rapier
        // angular motors only to overwrite their result with a second identical IK
        // solve. Core inertia remains simulated; contact/ragdoll ownership is intact.
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
            source: root.GSpecialMotion ? "CMU-mocap-v11" : captured ? "CMU-mocap-v9" : "fallback",
            special: st.special?.action || null,
            weights: gw.slice(), stance: GS,
            distance: st.distance,
            feet: Object.fromEntries(Object.entries(feet).map(([k, f]) => [
                k,
                { target: f.target.toArray(), plant: f.plant },
            ])),
        };
        st.mwFresh = true; // v20: matrices are final, the caller may skip its full update
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
})(AegisAnimatorBase || (AegisAnimatorBase = {}));
globalThis.GAnimatorBase = AegisAnimatorBase;



const G=__GAME, S=G.state, T=THREE;
S.paused=true;
const s=G.squad.find((q,i)=>i!==S.activeIdx&&!q.dead), c=s.ctrl, M=s.char.metrics;
const wp=(n)=>s.char.bone(n).getWorldPosition(new T.Vector3());
const kneeAng=(n)=>2*Math.acos(Math.min(1,Math.abs(s.char.bone(n).quaternion.w)));
const p0=c.pos.clone();
function runOne(A, v, mode){
  s.motion=null; s._posed=false; c._facingTarget=undefined;
  const yaw=0, dir=new T.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)), dt=1/60;
  c.pos.copy(p0); c.yaw=yaw; s.idleYaw=yaw; c.grounded=true;
  c.sprint = mode==='sprint'?1:0; c.sprintWant = mode==='sprint';
  c.crouch = mode==='crouch'?1:0; c.crouchMove = mode==='crouch'?1:0;
  const gy=p0.y; const rec=[]; let prevK=null, pops=0;
  for(let i=0;i<360;i++){
    const k=Math.min(1,i/30);
    c.vel.copy(dir).multiplyScalar(v*k); c.speed=v*k; c.pos.addScaledVector(dir, v*k*dt); if(c._distancePhase) c.stepPhase=(c.stepPhase||0)+v*k*dt/Math.max(0.42,A.strideLength(c));
    A.pose(s, dt, false, i*dt);
    s.char.root.updateMatrixWorld(true);
    if(i<90) continue;
    const aL=wp('ankleL').y-gy, aR=wp('ankleR').y-gy, h=wp('hips').y-c.pos.y;
    const kR=kneeAng('kneeR'), kL=kneeAng('kneeL');
    if(prevK){const j=Math.max(Math.abs(kR-prevK[0]),Math.abs(kL-prevK[1]))*57.3; if(j>12) pops++;}
    prevK=[kR,kL];
    const F=(s.motion&&s.motion.debug&&s.motion.debug.feet)||{}; rec.push({sp:(s.motion&&s.motion.special&&s.motion.special.action)||'',aL,aR,h,ph:(s.motion&&s.motion.phase)||0,pL:F.L&&F.L.plant?1:0,pR:F.R&&F.R.plant?1:0});
  }
  const base=Math.min(...rec.map(r=>Math.min(r.aL,r.aR)));
  const pct=(a,q)=>{const b=a.slice().sort((x,y)=>x-y);return b[Math.floor(b.length*q)];};
  const thL=pct(rec.map(r=>r.aL),0.1)+0.04, thR=pct(rec.map(r=>r.aR),0.1)+0.04;
  const air=rec.filter(r=>r.aL>thL&&r.aR>thR).length/rec.length;
  const both=rec.filter(r=>r.aL<=thL&&r.aR<=thR).length/rec.length;
  const mL=rec.reduce((a,r)=>a+r.aL,0)/rec.length, mR=rec.reduce((a,r)=>a+r.aR,0)/rec.length;
  let sxy=0,sxx=0,syy=0; for(const r of rec){sxy+=(r.aL-mL)*(r.aR-mR); sxx+=(r.aL-mL)**2; syy+=(r.aR-mR)**2;}
  const corr=sxy/Math.sqrt(sxx*syy+1e-12);
  const plSame=rec.filter(r=>r.pL===r.pR).length/rec.length;
  const lift=Math.max(...rec.map(r=>Math.max(r.aL,r.aR)))-base;
  // per half-cycle hip p2p
  const win={}; for(const r of rec){const k=Math.floor(r.ph*2); (win[k]=win[k]||[]).push(r.h);} const vo=Object.values(win).filter(a=>a.length>4).map(a=>Math.max(...a)-Math.min(...a)).sort((a,b)=>a-b);
  const hs=rec.map(r=>r.h); let acc=[]; for(let i=2;i<hs.length;i++) acc.push(Math.abs(hs[i]-2*hs[i-1]+hs[i-2])/(dt*dt)); acc.sort((a,b)=>a-b);
  const cyc=(rec[rec.length-1].ph-rec[0].ph)/((rec.length-1)*dt);
  return {mode, v, bothAir:+air.toFixed(3), bothDown:+both.toFixed(3), corrLR:+corr.toFixed(2), plantSame:+plSame.toFixed(2), footLift:+lift.toFixed(3), hipVO:+(vo[vo.length>>1]||0).toFixed(3), acc95:+(acc[Math.floor(acc.length*0.95)]||0).toFixed(1), pops, stepsPerS:+(cyc*2).toFixed(2), stance:+((s.motion&&s.motion.gaitStance)||0).toFixed(3), special:rec.filter(r=>r.sp).length};
}
const out=[{dp:!!c._distancePhase}];
for(const [v,mode] of [[1.4,'walk'],[2.55,'run'],[4.55,'sprint'],[1.25,'crouch']]){
  out.push(Object.assign({ver:'v21'}, runOne(GAnimatorBase, v, mode)));
  out.push(Object.assign({ver:'v22'}, runOne(GAnimator, v, mode)));
}
c.pos.copy(p0); c.vel.set(0,0,0); c.speed=0; s.motion=null;
return out;
