const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/local/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});try{
const p=await b.newPage({viewport:{width:900,height:650}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));
await p.addInitScript(()=>localStorage.setItem('aegis.settings',JSON.stringify({quality:'low',volume:0,calloutSpeech:false})));
await p.route('**/js/polygon/29_game.js',async route=>{const r=await route.fetch();let s=await r.text();s=s.replace('function renderFrame(dt) {','function renderFrame(dt) { return;').replace('const go = () => { warm(); startGame(); };','const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();');await route.fulfill({response:r,body:s});});
await p.goto((process.env.BASE_URL||'http://127.0.0.1:8774/')+'index.html?map=angar_map');await p.waitForFunction(()=>window.__GAME,null,{timeout:180000});console.log('ready');
await p.evaluate(()=>{
 const g=__GAME,T=THREE,s=g.squad[0],c=s.ctrl;g.state.paused=true;g.state.noRender=true;
 const w={bounds:{x0:-100,x1:100,z0:-100,z1:100},heightAt:()=>0,colliders:[],blocked:()=>false};c._physicsWorld=w;s.motion=null;s._tacHands=null;s._aidLow=false;
 Object.assign(c,{_distancePhase:false,yaw:0,pitch:0,prone:0,crouch:0,crouchMove:0,speed:0,sprint:0,grounded:true,ready:0,landDip:0,vault:null,lean:0,balance:null});c.pos.set(0,.025,0);c.vel.set(0,0,0);
 const visualScene=new T.Scene();visualScene.add(s.char.root);s.char.root.visible=true;visualScene.add(new T.HemisphereLight(0xdde8ff,0x505446,2));const light=new T.DirectionalLight(0xffeed4,2);light.position.set(2,6,-3);visualScene.add(light);
 visualScene.background=new T.Color(0x667680);const grid=new T.GridHelper(100,300);visualScene.add(grid);g.renderer.shadowMap.enabled=false;g.renderer.autoClear=true;g.renderer.setRenderTarget(null);g.renderer.setSize(600,450);g.camera.fov=38;g.camera.aspect=600/450;g.camera.updateProjectionMatrix();
 document.body.querySelectorAll('body > :not(canvas)').forEach(e=>{if(e.tagName!=='SCRIPT'&&!e.contains(g.renderer.domElement))e.style.display='none'});g.renderer.domElement.style.cssText='position:fixed;inset:0;width:600px;height:450px;z-index:999999';
 window.drawNPC=(i)=>{const t=i/30,dt=1/30;let speed=t<1?2.6*t:t<3?2.6:t<4?Math.max(0,2.6-(t-3)*3):t<5?0:Math.min(4.55,(t-5)*4);
 c.speed=speed;c.sprint=Math.max(0,(speed-2.8)/1.75);
 GAnimator.turnController(c,t<2?0:t<4?1.8:t<5?3.5:3.5,dt,false);
 c.vel.set(-Math.sin(c.yaw)*speed,0,-Math.cos(c.yaw)*speed);c.pos.addScaledVector(c.vel,dt);
 GPhysics.get(w).begin(dt);GAnimator.pose(s,dt,false,t);s.rig.relaxArms(Math.sin(s.motion.phase*Math.PI*2)*Math.min(1.5,speed/2.5),Math.sin(t)*.02,GAnimator.runK(c));s.char.root.updateMatrixWorld(true);
 g.camera.position.copy(c.pos).add(new T.Vector3(2.8,1.5,-3.9));g.camera.lookAt(c.pos.clone().add(new T.Vector3(0,.87,0)));visualScene.updateMatrixWorld(true);g.renderer.setRenderTarget(null);g.renderer.clear();g.renderer.render(visualScene,g.camera);
 };
});
await p.setViewportSize({width:600,height:450});fs.mkdirSync('/data/npc-v7-frames',{recursive:true});
for(let i=0;i<225;i++){await p.evaluate(i=>drawNPC(i),i);if(i%3===0)await p.screenshot({path:'/data/npc-v7-frames/'+String(i/3).padStart(3,'0')+'.png',timeout:120000});}
console.log(JSON.stringify({frames:75,errors}));assert.equal(errors.length,0);
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
