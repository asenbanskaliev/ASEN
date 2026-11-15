/** Classify only trusted-shape terminal Pi failure envelopes, without invoking
 * untrusted accessors or copying provider error content into a receipt.
 * A quota hint never authorizes a retry, a paid fallback, or an agent write.
 */
function dataProperty(value:unknown,name:string):unknown{
 try{
  if(value===null||typeof value!=="object"||Array.isArray(value))return undefined;
  const property=Object.getOwnPropertyDescriptor(value,name);
  return property&&"value" in property?property.value:undefined;
 }catch{return undefined;} // Revoked proxies or hostile descriptors fail closed.
}
export function eco07ProviderRateLimitError(value:unknown):string|undefined{
 try{
  if(value===null||typeof value!=="object"||Array.isArray(value))return undefined;
  const typeDescriptor=Object.getOwnPropertyDescriptor(value,"type");
  if(typeDescriptor&&!("value" in typeDescriptor))return undefined;
 }catch{return undefined;}
 const type=dataProperty(value,"type");
 // An untyped legacy terminal envelope remains supported; typed non-terminal
 // events cannot impersonate an assistant error.
 if(type!==undefined&&type!=="message_end"&&type!=="turn_end")return undefined;
 const message=dataProperty(value,"message");
 const reason=dataProperty(message,"stopReason");
 const error=dataProperty(message,"errorMessage");
 if(reason!=="error"||typeof error!=="string"||error.length>64*1024)return undefined;
 // Billing is never a free quota condition, even if a failed retry mentions 429.
 if(/\b402\b|payment required|billing required|insufficient[_ -]?credits?|purchase[_ -]?credits?/iu.test(error))return undefined;
 if(/\b429\b/u.test(error))return "Provider rate limit (HTTP 429)";
 if(/quota(?:[_ -]?(?:exceeded|exhausted|limit))?/iu.test(error))return "Provider quota exhausted";
 if(/rate[ -]?limit|too many requests/iu.test(error))return "Provider rate limit";
 return undefined;
}
