const G=window.__GAME, sq=G.squad, C=G._C, L=window.AEGIS_LOOT;
const a=sq.find(s=>s.active);
const v=sq.find(s=>s.team!==a.team&&!s.dead&&s.npc);
G.dmg.kill ? G.dmg.kill(v,'тест') : null;
for(let i=0;i<30;i++){G.step(4,1/60); await new Promise(r=>setTimeout(r,0));}
// teleport player next to body
const hp=new THREE.Vector3(); v.char.bone('hips').getWorldPosition(hp);
a.ctrl.pos.set(hp.x+0.8,a.ctrl.pos.y,hp.z); a.ctrl.pos.y=G.world.heightAt?G.world.heightAt(hp.x+0.8,hp.z):a.ctrl.pos.y;
G.step(5,1/60);
const ref=L.near();
const out={dead:v.dead, ref:ref&&ref.kind, title:L.title(ref)};
const show=(arr)=>arr.map(x=>x?(L.view(x)||{}).title+' | '+(L.view(x)||{}).sub:'-');
out.self0=show(L.items('self'));
out.body0=show(L.items('box',ref));
// take the body's grenade (slot 4) to self auto
out.m1=L.move(ref,'box',3,'self',-1);
// take body gun → self (replaces same kind)
out.m2=L.move(ref,'box',0,'self',-1);
out.self1=show(L.items('self'));
out.body1=show(L.items('box',ref));
// drop self slot 2 to ground
out.m3=L.move(ref,'self',1,'ground',-1);
out.drops=C.S.drops.length;
out.self2=show(L.items('self'));
out.gun=a.inv&&a.inv.primary?a.inv.primary.id:null;
out.st=a.ctrl.weaponState?a.ctrl.weaponState():null;
return out;
