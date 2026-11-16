/** Extrae exclusivamente texto de un juez Pi real (salida JSONL).
 * Pi puede devolver bloques de razonamiento y texto en un mismo mensaje.
 * El razonamiento NO es el dictamen, NO se guarda y NO concede autorización.
 * Cualquier llamada a herramientas, contenido extraño o texto excesivo bloquea. */
export function parseT08NativeReviewText(output:unknown):string{
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
 if(finals.length!==1)
  throw new Error("T08: se requiere un solo dictamen final de Pi");
 const message=(finals[0] as {message:Record<string,unknown>}).message;
 const blocks=message.content;
 if(!Array.isArray(blocks)||blocks.length<1||blocks.length>8)
  throw new Error("T08: contenido de dictamen Pi inválido");
 const chunks:string[]=[];
 let count=0;
 for(const block of blocks){
  if(!object(block))throw new Error("T08: bloque Pi inválido");
  if(block.type==="thinking"){
   // Compatible con los modelos que devuelven razonamiento por separado.
   // No se consulta ni se incorpora el razonamiento al resultado.
   if(typeof block.thinking!=="string"||block.thinking.length>128_000)
    throw new Error("T08: bloque de razonamiento Pi inválido");
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
