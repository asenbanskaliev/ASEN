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

test("history stats reject unsafe ranges and unavailable roots return structured data",async()=>{
 assert.throws(()=>parsePiHistoryRange("from=2026-02-30"),/Usage/);assert.throws(()=>parsePiHistoryRange("from=2026-10-03 to=2026-10-01"),/starts after/);assert.throws(()=>parsePiHistoryRange("from=2026-10-01 from=2026-10-02"),/Usage/);
 const missing=path.join(tmpdir(),"asen-stats-missing-root");await rm(missing,{recursive:true,force:true});const result=await collectPiHistoryStats([missing]);assert.equal(result.state,"unavailable");assert.equal(result.roots,0);assert.equal(result.sessions,0);
});

test("stats command returns unavailable when Pi does not expose a session directory",async()=>{
 const result=JSON.parse(await runPiHistoryStatsCommand(""));assert.equal(result.state,"unavailable");assert.equal(result.sessions,0);
 assert.deepEqual([result.inputTokens,result.outputTokens,result.totalTokens,result.costUsd],[null,null,null,null],"unavailable history must not claim measured zero");assert.equal(result.schema,"asen.pi-history-stats/v2");assert.deepEqual(result.measurementCounts,{inputTokens:0,outputTokens:0,totalTokens:0,costUsd:0});
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
