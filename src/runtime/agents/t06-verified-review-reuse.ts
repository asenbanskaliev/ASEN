/** Reutiliza únicamente un dictamen real y verificable de Super VL.
 * El informe anterior no concede permisos Writer ni aceptación final.
 * Prohíbe reutilizar recibos de otra ejecución o de otros archivos. */
const oldRun="45048377977",oldSha="540aa036fae5d60776645b83be806be8d821d02b";
const modelA="nvidia/nemotron-3.5-bolt-e4b";
const modelB="nvidia/nemotron-3.5-super-vl-120b-a12b";
const files=["t06-writer-a.mjs","t06-writer-b.mjs"] as const;
const isRecord=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==="object"&&!Array.isArray(x);
const hex=/^[a-f0-9]{64}$/u;
export function admitT06VerifiedSuperReview(value:unknown,hashes:Readonly<Record<string,string>>){
 const deny=()=>{throw new Error("T06: informe anterior no admite reutilización");};
 if(!isRecord(value)||!isRecord(hashes)||!files.every(k=>hex.test(hashes[k]??"")))return deny();
 if(value.schema!=="asen.t06.autorrevision-real/v1"||
  value.sourceSha!=="5bd752374f2db630a9d2ab0887e1025134a4e13f"||
  value.sourceRunId!=="44792916571"||
  value.behaviorRunId!=="44794317489"||
  value.reviewSha!==oldSha||value.runId!==oldRun||
  value.result!=="REVIEW_FAILED_OR_UNVERIFIED"||
  value.providerCatalogVerified!==true||value.behaviorVerified!==true||
  value.reviewedByTwoModels!==false||value.writerAuthorized!==false||
  value.accepted!==false||value.globalFull!==false)return deny();
 if(!Array.isArray(value.models)||value.models.length!==2||
  value.models[0]!==modelA||value.models[1]!==modelB||
  !isRecord(value.reviewedFileHashes)||
  !files.every(k=>value.reviewedFileHashes[k]===hashes[k]))return deny();
 if(!Array.isArray(value.reviews)||value.reviews.length!==2)return deny();
 const [failed,passed]=value.reviews;
 if(!isRecord(failed)||!isRecord(passed)||
  failed.requestedModel!==modelA||
  failed.verdict!=="unknown"||
  passed.requestedModel!==modelB||passed.observedModel!==modelB||
  passed.piProcessObserved!==true||passed.verdict!=="pass"||
  passed.findingCount!==0||passed.writerAuthority!==false||
  passed.acceptance!=="not-accepted"||
  !Array.isArray(passed.reviewedSha256)||passed.reviewedSha256.length!==2||
  !files.every((k,i)=>passed.reviewedSha256[i]===hashes[k]))return deny();
 // Solo se devuelve metadato acotado, jamás texto o respuestas del proveedor.
 return Object.freeze({
  requestedModel:modelB,observedModel:modelB,piProcessObserved:true,
  verdict:"pass" as const,findingCount:0,
  reviewedSha256:Object.freeze(files.map(k=>hashes[k]!)),
  writerAuthority:false as const,acceptance:"not-accepted" as const,
  reusedFromRunId:oldRun
 });
}
