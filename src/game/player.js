/* ============================================================================
   Контроллер бойца: движение с весом, стрельба, управление оружием.

   Ключевая идея «тяжести». Скорость не переключается мгновенно: и разгон, и
   торможение идут через ускорение, ограниченное массой (боец + броня + БК ≈
   105 кг). Дополнительно:
     * подъём и опускание оружия занимает время (вскидка 0,22–0,34 с);
     * ствол отстаёт от поворота взгляда (инерция 3,5 кг железа);
     * каждый шаг отдаёт в оружие вертикальным толчком;
     * выносливость ограничивает бег, после бега дыхание сбивает прицел.

   Модель отдачи: импульс назад по оси ствола + подброс + случайный увод,
   всё гасится критически задемпфированными пружинами.
   ========================================================================== */
(function (root, factory) {
  const P = factory(root.GUtil, root.GRig);
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
  else root.GPlayer = P;
})(typeof self !== 'undefined' ? self : this, function (U, RIG) {
  'use strict';

  /* Физические параметры бойца в снаряжении. */
  const PHYS = {
    walk: 2.55,            // м/с — размеренный шаг под грузом
    sprint: 4.55,          // м/с — бег, недолго
    crouchWalk: 1.25,
    aimWalk: 1.55,         // с прицеливанием шаг короче
    accel: 11.0,           // м/с² разгон
    decel: 15.0,           // торможение
    airAccel: 1.6,
    eyeHeight: 1.655,      // высота глаз стоя
    crouchEye: 1.135,
    radius: 0.33,          // радиус коллизии
    gravity: -19.6,
    jump: 0,               // прыжок отключён: с бронёй и БК не прыгают
    stepUp: 0.42,          // высота, на которую можно взойти
    staminaMax: 7.2,       // с бега
    staminaRegen: 4.2,     // с восстановления до полной
    mass: 105
  };

  /* Характеристики оружия (АК-74). Часть перекрывается системой модулей. */
  const WPN = {
    rpm: 650,
    magDefault: 30,
    reserve: 180,
    reloadTime: 2.45,
    reloadEmpty: 3.05,     // с досыланием затвора
    adsTime: 0.26,
    muzzleVel: 880,        // м/с
    /* отдача: подброс, увод, отход назад */
    recoilUp: 0.0125,      // рад за выстрел
    recoilSide: 0.0060,
    recoilBack: 0.026,     // м
    spreadHip: 0.030,      // рад
    spreadAds: 0.0016,
    spreadMove: 0.020,
    spreadRecover: 4.5
  };

  function create(THREE, opts) {
    const world = opts.world;
    const audio = opts.audio;
    const fx = opts.fx;

    const P = {
      /* положение — точка на земле под ногами */
      pos: new THREE.Vector3(0, 0, 0),
      vel: new THREE.Vector3(),
      yaw: 0, pitch: 0,
      grounded: true,
      crouch: 0,            // 0..1 сглаженный присед
      crouchWant: false,
      lean: 0, leanWant: 0,
      sprint: 0, sprintWant: false,
      stamina: PHYS.staminaMax,
      exhausted: false,
      ads: 0, adsWant: false,
      speed: 0,
      moveDir: new THREE.Vector2(),
      /* оружие */
      ammo: WPN.magDefault, magCap: WPN.magDefault, reserve: WPN.reserve,
      fireMode: 'auto', fireModes: ['safe', 'auto', 'semi'],
      cool: 0, triggerHeld: false, semiLatch: false,
      reload: -1, reloadWasEmpty: false, reloadCues: 0,
      inspect: -1,
      /* динамика */
      recoil: { x: 0, v: 0 },            // подброс (pitch)
      recoilYaw: { x: 0, v: 0 },
      recoilBack: { x: 0, v: 0 },
      bobPhase: 0, stepPhase: 0, lastStepSide: 1,
      sway: { x: 0, y: 0, vx: 0, vy: 0 },
      lagYaw: 0, lagPitch: 0,
      breathT: Math.random() * 100,
      spread: WPN.spreadHip,
      shotsInBurst: 0,
      lastShot: -99,
      /* учёт статистики */
      shots: 0, hits: 0
    };

    /* -------------------------------------------------------- коллизии */
    /* Скольжение вдоль препятствий: проверяем боксы и цилиндры, толкаем
       игрока наружу по минимальной оси проникновения. */
    function resolve(pos, r) {
      for (const c of world.colliders) {
        if (c.type === 'box') {
          /* низкие препятствия (грядки, помост) можно переступить */
          if (c.step && pos.y + 0.02 >= c.h - 0.02) continue;
          const cx = U.clamp(pos.x, c.x0, c.x1);
          const cz = U.clamp(pos.z, c.z0, c.z1);
          const dx = pos.x - cx, dz = pos.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 > r * r) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            pos.x = cx + (dx / d) * r;
            pos.z = cz + (dz / d) * r;
          } else {
            /* центр внутри бокса — выталкиваем по ближайшей грани */
            const toL = pos.x - c.x0, toR = c.x1 - pos.x;
            const toB = pos.z - c.z0, toF = c.z1 - pos.z;
            const m = Math.min(toL, toR, toB, toF);
            if (m === toL) pos.x = c.x0 - r;
            else if (m === toR) pos.x = c.x1 + r;
            else if (m === toB) pos.z = c.z0 - r;
            else pos.z = c.z1 + r;
          }
        } else if (c.type === 'cyl') {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const d = Math.hypot(dx, dz);
          const rr = r + c.r;
          if (d < rr && d > 1e-6) {
            pos.x = c.x + (dx / d) * rr;
            pos.z = c.z + (dz / d) * rr;
          }
        }
      }
      /* границы участка */
      const LX = 28, LZ = 33;
      pos.x = U.clamp(pos.x, -LX, LX);
      pos.z = U.clamp(pos.z, -LZ, LZ);
    }

    /* Высота земли под игроком: рельеф плюс низкие «ступеньки». */
    function groundAt(x, z) {
      let y = world.heightAt ? world.heightAt(x, z) : 0;
      for (const c of world.colliders) {
        if (c.type !== 'box' || !c.step) continue;
        if (x > c.x0 - 0.1 && x < c.x1 + 0.1 && z > c.z0 - 0.1 && z < c.z1 + 0.1)
          y = Math.max(y, c.h);
      }
      return y;
    }
    P.groundAt = groundAt;

    /* ======================================================= движение == */
    P.updateMove = function (dt, input, active) {
      /* Неуправляемый боец стоит: только дыхание и лёгкие колебания. */
      const wish = new THREE.Vector2(0, 0);
      if (active) {
        if (input.fwd) wish.y -= 1;
        if (input.back) wish.y += 1;
        if (input.left) wish.x -= 1;
        if (input.right) wish.x += 1;
        if (wish.lengthSq() > 0) wish.normalize();
      }
      P.moveDir.copy(wish);

      /* присед */
      P.crouchWant = active && !!input.crouch;
      P.crouch = U.damp(P.crouch, P.crouchWant ? 1 : 0, 9, dt);

      /* прицеливание */
      P.adsWant = active && !!input.ads && P.reload < 0 && P.inspect < 0;
      const adsRate = 1 / Math.max(0.08, WPN.adsTime * (P.adsWant ? 1 : 0.8));
      P.ads = U.clamp01(P.ads + (P.adsWant ? adsRate : -adsRate * 1.25) * dt);

      /* бег: только вперёд, не в прицеле, при наличии выносливости */
      const canSprint = active && input.sprint && wish.y < -0.3 && Math.abs(wish.x) < 0.75
        && P.ads < 0.35 && !P.exhausted && P.crouch < 0.4 && P.reload < 0;
      P.sprintWant = !!canSprint;
      P.sprint = U.damp(P.sprint, canSprint ? 1 : 0, canSprint ? 5.5 : 8, dt);

      if (canSprint) {
        P.stamina -= dt;
        if (P.stamina <= 0) { P.stamina = 0; P.exhausted = true; }
      } else {
        P.stamina = Math.min(PHYS.staminaMax, P.stamina + dt * (PHYS.staminaMax / PHYS.staminaRegen));
        if (P.exhausted && P.stamina > PHYS.staminaMax * 0.42) P.exhausted = false;
      }

      /* целевая скорость с учётом режима */
      let target = PHYS.walk;
      target = U.lerp(target, PHYS.sprint, P.sprint);
      target = U.lerp(target, PHYS.aimWalk, P.ads * (1 - P.sprint));
      target = U.lerp(target, PHYS.crouchWalk, P.crouch);
      /* назад и вбок медленнее — так ходит человек с грузом */
      if (wish.y > 0.1) target *= 0.72;
      if (Math.abs(wish.x) > 0.7) target *= 0.84;
      if (P.reload >= 0) target *= 0.88;

      /* мировое направление желаемой скорости */
      const sinY = Math.sin(P.yaw), cosY = Math.cos(P.yaw);
      const wx = wish.x * cosY - wish.y * sinY;
      const wz = wish.x * sinY + wish.y * cosY;
      const want = new THREE.Vector3(wx * target, 0, wz * target);

      /* разгон/торможение с ограничением по ускорению: инерция массы */
      const cur = new THREE.Vector3(P.vel.x, 0, P.vel.z);
      const diff = want.clone().sub(cur);
      const maxA = (want.lengthSq() > cur.lengthSq() ? PHYS.accel : PHYS.decel) * dt;
      if (diff.length() > maxA) diff.setLength(maxA);
      cur.add(diff);
      P.vel.x = cur.x; P.vel.z = cur.z;
      P.speed = cur.length();

      /* вертикаль: рельеф под ногами */
      const nx = P.pos.x + P.vel.x * dt;
      const nz = P.pos.z + P.vel.z * dt;
      const tmp = new THREE.Vector3(nx, P.pos.y, nz);
      resolve(tmp, PHYS.radius);
      /* если коллизия отбросила — гасим скорость по этой оси */
      if (Math.abs(tmp.x - nx) > 1e-6) P.vel.x *= 0.1;
      if (Math.abs(tmp.z - nz) > 1e-6) P.vel.z *= 0.1;
      P.pos.x = tmp.x; P.pos.z = tmp.z;

      const gy = groundAt(P.pos.x, P.pos.z);
      P.vel.y += PHYS.gravity * dt;
      P.pos.y += P.vel.y * dt;
      if (P.pos.y <= gy) { P.pos.y = gy; P.vel.y = 0; P.grounded = true; }
      else if (P.pos.y - gy < PHYS.stepUp && P.vel.y <= 0) { P.pos.y = gy; P.vel.y = 0; P.grounded = true; }
      else P.grounded = false;

      /* наклон корпуса Q/E */
      P.leanWant = active ? ((input.leanL ? -1 : 0) + (input.leanR ? 1 : 0)) : 0;
      P.lean = U.damp(P.lean, P.leanWant * (1 - P.sprint * 0.8), 8, dt);

      /* ------------------------------------------------ шаги и покачивание */
      const moving = P.speed > 0.35 && P.grounded;
      if (moving) {
        /* частота шага растёт со скоростью, но не линейно: под грузом шаг
           длиннее, а не чаще */
        const freq = U.lerp(1.42, 2.35, U.clamp01((P.speed - 0.8) / 3.6)) * (1 + P.sprint * 0.18);
        const prev = P.stepPhase;
        P.stepPhase += dt * freq;
        P.bobPhase = P.stepPhase * Math.PI * 2;
        /* каждое пересечение половины фазы — касание стопы */
        if (Math.floor(prev * 2) !== Math.floor(P.stepPhase * 2)) {
          const hard = false;
          const vol = U.lerp(0.55, 1.15, U.clamp01(P.speed / PHYS.sprint)) * (1 - P.crouch * 0.45);
          if (audio) audio.step(hard, vol);
          /* толчок в оружие от шага — то самое ощущение веса */
          P.recoil.v += U.lerp(0.10, 0.34, U.clamp01(P.speed / PHYS.sprint)) * (1 - P.ads * 0.55);
          P.lastStepSide *= -1;
          if (fx) fx.onStep && fx.onStep(P.pos, P.lastStepSide);
        }
      } else {
        P.bobPhase = U.damp(P.bobPhase % (Math.PI * 2), 0, 3, dt);
        P.stepPhase += dt * 0.2;
      }

      /* дыхание: после бега — тяжёлое */
      P.breathT += dt * U.lerp(1.0, 2.4, 1 - P.stamina / PHYS.staminaMax);
      if (audio && active) {
        const need = P.stamina < PHYS.staminaMax * 0.55;
        P._breathAcc = (P._breathAcc || 0) + dt;
        const period = need ? U.lerp(0.95, 1.9, P.stamina / PHYS.staminaMax) : 4.2;
        if (P._breathAcc > period) { P._breathAcc = 0; audio.breath(need); }
      }
    };

    /* ======================================================= прицел ==== */
    /* Взгляд: мышь двигает yaw/pitch, а оружие следует с запаздыванием. */
    P.look = function (dx, dy, sens) {
      const k = sens * (1 - P.ads * 0.55);       // в прицеле чувствительность ниже
      P.yaw -= dx * k;
      P.pitch = U.clamp(P.pitch - dy * k, -1.35, 1.32);
      /* инерция оружия: резкий поворот «уводит» ствол в сторону */
      P.sway.vx += dx * k * 22;
      P.sway.vy += dy * k * 18;
    };

    /* ====================================================== стрельба === */
    P.canFire = function () {
      return P.fireMode !== 'safe' && P.reload < 0 && P.inspect < 0 && P.cool <= 0
        && P.ammo > 0 && P.sprint < 0.55;
    };

    P.pullTrigger = function (down) {
      P.triggerHeld = down;
      if (!down) P.semiLatch = false;
    };

    P.cycleFireMode = function () {
      const i = P.fireModes.indexOf(P.fireMode);
      P.fireMode = P.fireModes[(i + 1) % P.fireModes.length];
      if (audio) audio.selector();
      return P.fireMode;
    };

    P.startReload = function () {
      if (P.reload >= 0 || P.reserve <= 0 || P.ammo >= P.magCap) return false;
      P.reloadWasEmpty = P.ammo === 0;
      P.reload = 0;
      P.reloadCues = 0;
      P.ads = Math.min(P.ads, 0.2);
      return true;
    };

    P.startInspect = function () {
      if (P.reload >= 0 || P.inspect >= 0) return false;
      P.inspect = 0;
      return true;
    };

    /* Текущий разброс: от бедра большой, в прицеле малый, движение и
       очередь добавляют. */
    P.currentSpread = function () {
      const base = U.lerp(WPN.spreadHip, WPN.spreadAds, U.smoothstep(P.ads));
      const move = WPN.spreadMove * U.clamp01(P.speed / PHYS.sprint) * (1 - P.ads * 0.5);
      const crouchK = 1 - P.crouch * 0.28;
      const burst = P.shotsInBurst * 0.0018 * (1 - P.ads * 0.45);
      const tired = (1 - P.stamina / PHYS.staminaMax) * 0.006;
      return (base + move + burst + tired) * crouchK;
    };

    P.update = function (dt, input, active, now) {
      P.updateMove(dt, input, active);

      /* --- таймеры --- */
      if (P.cool > 0) P.cool -= dt;
      if (now - P.lastShot > 0.30) P.shotsInBurst = U.damp(P.shotsInBurst, 0, 5, dt);

      /* --- перезарядка --- */
      if (P.reload >= 0) {
        const dur = P.reloadWasEmpty ? WPN.reloadEmpty : WPN.reloadTime;
        P.reload += dt;
        const u = P.reload / dur;
        /* звуковые метки по фазам движения */
        if (P.reloadCues === 0 && u > 0.10) { P.reloadCues = 1; audio && audio.magOut(); }
        if (P.reloadCues === 1 && u > 0.30) { P.reloadCues = 2; audio && audio.magDrop(); }
        if (P.reloadCues === 2 && u > 0.62) { P.reloadCues = 3; audio && audio.magIn(); }
        if (P.reloadWasEmpty && P.reloadCues === 3 && u > 0.86) { P.reloadCues = 4; audio && audio.boltRelease(); }
        if (P.reload >= dur) {
          const need = P.magCap - P.ammo;
          const take = Math.min(need, P.reserve);
          P.ammo += take;
          P.reserve -= take;
          P.reload = -1;
        }
      }

      if (P.inspect >= 0) {
        P.inspect += dt;
        if (P.inspect > 2.3) P.inspect = -1;
      }

      /* --- автоматический огонь --- */
      if (active && P.triggerHeld) {
        if (P.fireMode === 'auto' || (P.fireMode === 'semi' && !P.semiLatch)) {
          if (P.canFire()) {
            P.semiLatch = true;
            P.fire(now);
          } else if (P.ammo <= 0 && P.cool <= 0 && P.reload < 0 && !P.semiLatch) {
            P.semiLatch = true;
            audio && audio.dryFire();
            P.cool = 0.22;
          } else if (P.fireMode === 'safe' && !P.semiLatch) {
            P.semiLatch = true;
            audio && audio.dryFire();
          }
        }
      }

      /* --- затухание динамики --- */
      /* Пружины: отдача возвращается к нулю, но не мгновенно. */
      U.spring(P.recoil, 0, 21, dt, 0.62);
      U.spring(P.recoilYaw, 0, 19, dt, 0.7);
      U.spring(P.recoilBack, 0, 24, dt, 0.8);
      /* инерция наводки */
      P.sway.vx += -P.sway.x * 130 * dt - P.sway.vx * 14 * dt;
      P.sway.vy += -P.sway.y * 130 * dt - P.sway.vy * 14 * dt;
      P.sway.x += P.sway.vx * dt;
      P.sway.y += P.sway.vy * dt;
      P.sway.x = U.clamp(P.sway.x, -0.12, 0.12);
      P.sway.y = U.clamp(P.sway.y, -0.10, 0.10);

      P.spread = P.currentSpread();
    };

    /* Выстрел: расход патрона, отдача, эффекты и трассировка пули. */
    P.fire = function (now) {
      P.ammo--;
      P.cool = 60 / WPN.rpm;
      P.lastShot = now;
      P.shots++;
      P.shotsInBurst = Math.min(12, P.shotsInBurst + 1);

      /* импульс отдачи: сильнее стоя и от бедра, слабее с упора и в приседе */
      const stab = (1 - P.ads * 0.22) * (1 - P.crouch * 0.12);
      P.recoil.v += WPN.recoilUp * 62 * stab * U.lerp(1, 1.22, U.clamp01(P.shotsInBurst / 8));
      P.recoilYaw.v += (Math.random() - 0.5) * WPN.recoilSide * 88 * stab;
      P.recoilBack.v += WPN.recoilBack * 30 * stab;
      /* «сбив» наводки: часть отдачи уходит в реальный угол взгляда */
      P.pitch = U.clamp(P.pitch + WPN.recoilUp * 0.42 * stab, -1.35, 1.32);
      P.yaw += (Math.random() - 0.5) * WPN.recoilSide * 0.5 * stab;

      if (P.onFire) P.onFire();
    };

    P.PHYS = PHYS;
    P.WPN = WPN;
    return P;
  }

  return { create, PHYS, WPN };
});