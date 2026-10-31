"use strict";
/** Contact-warped CMU actions. KCC owns all translation, never a second root-motion writer. */
var AegisMocapActions;
(function (AegisMocapActions) {
    const root = globalThis, clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
    const ease = (v) => { v = clamp(v); return v * v * v * (v * (v * 6 - 15) + 10); };
    const mix = (a, b, k) => a + (b - a) * k;
    function sample(name, key, p) {
        const a = root.GTraversalData?.actions?.[name]?.ch?.[key];
        if (!a)
            return 0;
        const x = clamp(p) * (a.length - 1), i = Math.floor(x);
        return mix(a[i], a[Math.min(i + 1, a.length - 1)], x - i);
    }
    AegisMocapActions.sample = sample;
    function vec(name, key, p) { const T = root.THREE; return new T.Vector3(...'XYZ'.split('').map(a => sample(name, key + a, p))); }
    function requestJump(c, k = 1) {
        if (c._jump12 || c.vault || c._balanceBusy)
            return false;
        c._jump12 = { phase: 'load', t: 0, k, flight: 2 * c.PHYS.jump * k / Math.abs(c.PHYS.gravity), land: 0 };
        return true;
    }
    AegisMocapActions.requestJump = requestJump;
    function motor(c, dt) {
        const a = c._jump12;
        if (!a)
            return;
        a.t += dt;
        if (a.phase === 'load') {
            if (!c.grounded || c.vault || c._balanceBusy) {
                c._jump12 = null;
                return;
            }
            if (a.t >= .14) {
                a.phase = 'air';
                a.t = 0;
                c.vel.y = c.PHYS.jump * a.k;
                c.grounded = false;
                c._air = { t: 0, y0: c.pos.y };
            }
        }
        else if (a.phase === 'air' && c.grounded && a.t > .05) {
            a.phase = 'land';
            a.t = 0;
        }
        else if (a.phase === 'land' && a.t > .32)
            c._jump12 = null;
    }
    AegisMocapActions.motor = motor;
    function jumpPhase(c) { const a = c._jump12; if (!a)
        return .52; return a.phase === 'load' ? mix(0, .28, ease(a.t / .14)) : a.phase === 'air' ? mix(.28, .73, clamp(a.t / a.flight)) : mix(.73, 1, ease(a.t / .32)); }
    AegisMocapActions.jumpPhase = jumpPhase;
    function orient(b, y, x) {
        const T = root.THREE;
        y = y.clone().normalize();
        x = x.clone().addScaledVector(y, -x.dot(y));
        if (x.lengthSq() < 1e-6)
            x.set(1, 0, 0).addScaledVector(y, -y.x);
        x.normalize();
        const z = new T.Vector3().crossVectors(x, y).normalize();
        x.crossVectors(y, z).normalize();
        const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
        b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));
        b.updateMatrixWorld(true);
    }
    function ik(s, side, target, pole, arm = false) {
        const T = root.THREE, ch = s.char, b = (n) => ch.bone(n), A = b((arm ? 'shoulder' : 'hip') + side), B = b((arm ? 'elbow' : 'knee') + side), C = b((arm ? 'wrist' : 'ankle') + side);
        const start = A.getWorldPosition(new T.Vector3()), len = B.position.length() + C.position.length(), v = target.clone().sub(start);
        if (v.length() > len * .988)
            target.copy(start).add(v.setLength(len * .988));
        root.GRig.twoBoneIK(T, { root: A, mid: B, tip: C, target, pole, axis: B.position.clone().normalize() });
        if (!arm) {
            const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), s.ctrl.yaw);
            C.quaternion.copy(B.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));
            b('toe' + side).rotation.x = 0;
        }
        ch.root.updateMatrixWorld(true);
        return target;
    }
    function action(s) {
        const c = s.ctrl;
        if (c.vault)
            return { name: c.vault.style || 'speedVault', p: clamp(c.vault.t / c.vault.dur), kind: 'vault' };
        if (c._jump12 || c.grounded === false && !c.ladder && !c._balanceBusy)
            return { name: 'jump', p: jumpPhase(c), kind: 'jump' };
        return null;
    }
    /** v23: стопа на перелазе (мировая цель голеностопа). Опорная нога (R у «упора»)
     * ставится на верх преграды и сходит на ту сторону, маховая переносится над кромкой;
     * у низкой преграды — два шага через неё, у высокой — колено на верх и подъём. */
    function vaultFoot(c, side, p, M) {
        const T = root.THREE, v = c.vault, sg = side === 'R' ? 1 : -1, ay = (M.ankleY || .095) - .01;
        const dx = v.dx, dz = v.dz, rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw), D = v.dist || Math.hypot(v.p1.x - v.p0.x, v.p1.z - v.p0.z);
        const g0 = v.p0.y, g1 = v.p1.y - .015, top = v.top;
        const at = (d, lat, y) => new T.Vector3(v.p0.x + dx * d + rx * lat, y + ay, v.p0.z + dz * d + rz * lat);
        // ключи: [u, d, lat, y]; между ключами — перенос по дуге (arc — высота над прямой)
        // ключи постоянны на весь перелаз — считаются один раз на сторону
        const fk = v._fk || (v._fk = {}), ck = fk[side];
        let K, arc;
        if (ck) {
            K = ck.K;
            arc = ck.arc;
        }
        else {
            const dTop = v.kind === 'over' ? Math.min(Math.max(v.near, (v.near + v.exit) * .5 - .05), v.toi + .28) : v.near + .12;
            if (v.style === 'climbOver') {
                /* v25: высокая ограда — ноги упираются в стенку на подтягивании, правая
                   ложится на верх, обе переносятся на ту сторону, соскок */
                const w0 = v.toi - .1, hR = Math.min(.95, v.h - .7), hL = Math.min(.75, v.h - .9), dT = Math.max(v.toi + .02, (v.near + v.exit) * .5 - .04);
                K = side === 'R'
                    ? [[0, .06, .12, g0], [.12, .06, .12, g0], [.26, w0, .14, g0 + .5], [.42, w0 + .02, .15, g0 + hR], [.56, dT, .17, top + .03], [.66, dT + .3, .15, top - .42], [.74, dT + .3, .14, top - .46], [.87, D - .04, .13, g1], [1, D - .04, .12, g1]]
                    : [[0, -.04, -.12, g0], [.16, -.04, -.12, g0], [.3, w0, -.13, g0 + .32], [.48, w0 + .02, -.14, g0 + hL], [.6, w0 + .04, -.15, top - .36], [.7, dT + .28, -.15, top - .42], [.87, D + .04, -.12, g1], [1, D + .04, -.12, g1]];
                arc = side === 'R' ? [0, .08, .05, .16, .1, 0, 0, 0] : [0, .06, .05, .05, .5, 0, 0];
            }
            else if (v.style === 'stepOver') {
                K = side === 'R' ? [[0, .06, .12, g0], [.25, .06, .12, g0], [.57, D - .06, .12, g1], [1, D - .06, .12, g1]] : [[0, -.04, -.12, g0], [.53, -.04, -.12, g0], [.85, D + .06, -.12, g1], [1, D + .06, -.12, g1]];
                arc = [0, v.h + .16, 0];
            }
            else if (v.style === 'mantle') {
                K = side === 'R' ? [[0, .06, .12, g0], [.26, .06, .12, g0], [.46, dTop, .12, top], [.8, dTop, .12, top], [.94, D + .02, .12, g1], [1, D + .02, .12, g1]] : [[0, -.04, -.12, g0], [.5, -.04, -.12, g0], [.78, D, -.12, g1], [1, D, -.12, g1]];
                arc = side === 'R' ? [0, .16, 0, .06, 0] : [0, Math.max(.14, top - g0 + .18 - (top - g0)), 0];
            }
            else {
                K = side === 'R' ? [[0, .08, .12, g0], [.1, .08, .12, g0], [.3, dTop, .09, top], [.6, dTop, .09, top], [.86, D - .1, .12, g1], [1, D - .1, .12, g1]] : [[0, -.05, -.12, g0], [.25, -.05, -.12, g0], [.74, D + .12, -.14, g1], [1, D + .12, -.14, g1]];
                arc = side === 'R' ? [0, .14, 0, .1, 0] : [0, top + .3 - (g0 + g1) * .5, 0];
            }
            fk[side] = { K, arc };
        }
        let i = 0;
        while (i < K.length - 2 && p > K[i + 1][0])
            i++;
        const k0 = K[i], k1 = K[i + 1], r = clamp((p - k0[0]) / Math.max(1e-3, k1[0] - k0[0])), e = ease(r);
        // шаг вверх (на преграду): стопа сначала поднимается, потом идёт вперёд; шаг вниз — наоборот
        const upS = k1[3] - k0[3] > .2, dnS = k0[3] - k1[3] > .2 && k0[3] > top - .05;
        const ey = upS ? ease(r / .65) : dnS ? ease((r - .3) / .7) : e, ed = upS ? ease((r - .3) / .7) : dnS ? ease(r / .7) : e;
        const y = mix(k0[3], k1[3], ey) + Math.max(0, arc[i] || 0) * Math.sin(Math.PI * e);
        // над кромкой стопа не ниже верха преграды
        const d = mix(k0[1], k1[1], ed), lat = mix(k0[2], k1[2], e), over = d > v.toi - .05 && d < (v.kind === 'over' ? v.exit + .05 : 1e9);
        return at(d, lat, over && r > 0 && r < 1 ? Math.max(y, top + .04) : y);
    }
    function pose(s, dt, t) {
        const a = action(s);
        if (!a || !root.GTraversalData)
            return null;
        if (!s.motion.action12)
            root.GPhysics.get(s.ctrl._physicsWorld).dropPose(s);
        if (s.motion.special) {
            s.motion.special.action = null;
            s.motion.special.weight = 0;
        }
        const T = root.THREE, c = s.ctrl, ch = s.char, b = (n) => ch.bone(n), M = ch.metrics, leg = M.thigh + M.shin;
        const yawQ = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), c.yaw);
        ch.root.position.copy(c.pos);
        ch.root.quaternion.copy(yawQ);
        const hips = b('hips'), p = a.p, load = c._jump12?.phase === 'load', land = c._jump12?.phase === 'land';
        /* v23: перелаз — таз и наклон по общим кривым GTraversal.body (мировые высоты): таз проходит
           над кромкой, а не ложится на неё; раньше приседание на 0,78 м и наклон 60° давали «переползание» */
        const VB = a.kind === 'vault' ? root.GTraversal?.body?.(c, M) : null;
        const w = a.kind === 'vault' ? (VB ? 1 : ease(p / .16) * (1 - ease((p - .82) / .18))) : load ? ease(c._jump12.t / .14) : land ? 1 - ease(c._jump12.t / .32) : 1;
        const crouch = VB ? M.hipY - (VB.hipW - c.pos.y) : a.kind === 'vault' ? (a.name === 'stepOver' ? .57 : .78) * w : load ? .14 * w : land ? .16 * (1 - ease(c._jump12.t / .32)) : .035;
        hips.position.set(0, M.hipY - crouch, VB ? -VB.fwd : 0);
        hips.rotation.set(0, 0, 0);
        const captureLean = clamp(Math.atan2(-sample(a.name, 'CHZ', p), sample(a.name, 'CHY', p)), -.15, .8);
        const lean = VB ? VB.lean : a.kind === 'vault' ? mix(.08, a.name === 'stepOver' ? .55 : 1.05, w) : clamp(captureLean, -.1, .45) * w;
        b('hips').rotation.x = -lean * .22;
        b('spine').rotation.set(-lean * .38, 0, 0);
        b('chest').rotation.set(-lean * .4, 0, 0);
        b('neck').rotation.set(lean * .3 + (c.pitch || 0) * .3, 0, 0);
        b('head').rotation.set(lean * .3 + (c.pitch || 0) * .7, 0, 0);
        for (const side of ['R', 'L'])
            b('clav' + side).rotation.set(0, 0, side === 'R' ? -.05 : .05);
        ch.root.updateMatrixWorld(true);
        const feet = {};
        for (const side of ['R', 'L']) {
            const sg = side === 'R' ? 1 : -1;
            let local = vec(a.name, 'F' + side, p).multiplyScalar(leg);
            // Preserve captured asymmetry, but adapt the action envelope to loaded equipment.
            local.x = clamp(local.x, sg > 0 ? .08 : -.30, sg > 0 ? .30 : -.08);
            local.z = clamp(local.z, -.5, .48);
            let target = new T.Vector3(local.x, Math.max(.085, hips.position.y + local.y), local.z);
            if (VB) {
                // v23: стопы — мировые цели по фазам перелаза (см. vaultFoot)
                const fw = vaultFoot(c, side, p, M);
                ik(s, side, fw, c.pos.clone().add(new T.Vector3(sg * .18, .52, -.85).applyQuaternion(yawQ)));
                feet[side] = { target: fw.toArray(), plant: false };
                continue;
            }
            if (a.kind === 'vault') {
                const v = c.vault, cross = ease((p - .26) / .2) * (1 - ease((p - .78) / .16));
                target.y = mix(.085, Math.max(.18, hips.position.y + local.y), cross);
                if (v.style === 'stepOver') {
                    const step = ease((p - (side === 'R' ? .25 : .53)) / .32), pos = v.p0.clone().lerp(v.p1, step);
                    pos.add(new T.Vector3(sg * .16, 0, 0).applyQuaternion(yawQ));
                    pos.y = mix(v.p0.y, v.p1.y, step) + .085 + Math.sin(Math.PI * step) * (v.h + .14);
                    target.copy(pos).sub(c.pos).applyQuaternion(yawQ.clone().invert());
                }
                if (v.style !== 'stepOver' && p > .29 && p < .80)
                    target.y = Math.max(target.y, .15 + .13 * Math.sin(Math.PI * p));
            }
            else if (c._jump12?.phase === 'load' || land) {
                const sourceHeight = sample('jump', 'H', p) * leg, fy = sourceHeight + local.y;
                target.y = Math.max(.085, Math.min(.22, fy));
                target.z *= .65;
            }
            target.lerp(new T.Vector3(sg * .14, .085, 0), 1 - w);
            target.applyQuaternion(yawQ).add(c.pos);
            const pole = c.pos.clone().add(new T.Vector3(sg * .18, .52, -.85).applyQuaternion(yawQ));
            ik(s, side, target, pole);
            feet[side] = { target: target.toArray(), plant: load || land };
        }
        s.motion.last.copy(c.pos);
        s.motion.lastYaw = c.yaw;
        s.motion.debug = { source: 'CMU-action-v12', special: a.name, feet };
        s.motion.action12 = { ...a, weight: w };
        s.motion.lower = null;
        s.motion.reset = true;
        return { moveAmt: 0, breath: 0, lean, blade: 0, crouch: root.GAnimator.crouchProfile(c, M), gait: { gaitK: 0, phase: s.motion.phase } };
    }
    AegisMocapActions.pose = pose;
    function hands(s) {
        const a = action(s);
        if (!a || a.kind !== 'jump' || s.gun || !root.GTraversalData)
            return false;
        const T = root.THREE, c = s.ctrl, M = s.char.metrics, leg = M.thigh + M.shin, yawQ = s.char.root.quaternion;
        for (const side of ['R', 'L']) {
            const sg = side === 'R' ? 1 : -1, local = vec('jump', 'H' + side, a.p).multiplyScalar(leg), hips = s.char.bone('hips').position;
            local.y = clamp(local.y + hips.y, .72, 1.65);
            local.x = sg * clamp(Math.abs(local.x), .22, .48);
            local.z = clamp(local.z, -.5, .25);
            const wrist = s.char.bone('wrist' + side).getWorldPosition(new T.Vector3());
            const target = local.applyQuaternion(yawQ).add(c.pos).lerp(wrist, 1 - (s.motion?.action12?.weight ?? 1));
            const cache = c._jump12?.hands || (c._jump12 ? (c._jump12.hands = {}) : {}), old = cache[side], dt = s.rig.poseDt || 1 / 60;
            const localTarget = target.clone().sub(c.pos).applyQuaternion(yawQ.clone().invert());
            if (old && (s.motion?.action12?.weight ?? 1) > .05) {
                const delta = localTarget.clone().sub(old);
                delta.clampLength(0, dt * 6.5);
                localTarget.copy(old).add(delta);
            }
            cache[side] = localTarget.clone();
            target.copy(localTarget).applyQuaternion(yawQ).add(c.pos);
            ik(s, side, target, new T.Vector3(sg * .65, .9, .1).applyQuaternion(yawQ).add(c.pos), true);
        }
        return true;
    }
    AegisMocapActions.hands = hands;
    function sling(s) {
        if (!s.gun)
            return;
        const T = root.THREE, chest = s.char.bone('chest');
        chest.updateMatrixWorld(true);
        const q = chest.getWorldQuaternion(new T.Quaternion()), p = chest.getWorldPosition(new T.Vector3());
        s.gun.root.position.copy(p).add(new T.Vector3(.14, -.16, .17).applyQuaternion(q));
        s.gun.root.quaternion.copy(q).multiply(new T.Quaternion().setFromEuler(new T.Euler(.15, 0, 2.85)));
        s.gun.root.updateMatrixWorld(true);
    }
    AegisMocapActions.sling = sling;
    function recovery(s) {
        const b = s._balance;
        if (!b?.recovering || !b.start || !root.GTraversalData)
            return false;
        const T = root.THREE, c = s.ctrl, ch = s.char, M = ch.metrics, leg = M.thigh + M.shin, name = b.clip12 || 'getUpFront';
        const p = clamp(b.age / (b.duration12 || 3.2)), enter = ease(b.age / .38), exit = ease((p - .88) / .12), blend = enter * (1 - exit);
        // Retain the ordinary pose for the last stable step, not a snap to T-pose.
        const normal = new Map();
        ch.root.traverse((n) => { if (n.isBone)
            normal.set(n, { p: n.position.clone(), q: n.quaternion.clone() }); });
        const gunP = s.gun?.root.position.clone(), gunQ = s.gun?.root.quaternion.clone();
        const rootP = ch.root.position.clone(), rootQ = ch.root.quaternion.clone(), yawQ = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), c.yaw);
        ch.root.position.copy(c.pos);
        ch.root.quaternion.copy(yawQ);
        const travel = vec(name, 'ROOT', p).multiplyScalar(leg);
        travel.y = 0;
        const sourceStart = vec(name, 'ROOT', 0).multiplyScalar(leg);
        sourceStart.y = 0;
        const correction = (b.hipOffset12 || new T.Vector3()).clone().applyQuaternion(yawQ.clone().invert()).sub(sourceStart).multiplyScalar(1 - ease(p));
        travel.add(correction);
        const hip = ch.bone('hips');
        hip.position.copy(travel);
        hip.position.y = clamp(sample(name, 'H', p) * leg, .15, M.hipY);
        const X = vec(name, 'RIGHT', p).applyQuaternion(yawQ);
        for (const [bone, key] of [['hips', 'PE'], ['spine', 'SP'], ['chest', 'CH'], ['neck', 'NE'], ['head', 'NE']])
            orient(ch.bone(bone), vec(name, key, p).applyQuaternion(yawQ), X);
        for (const side of ['R', 'L'])
            ch.bone('clav' + side).rotation.set(0, 0, side === 'R' ? -.03 : .03);
        ch.root.updateMatrixWorld(true);
        const hipWorld = hip.getWorldPosition(new T.Vector3()), scene = root.GPhysics.get(c._physicsWorld);
        b.contacts12 = b.contacts12 || {};
        for (const side of ['R', 'L']) {
            const sg = side === 'R' ? 1 : -1;
            for (const arm of [false, true]) {
                const prefix = arm ? 'H' : 'F', local = vec(name, prefix + side, p).multiplyScalar(leg), target = local.applyQuaternion(yawQ).add(hipWorld);
                const hit = scene.support(target.x, target.z, c.pos.y + .7, 1.5), floor = hit?.y ?? c.pos.y - .025;
                target.y = Math.max(floor + (arm ? .055 : .085), target.y);
                const id = prefix + side, low = target.y < floor + (arm ? .26 : .145) && (!arm || p < .78), contact = b.contacts12[id];
                if (arm && low)
                    target.y = floor + .065;
                if (low) {
                    if (!contact)
                        b.contacts12[id] = target.clone();
                    else if (contact.distanceTo(target) < .18)
                        target.copy(contact);
                    else
                        b.contacts12[id] = target.clone();
                }
                else
                    b.contacts12[id] = null;
                const pole = vec(name, (arm ? 'E' : 'K') + side, p).multiplyScalar(leg).applyQuaternion(yawQ).add(hipWorld);
                if (pole.distanceTo(target) < .04)
                    pole.add(new T.Vector3(sg * .2, .1, -.15).applyQuaternion(yawQ));
                ik(s, side, target, pole, arm);
            }
        }
        // Snapshot → supported captured action → ordinary crouch/stand. Bone lengths
        // remain exact throughout: only joint rotations and the pelvis are blended.
        for (const n of b.start.nodes) {
            const end = normal.get(n.bone);
            if (!end)
                continue;
            const qp = n.bone.quaternion.clone(), pos = n.bone.position.clone();
            n.bone.quaternion.slerpQuaternions(n.q, qp, enter).slerp(end.q, exit);
            if (n.bone === hip)
                n.bone.position.lerpVectors(n.p, pos, enter).lerp(end.p, exit);
            else
                n.bone.position.copy(end.p);
        }
        ch.root.position.lerpVectors(b.start.rootP, c.pos, enter).lerp(rootP, exit);
        ch.root.quaternion.slerpQuaternions(b.start.rootQ, yawQ, enter).slerp(rootQ, exit);
        ch.root.updateMatrixWorld(true);
        // Quaternion inertialization can sweep a shin through the floor even when
        // both endpoint clips are clear. Re-solve only penetrating end effectors.
        for (const side of ['R', 'L'])
            for (const arm of [false, true]) {
                const tip = ch.bone((arm ? 'wrist' : 'ankle') + side), at = tip.getWorldPosition(new T.Vector3());
                const support = scene.support(at.x, at.z, c.pos.y + .7, 1.5);
                if (!support)
                    continue;
                const min = support.y + (arm ? .045 : .08);
                if (at.y < min) {
                    at.y = min;
                    const pole = ch.bone((arm ? 'elbow' : 'knee') + side).getWorldPosition(new T.Vector3());
                    pole.y = Math.max(pole.y, support.y + .09);
                    ik(s, side, at, pole, arm);
                }
            }
        ch.root.updateMatrixWorld(true);
        for (const side of ['R', 'L']) {
            const wrist = ch.bone('wrist' + side), elbow = ch.bone('elbow' + side), at = wrist.getWorldPosition(new T.Vector3()), hit = scene.support(at.x, at.z, c.pos.y + .7, 1.5);
            const palm = hit ? ease((.18 - (at.y - hit.y)) / .11) * blend : 0;
            if (palm > .01 && root.GVM?.gripMatrix && root.GAK?.wristQuat) {
                const m = root.GVM.gripMatrix(at.toArray(), [-Math.sin(c.yaw), 0, -Math.cos(c.yaw)], [0, 1, 0]);
                const q = root.GAK.wristQuat(new T.Quaternion().setFromRotationMatrix(m), side, new T.Quaternion());
                wrist.quaternion.slerp(elbow.getWorldQuaternion(new T.Quaternion()).invert().multiply(q), palm);
                const open = root.GGrenades?.HANDS?.OPEN;
                if (open && palm > .2)
                    ch.hands?.[side]?.setPose(open);
            }
        }
        ch.root.updateMatrixWorld(true);
        sling(s);
        if (s.gun && gunP && gunQ) {
            const slingP = s.gun.root.position.clone(), slingQ = s.gun.root.quaternion.clone();
            s.gun.root.position.lerpVectors(b.start.gunP || slingP, slingP, enter).lerp(gunP, exit);
            s.gun.root.quaternion.slerpQuaternions(b.start.gunQ || slingQ, slingQ, enter).slerp(gunQ, exit);
            s.gun.root.updateMatrixWorld(true);
        }
        b.pose12 = { phase: p, clip: name, blend };
        return true;
    }
    AegisMocapActions.recovery = recovery;
})(AegisMocapActions || (AegisMocapActions = {}));
globalThis.GMocap12 = AegisMocapActions;
