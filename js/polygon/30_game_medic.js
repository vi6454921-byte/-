/* ==========================================================================
   AEGIS · полевая медицина: «Состояние» на экране, жгут и перевязка.
   v13: раны и кровотечения ведёт физиология (23a_physiology.js) —
   D.ph.src: источники (мл/с, артерия/вена, чем останавливается: жгут на
   конечность, тампонада паха/подмышки/шеи, окклюзионная повязка на грудь).
   Здесь — аптечка бойца, выбор помощи, время наложения, звук и HUD без
   полоски здоровья.
     • артериальное кровотечение конечности — жгут (останавливает полностью);
     • шея / таз — тампонада бинтом (−80%), грудь / живот — окклюзионная
       повязка (−35%: внутреннее кровотечение повязкой не остановить);
     • венозное — давящая повязка на одну рану.
   Клавиша «Перевязка» (K): себе или раненому генералу рядом, на кого смотрите.
   Неуправляемые раненые генералы через ~6 с оказывают себе помощь сами
   (если рядом нет управляемого генерала, который может помочь).
   ========================================================================== */
(function (root, factory) {
  const M = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else root.GMedic = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LIMB = { uarm: 1, farm: 1, thigh: 1, shin: 1 };
  const JUNC = { neck: 1, pelvis: 1 };
  const ZN = { neck: 'шея', thorax: 'грудь', abdomen: 'живот', pelvis: 'таз', uarm: 'плечо', farm: 'предплечье',
    thigh: 'бедро', shin: 'голень', hand: 'кисть', foot: 'стопа', head: 'голова' };
  const SIDE = { L: ' лев.', R: ' прав.' };
  const zoneName = (z, side) => (ZN[z] || z) + (SIDE[side] || '');
  const KIT = { tq: 2, bd: 3 };
  const TIME = { tq: 4.2, pack: 5.4, pressure: 4.6, bd: 3.3, seal: 4.0 };
  const KIND_NAME = { tq: 'Жгут', pack: 'Тампонада', pressure: 'Давящая повязка', bd: 'Перевязка', seal: 'Окклюзионная повязка' };

  function create(o) {
    const audio = o.audio, AE = o.AE;
    const MED = { onDone: null };
    const trait = (s) => (s && s.ctrl && s.ctrl.trait) || {};

    function kit(s) {
      if (!s.med) {
        const t = trait(s);
        s.med = { tq: KIT.tq + (t.kitTq || 0), bd: KIT.bd + (t.kitBd || 0), job: null, npcT: 0, msg: '', msgT: 0 };
      }
      return s.med;
    }
    MED.kit = kit;

    /* v13: раны — источники кровотечения D.ph.src (game/physiology.js),
       мл/с. Жгут — на конечность выше раны (останавливает всё ниже);
       тампонада — шея, пах, подмышка; окклюзионная повязка — грудь
       (дыхание легче, внутреннее кровотечение не остановить); давящая
       повязка — одна рана. */
    const LEG = { thigh: 1, shin: 1, foot: 1 }, ARM = { uarm: 1, farm: 1, hand: 1 };
    const limbOf = (z) => (LEG[z] ? 'leg' : ARM[z] ? 'arm' : null);
    const tqZone = (z) => (LEG[z] ? 'thigh' : 'uarm');
    function plan(t, K) {
      const D = t && t.dmg, st = D && D.ph;
      if (!D || t.finished || (st && st.dead) || /^(cns|fatal)$/.test(t.deathKind||'') || !st) return { none: 'Помощь не нужна' };
      let limbA = null, junc = null, chest = null, ven = null, internal = 0;
      for (const e of st.src) {
        if (e.tq || !(e.rate > 0.35)) continue;
        if (e.comp === 'limb' && limbOf(e.zone)) {
          if (e.art) { if (!limbA || e.rate > limbA.rate) limbA = e; }
          else if (e.dressed < 1 && (!ven || e.rate > ven.rate)) ven = e;
        } else if (e.comp === 'junc') { if (e.dressed < 2 && (!junc || e.rate > junc.rate)) junc = e; }
        else if (e.comp === 'chest') { if (e.dressed < 1 && (!chest || e.rate > chest.rate)) chest = e; }
        else internal += e.rate;
      }
      if (limbA && K.tq > 0) return { kind: 'tq', src: limbA.key, zone: tqZone(limbA.zone), side: limbA.side };
      if (limbA && K.bd > 0 && limbA.dressed < 2) return { kind: 'pressure', src: limbA.key, zone: limbA.zone, side: limbA.side };
      if (junc && K.bd > 0) return { kind: 'pack', src: junc.key, zone: junc.zone, side: junc.side };
      if (chest && K.bd > 0) return { kind: 'seal', src: chest.key, zone: chest.zone || 'thorax', side: chest.side };
      if (ven && K.bd > 0) return { kind: 'bd', src: ven.key, zone: ven.zone, side: ven.side };
      if (limbA || junc || chest || ven) return { none: K.tq + K.bd > 0 ? 'Повязка уже наложена' : 'Аптечка пуста' };
      if (internal > 1) return { none: 'Внутреннее кровотечение — повязкой не остановить' };
      return { none: 'Кровотечения нет' };
    }
    MED.plan = (t, healer) => plan(t, kit(healer || t));

    function apply(t, p, K) {
      const D = t.dmg, st = D && D.ph;
      if (!st) return;
      const S = st.src.find((e) => e.key === p.src);
      if (p.kind === 'tq') {
        const lb = limbOf(S ? S.zone : p.zone);
        for (const e of st.src) if (e.comp === 'limb' && limbOf(e.zone) === lb && (e.side || '') === (p.side || '')) e.tq = true;
        (D.tq || (D.tq = {}))[p.zone + (p.side || '')] = true;
        K.tq--;
      } else if (S) {
        if (p.kind === 'pressure') S.rate *= 0.4;
        else if (p.kind === 'pack') S.rate *= 0.2;
        else if (p.kind === 'seal') { S.rate *= 0.6; st.breath = Math.max(st.breath, 0.75); }
        else S.rate *= 0.12;
        S.dressed++;
        K.bd--;
      }
      if (t.bleedW) t.bleedW.rate *= 0.3;
    }
    const needsAid = (s) => {
      const st = s.dmg && s.dmg.ph;
      if (!st) return false;
      for (const e of st.src) if (!e.tq && e.comp !== 'none' && e.rate > (e.art ? 0.35 : 1.2) && e.dressed < (e.art ? 2 : 1)) return true;
      return false;
    };

    /* ----------------------------------------------------- звук -- */
    const au = () => audio && audio.ctx && audio.on && audio.nz && audio.ctx.state === 'running';
    function sndOpen(kind) {
      if (!au()) return;
      const t = audio.now(0.01);
      /* липучка / разрыв упаковки: серия коротких шорохов */
      for (let i = 0; i < 7; i++) audio.nz(t + i * 0.028 + Math.random() * 0.01, 0.035, { type: 'bandpass', freq: 2600 + Math.random() * 1400, q: 1.4, gain: 0.07, atk: 0.003 });
      if (kind !== 'tq') audio.nz(t + 0.22, 0.18, { type: 'highpass', freq: 3800, q: 0.7, gain: 0.05, atk: 0.02 });
    }
    function sndWork(kind, i) {
      if (!au()) return;
      const t = audio.now(0.005);
      if (kind === 'tq') {
        /* вороток жгута: щелчки фиксатора */
        audio.osc(t, 0.018, 1900, 1500, 0.05, 'square');
        audio.nz(t, 0.05, { type: 'bandpass', freq: 1300, q: 3, gain: 0.08, atk: 0.002 });
      } else {
        /* бинт тянется и шуршит по ткани */
        audio.nz(t, 0.26, { type: 'bandpass', freq: 1500 + (i % 3) * 500, freq2: 900, q: 0.9, gain: 0.045, atk: 0.08 });
      }
    }
    function sndDone() {
      if (!au()) return;
      const t = audio.now(0.01);
      audio.nz(t, 0.06, { type: 'bandpass', freq: 900, q: 2, gain: 0.08, atk: 0.003 });
    }

    /* ------------------------------------------------- действия -- */
    MED.busy = (s) => !!(s && s.med && s.med.job);
    function say(s, txt) { const K = kit(s); K.msg = txt; K.msgT = 2.2; }

    /* actor начинает помощь target (себе, если target не задан) */
    MED.start = function (actor, target) {
      const K = kit(actor);
      if (K.job) { MED.cancel(actor, 'Перевязка прервана'); return false; }
      const c = actor.ctrl;
      if (actor.dead) return false;
      if (c.reload >= 0) { say(actor, 'Сначала закончите перезарядку'); return false; }
      target = target || actor;
      const p = plan(target, K);
      if (p.none) { say(actor, target === actor ? p.none : p.none + ' · ' + nameOf(target)); return false; }
      const dur = TIME[p.kind] * (trait(actor).heal || 1) * (target === actor ? 1 : 0.9);
      K.job = { p, target, t: 0, dur, tick: 0, n: 0 };
      c.treating = true;
      c.pullTrigger && c.pullTrigger(false);
      c.adsWant = false;
      sndOpen(p.kind);
      return true;
    };
    MED.cancel = function (actor, why) {
      const K = actor && actor.med;
      if (!K || !K.job) return;
      K.job = null;
      actor.ctrl.treating = false;
      if (why) say(actor, why);
    };
    const nameOf = (s) => (s.gen ? s.gen.last : (s.char && s.char.preset && s.char.preset.name) || 'боец');

    MED.update = function (dt, squad, activeS) {
      for (const s of squad) {
        const c = s.ctrl;
        const K = s.med;
        /* плавное опускание оружия и наклон взгляда к ране */
        const want = K && K.job ? 1 : 0;
        c.healW = (c.healW || 0) + (want - (c.healW || 0)) * Math.min(1, dt * (want ? 6 : 4));
        if (c.healW < 0.002) c.healW = 0;
        if (K && K.msgT > 0) K.msgT -= dt;
        if (s.dead) { if (K && K.job) MED.cancel(s); continue; }
        /* неуправляемый раненый оказывает себе помощь сам */
        if (!MED.managedAI && s !== activeS && needsAid(s)) {
          const KK = kit(s);
          /* если рядом управляемый генерал — ждёт его помощи */
          const near = activeS && !activeS.dead && Math.hypot(activeS.ctrl.pos.x - c.pos.x, activeS.ctrl.pos.z - c.pos.z) < 3.5;
          if (!KK.job) {
            KK.npcT += dt;
            if (KK.npcT > (near ? 13 : 6) + (s.idleSeed || 0) % 2) { KK.npcT = 0; MED.start(s, s); }
          }
        }
        if (!K || !K.job) { if (c.treating) c.treating = false; continue; }
        const J = K.job, tg = J.target;
        if (!tg.dmg || tg.finished || (tg.dmg.ph&&tg.dmg.ph.dead) || /^(cns|fatal)$/.test(tg.deathKind||'')) { MED.cancel(s, tg === s ? null : 'Раненый погиб'); continue; }
        if (tg !== s) {
          const targetPosition = MED.position ? MED.position(tg) : tg.ctrl.pos;
          const d = Math.hypot(targetPosition.x - c.pos.x, targetPosition.z - c.pos.z);
          if (d > 2.4) { MED.cancel(s, 'Слишком далеко от раненого'); continue; }
        }
        if (c.sprint > 0.35) { MED.cancel(s, 'Перевязка прервана'); continue; }
        /* на ходу медленнее */
        const mv = Math.min(1, (c.speed || 0) / 1.6);
        J.t += dt * (1 - mv * 0.55);
        J.tick -= dt;
        if (J.tick <= 0 && J.t > 0.35 && J.t < J.dur - 0.2) {
          J.tick = J.p.kind === 'tq' ? 0.32 : 0.55; J.n++;
          if (s === activeS || tg === activeS) sndWork(J.p.kind, J.n);
        }
        /* куда смотреть: на свою рану или на раненого */
        let look = 0.3;
        if (tg === s) look = J.p.zone === 'thigh' || J.p.zone === 'shin' ? 0.95 : J.p.zone === 'uarm' || J.p.zone === 'farm' ? 0.55 : J.p.zone === 'pelvis' ? 0.85 : 0.7;
        c.healLook = look;
        if (J.t >= J.dur) {
          apply(tg, J.p, K);
          K.job = null; c.treating = false;
          if (s === activeS || tg === activeS) sndDone();
          say(s, KIND_NAME[J.p.kind] + (J.p.zone ? ' · ' + zoneName(J.p.zone, J.p.side) : '') + ' — готово' + (tg !== s ? ' (' + nameOf(tg) + ')' : ''));
          if (MED.onDone) MED.onDone(s, tg, J.p);
        }
      }
    };

    /* раненый генерал впереди на расстоянии вытянутой руки */
    MED.targetAhead = function (a, squad, camera) {
      if (!camera) return null;
      const cp = camera.position;
      const fx = -Math.sin(a.ctrl.yaw), fz = -Math.cos(a.ctrl.yaw);
      let best = null, bd = 1e9;
      for (const s of squad) {
        if(s===a||!s.dmg||s.finished||s.dmg.ph&&s.dmg.ph.dead)continue;
        const dx = s.ctrl.pos.x - cp.x, dz = s.ctrl.pos.z - cp.z, d = Math.hypot(dx, dz);
        if (d > 2.0 || d < 0.05) continue;
        if ((dx * fx + dz * fz) / d < 0.6) continue;
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    };

    /* --------------------------------------------------------- HUD -- */
    const H = {};
    function el(tag, cls, parent, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }
    /* v13: вместо полоски «Здоровье» — состояние бойца словами: что ранено,
       что из этого следует (не стоит, хромает, рука не держит, одышка),
       куда идёт кровь и что с ней делать. Без чисел: боец не знает свои
       «очки», он чувствует слабость и видит кровь. */
    MED.mountHUD = function (hud) {
      if (!hud || H.box) return;
      H.box = el('div', '', hud); H.box.id = 'vitals';
      const hd = el('div', 'vh', H.box, '<span>Состояние</span>');
      H.hp = el('b', '', hd);
      H.st = el('div', 'vst', H.box);
      H.sy = el('div', 'vsy', H.box);
      H.kit = el('div', 'vkit', H.box);
      H.msg = el('div', 'vmsg', H.box);
      H.tr = el('div', '', hud); H.tr.id = 'treat';
      H.tr.innerHTML = '<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="bg"/><circle cx="22" cy="22" r="19" class="fg"/></svg><div class="tl"></div><div class="ts"></div>';
      H.ring = H.tr.querySelector('.fg'); H.tl = H.tr.querySelector('.tl'); H.ts = H.tr.querySelector('.ts');
      H.last = {};
    };
    const set = (k, el2, v, prop) => { if (H.last[k] !== v) { H.last[k] = v; if (prop) el2.style[prop] = v; else el2.innerHTML = v; } };
    const cls = (k, el2, v) => { if (H.last[k] !== v) { H.last[k] = v; el2.className = v; } };
    const esc = (x) => String(x).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    MED.status = function (a) {
      const D = a && a.dmg, st = D && D.ph;
      if (!st) return null;
      const c = a.ctrl || {};
      const lines = [];
      /* кровотечения: по ранам, сильные — первыми */
      const src = st.src.slice().sort((x, y) => (y.cur || y.rate) - (x.cur || x.rate));
      for (const e of src) {
        const r = e.cur === undefined ? e.rate : e.cur;
        const where = zoneName(e.zone || '', e.side);
        if (e.tq) { lines.push(['c-tq', 'Жгут · ' + zoneName(tqZone(e.zone), e.side)]); continue; }
        if (r < 0.35) continue;
        if (e.art && r > 3) lines.push(['c-art', 'Артериальное кровотечение · ' + (e.comp === 'none' ? e.name : where)]);
        else if (e.comp === 'none' && r > 1) lines.push(['c-ven', 'Внутреннее кровотечение · ' + e.name]);
        else if (r > 1.2) lines.push(['c-ven', 'Кровотечение · ' + where + (e.dressed ? ' (повязка)' : '')]);
        else if (!e.dressed) lines.push(['c-min', 'Кровит · ' + where]);
      }
      /* последствия ран (переломы, паралич, лёгкое…) */
      for (const i of st.inj) if (!/Артериальное|Сильное кровотечение/.test(i.text)) lines.push([i.sev >= 3 ? 'c-fr3' : i.sev >= 2 ? 'c-fr' : 'c-min', i.text]);
      const seen = new Set();
      const uniq = lines.filter((l) => (seen.has(l[1]) ? false : (seen.add(l[1]), true)));
      let word = 'Боеспособен', lvl = 0;
      if (uniq.length) { word = 'Ранен'; lvl = 1; }
      if (c.legDown) { word = st.para ? 'Ноги парализованы' : 'Не может стоять'; lvl = 2; }
      if ((st.shock || 0) > 0.55 || st.bleedArt > 3) { word = 'Тяжело ранен'; lvl = 3; }
      return { word, lvl, lines: uniq, sym: GPhysSym(st) };
    };
    const GPhysSym = (st) => ((typeof self !== 'undefined' ? self : globalThis).GPhys ? self.GPhys.symptoms(st) : null);

    MED.hud = function (a, dt, squad, camera, keyName) {
      if (!H.box) return;
      if (!a || !a.dmg || !a.dmg.ph) { cls('box', H.box, ''); cls('tr', H.tr, ''); return; }
      const D = a.dmg, K = kit(a), st = D.ph;
      const S = MED.status(a);
      set('hp', H.hp, S.word);
      set('st', H.st, S.lines.slice(0, 6).map((l) => '<i class="' + l[0] + '">' + esc(l[1]) + '</i>').join(''));
      set('sy', H.sy, S.sym ? '<span class="s' + S.sym.c + '">' + esc(S.sym.t) + '</span>' : '');
      const hk = keyName ? keyName('heal') : 'K';
      set('kit', H.kit, '<span>Жгут <b>' + K.tq + '</b></span><span>Бинт <b>' + K.bd + '</b></span><kbd>' + hk + '</kbd>');
      let msg = K.msgT > 0 ? K.msg : '';
      if (!msg && !K.job) {
        const ally = MED.targetAhead(a, squad, camera);
        const p = plan(a, K);
        if (ally && !plan(ally, K).none) msg = hk + ' — помочь: ' + nameOf(ally);
        else if (!p.none) msg = hk + ' — ' + KIND_NAME[p.kind].toLowerCase() + ' · ' + zoneName(p.zone, p.side);
      }
      set('msg', H.msg, msg);
      const danger = S.lvl >= 3 || st.bleedArt > 3 ? ' crit' : S.lvl === 2 ? ' low' : S.lines.length ? ' warn' : '';
      cls('box', H.box, 'on' + danger + (S.lines.length || S.sym ? ' hurt' : ''));
      /* кольцо наложения */
      const J = K.job;
      if (J) {
        cls('tr', H.tr, 'on');
        const k = Math.min(1, J.t / J.dur);
        set('ring', H.ring, String((119.4 * (1 - k)).toFixed(1)), 'strokeDashoffset');
        set('tl', H.tl, KIND_NAME[J.p.kind] + (J.p.zone ? ' · ' + zoneName(J.p.zone, J.p.side) : '') + (J.target !== a ? ' · ' + nameOf(J.target) : ''));
        set('ts', H.ts, Math.max(0, J.dur - J.t).toFixed(1).replace('.', ',') + ' с · ' + hk + ' — отменить');
      } else cls('tr', H.tr, '');
    };
    MED.zoneName = zoneName;
    return MED;
  }
  return { create, KIT, TIME };
});
