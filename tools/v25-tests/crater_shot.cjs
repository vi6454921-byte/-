// снимки стенда воронок: JOBS=[{"qs":"kind=big","name":"c_big"}] OUT=...
const { chromium } = require('playwright');
(async () => {
  const BASE = 'http://127.0.0.1:8000/tools/v25-stands/craters.html';
  const out = process.env.OUT || __dirname + '/out/craters'; require('fs').mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 900, height: 520 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  for (const j of JSON.parse(process.env.JOBS)) {
    await p.goto(BASE + '?' + j.qs, { timeout: 120000 }); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    await p.screenshot({ path: out + '/' + j.name + '.jpg', quality: 85 }); console.log('shot', j.name, JSON.stringify(await p.evaluate(() => window.__info)));
  }
  if (errs.length) console.log(errs.join('\n'));
  await b.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
