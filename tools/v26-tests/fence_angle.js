// v26: перелаз под углом (±30–35° к ограде — перебор направлений в tryVault) и раненым (медленнее, а не «не могу»).
// Те же места, что в v25-tests/fence_climb.js. Запуск: MAP=stroyka_zarechye_v2 SEC=1 node tools/v22-tests/run.cjs $PWD/tools/v26-tests/fence_angle.js
const G=__GAME, T=THREE, sq=G.squad, w=G.world, S=G.state, RA=globalThis.RAPIER;
function body(){ const cur=sq[S.activeIdx]; if(S.mode!=='embodied'||!cur||cur.dead){ const i=sq.findIndex(s=>s.team==='alpha'&&!s.dead); if(i<0) return null; G.embody(i); } return sq[S.activeIdx]; }
const P=GPhysics.get(w), sim=P.sim;
const saved=[]; const mute=(o,k)=>{ if(o&&typeof o[k]==='function'){ saved.push([o,k,o[k]]); o[k]=()=>{}; } };
for(const k of ['update','drive','fire']) mute(G._C.combat,k);
for(const k of ['think','drive']) mute(G._C.tactics,k);
mute(G._C.teams,'update');
const walls=[];
sim.forEachCollider(col=>{
  if(col.handle===P.terrain.handle) return; const sh=col.shape; if(!sh||!sh.halfExtents) return;
  const b=col.parent(); if(b&&!b.isFixed()) return;
  const he=sh.halfExtents, t=col.translation(), r=col.rotation(), q=new T.Quaternion(r.x,r.y,r.z,r.w);
  if(new T.Vector3(0,1,0).applyQuaternion(q).y<0.98) return;
  const thin=Math.min(he.x,he.z), len=Math.max(he.x,he.z);
  if(thin>0.12||len<0.7||he.y<0.64||he.y>1.08) return;
  const n=new T.Vector3(he.x<he.z?1:0,0,he.x<he.z?0:1).applyQuaternion(q); n.y=0; n.normalize();
  const u=new T.Vector3(he.x<he.z?0:1,0,he.x<he.z?1:0).applyQuaternion(q); u.y=0; u.normalize();
  walls.push({col,t:{x:t.x,y:t.y,z:t.z},he,n,u,len,thin,top:t.y+he.y});
});
function clutter(x,y,z,h,skip){ let n=0; sim.intersectionsWithShape({x,y:y+h/2+0.05,z},{x:0,y:0,z:0,w:1},new RA.Capsule(Math.max(0.01,h/2-0.3),0.3),col=>{ if(col.handle===P.terrain.handle||col.handle===skip) return true; const b=col.parent(); if(b&&!b.isFixed()) return true; n++; return true; }, RA.QueryFilterFlags.EXCLUDE_SENSORS, 0x00020001); return n; }
const spots=[];
for(const W of walls){
  for(const sgn of [1,-1]){
    const off=(W.len-0.45)*0.5*(spots.length%3-1)*0.6;
    const cx=W.t.x+W.u.x*off, cz=W.t.z+W.u.z*off;
    const ox=cx+W.n.x*sgn*0.75, oz=cz+W.n.z*sgn*0.75, ex=cx-W.n.x*sgn*1.0, ez=cz-W.n.z*sgn*1.0;
    const oy=w.heightAt(ox,oz), ey=w.heightAt(ex,ez), h=W.top-oy;
    if(Math.abs(oy-ey)>0.45||h<=1.25||h>2.15) continue;
    const sec=w.sector; if(sec&&sec.margin&&(sec.margin(ox,oz)<3||sec.margin(ex,ez)<3)) continue;
    if(clutter(ox,oy,oz,1.8,W.col.handle)||clutter(ex,ey,ez,1.8,W.col.handle)) continue;
    if(clutter(cx+W.n.x*sgn*1.4,oy,cz+W.n.z*sgn*1.4,1.8,W.col.handle)) continue;
    spots.push({W,sgn,ox,oz,cx,cz,h,gap:W.t.y-W.he.y-oy});
  }
}
const pick=spots.filter((_,i)=>i%Math.max(1,Math.floor(spots.length/14))===0).slice(0,14);
/* и до 4 пролётов с зазором снизу > 0,43 м (щит на столбах, штакетник на склоне) — нижний луч под ними проходит мимо */
const raised=spots.filter(sp=>sp.gap>0.43&&!pick.includes(sp)), nR=Math.min(4,raised.length), base=pick.length; for(let i=0;i<nR;i++) pick.push(raised[Math.floor(i*raised.length/nR)]);
const side=(c,sp)=>(c.pos.x-sp.cx)*sp.W.n.x+(c.pos.z-sp.cz)*sp.W.n.z;
const reset=(c)=>{ c.vel.set(0,0,0); c.vault=null; c.aiWish=null; c.aiSprint=false; c.reload=-1; c.prone=0; c.crouch=0; c.injLeg=0; c.injArm=0; c.treating=null; c.dragging=null; c.mounted=null; c.ladder=null; c.limp=0; };

const cases=[['угол +30°',0.52,null],['угол −35°',-0.61,null],['ранен (рука, хромает)',0,{armK:0.7,limp:0.6}],['прямо',0,null]];
const res={}; const rows=[];
for(const [name,da,inj] of cases){
  let tried=0, started=0, crossed=0, camIn=0, dur=0, inj0=0; const fails={};
  for(const sp of pick.slice(0,8)){
    const a=body(); if(!a) break; const c=a.ctrl, {W,sgn}=sp; if(a.hp!==undefined&&a.maxHp) a.hp=a.maxHp;
    c.pos.set(sp.ox,w.heightAt(sp.ox,sp.oz)+0.05,sp.oz); reset(c);
    const yaw=Math.atan2(W.n.x*sgn,W.n.z*sgn)+da;
    const setInj=()=>{ if(inj){ c.armK=inj.armK; c.limp=inj.limp; } };
    for(let i=0;i<20;i++){ c.yaw=yaw; c.stamina=1; setInj(); G.step(1,1/60); }
    c.yaw=yaw; c.stamina=1; setInj();
    const s0=side(c,sp); tried++;
    const ok=c.tryVault(), v=c.vault;
    if(ok){ started++; dur+=v.dur; inj0+=v.inj||0; } else fails[c._vaultFail||'?']=(fails[c._vaultFail||'?']||0)+1;
    let minCam=9, d0=v?v.dur:0;
    for(let i=0;i<360;i++){
      G.step(1,1/60);
      const cp=G.camera.position, dn=Math.abs((cp.x-sp.cx)*W.n.x+(cp.z-sp.cz)*W.n.z);
      if(cp.y<W.top+0.02) minCam=Math.min(minCam,dn-W.thin);
      if(i%30===0) await new Promise(r=>setTimeout(r,0));
      if(!c.vault&&i>(d0*60+30)) break;
    }
    const s1=side(c,sp); if(Math.sign(s0)!==Math.sign(s1)&&Math.abs(s1)>0.15) crossed++;
    if(minCam<0.04) camIn++;
  }
  res[name]={tried,started,crossed,camIn,fails,durMean:started?+(dur/started).toFixed(2):0,injK:started?+(inj0/started).toFixed(2):0};
}
for(const [o,k,f] of saved) o[k]=f;
return {walls:walls.length, clean:spots.length, res};
