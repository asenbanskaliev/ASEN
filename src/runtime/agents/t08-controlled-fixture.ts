/** Escenario T08: análisis estático, pero NO ejecutar código generado hasta
 * tener aislamiento de red del sistema operativo y cierre verificable. */
import ts from "typescript";
import {lstatSync,readFileSync,realpathSync} from "node:fs";
import {join,relative} from "node:path";

export const T08_TARGET="t08-fix.mjs";
export const T08_BUGGY_SOURCE=`export function sumEvenNumbers(numbers) {
  if (!Array.isArray(numbers)) throw new TypeError("Se necesita un array");
  return numbers.filter(value => value % 2 === 0).reduce((sum, n) => sum + n, 0);
}
`;
const forbidden=new Set(["process","globalThis","require","eval","Function","fetch",
 "Deno","Bun","module","Buffer","WebAssembly","constructor","__proto__"]);
/** Filtro sintáctico orientativo, NO una barrera de seguridad para ejecutar código. */
export function verifyT08Source(code:unknown):boolean{
 if(typeof code!=="string"||!code||code.length>10_000)return false;
 const ast=ts.createSourceFile(T08_TARGET,code,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);
 if(((ast as ts.SourceFile & {parseDiagnostics?: readonly ts.Diagnostic[]}).parseDiagnostics?.length??0)>0||
  ast.statements.length!==1)return false;
 const fn=ast.statements[0];
 if(!fn||!ts.isFunctionDeclaration(fn)||fn.name?.text!=="sumEvenNumbers"||
  !fn.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))return false;
 let safe=true;
 const walk=(node:ts.Node)=>{
  if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)||
   ts.isImportEqualsDeclaration(node)||ts.isAwaitExpression(node)||
   ts.isIdentifier(node)&&forbidden.has(node.text)||
   ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)
   safe=false;
  ts.forEachChild(node,walk);
 };
 walk(fn);return safe;
}
export function checkT08Behavior(root:string):boolean{
 try{
  const base=realpathSync(root),target=join(base,T08_TARGET);
  const stat=lstatSync(target);
  if(!stat.isFile()||stat.isSymbolicLink()||
   relative(base,realpathSync(target))!==T08_TARGET)return false;
  if(!verifyT08Source(readFileSync(target,"utf8")))return false;
  // P0 CodeRabbit: no existe un control de red del SO verificado para esta
  // función. El resultado queda NO COMPROBADO sin ejecutar código del modelo.
  // Ni una salida 0 ni una lista de identificadores prohibidos acredita PASS.
  return false;
 }catch{return false;}
}
