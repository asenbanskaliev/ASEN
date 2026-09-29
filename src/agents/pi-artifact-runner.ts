import type {AgentArtifactProof,AgentRequest,AgentResult,AgentRunner} from "./dispatcher.js";
import {PiProcessRunner} from "./pi-process-runner.js";

const lifecycleArtifactKind:Record<string,string>={"context-init":"project-context",explore:"exploration",proposal:"proposal",specification:"specification",design:"design",tasks:"task-plan",apply:"apply-result",verify:"verification-report",archive:"archive-report"};

export function bindPiArtifactIdentity(output:string,request:AgentRequest):string{
 if(!request.candidate||request.repository!==request.candidate.repository)throw new Error("Pi artifact provenance requires an exact candidate repository");
 const body=extractPiArtifact(output,request.id);
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
 const events=records as Array<{type?:unknown;id?:unknown;success?:unknown;message?:{role?:unknown;stopReason?:unknown;content?:unknown}}>;
 const responses=events.filter(x=>x.type==="response"&&x.id===requestId);
 if(responses.length!==1||responses[0]?.success!==true)throw new Error("Pi artifact lacks exactly one successful correlated response");
 const ends=events.flatMap((x,index)=>x.type==="agent_end"?[index]:[]);
 if(ends.length!==1)throw new Error("Pi artifact turn did not finish exactly once");
 const trailing=events.slice(ends[0]!+1);
 const allowedPostTurnEvents=new Set(["response","agent_settled","extension_ui_request"]);
 if(trailing.some(x=>typeof x.type!=="string"||!allowedPostTurnEvents.has(x.type)))throw new Error("Pi artifact turn contains agent activity after agent_end");
 const messages=events.flatMap((x,index)=>x.type==="message_end"&&x.message?.role==="assistant"?[{index,record:x}]:[]);
 if(!messages.length||messages.some(x=>x.index>=ends[0]!||x.record.message?.stopReason==="error"))throw new Error("Pi artifact requires a completed successful assistant message");
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

const issuedArtifactProofs=new WeakSet<object>();
export function isIssuedAgentArtifactProof(value:unknown):value is AgentArtifactProof{return typeof value==="object"&&value!==null&&issuedArtifactProofs.has(value);}
function issueArtifactProof(request:AgentRequest):AgentArtifactProof{const proof=Object.freeze({requestId:request.id,role:request.role,repository:request.repository,...(request.candidate?{candidateId:request.candidate.id,candidateRevision:request.candidate.revision}:{}),skillPaths:Object.freeze([...(request.skillPaths??[])])});issuedArtifactProofs.add(proof);return proof;}

/** The lifecycle receives a Pi-produced artifact, never the raw RPC envelope. */
export class PiArtifactRunner implements AgentRunner{
 constructor(private readonly pi:PiProcessRunner){}
 async run(request:AgentRequest):Promise<AgentResult>{
  const response=await this.pi.run(request);
  if(!response.ok||response.id!==request.id)return {...response,ok:false};
  try{return {id:request.id,ok:true,output:bindPiArtifactIdentity(response.output,request),artifactProof:issueArtifactProof(request)};}
  catch(error){return {id:request.id,ok:false,output:String(error)};}
 }
}
