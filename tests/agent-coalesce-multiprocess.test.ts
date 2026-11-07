import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {access,mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {PersistentAgentStore} from "../src/runtime/agent-store.js";

const ready=async(file:string)=>{
 for(let i=0;i<500;i++){
  try{await access(file);return;}catch{/* Bounded child-process fixture barrier only. */}
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw new Error("EF-603 child process did not reach the ready barrier");
};
test("EF-603 two real Pi-independent Node processes claim one Explorer identity under the durable lock",{timeout:30000},async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-multiprocess-coalesce-"));
 t.after(()=>rm(home,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 const file=join(home,"agents.json");
 await PersistentAgentStore.open(file);
 const children:ReturnType<typeof spawn>[]=[];
 const invoke=(label:"one"|"two")=>{
  const child=spawn(process.execPath,["--import","tsx",resolve("tests/fixtures/agent-coalesce-process.ts"),file,home,label],
   {cwd:process.cwd(),stdio:["ignore","pipe","pipe"]});
  children.push(child);
  let output="",errors="";
  child.stdout?.setEncoding("utf8");child.stderr?.setEncoding("utf8");
  child.stdout?.on("data",(chunk:string)=>{output+=chunk;});
  child.stderr?.on("data",(chunk:string)=>{errors+=chunk;});
  const done=new Promise<{id:string;reused:boolean;state:string}>((res,rej)=>{
   child.on("error",rej);
   child.on("close",(code,signal)=>{
    if(code!==0)return rej(new Error(`EF-603 process ${label} exited ${code}/${signal}: ${errors}`));
    try{res(JSON.parse(output.trim()));}catch(error){rej(error);}
   });
  });
  return done;
 };
 t.after(()=>{for(const child of children)if(child.exitCode===null)child.kill();});
 const a=invoke("one"),b=invoke("two");
 await Promise.all([ready(join(home,"ready-one")),ready(join(home,"ready-two"))]);
 await writeFile(join(home,"go"),"go",{flag:"wx"});
 const [one,two]=await Promise.all([a,b]);
 assert.equal(one.id,two.id,"Equivalent running/queued work has one durable agent identity");
 assert.deepEqual([one.reused,two.reused].sort(),[false,true]);
 assert.deepEqual([one.state,two.state].sort(),["queued","queued"]);
 const recovered=(await PersistentAgentStore.open(file)).store;
 const tasks=await recovered.list("cross-process-session","/repo");
 assert.equal(tasks.length,1,"A cross-process race may not leave two persisted Explorer tasks");
 assert.equal(tasks[0]?.state,"interrupted","The exited owner is never silently relaunched");
});
