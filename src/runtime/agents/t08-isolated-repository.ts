/** T08: repositorio Git MÍNIMO, independiente del árbol grande de ASEN.
 * El SHA aprobado sigue siendo el del código del controlador en GitHub;
 * el commit de este repositorio solo ancla el fichero de prueba.
 * Nunca se desactivan ni aumentan los límites del inspector Git. */
import {execFileSync} from "node:child_process";
import {existsSync,lstatSync,mkdirSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {isAbsolute,join,relative} from "node:path";

const fixtureName="t08-fix.mjs" as const;
const branch="asen-t08-fixture";
const fixedGitDate="2001-01-01T00:00:00+00:00";
const safeRun=/^[1-9][0-9]{0,14}$/u;
const revision=/^[0-9a-f]{40}$/u;
const git=(cwd:string,...args:string[])=>
 execFileSync("git",["-C",cwd,...args],{
  encoding:"utf8",timeout:12_000,stdio:["ignore","pipe","pipe"]
 }).trim();
export function t08TemporaryRoot(runId:string):string{
 if(!safeRun.test(runId))throw new Error("ID GitHub T08 no válido");
 return join(tmpdir(),"asen-t08-"+runId);
}
export interface T08FixtureIdentity{
 readonly root:string;
 readonly controllerSha:string;
 readonly fixtureHead:string;
 readonly target:typeof fixtureName;
 readonly originalHasOnlyFixture:true;
}
/** Crea únicamente un commit vacío con autor y fecha constantes, más un
 * archivo NO rastreado. Git no contiene ni clona los miles de archivos ASEN. */
export function createT08IsolatedRepository(input:{
 readonly root:string;readonly controllerSha:string;readonly originalSource:string;
}):T08FixtureIdentity{
 const {root,controllerSha,originalSource}=input??{};
 if(typeof root!=="string"||!isAbsolute(root)||
  !safeRun.test(root.slice(join(tmpdir(),"asen-t08-").length))||
  root!==t08TemporaryRoot(root.slice(join(tmpdir(),"asen-t08-").length))||
  !revision.test(controllerSha)||typeof originalSource!=="string"||
  !originalSource||originalSource.length>10_000)
  throw new Error("Identidad de muestra T08 no válida");
 if(existsSync(root))throw new Error("T08 no reutiliza una muestra previa");
 mkdirSync(root,{mode:0o700});
 try{
  if(!lstatSync(root).isDirectory()||lstatSync(root).isSymbolicLink()||
   realpathSync(root)!==root)throw new Error("T08 requiere ruta temporal auténtica");
  git(root,"init","--quiet","-b",branch);
  const gitEnv={
   ...process.env,GIT_AUTHOR_NAME:"ASEN T08",
   GIT_AUTHOR_EMAIL:"asen-t08@example.invalid",
   GIT_COMMITTER_NAME:"ASEN T08",
   GIT_COMMITTER_EMAIL:"asen-t08@example.invalid",
   GIT_AUTHOR_DATE:fixedGitDate,GIT_COMMITTER_DATE:fixedGitDate
  };
  execFileSync("git",[
   "-C",root,"-c","core.hooksPath=/dev/null","commit","--quiet",
   "--allow-empty","-m","Base mínima reproducible para la prueba T08"
  ],{env:gitEnv,stdio:["ignore","pipe","pipe"],timeout:12_000});
  const fixtureHead=git(root,"rev-parse","HEAD");
  if(!revision.test(fixtureHead)||git(root,"ls-files")!=="")
   throw new Error("La base mínima no está limpia");
  writeFileSync(join(root,fixtureName),originalSource,{
   flag:"wx",mode:0o600
  });
  if(git(root,"status","--porcelain=v1","--untracked-files=all")!=="?? "+fixtureName)
   throw new Error("La muestra T08 contiene cambios ajenos");
  return Object.freeze({
   root,controllerSha,fixtureHead,target:fixtureName,
   originalHasOnlyFixture:true as const
  });
 }catch(error){
  rmSync(root,{recursive:true,force:true});
  throw error;
 }
}
/** Borra solo la carpeta privada que corresponde al run declarado. */
export function removeT08IsolatedRepository(root:string,runId:string):void{
 if(root!==t08TemporaryRoot(runId)||!existsSync(root))return;
 if(lstatSync(root).isSymbolicLink()||!lstatSync(root).isDirectory()||
  realpathSync(root)!==root||relative(tmpdir(),root)!=="asen-t08-"+runId)
  throw new Error("T08 no puede limpiar una ruta que no sea su propia muestra");
 rmSync(root,{recursive:true,force:true});
}
