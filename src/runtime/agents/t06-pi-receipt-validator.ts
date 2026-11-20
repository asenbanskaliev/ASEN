/** Valida evidencias Pi auténticas de lectura; un eco textual no acredita ejecución.
 * No concede permisos y no convierte una prueba sintética en Writer. */
export type T06PiReplyValidation=Readonly<{
 readonly verified:boolean;
 readonly modelActual:"unknown"|string;
 /** Datos informados por Pi, no factura ni verificación de gasto. */
 readonly piReportedUsage:Readonly<{
  inputTokens:number;outputTokens:number;totalTokens:number|null;
  costUsd:number|null;billingVerified:false
 }> | null;
 readonly reason:"verified"|"missing-selection"|"missing-assistant-end"|"multiple-assistant-ends"|
  "model-mismatch"|"unexpected-reply"|"invalid-input";
}>;
/** Normaliza solo las dos formas que Pi puede comunicar para el modelo pedido.
 * El catálogo NVIDIA devuelve el ID completo dentro del proveedor nvidia.
 * No infiere selección desde el texto del modelo ni concede permisos.
 */
export function normalizeT06PiChildSelection(
 observed:Readonly<{provider:string;id:string}>|null|undefined,
 expectedModel:string
):string|null{
 if(!observed||typeof observed.provider!=="string"||typeof observed.id!=="string"||
  typeof expectedModel!=="string")return null;
 const slash=expectedModel.indexOf("/");
 if(slash<=0||slash!==expectedModel.lastIndexOf("/")||slash===expectedModel.length-1)return null;
 const provider=expectedModel.slice(0,slash),shortId=expectedModel.slice(slash+1);
 if(observed.provider===provider&&(observed.id===shortId||observed.id===expectedModel))
  return expectedModel;
 return observed.provider+"/"+observed.id;
}
export function validateT06PiReply(input:{
 readonly output:string;
 readonly expectedMarker:string;
 readonly expectedModel:string;
 readonly modelObservedByRunner:string|null;
}):T06PiReplyValidation{
 const rejected=(reason:Exclude<T06PiReplyValidation["reason"],"verified">):T06PiReplyValidation=>
  Object.freeze({verified:false,modelActual:"unknown" as const,piReportedUsage:null,reason});
 const modelParts=typeof input?.expectedModel==="string"?input.expectedModel.split("/"):[];
 const [expectedProvider,expectedModelId]=modelParts;
 if(!input||typeof input.output!=="string"||input.output.length>128_000||
   typeof input.expectedMarker!=="string"||!/^ASEN_PI_[A-Z0-9_]+_[AB]_OK$/u.test(input.expectedMarker)||
   modelParts.length!==2||!expectedProvider||!expectedModelId||
   !/^[a-z0-9][a-z0-9-]{0,62}$/u.test(expectedProvider)||
   !/^[a-z0-9][a-z0-9._-]{0,126}$/u.test(expectedModelId))
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
 if(reply.provider!==expectedProvider||!(model===expectedModelId||model===input.expectedModel))
  return rejected("model-mismatch");
 // Un marcador correcto no convierte una respuesta interrumpida o fallida en éxito.
 // Pi puede informar del error aunque entregue texto y el proceso termine normalmente.
 if((reply.stopReason!==undefined&&reply.stopReason!=="stop")||
   (reply.errorMessage!==undefined&&reply.errorMessage!==null&&reply.errorMessage!==""))
  return rejected("unexpected-reply");
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
 const usage=reply.usage,plain=usage&&typeof usage==="object"&&!Array.isArray(usage)?
  usage as Record<string,unknown>:null;
 const whole=(value:unknown):value is number=>
  typeof value==="number"&&Number.isSafeInteger(value)&&value>=0&&value<=1_000_000_000;
 const money=(value:unknown):value is number=>
  typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=1_000_000;
 const cost=plain?.cost&&typeof plain.cost==="object"&&!Array.isArray(plain.cost)?
  plain.cost as Record<string,unknown>:null;
 const piReportedUsage=plain&&whole(plain.input)&&whole(plain.output)?
  Object.freeze({
   inputTokens:plain.input,outputTokens:plain.output,
   totalTokens:whole(plain.totalTokens)?plain.totalTokens:null,
   costUsd:cost&&money(cost.total)?cost.total:null,
   billingVerified:false as const
  }):null;
 return Object.freeze({verified:true,modelActual:input.expectedModel,
  piReportedUsage,reason:"verified"});
}
