import test from "node:test";
import assert from "node:assert/strict";
import {mkdir,mkdtemp,readFile,rm,stat,truncate,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {collectPiHistoryStats,parsePiHistoryRange,PI_HISTORY_STATS_LIMITS} from "../src/stats/pi-history-stats.js";
import {runPiHistoryStatsCommand} from "../src/stats/pi-history-command.js";
import {createAsenExtension} from "../extensions/asen.js";

const header=(id:string,timestamp:string)=>({type:"session",version:3,id,timestamp,cwd:"/private/project/path"});
const entry=(type:string,id:string,extra:Record<string,unknown>={})=>({type,id,parentId:null,timestamp:"2026-10-01T12:00:00.000Z",...extra});
const jsonl=(...values:unknown[])=>values.map(value=>JSON.stringify(value)).join("\n")+"\n";

test("Pi history stats stream known entry types into bounded aggregates and apply local date ranges",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-pi-stats-"));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,"one.jsonl"),jsonl(header("session-one","2026-10-01T10:00:00.000Z"),entry("message","u1",{message:{role:"user",content:"PRIVATE PROMPT"}}),entry("message","a1",{message:{role:"assistant",provider:"private-provider",model:"private-model",content:[{type:"toolCall",name:"private-tool"}],usage:{input:10,output:4,totalTokens:14,cost:{total:0.02}}}}),entry("usage","usage1",{usage:{input:5,output:1,totalTokens:6,cost:{total:0.01}}}),entry("compaction","compact1",{usage:{input:2,output:0,totalTokens:2,cost:{total:0.005}}})));
 await writeFile(path.join(root,"two.jsonl"),jsonl(header("session-two","2026-10-03T10:00:00.000Z"),entry("message","u2",{message:{role:"user",content:"other"}})));
 await writeFile(path.join(root,"outside-range.jsonl"),jsonl(header("session-old","2026-09-30T23:59:59.000Z"),entry("message","old-u",{message:{role:"user",content:"old"}})));
 const all=await collectPiHistoryStats([root,path.join(root,".")]);assert.equal(all.roots,1);assert.equal(all.sessions,3);assert.equal(all.entries,6);assert.equal(all.userMessages,3);assert.equal(all.assistantMessages,1);assert.equal(all.toolCalls,1);assert.equal(all.inputTokens,17);assert.equal(all.outputTokens,5);assert.equal(all.totalTokens,22);assert.equal(all.costUsd,0.035);
 assert.equal(all.schema,"asen.pi-history-stats/v1");assert.deepEqual(Reflect.get(all,"measurementCounts"),{inputTokens:3,outputTokens:3,totalTokens:3,costUsd:3});
 const ranged=JSON.parse(await runPiHistoryStatsCommand("from=2026-10-01 to=2026-10-01",root,"/private/project/path"));assert.equal(ranged.sessions,1);assert.equal(ranged.userMessages,1);assert.equal(ranged.range.from,"2026-10-01");assert.doesNotMatch(JSON.stringify(ranged),/PRIVATE PROMPT|private-provider|private-model|private-tool|\/private\/project/);
 assert.equal(ranged.schema,"asen.pi-history-stats/v2");assert.deepEqual(ranged.measurementCounts,{inputTokens:3,outputTokens:3,totalTokens:3,costUsd:3});assert.deepEqual([ranged.inputTokens,ranged.outputTokens,ranged.totalTokens,ranged.costUsd],[17,5,22,0.035]);
});
test("corrupt and duplicate histories are reported without writing any session data",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-pi-stats-invalid-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const duplicate=path.join(root,"duplicate.jsonl"),corrupt=path.join(root,"corrupt.jsonl");await writeFile(duplicate,jsonl(header("duplicate-session","2026-10-02T00:00:00.000Z"),entry("message","same-entry",{message:{role:"user"}}),entry("message","same-entry",{message:{role:"assistant"}})));await writeFile(corrupt,`${JSON.stringify(header("corrupt-session","2026-10-02T00:00:00.000Z"))}\n{broken\n`);
 const before=await Promise.all([duplicate,corrupt].map(async file=>({bytes:await readFile(file),mtime:(await stat(file)).mtimeMs})));const result=await collectPiHistoryStats([root]);const after=await Promise.all([duplicate,corrupt].map(async file=>({bytes:await readFile(file),mtime:(await stat(file)).mtimeMs})));
 assert.equal(result.duplicateFiles,1);assert.equal(result.corruptFiles,1);assert.equal(result.sessions,0);assert.deepEqual(after,before);
});

test("oversized files and overlong JSONL rows are skipped under fixed bounds",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-pi-stats-bounds-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const large=path.join(root,"large.jsonl"),longLine=path.join(root,"long-line.jsonl");await writeFile(large,"");await truncate(large,PI_HISTORY_STATS_LIMITS.maxFileBytes+1);
 await writeFile(longLine,`${JSON.stringify(header("long-line","2026-10-02T00:00:00.000Z"))}\n${"x".repeat(PI_HISTORY_STATS_LIMITS.maxLineBytes+1)}\n`);
 const result=await collectPiHistoryStats([root]);assert.equal(result.oversizedFiles,2);assert.equal(result.sessions,0);assert.equal(result.truncated,false);
});

test("numeric totals saturate safely instead of overflowing",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-pi-stats-overflow-"));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const [index,id] of ["first","second"].entries())await writeFile(path.join(root,`${index}.jsonl`),jsonl(header(id,"2026-10-02T00:00:00.000Z"),entry("message",`assistant-${index}`,{message:{role:"assistant",usage:{input:Number.MAX_SAFE_INTEGER,output:0,totalTokens:Number.MAX_SAFE_INTEGER,cost:{total:Number.MAX_SAFE_INTEGER}}}})));
 const result=await collectPiHistoryStats([root]);assert.equal(result.inputTokens,Number.MAX_SAFE_INTEGER);assert.equal(result.totalTokens,Number.MAX_SAFE_INTEGER);assert.equal(result.costUsd,Number.MAX_SAFE_INTEGER);assert.equal(result.truncated,true);
});

test("history stats reject unsafe ranges and unavailable roots return structured data",async t=>{
 assert.throws(()=>parsePiHistoryRange("from=2026-02-30"),/Usage/);assert.throws(()=>parsePiHistoryRange("from=2026-10-03 to=2026-10-01"),/starts after/);assert.throws(()=>parsePiHistoryRange("from=2026-10-01 from=2026-10-02"),/Usage/);
 const root=await mkdtemp(path.join(tmpdir(),"asen-stats-missing-"));t.after(()=>rm(root,{recursive:true,force:true}));const result=await collectPiHistoryStats([path.join(root,"missing")]);assert.equal(result.state,"unavailable");assert.equal(result.roots,0);assert.equal(result.sessions,0);
});

test("stats command returns unavailable when Pi does not expose a session directory",async()=>{
 const result=JSON.parse(await runPiHistoryStatsCommand(""));assert.equal(result.state,"unavailable");assert.equal(result.sessions,0);
 assert.deepEqual([result.inputTokens,result.outputTokens,result.totalTokens,result.costUsd],[null,null,null,null],"unavailable history must not claim measured zero");assert.equal(result.schema,"asen.pi-history-stats/v2");assert.deepEqual(result.measurementCounts,{inputTokens:0,outputTokens:0,totalTokens:0,costUsd:0});
 assert.deepEqual(JSON.parse(await runPiHistoryStatsCommand("--by-day")),{...result,byDay:{timezone:"UTC",unbucketedUsageEntries:0,truncated:false,days:[]}});
 assert.deepEqual(JSON.parse(await runPiHistoryStatsCommand("--by-model")),{...result,byModel:{timezone:"UTC",unbucketedUsageEntries:0,truncated:false,rows:[]}});
});

test("available history without usage reports unknown measurements without changing source files",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-stats-no-usage-"));t.after(()=>rm(root,{recursive:true,force:true}));const file=path.join(root,"session.jsonl");await writeFile(file,jsonl(header("no-usage","2026-10-01T00:00:00.000Z"),entry("message","assistant",{message:{role:"assistant",content:"PRIVATE UNMEASURED TEXT"}})));
 const before={bytes:await readFile(file),mtime:(await stat(file)).mtimeMs},numeric=await collectPiHistoryStats([root]),projected=JSON.parse(await runPiHistoryStatsCommand("",root,"/private/project/path"));
 assert.equal(numeric.schema,"asen.pi-history-stats/v1");assert.deepEqual([numeric.inputTokens,numeric.outputTokens,numeric.totalTokens,numeric.costUsd],[0,0,0,0]);assert.equal(projected.state,"available");assert.equal(projected.sessions,1);assert.equal(projected.assistantMessages,1);
 assert.deepEqual([projected.inputTokens,projected.outputTokens,projected.totalTokens,projected.costUsd],[null,null,null,null]);assert.deepEqual(Reflect.get(numeric,"measurementCounts"),{inputTokens:0,outputTokens:0,totalTokens:0,costUsd:0});assert.deepEqual(projected,{...numeric,schema:"asen.pi-history-stats/v2",inputTokens:null,outputTokens:null,totalTokens:null,costUsd:null});
 assert.doesNotMatch(JSON.stringify(projected),/PRIVATE UNMEASURED TEXT|session\.jsonl|\/private\/project/u);assert.deepEqual({bytes:await readFile(file),mtime:(await stat(file)).mtimeMs},before);
});

test("partial history measurements count only independently valid fields without inferring totals or cost",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-stats-partial-"));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(path.join(root,"session.jsonl"),jsonl(header("partial","2026-10-01T00:00:00.000Z"),entry("usage","valid-input",{usage:{input:7,output:-1,totalTokens:1.5,cost:{total:-1}}}),entry("compaction","invalid-values",{usage:{input:"7",output:null,totalTokens:Number.MAX_SAFE_INTEGER+1,cost:{total:"0"}}})));
 const numeric=await collectPiHistoryStats([root]),projected=JSON.parse(await runPiHistoryStatsCommand("",root,"/private/project/path"));assert.deepEqual([numeric.inputTokens,numeric.outputTokens,numeric.totalTokens,numeric.costUsd],[7,0,0,0]);assert.deepEqual([projected.inputTokens,projected.outputTokens,projected.totalTokens,projected.costUsd],[7,null,null,null]);assert.deepEqual(Reflect.get(numeric,"measurementCounts"),{inputTokens:1,outputTokens:0,totalTokens:0,costUsd:0});assert.deepEqual(projected.measurementCounts,Reflect.get(numeric,"measurementCounts"));assert.equal(projected.entries,2);
});

test("explicitly observed zero remains measured zero rather than unknown",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-stats-zero-"));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(path.join(root,"session.jsonl"),jsonl(header("zero","2026-10-01T00:00:00.000Z"),entry("message","assistant-zero",{message:{role:"assistant",usage:{input:0,output:0,totalTokens:0,cost:{total:0}}}})));
 const numeric=await collectPiHistoryStats([root]),projected=JSON.parse(await runPiHistoryStatsCommand("",root,"/private/project/path"));assert.deepEqual(Reflect.get(numeric,"measurementCounts"),{inputTokens:1,outputTokens:1,totalTokens:1,costUsd:1});assert.deepEqual(projected.measurementCounts,Reflect.get(numeric,"measurementCounts"));assert.deepEqual([projected.inputTokens,projected.outputTokens,projected.totalTokens,projected.costUsd],[0,0,0,0]);assert.equal(projected.schema,"asen.pi-history-stats/v2");
});

test("Pi /asen-stats command uses only the active session directory",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-pi-stats-command-")),sessionDir=path.join(root,"sessions"),foreignRoot=path.join(root,"elsewhere");t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(sessionDir,{recursive:true});await writeFile(path.join(sessionDir,"active.jsonl"),jsonl({...header("active","2026-10-01T10:00:00.000Z"),cwd:root},entry("message","u1",{message:{role:"user",content:"private active prompt"}})));await writeFile(path.join(sessionDir,"foreign.jsonl"),jsonl({...header("foreign","2026-10-01T10:00:00.000Z"),cwd:foreignRoot},entry("message","u2",{message:{role:"user",content:"private foreign prompt"}})));
 const commands=new Map<string,{handler:(...args:any[])=>any}>();createAsenExtension({homeDir:()=>root,packageRoot:root})({registerCommand:(name:string,command:any)=>commands.set(name,command)});
 const result=JSON.parse(await commands.get("asen-stats")!.handler("",{cwd:root,ui:{notify(){},confirm:async()=>true},sessionManager:{getSessionId:()=>"active",getSessionDir:()=>sessionDir}}));assert.equal(result.sessions,1);assert.equal(result.userMessages,1);assert.equal(result.outOfScopeFiles,1);assert.doesNotMatch(JSON.stringify(result),/private active prompt|private foreign prompt|active\.jsonl|\/sessions/);
});

test("Pi /asen-stats --by-day groups accepted usage by UTC event day without changing legacy bytes",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-stats-utc-")),sessionDir=path.join(root,"sessions");t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(sessionDir);
 const session={...header("synthetic-session-id","2026-09-30T12:00:00.000Z"),cwd:root};
 const excluded=entry("usage","excluded-entry-id",{timestamp:"2026-10-02T00:00:00.000Z",usage:{input:99}});
 await writeFile(path.join(sessionDir,"a-source.jsonl"),jsonl(session,
  entry("compaction","after-midnight",{timestamp:"2026-10-01T20:00:00.000-04:00",usage:{input:7}}),
  entry("message","before-midnight",{timestamp:"2026-10-02T01:59:59.999+02:00",message:{role:"assistant",provider:"synthetic-provider-label",model:"synthetic-model-label",content:"synthetic private text",usage:{input:3,output:0,cost:{total:0}}}}),
  entry("usage","ambiguous-time",{timestamp:"2026-10-02T02:00:00",usage:{totalTokens:9}}),
  entry("usage","no-measurement",{timestamp:"2026-10-03T00:00:00.000Z",usage:{input:"99",totalTokens:-1}})));
 await writeFile(path.join(sessionDir,"b-duplicate.jsonl"),jsonl(session,excluded));
 await writeFile(path.join(sessionDir,"c-duplicate-entry.jsonl"),jsonl({...session,id:"duplicate-entry-session"},excluded,excluded));
 await writeFile(path.join(sessionDir,"d-corrupt.jsonl"),jsonl({...session,id:"corrupt-session"},excluded)+"{broken\n");
 await writeFile(path.join(sessionDir,"e-outside.jsonl"),jsonl({...session,id:"outside-session",cwd:path.join(root,"outside")},excluded));
 const commands=new Map<string,{handler:(...args:any[])=>any}>();createAsenExtension({homeDir:()=>root,packageRoot:root})({registerCommand:(name:string,command:any)=>commands.set(name,command)});
 const run=(args:string)=>commands.get("asen-stats")!.handler(args,{cwd:root,ui:{notify(){},confirm:async()=>true},sessionManager:{getSessionId:()=>session.id,getSessionDir:()=>sessionDir}});
 const legacy={schema:"asen.pi-history-stats/v2",range:{},state:"available",roots:1,outOfScopeFiles:1,sessions:1,entries:4,userMessages:0,assistantMessages:1,toolCalls:0,inputTokens:10,outputTokens:0,totalTokens:9,costUsd:0,measurementCounts:{inputTokens:2,outputTokens:1,totalTokens:1,costUsd:1},corruptFiles:1,duplicateFiles:2,oversizedFiles:0,unreadableFiles:0,truncated:false};
 assert.equal(await run(""),JSON.stringify(legacy,null,2));
 assert.equal(await run("from=2026-09-30 to=2026-09-30"),JSON.stringify({...legacy,range:{from:"2026-09-30",to:"2026-09-30"}},null,2));
 const output=await run("--by-day"),{byDay,...summary}=JSON.parse(output);
 assert.deepEqual(summary,legacy);
 assert.deepEqual(byDay,{timezone:"UTC",unbucketedUsageEntries:1,truncated:false,days:[
  {day:"2026-10-01",inputTokens:3,outputTokens:0,totalTokens:null,costUsd:0,measurementCounts:{inputTokens:1,outputTokens:1,totalTokens:0,costUsd:1}},
  {day:"2026-10-02",inputTokens:7,outputTokens:null,totalTokens:null,costUsd:null,measurementCounts:{inputTokens:1,outputTokens:0,totalTokens:0,costUsd:0}}
 ]});
 assert.doesNotMatch(output,/synthetic-session-id|excluded-entry-id|synthetic-provider-label|synthetic-model-label|synthetic private text|a-source\.jsonl/u);assert.ok(!output.includes(JSON.stringify(root).slice(1,-1)));
 for(const args of ["--by-day --by-day","--by-day from=2026-10-01","--by-day extra"])await assert.rejects(()=>run(args),/Usage/);
});

test("Pi /asen-stats --by-model attributes only exact active metadata on accepted UTC events",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-stats-model-")),sessionDir=path.join(root,"sessions");t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(sessionDir);
 const session={...header("private-session-marker","2026-09-30T12:00:00.000Z"),cwd:root};
 const provider="synthetic-public",id="example/public-model-v1";
 const assistant=(entryId:string,metadata:Record<string,unknown>,usage?:Record<string,unknown>,timestamp="2026-10-02T01:30:00+02:00")=>entry("message",entryId,{timestamp,message:{role:"assistant",...metadata,content:"private-content-marker",usage}});
 const exact={provider,model:id};
 const excluded=assistant("private-excluded-marker",exact,{input:900});
 await writeFile(path.join(sessionDir,"a-private-file-marker.jsonl"),jsonl(session,
  assistant("private-entry-marker",exact,{input:0,output:0,cost:{total:0}}),assistant("partial",exact,{input:7}),
  assistant("history-only",{provider:"private-provider-marker",model:"private-model-marker"},{input:5}),
  assistant("missing-provider",{model:id}),assistant("prefix",{provider,model:id+"-other"}),
  assistant("case",{provider:provider.toUpperCase(),model:id}),assistant("suffix",{provider,model:id+"\n"}),
  assistant("missing-all",{},undefined,"2026-10-02T02:00:00Z"),
  entry("compaction","unattributed",{timestamp:"2026-10-02T01:00:00Z",...exact,usage:{totalTokens:4}}),
  assistant("ambiguous",exact,{input:2},"2026-10-02T02:00:00")));
 await writeFile(path.join(sessionDir,"b-duplicate.jsonl"),jsonl(session,excluded));
 await writeFile(path.join(sessionDir,"c-duplicate-entry.jsonl"),jsonl({...session,id:"duplicate-entry"},excluded,excluded));
 await writeFile(path.join(sessionDir,"d-corrupt.jsonl"),jsonl({...session,id:"corrupt"},excluded)+"{broken\n");
 await writeFile(path.join(sessionDir,"e-outside.jsonl"),jsonl({...session,id:"outside",cwd:path.join(root,"outside")},excluded));
 const commands=new Map<string,{handler:(...args:any[])=>any}>();createAsenExtension({homeDir:()=>root,packageRoot:root})({registerCommand:(name:string,command:any)=>commands.set(name,command)});
 let modelReads=0,registryReads=0,otherMetadataReads=0;
 const model={provider,id,get name(){otherMetadataReads++;throw new Error("Do not read model name");},get baseUrl(){otherMetadataReads++;throw new Error("Do not read model URLs");},get cost(){otherMetadataReads++;throw new Error("Do not read model prices");}};
 const run=(args:string,activeModel:unknown)=>commands.get("asen-stats")!.handler(args,{cwd:root,ui:{notify(){}},sessionManager:{getSessionId:()=>session.id,getSessionDir:()=>sessionDir},get model(){modelReads++;return activeModel;},get modelRegistry(){registryReads++;throw new Error("Do not access modelRegistry");}});
 const legacy={schema:"asen.pi-history-stats/v2",range:{},state:"available",roots:1,outOfScopeFiles:1,sessions:1,entries:10,userMessages:0,assistantMessages:9,toolCalls:0,inputTokens:14,outputTokens:0,totalTokens:4,costUsd:0,measurementCounts:{inputTokens:4,outputTokens:1,totalTokens:1,costUsd:1},corruptFiles:1,duplicateFiles:2,oversizedFiles:0,unreadableFiles:0,truncated:false};
 assert.equal(await run("",model),JSON.stringify(legacy,null,2));
 assert.equal(await run("from=2026-09-30 to=2026-09-30",model),JSON.stringify({...legacy,range:{from:"2026-09-30",to:"2026-09-30"}},null,2));
 assert.equal(await run("--by-day",model),JSON.stringify({...legacy,byDay:{timezone:"UTC",unbucketedUsageEntries:1,truncated:false,days:[
  {day:"2026-10-01",inputTokens:12,outputTokens:0,totalTokens:null,costUsd:0,measurementCounts:{inputTokens:3,outputTokens:1,totalTokens:0,costUsd:1}},
  {day:"2026-10-02",inputTokens:null,outputTokens:null,totalTokens:4,costUsd:null,measurementCounts:{inputTokens:0,outputTokens:0,totalTokens:1,costUsd:0}}
 ]}},null,2));
 for(const args of ["--by-model --by-day","--by-day --by-model","--by-model from=2026-10-01","to=2026-10-02 --by-model","--by-model --by-model","--by-model extra"])await assert.rejects(()=>run(args,model),/Usage/);
 assert.equal(modelReads,0);
 const output=await run("--by-model",model),{byModel,...summary}=JSON.parse(output);
 assert.deepEqual(summary,legacy);
 assert.deepEqual(byModel,{timezone:"UTC",unbucketedUsageEntries:1,truncated:false,rows:[
  {day:"2026-10-01",model:{provider,id},usageEntries:2,inputTokens:7,outputTokens:0,totalTokens:null,costUsd:0,measurementCounts:{inputTokens:2,outputTokens:1,totalTokens:0,costUsd:1}},
  {day:"2026-10-01",model:null,usageEntries:5,inputTokens:5,outputTokens:null,totalTokens:null,costUsd:null,measurementCounts:{inputTokens:1,outputTokens:0,totalTokens:0,costUsd:0}},
  {day:"2026-10-02",model:null,usageEntries:2,inputTokens:null,outputTokens:null,totalTokens:4,costUsd:null,measurementCounts:{inputTokens:0,outputTokens:0,totalTokens:1,costUsd:0}}
 ]});
 const accessor={provider,get id(){otherMetadataReads++;throw new Error("Do not invoke metadata getters");}};
 for(const invalid of [undefined,{id},accessor,{provider,id:"https://private-url-marker/path"},{provider,id:"../private-path-marker"},{provider,id:"private-newline-marker\n"},{provider:"private/provider-marker",id},{provider,id:"x".repeat(129)}]){
  const fallback=await run("--by-model",invalid);
  assert.deepEqual(JSON.parse(fallback).byModel.rows.map((row:any)=>[row.day,row.model,row.usageEntries]),[["2026-10-01",null,7],["2026-10-02",null,2]]);
  assert.doesNotMatch(fallback,/private-|synthetic-public|public-model-v1/u);
 }
 assert.doesNotMatch(output,/private-|outside-session|public-model-v1-other/u);assert.ok(!output.includes(JSON.stringify(root).slice(1,-1)));
 const mutable={provider,id},pending=run("--by-model",mutable);mutable.id="changed-model-marker";
 assert.equal(await pending,output);
 assert.deepEqual([modelReads,registryReads,otherMetadataReads],[10,0,0]);
});

test("model view caps rows even within a day, merges retained rows, and never echoes unsafe active labels",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-stats-model-cap-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const limit=PI_HISTORY_STATS_LIMITS.maxModelRows,start=Date.UTC(2020,0,1),iso=(day:number)=>new Date(start+day*86_400_000).toISOString();
 const model={provider:"synthetic-public",id:"public-model"};
 const assistant=(id:string,timestamp:string,identity:{provider:string;id:string},input:number)=>entry("message",id,{timestamp,message:{role:"assistant",provider:identity.provider,model:identity.id,usage:{input}}});
 const events=Array.from({length:limit},(_,i)=>assistant(`entry-${i}`,iso(Math.floor(i/2)),i%2?{...model,id:"synthetic-history-marker"}:model,1));
 const unsafe={...model,id:"https://private-url-marker/path"};
 await writeFile(path.join(root,"a.jsonl"),jsonl({...header("many-model-rows",iso(0)),cwd:root},...events,assistant("past-cap",iso(limit),unsafe,2)));
 await writeFile(path.join(root,"b.jsonl"),jsonl({...header("later-file",iso(0)),cwd:root},assistant("retained",iso(0),model,3)));
 const result=JSON.parse(await runPiHistoryStatsCommand("--by-model",root,root,model));
 assert.equal(result.inputTokens,limit+5);assert.equal(result.truncated,false);
 assert.equal(result.byModel.truncated,true);assert.equal(result.byModel.rows.length,limit);
 assert.deepEqual(result.byModel.rows.slice(0,2).map((row:any)=>[row.day,row.model,row.usageEntries,row.inputTokens]),[[iso(0).slice(0,10),model,2,4],[iso(0).slice(0,10),null,1,1]]);
 assert.equal(result.byModel.rows.at(-1).day,iso(Math.floor((limit-1)/2)).slice(0,10));
 const output=await runPiHistoryStatsCommand("--by-model",root,root,unsafe),fallback=JSON.parse(output);
 assert.equal(fallback.byModel.truncated,false);assert.equal(fallback.byModel.rows.at(-1).model,null);assert.equal(fallback.byModel.rows.at(-1).inputTokens,2);
 assert.doesNotMatch(output,/private-url-marker|synthetic-history-marker|synthetic-public|public-model/u);
});

test("day output stays bounded without dropping observations from the summary or retained days",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-stats-day-cap-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const maxDays=PI_HISTORY_STATS_LIMITS.maxDays,start=Date.UTC(2020,0,1),iso=(day:number)=>new Date(start+day*86_400_000).toISOString();
 const events=Array.from({length:maxDays+1},(_,day)=>entry("usage",`day-${day}`,{timestamp:iso(day),usage:{input:1}}));
 await writeFile(path.join(root,"a.jsonl"),jsonl({...header("many-days",iso(0)),cwd:root},...events));
 await writeFile(path.join(root,"b.jsonl"),jsonl({...header("retained-day",iso(0)),cwd:root},entry("usage","extra-on-first-day",{timestamp:iso(0),usage:{input:2}})));
 const result=JSON.parse(await runPiHistoryStatsCommand("--by-day",root,root));
 assert.equal(result.inputTokens,maxDays+3);assert.equal(result.truncated,false);
 assert.equal(result.byDay.truncated,true);assert.equal(result.byDay.unbucketedUsageEntries,0);assert.equal(result.byDay.days.length,maxDays);
 assert.deepEqual([result.byDay.days[0].day,result.byDay.days[0].inputTokens,result.byDay.days[0].measurementCounts.inputTokens],[iso(0).slice(0,10),3,2]);
 assert.equal(result.byDay.days.at(-1).day,iso(maxDays-1).slice(0,10));
});
