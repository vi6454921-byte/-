
/* ==========================================================================
   МОДУЛЬ: fx.js
   ========================================================================== */
/* ============================================================================
   Эффекты: дульная вспышка, трассеры, попадания, пробоины, гильзы, пыль.

   Визуальные эффекты используют ограниченные пулы. Гильзы в игре ведёт
   Rapier: до 26 тел с повторным использованием; осевшие — InstancedMesh.
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
      const c = cv(128), g = c.getContext('2d', { willReadFrequently: true });
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
      const c = cv(256), g = c.getContext('2d', { willReadFrequently: true });
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
      const c = cv(128), g = c.getContext('2d', { willReadFrequently: true });
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
      const c = cv(64), g = c.getContext('2d', { willReadFrequently: true });
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
    /* v7: боковые факелы дульного тормоза (АК-74: два окна по бокам — газ
       уходит вбок «крестом») и верхние — компенсатора (окна сверху) */
    const portGeo = new THREE.ConeGeometry(0.018, 0.085, 10, 1, true);
    portGeo.translate(0, -0.0425, 0);
    const mkPort = (rx, rz, x, y) => {
      const m = new THREE.Mesh(portGeo, flash.jet.material.clone());
      m.rotation.set(rx, 0, rz); m.position.set(x, y, 0.012); m.visible = false;
      flash.rig.add(m); return m;
    };
    flash.ports = {
      brake: [mkPort(0, Math.PI / 2, -0.012, 0), mkPort(0, -Math.PI / 2, 0.012, 0)],
      comp: [mkPort(Math.PI, 0, 0, 0.012)]
    };
    flash.kind = 'bare';
    fx.group.add(flash.rig);
    fx.flashRig = flash.rig;

    /* ------------------------------------------------------- трассеры */
    /* Трассер — короткий отрезок, летящий по траектории пули, а не линия
       во всю дистанцию. Раньше рисовался весь путь сразу и держался 75 мс:
       получался «лазерный луч». Теперь виден быстрый штрих длиной ~8 м,
       который уходит к цели со скоростью пули. */
    const TR_N = 40;
    const trGeo = new THREE.BufferGeometry();
    const trPos = new Float32Array(TR_N * 2 * 3);
    const trCol = new Float32Array(TR_N * 2 * 3);
    trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3));
    trGeo.setAttribute('color', new THREE.BufferAttribute(trCol, 3));
    const tracers = new THREE.LineSegments(trGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    }));
    tracers.frustumCulled = false;
    fx.group.add(tracers);
    const trPool = [];
    for (let i = 0; i < TR_N; i++) trPool.push({
      t: 99, ttl: 0.4, hot: 1, dist: 0, speed: 900,
      from: new THREE.Vector3(), dir: new THREE.Vector3(),
      a: new THREE.Vector3(), b: new THREE.Vector3()
    });
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

    /* Projected bullet impacts: one fixed geometry/material pool, no flat overlays. */
    const marks = new globalThis.GBulletImpacts.Decals(fx.group, { maxDecals: 96, layer: 0, parallax: true });
    marks.mesh.name = 'bulletImpacts';
    marks.mesh.userData.noAO = true;
    fx.bulletImpacts = marks;
    const proxy = new THREE.Mesh();
    proxy.matrixAutoUpdate = false;
    const instanceMatrix = new THREE.Matrix4();
    const normalMatrix = new THREE.Matrix3();
    const hitRay = new THREE.Raycaster();
    hitRay.layers.enableAll();   // v24: оригиналы склеенных мешей (29d_batch) и мелочь вдали лежат на скрытых слоях
    const rayDir = new THREE.Vector3();
    let impactRoots = [];
    fx.setImpactWorld = (roots) => { impactRoots = roots.filter(Boolean); };
    // Geometric normal: inverse transpose, including an instanced mesh's transform.
    fx.hitNormal = (hit, direction) => {
      const n = hit.face ? hit.face.normal.clone() : direction.clone().negate();
      if (hit.face) {
        instanceMatrix.copy(hit.object.matrixWorld);
        if (hit.object.isInstancedMesh && hit.instanceId !== undefined) {
          hit.object.getMatrixAt(hit.instanceId, proxy.matrix);
          instanceMatrix.multiply(proxy.matrix);
        }
        n.applyMatrix3(normalMatrix.getNormalMatrix(instanceMatrix)).normalize();
      }
      if (n.dot(direction) > 0) n.negate();
      return n;
    };
    fx.impactSurface = (kind,target,hit) => globalThis.GImpactSurfaces.surface(kind,target,hit);

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
    let casePhysics = null;
    function releaseCase(c) {
      if (c.physics) c.physics.disableObject(c);
      c.o.visible = false;
    }
    fx.setCasePhysics = (physics) => {
      if (casePhysics === physics) return;
      for (const c of cases) {
        if (c.physics) c.physics.removeObject(c);
        c.physics = null; c.o.visible = false;
      }
      casePhysics = physics;
    };
    fx.caseStats = () => ({
      backend: casePhysics ? 'Rapier' : 'legacy-standalone',
      capacity: CASE_N,
      active: cases.filter(c => c.o.visible).length,
      allocated: cases.filter(c => c.physics).length,
      spent: spent.count,
    });
    /* v6: улёгшиеся гильзы переходят в один InstancedMesh и остаются лежать
       (до 600 штук, дальше затираются самые старые) — как на настоящем рубеже */
    const SPENT_N = 600;
    const spent = new THREE.InstancedMesh(caseGeo, new THREE.MeshStandardMaterial({ color: 0xa07f3a, roughness: 0.42, metalness: 0.85 }), SPENT_N);
    spent.count = 0; spent.castShadow = false; spent.receiveShadow = true; spent.frustumCulled = false; spent.name = 'spentBrass';
    fx.group.add(spent);
    let spentI = 0;
    fx.spentCount = () => spent.count;

    /* ======================================================== API ====== */
    /* v9: noVis — пламя рисует WK.ShotFX (эффекты оружейной), здесь только свет */
    fx.muzzleFlash = (power, kind, noVis) => {
      flash.t = 0;
      flash.kind = kind || 'bare';
      fx.lastFlash = { t: performance.now(), power: power === undefined ? 1 : power };
      for (const k in flash.ports) for (const m of flash.ports[k]) {
        m.visible = k === flash.kind && (power === undefined || power > 0.3);
        m.scale.set(U.lerp(0.8, 1.3, Math.random()), U.lerp(0.75, 1.35, Math.random()), 1);
      }
      flash.power = power === undefined ? 1 : power;
      flash.star.material.rotation = Math.random() * TAU;
      flash.jet.scale.set(U.lerp(0.8, 1.25, Math.random()), U.lerp(0.8, 1.25, Math.random()), U.lerp(0.75, 1.3, Math.random()));
      flash.core.visible = flash.glow.visible = flash.star.visible = flash.jet.visible = true;
      flash.noVis = !!noVis;
      if (noVis) for (const k in flash.ports) for (const m of flash.ports[k]) m.visible = false;
    };

    /* a — дульный срез, b — точка попадания. Трассер летит от a к b. */
    /* v22: vis — принудительная видимость (лента M2HB: каждый 4-й — трассер); без него — случайно 32 % */
    fx.tracer = (a, b, hot, speed, path, vis) => {
      const t = trPool[trI = (trI + 1) % TR_N];
      t.path=path||null;
      t.from.copy(a);
      t.dir.subVectors(b, a);
      t.dist = t.dir.length();
      if (t.dist < 1e-4) return;
      t.dir.divideScalar(t.dist);
      t.speed = speed || 900;
      /* живёт ровно столько, сколько летит пуля (плюс догорание) */
      t.ttl = (path?path[path.length-1].t:t.dist / t.speed) + 0.02;
      t.t = 0;
      t.hot = hot === undefined ? 1 : hot;
      /* Не каждая пуля трассирующая: в ленте обычно один трассер на 4-5
         обычных патронов, поэтому большинство выстрелов видно только по
         вспышке и попаданию. */
      t.visible = vis === undefined ? Math.random() < 0.32 : !!vis;
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

    fx.smoke = (p, n, vel, size, color, op, buoy) => {
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
        /* цвет, плотность и плавучесть: пороховой дым всплывает, пыль и
           кровяная взвесь оседают */
        s.o.material.color.set(color === undefined || color === null ? 0xb9b3a6 : color);
        s.op = op === undefined ? 1 : op;
        s.buoy = buoy === undefined ? 0.30 : buoy;
        s.rot = Math.random() * TAU;
        s.spin = (Math.random() - 0.5) * 1.4;
      }
    };

    /* point/normal/direction are world-space. Explicit hit mesh avoids extra raycasts. */
    fx.decal = (point, normal, size, parent, kind, target, direction, instanceId, hitInfo) => {
      let hit = null;
      if (!target && impactRoots.length) {
        rayDir.copy(normal).normalize().negate();
        hitRay.set(point.clone().addScaledVector(normal, 0.025), rayDir);
        hitRay.near = 0; hitRay.far = 0.08;
        hit = hitRay.intersectObjects(impactRoots, true)[0];
        if (hit) { target = hit.object; instanceId = hit.instanceId; }
      }
      if (!target || target.isSkinnedMesh) return;
      // Resolve missing UV/face data once at contact, not once per frame.
      if(!hitInfo){target.updateWorldMatrix(true,false);hitRay.set(point.clone().addScaledVector(normal,.025),normal.clone().negate());hitRay.near=0;hitRay.far=.065;
        hitInfo=hitRay.intersectObject(target,false).find(h=>instanceId===undefined||h.instanceId===instanceId);}
      const surface = fx.impactSurface(kind, target,hitInfo);
      if (!surface) return;
      target.updateWorldMatrix(true, false);
      const tint=globalThis.GImpactSurfaces.tint(target,hitInfo,surface),grain=globalThis.GImpactSurfaces.grain(target,hitInfo);
      if (target.isInstancedMesh) {
        if (instanceId === undefined) return;
        // A persistent per-mark proxy, never the old shared mutable proxy.
        const owner=target,index=instanceId,part=new THREE.Mesh(owner.geometry,owner.material);
        part.matrixAutoUpdate=false;part.userData.impactSource=owner;part.userData.impactInstance=index;part.userData.grainAxis=owner.userData.grainAxis;
        part.updateMatrixWorld=()=>{owner.updateWorldMatrix(true,false);owner.getMatrixAt(index,instanceMatrix);part.matrixWorld.multiplyMatrices(owner.matrixWorld,instanceMatrix);};
        part.updateMatrixWorld(true);target=part;
      }
      marks.add(point, normal, surface, parent || undefined, direction || normal.clone().negate(), 1, target,tint,grain);
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
      if (casePhysics) {
        c.physics = casePhysics; c.seenImpact = 0;
        casePhysics.resetObject(c, {
          pos: c.o.position, q: c.o.quaternion, vel: c.v, spin: c.w,
          mass: 0.006, radius: 0.0046, capsule: 0.0149,
          colliderRotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 },
          // Debris group 16, static-only: no blocking KCC, no brass/brass pairs.
          collisionGroups: 0x00100001, kind: 'brass', reportContacts: true, softCcdPrediction: 0.1,
          friction: 0.65, restitution: 0.28, drag: 0.08, angularDamping: 0.6, contactAngularDamping: 8, settleRadius: 0.0195,
        });
      }
    };

    /* Попадание: набор эффектов по типу поверхности. */
    fx.impact = (point, normal, kind, parent, target, direction, instanceId, hitInfo) => {
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
      fx.decal(point, out, kind === 'target' ? 0.036 : 0.052, parent, kind, target, direction, instanceId,hitInfo);
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
        if (flash.noVis) { flash.light.intensity = a * 26; flash.core.material.opacity = flash.glow.material.opacity = flash.star.material.opacity = flash.jet.material.opacity = 0; }
        else {
        flash.core.material.opacity = a;
        flash.core.scale.setScalar(0.050 * (0.75 + 0.5 * u));
        flash.glow.material.opacity = a * 0.78;
        flash.glow.scale.setScalar(0.145 * (0.7 + 0.85 * u));
        flash.star.material.opacity = a * 0.9;
        flash.star.scale.setScalar(0.245 * (0.55 + 0.95 * u));
        flash.jet.material.opacity = a * (flash.kind === 'brake' ? 0.35 : 0.6);
        for (const k in flash.ports) for (const m of flash.ports[k]) if (m.visible) m.material.opacity = a * 0.75;
        flash.light.intensity = a * 26;
        }
      } else if (flash.core.visible) {
        flash.core.visible = flash.glow.visible = flash.star.visible = flash.jet.visible = false;
        for (const k in flash.ports) for (const m of flash.ports[k]) m.visible = false;
        flash.light.intensity = 0;
      }

      /* трассеры: штрих движется по траектории со скоростью пули */
      let ti = 0;
      const TR_LEN = 7.5;                    // длина светящегося участка, м
      for (let i = 0; i < TR_N; i++) {
        const t = trPool[i];
        const k = i * 6;
        if (t.t >= t.ttl || !t.visible) {
          trCol[k] = trCol[k + 1] = trCol[k + 2] = 0;
          trCol[k + 3] = trCol[k + 4] = trCol[k + 5] = 0;
          continue;
        }
        t.t += dt;
        /* положение головы штриха вдоль траектории */
        const head = Math.min(t.dist, t.t * t.speed);
        const tail = Math.max(0, head - TR_LEN);
        /* гаснет на подлёте к цели */
        const f = Math.pow(1 - U.clamp01(t.t / t.ttl), 0.8) * t.hot;
        trPos[k] = t.from.x + t.dir.x * tail;
        trPos[k + 1] = t.from.y + t.dir.y * tail;
        trPos[k + 2] = t.from.z + t.dir.z * tail;
        trPos[k + 3] = t.from.x + t.dir.x * head;
        trPos[k + 4] = t.from.y + t.dir.y * head;
        trPos[k + 5] = t.from.z + t.dir.z * head;
        if(t.path){const at=time=>{const pp=t.path;let j=1;while(j<pp.length-1&&pp[j].t<time)j++;const a=pp[j-1],b=pp[j],f=U.clamp01((time-a.t)/Math.max(.00001,b.t-a.t));return a.p.clone().lerp(b.p,f);};const h=at(t.t),a=at(Math.max(0,t.t-TR_LEN/t.speed));trPos[k]=a.x;trPos[k+1]=a.y;trPos[k+2]=a.z;trPos[k+3]=h.x;trPos[k+4]=h.y;trPos[k+5]=h.z;}
        /* хвост тусклее головы */
        trCol[k] = 0.5 * f; trCol[k + 1] = 0.22 * f; trCol[k + 2] = 0.06 * f;
        trCol[k + 3] = 1.5 * f; trCol[k + 4] = 0.78 * f; trCol[k + 5] = 0.30 * f;
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
        if(window.AEGIS_WIND){const w=window.AEGIS_WIND(s.o.position.x,s.o.position.y,s.o.position.z);s.v.x+=(w.x-s.v.x)*Math.min(1,dt*1.6);s.v.z+=(w.z-s.v.z)*Math.min(1,dt*1.6);}else s.v.multiplyScalar(1-Math.min(1,1.6*dt));
        s.v.y += (s.buoy === undefined ? 0.30 : s.buoy) * dt;
        s.o.position.addScaledVector(s.v, dt);
        s.rot += s.spin * dt;
        s.o.material.rotation = s.rot;
        s.o.material.opacity = 0.32 * (s.op === undefined ? 1 : s.op) * Math.sin(Math.PI * Math.pow(u, 0.55)) * (1 - u * 0.2);
        s.o.scale.setScalar(s.r0 * (1 + 3.4 * u));
      }

      marks.update(dt);

      /* гильзы */
      for (let i = 0; i < CASE_N; i++) {
        const c = cases[i];
        if (!c.o.visible) continue;
        c.t += dt;
        if (c.t > c.ttl) { releaseCase(c); continue; }
        if (c.physics) {
          const o = c.physics.readObject(c, c.o.position, c.o.quaternion, c.v);
          if (!o) { c.o.visible = false; c.physics = null; continue; }
          if (o.impacts > c.seenImpact) {
            c.seenImpact = o.impacts;
            if (o.impactSpeed > 0.25 && fx.onCaseLand)
              fx.onCaseLand(Math.min(1, o.impactSpeed * 0.5), c.o.position);
          }
          c.rest = o.body.isSleeping();
          if (c.rest) {
            // Bake the solved pose, not an Euler-flattened approximation of the floor.
            c.o.position.copy(o.curr); c.o.quaternion.copy(o.currQ);
          }
        }
        if (c.rest && c.t > 0.6) {
          c.o.updateMatrix();
          spent.setMatrixAt(spentI, c.o.matrix);
          spentI = (spentI + 1) % SPENT_N; spent.count = Math.max(spent.count, spentI === 0 ? SPENT_N : spentI);
          spent.instanceMatrix.needsUpdate = true;
          releaseCase(c); continue;
        }
        if (!c.rest && !c.physics) {
          c.v.y -= 9.81 * dt;
          c.o.position.addScaledVector(c.v, dt);
          c.o.rotateX(c.w.x * dt); c.o.rotateY(c.w.y * dt); c.o.rotateZ(c.w.z * dt);
          const gy = (fx.groundAt ? fx.groundAt(c.o.position.x, c.o.position.z) : (groundY === undefined ? 0 : groundY)) + 0.006;
          if (c.o.position.y <= gy) {
            c.o.position.y = gy;
            if (Math.abs(c.v.y) < 0.4) { c.rest = true; c.t = 0; c.v.set(0, 0, 0); c.o.rotation.x = Math.round(c.o.rotation.x / Math.PI) * Math.PI; c.o.rotation.z = 0; if (fx.onCaseLand) fx.onCaseLand(0.4, c.o.position); }
            else {
              if (fx.onCaseLand) fx.onCaseLand(Math.min(1, Math.abs(c.v.y) * 0.5), c.o.position);
              c.v.y = -c.v.y * 0.32;
              c.v.x *= 0.52; c.v.z *= 0.52;
              c.w.multiplyScalar(0.44);
            }
          }
        }

      }
    };

    fx.dispose = () => {
      fx.setCasePhysics(null);
      marks.dispose();
      impactRoots = [];
      scene.remove(fx.group);
    };
    return fx;
  }

  return { create, makeTextures };
});