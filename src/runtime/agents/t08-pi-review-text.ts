/** Extrae exclusivamente texto de un juez Pi real (salida JSONL).
 * Pi puede devolver bloques de razonamiento y texto en un mismo mensaje.
 * El razonamiento NO es el dictamen, NO se guarda y NO concede autorización.
 * Cualquier llamada a herramientas, contenido extraño o texto excesivo bloquea. */
/** En modo estricto solo se acepta el último dictamen después de
 * agent_settled. Las respuestas intermedias se permiten exclusivamente
 * si Pi acreditó un nuevo intento con agent_end(willRetry:true). */
export function parseT08NativeReviewText(
 output:unknown,options:Readonly<{requireFinalSettlement?:boolean}>={}
):string{
 if(typeof output!=="string"||!output.trim()||output.length>512_000)
  throw new Error("T08: la salida Pi está vacía o excede el límite");
 let records:unknown[];
 try{
  const lines=output.trim().split(/\r?\n/u).filter(Boolean);
  if(lines.length>2048)throw new Error("Demasiados eventos Pi");
  records=lines.map(line=>JSON.parse(line) as unknown);
 }catch{throw new Error("T08: el flujo JSONL de Pi no es válido");}
 const object=(x:unknown):x is Record<string,unknown>=>
  x!==null&&typeof x==="object"&&!Array.isArray(x);
 for(const record of records){
  if(!object(record))throw new Error("T08: registro Pi inesperado");
  const type=record.type;
  if(typeof type!=="string")throw new Error("T08: tipo de evento Pi inválido");
  if(type.startsWith("tool_execution_")||type.startsWith("toolcall_")||
   type==="tool_call"||type==="tool_result"||type==="tool_use")
   throw new Error("T08: el juez Pi intentó utilizar herramientas");
 }
 const finals=records.filter(record=>
  object(record)&&record.type==="message_end"&&
  object(record.message)&&record.message.role==="assistant"
 );
 if(!options.requireFinalSettlement&&finals.length!==1)
  throw new Error("T08: se requiere un solo dictamen final de Pi");
 if(options.requireFinalSettlement){
  if(finals.length<1||finals.length>8)
   throw new Error("T08: cantidad de dictámenes Pi inválida");
  const settlements=records.map((row,index)=>({row,index})).filter(
   x=>object(x.row)&&x.row.type==="agent_settled"
  );
  if(settlements.length!==1)
   throw new Error("T08: falta una única señal real agent_settled");
  const settledAt=settlements[0]!.index;
  let previousEnd=-1;
  const assistantMessages=records.map((row,index)=>({row,index})).filter(
   x=>object(x.row)&&x.row.type==="message_end"&&
    object(x.row.message)&&x.row.message.role==="assistant"
  );
  for(const [i,item] of assistantMessages.entries()){
   const nextMessage=assistantMessages[i+1]?.index??settledAt;
   if(item.index<=previousEnd||item.index>=nextMessage)
    throw new Error("T08: orden Pi del dictamen final inválido");
   const endings=records.slice(item.index+1,nextMessage).filter(
    row=>object(row)&&row.type==="agent_end"
   );
   if(endings.length!==1)
    throw new Error("T08: el dictamen Pi no tiene fin de intento verificable");
   const ending=endings[0] as Record<string,unknown>;
   if(i<assistantMessages.length-1&&ending.willRetry!==true)
    throw new Error("T08: mensaje anterior sin recuperación autorizada por Pi");
   // Una llamada solicitada sin ejecución sigue siendo una llamada a herramienta.
   const intermediate=(item.row as {message:{content?:unknown}}).message.content;
   if(Array.isArray(intermediate)&&intermediate.some(block=>
    object(block)&&(block.type==="toolCall"||block.type==="tool_call")))
    throw new Error("T08: mensaje Pi intermedio contiene una llamada a herramienta");
   if(i===assistantMessages.length-1&&ending.willRetry===true)
    throw new Error("T08: Pi sigue en recuperación y no hay dictamen definitivo");
   previousEnd=records.findIndex((row,index)=>
    index>item.index&&index<nextMessage&&row===endings[0]
   );
  }
  if(settledAt<=previousEnd)
   throw new Error("T08: cierre Pi anterior al último dictamen");
 }
 const message=(finals[finals.length-1] as {message:Record<string,unknown>}).message;
 const blocks=message.content;
 // Pi puede distribuir la respuesta entre varios bloques de texto y
 // razonamiento. El límite de 8 era demasiado estrecho; la respuesta sigue
 // acotada por bytes y cada bloque se valida antes de usar su contenido.
 if(!Array.isArray(blocks))
  throw new Error("T08: dictamen Pi sin lista de bloques (forma inválida)");
 if(blocks.length===0)
  throw new Error("T08: dictamen Pi sin bloques (0)");
 if(blocks.length>64)
  throw new Error("T08: dictamen Pi con más de 64 bloques");
 const chunks:string[]=[];
 let count=0,thinkingCharacters=0;
 for(const block of blocks){
  if(!object(block))throw new Error("T08: bloque Pi inválido");
  if(block.type==="thinking"){
   // Compatible con los modelos que devuelven razonamiento por separado.
   // No se consulta ni se incorpora el razonamiento al resultado.
   if(typeof block.thinking!=="string")
    throw new Error("T08: bloque de razonamiento Pi inválido");
   thinkingCharacters+=block.thinking.length;
   if(thinkingCharacters>128_000)
    throw new Error("T08: razonamiento Pi supera el límite total");
   continue;
  }
  if(block.type!=="text"||typeof block.text!=="string")
   throw new Error("T08: contenido Pi no permitido");
  if(!block.text)continue;
  count+=block.text.length;
  if(count>24_000)throw new Error("T08: el dictamen excede el tamaño permitido");
  chunks.push(block.text);
 }
 const text=chunks.join("").trim();
 if(!text)throw new Error("T08: el juez Pi no devolvió un dictamen de texto");
 return text;
}
