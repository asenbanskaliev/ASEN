import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {currentRevision} from "../src/runtime/lifecycle/plan-dispatcher.js";
import {isolatedGitEnvironment} from "../src/runtime/agents/git-isolated-environment.js";
import {classifyAssistantError,shouldFallback} from "../src/runtime/lifecycle/model-fallback-policy.js";

test("El candidato ODD no hereda otro repositorio Git ni acepta una subcarpeta",()=>{
 const base=realpathSync(mkdtempSync(join(tmpdir(),"asen-e1-candidate-")));
 const previous=Object.entries(process.env).filter(([key])=>key.toUpperCase().startsWith("GIT_"));
 try{
  const repo=(name:string)=>{
   const dir=join(base,name);mkdirSync(dir);
   const git=(...args:string[])=>execFileSync("git",["-C",dir,...args],{encoding:"utf8",env:isolatedGitEnvironment(),stdio:["ignore","pipe","pipe"]}).trim();
   git("init","-q");git("config","user.name","ASEN");git("config","user.email","test@example.invalid");
   writeFileSync(join(dir,"a.txt"),name);git("add","a.txt");git("commit","--no-gpg-sign","-qm",name);
   return {dir,sha:git("rev-parse","HEAD")};
  };
  const a=repo("a"),b=repo("b");assert.notEqual(a.sha,b.sha);
  for(const key of Object.keys(process.env))if(key.toUpperCase().startsWith("GIT_"))delete process.env[key];
  process.env.GIT_DIR=join(b.dir,".git");process.env.GIT_WORK_TREE=b.dir;
  assert.equal(currentRevision(a.dir),a.sha);
  assert.equal(currentRevision(b.dir),b.sha);
  const nested=join(a.dir,"nested");mkdirSync(nested);
  assert.throws(()=>currentRevision(nested),/raíz exacta/u);
 }finally{
  for(const key of Object.keys(process.env))if(key.toUpperCase().startsWith("GIT_"))delete process.env[key];
  for(const [key,value] of previous)process.env[key]=value;
  rmSync(base,{recursive:true,force:true});
 }
});

test("Alternativa solo por el fallo HTTP efectivo, no por menciones de otros errores",()=>{
 for(const [code,expected,allow] of [[400,"invalid_request",false],[401,"auth",true],[429,"rate_limit",true],[503,"provider_unavailable",true]] as const){
  const category=classifyAssistantError({stopReason:"error",errorMessage:"HTTP "+code+": descripción que menciona cuota, 429 y autenticación"});
  assert.equal(category,expected);assert.equal(shouldFallback(category),allow);
 }
 assert.equal(classifyAssistantError({stopReason:"error",errorMessage:"rate limit",diagnostics:[{error:{code:400}}]}),"invalid_request");
 assert.equal(classifyAssistantError({stopReason:"aborted",errorMessage:"HTTP 429"}),undefined);
});
