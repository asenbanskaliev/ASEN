/** Escenario acotado T08: defecto reproducible y comprobación en proceso sin credenciales.
 * No permite ejecutar código del modelo con acceso a red, comandos o escritura. */
import ts from "typescript";
import {execFileSync} from "node:child_process";
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
/** Solo acepta una función exportada, sin imports, acceso global ni herramientas. */
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
  const script=`import assert from 'node:assert/strict';
import {sumEvenNumbers as f} from './t08-fix.mjs';
const source=[2,4,7,-8];assert.equal(f(source),-2);
assert.deepEqual(source,[2,4,7,-8]);assert.equal(f([]),0);
assert.equal(f([1,3]),0);
for(const input of [null,'dos',{},[1,2.5],[2,Infinity],[3,'4'],[2,NaN],[-2,null]]) {
 assert.throws(()=>f(input),TypeError);
}`;
  const env:NodeJS.ProcessEnv={};
  for(const key of ["SYSTEMROOT","WINDIR","COMSPEC","PATHEXT","TEMP","TMP","TMPDIR"]){
   if(process.env[key])env[key]=process.env[key];
  }
  execFileSync(process.execPath,[
   "--permission","--allow-fs-read="+target,"--input-type=module","--eval",script
  ],{cwd:base,env,stdio:["ignore","pipe","pipe"],timeout:4500,maxBuffer:65536});
  return true;
 }catch{return false;}
}
