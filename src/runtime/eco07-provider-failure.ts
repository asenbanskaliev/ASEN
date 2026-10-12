/** Return provider rate-limit details from a public Pi RPC event. */
export function eco07ProviderRateLimitError(value:unknown):string|undefined{
 if(!value||typeof value!=="object"||Array.isArray(value))return undefined;
 const event=value as {message?:unknown};
 if(!event.message||typeof event.message!=="object"||Array.isArray(event.message))return undefined;
 const message=event.message as {stopReason?:unknown;errorMessage?:unknown};
 if(message.stopReason!=="error"||typeof message.errorMessage!=="string")return undefined;
 return /\b429\b|rate[ -]limit|quota(?:_exceeded)?/iu.test(message.errorMessage)?message.errorMessage.slice(-1200):undefined;
}
