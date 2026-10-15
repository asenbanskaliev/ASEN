import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {mkdtemp,readFile,readdir,realpath,rm,stat,writeFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {sameWorkspaceIdentityPath} from "../src/runtime/workspace-store.js";

test("project-scoped Todo migration splits the legacy file, verifies shards and keeps a backup",async t=>{
 const home=await mkdtemp(path.join(process.cwd(),".tmp-todo-migration-"));t.after(()=>rm(home,{recursive:true,force:true}));
 const legacy=path.join(home,".asen","todos.json"),root=path.join(home,".asen","todos"),old=await SessionTodoStore.open(legacy),a={sessionId:"session-a",projectId:path.join(home,"project-a")},b={sessionId:"session-b",projectId:path.join(home,"project-b")};
 const one=await old.add("Project A task",a),two=await old.add("Project B task",b);await old.update(one.taskId,a,1,"running");
 const store=await SessionTodoStore.openProjectScoped(root,legacy),migratedA=await store.list(a),migratedB=await store.list(b);
 assert.deepEqual(migratedA.map(item=>[item.title,item.current.state]),[["Project A task","running"]]);assert.deepEqual(migratedB.map(item=>[item.title,item.current.state]),[["Project B task","planned"]]);
 const backup=await readFile(`${legacy}.migrated-v1`,"utf8");assert.equal(JSON.parse(backup).items.length,2);await assert.rejects(()=>stat(legacy),{code:"ENOENT"});
 const expectedA=createHash("sha256").update(process.platform==="win32"?a.projectId.toLowerCase():a.projectId).digest("hex");assert.ok((await readdir(path.join(root,"projects"))).includes(expectedA));
 const reopened=await SessionTodoStore.openProjectScoped(root,legacy);assert.equal((await reopened.list(a))[0]?.taskId,one.taskId);assert.equal((await reopened.list(b))[0]?.taskId,two.taskId);
});

test("project-scoped Todo reads the same Windows shard through extended-length path aliases",async t=>{
 if(process.platform!=="win32"){t.skip("Windows path alias contract");return;}
 const home=await mkdtemp(path.join(process.cwd(),".tmp-todo-win-alias-"));t.after(()=>rm(home,{recursive:true,force:true}));
 const project=await realpath(home),alias=path.toNamespacedPath(project),identity={sessionId:"windows-alias-session",projectId:project};
 assert.ok(sameWorkspaceIdentityPath(project,alias));
 const store=await SessionTodoStore.openProjectScoped(path.join(home,".asen","todos"),path.join(home,".asen","todos.json"));
 const task=await store.add("Windows alias task",identity);
 assert.equal((await store.list({...identity,projectId:alias}))[0]?.taskId,task.taskId);
});

test("project-scoped Todo store archives a completed project batch and exposes it only on history request",async t=>{
 const home=await mkdtemp(path.join(process.cwd(),".tmp-todo-archive-"));t.after(()=>rm(home,{recursive:true,force:true}));
 const project=await realpath(home),identity={sessionId:"archive-session",projectId:project},root=path.join(home,".asen","todos"),store=await SessionTodoStore.openProjectScoped(root,path.join(home,".asen","todos.json"));
 const plan=[
  {title:"Inspect changes",requestId:"asen-plan:archive:explorer",dependsOn:[],description:"Review the requested files",plan:{role:"primary" as const,skillPaths:[]}},
  {title:"Verify changes",requestId:"asen-plan:archive:verifier",dependsOn:["asen-plan:archive:explorer"],description:"Verify the accepted result",plan:{role:"primary" as const,skillPaths:[]}},
 ];
 const tasks=await store.addPlan(plan,identity);await store.update(tasks[0]!.taskId,identity,1,"running");await store.update(tasks[0]!.taskId,identity,2,"done","verified");
 assert.equal((await store.list(identity)).length,2,"keep the batch active while a dependent task remains");
 await store.update(tasks[1]!.taskId,identity,1,"running");await store.update(tasks[1]!.taskId,identity,2,"done","verified independently");
 assert.deepEqual(await store.list(identity),[]);const archived=await store.archived(identity);assert.deepEqual(archived.map(item=>item.taskId),tasks.map(item=>item.taskId));
 assert.deepEqual((await store.history(tasks[1]!.taskId,identity)).map(event=>event.state),["planned","running","done"]);
 const retry=await store.addPlan(plan,identity);assert.deepEqual(retry.map(item=>item.taskId),tasks.map(item=>item.taskId),"archived request IDs remain idempotent");
 const projectDir=path.join(root,"projects",createHash("sha256").update(process.platform==="win32"?project.toLowerCase():project).digest("hex"));assert.equal((await readdir(path.join(projectDir,"archive"))).filter(name=>name.endsWith(".json")).length,1);
});

test("project-scoped Todo recovers an interrupted archive transaction without replaying completed work",async t=>{
 const home=await mkdtemp(path.join(process.cwd(),".tmp-todo-archive-recovery-"));t.after(()=>rm(home,{recursive:true,force:true}));
 const project=await realpath(home),identity={sessionId:"archive-recovery-session",projectId:project},root=path.join(home,".asen","todos"),store=await SessionTodoStore.openProjectScoped(root,path.join(home,".asen","todos.json")),task=await store.add("Completed before interruption",identity);
 await store.update(task.taskId,identity,1,"running");await store.update(task.taskId,identity,2,"done","verified");
 const projectDir=path.join(root,"projects",createHash("sha256").update(process.platform==="win32"?project.toLowerCase():project).digest("hex")),archiveDir=path.join(projectDir,"archive"),archiveName=(await readdir(archiveDir))[0]!,archiveFile=path.join(archiveDir,archiveName),archiveRaw=await readFile(archiveFile,"utf8"),snapshot=JSON.parse(archiveRaw),activeFile=path.join(projectDir,"active.json");
 await writeFile(activeFile,archiveRaw);await writeFile(`${activeFile}.archive-pending.json`,JSON.stringify({schema:"asen.todo-archive-transaction/v1",archiveFile:archiveName,sha256:createHash("sha256").update(archiveRaw).digest("hex"),revision:snapshot.revision}));
 const recovered=await SessionTodoStore.openProjectScoped(root,path.join(home,".asen","todos.json"));await recovered.recover(identity);
 assert.deepEqual(await recovered.list(identity),[]);assert.equal((await recovered.archived(identity))[0]?.current.state,"done");await assert.rejects(()=>stat(`${activeFile}.archive-pending.json`),{code:"ENOENT"});
});
