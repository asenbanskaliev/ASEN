/** Referencias locales de conservación: no son ramas ni aprobaciones.
 * Los objetos quedan alcanzables durante revisión y reinicios. No se borran
 * automáticamente, y ASEN no los publica. Un git push --mirror o remoto
 * configurado como espejo sí puede publicar refs/asen/*: excluirlas del
 * espejo si deben permanecer locales. */
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {isolatedGitEnvironment} from "./git-isolated-environment.js";
export function retainNativeGitObject(repository:string,kind:"worker-tree"|"integration",oid:string):string{
 if(!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(oid))throw Error("Invalid native evidence object");
 const ref="refs/asen/"+kind+"/"+oid;
 const hooks=mkdtempSync(join(tmpdir(),"asen-retain-hooks-"));
 const git=(...args:string[])=>execFileSync("git",["--no-replace-objects","-c","core.hooksPath="+hooks,"-c","core.fsmonitor=false","-c","gc.auto=0","-c","maintenance.auto=false","-C",repository,...args],
  {encoding:"utf8",env:isolatedGitEnvironment(),timeout:10000,stdio:["ignore","pipe","pipe"]}).trim();
 try{
  if(git("cat-file","-t",oid)!==(kind==="worker-tree"?"tree":"commit"))throw Error("Native evidence type changed");
  try{git("update-ref","--no-deref",ref,oid,"0".repeat(oid.length));}
  catch{
   // Otra captura del mismo objeto puede haber creado la misma referencia.
   // Nunca reemplazar una referencia distinta ni seguir una simbólica.
   try{if(git("symbolic-ref","-q",ref))throw Error("Symbolic evidence ref");}
   catch(error){if((error as {status?:number})?.status!==1)throw error;}
   if(git("rev-parse","--verify",ref)!==oid)throw Error("Native evidence ref differs");
  }
  return ref;
 }finally{rmSync(hooks,{recursive:true,force:true});}
}
