/* ==========================================================================
   МОДУЛЬ: GRecoil — видимая отдача (v7)
   ==========================================================================
   Отдача разделена на четыре слоя:
     1) траектория пули — НЕ здесь. Сбив наводки (P.pitch/P.yaw, kickBack) и
        «баллистическая тень» старых пружин остаются в 20_player.js как были:
        баланс оружия не меняется ни на миллирадиан;
     2) видимое движение оружия (этот модуль: back/up/pitch/yaw/roll);
     3) тело стрелка (плечо уходит назад, корпус качается, голова кивает);
     4) механика (затворная рама, кожух-затвор, выброс гильзы в крайней
        задней точке, газ из тормоза).

   Физика (как в баллистических калькуляторах, формула SAAMI):
     импульс I = m_пули·v0 + m_заряда·k_газа·v0·(1 − гашение_тормоза),
     скорость свободного отката V = I / M_оружия, энергия E = M·V²/2.
   Подброс — момент силы отдачи на плече «ось канала ствола над упором
   приклада» (bore axis): у АК ось выше линии приклада — ствол «козлит»
   сильнее; у M416 ствол на одной линии с буферной трубкой — толчок идёт
   прямо в плечо. У пистолета ось над кистью — «кивок» кистью.

   Форма одного выстрела по каждой оси — ФАЗЫ, а не пружина:
     толчок 15–25 мс (назад и вверх, тем быстрее, чем выше энергия),
     пик поворота 40–60 мс, возврат 150–350 мс с небольшим перелётом ниже
     исходной точки (стрелок «пересаживает» ствол обратно).
   Выстрелы очереди складываются (первые 2–3 сильнее, дальше ровная дрожь),
   сумма мягко ограничивается (tanh), а пружина-«догонялка» с подшагами
   1/480 с только сглаживает итог: картинка одинакова при 30/60/144 FPS.

   v8 — отдача «по циклу автоматики» (как на скоростной съёмке):
     • выстрел — главный импульс (пуля + газы);
     • рама/затвор приходит в крайнее заднее положение и бьёт в ствольную
       коробку/буфер — второй, меньший толчок назад и вверх (у АК с длинным
       ходом поршня он заметный, у M416 буфер его срезает);
     • рама возвращается и бьёт вперёд («накат») — короткий клевок ствола
       вниз-вперёд. На последнем патроне у образцов с затворной задержкой
       (M416, SCAR, СВД, Glock) рама остаётся сзади — наката нет;
     • стрелок — упругая система с затуханием: жёсткость по стойке, хвату
       (передняя рукоятка), усталости; физиологический тремор 8–12 Гц растёт
       с усталостью; компенсация вскида начинается с задержкой реакции
       ~0,15–0,2 с (поэтому первые 3–4 выстрела очереди «самые дикие» —
       это в 20_player.js, по наводке);
     • партия патронов: импульс гуляет ±1–1,5 % от выстрела к выстрелу;
     • нагрев ствола: Q = m_заряда·3,8 МДж/кг·η (≈18 % энергии пороха уходит
       в ствол), ΔT = Q/(m_ствола·460 Дж/кг·К) — у АК-74 ≈2 К на выстрел;
       остывание — конвекция + излучение (εσT⁴), десятки минут, как в жизни;
     • задержки (опция «хардкор»): вероятность по образцу и состоянию
       (перегрев, дождь, нагар), типы — недосыл, «печная труба», двойная
       подача; самовоспламенение патрона в перегретом патроннике.
   ========================================================================== */
(function (root, factory) {
  const G = factory();
  if (typeof module === 'object' && module.exports) module.exports = G;
  root.GRecoil = G;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sat = (x) => clamp(x, 0, 1);

  /* пуля (кг), v0 (м/с), заряд (кг), коэффициент скорости газов */
  const AMMO = {
    '545': { mb: 0.0034, v0: 880, mp: 0.00145, gk: 1.75 },
    '556': { mb: 0.0040, v0: 920, mp: 0.00165, gk: 1.75 },
    '762x39': { mb: 0.0079, v0: 715, mp: 0.0016, gk: 1.75 },
    '762x51': { mb: 0.0095, v0: 840, mp: 0.0028, gk: 1.75 },
    '762x54R': { mb: 0.0096, v0: 830, mp: 0.0031, gk: 1.75 },
    '45acp': { mb: 0.0149, v0: 260, mp: 0.00042, gk: 1.5 },
    '9x19': { mb: 0.0080, v0: 360, mp: 0.00040, gk: 1.5 },
    '12ga': { mb: 0.0320, v0: 400, mp: 0.0026, gk: 1.5 }
  };
  /* геометрия образца: h — превышение оси канала над точкой упора (м),
     M — масса (кг, если нет в статах), os — перелёт при возврате,
     carrier — масса подвижных частей относительно оружия (тряска рамы),
     wrist — пистолет: опора кисть, а не плечо */
  const GEOM = {
    ar15m4: { h: 0.012, M: 3.1, os: 0.2, carrier: 0.1 },
    glock21: { h: 0.03, M: 0.83, os: 0.4, carrier: 0.22, wrist: true },
    ak74: { h: 0.045, M: 3.3, os: 0.34, carrier: 0.16 },
    akm: { h: 0.043, M: 3.3, os: 0.30, carrier: 0.16 },
    m416: { h: 0.012, M: 3.5, os: 0.18, carrier: 0.10 },
    scar: { h: 0.020, M: 3.6, os: 0.24, carrier: 0.12 },
    svd: { h: 0.035, M: 4.3, os: 0.36, carrier: 0.08 },
    m870: { h: 0.035, M: 3.6, os: 0.28, carrier: 0 },
    mp5a3: { h: 0.010, M: 3.0, os: 0.16, carrier: 0.07 },
    glock18c: { h: 0.030, M: 0.9, os: 0.42, carrier: 0.20, wrist: true }
  };
  /* дульные устройства: gas — доля газов, «срезанная» вбок/вверх,
     rise — дополнительное гашение подброса (окна сверху), mass — добавка
     к массе на дульном срезе (глушитель: больше инерция, мягче вскид) */
  const MUZZLE = {
    bare: { gas: 0, rise: 0, mass: 0 },
    fh: { gas: 0.05, rise: 0.04, mass: 0.05 },
    linear: { gas: -0.05, rise: 0, mass: 0.12 },
    brake: { gas: 0.60, rise: 0.15, mass: 0.10, side: true },
    choke: { gas: 0, rise: 0, mass: 0.05 },
    comp: { gas: 0.20, rise: 0.35, mass: 0.08, up: true },
    supp: { gas: 0.30, rise: 0.05, mass: 0.45 }
  };
  /* v8: автоматика.
     kind: lsp — длинный ход газового поршня (АК), ssp — короткий ход (M416, SCAR,
     СВД), roller — полусвободный затвор с роликами (MP5), slide — короткий ход
     ствола (Glock), pump — помпа.
     rear — удар рамы в заднем положении (доля главного импульса), fwd — удар
     наката, tb — доля цикла до заднего положения, mb — масса ствола (кг),
     A — площадь наружной поверхности ствола (м²), mrbs — средний настрел на
     задержку в нормальных условиях, jam — доли типов задержек
     [недосыл, «печная труба», двойная подача], closed — стреляет с закрытого
     затвора (патрон лежит в горячем патроннике — возможен «cook-off»). */
  const OPS = {
    ak74: { kind: 'lsp', rear: 0.30, fwd: 0.40, tb: 0.42, mb: 1.05, A: 0.034, mrbs: 5000, jam: [0.55, 0.25, 0.20], closed: true },
    akm: { kind: 'lsp', rear: 0.36, fwd: 0.48, tb: 0.42, mb: 1.05, A: 0.034, mrbs: 5500, jam: [0.55, 0.25, 0.20], closed: true },
    m416: { kind: 'ssp', rear: 0.15, fwd: 0.13, tb: 0.45, mb: 1.20, A: 0.032, mrbs: 4000, jam: [0.45, 0.30, 0.25], closed: true },
    scar: { kind: 'ssp', rear: 0.22, fwd: 0.24, tb: 0.44, mb: 1.40, A: 0.040, mrbs: 3500, jam: [0.45, 0.30, 0.25], closed: true },
    svd: { kind: 'ssp', rear: 0.18, fwd: 0.22, tb: 0.42, mb: 1.60, A: 0.050, mrbs: 3000, jam: [0.50, 0.30, 0.20], closed: true },
    m870: { kind: 'pump', rear: 0, fwd: 0, tb: 0.40, mb: 1.25, A: 0.050, mrbs: 8000, jam: [0.6, 0.4, 0], closed: true },
    mp5a3: { kind: 'roller', rear: 0.30, fwd: 0.22, tb: 0.40, mb: 0.45, A: 0.015, mrbs: 3000, jam: [0.40, 0.40, 0.20], closed: true },
    glock18c: { kind: 'slide', rear: 0.38, fwd: 0.34, tb: 0.45, mb: 0.12, A: 0.006, mrbs: 6000, jam: [0.35, 0.50, 0.15], closed: true }
  };
  const OPS_DEF = { ar: 'm416', ak: 'ak74', pistol: 'glock18c', pump: 'm870', hk: 'mp5a3' };
  /* температура воздуха по погоде (°C) */
  const AMBIENT = { overcast: 9, morning: 4, day: 9, rain: 8, fog: 5, dusk: 7, night: 4 };   /* v21: осень, пар изо рта виден */
  /* детерминированный шум: одинаковый при любом FPS (по номеру выстрела) */
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const gauss = (n) => { const u = Math.max(1e-6, hash(n)), v = hash(n + 71.3); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); };

  /* эталон — M416 с пламегасителем */
  const REF = (() => { const a = AMMO['556'], I = a.mb * a.v0 + a.mp * a.gk * a.v0 * 0.95, M = 3.55; return { I, rise: I * (1 + 0.012 * 33 / (M * 0.09 + 0.08)), back: I / Math.sqrt(M + 4), E: I * I / (2 * M) }; })();

  /* базовые амплитуды эталона (видимое, вид со стороны) */
  /* v11: pitch 0,024 → 0,030, back 0,022 → 0,026, yaw/roll +20 %: видимое
     движение винтовки на выстреле — 3–5° подброса и 2–3 см в плечо от бедра
     (скоростная съёмка АК/AR с плеча), в прицеле — собрано щекой (см. 03_vm) */
  const BASE = { back: 0.026, up: 0.0038, pitch: 0.030, yaw: 0.009, roll: 0.012 };

  /* фазовая кривая одного выстрела:
     t — время после выстрела, tr — время до пика, td — длительность возврата,
     os — перелёт ниже нуля. Подъём «ease-out»: резкий старт (импульс) и нулевая
     производная в пике; спад — эрмитова ступенька, перелёт — гладкий «провал». */
  function phase(t, tr, td, os) {
    if (t <= 0) return 0;
    if (t < tr) { const u = 1 - t / tr; return 1 - u * u * u; }
    const u = (t - tr) / td;
    if (u >= 1) return 0;
    /* первые 62 % возврата — гладкий спуск к нулю (эрмит), дальше — провал
       ниже исходной точки и мягкий подъём (C¹-непрерывно на стыках) */
    const A = 0.62;
    if (u < A) { const v = u / A; return (1 - v) * (1 - v) * (1 + 2 * v); }
    const s = Math.sin(Math.PI * (u - A) / (1 - A));
    return -os * 0.3 * s * s;
  }

  /* характеристики образца */
  function profileFor(w) {
    const id = (w && w.id) || 'm416', st = (w && w.stats) || {};
    const fam = (w && w.fam) || 'ar';
    const g = GEOM[id] || { h: fam === 'pistol' ? 0.03 : 0.03, M: fam === 'pistol' ? 0.9 : 3.5, os: 0.25, carrier: 0.1, wrist: fam === 'pistol' };
    const am = AMMO[st.cal] || AMMO[fam === 'pistol' ? '9x19' : '556'];
    const mz = MUZZLE[st.muzzleKind] || MUZZLE.bare;
    const v0 = st.v0 || am.v0;
    const M = Math.max(0.6, (st.weight && st.weight > 0.3 ? st.weight : g.M)) + mz.mass;
    const I = am.mb * v0 + am.mp * am.gk * v0 * (1 - mz.gas);
    const V = I / M, E = M * V * V / 2;
    /* момент: плечо h, сопротивление — инерция оружия (∝ M) и плечо стрелка */
    const riseRaw = I * (1 + g.h * 33 / (M * 0.09 + 0.08)) * (1 - mz.rise);
    const backRaw = I / Math.sqrt(M + 4);
    const statK = Math.pow(((w && w.wp && w.wp.recoil) || 1) * (st.recoilV || 100) / 100, 0.35);
    const statH = Math.pow(((w && w.wp && w.wp.recoil) || 1) * (st.recoilH || 100) / 100, 0.35);
    const rise = Math.min(2.8, Math.pow(riseRaw / REF.rise, 0.75)) * statK;
    const back = Math.min(2.4, Math.pow(backRaw / REF.back, 0.8)) * statK;
    const eK = sat((E - 1.5) / 25);
    const RP = (typeof self !== 'undefined' && self.GGuns && self.GGuns.RECOIL_PROFILE && self.GGuns.RECOIL_PROFILE[id]) || {};
    const pistol = !!g.wrist;
    const pump = fam === 'pump';
    const rpm = st.rpm || 600;
    /* цикл автоматики: в автоматическом огне следующий выстрел происходит,
       как только затвор закрылся, — цикл ≈ интервал между выстрелами (у АК-74
       650 выс/мин ≈ 92 мс, рама в заднем положении на ~40 % цикла) */
    const cycle = pistol ? clamp(0.92 * 60 / rpm, 0.04, 0.07) : clamp(0.92 * 60 / rpm, 0.05, 0.11);
    const op = OPS[id] || OPS[OPS_DEF[fam] || 'm416'];
    /* нагрев: доля энергии пороха в ствол (у короткого пистолетного — больше) */
    const eta = pistol ? 0.22 : fam === 'pump' ? 0.12 : 0.18;
    const dTshot = (am.mp * 3.8e6 * eta) / (op.mb * 460) * (mz.kind === 'supp' || st.muzzleKind === 'supp' ? 1.15 : 1);
    return {
      id, fam, pistol, pump, I, M, V, E, rise, back, side: statH * (pistol ? 1.2 : 1),
      kind: st.muzzleKind || 'bare', brake: !!mz.side, comp: !!mz.up, supp: st.muzzleKind === 'supp',
      /* фазы: толчок 15–25 мс, пик 40–60 мс, возврат 150–350 мс */
      tKick: lerp(0.025, 0.015, eK),
      tPeak: lerp(0.040, 0.060, sat((E - 1.5) / 25) * 0.6 + sat((M - 1) / 4) * 0.4),
      tRet: clamp(lerp(0.150, 0.350, Math.pow(eK, 0.7)) * (pistol ? 1.05 : 1) / Math.sqrt(RP.rateM || 1), 0.15, 0.35),
      os: g.os, h: g.h, carrier: g.carrier, cycle, op, dTshot, boltHold: !!(w && w.stats && w.stats.boltHold),
      yawBias: RP.yawBias || 0, rollMin: RP.rollMin ?? -0.4, rollMax: RP.rollMax ?? 1,
      seed: [...String(id)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 997, 7) * 0.013,
      /* пистолет: поворот вокруг кисти вместо плеча — больше угла, меньше хода назад.
         v11: по скоростной съёмке 9×19 (две руки, изоцентрическая стойка):
         подброс ствола 8–14°, пик 45–60 мс, кисти уходят назад на 2–4 см
         (локти сгибаются), прицельные возвращаются к цели за 0,15–0,25 с.
         Раньше было ≈3° и ~1 см — выстрел «не читался». */
      kPitch: pistol ? 3.0 : 1, kBack: pistol ? 1.2 : 1, kUp: pistol ? 2.6 : 1,
      shoulder: pistol ? 0.010 : clamp(0.012 + back * 0.008, 0.01, 0.03)
    };
  }

  /* каналы и их фазы (доли от профиля) */
  const CH = [
    /* name   rise-time  return   overshoot */
    ['back', 'k', 0.55, 0.22],
    ['up', 'k', 0.75, 0.30],
    ['pitch', 'p', 1.0, 1.0],
    ['yaw', 'p', 1.1, 0.5],
    ['roll', 'p', 0.9, 0.6],
    ['sh', 'k', 0.65, 0.15],      // плечо назад
    ['torso', 'p1', 1.2, 0.5],    // корпус откидывается
    ['twist', 'p1', 1.2, 0.4],
    ['nod', 'p2', 1.15, 1.6],     // голова: запаздывает и «кивает» обратно
    ['hop', 'k', 0.45, 1.5]       // сошки: подскок
  ];

  /* v10: view punch — ω = 29 рад/с, ζ = 0,6: пик через ~40 мс, к 150 мс
     остаётся < 10 %; импульс скорости на единицу пика = ω / 0,4986 */
  const PUN_W = 29, PUN_Z = 0.6, PUN_V = PUN_W / 0.4986;
  function create() {
    const R = {
      prof: profileFor(null), t: 0, ev: [], n: 0,
      raw: {}, out: {}, vel: {},
      cam: { pitch: 0, yaw: 0, roll: 0, fov: 0, punchP: 0, punchY: 0, punchR: 0, back: 0 },
      /* v10: «view punch» — удар отдачи по взгляду (камера + оружие одним
         блоком): быстрый вскид ~40 мс и возврат пружиной за ~0,15 с с лёгким
         перелётом. Так ощущается отдача в CS/Insurgency/Squad/Tarkov: каждый
         выстрел виден, марка прыгает, и пули ложатся конусом — оружие в
         момент следующего выстрела ещё не вернулось. */
      pun: { p: 0, vp: 0, y: 0, vy: 0, r: 0, vr: 0 },
      mech: { slide: 0, carrierShake: 0 },
      lastShot: -9, sinceShot: 9, burstN: 0, ejectAt: -1, ejectDone: true, onEject: null,
      /* v8: нагрев ствола (°C), тремор, счётчики */
      heat: { T: 9, Ta: 9, wet: 0, wind: 0.3, shots: 0, peak: 9 },
      tremor: 0, fatigue: 0, shotN: 0, locked: false, cam2: null
    };
    R.x = {};
    for (const c of CH) { R.raw[c[0]] = 0; R.out[c[0]] = 0; R.vel[c[0]] = 0; R.x[c[0]] = 0; }
    R.setProfile = (w) => { R.prof = profileFor(w); R.locked = false; };
    /* затворная задержка снята (перезарядка) */
    R.unlock = () => { R.locked = false; };
    /* погода: температура воздуха, дождь (0..1) и ветер (м/с) */
    R.setWeather = (key, wet, wind) => {
      const Ta = AMBIENT[key] !== undefined ? AMBIENT[key] : 9;
      if (R.heat.T <= R.heat.Ta + 0.5) R.heat.T = Ta;
      R.heat.Ta = Ta; R.heat.wet = sat(wet || 0); R.heat.wind = Math.max(0, wind || 0.3);
    };
    /* множители состояния ствола: разброс и сдвиг средней точки (рад, вверх) */
    R.heatSpread = () => 1 + 0.6 * sat((R.heat.T - 200) / 250);
    R.heatPOI = () => 0.0009 * sat((R.heat.T - 150) / 350);
    /* Вероятность задержки на выстрел. ctx: { wet, fouling (выстрелов без
       чистки), mud } */
    R.jamChance = (ctx) => {
      const P = R.prof, op = P.op;
      ctx = ctx || {};
      let k = 1 + 2.5 * sat((R.heat.T - 250) / 200);
      k *= 1 + 0.3 * sat(ctx.wet || R.heat.wet);
      k *= 1 + (ctx.fouling || R.heat.shots) / 1500;
      k *= 1 + 1.5 * sat(ctx.mud || 0);
      return k / op.mrbs;
    };
    /* тип задержки по долям образца */
    R.jamType = (u) => {
      const j = R.prof.op.jam;
      return u < j[0] ? 'ftf' : u < j[0] + j[1] ? 'stovepipe' : 'double';
    };
    /* самовоспламенение в патроннике: интенсивность (1/с) при T > 320 °C */
    R.cookRate = () => (R.prof.op.closed ? 0.05 * Math.max(0, (R.heat.T - 320) / 40) : 0);

    /* выстрел. ctx: { ads, crouch, prone, moving(0..1), bipod, trait, burstIdx } */
    R.fire = (ctx) => {
      ctx = ctx || {};
      const P = R.prof;
      const gap = R.t - R.lastShot;
      R.burstN = gap < Math.max(0.3, P.cycle * 4) ? Math.min(60, R.burstN + 1) : 0;
      R.lastShot = R.t; R.sinceShot = 0;
      const n = ctx.burstIdx !== undefined ? ctx.burstIdx : R.burstN;
      /* первые 2–3 выстрела сильнее: стрелок ещё не «сел» на оружие; дальше —
         ровная дрожь (мышцы держат ствол, импульсы складываются) */
      const bk = n === 0 ? 1.15 : n === 1 ? 1.0 : n === 2 ? 0.82 : 0.56 + 0.05 * Math.sin(n * 2.1 + P.seed);
      const ads = sat(ctx.ads || 0), cr = sat(ctx.crouch || 0), pr = sat(ctx.prone || 0);
      R.adsK = ads;
      const mv = sat(ctx.moving || 0), bip = !!ctx.bipod;
      const tr = ctx.trait || 1;
      /* v8: хват (передняя рукоятка / упор: 0..1) и усталость (0..1) */
      const grip = sat(ctx.grip || 0), fat = sat(ctx.fatigue || 0);
      R.fatigue = fat;
      R.shotN++;
      /* партия патронов: навеска и скорость гуляют — импульс ±1–1,5 % */
      const lot = 1 + 0.012 * clamp(gauss(R.shotN + P.seed * 100), -2.5, 2.5);
      /* стойка: лёжа тело принимает удар землёй — почти без подброса;
         в движении опоры нет — сильнее; в прицеле щека на прикладе гасит увод */
      const stRise = (1 - 0.15 * cr) * lerp(1, 0.3, pr) * (1 + 0.35 * mv) * (bip ? 0.22 : 1) * (1 - 0.15 * ads) * (1 - 0.08 * grip) * (1 + 0.22 * fat);
      const stBack = (1 - 0.08 * cr) * lerp(1, 0.75, pr) * (1 + 0.2 * mv) * (bip ? 0.55 : 1) * (1 - 0.1 * ads);
      const stSide = lerp(1, 0.4, ads) * (1 - 0.2 * cr) * lerp(1, 0.45, pr) * (1 + 0.4 * mv) * (bip ? 0.35 : 1) * (1 - 0.15 * grip) * (1 + 0.3 * fat);
      const body = lerp(1, 0.15, pr) * (1 + 0.5 * mv) * (bip ? 0.3 : 1);
      /* рисунок — тот же детерминированный, что и у сбива наводки */
      const sd = P.seed;
      const pat = (o) => Math.sin(n * 0.62 + sd + o) * 0.75 + Math.sin(n * 1.37 + sd * 2.3 + o) * 0.25;
      const yawDir = clamp(P.yawBias * 0.7 + pat(0) * 0.6 * clamp((n - 1) / 3, 0.3, 1) * (1 - Math.abs(P.yawBias) * 0.4), -1.3, 1.3);
      const rollDir = lerp(P.rollMin, P.rollMax, 0.5 + 0.5 * pat(4.0));
      const jit = 1 + 0.06 * pat(1.7);
      const k = bk * tr * jit * lot;
      const a = {
        back: BASE.back * P.back * P.kBack * stBack * k,
        up: BASE.up * P.rise * (P.kUp || 1) * stRise * k,
        pitch: BASE.pitch * P.rise * P.kPitch * stRise * k,
        yaw: BASE.yaw * P.side * yawDir * stSide * k,
        /* v11: пистолет у правши «закручивает» по часовой — заметный крен */
        roll: BASE.roll * P.side * rollDir * stSide * k * (P.pistol ? 1.25 : 1),
        sh: P.shoulder * stBack * body * k,
        torso: 0.018 * Math.sqrt(P.E / REF.E) * body * k * (P.pistol ? 0.3 : 1),
        twist: 0.010 * P.side * yawDir * body * k,
        nod: 0.022 * Math.sqrt(P.E / REF.E) * body * k * (1 - 0.3 * ads),
        hop: bip ? 0.006 * P.back * k : 0
      };
      while (R.ev.length >= 48) R.ev.shift();
      R.ev.push({ t0: R.t, a });
      /* v8: удары автоматики. Рама в заднем положении — второй толчок назад
         и чуть вверх; накат — клевок вперёд-вниз (на последнем патроне с
         затворной задержкой рамы нет — она осталась сзади). */
      const op = P.op, last = !!ctx.last;
      if (op.kind !== 'pump' && op.rear > 0) {
        const tb = P.cycle * op.tb;
        R.ev.push({ t0: R.t + tb, tr: 0.005, td: 0.040, os: 0.15,
          a: { back: a.back * op.rear * 0.55, up: a.up * op.rear * 0.25, pitch: a.pitch * op.rear * 0.16, sh: a.sh * op.rear * 0.45, yaw: a.yaw * op.rear * 0.1, roll: 0, torso: 0, twist: 0, nod: 0, hop: a.hop * 0.3 } });
        if (!(last && P.boltHold)) {
          R.ev.push({ t0: R.t + P.cycle, tr: 0.007, td: 0.055, os: 0.12,
            a: { back: -a.back * op.fwd * 0.40, up: -a.up * op.fwd * 0.30, pitch: -a.pitch * op.fwd * 0.20, sh: -a.sh * op.fwd * 0.12, yaw: 0, roll: a.roll * op.fwd * 0.15, torso: 0, twist: 0, nod: 0, hop: 0 } });
        }
        R.cam2 = { t0: R.t + tb, p: 0.0011 * op.rear * Math.sqrt(P.E / REF.E) * lerp(1, 0.3, ads), t1: R.t + P.cycle, q: (last && P.boltHold) ? 0 : -0.0008 * op.fwd * Math.sqrt(P.E / REF.E) * lerp(1, 0.3, ads) };
      }
      R.locked = last && P.boltHold && op.kind !== 'pump';
      /* нагрев: каждый выстрел — ΔT, с глушителем газы дольше в стволе */
      R.heat.T += P.dTshot * lot;
      R.heat.shots++;
      if (R.heat.T > R.heat.peak) R.heat.peak = R.heat.T;
      /* камера от первого лица: короткий «тычок» ≤ 40 мс и импульс поля зрения */
      /* v9: в прицеле — без импульса поля зрения (масштаб кадра «пульсировал»
         вместе с маркой) и с меньшим тычком/креном: глаз на линии прицела */
      {
        /* амплитуда пика (рад): АК-74 в прицеле ≈ 8 мрад (0,45°), от бедра ×1,6;
           растёт с энергией отдачи (АКМ, СВД, дробовик), у пистолета — резче */
        const eK = Math.min(2.0, Math.sqrt(P.E / REF.E));
        /* v11: 0,015 → 0,021 (АК-74 в прицеле ≈ 0,7°, АКМ ≈ 1,1°): удар
           должен читаться и на ровной очереди; пистолет — ×1,5 (кисть, а не
           плечо: ствол «бьёт» резче) */
        const A = 0.021 * eK * (P.pistol ? 1.5 : 1) * lerp(1.6, 1, ads) * stRise * tr * lerp(1, bk, 0.3) * (1 - 0.12 * grip);
        const side = (Math.random() - 0.5) * 2;
        R.pun.vp += A * PUN_V;
        R.pun.vy += A * (0.36 * side + 0.22 * yawDir) * (P.side || 1) * PUN_V;
        /* v11: крен кадра на выстреле (±0,3–0,6°): ровная очередь «трясёт»
           картинку, а не только качает её по вертикали; знак — от завала
           образца и случайный */
        const sr = (Math.random() - 0.5) * 2;
        R.pun.vr += A * (0.55 * sr + 0.45 * rollDir) * (P.side || 1) * lerp(1.3, 0.8, ads) * PUN_V;
      }
      R.camKick = { t0: R.t, p: 0.0030 * Math.sqrt(P.E / REF.E) * (P.pistol ? 0.7 : 1) * lerp(1, 0.4, ads) * lerp(1, 0.5, pr),
        r: 0.0025 * rollDir * P.side * lerp(1, 0.35, ads), fov: 0.9 * Math.pow(P.E / REF.E, 0.4) * (1 - ads) };
      /* выброс гильзы — в крайней задней точке рамы/кожуха (у помпы — от цевья) */
      /* v11: видимый цикл кожуха-затвора. Настоящий ход кожуха Glock — ~20 мс
         назад и ~25 мс вперёд: при 60 Гц это ОДИН кадр, затвор «не видно».
         Как в играх с покадровой анимацией (Insurgency, Tarkov): в одиночном
         огне кожух задерживается в заднем положении на 2–3 кадра; в
         автоматическом — физический цикл (иначе не успеет к следующему). */
      R.cycV = (P.pistol && !ctx.auto) ? Math.max(P.cycle, 0.075) : P.cycle;
      if (!P.pump) { R.ejectAt = R.t + P.cycle * P.op.tb; R.ejectDone = false; }
      R.mechT0 = R.t;
      return a;
    };

    const SUB = 1 / 480, W = 240;   // догонялка: критическое демпфирование, ω = 240 рад/с (запаздывание ≈ 8 мс)
    const LAG = 2 / W;
    R.update = (dt) => {
      if (!(dt > 0)) return R.out;
      dt = Math.min(dt, 0.1);
      /* v10: пружина view punch (полунеявный Эйлер, шаги ≤ 1/240 с) */
      {
        const pu = R.pun; let rem = dt;
        while (rem > 1e-6) {
          const h = Math.min(rem, 1 / 240); rem -= h;
          pu.vp += (-PUN_W * PUN_W * pu.p - 2 * PUN_Z * PUN_W * pu.vp) * h; pu.p += pu.vp * h;
          pu.vy += (-PUN_W * PUN_W * pu.y - 2 * PUN_Z * PUN_W * pu.vy) * h; pu.y += pu.vy * h;
          pu.vr += (-PUN_W * PUN_W * pu.r - 2 * PUN_Z * PUN_W * pu.vr) * h; pu.r += pu.vr * h;
        }
        if (Math.abs(pu.p) + Math.abs(pu.vp) * 0.01 < 1e-6) pu.p = pu.vp = 0;
        if (Math.abs(pu.y) + Math.abs(pu.vy) * 0.01 < 1e-6) pu.y = pu.vy = 0;
        if (Math.abs(pu.r) + Math.abs(pu.vr) * 0.01 < 1e-6) pu.r = pu.vr = 0;
        R.cam.punchP = pu.p; R.cam.punchY = pu.y; R.cam.punchR = pu.r;
      }
      R.t += dt; R.sinceShot = R.t - R.lastShot;
      const P = R.prof;
      /* сумма фаз всех «живых» выстрелов */
      for (const c of CH) R.raw[c[0]] = 0;
      const tP1 = P.tPeak * 1.25, tP2 = P.tPeak * 1.7;
      let live = 0;
      for (let i = 0; i < R.ev.length; i++) {
        const e = R.ev[i], t = R.t - e.t0;
        if (e.tr !== undefined) {
          /* удары автоматики: свои короткие фазы */
          if (t > e.tr + e.td + 0.02) continue;
          live++;
          if (t <= 0) continue;
          const f = phase(t, Math.max(0.003, e.tr), e.td, e.os);
          for (const c of CH) { const v = e.a[c[0]]; if (v) R.raw[c[0]] += v * f; }
          continue;
        }
        if (t > P.tPeak * 2 + P.tRet * 1.3) continue;
        live++;
        for (const c of CH) {
          /* фазы задаются с поправкой на запаздывание сглаживания (2/ω) */
          const tr = Math.max(0.006, (c[1] === 'k' ? P.tKick : c[1] === 'p' ? P.tPeak : c[1] === 'p1' ? tP1 : tP2) - LAG);
          R.raw[c[0]] += e.a[c[0]] * phase(t, tr, P.tRet * c[2], P.os * c[3]);
        }
      }
      if (!live && R.ev.length) R.ev.length = 0;
      else if (R.ev.length > 24) R.ev = R.ev.filter((e) => R.t - e.t0 < (e.tr !== undefined ? e.tr + e.td + 0.02 : P.tPeak * 2 + P.tRet * 1.3) || R.t < e.t0);
      /* мягкий предел: очередь не задирает ствол бесконечно */
      const capP = BASE.pitch * P.rise * P.kPitch * 2.4 + 1e-6, capB = BASE.back * P.back * P.kBack * 1.7 + 1e-6;
      R.raw.pitch = capP * Math.tanh(R.raw.pitch / capP);
      R.raw.back = capB * Math.tanh(R.raw.back / capB);
      /* сглаживание с подшагами — не зависит от FPS */
      const n = Math.max(1, Math.ceil(dt / SUB)), h = dt / n;
      for (let s = 0; s < n; s++) {
        for (const c of CH) {
          const k = c[0];
          const x = R.x[k], v = R.vel[k];
          const acc = W * W * (R.raw[k] - x) - 2 * W * v;
          R.vel[k] = v + acc * h;
          R.x[k] = x + R.vel[k] * h;
        }
      }
      for (const c of CH) R.out[c[0]] = R.x[c[0]];
      /* v11: голова уходит назад вместе с плечом (винтовка: приклад в плече,
         щека на прикладе — 5–15 мм; пистолет — только через руки). Это
         «толчок в грудь» — параллакс ближних предметов, без поворота взгляда. */
      R.cam.back = R.out.sh * (P.pistol ? 0.35 : 0.8) * lerp(1, 1.15, R.adsK || 0);
      /* камера: короткий толчок */
      const ck = R.camKick;
      R.cam.pitch = R.cam.roll = R.cam.fov = 0;
      if (ck) {
        const t = R.t - ck.t0, f = phase(t, 0.009, 0.030, 0.2), g = phase(t, 0.012, 0.045, 0);
        R.cam.pitch = ck.p * f; R.cam.roll = ck.r * f; R.cam.fov = ck.fov * g;
        if (t > 0.08) { R.camKick = null; R.cam.pitch = R.cam.roll = R.cam.fov = 0; }
      }
      /* v8: удар рамы и накат — ещё два коротких толчка камеры */
      const c2 = R.cam2;
      if (c2) {
        const ta = R.t - c2.t0, tb2 = R.t - c2.t1;
        const f1 = phase(ta, 0.006, 0.026, 0.1), f2 = phase(tb2, 0.007, 0.03, 0.1);
        R.cam.pitch += c2.p * f1 + c2.q * f2;
        if (tb2 > 0.06) R.cam2 = null;
      }
      /* v8: физиологический тремор 8–12 Гц (усталость, адреналин после
         очереди): аналитический, от времени — не зависит от FPS */
      {
        const tt = R.t, fk = R.fatigue;
        const ex = Math.exp(-Math.max(0, R.sinceShot) / 1.2);
        const A = (0.00012 + 0.0011 * fk + 0.0004 * ex) * (R.adsK !== undefined ? lerp(1, 0.55, R.adsK) : 1);
        R.tremor = A;
        R.out.tp = A * (Math.sin(tt * 61.3) * 0.6 + Math.sin(tt * 73.9 + 1.3) * 0.4);
        R.out.ty = A * 0.7 * (Math.sin(tt * 57.1 + 0.7) * 0.6 + Math.sin(tt * 79.7 + 2.1) * 0.4);
        /* тремор — в видимый ствол (интегратор R.x не трогаем) */
        R.out.pitch += R.out.tp; R.out.yaw += R.out.ty;
      }
      /* v8: остывание ствола — конвекция (сильнее на ветру и под дождём,
         капли испаряются) + излучение серого тела (ε ≈ 0,8) */
      {
        const H = R.heat, op = P.op;
        if (H.T > H.Ta + 0.01) {
          const Tk = H.T + 273.15, Tak = H.Ta + 273.15;
          const hc = 9 + 4 * Math.sqrt(Math.min(12, H.wind)) + 30 * H.wet * sat((H.T - 30) / 70);
          const q = hc * (H.T - H.Ta) + 0.8 * 5.67e-8 * (Tk * Tk * Tk * Tk - Tak * Tak * Tak * Tak);
          H.T = Math.max(H.Ta, H.T - q * op.A / (op.mb * 460) * dt);
        } else H.T = H.Ta;
      }
      /* механика: рама назад за ~40 % цикла, вперёд — остальное */
      if (R.mechT0 !== undefined && !P.pump) {
        const cyc = R.cycV || P.cycle;
        const t = R.t - R.mechT0, back = P.cycle * P.op.tb, hold = back + Math.max(0, cyc - P.cycle);
        let s = 0;
        if (t < back) { const u = t / back; s = u * u * (3 - 2 * u) * 0.25 + u * 0.75; }
        else if (R.locked || t < hold) s = 1;
        else if (t < cyc) { const u = (t - hold) / (cyc - hold); s = 1 - u * u * (3 - 2 * u); }
        R.mech.slide = clamp(s, 0, 1);
        /* удар рамы в крайних точках — мелкая дрожь корпуса */
        R.mech.carrierShake = P.carrier * (Math.exp(-Math.abs(t - back) * 120) + 0.6 * Math.exp(-Math.abs(t - P.cycle) * 140));
      }
      if (!R.ejectDone && R.t >= R.ejectAt) { R.ejectDone = true; if (R.onEject) R.onEject(); }
      return R.out;
    };
    /* v11: внешний толчок взгляда (удар по магазину, досыл затвора, падение):
       p/y/r — пик в радианах, через ту же пружину view punch */
    R.impulse = (p, y, r) => { R.pun.vp += (p || 0) * PUN_V; R.pun.vy += (y || 0) * PUN_V; R.pun.vr += (r || 0) * PUN_V; };
    R.reset = () => { R.ev.length = 0; for (const c of CH) { R.raw[c[0]] = R.out[c[0]] = R.vel[c[0]] = R.x[c[0]] = 0; } R.camKick = null; R.cam2 = null; R.cam.pitch = R.cam.roll = R.cam.fov = 0; R.pun.p = R.pun.vp = R.pun.y = R.pun.vy = R.pun.r = R.pun.vr = 0; R.cam.punchP = R.cam.punchY = R.cam.punchR = R.cam.back = 0; R.mech.slide = 0; R.ejectDone = true; R.locked = false; R.out.tp = R.out.ty = 0; };
    return R;
  }

  return { create, profileFor, phase, AMMO, GEOM, MUZZLE, BASE, REF, OPS, AMBIENT };
});
