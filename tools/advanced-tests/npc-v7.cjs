const {environment}=require('./active-body-fixture.cjs'),fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
(async()=>{const {ctx}=await environment();for(const p of ['js/polygon/02_util.js','js/polygon/15_rig.js','js/advanced/animator.js'])vm.runInContext(fs.readFileSync(__dirname+'/../../'+p,'utf8'),ctx);const rows=[];
for(const dt of [1/120,1/60,1/30,1/20])for(const alert of [false,true])for(const wrap of [false,true]){
 const c={yaw:wrap?Math.PI-.02:0},initial=c.yaw,goal=wrap?-Math.PI+.3:Math.PI*.9;let maxSpeed=0,maxAcceleration=0,previous=0,finite=true;
 for(let i=0;i<4/dt;i++){const before=c.yaw;ctx.GAnimator.turnController(c,goal,dt,alert);const v=(c.yaw-before)/dt;maxSpeed=Math.max(maxSpeed,Math.abs(v));maxAcceleration=Math.max(maxAcceleration,Math.abs(v-previous)/dt);previous=v;finite&&=Number.isFinite(c.yaw);}
 const error=Math.abs(Math.atan2(Math.sin(goal-c.yaw),Math.cos(goal-c.yaw)));assert(finite&&error<.002);assert(maxSpeed<=(alert?4.2:3)+.001);if(wrap)assert(Math.abs(c.yaw-initial)<.4,'angle wrapping takes the short arc');rows.push({dt,alert,wrap,maxSpeed,maxAcceleration,error});
}
// Local steering must keep exactly the same world velocity when facing changes.
for(const old of [-3,-1,0,1,3])for(const delta of [-.3,-.05,.05,.3]){const x=.6,y=-.8,cs=Math.cos(delta),sn=Math.sin(delta),nx=x*cs-y*sn,ny=x*sn+y*cs;
 const oldX=x*Math.cos(old)+y*Math.sin(old),oldZ=-x*Math.sin(old)+y*Math.cos(old),yaw=old+delta;
 assert(Math.hypot(nx*Math.cos(yaw)+ny*Math.sin(yaw)-oldX,-nx*Math.sin(yaw)+ny*Math.cos(yaw)-oldZ)<1e-12);
}
fs.writeFileSync(__dirname+'/npc-v7-core.json',JSON.stringify({pass:true,turnCases:rows.length,steeringFrameCases:20,rows},null,2));console.log(JSON.stringify({pass:true,turnCases:rows.length,steeringFrameCases:20}));
})().catch(e=>{console.error(e);process.exit(1)});
