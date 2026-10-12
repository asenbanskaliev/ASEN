import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {createPiVerifierEnvironment} from "./gsp06-pi-free-environment.mjs";

export function planPiSupportMatrix(){
 return ["linux","win32","darwin"].flatMap(platform=>["0.85.1","1.1.0"].flatMap(version=>
  ["tui","rpc","json","print"].map(mode=>({platform,version,mode,id:`${platform}-${version}-${mode}`}))));
}

export function validateCellObservation(cell,result){
 assert.equal(result.mode,cell.mode);
 assert.equal(typeof result.hasUI,"boolean");
 assert.ok(result.commands.includes("asen"),"primary command must be registered");
 assert.ok(result.tools.includes("asen_ask_choice"),"primary tool must be registered");
 assert.equal(result.modelCalls,0);
 assert.equal(result.exitCode,0);
 assert.equal(result.signal,null);
 assert.equal(result.timedOut,false,"forced shutdown is not natural exit");
}

async function runCell(cell,cli,packageRoot,root){
 const work=join(root,cell.id);mkdirSync(work);
 const observation=join(work,"observation.json"),probe=join(work,"probe.ts");
 const primary=join(packageRoot,"extensions","asen.ts");
 writeFileSync(probe,`import {writeFileSync} from 'node:fs';
 export default function(pi){
  let modelCalls=0;
  pi.on('before_agent_start',()=>{modelCalls++;throw Error('Matrix forbids model calls');});
  pi.on('session_start',(_event,ctx)=>{
   writeFileSync(${JSON.stringify(observation)},JSON.stringify({mode:ctx.mode,hasUI:ctx.hasUI,
    commands:pi.getCommands().filter(c=>c.source==='extension'&&c.sourceInfo.path===${JSON.stringify(primary)}).map(c=>c.name),
    tools:pi.getAllTools().filter(c=>c.sourceInfo.path===${JSON.stringify(primary)}).map(c=>c.name),modelCalls}));
   if(ctx.mode==='tui')setTimeout(()=>ctx.shutdown(),100);
  });
 }`);
 const args=[cli,"--no-extensions","--extension",primary,"--extension",probe,
  "--no-skills","--no-tools","--provider","openai","--model","gpt-4o"];
 if(cell.mode==="print")args.push("--print");
 else if(cell.mode!=="tui")args.push("--mode",cell.mode);
 const env={...createPiVerifierEnvironment(process.env),HOME:work,USERPROFILE:work,
  PI_CODING_AGENT_DIR:join(work,"agent"),ASEN_NO_SKILL_REGISTRY:"1",TERM:"xterm-256color"};
 let log="",timedOut=false,exitCode,signal=null;
 if(cell.mode==="tui"){
  const pty=await import("node-pty");
  const child=pty.spawn(process.execPath,args,{cwd:work,env,cols:100,rows:30,name:"xterm-256color"});
  await new Promise((done,reject)=>{
   const timer=setTimeout(()=>{timedOut=true;child.kill();},60_000);
   const finalTimer=setTimeout(()=>reject(Error("PTY cleanup unconfirmed")),65_000);
   child.onData(data=>{log=(log+data).slice(-1_000_000);});
   child.onExit(result=>{clearTimeout(timer);clearTimeout(finalTimer);exitCode=result.exitCode;signal=result.signal?String(result.signal):null;done();});
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
 const observed=JSON.parse(readFileSync(observation,"utf8"));
 assert.ok(!log.includes('"type":"agent_start"'),"host must not start an agent");
 return {...observed,exitCode,signal,timedOut,logSha256:createHash("sha256").update(log).digest("hex"),log};
}

export async function main({tarball=process.argv[2],output=process.argv[3],candidate=process.env.ASEN_EXPECTED_SHA}={}){
 assert.match(candidate??"",/^[a-f0-9]{40}$/);
 assert.equal(execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),candidate);
 assert.ok(tarball&&output,"Usage: pi-support-matrix.mjs <tarball> <output-directory>");
 const artifact=resolve(tarball),out=resolve(output);mkdirSync(out,{recursive:true});
 const baseline=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-sources-v1.json",import.meta.url),"utf8"));
 const root=mkdtempSync(join(tmpdir(),"asen-pi-matrix-"));
 const results=[];
 const npmCli=process.env.npm_execpath;
 assert.ok(npmCli,"Run through npm run verify:pi-matrix");
 try{
  for(const version of ["0.85.1","1.1.0"]){
   const host=join(root,version);mkdirSync(host);writeFileSync(join(host,"package.json"),'{"private":true}');
   execFileSync(process.execPath,[npmCli,"install","--no-audit","--no-fund","--package-lock=false",artifact,`@earendil-works/pi-coding-agent@${version}`],{cwd:host,stdio:"inherit",timeout:180_000});
   const peer=join(host,"node_modules","@earendil-works","pi-coding-agent");
   const metadata=JSON.parse(readFileSync(join(peer,"package.json"),"utf8"));assert.equal(metadata.version,version);
   const cli=join(peer,typeof metadata.bin==="string"?metadata.bin:metadata.bin.pi);
   for(const cell of planPiSupportMatrix().filter(c=>c.platform===process.platform&&c.version===version)){
    let record={...cell,candidate,sourceCommit:baseline.commit,result:"FAIL"};
    try{const observation=await runCell(cell,cli,join(host,"node_modules","asen"),root);
     writeFileSync(join(out,`${cell.id}.log`),observation.log);delete observation.log;
     record={...record,observation};validateCellObservation(cell,observation);record.result="PASS";
    }catch(error){record.error=String(error);}
    writeFileSync(join(out,`${cell.id}.json`),JSON.stringify(record,null,2)+"\n");results.push(record);
    console.log(`${cell.id}: ${record.result}`);
   }
  }
 }finally{rmSync(root,{recursive:true,force:true});}
 assert.equal(results.length,8);
 assert.ok(results.every(row=>row.result==="PASS"),"Some real-host cells failed; inspect receipts");
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await main();}catch(error){console.error(error);process.exitCode=1;}
}
