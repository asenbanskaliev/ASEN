import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtemp,mkdir,writeFile,rm,realpath,readdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {isolatedGitEnvironment} from "../src/runtime/agents/git-isolated-environment.js";
import {captureNativeWriterBaseline,captureNativeWriterCompletion,captureNativeWriterCompletionAsync,bindNativeRunnerModels} from "../src/runtime/agents/native-writer-completion.js";

test("Inventario ignorado superior a 1 MB no bloquea un Writer ajeno a esos archivos",async()=>{
 const project=await realpath(await mkdtemp(join(tmpdir(),"asen-inv-")));
 const git=(...args:string[])=>execFileSync("git",["-C",project,...args],{encoding:"utf8",env:isolatedGitEnvironment(),stdio:["ignore","pipe","pipe"]}).trim();
 try{
  git("init","-q");git("config","user.name","ASEN");git("config","user.email","test@example.invalid");
  await writeFile(join(project,".gitignore"),"dependencias/\n*.cache\n");
  git("add",".gitignore");git("commit","--no-gpg-sign","-qm","base");
  await mkdir(join(project,"dependencias"));
  // Rutas relativamente cortas para Windows, con inventario mayor que el límite anterior.
  for(let group=0;group<100;group++){
   const dir=join(project,"dependencias","d"+String(group).padStart(3,"0")+"x".repeat(90));
   await mkdir(dir);
   await Promise.all(Array.from({length:100},(_,i)=>writeFile(join(dir,"f"+String(i).padStart(3,"0")+".cache"),"")));
  }
  const request={id:"unit-"+"a".repeat(40)+":worker",role:"worker" as const,repository:project,prompt:"Prueba",
   candidate:{id:"fixture",repository:project,revision:git("rev-parse","HEAD"),createdAt:new Date().toISOString()},writeSurfaces:["nuevo.cache"]};
  const baseline=await captureNativeWriterBaseline(request);
  assert.equal(baseline.length,10000);
  assert.ok(Buffer.byteLength(baseline.join("\0"),"utf8")>1_000_000);
  await writeFile(join(project,"nuevo.cache"),"nuevo resultado");
  const result={};bindNativeRunnerModels(result,["prueba/modelo"]);
  const completion=captureNativeWriterCompletion(request,result,baseline);
  assert.deepEqual(completion?.paths,["nuevo.cache"]);
  assert.equal(git("show",completion!.candidateTree+":nuevo.cache"),"nuevo resultado");
  const asyncResult=await captureNativeWriterCompletionAsync(request,result,baseline,new AbortController().signal);
  assert.deepEqual(asyncResult?.paths,["nuevo.cache"]);
  assert.equal(asyncResult?.candidateTree,completion?.candidateTree);
  // El directorio temporal pertenece al padre incluso cuando se cancela el hilo.
  const temp=await mkdtemp(join(tmpdir(),"asen-inv-cancel-"));
  const envKeys=["TMPDIR","TMP","TEMP"] as const;
  const saved=envKeys.map(key=>process.env[key]);
  try{
   for(const key of envKeys)process.env[key]=temp;
   const controller=new AbortController();
   const pending=captureNativeWriterCompletionAsync(request,result,baseline,controller.signal);
   controller.abort();
   assert.equal(await pending,undefined);
   assert.deepEqual(await readdir(temp),[]);
   const completed=await captureNativeWriterCompletionAsync(request,result,baseline,new AbortController().signal);
   assert.equal(completed?.candidateTree,completion?.candidateTree);
   assert.deepEqual(await readdir(temp),[]);
  }finally{
   envKeys.forEach((key,i)=>{const value=saved[i];if(value===undefined)delete process.env[key];else process.env[key]=value;});
   await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
  await assert.rejects(()=>captureNativeWriterBaseline({...request,writeSurfaces:[baseline[0]!]}),/ignorados preexistentes/u);
  await writeFile(join(project,"ajeno.cache"),"fuera del ámbito");
  assert.throws(()=>captureNativeWriterCompletion(request,result,baseline));
 }finally{await rm(project,{recursive:true,force:true});}
});
