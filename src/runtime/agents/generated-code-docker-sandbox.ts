/** Comprobación optativa de comportamiento en contenedor Linux SIN RED.
 * Este módulo no concede aprobaciones Writer ni activa ensayos T06/T08.
 * El programa generado solo recibe su propio archivo y entradas sintéticas.
 * Todos los casos y sus respuestas esperadas se deciden fuera del contenedor.
 */
import {spawnSync} from "node:child_process";
import {isDeepStrictEqual} from "node:util";
import {lstatSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,relative} from "node:path";

export interface TrustedBehaviorCase {
 readonly id:string;
 readonly input:unknown;
 readonly expected:Readonly<{kind:"value";value:unknown}|{kind:"throws";name:"TypeError"}>;
}
export interface ContainerObservation {
 readonly status:number|null;
 readonly signal:string|null;
 readonly stdout:string;
 readonly error?:string;
}
export interface SandboxVerdict {
 readonly verified:boolean;
 readonly completed:number;
 readonly reason:string;
}
const imagePattern=/^node@sha256:[0-9a-f]{64}$/u;
const targetPattern=/^[a-z0-9][a-z0-9-]*\.mjs$/u;
const driver="const p=JSON.parse(process.argv[1]);"+
 "const m=await import('file:///opt/candidate.mjs');"+
 "let result;try{result={kind:'value',value:await m[p.fn](p.input)};}"+
 "catch(error){result={kind:'throws',name:error?.name??'Error'};}"+
 "process.stdout.write(JSON.stringify(result)+'\\n');";

function validCases(cases:readonly TrustedBehaviorCase[]):boolean{
 if(cases.length<2||cases.length>32)return false;
 const ids=new Set<string>();
 for(const item of cases){
  if(!/^[a-z0-9-]{1,50}$/u.test(item.id)||ids.has(item.id))return false;
  ids.add(item.id);
  if(item.expected.kind!=="value"&&
     !(item.expected.kind==="throws"&&item.expected.name==="TypeError"))return false;
  try{
   if(JSON.stringify(item.input)===undefined||JSON.stringify(item.expected)===undefined)
    return false;
  }catch{return false;}
 }
 return true;
}
/** Los observadores son procesos ya finalizados, medidos por el padre.
 * La salida 0, un informe del candidato o un número de casos vacío NUNCA
 * sustituyen una respuesta exacta para CADA prueba externa. */
export function verifyExternalBehaviorCases(
 cases:readonly TrustedBehaviorCase[],observations:readonly ContainerObservation[]
):SandboxVerdict{
 if(!validCases(cases))return {verified:false,completed:0,reason:"casos-invalidos"};
 if(cases.length!==observations.length)
  return {verified:false,completed:0,reason:"faltan-observaciones"};
 let completed=0;
 for(const observation of observations){
  if(observation.status!==0||observation.signal!==null||observation.error)
   return {verified:false,completed,reason:"proceso-incompleto"};
  if(observation.stdout.length===0||observation.stdout.length>2048||
     observation.stdout.trim().split(/\r?\n/u).length!==1)
   return {verified:false,completed,reason:"sin-respuesta-unica"};
  let received:unknown;
  try{received=JSON.parse(observation.stdout);}
  catch{return {verified:false,completed,reason:"respuesta-no-json"};}
  if(!isDeepStrictEqual(received,cases[completed]?.expected))
   return {verified:false,completed,reason:"asercion-no-superada"};
  completed++;
 }
 return {verified:true,completed,reason:"casos-externos-superados"};
}
/** Argumentos fijos. Nunca se ejecuta una shell ni se descarga una imagen.
 * Solo se admite una imagen oficial Node con digest declarado previamente.
 */
export function dockerBehaviorArguments(
 image:string,source:string,fn:string,input:unknown
):readonly string[]{
 if(!imagePattern.test(image)||!targetPattern.test(fn+".mjs")||
    !/^[A-Za-z][A-Za-z0-9]*$/u.test(fn))
  throw new Error("identidad-de-ejecucion-invalida");
 return [
  "run","--rm","--pull=never","--network=none","--read-only",
  "--cap-drop=ALL","--security-opt=no-new-privileges",
  "--pids-limit=32","--memory=128m","--cpus=1","--user=65534:65534",
  "--mount","type=bind,src="+source+",dst=/opt/candidate.mjs,readonly",
  "--workdir=/tmp","--entrypoint=/usr/local/bin/node",
  image,"--input-type=module","--eval",driver,
  JSON.stringify({fn,input})
 ];
}
/** No produce PASS si falta Docker, imagen local fijada o aislamiento.
 * No utiliza variables del proveedor, claves, red del host ni permisos Pi.
 */
export function runDockerBehaviorCases(input:Readonly<{
 root:string;target:string;fn:string;image:string;
 cases:readonly TrustedBehaviorCase[];
}>):SandboxVerdict{
 if(!validCases(input.cases)||!imagePattern.test(input.image)||
    !targetPattern.test(input.target)||!/^[A-Za-z][A-Za-z0-9]*$/u.test(input.fn))
  return {verified:false,completed:0,reason:"configuracion-invalida"};
 let staging:string|undefined;
 try{
  const base=realpathSync(input.root);
  const source=join(base,input.target);
  const stat=lstatSync(source);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>20_000||
     relative(base,realpathSync(source))!==input.target)
   return {verified:false,completed:0,reason:"origen-no-fiable"};
  const bytes=readFileSync(source);
  staging=mkdtempSync(join(tmpdir(),"asen-codigo-contenido-"));
  const copy=join(staging,"candidate.mjs");
  writeFileSync(copy,bytes,{mode:0o444,flag:"wx"});
  const observations:ContainerObservation[]=[];
  for(const item of input.cases){
   const args=dockerBehaviorArguments(input.image,copy,input.fn,item.input);
   const result=spawnSync("docker",[...args],{
    encoding:"utf8",timeout:15_000,maxBuffer:8192,
    windowsHide:true,stdio:["ignore","pipe","pipe"],
    env:Object.fromEntries(["PATH","SYSTEMROOT","WINDIR","COMSPEC","PATHEXT"]
     .filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]!]))
   });
   observations.push({
    status:result.status,signal:result.signal,stdout:result.stdout??"",
    ...(result.error?{error:"proceso-no-disponible"}:{})
   });
   const verdict=verifyExternalBehaviorCases(input.cases.slice(0,observations.length),
    observations);
   // Durante el lote, comprobar solo que el caso actual terminó y respondió.
   if(!verdict.verified&&verdict.reason!=="casos-invalidos")
    return {verified:false,completed:observations.length-1,reason:verdict.reason};
  }
  return verifyExternalBehaviorCases(input.cases,observations);
 }catch{
  return {verified:false,completed:0,reason:"aislamiento-no-disponible"};
 }finally{
  if(staging)rmSync(staging,{recursive:true,force:true});
 }
}
