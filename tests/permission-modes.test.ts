import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync,mkdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AsenPermissionSession} from "../src/security/permission-session.js";
import {parsePermissionModeDefault,permissionModeFile,readPermissionModeDefault,savePermissionModeDefault} from "../src/security/permission-mode-policy.js";
import {createPrimaryToolPolicyHandler,isYoloRoutinePush} from "../src/security/primary-tool-policy.js";
import {createAsenExtension} from "../extensions/asen.js";

test("Normal is default; global preference is private, versioned, atomic and never repository controlled",t=>{
 const home=mkdtempSync(join(tmpdir(),"asen-permission-default-"));
 t.after(()=>rmSync(home,{recursive:true,force:true}));
 assert.deepEqual(readPermissionModeDefault(home),{mode:"normal",malformed:false});
 savePermissionModeDefault(home,"yolo");
 assert.deepEqual(readPermissionModeDefault(home),{mode:"yolo",malformed:false});
 assert.deepEqual(JSON.parse(readFileSync(permissionModeFile(home),"utf8")),
  {schema:"asen.permission-mode/v1",mode:"yolo"});
 assert.equal(parsePermissionModeDefault('{"schema":"wrong","mode":"yolo"}'),undefined);
 writeFileSync(permissionModeFile(home),'{"schema":"wrong","mode":"yolo"}');
 assert.deepEqual(readPermissionModeDefault(home),{mode:"normal",malformed:true});
 assert.throws(()=>savePermissionModeDefault(home,"yolo"),/malformed/);
 assert.equal(readFileSync(permissionModeFile(home),"utf8"),'{"schema":"wrong","mode":"yolo"}');
});
test("Permission preference symlink cannot be read as authority or overwritten",t=>{
 const home=mkdtempSync(join(tmpdir(),"asen-permission-link-"));
 t.after(()=>rmSync(home,{recursive:true,force:true}));
 const parent=join(home,".asen");mkdirSync(parent,{mode:0o700});
 const external=join(home,"victim.json");writeFileSync(external,'{"mode":"yolo"}');
 try{symlinkSync(external,permissionModeFile(home),"file");}catch(error){
  if(["EPERM","EACCES"].includes((error as NodeJS.ErrnoException).code??"")){t.skip("Host cannot create symlink");return;}
  throw error;
 }
 assert.deepEqual(readPermissionModeDefault(home),{mode:"normal",malformed:true});
 assert.throws(()=>savePermissionModeDefault(home,"normal"),/unsafe or malformed/);
 assert.equal(readFileSync(external,"utf8"),'{"mode":"yolo"}');
});
test("Live YOLO grant binds real primary TUI, exact manager, workspace and session and resets",t=>{
 const cwd=mkdtempSync(join(tmpdir(),"asen-yolo-scope-"));
 t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const other=mkdtempSync(join(tmpdir(),"asen-yolo-other-"));t.after(()=>rmSync(other,{recursive:true,force:true}));
 const controller=new AsenPermissionSession();
 const manager={getSessionId:()=>"s1"};
 const ctx={cwd,mode:"tui",hasUI:true,sessionManager:manager};
 assert.equal(controller.mode(ctx),"normal");
 assert.equal(controller.set("yolo",ctx),true);
 assert.equal(controller.mode(ctx),"yolo");
 assert.equal(controller.mode({...ctx,mode:"rpc"}),"normal");
 assert.equal(controller.mode(ctx),"normal","RPC observation revokes instead of hiding grant");
 assert.equal(controller.set("yolo",ctx),true);
 assert.equal(controller.mode({...ctx,cwd:other}),"normal","Scope drift revokes");
 assert.equal(controller.set("yolo",ctx),true);
 assert.equal(controller.mode({...ctx,sessionManager:{getSessionId:()=> "s1"}}),"normal","Different manager never inherits authority");
 assert.equal(controller.set("yolo",{...ctx,hasUI:false}),false);
 assert.equal(controller.set("auto",ctx),true);
 controller.revoke();assert.equal(controller.mode(ctx),"normal");
});
test("YOLO only waives one unambiguous ordinary feature-branch push",()=>{
 const accepted=["git push origin feat/demo","git push -u origin feature/stable-2","git push --set-upstream origin fix/missing-api"];
 const rejected=["git push","git push origin main","git push origin master","git push origin feat/a && rm -rf data",
  "git push --force origin feat/a","git push origin +feat/a","git push origin :feat/a",
  "git push origin feat/a; git reset --hard HEAD","git push other feat/a",
  "git push origin feat/a..b","git push origin feat/a.lock","sh -c 'git push origin feat/a'",
  "git -C /other push origin feat/a","git push origin feat/a > result"];
 for(const command of accepted)assert.equal(isYoloRoutinePush(command),true,command);
 for(const command of rejected)assert.equal(isYoloRoutinePush(command),false,command);
});
test("Primary Normal still confirms push; YOLO bypasses only scoped push, not data loss",async t=>{
 const cwd=mkdtempSync(join(tmpdir(),"asen-yolo-guard-"));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 let confirmations=0;
 const context:any={cwd,hasUI:true,mode:"tui",ui:{confirm:async()=>{confirmations++;return true;}}};
 const fake=(command:string)=>({toolName:"bash",toolCallId:"id",input:{command}} as any);
 const normal=createPrimaryToolPolicyHandler({getMode:()=> "normal"});
 const yolo=createPrimaryToolPolicyHandler({getMode:()=> "yolo"});
 assert.equal(await normal(fake("git push origin feat/demo"),context),undefined);
 assert.equal(confirmations,1);
 assert.equal(await yolo(fake("git push origin feat/demo"),context),undefined);
 assert.equal(confirmations,1);
 assert.equal(await yolo(fake("git push origin main"),context),undefined);
 assert.equal(confirmations,2);
 assert.equal(await yolo(fake("rm -rf data"),context),undefined);
 assert.equal(confirmations,3,"YOLO must retain destructive approval");
 assert.deepEqual(await yolo(fake("git reset --hard HEAD"),context),{
  block:true,reason:"ASEN primary tool policy blocked destructive shell command",
 });
});
test("Auto cannot approve tools without independent verdict and rejects stale or changed actions",async t=>{
 const cwd=mkdtempSync(join(tmpdir(),"asen-auto-admission-"));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 writeFileSync(join(cwd,"file.txt"),"safe");
 const context:any={cwd,mode:"tui",hasUI:true,ui:{confirm:async()=>true}};
 const event:any={toolName:"read",toolCallId:"original",input:{path:"file.txt"}};
 const failClosed=createPrimaryToolPolicyHandler({getMode:()=> "auto"});
 assert.deepEqual(await failClosed(event,context),{
  block:true,reason:"ASEN primary tool policy blocked Auto independent review is unavailable or denied",
 });
 const allowed=createPrimaryToolPolicyHandler({getMode:()=> "auto",reviewAuto:async()=>true});
 assert.equal(await allowed(event,context),undefined);
 const changed=createPrimaryToolPolicyHandler({getMode:()=> "auto",reviewAuto:async e=>{
  (e.input as {path:string}).path="other-file.txt";return true;
 }});
 const corrupted:any={...event,input:{path:"file.txt"}};
 assert.equal((await changed(corrupted,context) as any).block,true,"Mutated tool arguments invalidate Auto");
 const exceptions=createPrimaryToolPolicyHandler({getMode:()=> "auto",reviewAuto:async()=>{throw Error("offline");}});
 assert.equal((await exceptions(event,context) as any).block,true);
 assert.equal((await allowed({...event,toolName:"asen_session_consult"},context) as any).block,true,
  "Native consent tools cannot be approved by Auto without independent contract");
});
test("ASEN primary commands require live Pi UI and do not grant Auto without an active reviewer",async t=>{
 const home=mkdtempSync(join(tmpdir(),"asen-mode-commands-"));
 t.after(()=>rmSync(home,{recursive:true,force:true}));
 const commands=new Map<string,{handler:(args:string,ctx:unknown)=>Promise<unknown>|unknown}>();
 createAsenExtension({homeDir:()=>home,enableAgentRuntime:false,enableTodoRuntime:false,
  enableMemoryRuntime:false,enableWorkspaceRuntime:false})({
  registerCommand:(name:string,command:any)=>commands.set(name,command),on:()=>{},
 } as any);
 const context:any={cwd:home,mode:"tui",hasUI:true,
  sessionManager:{getSessionId:()=> "session-one"},
  ui:{notify(){}},
 };
 const run=async(name:string,args:string,ctx=context)=>commands.get(name)!.handler(args,ctx);
 assert.equal((await run("asen-mode","status") as any).session,"normal");
 assert.equal((await run("asen-yolo","enable") as any).session,"yolo");
 assert.equal((await run("asen-mode","default yolo") as any).savedDefault,"yolo");
 assert.equal((await run("asen-yolo","disable") as any).session,"normal");
 assert.equal((await run("asen-mode","status") as any).savedDefault,"yolo");
 await assert.rejects(async()=>run("asen-mode","auto"),/independent classifier/);
 await assert.rejects(async()=>run("asen-mode","super-yolo"),/Unsupported/);
 await assert.rejects(async()=>run("asen-yolo","enable",{...context,mode:"rpc"}),/primary Pi TUI/);
 assert.equal((await run("asen-mode","status") as any).session,"normal");
});
