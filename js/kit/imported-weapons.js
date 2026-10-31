/* AEGIS v4 — user supplied AR15/M4 GLB and Glock 21 Gen4 FBX (baked to GLB).
   Canonical units: millimetres, +X muzzle, +Y up, +Z weapon right.
   Models load once; builds clone the hierarchy, keeping rigid mechanisms separate.
   No substitute procedural weapon is silently displayed if loading fails. */
(function (root) {
  'use strict';
  const T=root.THREE,WK=root.AEGIS_WK;if(!T||!WK)return;
  const templates=new Map();
  const assetBase=new URL('../../assets/models/weapons/',document.currentScript.src);
  const configs={
    ar15m4:{file:'ar15_m4.glb',group:'ar15_m4',title:'AR-15 / M4',family:'B',cal:'556',caliber:'5,56×45 NATO',cap:30,
      magSeat:[20,-12,0],muzzle:[416.5,0,0],eject:[-45,0,15],rear:[-110,67,0],front:[208,67,0],eyeX:-205,
      grip:[-85,-28],rake:22,hg:{x:150,y:-3,r:22},travel:90,carrier:'bcg',charger:'charging',
      stats:{weight:3100,length:825,ergo:58,recoilV:95,recoilH:90,moa:2,velocity:880,range:450,loud:160,flash:70,adsTime:270,rpm:800,mag:30}},
    glock21:{file:'glock21_gen4.glb',group:'glock21',title:'Glock 21 Gen4',family:'A',cal:'45acp',caliber:'.45 ACP',cap:13,
      magSeat:[-19,-19,0],muzzle:[124,0,0],eject:[30,3,14],rear:[-52,21,0],front:[112,21,0],eyeX:-180,
      grip:[-39,-28],rake:22,travel:36,carrier:'slide',
      stats:{weight:830,length:208,ergo:67,recoilV:118,recoilH:100,moa:4.8,velocity:260,range:50,loud:157,flash:55,adsTime:190,rpm:420,mag:13}}
  };
  function clone(id){const source=templates.get(id);if(!source)throw Error('Модель '+id+' ещё не загружена');const model=source.clone(true);model.traverse(o=>{if(o.isMesh){o.geometry.userData.shared=true;o.castShadow=true;o.receiveShadow=false;}});return model;}
  function pivot(model,name,p){const obj=model.getObjectByName(name);if(!obj)return null;const wrap=new T.Group();wrap.name=name+'_pivot';wrap.position.fromArray(p);obj.parent.add(wrap);wrap.attach(obj);return wrap;}
  function part(id,name,offset){const model=clone(id);const obj=model.getObjectByName(name);if(!obj)throw Error('Нет узла '+name+' в '+id);obj.removeFromParent();const group=new T.Group();group.add(obj);obj.position.sub(new T.Vector3(...offset));return group;}
  for(const [id,c] of Object.entries(configs)){
    const parts=[{id:id+'_mag',cat:id+'_mag',name:id==='ar15m4'?'PMAG 30 · 5,56×45':'Glock 21 · 13 патронов .45 ACP',stats:{mag:c.cap},build(){return {root:part(id,'mag',c.magSeat),mag:{cap:c.cap,cal:c.cal}}}}];
    const slots=[{id:'mag',label:'Магазин',group:'Снаряжение',accepts:[id+'_mag'],mount:'magwell',required:true,iface:id}];
    parts[0].fit={iface:[id]};
    if(c.charger){parts.push({id:id+'_charger',cat:id+'_charger',name:'Штатная рукоять заряжания',only:[id],build(){return{root:part(id,c.charger,[0,0,0]),charger:{travel:90}}}});slots.push({id:'charger',label:'Рукоять заряжания',group:'Механика',accepts:[id+'_charger'],mount:'charger',required:true});}
    const def={id,title:c.title,short:c.title,family:id==='glock21'?'glock21':'ar15',cal:c.cal,caliber:c.caliber,base:c.stats,
      boltHold:true,thread:id==='ar15m4'?'1/2x28':null,action:id==='glock21'?'semi':'auto',modes:id==='glock21'?['semi']:['safe','semi','auto'],
      chargeLabel:id==='glock21'?'передёрнуть кожух':'рукоять заряжания',kick:id==='glock21'?1.3:1,hipMoa:id==='glock21'?45:30,
      flashSize:id==='glock21'?.72:1,audio:{cal:c.cal,body:.55,mech:.8},
      specs:[['Калибр',c.caliber],['Магазин',c.cap+' патронов'],['Модель','Импортированный '+(id==='glock21'?'FBX → GLB':'GLB')]],
      slots,parts,defaults:{mag:id+'_mag',...(c.charger?{charger:id+'_charger'}:{})},
      build(ctx){const model=clone(id);model.updateMatrixWorld(true);const mag=model.getObjectByName('mag');mag.removeFromParent();if(c.charger)model.getObjectByName(c.charger)?.removeFromParent();
        let carrier=model.getObjectByName(c.carrier);const trigger=pivot(model,id==='ar15m4'?'trigger_1':'trigger',id==='ar15m4'?[-83,-50,0]:[22,-23,0]);
        const nodes={carrier,trigger,selector:pivot(model,'selector',[-87,-28,0]),boltCatch:model.getObjectByName('boltCatch'),magRelease:model.getObjectByName('magRelease')};
        const cover=id==='ar15m4'?pivot(model,'dustCover',[-55,-15,15]):null;if(cover)nodes.dustCover=cover;
        model.add(ctx.mount({id:'magwell',type:'magwell',p:c.magSeat}));if(c.charger)model.add(ctx.mount({id:'charger',type:'charger',p:[0,0,0]}));
        return {root:model,nodes,anim:{carrierTravel:c.travel,triggerAngle:.18,portCover:cover,selector:{safe:0,semi:90,auto:180}},
          muzzle:c.muzzle,chamber:[id==='glock21'?30:0,0,0],eject:{p:c.eject,dir:[.25,.4,1]},eyeX:c.eyeX,cheekY:c.rear[1],
          irons:{rear:c.rear,front:c.front,type:id==='ar15m4'?'aperture':'notch',eye:75},focus:{center:id==='ar15m4'?[20,-35,0]:[20,-45,0],size:id==='ar15m4'?880:280}};}
    };
    WK.DEFS[id]=def;WK.FAMILY[id]=c.family;if(!WK.WEAPON_ORDER.includes(id)){if(id==='ar15m4')WK.WEAPON_ORDER.splice(WK.WEAPON_ORDER.indexOf('m416')+1,0,id);else WK.WEAPON_ORDER.push(id);}
  }
  const ready=Promise.all(Object.entries(configs).map(async([id,c])=>{const response=await fetch(new URL(c.file,assetBase));if(!response.ok)throw Error('Не загрузилась модель '+c.title+': '+response.status);const bytes=await response.arrayBuffer();const loader=new (root.THREE_ADDONS['loaders/GLTFLoader.js'].GLTFLoader)();const data=await new Promise((ok,bad)=>loader.parse(bytes,'',ok,bad));const model=data.scene.getObjectByName(c.group)||data.scene;model.traverse(o=>{if(o.geometry)o.geometry.userData.shared=true;});templates.set(id,model);return id;}));
  root.AEGIS_IMPORTED={ready,configs,templates};
  if(root.GAssets)root.GAssets.add('imported_weapons',ready);
})(window);
