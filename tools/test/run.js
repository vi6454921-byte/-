#!/usr/bin/env node
/* ============================================================================
   Автотесты полигона: запускают собранный shooter.html в headless-хроме,
   проверяют загрузку, геометрию бойцов, хват оружия, стрельбу и мишени.
   Скриншоты складываются в tools/test/shots.
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PAGE = 'file://' + path.join(ROOT, 'shooter.html');
const SHOTS = path.join(__dirname, 'shots');
const CDN = path.join(__dirname, 'cdn');

let pass = 0, fail = 0;
const results = [];
function check(name, ok, info) {
  if (ok) { pass++; results.push('  ok   ' + name + (info ? '  — ' + info : '')); }
  else { fail++; results.push('  FAIL ' + name + (info ? '  — ' + info : '')); }
  return ok;
}

async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  /* Под SwiftShader кадр рисуется медленно, штатных 30 с не хватает. */
  await page.screenshot({ path: path.join(SHOTS, name + '.png'), timeout: 180000 });
}

(async () => {
  /* В песочнице нет GPU: WebGL поднимается только программным растеризатором
     SwiftShader через --use-gl=swiftshader (проверено на этом окружении). */
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 780 } });

  /* three.js берём из локального кэша: в песочнице сеть до unpkg медленная
     и тест не должен зависеть от внешнего сервиса. */
  await page.route('https://unpkg.com/**', (route) => {
    const u = new URL(route.request().url());
    const rel = u.pathname.replace(/^\/three@[^/]+\//, '');
    const file = path.join(CDN, rel);
    if (fs.existsSync(file)) {
      route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file, 'utf8') });
    } else route.continue();
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(PAGE, { waitUntil: 'load', timeout: 90000 });

  /* ждём инициализацию: __GAME появляется в конце запуска */
  /* Генерация полигона (текстуры, 4 бойца, трава) под программным
     рендером занимает больше минуты — ждём с запасом. */
  let ready = false;
  try {
    await page.waitForFunction(() => !!window.__GAME, null, { timeout: 240000 });
    ready = true;
  } catch (e) { /* разберём ниже */ }

  const errText = await page.evaluate(() => {
    const el = document.getElementById('err');
    return el && el.style.display === 'flex' ? el.textContent : '';
  });

  if (!check('страница инициализируется без фатальной ошибки', ready && !errText,
    errText ? errText.slice(0, 600) : (ready ? '' : 'window.__GAME не появился'))) {
    console.log(results.join('\n'));
    console.log('\nОшибки страницы:\n' + errors.slice(0, 12).join('\n'));
    await shot(page, 'fatal');
    await browser.close();
    process.exit(1);
  }

  check('нет ошибок в консоли при загрузке', errors.length === 0, errors.slice(0, 6).join(' | '));

  /* ---------------------------------------------------- состав сцены */
  const info = await page.evaluate(() => window.__GAME.info());
  check('четыре бойца в строю', info.squad.length === 4, JSON.stringify(info.squad.map((s) => s.key)));
  check('стартовый режим — свободная камера', info.mode === 'free' && info.activeIdx === -1, info.mode);

  const dists = info.targets.map((t) => t.d);
  check('мишени на 5/10/20/30 м', JSON.stringify(dists) === JSON.stringify([5, 10, 20, 30]), JSON.stringify(dists));

  /* --------------------------------------------------- геометрия тел */
  const geo = await page.evaluate(() => {
    const out = [];
    for (const s of window.__GAME.squad) {
      let tris = 0, meshes = 0;
      s.char.root.traverse((o) => {
        if (o.isSkinnedMesh) {
          meshes++;
          const g = o.geometry;
          tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
        }
      });
      /* проверка: нет ли вершин с нулевыми весами (иначе деталь «отвалится») */
      let badW = 0;
      s.char.root.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const w = o.geometry.attributes.skinWeight.array;
        for (let i = 0; i < w.length; i += 4) {
          const sum = w[i] + w[i + 1] + w[i + 2] + w[i + 3];
          if (Math.abs(sum - 1) > 0.02) badW++;
        }
      });
      out.push({ key: s.key, tris: Math.round(tris), meshes, badW, bones: s.char.bones.length });
    }
    return out;
  });
  for (const g of geo) {
    check('боец ' + g.key + ': меш построен', g.tris > 12000 && g.meshes >= 5,
      g.tris + ' трис / ' + g.meshes + ' мешей');
    check('боец ' + g.key + ': веса скиннинга нормированы', g.badW === 0, 'плохих вершин: ' + g.badW);
  }
  check('скелет содержит пальцы', geo[0].bones >= 60, 'костей: ' + geo[0].bones);

  /* ------------------------------------------------- хват оружия ---- */
  const grip = await page.evaluate(() => window.__GAME.gripCheck());
  for (const g of grip) {
    check('хват ' + g.key + ': правая кисть на рукоятке', g.palmR < 0.13, g.palmR + ' м');
    check('хват ' + g.key + ': левая кисть на цевье', g.palmL < 0.13, g.palmL + ' м');
    check('хват ' + g.key + ': оружие у корпуса', g.gunToChest < 0.85, g.gunToChest + ' м');
    /* Локти обязаны работать в человеческом диапазоне: прямая рука (>165°)
       или сложенная вдвое (<40°) — это сломанная постановка оружия. */
    check('хват ' + g.key + ': рабочая рука согнута', g.elbowR > 40 && g.elbowR < 130,
      g.elbowR + '°');
    check('хват ' + g.key + ': опорная рука согнута', g.elbowL > 55 && g.elbowL < 165,
      g.elbowL + '°');
  }

  await shot(page, '01-free-camera');

  /* ================================================ игровые сценарии == */

  /* --- вход в бойца --- */
  const emb = await page.evaluate(() => {
    window.__GAME.embody(0);
    return window.__GAME.info();
  });
  check('вход в бойца по F-логике работает', emb.activeIdx === 0 && emb.mode === 'embodied',
    'activeIdx=' + emb.activeIdx);

  /* --- смена бойца --- */
  const sw = await page.evaluate(() => { window.__GAME.embody(2); return window.__GAME.info(); });
  check('переключение на другого оператора', sw.activeIdx === 2, 'activeIdx=' + sw.activeIdx);

  /* --- только активный боец двигается --- */
  const moveTest = await page.evaluate(async () => {
    const G = window.__GAME;
    G.embody(0);
    const before = G.squad.map((s) => s.ctrl.pos.clone());
    /* имитируем удержание W на 1 с через прямой вызов контроллера */
    const input = { fwd: 1, back: 0, left: 0, right: 0 };
    for (let i = 0; i < 60; i++) {
      G.squad[0].ctrl.update(1 / 60, input, true, i / 60);
    }
    const after = G.squad.map((s) => s.ctrl.pos.clone());
    return G.squad.map((s, i) => +before[i].distanceTo(after[i]).toFixed(3));
  });
  check('активный боец пошёл вперёд', moveTest[0] > 0.8, 'сдвиг ' + moveTest[0] + ' м');
  check('остальные трое стоят на месте',
    moveTest[1] === 0 && moveTest[2] === 0 && moveTest[3] === 0, JSON.stringify(moveTest));

  /* --- инерция: разгон не мгновенный --- */
  const inertia = await page.evaluate(() => {
    const c = window.__GAME.squad[0].ctrl;
    c.vel.set(0, 0, 0); c.speed = 0;
    const s = [];
    for (let i = 0; i < 30; i++) {
      c.update(1 / 60, { fwd: 1 }, true, i / 60);
      if (i === 2 || i === 8 || i === 29) s.push(+c.speed.toFixed(2));
    }
    return s;
  });
  check('разгон постепенный (инерция массы)',
    inertia[0] < inertia[1] && inertia[1] < inertia[2] && inertia[0] < 0.9,
    'скорости: ' + inertia.join(' -> '));

  /* --- полная цепочка ввода: клавиша W двигает именно активного бойца --- */
  const inputChain = await page.evaluate(() => {
    const G = window.__GAME;
    G.embody(1);
    const me = G.squad[1].ctrl;
    me.pos.set(0, 0, 6); me.vel.set(0, 0, 0); me.yaw = 0;
    const idle = G.squad[3].ctrl.pos.clone();
    G.setInput({ lock: true, fwd: 1 });
    G.step(90, 1 / 60);
    G.setInput({ fwd: 0 });
    const moved = +new (window.THREE.Vector3)(0, 0, 6).distanceTo(me.pos).toFixed(2);
    G.step(60, 1 / 60);
    const stoppedSpeed = +me.speed.toFixed(2);
    return { moved, stoppedSpeed, idleMoved: +idle.distanceTo(G.squad[3].ctrl.pos).toFixed(3) };
  });
  check('клавиша движения ведёт активного бойца', inputChain.moved > 2,
    'прошёл ' + inputChain.moved + ' м');
  check('после отпускания клавиши боец останавливается', inputChain.stoppedSpeed < 0.05,
    'скорость ' + inputChain.stoppedSpeed + ' м/с');
  check('невыбранный боец остаётся неподвижен', inputChain.idleMoved === 0,
    'сдвиг ' + inputChain.idleMoved + ' м');

  /* --- направление движения на ВСЕХ курсах ---
     Регрессия: формула поворота вектора движения имела неверный знак и на
     yaw 0°/180° случайно работала, а на 90°/270° уводила зеркально —
     W шёл назад, D влево. Поэтому проверяем все четыре стороны света. */
  const dirs = await page.evaluate(() => {
    const G = window.__GAME, T = window.THREE;
    G.embody(0);
    const c = G.squad[0].ctrl;
    const out = [];
    for (const deg of [0, 90, 180, 270]) {
      const yaw = deg * Math.PI / 180;
      /* ожидаемые мировые направления при данном курсе */
      const fwd = new T.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      for (const [key, want] of [['fwd', fwd], ['right', right]]) {
        c.pos.set(0, 0, 0); c.vel.set(0, 0, 0); c.yaw = yaw; c.speed = 0;
        G.setInput({ lock: true, fwd: 0, back: 0, left: 0, right: 0 });
        G.setInput({ [key]: 1 });
        G.step(40, 1 / 60);
        G.setInput({ [key]: 0 });
        const got = c.pos.clone().normalize();
        out.push({ deg, key, dot: +got.dot(want).toFixed(2) });
      }
    }
    return out;
  });
  const badDir = dirs.filter((d) => d.dot < 0.95);
  check('движение совпадает со взглядом на всех курсах', badDir.length === 0,
    badDir.length ? JSON.stringify(badDir) : 'проверено 0/90/180/270°, W и D');

  /* --- выносливость: бег её тратит, покой восстанавливает --- */
  const stam = await page.evaluate(() => {
    const G = window.__GAME;
    G.embody(0);
    const c = G.squad[0].ctrl;
    c.stamina = c.PHYS.staminaMax; c.exhausted = false;
    c.pos.set(0, 0, 10); c.vel.set(0, 0, 0);
    G.setInput({ lock: true, fwd: 1, sprint: true, ads: false });
    G.step(240, 1 / 60);                    // 4 с бега
    const afterRun = +c.stamina.toFixed(2);
    G.setInput({ fwd: 0, sprint: false });
    G.step(240, 1 / 60);                    // 4 с отдыха
    return { afterRun, afterRest: +c.stamina.toFixed(2), max: c.PHYS.staminaMax };
  });
  check('бег расходует выносливость', stam.afterRun < stam.max - 2,
    stam.max + ' -> ' + stam.afterRun);
  check('выносливость восстанавливается', stam.afterRest > stam.afterRun,
    stam.afterRun + ' -> ' + stam.afterRest);

  /* --- стрельба по мишени ---
     Шаги симуляции делаем сами: в песочнице нет GPU, кадр рисуется
     программно по несколько секунд, и ждать реального времени бессмысленно. */
  const shooting = await page.evaluate(() => {
    const G = window.__GAME, T = window.THREE;
    G.embody(0);
    const a = G.squad[0];
    const tgt = G.world.targets.find((t) => t.dist === 10);
    const tp = tgt.board.getWorldPosition(new T.Vector3());
    const fire = G.world.fireLine;
    a.ctrl.pos.set(fire.x, 0, fire.z);
    a.ctrl.crouch = 0;
    a.ctrl.ads = 1;
    /* целимся из положения глаз точно в центр полотна */
    const eye = new T.Vector3(fire.x, 1.655, fire.z);
    const d = new T.Vector3().subVectors(tp, eye);
    a.ctrl.yaw = Math.atan2(-d.x, -d.z);
    a.ctrl.pitch = Math.asin(d.clone().normalize().y);
    a.ctrl.ammo = 30;
    a.ctrl.fireMode = 'semi';
    /* в headless нет pointer lock — включаем его вручную, иначе ввод
       игнорируется и ни один выстрел не пройдёт */
    G.setInput({ lock: true, ads: true });
    /* даём позе прийти в прицельное положение */
    G.step(45, 1 / 60);
    const ammo0 = a.ctrl.ammo, score0 = G.state.score;
    for (let k = 0; k < 6; k++) {
      a.ctrl.cool = 0;
      a.ctrl.semiLatch = false;
      a.ctrl.spread = 0;                    // без разброса: проверяем попадание, не удачу
      G.setInput({ trigger: true });
      G.step(2, 1 / 60);
      G.setInput({ trigger: false });
      G.step(4, 1 / 60);
    }
    G.setInput({ ads: false });
    return {
      spent: ammo0 - a.ctrl.ammo, scored: G.state.score - score0,
      shots: a.ctrl.shots, hits: a.ctrl.hits,
      targets: G.world.targets.map((t) => ({ d: t.dist, hits: t.hits, state: t.state }))
    };
  });
  check('выстрелы расходуют патроны', shooting.spent >= 4, 'израсходовано ' + shooting.spent);
  check('попадания по мишени засчитываются', shooting.scored > 0,
    'очков: ' + shooting.scored + ', мишени: ' + JSON.stringify(shooting.targets));
  await shot(page, '02-range');

  /* --- перезарядка --- */
  const reload = await page.evaluate(() => {
    const G = window.__GAME;
    const c = G.squad[0].ctrl;
    c.ammo = 3; c.reserve = 90;
    const started = c.startReload();
    G.step(190, 1 / 60);                    // ~3,2 с — дольше полной перезарядки
    return { started, ammo: c.ammo, reserve: c.reserve, reloading: c.reload >= 0 };
  });
  check('перезарядка пополняет магазин', reload.started && reload.ammo === 30 && !reload.reloading,
    JSON.stringify(reload));
  check('патроны списываются из запаса', reload.reserve === 63, 'в запасе ' + reload.reserve);

  /* --- предохранитель --- */
  const safe = await page.evaluate(() => {
    const G = window.__GAME;
    const c = G.squad[0].ctrl;
    c.fireMode = 'safe'; c.ammo = 30; c.cool = 0;
    const before = c.ammo;
    G.setInput({ lock: true, trigger: true });
    G.step(30, 1 / 60);
    G.setInput({ trigger: false });
    return { fired: before - c.ammo, mode: c.fireMode };
  });
  check('на предохранителе выстрела нет', safe.fired === 0, 'выстрелов: ' + safe.fired);

  /* --- автоматический огонь: темп 650 выстр/мин --- */
  const autoFire = await page.evaluate(() => {
    const G = window.__GAME;
    const c = G.squad[0].ctrl;
    c.fireMode = 'auto'; c.ammo = 30; c.cool = 0; c.reload = -1;
    const a0 = c.ammo;
    G.setInput({ lock: true, trigger: true });
    G.step(60, 1 / 60);                     // ровно одна секунда
    G.setInput({ trigger: false });
    return a0 - c.ammo;
  });
  /* 650 в минуту = 10,8 в секунду; допускаем ±2 на границы интервала */
  check('автоматический огонь держит темп ~650 в/мин', autoFire >= 9 && autoFire <= 13,
    'выстрелов за 1 с: ' + autoFire);

  /* --- отдача: очередь уводит прицел вверх и частично возвращается --- */
  const recoil = await page.evaluate(() => {
    const G = window.__GAME;
    const c = G.squad[0].ctrl;
    G.setInput({ lock: true, ads: true });
    c.fireMode = 'auto'; c.ammo = 30; c.cool = 0; c.reload = -1;
    c.pitch = 0; c.yaw = 0; c.kickBack.p = 0; c.kickBack.y = 0;
    G.step(30, 1 / 60);
    const p0 = c.pitch;
    G.setInput({ trigger: true });
    G.step(36, 1 / 60);                     // ~6 выстрелов
    const peak = c.pitch;
    G.setInput({ trigger: false });
    G.step(90, 1 / 60);                     // отпустили — ствол опускается
    const settled = c.pitch;
    G.setInput({ ads: false });
    return {
      подъём: +(peak - p0).toFixed(4),
      осталось: +(settled - p0).toFixed(4),
      вернулось: +(peak - settled).toFixed(4)
    };
  });
  /* Очередь обязана уводить ствол вверх (иначе отдачи нет вовсе)... */
  check('очередь уводит прицел вверх', recoil.подъём > 0.02,
    'подъём ' + (recoil.подъём * 57.3).toFixed(1) + '°');
  /* ...и после отпускания спуска частично возвращаться. */
  check('после очереди прицел частично возвращается',
    recoil.вернулось > 0.005 && recoil.осталось > 0,
    'вернулось ' + (recoil.вернулось * 57.3).toFixed(1) + '°, осталось ' +
    (recoil.осталось * 57.3).toFixed(1) + '°');

  /* --- баллистика: пуля падает, а не летит лазером ---
     Стреляем строго горизонтально с известной высоты и смотрим, где пуля
     встретила землю. Для 880 м/с свободное падение даёт ~1,5 м за 0,55 с,
     то есть точка падения должна быть в районе 150-260 м... но нас
     интересует главное: снижение ЕСТЬ и оно растёт с дистанцией. */
  const drop = await page.evaluate(() => {
    const G = window.__GAME, T = window.THREE;
    const a = G.squad[0];
    /* ставим бойца на ровное место и стреляем горизонтально вдоль -Z */
    a.ctrl.pos.set(0, 0, 20);
    a.ctrl.yaw = 0; a.ctrl.pitch = 0; a.ctrl.ads = 1; a.ctrl.spread = 0;
    a.ctrl.ammo = 30; a.ctrl.fireMode = 'semi'; a.ctrl.cool = 0;
    G.setInput({ lock: true, ads: true });
    G.step(90, 1 / 60);
    /* измеряем снижение напрямую через внутреннюю трассировку */
    return G.measureDrop([5, 30, 100]);
  });
  const rising = drop && drop.length === 3
    && drop[0].drop < drop[1].drop && drop[1].drop < drop[2].drop;
  check('пуля снижается с дистанцией (не «лазер»)', rising,
    drop ? drop.map((d) => d.dist + 'м: ' + (d.drop * 100).toFixed(1) + 'см').join(', ') : 'нет данных');

  /* --- падение и подъём мишени --- */
  const tgtCycle = await page.evaluate(() => {
    const G = window.__GAME;
    const t = G.world.targets[0];
    t.state = 'falling'; t.t = 0;
    G.step(30, 1 / 60);                     // 0,5 с — мишень уже легла
    const down = t.hinge.rotation.x;
    G.step(230, 1 / 60);                    // ещё ~3,8 с — цикл «лежит + подъём»
    return { down: +down.toFixed(2), state: t.state, rot: +t.hinge.rotation.x.toFixed(3) };
  });
  check('мишень падает от попадания', tgtCycle.down < -1.3, 'угол ' + tgtCycle.down);
  check('мишень поднимается обратно', tgtCycle.state === 'up' && Math.abs(tgtCycle.rot) < 0.02,
    JSON.stringify(tgtCycle));

  /* --- панель модулей (TAB) --- */
  const attach = await page.evaluate(() => {
    const before = window.ATTACH.get();
    const r = window.ATTACH.set('optic', 'reddot_t2');
    const after = window.ATTACH.get();
    return { before: before.optic || null, after: after.optic || null,
      errors: r.errors, slots: window.ATTACH.slots() };
  });
  check('система модулей ставит прицел', attach.after === 'reddot_t2',
    'было ' + attach.before + ', стало ' + attach.after);
  check('сборка без ошибок', !attach.errors || attach.errors.length === 0,
    JSON.stringify(attach.errors || []));

  /* --- дом непроходим --- */
  const wall = await page.evaluate(() => {
    const G = window.__GAME;
    const c = G.squad[0].ctrl;
    /* ставим бойца рядом с домом и идём в стену */
    c.pos.set(-13.5, 0, -10.5);
    c.vel.set(0, 0, 0);
    c.yaw = 0;                       // смотрим в -Z, то есть на дом
    for (let i = 0; i < 180; i++) c.update(1 / 60, { fwd: 1 }, true, i / 60);
    return { z: +c.pos.z.toFixed(2), x: +c.pos.x.toFixed(2) };
  });
  check('в домик нельзя зайти', wall.z > -13.4, 'остановился на z=' + wall.z);

  /* --- выход из бойца --- */
  const dis = await page.evaluate(() => { window.__GAME.disembody(); return window.__GAME.info(); });
  check('выход в свободную камеру', dis.activeIdx === -1 && dis.mode === 'free', dis.mode);

  /* --- стоимость логики кадра ---
     Рендер в песочнице идёт программно (SwiftShader) и занимает секунды —
     измерять его бессмысленно. Зато шаг симуляции (поза, IK, физика,
     эффекты) должен укладываться в бюджет кадра на любой машине. */
  const perf = await page.evaluate(() => {
    const G = window.__GAME;
    G.embody(0);
    G.step(30, 1 / 60);
    const t = [];
    for (let i = 0; i < 90; i++) {
      const a = performance.now();
      G.step(1, 1 / 60);
      t.push(performance.now() - a);
    }
    const s = t.slice(10).sort((a, b) => a - b);
    return { median: +s[Math.floor(s.length / 2)].toFixed(2), max: +s[s.length - 1].toFixed(2) };
  });
  check('логика кадра укладывается в бюджет', perf.median < 4,
    'медиана ' + perf.median + ' мс, макс ' + perf.max + ' мс (4 бойца + IK)');

  /* --- утечек объектов нет: сцена не растёт от стрельбы --- */
  const leak = await page.evaluate(() => {
    const G = window.__GAME;
    const count = () => { let n = 0; G.scene.traverse(() => n++); return n; };
    const before = count();
    const c = G.squad[0].ctrl;
    c.fireMode = 'auto'; c.ammo = 30; c.reserve = 300;
    for (let k = 0; k < 4; k++) {
      c.ammo = 30; c.cool = 0;
      G.setInput({ lock: true, trigger: true });
      G.step(90, 1 / 60);
      G.setInput({ trigger: false });
      G.step(30, 1 / 60);
    }
    return { before, after: count() };
  });
  check('пулы эффектов не плодят объекты', leak.after === leak.before,
    'объектов в сцене: ' + leak.before + ' -> ' + leak.after);

  check('нет ошибок в консоли за всю сессию', errors.length === 0, errors.slice(0, 6).join(' | '));

  console.log(results.join('\n'));
  console.log('\nитог: ' + pass + ' ok, ' + fail + ' fail');
  if (errors.length) console.log('\nконсоль:\n' + errors.slice(0, 10).join('\n'));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });