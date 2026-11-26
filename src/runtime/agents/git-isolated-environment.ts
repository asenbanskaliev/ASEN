/** Configuración Git global vacía y privada en Windows: Git for Windows puede
 * rechazar NUL como ruta, pero nunca debe heredarse la config del usuario. */
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

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
