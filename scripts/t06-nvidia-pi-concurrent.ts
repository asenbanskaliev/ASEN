/**
 * T06: dos sesiones Pi RPC autenticadas con NVIDIA mediante AgentRuntime real.
 * Explorer y Verifier sin herramientas ni escritura, con prompts sintéticos.
 * No demuestra todavía Writer/grants del flujo completo.
 */
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {createT06ReadOnlyGitFixture} from "../src/runtime/agents/t06-read-only-git-fixture.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";

const model="nvidia/nemotron-3.5-lightning-30b-a3b";
const marker=["ASEN_PI_NVIDIA_A_OK","ASEN_PI_NVIDIA_B_OK"] as const;
const roles=["explorer","verifier"] as const;
const root=resolve(process.env.GITHUB_WORKSPACE??process.cwd());
const evidenceFile=process.env.ASEN_NVIDIA_PI_REPORT;
if(!process.env.NVIDIA_API_KEY||!evidenceFile)throw Error("Prueba Pi NVIDIA BLOQUEADA: faltan credenciales o ubicación privada de evidencias");
const base=mkdtempSync(join(tmpdir(),"asen-pi-nvidia-t06-"));
const gitFixture=createT06ReadOnlyGitFixture();
const instances=[0,1].map(index=>{
 const dir=gitFixture.children[index]!;
 const identity={sessionId:"asen-t06-nvidia-pi-"+(index+1),projectId:dir};
 const observation:{pid:number|null;spawnedAt:number|null;closedAt:number|null;reportedModel:string|null;result:string}={
  pid:null,spawnedAt:null,closedAt:null,reportedModel:null,result:"pending"
 };
 const runner=new PiProcessRunner({
  command:"pi",policyRoot:root,providerCredential:"NVIDIA_API_KEY",
  noTools:true,timeoutMs:90_000,maxOutputBytes:48_000,
  maxStreamBytes:128_000,maxRpcRecordBytes:64_000,
  onProcessStart:pid=>{observation.pid=pid;observation.spawnedAt=performance.now();},
  onProcessClose:()=>{observation.closedAt=performance.now();}
 });
 runner.subscribeChildSelection(event=>{
  if(event.sessionId===identity.sessionId&&event.projectId===identity.projectId&&event.model)
   // Pi puede devolver el identificador con el prefijo del proveedor
   // incorporado; normalizarlo solo cuando coincide exactamente.
   observation.reportedModel=event.model.provider==="nvidia"&&
    (event.model.id===model||event.model.provider+"/"+event.model.id===model)?
    model:event.model.provider+"/"+event.model.id;
 });
 return {identity,observation,runner};
});
const wrapper={
 run:(request:Parameters<PiProcessRunner["run"]>[0],signal?:AbortSignal)=>{
  const item=instances.find(x=>x.identity.sessionId===request.isolationKey&&x.identity.projectId===request.repository);
  if(!item)throw Error("No existe una sesión Pi hija coincidente para el agente");
  return item.runner.run(request,signal);
 }
};
const status={schema:"asen.t06.nvidia.pi-dual/v2",source:"native-PiProcessRunner-and-AgentRuntime",
 requestedModel:model,modelActual:"unknown",workers:[] as Array<Record<string,unknown>>,
 concurrentlyRunning:false,providerAuthenticated:false,autoMerge:false,writerGranted:false,
 executionKind:"READ_ONLY_EXPLORER_VERIFIER_IN_GIT_WORKTREES_NOT_WRITER",
 gitWorktreesVerified:false,gitSourceClean:false,gitChildrenClean:false,
 result:"BLOCKED",at:new Date().toISOString()};
try{
 const runtime=await AgentRuntime.open({storeFile:join(base,"agents.json"),runner:wrapper,maxConcurrency:2});
 const ids=await Promise.all(instances.map((x,i)=>runtime.startReadOnly({
  role:roles[i]!,prompt:"Analiza sin editar archivos. Responde únicamente con "+marker[i]+". No uses herramientas ni texto adicional.",
  session:x.identity,model
 })));
 const deadline=Date.now()+105_000;
 while(Date.now()<deadline){
  const all=await Promise.all(instances.map((x,i)=>runtime.list(x.identity).then(rows=>
   rows.find(row=>row.id===ids[i])?.state??"unknown")));
  if(all.every(s=>["completed","failed","cancelled","interrupted"].includes(s)))break;
  await new Promise(r=>setTimeout(r,250));
 }
 const records=await Promise.all(instances.map((x,i)=>runtime.entry(ids[i]!,x.identity)));
 const complete=records.every(x=>x?.record.state==="completed"&&!!x.result);
 const intervals=instances.map(x=>x.observation);
 status.concurrentlyRunning=intervals.every(x=>x.spawnedAt!==null&&x.closedAt!==null)&&
  Math.max(...intervals.map(x=>x.spawnedAt!))<Math.min(...intervals.map(x=>x.closedAt!));
 for(let i=0;i<2;i++){
  const entry=records[i],item=instances[i]!;
  const output=entry?.result?.output??"";
  const messageEnds=output.split(/\r?\n/u).filter(Boolean).flatMap(line=>{
   try{const data=JSON.parse(line);return data?.type==="message_end"&&data?.message?.role==="assistant"?[data.message]:[];}
   catch{return [];}
  });
  const replyMatched=messageEnds.some((message:any)=>Array.isArray(message.content)&&
   message.content.some((part:{type:string;text?:string})=>part.type==="text"&&part.text?.includes(marker[i]!)));
  const modelEvent=item.observation.reportedModel;
  const chosen=messageEnds.some((message:any)=>message.provider==="nvidia"&&
   message.model==="nemotron-3.5-lightning-30b-a3b")?
   model: modelEvent;
  const verified=entry?.record.state==="completed"&&replyMatched&&chosen===model;
  item.observation.result=verified?"verified-pi-message":"not-verified";
  status.workers.push({
   sessionId:item.identity.sessionId,agentRole:roles[i]!,
   recordState:entry?.record.state??"missing",modelSelected:chosen??"unknown",
   messageVerified:replyMatched,pidObserved:item.observation.pid!==null,
   durationMs:item.observation.closedAt!==null&&item.observation.spawnedAt!==null?
    Math.round(item.observation.closedAt-item.observation.spawnedAt):null
  });
 }
 status.providerAuthenticated=complete&&status.workers.every(x=>x.modelSelected===model&&x.messageVerified===true);
 status.modelActual=status.providerAuthenticated?model:"unknown";
 status.result=status.providerAuthenticated&&status.concurrentlyRunning?"PASS_READ_ONLY_PI_CONCURRENT":"BLOCKED";
}finally{
 try{
  const git=gitFixture.observe();
  status.gitSourceClean=git.sourceClean;
  status.gitChildrenClean=git.children.length===2&&git.children.every(x=>x.clean);
  status.gitWorktreesVerified=git.isolated&&git.sourceClean&&
   git.children.length===2&&git.children.every(x=>x.pinned&&x.clean&&x.linked);
 }catch{status.gitWorktreesVerified=false;}
 if(!status.gitWorktreesVerified)status.result="BLOCKED";
 const output=resolve(evidenceFile);
 mkdirSync(resolve(output,".."),{recursive:true,mode:0o700});
 writeFileSync(output,JSON.stringify(status,null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});
 gitFixture.cleanup();
 rmSync(base,{recursive:true,force:true});
 process.stdout.write(JSON.stringify({
  result:status.result,model:status.modelActual,
  concurrent:status.concurrentlyRunning,gitWorktreesVerified:status.gitWorktreesVerified,
  states:status.workers.map(w=>w.recordState)
 })+"\n");
}
if(status.result!=="PASS_READ_ONLY_PI_CONCURRENT")process.exitCode=1;
