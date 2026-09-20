/* ============================================================================
   Эффекты: дульная вспышка, трассеры, попадания, пробоины, гильзы, пыль.

   Все системы — пулы фиксированного размера: во время боя новые объекты
   не создаются, GC не дёргается, кадр держится ровным.
   ========================================================================== */
(function (root, factory) {
  const F = factory(root.GUtil);
  if (typeof module !== 'undefined' && module.exports) module.exports = F;
  else root.GFX = F;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  const TAU = Math.PI * 2;

  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }

  function makeTextures(THREE) {
    const tex = (c) => {
      const t = new THREE.CanvasTexture(c);
      if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    };

    /* ядро вспышки */
    const glow = (() => {
      const c = cv(128), g = c.getContext('2d');
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,255,250,1)');
      r.addColorStop(0.16, 'rgba(255,244,200,.95)');
      r.addColorStop(0.38, 'rgba(255,190,92,.44)');
      r.addColorStop(0.68, 'rgba(255,122,34,.12)');
      r.addColorStop(1, 'rgba(255,92,14,0)');
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
      return tex(c);
    })();

    /* звёздчатый факел */
    const star = (() => {
      const c = cv(256), g = c.getContext('2d');
      g.translate(128, 128);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + Math.random() * 0.2;
        const len = 116 * (0.4 + Math.random() * 0.6);
        const w = 0.05 + Math.random() * 0.08;
        const grd = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
        grd.addColorStop(0, 'rgba(255,250,224,.95)');
        grd.addColorStop(0.35, 'rgba(255,200,108,.4)');
        grd.addColorStop(1, 'rgba(255,118,28,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(Math.cos(a) * len, Math.sin(a) * len);
        g.lineTo(Math.cos(a - w) * 15, Math.sin(a - w) * 15);
        g.lineTo(Math.cos(a + w) * 15, Math.sin(a + w) * 15);
        g.closePath(); g.fill();
      }
      const r = g.createRadialGradient(0, 0, 0, 0, 0, 42);
      r.addColorStop(0, 'rgba(255,255,246,1)');
      r.addColorStop(0.45, 'rgba(255,224,148,.5)');
      r.addColorStop(1, 'rgba(255,148,48,0)');
      g.fillStyle = r; g.beginPath(); g.arc(0, 0, 42, 0, TAU); g.fill();
      return tex(c);
    })();

    /* клуб дыма */
    const smoke = (() => {
      const c = cv(128), g = c.getContext('2d');
      for (let i = 0; i < 26; i++) {
        const x = 64 + (Math.random() - 0.5) * 60, y = 64 + (Math.random() - 0.5) * 60;
        const rad = 14 + Math.random() * 30;
        const r = g.createRadialGradient(x, y, 0, x, y, rad);
        r.addColorStop(0, 'rgba(255,255,255,.16)');
        r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
      }
      const m = g.createRadialGradient(64, 64, 10, 64, 64, 64);
      m.addColorStop(0, 'rgba(0,0,0,0)');
      m.addColorStop(.72, 'rgba(0,0,0,0)');
      m.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = m; g.fillRect(0, 0, 128, 128);
      return tex(c);
    })();

    /* пробоина: тёмное отверстие с вырванными краями */
    const hole = (() => {
      const c = cv(64), g = c.getContext('2d');
      const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      r.addColorStop(0, 'rgba(8,8,9,.96)');
      r.addColorStop(0.35, 'rgba(18,17,16,.85)');
      r.addColorStop(0.62, 'rgba(46,42,36,.42)');
      r.addColorStop(1, 'rgba(60,55,48,0)');
      g.fillStyle = r; g.beginPath(); g.arc(32, 32, 30, 0, TAU); g.fill();
      /* рваные лучи по краю */
      g.strokeStyle = 'rgba(14,13,12,.5)';
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * TAU, l = 8 + Math.random() * 13;
        g.lineWidth = 0.6 + Math.random() * 1.6;
        g.beginPath();
        g.moveTo(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6);
        g.lineTo(32 + Math.cos(a) * l, 32 + Math.sin(a) * l);
        g.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();

    return { glow, star, smoke, hole };
  }

  /* =========================================================== система == */
  function create(THREE, scene) {
    const TEX = makeTextures(THREE);
    const fx = { group: new THREE.Group() };
    fx.group.name = 'fx';
    scene.add(fx.group);

    /* ------------------------------------------------- дульная вспышка */
    const mkSprite = (tex, col) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: col, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
      }));
      s.visible = false;
      return s;
    };
    const flash = {
      rig: new THREE.Object3D(),
      core: mkSprite(TEX.glow, 0xffffff),
      glow: mkSprite(TEX.glow, 0xffd49a),
      star: mkSprite(TEX.star, 0xffc784),
      light: new THREE.PointLight(0xffb060, 0, 9, 2),
      t: 99, power: 1
    };
    flash.core.position.z = -0.006;
    flash.glow.position.z = -0.016;
    flash.star.position.z = -0.022;
    flash.rig.add(flash.core, flash.glow, flash.star, flash.light);
    /* факел вперёд */
    const jetGeo = new THREE.ConeGeometry(0.030, 0.13, 12, 1, true);
    jetGeo.translate(0, -0.065, 0);
    jetGeo.rotateX(-Math.PI / 2);
    flash.jet = new THREE.Mesh(jetGeo, new THREE.MeshBasicMaterial({
      color: 0xffb765, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, side: THREE.DoubleSide
    }));
    flash.jet.visible = false;
    flash.rig.add(flash.jet);
    fx.group.add(flash.rig);
    fx.flashRig = flash.rig;

    /* ------------------------------------------------------- трассеры */
    /* Трассер — вытянутый спрайт-линия вдоль траектории. Живёт 60-90 мс,
       поэтому при очереди видно «пунктир» уходящих пуль. */
    const TR_N = 40;
    const trGeo = new THREE.BufferGeometry();
    const trPos = new Float32Array(TR_N * 2 * 3);
    const trCol = new Float32Array(TR_N * 2 * 3);
    trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3));
    trGeo.setAttribute('color', new THREE.BufferAttribute(trCol, 3));
    const tracers = new THREE.LineSegments(trGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    }));
    tracers.frustumCulled = false;
    fx.group.add(tracers);
    const trPool = [];
    for (let i = 0; i < TR_N; i++) trPool.push({ t: 99, ttl: 0.08, a: new THREE.Vector3(), b: new THREE.Vector3(), hot: 1 });
    let trI = 0;

    /* ----------------------------------------------------------- искры */
    const SPK_N = 260;
    const spkGeo = new THREE.BufferGeometry();
    const spkPos = new Float32Array(SPK_N * 3);
    const spkCol = new Float32Array(SPK_N * 3);
    spkGeo.setAttribute('position', new THREE.BufferAttribute(spkPos, 3));
    spkGeo.setAttribute('color', new THREE.BufferAttribute(spkCol, 3));
    const sparks = new THREE.Points(spkGeo, new THREE.PointsMaterial({
      size: 0.022, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, toneMapped: false
    }));
    sparks.frustumCulled = false;
    fx.group.add(sparks);
    const spk = [];
    for (let i = 0; i < SPK_N; i++) spk.push({ t: 99, ttl: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), hot: 1 });
    let spkI = 0;

    /* ------------------------------------------------------------ дым */
    const SMK_N = 34;
    const smokePool = [];
    for (let i = 0; i < SMK_N; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.smoke, color: 0xb9b3a6, transparent: true, opacity: 0,
        depthWrite: false, toneMapped: false
      }));
      s.visible = false;
      fx.group.add(s);
      smokePool.push({ o: s, t: 99, ttl: 1, v: new THREE.Vector3(), r0: 0.05, rot: 0, spin: 0 });
    }
    let smkI = 0;

    /* -------------------------------------------------------- пробоины */
    /* Декали — плоскости с текстурой отверстия, лежащие на поверхности.
       Пул кольцевой: старые тают и переиспользуются. */
    const DEC_N = 90;
    const decGeo = new THREE.PlaneGeometry(1, 1);
    const decals = [];
    for (let i = 0; i < DEC_N; i++) {
      const m = new THREE.Mesh(decGeo, new THREE.MeshBasicMaterial({
        map: TEX.hole, transparent: true, opacity: 0, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
      }));
      m.visible = false;
      m.renderOrder = 3;
      fx.group.add(m);
      decals.push({ o: m, t: 99, ttl: 24, parent: null });
    }
    let decI = 0;

    /* --------------------------------------------------------- гильзы */
    const CASE_N = 26;
    const caseGeo = new THREE.CylinderGeometry(0.0046, 0.0040, 0.039, 8, 1);
    caseGeo.rotateZ(Math.PI / 2);
    const caseMat = new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: 0.34, metalness: 0.92 });
    const cases = [];
    for (let i = 0; i < CASE_N; i++) {
      const m = new THREE.Mesh(caseGeo, caseMat);
      m.visible = false;
      m.castShadow = true;
      fx.group.add(m);
      cases.push({ o: m, t: 99, ttl: 6, v: new THREE.Vector3(), w: new THREE.Vector3(), rest: false, y0: 0 });
    }
    let caseI = 0;

    /* ======================================================== API ====== */
    fx.muzzleFlash = (power) => {
      flash.t = 0;
      flash.power = power === undefined ? 1 : power;
      flash.star.material.rotation = Math.random() * TAU;
      flash.jet.scale.set(U.lerp(0.8, 1.25, Math.random()), U.lerp(0.8, 1.25, Math.random()), U.lerp(0.75, 1.3, Math.random()));
      flash.core.visible = flash.glow.visible = flash.star.visible = flash.jet.visible = true;
    };

    fx.tracer = (a, b, hot) => {
      const t = trPool[trI = (trI + 1) % TR_N];
      t.t = 0; t.ttl = 0.075; t.a.copy(a); t.b.copy(b); t.hot = hot === undefined ? 1 : hot;
    };

    fx.sparks = (p, n, dir, spread, hot) => {
      for (let i = 0; i < n; i++) {
        const s = spk[spkI = (spkI + 1) % SPK_N];
        s.t = 0; s.ttl = U.lerp(0.14, 0.42, Math.random());
        s.p.copy(p);
        s.v.set(
          dir.x + (Math.random() - 0.5) * spread,
          dir.y + (Math.random() - 0.5) * spread,
          dir.z + (Math.random() - 0.5) * spread
        ).normalize().multiplyScalar(U.lerp(1.4, 5.2, Math.random()));
        s.hot = hot === undefined ? 1 : hot;
      }
    };

    fx.smoke = (p, n, vel, size) => {
      for (let i = 0; i < n; i++) {
        const s = smokePool[smkI = (smkI + 1) % SMK_N];
        s.t = 0; s.ttl = U.lerp(0.75, 1.65, Math.random());
        s.o.position.copy(p);
        s.o.visible = true;
        s.v.set(
          (vel ? vel.x : 0) + (Math.random() - 0.5) * 0.5,
          (vel ? vel.y : 0) + Math.random() * 0.35,
          (vel ? vel.z : 0) + (Math.random() - 0.5) * 0.5
        );
        s.r0 = (size || 0.07) * U.lerp(0.7, 1.4, Math.random());
        s.rot = Math.random() * TAU;
        s.spin = (Math.random() - 0.5) * 1.4;
      }
    };

    /* Пробоина: кладём декаль в точку попадания, ориентируя по нормали.
       Если поверхность движется (мишень), декаль крепится к её узлу. */
    fx.decal = (point, normal, size, parent) => {
      const d = decals[decI = (decI + 1) % DEC_N];
      if (d.parent) d.parent.remove(d.o); else fx.group.remove(d.o);
      const host = parent || fx.group;
      host.add(d.o);
      d.parent = parent || null;
      if (parent) {
        d.o.position.copy(parent.worldToLocal(point.clone()));
        const q = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
        const ln = normal.clone().applyQuaternion(q);
        d.o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ln.normalize());
      } else {
        d.o.position.copy(point);
        d.o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
      }
      d.o.translateZ(0.0025);
      d.o.rotateZ(Math.random() * TAU);
      const s = (size || 0.045) * U.lerp(0.85, 1.2, Math.random());
      d.o.scale.set(s, s, 1);
      d.o.material.opacity = 0.96;
      d.o.visible = true;
      d.t = 0;
      d.ttl = 26;
    };

    fx.ejectCase = (pos, dir, up) => {
      const c = cases[caseI = (caseI + 1) % CASE_N];
      c.o.position.copy(pos);
      c.o.rotation.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
      c.o.visible = true;
      c.o.scale.setScalar(1);
      c.t = 0; c.ttl = 7; c.rest = false;
      c.y0 = 0;
      c.v.copy(dir).multiplyScalar(U.lerp(2.4, 3.6, Math.random()))
        .addScaledVector(up, U.lerp(0.7, 1.5, Math.random()));
      c.w.set((Math.random() - 0.5) * 34, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 34);
    };

    /* Попадание: набор эффектов по типу поверхности. */
    fx.impact = (point, normal, kind, parent) => {
      const out = normal.clone().normalize();
      if (kind === 'metal') {
        fx.sparks(point, 14, out, 1.5, 1.25);
        fx.smoke(point, 1, out.clone().multiplyScalar(0.6), 0.05);
      } else if (kind === 'ground') {
        fx.sparks(point, 5, out, 1.8, 0.35);
        fx.smoke(point, 3, out.clone().multiplyScalar(1.0), 0.13);
      } else if (kind === 'wood') {
        fx.sparks(point, 7, out, 1.4, 0.55);
        fx.smoke(point, 2, out.clone().multiplyScalar(0.7), 0.07);
      } else {
        fx.sparks(point, 8, out, 1.5, 0.8);
        fx.smoke(point, 2, out.clone().multiplyScalar(0.8), 0.08);
      }
      fx.decal(point, out, kind === 'target' ? 0.036 : 0.052, parent);
    };

    /* ========================================================= update == */
    const _v = new THREE.Vector3();
    fx.update = (dt, groundY) => {
      /* вспышка */
      flash.t += dt;
      const FD = 0.058;
      if (flash.t <= FD) {
        const u = flash.t / FD;
        const rise = Math.min(1, flash.t / 0.004);
        const a = rise * Math.pow(1 - u, 2.3) * flash.power;
        flash.core.material.opacity = a;
        flash.core.scale.setScalar(0.050 * (0.75 + 0.5 * u));
        flash.glow.material.opacity = a * 0.78;
        flash.glow.scale.setScalar(0.145 * (0.7 + 0.85 * u));
        flash.star.material.opacity = a * 0.9;
        flash.star.scale.setScalar(0.245 * (0.55 + 0.95 * u));
        flash.jet.material.opacity = a * 0.6;
        flash.light.intensity = a * 26;
      } else if (flash.core.visible) {
        flash.core.visible = flash.glow.visible = flash.star.visible = flash.jet.visible = false;
        flash.light.intensity = 0;
      }

      /* трассеры */
      let ti = 0;
      for (let i = 0; i < TR_N; i++) {
        const t = trPool[i];
        const k = i * 6;
        if (t.t >= t.ttl) {
          trCol[k] = trCol[k + 1] = trCol[k + 2] = 0;
          trCol[k + 3] = trCol[k + 4] = trCol[k + 5] = 0;
          continue;
        }
        t.t += dt;
        const f = Math.pow(1 - U.clamp01(t.t / t.ttl), 1.6) * t.hot;
        trPos[k] = t.a.x; trPos[k + 1] = t.a.y; trPos[k + 2] = t.a.z;
        trPos[k + 3] = t.b.x; trPos[k + 4] = t.b.y; trPos[k + 5] = t.b.z;
        trCol[k] = 1.5 * f; trCol[k + 1] = 0.82 * f; trCol[k + 2] = 0.34 * f;
        trCol[k + 3] = 1.5 * f * 0.4; trCol[k + 4] = 0.7 * f * 0.4; trCol[k + 5] = 0.3 * f * 0.4;
        ti++;
      }
      trGeo.attributes.position.needsUpdate = true;
      trGeo.attributes.color.needsUpdate = true;
      tracers.visible = ti > 0;

      /* искры */
      let anySpk = false;
      for (let i = 0; i < SPK_N; i++) {
        const s = spk[i], k = i * 3;
        if (s.t >= s.ttl) { spkCol[k] = spkCol[k + 1] = spkCol[k + 2] = 0; continue; }
        anySpk = true;
        s.t += dt;
        s.v.y -= 9.81 * dt;
        s.v.multiplyScalar(1 - Math.min(1, 3.2 * dt));
        s.p.addScaledVector(s.v, dt);
        const u = U.clamp01(s.t / s.ttl), f = Math.pow(1 - u, 1.7) * s.hot;
        spkPos[k] = s.p.x; spkPos[k + 1] = s.p.y; spkPos[k + 2] = s.p.z;
        spkCol[k] = 1.7 * f; spkCol[k + 1] = 0.74 * f * f; spkCol[k + 2] = 0.22 * f * f * f;
      }
      spkGeo.attributes.position.needsUpdate = true;
      spkGeo.attributes.color.needsUpdate = true;
      sparks.visible = anySpk;

      /* дым */
      for (let i = 0; i < SMK_N; i++) {
        const s = smokePool[i];
        if (s.t >= s.ttl) { if (s.o.visible) s.o.visible = false; continue; }
        s.t += dt;
        const u = U.clamp01(s.t / s.ttl);
        s.v.multiplyScalar(1 - Math.min(1, 1.6 * dt));
        s.v.y += 0.30 * dt;
        s.o.position.addScaledVector(s.v, dt);
        s.rot += s.spin * dt;
        s.o.material.rotation = s.rot;
        s.o.material.opacity = 0.32 * Math.sin(Math.PI * Math.pow(u, 0.55)) * (1 - u * 0.2);
        s.o.scale.setScalar(s.r0 * (1 + 3.4 * u));
      }

      /* декали тают */
      for (let i = 0; i < DEC_N; i++) {
        const d = decals[i];
        if (!d.o.visible) continue;
        d.t += dt;
        if (d.t > d.ttl) { d.o.visible = false; continue; }
        if (d.t > d.ttl - 3) d.o.material.opacity = 0.96 * U.clamp01((d.ttl - d.t) / 3);
      }

      /* гильзы */
      for (let i = 0; i < CASE_N; i++) {
        const c = cases[i];
        if (!c.o.visible) continue;
        c.t += dt;
        if (c.t > c.ttl) { c.o.visible = false; continue; }
        if (!c.rest) {
          c.v.y -= 9.81 * dt;
          c.o.position.addScaledVector(c.v, dt);
          c.o.rotateX(c.w.x * dt); c.o.rotateY(c.w.y * dt); c.o.rotateZ(c.w.z * dt);
          const gy = (groundY === undefined ? 0 : groundY) + 0.006;
          if (c.o.position.y <= gy) {
            c.o.position.y = gy;
            if (Math.abs(c.v.y) < 0.4) { c.rest = true; c.v.set(0, 0, 0); if (fx.onCaseLand) fx.onCaseLand(0.4); }
            else {
              if (fx.onCaseLand) fx.onCaseLand(Math.min(1, Math.abs(c.v.y) * 0.5));
              c.v.y = -c.v.y * 0.32;
              c.v.x *= 0.52; c.v.z *= 0.52;
              c.w.multiplyScalar(0.44);
            }
          }
        }
        if (c.t > c.ttl - 0.7) c.o.scale.setScalar(U.clamp01((c.ttl - c.t) / 0.7));
      }
    };

    fx.dispose = () => { scene.remove(fx.group); };
    return fx;
  }

  return { create, makeTextures };
});