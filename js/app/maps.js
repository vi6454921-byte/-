/* AEGIS: one engine, environment-only level adapters. No embedded old FPS pages. */
(function(root){'use strict';
 const DEFINITIONS=[{id:'stroyka_zarechye_v2',title:'Заречье'},{id:'forest_map_camp',title:'Тихий бор'},{id:'angar_map',title:'Ангар'}];
 const QS=new URLSearchParams(location.search),current=QS.get('map');
 /* v21: сектор большой карты — ?sector=1|2|3|random|all (all — вся карта целиком, для тестов) */
 const sectorParam=QS.get('sector')||'random';
 const id=DEFINITIONS.some(m=>m.id===current)?current:null;
 const KEY='aegis.levelTransfer.v1';
 function read(){try{return JSON.parse(sessionStorage.getItem(KEY)||'null')}catch(e){return null}}
 function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('Не удалось загрузить '+src));document.head.append(s)})}
 function local(c,x,z){const o=c.obb;if(!o)return [x-(c.x0+c.x1)/2,z-(c.z0+c.z1)/2];const dx=x-o.x,dz=z-o.z;return [dx*o.c-dz*o.s,dx*o.s+dz*o.c]}
 function inside(c,x,z,pad,y){if(c.type==='cyl')return Math.hypot(x-c.x,z-c.z)<c.r+pad;if(c.type==='obox')return insideTilted(c,x,y,z,pad);const o=c.obb,[a,b]=local(c,x,z);return Math.abs(a)<(o?o.hw:(c.x1-c.x0)/2)+pad&&Math.abs(b)<(o?o.hd:(c.z1-c.z0)/2)+pad}
 // tilted boxes (stairs, ramps, leaning planks): test the torso point in the box's own frame, not its world AABB
 function insideTilted(c,x,y,z,pad){const q=c.q,px=x-c.cx,py=y+.9-c.cy,pz=z-c.cz,qx=-q[0],qy=-q[1],qz=-q[2],qw=q[3],tx=2*(qy*pz-qz*py),ty=2*(qz*px-qx*pz),tz=2*(qx*py-qy*px),lx=px+qw*tx+qy*tz-qz*ty,ly=py+qw*ty+qz*tx-qx*tz,lz=pz+qw*tz+qx*ty-qy*tx;return Math.abs(lx)<c.hx+pad&&Math.abs(ly)<c.hy+.45&&Math.abs(lz)<c.hz+pad}
 // one place that turns a builder collider record into an engine collider
 function convert(T,n){if(n.dead||n.noPlayer||n.skipPhys)return null;
  if(n.t===0)return{type:'cyl',x:n.x,z:n.z,r:n.r,y0:n.y0,_top:n.y1,h:n.y1,source:n};
  let x0,x1,z0,z1,obb;
  if(n.t===1){const ex=Math.abs(n.c)*n.hw+Math.abs(n.s)*n.hd,ez=Math.abs(n.s)*n.hw+Math.abs(n.c)*n.hd;x0=n.x-ex;x1=n.x+ex;z0=n.z-ez;z1=n.z+ez;obb={x:n.x,z:n.z,hw:n.hw,hd:n.hd,c:n.c,s:n.s};}
  else{x0=n.x0;x1=n.x1;z0=n.z0;z1=n.z1;
   if(n.q){const e=new T.Euler().setFromQuaternion(new T.Quaternion().fromArray(n.q),'YXZ');
    if(Math.abs(e.x)<.01&&Math.abs(e.z)<.01)obb={x:n.cx,z:n.cz,hw:n.hx,hd:n.hz,c:Math.cos(e.y),s:Math.sin(e.y)};
    else if([n.cx,n.cy,n.cz,n.hx,n.hy,n.hz].every(Number.isFinite))return[x0,x1,z0,z1,n.y0,n.y1].every(Number.isFinite)?{type:'obox',cx:n.cx,cy:n.cy,cz:n.cz,hx:n.hx,hy:n.hy,hz:n.hz,q:n.q,x0,x1,z0,z1,y0:n.y0,_top:n.y1,h:n.y1,source:n}:null;}}
  return[x0,x1,z0,z1,n.y0,n.y1].every(Number.isFinite)?{type:'box',x0,x1,z0,z1,obb,y0:n.y0,_top:n.y1,h:n.y1,source:n}:null;}
 async function build(T,scene,renderer,camera,quality,stage){
  if(!id)throw new Error('Unknown map');await loadScript('js/maps/'+id+'.js');
  const props=new T.Group();props.name='level_environment';scene.add(props);
  const native=await root.AEGIS_MAP_BUILDERS[id]({THREE:T,scene:props,renderer,camera,quality,BGU:root.THREE_ADDONS['utils/BufferGeometryUtils.js'],stage});
  const colliders=[];let synced=0;
  const ground=new T.Group();ground.name='level_ground';scene.add(ground);
  const terrain=[];props.traverse(o=>{if(o.isMesh&&/^terrain/.test(o.name))terrain.push(o)});for(const o of terrain){ground.attach(o);o.userData.ground=true;o.userData.mat='soil'}
  root.GImpactSurfaces.prepareScene(props);
  const world={mapId:id,ground,props,targets:[],flags:[],colliders,heightAt:native.heightAt,bounds:native.bounds,bases:native.bases,waterY:native.waterY,
   crates:native.crates||[],doors:native.doors||[],ladders:native.ladders||[],mg:native.mg||null,hooks:native.hooks||{},indoor:native.indoor||(()=>false),native,
   update:(dt,t)=>{if(native.update)native.update(dt,t,root.__GAME&&root.__GAME.squad);world.syncColliders()},
   // destruction entry points used by bullets and explosions; no-ops on maps without a destruction runtime
   bulletHit:(p,dir,power)=>native.bulletHit?native.bulletHit(p,dir,power):null,
   explode:(p,o)=>{if(native.explode)native.explode(p,o)}};
  const bins=new Map(),cell=4;
  const binAdd=c=>{const x0=c.type==='cyl'?c.x-c.r:c.x0,x1=c.type==='cyl'?c.x+c.r:c.x1,z0=c.type==='cyl'?c.z-c.r:c.z0,z1=c.type==='cyl'?c.z+c.r:c.z1;for(let x=Math.floor(x0/cell);x<=Math.floor(x1/cell);x++)for(let z=Math.floor(z0/cell);z<=Math.floor(z1/cell);z++){const k=x+','+z;if(!bins.has(k))bins.set(k,[]);bins.get(k).push(c)}};
  // builders may add colliders at runtime (rebuilt wall segments after destruction); new records are converted here
  world.syncColliders=()=>{const list=native.native;let added=0;for(;synced<list.length;synced++){const c=convert(T,list[synced]);if(c){colliders.push(c);binAdd(c);added++}}return added};
  world.syncColliders();
  world.blocked=(x,z,y,pad=.38,cover)=>{/* v22: cover=true — жердевая ограда не укрытие */const found=new Set();for(let i=Math.floor((x-pad)/cell);i<=Math.floor((x+pad)/cell);i++)for(let j=Math.floor((z-pad)/cell);j<=Math.floor((z+pad)/cell);j++)for(const c of bins.get(i+','+j)||[])found.add(c);for(const c of found)if(!c.source?.dead&&!c.source?.door&&!(cover&&c.source?.rail)&&c._top>y+.42&&c.y0<y+1.7&&inside(c,x,z,pad,y))return true;return false};
  /* v21: мини-карта (сектор): базы, границы физики/навсетки, красная линия */
  if(root.GSectors&&root.GSectors.has(id)){try{root.GSectors.apply(T,scene,world,sectorParam)}catch(e){console.warn('sector',e&&e.message)}}
  const used=[];world.safeSpawn=(team,number)=>{const base=world.bases[team],bounds=world.bounds,sec=world.sector;for(let ring=0;ring<22;ring++)for(let k=0;k<24;k++){const a=(k+number*3.7)*Math.PI/12,r=ring*.7,x=base.x+Math.cos(a)*r,z=base.z+Math.sin(a)*r,y=native.heightAt(x,z);if(x<bounds.x0+.7||x>bounds.x1-.7||z<bounds.z0+.7||z>bounds.z1-.7||world.blocked(x,z,y,.5)||(sec&&sec.margin(x,z)<2)||used.some(p=>Math.hypot(x-p.x,z-p.z)<1.1))continue;if(native.waterY!==undefined&&y<native.waterY-.2)continue;const p={x,z,y,yaw:Math.atan2(x,z)};used.push(p);return p}throw new Error('Нет свободной точки появления '+team+' #'+number)};
  world.spawns=[];for(const team of ['delta','alpha']){for(let n=1;n<=2;n++){const key=team+'_'+n;world.spawns.push({key,...world.safeSpawn(team,n)})}for(let n=0;n<4;n++){const preset=team+'_'+(n%2+1);world.spawns.push({key:team+'_soldier_'+n,preset,npc:true,team,...world.safeSpawn(team,n+3)})}}
  scene.updateMatrixWorld(true);return world;
 }
 function travel(map,key,snapshot,opts){if(map!==null&&!DEFINITIONS.some(m=>m.id===map))throw new Error('Неизвестная карта');if(!root.AEGIS.GEN[key])throw new Error('Не выбран генерал');const payload={v:1,key,map,snapshot,time:Date.now()};sessionStorage.setItem(KEY,JSON.stringify(payload));const u=new URL(location.href);u.searchParams.delete('map');u.searchParams.delete('sector');if(map)u.searchParams.set('map',map);const sec=opts&&opts.sector;if(map&&sec&&root.GSectors&&root.GSectors.has(map))u.searchParams.set('sector',String(sec));location.assign(u.href)}
 root.GMaps={id,sector:sectorParam,definitions:DEFINITIONS,build,travel,readTransfer:()=>{const p=read();return p&&p.v===1&&p.map===id&&Date.now()-p.time<3600000?p:null},clearTransfer:()=>{try{sessionStorage.removeItem(KEY)}catch(e){}}};
})(window);
