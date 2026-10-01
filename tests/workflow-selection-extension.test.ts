import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {createAsenExtension} from "../extensions/asen.js";
import type {WorkflowSelectionChoice,WorkflowSelectionConsumer} from "../src/lifecycle/workflow-selection.js";

type Context={cwd:string;ui:{notify(message:string,level:"info"|"error"):void}};
type Command={handler:(args:string|undefined,ctx:Context)=>unknown};
function registration(){
 const commands=new Map<string,Command>();
 const consumer=createAsenExtension()({registerCommand:(name,command)=>{assert.ok(!commands.has(name));commands.set(name,command as Command);}});
 return {commands,consumer};
}
function context(cwd:string){const notifications:Array<{message:string;level:"info"|"error"}>=[];return {ctx:{cwd,ui:{notify:(message:string,level:"info"|"error")=>notifications.push({message,level})}},notifications};}
async function project(){return fs.mkdtemp(path.join(os.tmpdir(),"asen-workflow-selection-"));}
async function select(command:Command,cwd:string,task="GSP-05I1-A"){return command.handler(`sdd ${task}`,context(cwd).ctx) as Promise<WorkflowSelectionChoice>;}
function claim(consumer:WorkflowSelectionConsumer,choice:unknown,task:string,repository:string){return consumer.claim(choice,{taskIdentity:task,repositoryIdentity:repository});}

await test("registered Pi handler issues one exact, deeply immutable task/repository choice",async()=>{
 const root=await project();
 const {commands,consumer}=registration();assert.deepEqual([...commands.keys()],["asen","asen-skill-registry","asen-workflow"]);
 const command=commands.get("asen-workflow")!,observed=context(path.join(root,".","nested",".."));await fs.mkdir(path.join(root,"nested"));
 const choice=await command.handler("sdd GSP-05I1-A",observed.ctx) as WorkflowSelectionChoice,repository=await fs.realpath(root);
 assert.deepEqual(choice,{workflow:"sdd",source:"pi-command",taskIdentity:"GSP-05I1-A",repositoryIdentity:repository});
 assert.ok(Object.isFrozen(choice));assert.equal(consumer.read({taskIdentity:"GSP-05I1-A",repositoryIdentity:repository}),choice);
 assert.equal(claim(consumer,choice,"GSP-05I1-A",repository),choice);assert.equal(consumer.read({taskIdentity:"GSP-05I1-A",repositoryIdentity:repository}),undefined);
 assert.deepEqual(observed.notifications,[{message:"SDD workflow selected for task GSP-05I1-A.",level:"info"}]);
});

await test("invalid, ambiguous, extra, control, and noncanonical arguments issue nothing",async()=>{
 const root=await project(),{commands,consumer}=registration(),command=commands.get("asen-workflow")!,repository=await fs.realpath(root);
 for(const args of [undefined,"","sdd","sdd ","SDD task","organic task","sdd task extra","sdd\ttask"," sdd task","sdd task ","sdd ../task","sdd .","sdd task/name","sdd tést","sdd task\u0000id",`sdd ${"a".repeat(129)}`]){
  const observed=context(root);assert.equal(await command.handler(args,observed.ctx),"Usage: /asen-workflow sdd <task-id>");
  assert.deepEqual(observed.notifications,[{message:"Usage: /asen-workflow sdd <task-id>",level:"info"}]);
 }
 assert.equal(consumer.read({taskIdentity:"task",repositoryIdentity:repository}),undefined);
});

await test("pending duplicates fail closed without overwrite, source substitution, or side effects",async()=>{
 const root=await project(),{commands,consumer}=registration(),command=commands.get("asen-workflow")!,repository=await fs.realpath(root),first=await select(command,root,"task-1");
 await assert.rejects(select(command,root,"task-1"),/pending/);assert.equal(consumer.read({taskIdentity:"task-1",repositoryIdentity:repository}),first);
 const other=await select(command,root,"task-2");assert.equal(other.source,"pi-command");
 assert.equal("phase" in other||"write" in other||"review" in other||"delivery" in other||"authority" in other,false);
 assert.deepEqual(Reflect.ownKeys(other),["workflow","source","taskIdentity","repositoryIdentity"]);
});

await test("repository identity requires an existing real path",async()=>{
 const root=await project(),missing=path.join(root,"missing"),{commands,consumer}=registration(),command=commands.get("asen-workflow")!;
 await assert.rejects(select(command,missing,"missing-task"));
 assert.equal(consumer.read({taskIdentity:"missing-task",repositoryIdentity:path.resolve(missing)}),undefined);
});

await test("claims reject clones and burn genuine first mismatch or malformed attempts",async()=>{
 const root=await project(),repository=await fs.realpath(root),{commands,consumer}=registration(),command=commands.get("asen-workflow")!;
 const cloned=await select(command,root,"clone");assert.throws(()=>claim(consumer,structuredClone(cloned),"clone",repository),/genuine/);assert.equal(claim(consumer,cloned,"clone",repository),cloned);assert.throws(()=>claim(consumer,cloned,"clone",repository),/genuine|used/);
 const wrongTask=await select(command,root,"wrong-task");assert.throws(()=>claim(consumer,wrongTask,"other",repository),/mismatch/);assert.throws(()=>claim(consumer,wrongTask,"wrong-task",repository),/genuine|used/);
 const wrongRepo=await select(command,root,"wrong-repo");assert.throws(()=>claim(consumer,wrongRepo,"wrong-repo",path.join(repository,"other")),/mismatch/);assert.throws(()=>claim(consumer,wrongRepo,"wrong-repo",repository),/genuine|used/);
 const malformed=await select(command,root,"malformed");assert.throws(()=>consumer.claim(malformed,{taskIdentity:"malformed"} as never),/binding/);assert.throws(()=>claim(consumer,malformed,"malformed",repository),/genuine|used/);
});

await test("live extension registrations are independent and do not mint on import, registration, or status",async()=>{
 const root=await project(),repository=await fs.realpath(root),one=registration(),two=registration();
 assert.equal(one.consumer.read({taskIdentity:"same",repositoryIdentity:repository}),undefined);assert.equal(two.consumer.read({taskIdentity:"same",repositoryIdentity:repository}),undefined);
 await one.commands.get("asen")!.handler(undefined,context(root).ctx);assert.equal(one.consumer.read({taskIdentity:"same",repositoryIdentity:repository}),undefined);
 const choice=await select(one.commands.get("asen-workflow")!,root,"same");assert.throws(()=>claim(two.consumer,choice,"same",repository),/genuine/);assert.equal(claim(one.consumer,choice,"same",repository),choice);
 const independent=await select(two.commands.get("asen-workflow")!,root,"same");assert.equal(claim(two.consumer,independent,"same",repository),independent);
});
