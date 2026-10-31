import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,realpath,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AgentProjectAccess} from "../src/agents/agent-project-access.js";

async function setup(t:any){
 const root=await realpath(await mkdtemp(join(tmpdir(),"asen-project-access-")));t.after(()=>rm(root,{recursive:true,force:true}));
 const project=await realpath(process.cwd()),manager={getSessionId:()=>"session-a"},current={sessionId:"session-a",projectId:project};
 return {root,current,context:{cwd:project,sessionManager:manager,hasUI:true,ui:{confirm:async()=>true}}};
}
test("foreign project launch permission is live-session scoped and cannot be restored",async t=>{
 const {root,current,context}=await setup(t),access=new AgentProjectAccess();let confirmations=0;
 const confirm=async()=>{confirmations++;return true;};
 assert.deepEqual(await access.resolve(undefined,context,current,true,confirm),current);
 await assert.rejects(access.resolve(root,context,current,false,confirm),/permission is unavailable/);
 assert.deepEqual(await access.resolve(root,context,current,true,confirm),{sessionId:current.sessionId,projectId:root});
 await access.resolve(root,context,current,false,confirm);assert.equal(confirmations,1);
 access.reset();await assert.rejects(access.resolve(root,context,current,false,confirm),/permission is unavailable/);
 await access.resolve(root,context,current,true,confirm);
 await assert.rejects(access.resolve(root,{...context,sessionManager:{getSessionId:()=>current.sessionId}},current,false,confirm),/permission is unavailable/);
});
test("foreign project consent rejects decline, absent UI, abort and session changes",async t=>{
 const {root,current,context}=await setup(t),access=new AgentProjectAccess();
 await assert.rejects(access.resolve(root,context,current,true,async()=>false),/confirmation/);
 await assert.rejects(access.resolve(root,{...context,hasUI:false},current,true,async()=>true),/confirmation/);
 const controller=new AbortController();await assert.rejects(access.resolve(root,context,current,true,async()=>{controller.abort();return true;},controller.signal),/cancelled/);
 await assert.rejects(access.resolve(root,context,current,false,async()=>true),/permission is unavailable/);
 await assert.rejects(access.resolve(root,context,current,true,async()=>{context.sessionManager={getSessionId:()=>"session-b"};return true;}),/session changed/);
 await assert.rejects(access.resolve("relative",context,current,true,async()=>true),/absolute/);
});
