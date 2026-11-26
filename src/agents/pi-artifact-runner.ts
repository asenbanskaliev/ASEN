import type {AgentArtifactProof,AgentRequest,AgentResult,AgentRunner} from "./dispatcher.js";
import {PiProcessRunner} from "./pi-process-runner.js";

const lifecycleArtifactKind:Record<string,string>={"context-init":"project-context",explore:"exploration",proposal:"proposal",specification:"specification",design:"design",tasks:"task-plan",apply:"apply-result",verify:"verification-report",archive:"archive-report"};

export function bindPiArtifactIdentity(output:string,request:AgentRequest,options:Readonly<{requireFinalSettlement?:boolean}>={}):string{
 if(!request.candidate||request.repository!==request.candidate.repository)throw new Error("Pi artifact provenance requires an exact candidate repository");
 const body=options.requireFinalSettlement?extractSettledPiArtifact(output,request.id):extractPiArtifact(output,request.id);
 let parsed:unknown;
 try{parsed=JSON.parse(body);}catch{parsed=undefined;}
 const record=parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as Record<string,unknown>:{};
 const content=typeof record.content==="string"?record.content.trim():body;
 if(!content)throw new Error("Pi artifact content must be non-empty");
 const expected={repository:request.repository,candidateId:request.candidate.id,revision:request.candidate.revision};
 for(const key of ["repository","candidateId","revision"] as const)if(record[key]!==undefined&&record[key]!==expected[key])throw new Error(`Pi artifact supplied mismatched ${key}`);
 if(record.kind!==undefined&&typeof record.kind!=="string")throw new Error("Pi artifact kind must be a string");
 const expectedKind=request.expectedPhase?lifecycleArtifactKind[request.expectedPhase]:undefined;
 if(expectedKind&&record.kind!==undefined&&record.kind!==expectedKind)throw new Error("Pi artifact supplied mismatched lifecycle kind");
 const kind=expectedKind??record.kind;
 return JSON.stringify({repository:expected.repository,candidateId:expected.candidateId,revision:expected.revision,...(kind===undefined?{}:{kind}),content});
}

/** Convert a completed Pi RPC turn into the single artifact consumed by the lifecycle. */
export function extractPiArtifact(output:string,requestId:string):string{
 let records:unknown[];
 try{records=output.trim().split(/\r?\n/).map(line=>JSON.parse(line) as unknown);}
 catch{throw new Error("Pi artifact RPC stream is malformed");}
 if(records.some(x=>!x||typeof x!=="object"||Array.isArray(x)))throw new Error("Pi artifact RPC record is invalid");
 const events=records as Array<{type?:unknown;id?:unknown;success?:unknown;message?:{role?:unknown;stopReason?:unknown;content?:unknown;errorMessage?:unknown}}>;
 const responses=events.filter(x=>x.type==="response"&&x.id===requestId);
 if(responses.length!==1||responses[0]?.success!==true)throw new Error("Pi artifact lacks exactly one successful correlated response");
 const ends=events.flatMap((x,index)=>x.type==="agent_end"?[index]:[]);
 if(ends.length!==1)throw new Error("Pi artifact turn did not finish exactly once");
 const trailing=events.slice(ends[0]!+1);
 const allowedPostTurnEvents=new Set(["response","agent_settled","extension_ui_request"]);
 if(trailing.some(x=>typeof x.type!=="string"||!allowedPostTurnEvents.has(x.type))){
  const field=(value:unknown)=>typeof value==="string"?value.slice(0,120):null;
  const metadata=trailing.map(x=>({type:field(x.type),id:field(x.id),role:field(x.message?.role),stopReason:field(x.message?.stopReason)}));
  throw new Error(`Pi artifact turn contains agent activity after agent_end: ${JSON.stringify(metadata)}`);
 }
 if(events.some(x=>typeof x.type==="string"&&x.type.startsWith("tool_execution_")))throw new Error("Pi artifact assistant response must not contain tool calls");
 const messages=events.flatMap((x,index)=>x.type==="message_end"&&x.message?.role==="assistant"?[{index,record:x}]:[]);
 if(!messages.length||messages.some(x=>x.index>=ends[0]!))throw new Error("Pi artifact requires a completed successful assistant message");
 const failedMessages=messages.filter(x=>x.record.message?.stopReason==="error");
 if(failedMessages.length){
  const retryableStatus=failedMessages.map(x=>x.record.message?.errorMessage).filter((value):value is string=>typeof value==="string").map(value=>value.match(/^(?:(?:[A-Za-z][A-Za-z0-9_-]{0,31} )?HTTP )?(429|502|503|504):/)?.[1]).find((value):value is string=>value!==undefined);
  if(retryableStatus)throw new Error(`PI_ARTIFACT_RETRYABLE_STATUS=${retryableStatus}`);
  throw new Error("Pi artifact requires a completed successful assistant message");
 }
 if(messages.some(x=>x.record.message?.stopReason==="toolUse"||Array.isArray(x.record.message?.content)&&x.record.message.content.some(item=>!!item&&typeof item==="object"&&["toolCall","tool_call"].includes(String((item as {type?:unknown}).type)))))throw new Error("Pi artifact assistant response must not contain tool calls");
 const final=messages.at(-1)!.record;
 if(final.message?.stopReason!=="stop")throw new Error("Pi artifact has no final assistant response");
 const contents=final.message?.content;
 if(!Array.isArray(contents))throw new Error("Pi artifact must contain assistant content");
 const textParts=contents.filter((item):item is {type:"text";text:string}=>!!item&&typeof item==="object"&&(item as {type?:unknown}).type==="text"&&typeof (item as {text?:unknown}).text==="string");
 if(textParts.length!==1)throw new Error("Pi artifact must contain exactly one assistant text response");
 if(contents.some(item=>!!item&&typeof item==="object"&&["toolCall","tool_call"].includes(String((item as {type?:unknown}).type))))throw new Error("Pi artifact assistant response must not contain tool calls");
 const body=textParts[0]!.text.trim();
 if(!body)throw new Error("Pi artifact assistant response must be non-empty");
 return body;
}


/**
 * Strict, opt-in artifact recovery for an authenticated, no-tools Pi read-only
 * run. An agent_end is not final: verify each attempt and the single terminal
 * agent_settled before reusing the existing one-artifact parser.
 * This function does not authorize retries or any filesystem operations.
 */
export function extractSettledPiArtifact(output:string,requestId:string):string{
 if(typeof output!=="string"||!output.trim()||output.length>512_000)
  throw new Error("Pi settled artifact stream is empty or oversized");
 let raw:unknown[];
 try{
  const lines=output.trim().split(/\r?\n/u);
  if(lines.length>2048)throw Error("too many records");
  raw=lines.map(line=>JSON.parse(line) as unknown);
 }catch{throw new Error("Pi settled artifact RPC stream is malformed");}
 const isRecord=(value:unknown):value is Record<string,unknown>=>
  value!==null&&typeof value==="object"&&!Array.isArray(value);
 if(raw.some(record=>!isRecord(record)||typeof record.type!=="string"))
  throw new Error("Pi settled artifact has invalid RPC records");
 const events=raw as Record<string,unknown>[];
 if(events.some(row=>
  typeof row.type==="string"&&(
   row.type.startsWith("tool_execution_")||
   row.type.startsWith("toolcall_")||
   row.type.startsWith("bash_execution_")||
   ["tool_call","tool_result","tool_use"].includes(row.type)
  )))throw new Error("Pi settled artifact cannot contain tool activity");
 const positions=(type:string)=>events.flatMap((row,index)=>row.type===type?[index]:[]);
 const starts=positions("agent_start"),ends=positions("agent_end"),
  messages=events.flatMap((row,index)=>row.type==="message_end"&&isRecord(row.message)&&
   row.message.role==="assistant"?[index]:[]);
 const settlements=positions("agent_settled");
 const ack=events.flatMap((row,index)=>row.type==="response"&&row.id===requestId?[index]:[]);
 if(ack.length!==1||events[ack[0]!]!.success!==true)
  throw new Error("Pi settled artifact lacks one successful correlated response");
 if(settlements.length!==1||events[settlements[0]!]!.aborted===true)
  throw new Error("Pi settled artifact lacks one non-aborted final settlement");
 const settledAt=settlements[0]!;
 if(starts.length<1||starts.length>8||starts.length!==ends.length||
  starts.length!==messages.length||ack[0]!>=starts[0]!)
  throw new Error("Pi settled artifact has ambiguous attempts");
 for(let i=0;i<starts.length;i++){
  const start=starts[i]!,message=messages[i]!,end=ends[i]!,
   previous=i===0?ack[0]!:ends[i-1]!;
  if(start<=previous||message<=start||end<=message||end>=settledAt)
   throw new Error("Pi settled artifact attempt order is invalid");
  const retry=events[end]!.willRetry;
  if(i<starts.length-1&&retry!==true||i===starts.length-1&&retry!==false)
   throw new Error("Pi settled artifact attempt lacks an explicit retry or terminal marker");
  const assistant=events[message]!.message as Record<string,unknown>;
  if(Array.isArray(assistant.content)&&assistant.content.some(item=>
   isRecord(item)&&["toolCall","tool_call"].includes(String(item.type))))
   throw new Error("Pi settled artifact assistant attempted tools");
 }
 const permittedAfter=new Set(["response","extension_ui_request"]);
 if(events.slice(ends[ends.length-1]!+1,settledAt).some(row=>
  !permittedAfter.has(String(row.type)))||
  events.slice(settledAt+1).some(row=>!permittedAfter.has(String(row.type))))
  throw new Error("Pi settled artifact contains activity outside the final attempt");
 const finalMessage=events[messages[messages.length-1]!]!;
 // Reuse the original parser for the final text, error and tool checks.
 // Earlier failed attempts can never supply content or a success proof.
 return extractPiArtifact([
  JSON.stringify({type:"response",id:requestId,success:true}),
  JSON.stringify(finalMessage),
  JSON.stringify({type:"agent_end"})
 ].join("\n"),requestId);
}

const issuedArtifactProofs=new WeakSet<object>();
export function isIssuedAgentArtifactProof(value:unknown):value is AgentArtifactProof{return typeof value==="object"&&value!==null&&issuedArtifactProofs.has(value);}
function issueArtifactProof(request:AgentRequest):AgentArtifactProof{const proof=Object.freeze({requestId:request.id,role:request.role,repository:request.repository,...(request.candidate?{candidateId:request.candidate.id,candidateRevision:request.candidate.revision}:{}),skillPaths:Object.freeze([...(request.skillPaths??[])])});issuedArtifactProofs.add(proof);return proof;}

/** The lifecycle receives a Pi-produced artifact, never the raw RPC envelope. */
export class PiArtifactRunner implements AgentRunner{
 constructor(
  private readonly pi:PiProcessRunner,
  private readonly options:Readonly<{allowSettledReadOnlyRecovery?:boolean}>={}
 ){}
 async run(request:AgentRequest,signal?:AbortSignal):Promise<AgentResult>{
  const recovery=this.options.allowSettledReadOnlyRecovery===true;
  if(recovery&&(
   request.role==="worker"||request.writeSurfaces?.length||
   request.runnerWriteReceiver!==undefined||request.phaseGrant!==undefined||
   request.modelFallback?.chain.length||
   this.pi.supportsStrictReadOnlySettlement?.()!==true
  ))return {id:request.id,ok:false,
   output:"Pi artifact recovery requires a strict, no-tools read-only process without fallback"};
  // El Dispatcher es dueño de la cancelación. El adaptador de artefactos
  // debe transmitirla al mismo proceso Pi, no esperar a que termine solo.
  const response=await this.pi.run(request,signal);
  if(signal?.aborted)return {id:request.id,ok:false,output:"Pi artifact cancellation requested"};
  if(!response.ok||response.id!==request.id)return {...response,ok:false};
  try{return {id:request.id,ok:true,output:bindPiArtifactIdentity(response.output,request,
   {requireFinalSettlement:recovery}),artifactProof:issueArtifactProof(request)};}
  catch(error){return {id:request.id,ok:false,output:String(error)};}
 }
}
