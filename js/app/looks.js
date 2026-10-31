/* ==========================================================================
   AEGIS v26 · редактор «Внешний вид» (главное меню и Esc → «Внешний вид»).
   Образ каждого из четырёх пресетов бойцов (генерал и боты той же формы):
   китель / тельняшка, брюки, головной убор и его чехол, балаклава, тип
   брони, цвета снаряжения, обувь, перчатки, наколенники, маскировка
   (накидка или кикимора), плюс цвета повязок команд. Хранится в
   localStorage 'aegis.looks.v1'; игра применяет его при сборке бойцов
   (29_game.js → GChar.applyLooks) и на лету (G.reskin).
   Превью — боец на подиуме с орбитальной камерой, рисуется тем же
   WebGL-рендерером, что и игра (G.setPreview), и только когда что-то
   изменилось: на слабом ПК редактор почти не нагружает видеокарту.
   ========================================================================== */
(function (root) {
  'use strict';
  const KEY = 'aegis.looks.v1';
  const ORDER = ['delta_1', 'delta_2', 'alpha_1', 'alpha_2'];
  const UNIT = {
    delta_1: { team: 'delta', name: 'Дельта-1', call: 'Кедр' },
    delta_2: { team: 'delta', name: 'Дельта-2', call: 'Сойка' },
    alpha_1: { team: 'alpha', name: 'Альфа-1', call: 'Ворон' },
    alpha_2: { team: 'alpha', name: 'Альфа-2', call: 'Тис' }
  };
  const TEAM = { delta: 'Дельта', alpha: 'Альфа' };
  /* повязки команд (опознавание своих) */
  const BANDS = {
    red: { name: 'Красная', hex: '#9a1612' }, black: { name: 'Чёрная', hex: '#0d0e10' },
    blue: { name: 'Синяя', hex: '#1f4596' }, yellow: { name: 'Жёлтая', hex: '#c9a315' },
    white: { name: 'Белая', hex: '#d9d9d3' }, green: { name: 'Зелёная', hex: '#2e6a2a' },
    orange: { name: 'Оранжевая', hex: '#c8581b' }
  };
  const DEF_BAND = { delta: 'red', alpha: 'black' };
  /* палитры (sRGB): ткань снаряжения, фурнитура и шлем, балаклава, обувь, перчатки */
  const COLS = {
    gear: [['Олива', [96, 90, 64]], ['Рейнджер-грин', [70, 78, 58]], ['Койот', [124, 102, 74]], ['Хаки', [132, 122, 92]],
      ['Серо-зелёный', [88, 90, 74]], ['Тёмно-зелёный', [46, 54, 42]], ['Серый', [90, 92, 92]], ['Чёрный', [42, 44, 48]], ['Светло-серый', [168, 170, 168]]],
    hard: [['Чёрный', [36, 37, 40]], ['Олива', [58, 56, 44]], ['Койот', [96, 82, 62]], ['Серый', [72, 74, 74]], ['Тёмно-зелёный', [48, 52, 44]], ['Песочный', [140, 124, 96]], ['Белый', [200, 202, 200]]],
    mask: [['Чёрная', [30, 30, 33]], ['Олива', [52, 56, 40]], ['Серо-зелёная', [62, 66, 54]], ['Койот', [110, 94, 72]], ['Серая', [84, 86, 86]], ['Белая', [196, 198, 196]]],
    boot: [['Койот', [112, 92, 66]], ['Песочные', [150, 128, 96]], ['Коричневые', [86, 64, 46]], ['Олива', [80, 78, 58]], ['Серые', [92, 92, 90]], ['Чёрные', [44, 44, 47]]],
    glove: [['Койот', [108, 94, 77]], ['Олива', [76, 78, 60]], ['Тёмно-зелёные', [54, 58, 48]], ['Песочные', [150, 134, 106]], ['Серые', [92, 92, 92]], ['Чёрные', [40, 40, 42]], ['Белые', [200, 200, 196]]]
  };
  /* перчатки GLB-рук без оттенка — койот (14_character.js: GLOVE_BASE) */
  const GLOVE_BASE = [108, 94, 77];
  const ARMOR = [
    { id: 'plate', name: 'Плитоноска', about: 'Плиты Бр4/Бр5 спереди и сзади, мягкий пакет, 6 подсумков, рация, аптечка' },
    { id: 'slick', name: 'Облегчённая', about: 'Те же плиты, MOLLE без подсумков — тоньше силуэт' },
    { id: 'soft', name: 'Мягкий бронежилет', about: 'Только Бр2: держит осколки и пистолет, автомат — нет' },
    { id: 'none', name: 'Без брони', about: 'Только ремень. Любое попадание в корпус — по телу' }
  ];
  const HEADS = [
    { id: 'helmet', name: 'Шлем', about: 'Защищает от осколков и касательных' },
    { id: 'boonie', name: 'Панама', about: 'Без защиты, мягкий силуэт' },
    { id: 'none', name: 'Без убора', about: 'Без защиты' }
  ];
  const COVERS = [
    { id: 'none', name: 'Нет', about: 'Без маскировки' },
    { id: 'net', name: 'Накидка', about: 'Маскировочная сеть на голову и плечи' },
    { id: 'ghillie', name: 'Кикимора', about: 'Лоскуты и нити по всему телу, ломает силуэт' }
  ];
  /* готовые комплекты */
  const SETS = [
    { id: 'assault', name: 'Штурмовик', look: { top: 'multicam', bottom: 'multicam', head: 'helmet', headCover: 'multicam', armor: 'plate', mask: false, gearCol: [124, 102, 74], hardCol: [96, 82, 62], gloveCol: [108, 94, 77], bootCol: [112, 92, 66], kneePads: true, padCol: [96, 82, 62], cover: 'none' } },
    { id: 'scout', name: 'Разведчик', look: { top: 'flora', bottom: 'flora', head: 'boonie', headCover: 'flora', armor: 'slick', mask: true, maskCol: [52, 56, 40], gearCol: [96, 90, 64], gloveCol: [76, 78, 60], bootCol: [86, 64, 46], kneePads: false, cover: 'ghillie', coverCol: 'forest' } },
    { id: 'black', name: 'Спецназ', look: { top: 'black', bottom: 'black', head: 'helmet', headCover: 'black', armor: 'plate', mask: true, maskCol: [30, 30, 33], gearCol: [42, 44, 48], hardCol: [36, 37, 40], gloveCol: [40, 40, 42], bootCol: [44, 44, 47], kneePads: true, padCol: [36, 37, 40], cover: 'none' } },
    { id: 'vdv', name: 'Десант', look: { top: 'tel_blue', bottom: 'emr', head: 'boonie', headCover: 'emr', armor: 'soft', mask: false, gearCol: [96, 90, 64], gloveCol: [40, 40, 42], bootCol: [44, 44, 47], kneePads: false, cover: 'none' } },
    { id: 'desert', name: 'Пустыня', look: { top: 'desert', bottom: 'desert', head: 'helmet', headCover: 'desert', armor: 'plate', mask: false, gearCol: [132, 122, 92], hardCol: [140, 124, 96], gloveCol: [150, 134, 106], bootCol: [150, 128, 96], kneePads: true, padCol: [140, 124, 96], cover: 'none' } },
    { id: 'winter', name: 'Зима', look: { top: 'winter', bottom: 'winter', head: 'helmet', headCover: 'winter', armor: 'plate', mask: true, maskCol: [196, 198, 196], gearCol: [168, 170, 168], hardCol: [200, 202, 200], gloveCol: [200, 200, 196], bootCol: [44, 44, 47], kneePads: false, cover: 'net', coverCol: 'winter' } },
    { id: 'light', name: 'Налегке', look: { top: 'olive', bottom: 'ranger', head: 'boonie', headCover: 'olive', armor: 'none', mask: false, gearCol: [96, 90, 64], kneePads: false, cover: 'none' } },
    /* v26: бельё — «вообще всё снять» */
    { id: 'pt', name: 'Физо', look: { top: 'tee_olive', bottom: 'shorts_black', head: 'none', armor: 'none', mask: false, gearCol: [42, 44, 48], bootCol: [44, 44, 47], kneePads: false, cover: 'none' } },
    { id: 'strip', name: 'Снять всё', look: { top: 'bare', bottom: 'briefs_black', head: 'none', armor: 'none', mask: false, kneePads: false, cover: 'none' } }
  ];

  /* ----------------------------------------------------- хранение --- */
  const isCol = (c) => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isFinite(v) && v >= 0 && v <= 255);
  const STR = ['top', 'bottom', 'headCover', 'cover', 'coverCol'];
  const COLF = ['gearCol', 'hardCol', 'maskCol', 'bootCol', 'gloveCol', 'padCol'];
  function normLook(L) {
    const o = {};
    if (!L || typeof L !== 'object') return o;
    for (const k of STR) if (typeof L[k] === 'string' && L[k].length < 40) o[k] = L[k];
    for (const k of COLF) if (isCol(L[k])) o[k] = L[k].map(Math.round);
    if (HEADS.some((h) => h.id === L.head)) o.head = L.head;
    if (ARMOR.some((a) => a.id === L.armor)) o.armor = L.armor;
    if (typeof L.mask === 'boolean') o.mask = L.mask;
    if (typeof L.kneePads === 'boolean') o.kneePads = L.kneePads;
    return o;
  }
  function norm(d) {
    const out = { v: 1, units: {}, team: {} };
    const U = d && d.units && typeof d.units === 'object' ? d.units : {};
    for (const k of ORDER) { const L = normLook(U[k]); if (Object.keys(L).length) out.units[k] = L; }
    for (const t of ['delta', 'alpha']) {
      const b = d && d.team && d.team[t] && d.team[t].band;
      out.team[t] = { band: BANDS[b] ? b : DEF_BAND[t] };
    }
    return out;
  }
  function load() {
    try { return norm(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return norm({}); }
  }
  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(norm(d))); return true; } catch (e) { return false; }
  }

  /* ------------------------------------------------------ превью --- */
  /* Боец на подиуме: свет «студии» (ключевой с тенью, контровой, небо),
     окружение RoomEnvironment. Сцена живёт между открытиями редактора,
     боец — только пока окно открыто. */
  function Preview(THREE, R) {
    this.T = THREE; this.R = R;
    const scene = (this.scene = new THREE.Scene());
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
    const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#454c54'); gr.addColorStop(0.6, '#2a2e33'); gr.addColorStop(1, '#17191c');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const bg = (this.bg = new THREE.CanvasTexture(cv));
    if ('colorSpace' in bg) bg.colorSpace = THREE.SRGBColorSpace;
    scene.background = bg;
    try {
      const pm = new THREE.PMREMGenerator(R);
      this.env = pm.fromScene(new root.__ADDONS.RoomEnvironment(), 0.04).texture;
      pm.dispose();
      scene.environment = this.env;
      scene.environmentIntensity = 0.4;
    } catch (e) { this.env = null; }
    const key = (this.key = new THREE.DirectionalLight(0xfff1dc, 2.5));
    key.position.set(-2.4, 4.6, -3.4); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera; sc.left = sc.bottom = -1.3; sc.right = sc.top = 1.3; sc.near = 0.5; sc.far = 12;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.012;
    const rim = new THREE.DirectionalLight(0xc8d6ff, 1.25); rim.position.set(2.8, 3.0, 3.6);
    scene.add(key, key.target, rim, new THREE.HemisphereLight(0xcfd8e6, 0x4a4136, 0.8));
    /* подиум: тёмный диск с мягким светлым пятном и тонким кольцом */
    const gc = document.createElement('canvas'); gc.width = gc.height = 256;
    const gg = gc.getContext('2d'), rg = gg.createRadialGradient(128, 128, 8, 128, 128, 128);
    rg.addColorStop(0, '#5d5a54'); rg.addColorStop(0.55, '#3d3c39'); rg.addColorStop(1, '#1d1e20');
    gg.fillStyle = rg; gg.fillRect(0, 0, 256, 256);
    const gt = (this.gt = new THREE.CanvasTexture(gc));
    if ('colorSpace' in gt) gt.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(2.6, 64), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.94, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.02, 1.035, 96), new THREE.MeshBasicMaterial({ color: 0xe8c36a, transparent: true, opacity: 0.35, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002;
    scene.add(ground, ring);
    this.statics = [ground, ring];
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.05, 40);
    this.V = { yaw: 0.5, pitch: 0.05, dist: 4.4, cy: 0.94 };
    this.goal = Object.assign({}, this.V);
    this.ch = null; this.rig = null; this.band = null; this.bandMats = {};
    this.dirty = true; this.panel = 0; this.exposure = 1.0;
  }
  const FOCUS = {
    full: { dist: 4.4, cy: 0.94, pitch: 0.05 },
    torso: { dist: 2.35, cy: 1.3, pitch: 0.05 },
    head: { dist: 1.1, cy: 1.7, pitch: 0.03 },
    legs: { dist: 2.1, cy: 0.55, pitch: 0.12 }
  };
  Preview.prototype.focus = function (name) {
    const F = FOCUS[name] || FOCUS.full;
    const K = (this.ch && this.ch.scale) || 1;
    Object.assign(this.goal, { dist: F.dist, cy: F.cy * K, pitch: F.pitch });
    this.dirty = true;
  };
  Preview.prototype.pose = function () {
    const ch = this.ch, b = ch.bone;
    for (const bn of ch.bones) bn.rotation.set(0, 0, 0);
    if (ch.rest && ch.rest.hips) b('hips').position.fromArray(ch.rest.hips);
    if (root.GRig && this.rig) root.GRig.applyBasePose(this.rig, {});
    for (const side of [1, -1]) {
      const SS = side > 0 ? 'R' : 'L';
      b('shoulder' + SS).rotation.set(0, side * 0.18, -side * 1.25);
      b('elbow' + SS).rotation.set(0, side * 0.35, 0);
      b('wrist' + SS).rotation.set(0, 0, side * 0.1);
    }
    ch.root.updateMatrixWorld(true);
  };
  /* повязка на левом плече — как в игре (29_game.js: addArmband) */
  Preview.prototype.setBand = function (id) {
    const T = this.T, ch = this.ch;
    if (!ch) return;
    let m = this.bandMats[id];
    if (!m) m = this.bandMats[id] = new T.MeshStandardMaterial({ color: new T.Color((BANDS[id] || BANDS.black).hex), roughness: id === 'black' ? 0.9 : 0.86, metalness: 0, side: T.DoubleSide });
    if (!this.band) {
      const sh = ch.bone('shoulderL'), el = ch.bone('elbowL');
      if (!sh || !el) return;
      const k = ch.scale || 1, len = el.position.length();
      const band = new T.Mesh(new T.CylinderGeometry(0.0655 * k, 0.0625 * k, 0.085 * k, 22, 1, true), m);
      band.castShadow = true; band.receiveShadow = true;
      const ax = el.position.clone().normalize();
      band.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), ax);
      band.position.copy(ax).multiplyScalar(len * 0.36);
      sh.add(band);
      this.band = band;
    }
    this.band.material = m;
    this.dirty = true;
  };
  Preview.prototype.drop = function () {
    const ch = this.ch, CH = root.GChar;
    if (!ch) return;
    this.scene.remove(ch.root);
    try { CH.disposeLook({ meshes: ch.meshes, materials: ch.materials }); } catch (e) { /* */ }
    if (ch.hands) for (const s in ch.hands) { const h = ch.hands[s]; if (h && h.material) h.material.dispose(); }
    if (this.band) { this.band.geometry.dispose(); this.band = null; }
    try { if (ch.skeleton && ch.skeleton.dispose) ch.skeleton.dispose(); } catch (e) { /* */ }
    this.ch = null; this.rig = null;
  };
  /* боец пресета key в образе look: тот же пресет — новые сетки на старом скелете */
  Preview.prototype.set = function (key, look, band) {
    const T = this.T, CH = root.GChar;
    const P = CH.withLook(key, look);
    const t0 = performance.now();
    if (this.ch && this.ch.key === key) {
      const old = CH.restyle(T, this.ch, P);
      if (old) try { CH.disposeLook(old); } catch (e) { /* */ }
    } else {
      this.drop();
      const ch = (this.ch = CH.build(T, key, P));
      this.rig = root.GRig ? new root.GRig.Rig(T, ch) : null;
      this.scene.add(ch.root);
      this.pose();
      this.focus(this.lastFocus || 'full');
      Object.assign(this.V, { cy: this.goal.cy });
    }
    this.ch.root.updateMatrixWorld(true);
    this.setBand(band);
    this.buildMs = performance.now() - t0;
    this.dirty = true;
  };
  Preview.prototype.compile = function () {
    const R = this.R;
    this.place();
    if (!R.compileAsync) return Promise.resolve();
    return R.compileAsync(this.scene, this.cam).catch(() => { /* соберётся при первом кадре */ });
  };
  Preview.prototype.place = function () {
    const V = this.V, cam = this.cam, el = this.R.domElement;
    const W = el.clientWidth || innerWidth, H = el.clientHeight || innerHeight;
    const cx = Math.sin(V.yaw) * V.dist * Math.cos(V.pitch), cz = -Math.cos(V.yaw) * V.dist * Math.cos(V.pitch);
    cam.position.set(cx, V.cy + Math.sin(V.pitch) * V.dist, cz);
    cam.lookAt(0, V.cy, 0);
    cam.aspect = W / Math.max(1, H);
    /* боец — по центру свободной от панели части экрана */
    const off = Math.min(this.panel, W * 0.5) / 2;
    if (off > 0) cam.setViewOffset(W, H, -off, 0, W, H); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  };
  /* кадр: камера плавно идёт к цели; рисуем только по изменению */
  Preview.prototype.frame = function (dt) {
    const V = this.V, G = this.goal;
    const k = 1 - Math.exp(-Math.min(dt || 0.016, 0.1) * 9);
    let moving = false;
    for (const f of ['dist', 'cy', 'pitch', 'yaw']) {
      const d = G[f] - V[f];
      if (Math.abs(d) > 1e-4) { V[f] += d * k; moving = true; } else V[f] = G[f];
    }
    if (!moving && !this.dirty) return false;
    this.dirty = false;
    this.render();
    return true;
  };
  Preview.prototype.render = function () {
    const R = this.R, T = this.T;
    this.place();
    const s = { ac: R.autoClear, ex: R.toneMappingExposure, au: R.shadowMap.autoUpdate, rt: R.getRenderTarget(), sc: R.getScissorTest() };
    R.setRenderTarget(null);
    R.setScissorTest(false);
    R.autoClear = true;
    R.toneMappingExposure = this.exposure;
    R.shadowMap.autoUpdate = true;
    try { R.render(this.scene, this.cam); }
    finally {
      R.autoClear = s.ac; R.toneMappingExposure = s.ex; R.shadowMap.autoUpdate = s.au;
      R.setRenderTarget(s.rt); R.setScissorTest(s.sc);
    }
    void T;
  };

  /* ------------------------------------------------------ окно --- */
  const E = { el: null, opts: null, key: 'delta_1', tab: 'form', data: null, dirty: new Set(), bandDirty: false, pv: null, t: 0, saveT: 0, thumbs: new Map() };
  const CSS = `
#look{position:fixed;inset:0;z-index:34;display:none}
#look.on{display:block}
#look .lk-stage{position:absolute;inset:0;cursor:grab;touch-action:none}
#look .lk-stage.drag{cursor:grabbing}
#look .lk-panel{position:absolute;left:18px;top:18px;bottom:18px;width:380px;max-width:calc(100vw - 36px);display:flex;flex-direction:column;overflow:hidden;background:rgba(14,16,20,.74)}
#look .lk-head{display:flex;align-items:center;gap:10px;padding:14px 16px 10px}
#look .lk-back{padding:7px 10px;border-radius:8px;border:1px solid var(--line2,rgba(255,255,255,.24));background:rgba(255,255,255,.05);cursor:pointer;font-size:12.5px}
#look .lk-title{font:700 17px/1 var(--f,sans-serif);letter-spacing:.08em}
#look .lk-saved{margin-left:auto;font-size:11.5px;color:var(--acc,#e8c36a);opacity:0;transition:opacity .3s}
#look .lk-saved.on{opacity:1}
#look .lk-units{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:0 16px}
#look .lk-unit{padding:7px 7px 8px;border-radius:9px;border:1px solid var(--line,rgba(255,255,255,.13));background:rgba(255,255,255,.04);cursor:pointer;text-align:left;min-width:0}
#look .lk-unit i{display:block;height:3px;border-radius:2px;margin-bottom:6px}
#look .lk-unit b{display:block;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#look .lk-unit small{display:block;font-size:10.5px;color:var(--tx3,#868c94)}
#look .lk-unit.on{border-color:var(--acc,#e8c36a);background:var(--acc2,rgba(232,195,106,.16))}
#look .lk-note{padding:7px 16px 0;font-size:11px;color:var(--tx3,#868c94);line-height:1.4}
#look .lk-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:10px 16px 8px;border-bottom:1px solid var(--line,rgba(255,255,255,.13))}
#look .lk-tabs button{padding:6px 9px;border-radius:8px;border:1px solid transparent;background:transparent;font-size:12px;font-weight:600;color:var(--tx2,#b9bec5);cursor:pointer}
#look .lk-tabs button:hover{background:rgba(255,255,255,.06);color:#fff}
#look .lk-tabs button.on{background:var(--acc2,rgba(232,195,106,.16));border-color:rgba(232,195,106,.5);color:#fff}
#look .lk-body{flex:1;overflow:auto;padding:4px 16px 12px;scrollbar-width:thin;scrollbar-color:#454b53 transparent}
#look .lk-sec{margin:12px 0 4px}
#look .lk-cap{display:flex;justify-content:space-between;gap:8px;font:700 10.5px/1.2 var(--f,sans-serif);letter-spacing:.14em;text-transform:uppercase;color:var(--tx3,#868c94);margin-bottom:8px}
#look .lk-cap em{font-style:normal;letter-spacing:.01em;text-transform:none;color:var(--tx2,#b9bec5);font-weight:600;text-align:right}
#look .lk-sw{display:flex;flex-wrap:wrap;gap:6px}
#look .lk-sw button{width:36px;height:36px;border-radius:8px;border:2px solid rgba(255,255,255,.14);background-size:cover;background-position:center;cursor:pointer;position:relative;padding:0}
#look .lk-sw button:hover{border-color:rgba(255,255,255,.45)}
#look .lk-sw button.on{border-color:var(--acc,#e8c36a);box-shadow:0 0 0 2px rgba(232,195,106,.35)}
#look .lk-sw button.base::after{content:'↺';position:absolute;right:2px;bottom:0;font-size:11px;line-height:1;color:#fff;text-shadow:0 0 3px #000,0 0 2px #000}
#look .lk-sw button.txt{width:auto;padding:0 10px;font-size:11.5px;font-weight:600;background:rgba(255,255,255,.05);color:var(--tx2,#b9bec5)}
#look .lk-sw button.txt.on{color:#fff;background:var(--acc2,rgba(232,195,106,.16))}
#look .lk-opts{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#look .lk-opts.c3{grid-template-columns:1fr 1fr 1fr}
#look .lk-opt{text-align:left;padding:8px 10px;border-radius:9px;border:1px solid var(--line,rgba(255,255,255,.13));background:rgba(255,255,255,.04);cursor:pointer}
#look .lk-opt:hover{border-color:rgba(255,255,255,.35)}
#look .lk-opt b{display:block;font-size:12.5px}
#look .lk-opt small{display:block;font-size:10.5px;color:var(--tx3,#868c94);margin-top:3px;line-height:1.3}
#look .lk-opt.on{border-color:var(--acc,#e8c36a);background:var(--acc2,rgba(232,195,106,.16))}
#look .lk-sub{font-size:11px;font-weight:600;color:var(--tx3,#868c94);margin:9px 0 5px}
#look .lk-sub:first-of-type{margin-top:2px}
#look .lk-hintx{font-size:11px;color:var(--tx3,#868c94);line-height:1.4;margin-top:8px}
#look .lk-foot{display:flex;gap:6px;padding:12px 16px;border-top:1px solid var(--line,rgba(255,255,255,.13))}
#look .lk-foot button{flex:1;padding:10px 6px;border-radius:9px;border:1px solid var(--line2,rgba(255,255,255,.24));background:rgba(255,255,255,.06);font-size:12px;font-weight:600;cursor:pointer}
#look .lk-foot button:hover{background:rgba(255,255,255,.12)}
#look .lk-foot button.ok{background:var(--red2,rgba(224,49,60,.86));border-color:var(--red,#e0313c);color:#fff}
#look .lk-cam{position:absolute;right:18px;bottom:18px;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none}
#look .lk-cam .row{display:flex;gap:6px;pointer-events:auto}
#look .lk-cam button{padding:7px 11px;border-radius:8px;border:1px solid var(--line2,rgba(255,255,255,.24));background:rgba(14,16,20,.62);font-size:12px;cursor:pointer;color:var(--tx2,#b9bec5)}
#look .lk-cam button.on{border-color:var(--acc,#e8c36a);color:#fff}
#look .lk-hint{font-size:11px;color:rgba(255,255,255,.62);text-shadow:0 1px 6px #000}
#look .lk-busy{position:absolute;right:18px;top:18px;padding:7px 12px;border-radius:8px;background:rgba(14,16,20,.72);font-size:12px;color:var(--acc,#e8c36a);opacity:0;transition:opacity .2s;pointer-events:none}
#look .lk-busy.on{opacity:1}
#look .lk-who{position:absolute;right:18px;top:18px;text-align:right;pointer-events:none;text-shadow:0 1px 8px rgba(0,0,0,.9)}
#look .lk-who b{display:block;font:700 15px/1.2 var(--f,sans-serif);letter-spacing:.06em}
#look .lk-who span{display:block;font-size:11.5px;color:rgba(255,255,255,.7);margin-top:3px}
#look .lk-busy.on + .lk-who{opacity:0}
body.st-look #hud,body.st-look #prompt,body.st-look #tag,body.st-look #wasd,body.st-look #reticle,body.st-look #fps{display:none}
@media (max-height:560px){#look .lk-panel{top:10px;bottom:10px}#look .lk-head{padding:10px 14px 8px}#look .lk-tabs{padding:8px 14px 6px}#look .lk-note{display:none}#look .lk-unit{padding:5px 7px 6px}}
`;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const rgb = (c) => 'rgb(' + c.join(',') + ')';
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function ensureDom() {
    if (E.el) return E.el;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = (E.el = h('div', '', `
<div class="lk-stage"></div>
<div class="lk-panel glass">
  <div class="lk-head"><button class="lk-back" data-act="back">← Назад</button><div class="lk-title">ВНЕШНИЙ ВИД</div><div class="lk-saved">Сохранено</div></div>
  <div class="lk-units"></div>
  <div class="lk-note">Образ пресета носят генерал и бойцы-боты той же формы.</div>
  <div class="lk-tabs"></div>
  <div class="lk-body"></div>
  <div class="lk-foot"><button data-act="team" title="Тот же образ напарнику по команде">На всю команду</button><button data-act="reset" title="Вернуть исходный вид этого пресета">Сбросить</button><button class="ok" data-act="back">Готово</button></div>
</div>
<div class="lk-busy">Подготовка модели…</div>
<div class="lk-who"></div>
<div class="lk-cam"><div class="row"></div><div class="lk-hint">ЛКМ — вращать · ПКМ — вверх/вниз · колесо — ближе</div></div>`));
    el.id = 'look';
    document.body.appendChild(el);
    el.querySelector('.lk-foot').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'back') close();
      else if (b.dataset.act === 'reset') resetUnit();
      else if (b.dataset.act === 'team') copyTeam();
    });
    el.querySelector('.lk-back').onclick = () => close();
    const row = el.querySelector('.lk-cam .row');
    for (const [id, name] of [['full', 'В рост'], ['torso', 'Торс'], ['head', 'Голова'], ['legs', 'Ноги']]) {
      const b = h('button', '', name); b.dataset.f = id;
      b.onclick = () => { if (E.pv) { E.pv.lastFocus = id; E.pv.focus(id); } syncCam(); };
      row.appendChild(b);
    }
    /* орбита: ЛКМ — поворот, ПКМ — высота, колесо — расстояние, двойной клик — в рост */
    const stage = el.querySelector('.lk-stage');
    let drag = 0, px = 0, py = 0;
    stage.addEventListener('pointerdown', (e) => { drag = e.button === 2 ? 2 : 1; px = e.clientX; py = e.clientY; stage.classList.add('drag'); try { stage.setPointerCapture(e.pointerId); } catch (x) { /* */ } });
    stage.addEventListener('pointerup', (e) => { drag = 0; stage.classList.remove('drag'); try { stage.releasePointerCapture(e.pointerId); } catch (x) { /* */ } });
    stage.addEventListener('pointermove', (e) => {
      if (!drag || !E.pv) return;
      const G = E.pv.goal, dx = e.clientX - px, dy = e.clientY - py;
      px = e.clientX; py = e.clientY;
      if (drag === 1) { G.yaw += dx * 0.008; G.pitch = Math.max(-0.5, Math.min(1.2, G.pitch + dy * 0.005)); }
      else G.cy = Math.max(0.15, Math.min(1.95, G.cy + dy * 0.003 * G.dist));
      E.pv.V.yaw = G.yaw; E.pv.V.pitch = G.pitch;    // вращение — без запаздывания
      E.pv.dirty = true;
    });
    stage.addEventListener('wheel', (e) => { e.preventDefault(); if (!E.pv) return; const G = E.pv.goal; G.dist = Math.max(0.6, Math.min(6, G.dist * Math.exp(e.deltaY * 0.0012))); E.pv.dirty = true; }, { passive: false });
    stage.addEventListener('contextmenu', (e) => e.preventDefault());
    stage.addEventListener('dblclick', () => { if (E.pv) { E.pv.lastFocus = 'full'; E.pv.focus('full'); } syncCam(); });
    addEventListener('resize', () => { if (E.pv) { E.pv.panel = panelW(); E.pv.dirty = true; } });
    return el;
  }
  const panelW = () => { const p = E.el && E.el.querySelector('.lk-panel'); return p ? p.getBoundingClientRect().right : 0; };
  function syncCam() {
    const f = (E.pv && E.pv.lastFocus) || 'full';
    for (const b of E.el.querySelectorAll('.lk-cam button')) b.classList.toggle('on', b.dataset.f === f);
  }

  /* ---------------------------------------------- данные образа --- */
  const base = (key) => (root.GChar && root.GChar.BASE && root.GChar.BASE[key]) || {};
  const lookOf = (key) => E.data.units[key] || (E.data.units[key] = {});
  const teamOf = (key) => (UNIT[key] || UNIT.delta_1).team;
  const bandOf = (key) => E.data.team[teamOf(key)].band;
  const CLOTH = () => root.GCloth;
  const isStripes = (id) => { const C = CLOTH(); return !!(C && C.PAL && C.PAL[id] && C.PAL[id].stripes); };
  /* v26: верх не китель (тельняшка, футболка, майка, без верха); низ — бельё (шорты, трусы) */
  const isUnder = (id) => { const C = CLOTH(); return C && C.isUnder ? C.isUnder(id) : isStripes(id); };
  const isBrief = (id) => { const C = CLOTH(); return !!(C && C.PAL && C.PAL[id] && C.PAL[id].cut && C.PAL[id].cut.leg); };
  /* действующее значение поля: из образа или исходного пресета */
  function eff(key, f) {
    const L = lookOf(key), B = base(key);
    switch (f) {
      case 'top': return L.top || B.camo;
      case 'bottom': return L.bottom || null;           // null — «авто»
      case 'headCover': return L.headCover || null;
      case 'head': return L.head || B.head || 'helmet';
      case 'armor': return L.armor || 'plate';
      case 'mask': return typeof L.mask === 'boolean' ? L.mask : !!B.mask;
      case 'kneePads': return typeof L.kneePads === 'boolean' ? L.kneePads : !!B.kneePads;
      case 'cover': return L.cover || 'none';
      case 'coverCol': return L.coverCol || 'forest';
      case 'gloveCol': return L.gloveCol || GLOVE_BASE;
      case 'padCol': return L.padCol || B.padCol || B.hardCol;
      default: return L[f] || B[f];
    }
  }
  function baseVal(key, f) {
    const B = base(key);
    switch (f) {
      case 'top': return B.camo;
      case 'head': return B.head || 'helmet';
      case 'armor': return 'plate';
      case 'mask': return !!B.mask;
      case 'kneePads': return !!B.kneePads;
      case 'cover': return 'none';
      case 'coverCol': return 'forest';
      case 'gloveCol': return GLOVE_BASE;
      case 'padCol': return B.padCol || B.hardCol;
      default: return B[f];
    }
  }
  function setField(f, v) {
    const L = lookOf(E.key);
    if (v === null || v === undefined || same(v, baseVal(E.key, f))) delete L[f];
    else L[f] = Array.isArray(v) ? v.slice() : v;
    changed();
  }
  function changed(keys) {
    for (const k of keys || [E.key]) E.dirty.add(k);
    scheduleSave();
    schedulePreview();
    render();
  }
  function scheduleSave() {
    clearTimeout(E.saveT);
    E.saveT = setTimeout(flushSave, 250);
  }
  function flushSave() {
    clearTimeout(E.saveT); E.saveT = 0;
    if (!E.data) return;
    for (const k of ORDER) if (E.data.units[k] && !Object.keys(E.data.units[k]).length) delete E.data.units[k];
    if (save(E.data)) {
      const s = E.el && E.el.querySelector('.lk-saved');
      if (s) { s.classList.add('on'); clearTimeout(s._t); s._t = setTimeout(() => s.classList.remove('on'), 1200); }
    }
  }
  function resetUnit() {
    E.data.units[E.key] = {};
    changed();
  }
  function copyTeam() {
    const t = teamOf(E.key), src = JSON.parse(JSON.stringify(lookOf(E.key)));
    const keys = ORDER.filter((k) => teamOf(k) === t);
    for (const k of keys) if (k !== E.key) E.data.units[k] = JSON.parse(JSON.stringify(src));
    changed(keys);
    toast('Образ «' + UNIT[E.key].name + '» — всей команде «' + TEAM[t] + '»');
  }
  function toast(text) {
    const s = E.el.querySelector('.lk-saved');
    s.textContent = text; s.classList.add('on');
    clearTimeout(s._t); s._t = setTimeout(() => { s.classList.remove('on'); s.textContent = 'Сохранено'; }, 2200);
  }

  /* --------------------------------------------------- превью --- */
  function busy(on, text) {
    const b = E.el.querySelector('.lk-busy');
    if (text) b.textContent = text;
    b.classList.toggle('on', !!on);
  }
  function schedulePreview() {
    clearTimeout(E.t);
    busy(true, 'Обновление…');
    E.t = setTimeout(applyPreview, 60);
  }
  function applyPreview() {
    E.t = 0;
    if (!E.opts || !E.pv) return;
    try {
      E.pv.panel = panelW();
      E.pv.set(E.key, lookOf(E.key), bandOf(E.key));
    } catch (e) { console.warn('looks preview:', e); busy(true, 'Ошибка модели: ' + (e && e.message)); return; }
    const k = E.key;
    E.pv.compile().then(() => { if (E.opts && E.key === k && !E.t) { E.pv.dirty = true; busy(false); } });
    whoLine();
  }
  function whoLine() {
    const w = E.el.querySelector('.lk-who'), u = UNIT[E.key];
    const C = CLOTH(), nm = (id) => { const it = C && C.LIST && C.LIST.find((x) => x.id === id); return it ? it.name : id; };
    const arm = ARMOR.find((a) => a.id === eff(E.key, 'armor'));
    const cov = eff(E.key, 'cover');
    w.innerHTML = '<b>' + esc(u.name) + ' · «' + esc(u.call) + '»</b><span>' + esc(nm(eff(E.key, 'top'))) + ' · ' + esc(arm ? arm.name : '') +
      (cov !== 'none' ? ' · ' + esc((COVERS.find((c) => c.id === cov) || {}).name || '') : '') + '</span>';
  }

  /* --------------------------------------------- миниатюры ткани --- */
  function thumb(id) {
    if (E.thumbs.has(id)) return E.thumbs.get(id);
    const C = CLOTH();
    let url = null;
    try {
      if (C && C.PAL && C.PAL[id] && C.PAL[id].stripes) {
        const Q = C.PAL[id].stripes;
        url = 'repeating-linear-gradient(0deg,' + rgb(Q.a) + ' 0 4px,' + rgb(Q.b) + ' 4px 7px)';
      } else if (C && C.camo) {
        const cv = C.camo(id, 1201, 128);
        url = 'url(' + cv.toDataURL('image/jpeg', 0.85) + ')';
      }
    } catch (e) { url = null; }
    if (!url) { const it = C && C.LIST && C.LIST.find((x) => x.id === id); url = it && it.base ? rgb(it.base) : '#555'; }
    E.thumbs.set(id, url);
    return url;
  }
  /* миниатюры камуфляжа рисуются по одной между кадрами — окно открывается сразу */
  function fillThumbs(box) {
    const list = [...box.querySelectorAll('button[data-camo]')].filter((b) => !b.style.background);
    let i = 0;
    const step = () => {
      if (!E.opts) return;
      const t0 = performance.now();
      while (i < list.length && performance.now() - t0 < 12) { const b = list[i++]; b.style.background = thumb(b.dataset.camo); b.style.backgroundSize = 'cover'; }
      if (i < list.length) setTimeout(step, 0);
    };
    step();
  }

  /* ---------------------------------------------------- вкладки --- */
  const TABS = [['form', 'Форма'], ['armor', 'Броня'], ['head', 'Голова'], ['feet', 'Обувь, перчатки'], ['cover', 'Маскировка'], ['team', 'Команда']];
  function sec(body, cap, note) {
    const s = h('div', 'lk-sec');
    s.appendChild(h('div', 'lk-cap', esc(cap) + (note ? '<em>' + esc(note) + '</em>' : '')));
    body.appendChild(s);
    return s;
  }
  function camoRow(s, field, groups, auto) {
    const C = CLOTH();
    const row = h('div', 'lk-sw');
    const cur = eff(E.key, field), b0 = baseVal(E.key, field);
    if (auto) {
      const a = h('button', 'txt' + (cur ? '' : ' on'), esc(auto));
      a.title = 'Как китель (без кителя — исходные)';
      a.onclick = () => setField(field, null);
      row.appendChild(a);
    }
    for (const it of (C && C.LIST) || []) {
      if (!groups.includes(it.group)) continue;
      const b = h('button', (it.id === cur ? 'on' : '') + (it.id === b0 ? ' base' : ''));
      b.dataset.camo = it.id; b.title = it.name + (it.id === b0 ? ' (исходная)' : '');
      if (E.thumbs.has(it.id)) { b.style.background = E.thumbs.get(it.id); b.style.backgroundSize = 'cover'; }
      b.onclick = () => setField(field, it.id);
      row.appendChild(b);
    }
    s.appendChild(row);
    return row;
  }
  function colorRow(s, field, list) {
    const row = h('div', 'lk-sw');
    const cur = eff(E.key, field), b0 = baseVal(E.key, field);
    const items = [['Исходный', b0, true]].concat(list.filter((x) => !same(x[1], b0)).map((x) => [x[0], x[1], false]));
    for (const [name, col, isBase] of items) {
      if (!col) continue;
      const b = h('button', (same(col, cur) ? 'on' : '') + (isBase ? ' base' : ''));
      b.style.background = rgb(col); b.title = name;
      b.onclick = () => setField(field, isBase ? null : col);
      row.appendChild(b);
    }
    s.appendChild(row);
  }
  function optRow(s, field, list, cls) {
    const row = h('div', 'lk-opts' + (cls ? ' ' + cls : ''));
    const cur = eff(E.key, field);
    for (const o of list) {
      const b = h('button', 'lk-opt' + (o.id === cur ? ' on' : ''), '<b>' + esc(o.name) + '</b>' + (o.about ? '<small>' + esc(o.about) + '</small>' : ''));
      b.onclick = () => setField(field, o.id);
      row.appendChild(b);
    }
    s.appendChild(row);
  }
  function toggleRow(s, field, on, off) {
    const row = h('div', 'lk-sw');
    const cur = eff(E.key, field);
    for (const [v, name] of [[true, on], [false, off]]) {
      const b = h('button', 'txt' + (cur === v ? ' on' : ''), esc(name));
      b.onclick = () => setField(field, v);
      row.appendChild(b);
    }
    s.appendChild(row);
  }
  function render() {
    if (!E.el || !E.opts) return;
    const units = E.el.querySelector('.lk-units');
    units.innerHTML = '';
    for (const k of ORDER) {
      const u = UNIT[k], band = BANDS[E.data.team[u.team].band];
      const b = h('button', 'lk-unit' + (k === E.key ? ' on' : ''), '<i style="background:' + (u.team === 'delta' ? '#e05a4f' : '#c9ced4') + '"></i><b>' + esc(u.name) + '</b><small>' + esc(u.call) + (E.data.units[k] && Object.keys(E.data.units[k]).length ? ' · свой' : '') + '</small>');
      b.title = 'Команда «' + TEAM[u.team] + '», повязка: ' + (band ? band.name.toLowerCase() : '');
      b.onclick = () => { if (E.key === k) return; E.key = k; render(); schedulePreview(); };
      units.appendChild(b);
    }
    const tabs = E.el.querySelector('.lk-tabs');
    tabs.innerHTML = '';
    for (const [id, name] of TABS) {
      const b = h('button', id === E.tab ? 'on' : '', esc(name));
      b.onclick = () => { E.tab = id; render(); };
      tabs.appendChild(b);
    }
    const body = E.el.querySelector('.lk-body');
    const scroll = body.scrollTop;
    body.innerHTML = '';
    const C = CLOTH();
    const nm = (id) => { const it = C && C.LIST && C.LIST.find((x) => x.id === id); return it ? it.name : '—'; };
    if (E.tab === 'form') {
      const s0 = sec(body, 'Готовые комплекты');
      const r0 = h('div', 'lk-sw');
      for (const S of SETS) {
        const b = h('button', 'txt', esc(S.name));
        b.onclick = () => { E.data.units[E.key] = normLook(S.look); for (const f in E.data.units[E.key]) if (same(E.data.units[E.key][f], baseVal(E.key, f))) delete E.data.units[E.key][f]; changed(); };
        r0.appendChild(b);
      }
      s0.appendChild(r0);
      const top = eff(E.key, 'top');
      camoRow(sec(body, 'Китель', isUnder(top) ? 'снят' : nm(top)), 'top', ['camo', 'plain']);
      /* v26: под китель — тельняшки, футболки, майки или голый торс */
      const s1 = sec(body, 'Нательное — без кителя', isUnder(top) ? nm(top) : '');
      for (const [cap, g] of [['Тельняшки', 'stripes'], ['Футболки', 'tee'], ['Майки', 'tank']]) { s1.appendChild(h('div', 'lk-sub', esc(cap))); camoRow(s1, 'top', [g]); }
      const rb = h('div', 'lk-sw'); rb.style.marginTop = '8px';
      const bb = h('button', 'txt' + (top === 'bare' ? ' on' : ''), 'Без верха');
      bb.onclick = () => setField('top', 'bare');
      rb.appendChild(bb); s1.appendChild(rb);
      const bot = eff(E.key, 'bottom');
      camoRow(sec(body, 'Брюки', bot ? (isBrief(bot) ? 'сняты' : nm(bot)) : isUnder(top) ? 'исходные' : 'как китель'), 'bottom', ['camo', 'plain'], 'Авто');
      const s2 = sec(body, 'Без брюк', bot && isBrief(bot) ? nm(bot) : '');
      for (const [cap, g] of [['Шорты', 'shorts'], ['Трусы', 'briefs']]) { s2.appendChild(h('div', 'lk-sub', esc(cap))); camoRow(s2, 'bottom', [g]); }
      body.appendChild(h('div', 'lk-hintx', 'Без кителя и брюк видны руки и ноги; ремень, броня и разгрузка остаются, если их не снять во вкладке «Броня». «Снять всё» — комплект наверху.'));
    } else if (E.tab === 'armor') {
      optRow(sec(body, 'Защита'), 'armor', ARMOR);
      if (eff(E.key, 'armor') !== 'none') colorRow(sec(body, 'Ткань снаряжения'), 'gearCol', COLS.gear);
      else colorRow(sec(body, 'Ремень и подсумки'), 'gearCol', COLS.gear);
      const s2 = sec(body, 'Наколенники');
      toggleRow(s2, 'kneePads', 'Есть', 'Нет');
      if (eff(E.key, 'kneePads')) { const s3 = h('div', ''); s3.style.marginTop = '8px'; s2.appendChild(s3); colorRow(s3, 'padCol', COLS.hard); }
      body.appendChild(h('div', 'lk-hintx', 'Тип защиты влияет на бой: пробитие плит и мягкого пакета считается по выбранной броне (у «Альфы» плиты Бр5, у «Дельты» — Бр4).'));
    } else if (E.tab === 'head') {
      optRow(sec(body, 'Головной убор'), 'head', HEADS, 'c3');
      const hd = eff(E.key, 'head');
      if (hd !== 'none') {
        const hc = eff(E.key, 'headCover');
        camoRow(sec(body, hd === 'helmet' ? 'Чехол шлема' : 'Ткань панамы', hc ? nm(hc) : 'как китель'), 'headCover', ['camo', 'plain'], 'Авто');
      }
      colorRow(sec(body, hd === 'helmet' ? 'Шлем, гарнитура, фурнитура' : 'Фурнитура'), 'hardCol', COLS.hard);
      const s4 = sec(body, 'Балаклава');
      toggleRow(s4, 'mask', 'Надета', 'Без балаклавы');
      if (eff(E.key, 'mask')) { const s5 = h('div', ''); s5.style.marginTop = '8px'; s4.appendChild(s5); colorRow(s5, 'maskCol', COLS.mask); }
    } else if (E.tab === 'feet') {
      colorRow(sec(body, 'Ботинки'), 'bootCol', COLS.boot);
      colorRow(sec(body, 'Перчатки'), 'gloveCol', COLS.glove);
      body.appendChild(h('div', 'lk-hintx', 'Перчатки меняются и на руках от первого лица.'));
    } else if (E.tab === 'cover') {
      optRow(sec(body, 'Маскировка'), 'cover', COVERS, 'c3');
      if (eff(E.key, 'cover') !== 'none') {
        const s6 = sec(body, 'Расцветка');
        const row = h('div', 'lk-sw');
        const cur = eff(E.key, 'coverCol'), SC = (root.GCover && root.GCover.SCHEMES) || {};
        for (const id in SC) {
          const c = SC[id].col;
          const b = h('button', id === cur ? 'on' : '');
          b.style.background = 'linear-gradient(135deg,' + c.map((x, i) => rgb(x) + ' ' + Math.round((i / c.length) * 100) + '% ' + Math.round(((i + 1) / c.length) * 100) + '%').join(',') + ')';
          b.title = SC[id].name;
          b.onclick = () => setField('coverCol', id);
          row.appendChild(b);
          const l = h('span', '', ''); void l;
        }
        s6.appendChild(row);
        s6.appendChild(h('div', 'lk-hintx', 'Лес · Осень · Степь · Зима. Маскировка не мешает стрельбе и снаряжению.'));
      }
    } else if (E.tab === 'team') {
      for (const t of ['delta', 'alpha']) {
        const s7 = sec(body, 'Повязка «' + TEAM[t] + '»', BANDS[E.data.team[t].band].name);
        const row = h('div', 'lk-sw');
        for (const id in BANDS) {
          const b = h('button', (E.data.team[t].band === id ? 'on' : '') + (DEF_BAND[t] === id ? ' base' : ''));
          b.style.background = BANDS[id].hex; b.title = BANDS[id].name;
          b.onclick = () => { E.data.team[t].band = id; E.bandDirty = true; scheduleSave(); render(); if (teamOf(E.key) === t && E.pv) E.pv.setBand(id); };
          row.appendChild(b);
        }
        s7.appendChild(row);
      }
      body.appendChild(h('div', 'lk-hintx', 'Повязка на левом плече — опознавание своих. Одинаковые цвета у обеих команд путают.'));
      const s8 = sec(body, 'Образ команды');
      const row = h('div', 'lk-sw');
      const b = h('button', 'txt', 'Образ «' + esc(UNIT[E.key].name) + '» — всей команде');
      b.onclick = copyTeam;
      row.appendChild(b);
      s8.appendChild(row);
    }
    body.scrollTop = scroll;
    fillThumbs(body);
    whoLine();
    syncCam();
  }

  /* -------------------------------------------- открыть / закрыть --- */
  /* opts: { THREE, renderer, setPreview(fn|null), key, onClose({keys, bands}) } */
  function open(opts) {
    if (!opts || !opts.THREE || !opts.renderer || !root.GChar || !root.GChar.withLook) return false;
    if (E.opts) return true;
    ensureDom();
    E.opts = opts;
    E.data = load();
    E.dirty = new Set(); E.bandDirty = false;
    E.key = ORDER.includes(opts.key) ? opts.key : E.key || 'delta_1';
    E.el.classList.add('on');
    if (!E.pv || E.pv.R !== opts.renderer) E.pv = new Preview(opts.THREE, opts.renderer);
    E.pv.panel = panelW();
    render();
    busy(true, 'Подготовка модели…');
    opts.setPreview((R, dt) => { if (E.pv) E.pv.frame(dt); });
    /* сборка — после кадра с открытым окном */
    setTimeout(applyPreview, 30);
    return true;
  }
  function close() {
    if (!E.opts) return null;
    flushSave();
    clearTimeout(E.t); E.t = 0;
    const o = E.opts;
    E.opts = null;
    try { o.setPreview(null); } catch (e) { /* */ }
    if (E.pv) E.pv.drop();
    E.el.classList.remove('on');
    const res = { keys: [...E.dirty], bands: E.bandDirty };
    if (o.onClose) o.onClose(res);
    return res;
  }

  root.GLooks = {
    KEY, ORDER, UNIT, TEAM, BANDS, COLS, SETS, ARMOR, HEADS, COVERS,
    load, save, norm, open, close, isOpen: () => !!E.opts, Preview,
    _E: E   // стенды и тесты
  };
})(window);
