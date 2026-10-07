import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {captureHistory,exportHistory,searchHistory,trimHistory} from "../src/runtime/history.js";
import {runHistoryCommand,recordHistoryInput} from "../src/runtime/history-command.js";
import {readHistoryStore} from "../src/runtime/history-store.js";
import {emptyUsage,incrementUsage,maySendTelemetry,telemetryPreview} from "../src/runtime/usage.js";
import {incrementUsageFile,parseUsageFile,readUsageFile,updateUsageFile} from "../src/runtime/usage-store.js";
import {runUsageCommand} from "../src/runtime/usage-command.js";

test("history capture is opt-in, redacts before persistence and scopes search/export",()=>{
 const raw={id:"1",sessionId:"s",projectId:"p",text:"token=abc123456789 password=hunter2",createdAt:"2026-10-06T00:00:00Z"};
 assert.equal(captureHistory({enabled:false,maxEntries:10},raw),undefined);const saved=captureHistory({enabled:true,maxEntries:10},raw)!;
 assert.equal(saved.redacted,true);assert.doesNotMatch(saved.text,/abc123456789|hunter2/);assert.equal(JSON.parse(exportHistory([saved,{...saved,id:"2",projectId:"other"}],"p")).length,1);
 assert.equal(searchHistory([saved,{...saved,id:"2",projectId:"other"}],"p","redacted").length,1);
 assert.equal(trimHistory({enabled:true,maxEntries:1},[saved,{...saved,id:"2"}])[0]?.id,"2");assert.throws(()=>searchHistory([saved],"p","x",0),/search/);
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

test("usage counters persist and concurrent increments do not lose updates",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-usage-")),file=path.join(directory,"usage.json");
 await Promise.all(Array.from({length:30},()=>incrementUsageFile(file,"commands")));
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
