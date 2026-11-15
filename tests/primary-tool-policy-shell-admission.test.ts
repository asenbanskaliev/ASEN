import assert from "node:assert/strict";
import test from "node:test";
import {createPrimaryToolPolicyHandler} from "../src/security/primary-tool-policy.js";

const event=(toolName:string,input:unknown,toolCallId="call-1")=>({type:"tool_call",toolCallId,toolName,input}) as any;
const context=(cwd:string,overrides:Record<string,unknown>={})=>({cwd,mode:"rpc",hasUI:false,signal:new AbortController().signal,sessionManager:{getSessionId:()=>"shell-admission-test",getSessionFile:()=>undefined},ui:{confirm:async()=>false},...overrides}) as any;
const policyFor=(mode:string)=>createPrimaryToolPolicyHandler({getMode:()=>mode as any});

// A shell call with no usable command string can never be classified, so it can
// never be admitted. Fail-closed must hold in EVERY permission mode, including
// the modes that carry no automatic reviewer at all.
test("a shell call without a string command is denied in every permission mode",async()=>{
 for(const mode of ["normal","auto","yolo","super-yolo"]){
  const policy=policyFor(mode);
  for(const [label,input] of [["missing",{}],["number",{command:42}],["null",{command:null}],["object",{command:{}}]] as const){
   const decision=await policy(event("bash",input,`malformed-${mode}-${label}`),context(process.cwd()));
   assert.equal(decision?.block,true,`${mode}/${label}`);
   assert.match(decision?.reason??"",/malformed shell command/,`${mode}/${label}`);
  }
 }
});

test("a shell call whose input is not an object is denied instead of allowed",async()=>{
 const policy=policyFor("normal");
 for(const [label,input] of [["null",null],["array",[]],["string","printf ordinary"]] as const){
  const decision=await policy(event("bash",input,`shape-${label}`),context(process.cwd()));
  assert.equal(decision?.block,true,label);
  assert.match(decision?.reason??"",/malformed shell command/,label);
 }
});

// pi exposes `powershell` as a first-class shell tool. A shell tool that is not
// admitted to the shell policy silently skips every destructive-command,
// delivery, conflict-marker and permission-configuration check.
test("powershell is admitted to the same shell policy as bash",async()=>{
 const policy=policyFor("normal");
 for(const toolName of ["bash","powershell"]){
  const decision=await policy(event(toolName,{command:"git push origin main && git reset --hard HEAD"},`parity-${toolName}`),context(process.cwd()));
  assert.equal(decision?.block,true,toolName);
  assert.match(decision?.reason??"",/destructive shell command/,toolName);
 }
});

test("no shell tool can rewrite the human-owned permission configuration",async()=>{
 for(const toolName of ["bash","bash_background","monitor","powershell"]){
  for(const mode of ["normal","auto","yolo","super-yolo"]){
   const decision=await policyFor(mode)(event(toolName,{command:"Set-Content .asen/permission-mode.json yolo"},`permcfg-${toolName}-${mode}`),context(process.cwd()));
   assert.equal(decision?.block,true,`${toolName}/${mode}`);
   assert.match(decision?.reason??"",/human-owned permission configuration/,`${toolName}/${mode}`);
  }
 }
});

test("recognized shell tools still pass an ordinary command without confirmation",async()=>{
 let confirmations=0;const ctx=context("not-a-real-directory",{ui:{confirm:async()=>{confirmations++;return true;}}});
 for(const toolName of ["bash","bash_background","monitor","powershell"]){
  const decision=await policyFor("normal")(event(toolName,{command:"printf ordinary"},`ordinary-${toolName}`),ctx);
  assert.equal(decision,undefined,toolName);
 }
 assert.equal(confirmations,0);
});
