// Gait probe v2: bot running gait on flat range ground (MAP='') or forest terrain; pelvis bob, drop, knee pops,
const OUTDIR = process.env.OUT_DIR || require('path').join(__dirname, 'out'); require('fs').mkdirSync(OUTDIR, { recursive: true });
// plant pattern, LOD stutter, cost breakdown. env BASE TAG MAP SEC OUT
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8000', TAG = process.env.TAG || 'v21';
const MAP = process.env.MAP === undefined ? 'forest_map_camp' : process.env.MAP, SEC = process.env.SEC || '1';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  const errs = [];
  p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
  await p.addInitScript(() => { localStorage.setItem('aegis.settings', JSON.stringify({ quality: 'low', volume: 0, calloutSpeech: false })); });
  await p.route('**/js/polygon/29_game.js', async (route) => {
    const r = await route.fetch(); let s = await r.text();
    s = s.replace('const go = () => { warm(); startGame(); };', 'const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();');
    await route.fulfill({ response: r, body: s });
  });
  await p.goto(BASE + '/index.html' + (MAP ? '?map=' + MAP + '&sector=' + SEC : ''), { timeout: 300000 });
  await p.waitForFunction(() => window.__GAME, null, { timeout: 900000 });
  const R = await p.evaluate(async ({ MAP }) => {
    const g = __GAME, S = g.state, w = g.world, T = THREE;
    try { AEGIS_INTRO.markReady(); AEGIS_INTRO.close(); } catch (e) {}
    S.noRender = true; S.paused = true; S.started = true;
    { const st0 = g.step; g.step = (n, dt) => { S.paused = false; try { return st0(n, dt); } finally { S.paused = true; } }; }
    const out = { runs: [], lod: [] };
    const s = g.squad.find((q, i) => i !== S.activeIdx && !q.dead), c = s.ctrl, M = s.char.metrics;
    out.M = { hipY: M.hipY, thigh: M.thigh, shin: M.shin, ankleY: M.ankleY, bones: s.char.bones.length };
    const bone = (n) => s.char.bone(n);
    const wp = (n) => bone(n).getWorldPosition(new T.Vector3());
    S.activeIdx = -1; S.spectate = false;
    for (const k of ['update', 'drive', 'fire']) if (g._C.combat) g._C.combat[k] = () => {};
    for (const k of ['think', 'drive']) if (g._C.tactics) g._C.tactics[k] = () => {};
    if (g._C.teams) { g._C.teams.update = () => {}; g._C.teams.lod = () => {}; }
    for (const o of g.squad) if (o !== s) { o.dead = true; o.finished = true; try { GPhysics.get(g.world).removeActor(o.ctrl); } catch (e) {} if (o.char) o.char.root.visible = false; }
    s.dead = false; s.finished = false;
    let poses = 0; const P0 = GAnimator.pose; GAnimator.pose = function (who) { if (who === s) poses++; return P0.apply(this, arguments); };
    // route: flat range -> along x on open ground near the soldier; forest -> base to base
    let routes;
    if (!MAP) { const o = c.pos.clone(); routes = [[{ x: o.x, z: o.z }, { x: o.x, z: o.z - 60 }], [{ x: o.x - 3, z: o.z - 40 }, { x: o.x - 3, z: o.z + 20 }]]; }
    else {
      // straight 42 m route inside the active sector (v21) / anywhere (orig): flat, clear of statics at knee & chest
      const hy = (x, z) => w.heightAt(x, z), sec = w.sector, inSec = (x, z, mg) => !sec || !sec.margin || sec.margin(x, z) > mg;
      const tr = g._C.traceRay, ray = new T.Raycaster(), o0 = c.pos.clone(); let best = null;
      for (let rr = 0; rr <= 160 && !best; rr += 8) for (let k = 0; k < Math.max(1, Math.round(rr / 4)) && !best; k++) {
        const an = k / Math.max(1, Math.round(rr / 4)) * Math.PI * 2, x = o0.x + Math.cos(an) * rr, z = o0.z + Math.sin(an) * rr;
        if (!inSec(x, z, 6)) continue;
        for (let j = 0; j < 12 && !best; j++) {
          const yaw = j / 12 * Math.PI * 2, dx = -Math.sin(yaw), dz = -Math.cos(yaw);
          let ok = true;
          for (let s2 = 0; s2 <= 42 && ok; s2 += 1.5) { const qx = x + dx * s2, qz = z + dz * s2, q2x = qx + dx * 1.5, q2z = qz + dz * 1.5; if (!inSec(qx, qz, 3) || Math.abs(hy(q2x, q2z) - hy(qx, qz)) > 0.3) ok = false; }
          if (!ok) continue;
          for (const hh of [0.45, 1.3]) { ray.set(new T.Vector3(x, hy(x, z) + hh, z), new T.Vector3(dx, 0, dz)); ray.far = 42; if (tr && tr(ray)) { ok = false; break; } }
          if (ok) best = { A: { x, z }, D: { x: x + dx * 42, z: z + dz * 42 } };
        }
      }
      if (!best) { const A = w.bases.alpha, D = w.bases.delta; best = { A, D }; }
      out.route = best;
      routes = [[best.A, best.D], [best.D, best.A]];
    }
    const kneeAng = (n) => 2 * Math.acos(Math.min(1, Math.abs(bone(n).quaternion.w)));
    function run(from, to, speedMode, frames) {
      const yaw = Math.atan2(-(to.x - from.x), -(to.z - from.z));
      const sx = from.x + (to.x - from.x) * 0.08, sz = from.z + (to.z - from.z) * 0.08;
      c.pos.set(sx, (w.heightAt ? w.heightAt(sx, sz) : c.pos.y) + 0.1, sz); c.vel.set(0, 0, 0); c._motorVX = 0; c._motorVZ = 0; s.motion = null; s._lodHid = false; s._lodI = 0; s._lodR = 0; s._posed = false;
      c.yaw = yaw; s.idleYaw = yaw;
      const dt = 1 / 60, tr = []; let prevK = null;
      const pops = [];
      for (let i = 0; i < frames; i++) {
        c.aiWish = new T.Vector2(0, speedMode === 'walk' ? -0.45 : -1); c.aiSprint = speedMode === 'sprint'; s.idleYaw = yaw; s._lodI = 0; s._lodR = 0; s._lodHid = false;
        g.step(1, dt);
        if (i < 50) continue;
        const h = wp('hips'), st = s.motion || {}, F = (st.debug && st.debug.feet) || {};
        const kR = kneeAng('kneeR'), kL = kneeAng('kneeL');
        const f = { i, cy: c.pos.y, hy: h.y, hl: bone('hips').position.y, drop: st.pelvisDrop || 0, gr: c.grounded !== false, sp: c.speed || 0, pL: !!(F.L && F.L.plant), pR: !!(F.R && F.R.plant), ph: st.phase || 0, kR, kL, gapL: s.rig.footGap ? s.rig.footGap.L : 0, gapR: s.rig.footGap ? s.rig.footGap.R : 0, aLy: wp('ankleL').y - c.pos.y, aRy: wp('ankleR').y - c.pos.y };
        if (prevK) { const j = Math.max(Math.abs(kR - prevK[0]), Math.abs(kL - prevK[1])) * 180 / Math.PI; if (j > 12) pops.push([i, +j.toFixed(1), f.pL ? 1 : 0, f.pR ? 1 : 0, +(f.ph % 1).toFixed(2), f.gr ? 1 : 0]); }
        prevK = [kR, kL];
        tr.push(f);
      }
      return { tr, pops };
    }
    function analyse(tr) {
      const n = tr.length, dt = 1 / 60, R = {};
      const ev = []; for (const side of ['L', 'R']) for (let i = 1; i < n; i++) if (tr[i]['p' + side] && !tr[i - 1]['p' + side]) ev.push({ i, side });
      ev.sort((a, b) => a.i - b.i);
      const iv = { LR: [], RL: [] }; let same = 0;
      for (let k = 1; k < ev.length; k++) { const d = (ev[k].i - ev[k - 1].i) * dt; if (ev[k].side === ev[k - 1].side) same++; else iv[ev[k - 1].side + ev[k].side].push(d); }
      const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
      R.speed = avg(tr.map((f) => f.sp)); R.cadence = ev.length > 2 ? (ev.length - 1) / ((ev[ev.length - 1].i - ev[0].i) * dt) : 0;
      R.asym = Math.abs(avg(iv.LR) - avg(iv.RL)) / (((avg(iv.LR) + avg(iv.RL)) / 2) || 1); R.same = same;
      R.duty = (tr.filter((f) => f.pL).length + tr.filter((f) => f.pR).length) / (2 * n); R.flight = tr.filter((f) => !f.pL && !f.pR).length / n;
      // vertical oscillation of world hips per step (peak-to-peak within each step window), median
      const vo = []; for (let k = 1; k < ev.length; k++) { let lo = 1e9, hi = -1e9; for (let i = ev[k - 1].i; i < ev[k].i; i++) { const y = tr[i].hy - tr[i].cy; lo = Math.min(lo, y); hi = Math.max(hi, y); } vo.push(hi - lo); }
      vo.sort((a, b) => a - b); R.voMed = vo.length ? vo[vo.length >> 1] : 0; R.voMax = vo.length ? vo[vo.length - 1] : 0;
      const acc = []; for (let i = 2; i < n; i++) acc.push(Math.abs((tr[i].hy - tr[i].cy) - 2 * (tr[i - 1].hy - tr[i - 1].cy) + (tr[i - 2].hy - tr[i - 2].cy)) / (dt * dt));
      acc.sort((a, b) => a - b); R.acc95 = acc[Math.floor(acc.length * 0.95)] || 0; R.accMax = acc[acc.length - 1] || 0;
      const dr = tr.map((f) => f.drop); R.dropMin = Math.min(...dr); R.dropMax = Math.max(...dr);
      const hl = tr.map((f) => f.hl); R.hlPP = Math.max(...hl) - Math.min(...hl);
      R.air = tr.filter((f) => !f.gr).length;
      R.kneeMax = Math.max(...tr.map((f) => Math.max(f.kR, f.kL))) * 180 / Math.PI;
      R.gapMax = Math.max(...tr.map((f) => Math.max(Math.abs(f.gapL || 0), Math.abs(f.gapR || 0))));
      for (const k in R) if (typeof R[k] === 'number') R[k] = +R[k].toFixed(3);
      return R;
    }
    for (const [ri, [from, to]] of routes.entries()) for (const mode of ['sprint', 'run', 'walk']) {
      const { tr, pops } = run(from, to, mode, 420);
      const m = analyse(tr); m.mode = mode; m.route = ri; m.pops = pops.length; m.popList = pops.slice(0, 6);
      out.runs.push(m);
      if (ri === 0 && mode === 'sprint') out.trace = tr.slice(0, 80).map((f) => [f.i, +(f.hy - f.cy).toFixed(3), +f.hl.toFixed(3), +f.drop.toFixed(3), f.pL ? 1 : 0, f.pR ? 1 : 0, +(f.ph % 1).toFixed(2), +(f.kR * 57.3).toFixed(0), +(f.kL * 57.3).toFixed(0), +f.aLy.toFixed(2), +f.aRy.toFixed(2)]);
      await new Promise((r) => setTimeout(r, 0));
    }
    // LOD stutter: forced bands
    for (const lodR of [0, 1 / 30, 1 / 15, 0.1]) {
      const [from, to] = routes[0]; const yaw = Math.atan2(-(to.x - from.x), -(to.z - from.z));
      const sx = from.x + (to.x - from.x) * 0.08, sz = from.z + (to.z - from.z) * 0.08;
      c.pos.set(sx, (w.heightAt ? w.heightAt(sx, sz) : c.pos.y) + 0.1, sz); c.vel.set(0, 0, 0); s.motion = null; s._posed = false; s._lodPh = undefined;
      const dt = 1 / 60; let frozen = 0, maxJump = 0, prevQ = null; const before = poses; const ankle = []; 
      for (let i = 0; i < 240; i++) {
        c.aiWish = new T.Vector2(0, -1); c.aiSprint = true; s.idleYaw = yaw; s._lodHid = false; s._lodI = 0.2; s._lodR = lodR;
        g.step(1, dt);
        const q = bone('kneeR').quaternion.clone();
        if (i > 30 && prevQ) { const a = q.angleTo(prevQ); if (a < 1e-6) frozen++; maxJump = Math.max(maxJump, a); }
        prevQ = q;
        if (i > 30) { const a = wp('ankleR').sub(s.char.root.position); ankle.push(a.z * Math.cos(yaw) + a.x * Math.sin(yaw)); }
      }
      // smoothness of the right ankle's root-relative fore-aft motion: rms of second difference
      let ss = 0; for (let i = 2; i < ankle.length; i++) { const d2 = ankle[i] - 2 * ankle[i - 1] + ankle[i - 2]; ss += d2 * d2; }
      out.lod.push({ lodR: +lodR.toFixed(3), poses: poses - before, frozenFrames: frozen, kneeMaxJumpDeg: +(maxJump * 180 / Math.PI).toFixed(1), ankleJerk: +(Math.sqrt(ss / Math.max(1, ankle.length - 2)) * 1000).toFixed(2) });
    }
    GAnimator.pose = P0;
    // cost: full pose vs matrix update only
    { const t0 = performance.now(); for (let i = 0; i < 200; i++) { GAnimator.pose(s, 1 / 60, false, i / 60); } out.poseMs = +((performance.now() - t0) / 200).toFixed(3);
      const t1 = performance.now(); for (let i = 0; i < 200; i++) s.char.root.updateMatrixWorld(true); out.mwMs = +((performance.now() - t1) / 200).toFixed(3);
      let nObj = 0; s.char.root.traverse(() => nObj++); out.nObj = nObj; }
    return out;
  }, { MAP });
  R.errs = errs;
  const OUT = process.env.OUT || (OUTDIR + '/gait2-' + TAG + '-' + (MAP || 'range') + '.json');
  fs.writeFileSync(OUT, JSON.stringify(R, null, 1));
  for (const r of R.runs) console.log(JSON.stringify(Object.assign({}, r, { popList: undefined })));
  console.log('pops', JSON.stringify(R.runs.map((r) => r.popList)));
  console.log('lod', JSON.stringify(R.lod), 'poseMs', R.poseMs, 'mwMs', R.mwMs, 'nObj', R.nObj, 'M', JSON.stringify(R.M), 'errs', errs.length);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
