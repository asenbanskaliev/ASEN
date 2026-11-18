/** T06: finalizar intentos de arranque y cancelar todas las sesiones hijas
 * ANTES de retirar los repositorios de ensayo. No consume modelos ni autoriza
 * reintentos. Si la cancelación falla, el llamador conserva los worktrees. */
export interface T06TrialSession{
 readonly sessionId:string;
 readonly projectId:string;
}
export async function settleT06ReadOnlyTrial(input:{
 readonly startAttempts:readonly Promise<unknown>[];
 readonly sessions:readonly T06TrialSession[];
 readonly runtime?:{cancelSession(identity:T06TrialSession):Promise<void>};
}):Promise<boolean>{
 // Una de las altas puede fallar mientras la otra todavía está iniciando.
 // Debemos observar ambas antes de cancelar: ninguna alta tardía queda huérfana.
 await Promise.allSettled(input.startAttempts);
 // Una cancelación puede devolver éxito sin haber alcanzado un hijo omitido.
 // No autorizar borrado si falta alguna identidad o se repite una sesión.
 const keys=input.sessions.map(session=>JSON.stringify([session.sessionId,session.projectId]));
 const allAccounted=input.sessions.length===input.startAttempts.length&&
  new Set(keys).size===keys.length&&
  input.sessions.every(session=>typeof session.sessionId==="string"&&
   session.sessionId.length>0&&typeof session.projectId==="string"&&
   session.projectId.length>0);
 if(!input.runtime)return allAccounted&&input.sessions.length===0;
 // Intentar detener todos los hijos conocidos, incluso con inventario incompleto.
 const stopped=await Promise.allSettled(input.sessions.map(session=>
  input.runtime!.cancelSession(session)));
 return allAccounted&&stopped.every(result=>result.status==="fulfilled");
}
