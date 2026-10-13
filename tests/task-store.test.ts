import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm,readFile,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {PersistentTaskStore} from "../src/runtime/task-store.js";
import type {TaskEvent} from "../src/runtime/task-replay.js";

test("ECO-07 durable journal isolates sessions, persists recovery and never replays execution",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-task-journal-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,"tasks.json"),a=new PersistentTaskStore(file),b=new PersistentTaskStore(file);
 const event=(sessionId:string,revision:number,state:TaskEvent["state"]):TaskEvent=>({taskId:`task-${sessionId}`,sessionId,projectId:"/repo",revision,state,at:`2026-10-13T00:00:0${revision}Z`});
 await a.append(event("a",1,"planned"));await a.append(event("a",2,"running"));
 await b.append(event("b",1,"planned"));
 const recovered=await b.recover("task-a","a","/repo","2026-10-13T00:00:03Z");
 assert.equal(recovered?.state,"blocked");
 assert.equal((await a.history("task-a","a","/repo")).length,3);
 assert.equal((await a.history("task-b","b","/repo")).length,1);
 assert.equal(await a.recover("task-a","a","/repo","2026-10-13T00:00:04Z")?.then(s=>s?.state),"blocked");
 assert.equal((await b.history("task","a","/other")).length,0);
 assert.throws(()=>JSON.parse("invalid"));
 const raw=await readFile(file,"utf8");assert.equal(JSON.parse(raw).revision,4);
 await assert.rejects(()=>a.append(event("a",3,"done")),/revision conflict/);
});
test("ECO-07 journal fails closed on corruption and preserves prior durable bytes",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-task-corrupt-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,"tasks.json"),store=new PersistentTaskStore(file);
 await store.append({taskId:"x",sessionId:"s",projectId:"p",revision:1,state:"planned",at:"2026-10-13T00:00:01Z"});
 await writeFile(file,'{"schema":"asen.tasks/v1","revision":1,"events":[{"forged":true}]}');
 const before=await readFile(file,"utf8");
 await assert.rejects(()=>store.recover("x","s","p","2026-10-13T00:00:02Z"));
 assert.equal(await readFile(file,"utf8"),before);
});

test("ECO-07 rejects cross-session task identity reuse before writing",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-task-identity-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=new PersistentTaskStore(join(dir,"tasks.json"));
 const original:TaskEvent={taskId:"same",sessionId:"s1",projectId:"p1",revision:1,state:"planned",at:"2026-10-13T00:00:01Z"};
 await store.append(original);
 await assert.rejects(()=>store.append({...original,sessionId:"s2"}),/another session or project/);
 assert.equal((await store.history("same","s1","p1")).length,1);
 assert.equal(await store.recover("same","s2","p1","2026-10-13T00:00:02Z"),undefined);
});

test("ECO-07 journal rejects cross-session identity substitution in persisted history",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-task-forged-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,"tasks.json"),store=new PersistentTaskStore(file);
 const base:TaskEvent={taskId:"shared",sessionId:"s1",projectId:"p",revision:1,state:"planned",at:"2026-10-13T00:00:01Z"};
 await store.append(base);
 const forged={schema:"asen.tasks/v1",revision:2,events:[base,{...base,sessionId:"s2"}]};
 await writeFile(file,JSON.stringify(forged));
 await assert.rejects(()=>store.history("shared","s1","p"),/multiple sessions or projects/);
 await assert.rejects(()=>store.append({...base,taskId:"another"}),/multiple sessions or projects/);
});
test("ECO-07 competing revisions preserve exactly one winner",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-task-race-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,"tasks.json"),first=new PersistentTaskStore(file),second=new PersistentTaskStore(file);
 const planned:TaskEvent={taskId:"race",sessionId:"s",projectId:"p",revision:1,state:"planned",at:"2026-10-13T00:00:01Z"};
 await first.append(planned);
 const next:TaskEvent={...planned,revision:2,state:"running",at:"2026-10-13T00:00:02Z"};
 const results=await Promise.allSettled([first.append(next),second.append(next)]);
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
 assert.equal(results.filter(r=>r.status==="rejected").length,1);
 assert.equal((await first.history("race","s","p")).length,2);
});
