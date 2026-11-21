/** T06: comprobación de código generado bloqueada hasta disponer de un
 * aislamiento de red real y evidencia de fin de todas las aserciones.
 * El modelo de permisos Node no restringe sockets. No dar PASS falso. */
import {lstatSync,realpathSync} from "node:fs";
import {join,relative} from "node:path";

const validTarget=/^t06-writer-[ab]\.mjs$/u;
export function checkT06Behavior(root:string,target:string,fn:string):boolean{
 if(!validTarget.test(target)||
  (target==="t06-writer-a.mjs"&&fn!=="sumEvenNumbers")||
  (target==="t06-writer-b.mjs"&&fn!=="normalizeNames"))return false;
 try{
  const base=realpathSync(root),candidate=join(base,target),stat=lstatSync(candidate);
  if(!stat.isFile()||stat.isSymbolicLink()||
   relative(base,realpathSync(candidate))!==target)return false;
 }catch{return false;}
 // P0 CodeRabbit: sin sandbox del sistema operativo NO EJECUTAR JavaScript
 // generado, ni siquiera si su contenido parece correcto por inspección.
 return false;
}
