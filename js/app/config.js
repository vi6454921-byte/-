/* ==========================================================================
   AEGIS · общие данные и хранилище.
   Подключается и главной страницей (index.html), и оружейной (armory.html):
   генералы, оружие, правила слотов, раскладка клавиш, настройки.
   ========================================================================== */
(function () {
  'use strict';
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* без хранилища */ } }
  };

  /* --------------------------------------------------------- генералы -- */
  const GENERALS = [
    { key: 'delta_1', team: 'delta', rank: 'Генерал', last: 'Громов', first: 'Виктор', mid: 'Андреевич', call: 'Кедр', band: 'red' },
    { key: 'delta_2', team: 'delta', rank: 'Генерал', last: 'Соколов', first: 'Олег', mid: 'Игоревич', call: 'Сойка', band: 'red' },
    { key: 'alpha_1', team: 'alpha', rank: 'Генерал', last: 'Воронцов', first: 'Дмитрий', mid: 'Сергеевич', call: 'Ворон', band: 'black' },
    { key: 'alpha_2', team: 'alpha', rank: 'Генерал', last: 'Тихонов', first: 'Павел', mid: 'Николаевич', call: 'Тис', band: 'black' }
  ];
  /* Особенности генералов: у каждого своя сильная сторона.
     Множители читаются игрой (js/polygon/20_player.js, 23_game_damage.js, медицина). */
  const TRAITS = {
    delta_1: { id: 'assault', name: 'Штурмовик', icon: '⚡',
      lines: ['Выносливость +35%', 'Бег +6%, быстрее отдышка'],
      stamina: 1.35, sprint: 1.06, regen: 1.25 },
    delta_2: { id: 'marksman', name: 'Стрелок', icon: '◎',
      lines: ['Отдача −18%', 'Дрожание прицела −35%, вскидка быстрее'],
      recoil: 0.82, sway: 0.65, ads: 0.88 },
    alpha_1: { id: 'medic', name: 'Медик', icon: '✚',
      lines: ['Перевязка и жгут вдвое быстрее', '+1 жгут и +1 бинт, кровопотеря −20%'],
      heal: 0.5, bleed: 0.8, kitTq: 1, kitBd: 1 },
    alpha_2: { id: 'veteran', name: 'Ветеран', icon: '★',
      lines: ['Перезарядка на 18% быстрее', 'Запас здоровья +20%, переломы меньше мешают'],
      reload: 1.18, hp: 1.2, fract: 0.6 }
  };
  for (const g of GENERALS) {
    g.trait = TRAITS[g.key];
    g.short = 'Генерал ' + g.last;
    g.full = g.last + ' ' + g.first + ' ' + g.mid;
    g.teamName = g.team === 'delta' ? 'Дельта' : 'Альфа';
  }
  const GEN = Object.fromEntries(GENERALS.map((g) => [g.key, g]));

  /* ----------------------------------------------------------- оружие -- */
  /* kind: primary — основное, pistol — пистолет. ammoSlot — патронов в
     одном слоте «патроны»: магазинное оружие — 120 (4 магазина по 30),
     СВД — 60 (6 по 10), Remington — 20 патронов 12 калибра, Glock — 102
     (6 стандартных магазинов по 17). */
  const WEAPONS = {
    ak74: { id: 'ak74', name: 'АК-74', full: 'Автомат Калашникова АК-74', kind: 'primary', cal: '545', calName: '5,45×39', ammoSlot: 120, cls: 'Автомат' },
    akm: { id: 'akm', name: 'АКМ', full: 'Автомат Калашникова модернизированный', kind: 'primary', cal: '762x39', calName: '7,62×39', ammoSlot: 120, cls: 'Автомат' },
    m416: { id: 'm416', name: 'M416', full: 'HK416 / M416', kind: 'primary', cal: '556', calName: '5,56×45 NATO', ammoSlot: 120, cls: 'Штурмовая винтовка' },
    scar: { id: 'scar', name: 'SCAR-H', full: 'FN SCAR-H', kind: 'primary', cal: '762x51', calName: '7,62×51 NATO', ammoSlot: 120, cls: 'Боевая винтовка' },
    svd: { id: 'svd', name: 'СВД', full: 'Снайперская винтовка Драгунова', kind: 'primary', cal: '762x54R', calName: '7,62×54R', ammoSlot: 60, cls: 'Снайперская винтовка' },
    m870: { id: 'm870', name: 'Remington 870', full: 'Remington 870 (помповое ружьё)', kind: 'primary', cal: '12ga', calName: '12/76', ammoSlot: 20, cls: 'Ружьё' },
    mp5a3: { id: 'mp5a3', name: 'MP5A3', full: 'HK MP5A3', kind: 'primary', cal: '9x19', calName: '9×19 Para', ammoSlot: 120, cls: 'Пистолет-пулемёт' },
    ar15m4: { id: 'ar15m4', name: 'AR-15 / M4', full: 'AR-15 / M4', kind: 'primary', cal: '556', calName: '5,56×45 NATO', ammoSlot: 120, cls: 'Штурмовая винтовка' },
    glock21: { id: 'glock21', name: 'Glock 21 Gen4', full: 'Glock 21 Gen4', kind: 'pistol', cal: '45acp', calName: '.45 ACP', ammoSlot: 78, cls: 'Пистолет' },
    glock18c: { id: 'glock18c', name: 'Glock 18C', full: 'Glock 18C', kind: 'pistol', cal: '9x19', calName: '9×19 Para', ammoSlot: 102, cls: 'Пистолет' }
  };
  const PRIMARY = ['ak74', 'akm', 'm416', 'ar15m4', 'scar', 'svd', 'm870', 'mp5a3'];
  const PISTOLS = ['glock18c', 'glock21'];
  const GRENADES = {
    m67: { id: 'm67', name: 'M67', full: 'Осколочная граната M67', fuse: '4–5 с' },
    m84: { id: 'm84', name: 'M84', full: 'Светошумовая граната M84', fuse: '1,3–1,7 с' },
    smoke: { id: 'smoke', name: 'M18', full: 'Дымовая граната M18 (белый дым, ~60 с)', fuse: '1,2–2 с' }
  };
  const SLOTS = 6;

  /* ------------------------------------------------------ снаряжение -- */
  /* Слот — ровно один предмет:
       { t: 'gun', id }            основное оружие или пистолет (с полным магазином)
       { t: 'ammo', w: 'primary' } патроны к основному (по образцу в слоте)
       { t: 'ammo', w: 'pistol' }  патроны к пистолету
       { t: 'grenade', g }         граната M67 / M84 */
  function emptyLoadout() { return { slots: new Array(SLOTS).fill(null), cfg: {}, view: 'akm' }; }
  function normLoadout(L) {
    const o = emptyLoadout();
    if (!L || typeof L !== 'object') return o;
    if (Array.isArray(L.slots)) for (let i = 0; i < SLOTS; i++) {
      const s = L.slots[i];
      if (!s || typeof s !== 'object') continue;
      if (s.t === 'gun' && WEAPONS[s.id]) o.slots[i] = { t: 'gun', id: s.id };
      else if (s.t === 'ammo' && (s.w === 'primary' || s.w === 'pistol')) o.slots[i] = { t: 'ammo', w: s.w };
      else if (s.t === 'grenade' && GRENADES[s.g]) o.slots[i] = { t: 'grenade', g: s.g };
    }
    if (L.cfg && typeof L.cfg === 'object') o.cfg = L.cfg;
    if (WEAPONS[L.view]) o.view = L.view;
    return sanitize(o).L;
  }
  const kindOf = (id) => (WEAPONS[id] ? WEAPONS[id].kind : null);
  function weaponOf(L, kind) {
    for (const s of L.slots) if (s && s.t === 'gun' && kindOf(s.id) === kind) return s.id;
    return null;
  }
  /* убрать недопустимое: второе основное, патроны без оружия */
  function sanitize(L) {
    const notes = [];
    const seen = {};
    L.slots = L.slots.map((s) => {
      if (s && s.t === 'gun') {
        const k = kindOf(s.id);
        if (seen[k]) { notes.push('Лишнее оружие убрано: ' + WEAPONS[s.id].name); return null; }
        seen[k] = true;
      }
      return s;
    });
    L.slots = L.slots.map((s) => {
      if (s && s.t === 'ammo' && !weaponOf(L, s.w)) { notes.push('Патроны без оружия убраны'); return null; }
      return s;
    });
    return { L, notes };
  }
  /* Положить предмет в слот i (или в первый свободный, i = -1).
     Возвращает { ok, L, error?, note? } — L новая копия. */
  function put(L0, i, item) {
    const L = JSON.parse(JSON.stringify(L0));
    const free = () => L.slots.findIndex((s) => !s);
    if (item.t === 'gun') {
      const k = kindOf(item.id);
      const cur = L.slots.findIndex((s) => s && s.t === 'gun' && kindOf(s.id) === k);
      if (cur >= 0) {
        if (L.slots[cur].id === item.id) return { ok: false, L: L0, error: WEAPONS[item.id].name + ' уже в слоте ' + (cur + 1) };
        /* одно основное и один пистолет: второй такой же класс в другой слот нельзя, только замена на месте */
        if (i >= 0 && i !== cur) return { ok: false, L: L0, error: (k === 'pistol' ? 'Пистолет' : 'Основное оружие') + ' уже в слоте ' + (cur + 1) + '. Замените его там или очистите слот' };
        /* замена: на месте прежнего; другой калибр — патроны к нему убираются */
        const old = WEAPONS[L.slots[cur].id];
        L.slots[cur] = null;
        const at = i >= 0 ? i : cur;
        L.slots[at] = { t: 'gun', id: item.id };
        let note = old.name + ' заменён на ' + WEAPONS[item.id].name;
        if (old.cal !== WEAPONS[item.id].cal) {
          let n = 0;
          L.slots = L.slots.map((s) => { if (s && s.t === 'ammo' && s.w === k) { n++; return null; } return s; });
          if (n) note += ' · патроны ' + old.calName + ' убраны (' + n + ')';
        }
        return { ok: true, L, note };
      }
      const at = i >= 0 ? i : free();
      if (at < 0) return { ok: false, L: L0, error: 'Все 6 слотов заняты' };
      if (L.slots[at]) return { ok: false, L: L0, error: 'Слот ' + (at + 1) + ' занят' };
      L.slots[at] = { t: 'gun', id: item.id };
      return { ok: true, L };
    }
    if (item.t === 'ammo') {
      const wid = weaponOf(L, item.w);
      if (!wid) return { ok: false, L: L0, error: item.w === 'pistol' ? 'Ошибка: сначала возьмите пистолет' : 'Ошибка: нет основного оружия под эти патроны' };
      const at = i >= 0 ? i : free();
      if (at < 0) return { ok: false, L: L0, error: 'Все 6 слотов заняты' };
      if (L.slots[at]) return { ok: false, L: L0, error: 'Слот ' + (at + 1) + ' занят' };
      L.slots[at] = { t: 'ammo', w: item.w };
      return { ok: true, L };
    }
    if (item.t === 'grenade') {
      const at = i >= 0 ? i : free();
      if (at < 0) return { ok: false, L: L0, error: 'Все 6 слотов заняты' };
      if (L.slots[at]) return { ok: false, L: L0, error: 'Слот ' + (at + 1) + ' занят' };
      L.slots[at] = { t: 'grenade', g: item.g };
      return { ok: true, L };
    }
    return { ok: false, L: L0, error: 'Неизвестный предмет' };
  }
  /* Очистить слот: вместе с оружием уходят и патроны к нему. */
  function clear(L0, i) {
    const L = JSON.parse(JSON.stringify(L0));
    const s = L.slots[i];
    if (!s) return { ok: true, L };
    L.slots[i] = null;
    let note = null;
    if (s.t === 'gun') {
      const k = kindOf(s.id);
      let n = 0;
      L.slots = L.slots.map((x) => { if (x && x.t === 'ammo' && x.w === k) { n++; return null; } return x; });
      if (n) note = 'Патроны к ' + WEAPONS[s.id].name + ' убраны вместе с оружием';
    }
    return { ok: true, L, note };
  }
  /* v22: слот патронов может нести остаток (n) и калибр (cal) — после обыска тела / перекладки;
     патроны чужого калибра лежат в слоте, но в запас оружия не идут */
  function ammoOf(L, kind) {
    const wid = weaponOf(L, kind);
    if (!wid) return 0;
    const W = WEAPONS[wid];
    let n = 0;
    for (const s of L.slots) if (s && s.t === 'ammo' && s.w === kind && (!s.cal || s.cal === W.cal)) n += Number.isFinite(s.n) ? Math.max(0, s.n) : W.ammoSlot;
    return n;
  }
  function describe(s, L) {
    if (!s) return { title: 'Пусто', sub: '', icon: 'empty' };
    if (s.t === 'gun') { const W = WEAPONS[s.id]; return { title: W.name, sub: W.kind === 'pistol' ? 'Пистолет' : 'Основное', icon: W.kind === 'pistol' ? 'pistol' : 'rifle' }; }
    if (s.t === 'ammo') {
      const wid = L ? weaponOf(L, s.w) : null, W = wid ? WEAPONS[wid] : null;
      return { title: W ? W.calName : 'Патроны', sub: W ? W.ammoSlot + ' шт. · ' + W.name : 'нет оружия', icon: 'ammo' };
    }
    if (s.t === 'grenade') { const G = GRENADES[s.g]; return { title: G.name, sub: s.g === 'm67' ? 'Осколочная' : s.g === 'smoke' ? 'Дымовая' : 'Светошумовая', icon: s.g }; }
    return { title: '?', sub: '', icon: 'empty' };
  }

  function loadLoadouts() {
    const all = LS.get('aegis.loadouts', {}) || {};
    const out = {};
    for (const g of GENERALS) out[g.key] = normLoadout(all[g.key]);
    return out;
  }
  function saveLoadouts(all) { LS.set('aegis.loadouts', all); }

  /* --------------------------------------------------------- клавиши -- */
  /* Действия в порядке показа в настройках (группы). Esc — всегда пауза. */
  const ACTIONS = [
    { g: 'Передвижение', id: 'fwd', l: 'Вперёд', d: 'KeyW' },
    { g: 'Передвижение', id: 'back', l: 'Назад', d: 'KeyS' },
    { g: 'Передвижение', id: 'left', l: 'Влево', d: 'KeyA' },
    { g: 'Передвижение', id: 'right', l: 'Вправо', d: 'KeyD' },
    { g: 'Передвижение', id: 'sprint', l: 'Бег', d: 'ShiftLeft' },
    { g: 'Передвижение', id: 'sneak', l: 'Скрытный шаг (удерживать)', d: 'AltLeft' },
    { g: 'Передвижение', id: 'crouch', l: 'Присесть', d: 'KeyC' },
    { g: 'Передвижение', id: 'prone', l: 'Лечь / встать', d: 'KeyZ' },
    { g: 'Передвижение', id: 'jump', l: 'Прыжок / перелезть', d: 'Space' },
    { g: 'Передвижение', id: 'leanL', l: 'Наклон влево', d: 'KeyQ' },
    { g: 'Передвижение', id: 'leanR', l: 'Наклон вправо', d: 'KeyE' },
    { g: 'Бой', id: 'fire', l: 'Огонь / бросок сверху', d: 'Mouse0' },
    { g: 'Бой', id: 'ads', l: 'Прицел / бросок снизу', d: 'Mouse2' },
    { g: 'Бой', id: 'sight', l: 'Сменить прицел (увеличитель откидывается вбок / основной / боковой)', d: 'Mouse1' },
    { g: 'Бой', id: 'magnifier', l: 'Увеличитель / ПНВ: откинуть вбок — вернуть', d: 'KeyM' },
    { g: 'Бой', id: 'reticle', l: 'Вид марки прицела (точка / крест / кольцо)', d: 'KeyO' },
    { g: 'Бой', id: 'retColor', l: 'Цвет марки прицела (красный / зелёный / синий…)', d: 'KeyP' },
    { g: 'Бой', id: 'zoomIn', l: 'Приблизить в прицеле', d: 'WheelUp' },
    { g: 'Бой', id: 'zoomOut', l: 'Отдалить в прицеле', d: 'WheelDown' },
    { g: 'Бой', id: 'reload', l: 'Перезарядка', d: 'KeyR' },
    { g: 'Бой', id: 'fireMode', l: 'Режим огня', d: 'KeyX' },
    { g: 'Бой', id: 'ammoType', l: 'Тип патрона', d: 'KeyN' },
    { g: 'Бой', id: 'grenade', l: 'Быстрая граната', d: 'KeyG' },
    { g: 'Бой', id: 'inspect', l: 'Осмотр оружия', d: 'KeyV' },
    { g: 'Снаряжение', id: 'light', l: 'Фонарь', d: 'KeyT' },
    { g: 'Снаряжение', id: 'laser', l: 'ЛЦУ (лазер)', d: 'KeyL' },
    { g: 'Снаряжение', id: 'bipod', l: 'Сошки', d: 'KeyB' },
    { g: 'Снаряжение', id: 'slot1', l: 'Слот 1', d: 'Digit1' },
    { g: 'Снаряжение', id: 'slot2', l: 'Слот 2', d: 'Digit2' },
    { g: 'Снаряжение', id: 'slot3', l: 'Слот 3', d: 'Digit3' },
    { g: 'Снаряжение', id: 'slot4', l: 'Слот 4', d: 'Digit4' },
    { g: 'Снаряжение', id: 'slot5', l: 'Слот 5', d: 'Digit5' },
    { g: 'Снаряжение', id: 'slot6', l: 'Слот 6', d: 'Digit6' },
    { g: 'Снаряжение', id: 'wipe', l: 'Протереть объектив бодикама', d: 'KeyJ' },
    { g: 'Снаряжение', id: 'heal', l: 'Перевязка / жгут (себе или раненому рядом)', d: 'KeyK' },
    { g: 'Общее', id: 'use', l: 'Двери, пулемёт, ящик (в бою) · вселиться / выйти — удерживать (на базе)', d: 'KeyF' },
    { g: 'Общее', id: 'swap', l: 'Перейти в союзника рядом / вернуться в прежнего бойца (удерживать, в бою)', d: 'KeyU' },
    { g: 'Общее', id: 'loot', l: 'Обыскать тело / поднять с земли', d: 'KeyY' },
    { g: 'Общее', id: 'inventory', l: 'Инвентарь: своё снаряжение и тело рядом (слоты, перетаскивание мышью)', d: 'Tab' },
    { g: 'Общее', id: 'reset', l: 'Сброс мишеней и бойцов', d: 'KeyH' },
    {g:'Оружие',id:'zeroUp',l:'Пристрелка дальше',d:'PageUp'},
    {g:'Оружие',id:'zeroDown',l:'Пристрелка ближе',d:'PageDown'},
    { g: 'Общее', id: 'fps', l: 'Счётчик FPS', d: 'F3' },
    { g: 'Общее', id: 'photo', l: 'Снимок без интерфейса (2560×1440, для заставки)', d: 'F9' }
  ];
  const DEFAULT_BINDS = Object.fromEntries(ACTIONS.map((a) => [a.id, a.d]));
  const KEY_NAMES = {
    AltLeft: 'Alt', AltRight: 'Правый Alt', Space: 'Пробел', ShiftLeft: 'Shift', ShiftRight: 'Правый Shift', ControlLeft: 'Ctrl', ControlRight: 'Правый Ctrl',
    AltLeft: 'Alt', AltRight: 'Правый Alt', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', CapsLock: 'Caps Lock',
    Mouse0: 'ЛКМ', Mouse1: 'Нажатие колеса', WheelUp: 'Колесо вверх', WheelDown: 'Колесо вниз', Mouse2: 'ПКМ', Mouse3: 'Мышь 4', Mouse4: 'Мышь 5',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
    Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'Page Up', PageDown: 'Page Down'
  };
  function keyName(code) {
    if (!code) return '—';
    if (KEY_NAMES[code]) return KEY_NAMES[code];
    let m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
    m = /^Digit(\d)$/.exec(code); if (m) return m[1];
    m = /^Numpad(.+)$/.exec(code); if (m) return 'Num ' + m[1];
    return code;
  }
  const RESERVED = ['Escape', 'F1', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight'];

  /* -------------------------------------------------------- настройки -- */
  function detectQuality() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return 'low';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      if (/swiftshader|llvmpipe|software|intel|hd graphics|uhd graphics|vega [0-9] |radeon\(tm\) graphics|mx[0-9]{3}|gt [0-9]{3}/i.test(r)) return 'low';
      if (/gtx 9|gtx 10[0-6]|rx 5[0-9]0|vega|iris/i.test(r)) return 'medium';
      return 'high';
    } catch (e) { return 'medium'; }
  }
  function loadSettings() {
    const s = LS.get('aegis.settings', null) || {};
    const out = {
      quality: ['ultra','low', 'medium', 'high'].includes(s.quality) ? s.quality : null,
      sens: Number.isFinite(s.sens) ? Math.min(3, Math.max(0.2, s.sens)) : 1,
      volume: Number.isFinite(s.volume) ? Math.min(1, Math.max(0, s.volume)) : 0.8,
      fps: !!s.fps,
      hardcore: !!s.hardcore,
      weather: ['morning', 'day'].includes(s.weather) ? s.weather : 'day',
      binds: Object.assign({}, DEFAULT_BINDS)
    };
    const num=(k,d,lo,hi)=>Number.isFinite(s[k])?Math.max(lo,Math.min(hi,s[k])):d;
    Object.assign(out,{version:17,fov:num('fov',88,60,110),ads1:num('ads1',1,.1,3),ads2:num('ads2',1,.1,3),ads4:num('ads4',1,.1,3),ads8:num('ads8',1,.1,3),gore:num('gore',1,0,1),shots:num('shots',1,0,1),ambience:num('ambience',1,0,1),voices:num('voices',1,0,1),uiVolume:num('uiVolume',1,0,1),invertY:!!s.invertY,adsMode:s.adsMode==='toggle'?'toggle':'hold',crouchMode:s.crouchMode==='toggle'?'toggle':'hold',reticleColor:['red','green','blue','yellow','white'].includes(s.reticleColor)?s.reticleColor:'red',colorblind:['off','deuter','protan','tritan'].includes(s.colorblind)?s.colorblind:'off',gpuCompressed:!!s.gpuCompressed,calloutSpeech:s.calloutSpeech!==false,farBattle:s.farBattle!==false,sfxRecorded:s.sfxRecorded!==false,occlusion:s.occlusion!==false,animBudget:num('animBudget',5,0,50)});
    /* v20 (ПК): occlusion=false — выключить отсечение бойцов за стенами; animBudget — бюджет поз в мс за кадр (0 = без бюджета) */
    out.effects=Object.fromEntries(['distortion','grain','chroma','blur','vignette','dirt','concussion'].map(k=>[k,!(s.effects&&s.effects[k]===false)]));
    if (s.binds && typeof s.binds === 'object') for (const a of ACTIONS) if (typeof s.binds[a.id] === 'string' || s.binds[a.id] === null) out.binds[a.id] = s.binds[a.id];
    /* Одна клавиша — одно действие. Старые сохранения могли держать фонарь на C
       (присесть) или ЛЦУ на Z (лечь): второе действие возвращается к своей
       клавише по умолчанию, если она свободна, иначе остаётся без клавиши. */
    {
      const MOVE = new Set(['fwd', 'back', 'left', 'right', 'sprint', 'crouch', 'prone', 'jump', 'fire', 'ads']);
      const order = ACTIONS.slice().sort((x, y) => (MOVE.has(y.id) ? 1 : 0) - (MOVE.has(x.id) ? 1 : 0));
      const used = new Map();
      for (const a of order) { const c = out.binds[a.id]; if (!c) continue; if (used.has(c)) out.binds[a.id] = null; else used.set(c, a.id); }
      for (const a of ACTIONS) if (!out.binds[a.id] && !used.has(a.d) && s.binds && s.binds[a.id] !== null) { out.binds[a.id] = a.d; used.set(a.d, a.id); }
    }
    if (!out.quality) { out.quality = detectQuality(); LS.set('aegis.settings', out); }
    return out;
  }
  function saveSettings(s) { LS.set('aegis.settings', s); }
  /* Назначить клавишу: если она занята другим действием — меняем местами. */
  function bind(s, action, code) {
    const prev = s.binds[action];
    let swapped = null;
    for (const a of ACTIONS) if (a.id !== action && s.binds[a.id] === code) { s.binds[a.id] = prev || null; swapped = a.id; }
    s.binds[action] = code;
    return swapped;
  }
  function actionFor(s, code) {
    for (const a of ACTIONS) if (s.binds[a.id] === code) return a.id;
    return null;
  }

  window.AEGIS = {
    LS, GENERALS, GEN, WEAPONS, PRIMARY, PISTOLS, GRENADES, SLOTS,
    emptyLoadout, normLoadout, put, clear, sanitize, weaponOf, ammoOf, describe, kindOf,
    loadLoadouts, saveLoadouts,
    ACTIONS, DEFAULT_BINDS, keyName, RESERVED, loadSettings, saveSettings, bind, actionFor, detectQuality,
    QUALITY_NAMES: { ultra:'Ультра-низкая', low: 'Низкая', medium: 'Средняя', high: 'Высокая' }
  };
})();
