/* Юнит-тесты 19b_audio_distance.js: node tools/audio-tests/distance.cjs */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
globalThis.window = globalThis;
const D = require('../../js/polygon/19b_audio_distance.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const near = (a, b, e) => assert.ok(Math.abs(a - b) <= e, `${a} !~ ${b}`);

t('inverse-distance gain matches Web Audio formula', () => {
  near(D.gainAt(1), 1, 1e-9); near(D.gainAt(8), 1, 1e-9);
  near(D.gainAt(100), 8 / (8 + 0.55 * 92), 1e-9);
  assert.ok(D.gainAt(16) > D.gainAt(32) && D.gainAt(32) > D.gainAt(64));
  const dbAt = (d) => 20 * Math.log10(D.gainAt(d));
  assert.ok(dbAt(280) < -22 && dbAt(280) > -30, 'far shot ~ -26 dB (v26), got ' + dbAt(280));
  assert.ok(D.gainAt(280) < D.gainAt(10) / 10, 'distant shot is not "right next to" the player');
});
t('air-absorption low-pass falls with distance, steeper far, clamped', () => {
  near(D.airCutoff(0), 16000, 1);
  let prev = Infinity;
  for (const d of [0, 20, 60, 120, 150, 200, 280, 1000]) { const f = D.airCutoff(d); assert.ok(f <= prev); assert.ok(f >= 700 && f <= 16000); prev = f; }
  assert.ok(D.airCutoff(100) < 8000 && D.airCutoff(280) < 2500);
  assert.ok(D.airCutoff(150) - D.airCutoff(200) > D.airCutoff(100) - D.airCutoff(150) - 2000);
});
t('propagation delay d/343, clamped', () => {
  near(D.delayAt(343), 1, 1e-9); near(D.delayAt(100), 100 / 343, 1e-9); near(D.delayAt(171.5), 0.5, 1e-9); near(D.delayAt(0), 0, 0);
  assert.ok(D.delayAt(5000) <= 1.6);
});
t('far layer crossfade 60→150 m', () => {
  assert.strictEqual(D.farMix(30), 0); assert.strictEqual(D.farMix(60), 0);
  assert.strictEqual(D.farMix(150), 1); assert.strictEqual(D.farMix(500), 1);
  assert.ok(D.farMix(100) > 0.3 && D.farMix(100) < 0.7);
  assert.ok(D.farCutoff(100) < 1100 && D.farCutoff(280) >= 380);
});
t('weapon trims (sound-lab table)', () => {
  const T = { ak74: -3, akm: 5, glock18c: -4, m416: 2.5, mp5a3: 3.8, m870: 4.5, scar: -1, svd: 0 };
  for (const k in T) near(20 * Math.log10(D.trimLin(k)), T[k], 1e-9);
  assert.strictEqual(D.trimLin('unknown'), 1);
  assert.ok(D.shotParams(50, 'akm').gain > D.shotParams(50, 'ak74').gain);
});
t('occlusion: ≤1300 Hz and -5 dB (v26)', () => {
  const a = D.shotParams(40, 'ak74', false, false, 'high'), b = D.shotParams(40, 'ak74', true, false, 'high');
  near(20 * Math.log10(b.gain / a.gain), -5, 1e-6); assert.ok(b.lp <= 1300 && b.farLp <= 1300 && a.lp > 1300);
});
t('indoor adds reverb, low quality has no outdoor tail', () => {
  assert.ok(D.shotParams(20, 'ak74', false, true, 'high').tail > 0.4);
  assert.strictEqual(D.shotParams(200, 'ak74', false, false, 'low').tail, 0);
  assert.ok(D.shotParams(200, 'ak74', false, false, 'high').tail > 0.3);
  assert.ok(D.shotParams(200, 'ak74', false, false, 'low').far <= 0.6);
});
t('voice limits per quality', () => {
  assert.deepStrictEqual(['low', 'medium', 'high'].map(D.maxVoices), [8, 14, 24]);
  assert.strictEqual(D.maxVoices(undefined), 14);
  assert.ok(D.tailsAllowed('medium') && !D.tailsAllowed('low'));
});
t('voice pool: play / drop quietest / steal', () => {
  const v = [{ end: 5, score: 0.5 }, { end: 5, score: 0.2 }, { end: 5, score: 0.9 }, { end: 0.5, score: 0.01 }];
  assert.strictEqual(D.poolDecide(v, 1, 4, 0.3).action, 'play'); /* 3 активных < 4 */
  assert.deepStrictEqual(D.poolDecide(v, 1, 3, 0.1), { action: 'drop', index: -1 });
  assert.deepStrictEqual(D.poolDecide(v, 1, 3, 0.3), { action: 'steal', index: 1 });
});
t('shooter gate: thinning beyond 200 m (v26) and 12/s cap beyond 40 m', () => {
  let st = {}, played = 0;
  for (let i = 0; i < 40; i++) if (D.shooterGate(st, i / 15, 260)) played++; /* 15 выстр/с ~ 2.7 с */
  assert.ok(played <= 22 && played >= 15, 'thinned to half: ' + played);
  st = {}; played = 0;
  for (let i = 0; i < 60; i++) if (D.shooterGate(st, i / 20, 80)) played++; /* 20/с, 3 с */
  assert.ok(played <= 12 * 3 + 4 && played >= 30, 'capped ~12/s: ' + played);
  st = {}; played = 0;
  for (let i = 0; i < 30; i++) if (D.shooterGate(st, i / 15, 10)) played++;
  assert.strictEqual(played, 30);
});
t('pan from listener basis and behind detection', () => {
  const r = D.panFrom(10, 0, 1, 0, 0, -1); assert.ok(r.pan > 0.8); near(r.front, 0, 1e-9);
  assert.ok(D.panFrom(-10, 0, 1, 0, 0, -1).pan < -0.8);
  assert.ok(D.panFrom(0, -10, 1, 0, 0, -1).front > 0.99 && D.panFrom(0, 10, 1, 0, 0, -1).front < -0.99);
  assert.strictEqual(D.panFrom(0.1, 0.1, 1, 0, 0, -1).pan, 0);
});
t('npc weapon mix is deterministic, varied, covers all rifle roles', () => {
  const cnt = {};
  for (const team of ['alpha', 'delta']) for (let g = 1; g <= 2; g++) for (let i = 1; i <= 30; i++) { const k = `${team}_${g}_n${i}`; const w = D.npcGun(k); assert.strictEqual(w, D.npcGun(k)); cnt[w] = (cnt[w] || 0) + 1; }
  for (const w of ['ak74', 'akm', 'm416', 'scar', 'mp5a3', 'svd', 'm870']) assert.ok(cnt[w] > 0, 'missing ' + w + JSON.stringify(cnt));
  assert.ok(cnt.ak74 > cnt.svd && !cnt.glock18c);
});

/* интеграция с поддельным AudioContext: сэмплы своего оружия, пул, дальность */
t('bind(): every weapon plays its own bank; far skipped; pool bounded', () => {
  const dir = path.join(__dirname, '../../assets/snd');
  for (const f of fs.readdirSync(dir)) if (/^shot_.*\.js$/.test(f)) require(path.join(dir, f));
  const made = { bufSrc: [], gains: 0 };
  const node = () => ({ connect(x) { return x; }, disconnect() {}, gain: { value: 1, setTargetAtTime() {} }, frequency: { value: 0 }, pan: { value: 0 }, Q: { value: 0 }, playbackRate: { value: 1 }, start() {}, stop() {} });
  const ctx = {
    currentTime: 0, sampleRate: 48000,
    createBuffer: (ch, len, sr) => ({ length: len, duration: len / sr, getChannelData: () => new Float32Array(len) }),
    createBufferSource() { const s = node(); made.bufSrc.push(s); return s; },
    createGain: node, createBiquadFilter: node, createStereoPanner: node, createConvolver: () => node()
  };
  const audio = { ctx, gunBus: node() };
  const R = D.bind(audio);
  R.listen({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
  assert.strictEqual(R.shot({ id: 'nonexistent', key: 'x', x: 10, y: 1, z: 0, quality: 'high' }), false);
  const ids = Object.keys(D.TRIM_DB);
  for (const id of ids) { assert.strictEqual(R.shot({ id, key: 'k_' + id, x: 30, y: 1.3, z: -20, quality: 'high' }), true); }
  for (const id of ids) assert.strictEqual(R.stats.byWeapon[id], 1, id);
  const before = R.stats.played;
  assert.strictEqual(R.shot({ id: 'ak74', key: 'far', x: 720, y: 1, z: 0, quality: 'high' }), true); /* v26: слышно до 700 м */
  assert.strictEqual(R.stats.played, before); assert.strictEqual(R.stats.skipped, 1);
  /* 40 разных стрелков на 100 м одновременно на low: не больше 8 голосов */
  for (let i = 0; i < 40; i++) R.shot({ id: 'm416', key: 'b' + i, x: 100, y: 1, z: i, quality: 'low' });
  const live = R.voices.filter((v) => v.end > ctx.currentTime).length;
  assert.ok(live <= 8, 'voices ' + live);
  assert.ok(R.stats.dropped + R.stats.stolen > 0);
});
console.log(n + ' tests passed');
process.exit(0);
