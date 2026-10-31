// v23: частота докладов — 60 с боя от начала: сколько субтитров докладов показано, сколько разных, какие виды.
// Для сравнения сборок (BASE=… run.cjs voice_rate.js): поверх одного и того же боя (одна карта и сектор).
const G=window.__GAME, sq=G.squad, C=G._C, S=G.state;
S.paused=false;
let ai=sq.findIndex(s=>s.team==='alpha'&&!s.npc&&!s.dead);
if(S.mode!=='embodied') G.embody(ai);
const log=[]; let last=''; const extSay={};
const orig=GVoice.say;
GVoice.say=function(s,k,c){ const r=orig.apply(this,arguments); if(r) extSay[k]=(extSay[k]||0)+1; return r; };
const t0=S.time;
for(let i=0;i<360;i++){ G.step(10,1/60); const c=C.caption; if(c&&c.text!==last){ last=c.text; log.push([+(S.time-t0).toFixed(1),c.text]); } await new Promise(r=>setTimeout(r,0)); }
GVoice.say=orig;
const distinct=new Set(log.map(l=>l[1].replace(/^[^:]+:\s*/,''))).size;
let minGap=1e9; for(let i=1;i<log.length;i++) minGap=Math.min(minGap,log[i][0]-log[i-1][0]);
return {simT:+(S.time-t0).toFixed(1), captions:log.length, distinct, minGap:log.length>1?+minGap.toFixed(1):null, extSay, log:log.slice(0,40), alive:sq.filter(s=>!s.dead).length};
