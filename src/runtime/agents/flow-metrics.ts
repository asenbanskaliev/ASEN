/** Métricas locales descriptivas. Nunca se deduce coste de un modelo o
 * de la ausencia de datos. No se guardan mensajes, prompts ni credenciales. */
export type FlowUsage=Readonly<{input:number;output:number;total:number|null;costUsd:number|null;billingVerified:false}>;
export function observedFlowUsage(value:unknown):FlowUsage|undefined{
 if(!value||typeof value!=="object")return;
 const v=value as Record<string,unknown>,number=(x:unknown)=>typeof x==="number"&&Number.isSafeInteger(x)&&x>=0&&x<=1_000_000_000;
 if(!number(v.input)||!number(v.output))return;
 const cost=v.cost&&typeof v.cost==="object"?(v.cost as Record<string,unknown>).total:undefined;
 return Object.freeze({input:v.input as number,output:v.output as number,total:number(v.totalTokens)?v.totalTokens as number:null,
  costUsd:typeof cost==="number"&&Number.isFinite(cost)&&cost>=0&&cost<=1_000_000?cost:null,billingVerified:false});
}
type Sample=Readonly<{usage?:FlowUsage;model?:string}>;
function sample(message:unknown):Sample|undefined{
 if(!message||typeof message!=="object")return;
 const v=message as Record<string,unknown>;if(v.role!=="assistant")return;
 const usage=observedFlowUsage(v.usage);
 const model=typeof v.provider==="string"&&typeof v.model==="string"&&/^[a-z0-9._/-]{1,256}$/iu.test(v.provider+"/"+v.model)?v.provider+"/"+v.model:undefined;
 return {...(usage?{usage}:{}),...(model?{model}:{})};
}
export function summarizeFlowUsage(samples:readonly Sample[]){
 const known=samples.flatMap(row=>row.usage?[row.usage]:[]);
 const sum=(field:"input"|"output"|"total"|"costUsd")=>known.length===samples.length&&known.length>0&&known.every(row=>row[field]!==null)?known.reduce((total,row)=>total+row[field]!,0):null;
 return Object.freeze({assistantTurns:samples.length,observedUsageTurns:known.length,models:[...new Set(samples.flatMap(row=>row.model?[row.model]:[]))],
  inputTokens:sum("input"),outputTokens:sum("output"),totalTokens:sum("total"),reportedCostUsd:sum("costUsd"),billingVerified:false});
}
export function summarizeParentFlow(entries:readonly unknown[]){
 const messages:Sample[]=[];const seen=new Set<string>();
 for(const entry of entries.slice(0,20000)){
  if(!entry||typeof entry!=="object")continue;
  const row=entry as Record<string,unknown>;
  if(row.type!=="message")continue;
  if(typeof row.id==="string"){if(seen.has(row.id))continue;seen.add(row.id);}
  const s=sample(row.message);if(s)messages.push(s);
 }
 const completeInventory=entries.length<=20000;
 return {...summarizeFlowUsage(messages),...(!completeInventory?{inputTokens:null,outputTokens:null,totalTokens:null,reportedCostUsd:null}:{}),completeInventory,source:"pi-session-messages"};
}
/** Los resultados conservados son una muestra, no necesariamente todos los
 * intentos de un agente. Un fallo, truncamiento o recuperación no puede
 * convertir el consumo observado en el consumo total de ese agente. */
export function summarizeChildFlow(entry:{record:{id:string;role:string;state:string;createdAt:string;updatedAt:string};events:readonly {state:string;at:string}[];result?:{output:string}}){
 const starts=entry.events.filter(row=>row.state==="running");
 const terminals=new Set(["completed","failed","cancelled","interrupted"]);
 const terminal=terminals.has(entry.record.state);
 const elapsed=starts.length&&terminal?Date.parse(entry.record.updatedAt)-Date.parse(starts[0]!.at):NaN;
 const messages:Sample[]=[];let valid=!!entry.result,settled=false,duplicate=false;
 const seen=new Set<string>();
 if(entry.result&&Buffer.byteLength(entry.result.output,"utf8")<=1_000_000){
  for(const line of entry.result.output.split(/\r?\n/u)){
   if(!line.trim())continue;
   try{
    const event=JSON.parse(line);
    if(event?.type==="agent_settled"&&event.aborted!==true)settled=true;
    if(event?.type==="message_end"){
     const s=sample(event.message);if(!s)continue;
     const id=event.message?.id;
     if(typeof id==="string"&&id.length>0){
      if(seen.has(id)){duplicate=true;continue;}
      seen.add(id);
     }
     messages.push(s);
    }
   }catch{valid=false;break;}
  }
 }else valid=false;
 const observed=summarizeFlowUsage(valid?messages:[]);
 // Una sola ejecución terminal y un cierre RPC explícito son necesarios;
 // el resultado de un reintento puede omitir por completo el primer consumo.
 const completeInventory=valid&&settled&&!duplicate&&starts.length===1&&entry.record.state==="completed"&&messages.length>0;
 return Object.freeze({id:entry.record.id,role:entry.record.role,state:entry.record.state,
  elapsedMs:Number.isFinite(elapsed)&&elapsed>=0?elapsed:null,observedAttempts:starts.length,
  ...observed,
  ...(!completeInventory?{inputTokens:null,outputTokens:null,totalTokens:null,reportedCostUsd:null}:{}),
  observedUsage:observed,
  source:valid&&messages.length?"saved-pi-rpc-result":"usage-unavailable",completeInventory});
}
