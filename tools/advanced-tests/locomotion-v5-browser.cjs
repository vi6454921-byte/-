const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/local/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});try{
const p=await b.newPage({viewport:{width:900,height:650}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));
await p.addInitScript(()=>localStorage.setItem('aegis.settings',JSON.stringify({quality:'low',volume:0,calloutSpeech:false})));
await p.route('**/js/polygon/29_game.js',async route=>{const r=await route.fetch();let s=await r.text();s=s.replace('function renderFrame(dt) {','function renderFrame(dt) { return;').replace('const go = () => { warm(); startGame(); };','const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();');await route.fulfill({response:r,body:s});});
await p.goto((process.env.BASE_URL||'http://127.0.0.1:8774/')+'index.html?map=angar_map');await p.waitForFunction(()=>window.__GAME,null,{timeout:180000});console.log('ready');
const result=await p.evaluate(()=>{
 const g=__GAME,T=THREE;g.state.paused=true;g.state.noRender=true;
 const w={bounds:{x0:-100,x1:100,z0:-100,z1:100},heightAt:()=>0,colliders:[],blocked:()=>false},scene=GPhysics.get(w);
 const cases=[],samples=[];
 const specs=[['walk',2,0,0],['run',4.55,0,0],['back',1.5,Math.PI,0],['strafe',2,Math.PI/2,0],['crouch',1.2,0,1],['turn',2,0,0],['stop',3.5,0,0],['start',0,0,0]];
 for(const dt of [1/60,1/30,1/20])for(const [name,speed,angle,crouch] of specs){
 const s=g.squad[0],c=s.ctrl;s.motion=null;s._tacHands=null;s._aidLow=false;
 Object.assign(c,{_physicsWorld:w,_distancePhase:false,yaw:0,pitch:0,prone:0,crouch,crouchMove:crouch,speed,sprint:speed>4?1:0,grounded:true,ready:0,landDip:0,vault:null,lean:0});c.pos.set(0,.025,0);c.vel.set(0,0,0);
 let maxError=0,maxPlantSlip=0,maxJump=0,minGap=10,maxDrop=0,finite=true,prev={},hipMin=10,hipMax=-10,chestMin=10,chestMax=-10;
 const frames=Math.round(4/dt);
 for(let i=0;i<frames;i++){
 const time=i*dt;let sp=speed;
 if(name==='stop'&&time>2)sp=Math.max(0,speed-(time-2)*5);
 if(name==='start')sp=Math.min(4.55,time*2.5);
 c.speed=sp;c.sprint=GAnimator.runK({speed:sp});if(name==='turn')c.yaw=time*.65;
 c.vel.set(Math.sin(angle+c.yaw)*sp,0,-Math.cos(angle+c.yaw)*sp);c.pos.addScaledVector(c.vel,dt);scene.begin(dt);GAnimator.pose(s,dt,false,time);
 const H=s.char.bone('hips'),C=s.char.bone('chest');hipMin=Math.min(hipMin,H.rotation.y);hipMax=Math.max(hipMax,H.rotation.y);chestMin=Math.min(chestMin,C.rotation.y);chestMax=Math.max(chestMax,C.rotation.y);
 maxDrop=Math.max(maxDrop,s.rig.hipDrop);s.char.root.traverse(o=>{if(o.isBone)finite&&=[...o.position.toArray(),...o.quaternion.toArray()].every(Number.isFinite)});
 if(s.motion.debug)for(const side of ['R','L']){
 const f=s.motion.debug.feet[side],a=s.char.bone('ankle'+side).getWorldPosition(new T.Vector3()),target=new T.Vector3().fromArray(f.target);
 if(i>10){maxError=Math.max(maxError,a.distanceTo(target));minGap=Math.min(minGap,s.rig.footGap[side]??10);
 if(prev[side]){maxJump=Math.max(maxJump,a.distanceTo(prev[side].a));if(f.plant&&prev[side].plant)maxPlantSlip=Math.max(maxPlantSlip,Math.hypot(a.x-prev[side].a.x,a.z-prev[side].a.z));}}
 prev[side]={a:a.clone(),plant:f.plant};
 }
 if(dt===1/60&&name==='run'&&[80,90,100,110].includes(i))samples.push({i,phase:s.motion.phase,feet:s.motion.debug.feet});
 }
 cases.push({name,dt,maxError,maxPlantSlip,maxJump,minGap,maxDrop,finite,hipYawRange:hipMax-hipMin,chestYawRange:chestMax-chestMin,phase:s.motion.phase});scene.dropPose(s);
 }
 // Whole game updates preserve reload/weapon integration.
 const s=g.squad[0];s.ctrl._physicsWorld=g.world;s.motion=null;
 AEGIS_GAME.setLoadout(s.key,{slots:[{t:'gun',id:'ar15m4'},null,{t:'ammo',w:'primary'},null,null,null],cfg:{}});g.equipStand(0,0);g.step(30,1/60);
 return {cases,samples,finiteSquad:g.squad.every(s=>s.ctrl.pos.toArray().every(Number.isFinite)),weapons:!!g.fx.bulletImpacts};
});
fs.writeFileSync(__dirname+'/locomotion-v5.json',JSON.stringify({result,errors},null,2));console.log(JSON.stringify({cases:result.cases.map(c=>({name:c.name,hz:Math.round(1/c.dt),error:c.maxError,slide:c.maxPlantSlip})),errors}));
assert.equal(errors.length,0);assert(result.cases.every(c=>c.finite));assert(result.finiteSquad);
assert(result.cases.every(c=>c.maxError<0.005),'feet track reachable targets');
assert(result.cases.every(c=>c.maxPlantSlip<0.005),'stance feet do not jump');
assert(result.cases.every(c=>c.minGap > -0.005),'no ground penetration');
assert(result.cases.every(c=>c.maxJump/c.dt<13),'foot path has bounded speed');
// Isolated full-character running frame for visual inspection.
await p.evaluate(()=>{const g=__GAME,T=THREE,s=g.squad[0],c=s.ctrl;g.state.noRender=true;g.state.paused=true;g.poseStand(0,{ready:0});
const w={bounds:{x0:-100,x1:100,z0:-100,z1:100},heightAt:()=>0,colliders:[],blocked:()=>false};c._physicsWorld=w;c._distancePhase=false;c.pos.set(0,.025,0);Object.assign(c,{speed:4.55,sprint:1,grounded:true,crouch:0,prone:0,yaw:0,ready:0,crouchMove:0,vault:null});c.vel.set(0,0,-4.55);s.motion=null;
for(let i=0;i<83;i++){c.pos.addScaledVector(c.vel,1/60);GPhysics.get(w).begin(1/60);GAnimator.pose(s,1/60,false,i/60);s.rig.relaxArms(Math.sin(s.motion.phase*Math.PI*2)*1.3,0,1);}
for(const o of g.scene.children)o.visible=o.isLight||o===s.char.root;s.char.root.visible=true;g.scene.fog=null;g.scene.background=new T.Color(0x667680);const grid=new T.GridHelper(10,30);grid.position.copy(c.pos);g.scene.add(grid);g.camera.position.copy(c.pos).add(new T.Vector3(2.6,1.4,-3.3));g.camera.lookAt(c.pos.clone().add(new T.Vector3(0,.9,0)));g.camera.fov=38;g.camera.updateProjectionMatrix();g.renderer.shadowMap.enabled=false;g.renderer.setSize(900,650);g.renderer.render(g.scene,g.camera);document.body.querySelectorAll('body > :not(canvas)').forEach(e=>{if(e.tagName!=='SCRIPT'&&!e.contains(g.renderer.domElement))e.style.display='none'});g.renderer.domElement.style.cssText='position:fixed;inset:0;width:900px;height:650px;z-index:999999';});
await p.screenshot({path:__dirname+'/locomotion-v5-run.png',timeout:120000});
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
