// v26 · голосовой пакет: версия/формат (Opus), декодирование в браузере, полнота ключей, радиообмен по правилам
// (вызов «кого — кто», ответ «на приёме», «конец связи»), доклад о потерях по факту боя, штурм помещения,
// «БК», медик (жгут/перевязка), субтитры «(рация)». Запуск (сервер игры на :8000):
//   node tools/v22-tests/run.cjs ../v26-tests/voice26.js
const G = __GAME, C = G._C, S = G.state, sq = G.squad;
const A = C.WX && C.WX.audio;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { errors: [] };
const err = (m) => { out.errors.push(m); };
C.SET.calloutSpeech = true; C.SET.voices = 1;
if (A && A.init) A.init();
if (A && A.ctx && A.ctx.state !== 'running') try { await A.ctx.resume(); } catch (e) { /* */ }
const wasPaused = S.paused; S.paused = false;
if (S.activeIdx < 0) G.embody(Math.max(0, sq.findIndex((s) => s.team === 'alpha' && !s.npc)));
for (let i = 0; i < 200 && GVoice.state().pack !== 2; i++) { G.step(1, 1 / 30); await sleep(100); }
const V = self.__VOICE_DATA;
out.pack = { state: GVoice.state().pack, ver: V && V.ver, fmt: V && V.fmt, voices: V && V.voices, clips: V ? Object.keys(V.d).length : 0 };
if (!V || V.ver !== 26) err('пакет не v26');
/* 1) полнота: каждый субтитр имеет клип, каждый клип — субтитр и длительность */
let miss = [];
for (const v of V.voices) for (const k in V.tv[v]) { if (!V.d[v + '/' + k]) miss.push(v + '/' + k); if (!(V.u[v] && V.u[v][k] > 0.2)) miss.push('u:' + v + '/' + k); }
out.missing = miss.slice(0, 10); if (miss.length) err('нет клипов/длительностей: ' + miss.length);
/* 2) Opus декодируется, длительность совпадает с V.u (±0,15 с) */
const b64 = (s) => { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8.buffer; };
const keys = Object.keys(V.d), probe = [];
for (let i = 0; i < 16; i++) probe.push(keys[Math.floor((i + 0.5) * keys.length / 16)]);
out.decode = [];
for (const k of probe) {
  const [v, kk] = k.split('/');
  try { const b = await A.ctx.decodeAudioData(b64(V.d[k])); const d = +b.duration.toFixed(2); out.decode.push(k + ':' + d + '/' + V.u[v][kk]); if (Math.abs(d - V.u[v][kk]) > 0.15) err('длительность ' + k); }
  catch (e) { err('не декодируется ' + k); out.decode.push(k + ':ERR'); }
}
/* 3) радиосцены: все ключи существуют для Второго и Третьего, по правилам вызова */
const act = sq[S.activeIdx], team = act && act.team;
const mates = sq.filter((s) => s !== act && !s.dead && s.team === team && s.ctrl);
const a = mates[0], b = mates[1];
out.radio = {};
for (const name of Object.keys(V.meta.radio)) for (const cb of [2, 3]) {
  const L = GVoice.radioLines(name, a, b, cb, null);
  const ks = L.map((l) => l.key), bad = ks.filter((k) => !V.d[V.voices[0] + '/' + k]);
  if (bad.length) err('радио ' + name + ': нет ' + bad.join(','));
  if (cb === 2) out.radio[name] = ks.join(' ');
}
const tv = V.tv[V.voices[0]];
if (!/^Второй, я Первый\. Приём\.$/.test(tv.c12) || !/на приёме/.test(tv.a2) || !/Конец связи/.test(tv.m_ackend)) err('радиопротокол: тексты');
/* 4) доклад о потерях — по факту: никого / лёгкий / тяжёлый / двухсотый / оба */
const F = (dead, hurt) => ({ dead, hurt: new Set(hurt) });
const third = mates[2] || b;
const lk = (f) => GVoice.radioLines('losses', a, b, 2, f).map((l) => l.key);
out.losses = { none: lk(F(0, [])), w: lk(F(0, [third])), d: lk(F(1, [])), dw: lk(F(1, [third])) };
if (out.losses.none[3] !== 'm_loss0' || out.losses.none[4] !== 'm_ackend') err('потери: нет потерь');
if (!/m_loss3/.test(out.losses.w[3])) err('потери: трёхсотый');
if (out.losses.d[3] !== 'm_loss2' || out.losses.dw[3] !== 'm_loss23') err('потери: двухсотый');
/* 5) живой прогон сцены по рации: субтитры с пометкой «(рация)», порядок реплик */
GVoice.reset();
const far = (s) => { const p = s.ctrl.pos, q = act.ctrl.pos; return Math.hypot(p.x - q.x, p.z - q.z); };
out.dist = mates.slice(0, 3).map((s) => +far(s).toFixed(1));
const caps = [];
const started = GVoice.play('radio', a, b, 'sitrep');
out.sceneStarted = started;
for (let i = 0; i < 160 && GVoice.scene(); i++) { GVoice.update(0.1); const c = C.caption && C.caption.text; if (c && caps[caps.length - 1] !== c) caps.push(c); await sleep(100); }
out.sitrepCaps = caps;
if (!started || caps.length < 4 || !caps.every((c) => c.includes('(рация)'))) err('сцена по рации: ' + caps.length);
/* 6) штурм, БК, медик */
const said = async (s, kind) => { GVoice.reset(); const ok = GVoice.say(s, kind); await sleep(150); return ok ? (C.caption && C.caption.text) : false; };
out.cqb = { stack: await said(a, 'stack'), entry: await said(b, 'entry'), room: await said(a, 'room'), ammo: await said(b, 'ammo') };
for (const [k, v] of Object.entries(out.cqb)) if (!v) err('не сказал ' + k);
GVoice.reset(); out.doneTq = GVoice.line(a, 'doneTq'); GVoice.reset(); out.done = GVoice.line(b, 'done');
if (out.doneTq !== 'Жгут наложил. Время засёк.') err('жгут: ' + out.doneTq);
if (!/Перевязал|Кровь остановил/.test(out.done || '')) err('перевязка: ' + out.done);
/* 7) «на взводе»: список и громкость выше обычной */
out.urgent = V.meta.urgent.length;
if (out.urgent < 30) err('мало реплик «на взводе»');
GVoice.stop();
S.paused = wasPaused;
out.ok = !out.errors.length;
return out;
