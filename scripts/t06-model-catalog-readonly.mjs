/** Solo GET al catálogo NVIDIA; ninguna petición de generación. */
import {consultarCatalogoNvidia} from "./catalogo-nvidia.mjs";
const result=await consultarCatalogoNvidia({clave:process.env.NVIDIA_API_KEY});
if(!result.completo){
 console.error("Catálogo NVIDIA no disponible: "+result.motivo);
 process.exitCode=1;
}else{
 const candidates=result.modelos.filter(id=>
  /nvidia|deepseek|gemma|llama|qwen|mistral|phi/iu.test(id)&&
  id!=="nvidia/nemotron-3.5-lightning-30b-a3b");
 process.stdout.write(JSON.stringify({
  source:"nvidia-catalogue-GET",status:result.estado,
  totalModels:result.totalModelos,
  writerPresent:result.modelos.includes("nvidia/nemotron-3.5-lightning-30b-a3b"),
  candidateIds:candidates.slice(0,65),candidateCount:candidates.length,
  generationRequests:0,retries:0
 })+"\n");
}
