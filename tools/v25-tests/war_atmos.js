// v25: «рядом идёт война» (17f_war_atmos.js) — дымы на горизонте, старые воронки, далёкий бой.
// Запуск (сервер поднят, корень игры):
//   MAP=stroyka_zarechye_v2 SEC=1 node tools/v22-tests/run.cjs $PWD/tools/v25-tests/war_atmos.js
// Возвращает: число дымов/воронок, где стоят воронки (грунт, не под крышей, не у баз), события боя
// за 10 мин симуляции планировщика, время кадра с дымами и без; снимки — в shots (dataURL JPEG).
const G = window.__GAME, WX = G.wx, T = THREE, w = G.world || (G._C && G._C.world);
const W = WX && WX.war;
if (!W) return { error: 'WX.war нет' };
G.step(5, 1 / 60);
for (let i = 0; i < 4; i++) WX.frame(1 / 60);
const out = { map: w && w.mapId, quality: W.quality, plumes: W.plumes ? W.plumes.list.map((p) => ({ a: +p.a.toFixed(2), d: Math.round(p.d), big: +p.big.toFixed(2) })) : null };
out.craters = W.craters ? W.craters.items.length : 0;
const items = (W.craters && W.craters.items) || [];
out.craterKinds = { big: items.filter((c) => c.v).length, small: items.filter((c) => !c.v).length };
/* проверка мест: расстояние до баз, вода, крыша над центром */
const bases = w && w.bases ? Object.values(w.bases).filter((b) => b && Number.isFinite(b.x)) : [];
const PH = root => (window.GPhysics && GPhysics.get(w)) || null;
const ph = PH();
let minBase = 1e9, roofHits = 0;
for (const c of items) {
  for (const b of bases) minBase = Math.min(minBase, Math.hypot(c.x - b.x, c.z - b.z));
  if (ph && ph.ray) { try { const h = ph.ray({ x: c.x, y: (c.y || 0) + 2.2, z: c.z }, { x: 0, y: 1, z: 0 }, 40); if (h) roofHits++; } catch (e) { /* */ } }
}
out.minBaseDist = items.length && bases.length ? Math.round(minBase) : null;
out.roofHits = ph && ph.ray ? roofHits : 'n/a';
/* планировщик боя: 10 минут «вслепую» (звук не играет — audio.ctx нет/выключен) */
if (W.battle) {
  const st0 = JSON.stringify(W.battle.stats);
  for (let i = 0; i < 600 * 10; i++) W.battle.update(0.1, true);
  out.battle10min = W.battle.stats; out.battleBefore = JSON.parse(st0);
}
/* снимки */
const cam = G.camera, keep = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov, near: cam.near };
const shots = [];
const H = (x, z) => (w.heightAt ? w.heightAt(x, z) : 0);
const snap = (name, pos, look, fov) => {
  cam.position.copy(pos); cam.fov = fov || 60; cam.near = 0.1; cam.updateProjectionMatrix();
  cam.lookAt(look); cam.updateMatrixWorld(true);
  W.update(1 / 60, 40 + shots.length * 0.5, { paused: true, battle: false, physReady: true });
  if (window.GLod) GLod.frame(cam, G.renderer.domElement.height || 540, G.squad, () => false);
  const t0 = performance.now(); G.renderer.render(G.scene, cam); const ms1 = performance.now() - t0;
  shots.push({ name, data: G.renderer.domElement.toDataURL('image/jpeg', 0.82), ms: Math.round(ms1) });
};
const F = W.frame;
const c0 = new T.Vector3(F.cx, H(F.cx, F.cz) + 1.7, F.cz);
if (W.plumes) W.plumes.list.forEach((p, k) => {
  const dir = new T.Vector3(Math.cos(p.a), 0, Math.sin(p.a));
  const eyeHigh = c0.clone().add(new T.Vector3(0, 40, 0));
  snap('plume' + k + '_high', eyeHigh, eyeHigh.clone().addScaledVector(dir, 100).add(new T.Vector3(0, 8, 0)), 55);
  /* с земли — с открытого места (воронки ставятся только под открытым небом), ближайшего к краю по направлению на дым */
  if (items.length) {
    let best = items[0], bd = -1e9;
    for (const c of items) { const d = (c.x - F.cx) * dir.x + (c.z - F.cz) * dir.z; if (d > bd) { bd = d; best = c; } }
    const e = new T.Vector3(best.x - dir.x * (best.r + 1), 0, best.z - dir.z * (best.r + 1)); e.y = H(e.x, e.z) + 1.7;
    snap('plume' + k + '_ground', e, e.clone().addScaledVector(dir, 100).add(new T.Vector3(0, 5, 0)), 60);
  }
});
/* воронки: 4 первых, камера в 2,2·r + 2,5 м под ~35° (ближе — меньше шансов попасть в крону) */
items.slice(0, 4).forEach((c, k) => {
  const y = H(c.x, c.z), r = c.r || 2, D = r * 2.2 + 2.5, an = c.a || 0;
  const pos = new T.Vector3(c.x + Math.cos(an) * D, y + 1.9 + r * 0.6, c.z + Math.sin(an) * D);
  snap('crater' + k + '_r' + (+r).toFixed(1) + (c.v ? 'big' : 'small'), pos, new T.Vector3(c.x, y, c.z), 55);
});
/* цена дымов: один и тот же кадр с ними и без */
if (W.plumes && W.plumes.list.length) {
  const p = W.plumes.list[0], dir = new T.Vector3(Math.cos(p.a), 0, Math.sin(p.a)), e = c0.clone().add(new T.Vector3(0, 40, 0)), L = e.clone().addScaledVector(dir, 100).add(new T.Vector3(0, 8, 0));
  cam.position.copy(e); cam.lookAt(L); cam.updateMatrixWorld(true);
  const time = () => { let best = 1e9; for (let i = 0; i < 3; i++) { const t0 = performance.now(); G.renderer.render(G.scene, cam); G.renderer.getContext().finish(); best = Math.min(best, performance.now() - t0); } return +best.toFixed(1); };
  time();
  W.plumes.mesh.visible = false; const a1 = time(); W.plumes.mesh.visible = true; const b1 = time();
  W.plumes.mesh.visible = false; const a2 = time(); W.plumes.mesh.visible = true; const b2 = time();
  out.msWithout = Math.min(a1, a2); out.msWith = Math.min(b1, b2);
}
cam.position.copy(keep.p); cam.quaternion.copy(keep.q); cam.fov = keep.fov; cam.near = keep.near; cam.updateProjectionMatrix();
out.shotTimes = shots.map((s) => s.name + ':' + s.ms);
out.shots = shots;
return out;
