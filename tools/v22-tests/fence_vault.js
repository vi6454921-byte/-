// v22: перелаз через жердевую ограду (Заречье). Берём «чистые» места вдоль жердей
// (по обе стороны 1,5 м нет других коллайдеров), ставим бойца в 0,75 м лицом к ограде,
// жмём перелаз (tryVault) и проверяем, что он оказался по другую сторону.
const G=__GAME, T=THREE, sq=G.squad, w=G.world, S=G.state, RA=globalThis.RAPIER;
function body(){ const cur=sq[S.activeIdx]; if(S.mode!=='embodied'||!cur||cur.dead){ const i=sq.findIndex(s=>s.team==='alpha'&&!s.dead); if(i<0) return null; G.embody(i); } return sq[S.activeIdx]; }
const P=GPhysics.get(w), sim=P.sim;
// изоляция: на время стенда боты не думают и не стреляют (иначе бойца убивают посреди попытки)
const saved=[]; const mute=(o,k)=>{ if(o&&typeof o[k]==='function'){ saved.push([o,k,o[k]]); o[k]=()=>{}; } };
for(const k of ['update','drive','fire']) mute(G._C.combat,k);
for(const k of ['think','drive']) mute(G._C.tactics,k);
mute(G._C.teams,'update');
const rails=[]; sim.forEachCollider(col=>{ if(!P.rungs||!P.rungs.has(col.handle)) return; const he=col.shape.halfExtents, t=col.translation(), r=col.rotation(); rails.push({col,t:{x:t.x,y:t.y,z:t.z},q:new T.Quaternion(r.x,r.y,r.z,r.w),hx:he.x}); });
function clutter(x,y,z,h,self){ let n=0; sim.intersectionsWithShape({x,y:y+h/2+0.05,z},{x:0,y:0,z:0,w:1},new RA.Capsule(Math.max(0.01,h/2-0.3),0.3),col=>{ if(col.handle===P.terrain.handle||P.rungs.has(col.handle)) return true; const b=col.parent(); if(b&&!b.isFixed()) return true; n++; return true; }, RA.QueryFilterFlags.EXCLUDE_SENSORS, 0x00020001); return n; }
const spots=[];
for(const R of rails){
  const n=new T.Vector3(0,0,1).applyQuaternion(R.q); n.y=0; n.normalize(); const u=new T.Vector3(1,0,0).applyQuaternion(R.q); u.y=0; u.normalize();
  for(const sgn of [1,-1]){
    const ox=R.t.x+n.x*sgn*0.75, oz=R.t.z+n.z*sgn*0.75, ex=R.t.x-n.x*sgn*1.0, ez=R.t.z-n.z*sgn*1.0;
    const oy=w.heightAt(ox,oz), ey=w.heightAt(ex,ez);
    if(Math.abs(oy-ey)>0.45) continue;
    const sec=w.sector; if(sec&&sec.margin&&(sec.margin(ox,oz)<3||sec.margin(ex,ez)<3)) continue;
    if(clutter(ox,oy,oz,1.8)||clutter(ex,ey,ez,1.8)) continue;
    if(clutter(R.t.x+n.x*sgn*1.4,oy,R.t.z+n.z*sgn*1.4,1.8)) continue;
    spots.push({R,n,sgn,ox,oz});
  }
}
const pick=spots.filter((_,i)=>i%Math.max(1,Math.floor(spots.length/24))===0).slice(0,24);
let tried=0, started=0, crossed=0; const out=[], hs=[];
for(const sp of pick){
  const a=body(); if(!a) break; const c=a.ctrl; const {R,n,sgn}=sp; if(a.hp!==undefined&&a.maxHp) a.hp=a.maxHp;
  const gy=w.heightAt(sp.ox,sp.oz);
  c.pos.set(sp.ox,gy+0.05,sp.oz); c.vel.set(0,0,0); c.vault=null; c.reload=-1; c.prone=0; c.crouch=0; c.injLeg=0; c.injArm=0; c.treating=null; c.dragging=null; c.mounted=null; c.ladder=null;
  for(let i=0;i<20;i++){ c.yaw=Math.atan2(n.x*sgn,n.z*sgn); c.stamina=1; G.step(1,1/60); }
  c.yaw=Math.atan2(n.x*sgn,n.z*sgn); c.stamina=1;
  const side0=(c.pos.x-R.t.x)*n.x+(c.pos.z-R.t.z)*n.z;
  tried++;
  const ok=c.tryVault(); const v=c.vault; if(ok){ started++; hs.push(+v.h.toFixed(2)); }
  for(let i=0;i<120;i++){ G.step(1,1/60); if(i%20===0) await new Promise(r=>setTimeout(r,0)); }
  const side1=(c.pos.x-R.t.x)*n.x+(c.pos.z-R.t.z)*n.z;
  const X=Math.sign(side0)!==Math.sign(side1)&&Math.abs(side1)>0.15; if(X) crossed++;
  if(a.dead){ tried--; if(ok) started--; if(X) crossed--; out.push(['убит во время попытки — не считаем']); continue; }
  out.push([+R.t.x.toFixed(1),+R.t.z.toFixed(1),sgn,ok?(v.kind+'/'+v.style+' h'+v.h.toFixed(2)):'нет: '+(c._vaultFail||'?')+(c.limp>0.12?' (хромает '+c.limp.toFixed(2)+')':''),+side0.toFixed(2),'→',+side1.toFixed(2),X?'OK':'—', c._vaultResult||'']);
}
for(const [o,k,f] of saved) o[k]=f;
return {rails:rails.length, clean:spots.length, tried, started, crossed, hMin:Math.min(...hs), hMax:Math.max(...hs), out};
