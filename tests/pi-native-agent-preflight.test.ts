/**
 * Provider-free real Pi native child smoke. Diagnoses Windows native startup
 * without replaying agents, sending prompts or contacting models.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,copyFileSync,mkdirSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {authorityAssets} from "../src/agents/pi-authority-assets.js";

const repo=resolve(".");
const main=fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
const binary=join(dirname(main),"bundle","cli.js");

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
 const args=[binary,"--mode","rpc","--no-session","--no-extensions"];
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
  HOME:home,PI_CODING_AGENT_DIR:home,PI_OFFLINE:"1",PI_TELEMETRY:"0"};
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
 if(extensionPath)assert.equal(policies[0]?.sourceInfo?.path,extensionPath);
}

test("native Pi RPC bare startup works without model, session or provider",t=>probe(t,"bare"));
test("native Pi RPC loads staged ASEN authority without invoking a model",t=>probe(t,"authority"));
