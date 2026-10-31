export function redactSecrets(value: string): string {
 return value
  .replace(/-----BEGIN(?: [A-Z ]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z ]+)? PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
  .replace(/\b(Authorization:\s*Bearer\s+)[^\s,\n]+/gi, "$1[REDACTED_TOKEN]")
  .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]")
  .replace(/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, "[REDACTED_GITHUB_TOKEN]")
  .replace(/\bsk(?:_|-)?(?:proj-)?[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_API_KEY]")
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]");
}

export function stripPrivateTags(value:string):string{return value.replace(/<private>.*?<\/private>/gis,"[REDACTED]");}
