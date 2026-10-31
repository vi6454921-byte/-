#!/usr/bin/env python3
"""CMU joint-space retarget channels. Root translation remains controller-owned.
Step-stool/run-jump recordings are adapted to hand-supported traversal, not
claimed as captured military vaults. Offline rebuild requires numpy only.
"""
from pathlib import Path
import json,hashlib,numpy as np
B=Path(__file__).resolve().parent;R=B.parent.parent
lib={'__file__':str(B/'build-gaits.py')}
exec((B/'build-gaits.py').read_text().split('reports=[]')[0].replace('skeleton(clip[:2])',"skeleton(clip.split('_')[0])"),lib)
windows={'jump':('13_11',150,355),'stepOver':('40_07',130,350),'speedVault':('127_25',42,210),'mantle':('40_07',1260,1550),'getUpFront':('140_01',155,660),'getUpSide':('140_03',300,820),'getUpBack':('140_08',155,780)}
result={'version':12,'actions':{}};manifest={'source':'http://mocap.cs.cmu.edu/','fps':120,'actions':{},'files':[]}
cache={}
for name,(clip,a,b) in windows.items():
 if clip not in cache:cache[clip]=lib['fk'](clip)
 P,Q,bones=cache[clip];leg=bones['rfemur']['len']+bones['rtibia']['len'];end=min(len(Q)-1,b-1)
 # Stable heading from the source's root; no facing flips when torso is prone.
 forward=Q[end]@np.array([0.,0.,1.]);forward[1]=0;forward/=np.linalg.norm(forward)
 right=np.cross(forward,[0,1,0]);hip=P['rhipjoint'][end]-P['lhipjoint'][end]
 if hip@right<0:right=-right
 back=np.cross(right,[0,1,0]);basis=np.array([right,[0,1,0],back]).T
 floor=np.percentile(np.r_[P['ltoes'][a:b,1],P['rtoes'][a:b,1]],3)
 root=P['root'];ch={};index=np.linspace(a,b-1,160)
 def put(key,v):
  if v.ndim==1:ch[key]=np.round(np.interp(index,np.arange(len(v)),lib['gaussian_filter1d'](v,1.5)),6).tolist()
  else:
   for k,ax in enumerate('XYZ'):put(key+ax,v[:,k])
 put('H',(root[:,1]-floor)/leg)
 put('ROOT',(root-root[end])@basis/leg)
 for short,j in {'FR':'rtibia','FL':'ltibia','KR':'rfemur','KL':'lfemur','HR':'rradius','HL':'lradius','ER':'rhumerus','EL':'lhumerus'}.items():put(short,(P[j]-root)@basis/leg)
 for short,lo,hi in [('PE','root','lowerback'),('SP','lowerback','upperback'),('CH','upperback','thorax'),('NE','thorax','head')]:
  v=(P[hi]-P[lo])@basis;v/=np.linalg.norm(v,axis=1)[:,None];put(short,v)
 x=(P['rhipjoint']-P['lhipjoint'])@basis;x/=np.linalg.norm(x,axis=1)[:,None];put('RIGHT',x)
 result['actions'][name]={'clip':clip,'frames':[a,b],'duration':(b-a)/120,'leg':leg,'ch':ch}
 manifest['actions'][name]={k:v for k,v in result['actions'][name].items() if k!='ch'}
files=sorted({clip+'.amc'for clip,_,_ in windows.values()}|{clip.split('_')[0]+'.asf'for clip,_,_ in windows.values()})
for f in files:manifest['files'].append({'file':f,'url':f"http://mocap.cs.cmu.edu/subjects/{f.split('_')[0].split('.')[0]}/{f}",'sha256':hashlib.sha256((B/'source'/f).read_bytes()).hexdigest()})
manifest['retarget']='CMU positional channels, phase-warped to KCC physics and ground/hand contacts. 40_07 stepstool and 127_25 jump-over adapted to 3 traversal styles; not direct military vault recordings.'
(R/'js/advanced/traversal-data.js').write_text('/* Generated from CMU ASF/AMC by tools/mocap/build-traversal.py. See traversal-manifest.json. */\nglobalThis.GTraversalData='+json.dumps(result,separators=(',',':'))+';\n')
(B/'traversal-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('Built',list(result['actions']))
