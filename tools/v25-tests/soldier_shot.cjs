// Снимки стенда бойца (tools/v25-stands/soldier.html): JOBS=[{qs, name, views:[{yaw,pitch,dist,cy,fov}]}]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const BASE = process.env.BASE || 'http://127.0.0.1:8000/tools/v25-stands/soldier.html';
  const W = +(process.env.W || 700), H = +(process.env.H || 900);
  const out = process.env.OUT || __dirname + '/out';
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const jobs = JSON.parse(process.env.JOBS || '[{"qs":"","name":"st_idle"}]');
  for (const j of jobs) {
    const p = await b.newPage({ viewport: { width: j.W || W, height: j.H || H } });
    const errs = [];
    p.on('pageerror', (e) => errs.push('PAGEERROR ' + (e.stack || e.message).slice(0, 600)));
    p.on('console', (m) => { if (m.type() === 'error' || /^kit|^STAND/.test(m.text())) errs.push(m.type() + ' ' + m.text().slice(0, 400)); });
    const t0 = Date.now();
    await p.goto(BASE + '?static=1&' + (j.qs || ''), { timeout: 300000 });
    await p.waitForFunction(() => window.__STAND_READY || document.getElementById('info').textContent.startsWith('нет'), null, { timeout: 300000, polling: 300 });
    const info = await p.evaluate(() => document.getElementById('info').textContent);
    console.log(j.name, 'loaded', ((Date.now() - t0) / 1000).toFixed(1), 's |', info.replace(/\n/g, ' | ').slice(0, 300));
    if (j.eval) { const r = JSON.stringify(await p.evaluate(j.eval)); if (j.evalOut) fs.writeFileSync(j.evalOut, r); console.log('eval:', r.slice(0, j.evalOut ? 300 : 2000)); }
    const views = j.views || [{}];
    let k = 0;
    for (const v of views) {
      await p.evaluate((v) => { const S = window.__STAND; Object.assign(S.V, v); if (v.fov) S.cam.fov = v.fov; if (v.ui === 0) document.getElementById('ui').style.display = 'none'; S.render(); }, Object.assign({ ui: 0 }, v));
      const name = views.length > 1 ? j.name + '_' + (v.n || k) : j.name;
      await p.screenshot({ path: out + '/' + name + '.png' });
      k++;
    }
    if (errs.length) console.log('  log:', errs.slice(0, 10).join('\n  '));
    await p.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
