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
 if(!input.runtime)return input.startAttempts.length===0;
 const stopped=await Promise.allSettled(input.sessions.map(session=>
  input.runtime!.cancelSession(session)));
 return stopped.every(result=>result.status==="fulfilled");
}
