import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {existsSync,readFileSync,writeFileSync,mkdirSync,mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {createPiVerifierEnvironment} from "./gsp06-pi-free-environment.mjs";
import {prepareDarwinPtyHelper} from "./pi-matrix-pty-helper.mjs";
import {cleanupMatrixWorkspace} from "./pi-matrix-cleanup.mjs";

const piPackageName="@earendil-works/pi-coding-agent";
const piInstallTimeoutMs=600_000;
const packageMetadata=()=>JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));

function compareVersions(left,right){
 const a=left.split(".").map(Number),b=right.split(".").map(Number);
 for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]-b[i];
 return 0;
}

export function piVersionAnchors(metadata=packageMetadata()){
 const peerRange=metadata?.peerDependencies?.[piPackageName];
 const developmentRange=metadata?.devDependencies?.[piPackageName];
 const peerMatch=typeof peerRange==="string"&&/^>=(\d+\.\d+\.\d+)$/.exec(peerRange);
 const developmentMatch=typeof developmentRange==="string"&&/^\^(\d+\.\d+\.\d+)$/.exec(developmentRange);
 assert.ok(peerMatch,"Pi peer dependency must use an exact minimum without an upper bound");
 assert.ok(developmentMatch,"Pi development dependency must use a caret-pinned exact version");
 const minimum=peerMatch[1],development=developmentMatch[1];
 assert.ok(compareVersions(development,minimum)>=0,
  "Pi development version must be at or above the declared peer dependency floor");
 return [...new Set([minimum,development])];
}

export function planPiSupportMatrix(metadata){
 const versions=piVersionAnchors(metadata);
 return ["linux","win32","darwin"].flatMap(platform=>versions.flatMap(version=>
  ["tui","rpc","json","print"].map(mode=>({platform,version,mode,id:`${platform}-${version}-${mode}`}))));
}

export function validateCellObservation(cell,result){
 assert.equal(result.mode,cell.mode);
 assert.equal(typeof result.hasUI,"boolean");
 assert.ok(result.commands.includes("asen"),"primary command must be registered");
 assert.ok(result.tools.includes("asen_ask_choice"),"primary tool must be registered");
 assert.ok(result.tools.includes("ask_user_choice"),"canonical choice alias must be registered");
 assert.ok(result.tools.includes("ask_user_question"),"canonical question alias must be registered");
 assert.equal(result.modelCalls,0);
 assert.equal(result.shutdownObserved,true,"host must deliver session shutdown");
 assert.equal(result.exitCode,0);
 assert.equal(result.signal,null);
 assert.equal(result.timedOut,false,"forced shutdown is not natural exit");
 if(cell.mode==="tui")assert.equal(result.keyboardCommandObserved,true,"real Pi TUI must run the keyboard-submitted ASEN changes command");
}

async function runCell(cell,cli,packageRoot,root){
 const work=join(root,cell.id);mkdirSync(work);
 const observation=join(work,"observation.json"),probe=join(work,"probe.ts"),ready=join(work,"tui-ready"),ack=join(work,"tui-ack");
 const primary=join(packageRoot,"extensions","asen.ts");
 writeFileSync(probe,`import {writeFileSync,readFileSync} from 'node:fs';
 export default function(pi){
  let modelCalls=0;
  pi.on('before_agent_start',()=>{modelCalls++;throw Error('Matrix forbids model calls');});
  const observe=(ctx,shutdownObserved)=>{
   writeFileSync(${JSON.stringify(observation)},JSON.stringify({mode:ctx.mode,hasUI:ctx.hasUI,
    commands:pi.getCommands().filter(c=>c.source==='extension'&&c.sourceInfo.path===${JSON.stringify(primary)}).map(c=>c.name),
    tools:pi.getAllTools().filter(c=>c.sourceInfo.path===${JSON.stringify(primary)}).map(c=>c.name),modelCalls,shutdownObserved}));
  };
  pi.on('session_shutdown',(_event,ctx)=>observe(ctx,true));
  pi.on('session_start',(_event,ctx)=>{
   observe(ctx,false);
   if(ctx.mode==='tui'){
    writeFileSync(${JSON.stringify(ready)},"ready");
    const pulse=setInterval(()=>{
     try{if(readFileSync(${JSON.stringify(ack)},"utf8")==="ack"){clearInterval(pulse);clearTimeout(safety);ctx.shutdown();}}catch{}
    },80);
    const safety=setTimeout(()=>{clearInterval(pulse);ctx.shutdown();},15000);
   }
  });
 }`);
 const args=[cli,"--no-extensions","--extension",primary,"--extension",probe,
  "--no-skills","--no-builtin-tools","--provider","openai","--model","gpt-4o"];
 if(cell.mode==="print")args.push("--print");
 else if(cell.mode!=="tui")args.push("--mode",cell.mode);
 const env={...createPiVerifierEnvironment(process.env),HOME:work,USERPROFILE:work,
  PI_CODING_AGENT_DIR:join(work,"agent"),ASEN_NO_SKILL_REGISTRY:"1",TERM:"xterm-256color"};
 let log="",timedOut=false,exitCode,signal=null,keyboardAcknowledged=false;
 if(cell.mode==="tui"){
  prepareDarwinPtyHelper();
  const pty=await import("node-pty");
  const child=pty.spawn(process.execPath,args,{cwd:work,env,cols:100,rows:30,name:"xterm-256color"});
  await new Promise((done,reject)=>{
   const timer=setTimeout(()=>{timedOut=true;child.kill();},60_000);
   const finalTimer=setTimeout(()=>reject(Error("PTY cleanup unconfirmed")),65_000);
   let sent=false;
   const sendKeyboard=setInterval(()=>{
    if(!sent&&existsSync(ready)){
     sent=true;
     setTimeout(()=>{try{child.write("/asen-changes\\r");}catch{/* Natural-exit and keyboard admission still fail. */}},1000);
    }
   },100);
   child.onData(data=>{
    log=(log+data).slice(-1_000_000);
    if(!keyboardAcknowledged&&log.includes("Current Git state")&&log.includes("Session-attributed changes:")){
     keyboardAcknowledged=true;writeFileSync(ack,"ack");
    }
   });
   child.onExit(result=>{clearTimeout(timer);clearTimeout(finalTimer);clearInterval(sendKeyboard);exitCode=result.exitCode;signal=result.signal?String(result.signal):null;done();});
  });
 }else{
  const child=spawn(process.execPath,args,{cwd:work,env,stdio:["pipe","pipe","pipe"]});
  await new Promise((done,reject)=>{
   const timer=setTimeout(()=>{timedOut=true;child.kill();},60_000);
   const finalTimer=setTimeout(()=>{child.kill("SIGKILL");reject(Error("Process cleanup unconfirmed"));},65_000);
   child.stdout.on("data",data=>{log=(log+data).slice(-1_000_000);});
   child.stderr.on("data",data=>{log=(log+data).slice(-1_000_000);});
   child.on("error",error=>{clearTimeout(timer);clearTimeout(finalTimer);reject(error);});
   child.on("close",(code,stop)=>{clearTimeout(timer);clearTimeout(finalTimer);exitCode=code;signal=stop;done();});
   child.stdin.end(cell.mode==="rpc"?JSON.stringify({type:"get_state",id:"matrix-state"})+"\n":"");
  });
 }
 let observed;
 try{observed=JSON.parse(readFileSync(observation,"utf8"));}
 catch{observed={mode:null,hasUI:null,commands:[],tools:[],modelCalls:null};}
 assert.ok(!log.includes('"type":"agent_start"'),"host must not start an agent");
 return {...observed,...(cell.mode==="tui"?{keyboardCommandObserved:keyboardAcknowledged}:{}),exitCode,signal,timedOut,logSha256:createHash("sha256").update(log).digest("hex"),log};
}

export async function main({tarball=process.argv[2],output=process.argv[3],candidate=process.env.ASEN_EXPECTED_SHA}={}){
 assert.match(candidate??"",/^[a-f0-9]{40}$/);
 assert.equal(execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),candidate);
 execFileSync("git",["diff","--exit-code","HEAD"],{stdio:"pipe"});
 assert.ok(tarball&&output,"Usage: pi-support-matrix.mjs <tarball> <output-directory>");
 const artifact=resolve(tarball),out=resolve(output);mkdirSync(out,{recursive:true});
 const artifactSha256=createHash("sha256").update(readFileSync(artifact)).digest("hex");
 const baseline=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-sources-v1.json",import.meta.url),"utf8"));
 const root=mkdtempSync(join(tmpdir(),"asen-pi-matrix-"));
 const results=[];
 const versions=piVersionAnchors();
 const npmCli=process.env.npm_execpath;
 assert.ok(npmCli,"Run through npm run verify:pi-matrix");
 try{
  const packed=JSON.parse(execFileSync(process.execPath,[npmCli,"pack","--json","--pack-destination",root],{encoding:"utf8",timeout:90_000}));
  const expected=createHash("sha256").update(readFileSync(join(root,packed[0].filename))).digest("hex");
  assert.equal(artifactSha256,expected,"Tarball must match the clean exact candidate checkout");
  for(const version of versions){
   const host=join(root,version);mkdirSync(host);writeFileSync(join(host,"package.json"),'{"private":true}');
   execFileSync(process.execPath,[npmCli,"install","--no-audit","--no-fund","--package-lock=false",artifact,`@earendil-works/pi-coding-agent@${version}`],{cwd:host,stdio:"inherit",timeout:piInstallTimeoutMs});
   const peer=join(host,"node_modules","@earendil-works","pi-coding-agent");
   const metadata=JSON.parse(readFileSync(join(peer,"package.json"),"utf8"));assert.equal(metadata.version,version);
   const cli=join(peer,typeof metadata.bin==="string"?metadata.bin:metadata.bin.pi);
   for(const cell of planPiSupportMatrix().filter(c=>c.platform===process.platform&&c.version===version)){
    let record={...cell,candidate,sourceCommit:baseline.commit,artifactSha256,result:"FAIL"};
    try{const observation=await runCell(cell,cli,join(host,"node_modules","asen"),root);
     writeFileSync(join(out,`${cell.id}.log`),observation.log);delete observation.log;
     record={...record,observation};validateCellObservation(cell,observation);record.result="PASS";
    }catch(error){record.error=String(error);}
    writeFileSync(join(out,`${cell.id}.json`),JSON.stringify(record,null,2)+"\n");results.push(record);
    console.log(`${cell.id}: ${record.result}`);
   }
  }
 }finally{
  console.log("MATRIX_CLEANUP_STARTED");cleanupMatrixWorkspace(root);console.log("MATRIX_CLEANUP_COMPLETED");
 }
 assert.equal(results.length,versions.length*4);
 assert.ok(results.every(row=>row.result==="PASS"),"Some real-host cells failed; inspect receipts");
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let exitCode=0;
 try{await main();console.log("MATRIX_CONTROLLER_COMPLETED");}catch(error){console.error(error);exitCode=1;}
 await Promise.all([process.stdout,process.stderr].map(stream=>new Promise(resolve=>stream.write("",resolve))));
 // This is the verifier controller. Each real Pi child must already have passed natural-exit admission.
 process.exit(exitCode);
}
