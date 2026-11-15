import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AsenPermissionSession} from "../src/security/permission-session.js";
import {createPrimaryToolPolicyHandler} from "../src/security/primary-tool-policy.js";

const push=(id:string)=>({toolName:"bash",toolCallId:id,input:{command:"git push origin feat/ef001"}} as any);
test("EF-001 Normal without a mode getter still asks Pi for consent; a dialog failure is rethrown untouched",async t=>{
 const cwd=mkdtempSync(join(tmpdir(),"asen-ef001-normal-"));
 t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const sentinel=new Error("native Pi confirmation unavailable");
 let dialogs=0;
 const context:any={cwd,hasUI:true,mode:"tui",ui:{confirm:async()=>{
  dialogs++;throw sentinel;
 }}};
 const policy=createPrimaryToolPolicyHandler();
 await assert.rejects(()=>policy(push("normal-confirm-error"),context),error=>error===sentinel);
 assert.equal(dialogs,1);
 context.ui.confirm=async()=>{dialogs++;return false;};
 const denied=await policy(push("normal-decline"),context);
 assert.equal(denied?.block,true);
 assert.match(denied?.reason??"",/not confirmed/);
 assert.equal(dialogs,2);
});
test("EF-001 Pi confirmation cannot be reused after an explicit mode revocation or session switch",async t=>{
 const cwd=mkdtempSync(join(tmpdir(),"asen-ef001-stale-"));
 t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const manager={getSessionId:()=>"ef001-session"};
 const session=new AsenPermissionSession();
 const ctx:any={cwd,hasUI:true,mode:"tui",sessionManager:manager,ui:{}};
 assert.equal(session.set("normal",ctx),true);
 let allow!: (value:boolean)=>void;
 let entered!: ()=>void;
 const started=new Promise<void>(resolve=>{entered=resolve;});
 ctx.ui.confirm=async()=>{entered();return new Promise<boolean>(resolve=>{allow=resolve;});};
 const policy=createPrimaryToolPolicyHandler({getMode:c=>session.mode(c),modeEpoch:()=>session.epoch});
 const approval=policy(push("stale-approval"),ctx);
 await started;
 session.revoke(); // The UI decision is now stale, even if Pi later returns true.
 allow(true);
 const denied=await approval;
 assert.equal(denied?.block,true);
 assert.match(denied?.reason??"",/confirmation expired/);
 assert.equal(session.mode(ctx),"normal");
});
test("EF-001 restarting Pi cannot silently restore a revoked elevated default",t=>{
 const cwd=mkdtempSync(join(tmpdir(),"asen-ef001-initialize-"));
 t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const manager={getSessionId:()=>"ef001-session"};
 const ctx={cwd,mode:"tui",hasUI:true,sessionManager:manager};
 const session=new AsenPermissionSession();
 assert.equal(session.initialize("yolo",ctx),true);
 assert.equal(session.mode(ctx),"yolo");
 assert.equal(session.set("normal",ctx),true);
 assert.equal(session.initialize("yolo",ctx),false);
 assert.equal(session.mode(ctx),"normal");
 assert.equal(session.mode({...ctx,sessionManager:{getSessionId:()=>"ef001-session"}}),"normal");
});
