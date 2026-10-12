import {appendFile,readFile} from "node:fs/promises";
import {realpath} from "node:fs/promises";

const steps=["inspect-closure-audit","inspect-task-reducer"];
const reviewFiles={"inspect-closure-audit":"docs/audit/eco07-closure-evidence-2026-10-12.md","inspect-task-reducer":"src/runtime/task-replay.ts"};
async function currentTask(host){
  if(host?.sessionManager?.getSessionId?.()!==process.env.ASEN_ECO07_SESSION_ID)throw new Error("ECO-07 test session mismatch");
  if(await realpath(host.cwd)!==process.env.ASEN_ECO07_PROJECT)throw new Error("ECO-07 test project mismatch");
  const stored=JSON.parse(await readFile(process.env.ASEN_ECO07_TODO_FILE,"utf8"));
  if(stored?.schema!=="asen.todo/v1"||!Array.isArray(stored.items))throw new Error("ECO-07 Todo store is invalid");
  const matches=stored.items.filter(item=>item.title===process.env.ASEN_ECO07_TASK_TITLE&&item.events?.[0]?.sessionId===process.env.ASEN_ECO07_SESSION_ID&&item.events?.[0]?.projectId===process.env.ASEN_ECO07_PROJECT);
  if(matches.length!==1)throw new Error("ECO-07 test task identity is missing or duplicated");
  const events=matches[0].events,current=events.at(-1);
  if(current?.state!=="running")throw new Error("Pending review content is unavailable until explicit task resume");
  const existing=await readFile(process.env.ASEN_ECO07_STEPS_FILE,"utf8").catch(error=>error?.code==="ENOENT"?"":Promise.reject(error));
  const rows=existing.split("\n").filter(Boolean).map(line=>JSON.parse(line));
  return {current,rows};
}

export default function(pi){
  pi.registerTool({
    name:"asen_eco07_read_pending_review",
    label:"Read resumed ECO-07 review step",
    description:"Read the exact file for one pending ECO-07 review step. Available only after the current ASEN Todo is running again following its explicit resume confirmation. Read and record inspect-closure-audit before inspect-task-reducer.",
    executionMode:"sequential",
    parameters:{type:"object",additionalProperties:false,required:["step"],properties:{step:{type:"string",enum:steps}}},
    execute:async(_id,params,_signal,_update,host)=>{
      const value=params?.step;if(!steps.includes(value))throw new Error("Invalid ECO-07 review step");
      if(process.env.ASEN_ECO07_PHASE!=="restarted")throw new Error("Pending review content is unavailable in the initial Pi process");
      const {rows}=await currentTask(host);
      if(rows.some(row=>row.step===value))throw new Error("ECO-07 review step is already complete");
      if(value==="inspect-task-reducer"&&!rows.some(row=>row.step==="inspect-closure-audit"))throw new Error("ECO-07 review steps must remain in order");
      const filename=`${process.env.ASEN_ECO07_PROJECT}/${reviewFiles[value]}`;
      const content=await readFile(filename,"utf8");
      if(content.length>100_000)throw new Error("ECO-07 review source exceeds the bounded read limit");
      const readsFile=process.env.ASEN_ECO07_READS_FILE;
      if(!readsFile)throw new Error("ECO-07 read evidence file is unavailable");
      const previous=(await readFile(readsFile,"utf8").catch(error=>error?.code==="ENOENT"?"":Promise.reject(error))).split("\n").filter(Boolean).map(line=>JSON.parse(line));
      if(previous.some(row=>row.step===value))throw new Error("ECO-07 review file was already read");
      await appendFile(readsFile,`${JSON.stringify({step:value,file:reviewFiles[value],sessionId:process.env.ASEN_ECO07_SESSION_ID,projectId:process.env.ASEN_ECO07_PROJECT,at:new Date().toISOString()})}\n`,{flag:"a",mode:0o600});
      return {content:[{type:"text",text:content}],details:{step:value,file:reviewFiles[value]}};
    },
  });
  pi.registerTool({
    name:"asen_eco07_record_step",
    label:"Record ECO-07 test step",
    description:"Record each recovered ECO-07 step exactly once and in order. For inspect-closure-audit, the summary must mention PARTIAL, real Pi, and interruption. For inspect-task-reducer, the summary must mention planned, running, blocked, session, and project.",
    executionMode:"sequential",
    parameters:{type:"object",additionalProperties:false,required:["step","summary"],properties:{step:{type:"string",enum:steps},summary:{type:"string",minLength:20,maxLength:1000}}},
    execute:async(_id,params,_signal,_update,host)=>{
      const value=params?.step;
      if(!steps.includes(value))throw new Error("Invalid ECO-07 test step");
      if(typeof params.summary!=="string"||params.summary.length<20||params.summary.length>1000)throw new Error("Invalid ECO-07 review summary");
      const normalized=params.summary.toLowerCase();
      if(value==="inspect-closure-audit"&&(!normalized.includes("partial")||!normalized.includes("interruption")||!normalized.includes("real pi")))throw new Error("Closure audit summary omitted the real-Pi interruption gap");
      if(value==="inspect-task-reducer"&&["planned","running","blocked","session","project"].some(token=>!normalized.includes(token)))throw new Error("Task reducer summary omitted required transition or identity safeguards");
      const {current,rows}=await currentTask(host);
      if(current.state!=="running")throw new Error("ECO-07 review step cannot be recorded while the task is not running");
      if(process.env.ASEN_ECO07_PHASE!=="restarted")throw new Error("ECO-07 review steps are unavailable in the initial Pi process");
      const file=process.env.ASEN_ECO07_STEPS_FILE;
      if(!file)throw new Error("ECO-07 evidence file is unavailable");
      if(rows.some(row=>row.step===value))throw new Error("ECO-07 step was already recorded");
      if(value==="inspect-task-reducer"&&!rows.some(row=>row.step==="inspect-closure-audit"))throw new Error("ECO-07 review steps must remain in order");
      const reads=(await readFile(process.env.ASEN_ECO07_READS_FILE,"utf8").catch(error=>error?.code==="ENOENT"?"":Promise.reject(error))).split("\n").filter(Boolean).map(line=>JSON.parse(line));
      if(!reads.some(row=>row.step===value))throw new Error("ECO-07 review file must be read before its step can be recorded");
      await appendFile(file,`${JSON.stringify({step:value,summary:params.summary,sessionId:process.env.ASEN_ECO07_SESSION_ID,projectId:process.env.ASEN_ECO07_PROJECT,at:new Date().toISOString()})}\n`,{flag:"a",mode:0o600});
      return {content:[{type:"text",text:`Recorded ${value} exactly once.`}],details:{step:value}};
    },
  });
}
