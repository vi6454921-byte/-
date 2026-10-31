/* ==========================================================================
   AEGIS · интерфейс главной страницы.
   Состояния: menu (панель справа) · fly (свободная камера) · play (в теле
   генерала) · battle (выбор карты) · pause · settings · tutorial · armory.
   С игрой общается через window.AEGIS_GAME (29_game.js), игра зовёт
   window.AEGIS_UI.on*() при событиях ввода.
   ========================================================================== */
(function () {
  'use strict';
  const AE = window.AEGIS;
  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const IDLE_MS = 5000;
  let G = null;                                   // API игры
  let SET = AE.loadSettings();
  let LOADOUTS = AE.loadLoadouts();
  const st = { name: 'loading', back: [], lastAct: 0, lockLostAt: 0, prevPlay: false };

  /* ----------------------------------------------------- состояния --- */
  const STATES = ['loading', 'menu', 'fly', 'play', 'battle', 'pause', 'settings', 'tutorial', 'armory', 'look'];
  const OVERLAY = { pause: 1, settings: 1, tutorial: 1, armory: 1, look: 1 };
  function setState(name) {
    const prev = st.name;
    st.name = name;
    for (const s of STATES) body.classList.toggle('st-' + s, s === name);
    if (!G) return;
    const overlay = !!OVERLAY[name];
    G.setInput(!overlay && name !== 'battle');
    G.pause(overlay || name === 'battle');
    G.setRender(name !== 'armory');
    if (G.setAmbient) G.setAmbient(name !== 'armory' && name !== 'look');
    G.setHighlight(name === 'menu' || name === 'battle' || name === 'fly');
    if (name === 'menu' || name === 'battle' || overlay) G.unlock();
    if (name === 'fly' || name === 'play') { st.lastAct = performance.now(); G.lock(); }
    if (name === 'menu') renderGenerals();
    if (prev === 'loading' && name !== 'loading') $('loading').classList.add('done');
  }
  /* окно поверх: запоминаем, куда вернуться */
  function openOverlay(name) {
    if (st.name !== name) st.back.push(st.name);
    setState(name);
  }
  function closeOverlay() {
    let to = st.back.pop() || 'menu';
    if (to === 'play' && !(G && G.state().active)) to = 'menu';
    if (to === 'fly') to = 'menu';
    setState(to);
  }
  const embodied = () => !!(G && G.state().active);

  /* ------------------------------------------------ главное меню --- */
  function renderGenerals() {
    const box = $('genList');
    if (!box || !G) return;
    const sel = G.selected();
    box.innerHTML = '';
    for (const g of AE.GENERALS) {
      const b = document.createElement('button');
      b.className = 'gen ' + g.team + (g.key === sel ? ' on' : '');
      b.innerHTML = '<b></b><span></span><em class="tr"></em>';
      b.children[0].textContent = g.last;
      b.children[1].textContent = g.teamName + ' · «' + g.call + '»';
      b.children[2].textContent = g.trait ? g.trait.icon + ' ' + g.trait.name : '';
      b.title = g.rank + ' ' + g.full + (g.trait ? '\n' + g.trait.name + ': ' + g.trait.lines.join('; ') : '');
      b.onclick = () => { G.select(g.key); G.focus(g.key); renderGenerals(); };
      box.appendChild(b);
    }
  }
  /* «Оружие» / «В бой» без выбранного генерала — берём случайного */
  function pickGeneral() {
    const r = G.ensureSelected();
    if (r.random) {
      G.focus(r.key);
    }
    G.setHighlight(true);
    renderGenerals();
    return r;
  }
  let battleReturn = 'menu';
  function openBattle() {
    if (!G) return;
    battleReturn = st.name === 'pause' ? 'pause' : 'menu';
    const active = G.state().active;
    const r = active ? { key: active } : pickGeneral();
    if (active) G.select(active);
    const g = AE.GEN[r.key];
    $('battleGen').innerHTML = 'Генерал: <b></b> · ' + g.teamName;
    $('battleGen').querySelector('b').textContent = g.last;
    if (g.trait) { const sm = document.createElement('small'); sm.style.cssText = 'display:block;margin-top:4px;opacity:.85'; sm.textContent = g.trait.icon + ' ' + g.trait.name + ': ' + g.trait.lines.join(' · '); $('battleGen').appendChild(sm); }
    setState('battle');
    $('battleBack').focus();
  }
  function closeBattle() {
    setState(battleReturn);
    $(battleReturn === 'pause' ? 'pBattle' : 'btnBattle').focus();
  }
  $('btnBattle').onclick = openBattle;
  $('pBattle').onclick = openBattle;
  $('battleBack').onclick = closeBattle;
  $('battleTraining').onclick = () => {if(G && G.currentMap && G.currentMap())startOperation(null);else closeBattle();};
  /* v21: сектор большой карты — «Случайный» или один из трёх; выбор запоминается */
  const SEC_KEY='aegis.sector.v1';
  const secRead=()=>{try{return JSON.parse(localStorage.getItem(SEC_KEY)||'{}')||{}}catch(e){return {}}};
  const secPick=(map)=>secRead()[map]||'random';
  function sectorChips(card){
    const map=card.dataset.map,GS=window.GSectors;
    if(!GS||!GS.has(map)||card.querySelector('.map-sec'))return;
    const box=document.createElement('div');box.className='map-sec';box.setAttribute('role','radiogroup');box.setAttribute('aria-label','Сектор карты');
    box.innerHTML='<div class="map-sec-cap">СЕКТОР</div>';
    const items=[{id:'random',short:'Случайный',about:'Сектор выбирается случайно'}].concat(GS.list(map));
    const sync=()=>{const v=secPick(map);for(const b of box.querySelectorAll('.sec')){const on=b.dataset.sector===String(v);b.classList.toggle('on',on);b.setAttribute('aria-checked',on?'true':'false')}};
    for(const it of items){const b=document.createElement('button');b.type='button';b.className='sec';b.dataset.sector=String(it.id);b.setAttribute('role','radio');
      b.textContent=it.id==='random'?it.short:it.id+' · '+it.short;b.title=it.name?it.name+' — '+it.about:it.about;
      b.onclick=()=>{const all=secRead();all[map]=String(it.id);try{localStorage.setItem(SEC_KEY,JSON.stringify(all))}catch(e){}sync()};box.append(b)}
    card.insertBefore(box,card.querySelector('.map-start'));sync();
  }
  function startOperation(map){
    if(!G||!G.travel)return;
    try{const active=G.state().active,key=active||G.ensureSelected().key;G.travel(map,key,map&&window.GSectors&&window.GSectors.has(map)?{sector:secPick(map)}:undefined);}
    catch(e){document.querySelector('#battle .b-note').textContent=e.message||String(e);}
  }
  for(const card of document.querySelectorAll('#battle .map')){sectorChips(card);card.querySelector('.map-start').onclick=()=>startOperation(card.dataset.map);}
  $('btnSettings').onclick = () => openSettings();
  $('btnArmory').onclick = () => {
    if (!G) return;
    const r = pickGeneral();
    if (r.random) setTimeout(() => { if (st.name === 'menu') openArmory(r.key); }, 1300);
    else openArmory(r.key);
  };
  /* v26: «Внешний вид» — редактор образа бойцов (js/app/looks.js) */
  if ($('btnLook')) $('btnLook').onclick = () => { if (G) openLook(G.selected() || G.ensureSelected().key); };

  /* --------------------------------------------------------- пауза --- */
  function openPause() {
    itEv.menu = true;
    const a = G.state().active;
    const g = a ? AE.GEN[a] : null;
    $('pauseWho').innerHTML = g ? 'В теле: <b></b> · ' + g.teamName + (g.trait ? '<br><small></small>' : '') : '';
    if (g) $('pauseWho').querySelector('b').textContent = g.short;
    if (g && g.trait) $('pauseWho').querySelector('small').textContent = g.trait.icon + ' ' + g.trait.name + ': ' + g.trait.lines.join(' · ');
    $('pLeave').style.display = g && !(window.GMaps && GMaps.id) ? '' : 'none'; // в бою из тела не выходят
    const ps = $('pauseSub');
    if (ps) { let nm = 'Учебный полигон'; try { const id = window.GMaps && GMaps.id; if (id) { const c = document.querySelector('#battle .map[data-map="' + id + '"] .map-n'); nm = c ? c.textContent.trim() : 'Бой'; } } catch (e) { /* */ } ps.textContent = nm + ' · пауза'; }
    resetQuit();
    openOverlay('pause');
  }
  $('pResume').onclick = () => closeOverlay();
  /* выход из боя: второй клик в течение 3 с подтверждает; работает и без pointer lock */
  const onMap = () => !!(window.GMaps && GMaps.id);
  let quitT = 0;
  function resetQuit() {
    clearTimeout(quitT);
    const q = $('pQuit'); if (!q) return;
    q.hidden = !onMap(); q.classList.remove('arm');
    q.querySelector('span').textContent = 'Выйти из боя';
  }
  $('pQuit').onclick = () => {
    const q = $('pQuit');
    if (!q.classList.contains('arm')) {
      q.classList.add('arm'); q.querySelector('span').textContent = 'ТОЧНО? ЕЩЁ РАЗ';
      quitT = setTimeout(resetQuit, 3000);
      return;
    }
    try { sessionStorage.removeItem('aegis.levelTransfer.v1'); } catch (e) { /* */ }
    const u = new URL(location.href); u.searchParams.delete('map'); u.searchParams.delete('weather');
    location.assign(u.href);
  };
  function mapToast(text) {
    let t = $('mapToast');
    if (!t) { t = document.createElement('div'); t.id = 'mapToast'; document.body.appendChild(t); }
    t.textContent = text; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 4500);
  }
  $('pArmory').onclick = () => { const a = G.state().active || pickGeneral().key; openArmory(a); };
  if ($('pLook')) $('pLook').onclick = () => openLook(G.state().active || G.selected() || G.ensureSelected().key);
  $('pSettings').onclick = () => openSettings();
  $('pLeave').onclick = () => { if (window.GMaps && GMaps.id) return; st.back = []; G.pause(false); G.disembody(); setState('menu'); };
  if (window.GMaps && GMaps.id) $('pLeave').style.display = 'none'; // в бою из тела не выходят
  $('pMain').onclick = () => { st.back = []; G.pause(false); if (embodied()) G.disembody(); setState('menu'); };

  /* первый жест пользователя (клик, клавиша, касание) будит звук леса ещё до вселения */
  const unlockAudio = () => {
    if (!G || !G.audioInit) return;
    try { G.audioInit(); } catch (e) { /* */ }
    ['pointerdown', 'keydown', 'touchstart'].forEach((t) => window.removeEventListener(t, unlockAudio, true));
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach((t) => window.addEventListener(t, unlockAudio, true));
  window.AEGIS_UNLOCK_AUDIO = unlockAudio;

  /* ------------------------------------------------ события игры --- */
  window.AEGIS_UI = {
    onGameReady(api) {
      G = api;
      /* на карте погода случайная (GWeather.pickBattle) — сохранённую не применяем */
      if (onMap()) { document.body.classList.add('map-battle'); const S2 = Object.assign({}, SET); delete S2.weather; G.applySettings(S2); }
      else G.applySettings(SET);
      window.__AEGIS_SENS = SET.sens;
      updateKeyHints();
      setState('menu');
      if(window.GMaps){const transfer=GMaps.readTransfer();if(GMaps.id||transfer){const key=transfer&&transfer.key||'alpha_1';G.select(key);G.embody(key);GMaps.clearTransfer();try{const wk=G.weather&&G.weather(),nm=window.GWeather&&GWeather.NAMES&&GWeather.NAMES[wk];if(nm)setTimeout(()=>mapToast('Погода: '+nm),1200);}catch(e){}if(window.AEGIS_INTRO){AEGIS_INTRO.markReady();}return;}}
      /* лес звучит сразу: аудио-контекст запускается первым же жестом (браузеры требуют жест) */
      try { if (navigator.userActivation && navigator.userActivation.hasBeenActive) G.audioInit && G.audioInit(); } catch (e) { /* */ }
      const IN = window.AEGIS_INTRO;
      const firstRun = !AE.LS.get('aegis.tutorial', false);
      if (IN && IN.active) {
        IN.markReady();
        IN.onClose(() => { if (firstRun) setTimeout(() => openTutorial(), 650); });
      } else if (firstRun) setTimeout(() => openTutorial(), 700);
    },
    /* F-тап у ящика: та же оружейная, что и в паузе; закрытие применяет сборку к живому бойцу */
    openCrate() {
      if (!G || st.name !== 'play') return false;
      const key = G.state().active;
      if (!key || !AE.GEN[key]) return false;
      st.back = [];
      openArmory(key);
      return true;
    },
    onFreeMove() {
      st.lastAct = performance.now();
      itEv.fly = true;
      if (st.name === 'menu') setState('fly');
    },
    onFreeLook() { st.lastAct = performance.now(); },
    onSceneClick() {
      if (st.name === 'menu') setState('fly');
      else if (st.name === 'fly' || st.name === 'play') G.lock();
    },
    onMenuKey() {
      itEv.menu = true;
      if (st.name === 'fly') setState('menu');
      else if (st.name === 'menu') setState('fly');
      else if (st.name === 'play') openPause();
      else if (st.name === 'pause') closeOverlay();
    },
    /* v23: Esc в бою всегда открывает меню (В бой, Оружие, Настройки…); окно инвентаря при этом закрывается */
    openMenu() {
      if (capture || !G) return false;
      if (st.name === 'play') { openPause(); return true; }
      return st.name === 'pause';
    },
    onEscape() {
      if (capture) return;
      if (window.GLoot && window.GLoot.isOpen()) { window.GLoot.close(); if (st.name === 'play') openPause(); return; }   // v23: инвентарь → меню
      if (performance.now() - st.lockLostAt < 350) return;   // Esc уже снял захват курсора
      if (st.name === 'settings' || st.name === 'tutorial') closeOverlay();
      else if (st.name === 'armory') closeArmory();
      else if (st.name === 'look') closeLook();
      else if (st.name === 'pause') closeOverlay();
      else if (st.name === 'play') openPause();
      else if (st.name === 'battle') closeBattle();
      else if (st.name === 'fly') setState('menu');
    },
    onLockLost() {
      st.lockLostAt = performance.now();
      if (window.GLoot && window.GLoot.isOpen()) return;   // v22: курсор отпущен для окна обыска — не пауза
      if (st.name === 'play') openPause();
      else if (st.name === 'fly') setState('menu');
    },
    onEmbody() { st.back = []; setState('play'); },
    onDisembody() { if (st.name === 'play') setState('fly'); },
    onFpsToggle(on) { SET.fps = on; AE.saveSettings(SET); const c = $('fpsChk'); if (c) c.checked = on; }
  };

  /* камера стоит больше 5 с — панель возвращается */
  setInterval(() => {
    if (st.name !== 'fly' || !G) return;
    if (performance.now() - st.lastAct > IDLE_MS && !heldMove()) setState('menu');
  }, 250);

  /* подсветка клавиш WASD и учёт удержания */
  const held = new Set();
  function heldMove() { return held.size > 0; }
  const MOVE = ['fwd', 'back', 'left', 'right', 'jump', 'crouch'];
  function actOf(code) { for (const a of MOVE) if (SET.binds[a] === code) return a; return null; }
  addEventListener('keydown', (e) => {
    const a = actOf(e.code);
    if (!a) return;
    held.add(a);
    const k = document.querySelector('#wasd .k[data-act="' + a + '"]');
    if (k) k.classList.add('on');
  });
  addEventListener('keyup', (e) => {
    const a = actOf(e.code);
    if (!a) return;
    held.delete(a);
    st.lastAct = performance.now();
    const k = document.querySelector('#wasd .k[data-act="' + a + '"]');
    if (k) k.classList.remove('on');
  });
  addEventListener('blur', () => { held.clear(); document.querySelectorAll('#wasd .k.on').forEach((k) => k.classList.remove('on')); });

  function updateKeyHints() {
    const B = SET.binds, kn = AE.keyName;
    for (const k of document.querySelectorAll('#wasd .k')) k.textContent = kn(B[k.dataset.act]);
    $('wasdTxt').textContent = 'Мышь: обзор · ' + kn(B.jump) + ' / ' + kn(B.crouch) + ': выше / ниже · ' + kn(B.sprint) + ': быстрее';
    $('wasdTxt2').textContent = 'Подлетите к генералу и удерживайте ' + kn(B.use) + ': вселиться · Esc: меню';
    $('menuFoot').textContent = 'Esc: меню · ' + kn(B.inventory) + ': инвентарь · ' + kn(B.fps) + ': FPS';
    const pf = $('pauseFoot'); if (pf) pf.textContent = 'Esc: продолжить · ' + kn(B.inventory) + ': инвентарь · ' + kn(B.loot) + ': обыск';
    $('fpsKey').textContent = kn(B.fps);
  }

  /* ----------------------------------------------------- настройки --- */
  let savedT = 0;
  function saved() {
    AE.saveSettings(SET);
    const s = $('setSaved');
    s.classList.add('on');
    clearTimeout(savedT);
    savedT = setTimeout(() => s.classList.remove('on'), 1200);
  }
  function openSettings() {
    renderBinds();
    renderGfx();
    renderSnd();
    gpuInfo();
    openOverlay('settings');
  }
  $('setBack').onclick = () => { if (!capture) closeOverlay(); };
  for (const b of document.querySelectorAll('#setTabs button')) {
    b.onclick = () => {
      if (capture) stopCapture();
      for (const x of document.querySelectorAll('#setTabs button')) x.classList.toggle('on', x === b);
      for (const p of document.querySelectorAll('.s-pane')) p.classList.toggle('on', p.dataset.pane === b.dataset.tab);
    };
  }
  /* --- переназначение клавиш --- */
  let capture = null;
  function renderBinds() {
    const box = $('bindList');
    box.innerHTML = '';
    let grp = null, gEl = null;
    for (const a of AE.ACTIONS) {
      if (a.g !== grp) {
        grp = a.g;
        gEl = document.createElement('div');
        gEl.className = 'b-group';
        gEl.innerHTML = '<div class="s-cap"></div>';
        gEl.firstChild.textContent = grp;
        box.appendChild(gEl);
      }
      if (a.g === 'Общее' && gEl && !gEl.querySelector('.b-row.fixed')) {
        const f = document.createElement('div');
        f.className = 'b-row fixed';
        f.innerHTML = '<span>Меню: В бой, Оружие, Настройки (пауза)</span><button class="b-key" disabled title="Не переназначается">Esc</button>';
        gEl.appendChild(f);
      }
      const r = document.createElement('div');
      r.className = 'b-row';
      r.dataset.act = a.id;
      r.innerHTML = '<span></span><button class="b-key"></button>';
      r.firstChild.textContent = a.l;
      const k = r.lastChild;
      const code = SET.binds[a.id];
      k.textContent = code ? AE.keyName(code) : 'Не назначено';
      k.classList.toggle('none', !code);
      k.onclick = (e) => { e.stopPropagation(); startCapture(a.id, k); };
      gEl.appendChild(r);
    }
  }
  function startCapture(act, btn) {
    stopCapture();
    capture = { act, btn };
    btn.classList.add('wait');
    btn.textContent = 'Клавиша, кнопка или колесо';
    setTimeout(() => {
      if (!capture) return;
      addEventListener('keydown', onCapKey, true);
      addEventListener('mousedown', onCapMouse, true);
      addEventListener('wheel', onCapWheel, { capture: true, passive: false });
      addEventListener('contextmenu', blockCtx, true);
    }, 0);
  }
  function stopCapture() {
    removeEventListener('keydown', onCapKey, true);
    removeEventListener('mousedown', onCapMouse, true);
    removeEventListener('wheel', onCapWheel, { capture: true });
    setTimeout(() => removeEventListener('contextmenu', blockCtx, true), 50);
    if (capture) { capture.btn.classList.remove('wait'); capture = null; renderBinds(); }
  }
  function blockCtx(e) { e.preventDefault(); e.stopPropagation(); }
  function onCapKey(e) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.code === 'Escape') { stopCapture(); return; }
    if (AE.RESERVED.includes(e.code)) return;
    applyBind(e.code);
  }
  function onCapMouse(e) {
    e.preventDefault(); e.stopImmediatePropagation();
    applyBind('Mouse' + e.button);
  }
  /* колесо мыши тоже назначается: прокрутка вверх и вниз — отдельные «клавиши» */
  function onCapWheel(e) {
    if (!e.deltaY) return;
    e.preventDefault(); e.stopImmediatePropagation();
    applyBind(e.deltaY < 0 ? 'WheelUp' : 'WheelDown');
  }
  function applyBind(code) {
    const act = capture.act;
    const swapped = AE.bind(SET, act, code);
    stopCapture();
    commitBinds();
    if (swapped) {
      const A = AE.ACTIONS.find((x) => x.id === swapped), B0 = AE.ACTIONS.find((x) => x.id === act);
      const r = document.querySelector('.b-row[data-act="' + swapped + '"]');
      if (r) { r.classList.add('flash'); setTimeout(() => r.classList.remove('flash'), 1400); }
    }
  }
  function commitBinds() {
    if (G) G.applySettings({ binds: SET.binds });
    updateKeyHints();
    saved();
  }
  $('bindReset').onclick = () => { SET.binds = Object.assign({}, AE.DEFAULT_BINDS); renderBinds(); commitBinds(); };
  /* --- графика --- */
  function renderGfx() {
    for (const b of document.querySelectorAll('#qList button')) {
      b.classList.toggle('on', b.dataset.q === SET.quality);
      b.onclick = () => { SET.quality = b.dataset.q; G && G.applySettings({ quality: SET.quality }); renderGfx(); saved(); };
    }
    for (const b of document.querySelectorAll('#wList button')) {
      b.classList.toggle('on', b.dataset.w === (SET.weather || 'day'));
      b.onclick = () => { SET.weather = b.dataset.w; G && G.applySettings({ weather: SET.weather }); renderGfx(); saved(); };
    }
    $('fpsChk').checked = !!SET.fps;
    if ($('hcChk')) $('hcChk').checked = !!SET.hardcore;
  }
  $('fpsChk').onchange = (e) => { SET.fps = e.target.checked; G && G.applySettings({ fps: SET.fps }); saved(); };
  if ($('hcChk')) $('hcChk').onchange = (e) => { SET.hardcore = e.target.checked; G && G.applySettings({ hardcore: SET.hardcore }); saved(); };
  /* --- звук и мышь --- */
  function renderSnd() {
    $('volR').value = Math.round(SET.volume * 100);
    $('volV').textContent = Math.round(SET.volume * 100) + '%';
    $('sensR').value = Math.round(SET.sens * 100);
    $('sensV').textContent = SET.sens.toFixed(2) + '×';
  }
  $('volR').oninput = (e) => { SET.volume = +e.target.value / 100; renderSnd(); G && G.applySettings({ volume: SET.volume }); };
  $('volR').onchange = saved;
  $('sensR').oninput = (e) => { SET.sens = +e.target.value / 100; window.__AEGIS_SENS = SET.sens; renderSnd(); G && G.applySettings({ sens: SET.sens }); };
  $('sensR').onchange = saved;
  function gpuInfo() {
    const el = $('gpuInfo');
    if (el.dataset.done) return;
    el.dataset.done = 1;
    try {
      const c = document.createElement('canvas'), gl = c.getContext('webgl2');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const r = gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'WebGL 2 недоступен';
      el.innerHTML = '<b>Ваша видеокарта</b><span></span> · ядер процессора: ' + (navigator.hardwareConcurrency || '?') +
        (navigator.deviceMemory ? ' · ОЗУ ≈ ' + navigator.deviceMemory + ' ГБ' : '') + ' · рекомендуемая графика: ' + AE.QUALITY_NAMES[AE.detectQuality()];
      el.querySelector('span').textContent = r;
      const lose = gl && gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    } catch (e) { el.textContent = ''; }
  }
  $('tutAgain').onclick = () => { st.back.push('settings'); setState('tutorial'); startTutorial(); itReset(); };

  /* ------------------------------------------- обучение в игре (v5) --- */
  /* Список задач в левом верхнем углу: отмечается сам, по событиям игры.
     Прогресс хранится в aegis.ingameTut; «Пройти обучение заново» сбрасывает. */
  const itEv = { fly: false, menu: false };
  let IT = AE.LS.get('aegis.ingameTut', { done: {}, off: false });
  if (!IT || typeof IT !== 'object' || !IT.done) IT = { done: {}, off: false };
  const kk = (a) => '<kbd>' + AE.keyName(SET.binds[a]) + '</kbd>';
  const IT_STEPS = [
    { id: 'fly', t: () => 'Полетайте: ' + kk('fwd') + kk('left') + kk('back') + kk('right') + ', мышь — обзор', ok: () => itEv.fly },
    { id: 'embody', t: () => 'Подлетите к генералу и удерживайте ' + kk('use'), ok: (p) => p.emb },
    { id: 'gun', t: (p) => p.emb && !p.hasGun ? 'Нет оружия: <kbd>Esc</kbd> → «Оружие», возьмите автомат' : 'Возьмите оружие: ' + kk('slot1') + '…' + kk('slot6'), ok: (p) => p.gun },
    { id: 'fire', t: () => 'Выстрелите: ' + kk('fire'), ok: (p) => p.shots > 0 },
    { id: 'ads', t: () => 'Прицельтесь: удерживайте ' + kk('ads'), ok: (p) => p.ads > 0.85 },
    { id: 'hit', t: () => 'Поразите мишень на линии огня', ok: (p) => p.score > 0 },
    { id: 'reload', t: () => 'Перезарядите: ' + kk('reload'), ok: (p) => p.reload },
    { id: 'heal', t: () => 'Ранение: ' + kk('heal') + ' — жгут / перевязка себе или раненому генералу рядом', ok: (p) => p.healed > 0 },
    /* v26: новые клавиши и меню */
    { id: 'inv', t: () => 'Инвентарь: ' + kk('inventory') + ' — перетащите предмет мышью, <kbd>X</kbd> над предметом — выбросить', ok: (p) => p.inv > 0 },
    { id: 'sightk', t: () => 'Прицел: ' + kk('magnifier') + ' — откинуть увеличитель, ' + kk('reticle') + kk('retColor') + ' — вид и цвет марки (поставьте коллиматор в оружейной)', ok: (p) => p.sightKeys > 0 },
    { id: 'menu', t: () => 'Меню: <kbd>Esc</kbd> · там «Оружие» (окраска, сетка) и «Внешний вид»', ok: () => itEv.menu }
  ];
  const itBox = document.createElement('div');
  itBox.id = 'itut';
  itBox.innerHTML = '<div class="ih"><span>Обучение</span><b></b><button title="Скрыть обучение">×</button></div><ol></ol>';
  document.body.appendChild(itBox);
  itBox.querySelector('button').onclick = () => { IT.off = true; AE.LS.set('aegis.ingameTut', IT); itRender(); };
  let itHTML = '', itDoneT = 0;
  function itReset() { IT = { done: {}, off: false }; itEv.fly = itEv.menu = false; itDoneT = 0; AE.LS.set('aegis.ingameTut', IT); itRender(); }
  function itRender(p) {
    const show = !(window.GMaps&&GMaps.id) && !IT.off && (st.name === 'fly' || st.name === 'play' || st.name === 'menu') && !(IT.fin && performance.now() - itDoneT > 5000);
    itBox.classList.toggle('on', show);
    if (!show) return;
    p = p || {};
    let cur = -1, n = 0;
    const rows = IT_STEPS.map((x, i) => {
      const d = !!IT.done[x.id];
      if (d) n++;
      else if (cur < 0) cur = i;
      return d ? '' : '<li class="' + (i === cur ? 'cur' : '') + '">' + x.t(p) + '</li>';
    }).filter(Boolean).slice(0, 3);
    const html = (cur < 0 ? '<li class="fin">Обучение пройдено. Удачи на полигоне, генерал!</li>' : rows.join('')) + '|' + n;
    if (html !== itHTML) {
      itHTML = html;
      itBox.querySelector('ol').innerHTML = html.slice(0, html.lastIndexOf('|'));
      itBox.querySelector('.ih b').textContent = n + ' / ' + IT_STEPS.length;
    }
  }
  setInterval(() => {
    if (!G || IT.off || (IT.fin && performance.now() - itDoneT > 5000)) { if (itBox.classList.contains('on')) itRender(); return; }
    const p = G.tutProbe ? G.tutProbe() : {};
    let ch = false;
    for (const x of IT_STEPS) if (!IT.done[x.id] && x.ok(p)) { IT.done[x.id] = 1; ch = true; }
    if (ch) {
      if (IT_STEPS.every((x) => IT.done[x.id]) && !IT.fin) { IT.fin = true; itDoneT = performance.now(); }
      AE.LS.set('aegis.ingameTut', IT);
    }
    itRender(p);
  }, 250);

  /* ------------------------------------------------------ обучение --- */
  const kbd = (act) => '<kbd>' + AE.keyName(SET.binds[act]) + '</kbd>';
  function tutSteps() {
    const k = (a) => kbd(a);
    /* схема оружейной: где что лежит на экране */
    const scheme = '<div class="t-scheme" aria-hidden="true">' +
      '<div class="ts-back">Назад</div><div class="ts-slots">' + [1, 2, 3, 4, 5, 6].map((n) => '<i>' + n + '</i>').join('') + '</div>' +
      '<div class="ts-list"><b>Оружие</b><u></u><u></u><u></u><em>Взять в снаряжение</em></div>' +
      '<div class="ts-gun"><span>модель</span></div>' +
      '<div class="ts-mods"><b>Модули</b><u></u><u></u><u></u><u></u></div></div>';
    return [
      { t: 'Добро пожаловать в AEGIS', b: '<p>Учебный полигон в лесу. Здесь четыре генерала: двое из группы «Дельта» (красная повязка) и двое из «Альфы» (чёрная повязка).</p>' +
          '<p>Порядок простой: <b>1.</b> соберите снаряжение в оружейной, <b>2.</b> подлетите к генералу и вселитесь, <b>3.</b> тренируйтесь по мишеням и бойцам. Генералы не отвечают огнём.</p>' },
      { t: 'Свободная камера', b: '<div class="t-keys">' + k('fwd') + k('left') + k('back') + k('right') + '<span>полёт, панель меню при этом скрывается</span>' +
          '<span class="t-k">Мышь</span><span>обзор; щёлкните по сцене, чтобы захватить курсор</span>' +
          k('jump') + '<span>выше, ' + AE.keyName(SET.binds.crouch) + ': ниже, ' + AE.keyName(SET.binds.sprint) + ': быстрее</span>' +
          '<kbd>Esc</kbd><span>показать меню; если камера стоит 5 секунд, меню вернётся само</span></div>' },
      { t: 'Оружейная: где что находится', b: scheme +
          '<ol class="t-ol"><li>В меню нажмите <b>«Оружие»</b> (в теле меню открывает Esc).</li>' +
          '<li><b>Слева</b> выберите образец: АК-74, M416, MP5, Glock и другие.</li>' +
          '<li><b>Справа</b> поставьте модули: прицел, цевьё, рукоятку, глушитель, фонарь.</li>' +
          '<li>Нажмите <b>«Взять в снаряжение»</b> под списком: оружие ляжет в свободный слот.</li>' +
          '<li>Под списком — <b>окраска</b>: пять быстрых вариантов и кнопка <b>«Ещё»</b> (палитра). Это мастерская: вся палитра, ' +
          'окраска <b>отдельных модулей</b> (прицел, ДТК, магазин, фонарь) или галочка «Все модули в цвет оружия», ' +
          'а также <b>маскировка</b>: сеть или «кикимора» на цевьё и приклад, расцветки лес, осень, степь, зима.</li></ol>' },
      { t: 'Слоты снаряжения', b: '<p>Сверху шесть слотов. Щелчок по слоту открывает выбор предмета, <b>правый щелчок</b> очищает слот.</p>' +
          '<ul class="t-ul"><li>Одно <b>основное оружие</b> и один <b>пистолет</b>. Второй образец того же типа выбрать нельзя: замените первый в его же слоте.</li>' +
          '<li><b>Патроны</b> кладутся к оружию, которое уже есть в снаряжении.</li>' +
          '<li><b>Гранаты</b> M67 и M84 занимают по слоту.</li></ul>' +
          '<p>Всё сохраняется сразу. При первом входе оружейная сама покажет подсказки, повтор: кнопка «?».</p>' },
      { t: 'Вселение и бой', b: '<p>Подлетите к генералу, посмотрите на него и <b>удерживайте</b> ' + k('use') + '. Выйти: снова удерживайте ' + k('use') + '.</p>' +
          '<div class="t-keys">' + k('slot1') + '<span>слоты ' + AE.keyName(SET.binds.slot1) + '-' + AE.keyName(SET.binds.slot6) + '</span>' +
          k('fire') + '<span>огонь</span>' + k('ads') + '<span>прицел; ' + AE.keyName(SET.binds.sight) + ': сменить прицел</span>' +
          k('magnifier') + '<span>откинуть увеличитель (или ПНВ) вбок и вернуть; ' + AE.keyName(SET.binds.reticle) + ': вид марки (точка, крест, кольцо), ' + AE.keyName(SET.binds.retColor) + ': цвет марки</span>' +
          k('reload') + '<span>перезарядка; ' + AE.keyName(SET.binds.fireMode) + ': режим огня, ' + AE.keyName(SET.binds.ammoType) + ': тип патрона</span>' +
          k('light') + '<span>фонарь; ' + AE.keyName(SET.binds.laser) + ': ЛЦУ, ' + AE.keyName(SET.binds.bipod) + ': сошки, ' + AE.keyName(SET.binds.inspect) + ': осмотр</span>' +
          k('sprint') + '<span>бег; ' + AE.keyName(SET.binds.crouch) + ': присесть, ' + AE.keyName(SET.binds.prone) + ': лечь, ' + AE.keyName(SET.binds.leanL) + '/' + AE.keyName(SET.binds.leanR) + ': наклоны</span></div>' },
      { t: 'Ранения, кровь и добивание', b: '<p>Попадание в конечность или корпус не всегда убивает сразу: генерал падает и <b>агонизирует</b>. Его можно <b>добить</b> выстрелом в голову, грудь или повторными попаданиями.</p>' +
          '<p>Пули дают брызги и туман крови на входе и выходе, лужи и следы на земле. Стрельба по телу тоже оставляет кровь.</p>' +
          '<p>Тело лежит около 14 секунд, раненый без добивания около 30 секунд, затем генерал возрождается. ' + k('reset') + ': поднять всех сразу.</p>' },
      { t: 'Генералы: у каждого своя сильная сторона', b: '<ul class="t-ul">' + AE.GENERALS.map((g) => '<li><b>' + g.last + '</b> «' + g.call + '» · ' + (g.trait ? g.trait.icon + ' ' + g.trait.name + ': ' + g.trait.lines.join(', ') : '') + '</li>').join('') + '</ul>' +
          '<p>Особенность видна в списке генералов в меню и в углу экрана, когда вы в теле.</p>' },
      { t: 'Здоровье и перевязка', b: '<p>Слева внизу: <b>здоровье</b>, раны и аптечка (2 жгута и 3 бинта). Мигающая красная плашка «Артерия» означает, что без помощи генерал погибнет за десятки секунд.</p>' +
          '<div class="t-keys">' + k('heal') + '<span>помощь: себе или раненому генералу, на которого смотрите вблизи. Игра сама выберет нужное</span></div>' +
          '<ul class="t-ul"><li><b>Жгут</b>: артерия руки или ноги, останавливает кровь полностью (~4 с).</li>' +
          '<li><b>Тампонада</b>: шея и таз; <b>окклюзионная повязка</b>: грудь и живот, только замедляет.</li>' +
          '<li><b>Перевязка</b>: обычное кровотечение, по бинту на рану (~3 с).</li></ul>' +
          '<p>Пока идёт помощь, оружие опущено и можно только идти шагом. Повторное нажатие отменяет. ' + k('reset') + ' или возрождение пополняют аптечку.</p>' },
      { t: 'Инвентарь и трофеи', b: '<div class="t-keys">' + k('inventory') + '<span>инвентарь: слева ваше снаряжение (оружие, разгрузка 3×2, рюкзак 4×2), справа тело или ящик рядом</span>' +
          '<span class="t-k">Мышь</span><span>перетащите предмет в нужную ячейку; двойной щелчок или Ctrl+щелчок — переложить сразу</span>' +
          '<kbd>X</kbd><span>над предметом в инвентаре: выбросить на землю</span>' +
          k('loot') + '<span>обыскать тело или поднять предмет с земли, не открывая инвентарь</span></div>' +
          '<p>Наведите курсор на предмет — появится подсказка: что это, сколько патронов, масса. Что не поместилось в разгрузку, уходит в рюкзак.</p>' },
      { t: 'Внешний вид бойца', b: '<p>В главном меню и в меню паузы (<kbd>Esc</kbd>) есть кнопка <b>«Внешний вид»</b>. Боец стоит на подиуме, его можно вращать мышью.</p>' +
          '<ul class="t-ul"><li><b>Форма</b>: камуфляж кителя и брюк, готовые комплекты; китель и брюки можно снять — тельняшки, футболки, майки, шорты, трусы («Снять всё»).</li><li><b>Броня</b>: бронежилет, разгрузка, подсумки, наколенники.</li>' +
          '<li><b>Голова</b>: шлем и чехол, панама, гарнитура, балаклава.</li><li><b>Обувь, перчатки</b> и <b>Маскировка</b>: «кикимора» или накидка-сеть.</li>' +
          '<li><b>Команда</b>: цвет повязки и общий образ на всю группу.</li></ul>' +
          '<p>Всё сохраняется само; бойцы переодеваются сразу, в бою тоже. Окраска оружия — в оружейной, кнопка «Ещё».</p>' },
      { t: 'Гранаты', b: '<p>Возьмите гранату из слота: ' + k('fire') + ' бросок сверху (дальний), ' + k('ads') + ' снизу, катом. ' + k('grenade') + ': быстрый бросок без смены оружия.</p><p><b>M67</b> осколочная, взрыв через 4-5 с. <b>M84</b> светошумовая, срабатывает через 1,3-1,7 с, ослепляет и оглушает. <b>M18</b> дымовая: дым через 1-2 с, плотная завеса держится около минуты, сквозь неё не видно ни вас, ни противника.</p>' },
      { t: 'Меню и настройки', b: '<p><kbd>Esc</kbd>: меню (В бой, Оружие, Внешний вид, Настройки), игра на паузе; ещё раз Esc — продолжить. В «Настройках» можно переназначить любые клавиши (и новые: увеличитель, вид и цвет марки), выбрать качество графики, громкость и чувствительность мыши и снова пройти это обучение.</p>' +
          '<p>Боты в бою действуют группой: прикрывают огнём, перебегают по очереди от укрытия к укрытию, выглядывают из-за угла, дома берут вдвоём-втроём. Стрельбу слышно далеко — на звук они и идут.</p><p>Удачи на полигоне, генерал.</p>' }
    ];
  }
  let tutI = 0, TS = [];
  function openTutorial() { openOverlay('tutorial'); startTutorial(); }
  function startTutorial() { TS = tutSteps(); tutI = 0; renderTut(); }
  function renderTut() {
    const s = TS[tutI];
    $('tutStep').textContent = 'Обучение · ' + (tutI + 1) + ' из ' + TS.length;
    $('tutTitle').textContent = s.t;
    $('tutBody').innerHTML = s.b;
    $('tutDots').innerHTML = TS.map((_, i) => '<i class="' + (i <= tutI ? 'on' : '') + '"></i>').join('');
    $('tutPrev').disabled = tutI === 0;
    $('tutNext').textContent = tutI === TS.length - 1 ? 'Начать' : 'Далее';
  }
  function endTutorial() { AE.LS.set('aegis.tutorial', true); closeOverlay(); }
  $('tutNext').onclick = () => { if (tutI < TS.length - 1) { tutI++; renderTut(); } else endTutorial(); };
  $('tutPrev').onclick = () => { if (tutI > 0) { tutI--; renderTut(); } };
  $('tutSkip').onclick = endTutorial;

  /* ----------------------------------------------- внешний вид --- */
  /* Боец на подиуме рисуется рендерером игры (G.setPreview), полигон под
     окном не считается и не рисуется; при закрытии — переодеть бойцов. */
  function openLook(key) {
    if (!G || !window.GLooks || !G.setPreview || !G.renderer) return;
    const preset = G.presetOf ? G.presetOf(key) || key : key;
    if (st.name !== 'look') openOverlay('look');
    const ok = GLooks.open({
      THREE: window.THREE, renderer: G.renderer(), setPreview: G.setPreview, key: preset,
      onClose: (r) => {
        if (r && (r.keys.length || r.bands)) { try { G.reskin(r.keys); } catch (e) { console.warn('reskin', e); } }
        if (st.name === 'look') closeOverlay();
      }
    });
    if (!ok) closeOverlay();
  }
  function closeLook() {
    if (window.GLooks && GLooks.isOpen()) GLooks.close();
    else if (st.name === 'look') closeOverlay();
  }

  /* ---------------------------------------------------- оружейная --- */
  /* armory.html в iframe: при каждом запуске просит данные (hello → init),
     сообщает об изменениях модулей (cfg) и слотов (loadout); «назад» и Esc
     закрывают окно — снаряжение сохраняется и пересобирается на бойце. */
  const AR = { frame: null, g: null, L: null, dirty: false };
  function openArmory(key) {
    AR.g = key;
    AR.L = JSON.parse(JSON.stringify(G.loadout(key) || LOADOUTS[key] || AE.emptyLoadout()));
    AR.dirty = false;
    if (st.name !== 'armory') openOverlay('armory');
    loadFrame();
  }
  function initMsg() {
    return { aegis: 'init', g: AR.g, L: AR.L, w: AE.WEAPONS[AR.L.view] ? AR.L.view : null, sens: SET.sens, quality: SET.quality, weather: SET.weather || 'day', generals: AE.GENERALS.map((x) => x.key) };
  }
  /* окно оружейной создаётся один раз и потом только прячется: повторное открытие и смена
     генерала — без перезапуска движка и без экрана «Сборка модели» */
  function loadFrame() {
    const box = $('armory');
    if (AR.frame && AR.ready) {
      AR.frame.style.visibility = '';
      post({ aegis: 'pause', on: false });
      post(initMsg());
      try { AR.frame.focus(); } catch (e) { /* */ }
      return;
    }
    if (AR.frame) AR.frame.remove();
    AR.ready = false;
    const f = document.createElement('iframe');
    f.setAttribute('allow', 'autoplay');
    const w = AE.WEAPONS[AR.L.view] ? AR.L.view : 'akm';
    f.src = 'armory.html#w=' + w + '&g=' + AR.g;
    box.appendChild(f);
    AR.frame = f;
    f.addEventListener('load', () => { try { f.focus(); } catch (e) { /* */ } });
  }
  function closeArmory() {
    if (AR.frame) {
      if (AR.ready) {
        post({ aegis: 'pause', on: true });
        AR.frame.style.visibility = 'hidden';
        try { AR.frame.blur(); window.focus(); } catch (e) { /* */ }
      }
      else { AR.frame.remove(); AR.frame = null; }
    }
    if (AR.g && AR.L) {
      G.setLoadout(AR.g, AR.L);
      LOADOUTS = AE.loadLoadouts();
    }
    closeOverlay();
  }
  function post(msg) { if (AR.frame && AR.frame.contentWindow) AR.frame.contentWindow.postMessage(msg, '*'); }
  addEventListener('message', (e) => {
    const m = e.data;
    if (!m || typeof m !== 'object' || !m.aegis || !AR.frame || e.source !== AR.frame.contentWindow) return;
    switch (m.aegis) {
      case 'hello':
        AR.ready = true;
        post(initMsg());
        break;
      case 'cfg':
        if (m.id && m.cfg) { AR.L.cfg = AR.L.cfg || {}; AR.L.cfg[m.id] = m.cfg; AR.dirty = true; }
        break;
      case 'loadout':
        /* модули приходят отдельными сообщениями cfg — их и держим */
        if (m.L) { const cfg = AR.L.cfg || {}; AR.L = AE.normLoadout(m.L); AR.L.cfg = cfg; AR.dirty = true; }
        break;
      case 'view':
        if (AE.WEAPONS[m.id]) { AR.L.view = m.id; AR.dirty = true; }
        break;
      case 'general':
        if (AE.GEN[m.g] && m.g !== AR.g) {
          G.setLoadout(AR.g, AR.L);
          G.select(m.g);
          openArmory(m.g);
        }
        break;
      case 'weather':
        if (['morning', 'day'].includes(m.w)) {
          SET.weather = m.w; AE.saveSettings(SET);
          if (G && !onMap()) G.applySettings({ weather: m.w });
          try { renderGfx(); } catch (e) { /* */ }
        }
        break;
      case 'back': case 'esc':
        closeArmory();
        break;
      default: break;
    }
  });

  /* ---------------------------------------------- ход загрузки --- */
  const bar = $('loadBar');
  const lt = setInterval(() => {
    if (st.name !== 'loading') { clearInterval(lt); return; }
    const p = window.GAssets && GAssets.progress ? GAssets.progress() : 0;
    bar.style.width = Math.round(10 + p * 85) + '%';
    if (p >= 1) $('loadT').textContent = 'Сборка полигона…';
  }, 200);
  setState('loading');
})();
