/** Valida evidencias Pi auténticas de lectura; un eco textual no acredita ejecución.
 * No concede permisos y no convierte una prueba sintética en Writer. */
export type T06PiReplyValidation=Readonly<{
 readonly verified:boolean;
 readonly modelActual:"unknown"|string;
 readonly reason:"verified"|"missing-selection"|"missing-assistant-end"|"multiple-assistant-ends"|
  "model-mismatch"|"unexpected-reply"|"invalid-input";
}>;
export function validateT06PiReply(input:{
 readonly output:string;
 readonly expectedMarker:string;
 readonly expectedModel:string;
 readonly modelObservedByRunner:string|null;
}):T06PiReplyValidation{
 const rejected=(reason:Exclude<T06PiReplyValidation["reason"],"verified">):T06PiReplyValidation=>
  Object.freeze({verified:false,modelActual:"unknown" as const,reason});
 if(!input||typeof input.output!=="string"||input.output.length>128_000||
  typeof input.expectedMarker!=="string"||!/^ASEN_PI_NVIDIA_[AB]_OK$/u.test(input.expectedMarker)||
  input.expectedModel!=="nvidia/nemotron-3.5-lightning-30b-a3b")
  return rejected("invalid-input");
 if(input.modelObservedByRunner!==input.expectedModel)return rejected("missing-selection");
 const ends:Record<string,unknown>[]=[];
 for(const line of input.output.split(/\r?\n/u)){
  if(!line.trim())continue;
  let event:unknown;
  try{event=JSON.parse(line);}catch{return rejected("invalid-input");}
  if(!event||typeof event!=="object"||Array.isArray(event))return rejected("invalid-input");
  const row=event as Record<string,unknown>;
  if(row.type!=="message_end")continue;
  const message=row.message;
  if(!message||typeof message!=="object"||Array.isArray(message))return rejected("invalid-input");
  const reply=message as Record<string,unknown>;
  if(reply.role==="assistant")ends.push(reply);
 }
 if(!ends.length)return rejected("missing-assistant-end");
 if(ends.length!==1)return rejected("multiple-assistant-ends");
 const reply=ends[0]!;
 const model=reply.model;
 if(reply.provider!=="nvidia"||!(
  model==="nemotron-3.5-lightning-30b-a3b"||model===input.expectedModel
 ))return rejected("model-mismatch");
 if(!Array.isArray(reply.content)||reply.content.length===0)return rejected("unexpected-reply");
 const parts=reply.content as unknown[];
 if(parts.some(part=>!part||typeof part!=="object"||Array.isArray(part)||
  (part as Record<string,unknown>).type!=="text"&&
   (part as Record<string,unknown>).type!=="thinking"))return rejected("unexpected-reply");
 const textParts=parts.filter(part=>(part as Record<string,unknown>).type==="text");
 if(!textParts.length||textParts.some(part=>typeof (part as Record<string,unknown>).text!=="string"))
  return rejected("unexpected-reply");
 const answer=textParts.map(part=>(part as {text:string}).text).join("").trim();
 if(answer!==input.expectedMarker)return rejected("unexpected-reply");
 return Object.freeze({verified:true,modelActual:input.expectedModel,reason:"verified"});
}
