/** T06: prueba de comportamiento de código generado en un proceso Node con
 * permisos mínimos. Defensa adicional, NO aislamiento equivalente a una VM
 * ni autorización para ejecutar código no confiable en un equipo productivo. */
import {execFileSync} from "node:child_process";
import {lstatSync,realpathSync} from "node:fs";
import {join,relative} from "node:path";

const validTarget=/^t06-writer-[ab]\.mjs$/u;
export function checkT06Behavior(root:string,target:string,fn:string):boolean{
 if(!validTarget.test(target)||
  (target==="t06-writer-a.mjs"&&fn!=="sumEvenNumbers")||
  (target==="t06-writer-b.mjs"&&fn!=="normalizeNames"))return false;
 let file:string,canonicalRoot:string;
 try{
  canonicalRoot=realpathSync(root);
  const candidate=join(canonicalRoot,target),stat=lstatSync(candidate);
  if(!stat.isFile()||stat.isSymbolicLink())return false;
  file=realpathSync(candidate);
  if(relative(canonicalRoot,file)!==target)return false;
 }catch{return false;}
 const code=fn==="sumEvenNumbers"?
  "import assert from 'node:assert/strict';import {sumEvenNumbers as f} from "+"'"+"./"+
  target+"';let input=[2,4,7,-8];assert.equal(f(input),-2);"+
  "assert.deepEqual(input,[2,4,7,-8]);assert.equal(f([]),0);"+
  "assert.equal(f([1,3,5]),0);assert.throws(()=>f('not-array'),TypeError);"+
  "assert.throws(()=>f([1,2.5]),TypeError);"+
  "assert.throws(()=>f([1,Infinity]),TypeError);":
  "import assert from 'node:assert/strict';import {normalizeNames as f} from "+"'"+"./"+
  target+"';const names=[' Ana ','ana','BETA',' beta ',' '];"+
  "assert.deepEqual(f(names),['ana','beta']);"+
  "assert.deepEqual(names,[' Ana ','ana','BETA',' beta ',' ']);"+
  "assert.deepEqual(f([]),[]);assert.throws(()=>f('Ana'),TypeError);"+
  "assert.throws(()=>f(['Ana',7]),TypeError);";
 const env:NodeJS.ProcessEnv={};
 for(const key of ["SYSTEMROOT","WINDIR","COMSPEC","PATHEXT","TEMP","TMP","TMPDIR"]){
  if(process.env[key])env[key]=process.env[key];
 }
 try{
  // Sin --allow-net, --allow-child-process, --allow-fs-write ni lectura de
  // otros archivos. No transmitir NODE_OPTIONS, claves ni configuración Pi.
  execFileSync(process.execPath,[
   "--permission","--allow-fs-read="+file,"--input-type=module","--eval",code
  ],{cwd:canonicalRoot,env,stdio:["ignore","pipe","pipe"],
   timeout:4000,maxBuffer:65536});
  return true;
 }catch{return false;}
}
