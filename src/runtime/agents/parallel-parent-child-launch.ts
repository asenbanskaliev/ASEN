/**
 * Inicio de sesiones Pi hijas: la capacidad real pertenece al anfitrión.
 * Este adaptador no crea sesiones ficticias ni concede permisos Writer.
 * Cada intento queda registrado ANTES de invocar un efecto irreversible.
 */
export interface SolicitudHijoPi {
 readonly id:string;
 readonly proyecto:string;
 readonly revision:string;
 readonly superficies:readonly string[];
}
export interface ReciboInicioPi {
 readonly id:string;
 readonly proyecto:string;
 readonly revision:string;
 readonly superficies:readonly string[];
 readonly estado:"intentado"|"creado"|"incierto";
 readonly sesion?:string;
}
export interface DiarioInicioPi {
 /** Debe ser atómico y persistente. Rechaza identificadores ya registrados. */
 reservar(recibo:ReciboInicioPi):Promise<void>;
 /** Debe persistir antes de informar de éxito. */
 finalizar(recibo:ReciboInicioPi):Promise<void>;
}
export interface AnfitrionPi {
 /** La ausencia de esta función significa que el anfitrión no puede iniciar hijos. */
 crearSesionHija?:(solicitud:SolicitudHijoPi)=>Promise<{
  sesion:string;proyecto:string;revision:string;
 }>;
}
export interface InicioHijosPi {
 readonly hijos:readonly SolicitudHijoPi[];
 readonly anfitrion:AnfitrionPi;
 readonly diario:DiarioInicioPi;
 readonly confirmar:(solicitud:SolicitudHijoPi)=>Promise<boolean>;
 readonly validar:()=>Promise<void>;
}
export type ResultadoInicioPi=Readonly<{
 estado:"creados"|"bloqueado"|"revision-manual";
 recibos:readonly ReciboInicioPi[];
 motivo?:string;
 concedePermisos:false;
 reintentoAutomatico:false;
 aceptado:false;
}>;
function resultado(estado:ResultadoInicioPi["estado"],recibos:ReciboInicioPi[],motivo?:string):ResultadoInicioPi{
 return Object.freeze({estado,recibos:Object.freeze([...recibos]),...(motivo===undefined?{}:{motivo}),
  concedePermisos:false as const,reintentoAutomatico:false as const,aceptado:false as const});
}
function valido(h:SolicitudHijoPi):boolean{
 return !!h&&!!h.id&&!!h.proyecto&&/^[0-9a-f]{40}$/iu.test(h.revision)&&
  h.superficies.length>0&&new Set(h.superficies).size===h.superficies.length&&
  h.superficies.every(s=>typeof s==="string"&&s.length>0&&!s.startsWith("/")&&!s.includes(".."));
}
function separadas(a:SolicitudHijoPi,b:SolicitudHijoPi):boolean{
 const superficie=(s:string)=>s.replace(/\\/gu,"/").replace(/\/$/u,"").toLowerCase();
 return a.superficies.every(x=>b.superficies.every(y=>{
  const p=superficie(x),q=superficie(y);
  return p!==q&&!p.startsWith(q+"/")&&!q.startsWith(p+"/");
 }));
}
/**
 * No se inicia nada sin capacidad real, dos ámbitos distintos y dos
 * confirmaciones individuales. Un error tras reservar exige inspección.
 */
export async function iniciarDosHijosPi(input:InicioHijosPi):Promise<ResultadoInicioPi>{
 const recibos:ReciboInicioPi[]=[];
 const [a,b]=input.hijos;
 if(input.hijos.length!==2||!a||!b||!valido(a)||!valido(b)||
  a.id===b.id||a.proyecto===b.proyecto||a.revision!==b.revision||!separadas(a,b))
  return resultado("bloqueado",recibos,"Identidad, revisión o ámbitos no independientes");
 if(!input.anfitrion.crearSesionHija)
  return resultado("bloqueado",recibos,"El anfitrión no expone creación real de sesiones Pi");
 try{await input.validar();}catch{return resultado("bloqueado",recibos,"Identidad del padre no válida");}
 // La aprobación de un hijo no puede utilizarse para el otro.
 for(const hijo of [a,b]){
  let autorizado=false;
  try{autorizado=(await input.confirmar(hijo))===true;await input.validar();}
  catch{return resultado("bloqueado",recibos,"Confirmación o identidad no verificable");}
  if(!autorizado)return resultado("bloqueado",recibos,"Autorización individual denegada");
 }
 const sesiones=new Set<string>();
 for(const hijo of [a,b]){
  const intento:ReciboInicioPi={id:hijo.id,proyecto:hijo.proyecto,
   revision:hijo.revision,superficies:[...hijo.superficies],estado:"intentado"};
  try{await input.validar();await input.diario.reservar(intento);}
  catch{return resultado(recibos.length?"revision-manual":"bloqueado",recibos,
   "Identidad alterada o intento duplicado; no repetir");}
  recibos.push(intento);
  try{
   const creado=await input.anfitrion.crearSesionHija!(hijo);
   if(!creado?.sesion||sesiones.has(creado.sesion)||creado.proyecto!==hijo.proyecto||
    creado.revision!==hijo.revision)throw new Error("Identidad de sesión incorrecta");
   await input.validar();
   const final:ReciboInicioPi={...intento,estado:"creado",sesion:creado.sesion};
   await input.diario.finalizar(final);
   recibos[recibos.length-1]=final;
   sesiones.add(creado.sesion);
  }catch{
   try{await input.diario.finalizar({...intento,estado:"incierto"});}catch{/* La reserva inicial permanece. */}
   return resultado("revision-manual",recibos,
    "Inicio o persistencia inciertos: inspección manual obligatoria; nunca reintentar");
  }
 }
 return resultado("creados",recibos);
}
