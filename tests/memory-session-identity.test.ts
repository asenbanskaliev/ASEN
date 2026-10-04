import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Worker} from "node:worker_threads";
import * as contextApi from "../src/memory/context.js";
import {SqliteMemoryStore} from "../src/memory/sqlite-store.js";

type Identity={explicit?:string;configured?:string;repository?:string};
type SessionStore=SqliteMemoryStore&{
 registerSession(projectId:string,sessionId:string):void;
 endSession(projectId:string,sessionId:string):void;
 continueSession(projectId:string,endedSessionId:string,proposedSessionId:string):string;
};
const api=contextApi as unknown as {
 resolveMemoryProjectId(identity:Identity):string;
 createMemoryContext(store:SessionStore,identity:Identity,sessionId:string):InstanceType<typeof contextApi.MemoryContext>;
 continueMemoryContext(store:SessionStore,identity:Identity,endedSessionId:string,proposedSessionId:string):InstanceType<typeof contextApi.MemoryContext>;
};
const store=()=>new SqliteMemoryStore(":memory:") as SessionStore;

test("project identity resolves one or agreeing explicit, configured, and repository IDs",()=>{
 assert.equal(api.resolveMemoryProjectId({explicit:"project-a"}),"project-a");
 assert.equal(api.resolveMemoryProjectId({configured:"project-a",repository:"project-a"}),"project-a");
 assert.throws(()=>api.resolveMemoryProjectId({}),/project identity is missing/);
 assert.throws(()=>api.resolveMemoryProjectId({explicit:" ",repository:"project-a"}),/project identity is blank/);
 assert.throws(()=>api.resolveMemoryProjectId({explicit:"project-a",configured:"project-b"}),/project identity mismatch/);
});

test("context binding registers the project session before writes",()=>{
 const db=store(),events:string[]=[];
 try{
  const observed={
   save(item:Parameters<SessionStore["save"]>[0]){events.push("save");db.save(item);},get:(id:string)=>db.get(id),search:(projectId:string,query:string)=>db.search(projectId,query),close:()=>db.close(),
   registerSession(projectId:string,sessionId:string){events.push("register");db.registerSession(projectId,sessionId);},endSession:(projectId:string,sessionId:string)=>db.endSession(projectId,sessionId),continueSession:(projectId:string,endedSessionId:string,proposedSessionId:string)=>db.continueSession(projectId,endedSessionId,proposedSessionId)
  } as SessionStore;
  const context=api.createMemoryContext(observed,{configured:"project-a"},"session-a");
  context.remember({id:"memory-a",kind:"decision",content:"registered first",createdAt:"now"});
  assert.deepEqual(events,["register","save"]);
  assert.deepEqual(db.get("memory-a"),{id:"memory-a",projectId:"project-a",sessionId:"session-a",kind:"decision",content:"registered first",createdAt:"now"});
  assert.doesNotThrow(()=>db.endSession("project-a","session-a"));
 }finally{db.close();}
});

test("conflicting identities fail before registering a session",()=>{
 const db=store();
 try{
  assert.throws(()=>api.createMemoryContext(db,{explicit:"project-a",repository:"project-b"},"session-a"),/project identity mismatch/);
  assert.doesNotThrow(()=>api.createMemoryContext(db,{explicit:"project-a"},"session-a"));
 }finally{db.close();}
});

test("a memory context cannot bypass session registration",()=>{
 const db=store();
 try{
  assert.throws(()=>new contextApi.MemoryContext(db,"project-a","unregistered"),/registered session binding/);
  assert.throws(()=>db.save({id:"raw",projectId:"project-a",sessionId:"unregistered",kind:"decision",content:"blocked",createdAt:"now"}),/session identity conflict/);
 }
 finally{db.close();}
});

test("ending a session atomically prevents later memory writes",()=>{
 const db=store();
 try{
  const context=api.createMemoryContext(db,{explicit:"project-a"},"session-a");
  context.remember({id:"before-end",kind:"decision",content:"allowed",createdAt:"now"});
  db.endSession("project-a","session-a");
  assert.throws(()=>context.remember({id:"after-end",kind:"decision",content:"blocked",createdAt:"later"}),/Memory session is ended/);
  assert.equal(db.get("after-end"),undefined);
 }finally{db.close();}
});

test("ended session continuation is reused after a store restart",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-memory-session-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,"memory.db");let db=new SqliteMemoryStore(path) as SessionStore;
 api.createMemoryContext(db,{repository:"repo-a"},"root-a");db.endSession("repo-a","root-a");
 const first=api.continueMemoryContext(db,{repository:"repo-a"},"root-a","continuation-a");
 first.remember({id:"continued",kind:"summary",content:"one active continuation",createdAt:"now"});db.close();
 db=new SqliteMemoryStore(path) as SessionStore;
 const resumed=api.continueMemoryContext(db,{repository:"repo-a"},"root-a","continuation-b");
 assert.equal(db.get("continued")?.sessionId,"continuation-a");
 resumed.remember({id:"continued-again",kind:"summary",content:"same continuation",createdAt:"later"});
 assert.equal(db.get("continued-again")?.sessionId,"continuation-a");db.close();
});

test("session ID conflicts reject continuation without changing the parent",()=>{
 const db=store();
 try{
  api.createMemoryContext(db,{explicit:"project-a"},"root-a");db.endSession("project-a","root-a");
  api.createMemoryContext(db,{explicit:"project-b"},"reserved-id");
  assert.throws(()=>api.continueMemoryContext(db,{explicit:"project-a"},"root-a","reserved-id"),/session identity conflict/);
  assert.doesNotThrow(()=>db.endSession("project-b","reserved-id"));
  assert.doesNotThrow(()=>api.continueMemoryContext(db,{explicit:"project-a"},"root-a","valid-continuation"));
 }finally{db.close();}
});

test("concurrent continuation requests reuse exactly one durable live child",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-memory-session-race-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,"memory.db"),db=new SqliteMemoryStore(path) as SessionStore;
 api.createMemoryContext(db,{configured:"project-race"},"root-race");db.endSession("project-race","root-race");db.close();
 const gate=new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),workerUrl=new URL("./memory-session-continue-worker.mjs",import.meta.url);
 const continueInWorker=(proposedSessionId:string)=>new Promise<string>((resolve,reject)=>{
  const worker=new Worker(workerUrl,{workerData:{gate,path,proposedSessionId},execArgv:["--import","tsx"]});
  worker.once("message",result=>result.ok?resolve(result.sessionId):reject(new Error(result.error)));
  worker.once("error",reject);worker.once("exit",code=>{if(code!==0)reject(new Error(`memory session worker exited ${code}`));});
 });
 const results=await Promise.all([continueInWorker("child-a"),continueInWorker("child-b")]);
 assert.equal(results[0],results[1]);
 const reopened=new SqliteMemoryStore(path) as SessionStore;
 const context=api.continueMemoryContext(reopened,{configured:"project-race"},"root-race","child-after-restart");
 context.remember({id:"race-proof",kind:"summary",content:"single child",createdAt:"now"});
 assert.equal(reopened.get("race-proof")?.sessionId,results[0]);reopened.close();
});
