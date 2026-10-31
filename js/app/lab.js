/* AEGIS v13 — Лаборатория анимаций (index.html?lab).

   Стенд для отработки и проверки анимаций каждого генерала без боя:
   выбор генерала и оружия, орбитальная камера, замедление времени и
   покадровый шаг; шаг/бег/присед/прицел; тактическая перезарядка и
   перезарядка с пустым магазином (магазин из подсумка на груди);
   поражение разным оружием и патронами в разные части тела с замером
   того, как падает тело; автоматический прогон проверок с отчётом:
   входят ли руки в корпус, висят ли стопы над землёй или уходят в неё,
   далеко ли и как быстро отлетает тело, выпадает ли боец от ранения.
   Лаборатория ничего не меняет в сохранённом снаряжении игрока. */
(function () {
  'use strict';
  if (!/[?&]lab\b/.test(location.search)) return;
  const root = window;

  const WEAPONS = [
    { id: 'akm', name: 'АКМ · 7,62×39', ammo: '57N231', v: 715 },
    { id: 'ak74', name: 'АК-74 · 5,45×39', ammo: '7N6', v: 880 },
    { id: 'm416', name: 'M416 · 5,56×45', ammo: 'M855', v: 910 },
    { id: 'scar', name: 'SCAR-H · 7,62×51', ammo: 'M80', v: 830 },
    { id: 'svd', name: 'СВД · 7,62×54R', ammo: '7N1', v: 830 },
    { id: 'mp5a3', name: 'MP5 · 9×19', ammo: '57N181S', v: 400 },
    { id: 'm870', name: 'M870 · пуля Бреннеке', ammo: 'slug', v: 450 },
    { id: 'glock18c', name: 'Glock 18C · 9×19', ammo: '57N181S', v: 360, pistol: true }
  ];
  /* высота точки попадания (м, рост 1,8 м) и смещение вбок */
  /* v14: шея и живот — прицел по кости (тело ниже/выше в стойке, после
     первого попадания смещается): иначе «шея» попадала в голову */
  const ZONES = [
    { n: 'Голова', y: 1.74, x: 0 }, { n: 'Шея (по центру)', y: 1.585, x: 0, bone: 'neck', off: [0, -0.03, 0] }, { n: 'Грудь', y: 1.35, x: 0, bone: 'chest', off: [0, 0, 0] },
    { n: 'Живот', y: 1.1, x: 0, bone: 'spine', off: [0.05, -0.02, 0] }, { n: 'Таз', y: 0.95, x: 0.05 }, { n: 'Бедро', y: 0.7, x: 0.1 },
    { n: 'Голень', y: 0.35, x: 0.1 }, { n: 'Плечо', y: 1.38, x: 0.22, bone: 'elbowL', off: [0, 0.08, 0] }, { n: 'Предплечье', y: 1.05, x: 0.27 },
    { n: 'Шея (сбоку)', y: 1.585, x: 0.04, bone: 'neck', off: [0.04, -0.03, 0] }
  ];
  const ZI = (n) => ZONES.findIndex((z) => z.n.startsWith(n));
  /* фазы перезарядки (события дорожки 05b_guns) */
  const PHASE = { grabOld: 'хват старого магазина', magOut: 'магазин выведен из горловины', drop: 'старый магазин сброшен / убран',
    pouch: 'кисть у подсумка на плитнике', grab: 'новый магазин в руке', magIn: 'магазин вставлен в горловину', seat: 'дослан, защёлка, хват цевья' };
  const SIDES = [{ n: 'Спереди', a: 0 }, { n: 'Слева', a: -Math.PI / 2 }, { n: 'Справа', a: Math.PI / 2 }, { n: 'Сзади', a: Math.PI }];
  /* пороги проверок */
  const LIM = { arm: 0.03, sink: 0.02, float: 0.035, travel: 1.0, vmax: 3.0 };

  const L = {
    i: 1, w: {}, speed: 1, paused: false, stepOnce: false, move: 'stand', circle: true, crouch: false, ads: false,
    cam: { yaw: 0.7, pitch: 0.12, dist: 2.6, follow: true }, shotT: null, rows: []
  };

  function waitReady() {
    const G = root.__GAME, A = root.AEGIS_GAME;
    if (G && A && G.squad && G.squad.length && G.step && root.THREE) return init(G, A);
    setTimeout(waitReady, 300);
  }

  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function init(G, A) {
    const THREE = root.THREE, AE = root.AEGIS;
    const saved = AE && AE.loadLoadouts ? JSON.parse(JSON.stringify(AE.loadLoadouts())) : null;
    try { if (root.AEGIS_INTRO && root.AEGIS_INTRO.close) root.AEGIS_INTRO.close(); } catch (e) { /* */ }
    for (const id of ['intro', 'menu', 'battle', 'settings', 'armory']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    try { if (A.setInput) A.setInput(false); } catch (e) { /* */ }
    G.pause(true);

    const squad = G.squad;
    const defW = ['akm', 'm416', 'ak74', 'scar'];
    function arm(i, wid) {
      const W = WEAPONS.find((w) => w.id === wid) || WEAPONS[0];
      L.w[i] = W.id;
      const slots = [{ t: 'gun', id: W.id }, { t: 'gun', id: 'glock18c' }, { t: 'ammo', w: 'primary' }, { t: 'ammo', w: 'primary' }, { t: 'ammo', w: 'pistol' }, null];
      A.setLoadout(squad[i].key, { slots });
      /* сохранённое снаряжение игрока не трогаем */
      if (saved && AE.saveLoadouts) AE.saveLoadouts(saved);
    }
    squad.forEach((s, i) => arm(i, defW[i] || 'akm'));
    G.step(20, 1 / 30);

    /* ---------------------------------------------------------- панель */
    const css = el('style', null, `
      #lab{position:fixed;left:12px;top:12px;bottom:12px;width:330px;z-index:9999;overflow:auto;
        background:rgba(14,17,20,.86);color:#e8ece9;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px 14px;
        font:14px/1.4 var(--ui, 'Golos Text', system-ui, sans-serif);backdrop-filter:blur(6px)}
      #lab h1{font-size:18px;margin:0 0 2px;font-weight:700}
      #lab .sub{color:#9aa5a0;font-size:12.5px;margin-bottom:8px}
      #lab h2{font-size:13px;color:#b9c4bf;margin:12px 0 6px;font-weight:600}
      #lab .row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
      #lab button{background:#2a3330;color:#e8ece9;border:1px solid #3c4844;border-radius:6px;padding:5px 9px;font:inherit;font-size:13px;cursor:pointer}
      #lab button:hover{background:#34403c} #lab button.on{background:#4f7a5f;border-color:#6d9c7d}
      #lab select,#lab input{background:#1d2422;color:#e8ece9;border:1px solid #3c4844;border-radius:6px;padding:4px 6px;font:inherit;font-size:13px}
      #lab .live{font-variant-numeric:tabular-nums;font-size:13px;background:#1a201e;border-radius:6px;padding:6px 8px;white-space:pre-wrap}
      #lab table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
      #lab td{padding:2px 4px;border-bottom:1px solid rgba(255,255,255,.07);vertical-align:top}
      #lab .ok{color:#8fd19e} #lab .bad{color:#ff9a8a} #lab .dim{color:#9aa5a0}
      #labHint{position:fixed;right:14px;bottom:12px;z-index:9999;color:#cfd8d3;font:13px var(--ui, sans-serif);background:rgba(14,17,20,.7);padding:6px 10px;border-radius:8px}
    `);
    document.head.appendChild(css);
    const P = el('div', { id: 'lab' });
    P.innerHTML = `
      <h1>Лаборатория</h1>
      <div class="sub">Отработка анимаций, ранений и падения тела</div>
      <h2>Генерал</h2><div class="row" id="lbGen"></div>
      <div class="row" style="margin-top:6px"><select id="lbW"></select></div>
      <h2>Время</h2><div class="row" id="lbT"></div>
      <h2>Движение</h2><div class="row" id="lbM"></div>
      <h2>Перезарядка</h2><div class="row"><button id="lbRt">Тактическая</button><button id="lbRe">С пустым магазином</button><button id="lbRs">По шагам</button></div>
      <div class="dim" id="lbPh" style="font-size:12.5px;margin-top:4px"></div>
      <h2>Поражение</h2>
      <div class="row" style="margin-bottom:6px"><label class="dim">Чем: <select id="lbA"></select></label></div>
      <div class="row"><select id="lbZ"></select><select id="lbS"></select><label class="dim">дист. <input id="lbD" type="number" value="10" min="2" max="300" style="width:58px"> м</label></div>
      <div class="row" style="margin-top:6px"><button id="lbFire">Выстрел</button><button id="lbRev">Возродить всех</button><button id="lbFF">+10 с</button><button id="lbFF60">+60 с</button></div>
      <h2>Ранения и броня</h2>
      <div class="row"><button id="lbArm">Броня: очередь в плиту</button><button id="lbMat">Летальность по зонам</button><button id="lbGal">Галерея смертей</button></div>
      <div id="lbRep2" style="margin-top:6px"></div>
      <h2>Камера</h2><div class="row" id="lbC"></div>
      <h2>Сейчас</h2><div class="live" id="lbLive">—</div>
      <h2>Проверки</h2>
      <div class="row"><button id="lbRun">Проверить генерала</button><button id="lbRunAll">Проверить всех</button></div>
      <div id="lbRep" style="margin-top:8px"></div>
      <div class="row" style="margin-top:12px"><button id="lbExit">Выйти из лаборатории</button></div>`;
    document.body.appendChild(P);
    const hint = el('div', { id: 'labHint' }, 'Мышь: вращать камеру · колесо: приблизить');
    document.body.appendChild(hint);
    const $ = (id) => document.getElementById(id);
    const btn = (parent, text, fn, on) => { const b = el('button', null, text); b.onclick = () => fn(b); if (on) b.classList.add('on'); parent.appendChild(b); return b; };
    const radio = (parent, items, cur, set) => {
      const bs = items.map(([t, v]) => btn(parent, t, () => { set(v); bs.forEach((x) => x.classList.toggle('on', x._v === v)); }, v === cur));
      bs.forEach((b, k) => { b._v = items[k][1]; });
      return bs;
    };
    radio($('lbGen'), squad.map((s, i) => [s.char && s.char.name ? s.char.name : s.key.replace('_', ' '), i]), L.i, (v) => { L.i = v; $('lbW').value = L.w[v]; });
    for (const W of WEAPONS) if (!W.pistol) $('lbW').appendChild(el('option', { value: W.id }, W.name));
    for (const W of WEAPONS) $('lbA').appendChild(el('option', { value: W.id }, W.name));
    $('lbA').value = 'akm';
    $('lbW').value = L.w[L.i];
    $('lbW').onchange = () => { arm(L.i, $('lbW').value); };
    radio($('lbT'), [['1×', 1], ['0,5×', 0.5], ['0,25×', 0.25], ['0,1×', 0.1]], 1, (v) => { L.speed = v; });
    const pb = btn($('lbT'), 'Пауза', (b) => { L.paused = !L.paused; b.classList.toggle('on', L.paused); });
    btn($('lbT'), 'Кадр', () => { L.paused = true; pb.classList.add('on'); L.stepOnce = true; });
    radio($('lbM'), [['Стоит', 'stand'], ['Шаг', 'walk'], ['Бег', 'run']], 'stand', (v) => { L.move = v; });
    btn($('lbM'), 'Присед', (b) => { L.crouch = !L.crouch; b.classList.toggle('on', L.crouch); });
    btn($('lbM'), 'Прицел', (b) => { L.ads = !L.ads; b.classList.toggle('on', L.ads); });
    btn($('lbM'), 'По кругу', (b) => { L.circle = !L.circle; b.classList.toggle('on', L.circle); }, true);
    ZONES.forEach((z, k) => $('lbZ').appendChild(el('option', { value: k }, z.n)));
    $('lbZ').value = 2;
    SIDES.forEach((z, k) => $('lbS').appendChild(el('option', { value: k }, z.n)));
    radio($('lbC'), [['Спереди', 0], ['Сбоку', Math.PI / 2], ['Сзади', Math.PI], ['3/4', 0.7]], 0.7, (v) => { L.cam.yaw = v; L.cam.pitch = 0.12; });
    btn($('lbC'), 'Сверху', () => { L.cam.pitch = 1.2; });
    btn($('lbC'), 'Следить', (b) => { L.cam.follow = !L.cam.follow; b.classList.toggle('on', L.cam.follow); }, true);
    $('lbExit').onclick = () => { location.href = location.pathname; };

    /* орбита мышью */
    const cv = document.querySelector('canvas');
    let drag = null;
    root.addEventListener('mousedown', (e) => { if (P.contains(e.target)) return; drag = { x: e.clientX, y: e.clientY }; });
    root.addEventListener('mouseup', () => { drag = null; });
    root.addEventListener('mousemove', (e) => {
      if (!drag) return;
      L.cam.yaw -= (e.clientX - drag.x) * 0.006; L.cam.pitch = Math.max(-0.3, Math.min(1.45, L.cam.pitch + (e.clientY - drag.y) * 0.005));
      drag = { x: e.clientX, y: e.clientY };
    });
    root.addEventListener('wheel', (e) => { if (P.contains(e.target)) return; L.cam.dist = Math.max(0.8, Math.min(12, L.cam.dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: true });
    void cv;

    /* ------------------------------------------------------ измерения */
    const _v = new THREE.Vector3();
    function focus(s) {
      if (s.rd && s.rd.p && G.dmg && G.dmg.PI) { const p = s.rd.p, k = G.dmg.PI.pelvis * 3; return _v.set(p[k], p[k + 1] + 0.25, p[k + 2]); }
      return s.char.bone('chest').getWorldPosition(_v).add(new THREE.Vector3(0, -0.15, 0));
    }
    function feet(s) {
      const sc = s.char.scale || 1, rest = s.char.rest, out = {};
      for (const SS of ['L', 'R']) {
        const a = s.char.bone('ankle' + SS), t = s.char.bone('toe' + SS);
        if (!a || !t || !rest['ankle' + SS]) continue;
        const pa = a.getWorldPosition(new THREE.Vector3()), pt = t.getWorldPosition(new THREE.Vector3());
        const g = s.ctrl.groundAt(pa.x, pa.z);
        out[SS] = Math.min(pa.y - rest['ankle' + SS][1] * sc, pt.y - rest['toe' + SS][1] * sc) - g;
      }
      return out;
    }
    function armPen(s) {
      const pr = s.rig.armProbe || (s.rig.armProbe = {}), o = {};
      for (const SS of ['L', 'R']) { const B = pr[SS]; o[SS] = B ? Math.max(B.up, B.fo) : 0; }
      return o;
    }
    const cm = (v) => (v * 100).toFixed(1) + ' см';

    /* ---------------------------------------------------- управление */
    function drive(s, dt, o) {
      const c = s.ctrl;
      if (s.dead) return;
      const mv = o ? o.move : L.move;
      c.aiCrouch = o ? !!o.crouch : L.crouch;
      if (o ? o.ads : L.ads) { c.aiReady = 1; c.ads = 1; c.adsWant = true; }
      else if (!o || o.move !== undefined) { c.adsWant = false; }
      if (mv === 'walk' || mv === 'run') {
        c.aiWish = c._aw || (c._aw = new THREE.Vector2());
        c.aiWish.set(0, -1);
        c.aiSprint = mv === 'run';
        if (o ? o.circle !== false : L.circle) s.idleYaw = (s.idleYaw || c.yaw) + dt * (mv === 'run' ? 0.55 : 0.4);
      } else { c.aiWish = null; c.aiSprint = false; }
    }
    /* все генералы — на свои места в строю (после шага по кругу соседи
       могли быть сдвинуты и возвращаться на место) */
    function home() {
      G.revive();
      for (const s of squad) {
        const c = s.ctrl, sp = s.spawn;
        if (!sp || s.dead) continue;
        c.aiWish = null; c.aiSprint = false; c.aiCrouch = false; c.ads = 0; c.adsWant = false; c.aiReady = 0;
        if (c.vel) c.vel.set(0, 0, 0);
        c.pos.set(sp.x, c.groundAt(sp.x, sp.z), sp.z);
        c.yaw = sp.yaw; s.idleYaw = s.formYaw = sp.yaw;
        /* без «догоняния» оружия после мгновенного поворота */
        c.lagYaw = c.yaw; if (c.lagPitch !== undefined) c.lagPitch = c.pitch;
        c.ready = 0;
      }
      G.step(45, 1 / 30);
    }
    function reload(s, empty) {
      const c = s.ctrl;
      if (!c.armed) return false;
      c.reserve = Math.max(c.reserve || 0, 90);
      if (empty) { c.mag = 0; c.chamber = 0; } else c.mag = Math.min(c.mag, 4);
      return c.startReload();
    }
    function fire(i, zk, sk, d) {
      const s = squad[i], Z = ZONES[zk], Sd = SIDES[sk], W = WEAPONS.find((w) => w.id === (L.shotW || $('lbA').value)) || WEAPONS[0];
      const x = Z.x * (sk === 3 ? -1 : 1);
      const o = { d, ang: Sd.a, x, sy: Math.min(1.5, Z.y + 0.2), ammo: W.ammo, v: W.v };
      if (Z.bone) { o.bone = Z.bone; o.off = Z.off.slice(); if (sk === 3) o.off[0] = -o.off[0]; }
      const r = G.testShot(i, Z.y, o);
      L.shotT = { i, t: 0, p0: null, maxV: 0, prev: null, res: r, rest: -1, zone: Z.n, w: W.name };
      return r;
    }
    function trackShot(dt) {
      const T = L.shotT; if (!T) return;
      const s = squad[T.i];
      T.t += dt;
      if (!s.rd || !s.rd.p) return;
      const p = s.rd.p, k = G.dmg.PI.pelvis * 3, x = p[k], z = p[k + 2];
      if (!T.p0) { const h = s.char.root.position; T.p0 = [h.x, h.z]; }
      if (T.prev && dt > 0) { const v = Math.hypot(x - T.prev[0], z - T.prev[1]) / dt; T.maxV = Math.max(T.maxV, v); if (v < 0.05 && T.rest < 0 && T.t > 0.5) T.rest = T.t; }
      T.prev = [x, z];
      T.travel = Math.hypot(x - T.p0[0], z - T.p0[1]);
    }

    $('lbRt').onclick = () => { L.relStep = false; reload(squad[L.i], false); };
    $('lbRe').onclick = () => { L.relStep = false; reload(squad[L.i], true); };
    /* пошаговая перезарядка: пауза на каждом событии дорожки (от хвата
       старого магазина до защёлки нового); дальше — «Кадр» или «Пауза» */
    $('lbRs').onclick = () => {
      const s = squad[L.i];
      if (s._tpr) s._tpr.evN = 0;
      L.relStep = true; L.relN = 0; L.relLog = [];
      if (reload(s, true)) { L.speed = 0.5; $('lbPh').textContent = 'Перезарядка по шагам: идёт…'; }
    };
    function relStepCheck(s) {
      if (!L.relStep) return;
      const st = s._tpr;
      if (s.ctrl.reload < 0) { L.relStep = false; $('lbPh').textContent = 'Готово: ' + L.relLog.join(' → '); return; }
      if (st && (st.evN || 0) > L.relN) {
        L.relN = st.evN; L.relLog.push(PHASE[st.ev] || st.ev);
        L.paused = true; pb.classList.add('on');
        $('lbPh').textContent = 'Шаг ' + L.relLog.length + ': ' + (PHASE[st.ev] || st.ev) + ' (' + s.ctrl.reload.toFixed(2) + ' с). «Пауза» — дальше, «Кадр» — по кадру.';
      }
    }
    /* перемотка: физиология раненого и агония идут в обычном шаге */
    async function ff(sec) {
      if (L.busy) return; L.busy = true;
      for (let k = 0; k < sec; k++) { G.step(30, 1 / 30); trackShot(1); if (k % 2 === 0) { live(squad[L.i]); await idle(); } }
      L.busy = false;
    }
    $('lbFF').onclick = () => ff(10);
    $('lbFF60').onclick = () => ff(60);
    const curW = () => WEAPONS.find((w) => w.id === $('lbA').value) || WEAPONS[0];
    const tS = (t) => (t < 0 ? '—' : t < 1 ? 'сразу' : Math.round(t) + ' с');
    /* броня: очередь в одну область плиты (разброс ±3 см, как у очереди
       с 10 м), пока плита не пропустит пулю */
    /* вернуть живого бойца в исходную стойку, не «возрождая» (броня и
       пробоины остаются) */
    function settle(s) {
      const c = s.ctrl, sp = s.spawn;
      if (!sp || s.dead) return;
      c.aiWish = null; c.aiSprint = false; c.aiCrouch = false; c.ads = 0; c.adsWant = false; c.aiReady = 0; c.ready = 0;
      if (c.vel) c.vel.set(0, 0, 0);
      c.pos.set(sp.x, c.groundAt(sp.x, sp.z), sp.z); c.yaw = sp.yaw; s.idleYaw = s.formYaw = sp.yaw;
      c.lagYaw = c.yaw; if (c.lagPitch !== undefined) c.lagPitch = c.pitch;
      G.step(40, 1 / 30);
    }
    async function armorTest() {
      if (L.busy) return; L.busy = true;
      const s = squad[L.i], W = curW(), rows = [];
      home();
      const lay = G.dmg.armorFor && G.dmg.armorFor(s);
      if (lay) for (const k of ['front', 'back', 'soft']) if (lay[k]) { lay[k].integ = 1; lay[k].hits.length = 0; lay[k].n = 0; }
      let n = 0, penAt = -1;
      for (n = 1; n <= 12; n++) {
        settle(s); G.step(60, 1 / 30);
        /* верх плиты (над руками с оружием), разброс ±3 см */
        const off = [(Math.random() - 0.5) * 0.06, 0.07 + (Math.random() - 0.5) * 0.06, 0];
        const r = G.testShot(L.i, 1.35, { bone: 'chest', off, d: 10, dy: 0.9, ang: 0.2, ammo: W.ammo, v: W.v });   // чуть сверху-сбоку: мимо руки, прижатой к месту удара
        const A = r && r.armor;
        rows.push([n, A ? (A.pen ? 'пробита' : A.ric ? 'рикошет' : 'держит') : (r ? 'мимо плиты: ' + r.zone : 'промах'), A ? Math.round(A.p * 100) + ' %' : '', A ? Math.round(A.integ * 100) + ' %' : '', !(A && A.pen)]);
        G.step(8, 1 / 30); await idle();
        if (A && A.pen) { penAt = n; break; }
        if (s.dead) break;
      }
      let h = `<div style="font-weight:600">Плита · ${W.name}: ${penAt > 0 ? 'пробита на ' + penAt + '-м попадании' : 'выдержала ' + (n - 1)}</div><table><tr class="dim"><td>№</td><td>результат</td><td>шанс пробития</td><td>целостность</td></tr>`;
      for (const r of rows) h += `<tr><td>${r[0]}</td><td class="${r[4] ? 'ok' : 'bad'}">${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`;
      $('lbRep2').innerHTML = h + '</table><div class="dim">На бойце видны пробоины в чехле плиты (светлая крошка керамики — остановлена, тёмная дыра — пробита).</div>';
      L.busy = false; L.paused = false;
    }
    /* летальность: исход по зонам для выбранного оружия, время до падения,
       потери сознания и смерти (физиология 23a, до 4 мин) */
    async function matrix(opt) {
      if (L.busy) return; L.busy = true;
      opt = opt && opt.T ? opt : {};
      const s = squad[L.i], W = curW(), out = [];
      const SC = [['Шея по центру', ZI('Шея (по'), 1], ['Шея сбоку', ZI('Шея (с'), 1], ['Грудь (плита)', ZI('Грудь'), 1], ['Грудь ×3 (плита)', ZI('Грудь'), 3],
        ['Живот ×1', ZI('Живот'), 1], ['Живот ×2', ZI('Живот'), 2], ['Плечо ×2', ZI('Плечо'), 2], ['Бедро', ZI('Бедро'), 1]];
      for (const [nm, zk, k] of SC.filter((x) => !opt.only || opt.only.includes(x[0]))) {
        home();
        const lay = G.dmg.armorFor && G.dmg.armorFor(s);
        if (lay) for (const q of ['front', 'back', 'soft']) if (lay[q]) { lay[q].integ = 1; lay[q].hits.length = 0; }
        let last = null;
        for (let j = 0; j < k; j++) { last = fire(L.i, zk, 0, 10) || last; G.step(3, 1 / 30); }   // темп ~600 выстр/мин
        let t = 0, tD = -1, tK = -1, tX = -1;
        const T = opt.T || 240;
        while (t < T) {
          if (tD < 0 && (s.dead || s.ctrl.legDown)) tD = t;
          if (tK < 0 && s.unconscious) tK = t;
          if (s.dead && (s.finished || !s.rd || !s.rd.ag)) { tX = t; break; }
          if (!s.dead && tD >= 0 && t > 5 && !s.ctrl.legDown && s.spawnT !== undefined) break;
          G.step(15, 1 / 30); t += 0.5;
          if ((t * 2) % 8 === 0) { $('lbRep2').innerHTML = '<span class="dim">' + nm + ' · ' + Math.round(t) + ' с…</span>'; await idle(); }
        }
        const ph = s.dmg && s.dmg.ph;
        out.push([nm, tS(tD), tS(tK), tX >= 0 ? tS(tX) : 'жив', ph ? Math.round(100 * ph.lossF) + ' %' : '', (s.deathCause || (last && last.organs ? last.organs.slice(0, 2).join(', ') : '')).slice(0, 60), tX < 0]);
      }
      let h = `<div style="font-weight:600">${W.name} · 10 м · спереди</div><table><tr class="dim"><td>зона</td><td>упал</td><td>без созн.</td><td>смерть</td><td>кровь</td><td>причина</td></tr>`;
      for (const r of out) h += `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="${r[6] ? 'ok' : 'bad'}">${r[3]}</td><td>${r[4]}</td><td class="dim">${r[5]}</td></tr>`;
      $('lbRep2').innerHTML = h + '</table>';
      root.__LAB_MATRIX = out;
      home(); L.busy = false;
    }
    /* галерея: по очереди разные оружие/зоны, каждое падение — 8 с в реальном
       времени (камера следит), чтобы глазами проверить анимации смерти */
    const GAL = [['akm', 'Шея (с'], ['ak74', 'Живот'], ['svd', 'Грудь'], ['mp5a3', 'Шея (по'], ['m870', 'Грудь'], ['glock18c', 'Живот'], ['scar', 'Голова'], ['m416', 'Бедро'], ['akm', 'Плечо']];
    function galNext() {
      const g = L.gal; if (!g) return;
      if (g.k >= GAL.length) { L.gal = null; L.shotW = null; $('lbRep2').innerHTML = '<span class="dim">Галерея закончена</span>'; return; }
      const [w, z] = GAL[g.k];
      home(); L.shotW = w; fire(L.i, ZI(z), g.k % 2 ? 1 : 0, 12);
      $('lbRep2').innerHTML = '<span class="dim">Галерея ' + (g.k + 1) + '/' + GAL.length + ': ' + (WEAPONS.find((x) => x.id === w) || {}).name + ' → ' + ZONES[ZI(z)].n + '</span>';
      g.t = 0; g.k++;
    }
    $('lbArm').onclick = armorTest;
    $('lbMat').onclick = () => matrix();
    $('lbGal').onclick = () => { if (L.gal) { L.gal = null; L.shotW = null; return; } L.gal = { k: 0, t: 0 }; L.paused = false; galNext(); };
    $('lbFire').onclick = () => { fire(L.i, +$('lbZ').value, +$('lbS').value, +$('lbD').value || 10); };
    $('lbRev').onclick = () => { home(); L.shotT = null; };

    /* --------------------------------------------------------- цикл */
    let prev = performance.now(), liveT = 0;
    function frame() {
      requestAnimationFrame(frame);
      const now = performance.now(), rdt = Math.min(0.05, (now - prev) / 1000); prev = now;
      if (L.busy) return;
      const s = squad[L.i];
      if (!L.paused || L.stepOnce) {
        const dt = (L.stepOnce ? 1 / 30 : rdt) * L.speed;
        L.stepOnce = false;
        drive(s, dt);
        G.step(1, dt);
        trackShot(dt);
        relStepCheck(s);
        if (L.gal && (L.gal.t += dt) > 8) galNext();
      }
      if (L.cam.follow || !L.camT) L.camT = focus(s).clone();
      const t = L.camT, C = L.cam, ry = (s.ctrl.yaw || 0) + C.yaw;
      const cp = Math.cos(C.pitch);
      G.spectate([t.x - Math.sin(ry) * cp * C.dist, t.y + Math.sin(C.pitch) * C.dist, t.z - Math.cos(ry) * cp * C.dist], [t.x, t.y, t.z], 45);
      liveT -= rdt;
      if (liveT <= 0) { liveT = 0.2; live(s); }
    }
    function live(s) {
      const c = s.ctrl, ph = s.dmg && s.dmg.ph, ap = armPen(s), ft = feet(s), st = s._tpr;
      const lines = [];
      lines.push((s.dead ? 'Выбыл · ' + (s.deathCause || '') : 'В строю') + (c.legDown ? ' · не стоит на ногах' : c.limp > 0.05 ? ' · хромает ' + Math.round(c.limp * 100) + '%' : ''));
      if (ph) {
        const bl = (ph.src || []).reduce((a, x) => a + (x.ml || x.r || 0), 0);
        lines.push('Кровопотеря ' + Math.round(ph.lost || 0) + ' мл (' + Math.round(100 * (ph.lost || 0) / (ph.vol || 5500)) + '%)' + (bl > 0 ? ' · ' + bl.toFixed(1) + ' мл/с' : ''));
        if (s.dead && s.rd && s.rd.ag && !s.finished) lines.push((s.unconscious ? 'Без сознания' : 'Агония в сознании') + ' · сознание ' + Math.round(100 * (ph.conscious || 0)) + '% · гипоксия ' + Math.round(100 * (ph.hyp || 0)) + '%' + (ph.apnea ? ' · дыхание остановлено' : ph.asp > 0 ? ' · кровь в дыхательных путях' : '') + (s.sfx && s.sfx.downed ? ' · голос: ' + s.sfx.downed.mode : ''));
        if (ph.inj && ph.inj.length) lines.push(ph.inj.slice(-4).map((x) => '· ' + x.text).join('\n'));
      }
      if (!s.dead) {
        lines.push('Руки в корпусе: Л ' + cm(ap.L) + ' · П ' + cm(ap.R));
        lines.push('Стопы над землёй: Л ' + (ft.L !== undefined ? cm(ft.L) : '—') + ' · П ' + (ft.R !== undefined ? cm(ft.R) : '—'));
        if (c.reload >= 0) lines.push('Перезарядка ' + c.reload.toFixed(2) + ' с · магазин: ' + ({ gun: 'в оружии', hand: 'в руке', none: 'сброшен' }[st && st.mag] || '—'));
        lines.push('Патроны ' + (c.mag || 0) + '+' + (c.chamber || 0) + ' / ' + (c.reserve || 0) + ' · скорость ' + (c.speed || 0).toFixed(1) + ' м/с');
      }
      { const AR = G.dmg.armorFor && G.dmg.armorFor(s); if (AR && AR.front) lines.push('Плита: спереди ' + Math.round(AR.front.integ * 100) + '% (' + (AR.front.n || 0) + ' поп.) · сзади ' + Math.round(AR.back.integ * 100) + '%'); }
      const T = L.shotT;
      if (T && T.i === L.i) lines.push('Выстрел: ' + T.w + ' → ' + T.zone + (T.res && T.res.died ? ' · выбыл' : '') + (T.travel !== undefined ? '\nТело: смещение ' + T.travel.toFixed(2) + ' м · макс. ' + T.maxV.toFixed(1) + ' м/с' + (T.rest > 0 ? ' · легло за ' + T.rest.toFixed(1) + ' с' : '') : ''));
      $('lbLive').textContent = lines.join('\n');
    }

    /* ------------------------------------------------ прогон проверок */
    const idle = () => new Promise((r) => setTimeout(r, 0));
    async function suite(i) {
      const s = squad[i], rows = [], dt = 1 / 30;
      const name = s.char && s.char.name ? s.char.name : s.key;
      home();
      /* 1. позы и движение */
      for (const [n, o] of [['Стоит', { move: 'stand' }], ['Присед', { move: 'stand', crouch: true }], ['Прицел', { move: 'stand', ads: true }], ['Шаг', { move: 'walk' }], ['Бег', { move: 'run' }]]) {
        let arm = 0, sink = 0, flt = 0;
        for (let f = 0; f < 75; f++) {
          drive(s, dt, o); G.step(1, dt);
          if (f < 15) continue;
          const ap = armPen(s), ft = feet(s);
          arm = Math.max(arm, ap.L, ap.R);
          const lo = Math.min(ft.L ?? 0, ft.R ?? 0);
          sink = Math.max(sink, -lo);
          if (o.move === 'stand') flt = Math.max(flt, lo);
          if (f % 15 === 0) await idle();
        }
        drive(s, dt, { move: 'stand' });
        rows.push([n, 'руки ' + cm(arm), arm <= LIM.arm]);
        rows.push([n, 'стопа в земле ' + cm(sink) + (o.move === 'stand' ? ' · над землёй ' + cm(flt) : ''), sink <= LIM.sink && flt <= LIM.float]);
      }
      G.step(30, dt);
      /* 2. перезарядки */
      for (const [n, empty] of [['Тактическая перезарядка', false], ['Перезарядка с пустым', true]]) {
        if (!reload(s, empty)) { rows.push([n, 'не началась', false]); continue; }
        let arm = 0, sawHand = false, sawDrop = false, f = 0;
        while (s.ctrl.reload >= 0 && f < 400) {
          G.step(1, dt); f++;
          const ap = armPen(s); arm = Math.max(arm, ap.L, ap.R);
          const st = s._tpr || {};
          if (st.mag === 'hand') sawHand = true; if (st.mag === 'none') sawDrop = true;
          if (f % 15 === 0) await idle();
        }
        const magIn = !s.gun || !s.gun.magObj || s.gun.magObj.visible;
        const ok = arm <= LIM.arm + 0.01 && magIn && (sawHand || !s.gun.magObj) && s.ctrl.mag > 0;
        rows.push([n, (f * dt).toFixed(1) + ' с · магазин ' + (sawHand ? 'в руке' : '—') + (sawDrop ? ', сброшен' : '') + ', на месте ' + (magIn ? 'да' : 'нет') + ' · руки ' + cm(arm), ok]);
        G.step(15, dt);
      }
      /* 3. поражение: падение тела */
      for (const zk of [0, 1, 2, 3, 5, 6]) {
        home();
        const r = fire(i, zk, 0, 10);
        for (let f = 0; f < 240; f++) { G.step(1, dt); trackShot(dt); if (f % 20 === 0) await idle(); }
        const T = L.shotT, died = s.dead;
        const pl = r && r.armor && !r.penetrated ? 'броня держит (' + r.armor.name + ') · ' : r && r.armor ? 'броня пробита · ' : '';
        const txt = pl + (died ? 'выбыл' : 'в сознании') + (s.ctrl.legDown ? ', не стоит на ногах' : s.ctrl.limp > 0.05 ? ', хромает' : '') + (T.travel !== undefined ? ' · тело ' + T.travel.toFixed(2) + ' м, макс. ' + T.maxV.toFixed(1) + ' м/с' : '') + (r && r.organs && r.organs.length ? ' · ' + r.organs.slice(0, 3).join(', ') : '');
        const ok = T.travel === undefined || (T.travel <= LIM.travel && T.maxV <= LIM.vmax);
        rows.push(['Попадание: ' + ZONES[zk].n.toLowerCase(), txt, ok]);
      }
      G.revive(); G.step(10, dt); L.shotT = null;
      return { name, rows };
    }
    function report(list) {
      let h = '';
      for (const R of list) {
        const bad = R.rows.filter((r) => !r[2]).length;
        h += `<div style="margin:6px 0 2px;font-weight:600">${R.name} — <span class="${bad ? 'bad' : 'ok'}">${bad ? 'замечаний: ' + bad : 'всё в норме'}</span></div><table>`;
        for (const [a, b, ok] of R.rows) h += `<tr><td class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '!'}</td><td>${a}</td><td class="dim">${b}</td></tr>`;
        h += '</table>';
      }
      h += `<div class="dim" style="margin-top:6px">Пороги: руки ≤ ${cm(LIM.arm)}, стопа в земле ≤ ${cm(LIM.sink)}, над землёй ≤ ${cm(LIM.float)}, тело ≤ ${LIM.travel} м и ≤ ${LIM.vmax} м/с.</div>`;
      $('lbRep').innerHTML = h;
    }
    async function run(all) {
      if (L.busy) return;
      L.busy = true; $('lbRep').innerHTML = '<span class="dim">Идёт проверка…</span>';
      const out = [];
      try { for (const i of all ? squad.map((_, k) => k) : [L.i]) { out.push(await suite(i)); report(out); } }
      catch (e) { $('lbRep').innerHTML = '<span class="bad">Ошибка: ' + (e && e.message) + '</span>'; console.error(e); }
      L.busy = false;
      root.__LAB_REPORT = out;
    }
    $('lbRun').onclick = () => run(false);
    $('lbRunAll').onclick = () => run(true);
    root.__LAB = { L, run, suite, fire, reload, feet, armPen, home, armorTest, matrix, ff };
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitReady); else waitReady();
})();
