import {appendFile,readFile} from "node:fs/promises";
import {realpath} from "node:fs/promises";

const steps=["inspect-closure-audit","inspect-task-reducer"];

export default function(pi){
  pi.registerTool({
    name:"asen_eco07_record_step",
    label:"Record ECO-07 test step",
    description:"Record one reviewed ECO-07 recovery artifact in the isolated test. Each step may be recorded only once.",
    executionMode:"sequential",
    parameters:{type:"object",additionalProperties:false,required:["step","summary"],properties:{step:{type:"string",enum:steps},summary:{type:"string",minLength:20,maxLength:1000}}},
    execute:async(_id,params,_signal,_update,host)=>{
      const value=params?.step;
      if(!steps.includes(value))throw new Error("Invalid ECO-07 test step");
      if(typeof params.summary!=="string"||params.summary.length<20||params.summary.length>1000)throw new Error("Invalid ECO-07 review summary");
      const normalized=params.summary.toLowerCase();
      if(value==="inspect-closure-audit"&&(!normalized.includes("partial")||!normalized.includes("interruption")||!normalized.includes("real pi")))throw new Error("Closure audit summary omitted the real-Pi interruption gap");
      if(value==="inspect-task-reducer"&&["planned","running","blocked","session","project"].some(token=>!normalized.includes(token)))throw new Error("Task reducer summary omitted required transition or identity safeguards");
      if(host?.sessionManager?.getSessionId?.()!==process.env.ASEN_ECO07_SESSION_ID)throw new Error("ECO-07 test session mismatch");
      if(await realpath(host.cwd)!==process.env.ASEN_ECO07_PROJECT)throw new Error("ECO-07 test project mismatch");
      const file=process.env.ASEN_ECO07_STEPS_FILE;
      if(!file)throw new Error("ECO-07 evidence file is unavailable");
      let existing="";
      try{existing=await readFile(file,"utf8");}catch(error){if(error?.code!=="ENOENT")throw error;}
      const rows=existing.split("\n").filter(Boolean).map(line=>JSON.parse(line));
      if(rows.some(row=>row.step===value))throw new Error("ECO-07 step was already recorded");
      await appendFile(file,`${JSON.stringify({step:value,summary:params.summary,sessionId:process.env.ASEN_ECO07_SESSION_ID,projectId:process.env.ASEN_ECO07_PROJECT,at:new Date().toISOString()})}\n`,{flag:"a",mode:0o600});
      return {content:[{type:"text",text:`Recorded ${value} exactly once.`}],details:{step:value}};
    },
  });
}
