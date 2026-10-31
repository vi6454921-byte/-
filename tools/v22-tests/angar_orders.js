const g = __GAME, S = g.state, w = g.world;
S.paused = false;
const out = [];
const snap = (tag) => { const m = g.combat && g.combat.stats ? g.combat.stats().modes : []; out.push(tag + ' t=' + S.time.toFixed(1) + ' | ' + g.squad.map((s, i) => { const o = s.order || {}; const b = s.battle || {}; return s.key.replace('_soldier_', 's') + ':' + (b.mode || '-') + '/' + (o.mode || '-') + ' v' + (s.ctrl.speed || 0).toFixed(1) + (s.dead ? 'D' : '') + (s.active ? '*' : ''); }).join(' ')); };
snap('start');
for (let k = 0; k < 6; k++) { g.step(60, 1 / 30); snap('k' + k); }
return out;
