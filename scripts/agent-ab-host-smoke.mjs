/** Pinned A/B host smoke, not C01-C20 parity.
 * Runs only --help for each native entrypoint in disposable isolated checkouts.
 * Never installs the repositories, uses private credentials or executes AI prompts.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,statSync,writeFileSync} from "node:fs";
import {isAbsolute,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {pinnedAgentABSources} from "./agent-ab-source-witness.mjs";
const SHA=/^[0-9a-f]{40}$/u;
const HASH=/^[0-9a-f]{64}$/u;
const hash=text=>createHash("sha256").update(text).digest("hex");
const trusted=(home)=>({
 PATH:process.env.PATH,HOME:home,USERPROFILE:home,TMPDIR:home,TMP:home,TEMP:home,
 LANG:"C",LC_ALL:"C",GIT_TERMINAL_PROMPT:"0",GIT_ASKPASS:"",
 PI_OFFLINE:"1",GOTOOLCHAIN:"local",
 GOPROXY:"https://proxy.golang.org",GOSUMDB:"sum.golang.org",
 GOFLAGS:"-mod=readonly -modcacherw",GOWORK:"off",CGO_ENABLED:"0",
});
export function validateReferenceHostSmoke(report,sourceList=pinnedAgentABSources()){
 assert.equal(report?.schema,"asen-ab-native-host-smoke/v1");
 assert.equal(report?.status,"REFERENCE_HOST_HELP_ONLY");
 assert.equal(report?.executedCases,0);
 assert.equal(report?.fullParity,false);
 assert.equal(report?.modelCalls,0);
 assert.equal(report?.writerAuthorized,false);
 assert.equal(report?.referenceBProvisioned,false);
 assert.deepEqual(report?.hosts?.map(x=>x.id),["A","B"]);
 for(let i=0;i<2;i++){
  const row=report.hosts[i],source=sourceList[i];
  assert.equal(row.repository,source.repository);
  assert.equal(row.commit,source.commit);
  assert.equal(row.tree,source.tree);
  assert.equal(row.exitCode,0);
  assert.equal(row.runtime,i===0?"node-pi-entrypoint":"go-installer-binary");
  assert.equal(row.onlyHelp,true);
  assert.match(row.outputSha256??"",HASH);
  assert.ok(Number.isSafeInteger(row.outputBytes)&&row.outputBytes>20&&row.outputBytes<131072);
  assert.equal(row.repositoryClean,true);
 }
 return true;
}
export function runReferenceHostSmoke({root,runCommand=execFileSync}){
 if(typeof root!=="string"||!isAbsolute(root)||!statSync(root).isDirectory())
  throw Error("A/B host probe requires an existing isolated absolute temporary directory");
 const home=join(root,"home");mkdirSync(home,{mode:0o700});
 const env=trusted(home);
 function run(cmd,args,cwd,timeout=180000){
  return String(runCommand(cmd,args,{cwd,env,encoding:"utf8",timeout,
   windowsHide:true,maxBuffer:131072,stdio:["ignore","pipe","pipe"]}));
 }
 const rows=[];
 for(const src of pinnedAgentABSources()){
  const dir=join(root,"reference-"+src.id),remote="https://github.com/"+src.repository+".git";
  mkdirSync(dir,{mode:0o700});
  const git=(...args)=>run("git",["-C",dir,...args],root,90000).trim();
  git("init","-q");
  git("fetch","--depth=1","--no-tags",remote,src.commit);
  git("checkout","-q","--detach","FETCH_HEAD");
  if(git("rev-parse","HEAD")!==src.commit||
     git("rev-parse","HEAD^{tree}")!==src.tree)
   throw Error("A/B executable source mismatch for "+src.id);
  let output;
  if(src.id==="A"){
   const manifest=JSON.parse(readFileSync(join(dir,"package.json"),"utf8"));
   const entries=manifest?.bin&&typeof manifest.bin==="object"?Object.values(manifest.bin):[];
   if(entries.length!==1||typeof entries[0]!=="string"||!/^bin\/[A-Za-z0-9_-]+\.mjs$/u.test(entries[0]))
    throw Error("A native Pi bin entrypoint is missing from pinned package metadata");
   output=run(process.execPath,[join(dir,...entries[0].split("/")),"--help"],dir,45000);
  }else{
   const binary=join(root,"reference-b-cli");
   const cliName=src.repository.split("/").at(-1);
   if(!cliName||!/^[A-Za-z0-9_-]+$/u.test(cliName))throw Error("Invalid frozen B host name");
   run("go",["build","-trimpath","-o",binary,"./cmd/"+cliName],dir,300000);
   if(!statSync(binary).isFile())throw Error("B native binary missing after build");
   output=run(binary,["--help"],dir,45000);
  }
  if(output.length<=20||output.length>=131072)throw Error("A/B --help produced invalid bounded output");
  if(git("status","--porcelain")!=="")throw Error("A/B native host modified its pinned checkout");
  rows.push({id:src.id,repository:src.repository,commit:src.commit,tree:src.tree,
   runtime:src.id==="A"?"node-pi-entrypoint":"go-installer-binary",
   exitCode:0,outputSha256:hash(output),outputBytes:Buffer.byteLength(output),
   onlyHelp:true,repositoryClean:true});
 }
 const report={schema:"asen-ab-native-host-smoke/v1",
  status:"REFERENCE_HOST_HELP_ONLY",hosts:rows,
  executedCases:0,modelCalls:0,writerAuthorized:false,
  referenceBProvisioned:false,fullParity:false,
  limitation:"Executed only the two pinned --help entrypoints, not any C01-C20 decision or provisioned B agent runtime."};
 validateReferenceHostSmoke(report);
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let root;
 try{
  const location=process.env.RUNNER_TEMP,output=process.env.ASEN_AB_HOST_SMOKE_OUTPUT;
  if(process.argv.length!==2||!location||!isAbsolute(location)||!output||!isAbsolute(output))
   throw Error("A/B host smoke requires an isolated runner temp and absolute receipt path");
  root=mkdtempSync(join(realpathSync(location),"asen-ab-native-host-"));
  const report=runReferenceHostSmoke({root});
  writeFileSync(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
  console.log("ASEN_AB_NATIVE_HOST_HELP_ONLY "+JSON.stringify({
   hosts:report.hosts.map(x=>({id:x.id,outputSha256:x.outputSha256})),
   executedCases:0,fullParity:false,
  }));
 }catch(error){console.error(error instanceof Error?error.message:"Native A/B probe failed");process.exitCode=1;}
 finally{if(root)rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
}
