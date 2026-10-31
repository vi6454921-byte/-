
/* ==========================================================================
   МОДУЛЬ: anim/locomotion.js
   ========================================================================== */
/* ============================================================================
   Походка и стойка бойца.

   Углы суставов ног — ключевые кривые по фазе цикла (0 — касание стопы),
   снятые с биомеханики ходьбы и бега: сгиб бедра, колена, голеностопа и
   пальцев стопы. Шаг и бег смешиваются по скорости; на бегу есть фаза
   полёта, высокий вынос колена и захлёст голени, на шаге — перекат с пятки
   на носок. Таз вращается и наклоняется в такт, грудь отвечает встречным
   поворотом, голова стабилизирована.

   Каденс реальный: шаг ~2,4 шага/с, бег ~2,8 шага/с. Раньше цикл на бегу
   доходил до 5,5 шага/с — ноги семенили.

   Вариации: у каждого бойца своя стойка (ширина, перенос веса, сгиб колен)
   и своя «жизнь» в строю — переминание, повороты головы.
   ========================================================================== */
(function (root, factory) {
  const L = factory(root.GUtil || (typeof require !== 'undefined' ? require('../core/util.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  else root.GLoco = L;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  const D = Math.PI / 180;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  /* Периодический сплайн Катмулла—Рома по ключам [[фаза, значение], ...]. */
  function curve(keys) {
    const n = keys.length;
    return (ph) => {
      const p = ((ph % 1) + 1) % 1;
      let i = n - 1;
      for (let k = 0; k < n; k++) if (keys[k][0] <= p) i = k;
      const k0 = keys[(i - 1 + n) % n], k1 = keys[i], k2 = keys[(i + 1) % n], k3 = keys[(i + 2) % n];
      const t0 = k1[0], t1 = k2[0] > t0 ? k2[0] : k2[0] + 1;
      const pp = p >= t0 ? p : p + 1;
      const t = (pp - t0) / (t1 - t0);
      const v0 = k0[1], v1 = k1[1], v2 = k2[1], v3 = k3[1];
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * v1) + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 + (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
    };
  }

  /* Градусы. Бедро: + — мах вперёд. Колено: + — сгиб. Голеностоп: + — тыльное
     сгибание (носок вверх). Пальцы стопы: + — разгибание при перекате. */
  const WALK = {
    hip: curve([[0, 24], [0.10, 20], [0.30, 6], [0.50, -10], [0.62, -5], [0.75, 14], [0.88, 26]]),
    knee: curve([[0, 4], [0.12, 16], [0.30, 6], [0.45, 8], [0.60, 36], [0.72, 60], [0.85, 30], [0.95, 6]]),
    ankle: curve([[0, 0], [0.07, -6], [0.25, 4], [0.45, 10], [0.60, -14], [0.70, -4], [0.85, 2]]),
    toe: curve([[0, 0], [0.42, 2], [0.55, 22], [0.62, 16], [0.72, 0], [0.9, 0]]),
    stance: 0.60
  };
  const RUN = {
    hip: curve([[0, 30], [0.14, 14], [0.32, -16], [0.44, -8], [0.62, 30], [0.80, 44], [0.92, 36]]),
    knee: curve([[0, 20], [0.12, 42], [0.32, 18], [0.45, 72], [0.60, 108], [0.75, 82], [0.88, 36], [0.96, 22]]),
    ankle: curve([[0, 4], [0.12, 16], [0.30, -24], [0.42, -12], [0.65, 6], [0.85, 6]]),
    toe: curve([[0, 0], [0.20, 6], [0.30, 26], [0.38, 4], [0.50, 0], [0.85, 0]]),
    stance: 0.34
  };

  /* Частота цикла (циклов/с = пол-шага на ногу) по скорости и спринту. */
  /* На полусогнутых шаг короче и чаще: «гусиным шагом» идут ~2,6 шага/с
     при 1,2 м/с — длина шага около 0,48 м против 0,6 м в полный рост. */
  function cadence(speed, sprint, crouch) {
    return U.lerp(0.95, 1.22, clamp((speed - 0.6) / 2.0, 0, 1)) + 0.18 * sprint + 0.30 * (crouch || 0);
  }

  /* ------------------------------------------------------- присед --- */
  /* Присед в двух формах, как у живого стрелка.

     На месте — изготовка «с колена» (НСД, TC 3-22.9): правое колено на
     земле, правая голень назад, носок подогнут (опора на подушечку,
     пятка вверх), таз почти сидит на пятке; левая стопа вынесена вперёд,
     голень левой ноги почти вертикальна. Таз развёрнут вправо (левым
     плечом к цели), корпус почти прямой.

     В движении на коленях не ходят — это «гусиный шаг»: колени согнуты
     ~90°, таз на высоте ~0,72 от роста таза стоя, корпус наклонён вперёд
     на ~25°, голова поднята, шаг короткий и частый.

     k — степень приседа (0…1), m — доля хода (0 — на колене, 1 — идёт).
     Высота глаз и их вынос вперёд выведены из позы скелета, чтобы камера
     стояла там же, где голова бойца. */
  /* Положение лёжа с оружием (НСД, «изготовка лёжа»): корпус вдоль линии
     огня, таз и бёдра на грунте, грудь приподнята на локтях, голова
     поднята, ноги разведены, носки развёрнуты наружу. Точка бойца — под
     глазами, тело уходит назад: таз в hipBack за ней. */
  const PRONE = { hipBack: 0.66, hipUp: 0.13, eyeY: 0.395, eyeFwd: 0.10 };
  function crouchProfile(c, M) {
    const k = sstep(0, 1, c.crouch || 0);
    const m = sstep(0, 1, c.crouchMove || 0);
    const S = (M.thigh || 0.454) / 0.454;
    const kneelHip = 0.440 * S, walkHip = 0.735 * S;
    /* v23: перелаз — профиль по кривым тела GTraversal.body (мировые высоты таза
       и глаз): камера от первого лица идёт за головой модели */
    const TR = (typeof self !== 'undefined' ? self : globalThis).GTraversal;
    const VB = c.vault && TR && TR.body ? TR.body(c, M) : null;
    if (VB) return {
      k: 1, m: 1, S, hipY: VB.hipW - c.pos.y, lean: VB.lean, yaw: 0,
      eyeY: VB.eyeW - c.pos.y, eyeFwd: VB.eyeFwd, vFwd: VB.fwd || 0,
      pk: 0, pEyeY: PRONE.eyeY, pEyeFwd: PRONE.eyeFwd
    };
    return {
      k, m, S,
      hipY: U.lerp(kneelHip, walkHip, m),
      lean: U.lerp(0.075, 0.44, m),                 // наклон корпуса вперёд, рад
      yaw: -0.40 * (1 - m),                          // разворот таза вправо на колене
      eyeY: U.lerp(1.140, 1.368, m) * S,             // высота глаз над грунтом (замер по костям глаз)
      eyeFwd: U.lerp(0.010, 0.234, m) * S,           // вынос глаз вперёд от наклона
      /* лёжа: доля позы и глаза над грунтом / вперёд от точки бойца */
      pk: sstep(0.12, 1, c.prone || 0),
      pEyeY: PRONE.eyeY, pEyeFwd: PRONE.eyeFwd
    };
  }

  /* Ноги и таз на фазе цикла. c — контроллер (stepPhase, speed, sprint,
     crouch), M — метрики скелета. Возвращает углы (рад) по ногам и
     добавки к тазу/груди. */
  function gait(c, M, stance) {
    const st = stance || {};
    const walkSpd = 2.55, runSpd = 4.55;
    const gaitK = clamp(c.speed / 1.1, 0, 1);                 // на месте ноги стоят
    const runK = sstep(walkSpd * 0.92, runSpd * 0.92, c.speed) * (1 - c.crouch * 0.7);
    /* амплитуда маха под длину шага: быстрее — шире, но в пределах сустава */
    const freq = cadence(c.speed, c.sprint, c.crouch);
    const stepLen = c.speed / Math.max(freq, 0.5);
    const ampK = clamp(stepLen / U.lerp(1.6, 2.8, runK), 0.55, 1.2);   // длина цикла ключевых кривых
    const legs = {};
    for (const side of [1, -1]) {
      const SS = side > 0 ? 'R' : 'L';
      const ph = c.stepPhase + (side > 0 ? 0 : 0.5);
      const mix = (f) => U.lerp(WALK[f](ph), RUN[f](ph), runK) * D;
      const hip = mix('hip') * ampK;
      const knee = mix('knee');
      const ankle = mix('ankle');
      const toe = mix('toe');
      const stanceF = U.lerp(WALK.stance, RUN.stance, runK);
      const p = ((ph % 1) + 1) % 1;
      /* опорность: 1 в опоре, 0 в переносе, мягкие края */
      const plant = sstep(0, 0.04, p) * (1 - sstep(stanceF - 0.04, stanceF + 0.02, p)) + (p > 0.97 ? 1 : 0);
      legs[SS] = {
        hip: hip * gaitK, knee: knee * gaitK, ankle: ankle * gaitK, toe: toe * gaitK,
        plant: 1 - gaitK * (1 - clamp(plant, 0, 1))
      };
    }
    /* таз: вращение к ноге в переносе, наклон вниз на её сторону,
       вертикаль — две волны на цикл (на бегу низ в середине опоры) */
    const ph2 = c.stepPhase * Math.PI * 2;
    const pelvisYaw = Math.sin(ph2) * U.lerp(4, 7, runK) * D * gaitK;
    const pelvisRoll = Math.sin(ph2 * 2 - 0.4) * U.lerp(2.5, 3.5, runK) * D * gaitK;
    const bob = (U.lerp(Math.cos(ph2 * 2) * 0.018, -Math.cos(ph2 * 2 - 0.9) * 0.032, runK)) * gaitK;
    const sway = Math.sin(ph2) * U.lerp(0.018, 0.010, runK) * gaitK;
    return {
      legs, freq, runK, gaitK, pelvisYaw, pelvisRoll, bob, sway,
      /* встречный поворот груди и наклон корпуса вперёд на бегу */
      chestYaw: -pelvisYaw * U.lerp(1.1, 1.5, runK),
      lean: U.lerp(0.05, 0.20, runK) * gaitK + (st.lean || 0),
      headComp: -pelvisYaw * 0.4
    };
  }

  /* ------------------------------------------------------ вариации --- */
  /* Стойка бойца в строю по зерну: у каждого своя ширина ног, перенос
     веса, сгиб колен и манера держать голову. */
  function stanceFor(seed) {
    const r = (k) => { const x = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
    return {
      width: U.lerp(0.030, 0.042, r(1)),        // разведение бёдер, рад
      weight: U.lerp(-0.25, 0.25, r(2)),              // перенос веса: -1 левая, +1 правая
      bend: U.lerp(0.015, 0.035, r(3)),           // тонус колен
      toeOut: U.lerp(0.02, 0.06, r(4)),
      headTilt: U.lerp(-0.015, 0.015, r(5)),
      lean: U.lerp(0.0, 0.012, r(6)),
      /* наклон оружия на ремне: ствол ниже/выше, разворот, высота */
      carryPitch: U.lerp(-0.08, 0.10, r(7)),
      carryYaw: U.lerp(-0.10, 0.10, r(8)),
      carryDrop: U.lerp(-0.02, 0.025, r(9)),
      period: U.lerp(7, 13, r(10))
    };
  }

  /* Медленная «жизнь» в строю: вес переходит с ноги на ногу, голова
     оглядывается. t — время, seed — зерно бойца. */
  function idleLife(t, seed, st) {
    const n = (f, k) => Math.sin(t * f + seed * k) * 0.6 + Math.sin(t * f * 0.37 + seed * k * 1.7) * 0.4;
    const shift = clamp(st.weight * 0.5 + n(2 * Math.PI / st.period, 1.3) * 0.25, -1, 1);
    return {
      shift,                                     // -1..1 — на какой ноге вес
      look: n(0.23, 2.1) * 0.22 + n(0.071, 5.3) * 0.15,
      nod: n(0.19, 3.7) * 0.06,
      breathe: n(0.9, 0.3)
    };
  }

  return { curve, WALK, RUN, cadence, crouchProfile, gait, stanceFor, idleLife, PRONE };
});
