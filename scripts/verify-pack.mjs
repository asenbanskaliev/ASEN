import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const raw=execFileSync("npm",["pack","--json"],{encoding:"utf8",shell:process.platform==="win32"});
const result=JSON.parse(raw)[0];
const names=result.files.map((f)=>f.path);
const required=["package.json","extensions/asen.ts","skills/asen-safe-change/SKILL.md"];
for(const file of required) if(!names.includes(file)) throw new Error(`packed artifact missing ${file}`);

const forbidden=new RegExp(["gen"+"tle","gen"+"tleman","eng"+"ram"].join("|"),"i");
for(const file of names) {
  if (forbidden.test(file)) throw new Error(`external reference leaked into packed artifact path: ${file}`);
  if (/^(src|extensions|skills)\//.test(file) || file==="package.json") {
    const text=readFileSync(file,"utf8");
    if (forbidden.test(text)) throw new Error(`external reference leaked into packed product: ${file}`);
  }
}
console.log(JSON.stringify({tarball:result.filename,files:names.length,integrity:result.integrity}));
