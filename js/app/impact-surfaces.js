/* Surface semantics survive map batching. CPU albedo sampling never reads GPU pixels. */
(function(root){'use strict';
 const pixels=new WeakMap(),T=()=>root.THREE,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const aliases={rock:'concrete',conc:'concrete',cement:'concrete',plaster:'concrete',brick:'concrete',sand:'soil',ground:'soil',cloth:'fabric',steel:'metal',osb:'wood'};
 function keySurface(key,m){
  const n=String(key||'').toLowerCase();
  if(/glass|water|lake|stream|puddle|foliage|leaves|leaf|needles|crown|fern|grass|flame|smoke|glow|decal|crater|ember|halo|stencil|blades|bogflora|holes|coals|firered|fireweed|hogweed|umbel|^apple$|^(birch|pine|spruce|bush|shrub|flora|reed|hay|hayfringe|hayv)$/.test(n))return 'none';
  if(/wood|osb|ply|lumber|plank|bark|timber|trunk|deadwood|log|stake|pallet|crate|stump|wattle|^(burnt|boardt|signcabin|signdining|signgate|signmotto|signshower|signwc|signwash)$/.test(n))return 'wood';
  if(/paper|cardboard|targetface|vsign|zonesign/.test(n))return 'paper';
  if(/cloth|fabric|tarp|canvas|sandbag|hesco|burlap|rope|rubber|tire|tyre|cushion|camo|flag|sack|foam|cable|rooftar|^film$/.test(n))return 'fabric';
  if(/concrete|conc|cement|brick|plaster|stone|rock|asphalt|panel|slab|whitewash|hgfloor|hgapron|helipad|parkline|roofslate|roofshingle/.test(n))return 'concrete';
  if(/terrain|ground|soil|sand|dirt|mud|gravel|earth|snow|peat/.test(n))return 'soil';
  if(/metal|steel|iron|corr|roof|grating|grate|chrome|rust|pipe|paint|container|hgcont|hgcabin|hgwall|hgsheet|hgframe|rail|teama|teamd|dark|skin|plast|armor|brass|barrel|galv|wire|heli|car|tank|hg|olive|nal/.test(n))return 'metal';
  if(m?.alphaTest>.1 || m?.transmission>.1)return 'none';
  if(m?.metalness>.12)return 'metal';
  return null;
 }
 function tagMaterial(m,key){if(!m?.isMaterial)return; if(!m.name&&key)m.name=key;
  if(!m.userData.impactSurface){const kind=keySurface(key||m.name,m);if(kind)m.userData.impactSurface=kind;}
 }
 function tagTable(table){for(const [k,m] of Object.entries(table))tagMaterial(m,k);}
 function prepareScene(scene){scene.traverse(o=>{if(o.isSprite){o.raycast=function(){};return;}if(!o.isMesh)return;
  for(const m of Array.isArray(o.material)?o.material:[o.material])tagMaterial(m,m?.name);
  if(!Array.isArray(o.material)&&!o.userData.mat){const k=o.material?.userData.impactSurface;o.userData.mat=({concrete:'rock',soil:'soil',fabric:/bag|hesco/i.test(o.material?.name||'')?'sand':'rubber'})[k]||kSurfaceFallback(k,o);}
  // Do not stamp a generic parent/material guess onto a mixed-material mesh.
 });}
 function kSurfaceFallback(k,o){if(k&&k!=='none')return k;return /glass/i.test(o.material?.name||'')?'glass':undefined;}
 function materialAt(o,hit){const a=o?.material;return Array.isArray(a)?a[hit?.face?.materialIndex??0]:a;}
 function surface(kind,o,hit){if(o?.userData.ground)return 'soil';const m=materialAt(o,hit);let explicit=m?.userData?.impactSurface;
  for(let p=o;p;p=p.parent){const u=p.userData||{};if(u.impactSurface){explicit=u.impactSurface;break;}}
  if(explicit)return explicit==='none'?null:(aliases[explicit]||explicit);
  for(let p=o;p;p=p.parent){const u=p.userData||{},s=u.surface||u.mat;if(typeof s==='string'){const q=aliases[s]||keySurface(s,m);if(q)return q==='none'?null:q;}}
  if(kind==='target')return 'paper';
  const q=keySurface((m?.name||'')+' '+(o?.name||''),m);if(q)return q==='none'?null:q;
  return aliases[kind]||(['wood','metal','paper','fabric','soil','concrete'].includes(kind)?kind:'concrete');
 }
 function imagePixels(image){if(!image||typeof image!=='object')return null;if(pixels.has(image))return pixels.get(image);
  let out=null;try{if(image.data&&image.width){out={data:image.data,width:image.width,height:image.height,channels:image.data.length/(image.width*image.height)};}
   else {const w=Math.min(256,image.width||image.videoWidth||0),h=Math.min(256,image.height||image.videoHeight||0);if(w&&h){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(image,0,0,w,h);out={data:x.getImageData(0,0,w,h).data,width:w,height:h,channels:4};}}
  }catch(e){/* tainted/compressed/unsupported images use material+vertex albedo */}pixels.set(image,out);return out;
 }
 function colorAt(o,hit,kind){const THREE=T(),m=materialAt(o,hit),c=m?.color?.clone()||new THREE.Color(1,1,1);
  if(m?.map&&hit?.uv){const tex=m.map,im=imagePixels(tex.image);if(im){const uv=hit.uv.clone();if(tex.matrixAutoUpdate)tex.updateMatrix();tex.transformUv(uv);const x=clamp(Math.floor(uv.x*im.width),0,im.width-1),y=clamp(Math.floor(uv.y*im.height),0,im.height-1),i=(y*im.width+x)*im.channels,d=im.data,scale=d instanceof Float32Array?1:1/255;
    const sample=new THREE.Color().setRGB(d[i]*scale,d[i+1]*scale,d[i+2]*scale);if(tex.colorSpace===THREE.SRGBColorSpace)sample.convertSRGBToLinear();c.multiply(sample);}}
  const a=o?.geometry?.getAttribute('color'),f=hit?.face;
  if(m?.vertexColors&&a&&f){const p=o.geometry.getAttribute('position'),point=hit.point.clone();if(o.isInstancedMesh&&hit.instanceId!==undefined){const matrix=new THREE.Matrix4();o.getMatrixAt(hit.instanceId,matrix);matrix.premultiply(o.matrixWorld).invert();point.applyMatrix4(matrix);}else o.worldToLocal(point);const A=new THREE.Vector3().fromBufferAttribute(p,f.a),B=new THREE.Vector3().fromBufferAttribute(p,f.b),C=new THREE.Vector3().fromBufferAttribute(p,f.c),bc=new THREE.Vector3();THREE.Triangle.getBarycoord(point,A,B,C,bc);
   if([bc.x,bc.y,bc.z].every(Number.isFinite)){const v=new THREE.Color(0,0,0);for(const [idx,k] of [[f.a,bc.x],[f.b,bc.y],[f.c,bc.z]]){v.r+=a.getX(idx)*k;v.g+=a.getY(idx)*k;v.b+=a.getZ(idx)*k;}c.multiply(v);}}
  if(o?.isInstancedMesh&&o.instanceColor&&hit?.instanceId!==undefined){const q=new THREE.Color();o.getColorAt(hit.instanceId,q);c.multiply(q);}
  // Terrain splat shaders do not expose their final GPU colour as material.map.
  if(kind==='soil'&&!m?.map&&!a&&c.r>.95&&c.g>.95&&c.b>.95)c.setRGB(.16,.125,.075);
  return c;
 }
 function grain(o,hit){const THREE=T(),f=hit?.face,g=o?.geometry,p=g?.getAttribute('position'),uv=g?.getAttribute('uv');if(!f||!p||!uv)return;
  const a=new THREE.Vector3().fromBufferAttribute(p,f.a),e1=new THREE.Vector3().fromBufferAttribute(p,f.b).sub(a),e2=new THREE.Vector3().fromBufferAttribute(p,f.c).sub(a),du1=uv.getX(f.b)-uv.getX(f.a),du2=uv.getX(f.c)-uv.getX(f.a),dv1=uv.getY(f.b)-uv.getY(f.a),dv2=uv.getY(f.c)-uv.getY(f.a),det=du1*dv2-du2*dv1;
  if(Math.abs(det)<1e-10)return;const U=e1.clone().multiplyScalar(dv2).addScaledVector(e2,-dv1).multiplyScalar(1/det),V=e2.clone().multiplyScalar(du1).addScaledVector(e1,-du2).multiplyScalar(1/det),tex=materialAt(o,hit)?.map;
  if(tex){if(tex.matrixAutoUpdate)tex.updateMatrix();const m=tex.matrix.elements,d=m[0]*m[4]-m[3]*m[1];if(Math.abs(d)>1e-10)V.multiplyScalar(m[0]/d).addScaledVector(U,-m[3]/d);}
  const matrix=o.matrixWorld.clone();if(o.isInstancedMesh&&hit.instanceId!==undefined){const im=new THREE.Matrix4();o.getMatrixAt(hit.instanceId,im);matrix.multiply(im);}if(V.lengthSq()>1e-10)return V.transformDirection(matrix).toArray();
 }
 const reference={concrete:[.46,.44,.39],wood:[.44,.285,.14],metal:[.25,.25,.25],paper:[.8,.77,.67],fabric:[.27,.23,.16],soil:[.16,.11,.065]};
 function tint(o,hit,kind){const c=colorAt(o,hit,kind),r=reference[kind]||reference.concrete;return [clamp(c.r/r[0],.12,4),clamp(c.g/r[1],.12,4),clamp(c.b/r[2],.12,4)];}
 root.GImpactSurfaces={keySurface,tagMaterial,tagTable,prepareScene,materialAt,surface,colorAt,tint,grain};
})(globalThis);
