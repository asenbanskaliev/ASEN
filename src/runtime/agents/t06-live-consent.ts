/** T06: dos autorizaciones humanas terminales distintas para una prueba Pi Writer.
 * Los códigos no se guardan ni se aceptan desde variables de entorno o un modelo. */
import {timingSafeEqual} from "node:crypto";

export interface T06LiveWriterIntent{
 readonly taskId:string;
 readonly sessionId:string;
 readonly candidateSha:string;
 readonly model:string;
 readonly writeSurface:string;
 readonly nonce:string;
}
const id=/^[a-z][a-z0-9-]{5,100}$/u;
const sha=/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const model=/^nvidia\/[a-zA-Z0-9._-]{3,100}$/u;
const path=/^t06-writer-[ab]\.mjs$/u;
const noncePattern=/^[a-f0-9]{16}$/u;
export function t06LiveApprovalChallenge(intent:T06LiveWriterIntent):string{
 if(!id.test(intent.taskId)||!id.test(intent.sessionId)||
  !sha.test(intent.candidateSha)||!model.test(intent.model)||
  !path.test(intent.writeSurface)||!noncePattern.test(intent.nonce))
  throw new Error("T06 live consent requires exact bounded Pi writer identity");
 return "AUTORIZO "+intent.taskId+" "+intent.nonce+" "+intent.writeSurface;
}
/** Solo la respuesta literal, introducida en una terminal interactiva, puede
 * autorizar ese intento. Nunca equivale a un permiso transferible a otro Worker. */
export function acceptT06LiveApproval(intent:T06LiveWriterIntent,reply:unknown):boolean{
 const expected=t06LiveApprovalChallenge(intent);
 if(typeof reply!=="string"||reply.length!==expected.length)return false;
 const supplied=Buffer.from(reply,"utf8"),approved=Buffer.from(expected,"utf8");
 return supplied.length===approved.length&&timingSafeEqual(supplied,approved);
}
export function requireDistinctT06Approvals(
 first:T06LiveWriterIntent,firstReply:unknown,
 second:T06LiveWriterIntent,secondReply:unknown
):readonly [T06LiveWriterIntent,T06LiveWriterIntent]{
 if(first.taskId===second.taskId||first.sessionId===second.sessionId||
  first.nonce===second.nonce||first.writeSurface===second.writeSurface||
  first.candidateSha!==second.candidateSha||first.model!==second.model)
  throw new Error("T06 live Workers must have unique session, task, scope and consent");
 if(!acceptT06LiveApproval(first,firstReply)||!acceptT06LiveApproval(second,secondReply))
  throw new Error("T06 live Workers require two separate explicit human approvals");
 return Object.freeze([Object.freeze({...first}),Object.freeze({...second})]);
}
