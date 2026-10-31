const G=__GAME, S=G.state;
const rec={};
for(let i=0;i<120;i++){
  G.step(8,1/30); await new Promise(r=>setTimeout(r,0));
  if(i%2) continue;
  for(const s of G.squad){ const b=s.battle; if(!b||s.dead||!b.flank||b.flank.until<S.time) continue; const f=b.flank, p=s.ctrl.pos, g=f.stage?f.goal:f.wp;
    (rec[s.key]=rec[s.key]||[]).push([+S.time.toFixed(1),b.mode,f.stage,+Math.hypot(g.x-p.x,g.z-p.z).toFixed(1),b.pathState,(b.path||[]).length,+(s.ctrl.speed||Math.hypot(s.ctrl.vel?.x||0,s.ctrl.vel?.z||0)).toFixed(1),+(b.suppression||0).toFixed(2),b.goal===g?'g':'x',s.ctrl.aiSprint?'R':'',s.ctrl.aiWish?1:0, b.pending?'pend':''].join(' '));
  }
}
const out={}; for(const k in rec) out[k]=rec[k].filter((x,i)=>i%2===0).slice(0,16);
return {t:+S.time.toFixed(0), out};
