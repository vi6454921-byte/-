// Loads each sector of a big map without rendering, simulates N seconds, exports layout + containment stats.
const OUTDIR = process.env.OUT_DIR || require('path').join(__dirname, 'out'); require('fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium } = require('playwright');
const fs = require('fs');
const MAP = process.env.MAP || 'forest_map_camp';
const SECTORS = (process.env.SECTORS || '1,2,3').split(',');
const SIM = +(process.env.SIM || 20);
const BASE = process.env.BASE || 'http://127.0.0.1:8000/';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const all = {};
  for (const sec of SECTORS) {
    const p = await b.newPage({ viewport: { width: 800, height: 600 } });
    p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    p.on('console', (m) => { const t = m.text(); if (/sector|warn|error/i.test(t) && !/GPU|WebGL|swiftshader/i.test(t)) console.log('  [console]', t.slice(0, 200)); });
    await p.addInitScript(() => { localStorage.setItem('aegis.settings', JSON.stringify({ quality: 'low', volume: 0, calloutSpeech: false })); });
    await p.route('**/js/polygon/29_game.js', async (route) => {
      const r = await route.fetch(); let s = await r.text();
      s = s.replace('const go = () => { warm(); startGame(); };', 'const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();');
      await route.fulfill({ response: r, body: s });
    });
    const t0 = Date.now();
    await p.goto(BASE + 'index.html?map=' + MAP + '&sector=' + sec);
    await p.waitForFunction(() => window.__GAME, null, { timeout: 900000 });
    const loadS = (Date.now() - t0) / 1000;
    const data = await p.evaluate(async (SIM) => {
      const g = __GAME, w = g.world; g.state.paused = true; g.state.noRender = true;
      try { AEGIS_INTRO.markReady(); AEGIS_INTRO.close(); } catch (e) {}
      const S = w.sector, L = w.teamLayout;
      const pos = () => g.squad.map((s) => ({ key: s.key, team: s.team || s.char.preset.faction, x: +s.ctrl.pos.x.toFixed(1), z: +s.ctrl.pos.z.toFixed(1), m: S ? +S.margin(s.ctrl.pos.x, s.ctrl.pos.z).toFixed(1) : null, dead: !!s.dead }));
      const p0 = pos();
      const nav = window.GNavigation ? GNavigation.stats() : null;
      const at = performance.now();
      // let the battle run (no player: free camera) — chunks to keep the page responsive
      const steps = Math.round(SIM * 60);
      for (let i = 0; i < steps; i += 60) { g.step(Math.min(60, steps - i), 1 / 60); await new Promise((r) => setTimeout(r, 0)); }
      const simMs = performance.now() - at;
      const p1 = pos();
      const line = []; if (S && S.group) S.group.traverse((o) => { if (o.isMesh) line.push({ name: o.name, tris: o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3, inst: o.count || 1 }); });
      return {
        sector: S ? { id: S.id, name: S.name, seed: S.seed, poly: S.poly, bases: S.bases, centre: S.centre, area: S.area, perimeter: S.perimeter, posts: S.posts, choice: S.choice } : null,
        bounds: w.bounds, navBounds: w.navBounds || null,
        layout: L ? { centre: L.centre, teams: L.teams, cover: L.cover } : null, flags: w.flags.map((f) => ({ team: f.team, x: f.x, z: f.z, m: S ? +S.margin(f.x, f.z).toFixed(1) : null })),
        n: g.squad.length, p0, p1, nav, navAfter: window.GNavigation ? GNavigation.stats() : null, simMs, line,
        teams: g.teams ? g.teams.state() : null
      };
    }, SIM);
    data.loadS = loadS;
    all[sec] = data;
    const out1 = data.p1.filter((q) => q.m !== null && q.m < 0);
    console.log(MAP, 'sector', sec, data.sector && data.sector.name, 'load', loadS.toFixed(1) + 's', 'n', data.n, 'nav tris', data.nav && data.nav.triangles, 'polys', data.nav && data.nav.polygons, 'buildMs', data.nav && Math.round(data.nav.buildMs),
      'sim', (data.simMs / (SIM * 60)).toFixed(1) + 'ms/step', 'outside after sim', out1.length, out1.map((q) => q.key + ':' + q.m).join(' '));
    console.log('   flags', JSON.stringify(data.flags), 'line', JSON.stringify(data.line), 'posts', data.sector && data.sector.posts);
    console.log('   minMargin t0', Math.min(...data.p0.map((q) => q.m)), 'teams', JSON.stringify(data.teams && { alive: data.teams.alive, phase: data.teams.phase, lod: data.teams.lod }));
    await p.close();
  }
  fs.writeFileSync(OUTDIR + '/sectorprobe-' + MAP + '.json', JSON.stringify(all));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
