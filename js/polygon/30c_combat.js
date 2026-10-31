/* Battle-only AI. Uses AEGIS controllers, weapons, ammo, damage and medical FSM.
   Staggered LOS checks and bounded A*; never teleports or spawns projectiles itself. */
(function(root){'use strict';
function create({THREE:T,world,squad,visible}){
 const B=world.bounds,cell=2,NX=Math.ceil((B.x1-B.x0)/cell)+1,NZ=Math.ceil((B.z1-B.z0)/cell)+1;
 const pass=new Map();let checks=0,shots=0,paths=0;
 const node=(x,z)=>({x:Math.max(0,Math.min(NX-1,Math.round((x-B.x0)/cell))),z:Math.max(0,Math.min(NZ-1,Math.round((z-B.z0)/cell)))});
 const pos=(x,z)=>({x:B.x0+x*cell,z:B.z0+z*cell});const idx=(x,z)=>z*NX+x;
 function walk(x,z){if(x<0||z<0||x>=NX||z>=NZ)return false;const key=idx(x,z);if(pass.has(key))return pass.get(key);const p=pos(x,z),h=world.heightAt(p.x,p.z);const ok=!(world.waterY!==undefined&&h<world.waterY-.45)&&!world.blocked(p.x,p.z,h,.42);pass.set(key,ok);return ok;}
 function path(a,b){paths++;const from=node(a.x,a.z),to=node(b.x,b.z),start=idx(from.x,from.z);const open=[{...from,g:0,f:0}],cost=new Map([[start,0]]),prev=new Map(),closed=new Set();let best=from,bestH=Infinity,loops=0;
  while(open.length&&loops++<1600){let k=0;for(let j=1;j<open.length;j++)if(open[j].f<open[k].f)k=j;const n=open.splice(k,1)[0],ni=idx(n.x,n.z);if(closed.has(ni))continue;closed.add(ni);const h=Math.abs(n.x-to.x)+Math.abs(n.z-to.z);if(h<bestH){best=n;bestH=h}if(h<=1)break;
   const p=pos(n.x,n.z),y=world.heightAt(p.x,p.z);for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=n.x+dx,z=n.z+dz;if(!walk(x,z))continue;const pp=pos(x,z);if(Math.abs(world.heightAt(pp.x,pp.z)-y)>1.2)continue;const ii=idx(x,z),g=n.g+1;if(g>=(cost.get(ii)??Infinity))continue;cost.set(ii,g);prev.set(ii,ni);open.push({x,z,g,f:g+Math.abs(x-to.x)+Math.abs(z-to.z)});}}
  let k=idx(best.x,best.z);const arr=[];while(k!==start&&prev.has(k)&&arr.length<400){arr.push(pos(k%NX,Math.floor(k/NX)));k=prev.get(k)}return arr.reverse();}
 function team(s){return s.char.preset.faction;}function living(s){return !s.dead&&!s.finished&&!(s.dmg?.ph?.dead);}
 function drive(s,dt,t,active){if(s===active||!living(s))return;const c=s.ctrl,st=s.battle||(s.battle={next:t+(s.idleSeed%1)*.7,pathAt:0,path:[],shotAt:0,target:null});
  if(t>=st.next){st.next=t+.65+(s.idleSeed%1)*.2;let target=null,d0=Infinity;for(const q of squad)if(q!==s&&living(q)&&team(q)!==team(s)){const d=c.pos.distanceTo(q.ctrl.pos);if(d<d0){d0=d;target=q}}st.target=target;st.los=false;if(target&&d0<135){checks++;st.los=visible(new T.Vector3(c.pos.x,c.pos.y+1.45,c.pos.z),new T.Vector3(target.ctrl.pos.x,target.ctrl.pos.y+1.25,target.ctrl.pos.z));}}
  const q=st.target;if(!q||!living(q)){s.combatAim=null;return}if(s.thr?.mode||(s.tac&&s.tac.mode!=='idle'&&s.tac.mode!=='advance')){s.combatAim=null;return}
  const dx=q.ctrl.pos.x-c.pos.x,dz=q.ctrl.pos.z-c.pos.z,d=Math.hypot(dx,dz);const aimYaw=Math.atan2(-dx,-dz),pitch=Math.atan2(q.ctrl.pos.y-c.pos.y-.1,Math.max(.1,d));s.combatAim={pitch,target:q};s.idleYaw=aimYaw;
  c.aiReady=1;c.aiCrouch=st.los&&d<60?1:0;c.aiSprint=false;c.aiProne=false;c.aiWish=null;
  if(!st.los||d>65){if(t>st.pathAt){st.pathAt=t+4.5+(s.idleSeed%1);st.path=path(c.pos,q.ctrl.pos)}while(st.path.length&&Math.hypot(st.path[0].x-c.pos.x,st.path[0].z-c.pos.z)<.7)st.path.shift();const p=st.path[0];if(p){const mx=p.x-c.pos.x,mz=p.z-c.pos.z,L=Math.hypot(mx,mz)||1;c.aiWish=new T.Vector2((mx*Math.cos(c.yaw)-mz*Math.sin(c.yaw))/L,(mx*Math.sin(c.yaw)+mz*Math.cos(c.yaw))/L);c.aiCrouch=0;if(!st.los)s.idleYaw=Math.atan2(-mx,-mz);}}
  if(c.ammo<=0&&c.reserve>0&&c.reload<0)c.startReload();
 }
 function fire(t){for(const s of squad){const b=s.battle,c=s.ctrl;if(s.active||!living(s)||!s.combatAim||!b?.los||t<b.shotAt||!s.gun||c.treating||s.thr?.mode)continue;
  const q=b.target;if(!q||!living(q))continue;const dx=q.ctrl.pos.x-c.pos.x,dz=q.ctrl.pos.z-c.pos.z,yaw=Math.atan2(-dx,-dz),err=Math.atan2(Math.sin(yaw-c.yaw),Math.cos(yaw-c.yaw));if(Math.abs(err)>.07)continue;
  // No shooting through friendlies. A teammate within 0.8m of the firing segment blocks fire.
  const len2=dx*dx+dz*dz;let friend=false;for(const a of squad){if(a===s||!living(a)||team(a)!==team(s))continue;const ax=a.ctrl.pos.x-c.pos.x,az=a.ctrl.pos.z-c.pos.z,u=(ax*dx+az*dz)/len2;if(u>.02&&u<1&&Math.hypot(ax-u*dx,az-u*dz)<.8){friend=true;break}}if(friend)continue;
  if(c.canFire()){c.fire(t);shots++;b.shotAt=t+.18+(s.idleSeed%1)*.15;}else if(c.ammo<=0&&c.reserve>0&&c.reload<0)c.startReload();
 }}
 return {drive,fire,path,stats:()=>({checks,shots,paths,cachedNav:pass.size})};
}
root.GCombat={create};if(typeof module==='object')module.exports={create};
})(typeof window==='undefined'?globalThis:window);
