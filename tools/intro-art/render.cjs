// node render.cjs in.svg out.png [bg] — растеризация SVG в Chromium (прозрачный фон или превью на фоне заставки).
// Нужен playwright (npm) и Chromium: путь берётся из CHROMIUM_PATH, иначе — браузер playwright.
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/vercel/sandbox/node_modules/playwright'); }
const fs = require('fs');
(async () => {
  const [inp, out, bg] = process.argv.slice(2);
  const svg = fs.readFileSync(inp, 'utf8');
  const m = /width="(\d+)" height="(\d+)"/.exec(svg); const W = +m[1], H = +m[2];
  const opt = { args: ['--no-sandbox', '--force-color-profile=srgb'] };
  if (process.env.CHROMIUM_PATH) opt.executablePath = process.env.CHROMIUM_PATH;
  const b = await pw.chromium.launch(opt);
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const back = bg ? 'background:radial-gradient(ellipse at 50% 45%,#23252a 0%,#0c0d0f 70%,#050506 100%);' : 'background:transparent;';
  await p.setContent('<html><body style="margin:0;' + back + '">' + svg + '</body></html>');
  await p.waitForTimeout(150);
  await p.screenshot({ path: out, omitBackground: !bg, clip: { x: 0, y: 0, width: W, height: H } });
  await b.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
