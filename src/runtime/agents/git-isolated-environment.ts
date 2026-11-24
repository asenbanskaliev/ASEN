/** Configuración Git global vacía y privada en Windows: Git for Windows puede
 * rechazar NUL como ruta, pero nunca debe heredarse la config del usuario. */
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";

let windowsEmptyConfig:string|undefined;
function emptyWindowsGitConfig():string{
 if(windowsEmptyConfig!==undefined)return windowsEmptyConfig;
 const dir=mkdtempSync(join(tmpdir(),"asen-git-config-"));
 const file=join(dir,"empty.gitconfig");
 try{
  writeFileSync(file,"",{flag:"wx",mode:0o600});
 }catch(error){
  rmSync(dir,{recursive:true,force:true});
  throw error;
 }
 windowsEmptyConfig=file;
 process.once("exit",()=>{
  try{rmSync(dir,{recursive:true,force:true});}
  catch{/* El cierre no debe convertir una operación Git en aprobación. */}
 });
 return file;
}

/** Git temporal: no heredar GIT_DIR/GIT_WORK_TREE, configuración, índices ni credenciales. */
export function isolatedGitEnvironment(extra:NodeJS.ProcessEnv={}):NodeJS.ProcessEnv{
 const env:NodeJS.ProcessEnv={};
 for(const key of ["PATH","Path","PATHEXT","SystemRoot","SYSTEMROOT","WINDIR","COMSPEC","TEMP","TMP","TMPDIR"])
  if(process.env[key]!==undefined)env[key]=process.env[key];
 Object.assign(env,{GIT_CONFIG_NOSYSTEM:"1",
  GIT_CONFIG_GLOBAL:process.platform==="win32"?emptyWindowsGitConfig():"/dev/null",
  GIT_TERMINAL_PROMPT:"0",GIT_OPTIONAL_LOCKS:"0",GIT_NO_REPLACE_OBJECTS:"1",
  GIT_NO_LAZY_FETCH:"1",GIT_ALLOW_PROTOCOL:"",GIT_PROTOCOL_FROM_USER:"0"});
 for(const key of ["GIT_AUTHOR_NAME","GIT_AUTHOR_EMAIL","GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL","GIT_AUTHOR_DATE","GIT_COMMITTER_DATE"])
  if(extra[key]!==undefined)env[key]=extra[key];
 return env;
}

// Solo se consulta configuración escalar; nunca ejecutar Git operativo con el
// entorno del usuario. Mantener aislados filtros, credenciales e índices.
export function checkoutEolSettings(repository:string):Readonly<{autocrlf:string;eol:string;args:readonly string[]}>{
 const readEnv=isolatedGitEnvironment();
 delete readEnv.GIT_CONFIG_NOSYSTEM;delete readEnv.GIT_CONFIG_GLOBAL;
 for(const key of ["HOME","USERPROFILE","XDG_CONFIG_HOME","GIT_CONFIG_GLOBAL","GIT_CONFIG_SYSTEM","GIT_CONFIG_NOSYSTEM"])
  if(process.env[key]!==undefined)readEnv[key]=process.env[key];
 const read=(key:string)=>{
  try{return execFileSync("git",["-C",repository,"config","--get",key],{env:readEnv,encoding:"utf8",timeout:5000,maxBuffer:4096,windowsHide:true,stdio:["ignore","pipe","pipe"]}).trim().toLowerCase();}
  catch(error){if((error as {status?:number})?.status===1)return "";throw error;}
 };
 const raw=read("core.autocrlf"),eol=read("core.eol");
 const autocrlf=["true","yes","on","1"].includes(raw)?"true":["false","no","off","0"].includes(raw)?"false":raw;
 if(!["","true","false","input"].includes(autocrlf)||!["","lf","crlf","native"].includes(eol))throw Error("Configuración Git de fin de línea no admitida");
 return Object.freeze({autocrlf,eol,args:Object.freeze([...(autocrlf?["-c","core.autocrlf="+autocrlf]:[]),...(eol?["-c","core.eol="+eol]:[])])});
}
