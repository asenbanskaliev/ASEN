import {spawn} from "node:child_process";
import {existsSync,readFileSync,writeFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const scenario=process.argv[2];
if(scenario!=="cancel"&&scenario!=="apply")throw Error("T12 supervisor requires cancel or apply");
const expected=process.env.ASEN_EXPECTED_SHA;
if(!/^[0-9a-f]{40}$/u.test(expected??""))throw Error("Exact candidate SHA required");
const phaseFile=join(root,"t12-debug-phase-"+scenario+".json");
const resultFile=join(root,"t12-real-pi-tui-"+scenario+".json");
const script=join(root,"scripts","t12-real-pi-dialog-smoke.mjs");
const child=spawn(process.execPath,[script],{
 cwd:root,env:{...process.env,ASEN_T12_DIALOG_SCENARIO:scenario},
 windowsHide:true,stdio:["ignore","pipe","pipe"],shell:false,
});
let timeout=false,tail="",settled=false;
const capture=(stream,output)=>{
 stream.on("data",chunk=>{
  const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
  tail=(tail+bytes.toString("utf8")).slice(-5000);
  output.write(bytes);
 });
};
capture(child.stdout,process.stdout);
capture(child.stderr,process.stderr);
function stopChild(){
 if(process.platform==="win32"&&Number.isSafeInteger(child.pid)&&child.pid>0){
  const killer=spawn("taskkill",["/PID",String(child.pid),"/T","/F"],{windowsHide:true,stdio:"ignore",shell:false});
  killer.on("error",()=>{try{child.kill("SIGKILL");}catch{}});
  const fallback=setTimeout(()=>{try{child.kill("SIGKILL");}catch{}},4000);
  fallback.unref();
 }else try{child.kill("SIGKILL");}catch{}
}
const outcome=await new Promise(resolve=>{
 const watchdog=setTimeout(()=>{timeout=true;stopChild();},90_000);
 const final=setTimeout(()=>{timeout=true;stopChild();resolve({code:null,signal:"cleanup-timeout"});},104_000);
 const finish=(value)=>{if(settled)return;settled=true;clearTimeout(watchdog);clearTimeout(final);resolve(value);};
 child.once("close",(code,signal)=>finish({code,signal}));
 child.once("error",error=>finish({code:null,signal:"spawn-error",message:error.message}));
});
if(!timeout&&outcome.code===0){
 if(!existsSync(resultFile))throw Error("Pi TUI child exited successfully but produced no exact-candidate receipt");
 const evidence=JSON.parse(readFileSync(resultFile,"utf8"));
 if(evidence.result!=="PASS"||evidence.candidate!==expected||evidence.scenario!=="public-asen-changes-resolve-"+scenario)
  throw Error("Pi TUI child receipt is invalid or belongs to another scenario");
 process.stdout.write("T12_SUPERVISOR_PASS "+JSON.stringify({scenario,platform:process.platform})+"\n");
}else{
 let lastPhase={phase:"unobserved"};
 try{lastPhase=JSON.parse(readFileSync(phaseFile,"utf8"));}catch{}
 const failure={schemaVersion:1,candidate:expected,scenario:"public-asen-changes-resolve-"+scenario,
  platform:process.platform,result:"FAIL",timeout,childExit:outcome,observedPhase:lastPhase};
 writeFileSync(resultFile,JSON.stringify(failure,null,2)+"\n");
 process.stderr.write("T12_SUPERVISOR_FAIL "+JSON.stringify(failure)+"\n");
 process.stderr.write("T12_SUPERVISOR_TAIL "+tail.slice(-1700)+"\n");
 process.exitCode=1;
}
