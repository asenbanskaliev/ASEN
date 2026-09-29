import {spawn,type ChildProcess} from "node:child_process";
import {join,resolve as resolvePath} from "node:path";
import {mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import type {AgentRequest,AgentResult,AgentRunner} from "./dispatcher.js";
import {matchesIssuedSkillContext} from "../skills/context.js";
import {selectSkills} from "../skills/registry.js";
import {authorizePiWriteGrant} from "../lifecycle/skill-lifecycle.js";

export interface PiProcessOptions{
 command?:string;
 rpcArgs?:string[];
 extraArgs?:string[];
 timeoutMs?:number;
 maxOutputBytes?:number;
 signal?:AbortSignal;
 providerExtension?:string;
 noTools?:boolean;
}

// This digest pins the reviewed policy source. Update it only after auditing extensions/authority.ts.
const authorityDigest="d8f2e3b139245e0230fa93569814fbd47195dc8fff7fca25175e94cf8ce2f9d2";

async function terminateTree(child:ChildProcess,closed:Promise<void>):Promise<void>{
 if(!child.pid){await closed;return;}
 if(process.platform==="win32"){
  await new Promise<void>(resolve=>{
   const killer=spawn("taskkill",["/pid",String(child.pid),"/T","/F"],{stdio:"ignore",windowsHide:true});
   killer.once("error",()=>{child.kill("SIGKILL");resolve();});
   killer.once("close",code=>{if(code!==0)child.kill("SIGKILL");resolve();});
  });
 }else{
  try{process.kill(-child.pid,"SIGKILL");}catch{child.kill("SIGKILL");}
 }
 await closed;
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
  if(request.candidate&&(!request.skillContext||!request.skillPaths))return Promise.resolve({id:request.id,ok:false,output:"Candidate-bound Pi execution requires issued skill context and exact paths"});
  if(request.skillContext){
   const rolePhase=request.role==="explorer"?"explore":request.role==="reviewer"?"adversarial-review":request.role==="verifier"?"verify":undefined;
   if(request.expectedPhase&&rolePhase&&request.expectedPhase!==rolePhase)return Promise.resolve({id:request.id,ok:false,output:"Pi expected phase does not match agent role"});
   const requiredPhase=rolePhase??request.expectedPhase;
   if(requiredPhase&&request.skillContext.phase!==requiredPhase)return Promise.resolve({id:request.id,ok:false,output:"Pi skill context phase does not match agent role"});
  }
  if(request.writeSurfaces?.length&&request.skillContext?.phase!=="apply")return Promise.resolve({id:request.id,ok:false,output:"Pi write authority requires issued apply phase"});
  const command=this.options.command??"pi";
  let message:string;
  try{message=promptWithSkills(request);}
  catch(error){return Promise.resolve({id:request.id,ok:false,output:`pi skill path error: ${String(error)}`});}
  const extra=this.options.extraArgs??[];
  if([...(this.options.rpcArgs??[]),...extra].some(arg=>arg==="--"||arg.startsWith("-t")&&!arg.startsWith("--")||arg.startsWith("-e")&&!arg.startsWith("--")||["--skill","--no-skills","-ns","--extension","--tools","--no-tools","-nt","--no-builtin-tools","-nbt"].some(flag=>arg===flag||arg.startsWith(flag+"="))))
   return Promise.resolve({id:request.id,ok:false,output:"pi skill and tool arguments must be issued by ASEN"});
  if(request.writeSurfaces?.length&&request.role!=="worker")return Promise.resolve({id:request.id,ok:false,output:"Only a worker may request write tools"});
  const writer=request.role==="worker"&&!!request.writeSurfaces?.length&&!!request.candidate&&!!request.skillContext;
  if(writer&&!authorizePiWriteGrant(request))return Promise.resolve({id:request.id,ok:false,output:"Pi write tools require an active ASEN lifecycle grant"});
  const providerExtension=this.options.providerExtension;
  if(providerExtension&&providerExtension!=="npm:pi-free")return Promise.resolve({id:request.id,ok:false,output:"untrusted Pi provider extension"});
  const candidatePolicy=resolvePath(request.repository,"extensions/authority.ts");
  let policySource:string;
  try{
   policySource=readFileSync(candidatePolicy,"utf8").replace(/\r\n/g,"\n");
   const digest=createHash("sha256").update(policySource).digest("hex");
   if(digest!==authorityDigest)throw new Error("mismatch");
  }catch{return Promise.resolve({id:request.id,ok:false,output:"pi authority extension integrity check failed"});}
  let policyDirectory:string;
  try{
   policyDirectory=mkdtempSync(join(tmpdir(),"asen-policy-"));
   writeFileSync(join(policyDirectory,"authority.ts"),policySource,{mode:0o400,flag:"wx"});
  }catch(error){
   if(policyDirectory!)rmSync(policyDirectory,{recursive:true,force:true});
   return Promise.resolve({id:request.id,ok:false,output:`pi authority extension preparation failed: ${String(error)}`});
  }
  const policy=join(policyDirectory,"authority.ts");
  const args=[...(this.options.rpcArgs??["--mode","rpc"]),...extra,
   "--no-extensions","--extension",policy,...(providerExtension?["--extension",providerExtension]:[]),"--no-skills",...(this.options.noTools?["--no-tools"]:["--tools",writer?"read,edit,write":"read"]),...(request.skillPaths??[]).flatMap(path=>["--skill",path])];
  const timeoutMs=this.options.timeoutMs??120_000;
  const max=this.options.maxOutputBytes??1_000_000;

  return new Promise(resolve=>{
   const child=spawn(command,args,{
    cwd:request.repository,
    env:{...process.env,ASEN_PI_AUTHORITY:JSON.stringify({repository:request.repository,role:request.role,writeSurfaces:writer?request.writeSurfaces:[]})},
    stdio:["pipe","pipe","pipe"],
    detached:process.platform!=="win32"
   });
   let stdout="",stderr="",settled=false,overflow=false,buffer="",policyLoaded=false,stopResult:AgentResult|undefined;
   const preflightId=`asen-policy:${request.id}`;
   const closed=new Promise<void>(resolveClosed=>{child.once("close",()=>resolveClosed());child.once("error",()=>{if(child.pid===undefined)resolveClosed();});});
   let timer:ReturnType<typeof setTimeout>|undefined;

   const finish=(result:AgentResult)=>{
    if(settled)return;
    settled=true;
    clearTimeout(timer);
    this.options.signal?.removeEventListener("abort",onAbort);
    rmSync(policyDirectory,{recursive:true,force:true});
    resolve(result);
   };
   const stop=(result:AgentResult)=>{
    if(stopResult)return;
    stopResult=result;
    void terminateTree(child,closed).then(()=>finish(result));
   };
   const onAbort=()=>stop({id:request.id,ok:false,output:"pi process cancelled"});
   const append=(current:string,data:unknown)=>{
    const next=current+String(data);
    if(Buffer.byteLength(next)>max){overflow=true;stop({id:request.id,ok:false,output:`pi output exceeded ${max} bytes`});return current;}
    return next;
   };

   child.stdout.on("data",data=>{
    stdout=append(stdout,data);buffer+=String(data);
    let end;while((end=buffer.indexOf("\n"))>=0){
     const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
     let record:unknown;try{record=JSON.parse(line);}catch{continue;}
     const response=record as {type?:string;id?:string;success?:boolean;data?:{commands?:Array<{name:string;source:string;sourceInfo?:{path:string}}>}};
     if(response.type==="agent_end"&&policyLoaded){child.stdin.end();continue;}
     if(response.type!=="response"||response.id!==preflightId)continue;
     const matches=response.data?.commands?.filter(item=>item.name==="asen-authority-status"&&item.source==="extension"&&item.sourceInfo?.path===policy)??[];
     if(response.success!==true||matches.length!==1){stop({id:request.id,ok:false,output:"pi ASEN policy extension was not loaded"});return;}
     const canonical=(path:string)=>{try{return realpathSync(path);}catch{return resolvePath(path);}};
     const expected=(request.skillPaths??[]).map(path=>canonical(resolvePath(request.repository,path)));
     const observed=response.data?.commands?.filter(item=>item.source==="skill").map(item=>typeof item.sourceInfo?.path==="string"?canonical(item.sourceInfo.path):"")??[];
     if(observed.length!==expected.length||observed.some((path,index)=>path!==expected[index])){stop({id:request.id,ok:false,output:"pi native Skill paths do not match ASEN selection"});return;}
     policyLoaded=true;
     child.stdin.write(JSON.stringify({id:request.id,type:"prompt",message})+"\n");
    }
   });
   child.stderr.on("data",data=>stderr=append(stderr,data));
   child.on("error",error=>{if(!stopResult)finish({id:request.id,ok:false,output:`pi process error: ${String(error)}`});});
   child.on("close",code=>{
    if(stopResult)return;
    if(!policyLoaded)return finish({id:request.id,ok:false,output:"pi ASEN policy extension was not confirmed"});
    if(code===0&&!overflow){
     try{
      const records=stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
      const responses=records.filter(record=>record?.type==="response"&&record?.id===request.id);
      if(!responses.length)return finish({id:request.id,ok:false,output:"pi correlated response missing"});
      if(responses.length!==1)return finish({id:request.id,ok:false,output:"pi requires exactly one correlated response"});
      const envelope=responses[0];
      if(envelope.success!==true)return finish({id:request.id,ok:false,output:"pi correlated response failed"});
     }catch{
      return finish({id:request.id,ok:false,output:"pi response envelope invalid"});
     }
    }
    finish({
     id:request.id,
     ok:code===0&&!overflow,
     output:overflow?`pi output exceeded ${max} bytes`:code===0?stdout:`pi process exited with code ${code??"unknown"}`
    });
   });

   timer=setTimeout(()=>{
    stop({id:request.id,ok:false,output:`pi process timed out after ${timeoutMs}ms`});
   },timeoutMs);

   if(this.options.signal?.aborted)onAbort();
   else this.options.signal?.addEventListener("abort",onAbort,{once:true});

   child.stdin.on("error",error=>stop({id:request.id,ok:false,output:`pi stdin error: ${String(error)}`}));
   child.stdin.write(JSON.stringify({id:preflightId,type:"get_commands"})+"\n");
  });
 }
}
