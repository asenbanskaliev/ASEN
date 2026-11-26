/** Diagnóstico sin contenido de T08. Solo se muestran contadores y estados
 * permitidos: nunca se imprimen texto, razonamiento, claves ni errores libres
 * del modelo. Un mensaje final vacío continúa bloqueando la revisión. */
export interface T08ReviewObservations {
 readonly textEvents:number;
 readonly observedCharacters:number;
 readonly toolEvents:number;
}
const value=(n:unknown):number=>typeof n==="number"&&Number.isSafeInteger(n)&&n>=0?
 Math.min(n,1_000_000):-1;
const obj=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==="object"&&!Array.isArray(x);
const stopReasons=new Set(["stop","length","error","aborted","toolUse"]);
export function describeT08ReviewFailure(
 output:unknown,observations:T08ReviewObservations
):string{
 const events=value(observations?.textEvents),characters=value(observations?.observedCharacters),
  tools=value(observations?.toolEvents);
 let finalCount=0,finalBlocks=-1,stopReason="desconocido",outputTokens=-1,
  messageError=false,agentEnd=false,parseable=true;
 if(typeof output!=="string"||!output||output.length>512_000)
  parseable=false;
 else{
  try{
   const lines=output.trim().split(/\r?\n/u).filter(Boolean);
   if(lines.length>2048)throw Error("demasiados registros");
   for(const line of lines){
    const row:unknown=JSON.parse(line);
    if(!obj(row))throw Error("registro no válido");
    if(row.type==="agent_end")agentEnd=true;
    if(row.type==="message_end"&&obj(row.message)&&row.message.role==="assistant"){
     finalCount++;
     finalBlocks=Array.isArray(row.message.content)?row.message.content.length:-1;
     const reason=row.message.stopReason;
     stopReason=typeof reason==="string"&&stopReasons.has(reason)?reason:"desconocido";
     messageError=typeof row.message.errorMessage==="string"&&row.message.errorMessage.length>0;
     if(obj(row.message.usage))outputTokens=value(row.message.usage.outputTokens??row.message.usage.output);
    }
   }
  }catch{parseable=false;}
 }
 return [
  "diagnóstico Pi sin contenido",
  "registrosValidos="+parseable,
  "mensajesFinales="+finalCount,
  "bloquesFinales="+finalBlocks,
  "motivoFinal="+stopReason,
  "errorDelModelo="+messageError,
  "tokensSalida="+outputTokens,
  "finAgente="+agentEnd,
  "fragmentosTexto="+events,
  "caracteresObservados="+characters,
  "eventosHerramienta="+tools
 ].join("; ");
}
