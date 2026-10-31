const G=__GAME, S=G.state, AM=window.GActionMotion;
if(!AM.__orig) AM.__orig=AM.begin;
const log=[]; let fast=0, fastAct=0, samples=0;
AM.begin=function(s,dt,delta,active){ const z0=s.motion&&s.motion.special; const had=z0&&z0.action; const r=AM.__orig.apply(this,arguments); const z=s.motion&&s.motion.special; if(z&&z.action&&z.age===0&&!had){ log.push([z.action, +(s.ctrl.speed||0).toFixed(2), s.key||'?']); } return r; };
S.paused=false;
for(let i=0;i<300;i++){
  G.step(3,1/30); await new Promise(r=>setTimeout(r,0));
  for(const s of G.squad.concat(G.enemies||[])){ if(!s||s.dead||!s.ctrl) continue; samples++; const v=s.ctrl.speed||0; if(v>1.5){ fast++; const z=s.motion&&s.motion.special; if(z&&z.action&&z.weight>0.3) fastAct++; } }
}
AM.begin=AM.__orig;
const byName={}; for(const [n,v] of log){ const k=n+(v>1.5?'@fast':v>0.6?'@walk':'@slow'); byName[k]=(byName[k]||0)+1; }
return {t:+S.time.toFixed(1), samples, fast, fastAct, fastActFrac:+(fastAct/Math.max(1,fast)).toFixed(3), byName, sample:log.slice(0,30)};
