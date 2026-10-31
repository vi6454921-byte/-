(function(F,y){typeof exports=="object"&&typeof module<"u"?y(exports,require("three")):typeof define=="function"&&define.amd?define(["exports","three"],y):(F=typeof globalThis<"u"?globalThis:F||self,y(F.MeshBVHLib=F.MeshBVHLib||{},F.THREE))})(this,function(F,y){"use strict";const vn=Math.pow(2,-24),ce=Symbol("SKIP_GENERATION");function Ce(n){return n.index?n.index.count:n.attributes.position.count}function Q(n){return Ce(n)/3}function Ne(n,t=ArrayBuffer){return n>65535?new Uint32Array(new t(4*n)):new Uint16Array(new t(2*n))}function Bn(n,t){if(!n.index){const e=n.attributes.position.count,i=t.useSharedArrayBuffer?SharedArrayBuffer:ArrayBuffer,s=Ne(e,i);n.setIndex(new y.BufferAttribute(s,1));for(let c=0;c<e;c++)s[c]=c}}function Re(n,t){const e=Q(n),i=t||n.drawRange,s=i.start/3,c=(i.start+i.count)/3,o=Math.max(0,s),a=Math.min(e,c)-o;return[{offset:Math.floor(o),count:Math.floor(a)}]}function ze(n,t){if(!n.groups||!n.groups.length)return Re(n,t);const e=[],i=new Set,s=t||n.drawRange,c=s.start/3,o=(s.start+s.count)/3;for(const r of n.groups){const d=r.start/3,l=(r.start+r.count)/3;i.add(Math.max(c,d)),i.add(Math.min(o,l))}const a=Array.from(i.values()).sort((r,d)=>r-d);for(let r=0;r<a.length-1;r++){const d=a[r],l=a[r+1];e.push({offset:Math.floor(d),count:Math.floor(l-d)})}return e}function Sn(n,t){const e=Q(n),i=ze(n,t).sort((o,a)=>o.offset-a.offset),s=i[i.length-1];s.count=Math.min(e-s.offset,s.count);let c=0;return i.forEach(({count:o})=>c+=o),e!==c}function ae(n,t,e,i,s){let c=1/0,o=1/0,a=1/0,r=-1/0,d=-1/0,l=-1/0,f=1/0,u=1/0,p=1/0,A=-1/0,T=-1/0,w=-1/0;for(let g=t*6,x=(t+e)*6;g<x;g+=6){const m=n[g+0],b=n[g+1],h=m-b,v=m+b;h<c&&(c=h),v>r&&(r=v),m<f&&(f=m),m>A&&(A=m);const B=n[g+2],P=n[g+3],_=B-P,I=B+P;_<o&&(o=_),I>d&&(d=I),B<u&&(u=B),B>T&&(T=B);const E=n[g+4],S=n[g+5],M=E-S,V=E+S;M<a&&(a=M),V>l&&(l=V),E<p&&(p=E),E>w&&(w=E)}i[0]=c,i[1]=o,i[2]=a,i[3]=r,i[4]=d,i[5]=l,s[0]=f,s[1]=u,s[2]=p,s[3]=A,s[4]=T,s[5]=w}function _n(n,t=null,e=null,i=null){const s=n.attributes.position,c=n.index?n.index.array:null,o=Q(n),a=s.normalized;let r;t===null?r=new Float32Array(o*6):r=t,e=e||0,i=i||o;const d=s.array,l=s.offset||0;let f=3;s.isInterleavedBufferAttribute&&(f=s.data.stride);const u=["getX","getY","getZ"];for(let p=e;p<e+i;p++){const A=p*3,T=p*6;let w=A+0,g=A+1,x=A+2;c&&(w=c[w],g=c[g],x=c[x]),a||(w=w*f+l,g=g*f+l,x=x*f+l);for(let m=0;m<3;m++){let b,h,v;a?(b=s[u[m]](w),h=s[u[m]](g),v=s[u[m]](x)):(b=d[w+m],h=d[g+m],v=d[x+m]);let B=b;h<B&&(B=h),v<B&&(B=v);let P=b;h>P&&(P=h),v>P&&(P=v);const _=(P-B)/2,I=m*2;r[T+I+0]=B+_,r[T+I+1]=_+(Math.abs(B)+_)*vn}}return r}function N(n,t,e){return e.min.x=t[n],e.min.y=t[n+1],e.min.z=t[n+2],e.max.x=t[n+3],e.max.y=t[n+4],e.max.z=t[n+5],e}function xs(n){n[0]=n[1]=n[2]=1/0,n[3]=n[4]=n[5]=-1/0}function Le(n){let t=-1,e=-1/0;for(let i=0;i<3;i++){const s=n[i+3]-n[i];s>e&&(e=s,t=i)}return t}function Ue(n,t){t.set(n)}function ke(n,t,e){let i,s;for(let c=0;c<3;c++){const o=c+3;i=n[c],s=t[c],e[c]=i<s?i:s,i=n[o],s=t[o],e[o]=i>s?i:s}}function Lt(n,t,e){for(let i=0;i<3;i++){const s=t[n+2*i],c=t[n+2*i+1],o=s-c,a=s+c;o<e[i]&&(e[i]=o),a>e[i+3]&&(e[i+3]=a)}}function vt(n){const t=n[3]-n[0],e=n[4]-n[1],i=n[5]-n[2];return 2*(t*e+e*i+i*t)}const K=32,In=(n,t)=>n.candidate-t.candidate,tt=new Array(K).fill().map(()=>({count:0,bounds:new Float32Array(6),rightCacheBounds:new Float32Array(6),leftCacheBounds:new Float32Array(6),candidate:0})),Ut=new Float32Array(6);function Pn(n,t,e,i,s,c){let o=-1,a=0;if(c===0)o=Le(t),o!==-1&&(a=(t[o]+t[o+3])/2);else if(c===1)o=Le(n),o!==-1&&(a=Mn(e,i,s,o));else if(c===2){const r=vt(n);let d=1.25*s;const l=i*6,f=(i+s)*6;for(let u=0;u<3;u++){const p=t[u],w=(t[u+3]-p)/K;if(s<K/4){const g=[...tt];g.length=s;let x=0;for(let b=l;b<f;b+=6,x++){const h=g[x];h.candidate=e[b+2*u],h.count=0;const{bounds:v,leftCacheBounds:B,rightCacheBounds:P}=h;for(let _=0;_<3;_++)P[_]=1/0,P[_+3]=-1/0,B[_]=1/0,B[_+3]=-1/0,v[_]=1/0,v[_+3]=-1/0;Lt(b,e,v)}g.sort(In);let m=s;for(let b=0;b<m;b++){const h=g[b];for(;b+1<m&&g[b+1].candidate===h.candidate;)g.splice(b+1,1),m--}for(let b=l;b<f;b+=6){const h=e[b+2*u];for(let v=0;v<m;v++){const B=g[v];h>=B.candidate?Lt(b,e,B.rightCacheBounds):(Lt(b,e,B.leftCacheBounds),B.count++)}}for(let b=0;b<m;b++){const h=g[b],v=h.count,B=s-h.count,P=h.leftCacheBounds,_=h.rightCacheBounds;let I=0;v!==0&&(I=vt(P)/r);let E=0;B!==0&&(E=vt(_)/r);const S=1+1.25*(I*v+E*B);S<d&&(o=u,d=S,a=h.candidate)}}else{for(let m=0;m<K;m++){const b=tt[m];b.count=0,b.candidate=p+w+m*w;const h=b.bounds;for(let v=0;v<3;v++)h[v]=1/0,h[v+3]=-1/0}for(let m=l;m<f;m+=6){let v=~~((e[m+2*u]-p)/w);v>=K&&(v=K-1);const B=tt[v];B.count++,Lt(m,e,B.bounds)}const g=tt[K-1];Ue(g.bounds,g.rightCacheBounds);for(let m=K-2;m>=0;m--){const b=tt[m],h=tt[m+1];ke(b.bounds,h.rightCacheBounds,b.rightCacheBounds)}let x=0;for(let m=0;m<K-1;m++){const b=tt[m],h=b.count,v=b.bounds,P=tt[m+1].rightCacheBounds;h!==0&&(x===0?Ue(v,Ut):ke(v,Ut,Ut)),x+=h;let _=0,I=0;x!==0&&(_=vt(Ut)/r);const E=s-x;E!==0&&(I=vt(P)/r);const S=1+1.25*(_*x+I*E);S<d&&(o=u,d=S,a=b.candidate)}}}}else console.warn(`MeshBVH: Invalid build strategy value ${c} used.`);return{axis:o,pos:a}}function Mn(n,t,e,i){let s=0;for(let c=t,o=t+e;c<o;c++)s+=n[c*6+i*2];return s/e}class le{constructor(){this.boundingData=new Float32Array(6)}}function En(n,t,e,i,s,c){let o=i,a=i+s-1;const r=c.pos,d=c.axis*2;for(;;){for(;o<=a&&e[o*6+d]<r;)o++;for(;o<=a&&e[a*6+d]>=r;)a--;if(o<a){for(let l=0;l<3;l++){let f=t[o*3+l];t[o*3+l]=t[a*3+l],t[a*3+l]=f}for(let l=0;l<6;l++){let f=e[o*6+l];e[o*6+l]=e[a*6+l],e[a*6+l]=f}o++,a--}else return o}}function Vn(n,t,e,i,s,c){let o=i,a=i+s-1;const r=c.pos,d=c.axis*2;for(;;){for(;o<=a&&e[o*6+d]<r;)o++;for(;o<=a&&e[a*6+d]>=r;)a--;if(o<a){let l=n[o];n[o]=n[a],n[a]=l;for(let f=0;f<6;f++){let u=e[o*6+f];e[o*6+f]=e[a*6+f],e[a*6+f]=u}o++,a--}else return o}}function k(n,t){return t[n+15]===65535}function H(n,t){return t[n+6]}function O(n,t){return t[n+14]}function X(n){return n+8}function q(n,t){return t[n+6]}function ue(n,t){return t[n+7]}function bs(n){return n}let He,Bt,kt,Oe;const Dn=Math.pow(2,32);function fe(n){return"count"in n?1:1+fe(n.left)+fe(n.right)}function Fn(n,t,e){return He=new Float32Array(e),Bt=new Uint32Array(e),kt=new Uint16Array(e),Oe=new Uint8Array(e),de(n,t)}function de(n,t){const e=n/4,i=n/2,s="count"in t,c=t.boundingData;for(let o=0;o<6;o++)He[e+o]=c[o];if(s)if(t.buffer){const o=t.buffer;Oe.set(new Uint8Array(o),n);for(let a=n,r=n+o.byteLength;a<r;a+=32){const d=a/2;k(d,kt)||(Bt[a/4+6]+=e)}return n+o.byteLength}else{const o=t.offset,a=t.count;return Bt[e+6]=o,kt[i+14]=a,kt[i+15]=65535,n+32}else{const o=t.left,a=t.right,r=t.splitAxis;let d;if(d=de(n+32,o),d/4>Dn)throw new Error("MeshBVH: Cannot store child pointer greater than 32 bits.");return Bt[e+6]=d/4,d=de(d,a),Bt[e+7]=r,d}}function Cn(n,t){const e=(n.index?n.index.count:n.attributes.position.count)/3,i=e>2**16,s=i?4:2,c=t?new SharedArrayBuffer(e*s):new ArrayBuffer(e*s),o=i?new Uint32Array(c):new Uint16Array(c);for(let a=0,r=o.length;a<r;a++)o[a]=a;return o}function Nn(n,t,e,i,s){const{maxDepth:c,verbose:o,maxLeafTris:a,strategy:r,onProgress:d,indirect:l}=s,f=n._indirectBuffer,u=n.geometry,p=u.index?u.index.array:null,A=l?Vn:En,T=Q(u),w=new Float32Array(6);let g=!1;const x=new le;return ae(t,e,i,x.boundingData,w),b(x,e,i,w),x;function m(h){d&&d(h/T)}function b(h,v,B,P=null,_=0){if(!g&&_>=c&&(g=!0,o&&(console.warn(`MeshBVH: Max depth of ${c} reached when generating BVH. Consider increasing maxDepth.`),console.warn(u))),B<=a||_>=c)return m(v+B),h.offset=v,h.count=B,h;const I=Pn(h.boundingData,P,t,v,B,r);if(I.axis===-1)return m(v+B),h.offset=v,h.count=B,h;const E=A(f,p,t,v,B,I);if(E===v||E===v+B)m(v+B),h.offset=v,h.count=B;else{h.splitAxis=I.axis;const S=new le,M=v,V=E-v;h.left=S,ae(t,M,V,S.boundingData,w),b(S,M,V,w,_+1);const D=new le,C=E,W=B-V;h.right=D,ae(t,C,W,D.boundingData,w),b(D,C,W,w,_+1)}return h}}function Rn(n,t){const e=n.geometry;t.indirect&&(n._indirectBuffer=Cn(e,t.useSharedArrayBuffer),Sn(e,t.range)&&!t.verbose&&console.warn('MeshBVH: Provided geometry contains groups or a range that do not fully span the vertex contents while using the "indirect" option. BVH may incorrectly report intersections on unrendered portions of the geometry.')),n._indirectBuffer||Bn(e,t);const i=t.useSharedArrayBuffer?SharedArrayBuffer:ArrayBuffer,s=Re(e,t.range),c=_n(e,null,s[0].offset,s[0].count),o=t.indirect?s:ze(e,t.range);n._roots=o.map(a=>{const r=Nn(n,c,a.offset,a.count,t),d=fe(r),l=new i(32*d);return Fn(0,r,l),l})}class Z{constructor(){this.min=1/0,this.max=-1/0}setFromPointsField(t,e){let i=1/0,s=-1/0;for(let c=0,o=t.length;c<o;c++){const r=t[c][e];i=r<i?r:i,s=r>s?r:s}this.min=i,this.max=s}setFromPoints(t,e){let i=1/0,s=-1/0;for(let c=0,o=e.length;c<o;c++){const a=e[c],r=t.dot(a);i=r<i?r:i,s=r>s?r:s}this.min=i,this.max=s}isSeparated(t){return this.min>t.max||t.min>this.max}}Z.prototype.setFromBox=function(){const n=new y.Vector3;return function(e,i){const s=i.min,c=i.max;let o=1/0,a=-1/0;for(let r=0;r<=1;r++)for(let d=0;d<=1;d++)for(let l=0;l<=1;l++){n.x=s.x*r+c.x*(1-r),n.y=s.y*d+c.y*(1-d),n.z=s.z*l+c.z*(1-l);const f=e.dot(n);o=Math.min(f,o),a=Math.max(f,a)}this.min=o,this.max=a}}();const gs=function(){const n=new Z;return function(e,i){const s=e.points,c=e.satAxes,o=e.satBounds,a=i.points,r=i.satAxes,d=i.satBounds;for(let l=0;l<3;l++){const f=o[l],u=c[l];if(n.setFromPoints(u,a),f.isSeparated(n))return!1}for(let l=0;l<3;l++){const f=d[l],u=r[l];if(n.setFromPoints(u,s),f.isSeparated(n))return!1}}}(),zn=function(){const n=new y.Vector3,t=new y.Vector3,e=new y.Vector3;return function(s,c,o){const a=s.start,r=n,d=c.start,l=t;e.subVectors(a,d),n.subVectors(s.end,s.start),t.subVectors(c.end,c.start);const f=e.dot(l),u=l.dot(r),p=l.dot(l),A=e.dot(r),w=r.dot(r)*p-u*u;let g,x;w!==0?g=(f*u-A*p)/w:g=0,x=(f+g*u)/p,o.x=g,o.y=x}}(),pe=function(){const n=new y.Vector2,t=new y.Vector3,e=new y.Vector3;return function(s,c,o,a){zn(s,c,n);let r=n.x,d=n.y;if(r>=0&&r<=1&&d>=0&&d<=1){s.at(r,o),c.at(d,a);return}else if(r>=0&&r<=1){d<0?c.at(0,a):c.at(1,a),s.closestPointToPoint(a,!0,o);return}else if(d>=0&&d<=1){r<0?s.at(0,o):s.at(1,o),c.closestPointToPoint(o,!0,a);return}else{let l;r<0?l=s.start:l=s.end;let f;d<0?f=c.start:f=c.end;const u=t,p=e;if(s.closestPointToPoint(f,!0,t),c.closestPointToPoint(l,!0,e),u.distanceToSquared(f)<=p.distanceToSquared(l)){o.copy(u),a.copy(f);return}else{o.copy(l),a.copy(p);return}}}}(),Ln=function(){const n=new y.Vector3,t=new y.Vector3,e=new y.Plane,i=new y.Line3;return function(c,o){const{radius:a,center:r}=c,{a:d,b:l,c:f}=o;if(i.start=d,i.end=l,i.closestPointToPoint(r,!0,n).distanceTo(r)<=a||(i.start=d,i.end=f,i.closestPointToPoint(r,!0,n).distanceTo(r)<=a)||(i.start=l,i.end=f,i.closestPointToPoint(r,!0,n).distanceTo(r)<=a))return!0;const T=o.getPlane(e);if(Math.abs(T.distanceToPoint(r))<=a){const g=T.projectPoint(r,t);if(o.containsPoint(g))return!0}return!1}}(),Un=["x","y","z"],J=1e-15,qe=J*J;function Y(n){return Math.abs(n)<J}class $ extends y.Triangle{constructor(...t){super(...t),this.isExtendedTriangle=!0,this.satAxes=new Array(4).fill().map(()=>new y.Vector3),this.satBounds=new Array(4).fill().map(()=>new Z),this.points=[this.a,this.b,this.c],this.plane=new y.Plane,this.isDegenerateIntoSegment=!1,this.isDegenerateIntoPoint=!1,this.degenerateSegment=new y.Line3,this.needsUpdate=!0}intersectsSphere(t){return Ln(t,this)}update(){const t=this.a,e=this.b,i=this.c,s=this.points,c=this.satAxes,o=this.satBounds,a=c[0],r=o[0];this.getNormal(a),r.setFromPoints(a,s);const d=c[1],l=o[1];d.subVectors(t,e),l.setFromPoints(d,s);const f=c[2],u=o[2];f.subVectors(e,i),u.setFromPoints(f,s);const p=c[3],A=o[3];p.subVectors(i,t),A.setFromPoints(p,s);const T=d.length(),w=f.length(),g=p.length();this.isDegenerateIntoPoint=!1,this.isDegenerateIntoSegment=!1,T<J?w<J||g<J?this.isDegenerateIntoPoint=!0:(this.isDegenerateIntoSegment=!0,this.degenerateSegment.start.copy(t),this.degenerateSegment.end.copy(i)):w<J?g<J?this.isDegenerateIntoPoint=!0:(this.isDegenerateIntoSegment=!0,this.degenerateSegment.start.copy(e),this.degenerateSegment.end.copy(t)):g<J&&(this.isDegenerateIntoSegment=!0,this.degenerateSegment.start.copy(i),this.degenerateSegment.end.copy(e)),this.plane.setFromNormalAndCoplanarPoint(a,t),this.needsUpdate=!1}}$.prototype.closestPointToSegment=function(){const n=new y.Vector3,t=new y.Vector3,e=new y.Line3;return function(s,c=null,o=null){const{start:a,end:r}=s,d=this.points;let l,f=1/0;for(let u=0;u<3;u++){const p=(u+1)%3;e.start.copy(d[u]),e.end.copy(d[p]),pe(e,s,n,t),l=n.distanceToSquared(t),l<f&&(f=l,c&&c.copy(n),o&&o.copy(t))}return this.closestPointToPoint(a,n),l=a.distanceToSquared(n),l<f&&(f=l,c&&c.copy(n),o&&o.copy(a)),this.closestPointToPoint(r,n),l=r.distanceToSquared(n),l<f&&(f=l,c&&c.copy(n),o&&o.copy(r)),Math.sqrt(f)}}(),$.prototype.intersectsTriangle=function(){const n=new $,t=new Z,e=new Z,i=new y.Vector3,s=new y.Vector3,c=new y.Vector3,o=new y.Vector3,a=new y.Line3,r=new y.Line3,d=new y.Vector3,l=new y.Vector2,f=new y.Vector2;function u(m,b,h,v){const B=i;!m.isDegenerateIntoPoint&&!m.isDegenerateIntoSegment?B.copy(m.plane.normal):B.copy(b.plane.normal);const P=m.satBounds,_=m.satAxes;for(let S=1;S<4;S++){const M=P[S],V=_[S];if(t.setFromPoints(V,b.points),M.isSeparated(t)||(o.copy(B).cross(V),t.setFromPoints(o,m.points),e.setFromPoints(o,b.points),t.isSeparated(e)))return!1}const I=b.satBounds,E=b.satAxes;for(let S=1;S<4;S++){const M=I[S],V=E[S];if(t.setFromPoints(V,m.points),M.isSeparated(t)||(o.crossVectors(B,V),t.setFromPoints(o,m.points),e.setFromPoints(o,b.points),t.isSeparated(e)))return!1}return h&&(v||console.warn("ExtendedTriangle.intersectsTriangle: Triangles are coplanar which does not support an output edge. Setting edge to 0, 0, 0."),h.start.set(0,0,0),h.end.set(0,0,0)),!0}function p(m,b,h,v,B,P,_,I,E,S,M){let V=_/(_-I);S.x=v+(B-v)*V,M.start.subVectors(b,m).multiplyScalar(V).add(m),V=_/(_-E),S.y=v+(P-v)*V,M.end.subVectors(h,m).multiplyScalar(V).add(m)}function A(m,b,h,v,B,P,_,I,E,S,M){if(B>0)p(m.c,m.a,m.b,v,b,h,E,_,I,S,M);else if(P>0)p(m.b,m.a,m.c,h,b,v,I,_,E,S,M);else if(I*E>0||_!=0)p(m.a,m.b,m.c,b,h,v,_,I,E,S,M);else if(I!=0)p(m.b,m.a,m.c,h,b,v,I,_,E,S,M);else if(E!=0)p(m.c,m.a,m.b,v,b,h,E,_,I,S,M);else return!0;return!1}function T(m,b,h,v){const B=b.degenerateSegment,P=m.plane.distanceToPoint(B.start),_=m.plane.distanceToPoint(B.end);return Y(P)?Y(_)?u(m,b,h,v):(h&&(h.start.copy(B.start),h.end.copy(B.start)),m.containsPoint(B.start)):Y(_)?(h&&(h.start.copy(B.end),h.end.copy(B.end)),m.containsPoint(B.end)):m.plane.intersectLine(B,i)!=null?(h&&(h.start.copy(i),h.end.copy(i)),m.containsPoint(i)):!1}function w(m,b,h){const v=b.a;return Y(m.plane.distanceToPoint(v))&&m.containsPoint(v)?(h&&(h.start.copy(v),h.end.copy(v)),!0):!1}function g(m,b,h){const v=m.degenerateSegment,B=b.a;return v.closestPointToPoint(B,!0,i),B.distanceToSquared(i)<qe?(h&&(h.start.copy(B),h.end.copy(B)),!0):!1}function x(m,b,h,v){if(m.isDegenerateIntoSegment)if(b.isDegenerateIntoSegment){const B=m.degenerateSegment,P=b.degenerateSegment,_=s,I=c;B.delta(_),P.delta(I);const E=i.subVectors(P.start,B.start),S=_.x*I.y-_.y*I.x;if(Y(S))return!1;const M=(E.x*I.y-E.y*I.x)/S,V=-(_.x*E.y-_.y*E.x)/S;if(M<0||M>1||V<0||V>1)return!1;const D=B.start.z+_.z*M,C=P.start.z+I.z*V;return Y(D-C)?(h&&(h.start.copy(B.start).addScaledVector(_,M),h.end.copy(B.start).addScaledVector(_,M)),!0):!1}else return b.isDegenerateIntoPoint?g(m,b,h):T(b,m,h,v);else{if(m.isDegenerateIntoPoint)return b.isDegenerateIntoPoint?b.a.distanceToSquared(m.a)<qe?(h&&(h.start.copy(m.a),h.end.copy(m.a)),!0):!1:b.isDegenerateIntoSegment?g(b,m,h):w(b,m,h);if(b.isDegenerateIntoPoint)return w(m,b,h);if(b.isDegenerateIntoSegment)return T(m,b,h,v)}}return function(b,h=null,v=!1){this.needsUpdate&&this.update(),b.isExtendedTriangle?b.needsUpdate&&b.update():(n.copy(b),n.update(),b=n);const B=x(this,b,h,v);if(B!==void 0)return B;const P=this.plane,_=b.plane;let I=_.distanceToPoint(this.a),E=_.distanceToPoint(this.b),S=_.distanceToPoint(this.c);Y(I)&&(I=0),Y(E)&&(E=0),Y(S)&&(S=0);const M=I*E,V=I*S;if(M>0&&V>0)return!1;let D=P.distanceToPoint(b.a),C=P.distanceToPoint(b.b),W=P.distanceToPoint(b.c);Y(D)&&(D=0),Y(C)&&(C=0),Y(W)&&(W=0);const st=D*C,ot=D*W;if(st>0&&ot>0)return!1;s.copy(P.normal),c.copy(_.normal);const Ee=s.cross(c);let Ve=0,De=Math.abs(Ee.x);const Tn=Math.abs(Ee.y);Tn>De&&(De=Tn,Ve=1),Math.abs(Ee.z)>De&&(Ve=2);const Tt=Un[Ve],es=this.a[Tt],ns=this.b[Tt],is=this.c[Tt],ss=b.a[Tt],os=b.b[Tt],rs=b.c[Tt];if(A(this,es,ns,is,M,V,I,E,S,l,a))return u(this,b,h,v);if(A(b,ss,os,rs,st,ot,D,C,W,f,r))return u(this,b,h,v);if(l.y<l.x){const Fe=l.y;l.y=l.x,l.x=Fe,d.copy(a.start),a.start.copy(a.end),a.end.copy(d)}if(f.y<f.x){const Fe=f.y;f.y=f.x,f.x=Fe,d.copy(r.start),r.start.copy(r.end),r.end.copy(d)}return l.y<f.x||f.y<l.x?!1:(h&&(f.x>l.x?h.start.copy(r.start):h.start.copy(a.start),f.y<l.y?h.end.copy(r.end):h.end.copy(a.end)),!0)}}(),$.prototype.distanceToPoint=function(){const n=new y.Vector3;return function(e){return this.closestPointToPoint(e,n),e.distanceTo(n)}}(),$.prototype.distanceToTriangle=function(){const n=new y.Vector3,t=new y.Vector3,e=["a","b","c"],i=new y.Line3,s=new y.Line3;return function(o,a=null,r=null){const d=a||r?i:null;if(this.intersectsTriangle(o,d))return(a||r)&&(a&&d.getCenter(a),r&&d.getCenter(r)),0;let l=1/0;for(let f=0;f<3;f++){let u;const p=e[f],A=o[p];this.closestPointToPoint(A,n),u=A.distanceToSquared(n),u<l&&(l=u,a&&a.copy(n),r&&r.copy(A));const T=this[p];o.closestPointToPoint(T,n),u=T.distanceToSquared(n),u<l&&(l=u,a&&a.copy(T),r&&r.copy(n))}for(let f=0;f<3;f++){const u=e[f],p=e[(f+1)%3];i.set(this[u],this[p]);for(let A=0;A<3;A++){const T=e[A],w=e[(A+1)%3];s.set(o[T],o[w]),pe(i,s,n,t);const g=n.distanceToSquared(t);g<l&&(l=g,a&&a.copy(n),r&&r.copy(t))}}return Math.sqrt(l)}}();class U{constructor(t,e,i){this.isOrientedBox=!0,this.min=new y.Vector3,this.max=new y.Vector3,this.matrix=new y.Matrix4,this.invMatrix=new y.Matrix4,this.points=new Array(8).fill().map(()=>new y.Vector3),this.satAxes=new Array(3).fill().map(()=>new y.Vector3),this.satBounds=new Array(3).fill().map(()=>new Z),this.alignedSatBounds=new Array(3).fill().map(()=>new Z),this.needsUpdate=!1,t&&this.min.copy(t),e&&this.max.copy(e),i&&this.matrix.copy(i)}set(t,e,i){this.min.copy(t),this.max.copy(e),this.matrix.copy(i),this.needsUpdate=!0}copy(t){this.min.copy(t.min),this.max.copy(t.max),this.matrix.copy(t.matrix),this.needsUpdate=!0}}U.prototype.update=function(){return function(){const t=this.matrix,e=this.min,i=this.max,s=this.points;for(let d=0;d<=1;d++)for(let l=0;l<=1;l++)for(let f=0;f<=1;f++){const u=1*d|2*l|4*f,p=s[u];p.x=d?i.x:e.x,p.y=l?i.y:e.y,p.z=f?i.z:e.z,p.applyMatrix4(t)}const c=this.satBounds,o=this.satAxes,a=s[0];for(let d=0;d<3;d++){const l=o[d],f=c[d],u=1<<d,p=s[u];l.subVectors(a,p),f.setFromPoints(l,s)}const r=this.alignedSatBounds;r[0].setFromPointsField(s,"x"),r[1].setFromPointsField(s,"y"),r[2].setFromPointsField(s,"z"),this.invMatrix.copy(this.matrix).invert(),this.needsUpdate=!1}}(),U.prototype.intersectsBox=function(){const n=new Z;return function(e){this.needsUpdate&&this.update();const i=e.min,s=e.max,c=this.satBounds,o=this.satAxes,a=this.alignedSatBounds;if(n.min=i.x,n.max=s.x,a[0].isSeparated(n)||(n.min=i.y,n.max=s.y,a[1].isSeparated(n))||(n.min=i.z,n.max=s.z,a[2].isSeparated(n)))return!1;for(let r=0;r<3;r++){const d=o[r],l=c[r];if(n.setFromBox(d,e),l.isSeparated(n))return!1}return!0}}(),U.prototype.intersectsTriangle=function(){const n=new $,t=new Array(3),e=new Z,i=new Z,s=new y.Vector3;return function(o){this.needsUpdate&&this.update(),o.isExtendedTriangle?o.needsUpdate&&o.update():(n.copy(o),n.update(),o=n);const a=this.satBounds,r=this.satAxes;t[0]=o.a,t[1]=o.b,t[2]=o.c;for(let u=0;u<3;u++){const p=a[u],A=r[u];if(e.setFromPoints(A,t),p.isSeparated(e))return!1}const d=o.satBounds,l=o.satAxes,f=this.points;for(let u=0;u<3;u++){const p=d[u],A=l[u];if(e.setFromPoints(A,f),p.isSeparated(e))return!1}for(let u=0;u<3;u++){const p=r[u];for(let A=0;A<4;A++){const T=l[A];if(s.crossVectors(p,T),e.setFromPoints(s,t),i.setFromPoints(s,f),e.isSeparated(i))return!1}}return!0}}(),U.prototype.closestPointToPoint=function(){return function(t,e){return this.needsUpdate&&this.update(),e.copy(t).applyMatrix4(this.invMatrix).clamp(this.min,this.max).applyMatrix4(this.matrix),e}}(),U.prototype.distanceToPoint=function(){const n=new y.Vector3;return function(e){return this.closestPointToPoint(e,n),e.distanceTo(n)}}(),U.prototype.distanceToBox=function(){const n=["x","y","z"],t=new Array(12).fill().map(()=>new y.Line3),e=new Array(12).fill().map(()=>new y.Line3),i=new y.Vector3,s=new y.Vector3;return function(o,a=0,r=null,d=null){if(this.needsUpdate&&this.update(),this.intersectsBox(o))return(r||d)&&(o.getCenter(s),this.closestPointToPoint(s,i),o.closestPointToPoint(i,s),r&&r.copy(i),d&&d.copy(s)),0;const l=a*a,f=o.min,u=o.max,p=this.points;let A=1/0;for(let w=0;w<8;w++){const g=p[w];s.copy(g).clamp(f,u);const x=g.distanceToSquared(s);if(x<A&&(A=x,r&&r.copy(g),d&&d.copy(s),x<l))return Math.sqrt(x)}let T=0;for(let w=0;w<3;w++)for(let g=0;g<=1;g++)for(let x=0;x<=1;x++){const m=(w+1)%3,b=(w+2)%3,h=g<<m|x<<b,v=1<<w|g<<m|x<<b,B=p[h],P=p[v];t[T].set(B,P);const I=n[w],E=n[m],S=n[b],M=e[T],V=M.start,D=M.end;V[I]=f[I],V[E]=g?f[E]:u[E],V[S]=x?f[S]:u[E],D[I]=u[I],D[E]=g?f[E]:u[E],D[S]=x?f[S]:u[E],T++}for(let w=0;w<=1;w++)for(let g=0;g<=1;g++)for(let x=0;x<=1;x++){s.x=w?u.x:f.x,s.y=g?u.y:f.y,s.z=x?u.z:f.z,this.closestPointToPoint(s,i);const m=s.distanceToSquared(i);if(m<A&&(A=m,r&&r.copy(i),d&&d.copy(s),m<l))return Math.sqrt(m)}for(let w=0;w<12;w++){const g=t[w];for(let x=0;x<12;x++){const m=e[x];pe(g,m,i,s);const b=i.distanceToSquared(s);if(b<A&&(A=b,r&&r.copy(i),d&&d.copy(s),b<l))return Math.sqrt(b)}}return Math.sqrt(A)}}();class me{constructor(t){this._getNewPrimitive=t,this._primitives=[]}getPrimitive(){const t=this._primitives;return t.length===0?this._getNewPrimitive():t.pop()}releasePrimitive(t){this._primitives.push(t)}}class kn extends me{constructor(){super(()=>new $)}}const G=new kn;class Hn{constructor(){this.float32Array=null,this.uint16Array=null,this.uint32Array=null;const t=[];let e=null;this.setBuffer=i=>{e&&t.push(e),e=i,this.float32Array=new Float32Array(i),this.uint16Array=new Uint16Array(i),this.uint32Array=new Uint32Array(i)},this.clearBuffer=()=>{e=null,this.float32Array=null,this.uint16Array=null,this.uint32Array=null,t.length!==0&&this.setBuffer(t.pop())}}}const R=new Hn;let et,pt;const mt=[],Ht=new me(()=>new y.Box3);function On(n,t,e,i,s,c){et=Ht.getPrimitive(),pt=Ht.getPrimitive(),mt.push(et,pt),R.setBuffer(n._roots[t]);const o=ye(0,n.geometry,e,i,s,c);R.clearBuffer(),Ht.releasePrimitive(et),Ht.releasePrimitive(pt),mt.pop(),mt.pop();const a=mt.length;return a>0&&(pt=mt[a-1],et=mt[a-2]),o}function ye(n,t,e,i,s=null,c=0,o=0){const{float32Array:a,uint16Array:r,uint32Array:d}=R;let l=n*2;if(k(l,r)){const u=H(n,d),p=O(l,r);return N(n,a,et),i(u,p,!1,o,c+n,et)}else{let I=function(S){const{uint16Array:M,uint32Array:V}=R;let D=S*2;for(;!k(D,M);)S=X(S),D=S*2;return H(S,V)},E=function(S){const{uint16Array:M,uint32Array:V}=R;let D=S*2;for(;!k(D,M);)S=q(S,V),D=S*2;return H(S,V)+O(D,M)};const u=X(n),p=q(n,d);let A=u,T=p,w,g,x,m;if(s&&(x=et,m=pt,N(A,a,x),N(T,a,m),w=s(x),g=s(m),g<w)){A=p,T=u;const S=w;w=g,g=S,x=m}x||(x=et,N(A,a,x));const b=k(A*2,r),h=e(x,b,w,o+1,c+A);let v;if(h===2){const S=I(A),V=E(A)-S;v=i(S,V,!0,o+1,c+A,x)}else v=h&&ye(A,t,e,i,s,c,o+1);if(v)return!0;m=pt,N(T,a,m);const B=k(T*2,r),P=e(m,B,g,o+1,c+T);let _;if(P===2){const S=I(T),V=E(T)-S;_=i(S,V,!0,o+1,c+T,m)}else _=P&&ye(T,t,e,i,s,c,o+1);return!!_}}const St=new y.Vector3,he=new y.Vector3;function qn(n,t,e={},i=0,s=1/0){const c=i*i,o=s*s;let a=1/0,r=null;if(n.shapecast({boundsTraverseOrder:l=>(St.copy(t).clamp(l.min,l.max),St.distanceToSquared(t)),intersectsBounds:(l,f,u)=>u<a&&u<o,intersectsTriangle:(l,f)=>{l.closestPointToPoint(t,St);const u=t.distanceToSquared(St);return u<a&&(he.copy(St),a=u,r=f),u<c}}),a===1/0)return null;const d=Math.sqrt(a);return e.point?e.point.copy(he):e.point=he.clone(),e.distance=d,e.faceIndex=r,e}const Ot=parseInt(y.REVISION)>=169,Wn=parseInt(y.REVISION)<=161,rt=new y.Vector3,ct=new y.Vector3,at=new y.Vector3,qt=new y.Vector2,Wt=new y.Vector2,Xt=new y.Vector2,We=new y.Vector3,Xe=new y.Vector3,Ye=new y.Vector3,_t=new y.Vector3;function Xn(n,t,e,i,s,c,o,a){let r;if(c===y.BackSide?r=n.intersectTriangle(i,e,t,!0,s):r=n.intersectTriangle(t,e,i,c!==y.DoubleSide,s),r===null)return null;const d=n.origin.distanceTo(s);return d<o||d>a?null:{distance:d,point:s.clone()}}function Yn(n,t,e,i,s,c,o,a,r,d,l){rt.fromBufferAttribute(t,c),ct.fromBufferAttribute(t,o),at.fromBufferAttribute(t,a);const f=Xn(n,rt,ct,at,_t,r,d,l);if(f){if(i){qt.fromBufferAttribute(i,c),Wt.fromBufferAttribute(i,o),Xt.fromBufferAttribute(i,a),f.uv=new y.Vector2;const p=y.Triangle.getInterpolation(_t,rt,ct,at,qt,Wt,Xt,f.uv);Ot||(f.uv=p)}if(s){qt.fromBufferAttribute(s,c),Wt.fromBufferAttribute(s,o),Xt.fromBufferAttribute(s,a),f.uv1=new y.Vector2;const p=y.Triangle.getInterpolation(_t,rt,ct,at,qt,Wt,Xt,f.uv1);Ot||(f.uv1=p),Wn&&(f.uv2=f.uv1)}if(e){We.fromBufferAttribute(e,c),Xe.fromBufferAttribute(e,o),Ye.fromBufferAttribute(e,a),f.normal=new y.Vector3;const p=y.Triangle.getInterpolation(_t,rt,ct,at,We,Xe,Ye,f.normal);f.normal.dot(n.direction)>0&&f.normal.multiplyScalar(-1),Ot||(f.normal=p)}const u={a:c,b:o,c:a,normal:new y.Vector3,materialIndex:0};if(y.Triangle.getNormal(rt,ct,at,u.normal),f.face=u,f.faceIndex=c,Ot){const p=new y.Vector3;y.Triangle.getBarycoord(_t,rt,ct,at,p),f.barycoord=p}}return f}function Yt(n,t,e,i,s,c,o){const a=i*3;let r=a+0,d=a+1,l=a+2;const f=n.index;n.index&&(r=f.getX(r),d=f.getX(d),l=f.getX(l));const{position:u,normal:p,uv:A,uv1:T}=n.attributes,w=Yn(e,u,p,A,T,r,d,l,t,c,o);return w?(w.faceIndex=i,s&&s.push(w),w):null}function z(n,t,e,i){const s=n.a,c=n.b,o=n.c;let a=t,r=t+1,d=t+2;e&&(a=e.getX(a),r=e.getX(r),d=e.getX(d)),s.x=i.getX(a),s.y=i.getY(a),s.z=i.getZ(a),c.x=i.getX(r),c.y=i.getY(r),c.z=i.getZ(r),o.x=i.getX(d),o.y=i.getY(d),o.z=i.getZ(d)}const It=new y.Vector3,Pt=new y.Vector3,Mt=new y.Vector3,$e=new y.Vector2,Ge=new y.Vector2,je=new y.Vector2;function $n(n,t,e,i){const s=t.getIndex().array,c=t.getAttribute("position"),o=t.getAttribute("uv"),a=s[e*3],r=s[e*3+1],d=s[e*3+2];It.fromBufferAttribute(c,a),Pt.fromBufferAttribute(c,r),Mt.fromBufferAttribute(c,d);let l=0;const f=t.groups,u=e*3;for(let T=0,w=f.length;T<w;T++){const g=f[T],{start:x,count:m}=g;if(u>=x&&u<x+m){l=g.materialIndex;break}}const p=i&&i.barycoord?i.barycoord:new y.Vector3;y.Triangle.getBarycoord(n,It,Pt,Mt,p);let A=null;return o&&($e.fromBufferAttribute(o,a),Ge.fromBufferAttribute(o,r),je.fromBufferAttribute(o,d),i&&i.uv?A=i.uv:A=new y.Vector2,y.Triangle.getInterpolation(n,It,Pt,Mt,$e,Ge,je,A)),i?(i.face||(i.face={}),i.face.a=a,i.face.b=r,i.face.c=d,i.face.materialIndex=l,i.face.normal||(i.face.normal=new y.Vector3),y.Triangle.getNormal(It,Pt,Mt,i.face.normal),A&&(i.uv=A),i.barycoord=p,i):{face:{a,b:r,c:d,materialIndex:l,normal:y.Triangle.getNormal(It,Pt,Mt,new y.Vector3)},uv:A,barycoord:p}}function Gn(n,t,e,i,s,c,o,a){const{geometry:r,_indirectBuffer:d}=n;for(let l=i,f=i+s;l<f;l++)Yt(r,t,e,l,c,o,a)}function jn(n,t,e,i,s,c,o){const{geometry:a,_indirectBuffer:r}=n;let d=1/0,l=null;for(let f=i,u=i+s;f<u;f++){let p;p=Yt(a,t,e,f,null,c,o),p&&p.distance<d&&(l=p,d=p.distance)}return l}function Zn(n,t,e,i,s,c,o){const{geometry:a}=e,{index:r}=a,d=a.attributes.position;for(let l=n,f=t+n;l<f;l++){let u;if(u=l,z(o,u*3,r,d),o.needsUpdate=!0,i(o,u,s,c))return!0}return!1}function Kn(n,t=null){t&&Array.isArray(t)&&(t=new Set(t));const e=n.geometry,i=e.index?e.index.array:null,s=e.attributes.position;let c,o,a,r,d=0;const l=n._roots;for(let u=0,p=l.length;u<p;u++)c=l[u],o=new Uint32Array(c),a=new Uint16Array(c),r=new Float32Array(c),f(0,d),d+=c.byteLength;function f(u,p,A=!1){const T=u*2;if(a[T+15]===65535){const g=o[u+6],x=a[T+14];let m=1/0,b=1/0,h=1/0,v=-1/0,B=-1/0,P=-1/0;for(let _=3*g,I=3*(g+x);_<I;_++){let E=i[_];const S=s.getX(E),M=s.getY(E),V=s.getZ(E);S<m&&(m=S),S>v&&(v=S),M<b&&(b=M),M>B&&(B=M),V<h&&(h=V),V>P&&(P=V)}return r[u+0]!==m||r[u+1]!==b||r[u+2]!==h||r[u+3]!==v||r[u+4]!==B||r[u+5]!==P?(r[u+0]=m,r[u+1]=b,r[u+2]=h,r[u+3]=v,r[u+4]=B,r[u+5]=P,!0):!1}else{const g=u+8,x=o[u+6],m=g+p,b=x+p;let h=A,v=!1,B=!1;t?h||(v=t.has(m),B=t.has(b),h=!v&&!B):(v=!0,B=!0);const P=h||v,_=h||B;let I=!1;P&&(I=f(g,p,h));let E=!1;_&&(E=f(x,p,h));const S=I||E;if(S)for(let M=0;M<3;M++){const V=g+M,D=x+M,C=r[V],W=r[V+3],st=r[D],ot=r[D+3];r[u+M]=C<st?C:st,r[u+M+3]=W>ot?W:ot}return S}}}function nt(n,t,e,i,s){let c,o,a,r,d,l;const f=1/e.direction.x,u=1/e.direction.y,p=1/e.direction.z,A=e.origin.x,T=e.origin.y,w=e.origin.z;let g=t[n],x=t[n+3],m=t[n+1],b=t[n+3+1],h=t[n+2],v=t[n+3+2];return f>=0?(c=(g-A)*f,o=(x-A)*f):(c=(x-A)*f,o=(g-A)*f),u>=0?(a=(m-T)*u,r=(b-T)*u):(a=(b-T)*u,r=(m-T)*u),c>r||a>o||((a>c||isNaN(c))&&(c=a),(r<o||isNaN(o))&&(o=r),p>=0?(d=(h-w)*p,l=(v-w)*p):(d=(v-w)*p,l=(h-w)*p),c>l||d>o)?!1:((d>c||c!==c)&&(c=d),(l<o||o!==o)&&(o=l),c<=s&&o>=i)}function Jn(n,t,e,i,s,c,o,a){const{geometry:r,_indirectBuffer:d}=n;for(let l=i,f=i+s;l<f;l++){let u=d?d[l]:l;Yt(r,t,e,u,c,o,a)}}function Qn(n,t,e,i,s,c,o){const{geometry:a,_indirectBuffer:r}=n;let d=1/0,l=null;for(let f=i,u=i+s;f<u;f++){let p;p=Yt(a,t,e,r?r[f]:f,null,c,o),p&&p.distance<d&&(l=p,d=p.distance)}return l}function ti(n,t,e,i,s,c,o){const{geometry:a}=e,{index:r}=a,d=a.attributes.position;for(let l=n,f=t+n;l<f;l++){let u;if(u=e.resolveTriangleIndex(l),z(o,u*3,r,d),o.needsUpdate=!0,i(o,u,s,c))return!0}return!1}function ei(n,t,e,i,s,c,o){R.setBuffer(n._roots[t]),xe(0,n,e,i,s,c,o),R.clearBuffer()}function xe(n,t,e,i,s,c,o){const{float32Array:a,uint16Array:r,uint32Array:d}=R,l=n*2;if(k(l,r)){const u=H(n,d),p=O(l,r);Gn(t,e,i,u,p,s,c,o)}else{const u=X(n);nt(u,a,i,c,o)&&xe(u,t,e,i,s,c,o);const p=q(n,d);nt(p,a,i,c,o)&&xe(p,t,e,i,s,c,o)}}const ni=["x","y","z"];function ii(n,t,e,i,s,c){R.setBuffer(n._roots[t]);const o=be(0,n,e,i,s,c);return R.clearBuffer(),o}function be(n,t,e,i,s,c){const{float32Array:o,uint16Array:a,uint32Array:r}=R;let d=n*2;if(k(d,a)){const f=H(n,r),u=O(d,a);return jn(t,e,i,f,u,s,c)}else{const f=ue(n,r),u=ni[f],A=i.direction[u]>=0;let T,w;A?(T=X(n),w=q(n,r)):(T=q(n,r),w=X(n));const x=nt(T,o,i,s,c)?be(T,t,e,i,s,c):null;if(x){const h=x.point[u];if(A?h<=o[w+f]:h>=o[w+f+3])return x}const b=nt(w,o,i,s,c)?be(w,t,e,i,s,c):null;return x&&b?x.distance<=b.distance?x:b:x||b||null}}const $t=new y.Box3,yt=new $,ht=new $,Et=new y.Matrix4,Ze=new U,Gt=new U;function si(n,t,e,i){R.setBuffer(n._roots[t]);const s=ge(0,n,e,i);return R.clearBuffer(),s}function ge(n,t,e,i,s=null){const{float32Array:c,uint16Array:o,uint32Array:a}=R;let r=n*2;if(s===null&&(e.boundingBox||e.computeBoundingBox(),Ze.set(e.boundingBox.min,e.boundingBox.max,i),s=Ze),k(r,o)){const l=t.geometry,f=l.index,u=l.attributes.position,p=e.index,A=e.attributes.position,T=H(n,a),w=O(r,o);if(Et.copy(i).invert(),e.boundsTree)return N(n,c,Gt),Gt.matrix.copy(Et),Gt.needsUpdate=!0,e.boundsTree.shapecast({intersectsBounds:x=>Gt.intersectsBox(x),intersectsTriangle:x=>{x.a.applyMatrix4(i),x.b.applyMatrix4(i),x.c.applyMatrix4(i),x.needsUpdate=!0;for(let m=T*3,b=(w+T)*3;m<b;m+=3)if(z(ht,m,f,u),ht.needsUpdate=!0,x.intersectsTriangle(ht))return!0;return!1}});{const g=Q(e);for(let x=T*3,m=(w+T)*3;x<m;x+=3){z(yt,x,f,u),yt.a.applyMatrix4(Et),yt.b.applyMatrix4(Et),yt.c.applyMatrix4(Et),yt.needsUpdate=!0;for(let b=0,h=g*3;b<h;b+=3)if(z(ht,b,p,A),ht.needsUpdate=!0,yt.intersectsTriangle(ht))return!0}}}else{const l=n+8,f=a[n+6];return N(l,c,$t),!!(s.intersectsBox($t)&&ge(l,t,e,i,s)||(N(f,c,$t),s.intersectsBox($t)&&ge(f,t,e,i,s)))}}const jt=new y.Matrix4,Ae=new U,Vt=new U,oi=new y.Vector3,ri=new y.Vector3,ci=new y.Vector3,ai=new y.Vector3;function li(n,t,e,i={},s={},c=0,o=1/0){t.boundingBox||t.computeBoundingBox(),Ae.set(t.boundingBox.min,t.boundingBox.max,e),Ae.needsUpdate=!0;const a=n.geometry,r=a.attributes.position,d=a.index,l=t.attributes.position,f=t.index,u=G.getPrimitive(),p=G.getPrimitive();let A=oi,T=ri,w=null,g=null;s&&(w=ci,g=ai);let x=1/0,m=null,b=null;return jt.copy(e).invert(),Vt.matrix.copy(jt),n.shapecast({boundsTraverseOrder:h=>Ae.distanceToBox(h),intersectsBounds:(h,v,B)=>B<x&&B<o?(v&&(Vt.min.copy(h.min),Vt.max.copy(h.max),Vt.needsUpdate=!0),!0):!1,intersectsRange:(h,v)=>{if(t.boundsTree)return t.boundsTree.shapecast({boundsTraverseOrder:P=>Vt.distanceToBox(P),intersectsBounds:(P,_,I)=>I<x&&I<o,intersectsRange:(P,_)=>{for(let I=P,E=P+_;I<E;I++){z(p,3*I,f,l),p.a.applyMatrix4(e),p.b.applyMatrix4(e),p.c.applyMatrix4(e),p.needsUpdate=!0;for(let S=h,M=h+v;S<M;S++){z(u,3*S,d,r),u.needsUpdate=!0;const V=u.distanceToTriangle(p,A,w);if(V<x&&(T.copy(A),g&&g.copy(w),x=V,m=S,b=I),V<c)return!0}}}});{const B=Q(t);for(let P=0,_=B;P<_;P++){z(p,3*P,f,l),p.a.applyMatrix4(e),p.b.applyMatrix4(e),p.c.applyMatrix4(e),p.needsUpdate=!0;for(let I=h,E=h+v;I<E;I++){z(u,3*I,d,r),u.needsUpdate=!0;const S=u.distanceToTriangle(p,A,w);if(S<x&&(T.copy(A),g&&g.copy(w),x=S,m=I,b=P),S<c)return!0}}}}}),G.releasePrimitive(u),G.releasePrimitive(p),x===1/0?null:(i.point?i.point.copy(T):i.point=T.clone(),i.distance=x,i.faceIndex=m,s&&(s.point?s.point.copy(g):s.point=g.clone(),s.point.applyMatrix4(jt),T.applyMatrix4(jt),s.distance=T.sub(s.point).length(),s.faceIndex=b),i)}function ui(n,t=null){t&&Array.isArray(t)&&(t=new Set(t));const e=n.geometry,i=e.index?e.index.array:null,s=e.attributes.position;let c,o,a,r,d=0;const l=n._roots;for(let u=0,p=l.length;u<p;u++)c=l[u],o=new Uint32Array(c),a=new Uint16Array(c),r=new Float32Array(c),f(0,d),d+=c.byteLength;function f(u,p,A=!1){const T=u*2;if(a[T+15]===65535){const g=o[u+6],x=a[T+14];let m=1/0,b=1/0,h=1/0,v=-1/0,B=-1/0,P=-1/0;for(let _=g,I=g+x;_<I;_++){const E=3*n.resolveTriangleIndex(_);for(let S=0;S<3;S++){let M=E+S;M=i?i[M]:M;const V=s.getX(M),D=s.getY(M),C=s.getZ(M);V<m&&(m=V),V>v&&(v=V),D<b&&(b=D),D>B&&(B=D),C<h&&(h=C),C>P&&(P=C)}}return r[u+0]!==m||r[u+1]!==b||r[u+2]!==h||r[u+3]!==v||r[u+4]!==B||r[u+5]!==P?(r[u+0]=m,r[u+1]=b,r[u+2]=h,r[u+3]=v,r[u+4]=B,r[u+5]=P,!0):!1}else{const g=u+8,x=o[u+6],m=g+p,b=x+p;let h=A,v=!1,B=!1;t?h||(v=t.has(m),B=t.has(b),h=!v&&!B):(v=!0,B=!0);const P=h||v,_=h||B;let I=!1;P&&(I=f(g,p,h));let E=!1;_&&(E=f(x,p,h));const S=I||E;if(S)for(let M=0;M<3;M++){const V=g+M,D=x+M,C=r[V],W=r[V+3],st=r[D],ot=r[D+3];r[u+M]=C<st?C:st,r[u+M+3]=W>ot?W:ot}return S}}}function fi(n,t,e,i,s,c,o){R.setBuffer(n._roots[t]),we(0,n,e,i,s,c,o),R.clearBuffer()}function we(n,t,e,i,s,c,o){const{float32Array:a,uint16Array:r,uint32Array:d}=R,l=n*2;if(k(l,r)){const u=H(n,d),p=O(l,r);Jn(t,e,i,u,p,s,c,o)}else{const u=X(n);nt(u,a,i,c,o)&&we(u,t,e,i,s,c,o);const p=q(n,d);nt(p,a,i,c,o)&&we(p,t,e,i,s,c,o)}}const di=["x","y","z"];function pi(n,t,e,i,s,c){R.setBuffer(n._roots[t]);const o=Te(0,n,e,i,s,c);return R.clearBuffer(),o}function Te(n,t,e,i,s,c){const{float32Array:o,uint16Array:a,uint32Array:r}=R;let d=n*2;if(k(d,a)){const f=H(n,r),u=O(d,a);return Qn(t,e,i,f,u,s,c)}else{const f=ue(n,r),u=di[f],A=i.direction[u]>=0;let T,w;A?(T=X(n),w=q(n,r)):(T=q(n,r),w=X(n));const x=nt(T,o,i,s,c)?Te(T,t,e,i,s,c):null;if(x){const h=x.point[u];if(A?h<=o[w+f]:h>=o[w+f+3])return x}const b=nt(w,o,i,s,c)?Te(w,t,e,i,s,c):null;return x&&b?x.distance<=b.distance?x:b:x||b||null}}const Zt=new y.Box3,xt=new $,bt=new $,Dt=new y.Matrix4,Ke=new U,Kt=new U;function mi(n,t,e,i){R.setBuffer(n._roots[t]);const s=ve(0,n,e,i);return R.clearBuffer(),s}function ve(n,t,e,i,s=null){const{float32Array:c,uint16Array:o,uint32Array:a}=R;let r=n*2;if(s===null&&(e.boundingBox||e.computeBoundingBox(),Ke.set(e.boundingBox.min,e.boundingBox.max,i),s=Ke),k(r,o)){const l=t.geometry,f=l.index,u=l.attributes.position,p=e.index,A=e.attributes.position,T=H(n,a),w=O(r,o);if(Dt.copy(i).invert(),e.boundsTree)return N(n,c,Kt),Kt.matrix.copy(Dt),Kt.needsUpdate=!0,e.boundsTree.shapecast({intersectsBounds:x=>Kt.intersectsBox(x),intersectsTriangle:x=>{x.a.applyMatrix4(i),x.b.applyMatrix4(i),x.c.applyMatrix4(i),x.needsUpdate=!0;for(let m=T,b=w+T;m<b;m++)if(z(bt,3*t.resolveTriangleIndex(m),f,u),bt.needsUpdate=!0,x.intersectsTriangle(bt))return!0;return!1}});{const g=Q(e);for(let x=T,m=w+T;x<m;x++){const b=t.resolveTriangleIndex(x);z(xt,3*b,f,u),xt.a.applyMatrix4(Dt),xt.b.applyMatrix4(Dt),xt.c.applyMatrix4(Dt),xt.needsUpdate=!0;for(let h=0,v=g*3;h<v;h+=3)if(z(bt,h,p,A),bt.needsUpdate=!0,xt.intersectsTriangle(bt))return!0}}}else{const l=n+8,f=a[n+6];return N(l,c,Zt),!!(s.intersectsBox(Zt)&&ve(l,t,e,i,s)||(N(f,c,Zt),s.intersectsBox(Zt)&&ve(f,t,e,i,s)))}}const Jt=new y.Matrix4,Be=new U,Ft=new U,yi=new y.Vector3,hi=new y.Vector3,xi=new y.Vector3,bi=new y.Vector3;function gi(n,t,e,i={},s={},c=0,o=1/0){t.boundingBox||t.computeBoundingBox(),Be.set(t.boundingBox.min,t.boundingBox.max,e),Be.needsUpdate=!0;const a=n.geometry,r=a.attributes.position,d=a.index,l=t.attributes.position,f=t.index,u=G.getPrimitive(),p=G.getPrimitive();let A=yi,T=hi,w=null,g=null;s&&(w=xi,g=bi);let x=1/0,m=null,b=null;return Jt.copy(e).invert(),Ft.matrix.copy(Jt),n.shapecast({boundsTraverseOrder:h=>Be.distanceToBox(h),intersectsBounds:(h,v,B)=>B<x&&B<o?(v&&(Ft.min.copy(h.min),Ft.max.copy(h.max),Ft.needsUpdate=!0),!0):!1,intersectsRange:(h,v)=>{if(t.boundsTree){const B=t.boundsTree;return B.shapecast({boundsTraverseOrder:P=>Ft.distanceToBox(P),intersectsBounds:(P,_,I)=>I<x&&I<o,intersectsRange:(P,_)=>{for(let I=P,E=P+_;I<E;I++){const S=B.resolveTriangleIndex(I);z(p,3*S,f,l),p.a.applyMatrix4(e),p.b.applyMatrix4(e),p.c.applyMatrix4(e),p.needsUpdate=!0;for(let M=h,V=h+v;M<V;M++){const D=n.resolveTriangleIndex(M);z(u,3*D,d,r),u.needsUpdate=!0;const C=u.distanceToTriangle(p,A,w);if(C<x&&(T.copy(A),g&&g.copy(w),x=C,m=M,b=I),C<c)return!0}}}})}else{const B=Q(t);for(let P=0,_=B;P<_;P++){z(p,3*P,f,l),p.a.applyMatrix4(e),p.b.applyMatrix4(e),p.c.applyMatrix4(e),p.needsUpdate=!0;for(let I=h,E=h+v;I<E;I++){const S=n.resolveTriangleIndex(I);z(u,3*S,d,r),u.needsUpdate=!0;const M=u.distanceToTriangle(p,A,w);if(M<x&&(T.copy(A),g&&g.copy(w),x=M,m=I,b=P),M<c)return!0}}}}}),G.releasePrimitive(u),G.releasePrimitive(p),x===1/0?null:(i.point?i.point.copy(T):i.point=T.clone(),i.distance=x,i.faceIndex=m,s&&(s.point?s.point.copy(g):s.point=g.clone(),s.point.applyMatrix4(Jt),T.applyMatrix4(Jt),s.distance=T.sub(s.point).length(),s.faceIndex=b),i)}function Je(){return typeof SharedArrayBuffer<"u"}function As(n,t){if(n===null)return n;if(n.buffer){const e=n.buffer;if(e.constructor===t)return n;const i=n.constructor,s=new i(new t(e.byteLength));return s.set(n),s}else{if(n.constructor===t)return n;const e=new t(n.byteLength);return new Uint8Array(e).set(new Uint8Array(n)),e}}const Ct=new R.constructor,Qt=new R.constructor,it=new me(()=>new y.Box3),gt=new y.Box3,At=new y.Box3,Se=new y.Box3,_e=new y.Box3;let Ie=!1;function Ai(n,t,e,i){if(Ie)throw new Error("MeshBVH: Recursive calls to bvhcast not supported.");Ie=!0;const s=n._roots,c=t._roots;let o,a=0,r=0;const d=new y.Matrix4().copy(e).invert();for(let l=0,f=s.length;l<f;l++){Ct.setBuffer(s[l]),r=0;const u=it.getPrimitive();N(0,Ct.float32Array,u),u.applyMatrix4(d);for(let p=0,A=c.length;p<A&&(Qt.setBuffer(c[p]),o=j(0,0,e,d,i,a,r,0,0,u),Qt.clearBuffer(),r+=c[p].length,!o);p++);if(it.releasePrimitive(u),Ct.clearBuffer(),a+=s[l].length,o)break}return Ie=!1,o}function j(n,t,e,i,s,c=0,o=0,a=0,r=0,d=null,l=!1){let f,u;l?(f=Qt,u=Ct):(f=Ct,u=Qt);const p=f.float32Array,A=f.uint32Array,T=f.uint16Array,w=u.float32Array,g=u.uint32Array,x=u.uint16Array,m=n*2,b=t*2,h=k(m,T),v=k(b,x);let B=!1;if(v&&h)l?B=s(H(t,g),O(t*2,x),H(n,A),O(n*2,T),r,o+t,a,c+n):B=s(H(n,A),O(n*2,T),H(t,g),O(t*2,x),a,c+n,r,o+t);else if(v){const P=it.getPrimitive();N(t,w,P),P.applyMatrix4(e);const _=X(n),I=q(n,A);N(_,p,gt),N(I,p,At);const E=P.intersectsBox(gt),S=P.intersectsBox(At);B=E&&j(t,_,i,e,s,o,c,r,a+1,P,!l)||S&&j(t,I,i,e,s,o,c,r,a+1,P,!l),it.releasePrimitive(P)}else{const P=X(t),_=q(t,g);N(P,w,Se),N(_,w,_e);const I=d.intersectsBox(Se),E=d.intersectsBox(_e);if(I&&E)B=j(n,P,e,i,s,c,o,a,r+1,d,l)||j(n,_,e,i,s,c,o,a,r+1,d,l);else if(I)if(h)B=j(n,P,e,i,s,c,o,a,r+1,d,l);else{const S=it.getPrimitive();S.copy(Se).applyMatrix4(e);const M=X(n),V=q(n,A);N(M,p,gt),N(V,p,At);const D=S.intersectsBox(gt),C=S.intersectsBox(At);B=D&&j(P,M,i,e,s,o,c,r,a+1,S,!l)||C&&j(P,V,i,e,s,o,c,r,a+1,S,!l),it.releasePrimitive(S)}else if(E)if(h)B=j(n,_,e,i,s,c,o,a,r+1,d,l);else{const S=it.getPrimitive();S.copy(_e).applyMatrix4(e);const M=X(n),V=q(n,A);N(M,p,gt),N(V,p,At);const D=S.intersectsBox(gt),C=S.intersectsBox(At);B=D&&j(_,M,i,e,s,o,c,r,a+1,S,!l)||C&&j(_,V,i,e,s,o,c,r,a+1,S,!l),it.releasePrimitive(S)}}return B}const te=new U,Qe=new y.Box3,wi={strategy:0,maxDepth:40,maxLeafTris:10,useSharedArrayBuffer:!1,setBoundingBox:!0,onProgress:null,indirect:!1,verbose:!0,range:null};class lt{static serialize(t,e={}){e={cloneBuffers:!0,...e};const i=t.geometry,s=t._roots,c=t._indirectBuffer,o=i.getIndex();let a;return e.cloneBuffers?a={roots:s.map(r=>r.slice()),index:o?o.array.slice():null,indirectBuffer:c?c.slice():null}:a={roots:s,index:o?o.array:null,indirectBuffer:c},a}static deserialize(t,e,i={}){i={setIndex:!0,indirect:!!t.indirectBuffer,...i};const{index:s,roots:c,indirectBuffer:o}=t,a=new lt(e,{...i,[ce]:!0});if(a._roots=c,a._indirectBuffer=o||null,i.setIndex){const r=e.getIndex();if(r===null){const d=new y.BufferAttribute(t.index,1,!1);e.setIndex(d)}else r.array!==s&&(r.array.set(s),r.needsUpdate=!0)}return a}get indirect(){return!!this._indirectBuffer}constructor(t,e={}){if(t.isBufferGeometry){if(t.index&&t.index.isInterleavedBufferAttribute)throw new Error("MeshBVH: InterleavedBufferAttribute is not supported for the index attribute.")}else throw new Error("MeshBVH: Only BufferGeometries are supported.");if(e=Object.assign({...wi,[ce]:!1},e),e.useSharedArrayBuffer&&!Je())throw new Error("MeshBVH: SharedArrayBuffer is not available.");this.geometry=t,this._roots=null,this._indirectBuffer=null,e[ce]||(Rn(this,e),!t.boundingBox&&e.setBoundingBox&&(t.boundingBox=this.getBoundingBox(new y.Box3))),this.resolveTriangleIndex=e.indirect?i=>this._indirectBuffer[i]:i=>i}refit(t=null){return(this.indirect?ui:Kn)(this,t)}traverse(t,e=0){const i=this._roots[e],s=new Uint32Array(i),c=new Uint16Array(i);o(0);function o(a,r=0){const d=a*2,l=c[d+15]===65535;if(l){const f=s[a+6],u=c[d+14];t(r,l,new Float32Array(i,a*4,6),f,u)}else{const f=a+8,u=s[a+6],p=s[a+7];t(r,l,new Float32Array(i,a*4,6),p)||(o(f,r+1),o(u,r+1))}}}raycast(t,e=y.FrontSide,i=0,s=1/0){const c=this._roots,o=this.geometry,a=[],r=e.isMaterial,d=Array.isArray(e),l=o.groups,f=r?e.side:e,u=this.indirect?fi:ei;for(let p=0,A=c.length;p<A;p++){const T=d?e[l[p].materialIndex].side:f,w=a.length;if(u(this,p,T,t,a,i,s),d){const g=l[p].materialIndex;for(let x=w,m=a.length;x<m;x++)a[x].face.materialIndex=g}}return a}raycastFirst(t,e=y.FrontSide,i=0,s=1/0){const c=this._roots,o=this.geometry,a=e.isMaterial,r=Array.isArray(e);let d=null;const l=o.groups,f=a?e.side:e,u=this.indirect?pi:ii;for(let p=0,A=c.length;p<A;p++){const T=r?e[l[p].materialIndex].side:f,w=u(this,p,T,t,i,s);w!=null&&(d==null||w.distance<d.distance)&&(d=w,r&&(w.face.materialIndex=l[p].materialIndex))}return d}intersectsGeometry(t,e){let i=!1;const s=this._roots,c=this.indirect?mi:si;for(let o=0,a=s.length;o<a&&(i=c(this,o,t,e),!i);o++);return i}shapecast(t){const e=G.getPrimitive(),i=this.indirect?ti:Zn;let{boundsTraverseOrder:s,intersectsBounds:c,intersectsRange:o,intersectsTriangle:a}=t;if(o&&a){const f=o;o=(u,p,A,T,w)=>f(u,p,A,T,w)?!0:i(u,p,this,a,A,T,e)}else o||(a?o=(f,u,p,A)=>i(f,u,this,a,p,A,e):o=(f,u,p)=>p);let r=!1,d=0;const l=this._roots;for(let f=0,u=l.length;f<u;f++){const p=l[f];if(r=On(this,f,c,o,s,d),r)break;d+=p.byteLength}return G.releasePrimitive(e),r}bvhcast(t,e,i){let{intersectsRanges:s,intersectsTriangles:c}=i;const o=G.getPrimitive(),a=this.geometry.index,r=this.geometry.attributes.position,d=this.indirect?A=>{const T=this.resolveTriangleIndex(A);z(o,T*3,a,r)}:A=>{z(o,A*3,a,r)},l=G.getPrimitive(),f=t.geometry.index,u=t.geometry.attributes.position,p=t.indirect?A=>{const T=t.resolveTriangleIndex(A);z(l,T*3,f,u)}:A=>{z(l,A*3,f,u)};if(c){const A=(T,w,g,x,m,b,h,v)=>{for(let B=g,P=g+x;B<P;B++){p(B),l.a.applyMatrix4(e),l.b.applyMatrix4(e),l.c.applyMatrix4(e),l.needsUpdate=!0;for(let _=T,I=T+w;_<I;_++)if(d(_),o.needsUpdate=!0,c(o,l,_,B,m,b,h,v))return!0}return!1};if(s){const T=s;s=function(w,g,x,m,b,h,v,B){return T(w,g,x,m,b,h,v,B)?!0:A(w,g,x,m,b,h,v,B)}}else s=A}return Ai(this,t,e,s)}intersectsBox(t,e){return te.set(t.min,t.max,e),te.needsUpdate=!0,this.shapecast({intersectsBounds:i=>te.intersectsBox(i),intersectsTriangle:i=>te.intersectsTriangle(i)})}intersectsSphere(t){return this.shapecast({intersectsBounds:e=>t.intersectsBox(e),intersectsTriangle:e=>e.intersectsSphere(t)})}closestPointToGeometry(t,e,i={},s={},c=0,o=1/0){return(this.indirect?gi:li)(this,t,e,i,s,c,o)}closestPointToPoint(t,e={},i=0,s=1/0){return qn(this,t,e,i,s)}getBoundingBox(t){return t.makeEmpty(),this._roots.forEach(i=>{N(0,new Float32Array(i),Qe),t.union(Qe)}),t}}const tn=new y.Box3,en=new y.Matrix4;class Ti extends y.Object3D{get isMesh(){return!this.displayEdges}get isLineSegments(){return this.displayEdges}get isLine(){return this.displayEdges}getVertexPosition(...t){return y.Mesh.prototype.getVertexPosition.call(this,...t)}constructor(t,e,i=10,s=0){super(),this.material=e,this.geometry=new y.BufferGeometry,this.name="MeshBVHRootHelper",this.depth=i,this.displayParents=!1,this.bvh=t,this.displayEdges=!0,this._group=s}raycast(){}update(){const t=this.geometry,e=this.bvh,i=this._group;if(t.dispose(),this.visible=!1,e){const s=this.depth-1,c=this.displayParents;let o=0;e.traverse((u,p)=>{if(u>=s||p)return o++,!0;c&&o++},i);let a=0;const r=new Float32Array(8*3*o);e.traverse((u,p,A)=>{const T=u>=s||p;if(T||c){N(0,A,tn);const{min:w,max:g}=tn;for(let x=-1;x<=1;x+=2){const m=x<0?w.x:g.x;for(let b=-1;b<=1;b+=2){const h=b<0?w.y:g.y;for(let v=-1;v<=1;v+=2){const B=v<0?w.z:g.z;r[a+0]=m,r[a+1]=h,r[a+2]=B,a+=3}}}return T}},i);let d,l;this.displayEdges?l=new Uint8Array([0,4,1,5,2,6,3,7,0,2,1,3,4,6,5,7,0,1,2,3,4,5,6,7]):l=new Uint8Array([0,1,2,2,1,3,4,6,5,6,7,5,1,4,5,0,4,1,2,3,6,3,7,6,0,2,4,2,6,4,1,5,3,3,5,7]),r.length>65535?d=new Uint32Array(l.length*o):d=new Uint16Array(l.length*o);const f=l.length;for(let u=0;u<o;u++){const p=u*8,A=u*f;for(let T=0;T<f;T++)d[A+T]=p+l[T]}t.setIndex(new y.BufferAttribute(d,1,!1)),t.setAttribute("position",new y.BufferAttribute(r,3,!1)),this.visible=!0}}}class ee extends y.Group{get color(){return this.edgeMaterial.color}get opacity(){return this.edgeMaterial.opacity}set opacity(t){this.edgeMaterial.opacity=t,this.meshMaterial.opacity=t}constructor(t=null,e=null,i=10){t instanceof lt&&(i=e||10,e=t,t=null),typeof e=="number"&&(i=e,e=null),super(),this.name="MeshBVHHelper",this.depth=i,this.mesh=t,this.bvh=e,this.displayParents=!1,this.displayEdges=!0,this.objectIndex=0,this._roots=[];const s=new y.LineBasicMaterial({color:65416,transparent:!0,opacity:.3,depthWrite:!1}),c=new y.MeshBasicMaterial({color:65416,transparent:!0,opacity:.3,depthWrite:!1});c.color=s.color,this.edgeMaterial=s,this.meshMaterial=c,this.update()}update(){const t=this.mesh;let e=this.bvh||t.geometry.boundsTree||null;if(t&&t.isBatchedMesh&&t.boundsTrees&&!e){const s=t._drawInfo[this.objectIndex];s&&(e=t.boundsTrees[s.geometryIndex]||e)}const i=e?e._roots.length:0;for(;this._roots.length>i;){const s=this._roots.pop();s.geometry.dispose(),this.remove(s)}for(let s=0;s<i;s++){const{depth:c,edgeMaterial:o,meshMaterial:a,displayParents:r,displayEdges:d}=this;if(s>=this._roots.length){const f=new Ti(e,o,c,s);this.add(f),this._roots.push(f)}const l=this._roots[s];l.bvh=e,l.depth=c,l.displayParents=r,l.displayEdges=d,l.material=d?o:a,l.update()}}updateMatrixWorld(...t){const e=this.mesh,i=this.parent;e!==null&&(e.updateWorldMatrix(!0,!1),i?this.matrix.copy(i.matrixWorld).invert().multiply(e.matrixWorld):this.matrix.copy(e.matrixWorld),(e.isInstancedMesh||e.isBatchedMesh)&&(e.getMatrixAt(this.objectIndex,en),this.matrix.multiply(en)),this.matrix.decompose(this.position,this.quaternion,this.scale)),super.updateMatrixWorld(...t)}copy(t){this.depth=t.depth,this.mesh=t.mesh,this.bvh=t.bvh,this.opacity=t.opacity,this.color.copy(t.color)}clone(){return new ee(this.mesh,this.bvh,this.depth)}dispose(){this.edgeMaterial.dispose(),this.meshMaterial.dispose();const t=this.children;for(let e=0,i=t.length;e<i;e++)t[e].geometry.dispose()}}class ws extends ee{constructor(...t){super(...t),console.warn("MeshBVHVisualizer: MeshBVHVisualizer has been deprecated. Use MeshBVHHelper, instead.")}}const Nt=new y.Box3,nn=new y.Box3,wt=new y.Vector3;function sn(n){switch(typeof n){case"number":return 8;case"string":return n.length*2;case"boolean":return 4;default:return 0}}function vi(n){return/(Uint|Int|Float)(8|16|32)Array/.test(n.constructor.name)}function Bi(n,t){const e={nodeCount:0,leafNodeCount:0,depth:{min:1/0,max:-1/0},tris:{min:1/0,max:-1/0},splits:[0,0,0],surfaceAreaScore:0};return n.traverse((i,s,c,o,a)=>{const r=c[3]-c[0],d=c[4]-c[1],l=c[5]-c[2],f=2*(r*d+d*l+l*r);e.nodeCount++,s?(e.leafNodeCount++,e.depth.min=Math.min(i,e.depth.min),e.depth.max=Math.max(i,e.depth.max),e.tris.min=Math.min(a,e.tris.min),e.tris.max=Math.max(a,e.tris.max),e.surfaceAreaScore+=f*1.25*a):(e.splits[o]++,e.surfaceAreaScore+=f*1)},t),e.tris.min===1/0&&(e.tris.min=0,e.tris.max=0),e.depth.min===1/0&&(e.depth.min=0,e.depth.max=0),e}function Si(n){return n._roots.map((t,e)=>Bi(n,e))}function _i(n){const t=new Set,e=[n];let i=0;for(;e.length;){const s=e.pop();if(!t.has(s)){t.add(s);for(let c in s){if(!Object.hasOwn(s,c))continue;i+=sn(c);const o=s[c];o&&(typeof o=="object"||typeof o=="function")?vi(o)||Je()&&o instanceof SharedArrayBuffer||o instanceof ArrayBuffer?i+=o.byteLength:e.push(o):i+=sn(o)}}}return i}function Ii(n){const t=n.geometry,e=[],i=t.index,s=t.getAttribute("position");let c=!0;return n.traverse((o,a,r,d,l)=>{const f={depth:o,isLeaf:a,boundingData:r,offset:d,count:l};e[o]=f,N(0,r,Nt);const u=e[o-1];if(a)for(let p=d,A=d+l;p<A;p++){const T=n.resolveTriangleIndex(p);let w=3*T,g=3*T+1,x=3*T+2;i&&(w=i.getX(w),g=i.getX(g),x=i.getX(x));let m;wt.fromBufferAttribute(s,w),m=Nt.containsPoint(wt),wt.fromBufferAttribute(s,g),m=m&&Nt.containsPoint(wt),wt.fromBufferAttribute(s,x),m=m&&Nt.containsPoint(wt),console.assert(m,"Leaf bounds does not fully contain triangle."),c=c&&m}if(u){N(0,r,nn);const p=nn.containsBox(Nt);console.assert(p,"Parent bounds does not fully contain child."),c=c&&p}}),c}function Pi(n){const t=[];return n.traverse((e,i,s,c,o)=>{const a={bounds:N(0,s,new y.Box3)};i?(a.count=o,a.offset=c):(a.left=null,a.right=null),t[e]=a;const r=t[e-1];r&&(r.left===null?r.left=a:r.right=a)}),t[0]}function on(n,t,e){return n===null?null:(n.point.applyMatrix4(t.matrixWorld),n.distance=n.point.distanceTo(e.ray.origin),n.object=t,n)}const Mi=parseInt(y.REVISION)>=166,ne=new y.Ray,rn=new y.Vector3,cn=new y.Matrix4,Ei=y.Mesh.prototype.raycast,Vi=y.BatchedMesh.prototype.raycast,an=new y.Vector3,L=new y.Mesh,ie=[];function Di(n,t){this.isBatchedMesh?Fi.call(this,n,t):Ci.call(this,n,t)}function Fi(n,t){if(this.boundsTrees){const e=this.boundsTrees,i=this._drawInfo||this._instanceInfo,s=this._drawRanges||this._geometryInfo,c=this.matrixWorld;L.material=this.material,L.geometry=this.geometry;const o=L.geometry.boundsTree,a=L.geometry.drawRange;L.geometry.boundingSphere===null&&(L.geometry.boundingSphere=new y.Sphere);for(let r=0,d=i.length;r<d;r++){if(!this.getVisibleAt(r))continue;const l=i[r].geometryIndex;if(L.geometry.boundsTree=e[l],this.getMatrixAt(r,L.matrixWorld).premultiply(c),!L.geometry.boundsTree){this.getBoundingBoxAt(l,L.geometry.boundingBox),this.getBoundingSphereAt(l,L.geometry.boundingSphere);const f=s[l];L.geometry.setDrawRange(f.start,f.count)}L.raycast(n,ie);for(let f=0,u=ie.length;f<u;f++){const p=ie[f];p.object=this,p.batchId=r,t.push(p)}ie.length=0}L.geometry.boundsTree=o,L.geometry.drawRange=a,L.material=null,L.geometry=null}else Vi.call(this,n,t)}function Ci(n,t){if(this.geometry.boundsTree){if(this.material===void 0)return;cn.copy(this.matrixWorld).invert(),ne.copy(n.ray).applyMatrix4(cn),an.setFromMatrixScale(this.matrixWorld),rn.copy(ne.direction).multiply(an);const e=rn.length(),i=n.near/e,s=n.far/e,c=this.geometry.boundsTree;if(n.firstHitOnly===!0){const o=on(c.raycastFirst(ne,this.material,i,s),this,n);o&&t.push(o)}else{const o=c.raycast(ne,this.material,i,s);for(let a=0,r=o.length;a<r;a++){const d=on(o[a],this,n);d&&t.push(d)}}}else Ei.call(this,n,t)}function Ni(n={}){return this.boundsTree=new lt(this,n),this.boundsTree}function Ri(){this.boundsTree=null}function zi(n=-1,t={}){if(!Mi)throw new Error("BatchedMesh: Three r166+ is required to compute bounds trees.");t.indirect&&console.warn('"Indirect" is set to false because it is not supported for BatchedMesh.'),t={...t,indirect:!1,range:null};const e=this._drawRanges||this._geometryInfo,i=this._geometryCount;this.boundsTrees||(this.boundsTrees=new Array(i).fill(null));const s=this.boundsTrees;for(;s.length<i;)s.push(null);if(n<0){for(let c=0;c<i;c++)t.range=e[c],s[c]=new lt(this.geometry,t);return s}else return n<e.length&&(t.range=e[n],s[n]=new lt(this.geometry,t)),s[n]||null}function Li(n=-1){n<0?this.boundsTrees.fill(null):n<this.boundsTree.length&&(this.boundsTrees[n]=null)}function Ui(n){switch(n){case 1:return"R";case 2:return"RG";case 3:return"RGBA";case 4:return"RGBA"}throw new Error}function ki(n){switch(n){case 1:return y.RedFormat;case 2:return y.RGFormat;case 3:return y.RGBAFormat;case 4:return y.RGBAFormat}}function ln(n){switch(n){case 1:return y.RedIntegerFormat;case 2:return y.RGIntegerFormat;case 3:return y.RGBAIntegerFormat;case 4:return y.RGBAIntegerFormat}}class se extends y.DataTexture{constructor(){super(),this.minFilter=y.NearestFilter,this.magFilter=y.NearestFilter,this.generateMipmaps=!1,this.overrideItemSize=null,this._forcedType=null}updateFrom(t){const e=this.overrideItemSize,i=t.itemSize,s=t.count;if(e!==null){if(i*s%e!==0)throw new Error("VertexAttributeTexture: overrideItemSize must divide evenly into buffer length.");t.itemSize=e,t.count=s*i/e}const c=t.itemSize,o=t.count,a=t.normalized,r=t.array.constructor,d=r.BYTES_PER_ELEMENT;let l=this._forcedType,f=c;if(l===null)switch(r){case Float32Array:l=y.FloatType;break;case Uint8Array:case Uint16Array:case Uint32Array:l=y.UnsignedIntType;break;case Int8Array:case Int16Array:case Int32Array:l=y.IntType;break}let u,p,A,T,w=Ui(c);switch(l){case y.FloatType:A=1,p=ki(c),a&&d===1?(T=r,w+="8",r===Uint8Array?u=y.UnsignedByteType:(u=y.ByteType,w+="_SNORM")):(T=Float32Array,w+="32F",u=y.FloatType);break;case y.IntType:w+=d*8+"I",A=a?Math.pow(2,r.BYTES_PER_ELEMENT*8-1):1,p=ln(c),d===1?(T=Int8Array,u=y.ByteType):d===2?(T=Int16Array,u=y.ShortType):(T=Int32Array,u=y.IntType);break;case y.UnsignedIntType:w+=d*8+"UI",A=a?Math.pow(2,r.BYTES_PER_ELEMENT*8-1):1,p=ln(c),d===1?(T=Uint8Array,u=y.UnsignedByteType):d===2?(T=Uint16Array,u=y.UnsignedShortType):(T=Uint32Array,u=y.UnsignedIntType);break}f===3&&(p===y.RGBAFormat||p===y.RGBAIntegerFormat)&&(f=4);const g=Math.ceil(Math.sqrt(o))||1,x=f*g*g,m=new T(x),b=t.normalized;t.normalized=!1;for(let h=0;h<o;h++){const v=f*h;m[v]=t.getX(h)/A,c>=2&&(m[v+1]=t.getY(h)/A),c>=3&&(m[v+2]=t.getZ(h)/A,f===4&&(m[v+3]=1)),c>=4&&(m[v+3]=t.getW(h)/A)}t.normalized=b,this.internalFormat=w,this.format=p,this.type=u,this.image.width=g,this.image.height=g,this.image.data=m,this.needsUpdate=!0,this.dispose(),t.itemSize=i,t.count=s}}class un extends se{constructor(){super(),this._forcedType=y.UnsignedIntType}}class Hi extends se{constructor(){super(),this._forcedType=y.IntType}}class fn extends se{constructor(){super(),this._forcedType=y.FloatType}}class Oi{constructor(){this.index=new un,this.position=new fn,this.bvhBounds=new y.DataTexture,this.bvhContents=new y.DataTexture,this._cachedIndexAttr=null,this.index.overrideItemSize=3}updateFrom(t){const{geometry:e}=t;if(Wi(t,this.bvhBounds,this.bvhContents),this.position.updateFrom(e.attributes.position),t.indirect){const i=t._indirectBuffer;if(this._cachedIndexAttr===null||this._cachedIndexAttr.count!==i.length)if(e.index)this._cachedIndexAttr=e.index.clone();else{const s=Ne(Ce(e));this._cachedIndexAttr=new y.BufferAttribute(s,1,!1)}qi(e,i,this._cachedIndexAttr),this.index.updateFrom(this._cachedIndexAttr)}else this.index.updateFrom(e.index)}dispose(){const{index:t,position:e,bvhBounds:i,bvhContents:s}=this;t&&t.dispose(),e&&e.dispose(),i&&i.dispose(),s&&s.dispose()}}function qi(n,t,e){const i=e.array,s=n.index?n.index.array:null;for(let c=0,o=t.length;c<o;c++){const a=3*c,r=3*t[c];for(let d=0;d<3;d++)i[a+d]=s?s[r+d]:r+d}}function Wi(n,t,e){const i=n._roots;if(i.length!==1)throw new Error("MeshBVHUniformStruct: Multi-root BVHs not supported.");const s=i[0],c=new Uint16Array(s),o=new Uint32Array(s),a=new Float32Array(s),r=s.byteLength/32,d=2*Math.ceil(Math.sqrt(r/2)),l=new Float32Array(4*d*d),f=Math.ceil(Math.sqrt(r)),u=new Uint32Array(2*f*f);for(let p=0;p<r;p++){const A=p*32/4,T=A*2,w=A;for(let g=0;g<3;g++)l[8*p+0+g]=a[w+0+g],l[8*p+4+g]=a[w+3+g];if(k(T,c)){const g=O(T,c),x=H(A,o),m=4294901760|g;u[p*2+0]=m,u[p*2+1]=x}else{const g=4*q(A,o)/32,x=ue(A,o);u[p*2+0]=x,u[p*2+1]=g}}t.image.data=l,t.image.width=d,t.image.height=d,t.format=y.RGBAFormat,t.type=y.FloatType,t.internalFormat="RGBA32F",t.minFilter=y.NearestFilter,t.magFilter=y.NearestFilter,t.generateMipmaps=!1,t.needsUpdate=!0,t.dispose(),e.image.data=u,e.image.width=f,e.image.height=f,e.format=y.RGIntegerFormat,e.type=y.UnsignedIntType,e.internalFormat="RG32UI",e.minFilter=y.NearestFilter,e.magFilter=y.NearestFilter,e.generateMipmaps=!1,e.needsUpdate=!0,e.dispose()}const ut=new y.Vector3,ft=new y.Vector3,dt=new y.Vector3,dn=new y.Vector4,oe=new y.Vector3,Pe=new y.Vector3,pn=new y.Vector4,mn=new y.Vector4,re=new y.Matrix4,yn=new y.Matrix4;function Rt(n,t){if(!n&&!t)return;const e=n.count===t.count,i=n.normalized===t.normalized,s=n.array.constructor===t.array.constructor,c=n.itemSize===t.itemSize;if(!e||!i||!s||!c)throw new Error}function zt(n,t=null){const e=n.array.constructor,i=n.normalized,s=n.itemSize,c=t===null?n.count:t;return new y.BufferAttribute(new e(s*c),s,i)}function hn(n,t,e=0){if(n.isInterleavedBufferAttribute){const i=n.itemSize;for(let s=0,c=n.count;s<c;s++){const o=s+e;t.setX(o,n.getX(s)),i>=2&&t.setY(o,n.getY(s)),i>=3&&t.setZ(o,n.getZ(s)),i>=4&&t.setW(o,n.getW(s))}}else{const i=t.array,s=i.constructor,c=i.BYTES_PER_ELEMENT*n.itemSize*e;new s(i.buffer,c,n.array.length).set(n.array)}}function Xi(n,t,e){const i=n.elements,s=t.elements;for(let c=0,o=s.length;c<o;c++)i[c]+=s[c]*e}function xn(n,t,e){const i=n.skeleton,s=n.geometry,c=i.bones,o=i.boneInverses;pn.fromBufferAttribute(s.attributes.skinIndex,t),mn.fromBufferAttribute(s.attributes.skinWeight,t),re.elements.fill(0);for(let a=0;a<4;a++){const r=mn.getComponent(a);if(r!==0){const d=pn.getComponent(a);yn.multiplyMatrices(c[d].matrixWorld,o[d]),Xi(re,yn,r)}}return re.multiply(n.bindMatrix).premultiply(n.bindMatrixInverse),e.transformDirection(re),e}function Me(n,t,e,i,s){oe.set(0,0,0);for(let c=0,o=n.length;c<o;c++){const a=t[c],r=n[c];a!==0&&(Pe.fromBufferAttribute(r,i),e?oe.addScaledVector(Pe,a):oe.addScaledVector(Pe.sub(s),a))}s.add(oe)}function Yi(n,t={useGroups:!1,updateIndex:!1,skipAttributes:[]},e=new y.BufferGeometry){const i=n[0].index!==null,{useGroups:s=!1,updateIndex:c=!1,skipAttributes:o=[]}=t,a=new Set(Object.keys(n[0].attributes)),r={};let d=0;e.clearGroups();for(let l=0;l<n.length;++l){const f=n[l];let u=0;if(i!==(f.index!==null))throw new Error("StaticGeometryGenerator: All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.");for(const p in f.attributes){if(!a.has(p))throw new Error('StaticGeometryGenerator: All geometries must have compatible attributes; make sure "'+p+'" attribute exists among all geometries, or in none of them.');r[p]===void 0&&(r[p]=[]),r[p].push(f.attributes[p]),u++}if(u!==a.size)throw new Error("StaticGeometryGenerator: Make sure all geometries have the same number of attributes.");if(s){let p;if(i)p=f.index.count;else if(f.attributes.position!==void 0)p=f.attributes.position.count;else throw new Error("StaticGeometryGenerator: The geometry must have either an index or a position attribute");e.addGroup(d,p,l),d+=p}}if(i){let l=!1;if(!e.index){let f=0;for(let u=0;u<n.length;++u)f+=n[u].index.count;e.setIndex(new y.BufferAttribute(new Uint32Array(f),1,!1)),l=!0}if(c||l){const f=e.index;let u=0,p=0;for(let A=0;A<n.length;++A){const T=n[A],w=T.index;if(o[A]!==!0)for(let g=0;g<w.count;++g)f.setX(u,w.getX(g)+p),u++;p+=T.attributes.position.count}}}for(const l in r){const f=r[l];if(!(l in e.attributes)){let A=0;for(const T in f)A+=f[T].count;e.setAttribute(l,zt(r[l][0],A))}const u=e.attributes[l];let p=0;for(let A=0,T=f.length;A<T;A++){const w=f[A];o[A]!==!0&&hn(w,u,p),p+=w.count}}return e}function $i(n,t){if(n===null||t===null)return n===t;if(n.length!==t.length)return!1;for(let e=0,i=n.length;e<i;e++)if(n[e]!==t[e])return!1;return!0}function Gi(n){const{index:t,attributes:e}=n;if(t)for(let i=0,s=t.count;i<s;i+=3){const c=t.getX(i),o=t.getX(i+2);t.setX(i,o),t.setX(i+2,c)}else for(const i in e){const s=e[i],c=s.itemSize;for(let o=0,a=s.count;o<a;o+=3)for(let r=0;r<c;r++){const d=s.getComponent(o,r),l=s.getComponent(o+2,r);s.setComponent(o,r,l),s.setComponent(o+2,r,d)}}return n}class ji{constructor(t){this.matrixWorld=new y.Matrix4,this.geometryHash=null,this.boneMatrices=null,this.primitiveCount=-1,this.mesh=t,this.update()}update(){const t=this.mesh,e=t.geometry,i=t.skeleton,s=(e.index?e.index.count:e.attributes.position.count)/3;if(this.matrixWorld.copy(t.matrixWorld),this.geometryHash=e.attributes.position.version,this.primitiveCount=s,i){i.boneTexture||i.computeBoneTexture(),i.update();const c=i.boneMatrices;!this.boneMatrices||this.boneMatrices.length!==c.length?this.boneMatrices=c.slice():this.boneMatrices.set(c)}else this.boneMatrices=null}didChange(){const t=this.mesh,e=t.geometry,i=(e.index?e.index.count:e.attributes.position.count)/3;return!(this.matrixWorld.equals(t.matrixWorld)&&this.geometryHash===e.attributes.position.version&&$i(t.skeleton&&t.skeleton.boneMatrices||null,this.boneMatrices)&&this.primitiveCount===i)}}class Zi{constructor(t){Array.isArray(t)||(t=[t]);const e=[];t.forEach(i=>{i.traverseVisible(s=>{s.isMesh&&e.push(s)})}),this.meshes=e,this.useGroups=!0,this.applyWorldTransforms=!0,this.attributes=["position","normal","color","tangent","uv","uv2"],this._intermediateGeometry=new Array(e.length).fill().map(()=>new y.BufferGeometry),this._diffMap=new WeakMap}getMaterials(){const t=[];return this.meshes.forEach(e=>{Array.isArray(e.material)?t.push(...e.material):t.push(e.material)}),t}generate(t=new y.BufferGeometry){let e=[];const{meshes:i,useGroups:s,_intermediateGeometry:c,_diffMap:o}=this;for(let a=0,r=i.length;a<r;a++){const d=i[a],l=c[a],f=o.get(d);!f||f.didChange(d)?(this._convertToStaticGeometry(d,l),e.push(!1),f?f.update():o.set(d,new ji(d))):e.push(!0)}if(c.length===0){t.setIndex(null);const a=t.attributes;for(const r in a)t.deleteAttribute(r);for(const r in this.attributes)t.setAttribute(this.attributes[r],new y.BufferAttribute(new Float32Array(0),4,!1))}else Yi(c,{useGroups:s,skipAttributes:e},t);for(const a in t.attributes)t.attributes[a].needsUpdate=!0;return t}_convertToStaticGeometry(t,e=new y.BufferGeometry){const i=t.geometry,s=this.applyWorldTransforms,c=this.attributes.includes("normal"),o=this.attributes.includes("tangent"),a=i.attributes,r=e.attributes;!e.index&&i.index&&(e.index=i.index.clone()),r.position||e.setAttribute("position",zt(a.position)),c&&!r.normal&&a.normal&&e.setAttribute("normal",zt(a.normal)),o&&!r.tangent&&a.tangent&&e.setAttribute("tangent",zt(a.tangent)),Rt(i.index,e.index),Rt(a.position,r.position),c&&Rt(a.normal,r.normal),o&&Rt(a.tangent,r.tangent);const d=a.position,l=c?a.normal:null,f=o?a.tangent:null,u=i.morphAttributes.position,p=i.morphAttributes.normal,A=i.morphAttributes.tangent,T=i.morphTargetsRelative,w=t.morphTargetInfluences,g=new y.Matrix3;g.getNormalMatrix(t.matrixWorld),i.index&&e.index.array.set(i.index.array);for(let x=0,m=a.position.count;x<m;x++)ut.fromBufferAttribute(d,x),l&&ft.fromBufferAttribute(l,x),f&&(dn.fromBufferAttribute(f,x),dt.fromBufferAttribute(f,x)),w&&(u&&Me(u,w,T,x,ut),p&&Me(p,w,T,x,ft),A&&Me(A,w,T,x,dt)),t.isSkinnedMesh&&(t.applyBoneTransform(x,ut),l&&xn(t,x,ft),f&&xn(t,x,dt)),s&&ut.applyMatrix4(t.matrixWorld),r.position.setXYZ(x,ut.x,ut.y,ut.z),l&&(s&&ft.applyNormalMatrix(g),r.normal.setXYZ(x,ft.x,ft.y,ft.z)),f&&(s&&dt.transformDirection(t.matrixWorld),r.tangent.setXYZW(x,dt.x,dt.y,dt.z,dn.w));for(const x in this.attributes){const m=this.attributes[x];m==="position"||m==="tangent"||m==="normal"||!(m in a)||(r[m]||e.setAttribute(m,zt(a[m])),Rt(a[m],r[m]),hn(a[m],r[m]))}return t.matrixWorld.determinant()<0&&Gi(e),e}}const bn=`

// A stack of uint32 indices can can store the indices for
// a perfectly balanced tree with a depth up to 31. Lower stack
// depth gets higher performance.
//
// However not all trees are balanced. Best value to set this to
// is the trees max depth.
#ifndef BVH_STACK_DEPTH
#define BVH_STACK_DEPTH 60
#endif

#ifndef INFINITY
#define INFINITY 1e20
#endif

// Utilities
uvec4 uTexelFetch1D( usampler2D tex, uint index ) {

	uint width = uint( textureSize( tex, 0 ).x );
	uvec2 uv;
	uv.x = index % width;
	uv.y = index / width;

	return texelFetch( tex, ivec2( uv ), 0 );

}

ivec4 iTexelFetch1D( isampler2D tex, uint index ) {

	uint width = uint( textureSize( tex, 0 ).x );
	uvec2 uv;
	uv.x = index % width;
	uv.y = index / width;

	return texelFetch( tex, ivec2( uv ), 0 );

}

vec4 texelFetch1D( sampler2D tex, uint index ) {

	uint width = uint( textureSize( tex, 0 ).x );
	uvec2 uv;
	uv.x = index % width;
	uv.y = index / width;

	return texelFetch( tex, ivec2( uv ), 0 );

}

vec4 textureSampleBarycoord( sampler2D tex, vec3 barycoord, uvec3 faceIndices ) {

	return
		barycoord.x * texelFetch1D( tex, faceIndices.x ) +
		barycoord.y * texelFetch1D( tex, faceIndices.y ) +
		barycoord.z * texelFetch1D( tex, faceIndices.z );

}

void ndcToCameraRay(
	vec2 coord, mat4 cameraWorld, mat4 invProjectionMatrix,
	out vec3 rayOrigin, out vec3 rayDirection
) {

	// get camera look direction and near plane for camera clipping
	vec4 lookDirection = cameraWorld * vec4( 0.0, 0.0, - 1.0, 0.0 );
	vec4 nearVector = invProjectionMatrix * vec4( 0.0, 0.0, - 1.0, 1.0 );
	float near = abs( nearVector.z / nearVector.w );

	// get the camera direction and position from camera matrices
	vec4 origin = cameraWorld * vec4( 0.0, 0.0, 0.0, 1.0 );
	vec4 direction = invProjectionMatrix * vec4( coord, 0.5, 1.0 );
	direction /= direction.w;
	direction = cameraWorld * direction - origin;

	// slide the origin along the ray until it sits at the near clip plane position
	origin.xyz += direction.xyz * near / dot( direction, lookDirection );

	rayOrigin = origin.xyz;
	rayDirection = direction.xyz;

}
`,gn=`

float dot2( vec3 v ) {

	return dot( v, v );

}

// https://www.shadertoy.com/view/ttfGWl
vec3 closestPointToTriangle( vec3 p, vec3 v0, vec3 v1, vec3 v2, out vec3 barycoord ) {

    vec3 v10 = v1 - v0;
    vec3 v21 = v2 - v1;
    vec3 v02 = v0 - v2;

	vec3 p0 = p - v0;
	vec3 p1 = p - v1;
	vec3 p2 = p - v2;

    vec3 nor = cross( v10, v02 );

    // method 2, in barycentric space
    vec3  q = cross( nor, p0 );
    float d = 1.0 / dot2( nor );
    float u = d * dot( q, v02 );
    float v = d * dot( q, v10 );
    float w = 1.0 - u - v;

	if( u < 0.0 ) {

		w = clamp( dot( p2, v02 ) / dot2( v02 ), 0.0, 1.0 );
		u = 0.0;
		v = 1.0 - w;

	} else if( v < 0.0 ) {

		u = clamp( dot( p0, v10 ) / dot2( v10 ), 0.0, 1.0 );
		v = 0.0;
		w = 1.0 - u;

	} else if( w < 0.0 ) {

		v = clamp( dot( p1, v21 ) / dot2( v21 ), 0.0, 1.0 );
		w = 0.0;
		u = 1.0 - v;

	}

	barycoord = vec3( u, v, w );
    return u * v1 + v * v2 + w * v0;

}

float distanceToTriangles(
	// geometry info and triangle range
	sampler2D positionAttr, usampler2D indexAttr, uint offset, uint count,

	// point and cut off range
	vec3 point, float closestDistanceSquared,

	// outputs
	inout uvec4 faceIndices, inout vec3 faceNormal, inout vec3 barycoord, inout float side, inout vec3 outPoint
) {

	bool found = false;
	vec3 localBarycoord;
	for ( uint i = offset, l = offset + count; i < l; i ++ ) {

		uvec3 indices = uTexelFetch1D( indexAttr, i ).xyz;
		vec3 a = texelFetch1D( positionAttr, indices.x ).rgb;
		vec3 b = texelFetch1D( positionAttr, indices.y ).rgb;
		vec3 c = texelFetch1D( positionAttr, indices.z ).rgb;

		// get the closest point and barycoord
		vec3 closestPoint = closestPointToTriangle( point, a, b, c, localBarycoord );
		vec3 delta = point - closestPoint;
		float sqDist = dot2( delta );
		if ( sqDist < closestDistanceSquared ) {

			// set the output results
			closestDistanceSquared = sqDist;
			faceIndices = uvec4( indices.xyz, i );
			faceNormal = normalize( cross( a - b, b - c ) );
			barycoord = localBarycoord;
			outPoint = closestPoint;
			side = sign( dot( faceNormal, delta ) );

		}

	}

	return closestDistanceSquared;

}

float distanceSqToBounds( vec3 point, vec3 boundsMin, vec3 boundsMax ) {

	vec3 clampedPoint = clamp( point, boundsMin, boundsMax );
	vec3 delta = point - clampedPoint;
	return dot( delta, delta );

}

float distanceSqToBVHNodeBoundsPoint( vec3 point, sampler2D bvhBounds, uint currNodeIndex ) {

	uint cni2 = currNodeIndex * 2u;
	vec3 boundsMin = texelFetch1D( bvhBounds, cni2 ).xyz;
	vec3 boundsMax = texelFetch1D( bvhBounds, cni2 + 1u ).xyz;
	return distanceSqToBounds( point, boundsMin, boundsMax );

}

// use a macro to hide the fact that we need to expand the struct into separate fields
#define	bvhClosestPointToPoint(		bvh,		point, maxDistance, faceIndices, faceNormal, barycoord, side, outPoint	)	_bvhClosestPointToPoint(		bvh.position, bvh.index, bvh.bvhBounds, bvh.bvhContents,		point, maxDistance, faceIndices, faceNormal, barycoord, side, outPoint	)

float _bvhClosestPointToPoint(
	// bvh info
	sampler2D bvh_position, usampler2D bvh_index, sampler2D bvh_bvhBounds, usampler2D bvh_bvhContents,

	// point to check
	vec3 point, float maxDistance,

	// output variables
	inout uvec4 faceIndices, inout vec3 faceNormal, inout vec3 barycoord,
	inout float side, inout vec3 outPoint
 ) {

	// stack needs to be twice as long as the deepest tree we expect because
	// we push both the left and right child onto the stack every traversal
	int ptr = 0;
	uint stack[ BVH_STACK_DEPTH ];
	stack[ 0 ] = 0u;

	float closestDistanceSquared = maxDistance * maxDistance;
	bool found = false;
	while ( ptr > - 1 && ptr < BVH_STACK_DEPTH ) {

		uint currNodeIndex = stack[ ptr ];
		ptr --;

		// check if we intersect the current bounds
		float boundsHitDistance = distanceSqToBVHNodeBoundsPoint( point, bvh_bvhBounds, currNodeIndex );
		if ( boundsHitDistance > closestDistanceSquared ) {

			continue;

		}

		uvec2 boundsInfo = uTexelFetch1D( bvh_bvhContents, currNodeIndex ).xy;
		bool isLeaf = bool( boundsInfo.x & 0xffff0000u );
		if ( isLeaf ) {

			uint count = boundsInfo.x & 0x0000ffffu;
			uint offset = boundsInfo.y;
			closestDistanceSquared = distanceToTriangles(
				bvh_position, bvh_index, offset, count, point, closestDistanceSquared,

				// outputs
				faceIndices, faceNormal, barycoord, side, outPoint
			);

		} else {

			uint leftIndex = currNodeIndex + 1u;
			uint splitAxis = boundsInfo.x & 0x0000ffffu;
			uint rightIndex = boundsInfo.y;
			bool leftToRight = distanceSqToBVHNodeBoundsPoint( point, bvh_bvhBounds, leftIndex ) < distanceSqToBVHNodeBoundsPoint( point, bvh_bvhBounds, rightIndex );//rayDirection[ splitAxis ] >= 0.0;
			uint c1 = leftToRight ? leftIndex : rightIndex;
			uint c2 = leftToRight ? rightIndex : leftIndex;

			// set c2 in the stack so we traverse it later. We need to keep track of a pointer in
			// the stack while we traverse. The second pointer added is the one that will be
			// traversed first
			ptr ++;
			stack[ ptr ] = c2;
			ptr ++;
			stack[ ptr ] = c1;

		}

	}

	return sqrt( closestDistanceSquared );

}
`,An=`

#ifndef TRI_INTERSECT_EPSILON
#define TRI_INTERSECT_EPSILON 1e-5
#endif

// Raycasting
bool intersectsBounds( vec3 rayOrigin, vec3 rayDirection, vec3 boundsMin, vec3 boundsMax, out float dist ) {

	// https://www.reddit.com/r/opengl/comments/8ntzz5/fast_glsl_ray_box_intersection/
	// https://tavianator.com/2011/ray_box.html
	vec3 invDir = 1.0 / rayDirection;

	// find intersection distances for each plane
	vec3 tMinPlane = invDir * ( boundsMin - rayOrigin );
	vec3 tMaxPlane = invDir * ( boundsMax - rayOrigin );

	// get the min and max distances from each intersection
	vec3 tMinHit = min( tMaxPlane, tMinPlane );
	vec3 tMaxHit = max( tMaxPlane, tMinPlane );

	// get the furthest hit distance
	vec2 t = max( tMinHit.xx, tMinHit.yz );
	float t0 = max( t.x, t.y );

	// get the minimum hit distance
	t = min( tMaxHit.xx, tMaxHit.yz );
	float t1 = min( t.x, t.y );

	// set distance to 0.0 if the ray starts inside the box
	dist = max( t0, 0.0 );

	return t1 >= dist;

}

bool intersectsTriangle(
	vec3 rayOrigin, vec3 rayDirection, vec3 a, vec3 b, vec3 c,
	out vec3 barycoord, out vec3 norm, out float dist, out float side
) {

	// https://stackoverflow.com/questions/42740765/intersection-between-line-and-triangle-in-3d
	vec3 edge1 = b - a;
	vec3 edge2 = c - a;
	norm = cross( edge1, edge2 );

	float det = - dot( rayDirection, norm );
	float invdet = 1.0 / det;

	vec3 AO = rayOrigin - a;
	vec3 DAO = cross( AO, rayDirection );

	vec4 uvt;
	uvt.x = dot( edge2, DAO ) * invdet;
	uvt.y = - dot( edge1, DAO ) * invdet;
	uvt.z = dot( AO, norm ) * invdet;
	uvt.w = 1.0 - uvt.x - uvt.y;

	// set the hit information
	barycoord = uvt.wxy; // arranged in A, B, C order
	dist = uvt.z;
	side = sign( det );
	norm = side * normalize( norm );

	// add an epsilon to avoid misses between triangles
	uvt += vec4( TRI_INTERSECT_EPSILON );

	return all( greaterThanEqual( uvt, vec4( 0.0 ) ) );

}

bool intersectTriangles(
	// geometry info and triangle range
	sampler2D positionAttr, usampler2D indexAttr, uint offset, uint count,

	// ray
	vec3 rayOrigin, vec3 rayDirection,

	// outputs
	inout float minDistance, inout uvec4 faceIndices, inout vec3 faceNormal, inout vec3 barycoord,
	inout float side, inout float dist
) {

	bool found = false;
	vec3 localBarycoord, localNormal;
	float localDist, localSide;
	for ( uint i = offset, l = offset + count; i < l; i ++ ) {

		uvec3 indices = uTexelFetch1D( indexAttr, i ).xyz;
		vec3 a = texelFetch1D( positionAttr, indices.x ).rgb;
		vec3 b = texelFetch1D( positionAttr, indices.y ).rgb;
		vec3 c = texelFetch1D( positionAttr, indices.z ).rgb;

		if (
			intersectsTriangle( rayOrigin, rayDirection, a, b, c, localBarycoord, localNormal, localDist, localSide )
			&& localDist < minDistance
		) {

			found = true;
			minDistance = localDist;

			faceIndices = uvec4( indices.xyz, i );
			faceNormal = localNormal;

			side = localSide;
			barycoord = localBarycoord;
			dist = localDist;

		}

	}

	return found;

}

bool intersectsBVHNodeBounds( vec3 rayOrigin, vec3 rayDirection, sampler2D bvhBounds, uint currNodeIndex, out float dist ) {

	uint cni2 = currNodeIndex * 2u;
	vec3 boundsMin = texelFetch1D( bvhBounds, cni2 ).xyz;
	vec3 boundsMax = texelFetch1D( bvhBounds, cni2 + 1u ).xyz;
	return intersectsBounds( rayOrigin, rayDirection, boundsMin, boundsMax, dist );

}

// use a macro to hide the fact that we need to expand the struct into separate fields
#define	bvhIntersectFirstHit(		bvh,		rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist	)	_bvhIntersectFirstHit(		bvh.position, bvh.index, bvh.bvhBounds, bvh.bvhContents,		rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist	)

bool _bvhIntersectFirstHit(
	// bvh info
	sampler2D bvh_position, usampler2D bvh_index, sampler2D bvh_bvhBounds, usampler2D bvh_bvhContents,

	// ray
	vec3 rayOrigin, vec3 rayDirection,

	// output variables split into separate variables due to output precision
	inout uvec4 faceIndices, inout vec3 faceNormal, inout vec3 barycoord,
	inout float side, inout float dist
) {

	// stack needs to be twice as long as the deepest tree we expect because
	// we push both the left and right child onto the stack every traversal
	int ptr = 0;
	uint stack[ BVH_STACK_DEPTH ];
	stack[ 0 ] = 0u;

	float triangleDistance = INFINITY;
	bool found = false;
	while ( ptr > - 1 && ptr < BVH_STACK_DEPTH ) {

		uint currNodeIndex = stack[ ptr ];
		ptr --;

		// check if we intersect the current bounds
		float boundsHitDistance;
		if (
			! intersectsBVHNodeBounds( rayOrigin, rayDirection, bvh_bvhBounds, currNodeIndex, boundsHitDistance )
			|| boundsHitDistance > triangleDistance
		) {

			continue;

		}

		uvec2 boundsInfo = uTexelFetch1D( bvh_bvhContents, currNodeIndex ).xy;
		bool isLeaf = bool( boundsInfo.x & 0xffff0000u );

		if ( isLeaf ) {

			uint count = boundsInfo.x & 0x0000ffffu;
			uint offset = boundsInfo.y;

			found = intersectTriangles(
				bvh_position, bvh_index, offset, count,
				rayOrigin, rayDirection, triangleDistance,
				faceIndices, faceNormal, barycoord, side, dist
			) || found;

		} else {

			uint leftIndex = currNodeIndex + 1u;
			uint splitAxis = boundsInfo.x & 0x0000ffffu;
			uint rightIndex = boundsInfo.y;

			bool leftToRight = rayDirection[ splitAxis ] >= 0.0;
			uint c1 = leftToRight ? leftIndex : rightIndex;
			uint c2 = leftToRight ? rightIndex : leftIndex;

			// set c2 in the stack so we traverse it later. We need to keep track of a pointer in
			// the stack while we traverse. The second pointer added is the one that will be
			// traversed first
			ptr ++;
			stack[ ptr ] = c2;

			ptr ++;
			stack[ ptr ] = c1;

		}

	}

	return found;

}
`,wn=`
struct BVH {

	usampler2D index;
	sampler2D position;

	sampler2D bvhBounds;
	usampler2D bvhContents;

};
`;var Ki=Object.freeze({__proto__:null,bvh_distance_functions:gn,bvh_ray_functions:An,bvh_struct_definitions:wn,common_functions:bn});const Ji=wn,Qi=gn,ts=`
	${bn}
	${An}
`;F.AVERAGE=1,F.BVHShaderGLSL=Ki,F.CENTER=0,F.CONTAINED=2,F.ExtendedTriangle=$,F.FloatVertexAttributeTexture=fn,F.INTERSECTED=1,F.IntVertexAttributeTexture=Hi,F.MeshBVH=lt,F.MeshBVHHelper=ee,F.MeshBVHUniformStruct=Oi,F.NOT_INTERSECTED=0,F.OrientedBox=U,F.SAH=2,F.StaticGeometryGenerator=Zi,F.UIntVertexAttributeTexture=un,F.VertexAttributeTexture=se,F.acceleratedRaycast=Di,F.computeBatchedBoundsTree=zi,F.computeBoundsTree=Ni,F.disposeBatchedBoundsTree=Li,F.disposeBoundsTree=Ri,F.estimateMemoryInBytes=_i,F.getBVHExtremes=Si,F.getJSONStructure=Pi,F.getTriangleHitPointInfo=$n,F.shaderDistanceFunction=Qi,F.shaderIntersectFunction=ts,F.shaderStructs=Ji,F.validateBounds=Ii});
