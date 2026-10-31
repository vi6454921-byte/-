// Optional development tool. The game ships prebuilt; no build step at runtime.
const fs = require('fs'), path = require('path'), { stripTypeScriptTypes } = require('node:module');
const dir = path.resolve(__dirname, '../vendor/bullet-impacts');
let geo = fs.readFileSync(path.join(dir,'DecalGeometry.js'),'utf8').replace(/import\s*\{([\s\S]*?)\}\s*from 'three';/, 'const {$1} = THREE;').replace(/export\s*\{[^}]*\};?/, '');
let src = fs.readFileSync(path.join(dir,'Decals.ts'),'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
let out = stripTypeScriptTypes(src, {mode:'transform'}).replace(/^export \{\};?\s*$/gm,'');
fs.writeFileSync(path.join(dir,'bullet-impacts.js'), '/* Bullet impacts from supplied Decals.ts; Three.js DecalGeometry (MIT). */\n(function(THREE){\n"use strict";\n'+geo+'\n'+out+'\nglobalThis.GBulletImpacts = { Decals };\n})(globalThis.THREE);\n');
