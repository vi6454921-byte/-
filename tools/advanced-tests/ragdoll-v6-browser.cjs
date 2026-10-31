const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/local/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});try{
 const p=await b.newPage({viewport:{width:1000,height:700}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>localStorage.setItem('aegis.settings',JSON.stringify({quality:'low',volume:0,calloutSpeech:false})));
 await p.route('**/js/polygon/29_game.js',async route=>{const r=await route.fetch();let s=await r.text();s=s.replace('function renderFrame(dt) {','function renderFrame(dt) { return;').replace('const go = () => { warm(); startGame(); };','const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();');await route.fulfill({response:r,body:s});});
 await p.goto((process.env.BASE_URL||'http://127.0.0.1:8774/')+'index.html?map='+(process.env.MAP||'angar_map'));await p.waitForFunction(()=>window.__GAME,null,{timeout:180000});console.log('ready');
 const result=await p.evaluate(()=>{
  const g=__GAME,T=THREE,s=g.squad[0],c=s.ctrl;g.state.paused=true;g.state.noRender=true;g.state.activeIdx=-1;g.step(1);
  if(g._C.combat)for(const k of ['update','drive','fire'])g._C.combat[k]=()=>{};
  if(g._C.tactics)for(const k of ['think','drive'])g._C.tactics[k]=()=>{};
  if(g._C.teams)g._C.teams.update=()=>{};
  for(const x of g.squad)if(x!==s){x.dead=true;x.finished=true;}
  let at=null;const w=g.world,B=w.bounds,physics=GPhysics.get(w);
  outer:for(let x=B.x0+5;x<B.x1-5;x+=2)for(let z=B.z0+5;z<B.z1-5;z+=2){
    const support=physics.support(x,z,w.heightAt(x,z)+2.2,4);if(!support||support.normal.y<.9)continue;const y=support.y;if(!physics.canOccupy(s,{x,y:y+.025,z},1.8))continue;
    if([[0,0],[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]].some(([dx,dz])=>{const h=physics.support(x+dx,z+dz,y+.45,1);return !h||Math.abs(h.y-y)>.04||!physics.canOccupy(s,{x:x+dx,y:y+.025,z:z+dz},1.8)}))continue;
    at=new T.Vector3(x,y+.025,z);break outer;
  }
  if(!at)throw Error('No clear test floor');
  AEGIS_GAME.setLoadout(s.key,{slots:[{t:'gun',id:'ar15m4'},null,{t:'ammo',w:'primary'},null,null,null],cfg:{}});g.equipStand(0,0);
  const damage=s.dmg,physiology=s.dmg.ph;damage._qaRetain=37;
  const reset=()=>{GStumble.reset(s);physics.dropRagdoll(s);s.rd=null;s.motion=null;s.dead=false;s.finished=false;c._balanceBusy=false;c.pos.copy(at);c.vel.set(0,0,0);c._motorVX=c._motorVZ=0;c.crouchWant=false;c.proneWant=false;c.aiWish=null;c.aiSprint=false;c.grounded=true;s.spawn.yaw=0;s.idleYaw=0;g.poseStand(0,{ready:1});};
  const rows=[];
  for(const dt of [1/60,1/30,1/20]){
   reset();g.embody(0);GStumble.trigger(s,new T.Vector3(1,0,0),.5,{force:true});g.step(Math.ceil(4/dt),dt);
   rows.push({name:'catch',dt,cameraFinite:[...g.camera.position.toArray(),...g.camera.quaternion.toArray()].every(Number.isFinite),state:s._balance.state,dead:s.dead,healthRetained:s.dmg===damage&&s.dmg.ph===physiology&&s.dmg._qaRetain===37});g.disembody();
   reset();g.embody(0);GStumble.trigger(s,new T.Vector3(.2,0,-1),1.4,{force:true});
   const states=new Set();let maxBodies=0,finite=true,fireBlocked=false,headShown=false,gunDynamic=false,maxGap=0;
   for(let i=0;i<Math.ceil(10/dt);i++){
    g.step(1,dt);const q=s._balance;states.add(q.state);
    s.char.root.traverse(o=>{if(o.isBone)finite&&=[...o.position.toArray(),...o.quaternion.toArray()].every(Number.isFinite)});
    const r=physics.ragdolls.get(s);if(r){maxBodies=Math.max(maxBodies,r.bodies.length);gunDynamic||=r.groups.some(g=>g.name==='gun');
      fireBlocked||=!c.canFire()&&!c.startReload();
      headShown||=Object.entries(s.char.meshes).some(([n,o])=>/head|helmet/.test(n)&&o.visible);
      for(const j of r.joints){const a=j.body1(),b=j.body2(),wa=new T.Vector3().copy(j.anchor1()).applyQuaternion(new T.Quaternion().copy(a.rotation())).add(new T.Vector3().copy(a.translation())),wb=new T.Vector3().copy(j.anchor2()).applyQuaternion(new T.Quaternion().copy(b.rotation())).add(new T.Vector3().copy(b.translation()));maxGap=Math.max(maxGap,wa.distanceTo(wb));}
    }
    if(i>5&&q.state==='stable')break;
   }
   rows.push({name:'fall-recover',dt,states:[...states],maxBodies,finite,fireBlocked,headShown,gunDynamic,maxGap,dead:s.dead,recovered:s._balance.state==='stable',rdCleared:!s.rd,healthRetained:s.dmg===damage&&s.dmg.ph===physiology&&s.dmg._qaRetain===37,events:s._balance.events});g.disembody();
  }
  // A real KCC obstacle contact, not an explicit trigger call.
  reset();const barrier={type:'box',x0:at.x-1.4,x1:at.x+1.4,z0:at.z-1.55,z1:at.z-1.35,y0:at.y-.025,_top:at.y+.45};w.colliders.push(barrier);physics.syncStatics();
  c.sprint=1;c.speed=4.55;c.vel.set(0,0,-4.55);c._motorVX=0;c._motorVZ=-4.55;
  for(let i=0;i<140;i++){c.aiWish=new T.Vector2(0,-1);c.aiSprint=true;c.yaw=0;s.idleYaw=0;g.step(1,1/60);}
  rows.push({name:'contact-trip',triggered:!!s._balance,events:s._balance?.events||[],finite:c.pos.toArray().every(Number.isFinite)});barrier.source={dead:true};physics.syncStatics();
  for(const index of [...new Set([0,1,Math.floor(g.squad.length/2),Math.floor(g.squad.length/2)+1])]){
   const q=g.squad[index];for(const x of g.squad)if(x!==q){x.dead=true;x.finished=true;physics.removeActor(x.ctrl);}
   GStumble.reset(q);physics.dropRagdoll(q);q.rd=null;q.motion=null;q.dead=false;q.finished=false;
   Object.assign(q.ctrl,{crouchWant:false,proneWant:false,legDown:false,aiWish:null,aiSprint:false,grounded:true});q.ctrl.pos.copy(at);q.ctrl.vel.set(0,0,0);q.ctrl._motorVX=q.ctrl._motorVZ=0;q.spawn.yaw=0;q.idleYaw=0;g.poseStand(index,{ready:1});
   const health=q.dmg,ph=q.dmg.ph;GStumble.trigger(q,new T.Vector3(index%2?1:-1,0,-.5),1.4,{force:true});
   let finite=true,count=0;for(let i=0;i<720;i++){g.step(1,1/60);if(q.rd)count=Math.max(count,physics.ragdolls.get(q)?.groups.length||0);q.char.root.traverse(o=>{if(o.isBone)finite&&=o.quaternion.toArray().every(Number.isFinite)});if(i>5&&q._balance.state==='stable')break;}
   rows.push({name:'character-preset',index,preset:q.char.preset.id,faction:q.char.preset.faction,recovered:q._balance.state==='stable',finite,healthRetained:q.dmg===health&&q.dmg.ph===ph,segments:count});
  }
  for(const x of g.squad){x.dead=x!==s;x.finished=x!==s;physics.removeActor(x.ctrl);}g.state.activeIdx=-1;
  return {rows,at:at.toArray(),stats:GStumble.stats(),model:s.char.preset.id};
 });
 fs.writeFileSync(__dirname+'/ragdoll-v6-browser.json',JSON.stringify({result,errors},null,2));console.log(JSON.stringify({result,errors}));
 assert.equal(errors.length,0);
 for(const r of result.rows){if(r.name==='catch'){assert.equal(r.state,'stable');assert(r.healthRetained&&!r.dead&&r.cameraFinite)}else if(r.name==='fall-recover'){assert(r.recovered&&r.rdCleared&&r.finite&&r.healthRetained&&!r.dead);assert(r.maxBodies===16&&r.fireBlocked&&r.gunDynamic);assert(r.maxGap<.12);}else if(r.name==='contact-trip')assert(r.events.some(e=>/trip-obstacle/.test(e.name)));else if(r.name==='character-preset')assert(r.finite&&r.recovered&&r.healthRetained&&r.segments>=15);}
 // Isolated rendered falling frame for visual inspection.
 await p.evaluate(at=>{const g=__GAME,T=THREE,s=g.squad[0],c=s.ctrl;GStumble.reset(s);GPhysics.get(g.world).dropRagdoll(s);s.rd=null;s.dead=false;s.motion=null;c.aiWish=null;c.aiSprint=false;c.pos.fromArray(at);c.vel.set(0,0,-3.2);c.speed=3.2;c.grounded=true;s.spawn.yaw=0;s.idleYaw=0;g.poseStand(0,{ready:1});c.speed=3.2;c.vel.set(0,0,-3.2);GStumble.trigger(s,new T.Vector3(.4,0,-1),1.4,{force:true});g.step(32,1/60);
 for(const o of g.scene.children)o.visible=o.isLight||o===s.char.root||o===s.gun.root;s.char.root.visible=true;s.gun.root.visible=true;g.scene.fog=null;g.scene.background=new T.Color(0x667680);const grid=new T.GridHelper(10,30);grid.position.fromArray(at);g.scene.add(grid);const f=s.char.bone('hips').getWorldPosition(new T.Vector3());g.camera.position.copy(f).add(new T.Vector3(2.2,1.4,-3.4));g.camera.lookAt(f.clone().add(new T.Vector3(0,.25,0)));g.camera.fov=42;g.camera.updateProjectionMatrix();g.renderer.shadowMap.enabled=false;g.renderer.setSize(1000,700);g.renderer.render(g.scene,g.camera);document.body.querySelectorAll('body > :not(canvas)').forEach(e=>{if(e.tagName!=='SCRIPT'&&!e.contains(g.renderer.domElement))e.style.display='none'});g.renderer.domElement.style.cssText='position:fixed;inset:0;width:1000px;height:700px;z-index:999999';},result.at);
 await p.screenshot({path:__dirname+'/ragdoll-v6-fall.png',timeout:120000});
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
