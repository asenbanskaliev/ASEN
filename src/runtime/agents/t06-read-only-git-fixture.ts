/** T06: Git worktrees desechables para comprobar dos sesiones Pi de lectura.
 * No utiliza credenciales, código privado, autorizaciones Writer ni el Git del proyecto. */
import {execFileSync} from "node:child_process";
import {existsSync,mkdirSync,mkdtempSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {isolatedGitEnvironment} from "./git-isolated-environment.js";

function git(root:string,...args:string[]):string{
 return execFileSync("git",["-c","core.fsmonitor=false","-C",root,...args],{
  encoding:"utf8",timeout:10_000,maxBuffer:100_000,
  windowsHide:true,stdio:["ignore","pipe","ignore"],
  env:isolatedGitEnvironment()
 }).trim();
}
export interface T06GitObservation{
 readonly sourceClean:boolean;
 readonly children:readonly Readonly<{pinned:boolean;clean:boolean;linked:boolean}>[];
 readonly isolated:boolean;
}
export interface T06ReadOnlyGitFixture{
 readonly sourceRoot:string;
 readonly children:readonly [string,string];
 readonly head:string;
 observe:()=>T06GitObservation;
 cleanup:()=>void;
}
/** Los dos proyectos son worktrees del mismo repositorio sintético, nunca del checkout real. */
export function createT06ReadOnlyGitFixture():T06ReadOnlyGitFixture{
 const base=resolve(mkdtempSync(join(tmpdir(),"asen-t06-git-readonly-")));
 const sourceRoot=join(base,"origen");
 const children=[join(base,"hijo-a"),join(base,"hijo-b")] as const;
 try{
  mkdirSync(sourceRoot,{recursive:true,mode:0o700});
  const emptyHooks=join(base,"hooks-inactivos");
  mkdirSync(emptyHooks,{mode:0o700});
  git(sourceRoot,"init","-q");
  git(sourceRoot,"config","user.name","ASEN prueba aislada");
  git(sourceRoot,"config","user.email","asen-test@example.invalid");
  git(sourceRoot,"config","core.autocrlf","false");
  git(sourceRoot,"config","core.hooksPath",emptyHooks);
  writeFileSync(join(sourceRoot,"a.txt"),"contenido A original\n");
  writeFileSync(join(sourceRoot,"b.txt"),"contenido B original\n");
  git(sourceRoot,"add","a.txt","b.txt");
  git(sourceRoot,"commit","-qm","base de prueba desechable");
  const head=git(sourceRoot,"rev-parse","HEAD");
  for(const child of children)git(sourceRoot,"worktree","add","--detach","--quiet",child,head);
  const observe=():T06GitObservation=>{
   const linked=git(sourceRoot,"worktree","list","--porcelain")
    .split(/\r?\n/u).filter(line=>line.startsWith("worktree "))
    .map(line=>line.slice("worktree ".length));
   const childStates=children.map(child=>({
    pinned:git(child,"rev-parse","HEAD")===head,
    clean:git(child,"status","--porcelain=v1","--untracked-files=all")==="",
    linked:existsSync(child)&&
     realpathSync(git(child,"rev-parse","--show-toplevel"))===realpathSync(child)&&
     linked.some(path=>existsSync(path)&&realpathSync(path)===realpathSync(child))
   }));
   return Object.freeze({
    sourceClean:git(sourceRoot,"rev-parse","HEAD")===head&&
     git(sourceRoot,"status","--porcelain=v1","--untracked-files=all")==="",
    children:Object.freeze(childStates.map(x=>Object.freeze(x))),
    isolated:realpathSync(sourceRoot)!==realpathSync(children[0])&&
     realpathSync(children[0])!==realpathSync(children[1])
   });
  };
  const cleanup=()=>{
   for(const child of children)if(existsSync(child)){
    try{git(sourceRoot,"worktree","remove","--force",child);}catch{
     // Solo se eliminan directorios generados dentro del temporal propio.
    }
   }
   rmSync(base,{recursive:true,force:true});
  };
  return Object.freeze({sourceRoot,children,head,observe,cleanup});
 }catch(error){rmSync(base,{recursive:true,force:true});throw error;}
}
