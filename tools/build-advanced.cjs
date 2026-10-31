const fs = require("fs"),
  ts = require("typescript"),
  path = require("path");
for (const name of [
  "physics",
  "active-body",
  "navigation",
  "combat",
  "profiler",
  "motion-actions",
  "mocap-actions",
  "animator",
  "stumble",
  "traversal",
  "tactics",
  "contacts",
  "geometry",
]) {
  const input = path.join(__dirname, "../src/advanced", name + ".ts");
  const result = ts.transpileModule(fs.readFileSync(input, "utf8"), {
    fileName: input,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.None,
      strict: true,
      removeComments: false,
    },
  });
  if (result.diagnostics?.length)
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(result.diagnostics, {
        getCanonicalFileName: (x) => x,
        getCurrentDirectory: () => process.cwd(),
        getNewLine: () => "\n",
      }),
    );
  fs.writeFileSync(
    path.join(__dirname, "../js/advanced", name + ".js"),
    result.outputText,
  );
}
console.log("Built advanced TypeScript modules");
