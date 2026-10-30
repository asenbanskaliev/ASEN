import {createHash,createPrivateKey,createPublicKey,generateKeyPairSync,sign,verify,type KeyObject} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {decodeManagedAcquisitionManifest,type ManagedAcquisitionManifest} from "./managed-install.js";
import {readBoundedOrdinaryFile} from "../io/bounded-file.js";

export const MANAGED_SIGNATURE_SCHEMA="asen.manifest-signature/v1";
export const MANAGED_MANIFEST_MAX_BYTES=1024*1024;
const DOMAIN=Buffer.from("asen.managed-acquisition.manifest/v1\0");
const SMALL_FILE_BYTES=64*1024;

export type ManagedTrustErrorCode="TRUST_ANCHOR_INVALID"|"SIGNATURE_MALFORMED"|"SIGNER_NOT_TRUSTED"|"SIGNATURE_INVALID"|"KEY_INVALID"|"MANIFEST_INVALID"|"RELEASE_INPUT_INVALID";
export class ManagedTrustError extends Error{
 constructor(readonly code:ManagedTrustErrorCode,message:string,options?:{cause?:unknown}){super(message,{cause:options?.cause});this.name="ManagedTrustError";}
}
const fail=(code:ManagedTrustErrorCode,message:string,cause?:unknown):never=>{throw new ManagedTrustError(code,message,cause===undefined?undefined:{cause});};

export const managedKeyId=(key:KeyObject)=>createHash("sha256").update(key.export({type:"spki",format:"der"})).digest("hex");

export function generateManagedSigningKeyPair():{privateKeyPem:string;publicKeyPem:string;keyId:string}{
 const {privateKey,publicKey}=generateKeyPairSync("ed25519");
 return {privateKeyPem:privateKey.export({type:"pkcs8",format:"pem"}).toString(),publicKeyPem:publicKey.export({type:"spki",format:"pem"}).toString(),keyId:managedKeyId(publicKey)};
}

/** Parses an explicit trust anchor: one or more Ed25519 public keys in PEM; private or other key material is refused. */
export function parseManagedTrustAnchor(text:string):KeyObject[]{
 const blocks=text.match(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/gu)??[];
 if(blocks.length===0||blocks.length>16)fail("TRUST_ANCHOR_INVALID","Trust anchor must contain 1 to 16 public keys");
 const leftover=text.replace(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/gu,"").trim();
 if(leftover)fail("TRUST_ANCHOR_INVALID","Trust anchor contains unexpected content");
 return blocks.map(block=>{
  if(!block.startsWith("-----BEGIN PUBLIC KEY-----"))return fail("TRUST_ANCHOR_INVALID","Trust anchor may contain only public keys");
  try{
   const key=createPublicKey(block);
   if(key.asymmetricKeyType!=="ed25519")return fail("TRUST_ANCHOR_INVALID","Trust anchor keys must be Ed25519");
   return key;
  }catch(error){if(error instanceof ManagedTrustError)throw error;return fail("TRUST_ANCHOR_INVALID","Trust anchor key is malformed",error);}
 });
}
export async function readManagedTrustAnchor(file:string):Promise<KeyObject[]>{
 let bytes:Buffer;
 try{bytes=await readBoundedOrdinaryFile(file,SMALL_FILE_BYTES);}catch(error){return fail("TRUST_ANCHOR_INVALID","Trust anchor is unavailable or not an ordinary bounded file",error);}
 return parseManagedTrustAnchor(bytes.toString("utf8"));
}

export function signManagedManifest(manifestBytes:Uint8Array,privateKeyPem:string):string{
 let key:KeyObject;
 try{key=createPrivateKey(privateKeyPem);}catch(error){return fail("KEY_INVALID","Signing key is malformed",error);}
 if(key.asymmetricKeyType!=="ed25519")fail("KEY_INVALID","Signing key must be Ed25519");
 const keyId=managedKeyId(createPublicKey(key));
 const signature=sign(null,Buffer.concat([DOMAIN,manifestBytes]),key).toString("base64");
 return JSON.stringify({schema:MANAGED_SIGNATURE_SCHEMA,algorithm:"ed25519",keyId,signature},null,2)+"\n";
}

export interface ManagedManifestAuthenticity{
 readonly keyId:string;
 readonly manifest:ManagedAcquisitionManifest;
 readonly manifestSha256:string;
}
/**
 * Authenticates the exact manifest bytes against an explicit trust anchor. The manifest is only
 * decoded after the signature is valid, and the caller must use these bytes (not re-read them).
 */
export function verifyManagedManifestSignature(input:Readonly<{manifestBytes:Uint8Array;signatureText:string;trustedKeys:readonly KeyObject[]}>):ManagedManifestAuthenticity{
 if(input.manifestBytes.length>MANAGED_MANIFEST_MAX_BYTES)fail("MANIFEST_INVALID","Manifest exceeds its size bound");
 let record:unknown;
 try{record=JSON.parse(input.signatureText);}catch(error){return fail("SIGNATURE_MALFORMED","Signature document is not valid JSON",error);}
 if(!record||typeof record!=="object"||Array.isArray(record))return fail("SIGNATURE_MALFORMED","Signature document must be an object");
 const value=record as Record<string,unknown>;
 if(Object.keys(value).sort().join(",")!=="algorithm,keyId,schema,signature"||value.schema!==MANAGED_SIGNATURE_SCHEMA||value.algorithm!=="ed25519"
  ||typeof value.keyId!=="string"||typeof value.signature!=="string"||!/^[a-f0-9]{64}$/u.test(value.keyId)
  ||!/^[A-Za-z0-9+/]{86}==$/u.test(value.signature))return fail("SIGNATURE_MALFORMED","Signature document has an unsupported shape");
 // The declared key id only selects a candidate; trust comes solely from the anchor's own keys.
 const trusted=input.trustedKeys.find(key=>managedKeyId(key)===value.keyId);
 if(!trusted)return fail("SIGNER_NOT_TRUSTED","Manifest signer is not in the explicit trust anchor");
 const valid=verify(null,Buffer.concat([DOMAIN,input.manifestBytes]),trusted,Buffer.from(value.signature,"base64"));
 if(!valid)return fail("SIGNATURE_INVALID","Manifest signature does not match the manifest bytes");
 let manifest:ManagedAcquisitionManifest;
 try{manifest=decodeManagedAcquisitionManifest(JSON.parse(Buffer.from(input.manifestBytes).toString("utf8")));}
 catch(error){return fail("MANIFEST_INVALID","Signed manifest is not a valid acquisition manifest",error);}
 return Object.freeze({keyId:value.keyId,manifest,manifestSha256:createHash("sha256").update(input.manifestBytes).digest("hex")});
}

/** Producer-side helper: derives a manifest from an ordinary package directory (no links, no sensitive names). */
export async function buildManagedManifest(packageRoot:string):Promise<{manifestText:string;manifest:ManagedAcquisitionManifest}>{
 const {lstat,readdir}=await import("node:fs/promises");
 if(!path.isAbsolute(packageRoot))return fail("RELEASE_INPUT_INVALID","Package root must be absolute");
 const files:{sourcePath:string;destinationPath:string;size:number;sha256:string}[]=[];
 const walk=async(directory:string,prefix:string):Promise<void>=>{
  for(const entry of (await readdir(directory)).sort()){
   const absolute=path.join(directory,entry),relative=prefix?`${prefix}/${entry}`:entry,info=await lstat(absolute);
   if(info.isSymbolicLink())return fail("RELEASE_INPUT_INVALID",`Package contains a link: ${relative}`);
   if(info.isDirectory()){await walk(absolute,relative);continue;}
   if(!info.isFile())return fail("RELEASE_INPUT_INVALID",`Package contains a non-regular entry: ${relative}`);
   const bytes=await readFile(absolute);
   files.push({sourcePath:relative,destinationPath:relative,size:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});
  }
 };
 await walk(packageRoot,"");
 let version:unknown;
 try{version=(JSON.parse(await readFile(path.join(packageRoot,"package.json"),"utf8")) as {version?:unknown}).version;}
 catch(error){return fail("RELEASE_INPUT_INVALID","Package root needs a readable package.json",error);}
 try{
  const manifest=decodeManagedAcquisitionManifest({schema:"asen.managed-acquisition/v1",version,files});
  return {manifestText:JSON.stringify({schema:manifest.schema,version:manifest.version,files:manifest.files},null,2)+"\n",manifest};
 }catch(error){return fail("RELEASE_INPUT_INVALID","Package cannot be described as a managed acquisition manifest",error);}
}
