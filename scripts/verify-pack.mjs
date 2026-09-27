import { execFileSync } from "node:child_process";

const raw=execFileSync("npm",["pack","--json"],{encoding:"utf8",shell:process.platform==="win32"});
const result=JSON.parse(raw)[0];
const names=result.files.map((f)=>f.path);
const required=["package.json","extensions/asen.ts","skills/asen-safe-change/SKILL.md"];
for(const file of required) if(!names.includes(file)) throw new Error(`packed artifact missing ${file}`);

// Independence is a runtime/import property. Documentation is allowed to name
// audited upstream projects; executable/package manifests must not couple to them.
const executable=names.filter((file)=>/^(src|extensions|scripts)\//.test(file) || file==="package.json");
for(const file of executable) {
  if (/gentle-(pi|ai|engram)/i.test(file)) throw new Error(`unexpected Gentle runtime artifact: ${file}`);
}
console.log(JSON.stringify({tarball:result.filename,files:names.length,integrity:result.integrity}));
