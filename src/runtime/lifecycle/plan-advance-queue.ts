/** Coordina un único avance por sesión y proyecto.
 * Conserva las señales de finalización mientras el avance está ocupado.
 * Nunca ejecuta herramientas, concede permisos ni repite Writers.
 */
export class PlanAdvanceQueue {
 readonly #busy=new Set<string>();
 readonly #pending=new Map<string,Set<string|undefined>>();

 /** Devuelve false cuando otro avance está activo; la señal se conserva. */
 enter(key:string,blockedTodoId?:string):boolean{
  if(!key||!key.includes("\0"))throw new Error("El avance requiere sesión y proyecto exactos");
  if(this.#busy.has(key)){
   const signals=this.#pending.get(key)??new Set<string|undefined>();
   signals.add(blockedTodoId);
   this.#pending.set(key,signals);
   return false;
  }
  this.#busy.add(key);
  return true;
 }

 /** Se libera la ocupación antes de despertar otra consulta del estado actual.
  * El identificador bloqueado es una pista, no una autorización.
  */
 release(key:string):readonly (string|undefined)[]{
  if(!this.#busy.delete(key))throw new Error("No existe avance activo que liberar");
  const signals=this.#pending.get(key);
  this.#pending.delete(key);
  return Object.freeze([...(signals??[])]);
 }
}
