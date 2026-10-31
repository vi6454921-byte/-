const G=__GAME, S=G.state, T=THREE;
S.paused=true;
const s=G.squad.find((q,i)=>i!==S.activeIdx&&!q.dead), c=s.ctrl;
const wp=(n)=>s.char.bone(n).getWorldPosition(new T.Vector3());
const p0=c.pos.clone();
const v=4.55, mode="sprint";
s.motion=null; s._posed=false; c._facingTarget=undefined;
const dir=new T.Vector3(0,0,-1), dt=1/60, A=GAnimator;
c.pos.copy(p0); c.yaw=0; s.idleYaw=0; c.grounded=true; c.sprint=mode==='sprint'?1:0; c.sprintWant=mode==='sprint'; c.crouch=0; c.crouchMove=0;
const gy=p0.y, tr=[];
for(let i=0;i<170;i++){ const k=Math.min(1,i/30); c.vel.copy(dir).multiplyScalar(v*k); c.speed=v*k; c.pos.addScaledVector(dir,v*k*dt); if(c._distancePhase) c.stepPhase=(c.stepPhase||0)+v*k*dt/Math.max(0.42,A.strideLength(c));
  A.pose(s,dt,false,i*dt); s.char.root.updateMatrixWorld(true);
  if(i>=110){ const st=s.motion, fe=st.feet, D=st.debug||{}; const row=[(st.phase%1).toFixed(2)+' sp:'+(D.special||'-')+' run'+(st.run||0).toFixed(2)];
    for(const S of ['L','R']){ const f=fe[S]; row.push(S+':p'+(f.p).toFixed(2)+(f.swing?' SW':' st')+(f.recovery?' REC':'')+(f.holdUntilWrap?' HOLD':'')+(f.earlyOff!==undefined?' EO'+f.earlyOff.toFixed(2):'')+' h'+(wp('ankle'+S).y-gy).toFixed(2)+' z'+(wp('ankle'+S).z-c.pos.z).toFixed(2)+' lz'+(f.locked.z-c.pos.z).toFixed(2)+' ez'+(f.end.z-c.pos.z).toFixed(2)+' tz'+(D.feet&&D.feet[S]?(D.feet[S].target[2]-c.pos.z).toFixed(2):'?')+' ty'+(D.feet&&D.feet[S]?(D.feet[S].target[1]-gy).toFixed(2):'?')); }
    tr.push(row.join(' | ')); }
}
c.pos.copy(p0); c.vel.set(0,0,0); c.speed=0; s.motion=null;
return {GS:s.motion, tr};
