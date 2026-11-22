/** Revisión independiente T06: aceptar solamente dictámenes Pi completos, sin tools,
 * sobre los dos archivos y sus SHA exactos. No otorga aceptación ni permiso Writer. */
export interface T06NativeReviewReceipt{
 readonly verdict:"pass"|"fail";
 readonly findingCount:number;
 readonly reviewedPaths:readonly string[];
 readonly reviewedSha256:readonly string[];
 readonly reviewerSummary:string;
 readonly acceptance:"not-accepted";
 readonly writerAuthority:false;
}
const safeText=(value:unknown,max=500):value is string=>
 typeof value==="string"&&value.length>0&&value.length<=max&&
 value===value.trim()&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value);
const sha=/^[a-f0-9]{64}$/u;
const expectedPaths=["t06-writer-a.mjs","t06-writer-b.mjs"] as const;
/** Evidencia acotada de eventos Pi; jamás conserva el texto del proveedor. */
export function observeT06ReviewStream(output:unknown):Readonly<{
 assistantMessages:number;settledEvents:number;textBlocks:number;
 finalReason:"stop"|"error"|"length"|"toolUse"|"unknown";
}>{
 let assistantMessages=0,settledEvents=0,textBlocks=0;
 let finalReason:"stop"|"error"|"length"|"toolUse"|"unknown"="unknown";
 const empty=()=>Object.freeze({assistantMessages:0,settledEvents:0,textBlocks:0,
  finalReason:"unknown" as const});
 if(typeof output!=="string"||output.length>512_000)return empty();
 try{
  for(const line of output.split(/\r?\n/u)){
   if(!line.trim())continue;
   const value:unknown=JSON.parse(line);
   if(!value||typeof value!=="object"||Array.isArray(value))continue;
   const record=value as {type?:unknown;message?:unknown};
   if(record.type==="agent_settled")settledEvents++;
   if(record.type!=="message_end"||!record.message||
    typeof record.message!=="object"||Array.isArray(record.message))continue;
   const message=record.message as {role?:unknown;stopReason?:unknown;content?:unknown};
   if(message.role!=="assistant")continue;
   assistantMessages++;
   finalReason=["stop","error","length","toolUse"].includes(String(message.stopReason))?
    message.stopReason as typeof finalReason:"unknown";
   if(Array.isArray(message.content))
    for(const block of message.content)
     if(block&&typeof block==="object"&&!Array.isArray(block)&&
      (block as {type?:unknown}).type==="text")textBlocks++;
  }
 }catch{return empty();}
 return Object.freeze({assistantMessages:Math.min(assistantMessages,32),
  settledEvents:Math.min(settledEvents,32),textBlocks:Math.min(textBlocks,64),finalReason});
}
export function parseT06NativeReviewReceipt(
 output:unknown,expectedSha:Readonly<Record<string,string>>
):T06NativeReviewReceipt{
 if(typeof output!=="string"||output.length>512_000||
  expectedPaths.some(path=>!sha.test(expectedSha[path]??"")))
  throw new Error("T06 independent review has no bounded candidate evidence");
 let records:unknown[];
 try{records=output.trim().split(/\r?\n/u).filter(Boolean).map(line=>JSON.parse(line));}
 catch{throw new Error("T06 independent Pi review stream is invalid");}
 if(records.some(row=>typeof row==="object"&&row!==null&&"type" in row&&
  typeof row.type==="string"&&(row.type.startsWith("tool_execution_")||
  row.type.startsWith("toolcall_"))))
  throw new Error("T06 independent review cannot include any tool execution");
 const messages=records.filter(row=>typeof row==="object"&&row!==null&&
  "type" in row&&row.type==="message_end"&&"message" in row&&
  typeof row.message==="object"&&row.message!==null&&
  "role" in row.message&&row.message.role==="assistant");
 if(messages.length===0)throw new Error("T06 independent Pi review returned no assistant message");
 // Pi puede producir un message_end fallido seguido de otro correcto si su
 // mecanismo de recuperación repite el intento. Los mensajes anteriores
 // SOLO se ignoran si stopReason confirma explícitamente "error".
 const prior=messages.slice(0,-1);
 const isFailedAttempt=(row:unknown):boolean=>{
  if(!row||typeof row!=="object"||!("message" in row))return false;
  const assistant=row.message;
  return !!assistant&&typeof assistant==="object"&&
   "stopReason" in assistant&&assistant.stopReason==="error";
 };
 if(prior.some(row=>!isFailedAttempt(row)))
  throw new Error("T06 independent review has multiple completed assistant verdicts");
 const finalEntry=messages.at(-1);
 if(!finalEntry||typeof finalEntry!=="object"||!("message" in finalEntry))
  throw new Error("T06 independent Pi review returned no assistant message");
 const message=finalEntry.message;
 if(!message||typeof message!=="object")
  throw new Error("T06 independent Pi review returned no assistant message");
 if("stopReason" in message&&message.stopReason==="length")
  throw new Error("T06 independent review was truncated");
 if("stopReason" in message&&message.stopReason==="error")
  throw new Error("T06 independent review ended with assistant error");
 if("stopReason" in message&&message.stopReason!=="stop"||
  prior.length>0&&(!("stopReason" in message)||message.stopReason!=="stop"))
  throw new Error("T06 independent review did not finish successfully");
 if(!("content" in message)||!Array.isArray(message.content))
  throw new Error("T06 independent Pi review returned no assistant message");
 const contents=message.content;
 if(contents.length<1||contents.length>64)
  throw new Error("T06 independent reviewer returned unsupported content");
 let jsonText="",thoughtLength=0;
 for(const block of contents){
  if(!block||typeof block!=="object")
   throw new Error("T06 independent reviewer returned unsupported content");
  if(block.type==="thinking"){
   if(typeof block.thinking!=="string")
    throw new Error("T06 independent reviewer returned unsupported thinking");
   thoughtLength+=block.thinking.length;
   if(thoughtLength>128_000)
    throw new Error("T06 independent reviewer thinking exceeded limit");
   continue;
  }
  if(block.type!=="text"||typeof block.text!=="string")
   throw new Error("T06 independent reviewer returned unsupported content");
  jsonText+=block.text;
  if(jsonText.length>24_000)
   throw new Error("T06 independent reviewer verdict exceeded limit");
 }
 if(!jsonText.trim())
  throw new Error("T06 independent reviewer returned no JSON verdict");
 let payload:unknown;try{payload=JSON.parse(jsonText.trim());}
 catch{throw new Error("T06 independent reviewer did not return strict JSON");}
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||
  Object.keys(payload).sort().join(",")!=="findings,reviewedFiles,summary,verdict"||
  !("verdict" in payload)||typeof payload.verdict!=="string"||
  !["pass","fail"].includes(payload.verdict)||
  !("summary" in payload)||!safeText(payload.summary,1000)||
  !("reviewedFiles" in payload)||!Array.isArray(payload.reviewedFiles)||
  payload.reviewedFiles.length!==2||
  !("findings" in payload)||!Array.isArray(payload.findings)||payload.findings.length>30)
  throw new Error("T06 independent reviewer returned malformed verdict");
 const found=new Set<string>();
 for(const row of payload.reviewedFiles){
  if(!row||typeof row!=="object"||Array.isArray(row)||
   Object.keys(row).sort().join(",")!=="path,sha256"||
   !("path" in row)||!expectedPaths.includes(row.path as never)||
   !("sha256" in row)||row.sha256!==expectedSha[String(row.path)]||
   found.has(String(row.path)))
   throw new Error("T06 independent reviewer inspected wrong files or SHA");
  found.add(String(row.path));
 }
 if(found.size!==2)throw new Error("T06 independent reviewer omitted a candidate file");
 for(const finding of payload.findings){
  if(!finding||typeof finding!=="object"||Array.isArray(finding)||
   Object.keys(finding).sort().join(",")!=="description,path,severity"||
   !("description" in finding)||!safeText(finding.description,500)||
   !("path" in finding)||!expectedPaths.includes(finding.path as never)||
   !("severity" in finding)||typeof finding.severity!=="string"||
   !["critical","high","medium","low"].includes(finding.severity))
   throw new Error("T06 independent reviewer returned invalid finding");
 }
 if(payload.verdict==="pass"&&payload.findings.some(row=>["critical","high"].includes(String(row.severity)))||
  payload.verdict==="fail"&&payload.findings.length===0)
  throw new Error("T06 independent review verdict contradicts its findings");
 return Object.freeze({
  verdict:payload.verdict as "pass"|"fail",findingCount:payload.findings.length,
  reviewedPaths:Object.freeze([...expectedPaths]),
  reviewedSha256:Object.freeze(expectedPaths.map(path=>expectedSha[path]!)),
  reviewerSummary:payload.summary,acceptance:"not-accepted" as const,
  writerAuthority:false as const
 });
}
