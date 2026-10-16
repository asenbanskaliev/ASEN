import {createHash} from "node:crypto";
import {mkdir,readFile,readdir,writeFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {join,relative,resolve} from "node:path";
import {pathToFileURL} from "node:url";

const [sourceRootArg,evidenceDirArg,expectedSourceSha,expectedAsenSha,expectedAsenTree]=process.argv.slice(2);
if(!sourceRootArg||!evidenceDirArg||!expectedSourceSha||!expectedAsenSha||!expectedAsenTree)throw new Error("Usage: node --import tsx scripts/eco01-todo-clear-pair.mjs <frozen-source-root> <evidence-dir> <source-sha> <asen-sha> <asen-tree>");
const sourceRoot=resolve(sourceRootArg),evidenceDir=resolve(evidenceDirArg),asenRoot=process.cwd();
const hash=value=>createHash("sha256").update(value).digest("hex");
const git=(cwd,...args)=>execFileSync("git",["-C",cwd,...args],{encoding:"utf8"}).trim();
const inventory=JSON.parse(await readFile(join(asenRoot,"registry/parity/ecosystem-sources-v1.json"),"utf8"));
const sourceRow=inventory.files.find(row=>row.id==="ECO-SRC-91b70c5973297fbd");
if(!sourceRow||git(sourceRoot,"rev-parse","HEAD")!==expectedSourceSha)throw new Error("Frozen Todo source identity mismatch");
const sourceFile=await readFile(join(sourceRoot,sourceRow.path));
if(hash(sourceFile)!==sourceRow.sha256)throw new Error("Frozen Todo source file digest mismatch");
const tree=git(asenRoot,"rev-parse","HEAD^{tree}");
if(tree!==expectedAsenTree)throw new Error("ASEN candidate tree mismatch");
const source=await import(pathToFileURL(join(sourceRoot,"lib/shell-todo.ts")));
const {SessionTodoStore,todoProjectStorageFile}=await import(pathToFileURL(join(asenRoot,"src/runtime/todo-store.ts")));
await mkdir(evidenceDir,{recursive:true});

let sourceState=source.emptyTodo();
const sourceAdded=[];
for(const title of ["Review parser","Run regression suite"]){const result=source.applyTodo(sourceState,{action:"add",title},1);sourceState=result.state;sourceAdded.push({text:result.text,state:result.state});}
const sourceCleared=source.applyTodo(sourceState,{action:"clear"},2);
const sourceReplay=source.replayTodo([{type:"message",message:{role:"toolResult",toolName:source.TODO_TOOL_NAME,details:{[source.TODO_DETAILS_KEY]:sourceCleared.state}}}]);
const sourceResult={input:{addTitles:["Review parser","Run regression suite"],action:"clear"},added:sourceAdded,clearText:sourceCleared.text,clearState:sourceCleared.state,replayedState:sourceReplay,activeTaskCount:sourceReplay.tasks.length,updatedTurn:sourceReplay.updatedTurn};

const runtime=join(evidenceDir,"runtime"),storeRoot=join(runtime,"store"),legacyFile=join(runtime,"legacy.json"),context={sessionId:"eco01-clear",projectId:"/eco01-project"};
await mkdir(runtime,{recursive:true});
const store=await SessionTodoStore.openProjectScoped(storeRoot,legacyFile),file=todoProjectStorageFile(storeRoot,context.projectId),created=[];
for(const title of ["Review parser","Run regression suite"])created.push(await store.add(title,context));
const before=await readFile(file),cancelled=[];
for(const task of created)cancelled.push(await store.update(task.taskId,context,1,"cancelled","User cleared the active task list"));
const active=await store.list(context),archived=await store.archived(context),archiveDir=join(file,"..","archive"),archiveFiles=(await readdir(archiveDir)).filter(name=>name.endsWith(".json")).sort();
const archiveHashes=[];for(const name of archiveFiles)archiveHashes.push({file:relative(evidenceDir,join(archiveDir,name)).replaceAll("\\","/"),sha256:hash(await readFile(join(archiveDir,name)))});
const after=await readFile(file);
const asenResult={input:{methods:["add","update(cancelled)","list","archived"],titles:["Review parser","Run regression suite"]},addedTaskIds:created.map(task=>task.taskId),cancelledEvents:cancelled.map(task=>task.events.at(-1)),activeTasks:active,activeTaskCount:active.length,archivedTasks:archived,archivedTaskCount:archived.length,activeFileSha256Before:hash(before),activeFileSha256After:hash(after),activeFileBytesAfter:after.length,archiveHashes};
const reason="The source clear replaces the active snapshot and replay yields an empty list. ASEN has no destructive clear tool; the mapped lifecycle cancels each task, empties active listing, and atomically archives the complete history. This preserves audit/recovery records while honoring the user-visible empty-active-list result.";
const observation={classification:"INTENTIONAL",reason,source:sourceResult,asen:asenResult,differences:{sourcePersistence:"empty branch snapshot after clear",asenPersistence:"active store is empty; cancelled task history remains in archive",operation:"one whole-list clear versus per-task revisioned cancellation"}};
if(sourceResult.activeTaskCount!==0||asenResult.activeTaskCount!==0||asenResult.archivedTaskCount!==2||asenResult.archiveHashes.length!==1)throw new Error("Clear/archive behavior did not preserve the expected active-list and history outcomes");
const sourceLog=JSON.stringify(sourceResult,null,2)+"\n",asenLog=JSON.stringify(asenResult,null,2)+"\n";
await writeFile(join(evidenceDir,"source.stdout.log"),sourceLog);await writeFile(join(evidenceDir,"source.stderr.log"),"");
await writeFile(join(evidenceDir,"asen.stdout.log"),asenLog);await writeFile(join(evidenceDir,"asen.stderr.log"),"");
const report={schema:"asen.eco01.todo-clear-pair.v1",contractId:"ECO-SRC-91b70c5973297fbd:12",scenario:"clear-and-archive",source:{commit:expectedSourceSha,sourceId:sourceRow.id,fileSha256:sourceRow.sha256},asen:{commit:expectedAsenSha,tree,paths:["src/runtime/todo-store.ts","src/runtime/task-replay.ts"]},execution:{command:"node --import tsx scripts/eco01-todo-clear-pair.mjs <frozen-source-root> <evidence-dir> <source-sha> <asen-sha> <asen-tree>",environment:{platform:process.platform,node:process.version,sourcePiTui:JSON.parse(await readFile(join(sourceRoot,"node_modules/@earendil-works/pi-tui/package.json"),"utf8")).version,asenPiTui:JSON.parse(await readFile(join(asenRoot,"node_modules/@earendil-works/pi-tui/package.json"),"utf8")).version},exitCode:0,logs:{source:{stdout:{file:"source.stdout.log",sha256:hash(sourceLog)},stderr:{file:"source.stderr.log",sha256:hash("")}},asen:{stdout:{file:"asen.stdout.log",sha256:hash(asenLog)},stderr:{file:"asen.stderr.log",sha256:hash("")}}}},observation};
const bytes=JSON.stringify(report,null,2)+"\n";await writeFile(join(evidenceDir,"todo-clear-pair.json"),bytes);
console.log(JSON.stringify({contractId:report.contractId,scenario:report.scenario,status:observation.classification,sourceCommit:expectedSourceSha,asenCommit:expectedAsenSha,asenTree:tree,evidencePath:join(evidenceDir,"todo-clear-pair.json"),evidenceSha256:hash(bytes),sourceLogSha256:report.execution.logs.source.stdout.sha256,asenLogSha256:report.execution.logs.asen.stdout.sha256,sourceActive:sourceResult.activeTaskCount,asenActive:asenResult.activeTaskCount,archived:asenResult.archivedTaskCount},null,2));
