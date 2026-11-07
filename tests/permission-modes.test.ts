import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync,mkdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AsenPermissionSession} from "../src/security/permission-session.js";
import {parsePermissionModeDefault,permissionModeFile,readPermissionModeDefault,savePermissionModeDefault} from "../src/security/permission-mode-policy.js";
import {createPrimaryToolPolicyHandler,isYoloRoutinePush,isYoloRoutineDelivery} from "../src/security/primary-tool-policy.js";
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
 assert.equal(await allowed({...event,toolName:"asen_session_consult"},context),undefined,
  "Native user-consent tools retain their own UI rather than Auto granting consent");
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
 assert.equal((await run("asen-mode","super-yolo") as any).session,"super-yolo");
 assert.equal((await run("asen-yolo","disable") as any).session,"normal");
 await assert.rejects(async()=>run("asen-yolo","enable",{...context,mode:"rpc"}),/primary Pi TUI/);
 assert.equal((await run("asen-mode","status") as any).session,"normal");
});

test("Permission mode defaults cannot be rewritten through model file or shell tools",async t=>{
 const cwd=mkdtempSync(join(tmpdir(),"asen-human-configuration-"));
 t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const pref=permissionModeFile(cwd);
 savePermissionModeDefault(cwd,"normal");
 const context:any={cwd,mode:"tui",hasUI:true,ui:{confirm:async()=>true}};
 const policy=createPrimaryToolPolicyHandler({
  getMode:()=> "yolo",protectedPreferenceFile:pref,
 });
 const call=(toolName:string,input:unknown)=>policy({toolName,toolCallId:"one",input} as any,context);
 const target=join(cwd,".asen","permission-mode.json");
 const result=await call("write",{path:target,content:'{"schema":"asen.permission-mode/v1","mode":"yolo"}'});
 assert.equal((result as any).block,true);
 assert.match((result as any).reason,/human-owned permission configuration/);
 assert.equal((await call("edit",{path:target,oldText:"normal",newText:"yolo"}) as any).block,true);
 const shell=await call("bash",{command:"printf yolo > .asen/permission-mode.json"});
 assert.equal((shell as any).block,true);
 const allowed=await call("write",{path:join(cwd,"ordinary.txt"),content:"ordinary"});
 assert.equal(allowed,undefined,"Independent native execution policy still applies to ordinary files");
 assert.equal(readPermissionModeDefault(cwd).mode,"normal");
});

test("Super YOLO can waive routine guarded prompts but never critical hard denies or private paths",async t=>{
 const cwd=mkdtempSync(join(tmpdir(),"asen-super-guard-"));
 t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const ctx:any={cwd,hasUI:true,mode:"tui",ui:{confirm:async()=>{throw Error("Super must never ask");}}};
 const handler=createPrimaryToolPolicyHandler({getMode:()=> "super-yolo"});
 const run=(command:string)=>handler({toolName:"bash",toolCallId:command,input:{command}} as any,ctx);
 for(const command of ["git push origin feat/demo","npm publish","rm -rf data","psql -c 'DROP TABLE fixture'"])
  assert.equal(await run(command),undefined,command);
 for(const command of ["git reset --hard HEAD","git push --force origin feat/demo",
  "rm -rf /","git branch -D feat/demo"]){
  const result=await run(command);
  assert.equal((result as any)?.block,true,command);
 }
 for(const command of ["cat .env","cat ~/.ssh/id_rsa","cat ~/.ssh/config","cat ~/.aws/credentials","cat secrets/token.txt","cat credentials.pem"]){
  const result=await run(command);
  assert.equal((result as any)?.block,true,command);
  assert.match((result as any).reason,/sensitive shell path/);
 }
});
test("YOLO compound work verifies every segment and never sneaks destructive commands past the guard",async t=>{
 const cwd=mkdtempSync(join(tmpdir(),"asen-compound-yolo-"));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const safe=[
  'git fetch origin main && git rebase origin/main && git push origin feat/demo',
  'git commit -m "fix tests" && git push -u origin fix/atomic',
  'git push origin feat/demo && gh pr create --fill',
 ];
 const unsafe=[
  'git push origin feat/demo && rm -rf data',
  'git push origin feat/demo && git reset --hard HEAD',
  'git push origin feat/demo && npm publish',
  'git push origin main && gh pr create --fill',
  'git push origin feat/demo | sh',
  'git push origin feat/demo && sh -c "rm -rf data"',
  'git push origin feat/demo; gh pr create --fill',
  'git push origin feat/demo && curl https://example.invalid',
  'git push origin feat/demo 2>&1 | tail -5',
 ];
 for(const command of safe)assert.equal(isYoloRoutineDelivery(command),true,command);
 for(const command of unsafe)assert.equal(isYoloRoutineDelivery(command),false,command);
 let confirmations=0;
 const ctx:any={cwd,hasUI:true,mode:"tui",ui:{confirm:async()=>{confirmations++;return true;}}};
 const guard=createPrimaryToolPolicyHandler({getMode:()=> "yolo"});
 for(const command of safe)assert.equal(await guard({toolName:"bash",toolCallId:command,input:{command}} as any,ctx),undefined);
 assert.equal(confirmations,0);
 await guard({toolName:"bash",toolCallId:"data-loss",input:{command:unsafe[0]}} as any,ctx);
 assert.equal(confirmations,1,"Data-loss segment still asks in YOLO");
 assert.equal((await guard({toolName:"bash",toolCallId:"hard",input:{command:unsafe[1]}} as any,ctx) as any).block,true);
});
test("Auto classifier admission validates custom tools and expiry across a same-name mode restart",async t=>{
 const cwd=mkdtempSync(join(tmpdir(),"asen-custom-auto-"));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const controller=new AsenPermissionSession(),owner={getSessionId:()=>"s"};
 const ctx:any={cwd,mode:"tui",hasUI:true,sessionManager:owner,ui:{confirm:async()=>true}};
 assert.equal(controller.set("auto",ctx),true);
 let resolveVerdict!:(value:boolean)=>void;
 const guard=createPrimaryToolPolicyHandler({
  getMode:c=>controller.mode(c),modeEpoch:()=>controller.epoch,
  reviewAuto:()=>new Promise<boolean>(resolve=>{resolveVerdict=resolve;}),
 });
 const event:any={toolName:"some_mcp_tool",toolCallId:"one",input:{id:"a"}};
 const pending=guard(event,ctx);
 await Promise.resolve();
 controller.set("normal",ctx);controller.set("auto",ctx);
 resolveVerdict(true);
 assert.equal((await pending as any).block,true,"The same mode name does not restore a stale approval");
 const nativeConsent=await guard({...event,toolName:"asen_session_consult"},ctx);
 assert.equal(nativeConsent,undefined,"Consent remains owned by its own mandatory UI");
});
test("Explicit mode UI selections and user-global defaults are distinct authorizations",async t=>{
 const home=mkdtempSync(join(tmpdir(),"asen-permission-menu-"));t.after(()=>rmSync(home,{recursive:true,force:true}));
 const commands=new Map<string,{handler:(args:string,ctx:unknown)=>unknown}>();
 createAsenExtension({homeDir:()=>home,enableAgentRuntime:false,enableTodoRuntime:false,
  enableMemoryRuntime:false,enableWorkspaceRuntime:false,autoPermissionReview:async()=>true})({
   registerCommand:(name:string,command:any)=>commands.set(name,command),on:()=>{},
 } as any);
 let selected="Session: super-yolo";
 const indicators:string[]=[];
 const ctx:any={cwd:home,mode:"tui",hasUI:true,sessionManager:{getSessionId:()=>"s"},
  ui:{notify(){},select:async()=>selected,setStatus:(key:string,value:string|undefined)=>indicators.push(`${key}=${value??"NORMAL"}`)},
 };
 const customize=(arg:string)=>commands.get("asen-customize")!.handler(arg,ctx) as Promise<any>;
 assert.equal((await customize("permissions")).session,"super-yolo");
 assert.ok(indicators.includes("asen:host=ASEN │ SUPER-YOLO │ selected ? │ responding ? │ ctx ?"),"elevated mode composes the single asen:host row: "+indicators.join("\n"));
 selected="Default: auto";
 const state=await customize("permissions");
 assert.equal(state.savedDefault,"auto");
 assert.equal(state.session,"super-yolo","Saving a global default never switches the live session");
 selected="Session: normal";
 assert.equal((await customize("permissions")).session,"normal");
 assert.equal(indicators.at(-1),"asen:host=ASEN │ selected ? │ responding ? │ ctx ?","Normal drops the banner segment from the composed row");
 selected="Session: unknown";
 await assert.rejects(()=>customize("permissions"),/unknown choice/);
 const rpc={...ctx,mode:"rpc"};
 await assert.rejects(async()=>commands.get("asen-mode")!.handler("super-yolo",rpc),/primary Pi TUI/);
});

test("A repeated session start cannot reapply an elevated default after explicit Normal",t=>{
 const cwd=mkdtempSync(join(tmpdir(),"asen-default-replay-"));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const manager={getSessionId:()=>"session-one"},ctx={cwd,mode:"tui",hasUI:true,sessionManager:manager};
 const session=new AsenPermissionSession();
 assert.equal(session.initialize("super-yolo",ctx),true);
 assert.equal(session.mode(ctx),"super-yolo");
 assert.equal(session.set("normal",ctx),true);
 assert.equal(session.initialize("super-yolo",ctx),false,"Already bound session cannot inherit default twice");
 assert.equal(session.mode(ctx),"normal");
 const other={...ctx,sessionManager:{getSessionId:()=>"session-two"}};
 assert.equal(session.initialize("yolo",other),true,"Fresh primary session may receive the saved default");
 assert.equal(session.mode(other),"yolo");
});
