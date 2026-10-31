"use strict";
/** Collision-verified climbing: perception and movement both use the Rapier scene. */
var AegisTraversal;
(function (AegisTraversal) {
    const root = globalThis, T = () => root.THREE;
    const smooth = (x) => {
        x = Math.max(0, Math.min(1, x));
        return x * x * (3 - 2 * x);
    };
    /** v23: кусочно-кубическая кривая по ключам [u, v] (касательные Катмулла–Рома, на концах 0):
     * движение тела без остановок на каждом ключе. */
    function curve(k, u, mono = false) {
        const n = k.length;
        if (u <= k[0][0])
            return k[0][1];
        if (u >= k[n - 1][0])
            return k[n - 1][1];
        let i = 0;
        while (i < n - 2 && u > k[i + 1][0])
            i++;
        const u0 = k[i][0], v0 = k[i][1], u1 = k[i + 1][0], v1 = k[i + 1][1], h = Math.max(1e-6, u1 - u0), t = (u - u0) / h;
        let m0 = i > 0 ? ((v1 - k[i - 1][1]) / (u1 - k[i - 1][0])) * h : 0;
        let m1 = i + 2 < n ? ((k[i + 2][1] - v0) / (k[i + 2][0] - u0)) * h : 0;
        if (mono) {
            // монотонный вариант (условие Фрича–Карлсона): ход вперёд без откатов назад
            const dv = v1 - v0;
            if (Math.abs(dv) < 1e-9)
                m0 = m1 = 0;
            else {
                m0 = Math.max(0, Math.min(3, m0 / dv)) * dv;
                m1 = Math.max(0, Math.min(3, m1 / dv)) * dv;
            }
        }
        const t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * v1 + (t3 - t2) * m1;
    }
    AegisTraversal.curve = curve;
    /** v23: горизонтальный ход по перелазу (доля пути p0→p1): шаг к стенке с упором рук
     * (до безопасного подхода a.pre), подъём у стенки, перенос корпуса через верх, приземление
     * к u ≈ 0,88. Монотонная кривая — без остановок и откатов. */
    function travel(a, u) {
        const D = a.dist || 1, s0 = Math.min(a.pre || 0, D), ua = a.uApex || 0.36;
        // ключи постоянны на весь перелаз — считаются один раз (без выделений памяти в кадре)
        let K = a._tk;
        if (!K || K.D !== D || K.s0 !== s0 || K.ua !== ua) {
            K = a._tk = [[0, 0], [0.17, 0.75 * s0], [ua - 0.03, s0], [ua + 0.14, s0 + 0.5 * (D - s0)], [0.88, D]];
            K.D = D;
            K.s0 = s0;
            K.ua = ua;
        }
        // до выхода на высоту кромки — не дальше безопасного подхода к стенке
        const x = curve(K, u, true);
        return Math.max(0, Math.min(D, u < ua - 0.03 ? Math.min(x, s0) : x)) / D;
    }
    /** v23: кривые тела на перелазе — общие для тела (вид со стороны) и глаз (вид от первого лица).
     * Высоты — мировые: таз не «ложится» на кромку, а проходит над ней, корпус наклонён умеренно. */
    function body(c, M) {
        const a = c.vault;
        if (!a || !M)
            return null;
        const u = Math.max(0, Math.min(1, a.t / a.dur)), g0 = a.p0.y, g1 = a.p1.y - 0.015, top = a.top, Hh = M.hipY || 0.95;
        // ключи кривых постоянны на весь перелаз (опоры, кромка, рост) — считаются один раз
        const bk = a._bk;
        if (bk && bk.Hh === Hh)
            return out(a, u, bk, M, Hh);
        let hip, lean;
        if (a.style === "mantle") {
            hip = [[0, g0 + Hh - 0.03], [0.15, g0 + Hh - 0.15], [0.42, top + 0.32], [0.62, top + 0.45], [0.82, top + Hh - 0.25], [1, top + Hh - 0.06]];
            lean = [[0, 0.12], [0.15, 0.5], [0.42, 0.68], [0.62, 0.55], [0.82, 0.3], [1, 0.1]];
        }
        else if (a.style === "climbOver") {
            /* v25: высокая ограда (1,3–2,1 м): присед и прыжок к кромке, вис на руках и
               подтягивание (ноги упираются в стенку), перенос правой ноги через верх, верхом
               на кромке, перенос левой, вис с той стороны и соскок с амортизацией */
            const hang = Math.max(g0 + Hh - 0.02, top - 0.95);
            hip = [[0, g0 + Hh - 0.03], [0.1, g0 + Hh - 0.16], [0.2, Math.min(hang + 0.08, top - 0.6)], [0.34, top - 0.5], [0.46, top - 0.14], [0.56, top + 0.02], [0.64, top + 0.08], [0.72, top + 0.03], [0.8, Math.max(g1 + Hh - 0.04, top - 0.55)], [0.87, g1 + Hh - 0.32], [0.94, g1 + Hh - 0.22], [1, g1 + Hh - 0.06]];
            lean = [[0, 0.1], [0.1, 0.3], [0.2, 0.12], [0.34, 0.3], [0.46, 0.62], [0.56, 0.78], [0.64, 0.66], [0.72, 0.32], [0.8, 0.22], [0.87, 0.42], [0.94, 0.3], [1, 0.1]];
        }
        else if (a.style === "stepOver") {
            hip = [[0, g0 + Hh - 0.03], [0.2, g0 + Hh - 0.1], [0.45, Math.max(top + 0.42, g0 + Hh - 0.02)], [0.62, Math.max(top + 0.4, g1 + Hh - 0.04)], [0.85, g1 + Hh - 0.16], [1, g1 + Hh - 0.06]];
            lean = [[0, 0.1], [0.2, 0.3], [0.45, 0.28], [0.65, 0.2], [0.85, 0.22], [1, 0.1]];
        }
        else {
            // упор руками у кромки и шаг правой на верх при низком тазе, затем толчок вверх-вперёд
            hip = [[0, g0 + Hh - 0.03], [0.14, g0 + Hh - 0.14], [0.28, Math.max(g0 + Hh - 0.1, top + 0.08)], [0.42, top + 0.43], [0.54, top + 0.46], [0.7, Math.max(top + 0.26, g1 + Hh - 0.1)], [0.86, g1 + Hh - 0.17], [1, g1 + Hh - 0.06]];
            lean = [[0, 0.12], [0.14, 0.55], [0.3, 0.66], [0.42, 0.56], [0.55, 0.42], [0.7, 0.3], [0.86, 0.3], [1, 0.12]];
        }
        const k = (a._bk = { Hh, hip, lean, fit: { ln: 0, fw: 0, sq: 0, d: 0, ok: true } });
        k.fit = reachFit(a, M, hip, lean, !!c.armed);
        return out(a, u, k, M, Hh);
    }
    AegisTraversal.body = body;
    /** v23: упор ладонями. Подход к стенке бывает ограничен (соседние мешки, угол окопа, капсула
     * держится в 10 см от грани), и ладони на кромке оказываются дальше вытянутой руки — тогда
     * руки не доставали и висели в воздухе. Подбирается наименьшее усилие: сильнее наклон
     * корпуса, таз чуть вперёд (капсула шире торса) и ниже — плечи над кромкой; одно и то же
     * для тела и камеры. */
    function reachFit(a, M, hip, lean, armed) {
        const r = { ln: 0, fw: 0, sq: 0, d: 0, ok: true }, H = a.hands;
        if (!H || !(H.R || H.L) || !a.p0)
            return r;
        const J = M.joints, hy = M.hipY || 0.95, sx = M.shoulderX || 0.2;
        const reach = (M.upperArm || 0.3) + (M.foreArm || 0.26);
        // звенья корпуса от тазобедренного шарнира до плеча: [вверх, вперёд]; доли наклона — как в позе
        const seg = J && J.spine && J.chest && J.shoulderR
            ? [[J.spine[1] - J.hips[1], J.hips[2] - J.spine[2]], [J.chest[1] - J.spine[1], J.spine[2] - J.chest[2]], [J.shoulderR[1] - J.chest[1], J.chest[2] - J.shoulderR[2]]]
            : [[(M.waistY || 1.09) - hy, 0], [(M.chestY || 1.31) - (M.waistY || 1.09), 0], [(M.shoulderY || 1.45) - (M.chestY || 1.31), 0]];
        const kk = [0.22, 0.38, 0.4], D = a.dist || 1, dx = a.dx, dz = a.dz, p0 = a.p0;
        const hs = [];
        for (const [side, sg] of [["R", 1], ["L", -1]]) {
            const h = H[side];
            if (h)
                hs.push([(h.x - p0.x) * dx + (h.z - p0.z) * dz, (h.x - p0.x) * -dz + (h.z - p0.z) * dx, h.y, sg]);
        }
        // без оружия в руках на низкой преграде можно и поглубже наклониться к ней — опереться ладонями
        const lim = a.style === "mantle" ? [0.06, 0.2, 0.04] : a.style === "climbOver" ? [0.12, 0.3, 0.08] : a.style === "stepOver" ? (armed ? [0.1, 0.4, 0.1] : [0.14, 0.62, 0.16]) : [0.14, 0.45, 0.1];
        const dist = (e) => {
            let worst = 0;
            for (const u of a.style === "climbOver" ? [0.3, 0.38, 0.46] : [0.2, 0.26, 0.32]) {
                const L = curve(lean, u) + lim[1] * e;
                let al = travel(a, u) * D + lim[0] * e, y = curve(hip, u) - lim[2] * e, ang = 0;
                for (let i = 0; i < 3; i++) {
                    ang += kk[i] * L;
                    const c = Math.cos(ang), s = Math.sin(ang);
                    y += seg[i][0] * c - seg[i][1] * s;
                    al += seg[i][0] * s + seg[i][1] * c;
                }
                for (const h of hs)
                    worst = Math.max(worst, Math.hypot(h[0] - al, h[2] - y, h[1] - h[3] * sx));
            }
            return worst;
        };
        let e = 0, d = dist(0);
        while (d > reach * 0.9 && e < 1)
            d = dist((e = Math.min(1, e + 0.1)));
        r.ln = lim[1] * e;
        r.fw = lim[0] * e;
        r.sq = lim[2] * e;
        r.d = d / reach;
        r.ok = d <= reach * 1.02;
        /* низкая преграда (по колено–бедро), а до кромки не дотянуться без глубокого поклона:
           перешагивание/подъём без упора — оружие остаётся в руках, без оружия руки свободны (a.handsOff) */
        if (!r.ok && (a.h || 0) < 0.8) {
            r.ln = r.fw = r.sq = 0;
            a.handsOff = true;
        }
        return r;
    }
    /** результат body(): один объект на перелаз (читается сразу, в том же кадре) */
    function out(a, u, k, M, Hh) {
        const o = a._bo || (a._bo = { u: 0, hipW: 0, lean: 0, eyeW: 0, eyeFwd: 0, fwd: 0 });
        const f = k.fit, b = a.style === "climbOver" ? smooth((u - 0.12) / 0.14) * (1 - smooth((u - 0.5) / 0.14)) : smooth((u - 0.02) / 0.14) * (1 - smooth((u - 0.3) / 0.16));
        const hipW = curve(k.hip, u) - f.sq * b, ln = curve(k.lean, u) + f.ln * b, neck = (M.eyeY || 1.65) - Hh;
        o.u = u;
        o.hipW = hipW;
        o.lean = ln;
        o.fwd = f.fw * b;
        o.eyeW = hipW + neck * Math.cos(ln);
        o.eyeFwd = neck * Math.sin(ln) * 0.75;
        return o;
    }
    /** v20: `dir` lets AI soldiers vault along their movement direction
     * (they often move while facing a threat); `dir.npc` relaxes the
     * player-only stamina gate. */
    function tryStart(c, world, phys, dir) {
        const npc = !!dir?.npc;
        // v23: причина отказа — для отладки и тестов (c._vaultFail)
        const no = (r) => ((c._vaultFail = r), false);
        if (c.vault ||
            c.treating ||
            c.dragging ||
            c.mounted ||
            c.ladder ||
            c.reload >= 0 ||
            c.legDown ||
            (c.armK ?? 0) > 1.5 ||
            (c.stamina ?? 1) < (npc ? 0.3 : 0.9) ||
            !c.grounded)
            return no("state");
        /* v26: раненый перелезает, но медленнее (раньше любое ранение руки/ноги — даже боль
           и шок давали injArm — запрещало перелаз вовсе: «через забор не перелезть»).
           Не может только с перебитой ногой или почти бесполезной рукой. */
        const injK = Math.min(1, Math.max(0, ((c.armK ?? 0) - 0.25) / 0.9)) * 0.45 + Math.min(1, c.limp || 0) * 0.5;
        const useDir = !!dir && Number.isFinite(dir.x) && Number.isFinite(dir.z) && Math.hypot(dir.x, dir.z) > 1e-3;
        const dl = useDir ? Math.hypot(dir.x, dir.z) : 1;
        const physics = root.GPhysics.get(world), dx = useDir ? dir.x / dl : -Math.sin(c.yaw), dz = useDir ? dir.z / dl : -Math.cos(c.yaw), yawV = Math.atan2(-dx, -dz), start = c.pos.clone();
        // Update query broadphase before the very first probe.
        physics.sim.propagateModifiedBodyPositionsToColliders();
        // v22: игрок «видит» преграду чуть раньше (1,25 м) — перелезание не срывается на подходе
        let wall = physics.ray({ x: start.x, y: start.y + 0.43, z: start.z }, { x: dx, y: 0, z: dz }, npc ? 1.06 : 1.25);
        // Bots also probe knee-low (obstacles 0.3..0.43 m the KCC cannot step).
        if (!wall && npc)
            wall = physics.ray({ x: start.x, y: start.y + 0.24, z: start.z }, { x: dx, y: 0, z: dz }, 1.06);
        /* v25: щит или штакетник с зазором снизу (на склоне у конца пролёта нижняя кромка
           выше 0,43 м) — пролезть под ним нельзя, а нижний луч проходит мимо: ищем выше */
        for (const hy of [0.8, 1.15]) {
            if (wall)
                break;
            const hw = physics.ray({ x: start.x, y: start.y + hy, z: start.z }, { x: dx, y: 0, z: dz }, npc ? 1.06 : 1.25);
            if (hw && Math.abs(hw.normal.y) < 0.3)
                wall = hw;
        }
        if (!wall || wall.normal.y > 0.6)
            return no("no-wall");
        /* v22: жердевая ограда (physics.rungs): нижняя жердь — ступенька, на склоне
           верхняя жердь бывает выше 1,25 м от ног — допуск +0,2 м */
        const vMax = phys.vaultMax + (physics.rungs?.has(wall.collider?.handle) ? 0.2 : 0);
        let near = wall.timeOfImpact + 0.16, x = start.x + dx * near, z = start.z + dz * near;
        let topHit = physics.support(x, z, start.y + vMax + 0.15, vMax + 0.5);
        /* v22: тонкая преграда (жердевая ограда, дощатая стенка 4–12 см): в 16 см за
           передней гранью луч вниз уже мимо кромки — ищем её ближе к грани */
        const lowH = npc ? 0.3 : phys.stepUp;
        if (!topHit || topHit.y - start.y <= lowH) {
            for (const k of [0.03, 0.06, 0.1]) {
                const nn = wall.timeOfImpact + k, xx = start.x + dx * nn, zz = start.z + dz * nn;
                const th = physics.support(xx, zz, start.y + vMax + 0.15, vMax + 0.5);
                if (th && th.y - start.y > lowH && th.y - start.y <= vMax) {
                    near = nn;
                    x = xx;
                    z = zz;
                    topHit = th;
                    break;
                }
            }
        }
        /* v25: высокая тонкая ограда (горбыль, щиты, штакетник 1,3–2,1 м) — перелезть
           с подтягиванием (climbOver). Кромку ищем лучом сверху у передней грани; луч,
           начатый внутри стены (простенок над окном), даёт попадание в начале — отказ. */
        const cMax = phys.climbMax ?? 2.15;
        let climb = false;
        if ((!topHit || topHit.y - start.y <= lowH || topHit.y - start.y > vMax) && cMax > vMax) {
            for (const k of [0.03, 0.06, 0.1, 0.16]) {
                const nn = wall.timeOfImpact + k, xx = start.x + dx * nn, zz = start.z + dz * nn;
                const th = physics.support(xx, zz, start.y + cMax + 0.3, cMax + 0.7);
                if (th && th.y - start.y > vMax && th.y - start.y <= cMax && th.normal.y > 0.5) {
                    near = nn;
                    x = xx;
                    z = zz;
                    topHit = th;
                    climb = true;
                    break;
                }
            }
        }
        if (!topHit)
            return no("no-top");
        const top = topHit.y, h = top - start.y;
        // v20: the KCC auto-steps only 0.32 m, so for bots the gap 0.32..stepUp
        // (low sandbag rows on slopes, curbs) used to be a dead end: no step, no
        // vault, the bot ran in place and tripped. NPCs step over from 0.3 m.
        if (h <= (npc ? 0.3 : phys.stepUp) || h > (climb ? cMax : vMax))
            return no("height");
        if (climb && ((c.stamina ?? 1) < (npc ? 0.45 : 0.9) || c.crouch > 0.5 || (c.armK ?? 0) > 1.1))
            return no("climb-state");
        let exit = near;
        while (exit < near + 2.7) {
            const p = physics.support(start.x + dx * exit, start.z + dz * exit, top + 0.13, h + 0.7);
            if (!p || p.y < top - 0.28)
                break;
            exit += 0.13;
        }
        const thin = exit - near < 0.95;
        /* высокую преграду — только тонкую: на широкий верх (крыша сарая) не лезем */
        if (climb && exit - near > 0.45)
            return no("climb-thick");
        let kind = thin ? "over" : "mantle", distance = thin ? exit + (climb ? 0.42 : 0.48) : near + 0.35;
        let landing = physics.support(start.x + dx * distance, start.z + dz * distance, top + 0.15, h + 2);
        if (!landing || top - landing.y > (climb ? cMax + 0.35 : 1.65))
            return no("landing");
        const end = new (T().Vector3)(start.x + dx * distance, landing.y + 0.015, start.z + dz * distance);
        /* v23: сразу за оградой низкая помеха (бревно, бордюр, ящик) — приземление чуть дальше,
           а не отказ (раньше переходило в «подъём на верх», которого у тонкой ограды нет) */
        if (thin && !physics.fits(c, end, 1.15)) {
            for (const extra of [0.2, 0.4]) {
                const dd = distance + extra, L = physics.support(start.x + dx * dd, start.z + dz * dd, top + 0.15, h + 2);
                if (!L || top - L.y > (climb ? cMax + 0.35 : 1.65))
                    continue;
                const e2 = { x: start.x + dx * dd, y: L.y + 0.015, z: start.z + dz * dd };
                if (physics.fits(c, e2, 1.15)) {
                    distance = dd;
                    landing = L;
                    end.set(e2.x, e2.y, e2.z);
                    break;
                }
            }
        }
        /* v25: за край карты не перелезаем (иначе позицию прижмёт к границе внутри ограды) */
        const bd = world && world.bounds;
        if (bd && (end.x < bd.x0 + 0.3 || end.x > bd.x1 - 0.3 || end.z < bd.z0 + 0.3 || end.z > bd.z1 - 0.3))
            return no("bounds");
        const apex = Math.max(top + 0.09, end.y), // v22: +3 см запаса над кромкой
        height = 0.94;
        if (!physics.fits(c, { x: start.x, y: apex, z: start.z }, height) ||
            !physics.fits(c, { x: end.x, y: apex, z: end.z }, height))
            return no("apex-fit");
        if (!physics.fits(c, end, 1.15)) {
            if (climb)
                return no("climb-landing");
            kind = "mantle";
            distance = near + 0.28;
            landing = physics.support(start.x + dx * distance, start.z + dz * distance, top + 0.15, 0.3);
            if (!landing)
                return no("mantle-landing");
            end.set(start.x + dx * distance, landing.y + 0.015, start.z + dz * distance);
            if (!physics.fits(c, end, height))
                return no("mantle-fit");
        }
        // Check the entire swept corridor, not just start and landing capsules.
        for (let i = 0; i <= 12; i++) {
            const q = start.clone().lerp(end, i / 12);
            q.y = apex;
            if (!physics.fits(c, q, height))
                return no("corridor");
        }
        let hands = {};
        // v22: опора для ладоней — с допуском (мешки, жерди, бревно): одна рука
        // нашла опору — вторая ставится зеркально; раньше любая неровность
        // кромки отменяла перелезание
        // v23: ладони — у передней кромки (7 см от грани), где до них дотягиваются руки;
        // нет опоры у кромки — прежняя точка (near)
        for (const hd of climb ? [near, wall.timeOfImpact + 0.03] : [wall.timeOfImpact + 0.07, near]) {
            hands = {};
            const bx = start.x + dx * hd, bz = start.z + dz * hd;
            for (const side of ["R", "L"]) {
                const sg = side === "R" ? 1 : -1, hx = bx + Math.cos(yawV) * sg * 0.17, hz = bz - Math.sin(yawV) * sg * 0.17;
                const support = physics.support(hx, hz, top + 0.15, 0.3);
                if (!support ||
                    Math.abs(support.y - top) > 0.14 ||
                    support.normal.y < 0.5)
                    continue;
                hands[side] = { x: hx, y: support.y + 0.045, z: hz };
            }
            if (hands.R || hands.L) {
                for (const [a, b, sg] of [["R", "L", -1], ["L", "R", 1]])
                    if (!hands[b])
                        hands[b] = { x: bx + Math.cos(yawV) * sg * 0.17, y: hands[a].y, z: bz - Math.sin(yawV) * sg * 0.17 };
                break;
            }
        }
        if (!hands.R && !hands.L)
            return no("hands");
        /* v23: безопасный подход к стенке во время подъёма (корпус идёт вперёд, а не
           поднимается столбом на месте); капсула не должна задеть грань ни на одной высоте */
        const R = c.PHYS?.radius ?? 0.27;
        let pre = Math.max(0, wall.timeOfImpact - R - 0.1);
        for (const k of [1, 0.5, 0]) {
            const pp = pre * k, px = start.x + dx * pp, pz = start.z + dz * pp;
            let ok = true;
            for (const f of [0, 0.35, 0.7, 1])
                if (!physics.fits(c, { x: px, y: start.y + (apex - start.y) * f + 0.02, z: pz }, height)) {
                    ok = false;
                    break;
                }
            if (ok) {
                pre = pp;
                break;
            }
            if (k === 0)
                pre = 0;
        }
        const dist = Math.hypot(end.x - start.x, end.z - start.z);
        c.vault = {
            t: 0,
            dur: (climb ? 2.25 + (h - 1.25) * 0.9 : kind === "mantle" ? 1.45 + h * .3 : h <= .67 ? 0.92 + h * .3 : 1.0 + h * .2) * (1 + injK),
            inj: injK,
            near,
            exit,
            toi: wall.timeOfImpact,
            pre,
            dist,
            uApex: climb ? 0.52 : kind === "mantle" ? 0.4 : 0.36,
            uDown: 0.7,
            kind,
            style: climb ? "climbOver" : kind === "mantle" ? "mantle" : h <= .67 ? "stepOver" : "speedVault",
            h,
            top,
            p0: start,
            p1: end,
            apex,
            dx,
            dz,
            v0: Math.hypot(c.vel.x, c.vel.z),
            blockedT: 0,
            rapier: true,
            hands,
            supportCollider: topHit.collider,
            npc,
            yaw0: c.yaw,
            yaw: yawV,
        };
        /* v23: спуск начинается, когда капсула прошла дальнюю кромку */
        {
            const v = c.vault, xd = kind === "over" ? exit + R * 0.7 : near + R * 0.3;
            let ud = 0.9;
            for (let uu = v.uApex + 0.05; uu <= 0.9; uu += 0.01)
                if (travel(v, uu) * dist >= xd) {
                    ud = uu;
                    break;
                }
            v.uDown = Math.max(v.uApex + 0.05, Math.min(0.9, ud));
        }
        c._vaultFail = null;
        c.stamina = Math.max(0, (c.stamina ?? 1) - (climb ? (npc ? 0.3 : 0.55) + (h - 1.25) * 0.5 : (npc ? 0.35 : 0.7) + h * 0.9) * (1 + injK * 0.6));
        c._jump12 = null;
        c.vel.set(0, 0, 0);
        c._motorVX = 0;
        c._motorVZ = 0;
        c.ads = 0;
        c._traversalHeight = height;
        return true;
    }
    AegisTraversal.tryStart = tryStart;
    /** v25: окно упора/хвата руками [начало, нарастание, конец, спад] в долях перелаза —
     * общее для тела (animator) и рук от первого лица (bodycam) */
    function handWindow(a, fp) {
        return a && a.style === "climbOver" ? [0.1, 0.1, 0.7, 0.12] : fp ? [0.04, 0.14, 0.48, 0.2] : [0.04, 0.14, 0.58, 0.18];
    }
    AegisTraversal.handWindow = handWindow;
    // рабочие векторы update() (без выделений памяти в каждом кадре)
    let _old = null, _des = null, _dd = null;
    function update(c, world, dt) {
        const a = c.vault;
        if (!a || dt <= 0)
            return;
        if (a.supportCollider && !a.supportCollider.isValid()) {
            c.vault = null;
            c._traversalHeight = undefined;
            c._vaultHands = null;
            c.vaultTuck = 0;
            c.vaultRoll = 0;
            c.vaultDip = 0;
            c.grounded = false;
            c._vaultResult = "support-lost";
            return;
        }
        const p = root.GPhysics.get(world), old = (_old || (_old = new (T().Vector3)())).copy(c.pos);
        a.t = Math.min(a.dur, a.t + dt);
        const u = a.t / a.dur;
        if (a.npc && Number.isFinite(a.yaw)) {
            // AI facing would keep tracking the threat: the body turns into the
            // vault over 0.2 s and holds the vault heading until landing.
            const k = smooth(a.t / 0.2), d = Math.atan2(Math.sin(a.yaw - a.yaw0), Math.cos(a.yaw - a.yaw0));
            c.yaw = a.yaw0 + d * k;
            c._facingVelocity = 0;
        }
        /* v23: корпус идёт вперёд всё время: подход к стенке с упором рук, подъём до
           высоты кромки (дальше стенки капсула не заходит, пока не поднялась), перенос
           через верх и спуск, как только капсула прошла дальнюю кромку. Сквозь преграду
           по-прежнему не проходит: путь проверен в tryStart, движение — через KCC. */
        const x = travel(a, u), up = smooth((u - 0.04) / (a.uApex - 0.04)), down = smooth((u - a.uDown) / (1 - a.uDown));
        const desired = (_des || (_des = new (T().Vector3)())).copy(a.p0).lerp(a.p1, x);
        desired.y = u < a.uDown ? a.p0.y + (a.apex - a.p0.y) * up : a.apex + (a.p1.y - a.apex) * down;
        p.displace(c, (_dd || (_dd = new (T().Vector3)())).copy(desired).sub(old), dt);
        const error = c.pos.distanceTo(desired);
        a.blockedT = error > 0.055 ? a.blockedT + dt : 0;
        c.vaultTuck = smooth(u / 0.12) * (1 - smooth((u - 0.85) / 0.15)) * 0.45;
        c.vaultRoll = Math.sin(Math.PI * u) * 0.06;
        /* взгляд вниз на руки в упоре (вид от первого лица) */
        c.vaultDip = a.style === "climbOver"
            /* на подтягивании взгляд на кромку, верхом — вниз, на место приземления */
            ? 0.22 * smooth((u - 0.06) / 0.1) * (1 - smooth((u - 0.3) / 0.12)) - 0.55 * smooth((u - 0.5) / 0.1) * (1 - smooth((u - 0.8) / 0.12))
            : -(a.style === "stepOver" ? 0.4 : 0.62) * smooth((u - 0.02) / 0.12) * (1 - smooth((u - 0.36) / 0.22));
        c.speed = 0;
        c.vel.set(0, 0, 0);
        if (a.blockedT > 0.2 || u >= 1) {
            const success = a.blockedT <= 0.2 && c.pos.distanceTo(a.p1) < 0.18;
            c.vault = null;
            c._vaultHands = null;
            c._traversalHeight = undefined;
            c.vaultTuck = 0;
            c.vaultRoll = 0;
            c.vaultDip = 0;
            c.grounded = false;
            c.landV = (c.landV || 0) - (success ? 0.65 : 0);
            c._motorVX = 0;
            c._motorVZ = 0;
            if (success && !p.fits(c, c.pos, 1.72)) {
                c.crouch = 1;
                c.crouchWant = true;
            }
            c._vaultResult = success ? "landed" : "blocked";
        }
    }
    AegisTraversal.update = update;
})(AegisTraversal || (AegisTraversal = {}));
globalThis.GTraversal = AegisTraversal;
