import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {access,readFile,mkdir,writeFile,rm} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {mkdtemp,realpath} from "node:fs/promises";

const packageRoot=process.argv[2];
if(!packageRoot||!path.isAbsolute(packageRoot))throw new Error("Usage: node scripts/t09-real-package-smoke.mjs <absolute-installed-package-root>");
const realPackageRoot=await realpath(packageRoot);
const packageJson=JSON.parse(await readFile(path.join(realPackageRoot,"package.json"),"utf8"));
assert.equal(packageJson.name,"asen");
assert.match(packageJson.version,/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u);
const cli=path.join(realPackageRoot,"dist","cli.js");
await access(cli);

const root=await mkdtemp(path.join(tmpdir(),"asen-t09-real-package-"));
const home=path.join(root,"home"),dataHome=path.join(home,".asen","agent"),restoreHome=path.join(root,"restored-home"),restoreConfig=path.join(root,"restored-config.json");
await mkdir(home,{recursive:true});
const env={};
for(const key of ["PATH","Path","PATHEXT","SystemRoot","WINDIR","COMSPEC","LANG","LC_ALL"]){
 if(process.env[key]!==undefined)env[key]=process.env[key];
}
Object.assign(env,{HOME:home,USERPROFILE:home,APPDATA:home,LOCALAPPDATA:home,TEMP:root,TMP:root,TMPDIR:root});

function run(args){
 const result=execFileSync(process.execPath,[cli,...args],{cwd:root,env,encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:60_000,maxBuffer:2*1024*1024});
 return result;
}
function runEntry(entry,args){
 return execFileSync(process.execPath,[entry,...args],{cwd:root,env,encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:60_000,maxBuffer:2*1024*1024});
}
function report(args){
 const stdout=run(args);
 try{return JSON.parse(stdout);}catch(error){throw new Error(`Expected JSON from ${args.slice(0,2).join(" ")}`,{cause:error});}
}
let success=false;
try{
 const privateKey=path.join(root,"test-signing-private.pem"),trustAnchor=path.join(root,"test-trust-anchor.pem");
 report(["managed","release","keygen","--private-key",privateKey,"--public-key",trustAnchor]);
 const manifest=path.join(root,"manifest.json"),signature=path.join(root,"signature.json");
 report(["managed","release","manifest","--package-root",realPackageRoot,"--output",manifest]);
 report(["managed","release","sign","--manifest",manifest,"--private-key",privateKey,"--output",signature]);

 const installed=report(["managed","install","--manifest",manifest,"--signature",signature,"--package-root",realPackageRoot,"--trust-anchor",trustAnchor,"--yes"]);
 assert.equal(installed.status,"installed");
 assert.equal(installed.activeVersion,packageJson.version);
 assert.equal(installed.prerequisites.ok,true);

 const doctor=report(["doctor"]);
 assert.equal(doctor.collection.status,"complete");
 assert.equal(doctor.managed.inspection.status,"owned");
 assert.equal(doctor.managed.inspection.activeVersion,packageJson.version);
 assert.equal(doctor.runtimeReady,false,"doctor remains metadata-only");

 const installedCli=path.join(home,".asen","install","versions",packageJson.version,"dist","cli.js");
 assert.equal(runEntry(installedCli,["--version"]).trim(),packageJson.version);

 await mkdir(dataHome,{recursive:true});
 const personalData=path.join(dataHome,"t09-smoke-data.json");
 await writeFile(personalData,JSON.stringify({id:"t09-real-package",value:"preserve"})+"\n");
 const backup=path.join(root,"home.backup");
 const made=report(["backup","home","--destination",backup]);
 const verified=report(["backup","verify","--file",backup]);
 assert.equal(made.status,"created");
 assert.equal(verified.schema,"asen.home-backup-verification/v1");
 assert.equal(verified.sha256,made.sha256);
 const restored=report(["restore","home","--backup",backup,"--target-home",restoreHome,"--target-config",restoreConfig,"--yes"]);
 assert.equal(restored.status,"restored");
 assert.equal(await readFile(path.join(restoreHome,"t09-smoke-data.json"),"utf8"),await readFile(personalData,"utf8"));
 assert.equal(await readFile(restoreConfig,"utf8"),await readFile(path.join(home,".asen","config.json"),"utf8"));

 const removed=report(["managed","uninstall","--yes"]);
 assert.equal(removed.status,"removed");
 assert.equal(removed.userDataTouched,false);
 await access(personalData);
 await access(path.join(home,".asen","config.json"));
 await assert.rejects(access(path.join(home,".asen","install")),{code:"ENOENT"});
 success=true;
 console.log(JSON.stringify({schema:"asen.t09-real-package-smoke/v1",status:"passed",packageVersion:packageJson.version,trust:"ephemeral-explicit-ed25519-anchor",operations:["npm-packed-package","signed-install","metadata-doctor","installed-cli-version","backup","backup-verify","clean-target-restore","managed-uninstall","user-data-preserved"]}));
}catch(error){
 console.error(`T09 real package smoke failed; disposable state retained at ${root}: ${error instanceof Error?error.stack:String(error)}`);
 throw error;
}finally{
 if(success)await rm(root,{recursive:true,force:true});
}
