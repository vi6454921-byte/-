/* Gameplay regression for the integrated maps (collision bridge, stairs, trunks, destruction hooks).
   Usage: node tools/map-tests/gameplay.cjs <angar_map|forest_map_camp|stroyka_zarechye_v2> [port]
   Needs: a static server on the game root (python3 -m http.server 8765), playwright(-core) and Chrome
   (CHROMIUM_PATH). Software GL is slow: loading a map takes several minutes on a 2-CPU box. */
const assert = require('assert');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
const map = process.argv[2] || 'angar_map', port = process.argv[3] || 8765;
(async () => {
  const b = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/local/bin/google-chrome', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.addInitScript(() => {
    localStorage.setItem('aegis.settings', JSON.stringify({ quality: 'low', volume: 0, calloutSpeech: false }));
    localStorage.setItem('aegis.tutorial', 'true');
    localStorage.setItem('aegis.ingameTut', JSON.stringify({ off: true }));
  });
  await p.goto(`http://localhost:${port}/index.html`);
  await p.waitForFunction(() => !!window.AEGIS_GAME, {}, { timeout: 600000 });
  await p.evaluate((m) => { try { AEGIS_INTRO.close(); } catch (e) { } setTimeout(() => AEGIS_GAME.travel(m, 'alpha_1'), 50); }, map);
  await p.waitForNavigation({ timeout: 60000 }).catch(() => { });
  await p.waitForFunction(() => window.__GAME && window.__GAME.world, {}, { timeout: 900000 });
  await p.evaluate(() => { try { AEGIS_INTRO.close(); AEGIS_GAME.pause(true); AEGIS_GAME.setRender(false); } catch (e) { } });
  const r = await p.evaluate((map) => {
    const W = __GAME.world, N = W.native, D = N.dest, ph = GPhysics.get(W);
    ph.begin(1 / 60);
    const out = { map, colliders: W.colliders.length, types: {} };
    for (const c of W.colliders) out.types[c.type] = (out.types[c.type] || 0) + 1;
    const walk = (x, y, z, vx, vz, n) => {
      const c = { pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, grounded: false, crouch: 0, prone: 0 };
      for (let i = 0; i < n; i++) { c.vel.x = vx; c.vel.z = vz; ph.move(c, 1 / 60, -9.81); }
      return c.pos;
    };
    if (map === 'angar_map') {
      // west-room wooden stairs run north from z=-2.6 to the second floor (3.3 m)
      const end = walk(-14.3, 0.02, -1.6, 0, -2.6, 900);
      out.stairsTopY = end.y;
      const sheet = D.sheets.filter((s) => s.kind === 'wall' && s.deadN === 0 && s.c.y < 3).sort((a, b) => b.w * b.h - a.w * a.h)[0];
      const b0 = D.broken;
      W.explode(sheet.c.clone().addScaledVector(sheet.N, 0.6), { radius: 6, power: 1 });
      W.update(0.016, 0);
      out.chunksBroken = D.broken - b0;
      out.glassPanes = D.glass.length;
    } else {
      const t = D.trees.find((t) => Math.hypot(t.x, t.z) < 60 && !t.dead && t.r > 0.15);
      const gy = W.heightAt(t.x - 4, t.z);
      const end = walk(t.x - 4, gy + 0.05, t.z, 2.6, 0, 110);
      out.treeGap = t.x - end.x; out.treeR = t.r; out.trees = D.trees.length;
      const s = D.structs.find((s) => s.kind === 'house' && s.panels.some((p) => p.kind === 'wall' && p.boards));
      const pk = s.panels.find((p) => p.kind === 'wall' && p.boards && !p.dead);
      const V3 = pk.box.min.constructor;
      for (let i = 0; i < 80 && !pk.dead; i++) {
        const bd = pk.boards.find((x) => x.alive); // aim at a standing board: gaps let bullets through
        W.bulletHit(bd ? bd.box.getCenter(new V3()) : pk.box.getCenter(new V3()), new V3(1, 0, 0), 1);
      }
      out.panelDead = pk.dead; out.ladders = (N.ladders || []).length;
    }
    return out;
  }, map);
  console.log(JSON.stringify(r));
  assert.deepStrictEqual(errors, []);
  if (map === 'angar_map') { assert(r.stairsTopY > 3.2, 'cannot climb the stairs'); assert(r.chunksBroken > 0, 'explosion broke nothing'); }
  else { assert(r.treeGap > r.treeR + 0.25 && r.treeGap < r.treeR + 1.2, 'tree trunk does not block'); assert(r.panelDead, 'panel survived 80 hits'); }
  await b.close();
  console.log('PASS', map);
})().catch((e) => { console.error(e); process.exit(1); });
