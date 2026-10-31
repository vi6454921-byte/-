// v25: цена дымов на горизонте (17f_war_atmos.js) на карте — что именно стоит: вызов, заливка или JS.
// Запуск: MAP=forest_map_camp SEC=1 node tools/v22-tests/run.cjs $PWD/tools/v25-tests/plume_cost.js
const G = window.__GAME, T = THREE, W = G.wx && G.wx.war, cam = G.camera || G.cam;
if (!W || !W.plumes) return { error: 'нет дымов' };
const H = (x, z) => (G.world.heightAt ? G.world.heightAt(x, z) : 0);
G.step(5, 1 / 60);
const F = W.frame, M = W.plumes.mesh, geo = M.geometry, U = W.plumes.uni, gl = G.renderer.getContext();
const keep = { p: cam.position.clone(), q: cam.quaternion.clone() };
const p0 = W.plumes.list[0], dir = new T.Vector3(Math.cos(p0.a), 0, Math.sin(p0.a));
const e = new T.Vector3(F.cx, H(F.cx, F.cz) + 41.7, F.cz);
cam.position.copy(e); cam.lookAt(e.clone().addScaledVector(dir, 100).add(new T.Vector3(0, 8, 0))); cam.updateMatrixWorld(true);
const px = new Uint8Array(4);
/* лучшее из 4; «gpu» — с ожиданием конца отрисовки (readPixels 1×1), «js» — только вызов render */
const time = (sync) => { let best = 1e9; for (let i = 0; i < 4; i++) { const t0 = performance.now(); G.renderer.render(G.scene, cam); if (sync) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); best = Math.min(best, performance.now() - t0); } return +best.toFixed(1); };
const info = () => ({ calls: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles });
const out = { plume: p0, count: geo.instanceCount };
time(true);
const cases = {};
const run = (name, setup, undo) => { setup(); const r = { gpu: time(true), js: time(false), ...info() }; undo(); cases[name] = r; };
for (let rep = 0; rep < 2; rep++) {
  run('off' + rep, () => { M.visible = false; }, () => { M.visible = true; });
  run('on' + rep, () => {}, () => {});
  const n0 = geo.instanceCount;
  run('zeroInst' + rep, () => { geo.instanceCount = 0; }, () => { geo.instanceCount = n0; });
  const w0 = U.uBase.value.map((v) => v.w);
  run('allDiscard' + rep, () => { U.uBase.value.forEach((v) => { v.w = 0; }); }, () => { U.uBase.value.forEach((v, i) => { v.w = w0[i]; }); });
}
out.cases = cases;
cam.position.copy(keep.p); cam.quaternion.copy(keep.q); cam.updateMatrixWorld(true);
return out;
