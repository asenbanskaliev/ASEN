/** Classify model or provider errors without ever storing raw messages or tokens. */
export function classifyT12ProviderFailure(value){
 // Do not inspect arbitrary thrown objects or include their raw text in the result.
 // A bounded excerpt prevents untrusted provider messages from dominating diagnostics.
 const raw=value instanceof Error?value.name+" "+value.message:typeof value==="string"?value:"";
 const message=raw.length>4096?raw.slice(0,2048)+" "+raw.slice(-2048):raw;
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
