/** Supplied by the host secret store; never saved beside signed snapshots. */
export function recoveryKeyFromEnvironment(environment:NodeJS.ProcessEnv=process.env):Buffer{
 const encoded=environment.ASEN_RECOVERY_KEY;
 if(typeof encoded!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(encoded))throw new Error("ASEN recovery signing key is unavailable or malformed");
 const key=Buffer.from(encoded,"base64url");
 if(key.length!==32||key.toString("base64url")!==encoded)throw new Error("ASEN recovery signing key is malformed");
 return key;
}
