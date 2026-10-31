const ts=require('typescript'),fs=require('fs'),path=require('path');
const out=path.resolve(__dirname,'../../js/maps');const source=process.argv[2];if(!source)throw new Error('Pass folder with extracted original map JS sources');fs.mkdirSync(out,{recursive:true});
for(const id of ['forest_map_camp','stroyka_zarechye_v2','angar_map']){
const file=path.join(source,`${id}.js`);const pg=ts.createProgram([file],{allowJs:true,checkJs:false,noLib:true,noResolve:true});const sf=pg.getSourceFile(file),ck=pg.getTypeChecker();const records=[],symbols=new Map(),byName=new Map(),inits=[];
for(const st of sf.statements){
 if(ts.isFunctionDeclaration(st)||ts.isClassDeclaration(st)){if(st.name)add(st.name.text,st,st.getText(sf));}
 else if(ts.isVariableStatement(st))for(const d of st.declarationList.declarations){if(ts.isIdentifier(d.name))add(d.name.text,d,'var '+d.getText(sf)+';');}
 else if((!angDummy(st)) && !ts.isVariableStatement(st) && !ts.isFunctionDeclaration(st) && !ts.isClassDeclaration(st) && !ts.isImportDeclaration(st)){const line=sf.getLineAndCharacterOfPosition(st.getStart()).line+1;if((id!=='angar_map'&&line>500&&line<1000)||(id==='forest_map_camp'&&line===5881)||/^((burnTex|charTex)\.)/.test(st.getText(sf))){const n='__init'+line;add(n,st,st.getText(sf));inits.push(n);}}
 else if(ts.isImportDeclaration(st)){const txt=st.getText(sf);const ns=st.importClause?.namedBindings;if(ns&&ts.isNamespaceImport(ns))add(ns.name.text,ns,'var '+ns.name.text+' = '+(String(st.moduleSpecifier.text).includes('BufferGeometryUtils')?"ctx.BGU":"ctx.THREE")+';');}
}
function angDummy(st){return false;}
function add(name,node,text){const r={name,node,text,deps:new Set()};records.push(r);byName.set(name,r);const n=node.name||node;const sy=ck.getSymbolAtLocation(n);if(sy)symbols.set(sy,r);}
for(const r of records){function visit(n){if(ts.isIdentifier(n)){const sy=ck.getSymbolAtLocation(n);const dep=symbols.get(sy);if(dep&&dep!==r)r.deps.add(dep.name);}ts.forEachChild(n,visit);}visit(r.node);}
const ang=id==='angar_map';const overrides={
 THREE:'ctx.THREE',renderer:'ctx.renderer',scene:'ctx.scene',camera:'ctx.camera',
 QNAME:ang?"(ctx.quality==='medium'?'med':ctx.quality==='high'?'high':'low')":"(ctx.quality==='ultra'?'potato':ctx.quality)",
 Q:ang?'QPRESETS[QNAME]':'PRESETS[QNAME]',
 PL:'{pos:ctx.camera.position,vel:new THREE.Vector3(),mode:"walk",yaw:0,pitch:0,dead:0,agl:2}',
 PHYS:'{ready:false,bodies:[],statics:new Map()}', PH:'{ready:false,dyn:[],soft:[]}',
 // Legacy weapon/input/Ammo entry points may not be pulled into environment.
 buildSky:'function(){}', buildFlags:'function(){}', buildMG:'function(){}', buildSearchlights:'function(){}',
 addDynamic:'function(){return null}',addBody:'function(){return null}',registerGlass:'function(){}',
 addStaticCollider:'function(){}', removeStaticCollider:'function(){}',
 buildFire:'function(){}',ignite:'function(){}',explode:'function(){}',explode2:'function(){}',artillery2:'function(){}',
 toast:'function(){}',play3D:'function(){}',shotSound:'function(){}',
 setLevel:'function(){}',buildComposer:'function(){}',
};
if(ang){overrides.THREE='ctx.THREE';overrides.BGU='ctx.BGU';overrides.DEBUG='new URLSearchParams()';}
const GPF=path.join(__dirname,'gameplay',id+'.cjs'),GP=fs.existsSync(GPF)?require(GPF):{};Object.assign(overrides,GP.overrides||{});for(const n of GP.unoverride||[])delete overrides[n];
const forestSteps=ang?[]:['buildMaterials',...(id.startsWith('stroyka')?['villageMats','planCompound']:[]),'planBuildings','planMilitary',...(id.startsWith('stroyka')?['planCraters']:[]),'planProps','planLamps','planLandmarks','planWrecks','buildHeightCache','buildTerrain','buildForest','buildUndergrowth','buildGrass',...(id.startsWith('forest')?['buildLake']:['buildCompound']),'buildBuildings','buildMilitary','buildLandmarks',...(id.startsWith('stroyka')?['buildField']:[]),'buildWrecks','buildProps','buildCrates',...(id.startsWith('stroyka')?['buildBases','buildExtraStatic']:[]),'buildBigFlag','buildGlass','buildLamps','finishLamps','flushStatic'];
const angSteps=['buildAllMaterials','buildFabricMaterials','buildLights','buildHangar','buildRoof','buildLamps','buildDeadLamp','buildServices','buildNightLighting','buildHouse','buildDoors','roomLabels','buildLayout','buildFloor','buildFloorDetails','buildTag','flushBuckets','bakeScene'];
const steps=ang?angSteps:forestSteps;
for(const [after,add] of Object.entries(GP.stepInsert||{})){const i=steps.indexOf(after);if(i<0)throw new Error('stepInsert anchor missing: '+after);steps.splice(i+1,0,add);}
const roots=[...inits,...steps,...(GP.roots||[]),'COLLIDERS',...(ang?['normCollider','HW','HD','TEAMS']:['hFast','MAP','SPAWNS','TERRAIN','updateWind','updateForestLOD','refreshGrass','GRASS','WIND','FXU','LAKE','FRAME'])];
const need=new Set();function use(n){if(need.has(n)||!byName.has(n))return;need.add(n);if(n in overrides){if(n==='Q'){use('QNAME');use(ang?'QPRESETS':'PRESETS');}return;}for(const d of byName.get(n).deps)use(d);}
roots.forEach(use);
let code=records.filter(r=>need.has(r.name)).map(r=>r.name in overrides?'var '+r.name+' = '+overrides[r.name]+';':r.text).join('\n');
code=(GP.prelude||'')+'\n'+code;
for(const [f,t] of GP.patches||[]){if(!code.includes(f))throw new Error('gameplay patch target not found: '+f.slice(0,80));code=code.split(f).join(t);}
let ending=ang?`const native = COLLIDERS.map(c=>normCollider(c)); return {native, heightAt:()=>0, bounds:{x0:-HW+.5,x1:HW-.5,z0:-HD+.5,z1:HD-.5}, bases:{alpha:{x:-34,z:0},delta:{x:34,z:0}},update:()=>{}};`:
`const bases={alpha:{x:SPAWNS.A.x,z:SPAWNS.A.z},delta:{x:SPAWNS.D.x,z:SPAWNS.D.z}}; GRASS.center.set(1e9,1e9);refreshGrass(true);updateForestLOD(true);return {native:COLLIDERS,heightAt:hFast,bounds:{x0:-MAP.PLAY,x1:MAP.PLAY,z0:-MAP.PLAY,z1:MAP.PLAY},bases,waterY:MAP.WATER_Y,update:(dt,t)=>{FRAME.t=t;FRAME.dt=dt;FRAME.n++;FXU.uFxT.value=t;if(typeof LAKE!=='undefined'&&LAKE.mat){LAKE.mat.uniforms.uTime.value=t;LAKE.mat.uniforms.uFxT.value=t;};updateWind(t);if(FRAME.n%20===0){updateForestLOD(false);refreshGrass();}}};`;
const prefix=`/* Extracted environment only from user supplied ${id}.html. Rebuild: tools/map-extraction/. No original input, renderer, player, weapons, artillery or drone boot. */\nwindow.AEGIS_MAP_BUILDERS=window.AEGIS_MAP_BUILDERS||{};\nwindow.AEGIS_MAP_BUILDERS['${id}']=async function(ctx){\n`;
let calls=steps.map(n=>`await ctx.stage('${n}');${n}();`).join('\n');
if(!ang)calls=`for(const s of Object.values(SPAWNS)){const l=Math.hypot(s.x,s.z);s.fx=-s.x/l;s.fz=-s.z/l;s.yaw=Math.atan2(-s.fx,-s.fz);s.r=14;}\n`+calls;
if(GP.after)calls+='\n'+GP.after;if(GP.ending)ending=GP.ending(ending);
fs.writeFileSync(`${out}/${id}.js`,prefix+code+'\n'+calls+'\n'+ending+'\n};\n');
fs.writeFileSync(path.join(__dirname,`${id}-closure.json`),JSON.stringify({steps,selected:[...need],skipped:records.filter(r=>!need.has(r.name)).map(r=>r.name)},null,2));
console.log(id,'declarations',need.size,'bytes',code.length,'legacy?', [...need].filter(x=>/^(loop|frame2|initPlayer|buildWeapons|artillery|setMode|updatePlayer|initPhysics|buildStaticWorld)$/.test(x)));
}
