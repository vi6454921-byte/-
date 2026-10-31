const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const all=[];for(const map of (process.env.MAPS||'angar_map,forest_map_camp,stroyka_zarechye_v2').split(',')){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/local/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});try{const p=await browser.newPage({viewport:{width:900,height:650}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>localStorage.setItem('aegis.settings',JSON.stringify({quality:'low',volume:0,calloutSpeech:false})));
 await p.route('**/js/polygon/29_game.js',async route=>{const r=await route.fetch();let s=await r.text();s=s.replace('function renderFrame(dt) {','function renderFrame(dt) { return;').replace('const go = () => { warm(); startGame(); };','const go = () => { unhide(); S.noRender=true; S.paused=true; startGame(); }; renderer.compile=()=>{};renderer.compileAsync=()=>Promise.resolve();');await route.fulfill({response:r,body:s});});
 await p.goto((process.env.BASE_URL||'http://127.0.0.1:8774/')+'index.html?map='+map);await p.waitForFunction(()=>window.__GAME,null,{timeout:240000});console.log('ready '+map);
 const result=await p.evaluate(()=>{
  const g=__GAME,T=THREE,S=GImpactSurfaces,d=g.fx.bulletImpacts,w=g.world,native=w.native;g.state.paused=true;g.state.noRender=true;
  const counts={},materials={},untyped=new Set();for(const group of [w.props,w.ground])group.traverse(o=>{if(!o.isMesh)return;const k=S.surface(o.userData.ground?'ground':'concrete',o)||'none';counts[k]=(counts[k]||0)+1;for(const m of Array.isArray(o.material)?o.material:[o.material]){const key=m.name||'(unnamed)';materials[key]=m.userData.impactSurface||'fallback';if(!m.userData.impactSurface)untyped.add(key);}});
  const rows=[];let hit=null,panel=null,sheet=null,chunk=-1;
  function mark(owner,point,normal){owner.updateWorldMatrix(true,false);const before=d.count;g.fx.decal(point,normal,.05,null,'wood',owner,normal.clone().negate());if(d.count>before){hit={owner,point,normal};return true;}return false;}
  if(native.dest.sheets){outer:for(const a of native.dest.sheets){if(!a.mesh||a.deadN>=a.alive.length)continue;for(let k=0;k<a.alive.length;k++){if(!a.alive[k])continue;if(mark(a.mesh,a.chunkCenter[k].clone(),a.N.clone())){sheet=a;chunk=k;break outer;}}}}
  else {outer:for(const struct of native.dest.structs)for(const a of struct.panels||[]){if(a.dead||!a.ranges?.length||a.mode==='sag')continue;for(const r of a.ranges){const owner=r.mesh,pos=owner.geometry.getAttribute('position'),ix=owner.geometry.index;
    for(let j=r.start;j+2<r.start+r.count;j+=3){const ids=ix?[ix.getX(j),ix.getX(j+1),ix.getX(j+2)]:[j,j+1,j+2];if(ids.some(k=>k>=pos.count))continue;const A=new T.Vector3().fromBufferAttribute(pos,ids[0]),B=new T.Vector3().fromBufferAttribute(pos,ids[1]),C=new T.Vector3().fromBufferAttribute(pos,ids[2]),normal=B.clone().sub(A).cross(C.clone().sub(A));if(normal.length()<1e-7)continue;normal.normalize().transformDirection(owner.matrixWorld);const point=A.add(B).add(C).multiplyScalar(1/3).applyMatrix4(owner.matrixWorld);if(mark(owner,point,normal)){panel=a;break outer;}}
  }}}
  if(!hit)throw Error('No real destructible surface accepted a projected mark');
  const slot=d.ring[d.ring.length-1],before=d.count,sourceKind=S.surface('metal',hit.owner),tint=Array.from(d.aTint.array.slice(slot*768*4,slot*768*4+3));
  let destroyed=false;for(let i=0;i<240;i++){
   native.bulletHit(hit.point,hit.normal.clone().negate(),3);
   native.update(1/60,(i+1)/60,[]);d.update(1/60);
   if(!d.slots[slot].state){destroyed=true;break;}
  }
  rows.push({test:'native-bullet-destruction-removes-projected-mark',sourceKind,tint,before,after:d.count,destroyed,sourceChanged:sheet?!sheet.alive[chunk]:panel.dead||panel.boards?.some(b=>!b.alive),mesh:hit.owner.name});
  // Actual sampled map material colours, including texture albedo and vertex colours.
  const colorSamples=[];let visited=0;w.props.traverse(o=>{if(!o.isMesh||!o.visible||o.isInstancedMesh||visited>=12)return;const kind=S.surface('metal',o);if(!['wood','metal','concrete','fabric'].includes(kind))return;const pos=o.geometry.getAttribute('position'),ix=o.geometry.index;if(!pos||pos.count<3)return;const ids=[0,1,2].map(k=>ix?ix.getX(k):k),point=new T.Vector3();for(const i of ids)point.add(new T.Vector3().fromBufferAttribute(pos,i));point.multiplyScalar(1/3).applyMatrix4(o.matrixWorld);const uv=o.geometry.getAttribute('uv'),h={point,face:{a:ids[0],b:ids[1],c:ids[2],materialIndex:0},uv:uv?new T.Vector2((uv.getX(ids[0])+uv.getX(ids[1])+uv.getX(ids[2]))/3,(uv.getY(ids[0])+uv.getY(ids[1])+uv.getY(ids[2]))/3):undefined};const c=S.colorAt(o,h,kind);colorSamples.push({kind,material:S.materialAt(o,h).name,color:c.toArray(),tint:S.tint(o,h,kind)});visited++;});
  return {map:w.mapId,counts,materials,untyped:Array.from(untyped),rows,colorSamples};
 });
 assert.equal(errors.length,0);assert(result.counts.wood>0&&result.counts.metal>0&&result.counts.concrete>0);assert(result.rows.every(r=>r.destroyed));assert(result.colorSamples.every(c=>c.tint.every(Number.isFinite)));
 all.push({result,errors});fs.writeFileSync(__dirname+'/maps-v8.json',JSON.stringify({pass:true,maps:all},null,2));console.log(JSON.stringify({map,counts:result.counts,destruction:result.rows,untyped:result.untyped.slice(0,12),errors}));
 }finally{await browser.close();}}
})().catch(e=>{console.error(e);process.exit(1)});
