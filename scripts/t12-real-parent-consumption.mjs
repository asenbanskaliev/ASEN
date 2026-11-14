/** EF-601: authentic one-turn Pi TUI coordinator consumption with Beam.
 * A controlled read-only ASEN child fixture emits through the production
 * notice path. The Pi parent must use real status and ack tools after wake.
 * No human Writer consent, A/B execution or FULL is implied.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {gradeParentConsumption} from "./t12-parent-consumption-grade.mjs";

const repo=fileURLToPath(new URL("../",import.meta.url));
const expected=process.env.ASEN_EXPECTED_SHA,model=process.env.ASEN_SELECTED_MODEL;
assert.match(expected??"",/^[a-f0-9]{40}$/u);
assert.ok(model==="beam"||model==="beam:cloud","Only registered Beam model is admitted");
assert.equal(execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim(),expected);
assert.equal(process.platform,"linux","Native parent probe supports Linux TUI only");
const packageJson=JSON.parse(readFileSync(join(repo,"node_modules","@earendil-works","pi-coding-agent","package.json"),"utf8"));
assert.equal(packageJson.version,"1.2.0","Pinned Pi runtime required");
const binary=join(repo,"node_modules","@earendil-works","pi-coding-agent",
 typeof packageJson.bin==="string"?packageJson.bin:packageJson.bin.pi);
const temp=realpathSync(mkdtempSync(join(tmpdir(),"asen-real-parent-")));
const privateHome=join(temp,"data"),project=join(temp,"project"),trace=join(temp,"trace.json"),ready=join(temp,"ready");
mkdirSync(privateHome,{mode:0o700});mkdirSync(project,{mode:0o700});
const git=(...args)=>execFileSync("git",["-C",project,...args],{encoding:"utf8"}).trim();
git("init","-q");git("config","user.name","Native read-only acceptance");git("config","user.email","pi@example.invalid");
writeFileSync(join(project,"README.md"),"DISPOSABLE READ-ONLY PI FIXTURE\n",{mode:0o600});
git("add","README.md");git("commit","-qm","baseline");
const env={...process.env,ASEN_PARENT_TRACE_FILE:trace,ASEN_PARENT_READY_FILE:ready,
 ASEN_PARENT_PRIVATE_HOME:privateHome,ASEN_NO_SKILL_REGISTRY:"1",
 PI_OLLAMA_WEB_TOOLS:"0",TERM:"xterm-256color",OLLAMA_API_KEY:process.env.ASEN_OLLAMA_API_KEY,
};
delete env.ASEN_OLLAMA_API_KEY;
for(const name of Object.keys(env)){
 if(name.startsWith("GIT_")||/^(OPENAI|ANTHROPIC|GROQ|NVIDIA|OPENROUTER|GOOGLE|GEMINI).*(_KEY|_TOKEN)$/u.test(name))delete env[name];
}
if(!env.OLLAMA_API_KEY||!env.HOME)throw Error("Isolated Ollama Cloud authentication is missing");
const output=join(repo,"asen-acceptance-evidence","real-pi-parent-wake.json");
let child,commandSent=false,exitCode=null,timedOut=false;
const visibleHash=createHash("sha256");
try{
 const pty=await import("node-pty");
 const probe=join(repo,"scripts","t12-parent-probe.ts");
 child=pty.spawn(process.execPath,[binary,
  "--extension",probe,"--no-skills","--no-builtin-tools",
  "--provider","ollama-cloud","--model",model],
  {cwd:project,env,cols:130,rows:38,name:"xterm-256color"});
 child.onData(chunk=>visibleHash.update(chunk));
 await new Promise((done,reject)=>{
  const timeout=setTimeout(()=>{timedOut=true;child.kill();},140000);
  const deadline=setTimeout(()=>{child.kill();reject(Error("Native Pi TUI cleanup deadline exceeded"));},150000);
  const poll=setInterval(()=>{
   if(!commandSent&&existsSync(ready)){
    commandSent=true;
    setTimeout(()=>child.write("/t12-parent-notice\r"),850);
   }
  },80);
  child.onExit(({exitCode:code})=>{
   clearTimeout(timeout);clearTimeout(deadline);clearInterval(poll);
   exitCode=code;done();
  });
 });
 assert.equal(timedOut,false,"Pi TUI parent turn timed out");
 assert.equal(exitCode,0,"Native Pi TUI parent did not terminate normally");
 assert.equal(commandSent,true,"A real TUI command was not submitted");
 const events=JSON.parse(readFileSync(trace,"utf8")).events;
 const ledger=JSON.parse(readFileSync(join(privateHome,".asen","agent-notices.json"),"utf8"));
 assert.equal(ledger.entries.length,1,"The actual ASEN journal must have exactly one terminal notice");
 const result=gradeParentConsumption({
  candidateSha:expected,model,events,notice:ledger.entries[0],
 });
 assert.equal(git("status","--porcelain"),"","Read-only Pi acceptance must preserve the project");
 mkdirSync(join(repo,"asen-acceptance-evidence"),{recursive:true});
 writeFileSync(output,JSON.stringify({...result,
  piVersion:packageJson.version,platform:process.platform,
  nativeTuiSha256:visibleHash.digest("hex"),projectUnchanged:true,
 },null,2)+"\n",{flag:"wx",mode:0o600});
 console.log("T12_REAL_PI_PARENT_CONSUMPTION_PASS "+
  JSON.stringify({status:result.status,verifiedParentToolActions:2,globalFull:false}));
}catch(error){
 console.error("T12_REAL_PI_PARENT_CONSUMPTION_FAIL",error instanceof Error?error.message:"Unknown error");
 if(child)try{child.kill();}catch{}
 process.exitCode=1;
}finally{
 try{rmSync(temp,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
 catch(error){console.error("Native parent cleanup failed",String(error));process.exitCode=1;}
}
