// Оружейная: панель окраски, применение окрасок, ошибки страницы
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const BASE = process.env.BASE || 'http://127.0.0.1:8000/', out = process.env.OUT || __dirname + '/out/arm';
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +(process.env.W || 1100), height: +(process.env.H || 720) } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + (e.stack || e.message).slice(0, 600)));
  p.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram|shader/i.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 900)); });
  await p.route('**/favicon.ico', (r) => r.fulfill({ status: 204 }));
  await p.addInitScript(() => { localStorage.setItem('aegis.armoryCoach', 'true'); });
  const plan = JSON.parse(process.env.PLAN || '[["akm",["factory","woodland","walnut"]],["m416",["multi","tan"]]]');
  const layout = () => p.evaluate(() => {
    const R = (q) => { const e = document.querySelector(q); if (!e || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return r.height ? { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right) } : null; };
    const L = { list: R('#aeg-left'), skin: R('#aeg-skin'), stats: R('.col-left'), bottom: R('.bottom'), row: R('#aeg-skin .sk-row') };
    const ov = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    const bad = [];
    for (const [a, b] of [['list', 'skin'], ['skin', 'stats'], ['list', 'stats'], ['stats', 'bottom'], ['skin', 'bottom']]) if (ov(L[a], L[b])) bad.push(a + '×' + b);
    const sk = document.querySelector('#aeg-skin'); if (sk && L.row && L.row.r > L.skin.r + 0.5) bad.push('row overflow');
    return { vh: innerHeight, vw: innerWidth, L, overlaps: bad };
  });
  let first = true;
  for (const [w, skins] of plan) {
    const t0 = Date.now();
    if (first) await p.goto(BASE + 'armory.html#w=' + w, { timeout: 600000 });
    else await p.evaluate((w) => Array.from(document.querySelectorAll('.wl-i')).find((e) => e.textContent.includes(AEGIS.WEAPONS[w].name)).click(), w);
    first = false;
    await p.waitForFunction((w) => window.__WK_CUR === w && window.AEGIS_WK?.armoryApp && document.querySelectorAll('#aeg-skin .sk-o').length, w, { timeout: 600000, polling: 500 });
    await p.waitForTimeout(2500);
    if (await p.locator('.coach.on .co-skip').count()) await p.evaluate(() => document.querySelector('.coach.on .co-skip')?.click());
    console.log('layout', JSON.stringify(await layout()));
    console.log('loaded', w, (Date.now() - t0) / 1000, 's', JSON.stringify(await p.evaluate(() => Array.from(document.querySelectorAll('#aeg-skin .sk-o')).map((e) => e.textContent))));
    for (const sid of skins) {
      const r = await p.evaluate((sid) => {
        const L = GSkins.list(window.__WK_CUR), i = L.findIndex((x) => x.id === sid);
        const btn = document.querySelectorAll('#aeg-skin .sk-o')[i];
        if (!btn) return 'no button ' + sid;
        btn.click(); return 'clicked ' + sid + ' ' + btn.textContent;
      }, sid);
      await p.waitForTimeout(+(process.env.WAIT || 2500));
      const st = await p.evaluate(() => { const a = AEGIS_WK.armoryApp; return { skin: a.skin, cfgSkin: a.cfg && a.cfg.skin, on: (document.querySelector('#aeg-skin .sk-o.on') || {}).textContent }; });
      await p.screenshot({ path: out + '/' + w + '_' + sid + '.png' });
      console.log('shot', w, sid, r, JSON.stringify(st));
    }
  }
  console.log('errors', errs.length, errs.slice(0, 10).join('\n'));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
