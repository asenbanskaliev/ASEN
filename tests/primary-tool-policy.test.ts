import assert from "node:assert/strict";
import test from "node:test";
import {mkdir,mkdtemp,readFile,rm,symlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createFindToolDefinition,createGrepToolDefinition,createLsToolDefinition} from "@earendil-works/pi-coding-agent";
import {createPrimaryToolPolicyHandler} from "../src/security/primary-tool-policy.js";

const policy=createPrimaryToolPolicyHandler();
const event=(toolName:string,input:Record<string,unknown>,toolCallId="call-1")=>({type:"tool_call",toolCallId,toolName,input}) as any;
const context=(cwd:string,overrides:Record<string,unknown>={})=>({cwd,mode:"rpc",hasUI:true,signal:new AbortController().signal,sessionManager:{getSessionId:()=>"policy-test",getSessionFile:()=>undefined},ui:{confirm:async()=>true},...overrides}) as any;
async function invoke(call:any,ctx:any,execute:()=>Promise<void>|void){const decision=await policy(call,ctx);if(!decision?.block)await execute();return decision;}

// The first three tests are the policy's test-first security rules.
test("sensitive primary file paths are blocked with zero executor or state effects",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-primary-policy-path-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const target=path.join(root,".env.local");await writeFile(target,"before\n");
 let executions=0;const publicState={todos:["todo-1"],agents:["agent-1"],links:["link-1"],workspace:["existing.txt"]},before=structuredClone(publicState);
 const decision=await invoke(event("write",{path:target}),context(root),async()=>{executions++;await writeFile(target,"after\n");publicState.todos.push("changed");});
 assert.equal(decision?.block,true);assert.match(decision?.reason??"",/sensitive path/);assert.equal(executions,0);assert.equal(await readFile(target,"utf8"),"before\n");assert.deepEqual(publicState,before);
});

test("ordinary commands pass without confirmation for exactly the recognized shell tools, including headless",async()=>{
 let confirmations=0,executions=0;const ctx=context("not-a-real-directory",{hasUI:false,ui:{confirm:async()=>{confirmations++;return true;}}});
 for(const toolName of ["bash","bash_background","monitor"]){
  const decision=await invoke(event(toolName,{command:"printf ordinary"},`ordinary-${toolName}`),ctx,()=>{executions++;});
  assert.equal(decision,undefined,toolName);
 }
 assert.equal(confirmations,0);assert.equal(executions,3);
});

test("guarded commands use raw preview metadata and need fresh approval per call",async()=>{
 const prompts:unknown[][]=[];let executions=0;
 const ctx=context(process.cwd(),{ui:{confirm:async(...args:unknown[])=>{prompts.push(args);return true;}}});
 for(const id of ["shell-1","shell-2"]){
  const decision=await invoke(event("bash",{command:"git   push origin main"},id),ctx,()=>{executions++;});
  assert.equal(decision,undefined);
 }
 assert.equal(executions,2);
 assert.deepEqual(prompts,Array(2).fill(["ASEN · Confirm Git push?","git push origin main"]));
});

test("hard denials need no UI and outrank confirmation in nested commands",async()=>{
 let confirmations=0,executions=0;const ctx=context("not-a-real-directory",{hasUI:false,ui:{confirm:async()=>{confirmations++;return true;}}});
 for(const command of ["git push origin main && git reset --hard HEAD","eval 'git branch -D old'","echo `rm -rf /`"]){
  const decision=await invoke(event("monitor",{command}),ctx,()=>{executions++;});
  assert.equal(decision?.block,true,command);assert.match(decision?.reason??"",/destructive shell command/);assert.equal(confirmations,0);assert.equal(executions,0);
 }
});

test("only the approved sensitive names are blocked and ordinary file tools remain unchanged",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-primary-policy-names-")),clean=path.join(root,"ordinary-directory");t.after(()=>rm(root,{recursive:true,force:true}));await Promise.all([mkdir(path.join(root,".git")),mkdir(clean)]);
 for(const name of [".git/config",".env",".env.production","certificate.pem","private.key"]){const decision=await policy(event("read",{path:name}),context(root));assert.equal(decision?.block,true,name);}
 for(const name of [".gitignore","environment","certificate.pem.txt","private-key","ordinary.txt"]){const decision=await policy(event("read",{path:name}),context(root));assert.equal(decision,undefined,name);}
 let executions=0;
 for(const [toolName,input] of [["read",{path:"ordinary.txt"}],["edit",{path:"ordinary.txt"}],["write",{path:"ordinary.txt"}],["grep",{path:clean}],["find",{path:clean}],["ls",{path:clean}]] as const)
  await invoke(event(toolName,input),context(root),()=>{executions++;});
 assert.equal(executions,6);
});

test("canonical resolution blocks a sensitive symlink parent including a nonexistent target",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-primary-policy-link-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const secret=path.join(root,".git"),alias=path.join(root,"public-alias");await mkdir(secret);
 try{await symlink(secret,alias,process.platform==="win32"?"junction":"dir");}catch(error){if((error as NodeJS.ErrnoException).code==="EPERM"){t.skip("symlink creation returned EPERM on this host");return;}throw error;}
 const decision=await policy(event("write",{path:path.join(alias,"new-file")}),context(root));assert.equal(decision?.block,true);assert.match(decision?.reason??"",/sensitive path/);
});

test("malformed and ambiguously unresolvable guarded paths fail closed",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-primary-policy-invalid-"));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const input of [{path:42},{path:"bad\0path"},{}])assert.equal((await policy(event("write",input as any),context(root)))?.block,true);
 if(process.platform!=="win32"){
  const first=path.join(root,"loop-a"),second=path.join(root,"loop-b");await symlink(second,first);await symlink(first,second);
  assert.equal((await policy(event("read",{path:first}),context(root)))?.block,true);
 }
});

test("guarded confirmation decline, cancel and headless contexts block with zero execution",async t=>{
 const cases=[
  {name:"decline",overrides:{ui:{confirm:async()=>false}}},
  {name:"cancel",overrides:{ui:{confirm:async()=>undefined}}},
  {name:"headless",overrides:{hasUI:false,ui:{}}},
 ];
 for(const item of cases)await t.test(item.name,async()=>{
  let executions=0;const decision=await invoke(event("bash",{command:"npm publish"},`case-${item.name}`),context(process.cwd(),item.overrides),()=>{executions++;});
  assert.equal(decision?.block,true);assert.match(decision?.reason??"",item.name==="headless"?/requires interactive confirmation/:/was not confirmed/);assert.equal(executions,0);
 });
});

test("background executable and argv use the primary shell admission policy",async t=>{
 let executions=0,confirmations=0;
 const ctx=context(process.cwd(),{ui:{confirm:async()=>{confirmations++;return false;}}});
 const deniedPush=await invoke(event("asen_background_start",{command:"git push origin main"}),ctx,()=>{executions++;});
 assert.equal(deniedPush?.block,true,"unapproved git push must not spawn");
 assert.equal(executions,0);
 assert.equal(confirmations,1,"guarded push requires fresh human approval");
 const destructive=await invoke(event("asen_background_start",{command:"rm -rf /"}),ctx,()=>{executions++;});
 assert.equal(destructive?.block,true,"hard-denied argv must not spawn");
 assert.equal(executions,0);
 const malformed=await policy(event("asen_background_start",{command:"git push",args:["origin"]}),ctx);
 assert.equal(malformed?.block,true);
});

test("a guarded confirmation promise error is thrown so the host fails closed",async()=>{
 let executions=0;const failure=new Error("dialog failed"),ctx=context(process.cwd(),{ui:{confirm:async()=>{throw failure;}}});
 await assert.rejects(()=>invoke(event("bash",{command:"git rebase main"}),ctx,()=>{executions++;}),error=>error===failure);
 assert.equal(executions,0);
});

test("installed traversal tools disclose no protected descendant for explicit or default parent paths",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-primary-policy-traversal-"));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,"ordinary.txt"),"ordinary marker\n");await writeFile(path.join(root,".env.probe"),"protected marker\n");
 const tools=[
  createGrepToolDefinition(root),
  createFindToolDefinition(root,{operations:{exists:async()=>true,glob:async()=>[path.join(root,".env.probe")]}}),
  createLsToolDefinition(root),
 ];
 let executions=0;
 for(const tool of tools)for(const suppliedPath of [root,undefined]){
  const input=tool.name==="grep"?{pattern:"protected marker",...(suppliedPath?{path:suppliedPath}:{})}:tool.name==="find"?{pattern:"*",...(suppliedPath?{path:suppliedPath}:{})}:{...(suppliedPath?{path:suppliedPath}:{})};
  const decision=await policy(event(tool.name,input),context(root));let disclosure="";
  if(!decision?.block){executions++;const result=await tool.execute(`traversal-${tool.name}`,input as any,new AbortController().signal,undefined,context(root));disclosure=result.content.map(item=>item.type==="text"?item.text:"").join("\n");}
  assert.equal(decision?.block,true,`${tool.name} ${suppliedPath?"explicit":"default"} parent must be denied`);assert.doesNotMatch(disclosure,/\.env\.probe|protected marker/);
 }
 assert.equal(executions,0);
});

test("Pi 1.2 public grep cannot execute against a parent containing protected .git content",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-primary-policy-git-traversal-")),git=path.join(root,".git"),marker="private-git-marker-01a14602";t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(git);await writeFile(path.join(git,"private-marker"),`${marker}\n`);await writeFile(path.join(root,"ordinary.txt"),"ordinary marker\n");
 const grep=createGrepToolDefinition(root),cases=[
  {name:"explicit parent",input:{pattern:marker,path:root,literal:true}},
  {name:"default parent",input:{pattern:marker,literal:true}},
  {name:"explicit glob",input:{pattern:marker,path:root,glob:"**/*",literal:true}},
 ];
 for(const item of cases)await t.test(item.name,async()=>{
  let executions=0,disclosure="";const call=event("grep",item.input,`git-traversal-${item.name}`),decision=await policy(call,context(root));
  if(!decision?.block){executions++;const result=await grep.execute(call.toolCallId,call.input as any,new AbortController().signal,undefined,context(root));disclosure=result.content.map(entry=>entry.type==="text"?entry.text:"").join("\n");}
  assert.equal(executions,0,`${item.name} executed and disclosed: ${disclosure}`);assert.equal(decision?.block,true);assert.doesNotMatch(disclosure,new RegExp(marker));
 });
});

test("shell selection matches Normal mode and malformed recognized shell input passes through",async()=>{
 const ctx=context(process.cwd(),{hasUI:false,ui:{}});
 for(const toolName of ["powershell","pwsh","Bash","bash-background","custom_shell"]){
  assert.equal(await policy(event(toolName,{command:"git reset --hard HEAD"}),ctx),undefined,toolName);
 }
 for(const toolName of ["bash","bash_background","monitor"]){
  for(const input of [undefined,null,[],{}, {command:42}])assert.equal(await policy(event(toolName,input as any),ctx),undefined,`${toolName} ${String(input)}`);
 }
});

test("unknown custom tools are outside this narrow primary policy",async()=>{
 assert.equal(await policy(event("custom_extension_tool",{path:".env"}),context(process.cwd())),undefined);
});
