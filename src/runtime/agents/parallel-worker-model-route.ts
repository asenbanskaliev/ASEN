/** T05/T06: validación del modelo solicitado al despachar un Worker.
 * Un destino explícito no equivale a un modelo consumido, a una credencial
 * autenticada ni a una tarifa gratuita. Es solo una condición previa. */
export interface PlannedWorkerModelRoute {
 readonly status:"pinned"|"blocked";
 readonly requested:string;
 readonly selectedActual:"unknown";
 readonly modelConsumedProven:false;
 readonly providerAuthenticated:false;
 readonly costVerified:false;
 readonly paidModelApproved:false;
 readonly blockers:readonly string[];
}
const explicitModel=/^[a-z0-9][a-z0-9._-]{0,63}\/[A-Za-z0-9][A-Za-z0-9_./:@-]{0,190}$/u;
export function inspectPlannedWorkerModelRoute(model:unknown):PlannedWorkerModelRoute{
 const valid=typeof model==="string"&&model.length<=256&&
  model===model.trim()&&model===model.normalize("NFC")&&
  explicitModel.test(model)&&!model.split("/").some(part=>part==="."||part===".."||
   part.toLowerCase()==="unknown"||part.toLowerCase()==="default"||part.toLowerCase()==="auto");
 return Object.freeze({
  status:valid?"pinned" as const:"blocked" as const,
  requested:valid?model:"unknown",
  selectedActual:"unknown" as const,
  modelConsumedProven:false as const,providerAuthenticated:false as const,
  costVerified:false as const,paidModelApproved:false as const,
  blockers:Object.freeze(valid?[]:[
   "El Worker necesita un modelo proveedor/identificador explícito; el modelo por defecto o desconocido no es seguro."
  ])
 });
}
