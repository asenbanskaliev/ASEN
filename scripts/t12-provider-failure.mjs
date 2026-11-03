/** Classify model or provider errors without ever storing raw messages or tokens. */
export function classifyT12ProviderFailure(value){
 const message=value instanceof Error?value.name+" "+value.message:typeof value==="string"?value:"";
 let code="UNKNOWN";
 if(/(?:\b429\b|quota[_ -]?exceed|rate[_ -]?limit|too many requests|free-models-per-day)/iu.test(message))code="QUOTA";
 else if(/(?:\b401\b|\b403\b|unauthori[sz]ed|invalid[_ -]?(?:api[_ -]?)?key|authentication|credential|forbidden)/iu.test(message))code="AUTH";
 else if(/(?:model.{0,50}(?:not found|unavailable|unknown|does not exist)|unknown model|unsupported model)/iu.test(message))code="MODEL";
 else if(/(?:ETIMEDOUT|timeout|timed out|aborterror|aborted)/iu.test(message))code="TIMEOUT";
 else if(/(?:ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network|connection refused|service unavailable|\b503\b)/iu.test(message))code="UNAVAILABLE";
 const diagnostics={
  QUOTA:"Provider quota or rate limit prevents completion",
  AUTH:"Provider authentication or permission was rejected",
  MODEL:"Requested provider model is unavailable",
  TIMEOUT:"Provider request timed out or was aborted",
  UNAVAILABLE:"Provider connectivity or service is unavailable",
  UNKNOWN:"Provider or agent stage failed without a classified cause",
 };
 return Object.freeze({code,diagnostic:diagnostics[code]});
}
