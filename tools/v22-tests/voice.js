const G=window.__GAME, sq=G.squad, C=G._C;
let ai=sq.findIndex(s=>s.team==='alpha'&&!s.npc);
if(G.state.mode!=='embodied') G.embody(ai);
const log=[]; let last='';
const said=[]; const orig=GVoice.say; 
GVoice.say=function(s,k,c){const r=orig.apply(this,arguments); said.push([s.key,k,r]); return r;};
for(let i=0;i<120;i++){ G.step(10,1/60); const c=C.caption; if(c&&c.text!==last){last=c.text; log.push([+(C.S?C.S.time:0).toFixed?.(1),c.text]);} await new Promise(r=>setTimeout(r,0)); }
GVoice.say=orig;
return {log, said:said.slice(0,30), alive:sq.filter(s=>!s.dead).length};
