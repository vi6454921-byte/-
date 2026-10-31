#!/usr/bin/env python3
"""Reproducible CMU capture retarget tables. No root/capsule motion is baked in.
Crawling source is quadrupedal: explicitly retargeted to low prone in-game.
Requires numpy; original ASF/AMC files stay beside the v9 source records.
"""
from pathlib import Path
import json,re,hashlib
import numpy as np
BASE=Path(__file__).resolve().parent;ROOT=BASE.parent.parent
original=(BASE/'build-gaits.py').read_text()
lib={'__file__':str(BASE/'build-gaits.py')}
exec(original.split('reports=[]')[0].replace('skeleton(clip[:2])',"skeleton(clip.split('_')[0])"),lib)
fk=lib['fk'];smooth=lib['gaussian_filter1d'];FPS=120
# Straight windows, chosen from the source's root heading/speed rather than
# averaging turns and starts into a cyclic gait.
def steady(clip,length=600):
 P,R,_=fk(clip);yaw=np.unwrap(np.arctan2(R[:,0,2],R[:,2,2]));vel=np.linalg.norm(np.gradient(P['root'][:,[0,2]],axis=0),axis=1)*FPS
 candidates=[]
 for a in range(90,len(R)-length-60,30):
  yy=yaw[a:a+length];vv=vel[a:a+length]
  if np.median(vv)>.25:candidates.append((np.std(yy)*4+np.std(vv)/max(.2,np.mean(vv)),a))
 if not candidates:raise RuntimeError('No steady window '+clip)
 a=min(candidates)[1];return a,a+length
windows={c:steady(c) for c in ['136_09','136_10','17_03']}
code=original.replace("GROUPS={'walk':", "GROUPS={'walk':")
code=re.sub(r"GROUPS=\{.*?\}\n", "GROUPS={'crouch':['136_09','136_10'],'sneak':['17_03']}\n",code,count=1)
code=code.replace('skeleton(clip[:2])',"skeleton(clip.split('_')[0])").replace('clip[:2]',"clip.split('_')[0]")
code=code.replace('P,R,bones=fk(clip);count=len(R);', "P,R,bones=fk(clip);wa,wb=WINDOWS[clip];P={k:v[wa:wb] for k,v in P.items()};R=R[wa:wb];count=len(R);")
code=code.replace('distance=FPS*.48,prominence=.22','distance=FPS*.55,prominence=.10').replace('if not .55<dur<1.65','if not .65<dur<3.5').replace("'version':9","'version':11")
# Use slow-walk contact search for crouch/stealth too.
code=code.replace(".9 if group=='walk'else 1.3", ".65")
code=code.replace("ROOT/'js/advanced/gait-data.js'","BASE/'special-gaits-generated.js'").replace("BASE/'manifest.json'","BASE/'special-cyclic-manifest.json'")
exec(code,{'__file__':str(BASE/'build-gaits.py'),'WINDOWS':windows})
generated=(BASE/'special-gaits-generated.js').read_text();cyclic=json.loads(generated.split('r.GGaitData=')[1].split(';})')[0]);(BASE/'special-gaits-generated.js').unlink()
# Root-local positions and measured supporting intervals for a non-looping action.
def extract(clip,a,b,loop=False):
 P,R,B=fk(clip);n=len(R);a=max(0,a);b=min(n,b);root=P['root'];leg=B['rfemur']['len']+B['rtibia']['len']
 fwd=np.einsum('nij,j->ni',R,np.array([0.,0.,1.]));fwd[:,1]=0;fwd/=np.linalg.norm(fwd,axis=1)[:,None]
 delta=root[min(n-1,a+60)]-root[a];delta[1]=0
 if np.dot(delta,fwd[a])<0:fwd=-fwd
 right=np.cross(fwd,np.array([0.,1.,0.]));hip=P['rhipjoint']-P['lhipjoint']
 if np.mean(np.sum(hip[a:b]*right[a:b],axis=1))<0:right=-right
 floor=float(np.percentile(np.concatenate([P['ltoes'][a:b,1],P['rtoes'][a:b,1]]),3))
 yaw=np.unwrap(np.arctan2(fwd[:,0],fwd[:,2]));torso=P['thorax']-root;shoulder=P['rclavicle']-P['lclavicle']
 channels={'PT':np.arctan2(np.sum(hip*fwd,axis=1),np.sum(hip*right,axis=1)),'TT':np.arctan2(np.sum(shoulder*fwd,axis=1),np.sum(shoulder*right,axis=1)),'PY':(root[:,1]-np.mean(root[a:b,1]))/leg,'TP':np.arctan2(np.sum(torso*fwd,axis=1),torso[:,1]),'YAW':yaw-yaw[a]}
 for S,lo in [('R','r'),('L','l')]:
  for tag,joint in [('F',lo+'tibia'),('H',lo+'radius')]:
   delta=P[joint]-root
   channels[tag+'X'+S]=np.sum(delta*right,axis=1)/leg
   channels[tag+'Z'+S]=-np.sum(delta*fwd,axis=1)/leg
   channels[tag+'Y'+S]=(P[joint][:,1]-floor)/leg
  ankle=P[lo+'tibia'];foot=P[lo+'foot'];v=np.linalg.norm(np.gradient(ankle,axis=0),axis=1)*FPS
  low=np.percentile(ankle[a:b,1],10);contact=(ankle[:,1]<low+.055)&(v<max(.35,np.median(v[a:b])*.65))
  channels['C'+S]=smooth(contact.astype(float),2)
  toes=P[lo+'toes']-foot;channels['FP'+S]=np.arctan2(toes[:,1],np.sum(toes*fwd,axis=1))
 N=128 if not loop else 96;index=np.linspace(a,b-1,N,endpoint=not loop);ch={}
 for k,v in channels.items():
  values=np.interp(index,np.arange(n),smooth(v,1.2));
  if loop and k not in ['CR','CL','YAW']:
   # Remove only seam mismatch; retain the captured asymmetric poses.
   mismatch=values[-1]-values[0];values-=np.linspace(-.5,.5,N)*mismatch
  ch[k]=np.round(values,6).tolist()
 return {'clip':clip,'frames':[a,b],'duration':round((b-a)/FPS,6),'leg':round(leg,6),'loop':loop,'yaw':round(float(yaw[b-1]-yaw[a]),6),'ch':ch}
# Crop the turn around peak measured yaw velocity, keeping grounded steps.
def turn_window(clip,span):
 P,R,B=fk(clip);yaw=np.unwrap(np.arctan2(R[:,0,2],R[:,2,2]));rate=smooth(np.abs(np.gradient(yaw)),8)
 rate[:75]=0;rate[-75:]=0;peak=int(np.argmax(rate));half=int(span*FPS/2);return max(0,peak-half),min(len(R),peak+half)
actions={}
for name,clip,span in [('turn90L','16_17',1.7),('turn90R','16_19',1.7),('turn180','36_02',2.1)]:
 a,b=turn_window(clip,span);actions[name]=extract(clip,a,b)
for name,clip in [('stopWalk','16_33'),('stopRun','16_57')]:
 P,R,B=fk(clip);v=smooth(np.linalg.norm(np.gradient(P['root'][:,[0,2]],axis=0),axis=1)*FPS,4);peak=int(np.argmax(v));end=next((i for i in range(peak+1,len(v))if v[i]<.12),len(v)-1)
 actions[name]=extract(clip,max(0,end-110),min(len(v),end+45))
# One complete contralateral crawl cycle from the steady middle of 111_03.
P,R,B=fk('111_03');z=(P['rtibia']-P['root'])[:,2];peaks,_=lib['find_peaks'](smooth(z,3),distance=100,prominence=.07)
pairs=[(int(a),int(b))for a,b in zip(peaks[:-1],peaks[1:])if a>180 and b<1300 and 110<b-a<420]
if not pairs:raise RuntimeError('No crawl cycle')
a,b=min(pairs,key=lambda x:abs(x[0]-650));actions['crawl']=extract('111_03',a,b,True)
files=sorted(set([v['clip']+'.amc'for v in actions.values()]+[v['clip'].split('_')[0]+'.asf'for v in actions.values()]+[c+'.amc'for c in windows]+[c.split('_')[0]+'.asf'for c in windows]))
manifest={'source':'http://mocap.cs.cmu.edu/','version':11,'cyclicWindows':windows,'actions':{k:{a:b for a,b in v.items()if a!='ch'}for k,v in actions.items()},'files':[{'file':f,'url':'http://mocap.cs.cmu.edu/subjects/'+f.split('_')[0].split('.')[0]+'/'+f,'sha256':hashlib.sha256((BASE/'source'/f).read_bytes()).hexdigest()}for f in files], 'crawlRetarget':'111_03 is quadrupedal crawling, not a military prone capture. Timing/asymmetry are retargeted into a low prone body with terrain IK; no claim of direct military mocap.'}
data={'version':11,'gaits':cyclic['gaits'],'actions':actions}
(ROOT/'js/advanced/special-motion-data.js').write_text('/* CMU capture-derived. Generated by tools/mocap/build-specials.py. Crawl is a low-prone adaptation, not an original army-crawl capture. */\n(function(r){r.GSpecialMotion='+json.dumps(data,separators=(',',':'))+';if(r.GGaitData)Object.assign(r.GGaitData.gaits,r.GSpecialMotion.gaits);})(globalThis);\n')
(BASE/'special-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'windows':windows,'actions':manifest['actions']},indent=2))
