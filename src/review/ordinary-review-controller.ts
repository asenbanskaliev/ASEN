import {execFileSync} from "node:child_process";
import {realpathSync} from "node:fs";
import {assertExactGitCandidate} from "../evidence/execution.js";
import {createHash} from "node:crypto";
import {isProxy} from "node:util/types";
import {claimWorkUnitReviewCandidate,type WorkUnitReviewCandidate} from "../delivery/work-unit-review-candidate.js";
import {exactRecord,text} from "../delivery/work-unit-policy.js";
export interface OrdinaryReviewInput{
 readonly authorId:string;readonly reviewerId:string;readonly sessionId:string;
}
export interface OrdinaryReviewRequest{
 readonly schemaVersion:1;readonly requestId:string;readonly status:"prepared";
 readonly candidate:WorkUnitReviewCandidate;readonly participants:Readonly<OrdinaryReviewInput>;
}
const issued=new WeakSet<object>(),consumed=new WeakSet<object>();
/** Preparación descriptiva: IDs declarados no autentican al usuario o al revisor. */
export function prepareOrdinaryReview(value:WorkUnitReviewCandidate,input:OrdinaryReviewInput):OrdinaryReviewRequest{
 const candidate=claimWorkUnitReviewCandidate(value);
 if(isProxy(input))throw new Error("La preparación requiere datos planos");
 const raw=exactRecord(input,["authorId","reviewerId","sessionId"],"preparación de revisión");
 const participants=Object.freeze({authorId:text(raw.authorId,"autor"),reviewerId:text(raw.reviewerId,"revisor"),sessionId:text(raw.sessionId,"sesión")});
 if(participants.authorId===participants.reviewerId)throw new Error("Autor y revisor deben ser distintos; no acredita autenticación");
 const requestId=createHash("sha256").update("asen.ordinary-review.preparation.v1\0").update(JSON.stringify({candidate,participants})).digest("hex");
 const request=Object.freeze({schemaVersion:1 as const,requestId,status:"prepared" as const,candidate,participants});
 issued.add(request);return request;
}
/** Traspaso único de preparación, nunca autoridad de revisión nativa. */
export function claimOrdinaryReviewRequest(value:unknown,sessionId:string):OrdinaryReviewRequest{
 if(typeof value!=="object"||value===null||!issued.has(value))throw new Error("Se requiere preparación genuina");
 if(consumed.has(value))throw new Error("La preparación ya fue consumida");
 consumed.add(value);const request=value as OrdinaryReviewRequest;
 if(typeof sessionId!=="string"||sessionId!==request.participants.sessionId)throw new Error("La sesión de preparación no coincide");
 return request;
}

export interface OrdinaryReviewCheckout{
 readonly request:OrdinaryReviewRequest;
 readonly repository:string;readonly revision:string;readonly treeIdentity:string;readonly parentIdentity:string;
}
/** Observa Git local; la relación URL→directorio sigue siendo una declaración del llamante. */
export function bindOrdinaryReviewCheckout(value:OrdinaryReviewRequest,sessionId:string,repository:string):OrdinaryReviewCheckout{
 const request=claimOrdinaryReviewRequest(value,sessionId);
 const root=text(repository,"repositorio local");let observed:string[];
 try{
  if(realpathSync(root)!==root)throw new Error("ruta no canónica");
  const candidate={id:request.candidate.identity,repository:root,revision:request.candidate.revision,createdAt:"preparación de revisión"};
  const assertCheckout=()=>{
   const args=["--no-replace-objects","-C",root];
   const tags=execFileSync("git",[...args,"ls-files","-v","-z"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).split("\0").filter(Boolean);
   if(tags.some(line=>line[0]!=="H"))throw new Error("flags del índice no verificables");
   if(execFileSync("git",[...args,"status","--porcelain=v1","--untracked-files=all"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim())throw new Error("checkout modificado");
   assertExactGitCandidate(candidate,root);
  };
  assertCheckout();
  observed=execFileSync("git",["--no-replace-objects","-C",root,"rev-parse","HEAD^{tree}","HEAD^"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim().split("\n");
  assertCheckout();
 }catch{throw new Error("No se pudo verificar el checkout exacto de revisión");}
 if(observed.length!==2||observed[0]!==request.candidate.treeIdentity||observed[1]!==request.candidate.completedWorkUnit.commit.parentIdentity)throw new Error("Árbol o padre de revisión no coincide");
 return Object.freeze({request,repository:root,revision:request.candidate.revision,treeIdentity:observed[0]!,parentIdentity:observed[1]!});
}
