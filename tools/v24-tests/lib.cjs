// v24 · общая обвязка стендов tools/v24-tests: запуск браузера (SwiftShader = «слабый ПК без видеокарты»), загрузка карты, ручной рендер кадров
const { chromium } = require('playwright');
const fs = require('fs');
async function open(opts = {}) {
  const BASE = opts.base || process.env.BASE || 'http://127.0.0.1:8000/';
  const W = opts.w || 1280, H = opts.h || 720;
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const errs = [], warns = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + (e.stack || e.message).slice(0, 600)));
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errs.push('CONSOLE ' + t.slice(0, 400)); else if (m.type() === 'warning') warns.push(t.slice(0, 300)); });
  const settings = Object.assign({ quality: opts.q || 'low', volume: 0, calloutSpeech: false, fps: false, weather: opts.weather || 'day' }, opts.settings || {});
  await p.addInitScript((s) => { localStorage.setItem('aegis.settings', JSON.stringify(s)); localStorage.setItem('aegis.tutorial', 'true'); }, settings);
  if (opts.seed) await p.addInitScript((seed) => { let a = seed >>> 0; Math.random = function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }, opts.seed);
  if (opts.patch) await p.route('**/js/polygon/29_game.js', async (route) => { const r = await route.fetch(); let s = await r.text(); s = opts.patch(s); await route.fulfill({ response: r, body: s }); });
  const t0 = Date.now();
  const q = opts.map ? ('?map=' + opts.map + '&sector=' + (opts.sec || '1') + (opts.qs || '')) : ('?x=1' + (opts.qs || ''));
  await p.goto(BASE + 'index.html' + q, { timeout: 600000 });
  await p.waitForFunction(() => window.AEGIS_GAME && window.__GAME && window.__GAME._C, null, { timeout: 1200000, polling: 1000 });
  const loadS = (Date.now() - t0) / 1000;
  await p.evaluate(() => { try { AEGIS_INTRO.markReady(); AEGIS_INTRO.close(); } catch (e) {} const G = __GAME; G.state.noRender = true; G.state.paused = true; G.setInput({ lock: true }); });
  return { b, p, errs, warns, loadS };
}
// шаги симуляции без рендера
async function step(p, n, dt = 1 / 60) { await p.evaluate(async ([n, dt]) => { const G = __GAME; for (let i = 0; i < n; i += 30) { G.step(Math.min(30, n - i), dt); await new Promise(r => setTimeout(r, 0)); } }, [n, dt]); }
// N кадров рендера (с шагом симуляции или без)
async function render(p, frames = 3, sim = true) { return p.evaluate(([f, sim]) => { const G = __GAME; const t = []; for (let i = 0; i < f; i++) { if (sim) G.step(1, 1 / 60); const a = performance.now(); G._C.renderFrame(1 / 60); G.renderer.getContext().finish(); t.push(performance.now() - a); } return t; }, [frames, sim]); }
async function shot(p, path, frames = 3, sim = true) { const t = await render(p, frames, sim); await p.screenshot({ path, timeout: 180000 }); return t; }
module.exports = { open, step, render, shot, fs };
