import {spawn,type ChildProcess} from "node:child_process";
import {resolve as resolvePath} from "node:path";
import {realpathSync} from "node:fs";
import type {AgentRequest,AgentResult,AgentRunner} from "./dispatcher.js";
import {matchesIssuedSkillContext} from "../skills/context.js";
import {selectSkills} from "../skills/registry.js";

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
 if(paths.length||request.skillContext){
  if(!request.skillContext||!matchesIssuedSkillContext(request.skillContext,request.id,request.repository,request.candidate)) throw new Error("Pi skill paths require matching ASEN-issued context and candidate");
  const selected=selectSkills(request.skillContext).map(skill=>skill.path);
  if(selected.length!==paths.length||selected.some((path,index)=>path!==paths[index])) throw new Error("Pi skill paths do not match issued context");
 }
 if(!paths.length)return request.prompt;
 if(paths.some(path=>!/^skills\/asen-[a-z-]+\/SKILL\.md$/.test(path))){
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
  let message:string;
  try{message=promptWithSkills(request);}
  catch(error){return Promise.resolve({id:request.id,ok:false,output:`pi skill path error: ${String(error)}`});}
  const extra=this.options.extraArgs??[];
  if([...(this.options.rpcArgs??[]),...extra].some(arg=>arg==="--"||arg.startsWith("-t")&&!arg.startsWith("--")||arg.startsWith("-e")&&!arg.startsWith("--")||["--skill","--no-skills","-ns","--extension","--tools","--no-tools","-nt","--no-builtin-tools","-nbt"].some(flag=>arg===flag||arg.startsWith(flag+"="))))
   return Promise.resolve({id:request.id,ok:false,output:"pi skill and tool arguments must be issued by ASEN"});
  if(request.writeSurfaces?.length&&request.role!=="worker")return Promise.resolve({id:request.id,ok:false,output:"Only a worker may request write tools"});
  const writer=request.role==="worker"&&!!request.writeSurfaces?.length&&!!request.candidate&&!!request.skillContext;
  const policy=resolvePath(request.repository,"extensions/authority.ts");
  const args=[...(this.options.rpcArgs??["--mode","rpc"]),...extra,
   "--no-extensions","--extension",policy,"--no-skills","--tools",writer?"read,edit,write":"read",...(request.skillPaths??[]).flatMap(path=>["--skill",path])];
  const timeoutMs=this.options.timeoutMs??120_000;
  const max=this.options.maxOutputBytes??1_000_000;

  return new Promise(resolve=>{
   const child=spawn(command,args,{
    cwd:request.repository,
    env:{...process.env,ASEN_PI_AUTHORITY:JSON.stringify({repository:request.repository,role:request.role,writeSurfaces:writer?request.writeSurfaces:[]})},
    stdio:["pipe","pipe","pipe"],
    detached:process.platform!=="win32"
   });
   let stdout="",stderr="",settled=false,overflow=false,buffer="",policyLoaded=false;
   const preflightId=`asen-policy:${request.id}`;

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

   child.stdout.on("data",data=>{
    stdout=append(stdout,data);buffer+=String(data);
    let end;while((end=buffer.indexOf("\n"))>=0){
     const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
     let record:unknown;try{record=JSON.parse(line);}catch{continue;}
     const response=record as {type?:string;id?:string;success?:boolean;data?:{commands?:Array<{name:string;source:string;sourceInfo?:{path:string}}>}};
     if(response.type!=="response"||response.id!==preflightId)continue;
     const matches=response.data?.commands?.filter(item=>item.name==="asen-authority-status"&&item.source==="extension"&&item.sourceInfo?.path===policy)??[];
     if(response.success!==true||matches.length!==1){stop();finish({id:request.id,ok:false,output:"pi ASEN policy extension was not loaded"});return;}
     const canonical=(path:string)=>{try{return realpathSync(path);}catch{return resolvePath(path);}};
     const expected=(request.skillPaths??[]).map(path=>canonical(resolvePath(request.repository,path)));
     const observed=response.data?.commands?.filter(item=>item.source==="skill").map(item=>typeof item.sourceInfo?.path==="string"?canonical(item.sourceInfo.path):"")??[];
     if(observed.length!==expected.length||observed.some((path,index)=>path!==expected[index])){stop();finish({id:request.id,ok:false,output:"pi native Skill paths do not match ASEN selection"});return;}
     policyLoaded=true;
     child.stdin.end(JSON.stringify({id:request.id,type:"prompt",message})+"\n");
    }
   });
   child.stderr.on("data",data=>stderr=append(stderr,data));
   child.on("error",error=>finish({id:request.id,ok:false,output:`pi process error: ${String(error)}`}));
   child.on("close",code=>{
    if(!policyLoaded)return finish({id:request.id,ok:false,output:"pi ASEN policy extension was not confirmed"});
    if(code===0&&!overflow&&this.options.validateResponseId!==false){
     try{
      const records=stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
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
   child.stdin.write(JSON.stringify({id:preflightId,type:"get_commands"})+"\n");
  });
 }
}
