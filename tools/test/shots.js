#!/usr/bin/env node
/* ============================================================================
   Снимки полигона для визуальной проверки.

   Принимает JSON-массив ракурсов:
     node tools/test/shots.js '[{"name":"строй","from":[0,1.7,8.6],"to":[0,1.15,1.2],"fov":52}]'

   Без аргумента снимает набор по умолчанию: строй, оба фланга, крупный план,
   стрельбище, огород, домик. Файлы кладутся в tools/test/shots/.
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const CDN = path.join(__dirname, 'cdn');
const OUT = path.join(__dirname, 'shots');

const DEFAULT_VIEWS = [
  { name: 's1-lineup', from: [0, 1.70, 8.6], to: [0, 1.15, 1.2], fov: 52 },
  { name: 's2-delta-pair', from: [-2.9, 1.55, 5.2], to: [-2.9, 1.10, 1.2], fov: 46 },
  { name: 's3-alpha-pair', from: [2.9, 1.55, 5.2], to: [2.9, 1.10, 1.2], fov: 46 },
  { name: 's4-closeup', from: [-4.20, 1.45, 2.9], to: [-4.20, 1.15, 1.2], fov: 34 },
  { name: 's5-range', from: [6.5, 2.6, 12.5], to: [5.0, 0.6, -12.0], fov: 55 },
  { name: 's6-garden', from: [-8.0, 2.4, 1.0], to: [-13.0, 0.5, -7.0], fov: 55 },
  { name: 's7-house', from: [-6.5, 2.2, -9.0], to: [-13.5, 1.2, -16.0], fov: 52 }
];

(async () => {
  const views = process.argv[2] ? JSON.parse(process.argv[2]) : DEFAULT_VIEWS;
  /* В песочнице нет GPU: WebGL поднимается программным SwiftShader. */
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.route('https://unpkg.com/**', (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^\/three@[^/]+\//, '');
    const file = path.join(CDN, rel);
    if (fs.existsSync(file))
      route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file, 'utf8') });
    else route.continue();
  });
  page.on('pageerror', (e) => console.error('[ошибка страницы]', e.message.slice(0, 300)));

  await page.goto('file://' + path.join(ROOT, 'shooter.html'),
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => !!window.__GAME, null, { timeout: 240000 });
  await page.evaluate(() => document.getElementById('start').classList.add('hidden'));

  fs.mkdirSync(OUT, { recursive: true });
  for (const v of views) {
    await page.evaluate(({ v }) => {
      const G = window.__GAME;
      if (v.embody !== undefined) G.embody(v.embody); else G.disembody();
      if (v.pose) G.setPose(v.pose);
      if (v.input) G.setInput(v.input);
      G.step(v.steps || 90, 1 / 60);
      if (v.from) G.view(v.from, v.to, v.fov);
    }, { v });
    /* дать кадру дорисоваться программным растеризатором */
    await page.waitForTimeout(1200);
    await page.evaluate(({ v }) => { if (v.from) window.__GAME.view(v.from, v.to, v.fov); }, { v });
    await page.screenshot({ path: path.join(OUT, v.name + '.png'), timeout: 240000 });
    console.log('снято: ' + v.name);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });