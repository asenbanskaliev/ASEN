/**
 * Provider-free real Pi native child smoke. Diagnoses Windows native startup
 * without replaying agents, sending prompts or contacting models.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {mkdtempSync,copyFileSync,mkdirSync,rmSync,writeFileSync,existsSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,resolve} from "node:path";
import {authorityAssets} from "../src/agents/pi-authority-assets.js";

const repo=resolve(".");
// Exercise the *exact* executable selected by extensions/asen.ts for
// child agents, not the alternative Pi bundle used by unrelated smoke tests.
const binary=join(repo,"node_modules","@earendil-works","pi-coding-agent","dist","cli.js");


function sanitizedFailure(result:ReturnType<typeof spawnSync>){
 const code=typeof result.status==="number"?result.status:null;
 const hex=code!==null&&code>=0?"0x"+(code>>>0).toString(16).toUpperCase().padStart(8,"0"):"none";
 return JSON.stringify({
  phase:"pi-native-rpc-preflight",code,windowsStatus:hex,
  signal:result.signal??null,stderrPresent:!!result.stderr,
  stdoutPresent:!!result.stdout,spawnErrorCode:(result.error as NodeJS.ErrnoException|undefined)?.code??null
 });
}

function probe(t:import("node:test").TestContext,mode:"bare"|"authority"){
 const home=mkdtempSync(join(tmpdir(),"asen-native-pi-preflight-"));
 t.after(()=>rmSync(home,{recursive:true,force:true}));
 mkdirSync(join(home,"extensions"),{recursive:true});
 writeFileSync(join(home,"package.json"),JSON.stringify({type:"module"}));
 assert.equal(existsSync(binary),true,"The actual bundled ASEN child CLI must exist");
 const args=[binary,"--mode","rpc","--no-extensions"];
 let extensionPath:string|undefined;
 if(mode==="authority"){
  extensionPath=join(home,"extensions","authority.ts");
  copyFileSync(join(repo,"extensions","authority.ts"),extensionPath);
  for(const asset of authorityAssets){
   const destination=join(home,asset.target);
   mkdirSync(dirname(destination),{recursive:true});
   copyFileSync(join(repo,asset.source),destination);
  }
  args.push("--extension",extensionPath);
 }
 args.push("--no-skills","--tools","read");
 const env:NodeJS.ProcessEnv={...process.env,
  HOME:home,PI_CODING_AGENT_DIR:home,PI_OFFLINE:"1",PI_TELEMETRY:"0",
  ...(mode==="authority"?{ASEN_PI_AUTHORITY:JSON.stringify({
   repository:repo,role:"explorer",writeSurfaces:[],agentId:"preflight-agent",
   sessionId:"preflight-session"})}:{})};
 for(const key of Object.keys(env)){
  if(/(?:API_KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL)/iu.test(key)||key.startsWith("GIT_"))
   delete env[key];
 }
 const result=spawnSync(process.execPath,args,{
  cwd:repo,env,encoding:"utf8",maxBuffer:256*1024,timeout:20_000,
  input:JSON.stringify({id:"asen-native-no-model",type:"get_commands"})+"\n",
  windowsHide:true
 });
 assert.equal(result.error,undefined,sanitizedFailure(result));
 assert.equal(result.status,0,sanitizedFailure(result));
 let lines:unknown[];
 try{lines=String(result.stdout).trim().split(/\r?\n/u).filter(Boolean).map(line=>JSON.parse(line));}
 catch{assert.fail("Pi RPC response not valid JSONL: "+sanitizedFailure(result));}
 const responses=lines!.filter((event):event is {type:string;id:string;success:boolean;data?:{commands?:Array<{name:string;source:string;sourceInfo?:{path:string}}>}}=>
  !!event&&typeof event==="object"&&"type" in event&&event.type==="response"&&"id" in event&&event.id==="asen-native-no-model");
 assert.equal(responses.length,1,"Pi RPC must respond exactly once: "+sanitizedFailure(result));
 const response=responses[0];
 assert.equal(response?.success,true,"Pi RPC get_commands failed: "+sanitizedFailure(result));
 const policies=response?.data?.commands?.filter(x=>x.name==="asen-authority-status"&&x.source==="extension")??[];
 assert.equal(policies.length,mode==="authority"?1:0,"unexpected ASEN authority registration: "+sanitizedFailure(result));
 if(extensionPath){
  const reportedPath=policies[0]?.sourceInfo?.path;
  assert.equal(typeof reportedPath,"string","Authority command must report its source path");
  assert.equal(realpathSync(reportedPath!),realpathSync(extensionPath));
 }
}

test("native Pi RPC bare startup works without model, session or provider",t=>probe(t,"bare"));
test("native Pi RPC loads staged ASEN authority without invoking a model",t=>probe(t,"authority"));


test("two real native Pi RPC children preflight concurrently with one isolated shared home", {timeout:45_000},async t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-native-concurrent-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const configHome=join(root,"pi-agent-config");
 mkdirSync(configHome,{recursive:true});
 const issued=(index:number)=>{
  const policyRoot=join(root,"authority-"+index);
  mkdirSync(join(policyRoot,"extensions"),{recursive:true});
  writeFileSync(join(policyRoot,"package.json"),JSON.stringify({type:"module"}));
  const extension=join(policyRoot,"extensions","authority.ts");
  copyFileSync(join(repo,"extensions","authority.ts"),extension);
  for(const asset of authorityAssets){
   const target=join(policyRoot,asset.target);
   mkdirSync(dirname(target),{recursive:true});
   copyFileSync(join(repo,asset.source),target);
  }
  return extension;
 };
 const run=(index:number):Promise<void>=>new Promise((resolveRun,rejectRun)=>{
  const extension=issued(index);
  const env:NodeJS.ProcessEnv={...process.env,PI_CODING_AGENT_DIR:configHome,
   HOME:configHome,PI_OFFLINE:"1",PI_TELEMETRY:"0",
   ASEN_PI_AUTHORITY:JSON.stringify({repository:repo,role:"explorer",writeSurfaces:[],
    agentId:"parallel-preflight-"+index,sessionId:"shared-session"})};
  for(const key of Object.keys(env))
   if(/(?:API_KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL)/iu.test(key)||key.startsWith("GIT_"))
    delete env[key];
  const child=spawn(process.execPath,[binary,"--mode","rpc","--no-extensions",
   "--extension",extension,"--no-skills","--tools","read"],{
    cwd:repo,env,stdio:["pipe","pipe","pipe"],windowsHide:true
   });
  let output="",hadStderr=false,limitExceeded=false;
  child.stdout.setEncoding("utf8").on("data",chunk=>{
   output+=String(chunk);
   if(output.length>262_144){limitExceeded=true;child.kill();}
  });
  child.stderr.on("data",()=>{hadStderr=true;});
  const timer=setTimeout(()=>{child.kill();rejectRun(new Error("Native Pi concurrency preflight timed out (index "+index+")"));},20_000);
  child.once("error",error=>{clearTimeout(timer);rejectRun(new Error("Native Pi spawn failed (index "+index+"; code "+
   ((error as NodeJS.ErrnoException).code??"unknown")+")"));});
  child.once("close",(code,signal)=>{
   clearTimeout(timer);
   if(limitExceeded)return rejectRun(new Error("Native Pi RPC stream exceeded bounded preflight output"));
   if(code!==0)return rejectRun(new Error("Native Pi child failed (index "+index+"; code "+code+
    "; ntstatus "+(code===null?"none":"0x"+(code>>>0).toString(16).toUpperCase())+
    "; signal "+(signal??"none")+"; stderrPresent "+hadStderr+")"));
   let commands:Array<{name:string;source:string;sourceInfo?:{path:string}}>=[];
   try{
    for(const line of output.trim().split(/\r?\n/u).filter(Boolean)){
     const record=JSON.parse(line);
     if(record.type==="response"&&record.id==="parallel-"+index&&record.success===true&&
       record.command==="get_commands")commands=record.data?.commands??[];
    }
   }catch{return rejectRun(new Error("Native Pi returned malformed bounded RPC output (index "+index+")"));}
   const registered=commands.filter(x=>x.name==="asen-authority-status"&&x.source==="extension");
   if(registered.length!==1||!registered[0]?.sourceInfo?.path||
       realpathSync(registered[0].sourceInfo.path)!==realpathSync(extension))
    return rejectRun(new Error("Native Pi authority was not registered exactly once (index "+index+")"));
   resolveRun();
  });
  child.stdin.end(JSON.stringify({id:"parallel-"+index,type:"get_commands"})+"\n");
 });
 await Promise.all([run(1),run(2)]);
});
