const G=__GAME, C=G._C, T=THREE, S=G.state;
let pair=null;
outer: for(const a of G.squad) for(const b of G.squad){ if(a.dead||b.dead||a.team===b.team) continue; const d=a.ctrl.pos.distanceTo(b.ctrl.pos); if(d<14||d>40) continue; const e1=a.ctrl.pos.clone(); e1.y+=1.5; const e2=b.ctrl.pos.clone(); e2.y+=1.3; if(C.worldVisible(e1,e2)&&C.worldVisible(e1,e2,true)) {pair=[a.key,b.key,e1,e2,d]; break outer;} }
if(!pair){ outer2: for(const a of G.squad){ if(a.dead) continue; const e1=a.ctrl.pos.clone(); e1.y+=1.5; for(let k=0;k<16;k++){ const ang=k/16*Math.PI*2, e2=new T.Vector3(e1.x+Math.sin(ang)*24,0,e1.z+Math.cos(ang)*24); e2.y=(G.world.heightAt?G.world.heightAt(e2.x,e2.z):e1.y-1.5)+1.3; if(C.worldVisible(e1,e2)&&C.worldVisible(e1,e2,true)){ pair=[a.key,'point',e1,e2,24]; break outer2; } } } }
if(!pair) return 'no pair';
const [ka,kb,e1,e2,d]=pair;
const at=e1.clone().lerp(e2,0.45); at.y=(G.world.heightAt?G.world.heightAt(at.x,at.z):at.y-1.4)+0.3;
C.GSIM.add('smoke', at.clone(), new T.Vector3(0,0.5,0), null, new T.Vector3(0,0,0), 1.2);
const out=[]; let t0=S.time;
const probe=(tag)=>out.push([tag, +(S.time-t0).toFixed(1), 'vis', C.worldVisible(e1,e2), 'tau', window.GSmoke.blocks?JSON.stringify(window.GSmoke.blocks(e1,e2)):null]);
probe('start');
for(const tt of [1.5,3,4,5,8,12,20,30,45]){ while(S.time-t0<tt){ G.step(6,1/30); await new Promise(r=>setTimeout(r,0)); } probe('t'); }
/* v23: критерий — линия закрыта не позже 5 с после броска (взрыватель 1,2 с) и остаётся закрытой до 45 с */
const blockedAt=(t)=>{ const r=out.find(o=>o[1]>=t-0.05); return r? r[3]===false : false; };
const firstBlk=(out.find(o=>o[3]===false)||[])[1];
const pass= firstBlk!==undefined && firstBlk<=5.1 && [8,12,20,30,45].every(blockedAt);
return {pass, firstBlocked:firstBlk, pair:[ka,kb,+d.toFixed(1)], out, st:window.GSmoke.state?window.GSmoke.state():null};
