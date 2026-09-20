/* ============================================================================
   Полигон: газон, садовый участок, домик и стрельбище.

   Геометрия участка процедурная, растительность — инстансы, поэтому
   десятки тысяч травинок стоят один draw call. Дом закрытый: внутрь не
   зайти, коллизия — прямоугольник по фундаменту.

   Мишени стоят на 5, 10, 20 и 30 метрах и падают от попадания.
   ========================================================================== */
(function (root, factory) {
  const W = factory(root.GUtil, root.GTex);
  if (typeof module !== 'undefined' && module.exports) module.exports = W;
  else root.GWorld = W;
})(typeof self !== 'undefined' ? self : this, function (U, T) {
  'use strict';

  const TAU = Math.PI * 2;

  /* Габариты участка, м. */
  const FIELD = { x: 64, z: 74 };

  function build(THREE, scene) {
    const api = {
      colliders: [],      // {type:'box'|'cyl', ...} — препятствия для игрока
      targets: [],        // мишени стрельбища
      hitboxes: [],       // цели для пуль (мишени + статика)
      update: null
    };

    /* ------------------------------------------------------------ земля */
    const groundCv = T.groundAlbedo(2024, 1024);
    const groundTex = new THREE.CanvasTexture(groundCv);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(22, 24);
    groundTex.anisotropy = 16;
    if ('colorSpace' in groundTex) groundTex.colorSpace = THREE.SRGBColorSpace;

    const groundNrm = new THREE.CanvasTexture(T.fabricNormal(5, 256, 26, 1.6));
    groundNrm.wrapS = groundNrm.wrapT = THREE.RepeatWrapping;
    groundNrm.repeat.set(40, 44);

    /* Лёгкий рельеф: газон не идеально плоский, иначе теряется масштаб. */
    const gseg = 96;
    const gGeo = new THREE.PlaneGeometry(FIELD.x, FIELD.z, gseg, gseg);
    gGeo.rotateX(-Math.PI / 2);
    const hf = U.fbm(909, 4, 0.5, 2.2);
    const gp = gGeo.attributes.position;
    const heightAt = (x, z) => {
      /* центральная полоса (стрельбище и строй бойцов) держится ровной */
      const flat = U.clamp01((Math.abs(x) - 5) / 7) * U.clamp01((Math.abs(z) - 26) / 8 + 0.4);
      return (hf(x * 0.035 + 10, z * 0.035 + 4) - 0.5) * 0.85 * U.clamp01(flat);
    };
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), z = gp.getZ(i);
      gp.setY(i, heightAt(x, z));
    }
    gGeo.computeVertexNormals();
    const ground = new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({
      map: groundTex, normalMap: groundNrm, normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.97, metalness: 0
    }));
    ground.receiveShadow = true;
    ground.name = 'ground';
    scene.add(ground);
    api.ground = ground;
    api.heightAt = heightAt;

    /* ------------------------------------------------------------ трава */
    /* Каждый пучок — две скрещенные плоскости со спрайтом. Ветер двигает
       вершины в вершинном шейдере: анимация бесплатная для CPU. */
    const bladeCv = T.grassBlade(77, 128);
    const bladeTex = new THREE.CanvasTexture(bladeCv);
    bladeTex.anisotropy = 8;
    if ('colorSpace' in bladeTex) bladeTex.colorSpace = THREE.SRGBColorSpace;

    const tuft = new THREE.BufferGeometry();
    (function () {
      /* Стриженый газон: пучок 9 см высотой. Крупнее — и участок перестаёт
         читаться как двор, бойцы «тонут» по колено. */
      const w = 0.085, h = 0.095;
      const pos = [], uv = [], idx = [], nrm = [];
      const planes = [0, Math.PI / 3, (2 * Math.PI) / 3];
      planes.forEach((a, pi) => {
        const cx = Math.cos(a) * w * 0.5, cz = Math.sin(a) * w * 0.5;
        const base = pi * 4;
        pos.push(-cx, 0, -cz, cx, 0, cz, cx, h, cz, -cx, h, -cz);
        for (let k = 0; k < 4; k++) nrm.push(0, 1, 0);
        uv.push(0, 0, 1, 0, 1, 1, 0, 1);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      });
      tuft.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      tuft.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      tuft.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      tuft.setIndex(idx);
    })();

    const grassMat = new THREE.MeshStandardMaterial({
      map: bladeTex, alphaTest: 0.42, transparent: false,
      roughness: 0.92, metalness: 0, side: THREE.DoubleSide
    });
    /* ветер: смещение верхних вершин по времени и позиции инстанса */
    grassMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { value: 0 };
      grassMat.userData.sh = sh;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         #ifdef USE_INSTANCING
           vec3 iOrg = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
         #else
           vec3 iOrg = vec3(0.0);
         #endif
         float sway = sin(uTime * 1.25 + iOrg.x * 0.45 + iOrg.z * 0.33)
                    + 0.45 * sin(uTime * 2.7 + iOrg.x * 1.1);
         transformed.x += sway * 0.055 * position.y;
         transformed.z += sway * 0.035 * position.y;`
      );
    };

    const GRASS_N = 52000;
    const grass = new THREE.InstancedMesh(tuft, grassMat, GRASS_N);
    grass.castShadow = false;
    grass.receiveShadow = true;
    grass.frustumCulled = false;
    const rnd = U.rng(31337);
    const dummy = new THREE.Object3D();
    let gi = 0;
    const noGrass = [];                      // зоны без травы (грядки, дом, дорожка)
    api._noGrass = noGrass;
    return finishWorld(THREE, scene, api, { grass, dummy, rnd, GRASS_N, heightAt, noGrass, bladeTex, grassMat });
  }

  /* Разбито на две функции, чтобы зоны застройки успели зарегистрироваться
     до рассева травы: трава не должна расти сквозь грядки и фундамент. */
  function finishWorld(THREE, scene, api, ctx) {
    buildHouse(THREE, scene, api);
    buildGarden(THREE, scene, api);
    buildRange(THREE, scene, api);
    buildFence(THREE, scene, api);
    buildProps(THREE, scene, api);
    scatterGrass(THREE, scene, api, ctx);
    return api;
  }

  function inZones(zones, x, z) {
    for (const q of zones) {
      if (q.r !== undefined) { if ((x - q.x) * (x - q.x) + (z - q.z) * (z - q.z) < q.r * q.r) return true; }
      else if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1) return true;
    }
    return false;
  }

  function scatterGrass(THREE, scene, api, ctx) {
    const { grass, dummy, rnd, GRASS_N, heightAt, noGrass } = ctx;
    let gi = 0, guard = 0;
    while (gi < GRASS_N && guard < GRASS_N * 6) {
      guard++;
      const x = (rnd() - 0.5) * (FIELD.x - 2);
      const z = (rnd() - 0.5) * (FIELD.z - 2);
      if (inZones(noGrass, x, z)) continue;
      const y = heightAt(x, z);
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rnd() * TAU, 0);
      const s = 0.78 + rnd() * 0.5;
      /* разнобой по высоте: газон подстрижен, но не идеально ровно */
      dummy.scale.set(s, s * (0.75 + rnd() * 0.7), s);
      dummy.updateMatrix();
      grass.setMatrixAt(gi++, dummy.matrix);
    }
    grass.count = gi;
    grass.instanceMatrix.needsUpdate = true;
    scene.add(grass);
    api.grass = grass;
    api.grassMat = ctx.grassMat;
  }

  /* ============================================================== ДОМИК = */
  /* Небольшой садовый дом: сруб из досок, двускатная крыша, крыльцо,
     окна и дверь — но закрытые. Внутрь не зайти: коллизия по всему объёму. */
  function buildHouse(THREE, scene, api) {
    const g = new THREE.Group();
    g.name = 'house';
    const HX = -13.5, HZ = -16.0;            // центр дома
    const W = 5.4, D = 4.4, H = 2.55;

    const woodTex = new THREE.CanvasTexture(T.woodAlbedo(11, 512, [118, 96, 70]));
    woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
    woodTex.anisotropy = 8;
    if ('colorSpace' in woodTex) woodTex.colorSpace = THREE.SRGBColorSpace;
    const woodNrm = new THREE.CanvasTexture(T.fabricNormal(12, 256, 18, 1.1));
    woodNrm.wrapS = woodNrm.wrapT = THREE.RepeatWrapping;

    const wood = new THREE.MeshStandardMaterial({
      map: woodTex, normalMap: woodNrm, normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.88, metalness: 0
    });
    const woodDark = new THREE.MeshStandardMaterial({
      map: woodTex.clone(), roughness: 0.84, metalness: 0,
      color: new THREE.Color(0.62, 0.58, 0.54)
    });
    woodDark.map.repeat.set(2, 2);
    woodDark.map.needsUpdate = true;

    /* фундамент */
    const found = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.38, D + 0.5),
      new THREE.MeshStandardMaterial({ color: 0x6d6963, roughness: 0.95 }));
    found.position.set(HX, 0.19, HZ);
    found.castShadow = found.receiveShadow = true;
    g.add(found);

    /* стены из бруса: горизонтальные брёвна дают силуэт сруба */
    const logR = 0.115;
    const rows = Math.floor(H / (logR * 2 * 0.92));
    for (let i = 0; i < rows; i++) {
      const y = 0.38 + logR + i * logR * 1.84;
      for (const [len, rot, px, pz] of [
        [W, 0, 0, -D / 2], [W, 0, 0, D / 2],
        [D, Math.PI / 2, -W / 2, 0], [D, Math.PI / 2, W / 2, 0]
      ]) {
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(logR, logR, len, 10, 1), wood);
        cyl.rotation.z = Math.PI / 2;
        cyl.rotation.y = rot;
        cyl.position.set(HX + px, y, HZ + pz);
        cyl.castShadow = cyl.receiveShadow = true;
        g.add(cyl);
      }
    }

    /* внутренняя «пробка»: дом непрозрачный, внутрь не видно */
    const core = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, H, D - 0.1),
      new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 1 }));
    core.position.set(HX, 0.38 + H / 2, HZ);
    core.castShadow = core.receiveShadow = true;
    g.add(core);

    /* фронтоны и двускатная крыша */
    const roofH = 1.25;
    for (const s of [1, -1]) {
      const tri = new THREE.Shape();
      tri.moveTo(-W / 2, 0); tri.lineTo(W / 2, 0); tri.lineTo(0, roofH); tri.closePath();
      const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), woodDark);
      m.position.set(HX, 0.38 + H, HZ + s * D / 2);
      if (s < 0) m.rotation.y = Math.PI;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    const slopeLen = Math.hypot(W / 2, roofH) + 0.22;
    const shingle = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.92, metalness: 0.02 });
    for (const s of [1, -1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.06, D + 0.6), shingle);
      p.position.set(HX + s * (W / 4 + 0.06), 0.38 + H + roofH / 2 + 0.02, HZ);
      p.rotation.z = -s * Math.atan2(roofH, W / 2);
      p.castShadow = p.receiveShadow = true;
      g.add(p);
    }

    /* дверь (закрытая) и наличники */
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.95, 0.07),
      new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8, color: new THREE.Color(0.72, 0.62, 0.5) }));
    door.position.set(HX + 1.05, 0.38 + 0.98, HZ + D / 2 + 0.06);
    door.castShadow = door.receiveShadow = true;
    g.add(door);
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a7a55, roughness: 0.4, metalness: 0.7 }));
    handle.position.set(HX + 0.70, 0.38 + 1.02, HZ + D / 2 + 0.11);
    g.add(handle);

    /* окна: тёмное стекло с рамой — внутрь всё равно не видно */
    const glass = new THREE.MeshStandardMaterial({
      color: 0x1b2429, roughness: 0.12, metalness: 0.35, envMapIntensity: 1.4
    });
    const frame = new THREE.MeshStandardMaterial({ color: 0xa9a294, roughness: 0.75 });
    const mkWindow = (x, y, z, w, h, ry) => {
      const gl = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), glass);
      gl.position.set(x, y, z); gl.rotation.y = ry;
      g.add(gl);
      for (const [ox, oy, sw, sh] of [[0, h / 2, w + 0.1, 0.07], [0, -h / 2, w + 0.1, 0.07],
        [-w / 2, 0, 0.07, h + 0.14], [w / 2, 0, 0.07, h + 0.14], [0, 0, 0.05, h]]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.07), frame);
        f.position.set(x + Math.cos(ry) * ox, y + oy, z - Math.sin(ry) * ox);
        f.rotation.y = ry;
        f.castShadow = true;
        g.add(f);
      }
    };
    mkWindow(HX - 1.30, 0.38 + 1.55, HZ + D / 2 + 0.06, 1.0, 0.85, 0);
    mkWindow(HX + W / 2 + 0.06, 0.38 + 1.55, HZ - 0.6, 0.9, 0.8, Math.PI / 2);
    mkWindow(HX - W / 2 - 0.06, 0.38 + 1.55, HZ + 0.4, 0.9, 0.8, Math.PI / 2);

    /* крыльцо со ступенями и навесом */
    const porch = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 1.1), woodDark);
    porch.position.set(HX + 1.05, 0.38 - 0.02, HZ + D / 2 + 0.62);
    porch.castShadow = porch.receiveShadow = true;
    g.add(porch);
    for (let i = 0; i < 2; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.13, 0.32), woodDark);
      st.position.set(HX + 1.05, 0.24 - i * 0.13, HZ + D / 2 + 1.25 + i * 0.30);
      st.castShadow = st.receiveShadow = true;
      g.add(st);
    }
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.1, 8), wood);
      post.position.set(HX + 1.05 + s * 0.78, 0.38 + 1.05, HZ + D / 2 + 1.0);
      post.castShadow = true;
      g.add(post);
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.07, 1.5), shingle);
    canopy.position.set(HX + 1.05, 0.38 + 2.12, HZ + D / 2 + 0.82);
    canopy.rotation.x = -0.12;
    canopy.castShadow = true;
    g.add(canopy);

    /* печная труба */
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.95, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x7d5c4e, roughness: 0.95 }));
    chim.position.set(HX - 1.4, 0.38 + H + roofH * 0.72, HZ - 0.8);
    chim.castShadow = true;
    g.add(chim);

    scene.add(g);
    /* коллизия по всему дому + крыльцу */
    api.colliders.push({ type: 'box', x0: HX - W / 2 - 0.3, x1: HX + W / 2 + 0.3, z0: HZ - D / 2 - 0.3, z1: HZ + D / 2 + 0.3, h: 3.4 });
    api.colliders.push({ type: 'box', x0: HX + 0.1, x1: HX + 2.0, z0: HZ + D / 2 + 0.05, z1: HZ + D / 2 + 1.2, h: 0.4 });
    api._noGrass.push({ x0: HX - W / 2 - 1.2, x1: HX + W / 2 + 1.2, z0: HZ - D / 2 - 1.2, z1: HZ + D / 2 + 2.2 });
    api.house = g;
  }

  /* =========================================================== ОГОРОД === */
  /* Садовый участок: вскопанные грядки с бортиками, посадки (капуста,
     лук, кусты томатов с подвязкой), парник, бочка, дорожка из плитки. */
  function buildGarden(THREE, scene, api) {
    const g = new THREE.Group();
    g.name = 'garden';
    const GX = -13.0, GZ = -5.5;            // центр огорода

    const soilTex = new THREE.CanvasTexture(soilCanvas());
    soilTex.wrapS = soilTex.wrapT = THREE.RepeatWrapping;
    soilTex.repeat.set(3, 1.6);
    soilTex.anisotropy = 8;
    if ('colorSpace' in soilTex) soilTex.colorSpace = THREE.SRGBColorSpace;
    const soilNrm = new THREE.CanvasTexture(T.fabricNormal(21, 256, 9, 2.2));
    soilNrm.wrapS = soilNrm.wrapT = THREE.RepeatWrapping;
    soilNrm.repeat.set(4, 2);
    const soilMat = new THREE.MeshStandardMaterial({
      map: soilTex, normalMap: soilNrm, normalScale: new THREE.Vector2(1.4, 1.4),
      roughness: 0.98, metalness: 0
    });
    const plankMat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(T.woodAlbedo(33, 256, [104, 86, 62])),
      roughness: 0.92, metalness: 0
    });
    plankMat.map.wrapS = plankMat.map.wrapT = THREE.RepeatWrapping;
    plankMat.map.repeat.set(3, 1);
    if ('colorSpace' in plankMat.map) plankMat.map.colorSpace = THREE.SRGBColorSpace;

    const BEDS = [
      { x: GX - 2.0, z: GZ - 2.6, w: 3.0, d: 1.25, crop: 'cabbage' },
      { x: GX - 2.0, z: GZ - 0.7, w: 3.0, d: 1.25, crop: 'onion' },
      { x: GX - 2.0, z: GZ + 1.2, w: 3.0, d: 1.25, crop: 'tomato' },
      { x: GX + 2.1, z: GZ - 1.8, w: 2.6, d: 1.15, crop: 'carrot' },
      { x: GX + 2.1, z: GZ + 0.4, w: 2.6, d: 1.15, crop: 'cabbage' }
    ];

    const rnd = U.rng(555);
    for (const b of BEDS) {
      /* земля грядки: слегка вспаханная поверхность с бороздами */
      const seg = 24;
      const geo = new THREE.PlaneGeometry(b.w, b.d, seg, Math.max(6, Math.round(seg * b.d / b.w)));
      geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const lx = p.getX(i), lz = p.getZ(i);
        /* борозды вдоль длинной стороны */
        const furrow = Math.sin(lz * 9.5) * 0.020;
        p.setY(i, 0.11 + furrow + (rnd() - 0.5) * 0.012);
      }
      geo.computeVertexNormals();
      const bed = new THREE.Mesh(geo, soilMat);
      bed.position.set(b.x, 0, b.z);
      bed.receiveShadow = true;
      g.add(bed);

      /* деревянный бортик */
      for (const [dx, dz, sx, sz] of [
        [0, -b.d / 2, b.w + 0.1, 0.05], [0, b.d / 2, b.w + 0.1, 0.05],
        [-b.w / 2, 0, 0.05, b.d], [b.w / 2, 0, 0.05, b.d]
      ]) {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.16, sz), plankMat);
        pl.position.set(b.x + dx, 0.08, b.z + dz);
        pl.castShadow = pl.receiveShadow = true;
        g.add(pl);
      }

      plantCrop(THREE, g, b, rnd);
      api._noGrass.push({ x0: b.x - b.w / 2 - 0.25, x1: b.x + b.w / 2 + 0.25, z0: b.z - b.d / 2 - 0.25, z1: b.z + b.d / 2 + 0.25 });
      api.colliders.push({ type: 'box', x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2, h: 0.20, step: true });
    }

    /* парник: дуги с полупрозрачной плёнкой */
    const filmMat = new THREE.MeshPhysicalMaterial({
      color: 0xdfece8, roughness: 0.42, metalness: 0, transmission: 0.55,
      transparent: true, opacity: 0.62, side: THREE.DoubleSide, thickness: 0.02
    });
    const arcMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.5, metalness: 0.6 });
    const gh = new THREE.Group();
    const GHX = GX + 0.2, GHZ = GZ + 3.4, GHL = 3.2, GHR = 0.85;
    for (let i = 0; i <= 6; i++) {
      const z = GHZ - GHL / 2 + (i / 6) * GHL;
      const arc = new THREE.Mesh(new THREE.TorusGeometry(GHR, 0.018, 6, 20, Math.PI), arcMat);
      arc.position.set(GHX, 0.02, z);
      arc.rotation.y = Math.PI / 2;
      arc.castShadow = true;
      gh.add(arc);
    }
    const film = new THREE.Mesh(new THREE.CylinderGeometry(GHR, GHR, GHL, 20, 1, true, 0, Math.PI), filmMat);
    film.rotation.z = Math.PI / 2;
    film.position.set(GHX, 0.02, GHZ);
    gh.add(film);
    g.add(gh);
    api.colliders.push({ type: 'box', x0: GHX - GHR, x1: GHX + GHR, z0: GHZ - GHL / 2, z1: GHZ + GHL / 2, h: 1.0 });
    api._noGrass.push({ x0: GHX - GHR - 0.3, x1: GHX + GHR + 0.3, z0: GHZ - GHL / 2 - 0.3, z1: GHZ + GHL / 2 + 0.3 });

    /* бочка для полива */
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.40, 0.92, 20, 1),
      new THREE.MeshStandardMaterial({ color: 0x3f5b4a, roughness: 0.72, metalness: 0.25 }));
    barrel.position.set(GX + 4.2, 0.46, GZ - 3.2);
    barrel.castShadow = barrel.receiveShadow = true;
    g.add(barrel);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.39, 20),
      new THREE.MeshStandardMaterial({ color: 0x24333a, roughness: 0.08, metalness: 0.2 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(GX + 4.2, 0.86, GZ - 3.2);
    g.add(water);
    api.colliders.push({ type: 'cyl', x: GX + 4.2, z: GZ - 3.2, r: 0.46, h: 0.95 });

    /* садовая дорожка из плитки */
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8d8880, roughness: 0.95 });
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const x = U.lerp(GX + 5.4, -9.0, t) + Math.sin(t * 5) * 0.5;
      const z = U.lerp(GZ + 4.0, -13.5, t);
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.44), stoneMat);
      s.position.set(x, 0.035, z);
      s.rotation.y = (U.rng(i + 3)() - 0.5) * 0.5;
      s.receiveShadow = true;
      g.add(s);
      api._noGrass.push({ x, z, r: 0.42 });
    }

    /* инструмент у стены: лопата и грабли */
    const tool = (x, z, headFn) => {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 1.5, 8), plankMat);
      handle.position.set(x, 0.75, z);
      handle.rotation.z = 0.22;
      handle.castShadow = true;
      g.add(handle);
      headFn(x - 0.17, z);
    };
    const metal = new THREE.MeshStandardMaterial({ color: 0x8b8f93, roughness: 0.45, metalness: 0.75 });
    tool(GX + 5.1, GZ + 1.2, (x, z) => {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.03), metal);
      bl.position.set(x, 0.16, z); bl.rotation.z = 0.22; bl.castShadow = true; g.add(bl);
    });
    tool(GX + 5.5, GZ + 1.5, (x, z) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.04), metal);
      bar.position.set(x, 0.10, z); bar.castShadow = true; g.add(bar);
      for (let i = 0; i < 6; i++) {
        const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.005, 0.11, 5), metal);
        t2.position.set(x - 0.15 + i * 0.06, 0.045, z); g.add(t2);
      }
    });

    scene.add(g);
    api.garden = g;
  }

  /* Земля грядки: тёмный влажный грунт с комьями. */
  function soilCanvas() {
    const S = 256;
    const c = T.canvas(S), gg = T.ctx2d(c);
    const f = U.fbm(4321, 5, 0.55, 2.3);
    const img = gg.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const n = f(x / S * 9, y / S * 9) * 0.65 + f(x / S * 34, y / S * 34) * 0.35;
        const i = (y * S + x) * 4;
        d[i] = U.clamp(44 + n * 46, 0, 255);
        d[i + 1] = U.clamp(33 + n * 36, 0, 255);
        d[i + 2] = U.clamp(24 + n * 26, 0, 255);
        d[i + 3] = 255;
      }
    }
    gg.putImageData(img, 0, 0);
    return c;
  }

  /* Посадки: простые, но узнаваемые силуэты. */
  function plantCrop(THREE, g, b, rnd) {
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x51762f, roughness: 0.82, metalness: 0, side: THREE.DoubleSide
    });
    const cabMat = new THREE.MeshStandardMaterial({ color: 0x86a05a, roughness: 0.74, side: THREE.DoubleSide });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x4a6a2c, roughness: 0.88 });
    const cols = Math.max(2, Math.floor(b.w / 0.52));
    const rows = Math.max(1, Math.floor(b.d / 0.55));
    for (let r = 0; r < rows; r++) {
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        const x = b.x - b.w / 2 + (cIdx + 0.5) * (b.w / cols) + (rnd() - 0.5) * 0.05;
        const z = b.z - b.d / 2 + (r + 0.5) * (b.d / rows) + (rnd() - 0.5) * 0.05;
        const y = 0.12;
        if (b.crop === 'cabbage') {
          /* кочан: вложенные изогнутые листья */
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 9), cabMat);
          head.position.set(x, y + 0.10, z);
          head.scale.y = 0.85;
          head.castShadow = head.receiveShadow = true;
          g.add(head);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU + rnd();
            const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.16, 8, 0, Math.PI), cabMat);
            leaf.position.set(x + Math.cos(a) * 0.09, y + 0.035, z + Math.sin(a) * 0.09);
            leaf.rotation.set(-Math.PI / 2 + 0.55, 0, a);
            leaf.castShadow = true;
            g.add(leaf);
          }
        } else if (b.crop === 'onion') {
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * TAU;
            const h = 0.22 + rnd() * 0.14;
            const bl = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.013, h, 5), stemMat);
            bl.position.set(x + Math.cos(a) * 0.03, y + h / 2, z + Math.sin(a) * 0.03);
            bl.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
            bl.castShadow = true;
            g.add(bl);
          }
        } else if (b.crop === 'carrot') {
          for (let i = 0; i < 9; i++) {
            const a = rnd() * TAU, rr = rnd() * 0.07;
            const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.19), leafMat);
            leaf.position.set(x + Math.cos(a) * rr, y + 0.09, z + Math.sin(a) * rr);
            leaf.rotation.set(-0.5 + rnd() * 0.4, a, 0);
            g.add(leaf);
          }
        } else {
          /* томат: стебель, подвязка к колышку, листья и плоды */
          const hgt = 0.62 + rnd() * 0.22;
          const st = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.016, hgt, 6), stemMat);
          st.position.set(x, y + hgt / 2, z);
          st.castShadow = true;
          g.add(st);
          const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, hgt + 0.20, 5),
            new THREE.MeshStandardMaterial({ color: 0x7d6446, roughness: 0.9 }));
          stake.position.set(x + 0.055, y + (hgt + 0.20) / 2, z);
          stake.castShadow = true;
          g.add(stake);
          for (let i = 0; i < 5; i++) {
            const hh = 0.14 + i * (hgt - 0.18) / 5;
            const a = i * 1.9;
            const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.10), leafMat);
            leaf.position.set(x + Math.cos(a) * 0.09, y + hh, z + Math.sin(a) * 0.09);
            leaf.rotation.set(-0.35, a, 0.2);
            leaf.castShadow = true;
            g.add(leaf);
          }
          if (rnd() > 0.35) {
            const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.030, 9, 7),
              new THREE.MeshStandardMaterial({ color: 0xa8341f, roughness: 0.42 }));
            fruit.position.set(x + 0.06, y + hgt * 0.55, z + 0.03);
            fruit.castShadow = true;
            g.add(fruit);
          }
        }
      }
    }
  }

  /* ========================================================= СТРЕЛЬБИЩЕ = */
  /* Огневой рубеж в точке FIRE_LINE, мишени строго на 5, 10, 20 и 30 м
     по оси -Z. Каждая мишень — поворотная рама: попадание роняет её,
     через пару секунд она поднимается. */
  const FIRE_LINE = { x: 6.5, z: 8.0 };
  const RANGES = [5, 10, 20, 30];

  function buildRange(THREE, scene, api) {
    const g = new THREE.Group();
    g.name = 'range';

    const faceCv = T.targetFace(512);
    const faceTex = new THREE.CanvasTexture(faceCv);
    faceTex.anisotropy = 8;
    if ('colorSpace' in faceTex) faceTex.colorSpace = THREE.SRGBColorSpace;
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.93, metalness: 0, side: THREE.DoubleSide });
    const backMat = new THREE.MeshStandardMaterial({ color: 0x9a8f78, roughness: 0.95, side: THREE.DoubleSide });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x6f757a, roughness: 0.52, metalness: 0.72 });
    const woodMat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(T.woodAlbedo(88, 256, [112, 92, 66])), roughness: 0.9
    });
    if ('colorSpace' in woodMat.map) woodMat.map.colorSpace = THREE.SRGBColorSpace;

    /* огневой рубеж: помост с разметкой и упор */
    const mat = new THREE.MeshStandardMaterial({ color: 0x5c5a52, roughness: 0.95 });
    const padGeo = new THREE.BoxGeometry(4.6, 0.10, 2.2);
    const pad = new THREE.Mesh(padGeo, mat);
    pad.position.set(FIRE_LINE.x, 0.05, FIRE_LINE.z);
    pad.receiveShadow = true;
    g.add(pad);
    api._noGrass.push({ x0: FIRE_LINE.x - 2.4, x1: FIRE_LINE.x + 2.4, z0: FIRE_LINE.z - 1.2, z1: FIRE_LINE.z + 1.2 });
    /* стрелковый упор-стол */
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.09, 0.62), woodMat);
    bench.position.set(FIRE_LINE.x - 1.2, 1.02, FIRE_LINE.z - 0.5);
    bench.castShadow = bench.receiveShadow = true;
    g.add(bench);
    for (const [dx, dz] of [[-0.7, -0.24], [0.7, -0.24], [-0.7, 0.24], [0.7, 0.24]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.07), woodMat);
      leg.position.set(FIRE_LINE.x - 1.2 + dx, 0.5, FIRE_LINE.z - 0.5 + dz);
      leg.castShadow = true;
      g.add(leg);
    }
    api.colliders.push({ type: 'box', x0: FIRE_LINE.x - 2.05, x1: FIRE_LINE.x - 0.35,
      z0: FIRE_LINE.z - 0.85, z1: FIRE_LINE.z - 0.15, h: 1.1, step: true });

    /* мишени */
    for (let i = 0; i < RANGES.length; i++) {
      const dist = RANGES[i];
      const x = FIRE_LINE.x + (i - 1.5) * 1.35;          // лёгкий веер, чтобы все были видны
      const z = FIRE_LINE.z - dist;
      const tg = makeTarget(THREE, faceMat, backMat, steelMat, woodMat, dist);
      tg.group.position.set(x, 0, z);
      g.add(tg.group);
      api.targets.push(tg);
      api._noGrass.push({ x, z, r: 0.85 });

      /* табличка с дистанцией */
      const sign = makeSign(THREE, dist + ' м');
      sign.position.set(x + 0.62, 0.52, z + 0.12);
      g.add(sign);

      /* пулеулавливающий вал позади дальних мишеней */
      if (i === RANGES.length - 1) {
        const berm = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.4, 2.1, 22, 1, false, 0, Math.PI),
          new THREE.MeshStandardMaterial({ color: 0x6b5f4a, roughness: 1 }));
        berm.rotation.y = Math.PI;
        berm.position.set(FIRE_LINE.x - 2.0, 0, z - 3.0);
        berm.scale.set(1.8, 1, 0.9);
        berm.castShadow = berm.receiveShadow = true;
        g.add(berm);
        api.colliders.push({ type: 'box', x0: FIRE_LINE.x - 10, x1: FIRE_LINE.x + 6, z0: z - 4.4, z1: z - 2.2, h: 2.2 });
        api._noGrass.push({ x0: FIRE_LINE.x - 10, x1: FIRE_LINE.x + 6, z0: z - 4.6, z1: z - 2.0 });
      }
    }

    scene.add(g);
    api.range = g;
    api.fireLine = FIRE_LINE;
    api.ranges = RANGES;
  }

  /* Одна мишень: стойка, поворотная рама, картонное полотно.
     hinge — узел вращения; попадание переводит state в 'falling'. */
  function makeTarget(THREE, faceMat, backMat, steelMat, woodMat, dist) {
    const group = new THREE.Group();
    group.name = 'target_' + dist;

    /* Дальние мишени крупнее в мировых единицах? Нет: реальный размер
       одинаковый (0,5 × 0,75 м, поясная), иначе теряется смысл дистанций. */
    const W = 0.50, H = 0.75;

    /* опора */
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.034, 0.62, 8), steelMat);
      post.position.set(s * (W / 2 - 0.03), 0.31, 0);
      post.castShadow = post.receiveShadow = true;
      group.add(post);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.24, 0.05, 0.42), steelMat);
    base.position.set(0, 0.025, 0);
    base.castShadow = base.receiveShadow = true;
    group.add(base);

    /* поворотная рама с полотном */
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.60, 0);
    group.add(hinge);

    const board = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.014), [
      backMat, backMat, backMat, backMat, faceMat, backMat
    ]);
    board.position.set(0, H / 2, 0);
    board.castShadow = board.receiveShadow = true;
    hinge.add(board);

    /* рамка */
    for (const [ox, oy, sx, sy] of [[0, H, W + 0.05, 0.035], [0, 0, W + 0.05, 0.035],
      [-W / 2, H / 2, 0.035, H], [W / 2, H / 2, 0.035, H]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.026), woodMat);
      f.position.set(ox, oy, -0.006);
      f.castShadow = true;
      hinge.add(f);
    }

    return {
      dist, group, hinge, board,
      state: 'up', t: 0, hits: 0, lastHit: -1,
      /* габарит полотна в локальной системе hinge — для попаданий */
      W, H,
      decals: []
    };
  }

  /* Табличка с текстом (дистанция). */
  function makeSign(THREE, text) {
    const c = T.canvas(256, 128);
    const g = T.ctx2d(c);
    g.fillStyle = '#e8e4d8'; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#2a2b2d'; g.lineWidth = 7; g.strokeRect(6, 6, 244, 116);
    g.fillStyle = '#1e1f21';
    g.font = '700 62px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 68);
    const tex = new THREE.CanvasTexture(c);
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    const grp = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }));
    plate.position.y = 0.30;
    plate.castShadow = true;
    grp.add(plate);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.52, 6),
      new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.8 }));
    post.position.y = 0.0;
    post.castShadow = true;
    grp.add(post);
    return grp;
  }

  /* ============================================================= ЗАБОР == */
  function buildFence(THREE, scene, api) {
    const g = new THREE.Group();
    g.name = 'fence';
    const mat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(T.woodAlbedo(66, 256, [98, 84, 64])), roughness: 0.93
    });
    mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
    if ('colorSpace' in mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
    const postMat = new THREE.MeshStandardMaterial({ color: 0x6a5c46, roughness: 0.95 });

    const HX = FIELD.x / 2 - 3, HZ = FIELD.z / 2 - 3;
    const rnd = U.rng(707);
    const seg = 0.22;
    const sides = [
      { a: [-HX, HZ], b: [HX, HZ] }, { a: [HX, HZ], b: [HX, -HZ] },
      { a: [HX, -HZ], b: [-HX, -HZ] }, { a: [-HX, -HZ], b: [-HX, HZ] }
    ];
    for (const s of sides) {
      const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      const n = Math.floor(len / seg);
      const dx = (s.b[0] - s.a[0]) / n, dz = (s.b[1] - s.a[1]) / n;
      const ang = Math.atan2(dz, dx);
      for (let i = 0; i < n; i++) {
        const x = s.a[0] + dx * (i + 0.5), z = s.a[1] + dz * (i + 0.5);
        const h = 1.22 + rnd() * 0.10;
        const pl = new THREE.Mesh(new THREE.BoxGeometry(seg * 0.82, h, 0.035), mat);
        pl.position.set(x, h / 2, z);
        pl.rotation.y = -ang + (rnd() - 0.5) * 0.03;
        pl.castShadow = pl.receiveShadow = true;
        g.add(pl);
      }
      /* столбы и прожилины */
      for (let i = 0; i <= n; i += 12) {
        const x = s.a[0] + dx * i, z = s.a[1] + dz * i;
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.10, 1.55, 0.10), postMat);
        p.position.set(x, 0.78, z);
        p.castShadow = true;
        g.add(p);
      }
      api.colliders.push({
        type: 'box',
        x0: Math.min(s.a[0], s.b[0]) - 0.15, x1: Math.max(s.a[0], s.b[0]) + 0.15,
        z0: Math.min(s.a[1], s.b[1]) - 0.15, z1: Math.max(s.a[1], s.b[1]) + 0.15, h: 1.4
      });
    }
    scene.add(g);
    api.fence = g;
  }

  /* ======================================================== ОКРУЖЕНИЕ === */
  /* Деревья по периметру, кусты, поленница — дают глубину и ориентиры. */
  function buildProps(THREE, scene, api) {
    const g = new THREE.Group();
    g.name = 'props';
    const rnd = U.rng(9182);

    const barkMat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(T.woodAlbedo(44, 256, [86, 72, 56])), roughness: 0.96
    });
    barkMat.map.wrapS = barkMat.map.wrapT = THREE.RepeatWrapping;
    barkMat.map.repeat.set(2, 3);
    if ('colorSpace' in barkMat.map) barkMat.map.colorSpace = THREE.SRGBColorSpace;

    /* крона: облако сплюснутых сфер с разными оттенками */
    const leafMats = [0x3c5424, 0x47612a, 0x33491f].map((c) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0, flatShading: true }));

    const TREE_N = 26;
    for (let i = 0; i < TREE_N; i++) {
      const a = (i / TREE_N) * TAU + rnd() * 0.2;
      const rad = FIELD.x * 0.46 + rnd() * 4;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad * (FIELD.z / FIELD.x);
      if (Math.abs(x) > FIELD.x / 2 + 6 || Math.abs(z) > FIELD.z / 2 + 6) continue;
      const h = 5.2 + rnd() * 3.6;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 + rnd() * 0.07, 0.28 + rnd() * 0.1, h, 9), barkMat);
      trunk.position.set(x, h / 2, z);
      trunk.castShadow = trunk.receiveShadow = true;
      g.add(trunk);
      const blobs = 5 + Math.floor(rnd() * 3);
      for (let b = 0; b < blobs; b++) {
        const r = 1.35 + rnd() * 1.0;
        const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMats[b % 3]);
        cr.position.set(
          x + (rnd() - 0.5) * 2.1,
          h * 0.78 + (rnd() - 0.2) * 1.7,
          z + (rnd() - 0.5) * 2.1);
        cr.scale.y = 0.78;
        cr.castShadow = true;
        cr.receiveShadow = true;
        g.add(cr);
      }
      api.colliders.push({ type: 'cyl', x, z, r: 0.42, h: 3 });
    }

    /* кусты */
    for (let i = 0; i < 34; i++) {
      const x = (rnd() - 0.5) * (FIELD.x - 8), z = (rnd() - 0.5) * (FIELD.z - 8);
      if (Math.abs(x - FIELD.x * 0.1) < 9 && z > -26 && z < 12) continue;   // не мешать стрельбищу
      const r = 0.45 + rnd() * 0.5;
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMats[i % 3]);
      bush.position.set(x, r * 0.72, z);
      bush.scale.set(1, 0.72, 1);
      bush.castShadow = bush.receiveShadow = true;
      g.add(bush);
      api._noGrass.push({ x, z, r: r * 1.1 });
    }

    /* поленница у дома */
    const logMat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(T.woodAlbedo(21, 128, [122, 98, 68])), roughness: 0.94
    });
    if ('colorSpace' in logMat.map) logMat.map.colorSpace = THREE.SRGBColorSpace;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 9; c++) {
        const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.62, 7), logMat);
        lg.rotation.z = Math.PI / 2;
        lg.position.set(-8.6 + (r % 2) * 0.03, 0.09 + r * 0.155, -18.4 + c * 0.17);
        lg.castShadow = lg.receiveShadow = true;
        g.add(lg);
      }
    }
    api.colliders.push({ type: 'box', x0: -9.0, x1: -8.2, z0: -18.6, z1: -16.8, h: 0.9 });
    api._noGrass.push({ x0: -9.2, x1: -8.0, z0: -18.8, z1: -16.6 });

    scene.add(g);
    api.props = g;
  }

  return { build, FIELD, inZones, buildHouse, buildGarden, soilCanvas, plantCrop,
    buildRange, buildFence, buildProps, makeTarget, makeSign, FIRE_LINE, RANGES };
});