import {realpathSync} from "node:fs";
import {prepareOrdinaryReview,claimOrdinaryReviewRequest,bindOrdinaryReviewCheckout,type OrdinaryReviewInput,type OrdinaryReviewRequest,type OrdinaryReviewCheckout} from "./ordinary-review-controller.js";
import type {WorkUnitReviewCandidate} from "../delivery/work-unit-review-candidate.js";

interface ReviewCommandContext{
 cwd:string;sessionManager:{getSessionId():string};ui:{notify(message:string,level:"info"|"error"):void};
}
interface ReviewCommand{
 description:string;handler(args:string|undefined,context:ReviewCommandContext):OrdinaryReviewCheckout|string;
}
export interface OrdinaryReviewCommandController{
 prepare(candidate:WorkUnitReviewCandidate,input:OrdinaryReviewInput):OrdinaryReviewRequest;
}
/** Registro propio de ASEN: prepara el traspaso; no emite dictamen ni autorización RDD. */
export function registerOrdinaryReviewCommand(register:(name:string,command:ReviewCommand)=>void):OrdinaryReviewCommandController{
 const pending=new Map<string,OrdinaryReviewRequest>();
 register("asen-review",{description:"Verificar el candidato preparado para revisión ASEN; no autoriza entrega",handler:(args,context)=>{
  if(typeof args!=="string"||! /^[a-f0-9]{64}$/.test(args)){
   const usage="Uso: /asen-review <solicitud-id>";context.ui.notify(usage,"info");return usage;
  }
  const request=pending.get(args);
  if(!request)throw new Error("No existe solicitud pendiente en esta instancia de ASEN");
  pending.delete(args);
  try{
   const sessionId=context.sessionManager.getSessionId();
   const checkout=bindOrdinaryReviewCheckout(request,sessionId,realpathSync(context.cwd));
   context.ui.notify("Candidato y sesión verificados; revisión nativa RDD pendiente. No hay autorización de entrega.","info");
   return checkout;
  }catch{
   // También consume si el host falla antes de llegar a la comprobación del checkout.
   try{claimOrdinaryReviewRequest(request,"");}catch{}
   context.ui.notify("No se pudo verificar la solicitud; se requiere una preparación nueva.","error");
   throw new Error("Solicitud de revisión rechazada y retirada");
  }
 }});
 return Object.freeze({prepare:(candidate:WorkUnitReviewCandidate,input:OrdinaryReviewInput)=>{
  const request=prepareOrdinaryReview(candidate,input);
  if(pending.has(request.requestId))throw new Error("Ya existe una solicitud pendiente para este candidato y sesión");
  pending.set(request.requestId,request);return request;
 }});
}
