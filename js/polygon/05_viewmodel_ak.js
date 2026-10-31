
/* ==========================================================================
   МОДУЛЬ: viewmodel/ak.js
   ========================================================================== */
/* ============================================================================
   АК-74 в риге рук (viewmodel/vm.js) и кисти GLB на бойцах со стороны.

   Система оружия рига: начало — задний срез ствольной коробки на оси канала,
   -Z к дулу. АК ставится в неё со сдвигом AK_OFF: рукоятка АК совпадает с
   рукояткой, под которую настроен хват рига, цевьё — с его цевьём. Поэтому
   позы кистей и пальцев рига ложатся на АК без переделки; меняется только
   опорная кисть (цевьё АК уже) и позы прицела и перезарядки (у АК свои
   прицел, магазин и рукоятка затвора).

   Кисти бойцов со стороны — те же перчатки GLB, что и от первого лица:
   кисть крепится к кости запястья, хват и пальцы берутся из той же спеки.
   ========================================================================== */
(function (root, factory) {
  const A = factory(root.THREE, root.GVM);
  if (typeof module !== 'undefined' && module.exports) module.exports = A;
  else root.GAK = A;
})(typeof self !== 'undefined' ? self : this, function (THREE, VM) {
  'use strict';
  if (!VM) return null;
  const { gripMatrix, pose: P, translate, magInHand, pouch, LEFT_OPEN, CONFIG } = VM;
  const DEG = Math.PI / 180;

  /* АК (система модели, м) -> система оружия рига */
  const AK_OFF = new THREE.Vector3(0, -0.075, 0.030);
  const AK_OFF_M = new THREE.Matrix4().makeTranslation(AK_OFF.x, AK_OFF.y, AK_OFF.z);
  const AK_OFF_INV = AK_OFF_M.clone().invert();
  const ak = (x, y, z) => new THREE.Vector3(x, y, z).add(AK_OFF);        // точка АК в системе рига
  /* горловина магазина АК: вокруг неё магазин вынимают и вставляют */
  const MAG_SEAT_AK = new THREE.Vector3(0, 0.040, -0.150);
  const BOLT_TRAVEL = 0.106;

  /* ------------------------------------------------------------ спека -- */
  function createSpec(model) {
    const fingers = { middle: [0.1, 1.35, 1.45, 0.7, 0], ring: [0.15, 1.35, 1.45, 0.7, 0], pinky: [0.2, 1.25, 1.35, 0.7, 0] };
    const thumb = [0.9, 0.45, 0.35, 0, -0.35];
    /* Опорная кисть снизу цевья, развёрнута на 50° вокруг канала ствола (как
       в риге), но ближе к оси: цевьё АК на 6 мм уже; и на 3,5 см дальше —
       перед магазином, на середине нижнего цевья. */
    const leftGrip = new THREE.Matrix4().makeRotationZ(-50 * DEG)
      .multiply(gripMatrix([-0.039 * 0.9, -0.057 * 0.9, -0.250], [0.72, 0.12, -0.68], [0.087, -0.992, -0.083]));
    /* Рукоятка затвора АК — справа на затворной раме: левая кисть перехватывает
       её сверху, большим пальцем к себе. */
    const charge = gripMatrix([-0.030, 0.050, -0.040], [0.86, -0.45, -0.22], [0.40, 0.88, 0.25]);
    const gunPos = [[0, [0, 0, 0]], [0.28, [-0.03, 0.08, -0.1]], [1, [-0.035, 0.09, -0.1]], [1.24, [-0.035, 0.092, -0.1]], [1.32, [-0.03, 0.102, -0.1]]];
    const gunRot = [[0, [0, 0, 0]], [0.28, [14, 8, -24]], [1, [16, 9, -26]], [1.24, [17, 9, -25]], [1.32, [20, 9, -22]]];
    const toMag = [
      { t: 0, at: 'grip', pose: 'support' },
      { t: 0.1, at: 'grip', pose: 'support' },
      { t: 0.5, at: 'pouch', pose: 'open' },
      { t: 0.64, at: 'pouch', pose: 'mag' },
      /* магазин АК заводят передним зацепом вперёд и «качают» назад */
      { t: 1.02, at: 'mag', mag: [-0.10, -0.03, -0.30], pose: 'mag' },
      { t: 1.14, at: 'mag', mag: [-0.03, -0.012, -0.22], pose: 'mag' },
      { t: 1.26, at: 'mag', mag: [0, 0, 0], pose: 'mag' },
      { t: 1.32, at: 'mag', mag: [-4e-3, 0, 0], pose: 'open' }
    ];
    const events = [[0.18, 'magOut'], [0.24, 'drop'], [0.48, 'pouch'], [0.64, 'grab'], [1.16, 'magIn'], [1.26, 'seat']];
    const tuning = Object.assign({}, CONFIG.rifle, {
      /* Позы — от глаз (шлемная камера, game/bodycam.js). Начало системы
         оружия — задний срез коробки на оси канала; линия прицеливания АК
         на 0,041 м выше оси, целик на 0,2185 м впереди среза. */
      poses: Object.assign({}, CONFIG.rifle.poses, {
        /* наготове: целик ~11 см ниже и ~8 см правее глаза, ствол сведён с
           осью взгляда на ~15 м — от бедра пули идут туда, куда смотришь */
        hip: { pos: [0.075, -0.15, -0.17], rot: [0.57, 0.29, -3] },
        /* прицел: линия целик—мушка на оси объектива, вынос глаза 0,29 м */
        ads: { pos: [0, -0.041, -0.075], rot: [0, 0, 0] },
        /* бег: автомат поперёк груди, ствол вниз-влево; цевьё и опорная
           рука остаются у нижнего края кадра, а не пропадают за ним */
        sprint: { pos: [0.10, -0.19, -0.25], rot: [-21, 35, -30] },
        wallTuck: { pos: [0.06, -0.30, -0.06], rot: [-32, 8, -4] }
      }),
      /* наведение руками: автомат поворачивается вокруг точки у правого
         плеча (приклад в плечевом упоре), а не вокруг кистей; плечи рига
         на 0,24 м ниже глаз, поэтому и точка ниже, чем в нагрудном риге */
      aimPivot: [0.08, -0.20, 0.12],
      magSize: 30, auto: true
    });
    return {
      id: 'rifle', model, tuning,
      rightGrip: gripMatrix([0.028, -0.0775, 0.062], [0, -0.342, -0.94], [1, 0, 0]),
      leftGrip,
      hands: {
        indexed: P(thumb, [0, 0, 0.1, 0.05, -0.1], fingers.middle, fingers.ring, fingers.pinky),
        trigger: P(thumb, [0, 0.36, 1.0, 0.45, 0.02], fingers.middle, fingers.ring, fingers.pinky),
        magRelease: P(thumb, [0, 0.15, 0.45, 0.25, -0.15], fingers.middle, fingers.ring, fingers.pinky),
        support: P([0.3, 0.15, 0.05, 0, 0.2], [0.05, 1.25, 1.35, 0.65, 0], [0.05, 1.3, 1.4, 0.7, 0], [0.1, 1.3, 1.4, 0.7, 0], [0.15, 1.25, 1.35, 0.7, 0]),
        open: LEFT_OPEN,
        mag: P([0.5, 0.3, 0.2, 0, 0.2], [0, 0.2, 0.25, 0.1, 0], [0.1, 1, 1.05, 0.5, 0], [0.1, 1.05, 1.1, 0.5, 0], [0.15, 1, 1.05, 0.5, 0]),
        aux: P([0.3, 0.4, 0.3, 0, 0.4], [0.1, 1.1, 1.1, 0.5, 0], [0.1, 1.15, 1.1, 0.5, 0], [0.1, 1.15, 1.1, 0.5, 0], [0.1, 1.1, 1.1, 0.5, 0])
      },
      magInHand: magInHand(0.1),
      pouch: pouch([-0.09, -0.38, -0.05], [-1, 0.2, 0.3]),
      tactical: {
        duration: 2,
        gunPos: [...gunPos, [1.62, [-0.01, 0.02, -0.02]], [2, [0, 0, 0]]],
        gunRot: [...gunRot, [1.62, [3, 2, -4]], [2, [0, 0, 0]]],
        left: [...toMag, { t: 1.65, at: 'grip', pose: 'support' }],
        events, magRelease: [0.12, 0.34]
      },
      /* пустой магазин: после смены — перехват рукоятки затвора и досыл */
      empty: {
        duration: 2.5,
        gunPos: [...gunPos, [1.5, [-0.03, 0.07, -0.06]], [1.9, [-8e-3, 0.015, -0.015]], [2.5, [0, 0, 0]]],
        gunRot: [...gunRot, [1.5, [8, 6, -30]], [1.9, [2, 2, -3]], [2.5, [0, 0, 0]]],
        left: [
          ...toMag,
          { t: 1.52, at: 'gun', gun: charge, pose: 'aux' },
          { t: 1.66, at: 'gun', gun: translate(0, 0, BOLT_TRAVEL, charge), pose: 'aux' },
          { t: 1.72, at: 'gun', gun: translate(-0.02, 0.03, BOLT_TRAVEL, charge), pose: 'open' },
          { t: 2.05, at: 'grip', pose: 'support' }
        ],
        rack: [1.52, 1.66, 1.70],
        events: [...events, [1.70, 'release']],
        magRelease: [0.12, 0.34]
      },
      shellVel: [[3.5, 0.8, -1], [5, 1.6, -0.2]]
    };
  }

  /* ------------------------------------------------ модель-заместитель -- */
  /* Риг двигает «свою» модель; после кадра её состояние переносится на
     настоящий АК бойца (applyToGun). */
  function createModel() {
    const m = {
      root: new THREE.Group(), magSeat: new THREE.Object3D(), magazine: new THREE.Group(),
      muzzle: new THREE.Object3D(), ejectionPort: new THREE.Object3D(), lightMount: new THREE.Object3D(),
      roundInMag: new THREE.Object3D(), slide: 0, trigger: 0,
      setSlide(t) { m.slide = t; }, setTrigger(t) { m.trigger = t; },
      setSlideStop() {}, setSelector() {}, setLight() {}
    };
    m.magSeat.position.copy(ak(MAG_SEAT_AK.x, MAG_SEAT_AK.y, MAG_SEAT_AK.z));
    m.magSeat.add(m.magazine);
    m.muzzle.position.copy(ak(0, 0.075, -0.719));
    m.ejectionPort.position.copy(ak(0.019, 0.080, -0.146));
    m.lightMount.position.copy(ak(0.03, 0.06, -0.45));
    m.root.add(m.magSeat, m.muzzle, m.ejectionPort, m.lightMount, m.roundInMag);
    return m;
  }

  const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  /* Настоящий АК бойца (gun из buildGun) — в позицию, заданную ригом.
     rigRootWorld — мировая матрица корня рига (камеры рига). */
  function applyToGun(rig, w, rigRootWorld) {
    _m.multiplyMatrices(rigRootWorld, rig.gunMatrix).multiply(AK_OFF_M);
    _m.decompose(w.root.position, w.root.quaternion, _s);
    w.root.scale.set(1, 1, 1);
    w.recoilRig.position.set(0, 0, 0);
    w.tiltRig.rotation.set(0, 0, 0);
    const g = w.gun, model = rig.gun;
    /* затвор: цикл выстрела рига или досыл рукояткой при перезарядке */
    let slide = model.slide;
    const tr = rig.reloading && rig.track;
    if (tr && tr.rack) {
      const [a, b, c] = tr.rack, t = rig.reloadT;
      if (t > a && t < c) slide = Math.max(slide, t < b ? (t - a) / (b - a) : 1 - (t - b) / (c - b));
    }
    if (g.parts.bolt) g.parts.bolt.position.z = slide * BOLT_TRAVEL;
    if (g.parts.trigger) g.parts.trigger.rotation.x = -Math.min(1, model.trigger) * 0.2;
    const mag = g.parts.magazine;
    if (mag) {
      mag.visible = model.magazine.visible;
      /* магазин относительно горловины -> в систему АК */
      _m2.compose(model.magazine.position, model.magazine.quaternion, _s.set(1, 1, 1));
      _m.makeTranslation(MAG_SEAT_AK.x, MAG_SEAT_AK.y, MAG_SEAT_AK.z).multiply(_m2)
        .multiply(_m2.makeTranslation(-MAG_SEAT_AK.x, -MAG_SEAT_AK.y, -MAG_SEAT_AK.z));
      _m.decompose(mag.position, mag.quaternion, _s);
    }
    w.root.updateMatrixWorld(true);
  }

  /* мировая матрица системы рига для настоящего АК */
  function rigGunWorld(w, out) {
    w.gun.updateMatrixWorld(true);
    return out.multiplyMatrices(w.gun.matrixWorld, AK_OFF_INV);
  }

  /* ----------------------------------------- кисти GLB на скелете бойца -- */
  /* Кисть рига: -Z к пальцам, +Y — тыл, +X — к мизинцу у правой. Кость
     запястья бойца в покое: пальцы по ±X (своя сторона), тыл вверх, большой
     палец вперёд (-Z). C — поворот кисти рига в системе кости. */
  function handBasis(side) {
    const z = new THREE.Vector3(-side, 0, 0), y = new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(y, z);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }
  const C_R = handBasis(1), C_L = handBasis(-1);
  const C_INV = { R: C_R.clone().invert(), L: C_L.clone().invert() };

  /* v25: у бойцов от третьего лица манжета перчатки уходит под рукав.
     Рукав (11_soldier_clothing.js) доходит почти до сустава запястья, а
     манжету GLB удлиняем к локтю и сужаем: при изгибе запястья её плоский
     срез остаётся внутри рукава. Одна копия геометрии на сторону. */
  const tpGeo = {};
  const CUFF_EXT = 0.017, CUFF_TAPER = 0.15;
  function tpCuffGeometry(mesh, side) {
    if (tpGeo[side]) return tpGeo[side];
    const T = THREE, sk = mesh.skeleton, g0 = mesh.geometry;
    const bindPos = (name) => {
      const i = sk.bones.findIndex((b) => b.name === name);
      return i < 0 ? null : new T.Vector3().setFromMatrixPosition(sk.boneInverses[i].clone().invert());
    };
    const W = bindPos('wrist'), M = bindPos('middle-finger-phalanx-proximal');
    if (!W || !M || !g0.attributes.normal) return (tpGeo[side] = g0);
    const A = W.clone().sub(M).normalize();
    const g = g0.clone(), pos = g.attributes.position, nrm = g.attributes.normal, n = pos.count;
    const q = new T.Vector3(), C = new T.Vector3();
    let uTop = 0, nc = 0;
    for (let i = 0; i < n; i++) uTop = Math.max(uTop, q.fromBufferAttribute(pos, i).sub(W).dot(A));
    if (uTop < 0.01) return (tpGeo[side] = g0);
    for (let i = 0; i < n; i++) {
      const u = q.fromBufferAttribute(pos, i).sub(W).dot(A);
      if (u > uTop * 0.3 && u < uTop * 0.85) { C.add(q.add(W)); nc++; }
    }
    if (!nc) return (tpGeo[side] = g0);
    /* ось манжеты — через её центр, на уровне сустава */
    C.divideScalar(nc); C.addScaledVector(A, -C.clone().sub(W).dot(A));
    const U0 = 0.002, U1 = 0.006, d = new T.Vector3();
    const F = (p, out) => {
      d.copy(p).sub(C); const u = d.dot(A);
      if (u <= U0) return out.copy(p);
      const t = Math.min(1, (u - U0) / (uTop - U0)), sc = 1 - CUFF_TAPER * t * t * (3 - 2 * t);
      const du = u > U1 ? CUFF_EXT * Math.min(1, (u - U1) / (uTop - U1)) : 0;
      d.addScaledVector(A, -u).multiplyScalar(sc);
      return out.copy(C).add(d).addScaledVector(A, u + du);
    };
    /* нормали — через обратную транспонированную матрицу Якоби отображения */
    const h = 1e-4, J = new T.Matrix3(), a = new T.Vector3(), b = new T.Vector3(), e = new T.Vector3(), nn = new T.Vector3();
    const cols = [new T.Vector3(), new T.Vector3(), new T.Vector3()];
    for (let i = 0; i < n; i++) {
      q.fromBufferAttribute(pos, i);
      if (q.clone().sub(C).dot(A) <= U0) continue;
      for (let k = 0; k < 3; k++) {
        e.set(0, 0, 0).setComponent(k, h);
        F(a.copy(q).add(e), a); F(b.copy(q).sub(e), b);
        cols[k].copy(a).sub(b).multiplyScalar(1 / (2 * h));
      }
      J.set(cols[0].x, cols[1].x, cols[2].x, cols[0].y, cols[1].y, cols[2].y, cols[0].z, cols[1].z, cols[2].z);
      J.invert().transpose();
      nn.fromBufferAttribute(nrm, i).applyMatrix3(J).normalize();
      nrm.setXYZ(i, nn.x, nn.y, nn.z);
      F(q, a); pos.setXYZ(i, a.x, a.y, a.z);
    }
    pos.needsUpdate = nrm.needsUpdate = true;
    g.computeBoundingBox(); g.computeBoundingSphere();
    return (tpGeo[side] = g);
  }

  let gloveMat = null;
  function attachHands(char, assets) {
    if (!assets) return null;
    gloveMat = gloveMat || VM.createGloveMaterial();
    const out = {};
    for (const [SS, side, src] of [['R', 'right', assets.right], ['L', 'left', assets.left]]) {
      const h = new VM.GlovedHand(assets.clone(src), side, gloveMat);
      h.anchor.quaternion.copy(SS === 'R' ? C_R : C_L);
      h.anchor.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        if (o.isSkinnedMesh) { o.geometry = tpCuffGeometry(o, side); o.userData.lodArt = true; }
      });
      if (h.material && h.material.userData.uCuffK) h.material.userData.uCuffK.value = 1;
      char.bone('wrist' + SS).add(h.anchor);
      out[SS] = h;
    }
    return out;
  }

  /* Поворот кости запястья в мире по мировому повороту кисти рига. */
  function wristQuat(anchorQuat, SS, out) {
    return out.copy(anchorQuat).multiply(C_INV[SS]);
  }

  return { AK_OFF, AK_OFF_M, createSpec, createModel, applyToGun, rigGunWorld, attachHands, wristQuat, MAG_SEAT_AK };
});
