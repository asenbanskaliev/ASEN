import {spawn, type ChildProcess} from "node:child_process";import type {AgentRequest,AgentResult,AgentRunner} from "./dispatcher.js";
export interface PiProcessOptions{command?:string;rpcArgs?:string[];extraArgs?:string[];timeoutMs?:number;maxOutputBytes?:number;signal?:AbortSignal;validateResponseId?:boolean;}
function terminateTree(child:ChildProcess):void{
 if(!child.pid)return;
 if(process.platform==="win32"){const killer=spawn("taskkill",["/pid",String(child.pid),"/T","/F"],{stdio:"ignore",windowsHide:true});killer.on("error",()=>child.kill());return;}
 try{process.kill(-child.pid,"SIGTERM");}catch{child.kill();}
}
export class PiProcessRunner implements AgentRunner{
 constructor(private readonly options:PiProcessOptions={}){}
 run(request:AgentRequest):Promise<AgentResult>{
  const command=this.options.command??"pi",args=[...(this.options.rpcArgs??["--mode","rpc"]),...(this.options.extraArgs??[])],timeoutMs=this.options.timeoutMs??120_000,max=this.options.maxOutputBytes??1_000_000;
  return new Promise(resolve=>{
   const child=spawn(command,args,{cwd:request.repository,stdio:["pipe","pipe","pipe"],detached:process.platform!=="win32"});let stdout="",stderr="",settled=false,overflow=false;
   const finish=(r:AgentResult)=>{if(settled)return;settled=true;clearTimeout(timer);this.options.signal?.removeEventListener("abort",onAbort);resolve(r);};
   const stop=()=>terminateTree(child);
   const onAbort=()=>{stop();finish({id:request.id,ok:false,output:"pi process cancelled"});};
   const append=(current:string,d:unknown)=>{const next=current+String(d);if(Buffer.byteLength(next)>max){overflow=true;stop();return current;}return next;};
   child.stdout.on("data",d=>stdout=append(stdout,d));child.stderr.on("data",d=>stderr=append(stderr,d));
   child.on("error",e=>finish({id:request.id,ok:false,output:`pi process error: ${String(e)}`}));
   child.on("close",code=>{if(code===0&&!overflow&&this.options.validateResponseId){try{const lines=stdout.trim().split(/\\r?\\n/).filter(Boolean);const envelope=JSON.parse(lines.at(-1)??"");if(envelope?.requestId!==request.id)return finish({id:request.id,ok:false,output:"pi response requestId mismatch"});}catch{return finish({id:request.id,ok:false,output:"pi response envelope invalid"});}}finish({id:request.id,ok:code===0&&!overflow,output:overflow?`pi output exceeded ${max} bytes`:(stdout||stderr)});});
   const timer=setTimeout(()=>{stop();finish({id:request.id,ok:false,output:`pi process timed out after ${timeoutMs}ms`});},timeoutMs);
   if(this.options.signal?.aborted)onAbort();else this.options.signal?.addEventListener("abort",onAbort,{once:true});
   child.stdin.on("error",e=>finish({id:request.id,ok:false,output:`pi stdin error: ${String(e)}`}));
   child.stdin.end(JSON.stringify({type:"prompt",message:request.prompt,requestId:request.id})+"\n");
  });
 }
}
