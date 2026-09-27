import {spawn,type ChildProcess} from "node:child_process";
import type {AgentRequest,AgentResult,AgentRunner} from "./dispatcher.js";

export interface PiProcessOptions{
 command?:string;
 rpcArgs?:string[];
 extraArgs?:string[];
 timeoutMs?:number;
 maxOutputBytes?:number;
 signal?:AbortSignal;
 validateResponseId?:boolean;
}

function terminateTree(child:ChildProcess):void{
 if(!child.pid)return;
 if(process.platform==="win32"){
  const killer=spawn("taskkill",["/pid",String(child.pid),"/T","/F"],{stdio:"ignore",windowsHide:true});
  killer.on("error",()=>child.kill());
  return;
 }
 try{process.kill(-child.pid,"SIGTERM");}catch{child.kill();}
}

function promptWithSkills(request:AgentRequest):string{
 const paths=request.skillPaths??[];
 if(!paths.length)return request.prompt;
 if(paths.some(path=>!/^skills\\/asen-[a-z-]+\\/SKILL\\.md$/.test(path))){
  throw new Error("Invalid Pi-native skill path");
 }
 return [
  "ASEN issued these exact Pi-native skill contracts for this task.",
  "Load every SKILL.md below before task-specific work. Treat their runtime rules as authoritative; do not replace them with summaries.",
  ...paths.map(path=>"- "+path),
  "",
  "Task:",
  request.prompt
 ].join("\n");
}

export class PiProcessRunner implements AgentRunner{
 constructor(private readonly options:PiProcessOptions={}){}

 run(request:AgentRequest):Promise<AgentResult>{
  const command=this.options.command??"pi";
  const args=[...(this.options.rpcArgs??["--mode","rpc"]),...(this.options.extraArgs??[])];
  const timeoutMs=this.options.timeoutMs??120_000;
  const max=this.options.maxOutputBytes??1_000_000;

  return new Promise(resolve=>{
   const child=spawn(command,args,{
    cwd:request.repository,
    stdio:["pipe","pipe","pipe"],
    detached:process.platform!=="win32"
   });
   let stdout="",stderr="",settled=false,overflow=false;

   const finish=(result:AgentResult)=>{
    if(settled)return;
    settled=true;
    clearTimeout(timer);
    this.options.signal?.removeEventListener("abort",onAbort);
    resolve(result);
   };
   const stop=()=>terminateTree(child);
   const onAbort=()=>{stop();finish({id:request.id,ok:false,output:"pi process cancelled"});};
   const append=(current:string,data:unknown)=>{
    const next=current+String(data);
    if(Buffer.byteLength(next)>max){overflow=true;stop();return current;}
    return next;
   };

   child.stdout.on("data",data=>stdout=append(stdout,data));
   child.stderr.on("data",data=>stderr=append(stderr,data));
   child.on("error",error=>finish({id:request.id,ok:false,output:`pi process error: ${String(error)}`}));
   child.on("close",code=>{
    if(code===0&&!overflow&&this.options.validateResponseId){
     try{
      const records=stdout.trim().split(/\\r?\\n/).filter(Boolean).map(line=>JSON.parse(line));
      const envelope=records.find(record=>record?.type==="response"&&record?.id===request.id);
      if(!envelope)return finish({id:request.id,ok:false,output:"pi correlated response missing"});
      if(envelope.success===false)return finish({id:request.id,ok:false,output:`pi response failed: ${JSON.stringify(envelope)}`});
     }catch{
      return finish({id:request.id,ok:false,output:"pi response envelope invalid"});
     }
    }
    finish({
     id:request.id,
     ok:code===0&&!overflow,
     output:overflow?`pi output exceeded ${max} bytes`:(stdout||stderr)
    });
   });

   const timer=setTimeout(()=>{
    stop();
    finish({id:request.id,ok:false,output:`pi process timed out after ${timeoutMs}ms`});
   },timeoutMs);

   if(this.options.signal?.aborted)onAbort();
   else this.options.signal?.addEventListener("abort",onAbort,{once:true});

   child.stdin.on("error",error=>finish({id:request.id,ok:false,output:`pi stdin error: ${String(error)}`}));
   let message:string;
   try{message=promptWithSkills(request);}
   catch(error){
    stop();
    return finish({id:request.id,ok:false,output:`pi skill path error: ${String(error)}`});
   }
   child.stdin.end(JSON.stringify({id:request.id,type:"prompt",message})+"\n");
  });
 }
}
