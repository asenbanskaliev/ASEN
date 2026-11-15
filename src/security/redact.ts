export function redactSecrets(value: string): string {
 if (typeof value !== "string") return "";
 let result = value;
 result = result.replace(/-----BEGIN(?: [A-Z ]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z ]+)? PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
 result = result.replace(/\b(Authorization:\s*Bearer\s+)[^\s,\n]+/gi, "$1[REDACTED_TOKEN]");
 result = result.replace(/\b(Authorization:\s*Basic\s+)[^\s,\n]+/gi, "$1[REDACTED_TOKEN]");
 result = result.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]");
 result = result.replace(/\bAIza[0-9A-Za-z_-]{30,}\b/g, "[REDACTED_GOOGLE_KEY]");
 result = result.replace(/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, "[REDACTED_GITHUB_TOKEN]");
 result = result.replace(/\bxox[bapors]-[A-Za-z0-9-]{10,}\b/g, "[REDACTED_SLACK_TOKEN]");
 result = result.replace(/\bnpm_[A-Za-z0-9]{16,}\b/g, "[REDACTED_NPM_TOKEN]");
 result = result.replace(/\bsk-(?:[A-Za-z0-9_-]{16,})?live(?:_|-)[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_API_KEY]");
 result = result.replace(/\bsk-(?:[A-Za-z0-9_-]{16,})?proj(?:_|-)[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_API_KEY]");
 result = result.replace(/\bsk-(?:[A-Za-z0-9_-]{16,})?ant(?:_|-)[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_API_KEY]");
 result = result.replace(/(password|passwd|pwd)\s*[:=]\s*["']?[^\s,"']{4,}/gi, "$1=[REDACTED_PASSWORD]");
 result = result.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]");
 return result;
}

export function stripPrivateTags(value:string):string{return value.replace(/<private>.*?<\/private>/gis,"[REDACTED]");}
