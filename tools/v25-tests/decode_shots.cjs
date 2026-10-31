// node decode_shots.cjs <json> <outdir> — снимки из результата сценария (поле shots: [{name,data}])
const fs = require('fs'); const [, , src, dst] = process.argv;
const j = JSON.parse(fs.readFileSync(src, 'utf8')); fs.mkdirSync(dst, { recursive: true });
for (const s of j.shots || []) fs.writeFileSync(`${dst}/${s.name}.jpg`, Buffer.from(s.data.split(',')[1], 'base64'));
delete j.shots; console.log(JSON.stringify(j, null, 1));
