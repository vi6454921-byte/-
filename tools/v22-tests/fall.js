const G=window.__GAME, sq=G.squad, C=G._C;
// v23: свой живой боец (генерал альфы, если жив; иначе любой живой альфы)
let ai=sq.findIndex(s=>s.team==='alpha'&&!s.npc&&!s.dead); if(ai<0) ai=sq.findIndex(s=>s.team==='alpha'&&!s.dead);
if(G.state.mode!=='embodied'||G.state.activeIdx!==ai) G.embody(ai);
const a=sq[ai], c=a.ctrl;
// v23: изоляция (как в fence_vault.js) — на время стенда боты не думают и не стреляют, иначе бойца
// посреди замера убивают пулями и травмы падения не отличить от ранений
const saved=[]; const mute=(o,k)=>{ if(o&&typeof o[k]==='function'){ saved.push([o,k,o[k]]); o[k]=()=>{}; } };
for(const k of ['update','drive','fire']) mute(C.combat,k);
for(const k of ['think','drive']) mute(C.tactics,k);
mute(C.teams,'update');
const res={who:a.key, inj0:(a.dmg.ph.inj||[]).length};
const fallFrom=async(h)=>{ c.pos.y+=h; c.vel.set(0,0,0); c.grounded=false; for(let i=0;i<40;i++){G.step(4,1/60); await new Promise(r=>setTimeout(r,0)); if(c.grounded&&i>3)break;} for(let i=0;i<10;i++){G.step(4,1/60);} };
await fallFrom(3.0);
res.h3={legDown:!!c.legDown, limp:c.limp, inj:(a.dmg.ph.inj||[]).map(x=>x.text), dead:a.dead};
await fallFrom(6.5);
res.h6={legDown:!!c.legDown, supine:!!c.supine, inj:(a.dmg.ph.inj||[]).map(x=>x.text), dead:a.dead, cap:C.caption&&C.caption.text};
for(let i=0;i<60;i++){G.step(4,1/60); await new Promise(r=>setTimeout(r,0));}
res.prone=c.prone; res.supine=c.supine;
const p0=c.pos.clone();
C.input.right=true; for(let i=0;i<20;i++){G.step(4,1/60); await new Promise(r=>setTimeout(r,0));} C.input.right=false;
res.roll1={ph:c.rollPh, dir:c.rollDir, moved:+p0.distanceTo(c.pos).toFixed(2)};
for(let i=0;i<30;i++){G.step(4,1/60); await new Promise(r=>setTimeout(r,0));}
res.roll2={ph:c.rollPh, dir:c.rollDir, moved:+p0.distanceTo(c.pos).toFixed(2)};
for(const [o,k,f] of saved) o[k]=f;
return res;
