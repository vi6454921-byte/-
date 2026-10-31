const {environment}=require('./active-body-fixture.cjs');
(async()=>{const {ctx,T}=await environment(),R=ctx.RAPIER,rows=[];
for(const axis of [3,4,5])for(const angle of [0,.5,1,-1]){
 const w=new R.World({x:0,y:-9.81,z:0});w.numSolverIterations=16;
 const pa=w.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0,2,0));
 const ch=w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0,2,0));
 w.createCollider(R.ColliderDesc.capsule(.2,.07).setTranslation(0,-.27,0).setMass(8),ch);
 const j=w.createImpulseJoint(R.JointData.generic({x:0,y:0,z:0},{x:0,y:0,z:0},{x:1,y:0,z:0},7),pa,ch,true);
 for(let i=3;i<6;i++){j.rawSet.jointConfigureMotorModel(j.handle,i,1);j.rawSet.jointConfigureMotor(j.handle,i,i===axis?angle:0,0,500,50)}
 for(let i=0;i<600;i++)w.step();const q=new T.Quaternion().copy(ch.rotation()),e=new T.Euler().setFromQuaternion(q,'XYZ');
 rows.push({axis,target:angle,q:q.toArray(),euler:e.toArray().slice(0,3),position:ch.translation(),angularVelocity:ch.angvel()});w.free();
}
console.log(JSON.stringify(rows));
})().catch(e=>{console.error(e);process.exit(1)});
