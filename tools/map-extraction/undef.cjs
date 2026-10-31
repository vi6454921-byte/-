/* Static check: free identifiers in a generated builder (anything not declared and not a browser/ES global).
   node undef.cjs ../../js/maps/angar_map.js   (typescript on NODE_PATH) */
const ts = require('typescript');
const p = ts.createProgram([process.argv[2]], { allowJs: true, checkJs: true, noEmit: true, noLib: true, noResolve: true, target: ts.ScriptTarget.ES2020 });
const ok = new Set('Math Proxy String URLSearchParams JSON Object Float32Array Array Uint8Array Uint32Array Uint16Array Int32Array Image Number Map Set WeakMap Symbol Promise Date Error Boolean RegExp performance window document'.split(' '));
const names = new Set();
for (const d of ts.getPreEmitDiagnostics(p)) {
  if (d.code === 2304 || d.code === 2552) names.add(ts.flattenDiagnosticMessageText(d.messageText, '\n').replace(/Cannot find name '(.*?)'.*/, '$1'));
}
console.log([...names].filter((n) => !ok.has(n)).join(' ') || '(none)');
