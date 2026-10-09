import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { createRequire } from "node:module";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
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
const required=["package.json","dist/cli.js","src/cli.ts","extensions/asen.ts","skills/asen-safe-change/SKILL.md"];
for(const file of required) if(!names.includes(file)) throw new Error(`packed artifact missing ${file}`);
const installation=join(temp,"install");mkdirSync(installation);
writeFileSync(join(installation,"package.json"),JSON.stringify({private:true}));
npm(["install","--offline","--ignore-scripts","--omit=peer","--no-audit","--no-fund","--package-lock=false",join(temp,result.filename)],{cwd:installation});
const checked=verifyPublicExports(installation),installed=join(installation,"node_modules","asen");
const requireFromInstalled=createRequire(join(installed,"package.json"));
try {
  requireFromInstalled.resolve("@earendil-works/pi-coding-agent");
  throw new Error("packed installation unexpectedly resolved the optional Pi peer");
} catch(error) {
  if(error?.code!=="MODULE_NOT_FOUND")throw error;
}
execFileSync(process.execPath,[fileURLToPath(new URL("./verify-pi-package.mjs",import.meta.url)),installed],{encoding:"utf8",stdio:"inherit",timeout:60000});
const installedPackage=JSON.parse(readFileSync(join(installed,"package.json"),"utf8"));
if(installedPackage.bin?.asen!=="./dist/cli.js")throw new Error("packed artifact missing ASEN executable mapping");
const cliBytes=readFileSync(join(installed,"dist","cli.js"),"utf8");if(!cliBytes.startsWith("#!/usr/bin/env node"))throw new Error("packed ASEN executable missing node shebang");
const bin=process.platform==="win32"?process.execPath:join(installation,"node_modules",".bin","asen");
const binPrefix=process.platform==="win32"?[join(installed,"dist","cli.js")]:[];
const runBin=(args,options={})=>execFileSync(bin,[...binPrefix,...args],{encoding:"utf8",cwd:installation,...options});
const spawnBin=(args,options={})=>spawnSync(bin,[...binPrefix,...args],{encoding:"utf8",cwd:installation,...options});
const help=runBin(["--help"]);if(!/Usage: asen/.test(help))throw new Error("packed ASEN executable did not run help");
const version=runBin(["--version"]).trim();if(version!=="0.1.0")throw new Error("packed ASEN executable version mismatch");

const cleanEnv={...process.env};delete cleanEnv.ASEN_PI;delete cleanEnv.ASEN_PI_ON_PATH;
const spaced=join(installation,"hóme dir ñ"),homeOut=runBin(["home"],{env:{...cleanEnv,ASEN_HOME:spaced}}).trim();
if(homeOut!==spaced)throw new Error("packed ASEN executable home mismatch for spaces/Unicode path");
const missing=spawnBin(["--home",spaced],{env:cleanEnv});
if(missing.status!==1||!/Pi runtime not found/.test(missing.stderr))throw new Error("packed ASEN executable did not report missing Pi clearly");
if(process.platform!=="win32"){
  const fake=join(installation,"fake pi.mjs");writeFileSync(fake,"#!/usr/bin/env node\nconsole.log(JSON.stringify({args:process.argv.slice(2),dir:process.env.PI_CODING_AGENT_DIR}));\n");chmodSync(fake,0o755);
  const out=JSON.parse(execFileSync(bin,["--home",spaced,"--model","x y","ñ"],{encoding:"utf8",cwd:installation,env:{...cleanEnv,ASEN_PI:fake}}));
  if(out.dir!==spaced||JSON.stringify(out.args)!==JSON.stringify(["--model","x y","ñ"]))throw new Error("packed ASEN executable passthrough/home environment mismatch");
}

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
