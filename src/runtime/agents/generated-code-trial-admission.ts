/** P0: impedir llamadas a modelos cuando las pruebas de comportamiento
 * de código generado carecen de aislamiento de red real del SO y de una
 * evidencia de finalización independiente. No hay interruptor de entorno. */
export function blockUnisolatedGeneratedCodeTrial(task:"T06"|"T08"):never{
 throw new Error(task+" BLOQUEADO: sin aislamiento de red a nivel de sistema "+
  "ni confirmación independiente del fin de las aserciones; no se llaman modelos");
}
