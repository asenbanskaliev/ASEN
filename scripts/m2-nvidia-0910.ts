/** M2 09/10: recuperación persistente real de ASEN y un hijo Pi NVIDIA.
 * El registro inicial es una interrupción de ensayo, sin inferencia anterior.
 * Nunca provocar 429 ni repetir llamadas para forzar evidencia del objetivo 09.
 * Un fallo natural del proveedor permite como máximo una alternativa consentida.
 */
import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {AgentRuntime,type AgentSessionIdentity} from "../src/agents/agent-runtime.js";
import {continueInterruptedExplorer} from "../src/agents/interrupted-explorer-continuation.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {PersistentAgentStore} from "../src/runtime/agents/agent-store.js";
import {createT06ReadOnlyGitFixture} from "../src/runtime/agents/t06-read-only-git-fixture.js";
import {normalizeT06PiChildSelection,validateT06PiReply} from "../src/runtime/agents/t06-pi-receipt-validator.js";
import {parseRuntimeProfiles,resolveRuntimeRoute} from "../src/runtime/lifecycle/profiles.js";
import {readProfileFallbacksFile} from "../src/runtime/lifecycle/profile-fallback-store.js";
import {plannedExplorerFallback,plannedExplorerProfileOrigin} from "../src/runtime/lifecycle/plan-dispatcher.js";
import {classifyAssistantError} from "../src/runtime/lifecycle/model-fallback-policy.js";
import type {AgentFallbackObservation} from "../src/agents/dispatcher.js";
import {startControlledFailure} from "./m2-controlled-failure.js";

const primary="nvidia/nemotron-3.5-lightning-30b-a3b";
const alternative="nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
const profile="m2-0910",sessionId="m2-0910-session",parentId="agent-m2-interrupted";
const marker="ASEN_PI_NVIDIA_A_OK",prompt="Responde únicamente con "+marker+". No utilices herramientas.";
const configuration=async(base:string)=>{
 const profiles=parseRuntimeProfiles(readFileSync(join(base,"profiles.json"),"utf8"));
 assert.ok(profiles);
 const layers={global:profiles},choice=resolveRuntimeRoute(layers,"explorer");
 assert.equal(choice.source,"global");assert.equal(profiles.active,profile);assert.equal(choice.choice?.model,primary);
 const origin=plannedExplorerProfileOrigin("explorer",primary,layers);
 assert.ok(origin);
 const fallback=plannedExplorerFallback({role:"explorer",model:primary,profiles:layers,origin,fallbacksByScope:{global:await readProfileFallbacksFile(join(base,"fallbacks.json"))}});
 assert.ok(fallback);assert.deepEqual(fallback.chain,[{model:alternative}]);
 return {...fallback,origin:{...origin,model:primary}};
};
if(process.argv[2]==="--seed"){
 // Un proceso separado persiste el estado y termina; no ejecuta modelos.
 assert.ok(!process.env.NVIDIA_API_KEY);
 const base=process.argv[3],projectId=process.argv[4];assert.ok(base&&projectId);
 const {store}=await PersistentAgentStore.open(join(base,"agents.json"));
 await store.enqueue({id:parentId,role:"explorer",prompt,repository:projectId,isolationKey:sessionId,model:primary,modelFallback:await configuration(base)},{kind:"user",id:"pi:"+sessionId});
 await store.running(parentId);
}else{
 const sha=process.env.ASEN_EXPECTED_SHA,output=process.env.ASEN_NVIDIA_PI_REPORT,piDir=process.env.PI_CODING_AGENT_DIR;
 const controlled=process.env.ASEN_M2_CONTROLLED_FAILURE==="1";
 assert.ok(process.env.ASEN_M2_CONTROLLED_FAILURE===undefined||controlled);
 assert.ok(sha&&/^[a-f0-9]{40}$/u.test(sha)&&process.env.ASEN_M2_TRIAL_AUTHORIZED===sha&&process.env.GITHUB_RUN_ATTEMPT==="1"&&process.env.PR_NUMBER==="161");
 assert.ok(output&&piDir&&process.env.NVIDIA_API_KEY);
 const root=realpathSync(resolve(process.env.GITHUB_WORKSPACE??process.cwd()));
 assert.equal(execFileSync("git",["-C",root,"rev-parse","HEAD"],{encoding:"utf8",timeout:10000}).trim(),sha);
 const retry=JSON.parse(readFileSync(join(piDir,"settings.json"),"utf8")).retry;
 assert.ok(retry?.enabled===false&&retry?.maxRetries===0&&retry?.provider?.maxRetries===0);
 const base=realpathSync(mkdtempSync(join(tmpdir(),"asen-m2-0910-")));
 const fixture=createT06ReadOnlyGitFixture();
 const identity:AgentSessionIdentity={sessionId,projectId:realpathSync(fixture.children[0])};
 const report={schema:"asen.m2.0910/v1",sha,profile,sessionId,projectId:identity.projectId,continuationOf:parentId,resumedTaskId:null as string|null,primary,alternative,objective09:"BLOCKED",objective10:"BLOCKED",stage:"seed",providerFailureCategory:null as string|null,primarySelected:false,alternativeConsents:0,alternativeSwitches:0,interruptedRecordSeeded:true,storeReopened:false,nativeParentRestartProven:false,providerResponseVerified:false,gitClean:false,billingVerified:false,globalFull:false};
 let proxy:Awaited<ReturnType<typeof startControlledFailure>>|undefined;
 const controlledReport={mode:controlled?"controlled-local-429":"natural",proxy:null as ReturnType<Awaited<ReturnType<typeof startControlledFailure>>["receipt"]>|null};
 let runtime:AgentRuntime|undefined;
 let started:Promise<unknown>|undefined;
 let childId:string|undefined;
 let consentCount=0;
 const switches:AgentFallbackObservation[]=[];
 let selectedPrimary=false;
 try{
  writeFileSync(join(base,"profiles.json"),JSON.stringify({schema:"asen.runtime-profiles/v1",active:profile,profiles:[{name:profile,routes:{explorer:{model:primary}}}]}),{mode:0o600,flag:"wx"});
  writeFileSync(join(base,"fallbacks.json"),JSON.stringify({schema:"asen.profile-fallbacks/v1",profiles:{[profile]:{explorer:[{model:alternative}]}}}),{mode:0o600,flag:"wx"});
  const env={PATH:process.env.PATH,HOME:base,USERPROFILE:base,PI_CODING_AGENT_DIR:join(base,"seed-pi")};
  const seeded=spawnSync("tsx",[fileURLToPath(import.meta.url),"--seed",base,identity.projectId],{env,timeout:30000,stdio:"ignore"});
  assert.equal(seeded.status,0,"No se pudo crear el registro aislado");
  report.stage="recovery";
  if(controlled){
   proxy=await startControlledFailure({apiKey:process.env.NVIDIA_API_KEY!,marker,prompt,authorized:()=>consentCount===1&&switches.length===1&&switches[0]?.from===primary&&switches[0]?.to===alternative&&switches[0]?.category==="rate_limit"});
   // Pi conserva sus modelos NVIDIA nativos; solo cambia la URL y la clave local.
   writeFileSync(join(piDir,"models.json"),JSON.stringify({providers:{nvidia:{baseUrl:proxy.baseUrl,apiKey:proxy.localKey}}}),{mode:0o600,flag:"wx"});
   delete process.env.NVIDIA_API_KEY;
  }
  const runner=new PiProcessRunner({command:"pi",policyRoot:root,noTools:true,requireChildModelBeforePrompt:true,...(controlled?{}:{providerCredential:"NVIDIA_API_KEY" as const}),timeoutMs:65000,maxOutputBytes:96000,maxRpcRecordBytes:64000,maxStreamBytes:256000,
   authorizeModelFallback:(request,signal)=>{
    if(signal?.aborted||!selectedPrimary||consentCount!==0||request.role!=="explorer"||request.sessionId!==sessionId||request.projectId!==identity.projectId||request.to!==alternative)return false;
    if(controlled&&proxy?.receipt().local429!==1)return false;
    consentCount++;return true;
   },
   onModelFallback:event=>{switches.push(event);}
  });
  runner.subscribeChildSelection(event=>{if(event.sessionId===sessionId&&event.projectId===identity.projectId&&normalizeT06PiChildSelection(event.model,primary)===primary)selectedPrimary=true;});
  runtime=await AgentRuntime.open({storeFile:join(base,"agents.json"),runner,maxConcurrency:1});
  const old=await runtime.query(parentId,identity);
  assert.equal(old?.record.state,"interrupted");
  assert.equal(old?.spec.model,primary);
  report.storeReopened=true;report.stage="native-child";
  const pending=continueInterruptedExplorer({runtime,agentId:parentId,identity,resolveCurrentIdentity:async()=>identity,readCurrentDirectFallback:()=>configuration(base)});
  started=pending;
  const resumed=await pending;childId=resumed.id;report.resumedTaskId=childId;
  assert.notEqual(childId,parentId);
  const deadline=Date.now()+145000;
  while(Date.now()<deadline){
   const record=await runtime.query(childId,identity);
   if(record&&["completed","failed","cancelled"].includes(record.record.state))break;
   await new Promise(r=>setTimeout(r,250));
  }
  const entry=await runtime.entry(childId,identity);
  report.primarySelected=selectedPrimary;
  report.alternativeConsents=consentCount;report.alternativeSwitches=switches.length;
  assert.equal(entry?.request.continuationOf,parentId);
  assert.equal(entry?.request.model,primary);
  assert.equal(entry?.record.state,"completed");
  assert.ok(entry?.result&&selectedPrimary);
  const lines=entry.result.output.split(/\r?\n/u).filter(Boolean).map(line=>JSON.parse(line));
  assert.ok(!lines.some(row=>row.type==="tool_execution_start"||row.type==="tool_execution_end"||row.type==="agent_end"&&row.willRetry===true||row.type==="agent_settled"&&row.aborted===true));
  const assistants=lines.filter(row=>row.type==="message_end"&&row.message?.role==="assistant");
  const expected=switches.length===1?alternative:primary;
  const final=assistants.at(-1);
  assert.ok(final);
  const receipt=validateT06PiReply({output:JSON.stringify(final),expectedMarker:marker,expectedModel:expected,modelObservedByRunner:switches.length===1?switches[0]!.to:selectedPrimary?primary:null});
  assert.ok(receipt.verified&&receipt.piReportedUsage,"Respuesta y consumo informado por Pi no verificados");
  report.providerResponseVerified=true;
  if(switches.length===0){
   assert.equal(assistants.length,1);assert.equal(consentCount,0);
   report.objective10="PASS_RECOVERED_EXPLORER_PRIMARY_MODEL";
   report.objective09="NO_PROVIDER_FAILURE_OBSERVED";
  }else{
   assert.equal(switches.length,1);assert.equal(consentCount,1);assert.equal(assistants.length,2);
   const failed=assistants[0].message,category=classifyAssistantError(failed);
   assert.equal(normalizeT06PiChildSelection({provider:failed.provider,id:failed.model},primary),primary);
   assert.ok(category&&category===switches[0]!.category);
   assert.equal(switches[0]!.from,primary);assert.equal(switches[0]!.to,alternative);assert.equal(switches[0]!.taskId,childId);
   report.providerFailureCategory=category;
   if(controlled){
    const proof=proxy?.receipt();
    assert.ok(proof&&proof.local429===1&&proof.upstreamRequests===1&&proof.rejectedRequests===0&&proof.contextPreserved&&proof.upstreamStatus===200&&proof.upstreamModel===alternative&&proof.usage&&category==="rate_limit");
    report.objective09="PASS_CONTROLLED_429_REAL_CHILD_FALLBACK";
    report.objective10="PRIMARY_SELECTED_BEFORE_CONTROLLED_FAILURE";
   }else{
    report.objective09="PASS_NATURAL_FAILURE_CHILD_FALLBACK";
    report.objective10="PRIMARY_SELECTED_BEFORE_NATURAL_FAILURE";
   }
  }
  if(controlled)assert.equal(report.objective09,"PASS_CONTROLLED_429_REAL_CHILD_FALLBACK");
  report.stage="complete";
 }catch{report.stage="blocked-"+report.stage;}
 finally{
  if(started)await Promise.allSettled([started]);
  let stopped=true;
  try{await runtime?.cancelSession(identity);}catch{stopped=false;}
  report.primarySelected=selectedPrimary;report.alternativeConsents=consentCount;report.alternativeSwitches=switches.length;
  if(stopped){
   try{const git=fixture.observe();report.gitClean=git.isolated&&git.sourceClean&&git.children.every(x=>x.pinned&&x.clean&&x.linked);}
   catch{report.gitClean=false;}
   fixture.cleanup();rmSync(base,{recursive:true,force:true});
  }
  if(proxy){await proxy.close();controlledReport.proxy=proxy.receipt();
   if(controlledReport.proxy.rejectedRequests!==0||controlledReport.proxy.upstreamRequests!==1||controlledReport.proxy.local429!==1){report.stage="blocked-controlled-final-count";}
  }
  if(!report.gitClean||report.stage!=="complete"){report.objective09="BLOCKED";report.objective10="BLOCKED";}
  mkdirSync(resolve(output,".."),{recursive:true,mode:0o700});
  writeFileSync(output,JSON.stringify({...report,controlled:controlledReport},null,2)+"\n",{mode:0o600,flag:"wx"});
  console.log(JSON.stringify({...report,controlled:controlledReport}));
 }
 // No convertir ausencia de fallo ni evidencia parcial en aceptación global.
 if(report.stage!=="complete"||!report.gitClean||!report.providerResponseVerified)process.exitCode=1;
}
