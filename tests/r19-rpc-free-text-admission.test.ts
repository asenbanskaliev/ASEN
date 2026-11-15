import test from "node:test";
import assert from "node:assert/strict";
import {spawn,type ChildProcessWithoutNullStreams} from "node:child_process";
import {mkdir,mkdtemp,readFile,rm,stat,writeFile} from "node:fs/promises";
import {basename,dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createPiVerifierEnvironment} from "../scripts/gsp06-pi-free-environment.mjs";

const PACKAGE_NAME="@earendil-works/pi-coding-agent";
const EXPECTED_VERSION="1.2.0";
const OUTPUT_LIMIT=100*1024;
const WHOLE_WATCHDOG_MS=20_000;
const SHUTDOWN_MS=5_000;
const FORBIDDEN_EVENT_TYPES=new Set(["agent_start","message_start","tool_execution_start"]);
const PROBE_NAME="r19-rpc-free-text-admission-probe";

type Exit={code:number|null;signal:NodeJS.Signals|null};
type RpcRow={type?:string;id?:unknown;command?:string;success?:boolean;data?:unknown;method?:string;title?:string;placeholder?:string;prefill?:string;message?:string;notifyType?:string;[key:string]:unknown};

function projectRoot(){
 const testDirectory=dirname(fileURLToPath(import.meta.url));
 return basename(dirname(testDirectory))==="shell-rea-verification"
  ? resolve(testDirectory,"../../..")
  : resolve(testDirectory,"..");
}

function waitForClose(child:ChildProcessWithoutNullStreams){
 return new Promise<Exit>((resolveClose,rejectClose)=>{
  child.once("error",rejectClose);
  child.once("close",(code,signal)=>resolveClose({code,signal}));
 });
}

async function boundedClose(closed:Promise<Exit>,message:string){
 let timer:NodeJS.Timeout|undefined;
 try{return await Promise.race([closed,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),SHUTDOWN_MS);})]);}
 finally{if(timer)clearTimeout(timer);}
}

async function forceOwnedChildClosed(child:ChildProcessWithoutNullStreams,closed:Promise<Exit>){
 if(child.exitCode===null&&child.signalCode===null)child.kill("SIGKILL");
 return boundedClose(closed,"owned Pi RPC process cleanup was not confirmed");
}

test("pinned public RPC correlates free-text input and editor cancellation without model activity",{timeout:30_000},async()=>{
 const repo=projectRoot(),scratch=join(repo,".cache","r19-rpc-admission");
 await mkdir(scratch,{recursive:true});
 const fixture=await mkdtemp(join(scratch,"fixture-"));
 assert.equal(dirname(fixture),scratch);
 assert.match(basename(fixture),/^fixture-/u);

 let child:ChildProcessWithoutNullStreams|undefined,closed:Promise<Exit>|undefined;
 let primaryFailure:unknown;
 try{
  const home=join(fixture,"home"),temp=join(fixture,"temp"),agent=join(fixture,"agent");
  await Promise.all([
   mkdir(join(home,".config"),{recursive:true}),
   mkdir(join(home,".cache"),{recursive:true}),
   mkdir(join(home,".local","share"),{recursive:true}),
   mkdir(temp,{recursive:true}),
   mkdir(agent,{recursive:true}),
  ]);
  const extension=join(fixture,"r19-rpc-probe.ts");
  await writeFile(extension,`export default function(pi){
pi.registerCommand(${JSON.stringify(PROBE_NAME)},{description:"Bounded public RPC free-text admission probe",handler:async(_args,ctx)=>{
 const inputValue=await ctx.ui.input("R19 informational input","bounded text",{timeout:5000});
 const editorValue=await ctx.ui.editor("R19 informational cancel","prefill");
 ctx.ui.notify("R19_RPC_RESULT:"+JSON.stringify({inputValue,editorCancelled:editorValue===undefined}),"info");
}});
}\n`);

  const main=fileURLToPath(import.meta.resolve(PACKAGE_NAME));
  const packageRoot=resolve(dirname(main),"..");
  const metadata=JSON.parse(await readFile(join(packageRoot,"package.json"),"utf8")) as {name?:string;version?:string};
  assert.equal(metadata.name,PACKAGE_NAME);
  assert.equal(metadata.version,EXPECTED_VERSION,"the resolved installed SDK must match the tracked pin exactly");
  const cli=join(dirname(main),"bundle","cli.js");
  await stat(cli);

  const environment=createPiVerifierEnvironment({
   ...process.env,
   HOME:home,
   USERPROFILE:home,
   TMPDIR:temp,
   TMP:temp,
   TEMP:temp,
   PI_CODING_AGENT_DIR:agent,
  });
  const credentialNames=["OPENROUTER_API_KEY","LLM7_API_KEY","GROQ_API_KEY","NVIDIA_API_KEY","GITHUB_TOKEN"];
  assert.deepEqual(credentialNames.filter(name=>environment[name]!==undefined),[],"the verifier environment must have an empty credential allowlist");

  child=spawn(process.execPath,[cli,"--mode","rpc","--no-session","--no-extensions","--extension",extension,"--no-skills","--no-tools"],{
   cwd:fixture,env:environment,stdio:["pipe","pipe","pipe"],windowsHide:true,
  });
  closed=waitForClose(child);
  child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");

  let stdoutBuffer="",stderr="",totalOutput=0,inputId="",editorId="";
  let commandsAccepted=false,promptHandled=false,noticeResult:{inputValue:unknown;editorCancelled:unknown}|undefined;
  const observations:Array<Record<string,unknown>>=[];
  const eventCounts={agent_start:0,message_start:0,tool_execution_start:0,providerLike:0};
  const resultPromise=new Promise<{inputValue:unknown;editorCancelled:unknown}>((resolveResult,rejectResult)=>{
   let settled=false;
   const finish=(error?:unknown)=>{
    if(settled)return;
    if(!error&&(!promptHandled||noticeResult===undefined))return;
    settled=true;clearTimeout(watchdog);
    if(error)rejectResult(error);else resolveResult(noticeResult!);
   };
   const watchdog=setTimeout(()=>finish(new Error("Pi RPC witness exceeded its 20 second internal watchdog")),WHOLE_WATCHDOG_MS);
   child!.once("error",finish);
   child!.once("close",(code,signal)=>{
    if(!settled)finish(new Error(`Pi RPC host closed before its result (code=${code}, signal=${signal}): ${stderr.slice(-1000)}`));
   });
   child!.stderr.on("data",chunk=>{
    const text=String(chunk);totalOutput+=Buffer.byteLength(text);stderr=(stderr+text).slice(-4000);
    if(totalOutput>OUTPUT_LIMIT)finish(new Error("Pi RPC witness exceeded the 100 KiB output bound"));
   });
   child!.stdout.on("data",chunk=>{
    const text=String(chunk);totalOutput+=Buffer.byteLength(text);stdoutBuffer+=text;
    if(totalOutput>OUTPUT_LIMIT){finish(new Error("Pi RPC witness exceeded the 100 KiB output bound"));return;}
    for(let newline=stdoutBuffer.indexOf("\n");newline>=0;newline=stdoutBuffer.indexOf("\n")){
     const line=stdoutBuffer.slice(0,newline).trim();stdoutBuffer=stdoutBuffer.slice(newline+1);
     if(!line)continue;
     try{
      const row=JSON.parse(line) as RpcRow,type=String(row.type);
      if(FORBIDDEN_EVENT_TYPES.has(type))eventCounts[type as keyof typeof eventCounts]++;
      if(type.toLowerCase().includes("provider"))eventCounts.providerLike++;
      assert.equal(FORBIDDEN_EVENT_TYPES.has(type),false,`unexpected model/tool event: ${type}`);
      assert.equal(type.toLowerCase().includes("provider"),false,`unexpected provider event: ${type}`);
      if(row.type==="response"&&row.id==="commands"){
       assert.equal(commandsAccepted,false,"command inventory must be accepted exactly once");
       assert.equal(row.success,true,"get_commands must succeed before invoking the probe");
       assert.equal(row.command,"get_commands");
       const commands=(row.data as {commands?:Array<{name?:unknown;source?:unknown}>}|undefined)?.commands;
       assert.ok(Array.isArray(commands),"get_commands must return a command inventory");
       const matches=commands.filter(command=>command.name===PROBE_NAME);
       assert.equal(matches.length,1,"the owned probe command must be registered exactly once");
       assert.equal(matches[0]?.source,"extension","the probe must be owned by the explicit extension");
       commandsAccepted=true;
       observations.push({type:row.type,id:row.id,command:row.command,success:row.success,probeName:PROBE_NAME,probeSource:matches[0]?.source});
       child!.stdin.write(JSON.stringify({id:"probe",type:"prompt",message:`/${PROBE_NAME}`})+"\n");
       continue;
      }
      if(row.type==="response"&&row.id==="probe"){
       assert.equal(commandsAccepted,true,"probe response cannot precede command admission");
       assert.equal(row.command,"prompt");
       assert.equal(row.success,true,"known extension command prompt must succeed");
       const disposition=(row.data as {disposition?:unknown}|undefined)?.disposition;
       assert.equal(disposition,"handled","prompt must be handled by the known extension command without model fallback");
       promptHandled=true;
       observations.push({type:row.type,id:row.id,command:row.command,success:row.success,disposition});
       finish();continue;
      }
      if(row.type!=="extension_ui_request")continue;
      if(row.method==="input"){
       assert.equal(commandsAccepted,true,"input must follow admitted command invocation");
       assert.equal(inputId,"","input must be requested exactly once");
       assert.equal(row.title,"R19 informational input");assert.equal(row.placeholder,"bounded text");
       assert.equal(typeof row.id,"string");assert.notEqual(row.id,"");inputId=row.id as string;
       observations.push({type:row.type,method:row.method,id:inputId,title:row.title,placeholder:row.placeholder});
       child!.stdin.write(JSON.stringify({type:"extension_ui_response",id:`forged-${inputId}`,value:"FORGED_REPLY"})+"\n");
       child!.stdin.write(JSON.stringify({type:"extension_ui_response",id:inputId,value:"PARENT_EXACT_TEXT"})+"\n");
      }else if(row.method==="editor"){
       assert.notEqual(inputId,"","editor must follow the correlated input response");
       assert.equal(editorId,"","editor must be requested exactly once");
       assert.equal(row.title,"R19 informational cancel");assert.equal(row.prefill,"prefill");
       assert.equal(typeof row.id,"string");assert.notEqual(row.id,inputId);editorId=row.id as string;
       observations.push({type:row.type,method:row.method,id:editorId,title:row.title,prefill:row.prefill});
       child!.stdin.write(JSON.stringify({type:"extension_ui_response",id:editorId,cancelled:true})+"\n");
      }else if(row.method==="notify"&&typeof row.message==="string"&&row.message.startsWith("R19_RPC_RESULT:")){
       assert.notEqual(inputId,"");assert.notEqual(editorId,"");assert.equal(row.notifyType,"info");
       noticeResult=JSON.parse(row.message.slice("R19_RPC_RESULT:".length)) as {inputValue:unknown;editorCancelled:unknown};
       observations.push({type:row.type,method:row.method,id:row.id,message:row.message,notifyType:row.notifyType});
       finish();
      }
     }catch(error){finish(error);return;}
    }
   });
  });
  child.stdin.write(JSON.stringify({id:"commands",type:"get_commands"})+"\n");
  const result=await resultPromise;

  assert.deepEqual(result,{inputValue:"PARENT_EXACT_TEXT",editorCancelled:true},"a wrong-ID reply must not satisfy the pending input request");
  assert.equal(promptHandled,true);assert.equal(commandsAccepted,true);
  assert.deepEqual(eventCounts,{agent_start:0,message_start:0,tool_execution_start:0,providerLike:0});
  assert.equal(observations.length,5);
  child.stdin.end();
  const exit=await boundedClose(closed,"Pi RPC host did not exit within the 5 second shutdown bound");
  assert.deepEqual(exit,{code:0,signal:null},stderr);
  console.log("R19_RPC_OBSERVATIONS:"+JSON.stringify({packageVersion:metadata.version,events:observations,result,eventCounts,exit}));
 }catch(error){primaryFailure=error;throw error;}
 finally{
  let cleanupFailure:unknown;
  try{if(child&&closed)await forceOwnedChildClosed(child,closed);}catch(error){cleanupFailure=error;}
  try{await rm(fixture,{recursive:true,force:true});await assert.rejects(stat(fixture),{code:"ENOENT"});}catch(error){cleanupFailure??=error;}
  if(cleanupFailure&&!primaryFailure)throw cleanupFailure;
 }
});
