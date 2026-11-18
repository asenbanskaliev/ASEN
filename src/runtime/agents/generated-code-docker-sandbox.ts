/** Comprobación optativa de comportamiento en contenedor Linux SIN RED.
 * Este módulo no concede aprobaciones Writer ni activa ensayos T06/T08.
 * El programa generado solo recibe su propio archivo y entradas sintéticas.
 * Todos los casos y sus respuestas esperadas se deciden fuera del contenedor.
 */
import {spawnSync} from "node:child_process";
import {isDeepStrictEqual} from "node:util";
import {closeSync,constants,fstatSync,lstatSync,mkdtempSync,openSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
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
const driver=[
 "const {readFileSync}=await import('node:fs');",
 "const {SourceTextModule,createContext,runInContext}=await import('node:vm');",
 "const p=JSON.parse(process.argv[1]);",
 "const ctx=createContext(Object.create(null),{codeGeneration:{strings:false,wasm:false}});",
 // Reconstruir la entrada EN EL CONTEXTO AISLADO. Pasar p.input tal cual
 // filtraría prototipos del proceso padre por input.constructor.constructor.
 "const payload=JSON.stringify(p.input);",
 "const safeInput=runInContext('JSON.parse('+JSON.stringify(payload)+')',ctx,{timeout:1500});",
 "const m=new SourceTextModule(readFileSync('/opt/candidate.mjs','utf8'),{context:ctx});",
 "await m.link(()=>{throw new Error('imports-prohibidos')});",
 "await m.evaluate({timeout:1500});",
 "const f=m.namespace[p.fn];",
 // Si el export no existe, la infraestructura falla fuera del catch de la
 // función candidata: no debe aprobar un caso que espera TypeError.
 // Una clase exportada parece invocable pero falla antes del cuerpo al llamarla sin new.
 "if(typeof f!=='function'||Object.getOwnPropertyDescriptor(f,'prototype')?.writable===false)throw new Error('funcion-ausente');",
 "let result;",
 "try{result={kind:'value',value:await f(safeInput)}}",
 "catch(error){result={kind:'throws',name:error?.name??'Error'}}",
 "process.stdout.write(JSON.stringify(result)+'\\n');"
].join("");

function validCases(cases:readonly TrustedBehaviorCase[]):boolean{
 if(cases.length<1||cases.length>32)return false;
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
  // Un fallo al arrancar Docker no es un fallo del código candidato.
  // No permitir que una prueba negativa de export se dé por superada sin Docker.
  if(observation.error)
   return {verified:false,completed,reason:"lanzamiento-docker-fallido"};
  if(observation.status!==0||observation.signal!==null)
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
 if(!imagePattern.test(image)||
    !/^[A-Za-z][A-Za-z0-9]*$/u.test(fn))
  throw new Error("identidad-de-ejecucion-invalida");
 return [
  "run","--rm","--pull=never","--network=none","--read-only",
  "--cap-drop=ALL","--security-opt=no-new-privileges",
  "--pids-limit=32","--memory=128m","--cpus=1","--user=65534:65534",
  "--mount","type=bind,src="+source+",dst=/opt/candidate.mjs,readonly",
  "--workdir=/tmp","--entrypoint=/usr/local/bin/node",
  image,"--experimental-vm-modules","--input-type=module","--eval",driver,
  JSON.stringify({fn,input})
 ];
}
/** Solo habilita la prueba con contenedores en el trabajo autorizado de
 * GitHub Actions. Esto evita ejecuciones accidentales en equipos personales.
 * Las variables no son una credencial ni sustituyen el aislamiento del SO. */
export function isGithubHostedSandboxRun(env:Readonly<Record<string,string|undefined>>=process.env):boolean{
 return env.ASEN_DOCKER_TESTS_CI==="1"&&
  env.GITHUB_ACTIONS==="true"&&
  env.RUNNER_ENVIRONMENT==="github-hosted"&&
  env.RUNNER_OS==="Linux"&&
  env.GITHUB_REPOSITORY==="asenbanskaliev/ASEN"&&
  env.GITHUB_EVENT_NAME==="pull_request"&&
  env.GITHUB_HEAD_REF==="feat/flujo-de-agentes-20261115";
}

/** No produce PASS si falta Docker, imagen local fijada o aislamiento.
 * No utiliza variables del proveedor, claves, red del host ni permisos Pi.
 */
export function runDockerBehaviorCases(input:Readonly<{
 root:string;target:string;fn:string;image:string;
 cases:readonly TrustedBehaviorCase[];
}>):SandboxVerdict{
 if(input.cases.length<2||!validCases(input.cases)||!imagePattern.test(input.image)||
    !targetPattern.test(input.target)||!/^[A-Za-z][A-Za-z0-9]*$/u.test(input.fn))
  return {verified:false,completed:0,reason:"configuracion-invalida"};
 if(process.platform!=="linux"||!isGithubHostedSandboxRun())
  return {verified:false,completed:0,reason:"solo-github-actions"};
 let staging:string|undefined;
 try{
  // La ruta de Docker no depende del PATH del proyecto ni de los Workers.
  const dockerStat=lstatSync("/usr/bin/docker");
  if(!dockerStat.isFile()||dockerStat.isSymbolicLink()||dockerStat.uid!==0)
   return {verified:false,completed:0,reason:"docker-no-fiable"};
  const base=realpathSync(input.root);
  const source=join(base,input.target);
  // Abrir sin seguir enlaces y leer del MISMO descriptor: evita sustituir
  // el archivo entre la validación y la copia de código potencialmente hostil.
  const fd=openSync(source,constants.O_RDONLY|constants.O_NOFOLLOW);
  let bytes:Buffer;
  try{
   const stat=fstatSync(fd);
   if(!stat.isFile()||stat.size>20_000||
      relative(base,realpathSync(source))!==input.target)
    return {verified:false,completed:0,reason:"origen-no-fiable"};
   bytes=readFileSync(fd);
  }finally{closeSync(fd);}
  staging=mkdtempSync(join(tmpdir(),"asen-codigo-contenido-"));
  const copy=join(staging,"candidate.mjs");
  writeFileSync(copy,bytes,{mode:0o444,flag:"wx"});
  const observations:ContainerObservation[]=[];
  for(const item of input.cases){
   const args=dockerBehaviorArguments(input.image,copy,input.fn,item.input);
   const result=spawnSync("/usr/bin/docker",[...args],{
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
