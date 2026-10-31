import fs from "node:fs/promises";
import {writeSync} from "node:fs";
import {syncBuiltinESMExports} from "node:module";
import {resolve} from "node:path";
import {SessionTodoStore} from "../../src/runtime/todo-store.js";

const [file,taskId,sessionId,projectId]=process.argv.slice(2);
if(!file||!taskId||!sessionId||!projectId)throw new Error("Expected Todo path, task and owning identities");
const store=await SessionTodoStore.open(file),rename=fs.rename.bind(fs);
fs.rename=async(from,to)=>{
 if(resolve(String(to))===resolve(file)&&String(from).endsWith(".tmp")){
  writeSync(1,JSON.stringify({boundary:"before-commit",temporary:String(from)})+"\n");
  process.exit(23);
 }
 return rename(from,to);
};
syncBuiltinESMExports();
await store.update(taskId,{sessionId,projectId},1,"running");
throw new Error("Crash boundary was not reached");
