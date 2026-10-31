import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {PersistentWorkspaceStore} from "../src/runtime/workspace-store.js";

async function fixture(t:test.TestContext,options:{recordedWorktree?:(root:string)=>string}={}){
 const home=mkdtempSync(join(tmpdir(),"asen-workspace-command-"));
 t.after(()=>rmSync(home,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 const requested=join(home,"project");mkdirSync(requested);const root=realpathSync.native(requested);
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","ASEN acceptance");git("config","user.email","acceptance@example.invalid");
 writeFileSync(join(root,"shared.txt"),"original\n");git("add","shared.txt");git("commit","-qm","baseline");
 const file=join(home,".asen","workspace.json"),store=await PersistentWorkspaceStore.open(file);
 const entry={path:"shared.txt",sessionId:"s1",projectId:root,worktree:options.recordedWorktree?.(root)??root,operation:"modify" as const,at:new Date().toISOString()};
 await store.append({...entry,actor:{kind:"agent",id:"first"}});
 await store.append({...entry,actor:{kind:"user",id:"second"}});
 const commands=new Map<string,{handler:(args:string,context:unknown)=>Promise<unknown>}>();
 createAsenExtension({homeDir:()=>home,enableWorkspaceRuntime:true,workspaceStoreFactory:async()=>store})({
  registerCommand:(name:string,cmd:any)=>commands.set(name,cmd),
  on:()=>{}
 } as any);
 return {root,store,git,command:commands.get("asen-changes")!};
}
test("public Pi changes action confirms and edits one recorded conflict without committing",async t=>{
 const f=await fixture(t);let selected=0,edited=0,approved=0;
 const context={
  cwd:f.root,hasUI:true,sessionManager:{getSessionId:()=>"s1"},
  ui:{
   select:async(_:string,choices:string[])=>{selected++;assert.deepEqual(choices,["shared.txt"]);return "shared.txt";},
   editor:async(_:string,previous:string)=>{edited++;assert.equal(previous,"original\n");return "resolved\n";},
   confirm:async()=>{approved++;return true;},
   notify:()=>{}
  }
 };
 const result=await f.command.handler("resolve",context) as string[];
 assert.match(result.join("\n"),/Archivo corregido/);
 assert.deepEqual([selected,edited,approved],[1,1,1]);
 assert.equal(readFileSync(join(f.root,"shared.txt"),"utf8"),"resolved\n");
 assert.match(f.git("status","--porcelain"),/shared.txt/);
 assert.equal(f.git("log","-1","--pretty=%s"),"baseline","the UI must not publish a commit");
 const history=await f.store.list({sessionId:"s1",projectId:f.root,worktree:f.root});
 assert.equal(history.at(-1)?.change.actor.kind,"user");
});
test("public Pi changes action refuses a different selection or declined consent without writes",async t=>{
 const f=await fixture(t),file=join(f.root,"shared.txt");
 let approved=0;
 const base={cwd:f.root,hasUI:true,sessionManager:{getSessionId:()=>"s1"}};
 const wrong=await f.command.handler("resolve",{...base,ui:{
  select:async()=>"other.txt",editor:async()=>{throw Error("must not edit");},
  confirm:async()=>{approved++;return true;},notify:()=>{}
 }}) as string[];
 assert.match(wrong.join("\n"),/selección no coincide/i);
 assert.equal(readFileSync(file,"utf8"),"original\n");
 const declined=await f.command.handler("resolve",{...base,ui:{
  select:async()=>"shared.txt",editor:async()=>"declined\n",
  confirm:async()=>{approved++;return false;},notify:()=>{}
 }}) as string[];
 assert.match(declined.join("\n"),/no autorizada/i);
 assert.equal(approved,1);
 assert.equal(readFileSync(file,"utf8"),"original\n");
});

test("native Windows Pi correction recognizes a recorded worktree with equivalent casing",async t=>{
 if(process.platform!=="win32"){t.skip("Windows path-identity regression");return;}
 const f=await fixture(t,{recordedWorktree:root=>root.toUpperCase()});
 let selected=false;
 const result=await f.command.handler("resolve",{
  cwd:f.root,hasUI:true,sessionManager:{getSessionId:()=>"s1"},
  ui:{
   select:async(_prompt:string,choices:string[])=>{selected=true;assert.deepEqual(choices,["shared.txt"]);return undefined;},
   editor:async()=>{throw Error("Cancelled selection must not open editor");},
   confirm:async()=>{throw Error("Cancelled selection must not ask approval");},
   notify:()=>{},
  },
 }) as string[];
 assert.equal(selected,true,"a Win32 path alias must not hide a valid same-project conflict");
 assert.match(result.join("\n"),/cancelada/i);
 assert.equal(readFileSync(join(f.root,"shared.txt"),"utf8"),"original\n");
});

test("native Windows Pi final authorization accepts an equivalent real worktree spelling",async t=>{
 if(process.platform!=="win32"){t.skip("Native Windows path equivalence");return;}
 const f=await fixture(t,{recordedWorktree:root=>root.toUpperCase()});
 let approvals=0;
 const result=await f.command.handler("resolve",{
  cwd:f.root,hasUI:true,sessionManager:{getSessionId:()=>"s1"},
  ui:{
   select:async(_prompt:string,choices:string[])=>{assert.deepEqual(choices,["shared.txt"]);return "shared.txt";},
   editor:async(_prompt:string,content:string)=>{assert.equal(content,"original\n");return "win32 accepted\n";},
   confirm:async()=>{approvals++;return true;},
   notify:()=>{},
  },
 }) as string[];
 assert.equal(approvals,1);
 assert.match(result.join("\n"),/Archivo corregido con autorización de un uso/i);
 assert.equal(readFileSync(join(f.root,"shared.txt"),"utf8"),"win32 accepted\n");
 assert.match(f.git("status","--porcelain"),/shared\\.txt/);
});
