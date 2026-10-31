
/* ==========================================================================
   МОДУЛЬ: soldier/life.js
   ========================================================================== */
/* ============================================================================
   «Жизнь» бойца, которым не управляет игрок.

   Внимание. Боец замечает оператора (свободную камеру или бойца под
   управлением), когда тот подходит или стоит в поле зрения: сначала
   прыгают глаза, за ними — голова, при большом угле — корпус, а если
   собеседник зашёл за спину — боец переступает и разворачивается.
   Взгляд не «прилипает»: боец смотрит несколько секунд, отводит глаза,
   снова возвращается. Глаза делают микросаккады, веки моргают (чаще —
   при испуге и после резкого поворота головы).

   Реакции. Выстрел рядом — вздрагивание (плечи вверх, голова вниз,
   моргание), пуля рядом — присел, поднял оружие в «низкую готовность»,
   смотрит на стрелка. Ствол, направленный на бойца, он замечает и
   смотрит на стрелка. Ранение товарища — тревога.

   Жесты в строю: перехват оружия, осмотр автомата, поправить плитник,
   размять шею, оглянуться, перекинуться взглядом с соседом, переминание.
   Всё — добавки к процедурной позе (anim/locomotion.js) и к положению
   оружия: руки по-прежнему держат автомат через IK, поэтому любое
   движение оружия автоматически становится движением рук.
   ========================================================================== */
(function (root, factory) {
  const L = factory(root.GUtil);
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  else root.GLife = L;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  const sat = (x) => clamp(x, 0, 1);
  const smooth = (x) => { x = sat(x); return x * x * (3 - 2 * x); };
  /* колокол 0 -> 1 -> 0 на отрезке [0, 1] с мягкими краями */
  const bell = (u) => (u <= 0 || u >= 1 ? 0 : Math.pow(Math.sin(Math.PI * u), 2));
  /* трапеция: подъём a, спад с b */
  const trap = (u, a, b) => (u <= 0 || u >= 1 ? 0 : smooth(u / a) * (1 - smooth((u - b) / (1 - b))));

  function rng(seed) {
    let s = (Math.floor(Math.abs(seed) * 99991) ^ 0x6d2b79f5) >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  /* Критически задемпфированная пружина, неявная схема: устойчива при любом dt. */
  function spr(o, target, w, dt) {
    const f = 1 + 2 * dt * w, oo = w * w, hoo = dt * oo, hhoo = dt * hoo, det = 1 / (f + hhoo);
    const x = (f * o.x + dt * o.v + hhoo * target) * det;
    o.v = (o.v + hoo * (target - o.x)) * det;
    o.x = x;
    return x;
  }
  /* Недодемпфированная пружина для рывков (вздрагивание, отдача тела). */
  function jolt(o, w, z, dt) {
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) { o.v += (-w * w * o.x - 2 * z * w * o.v) * h; o.x += o.v * h; }
    return o.x;
  }
  const S0 = () => ({ x: 0, v: 0 });

  /* Жесты: длительность (с), вес выбора, пауза до повтора (с). */
  const GESTURES = {
    regrip: { dur: 1.15, w: 1.0, cd: 7 },
    check: { dur: 2.7, w: 0.55, cd: 22 },
    shrug: { dur: 1.3, w: 0.85, cd: 11 },
    neck: { dur: 1.9, w: 0.45, cd: 18 },
    glance: { dur: 2.8, w: 0.8, cd: 9 },
    buddy: { dur: 3.4, w: 0.75, cd: 12 },
    settle: { dur: 2.4, w: 0.7, cd: 10 },
    sling: { dur: 1.6, w: 0.5, cd: 20 }
  };

  function create(THREE, s, opts) {
    const P = (s.char && s.char.preset) || {};
    const r = rng((P.seed || 1) * 0.37 + (s.idleSeed || 0));
    const T = Object.assign({ curious: 0.55 + r() * 0.4, fidget: 0.45 + r() * 0.5, nerve: 0.4 + r() * 0.5 }, P.temper || {});
    const L = {
      THREE, rnd: r, temper: T,
      yaw: S0(), pitch: S0(), torso: S0(), roll: S0(),
      eye: { yaw: 0, pitch: 0, oy: 0, op: 0, next: 0.5 },
      blink: { t: -1, next: 1 + r() * 3, dur: 0.17, amt: 0, half: 0 },
      focus: null,                      // { kind, pos, until, prio }
      viewer: { interest: 0, nextGlance: 1 + r() * 3, seen: false, lookUntil: 0 },
      alert: 0, alertUntil: -1, crouchUntil: -1, readyUntil: -1,
      startle: S0(), habit: 0, lastStartle: -9,
      gesture: null, nextGesture: 4 + r() * 8, cool: {},
      turnHold: 0, turnTo: null,
      lastHeadYaw: 0,
      /* выход для позы (poseSoldier) и оружия (placeWeapon) */
      out: {
        yaw: 0, pitch: 0, torso: 0, roll: 0, shrug: 0, flinch: 0, shift: 0, dip: 0,
        gunP: new THREE.Vector3(), gunR: new THREE.Vector3(),
        blink: 0, ready: 0, crouch: false, eyeTarget: null
      },
      _v: new THREE.Vector3(), _w: new THREE.Vector3(), _h: new THREE.Vector3(),
      _eye: new THREE.Vector3(), _gz: new THREE.Vector3(), _m: new THREE.Matrix4(), _q: new THREE.Quaternion()
    };
    return L;
  }

  /* Точка головы бойца в мире (центр головы, чуть выше атланта). */
  function headPos(s, out) {
    const h = s.char.bone('head');
    return h.localToWorld(out.set(0, 0.035 * (s.char.scale || 1), -0.02));
  }

  /* Направление на точку в системе корпуса: yaw (0 — прямо, + — влево),
     pitch (+ — вверх). Корпус смотрит в -Z, курс — c.yaw. */
  function relAngles(from, to, bodyYaw) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const yaw = wrap(Math.atan2(-dx, -dz) - bodyYaw);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz) || 1e-6);
    return { yaw, pitch, dist: Math.hypot(dx, dy, dz) };
  }

  /* Ближайшее расстояние от точки до отрезка траектории пули. */
  function segDist(p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const l2 = abx * abx + aby * aby + abz * abz || 1e-9;
    const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2, 0, 1);
    return Math.hypot(p.x - a.x - abx * t, p.y - a.y - aby * t, p.z - a.z - abz * t);
  }

  function setFocus(L, kind, pos, dur, prio, t) {
    if (L.focus && L.focus.prio > prio && L.focus.until > t) return false;
    L.focus = { kind, pos: pos.clone ? pos.clone() : pos, until: t + dur, prio, get: null };
    return true;
  }

  function startle(L, k, t) {
    const T = L.temper;
    /* привыкание: частые выстрелы пугают всё меньше */
    const kk = k * (0.55 + 0.7 * T.nerve) * (1 - 0.75 * L.habit);
    if (kk < 0.08) return;
    if (t - L.lastStartle < 0.35) return;
    L.lastStartle = t;
    L.startle.v += 9.5 * kk;
    L.habit = Math.min(1, L.habit + 0.22 * k);
    blinkNow(L, t, 1);
  }

  function blinkNow(L, t, force) {
    const B = L.blink;
    if (B.t >= 0 && !force) return;
    if (B.t >= 0 && B.t < B.dur * 0.5) return;
    B.t = 0;
    B.dur = 0.14 + L.rnd() * 0.08;
    B.next = t + 1.6 + L.rnd() * 4.8 * (1 - 0.5 * L.alert);
  }

  /* ------------------------------------------------------ события --- */
  /* Выстрел: e = { from, to, shooter } — дульный срез, конец трассы. */
  function onShot(L, s, e, t) {
    if (e.shooter === s) return;
    const hp = headPos(s, L._h);
    const dShooter = hp.distanceTo(e.from);
    const miss = segDist(hp, e.from, e.to);
    if (miss < 1.35) {
      /* пуля прошла рядом: испуг, присесть, оружие наготове */
      startle(L, 1.0, t);
      L.alert = 1;
      L.alertUntil = t + 7 + L.rnd() * 4;
      L.crouchUntil = t + 4.5 + L.rnd() * 3.5;
      L.readyUntil = L.alertUntil;
      setFocus(L, 'shooter', e.from, 3.2 + L.rnd() * 1.5, 3, t);
      L.habit = 0;
    } else if (dShooter < 7) {
      startle(L, U.lerp(0.55, 0.2, dShooter / 7), t);
      if (L.rnd() < 0.5 * L.temper.curious + 0.2) setFocus(L, 'shooter', e.from, 1.3 + L.rnd() * 1.4, 1, t);
    } else if (L.rnd() < 0.25 * L.temper.curious) {
      setFocus(L, 'impact', e.to, 1.2 + L.rnd(), 1, t);
    }
  }
  /* Попадание в товарища (или в самого бойца). */
  function onHit(L, s, e, t) {
    const self = e.victim === s;
    L.alert = 1;
    L.alertUntil = t + (self ? 10 : 8) + L.rnd() * 4;
    L.readyUntil = L.alertUntil;
    L.crouchUntil = t + (self ? 5 : 4) + L.rnd() * 3;
    if (!self) {
      startle(L, 0.8, t);
      setFocus(L, 'victim', e.pos, 1.4 + L.rnd() * 0.6, 2, t);
      L.pendingShooter = { pos: e.from.clone(), at: t + 1.2 + L.rnd() * 0.5 };
    } else {
      setFocus(L, 'shooter', e.from, 3 + L.rnd(), 3, t);
    }
    L.habit = 0;
  }

  /* ------------------------------------------------------- жесты ---- */
  function pickGesture(L, s, env, t) {
    const T = L.temper;
    let tot = 0;
    const list = [];
    for (const k in GESTURES) {
      if ((L.cool[k] || 0) > t) continue;
      if (k === 'buddy' && !env.buddyOf) continue;
      const w = GESTURES[k].w * (k === 'regrip' || k === 'settle' ? 0.6 + T.fidget : 1);
      list.push([k, w]); tot += w;
    }
    if (!list.length) return null;
    let x = L.rnd() * tot;
    for (const [k, w] of list) { x -= w; if (x <= 0) return k; }
    return list[list.length - 1][0];
  }

  function gestureOut(L, s, g, u, o, env, t) {
    const side = g.side;
    switch (g.name) {
      case 'regrip': {
        /* ослабить хват, чуть приподнять и «посадить» автомат обратно */
        const a = trap(u, 0.25, 0.55), b = bell(sat((u - 0.55) / 0.45));
        o.gunP.y += 0.022 * a - 0.008 * b;
        o.gunP.z += -0.012 * a;
        o.gunR.x += 0.07 * a - 0.03 * b;
        o.gunR.z += 0.05 * a * side;
        o.shrug += 0.03 * a;
        break;
      }
      case 'check': {
        /* осмотр: автомат поворачивается к лицу, голова опускается к нему */
        const a = trap(u, 0.22, 0.72);
        o.gunP.y += 0.11 * a;
        o.gunP.z += -0.05 * a;
        o.gunP.x += -0.03 * a;
        o.gunR.x += 0.42 * a;
        o.gunR.y += 0.28 * a;
        o.gunR.z += -0.55 * a;
        if (a > 0.3 && env.gunPoint) o.eyeTarget = env.gunPoint;
        o.pitchAdd += -0.42 * a;
        o.yawAdd += 0.12 * a;
        break;
      }
      case 'shrug': {
        /* поправить плитоноску: плечи вверх-назад, короткий «подброс» груза */
        const a = bell(sat(u / 0.55)), b = bell(sat((u - 0.45) / 0.55));
        o.shrug += 0.13 * a + 0.04 * b;
        o.chestX += -0.05 * a + 0.025 * b;
        o.gunP.y += 0.012 * a;
        o.dip += 0.012 * b;
        break;
      }
      case 'neck': {
        /* размять шею: наклон к плечу и обратно, полуприкрытые веки */
        const a = bell(sat(u / 0.5)) - bell(sat((u - 0.5) / 0.5));
        o.rollAdd += 0.28 * a * side;
        o.pitchAdd += -0.08 * Math.abs(a);
        o.blinkHalf = Math.max(o.blinkHalf, 0.35 * Math.abs(a));
        break;
      }
      case 'glance': {
        /* оглянуться через плечо */
        const a = trap(u, 0.2, 0.7);
        o.yawAdd += side * 1.55 * a;
        o.torsoAdd += side * 0.32 * a;
        o.pitchAdd += 0.05 * a;
        break;
      }
      case 'buddy': {
        /* переглянуться с соседом: взгляд, короткий кивок */
        const a = trap(u, 0.15, 0.8);
        if (env.buddyOf && a > 0.05) {
          const b = env.buddyOf;
          o.focusPos = headPos(b, L._w);
          o.focusW = a;
        }
        o.pitchAdd += -0.09 * bell(sat((u - 0.45) / 0.22));
        break;
      }
      case 'settle': {
        /* перенести вес: заметный сдвиг таза и чуть согнуть колени */
        const a = trap(u, 0.3, 0.6);
        o.shift += side * 0.75 * a;
        o.dip += 0.014 * a;
        o.gunR.z += -0.03 * a * side;
        break;
      }
      case 'sling': {
        /* подтянуть ремень: автомат подтягивается к груди и обратно */
        const a = bell(sat(u / 0.6)), b = bell(sat((u - 0.4) / 0.6));
        o.gunP.y += 0.035 * a;
        o.gunP.z += 0.03 * a;
        o.gunP.x += -0.02 * a;
        o.gunR.z += 0.12 * a;
        o.chestX += -0.03 * b;
        break;
      }
    }
  }

  /* ------------------------------------------------------ кадр ------ */
  /* env: { t, viewerPos, viewerDir, viewerArmed, viewerSelf, buddies, events, gunPoint } */
  function update(L, s, dt, env) {
    const THREE = L.THREE, t = env.t, c = s.ctrl, o = L.out, T = L.temper;
    const hp = headPos(s, L._h);
    const bodyYaw = c.yaw;

    /* события */
    if (env.events) for (const e of env.events) {
      if (e.type === 'shot') onShot(L, s, e, t);
      else if (e.type === 'hit') onHit(L, s, e, t);
    }
    if (L.pendingShooter && t >= L.pendingShooter.at) {
      setFocus(L, 'shooter', L.pendingShooter.pos, 2.5 + L.rnd(), 2, t);
      L.pendingShooter = null;
    }

    /* тревога гаснет */
    if (t > L.alertUntil) L.alert = Math.max(0, L.alert - dt * 0.35);
    L.habit = Math.max(0, L.habit - dt * 0.05);

    /* ------------------------------------------ наблюдение за оператором */
    const V = L.viewer;
    let viewerRel = null;
    if (env.viewerPos && !env.viewerSelf) {
      viewerRel = relAngles(hp, env.viewerPos, bodyYaw);
      const d = viewerRel.dist;
      const inView = Math.abs(viewerRel.yaw) < 1.95;
      const noticed = (inView && d < 9) || d < 2.3;
      /* интерес растёт, когда оператор близко и двигается */
      const gain = noticed ? (0.25 + 0.9 * sat(1 - d / 9)) * (0.6 + 0.8 * T.curious) * (0.6 + 0.6 * sat(env.viewerSpeed / 2)) : -0.35;
      V.interest = sat(V.interest + gain * dt * 0.6);
      /* ствол, направленный на бойца, — повод смотреть на стрелка */
      if (env.viewerArmed && env.viewerDir && d < 30) {
        L._v.subVectors(hp, env.viewerPos).normalize();
        const cosA = L._v.dot(env.viewerDir);
        if (cosA > Math.cos(0.06)) {
          V.muzzle = (V.muzzle || 0) + dt;
          if (V.muzzle > 0.35) {
            setFocus(L, 'viewer', env.viewerPos, 1.2, 2, t);
            L.alert = Math.max(L.alert, 0.35);
            L.alertUntil = Math.max(L.alertUntil, t + 1.5);
          }
        } else V.muzzle = 0;
      }
      if (noticed && t > V.nextGlance && (!L.focus || L.focus.prio < 1 || L.focus.until < t)) {
        const close = d < 3.2;
        const dur = (close ? 2.5 + L.rnd() * 4.5 : 1.2 + L.rnd() * 2.6) * (0.6 + 0.7 * V.interest);
        if (L.rnd() < (close ? 0.55 : 0.3) + 0.5 * V.interest) {
          L.focus = { kind: 'viewer', pos: null, until: t + dur, prio: 0.5 };
          blinkNow(L, t);
          V.nextGlance = t + dur + (close ? 1 + L.rnd() * 3 : 2.5 + L.rnd() * 6) * (1.3 - 0.6 * T.curious);
        } else V.nextGlance = t + 0.8 + L.rnd() * 1.6;
      }
    }

    /* --------------------------------------------------- цель взгляда */
    const F = L.focus && L.focus.until > t ? L.focus : null;
    if (!F) L.focus = null;
    let tYaw = 0, tPitch = 0, fw = 0, fp = null;
    if (F) {
      fp = F.kind === 'viewer' && !F.pos ? env.viewerPos : F.pos;
      if (fp) {
        const a = relAngles(hp, fp, bodyYaw);
        tYaw = a.yaw; tPitch = a.pitch; fw = 1;
      }
    }
    /* жест */
    const G = L.gesture;
    const og = { gunP: o.gunP.set(0, 0, 0), gunR: o.gunR.set(0, 0, 0), shrug: 0, chestX: 0, shift: 0, dip: 0,
      yawAdd: 0, pitchAdd: 0, rollAdd: 0, torsoAdd: 0, blinkHalf: 0, eyeTarget: null, focusPos: null, focusW: 0 };
    const calm = L.alert < 0.15 && !(F && F.prio >= 1) && c.speed < 0.3;
    if (G) {
      G.t += dt;
      const u = G.t / G.dur;
      if (u >= 1 || (!calm && G.name !== 'regrip')) { L.gesture = null; L.nextGesture = t + (3 + L.rnd() * 9) / (0.5 + T.fidget); }
      else gestureOut(L, s, G, u, og, env, t);
    } else if (calm && t > L.nextGesture) {
      const name = pickGesture(L, s, env, t);
      if (name) {
        L.gesture = { name, t: 0, dur: GESTURES[name].dur * (0.85 + L.rnd() * 0.3), side: L.rnd() < 0.5 ? -1 : 1 };
        L.cool[name] = t + GESTURES[name].cd * (0.7 + L.rnd() * 0.6);
        if (name === 'glance' || name === 'neck') blinkNow(L, t);
      } else L.nextGesture = t + 2;
    }
    if (og.focusPos && og.focusW > 0 && !F) {
      const a = relAngles(hp, og.focusPos, bodyYaw);
      tYaw = a.yaw; tPitch = a.pitch; fw = og.focusW; fp = og.focusPos;
    }

    /* поиск в тревоге: взгляд обегает сектор в сторону угрозы */
    if (!fw && L.alert > 0.3) {
      const sweep = Math.sin(t * 0.7 + (s.idleSeed || 0)) * 0.7;
      tYaw = L.lastThreatYaw !== undefined ? L.lastThreatYaw + sweep * 0.5 : sweep;
      tPitch = -0.05;
      fw = 0.8;
    }
    if (F && (F.kind === 'shooter' || F.kind === 'victim')) L.lastThreatYaw = tYaw;

    /* распределение: голова + шея до ±75°, корпус добавляет до ±22°,
       дальше — разворот всем телом */
    const want = tYaw * fw;
    const torsoWant = clamp((Math.abs(want) - 0.85) * Math.sign(want) * 0.55, -0.38, 0.38) + og.torsoAdd;
    const headWant = clamp(want - torsoWant, -1.3, 1.3) + og.yawAdd;
    const pitchWant = clamp(tPitch * fw, -0.55, 0.5) + og.pitchAdd;
    const wHead = F && F.prio >= 2 ? 9 : 5.2;
    spr(L.yaw, headWant, wHead, dt);
    spr(L.pitch, pitchWant, wHead * 0.9, dt);
    spr(L.torso, torsoWant, 2.6, dt);
    spr(L.roll, og.rollAdd, 4, dt);

    /* резкий поворот головы — повод моргнуть */
    if (Math.abs(L.yaw.x - L.lastHeadYaw) > 0.55) { blinkNow(L, t); L.lastHeadYaw = L.yaw.x; }

    /* разворот корпуса к собеседнику или угрозе, если тот за спиной */
    const needTurn = fw > 0.5 && Math.abs(tYaw) > 1.45 && (F ? F.prio >= 0.5 : false);
    L.turnHold = needTurn ? L.turnHold + dt : Math.max(0, L.turnHold - dt * 2);
    if (L.turnHold > (F && F.prio >= 2 ? 0.25 : 1.1)) {
      L.turnTo = wrap(bodyYaw + tYaw * 0.8);
      L.turnHold = 0;
    }

    /* испуг: быстрая пружина вздрагивания */
    const fl = jolt(L.startle, 13, 0.42, dt);

    /* ----------------------------------------------------- моргание */
    const B = L.blink;
    if (B.t < 0 && t > B.next) blinkNow(L, t);
    let bl = 0;
    if (B.t >= 0) {
      B.t += dt;
      const u = B.t / B.dur;
      /* веко падает быстро (35 %), поднимается медленнее */
      bl = u < 0.35 ? smooth(u / 0.35) : 1 - smooth((u - 0.45) / 0.55);
      if (u < 0.45 && u >= 0.35) bl = 1;
      if (u >= 1) { B.t = -1; bl = 0; if (L.rnd() < 0.12) B.next = t + 0.12; }
    }
    B.half = U.damp(B.half, og.blinkHalf + 0.12 * L.alert, 6, dt);

    /* ------------------------------------------------------ выход */
    o.yaw = L.yaw.x; o.pitch = L.pitch.x; o.torso = L.torso.x; o.roll = L.roll.x;
    o.shrug = og.shrug + Math.max(0, fl) * 0.1;
    o.chestX = og.chestX;
    o.flinch = fl;
    o.shift = og.shift;
    o.dip = og.dip + Math.max(0, fl) * 0.02;
    o.gunP.add(L._gz.set(0, 0.018, 0.025).multiplyScalar(Math.max(0, fl)));
    o.blink = Math.max(bl, B.half, L.eyesShut || 0);   // v6: зажмурился (граната, вспышка)
    o.eyeTarget = og.eyeTarget || fp || null;
    o.eyeFocusW = og.eyeTarget ? 1 : fw;
    o.ready = (t < L.readyUntil || L.alert > 0.4) ? 1 : 0;
    o.crouch = t < L.crouchUntil;
    o.alert = L.alert;
    o.turnTo = L.turnTo;
    L.turnTo = null;
    return o;
  }

  /* --------------------------------------------- глаза после позы --- */
  /* Вызывается после того, как поза головы собрана: глаза доворачиваются
     точно в цель (оператор, сосед, автомат) с ограничениями орбиты.
     Без цели — смотрят по голове с микросаккадами. */
  function aimEyes(L, s, dt, t) {
    const ch = s.char;
    const eR = ch.bone('eyeR'), eL = ch.bone('eyeL');
    const o = L.out, E = L.eye;
    /* микросаккады: мелкие скачки фиксации */
    if (t > E.next) {
      const amp = o.eyeTarget ? 0.035 : 0.09;
      E.oy = (L.rnd() - 0.5) * 2 * amp;
      E.op = (L.rnd() - 0.5) * 1.4 * amp;
      E.next = t + (o.eyeTarget ? 0.35 + L.rnd() * 1.4 : 0.6 + L.rnd() * 2.2);
    }
    if (eR && eL) {
      for (const e of [eR, eL]) {
        let y = E.oy, p = E.op;
        if (o.eyeTarget && o.eyeFocusW > 0.3) {
          e.parent.updateMatrixWorld(false);
          const loc = L._eye.copy(o.eyeTarget);
          e.parent.worldToLocal(loc).sub(e.position);
          y += Math.atan2(-loc.x, -loc.z);
          p += Math.atan2(loc.y, Math.hypot(loc.x, loc.z));
        }
        /* орбита: по горизонтали ±32°, вверх 22°, вниз 28° */
        const ty = clamp(y, -0.56, 0.56), tp = clamp(p, -0.48, 0.38);
        /* саккада — быстрая (~40 мс), сглаживание только от дрожи */
        e.userData.y = U.damp(e.userData.y || 0, ty, 30, dt);
        e.userData.p = U.damp(e.userData.p || 0, tp, 30, dt);
        e.rotation.set(e.userData.p, e.userData.y, 0, 'YXZ');
      }
    }
    /* веки: кость поворачивается вокруг центра глаза; верхнее веко
       ещё и следует за взглядом вверх-вниз, как у человека */
    const lidR = ch.bone('lidR'), lidL = ch.bone('lidL');
    if (lidR && lidL) {
      const follow = eR ? (eR.userData.p || 0) * 0.55 : 0;
      const close = clamp(o.blink, 0, 1);
      /* закрытие — поворот вниз (−x) и лёгкий вынос вперёд: веко
         переходит через выпуклую роговицу, а не сквозь неё */
      const ang = follow * (1 - close) - close * (ch.lidClose || 0.46);
      for (const lid of [lidR, lidL]) {
        if (!lid.userData.p0) lid.userData.p0 = lid.position.clone();
        lid.rotation.set(ang, 0, 0);
        lid.position.copy(lid.userData.p0);
        lid.position.z -= 0.003 * close * (ch.scale || 1);
      }
    }
  }

  return { create, update, aimEyes, headPos, relAngles, segDist, GESTURES, spr, jolt, onShot, onHit };
});
