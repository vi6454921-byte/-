/* AEGIS v6 — «шрамы» боя и мелкие следы взаимодействия с лесом.
   Всё, что игрок оставляет за собой и что лес отвечает на попадания:
   - следы ботинок в грязи и на сырой земле (декали с картой рельефа протектора);
   - натоптанность (слой 1 карты грунта, канал B) — тропы проявляются там, где ходят;
   - копоть и вывороченная земля от гранат (слой 1, каналы R/G);
   - пуля в землю: бурое облачко пыли и комья, трава вокруг срезается;
   - пуля в дерево: щепа, ствол вздрагивает (крона качается через общий
     шейдер ветра), сверху сыплется хвоя;
   - вода в воронках: всплеск и расходящиеся кольца (шаги, пули, гранаты).
   Подход — как в Battlefield / Hunt: Showdown: дешёвые «persistent decals»
   в кольцевом буфере + маски в текстуре мира вместо геометрии. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* протектор ботинка: высота (B/W) — грунт вдавлен, грунтозацепы выпуклые */
  function treadCanvas() {
    const W = 64, H = 160, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const sole = (path) => {
      g.beginPath();
      g.ellipse(W * 0.5, H * 0.30, W * 0.42, H * 0.27, 0, 0, TAU);          // носок + плюсна
      g.ellipse(W * 0.5, H * 0.78, W * 0.34, H * 0.18, 0, 0, TAU);          // каблук
      if (path) return;
      g.fill();
    };
    /* общий отпечаток — мягкая впадина */
    g.filter = 'blur(3px)'; g.fillStyle = '#fff'; sole(); g.filter = 'none';
    /* грунтозацепы: «ёлочка» на подошве и поперечные на каблуке */
    g.save(); sole(true); g.clip();
    g.fillStyle = '#5a5a5a';
    for (let y = 8; y < H * 0.56; y += 11) {
      g.save(); g.translate(W * 0.5, y);
      g.fillRect(-W * 0.42, -2.5, W * 0.36, 5); g.fillRect(W * 0.06, -2.5, W * 0.36, 5);
      g.restore();
    }
    for (let y = H * 0.64; y < H * 0.95; y += 10) g.fillRect(W * 0.16, y, W * 0.68, 5);
    g.restore();
    return c;
  }

  function create(THREE, o) {
    const scene = o.scene, world = o.world, camera = o.camera;
    const F = world.layout || {};
    const env = world.env;
    const S = { prints: 0, puffs: 0 };

    /* ======================================== частицы (одна точечная сетка) */
    const N = 1400;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 4), size = new Float32Array(N), kind = new Float32Array(N);
    const P = [];
    for (let i = 0; i < N; i++) P.push({ t: 0, ttl: 0, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, s0: 0, s1: 0, a0: 0, r: 0, g: 0, b: 0, k: 0, drag: 0, grav: 0, flut: 0, ph: 0, land: false });
    let pi = 0, live = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const uni = { uScale: { value: 400 }, uLight: { value: new THREE.Color(1, 1, 1) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: uni, transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec4 aCol; attribute float aSize, aKind;
        varying vec4 vCol; varying float vKind;
        uniform float uScale;
        void main() {
          vCol = aCol; vKind = aKind;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * uScale / max(0.05, -mv.z), 1.0, 256.0);
          if (aCol.a <= 0.001) gl_PointSize = 0.0;
        }`,
      fragmentShader: `
        varying vec4 vCol; varying float vKind;
        uniform vec3 uLight;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float r = dot(p, p);
          float a;
          if (vKind < 0.5) a = exp(-r * 2.6) * (1.0 - smoothstep(0.75, 1.0, r));   // облачко
          else if (vKind < 1.5) a = 1.0 - smoothstep(0.55, 0.9, r);                  // комок / капля
          else { float l = abs(p.x * 0.7071 + p.y * 0.7071), w = abs(p.x * 0.7071 - p.y * 0.7071);
                 a = (1.0 - smoothstep(0.08, 0.16, w)) * (1.0 - smoothstep(0.75, 1.0, l)); } // хвоинка
          if (a * vCol.a < 0.01) discard;
          gl_FragColor = vec4(vCol.rgb * uLight, a * vCol.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false; pts.renderOrder = 3; pts.name = 'scarFx';
    scene.add(pts);

    function spawn(x, y, z, vx, vy, vz, ttl, s0, s1, a0, r, g, b, k, grav, drag, flut) {
      const p = P[pi]; pi = (pi + 1) % N;
      p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.t = 0; p.ttl = ttl;
      p.s0 = s0; p.s1 = s1; p.a0 = a0; p.r = r; p.g = g; p.b = b; p.k = k; p.grav = grav; p.drag = drag;
      p.flut = flut || 0; p.ph = Math.random() * TAU; p.land = false;
      return p;
    }
    const gAt = (x, z) => (world.heightAt ? world.heightAt(x, z) : 0);

    /* ======================================== следы ботинок (декали) ===== */
    const PN = 420;
    const tc = treadCanvas();
    const bump = new THREE.CanvasTexture(tc);
    bump.colorSpace = THREE.NoColorSpace; bump.anisotropy = 4;
    const pGeo = new THREE.PlaneGeometry(0.115, 0.29);
    pGeo.rotateX(-Math.PI / 2);
    const aOp = new Float32Array(PN);
    pGeo.setAttribute('aOp', new THREE.InstancedBufferAttribute(aOp, 1));
    const pMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.10, 0.075, 0.05), roughness: 0.78, envMapIntensity: 0.4, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      bumpMap: bump, bumpScale: 3.0, alphaMap: bump, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    pMat.customProgramCacheKey = () => 'boot-print';
    pMat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float aOp;\nvarying float vOp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvOp = aOp;');
      sh.fragmentShader = 'varying float vOp;\n' + sh.fragmentShader
        .replace('#include <alphamap_fragment>', 'diffuseColor.a *= smoothstep(0.02, 0.5, texture2D(alphaMap, vAlphaMapUv).g) * vOp;');
    };
    const prints = new THREE.InstancedMesh(pGeo, pMat, PN);
    prints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    prints.count = 0; prints.frustumCulled = false; prints.receiveShadow = true; prints.name = 'bootPrints';
    scene.add(prints);
    let prI = 0;
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
    function normalAt(x, z) {
      const e = 0.2;
      return _n.set(gAt(x - e, z) - gAt(x + e, z), 2 * e, gAt(x, z - e) - gAt(x, z + e)).normalize();
    }
    /* мягкость грунта: грязь, сырость, дождь (0 — сухая хвоя, след не виден) */
    S.rain = 0;
    function softAt(x, z) {
      const m = world.mudAt ? world.mudAt(x, z) : 0, w = world.wetAt ? world.wetAt(x, z) : 0;
      return Math.min(1, Math.max(m * 1.25 - 0.12, w * 0.9 - 0.2) + S.rain * (0.25 + m * 0.5));
    }
    function inWater(x, z) {
      /* v8: ручей в овраге и болотные окна (world.waterAt — уровень воды или null) */
      if (world.waterAt) { const h = world.waterAt(x, z); if (h !== null && h !== undefined) return { h0: h, D: 0, zone: true }; }
      for (const c of (F.CRATERS || [])) {
        if (!c.water) continue;
        if (Math.hypot(x - c.x, z - c.z) < c.R * 0.6) return c;
      }
      return null;
    }
    S.inWater = (x, z) => !!inWater(x, z);
    S.waterC = inWater;
    /* v8: общий пул частиц для других модулей (29b_v8fx) */
    S.spawn = spawn;
    /* v8: взрыв стряхивает хвою, сухие сучки и кору с деревьев вокруг */
    S.needleFall = (t, k) => {
      if (t.dead || t.burnt || t.snag) return;
      const hs = t.hs || 1, n = Math.round((10 + Math.random() * 14) * Math.min(2, k));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, r = rnd(0.3, 2.2 * (t.rs || 1));
        const y = (t.y || 0) + rnd(4, 11) * hs;
        const p = spawn(t.x + Math.cos(a) * r, y, t.z + Math.sin(a) * r, rnd(-0.3, 0.3), -rnd(0.3, 0.9), rnd(-0.3, 0.3),
          10, 0.055, 0.055, 1, rnd(0.20, 0.32), rnd(0.17, 0.24), rnd(0.07, 0.11), 2, 0.6, 1.8, 1);
        p.t = -rnd(0.05, 0.9);
      }
      /* сухие сучки — тяжелее, падают быстрее и кувыркаются */
      for (let i = 0, m = Math.random() < 0.6 * k ? 1 + (Math.random() * 3 | 0) : 0; i < m; i++) {
        const a = Math.random() * TAU, r = rnd(0.2, 1.2);
        const p = spawn(t.x + Math.cos(a) * r, (t.y || 0) + rnd(3, 7) * hs, t.z + Math.sin(a) * r, rnd(-0.6, 0.6), rnd(-0.2, 0.4), rnd(-0.6, 0.6),
          6, 0.05, 0.05, 1, 0.16, 0.12, 0.08, 2, 9.8, 0.2, 0);
        p.t = -rnd(0.1, 0.5);
      }
    };
    S.softAt = softAt;

    /* шаг: yaw — курс бойца (вперёд = (-sin, -cos)), side ±1 */
    S.step = (x, z, yaw, side, run) => {
      const wc = inWater(x, z);
      if (wc) { S.splash(x, wc.h0 - wc.D * 0.5 + 0.01, z, 0.35 + run * 0.3, true); return 'water'; }
      if (world.scar) world.scar(x, z, 0.38, 2, 0.035 + run * 0.02);
      const soft = softAt(x, z);
      if (soft < 0.12) return soft;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const px = x + fz * side * -0.11, pz = z - fx * side * -0.11;
      const n = normalAt(px, pz);
      _q.setFromUnitVectors(_up, n);
      _q2.setFromAxisAngle(_up, yaw + (side > 0 ? -0.06 : 0.06) + rnd(-0.05, 0.05));
      _q.multiply(_q2);
      _p.set(px, gAt(px, pz) + 0.004, pz);
      _s.set(side > 0 ? 1 : -1, 1, 1);
      _m.compose(_p, _q, _s);
      prints.setMatrixAt(prI, _m);
      aOp[prI] = Math.min(1, 0.35 + soft * 0.9) * (run > 0.5 ? 0.85 : 1);
      pGeo.attributes.aOp.needsUpdate = true;
      prI = (prI + 1) % PN;
      prints.count = Math.max(prints.count, prI === 0 ? PN : prI);
      prints.instanceMatrix.needsUpdate = true;
      S.prints++;
      /* брызги жижи на бегу */
      if (soft > 0.55 && run > 0.4) for (let k = 0; k < 4; k++)
        spawn(px, _p.y + 0.03, pz, rnd(-0.5, 0.5) - fx * 0.6, rnd(0.6, 1.4), rnd(-0.5, 0.5) - fz * 0.6, 1, 0.022, 0.018, 0.95, 0.11, 0.08, 0.05, 1, 9.8, 0.5);
      return soft;
    };

    /* ===================================== пуля в землю: пыль и комья === */
    S.groundHit = (pt, nrm, dir) => {
      const wc = inWater(pt.x, pt.z);
      if (wc) { S.splash(pt.x, wc.h0 - wc.D * 0.5 + 0.01, pt.z, 1, false); return; }
      const soft = softAt(pt.x, pt.z);
      const nx = nrm ? nrm.x : 0, ny = nrm ? nrm.y : 1, nz = nrm ? nrm.z : 0;
      /* отражённое направление — пыль летит «назад-вверх» от пули */
      const rx = dir ? -dir.x * 0.4 + nx : nx, rz = dir ? -dir.z * 0.4 + nz : nz;
      const br = soft > 0.4 ? [0.10, 0.075, 0.05] : [0.20, 0.16, 0.115];
      for (let k = 0; k < 6; k++) {
        const u = rnd(0.4, 1.6);
        spawn(pt.x, pt.y + 0.03, pt.z, rx * u + rnd(-0.3, 0.3), ny * u * 1.3 + rnd(0, 0.6), rz * u + rnd(-0.3, 0.3),
          rnd(1.1, 2.0), rnd(0.06, 0.12), rnd(0.45, 0.8), soft > 0.5 ? 0.35 : 0.55, br[0], br[1], br[2], 0, -0.15, 2.6);
      }
      for (let k = 0; k < 9; k++) {
        spawn(pt.x, pt.y + 0.02, pt.z, rx * rnd(0.5, 2.5) + rnd(-0.8, 0.8), rnd(1.5, 4.2), rz * rnd(0.5, 2.5) + rnd(-0.8, 0.8),
          1.4, rnd(0.012, 0.03), 0.015, 1, 0.07, 0.055, 0.035, 1, 9.8, 0.3);
      }
      if (env) env.cut(pt.x, pt.z, 0.22, 0.6);
      if (world.scar) world.scar(pt.x, pt.z, 0.16, 1, 0.5);
      S.puffs++;
    };

    /* ============================== пуля в дерево: щепа и сыплется хвоя === */
    S.treeHit = (t, pt, dir) => {
      if (env) env.shake(t.x, t.z, 0.6);
      const nx = pt.x - t.x, nz = pt.z - t.z, l = Math.hypot(nx, nz) || 1;
      for (let k = 0; k < 7; k++)
        spawn(pt.x, pt.y, pt.z, nx / l * rnd(1, 3) + rnd(-0.6, 0.6), rnd(0.3, 2.2), nz / l * rnd(1, 3) + rnd(-0.6, 0.6),
          1.3, rnd(0.015, 0.03), 0.015, 1, 0.42, 0.30, 0.19, 1, 9.8, 0.4);
      spawn(pt.x, pt.y, pt.z, nx / l * 0.4, 0.2, nz / l * 0.4, 1.2, 0.05, 0.3, 0.3, 0.30, 0.25, 0.2, 0, 0, 2);
      /* v8: у сухостоя и гари кроны нет — сыплется кора, у обугленных — сажа и уголь */
      if (t.dead || t.burnt || t.snag) {
        const bk = t.burnt ? 0.25 : 1;
        for (let k = 0; k < 9; k++)
          spawn(pt.x + rnd(-0.05, 0.05), pt.y + rnd(-0.1, 0.25), pt.z + rnd(-0.05, 0.05), nx / l * rnd(0.3, 1.2), rnd(-0.2, 0.8), nz / l * rnd(0.3, 1.2),
            3, rnd(0.02, 0.045), 0.03, 1, 0.30 * bk, 0.25 * bk, 0.2 * bk, 2, 4.5, 1.2, 0.8);
        if (t.burnt) spawn(pt.x, pt.y, pt.z, nx / l * 0.3, 0.35, nz / l * 0.3, 2.2, 0.08, 0.5, 0.45, 0.09, 0.085, 0.08, 0, -0.05, 1.5);
        return;
      }
      /* хвоя: с нижнего яруса кроны над попаданием, через 0.1–0.6 с */
      const hs = t.hs || 1, n = 14 + (Math.random() * 10 | 0);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU, r = rnd(0.3, 1.8 * (t.rs || 1));
        const y = Math.max(pt.y + 1, (t.y || 0) + rnd(4, 9) * hs);
        const p = spawn(t.x + Math.cos(a) * r, y, t.z + Math.sin(a) * r, rnd(-0.2, 0.2), -rnd(0.4, 0.9), rnd(-0.2, 0.2),
          9, 0.055, 0.055, 1, rnd(0.20, 0.32), rnd(0.17, 0.24), rnd(0.07, 0.11), 2, 0.6, 1.8, 1);
        p.t = -rnd(0.1, 0.7);    // задержка
      }
    };

    /* ===== v7: выстрел лёжа — газы бьют в землю: пыль/брызги веером вперёд
       и в стороны, сухие травинки взлетают (как в реальных роликах стрельбы
       с сошек: облачко пыли закрывает цель на полсекунды) */
    S.muzzleBlast = (p, d, k, wet) => {
      const wc = inWater(p.x, p.z);
      if (wc) { S.splash(p.x, wc.h0 - wc.D * 0.5 + 0.01, p.z, 0.8 * k, false); return; }
      const dl = Math.hypot(d.x, d.z) || 1, fx = d.x / dl, fz = d.z / dl;
      const dry = 1 - Math.min(1, wet || 0);
      const br = dry > 0.5 ? [0.24, 0.20, 0.15] : [0.12, 0.10, 0.075];
      const n = Math.round(5 + 6 * k * (0.4 + dry * 0.6));
      for (let i = 0; i < n; i++) {
        const sx = rnd(-1, 1), u = rnd(0.6, 2.4) * k;
        /* веер: вперёд и в стороны (у тормоза — сильнее вбок) */
        const vx = fx * u + (-fz) * sx * u * 0.9, vz = fz * u + fx * sx * u * 0.9;
        spawn(p.x, p.y + 0.02, p.z, vx, rnd(0.2, 0.9) * k, vz, rnd(0.9, 1.8), rnd(0.08, 0.14), rnd(0.5, 0.9) * (0.6 + 0.4 * k),
          (0.22 + dry * 0.25) * Math.min(1, k), br[0], br[1], br[2], 0, -0.1, 2.2);
      }
      for (let i = 0; i < 5 * k; i++)
        spawn(p.x, p.y + 0.02, p.z, fx * rnd(0.5, 2) + rnd(-1, 1), rnd(0.8, 2.4), fz * rnd(0.5, 2) + rnd(-1, 1),
          1.6, rnd(0.01, 0.022), 0.01, 1, 0.22, 0.2, 0.09, 1, 9.8, 0.6, 1);
      S.puffs++;
    };

    /* ============================================ вода: всплеск и кольца === */
    S.splash = (x, y, z, k, step) => {
      const n = step ? 6 : 16;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, u = rnd(0.2, 1) * (step ? 0.6 : 1.1);
        spawn(x, y + 0.01, z, Math.cos(a) * u, rnd(1.0, step ? 1.6 : 3.4) * k, Math.sin(a) * u,
          1.2, rnd(0.012, 0.025), 0.01, 0.75, 0.16, 0.14, 0.11, 1, 9.8, 0.2);
      }
      if (!step) spawn(x, y + 0.05, z, 0, 0.3, 0, 0.6, 0.08, 0.35, 0.25, 0.32, 0.30, 0.27, 0, 0, 1.5);
      if (world.waterRipple) world.waterRipple(x, z, step ? 0.5 : 1);
    };

    /* дождь: брызги капли о землю и крупные капли с веток */
    S.raindrop = (x, z) => {
      const y = gAt(x, z) + 0.01;
      if (inWater(x, z)) return;
      for (let k = 0; k < 2; k++) spawn(x, y, z, (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6,
        0.3, 0.008, 0.006, 0.55, 0.4, 0.42, 0.44, 1, 9.8, 0.2);
    };
    S.drip = (t) => {
      const a = Math.random() * TAU, r = 0.4 + Math.random() * 1.6 * (t.rs || 1);
      spawn(t.x + Math.cos(a) * r, (t.y || 0) + 2.5 + Math.random() * 3, t.z + Math.sin(a) * r, 0, -0.5, 0,
        3, 0.012, 0.012, 0.6, 0.45, 0.48, 0.5, 1, 9.8, 0.05);
    };
    /* =============================================== граната: копоть ====== */
    S.scorch = (p, big) => {
      if (!world.scar) return;
      const b = Math.max(0.5, big || 1);
      world.scar(p.x, p.z, 1.5 * b, 0, 0.95);
      world.scar(p.x, p.z, 0.95 * b, 1, 0.9);
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * TAU, r = rnd(0.6, 2.2) * b;
        world.scar(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, rnd(0.2, 0.45), 1, 0.6);
      }
      const wc = inWater(p.x, p.z);
      if (wc) for (let k = 0; k < 3; k++) S.splash(p.x + rnd(-0.5, 0.5), wc.h0 - wc.D * 0.5, p.z + rnd(-0.5, 0.5), 2.2, false);
    };

    /* ================================================ кадр ================= */
    S.update = (dt) => {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 0.05);
      if (world.scarUpdate) world.scarUpdate(dt);
      if (camera) uni.uScale.value = (o.renderer ? o.renderer.domElement.height * (globalThis.AEGIS_RS || 1) : 720) * 0.5 / Math.tan(camera.fov * Math.PI / 360);
      live = 0;
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (p.ttl <= 0) { if (col[i * 4 + 3] !== 0) col[i * 4 + 3] = 0; continue; }
        p.t += dt;
        if (p.t < 0) { col[i * 4 + 3] = 0; continue; }
        if (p.t >= p.ttl) { p.ttl = 0; col[i * 4 + 3] = 0; continue; }
        live++;
        if (!p.land) {
          const dr = Math.exp(-p.drag * dt);
          p.vx *= dr; p.vz *= dr; p.vy = p.vy * (p.grav > 1 ? 1 : dr) - p.grav * dt;
          if (p.flut) { p.ph += dt * 5; p.vx += Math.cos(p.ph) * 1.6 * dt; p.vz += Math.sin(p.ph * 0.8) * 1.6 * dt; }
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.k > 0.5) {
            const gy = gAt(p.x, p.z) + 0.01;
            if (p.y < gy) { p.y = gy; p.land = true; p.ttl = Math.min(p.ttl, p.t + (p.k > 1.5 ? 4 : 0.5)); }
          }
        }
        const u = p.t / p.ttl;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        size[i] = p.s0 + (p.s1 - p.s0) * Math.sqrt(u);
        kind[i] = p.k;
        col[i * 4] = p.r; col[i * 4 + 1] = p.g; col[i * 4 + 2] = p.b;
        col[i * 4 + 3] = p.a0 * (p.k < 0.5 ? (1 - u) * (1 - u) * Math.min(1, p.t * 12) : (u > 0.8 ? (1 - u) * 5 : 1));
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aCol.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aKind.needsUpdate = true;
      S.live = live;
    };
    S.setLight = (r, g, b) => uni.uLight.value.setRGB(r, g, b);
    return S;
  }
  root.GScars = { create };
})(typeof window !== 'undefined' ? window : globalThis);
