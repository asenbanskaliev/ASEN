import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,stat,symlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {applyHistoryRetention,appendHistoryEntry,commitHistory,deleteHistoryEntry,deleteProjectHistory,emptyHistoryStore,parseHistoryStore,readHistoryStore} from "../src/runtime/history-store.js";

const entry=(id:string,projectId="p")=>({id,sessionId:"s",projectId,text:"safe",createdAt:"2026-10-06T00:00:00Z",redacted:false});

test("history persistence survives reopen, checks revisions and tombstones safe delete",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-")),file=path.join(directory,"private","history.json");
 const initial=await readHistoryStore(file);const one=await commitHistory(file,initial.revision,value=>({...value,revision:value.revision+1,policy:{enabled:true,maxEntries:20},entries:[entry("one")]}));
 if(process.platform!=="win32")assert.equal((await stat(file)).mode&0o777,0o600);
 assert.equal((await readHistoryStore(file)).entries[0]?.id,"one");await assert.rejects(()=>commitHistory(file,0,value=>({...value,revision:value.revision+1})),/conflict/);
 const deleted=await commitHistory(file,one.revision,value=>deleteHistoryEntry(value,"one"));assert.deepEqual(deleted.tombstones,["one"]);assert.deepEqual((await readHistoryStore(file)).entries,[]);
 await assert.rejects(()=>appendHistoryEntry(file,entry("one")),/tombstoned/);
});

test("history retention updates policy and tombstones evicted records",()=>{
 const initial={...emptyHistoryStore(),policy:{enabled:true,maxEntries:10},entries:[entry("one"),entry("two")]};
 const retained=applyHistoryRetention(initial,{enabled:true,maxEntries:1});assert.deepEqual(retained.entries.map(value=>value.id),["two"]);assert.deepEqual(retained.tombstones,["one"]);assert.equal(retained.policy.maxEntries,1);
});

test("concurrent writes serialize without lost updates and preserve project isolation",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-race-")),file=path.join(directory,"history.json");
 await commitHistory(file,0,value=>({...value,revision:1,policy:{enabled:true,maxEntries:100}}));
 await Promise.all(Array.from({length:40},(_,index)=>appendHistoryEntry(file,entry(`p-${index}`))));
 const all=await readHistoryStore(file);assert.equal(all.entries.length,40);assert.equal(all.revision,41);
 const next=await commitHistory(file,all.revision,value=>deleteProjectHistory(value,"p"));assert.equal(next.entries.length,0);assert.equal(next.tombstones.length,40);
});

test("independent Pi processes do not overwrite each other's history updates",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-processes-")),file=path.join(directory,"history.json");
 await commitHistory(file,0,value=>({...value,revision:1,policy:{enabled:true,maxEntries:20}}));
 const moduleUrl=new URL("../src/runtime/history-store.ts",import.meta.url).href;
 const run=(id:string)=>new Promise<void>((resolve,reject)=>{
  const code=`const store=await import(${JSON.stringify(moduleUrl)});await store.appendHistoryEntry(${JSON.stringify(file)},${JSON.stringify(entry(id))});`;
  const child=spawn(process.execPath,["--import","tsx","--input-type=module","-e",code],{cwd:process.cwd(),stdio:["ignore","ignore","pipe"]});let error="";
  child.stderr.setEncoding("utf8");child.stderr.on("data",chunk=>{error+=chunk;});child.once("error",reject);child.once("close",(status)=>status===0?resolve():reject(Error(`History child failed (${status}): ${error}`)));
 });
 await Promise.all([run("child-a"),run("child-b"),run("child-c"),run("child-d")]);const stored=await readHistoryStore(file);
 assert.equal(stored.entries.length,4);assert.deepEqual(stored.entries.map(value=>value.id).sort(),["child-a","child-b","child-c","child-d"]);
});

test("corrupt or semantically inconsistent history fails closed without replacing bytes",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-corrupt-")),file=path.join(directory,"history.json"),raw='{"schema":"broken"}\n';await writeFile(file,raw);
 await assert.rejects(()=>readHistoryStore(file),/Invalid history/);await assert.rejects(()=>commitHistory(file,0,value=>({...value,revision:1})),/Invalid history/);assert.equal(await readFile(file,"utf8"),raw);
 const duplicate={...emptyHistoryStore(),entries:[entry("same"),entry("same")]};assert.throws(()=>parseHistoryStore(JSON.stringify(duplicate)),/Duplicate history/);
 const overlap={...emptyHistoryStore(),entries:[entry("same")],tombstones:["same"]};assert.throws(()=>parseHistoryStore(JSON.stringify(overlap)),/tombstones/);
});

test("private history rejects linked files/directories and stores data with owner-only mode",{skip:process.platform==="win32"?"POSIX private mode and symlink behavior":false},async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-private-")),actual=path.join(directory,"actual"),alias=path.join(directory,"alias"),file=path.join(actual,"history.json");
 await commitHistory(file,0,value=>({...value,revision:1,policy:{enabled:true,maxEntries:1}}));assert.equal((await stat(file)).mode&0o777,0o600);assert.equal((await stat(actual)).mode&0o777,0o700);
 await symlink(actual,alias,"dir");await assert.rejects(()=>readHistoryStore(path.join(alias,"history.json")),/real directory/);
 const linked=path.join(directory,"linked.json");await symlink(file,linked,"file");await assert.rejects(()=>readHistoryStore(linked),/regular file/);
});

test("stale lock left by a crashed process is recovered on the next write",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-lock-")),file=path.join(directory,"history.json"),lock=`${file}.lock`;
 await writeFile(lock,JSON.stringify({pid:2147483647,token:"crashed",createdAt:Date.now()-60000}));
 const value=await commitHistory(file,0,current=>({...current,revision:1,policy:{enabled:true,maxEntries:10}}));assert.equal(value.revision,1);
});
