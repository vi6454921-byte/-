/* ==========================================================================
   AEGIS · оружие полигона.

   Модели — из оружейной (js/kit/wkit.js, AEGIS_WK): ровно та сборка, которую
   игрок настроил на экране «Оружие» для своего генерала. Модуль ставит её в
   систему рига рук (viewmodel/vm.js): начало — ось канала у заднего среза
   коробки, −Z к дулу, метры. Рукоятка каждого образца совмещена с рукояткой,
   под которую настроен хват правой кисти (с поправкой на её наклон), цевьё —
   с опорной кистью; прицельная линия даёт позу «в прицеле».

   Здесь же:
   • спеки рига по семействам: АК (рукоятка затвора), AR (затворная задержка),
     HK (рукоять в вырез и удар ладонью), помпа (патроны по одному в трубку,
     цевьё под левой кистью), пистолет (хват двумя руками, затворная задержка);
   • перенос состояния рига на настоящую модель: затворная рама, спуск,
     цевьё, рукоять HK, рукоятка заряжания AR, магазин в руке;
   • патроны по калибрам (тип патрона — клавиша N) и прицелы (коллиматоры и
     оптика: сетка поверх кадра, у оптики — поле зрения по кратности).
   ========================================================================== */
(function (root, factory) {
  const G = factory(root.THREE, root.GVM, root.AEGIS_WK);
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  else root.GGuns = G;
})(typeof self !== 'undefined' ? self : this, function (THREE, VM, WK) {
  'use strict';
  if (!THREE || !VM || !WK) return null;
  const { gripMatrix, pose: P, translate, magInHand, pouch, LEFT_OPEN, CONFIG } = VM;
  const DEG = Math.PI / 180, S = 0.001;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ------------------------------------------------- опорные хваты -- */
  /* G0 — точка хвата правой кисти (перепонка между большим и указательным
     на оси рукоятки) в системе рига; под неё настроены позы рига. */
  const G0 = V3(0, -0.0495, -0.005);
  const RGRIP0 = gripMatrix([0.028, -0.0775, 0.062], [0, -0.342, -0.94], [1, 0, 0]);
  const LGRIP0 = new THREE.Matrix4().makeRotationZ(-50 * DEG)
    .multiply(gripMatrix([-0.039 * 0.9, -0.057 * 0.9, -0.250], [0.72, 0.12, -0.68], [0.087, -0.992, -0.083]));

  /* ------------------------------------------------------ патроны -- */
  /* pen — пробивная способность (условные классы ГОСТ 34286, как в
     game/damage.js), dmg — множитель раневого действия, vK — доля штатной
     дульной скорости, pellets — картечины в патроне, spread — разлёт
     снопа (рад). */
  const AMMO = {
    '545': [
      { id: '7N6', name: 'ПС 7Н6', pen: 3.0, dmg: 1.0 },
      { id: '7N10', name: 'ПП 7Н10', pen: 3.75, dmg: 1.0 },
      { id: '7N24', name: 'БС 7Н24', pen: 5.1, dmg: 0.95, vK: 0.96 }
    ],
    '762x39': [
      { id: '57N231', name: 'ПС 57-Н-231', pen: 3.3, dmg: 1.2 },
      { id: '7N23', name: 'БП 7Н23', pen: 4.6, dmg: 1.15 },
      { id: '57N231U', name: 'УС 57-Н-231У', pen: 2.1, dmg: 1.1, vK: 0.43 }
    ],
    '556': [
      { id: 'M855', name: 'M855', pen: 3.6, dmg: 1.0 },
      { id: 'M855A1', name: 'M855A1', pen: 4.4, dmg: 1.05, vK: 1.02 },
      { id: 'M995', name: 'M995 (бронебойный)', pen: 5.4, dmg: 0.92, vK: 1.06 }
    ],
    '762x51': [
      { id: 'M80', name: 'M80', pen: 4.1, dmg: 1.4 },
      { id: 'M80A1', name: 'M80A1', pen: 4.9, dmg: 1.42, vK: 1.03 },
      { id: 'M993', name: 'M993 (бронебойный)', pen: 6.1, dmg: 1.3, vK: 1.07 }
    ],
    '762x54R': [
      { id: '7N1', name: 'Снайперский 7Н1', pen: 4.3, dmg: 1.45 },
      { id: '57N323S', name: 'ЛПС 57-Н-323С', pen: 4.1, dmg: 1.4, vK: 1.02 },
      { id: '7N14', name: 'Снайперский 7Н14', pen: 5.4, dmg: 1.42 }
    ],
    '45acp': [
      { id: '45FMJ', name: '.45 ACP FMJ 230 gr', pen: 1.3, dmg: 0.95 },
      { id: '45JHP', name: '.45 ACP JHP 230 gr', pen: 0.65, dmg: 1.18 }
    ],
    '9x19': [
      { id: '57N181S', name: 'Пст 57-Н-181С', pen: 1.6, dmg: 0.6 },
      { id: '7N21', name: '7Н21 (бронебойный)', pen: 2.8, dmg: 0.62, vK: 1.1 },
      { id: 'JHP', name: 'Экспансивный JHP', pen: 0.8, dmg: 0.78 }
    ],
    '12ga': [
      { id: 'buck00', name: 'Картечь 00 (9 картечин)', pen: 0.9, dmg: 0.34, pellets: 9, spread: 0.022, shell: 'buck00' },
      { id: 'shot4', name: 'Картечь №4 (27 картечин)', pen: 0.55, dmg: 0.15, pellets: 27, spread: 0.03, shell: 'shot4' },
      { id: 'slug', name: 'Пуля Бреннеке', pen: 2.5, dmg: 1.9, shell: 'slug' }
    ]
  };

  /* ------------------------------------------- образцы (мм движка) -- */
  /* grip — перепонка кисти на оси рукоятки [x, y], rake — наклон рукоятки
     от вертикали (°); hg — опорная кисть: x запястья вдоль ствола, y оси
     цевья, r — его полуширина; reload — [с патроном в патроннике, с
     пустым], с; magHold — где левая кисть держит магазин (м от горловины). */
  const WP = {
    ak74: { fam: 'ak', grip: [-173, -27], rake: 16, hg: { x: 118, y: 4, r: 23 }, reload: [2.4, 3.0], magHold: 0.10, boltHold: false, recoil: 0.95 },
    akm: { fam: 'ak', grip: [-173, -27], rake: 16, hg: { x: 118, y: 4, r: 24 }, reload: [2.45, 3.05], magHold: 0.10, boltHold: false, recoil: 1.25 },
    m416: { fam: 'ar', grip: [-136, -41], rake: 20, hg: { x: 92, y: 0, r: 31 }, reload: [2.25, 2.75], magHold: 0.10, boltHold: true, recoil: 0.85 },
    scar: { fam: 'ar', grip: [-151, -48], rake: 20, hg: { x: 96, y: -9, r: 33 }, reload: [2.45, 2.95], magHold: 0.09, boltHold: true, recoil: 1.45 },
    svd: { fam: 'ak', grip: [-258, -30], rake: 17, hg: { x: 172, y: 5, r: 26 }, reload: [2.7, 3.3], magHold: 0.075, boltHold: true, recoil: 1.6 },
    m870: { fam: 'pump', grip: [-198, -36], rake: 46, hg: { x: 40, y: -30, r: 20 }, shell: 0.62, pumpTime: 0.5, boltHold: false, recoil: 2.1 },
    mp5a3: { fam: 'hk', grip: [-205, -30], rake: 14, hg: { x: 52, y: -2, r: 20 }, reload: [2.3, 3.1], magHold: 0.10, boltHold: false, recoil: 0.55 },
    ar15m4: { fam: 'ar', grip: [-85, -28], rake: 22, hg: { x: 150, y: -3, r: 22 }, reload: [2.25, 2.75], magHold: 0.10, boltHold: true, recoil: 0.9, contactProfile: 'm416' },
    glock21: { fam: 'pistol', grip: [-39, -28], rake: 22, reload: [1.7, 2.15], magHold: 0.06, boltHold: true, recoil: 1.0, contactProfile: 'glock18c' },
    glock18c: { fam: 'pistol', grip: [-74, -30], rake: 22, reload: [1.6, 2.05], magHold: 0.06, boltHold: true, recoil: 0.7 }
  };
  const NAMES = { ar15m4: 'AR-15 / M4', glock21: 'Glock 21 Gen4', ak74: 'АК-74М', akm: 'АКМ', m416: 'HK416 (M416)', scar: 'FN SCAR-H', svd: 'СВД', m870: 'Remington 870', mp5a3: 'HK MP5A3', glock18c: 'Glock 18C' };

  /* общий набор материалов для всех экземпляров (меньше программ шейдеров) */
  let CTX = null;
  /* v21: заставка уже собрала этот набор материалов для витрины — берём его */
  const ctx = () => CTX || (CTX = WK.introCtx || WK.makeCtx(WK.createMaterials(null)));

  /* ------------------------------------------------------- прицелы -- */
  function computeSights(asm) {
    const base = asm.base, root = asm.root, list = [], prefs = retPrefs();
    root.updateMatrixWorld(true);
    const m = new THREE.Matrix4();
    const push = (id, label, obj, s, rkey) => {
      m.copy(WK.toRoot(s.node || obj, root));
      const eye = V3(s.x0 ?? 0, s.y, s.z || 0).applyMatrix4(m);
      const dir = V3(1, 0, 0).transformDirection(m);
      const up = V3(0, 1, 0).transformDirection(m);
      list.push({ id, label, eye, dir, up, mag: s.mag || 1, zoom: s.zoom, reticle: s.reticle, eyeRelief: s.eyeRelief, rkey, lens: s.lens || null,
        own: s.node || (/:alt/.test(id) ? null : obj), r: s.r || 10, x0: s.x0 ?? 0, x1: s.x1 ?? 0 });
    };
    /* Все прицельные оси, как в оружейной: основной прицел, его дополнительные оси
       (коллиматор поверх оптики), боковые / наклонные прицелы и их оси. Переключение — клавишей
       «Сменить прицел» (по умолчанию — колесо мыши). */
    const opt = asm.installed.get('optic');
    const pushAlt = (it) => { for (const [i, a] of (it.info && it.info.alt || []).entries()) push(it.slot.id + ':alt' + i, a.label ? it.part.name + ' — ' + a.label : it.part.name + ' — коллиматор', it.obj, a, it.part.id + ':alt' + i); };
    if (opt && opt.info && opt.info.sight) push('optic', opt.part.name, opt.obj, opt.info.sight, opt.part.id);
    if (opt) pushAlt(opt);
    for (const it of asm.installed.values()) if (it !== opt && it.info) pushAlt(it);
    for (const it of asm.installed.values()) {
      if (it === opt || !it.info) continue;
      if (it.info.sight && !it.info.sight.magnifier) push(it.slot.id, it.part.name, it.obj, it.info.sight, it.part.id);
    }
    /* v26: увеличитель 3× / ПНВ за коллиматором — своя прицельная ось (как в оружейной).
       Стоит первым: модель собрана с увеличителем на линии прицеливания. «Сменить прицел»
       (колесо) откидывает его вбок с анимацией и переводит на коллиматор, круг по осям
       возвращает обратно (flipMagnifier). Сетка и цвет — от коллиматора (общий rkey). */
    const mg = asm.installed.get('magnifier');
    if (mg && mg.info && mg.info.sight && list[0] && list[0].id === 'optic' && (list[0].mag || 1) <= 1.01) {
      const ms = mg.info.sight;
      m.copy(WK.toRoot(mg.obj, root));
      const eye = V3(ms.x0 ?? 0, ms.y, ms.z || 0).applyMatrix4(m);
      list.unshift(Object.assign({}, list[0], {
        id: 'magnifier', label: list[0].label + (ms.suffix || ' + увеличитель'), eye, mag: ms.mag || 1, zoom: null,
        eyeRelief: ms.eyeRelief, nv: !!ms.nv, magnifier: true, lens: null, own: mg.obj, r: ms.r || 12,
        x0: ms.x0 ?? 0, x1: ms.x1 ?? 0, baseId: 'optic'
      }));
    }
    let rear = null, front = null, rearIt = null;
    for (const it of asm.installed.values()) {
      const ir = it.info && it.info.irons;
      if (!ir) continue;
      const M = WK.toRoot(it.obj, root);
      if (!rear && ir.rear) { rear = V3(...ir.rear).applyMatrix4(M); rearIt = it; }
      if (!front && ir.front) front = V3(...ir.front).applyMatrix4(M);
    }
    if (base.irons && base.irons.rear && !rear) rear = V3(...base.irons.rear);
    if (base.irons && base.irons.front && !front) front = V3(...base.irons.front);
    if (rear && !front) front = rear.clone().add(V3(400, 0, 0));
    if (!list.length && rear && front) {
      const type = rearIt ? rearIt.info.irons.type || 'aperture' : (base.irons && base.irons.type) || 'notch';
      const eyeDist = rearIt ? rearIt.info.irons.eye : base.irons && base.irons.eye;
      list.push({ id: 'irons', label: 'Механический прицел', eye: rear, dir: front.clone().sub(rear).normalize(), up: V3(0, 1, 0), mag: 1, irons: true, type, eyeDist });
    }
    if (!list.length) list.push({ id: 'bore', label: 'По стволу', eye: V3((base.eyeX ?? -240) + 220, 40, 0), dir: V3(1, 0, 0), up: V3(0, 1, 0), mag: 1, irons: true, type: 'notch' });
    /* точка глаза — как sightPose движка; у пистолета руки вытянуты (изосцелес): глаз в ~52 см от целика, как у реального стрелка с почти прямыми руками */
    const pistolEye = !!(asm.def && asm.def.id && WP[asm.def.id] && WP[asm.def.id].fam === 'pistol');
    for (const s of list) {
      let ex = base.eyeX ?? -240;
      if (pistolEye && s.irons) ex = s.eye.x - 520;
      else if (pistolEye) ex = s.eye.x - Math.max(500, s.eyeRelief || 0);
      else if (s.eyeRelief) ex = s.eye.x - s.eyeRelief;
      else if (s.irons) ex = s.type === 'aperture' ? s.eye.x - (s.eyeDist ?? 75) : Math.min(ex, s.eye.x - 220);
      else ex = Math.min(ex, s.eye.x - 60);
      const t = (ex - s.eye.x) / (s.dir.x || 1);
      s.eyeE = s.eye.clone().addScaledVector(s.dir, t);
      if (s.reticle) {
        /* v26: выбранные в оружейной сетка и цвет (общий ключ «gunsmith:reticle») */
        const set = WK.reticleSet(s.reticle), pr = prefs[s.rkey || s.id] || {};
        s.retSet = set;
        s.retId = set.includes(pr.id) ? pr.id : set[0];
        s.retColor = pr.color || (WK.RET_DEFAULT_COLOR && WK.RET_DEFAULT_COLOR[s.reticle]) || 'red';
        s.retOwn = !!pr.color;
      }
    }
    return list;
  }

  /* ------------------------------------------- v26: сетка, цвет, увеличитель -- */
  const RET_LS = 'gunsmith:reticle';
  function retPrefs() { try { return JSON.parse(localStorage.getItem(RET_LS) || '{}') || {}; } catch (e) { return {}; } }
  function retSave(key, v) {
    const all = retPrefs();
    all[key] = Object.assign({}, all[key], v);
    try { localStorage.setItem(RET_LS, JSON.stringify(all)); } catch (e) { /* приватный режим */ }
  }
  /* цвет марки: дальтонизм > выбор игрока для этого прицела (клавиша / оружейная) > общий цвет из настроек > штатный */
  function retColorOf(sg) {
    const set = globalThis.AEGIS_SETTINGS || {};
    if (set.colorblind && set.colorblind !== 'off') return set.colorblind === 'tritan' ? 'red' : 'blue';
    if (sg && sg.retOwn && sg.retColor) return sg.retColor;
    return (set.reticleColor && set.reticleColor !== 'red' ? set.reticleColor : null) || (sg && sg.retColor) || 'red';
  }
  /* прицел с сеткой для текущей оси (увеличитель — сетка коллиматора) */
  function retSight(w) {
    const sg = w && w.sight;
    if (!sg || !sg.reticle) return null;
    return sg;
  }
  function sameRet(w, sg) { return w.sights.filter((s) => s.reticle && (s.rkey || s.id) === (sg.rkey || sg.id)); }
  /* следующая сетка набора (точка → крест → кольцо…); возвращает подпись для подсказки */
  function cycleReticle(w) {
    const sg = retSight(w);
    if (!sg) return null;
    const set = sg.retSet || WK.reticleSet(sg.reticle);
    if (set.length < 2) return { one: true, name: (WK.RETICLES[sg.retId] || {}).name || sg.retId };
    const id = set[(set.indexOf(sg.retId) + 1) % set.length];
    for (const s of sameRet(w, sg)) s.retId = id;
    retSave(sg.rkey || sg.id, { id });
    return { id, name: (WK.RETICLES[id] || {}).name || id, i: set.indexOf(id) + 1, n: set.length };
  }
  function cycleReticleColor(w) {
    const sg = retSight(w);
    if (!sg || !WK.RET_COLORS) return null;
    const L = WK.RET_COLORS, cur = retColorOf(sg);
    const c = L[(Math.max(0, L.findIndex((q) => q.id === cur)) + 1) % L.length];
    for (const s of sameRet(w, sg)) { s.retColor = c.id; s.retOwn = true; }
    retSave(sg.rkey || sg.id, { id: sg.retId, color: c.id });
    return { id: c.id, name: c.name };
  }
  /* увеличитель: aside — откинут вбок. Узел откидного кронштейна поворачивается за ~0,25 с */
  function magInfo(w) {
    const it = w && w.asm && w.asm.installed.get('magnifier');
    return it && it.info && it.info.flipAside ? it.info.flipAside : null;
  }
  function flipMagnifier(w, aside, instant) {
    const fa = magInfo(w);
    if (!fa || !fa.node) return false;
    const F = w.mgFlip || (w.mgFlip = { aside: false, a: fa.node.rotation.x, from: 0, t: 1 });
    aside = aside === undefined ? !F.aside : !!aside;
    if (aside === F.aside && !instant) return false;
    F.aside = aside;
    F.from = fa.node.rotation.x; F.to = aside ? fa.angle * Math.PI / 180 : 0; F.t = instant ? 1 : 0;
    if (instant) { fa.node.rotation.x = F.to; fa.node.updateMatrixWorld(true); }
    return true;
  }
  function tickFlip(w, dt) {
    const F = w && w.mgFlip, fa = F && magInfo(w);
    if (!fa || F.t >= 1) return;
    F.t = Math.min(1, F.t + dt / 0.26);
    /* быстрый рывок рукой и мягкий упор кронштейна (лёгкий перелёт ~4%) */
    const k = F.t, e = k < 1 ? 1 - Math.pow(1 - k, 3) * (1 - 1.6 * k * (1 - k)) : 1;
    fa.node.rotation.x = F.from + (F.to - F.from) * e;
    fa.node.updateMatrixWorld(true);
  }
  /* шаг «Сменить прицел»: магнифер 3× → откинуть → коллиматор → остальные оси → вернуть увеличитель */
  function nextSight(w) {
    const n = w.sights.length;
    if (n < 2) return null;
    const cur = w.sights[w.sightIdx || 0];
    const idx = ((w.sightIdx || 0) + 1) % n, nx = w.sights[idx];
    let flip = null;
    if (nx.magnifier) { if (flipMagnifier(w, false)) flip = 'back'; }
    else if ((cur && cur.magnifier) || nx.id === 'optic') { if (flipMagnifier(w, true)) flip = 'aside'; }
    setSight(w, idx);
    return { sight: nx, flip };
  }
  function toggleMagnifier(w) {
    const mi = w.sights.findIndex((s) => s.magnifier);
    if (mi < 0) return null;
    const cur = w.sights[w.sightIdx || 0];
    if (cur && cur.magnifier) {
      flipMagnifier(w, true);
      const oi = w.sights.findIndex((s) => s.id === 'optic');
      setSight(w, oi >= 0 ? oi : 0);
      return { sight: w.sight, flip: 'aside' };
    }
    flipMagnifier(w, false);
    setSight(w, mi);
    return { sight: w.sight, flip: 'back' };
  }

  /* ближайшая к глазу видимая деталь оружия для оси прицела (м, система рига) */
  function clearNear(sg, root, HM) {
    const e = sg.eyeG, f = sg.dirG, u = sg.upG, r = new THREE.Vector3().crossVectors(f, u).normalize();
    const own = new Set();
    if (sg.own) sg.own.traverse((o) => own.add(o));
    const tubeR = (sg.r + 9) * S, tubeL = sg.eyeE.distanceTo(sg.eye) * S + (Math.abs(sg.x1 - sg.x0) + 12) * S;
    const M = new THREE.Matrix4(), v = new THREE.Vector3(), d = new THREE.Vector3();
    let best = Infinity;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || own.has(o) || o.userData.reticle || o.userData.wcover) return;
      for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return;
      const pos = o.geometry.attributes.position;
      if (!pos) return;
      M.multiplyMatrices(HM, WK.toRoot(o, root));
      const step = pos.count > 30000 ? 3 : 1;
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(M);
        d.subVectors(v, e);
        const z = d.dot(f);
        if (z <= 0.004 || z >= best || z > 0.14) continue;
        const x = d.dot(r), y = d.dot(u);
        if (Math.abs(x) > z * 0.82 + 0.008 || Math.abs(y) > z * 0.46 + 0.008) continue;
        if (Math.hypot(x, y) < tubeR && z < tubeL) continue;
        best = z;
      }
    });
    if (best < Infinity) sg.adsNear = Math.max(0.025, Math.min(sg.adsNear, best - 0.008));
    return sg.adsNear;
  }

  /* ---------------------------------------------------------- сборка -- */
  function nodeBox(obj, root) {
    const b = new THREE.Box3(), v = new THREE.Vector3();
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    obj.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      o.geometry.computeBoundingBox && !o.geometry.boundingBox && o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      if (!bb) return;
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(m);
        b.expandByPoint(v);
      }
    });
    return b;
  }

  /* id — образец, cfg — конфигурация оружейной ({слот: модуль}). */
  function build(id, cfg, opt) {
    opt = opt || {};
    const def = WK.DEFS[id];
    if (!def) throw new Error('нет образца ' + id);
    const wp = WP[id];
    const asm = new WK.Assembler(def, WK.LIB, ctx());
    let applied;
    try { applied = asm.apply(Object.assign({}, def.defaults, cfg || {})); }
    catch (e) { console.warn('cfg ' + id, e); applied = asm.apply(def.defaults); }
    /* v26: складные целик/мушка (HK, MBUS, SCAR) при установленном прицеле лежат, как в оружейной.
       Раньше в бою поднятый диоптр стоял между глазом и коллиматором и заслонял марку */
    try {
      const hasOptic = !!(asm.info('optic') && asm.info('optic').sight);
      for (const it of asm.installed.values()) {
        const f2 = it.info && it.info.flip;
        if (f2 && f2.node) f2.node.rotation.z = hasOptic ? f2.angle * Math.PI / 180 : 0;
      }
    } catch (e) { /* без складной механики */ }
    /* v25: окраска из оружейной (js/kit/skins.js) */
    const skin = cfg && typeof cfg.skin === 'string' ? cfg.skin : null;
    const GL = typeof self !== 'undefined' ? self : globalThis;
    const SKN = GL.GSkins;
    /* v26: + окраска отдельных модулей (cfg.skinMods) */
    const skinMods = SKN && SKN.normMods ? SKN.normMods(cfg && cfg.skinMods) : null;
    if ((skin || skinMods) && SKN) { try { SKN.apply(asm.root, id, skin || 'factory', ctx().mats, skinMods); if (skin) applied.skin = skin; if (skinMods) applied.skinMods = skinMods; } catch (e) { console.warn('skin ' + id, e); } }
    /* v26: маскировочная сеть / «кикимора» на цевье и прикладе (js/kit/wcover.js) */
    const WC = GL.GWCover;
    if (WC && cfg && cfg.wrap && WC.supports(id)) { try { if (WC.apply(asm, id, cfg.wrap)) applied.wrap = WC.norm(cfg.wrap); } catch (e) { console.warn('wcover ' + id, e); } }
    const base = asm.base;
    /* сетки коллиматоров рисует оверлей (game: прицел), линзы оставляем */
    asm.root.traverse((o) => {
      if (o.userData.reticle) o.visible = false;
      if (o.isMesh) { o.castShadow = !opt.noShadow && !o.userData.wcover; o.receiveShadow = false; o.frustumCulled = true; }
    });
    const oy = G0.y - wp.grip[1] * S, oz = G0.z + wp.grip[0] * S;
    const holder = new THREE.Group();
    holder.name = 'kitHolder';
    holder.rotation.y = Math.PI / 2;
    holder.scale.setScalar(S);
    holder.position.set(0, oy, oz);
    holder.add(asm.root);
    const gun = new THREE.Group();
    gun.name = 'gun_' + id;
    gun.add(holder);
    const mount = new THREE.Group(); mount.name = 'weaponMount';
    const recoilRig = new THREE.Group(), tiltRig = new THREE.Group();
    mount.add(recoilRig); recoilRig.add(tiltRig); tiltRig.add(gun);
    gun.updateMatrixWorld(true);
    holder.updateMatrix();
    const HM = holder.matrix.clone();
    const e2g = (x, y, z) => V3(x, y, z).applyMatrix4(HM);           // мм движка -> система рига
    const toG = (obj) => new THREE.Matrix4().multiplyMatrices(HM, WK.toRoot(obj, asm.root));
    /* дульный срез с учётом ДТК/глушителя */
    let muzzleE;
    const mzMount = asm.mounts.get('muzzle');
    if (mzMount) {
      const len = (asm.info('muzzle') && asm.info('muzzle').muzzle && asm.info('muzzle').muzzle.x) || 0;
      muzzleE = V3(len, 0, 0).applyMatrix4(WK.toRoot(mzMount, asm.root));
    } else muzzleE = V3(...(base.muzzle || [400, 0, 0]));
    const ej = base.eject || { p: [-40, 5, 16], dir: [0.3, 0.4, 1] };
    const ejDirE = V3(...ej.dir).normalize();
    const stats = asm.stats();
    const magInfo = asm.info('mag') && asm.info('mag').mag;
    const magCap = (magInfo && magInfo.cap) || def.base.mag || 30;
    const mzInfo = asm.info('muzzle') && asm.info('muzzle').muzzle;
    const suppressed = !!(mzInfo && mzInfo.kind === 'supp');
    const sights = computeSights(asm);
    for (const sg of sights) {
      sg.eyeG = sg.eyeE.clone().applyMatrix4(HM);
      sg.dirG = sg.dir.clone().transformDirection(HM).normalize();
      sg.upG = (sg.up || V3(0, 1, 0)).clone().transformDirection(HM).normalize();
      sg.rearG = sg.eye.clone().applyMatrix4(HM);
      sg.adsNear = Math.max(0.03, Math.min(0.11, sg.eyeE.distanceTo(sg.eye) * S - 0.015));
    }
    /* v9: ближняя плоскость в прицеле — по реальной геометрии. Раньше она
       стояла на «торце прицела − 1,5 см» (до 11 см) для ЛЮБОЙ оси, и при
       наклонном (45°) или дополнительном прицеле основной прицел и часть
       корпуса оказывались ближе неё — «проваливались»/исчезали. Теперь для
       каждой оси ищем ближайшую к глазу деталь оружия в поле зрения
       (кроме корпуса самого прицела — его торец по-прежнему отсекается,
       чтобы окно было широким, как у живого глаза) и ставим плоскость перед ней. */
    for (const sg of sights) try { clearNear(sg, asm.root, HM); } catch (e) { console.warn('near', e && e.message); }
    /* v9: марка коллиматора — в самой линзе (см. lensReticle) */
    for (const sg of sights) try { lensReticle(sg, gun); } catch (e) { console.warn('lens reticle', e && e.message); }
    const sight = sights[0];
    const eyeG = sight.eyeG, dirG = sight.dirG;
    /* магазин: группа-шарнир у горловины (мировая матрица в системе рига) */
    const magIt = asm.installed.get('mag');
    const magwell = asm.mounts.get('magwell') || asm.mounts.get('tubeEnd');
    const magSeat = magwell ? V3(0, 0, 0).applyMatrix4(toG(magwell)) : e2g(-30, -30, 0);
    let magObj = null, magRestLocal = null, magParentToG = null;
    if (magIt && magIt.obj && def.feed !== 'tube') {
      magObj = magIt.obj;
      magObj.updateMatrix();
      magRestLocal = magObj.matrix.clone();
      magParentToG = toG(magObj.parent);
    }
    /* узлы механики */
    const N = base.nodes || {}, A = base.anim || {};
    const charger = asm.installed.get('charger');
    const fam = wp.fam;
    /* рукоятка затвора АК — правый край затворной рамы (для досыла) */
    let chargeE = null;
    if (fam === 'ak' && N.carrier) {
      const bb = nodeBox(N.carrier, asm.root);
      chargeE = bb.isEmpty() ? V3(-20, 8, 30) : V3(bb.max.x - 14, (bb.min.y + bb.max.y) * 0.5, bb.max.z);
    }
    const w = {
      id, def, asm, cfg: applied, wp, fam, name: NAMES[id] || def.short || id,
      root: mount, recoilRig, tiltRig, gun, holder, HM, e2g, toG, oy, oz,
      nodes: N, anim: A, parts: {}, dirs: {},
      muzzleLocal: e2g(muzzleE.x, muzzleE.y, muzzleE.z),
      ejectLocal: e2g(ej.p[0], ej.p[1], ej.p[2]),
      ejectDir: V3(ejDirE.z, ejDirE.y, -ejDirE.x).normalize(),
      ejectSpeed: ej.speed || 3.2,
      magSeat, magObj, magRestLocal, magParentToG,
      chargeG: chargeE ? e2g(chargeE.x, chargeE.y, chargeE.z) : null,
      charger: charger ? { obj: charger.obj, travel: (charger.info && charger.info.charger && charger.info.charger.travel) || 0, rest: charger.obj.position.x } : null,
      sights, sight, sightIdx: 0, eyeG, dirG, upG: sight.upG,
      stats: {
        rpm: stats.rpm || def.base.rpm || 600,
        modes: (def.modes || ['safe', 'semi']).slice(),
        magCap, cal: def.cal, feed: def.feed || 'box', action: def.action || (def.feed === 'tube' ? 'pump' : 'auto'),
        v0: stats.velocity || def.base.velocity || 800,
        recoilV: stats.recoilV || 100, recoilH: stats.recoilH || 100, ergo: stats.ergo || 50,
        adsTime: (stats.adsTime || 300) / 1000, weight: (stats.weight || 3000) / 1000, moa: stats.moa || 2,
        loud: stats.loud || 160, flash: stats.flash || 60, suppressed,
        muzzleKind: (mzInfo && mzInfo.kind) || 'bare',
        /* v9: эффекты выстрела оружейной (WK.ShotFX): тип среза, размер вспышки по калибру, заметность ДТК */
        fxKind: mzInfo ? mzInfo.kind : ((asm.info('barrel') && asm.info('barrel').muzzleKind) || def.bareKind || 'bare'),
        fxSize: def.flashSize !== undefined ? def.flashSize : ((WK.FLASH && WK.FLASH[def.cal]) || 1),
        fxFlash: mzInfo ? (mzInfo.flash !== undefined ? mzInfo.flash : 0.8) : 1,
        fxSmoke: def.cal === '12ga' ? 1.4 : 1,
        boltHold: def.boltHold === undefined ? wp.boltHold !== false : !!def.boltHold
      },
      ammoTypes: AMMO[def.cal] || AMMO['556'],
      spec: null
    };
    w.stats.chamberPlus = w.stats.feed === 'tube' ? 1 : 0;   // M870: 4+1
    /* передняя рукоятка под цевьём: опорная кисть берётся за неё (вертикальная — кулаком,
       как за пистолетную; наклонная AFG/KAG и упор — ладонью у цевья перед/за упором) */
    const fgIt = asm.installed.get('under');
    if (fgIt && fgIt.obj && fgIt.part && fgIt.part.cat === 'foregrip') {
      const bb = nodeBox(fgIt.obj, asm.root);
      if (!bb.isEmpty()) {
        const kind = ({ afg2: 'angled', kag: 'angled', handstop: 'stop' })[fgIt.part.id] || 'vertical';
        const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
        w.fgrip = {
          id: fgIt.part.id, kind,
          top: e2g(cx, bb.max.y, cz), bot: e2g(cx, bb.min.y, cz),
          front: e2g(bb.max.x, bb.max.y, cz), rear: e2g(bb.min.x, bb.max.y, cz),
          len: (bb.max.y - bb.min.y) * S
        };
      }
    }
    /* исходные положения подвижных узлов */
    w.rest = {
      carrier: N.carrier ? N.carrier.position.x : 0,
      forend: N.forend ? N.forend.position.x : 0,
      handle: N.handle ? N.handle.position.x : 0,
      trigger: N.trigger ? N.trigger.rotation.z : 0
    };
    w.lightLocal = w.muzzleLocal.clone().add(V3(0.03, -0.02, 0.2));
    /* тактика (T — фонарь, L — ЛЦУ, B — сошки/приклад): точки в системе рига */
    const tacPts = (key) => asm.withInfo(key).map((it) => {
      const p = (it.data && it.data.p) || [0, 0, 0];
      const v = V3(p[0], p[1], p[2]).applyMatrix4(WK.toRoot(it.obj, asm.root)).applyMatrix4(HM);
      return { p: v, data: it.data, obj: it.obj };
    });
    let lights = [], lasers = [];
    try { lights = tacPts('light'); lasers = tacPts('laser'); } catch (e) { /* без тактики */ }
    const bp = asm.withInfo('bipod')[0], fo = asm.withInfo('fold')[0];
    w.tac = { lights, lasers, bipod: bp ? bp.data : null, fold: fo ? fo.data : null };
    if (lights.length) w.lightLocal = lights[0].p.clone();
    /* ближняя плоскость в прицеле: глаз — у диоптра (≈75 мм), у оптики — вынос */
    w.adsNear = sight.adsNear; w.rearG = sight.rearG;
    return w;
  }

  /* смена прицельной оси: поза «в прицеле» берётся от новой оси (с креном для боковых) */
  function setSight(w, idx) {
    const n = w.sights.length;
    if (!n) return null;
    idx = ((idx % n) + n) % n;
    const sg = w.sights[idx];
    w.sightIdx = idx; w.sight = sg;
    w.eyeG = sg.eyeG; w.dirG = sg.dirG; w.upG = sg.upG; w.adsNear = sg.adsNear; w.rearG = sg.rearG;
    if (w.spec) {
      const a = adsPose(w), P = w.spec.tuning.poses.ads;
      P.pos[0] = a.pos[0]; P.pos[1] = a.pos[1]; P.pos[2] = a.pos[2];
      P.rot[0] = a.rot[0]; P.rot[1] = a.rot[1]; P.rot[2] = a.rot[2];
    }
    return sg;
  }

  /* --------------------------------------------- модель-заместитель -- */
  function createModel(w) {
    const m = {
      root: new THREE.Group(), magSeat: new THREE.Object3D(), magazine: new THREE.Group(),
      muzzle: new THREE.Object3D(), ejectionPort: new THREE.Object3D(), lightMount: new THREE.Object3D(),
      roundInMag: new THREE.Object3D(), slide: 0, trigger: 0, locked: false,
      setSlide(t) { m.slide = t; }, setTrigger(t) { m.trigger = t; },
      setSlideStop(v) { m.locked = !!v; }, setSelector() {}, setLight() {}
    };
    m.magSeat.position.copy(w.magSeat);
    m.magSeat.add(m.magazine);
    m.muzzle.position.copy(w.muzzleLocal);
    m.ejectionPort.position.copy(w.ejectLocal);
    m.lightMount.position.copy(w.lightLocal);
    m.root.add(m.magSeat, m.muzzle, m.ejectionPort, m.lightMount, m.roundInMag);
    return m;
  }

  /* ----------------------------------------------------- хват кистей -- */
  const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  function rightGripFor(w) {
    const wp = w.wp;
    const d = -((wp.rake || 20) - 20) * DEG;
    const M = new THREE.Matrix4().makeTranslation(G0.x, G0.y, G0.z)
      .multiply(new THREE.Matrix4().makeRotationX(d))
      .multiply(new THREE.Matrix4().makeTranslation(-G0.x, -G0.y, -G0.z))
      .multiply(RGRIP0);
    if (wp.rOff) M.premultiply(new THREE.Matrix4().makeTranslation(wp.rOff[0], wp.rOff[1], wp.rOff[2]));
    return M;
  }
  function leftGripFor(w) {
    const hg = w.wp.hg;
    const m = LGRIP0.clone();
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    const axisY = hg.y * S + w.oy;
    const d = Math.hypot(p.x, p.y), k = (d + (hg.r - 23) * S) / d;
    m.setPosition(p.x * k, p.y * k + axisY, -hg.x * S + w.oz);
    if (w.wp.lOff) m.premultiply(new THREE.Matrix4().makeTranslation(w.wp.lOff[0], w.wp.lOff[1], w.wp.lOff[2]));
    return m;
  }

  /* Левая кисть на передней рукоятке.
     Вертикальная: хват как у правой за пистолетную рукоятку, зеркально (тыл ладони наружу, влево),
     перепонка большого и указательного — под цевьём у верха рукоятки, ось рукоятки без наклона.
     Наклонная (AFG/KAG): основание ладони ложится на скос, большой палец вдоль цевья.
     Упор (handstop): «C-clamp», указательный палец сразу за упором. */
  function foregripGripFor(w, base) {
    const f = w.fgrip;
    if (!f) return null;
    if (f.kind === 'vertical') {
      /* перепонка ≈ 14 мм ниже верха рукоятки, на задней грани оси */
      const web = f.top.clone(); web.y -= 0.014; web.z += 0.006;
      const R0 = gripMatrix([-0.028, -0.0775, 0.062], [0, -0.342, -0.94], [-1, 0, 0]);
      /* RGRIP0 настроен под наклон 20°; у вертикальной рукоятки наклона нет */
      const M = new THREE.Matrix4().makeTranslation(web.x, web.y, web.z)
        .multiply(new THREE.Matrix4().makeRotationX(20 * DEG))
        .multiply(new THREE.Matrix4().makeTranslation(-G0.x, -G0.y, -G0.z))
        .multiply(R0);
      return M;
    }
    /* наклонная и упор — тот же опорный хват, сдвинутый вдоль цевья */
    const m = base.clone();
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    /* запястье ≈ 75 мм позади центра ладони */
    const palm = f.kind === 'stop' ? f.rear.z + 0.045 : (f.front.z + f.rear.z) / 2;
    p.z = palm + 0.07;
    m.setPosition(p);
    return m;
  }

  /* ------------------------------------------------------- позы рук -- */
  const FING = { middle: [0.1, 1.35, 1.45, 0.7, 0], ring: [0.15, 1.35, 1.45, 0.7, 0], pinky: [0.2, 1.25, 1.35, 0.7, 0] };
  const THUMB = [0.9, 0.45, 0.35, 0, -0.35];
  const HANDS = {
    indexed: P(THUMB, [0, 0, 0.1, 0.05, -0.1], FING.middle, FING.ring, FING.pinky),
    trigger: P(THUMB, [0, 0.36, 1.0, 0.45, 0.02], FING.middle, FING.ring, FING.pinky),
    magRelease: P(THUMB, [0, 0.15, 0.45, 0.25, -0.15], FING.middle, FING.ring, FING.pinky),
    support: P([0.3, 0.15, 0.05, 0, 0.2], [0.05, 1.25, 1.35, 0.65, 0], [0.05, 1.3, 1.4, 0.7, 0], [0.1, 1.3, 1.4, 0.7, 0], [0.15, 1.25, 1.35, 0.7, 0]),
    open: LEFT_OPEN,
    mag: P([0.5, 0.3, 0.2, 0, 0.2], [0.05, 0.95, 1.05, 0.55, 0], [0.1, 1, 1.05, 0.5, 0], [0.1, 1.05, 1.1, 0.5, 0], [0.15, 1, 1.05, 0.5, 0]),
    aux: P([0.3, 0.4, 0.3, 0, 0.4], [0.1, 1.1, 1.1, 0.5, 0], [0.1, 1.15, 1.1, 0.5, 0], [0.1, 1.15, 1.1, 0.5, 0], [0.1, 1.1, 1.1, 0.5, 0]),
    /* ладонь плашмя: удар по задержке / рукояти HK */
    slap: P([0.15, 0.05, 0.05, 0, 0.1], [0, 0.12, 0.1, 0.05, 0], [0, 0.12, 0.1, 0.05, 0], [0, 0.14, 0.1, 0.05, 0], [0, 0.16, 0.1, 0.05, 0]),
    /* патрон 12-го калибра в щепоти */
    shell: P([0.6, 0.45, 0.35, 0, 0.3], [0.05, 0.75, 0.8, 0.35, 0], [0.1, 0.95, 1.0, 0.45, 0], [0.12, 1.1, 1.15, 0.6, 0], [0.15, 1.15, 1.2, 0.65, 0]),
    /* пистолет: опорная кисть обхватывает пальцы правой */
    wrap: P([0.25, 0.1, 0.05, 0, 0.35], [0.05, 0.95, 1.0, 0.5, 0], [0.05, 1.0, 1.05, 0.5, 0], [0.1, 1.05, 1.1, 0.55, 0], [0.15, 1.05, 1.1, 0.55, 0]),
    /* кулак на вертикальной рукоятке: все четыре пальца обхватывают, большой — поверх указательного */
    vgrip: P(THUMB, [0.05, 1.3, 1.4, 0.7, 0], FING.middle, FING.ring, FING.pinky),
    /* ладонь на наклонной рукоятке: пальцы прямее, большой вдоль цевья */
    afg: P([0.55, 0.2, 0.1, 0, 0.1], [0.05, 0.85, 0.9, 0.45, 0], [0.05, 0.95, 1.0, 0.5, 0], [0.1, 1.0, 1.05, 0.55, 0], [0.15, 1.0, 1.05, 0.55, 0])
  };

  /* ------------------------------------------------ поза «в прицеле» -- */
  function adsPose(w) {
    const dir = w.dirG.clone().normalize();
    let q;
    const up = w.upG ? w.upG.clone() : null;
    if (up && Math.abs(up.dot(dir)) < 0.95) {
      /* полный базис оси прицела: вперёд — в -Z, «верх» сетки — в +Y (боковой прицел под 45°
         поворачивает оружие так, чтобы сам прицел встал ровно перед глазом) */
      up.addScaledVector(dir, -up.dot(dir)).normalize();
      const right = new THREE.Vector3().crossVectors(dir, up).normalize();
      const M = new THREE.Matrix4().makeBasis(right, up, dir.clone().negate());
      q = new THREE.Quaternion().setFromRotationMatrix(M.transpose());
    } else q = new THREE.Quaternion().setFromUnitVectors(dir, V3(0, 0, -1));
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    const eye = w.eyeG.clone().applyQuaternion(q);
    return { pos: [-eye.x, -eye.y, -eye.z], rot: [e.x / DEG, e.y / DEG, e.z / DEG] };
  }

  /* --------------------------------------------- отдача по образцу -- */
  /* Профили отдачи по образцам. Множители (…M) применяются к базовой отдаче
     после пересчёта по статам; остальные поля задаются как есть:
       yawBias / climbYawBias — постоянный увод (−1 влево … +1 вправо),
       rollMin / rollMax     — диапазон завала,
       burstGrow             — насколько очередь «разносит» к 8-му выстрелу,
       settleDeg             — запоздалый «клевок» ствола вниз после подброса,
       shake                 — сила вздрагивания камеры. */
  const RECOIL_MUL = { backM: 'kickBack', upM: 'kickUp', pitchM: 'pitchDeg', yawM: 'yawDeg', rollM: 'rollDeg',
    fBackM: 'fBack', zBackM: 'zBack', fM: 'f', zM: 'z', climbM: 'climbDeg', climbYawM: 'climbYawDeg',
    delayM: 'recoverDelay', rateM: 'recoverRate', camM: 'cameraKick' };
  const RECOIL_PROFILE = {
    /* 5,45: дульный тормоз гасит подброс — частая мелкая дрожь, ствол чуть уводит влево */
    ak74: { backM: 0.95, pitchM: 0.8, yawM: 1.3, rollM: 1.0, fM: 1.18, zM: 0.45, climbM: 0.8, climbYawM: 1.2,
      yawBias: -0.15, climbYawBias: -0.3, rollMin: -0.6, rollMax: 0.9, rateM: 1.2, burstGrow: 0.25, settleDeg: 0.25, shake: 0.85 },
    /* 7,62×39: грубый толчок, ствол лезет вверх-вправо, заметный завал */
    akm: { backM: 1.12, pitchM: 1.35, yawM: 1.4, rollM: 1.5, zM: 0.8, climbM: 1.35, climbYawM: 1.5,
      yawBias: 0.45, climbYawBias: 0.6, rollMin: 0.1, rollMax: 1.3, rateM: 0.85, burstGrow: 0.5, settleDeg: 0.15, shake: 1.15 },
    /* буферная трубка: прямой толчок в плечо, ровная управляемая очередь */
    m416: { backM: 1.15, pitchM: 0.78, yawM: 0.55, rollM: 0.55, zM: 1.1, zBackM: 1.1, climbM: 0.85, climbYawM: 0.6,
      yawBias: 0, climbYawBias: 0.1, rollMin: -0.3, rollMax: 0.6, rateM: 1.15, burstGrow: 0.15, settleDeg: 0, shake: 0.75 },
    /* 7,62×51: тяжёлый медленный толчок, большой подброс, долгое возвращение */
    scar: { backM: 1.4, pitchM: 1.25, yawM: 0.9, rollM: 0.9, fBackM: 0.82, fM: 0.84, zM: 0.95, climbM: 1.3, climbYawM: 1.1,
      yawBias: -0.25, climbYawBias: -0.35, rollMin: -0.2, rollMax: 1.0, delayM: 1.3, rateM: 0.72, burstGrow: 0.4, settleDeg: 0.45, shake: 1.3 },
    /* 7,62×54R: резкий вскид, ствол «плывёт» и медленно оседает на цель */
    svd: { backM: 1.3, pitchM: 1.55, yawM: 1.0, rollM: 1.25, fBackM: 0.75, fM: 0.68, zM: 0.58, climbM: 1.3, climbYawM: 0.8,
      yawBias: 0.3, climbYawBias: 0.35, rollMin: 0.2, rollMax: 1.2, delayM: 1.5, rateM: 0.62, burstGrow: 0, settleDeg: 0.9, shake: 1.55 },
    /* 12 калибр: мощный удар в плечо, ружьё задирает и заваливает вправо */
    m870: { backM: 1.1, pitchM: 1.1, yawM: 1.1, rollM: 1.7, fBackM: 0.7, fM: 0.64, zM: 0.62, climbM: 1.5, climbYawM: 1.0,
      yawBias: 0.25, climbYawBias: 0.3, rollMin: 0.35, rollMax: 1.3, delayM: 1.25, rateM: 0.7, burstGrow: 0, settleDeg: 0.8, shake: 1.75 },
    /* 9×19 со свободным затвором: лёгкое частое «жужжание», почти без подброса */
    mp5a3: { backM: 0.72, pitchM: 0.66, yawM: 0.7, rollM: 0.45, fBackM: 1.3, fM: 1.32, zM: 0.72, climbM: 0.6, climbYawM: 0.8,
      yawBias: 0.05, climbYawBias: 0.1, rollMin: -0.5, rollMax: 0.7, rateM: 1.4, burstGrow: 0.12, settleDeg: 0, shake: 0.55 },
    /* компенсатор: подброс меньше, но в автомате (1200 в/м) пистолет быстро уходит вверх-вправо */
    glock18c: { pitchM: 0.86, yawM: 1.2, climbM: 1.0, climbYawM: 1.3,
      yawBias: 0.2, climbYawBias: 0.4, rollMin: -0.2, rollMax: 1.0, burstGrow: 0.7, settleDeg: 0.35, shake: 1.45 }
  };
  function recoilFor(w, base) {
    const k = (w.wp.recoil || 1) * (w.stats.recoilV / 100);
    const h = (w.wp.recoil || 1) * (w.stats.recoilH / 100);
    const R = Object.assign({}, base);
    R.kickBack = base.kickBack * (0.7 + 0.5 * k);
    R.kickUp = base.kickUp * k;
    R.pitchDeg = base.pitchDeg * k;
    R.yawDeg = base.yawDeg * h;
    R.rollDeg = base.rollDeg * h;
    R.climbDeg = base.climbDeg * k;
    R.climbYawDeg = base.climbYawDeg * h;
    R.cameraKick = base.cameraKick * k;
    return R;
  }

  /* ------------------------------------------------------- спеки -- */
  const gunPos0 = [[0, [0, 0, 0]], [0.28, [-0.03, 0.08, -0.1]], [1, [-0.035, 0.09, -0.1]], [1.24, [-0.035, 0.092, -0.1]], [1.32, [-0.03, 0.102, -0.1]]];
  const gunRot0 = [[0, [0, 0, 0]], [0.28, [14, 8, -24]], [1, [16, 9, -26]], [1.24, [17, 9, -25]], [1.32, [20, 9, -22]]];
  const scaleT = (arr, k) => arr.map(([t, v]) => [t * k, v]);
  const scaleKeys = (keys, k) => keys.map((x) => Object.assign({}, x, { t: x.t * k }));
  const scaleEv = (ev, k) => ev.map(([t, e]) => [t * k, e]);

  function rifleTracks(w, spec) {
    const fam = w.fam;
    const [tTac, tEmpty] = w.wp.reload || [2.4, 3.0];
    const toMag = [
      { t: 0, at: 'grip', pose: 'support' },
      { t: 0.1, at: 'grip', pose: 'support' },
      { t: 0.5, at: 'pouch', pose: 'open' },
      { t: 0.64, at: 'pouch', pose: 'mag' },
      { t: 1.02, at: 'mag', mag: fam === 'ak' ? [-0.10, -0.03, -0.30] : [-0.11, 0, -0.06], pose: 'mag' },
      { t: 1.14, at: 'mag', mag: fam === 'ak' ? [-0.03, -0.012, -0.22] : [-0.035, 0, -0.02], pose: 'mag' },
      { t: 1.26, at: 'mag', mag: [0, 0, 0], pose: 'mag' },
      { t: 1.32, at: 'mag', mag: [-4e-3, 0, 0], pose: 'open' }
    ];
    const events = [[0.18, 'magOut'], [0.24, 'drop'], [0.48, 'pouch'], [0.64, 'grab'], [1.16, 'magIn'], [1.26, 'seat']];
    const tactical = {
      duration: 2,
      gunPos: [...gunPos0, [1.62, [-0.01, 0.02, -0.02]], [2, [0, 0, 0]]],
      gunRot: [...gunRot0, [1.62, [3, 2, -4]], [2, [0, 0, 0]]],
      left: [...toMag, { t: 1.65, at: 'grip', pose: 'support' }],
      events, magRelease: [0.12, 0.34]
    };
    /* v11: АК — магазин НЕ выпадает сам (у АК нет кнопки под правую руку и
       магазин держится зацепом). Как учат (НСД, «ускоренная смена»): левая
       кисть обхватывает магазин, большой палец жмёт защёлку за
       горловиной, магазин «выкатывается» вперёд-вниз вокруг переднего зуба,
       кисть отводит и бросает его, идёт к подсумку; новый — передним зубом
       в горловину, «накатить» назад до щелчка. Ствол во время рывка
       кренится к стрелку сильнее. */
    const akStrip = fam === 'ak' ? (() => {
      const D = 0.5;            // сдвиг вставки относительно прежней дорожки
      const left = [
        { t: 0, at: 'grip', pose: 'support' },
        { t: 0.06, at: 'grip', pose: 'support' },
        { t: 0.20, at: 'mag', mag: [0, 0, 0], clear: -0.055, pose: 'open' },
        { t: 0.30, at: 'mag', mag: [0, 0, 0], pose: 'mag' },
        { t: 0.38, at: 'mag', mag: [-0.004, -0.002, -0.05], pose: 'mag' },
        { t: 0.48, at: 'mag', mag: [-0.03, -0.012, -0.22], pose: 'mag' },
        { t: 0.58, at: 'mag', mag: [-0.10, -0.03, -0.32], pose: 'mag' },
        { t: 0.70, at: 'mag', mag: [-0.19, 0.0, -0.45], pose: 'open' },
        ...toMag.slice(2).map((k) => Object.assign({}, k, { t: k.t + D }, k.t === 1.02 ? { ins: true } : {}))
      ];
      const ev = [[0.31, 'grabOld'], [0.38, 'magOut'], [0.68, 'drop'], [0.98, 'pouch'], [1.14, 'grab'], [1.66, 'magIn'], [1.76, 'seat']];
      /* v12: автомат подтягивается К СЕБЕ (было — на 10 см от себя, на
         вытянутых руках): горловина в «рабочей зоне» у груди, в 35–45 см от
         глаз, где её видно и где левой руке короче путь от подсумка */
      const gp = [[0, [0, 0, 0]], [0.28, [-0.04, 0.07, 0.03]], [0.6, [-0.046, 0.076, 0.04]], [0.8, [-0.045, 0.08, 0.04]],
        [1.5, [-0.045, 0.08, 0.04]], [1.74, [-0.045, 0.082, 0.035]], [1.82, [-0.04, 0.092, 0.02]]];
      /* v12: ствол ближе к горизонту (голова теперь сама опускается к
         горловине — см. 21_game_bodycam), крен сильнее: горловина
         разворачивается к левой руке («roll the rifle so the magazine rises
         to your reloading-hand side», Shooting Illustrated); на рывке
         старого магазина крен максимален */
      const gr = [[0, [0, 0, 0]], [0.28, [10, 8, -30]], [0.52, [12, 10, -36]], [0.8, [11, 9, -31]],
        [1.5, [11, 9, -30]], [1.74, [13, 9, -29]], [1.82, [16, 9, -25]]];
      return { D, left, ev, gp, gr };
    })() : null;
    if (akStrip) {
      const A = akStrip;
      Object.assign(tactical, {
        duration: 2.5,
        gunPos: [...A.gp, [2.12, [-0.01, 0.02, -0.02]], [2.5, [0, 0, 0]]],
        gunRot: [...A.gr, [2.12, [3, 2, -4]], [2.5, [0, 0, 0]]],
        left: [...A.left, { t: 2.15, at: 'grip', pose: 'support' }],
        events: A.ev, magRelease: [-1, -1]
      });
    }
    let empty;
    if (fam === 'ak') {
      /* рукоятка затвора справа: левая кисть перехватывает сверху и досылает */
      const c = w.chargeG || V3(0.03, 0.005, -0.15);
      const charge = gripMatrix([c.x - 0.058, c.y + 0.045, c.z + 0.035], [0.86, -0.45, -0.22], [0.40, 0.88, 0.25]);
      const travel = (w.anim.carrierTravel || 118) * S;
      const A = akStrip, D = A.D;
      empty = {
        duration: 3.0,
        gunPos: [...A.gp, [2.0, [-0.035, 0.07, 0.0]], [2.4, [-8e-3, 0.015, -0.01]], [3.0, [0, 0, 0]]],
        gunRot: [...A.gr, [2.0, [8, 6, -30]], [2.4, [2, 2, -3]], [3.0, [0, 0, 0]]],
        left: [
          ...A.left,
          { t: 1.52 + D, at: 'gun', gun: charge, pose: 'aux' },
          { t: 1.66 + D, at: 'gun', gun: translate(0, 0, travel, charge), pose: 'aux' },
          { t: 1.72 + D, at: 'gun', gun: translate(-0.02, 0.03, travel, charge), pose: 'open' },
          { t: 2.05 + D, at: 'grip', pose: 'support' }
        ],
        rack: [1.52 + D, 1.66 + D, 1.70 + D],
        events: [...A.ev, [1.6 + D, 'chargeBack'], [1.70 + D, 'release']],
        magRelease: [-1, -1]
      };
    } else if (fam === 'ar') {
      /* затворная задержка слева над горловиной: удар ладонью */
      const s0 = w.magSeat;
      const cat = gripMatrix([s0.x - 0.075, s0.y + 0.012, s0.z + 0.05], [0.25, 0.55, -0.8], [-0.95, 0.05, 0.25]);
      empty = {
        duration: 2.3,
        gunPos: [...gunPos0, [1.5, [-0.03, 0.08, -0.08]], [1.75, [-0.012, 0.03, -0.03]], [2.3, [0, 0, 0]]],
        gunRot: [...gunRot0, [1.5, [12, 7, -22]], [1.75, [4, 2, -6]], [2.3, [0, 0, 0]]],
        left: [
          ...toMag,
          { t: 1.46, at: 'gun', gun: translate(-0.025, 0, 0.01, cat), pose: 'slap' },
          { t: 1.53, at: 'gun', gun: cat, pose: 'slap' },
          { t: 1.62, at: 'gun', gun: translate(-0.03, -0.01, 0, cat), pose: 'open' },
          { t: 1.95, at: 'grip', pose: 'support' }
        ],
        events: [...events, [1.53, 'release']],
        magRelease: [0.12, 0.34]
      };
    } else {
      /* HK: рукоять назад и в вырез, смена магазина, удар ладонью по рукояти */
      const hx = (w.nodes.handle ? w.nodes.handle.position.x : 150);
      const hy = (w.nodes.handle ? w.nodes.handle.position.y : 22);
      const h = w.e2g(hx, hy, -14);
      const grabH = gripMatrix([h.x - 0.05, h.y + 0.03, h.z + 0.04], [0.6, -0.55, -0.55], [-0.35, 0.9, 0.2]);
      const travel = (w.anim.handleTravel || 92) * S;
      const pre = 0.62;   // рукоять в вырез до смены магазина
      const sh = (k) => Object.assign({}, k, { t: k.t + pre });
      empty = {
        duration: 2.5 + pre,
        gunPos: [[0, [0, 0, 0]], [0.3, [-0.02, 0.05, -0.06]], [pre, [-0.02, 0.05, -0.06]], ...gunPos0.slice(1).map(([t, v]) => [t + pre, v]),
          [1.62 + pre, [-0.02, 0.05, -0.06]], [1.9 + pre, [-0.005, 0.01, -0.01]], [2.5 + pre, [0, 0, 0]]],
        gunRot: [[0, [0, 0, 0]], [0.3, [6, 4, -14]], [pre, [6, 4, -14]], ...gunRot0.slice(1).map(([t, v]) => [t + pre, v]),
          [1.62 + pre, [8, 5, -18]], [1.9 + pre, [2, 1, -3]], [2.5 + pre, [0, 0, 0]]],
        left: [
          { t: 0, at: 'grip', pose: 'support' },
          { t: 0.18, at: 'gun', gun: grabH, pose: 'aux' },
          { t: 0.34, at: 'gun', gun: translate(0, 0, travel, grabH), pose: 'aux' },
          { t: 0.44, at: 'gun', gun: translate(0, 0.012, travel, grabH), pose: 'aux' },
          { t: 0.56, at: 'gun', gun: translate(-0.03, -0.02, travel, grabH), pose: 'open' },
          ...toMag.slice(2).map(sh),
          { t: 1.5 + pre, at: 'gun', gun: translate(-0.02, 0.05, travel, grabH), pose: 'slap' },
          { t: 1.58 + pre, at: 'gun', gun: translate(0, 0.012, travel, grabH), pose: 'slap' },
          { t: 1.66 + pre, at: 'gun', gun: translate(-0.01, 0, 0.02, grabH), pose: 'open' },
          { t: 2.0 + pre, at: 'grip', pose: 'support' }
        ],
        hk: { back: [0.18, 0.34], lock: [0.34, 0.44], slap: 1.58 + pre },
        events: [[0.26, 'chargeBack'], [0.42, 'hkLock'], ...events.map(([t, e]) => [t + pre, e]), [1.58 + pre, 'release']],
        magRelease: [0.12 + pre, 0.34 + pre]
      };
    }
    /* длительности под таблицу образца (риг масштабирует скорость сам) */
    spec.tactical = tactical;
    spec.empty = empty;
    spec.reloadTime = [tTac, tEmpty];
  }

  /* помпа: патроны по одному в трубку снизу; дорожка строится под число патронов */
  function pumpTrack(w, spec, n, pumpAfter) {
    const per = w.wp.shell || 0.62;
    const port = w.e2g(-20, -40, 0);      // окно подачи под коробкой
    const load0 = gripMatrix([port.x - 0.02, port.y - 0.075, port.z + 0.05], [0.1, 0.75, -0.65], [-0.85, 0.1, 0.5]);
    const left = [{ t: 0, at: 'grip', pose: 'support' }];
    const events = [];
    const gunPos = [[0, [0, 0, 0]], [0.22, [-0.02, 0.06, -0.05]]];
    const gunRot = [[0, [0, 0, 0]], [0.22, [6, 4, -28]]];
    let t = 0.22;
    for (let i = 0; i < n; i++) {
      left.push({ t: t + per * 0.12, at: 'pouch', pose: 'open' });
      left.push({ t: t + per * 0.38, at: 'pouch', pose: 'shell' });
      left.push({ t: t + per * 0.66, at: 'gun', gun: translate(0, -0.03, 0.03, load0), pose: 'shell' });
      left.push({ t: t + per * 0.86, at: 'gun', gun: translate(0, 0, -0.035, load0), pose: 'shell' });
      events.push([t + per * 0.4, 'grabShell'], [t + per * 0.84, 'shellIn']);
      t += per;
      gunPos.push([t, [-0.02, 0.06, -0.05]]); gunRot.push([t, [6, 4, -28]]);
    }
    let dur = t + 0.35;
    left.push({ t: t + 0.25, at: 'grip', pose: 'support' });
    gunPos.push([t + 0.3, [0, 0, 0]]); gunRot.push([t + 0.3, [0, 0, 0]]);
    if (pumpAfter) {
      events.push([t + 0.42, 'pumpBack'], [t + 0.62, 'pumpFwd']);
      dur = t + 0.85;
    }
    return { duration: dur, gunPos, gunRot, left, events, magRelease: [-1, -1], pump: pumpAfter ? [t + 0.36, t + 0.52, t + 0.72] : null, shells: n, per };
  }

  function pistolTracks(w, spec) {
    const [tTac, tEmpty] = w.wp.reload || [1.6, 2.05];
    const gp = [[0, [0, 0, 0]], [0.18, [0.0, 0.06, 0.06]], [0.9, [0.0, 0.07, 0.07]], [1.1, [0, 0.075, 0.07]]];
    const gr = [[0, [0, 0, 0]], [0.18, [18, 10, -16]], [0.9, [20, 10, -18]], [1.1, [22, 8, -14]]];
    const toMag = [
      { t: 0, at: 'grip', pose: 'wrap' },
      { t: 0.12, at: 'grip', pose: 'wrap' },
      { t: 0.42, at: 'pouch', pose: 'open' },
      { t: 0.54, at: 'pouch', pose: 'mag' },
      { t: 0.86, at: 'mag', mag: [-0.09, 0.01, 0.0], pose: 'mag' },
      { t: 0.98, at: 'mag', mag: [-0.03, 0, 0], pose: 'mag' },
      { t: 1.06, at: 'mag', mag: [0, 0, 0], pose: 'slap' },
      { t: 1.12, at: 'mag', mag: [-0.01, 0, 0], pose: 'open' }
    ];
    const events = [[0.1, 'magOut'], [0.14, 'drop'], [0.4, 'pouch'], [0.54, 'grab'], [0.98, 'magIn'], [1.06, 'seat']];
    spec.tactical = {
      duration: 1.6,
      gunPos: [...gp, [1.3, [0, 0.02, 0.02]], [1.6, [0, 0, 0]]],
      gunRot: [...gr, [1.3, [4, 2, -3]], [1.6, [0, 0, 0]]],
      left: [...toMag, { t: 1.38, at: 'grip', pose: 'wrap' }],
      events, magRelease: [0.04, 0.2]
    };
    /* пустой: кожух на задержке — перехват кожуха сверху и отпуск */
    const sl = w.e2g(-60, 10, 0);
    const rack = gripMatrix([sl.x - 0.02, sl.y + 0.075, sl.z + 0.03], [0.15, -0.6, -0.78], [-0.3, 0.75, -0.55]);
    const travel = (w.anim.carrierTravel || 56) * S;
    spec.empty = {
      duration: 2.05,
      gunPos: [...gp, [1.3, [0, 0.05, 0.05]], [1.6, [0, 0.01, 0.01]], [2.05, [0, 0, 0]]],
      gunRot: [...gr, [1.3, [10, 6, -10]], [1.6, [2, 1, -2]], [2.05, [0, 0, 0]]],
      left: [
        ...toMag,
        { t: 1.3, at: 'gun', gun: rack, pose: 'aux' },
        { t: 1.42, at: 'gun', gun: translate(0, 0, travel * 0.6, rack), pose: 'aux' },
        { t: 1.48, at: 'gun', gun: translate(-0.02, 0.03, travel * 0.6, rack), pose: 'open' },
        { t: 1.8, at: 'grip', pose: 'wrap' }
      ],
      rack: [1.3, 1.42, 1.46],
      events: [...events, [1.40, 'chargeBack'], [1.46, 'release']],
      magRelease: [0.04, 0.2]
    };
    spec.reloadTime = [tTac, tEmpty];
  }

  /* Contact frames fitted against the deformed left glove and default magazine
     surfaces. Fingers travel across the front edge, with pads on the far side;
     the old up-the-magazine frame put the knuckles into the receiver. */
  const MAG_CONTACT_PROFILES = /* CONTACT_PROFILES_START */ {"ak74":{"params":[-0.058699999999999995,-0.09715000000000001,0.063,0.7100000000000001,1.506,1.009,0.7,1.5659999999999998,1.1570000000000003,0.7240000000000001,1.3369999999999997,0.8099999999999998,0.785,0.71,1.3179999999999998,0.1,0,0,0.24800000000000014,0.41000000000000003],"pose":{"thumb":[0.1,0,0,0,0.24800000000000014],"index":[0.05,0.7100000000000001,1.506,1.009,0],"middle":[0.1,0.7,1.5659999999999998,1.1570000000000003,0],"ring":[0.1,0.7240000000000001,1.3369999999999997,0.8099999999999998,0],"pinky":[0.15,0.785,0.71,1.3179999999999998,0]},"bounds":{"min":[-0.01425000000745058,-0.21228061616420746,-0.20632971823215485],"max":[0.01425000000745058,-0.0294333603233099,-0.1080000028014183]},"seat":[-8.881784197001253e-19,-0.0465,-0.17400000000000002]},"akm":{"params":[-0.058899999664723875,-0.09556785726994277,0.05944995632171632,0.758,1.3519999999999996,1.141,0.702,1.5139999999999996,1.113,0.7340000000000001,1.2889999999999997,0.8459999999999999,0.63,0.9089999999999998,1.5,0.1,0.21200000000000002,0,0.2679999999999999,0.46799999999999997],"pose":{"thumb":[0.1,0.21200000000000002,0,0,0.2679999999999999],"index":[0.05,0.758,1.3519999999999996,1.141,0],"middle":[0.1,0.702,1.5139999999999996,1.113,0],"ring":[0.1,0.7340000000000001,1.2889999999999997,0.8459999999999999,0],"pinky":[0.15,0.63,0.9089999999999998,1.5,0]},"bounds":{"min":[-0.014999999664723873,-0.21830235421657562,-0.2204500436782837],"max":[0.014999999664723873,-0.0294333603233099,-0.10140000283718109]},"seat":[-8.881784197001253e-19,-0.0465,-0.17400000000000002]},"m416":{"params":[-0.057600000350177295,-0.0648193445727229,0.047413314223289496,0.6000000000000001,1.4519999999999995,1.175,0.55,1.5899999999999999,1.179,0.6920000000000001,1.3109999999999997,0.6199999999999998,0.5700000000000001,0.7569999999999998,1.448,0.1,0.02,1.1,0.2500000000000001,0.268],"pose":{"thumb":[0.1,0.02,1.1,0,0.2500000000000001],"index":[0.05,0.6000000000000001,1.4519999999999995,1.175,0],"middle":[0.1,0.55,1.5899999999999999,1.179,0],"ring":[0.1,0.6920000000000001,1.3109999999999997,0.6199999999999998,0],"pinky":[0.15,0.5700000000000001,0.7569999999999998,1.448,0]},"bounds":{"min":[-0.013500000350177288,-0.2054830640554428,-0.1940866857767105],"max":[0.013500000350177288,-0.018155625090003014,-0.1035846695303917]},"seat":[-1.3322676295501879e-18,-0.07050000000000001,-0.135]},"scar":{"params":[-0.058699999664723876,-0.05507006077840924,0.04600000572204589,0.63,1.482,0.717,0.55,1.5359999999999998,0.751,0.658,1.1769999999999996,0.7639999999999999,0.55,0.746,0.9859999999999995,0.7619999999999999,0.8040000000000002,0.8420000000000003,0.8,0.04600000000000001],"pose":{"thumb":[0.7619999999999999,0.8040000000000002,0.8420000000000003,0,0.8],"index":[0.05,0.63,1.482,0.717,0],"middle":[0.1,0.55,1.5359999999999998,0.751,0],"ring":[0.1,0.658,1.1769999999999996,0.7639999999999999,0],"pinky":[0.15,0.55,0.746,0.9859999999999995,0]},"bounds":{"min":[-0.014999999664723873,-0.19099999964237213,-0.1809999942779541],"max":[0.014999999664723873,-0.010140121914446354,-0.0860000029206276]},"seat":[-6.661338147750939e-18,-0.0675,-0.126]},"svd":{"params":[-0.056249999925494204,-0.07698391588032245,0.08853115167617799,0.6940000000000001,1.3459999999999999,0.7569999999999999,0.5900000000000001,1.3779999999999997,0.889,0.5900000000000001,1.2749999999999997,0.5599999999999999,0.56,0.7,0.7359999999999993,0.3600000000000001,1.1,1.046,0.7220000000000001,-0.08],"pose":{"thumb":[0.3600000000000001,1.1,1.046,0,0.7220000000000001],"index":[0.05,0.6940000000000001,1.3459999999999999,0.7569999999999999,0],"middle":[0.1,0.5900000000000001,1.3779999999999997,0.889,0],"ring":[0.1,0.5900000000000001,1.2749999999999997,0.5599999999999999,0],"pinky":[0.15,0.56,0.7,0.7359999999999993,0]},"bounds":{"min":[-0.013749999925494194,-0.16172771155834198,-0.272368848323822],"max":[0.013749999925494194,-0.029240120202302933,-0.1770000010728836]},"seat":[4.440892098500626e-19,-0.045500000000000006,-0.265]},"mp5a3":{"params":[-0.04944999967962504,-0.07857912998646496,0.061797514247894265,0.562,1.2919999999999998,1.001,0.6260000000000001,1.4239999999999997,1.2970000000000002,0.9020000000000001,1.3029999999999997,0.8399999999999999,0.7990000000000002,0.9409999999999997,1.446,0.1,1.1,1.1,0.6500000000000001,0.7],"pose":{"thumb":[0.1,1.1,1.1,0,0.6500000000000001],"index":[0.05,0.562,1.2919999999999998,1.001,0],"middle":[0.1,0.6260000000000001,1.4239999999999997,1.2970000000000002,0],"ring":[0.1,0.9020000000000001,1.3029999999999997,0.8399999999999999,0],"pinky":[0.15,0.7990000000000002,0.9409999999999997,1.446,0]},"bounds":{"min":[-0.012249999679625034,-0.23008136451244354,-0.2560024857521057],"max":[0.012249999679625034,-0.022076895460486412,-0.1835000067949295]},"seat":[2.220446049250313e-18,-0.0335,-0.22000000000000003]},"glock18c":{"params":[-0.0468000003501773,-0.06664345674514775,0.10215393301248549,0.55,1.2819999999999998,1.141,0.554,1.7459999999999996,0.5870000000000001,0.6140000000000001,1.553,0.7699999999999998,0.5720000000000001,1.259,1.2059999999999997,0.29400000000000004,1.1,1.1,0.8,0.23600000000000002],"pose":{"thumb":[0.29400000000000004,1.1,1.1,0,0.8],"index":[0.05,0.55,1.2819999999999998,1.141,0],"middle":[0.1,0.554,1.7459999999999996,0.5870000000000001,0],"ring":[0.1,0.6140000000000001,1.553,0.7699999999999998,0],"pinky":[0.15,0.5720000000000001,1.259,1.2059999999999997,0]},"bounds":{"min":[-0.013500000350177288,-0.14764785766601562,-0.053746066987514496],"max":[0.013500000350177288,-0.022039055824279785,0.02561081014573574]},"seat":[-6.439293542825908e-18,-0.044500000000000005,-0.05]},"ar15m4":{"params":[-0.0595276041209698,-0.1251534476444125,0.040841251280903795,0.55,1.2576283440589902,0.8978802770730107,0.7445742984563112,1.381632097641006,0.6249133405406028,0.7594109278721736,1.0012611226104198,1.388,0.558,1.1298749863468112,1.0252141751125454,0.1,1.005105326972902,1.1,0.41274292139336466,0.6707177762705833],"pose":{"thumb":[0.1,1.005105326972902,1.1,0,0.41274292139336466],"index":[0.05,0.55,1.2576283440589902,0.8978802770730107,0],"middle":[0.1,0.7445742984563112,1.381632097641006,0.6249133405406028,0],"ring":[0.1,0.7594109278721736,1.0012611226104198,1.388,0],"pinky":[0.15,0.558,1.1298749863468112,1.0252141751125454,0]},"bounds":{"min":[-0.012400000356137753,-0.21890082955360413,-0.15774045884609222],"max":[0.012899999506771564,-0.03024968132376671,-0.06899121403694153]},"seat":[4.440892098500626e-18,-0.0335,-0.11000000000000001]},"glock21":{"params":[-0.04630067138671876,-0.07855751991271982,0.08051814203262325,0.55,1.2219999999999998,1.215,0.55,1.6979999999999995,0.7230000000000002,0.6740000000000002,1.553,0.7199999999999998,0.6220000000000001,1.259,1.2439999999999998,0.31000000000000005,1.1,1.04,0.8,0.3360000000000001],"pose":{"thumb":[0.31000000000000005,1.1,1.04,0,0.8],"index":[0.05,0.55,1.2219999999999998,1.215,0],"middle":[0.1,0.55,1.6979999999999995,0.7230000000000002,0],"ring":[0.1,0.6740000000000002,1.553,0.7199999999999998,0],"pinky":[0.15,0.6220000000000001,1.259,1.2439999999999998,0]},"bounds":{"min":[-0.013001000508666039,-0.14176654815673828,-0.049281857907772064],"max":[0.013000342063605785,-0.027348492294549942,0.0379372164607048]},"seat":[-4.218847493575595e-18,-0.0405,-0.024999999999999998]}} /* CONTACT_PROFILES_END */;
  function magazineContactFor(w) {
    const profile = MAG_CONTACT_PROFILES[w.id] || MAG_CONTACT_PROFILES[w.wp.contactProfile];
    if (!profile || !w.magObj) return null;
    let body = null;
    w.magObj.traverse(o => { if (!body && o.isMesh && o.geometry) body = o; });
    if (!body) return null;
    // Exact transformed vertices, not transformed AABB corners: the Glock
    // magazine is raked, and an AABB-of-an-AABB moved the contact frame ~4 mm.
    const box = new THREE.Box3(), v = new THREE.Vector3();
    const toGun = new THREE.Matrix4().multiplyMatrices(w.HM, WK.toRoot(body, w.asm.root));
    const positions = body.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) box.expandByPoint(v.fromBufferAttribute(positions, i).applyMatrix4(toGun));
    const p = profile.params.slice();
    // Adapt wrist placement to the installed magazine rather than assuming
    // all optional magazines have the dimensions of the default one.
    const ref = profile.bounds, seat = profile.seat;
    p[0] -= ((box.max.x - box.min.x) - (ref.max[0] - ref.min[0])) * 0.5;
    p[1] += (box.min.y + box.max.y) * 0.5 - w.magSeat.y
      - ((ref.min[1] + ref.max[1]) * 0.5 - seat[1]);
    p[2] += box.min.z - w.magSeat.z - (ref.min[2] - seat[2]);
    const handInMag = gripMatrix([p[0], p[1], p[2]], [0, Math.sin(p[19]), -Math.cos(p[19])], [-1, 0, 0]);
    return { matrix: handInMag.invert(), pose: VM.clonePose(profile.pose), params: p,
      bounds: { min: box.min.toArray(), max: box.max.toArray() } };
  }

  function createSpec(w) {
    if (w.spec) return w.spec;
    const model = createModel(w);
    const fam = w.fam, pistol = fam === 'pistol';
    const st = w.stats;
    const ads = adsPose(w);
    const poses = pistol ? {
      /* пистолет: компактная изготовка у груди, в прицеле руки вытянуты */
      hip: { pos: [0.08, -0.135, -0.36], rot: [1.5, 1.5, -4] },
      ads: { pos: ads.pos, rot: ads.rot },
      sprint: { pos: [0.12, -0.36, -0.18], rot: [-55, 18, -8] },
      wallTuck: { pos: [0.08, -0.25, -0.12], rot: [-30, 6, -4] }
    } : {
      hip: { pos: [0.075, -0.15, -0.17], rot: [0.57, 0.29, -3] },
      ads: { pos: ads.pos, rot: ads.rot },
      sprint: { pos: [0.10, -0.19, -0.25], rot: [-21, 35, -30] },
      wallTuck: { pos: [0.06, -0.30, -0.06], rot: [-32, 8, -4] }
    };
    const R = recoilFor(w, CONFIG.rifle.recoil);
    if (pistol) {
      /* Пистолет: короткий резкий отход в кисти и заметный подброс ствола вокруг запястья,
         быстрый возврат с лёгким перехлёстом — отдача читается на каждом выстреле. */
      const kS = Math.min(1.35, Math.max(0.75, Math.sqrt(((w.wp.recoil || 1) * (st.recoilV / 100)) / 0.59)));
      Object.assign(R, {
        /* по замерам скоростной съёмки 9x19: подброс 10-15 град. с пиком ~45 мс,
           отход кисти ~3-4 см, возврат прицельных к цели за ~0.2 с с лёгким перехлёстом */
        kickBack: 0.042 * kS, kickUp: 0.016 * kS, pitchDeg: 13 * kS, yawDeg: 2.0 * kS, rollDeg: 3.2 * kS,
        fBack: 10, zBack: 0.5, f: 5.6, z: 0.48, adsScale: 1.0,
        climbDeg: 0.55 * kS, climbYawDeg: 0.2 * kS, recoverDelay: 0.09, recoverRate: 7, recoverFraction: 0.8,
        cameraKick: 0.04 * kS, cameraPitchDeg: 2.4 * kS, cameraRollDeg: 1.1 * kS
      });
    }
    if (fam === 'pump') { R.kickBack *= 1.5; R.pitchDeg *= 1.6; }
    /* характер отдачи конкретного образца: как оружие ведёт себя в руках */
    const RP = RECOIL_PROFILE[w.id];
    if (RP) {
      for (const k in RP) {
        if (k in RECOIL_MUL) { if (R[RECOIL_MUL[k]] !== undefined) R[RECOIL_MUL[k]] *= RP[k]; }
        else R[k] = RP[k];
      }
    }
    w.rprof = RP || {};
    const tuning = Object.assign({}, CONFIG.rifle, {
      poses,
      aimPivot: pistol ? [0.06, -0.24, 0.2] : [0.08, -0.20, 0.12],
      wristPivot: pistol ? [0, -0.075, 0.075] : CONFIG.rifle.wristPivot,
      recoil: R,
      magSize: st.magCap,
      auto: st.modes.includes('auto'),
      fireInterval: 60 / Math.max(30, st.rpm),
      slideCycleTime: fam === 'pump' ? 0.001 : pistol ? Math.min(0.065, 0.9 * 60 / Math.max(300, st.rpm)) : Math.min(0.09, 0.62 * 60 / Math.max(300, st.rpm)),
      tuckDistance: pistol ? 0.8 : Math.min(1.4, 0.75 + (w.muzzleLocal.length() * 0.6))
    });
    const spec = {
      id: w.id, fam, model, tuning,
      rightGrip: rightGripFor(w),
      leftGrip: null,
      hands: Object.assign({}, HANDS),
      magInHand: magInHand(w.wp.magHold || 0.1),
      pouch: pistol ? pouch([-0.12, -0.40, -0.02], [-1.1, 0.25, 0.3]) : pouch([-0.09, -0.38, -0.05], [-1, 0.2, 0.3]),
      shellVel: [[w.ejectDir.x * w.ejectSpeed * 0.8, w.ejectDir.y * w.ejectSpeed * 0.8, w.ejectDir.z * 2 - 0.6], [w.ejectDir.x * w.ejectSpeed * 1.2, w.ejectDir.y * w.ejectSpeed * 1.2, w.ejectDir.z * 2 + 0.2]]
    };
    const contact = magazineContactFor(w);
    if (contact) { spec.magInHand = contact.matrix; spec.hands.mag = contact.pose; spec.magContact = contact; }
    if (pistol) {
      /* опорная кисть слева, пальцы поверх пальцев правой */
      /* Хват «большие пальцы вперёд» (thumbs-forward, стандарт IPSC/полицейских курсов):
         правая кисть высоко под затворной задержкой, перепонка в бобровом хвосте,
         указательный на спуске, большой вдоль левой стороны рамы под затвором;
         левая кисть закрывает свободную щёчку рукоятки основанием ладони, кисть
         опущена вперёд ≈ 45°, пальцы ложатся поверх пальцев правой, большой палец
         под правым и смотрит в цель. Положения кистей получены подгонкой (метод Кабша)
         суставов перчатки к опорным точкам на модели Glock, позы пальцев —
         покоординатным спуском с анатомическими пределами и запретом входить в рамку. */
      spec.rightGrip = gripMatrix([0.0159, -0.0768, 0.0623], [0.194, -0.066, -0.979], [0.932, 0.324, 0.163]);
      if (w.wp.rOff) spec.rightGrip.premultiply(new THREE.Matrix4().makeTranslation(...w.wp.rOff));
      spec.leftGrip = gripMatrix([-0.0397, -0.085, 0.0458], [-0.113, -0.131, -0.985], [-0.99, 0.101, 0.1]);
      if (w.wp.lOff) spec.leftGrip.premultiply(new THREE.Matrix4().makeTranslation(...w.wp.lOff));
      const RT = [0.15, -0.056, 0.453, 0, -0.05], RM = [0.141, 0.619, 1.75, 1.05, 0.22], RR = [0.253, 0.525, 1.75, 1.05, 0.22], RP = [0.284, 0.519, 1.575, 0.945, 0.159];
      spec.hands.trigger = P(RT, [-0.15, 0.041, 1.281, 0.769, 0.22], RM, RR, RP);
      spec.hands.indexed = P(RT, [0, 0, 0.1, 0.05, -0.1], RM, RR, RP);
      spec.hands.magRelease = P(RT, [0, 0.15, 0.45, 0.25, -0.15], RM, RR, RP);
      spec.hands.support = P([0.231, 0.119, 0.144, 0, 0.453], [-0.131, 0.95, 0.878, 0.527, -0.22], [-0.009, 0.897, 1.059, 0.636, -0.22], [-0.047, 1.05, 0.884, 0.531, 0.22], [-0.037, 1.097, 0.716, 0.429, 0.22]);
      pistolTracks(w, spec);
    } else {
      spec.leftGrip = leftGripFor(w);
      const fg = fam === 'pump' ? null : foregripGripFor(w, spec.leftGrip);
      if (fg) {
        spec.leftGrip = fg;
        spec.hands.support = w.fgrip.kind === 'vertical' ? HANDS.vgrip : w.fgrip.kind === 'angled' ? HANDS.afg : HANDS.support;
        spec.foregrip = w.fgrip.kind;
      }
      if (fam === 'pump') {
        spec.tactical = pumpTrack(w, spec, 1, false);
        spec.empty = pumpTrack(w, spec, 1, true);
        spec.pumpTrack = (n, after) => pumpTrack(w, spec, n, after);
        spec.reloadTime = null;
      } else rifleTracks(w, spec);
    }
    spec.leftGrip0 = spec.leftGrip.clone();
    w.spec = spec;
    return spec;
  }

  /* --------------------------------------------- перенос на модель -- */
  function setMech(w, m) {
    const N = w.nodes, A = w.anim, R = w.rest;
    if (N.carrier) N.carrier.position.x = R.carrier - (A.carrierTravel || 80) * (m.slide || 0);
    if (N.forend) N.forend.position.x = R.forend - (A.pumpTravel || 92) * (m.pump || 0);
    if (N.carrier && w.fam === 'pump') N.carrier.position.x = R.carrier - (A.carrierTravel || 92) * Math.max(m.pump || 0, m.slide || 0);
    if (N.handle) {
      N.handle.position.x = R.handle - (A.handleTravel || 92) * (m.handle || 0);
      N.handle.rotation.x = (A.handleLock || 0) * DEG * (m.handleLock || 0);
    }
    if (N.trigger) N.trigger.rotation.z = R.trigger - (A.triggerAngle ?? 0.16) * Math.min(1, m.trigger || 0);
    if (w.charger && w.charger.obj) w.charger.obj.position.x = w.charger.rest - w.charger.travel * (m.charger || 0);
    if (A.portCover && (m.slide || 0) > 0.05) A.portCover.rotation.x = 1.9;
  }

  /* магазин из системы рига (относительно горловины) -> в модель */
  function setMag(w, rel, visible) {
    if (!w.magObj) return;
    w.magObj.visible = visible !== false;
    if (!rel) { w.magObj.matrix.copy(w.magRestLocal); w.magObj.matrix.decompose(w.magObj.position, w.magObj.quaternion, w.magObj.scale); return; }
    const s0 = w.magSeat;
    _m.makeTranslation(s0.x, s0.y, s0.z).multiply(rel).multiply(_m2.makeTranslation(-s0.x, -s0.y, -s0.z));
    /* в систему родителя магазина: P⁻¹·M·P·Mrest */
    const Pm = w.magParentToG;
    const out = new THREE.Matrix4().copy(Pm).invert().multiply(_m).multiply(Pm).multiply(w.magRestLocal);
    out.decompose(w.magObj.position, w.magObj.quaternion, w.magObj.scale);
  }

  /* rig — WeaponRig, rigRootWorld — мировая матрица корня рига */
  const _rel = new THREE.Matrix4();
  function applyToGun(rig, w, rigRootWorld, extra) {
    _m.multiplyMatrices(rigRootWorld, rig.gunMatrix);
    _m.decompose(w.root.position, w.root.quaternion, _s);
    w.root.scale.set(1, 1, 1);
    w.recoilRig.position.set(0, 0, 0);
    w.tiltRig.rotation.set(0, 0, 0);
    const model = rig.gun, x = extra || {};
    let slide = model.slide;
    const tr = rig.reloading && rig.track;
    if (tr && tr.rack) {
      const [a, b, c] = tr.rack, t = rig.reloadT;
      if (t > a && t < c) slide = Math.max(slide, t < b ? (t - a) / (b - a) : 1 - (t - b) / (c - b));
    }
    if (model.locked) slide = 1;
    const mech = { slide, trigger: model.trigger, pump: x.pump || 0, handle: x.handle || 0, handleLock: x.handleLock || 0, charger: x.charger || 0 };
    if (tr && tr.hk) {
      const t = rig.reloadT, H = tr.hk;
      const back = t < H.back[0] ? 0 : t < H.back[1] ? (t - H.back[0]) / (H.back[1] - H.back[0]) : 1;
      const lock = t < H.lock[0] ? 0 : t < H.lock[1] ? (t - H.lock[0]) / (H.lock[1] - H.lock[0]) : 1;
      const rel = t >= H.slap ? Math.max(0, 1 - (t - H.slap) / 0.06) : 1;
      mech.handle = back * rel; mech.handleLock = lock * (t >= H.slap ? 0 : 1);
      mech.slide = Math.max(mech.slide, mech.handle);
    }
    if (tr && tr.pump) {
      const t = rig.reloadT, [a, b, c] = tr.pump;
      if (t > a && t < c) mech.pump = t < b ? (t - a) / (b - a) : 1 - (t - b) / (c - b);
    }
    setMech(w, mech);
    if (w.magObj) {
      const mg = model.magazine;
      _rel.compose(mg.position, mg.quaternion, _s.set(1, 1, 1));
      setMag(w, _rel, mg.visible);
    }
    w.root.updateMatrixWorld(true);
  }

  function rigGunWorld(w, out) {
    w.gun.updateMatrixWorld(true);
    return out.copy(w.gun.matrixWorld);
  }

  function dispose(w) {
    if (!w) return;
    if (w.root.parent) w.root.parent.remove(w.root);
    w.root.traverse((o) => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  }

  /* v9: марка коллиматора рисуется прямо в стекле линзы. Для каждого
     пикселя стекла берём направление взгляда (камера → пиксель) и его угол
     относительно оси прицела: марка «висит на бесконечности», как у
     настоящего коллиматора (Aimpoint, EOTech) — без параллакса, всегда там,
     куда смотрит ствол, обрезается оправой, ведёт себя одинаково под линзой
     бодикама, в наклоне и при отдаче (раньше это был отдельный DOM-слой
     поверх кадра — с запаздыванием и мимо искажений). */
  const _rD = new THREE.Vector3(), _rU = new THREE.Vector3();
  /* v26: параметры сетки по id (меняется клавишей «Сетка прицела»), текстуры — по цвету */
  const RET_CACHE = new Map();
  function retLens(id) {
    let R = RET_CACHE.get(id);
    if (R) return R;
    const def = WK.RETICLES[id] || WK.RETICLES.dot2;
    const prims = def.build({});
    const dotOnly = prims && prims.length && prims.every((q) => q[0] === 'D');
    const boost = def.boost || 1;
    R = { id, def, boost, tex: new Map(),
      dotR: dotOnly ? Math.max(...prims.map((q) => q[3])) * boost : 0,          // MOA
      half: def.field * 0.2909e-3 * boost * 0.5 };                               // рад (тангенс)
    RET_CACHE.set(id, R);
    return R;
  }
  function retTex(R, col) {
    let t = R.tex.get(col);
    if (!t) {
      t = WK.reticleTexture(R.id, col, {});
      t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
      R.tex.set(col, t);
    }
    return t;
  }
  function lensReticle(sg, gun) {
    const L = sg.lens;
    if (!L || !L.isMesh || !sg.reticle || (sg.mag || 1) > 1.01 || !WK.reticleTexture || !WK.RETICLES) return;
    const def0 = WK.RETICLES[sg.retId] || WK.RETICLES[WK.reticleSet(sg.reticle)[0]] || WK.RETICLES.dot2;
    if (!def0 || def0.mag) return;
    let R = retLens(WK.RETICLES[sg.retId] ? sg.retId : WK.reticleSet(sg.reticle)[0]);
    const mat = L.material.clone();
    L.material = mat;
    const UN = { uRetTex: { value: retTex(R, retColorOf(sg)) }, uRetD: { value: new THREE.Vector3(0, 0, -1) }, uRetU: { value: new THREE.Vector3(0, 1, 0) },
      uRetHalf: { value: R.half }, uRetI: { value: 1.8 } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, UN);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uRetTex; uniform vec3 uRetD, uRetU; uniform float uRetHalf, uRetI;')
        .replace('#include <dithering_fragment>', `{
          vec3 vd = normalize(-vViewPosition); float cz = dot(vd, uRetD);
          if (cz > 0.95) {
            vec3 Rr = normalize(cross(uRetD, uRetU)), Uu = cross(Rr, uRetD);
            vec2 ruv = vec2(dot(vd, Rr), dot(vd, Uu)) / cz / (2.0 * uRetHalf) + 0.5;
            if (ruv.x > 0.0 && ruv.y > 0.0 && ruv.x < 1.0 && ruv.y < 1.0) {
              vec4 rt = texture2D(uRetTex, ruv);
              /* v26: ядро марки — полностью и ярче фона (после тонмаппинга точка «горела» не ярче
                 освещённой стены — «слабая точка»), ореол — мягче, но заметнее прежнего */
              float ra = max(rt.a * rt.a, smoothstep(0.55, 0.95, rt.a));
              gl_FragColor.rgb = mix(gl_FragColor.rgb, rt.rgb * uRetI, ra);
              gl_FragColor.a = max(gl_FragColor.a, ra);
            }
          }
        }
        #include <dithering_fragment>`);
    };
    mat.customProgramCacheKey = () => 'aegis-lens-reticle-v26';
    L.renderOrder = Math.max(L.renderOrder || 0, 11);
    /* направление оси и «верх» марки — в системе камеры, каждый кадр;
       точка не меньше ~1,8 px радиусом (2 MOA на 1080p — меньше пикселя) */
    L.onBeforeRender = (r, sc, cam) => {
      _rD.copy(sg.dirG).transformDirection(gun.matrixWorld).transformDirection(cam.matrixWorldInverse);
      _rU.copy(sg.upG).transformDirection(gun.matrixWorld).transformDirection(cam.matrixWorldInverse);
      if (R.id !== sg.retId && WK.RETICLES[sg.retId] && !WK.RETICLES[sg.retId].mag) R = retLens(sg.retId);
      UN.uRetTex.value = retTex(R, retColorOf(sg));
      UN.uRetD.value.copy(_rD); UN.uRetU.value.copy(_rU);
      /* яркость: днём светодиод заметно ярче освещённого фона, ночью — без ослепляющего ореола */
      const dk = globalThis.AEGIS_DAYK;
      UN.uRetI.value = 1.6 + 3.4 * (dk === undefined ? 1 : dk);
      let k = 1;
      if (R.dotR > 0 && cam.isPerspectiveCamera) {
        const hpx = (r.domElement.height || 1080) * (globalThis.AEGIS_RS || 1);
        const ppu = hpx / (2 * Math.tan(cam.fov * Math.PI / 360)) * 2.909e-4;
        const px = (R.dotR / R.boost) * ppu, want = 1.8 * (r.getPixelRatio ? r.getPixelRatio() : 1) * (globalThis.AEGIS_RS || 1);
        if (px < want) k = Math.min(6, want / px);
      }
      UN.uRetHalf.value = R.half * k;
    };
    sg.lensRet = true;
  }

  /* сетка прицела в SVG под текущее поле зрения (px на угловую минуту) */
  /* screenH — высота экрана: масштаб MOA считается по реальному полю зрения, даже если SVG рисуется в малом боксе */
  function reticleMarkup(sight, fovDeg, W, H, zoom, screenH, hot) {
    if (!sight || !sight.retId) return '';
    let ppu = (screenH || H) / 2 / Math.tan(fovDeg * Math.PI / 360) * Math.tan(Math.PI / 10800);
    if (sight.zoom && zoom) ppu *= sight.zoom[1] / Math.max(1, zoom);
    /* v26: у коллиматора за увеличителем точка «горячая» (яркая, не меньше ~2,4 px), как в стекле */
    const def = WK.RETICLES[sight.retId];
    const hotDot = !!hot || !!(sight.magnifier && def && !def.mag);
    return WK.reticleSVG(sight.retId, { ppu, color: retColorOf(sight), ctx: {}, W, H, hot: hotDot, minDot: Math.max(2.4, (screenH || H) / 400) });
  }

  return { WP, NAMES, AMMO, G0, RECOIL_PROFILE, build, setSight, createSpec, createModel, applyToGun, setMech, setMag, rigGunWorld, dispose, computeSights, reticleMarkup, adsPose, pumpTrack, HANDS,
    nextSight, toggleMagnifier, flipMagnifier, tickFlip, cycleReticle, cycleReticleColor, retColorOf };
});
