import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const raw=execFileSync("npm",["pack","--json"],{encoding:"utf8",shell:process.platform==="win32"});
const result=JSON.parse(raw)[0];
const names=result.files.map((f)=>f.path);
const required=["package.json","extensions/asen.ts","skills/asen-safe-change/SKILL.md"];
for(const file of required) if(!names.includes(file)) throw new Error(`packed artifact missing ${file}`);
for(const file of names) if(/gentle/i.test(file)) throw new Error(`unexpected Gentle artifact: ${file}`);
console.log(JSON.stringify({tarball:result.filename,files:names.length,integrity:result.integrity}));
