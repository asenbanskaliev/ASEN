import {access,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {PersistentAgentStore} from "../../src/runtime/agent-store.js";

const [file,barrier,label]=process.argv.slice(2);
if(!file||!barrier||!["one","two"].includes(label??""))throw new Error("Invalid EF-603 subprocess fixture arguments");
const owner={kind:"user" as const,id:"pi:cross-process-session"};
const {store}=await PersistentAgentStore.open(file);
await writeFile(join(barrier,`ready-${label}`),label,{flag:"wx"});
let released=false;
for(let attempt=0;attempt<1200;attempt++){
 try{await access(join(barrier,"go"));released=true;break;}catch{/* Waiting only for the test barrier, not agent status. */}
 await new Promise(resolve=>setTimeout(resolve,10));
}
if(!released)throw new Error("Cross-process claim barrier was never released");
const request={
 id:`agent-cross-process-${label}`,role:"explorer" as const,
 prompt:"Read the same exact scoped fixture in the current session",
 repository:"/repo",isolationKey:"cross-process-session",owner,
 model:"free-model",dedupeKey:"d".repeat(64),
};
const result=await store.enqueueAdHocExplorerOrReuse(request,owner);
process.stdout.write(JSON.stringify(result)+"\n");
