/* ==========================================================================
   МОДУЛЬ: game/grenades.js — ручные гранаты M67 и M84 (AEGIS)
   ==========================================================================
   Модели — GGrenadeModels (05c). Здесь:
   • спека рига рук (viewmodel/vm.js): хват гранаты в правой кисти, левая —
     у кольца; дорожки броска сверху (ЛКМ) и снизу (ПКМ): скоба, чека,
     замах, бросок, отлёт рычага;
   • граната в руке (копия модели с подвижной чекой);
   • полёт: тяжесть, сопротивление воздуха, отскоки от рельефа и
     препятствий, качение и покой; замедлитель — от отлёта рычага.
   M67: замедлитель 4–5 с, корпус дробится на осколки.
   M84: замедлитель 1,3–1,7 с, корпус цел — вспышка и хлопок из окон.
   ========================================================================== */
(function (root, factory) {
  const G = factory(root.THREE, root.GVM, root.GGrenadeModels);
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  else root.GGrenades = G;
})(typeof self !== 'undefined' ? self : this, function (THREE, VM, GM) {
  'use strict';
  if (!THREE || !VM) return null;
  const { gripMatrix, pose: P, CONFIG } = VM;
  const DEG = Math.PI / 180;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const rr = (a, b) => a + Math.random() * (b - a);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  const KINDS = {
    m67: { id: 'm67', name: 'M67', title: 'Осколочная граната M67', fuse: [4.0, 5.0], mass: 0.40, R: 0.0318, e: 0.26, cd: 0.0023 },
    m84: { id: 'm84', name: 'M84', title: 'Светошумовая граната M84', fuse: [1.3, 1.7], mass: 0.236, R: 0.0225, len: 0.133, e: 0.3, cd: 0.0028 },
    /* v22: дымовая (по образцу M18 / РДГ-2): запал 1,2–2 с, дым ~60 с; корпус цилиндр без отверстий по бокам */
    smoke: { id: 'smoke', name: 'M18', title: 'Дымовая граната M18', fuse: [1.2, 2.0], mass: 0.45, R: 0.0225, len: 0.133, e: 0.22, cd: 0.003 }
  };
  const CYL = (kind) => kind !== 'm67';

  /* ------------------------------------------------------ модели -- */
  const T = { m67: null, m84: null, smoke: null, ready: null, shadows: true };
  function init(renderer, quality) {
    if (T.ready) return T.ready;
    const q = quality === 'low' ? 'low' : quality === 'high' ? 'high' : 'med';
    T.shadows = q !== 'low';
    T.ready = (async () => {
      if (GM && GM.buildM67) {
        try { T.m67 = await GM.buildM67({ renderer, quality: q, wear: 0.35, rust: 0.1, smudge: 0.3, seed: 11 }); }
        catch (e) { console.warn('M67:', e); T.m67 = null; }
      }
      if (GM && GM.buildFlashbang) {
        try { T.m84 = GM.buildFlashbang({ holes: q !== 'low', wear: q !== 'low' }); }
        catch (e) { console.warn('M84:', e); T.m84 = null; }
      }
      try { T.smoke = buildSmoke(T.m84); } catch (e) { console.warn('M18:', e); T.smoke = null; }
      return T;
    })();
    return T.ready;
  }
  /* v22: дымовая M18 — запал M84 (рычаг, чека, кольцо — те же узлы, та же анимация броска), корпус свой:
     гладкий оливковый цилиндр с жёлтой полосой и маркировкой «SMOKE · WHITE», сверху — 4 выходных отверстия
     под лентой, снизу — завальцованное дно. Издалека отличается от тёмной перфорированной M84 цветом и полосой. */
  function smokeLabel() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#4c5232'; x.fillRect(0, 0, 512, 256);
    /* потёртости краски */
    for (let i = 0; i < 900; i++) { const v = 60 + Math.random() * 40 | 0; x.fillStyle = 'rgba(' + v + ',' + (v + 6) + ',' + (v - 18) + ',' + (Math.random() * 0.25).toFixed(2) + ')'; x.fillRect(Math.random() * 512, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 2); }
    x.fillStyle = '#d9c23a'; x.fillRect(0, 18, 512, 16);
    x.fillStyle = '#e8e4d0'; x.font = 'bold 30px Arial'; x.textAlign = 'center';
    for (const cx of [128, 384]) { x.fillText('SMOKE', cx, 92); x.font = 'bold 22px Arial'; x.fillText('WHITE', cx, 124); x.font = '15px Arial'; x.fillText('GRENADE HAND M18', cx, 160); x.fillText('LOT 22-117', cx, 184); x.font = 'bold 30px Arial'; }
    x.fillStyle = '#d9c23a'; x.fillRect(0, 222, 512, 8);
    const t = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  function buildSmoke(m84) {
    const R = 0.0226, H = 0.133, HY = H / 2;
    const paint = new THREE.MeshStandardMaterial({ name: 'smokePaint', map: smokeLabel(), color: 0xffffff, roughness: 0.78, metalness: 0.12 });
    const capMat = new THREE.MeshStandardMaterial({ name: 'smokeCap', color: 0x434a2c, roughness: 0.7, metalness: 0.25 });
    const holeMat = new THREE.MeshStandardMaterial({ name: 'smokeHole', color: 0x0c0c0a, roughness: 1, metalness: 0 });
    const g = m84 ? m84.clone(true) : new THREE.Group();
    g.name = 'M18_Smoke';
    /* корпус M84 (перфорированная гильза, заряд, потёртости) скрыт — свой корпус */
    for (const n of ['body_shell', 'charge_core', 'body_wear']) { const o = g.getObjectByName(n); if (o) o.visible = false; }
    const body = new THREE.Group(); body.name = 'smoke_body';
    const side = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H - 0.004, 40, 1, true), paint);
    side.rotation.y = Math.PI * 0.15;
    const top = new THREE.Mesh(new THREE.CircleGeometry(R * 0.985, 32), capMat); top.rotation.x = -Math.PI / 2; top.position.y = HY - 0.002;
    const bot = new THREE.Mesh(new THREE.CircleGeometry(R * 0.985, 32), capMat); bot.rotation.x = Math.PI / 2; bot.position.y = -HY + 0.002;
    const rimT = new THREE.Mesh(new THREE.TorusGeometry(R - 0.0007, 0.0017, 6, 40), capMat); rimT.rotation.x = Math.PI / 2; rimT.position.y = HY - 0.002;
    const rimB = rimT.clone(); rimB.position.y = -HY + 0.002;
    body.add(side, top, bot, rimT, rimB);
    for (let i = 0; i < 4; i++) {
      const a = (i + 0.5) / 4 * Math.PI * 2;
      const h = new THREE.Mesh(new THREE.CircleGeometry(0.0034, 12), holeMat);
      h.rotation.x = -Math.PI / 2; h.position.set(Math.sin(a) * R * 0.62, HY - 0.0012, Math.cos(a) * R * 0.62);
      body.add(h);
    }
    body.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    const host = g.getObjectByName('body_group') || g;
    host.add(body);
    return g;
  }
  /* запасные простые модели, пока не готовы настоящие */
  let fallbackMat = null;
  function fallback(kind) {
    fallbackMat = fallbackMat || new THREE.MeshStandardMaterial({ color: 0x4a5040, roughness: 0.7, metalness: 0.2 });
    const g = new THREE.Group();
    const m = CYL(kind)
      ? new THREE.Mesh(new THREE.CylinderGeometry(0.0225, 0.0225, 0.133, 14), fallbackMat)
      : new THREE.Mesh(new THREE.SphereGeometry(0.0318, 14, 10), fallbackMat);
    m.name = 'body'; g.add(m);
    return g;
  }
  function shadowsOn(o, on) { o.traverse((c) => { if (c.isMesh) { c.castShadow = on; c.receiveShadow = on; } }); }
  /* копия модели: детали — по именам узлов (общие геометрия и материалы) */
  function instance(kind) {
    let g = null;
    if (kind === 'm67' && T.m67) g = T.m67.group.clone(true);
    else if (kind === 'm84' && T.m84) g = T.m84.clone(true);
    else if (kind === 'smoke' && T.smoke) g = T.smoke.clone(true);
    if (!g) g = fallback(kind);
    const parts = kind === 'm67'
      ? { lever: g.getObjectByName('lever'), pin: g.getObjectByName('pin'), ring: g.getObjectByName('ring'), clip: g.getObjectByName('clip'), tipA: g.getObjectByName('pinTipA'), tipB: g.getObjectByName('pinTipB') }
      : { lever: g.getObjectByName('spoon_pivot'), pin: g.getObjectByName('pin_group'), ring: g.getObjectByName('ring_group'), clip: null };
    const cut = g.getObjectByName('cutaway');
    if (cut) cut.visible = false;
    const init0 = [];
    for (const k of ['lever', 'pin', 'clip']) {
      const o = parts[k];
      if (o) init0.push({ o, parent: o.parent, p: o.position.clone(), q: o.quaternion.clone() });
    }
    const pinRest = parts.pin ? parts.pin.position.clone() : null;
    /* у M84 своя копия материала заряда — вспышка не красит остальные */
    let charge = null;
    if (kind === 'm84') g.traverse((c) => {
      if (c.isMesh && c.material && c.material.name === 'charge') {
        if (!charge) charge = c.material.clone();
        c.material = charge;
      }
    });
    const inst = {
      kind, group: g, parts, charge,
      /* d — ход чеки, м (M67: 0…0,024; M84: 0…0,03) */
      setPin(d) {
        const p = parts.pin; if (!p || !pinRest) return;
        p.position.copy(pinRest); p.position.z += d;
        if (parts.tipA) { const k = 1 - Math.min(1, d / 0.0036); parts.tipA.rotation.x = 0.62 * k; parts.tipB.rotation.x = -0.62 * k; }
      },
      reset() {
        for (const s of init0) { s.parent.add(s.o); s.o.position.copy(s.p); s.o.quaternion.copy(s.q); s.o.visible = true; }
        inst.setPin(0);
        g.visible = true;
      },
      glow(k) { if (charge) { charge.emissive.setRGB(1, 0.95, 0.85); charge.emissiveIntensity = k; } }
    };
    inst.setPin(0);
    return inst;
  }

  /* --------------------------------------------- спека рига рук -- */
  /* Хват (система «оружия» рига = центр гранаты): правая кисть сзади-справа,
     рычаг прижат ладонью под большим пальцем, кольцо смотрит назад-влево —
     к левой кисти. Позы пальцев: [пясть, осн. фаланга, средняя, ногтевая,
     развод]; у большого — [сгиб, пясть-фаланга, фаланга, —, поворот]. */
  const CFG = {
    rDistal: [-0.32, 0.42, -0.85], rDorsal: [0.85, 0.35, 0.25], rBall: [0.004, -0.046, -0.052],
    modelRot: [0, -30, 0], lDistal: [0.55, 0.05, -0.83], lDorsal: [-0.25, 0.95, 0.1], lHook: [0.012, -0.022, -0.088],
    /* хват перед броском: кисть повёрнута ладонью к себе-вверх, чтобы
       корпус гранаты и кольцо под указательным пальцем левой руки были
       видны из камеры (раньше тыльная сторона кисти закрывала гранату) */
    hip: { pos: [0.12, -0.15, -0.38], rot: [45, -8, 12] },
    sprint: { pos: [0.12, -0.24, -0.25], rot: [-12, 6, 18] }
  };
  /* v25: пальцы веером по шару (Ø 64 мм), а не сомкнуты «варежкой»: указательный
     уходит к большому, мизинец — к низу корпуса; между пальцами виден корпус */
  const BALL = P([0.72, 0.42, 0.34, 0, -0.3], [0.05, 0.74, 0.9, 0.5, -0.22], [0.07, 0.82, 0.96, 0.52, -0.06], [0.1, 0.9, 1.0, 0.55, 0.11], [0.14, 0.96, 1.02, 0.55, 0.25]);
  const BALL_T = P([0.78, 0.48, 0.38, 0, -0.32], [0.05, 0.82, 0.98, 0.55, -0.2], [0.07, 0.88, 1.03, 0.56, -0.05], [0.1, 0.96, 1.06, 0.58, 0.1], [0.14, 1.0, 1.08, 0.58, 0.23]);
  const HOOK = P([0.45, 0.3, 0.35, 0, 0.35], [0.02, 0.85, 1.35, 0.9, 0], [0.08, 1.15, 1.25, 0.65, 0], [0.12, 1.2, 1.25, 0.65, 0], [0.16, 1.2, 1.2, 0.6, 0]);
  const OPEN = P([0.25, 0.15, 0.1, 0, 0.1], [0, 0.12, 0.12, 0.06, -0.04], [0.04, 0.2, 0.22, 0.1, 0], [0.07, 0.28, 0.28, 0.14, 0.04], [0.1, 0.34, 0.3, 0.16, 0.08]);
  const RELAX = P([0.35, 0.25, 0.2, 0, 0.2], [0.04, 0.45, 0.5, 0.3, 0], [0.06, 0.55, 0.55, 0.3, 0], [0.09, 0.62, 0.6, 0.32, 0], [0.12, 0.7, 0.62, 0.32, 0]);

  function gripAround(center, distal, dorsal, local) {
    const M = gripMatrix([0, 0, 0], distal, dorsal);
    const off = V3(local[0], local[1], local[2]).applyMatrix4(new THREE.Matrix4().extractRotation(M));
    M.setPosition(center.x - off.x, center.y - off.y, center.z - off.z);
    return M;
  }
  function makeModel() {
    const m = {
      root: new THREE.Group(), magSeat: new THREE.Object3D(), magazine: new THREE.Group(),
      muzzle: new THREE.Object3D(), ejectionPort: new THREE.Object3D(), lightMount: new THREE.Object3D(),
      roundInMag: new THREE.Object3D(), hold: new THREE.Group(), slide: 0, trigger: 0, locked: false,
      setSlide() {}, setTrigger() {}, setSlideStop() {}, setSelector() {}, setLight() {}
    };
    m.root.name = 'grenadeVM';
    m.magSeat.add(m.magazine);
    m.root.add(m.magSeat, m.muzzle, m.ejectionPort, m.lightMount, m.roundInMag, m.hold);
    return m;
  }
  /* кольцо в системе гранаты (после поворота модели) */
  function ringPoint(kind) {
    const p = CYL(kind) ? V3(0.012, 0.086, 0.034) : V3(0.0114, 0.038, 0.03);
    return p.applyEuler(new THREE.Euler(CFG.modelRot[0] * DEG, CFG.modelRot[1] * DEG, CFG.modelRot[2] * DEG, 'YXZ'));
  }
  function modelOffset(kind) {
    /* центр хвата: у M84 — середина верхней половины корпуса */
    return CYL(kind) ? V3(0, -0.02, 0) : V3(0, 0, 0);
  }

  const cam = (x, y, z, rx, ry, rz) => new THREE.Matrix4().compose(V3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx * DEG, ry * DEG, rz * DEG, 'YXZ')), V3(1, 1, 1));
  /* левая кисть, вытянутая к цели (система камеры): ладонь вниз-вперёд */
  const L_POINT = cam(-0.17, -0.10, -0.44, -8, 18, -82);
  const L_DOWN = cam(-0.20, -0.36, -0.12, 30, 10, -70);
  const L_LOW = cam(-0.22, -0.52, 0.02, 40, 10, -60);

  function throwTrack(style, sp) {
    const pull = new THREE.Matrix4().makeTranslation(-0.10, -0.03, 0.09).multiply(sp.leftGrip);
    const pull1 = new THREE.Matrix4().makeTranslation(-0.02, 0, 0.012).multiply(sp.leftGrip);
    const left = [
      { t: 0, at: 'grip', pose: 'support' },
      { t: 0.14, at: 'grip', pose: 'support' },
      { t: 0.20, at: 'gun', gun: pull1, pose: 'support' },
      { t: 0.32, at: 'gun', gun: pull, pose: 'support' }
    ];
    const events = [[0.06, 'clip'], [0.17, 'pin'], [0.30, 'pinOut']];
    let gunPos, gunRot, rel;
    if (style === 'under') {
      left.push({ t: 0.52, at: 'cam', m: L_DOWN, pose: 'open' }, { t: 0.78, at: 'cam', m: L_DOWN, pose: 'open' }, { t: 1.2, at: 'cam', m: L_LOW, pose: 'relax' });
      gunPos = [[0, [0, 0, 0]], [0.12, [-0.01, 0.01, 0]], [0.32, [-0.015, 0.0, 0.01]], [0.52, [0.05, -0.24, 0.16]], [0.6, [0.05, -0.25, 0.15]],
        [0.74, [0.0, -0.10, -0.18]], [0.86, [-0.02, 0.0, -0.26]], [1.2, [0.02, -0.42, 0.08]]];
      gunRot = [[0, [0, 0, 0]], [0.12, [2, 2, 0]], [0.32, [0, 0, 0]], [0.52, [42, 0, 6]], [0.6, [44, 0, 6]],
        [0.74, [-22, 0, 0]], [0.86, [-42, 0, -4]], [1.2, [-30, 0, 0]]];
      rel = 0.73;
      events.push([rel, 'throw'], [0.95, 'pinDrop']);
    } else {
      left.push({ t: 0.5, at: 'cam', m: L_POINT, pose: 'open' }, { t: 0.72, at: 'cam', m: L_POINT, pose: 'open' }, { t: 0.92, at: 'cam', m: L_DOWN, pose: 'open' }, { t: 1.25, at: 'cam', m: L_LOW, pose: 'relax' });
      gunPos = [[0, [0, 0, 0]], [0.12, [-0.01, 0.01, 0]], [0.32, [-0.015, 0.0, 0.01]], [0.5, [0.07, 0.17, 0.21]], [0.6, [0.075, 0.185, 0.19]],
        [0.74, [-0.03, 0.11, -0.2]], [0.88, [-0.1, -0.12, -0.17]], [1.25, [0.02, -0.42, 0.08]]];
      gunRot = [[0, [0, 0, 0]], [0.12, [2, 2, 0]], [0.32, [0, 0, 0]], [0.5, [-58, -8, 22]], [0.6, [-62, -8, 24]],
        [0.74, [18, 4, -4]], [0.88, [55, 14, -18]], [1.25, [-30, 0, 0]]];
      rel = 0.72;
      events.push([rel, 'throw'], [0.98, 'pinDrop']);
    }
    const dur = gunPos[gunPos.length - 1][0];
    return { duration: dur, gunPos, gunRot, left, events, magRelease: [-1, -1], release: rel, style, grenade: true };
  }

  const SPECS = {};
  function spec(kind) {
    if (SPECS[kind]) return SPECS[kind];
    const model = makeModel();
    const R0 = CONFIG.rifle.recoil;
    const tuning = Object.assign({}, CONFIG.rifle, {
      poses: {
        hip: { pos: CFG.hip.pos.slice(), rot: CFG.hip.rot.slice() },
        ads: { pos: CFG.hip.pos.slice(), rot: CFG.hip.rot.slice() },
        sprint: { pos: CFG.sprint.pos.slice(), rot: CFG.sprint.rot.slice() },
        wallTuck: { pos: [0.1, -0.2, -0.2], rot: [-10, 6, 10] }
      },
      aimPivot: [0.1, -0.2, 0.12], wristPivot: [0, -0.02, 0.06],
      recoil: Object.assign({}, R0, { kickBack: 0, kickUp: 0, pitchDeg: 0, yawDeg: 0, rollDeg: 0, climbDeg: 0, climbYawDeg: 0, cameraKick: 0 }),
      magSize: 1, auto: false, fireInterval: 1, slideCycleTime: 0.001, tuckDistance: 0.55
    });
    const c = modelOffset(kind);
    const rightGrip = gripAround(c, CFG.rDistal, CFG.rDorsal, CFG.rBall);
    const rp = ringPoint(kind).add(c);
    const leftGrip = gripAround(rp, CFG.lDistal, CFG.lDorsal, CFG.lHook);
    const sp = {
      id: kind, fam: 'grenade', grenade: kind, model, tuning, rightGrip, leftGrip,
      hands: { indexed: BALL, trigger: BALL_T, magRelease: BALL, support: HOOK, open: OPEN, relax: RELAX, mag: RELAX, aux: RELAX },
      magInHand: VM.magInHand(0.1),
      pouch: VM.pouch([-0.12, -0.40, -0.02], [-1.1, 0.25, 0.3]),
      shellVel: [[0, 0, 0], [0, 0, 0]]
    };
    sp.leftGrip0 = leftGrip.clone();
    sp.tracks = { over: throwTrack('over', sp), under: throwTrack('under', sp) };
    sp.tactical = sp.tracks.over; sp.empty = sp.tracks.over;
    SPECS[kind] = sp;
    return sp;
  }

  /* граната в руке: копия модели в системе рига */
  const HELD = {};
  function held(kind) {
    const sp = spec(kind);
    let h = HELD[kind];
    const fresh = !h || (h.fallback && !!T[kind]);
    if (fresh) {
      if (h) { sp.model.hold.remove(h.inst.group); }
      const inst = instance(kind);
      inst.group.rotation.set(CFG.modelRot[0] * DEG, CFG.modelRot[1] * DEG, CFG.modelRot[2] * DEG, 'YXZ');
      inst.group.position.copy(modelOffset(kind)).negate().add(modelOffset(kind)); // центр модели в начале
      if (CYL(kind)) inst.group.position.set(0, 0, 0);
      shadowsOn(inst.group, false);
      sp.model.hold.add(inst.group);
      h = HELD[kind] = { kind, inst, fallback: !T[kind], pinOut: false, pin: 0 };
    }
    return h;
  }

  /* --------------------------------------------------- полёт -------- */
  const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _up = V3(0, 1, 0);
  function createSim(env) {
    const scene = env.scene;
    const physics = globalThis.GPhysics.get(env.world);
    const list = [], debris = [], spent = [];
    const H = (x, z) => (env.heightAt ? env.heightAt(x, z) : 0);
    function topOf(c) {
      if (c._gTop !== undefined) return c._gTop;
      if (c.step) return (c._gTop = c.h);
      const cx = c.type === 'box' ? (c.x0 + c.x1) / 2 : c.x, cz = c.type === 'box' ? (c.z0 + c.z1) / 2 : c.z;
      return (c._gTop = H(cx, cz) + (c.h || 2));
    }
    function add(kind, pos, vel, quat, spin, fuseT) {
      const K = KINDS[kind];
      const inst = instance(kind);
      inst.parts.pin && (inst.parts.pin.visible = false);
      inst.parts.clip && (inst.parts.clip.visible = false);
      inst.parts.lever && (inst.parts.lever.visible = false);
      shadowsOn(inst.group, T.shadows);
      inst.group.position.copy(pos);
      if (quat) inst.group.quaternion.copy(quat);
      scene.add(inst.group);
      const g = {
        kind, K, inst, obj: inst.group, pos: inst.group.position, vel: vel.clone(), q: inst.group.quaternion,
        w: spin ? spin.clone() : V3(rr(-8, 8), rr(-4, 4), rr(-8, 8)), t: 0,
        fuse: fuseT !== undefined ? fuseT : rr(K.fuse[0], K.fuse[1]),
        rest: false, restT: 0, ground: false, bounceT: -1, done: false, prev: new THREE.Vector3().copy(pos)
      };
      physics.dynamicObject(g, { pos:g.pos, q:g.q, vel:g.vel, spin:g.w, mass:K.mass, radius:K.R,
        capsule:CYL(kind)?K.len/2-K.R:0, restitution:K.e, drag:.06, angularDamping:1.2 });
      list.push(g);
      return g;
    }
    /* обломок (рычаг, чека): летит, падает, лежит */
    function addDebris(obj, vel, spin, opt) {
      shadowsOn(obj, T.shadows);
      scene.add(obj);
      debris.push({ obj, vel: vel.clone(), w: spin.clone(), t: 0, rest: false, r: (opt && opt.r) || 0.01, ttl: (opt && opt.ttl) || 45, sound: opt && opt.sound, hit: false });
      const d0=debris[debris.length-1];
      physics.dynamicObject(d0,{pos:obj.position,q:obj.quaternion,vel:d0.vel,spin:d0.w,mass:.015,radius:d0.r,restitution:.25,drag:.6});
      while (debris.length > 14) { const d = debris.shift(); physics.removeObject(d); if (d.obj.parent) d.obj.parent.remove(d.obj); }
    }
    function stepG(g, dt) {
      const oldSpeed=g.vel.length(),o=physics.readObject(g,g.pos,g.q,g.vel);if(!o)return;
      g.w.copy(o.body.angvel());g.rest=o.body.isSleeping();
      const hit=physics.support(g.pos.x,g.pos.z,g.pos.y+.002,.16);
      g.ground=!!hit&&g.pos.y-hit.y<((CYL(g.kind)?g.K.len/2:g.K.R)+.025);
      const impact=oldSpeed-g.vel.length();
      if(impact>.8&&g.t-g.bounceT>.08){g.bounceT=g.t;if(env.onBounce)env.onBounce(g,impact,'hard')}
    }
    function stepDebris(d, dt) {
      d.t+=dt;if(d.t>d.ttl){physics.removeObject(d);if(d.obj.parent)d.obj.parent.remove(d.obj);return false}
      const speed=d.vel.length(),o=physics.readObject(d,d.obj.position,d.obj.quaternion,d.vel);if(!o)return false;
      d.rest=o.body.isSleeping();
      if(!d.hit&&speed-d.vel.length()>1){d.hit=true;if(env.onDebris)env.onDebris(d,speed-d.vel.length())}
      return true;
    }
    function update(dt) {
      if (dt <= 0) return;
      for (let i = list.length - 1; i >= 0; i--) {
        const g = list[i];
        g.t += dt;
        stepG(g, dt);
        if (g.t >= g.fuse) {
          list.splice(i, 1);
          g.done = true;
          if (env.onDetonate) env.onDetonate(g);
          if (g.kind === 'm84' || g.kind === 'smoke') {
            /* корпус M84 цел: обгорелый, остывает; дымовая лежит и дымит (облако — js/polygon/26c_smoke.js) */
            if (g.kind === 'm84') g.inst.glow(3);
            spent.push({ g, t: 0, ttl: g.kind === 'smoke' ? 120 : 60 });
            while (spent.length > 6) { const s = spent.shift(); physics.removeObject(s.g); if (s.g.obj.parent) s.g.obj.parent.remove(s.g.obj); }
          } else { physics.removeObject(g); if (g.obj.parent) g.obj.parent.remove(g.obj); }
        }
      }
      for (let i = spent.length - 1; i >= 0; i--) {
        const s = spent[i];
        s.t += dt;
        s.g.inst.glow(Math.max(0, 3 * Math.exp(-s.t * 14)));
        if (!s.g.rest) stepG(s.g, dt);
        if (s.t > (s.ttl || 60)) { physics.removeObject(s.g); if (s.g.obj.parent) s.g.obj.parent.remove(s.g.obj); spent.splice(i, 1); }
      }
      for (let i = debris.length - 1; i >= 0; i--) if (!stepDebris(debris[i], dt)) debris.splice(i, 1);
    }
    function clear() {
      for(const key of [...list,...spent.map(s=>s.g),...debris])physics.removeObject(key);
      for (const g of list) if (g.obj.parent) g.obj.parent.remove(g.obj);
      for (const s of spent) if (s.g.obj.parent) s.g.obj.parent.remove(s.g.obj);
      for (const d of debris) if (d.obj.parent) d.obj.parent.remove(d.obj);
      list.length = 0; spent.length = 0; debris.length = 0;
    }
    return { add, addDebris, update, clear, list, debris, spent, topOf };
  }

  /* Отпускание: из гранаты в руке — летящая копия, рычаг отлетает.
     sim — createSim; h — held(kind); vel — скорость броска (мир). */
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _qq = new THREE.Quaternion();
  function release(sim, h, vel, fuseT) {
    const inst = h.inst;
    inst.group.updateMatrixWorld(true);
    inst.group.matrixWorld.decompose(_p, _qq, _s);
    const g = sim.add(h.kind, _p, vel, _qq, V3(rr(-3, 3), rr(-2, 2), rr(-14, -8)).applyQuaternion(_qq), fuseT);
    /* рычаг: копия детали с его мировым положением, отлетает вверх-назад */
    const lever = inst.parts.lever;
    if (lever) {
      lever.updateMatrixWorld(true);
      const L = lever.clone(true);
      lever.matrixWorld.decompose(L.position, L.quaternion, L.scale);
      const out = V3(1, 0.6, 0).applyQuaternion(_qq).normalize();
      sim.addDebris(L, vel.clone().multiplyScalar(0.7).addScaledVector(out, rr(2.5, 3.5)).add(V3(0, 1.2, 0)),
        V3(0, 0, 1).applyQuaternion(_qq).multiplyScalar(rr(25, 40)), { r: 0.006, ttl: 50, sound: 'hard' });
      lever.visible = false;
    }
    inst.group.visible = false;
    return g;
  }

  /* для подбора хвата: сбросить кэш спецификаций и моделей в руке */
  function resetSpecs() {
    for (const k of Object.keys(HELD)) { const h = HELD[k]; if (h.inst.group.parent) h.inst.group.parent.remove(h.inst.group); delete HELD[k]; }
    for (const k of Object.keys(SPECS)) delete SPECS[k];
  }
  return { KINDS, CFG, init, T, instance, spec, held, resetSpecs, createSim, release, throwTrack, ringPoint, HANDS: { BALL, BALL_T, HOOK, OPEN, RELAX } };
});
