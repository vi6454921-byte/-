const {environment}=require('./active-body-fixture.cjs'),vm=require('vm'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const {ctx,T,character}=await environment();for(const p of ['js/polygon/02_util.js','js/polygon/15_rig.js','js/advanced/traversal-data.js','js/advanced/mocap-actions.js','js/advanced/animator.js','js/advanced/stumble.js','js/polygon/23_game_damage.js'])vm.runInContext(fs.readFileSync(__dirname+'/../../'+p,'utf8'),ctx,{filename:p});
vm.runInContext('{let seed=1667;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}}',ctx);
const DM=ctx.GDamage.create(T),rows=[];
function setup({dt=1/60,speed=0,height=0,colliders=[],scale=1}={}){
 const w={bounds:{x0:-30,x1:30,z0:-30,z1:30},heightAt:()=>0,blocked:()=>false,colliders},p=ctx.GPhysics.get(w),s=character({scale,y:height+.025}),c=s.ctrl;
 s.char.boneIndex=Object.fromEntries(s.char.bones.map((b,i)=>[b.name,i]));s.char.scale=scale;s.char.meshes={};s.rig={};s.dmg={testWound:0.73};
 Object.assign(c,{_physicsWorld:w,groundAt:()=>0,grounded:height===0,speed,sprint:0,crouch:0,crouchMove:0,prone:0,pitch:0,ready:0,stepPhase:0});c.vel.set(0,height>0?-2:0,-speed);s.char.root.updateMatrixWorld(true);return{s,c,w,p,dt};
}
for(const dt of [1/60,1/30,1/20])for(const direction of [new T.Vector3(1,0,0),new T.Vector3(0,0,-1)]){
 const {s,c,p}=setup({dt});assert(ctx.GStumble.trigger(s,direction,.48,{force:true}));let lean=0;
 for(let i=0;i<4/dt;i++){p.begin(dt);ctx.GStumble.update(s,dt,DM);ctx.GAnimator.pose(s,dt,false,i*dt);lean=Math.max(lean,Math.hypot(s._balance.leanX,s._balance.leanZ));}
 assert.equal(s._balance.state,'stable');assert(!s.dead&&!s.rd);assert(lean>.025);assert.equal(s.dmg.testWound,.73);rows.push({test:'catch-without-fall',dt,direction:direction.toArray(),maxLean:lean});p.dropPose(s);p.sim.free();
}
for(const dt of [1/60,1/30,1/20])for(const speed of [0,4.55]){
 const {s,c,p}=setup({dt,speed});ctx.GStumble.trigger(s,new T.Vector3(.45,0,-1),1.4,{force:true});ctx.GStumble.update(s,dt,DM);assert(s.rd?.temporary&&!s.dead);assert(!p.actors.has(c));
 const r=p.ragdolls.get(s);assert.equal(r.groups.length,15);assert.equal(r.joints.length,14);
 let worstGap=null,worstSpeed=null,maxGap=0,maxSpeed=0,gotUp=false,minY=100,firstHip=r.groups[0].curr.clone(),displacement=0;
 for(let i=0;i<14/dt;i++){
  p.begin(dt);ctx.GStumble.update(s,dt,DM);
  if(s._balance.down){DM.ragdoll(s,dt);const rd=p.ragdolls.get(s);if(rd){displacement=Math.max(displacement,rd.groups[0].curr.distanceTo(firstHip));for(const g of rd.groups){const v=g.body.linvel();if(Math.hypot(v.x,v.y,v.z)>maxSpeed){maxSpeed=Math.hypot(v.x,v.y,v.z);worstSpeed={part:g.name,i,v};}assert([v.x,v.y,v.z,...g.curr.toArray(),...g.currQ.toArray()].every(Number.isFinite));minY=Math.min(minY,g.curr.y);}for(const j of rd.joints){const a=p.sim.getRigidBody(j.body1().handle),b=p.sim.getRigidBody(j.body2().handle),wa=new T.Vector3().copy(j.anchor1()).applyQuaternion(new T.Quaternion().copy(a.rotation())).add(new T.Vector3().copy(a.translation())),wb=new T.Vector3().copy(j.anchor2()).applyQuaternion(new T.Quaternion().copy(b.rotation())).add(new T.Vector3().copy(b.translation()));if(wa.distanceTo(wb)>maxGap){maxGap=wa.distanceTo(wb);worstGap={i,part:rd.groups.find(g=>g.body.handle===b.handle)?.name,a:wa.toArray(),b:wb.toArray()};}}}}
  else if(s._balance.recovering){ctx.GAnimator.pose(s,dt,false,i*dt);ctx.GStumble.recoveryPose(s);}else {gotUp=true;break;}
 }
 assert(gotUp,'temporary fall should get up on clear flat ground');assert(!s.dead&&!s.rd&&!c._balanceBusy);assert.equal(s.dmg.testWound,.73);if(maxGap>=.12)console.log('GAP',JSON.stringify({dt,speed,maxGap,maxSpeed,minY,displacement,worstGap,worstSpeed,events:s._balance.events}));assert(maxGap<.12,'articulation anchors stay connected');assert(maxSpeed<22);assert(minY>-.18);
 rows.push({test:'fall-and-get-up',dt,speed,maxGap,maxSpeed,minY,displacement,events:s._balance.events});p.dropPose(s);p.sim.free();
}
// A ceiling must block get-up, and clearing it must permit a retry.
{const {s,c,p,w}=setup();ctx.GStumble.trigger(s,new T.Vector3(0,0,-1),1.4,{force:true});c.legDown=true;
for(let i=0;i<180;i++){p.begin(1/60);ctx.GStumble.update(s,1/60,DM);if(s.rd)DM.ragdoll(s,1/60);}
const hip=p.ragdolls.get(s).groups[0].curr,roof={type:'box',x0:hip.x-2,x1:hip.x+2,z0:hip.z-2,z1:hip.z+2,y0:.65,_top:1.0,source:{}};w.colliders.push(roof);c.legDown=false;
for(let i=0;i<240;i++){p.begin(1/60);ctx.GStumble.update(s,1/60,DM);if(s.rd)DM.ragdoll(s,1/60);}
assert(s._balance.down&&s._balance.blocked,'ceiling must block get-up');assert(!s.dead);roof.source.dead=true;
for(let i=0;i<600;i++){p.begin(1/60);ctx.GStumble.update(s,1/60,DM);if(s._balance.down)DM.ragdoll(s,1/60);else if(s._balance.recovering){ctx.GAnimator.pose(s,1/60,false,i/60);ctx.GStumble.recoveryPose(s);}}
assert.equal(s._balance.state,'stable');rows.push({test:'ceiling-blocks-recovery-and-retry',events:s._balance.events});p.dropPose(s);p.sim.free();}
// Physiology, not a timer, owns consciousness and incapacitation.
{const {s,c,p}=setup();ctx.GStumble.trigger(s,new T.Vector3(1,0,0),1.4,{force:true});s.unconscious=true;
for(let i=0;i<300;i++){p.begin(1/60);ctx.GStumble.update(s,1/60,DM);if(s.rd)DM.ragdoll(s,1/60);}
assert(s._balance.down&&!s.dead);rows.push({test:'unconscious-does-not-auto-rise'});p.dropRagdoll(s);p.sim.free();}
// Fatal/medical collapse during a temporary fall must not be revived by balance.
{const {s,c,p}=setup();ctx.GStumble.trigger(s,new T.Vector3(1,0,0),1.4,{force:true});ctx.GStumble.update(s,1/60,DM);DM.ragdoll(s,1/60);DM._standCollapse(s);
for(let i=0;i<180;i++){p.begin(1/60);ctx.GStumble.update(s,1/60,DM);DM.ragdoll(s,1/60);}
assert(s.dead&&!s.rd.temporary&&!c._balanceBusy);assert.equal(s.dmg.testWound,.73);rows.push({test:'casualty-collapse-cancels-auto-recovery'});p.dropRagdoll(s);p.sim.free();}
// High-speed casualty drops, obstacles, and body scales remain dynamic.
for(const scale of [.85,1,1.15])for(const kind of ['ground','step']){
 const colliders=kind==='step'?[{type:'box',x0:-1,x1:1,z0:-2,z1:-.4,y0:0,_top:.45}]:[],
  {s,c,p}=setup({height:.8,speed:3.5,scale,colliders});c.vel.y=-4;DM._standCollapse(s);DM.ragdoll(s,0);
 let maxGap=0,maxSpeed=0,minY=100;
 for(let i=0;i<360;i++){p.begin(1/60);DM.ragdoll(s,1/60);const r=p.ragdolls.get(s);
  for(const g of r.groups){const v=g.body.linvel();maxSpeed=Math.max(maxSpeed,Math.hypot(v.x,v.y,v.z));minY=Math.min(minY,g.curr.y);assert([...g.curr.toArray(),...g.currQ.toArray()].every(Number.isFinite));}
  for(const j of r.joints){const a=j.body1(),b=j.body2(),wa=new T.Vector3().copy(j.anchor1()).applyQuaternion(new T.Quaternion().copy(a.rotation())).add(new T.Vector3().copy(a.translation())),wb=new T.Vector3().copy(j.anchor2()).applyQuaternion(new T.Quaternion().copy(b.rotation())).add(new T.Vector3().copy(b.translation()));maxGap=Math.max(maxGap,wa.distanceTo(wb));}
 }
 assert(maxGap<.12&&maxSpeed<22&&minY>-.18);rows.push({test:'casualty-vertical-inertia-and-obstacle',kind,scale,maxGap,maxSpeed,minY});p.dropRagdoll(s);assert.equal(p.ragParts.size,0);p.sim.free();
}
// Direct impulse must alter angular momentum, not just whole-body translation.
{const {s,c,p}=setup({height:2});DM.startFall(s);p.ragdoll(s,0,DM.PI);const r=p.ragdolls.get(s),g=r.groups.find(g=>g.name==='chest'),at=g.curr.clone().add(new T.Vector3(.14,.05,0));assert(p.ragdollImpulse(s,new T.Vector3(0,0,18),at));const av=g.body.angvel();assert(Math.hypot(av.x,av.y,av.z)>.01);p.begin(1/60);assert(r.contactCount===0);for(const g of r.groups)assert(!g.body.isSleeping());rows.push({test:'off-centre-impulse-and-no-air-freeze',angularVelocity:av});p.dropRagdoll(s);assert.equal(p.ragParts.size,0);p.sim.free();}

for(const variant of ['getUpFront','getUpSide','getUpBack'])for(const hz of [60,30,20]){
 const dt=1/hz,{s,c,p}=setup({dt});ctx.GStumble.trigger(s,new T.Vector3(.6,0,-1),1.4,{force:true});let entered=false,minAnkle=10,finite=true;
 for(let i=0;i<12*hz;i++){
  p.begin(dt);ctx.GStumble.update(s,dt,DM);
  if(s._balance.down)DM.ragdoll(s,dt);
  else if(s._balance.recovering){if(!entered){s._balance.clip12=variant;s._balance.duration12=3.5;entered=true;}
   ctx.GAnimator.pose(s,dt,false,i*dt);ctx.GStumble.recoveryPose(s);
   if(s._balance.age>.5)for(const side of ['R','L'])minAnkle=Math.min(minAnkle,s.char.bone('ankle'+side).getWorldPosition(new T.Vector3()).y);
   for(const bone of s.char.bones)finite&&=[...bone.quaternion.toArray(),...bone.position.toArray()].every(Number.isFinite);
  }else if(entered)break;
 }
 assert(entered&&s._balance.state==='stable'&&finite);assert(minAnkle>.045,'recovery feet above ground '+variant+' '+minAnkle);
 rows.push({test:'mocap-supported-recovery',variant,hz,finite,minAnkle});p.dropPose(s);p.sim.free();
}
fs.writeFileSync(__dirname+'/../../docs/qa-v12/ragdoll.json',JSON.stringify({pass:true,rows,stats:ctx.GStumble.stats()},null,2));console.log(JSON.stringify({pass:true,cases:rows.length,rows}));
})().catch(e=>{console.error(e);process.exit(1)});
