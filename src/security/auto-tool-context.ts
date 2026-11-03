/**
 * Tool definitions are untrusted descriptive context, never authority.
 * Project registered metadata without invoking getters, toJSON or prototype hooks.
 */
const maxNodes=512,maxDepth=12,maxBytes=8192;
const secretText=/(?:-----BEGIN [A-Z ]*PRIVATE KEY|sk-proj-|ghp_[a-z0-9]{20}|(?:password|passwd|api[_-]?key|credential|private[_-]?key|bearer|secret|token)[=:]\s*["']?\S+)/iu;
function project(value:unknown,depth:number,budget:{nodes:number}):unknown{
 if(++budget.nodes>maxNodes||depth>maxDepth)throw Error("Tool metadata bounds exceeded");
 if(value===null||typeof value==="boolean")return value;
 if(typeof value==="number") {if(!Number.isFinite(value))throw Error("Invalid number");return value;}
 if(typeof value==="string") {
  if(value.length>6000||secretText.test(value))throw Error("Sensitive or oversized tool metadata");
  return value;
 }
 if(Array.isArray(value)){
  if(value.length>128)throw Error("Tool metadata list too large");
  return value.map(x=>project(x,depth+1,budget));
 }
 if(typeof value!=="object")throw Error("Non-JSON tool metadata");
 if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)
  throw Error("Non-plain tool metadata");
 const output:Record<string,unknown>={};
 const descriptors=Object.getOwnPropertyDescriptors(value);
 for(const key of Object.keys(descriptors)){
  if(key.length>200||secretText.test(key)||key==="__proto__"||key==="constructor")
   throw Error("Unsafe tool metadata key");
  const d=descriptors[key]!;
  if(!Object.hasOwn(d,"value"))throw Error("Tool metadata getter unavailable");
  output[key]=project(d.value,depth+1,budget);
 }
 return output;
}
export interface AutoToolContext{name:string;description:string;parameters:unknown;}
export function projectAutoToolContext(
 definitions:unknown,toolName:string,
):AutoToolContext|undefined{
 if(typeof toolName!=="string"||toolName.length>128||!Array.isArray(definitions)||definitions.length>256)
  return undefined;
 try{
  const found=definitions.find(entry=>{
   if(!entry||typeof entry!=="object")return false;
   const d=Object.getOwnPropertyDescriptor(entry,"name");
   return d&&Object.hasOwn(d,"value")&&d.value===toolName;
  });
  if(!found)return undefined;
  const description=Object.getOwnPropertyDescriptor(found,"description");
  const parameters=Object.getOwnPropertyDescriptor(found,"parameters");
  if(!description||!Object.hasOwn(description,"value")||typeof description.value!=="string"||
   !parameters||!Object.hasOwn(parameters,"value"))return undefined;
  // Descriptions and parameter schemas are equally untrusted; neither may
  // bypass credential and byte limits merely by being a top-level string.
  const descriptionValue=project(description.value,0,{nodes:0});
  if(typeof descriptionValue!=="string")return undefined;
  const result:AutoToolContext={name:toolName,description:descriptionValue,
   parameters:project(parameters.value,0,{nodes:0})};
  return Buffer.byteLength(JSON.stringify(result))<=maxBytes?Object.freeze(result):undefined;
 }catch{return undefined;}
}
