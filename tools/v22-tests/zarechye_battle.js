// Заречье: 40 с боя — боты не застревают у жердевой ограды, перелезают её сами
const G=__GAME, S=G.state, w=G.world, P=GPhysics.get(w), sim=P.sim, T=THREE;
S.paused=false;
const rails=[]; sim.forEachCollider(col=>{ if(P.rungs.has(col.handle)){ const t=col.translation(); rails.push([t.x,t.z]); } });
const nearRail=(x,z)=>rails.some(r=>Math.hypot(r[0]-x,r[1]-z)<2.2);
const st0=GStumble.stats();
/* v23: причины спотыканий (попадания, взрывы, жёсткое приземление, низкая помеха) — по журналу баланса бойцов */
const clk0=new Map(G.squad.map(s=>[s,s._balance?s._balance.clock:-1e9]));
const last=new Map(); const stuck=new Map(); let samples=0, moving=0, nearFenceSlow=0, vaultingNPC=0;
const t0=S.time;
for(let k=0;k<40;k++){
  G.step(30,1/30);
  await new Promise(r=>setTimeout(r,0));
  for(const s of G.squad){ if(s.dead||s.active) continue; const c=s.ctrl; const p=last.get(s); last.set(s,{x:c.pos.x,z:c.pos.z});
    if(!p) continue; samples++; const d=Math.hypot(c.pos.x-p.x,c.pos.z-p.z); const g=s.battle&&s.battle.goal; const want=g&&Number.isFinite(g.x)&&Math.hypot(g.x-c.pos.x,g.z-c.pos.z)>2.5;
    if(d>0.3) moving++;
    if(c.vault) vaultingNPC++;
    if(want&&d<0.15&&nearRail(c.pos.x,c.pos.z)){ nearFenceSlow++; stuck.set(s.key,(stuck.get(s.key)||0)+1); }
  }
}
const st1=GStumble.stats();
const TR=new Set(['hit','leg-hit','impulse','hard-landing','trip-obstacle','external','manual']), tripsBy={};
for(const s of G.squad){ const b=s._balance; if(!b) continue; const c0=clk0.has(s)?clk0.get(s):-1e9; for(const e of b.events) if(e.time>c0&&TR.has(e.name)) tripsBy[e.name]=(tripsBy[e.name]||0)+1; }
return {simT:+(S.time-t0).toFixed(1), samples, movingShare:+(moving/samples).toFixed(2), vaultsNPC: st1.vaults-st0.vaults, trips: st1.triggered-st0.triggered, tripsBy, nearFenceStuckSamples: nearFenceSlow, stuckBy:[...stuck.entries()].filter(e=>e[1]>=4), alive:G.squad.filter(s=>!s.dead).length};
