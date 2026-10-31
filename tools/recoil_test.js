/* Проверка видимой отдачи (GRecoil): кривые ствола при 30/60/144 FPS,
   одиночный/очередь, бедро/прицел, стоя/присед/лёжа.
   node tools/recoil_test.js > recoil.json  (дальше tools/recoil_plot.py) */
const G = require('../js/polygon/05e_recoil.js');
const GUNS = {
  ak74: { id: 'ak74', fam: 'ak', stats: { cal: '545', weight: 3.3, muzzleKind: 'brake', rpm: 650 }, wp: {} },
  akm: { id: 'akm', fam: 'ak', stats: { cal: '762x39', weight: 3.3, muzzleKind: 'bare', rpm: 600 }, wp: {} },
  m416: { id: 'm416', fam: 'ar', stats: { cal: '556', weight: 3.5, muzzleKind: 'fh', rpm: 750 }, wp: {} },
  glock18c: { id: 'glock18c', fam: 'pistol', stats: { cal: '9x19', weight: 0.9, muzzleKind: 'comp', rpm: 1200 }, wp: {} },
  m870: { id: 'm870', fam: 'pump', stats: { cal: '12ga', weight: 3.6, muzzleKind: 'bare', rpm: 60 }, wp: {} }
};
function run(gun, fps, shots, ctx, T) {
  const R = G.create(); R.setProfile(gun);
  const dt = 1 / fps, iv = 60 / gun.stats.rpm;
  const out = []; let t = 0, next = 0.05, n = 0;
  while (t < T) {
    if (n < shots && t >= next - 1e-9) { R.fire(Object.assign({ burstIdx: n }, ctx)); n++; next += iv; }
    R.update(dt); t += dt;
    out.push([+t.toFixed(5), R.out.pitch, R.out.back, R.out.yaw, R.out.sh, R.mech.slide]);
  }
  return out;
}
const res = { profiles: {}, runs: [] };
for (const k in GUNS) res.profiles[k] = G.profileFor(GUNS[k]);
for (const k of ['ak74', 'm416', 'akm', 'glock18c', 'm870']) {
  for (const fps of [30, 60, 144]) res.runs.push({ gun: k, fps, mode: 'single', st: 'stand', d: run(GUNS[k], fps, 1, {}, 0.6) });
}
for (const k of ['ak74', 'm416', 'akm']) {
  for (const fps of [30, 60, 144]) res.runs.push({ gun: k, fps, mode: 'auto10', st: 'stand', d: run(GUNS[k], fps, 10, {}, 1.6) });
  for (const [st, ctx] of [['hip', {}], ['ads', { ads: 1 }], ['crouch', { crouch: 1, ads: 1 }], ['prone', { prone: 1, ads: 1 }], ['moving', { moving: 1 }]])
    res.runs.push({ gun: k, fps: 144, mode: 'auto10', st, d: run(GUNS[k], 144, 10, ctx, 1.6) });
}
/* численные проверки */
const chk = [];
for (const k of ['ak74', 'm416', 'akm', 'glock18c']) {
  const r = res.runs.filter((x) => x.gun === k && x.mode === 'single');
  const pk = r.map((x) => { let m = 0, tm = 0, mn = 0; for (const p of x.d) { if (p[1] > m) { m = p[1]; tm = p[0] - 0.05; } if (p[1] < mn) mn = p[1]; } return { fps: x.fps, peakDeg: m * 57.3, tPeakMs: tm * 1000, overshootPct: -mn / m * 100 }; });
  chk.push({ gun: k, pk });
}
/* v8: нагрев ствола — 300 выстрелов очередями по 30 (пауза 4 с на смену
   магазина), потом 120 с остывания; для разной погоды */
function heatRun(gun, wx, wet, wind) {
  const R = G.create(); R.setProfile(gun); R.setWeather(wx, wet, wind);
  const iv = 60 / gun.stats.rpm, dt = 1 / 120; let t = 0, n = 0, next = 0; const d = [];
  const T = 300 / 30 * (30 * iv + 4) + 120;
  while (t < T) {
    if (n < 300 && t >= next) { R.fire({ burstIdx: n % 30, ads: 1 }); n++; next += (n % 30 === 0) ? 4 : iv; }
    R.update(dt); t += dt;
    if (Math.round(t * 120) % 12 === 0) d.push([+t.toFixed(2), +R.heat.T.toFixed(1), +(R.jamChance({}) * 1000).toFixed(3), +R.heatSpread().toFixed(3), +R.cookRate().toFixed(4)]);
  }
  return { gun: gun.id, wx, wet, wind, peak: R.heat.peak, end: R.heat.T, d };
}
res.heat = [];
for (const [wx, wet, wind] of [['clear', 0, 1], ['rain', 1, 4], ['frost', 0, 2], ['heat', 0, 0.5]])
  for (const k of ['ak74', 'm416', 'akm']) res.heat.push(heatRun(GUNS[k], wx, wet, wind));
/* v8: усталость — тремор в покое после очереди (fatigue 0 / 0.5 / 1) */
res.fatigue = [];
for (const fat of [0, 0.5, 1]) {
  const R = G.create(); R.setProfile(GUNS.ak74); let t = 0; const d = [];
  R.fire({ fatigue: fat, ads: 1 });
  while (t < 4) { R.update(1 / 144); t += 1 / 144; d.push([+t.toFixed(4), R.out.tp || 0, R.out.ty || 0]); }
  let a = 0; for (const p of d) if (p[0] > 1) a = Math.max(a, Math.hypot(p[1], p[2]));
  res.fatigue.push({ fat, ampMrad: a * 1000, d });
}
/* численные проверки — падение теста при нарушении физики */
const fails = [];
for (const h of res.heat) {
  if (!(h.peak > 60 && h.peak < 700)) fails.push('heat peak ' + h.gun + '/' + h.wx + ' = ' + h.peak.toFixed(0));
  if (!(h.end < h.peak)) fails.push('no cooling ' + h.gun + '/' + h.wx);
  for (const p of h.d) if (!isFinite(p[1]) || !isFinite(p[2])) { fails.push('NaN heat ' + h.gun); break; }
}
const hp = (g, w) => res.heat.find((h) => h.gun === g && h.wx === w);
if (!(hp('ak74', 'rain').end < hp('ak74', 'clear').end)) fails.push('rain should cool faster');
if (!(hp('ak74', 'heat').end > hp('ak74', 'frost').end)) fails.push('hot ambient should stay hotter');
if (!(res.fatigue[2].ampMrad > res.fatigue[0].ampMrad)) fails.push('fatigue tremor not increasing');
for (const r of res.runs) for (const p of r.d) if (!p.every(isFinite)) { fails.push('NaN in run ' + r.gun + ' ' + r.fps); break; }
for (const c of chk) { const a = c.pk.map((x) => x.peakDeg); if (Math.max(...a) / Math.min(...a) > 1.25) fails.push('fps-dependent peak ' + c.gun + ' ' + a.map((x) => x.toFixed(2)).join('/')); }
res.fails = fails;
console.error(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'recoil: all checks OK');
console.error('heat peaks: ' + res.heat.map((h) => h.gun + '/' + h.wx + ' ' + h.peak.toFixed(0) + '→' + h.end.toFixed(0) + '°C').join(', '));
console.error('fatigue tremor mrad: ' + res.fatigue.map((f) => f.fat + ':' + f.ampMrad.toFixed(3)).join(' '));
if (fails.length) process.exitCode = 1;
res.checks = chk;
console.log(JSON.stringify(res));
