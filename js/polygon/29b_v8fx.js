/* ==========================================================================
   МОДУЛЬ: GV8 — «живые» мелочи и вау-эффекты v8 (js/polygon/29b_v8fx.js)
   ==========================================================================
   • Горячий ствол: марево над стволом (пост-эффект, сильнее в оптике),
     дымок масла выше ~160 °C, пар от капель дождя выше 100 °C (шипение),
     «тиканье» остывающей стали, тусклое красное свечение ствола ночью выше
     точки Дрейпера (~525 °C).
   • Близкий взрыв: кольцо ударной волны (преломление), грязь на объективе
     бодикама (протирка — клавиша «Протереть объектив»), контузия (картинку
     ведёт, туннель), хвоя и сучки сыплются с деревьев вокруг.
   • Выстрел соседа рядом (≤ 2,5 м): дульная волна бьёт в грудь — короткий
     толчок камеры и глухой «тумп».
   • Попадания по материалам: вода (фонтанчик + круги + «бульк»), песок из
     мешков (струйка 2–4 с), металл (искры, звон, рикошет при скользящем
     угле — пуля уходит дальше с визгом), камень (рикошет).
   • Дыхание паром в холод (утро/туман/ночь), чаще после бега.
   • Капли с веток по каске после дождя, сорока-«сигнальщица» трещит, когда
     игрок проходит рядом.
   ========================================================================== */
(function (root) {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const sat = (x) => clamp(x, 0, 1);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  function create(THREE, o) {
    const scene = o.scene, camera = o.camera, world = o.world, fx = o.fx, audio = o.audio;
    const V = { mud: 0, mudS: Math.random(), conc: 0, shocks: [], sand: [], fpOn: false, stats: { blasts: 0, rico: 0, water: 0, sand: 0, steam: 0, ticks: 0, breath: 0, thump: 0 } };
    const scars = () => o.getScars ? o.getScars() : null;
    const post = () => (o.getPost ? o.getPost() : null);
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
    const gAt = (x, z) => (world.heightAt ? world.heightAt(x, z) : 0);
    const sp = (p) => (o.spatialFrom ? o.spatialFrom(p) : { gain: 1, pan: 0, lp: 15000, delay: 0 });

    /* ------------------------------------------------ свечение ствола */
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3a10, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    glowMat.userData.noGloom = true;
    const glowGeo = new THREE.CylinderGeometry(0.0105, 0.0105, 1, 8, 1, true);
    glowGeo.rotateX(Math.PI / 2);
    function glowFor(w) {
      if (w._v8glow !== undefined) return w._v8glow;
      w._v8glow = null;
      try {
        const m = new THREE.Mesh(glowGeo, glowMat.clone());
        m.name = 'v8_barrelGlow'; m.renderOrder = 4; m.visible = false; m.frustumCulled = false;
        /* вдоль ствола: последние ~40 % длины до дульного среза */
        const mz = w.muzzleLocal.clone();
        const len = Math.max(0.12, Math.min(0.32, Math.abs(mz.z) * 0.38));
        m.scale.set(1, 1, len);
        m.position.copy(mz).add(new THREE.Vector3(0, 0, len * 0.5 + 0.02));
        w.gun.add(m);
        w._v8glow = m;
      } catch (e) { w._v8glow = null; }
      return w._v8glow;
    }

    /* ------------------------------------------------ нагрев ствола */
    const _mz = new THREE.Vector3(), _ch = new THREE.Vector3(), _dir = new THREE.Vector3(), _q = new THREE.Quaternion();
    V.heat = (s, dt, ctx) => {
      const c = s.ctrl, w = s.gun, vr = c && c.vr;
      if (!vr || !w || !w.gun || s.dead || !vr.heat) return;
      const H = vr.heat, dT = H.T - H.Ta;
      const rain = ctx.rain || 0, me = !!ctx.me;
      if (dT < 25 && !(w._v8glow && w._v8glow.visible)) return;
      w.gun.updateMatrixWorld(true);
      w.gun.localToWorld(_mz.copy(w.muzzleLocal));
      _dir.set(0, 0, -1).applyQuaternion(w.gun.getWorldQuaternion(_q));
      const pick = () => _a.copy(_mz).addScaledVector(_dir, -rnd(0.03, 0.38));
      /* дымок масла и нагара */
      s._v8sm = (s._v8sm || 0) + dt;
      if (H.T > 160 && s._v8sm > 0.55 - 0.45 * sat((H.T - 160) / 260)) {
        s._v8sm = 0;
        fx.smoke(pick(), 1, _b.set(rnd(-0.03, 0.03), 0.32, rnd(-0.03, 0.03)), 0.035 + 0.03 * sat((H.T - 200) / 300), 0xc9c4ba, 0.22 + 0.25 * sat((H.T - 200) / 300), 0.7);
      }
      /* пар: капли дождя на стволе выше 100 °C */
      if (rain > 0.08 && H.T > 100 && Math.random() < dt * rain * (3 + 8 * sat((H.T - 100) / 250))) {
        fx.smoke(pick(), 1, _b.set(0, 0.5, 0), 0.05, 0xe8ecef, 0.35, 0.9);
        V.stats.steam++;
        if (audio.sizzle && (me || Math.random() < 0.3)) audio.sizzle(me ? { gain: 0.7 } : sp(_a), sat((H.T - 100) / 300));
      }
      /* тиканье остывающей стали (своё оружие) */
      if (me && audio.metalTick && H.T > 110 && ctx.t - (c._v8last || 0) > 1.8 && Math.random() < dt * 1.1 * sat((H.T - 110) / 180)) {
        audio.metalTick({ gain: 0.8 }, sat((H.T - 110) / 250)); V.stats.ticks++;
      }
      /* свечение: точка Дрейпера ~525 °C (видно в темноте), к 700 °C — ярко */
      const g = H.T > 470 ? glowFor(w) : w._v8glow;
      if (g) {
        const k = sat((H.T - 500) / 250) * (ctx.dark ? 1 : 0.25);
        g.visible = k > 0.01;
        if (g.visible) { g.material.opacity = 0.15 + 0.6 * k; g.material.color.setRGB(1, 0.18 + 0.25 * k, 0.05 + 0.04 * k); }
      }
    };
    /* v25: марево над стволом убрано — пост-эффект «плавил» картинку рябью.
       Горячий ствол по-прежнему виден: накал металла и дымок (выше). */
    V.mirage = () => {
      const P = post();
      if (P && P.grade.uniforms.uMirage) P.grade.uniforms.uMirage.value = 0;
    };

    /* ------------------------------------------------ взрыв рядом */
    V.blast = (pos, big, ctx) => {
      ctx = ctx || {};
      V.stats.blasts++;
      const d = camera.position.distanceTo(pos);
      /* ударная волна: видна до ~70 м, сильнее вблизи */
      if (d < 70) V.shocks.push({ p: pos.clone(), t: 0, k: sat(1.4 - d / 50) * Math.min(1.6, big || 1) });
      if (V.shocks.length > 3) V.shocks.shift();
      if (ctx.fp) {
        /* грязь на объективе: комья летят, если разрыв в грунте и близко */
        const fwd = _a.set(0, 0, -1).applyQuaternion(camera.quaternion);
        const to = _b.copy(pos).sub(camera.position).normalize();
        const look = fwd.dot(to);
        const km = sat((9 * (big || 1) - d) / (7 * (big || 1))) * (look > -0.2 ? 1 : 0.4);
        if (km > 0.05 && !ctx.noMud) { V.mud = Math.min(1, V.mud + km * 0.9); V.mudS = Math.random() * 10; }
        /* контузия */
        const kc = sat((13 * (big || 1) - d) / (11 * (big || 1)));
        if (kc > 0.05) V.conc = Math.min(1, Math.max(V.conc, kc));
      }
      /* хвоя и сучки с деревьев вокруг */
      const S = scars();
      const R = 14 * Math.sqrt(big || 1);
      if (S && S.needleFall && world.trees) {
        let n = 0;
        for (const t of world.trees) {
          const dd = Math.hypot(t.x - pos.x, t.z - pos.z);
          if (dd > R || n > 26) continue;
          n++;
          setTimeout(() => { try { S.needleFall(t, (1 - dd / R) * 1.4 * (big || 1)); } catch (e) { /* */ } }, (dd / 55) * 1000 + 40);
        }
      }
      /* вода в воронках и в ручье — круги */
      if (world.waterRipple) for (let i = 0; i < 3; i++) world.waterRipple(pos.x + rnd(-4, 4), pos.z + rnd(-4, 4), 2);
    };
    V.wipe = () => {
      if (V.mud < 0.02) return false;
      V.wipeT = 0.45;
      return true;
    };

    /* ------------------------------------------------ дульная волна соседа */
    V.nearShot = (from, me, opt) => {
      if (!me) return;
      const d = camera.position.distanceTo(from);
      if (d > 2.6 || (opt && opt.supp)) return;
      const k = sat((2.6 - d) / 2.2);
      V.stats.thump++;
      if (audio.blastThump) audio.blastThump(k * 0.9);
      if (o.kick) o.kick(k * 0.18);
    };

    /* ------------------------------------------------ попадания */
    V.impact = (kind, p, n, dir, opt) => {
      opt = opt || {};
      const S = scars();
      if (kind === 'water') {
        V.stats.water++;
        if (S && S.splash) S.splash(p.x, p.y, p.z, 1.1, false);
        if (S && S.spawn) for (let i = 0; i < 14; i++) S.spawn(p.x, p.y + 0.02, p.z, rnd(-0.4, 0.4), rnd(2.2, 4.4), rnd(-0.4, 0.4), 1.2, 0.02, 0.012, 0.85, 0.42, 0.44, 0.42, 1, 9.8, 0.25);
        if (world.waterRipple) world.waterRipple(p.x, p.z, 1.4);
        if (audio.waterHit) audio.waterHit(sp(p));
        return true;
      }
      if (kind === 'sand') {
        V.stats.sand++;
        fx.smoke(p, 2, _a.copy(n).multiplyScalar(0.5), 0.09, 0xb7a27f, 0.6, -0.05);
        V.sand.push({ p: p.clone().addScaledVector(n, 0.02), n: n.clone(), t: 0, dur: rnd(1.8, 3.8) });
        if (V.sand.length > 12) V.sand.shift();
        if (audio.sandTrickle) audio.sandTrickle(sp(p), 2.5);
        return false;
      }
      if (kind === 'metal' || kind === 'rock') {
        /* рикошет при скользящем угле: |cos| < 0,35 (≈ 20° к поверхности) */
        const cs = Math.abs(dir.dot(n));
        if (cs < 0.35 && Math.random() < 0.85 - cs) {
          V.stats.rico++;
          const r = _a.copy(dir).addScaledVector(n, -2 * dir.dot(n));
          r.x += rnd(-0.15, 0.15); r.y += rnd(-0.05, 0.25); r.z += rnd(-0.15, 0.15); r.normalize();
          const end = _b.copy(p).addScaledVector(r, rnd(12, 40));
          if (fx.tracer) fx.tracer(p.clone(), end.clone(), 0.7, 600);
          fx.sparks(p, 10, r, 0.8, 1.2);
          if (audio.ricochet) audio.ricochet(sp(p), 1 - cs);
        } else if (kind === 'metal') { V.stats.metal = (V.stats.metal || 0) + 1; if (audio.metalPing) audio.metalPing(sp(p), !!opt.big); }
        else V.stats.rock = (V.stats.rock || 0) + 1;
        return false;
      }
      return false;
    };

    /* ------------------------------------------------ дыхание паром */
    /* v21: ночи нет — пар оставлен: холодное утро (+4 °C) и прохладный осенний день (+9 °C) */
    const breathColdK = { overcast: 0.25, morning: 0.85, day: 0.4, rain: 0.3, fog: 0.85, dusk: 0.6, night: 1 };
    V.breath = (s, dt, ctx) => {
      const k0 = breathColdK[ctx.weather] || 0;
      if (k0 <= 0 || s.dead || !s.char) return;
      const c = s.ctrl, st = c.stamina !== undefined && c.PHYS ? c.stamina / c.PHYS.staminaMax : 1;
      const rate = 0.22 + 0.45 * (1 - st) + 0.25 * sat((c.speed || 0) / 5);   // вдохов в секунду
      s._v8br = (s._v8br || Math.random()) + dt * rate;
      if (s._v8br < 1) return;
      s._v8br -= 1;
      const me = ctx.me && ctx.fp;
      if (me) {
        /* своё: облачко перед лицом, уходит вниз-вперёд и тает */
        _a.set(0, -0.11, -0.32).applyQuaternion(camera.quaternion).add(camera.position);
        _b.set(0, -0.05, -0.55).applyQuaternion(camera.quaternion);
        fx.smoke(_a, 1, _b, 0.07, 0xdfe4e8, 0.10 * k0, 0.05);
      } else {
        const hb = s.char.bone && s.char.bone('head');
        if (!hb) return;
        hb.getWorldPosition(_a);
        if (_a.distanceTo(camera.position) > 25) return;
        const yaw = c.yaw || 0;
        _b.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        _a.addScaledVector(_b, 0.13); _a.y -= 0.06;
        fx.smoke(_a, 1, _b.multiplyScalar(0.45), 0.06, 0xdfe4e8, 0.16 * k0, 0.05);
      }
      V.stats.breath++;
    };

    /* ------------------------------------------------ сорока и капли */
    const MAG = { t: rnd(8, 20), spot: null };
    V.ambient = (dt, ctx) => {
      /* капли с веток по каске: под кронами, в дождь и ещё минуту после */
      V._wetT = ctx.rain > 0.1 ? 60 : Math.max(0, (V._wetT || 0) - dt);
      if (ctx.me && ctx.helmet && (ctx.rain > 0.1 || V._wetT > 0) && audio.helmetDrip) {
        const r = (0.4 + 2.5 * (ctx.rain || 0)) * (0.3 + 0.7 * (ctx.canopy || 0)) * (ctx.rain > 0.1 ? 1 : V._wetT / 60);
        if (Math.random() < dt * r) audio.helmetDrip(rnd(0.3, 1));
      }
      /* сорока: сидит в лесу; когда человек ближе ~25 м — трещит и
         перелетает (лесная «сигнализация», выдаёт движение) */
      /* v21: птиц нет — сорока выключена */
      MAG.t -= dt;
      if (false && MAG.t <= 0 && ctx.me && ctx.pos && audio.magpie) {
        MAG.t = rnd(25, 70);
        if (!MAG.spot || Math.hypot(MAG.spot.x - ctx.pos.x, MAG.spot.z - ctx.pos.z) > 40) {
          const a = Math.random() * TAU, r = rnd(14, 26);
          MAG.spot = { x: ctx.pos.x + Math.cos(a) * r, z: ctx.pos.z + Math.sin(a) * r };
        }
      }
      if (false && MAG.spot && ctx.pos && ctx.me && audio.magpie) {
        const d = Math.hypot(MAG.spot.x - ctx.pos.x, MAG.spot.z - ctx.pos.z);
        if (d < 22 && (ctx.speed || 0) > 1.2) {
          _a.set(MAG.spot.x, gAt(MAG.spot.x, MAG.spot.z) + 8, MAG.spot.z);
          audio.magpie(sp(_a));
          if (audio.wings) audio.wings(sp(_a), 5);
          V.stats.magpie = (V.stats.magpie || 0) + 1;
          MAG.spot = null; MAG.t = rnd(40, 90);
        }
      }
    };

    /* ------------------------------------------------ кадр */
    const _p = new THREE.Vector3();
    V.frame = (dt, ctx) => {
      ctx = ctx || {};
      /* грязь: протирка (0,45 с — ладонь по стеклу), дождь смывает медленно */
      if (V.wipeT > 0) { V.wipeT -= dt; V.mud = Math.max(0, V.mud - dt * 2.4); }
      else V.mud = Math.max(0, V.mud - dt * (0.004 + 0.03 * (ctx.rain || 0)));
      V.conc = Math.max(0, V.conc - dt / 5.5);
      /* песок из пробитых мешков */
      const S = scars();
      for (let i = V.sand.length - 1; i >= 0; i--) {
        const q = V.sand[i];
        q.t += dt;
        if (q.t > q.dur) { V.sand.splice(i, 1); continue; }
        if (S && S.spawn) {
          const k = 1 - q.t / q.dur;
          for (let j = 0; j < 2; j++) S.spawn(q.p.x + rnd(-0.004, 0.004), q.p.y, q.p.z + rnd(-0.004, 0.004), q.n.x * 0.25 * k, -0.1, q.n.z * 0.25 * k,
            0.9, 0.012, 0.01, 0.9 * k + 0.1, 0.42, 0.36, 0.26, 1, 9.8, 0.3);
        }
      }
      const P = post();
      if (P && P.grade.uniforms.uShock) {
        const u = P.grade.uniforms;
        u.uMud.value = ctx.fp&&(globalThis.AEGIS_SETTINGS?.effects?.dirt!==false)?V.mud:0; u.uMudS.value = V.mudS;
        u.uConc.value = (ctx.fp||ctx.tp)&&globalThis.AEGIS_SETTINGS?.effects?.concussion!==false?V.conc:0;
        /* v25: кольцо преломления от взрыва убрано (рябь на экране);
           взрыв рядом передают пыль, грязь на объективе, контузия и звук */
        V.shocks.length = 0;
        u.uShock.value.w = 0;
      }
    };
    V.reset = () => { V.mud = 0; V.conc = 0; V.shocks.length = 0; V.sand.length = 0; };
    return V;
  }
  root.GV8 = { create };
})(typeof self !== 'undefined' ? self : this);
