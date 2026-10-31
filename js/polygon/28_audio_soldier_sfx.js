
/* ==========================================================================
   МОДУЛЬ: audio/soldier_sfx.js
   ========================================================================== */
/* Голоса и снаряжение бойцов (реальные записи Freesound, CC0 / CC BY —
   авторы в титрах на стартовом экране). Движок SoldierSFX: шаги, ткань,
   снаряжение, автомат, дыхание на бегу 2:1 к шагам, отдышка, частое
   поверхностное дыхание раненого, крик при попадании (голос через
   90–160 мс после вздрагивания тела), «один рот», балаклава глушит верх.
   Один экземпляр на бойца; банки декодируются один раз и общие. */
(function (root) {
'use strict';
const SND = root.__AEGIS_SND || {};
const rnd=(a,b)=>a+Math.random()*(b-a), db=x=>Math.pow(10,x/20), clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function b64buf(s){const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u.buffer}
class Bank{constructor(b){this.b=b;this.hist=[];this.i=0}
 rand(){const n=this.b.length;if(n<2)return this.b[0];const avoid=Math.min(n-1,Math.max(1,Math.floor(n/3)));let k,g=0;
  do{k=Math.floor(Math.random()*n);g++}while(this.hist.includes(k)&&g<50);this.hist.push(k);if(this.hist.length>avoid)this.hist.shift();return this.b[k]}
 next(){const x=this.b[this.i%this.b.length];this.i++;return x}
 fit(target,tol=.35){// клип, длительность которого ближе к нужной фазе дыхания
  const c=this.b.map((x,k)=>[k,Math.abs(Math.log(x.duration/target))]).filter(([k])=>!this.hist.includes(k)).sort((a,b)=>a[1]-b[1]);
  const pool=c.filter(x=>x[1]<tol);const k=(pool.length?pool[Math.floor(Math.random()*Math.min(4,pool.length))]:c[0])[0];this.hist.push(k);if(this.hist.length>Math.min(this.b.length-1,4))this.hist.shift();return this.b[k]}
 longest(){return this.b.reduce((a,c)=>c.duration>a.duration?c:a)}
 shortest(){return this.b.reduce((a,c)=>c.duration<a.duration?c:a)}}
// ---- профили бойцов: голос, снаряжение, вес ----
const SOLDIERS={
 d1:{name:'Дельта-1',desc:'шлем, открытое лицо, плитник с подсумками',mask:false,load:1.0,stepRate:1.0,rattle:1.0,rifle:.9,cloth:1.0,thump:1.0,voiceRate:1.0},
 d2:{name:'Дельта-2',desc:'панама, балаклава, лёгкий разгруз',mask:true,load:.85,stepRate:1.03,rattle:.6,rifle:.8,cloth:1.25,thump:.8,voiceRate:1.0},
 a1:{name:'Альфа-1',desc:'чёрная форма, балаклава, тяжёлые плиты',mask:true,load:1.25,stepRate:.95,rattle:1.2,rifle:1.0,cloth:.9,thump:1.35,voiceRate:1.0},
 a2:{name:'Альфа-2',desc:'«цифра», балаклава, штатный комплект',mask:true,load:1.05,stepRate:.99,rattle:.9,rifle:.9,cloth:1.0,thump:1.05,voiceRate:1.0}};
// ---- реальные параметры (см. описание в файле) ----
const GAIT={walk:{spm:112,jit:.025},run:{spm:168,jit:.02},limp:{spm:92}};
class SoldierSFX{
 constructor(ctx,raw,opts){this.ctx=ctx;this.raw=raw;this.lite=!!(opts&&opts.lite);this.sid='d1';this.mode='idle';this.injured=false;this.downed=null;
  this.F=0;this.runT=0;this.lastU=0;this.LA=.25;this.stepN=0;this.nextStep=0;this.nextBreath=0;this.mouthLast=null;
  this.recovering=false;this.injN=0;this.bodycam=true;this.listeners=[];this.extSteps=false;this.build()}
 static loadBanks(ctx,raw){raw=raw||SND;const B={};return Promise.all(Object.entries(raw).map(async([k,arr])=>{B[k]=new Bank(await Promise.all(arr.map(s=>ctx.decodeAudioData(b64buf(s)))))})).then(()=>B)}
 async load(){const c=this.ctx,B={};const ent=Object.entries(this.raw);
  await Promise.all(ent.map(async([k,arr])=>{B[k]=new Bank(await Promise.all(arr.map(s=>c.decodeAudioData(b64buf(s)))))}));this.B=B;return this}
 now(){return this.tNow??this.ctx.currentTime}
 bank(k){return this.B[this.sid+'_'+k]}
 build(){const c=this.ctx;
  const G=()=>c.createGain(),F=(type,f,q,g)=>{const x=c.createBiquadFilter();x.type=type;x.frequency.value=f;if(q!=null)x.Q.value=q;if(g!=null)x.gain.value=g;return x};
  this.out=G();                                   // -> master (подключается снаружи)
  // шины
  this.voiceBus=G();this.foleyBus=G();this.stepBus=G();this.foleyBus.gain.value=db(-5);this.stepBus.gain.value=db(-6);
  // балаклава: ткань у рта глушит 3–8 кГц
  this.maskLP=F('lowpass',20000,.5);this.maskPk=F('peaking',3500,1,0);
  this.voiceBus.connect(this.maskPk);this.maskPk.connect(this.maskLP);
  // шаги слышны с груди (~1.3 м до земли): меньше верха
  this.stepLP=F('lowpass',20000,.6);this.stepBus.connect(this.stepLP);
  this.mix=G();this.maskLP.connect(this.mix);this.stepLP.connect(this.mix);this.foleyBus.connect(this.mix);
  // --- чистый путь
  this.clean=G();this.mix.connect(this.clean);this.clean.connect(this.out);
  // lite (боты): без цепочки бодикама и фоновых шумов — 64 компрессора и 128 зацикленных
  // источников перегружали аудиопоток, звук пропадал
  if(this.lite){this.bc=G();this.bcIn=G();this.hissG=G();this.windG=G();this.bcComp=null}else{
  // --- бодикам: маленькая капсула + AGC + клиппинг + кодек
  const hp=F('highpass',150,.7),pr=F('peaking',2800,1,4),lp=F('lowpass',11000,.7),cmp=c.createDynamicsCompressor();
  cmp.threshold.value=-24;cmp.knee.value=6;cmp.ratio.value=3;cmp.attack.value=.003;cmp.release.value=.4; // АРУ: авто-makeup Web Audio ≈ +9.6 дБ
  const ws=c.createWaveShaper(),N=2048,cv=new Float32Array(N);for(let i=0;i<N;i++){const x=i/(N-1)*2-1;cv[i]=Math.tanh(1.8*x)/Math.tanh(1.8)}ws.curve=cv;ws.oversample='2x';
  const mk=G();mk.gain.value=db(-4.5);const pre=G();pre.gain.value=1.6;const post=G();post.gain.value=db(-1.5);this.bc=G();
  this.bcIn=G();this.mix.connect(this.bcIn);this.bcIn.connect(hp);hp.connect(pr);pr.connect(lp);lp.connect(cmp);cmp.connect(mk);mk.connect(pre);pre.connect(ws);ws.connect(post);post.connect(this.bc);this.bc.connect(this.out);
  this.bcComp=cmp;
  // фон бодикама: шум тракта + ветер в микрофоне (идёт через AGC -> «дышит» в паузах)
  const nb=c.createBuffer(1,c.sampleRate*4,c.sampleRate),d=nb.getChannelData(0);let b0=0,b1=0,b2=0,br=0;
  for(let i=0;i<d.length;i++){const w=Math.random()*2-1;b0=.99765*b0+w*.099;b1=.963*b1+w*.2965;b2=.57*b2+w*1.0526;d[i]=(b0+b1+b2+w*.1848)*.12}
  const wb=c.createBuffer(1,c.sampleRate*6,c.sampleRate),wd=wb.getChannelData(0);for(let i=0;i<wd.length;i++){br=(br+.02*(Math.random()*2-1))/1.02;wd[i]=br*3.5}
  const hiss=c.createBufferSource();hiss.buffer=nb;hiss.loop=true;this.hissG=G();this.hissG.gain.value=db(-60);hiss.connect(this.hissG);this.hissG.connect(hp);
  const wind=c.createBufferSource();wind.buffer=wb;wind.loop=true;const wlp=F('lowpass',380,.7);this.windG=G();this.windG.gain.value=db(-52);wind.connect(wlp);wlp.connect(this.windG);this.windG.connect(hp);
  hiss.start(0);wind.start(0);
  }
  this.setBodycam(true,0);this.setSoldier('d1')}
 setBodycam(on,ramp=.05){if(this.lite)on=false;this.bodycam=on;const t=this.now();this.clean.gain.setTargetAtTime(on?0:1,t,ramp+.001);this.bc.gain.setTargetAtTime(on?1:0,t,ramp+.001);this.stepLP.frequency.setTargetAtTime(on?6500:20000,t,.01)}
 setSoldier(id){this.sid=id;const s=SOLDIERS[id],t=this.now();this.S=s;
  this.maskLP.frequency.setValueAtTime(s.mask?6800:20000,t);this.maskPk.gain.setValueAtTime(s.mask?-3:0,t)}
 // ---------- низкоуровневое воспроизведение ----------
 play(buf,t,{gain=1,rate=1,bus='foley',lp=0}={}){if(!buf)return null;const c=this.ctx,s=c.createBufferSource(),g=c.createGain();s.buffer=buf;s.playbackRate.value=rate;g.gain.value=gain;
  let n=s;if(lp){const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=lp;f.Q.value=.5;s.connect(f);n=f}
  n.connect(g);g.connect(bus==='voice'?this.voiceBus:bus==='step'?this.stepBus:this.foleyBus);s.start(Math.max(t,this.now()));const v={s,g,t,end:t+buf.duration/rate};
  // v16: голос — все запланированные звуки рта (с упреждением LA) — чтобы stopAll обрывал и их, а не только последний
  if(bus==='voice'){const L=this.vq||(this.vq=[]),nw=this.now();for(let i=L.length-1;i>=0;i--)if(L[i].end<nw)L.splice(i,1);L.push(v)}return v}
 // рот один: нельзя одновременно кричать и вдыхать — предыдущий звук рта гасится
 mouth(buf,t,{gain=1,effort=1,rate=1}={}){const m=this.mouthLast;if(this.log)this.log.push(['m',+t.toFixed(3),+buf.duration.toFixed(2),+effort.toFixed(2)]);
  if(m&&m.end>t){try{m.g.gain.setTargetAtTime(0,Math.max(t-.01,this.now()),.025);m.s.stop(Math.max(t+.15,this.now()+.01))}catch(e){}}
  // малое голосовое усилие = круче спектральный наклон (меньше верха) и тише
  const lp=effort>=.99?0:1200+9000*Math.pow(effort,1.6);
  const v=this.play(buf,t,{gain:gain*db(-12*(1-effort)),rate:rate*this.S.voiceRate*rnd(.985,1.015),bus:'voice',lp});this.mouthLast=v;this.emit('mouth');return v}
 // v14: «кровь в горле» — голос глушится и гнусавит (фильтр на шине голоса)
 choke(dur){const c=this.ctx,t=this.now();if(!this.chk){const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=20000;f.Q.value=2.5;
   this.maskLP.disconnect();this.maskLP.connect(f);f.connect(this.mix);this.chk=f}
  this.chk.frequency.cancelScheduledValues(t);this.chk.frequency.setTargetAtTime(rnd(650,1100),t,.03);this.chk.frequency.setTargetAtTime(20000,t+dur+.3,.4)}
 // бульканье: шум через полосовой фильтр с «пузырями» (случайные всплески частоты и громкости)
 gurgle(t,amt,dur){const c=this.ctx;if(!this.gnb){const n=c.createBuffer(1,c.sampleRate*2,c.sampleRate),d=n.getChannelData(0);let b=0;for(let i=0;i<d.length;i++){b=.94*b+.06*(Math.random()*2-1);d[i]=b*4}this.gnb=n}
  const s=c.createBufferSource(),f=c.createBiquadFilter(),f2=c.createBiquadFilter(),g=c.createGain();s.buffer=this.gnb;s.loop=true;f.type='bandpass';f.Q.value=7;f2.type='lowpass';f2.frequency.value=1400;
  g.gain.setValueAtTime(0,t);const n=Math.max(3,Math.floor(dur*rnd(9,15)));
  for(let i=0;i<n;i++){const ti=t+dur*i/n+rnd(0,.03);f.frequency.setValueAtTime(rnd(220,700),ti);f.frequency.exponentialRampToValueAtTime(rnd(500,1300),ti+.045);
   g.gain.setValueAtTime(0,ti);g.gain.linearRampToValueAtTime(amt*rnd(.25,1)*.5,ti+.008);g.gain.exponentialRampToValueAtTime(.001,ti+rnd(.03,.07))}
  s.connect(f);f.connect(f2);f2.connect(g);g.connect(this.voiceBus);s.start(t);s.stop(t+dur+.2)}
 thump(t,amt){const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type='sine';const f=rnd(52,72)/Math.sqrt(this.S.load);o.frequency.setValueAtTime(f*1.6,t);o.frequency.exponentialRampToValueAtTime(f,t+.03);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(amt,t+.004);g.gain.exponentialRampToValueAtTime(.0005,t+.11);o.connect(g);g.connect(this.foleyBus);o.start(t);o.stop(t+.13)}
 rub(t,amt){if(!this.bodycam)return;const c=this.ctx,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=this.B.cloth_run.rand();f.type='bandpass';f.frequency.value=rnd(700,1400);f.Q.value=.9;
  g.gain.value=amt;s.connect(f);f.connect(g);g.connect(this.bcIn);s.start(t,0,.12)}
 emit(e){for(const f of this.listeners)f(e,this)}
 // ---------- публичный API ----------
 setMove(m){const now=this.now();if(this.downed)return;if(m===this.mode)return;
  if(this.mode==='idle'&&m!=='idle'){this.nextStep=now+.06;this.stepN=0}
  if(m!=='run'&&this.mode==='run'){this.recovering=this.F>.12;this.nextBreath=now+.12;if(this.recovering)this.emit('recover')}
  if(m==='run'){this.runT=0;this.recovering=false}
  this.mode=m;this.emit('mode')}
 setInjured(on){this.injured=on;this.nextBreath=this.now()+.1;this.injN=0;this.emit('inj')}
 // попадание: lvl 0..1 (лёгкое -> тяжёлое)
 hit(lvl=.5,t){if(this.downed)return;t=t??this.now()+.01;const B=this.B;
  const heavy=lvl>.65,v=heavy?this.bank('scream'):this.bank('yelp');
  // ~50–80 мс: вздрагивание тела -> снаряжение дёргается раньше голоса (голосовая реакция ~100–200 мс)
  this.play(B.rattle.rand(),t,{gain:.8*this.S.rattle*rnd(.8,1.1),rate:rnd(.95,1.05)});
  if(lvl>.4)this.play(B.swish.rand(),t+.02,{gain:.6*this.S.cloth});
  this.thump(t,.5*this.S.thump*lvl);
  const vb=heavy?this.shortScream():v.rand();
  this.mouth(vb,t+rnd(.09,.16),{gain:.85+.3*lvl,effort:clamp(.75+.35*lvl,0,1)});
  this.F=Math.max(this.F,.25+.3*lvl);this.nextBreath=Math.max(this.nextBreath,t+vb.duration+.25);this.recovering=true;this.emit('hit')}
 shortScream(){const b=this.bank('scream');let x,g=0;do{x=b.rand();g++}while(x.duration>2.2&&g<12);return x}
 // «убит»: падение + сценарий раненого на земле. mode: auto | scream | quiet
 down(mode='auto',t){t=t??this.now()+.01;const B=this.B;this.mode='idle';
  this.downed={t0:t,mode,next:t+.01,k:0,fall:true,ext:!!(arguments[2]&&arguments[2].ext)};this.injured=false;this.recovering=false;this.emit('down')}
 // удары от физики тела (рэгдолл): тело и автомат о грунт — по факту касания
 fallImpact(v=1,t){t=t??this.now()+.005;const B=this.B,S=this.S;this.play(B.bodyfall.rand(),t,{gain:(.55+.5*v)*Math.sqrt(S.load)});this.thump(t,(.4+.5*v)*S.thump);
  this.play(B.rattle.rand(),t+.03,{gain:.9*S.rattle});if(Math.random()<.4)this.play(B.magdrop.rand(),t+rnd(.2,.4),{gain:.45})}
 gunImpact(t){t=t??this.now()+.005;this.play(this.B.rifle.rand(),t,{gain:1.0*this.S.rifle})}
 footstep(run,vol=1){const t=this.now()+.005;this.stepBus.gain.setTargetAtTime(db(-6)*vol,t,.01);this.foleyBus.gain.setTargetAtTime(db(-5)*Math.min(1,.4+.6*vol),t,.01);this.step(t,!!run)}
 setDownMode(mode){if(this.downed){this.downed.mode=mode;this.emit('down')}}
 revive(){this.downed=null;this.F=Math.max(this.F,.5);this.recovering=true;this.nextBreath=this.now()+.3;this.emit('down')}
 stopAll(){this.mode='idle';this.downed=null;this.injured=false;this.recovering=false;this.F=0;const nw=this.now();const m=this.mouthLast;if(m)try{m.g.gain.setTargetAtTime(0,nw,.03)}catch(e){};
  // v16: обрываем и уже запланированные крики/стоны (иначе добитый ещё ~0,25 с — длина упреждения — «кричал»)
  for(const v of (this.vq||[])){try{v.g.gain.cancelScheduledValues(nw);v.g.gain.setTargetAtTime(0,nw,.03);v.s.stop(nw+.15)}catch(e){}}this.vq=[];this.emit('mode')}
 // ---------- планировщик (вызывать часто; работает и в OfflineAudioContext) ----------
 update(now){now=now??this.now();const dt=Math.min(.5,Math.max(0,now-(this.lastU||now)));this.lastU=now;const hz=now+this.LA;
  // усталость: растёт при беге (~30 с до максимума), спадает экспоненциально (~15 с)
  if(this.mode==='run'){this.runT+=dt;this.F=Math.min(1,this.F+dt/30)}else if(!this.downed&&!this.injured){this.F*=Math.exp(-dt/15)}
  const wTarget=this.mode==='run'?db(-40):this.mode==='walk'?db(-48):db(-52);this.windG.gain.setTargetAtTime(wTarget,this.now(),.6);
  if(this.downed){while(this.downed&&this.downed.next<hz)this.downed.next=this.downStep(this.downed.next);return}
  if(this.mode!=='idle'&&!this.extSteps)while(this.nextStep<hz){this.step(this.nextStep);this.nextStep+=this.stepInterval()}
  if(this.mode!=='run'){if(this.injured)while(this.nextBreath<hz)this.nextBreath=this.injBreath(this.nextBreath);
   else if(this.recovering){while(this.nextBreath<hz&&this.recovering)this.nextBreath=this.recBreath(this.nextBreath)}}}
 stepInterval(){const S=this.S;if(this.injured&&this.mode==='walk'){const base=60/GAIT.limp.spm;return base*(this.stepN%2?1.32:.68)*rnd(.97,1.03)}
  const g=GAIT[this.mode];return 60/(g.spm*S.stepRate)*(1+rnd(-g.jit,g.jit))}
 step(t,runO){if(this.log)this.log.push(['s',+t.toFixed(3)]);const B=this.B,S=this.S,run=runO!==undefined?runO:this.mode==='run',L=this.stepN%2===0;this.stepN++;
  // асимметрия походки: левая/правая нога звучат чуть по-разному
  const lr=L?{g:.92,r:.985}:{g:1,r:1.01};const ld=Math.sqrt(S.load);
  const sb=run?B.step_run:B.step_walk;
  // ткань: мах ноги перед касанием -> шорох на ~80–120 мс раньше удара
  this.play((run?B.cloth_run:B.cloth_walk).rand(),t-rnd(.06,.11),{gain:(run?.85:.7)*S.cloth*rnd(.75,1.1),rate:rnd(.94,1.06)});
  this.play(sb.rand(),t,{gain:(run?1:.8)*lr.g*ld*rnd(.8,1.1),rate:S.stepRate*lr.r*rnd(.95,1.04)/Math.pow(S.load,.15),bus:'step'});
  this.thump(t+.004,(run?.32:.16)*S.thump*rnd(.8,1.15));
  // снаряжение: подпрыгивает после опоры (центр масс внизу через ~40–70 мс)
  const pR=run?.95:.5;if(Math.random()<pR)this.play(B.rattle.rand(),t+rnd(.035,.075),{gain:(run?.9:.55)*S.rattle*rnd(.7,1.1),rate:rnd(.94,1.07)});
  if(run&&Math.random()<.45)this.play(B.rattle.rand(),t+60/GAIT.run.spm*.5,{gain:.4*S.rattle*rnd(.6,1),rate:rnd(.95,1.08)});
  if(Math.random()<(run?.45:.18))this.play(B.rifle.rand(),t+rnd(.04,.09),{gain:(run?.55:.35)*S.rifle*rnd(.7,1.1),rate:rnd(.96,1.04)});
  this.rub(t+.015,run?db(-30):db(-38));
  // дыхание на бегу: локомоторно-дыхательная связь 2:1 (фаза дыхания на каждые 2 шага ≈ 42 вдоха/мин)
  if(run&&this.stepN%2===0&&this.runT>.8){const g=clamp(.25+this.runT/10,0,1)*(.6+.4*this.F);this.mouth(this.bank('breath').next(),t+.02,{gain:g,effort:clamp(.75+.25*this.F,0,1)})}
  // хромота с ранением: стон на шаге на раненую ногу
  if(this.injured&&!L&&Math.random()<.22)this.mouth(this.bank('yelp').rand(),t+.05,{gain:.55,effort:.45})}
 recBreath(t){// восстановление: частота 12 + 38·F вдохов/мин, вдох короче выдоха
  const F=this.F;if(F<.07){const b=this.bank('breath').longest();this.mouth(b,t,{gain:.45,effort:.75});this.recovering=false;this.emit('recover');return t+3}
  this.ph=(this.ph||0)+1;const insp=this.ph%2,br=12+38*F,T=60/br,want=T*(insp?.42:.58)*.9,ph=this.bank('breath').fit(want);
  this.mouth(ph,t,{gain:.3+.7*F,effort:clamp(.65+.35*F,0,1),rate:rnd(.98,1.02)});
  return t+Math.max(T*(insp?.42:.58),ph.duration*.85)*rnd(.92,1.08)}
 injBreath(t){// тяжёлое ранение: тахипноэ 26–34/мин, неровное; стон на выдохе каждые 3–7 вдохов
  this.injN++;const T=60/rnd(26,34),bk=this.bank('inj');
  if(this.injN%Math.floor(rnd(3,8))===0){const m=this.bank('moan').fit(T*.8,.6);this.mouth(m,t,{gain:rnd(.45,.7),effort:rnd(.45,.7)});return t+Math.min(m.duration,T*.9)+rnd(.05,.2)}
  if(Math.random()<.05){const y=this.bank('yelp').rand();this.mouth(y,t,{gain:.5,effort:.5});return t+y.duration+.3}
  const b=bk.fit(T*.45);this.mouth(b,t,{gain:rnd(.6,1),effort:.8,rate:rnd(.97,1.03)});
  if(Math.random()<.12)this.play(this.B.swish.rand(),t+rnd(0,.3),{gain:.25*this.S.cloth});
  return t+Math.max(T*.5,Math.min(b.duration*.85,T*.7))*rnd(.85,1.15)}
 downStep(t){const D=this.downed,B=this.B,el=t-D.t0;D.k++;
  if(D.fall){D.fall=false;// удар/вскрик -> падение тела -> автомат бьётся о землю -> снаряжение
   this.play(B.swish.rand(),t+.05,{gain:.7*this.S.cloth});
   // мгновенная смерть (мозг, ствол, сердце) или обморок от кровопотери: голоса нет,
   // иногда — непроизвольный выдох воздуха из лёгких при ударе о землю
   // паралич дыхания (C1–C4): крика нет — только выдох при падении, дальше агональные вдохи
   if(D.mode==='unc'){const b=this.bank('inj').shortest();this.mouth(b,t+rnd(.5,.8),{gain:.3,effort:.3});return t+rnd(2.5,4)}
   if(D.mode==='dead'){if(Math.random()<.35){const b=this.bank('inj').shortest();this.mouth(b,t+rnd(.55,.9),{gain:.35,effort:.35})}return t+1e6}
   const v=this.shortScream();this.mouth(v,t+.08,{gain:D.mode==='choke'?.8:1.05,effort:D.mode==='choke'?.75:1});if(D.mode==='choke'){this.choke(v.duration+.2);this.gurgle(t+.1,1,v.duration)}
   if(D.ext)return t+.08+v.duration+rnd(.3,.6);
   const tf=t+rnd(.35,.55);this.play(B.bodyfall.rand(),tf,{gain:1*Math.sqrt(this.S.load)});this.thump(tf,.9*this.S.thump);
   this.play(B.rifle.rand(),tf+rnd(.05,.15),{gain:1.0*this.S.rifle});this.play(B.rattle.rand(),tf+.03,{gain:.9*this.S.rattle});
   if(Math.random()<.5)this.play(B.magdrop.rand(),tf+rnd(.2,.4),{gain:.5});
   return t+.08+v.duration+rnd(.3,.6)}
  if(D.mode==='dead')return t+1e6;
  // v14: без сознания — агональное дыхание: редкие судорожные вдохи, потом тишина
  if(D.mode==='unc'){D.uk=(D.uk||0)+1;if(D.uk>14||Math.random()<.08)return t+1e6;const b=this.bank('inj').shortest();this.mouth(b,t,{gain:.28*Math.pow(.9,D.uk),effort:.3,rate:rnd(.9,.97)});
   if(Math.random()<.35)this.gurgle(t+.05,.35*Math.pow(.9,D.uk),.6);return t+rnd(3.5,7)+D.uk*.4}
  // v14: ранение шеи — кровь в горле: крик захлёбывается, хрип, кашель кровью
  if(D.mode==='choke'){const g=Math.max(.35,1-el/90);
   if(Math.random()<.55){const v=Math.random()<.5?this.bank('yelp').rand():this.bank('moan').rand();this.mouth(v,t,{gain:.75*g,effort:.55*g+.2,rate:rnd(.94,1)});this.choke(v.duration);this.gurgle(t,.9*g,v.duration+.2);return t+v.duration+rnd(.4,1.1)}
   const b=this.bank('inj').next();this.mouth(b,t,{gain:.6*g,effort:.6});this.choke(b.duration);this.gurgle(t+.02,1.1*g,Math.max(.5,b.duration));return t+Math.max(.6,b.duration)+rnd(.2,.7)}
  // стадии: 0–12 с острая боль (крики), 12–35 с стоны+дыхание, 35 с+ шок (слабые «аай», редкое дыхание)
  let st=D.mode==='scream'?0:D.mode==='quiet'?2:(el<12?0:el<35?1:2);D.stage=st;
  if(Math.random()<(st===0?.12:.07)){const tt=t+rnd(0,.3);this.play(Math.random()<.6?B.swish.rand():B.rattle.rand(),tt,{gain:(st===0?.5:.3)*this.S.cloth,rate:rnd(.9,1.05)})}
  const br=this.bank('breath'),inj=this.bank('inj');
  if(st===0){// крику нужен вдох: судорожный вдох -> крик
   const g=inj.next();this.mouth(g,t,{gain:.8,effort:.9});const ts=t+Math.min(g.duration,.45);
   const r=Math.random();const v=r<.6?this.bank('scream').rand():this.bank('yelp').rand();
   this.mouth(v,ts,{gain:r<.6?1:.9,effort:1});return ts+v.duration+rnd(.35,1.1)}
  if(st===1){if(D.k%Math.floor(rnd(2,4))===0){const m=this.bank('moan').rand();this.mouth(m,t,{gain:.75,effort:rnd(.6,.8)});return t+m.duration+rnd(.3,.7)}
   if(Math.random()<.1){const v=this.bank('scream').rand();this.mouth(v,t,{gain:.8,effort:.85});return t+v.duration+.5}
   const b=inj.next();this.mouth(b,t,{gain:.75,effort:.8});return t+Math.max(60/rnd(24,30)*.5,b.duration*.85)}
  // шок: «аай… аай» на малом усилии, дыхание реже
  const r=Math.random();
  if(r<.45){const m=Math.random()<.6?this.bank('moan').rand():this.bank('yelp').rand();this.mouth(m,t,{gain:.5,effort:rnd(.3,.5),rate:rnd(.96,1)});return t+m.duration+rnd(.8,2.2)}
  const b=inj.next();this.mouth(b,t,{gain:.45,effort:.55});return t+Math.max(60/rnd(12,18)*.5,b.duration)+rnd(.1,.6)}
}

root.GSoldierSFX = { SoldierSFX, SOLDIERS, loadBanks: (ctx) => SoldierSFX.loadBanks(ctx, SND) };
})(typeof self !== 'undefined' ? self : this);
