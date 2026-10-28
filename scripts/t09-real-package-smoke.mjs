import assert from "node:assert/strict";
import {execFileSync,execFile} from "node:child_process";
import {access,readFile,mkdir,writeFile,rm,cp} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {mkdtemp,realpath} from "node:fs/promises";
import https from "node:https";

const packageRoot=process.argv[2];
if(!packageRoot||!path.isAbsolute(packageRoot))throw new Error("Usage: node scripts/t09-real-package-smoke.mjs <absolute-installed-package-root>");
const realPackageRoot=await realpath(packageRoot);
const packageJson=JSON.parse(await readFile(path.join(realPackageRoot,"package.json"),"utf8"));
assert.equal(packageJson.name,"asen");
assert.match(packageJson.version,/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u);
const cli=path.join(realPackageRoot,"dist","cli.js");
await access(cli);

const root=await realpath(await mkdtemp(path.join(tmpdir(),"asen-t09-real-package-")));
const home=path.join(root,"home"),dataHome=path.join(home,".asen","agent"),restoreHome=path.join(root,"restored-home"),restoreConfig=path.join(root,"restored-config.json");
await mkdir(home,{recursive:true});
const env={};
for(const key of ["PATH","Path","PATHEXT","SystemRoot","WINDIR","COMSPEC","LANG","LC_ALL"]){
 if(process.env[key]!==undefined)env[key]=process.env[key];
}
Object.assign(env,{HOME:home,USERPROFILE:home,APPDATA:home,LOCALAPPDATA:home,TEMP:root,TMP:root,TMPDIR:root,NODE_EXTRA_CA_CERTS:path.resolve("tests/fixtures/t09-loopback-test-ca.pem")});

function run(args){
 const result=execFileSync(process.execPath,[cli,...args],{cwd:root,env,encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:60_000,maxBuffer:2*1024*1024});
 return result;
}
function runAsync(args){
 return new Promise((resolve,reject)=>execFile(process.execPath,[cli,...args],{cwd:root,env,encoding:"utf8",timeout:60_000,maxBuffer:2*1024*1024},(error,stdout,stderr)=>{
  if(error){error.message+=`\nstdout=${String(stdout)}\nstderr=${String(stderr)}`;reject(error);return;}
  resolve(stdout);
 }));
}
function runEntry(entry,args){
 return execFileSync(process.execPath,[entry,...args],{cwd:root,env,encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:60_000,maxBuffer:2*1024*1024});
}
function report(args){
 const stdout=run(args);
 try{return JSON.parse(stdout);}catch(error){throw new Error(`Expected JSON from ${args.slice(0,2).join(" ")}`,{cause:error});}
}
async function reportAsync(args){
 const stdout=await runAsync(args);
 try{return JSON.parse(stdout);}catch(error){throw new Error(`Expected JSON from ${args.slice(0,2).join(" ")}`,{cause:error});}
}
async function serveSignedPackage(packageRoot,manifestPath,signaturePath){
 const manifestText=await readFile(manifestPath,"utf8"),manifest=JSON.parse(manifestText);
 const files={"asen-manifest.json":manifestText,"asen-manifest.sig.json":await readFile(signaturePath,"utf8")};
 for(const file of manifest.files)files[file.sourcePath]=await readFile(path.join(packageRoot,file.sourcePath));
 const fixture=path.resolve("tests/fixtures");
 const server=https.createServer({key:await readFile(path.join(fixture,"t09-loopback-test-key.pem")),cert:await readFile(path.join(fixture,"t09-loopback-test-ca.pem"))},(request,response)=>{
  const name=(request.url??"").slice(1);
  const body=files[name];if(body===undefined){response.writeHead(404);response.end();return;}
  response.writeHead(200,{"content-length":Buffer.byteLength(body)});response.end(body);
 });
 await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
 return {url:`https://127.0.0.1:${server.address().port}/`,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(()=>resolve());})};
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
 await writeFile(personalData,JSON.stringify({id:"t09-real-package",value:"preserve across HTTPS upgrade and rollback"})+"\n");

 // Exercise the public acquisition/update path with the real npm-packed product tree.
 // The candidate release is an isolated versioned copy; only package and compiled CLI versions change.
 const nextVersion=packageJson.version.replace(/(\d+)$/u,(_,patch)=>String(Number(patch)+1));
 assert.notEqual(nextVersion,packageJson.version);
 const nextPackageRoot=path.join(root,"release-v2");await cp(realPackageRoot,nextPackageRoot,{recursive:true,errorOnExist:true,force:false});
 const nextPackage=JSON.parse(await readFile(path.join(nextPackageRoot,"package.json"),"utf8"));nextPackage.version=nextVersion;
 await writeFile(path.join(nextPackageRoot,"package.json"),JSON.stringify(nextPackage,null,2)+"\n");
 const nextCli=path.join(nextPackageRoot,"dist","cli.js"),cliText=await readFile(nextCli,"utf8"),versionOccurrences=cliText.split(packageJson.version).length-1;
 assert.equal(versionOccurrences,2,"compiled lifecycle metadata and --version output must both bind the package version");
 await writeFile(nextCli,cliText.replaceAll(packageJson.version,nextVersion));
 const nextManifest=path.join(root,"manifest-v2.json"),nextSignature=path.join(root,"signature-v2.json");
 report(["managed","release","manifest","--package-root",nextPackageRoot,"--output",nextManifest]);
 report(["managed","release","sign","--manifest",nextManifest,"--private-key",privateKey,"--output",nextSignature]);
 const releaseServer=await serveSignedPackage(nextPackageRoot,nextManifest,nextSignature);
 try{
  const upgraded=await reportAsync(["managed","upgrade","--source-url",releaseServer.url,"--trust-anchor",trustAnchor,"--yes"]);
  assert.equal(upgraded.status,"upgraded");assert.equal(upgraded.activeVersion,nextVersion);
  const upgradedCli=path.join(home,".asen","install","versions",nextVersion,"dist","cli.js");
  assert.equal(runEntry(upgradedCli,["--version"]).trim(),nextVersion);
  assert.equal(JSON.parse(await readFile(personalData,"utf8")).value,"preserve across HTTPS upgrade and rollback");
  const rolledBack=report(["managed","rollback","--expected-current",nextVersion,"--to",packageJson.version,"--yes"]);
  assert.equal(rolledBack.status,"rolled-back");
  assert.equal((await report(["doctor"])).managed.inspection.activeVersion,packageJson.version);
  assert.equal(JSON.parse(await readFile(personalData,"utf8")).value,"preserve across HTTPS upgrade and rollback");
 }finally{await releaseServer.close();}

 const backup=path.join(root,"home.backup");
 const made=report(["backup","home","--destination",backup]);
 const verified=report(["backup","verify","--file",backup]);
 assert.equal(made.status,"created");
 assert.equal(verified.schema,"asen.home-backup-verification/v1");
 assert.equal(verified.sha256,made.sha256);
 const corruptBackup=path.join(root,"corrupt.backup"),corruptBytes=Buffer.from(await readFile(backup));
 corruptBytes[corruptBytes.length-1]^=1;await writeFile(corruptBackup,corruptBytes);
 assert.throws(()=>run(["restore","home","--backup",corruptBackup,"--target-home",restoreHome,"--target-config",restoreConfig,"--yes"]),error=>String(error.stderr).includes("BACKUP_CORRUPT"));
 await assert.rejects(access(restoreHome),{code:"ENOENT"});await assert.rejects(access(restoreConfig),{code:"ENOENT"});
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
 console.log(JSON.stringify({schema:"asen.t09-real-package-smoke/v1",status:"passed",packageVersion:packageJson.version,updatedVersion:nextVersion,trust:"ephemeral-explicit-ed25519-anchor-and-verified-loopback-tls",operations:["npm-packed-package","signed-install","metadata-doctor","installed-cli-version","real-package-https-upgrade","updated-cli-version","user-data-preserved-across-update","rollback-to-original","user-data-preserved-across-rollback","backup","backup-verify","corrupt-restore-no-effects","clean-target-restore-recovery","managed-uninstall","user-data-preserved"]}));
}catch(error){
 console.error(`T09 real package smoke failed; disposable state retained at ${root}: ${error instanceof Error?error.stack:String(error)}`);
 throw error;
}finally{
 if(success)await rm(root,{recursive:true,force:true});
}
