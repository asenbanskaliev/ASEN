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
 if(messages.length!==1)throw new Error("T06 independent review requires exactly one final assistant verdict");
 const message=messages[0];
 if(!message||typeof message!=="object"||!("message" in message)||
  !message.message||typeof message.message!=="object"||
  !("content" in message.message)||!Array.isArray(message.message.content))
  throw new Error("T06 independent Pi review returned no assistant message");
 const contents=message.message.content;
 if(contents.length!==1||!contents[0]||typeof contents[0]!=="object"||
  contents[0].type!=="text"||typeof contents[0].text!=="string")
  throw new Error("T06 independent reviewer returned unsupported content");
 let payload:unknown;try{payload=JSON.parse(contents[0].text.trim());}
 catch{throw new Error("T06 independent reviewer did not return strict JSON");}
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||
  Object.keys(payload).sort().join(",")!=="findings,reviewedFiles,summary,verdict"||
  !("verdict" in payload)||!["pass","fail"].includes(String(payload.verdict))||
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
   !("severity" in finding)||!["critical","high","medium","low"].includes(String(finding.severity)))
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
