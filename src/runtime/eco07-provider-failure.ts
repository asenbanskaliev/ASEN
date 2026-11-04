/** Classify Pi RPC rate-limit failures without copying untrusted provider text,
 * which can contain API credentials, request URLs or user-supplied prompts.
 * This is a terminal provider-failure signal, never an authorization to retry.
 */
export function eco07ProviderRateLimitError(value:unknown):string|undefined{
 if(!value||typeof value!=="object"||Array.isArray(value))return undefined;
 const event=value as {message?:unknown};
 if(!event.message||typeof event.message!=="object"||Array.isArray(event.message))return undefined;
 const message=event.message as {stopReason?:unknown;errorMessage?:unknown};
 if(message.stopReason!=="error"||typeof message.errorMessage!=="string")return undefined;
 const error=message.errorMessage;
 if(/\\b429\\b/u.test(error))return "Provider rate limit (HTTP 429)";
 if(/quota(?:[_ -]?(?:exceeded|exhausted|limit))?/iu.test(error))return "Provider quota exhausted";
 if(/rate[ -]?limit|too many requests/iu.test(error))return "Provider rate limit";
 return undefined;
}
