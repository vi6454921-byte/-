
/* ==========================================================================
   МОДУЛЬ: game/damage.js
   ========================================================================== */
/* ============================================================================
   Попадания по бойцам.

   Раньше пуля проходила сквозь людей. Теперь у каждого бойца есть
   анатомические зоны — капсулы и боксы в системе покоя костей (голова,
   шея, грудь, живот, таз, плечо, предплечье, кисть, бедро, голень, стопа)
   — и трасса пули проверяется по ним на каждом шаге интегрирования.
   Точка входа уточняется по самой сетке одежды (первая поверхность вдоль
   луча в системе покоя), поэтому пробоина и кровь ложатся ровно туда, куда
   попала пуля, и живут на ткани при любой позе.

   Баллистическая защита: плиты плитоноски (спереди и сзади) держат пулю —
   боец получает удар и отшатывается; шлем при скользящем попадании даёт
   рикошет, при прямом — пробит. Балаклава и панама не защищают.

   Живой боец реагирует на попадание: корпус и голова дёргаются по
   импульсу пули (пружины с недодемпфированием), нога подламывается.
   Смерть — рэгдолл: частицы в суставах, жёсткие связи костей, ограничения
   колен, шеи и позвоночника, трение о грунт; автомат падает на ремне.
   ========================================================================== */
(function (root, factory) {
  const D = factory(root.GUtil);
  if (typeof module !== 'undefined' && module.exports) module.exports = D;
  else root.GDamage = D;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  /* ------------------------------------------------ раневая баллистика ---
     Сколько пуль нужно, чтобы вывести человека из строя, — не число, а
     распределение. Опора — раневая баллистика и военная медицина:
       * ЦНС (головной мозг, ствол, шейный отдел спинного мозга) — мгновенная
         потеря дееспособности, это единственный «гарантированный» выстрел;
       * сердце, аорта, крупные сосуды — 5–15 с до потери сознания
         (падение давления, ~20 % объёма крови), смерть — за минуты;
       * лёгкие, печень, кишечник — боец может действовать минутами,
         кровопотеря продолжается;
       * конечности — не смертельны, кроме бедренной/плечевой артерии
         (без жгута — гибель за минуты) и шока от переломов.
     Пуля 5,45×39 (3,4 г, 880 м/с, ~1 300 Дж) после 7–10 см в тканях
     кувыркается — раневой канал широкий. В итоге без брони: голова — 1;
     грудь/живот — обычно 2–3 (≈ 1 из 6 — сразу, сердце/аорта); руки и
     ноги — 4–6 или смерть от артериального кровотечения. dmg — урон
     здоровью (из 100), var — разброс, bleed — кровопотеря, ед/с;
     vessel — вероятность задеть крупный сосуд/сердце (доля сечения зоны);
     bone — перелом. */
  const ZONES = {
    head: { dmg: 999, cns: true, name: 'Голова', blood: 0.034 },
    helmet: { dmg: 0, name: 'Шлем', blood: 0.03 },
    neck: { dmg: 60, var: 10, bleed: 3, name: 'Шея', blood: 0.05,
      vessel: { p: 0.65, name: 'Сонная артерия / позвоночник', dmg: 30, bleed: 9, instant: 0.55 } },
    thorax: { dmg: 46, var: 9, bleed: 1.0, name: 'Грудь', blood: 0.055, bone: 0.3,
      vessel: { p: 0.18, name: 'Сердце', dmg: 40, bleed: 9, instant: 0.35 } },
    plate: { dmg: 0, name: 'Плита', blood: 0 },
    abdomen: { dmg: 36, var: 8, bleed: 1.4, name: 'Живот', blood: 0.06,
      vessel: { p: 0.2, name: 'Печень / аорта', dmg: 15, bleed: 4 } },
    pelvis: { dmg: 34, var: 8, bleed: 1.2, name: 'ТАЗ', blood: 0.055, bone: 0.35,
      vessel: { p: 0.15, name: 'Подвздошная артерия', dmg: 10, bleed: 5 } },
    uarm: { dmg: 22, var: 5, bleed: 0.6, name: 'Плечо', blood: 0.045, bone: 0.3,
      vessel: { p: 0.1, name: 'Плечевая артерия', dmg: 6, bleed: 3.5 } },
    farm: { dmg: 14, var: 4, bleed: 0.4, name: 'Предплечье', blood: 0.04, bone: 0.35,
      vessel: { p: 0.08, name: 'Лучевая артерия', dmg: 4, bleed: 1.5 } },
    hand: { dmg: 9, var: 3, bleed: 0.3, name: 'Кисть', blood: 0.02, bone: 0.4 },
    thigh: { dmg: 26, var: 6, bleed: 0.9, name: 'Бедро', blood: 0.055, bone: 0.3,
      vessel: { p: 0.12, name: 'Бедренная артерия', dmg: 8, bleed: 6 } },
    shin: { dmg: 18, var: 4, bleed: 0.5, name: 'Голень', blood: 0.045, bone: 0.4,
      vessel: { p: 0.06, name: 'Большеберцовая артерия', dmg: 4, bleed: 2 } },
    foot: { dmg: 10, var: 3, bleed: 0.3, name: 'Стопа', blood: 0.03, bone: 0.5 },
    /* подрыв на мине: зона условная — у раны нет одной точки входа */
    blast: { dmg: 999, name: 'Подрыв на мине', blood: 0.07 },
    frag: { dmg: 999, name: 'Осколки', blood: 0.05 }
  };

  /* Патроны 5,45×39 (АК-74). pen — пробивная способность в условных
     единицах классов ГОСТ 34286-2017 у дульного среза; падает примерно
     пропорционально скорости пули. Бр4 сертифицируется именно по 7Н10 с
     10 м, Бр5 — по 7,62×54R (7Н13), поэтому БС 7Н24 Бр4 пробивает, а Бр5
     держит его чаще всего. */
  const AMMO = {
    '7N6': { name: 'ПС 7Н6', v0: 880, pen: 3.0 },
    '7N10': { name: 'ПП 7Н10', v0: 880, pen: 3.75 },
    '7N24': { name: 'БС 7Н24', v0: 840, pen: 5.1 }
  };
  const DEFAULT_AMMO = '7N10';
  /* Броня. A — стойкость слоя в тех же единицах. Мягкий пакет плитоноски
     (арамид, Бр2) держит пистолет и осколки, автоматная пуля его проходит.
     Шлем 6Б47 — класс Бр1 (пуля ПМ с 5 м, осколки): пуля автомата пробивает,
     кроме касательных попаданий. */
  function armorFor(P) {
    const alpha = P.faction === 'alpha';
    const L = (kind, name, A) => ({ kind, name, A, integ: 1, hits: [] });
    /* v26: тип защиты из редактора внешнего вида — плитоноска / облегчённая
       (slick, плиты те же) / мягкий бронежилет (только Бр2) / без брони */
    const kind = P.armor || 'plate';
    const plates = kind === 'plate' || kind === 'slick';
    const A = {
      plates,
      front: L('plate', alpha ? 'Плита Бр5' : 'Плита Бр4', alpha ? 5.6 : 4.3),
      back: L('plate', alpha ? 'Плита Бр5 (спина)' : 'Плита Бр4 (спина)', alpha ? 5.6 : 4.3),
      soft: kind === 'none' ? null : L('soft', kind === 'soft' ? 'Мягкий бронежилет Бр2' : 'Мягкий пакет Бр2', 2.0),
      helmet: P.head === 'helmet' ? L('helmet', alpha ? 'Шлем Бр2' : 'Шлем 6Б47 Бр1', alpha ? 2.2 : 1.25) : null
    };
    return A;
  }
  /* Пробитие слоя: логистическая кривая вокруг баланса «пробивная
     способность — стойкость». Стойкость растёт с углом встречи (путь в
     материале ~ 1/cos), падает от трещин вокруг прежних попаданий (≤ 6 см —
     керамика уже расколота) и общего износа плиты. Скользящий удар по
     твёрдой броне — рикошет. */
  function penetrate(layer, ammo, v, cosI, q) {
    const pEff = ammo.pen * clamp(v / ammo.v0, 0.2, 1.05);
    /* v14: керамика после попадания раскалывается конусом — в радиусе
       ~5–9 см от прежней пробоины плита почти ничего не держит (повторное
       попадание «в трещину» — главный механизм пробития многоударных плит,
       NIJ 0101.06 проверяет 6 выстрелов на плиту в разнос, а не в точку). */
    let crack = 1;
    for (const h of layer.hits) {
      const d = Math.hypot(h[0] - q[0], h[1] - q[1], h[2] - q[2]);
      if (d < 0.09) crack = Math.min(crack, 0.28 + 0.72 * Math.pow(d / 0.09, 1.5));
    }
    const hard = layer.kind !== 'soft';
    let aRaw = layer.A * layer.integ * (hard ? crack : 1);
    /* подложка плиты (СВМПЭ/арамид) держит пистолетную пулю даже за
       расколотой керамикой — теряет стойкость медленнее керамики */
    if (layer.kind === 'plate') aRaw = Math.max(aRaw, 2.8 * (0.55 + 0.45 * layer.integ));
    const aEff = aRaw / Math.pow(Math.max(cosI, 0.25), 0.7);
    let p = 1 / (1 + Math.exp(-(pEff - aEff) / 0.22));
    let ric = false;
    if (hard && cosI < 0.42 && Math.random() < (0.42 - cosI) / 0.42 * 1.6) { ric = true; p = 0; }
    const pen = !ric && Math.random() < p;
    layer.hits.push(q.slice());
    if (layer.hits.length > 16) layer.hits.shift();
    /* общий износ: каждая остановленная винтовочная пуля оставляет сеть
       трещин и расслоение подложки — после 2–3 попаданий автоматной пулей
       Бр4 уже не держит, Бр5 — после 3–5. Мягкий пакет теряет меньше. */
    const wear = layer.kind === 'plate' ? (pen ? 0.22 : 0.15) * clamp(pEff / 3.5, 0.3, 1.4) : layer.kind === 'helmet' ? 0.12 : 0.05;
    layer.integ = Math.max(0.12, layer.integ - wear);
    layer.n = (layer.n || 0) + 1;
    return { pen, p, ric, layer };
  }
  /* отрыв конечностей: сколько попаданий нужно в одну конечность и по
     какому суставу она отделяется */
  const LIMB_CUT = { hand: 2, farm: 2, uarm: 3, foot: 2, shin: 2, thigh: 3 };
  const LIMB_JOINT = { hand: 'wrist', farm: 'elbow', uarm: 'shoulder', foot: 'ankle', shin: 'knee', thigh: 'hip' };

  /* Зоны в координатах покоя базовой модели (м). cap — капсула (две точки
     или имена суставов), box — бокс. set — кости, чьи вершины считаются
     поверхностью зоны при уточнении точки входа. */
  function shapeDefs() {
    const L = [
      { bone: 'head', zone: 'head', cap: [[0, 1.668, -0.062], [0, 1.756, -0.035]], r: 0.09, set: ['head', 'jaw', 'eyeR', 'eyeL', 'lidR', 'lidL'] },
      { bone: 'neck', zone: 'neck', cap: [[0, 1.53, 0.0], [0, 1.64, -0.03]], r: 0.058, set: ['neck'] },
      { bone: 'chest', zone: 'thorax', box: [[-0.178, 1.20, -0.175], [0.178, 1.52, 0.145]], set: ['chest', 'clavR', 'clavL'] },
      { bone: 'spine', zone: 'abdomen', box: [[-0.162, 1.06, -0.16], [0.162, 1.20, 0.135]], set: ['spine'] },
      { bone: 'hips', zone: 'pelvis', box: [[-0.178, 0.90, -0.135], [0.178, 1.06, 0.145]], set: ['hips'] }
    ];
    for (const S of ['R', 'L']) {
      const sg = S === 'R' ? 1 : -1;
      L.push(
        { bone: 'shoulder' + S, zone: 'uarm', cap: ['shoulder' + S, 'elbow' + S], r: 0.054, set: ['shoulder' + S, 'armTwist' + S] },
        { bone: 'elbow' + S, zone: 'farm', cap: ['elbow' + S, 'wrist' + S], r: 0.044, set: ['elbow' + S, 'foreTwist' + S] },
        { bone: 'wrist' + S, zone: 'hand', cap: ['wrist' + S, ['wrist' + S, [sg * 0.095, -0.005, 0]]], r: 0.04, set: ['wrist' + S, 'palm' + S] },
        { bone: 'hip' + S, zone: 'thigh', cap: ['hip' + S, 'knee' + S], r: 0.082, set: ['hip' + S] },
        { bone: 'knee' + S, zone: 'shin', cap: ['knee' + S, 'ankle' + S], r: 0.058, set: ['knee' + S] },
        { bone: 'ankle' + S, zone: 'foot', cap: [['ankle' + S, [0, -0.04, 0.035]], 'toe' + S], r: 0.05, set: ['ankle' + S, 'toe' + S] }
      );
    }
    return L;
  }

  /* ------------------------------------------------ геометрия лучей --- */
  /* Капсула (И. Килез): t входа или -1. */
  function rayCapsule(o, d, a, b, r) {
    const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
    const oax = o[0] - a[0], oay = o[1] - a[1], oaz = o[2] - a[2];
    const baba = bax * bax + bay * bay + baz * baz;
    const bard = bax * d[0] + bay * d[1] + baz * d[2];
    const baoa = bax * oax + bay * oay + baz * oaz;
    const rdoa = d[0] * oax + d[1] * oay + d[2] * oaz;
    const oaoa = oax * oax + oay * oay + oaz * oaz;
    const A = baba - bard * bard;
    let h;
    if (A > 1e-10) {
      const B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - r * r * baba;
      h = B * B - A * C;
      if (h < 0) return -1;
      const t = (-B - Math.sqrt(h)) / A;
      const y = baoa + t * bard;
      if (y > 0 && y < baba) return t;
      const ocx = y <= 0 ? oax : o[0] - b[0], ocy = y <= 0 ? oay : o[1] - b[1], ocz = y <= 0 ? oaz : o[2] - b[2];
      const bb = d[0] * ocx + d[1] * ocy + d[2] * ocz, c = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
      h = bb * bb - c;
      return h > 0 ? -bb - Math.sqrt(h) : -1;
    }
    /* луч вдоль оси: только полусферы */
    let best = -1;
    for (const p of [a, b]) {
      const ocx = o[0] - p[0], ocy = o[1] - p[1], ocz = o[2] - p[2];
      const bb = d[0] * ocx + d[1] * ocy + d[2] * ocz, c = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
      h = bb * bb - c;
      if (h > 0) { const t = -bb - Math.sqrt(h); if (t >= 0 && (best < 0 || t < best)) best = t; }
    }
    return best;
  }
  /* Бокс: t входа и ось грани входа. */
  function rayBox(o, d, lo, hi) {
    let t0 = -Infinity, t1 = Infinity, ax = -1, sg = 0;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return null; continue; }
      let a = (lo[i] - o[i]) / d[i], b = (hi[i] - o[i]) / d[i], s = -1;
      if (a > b) { const tt = a; a = b; b = tt; s = 1; }
      if (a > t0) { t0 = a; ax = i; sg = s; }
      if (b < t1) t1 = b;
      if (t0 > t1) return null;
    }
    return t1 < 0 ? null : { t: t0, ax, sg };
  }

  /* --------------------------------------------- материалы: раны ----- */
  const NW = 12;
  const WND_NOISE = `
float wndH(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float wndN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wndH(i), wndH(i + vec3(1, 0, 0)), f.x), mix(wndH(i + vec3(0, 1, 0)), wndH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(wndH(i + vec3(0, 0, 1)), wndH(i + vec3(1, 0, 1)), f.x), mix(wndH(i + vec3(0, 1, 1)), wndH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
`;
  const WND_PARS = `
uniform vec4 uWnd[${NW}];
uniform float uWndD[${NW}];
varying vec3 vWndP;
uniform vec4 uCut[4];
float wndWet = 0.0;
float wndCut = 0.0;
` + WND_NOISE + ``;
  /* Пятно крови на ткани: основное «облако» (вниз тянется сильнее —
     кровь стекает), рваный край по шуму, тёмная кайма подсыхания,
     потёки вниз, пробоина в центре. Свежая кровь — мокрая (ниже
     шероховатость), со временем темнеет и буреет. Ссадина на плите/шлеме —
     светлая потёртость краски без крови. */
  const WND_FRAG = `
    for (int i = 0; i < ${NW}; i++) {
      vec4 W = uWnd[i];
      if (W.w == 0.0) continue;
      /* вид следа закодирован в w: < 0 — ссадина, 0..9 — пулевая рана,
         10+r — копоть, 20+r — рваная рана (подрыв, осколок) */
      float kd = W.w > 39.0 ? 5.0 : (W.w > 29.0 ? 4.0 : (W.w > 19.0 ? 3.0 : (W.w > 9.0 ? 2.0 : (W.w > 0.0 ? 1.0 : 0.0))));
      float r = kd > 4.5 ? W.w - 40.0 : (kd > 3.5 ? W.w - 30.0 : (kd > 2.5 ? W.w - 20.0 : (kd > 1.5 ? W.w - 10.0 : abs(W.w))));
      vec3 dv = vWndP - W.xyz;
      float h = length(dv);
      if (h > r * 3.2 + 0.02) continue;
      if (kd > 3.5) {
        /* v14: пробоина в ткани плитоноски. Звездообразный разрыв нейлона
           (лучи по шуму), в центре — плита: светлая крошка керамики, вокруг —
           вытянутые волокна и тёмный ореол от удара; пробитый пакет (kd 5) —
           сквозная чёрная дыра с рваным краем. */
        float a = atan(dv.y, dv.x + dv.z * 0.7);
        float star = 0.55 + 0.45 * wndN(vec3(a * 3.0, W.x * 31.0, W.z * 17.0));
        float tear = 1.0 - smoothstep(r * 0.35 * star, r * 0.62 * star, h);
        float fray = (1.0 - smoothstep(r * 0.6, r * 1.15, h)) * (1.0 - tear) * (0.5 + 0.5 * wndN(vWndP * 900.0));
        float halo = (1.0 - smoothstep(r * 0.8, r * 2.6, h)) * (1.0 - tear);
        diffuseColor.rgb *= 1.0 - 0.35 * halo;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.55 + vec3(0.05), fray * 0.55);
        vec3 inside = kd > 4.5 ? vec3(0.012, 0.010, 0.009) : mix(vec3(0.42, 0.41, 0.39), vec3(0.62, 0.61, 0.58), wndN(vWndP * 1400.0));
        float core = kd > 4.5 ? 1.0 - smoothstep(0.0025, 0.0045, h) : 1.0 - smoothstep(r * 0.08, r * 0.2, h);
        if (kd < 4.5) inside = mix(inside, vec3(0.05, 0.05, 0.05), core);
        diffuseColor.rgb = mix(diffuseColor.rgb, inside, tear);
        continue;
      }
      if (kd > 1.5 && kd < 2.5) {
        /* копоть и грунт взрыва: тёмный налёт пятнами, без блеска */
        float n = wndN(vWndP * 60.0 + W.xyz * 13.0) * 0.6 + wndN(vWndP * 260.0) * 0.3;
        float m = (1.0 - smoothstep(r * (0.25 + 0.5 * n), r * (0.85 + 0.6 * n), h)) * (0.55 + 0.45 * n);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.20, 0.18, 0.16) + vec3(0.010, 0.008, 0.006), clamp(m, 0.0, 1.0) * 0.9);
        continue;
      }
      if (kd > 2.5) {
        /* рваная рана: сплошное тёмное мокрое пятно с потёками */
        float n = wndN(vWndP * 120.0 + W.xyz * 29.0) * 0.45 + wndN(vWndP * 420.0) * 0.2;
        vec3 ds = dv; ds.y = ds.y > 0.0 ? ds.y * 1.4 : ds.y * 0.55;
        float m = 1.0 - smoothstep(r * (0.45 + n), r * (0.80 + n), length(ds));
        float col = wndN(vec3(vWndP.x * 220.0, W.y * 40.0, vWndP.z * 220.0));
        float drip = smoothstep(0.55, 0.82, col) * (1.0 - smoothstep(0.0, r * 3.0, -dv.y)) * step(dv.y, 0.0)
                   * (1.0 - smoothstep(r * 0.3, r * 0.75, length(dv.xz)));
        m = max(m, drip * 0.9);
        vec3 bc = mix(vec3(0.24, 0.035, 0.028), vec3(0.16, 0.05, 0.04), uWndD[i]);
        float core = 1.0 - smoothstep(r * 0.15, r * 0.55, h);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * bc * (1.0 - 0.45 * core), m * 0.97);
        wndWet = max(wndWet, m * (0.7 + 0.3 * n) * (1.0 - 0.6 * uWndD[i]));
        continue;
      }
      if (W.w > 0.0) {
        vec3 ds = dv; ds.y = ds.y > 0.0 ? ds.y * 1.7 : ds.y * 0.6;
        /* v16: ткань впитывает кровь по нитям основы и утка — пятно не
           идеальный круг, а чуть «ромбом» по переплетению; вниз — сильнее */
        float wv = length(ds) * 0.78 + (abs(ds.x) + abs(ds.y) + abs(ds.z)) * 0.19;
        float n = wndN(vWndP * 170.0 + W.xyz * 37.0) * 0.5 + wndN(vWndP * 480.0) * 0.22;
        float m = 1.0 - smoothstep(r * (0.38 + n), r * (0.70 + n), wv);
        /* потёки: узкие полосы вниз от пятна */
        float col = wndN(vec3(vWndP.x * 260.0, W.y * 50.0, vWndP.z * 260.0));
        float drip = smoothstep(0.62, 0.86, col) * (1.0 - smoothstep(0.0, r * 2.6, -dv.y)) * step(dv.y, 0.0)
                   * (1.0 - smoothstep(r * 0.25, r * 0.6, length(dv.xz)));
        m = max(m, drip * 0.85);
        /* кайма подсыхания (кольцо «кофейной чашки») и мокрый тёмный центр */
        float rim = m * (1.0 - m) * 4.0;
        float wetC = 1.0 - smoothstep(r * 0.08, r * 0.5, h);
        vec3 fresh = vec3(0.34, 0.055, 0.04), dry = vec3(0.22, 0.075, 0.055);
        vec3 bc = mix(fresh, dry, uWndD[i]);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * bc * (1.0 - 0.25 * rim) * (1.0 - 0.3 * wetC), m * 0.94);
        wndWet = max(wndWet, m * (0.55 + 0.45 * n) * (1.0 - 0.7 * uWndD[i]));
        /* v16: пробоина в ткани (была тёмная точка 4 мм). Пуля рвёт
           переплетение: дефект звёздчатый, ~8–10 мм, концы нитей торчат
           лучами (светлые — сухие, тёмные — пропитанные), вокруг узкий
           серый «поясок обтирания» (смазка/копоть с оболочки пули —
           судебная баллистика), в глубине — тёмная мокрая рана. */
#ifdef WND_SKIN
        /* кожа: круглое входное отверстие ~5 мм с «пояском осаднения»
           (красно-бурое кольцо 1–2 мм), без нитей */
        float hrS = 0.0026 * (0.85 + 0.3 * wndN(vec3(atan(dv.y, dv.x + dv.z * 0.7) * 3.0, W.x * 19.0, 2.3)));
        float tearS = 1.0 - smoothstep(hrS * 0.75, hrS, h);
        float abr = (1.0 - smoothstep(hrS, hrS * 1.8, h)) * (1.0 - tearS);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.09, 0.07), abr * 0.75);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.008, 0.006), tearS);
        wndWet = max(wndWet, tearS);
#else
        float a = atan(dv.y, dv.x + dv.z * 0.7);
        float st = 0.62 + 0.38 * wndN(vec3(a * 2.6, W.x * 41.0, W.z * 23.0)) + 0.22 * wndN(vec3(a * 7.0, W.y * 53.0, 1.7));
        float hr = 0.0046 * st;
        float tear = 1.0 - smoothstep(hr * 0.78, hr, h);
        float ring = (1.0 - smoothstep(hr, hr * 2.1, h)) * (1.0 - tear);
        float thr = smoothstep(0.42, 0.78, wndN(vec3(a * 46.0, W.x * 13.0 + h * 260.0, W.z * 7.0)));
        float wipe = (1.0 - smoothstep(hr * 1.05, hr * 1.55, h)) * (1.0 - tear);
        diffuseColor.rgb *= 1.0 - 0.5 * wipe;
        diffuseColor.rgb *= mix(1.0, mix(1.55, 0.45, m), ring * thr * 0.8);
        vec3 holeC = mix(vec3(0.045, 0.007, 0.005), vec3(0.15, 0.02, 0.014), wndN(vWndP * 2400.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, holeC, tear);
        wndWet = max(wndWet, tear);
#endif
      } else {
        float n = wndN(vWndP * 300.0) * 0.5;
        float m = 1.0 - smoothstep(r * (0.3 + n), r * (0.75 + n), h);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.3 + vec3(0.035), m * 0.6);
      }
    }
`;
  const WND_CUT = `
    for (int i = 0; i < 4; i++) {
      vec4 C = uCut[i];
      if (C.x == 0.0) continue;
      float jag = (wndN(vWndP * 64.0) - 0.5) * 0.034 + (wndN(vWndP * 190.0) - 0.5) * 0.012;
      float d = -1.0;
      if (C.x < 1.5) d = vWndP.x * C.y - C.z;
      else if (C.x < 2.5) { if (vWndP.x * C.y > -0.012) d = C.z - vWndP.y; }
      else { if (abs(vWndP.x) < 0.24) d = vWndP.y - C.z; }
      d += jag;
      if (d > 0.0) discard;
      wndCut = max(wndCut, 1.0 - smoothstep(0.0, 0.03 + C.w, -d));
    }
`;
  /* край разреза: рваное мясо */
  const WND_CUTCOL = `
    if (wndCut > 0.0) {
      float n = wndN(vWndP * 150.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.20, 0.022, 0.018), vec3(0.42, 0.10, 0.08), n), clamp(wndCut * 1.15, 0.0, 1.0));
      wndWet = max(wndWet, wndCut);
    }
`;
  const WND_ROUGH = `
  roughnessFactor = mix(roughnessFactor, 0.32, clamp(wndWet, 0.0, 1.0) * 0.75);
`;
  function woundMaterials(THREE, mats, reuse) {
    /* v26: reuse — раны бойца при смене внешнего вида (character.restyle):
       новые материалы получают те же униформы, список ран сохраняется */
    const R = reuse && reuse.uni && reuse.uniD && reuse.cutU ? reuse : null;
    let arr, dryA;
    if (R) { arr = R.uni.value; dryA = R.uniD.value; }
    else {
      arr = [];
      for (let i = 0; i < NW; i++) arr.push(new THREE.Vector4(0, 0, 0, 0));
      dryA = new Array(NW).fill(0);
    }
    const uni = R ? R.uni : { value: arr }, uniD = R ? R.uniD : { value: dryA };
    const cutU = R ? R.cutU : { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) };
    for (const mat of mats) {
      if (!mat || !mat.isMeshStandardMaterial || mat.userData.wnd || mat.transparent) continue;
      mat.userData.wnd = true;
      const prev = mat.onBeforeCompile, key0 = mat.customProgramCacheKey();
      mat.onBeforeCompile = function (sh, r) {
        if (prev) prev.call(this, sh, r);
        sh.uniforms.uWnd = uni;
        sh.uniforms.uWndD = uniD;
        sh.uniforms.uCut = cutU;
        sh.vertexShader = 'varying vec3 vWndP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWndP = position;');
        /* цвет — после шероховатости (там же правят ткань и кожа), блеск
           мокрого — перед металличностью, т. е. после их зажимов */
        sh.fragmentShader = (this.userData.wndSkin ? '#define WND_SKIN\n' : '') + WND_PARS + sh.fragmentShader
          .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + WND_CUT)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + WND_FRAG + WND_CUTCOL)
          .replace('#include <metalnessmap_fragment>', WND_ROUGH + '#include <metalnessmap_fragment>');
      };
      mat.customProgramCacheKey = () => key0 + '|wnd' + (mat.userData.wndSkin ? 's' : '');
      mat.needsUpdate = true;
    }
    if (R) return R;
    return {
      uni, uniD, n: 0, list: [], cutU, cutGLSL: WND_CUT, noiseGLSL: WND_NOISE,
      add(p, r, kind) {
        const fixed = kind === 'scuff' || kind === 'soot' || kind === 'hole' || kind === 'holeP';
        const w = { p: p.slice(), r0: fixed ? r : kind === 'gore' ? r * 0.45 : 0.012, r1: r, kind, age: 0 };
        this.list.push(w);
        if (this.list.length > NW) this.list.shift();
      },
      update(dt) {
        for (let i = 0; i < NW; i++) {
          const w = this.list[i], v = arr[i];
          if (!w) { v.set(0, 0, 0, 0); dryA[i] = 0; continue; }
          w.age += dt;
          /* кровь расползается по ткани за ~25 с */
          /* v16: кровь пропитывает ткань сразу (за 2–3 с — пятно с ладонь
             на половину итогового размера), дальше растёт медленно */
          const g = w.kind === 'scuff' || w.kind === 'soot' || w.kind === 'hole' || w.kind === 'holeP' ? 1 : w.kind === 'gore' ? 1 - Math.exp(-w.age / 3.5) : 0.55 * (1 - Math.exp(-w.age / 2.5)) + 0.45 * (1 - Math.exp(-w.age / 22));
          const r = w.r0 + (w.r1 - w.r0) * g;
          v.set(w.p[0], w.p[1], w.p[2], w.kind === 'scuff' ? -r : w.kind === 'soot' ? 10 + r : w.kind === 'gore' ? 20 + r : w.kind === 'hole' ? 30 + r : w.kind === 'holeP' ? 40 + r : r);
          /* свежая алая кровь за пару минут темнеет до бурой и теряет блеск */
          dryA[i] = 1 - Math.exp(-w.age / 80);
        }
      },
      clear() { this.list.length = 0; for (const v of arr) v.set(0, 0, 0, 0); dryA.fill(0); }
    };
  }

  /* ------------------------------------------------------ рэгдолл ----- */
  /* Частицы: имя, кость, смещение в системе кости (м, база), радиус. */
  const PDEF = [
    ['pelvis', 'hips', [0, 0, 0], 0.11], ['spine', 'spine', [0, 0, 0], 0.1],
    ['chest', 'chest', [0, 0.08, 0], 0.12], ['chestR', 'chest', [0.14, 0.14, 0], 0.07], ['chestL', 'chest', [-0.14, 0.14, 0], 0.07],
    ['chestF', 'chest', [0, 0.09, -0.13], 0.06], ['neck', 'neck', [0, 0, 0], 0.05],
    ['head', 'head', [0, 0.05, -0.01], 0.1], ['headTop', 'head', [0, 0.13, 0.0], 0.06], ['nose', 'head', [0, 0.03, -0.12], 0.04]
  ];
  for (const S of ['R', 'L']) {
    const sg = S === 'R' ? 1 : -1;
    PDEF.push(['shoulder' + S, 'shoulder' + S, [0, 0, 0], 0.05], ['elbow' + S, 'elbow' + S, [0, 0, 0], 0.045],
      ['wrist' + S, 'wrist' + S, [0, 0, 0], 0.04], ['hand' + S, 'wrist' + S, [sg * 0.09, 0, 0], 0.035],
      ['hip' + S, 'hip' + S, [0, 0, 0], 0.08], ['knee' + S, 'knee' + S, [0, 0, 0], 0.06],
      ['ankle' + S, 'ankle' + S, [0, 0, 0], 0.05], ['toe' + S, 'toe' + S, [0, 0, 0], 0.04]);
  }
  const PI = {};
  const H0 = 1 / 180;          // шаг симуляции рэгдолла, с
  PDEF.forEach((p, i) => { PI[p[0]] = i; });
  const GROUPS = {
    low: ['pelvis', 'spine', 'hipR', 'hipL'],
    up: ['chest', 'chestR', 'chestL', 'chestF', 'neck', 'shoulderR', 'shoulderL'],
    head: ['neck', 'head', 'headTop', 'nose']
  };

  /* Предсмертное движение (pose-driven ragdoll). Рэгдолл сам по себе —
     «тряпка»: без мышц тело стекает и складывается в комок. Реальный
     человек при смертельном ранении теряет тонус не мгновенно и не
     весь сразу: подламываются колени, корпус сгибается, голова
     падает, тело оседает на колени и валится вперёд или вбок (с ЦНС —
     сразу «как марионетка с перерезанными нитями»), назад отлетают
     только в кино. Поэтому каждому падению задана короткая анимация
     суставов (сегменты ниже), а физика ведёт тело к этой форме через
     сопоставление форм (Müller et al. 2005, shape matching): поворот и
     положение тела не задаются — их решают гравитация, грунт и
     инерция, анимация задаёт только «что делают суставы». Руки не
     анимируются: они обмякли и падают сами. */
  const SEGS = [
    ['lumb', 'pelvis', ['spine'], null],
    ['thor', 'spine', ['chest', 'chestR', 'chestL', 'chestF', 'neck', 'shoulderR', 'shoulderL'], 'lumb'],
    ['head', 'neck', ['head', 'headTop', 'nose'], 'thor'],
    ['thighR', 'hipR', ['kneeR'], null], ['shinR', 'kneeR', ['ankleR'], 'thighR'], ['footR', 'ankleR', ['toeR'], 'shinR'],
    ['thighL', 'hipL', ['kneeL'], null], ['shinL', 'kneeL', ['ankleL'], 'thighL'], ['footL', 'ankleL', ['toeL'], 'shinL']
  ];
  /* знак сгибания вокруг поперечной оси тела: + сгибание = корпус и
     голова вперёд, бедро вперёд-вверх, голень назад, стопа носком вниз */
  const FLEX_SIGN = { lumb: -1, thor: -1, head: -1, thighR: 1, thighL: 1, shinR: -1, shinL: -1, footR: -1, footL: -1 };
  /* участие частицы в сопоставлении форм (руки — 0: висят свободно).
     Веса равные: в Верле и связях у всех частиц одна масса, и только
     так сопоставление не сдвигает общий центр масс (с «анатомическими»
     весами лёгкие стопы уходили вверх, и тело как будто держалось на
     невидимой опоре). */
  const SM_W = { pelvis: 1, spine: 1, chest: 1, chestR: 1, chestL: 1, chestF: 1, neck: 1, head: 1, headTop: 1, nose: 1,
    shoulderR: 1, shoulderL: 1, hipR: 1, hipL: 1, kneeR: 1, kneeL: 1, ankleR: 1, ankleL: 1 };
  /* Носки (стопа) тоже свободны: жёстко повёрнутая вместе с голенью
     стопа упиралась носком в грунт, и тело «стояло на цыпочках»
     вместо того, чтобы оседать. Стопу держат связи голеностоп–носок
     и колено–носок. */
  /* Ключи поз (градусы: [сгибание, наклон вбок (+ — верх вправо),
     поворот (+ — влево)]). W — нога, которая подламывается первой
     (сторона ранения / падения), O — другая. */
  function deathKeys(type, sd, j) {
    const L = (tW, sW, fW, tO, sO, fO) => ({ thighW: [tW], shinW: [sW], footW: [fW || 0], thighO: [tO], shinO: [sO], footO: [fO || 0] });
    const K = (t, trunk, legs) => Object.assign({ t }, trunk, legs);
    /* финальная поза лёжа: тело вытянуто, ноги слегка согнуты, одна
       чаще согнута сильнее; голова повёрнута набок */
    /* v13: обмякшее тело не лежит «доской»: тазобедренный и коленный
       суставы без тонуса остаются согнутыми (ноги складываются под
       весом при падении), одна нога согнута сильнее — так лежат
       упавшие без сознания (фото- и видеоматериалы, судмедэкспертиза:
       «поза эмбриона»/полубоком встречается чаще вытянутой) */
    const lie = (t, back) => K(t, { lumb: [back ? -2 : 8 * j()], thor: [back ? 2 : 6], head: [back ? 12 : 10, 18 * sd * j(), 25 * sd * j()] },
      back ? L(30 * j(), 48 * j(), 22, 14 * j(), 26 * j(), 18) : L(44 * j(), 72 * j(), 28, 16 * j(), 30 * j(), 22));
    switch (type) {
      /* ЦНС: тонус пропадает сразу — колени подламываются вперёд при
         стоящих стопах, тело оседает на колени (ключи заданы «быстрее
         физики»: до ключа 2 их сдерживает реальное оседание таза, т. е.
         почти свободное падение) и валится вперёд-вбок, голова падает
         на грудь */
      case 'drop': return [K(0, {}, L(0, 0, 0, 0, 0, 0)),
        K(0.05, { lumb: [4], thor: [5], head: [22] }, L(12, 26, 8, 12, 22, 8)),
        K(0.24, { lumb: [14, 4 * sd], thor: [16, 6 * sd], head: [40, 12 * sd] }, L(10, 100, 32, 14, 92, 28)),
        K(0.6, { lumb: [22, 8 * sd], thor: [26, 10 * sd], head: [30, 15 * sd] }, L(4, 90, 32, 8, 82, 28)),
        lie(1.1, false)];
      /* ранение корпуса: вздрагивание и сгиб в поясе, ноги подламываются,
         падает на колени и лицом вперёд */
      case 'buckle_fwd': return [K(0, {}, L(0, 0, 0, 0, 0, 0)),
        K(0.08, { lumb: [10], thor: [14], head: [14] }, L(8, 16, 4, 8, 14, 4)),
        K(0.3, { lumb: [20, 4 * sd], thor: [26, 6 * sd], head: [24, 6 * sd] }, L(16, 104, 32, 24, 94, 28)),
        K(0.68, { lumb: [24, 6 * sd], thor: [30, 8 * sd], head: [28, 10 * sd] }, L(4, 92, 32, 8, 82, 28)),
        lie(1.25, false)];
      /* ноги подламываются, таз уходит назад за стопы — садится и,
         не разгибая колен, заваливается на спину */
      case 'sit_back': return [K(0, {}, L(0, 0, 0, 0, 0, 0)),
        K(0.08, { lumb: [-4], thor: [-6], head: [-10] }, L(10, 16, 0, 10, 14, 0)),
        K(0.36, { lumb: [8], thor: [8], head: [12] }, L(64, 102, 10, 58, 96, 10)),
        K(0.78, { lumb: [-10], thor: [-14], head: [20, 8 * sd] }, L(70, 100, 12, 62, 94, 12)),
        K(1.18, { lumb: [-6], thor: [-8], head: [18, 10 * sd] }, L(45, 70, 15, 38, 58, 15)),
        lie(1.6, true)];
      /* v8: на бегу — инерция несёт тело вперёд, ноги «заплетаются»
         (одна ещё в шаге), падение плашмя лицом вниз с проездом по грунту;
         голова запрокинута (рефлекс уберечь лицо уже не работает, но
         шея разгибается от удара грудью) */
      case 'run_fall': return [K(0, {}, L(0, 0, 0, 0, 0, 0)),
        K(0.07, { lumb: [12], thor: [16], head: [8] }, L(-12, 34, 12, 28, 44, 10)),
        K(0.24, { lumb: [16, 4 * sd], thor: [20, 6 * sd], head: [-8, 8 * sd] }, L(22, 74, 25, 6, 34, 20)),
        K(0.52, { lumb: [6, 3 * sd], thor: [4, 4 * sd], head: [-14, 10 * sd, 25 * sd] }, L(12, 28, 25, 6, 16, 20)),
        lie(0.95, false)];
      /* v8: ранение корпуса без поражения ЦНС — человек ещё секунды в
         сознании: оседает на колени, садится на пятки, держится, клонится
         и только потом заваливается (давление падает, тонус уходит) */
      case 'knees_hold': {
        const hk = 0.8 + j() * 0.9;
        return [K(0, {}, L(0, 0, 0, 0, 0, 0)),
          K(0.1, { lumb: [12], thor: [16], head: [18] }, L(6, 14, 4, 6, 12, 4)),
          K(0.48, { lumb: [14, 3 * sd], thor: [18, 4 * sd], head: [26, 6 * sd] }, L(8, 100, 30, 12, 96, 30)),
          K(0.95, { lumb: [20, 4 * sd], thor: [24, 5 * sd], head: [36, 8 * sd] }, L(36, 122, 35, 40, 118, 35)),
          K(0.95 + 1.3 * hk, { lumb: [27, 6 * sd], thor: [31, 8 * sd], head: [48, 10 * sd] }, L(38, 122, 35, 42, 116, 35)),
          K(1.5 + 1.3 * hk, { lumb: [30, 10 * sd], thor: [34, 12 * sd], head: [30, 15 * sd] }, L(20, 96, 32, 30, 80, 28)),
          lie(2.15 + 1.3 * hk, false)];
      }
      /* v8: спиной к стволу — сползает по нему и остаётся сидеть,
         ноги вытянуты, голова падает на грудь */
      case 'slump_tree': return [K(0, {}, L(0, 0, 0, 0, 0, 0)),
        K(0.1, { lumb: [-6], thor: [-8], head: [-10] }, L(8, 14, 0, 8, 12, 0)),
        K(0.5, { lumb: [4], thor: [2], head: [16] }, L(42, 78, 10, 38, 70, 10)),
        K(1.05, { lumb: [4, 3 * sd], thor: [6, 4 * sd], head: [40, 12 * sd, 15 * sd] }, L(72, 26, 15, 66, 36, 15)),
        /* бедро–корпус ≈110°: ноги лежат на земле, спина откинута на
           ствол на ~20° — центр масс за тазом, ствол держит тело */
        K(1.9, { lumb: [4, 6 * sd], thor: [6, 8 * sd], head: [52, 16 * sd, 20 * sd] }, L(68, 14, 20, 62, 28, 20))];
      /* v11: смерть «с колена». Ключи — ОТНОСИТЕЛЬНО позы в момент гибели,
         а на колене ноги уже согнуты на 100–120°: прежние ключи стоя
         добавляли ещё +100° сгиба — тело складывалось «в комок». С колена
         человек обмякает: голова падает на грудь, корпус клонится вперёд-вбок
         через выставленное колено, тело валится набок, и только при ударе о
         грунт ноги РАЗГИБАЮТСЯ (отрицательный сгиб) под весом таза. */
      case 'kneel_slump': return [K(0, {}, L(0, 0, 0, 0, 0, 0)),
        K(0.1, { lumb: [6], thor: [8], head: [26, 4 * sd] }, L(0, 0, 0, 0, 0, 0)),
        K(0.42, { lumb: [16, 9 * sd, -6 * sd], thor: [20, 13 * sd, -8 * sd], head: [36, 14 * sd] }, L(-6, -10, 0, -4, -6, 0)),
        K(0.85, { lumb: [10, 12 * sd, -8 * sd], thor: [12, 15 * sd, -10 * sd], head: [22, 20 * sd, 18 * sd] }, L(-26, -38, 6, -18, -30, 6)),
        K(1.35, { lumb: [3, 6 * sd], thor: [4, 8 * sd], head: [12, 18 * sd, 26 * sd] }, L(-38 * j(), -62 * j(), 12, -26 * j(), -48 * j(), 12))];
      default: /* spin_side: разворот к раненому боку, нога этой стороны
         подламывается до колена, вторая — наполовину; падение вбок */
        return [K(0, {}, L(0, 0, 0, 0, 0, 0)),
          K(0.1, { lumb: [6, 0, -10 * sd], thor: [10, 6 * sd, -22 * sd], head: [10, 0, -15 * sd] }, L(12, 28, 8, 5, 8, 0)),
          K(0.3, { lumb: [14, 10 * sd, -14 * sd], thor: [18, 16 * sd, -28 * sd], head: [20, 14 * sd, -10 * sd] }, L(10, 100, 32, 28, 58, 15)),
          K(0.7, { lumb: [12, 10 * sd, -10 * sd], thor: [14, 14 * sd, -18 * sd], head: [18, 18 * sd, 0] }, L(6, 86, 30, 24, 45, 15)),
          Object.assign(lie(1.3, false), { thor: [4, 0, -10 * sd] }, L(36, 58, 25, 8, 10, 15))];
    }
  }
  function create(THREE, opt) {
    const o = opt || {};
    const PH = (typeof self !== 'undefined' ? self : globalThis).GPhys || null;
    const DM = { list: [], handSpec: null };
    const V = () => new THREE.Vector3();
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
    const _a = V(), _b = V(), _c = V(), _d = V();

    /* ------------------------------------------------ подготовка */
    /* запас здоровья с учётом особенности генерала (ветеран: +20%) */
    const hpMax = (s) => Math.round(100 * ((s.ctrl && s.ctrl.trait && s.ctrl.trait.hp) || 1));
    DM.hpMax = hpMax;
    DM.attach = function (s) {
      if (s.ctrl) s.ctrl._soldier = s;
      const ch = s.char, k = ch.scale || 1;
      const base = (n) => ch.rest[n] ? [ch.rest[n][0] / k, ch.rest[n][1] / k, ch.rest[n][2] / k] : null;
      const pt = (x) => {
        if (typeof x === 'string') return base(x);
        if (typeof x[0] === 'string') { const b = base(x[0]); return b ? [b[0] + x[1][0], b[1] + x[1][1], b[2] + x[1][2]] : null; }
        return x;
      };
      const shapes = [];
      for (const d of shapeDefs()) {
        if (!ch.bone(d.bone)) continue;
        const sh = { bone: ch.bone(d.bone), boneName: d.bone, zone: d.zone, r: d.r, set: new Set(d.set.map((n) => ch.boneIndex[n]).filter((x) => x !== undefined)) };
        if (d.cap) { sh.a = pt(d.cap[0]); sh.b = pt(d.cap[1]); if (!sh.a || !sh.b) continue; }
        else { sh.lo = d.box[0]; sh.hi = d.box[1]; }
        sh.rest = ch.rest[d.bone];
        shapes.push(sh);
      }
      s.dmg = { shapes, wounds: ch.wounds || null, hits: 0 };
      /* v13: физиология вместо «здоровья» (game/physiology.js) */
      if (PH) {
        s.dmg.organs = PH.buildOrgans((n) => base(n));
        s.dmg.ph = PH.initState(s.ctrl && s.ctrl.trait);
      }
      DM.list.push(s);
    };

    /* доминирующая кость вершины — кэш на геометрии */
    function domBone(geo) {
      if (geo.userData.domBone) return geo.userData.domBone;
      const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
      const n = geo.attributes.position.count, out = new Int16Array(n).fill(-1);
      if (si && sw) for (let v = 0; v < n; v++) {
        let best = 0, bi = -1;
        for (let j = 0; j < 4; j++) { const w = sw.array[v * 4 + j]; if (w > best) { best = w; bi = si.array[v * 4 + j]; } }
        out[v] = bi;
      }
      geo.userData.domBone = out;
      return out;
    }
    const SKIPL = { eye: 1, cornea: 1, brow: 1, lash: 1 };

    /* Пересечение отрезка пули с бойцом: ближайшая зона. o, d — мир
       (d — единичный), len — длина отрезка. */
    DM.raySoldier = function (s, o, d, len) {
      const D = s.dmg;
      if (!D) return null;
      const ch = s.char, k = ch.scale || 1;
      /* грубая сфера вокруг таза */
      const hips = ch.bone('hips');
      hips.getWorldPosition(_a);
      _b.subVectors(_a, o);
      const tc = clamp(_b.dot(d), 0, len);
      if (_c.copy(o).addScaledVector(d, tc).distanceToSquared(_a) > 1.35 * 1.35) return null;
      let best = null;
      const ob = [0, 0, 0], db = [0, 0, 0];
      for (const sh of D.shapes) {
        _m.copy(sh.bone.matrixWorld).invert();
        _c.copy(o).applyMatrix4(_m);
        _d.copy(d).transformDirection(_m);
        ob[0] = (_c.x + sh.rest[0]) / k; ob[1] = (_c.y + sh.rest[1]) / k; ob[2] = (_c.z + sh.rest[2]) / k;
        db[0] = _d.x; db[1] = _d.y; db[2] = _d.z;
        let t = -1, ax = -1, sg = 0;
        if (sh.a) t = rayCapsule(ob, db, sh.a, sh.b, sh.r);
        else { const bx = rayBox(ob, db, sh.lo, sh.hi); if (bx) { t = bx.t; ax = bx.ax; sg = bx.sg; } }
        if (t < 0) continue;
        const tw = t * k;
        if (tw > len) continue;
        if (!best || tw < best.t) best = { s, sh, t: tw, tb: t, ob: ob.slice(), db: db.slice(), ax, sg };
      }
      return best;
    };

    /* Уточнение по сетке: первая вершина одежды/кожи вдоль луча в системе
       покоя кости зоны. */
    function refine(h) {
      const ch = h.s.char, ob = h.ob, db = h.db;
      let bestT = Infinity, bp = null, layer = null;
      for (const g in ch.meshes) {
        if (SKIPL[g]) continue;
        const geo = ch.meshes[g].geometry, P = geo.attributes.position.array, dom = domBone(geo);
        for (let v = 0, n = P.length / 3; v < n; v++) {
          if (!h.sh.set.has(dom[v])) continue;
          const px = P[v * 3] - ob[0], py = P[v * 3 + 1] - ob[1], pz = P[v * 3 + 2] - ob[2];
          const t = px * db[0] + py * db[1] + pz * db[2];
          if (t < h.tb - 0.08 || t > h.tb + 0.12 || t >= bestT) continue;
          const qx = px - db[0] * t, qy = py - db[1] * t, qz = pz - db[2] * t;
          if (qx * qx + qy * qy + qz * qz > 0.016 * 0.016) continue;
          bestT = t; bp = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]; layer = g;
        }
      }
      if (!bp) { bp = [ob[0] + db[0] * h.tb, ob[1] + db[1] * h.tb, ob[2] + db[2] * h.tb]; bestT = h.tb; }
      return { p: bp, t: bestT, layer };
    }
    /* точка покоя (база) -> мир через кость зоны */
    function restToWorld(s, sh, p, out) {
      const k = s.char.scale || 1;
      return out.set(p[0] * k - sh.rest[0], p[1] * k - sh.rest[1], p[2] * k - sh.rest[2]).applyMatrix4(sh.bone.matrixWorld);
    }

    /* ------------------------------------------------ попадание */
    /* Баллистика попадания (game/damage.js → BALLISTICS выше):
       1) зона по анатомии, слой брони по месту входа (плита, мягкий пакет
          плитоноски, шлем);
       2) пробитие брони — вероятностное: пробивная способность патрона
          падает со скоростью пули на дистанции, стойкость слоя растёт с
          углом встречи (путь в материале ~ 1/cos) и падает от прежних
          попаданий (трещины керамики, вмятины стали);
       3) урон по зоне масштабируется энергией пули; при попадании в
          крупный сосуд или сердце — сильное кровотечение, которое убивает
          за секунды; ЦНС (мозг, шейный отдел) — сразу. */
    DM.hit = function (h, dirW, shooter, t, ho) {
      ho = ho || {};
      const s = h.s, ch = s.char, P = ch.preset || {};
      const R = refine(h);
      let zone = h.sh.zone;
      const q = R.p;
      const D = s.dmg;
      const AR = D.armor || (D.armor = armorFor(P));
      const ammo = AMMO[ho.ammo] || AMMO[DEFAULT_AMMO];
      const v = ho.v || ammo.v0;
      /* энергия пули относительно дульной: 0,5·m·v² */
      const eK = clamp((v * v) / (ammo.v0 * ammo.v0), 0.15, 1.1);
      /* --- слой брони --- */
      let layer = null, armorRes = null, angCos = 1;
      if (zone === 'head') {
        const helm = P.head === 'helmet' && (/^(helmet|headHard|headGear)/.test(R.layer || '') || q[1] > 1.765 || (q[1] > 1.70 && q[2] > 0.0));
        if (helm && !(q[2] < -0.09 && q[1] < 1.762)) { zone = 'helmet'; layer = AR.helmet; }
        if (layer) {
          const c = [0, 1.745, -0.03], nx = q[0] - c[0], ny = q[1] - c[1], nz = q[2] - c[2], nl = Math.hypot(nx, ny, nz) || 1;
          angCos = Math.abs((nx * h.db[0] + ny * h.db[1] + nz * h.db[2]) / nl);
        }
      }
      if (zone === 'thorax' || zone === 'abdomen') {
        const inPlate = Math.abs(q[0]) < 0.128 && q[1] > 1.135 && q[1] < 1.462 && Math.abs(h.db[2]) > 0.45;
        if (inPlate && AR.plates) { layer = h.db[2] > 0 ? AR.front : AR.back; angCos = Math.abs(h.db[2]); }
        else if (AR.soft && q[1] > 1.02 && q[1] < 1.50) { layer = AR.soft; angCos = Math.max(0.3, Math.hypot(h.db[0], h.db[2])); }
      }
      if (ho.frag) {
        /* осколок: ГПЭ ОЗМ (~1 г, 400–700 м/с) — броню любого класса не берёт */
        if (layer) armorRes = { pen: false, p: 0, layer };
      } else if (layer) armorRes = penetrate(layer, ammo, v, angCos, q);
      const penetrated = !armorRes || armorRes.pen;
      const ricochet = !!(armorRes && !armorRes.pen && armorRes.ric);
      /* --- ранение (v13): раневой канал по органам, без «очков здоровья» --- */
      const Z = ZONES[zone === 'helmet' ? 'head' : zone];
      let dmg = 0, bleed = 0, vessel = null, fatal = false, fracture = false, WR = null;
      const rnd = Math.random;
      const side = h.sh.boneName ? h.sh.boneName.slice(-1) : '';
      const sideLR = side === 'L' || side === 'R' ? side : '';
      const res0 = !penetrated ? 0 : armorRes ? (layer.kind === 'soft' ? 0.85 : layer.kind === 'helmet' ? 0.7 : 0.55) : 1;
      const kE = (0.55 + 0.45 * eK) * (penetrated ? res0 : 1) * (ho.dmgScale !== undefined ? Math.min(1.4, 0.6 + 0.4 * ho.dmgScale) : 1);
      const agoLive = !!(s.dead && s.rd && s.rd.ag && !s.finished && D.ph && !D.ph.dead);
      if (D.ph && (!s.dead || agoLive)) {
        const bl0 = D.ph.lost;
        WR = PH.wound(D.ph, { q, db: h.db, zone: zone === 'helmet' ? 'head' : zone, side: sideLR, ammo: ho.frag ? 'frag' : (ho.ammo || DEFAULT_AMMO), v, eK: kE, pen: penetrated, layerKind: layer ? layer.kind : null, frag: !!ho.frag, organs: D.organs });
        fatal = WR.cns;
        vessel = WR.vessel;
        fracture = WR.fracture;
        /* сила реакции на попадание (рефлекс), не урон */
        dmg = Math.round(12 + 22 * WR.sev + (penetrated ? 14 * kE : 6));
        bleed = D.ph.src.reduce((a2, e) => a2 + e.rate, 0);
        void bl0;
      } else if (penetrated) dmg = 40;
      ho.exit = ho.exit !== false && penetrated && (!armorRes || layer.kind === 'soft') && rnd() < 0.9;
      D.hits++;
      const wasDead = !!s.dead;
      const collapse = !!(WR && WR.collapse);
      const died = !wasDead && (fatal || collapse);
      if (died) {
        const CC = { tetra: 'Ранение позвоночника · паралич', ko: 'Потеря сознания · удар в голову', neck: 'Ранение шеи · кровотечение, удушье', down: 'Тяжёлое ранение · ' + ((Z && Z.name) || '').toLowerCase() };
        s.deathCause = WR.cns ? 'Поражение ЦНС · ' + WR.name : CC[WR.collapse] || 'Тяжёлое ранение';
        /* в сознании ли падает (голос, руки к ране, агония) */
        s._dieCns = !!(WR.cns || WR.collapse === 'ko');
        s._diePara = WR.collapse === 'tetra';
      }
      const world = restToWorld(s, h.sh, q, V());
      const nrm = dirW.clone().negate();
      /* след на ткани/коже */
      if (D.wounds) {
        /* v14: пробоина в ткани плитоноски/шлеме: рваная дыра, вокруг —
           светлая пыль керамики (плиту видно через дыру) или пробитый пакет */
        if (armorRes) D.wounds.add(q, armorRes.pen ? 0.011 : layer.kind === 'helmet' ? 0.012 : 0.014, layer.kind === 'helmet' ? 'scuff' : armorRes.pen ? 'holeP' : 'hole');
        if (penetrated) D.wounds.add(armorRes ? [q[0], q[1] - 0.02, q[2]] : q, (Z.blood || 0.04) * (0.85 + rnd() * 0.4) * (ho.woundScale || 1) * (armorRes ? 0.8 : 1.25), ho.frag ? 'gore' : 'blood');
      }
      /* эффекты и звук */
      if (!penetrated || armorRes) {
        if (o.fx) {
          o.fx.sparks(world, ricochet ? 16 : penetrated ? 6 : 10, nrm, 1.6, 1.1);
          o.fx.smoke(world, 2, nrm.clone().multiplyScalar(0.7), 0.06, 0x9d9585);
        }
      }
      if (penetrated && o.blood) {
        /* кровь: обратный выброс у входа, конус капель и взвесь у выхода
           (game/blood.js); клочок ткани — серым облачком */
        const big = zone === 'head' || zone === 'helmet' || vessel ? 1.6 : 1;
        /* тело: сердце не качает, но рана в свежем теле всё равно даёт выброс и подтёк */
        o.blood.hit(world, dirW, { zone: zone === 'helmet' ? 'head' : zone, fatal: died, corpse: wasDead, scale: (wasDead ? 0.95 : 1.25) * big * (ho.bloodScale || 1), exit: ho.exit });
        if (wasDead && o.blood.dripAt) for (let i = 0; i < 5; i++) o.blood.dripAt(world, _d.set(0, -0.2, 0));
        if (o.fx) o.fx.smoke(world, 1, nrm.clone().multiplyScalar(0.8), 0.03, 0x7d7466);
        if (vessel && !wasDead && o.blood.spurt) o.blood.spurt(() => restToWorld(s, h.sh, q, _d), () => _c.copy(nrm), { dur: died ? 7 : 12, k: /сердц/i.test(vessel) ? 1.4 : 1, s });
        /* голова без шлема в упор: мозговое вещество и осколки кости */
        if (o.gore && zone === 'head' && ho.dist !== undefined && ho.dist < 8 && rnd() < 0.6) o.gore.headGore(s, world, dirW, eK);
      }
      if (o.sound && !ho.silent) o.sound(!penetrated && layer && layer.kind !== 'soft' ? (layer.kind === 'helmet' ? 'helmet' : 'plate') : 'flesh', world);
      /* капли из раны живого (визуально); счёт крови — в D.ph */
      if (penetrated && !wasDead && !died && D.ph) {
        D.bleed = D.ph.bleed || bleed; D.bleedArt = D.ph.bleedArt || 0;
        const rate = 0.6 + (Z && Z.blood || 0.04) * 26 + (vessel ? 4 : 0);
        const B = s.bleedW;
        if (B && B.t < 8) B.rate = Math.min(9, B.rate + rate * 0.6);
        else s.bleedW = { sh: h.sh, q: q.slice(), t: 0, acc: 0, rate };
      }
      if (fracture && !wasDead) { D.fract = D.fract || {}; D.fract[zone] = true; }
      if (D.ph && !wasDead && s.ctrl) PH.apply(D.ph, s.ctrl);
      /* отрыв конечности: несколько попаданий в одну конечность или
         выстрел в упор (game/gore.js) */
      let severed = null;
      /* Реализм: пуля 5,45×39 (3,4 г) конечность не отрывает — она даёт
         сквозной канал, временную полость и перелом. Травматическая
         ампутация — следствие взрыва (мины, снаряды) или крупного калибра;
         отрыв остаётся только в подрыве (blast.js). */
      const BULLET_AMPUTATION = false;
      if (BULLET_AMPUTATION && penetrated && o.gore && LIMB_CUT[zone]) {
        const side = h.sh.boneName.slice(-1);
        const key = zone + side;
        const L = D.limb || (D.limb = {});
        L[key] = (L[key] || 0) + 1 + (ho.dist !== undefined && ho.dist < 5 ? 1 : 0) + (ho.frag ? 0.5 : 0);
        /* смертельное попадание в конечность вблизи — отрыв с шансом */
        const kill = died && (ho.dist === undefined || ho.dist < 30) && rnd() < 0.5;
        if ((L[key] >= LIMB_CUT[zone] || kill) && !(D.cut && D.cut[LIMB_JOINT[zone] + side])) severed = LIMB_JOINT[zone] + side;
      }
      /* добивание: «убитый» не мгновенно (ранение, подрыв) лежит в агонии — кричит, стонет.
         Ещё одно пробивающее попадание: в голову/шею или крупный сосуд — сразу, иначе
         по накопленному урону (≈60) — агония обрывается. */
      let finished = false;
      /* v16: непробившее (плита, каска) по лежащему в агонии — тупая
         травма: сознание падает, но не добивает */
      if (wasDead && !penetrated && !s.finished && s.rd && s.rd.ag) { s.rd.ag.k *= 0.8; s.agony = (s.agony === undefined ? 90 : s.agony) - 15; }
      if (wasDead && penetrated && !s.finished && /^(wound|blast|neck|para)$/.test(s.deathKind || '')) {
        /* v16: каждое пробивающее попадание — шок и падение давления:
           сознание (и с ним сила движений) резко падает; два-три попадания
           в корпус добивают, голова/шея/крупный сосуд — сразу */
        s.agony = (s.agony === undefined ? 90 : s.agony) - dmg * 1.6;
        if (s.rd && s.rd.ag) s.rd.ag.k *= 0.5;
        if (fatal || (WR && WR.collapse === 'tetra') || (Z && Z.cns) || s.agony <= 0 || (D.ph && D.ph.koT <= 0)) {
          s.finished = true; finished = true; s.finT = s.deadT || 0;
          s.deathKind = 'finished';
          s.deathCause = (Z && Z.cns ? 'Добит · ' + (Z.name || 'Голова') : 'Добит');
          if (s.rd && s.rd.ag) s.rd.ag.k = 0, s.rd.ag.off = true;
          if (D.ph) D.ph.dead = true;
          if (o.onFinish) o.onFinish(s, zone);
        }
      }
      /* реакция */
      /* v16: попадание по лежащему — лишь вздрагивание тела (импульс пули
         ничтожен, см. die()); прежде добивание толкало тело ×2,2 */
      if (wasDead) pushRagdoll(s, world, dirW, (ho.push === undefined ? 0.12 : ho.push) * (finished ? 0.8 : 1));
      else if (died || severed) {
        if (!died) s.deathCause = 'Травматическая ампутация · шок';
        s.deathFatal = fatal;
        die(s, world, dirW, zone === 'helmet' ? 'head' : zone);
      } else react(s, world, dirW, armorRes && !penetrated ? 'plate' : zone, dmg);
      if (severed) o.gore.sever(s, severed, { dir: dirW, at: world, force: 1 });
      const ret = { s, zone: !penetrated && layer && layer.kind !== 'soft' ? (layer.kind === 'helmet' ? 'helmet' : 'plate') : zone, died: died || !!severed, world, dmg, ricochet, name: (Z || {}).name };
      ret.armor = armorRes ? { name: layer.name, pen: armorRes.pen, p: armorRes.p, ric: !!armorRes.ric, integ: layer.integ, kind: layer.kind } : null;
      ret.vessel = vessel; ret.fracture = fracture; ret.severed = severed; ret.organs = WR ? WR.organs : []; ret.lossF = D.ph ? D.ph.lossF || 0 : 0;
      ret.bleed = D.bleed || 0; ret.ammo = ammo.name; ret.fatal = fatal; ret.penetrated = penetrated; ret.finished = finished;
      if (zone === 'helmet' && penetrated) ret.name = 'шлем пробит · голова';
      if (WR && WR.name) ret.name = WR.name;
      return ret;
    };
    DM.armorFor = (s) => s.dmg && (s.dmg.armor || (s.dmg.armor = armorFor(s.char.preset || {})));

    /* ----------------------------------------- реакция живого бойца */
    const S0 = () => ({ x: 0, v: 0 });
    function jolt(o2, w, z, dt) {
      const n = Math.max(1, Math.ceil(dt / 0.008)), hh = dt / n;
      for (let i = 0; i < n; i++) { o2.v += (-w * w * o2.x - 2 * z * w * o2.v) * hh; o2.x += o2.v * hh; }
      return o2.x;
    }
    function react(s, world, dirW, zone, dmg) {
      if (!s.dead) globalThis.GStumble?.hit(s, dirW, zone, dmg);
      if (s.rd?.temporary) pushRagdoll(s, world, dirW, 0.12);
      const hr = s.hr || (s.hr = { bx: S0(), tw: S0(), rl: S0(), hx: S0(), hy: S0(), dip: S0(), gun: S0(), curl: 0, cs: 0 });
      const root = s.char.root;
      root.updateMatrixWorld(true);
      const inv = _q.copy(root.quaternion).invert();
      const dl = dirW.clone().applyQuaternion(inv);
      const rp = root.worldToLocal(world.clone());
      const cy = 1.25 * (s.char.scale || 1);
      const rx = rp.x, ry = rp.y - cy, rz = rp.z;
      const hard = zone === 'plate';
      const kk = hard ? 1.25 : zone === 'helmet' ? 1.1 : 0.8 + dmg / 90;
      /* Знаки: rotation.x > 0 — корпус и голова уходят назад (верх в +z,
         лицо вверх); пуля спереди летит в +z и толкает назад. Импульс пули
         мал (3,4 г × 880 м/с на 80 кг — сантиметры в секунду), поэтому
         видимая реакция — рефлекс: короткий толчок по пуле, затем сгиб к
         ране с поджатыми плечами (держится секунду-две). */
      if (zone === 'head' || zone === 'helmet' || zone === 'neck') {
        hr.hx.v += dl.z * 6 * kk + dl.y * 3;
        hr.hy.v += (rz * dl.x - rx * dl.z) * 40 * kk;
        hr.bx.v += dl.z * 0.8 * kk;
        hr.curl = Math.min(1.2, hr.curl + 0.4);
      } else if (zone === 'thigh' || zone === 'shin' || zone === 'foot') {
        hr.dip.v += 0.75 * kk;
        hr.bx.v -= 0.9 * kk;
        hr.rl.v += (rx > 0 ? -1 : 1) * 1.4 * kk;
        hr.curl = Math.min(1.2, hr.curl + 0.5);
      } else if (zone === 'uarm' || zone === 'farm' || zone === 'hand') {
        hr.gun.v += 2.8 * kk;
        hr.tw.v += (rz * dl.x - rx * dl.z) * 16 * kk;
        hr.curl = Math.min(1.2, hr.curl + 0.35);
      } else {
        hr.bx.v += dl.z * 1.6 * kk;
        hr.tw.v += (rz * dl.x - rx * dl.z) * 14 * kk;
        hr.rl.v += (rx * dl.y - ry * dl.x) * 8 * kk;
        hr.dip.v += 0.3 * kk;
        hr.curl = Math.min(1.2, hr.curl + (hard ? 0.55 : 0.8));
      }
    }
    /* добавки к позе (poseSoldier): после базовой стойки, до стоп */
    DM.poseAdd = function (s, b, dt) {
      const hr = s.hr;
      if (!hr) return 0;
      const bx = jolt(hr.bx, 10, 0.42, dt), tw = jolt(hr.tw, 9, 0.45, dt), rl = jolt(hr.rl, 9, 0.5, dt);
      const hx = jolt(hr.hx, 13, 0.4, dt), hy = jolt(hr.hy, 12, 0.45, dt), dp = jolt(hr.dip, 11, 0.55, dt);
      const gj = jolt(hr.gun, 12, 0.4, dt);
      /* сгиб к ране: быстрый (≈60 мс), отпускает за 1–2 с; тяжело раненый
         так и стоит, ссутулившись */
      const ph = s.dmg && s.dmg.ph;
      const hurt = ph && ((ph.shock || 0) > 0.3 || ph.pain > 0.8) ? 0.35 : 0;
      hr.curl = Math.max(hurt, hr.curl - dt * 0.5);
      const tgt = Math.min(1, hr.curl);
      hr.cs += (tgt - hr.cs) * (1 - Math.exp(-(tgt > hr.cs ? 16 : 3) * dt));
      const cu = hr.cs * 0.17;
      b('spine').rotation.x += bx * 0.45 - cu * 0.45;
      b('spine').rotation.y += tw * 0.4;
      b('chest').rotation.x += bx * 0.55 - cu * 0.55;
      b('chest').rotation.y += tw * 0.6;
      b('chest').rotation.z += rl * 0.6;
      b('hips').rotation.z += rl * 0.3;
      b('neck').rotation.x += hx * 0.4 - bx * 0.3 - cu * 0.45;
      b('head').rotation.x += hx * 0.6 - bx * 0.2 - cu * 0.25;
      b('head').rotation.y += hy;
      /* плечи поджимаются */
      const cR = b('clavR'), cL = b('clavL');
      if (cR) cR.rotation.z += cu * 0.55;
      if (cL) cL.rotation.z -= cu * 0.55;
      const dip = Math.max(0, dp) * 1.5 + (hurt ? 0.03 : 0) + cu * 0.05;
      /* углы удара — для оружия (placeWeapon): оно уходит вместе с корпусом */
      const O = hr.o || (hr.o = {});
      O.bx = bx - cu; O.tw = tw; O.rl = rl; O.dip = dip; O.gun = gj;
      return dip;
    };
    DM.gunJolt = (s) => (s.hr ? s.hr.gun.x : 0);

    /* ------------------------------------------------ смерть */
    /* v8: слетевшая каска — отдельное тело: подлёт, кувырок, перекат,
       звон о землю; по ней можно попасть (world.v8props, metal) */
    const HELMS = [];
    let helmGeo = null;
    function popHelmet(s, dirW, k, cv) {
      const hm = s.char.meshes && s.char.meshes.helmet;
      if (!hm || !o.scene || s.helmetOff) return;
      const hb = s.char.bone('head');
      if (!hb) return;
      if (!helmGeo) {
        const prof = [];
        for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 0.5; prof.push(new THREE.Vector2(Math.sin(a) * 0.132, Math.cos(a) * 0.125 + 0.02)); }
        prof.push(new THREE.Vector2(0.14, 0.012), new THREE.Vector2(0.142, -0.005), new THREE.Vector2(0.125, -0.005));
        helmGeo = new THREE.LatheGeometry(prof, 18);
        helmGeo.scale(1, 1, 1.12);
      }
      const sc = s.char.scale || 1;
      hb.updateMatrixWorld(true);
      const pos = hb.localToWorld(V().set(0, 0.1 * sc, 0.01 * sc));
      const mat = Array.isArray(hm.material) ? hm.material[0] : hm.material;
      const m = new THREE.Mesh(helmGeo, mat);
      m.position.copy(pos); m.quaternion.copy(hb.getWorldQuaternion(new THREE.Quaternion())); m.scale.setScalar(sc);
      m.castShadow = true; m.receiveShadow = true; m.name = 'helmet_drop';
      o.scene.add(m);
      hm.visible = false; s.helmetOff = true;
      const v = V().set(dirW.x, 0, dirW.z).normalize().multiplyScalar(1.2 + 1.8 * k);
      v.y = 1.0 + 1.6 * k;
      if (cv) { v.x += cv.x * 0.8; v.z += cv.z * 0.8; }
      const H = { s, m, v, av: V().set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 18), rest: false, t: 0, px: null, hm };
      if (o.v8props) H.px = o.v8props.sph(pos.x, pos.y, pos.z, 0.14, { mat: 'metal', name: 'helmet',
        onHit: (hit, dir) => { H.v.addScaledVector(dir, 3); H.v.y += 2.2; H.av.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 20); H.rest = false; } });
      HELMS.push(H);
      DM.helmetsDropped = (DM.helmetsDropped || 0) + 1;
    }
    const _he = new THREE.Euler(), _hq = new THREE.Quaternion();
    function helmStep(dt) {
      for (const H of HELMS) {
        if (H.rest) continue;
        H.t += dt;
        const m = H.m, p = m.position;
        H.v.y -= 9.81 * dt;
        p.addScaledVector(H.v, dt);
        _he.set(H.av.x * dt, H.av.y * dt, H.av.z * dt); _hq.setFromEuler(_he); m.quaternion.premultiply(_hq);
        const gy = (H.s.ctrl && H.s.ctrl.groundAt ? H.s.ctrl.groundAt(p.x, p.z) : 0) + 0.02;
        if (p.y < gy) {
          p.y = gy;
          if (H.v.y < -1.4 && o.sound) o.sound('helmet', p.clone(), Math.min(1, -H.v.y / 5));
          H.v.y = -H.v.y * 0.3; H.v.x *= 0.6; H.v.z *= 0.6; H.av.multiplyScalar(0.5);
          if (H.v.lengthSq() < 0.04 && H.av.lengthSq() < 0.4) { H.rest = true; H.v.set(0, 0, 0); }
        }
        if (H.t > 12) H.rest = true;
        if (H.px && o.v8props) o.v8props.move(H.px, p.x, p.y + 0.06, p.z);
      }
    }
    function clearHelmet(s) {
      for (let i = HELMS.length - 1; i >= 0; i--) {
        const H = HELMS[i];
        if (H.s !== s) continue;
        if (H.m.parent) H.m.parent.remove(H.m);
        if (H.px && o.v8props) { if (o.v8props.remove) o.v8props.remove(H.px); else o.v8props.move(H.px, 0, -999, 0); }
        HELMS.splice(i, 1);
      }
      if (s.helmetOff && s.char.meshes && s.char.meshes.helmet) s.char.meshes.helmet.visible = true;
      s.helmetOff = false;
    }
    DM.helmets = HELMS;
    function die(s, world, dirW, zone, dopt) {
      dopt = dopt || {};
      s.dead = true;
      s.deadT = 0;
      s.bleedW = null;
      const ch = s.char, k = ch.scale || 1;
      ch.root.updateMatrixWorld(true);
      const N = PDEF.length;
      const p = new Float32Array(N * 3), pp = new Float32Array(N * 3), r = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const [, bn, off, rad] = PDEF[i];
        const w = ch.bone(bn).localToWorld(_a.set(off[0] * k, off[1] * k, off[2] * k));
        p[i * 3] = w.x; p[i * 3 + 1] = w.y; p[i * 3 + 2] = w.z;
        r[i] = rad * k;
      }
      /* ничего не начинает под грунтом: иначе первый же шаг выстреливает частицу */
      const gnd = (x, z) => (s.ctrl && s.ctrl.groundAt ? s.ctrl.groundAt(x, z) : 0);
      for (let i = 0; i < N; i++) { const gy = gnd(p[i * 3], p[i * 3 + 2]) + r[i] * 0.8; if (p[i * 3 + 1] < gy) p[i * 3 + 1] = gy; }
      pp.set(p);
      const fwd = V().set(0, 0, -1).applyQuaternion(ch.root.quaternion);
      /* начальные скорости: удар пули по ближней частице, колени
         подламываются вперёд, таз оседает */
      const vel = (i, x, y, z) => { pp[i * 3] -= x * H0; pp[i * 3 + 1] -= y * H0; pp[i * 3 + 2] -= z * H0; };
      let near = 0, nd = 1e9;
      for (let i = 0; i < N; i++) {
        const d = Math.hypot(p[i * 3] - world.x, p[i * 3 + 1] - world.y, p[i * 3 + 2] - world.z);
        if (d < nd) { nd = d; near = i; }
      }
      /* Импульс пули ничтожен: 3,4 г × ~850 м/с ≈ 2,9 Н·с на 100 кг
         (боец с бронёй) — 3 см/с. Тело не отбрасывает: оно оседает,
         потому что пропал тонус. Рывок от пули — лишь локальная дрожь
         задетого сегмента. */
      const cns = s._dieCns !== undefined ? !!s._dieCns : (zone === 'head' || zone === 'helmet');
      const para = !!s._diePara;
      s._dieCns = undefined; s._diePara = undefined;
      const imp = cns ? 0.22 : 0.12;
      /* голос (audio/soldier_sfx.js): мозг/ствол, сердце, обморок от
         кровопотери — без крика; иначе — крик и стоны раненого */
      s.deathKind = cns ? 'cns' : s.deathFatal ? 'fatal' : zone === 'blast' ? 'blast' : dopt.noImpulse ? 'bleed' : para ? 'para' : zone === 'neck' ? 'neck' : 'wound';
      s.deathFatal = false;
      /* сторона, куда завалится: вперёд — чаще (центр масс с
         бронёй и БК впереди), с разворотом от раненого бока */
      const sideK = (Math.random() - 0.5) * 0.5;
      const rgt = V().set(fwd.z, 0, -fwd.x);
      if (!dopt.noImpulse) {
        for (let i = 0; i < N; i++) {
          const d = Math.hypot(p[i * 3] - p[near * 3], p[i * 3 + 1] - p[near * 3 + 1], p[i * 3 + 2] - p[near * 3 + 2]);
          const f = imp * Math.exp(-d / 0.18);
          vel(i, dirW.x * f, dirW.y * f * 0.3, dirW.z * f);
        }
      }
      /* колени подламываются вперёд-вбок, таз оседает вниз-назад: так
         падает человек, у которого «выключились» ноги */
      /* тип падения: ЦНС — мгновенное обмякание; иначе по зоне и
         направлению выстрела. Чаще всего — вперёд: центр масс с плитами
         и БК впереди, ноги подламываются вперёд. */
      const right = V().set(-fwd.z, 0, fwd.x);
      const pel = V().set(p[PI.pelvis * 3], p[PI.pelvis * 3 + 1], p[PI.pelvis * 3 + 2]);
      let sd = Math.sign(_b.copy(world).sub(pel).dot(right)) || (Math.random() < 0.5 ? -1 : 1);
      const along = dirW.x * fwd.x + dirW.z * fwd.z;      /* > 0: выстрел в спину */
      const limb = /^(uarm|farm|hand|thigh|shin|foot)$/.test(zone);
      const prone = s.ctrl && s.ctrl.prone > 0.5;
      let type = null;
      if (zone === 'blast' || prone) type = null;
      else if (cns || para) type = 'drop';
      /* шея: обе руки к горлу — на колени, потом набок (knees_hold) */
      else if (zone === 'neck') type = Math.random() < 0.6 ? 'knees_hold' : Math.random() < 0.5 ? 'buckle_fwd' : 'spin_side';
      else if (dopt.noImpulse) type = 'drop';             /* обморок от кровопотери */
      else if (limb) type = Math.random() < 0.7 ? 'spin_side' : 'buckle_fwd';
      else {
        const u = Math.random();
        if (along > 0.3) type = u < 0.85 ? 'buckle_fwd' : 'spin_side';
        else if (along < -0.3) type = u < 0.55 ? 'buckle_fwd' : u < 0.82 ? 'sit_back' : 'spin_side';
        else type = u < 0.35 ? 'spin_side' : 'buckle_fwd';
      }
      /* v8: скорость в момент гибели — бегущий падает по инерции вперёд;
         ствол дерева за спиной — сползает по нему; ранение корпуса без
         ЦНС — иногда держится на коленях несколько секунд */
      const cv = (s.ctrl && s.ctrl.vel) || null, spd = cv ? Math.hypot(cv.x, cv.z) : 0;
      let trunk = null;
      if (o.colliders && spd < 1.6 && type) {
        for (const c of o.colliders) {
          if (c.type !== 'cyl' || c.r > 0.7 || c.log || !(c.tree || (c.h >= 2.5 && c.r >= 0.12))) continue;
          const dx = c.x - pel.x, dz = c.z - pel.z, d = Math.hypot(dx, dz);
          if (d > c.r + 0.75 || d < 1e-3) continue;
          if ((dx * fwd.x + dz * fwd.z) / d < -0.55) { trunk = c; break; }
        }
      }
      if (type && spd > 3.2 && type !== 'drop') type = 'run_fall';
      /* спиной к стволу: и при мгновенной потере тонуса (drop) тело
         не падает плашмя — ствол держит спину, человек сползает и садится */
      else if (trunk && Math.random() < (type === 'drop' ? 0.7 : 0.85)) type = 'slump_tree';
      else if (type && type !== 'drop' && spd < 1.6 && /^(thorax|abdomen|pelvis|plate)$/.test(zone) && along < 0.3 && Math.random() < 0.4) type = 'knees_hold';
      /* v11: на колене / в приседе — своё падение (см. deathKeys) */
      const crK = s.ctrl && s.ctrl.crouch ? s.ctrl.crouch : 0;
      if (type && type !== 'slump_tree' && crK > 0.55 && !(s.ctrl && s.ctrl.crouchMove > 0.5)) type = 'kneel_slump';
      if (type && typeof window !== 'undefined' && window.__forceDeath) type = window.__forceDeath;
      let anim = null;
      if (type) {
        const jit = () => 0.8 + Math.random() * 0.4;
        const sA = 0.88 + Math.random() * 0.24, sT = (dopt.noImpulse && !cns ? 1.5 : 1) * (0.85 + Math.random() * 0.35);
        const legK = type === 'kneel_slump' ? 1 : 1 - crK * 0.75;
        const W = sd > 0 ? 'R' : 'L', O = sd > 0 ? 'L' : 'R';
        const keys = deathKeys(type, sd, jit).map((kf) => {
          const out = { t: kf.t * sT };
          for (const key of Object.keys(kf)) {
            if (key === 't') continue;
            const nm = key.replace(/W$/, W).replace(/O$/, O);
            const leg = /^(thigh|shin|foot)/.test(nm);
            out[nm] = [0, 1, 2].map((c) => (kf[key][c] || 0) * sA * (leg ? legK : 1));
          }
          return out;
        });
        /* v13: без сознания ноги не РАЗГИБАЮТСЯ мышцами — только под весом.
           Раньше финальная поза «лёжа» разгибала колени со 100–120° до
           ~30°, и стопы, упёртые в грунт, выталкивали таз вперёд: тело
           «уезжало» на метр. Теперь каждый ключ разгибает ногу не больше
           чем на 28° относительно предыдущего (кроме падения с колена,
           где разгибание и есть оседание). */
        if (type !== 'kneel_slump') for (let i = 1; i < keys.length; i++) for (const nm of ['thighR', 'thighL', 'shinR', 'shinL']) {
          const a2 = keys[i - 1][nm], b2 = keys[i][nm];
          if (a2 && b2 && b2[0] < a2[0] - 28) b2[0] = a2[0] - 28;
        }
        anim = { type, keys, dur: keys[keys.length - 1].t, alpha: cns ? 0.18 : 0.22, fwd: fwd.clone(), right, side: sd, tc: keys[2].t, hold: type === 'slump_tree' && !!trunk, trunk: trunk ? { x: trunk.x, z: trunk.z, r: trunk.r } : null };
        /* v11: защитный рефлекс (Euphoria «catch fall», NaturalMotion): пока
           человек в сознании, руки идут вперёд-вниз навстречу земле — ловят
           падение. ЦНС — рефлекса нет (руки обмякли), остановка сердца —
           слабый. Окно — от начала оседания до удара корпусом. */
        const conscious = !cns && !dopt.noImpulse;
        const reachT = { buckle_fwd: [0.18, 1.05], spin_side: [0.15, 1.0], run_fall: [0.04, 0.85], kneel_slump: [0.3, 1.0], knees_hold: [-1, -1] }[type];
        if (conscious && zone !== 'neck' && reachT && reachT[0] >= 0) anim.reach = { t0: reachT[0] * sT, t1: reachT[1] * sT, k: (s.deathKind === 'fatal' ? 0.45 : 1) * (0.65 + Math.random() * 0.35), lead: Math.random() < 0.5 ? 'R' : 'L' };
        /* на коленях, держась за рану: кисть раненой стороны — к ране */
        if (type === 'knees_hold' && zone !== 'neck') anim.clutch = { t0: 0.3 * sT, t1: keys[keys.length - 2].t, side: sd > 0 ? 'R' : 'L' };
        /* Ноги подламываются не мышцами, а весом: колени сгибаются ровно
           настолько, насколько тело уже осело (плюс 10 см «уступки»).
           Поэтому время анимации до момента «на коленях» (ключ 2) идёт
           не быстрее, чем падает таз, — иначе форма складывается в
           воздухе, стопы взлетают и боец как будто подпрыгивает. hk —
           высота таза над грунтом в позе ключа 2. */
        anim.h0 = p[PI.pelvis * 3 + 1] - gnd(p[PI.pelvis * 3], p[PI.pelvis * 3 + 2]);
        const tmp = new Float32Array(N * 3), pc = P0p0(p);
        anim.hTab = [];
        for (let j = 0; j <= 16; j++) {
          animShape(anim, pc, anim.tc * j / 16, tmp);
          let low = 1e9;
          for (const nm of ['kneeR', 'kneeL', 'ankleR', 'ankleL']) low = Math.min(low, tmp[PI[nm] * 3 + 1] - r[PI[nm]] * 0.8);
          anim.hTab.push(tmp[PI.pelvis * 3 + 1] - low);
        }
        /* высота таза в позе смерти (над грунтом) против той же по форме:
           поправка на то, что стопы могли стоять не на нуле */
        anim.hOff = anim.h0 - anim.hTab[0];
      }
      /* v8: инерция бега/шага — всё тело сохраняет скорость; на бегу
         корпус уходит вперёд сильнее ног (ноги остановило, верх — нет) */
      if (cv && (spd > 0.3 || Math.abs(cv.y || 0) > 0.1)) {
        const run = Math.min(1, Math.max(0, (spd - 1.5) / 3));
        for (let i = 0; i < N; i++) {
          const up = (p[i * 3 + 1] - gnd(p[i * 3], p[i * 3 + 2])) / 1.7;
          const residual = globalThis.GStumble?.velocity(s,PDEF[i][1]);
          vel(i, cv.x + (residual?.x || 0), (cv.y || 0) + (residual?.y || 0), cv.z + (residual?.z || 0));
        }
      }
      /* начальные скорости: таз оседает, колени уходят вперёд */
      for (const n of ['kneeR', 'kneeL']) vel(PI[n], fwd.x * 0.25, -0.1, fwd.z * 0.25);
      for (const n of ['pelvis', 'spine', 'hipR', 'hipL']) vel(PI[n], -fwd.x * 0.05, -0.4, -fwd.z * 0.05);
      const lean = type === 'sit_back' || type === 'slump_tree' ? -0.3 : type === 'spin_side' ? 0.12 : type === 'knees_hold' ? 0.1 : 0.28;
      /* v16: разворот к раненому боку — корпусом, а не броском вбок
         (было 0,3 м/с вбок голове и груди: тело уходило с линии огня) */
      const latK = type === 'spin_side' ? 0.1 * sd : sideK * 0.2;
      for (const n of ['chest', 'chestF', 'neck', 'head']) vel(PI[n], fwd.x * lean + right.x * latK, 0, fwd.z * lean + right.z * latK);
      if (type === 'sit_back') for (const n of ['pelvis', 'spine']) vel(PI[n], -fwd.x * 0.3, 0, -fwd.z * 0.3);
      if (type === 'slump_tree') {
        /* таз уезжает вперёд, спина — назад, на ствол */
        vel(PI.pelvis, fwd.x * 0.3, 0, fwd.z * 0.3);
        for (const n of ['spine', 'chest']) vel(PI[n], -fwd.x * 0.22, 0, -fwd.z * 0.22);
      }
      /* связи: все пары внутри жёстких групп + кости + ограничения */
      const C = [];
      const dist = (a, b) => Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
      const add = (a, b, lo, hi, st) => { const i = PI[a], j = PI[b], d = dist(i, j); C.push([i, j, d * lo, d * hi, st === undefined ? 1 : st]); };
      for (const g of Object.values(GROUPS)) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) add(g[i], g[j], 1, 1);
      add('spine', 'chest', 1, 1);
      add('hipR', 'chestR', 0.8, 1.06, 0.5); add('hipL', 'chestL', 0.8, 1.06, 0.5); add('pelvis', 'chestF', 0.82, 1.05, 0.5);
      add('spine', 'chestF', 0.9, 1.05, 0.6);
      add('headTop', 'chest', 0.84, 1.03, 0.6); add('nose', 'chestF', 0.7, 1.12, 0.5); add('head', 'chestR', 0.8, 1.15, 0.4); add('head', 'chestL', 0.8, 1.15, 0.4);
      /* шея: наклон вперёд ≲45°, назад ≲40°, поворот ≲65°, вбок ≲35° */
      add('headTop', 'chestF', 0.8, 1.08, 0.6);
      add('nose', 'shoulderR', 0.86, 1.3, 0.5); add('nose', 'shoulderL', 0.86, 1.3, 0.5);
      add('headTop', 'shoulderR', 0.86, 1.15, 0.5); add('headTop', 'shoulderL', 0.86, 1.15, 0.5);
      /* скрутка корпуса */
      add('chestR', 'hipL', 0.9, 1.08, 0.5); add('chestL', 'hipR', 0.9, 1.08, 0.5);
      for (const S of ['R', 'L']) {
        add('shoulder' + S, 'elbow' + S, 1, 1); add('elbow' + S, 'wrist' + S, 1, 1); add('wrist' + S, 'hand' + S, 1, 1); add('elbow' + S, 'hand' + S, 0.75, 1.02, 0.6);
        const ua = dist(PI['shoulder' + S], PI['elbow' + S]) + dist(PI['elbow' + S], PI['wrist' + S]);
        C.push([PI['shoulder' + S], PI['wrist' + S], ua * 0.3, ua * 1.0, 1]);
        add('hip' + S, 'knee' + S, 1, 1); add('knee' + S, 'ankle' + S, 1, 1); add('ankle' + S, 'toe' + S, 1, 1);
        add('knee' + S, 'toe' + S, 0.86, 1.08, 0.7);
        const lg = dist(PI['hip' + S], PI['knee' + S]) + dist(PI['knee' + S], PI['ankle' + S]);
        C.push([PI['hip' + S], PI['ankle' + S], lg * 0.32, lg * 1.0, 1]);
        C.push([PI['pelvis'], PI['knee' + S], 0.12 * k, 9, 1]);
      }
      /* колени не расходятся «лягушкой», стопы не разлетаются */
      C.push([PI.kneeR, PI.kneeL, 0.13 * k, 0.55 * k, 1]); C.push([PI.ankleR, PI.ankleL, 0.12 * k, 0.85 * k, 1]);
      C.push([PI.toeR, PI.toeL, 0.1 * k, 9, 1]);
      /* Остаточный мышечный тонус. Человек без сознания не падает
         «доской» и не складывается тряпкой мгновенно: попадание в мозг /
         ствол — тонус пропадает сразу (≈0,05 с); иначе мозг ещё ~5–15 с
         на кислороде, ноги подкашиваются первыми, корпус и шея держатся
         долю секунды, руки прижаты к оружию. Связи ниже — «мышцы»: их
         жёсткость масштабируется тонусом, который гаснет со временем.
         Кроме того, они не дают локтям и коленям выгибаться назад. */
      /* «тонус» теперь задаёт анимация падения (anim, см. SEGS):
         связи-мышцы растягивали тело в пластилин и убраны */
      const toneT = 0;
      /* сгибание в тазобедренном суставе ограничено (~120°): корпус не
         складывается «в шар» на бёдра, голова не уходит между колен */
      for (const S2 of ['R', 'L']) {
        C.push([PI.chest, PI['knee' + S2], dist(PI.chest, PI['knee' + S2]) * 0.55, 9, 0.8]);
        C.push([PI.headTop, PI['knee' + S2], dist(PI.headTop, PI['knee' + S2]) * 0.5, 9, 0.8]);
        C.push([PI.pelvis, PI['ankle' + S2], dist(PI.pelvis, PI['ankle' + S2]) * 0.42, 9, 0.6]);
      }
      /* локти и колени не разгибаются за прямую: предел — 98 % длины
         цепочки (раньше 100 %: конечность выгибалась назад) */
      for (const S2 of ['R', 'L']) {
        const ua = dist(PI['shoulder' + S2], PI['elbow' + S2]) + dist(PI['elbow' + S2], PI['wrist' + S2]);
        C.push([PI['shoulder' + S2], PI['wrist' + S2], ua * 0.3, ua * 0.975, 1]);
        const lg = dist(PI['hip' + S2], PI['knee' + S2]) + dist(PI['knee' + S2], PI['ankle' + S2]);
        C.push([PI['hip' + S2], PI['ankle' + S2], lg * 0.32, lg * 0.985, 1]);
      }
      /* начальные ориентации для переноса на кости */
      const Q0 = {}, P0 = {};
      for (const n of Object.keys(ch.boneIndex)) { Q0[n] = ch.bone(n).getWorldQuaternion(new THREE.Quaternion()); }
      P0.p = p.slice();
      /* автомат: три точки, трос ремня к груди */
      const w = s.gun;
      let gun = null;
      /* v25: ремень «на плече» в рэгдолле не моделируется — скрыть */
      if (w && w._strap) w._strap.visible = false;
      s._shK = 0; s._shT = 0; s._shB = 0; s._shHR = 0; s._shHL = 0;
      if (w) {
        w.root.updateMatrixWorld(true);
        const mzW = w.gun.localToWorld(w.muzzleLocal.clone());
        const mL = w.root.worldToLocal(mzW.clone());
        /* четыре точки: затыльник, дульный срез, верх ствольной коробки и
           хват — там, где сейчас правая кисть: первые доли секунды автомат
           остаётся в руке и падает вместе с ней, потом выскальзывает */
        const hI = PI.handR;
        const gL = w.root.worldToLocal(V().set(p[hI * 3], p[hI * 3 + 1], p[hI * 3 + 2]));
        if (gL.length() > 0.6) gL.set(0, -0.08, mL.z * 0.3);
        const loc = [V().set(0, 0, 0), mL.clone(), V().set(0, 0.09, mL.z * 0.5), gL];
        const NG = loc.length;
        const gp = new Float32Array(NG * 3), gpp = new Float32Array(NG * 3);
        for (let i = 0; i < NG; i++) { const q2 = w.root.localToWorld(loc[i].clone()); gp[i * 3] = q2.x; gp[i * 3 + 1] = q2.y; gp[i * 3 + 2] = q2.z; }
        gpp.set(gp);
        const sx = (Math.random() - 0.5) * 0.4;
        for (let i = 0; i < NG; i++) { gpp[i * 3] -= (sx + fwd.x * 0.4) * H0; gpp[i * 3 + 2] -= fwd.z * 0.4 * H0; }
        const pairs = [];
        for (let a = 0; a < NG; a++) for (let b2 = a + 1; b2 < NG; b2++)
          pairs.push([a, b2, Math.hypot(gp[a * 3] - gp[b2 * 3], gp[a * 3 + 1] - gp[b2 * 3 + 1], gp[a * 3 + 2] - gp[b2 * 3 + 2])]);
        /* ремень — от середины автомата к груди; длина с запасом от
           текущего положения, иначе первый же шаг дёргает автомат вверх */
        const cI = PI.chest;
        const d0 = Math.hypot((gp[0] + gp[3]) / 2 - p[cI * 3], (gp[1] + gp[4]) / 2 - p[cI * 3 + 1], (gp[2] + gp[5]) / 2 - p[cI * 3 + 2]);
        gun = { p: gp, pp: gpp, n: NG, pairs, loc, landed: false, rope: Math.max(0.55 * k, d0 + 0.1),
          grip: 0.18 + Math.random() * 0.45, q0: w.root.quaternion.clone(), f0: null };
        if (w.recoilRig) w.recoilRig.position.set(0, 0, 0);
        if (w.tiltRig) w.tiltRig.rotation.set(0, 0, 0);
      }
      /* v8: препятствия рядом (стволы, пни, брёвна, ящики) — тело на них
         опирается, а не проходит насквозь */
      const obst = [];
      if (o.colliders) for (const c of o.colliders) {
        const cx = c.type === 'box' ? (c.x0 + c.x1) / 2 : c.x, cz = c.type === 'box' ? (c.z0 + c.z1) / 2 : c.z;
        const rr = c.type === 'box' ? Math.hypot(c.x1 - c.x0, c.z1 - c.z0) / 2 : c.r;
        if (Math.hypot(cx - pel.x, cz - pel.z) > rr + 2.6 + spd * 0.6) continue;
        const top = c._top !== undefined ? c._top : (s.ctrl && s.ctrl.topOf ? s.ctrl.topOf(c) : gnd(cx, cz) + (c.h || 2));
        obst.push({ c, top });
      }
      s.rd = { p, pp, r, C, Q0, P0, gun, sleep: 0, landed: false, t: 0, te: 0, kScale: k, woundI: near, toneT, anim,
        tq: p.slice(), smQ: new THREE.Quaternion(), deathType: type, obst, cap: buildCaps(p, k),
        /* v12: предел скорости центра масс по горизонтали (м/с) — страховка
           от «катапульты»: тело не может разогнаться само по себе сильнее,
           чем его несла инерция бега; подрыв — без ограничения */
        vAllow: zone === 'blast' ? 1e9 : Math.max(1.05, spd * 1.0 + 0.35),
        /* v16: поперёк линии огня центр масс почти не уходит: импульс пули
           ничтожен, человек оседает на месте (скрин 7 — тело «улетало»
           влево). Поперечная скорость ЦМ ≤ 0,4 м/с (плюс собственная
           скорость бойца поперёк линии, если он шёл/бежал) */
        latAx: zone === 'blast' ? null : (() => { const lx = -dirW.z, lz = dirW.x, ll = Math.hypot(lx, lz); return ll > 0.2 ? [lx / ll, lz / ll] : [right.x, right.z]; })(),
        vLat: 0.4 + (cv ? Math.abs(cv.x * -dirW.z + cv.z * dirW.x) : 0) };
      /* v14: агония в сознании — мышцы ещё работают: руки зажимают рану
         (шея — обе к горлу), ноги подтягиваются и сучат по земле, корпус
         сворачивается и перекатывается; с кровопотерей движения слабеют и
         стихают (k — уровень сознания из физиологии). */
      if (/^(wound|neck|blast)$/.test(s.deathKind)) {
        const wz = zone === 'neck' ? 'neck' : zone === 'thorax' || zone === 'plate' ? 'chest' : zone === 'abdomen' ? 'spine' : zone === 'pelvis' ? 'pelvis' : null;
        const limbSide = /^(uarm|farm|hand|thigh|shin|foot)$/.test(zone) ? (h0side(s, near) || 'R') : null;
        s.rd.ag = { k: 1, t: 0, zone, wz, both: zone === 'neck' || Math.random() < 0.45, side: Math.random() < 0.5 ? 'R' : 'L', limb: limbSide, seed: Math.random() * 100,
          ph: [Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28], fr: 0.55 + Math.random() * 0.35, blast: zone === 'blast' };
        if (limbSide && /^(uarm|farm|hand)$/.test(zone)) s.rd.ag.side = limbSide === 'R' ? 'L' : 'R';
      } else if (s.deathKind === 'para' && s.dmg && s.dmg.ph) {
        /* паралич (шейный отдел): мышцы не работают — тело обмякшее, но
           физиология идёт: апноэ → потеря сознания → смерть через минуты */
        s.rd.ag = { k: 0, t: 0, zone, wz: null, para: true, both: false, side: 'R', limb: null, seed: Math.random() * 100,
          ph: [0, 0, 0], fr: 0.6, blast: false };
      }
      /* v8: каска слетает — от попадания в неё/в голову, от взрыва, редко — от удара о землю */
      const pHelm = zone === 'helmet' ? 0.5 : zone === 'head' ? 0.22 : zone === 'blast' ? 0.55 : type === 'run_fall' ? 0.12 : 0.03;
      if (!dopt.temporary && Math.random() < pHelm) try { popHelmet(s, dirW, zone === 'blast' ? 2 : zone === 'helmet' || zone === 'head' ? 1.3 : 0.6, cv); } catch (e) { /* необязательно */ }
      s.deathType = type;
      /* кровотечение: из раны капает, пока тело падает, потом — лужа */
      if (o.blood && !dopt.noBleed) o.blood.bleed(s, near, zone);
      /* кисти расслаблены */
      if (ch.hands && DM.handSpec) {
        const H = DM.handSpec.hands || {};
        const A = H.open, B = H.support || H.indexed;
        if (A && B) {
          const pose = {};
          for (const f of Object.keys(A)) pose[f] = A[f].map((x, i) => x * 0.45 + (B[f] ? B[f][i] : x) * 0.55);
          for (const SS of ['R', 'L']) if (ch.hands[SS]) ch.hands[SS].setPose(pose);
        }
      }
      if (o.onDeath && !dopt.quiet) o.onDeath(s, zone);
    }
    function h0side(s, i) { const n = PDEF[i] && PDEF[i][0]; return n && /[RL]$/.test(n) ? n.slice(-1) : null; }
    function pushRagdoll(s, world, dirW, f) {
      const R = s.rd;
      if (!R) return;
      R.sleep = 0;
      const physics = s.ctrl?._physicsWorld && globalThis.GPhysics?.get(s.ctrl._physicsWorld);
      if (physics?.ragdolls.has(s)) {
        physics.ragdollImpulse(s,dirW.clone().multiplyScalar(clamp(f * 18,0,24)),world);
        return;
      }
      const N = PDEF.length;
      for (let i = 0; i < N; i++) {
        const d = Math.hypot(R.p[i * 3] - world.x, R.p[i * 3 + 1] - world.y, R.p[i * 3 + 2] - world.z);
        const g = f * Math.exp(-d / 0.18) * H0;
        R.pp[i * 3] -= dirW.x * g; R.pp[i * 3 + 1] -= dirW.y * g * 0.4; R.pp[i * 3 + 2] -= dirW.z * g;
      }
    }

    /* целевая форма тела в момент R.t: прямая кинематика от позы
       смерти P0 по сегментам SEGS, оси — тела в момент гибели */
    const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
    const _UP = new THREE.Vector3(0, 1, 0), _va = V();
    const SEGQ = {};
    for (const sg of SEGS) SEGQ[sg[0]] = new THREE.Quaternion();
    const DEG = Math.PI / 180;
    const P0p0 = (p) => p.slice();
    function animTarget(R) { animShape(R.anim, R.P0.p, R.te, R.tq); }
    function animShape(A, P0, t, q) {
      const K = A.keys;
      let i = 0;
      while (i < K.length - 2 && K[i + 1].t < t) i++;
      const k0 = K[i], k1 = K[i + 1];
      let u = Math.min(1, Math.max(0, (t - k0.t) / Math.max(1e-4, k1.t - k0.t)));
      u = u * u * (3 - 2 * u);
      q.set(P0);
      for (const [nm, piv, mem, par] of SEGS) {
        const a0 = k0[nm], a1 = k1[nm];
        const f = ((a0 ? a0[0] : 0) * (1 - u) + (a1 ? a1[0] : 0) * u) * DEG * FLEX_SIGN[nm];
        const rl = ((a0 ? a0[1] : 0) * (1 - u) + (a1 ? a1[1] : 0) * u) * DEG;
        const yw = ((a0 ? a0[2] : 0) * (1 - u) + (a1 ? a1[2] : 0) * u) * DEG;
        const Q = SEGQ[nm];
        _qa.setFromAxisAngle(_UP, yw);
        _qb.setFromAxisAngle(A.fwd, rl);
        _qc.setFromAxisAngle(A.right, f);
        Q.copy(_qa).multiply(_qb).multiply(_qc);
        if (par) Q.premultiply(SEGQ[par]);
        const pi = PI[piv];
        for (const m of mem) {
          const mi = PI[m];
          _va.set(P0[mi * 3] - P0[pi * 3], P0[mi * 3 + 1] - P0[pi * 3 + 1], P0[mi * 3 + 2] - P0[pi * 3 + 2]).applyQuaternion(Q);
          q[mi * 3] = q[pi * 3] + _va.x; q[mi * 3 + 1] = q[pi * 3 + 1] + _va.y; q[mi * 3 + 2] = q[pi * 3 + 2] + _va.z;
        }
      }
    }
    /* сопоставление форм: лучший поворот целевой формы на текущую
       (полярное разложение итерациями по кватерниону, Müller 2016) и
       шаг частиц к ней; центр масс и общий поворот не трогает */
    const SMW0 = new Float32Array(PDEF.length);
    for (const nm in SM_W) SMW0[PI[nm]] = SM_W[nm];
    const _sm = new THREE.Matrix4(), _w = V(), _c0 = V(), _c1 = V(), _c2 = V();
    function shapeMatch(R, alpha) {
      const p = R.p, q = R.tq, N = PDEF.length, SMW = R.smw || SMW0;
      let W = 0, px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
      for (let i = 0; i < N; i++) {
        const w = SMW[i]; if (!w) continue;
        W += w; px += w * p[i * 3]; py += w * p[i * 3 + 1]; pz += w * p[i * 3 + 2];
        qx += w * q[i * 3]; qy += w * q[i * 3 + 1]; qz += w * q[i * 3 + 2];
      }
      px /= W; py /= W; pz /= W; qx /= W; qy /= W; qz /= W;
      const a = [0, 0, 0, 0, 0, 0, 0, 0, 0];      /* по столбцам */
      for (let i = 0; i < N; i++) {
        const w = SMW[i]; if (!w) continue;
        const dx = p[i * 3] - px, dy = p[i * 3 + 1] - py, dz = p[i * 3 + 2] - pz;
        const ex = (q[i * 3] - qx) * w, ey = (q[i * 3 + 1] - qy) * w, ez = (q[i * 3 + 2] - qz) * w;
        a[0] += dx * ex; a[1] += dy * ex; a[2] += dz * ex;
        a[3] += dx * ey; a[4] += dy * ey; a[5] += dz * ey;
        a[6] += dx * ez; a[7] += dy * ez; a[8] += dz * ez;
      }
      const Q = R.smQ;
      for (let it = 0; it < 6; it++) {
        const e = _sm.makeRotationFromQuaternion(Q).elements;
        _c0.set(e[0], e[1], e[2]); _c1.set(e[4], e[5], e[6]); _c2.set(e[8], e[9], e[10]);
        const ox = _c0.y * a[2] - _c0.z * a[1] + _c1.y * a[5] - _c1.z * a[4] + _c2.y * a[8] - _c2.z * a[7];
        const oy = _c0.z * a[0] - _c0.x * a[2] + _c1.z * a[3] - _c1.x * a[5] + _c2.z * a[6] - _c2.x * a[8];
        const oz = _c0.x * a[1] - _c0.y * a[0] + _c1.x * a[4] - _c1.y * a[3] + _c2.x * a[7] - _c2.y * a[6];
        const den = Math.abs(_c0.x * a[0] + _c0.y * a[1] + _c0.z * a[2] + _c1.x * a[3] + _c1.y * a[4] + _c1.z * a[5] + _c2.x * a[6] + _c2.y * a[7] + _c2.z * a[8]) + 1e-9;
        _w.set(ox / den, oy / den, oz / den);
        const wl = _w.length();
        if (wl < 1e-7) break;
        _qa.setFromAxisAngle(_w.multiplyScalar(1 / wl), wl);
        Q.premultiply(_qa).normalize();
      }
      for (let i = 0; i < N; i++) {
        if (!SMW[i]) continue;
        /* v16: неполный вес (стопы на грунте) — и тянет слабее */
        const al = SMW[i] < 1 ? alpha * SMW[i] : alpha;
        _va.set(q[i * 3] - qx, q[i * 3 + 1] - qy, q[i * 3 + 2] - qz).applyQuaternion(Q);
        p[i * 3] += (px + _va.x - p[i * 3]) * al;
        p[i * 3 + 1] += (py + _va.y - p[i * 3 + 1]) * al;
        p[i * 3 + 2] += (pz + _va.z - p[i * 3 + 2]) * al;
      }
    }
    /* шаг рэгдолла */
    /* v11: руки «живого» падения — мягкая мышечная тяга кистей и запястий к
       цели (позиционная поправка Верле = сила), остальное решают связи.
       reach: кисти вперёд-вниз по ходу падения, на ширине плеч, ведущая
       рука раньше; clutch: кисть к ране и чуть наружу. */
    /* v14: агония. Позиционные поправки (как armReflex) — «мышечная тяга»
       к цели; остальное решают связи, грунт и столкновения тела.
       Цели строятся в системе ТЕЛА (ось таз→шея, поперечная ось бёдер,
       «перед» — их векторное произведение), поэтому работают и лёжа на
       спине, и на боку, и ничком. Ритм — медленные несинхронные качания
       (0,3–0,9 Гц) с шумом: так выглядят судорожные попытки свернуться,
       подтянуть колени, перекатиться и зажать рану. */
    const _ag = { u: [0, 0, 0], r: [0, 0, 0], f: [0, 0, 0] };
    function agonyDrive(R, ground, h, fdt) {
      const A = R.ag, p = R.p;
      if (fdt > 0) A.t += fdt;
      const t = A.t, k = A.k;
      const P3 = (n) => PI[n] * 3;
      const pe = P3('pelvis'), ne = P3('neck'), hr = P3('hipR'), hl = P3('hipL');
      const u = _ag.u, r = _ag.r, f = _ag.f;
      u[0] = p[ne] - p[pe]; u[1] = p[ne + 1] - p[pe + 1]; u[2] = p[ne + 2] - p[pe + 2];
      let l = Math.hypot(u[0], u[1], u[2]) || 1; u[0] /= l; u[1] /= l; u[2] /= l;
      r[0] = p[hr] - p[hl]; r[1] = p[hr + 1] - p[hl + 1]; r[2] = p[hr + 2] - p[hl + 2];
      const d = r[0] * u[0] + r[1] * u[1] + r[2] * u[2];
      r[0] -= u[0] * d; r[1] -= u[1] * d; r[2] -= u[2] * d;
      l = Math.hypot(r[0], r[1], r[2]) || 1; r[0] /= l; r[1] /= l; r[2] /= l;
      /* перед = up × right (в покое: (0,1,0)×(1,0,0) = (0,0,-1)) */
      f[0] = u[1] * r[2] - u[2] * r[1]; f[1] = u[2] * r[0] - u[0] * r[2]; f[2] = u[0] * r[1] - u[1] * r[0];
      /* v16: усилие мышц — внутреннее: тянет кисть/колено к цели и с той
         же силой (по массам) толкает опору (грудь, таз) обратно. Прежде
         тянулась только конечность — внешняя сила из ниоткуда: колено,
         которое «подтягивалось к животу» лицом вниз, упиралось в грунт и
         переворачивало тело через голову (скрины 4–5). */
      const pull = (nm, tx, ty, tz, w, anc, ka) => {
        const i = P3(nm), gy = ground(p[i], p[i + 2]) + R.r[PI[nm]] * 0.8;
        const dx = (tx - p[i]) * w, dy = (Math.max(ty, gy) - p[i + 1]) * w, dz = (tz - p[i + 2]) * w;
        /* Плавный мотор кисти, а не накопление скорости от перестановки. */
        const q = R.pp;
        p[i] += dx; p[i + 1] += dy; p[i + 2] += dz;
        q[i] += dx * 0.85; q[i + 1] += dy * 0.85; q[i + 2] += dz * 0.85;
        if (anc) { const q = (ka || 0.5) / anc.length; for (const a of anc) { const j = P3(a); p[j] -= dx * q; p[j + 1] -= dy * q * 0.5; p[j + 2] -= dz * q; } }
      };
      /* слабеет: k — сознание; первые секунды — максимум (шок, адреналин) */
      const vig = k * (A.t < 6 ? 1 : 0.55 + 0.45 * Math.exp(-(A.t - 6) / 25));
      /* v14: ноги и корпус включаются, только когда тело легло (грудь ниже
         ~0,45 м и анимация падения закончилась): иначе подтягивание колен
         в падении подбрасывало ноги вверх и тело летело плашмя */
      const c3g = P3('chest'), hc = p[c3g + 1] - ground(p[c3g], p[c3g + 2]);
      const onG = (R.anim && R.te < R.anim.dur) ? 0 : clamp((0.55 - hc) / 0.2, 0, 1);
      A.gk = (A.gk || 0) + (onG - (A.gk || 0)) * Math.min(1, h * 2);
      const gk = A.gk;
      /* 1. руки к ране */
      if (A.wz && !A.blast) {
        const wi = P3(A.wz);
        const fo = A.wz === 'neck' ? 0.055 : A.wz === 'pelvis' ? 0.11 : 0.13;
        const up = A.wz === 'neck' ? 0.0 : 0.02;
        /* дрожь кистей: давят на рану, перехватывают */
        const jx = Math.sin(t * 2.1 + A.seed) * 0.0015 * vig, jy = Math.sin(t * 1.7 + A.seed * 2) * 0.0015 * vig;
        const sides = A.both ? ['R', 'L'] : [A.side];
        for (const S of sides) {
          const sg = S === 'R' ? 1 : -1, lat = A.wz === 'neck' ? 0.03 : 0.06;
          const tx = p[wi] + f[0] * fo + r[0] * lat * sg + u[0] * up + r[0] * jx + u[0] * jy;
          const ty = p[wi + 1] + f[1] * fo + r[1] * lat * sg + u[1] * up + r[1] * jx + u[1] * jy;
          const tz = p[wi + 2] + f[2] * fo + r[2] * lat * sg + u[2] * up + r[2] * jx + u[2] * jy;
          /* в падении — лишь тянется к ране (мягко), на земле — зажимает */
          const w = Math.min(0.06, 9 * h * Math.min(1, vig * 1.6)) * (0.15 + 0.85 * gk);
          pull('hand' + S, tx, ty, tz, w);
          pull('wrist' + S, tx - f[0] * 0.04 - u[0] * 0.06, ty - f[1] * 0.04 - u[1] * 0.06, tz - f[2] * 0.04 - u[2] * 0.06, w * 0.7);
        }
      } else if (A.limb) {
        /* ранена конечность — обе руки тянутся к ней (к бедру/голени) */
        const tgt = P3((/^(thigh|shin|foot)$/.test(A.zone) ? 'knee' : 'elbow') + A.limb);
        const S = A.side;
        pull('hand' + S, p[tgt] + f[0] * 0.07, p[tgt + 1] + f[1] * 0.07, p[tgt + 2] + f[2] * 0.07, Math.min(0.05, 7 * h * vig) * (0.15 + 0.85 * gk));
      }
      /* Раненый может зажимать рану и дышать. Циклический привод ног,
         перекатывание корпуса и подъём головы убраны: они боролись с
         контактами и выглядели как бесконечные конвульсии. У погибшего
         или потерявшего сознание мышечный привод вообще не работает. */
      /* 4. дыхание: грудь ходит часто и мелко (тахипноэ), у шеи — рывками */
      if (fdt > 0) {
        const br = Math.sin(t * (A.wz === 'neck' ? 4.2 : 3.2)) * 0.0009 * (0.3 + k);
        const i = P3('chestF');
        p[i] += f[0] * br; p[i + 1] += f[1] * br; p[i + 2] += f[2] * br;
      }
      R.sleep = 0;
    }
    /* v16: предел вращения тела как целого (PBD, Müller et al. 2007,
       §3.5 — демпфирование «жёстких» мод). Считаем момент импульса L и
       тензор инерции I облака частиц, ω = I⁻¹L; если |ω| выше предела —
       лишнее вращение вычитается из скоростей всех частиц (относительные
       движения конечностей не трогаются). Лежащий раненый может
       перевернуться на бок (≈1–1,5 рад/с), но не кувыркаться. */
    function capSpin(R, wMax, h, yawOnly) {
      const p = R.p, pp = R.pp, N = PDEF.length;
      let cx = 0, cy = 0, cz = 0, vx = 0, vy = 0, vz = 0;
      for (let i = 0; i < N; i++) { const j = i * 3; cx += p[j]; cy += p[j + 1]; cz += p[j + 2]; vx += p[j] - pp[j]; vy += p[j + 1] - pp[j + 1]; vz += p[j + 2] - pp[j + 2]; }
      cx /= N; cy /= N; cz /= N; vx /= N; vy /= N; vz /= N;
      let Lx = 0, Ly = 0, Lz = 0, a = 0, b = 0, c = 0, d = 0, e = 0, f = 0;
      for (let i = 0; i < N; i++) {
        const j = i * 3, rx = p[j] - cx, ry = p[j + 1] - cy, rz = p[j + 2] - cz;
        const ux = p[j] - pp[j] - vx, uy = p[j + 1] - pp[j + 1] - vy, uz = p[j + 2] - pp[j + 2] - vz;
        Lx += ry * uz - rz * uy; Ly += rz * ux - rx * uz; Lz += rx * uy - ry * ux;
        a += ry * ry + rz * rz; b += rx * rx + rz * rz; c += rx * rx + ry * ry;
        d -= rx * ry; e -= rx * rz; f -= ry * rz;
      }
      /* I = [[a,d,e],[d,b,f],[e,f,c]] — обратная через алгебраические дополнения */
      const A11 = b * c - f * f, A12 = e * f - d * c, A13 = d * f - b * e;
      const det = a * A11 + d * A12 + e * A13;
      if (Math.abs(det) < 1e-9) return;
      const A22 = a * c - e * e, A23 = d * e - a * f, A33 = a * b - d * d;
      const wx = (A11 * Lx + A12 * Ly + A13 * Lz) / det, wy = (A12 * Lx + A22 * Ly + A23 * Lz) / det, wz = (A13 * Lx + A23 * Ly + A33 * Lz) / det;
      if (yawOnly) {
        /* только вращение вокруг вертикали («волчок» на коленях) */
        const wa = Math.abs(wy) / h;
        if (wa <= wMax) return;
        const k = 1 - wMax / wa;
        for (let i = 0; i < N; i++) { const j = i * 3; pp[j] += k * wy * (p[j + 2] - cz); pp[j + 2] -= k * wy * (p[j] - cx); }
        return;
      }
      const wl = Math.hypot(wx, wy, wz) / h;
      if (wl <= wMax) return;
      const k = 1 - wMax / wl;
      for (let i = 0; i < N; i++) {
        const j = i * 3, rx = p[j] - cx, ry = p[j + 1] - cy, rz = p[j + 2] - cz;
        pp[j] += k * (wy * rz - wz * ry); pp[j + 1] += k * (wz * rx - wx * rz); pp[j + 2] += k * (wx * ry - wy * rx);
      }
    }
    const _rf = { x: 0, z: 0 };
    function armReflex(R, AN, ground, h) {
      const p = R.p, pp = R.pp, t = R.te;
      if (AN.reach) {
        const A = AN.reach;
        if (t > A.t0 && t < A.t1) {
          const c3 = PI.chest * 3;
          let fx = p[c3] - pp[c3], fz = p[c3 + 2] - pp[c3 + 2];
          const fl = Math.hypot(fx, fz);
          if (fl < 2e-4) { fx = AN.fwd.x; fz = AN.fwd.z; } else { fx /= fl; fz /= fl; }
          /* направление падения сглажено: без рывков кистей от дрожи корпуса */
          _rf.x = _rf.x * 0.9 + fx * 0.1; _rf.z = _rf.z * 0.9 + fz * 0.1;
          const nl = Math.hypot(_rf.x, _rf.z) || 1, dx = _rf.x / nl, dz = _rf.z / nl;
          const env = Math.sin(Math.PI * Math.min(1, (t - A.t0) / (A.t1 - A.t0)));
          const gy = ground(p[c3], p[c3 + 2]);
          for (const S of ['R', 'L']) {
            const lagK = S === A.lead ? 1 : 0.7;
            const sdx = -dz * (S === 'R' ? -1 : 1), sdz = dx * (S === 'R' ? -1 : 1);
            const tx = p[c3] + dx * 0.42 + sdx * 0.2, tz = p[c3 + 2] + dz * 0.42 + sdz * 0.2;
            const ty = Math.max(gy + 0.06, p[c3 + 1] - 0.5);
            const w = Math.min(0.2, 14 * A.k * env * lagK * h);
            for (const [nm, f] of [['hand' + S, 1], ['wrist' + S, 0.8], ['elbow' + S, 0.25]]) {
              const i = PI[nm] * 3;
              p[i] += (tx - p[i]) * w * f; p[i + 1] += (ty - p[i + 1]) * w * f; p[i + 2] += (tz - p[i + 2]) * w * f;
            }
          }
        }
      }
      if (AN.clutch) {
        const A = AN.clutch;
        if (t > A.t0 && t < A.t1) {
          const wi = (R.woundI || PI.chest) * 3, c3 = PI.chest * 3;
          const ox = p[wi] - p[c3], oz = p[wi + 2] - p[c3 + 2], ol = Math.hypot(ox, oz) || 1;
          const tx = p[wi] + ox / ol * 0.05, ty = p[wi + 1], tz = p[wi + 2] + oz / ol * 0.05;
          const env = Math.min(1, (t - A.t0) / 0.3) * Math.min(1, (A.t1 - t) / 0.3);
          const w = Math.min(0.2, 12 * env * h);
          for (const [nm, f] of [['hand' + A.side, 1], ['wrist' + A.side, 0.7]]) {
            const i = PI[nm] * 3;
            p[i] += (tx - p[i]) * w * f; p[i + 1] += (ty - p[i + 1]) * w * f; p[i + 2] += (tz - p[i + 2]) * w * f;
          }
        }
      }
    }
    /* v12: самостолкновения рэгдолла. Раньше от корпуса отталкивались
       только локти и кисти (точка против двух сфер), поэтому плечо,
       предплечье, бедро и голень свободно проходили сквозь туловище и
       друг сквозь друга — руки и ноги «тонули» в теле. Теперь каждый
       сегмент — капсула (отрезок между частицами + радиус), пары
       несмежных капсул разводятся позиционной поправкой (PBD, Müller et
       al. 2007; так же устроены capsule-ragdoll в PhysX / Havok / Jolt).
       Поправка распределяется по концам отрезка по барицентрическим
       весам, поэтому импульс сохраняется и тело не «толкает само себя».
       Дистанция контакта калибруется по позе в момент гибели: если рука
       уже лежала на цевье у груди, пара начинает с текущего зазора и
       только наращивает его до полного (иначе первый шаг выстрелил бы
       рукой). */
    /* [имя, a, b, доля отрезка от a, радиус (м), группа] */
    const CAPS = [
      ['abd', 'pelvis', 'spine', 0, 0.13, 'T'], ['thx', 'spine', 'chest', 0, 0.145, 'T'], ['up', 'chest', 'neck', 0, 0.11, 'T'],
      ['sh', 'chestR', 'chestL', 0, 0.075, 'T'], ['hips', 'hipR', 'hipL', 0, 0.09, 'T'], ['head', 'head', 'headTop', 0, 0.1, 'H'],
      /* v13: передняя часть корпуса с плитоноской и подсумками. Ось thx
         идёт по позвоночнику, и спереди ~6 см жилета не были закрыты —
         руки мёртвого «тонули» в груди. */
      ['thxF', 'chestF', 'spine', 0, 0.095, 'T']
    ];
    for (const S of ['R', 'L']) CAPS.push(
      ['uarm' + S, 'shoulder' + S, 'elbow' + S, 0.35, 0.05, 'A' + S], ['farm' + S, 'elbow' + S, 'wrist' + S, 0, 0.042, 'A' + S],
      ['hand' + S, 'wrist' + S, 'hand' + S, 0, 0.035, 'A' + S],
      ['thigh' + S, 'hip' + S, 'knee' + S, 0.3, 0.075, 'L' + S], ['shin' + S, 'knee' + S, 'ankle' + S, 0, 0.055, 'L' + S],
      ['foot' + S, 'ankle' + S, 'toe' + S, 0, 0.04, 'L' + S]);
    const CAPI = {};
    CAPS.forEach((c, i) => { CAPI[c[0]] = i; });
    /* пары, которые реально сталкиваются; смежные по суставу исключены */
    const CAP_PAIRS = (() => {
      const P = [], add = (a, b) => P.push(CAPI[a], CAPI[b]);
      const trunk = ['abd', 'thx', 'up', 'sh', 'hips', 'head', 'thxF'];
      for (const S of ['R', 'L']) {
        const O = S === 'R' ? 'L' : 'R';
        /* рука о корпус: плечо — не о плечевой пояс и верх груди (сустав) */
        for (const t of trunk) {
          if (!(t === 'up' || t === 'sh')) add('uarm' + S, t);
          add('farm' + S, t); add('hand' + S, t);
        }
        /* нога о корпус: бедро — только о грудь и голову (с тазом — сустав) */
        for (const t of ['thx', 'up', 'sh', 'head', 'thxF']) add('thigh' + S, t);
        for (const t of trunk) { add('shin' + S, t); add('foot' + S, t); }
        /* рука о ноги и о другую руку */
        for (const l of ['thigh', 'shin', 'foot']) for (const a of ['farm', 'hand', 'uarm']) add(a + S, l + 'R'), add(a + S, l + 'L');
        if (S === 'R') for (const a of ['uarm', 'farm', 'hand']) for (const b of ['uarm', 'farm', 'hand']) add(a + 'R', b + 'L');
        /* ноги друг о друга */
        if (S === 'R') for (const a of ['thigh', 'shin', 'foot']) for (const b of ['thigh', 'shin', 'foot']) add(a + 'R', b + 'L');
      }
      return Int16Array.from(P);
    })();
    function buildCaps(p, k) {
      const NP = CAP_PAIRS.length / 2, cd = new Float32Array(NP), ia = new Int16Array(CAPS.length), ib = new Int16Array(CAPS.length);
      const t0 = new Float32Array(CAPS.length), rad = new Float32Array(CAPS.length);
      CAPS.forEach((c, i) => { ia[i] = PI[c[1]]; ib[i] = PI[c[2]]; t0[i] = c[3]; rad[i] = c[4] * k; });
      const C = { ia, ib, t0, rad, cd, pen: 0 };
      for (let n = 0; n < NP; n++) {
        const A = CAP_PAIRS[n * 2], B = CAP_PAIRS[n * 2 + 1];
        const d = capDist(p, C, A, B);
        /* зазор в момент гибели (если меньше полного) — стартовая дистанция */
        cd[n] = Math.min(rad[A] + rad[B], Math.max(0, d) * 0.98);
      }
      return C;
    }
    /* ближайшие точки двух отрезков (Ericson, RTCD 5.1.9); результат в _cq */
    const _cq = { s: 0, t: 0, d: 0, nx: 0, ny: 0, nz: 0 };
    function capDist(p, C, A, B) {
      const a0 = C.ia[A] * 3, a1 = C.ib[A] * 3, b0 = C.ia[B] * 3, b1 = C.ib[B] * 3, ta = C.t0[A], tb = C.t0[B];
      const ax = p[a0] + (p[a1] - p[a0]) * ta, ay = p[a0 + 1] + (p[a1 + 1] - p[a0 + 1]) * ta, az = p[a0 + 2] + (p[a1 + 2] - p[a0 + 2]) * ta;
      const bx = p[b0] + (p[b1] - p[b0]) * tb, by = p[b0 + 1] + (p[b1 + 1] - p[b0 + 1]) * tb, bz = p[b0 + 2] + (p[b1 + 2] - p[b0 + 2]) * tb;
      const d1x = p[a1] - ax, d1y = p[a1 + 1] - ay, d1z = p[a1 + 2] - az;
      const d2x = p[b1] - bx, d2y = p[b1 + 1] - by, d2z = p[b1 + 2] - bz;
      const rx = ax - bx, ry = ay - by, rz = az - bz;
      const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
      let s, t;
      if (a < 1e-9 && e < 1e-9) { s = 0; t = 0; }
      else if (a < 1e-9) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
      else {
        const c = d1x * rx + d1y * ry + d1z * rz;
        if (e < 1e-9) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
        else {
          const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
          s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
          t = (b * s + f) / e;
          if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
          else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
        }
      }
      const nx = ax + d1x * s - (bx + d2x * t), ny = ay + d1y * s - (by + d2y * t), nz = az + d1z * s - (bz + d2z * t);
      const d = Math.hypot(nx, ny, nz);
      _cq.s = ta + (1 - ta) * s; _cq.t = tb + (1 - tb) * t; _cq.d = d; _cq.nx = nx; _cq.ny = ny; _cq.nz = nz;
      return d;
    }
    /* v16: шарниры колена и голеностопа.
       Колено — блоковый сустав: голень сгибается только назад (0…150°),
       переразгиб ≤5°, вбок — не больше ~25° (с учётом ротации бедра).
       Голеностоп: носок всегда впереди голени — тыльное сгибание ≤20°,
       подошвенное ≤50° от нейтрали, вбок ≤25° (стопа не выворачивается
       пяткой вперёд). Прежде частицы ноги держали только расстояния, и
       голень/стопа могли провернуться на 180° («пластилин», скрины 4–5).
       Почему теперь не раскачивается (прежние попытки — см. ниже): ось
       шарнира берётся по тазу (hipR−hipL) и бедру, а поправка двигает
       ТОЛЬКО дистальные частицы (лодыжку с носком, затем носок) — ось
       от поправки не меняется, обратной связи «поправка → ось» нет; есть
       мёртвая зона (внутри пределов поправки нет) и предел шага 2 см. */
    const KN_LAT = Math.sin(25 * Math.PI / 180), KN_LO = -5 * Math.PI / 180, KN_HI = 150 * Math.PI / 180;
    const FT_LAT = Math.sin(25 * Math.PI / 180);
    /* угол «голеностоп→носок» к перпендикуляру голени, рад: в нейтрали
       (стоя) ≈0,30 (носок ниже лодыжки); −20° тыльного … +50° подошвенного */
    let FT_LO = -0.08, FT_HI = 1.2;
    const LEGI = [];
    for (const S of ['R', 'L']) LEGI.push([PI['hip' + S] * 3, PI['knee' + S] * 3, PI['ankle' + S] * 3, PI['toe' + S] * 3]);
    function nearestIn(th, lo, hi) {
      if (th >= lo && th <= hi) return th;
      const w = (x) => { x = Math.abs(x) % (2 * Math.PI); return x > Math.PI ? 2 * Math.PI - x : x; };
      return w(th - lo) <= w(th - hi) ? lo : hi;
    }
    /* Joint limits are unilateral angle constraints, not a motor that forces
       the calf into the pelvis' plane. A hip may rotate while the boot is
       planted; moving only ankle/toe in that case used to launch the body.
       The PBD gradient distributes each correction over all three joints. */
    function legHinge(R, strength) {
      const p = R.p;
      const angleLimit = (ai, bi, ci, lo, hi) => {
        let ux = p[ai] - p[bi], uy = p[ai + 1] - p[bi + 1], uz = p[ai + 2] - p[bi + 2];
        let vx = p[ci] - p[bi], vy = p[ci + 1] - p[bi + 1], vz = p[ci + 2] - p[bi + 2];
        const la = Math.hypot(ux, uy, uz), lc = Math.hypot(vx, vy, vz);
        if (la < 1e-5 || lc < 1e-5) return;
        ux /= la; uy /= la; uz /= la; vx /= lc; vy /= lc; vz /= lc;
        const co = clamp(ux * vx + uy * vy + uz * vz, -0.9999, 0.9999);
        const theta = Math.acos(co), target = clamp(theta, lo, hi);
        if (Math.abs(theta - target) < 1e-5) return;
        const sn = Math.sqrt(1 - co * co);
        const ax = (co * ux - vx) / (la * sn), ay = (co * uy - vy) / (la * sn), az = (co * uz - vz) / (la * sn);
        const cx = (co * vx - ux) / (lc * sn), cy = (co * vy - uy) / (lc * sn), cz = (co * vz - uz) / (lc * sn);
        const bx = -ax - cx, by = -ay - cy, bz = -az - cz;
        const den = ax * ax + ay * ay + az * az + bx * bx + by * by + bz * bz + cx * cx + cy * cy + cz * cz;
        let lam = -(theta - target) * strength / Math.max(den, 1e-9);
        const peak = Math.max(Math.hypot(ax, ay, az), Math.hypot(bx, by, bz), Math.hypot(cx, cy, cz));
        lam = clamp(lam, -0.004 / peak, 0.004 / peak);
        p[ai] += ax * lam; p[ai + 1] += ay * lam; p[ai + 2] += az * lam;
        p[bi] += bx * lam; p[bi + 1] += by * lam; p[bi + 2] += bz * lam;
        p[ci] += cx * lam; p[ci + 1] += cy * lam; p[ci + 2] += cz * lam;
      };
      for (const [hi, ki, ai, ti] of LEGI) {
        angleLimit(hi, ki, ai, 30 * DEG, 177 * DEG);
        angleLimit(ki, ai, ti, 40 * DEG, 115 * DEG);
      }
    }
    function capsuleCollide(R) {
      const C = R.cap; if (!C) return;
      const p = R.p, NP = C.cd.length;
      let pen = 0;
      for (let n = 0; n < NP; n++) {
        const A = CAP_PAIRS[n * 2], B = CAP_PAIRS[n * 2 + 1];
        const full = C.rad[A] + C.rad[B];
        let m = C.cd[n];
        const d = capDist(p, C, A, B);
        /* храповик: разошлись — дистанция контакта растёт до полной */
        if (d > m) { if (m < full) C.cd[n] = Math.min(full, d); continue; }
        /* v13: начальное взаимопроникновение (рука на цевье у груди) не
           остаётся навсегда: дистанция контакта плавно (~6 см/с) растёт
           до полной — конечность мягко выходит из корпуса без выстрела */
        if (m < full) { m = Math.min(full, m + 0.00035); C.cd[n] = m; }
        if (d < 1e-6) continue;
        const s = _cq.s, t = _cq.t, c = m - d;
        if (c > pen) pen = c;
        /* обобщённые обратные массы точек на отрезках (массы частиц равны) */
        const wa = (1 - s) * (1 - s) + s * s, wb = (1 - t) * (1 - t) + t * t;
        const lam = c / (wa + wb) / d;
        const nx = _cq.nx * lam, ny = _cq.ny * lam, nz = _cq.nz * lam;
        const a0 = C.ia[A] * 3, a1 = C.ib[A] * 3, b0 = C.ia[B] * 3, b1 = C.ib[B] * 3;
        p[a0] += nx * (1 - s); p[a0 + 1] += ny * (1 - s); p[a0 + 2] += nz * (1 - s);
        p[a1] += nx * s; p[a1 + 1] += ny * s; p[a1 + 2] += nz * s;
        p[b0] -= nx * (1 - t); p[b0 + 1] -= ny * (1 - t); p[b0 + 2] -= nz * (1 - t);
        p[b1] -= nx * t; p[b1 + 1] -= ny * t; p[b1 + 2] -= nz * t;
      }
      C.pen = pen;
    }
    function sim(s, dt) {
      const R = s.rd, p = R.p, pp = R.pp, r = R.r, N = PDEF.length;
      const ground = (x, z) => (s.ctrl.groundAt ? s.ctrl.groundAt(x, z) : 0);
      /* v14: агония после падения — медленные движения: шаг вдвое крупнее
         (1/90 с) — вдвое дешевле для слабых ПК. Скорости (разность позиций
         Верле) пересчитываются при смене шага. */
      const HH = R.lowRate ? H0 * 2 : H0;
      if (R._h && R._h !== HH) { const k = HH / R._h; for (let i = 0; i < p.length; i++) pp[i] = p[i] - (p[i] - pp[i]) * k; }
      R._h = HH;
      R.acc = (R.acc || 0) + Math.min(dt, 0.05);
      const n = Math.min(9, Math.floor(R.acc / HH)), h = HH;
      R.acc -= n * HH;
      if (n <= 0) return;
      const dbg = R.dbg || (typeof window !== 'undefined' && window.__RAGDBG) || {};
      /* после падения (≈1,8 с) тело быстро гасит остаточное движение:
         мышцы и одежда — сильное трение, ползти по грунту оно не должно */
      /* одежда, снаряжение и мышцы гасят движение: тело не «пружинит» */
      const AN = R.anim;
      const tDamp = AN ? AN.dur + 0.4 : 1.6, tD = AN ? R.te : R.t;
      let damp = tD > tDamp ? Math.max(0.88, 0.988 - (tD - tDamp) * 0.05) : 0.988;
      /* жёсткость следования позе: во время падения — высокая, потом
         ≈0,35 с плавно отпускает (тело ложится по грунту) */
      let smA = 0;
      if (AN) {
        const pi3 = PI.pelvis * 3, hp = p[pi3 + 1] - ground(p[pi3], p[pi3 + 2]);
        const fdt = Math.min(dt, 0.05);
        let te = R.te + fdt;
        if (R.te < AN.tc) {
          /* время, при котором таз в форме на 12 см ниже, чем сейчас */
          const want = hp - AN.hOff - 0.12, T = AN.hTab, n = T.length - 1;
          let j = 0;
          while (j < n && T[j + 1] > want) j++;
          const u = j >= n ? 1 : Math.min(1, Math.max(0, (T[j] - want) / Math.max(1e-4, T[j] - T[j + 1])));
          const cap = AN.tc * (j + u) / n;
          te = Math.min(te, Math.max(cap, R.te + fdt * 0.25));
        }
        R.te = te;
        /* v12: тело уже на земле (грудь ниже 0,28 м), а анимация ещё
           «стоит на коленях» — раньше форма продолжала тянуть лежащее тело к
           позе на коленях, и труп секундами перекатывался и ворочался по
           земле. Теперь анимация сразу переходит к позе лёжа. */
        {
          const K = AN.keys, c3 = PI.chest * 3, last = K[K.length - 1].t;
          if (!AN.fallen && !AN.hold && R.te > 0.25 && R.te < last - 0.15 && p[c3 + 1] - ground(p[c3], p[c3 + 2]) < 0.28) {
            AN.fallen = true;
            /* v16: сразу к позе «лёжа» (последний ключ). Прежде — к
               предпоследнему: у knees_hold это «на коленях, согнувшись», и
               сопоставление форм поднимало упавшее тело обратно на колени */
            R.te = Math.max(R.te, K[K.length - 2].t, K[K.length - 1].t - 0.3);
          }
        }
        smA = R.te < AN.dur ? AN.alpha : AN.alpha * Math.exp(-(R.te - AN.dur) / 0.35);
        if (R.te > AN.dur + 2.2) smA = 0;
        /* v8: сидит, прислонившись к стволу — форма держится слабее, но
           не отпускается: тело опирается спиной о дерево и не валится */
        if (AN.hold && AN.trunk) {
          /* опора есть, пока грудь у ствола (≤ 0,55 м от коры) и выше 0,35 м */
          const c3 = PI.chest * 3, dxc = p[c3] - AN.trunk.x, dzc = p[c3 + 2] - AN.trunk.z;
          const ok = Math.hypot(dxc, dzc) - AN.trunk.r < 0.55 && p[c3 + 1] - ground(p[c3], p[c3 + 2]) > 0.35;
          if (!ok && R.te > AN.dur * 0.8) { AN.hold = false; AN.anc = null; }
          else {
            smA = Math.max(smA, AN.alpha * 0.45);
            /* якорь ставится, когда спина легла на ствол (конец анимации) */
            if (!AN.anc && R.te > AN.dur * 0.85) {
              AN.anc = [];
              for (const nm of ['chest', 'neck', 'pelvis']) { const i = PI[nm]; AN.anc.push(i, p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); }
            } else if (AN.anc) {
              /* тело сползает по коре: якорь медленно опускается */
              for (let k = 0; k < AN.anc.length; k += 4) {
                const i = AN.anc[k], g = ground(AN.anc[k + 1], AN.anc[k + 3]);
                if (i !== PI.pelvis) AN.anc[k + 2] = Math.max(g + (i === PI.neck ? 0.62 : 0.45), AN.anc[k + 2] - fdt * 0.03);
                /* сильный толчок (попадание, взрыв) срывает тело с опоры */
                if (Math.hypot(p[i * 3] - AN.anc[k + 1], p[i * 3 + 2] - AN.anc[k + 3]) > 0.35) { AN.hold = false; AN.anc = null; break; }
              }
            }
          }
        }
        /* v16: колени коснулись грунта — голени и стопы дальше лежат сами
           (вес и трение), из сопоставления форм их убираем. Иначе форма
           «на коленях» поворачивалась целиком вместе с корпусом, и при
           падении ничком голени со стопами задирались вверх выше таза —
           тело кувыркалось «скорпионом» */
        if (!R.ankFree && !dbg.noAnkFree) {
          const kr = PI.kneeR * 3, kl = PI.kneeL * 3;
          if (Math.min(p[kr + 1] - ground(p[kr], p[kr + 2]), p[kl + 1] - ground(p[kl], p[kl + 2])) < 0.16) {
            R.ankFree = true;
            const aw = dbg.ankW !== undefined ? dbg.ankW : 0.3;
            R.smw = SMW0.slice(); R.smw[PI.ankleR] *= aw; R.smw[PI.ankleL] *= aw;
          }
        }
        if (smA > 0.002) animTarget(R); else smA = 0;
      }
      /* v12: демпфирование — раздельно для движения центра масс и
         движения частей тела относительно него. Прежнее 0,988 за шаг
         (180 Гц) гасило ВСЮ скорость, в том числе свободное падение:
         предельная скорость ≈4,5 м/с, тело оседало «как в воде», в
         замедленной съёмке. Воздух человека почти не тормозит, а вот
         суставы, мышцы и одежда гасят взаимные движения частей. */
      let dampC = tD > tDamp || dbg.oldDamp ? damp : 0.9993;
      if (h > H0 * 1.5) { damp *= damp; dampC *= dampC; }
      for (let it = 0; it < n; it++) {
        let cvx = 0, cvy = 0, cvz = 0;
        for (let i = 0; i < N; i++) { cvx += p[i * 3] - pp[i * 3]; cvy += p[i * 3 + 1] - pp[i * 3 + 1]; cvz += p[i * 3 + 2] - pp[i * 3 + 2]; }
        cvx /= N; cvy /= N; cvz /= N;
        /* страховка от «катапульты» (см. vAllow): лишняя скорость ЦМ гасится */
        /* v13: после касания грунта коленями/корпусом тело больше не
           разгоняется по горизонтали (только оседает и перекатывается) */
        const chv = Math.hypot(cvx, cvz) / h, VA0 = R.vAllow || 1e9;
        const VA = VA0 < 1e8 && AN && R.te > AN.tc ? Math.min(VA0, R.te > AN.dur ? 0.35 : 0.8) : VA0;
        let ex = 0, ez = 0, ey = 0;
        if (chv > VA) { const q = 1 - VA / chv; ex = cvx * q; ez = cvz * q; }
        if (R.latAx && !dbg.noLat) {
          const la = R.latAx, vl = ((cvx - ex) * la[0] + (cvz - ez) * la[1]) / h, VL = R.vLat;
          if (Math.abs(vl) > VL) { const dv = (vl - Math.sign(vl) * VL) * h; ex += la[0] * dv; ez += la[1] * dv; }
        }
        if (VA < 1e8 && cvy / h > 1.2) ey = cvy - 1.2 * h;
        cvx -= ex; cvy -= ey; cvz -= ez;
        for (let i = 0; i < N; i++) {
          const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
          let vx = x - pp[i * 3] - ex, vy = y - pp[i * 3 + 1] - ey, vz = z - pp[i * 3 + 2] - ez;
          vx = cvx * dampC + (vx - cvx) * damp; vy = cvy * dampC + (vy - cvy) * damp; vz = cvz * dampC + (vz - cvz) * damp;
          /* предел скорости 9 м/с: падающее тело быстрее не движется, а
             случайный конфликт связей не разгоняет частицу */
          const vl = Math.hypot(vx, vy, vz), VM = 9 * h;
          if (vl > VM) { const q = VM / vl; vx *= q; vy *= q; vz *= q; }
          p[i * 3] += vx; p[i * 3 + 1] += vy - 9.81 * h * h; p[i * 3 + 2] += vz;
          pp[i * 3] = x; pp[i * 3 + 1] = y; pp[i * 3 + 2] = z;
        }
        const MOM = dbg.mom && R.latAx ? (R._mom || (R._mom = {})) : null;
        const comL = () => { let x = 0, z = 0; for (let i = 0; i < N; i++) { x += p[i * 3]; z += p[i * 3 + 2]; } return (x * R.latAx[0] + z * R.latAx[1]) / N; };
        let _m0 = MOM ? comL() : 0;
        const momAdd = (k) => { const m1 = comL(); MOM[k] = (MOM[k] || 0) + m1 - _m0; _m0 = m1; };
        if (smA > 0) shapeMatch(R, smA);
        if (MOM) momAdd('sm');
        /* v16: лёг (падение кончилось) — тело больше не кувыркается:
           в агонии ≤1,4 рад/с, у неподвижного тела ≤2 рад/с (перекат
           от добивающего попадания, сползание по склону) */
        if (!dbg.noSpinCap && (!AN || R.te > AN.dur) && R.t > 0.6) capSpin(R, R.ag && R.ag.k > 0.01 ? 1.4 : 2.0, h);
        /* v16: пока идёт анимация смерти (стоя на коленях, оседая) — тело
           не крутится «волчком»: вращение вокруг вертикали ≤ 1,5 рад/с
           (стоя на коленях — ≤ 0,5 рад/с: колени упираются в грунт).
           Наклоны и само падение (вокруг горизонтальных осей) не трогаем */
        else if (!dbg.noSpinCap && R.t > 0.6) capSpin(R, AN && AN.type === 'knees_hold' && !AN.fallen ? 0.5 : 1.5, h, true);
        /* v12: «держится на коленях» — человек в сознании балансирует:
           мышцы удерживают центр масс корпуса над опорой (колени и стопы).
           Без этого поза на коленях опрокидывалась за доли секунды. */
        if (AN && AN.type === 'knees_hold' && !AN.fallen && R.te > AN.keys[2].t && R.te < AN.keys[AN.keys.length - 3].t) {
          let sx = 0, sz = 0, ux = 0, uz = 0;
          for (const nm of ['kneeR', 'kneeL', 'ankleR', 'ankleL']) { sx += p[PI[nm] * 3]; sz += p[PI[nm] * 3 + 2]; }
          const UP = [PI.pelvis, PI.spine, PI.chest, PI.neck, PI.head];
          for (const i of UP) { ux += p[i * 3]; uz += p[i * 3 + 2]; }
          const dx = sx / 4 - ux / UP.length, dz = sz / 4 - uz / UP.length, dl = Math.hypot(dx, dz);
          /* в пределах ~12 см — равновесие, дальше мягко возвращается */
          if (dl > 0.12) {
            const k = Math.min(0.004, (dl - 0.12) * 0.03) / dl;
            const BN = ['pelvis', 'spine', 'chest', 'chestR', 'chestL', 'chestF', 'neck', 'head', 'headTop', 'nose', 'shoulderR', 'shoulderL'];
            for (const nm of BN) {
              const i = PI[nm] * 3; p[i] += dx * k; p[i + 2] += dz * k;
            }
            /* v16: равновесие — это мышцы, т. е. внутренняя сила: корпус
               смещается над коленями, а колени и голени — чуть навстречу,
               общий центр масс стоит. Прежде корпус только «догонял»
               опору, опора уезжала следом — тело ползло на коленях на 3–4 м */
            if (!dbg.balFree) {
              const kk = -k * BN.length / (N - BN.length);
              for (let i = 0; i < N; i++) if (!BN.some((nm) => PI[nm] === i)) { p[i * 3] += dx * kk; p[i * 3 + 2] += dz * kk; }
            }
          }
        }
        if (MOM) momAdd('bal');
        if (AN && (AN.reach || AN.clutch)) armReflex(R, AN, ground, h);
        if (MOM) momAdd('arm');
        if (R.ag && R.ag.k > 0.01 && !s.finished && !s.unconscious && !(s.dmg && s.dmg.ph && (s.dmg.ph.dead || s.dmg.ph.unc)) && !dbg.noAgony) agonyDrive(R, ground, h, it === 0 ? Math.min(dt, 0.05) : 0);
        if (MOM) momAdd('ag');
        /* тонус: корпус держится toneT, ноги — втрое меньше; затем
           плавно (≈0,25 с) отпускает */
        const tt = R.t, T0 = R.toneT || 0;
        const tone1 = T0 > 0 ? Math.exp(-Math.max(0, tt - T0) / 0.25) * (tt < T0 ? 1 : 1) : 0;
        const tone2 = T0 > 0 ? Math.exp(-Math.max(0, tt - T0 * 0.3) / 0.15) : 0;
        for (let k2 = 0; k2 < 8; k2++) {
          for (const c of R.C) {
            const i = c[0], j = c[1];
            let st = c[4];
            if (c[5]) { st *= c[5] === 1 ? tone1 : tone2; if (st < 0.003) continue; }
            const dx = p[j * 3] - p[i * 3], dy = p[j * 3 + 1] - p[i * 3 + 1], dz = p[j * 3 + 2] - p[i * 3 + 2];
            const d = Math.hypot(dx, dy, dz) || 1e-6;
            let tgt = d;
            if (d < c[2]) tgt = c[2]; else if (d > c[3]) tgt = c[3]; else continue;
            const corr = (d - tgt) / d * 0.5 * st;
            p[i * 3] += dx * corr; p[i * 3 + 1] += dy * corr; p[i * 3 + 2] += dz * corr;
            p[j * 3] -= dx * corr; p[j * 3 + 1] -= dy * corr; p[j * 3 + 2] -= dz * corr;
          }
          /* v16: шарнир колена и голеностопа (legHinge) — пределы по
             данным ортопедии (AAOS): колено 0…150° сгибания без
             переразгиба, боковой люфт ≤25°; стопа 20° тыльного / 50°
             подошвенного сгибания. В отличие от прежних попыток v12 ось
             берётся из самого бедра и голени (не из носка или таза), а
             поправка двигает только дистальную точку и ограничена 2 см
             за итерацию, поэтому раскачки нет: тело больше не
             «пластилиновое» (стопа и колено на 180° в агонии). */
          if (!dbg.noHinge) legHinge(R, 0.5);
          /* руки и ноги не проходят сквозь корпус и друг сквозь друга */
          if (!dbg.noCaps && (k2 & 1)) capsuleCollide(R);
          /* прежний упрощённый вариант (точка против сферы) — заменён капсулами */
          if (dbg.armPush) for (const bi of [PI.chest, PI.pelvis]) {
            const rr = bi === PI.chest ? 0.15 : 0.13;
            for (const nm of ['elbowR', 'elbowL', 'wristR', 'wristL', 'handR', 'handL']) {
              const i = PI[nm];
              const dx = p[i * 3] - p[bi * 3], dy = p[i * 3 + 1] - p[bi * 3 + 1], dz = p[i * 3 + 2] - p[bi * 3 + 2];
              const d = Math.hypot(dx, dy, dz);
              const m = rr * R.kScale + r[i];
              if (d < m && d > 1e-5) { const c3 = (m - d) / d; p[i * 3] += dx * c3; p[i * 3 + 1] += dy * c3; p[i * 3 + 2] += dz * c3; }
            }
          }
          /* грунт с трением */
          for (let i = 0; i < N; i++) {
            const gy = ground(p[i * 3], p[i * 3 + 2]) + r[i] * 0.8;
            if (p[i * 3 + 1] < gy) {
              if (!R.landed && (i === PI.chest || i === PI.chestF) && pp[i * 3 + 1] - p[i * 3 + 1] > -0.004) {
                const v = Math.hypot(p[i * 3] - pp[i * 3], p[i * 3 + 1] - pp[i * 3 + 1], p[i * 3 + 2] - pp[i * 3 + 2]) / h;
                if (v > 0.6) { R.landed = true; if (o.sound) o.sound('fall', V().set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]), Math.min(1, v / 3), s); }
              }
              p[i * 3 + 1] = gy;
              /* Неупругое касание: нормальная скорость гасится,
                 коррекция проникновения не становится отскоком. */
              pp[i * 3 + 1] = gy;
              pp[i * 3] += (p[i * 3] - pp[i * 3]) * 0.55;
              pp[i * 3 + 2] += (p[i * 3 + 2] - pp[i * 3 + 2]) * 0.55;
            }
          }
          /* v8: стволы и предметы — выталкивание с трением */
          if (R.obst && R.obst.length) for (const ob of R.obst) {
            const c = ob.c;
            for (let i = 0; i < N; i++) {
              const ri = r[i] * 0.9, y = p[i * 3 + 1];
              if (y - ri > ob.top) continue;
              if (c.type === 'cyl') {
                const dx = p[i * 3] - c.x, dz = p[i * 3 + 2] - c.z, d = Math.hypot(dx, dz), m = c.r + ri;
                if (d >= m || d < 1e-5) continue;
                /* низкий предмет — тело ложится сверху, высокий — упирается */
                if (ob.top - (y - ri) < 0.12 && ob.top - (y - ri) < m - d) { p[i * 3 + 1] = ob.top + ri; pp[i * 3] += (p[i * 3] - pp[i * 3]) * 0.5; pp[i * 3 + 2] += (p[i * 3 + 2] - pp[i * 3 + 2]) * 0.5; continue; }
                const q = (m - d) / d;
                p[i * 3] += dx * q; p[i * 3 + 2] += dz * q;
                pp[i * 3 + 1] += (p[i * 3 + 1] - pp[i * 3 + 1]) * 0.35;
              } else {
                const x = p[i * 3], z = p[i * 3 + 2];
                if (x < c.x0 - ri || x > c.x1 + ri || z < c.z0 - ri || z > c.z1 + ri) continue;
                const toL = x - (c.x0 - ri), toR = (c.x1 + ri) - x, toB = z - (c.z0 - ri), toF = (c.z1 + ri) - z, toT = ob.top + ri - y;
                const mm = Math.min(toL, toR, toB, toF, toT);
                if (mm === toT) { p[i * 3 + 1] = ob.top + ri; pp[i * 3] += (x - pp[i * 3]) * 0.5; pp[i * 3 + 2] += (z - pp[i * 3 + 2]) * 0.5; }
                else if (mm === toL) p[i * 3] = c.x0 - ri; else if (mm === toR) p[i * 3] = c.x1 + ri;
                else if (mm === toB) p[i * 3 + 2] = c.z0 - ri; else p[i * 3 + 2] = c.z1 + ri;
              }
            }
          }
          /* v8: опора о ствол — трение коры держит грудь и шею там, где
             они легли на ствол; сползание вниз медленное (до 0,45 м) */
          /* пока сползает — спину прижимает к стволу (корпус откинут
             назад, вес давит на кору) */
          if (AN && AN.hold && !AN.anc && AN.trunk) {
            const T = AN.trunk;
            for (const nm of ['chest', 'neck']) {
              const i = PI[nm], dx = T.x - p[i * 3], dz = T.z - p[i * 3 + 2], d = Math.hypot(dx, dz) || 1, gap = d - T.r - 0.17;
              if (gap > 0) { const k = Math.min(gap, 0.004) / d; p[i * 3] += dx * k; p[i * 3 + 2] += dz * k; }
            }
          }
          if (AN && AN.hold && AN.anc) {
            const A = AN.anc;
            for (let k = 0; k < A.length; k += 4) {
              const i = A[k];
              p[i * 3] += (A[k + 1] - p[i * 3]) * 0.12;
              p[i * 3 + 2] += (A[k + 3] - p[i * 3 + 2]) * 0.12;
              /* таз по высоте свободен — садится на землю (или корень) сам */
              if (i !== PI.pelvis && p[i * 3 + 1] < A[k + 2]) p[i * 3 + 1] += (A[k + 2] - p[i * 3 + 1]) * 0.12;
            }
          }
        }
        /* v16: лежащее тело не ползёт по земле. Трение покоя одежды о
           грунт (μ ≈ 0,5–0,7) гасит скольжение центра масс; без него
           толчки связей и судороги понемногу «перекатывали» тело на
           1–3 м за несколько секунд. Повороты частей вокруг центра масс
           не трогаем — дёргаться в агонии тело может */
        if (!dbg.noFric && R.t > 0.8) {
          const c3 = PI.chest * 3, l3 = PI.pelvis * 3;
          if (!dbg.noLegDrop && p[c3 + 1] - ground(p[c3], p[c3 + 2]) < 0.32) {
            /* v16: у лежащего ноги не «стоят» вверх («скорпион», стойка на
               плечах): обмякшие мышцы не держат голень выше ~0,4 м —
               стопа мягко опускается под собственным весом */
            for (const [ai, ti] of [[PI.ankleR * 3, PI.toeR * 3], [PI.ankleL * 3, PI.toeL * 3]]) {
              const a = p[ai + 1] - ground(p[ai], p[ai + 2]);
              if (a > 0.4) { const dy = Math.min(0.006, (a - 0.4) * 0.06); p[ai + 1] -= dy; p[ti + 1] -= dy; }
            }
        }
          if (p[c3 + 1] - ground(p[c3], p[c3 + 2]) < 0.32 && p[l3 + 1] - ground(p[l3], p[l3 + 2]) < 0.3) {
            let vx = 0, vz = 0;
            for (let i = 0; i < N; i++) { vx += p[i * 3] - pp[i * 3]; vz += p[i * 3 + 2] - pp[i * 3 + 2]; }
            const kf = (1 - Math.exp(-14 * h)) / N;
            vx *= kf; vz *= kf;
            for (let i = 0; i < N; i++) { pp[i * 3] += vx; pp[i * 3 + 2] += vz; }
          }
        }
        if (MOM) momAdd('con');
        /* автомат */
        const G = R.gun;
        if (G) {
          const gp = G.p, gpp = G.pp, NG = G.n;
          for (let i = 0; i < NG; i++) {
            const x = gp[i * 3], y = gp[i * 3 + 1], z = gp[i * 3 + 2];
            let vx = (x - gpp[i * 3]) * 0.99, vy = (y - gpp[i * 3 + 1]) * 0.99, vz = (z - gpp[i * 3 + 2]) * 0.99;
            const vl = Math.hypot(vx, vy, vz), VM = 9 * h;
            if (vl > VM) { const q = VM / vl; vx *= q; vy *= q; vz *= q; }
            gp[i * 3] += vx; gp[i * 3 + 1] += vy - 9.81 * h * h; gp[i * 3 + 2] += vz;
            gpp[i * 3] = x; gpp[i * 3 + 1] = y; gpp[i * 3 + 2] = z;
          }
          const hold = R.t < G.grip, hI = PI.handR;
          for (let k2 = 0; k2 < 6; k2++) {
            for (const [a, b, L] of G.pairs) {
              const dx = gp[b * 3] - gp[a * 3], dy = gp[b * 3 + 1] - gp[a * 3 + 1], dz = gp[b * 3 + 2] - gp[a * 3 + 2];
              const d = Math.hypot(dx, dy, dz) || 1e-6, c2 = (d - L) / d * 0.5;
              gp[a * 3] += dx * c2; gp[a * 3 + 1] += dy * c2; gp[a * 3 + 2] += dz * c2;
              gp[b * 3] -= dx * c2; gp[b * 3 + 1] -= dy * c2; gp[b * 3 + 2] -= dz * c2;
            }
            /* кисть ещё держит рукоятку */
            /* v12: все связи «автомат — тело» распределяют поправку по
               массам (частица тела ≈2,4 кг, точка автомата ≈0,9 кг: доли
               0,27 / 0,73) и всегда с противодействием. Прежде кисть
               тянулась к рукоятке с 0,3, рукоятка к кисти — с 0,4, а
               выталкивание автомата из корпуса не давало отдачи телу:
               автомат «отпихивался» от тела, кисть тянула тело за ним —
               замкнутый «вечный двигатель», который за долю секунды хвата
               разгонял труп до 9 м/с и отбрасывал на несколько метров даже
               от пистолетной пули. Кисть отпускает рукоятку, если её
               отрывает дальше 0,2 м. */
            if (hold) {
              const dx = gp[9] - p[hI * 3], dy = gp[10] - p[hI * 3 + 1], dz = gp[11] - p[hI * 3 + 2];
              if (dx * dx + dy * dy + dz * dz > 0.04) G.grip = 0;
              else {
                gp[9] -= dx * 0.51; gp[10] -= dy * 0.51; gp[11] -= dz * 0.51;
                p[hI * 3] += dx * 0.19; p[hI * 3 + 1] += dy * 0.19; p[hI * 3 + 2] += dz * 0.19;
              }
            }
            /* ремень: середина автомата не дальше G.rope от груди */
            const cI = PI.chest;
            const mx = (gp[0] + gp[3]) / 2, my = (gp[1] + gp[4]) / 2, mz = (gp[2] + gp[5]) / 2;
            const dx = mx - p[cI * 3], dy = my - p[cI * 3 + 1], dz = mz - p[cI * 3 + 2];
            const d = Math.hypot(dx, dy, dz);
            if (d > G.rope) {
              const c2 = (d - G.rope) / d;
              /* 4 точки автомата (3,6 кг) против груди (2,4 кг): 0,4 / 0,6 */
              for (let i = 0; i < NG; i++) { gp[i * 3] -= dx * c2 * 0.4; gp[i * 3 + 1] -= dy * c2 * 0.4; gp[i * 3 + 2] -= dz * c2 * 0.4; }
              p[cI * 3] += dx * c2 * 0.6; p[cI * 3 + 1] += dy * c2 * 0.6; p[cI * 3 + 2] += dz * c2 * 0.6;
            }
            /* не сквозь корпус */
            for (let i = 0; i < NG; i++) for (const bi of [PI.chest, PI.pelvis, PI.spine]) {
              const ex = gp[i * 3] - p[bi * 3], ey = gp[i * 3 + 1] - p[bi * 3 + 1], ez = gp[i * 3 + 2] - p[bi * 3 + 2];
              const e = Math.hypot(ex, ey, ez), m = 0.14 * R.kScale;
              if (e < m && e > 1e-5) {
                /* не больше 3 мм за итерацию: автомат, начавший внутри корпуса
                   (прижат к груди), выходит плавно, а не выстреливает */
                const c3 = Math.min(m - e, 0.003) / e;
                gp[i * 3] += ex * c3 * 0.73; gp[i * 3 + 1] += ey * c3 * 0.73; gp[i * 3 + 2] += ez * c3 * 0.73;
                p[bi * 3] -= ex * c3 * 0.27; p[bi * 3 + 1] -= ey * c3 * 0.27; p[bi * 3 + 2] -= ez * c3 * 0.27;
              }
            }
            for (let i = 0; i < NG; i++) {
              const gy = ground(gp[i * 3], gp[i * 3 + 2]) + 0.022;
              if (gp[i * 3 + 1] < gy) {
                if (!G.landed && gpp[i * 3 + 1] - gp[i * 3 + 1] > 0.004) { G.landed = true; if (o.sound) o.sound('gun', V().set(gp[i * 3], gp[i * 3 + 1], gp[i * 3 + 2]), 1, s); }
                gp[i * 3 + 1] = gy;
                gpp[i * 3 + 1] = gy;
                gpp[i * 3] += (gp[i * 3] - gpp[i * 3]) * 0.7;
                gpp[i * 3 + 2] += (gp[i * 3 + 2] - gpp[i * 3 + 2]) * 0.7;
              }
            }
          }
        }
        if (MOM) momAdd('gun');
      }
      /* сон */
      let mv = 0;
      for (let i = 0; i < N * 3; i++) mv = Math.max(mv, Math.abs(p[i] - pp[i]));
      /* Покой тела на опоре. На плотном контакте жёстких суставов
         остаётся численный шум 0,02–0,09 м/с: он не должен бесконечно
         будить труп. Живой раненый, активная анимация и скольжение спать
         не могут. Импульс нового попадания сбрасывает sleep. */
      const conscious = R.ag && R.ag.k > 0.02 && !s.finished && !s.unconscious
        && !(s.dmg && s.dmg.ph && (s.dmg.ph.dead || s.dmg.ph.unc));
      const c3 = PI.chest * 3, pe3 = PI.pelvis * 3;
      const supported = p[c3 + 1] - ground(p[c3], p[c3 + 2]) < 0.36
        || p[pe3 + 1] - ground(p[pe3], p[pe3 + 2]) < 0.25;
      let gv = 0;
      if (R.gun) for (let j = 0; j < R.gun.p.length; j++) gv = Math.max(gv, Math.abs(R.gun.p[j] - R.gun.pp[j]) / h);
      const passive = !conscious && R.t > 2.5 && (!AN || R.te > AN.dur + 2.4);
      const quiet = mv / h < (passive && supported ? 0.12 : 0.02) && gv < 0.2;
      R.sleep = quiet ? R.sleep + dt : 0;
      if (passive && R.sleep >= 1.2) {
        pp.set(p);
        if (R.gun) R.gun.pp.set(R.gun.p);
      }
    }

    /* частицы -> кости */
    const _x = V(), _y = V(), _z = V(), _mb = new THREE.Matrix4();
    function frame(R, a, b, c, useY) {
      /* x — от a к b, y — к c (ортогонализовано) */
      const p = R.p, P = (i, v) => v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      P(PI[b], _x).sub(P(PI[a], _a)).normalize();
      P(PI[c], _y).sub(_a);
      if (useY) {
        /* y — главная ось (a→c), x — вторичная (a→b) */
        _y.normalize();
        _x.addScaledVector(_y, -_x.dot(_y)).normalize();
        _z.crossVectors(_x, _y);
      } else {
        _y.addScaledVector(_x, -_y.dot(_x)).normalize();
        _z.crossVectors(_x, _y);
      }
      return new THREE.Quaternion().setFromRotationMatrix(_mb.makeBasis(_x, _y, _z));
    }
    function framePts(p, ia, ib, ic, useY) {
      const R = { p };
      return frame(R, ia, ib, ic, useY);
    }
    function poseFromParticles(s) {
      const R = s.rd, ch = s.char, b = (n) => ch.bone(n);
      if (!R.F0) {
        R.F0 = { low: framePts(R.P0.p, 'hipL', 'hipR', 'spine'), up: framePts(R.P0.p, 'chestL', 'chestR', 'neck'), head: framePts(R.P0.p, 'neck', 'nose', 'headTop', true) };
      }
      const Fl = frame(R, 'hipL', 'hipR', 'spine'), Fu = frame(R, 'chestL', 'chestR', 'neck'), Fh = frame(R, 'neck', 'nose', 'headTop', true);
      const Dl = Fl.multiply(_q.copy(R.F0.low).invert());
      const Du = Fu.multiply(_q.copy(R.F0.up).invert());
      const Dh = Fh.multiply(_q.copy(R.F0.head).invert());
      const Q = {};
      Q.hips = Dl.clone().multiply(R.Q0.hips);
      Q.spine = Dl.clone().slerp(Du, 0.5).multiply(R.Q0.spine);
      Q.chest = Du.clone().multiply(R.Q0.chest);
      Q.neck = Du.clone().slerp(Dh, 0.5).multiply(R.Q0.neck);
      Q.head = Dh.clone().multiply(R.Q0.head);
      const rootW = b('root').parent.getWorldQuaternion(new THREE.Quaternion()).multiply(b('root').quaternion);
      const setLocal = (n, parentQ, wq) => { b(n).quaternion.copy(_q2.copy(parentQ).invert().multiply(wq)); };
      setLocal('hips', rootW, Q.hips);
      /* таз — в позицию частицы */
      const pv = PI.pelvis;
      const hp = V().set(R.p[pv * 3], R.p[pv * 3 + 1], R.p[pv * 3 + 2]);
      b('root').updateMatrixWorld(true);
      b('hips').position.copy(b('root').worldToLocal(hp));
      setLocal('spine', Q.hips, Q.spine);
      setLocal('chest', Q.spine, Q.chest);
      setLocal('neck', Q.chest, Q.neck);
      setLocal('head', Q.neck, Q.head);
      /* конечности: перенос с родителем + минимальный доворот по направлению */
      const P = (nm, v) => v.set(R.p[PI[nm] * 3], R.p[PI[nm] * 3 + 1], R.p[PI[nm] * 3 + 2]);
      const P0 = (nm, v) => v.set(R.P0.p[PI[nm] * 3], R.P0.p[PI[nm] * 3 + 1], R.P0.p[PI[nm] * 3 + 2]);
      const limb = (bone, parentName, parentQ, from, to) => {
        const Dp = parentQ.clone().multiply(_q.copy(R.Q0[parentName]).invert());
        const v0 = P0(to, _a).sub(P0(from, _b)).applyQuaternion(Dp).normalize();
        const v1 = P(to, _c).sub(P(from, _d)).normalize();
        const w = new THREE.Quaternion().setFromUnitVectors(v0, v1).multiply(Dp).multiply(R.Q0[bone]);
        setLocal(bone, parentQ, w);
        return w;
      };
      for (const S of ['R', 'L']) {
        const clavQ = Q.chest.clone().multiply(b('clav' + S).quaternion);
        const qs = limb('shoulder' + S, 'clav' + S, clavQ, 'shoulder' + S, 'elbow' + S);
        const qe = limb('elbow' + S, 'shoulder' + S, qs, 'elbow' + S, 'wrist' + S);
        limb('wrist' + S, 'elbow' + S, qe, 'wrist' + S, 'hand' + S);
        const qh = limb('hip' + S, 'hips', Q.hips, 'hip' + S, 'knee' + S);
        const qk = limb('knee' + S, 'hip' + S, qh, 'knee' + S, 'ankle' + S);
        limb('ankle' + S, 'knee' + S, qk, 'ankle' + S, 'toe' + S);
      }
      /* веки полуприкрыты, глаза неподвижны */
      if (!R.temporary) for (const n of ['lidR', 'lidL']) { const l = b(n); if (l) { if (!l.userData.p0) l.userData.p0 = l.position.clone(); l.rotation.set(-(ch.lidClose || 0.46) * 0.62, 0, 0); } }
      ch.root.updateMatrixWorld(true);
      /* автомат */
      const G = R.gun, w = s.gun;
      if (G && w) {
        const gp = G.p;
        _a.set(gp[0], gp[1], gp[2]); _b.set(gp[3], gp[4], gp[5]); _c.set(gp[6], gp[7], gp[8]);
        _z.subVectors(_a, _b).normalize();
        _y.copy(_c).sub(_d.addVectors(_a, _b).multiplyScalar(0.5));
        _y.addScaledVector(_z, -_y.dot(_z)).normalize();
        _x.crossVectors(_y, _z);
        const Fg = new THREE.Quaternion().setFromRotationMatrix(_mb.makeBasis(_x, _y, _z));
        if (!G.f0) G.f0 = Fg.clone();
        /* поворот = изменение рамки частиц · исходный поворот узла */
        w.root.quaternion.copy(Fg.multiply(_q.copy(G.f0).invert()).multiply(G.q0));
        /* узел w.root — у затыльника (частица 0) */
        w.root.position.copy(_a).sub(G.loc[0].clone().applyQuaternion(w.root.quaternion));
        w.root.updateMatrixWorld(true);
      }
    }
    /* -------------------------------------------- подрыв на мине --- */
    /* ПМН-2 (≈100 г ТГ) срабатывает под стопой. Стопа и нижняя треть
       голени разрушены, вторая нога, бедро и промежность посечены грунтом
       и обломками корпуса, ткань в копоти. Тело не «взлетает»: удар
       снизу бьёт в ногу, колено подламывается к груди, человека
       опрокидывает назад и в сторону от поражённой ноги на 1–2 м.
       kind: 'pmn' — под стопой, 'near' — рядом с разрывом (r — до центра).
       Возвращает { died, dmg }. */
    DM.blast = function (s, center, kind, opt) {
      opt = opt || {};
      if (!s.dmg || s.dead) return null;
      const ch = s.char, D = s.dmg, W = D.wounds;
      ch.root.updateMatrixWorld(true);
      const side = opt.side === 'L' ? 'L' : 'R', sg = side === 'R' ? 1 : -1, oth = side === 'R' ? 'L' : 'R';
      const fwd = V().set(0, 0, -1).applyQuaternion(ch.root.quaternion); fwd.y = 0; fwd.normalize();
      const rgt = V().set(-fwd.z, 0, fwd.x);
      const rr = (a, b) => a + (b - a) * Math.random();
      D.hits++;
      if (kind === 'pmn') {
        if (W) {
          W.add([sg * 0.105, 0.07, -0.04], 0.11, 'gore');
          W.add([sg * 0.11, 0.25, -0.03], 0.12, 'gore');
          W.add([sg * 0.11, 0.47, -0.05], 0.08, 'gore');
          W.add([sg * 0.10, 0.75, -0.08], 0.06, 'gore');
          W.add([-sg * 0.11, 0.30, -0.06], 0.07, 'gore');
          W.add([sg * 0.03, 0.88, -0.12], 0.05, 'gore');
          W.add([sg * 0.11, 0.32, -0.02], 0.22, 'soot');
          W.add([-sg * 0.11, 0.28, -0.03], 0.17, 'soot');
          W.add([sg * 0.06, 0.78, -0.08], 0.17, 'soot');
          W.add([0.0, 1.10, -0.14], 0.13, 'soot');
        }
        s.deathCause = opt.cause || 'Подрыв на мине';
        die(s, center, V().set(0, 1, 0), 'blast', { noImpulse: true, noBleed: true });
        const R = s.rd, pp = R.pp;
        /* прочь от поражённой ноги: назад и вбок */
        const aw = V().copy(fwd).multiplyScalar(-0.78).addScaledVector(rgt, -sg * 0.5).normalize();
        const push = (n, up, a, j) => {
          const i = PI[n];
          if (i === undefined) return;
          j = j || 0;
          const vx = aw.x * a + rr(-j, j), vz = aw.z * a + rr(-j, j), vy = up + rr(-j, j) * 0.5;
          pp[i * 3] -= vx * H0; pp[i * 3 + 1] -= vy * H0; pp[i * 3 + 2] -= vz * H0;
        };
        /* Почти весь вертикальный импульс остаётся в подорванной ноге.
           У корпуса лишь короткий подброс: это убирает «голливудский» полёт,
           но сохраняет резкое подламывание колена и опрокидывание. */
        push('toe' + side, 7.6, 0.85, 0.55); push('ankle' + side, 7.0, 0.95, 0.45); push('knee' + side, 4.8, 1.15, 0.25);
        push('hip' + side, 1.65, 1.25); push('pelvis', 0.62, 1.30); push('spine', 0.30, 1.40);
        push('hip' + oth, 0.35, 1.22); push('knee' + oth, 0.28, 0.92, 0.22); push('ankle' + oth, 0.18, 0.72, 0.22); push('toe' + oth, 0.14, 0.68, 0.20);
        for (const n of ['chest', 'chestR', 'chestL', 'chestF']) push(n, 0.12, 1.55);
        for (const n of ['neck', 'head', 'headTop', 'nose']) push(n, 0.04, 1.62);
        for (const S2 of ['R', 'L']) for (const n of ['shoulder', 'elbow', 'wrist', 'hand']) push(n + S2, rr(-0.15, 0.65), rr(0.90, 1.75), 0.82);
        if (R.gun) {
          /* удар снизу: кисть разжимается сразу, автомат летит на ремне */
          R.gun.grip = 0.03;
          for (let i = 0; i < R.gun.n; i++) { R.gun.pp[i * 3 + 1] -= rr(1.2, 2.4) * H0; R.gun.pp[i * 3] -= aw.x * 1.2 * H0; R.gun.pp[i * 3 + 2] -= aw.z * 1.2 * H0; }
        }
        R.blast = true;
        if (o.blood) {
          const f = PI['ankle' + side], p = R.p;
          o.blood.blast(V().set(p[f * 3], p[f * 3 + 1], p[f * 3 + 2]), 1);
          o.blood.bleed(s, PI['knee' + side], 'blast', { scale: 1.25, rate: 2.4 });
        }
        /* ПМН: травматическая отрывная ампутация стопы или голени */
        if (o.gore) {
          const f = PI['ankle' + side], p = R.p;
          o.gore.sever(s, (Math.random() < 0.55 ? 'ankle' : 'knee') + side, { dir: aw, at: V().set(p[f * 3], p[f * 3 + 1], p[f * 3 + 2]), force: 1.3, blast: true });
          if (Math.random() < 0.3) o.gore.sever(s, 'ankle' + oth, { dir: aw, force: 1, blast: true });
        }
        return { died: true, dmg: 999, zone: 'blast' };
      }
      /* рядом с разрывом: грунт и обломки по ближней стороне ног */
      const r = Math.max(0.3, opt.r || center.distanceTo(ch.root.position));
      const L = ch.root.worldToLocal(center.clone());
      const sx = L.x >= 0 ? 1 : -1, sz = L.z >= 0 ? 1 : -1;
      const nW = r < 1.4 ? 4 : r < 2 ? 3 : 2;
      if (W) {
        for (let i = 0; i < nW; i++) W.add([sx * rr(0.07, 0.13), rr(0.08, 0.62), sz * rr(0.02, 0.08)], rr(0.035, 0.06), 'gore');
        W.add([sx * 0.1, 0.3, sz * 0.04], 0.16 + 0.08 / r, 'soot');
      }
      const dmg = Math.round(clamp((2.7 - r) / 1.8, 0, 1) * 95 + 25 + Math.random() * 15);
      /* v13: осколочно-взрывная травма ног — кровотечение, хромота,
         вблизи — переломы (на ногу не встать); очень близко — шок */
      const PHs = D.ph;
      if (PHs) {
        const kk = dmg / 100;
        PH.addSrc(PHs, { key: 'blast', name: 'осколочные раны ног', tau: 200, comp: 'limb', zone: 'shin', side: sx > 0 ? 'R' : 'L' }, 3 + 9 * kk);
        PHs.limp[sx > 0 ? 'R' : 'L'] = Math.max(PHs.limp[sx > 0 ? 'R' : 'L'], 0.4 + 0.4 * Math.min(1, kk));
        if (r < 1.5 && Math.random() < 0.6) { PHs.legDown = true; PH.addInj(PHs, 'blastfx', 'Осколочный перелом голени — стоять нельзя', 3, 'shin', sx > 0 ? 'R' : 'L'); }
        else PH.addInj(PHs, 'blastw', 'Осколочные ранения ног', 2, 'shin', sx > 0 ? 'R' : 'L');
        PHs.pain += 0.8; PHs.stun = Math.max(PHs.stun, 1.5 + kk);
        PH.apply(PHs, s.ctrl);
      }
      const away = V().copy(ch.root.position).sub(center); away.y = 0;
      if (away.lengthSq() < 1e-6) away.copy(fwd).negate();
      away.normalize();
      const hitP = V().copy(ch.root.position).addScaledVector(away, -0.12); hitP.y += 0.35;
      if (o.blood) o.blood.hit(hitP, V().copy(away).add(V().set(0, 0.4, 0)).normalize(), { zone: 'shin', scale: 0.7, exit: false });
      if (dmg >= 105) {
        s.deathCause = opt.cause || 'Подрыв на мине';
        die(s, hitP, away, 'blast', { noBleed: true });
        /* v14: отрыв/разрушение ноги — кровотечение из культи без жгута */
        if (s.dmg && s.dmg.ph && PH) PH.addSrc(s.dmg.ph, { key: 'blastLeg', name: 'культя ноги', kind: 'art', comp: 'limb', zone: 'thigh', side: sx > 0 ? 'R' : 'L' }, 38);
        const R = s.rd, pp = R.pp, k2 = clamp((2.7 - r) / 2, 0, 1);
        for (let i = 0; i < PDEF.length; i++) {
          const y = R.p[i * 3 + 1] - ch.root.position.y, lo = Math.exp(-y / 0.6);
          pp[i * 3] -= away.x * (0.8 + 1.6 * k2) * lo * H0; pp[i * 3 + 1] -= (0.6 + 1.4 * k2) * lo * H0; pp[i * 3 + 2] -= away.z * (0.8 + 1.6 * k2) * lo * H0;
        }
        if (o.blood) o.blood.bleed(s, PI['knee' + (sx > 0 ? 'R' : 'L')], 'blast', { scale: 0.85, rate: 1.6 });
        return { died: true, dmg, zone: 'blast' };
      }
      react(s, hitP, away, 'shin', dmg);
      s.bleedW = { sh: D.shapes.find((x) => x.zone === 'shin') || D.shapes[0], q: [sx * 0.1, 0.35, sz * 0.04], t: 0, acc: 0, rate: 3.5 };
      return { died: false, dmg, zone: 'blast' };
    };

    /* Кадр для мёртвого бойца: симуляция + поза. */
    DM.ragdoll = function (s, dt) {
      const R = s.rd;
      if (!R) return;
      R.t += dt;
      if (!R.temporary) s.deadT = (s.deadT || 0) + dt;
      R.lowRate = !!(R.ag && R.t > 3 && (!R.anim || R.te > R.anim.dur + 0.6));
      /* v15: LOD рэгдолла — тело дальше 30 м от камеры (на экране это
         пара десятков пикселей) считается с шагом 1/90 вместо 1/180:
         вдвое дешевле, а падение выглядит так же. Первые 0,5 с после
         попадания — всегда полный шаг (импульс пули, подламывание ног). */
      if (!R.lowRate && R.t > 0.5) {
        const cam = globalThis.AEGIS_CAMERA, pi3 = PI.pelvis * 3;
        if (cam) { const dx = R.p[pi3] - cam.position.x, dz = R.p[pi3 + 2] - cam.position.z; if (dx * dx + dz * dz > 900) R.lowRate = true; }
      }
      if (globalThis.GPhysics && s.ctrl && s.ctrl._physicsWorld) {
        const physics=globalThis.GPhysics.get(s.ctrl._physicsWorld);
        /* v20: улёгшееся тело (все части Rapier спят, агонии нет) не
           пересчитывается: ни частицы, ни кости, ни матрицы (29_game.js) —
           раньше каждый труп стоил как живой боец. Толчок (взрыв, пуля,
           упавшее сверху тело) будит части — и расчёт возобновляется. */
        if (R._frozen) {
          const ph = physics.ragdolls.get(s);
          if (ph && ph.rd === R && !(R.ag && R.ag.k > 0.02) && R.sleep > 0 && ph.groups.every((g) => g.body.isSleeping())) return;
          R._frozen = false;
        }
        physics.ragdoll(s, dt, PI);
        const physical=physics.ragdolls.get(s);
        if(physical?.soundEvents?.length){
          if(o.sound&&(R._lastImpactSound===undefined||R.t-R._lastImpactSound>.18)){
            const e=physical.soundEvents.reduce((a,b)=>a.speed>b.speed?a:b);
            o.sound(e.kind,e.at,Math.min(1,e.speed/5),s);R._lastImpactSound=R.t;
          }
          physical.soundEvents.length=0;
        }
      } else if (R.sleep < 1.2 || (R.anim && R.te < R.anim.dur + 2.4) || (R.ag && R.ag.k > 0.02)) sim(s, dt);
      poseFromParticles(s);
      R._frozen = !!(globalThis.GPhysics && s.ctrl && s.ctrl._physicsWorld && R.sleep > 0.8 && !(R.ag && R.ag.k > 0.02) &&
        (!R.anim || R.te > R.anim.dur + 0.6) && !s.active);
    };
    DM.revive = function (s) {
      globalThis.GStumble?.reset(s);
      if (s.ctrl?._physicsWorld) globalThis.GPhysics?.get(s.ctrl._physicsWorld).dropRagdoll(s);
      clearHelmet(s);
      s.med = null;
      s.dead = false; s.rd = null; s.hr = null; s.deadT = 0; s.bleedW = null; s.deathCause = null; s.finished = false; s.agony = undefined; s.unconscious = false;
      if (s.dmg) { const D = s.dmg; if (PH) D.ph = PH.initState(s.ctrl && s.ctrl.trait); D.artZ = null; D.vw = 0; D.tq = null; D.dressed = null; D.hits = 0; D.armor = null; D.bleed = 0; D.bleedArt = 0; D.limb = null; D.cut = null; D.fract = null; if (D.wounds) D.wounds.clear(); }
      if (o.gore) o.gore.reset(s);
      if (s.ctrl) { s.ctrl.injLeg = false; s.ctrl.injArm = false; s.ctrl.prone = 0; s.ctrl.proneWant = false; s.ctrl.legDown = false; s.ctrl.limp = 0; s.ctrl.armK = 0; s.ctrl.breathK = 1; s.ctrl.shockK = 0; s.ctrl.stun = 0; s.ctrl.painK = 0; }
      for (const n of ['lidR', 'lidL']) { const l = s.char.bone(n); if (l) l.rotation.set(0, 0, 0); }
    };
    // Non-lethal balance loss uses exactly the casualty articulation but does
    // not run onDeath, bleed, medical revival or HP/organ reset.
    DM.startFall = function (s) {
      if (s.dead || s.rd || !s.ctrl?._physicsWorld) return false;
      const keys = ['dead','deadT','bleedW','deathKind','deathFatal','_dieCns','_diePara','deathType','unconscious'];
      const saved = Object.fromEntries(keys.map(k => [k,s[k]]));
      die(s,s.char.bone('chest').getWorldPosition(V()),V().set(0,0,-1),'shin',
        {quiet:true,noBleed:true,noImpulse:true,temporary:true});
      const R = s.rd;
      for (const k of keys) s[k] = saved[k];
      R.temporary = true; R.ag = null; R.anim = null;
      return true;
    };
    DM._standCollapse = (s) => {s.deathFatal=false;die(s,s.char.bone('chest').getWorldPosition(new THREE.Vector3()),new THREE.Vector3(0,0,-1),'shin',{quiet:true,noBleed:true,noImpulse:true});};
    /* v21: гибель без ранения (запретная зона сектора): обычный путь смерти —
       экран гибели игрока, возрождение и учёт жизней команды — но без крови */
    DM.kill = (s, cause) => {
      if (!s || s.dead) return false;
      s.deathCause = cause || 'Гибель';
      s.deathFatal = true;
      die(s, s.char.bone('chest').getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0, -1, 0), 'thorax', { noImpulse: true, noBleed: true });
      return true;
    };
    /* v22: удар о землю при падении; v — скорость приземления, м/с (g = 9,81, h = v²/2g):
         < 6,5 м/с (до ~2,2 м) — колени гасят удар, травмы нет;
         6,5–8,5 (2,2–3,7 м) — ушиб, хромота, оглушение;
         8,5–10,5 (3,7–5,6 м) — перелом голени/пятки с ростом вероятности: на ноги не встать;
         10,5–13 (5,6–8,6 м) — переломы обеих ног, шок; 13–15 (8,6–11,5 м) — гибель с ростом вероятности; > 15 — гибель. */
    DM.fall = (s, v) => {
      if (!s || s.dead || !s.dmg || !PH) return null;
      const D = s.dmg, PHs = D.ph;
      if (!PHs || !(v > 6.5)) return null;
      const rnd = Math.random, k = Math.min(1.5, (v - 6.5) / 6.5);
      if (v > 15 || (v > 13 && rnd() < (v - 13) / 2)) { DM.kill(s, 'Падение с высоты'); return { died: true, text: 'Падение с высоты' }; }
      const side = rnd() < 0.5 ? 'L' : 'R', oth = side === 'R' ? 'L' : 'R';
      PHs.limp[side] = Math.max(PHs.limp[side], Math.min(0.95, 0.35 + 0.5 * k));
      PHs.pain += 0.35 + 0.8 * k; PHs.stun = Math.max(PHs.stun, 0.5 + 1.6 * k);
      let text = 'Ушиб ног при падении — хромота';
      const broke = v > 10.5 || (v > 8.5 && rnd() < (v - 8.5) / 2.2);
      if (broke) {
        PHs.legDown = true;
        D.fract = D.fract || {}; D.fract.shin = true;
        const both = v > 10.5;
        if (both) PHs.limp[oth] = Math.max(PHs.limp[oth], 0.85);
        text = both ? 'Переломы обеих ног при падении — стоять нельзя' : 'Перелом голени при падении — стоять нельзя';
        PH.addInj(PHs, 'fallfx', text, 3, 'shin', side);
      } else PH.addInj(PHs, 'fallw', text, 1, 'shin', side);
      PH.apply(PHs, s.ctrl);
      try {
        const ft = s.char.bone('ankle' + side).getWorldPosition(V());
        react(s, ft, V().set(0, -1, 0), 'shin', broke ? 60 : 25);
      } catch (e) { /* */ }
      return { died: false, legDown: broke, text };
    };
    DM._sim = sim;        // для стенда (tools/rag_replay.mjs)
    function U_damp(a, b, l, dt) { return b + (a - b) * Math.exp(-l * dt); }
    DM.update = function (dt) {
      if (HELMS.length) helmStep(Math.min(dt, 0.05));
      for (const s of DM.list) {
        if (s.dmg && s.dmg.wounds && s.dmg.wounds.list.length) s.dmg.wounds.update(dt);
        /* кровопотеря живого: венозная и капиллярная стихает (свёртывание,
           τ ≈ 40 с), артериальная — нет: без жгута боец гибнет за десятки
           секунд */
        const Dd = s.dmg;
        /* v14: агония — кровь продолжает уходить; сознание гаснет, потом
           наступает смерть (а не «лежит 32 с и встаёт») */
        if (Dd && Dd.ph && s.dead && s.rd && s.rd.ag && !s.finished && !Dd.ph.dead) {
          const ph = Dd.ph, ev = PH.update(ph, dt), A = s.rd.ag;
          Dd.bleed = ph.bleed; Dd.bleedArt = ph.bleedArt;
          A.k = A.para ? 0 : ph.unc ? Math.max(0, A.k - dt * 0.6) : U_damp(A.k, ph.conscious, 1.5, dt);
          if (ev && ev !== 'dead') {
            s.unconscious = true;
            s.deathCause = (s.deathCause || '') + ' · без сознания';
            if (o.onUncon) o.onUncon(s);
          } else if (ev === 'dead') {
            s.finished = true; s.finT = s.deadT || 0; A.k = 0; A.off = true;
            s.deathCause = s.deathKind === 'neck' ? 'Ранение шеи · кровопотеря и удушье' : A.para && ph.apnea ? 'Ранение шеи · паралич дыхания' : 'Кровопотеря ' + Math.round(ph.lossF * 100) + ' % · ' + (s.deathCause || '').split(' · ')[0];
            if (o.onFinish) o.onFinish(s, 'bleed');
          }
          continue;
        }
        if (Dd && Dd.ph && !s.dead) {
          const ev = PH.update(Dd.ph, dt);
          Dd.bleed = Dd.ph.bleed; Dd.bleedArt = Dd.ph.bleedArt;
          if (s.ctrl) PH.apply(Dd.ph, s.ctrl);
          if (ev) {
            s.deathCause = ev === 'ko_heart' ? 'Потеря сознания · ранение сердца / крупного сосуда' : 'Потеря сознания · кровопотеря ' + Math.round(Dd.ph.lossF * 100) + ' %';
            const B = s.bleedW;
            const at = B ? restToWorld(s, B.sh, B.q, V()) : s.char.root.position.clone().setY(s.char.root.position.y + 1.1);
            die(s, at, V().set(0, -1, 0), B ? B.sh.zone : 'thorax', { noImpulse: true });
            continue;
          }
        }
        /* живой раненый: из раны капает всё реже */
        const B = s.bleedW;
        if (!B || s.dead || !o.blood) continue;
        B.t += dt;
        const rate = B.rate * Math.exp(-B.t / 18) + (s.dmg && s.dmg.bleedArt ? 3 + s.dmg.bleedArt : 0);
        if (rate < 0.04) { s.bleedW = null; continue; }
        B.acc += rate * dt;
        if (B.acc >= 1 && !(s.active && o.isFirstPerson && o.isFirstPerson())) {
          B.acc -= 1;
          o.blood.dripAt(restToWorld(s, B.sh, B.q, _a));
        } else if (B.acc >= 1) B.acc -= 1;
      }
    };
    DM.PI = PI; DM.H0 = H0; DM.PDEF = PDEF;
    DM._footLim = (lo, hi) => { FT_LO = lo; FT_HI = hi; };
    return DM;
  }

  return { create, woundMaterials, ZONES, AMMO, DEFAULT_AMMO, armorFor, penetrate, rayCapsule, rayBox };
});
