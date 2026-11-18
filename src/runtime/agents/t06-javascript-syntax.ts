/** Validación SOLO de sintaxis JavaScript. TypeScript permite analizar anotaciones
 * en ScriptKind.JS, pero transpileModule informa del error 8010.
 * No importar, evaluar ni ejecutar jamás el código de un Writer. */
import ts from "typescript";

export function isT06JavaScriptSyntaxValid(source:string):boolean{
 if(typeof source!=="string"||source.length<1||source.length>10_000)
  return false;
 try{
  const file="t06-candidato.mjs";
  // transpileModule aporta los errores JS y las anotaciones TS (p. ej. 8010).
  const check=ts.transpileModule(source,{
   fileName:file,reportDiagnostics:true,
   compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,
    allowJs:true,checkJs:true
   }
  });
  return (check.diagnostics?.length??0)===0;
 }catch{return false;}
}
