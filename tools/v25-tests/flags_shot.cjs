// Снимки стенда флагов: JOBS=[{"qs":"view=front","name":"f_front"}]
const { chromium } = require('playwright');
(async () => {
  const BASE = process.env.BASE || 'http://127.0.0.1:8000/tools/v25-stands/flags.html';
  const W = +(process.env.W || 1100), H = +(process.env.H || 700);
  const out = process.env.OUT || __dirname + '/out';
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + (e.stack || e.message).slice(0, 400)));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text().slice(0, 300)); });
  const jobs = JSON.parse(process.env.JOBS || '[{"qs":"view=front","name":"flag_front"}]');
  for (const j of jobs) {
    await p.goto(BASE + '?' + j.qs, { timeout: 120000 });
    await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    const info = await p.evaluate(() => ({ ms: window.__ms, sim: window.__simMs }));
    await p.screenshot({ path: out + '/' + j.name + '.png', fullPage: false });
    console.log('shot', j.name, JSON.stringify(info));
  }
  if (errs.length) console.log(errs.join('\n'));
  await b.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
