import {spawn} from "node:child_process";import type {AgentRequest,AgentResult,AgentRunner} from "./dispatcher.js";
export interface PiProcessOptions{command?:string;extraArgs?:string[];timeoutMs?:number;maxOutputBytes?:number;}
export class PiProcessRunner implements AgentRunner{
 constructor(private readonly options:PiProcessOptions={}){}
 run(request:AgentRequest):Promise<AgentResult>{
  const command=this.options.command??"pi",args=["--mode","rpc",...(this.options.extraArgs??[])],timeoutMs=this.options.timeoutMs??120_000,max=this.options.maxOutputBytes??1_000_000;
  return new Promise(resolve=>{
   const child=spawn(command,args,{cwd:request.repository,stdio:["pipe","pipe","pipe"]});let stdout="",stderr="",settled=false,overflow=false;
   const finish=(r:AgentResult)=>{if(settled)return;settled=true;clearTimeout(timer);resolve(r);};
   const append=(current:string,d:unknown)=>{const next=current+String(d);if(Buffer.byteLength(next)>max){overflow=true;child.kill();return current;}return next;};
   child.stdout.on("data",d=>stdout=append(stdout,d));child.stderr.on("data",d=>stderr=append(stderr,d));
   child.on("error",e=>finish({id:request.id,ok:false,output:`pi process error: ${String(e)}`}));
   child.on("close",code=>finish({id:request.id,ok:code===0&&!overflow,output:overflow?`pi output exceeded ${max} bytes`:(stdout||stderr)}));
   const timer=setTimeout(()=>{child.kill();finish({id:request.id,ok:false,output:`pi process timed out after ${timeoutMs}ms`});},timeoutMs);
   child.stdin.on("error",e=>finish({id:request.id,ok:false,output:`pi stdin error: ${String(e)}`}));
   child.stdin.end(JSON.stringify({type:"prompt",message:request.prompt,requestId:request.id})+"\n");
  });
 }
}
