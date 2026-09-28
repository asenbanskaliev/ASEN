import type {AgentRequest,AgentResult,AgentRunner} from "./dispatcher.js";
import {PiProcessRunner} from "./pi-process-runner.js";

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
 const messages=events.flatMap((x,index)=>x.type==="message_end"&&x.message?.role==="assistant"?[{index,record:x}]:[]);
 if(!messages.length||messages.some(x=>x.index>=ends[0]!||x.record.message?.stopReason==="error"))throw new Error("Pi artifact requires a completed successful assistant message");
 const final=messages.at(-1)!.record;
 if(final.message?.stopReason!=="stop")throw new Error("Pi artifact has no final assistant response");
 const contents=final.message?.content;
 if(!Array.isArray(contents)||contents.length!==1||contents[0]?.type!=="text"||typeof contents[0].text!=="string")throw new Error("Pi artifact must contain one assistant text response");
 const body=contents[0].text.trim();
 let artifact:unknown;
 try{artifact=JSON.parse(body);}catch{throw new Error("Pi artifact assistant text is not JSON");}
 if(!artifact||typeof artifact!=="object"||Array.isArray(artifact))throw new Error("Pi artifact assistant JSON must be an object");
 return body;
}

/** The lifecycle receives a Pi-produced artifact, never the raw RPC envelope. */
export class PiArtifactRunner implements AgentRunner{
 constructor(private readonly pi:PiProcessRunner){}
 async run(request:AgentRequest):Promise<AgentResult>{
  const response=await this.pi.run(request);
  if(!response.ok||response.id!==request.id)return {...response,ok:false};
  try{return {id:request.id,ok:true,output:extractPiArtifact(response.output,request.id)};}
  catch(error){return {id:request.id,ok:false,output:String(error)};}
 }
}
