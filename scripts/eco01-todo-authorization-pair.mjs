import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";

const [sourceRootArg,evidenceDirArg,expectedSourceSha,expectedAsenSha,expectedAsenTree]=process.argv.slice(2);
if(!sourceRootArg||!evidenceDirArg||!expectedSourceSha||!expectedAsenSha||!expectedAsenTree)throw new Error("Usage: node --import tsx scripts/eco01-todo-authorization-pair.mjs <frozen-source-root> <evidence-directory> <source-sha> <asen-sha> <asen-tree>");
const sourceRoot=resolve(sourceRootArg),evidenceDir=resolve(evidenceDirArg),asenRoot=process.cwd();
const hash=value=>createHash("sha256").update(value).digest("hex");
const sourceInventory=JSON.parse(await readFile(join(asenRoot,"registry/parity/ecosystem-sources-v1.json"),"utf8"));
const sourceRow=sourceInventory.files.find(row=>row.id==="ECO-SRC-91b70c5973297fbd");
if(!sourceRow)throw new Error("Todo source inventory edge is missing");
const sourceSha=execFileSync("git",["-C",sourceRoot,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
const asenTree=execFileSync("git",["rev-parse","HEAD^{tree}"],{cwd:asenRoot,encoding:"utf8"}).trim();
if(sourceSha!==expectedSourceSha||asenTree!==expectedAsenTree)throw new Error("Exact source or ASEN tree identity mismatch");
const source=await import(pathToFileURL(join(sourceRoot,"lib/shell-todo.ts")));
const {SessionTodoStore}=await import(pathToFileURL(join(asenRoot,"src/runtime/todo-store.ts")));
const sourceFile=await readFile(join(sourceRoot,sourceRow.path));
const sourceFileSha=hash(sourceFile);
if(sourceFileSha!==sourceRow.sha256)throw new Error("Todo source file digest mismatch");
await mkdir(evidenceDir,{recursive:true});

const sourceAdded=source.applyTodo(source.emptyTodo(),{action:"add",title:"Owned task"},1);
const sourceAttempt=source.applyTodo(sourceAdded.state,{action:"update",id:1,status:"done",note:"cross-session attempt"},2);
const storeFile=join(evidenceDir,"runtime","todos.json");
await mkdir(join(evidenceDir,"runtime"),{recursive:true});
const store=await SessionTodoStore.open(storeFile),owner={sessionId:"eco01-owner",projectId:"/eco01-project"},outsider={sessionId:"eco01-outsider",projectId:"/eco01-project"};
const created=await store.add("Owned task",owner),ownerBefore=await store.list(owner),beforeBytes=await readFile(storeFile);
let denialError;
try{await store.update(created.taskId,outsider,created.events.at(-1).revision,"done","cross-session attempt");}catch(error){denialError={name:error.name,message:error.message};}
const ownerAfter=await store.list(owner),outsiderRows=await store.list(outsider),afterBytes=await readFile(storeFile);
const allowedSourceMutation=sourceAttempt.state.tasks[0]?.status==="done";
const deniedAsenMutation=!!denialError&&ownerAfter[0]?.current.state==="planned"&&outsiderRows.length===0&&hash(beforeBytes)===hash(afterBytes);
const report={schema:"asen.eco01.todo-authorization-pair.v1",contractId:"ECO-SRC-91b70c5973297fbd:12",source:{commit:sourceSha,sourceId:sourceRow.id,path:sourceRow.path,fileSha256:sourceFileSha,span:{startLine:168,endLine:203,sha256:"7d73a31a69f345bdd676a260d1a01a8c480cb792249fc7b8fe3bcc679324da2c"}},asen:{commit:expectedAsenSha,tree:asenTree,path:"src/runtime/todo-store.ts"},runtime:{platform:process.platform,node:process.version},scenario:{name:"denied",classification:allowedSourceMutation&&deniedAsenMutation?"INTENTIONAL":"UNVERIFIED",reason:allowedSourceMutation&&deniedAsenMutation?"The source Todo state operation has no session/project owner and applies the task update; ASEN rejects the same task ID from another session, preserving the owner state and file bytes. This is an intentional authorization boundary.":"The source/ASEN authorization outcomes did not match the expected safety boundary.",input:{source:{initialTask:"Owned task",attemptedSession:"eco01-outsider",action:{action:"update",id:1,status:"done",note:"cross-session attempt"}},asen:{taskId:created.taskId,owner,outsider,expectedRevision:created.events.at(-1).revision,nextState:"done"}},sourceResult:{error:sourceAttempt.error??null,state:sourceAttempt.state,allowedMutation:allowedSourceMutation},asenResult:{error:denialError??null,ownerBefore:ownerBefore.map(row=>row.current.state),ownerAfter:ownerAfter.map(row=>row.current.state),outsiderVisibleTasks:outsiderRows.length,fileBytesBefore:beforeBytes.length,fileBytesAfter:afterBytes.length,fileSha256Before:hash(beforeBytes),fileSha256After:hash(afterBytes),deniedWithoutMutation:deniedAsenMutation}},limitations:["The comparison exercises the actual Todo state operation and ASEN persistent store, not Pi tool registration or UI authorization lifecycle."]};
const bytes=JSON.stringify(report,null,2)+"\n";
await writeFile(join(evidenceDir,"todo-authorization-pair.json"),bytes);
console.log(JSON.stringify({contractId:report.contractId,scenario:report.scenario.name,status:report.scenario.classification,sourceCommit:sourceSha,asenCommit:expectedAsenSha,asenTree,evidenceSha256:hash(bytes),report:join(evidenceDir,"todo-authorization-pair.json")},null,2));
