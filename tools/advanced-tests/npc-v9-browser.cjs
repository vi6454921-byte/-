const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/local/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});try{
const p=await b.newPage({viewport:{width:900,height:650}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));
await p.addInitScript(()=>localStorage.setItem('aegis.settings',JSON.stringify({quality:'low',volume:0,calloutSpeech:false})));
await p.route('**/js/polygon/29_game.js',async route=>{const r=await route.fetch();let s=await r.text();s=s.replace('function renderFrame(dt) {','function renderFrame(dt) { return;').replace('const go = () => { warm(); startGame(); };','const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();');await route.fulfill({response:r,body:s});});
await p.goto((process.env.BASE_URL||'http://127.0.0.1:8774/')+'index.html?map=angar_map');await p.waitForFunction(()=>window.__GAME,null,{timeout:180000});console.log('ready');
const result=await p.evaluate(()=>{
const g=__GAME,T=THREE,rows=[];g.state.paused=true;g.state.noRender=true;
const w={bounds:{x0:-100,x1:100,z0:-100,z1:100},heightAt:()=>0,colliders:[],blocked:()=>false},physics=GPhysics.get(w),s=g.squad[0],c=s.ctrl;
for(const dt of [1/120,1/60,1/30,1/20])for(const kind of ['walk','run','start-stop','turn','strafe','creep']){
 Object.assign(c,{_physicsWorld:w,_distancePhase:false,grounded:true,crouch:0,crouchMove:0,prone:0,pitch:0,ready:0,landDip:0,vault:null,lean:0,balance:null});c.pos.set(0,.025,0);c.vel.set(0,0,0);c.yaw=0;s.motion=null;s._tacHands=null;s._aidLow=false;
 let prev={},maxFootSpeed=0,maxHipSpeed=0,maxKneeSpeed=0,maxDrop=0,finite=true,phaseBack=0,prevPhase=0,hipY=null,slip=0,footDistance=0;
 for(let i=0;i<Math.round(6/dt);i++){
 const t=i*dt;let speed=kind==='run'?4.55:kind==='creep'?.08+(Math.sin(t*18)+1)*.045:2;
 if(kind==='start-stop')speed=Math.max(0,Math.min(3.8,(t%3)*5,(2.1-t%3)*5));
 c.speed=speed;c.sprint=speed>4?1:0;c.yaw=kind==='turn'?(t<2?0:Math.PI*.9*Math.min(1,(t-2)*1.2)):0;
 const angle=c.yaw+(kind==='strafe'?Math.PI/2:0);c.vel.set(-Math.sin(angle)*speed,0,-Math.cos(angle)*speed);c.pos.addScaledVector(c.vel,dt);physics.begin(dt);GAnimator.pose(s,dt,false,t);
 const h=s.char.bone('hips').position.y;if(i>10&&hipY!==null)maxHipSpeed=Math.max(maxHipSpeed,Math.abs(h-hipY)/dt);hipY=h;maxDrop=Math.max(maxDrop,s.rig.hipDrop||0);
 if(s.motion.phase<prevPhase-1e-6)phaseBack++;prevPhase=s.motion.phase;
 for(const side of ['R','L']){const f=s.motion.debug?.feet[side],a=s.char.bone('ankle'+side).getWorldPosition(new T.Vector3()),q=s.char.bone('knee'+side).quaternion.clone();finite&&=[...a.toArray(),...q.toArray()].every(Number.isFinite);
 if(i>10&&prev[side]){const d=a.distanceTo(prev[side].a);footDistance+=d;maxFootSpeed=Math.max(maxFootSpeed,d/dt);maxKneeSpeed=Math.max(maxKneeSpeed,q.angleTo(prev[side].q)/dt);if(f?.plant&&prev[side].plant)slip=Math.max(slip,Math.hypot(a.x-prev[side].a.x,a.z-prev[side].a.z));}
 prev[side]={a,q,plant:f?.plant};}
 }
 rows.push({kind,hz:Math.round(1/dt),maxFootSpeed,maxHipSpeed,maxKneeSpeed,maxDrop,finite,phaseBack,slip,footDistance});physics.dropPose(s);
}
// The real game's NPC pose scheduler, not just a direct Animator call.
c._physicsWorld=g.world;s.motion=null;g.state.activeIdx=-1;g.state.spectate=false;
for(const k of ['update','drive','fire'])if(g._C.combat)g._C.combat[k]=()=>{};
for(const k of ['think','drive'])if(g._C.tactics)g._C.tactics[k]=()=>{};
const realLOD=g._C.teams?.lod.bind(g._C.teams);
if(g._C.teams){g._C.teams.update=()=>{};g._C.teams.lod=()=>{};}
for(const other of g.squad)if(other!==s){other.dead=true;other.finished=true;GPhysics.get(g.world).removeActor(other.ctrl);}
s.dead=false;s.finished=false;c.pos.copy(s.char.root.position);c.vel.set(0,0,0);c._motorVX=0;c._motorVZ=0;
const scheduler=[];let poses=0;const original=GAnimator.pose;GAnimator.pose=function(who,...args){if(who===s)poses++;return original(who,...args)};
for(const interval of [0,1/30,1/15,.1]){
 s._lodHid=false;s._lodI=interval;s._posed=false;c.pos.set(-12,.1,-12);c.vel.set(0,0,0);c._motorVX=0;c._motorVZ=0;s.motion=null;s._poseAccum=0;const before=poses;let repeated=0,previous=null;
 for(let i=0;i<90;i++){c.aiWish=new T.Vector2(0,-1);c.aiSprint=true;s.idleYaw=0;c.yaw=0;g.step(1,1/60);const q=s.char.bone('kneeR').quaternion.clone();if(i>10&&previous&&q.angleTo(previous)<1e-7)repeated++;previous=q;}
 scheduler.push({interval,poses:poses-before,repeated});
}
// Hidden actors still retain a coarse scheduling budget.
s._lodHid=true;s._lodI=.2;s._posed=false;const hiddenBefore=poses;
for(let i=0;i<90;i++){c.aiWish=new T.Vector2(0,-1);s.idleYaw=0;g.step(1,1/60);}
const hiddenPoses=poses-hiddenBefore;GAnimator.pose=original;
const visibility=[];
if(realLOD){for(const distance of [30,60,100]){g.camera.position.copy(c.pos).add(new T.Vector3(0,2,distance));g.camera.lookAt(c.pos.clone().add(new T.Vector3(0,1,0)));g.camera.updateMatrixWorld(true);realLOD();visibility.push({distance,interval:s._lodI,hidden:s._lodHid});}}
return {rows,scheduler,hiddenPoses,visibility,finiteSquad:g.squad.every(s=>s.ctrl.pos.toArray().every(Number.isFinite))};
});
const label=process.env.QA_LABEL||'after';fs.writeFileSync(__dirname+'/npc-v9-'+label+'.json',JSON.stringify({result,errors},null,2));console.log(JSON.stringify({scheduler:result.scheduler,rows:result.rows,errors}));assert.equal(errors.length,0);assert(result.rows.every(r=>r.finite));assert(result.finiteSquad);
if(label==='after'){assert(result.scheduler.every(r=>r.poses===90),'visible moving NPC gets a pose every frame');assert(result.rows.every(r=>r.phaseBack===0),'phase never rewinds');assert(result.hiddenPoses<=10,'hidden NPC remains budgeted');assert(result.visibility.every(r=>!r.hidden&&r.interval===0),'visible distance bands animate every frame');}
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
