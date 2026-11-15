/** Classify model or provider errors without ever storing raw messages or tokens. */
/** Provider errors may be Error subclasses with throwing getters, Proxy traps or
 * attacker-controlled causes. Only own DATA properties of a real Error are
 * inspected; never invoke a getter or stringify an untrusted object. */
function boundedFailureText(value){
 if(typeof value==="string")return value.length>4096?value.slice(0,2048)+" "+value.slice(-2048):value;
 try{
  if(!(value instanceof Error))return "";
  const name=Object.getOwnPropertyDescriptor(value,"name");
  const message=Object.getOwnPropertyDescriptor(value,"message");
  const raw=(typeof name?.value==="string"?name.value:"Error")+" "+
   (typeof message?.value==="string"?message.value:"");
  return raw.length>4096?raw.slice(0,2048)+" "+raw.slice(-2048):raw;
 }catch{return "";} // Revoked proxies and custom descriptor traps fail closed.
}
export function classifyT12ProviderFailure(value){
 // No arbitrary getters, causes, stacks or credential-bearing details in output.
 const message=boundedFailureText(value);
 let code="UNKNOWN";
 // An explicit billing failure is different from an exhausted free-model quota:
 // never suggest silently switching to paid inference.
 if(/(?:\b402\b|payment required|billing required|insufficient[_ -]?credits?|purchase[_ -]?credits?)/iu.test(message))code="BILLING";
 else if(/(?:\b429\b|quota[_ -]?(?:exceed|exhaust|limit)|insufficient[_ -]?quota|rate[_ -]?limit|too many requests|free-models-per-day)/iu.test(message))code="QUOTA";
 else if(/(?:\b401\b|\b403\b|unauthori[sz]ed|invalid[_ -]?(?:api[_ -]?)?key|authentication|credential|forbidden|permission denied)/iu.test(message))code="AUTH";
 else if(/(?:model.{0,60}(?:not found|unavailable|unknown|does not exist|not supported)|unknown model|unsupported model|invalid[_ -]?model)/iu.test(message))code="MODEL";
 else if(/(?:\b408\b|\b504\b|ETIMEDOUT|ESOCKETTIMEDOUT|timeout|timed out|aborterror|aborted)/iu.test(message))code="TIMEOUT";
 else if(/(?:ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|EHOSTUNREACH|network|connection refused|service unavailable|server overloaded|\b(?:500|502|503|529)\b)/iu.test(message))code="UNAVAILABLE";
 const diagnostics={
  BILLING:"Provider requires payment or credits; no paid fallback is permitted",
  QUOTA:"Provider quota or rate limit prevents completion",
  AUTH:"Provider authentication or permission was rejected",
  MODEL:"Requested provider model is unavailable",
  TIMEOUT:"Provider request timed out or was aborted",
  UNAVAILABLE:"Provider connectivity or service is unavailable",
  UNKNOWN:"Provider or agent stage failed without a classified cause",
 };
 return Object.freeze({code,diagnostic:diagnostics[code]});
}
