/* AEGIS v26 · голоса бойцов: речь как в настоящем бою, а не как в учебнике.
   Что изменилось против v25 (по разборам переговоров в бою, правилам радиообмена и «Справочнику
   тактической медицины» МО РФ 2022):
   — армейский обиход: «двухсотый» (убит), «трёхсотый» (ранен), «минус» (противник уничтожен), «плюс» (понял),
     «работаю» (веду огонь), «БК» (боекомплект), «прилёт», «жгут наложил, время засёк»;
   — целеуказание коротко и от слушателя: «Контакт! Слева, метров сто!», «Противник рядом, сзади справа!»;
   — радиообмен по правилам: вызов «кого — кто» («Второй, я Первый. Приём.» — «Второй на приёме.»),
     сообщение, «Принял. Конец связи.»; позывные по старшинству в команде (Первый — старший из ИИ, затем
     Второй и Третий). Сцены собираются в игре из клипов вызова/ответа/сообщения (V.meta.radio);
   — доклад о потерях после боя по ФАКТУ: сколько своих погибло и ранено за этот бой («У меня один
     трёхсотый, лёгкий» / «трёхсотый, тяжёлый. Нужна эвакуация» / «Потерь нет»), доклад о контакте по рации,
     если докладчик далеко, «БК на исходе» — когда у бойца последний магазин;
   — штурм помещения: «На входе. Готов.» — «Захожу!» — «Чисто!» (js/advanced/combat.js, cqb);
   — реплики «на взводе» (граната, ранение, прилёт, «двухсотый», «прижали») — отдельным дублем голоса,
     сдвинутым к крику (выше тон, ярче спектр); ударения проверены распознаванием фонем
     (tools/voice/qwen3/check26.py), неудачные дубли переозвучены.
   Слышимость: своих до 14 м — вживую (с места, панорама, задержка), дальше — по рации (полоса 360–3300 Гц,
   перегруз динамика, щелчок тангенты); противника — вживую до 35 м; разговоры рядом — вполголоса или шёпотом.
   Пакет assets/snd/voice_pack.js (v26): 4 голоса × 206 фраз (Qwen3-TTS офлайн), Opus 24 кГц. Если браузер
   не декодирует Opus или пакета нет — короткие доклады через Web Speech API, сцены молчат. Одна фраза за раз;
   приоритетные (граната, ранение, контакт) перебивают разговор. Включается «Речевые команды»
   (SET.calloutSpeech), громкость — «Голоса». */
(function (root) {
  'use strict';
  const SS = root.speechSynthesis || null;
  const MALE = /pavel|павел|dmitr|дмитр|yuri|юрий|maxim|максим|alexand|aleksand|александр|artem|артём|артем|ivan|иван|nikola|никола|sergei|sergey|сергей|denis|денис|boris|борис|oleg|олег|\bmale\b|мужск/i;
  const FEMALE = /irina|ирин|milena|милен|katya|катя|alena|алена|алёна|svetlana|светлан|daria|darya|дарья|anna|анна|ekaterina|екатерин|elena|елена|tatyana|татьяна|female|женск|oksana|оксана|olga|ольга|natal|натал|marina|марина|polina|полина|google/i;
  const DIRS = ['впереди', 'впереди справа', 'справа', 'сзади справа', 'сзади', 'сзади слева', 'слева', 'впереди слева'];
  const DISTW = ['рядом', 'метров тридцать', 'метров пятьдесят', 'метров сто', 'метров двести'];
  /* приоритет: >=3 перебивает разговор; 4 — перебивает всё */
  const PRIO = { grenin: 4, gren: 4, flash: 4, flashin: 4, near: 4, hit: 3, contact: 3, close: 3, wounded: 2, mandown: 2, smoke: 2, flank: 2, aid: 2,
    confirm: 1, reload: 1, supp: 1, onflank: 1, drag: 1, done: 1, cover: 1, move: 1, lost: 0, clear: 0, kill: 0,
    entry: 2, stack: 1, room: 1, ammo: 1 };
  /* старые виды (combat.js / teams.js v24) */
  const ALIAS = { grenade: 'gren', suppressed: 'supp' };
  const KIND_CD = { contact: 7, close: 5, confirm: 8, reload: 16, supp: 20, mandown: 12, kill: 12, gren: 3, grenin: 3, flash: 3, flashin: 3, smoke: 8,
    flank: 20, onflank: 20, aid: 10, drag: 10, done: 10, near: 6, hit: 8, wounded: 10, cover: 14, move: 14, lost: 18, clear: 40,
    stack: 12, entry: 5, room: 7, ammo: 30 };
  const SELF_CD = 6, GLOBAL_CD = 2.6, GAP = 0.8, ENEMY_R = 35, LIVE_R = 14, TALK_R = 18, WHISPER_R = 9;
  const PACK_URL = 'assets/snd/voice_pack.js';
  const RATES = [1.0, 0.97, 1.03, 0.96, 1.04];
  /* тексты на случай, если пакета нет (совпадают с tools/voice/qwen3/phr26.py; субтитры берутся из пакета) */
  const FIX = {
    confirm: ['Вижу его. Работаю!', 'Принял, вижу.', 'Плюс, вижу. Работаю!', 'Есть, вижу его!'],
    kill: ['Минус один!', 'Готов.', 'Есть! Минус.', 'Лежит. Отработал.'],
    mandown: ['Двухсотый!', 'У нас двухсотый!', 'Двухсотый... Не дышит.', 'Всё, двухсотый он.'],
    hit: ['Я трёхсотый!', 'Трёхсотый я! Прикройте!', 'Зацепило! Сам перевяжусь!', 'Лёгкий трёхсотый, работаю!'],
    wounded: ['Трёхсотый!', 'У нас трёхсотый!', 'Есть трёхсотый! Прикройте!', 'Трёхсотый! Медика сюда!'],
    gren: ['Граната пошла!', 'Кидаю!', 'Граната! В укрытие!', 'Гранату кидаю, пригнись!'],
    grenin: ['Граната! Ложись!', 'Граната рядом!', 'Ложись! Граната!'],
    flash: ['Светошумовая!', 'Светошумовая! Отвернись!'],
    smoke: ['Ставлю дым!', 'Дым пошёл!', 'Даю дым, готовьтесь!'],
    reload: ['Перезаряжаюсь!', 'Магазин! Прикрой!', 'Пустой! Прикрой!', 'Перезарядка!'],
    supp: ['Прижали, не высунуться!', 'Плотно кроют! Прикройте!', 'Плотно работают по нам!', 'Голову не поднять!'],
    flankL: ['Обхожу слева.'],
    flankR: ['Обхожу справа.'],
    flank: ['Прикройте, захожу во фланг.'],
    onflank: ['Я на фланге. Работаю.', 'Зашёл сбоку, вижу их.', 'На позиции. Вижу противника.'],
    aid: ['Иду к трёхсотому, прикройте!', 'Прикройте! Вытаскиваю трёхсотого!'],
    drag: ['Тащу в укрытие!', 'Тяну его за укрытие!'],
    done: ['Жгут наложил. Время засёк.', 'Перевязал. Жить будет.', 'Кровь остановил.'],
    near: ['Ложись!', 'Накрывают! В укрытие!', 'Прилёт! Ложись!'],
    cover: ['Прикрываю!', 'Давай, прикрою!', 'Работаю, иди!'],
    move: ['Перебегаю!', 'Пошёл!', 'Двигаюсь!'],
    lost: ['Пропал. Не вижу его.', 'Ушёл за укрытие.', 'Потерял его.'],
    clear: ['Вроде чисто.', 'Тихо. Проверяем.', 'Чисто. Осмотреться.'],
    stack: ['На входе. Готов.', 'Стою у входа. Жду.'],
    entry: ['Захожу!', 'Вхожу!', 'Пошёл внутрь!'],
    room: ['Чисто!', 'Комната чистая!', 'Здесь чисто!'],
    ammo: ['Патроны на исходе!', 'Последний магазин!', 'БК кончается!']
  };
  const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function contactText(d, b, vi) {
    const D = DIRS[d];
    if (b === 0) return ['Противник рядом, ' + D + '!', 'Контакт! ' + capFirst(D) + ', рядом!', 'Близко! ' + capFirst(D) + '!'][(d + vi) % 3];
    return ['Контакт! ' + capFirst(D) + ', ' + DISTW[b] + '!', 'Противник ' + D + ', ' + DISTW[b] + '!', 'Вижу противника! ' + capFirst(D) + ', ' + DISTW[b] + '!'][(d + b + vi) % 3];
  }
  const pack = () => (root.__VOICE_DATA && root.__VOICE_DATA.d && root.__VOICE_DATA.voices ? root.__VOICE_DATA : null);
  const vid = (P) => { const V = pack(); return V ? V.voices[P.vi % V.voices.length] : ''; };
  function textOf(key, P) {
    const V = pack(), id = P ? vid(P) : V && V.voices[0];
    if (V && V.tv && id && V.tv[id] && V.tv[id][key]) return V.tv[id][key];
    let m;
    if ((m = /^ct(\d)_(\d)$/.exec(key))) return contactText(+m[1], +m[2], P ? P.vi : 0);
    if ((m = /^([a-zA-Z]+)(\d)$/.exec(key)) && FIX[m[1]]) return FIX[m[1]][+m[2]] || '';
    return '';
  }

  let ctx = null, voices = [], male = [], ru = [], pollT = 0, lastStart = -99, busyUntil = 0, packState = 0, seq = 0;
  let live = [], noiseBuf = null, driveCurve = null, scene = null, pend = [];
  const teamCd = new Map(), called = new Map(), prof = new Map(), BUFS = new Map(), DEC = { ok: 0, fail: 0 };
  const TS = { radioAt: 0, talkAt: 0, whisperAt: 0, contactT: new Map(), clearT: new Map(), fight: new Map(), rs: 0, gs: 0 };
  /* плановые переговоры в затишье (по кругу); доклад о потерях, о контакте, о БК и «рубеж заняли» — по событиям */
  const ROT = ['sitrep', 'check', 'noise', 'move', 'sitrep', 'repeat'];
  const now = () => performance.now() / 1000;
  const teamOf = (s) => s && (s.team || (s.char && s.char.preset && s.char.preset.faction)) || '';
  const alive = (s) => s && !s.dead && !s.out && !s.rd && !(s.hp !== undefined && s.hp <= 0);
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rnd = (s, n, salt) => (hash((s.key || '') + ':' + salt + ':' + Math.floor(now() / 7)) >>> 3) % n;
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  /* ----------------------------------------------------------- Web Speech (запасной путь) */
  function loadVoices() {
    if (!SS) return;
    try { voices = SS.getVoices() || []; } catch (e) { voices = []; }
    ru = voices.filter((v) => /^ru/i.test(v.lang || ''));
    male = ru.filter((v) => MALE.test(v.name) && !FEMALE.test(v.name));
    for (const P of prof.values()) if (P) P.ws = undefined;
  }
  if (SS) { loadVoices(); try { SS.addEventListener('voiceschanged', loadVoices); } catch (e) { SS.onvoiceschanged = loadVoices; } }
  function webProfile(s, P) {
    if (P.ws !== undefined) return P.ws;
    const h = hash(s.key || '?');
    if (male.length) P.ws = { v: male[h % male.length], pitch: 0.7 + ((h >>> 4) % 7) * 0.045, rate: 1.04 + ((h >>> 9) % 5) * 0.04 };
    else if (ru.length) P.ws = { v: ru[h % ru.length], pitch: 0.38 + ((h >>> 4) % 6) * 0.05, rate: 1.0 + ((h >>> 9) % 5) * 0.035 };
    else P.ws = null;
    return P.ws;
  }
  function webSpeak(s, P, text, vol) {
    const W = SS ? webProfile(s, P) : null;
    if (!W) return;
    const S = ctx.set();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = W.v; u.lang = W.v.lang || 'ru-RU'; u.pitch = W.pitch; u.rate = W.rate;
    u.volume = Math.max(0, Math.min(1, vol * (S.voices === undefined ? 1 : S.voices) * (S.volume === undefined ? 0.8 : S.volume) * 1.15));
    u.onend = u.onerror = () => { busyUntil = now() + GAP; };
    try { SS.speak(u); } catch (e) { /* */ }
  }

  /* голос бойца: диктор по порядку в команде (соседи — разные), тембр — скорость воспроизведения */
  function profile(s) {
    const k = s.key || (s.char && s.char.preset && s.char.preset.name) || '?';
    let P = prof.get(k);
    if (P) return P;
    const tm = teamOf(s);
    let n = 0;
    if (ctx && ctx.squad) for (const q of ctx.squad) { if (q === s) break; if (q && teamOf(q) === tm) n++; }
    const nv = Math.max(1, (pack() && pack().voices.length) || 4), off = tm === 'delta' ? 1 : tm === 'alpha' ? 0 : 2;
    P = { vi: (n + off) % nv, rate: RATES[Math.floor(n / nv) % RATES.length], ws: undefined, n };
    prof.set(k, P);
    return P;
  }

  /* ----------------------------------------------------------- записанный пакет */
  function loadPack() {
    if (packState) return;
    if (pack()) { packState = 2; return; }
    if (typeof document === 'undefined' || !document.createElement) { packState = -1; return; }
    packState = 1;
    try {
      const sc = document.createElement('script');
      sc.src = PACK_URL; sc.async = true;
      sc.onload = () => { packState = pack() ? 2 : -1; prof.clear(); };
      sc.onerror = () => { packState = -1; };
      (document.head || document.documentElement).appendChild(sc);
    } catch (e) { packState = -1; }
  }
  function audio() {
    const A = ctx && ctx.audio;
    if (!A || !A.on) return null;
    if (!A.ctx && A.init) try { A.init(); } catch (e) { /* */ }
    return A.ctx ? A : null;
  }
  const usePack = () => packState === 2 && !!audio();
  function b64u8(s) {
    const bin = atob(s), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  /* MP3: срезаем задержку кодера в начале и добивку в конце */
  function trim(c, b) {
    const ch = b.getChannelData(0); let pk = 0;
    for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (v > pk) pk = v; }
    if (pk <= 0) return null;
    const thr = pk * 0.015, pad = Math.round(0.004 * b.sampleRate);
    let i0 = 0, i1 = ch.length - 1;
    while (i0 < ch.length && Math.abs(ch[i0]) < thr) i0++;
    while (i1 > i0 && Math.abs(ch[i1]) < thr) i1--;
    i0 = Math.max(0, i0 - pad); i1 = Math.min(ch.length, i1 + pad * 6);
    if (i0 < 16 && ch.length - i1 < 16) return b;
    const out = c.createBuffer(1, i1 - i0, b.sampleRate);
    out.getChannelData(0).set(ch.subarray(i0, i1));
    return out;
  }
  function clip(A, key) {
    let p = BUFS.get(key);
    if (p) { BUFS.delete(key); BUFS.set(key, p); return p; }
    const P = pack(), str = P && P.d[key];
    if (!str) return null;
    p = new Promise((res) => {
      let done = false;
      const ok = (b) => {
        if (done) return;
        done = true; let r = null;
        try { r = b ? trim(A.ctx, b) : null; } catch (e) { r = null; }
        /* браузер без Opus (старый Safari): два отказа подряд без единого успеха — пакет выключаем, говорит Web Speech */
        if (r) DEC.ok++; else if (++DEC.fail >= 2 && !DEC.ok) { packState = -1; BUFS.clear(); }
        res(r);
      };
      try {
        const q = A.ctx.decodeAudioData(b64u8(str).buffer, ok, () => ok(null));
        if (q && q.then) q.then(ok, () => ok(null));
      } catch (e) { ok(null); }
    });
    BUFS.set(key, p);
    if (BUFS.size > 160) BUFS.delete(BUFS.keys().next().value);
    return p;
  }
  function durOf(P, key) {
    const V = pack(), id = V && V.voices[P.vi % V.voices.length], u = V && V.u && V.u[id];
    if (u && u[key]) return u[key] / P.rate;
    return 0.35 + textOf(key, P).length * 0.06;
  }
  function bq(c, type, f, q, g) { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; if (g) n.gain.value = g; return n; }
  /* тракт: рация или живой голос с места (с панорамой, задержкой и глушением верха по расстоянию) */
  function chain(A, s, vol, radio) {
    const c = A.ctx, dst = A._dry0 || A.dry || A.master, g = c.createGain(), nodes = [g];
    g.gain.value = vol;
    if (API.tap) try { g.connect(API.tap); } catch (e) { /* стенд: замер уровня */ }
    if (radio) {
      if (!driveCurve) {
        driveCurve = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; driveCurve[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); }
      }
      const hp = bq(c, 'highpass', 360, 0.75), pk = bq(c, 'peaking', 1900, 1.1, 4), pre = c.createGain(), ws = c.createWaveShaper(), lp = bq(c, 'lowpass', 3300, 0.9);
      pre.gain.value = 0.55; ws.curve = driveCurve;
      hp.connect(pk); pk.connect(pre); pre.connect(ws); ws.connect(lp); lp.connect(g); g.connect(dst);
      nodes.push(hp, pk, pre, ws, lp);
      return { inp: hp, nodes, delay: 0 };
    }
    const head = { x: s.ctrl.pos.x, y: s.ctrl.pos.y + 1.5, z: s.ctrl.pos.z };
    let sp = null;
    try { sp = ctx.spatial ? ctx.spatial(head) : null; } catch (e) { sp = null; }
    const lp = bq(c, 'lowpass', sp && sp.lp ? sp.lp : 12000, 0.5);
    lp.connect(g); nodes.push(lp);
    let last = g;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = sp ? Math.max(-1, Math.min(1, sp.pan || 0)) : 0; g.connect(p); last = p; nodes.push(p); }
    last.connect(dst);
    if (A.conv) { const w = c.createGain(); w.gain.value = 0.16; g.connect(w); w.connect(A.conv); nodes.push(w); }
    return { inp: lp, nodes, delay: sp && sp.delay ? Math.min(0.12, sp.delay) : 0 };
  }
  /* щелчок тангенты: короткий шум в полосе рации */
  function squelch(A, inp, t, dur, gain) {
    const c = A.ctx;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, Math.round(c.sampleRate * 0.2), c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = noiseBuf;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.004); g.gain.setValueAtTime(gain, t + dur * 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(g); g.connect(inp);
    src.start(t, Math.random() * 0.1); src.stop(t + dur + 0.01);
    track(src);
  }
  function track(src) {
    live.push(src);
    src.onended = () => { const i = live.indexOf(src); if (i >= 0) live.splice(i, 1); try { src.disconnect(); } catch (e) { /* */ } };
  }
  function stopAll() {
    for (const src of live) try { src.stop(); } catch (e) { /* */ }
    live = [];
    seq++;
    scene = null;
    if (SS && (SS.speaking || SS.pending)) try { SS.cancel(); } catch (e) { /* */ }
  }
  /* одна реплика из пакета; true — принято к проигрышу */
  function playPack(s, P, key, vol, radio) {
    const A = audio(), V = pack();
    if (!A || !V) return false;
    const id = vid(P), p = clip(A, id + '/' + key);
    if (!p) return false;
    const token = ++seq;
    p.then((b) => {
      if (token !== seq || !ctx || ctx.S.paused || !alive(s) || s.active || !b) return;
      const c = A.ctx, ch = chain(A, s, vol, radio);
      let t = c.currentTime + 0.02 + ch.delay;
      if (radio) { squelch(A, ch.inp, t, 0.035, 0.05); t += 0.05; }
      const src = c.createBufferSource();
      src.buffer = b; src.playbackRate.value = P.rate;
      src.connect(ch.inp); src.start(t);
      track(src);
      t += b.duration / P.rate;
      if (radio) squelch(A, ch.inp, t + 0.02, 0.07, 0.07);
      busyUntil = Math.max(busyUntil, now() + (t - c.currentTime) + (scene ? 0 : GAP));
      API.last = { who: s.key, keys: [key], voice: id, rate: P.rate, radio, vol: +vol.toFixed(3), dur: +(t - c.currentTime).toFixed(2) };
      setTimeout(() => { for (const n of ch.nodes) try { n.disconnect(); } catch (e) { /* */ } }, Math.max(50, (t + 0.3 - c.currentTime) * 1000));
    }, () => { /* */ });
    return true;
  }

  /* ----------------------------------------------------------- слушатель и маршрут голоса */
  function listener() {
    const a = ctx.active(), cam = ctx.camera, m = cam && cam.matrixWorld && cam.matrixWorld.elements;
    let fx = 0, fz = -1;
    if (m) { fx = -m[8]; fz = -m[10]; const l = Math.hypot(fx, fz); if (l > 1e-4) { fx /= l; fz /= l; } }
    if (a && a.ctrl) return { p: a.ctrl.pos, team: teamOf(a), a, fx, fz };
    return { p: cam.position, team: '', a: null, fx, fz };
  }
  /* как слышно реплику: mode 'radio' | 'live'; vol 0 — не слышно.
     how: 'call' (доклад), 'talk' (разговор рядом), 'whisper', 'net' (переговоры по рации) */
  function route(s, how, L) {
    L = L || listener();
    const d = dist2(s.ctrl.pos, L.p), mate = !!(L.team && teamOf(s) === L.team);
    if (how === 'whisper') return d <= WHISPER_R ? { radio: false, vol: 0.95 * (1 - d / (WHISPER_R + 2)), d } : { vol: 0 };
    if (how === 'talk') return d <= TALK_R ? { radio: false, vol: 0.85 * (1 - d / (TALK_R + 6)), d } : { vol: 0 };
    if (how === 'net') return mate ? { radio: true, vol: 0.85, d } : { vol: 0 };
    if (mate) return d <= LIVE_R ? { radio: false, vol: 1.15 - d / (LIVE_R * 2.2), d } : { radio: true, vol: 1, d };
    if (d > ENEMY_R) return { vol: 0 };
    return { radio: false, vol: Math.max(0.25, 1 - d / (ENEMY_R + 10)), d };
  }
  function enabled() { const S = ctx.set(); return S.calloutSpeech !== false && (S.voices === undefined || S.voices > 0); }
  /* направление и дальность цели словами: для своих — от игрока (куда он смотрит), для чужих — от говорящего */
  function relDir(fx, fz, from, to) {
    const vx = to.x - from.x, vz = to.z - from.z, rx = -fz, rz = fx;
    const a = Math.atan2(vx * rx + vz * rz, vx * fx + vz * fz);
    return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  }
  const binOf = (d) => d < 20 ? 0 : d < 40 ? 1 : d < 75 ? 2 : d < 150 ? 3 : 4;
  function bearing(from, to, frame) {
    const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
    const f = frame || { fx: 0, fz: 1 };
    return { dir: relDir(f.fx, f.fz, from, to), bin: binOf(d), dist: d };
  }
  function contactKeyFor(s, target) {
    const L = listener(), mate = !!(L.team && teamOf(s) === L.team);
    if (mate || !L.team) return bearing(L.p, target.ctrl.pos, L);
    const yw = s.ctrl.yaw || 0;
    return bearing(s.ctrl.pos, target.ctrl.pos, { fx: -Math.sin(yw), fz: -Math.cos(yw) });
  }

  /* ключ реплики для вида доклада */
  function lineFor(s, kind, c) {
    kind = ALIAS[kind] || kind;
    if (kind === 'contact' || kind === 'close') {
      const B = c && c.dir !== undefined ? c : { dir: 0, bin: kind === 'close' ? 0 : 3 };
      return ['ct' + B.dir + '_' + (kind === 'close' ? 0 : Math.max(1, B.bin))];
    }
    if (kind === 'flank') return [rnd(s, 3, 'fl') === 2 ? 'flank0' : c && c.side > 0 ? 'flankR0' : 'flankL0'];
    if (kind === 'flash') return ['flash0'];
    if (kind === 'flashin') return ['flash1'];
    const L = FIX[kind];
    return L ? [kind + rnd(s, L.length, kind)] : null;
  }

  /* сказать реплику сейчас (без проверок интервалов): true — принято */
  function speak(s, key, prio, R, how) {
    const t = now(), P = profile(s);
    /* разговор перебивают важные доклады (>=3); доклад — только граната/обстрел (4) */
    if (scene) { if (prio < 3) return false; stopAll(); }
    else if (t < busyUntil || (SS && (SS.speaking || SS.pending))) { if (prio < 4) return false; stopAll(); }
    return utter(s, P, key, R, how);
  }
  function utter(s, P, key, R, how) {
    const t = now();
    const text = textOf(key, P);
    if (ctx.caption) try { ctx.caption(s, (how === 'whisper' ? '(шёпотом) ' : how === 'net' ? '(рация) ' : '') + capFirst(text)); } catch (e) { /* */ }
    busyUntil = t + 0.15 + durOf(P, key) + (scene ? 0.05 : GAP);
    if (!enabled()) return true;
    const S = ctx.set();
    const gv = (S.voices === undefined ? 1 : S.voices) * (R.radio ? 1.6 : how === 'whisper' ? 1.25 : 1.1) * R.vol;
    if (usePack() && playPack(s, P, key, gv, R.radio)) return true;
    if (packState === 1 && audio()) return true;     /* пакет ещё грузится — промолчим, а не «чужим» голосом */
    if (how === 'call') webSpeak(s, P, text, R.vol);
    return true;
  }

  /* доклад бойца: kind — вид (см. lineFor), c — данные для фразы */
  function say(s, kind, c) {
    kind = ALIAS[kind] || kind;
    if (!ctx || !s || !s.ctrl || PRIO[kind] === undefined) return false;
    if (s.active || !alive(s) || ctx.S.paused || ctx.S.death) return false;
    const t = now(), prio = PRIO[kind];
    const V = s._vox || (s._vox = {});
    if (prio < 4 && t - (V.at || -99) < SELF_CD) return false;
    const tk = teamOf(s) + ':' + kind;
    if (t - (teamCd.get(tk) || -99) < (KIND_CD[kind] || 8)) return false;
    if (prio < 3 && t - lastStart < GLOBAL_CD) return false;
    const R = route(s, 'call');
    if (R.vol <= 0) return false;
    if (kind === 'gren' && c && c.to) pend.push({ at: t + 0.9, kind: 'grenin', to: c.to, team: teamOf(s) });
    if (kind === 'flash' && c && c.to) pend.push({ at: t + 0.7, kind: 'flashin', to: c.to, team: teamOf(s) });
    const keys = lineFor(s, kind, c || {});
    if (!keys || !speak(s, keys[0], prio, R, 'call')) return false;
    V.at = t; teamCd.set(tk, t); lastStart = t;
    return true;
  }

  /* ----------------------------------------------------------- сцены: разговоры и переговоры */
  /* lines: [{ s, key, how }]; реплики по очереди с живой паузой; prio — кто может перебить */
  function startScene(lines, prio) {
    if (!usePack() || !lines.length) return false;
    const t = now();
    if (t < busyUntil || scene) return false;
    scene = { lines, i: 0, next: t, prio, t0: t };
    lastStart = t;
    return true;
  }
  function sceneTick(t) {
    if (!scene || t < scene.next) return;
    const ln = scene.lines[scene.i];
    if (!ln || !alive(ln.s) || ln.s.active) { scene = null; return; }
    const R = route(ln.s, ln.how);
    if (R.vol <= 0) { scene = null; return; }
    const P = profile(ln.s), sc = scene;
    utter(ln.s, P, ln.key, R, ln.how);
    if (scene !== sc) return;
    scene.i++;
    const pause = ln.how === 'net' ? 0.55 + Math.random() * 0.5 : ln.how === 'whisper' ? 0.6 + Math.random() * 0.6 : 0.35 + Math.random() * 0.45;
    scene.next = t + durOf(P, ln.key) + 0.12 + pause;
    if (scene.i >= scene.lines.length) { const end = scene.next; scene = null; busyUntil = Math.max(busyUntil, end + GAP); }
  }
  const scenesMeta = () => (pack() && pack().meta) || null;
  /* двое разных голосов на роли a/b */
  function cast(a, b, roles, prefix, si, how) {
    return roles.map((r, li) => ({ s: r === 'a' ? a : b, key: prefix + si + '_' + li, how }));
  }
  function mates(team, L) {
    const out = [];
    for (const s of ctx.squad) if (s && s.ctrl && !s.active && alive(s) && teamOf(s) === team) out.push(s);
    return out;
  }
  function calmFor(team, t) { return t - (TS.contactT.get(team) || -999); }
  /* бой команды: с первого контакта до доклада о потерях; свои потери считаются по факту */
  function fightOf(team, t, s) {
    let F = TS.fight.get(team);
    if (!F || F.loss) {
      const quiet = calmFor(team, t);
      F = { t0: t, dead: 0, hurt: new Set(), by: s || null, contactAt: quiet > 60 ? t + 3.5 : 0, contact: false, loss: false, task: false, talk: false };
      TS.fight.set(team, F);
    }
    return F;
  }
  /* тяжёлый трёхсотый: без сознания, шок, артериальное кровотечение или перебита нога (js/polygon/23_game_damage.js) */
  function heavy(s) {
    const D = s.dmg, ph = D && D.ph;
    if (s.unconscious || (ph && (ph.unc || (ph.shock || 0) > 0.35))) return true;
    if (D && ((D.bleedArt || 0) > 0 || (D.bleed || 0) > 1.5)) return true;
    return !!(s.ctrl && s.ctrl.injLeg);
  }
  /* что докладывать о потерях: m_loss0 «Потерь нет» … m_loss23 «двухсотый и трёхсотый» */
  function lossKey(F) {
    if (!F) return 'm_loss0';
    let w = 0, h = false;
    for (const q of F.hurt) if (alive(q)) { w++; if (heavy(q)) h = true; }
    const V = pack(), has = (k) => !V || !V.tv || !V.tv[V.voices[0]] || !!V.tv[V.voices[0]][k];
    if (F.dead > 0) return w > 0 ? 'm_loss23' : F.dead > 1 && has('m_loss22') ? 'm_loss22' : 'm_loss2';
    if (w > 0) return h ? 'm_loss3h' : w > 1 && has('m_loss33') ? 'm_loss33' : 'm_loss3';
    return 'm_loss0';
  }
  /* сцена радиообмена из V.meta.radio: роли a (Первый) и b (Второй/Третий — cb), ключи собираются по правилам вызова */
  function radioLines(name, a, b, cb, F) {
    const M = scenesMeta(), sc = M && M.radio && M.radio[name];
    if (!sc || !a || !b) return [];
    const loss = lossKey(F), out = [];
    for (const [r, spec] of sc) {
      let k = spec;
      if (k === 'c1b') k = 'c1' + cb;
      else if (k === 'cb1') k = 'c' + cb + '1';
      else if (k === 'ab') k = 'a' + cb;
      else if (k === 'loss*') k = loss;
      else if (k.indexOf('|') >= 0) {
        const o = k.split('|');
        k = name === 'losses' ? (loss === 'm_loss3h' ? 'm_evacack' : loss === 'm_loss0' ? 'm_ackend' : 'm_holdack') : 'm_' + o[(Math.random() * o.length) | 0];
      } else if (!/^(c\d\d|a\d)$/.test(k)) k = 'm_' + k;
      out.push({ s: r === 'a' ? a : b, key: k, how: 'net' });
    }
    return out;
  }
  /* затишье и после боя: переговоры по рации своей команды (их слышит только игрок этой команды).
     Первый — старший из ИИ (раньше всех в команде), Второй/Третий — следующие по порядку. */
  function radioChatter(t, L) {
    const M = scenesMeta();
    if (!M || !M.radio || Array.isArray(M.radio) || !L.team) return;
    const F = TS.fight.get(L.team), calm = calmFor(L.team, t);
    let name = null, who = null;
    if (F && !F.contact && F.contactAt && t > F.contactAt) {
      if (t - F.contactAt < 8 && F.by && alive(F.by) && dist2(F.by.ctrl.pos, L.p) > LIVE_R) { name = 'contact'; who = F.by; }
      else F.contact = true;
    } else if (F && !F.loss && calm > 18 && calm < 150) name = 'losses';
    else if (F && F.loss && !F.task && calm > 55 && calm < 240) name = 'task';
    else if (calm > 20 && t > (TS.ammoAt || 0)) {
      for (const q of mates(L.team, L)) if (q.ctrl && q.ctrl.reserve !== undefined && q.ctrl.reserve <= (q.ctrl.magCap || 30) && t - ((q._vox && q._vox.ammoR) || -999) > 150) { name = 'ammo'; who = q; break; }
    }
    if (!name && t >= TS.radioAt && calm >= 35) name = ROT[TS.rs++ % ROT.length];
    if (!name) return;
    const ms = mates(L.team, L).filter((q) => dist2(q.ctrl.pos, L.p) > LIVE_R * 0.6 || q === who);
    if (ms.length < 2) { if (name !== 'losses' && name !== 'contact') TS.radioAt = t + 30; return; }
    ms.sort((x, y) => profile(x).n - profile(y).n);
    const a = ms[0];
    let b = who && who !== a ? who : ms.find((q, i) => i > 0 && profile(q).vi !== profile(a).vi && (i <= 2 || Math.random() < 0.5)) || ms[1];
    if (who === a) { if (name === 'contact') F.contact = true; else if (name === 'ammo') TS.ammoAt = t + 40; return; }
    const cb = ms.indexOf(b) >= 2 ? 3 : 2;
    if (!startScene(radioLines(name, a, b, cb, F), name === 'contact' || name === 'losses' ? 3 : 2)) return;
    if (name === 'contact') F.contact = true;
    else if (name === 'losses') F.loss = true;
    else if (name === 'task') F.task = true;
    else if (name === 'ammo') { (b._vox || (b._vox = {})).ammoR = t; TS.ammoAt = t + 60; }
    else TS.radioAt = t + 70 + Math.random() * 60;
    if (name !== 'contact') TS.radioAt = Math.max(TS.radioAt, t + 40);
  }
  /* разговор двоих рядом с игроком: в бою — как обойти/прикрыть, в затишье — о своём или шёпотом */
  function nearTalk(t, L) {
    const M = scenesMeta();
    if (!M || !M.dialog || t < TS.talkAt) return;
    TS.talkAt = t + 4;
    let best = null;
    const all = ctx.squad.filter((s) => s && s.ctrl && !s.active && alive(s) && dist2(s.ctrl.pos, L.p) < TALK_R - 2);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (teamOf(a) !== teamOf(b)) continue;
      const d = dist2(a.ctrl.pos, b.ctrl.pos);
      if (d > 7) continue;
      const k = d + dist2(a.ctrl.pos, L.p) * 0.5;
      if (!best || k < best.k) best = { a, b, k };
    }
    if (!best) return;
    const team = teamOf(best.a), calm = calmFor(team, t), sa = best.a.battle, sb = best.b.battle;
    const hot = (sa && sa.los) || (sb && sb.los) || ((sa && sa.suppression) || 0) > 0.5;
    if (hot) return;
    let pool;
    const F = TS.fight.get(team);
    if (calm < 22) pool = [0, 1, 5, 6];                  /* противник рядом, но не стреляем: план */
    else if (F && !F.talk && calm < 120) { F.talk = true; pool = F.dead || F.hurt.size ? [13] : [12, 13]; }   /* после боя */
    else if (calm > 45 && dist2(best.a.ctrl.pos, L.p) < WHISPER_R) pool = [8, 9, 10, 11, 14, 2, 3, 4];
    else pool = [2, 3, 4, 8, 9, 10, 11];
    pool = pool.filter((i) => M.dialog[i]);
    if (!pool.length) return;
    const si = pool[TS.gs++ % pool.length], D = M.dialog[si];
    if (!D) return;
    const how = D.w ? 'whisper' : 'talk';
    if (how === 'whisper' && dist2(best.a.ctrl.pos, L.p) > WHISPER_R) return;
    let a = best.a, b = best.b;
    if (profile(a).vi === profile(b).vi && Math.random() < 0.5) { const q = a; a = b; b = q; }
    if (startScene(cast(a, b, D.roles, 'g', si, how), 2)) TS.talkAt = t + 40 + Math.random() * 45;
  }
  /* одиночный шёпот рядом с игроком в скрытном движении */
  function soloWhisper(t, L) {
    const M = scenesMeta();
    if (!M || t < TS.whisperAt) return;
    TS.whisperAt = t + 3;
    const near = ctx.squad.filter((s) => s && s.ctrl && !s.active && alive(s) && (!L.team || teamOf(s) === L.team) && dist2(s.ctrl.pos, L.p) < WHISPER_R - 2);
    if (!near.length) return;
    const s = near[(Math.random() * near.length) | 0];
    if (calmFor(teamOf(s), t) < 30 || (s.battle && s.battle.los)) return;
    if (t < busyUntil || scene) return;
    const i = (Math.random() * 12) | 0;
    if (startScene([{ s, key: 'w' + i, how: 'whisper' }], 1)) TS.whisperAt = t + 28 + Math.random() * 40;
  }

  /* ----------------------------------------------------------- опрос боя 4 раза в секунду */
  function poll(t) {
    const sq = ctx.squad, L = listener();
    for (const s of sq) {
      if (!s || !s.ctrl) continue;
      const V = s._vox || (s._vox = {});
      const live_ = alive(s), team = teamOf(s);
      if (V.live && !live_) died(s, t);
      V.live = live_;
      if (!live_ || s.active) { V.tgt = null; V.hits = s.dmg ? s.dmg.hits : 0; continue; }
      /* ранение: сам — «Меня зацепило!», или сосед — «Есть раненый!» */
      const hits = s.dmg ? s.dmg.hits || 0 : 0;
      if (V.hits !== undefined && hits > V.hits) {
        fightOf(team, t, s).hurt.add(s);
        TS.contactT.set(team, t);
        if (Math.random() < 0.6) say(s, 'hit');
        else { const m = nearestMate(s, 14); if (m) say(m, 'wounded'); }
      }
      V.hits = hits;
      /* перебежка под огнём: «Перебегаю!» — сосед «Прикрываю!» */
      const p = s.ctrl.pos, sp = V.px === undefined ? 0 : Math.hypot(p.x - V.px, p.z - V.pz) / 0.25;
      V.px = p.x; V.pz = p.z;
      if (sp < 0.6) V.still = (V.still || 0) + 0.25; else if (sp > 2.6) {
        if ((V.still || 0) > 2 && calmFor(team, t) < 12) {
          const m = nearestMate(s, 12);
          if (m && say(s, 'move')) pend.push({ at: t + 0.9, kind: 'cover', who: m });
        }
        V.still = 0;
      }
      const b = s.battle;
      if (!b) continue;
      if (b.los && b.target) { fightOf(team, t, s); TS.contactT.set(team, t); }
      /* новый противник в прямой видимости */
      if (b.los && b.target && b.target !== V.tgt && alive(b.target) && b.target.ctrl) {
        const key = b.target, c0 = called.get(key);
        if (!c0 || t - c0.t > 20 || c0.team !== team) {
          const B = contactKeyFor(s, key);
          if (say(s, B.bin === 0 ? 'close' : 'contact', B)) called.set(key, { t, by: s, team });
        } else if (c0.by !== s && t - c0.t < 10) say(s, 'confirm');
      }
      if (b.los && b.target) { V.tgt = b.target; V.losT = t; }
      else if (V.tgt && t - (V.losT || t) > 5) { if (alive(V.tgt) && Math.random() < 0.25) say(s, 'lost'); V.tgt = null; }
      else if (!b.target) V.tgt = null;
      V.seen = b.los && b.target ? b.target : V.seen;
      V.seenT = b.los ? t : V.seenT;
      const rl = s.ctrl.reload >= 0;
      if (rl && !V.rl && b.memory) {
        /* последний магазин — «Последний магазин!» / «БК кончается!», иначе обычное «Перезаряжаюсь!» */
        const low = s.ctrl.reserve !== undefined && s.ctrl.reserve <= (s.ctrl.magCap || 30);
        if (low && Math.random() < 0.8) say(s, 'ammo'); else if (Math.random() < 0.6) say(s, 'reload');
      }
      V.rl = rl;
      const sup = (b.suppression || 0) > 0.85;
      if (sup && !V.sup && Math.random() < 0.5) say(s, 'supp');
      V.sup = sup;
    }
    /* «Вроде чисто.» — после боя, когда 40 с никого не видно */
    for (const [team, ct] of TS.contactT) {
      if (t - ct > 40 && t - ct < 60 && (TS.clearT.get(team) || -1) < ct) {
        const ms = mates(team, L);
        if (ms.length && say(ms[(Math.random() * ms.length) | 0], 'clear')) TS.clearT.set(team, t);
      }
    }
    if (called.size > 64) for (const [k, v] of called) if (t - v.t > 30) called.delete(k);
    if (usePack() && enabled()) { radioChatter(t, L); nearTalk(t, L); soloWhisper(t, L); }
  }
  function nearestMate(s, R) {
    let best = null, bd = R;
    for (const q of ctx.squad) {
      if (q === s || !q || !q.ctrl || q.active || !alive(q) || teamOf(q) !== teamOf(s)) continue;
      const d = dist2(q.ctrl.pos, s.ctrl.pos);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }
  /* отложенные реплики: граната летит к ним, «прикрываю» после «перебегаю» */
  function pending(t) {
    if (!pend.length) return;
    for (let i = pend.length - 1; i >= 0; i--) {
      const e = pend[i];
      if (t < e.at) continue;
      pend.splice(i, 1);
      if (e.who) { if (alive(e.who)) say(e.who, e.kind); continue; }
      let best = null, bd = 10;
      for (const s of ctx.squad) {
        if (!s || !s.ctrl || s.active || !alive(s) || teamOf(s) === e.team) continue;
        const d = Math.hypot(s.ctrl.pos.x - e.to.x, s.ctrl.pos.z - e.to.z);
        if (d < bd) { bd = d; best = s; }
      }
      if (best) say(best, e.kind);
    }
  }
  /* боец погиб: ближайший живой свой — «Потеряли одного.», стрелок противника — «Готов.» */
  function died(q, t) {
    const tq = teamOf(q), p = q.ctrl.pos;
    let mate = null, md = 40, shooter = null;
    for (const s of ctx.squad) {
      if (s === q || !alive(s) || s.active || !s.ctrl) continue;
      const V = s._vox || {};
      if (teamOf(s) === tq) {
        const d = Math.hypot(s.ctrl.pos.x - p.x, s.ctrl.pos.z - p.z);
        if (d < md) { md = d; mate = s; }
      } else if (V.seen === q && t - (V.seenT || -99) < 1.5) shooter = s;
    }
    called.delete(q);
    const F = fightOf(tq, t, null);
    F.dead++; F.hurt.delete(q);
    TS.contactT.set(tq, t);
    if (mate && say(mate, 'mandown')) return;
    if (shooter && Math.random() < 0.45) say(shooter, 'kill');
  }

  const API = {
    /* o: { squad, active(), camera, S, set(), caption(s, text), audio (GAudio), spatial(pos) } */
    init(o) {
      ctx = o; teamCd.clear(); called.clear(); prof.clear(); pollT = 0; lastStart = -99; busyUntil = 0; scene = null; pend = [];
      TS.radioAt = now() + 50; TS.talkAt = now() + 20; TS.whisperAt = now() + 25; TS.ammoAt = 0; TS.contactT.clear(); TS.clearT.clear(); TS.fight.clear();
      if (SS && !voices.length) loadVoices();
      if (o.audio && enabled()) loadPack();
    },
    update(dt) {
      if (!ctx) return;
      if (ctx.S.paused) { if (live.length || scene || (SS && SS.speaking)) stopAll(); return; }
      const t = now();
      try { sceneTick(t); pending(t); } catch (e) { scene = null; }
      if ((pollT -= dt) > 0) return;
      pollT = 0.25;
      if (!packState && ctx.audio && enabled()) loadPack();
      try { poll(t); } catch (e) { if (!API._warn) { API._warn = 1; console.warn('voice', e); } }
    },
    say,
    /* фраза медика/тактики (js/polygon/30b_tactics.js); возвращает текст реплики для субтитра */
    line(s, kind) {
      kind = ALIAS[kind] || kind;
      /* «done»: после жгута — done0 («Жгут наложил. Время засёк.»), после перевязки — done1/done2 */
      let fixed = null;
      if (kind === 'doneTq') { kind = 'done'; fixed = 'done0'; }
      else if (kind === 'done') fixed = 'done' + (1 + rnd(s, 2, kind));
      if (!ctx || !s || !s.ctrl || !FIX[kind] || s.active || !alive(s) || ctx.S.paused) return false;
      const R = route(s, 'call');
      if (R.vol <= 0) return false;
      const key = fixed || kind + rnd(s, FIX[kind].length, kind), P = profile(s);
      const cap0 = ctx.caption; ctx.caption = null;
      const ok = speak(s, key, PRIO[kind] || 1, R, 'call');
      ctx.caption = cap0;
      return ok ? capFirst(textOf(key, P)) : false;
    },
    bearing,
    textOf: (key, s) => textOf(key, s ? profile(s) : null),
    lineFor: (s, kind, c) => lineFor(s, kind, c || {}),
    route: (s, how) => route(s, how || 'call'),
    scene: () => scene && { i: scene.i, n: scene.lines.length, keys: scene.lines.map((l) => l.key), how: scene.lines[0].how },
    /* стенды: запустить сцену вручную */
    play(kind, a, b, si, o) {
      const M = scenesMeta();
      if (!M) return false;
      if (kind === 'radio') {
        const nm = typeof si === 'string' ? si : Object.keys(M.radio)[si];
        return startScene(radioLines(nm, a, b, profile(b).n > profile(a).n + 1 ? 3 : 2, o && o.fight), 2);
      }
      if (kind === 'dialog') { const D = M.dialog[si]; return startScene(cast(a, b, D.roles, 'g', si, D.w ? 'whisper' : 'talk'), 2); }
      if (kind === 'whisper') return startScene([{ s: a, key: 'w' + si, how: 'whisper' }], 1);
      return false;
    },
    stop: stopAll,
    reset() { stopAll(); teamCd.clear(); called.clear(); lastStart = -99; busyUntil = 0; pend = []; TS.contactT.clear(); TS.fight.clear(); if (ctx) for (const s of ctx.squad) if (s && s._vox) s._vox.at = -99; },
    fight: (team) => { const F = TS.fight.get(team); return F && { dead: F.dead, hurt: F.hurt.size, contact: F.contact, loss: F.loss, task: F.task, key: lossKey(F) }; },
    radioLines: (name, a, b, cb, F) => radioLines(name, a, b, cb || 2, F),
    state: () => ({ pack: packState, clips: pack() ? Object.keys(pack().d).length : 0, decoded: BUFS.size, live: live.length, busy: Math.max(0, busyUntil - now()), scene: !!scene }),
    voices: () => ({ all: voices.length, ru: ru.map((v) => v.name), male: male.map((v) => v.name), pack: pack() ? pack().voices : [] }),
    profile
  };
  root.GVoice = API;
})(typeof window !== 'undefined' ? window : self);
