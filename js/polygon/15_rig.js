
/* ==========================================================================
   МОДУЛЬ: rig.js
   ========================================================================== */
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

    /* Ось сгиба. Поворот `dir` вокруг неё на +angRoot уводит первое звено
       В СТОРОНУ полюса: cross(poleDir, dir) даёт ось, для которой
       положительный угол по правилу правой руки идёт от dir к poleDir.
       Раньше ось и знак были взяты наоборот, и локоть выворачивался ровно
       в противоположную сторону от полюса — отсюда «куриные крылья»:
       локоть уезжал выше плеча и вперёд, а не вниз к рёбрам. */
    const bendAxis = new THREE.Vector3().crossVectors(poleDir, dir).normalize();

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
    /* Левая кисть ОБХВАТЫВАЕТ ЦЕВЬЁ СНИЗУ.

       Ладонь уходит под цевьё (offset по Y отрицательный), пальцы поднимаются
       вверх-наружу и смыкаются поверх, большой палец ложится вдоль. Именно
       так держат оружие стоя: кисть работает как опора снизу, а не как
       «крюк» сверху.

       Y-смещение увеличено до -0,055: раньше ладонь сидела вровень с осью
       цевья и кисть всплывала НА ЛИНИЮ ПРИЦЕЛИВАНИЯ (целик на y = 0,116),
       закрывая мушку в прицеле. Теперь кисть заведомо ниже прицельной линии
       и в прицел попадает лишь краем снизу — как в жизни. */
    left: {
      node: 'gripL',
      /* -0,068: кисть реалистичной модели (перчатка поверх ладони MakeHuman)
         крупнее процедурной, и при -0,055 пальцы, сомкнутые поверх цевья,
         закрывали мушку в прицеле. */
      offset: [-0.004, -0.068, 0.020],
      fingerDir: [0.20, 0.86, 0.47],
      palmDir: [0.96, -0.24, -0.12],
      curl: [1.02, 1.08, 1.06, 0.98],
      thumb: 0.55
    },
    /* В ПРИЦЕЛЕ цевьё лежит в ладони: кисть под ним, большой палец вдоль
       левого бока, пальцы поднимаются по правому. Верх цевья всего на 4 мм
       ниже прицельной линии (0,112 против 0,116), поэтому ни один палец не
       должен заходить наверх — иначе он закрывает мушку. Ось пальцев
       смотрит вправо-вперёд, тыльная сторона кисти — вниз-влево.
       Значения X даны для правой руки и зеркалятся по стороне. */
    leftAds: {
      node: 'gripL',
      offset: [0.036, -0.031, 0.028],
      fingerDir: [-0.70, 0.05, -0.70],
      palmDir: [0.10, -0.99, 0.0],
      curl: [0.85, 0.90, 0.90, 0.85],
      thumb: 0.10,
      /* большой палец вдоль левого бока, а не вверх: при обычном
         противопоставлении он вставал над цевьём выше мушки */
      thumbBase: [0.35, 0.02]
    },
    /* НА РЕМНЕ кисть подходит к цевью сверху-снаружи: тыльная сторона
       смотрит от бойца, пальцы спускаются по правому боку оружия и
       подхватывают цевьё снизу, большой палец лежит вдоль него. */
    leftSling: {
      node: 'gripL',
      offset: [-0.030, 0.060, 0.020],
      fingerDir: [-0.10, -0.90, -0.42],
      palmDir: [-0.95, 0.10, 0.10],
      curl: [1.15, 1.20, 1.20, 1.15],
      thumb: 0.45
    }
  };

  /* Смесь двух хватов: смещение и оси — линейно, сгибы пальцев — линейно. */
  function mixGrip(a, b, k) {
    if (k <= 0) return a;
    if (k >= 1) return b;
    const l = (x, y) => x.map((v, i) => v + (y[i] - v) * k);
    return {
      node: a.node, offset: l(a.offset, b.offset), fingerDir: l(a.fingerDir, b.fingerDir),
      palmDir: l(a.palmDir, b.palmDir), curl: l(a.curl, b.curl), thumb: a.thumb + (b.thumb - a.thumb) * k,
      thumbBase: l(a.thumbBase || [0.55, 0.30], b.thumbBase || [0.55, 0.30])
    };
  }

  /* ================================================== позы рук ========== */
  /* Куда смотрит локоть — направление от плечевого сустава в системе груди:
     x — наружу (для своей стороны), y — вверх, z — назад. clav — доля
     отклонения ключицы к цели кисти: [протракция, подъём]. reach — до какой
     доли длины вытягивается опорная рука; дальше кисть скользит по цевью.

     На ремне оба локтя разведены наружу и чуть назад: жилет шире плечевого
     сустава модели (0,20–0,23 м против 0,224), и рука, опущенная отвесно,
     уходит в него. Плечо отведено от корпуса на 20–25°, как на референсе. */
  const ARM = {
    /* v16: локти вниз и чуть назад, прижаты к корпусу (было «крыльями» наружу) */
    sling: { R: [0.08, -0.95, 0.28], L: [0.35, -0.90, 0.20], clav: [0.20, 0.14], reach: 0.95 },
    ready: { R: [0.22, -0.93, 0.30], L: [-0.11, -0.99, -0.06], clav: [0.30, 0.10], reach: 0.86 },
    ads: { R: [0.30, -0.90, 0.30], L: [-0.06, -0.99, -0.10], clav: [0.30, 0.10], reach: 0.86 }
  };
  /* доля «продолжения кисти» в выборе локтя (остальное — подсказка позы) */
  const HANDK = { sling: 0.3, ready: 0.6 };
  function mixArm(a, b, k) {
    const l = (x, y) => x.map((v, i) => v + (y[i] - v) * k);
    return { R: l(a.R, b.R), L: l(a.L, b.L), clav: l(a.clav, b.clav), reach: a.reach + (b.reach - a.reach) * k };
  }

  /* v13: объём корпуса для рук. Руки бойца — твёрдые: плечо и предплечье
     не входят в грудь и плитоноску. Объём снят с самой сетки (жилет,
     подсумки, рубаха — вершины, привязанные к груди/спине/тазу/шее):
     по срезам высоты 3 см — суперэллипс (|x/a|^4 + |z/b|^4 = 1) вокруг
     центра среза. Такой «бокс со скруглёнными углами» повторяет форму
     плитоноски лучше одной капсулы. Считается один раз на модель. */
  function torsoModel(ch) {
    if (ch._torso !== undefined) return ch._torso;
    const k = ch.scale || 1, BI = ch.boneIndex || {};
    const keep = new Set(['chest', 'spine', 'hips', 'neck'].map((n) => BI[n]).filter((x) => x !== undefined));
    const y0 = 1.06, dy = 0.03, NS = 19, S = [];
    for (let i = 0; i < NS; i++) S.push({ x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, n: 0 });
    for (const g of ['vest', 'vestHard', 'vestMag', 'vestDark', 'shirt']) {
      const m = ch.meshes && ch.meshes[g];
      if (!m) continue;
      const geo = m.geometry, P = geo.attributes.position.array, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
      if (!si || !sw) continue;
      for (let v = 0, n = P.length / 3; v < n; v++) {
        let best = 0, bi = -1;
        for (let c = 0; c < 4; c++) { const w = sw.getComponent(v, c); if (w > best) { best = w; bi = si.getComponent(v, c); } }
        if (!keep.has(bi) || best < 0.5) continue;
        const i = Math.round((P[v * 3 + 1] - y0) / dy);
        if (i < 0 || i >= NS) continue;
        const L = S[i], x = P[v * 3], z = P[v * 3 + 2];
        if (x < L.x0) L.x0 = x; if (x > L.x1) L.x1 = x; if (z < L.z0) L.z0 = z; if (z > L.z1) L.z1 = z; L.n++;
      }
    }
    if (!S.some((L) => L.n > 8)) { ch._torso = null; return null; }
    for (let i = 0; i < NS; i++) if (S[i].n <= 8) { const j = S.findIndex((L) => L.n > 8); S[i] = Object.assign({}, S[j]); }
    for (const L of S) { L.cx = (L.x0 + L.x1) / 2; L.ax = (L.x1 - L.x0) / 2; L.cz = (L.z0 + L.z1) / 2; L.az = (L.z1 - L.z0) / 2; }
    const cr = ch.rest.chest;
    ch._torso = { y0, dy, NS, S, k, cr: [cr[0] / k, cr[1] / k, cr[2] / k] };
    return ch._torso;
  }
  /* глубина проникновения точки (мир) с радиусом r в корпус, м */
  function torsoPen(T, inv, p, r, tmp) {
    tmp.copy(p).applyMatrix4(inv);
    const x = (tmp.x + T.cr[0] * T.k) / T.k, y = (tmp.y + T.cr[1] * T.k) / T.k, z = (tmp.z + T.cr[2] * T.k) / T.k;
    const fi = (y - T.y0) / T.dy;
    if (fi < 0 || fi > T.NS - 1) return 0;
    const i = Math.min(T.NS - 2, Math.floor(fi)), f = fi - i, A = T.S[i], B = T.S[i + 1];
    const cx = A.cx + (B.cx - A.cx) * f, ax = A.ax + (B.ax - A.ax) * f + r;
    const cz = A.cz + (B.cz - A.cz) * f, az = A.az + (B.az - A.az) * f + r;
    const u = Math.abs(x - cx) / ax, w = Math.abs(z - cz) / az;
    const q = Math.sqrt(Math.sqrt(u * u * u * u + w * w * w * w));
    return q < 1 ? (1 - q) * Math.min(ax, az) : 0;
  }
  Rig.torsoModel = torsoModel; Rig.torsoPen = torsoPen; Rig.ARM = ARM; Rig.HANDK = HANDK;

  /* Кость в мировом базисе: ex — вдоль кости, ey — ось шарнира. */
  function setWorldBasis(THREE, bone, ex, ey) {
    const ez = new THREE.Vector3().crossVectors(ex, ey);
    const wq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wq));
    bone.updateMatrixWorld(true);
  }
  /* Угол скрутки кватерниона вокруг локальной оси X (swing-twist). */
  function twistX(q) {
    let a = 2 * Math.atan2(q.x, q.w);
    if (a > Math.PI) a -= 2 * Math.PI;
    if (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  /* Сгиб пальцев вокруг локальной оси Z кости: базовая «хватка».
     Значения — типичный обхват цилиндра диаметром ~35 мм. */
  function curlFingers(rig, side, amount, trigger) {
    const SS = side > 0 ? 'R' : 'L';
    /* amount — число или сгиб по пальцам [указательный, средний, безымянный, мизинец] */
    const A = amount;
    const PH = [0.95, 1.15, 0.85];        // относительный сгиб фаланг
    for (let fi = 0; fi < SK.FINGERS.length; fi++) {
      const f = SK.FINGERS[fi];
      const Af = Array.isArray(A) ? A[fi] : A;
      /* указательный правой руки управляется отдельно — он на спуске */
      const k = (side > 0 && f.key === 'index' && trigger !== undefined) ? trigger : Af;
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
    const th = rig.thumbAmount === undefined ? (Array.isArray(A) ? A[0] : A) : rig.thumbAmount;
    /* основание: [отведение от указательного, противопоставление к ладони] */
    const tb = rig.thumbBase || [0.55, 0.30];
    for (let ph = 0; ph < 3; ph++) {
      const b = rig.bone('thumb' + SS + (ph + 1));
      b.rotation.set(0, 0, 0);
      if (ph === 0) { b.rotation.y = side * tb[0]; b.rotation.z = -side * (tb[1] + th * 0.35); }
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
      /* Ноги: небольшой сгиб в колене и разворот стопы наружу.
         Колено гнётся НАЗАД — отрицательный угол (см. поясняющий блок в
         шаговом цикле). */
      const fwd = side > 0 ? (s.legStagger || 0) : -(s.legStagger || 0);
      const bend = (s.legBend === undefined ? 0.14 : s.legBend);
      b('hip' + SS).rotation.set(-bend * 0.55 + fwd, side * 0.06, side * 0.045);
      b('knee' + SS).rotation.set(-bend * 1.2, 0, 0);
      b('ankle' + SS).rotation.set(bend * 0.65 - fwd, side * 0.05, 0);
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

  /* Кисти GLB (viewmodel/ak.js): запястье ставится в кисть рига, локоть
     выбирается так, чтобы предплечье шло вдоль кисти — тогда кисть не
     выламывается в запястье. handTargets — мировые матрицы кистей рига,
     handPoses — позы пальцев рига. */
  Rig.prototype.solveArmsGLB = function () {
    const THREE = this.THREE, AKA = typeof self !== 'undefined' ? self.GAK : null;
    const rest = this.char.rest;
    const chestQ = this.bone('chest').getWorldQuaternion(new THREE.Quaternion());
    const chestQi = chestQ.clone().invert();
    const kr = this.readyAmount === undefined ? 1 : U.clamp01(this.readyAmount);
    const ka = U.clamp01(this.adsAmount || 0);
    const pose = mixArm(mixArm(ARM.sling, ARM.ready, kr), ARM.ads, ka);
    this.gripTarget = this.gripTarget || {};
    this.armDebug = this.armDebug || {};
    const P = new THREE.Vector3(), Q = new THREE.Quaternion(), Sc = new THREE.Vector3();
    for (const side of [1, -1]) {
      const SS = side > 0 ? 'R' : 'L';
      this.handTargets[SS].decompose(P, Q, Sc);
      const clav = this.bone('clav' + SS), shoulder = this.bone('shoulder' + SS);
      const elbow = this.bone('elbow' + SS), wrist = this.bone('wrist' + SS);
      const dist3 = (a, b) => Math.hypot(rest[a][0] - rest[b][0], rest[a][1] - rest[b][1], rest[a][2] - rest[b][2]);
      const lenA = dist3('shoulder' + SS, 'elbow' + SS), lenB = dist3('elbow' + SS, 'wrist' + SS);
      {
        const cp = clav.getWorldPosition(new THREE.Vector3());
        const d = P.clone().sub(cp).applyQuaternion(chestQi).normalize();
        clav.rotation.y += side * U.clamp(Math.max(0, -d.z) * pose.clav[0], 0, 0.26);
        clav.rotation.z += side * U.clamp(d.y * pose.clav[1] + 0.02, -0.08, 0.12);
        clav.updateMatrixWorld(true);
      }
      const S = shoulder.getWorldPosition(new THREE.Vector3());
      const toT = P.clone().sub(S);
      const d = U.clamp(toT.length(), Math.abs(lenA - lenB) + 1e-3, (lenA + lenB) * 0.999);
      const dir = toT.normalize();
      const cosA = U.clamp((lenA * lenA + d * d - lenB * lenB) / (2 * lenA * d), -1, 1);
      const sinA = Math.sqrt(1 - cosA * cosA);
      /* локоть на окружности решений — ближе всего к продолжению кисти */
      const prox = new THREE.Vector3(0, 0, 1).applyQuaternion(Q);
      const Ed = P.clone().addScaledVector(prox, lenB);
      const Cc = S.clone().addScaledVector(dir, cosA * lenA);
      const perp = Ed.sub(Cc); perp.addScaledVector(dir, -perp.dot(dir));
      const L = pose[SS];
      const hint = new THREE.Vector3(L[0] * side, L[1], L[2]).applyQuaternion(chestQ);
      hint.addScaledVector(dir, -hint.dot(dir));
      if (hint.lengthSq() > 1e-8) hint.normalize();
      /* Основа — подсказка позы (локоть вниз-наружу); продолжение кисти
         подмешивается, только пока не поднимает локоть: иначе «на ремне»
         локоть задирался выше плеча. */
      const upC = new THREE.Vector3(0, 1, 0).applyQuaternion(chestQ);
      let k = 0;
      if (perp.lengthSq() > 1e-8) {
        perp.normalize();
        k = U.lerp(HANDK.sling, HANDK.ready, kr) * U.clamp01(1 - Math.max(0, perp.dot(upC) - hint.dot(upC)) / 0.5);
      }
      const pdir = hint.clone().multiplyScalar(1 - k).addScaledVector(perp, k);
      pdir.addScaledVector(dir, -pdir.dot(dir));
      if (pdir.lengthSq() < 1e-8) pdir.set(0, -1, 0);
      pdir.normalize();
      const Wp = S.clone().addScaledVector(dir, d);
      const want = AKA.wristQuat(Q, SS, new THREE.Quaternion());
      const handAxis = new THREE.Vector3(side,0,0).applyQuaternion(want);
      /* v13: локоть не загоняет плечо/предплечье в корпус. Перебираем
         положения локтя на окружности решений (те же длины костей, та же
         кисть) от желаемого в обе стороны; берём ближайшее к желаемому без
         проникновения (или с наименьшим). Поворот сглаживается — без дрожи. */
      const T = torsoModel(this.char);
      let pen = 0, handPen = 0;
      if (T) {
        const _ = this._ac || (this._ac = { inv: new THREE.Matrix4(), t: new THREE.Vector3(), e: new THREE.Vector3(), p: new THREE.Vector3(), w: new THREE.Vector3(), u: new THREE.Vector3(), d: {} });
        _.inv.copy(this.bone('chest').matrixWorld).invert();
        const Cc2 = S.clone().addScaledVector(dir, cosA * lenA), rad = sinA * lenA;
        _.w.crossVectors(dir, pdir).normalize();
        /* у самого сустава плечо по анатомии сливается с корпусом (дельтовидная
           мышца) — эти точки не проверяем: локтем их не исправить, а поиск
           из-за них переставал различать положения */
        const penAt = (dl) => {
          const c = Math.cos(dl), sn = Math.sin(dl);
          _.e.copy(Cc2).addScaledVector(pdir, rad * c).addScaledVector(_.w, rad * sn);
          let m = 0;
          for (const t of [0.5, 0.7, 0.85, 1]) { _.p.copy(S).lerp(_.e, t); m = Math.max(m, torsoPen(T, _.inv, _.p, 0.048, _.t)); }
          for (const t of [0.25, 0.5, 0.75]) { _.p.copy(_.e).lerp(Wp, t); m = Math.max(m, torsoPen(T, _.inv, _.p, 0.04, _.t)); }
          return m;
        };
        const wrap=(x)=>Math.atan2(Math.sin(x),Math.cos(x));
        if(!this._elbowPole){this._elbowPole={};this._poleVelocity={};}
        const previous=this._elbowPole[SS];
        let d0=0;
        if(previous){
          _.u.copy(previous).applyQuaternion(chestQ);_.u.addScaledVector(dir,-_.u.dot(dir));
          if(_.u.lengthSq()>1e-8){_.u.normalize();d0=Math.atan2(_.u.dot(_.w),_.u.dot(pdir));}
        }
        const costAt=(angle)=>{
          const depth=penAt(angle);
          _.u.copy(Wp).sub(_.e).normalize();
          const bend=Math.acos(U.clamp(_.u.dot(handAxis),-1,1));
          return Math.max(0,depth-.0025)*600 + Math.max(0,bend-1.15)**2*4 + bend*.08 +
            Math.abs(wrap(angle-d0))*.08 + Math.abs(wrap(angle))*.04 +
            Math.max(0,_.e.y-Math.min(S.y-.08,Wp.y+.06))**2*70;
        };
        let best=d0,score=costAt(d0);
        if(!(typeof self!=='undefined'&&self.__noArmCol)&&!this.cheapArms){ // v20: дальний боец — без поиска по кругу
          // Search the complete elbow circle. The old +/-104-degree search
          // could miss the only clear forearm corridor while holding a rifle low.
          for(let i=0;i<40;i++){
            const angle=-Math.PI+i*Math.PI/20,value=costAt(angle);
            if(value<score){score=value;best=angle;}
          }
          for(const delta of [-.08,-.04,.04,.08]){const a=best+delta,value=costAt(a);if(value<score){score=value;best=a;}}
        }
        const dt=Math.min(.1,Math.max(1/240,this.poseDt||1/60));
        this._poleVelocity=this._poleVelocity||{};
        const delta=wrap(best-d0),improvement=costAt(d0)-costAt(best);
        if(Math.abs(delta)<.025||improvement<.003)best=d0;
        let velocity=this._poleVelocity[SS]||0;
        const goal=wrap(best-d0),steps=Math.ceil(dt*120),h=dt/steps;let travelled=0;
        for(let j=0;j<steps;j++){velocity+=(goal-travelled)*225*h-30*velocity*h;velocity=U.clamp(velocity,-5.5,5.5);travelled+=velocity*h;}
        this._poleVelocity[SS]=velocity;
        let nd=d0+travelled;
        // Collision correctness wins only when the rate-limited arc still clips.
        // Do not teleport the elbow to a different branch to fix one frame of
        // conservative vest-envelope overlap; follow the angular-rate limit.
        this._eD=this._eD||{};this._eD[SS]=nd;
        if(Math.abs(nd)>1e-6)pdir.multiplyScalar(Math.cos(nd)).addScaledVector(_.w,Math.sin(nd)).normalize();
        this._elbowPole[SS]=pdir.clone().applyQuaternion(chestQi);
        pen = (() => { _.e.copy(Cc2).addScaledVector(pdir, rad); let m = 0; for (const t of [0.5, 0.7, 0.85, 1]) { _.p.copy(S).lerp(_.e, t); m = Math.max(m, torsoPen(T, _.inv, _.p, 0.048, _.t)); } for (const t of [0.25, 0.5, 0.75]) { _.p.copy(_.e).lerp(Wp, t); m = Math.max(m, torsoPen(T, _.inv, _.p, 0.04, _.t)); } return m; })();
        handPen = torsoPen(T, _.inv, Wp, 0.035, _.t);
        /* отладка: отдельно плечо у сустава, середина плеча, предплечье */
        if (this.armProbe) {
          const pr = (a, b, ts, r) => { let m = 0; for (const t of ts) { _.p.copy(a).lerp(b, t); m = Math.max(m, torsoPen(T, _.inv, _.p, r, _.t)); } return m; };
          _.e.copy(Cc2).addScaledVector(pdir, rad);
          this.armProbe[SS] = { sh: pr(S, _.e, [0.3], 0.048), up: pr(S, _.e, [0.55, 0.8, 1], 0.048), fo: pr(_.e, Wp, [0.25, 0.5, 0.75], 0.04) };
        }
      }
      const E = S.clone().addScaledVector(dir, cosA * lenA).addScaledVector(pdir, sinA * lenA);
      const up = E.clone().sub(S).normalize();
      const fo = Wp.clone().sub(E).normalize();
      const hinge = new THREE.Vector3().crossVectors(pdir, dir).normalize().multiplyScalar(side);
      setWorldBasis(THREE, shoulder, up.clone().multiplyScalar(side), hinge);
      setWorldBasis(THREE, elbow, fo.clone().multiplyScalar(side), hinge);
      wrist.quaternion.copy(elbow.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want));
      wrist.updateMatrixWorld(true);
      const ft = this.bone('foreTwist' + SS), at = this.bone('armTwist' + SS);
      const X = new THREE.Vector3(1, 0, 0);
      if (ft) { ft.quaternion.setFromAxisAngle(X, U.clamp(twistX(wrist.quaternion), -1.75, 1.75)); ft.updateMatrixWorld(true); }
      if (at) { at.quaternion.setFromAxisAngle(X, -twistX(shoulder.quaternion)); at.updateMatrixWorld(true); }
      this.armDebug[SS] = { elbow: E, wrist: Wp, hint: pdir, pen, handPen };
      this.gripTarget[SS] = P.clone();
      if (this.handPoses && this.handPoses[SS]) {
        let hp=this.handPoses[SS];
        if(SS==='R'&&this.triggerPose&&self.GVM?.lerpPose){
          this._triggerHand=this._triggerHand||self.GVM.clonePose(hp);
          self.GVM.lerpPose(hp,this.triggerPose,U.clamp01(((this.triggerCurl||.08)-.08)/1),this._triggerHand);hp=this._triggerHand;
        }
        this.char.hands[SS].setPose(hp);
      }
    }
  };

  /* v25: точка правого запястья, держащего ремень («автомат на ремень»),
     в системе покоя бойца (x вправо, y вверх, −z вперёд) и поворот кисти */
  const STRAP_AT = [0.165, 1.225, -0.165];
  const STRAP_WRIST = [-0.25, 0.2, 0.55];
  /* AEGIS: руки «по швам» — без оружия. Плечо опущено вдоль корпуса,
     локоть чуть назад и в сторону, предплечье слегка вперёд, кисть
     расслаблена у бедра. k (0…1) — плавное смешивание с текущей позой
     (для покачивания при ходьбе), swing — мах руки при шаге (рад). */
  Rig.prototype.relaxArms = function (swing, sway, run = 0, motion = null) {
    const THREE = this.THREE;
    const rest = this.char.rest;
    const _ = this._rx || (this._rx = {
      rq: new THREE.Quaternion(), down: new THREE.Vector3(), fwd: new THREE.Vector3(), out: new THREE.Vector3(),
      S: new THREE.Vector3(), C: new THREE.Vector3(), dir: new THREE.Vector3(), pdir: new THREE.Vector3(),
      E: new THREE.Vector3(), W: new THREE.Vector3(), up: new THREE.Vector3(), fo: new THREE.Vector3(), hinge: new THREE.Vector3(),
      q: new THREE.Quaternion()
    });
    /* базис корпуса: вниз — по груди (наклон корпуса учитывается) */
    const chest = this.bone('chest');
    chest.getWorldQuaternion(_.rq);
    const rootQ = this.char.root.getWorldQuaternion(_.q);
    _.fwd.set(0, 0, -1).applyQuaternion(rootQ);
    _.down.set(0, -1, 0);
    chest.getWorldPosition(_.C);
    for (const side of [1, -1]) {
      const SS = side > 0 ? 'R' : 'L';
      const shoulder = this.bone('shoulder' + SS), elbow = this.bone('elbow' + SS), wrist = this.bone('wrist' + SS);
      if (!shoulder || !elbow || !wrist) continue;
      const clav = this.bone('clav' + SS);
      if (clav) { clav.rotation.z += side * 0.05; clav.updateMatrixWorld(true); }
      const dist3 = (a, b) => Math.hypot(rest[a][0] - rest[b][0], rest[a][1] - rest[b][1], rest[a][2] - rest[b][2]);
      const lenA = dist3('shoulder' + SS, 'elbow' + SS), lenB = dist3('elbow' + SS, 'wrist' + SS);
      shoulder.getWorldPosition(_.S);
      /* наружу — от центра груди к плечу, в горизонтали */
      _.out.copy(_.S).sub(_.C); _.out.y = 0;
      if (_.out.lengthSq() < 1e-8) _.out.set(side, 0, 0);
      _.out.normalize();
      const sw = (swing || 0) * side;
      /* плечо: вниз, чуть наружу (броня), мах вперёд-назад при шаге */
      _.up.copy(_.down).addScaledVector(_.out, 0.20).addScaledVector(_.fwd, 0.03 + sw * (0.55 + run * 0.25) + (sway || 0) * 0.02).normalize();
      const gait = motion?.gaitWeights && globalThis.GGaitData && globalThis.GAnimator;
      const blend = gait ? Math.min(1,motion.armBlend??motion.moveBlend??0) : 0;
      let armForward=0,elbowBend=0;
      if(blend>0){
        const p=((motion.phase+(side<0?.5:0))%1+1)%1;
        /* v21: та же доля опоры, что у ног и таза (gaitStance) — мах рук не расходится со стопами */
        armForward=gait.gaitSample('SF',p,motion.gaitWeights,false,motion.gaitStance);
        elbowBend=U.clamp(gait.gaitSample('EF',p,motion.gaitWeights,false,motion.gaitStance),.12,2.2);
        const abduction=U.clamp(gait.gaitSample('SA',p,motion.gaitWeights,false,motion.gaitStance),.07,.30);
        _.dir.copy(_.down).multiplyScalar(Math.cos(armForward)).addScaledVector(_.fwd,Math.sin(armForward)).addScaledVector(_.out,Math.sin(abduction)).normalize();
        _.up.lerp(_.dir,blend).normalize();
      }
      _.E.copy(_.S).addScaledVector(_.up, lenA);
      const strapK = side > 0 ? (this.strapK || 0) : 0;
      /* предплечье: вниз и немного вперёд, к бедру */
      _.fo.copy(_.down).addScaledVector(_.fwd, 0.22 + run * 0.95 + Math.max(-0.12, sw * 0.7)).addScaledVector(_.out, 0.05).normalize();
      if(blend>0){
        const angle=armForward+elbowBend;
        _.dir.copy(_.down).multiplyScalar(Math.cos(angle)).addScaledVector(_.fwd,Math.sin(angle)).addScaledVector(_.out,.06).normalize();
        _.fo.lerp(_.dir,blend).normalize();
      }
      /* v25: «автомат на ремень» — правая кисть держит ремень у груди
         (кисть в точке STRAP_AT системы покоя бойца, локоть вниз-назад).
         Двухзвенная IK; со свободной позой смешивается весом strapK. */
      if (strapK > 0.001) {
        const KS = this.char.scale || 1, rc = rest.chest, A = this.strapAt || STRAP_AT;
        const T = chest.localToWorld(_.W.set(A[0] * KS - rc[0], A[1] * KS - rc[1], A[2] * KS - rc[2]));
        const toT = _.dir.copy(T).sub(_.S);
        const d = U.clamp(toT.length(), Math.abs(lenA - lenB) + 1e-3, (lenA + lenB) * 0.999);
        toT.normalize();
        const cosA = U.clamp((lenA * lenA + d * d - lenB * lenB) / (2 * lenA * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
        _.pdir.set(0.45, -1, 0.55).applyQuaternion(_.rq);
        _.pdir.addScaledVector(toT, -_.pdir.dot(toT)).normalize();
        const E = _.hinge.copy(_.S).addScaledVector(toT, cosA * lenA).addScaledVector(_.pdir, sinA * lenA);
        const upS = E.clone().sub(_.S).normalize();
        const foS = _.S.clone().addScaledVector(toT, d).sub(E).normalize();
        _.up.lerp(upS, strapK).normalize(); _.fo.lerp(foS, strapK).normalize();
        _.E.copy(_.S).addScaledVector(_.up, lenA);
      }
      /* ось шарнира — перпендикуляр к плоскости сгиба */
      _.hinge.crossVectors(_.fo, _.up);
      if (_.hinge.lengthSq() < 1e-6) _.hinge.copy(_.out).cross(_.down);
      _.hinge.normalize();
      /* знак согласован с solveArmsGLB: hinge = cross(pdir, dir)·side,
         pdir (направление выноса локтя) — назад */
      _.pdir.copy(_.fwd).negate();
      _.dir.copy(_.fo).multiplyScalar(lenB).add(_.E).sub(_.S).normalize();
      _.hinge.crossVectors(_.pdir.addScaledVector(_.dir, -_.pdir.dot(_.dir)).normalize(), _.dir).multiplyScalar(side);
      /* v25: согнутая рука (ремень) — ось локтя строго поперёк обоих звеньев,
         иначе базис плеча не ортогонален и рукав «выворачивает» */
      if (strapK > 0.001) {
        const hx = _.W.crossVectors(_.up, _.fo);
        if (hx.lengthSq() > 4e-4) { hx.normalize().multiplyScalar(side); if (hx.dot(_.hinge) < 0) hx.negate(); _.hinge.copy(hx); }
        else _.hinge.addScaledVector(_.up, -_.hinge.dot(_.up)).normalize();
      }
      setWorldBasis(THREE, shoulder, _.up.clone().multiplyScalar(side), _.hinge);
      setWorldBasis(THREE, elbow, _.fo.clone().multiplyScalar(side), _.hinge);
      wrist.quaternion.identity();
      if (strapK > 0.001) {
        const WR = this.strapWrist || STRAP_WRIST;
        wrist.rotation.set(WR[0] * strapK, U.lerp(0.08, WR[1], strapK), U.lerp(0.1, WR[2], strapK));
      } else wrist.rotation.set(0, side * 0.08, side * 0.1);
      wrist.updateMatrixWorld(true);
      const ft = this.bone('foreTwist' + SS), at = this.bone('armTwist' + SS);
      if (ft) { ft.quaternion.identity(); ft.updateMatrixWorld(true); }
      if (at) { at.quaternion.identity(); at.updateMatrixWorld(true); }
      if (this.gripTarget) this.gripTarget[SS] = null;
      const H = this.char.hands && this.char.hands[SS];
      const RELAX = typeof self !== 'undefined' && self.GGrenades && self.GGrenades.HANDS ? self.GGrenades.HANDS.RELAX : null;
      const HOOK = strapK > 0.5 && self.GGrenades && self.GGrenades.HANDS ? self.GGrenades.HANDS.HOOK : null;
      if (H && (HOOK || RELAX)) H.setPose(HOOK || RELAX);
      else if (!this.char.hands) curlFingers(this, side, strapK > 0.5 ? 0.8 : 0.35);
    }
  };

  Rig.prototype.solveArms = function (weapon) {
    if (this.char.hands && this.handTargets) return this.solveArmsGLB();
    const THREE = this.THREE;
    const W = weapon;                       // Object3D оружия (система АК)
    W.updateMatrixWorld(true);
    const kr = this.readyAmount === undefined ? 1 : U.clamp01(this.readyAmount);
    const ka = U.clamp01(this.adsAmount || 0);
    const pose = mixArm(mixArm(ARM.sling, ARM.ready, kr), ARM.ads, ka);
    const wq = W.getWorldQuaternion(new THREE.Quaternion());
    const chestQ = this.bone('chest').getWorldQuaternion(new THREE.Quaternion());
    const chestQi = chestQ.clone().invert();
    const rest = this.char.rest;
    this.gripTarget = this.gripTarget || {};
    this.armDebug = this.armDebug || {};

    for (const side of [1, -1]) {
      const SS = side > 0 ? 'R' : 'L';
      const G = side > 0 ? GRIP.right : mixGrip(mixGrip(GRIP.leftSling, GRIP.left, kr), GRIP.leftAds, ka);
      const node = W.getObjectByName(G.node) || W;
      const target = node.getWorldPosition(new THREE.Vector3())
        .add(new THREE.Vector3(G.offset[0] * side, G.offset[1], G.offset[2]).applyQuaternion(wq));

      const clav = this.bone('clav' + SS), shoulder = this.bone('shoulder' + SS);
      const elbow = this.bone('elbow' + SS), wrist = this.bone('wrist' + SS);
      const dist3 = (a, b) => Math.hypot(rest[a][0] - rest[b][0], rest[a][1] - rest[b][1], rest[a][2] - rest[b][2]);
      const lenA = dist3('shoulder' + SS, 'elbow' + SS), lenB = dist3('elbow' + SS, 'wrist' + SS);

      /* Плечевой пояс работает вместе с рукой: кисть впереди — ключица
         выводит плечо вперёд, кисть высоко — поднимает его. Без этого рука
         вращается в «шарнире куклы», а дельта остаётся прилипшей к корпусу. */
      {
        const cp = clav.getWorldPosition(new THREE.Vector3());
        const d = target.clone().sub(cp).applyQuaternion(chestQi).normalize();
        const prot = U.clamp(Math.max(0, -d.z) * pose.clav[0], 0, 0.26);
        const elev = U.clamp(d.y * pose.clav[1] + 0.02, -0.08, 0.12);
        clav.rotation.y += side * prot;
        clav.rotation.z += side * elev;
        clav.updateMatrixWorld(true);
      }
      const S = shoulder.getWorldPosition(new THREE.Vector3());

      /* Опорная кисть — не гвоздь на цевье: если до точки не дотянуться
         с согнутым локтем, кисть скользит назад, к магазину. В прицеле ход
         короткий (0,085 м — дальше кисть закрыла бы мушку), на ремне и от
         бедра длиннее. */
      if (side < 0) {
        const comfort = (lenA + lenB) * pose.reach;
        const back = new THREE.Vector3(0, 0, 1).applyQuaternion(wq);
        const MAX_SLIDE = U.lerp(0.20, 0.085, ka);
        let slide = 0;
        while (slide < MAX_SLIDE && S.distanceTo(target) > comfort) {
          target.addScaledVector(back, 0.01);
          slide += 0.01;
        }
      }
      /* фактическая точка хвата — её и проверяет gripCheck */
      this.gripTarget[SS] = target.clone();

      /* --- двухзвенная IK с явной осью локтевого шарнира ---
         Кости ставятся базисом, а не «кратчайшим поворотом» от прошлого
         кадра: иначе скрутка плеча и предплечья копилась от кадра к кадру,
         локоть гнулся не в своей плоскости и рукав перекручивался.
         Локальный X кости — вдоль неё (у левой руки — к плечу), Y — ось
         сгиба локтя (в T-позе вертикаль). */
      const toT = target.clone().sub(S);
      const d = U.clamp(toT.length(), Math.abs(lenA - lenB) + 1e-3, (lenA + lenB) * 0.999);
      const dir = toT.normalize();
      const L = pose[SS];
      const hint = new THREE.Vector3(L[0] * side, L[1], L[2]).applyQuaternion(chestQ);
      const pdir = hint.addScaledVector(dir, -hint.dot(dir));
      if (pdir.lengthSq() < 1e-8) pdir.set(0, -1, 0).applyQuaternion(chestQ).addScaledVector(dir, -dir.y);
      pdir.normalize();
      const cosA = U.clamp((lenA * lenA + d * d - lenB * lenB) / (2 * lenA * d), -1, 1);
      const sinA = Math.sqrt(1 - cosA * cosA);
      const E = S.clone().addScaledVector(dir, cosA * lenA).addScaledVector(pdir, sinA * lenA);
      const Wp = S.clone().addScaledVector(dir, d);
      const up = E.clone().sub(S).normalize();
      const fo = Wp.clone().sub(E).normalize();
      const hinge = new THREE.Vector3().crossVectors(pdir, dir).normalize().multiplyScalar(side);
      setWorldBasis(THREE, shoulder, up.clone().multiplyScalar(side), hinge);
      setWorldBasis(THREE, elbow, fo.clone().multiplyScalar(side), hinge);

      /* ориентация кисти: пальцы вдоль fingerDir оружия, Y — от ладони */
      const ex = new THREE.Vector3(G.fingerDir[0] * side, G.fingerDir[1], G.fingerDir[2]).normalize().applyQuaternion(wq);
      const ey = new THREE.Vector3(G.palmDir[0] * side, G.palmDir[1], G.palmDir[2]).normalize().applyQuaternion(wq);
      ey.addScaledVector(ex, -ey.dot(ex));
      if (ey.lengthSq() < 1e-8) ey.set(0, 1, 0);
      ey.normalize();
      const ez = new THREE.Vector3().crossVectors(ex, ey);
      const want = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(ex.multiplyScalar(side), ey, ez.multiplyScalar(side)));
      wrist.quaternion.copy(elbow.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want));
      wrist.updateMatrixWorld(true);

      /* Скрутка распределяется, как у лучевой и локтевой костей: пронация
         кисти переходит в предплечье по всей его длине (кость foreTwist,
         веса растут от локтя к запястью), а у дельты плечо остаётся без
         скрутки (armTwist её гасит) — рукав не перекручивается «фантиком». */
      const ft = this.bone('foreTwist' + SS), at = this.bone('armTwist' + SS);
      const X = new THREE.Vector3(1, 0, 0);
      if (ft) {
        const tw = U.clamp(twistX(wrist.quaternion), -1.75, 1.75);
        ft.quaternion.setFromAxisAngle(X, tw);
        ft.updateMatrixWorld(true);
      }
      if (at) {
        at.quaternion.setFromAxisAngle(X, -twistX(shoulder.quaternion));
        at.updateMatrixWorld(true);
      }
      this.armDebug[SS] = { elbow: E, wrist: Wp, hint: pdir };

      /* пальцы обхватывают (запасной путь без кистей GLB) */
      const trig = side > 0 ? this.triggerCurl : undefined;
      this.thumbAmount = G.thumb;
      this.thumbBase = G.thumbBase || [0.55, 0.30];
      curlFingers(this, side, G.curl, trig);
    }
  };

  /* ================================================== опора стоп ======== */
  /* Шаговый цикл задаёт ноги прямой кинематикой от таза, высота которого
     живёт своей жизнью (присед, покачивание). Длина ноги при этом меняется
     со сгибом колена, и подошва сама по себе на землю не попадает: на шаге
     даже опорная стопа висела над землёй до 7 см (на бегу до 13), а в
     приседе нога уходила в грунт на 15 см.

     Поэтому после позы стопы досаживаются на землю аналитической IK
     «бедро — колено — голеностоп»: опорная нога дотягивается вниз до грунта,
     любая нога, ушедшая под землю, поднимается. Если выпрямленной опорной
     ноге не хватает длины, таз проседает на недостающее (не больше 10 см).
     Камера и оружие считаются от контроллера, а не от таза, поэтому их это
     не сдвигает. Ориентация стопы остаётся такой, какой её задал шаговый
     цикл.

     plant: { R, L } — насколько нога опорная (0 — перенос, 1 — стоит). */
  const _pv = {};
  function pv(THREE, k) { return (_pv[k] || (_pv[k] = new THREE.Vector3())); }

  Rig.prototype.plantFeet = function (groundAt, plant) {
    const THREE = this.THREE;
    const root = this.char.root;
    root.updateMatrixWorld(true);
    const fwd = pv(THREE, 'fwd').set(0, 0, -1).applyQuaternion(root.getWorldQuaternion(tmpQ(THREE, 'root')));
    const wOf = (SS) => U.clamp01(plant && plant[SS] !== undefined ? plant[SS] : 1);
    let out = this._plantPass(groundAt, wOf, fwd);
    /* Опорная нога выпрямлена, а до земли не достала: таз стоит выше, чем
       позволяет длина ноги (пик покачивания на шаге). Как и у человека,
       таз проседает на недостающее расстояние, и ноги решаются заново. */
    const drop = Math.min(0.10, Math.max(0, out.R * wOf('R'), out.L * wOf('L')));
    if (drop > 1e-3) {
      const hips = this.bone('hips');
      hips.position.y -= drop;
      hips.updateMatrixWorld(true);
      out = this._plantPass(groundAt, wOf, fwd);
    }
    /* остаточный зазор и просадка таза — для автотестов */
    this.footGap = out;
    this.hipDrop = drop;
    return out;
  };

  Rig.prototype._plantPass = function (groundAt, wOf, fwd) {
    const THREE = this.THREE, M = this.metrics, rest = this.char.rest;
    const out = {};
    for (const SS of ['R', 'L']) {
      const hip = this.bone('hip' + SS), knee = this.bone('knee' + SS);
      const ankle = this.bone('ankle' + SS), toe = this.bone('toe' + SS);
      /* Точки подошвы в системах костей. Кости в покое не повёрнуты, поэтому
         локальные смещения равны мировым: пятка под голеностопом, подушечка
         и носок под костью пальцев. Пропорции сняты с подошвы ботинка. */
      const aY = rest['ankle' + SS][1], tY = rest['toe' + SS][1];
      const pts = [
        [ankle, 0, -aY, M.foot * 0.31],
        [toe, 0, -tY, 0],
        [toe, 0, -tY, -M.foot * 0.32]
      ];
      const lowest = () => {
        let h = Infinity;
        for (const q of pts) {
          const w = q[0].localToWorld(pv(THREE, 'p').set(q[1], q[2], q[3]));
          h = Math.min(h, w.y - groundAt(w.x, w.z));
        }
        return h;
      };
      const h = lowest();
      const w = wOf(SS);
      /* под землю — всегда наверх; над землёй — вниз с весом опоры */
      const dy = h < 0 ? -h : -h * w;
      if (Math.abs(dy) < 5e-4) { out[SS] = h; continue; }

      const footQ = ankle.getWorldQuaternion(new THREE.Quaternion());
      const target = ankle.getWorldPosition(new THREE.Vector3());
      target.y += dy;
      /* колено смотрит вперёд по корпусу */
      const pole = knee.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 0.6);
      twoBoneIK(THREE, {
        root: hip, mid: knee, tip: ankle, target, pole,
        axis: pv(THREE, 'down').set(0, -1, 0)
      });
      const kq = knee.getWorldQuaternion(new THREE.Quaternion());
      ankle.quaternion.copy(kq.invert().multiply(footQ));
      ankle.updateMatrixWorld(true);
      out[SS] = lowest();
    }
    return out;
  };

  return { Rig, twoBoneIK, alignBone, curlFingers, applyBasePose, GRIP, ARM };
});