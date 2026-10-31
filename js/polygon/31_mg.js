/* AEGIS · стационарные пулемёты (гнёзда M2HB) на картах Лес и Заречье.
   Гнёзда строит оригинальный buildMG из карты (world.mg.nests: станок, мешки, модель; уровни детализации).
   Здесь — только игровая часть: занять/покинуть место (короткое F), сектор обстрела ±75°, угол возвышения,
   темп 520 выстр/мин, лента 100 + запас 300, выстрел через баллистику AEGIS (C.fireMG).
   v21: вид наводчика — глаз за прицельной планкой (целик + мушка модели совмещены с центром кадра),
   ПКМ — приблизить, пули сводятся в точку прицеливания, своя «память» спуска (смена оружия
   в руках больше не отпускает гашетку), отдача малая (станок M3 держит пулемёт). */
(function (root) {
  'use strict';
  const ARC = 1.3, RPM = 520, BELT = 100, SEAT_BACK = 0.95, MOUNT_R = 1.9, PITCH_MIN = -0.3, PITCH_MAX = 0.55;
  /* Прицельная линия модели (локальные оси gunG: x — вперёд по стволу, y — вверх; ось канала ствола y=0.155):
     целик — рамка x=−0.274, окно y≈0.279…0.297; мушка x=0.106, вершина y=0.297.
     Глаз — в 26 см за целиком на продолжении линии «целик → мушка». */
  const REAR = [-0.274, 0.288], FRONT = [0.106, 0.297];
  const LOS = Math.atan2(FRONT[1] - REAR[1], FRONT[0] - REAR[0]);
  const onLos = (back, up) => [REAR[0] - Math.cos(LOS) * back, REAR[1] - Math.sin(LOS) * back + up];
  /* ПКМ (к прицелу): глаз на линии прицела в 26 см за целиком — мушка в прорези целика по центру кадра.
     Без ПКМ: глаз выше и дальше, над затыльником, — обзор поверх пулемёта, точка прицеливания в центре кадра. */
  const EYE = { ads: onLos(0.26, 0), hip: onLos(0.5, 0.12) };
  const KICK_ROT = 0.035, KICK_BACK = 0.03, ZOOM = 0.72;
  const st = { mounted: null, by: null, lodT: 0, lastShot: -9, trigger: false, zoom: false, zoomK: 0, shake: 0, shakeT: 0, dot: null, dotOn: false };
  /* точка прицеливания в обзорном виде (без ПКМ): маленькая, полупрозрачная; в прицеле — только целик и мушка */
  /* v22: белая точка убрана — наводчик целится по целику и мушке модели, как в оригинальной карте */
  function dot(on) {
    st.dotOn = false;
    if (st.dot) { st.dot.remove(); st.dot = null; }
    void on;
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
  const nests = (world) => (world && world.mg && world.mg.nests) || [];
  const seatOf = (N) => ({ x: N.gx - Math.sin(N.face) * SEAT_BACK, z: N.gz - Math.cos(N.face) * SEAT_BACK, y: N.gy });

  function nearest(world, p) {
    let best = null, bd = MOUNT_R;
    for (const N of nests(world)) {
      if (N.dead || Math.abs(p.y - N.gy) > 1.6) continue;
      const s = seatOf(N), d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < bd) { bd = d; best = N; }
    }
    return best;
  }
  const isMounted = (a) => !!(a && st.by === a && st.mounted);

  function mount(a, N) {
    if (!a || !N || st.mounted) return false;
    const c = a.ctrl, s = seatOf(N);
    st.mounted = N; st.by = a; c.mounted = N;
    st.trigger = false; st.zoom = false; st.zoomK = 0; st.shake = 0;
    c.pos.set(s.x, N.gy, s.z);
    c.vel.set(0, 0, 0);
    /* взгляд — туда, куда сейчас смотрит ствол (а не всегда по центру сектора) */
    const rel = clamp(angDiff(N.yaw === undefined ? N.face : N.yaw, N.face), -ARC, ARC);
    c.yaw = N.face + rel + Math.PI; c.lagYaw = c.yaw; c.pitch = clamp(N.pitch || 0, PITCH_MIN, PITCH_MAX);
    if (root.GMG.onMount) try { root.GMG.onMount(a, N); } catch (e) { /* */ }
    st.sndInit = false;
    return true;
  }
  function dismount(a) {
    const N = st.mounted;
    if (!N) return;
    const c = (st.by || a).ctrl;
    c.mounted = null;
    const s = seatOf(N);
    c.pos.set(s.x - Math.sin(N.face) * 0.5, N.gy, s.z - Math.cos(N.face) * 0.5);
    const by = st.by || a;
    st.mounted = null; st.by = null; st.trigger = false; st.zoom = false; st.zoomK = 0;
    dot(false);
    if (root.GMG.onDismount) try { root.GMG.onDismount(by, N); } catch (e) { /* */ }
  }
  /* ЛКМ/ПКМ за пулемётом (29_game.js · ARS.action) */
  function trigger(down) { st.trigger = !!(down && st.mounted); }
  function zoom(down, toggle) { if (!st.mounted) { st.zoom = false; return; } st.zoom = toggle ? (down ? !st.zoom : st.zoom) : !!down; }

  /* наведение ствола по взгляду с ограничениями станка */
  function aim(N, c) {
    const rel = clamp(angDiff(c.yaw + Math.PI, N.face), -ARC, ARC);
    c.yaw = N.face + rel - Math.PI;
    c.pitch = clamp(c.pitch, PITCH_MIN, PITCH_MAX);
    N.yaw = N.face + rel; N.pitch = c.pitch;
    poseGun(N);
  }
  function poseGun(N) {
    N.yawG.rotation.y = N.yaw - N.face;
    /* станок M3 гасит отдачу: ствольная коробка уходит назад на ~3 см, ствол чуть подскакивает */
    N.gunG.rotation.z = N.pitch + N.kick * KICK_ROT;
    N.gunG.position.x = -N.kick * KICK_BACK;
  }

  /* ctx: { C, world, camera, THREE, active } — вызывается каждый кадр боя */
  function update(dt, ctx) {
    const world = ctx.world, list = nests(world);
    if (!list.length) return;
    const cp = ctx.camera.position;
    if ((st.lodT += dt) > 0.3) {
      st.lodT = 0;
      for (const N of list) {
        const d2 = (N.gx - cp.x) ** 2 + (N.gz - cp.z) ** 2;
        /* v21: дальше 170 м (8–10 px на экране, за стволами и в дымке) пулемёт не рисуем */
        const lod = N === st.mounted ? 2 : d2 > 170 * 170 && !N.dead ? 3 : d2 > 55 * 55 && !N.dead ? 1 : 0;
        if (lod !== N.lod) {
          N.lod = lod;
          for (let li = 0; li < 3; li++) for (const m of N.lodMeshes[li]) m.visible = lod === li;
          if (world.native.mgFarSet) world.native.mgFarSet(N, lod === 1);
        }
      }
    }
    for (const N of list) {
      if (N.kick > 1e-4) { N.kick *= Math.exp(-dt * 18); if (N !== st.mounted) poseGun(N); }
      if (N.flashT > 0) { N.flashT -= dt; if (N.flash) N.flash.visible = N.flashT > 0; }
    }
    /* v22: дым, гильзы, остывание ствола и курение горячего кожуха (31b_mg_fx.js) */
    if (root.GMGFX) try { root.GMGFX.update(dt, ctx, list); } catch (e) { /* */ }
    const N = st.mounted, a = st.by;
    if (!N) return;
    /* v22: звук M2HB синтезируется при посадке (4 варианта), чтобы первый выстрел не подвисал */
    if (!st.sndInit && root.GMGFX) { st.sndInit = true; try { root.GMGFX.soundInit(ctx.C.audio); } catch (e) { /* */ } }
    const c = a.ctrl;
    if ((a.hp !== undefined && a.hp <= 0) || a.dead || ctx.active() !== a || N.dead) { dismount(a); return; }
    const s = seatOf(N);
    c.pos.set(s.x, N.gy, s.z); c.vel.set(0, 0, 0);
    aim(N, c);
    st.zoomK += ((st.zoom ? 1 : 0) - st.zoomK) * (1 - Math.exp(-dt * 10));
    const now = performance.now() / 1000;
    const held = st.trigger || !!c.triggerHeld;
    if (N.reload > 0) {
      N.reload -= dt;
      if (N.reload <= 0) { const take = Math.min(BELT, N.reserve); N.reserve -= take; N.ammo = take; }
    } else if (held && now - st.lastShot >= 60 / RPM) {
      if (N.ammo > 0) fire(N, a, ctx, now);
      else if (N.reserve > 0) N.reload = 5;
    }
  }

  /* Мировая поза прицельной линии (без отдачи): глаз и кватернион камеры */
  let _T = null, _v = null, _q = null, _qz = null, _qy = null, _ax = null;
  function sightPose(N, T, out) {
    if (_T !== T) { _T = T; _v = new T.Vector3(); _q = new T.Quaternion(); _qz = new T.Quaternion(); _qy = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -Math.PI / 2); _ax = new T.Vector3(0, 0, 1); }
    N.root.updateMatrixWorld(true);
    const p = N.pitch || 0, cs = Math.cos(p), sn = Math.sin(p);
    /* глаз в осях yawG: поворот точки глаза на угол возвышения вокруг оси z */
    const k = N === st.mounted ? st.zoomK : 0, ex = EYE.hip[0] + (EYE.ads[0] - EYE.hip[0]) * k, ey = EYE.hip[1] + (EYE.ads[1] - EYE.hip[1]) * k;
    _v.set(ex * cs - ey * sn, ex * sn + ey * cs, 0);
    out.pos.copy(_v).applyMatrix4(N.yawG.matrixWorld);
    N.yawG.getWorldQuaternion(_q);
    _qz.setFromAxisAngle(_ax, p + LOS);
    out.quat.copy(_q).multiply(_qz).multiply(_qy);
    return out;
  }
  /* камера наводчика: вызывается после обычной камеры (29_game.js) */
  function cameraPose(camera, T, dt) {
    const N = st.mounted;
    if (!N || !T) return false;
    /* камера ставится раньше updateUse — сразу доводим ствол до текущего взгляда, без отставания на кадр */
    if (st.by && st.by.ctrl) aim(N, st.by.ctrl);
    const P = sightPose(N, T, { pos: camera.position, quat: camera.quaternion });
    /* тряска от очереди: мелкая, затухает за ~0.15 с */
    st.shake *= Math.exp(-(dt || 0.016) * 16);
    if (st.shake > 1e-3) {
      st.shakeT += dt || 0.016;
      const k = st.shake;
      camera.rotateX((Math.sin(st.shakeT * 83) * 0.6 + 0.4) * 0.006 * k);
      camera.rotateY(Math.sin(st.shakeT * 61 + 1.3) * 0.003 * k);
      camera.position.addScaledVector(_v.set(0, 0, 1).applyQuaternion(camera.quaternion), 0.012 * k);
    }
    if (st.zoomK > 0.002) {
      const f0 = camera.fov, f1 = 2 * Math.atan(Math.tan(f0 * Math.PI / 360) * ZOOM) * 180 / Math.PI;
      camera.fov = f0 + (f1 - f0) * st.zoomK;
    }
    if (camera.near > 0.05) camera.near = 0.05;
    dot(st.zoomK < 0.5);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    return P;
  }

  function fire(N, a, ctx, now) {
    const T = ctx.THREE;
    st.lastShot = now; N.ammo--; N.kick = 1; N.heat = Math.min(1, (N.heat || 0) + 0.012);
    st.shake = Math.min(1.6, st.shake + 0.7);
    N.root.updateMatrixWorld(true);
    const from = N.gunG.localToWorld(new T.Vector3(1.3, 0.155, 0));
    /* прицеливание — по линии прицела (как стоит камера наводчика), пуля сводится в точку прицеливания */
    const eye = sightPose(N, T, { pos: new T.Vector3(), quat: new T.Quaternion() });
    const los = new T.Vector3(0, 0, -1).applyQuaternion(eye.quat);
    let D = 400;
    if (ctx.C.mgAimDist) { const d = ctx.C.mgAimDist(eye.pos, los); if (d) D = clamp(d, 8, 900); }
    const dir = eye.pos.clone().addScaledVector(los, D).sub(from).normalize();
    const spread = 0.0012 + N.heat * 0.003;
    dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    /* v22: подброс ствола очередью — станок держит, но линия прицела ползёт вверх и чуть в стороны */
    const c = a.ctrl;
    c.pitch += (1.6e-3 + Math.random() * 1.2e-3) * (1 - st.zoomK * 0.35);
    c.yaw += (Math.random() - 0.5) * 1.6e-3;
    N.tracerN = (N.tracerN || 0) + 1;
    if (root.GMGFX) { try { root.GMGFX.shot(N, ctx, from, dir, true); } catch (e) { if (N.flash) { N.flash.visible = true; N.flashT = 0.05; } } }
    else if (N.flash) { N.flash.visible = true; N.flashT = 0.05; }
    ctx.C.fireMG(from, dir, a, { tracer: N.tracerN % 4 === 0 });
  }

  root.GMG = { nearest, mount, dismount, isMounted, update, seatOf, trigger, zoom, cameraPose, sightPose, current: () => st.mounted, state: () => ({ trigger: st.trigger, zoom: st.zoom, zoomK: st.zoomK }), CFG: { ARC, RPM, BELT, EYE, LOS, MOUNT_R } };
})(typeof self !== 'undefined' ? self : this);
