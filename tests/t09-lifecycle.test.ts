import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import {spawn} from "node:child_process";
import {pathToFileURL} from "node:url";
import os from "node:os";
import path from "node:path";
import {createServer,type Server} from "node:http";
import {DatabaseSync} from "node:sqlite";
import {buildManagedManifest,generateManagedSigningKeyPair,parseManagedTrustAnchor,signManagedManifest,verifyManagedManifestSignature} from "../src/runtime/managed-trust.js";
import {installManaged,rollbackManaged,uninstallManaged,upgradeManaged,checkManagedPrerequisites,type ManagedAcquisitionSource} from "../src/runtime/managed-lifecycle.js";
import {inspectManagedInstall} from "../src/runtime/managed-install.js";
import {createHomeBackup,restoreHomeBackup,verifyHomeBackup,HomeBackupError} from "../src/runtime/home-backup.js";
import {requestBrowserConsent} from "../src/runtime/browser-assistant.js";
import {runAsen} from "../src/cli.js";

const roots:string[]=[];
test.after(async()=>{for(const root of roots)await fs.rm(root,{recursive:true,force:true});});
async function tmp(label:string){const root=await fs.mkdtemp(path.join(os.tmpdir(),`asen-t09-${label}-`));roots.push(root);return root;}

const GOOD_CLI=(version:string)=>`process.stdout.write(${JSON.stringify(version+"\n")});`;
// Passes the pre-activation probe, then fails once `current` selects this version.
const BAD_AFTER_SELECT=(version:string)=>`const fs=require("fs"),path=require("path");let cur="";try{cur=fs.readFileSync(path.join(__dirname,"..","..","current"),"utf8").trim();}catch{}
if(cur===${JSON.stringify(version)}){process.exit(1);}process.stdout.write(${JSON.stringify(version+"\n")});`;
async function pkg(root:string,name:string,version:string,cli=GOOD_CLI(version),extra:Record<string,string>={}){
 const dir=path.join(root,name);await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,"package.json"),JSON.stringify({name:"asen",version,engines:{node:">=0.0.0"},bin:{asen:"./cli.cjs"}}));
 await fs.writeFile(path.join(dir,"cli.cjs"),cli);
 for(const [file,content] of Object.entries(extra))await fs.writeFile(path.join(dir,file),content);
 return dir;
}
async function release(root:string,dir:string,keys=generateManagedSigningKeyPair()){
 const built=await buildManagedManifest(dir),manifestPath=`${dir}.manifest.json`,signaturePath=`${dir}.sig.json`;
 await fs.writeFile(manifestPath,built.manifestText);await fs.writeFile(signaturePath,signManagedManifest(Buffer.from(built.manifestText),keys.privateKeyPem));
 const anchor=`${dir}.anchor.pem`;await fs.writeFile(anchor,keys.publicKeyPem);
 const source:ManagedAcquisitionSource={kind:"local",manifestPath,signaturePath,packageRoot:dir};
 return {source,anchor,keys,manifestPath,signaturePath,dir};
}
const env=(root:string)=>({prefix:path.join(root,"home",".asen"),dataHome:path.join(root,"home",".asen","agent")});
async function setupInstall(label:string){
 const root=await tmp(label),{prefix,dataHome}=env(root);
 const v1=await release(root,await pkg(root,"v1","1.0.0"));
 const base={prefix,trustedKeyPath:v1.anchor,protectedPaths:[dataHome],confirmed:true as const};
 return {root,prefix,dataHome,v1,base};
}

test("CLI version probe does not initialize SQLite or write an experimental warning",async()=>{
 const child=spawn(process.execPath,["--import","tsx",path.resolve("src/cli.ts"),"--version"],{cwd:process.cwd(),stdio:["ignore","pipe","pipe"],windowsHide:true});let stdout="",stderr="";
 child.stdout.setEncoding("utf8").on("data",chunk=>stdout+=chunk);child.stderr.setEncoding("utf8").on("data",chunk=>stderr+=chunk);
 const exit=await new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{const timer=setTimeout(()=>child.kill(),20_000);child.once("error",error=>{clearTimeout(timer);reject(error);});child.once("close",(code,signal)=>{clearTimeout(timer);resolve({code,signal});});});
 assert.deepEqual(exit,{code:0,signal:null});assert.equal(stdout.trim(),"0.1.0");assert.equal(stderr,"");
});

test("clean install authenticates, initialises dirs/config, activates, then is idempotent",async()=>{
 const {prefix,dataHome,v1,base}=await setupInstall("install");
 const result=await installManaged({...base,source:v1.source,dataHome,launcherConfig:{mode:"isolated"}});
 assert.equal(result.status,"installed");assert.equal(result.activeVersion,"1.0.0");assert.equal(result.signerKeyId,v1.keys.keyId);
 assert.equal((await fs.stat(dataHome)).isDirectory(),true);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(prefix,"config.json"),"utf8")),{home:"isolated"});
 assert.equal((await inspectManagedInstall({prefix})).status,"owned");
 const again=await installManaged({...base,source:v1.source,dataHome,launcherConfig:{mode:"isolated"}});
 assert.equal(again.status,"unchanged");
 assert.equal(checkManagedPrerequisites.length>=1,true);
});

test("prerequisites reject an old Node and a prefix that is a symlink",async()=>{
 const root=await tmp("prereq");
 assert.equal((await checkManagedPrerequisites({prefix:path.join(root,"p"),nodeVersion:"18.0.0"})).ok,false);
 if(process.platform!=="win32"){
  await fs.mkdir(path.join(root,"real"));await fs.symlink(path.join(root,"real"),path.join(root,"link"));
  assert.equal((await checkManagedPrerequisites({prefix:path.join(root,"link")})).ok,false);
  assert.equal((await checkManagedPrerequisites({prefix:path.join(root,"link","deep","prefix")})).ok,false,"a link in an ancestor must be refused");
 }
});

test("untrusted, tampered, unsigned and wrong-signer packages are rejected without leaving an install",async()=>{
 const {root,prefix,dataHome,v1,base}=await setupInstall("auth");
 const attacker=await release(root,await pkg(root,"evil","1.0.0"));
 await assert.rejects(()=>installManaged({...base,source:attacker.source,dataHome}),/authenticat|trusted|signer/i);
 await fs.appendFile(v1.manifestPath," ");
 await assert.rejects(()=>installManaged({...base,source:v1.source,dataHome}),/signature|authenticat/i);
 const fresh=await release(root,await pkg(root,"ok","1.0.0"));
 await fs.appendFile(path.join(fresh.dir,"cli.cjs"),"//tamper");
 await assert.rejects(()=>installManaged({...base,trustedKeyPath:fresh.anchor,source:fresh.source,dataHome}));
 await fs.writeFile(fresh.signaturePath,"{}");
 await assert.rejects(()=>installManaged({...base,trustedKeyPath:fresh.anchor,source:fresh.source,dataHome}));
 assert.equal((await inspectManagedInstall({prefix})).status,"absent");
});

test("Ed25519 trust-anchor rotation accepts overlap then revokes the retired signer",async()=>{
 const root=await tmp("key-rotation"),dir=await pkg(root,"rotation","1.0.0"),built=await buildManagedManifest(dir),bytes=Buffer.from(built.manifestText);
 const oldKey=generateManagedSigningKeyPair(),newKey=generateManagedSigningKeyPair();
 const oldSignature=signManagedManifest(bytes,oldKey.privateKeyPem),newSignature=signManagedManifest(bytes,newKey.privateKeyPem);
 const overlap=parseManagedTrustAnchor(`${oldKey.publicKeyPem}\n${newKey.publicKeyPem}`);
 assert.equal(verifyManagedManifestSignature({manifestBytes:bytes,signatureText:oldSignature,trustedKeys:overlap}).keyId,oldKey.keyId);
 assert.equal(verifyManagedManifestSignature({manifestBytes:bytes,signatureText:newSignature,trustedKeys:overlap}).keyId,newKey.keyId);
 const rotated=parseManagedTrustAnchor(newKey.publicKeyPem);
 assert.equal(verifyManagedManifestSignature({manifestBytes:bytes,signatureText:newSignature,trustedKeys:rotated}).keyId,newKey.keyId);
 assert.throws(()=>verifyManagedManifestSignature({manifestBytes:bytes,signatureText:oldSignature,trustedKeys:rotated}),{code:"SIGNER_NOT_TRUSTED"});
});

test("an install whose candidate fails its probe is removed again and user data stays",async()=>{
 const root=await tmp("failinstall"),{prefix,dataHome}=env(root);
 await fs.mkdir(dataHome,{recursive:true});await fs.writeFile(path.join(dataHome,"keep.txt"),"mine");
 const bad=await release(root,await pkg(root,"bad","1.0.0","process.exit(3);"));
 await assert.rejects(()=>installManaged({prefix,source:bad.source,trustedKeyPath:bad.anchor,protectedPaths:[dataHome],dataHome,confirmed:true}),/probe/i);
 assert.equal((await inspectManagedInstall({prefix})).status,"absent");
 assert.equal(await fs.readFile(path.join(dataHome,"keep.txt"),"utf8"),"mine");
});

test("upgrade activates v2 and preserves data; rollback returns to v1",async()=>{
 const {root,prefix,dataHome,v1,base}=await setupInstall("upgrade");
 await installManaged({...base,source:v1.source,dataHome});
 await fs.writeFile(path.join(dataHome,"session.jsonl"),"state");
 const v2=await release(root,await pkg(root,"v2","2.0.0"),v1.keys);
 const up=await upgradeManaged({...base,source:v2.source});
 assert.equal(up.status,"upgraded");assert.equal(up.activeVersion,"2.0.0");assert.equal(up.previousVersion,"1.0.0");
 assert.equal(await fs.readFile(path.join(dataHome,"session.jsonl"),"utf8"),"state");
 const back=await rollbackManaged({prefix,expectedCurrentVersion:"2.0.0",toVersion:"1.0.0",confirmed:true});
 assert.equal(back.status,"rolled-back");assert.equal((await inspectManagedInstall({prefix})).status==="owned"&&(await inspectManagedInstall({prefix})).activeVersion,"1.0.0");
 assert.equal((await upgradeManaged({...base,source:v1.source})).status,"unchanged");
 const v3=await release(root,await pkg(root,"v3","3.0.0"),v1.keys);
 assert.equal((await upgradeManaged({...base,source:v3.source})).activeVersion,"3.0.0");
 await assert.rejects(()=>upgradeManaged({...base,source:v1.source}),{code:"DOWNGRADE_REFUSED"});
});

test("a v2 that fails its pre-activation probe leaves v1 active and usable",async()=>{
 const {root,prefix,dataHome,v1,base}=await setupInstall("preprobe");
 await installManaged({...base,source:v1.source,dataHome});
 const v2=await release(root,await pkg(root,"v2","2.0.0","process.stdout.write('9.9.9\\n');"),v1.keys);
 const result=await upgradeManaged({...base,source:v2.source});
 assert.equal(result.status,"not-activated");assert.equal(result.activeVersion,"1.0.0");
 const inspection=await inspectManagedInstall({prefix});
 assert.equal(inspection.status==="owned"&&inspection.activeVersion,"1.0.0");
});

test("a v2 that breaks only after activation is rolled back automatically",async()=>{
 const {root,prefix,dataHome,v1,base}=await setupInstall("postprobe");
 await installManaged({...base,source:v1.source,dataHome});
 const v2=await release(root,await pkg(root,"v2","2.0.0",BAD_AFTER_SELECT("2.0.0")),v1.keys);
 const result=await upgradeManaged({...base,source:v2.source});
 assert.equal(result.status,"rolled-back");assert.equal(result.activeVersion,"1.0.0");
 const inspection=await inspectManagedInstall({prefix});
 assert.equal(inspection.status==="owned"&&inspection.activeVersion,"1.0.0");
 await assert.rejects(()=>fs.lstat(path.join(prefix,"managed-update-journal.json")),{code:"ENOENT"});
});

test("an interrupted upgrade (crash after activation) is recovered by rollback via the journal",async()=>{
 const {root,prefix,dataHome,v1,base}=await setupInstall("crash");
 await installManaged({...base,source:v1.source,dataHome});
 const v2=await release(root,await pkg(root,"v2","2.0.0"),v1.keys);
 await assert.rejects(()=>upgradeManaged({...base,source:v2.source,hooks:{afterActivation:async()=>{throw new Error("simulated crash");}}}).then(result=>{if(result.status!=="rolled-back")throw new Error("not rolled back");throw new Error("simulated crash");}));
 const state=await inspectManagedInstall({prefix});
 assert.equal(state.status,"owned");
 if(state.status==="owned"&&state.activeVersion==="2.0.0"){
  const recovered=await rollbackManaged({prefix,expectedCurrentVersion:"2.0.0",confirmed:true});
  assert.equal(recovered.activeVersion,"1.0.0");
 }
 const final=await inspectManagedInstall({prefix});
 assert.equal(final.status==="owned"&&final.activeVersion,"1.0.0");
});

test("uninstall removes only owned files, keeps data/config, and retains foreign files",async()=>{
 const {prefix,dataHome,v1,base}=await setupInstall("uninstall");
 await installManaged({...base,source:v1.source,dataHome,launcherConfig:{mode:"isolated"}});
 await fs.writeFile(path.join(dataHome,"sessions.db"),"data");
 await fs.writeFile(path.join(prefix,"install","versions","1.0.0","user-note.txt"),"foreign");
 const report=await uninstallManaged({prefix,confirmed:true});
 assert.equal(report.userDataTouched,false);assert.equal(report.status,"partial");
 assert.equal(await fs.readFile(path.join(dataHome,"sessions.db"),"utf8"),"data");
 assert.equal(await fs.readFile(path.join(prefix,"install","versions","1.0.0","user-note.txt"),"utf8"),"foreign");
 await assert.rejects(()=>fs.lstat(path.join(prefix,"install","versions","1.0.0","cli.cjs")),{code:"ENOENT"});
 await assert.rejects(()=>uninstallManaged({prefix,confirmed:false as unknown as true}),/confirm/i);
});

test("uninstall refuses a modified owned file and never follows symlinks out of the install",async()=>{
 if(process.platform==="win32")return;
 const {root,prefix,dataHome,v1,base}=await setupInstall("uninstallsym");
 await installManaged({...base,source:v1.source,dataHome});
 const outside=path.join(root,"outside.txt");await fs.writeFile(outside,"external");
 const cli=path.join(prefix,"install","versions","1.0.0","cli.cjs");
 await fs.rm(cli);await fs.symlink(outside,cli);
 const report=await uninstallManaged({prefix,confirmed:true}).catch(error=>error);
 assert.equal(await fs.readFile(outside,"utf8"),"external");
 assert.ok(report instanceof Error||report.status==="partial");
});

test("a partial uninstall keeps ownership records so a later uninstall can finish",async()=>{
 const {prefix,dataHome,v1,base}=await setupInstall("uninstallresume");
 await installManaged({...base,source:v1.source,dataHome});
 const stray=path.join(prefix,"install","versions","1.0.0","user-note.txt");await fs.writeFile(stray,"mine");
 const first=await uninstallManaged({prefix,confirmed:true});
 assert.equal(first.status,"partial");
 assert.equal(await fs.readFile(stray,"utf8"),"mine");
 await fs.access(path.join(prefix,"install","managed-install.json"));
 await fs.rm(stray);
 const second=await uninstallManaged({prefix,confirmed:true});
 assert.equal(second.status,"removed");
});

test("uninstall waits for the maintenance lease and preserves the installation on contention",async()=>{
 const {prefix,dataHome,v1,base}=await setupInstall("uninstallbusy");
 await installManaged({...base,source:v1.source,dataHome});
 const cli=path.join(prefix,"install","versions","1.0.0","cli.cjs");
 const journal=path.join(prefix,"managed-update-journal.json");
 const marker=path.join(prefix,"install",".asen-maintenance.lock");
 await fs.writeFile(journal,"transaction marker\n");
 await fs.writeFile(marker,"another maintenance operation\n");
 await assert.rejects(()=>uninstallManaged({prefix,confirmed:true}),{code:"LOCK_TIMEOUT"});
 assert.equal(await fs.readFile(cli,"utf8"),GOOD_CLI("1.0.0"));
 assert.equal(await fs.readFile(journal,"utf8"),"transaction marker\n");
 await fs.rm(marker);
 await fs.rm(journal);
 assert.equal((await uninstallManaged({prefix,confirmed:true})).status,"removed");
});

test("foreign (non-ASEN) managed roots are never touched by install or uninstall",async()=>{
 const {prefix,dataHome,v1,base}=await setupInstall("foreign");
 await fs.mkdir(path.join(prefix,"install"),{recursive:true});await fs.writeFile(path.join(prefix,"install","stranger.txt"),"not ours");
 await assert.rejects(()=>installManaged({...base,source:v1.source,dataHome}));
 await uninstallManaged({prefix,confirmed:true}).catch(()=>undefined);
 assert.equal(await fs.readFile(path.join(prefix,"install","stranger.txt"),"utf8"),"not ours");
});

// ------------------------------------------------------------ HTTPS-style acquisition (real loopback server)
async function serve(files:Record<string,Buffer|string>,mutate?:(url:string,body:Buffer)=>Buffer|undefined){
 const server:Server=createServer((req,res)=>{
  const name=(req.url??"").replace(/^\//u,"");
  if(name==="redirect"){res.writeHead(302,{location:"/asen-manifest.json"});res.end();return;}
  const raw=files[name];if(raw===undefined){res.writeHead(404);res.end();return;}
  const body=mutate?.(name,Buffer.from(raw))??Buffer.from(raw);res.writeHead(200,{"content-length":body.length});res.end(body);
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const port=(server.address() as {port:number}).port;
 return {url:`http://127.0.0.1:${port}/`,close:()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());})};
}
async function serveTls(files:Record<string,Buffer|string>){
 // This checked-in key/certificate pair is test-only TLS identity material, never a package-signing key.
 const fixture=path.resolve("tests/fixtures"),server=https.createServer({key:await fs.readFile(path.join(fixture,"t09-loopback-test-key.pem")),cert:await fs.readFile(path.join(fixture,"t09-loopback-test-ca.pem"))},(req,res)=>{
  const name=(req.url??"").replace(/^\//u,"");
  const raw=files[name];if(raw===undefined){res.writeHead(404);res.end();return;}
  const body=Buffer.isBuffer(raw)?raw:Buffer.from(raw);res.writeHead(200,{"content-length":body.length});res.end(body);
 });
 await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
 const port=(server.address() as {port:number}).port;
 return {url:`https://127.0.0.1:${port}/`,close:()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());})};
}
async function servedRelease(label:string){
 const s=await setupInstall(label);
 const files=await releaseFiles(s.v1.dir,s.v1.manifestPath,s.v1.signaturePath);
 return {...s,files};
}
async function releaseFiles(dir:string,manifestPath:string,signaturePath:string){
 const manifestText=await fs.readFile(manifestPath,"utf8");
 const manifest=JSON.parse(manifestText) as {files:{sourcePath:string}[]};
 const files:Record<string,Buffer|string>={"asen-manifest.json":manifestText,"asen-manifest.sig.json":await fs.readFile(signaturePath,"utf8")};
 for(const file of manifest.files)files[file.sourcePath]=await fs.readFile(path.join(dir,file.sourcePath));
 return files;
}

test("network acquisition installs a signed package from a loopback server",async()=>{
 const s=await servedRelease("net"),server=await serve(s.files);
 try{
  const result=await installManaged({...s.base,source:{kind:"https",baseUrl:server.url},dataHome:s.dataHome});
  assert.equal(result.status,"installed");
  assert.deepEqual(await fs.readdir(path.join(s.prefix,"downloads")).catch(()=>[] as string[]),[]);
 }finally{await server.close();}
});

test("public CLI installs and upgrades signed loopback releases, rolls back, and preserves user data",async()=>{
 const s=await servedRelease("cli-net"),homeDirectory=path.join(s.root,"home"),v1Server=await serve(s.files);
 const v2=await release(s.root,await pkg(s.root,"v2","2.0.0"),s.v1.keys),v2Files=await releaseFiles(v2.dir,v2.manifestPath,v2.signaturePath),v2Server=await serve(v2Files);
 const out:string[]=[],err:string[]=[];
 const run=async(...argv:string[])=>{out.length=0;err.length=0;return runAsen(argv,{},{homeDirectory:()=>homeDirectory,stdout:text=>out.push(text),stderr:text=>err.push(text)});};
 try{
  assert.equal(await run("managed","install","--source-url",v1Server.url,"--trust-anchor",s.v1.anchor,"--yes"),0,err.join(""));
  assert.equal(JSON.parse(out.join("")).status,"installed");
  const dataHome=path.join(homeDirectory,".asen","agent"),personal=path.join(dataHome,"keep.db");
  await fs.writeFile(personal,"preserve across signed update and rollback");
  assert.equal(await run("managed","upgrade","--source-url",v2Server.url,"--trust-anchor",s.v1.anchor,"--yes"),0,err.join(""));
  assert.equal(JSON.parse(out.join("")).status,"upgraded");
  assert.equal((await inspectManagedInstall({prefix:path.join(homeDirectory,".asen")})).activeVersion,"2.0.0");
  assert.equal(await run("managed","rollback","--expected-current","2.0.0","--to","1.0.0","--yes"),0,err.join(""));
  assert.equal(JSON.parse(out.join("")).status,"rolled-back");
  assert.equal((await inspectManagedInstall({prefix:path.join(homeDirectory,".asen")})).activeVersion,"1.0.0");
  assert.equal(await fs.readFile(personal,"utf8"),"preserve across signed update and rollback");
  assert.deepEqual(await fs.readdir(path.join(homeDirectory,".asen","downloads")),[]);
 }finally{await Promise.all([v1Server.close(),v2Server.close()]);}
});

test("public CLI verifies real TLS for signed install and upgrade before activating the new version",async()=>{
 const s=await servedRelease("cli-tls"),homeDirectory=path.join(s.root,"home"),v1Server=await serveTls(s.files);
 const v2=await release(s.root,await pkg(s.root,"tls-v2","2.0.0"),s.v1.keys),v2Server=await serveTls(await releaseFiles(v2.dir,v2.manifestPath,v2.signaturePath));
 const env:NodeJS.ProcessEnv={};
 for(const key of ["PATH","Path","PATHEXT","SystemRoot","WINDIR","COMSPEC","LANG","LC_ALL"])if(process.env[key]!==undefined)env[key]=process.env[key];
 Object.assign(env,{HOME:homeDirectory,USERPROFILE:homeDirectory,APPDATA:homeDirectory,LOCALAPPDATA:homeDirectory,TEMP:s.root,TMP:s.root,TMPDIR:s.root,NODE_EXTRA_CA_CERTS:path.resolve("tests/fixtures/t09-loopback-test-ca.pem")});
 const invoke=(trustTestCa:boolean,...args:string[])=>new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{
  const childEnv={...env};if(!trustTestCa)delete childEnv.NODE_EXTRA_CA_CERTS;
  const child=spawn(process.execPath,["--import","tsx",path.resolve("src/cli.ts"),...args],{cwd:process.cwd(),env:childEnv,stdio:["ignore","pipe","pipe"],windowsHide:true});
  let stdout="",stderr="";child.stdout.setEncoding("utf8").on("data",chunk=>stdout+=chunk);child.stderr.setEncoding("utf8").on("data",chunk=>stderr+=chunk);
  const timer=setTimeout(()=>child.kill(),30_000);child.once("error",error=>{clearTimeout(timer);reject(error);});child.once("close",code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
 });
 try{
  const args=["managed","install","--source-url",v1Server.url,"--trust-anchor",s.v1.anchor,"--yes"];
  const untrusted=await invoke(false,...args);assert.notEqual(untrusted.code,0,"unknown TLS root must be rejected");
  assert.equal((await inspectManagedInstall({prefix:path.join(homeDirectory,".asen")})).status,"absent","failed TLS acquisition must have no install effects");
  const installed=await invoke(true,...args);
  assert.equal(installed.code,0,installed.stderr);assert.equal(JSON.parse(installed.stdout).status,"installed");
  const upgraded=await invoke(true,"managed","upgrade","--source-url",v2Server.url,"--trust-anchor",s.v1.anchor,"--yes");
  assert.equal(upgraded.code,0,upgraded.stderr);assert.equal(JSON.parse(upgraded.stdout).status,"upgraded");
  assert.equal((await inspectManagedInstall({prefix:path.join(homeDirectory,".asen")})).activeVersion,"2.0.0");
 }finally{await Promise.all([v1Server.close(),v2Server.close()]);}
});

test("network acquisition rejects altered, truncated and redirected content and cleans partial downloads",async()=>{
 const s=await servedRelease("netbad");
 for(const mutate of [
  (name:string,body:Buffer)=>name==="cli.cjs"?Buffer.concat([body,Buffer.from("x")]):undefined,
  (name:string,body:Buffer)=>name==="cli.cjs"?body.subarray(0,body.length-3):undefined,
  (name:string,body:Buffer)=>name==="asen-manifest.json"?Buffer.from(body.toString().replace("1.0.0","1.0.1")):undefined,
 ]){
  const server=await serve(s.files,mutate);
  try{await assert.rejects(()=>installManaged({...s.base,source:{kind:"https",baseUrl:server.url},dataHome:s.dataHome}));}
  finally{await server.close();}
 }
 const redirecting=await serve(s.files);
 try{await assert.rejects(()=>installManaged({...s.base,source:{kind:"https",baseUrl:redirecting.url+"redirect/"},dataHome:s.dataHome}));}finally{await redirecting.close();}
 await assert.rejects(()=>installManaged({...s.base,source:{kind:"https",baseUrl:"http://example.com/"},dataHome:s.dataHome}),/https|loopback|refus/i);
 assert.equal((await inspectManagedInstall({prefix:s.prefix})).status,"absent");
 const downloads=await fs.readdir(path.join(s.prefix,"downloads")).catch(()=>[] as string[]);
 assert.deepEqual(downloads.filter(name=>name.startsWith("dl-")),[]);
});

// ------------------------------------------------------------ backup / restore
async function homeFixture(label:string){
 const root=await tmp(label),home=path.join(root,"home");
 await fs.mkdir(path.join(home,"sessions","a"),{recursive:true});await fs.mkdir(path.join(home,"empty"));
 await fs.writeFile(path.join(home,"settings.json"),'{"theme":"dark"}');await fs.writeFile(path.join(home,"sessions","a","one.jsonl"),"line\n");
 const config=path.join(root,"config.json");await fs.writeFile(config,'{"home":"isolated"}');
 return {root,home,config};
}

test("home backup is real, verifiable, never overwrites, and restores data and config exactly",async()=>{
 const {root,home,config}=await homeFixture("backup"),file=path.join(root,"out","x.asenbak");
 await fs.mkdir(path.dirname(file));
 const made=await createHomeBackup({homeDir:home,configFile:config,destination:file,asenVersion:"0.1.0"});
 assert.equal(made.files,3);
 assert.equal((await verifyHomeBackup(file)).hasConfig,true);
 await assert.rejects(()=>createHomeBackup({homeDir:home,destination:file,asenVersion:"0.1.0"}),{code:"DESTINATION_EXISTS"});
 await assert.rejects(()=>createHomeBackup({homeDir:home,destination:path.join(home,"inside.bak"),asenVersion:"0.1.0"}),{code:"DESTINATION_INSIDE_SOURCE"});
 const target=path.join(root,"restored"),targetConfig=path.join(root,"restored.config.json");
 await assert.rejects(()=>restoreHomeBackup({backup:file,targetHome:target,confirmed:false}),{code:"CONFIRMATION_REQUIRED"});
 const restored=await restoreHomeBackup({backup:file,targetHome:target,targetConfig,confirmed:true});
 assert.equal(restored.files,2);assert.equal(restored.configRestored,true);
 assert.equal(await fs.readFile(path.join(target,"settings.json"),"utf8"),'{"theme":"dark"}');
 assert.equal(await fs.readFile(path.join(target,"sessions","a","one.jsonl"),"utf8"),"line\n");
 assert.equal((await fs.stat(path.join(target,"empty"))).isDirectory(),true);
 assert.equal(await fs.readFile(targetConfig,"utf8"),'{"home":"isolated"}');
});

test("home backup takes a consistent snapshot of an active SQLite WAL database",async()=>{
 const {root,home}=await homeFixture("sqlite-wal"),databasePath=path.join(home,"memory.db"),backup=path.join(root,"sqlite.asenbak"),target=path.join(root,"sqlite-restored");
 const live=new DatabaseSync(databasePath);
 try{
  live.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE entries(value TEXT NOT NULL); INSERT INTO entries VALUES('committed-before-backup');");
  assert.equal((await fs.stat(databasePath+"-wal")).size>0,true,"committed rows must still reside in the live WAL");
  const report=await createHomeBackup({homeDir:home,destination:backup,asenVersion:"0.1.0"});
  const verified=await verifyHomeBackup(backup);
  const paths=verified._manifest.entries.map(entry=>entry.path);
  assert.ok(paths.includes("memory.db"));assert.ok(!paths.some(name=>name.endsWith("-wal")||name.endsWith("-shm")||name.endsWith("-journal")));
  live.prepare("INSERT INTO entries VALUES(?)").run("committed-after-backup");
  const restored=await restoreHomeBackup({backup,targetHome:target,confirmed:true});assert.equal(restored.status,"restored");
  const copy=new DatabaseSync(path.join(target,"memory.db"));
  try{
   assert.equal((copy.prepare("PRAGMA integrity_check").get() as {integrity_check:string}).integrity_check,"ok");
   assert.deepEqual(copy.prepare("SELECT value FROM entries ORDER BY rowid").all().map(row=>(row as {value:string}).value),["committed-before-backup"]);
  }finally{copy.close();}
  assert.equal(report.status,"created");
 }finally{live.close();}
});

test("restore refuses to overwrite existing data; --replace moves it aside instead of deleting",async()=>{
 const {root,home}=await homeFixture("overwrite"),file=path.join(root,"b.asenbak");
 await createHomeBackup({homeDir:home,destination:file,asenVersion:"0.1.0"});
 const target=path.join(root,"live");await fs.mkdir(target);await fs.writeFile(path.join(target,"precious"),"keep");
 await assert.rejects(()=>restoreHomeBackup({backup:file,targetHome:target,confirmed:true}),{code:"TARGET_EXISTS"});
 assert.equal(await fs.readFile(path.join(target,"precious"),"utf8"),"keep");
 const result=await restoreHomeBackup({backup:file,targetHome:target,replace:true,confirmed:true});
 assert.equal(result.movedAside.length,1);
 assert.equal(await fs.readFile(path.join(result.movedAside[0]!,"precious"),"utf8"),"keep");
 assert.equal(await fs.readFile(path.join(target,"settings.json"),"utf8"),'{"theme":"dark"}');
});

test("restore failure during staging cleans temporary data and can be retried",async()=>{
 const {root,home}=await homeFixture("restore-recovery"),backup=path.join(root,"recovery.asenbak"),target=path.join(root,"restore-target");
 await createHomeBackup({homeDir:home,destination:backup,asenVersion:"0.1.0"});await fs.mkdir(target);await fs.writeFile(path.join(target,"precious"),"retain-me");
 await assert.rejects(()=>restoreHomeBackup({backup,targetHome:target,replace:true,confirmed:true,hooks:{afterStagedFile(){throw new Error("injected staging interruption");}}}),{code:"RESTORE_FAILED"});
 assert.equal(await fs.readFile(path.join(target,"precious"),"utf8"),"retain-me");
 assert.deepEqual((await fs.readdir(root)).filter(name=>name.includes(".restore-")),[]);
 const restored=await restoreHomeBackup({backup,targetHome:target,replace:true,confirmed:true});
 assert.equal(await fs.readFile(path.join(target,"settings.json"),"utf8"),'{"theme":"dark"}');
 assert.equal(await fs.readFile(path.join(restored.movedAside[0]!,"precious"),"utf8"),"retain-me");
});

test("a killed restore during staging preserves the old target and a retry completes",async()=>{
 const {root,home}=await homeFixture("restore-kill"),backup=path.join(root,"interrupted.asenbak"),target=path.join(root,"interrupted-target");
 await createHomeBackup({homeDir:home,destination:backup,asenVersion:"0.1.0"});await fs.mkdir(target);await fs.writeFile(path.join(target,"precious"),"retain-after-kill");
 const childSource=`import {restoreHomeBackup} from ${JSON.stringify(pathToFileURL(path.resolve("src/runtime/home-backup.ts")).href)};await restoreHomeBackup({backup:${JSON.stringify(backup)},targetHome:${JSON.stringify(target)},replace:true,confirmed:true,hooks:{afterStagedFile(){process.stdout.write("RESTORE_STAGE_READY\\n");return new Promise(()=>setInterval(()=>undefined,1000));}}});`;
 const child=spawn(process.execPath,["--import","tsx","--input-type=module","-e",childSource],{cwd:process.cwd(),stdio:["ignore","pipe","pipe"],windowsHide:true});let output="",errors="";
 child.stdout.setEncoding("utf8").on("data",chunk=>output+=chunk);child.stderr.setEncoding("utf8").on("data",chunk=>errors+=chunk);
 const closed=new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>resolve({code,signal}));});
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error("restore child did not reach its staged-file checkpoint"));},30_000);const ready=()=>{if(output.includes("RESTORE_STAGE_READY")){clearTimeout(timer);child.stdout.off("data",ready);resolve();}};child.stdout.on("data",ready);child.once("close",()=>{clearTimeout(timer);reject(new Error(`restore child exited before staging checkpoint: ${errors}`));});});
 const stageOwner=JSON.parse(await fs.readFile(`${target}.restore-owner.json`,"utf8")) as {pid:number};
 assert.equal(stageOwner.pid,child.pid);
 assert.doesNotThrow(()=>process.kill(stageOwner.pid,0));
 await assert.rejects(()=>restoreHomeBackup({backup,targetHome:target,replace:true,confirmed:true}),{code:"RECOVERY_REQUIRED"},"a live restore must not have its stage reclaimed");
 assert.equal(await fs.readFile(path.join(target,"precious"),"utf8"),"retain-after-kill");
 child.kill("SIGKILL");const stopped=await closed;assert.notEqual(stopped.code,0,"the staging child was forcibly terminated");
 assert.equal(await fs.readFile(path.join(target,"precious"),"utf8"),"retain-after-kill");
 const abandoned=(await fs.readdir(root)).filter(name=>/^interrupted-target\.restore-[0-9a-f]{8}-/u.test(name));assert.equal(abandoned.length,1,"only a private, unpublished stage may remain after forced termination");
 const restored=await restoreHomeBackup({backup,targetHome:target,replace:true,confirmed:true});
 assert.equal(await fs.readFile(path.join(target,"settings.json"),"utf8"),'{"theme":"dark"}');
 assert.equal(await fs.readFile(path.join(restored.movedAside[0]!,"precious"),"utf8"),"retain-after-kill");
 assert.deepEqual((await fs.readdir(root)).filter(name=>/^interrupted-target\.restore-[0-9a-f]{8}-/u.test(name)),[],"retry removes only the abandoned private stage");
 await assert.rejects(()=>fs.lstat(`${target}.restore-owner.json`),{code:"ENOENT"},"retry removes its recovery marker");
});

test("a killed restore before config staging is journaled removes only its empty staged file",async()=>{
 const {root,home,config}=await homeFixture("restore-config-stage-kill"),backup=path.join(root,"config-stage.asenbak"),target=path.join(root,"config-stage-target"),targetConfig=path.join(root,"config-stage-target.json");
 await createHomeBackup({homeDir:home,configFile:config,destination:backup,asenVersion:"0.1.0"});
 const childSource=`import {restoreHomeBackup} from ${JSON.stringify(pathToFileURL(path.resolve("src/runtime/home-backup.ts")).href)};await restoreHomeBackup({backup:${JSON.stringify(backup)},targetHome:${JSON.stringify(target)},targetConfig:${JSON.stringify(targetConfig)},replace:true,confirmed:true,hooks:{afterStagedConfigCreate(){process.stdout.write("CONFIG_STAGE_CREATED\\n");return new Promise(()=>setInterval(()=>undefined,1000));}}});`;
 const child=spawn(process.execPath,["--import","tsx","--input-type=module","-e",childSource],{cwd:process.cwd(),stdio:["ignore","pipe","pipe"],windowsHide:true});let output="",errors="";
 child.stdout.setEncoding("utf8").on("data",chunk=>output+=chunk);child.stderr.setEncoding("utf8").on("data",chunk=>errors+=chunk);
 const closed=new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>resolve({code,signal}));});
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error("restore child did not reach staged config creation"));},30_000);const ready=()=>{if(output.includes("CONFIG_STAGE_CREATED")){clearTimeout(timer);child.stdout.off("data",ready);resolve();}};child.stdout.on("data",ready);child.once("close",()=>{clearTimeout(timer);reject(new Error(`restore child exited before staged config creation: ${errors}`));});});
 const owner=JSON.parse(await fs.readFile(`${target}.restore-owner.json`,"utf8")) as {stagedConfig:{path:string;identity?:unknown}};
 assert.equal(owner.stagedConfig.identity,undefined,"the owner marker must record the staged path before file creation is journaled");
 assert.equal((await fs.stat(owner.stagedConfig.path)).size,0,"SIGKILL leaves only an empty uncommitted file");
 child.kill("SIGKILL");const stopped=await closed;assert.notEqual(stopped.code,0);
 const restored=await restoreHomeBackup({backup,targetHome:target,targetConfig,replace:true,confirmed:true});
 assert.equal(await fs.readFile(targetConfig,"utf8"),'{"home":"isolated"}');
 assert.equal(await fs.readFile(path.join(target,"settings.json"),"utf8"),'{"theme":"dark"}');
 assert.equal(restored.configRestored,true);
 await assert.rejects(()=>fs.lstat(owner.stagedConfig.path),{code:"ENOENT"},"recovery removes its abandoned config staging file");
 await assert.rejects(()=>fs.lstat(`${target}.restore-owner.json`),{code:"ENOENT"},"recovery removes its marker after retry");
});

test("a killed restore after publication rolls back the owned target and config before retry",async()=>{
 const {root,home,config}=await homeFixture("restore-publish-kill"),backup=path.join(root,"published.asenbak"),target=path.join(root,"published-target"),targetConfig=path.join(root,"published-config.json");
 await createHomeBackup({homeDir:home,configFile:config,destination:backup,asenVersion:"0.1.0"});
 await fs.mkdir(target);await fs.writeFile(path.join(target,"precious"),"keep-before-publish");
 await fs.writeFile(targetConfig,"original-config");
 const childSource=`import {restoreHomeBackup} from ${JSON.stringify(pathToFileURL(path.resolve("src/runtime/home-backup.ts")).href)};await restoreHomeBackup({backup:${JSON.stringify(backup)},targetHome:${JSON.stringify(target)},targetConfig:${JSON.stringify(targetConfig)},replace:true,confirmed:true,hooks:{afterConfigPublish(){process.stdout.write("RESTORE_PUBLISHED\\n");return new Promise(()=>setInterval(()=>undefined,1000));}}});`;
 const child=spawn(process.execPath,["--import","tsx","--input-type=module","-e",childSource],{cwd:process.cwd(),stdio:["ignore","pipe","pipe"],windowsHide:true});let output="",errors="";
 child.stdout.setEncoding("utf8").on("data",chunk=>output+=chunk);child.stderr.setEncoding("utf8").on("data",chunk=>errors+=chunk);
 const closed=new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>resolve({code,signal}));});
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error("restore child did not reach its publication checkpoint"));},30_000);const ready=()=>{if(output.includes("RESTORE_PUBLISHED")){clearTimeout(timer);child.stdout.off("data",ready);resolve();}};child.stdout.on("data",ready);child.once("close",()=>{clearTimeout(timer);reject(new Error(`restore child exited before publication checkpoint: ${errors}`));});});
 child.kill("SIGKILL");const stopped=await closed;assert.notEqual(stopped.code,0,"the publication child was forcibly terminated");
 const recoverySource=`import {restoreHomeBackup} from ${JSON.stringify(pathToFileURL(path.resolve("src/runtime/home-backup.ts")).href)};await restoreHomeBackup({backup:${JSON.stringify(backup)},targetHome:${JSON.stringify(target)},targetConfig:${JSON.stringify(targetConfig)},replace:true,confirmed:true,hooks:{afterRecoveryStageRemoved(){process.stdout.write("RECOVERY_STAGE_REMOVED\\n");return new Promise(()=>setInterval(()=>undefined,1000));}}});`;
 const recovery=spawn(process.execPath,["--import","tsx","--input-type=module","-e",recoverySource],{cwd:process.cwd(),stdio:["ignore","pipe","pipe"],windowsHide:true});let recoveryOutput="",recoveryErrors="";
 recovery.stdout.setEncoding("utf8").on("data",chunk=>recoveryOutput+=chunk);recovery.stderr.setEncoding("utf8").on("data",chunk=>recoveryErrors+=chunk);
 const recoveryClosed=new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{recovery.once("error",reject);recovery.once("close",(code,signal)=>resolve({code,signal}));});
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{recovery.kill();reject(new Error("recovery child did not reach its cleanup checkpoint"));},30_000);const ready=()=>{if(recoveryOutput.includes("RECOVERY_STAGE_REMOVED")){clearTimeout(timer);recovery.stdout.off("data",ready);resolve();}};recovery.stdout.on("data",ready);recovery.once("close",()=>{clearTimeout(timer);reject(new Error(`recovery child exited before cleanup checkpoint: ${recoveryErrors}`));});});
 recovery.kill("SIGKILL");const recoveryStopped=await recoveryClosed;assert.notEqual(recoveryStopped.code,0,"the recovery child was forcibly terminated before marker cleanup");
 const recovered=await restoreHomeBackup({backup,targetHome:target,targetConfig,replace:true,confirmed:true});
 assert.equal(await fs.readFile(path.join(target,"settings.json"),"utf8"),'{"theme":"dark"}');
 assert.equal(await fs.readFile(targetConfig,"utf8"),'{"home":"isolated"}');
 const movedContents=await Promise.all(recovered.movedAside.map(async candidate=>Promise.all([
  fs.readFile(path.join(candidate,"precious"),"utf8").catch(()=>undefined),fs.readFile(candidate,"utf8").catch(()=>undefined),
 ])));
 assert.ok(movedContents.some(([homeBytes])=>homeBytes==="keep-before-publish"),"the original target contents survive recovery");
 assert.ok(movedContents.some(([,configBytes])=>configBytes==="original-config"),"the original config survives recovery");
 assert.deepEqual((await fs.readdir(root)).filter(name=>/^published-target\.restore-[0-9a-f]{8}-/u.test(name)),[]);
 await assert.rejects(()=>fs.lstat(`${target}.restore-owner.json`),{code:"ENOENT"});
});

test("restore recovery refuses to replace a config path that appears during recovery",async()=>{
 const {root,home,config}=await homeFixture("restore-config-race"),backup=path.join(root,"race.asenbak"),target=path.join(root,"race-target"),targetConfig=path.join(root,"race-config.json");
 await createHomeBackup({homeDir:home,configFile:config,destination:backup,asenVersion:"0.1.0"});
 await fs.mkdir(target);await fs.writeFile(path.join(target,"precious"),"preserve");
 await fs.writeFile(targetConfig,"original-config");
 const childSource=`import {restoreHomeBackup} from ${JSON.stringify(pathToFileURL(path.resolve("src/runtime/home-backup.ts")).href)};await restoreHomeBackup({backup:${JSON.stringify(backup)},targetHome:${JSON.stringify(target)},targetConfig:${JSON.stringify(targetConfig)},replace:true,confirmed:true,hooks:{afterConfigMove(){process.stdout.write("CONFIG_MOVED\\n");return new Promise(()=>setInterval(()=>undefined,1000));}}});`;
 const child=spawn(process.execPath,["--import","tsx","--input-type=module","-e",childSource],{cwd:process.cwd(),stdio:["ignore","pipe","pipe"],windowsHide:true});let output="",errors="";
 child.stdout.setEncoding("utf8").on("data",chunk=>output+=chunk);child.stderr.setEncoding("utf8").on("data",chunk=>errors+=chunk);
 const closed=new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>resolve({code,signal}));});
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error("restore child did not reach config move"));},30_000);const ready=()=>{if(output.includes("CONFIG_MOVED")){clearTimeout(timer);child.stdout.off("data",ready);resolve();}};child.stdout.on("data",ready);child.once("close",()=>{clearTimeout(timer);reject(new Error(`restore child exited before config move: ${errors}`));});});
 child.kill("SIGKILL");const stopped=await closed;assert.notEqual(stopped.code,0);
 await assert.rejects(()=>restoreHomeBackup({backup,targetHome:target,targetConfig,replace:true,confirmed:true,hooks:{beforeConfigRecovery:async()=>fs.writeFile(targetConfig,"concurrent-config")}}),{code:"RECOVERY_REQUIRED"});
 assert.equal(await fs.readFile(targetConfig,"utf8"),"concurrent-config");
 assert.equal(await fs.readFile(path.join(target,"precious"),"utf8"),"preserve");
 await fs.rm(targetConfig);
 const recovered=await restoreHomeBackup({backup,targetHome:target,targetConfig,replace:true,confirmed:true});
 assert.equal(await fs.readFile(targetConfig,"utf8"),'{"home":"isolated"}');
 assert.equal(await fs.readFile(path.join(target,"settings.json"),"utf8"),'{"theme":"dark"}');
 assert.ok(await Promise.all(recovered.movedAside.map(candidate=>fs.readFile(candidate,"utf8").catch(()=>undefined))).then(items=>items.includes("original-config")));
});

test("corrupt, truncated, foreign and incompatible backups are detected and restore changes nothing",async()=>{
 const {root,home}=await homeFixture("corrupt"),file=path.join(root,"c.asenbak");
 await createHomeBackup({homeDir:home,destination:file,asenVersion:"0.1.0"});
 const good=await fs.readFile(file);
 const cases:Array<[string,Buffer,string]>=[
  ["flipped",Buffer.concat([good.subarray(0,good.length-40),Buffer.from([good[good.length-40]!^1]),good.subarray(good.length-39)]),"BACKUP_CORRUPT"],
  ["truncated",good.subarray(0,good.length-50),"BACKUP_CORRUPT"],
  ["garbage",Buffer.from("not a backup at all, definitely"),"BACKUP_CORRUPT"],
 ];
 for(const [name,bytes,code] of cases){
  const bad=path.join(root,name+".bak");await fs.writeFile(bad,bytes);
  await assert.rejects(()=>verifyHomeBackup(bad),(error:unknown)=>error instanceof HomeBackupError&&error.code===code,name);
  await assert.rejects(()=>restoreHomeBackup({backup:bad,targetHome:path.join(root,"t-"+name),confirmed:true}));
  await assert.rejects(()=>fs.lstat(path.join(root,"t-"+name)),{code:"ENOENT"});
 }
 // Incompatible schema, re-sealed so only the schema is wrong.
 const {createHash}=await import("node:crypto");
 const length=good.readUInt32BE(8),manifest=good.subarray(12,12+length).toString().replace("asen.home-backup/v1","asen.home-backup/v9");
 const body=Buffer.concat([good.subarray(0,8),(()=>{const b=Buffer.alloc(4);b.writeUInt32BE(Buffer.byteLength(manifest));return b;})(),Buffer.from(manifest),good.subarray(12+length,good.length-32)]);
 const odd=path.join(root,"v9.bak");await fs.writeFile(odd,Buffer.concat([body,createHash("sha256").update(body).digest()]));
 await assert.rejects(()=>verifyHomeBackup(odd),{code:"BACKUP_INCOMPATIBLE"});
});

test("backup refuses symlinks in the source unless explicitly skipped; restore blocks path traversal",async()=>{
 if(process.platform==="win32")return;
 const {root,home}=await homeFixture("links");
 await fs.writeFile(path.join(root,"secret.txt"),"outside");await fs.symlink(path.join(root,"secret.txt"),path.join(home,"link"));
 await assert.rejects(()=>createHomeBackup({homeDir:home,destination:path.join(root,"l.bak"),asenVersion:"0.1.0"}),{code:"SOURCE_LINK"});
 const made=await createHomeBackup({homeDir:home,destination:path.join(root,"l2.bak"),asenVersion:"0.1.0",skipLinks:true});
 assert.deepEqual(made.skippedLinks,["link"]);
 // Hand-forged traversal entry, correctly sealed: must still be rejected by path validation.
 const {createHash}=await import("node:crypto");
 const manifest=Buffer.from(JSON.stringify({schema:"asen.home-backup/v1",createdAt:"x",asenVersion:"0",dirs:[],entries:[{root:"home",path:"../escape",size:1,sha256:createHash("sha256").update("a").digest("hex"),mode:420}]}));
 const header=Buffer.alloc(4);header.writeUInt32BE(manifest.length);
 const body=Buffer.concat([Buffer.from("ASENBAK1"),header,manifest,Buffer.from("a")]);
 const forged=path.join(root,"forged.bak");await fs.writeFile(forged,Buffer.concat([body,createHash("sha256").update(body).digest()]));
 await assert.rejects(()=>verifyHomeBackup(forged),{code:"BACKUP_CORRUPT"});
});

test("unreadable source data fails the backup without leaving partial output",async()=>{
 if(process.platform==="win32"||process.getuid?.()===0)return;
 const {root,home}=await homeFixture("perm");await fs.chmod(path.join(home,"settings.json"),0o000);
 const file=path.join(root,"p.bak");
 try{await assert.rejects(()=>createHomeBackup({homeDir:home,destination:file,asenVersion:"0.1.0"}));}finally{await fs.chmod(path.join(home,"settings.json"),0o600);}
 assert.deepEqual((await fs.readdir(root)).filter(name=>name.startsWith("p.bak")),[]);
});

// ------------------------------------------------------------ browser assistant (real loopback HTTP)
function request(url:string,method:string,headers:Record<string,string>={}):Promise<number>{
 return new Promise((resolve,reject)=>{const req=http.request(url,{method,headers},res=>{res.resume();res.on("end",()=>resolve(res.statusCode??0));});req.on("error",reject);req.end();});
}
test("browser assistant: wrong token, foreign Origin and bad Host are refused; confirm resolves once",async()=>{
 let url="";const urlReady=new Promise<void>(resolve=>{(globalThis as {__ready?:()=>void}).__ready=resolve;});
 const pending=requestBrowserConsent({title:"t",lines:["a <b>"],timeoutMs:10_000,onUrl:value=>{url=value;(globalThis as {__ready?:()=>void}).__ready?.();}});
 await urlReady;
 const base=new URL(url),token=base.pathname.slice(1);
 assert.equal(await request(`http://127.0.0.1:${base.port}/wrong`,"GET"),404);
 assert.equal(await request(url,"GET",{host:"evil.example"}),403);
 assert.equal(await request(`${url}/confirm`,"POST",{origin:"http://evil.example","x-asen-token":token}),403);
 assert.equal(await request(`${url}/confirm`,"POST"),403);
 assert.equal(await request(url,"GET"),200);
 assert.equal(await request(`${url}/confirm`,"POST",{"x-asen-token":token}),200);
 assert.equal(await pending,"confirmed");
});
test("browser assistant times out without confirming",async()=>{
 assert.equal(await requestBrowserConsent({title:"t",lines:[],timeoutMs:50,onUrl:()=>undefined}),"timeout");
});

// ------------------------------------------------------------ public CLI end to end
test("public CLI: release keygen/manifest/sign → install → upgrade → backup → uninstall keeps data",async()=>{
 const root=await tmp("cli"),homeDirectory=path.join(root,"home");await fs.mkdir(homeDirectory);
 const out:string[]=[],err:string[]=[];
 const run=async(...argv:string[])=>{out.length=0;err.length=0;const code=await runAsen(argv,{},{homeDirectory:()=>homeDirectory,stdout:text=>out.push(text),stderr:text=>err.push(text)});return code;};
 const priv=path.join(root,"k.pem"),pub=path.join(root,"k.pub.pem");
 assert.equal(await run("managed","release","keygen","--private-key",priv,"--public-key",pub),0);
 const ship=async(version:string,cli=GOOD_CLI(version))=>{
  const dir=await pkg(root,`pkg-${version}`,version,cli),manifest=path.join(root,`m-${version}.json`),sig=path.join(root,`s-${version}.json`);
  assert.equal(await run("managed","release","manifest","--package-root",dir,"--output",manifest),0);
  assert.equal(await run("managed","release","sign","--manifest",manifest,"--private-key",priv,"--output",sig),0);
  return ["--manifest",manifest,"--signature",sig,"--package-root",dir,"--trust-anchor",pub];
 };
 const v1=await ship("1.0.0"),v2=await ship("2.0.0");
 assert.equal(await run("managed","install",...v1),2,"consent flag required");
 assert.equal(await run("managed","install",...v1,"--yes"),0,err.join(""));
 assert.equal(JSON.parse(out.join("")).status,"installed");
 assert.equal(await run("managed","upgrade",...v2,"--yes"),0,err.join(""));
 const dataHome=path.join(homeDirectory,".asen","agent");await fs.writeFile(path.join(dataHome,"mem.db"),"data");
 const backup=path.join(root,"cli.asenbak");
 assert.equal(await run("backup","home","--destination",backup),0,err.join(""));
 assert.equal(await run("backup","verify","--file",backup),0,err.join(""));
 assert.equal(await run("managed","rollback","--expected-current","2.0.0","--to","1.0.0","--yes"),0,err.join(""));
 assert.equal(await run("managed","uninstall","--yes"),0,err.join(""));
 assert.equal(await fs.readFile(path.join(dataHome,"mem.db"),"utf8"),"data");
 const restoredHome=path.join(root,"restored");
 assert.equal(await run("restore","home","--backup",backup,"--target-home",restoredHome,"--yes"),0,err.join(""));
 assert.equal(await fs.readFile(path.join(restoredHome,"mem.db"),"utf8"),"data");
 assert.equal(await run("managed","uninstall"),2);
 assert.equal(await run("backup","verify","--file","relative.bak"),2);
});

test("public CLI: --browser asks for consent via loopback and a cancel changes nothing",async()=>{
 const root=await tmp("clibrowser"),homeDirectory=path.join(root,"home");await fs.mkdir(homeDirectory);
 const v1=await release(root,await pkg(root,"v1","1.0.0"));
 const err:string[]=[];
 const code=await runAsen(["managed","install","--manifest",v1.manifestPath,"--signature",v1.signaturePath,"--package-root",v1.dir,"--trust-anchor",v1.anchor,"--browser","--no-open","--timeout-ms","10000"],{},
  {homeDirectory:()=>homeDirectory,stdout:()=>undefined,stderr:text=>{err.push(text);const match=/(http:\/\/127\.0\.0\.1:\d+\/\S+) to confirm/u.exec(text);if(match){const url=match[1]!,token=new URL(url).pathname.slice(1);void request(`${url}/cancel`,"POST",{"x-asen-token":token});}}});
 assert.equal(code,1);assert.match(err.join(""),/cancelled/);
 assert.equal((await inspectManagedInstall({prefix:path.join(homeDirectory,".asen")})).status,"absent");
});
