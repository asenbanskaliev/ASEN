/** T06: comprobación de revisión real de dos entornos protegidos.
 * No accede al proveedor de modelos y nunca autoriza un Worker por sí mismo. */
import {requireLiveT06GithubApprovals} from "../src/runtime/agents/t06-github-approvals.js";

try{
 const result=await requireLiveT06GithubApprovals();
 if(result.status!=="approved-human-reviews-only")throw Error("Faltan aprobaciones");
 process.stdout.write(JSON.stringify({
  status:"two-github-human-reviews-confirmed",
  environments:result.approvedEnvironments,
  providerCostVerified:false,writerExecuted:false,globalFull:false
 })+"\n");
}catch{
 console.error("T06 BLOQUEADO: faltan dos aprobaciones individuales verificables en este run/SHA, o no se confirmó el coste.");
 process.exitCode=1;
}
