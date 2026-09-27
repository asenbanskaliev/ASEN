import {spawn} from "node:child_process";
import type {AgentRequest,AgentResult,AgentRunner} from "./dispatcher.js";

export interface PiProcessOptions{
 command?:string;extraArgs?:string[];rpcArgs?:string[];timeoutMs?:number;maxOutputBytes?:number;
}

function accepted(stdout:string,id:string):boolean{
 let response:Record<string,unknown>|undefined,settled=false;
 for(const line of stdout.split("\n")){
  if(!line)continue;
  let record:Record<string,unknown>;
  try{record=JSON.parse(line.replace(/\r$/,"")) as Record<string,unknown>;}catch{return false;}
  if(record.type==="agent_settled")settled=true;
  if(record.type==="response"&&record.id===id&&record.command==="prompt")response=record;
 }
 if(response?.success!==true)return false;
 const data=response.data as {disposition?:string}|undefined;
 return data?.disposition==="handled"||settled;
}

export class PiProcessRunner implements AgentRunner{
 constructor(private readonly options:PiProcessOptions={}){}
 run(request:AgentRequest):Promise<AgentResult>{
  const command=this.options.command??"pi";
  const args=[...(this.options.rpcArgs??["--mode","rpc"]),...(this.options.extraArgs??[])];
  const timeoutMs=this.options.timeoutMs??120_000,max=this.options.maxOutputBytes??1_000_000;
  return new Promise(resolve=>{
   let stdout="",stderr="",reason="",finished=false;
   const child=spawn(command,args,{cwd:request.repository,stdio:["pipe","pipe","pipe"],detached:process.platform!=="win32"});
   const finish=(result:AgentResult)=>{if(finished)return;finished=true;clearTimeout(timer);resolve(result);};
   const stop=(why:string)=>{
    if(reason)return;reason=why;
    if(process.platform==="win32"&&child.pid){
     const killer=spawn("taskkill",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore",windowsHide:true});
     killer.once("error",()=>child.kill());killer.once("close",()=>child.kill());
    }else if(child.pid){try{process.kill(-child.pid,"SIGKILL");}catch{child.kill();}}
    else child.kill();
   };
   const append=(current:string,chunk:Buffer)=>{
    if(Buffer.byteLength(stdout)+Buffer.byteLength(stderr)+chunk.byteLength>max){stop(`pi output exceeded ${max} bytes`);return current;}
    return current+chunk.toString("utf8");
   };
   child.stdout.on("data",(chunk:Buffer)=>stdout=append(stdout,chunk));
   child.stderr.on("data",(chunk:Buffer)=>stderr=append(stderr,chunk));
   child.on("error",error=>{reason=`pi process error: ${String(error)}`;finish({id:request.id,ok:false,output:reason});});
   child.on("close",code=>finish({id:request.id,ok:!reason&&code===0&&accepted(stdout,request.id),output:reason||stdout||stderr||"Pi RPC response missing or invalid"}));
   const timer=setTimeout(()=>{stop(`pi process timed out after ${timeoutMs}ms`);setTimeout(()=>finish({id:request.id,ok:false,output:reason}),2000).unref();},timeoutMs);
   child.stdin.on("error",error=>stop(`pi stdin error: ${String(error)}`));
   child.stdin.end(JSON.stringify({id:request.id,type:"prompt",message:request.prompt})+"\n");
  });
 }
}
