/* Dependency-closure explorer for the original map sources: node analyze.cjs <id> root1 root2 ...
   env STOP=a,b (do not descend), LIST=1 (print closure). Requires typescript on NODE_PATH. */
const ts=require('typescript'),path=require('path');
const [,, id, ...roots]=process.argv;
const file=path.join(__dirname,'originals',id+'.js');
const pg=ts.createProgram([file],{allowJs:true,checkJs:false,noLib:true,noResolve:true});const sf=pg.getSourceFile(file),ck=pg.getTypeChecker();
const records=[],symbols=new Map(),byName=new Map();
function add(name,node,text){const r={name,node,text,deps:new Set()};records.push(r);byName.set(name,r);const n=node.name||node;const sy=ck.getSymbolAtLocation(n);if(sy)symbols.set(sy,r);}
for(const st of sf.statements){
 if(ts.isFunctionDeclaration(st)||ts.isClassDeclaration(st)){if(st.name)add(st.name.text,st,st.getText(sf));}
 else if(ts.isVariableStatement(st))for(const d of st.declarationList.declarations){if(ts.isIdentifier(d.name))add(d.name.text,d,'var '+d.getText(sf)+';');}
}
for(const r of records){(function visit(n){if(ts.isIdentifier(n)){const sy=ck.getSymbolAtLocation(n);const dep=symbols.get(sy);if(dep&&dep!==r)r.deps.add(dep.name);}ts.forEachChild(n,visit);})(r.node);}
const stop=new Set((process.env.STOP||'').split(',').filter(Boolean));
const need=new Map();function use(n,from){if(need.has(n)||!byName.has(n))return;need.set(n,from);if(stop.has(n))return;for(const d of byName.get(n).deps)use(d,n);}
roots.forEach(r=>use(r,'ROOT'));
console.log('closure size',need.size);
if(process.env.LIST)console.log([...need.keys()].map(n=>n+'('+byName.get(n).text.length+')<'+need.get(n)).join(' '));
if(process.env.WHERE){for(const w of process.env.WHERE.split(',')){const r=byName.get(w);if(r)console.log(w,'line',sf.getLineAndCharacterOfPosition(r.node.getStart()).line+1,'deps:',[...r.deps].join(' '));}}
