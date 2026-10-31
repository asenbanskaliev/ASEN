import {SessionTodoStore} from "../../src/runtime/todo-store.js";

const [file,projectId,otherProject]=process.argv.slice(2);
if(!file||!projectId||!otherProject)throw new Error("Expected Todo store path and project identities");
const store=await SessionTodoStore.open(file);
const active={sessionId:"todo-session-a",projectId},foreignSession={sessionId:"todo-session-b",projectId},foreignProject={sessionId:"todo-session-a",projectId:otherProject};
const running=async(title:string,context:typeof active|typeof foreignSession|typeof foreignProject)=>{
 const task=await store.add(title,context);await store.update(task.taskId,context,1,"running");
};
await running("active running task",active);
await running("foreign session task",foreignSession);
await running("foreign project task",foreignProject);
const finished=await store.add("finished task",active);
await store.update(finished.taskId,active,1,"running");await store.update(finished.taskId,active,2,"done","verified before process exit");
process.exit(23);
