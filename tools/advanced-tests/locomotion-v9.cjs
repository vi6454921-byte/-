const {environment}=require('./active-body-fixture.cjs'),fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
(async()=>{const {ctx,T,session,character}=await environment();for(const p of ['js/polygon/02_util.js','js/polygon/15_rig.js','js/advanced/gait-data.js','js/advanced/animator.js'])vm.runInContext(fs.readFileSync(__dirname+'/../../'+p,'utf8'),ctx);
const rows=[];let worstHip={v:0};
for(const dt of [1/60,1/30,1/20])for(const speed of [1.5,2.55,4.55]){
 const scene=session(),s=character(),c=s.ctrl;Object.assign(c,{_physicsWorld:scene.world,_distancePhase:false,speed,sprint:speed>4?1:0,grounded:true,crouch:0,crouchMove:0,prone:0,pitch:0,ready:0});
 // Session's actual world is kept separate from its physics handle.
 const w={bounds:{x0:-100,x1:100,z0:-100,z1:100},heightAt:()=>0,colliders:[],blocked:()=>false};c._physicsWorld=w;const p=ctx.GPhysics.get(w);s.rig={};
 let prev={},maxJump=0,maxError=0,maxSlip=0,minGap=10,maxDrop=0,worst=null;
 for(let i=0;i<240;i++){c.vel.set(0,0,-speed);c.pos.addScaledVector(c.vel,dt);p.begin(dt);const oldY=s.char.bone('hips').position.y;ctx.GAnimator.pose(s,dt,false,i*dt);const Y=s.char.bone('hips').position.y;if(i>10&&Math.abs(Y-oldY)/dt>worstHip.v)worstHip={v:Math.abs(Y-oldY)/dt,speed,dt,i,phase:s.motion.phase,drop:s.rig.hipDrop,Y,oldY,feet:s.motion.debug.feet};
 for(const side of ['R','L']){const f=s.motion.debug.feet[side],a=s.char.bone('ankle'+side).getWorldPosition(new T.Vector3());if(i>10){maxError=Math.max(maxError,a.distanceTo(new T.Vector3().fromArray(f.target)));minGap=Math.min(minGap,s.rig.footGap[side]);maxDrop=Math.max(maxDrop,s.rig.hipDrop);if(prev[side]){const jump=a.distanceTo(prev[side].a);if(jump>maxJump){maxJump=jump;worst={i,side,phase:s.motion.phase,plant:f.plant,prevPlant:prev[side].plant,from:prev[side].a.toArray(),to:a.toArray(),target:f.target,drop:s.rig.hipDrop}}if(f.plant&&prev[side].plant)maxSlip=Math.max(maxSlip,Math.hypot(a.x-prev[side].a.x,a.z-prev[side].a.z));}}prev[side]={a,plant:f.plant};}
 }
 rows.push({dt,speed,maxJump,maxError,maxSlip,minGap,maxDrop,worst});p.dropPose(s);p.sim.free();scene.sim.free();
}
assert(rows.every(r=>r.maxError < 0.005), 'IK targets reachable');
assert(rows.every(r=>r.maxSlip < 0.005), 'planted soles remain fixed');
assert(rows.every(r=>r.minGap > -0.005), 'feet stay above the support');
assert(rows.every(r=>r.maxJump/r.dt < 13), 'no single-frame foot teleport');
assert(worstHip.v<1.6,'no hard pelvis snap at the first run contact');fs.writeFileSync(__dirname+'/locomotion-v9-core.json',JSON.stringify({pass:true,rows,worstHip},null,2));console.log(JSON.stringify({worstHip,pass:true,cases:rows.length,maxError:Math.max(...rows.map(r=>r.maxError)),maxStanceSlip:Math.max(...rows.map(r=>r.maxSlip))}));
})().catch(e=>{console.error(e);process.exit(1)});
