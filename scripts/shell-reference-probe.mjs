/** Active R4-04 native reference probe: execute only the frozen Shell 4.6.0
 * CLI --help in an isolated checkout. No model, install, user data or writes
 * outside RUNNER_TEMP. A launcher help result NEVER certifies agent parity.
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,statSync,writeFileSync} from "node:fs";
import {dirname,isAbsolute,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {validateShellAsenBaseline} from "./shell-asen-parity.mjs";
const SHA=/^[a-f0-9]{40}$/u;
const HASH=/^[a-f0-9]{64}$/u;
const file=new URL("../registry/parity/shell-asen-baseline-v1.json",import.meta.url);
const baseline=()=>validateShellAsenBaseline(JSON.parse(readFileSync(file,"utf8")));
const trusted=home=>({PATH:process.env.PATH,HOME:home,USERPROFILE:home,
 TMPDIR:home,TMP:home,TEMP:home,LANG:"C",LC_ALL:"C",
 GIT_TERMINAL_PROMPT:"0",GIT_ASKPASS:"",PI_OFFLINE:"1"});
export function validateShellReferenceProbe(report,reference=baseline().reference){
 assert.equal(report?.schema,"asen-shell-pi-reference-probe/v1");
 assert.equal(report?.status,"SHELL_LAUNCHER_HELP_ONLY");
 assert.equal(report?.referenceSha,reference.commit);
 assert.equal(report?.referenceTree,reference.tree);
 assert.equal(report?.version,reference.packageVersion);
 assert.equal(report?.referenceTag,reference.tag);
 assert.equal(report?.runtimeHost,"pi");
 assert.match(report?.candidateSha??"",SHA);
 assert.match(report?.helpDigest??"",HASH);
 assert.ok(Number.isSafeInteger(report.helpBytes)&&report.helpBytes>20&&report.helpBytes<131072);
 assert.equal(report.repositoryClean,true);
 assert.equal(report.modelCalls,0);
 assert.equal(report.casesExecuted,0);
 assert.equal(report.userAuthorizedWrites,false);
 assert.equal(report.globalFull,false);
 return true;
}
export function runShellReferenceProbe({root,candidateSha,runCommand=execFileSync,
 reference=baseline().reference}){
 assert.ok(typeof root==="string"&&isAbsolute(root)&&statSync(root).isDirectory(),
  "Reference probe must use a disposable absolute directory");
 assert.match(candidateSha??"",SHA);
 const home=join(root,"home"),checkout=join(root,"reference");
 mkdirSync(home,{mode:0o700});mkdirSync(checkout,{mode:0o700});
 const env=trusted(home);
 function run(command,args,cwd,timeout=120000){
  return String(runCommand(command,args,{cwd,env,encoding:"utf8",timeout,
   windowsHide:true,maxBuffer:131072,stdio:["ignore","pipe","pipe"]}));
 }
 const remote="https://github.com/"+reference.repository+".git";
 const git=(...args)=>run("git",["-C",checkout,...args],root,90000).trim();
 git("init","-q");
 git("fetch","--depth=1","--no-tags",remote,reference.commit);
 git("checkout","-q","--detach","FETCH_HEAD");
 assert.equal(git("rev-parse","HEAD"),reference.commit,"Unexpected reference commit");
 assert.equal(git("rev-parse","HEAD^{tree}"),reference.tree,"Unexpected reference tree");
 const pkg=JSON.parse(readFileSync(join(checkout,"package.json"),"utf8"));
 assert.equal(pkg.version,reference.packageVersion,"Wrong reference package version");
 assert.equal(pkg.name,"gen"+"tle-pi","Expected source package not loaded");
 assert.equal(pkg.bin?.["gen"+"tle-shell"],"bin/"+"gen"+"tle-shell.mjs",
  "Frozen CLI entrypoint mismatch");
 const out=run(process.execPath,[join(checkout,pkg.bin["gen"+"tle-shell"]),"--help"],checkout,45000);
 const helpBytes=Buffer.byteLength(out);
 assert.ok(helpBytes>20&&helpBytes<131072,"Invalid bounded native CLI help output");
 assert.equal(git("status","--porcelain"),"","Reference source modified during read-only probe");
 const report={schema:"asen-shell-pi-reference-probe/v1",status:"SHELL_LAUNCHER_HELP_ONLY",
  candidateSha,referenceSha:reference.commit,referenceTree:reference.tree,
  referenceTag:reference.tag,version:pkg.version,runtimeHost:"pi",
  helpDigest:createHash("sha256").update(out).digest("hex"),helpBytes,
  repositoryClean:true,modelCalls:0,casesExecuted:0,userAuthorizedWrites:false,globalFull:false,
  limitation:"Running the pinned launcher --help proves an executable native reference, not C01-C20 agent activity, UI parity, model behavior or human consent."};
 validateShellReferenceProbe(report,reference);
 return Object.freeze(report);
}
function main(){
 const env=process.env;
 assert.equal(env.GITHUB_ACTIONS,"true");
 assert.equal(env.GITHUB_REPOSITORY,"asenbanskaliev/ASEN");
 assert.equal(env.GITHUB_EVENT_NAME,"push");
 assert.equal(env.GITHUB_REF,"refs/heads/feat/t12-integrated-acceptance-merge");
 assert.match(env.ASEN_EXPECTED_SHA??"",SHA);
 assert.equal(execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),env.ASEN_EXPECTED_SHA);
 assert.ok(isAbsolute(env.RUNNER_TEMP??"")&&isAbsolute(env.ASEN_SHELL_PROBE_OUTPUT??""));
 const location=realpathSync(env.RUNNER_TEMP);
 const output=resolve(env.ASEN_SHELL_PROBE_OUTPUT);
 assert.equal(dirname(output),resolve("asen-acceptance-evidence"),
  "Reference proof may only write to its designated worktree evidence folder");
 const root=mkdtempSync(join(location,"asen-shell-reference-"));
 try{
  const result=runShellReferenceProbe({root,candidateSha:env.ASEN_EXPECTED_SHA});
  writeFileSync(output,JSON.stringify(result,null,2)+"\n",{flag:"wx",mode:0o600});
  console.log(JSON.stringify({status:result.status,version:result.version,
   referenceSha:result.referenceSha,candidateSha:result.candidateSha,casesExecuted:0,globalFull:false}));
 }finally{rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main();}catch(error){console.error("SHELL_PROBE_REJECTED: "+(error instanceof Error?error.message:"unknown"));
  process.exitCode=1;}
}
