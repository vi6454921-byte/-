// v23 · стоимость симуляции в бою (без рендера): мс на шаг 1/60 с, разбивка по системам (sysMs —
// среднее на шаг за весь замер; timings — GPerf, последние 6 с), состояние физического мира (world),
// ход боя (beh) и (PROFILE=1) самые тяжёлые функции по профилю CPU.
//   MAP=forest_map_camp SEC=1 node tools/v23-tests/perf_battle.cjs
// env: BASE (http://127.0.0.1:8000/), MAP, SEC, WARM (шагов прогрева, 600), STEPS (шагов замера, 900),
//      PROFILE=1, PROF_OUT (сырой профиль), SEED (детерминированный Math.random), NOFIRE=1 (боты не стреляют),
//      OUT (файл JSON), CHROMIUM_PATH
const fs = require('fs');
const { chromium } = require('playwright');
const BASE = (process.env.BASE || 'http://127.0.0.1:8000/').replace(/\/?$/, '/');
const MAP = process.env.MAP === undefined ? 'forest_map_camp' : process.env.MAP, SEC = process.env.SEC || '1';
const WARM = +(process.env.WARM || 600), STEPS = +(process.env.STEPS || 900);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 300)));
  // SEED=<n>: одинаковый ход боя в начале для сравнения сборок (Math.random → mulberry32)
  if (process.env.SEED) await p.addInitScript((seed) => { let a = seed >>> 0; Math.random = function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }, +process.env.SEED);
  await p.addInitScript(() => localStorage.setItem('aegis.settings', JSON.stringify({ quality: 'low', volume: 0, calloutSpeech: false, tutorialDone: true, tutDone: true })));
  await p.route('**/js/polygon/29_game.js', async (route) => {
    const r = await route.fetch(); let s = await r.text();
    s = s.replace('const go = () => { warm(); startGame(); };', 'const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();');
    await route.fulfill({ response: r, body: s });
  });
  const t0 = Date.now();
  await p.goto(BASE + 'index.html' + (MAP ? '?map=' + MAP + '&sector=' + SEC : '?x=1'), { timeout: 300000 });
  await p.waitForFunction(() => window.__GAME, null, { timeout: 900000, polling: 1000 });
  await p.evaluate(() => { try { AEGIS_INTRO.markReady(); AEGIS_INTRO.close(); } catch (e) {} });
  const loadS = (Date.now() - t0) / 1000;
  // интерфейс не должен снимать паузу и включать рендер посреди замера (например, убит свой боец →
  // свободная камера → через 5 с меню): шаги идут только из замера
  await p.evaluate(() => { const A = window.AEGIS_GAME; if (A) { A.pause = () => {}; A.setRender = () => {}; } });
  // кадры requestAnimationFrame не шагают и не рисуют (иначе в замер попадают шаги с большим dt и рендер):
  // симуляция идёт только через G.step(1, 1/60)
  // NOFIRE=1: боты не стреляют (никто не гибнет) — все бойцы живы и двигаются, нагрузка одинакова в обеих
  // сборках; так сравниваются анимация/физика/ИИ без разброса хода боя
  const NOFIRE = !!process.env.NOFIRE;
  await p.evaluate(async ([W, NF]) => { const G = __GAME; G.state.paused = true; G.state.noRender = true;
    const hold = () => { if (NF) for (const s of G.squad) if (s.ctrl && s.ctrl.canFire && !s.ctrl._noFire) { s.ctrl._noFire = true; s.ctrl.canFire = () => false; } };
    window.__perfHold = hold;
    for (let i = 0; i < W; i += 60) { hold(); G.step(Math.min(60, W - i), 1 / 60); await new Promise(r => setTimeout(r, 0)); } }, [WARM, NOFIRE]);
  let cdp = null;
  if (process.env.PROFILE) { cdp = await p.context().newCDPSession(p); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const res = await p.evaluate(async (N) => {
    const G = __GAME; G.state.paused = true; G.state.noRender = true; window.GPerf?.clear();
    // GPerf хранит только последние 360 замеров (6 с): разбивку по системам за весь замер копим сами
    const sys = {}; const P = window.GPerf, rec0 = P && P.record;
    if (rec0) P.record = (name, v) => { sys[name] = (sys[name] || 0) + v; rec0(name, v); };
    // состояние физического мира (сколько тел считает Rapier): тела убитых/упавших и мелкие объекты (гильзы, гранаты)
    const phys = (() => { try { const w = G.squad.find(x => x.ctrl && x.ctrl._physicsWorld)?.ctrl._physicsWorld; return w ? GPhysics.get(w) : null; } catch (e) { return null; } })();
    let ragSum = 0, objSum = 0, awakeSum = 0, awakeN = 0;
    const ms = []; let heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0, gcDrops = 0, lastHeap = heap0;
    for (let i = 0; i < N; i++) {
      const a = performance.now(); G.step(1, 1 / 60); ms.push(performance.now() - a);
      if (performance.memory) { const h = performance.memory.usedJSHeapSize; if (h < lastHeap - 2e6) gcDrops++; lastHeap = h; }
      if (phys) { ragSum += phys.ragdolls?.size || 0; objSum += phys.objects?.size || 0;
        if ((i & 15) === 0 && phys.objects) { let k = 0; for (const o of phys.objects.values()) if (o.body.isEnabled() && !o.body.isSleeping()) k++; awakeSum += k; awakeN++; } }
      if ((i & 63) === 63) { window.__perfHold?.(); await new Promise(r => setTimeout(r, 0)); }
    }
    if (rec0) P.record = rec0;
    const sysMs = Object.fromEntries(Object.entries(sys).map(([k, v]) => [k, +(v / N).toFixed(2)]));
    const world = phys ? { ragdolls: +(ragSum / N).toFixed(1), objects: +(objSum / N).toFixed(1), awakeObjects: awakeN ? +(awakeSum / awakeN).toFixed(1) : null } : null;
    const s = ms.slice().sort((x, y) => x - y), q = (f) => +s[Math.min(s.length - 1, Math.floor(f * s.length))].toFixed(2);
    const rep = window.GPerf?.report() || {};
    const bots = G.squad.filter(x => !x.dead).length;
    // поведение за весь бой (для сравнения сборок: тот же ли бой по нагрузке)
    let beh = null;
    try { const cs = G._C.combat && G._C.combat.stats ? G._C.combat.stats() : {}; const ss = window.GStumble && GStumble.stats ? GStumble.stats() : {};
      // попадания (по бойцам) и причины спотыканий (журнал равновесия, последние 24 события на бойца)
      let hits = 0; const tripsBy = {}, TR = new Set(['hit', 'leg-hit', 'impulse', 'hard-landing', 'trip-obstacle', 'external', 'manual']);
      for (const x of G.squad) { hits += (x.dmg && x.dmg.hits) || 0; for (const e of (x._balance?.events || [])) if (TR.has(e.name)) tripsBy[e.name] = (tripsBy[e.name] || 0) + 1; }
      beh = { shots: cs.shots, hits, flanks: cs.flanks, scoots: cs.scoots, decisions: cs.decisions, checks: cs.checks, trips: ss.triggered, tripsBy, falls: ss.falls, vaults: ss.vaults, dead: G.squad.length - bots }; } catch (e) { /* */ }
    return { steps: N, meanMs: +(ms.reduce((x, y) => x + y, 0) / N).toFixed(2), medianMs: q(0.5), p95Ms: q(0.95), p99Ms: q(0.99), maxMs: +s[s.length - 1].toFixed(1),
      alive: bots, total: G.squad.length, beh, world, sysMs, smoke: window.GSmoke?.state?.(), heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1e6).toFixed(0) : null, gcDrops, timings: rep };
  }, STEPS);
  let top = null;
  if (cdp) {
    const { profile } = await cdp.send('Profiler.stop');
    if (process.env.PROF_OUT) fs.writeFileSync(process.env.PROF_OUT, JSON.stringify(profile));
    const byId = new Map(); for (const n of profile.nodes) byId.set(n.id, n);
    const self = new Map(); const dt = profile.timeDeltas; let total = 0;
    for (let i = 0; i < profile.samples.length; i++) { const n = byId.get(profile.samples[i]); const d = dt[i] || 0; const cf = n.callFrame; if (cf.functionName === '(idle)') continue; total += d; const k = (cf.functionName || '(anon)') + ' ' + (cf.url || '').replace(/^.*\/(js|assets)\//, '$1/') + ':' + (cf.lineNumber + 1); self.set(k, (self.get(k) || 0) + d); }
    top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => [k, +(v / total * 100).toFixed(1)]);
  }
  const out = { map: MAP || 'polygon', sec: SEC, base: BASE, nofire: NOFIRE, loadS: +loadS.toFixed(0), ...res, top, errors: errs };
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ map: out.map, base: BASE, meanMs: out.meanMs, medianMs: out.medianMs, p95Ms: out.p95Ms, p99Ms: out.p99Ms, maxMs: out.maxMs, alive: out.alive, beh: out.beh, world: out.world, sysMs: out.sysMs, heapMB: out.heapMB, gcDrops: out.gcDrops, errors: errs.length }));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
