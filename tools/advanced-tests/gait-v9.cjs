const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const ctx={console};vm.createContext(ctx);for(const f of ['gait-data','animator'])vm.runInContext(fs.readFileSync(__dirname+'/../../js/advanced/'+f+'.js','utf8'),ctx);
const A=ctx.GAnimator,D=ctx.GGaitData,rows=[];assert(D?.version===9);
for(const[name,g]of Object.entries(D.gaits)){assert(g.cycles>0&&g.leg>.7&&g.leg<1.05);for(const[ch,values]of Object.entries(g.ch)){assert(values.length===96&&values.every(Number.isFinite));if(ch!=='SX'){const a=A.sampleTable(values,1-1e-7),b=A.sampleTable(values,1e-7);assert(Math.abs(a-b)<1e-4,ch+' periodic seam');}}rows.push({name,cycles:g.cycles,freq:g.freq,speed:g.speed,stance:g.stance,channels:Object.keys(g.ch).length});}
let maxCadenceStep=0,prev=null;
for(let i=0;i<=1000;i++){const speed=i/200,w=A.gaitWeights(speed),rate=A.cadence(speed);assert(w.every(k=>k>=0&&k<=1));assert(Math.abs(w.reduce((a,b)=>a+b,0)-1)<1e-12);assert(rate>=.48&&rate<=1.95);if(prev!==null)maxCadenceStep=Math.max(maxCadenceStep,Math.abs(rate-prev));prev=rate;
 for(let j=0;j<100;j++){let p=j/100;for(const ch of ['PY','TP','PT','SX','SY','SF','EF'])assert(Number.isFinite(A.gaitSample(ch,p,w,ch==='SX'||ch==='SY')));}
}
assert(maxCadenceStep<.01,'no cadence jump at gait boundary');assert(A.cadence(4.55)>A.cadence(1.35));
const out={pass:true,rows,speedSamples:1001,phaseSamples:100,maxCadenceStep};fs.writeFileSync(__dirname+'/gait-v9.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
