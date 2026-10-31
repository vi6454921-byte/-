const{chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/local/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});try{const p=await b.newPage({viewport:{width:900,height:650}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,1400))});await p.route('**/favicon.ico',r=>r.fulfill({status:204}));await p.addInitScript(()=>localStorage.setItem('aegis.settings',JSON.stringify({quality:'low',volume:0,calloutSpeech:false})));await p.route('**/js/polygon/29_game.js',async route=>{const r=await route.fetch();let s=await r.text();s=s.replace('function renderFrame(dt) {','function renderFrame(dt) { return;').replace('const go = () => { warm(); startGame(); };','const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();').replace('window.__GAME._C = C;','window.__GAME.weaponQA={reachFix,gunClear,gunObst,npcHands,tpFrame,lgOf,triggerCurlFor};window.__GAME._C = C;');await route.fulfill({response:r,body:s});});await p.goto((process.env.BASE_URL||'http://127.0.0.1:8774/')+'index.html?map=angar_map');await p.waitForFunction(()=>window.__GAME,null,{timeout:180000});console.log('ready');
await p.evaluate(()=>{const g=__GAME,T=THREE,s=g.squad[0],w={bounds:{x0:-100,x1:100,z0:-100,z1:100},heightAt:()=>0,colliders:[],blocked:()=>false};const c=GPlayer.create(T,{world:w,trait:s.ctrl.trait});s.ctrl=c;g.state.noRender=true;g.state.paused=true;window.WQA={g,T,s,c,w,physics:GPhysics.get(w),originalMove:c.updateMove};window.qaPrepare=(id,state,dt)=>{GContacts.drop(WQA.physics,s);WQA.physics.dropPose(s);AEGIS_GAME.setLoadout(s.key,{slots:[{t:'gun',id},null,{t:'ammo',w:'primary'},null,null,null],cfg:{}});g.equipStand(0,0);c._physicsWorld=w;c._distancePhase=false;c.pos.set(0,.025,0);c.vel.set(0,0,0);Object.assign(c,{yaw:0,pitch:0,lagYaw:0,lagPitch:0,speed:0,sprint:0,prone:0,crouch:state==='crouch-fire'?1:0,crouchMove:0,grounded:true,ready:state==='carry'?0:1,aiReady:state==='carry'?0:1,ads:state==='ads-fire'?1:0,reload:-1,inspect:-1,balance:null,_balanceBusy:false,landDip:0,lean:0,mag:Math.min(20,c.magCap-1),chamber:1,reserve:120,jam:null,hardcore:false,boltOpen:false,pump:-1,triggerHeld:false,cool:0});c.onFire=null;c.onEvent=null;c.updateMove=()=>{};s.motion=null;s.idleYaw=0;c._facingTarget=0;c._facingVelocity=0;s._tacHands=null;s._aidLow=false;s.hr=null;s._handContactOffset=null;s._reach=null;s._gc=null;s._lgK=undefined;s._tpr=null;s.rig._eD=null;s.rig._elbowPole=null;WQA.t=0;s.rig.poseDt=dt;s.rig._triggerHand=null;WQA.state=state;WQA.dt=dt;WQA.id=id;WQA.prev=null;WQA.rows=[];WQA.started=false;WQA.shots=c.shots;if(c.vr){c.vr.out&&Object.keys(c.vr.out).forEach(k=>{if(typeof c.vr.out[k]==='number')c.vr.out[k]=0;});}};
window.qaStep=()=>{const{g,T,s,c,physics,dt,state}=WQA;const t=WQA.t+=dt;g.state.time=t;const fire=state.includes('fire'),reload=state.includes('reload');const speed=state==='run'?4.55:state==='walk-fire'||state==='walk-reload'?2:0;c.speed=speed;c.sprint=state==='run'?1:0;c.vel.set(0,0,-speed);c.pos.addScaledVector(c.vel,dt);c.bobPhase=(s.motion?.phase||0)*Math.PI*2;c.triggerHeld=fire&&t>.5&&t<2.5;c.ready=c.aiReady=state==='carry'?0:1;c.adsWant=state==='ads-fire';c.ads=c.adsWant?1:0;
 if(reload&&!WQA.started&&t>.5){c.mag=state==='reload-empty'||state==='walk-reload'?0:Math.min(3,c.magCap-1);c.chamber=state==='reload-empty'||state==='walk-reload'?0:1;c.boltOpen=!c.chamber&&!!c.boltHold;WQA.started=c.startReload();WQA.duration=c.reloadPlan?.dur;}
 if(c.triggerHeld&&c.canFire())c.fire(t);c.update(dt,{},false,t);physics.begin(dt);const pose=g._F.poseSoldier(s,dt,false,t);s.char.root.updateMatrixWorld(true);GContacts.update(s,dt,true);g._F.placeWeapon(s,dt,false,g.camera.position,g.camera.quaternion,pose);g.weaponQA.reachFix(s,dt);g.weaponQA.gunClear(s,dt);g.weaponQA.npcHands(s);s.rig.poseDt=dt;s.rig.triggerCurl=g.weaponQA.triggerCurlFor(s);s.rig.adsAmount=c.ads;s.rig.readyAmount=GUtil.smoothstep(c.ready);s.rig.solveArms(s.gun.gun);s.char.root.updateMatrixWorld(true);s.gun.root.updateMatrixWorld(true);
 const row={t,reload:c.reload,phase:s.motion?.phase,triggerCurl:s.rig.triggerCurl,triggerIndex:s.rig._triggerHand?.index?.[2],shellVisible:!!s.gun._tpShell?.visible,magState:s._tpr?.mag,event:s._tpr?.ev,errors:{},pen:{},handPen:{},wristAngle:{},elbowOmega:{},contactError:0,pumpGripError:s.wspec.fam==='pump'&&c.reload<0?Math.abs((g.weaponQA.lgOf(s).elements[14]-s.wspec.leftGrip0.elements[14])-(s.gun.rest.forend-s.gun.nodes.forend.position.x)*.001):0,mech:{carrier:s.gun.nodes.carrier?.position.x,forend:s.gun.nodes.forend?.position.x,handle:s.gun.nodes.handle?.position.x},finite:true};
 const prev=WQA.prev||{};
 for(const side of ['R','L']){const wrist=s.char.bone('wrist'+side),elbow=s.char.bone('elbow'+side),P=new T.Vector3().setFromMatrixPosition(s.rig.handTargets[side]),A=wrist.getWorldPosition(new T.Vector3()),Q=wrist.quaternion.clone();row.errors[side]=A.distanceTo(P);row.pen[side]=s.rig.armDebug?.[side]?.pen||0;row.handPen[side]=s.rig.armDebug?.[side]?.handPen||0;row.wristAngle[side]=Math.acos(Math.max(-1,Math.min(1,new T.Vector3(1,0,0).applyQuaternion(Q).x)));const eq=elbow.getWorldQuaternion(new T.Quaternion());row.elbowOmega[side]=prev[side]?eq.angleTo(prev[side].eq)/dt:0;prev[side]={eq};row.finite&&=[...A.toArray(),...Q.toArray()].every(Number.isFinite);}
 const tr=c.reloadPlan?.track;if(tr&&c.reload>=0){const phase=c.reload*c.reloadPlan.speed,keys=tr.left;let i=0;while(i<keys.length-2&&phase>keys[i+1].t)i++;const a=keys[i],b=keys[Math.min(i+1,keys.length-1)];row.keyA=a.at;row.keyB=b.at;row.trackT=phase;
 if(a.at===b.at&&['grip','gun'].includes(a.at)){const am=new T.Matrix4(),bm=new T.Matrix4(),ap=new T.Vector3(),bp=new T.Vector3();g.weaponQA.tpFrame(s,a,am);g.weaponQA.tpFrame(s,b,bm);ap.setFromMatrixPosition(am);bp.setFromMatrixPosition(bm);const u=b.t>a.t?Math.max(0,Math.min(1,(phase-a.t)/(b.t-a.t))):1;ap.lerp(bp,GUtil.smoothstep(u));row.contactError=s.char.bone('wristL').getWorldPosition(new T.Vector3()).distanceTo(ap);}}
 WQA.prev=prev;WQA.rows.push(row);return row;};});

await p.evaluate(()=>{
window.specialPrepare=(mode,dt=1/60,armed=false)=>{qaPrepare(armed?'ar15m4':'glock21','carry',dt);const{s,c,physics}=WQA;GContacts.drop(physics,s);physics.dropPose(s);WQA.specialMode=mode;WQA.specialArmed=armed;WQA.specialTime=0;WQA._realGun=s.gun;if(!armed)s.gun=null;s.char.root.visible=true;c._facingTarget=0;c._facingVelocity=0;s.idleYaw=0;c.armed=armed;c.crouch=c.crouchMove=c.prone=0;s.rig.handTargets=null;s.motion=null;WQA.prevPose=null;};
window.specialStep=()=>{const{g,T,s,c,physics,dt,specialMode:mode}=WQA;const t=WQA.specialTime+=dt;g.state.time=t;
 let speed=mode==='walk'?1.35:mode==='jog'?2.7:mode==='run'?4.55:mode==='sneak'?.45:mode==='crouch'?.9:mode==='crawl'?.5:mode==='stop-run'?Math.max(0,4.1-Math.max(0,t-1.3)*6):mode==='stop-walk'?Math.max(0,1.8-Math.max(0,t-1.3)*4):0;
 c.speed=speed;c.sprint=speed>3.8?1:0;c.crouch=c.crouchMove=mode==='crouch'?1:0;c.prone=mode==='crawl'?1:0;c.grounded=true;c.ready=c.aiReady=WQA.specialArmed?1:0;c.ads=0;c.reload=-1;c.triggerHeld=false;
 let target=0;if(mode.startsWith('turn')&&t>1.15)target=(mode.includes('180')?Math.PI:Math.PI/2)*(mode.endsWith('R')?-1:1);s.idleYaw=target;GAnimator.turnController(c,target,dt,true);
 c.vel.set(-Math.sin(c.yaw)*speed,0,-Math.cos(c.yaw)*speed);c.pos.addScaledVector(c.vel,dt);c.bobPhase=(s.motion?.phase||0)*Math.PI*2;physics.begin(dt);s.rig.poseDt=dt;
 const pose=g._F.poseSoldier(s,dt,false,t);s.char.root.updateMatrixWorld(true);
 if(WQA.specialArmed){g._F.placeWeapon(s,dt,false,g.camera.position,g.camera.quaternion,pose);g.weaponQA.reachFix(s,dt);g.weaponQA.gunClear(s,dt);g.weaponQA.npcHands(s);}
 else{s.rig.handTargets=null;s.rig.relaxArms(Math.sin(s.motion.phase*Math.PI*2)*Math.min(1.5,speed/2.5),0,s.motion.run,s.motion);}
 const crawlHands=GActionMotion.hands(s);if(WQA.specialArmed||crawlHands){s.rig.readyAmount=GUtil.smoothstep(c.ready);s.rig.adsAmount=0;s.rig.triggerCurl=.08;s.rig.solveArms(s.gun?.gun||null);}
 s.char.root.updateMatrixWorld(true);if(s.gun)s.gun.root.updateMatrixWorld(true);
 const row={t,mode,speed,yaw:c.yaw,action:s.motion.special?.action,weights:s.motion.gaitWeights.slice(),phase:s.motion.phase,feet:{},hands:{},knees:{},finite:true};
 s.char.root.traverse(o=>{if(o.isBone)row.finite&&=[...o.position.toArray(),...o.quaternion.toArray()].every(Number.isFinite)});
 for(const side of ['R','L']){const a=s.char.bone('ankle'+side).getWorldPosition(new T.Vector3()),f=s.motion.debug.feet[side],h=s.char.bone('wrist'+side).getWorldPosition(new T.Vector3());row.feet[side]={p:a.toArray(),target:f.target,plant:f.plant,error:a.distanceTo(new T.Vector3().fromArray(f.target))};row.knees[side]=s.char.bone('knee'+side).getWorldPosition(new T.Vector3()).y;row.hands[side]={p:h.toArray(),error:s.rig.handTargets?h.distanceTo(new T.Vector3().setFromMatrixPosition(s.rig.handTargets[side])):0};}return row;};
});
await p.evaluate(()=>{
 const{g,T,s,c}=WQA;g.state.activeIdx=-1;g.state.noRender=true;g.state.paused=true;
 g.scene.fog=null;g.scene.background=new T.Color(0x667780);
 const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshLambertMaterial({color:0x687980}));floor.rotation.x=-Math.PI/2;floor.position.y=-.035;g.scene.add(floor);
 const grid=new T.GridHelper(200,200,0x43525b,0x88969d);g.scene.add(grid);grid.position.y=.005;
 const amb=new T.HemisphereLight(0xf6faff,0x505347,2.1);g.scene.add(amb);
 const key=new T.DirectionalLight(0xfff3df,2.8);key.position.set(3,7,-5);g.scene.add(key);
 g.renderer.shadowMap.enabled=false;g.renderer.setPixelRatio(1);g.renderer.setSize(640,360);
 const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;WQA.output=canvas;WQA.ctx=canvas.getContext('2d');const tile=document.createElement('canvas');tile.width=tile.height=128;const tc=tile.getContext('2d');tc.fillStyle='#687c86';tc.fillRect(0,0,128,128);tc.strokeStyle='#899aa2';tc.lineWidth=2;tc.strokeRect(0,0,128,128);const tex=new T.CanvasTexture(tile);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(200,200);tex.colorSpace=T.SRGBColorSpace;floor.material.dispose();floor.material=new T.MeshBasicMaterial({map:tex});g.scene.remove(grid);WQA.keep=[floor,amb,key];WQA.keep.forEach(o=>{o.matrixAutoUpdate=true;o.updateMatrix();o.updateMatrixWorld(true);});g.camera.matrixAutoUpdate=true;for(const o of [...g.scene.children])if(!WQA.keep.includes(o)&&o!==s.char.root&&o!==s.gun?.root)g.scene.remove(o);
 WQA.physicalStates=new Set();WQA.videoRows=[];
 window.videoPose=(dt,t)=>{const{g,s,c}=WQA;const pose=g._F.poseSoldier(s,dt,false,t);s.char.root.updateMatrixWorld(true);s.rig.poseDt=dt;
 if(s.gun&&!c.vault){g._F.placeWeapon(s,dt,false,g.camera.position,g.camera.quaternion,pose);g.weaponQA.reachFix(s,dt);g.weaponQA.gunClear(s,dt);g.weaponQA.npcHands(s);s.rig.triggerCurl=g.weaponQA.triggerCurlFor(s);s.rig.readyAmount=GUtil.smoothstep(c.ready);s.rig.adsAmount=c.ads;GActionMotion.hands(s);s.rig.solveArms(s.gun.gun);}
 else{s.rig.handTargets=null;s.rig.relaxArms(Math.sin((s.motion?.phase||0)*Math.PI*2)*Math.min(1.5,c.speed/2.5),0,s.motion?.run||0,s.motion);GAnimator.solveTraversalHands(s);GStumble.arms(s);if(GActionMotion.hands(s))s.rig.solveArms(null);}
 if(s._balance?.recovering)GStumble.recoveryPose(s);
 s.char.root.updateMatrixWorld(true);if(s.gun)s.gun.root.updateMatrixWorld(true);
 };
 window.videoPrepare=(ch)=>{
 const{g,s,c,physics,w}=WQA;if(WQA._realGun)s.gun=WQA._realGun;
 if(s.rd||s.dead){g._F.DMG.revive(s);physics.dropRagdoll(s);}GStumble.reset(s);s.rd=null;s.dead=false;s.finished=false;s._posed=false;
 if(WQA.barrier){WQA.barrier.source={dead:true};physics.syncStatics();WQA.barrier=null;}if(WQA.barrierMesh){g.scene.remove(WQA.barrierMesh);WQA.barrierMesh.geometry.dispose();WQA.barrierMesh.material.dispose();WQA.barrierMesh=null;}
 specialPrepare(ch.mode||'walk',1/60,!!ch.armed);if(ch.gun){if(WQA._realGun)s.gun=WQA._realGun;qaPrepare(ch.gun,ch.state||'carry',1/60);WQA._realGun=s.gun;}
 WQA.chapter=ch;WQA.t=0;WQA.specialTime=0;WQA.totalTicks=0;WQA.physicalStates.clear();WQA.eventStarted=false;WQA.maxBodies=0;WQA.maxHeight=.025;
 Object.assign(c,{vault:null,_traversalHeight:undefined,_jp:0,_pt:0,proneWant:false,crouchWant:false,legDown:false,injLeg:0,injArm:0,aiWish:null,aiADS:false,aiSprint:false,_air:false,stamina:10,_balanceBusy:false,balance:null,mounted:null,treating:false,dragging:false,_motorVX:0,_motorVZ:0});
 s._balance=null;s.spawn.yaw=0;s.idleYaw=0;c._facingTarget=0;c._facingVelocity=0;
 WQA.weaponMode=ch.kind==='weapon';WQA.state=ch.state||'carry';WQA.started=false;WQA.dt=1/60;
 if(ch.kind==='motor'||ch.kind==='vault'){c.updateMove=WQA.originalMove;c.armed=!!ch.armed;}
 if(ch.kind==='vault'){
  const box={type:'box',x0:-1.2,x1:1.2,z0:-1.08,z1:-.68,y0:0,_top:.72};w.colliders.push(box);physics.syncStatics();WQA.barrier=box;
  const mesh=new T.Mesh(new T.BoxGeometry(2.4,.72,.4),new T.MeshLambertMaterial({color:0x9d9b84}));mesh.matrixAutoUpdate=true;mesh.position.set(0,.36,-.88);mesh.updateMatrix();mesh.updateMatrixWorld(true);g.scene.add(mesh);WQA.barrierMesh=mesh;
 }
 if(ch.kind==='physical'){GStumble.update(s,0,g._F.DMG);}
 // Warm only cyclic motion / armed grips; action chapters start from rest.
 if(ch.kind==='special'&&!/turn|stop/.test(ch.mode))for(let i=0;i<75;i++)specialStep();
 if(ch.kind==='weapon'&&!ch.state.includes('reload'))for(let i=0;i<24;i++)qaStep();
 WQA.t=0;WQA.specialTime=0;
 };
 window.videoTick=()=>{
 const{g,T,s,c,physics,chapter:ch}=WQA,dt=1/60;WQA.totalTicks++;
 if(ch.kind==='special'){specialStep();return;}
 if(ch.kind==='weapon'){qaStep();return;}
 const t=WQA.t+=dt;g.state.time=t;physics.begin(dt);
 if(ch.kind==='motor'||ch.kind==='vault'){
  const input={};if(ch.mode==='sneak'){input.fwd=true;input.sneak=true;}if(ch.mode==='jump'){input.fwd=t<1.7;input.jump=t>.5?1:0;}
  if(ch.mode==='stance'){input.crouch=t>.4&&t<1.9;input.proneTog=t>4.5?2:t>2.3?1:0;}
  if(ch.kind==='vault'){input.fwd=t>.4&&t<2.5;input.jump=t>.4?1:0;}
  c.ready=c.aiReady=ch.armed?1:0;c.update(dt,input,true,t);WQA.maxHeight=Math.max(WQA.maxHeight,c.pos.y);if(c.vault)WQA.eventStarted=true;
  videoPose(dt,t);return;
 }
 if(ch.kind==='physical'){
  if(t>.5&&!WQA.eventStarted){WQA.eventStarted=true;if(ch.mode==='casualty'){g._F.DMG._standCollapse(s);s.deathFatal=true;}else GStumble.trigger(s,new T.Vector3(.45,0,-1),ch.mode==='catch'?.6:1.4,{force:true,reason:'video-demo'});}
  GStumble.update(s,dt,g._F.DMG);WQA.physicalStates.add(s._balance?.state||'stable');
  if(s.dead||s._balance?.down){g._F.DMG.ragdoll(s,dt);WQA.maxBodies=Math.max(WQA.maxBodies,physics.ragdolls.get(s)?.bodies.length||0);}
  else{if(!s._balance?.recovering){c.speed=0;c.vel.set(0,0,0);}videoPose(dt,t);}return;
 }
 c.speed=ch.mode==='back'?1:ch.mode==='strafe'?1.3:0;c.vel.set(ch.mode==='strafe'?1.3:0,0,ch.mode==='back'?1:0);c.pos.addScaledVector(c.vel,dt);c.moveDir.set(ch.mode==='strafe'?1:0,ch.mode==='back'?1:0);c.ready=ch.armed?1:0;
 c.lean=ch.mode==='lean'?Math.sin(t*1.8)*.85:0;if(ch.mode==='inspect'&&t>.4&&!WQA.eventStarted){c.startInspect();WQA.eventStarted=true;}
 c.update(dt,{},false,t);videoPose(dt,t);
 };
 window.videoFrame=(ticks,frame)=>{
 const{g,T,s,c,chapter:ch}=WQA;for(let i=0;i<ticks;i++)videoTick();
 const physical=ch.kind==='physical'&&(s.dead||s._balance?.down),low=ch.mode==='crawl';
 const focus=physical?s.char.bone('hips').getWorldPosition(new T.Vector3()):c.pos.clone().add(new T.Vector3(0,low?.38:.88,low?.4:0));
 const offset=low?new T.Vector3(3.2,1.5,-2.9):new T.Vector3(2.8,1.35,-4.6);
 if(ch.kind==='vault'){focus.y=.65;offset.set(3.2,1.65,-4.8);}
 if(ch.mode==='turn180R'||ch.mode==='turn90R')offset.x=-2.8;
 g.camera.position.copy(focus).add(offset);g.camera.lookAt(focus);g.camera.fov=ch.kind==='vault'?41:35;g.camera.aspect=960/540;g.camera.updateProjectionMatrix();
 for(const o of g.scene.children)o.visible=WQA.keep.includes(o)||o===s.char.root||(s.gun&&o===s.gun.root)||o===WQA.barrierMesh;
 s.char.root.visible=true;if(s.gun)s.gun.root.visible=true;
 g.renderer.setRenderTarget(null);g.renderer.autoClear=true;g.renderer.setScissorTest(false);g.scene.updateMatrixWorld(true);g.renderer.render(g.scene,g.camera);
 const ctx=WQA.ctx;ctx.drawImage(g.renderer.domElement,0,0,960,540);
 ctx.fillStyle='rgba(20,28,34,.96)';ctx.fillRect(0,0,960,68);ctx.fillRect(0,465,960,75);
 ctx.fillStyle='#74b6e5';ctx.font='bold 14px Arial';ctx.fillText('AEGIS   /   ANIMATION LAB   /   v11',28,25);
 ctx.fillStyle='#ffffff';ctx.font='bold 23px Arial';ctx.fillText(ch.title,28,53);
 ctx.fillStyle='#ecf0f2';ctx.font='17px Arial';ctx.fillText(ch.note,28,493);
 ctx.fillStyle='#aebdc7';ctx.font='14px Arial';ctx.fillText(ch.source,28,519);
 ctx.textAlign='right';ctx.fillStyle='#aebdc7';ctx.fillText(String(ch.index).padStart(2,'0')+' / '+WQA.chapterCount,932,25);ctx.textAlign='left';
 const progress=Math.min(1,frame/(ch.duration*24));ctx.fillStyle='#74b6e5';ctx.fillRect(0,537,960*progress,3);
 let finite=true;s.char.root.traverse(o=>{if(o.isBone)finite&&=o.quaternion.toArray().every(Number.isFinite)});if(!finite)throw Error('Nonfinite video pose '+ch.title);
 return WQA.output.toDataURL('image/jpeg',.90).split(',')[1];
 };
});
const chapters=[];
const add=(kind,mode,title,note,source,duration=4,armed=false,extra={})=>chapters.push({kind,mode,title,note,source,duration,armed,...extra});
const mocap='CMU mocap → траектории, ретаргетинг и IK • реальный рендер игры';
const procedural='Процедурная анимация / игровой контроллер • реальный рендер игры';
for(const [mode,title]of [['walk','Ходьба'],['jog','Лёгкий бег'],['run','Бег']])add('special',mode,title,'Перенос веса, опорная стопа, движение таза и корпуса',mocap,3.5);
add('special','walk','Ходьба с оружием','Согласованное движение оружия и обеих кистей',mocap,3.5,true);
add('weapon','run','Бег с автоматом','Низкое удержание, инерция корпуса, контакт кистей',mocap,4,true,{gun:'ar15m4',state:'run'});
for(const [mode,title]of [['turn90L','Разворот на 90° влево'],['turn90R','Разворот на 90° вправо'],['turn180L','Разворот на 180° влево'],['turn180R','Разворот на 180° вправо']])add('special',mode,title,'Автоматическое распознавание разворота и переступание',mocap,3.5,true);
for(const [mode,title]of [['stop-walk','Остановка после ходьбы'],['stop-run','Резкая остановка после бега']])add('special',mode,title,'Торможение, постановка стоп, возврат в устойчивую позу',mocap,3.5,true);
add('motor','sneak','Скрытное перемещение','Низкая скорость, осторожный перенос веса',mocap,4);
add('special','crouch','Перемещение в полуприседе','Низкий центр тяжести и отдельный цикл шага',mocap,4,true);
add('special','crawl','Ползание лёжа — без оружия','Низкая поза, асимметричные движения рук и ног','CMU crawl на четвереньках → адаптация к ползанию лёжа; не готовый военный клип',4.5);
add('special','crawl','Ползание лёжа — с оружием','Правая кисть удерживает оружие, левая помогает перемещению','CMU crawl → низкое ползание + процедурный хват оружия',4.5,true);
add('motor','stance','Присед, положение лёжа и подъём','Переходы через контроллер персонажа, без смены позы телепортом',procedural,6.5,true);
add('extra','back','Движение назад','Раздельное направление взгляда и перемещения',mocap,3.5,true);
add('extra','strafe','Боковое перемещение','Стрейф с оружием и сохранением направления корпуса',mocap,3.5,true);
add('motor','jump','Прыжок и приземление','Реальная гравитация, контакт с землёй, амортизация',procedural,3.5);
add('vault','vault','Преодоление препятствия','Проверка коллизий Rapier, опоры рук и безопасная посадка',procedural,4);
add('extra','lean','Наклон с оружием','Контакт кистей сохраняется при наклоне корпуса',procedural,4,true);
add('extra','inspect','Осмотр оружия','Трек осмотра и работа кистей',procedural,3.5,true);
for(const [gun,state,title]of [['ar15m4','ads-fire','Стрельба с прицеливанием'],['ak74','walk-fire','Стрельба в движении'],['glock21','ads-fire','Стрельба из пистолета'],['m870','ads-fire','Дробовик: выстрел и работа цевья']])add('weapon','fire',title,'Отдача, палец на спуске, движение затвора / механики',procedural,3.5,true,{gun,state});
for(const [gun,title,state]of [['ar15m4','M4: тактическая перезарядка','reload-tactical'],['ar15m4','M4: пустая перезарядка','reload-empty'],['ak74','AK-74: пустая перезарядка','reload-empty'],['mp5a3','MP5: перезарядка и рукоять','reload-empty'],['glock21','Glock: магазин и затвор','reload-empty'],['m870','M870: зарядка патронами','reload-empty']])add('weapon','reload',title,'Кисть следует магазину, органам управления и точкам контакта',procedural,7,true,{gun,state});
add('physical','catch','Спотыкание и восстановление равновесия','Компенсация корпусом, защитное движение рук, шаг опоры',procedural,4.5);
add('physical','recover','Падение, физика тела и подъём','Не смертельное падение → стабилизация → подъём', 'Rapier ragdoll + процедурное восстановление • реальный рендер игры',9,true);
add('physical','casualty','Динамический рагдолл','Суставные ограничения, инерция конечностей, контакты с землёй','Rapier ragdoll • реальная физическая симуляция, не записанный mocap',5,true);
const output=process.env.OUTPUT||'/data/animation-v11-frames';fs.mkdirSync(output,{recursive:true});
await p.evaluate(n=>WQA.chapterCount=n,chapters.length);
const manifest={fps:24,width:960,height:540,renderWidth:640,renderHeight:360,chapters:[],errors};let globalFrame=0;
for(let ci=0;ci<chapters.length;ci++){
 const ch={...chapters[ci],index:ci+1};if(process.env.ONLY&&!process.env.ONLY.split(',').includes(ch.mode))continue;if(process.env.INDICES&&!process.env.INDICES.split(',').map(Number).includes(ch.index))continue;
 await p.evaluate(ch=>videoPrepare(ch),ch);
 const start=globalFrame,N=Math.round(ch.duration*24),dir=output+'/'+String(ci+1).padStart(2,'0');fs.mkdirSync(dir,{recursive:true});
 const frames=process.env.PREVIEW?[Math.min(N-1,Math.round(N*.43))]:Array.from({length:N},(_,i)=>i);
 let prevTick=0;
 for(const fi of frames){const tick=Math.round((fi+1)*60/24),ticks=tick-prevTick;prevTick=tick;const jpg=await p.evaluate(([ticks,fi])=>videoFrame(ticks,fi),[ticks,fi]);fs.writeFileSync(dir+'/'+String(fi).padStart(5,'0')+'.jpg',Buffer.from(jpg,'base64'));globalFrame++;}
 if(process.env.DIAG)console.log('scene',await p.evaluate(()=>({layers:WQA.g.camera.layers.mask,cam:WQA.g.camera.position.toArray(),objects:WQA.g.scene.children.map(o=>({type:o.type,name:o.name,visible:o.visible,layers:o.layers.mask,world:o.matrixWorld.elements.slice(12,15)})),info:WQA.g.renderer.info.render})));
 const state=await p.evaluate(()=>({events:WQA.s.motion?.special?.events,physicalStates:[...WQA.physicalStates],maxBodies:WQA.maxBodies,maxHeight:WQA.maxHeight,vaultStarted:WQA.eventStarted,speed:WQA.c.speed,sneak:WQA.c.sneak,crouch:WQA.c.crouch,prone:WQA.c.prone,shots:WQA.c.shots-WQA.shots,reload:WQA.c.reload,mag:WQA.c.mag,chamber:WQA.c.chamber}));
 manifest.chapters.push({...ch,folder:dir,start,frames:N,state});fs.writeFileSync(output+'/manifest.json',JSON.stringify(manifest,null,2));console.log(ci+1,ch.title,JSON.stringify(state));
}
if(errors.length)throw Error(JSON.stringify(errors));
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
