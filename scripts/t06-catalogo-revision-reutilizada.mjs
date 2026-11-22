/** Catálogo de la nueva revisión T06: el segundo dictamen ya está verificado.
 * No exige que un modelo reutilizado siga disponible para comprar una llamada.
 * Si el nuevo modelo no está disponible, se detiene sin generar texto.
 */
const NUEVO="nvidia/nemotron-3-super-120b-a12b";
const ANTIGUO="nvidia/nemotron-3.5-super-vl-120b-a12b";
export function validarCatalogoRevisionReutilizada(catalogo,reutilizada){
 if(!reutilizada||reutilizada.reusedFromRunId!=="45048377977"||
    reutilizada.requestedModel!==ANTIGUO||reutilizada.observedModel!==ANTIGUO||
    reutilizada.verdict!=="pass"||reutilizada.acceptance!=="not-accepted"||
    reutilizada.writerAuthority!==false)
  throw Error("T06: el segundo revisor no tiene un dictamen histórico válido");
 if(!catalogo||catalogo.completo!==true||!Array.isArray(catalogo.modelos))
  throw Error("T06: catálogo NVIDIA no verificado");
 if(!catalogo.modelos.includes(NUEVO))
  throw Error("T06: Nemotron 3 Super no figura en el catálogo autorizado");
 return Object.freeze({modeloNuevo:NUEVO,modeloReutilizado:ANTIGUO,
  pruebaNuevaAutorizada:true,segundoModeloNoRepetido:true});
}
