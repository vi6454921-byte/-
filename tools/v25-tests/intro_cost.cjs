// Цена заставки для загрузки: одна и та же «работа загрузки» (счёт кусками по ~40 мс, как сборка карты)
// на странице-стенде заставки v24 и v25 и на пустой странице. URLS="name=url,..."
const { chromium } = require('playwright');
(async () => {
  const urls = (process.env.URLS || '').split(',').map((s) => s.split('='));
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const res = {};
  for (const [name, url] of urls) {
    const runs = [];
    for (let r = 0; r < +(process.env.RUNS || 2); r++) {
      const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
      const cdp = await p.context().newCDPSession(p); await cdp.send('Performance.enable');
      await p.goto(url, { timeout: 120000 }); await p.waitForTimeout(+(process.env.WARM || 6000));
      const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
      const out = await p.evaluate(async (N) => {
        /* «загрузка»: N кусков по ~40 мс счёта, между ними — отдать поток (как сборка карты по этапам) */
        const chunk = () => { let s = 0; const t = performance.now(); while (performance.now() - t < 40) for (let i = 0; i < 2000; i++) s += Math.sqrt(i * 1.0001); return s; };
        const t0 = performance.now(); let gaps = 0, maxGap = 0, last = t0;
        for (let i = 0; i < N; i++) { chunk(); await new Promise((r) => setTimeout(r, 0)); const now = performance.now(); const g = now - last - 40; gaps += Math.max(0, g); maxGap = Math.max(maxGap, g); last = now; }
        return { ms: performance.now() - t0, waitMs: gaps, maxWait: maxGap };
      }, +(process.env.N || 250));
      const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
      out.mainBusyS = +(m1.TaskDuration - m0.TaskDuration).toFixed(2);
      out.webgl = await p.evaluate(() => document.querySelectorAll('canvas').length);
      runs.push(out); await p.close();
    }
    res[name] = runs; console.log(name, JSON.stringify(runs));
  }
  await b.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
