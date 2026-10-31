import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";

const [sourceRootArg,evidenceDirArg,expectedSourceSha,expectedAsenSha,expectedAsenTree]=process.argv.slice(2);
if(!sourceRootArg||!evidenceDirArg||!expectedSourceSha||!expectedAsenSha||!expectedAsenTree)throw new Error("Usage: node --import tsx scripts/eco01-todo-pair.mjs <frozen-source-root> <evidence-dir> <source-sha> <asen-sha> <asen-tree>");
const sourceRoot=resolve(sourceRootArg),evidenceDir=resolve(evidenceDirArg),asenRoot=process.cwd();
const hash=value=>createHash("sha256").update(value).digest("hex");
const sourceInventory=JSON.parse(await readFile(join(asenRoot,"registry/parity/ecosystem-sources-v1.json"),"utf8"));
const sourceRow=sourceInventory.files.find(row=>row.id==="ECO-SRC-91b70c5973297fbd");
if(!sourceRow)throw new Error("Todo source inventory edge is missing");
const sourceSha=execFileSync("git",["-C",sourceRoot,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
const asenTree=execFileSync("git",["rev-parse","HEAD^{tree}"],{cwd:asenRoot,encoding:"utf8"}).trim();
if(sourceSha!==expectedSourceSha)throw new Error(`Frozen source SHA mismatch: ${sourceSha}`);
if(asenTree!==expectedAsenTree)throw new Error(`ASEN tree mismatch: ${asenTree}`);
const source=await import(pathToFileURL(join(sourceRoot,"lib/shell-todo.ts")));
const asen=await import(pathToFileURL(join(asenRoot,"src/runtime/todo-store.ts")));
const {SessionTodoStore}=asen;
const sourceFileSha=hash(await readFile(join(sourceRoot,sourceRow.path)));
if(sourceFileSha!==sourceRow.sha256||sourceFileSha!=="db4bcc80b9e41a23a37285e4dd31de67a496a72fef16aa7711cd601daec0b25d")throw new Error("Todo source file digest mismatch");
const sourcePiTui=JSON.parse(await readFile(join(sourceRoot,"node_modules/@earendil-works/pi-tui/package.json"),"utf8")).version;
const asenPiTui=JSON.parse(await readFile(join(asenRoot,"node_modules/@earendil-works/pi-tui/package.json"),"utf8")).version;
const out=[];
const run=async(name,fn)=>{const observation=await fn();const serialized=JSON.stringify(observation,null,2)+"\n";const file=`${name}.json`;await writeFile(join(evidenceDir,file),serialized);out.push({scenario:name,file,sha256:hash(serialized),observation});};
await mkdir(evidenceDir,{recursive:true});

await run("normal",async()=>{
 let sourceState=source.emptyTodo();
 const sourceAdded=source.applyTodo(sourceState,{action:"add",title:"Review parser"},1);sourceState=sourceAdded.state;
 const sourceUpdated=source.applyTodo(sourceState,{action:"update",id:1,status:"in_progress",note:"checking"},2);sourceState=sourceUpdated.state;
 const sourceReplay=source.replayTodo([{type:"message",message:{role:"toolResult",toolName:"todo",details:{[source.TODO_DETAILS_KEY]:sourceUpdated.state}}}]);
 const dir=join(evidenceDir,"runtime-normal"),file=join(dir,"todos.json");await mkdir(dir,{recursive:true});
 const store=await SessionTodoStore.open(file),context={sessionId:"eco01-normal",projectId:"/eco01-project"};
 const item=await store.add("Review parser",context,undefined,undefined,"eco01-normal-request");
 const updated=await store.update(item.taskId,context,item.events.at(-1).revision,"running","checking");
 const rows=await store.list(context),bytes=await readFile(file),fileHash=hash(bytes);
 return {classification:"UNVERIFIED",reason:"The shared task intent is observable, but exact state and persistence mappings require an accepted contract crosswalk.",source:{input:[{action:"add",title:"Review parser"},{action:"update",id:1,status:"in_progress",note:"checking"}],addResult:sourceAdded.text,updateResult:sourceUpdated.text,state:sourceUpdated.state,replayedState:sourceReplay},asen:{input:[{method:"add",title:"Review parser",requestId:"eco01-normal-request"},{method:"update",state:"running",reason:"checking"}],taskId:item.taskId,updateRevision:updated.events.at(-1).revision,rows,storeFileSha256:fileHash,storeBytes:bytes.length},difference:{sourceState:"in_progress",asenState:rows[0]?.current.state,sourceIdentity:"integer task id",asenIdentity:"opaque task id plus session/project/revision"}};
});

await run("invalid-input",async()=>{
 const sourceResult=source.applyTodo(source.emptyTodo(),{action:"add",title:"   "},1);
 const dir=join(evidenceDir,"runtime-invalid"),file=join(dir,"todos.json");await mkdir(dir,{recursive:true});const store=await SessionTodoStore.open(file),context={sessionId:"eco01-invalid",projectId:"/eco01-project"};
 let asenError;try{await store.add("   ",context);}catch(error){asenError=String(error.message);}
 const rows=await store.list(context);let bytes;try{bytes=await readFile(file);}catch{}
 return {classification:"INTENTIONAL",reason:"Both reject whitespace-only titles and preserve an empty task list; ASEN exposes rejection by throwing while the source returns an error result.",source:{input:{action:"add",title:"   "},error:sourceResult.error??null,resultText:sourceResult.text,state:sourceResult.state},asen:{input:{method:"add",title:"   "},error:asenError??null,rows,storeFileExists:!!bytes,storeFileSha256:bytes?hash(bytes):null}};
});

await run("restart-recovery",async()=>{
 const sourceAdded=source.applyTodo(source.emptyTodo(),{action:"add",title:"Continue safely"},1);
 const sourceRunning=source.applyTodo(sourceAdded.state,{action:"update",id:1,status:"in_progress"},2);
 const sourceReplayed=source.replayTodo([{type:"message",message:{role:"toolResult",toolName:"todo",details:{[source.TODO_DETAILS_KEY]:sourceRunning.state}}}]);
 const dir=join(evidenceDir,"runtime-restart"),file=join(dir,"todos.json");await mkdir(dir,{recursive:true});const context={sessionId:"eco01-restart",projectId:"/eco01-project"};
 let store=await SessionTodoStore.open(file);const item=await store.add("Continue safely",context,undefined,undefined,"eco01-restart-request");await store.update(item.taskId,context,1,"running");
 const before=await readFile(file),beforeHash=hash(before);store=await SessionTodoStore.open(file);await store.recover(context,"restart");const rows=await store.list(context),history=await store.history(item.taskId,context),after=await readFile(file);
 return {classification:"INTENTIONAL",reason:"ASEN preserves durable history and converts interrupted running work to blocked so it cannot resume without explicit user review; the source replays its in_progress snapshot.",source:{replayedState:sourceReplayed.tasks[0]?.status,task:sourceReplayed.tasks[0]},asen:{beforeFileSha256:beforeHash,afterFileSha256:hash(after),rows,history:history.map(event=>({revision:event.revision,state:event.state,reason:event.reason??null}))}};
});

await run("duplicate-request",async()=>{
 let state=source.emptyTodo();state=source.applyTodo(state,{action:"add",title:"One operation"},1).state;state=source.applyTodo(state,{action:"add",title:"One operation"},2).state;
 const dir=join(evidenceDir,"runtime-duplicate"),file=join(dir,"todos.json");await mkdir(dir,{recursive:true});const store=await SessionTodoStore.open(file),context={sessionId:"eco01-duplicate",projectId:"/eco01-project"};
 const first=await store.add("One operation",context,undefined,undefined,"eco01-duplicate-request"),retry=await store.add("One operation",context,undefined,undefined,"eco01-duplicate-request"),rows=await store.list(context);
 return {classification:"INTENTIONAL",reason:"ASEN deduplicates retried request IDs to prevent duplicate tasks; the source add operation has no request identity and appends each call.",source:{repeatedAdds:2,taskCount:state.tasks.length,tasks:state.tasks},asen:{firstTaskId:first.taskId,retriedTaskId:retry.taskId,sameTask:first.taskId===retry.taskId,taskCount:rows.length,rows}};
});

await run("atomic-write-failure",async()=>{
 const initial=source.applyTodo(source.emptyTodo(),{action:"add",title:"Existing"},1).state;
 const failed=source.applyTodo(initial,{action:"write",tasks:[{title:"Would be added"},{title:"   "}]},2);
 const dir=join(evidenceDir,"runtime-atomic"),file=join(dir,"todos.json");await mkdir(dir,{recursive:true});const store=await SessionTodoStore.open(file),context={sessionId:"eco01-atomic",projectId:"/eco01-project"};
 const existing=await store.add("Existing",context),before=await store.list(context),bytesBefore=await readFile(file),api="no batch replace/clear operation exposed by the ASEN Todo store";
 const rowsAfter=await store.list(context),bytesAfter=await readFile(file);
 return {classification:"UNVERIFIED",reason:"The source supports atomic whole-list write; the mapped ASEN interface exposes append and revisioned state transitions, with no direct equivalent batch replacement operation.",source:{input:{action:"write",tasks:[{title:"Would be added"},{title:"   "}]},error:failed.error??null,stateAfterFailure:failed.state,existingState:initial},asen:{availableMethods:["add","update","list","recover","addPlan"],existingTaskId:existing.taskId,rowsBefore:before,rowsAfter,storeFileBeforeSha256:hash(bytesBefore),storeFileAfterSha256:hash(bytesAfter),storeUnchanged:hash(bytesBefore)===hash(bytesAfter),comparisonBlocker:api}};
});

const report={schema:"asen.eco01.todo-pair.v1",contractId:"ECO-SRC-91b70c5973297fbd:12",source:{commit:sourceSha,sourceId:sourceRow.id,fileSha256:sourceFileSha,span:{startLine:168,endLine:203,sha256:"7d73a31a69f345bdd676a260d1a01a8c480cb792249fc7b8fe3bcc679324da2c"}},asen:{commit:expectedAsenSha,tree:asenTree,paths:["src/runtime/pi-todo-tools.ts","src/runtime/todo-store.ts"]},runtime:{platform:process.platform,node:process.version,sourcePiTui,asenPiTui},summary:{executed:out.length,statuses:Object.fromEntries(["EQUIVALENT","DIVERGENT","INTENTIONAL","NOT_APPLICABLE","UNVERIFIED"].map(status=>[status,out.filter(x=>x.observation.classification===status).length])),overall:"UNVERIFIED",limitations:["This probes core state operations, not the complete Pi 1.1 extension lifecycle.","No direct ASEN counterpart was established for source whole-list write/clear.","Registration, denied-context and full tool-output scenarios remain open."]},observations:out};
await writeFile(join(evidenceDir,"todo-pair-evidence.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({report:join(evidenceDir,"todo-pair-evidence.json"),summary:report.summary,observations:out.map(x=>({scenario:x.scenario,sha256:x.sha256,status:x.observation.classification}))},null,2));
