#!/usr/bin/env python3
"""CMU ASF/AMC -> phase-aligned, dimensionless locomotion channels.
Offline rebuild: python tools/mocap/build-gaits.py (numpy required).
ASF column-vector convention: parent * axis * DOF * inverse(axis).
Raw coordinates: 1 unit = 1/.45 inches. CMU clips are sampled at 120Hz.
"""
from pathlib import Path
import json,re,hashlib
import numpy as np
def gaussian_filter1d(v,sigma,mode='edge'):
 radius=max(2,int(3*sigma));x=np.arange(-radius,radius+1);w=np.exp(-x*x/(2*sigma*sigma));w/=w.sum()
 return np.convolve(np.pad(v,radius,mode='wrap' if mode=='wrap'else 'edge'),w,mode='valid')
def savgol_filter(v,window,order):return gaussian_filter1d(v,1.1)
def find_peaks(v,distance,prominence):
 candidates=[i for i in range(2,len(v)-2)if v[i]>v[i-1]and v[i]>=v[i+1]and v[i]-min(v[max(0,i-int(distance)):min(len(v),i+int(distance))])>prominence]
 chosen=[]
 for i in sorted(candidates,key=lambda i:-v[i]):
  if all(abs(i-j)>=distance for j in chosen):chosen.append(i)
 return np.array(sorted(chosen)),None
BASE=Path(__file__).resolve().parent; ROOT=BASE.parent.parent; FPS=120; SCALE=.0254/.45; N=96
GROUPS={'walk':['35_01','35_02','35_03','16_15','16_16','07_01','07_02'], 'jog':['16_35','16_36'], 'run':['35_17','35_18','35_19','09_01','09_02']}
def rot(v):
 x,y,z=np.radians(v);cx,sx=np.cos(x),np.sin(x);cy,sy=np.cos(y),np.sin(y);cz,sz=np.cos(z),np.sin(z)
 return np.array([[cz,-sz,0],[sz,cz,0],[0,0,1]])@np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]])@np.array([[1,0,0],[0,cx,-sx],[0,sx,cx]])
def skeleton(subject):
 text=(BASE/'source'/f'{subject}.asf').read_text();bones={}
 for b in re.findall(r'\bbegin\s+(.*?)\bend',text.split(':bonedata')[1].split(':hierarchy')[0],re.S):
  d={a[0]:a[1:]for l in b.splitlines()if (a:=l.split())}
  name=d['name'][0];bones[name]={'dir':np.array(list(map(float,d['direction']))),'len':float(d['length'][0])*SCALE,'axis':rot(list(map(float,d['axis'][:3]))),'dof':d.get('dof',[])}
 tree={}
 for l in text.split(':hierarchy')[1].splitlines():
  a=l.split()
  if a and a[0]not in ['begin','end']:tree[a[0]]=a[1:]
 return bones,tree
def frames(clip):
 out=[];cur=None
 for l in (BASE/'source'/f'{clip}.amc').read_text().splitlines():
  a=l.split()
  if not a or a[0].startswith(('#',':')):continue
  if a[0].isdigit():cur={};out.append(cur)
  else:cur[a[0]]=np.array(list(map(float,a[1:])))
 return out
def fk(clip):
 bones,tree=skeleton(clip[:2]);out=[];roots=[]
 for f in frames(clip):
  pos={'root':f['root'][:3]*SCALE};R={'root':rot(f['root'][3:])}
  def walk(p):
   for n in tree.get(p,[]):
    b=bones[n];v=np.zeros(3)
    for ch,a in zip(b['dof'],f.get(n,[])):v['xyz'.index(ch[1])]=a
    R[n]=R[p]@b['axis']@rot(v)@b['axis'].T;pos[n]=pos[p]+R[n]@b['dir']*b['len'];walk(n)
  walk('root');out.append(pos);roots.append(R['root'])
 names=list(out[0]);P={n:np.array([p[n]for p in out])for n in names}
 return P,np.array(roots),bones
reports=[];result={'version':9,'samples':N,'source':'CMU Graphics Lab Motion Capture Database','fps':FPS,'gaits':{}}
for group,clips in GROUPS.items():
 cycles=[]
 for clip in clips:
  P,R,bones=fk(clip);count=len(R);root=P['root'];delta=root[-15]-root[15];delta[1]=0;fwd=delta/np.linalg.norm(delta);right=np.cross(fwd,[0,1,0]);leg=np.mean([bones[n]['len']for n in ['lfemur','rfemur']])+np.mean([bones[n]['len']for n in ['ltibia','rtibia']])
  pelvis=P['rhipjoint']-P['lhipjoint'];pelvis/=np.linalg.norm(pelvis,axis=1)[:,None]
  # CMU right hip points along right vector for the measured travel direction.
  if np.mean(pelvis@right)<0:right=-right
  shoulder=P['rclavicle']-P['lclavicle'];up=R@np.array([0,1,0]);torso=P['thorax']-P['root']
  rootProgress=root@fwd;speed=(rootProgress[-15]-rootProgress[15])/((count-30)/FPS)
  ch={'PY':root[:,1]/leg,'PX':(root@right)/leg,'PP':np.arctan2(up@fwd,up[:,1]),'PR':np.arctan2(pelvis[:,1],pelvis@right),'PT':np.unwrap(np.arctan2(pelvis@fwd,pelvis@right)), 'TP':np.arctan2(torso@fwd,torso[:,1]),'TT':np.unwrap(np.arctan2(shoulder@fwd,shoulder@right))}
  for side in ['R','L']:
   low=side.lower();ankle=P[low+'tibia'];foot=P[low+'foot'];toe=P[low+'toes'];hip=P[low+'hipjoint'];upper=P[low+'humerus']-P[low+'clavicle'];fore=P[low+'radius']-P[low+'humerus'];sole=foot-ankle
   ch['FX'+side]=((ankle-root)@fwd)/leg;ch['FY'+side]=ankle[:,1]/leg;ch['FL'+side]=((ankle-root)@right)/leg
   ch['FP'+side]=np.arctan2(sole[:,1],sole@fwd)
   ch['SF'+side]=np.arctan2(upper@fwd,-upper[:,1]);ch['SA'+side]=np.arctan2(upper@right*(1 if side=='R'else -1),-upper[:,1]);ch['EF'+side]=np.arccos(np.clip(np.sum(upper*fore,axis=1)/(np.linalg.norm(upper,axis=1)*np.linalg.norm(fore,axis=1)),-1,1))
  # Heel-strike is the forward ankle maximum; retain complete steady cycles only.
  peaks,_=find_peaks(gaussian_filter1d(ch['FXR'],2),distance=FPS*.48,prominence=.22)
  # Shift from forward extension to actual loading: ankle moves with near-zero
  # world speed and is close to its floor. This prevents landing at max extension.
  contacts=[]
  fxWorld=P['rtibia']@fwd;velocity=np.gradient(fxWorld)*FPS
  floor=float(np.percentile(ch['FYR'],12));cyc=FPS/(.9 if group=='walk'else 1.3)
  for peak in peaks:
   cand=range(int(peak),min(count-1,int(peak+cyc*.18)))
   eligible=[i for i in cand if ch['FYR'][i]<floor+.065 and abs(velocity[i])<speed*.35]
   contacts.append(eligible[0]if eligible else int(peak))
  used=0
  for a,b in zip(contacts[:-1],contacts[1:]):
   dur=(b-a)/FPS
   if not .55<dur<1.65 or a<5 or b>count-5:continue
   index=np.linspace(a,b,N,endpoint=False);c={k:np.interp(index,np.arange(count),savgol_filter(v,9,2))for k,v in ch.items()}
   for k in ['PY','PX','PT','TT']:
    # Remove DC/path drift only, retaining cyclic weight transfer.
    linear=np.linspace(c[k][0],c[k][-1],N);c[k]=c[k]-linear;c[k]-=np.mean(c[k])
   for side in ['R','L']:
    c['FY'+side]-=np.percentile(c['FY'+side],12);c['FY'+side]=np.maximum(0,c['FY'+side])
   # Contact end from the captured foot's rearward extremum (toe-off).
   low=int(np.argmin(c['FYR'][:N//3]));threshold=max(.035,float(max(c['FYR']))*.20)
   exits=[i for i in range(max(low+1,N//5),int(.75*N))if c['FYR'][i]>threshold]
   stance=float(np.clip((exits[0]if exits else int(.56*N))/N,.28,.65))
   cycles.append({'ch':c,'speed':speed,'freq':1/dur,'leg':leg,'stance':stance,'clip':clip});used+=1
  reports.append({'clip':clip,'group':group,'frames':count,'speed':round(float(speed),5),'leg':round(float(leg),5),'cycles':used,'url':f'http://mocap.cs.cmu.edu/subjects/{clip[:2]}/{clip}.amc','sha256':hashlib.sha256((BASE/'source'/f'{clip}.amc').read_bytes()).hexdigest()})
 if not cycles:raise RuntimeError('No usable cycles for '+group)
 channels={k:gaussian_filter1d(np.mean([c['ch'][k]for c in cycles],axis=0),1.1,mode='wrap')for k in cycles[0]['ch']}
 # Fold the two observed sides into a phase-consistent symmetric limb path.
 folded={}
 for k in ['FX','FY','FL','FP','SF','SA','EF']:
  l=np.roll(channels[k+'L'],-N//2)
  if k=='FL':l=-l
  folded[k]=(channels[k+'R']+l)*.5
 channels={k:v for k,v in channels.items()if k[-1]not in ['R','L'] or k in ['PR']}
 channels.update(folded)
 # Body oscillations already refer to the right-contact phase. Angles stay radians.
 meta={k:round(float(np.mean([c[k]for c in cycles])),6)for k in ['speed','freq','leg','stance']};meta['cycles']=len(cycles)
 s=meta['stance'];grid=np.arange(N)/N;stride=meta['speed']/meta['freq']/meta['leg']
 fx=folded['FX'];x0=float(np.interp(s,grid,fx));x1=float(fx[0]);denom=(1-s)+(x1-x0)/stride
 sx=np.where(grid>=s,((grid-s)+(fx-x0)/stride)/max(.1,denom),0)
 sx=np.clip(sx,0,1);sx=np.maximum.accumulate(sx);sx[-1]=min(1,sx[-1]);channels['SX']=sx
 fy=folded['FY'];y0=float(np.interp(s,grid,fy));u=np.clip((grid-s)/(1-s),0,1)
 sy=np.maximum(0,fy-(y0*(1-u)+float(fy[0])*u));sy[grid<s]=0
 channels['SY']=sy
 folded['FP']-=float(np.mean(folded['FP'][int(.1*N):int(.3*N)]));channels['FP']=folded['FP']
 result['gaits'][group]={**meta,'ch':{k:np.round(v,6).tolist()for k,v in channels.items()}}
 print(group,json.dumps(meta), 'lift',round(float(max(folded['FY'])),3),'FX range',round(float(np.ptp(folded['FX'])),3),'arms',round(float(np.mean(folded['EF'])),3))
(ROOT/'js/advanced/gait-data.js').write_text('/* Derived from CMU Graphics Lab mocap. See docs/CMU_MOCAP_CREDITS.md. Generated; do not hand-edit. */\n(function(r){r.GGaitData='+json.dumps(result,separators=(',',':'))+';})(globalThis);\n')
(BASE/'manifest.json').write_text(json.dumps({'source':'http://mocap.cs.cmu.edu/','clips':reports,'gaits':{k:{a:v for a,v in g.items()if a!='ch'}for k,g in result['gaits'].items()}},indent=2)+'\n')
