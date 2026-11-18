/** T06: conservar SOLO dos fuentes Pi acreditadas para probarlas más tarde
 * en un trabajo GitHub distinto y sin credenciales NVIDIA. Nunca se importan. */
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {closeSync,constants,existsSync,fstatSync,mkdirSync,openSync,readFileSync,realpathSync,writeFileSync} from "node:fs";
import {join,relative,resolve} from "node:path";

const targets=["t06-writer-a.mjs","t06-writer-b.mjs"] as const;
const sha40=/^[0-9a-f]{40}$/u;
const sha64=/^[0-9a-f]{64}$/u;
const digest=(value:Buffer)=>createHash("sha256").update(value).digest("hex");
type RecordData=Record<string,unknown>;
const object=(value:unknown):value is RecordData=>
 typeof value==="object"&&value!==null&&!Array.isArray(value);
export interface T06HandoffManifest{
 readonly schema:"asen.t06.behavior-handoff/v1";
 readonly sha:string;
 readonly files:readonly {readonly name:string;readonly sha256:string}[];
 readonly behaviorVerified:false;
 readonly acceptance:"not-accepted";
 readonly globalFull:false;
}
export function validateT06Handoff(input:{
 readonly report:unknown;readonly manifest:unknown;
 readonly expectedSha:string;readonly files:Readonly<Record<string,Buffer>>;
}):boolean{
 const {report,manifest,expectedSha,files}=input;
 if(!sha40.test(expectedSha)||!object(report)||!object(manifest)||
  report.schema!=="asen.t06.native-dual-writer/v1"||
  report.sha!==expectedSha||report.staticOnly!==true||
  report.result!=="PASS_TWO_WRITERS_STATIC_ONLY_BEHAVIOR_NOT_TESTED"||
  report.generatedCodeExecuted!==false||report.behaviorVerified!==false||
  report.accepted!==false||report.globalFull!==false||
  manifest.schema!=="asen.t06.behavior-handoff/v1"||
  manifest.sha!==expectedSha||manifest.behaviorVerified!==false||
  manifest.acceptance!=="not-accepted"||manifest.globalFull!==false||
  !Array.isArray(report.workers)||report.workers.length!==2||
  !Array.isArray(manifest.files)||manifest.files.length!==2||
  Object.keys(files).length!==2)return false;
 for(let i=0;i<2;i++){
  const name=targets[i]!,worker:unknown=report.workers[i],listed:unknown=manifest.files[i];
  if(!object(worker)||!object(listed)||worker.worker!=="t06-writer-"+(i===0?"a":"b")||
   worker.scope!==name||worker.writeOnlyVerified!==true||
   worker.behaviorVerified!==false||worker.syntaxOk!==true||
   worker.exactScope!==true||worker.attributionVerified!==true||
   worker.writeToolObserved!==true||worker.writeStarts!==1||
   worker.writeSuccesses!==1||worker.writeFailures!==0||
   !sha64.test(String(worker.fileSha256??""))||
   listed.name!==name||listed.sha256!==worker.fileSha256||
   !Buffer.isBuffer(files[name])||files[name]!.length<1||
   files[name]!.length>10_000||digest(files[name]!)!==listed.sha256)
   return false;
 }
 return true;
}
/** Abrir sin seguir enlaces, validar el mismo descriptor y Git antes de copiar.
 * Solo se permite una ruta exacta por Writer en dos worktrees distintos. */
export function stageT06BehaviorSources(input:{
 readonly report:unknown;readonly expectedSha:string;
 readonly worktrees:readonly string[];readonly outputDir:string;
}):T06HandoffManifest{
 const {report,expectedSha,worktrees,outputDir}=input;
 if(!sha40.test(expectedSha)||!object(report)||!Array.isArray(worktrees)||
  worktrees.length!==2||!outputDir.startsWith("/")||!object(report)||!Array.isArray(report.workers)||
  report.result!=="PASS_TWO_WRITERS_STATIC_ONLY_BEHAVIOR_NOT_TESTED")
  throw Error("T06: la procedencia estática no está acreditada");
 const files:Record<string,Buffer>={};
 const roots=new Set<string>();
 for(let i=0;i<2;i++){
  const root=realpathSync(worktrees[i]!);
  if(roots.has(root))throw Error("T06: worktree duplicado");
  roots.add(root);
  const name=targets[i]!;
  const command=(...args:string[])=>execFileSync("git",["-C",root,...args],{
   encoding:"utf8",timeout:12000,stdio:["ignore","pipe","pipe"],maxBuffer:100_000
  });
  if(command("rev-parse","HEAD").trim()!==expectedSha||
   command("status","--porcelain=v1","--untracked-files=all","-z")!=="?? "+name+"\0"||
   command("ls-tree","--name-only","HEAD","--",name).trim()!=="")
   throw Error("T06: el origen Git no corresponde al único archivo autorizado");
  const source=join(root,name);
  const fd=openSync(source,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
   const info=fstatSync(fd);
   if(!info.isFile()||info.size<1||info.size>10_000||
    relative(root,realpathSync(source))!==name)
    throw Error("T06: origen no fiable");
   files[name]=readFileSync(fd);
  }finally{closeSync(fd);}
 }
 const manifest:T06HandoffManifest={
  schema:"asen.t06.behavior-handoff/v1",sha:expectedSha,
  files:targets.map(name=>({name,sha256:digest(files[name]!)})),
  behaviorVerified:false,acceptance:"not-accepted",globalFull:false
 };
 if(!validateT06Handoff({report,manifest,expectedSha,files}))
  throw Error("T06: los bytes no coinciden con los recibos Pi");
 const dir=resolve(outputDir,"t06-codigo-aislado");
 if(existsSync(dir))throw Error("T06: origen de traspaso ya existente");
 mkdirSync(dir,{mode:0o700});
 for(const name of targets)
  writeFileSync(join(dir,name),files[name]!,{mode:0o600,flag:"wx"});
 writeFileSync(join(dir,"manifiesto.json"),JSON.stringify(manifest,null,2)+"\n",{
  mode:0o600,flag:"wx"
 });
 return manifest;
}
