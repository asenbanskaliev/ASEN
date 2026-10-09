import test from "node:test";
import assert from "node:assert/strict";
import {AsyncLocalStorage} from "node:async_hooks";
import fsPromises,{mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {syncBuiltinESMExports} from "node:module";
import {tmpdir} from "node:os";
import path from "node:path";
import {captureHistory,exportHistory,searchHistory,trimHistory,redactHistoryText} from "../src/runtime/history.js";
import {runHistoryCommand,recordHistoryInput} from "../src/runtime/history-command.js";
import {readHistoryStore} from "../src/runtime/history-store.js";
import {emptyUsage,incrementUsage,maySendTelemetry,telemetryPreview} from "../src/runtime/usage.js";
import {incrementUsageFile,parseUsageFile,readUsageFile,updateUsageFile} from "../src/runtime/usage-store.js";
import {runUsageCommand} from "../src/runtime/usage-command.js";

type OpenCall=(...args:Parameters<typeof fsPromises.open>)=>ReturnType<typeof fsPromises.open>;
type LstatCall=(...args:Parameters<typeof fsPromises.lstat>)=>ReturnType<typeof fsPromises.lstat>;

function createUsageLockOpenObserver(originalOpen:OpenCall,originalLstat:LstatCall,ownedLockPath:string,emit:(line:string)=>void){
 const calls=new AsyncLocalStorage<{wxAttempts:number;sameCallPriorEEXIST:boolean;wxSucceeded:boolean}>();
 const codeOf=(error:unknown)=>typeof error==="object"&&error!==null&&"code" in error&&typeof error.code==="string"?error.code:"UNKNOWN";
 const open=(...args:Parameters<typeof originalOpen>)=>{
  const call=calls.getStore();if(!call||args[0]!==ownedLockPath||args[1]!=="wx")return originalOpen(...args);call.wxAttempts++;
  return originalOpen(...args).then((handle:Awaited<ReturnType<typeof originalOpen>>)=>{call.wxSucceeded=true;return handle;},async(error:unknown)=>{
   const errorCode=codeOf(error);if(errorCode==="EEXIST"){call.sameCallPriorEEXIST=true;throw error;}if(errorCode!=="EPERM"&&errorCode!=="EACCES")throw error;
   let metadata:{present:true;isFile:boolean;isSymlink:boolean}|{present:false;errorCode:string};
   try{const snapshot=await originalLstat(ownedLockPath);metadata={present:true,isFile:snapshot.isFile(),isSymlink:snapshot.isSymbolicLink()};}catch(metadataError){metadata={present:false,errorCode:codeOf(metadataError)};}
   const line=JSON.stringify({node:process.versions.node,libuv:process.versions.uv,platform:process.platform,errorCode,wxAttempts:call.wxAttempts,sameCallPriorEEXIST:call.sameCallPriorEEXIST,wxSucceeded:call.wxSucceeded,metadata});try{emit(line);}catch(diagnosticError){void diagnosticError;}throw error;
  });
 };
 return {open,run:<T>(operation:()=>Promise<T>)=>calls.run({wxAttempts:0,sameCallPriorEEXIST:false,wxSucceeded:false},operation)};
}

function permissionError(code:"EEXIST"|"EPERM"|"ENOENT"){return Object.assign(new Error(code),{code});}

test("usage lock observer preserves initial permission failure and records absent metadata",async()=>{
 const ownedLockPath="SENSITIVE_ROOT/token-value/usage.json.lock",original=permissionError("EPERM"),missing=permissionError("ENOENT"),lines:string[]=[];
 const observer=createUsageLockOpenObserver(async()=>{throw original;},async()=>{throw missing;},ownedLockPath,line=>lines.push(line));
 await assert.rejects(()=>observer.run(()=>observer.open(ownedLockPath,"wx")),(error:unknown)=>error===original);
 assert.equal(lines.length,1);assert.ok(lines[0]!.length<512);assert.doesNotMatch(lines[0]!,/SENSITIVE_ROOT|token-value/);
 const diagnostic=JSON.parse(lines[0]!);assert.equal(diagnostic.errorCode,"EPERM");assert.equal(diagnostic.wxAttempts,1);assert.equal(diagnostic.sameCallPriorEEXIST,false);assert.equal(diagnostic.wxSucceeded,false);assert.deepEqual(diagnostic.metadata,{present:false,errorCode:"ENOENT"});
});

test("usage lock observer records same-call contention and stays silent after success",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-usage-observer-")),ownedLockPath=path.join(directory,"usage.json.lock"),original=permissionError("EPERM"),exists=permissionError("EEXIST"),lines:string[]=[];await writeFile(ownedLockPath,"");
 let attempts=0;const attemptedOpen:OpenCall=async()=>{throw attempts++===0?exists:original;};const observer=createUsageLockOpenObserver(attemptedOpen,fsPromises.lstat.bind(fsPromises),ownedLockPath,line=>lines.push(line));
 await observer.run(async()=>{await assert.rejects(()=>observer.open(ownedLockPath,"wx"),(error:unknown)=>typeof error==="object"&&error!==null&&"code" in error&&error.code==="EEXIST");await assert.rejects(()=>observer.open(ownedLockPath,"wx"),(error:unknown)=>error===original);});
 assert.equal(lines.length,1);const diagnostic=JSON.parse(lines[0]!);assert.equal(diagnostic.wxAttempts,2);assert.equal(diagnostic.sameCallPriorEEXIST,true);assert.deepEqual(diagnostic.metadata,{present:true,isFile:true,isSymlink:false});assert.doesNotMatch(lines[0]!,new RegExp(directory.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
 const successPath=path.join(directory,"success.lock"),successLines:string[]=[],success=createUsageLockOpenObserver(fsPromises.open.bind(fsPromises),fsPromises.lstat.bind(fsPromises),successPath,line=>successLines.push(line));const handle=await success.run(()=>success.open(successPath,"wx"));await handle.close();assert.deepEqual(successLines,[]);
});

test("history capture is opt-in, redacts before persistence and scopes search/export",()=>{
 const raw={id:"1",sessionId:"s",projectId:"p",text:"token=abc123456789 password=hunter2",createdAt:"2026-10-06T00:00:00Z"};
 assert.equal(captureHistory({enabled:false,maxEntries:10},raw),undefined);const saved=captureHistory({enabled:true,maxEntries:10},raw)!;
 assert.equal(saved.redacted,true);assert.doesNotMatch(saved.text,/abc123456789|hunter2/);assert.equal(JSON.parse(exportHistory([saved,{...saved,id:"2",projectId:"other"}],"p")).length,1);
 assert.equal(searchHistory([saved,{...saved,id:"2",projectId:"other"}],"p","redacted").length,1);
 assert.equal(trimHistory({enabled:true,maxEntries:1},[saved,{...saved,id:"2"}])[0]?.id,"2");assert.throws(()=>searchHistory([saved],"p","x",0),/search/);
});

test("history removes recognized credentials completely and redaction is idempotent",()=>{
 const token="sk-ASENSyntheticKey123456789",openrouter="sk-or-v1-ASENSyntheticKey123456789";
 for(const text of [token,openrouter,`OPENROUTER_API_KEY=${openrouter}`,`Bearer ${token}`,`password=${token}`]){
  const first=redactHistoryText(text);
  assert.equal(first.redacted,true);
  assert.ok(!first.text.includes(token)&&!first.text.includes(openrouter),"no recognized credential may survive redaction");
  assert.equal(redactHistoryText(first.text).text,first.text);
 }
});

test("opt-in history never persists or exposes recognized provider credentials",async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-credential-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const storePath=path.join(directory,"history.json"),context={storePath,projectId:"p",sessionId:"s",hasUI:true,confirm:async()=>true};
 await runHistoryCommand("enable",context);
 const secrets=["sk-ASENSyntheticKey123456789","sk-or-v1-ASENSyntheticKey987654321"];
 for(const secret of secrets)await recordHistoryInput(context,`Prompt ${secret} remains useful`);
 const outputs=[await readFile(storePath,"utf8"),await runHistoryCommand("search",context),await runHistoryCommand("export",context)];
 for(const output of outputs){
  for(const secret of secrets)assert.ok(!output.includes(secret),"persistence/search/export must exclude the credential");
  assert.match(output,/Prompt/);assert.match(output,/REDACTED/);
 }
 const store=await readHistoryStore(storePath);
 assert.equal(store.entries.length,2);assert.ok(store.entries.every(entry=>entry.redacted));
});

test("public history commands require explicit opt-in and keep captures project scoped",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-command-")),storePath=path.join(directory,"history.json"),base={storePath,projectId:"p",sessionId:"s",hasUI:true};
 let consent=false;const confirm=async()=>consent;
 assert.match(await runHistoryCommand("enable",{...base,confirm}),/remains disabled/);await recordHistoryInput(base,"password=before-enabled");
 consent=true;assert.match(await runHistoryCommand("enable",{...base,confirm}),/enabled/);await recordHistoryInput(base,"token=abc123456789 hello");await recordHistoryInput({...base,projectId:"other"},"other project");
 const stored=await readFile(storePath,"utf8");assert.doesNotMatch(stored,/abc123456789|before-enabled/);assert.match(await runHistoryCommand("search hello",base),/REDACTED/);
 const exported=JSON.parse(await runHistoryCommand("export",base));assert.equal(exported.length,1);assert.equal(exported[0].projectId,"p");
 const id=exported[0].id;assert.match(await runHistoryCommand(`delete ${id}`,base),/deleted/);assert.match(await runHistoryCommand(`delete ${id}`,base),/not found/);
 assert.match(await runHistoryCommand("retention 1",base),/set to 1/);assert.match(await runHistoryCommand("disable",base),/disabled/);const count=(await readUsageFile(path.join(directory,"missing.json"))).snapshot.commands;assert.equal(count,0);
});

test("bulk history delete requires confirmation and persists tombstones",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-delete-")),storePath=path.join(directory,"history.json"),base={storePath,projectId:"p",sessionId:"s",hasUI:true,confirm:async()=>true};
 await runHistoryCommand("enable",base);await recordHistoryInput(base,"first");assert.match(await runHistoryCommand("delete all",base),/tombstones/);
 const file=await import("../src/runtime/history-store.js").then(m=>m.readHistoryStore(storePath));assert.equal(file.entries.length,0);assert.equal(file.tombstones.length,1);
});

test("corrupt history recovers only through confirmed full-store reset",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-recovery-")),storePath=path.join(directory,"history.json"),raw="{corrupt private history\n";await writeFile(storePath,raw);
 let approved=false;const context={storePath,projectId:"p",sessionId:"s",hasUI:true,confirm:async()=>approved};
 assert.match(await runHistoryCommand("reset",context),/was not reset/);assert.equal(await readFile(storePath,"utf8"),raw);
 approved=true;assert.match(await runHistoryCommand("reset",context),/remains disabled/);const recovered=await readHistoryStore(storePath);
 assert.deepEqual(recovered.entries,[]);assert.equal(recovered.policy.enabled,false);
});

test("usage counters persist and concurrent increments do not lose updates",{concurrency:false},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-usage-")),file=path.join(directory,"usage.json"),lock=`${file}.lock`;
 const originalOpen=fsPromises.open.bind(fsPromises),originalLstat=fsPromises.lstat.bind(fsPromises),observer=createUsageLockOpenObserver(originalOpen,originalLstat,lock,line=>console.error(line));
 if(process.platform==="win32"){t.mock.method(fsPromises,"open",observer.open);syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});}
 const results=await Promise.allSettled(Array.from({length:30},()=>observer.run(()=>incrementUsageFile(file,"commands"))));const failure=results.find((result):result is PromiseRejectedResult=>result.status==="rejected");if(failure)throw failure.reason;
 const value=await readUsageFile(file);assert.equal(value.snapshot.commands,30);assert.equal(value.revision,30);assert.equal((await readUsageFile(file)).snapshot.commands,30);
});

test("usage reset and telemetry consent are explicit, previewed, local and send nothing",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-usage-consent-")),storePath=path.join(directory,"usage.json");await incrementUsageFile(storePath,"commands");
 assert.match(await runUsageCommand("telemetry preview",{storePath,hasUI:false}),/nothing sent/);
 assert.match(await runUsageCommand("telemetry enable",{storePath,hasUI:false}),/requires an interactive confirmation/);
 let approved=false;const context={storePath,hasUI:true,confirm:async()=>approved};assert.match(await runUsageCommand("telemetry enable",context),/consent remains disabled/);
 approved=true;assert.match(await runUsageCommand("telemetry enable",context),/No data was sent/);assert.equal((await readUsageFile(storePath)).telemetryConsent?.enabled,true);
 assert.match(await runUsageCommand("telemetry disable",context),/disabled/);assert.equal((await readUsageFile(storePath)).telemetryConsent?.enabled,false);
 assert.match(await runUsageCommand("reset",context),/deleted/);assert.equal((await readUsageFile(storePath)).snapshot.commands,0);
});

test("usage parsers and policy helpers reject malformed counters and consent",()=>{
 assert.throws(()=>parseUsageFile('{"schema":"asen.usage/v1","revision":0,"snapshot":{"sessions":-1,"commands":0,"agentRuns":0,"blockedToolAttempts":0}}'),/Invalid/);
 const value=incrementUsage(emptyUsage(),"commands");assert.equal(telemetryPreview(value).commands,1);assert.equal(maySendTelemetry(undefined,true),false);assert.equal(maySendTelemetry({enabled:true,previewRequired:true},false),false);assert.equal(maySendTelemetry({enabled:true,previewRequired:true},true),true);
 assert.throws(()=>parseUsageFile(JSON.stringify({schema:"asen.usage/v1",revision:0,snapshot:value,telemetryConsent:{enabled:true,previewRequired:false}})),/consent/);
});

test("corrupt usage store fails closed and leaves original bytes untouched",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-usage-corrupt-")),storePath=path.join(directory,"usage.json"),raw="{broken\n";await writeFile(storePath,raw);
 await assert.rejects(()=>readUsageFile(storePath),/JSON|Unexpected/);await assert.rejects(()=>updateUsageFile(storePath,value=>({...value,revision:value.revision+1})),/JSON|Unexpected/);assert.equal(await readFile(storePath,"utf8"),raw);
});
