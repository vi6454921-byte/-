"use strict";
/** CMU action/contact retargeting. Controller owns translation and heading;
 * captured trajectories drive pose/foot transfers, never the collider twice. */
var AegisActionMotion;
(function (AegisActionMotion) {
    const root = globalThis;
    const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
    const ease = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
    const angle = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
    function sample(clip, key, p) {
        const a = clip?.ch?.[key];
        if (!a?.length)
            return 0;
        const x = (clip.loop ? ((p % 1) + 1) % 1 : clamp(p)) * (clip.loop ? a.length : a.length - 1), i = Math.floor(x), u = x - i;
        return a[i % a.length] * (1 - u) + a[Math.min(i + 1, clip.loop ? a.length * 2 : a.length - 1) % a.length] * u;
    }
    AegisActionMotion.sample = sample;
    function begin(s, dt, delta, active = false) {
        const data = root.GSpecialMotion, c = s.ctrl, st = s.motion;
        if (!data || !st)
            return;
        const z = st.special || (st.special = { age: 0, cool: 0, prevSpeed: c.speed || 0, feet: {}, events: [] });
        z.cool = Math.max(0, z.cool - dt);
        const previous = z.prevSpeed;
        z.prevSpeed = c.speed || 0;
        if (c.vault || c.grounded === false || c.prone > .3 || c.crouch > .65 || c._balanceBusy || s.dead) {
            z.action = null;
            z.weight = 0;
            return;
        }
        if (z.action) {
            z.age += dt;
            // v22: разворот на месте гасится, как только боец перешёл на бег
            if (z.action.startsWith('turn') && (c.speed || 0) > 1.2)
                z.age = Math.max(z.age, z.duration - .16);
            if (z.age >= z.duration) {
                for (const side of ['R', 'L']) {
                    const r = z.feet[side], f = st.feet[side];
                    if (r?.current && f) {
                        f.locked.copy(r.current);
                        f.start.copy(r.current);
                        f.end.copy(r.current);
                        f.currentTarget = r.current.clone();
                        f.swing = false;
                        f.holdUntilWrap = true;
                        f.settle = null;
                        f.recovery = null;
                    }
                }
                if (z.action.startsWith('stop'))
                    st.stopAge = 0;
                st.turnStep = null;
                z.action = null;
                z.weight = 0;
                z.cool = .16;
            }
        }
        const target = active ? c.yaw : (Number.isFinite(c._facingTarget) ? c._facingTarget : s.idleYaw ?? c.yaw);
        const error = angle(target, c.yaw), rate = delta / Math.max(.008, dt);
        if (!z.action && z.cool <= 0) {
            let name = '', mirror = 1, duration = 0;
            // v22: клип разворота — только стоя/на медленном шаге (на бегу он давал «кузнечика»)
            if ((Math.abs(error) > .85 || Math.abs(rate) > 2.0) && (c.speed || 0) < .9 && previous < .9) {
                const large = Math.abs(error) > 2.05 || Math.abs(delta) > 2.05, sign = Math.sign(Math.abs(error) > .5 ? error : rate) || 1;
                name = large ? 'turn180' : sign > 0 ? 'turn90L' : 'turn90R';
                duration = large ? 1.06 : .72;
                if (large)
                    mirror = sign * Math.sign(data.actions.turn180.yaw || 1);
            }
            else if (previous > 1.15 && (c.speed - previous) / Math.max(.008, dt) < -2.8) {
                name = previous > 2.7 ? 'stopRun' : 'stopWalk';
                duration = previous > 2.7 ? .82 : .65;
            }
            if (name) {
                z.action = name;
                z.clip = data.actions[name];
                z.age = 0;
                z.duration = duration;
                z.mirror = mirror;
                z.feet = {};
                z.events.push({ name, time: s.ctrl._animTime || 0 });
                if (z.events.length > 24)
                    z.events.shift();
            }
        }
        if (z.action) {
            z.p = clamp(z.age / z.duration);
            z.weight = ease(z.age / .12) * ease((z.duration - z.age) / .16);
        }
    }
    AegisActionMotion.begin = begin;
    function body(s) {
        const z = s.motion?.special, c = s.ctrl;
        if (!z?.action || !z.weight)
            return;
        const q = z.clip, p = z.p, w = z.weight, leg = s.char.metrics.thigh + s.char.metrics.shin, b = (n) => s.char.bone(n);
        b('hips').position.y += clamp(sample(q, 'PY', p) * leg, -.045, .045) * w;
        const lean = clamp(sample(q, 'TP', p), -.18, .5);
        b('spine').rotation.x = b('spine').rotation.x * (1 - w * .35) - lean * .18 * w;
        b('chest').rotation.x = b('chest').rotation.x * (1 - w * .35) - lean * .18 * w;
        b('hips').rotation.y += clamp(sample(q, 'PT', p), -.28, .28) * w * (z.mirror || 1);
        b('chest').rotation.y += clamp(sample(q, 'TT', p), -.3, .3) * w * (z.mirror || 1);
    }
    AegisActionMotion.body = body;
    function foot(s, side, target, f, scene) {
        const z = s.motion?.special;
        if (!z?.action || !z.weight)
            return null;
        const T = root.THREE, c = s.ctrl, q = z.clip, p = z.p, k = z.mirror || 1, source = k < 0 ? (side === 'R' ? 'L' : 'R') : side, leg = s.char.metrics.thigh + s.char.metrics.shin;
        const local = new T.Vector3(sample(q, 'FX' + source, p) * leg * k, 0, sample(q, 'FZ' + source, p) * leg), y = sample(q, 'FY' + source, p) * leg;
        const yawQ = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), c.yaw), goal = local.applyQuaternion(yawQ).add(c.pos), support = scene.support(goal.x, goal.z, c.pos.y + .8, 2.4);
        const base = Math.min(...q.ch['FY' + source]) * leg;
        goal.y = (support?.y ?? c.pos.y) + (s.char.metrics.ankleY || .085) + clamp(y - base, 0, .24);
        const sourceContact = sample(q, 'C' + source, p) > .48, r = z.feet[side] || (z.feet[side] = { locked: (f.currentTarget || f.locked).clone(), current: (f.currentTarget || f.locked).clone(), sourceContact: true, contact: true });
        const maxStep = (3.5 + (c.speed || 0) * .9) * Math.min(.1, s.rig.poseDt || 1 / 60);
        const approach = (to) => { const d = to.clone().sub(r.current); if (d.length() > maxStep)
            d.setLength(maxStep); r.current.add(d); };
        if (sourceContact) {
            if (!r.sourceContact)
                r.locked.copy(goal);
            approach(r.locked);
            r.contact = r.current.distanceTo(r.locked) < .001;
        }
        else {
            const destination = target.clone().lerp(goal, z.weight);
            approach(destination);
            r.contact = false;
        }
        target.copy(r.current);
        if (r.contact)
            f.locked.copy(target);
        r.sourceContact = sourceContact;
        f.yaw += angle(c.yaw, f.yaw) * (1 - Math.exp(-12 * (s.rig.poseDt || 1 / 60)));
        return { plant: r.contact, pitch: clamp(sample(q, 'FP' + source, p), -.6, .5) };
    }
    AegisActionMotion.foot = foot;
    function crawlFoot(s, side, scene) {
        const clip = root.GSpecialMotion?.actions?.crawl;
        if (!clip)
            return null;
        const T = root.THREE, c = s.ctrl, st = s.motion, leg = s.char.metrics.thigh + s.char.metrics.shin, p = st.phase % 1;
        const mean = (key) => clip.ch[key].reduce((a, b) => a + b, 0) / clip.ch[key].length;
        const x = sample(clip, 'FX' + side, p) - mean('FX' + side), z = sample(clip, 'FZ' + side, p) - mean('FZ' + side), low = Math.min(...clip.ch['FY' + side]);
        const a = new T.Vector3((side === 'R' ? 1 : -1) * .235 + clamp(x * leg * .45, -.065, .065), 0, .66 + leg * .86 + clamp(z * leg * .65, -.25, .25));
        a.applyAxisAngle(new T.Vector3(0, 1, 0), c.yaw).add(c.pos);
        const hit = scene.support(a.x, a.z, c.pos.y + .6, 1.8);
        a.y = (hit?.y ?? c.pos.y) + .065 + clamp((sample(clip, 'FY' + side, p) - low) * leg * .55, 0, .12);
        return a;
    }
    AegisActionMotion.crawlFoot = crawlFoot;
    function crawlBody(s) {
        const c = s.ctrl, st = s.motion, q = root.GSpecialMotion?.actions?.crawl;
        if (!q || c.prone < .6 || c.speed < .06 || c.supine)
            return;
        const w = ease((c.prone - .6) / .4) * clamp(c.speed / .4), p = st.phase % 1, b = (n) => s.char.bone(n);
        b('hips').rotation.z += clamp(sample(q, 'PY', p), -.04, .04) * w;
        b('chest').rotation.y += clamp(sample(q, 'TT', p), -.14, .14) * w;
    }
    AegisActionMotion.crawlBody = crawlBody;
    let openPose;
    function hands(s) {
        const c = s.ctrl, st = s.motion, q = root.GSpecialMotion?.actions?.crawl;
        if (!q || !st || c.prone < .7 || c.speed < .06 || c.supine || c.vault || c._balanceBusy || c.reload >= 0 || c.ads > .25 || c.triggerHeld)
            return false;
        const T = root.THREE, leg = s.char.metrics.thigh + s.char.metrics.shin, scene = root.GPhysics.get(c._physicsWorld), H = s.rig.handTargets || (s.rig.handTargets = { R: new T.Matrix4(), L: new T.Matrix4() }), p = st.phase % 1;
        if (!openPose) {
            openPose = {};
            for (const key of ['thumb', 'index', 'middle', 'ring', 'pinky'])
                openPose[key] = [0, .12, .28, .12, 0];
        }
        s.rig.handPoses = s.rig.handPoses || {};
        for (const side of s.gun ? ['L'] : ['R', 'L']) {
            const a = q.ch['HZ' + side], mean = a.reduce((x, y) => x + y, 0) / a.length;
            const x = (side === 'R' ? 1 : -1) * .24, z = -.48 + clamp((sample(q, 'HZ' + side, p) - mean) * leg * .85, -.22, .22), lift = clamp((sample(q, 'HY' + side, p) - Math.min(...q.ch['HY' + side])) * leg * .6, 0, .10);
            const P = new T.Vector3(x, 0, z).applyAxisAngle(new T.Vector3(0, 1, 0), c.yaw).add(c.pos), hit = scene.support(P.x, P.z, c.pos.y + .65, 1.8);
            P.y = (hit?.y ?? c.pos.y) + .065 + lift;
            const shoulder = s.char.bone('shoulder' + side).getWorldPosition(new T.Vector3()), r = s.char.rest;
            const dist = (a, b) => Math.hypot(...r[a].map((v, i) => v - r[b][i]));
            const reach = (dist('shoulder' + side, 'elbow' + side) + dist('elbow' + side, 'wrist' + side)) * .955, dy = P.y - shoulder.y;
            const horizontal = Math.sqrt(Math.max(.005, reach * reach - dy * dy)), dx = P.x - shoulder.x, dz = P.z - shoulder.z, d = Math.hypot(dx, dz);
            if (d > horizontal) {
                P.x = shoulder.x + dx * horizontal / d;
                P.z = shoulder.z + dz * horizontal / d;
            }
            const local = new T.Quaternion().setFromEuler(new T.Euler(0, 0, side === 'R' ? -.12 : .12)), yaw = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), c.yaw);
            H[side].compose(P, yaw.multiply(local), new T.Vector3(1, 1, 1));
            s.rig.handPoses[side] = openPose;
        }
        if (!s.gun)
            s.rig.triggerPose = null;
        return true;
    }
    AegisActionMotion.hands = hands;
})(AegisActionMotion || (AegisActionMotion = {}));
globalThis.GActionMotion = AegisActionMotion;
