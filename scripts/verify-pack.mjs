import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {verifyPublicExports} from "./package-exports.mjs";

const temp=mkdtempSync(join(tmpdir(),"asen-packed-exports-"));
function npm(args,options={}) {
  if(process.env.npm_execpath) return execFileSync(process.execPath,[process.env.npm_execpath,...args],{encoding:"utf8",...options});
  if(process.platform==="win32")throw new Error("Run package verification through npm run verify:pack");
  return execFileSync("npm",args,{encoding:"utf8",...options});
}
try {
const raw=npm(["pack","--json","--pack-destination",temp]);
const result=JSON.parse(raw)[0];
const names=result.files.map((f)=>f.path);
const required=["package.json","src/cli.ts","extensions/asen.ts","skills/asen-safe-change/SKILL.md"];
for(const file of required) if(!names.includes(file)) throw new Error(`packed artifact missing ${file}`);
const installation=join(temp,"install");mkdirSync(installation);
writeFileSync(join(installation,"package.json"),JSON.stringify({private:true}));
npm(["install","--offline","--ignore-scripts","--omit=peer","--no-audit","--no-fund","--package-lock=false",join(temp,result.filename)],{cwd:installation});
const checked=verifyPublicExports(installation),installed=join(installation,"node_modules","asen");
const installedPackage=JSON.parse(readFileSync(join(installed,"package.json"),"utf8"));
if(installedPackage.bin?.asen!=="./src/cli.ts")throw new Error("packed artifact missing ASEN executable mapping");
const cliBytes=readFileSync(join(installed,"src","cli.ts"),"utf8");if(!cliBytes.startsWith("#!/usr/bin/env node"))throw new Error("packed ASEN executable missing node shebang");

const forbidden=new RegExp(["gen"+"tle","gen"+"tleman","eng"+"ram"].join("|"),"i");
for(const file of names) {
  if (forbidden.test(file)) throw new Error(`external reference leaked into packed artifact path: ${file}`);
  if (/^(src|extensions|skills)\//.test(file) || file==="package.json") {
    const text=readFileSync(join(installed,file),"utf8");
    if (forbidden.test(text)) throw new Error(`external reference leaked into packed product: ${file}`);
  }
}
console.log(JSON.stringify({tarball:result.filename,files:names.length,integrity:result.integrity,publicExports:checked.length,packedInstallVerified:true}));
} finally {rmSync(temp,{recursive:true,force:true});}
