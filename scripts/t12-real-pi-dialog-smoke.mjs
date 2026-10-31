import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {prepareDarwinPtyHelper} from "./pi-matrix-pty-helper.mjs";

const repo=fileURLToPath(new URL("../",import.meta.url));
const expected=process.env.ASEN_EXPECTED_SHA;
const scenario=process.env.ASEN_T12_DIALOG_SCENARIO==="apply"?"apply":"cancel";
assert.match(expected??"",/^[0-9a-f]{40}$/u);
assert.equal(execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim(),expected);
const metadata=JSON.parse(readFileSync(join(repo,"node_modules","@earendil-works","pi-coding-agent","package.json"),"utf8"));
assert.equal(metadata.version,"1.2.0","T12 interactive proof must use the pinned real Pi 1.2.0 host");
const binary=join(repo,"node_modules","@earendil-works","pi-coding-agent",typeof metadata.bin==="string"?metadata.bin:metadata.bin.pi);
const primary=join(repo,"extensions","asen.ts");
const temporary=realpathSync(mkdtempSync(join(tmpdir(),"asen-t12-tui-dialog-")));
const project=join(temporary,"project"),home=join(temporary,"home");
mkdirSync(project);mkdirSync(home,{mode:0o700});
const git=(...args)=>execFileSync("git",["-C",project,...args],{encoding:"utf8"}).trim();
git("init","-q");git("config","user.name","T12 TUI acceptance");git("config","user.email","t12@example.invalid");
const target=join(project,"shared.txt");
writeFileSync(target,"original\n");git("add","shared.txt");git("commit","-qm","baseline");
const ready=join(temporary,"ready"),seedAck=join(temporary,"seed-ack"),ack=join(temporary,"ack"),probe=join(temporary,"probe.ts");
const workspaceFile=join(home,".asen","workspace.json");
const workspaceModule=pathToFileURL(join(repo,"src","runtime","workspace-store.ts")).href;
const probeLines=[
 'import {readFileSync,writeFileSync,realpathSync} from "node:fs";',
 'import {PersistentWorkspaceStore} from '+JSON.stringify(workspaceModule)+';',
 'export default function(pi){',
 ' let modelCalls=0;',
 ' pi.on("before_agent_start",()=>{modelCalls++;throw Error("T12 forbids model calls");});',
 ' pi.registerCommand("t12-seed-conflict",{description:"T12 disposable Git fixture only",handler:async(_args,ctx)=>{',
 '  const store=await PersistentWorkspaceStore.open('+JSON.stringify(workspaceFile)+');',
 '  const projectId=realpathSync(ctx.cwd),sessionId=ctx.sessionManager.getSessionId();',
 '  const change={path:"shared.txt",sessionId,projectId,worktree:projectId,operation:"modify",at:new Date().toISOString()};',
 '  await store.append({...change,actor:{kind:"agent",id:"first-writer"}});',
 '  await store.append({...change,actor:{kind:"user",id:"second-writer"}});',
 '  const recorded=await store.list({sessionId,projectId,worktree:projectId});',
 '  if(recorded.length!==2)throw Error("Seeded conflict is not visible under active command identity");',
 '  writeFileSync('+JSON.stringify(seedAck)+',JSON.stringify({count:recorded.length,modelCalls}));',
 ' }});',
 ' pi.on("session_start",(_event,ctx)=>{',
 '  writeFileSync('+JSON.stringify(ready)+',"ready");',
 '  const interval=setInterval(()=>{',
 '   try{if(readFileSync('+JSON.stringify(ack)+',"utf8")==="ack"){clearInterval(interval);clearTimeout(safety);ctx.shutdown();}}catch{}',
 '  },80);',
 '  const safety=setTimeout(()=>{clearInterval(interval);ctx.shutdown();},25000);',
 ' });',
 ' pi.on("session_shutdown",()=>writeFileSync('+JSON.stringify(join(temporary,"shutdown"))+',String(modelCalls)));',
 '}'
];
writeFileSync(probe,probeLines.join("\n")+"\n");
const env={...process.env,HOME:home,USERPROFILE:home,PI_CODING_AGENT_DIR:join(home,"agent"),
 ASEN_NO_SKILL_REGISTRY:"1",PI_TELEMETRY:"0",TERM:"xterm-256color"};
for(const key of Object.keys(env))if(key.startsWith("GIT_")||/^(OPENAI|ANTHROPIC|GROQ|NVIDIA|OPENROUTER|GOOGLE|GEMINI).*(_KEY|_TOKEN)$/u.test(key))delete env[key];
let child,log="",phase="waiting-for-session",timedOut=false,exitCode,signal=null,exited=false;
const events=[];
const receiptPath=join(repo,`t12-real-pi-tui-${scenario}.json`);
const schedule=(fn,ms=320)=>setTimeout(fn,ms);
const phaseTraceFile=join(repo,"t12-debug-phase-"+scenario+".json");
let lastObservedPhase="";
const phaseMonitor=setInterval(()=>{
 if(phase===lastObservedPhase)return;
 lastObservedPhase=phase;
 try{writeFileSync(phaseTraceFile,JSON.stringify({scenario,phase,events})+"\\n");}catch{}
 console.log("T12_PHASE",JSON.stringify({scenario,phase}));
},200);
phaseMonitor.unref();
// A native Windows PTY may keep the Node event loop alive even after a failed assertion.
// The outer watchdog never counts as success: it records failure and terminates the
// disposable child process tree before returning a non-zero exit to Actions.
const hardWatchdog=setTimeout(()=>{
 const failure={schemaVersion:1,candidate:expected,host:"@earendil-works/pi-coding-agent",
  platform:process.platform,scenario,phase,events,timedOut:true,result:"FAIL",
  reason:"Native PTY child did not settle within the bounded test budget",
  logSha256:createHash("sha256").update(log).digest("hex")};
 try{writeFileSync(receiptPath,JSON.stringify(failure,null,2)+"\\n");}catch{}
 console.error("T12_NATIVE_PTY_WATCHDOG",JSON.stringify({scenario,phase,events}));
 if(child)try{
  if(process.platform==="win32"&&Number.isSafeInteger(child.pid)&&child.pid>0)
   execFileSync("taskkill",["/PID",String(child.pid),"/T","/F"],{timeout:6000,windowsHide:true,stdio:"ignore"});
  else child.kill();
 }catch{/* The runner handles any surviving disposable process. */}
 process.exit(124);
},105_000);
hardWatchdog.unref();
try{
 prepareDarwinPtyHelper();
 const pty=await import("node-pty");
 child=pty.spawn(process.execPath,[binary,"--no-extensions","--extension",primary,"--extension",probe,
  "--no-skills","--no-builtin-tools","--provider","openai","--model","gpt-4o"],
  {cwd:project,env,cols:120,rows:40,name:"xterm-256color"});
 await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{timedOut=true;child.kill();},40000);
  const safety=setTimeout(()=>reject(Error("Real Pi TUI child cleanup not observed")),45000);
  const poll=setInterval(()=>{
   if(phase==="waiting-for-session"&&existsSync(ready)){
    phase="seeding";schedule(()=>child.write("/t12-seed-conflict\r"),900);
   }else if(phase==="seeding"&&existsSync(seedAck)){
    phase="command-sent";events.push("command-sent");
    schedule(()=>child.write("/asen-changes resolve\r"),900);
   }
  },80);
  child.onData(chunk=>{
   log=(log+chunk).slice(-250000);
   if(phase==="command-sent"&&log.includes("Selecciona un archivo con conflicto atribuido")){
    phase="selection-visible";events.push("selection-visible");schedule(()=>{child.write("\r");phase="selection-confirmed";events.push("selection-confirmed");});
   }else if(phase==="selection-confirmed"&&log.includes("Editar una corrección para shared.txt")){
    phase="editor-visible";events.push("editor-visible");
    if(scenario==="cancel")schedule(()=>{child.write("\x1b");phase="editor-cancelled";events.push("editor-escape-sent");});
    else schedule(()=>{
     child.write("NATIVE_T12");events.push("edited-input-sent");
     setTimeout(()=>{child.write("\r");phase="editor-submitted";events.push("editor-submitted");},300);
    });
   }else if(phase==="editor-cancelled"&&log.includes("Corrección cancelada.")){
    phase="cancellation-visible";events.push("cancellation-visible");writeFileSync(ack,"ack");
   }else if(phase==="editor-submitted"&&log.includes("Aplicar corrección limitada al archivo seleccionado?")){
    phase="confirmation-visible";events.push("confirmation-visible");
    schedule(()=>{child.write("y");setTimeout(()=>{child.write("\r");phase="consent-sent";events.push("consent-sent");},250);});
   }else if(phase==="consent-sent"&&log.includes("Archivo corregido con autorización de un uso:")){
    phase="applied-visible";events.push("applied-visible");writeFileSync(ack,"ack");
   }
  });
  child.onExit(result=>{clearTimeout(timeout);clearTimeout(safety);clearInterval(poll);exitCode=result.exitCode;signal=result.signal?String(result.signal):null;exited=true;resolve();});
 });
 assert.equal(timedOut,false,"Real Pi TUI must shut down without timeout");
 assert.equal(exitCode,0,"Real Pi TUI must exit without forced termination");
 assert.equal(signal,null);
 if(scenario==="cancel"){
  assert.equal(phase,"cancellation-visible","TUI must show selector/editor and a real Escape cancellation");
  assert.deepEqual(events,["command-sent","selection-visible","selection-confirmed","editor-visible","editor-escape-sent","cancellation-visible"]);
  assert.equal(readFileSync(target,"utf8"),"original\n","cancelling the editor must preserve the original tracked file");
  assert.equal(git("status","--porcelain"),"","the real Pi UI cancellation must not leave Git changes");
 }else{
  assert.equal(phase,"applied-visible","TUI must submit a modified editor and explicit UI approval");
  assert.notEqual(readFileSync(target,"utf8"),"original\n","the consented edit must change the tracked file");
  assert.match(readFileSync(target,"utf8"),/NATIVE_T12/);
  assert.match(git("status","--porcelain"),/shared\.txt/);
 }
 assert.equal(git("log","-1","--pretty=%s"),"baseline","no UI correction commits automatically");
 assert.equal(readFileSync(join(temporary,"shutdown"),"utf8"),"0","the probe must reject model invocations");
 const report={schemaVersion:1,candidate:expected,host:"@earendil-works/pi-coding-agent",version:metadata.version,
  platform:process.platform,mode:"tui",scenario:`public-asen-changes-resolve-${scenario}`,
  events,modelCalls:0,exitCode,signal,timedOut,sourceFileUnchanged:scenario==="cancel",
  logSha256:createHash("sha256").update(log).digest("hex"),result:"PASS"};
 writeFileSync(receiptPath,JSON.stringify(report,null,2)+"\n");
 console.log("T12_REAL_PI_TUI_DIALOG_PASS",JSON.stringify({platform:report.platform,events:report.events,sha:report.logSha256}));
}catch(error){
 console.error("T12_REAL_PI_TUI_DIALOG_FAIL",error);
 console.error("Observed phase",phase,"events",events,"stderr/tui-tail",log.slice(-3800));
 const failure={schemaVersion:1,candidate:expected,host:"@earendil-works/pi-coding-agent",version:metadata.version,
  platform:process.platform,mode:"tui",scenario:`public-asen-changes-resolve-${scenario}`,
  phase,events,exitCode,signal,timedOut,logSha256:createHash("sha256").update(log).digest("hex"),result:"FAIL"};
 writeFileSync(receiptPath,JSON.stringify(failure,null,2)+"\n");
 process.exitCode=1;
}finally{
 clearInterval(phaseMonitor);
 clearTimeout(hardWatchdog);
 if(child&&!exited)try{child.kill();}catch{/* Best-effort cleanup after a failed interactive run. */}
 try{rmSync(temporary,{recursive:true,force:true,maxRetries:8,retryDelay:100});}catch(error){console.error("T12 cleanup warning",String(error));process.exitCode=1;}
}
