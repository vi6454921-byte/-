// All-ladders test stand: for every ladder in the loaded sector: bottom attach (W) -> climb -> exit;
const OUTDIR = process.env.OUT_DIR || require('path').join(__dirname, 'out'); require('fs').mkdirSync(OUTDIR, { recursive: true });
// then from the exit walk toward the shaft (W) -> grab -> descend -> bottom. MAP/SEC env. DT=1/30.
const { chromium } = require('playwright');
const MAP = process.env.MAP || 'stroyka_zarechye_v2', SEC = process.env.SEC || '3', DT = 1 / (+process.env.FPS || 30);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.addInitScript(() => { localStorage.setItem('aegis.settings', JSON.stringify({ quality: 'low', volume: 0, calloutSpeech: false })); });
  await p.route('**/js/polygon/29_game.js', async (route) => {
    const r = await route.fetch(); let s = await r.text();
    s = s.replace('const go = () => { warm(); startGame(); };', 'const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();');
    await route.fulfill({ response: r, body: s });
  });
  await p.goto((process.env.BASE || 'http://127.0.0.1:8000/') + 'index.html?map=' + MAP + '&sector=' + SEC);
  await p.waitForFunction(() => window.__GAME, null, { timeout: 900000 });
  const R = await p.evaluate(async ({ DT }) => {
    const g = __GAME, S = g.state, w = g.world;
    try { AEGIS_INTRO.markReady(); AEGIS_INTRO.close(); } catch (e) {}
    S.noRender = true; S.paused = true; S.inputOn = true; S.pointerLocked = true; S.started = true;
    const a = g.squad[S.activeIdx], c = a.ctrl;
    { const h0 = g.dmg.hit; g.dmg.hit = function (h) { if (h && h.s === a) return null; return h0.apply(this, arguments); }; }
    { const st0 = g.step; g.step = (n, dt) => { S.paused = false; try { return st0(n, dt); } finally { S.paused = true; } }; }
    const setKeys = (o) => g.setInput(Object.assign({ fwd: 0, back: 0, left: 0, right: 0, sprint: false }, o));
    const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
    const sec = globalThis.GSectors ? GSectors.current : null;
    const inSec = (L) => !sec || !sec.contains || sec.contains(L.x, L.z);
    const lads = w.ladders.filter((L) => !(L.dead || (L.panel && L.panel.dead)) && inSec(L));
    const out = [];
    const t0 = performance.now();
    const col = (L) => [L.x + L.nx * 0.42, L.z + L.nz * 0.42];
    const chain = (L, dir) => w.ladders.find((M) => M !== L && Math.hypot(col(M)[0] - col(L)[0], col(M)[1] - col(L)[1]) < 0.35 && (dir > 0 ? Math.abs(M.y0 - L.y1) < 0.35 : Math.abs(M.y1 - L.y0) < 0.35)) || null;
    const topOf = (L) => { let T = L; for (let i = 0; i < 6; i++) { const U = chain(T, 1); if (!U) break; T = U; } return T; };
    const botOf = (L) => { let B = L; for (let i = 0; i < 6; i++) { const D = chain(B, -1); if (!D) break; B = D; } return B; };
    for (const L of lads) {
      const r = { x: +L.x.toFixed(1), z: +L.z.toFixed(1), y0: +L.y0.toFixed(2), y1: +L.y1.toFixed(2), exitOff: +Math.hypot(L.exit[0] - (L.x + L.nx * 0.42), L.exit[2] - (L.z + L.nz * 0.42)).toFixed(2) };
      const TL = topOf(L), BL = botOf(L); r.chainUp = TL !== L; r.chainDn = BL !== L;
      c.ladder = null; c._ladBlock = null; c._ladNoGrab = 0;
      // UP: from the front of the ladder
      if (r.chainDn) { c.pos.set(col(L)[0], L.y0 + 0.3, col(L)[1]); c.vel.set(0, 0, 0); c.yaw = Math.atan2(L.nx, L.nz); c.ladderGrab({ L, top: false }); }
      else { c.pos.set(L.x + L.nx * 0.5, L.y0 + 0.05, L.z + L.nz * 0.5); c.vel.set(0, 0, 0); c.yaw = Math.atan2(L.nx, L.nz); c.pitch = 0; }
      setKeys({}); g.step(6, DT);
      r.standY = +c.pos.y.toFixed(2);
      let n = 0; for (; n < 30 && c.ladder !== L; n++) { setKeys({ fwd: 1 }); g.step(1, DT); }
      r.upAtt = c.ladder === L;
      if (!r.upAtt) r.upOther = c.ladder ? 'other' : null;
      let k = 0; for (; k < 900 && c.ladder; k++) { setKeys({ fwd: 1 }); g.step(1, DT); }
      setKeys({}); g.step(6, DT);
      r.upEnd = +c.pos.y.toFixed(2); r.upOk = r.upAtt && Math.abs(c.pos.y - TL.exit[1]) < 0.6 && !c.ladder;
      // junction: climb this ladder to its top with W, press F there -> must step off at L.exit
      if (r.chainUp) {
        c.ladder = null; c._ladBlock = null; c._ladNoGrab = 0;
        c.pos.set(col(L)[0], L.y1 - 1.2, col(L)[1]); c.vel.set(0, 0, 0); c.ladderGrab({ L, top: false }); setKeys({}); g.step(2, DT);
        let j = 0; for (; j < 120 && c.ladder === L && c.pos.y < L.y1 - 0.45; j++) { setKeys({ fwd: 1 }); g.step(1, DT); }
        setKeys({}); g.step(1, DT);
        r.juncPrompt = ((document.getElementById('prompt') || {}).textContent || '').replace(/\s+/g, ' ').trim();
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' })); g.step(4, DT);
        r.juncExit = !c.ladder && Math.hypot(c.pos.x - L.exit[0], c.pos.z - L.exit[2]) < 0.6 && Math.abs(c.pos.y - L.exit[1]) < 0.6;
        r.juncY = +c.pos.y.toFixed(2);
      }
      // DOWN: from the exit, walk toward the shaft
      c.ladder = null; c._ladBlock = null; c._ladNoGrab = 0;
      c.pos.set(L.exit[0], L.exit[1] + 0.05, L.exit[2]); c.vel.set(0, 0, 0); setKeys({}); g.step(8, DT);
      r.exitY = +c.pos.y.toFixed(2);
      const pr = c.ladderProbe(); r.probeTop = !!(pr && pr.top && pr.L === L);
      const cx = L.x + L.nx * 0.42, cz = L.z + L.nz * 0.42;
      let m = 0; for (; m < 60 && c.ladder !== L; m++) { c.yaw = yawTo(cx - c.pos.x, cz - c.pos.z); setKeys({ fwd: 1 }); g.step(1, DT); }
      r.dnAtt = c.ladder === L; r.dnN = m;
      let q = 0; for (; q < 900 && c.ladder; q++) { setKeys({ fwd: 1 }); g.step(1, DT); }
      setKeys({}); g.step(8, DT);
      r.dnEnd = +c.pos.y.toFixed(2); r.dnOk = r.dnAtt && c.pos.y < BL.y0 + 0.6 && c.pos.y > BL.y0 - 1.0;
      out.push(r);
      await new Promise((res) => setTimeout(res, 0));
    }
    return { n: lads.length, total: w.ladders.length, ms: Math.round(performance.now() - t0), out };
  }, { DT });
  const bad = R.out.filter((r) => !r.upOk || !r.dnOk || r.juncExit === false);
  console.log(JSON.stringify({ map: MAP, sec: SEC, n: R.n, total: R.total, ms: R.ms, pass: R.out.length - bad.length, bad }, null, 0));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
