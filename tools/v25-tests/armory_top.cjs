// Оружейная: верхняя полоса при разной ширине окна — слоты не должны закрывать кнопки справа
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  await p.addInitScript(() => { localStorage.setItem('aegis.armoryCoach', 'true'); });
  await p.goto((process.env.BASE || 'http://127.0.0.1:8000/') + 'armory.html#w=akm', { timeout: 300000 });
  await p.waitForFunction(() => document.querySelector('.aeg-slots') && document.querySelector('.aeg-help') && document.querySelectorAll('#aeg-skin .sk-o').length, null, { timeout: 300000, polling: 500 });
  for (const [w, h] of JSON.parse(process.env.SIZES || '[[1920,1080],[1680,1050],[1600,900],[1440,900],[1366,768],[1280,720],[1180,700],[1024,700]]')) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const R = (q) => { const e = document.querySelector(q); if (!e) return null; const x = e.getBoundingClientRect(); return { l: Math.round(x.left), r: Math.round(x.right), t: Math.round(x.top), b: Math.round(x.bottom) }; };
      const o = { back: R('.aeg-back'), slots: R('.aeg-slots'), wx: R('.aeg-wx'), gen: R('.aeg-gen-n:not(.aeg-wx)'), help: R('.aeg-help'), slot: R('.aeg-slot') };
      const ov = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      o.bad = ['back', 'wx', 'gen', 'help'].filter((k) => ov(o.slots, o[k]));
      return o;
    });
    console.log(w + 'x' + h, 'slot', r.slot && r.slot.r - r.slot.l, 'slots', JSON.stringify(r.slots), 'back', JSON.stringify(r.back), 'wx', JSON.stringify(r.wx), 'gen', JSON.stringify(r.gen), 'help', JSON.stringify(r.help), 'OVERLAP', r.bad.join(',') || '-');
    if (process.env.SHOT && process.env.SHOT.split(',').includes(String(w))) await p.screenshot({ timeout: 180000, path: (process.env.OUT || __dirname + '/out') + '/top_' + w + '.png', clip: { x: 0, y: 0, width: w, height: 90 } });
  }
  await b.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
