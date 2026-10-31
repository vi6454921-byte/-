// Стенды v22: один запуск = одна загрузка карты + один или несколько сценариев.
// Сценарий — тело async-функции (*.js рядом), выполняется в странице игры и
// возвращает JSON. Запуск (в корне игры, сервер уже поднят):
//   MAP=forest_map_camp SEC=1 node tools/v22-tests/run.cjs smoke_los.js fall.js
//   MAP= node tools/v22-tests/run.cjs gait_ab.js          # пустой MAP — полигон
// env: BASE (http://127.0.0.1:8000/), MAP, SEC, CHROMIUM_PATH, OUT_DIR
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const BASE = (process.env.BASE || 'http://127.0.0.1:8000/').replace(/\/?$/, '/');
const MAP = process.env.MAP === undefined ? 'forest_map_camp' : process.env.MAP, SEC = process.env.SEC || '1';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const scripts = process.argv.slice(2);
if (!scripts.length) { console.log('usage: MAP=.. SEC=.. node run.cjs script.js [...]'); process.exit(2); }
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 300)));
  // тихие настройки, без обучения и голосов; без прогрева рендера — только симуляция
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
  console.log(`карта ${MAP || 'полигон'} (сектор ${SEC}) загружена за ${((Date.now() - t0) / 1000).toFixed(0)} с`);
  let fail = 0;
  for (const name of scripts) {
    const file = path.isAbsolute(name) ? name : path.join(__dirname, name);
    const body = fs.readFileSync(file, 'utf8');
    const t1 = Date.now();
    try {
      const res = await p.evaluate(new Function('return (async () => {' + body + '\n})()'));
      const out = path.join(OUT, path.basename(name, '.js') + '.json');
      fs.writeFileSync(out, JSON.stringify(res, null, 1));
      console.log(`✓ ${name} (${((Date.now() - t1) / 1000).toFixed(0)} с) → ${path.relative(process.cwd(), out)}`);
      console.log(JSON.stringify(res).slice(0, 1200));
    } catch (e) { fail++; console.log(`✗ ${name}: ${String(e.message || e).slice(0, 600)}`); }
  }
  if (errs.length) console.log('ошибки страницы:', errs.slice(0, 10));
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
