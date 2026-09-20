/* ============================================================================
   Риг бойца: поза, обратная кинематика рук, хват оружия, походка.

   Логика позы строится «от оружия»: сначала мы решаем, где в пространстве
   находится автомат (это делает контроллер камеры / стрелка), затем руки
   подводятся к рукоятке и цевью обратной кинематикой, а корпус доворачивается
   так, чтобы приклад лёг в плечо. Именно такой порядок даёт бодикам-ощущение:
   оружие ведёт тело, а не наоборот.

   Тяжесть читается через задержки: оружие приходит в новую точку с
   запаздыванием (инерция массы), корпус догоняет взгляд ещё позже, шаги
   отдаются в ствол.
   ========================================================================== */
(function (root, factory) {
  const R = factory(root.GUtil, root.GSkel);
  if (typeof module !== 'undefined' && module.exports) module.exports = R;
  else root.GRig = R;
})(typeof self !== 'undefined' ? self : this, function (U, SK) {
  'use strict';

  /* ==================================================== two-bone IK ====== */
  /* Классическое аналитическое решение для цепочки из двух звеньев.
     Дано: положение корня (плечо), цель (запястье) и «полюс» — точка, куда
     смотрит локоть. Возвращает кватернионы для плеча и локтя.

     Работает в мировых координатах, затем результат переводится в локальные
     — так проще держать полюс привязанным к корпусу. */
  function twoBoneIK(THREE, opt) {
    const root = opt.root, mid = opt.mid, tip = opt.tip;
    const target = opt.target, pole = opt.pole;

    const wRoot = root.getWorldPosition(new THREE.Vector3());
    const wMid = mid.getWorldPosition(new THREE.Vector3());
    const wTip = tip.getWorldPosition(new THREE.Vector3());

    const lenA = wRoot.distanceTo(wMid);
    const lenB = wMid.distanceTo(wTip);
    const toTarget = new THREE.Vector3().subVectors(target, wRoot);
    let dist = toTarget.length();
    const maxLen = (lenA + lenB) * 0.998;
    const minLen = Math.abs(lenA - lenB) * 1.02 + 1e-4;
    dist = U.clamp(dist, minLen, maxLen);
    const dir = toTarget.clone().normalize();

    /* угол в корне между направлением на цель и первым звеном */
    const cosRoot = U.clamp((lenA * lenA + dist * dist - lenB * lenB) / (2 * lenA * dist), -1, 1);
    const angRoot = Math.acos(cosRoot);

    /* плоскость сгиба задаётся полюсом */
    let poleDir = new THREE.Vector3().subVectors(pole, wRoot);
    poleDir.addScaledVector(dir, -poleDir.dot(dir));
    if (poleDir.lengthSq() < 1e-8) poleDir.set(0, 1, 0).addScaledVector(dir, -dir.y);
    poleDir.normalize();

    const bendAxis = new THREE.Vector3().crossVectors(dir, poleDir).normalize();

    /* желаемые мировые позиции */
    const midDir = dir.clone().applyAxisAngle(bendAxis, -angRoot);
    const newMid = wRoot.clone().addScaledVector(midDir, lenA);

    /* ориентируем кости: локальная ось звена -> нужное направление */
    alignBone(THREE, root, wRoot, newMid, opt.axis, poleDir);
    /* После поворота корня mid уехал. Пересчитывать надо ОТ КОРНЯ: вызов
       mid.updateMatrixWorld() берёт matrixWorld родителя, а он ещё старый,
       поэтому второе звено считалось бы по устаревшему базису и рука
       промахивалась мимо цели. */
    root.updateMatrixWorld(true);
    const wMid2 = mid.getWorldPosition(new THREE.Vector3());
    const tgt2 = wRoot.clone().addScaledVector(dir, dist);
    alignBone(THREE, mid, wMid2, tgt2, opt.axis, poleDir);
    root.updateMatrixWorld(true);
  }

  const _q = {};
  function tmpQ(THREE, k) { return (_q[k] || (_q[k] = new THREE.Quaternion())); }

  /* Разворот кости так, чтобы её локальная ось `axis` смотрела из `from` в `to`. */
  function alignBone(THREE, bone, from, to, axis, up) {
    const parent = bone.parent;
    const want = new THREE.Vector3().subVectors(to, from);
    if (want.lengthSq() < 1e-10) return;
    want.normalize();

    /* текущее мировое направление локальной оси */
    const pq = parent ? parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    const cur = axis.clone().applyQuaternion(bone.quaternion).applyQuaternion(pq).normalize();

    const rot = new THREE.Quaternion().setFromUnitVectors(cur, want);
    const worldQ = bone.getWorldQuaternion(new THREE.Quaternion());
    const newWorld = rot.multiply(worldQ);
    bone.quaternion.copy(pq.invert().multiply(newWorld));
  }

  /* ================================================== хват оружия ======== */
  /* Узлы оружия (в системе модели АК, метры):
       gripR  — пистолетная рукоятка,
       gripL  — цевьё,
       trigger— спусковой крючок.
     Кисть ставится так, чтобы ладонь легла на узел, а ось пальцев была
     поперёк рукоятки. Точные смещения подобраны по геометрии АК-74. */
  const GRIP = {
    /* правая кисть на пистолетной рукоятке: ладонь охватывает её сзади,
       ось пальцев смотрит вперёд-вниз вдоль наклона рукоятки (≈ 20°) */
    right: {
      node: 'gripR',
      offset: [0.014, 0.050, 0.010],
      /* базис ладони в системе оружия: x — вдоль пальцев, y — от ладони */
      fingerDir: [-0.10, -0.32, -0.94],
      palmDir: [0.97, -0.05, -0.22],
      curl: [0.95, 1.05, 1.05, 0.90],     // указательный меньше — он на спуске
      thumb: 0.70
    },
    /* левая кисть на цевье: хват сверху-сбоку, большой палец поверх */
    left: {
      node: 'gripL',
      offset: [-0.004, -0.030, 0.012],
      fingerDir: [0.20, 0.86, 0.47],
      palmDir: [0.96, -0.24, -0.12],
      curl: [1.02, 1.08, 1.06, 0.98],
      thumb: 0.55
    }
  };

  /* Сгиб пальцев вокруг локальной оси Z кости: базовая «хватка».
     Значения — типичный обхват цилиндра диаметром ~35 мм. */
  function curlFingers(rig, side, amount, trigger) {
    const SS = side > 0 ? 'R' : 'L';
    const A = amount;
    const PH = [0.95, 1.15, 0.85];        // относительный сгиб фаланг
    for (let fi = 0; fi < SK.FINGERS.length; fi++) {
      const f = SK.FINGERS[fi];
      /* указательный правой руки управляется отдельно — он на спуске */
      const k = (side > 0 && f.key === 'index' && trigger !== undefined) ? trigger : A;
      for (let ph = 0; ph < 3; ph++) {
        const b = rig.bone(f.key + SS + (ph + 1));
        b.rotation.set(0, 0, 0);
        /* пальцы гнутся «в ладонь»: вокруг Z, знак зависит от стороны */
        b.rotation.z = -side * k * PH[ph] * 1.02;
        /* лёгкое схождение пальцев при сжатии кулака */
        if (ph === 0) b.rotation.y = -side * f.spread * 3.0 * k;
      }
    }
    /* большой палец: противопоставлен, гнётся меньше и заваливается вбок */
    const th = rig.thumbAmount === undefined ? A : rig.thumbAmount;
    for (let ph = 0; ph < 3; ph++) {
      const b = rig.bone('thumb' + SS + (ph + 1));
      b.rotation.set(0, 0, 0);
      if (ph === 0) { b.rotation.y = side * 0.55; b.rotation.z = -side * (0.30 + th * 0.35); }
      else b.rotation.z = -side * th * 0.85;
    }
  }

  /* ===================================================== поза покоя ====== */
  /* Базовая стойка: ноги на ширине плеч, лёгкий присед, вес на передней
     ноге, плечи развёрнуты вполоборота к цели. Всё остальное — дельты. */
  function applyBasePose(rig, p) {
    const b = rig.bone.bind(rig);
    const s = p || {};
    const stance = s.stance === undefined ? 1 : s.stance;

    b('hips').position.set(0, rig.metrics.hipY + (s.crouch || 0), 0);
    b('hips').rotation.set(s.hipPitch || 0, s.hipYaw || 0, 0);
    b('spine').rotation.set((s.spinePitch || 0.06) * stance, (s.spineYaw || 0) * 0.4, 0);
    b('chest').rotation.set((s.chestPitch || 0.05) * stance, (s.spineYaw || 0) * 0.6, 0);
    b('neck').rotation.set((s.neckPitch || -0.04), (s.headYaw || 0) * 0.35, 0);
    b('head').rotation.set((s.headPitch || 0), (s.headYaw || 0) * 0.65, 0);

    for (const side of [1, -1]) {
      const SS = side > 0 ? 'R' : 'L';
      /* ноги: небольшой сгиб в колене и разворот стопы наружу */
      const fwd = side > 0 ? (s.legStagger || 0) : -(s.legStagger || 0);
      b('hip' + SS).rotation.set(-(s.legBend || 0.14) * 0.9 + fwd, side * 0.06, side * 0.045);
      b('knee' + SS).rotation.set((s.legBend || 0.14) * 1.7, 0, 0);
      b('ankle' + SS).rotation.set(-(s.legBend || 0.14) * 0.8 - fwd, side * 0.05, 0);
      b('toe' + SS).rotation.set(0, 0, 0);
      /* ключицы: приподняты под вес брони */
      b('clav' + SS).rotation.set(0, 0, -side * 0.06);
    }
  }

  /* =================================================== класс рига ======== */
  function Rig(THREE, char) {
    this.THREE = THREE;
    this.char = char;
    this.metrics = char.metrics;
    this.bone = char.bone;
    this.thumbAmount = 0.6;

    /* сглаженные величины — дают вес и инерцию */
    this.sm = {
      aim: 0, sprint: 0, move: 0, crouch: 0,
      leanX: 0, leanZ: 0,
      breathe: Math.random() * 10,
      bobPhase: 0, stepPhase: 0,
      swayX: 0, swayY: 0, swayVX: 0, swayVY: 0,
      recoil: 0, recoilV: 0, recoilRot: 0,
      weaponLag: new THREE.Vector3(), weaponLagRot: new THREE.Euler(),
      lastYaw: 0, lastPitch: 0
    };
  }

  Rig.prototype.solveArms = function (weapon) {
    const THREE = this.THREE;
    const W = weapon;                       // Object3D оружия (система АК)
    W.updateMatrixWorld(true);

    for (const side of [1, -1]) {
      const SS = side > 0 ? 'R' : 'L';
      const G = side > 0 ? GRIP.right : GRIP.left;
      const node = W.getObjectByName(G.node) || W;
      const wp = node.getWorldPosition(new THREE.Vector3());

      /* смещение хвата задано в системе оружия */
      const off = new THREE.Vector3(G.offset[0] * side, G.offset[1], G.offset[2])
        .applyQuaternion(W.getWorldQuaternion(new THREE.Quaternion()));
      const target = wp.clone().add(off);

      /* полюс локтя: наружу и вниз от корпуса — анатомически верно для
         стрелковой стойки (локоть правой прижат, левый вынесен вперёд) */
      const chest = this.bone('chest').getWorldPosition(new THREE.Vector3());
      const pole = chest.clone();
      if (side > 0) pole.add(new THREE.Vector3(0.42, -0.34, 0.30));
      else pole.add(new THREE.Vector3(-0.30, -0.44, 0.12));

      twoBoneIK(THREE, {
        root: this.bone('shoulder' + SS),
        mid: this.bone('elbow' + SS),
        tip: this.bone('wrist' + SS),
        target, pole,
        axis: new THREE.Vector3(side, 0, 0)
      });

      /* ориентация кисти: пальцы вдоль fingerDir оружия */
      const wq = W.getWorldQuaternion(new THREE.Quaternion());
      const fDir = new THREE.Vector3(G.fingerDir[0] * side, G.fingerDir[1], G.fingerDir[2])
        .normalize().applyQuaternion(wq);
      const pDir = new THREE.Vector3(G.palmDir[0] * side, G.palmDir[1], G.palmDir[2])
        .normalize().applyQuaternion(wq);

      const wrist = this.bone('wrist' + SS);
      wrist.updateMatrixWorld(true);
      const pq = wrist.parent.getWorldQuaternion(new THREE.Quaternion());
      /* строим целевой базис: X — вдоль пальцев, Y — от ладони */
      const ex = fDir.clone().normalize();
      let ey = pDir.clone();
      ey.addScaledVector(ex, -ey.dot(ex));
      if (ey.lengthSq() < 1e-8) ey.set(0, 1, 0);
      ey.normalize();
      const ez = new THREE.Vector3().crossVectors(ex, ey);
      const m = new THREE.Matrix4().makeBasis(ex.multiplyScalar(side), ey, ez.multiplyScalar(side));
      const want = new THREE.Quaternion().setFromRotationMatrix(m);
      wrist.quaternion.copy(pq.invert().multiply(want));
      wrist.updateMatrixWorld(true);

      /* пальцы обхватывают */
      const trig = side > 0 ? this.triggerCurl : undefined;
      this.thumbAmount = G.thumb;
      curlFingers(this, side, side > 0 ? 1.02 : 0.98, trig);
    }
  };

  return { Rig, twoBoneIK, alignBone, curlFingers, applyBasePose, GRIP };
});