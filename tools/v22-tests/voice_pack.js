// v23 · записанные голоса: пакет загружен, куски декодируются, доклад своего идёт по рации, противника — вживую
// вблизи; уровень на выходе голосового тракта (дБ ПШ); фразы медика; пауза глушит; обычный доклад не перебивает
// идущий, «Граната!» перебивает. Работает при любой громкости (замер — до общего регулятора).
const G = __GAME, C = G._C, S = G.state, sq = G.squad;
const A = C.WX && C.WX.audio;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
C.SET.calloutSpeech = true; C.SET.voices = 1;
if (A && A.init) A.init();
if (A && A.ctx && A.ctx.state !== 'running') try { await A.ctx.resume(); } catch (e) { /* */ }
out.ctx = A && A.ctx ? A.ctx.state : null;
const wasPaused = S.paused; S.paused = false;
if (S.activeIdx < 0) G.embody(Math.max(0, sq.findIndex((s) => s.team === 'alpha' && !s.npc)));
for (let i = 0; i < 150 && GVoice.state().pack !== 2; i++) { G.step(1, 1 / 30); await sleep(100); }
out.pack = GVoice.state();
out.voices = GVoice.voices().pack;
const act = sq[S.activeIdx], team = act && act.team;
const mates = sq.filter((s) => s !== act && !s.dead && s.team === team), foes = sq.filter((s) => !s.dead && s.team && s.team !== team);
/* у соседей по команде разные дикторы */
out.profiles = mates.slice(0, 6).map((s) => { const P = GVoice.profile(s); return s.key + ':' + out.voices[P.vi] + '@' + P.rate; });
const an = A.ctx.createAnalyser(); an.fftSize = 2048; const z = A.ctx.createGain(); z.gain.value = 0; an.connect(z); z.connect(A.ctx.destination);
GVoice.tap = an;
const buf = new Float32Array(2048);
const meter = async (ms) => { let mx = 0, sum = 0, n = 0, act_ = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { an.getFloatTimeDomainData(buf); let r = 0; for (const v of buf) r += v * v; r = Math.sqrt(r / buf.length); mx = Math.max(mx, r); if (r > 0.003) { sum += r; act_++; } n++; await sleep(20); } return { peakRmsDb: +(20 * Math.log10(mx + 1e-9)).toFixed(1), activeRmsDb: act_ ? +(20 * Math.log10(sum / act_)).toFixed(1) : null, activeShare: +(act_ / Math.max(1, n)).toFixed(2) }; };
const res = async (r) => { const cap = C.caption && C.caption.text; await sleep(150); return { ok: r, cap, last: GVoice.last }; };
const mate = mates[0], foe = foes.slice().sort((a, b) => Math.hypot(a.ctrl.pos.x - act.ctrl.pos.x, a.ctrl.pos.z - act.ctrl.pos.z) - Math.hypot(b.ctrl.pos.x - act.ctrl.pos.x, b.ctrl.pos.z - act.ctrl.pos.z))[0];
/* 1) доклад о контакте у своего — по рации */
await sleep(1200);
GVoice.reset();
const B = GVoice.bearing(mate.ctrl.pos, foe.ctrl.pos);
out.contact = await res(GVoice.say(mate, 'contact', B));
out.contactLvl = await meter(2400);
/* 2) пока идёт — обычный доклад не должен перебить */
GVoice.say(mates[1] || mate, 'reload');
out.busyBlock = { lastWho: GVoice.last && GVoice.last.who };
await sleep(1600);
/* 3) противник вблизи — вживую (ставим его в 12 м от слушателя) */
const fp = foe.ctrl.pos, ap = act.ctrl.pos, save = { x: fp.x, y: fp.y, z: fp.z };
fp.x = ap.x + 12; fp.z = ap.z;
GVoice.reset();
out.enemy = await res(GVoice.say(foe, 'grenade'));
out.enemyLvl = await meter(1250);
fp.x = save.x; fp.z = save.z;
await sleep(1400);
/* 4) далёкий противник — не слышно */
fp.x = ap.x + 80; fp.z = ap.z;
GVoice.reset();
out.enemyFar = GVoice.say(foe, 'smoke');
fp.x = save.x; fp.z = save.z;
/* 5) медик (тактика) — по рации без своего субтитра */
await sleep(500);
GVoice.reset();
out.medic = await res(GVoice.line(mates[2] || mate, 'aid'));
await sleep(300);
/* 6) «Граната!» перебивает идущий доклад */
out.interrupt = await res(GVoice.say(mates[3] || mate, 'grenade'));
await sleep(200);
/* 7) пауза глушит */
S.paused = true; GVoice.update(0.1); out.pausedLive = GVoice.state().live; S.paused = false;
GVoice.tap = null; an.disconnect();
out.final = GVoice.state();
S.paused = wasPaused;
return out;
