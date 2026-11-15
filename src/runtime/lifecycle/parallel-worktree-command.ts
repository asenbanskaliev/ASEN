import {execFileSync} from "node:child_process";
import {realpathSync} from "node:fs";
import path from "node:path";
import {prepareParallelWorkerWorktrees,type ParallelWorkerUnit} from "../agents/parallel-worktrees.js";

export const ASEN_WORKTREES_COMMAND="asen-worktrees";
const usage="Uso: /asen-worktrees prepare (crea 2-4 worktrees Git aislados tras confirmación; nunca autoriza ni lanza Workers)";
type WorktreeContext={
 cwd:string;hasUI?:boolean;mode?:string;signal?:AbortSignal;
 sessionManager?:{getSessionId?:()=>string};
 ui:{notify:(message:string,kind:"info"|"error"|"warning")=>void;
  editor?:(title:string,prefill?:string)=>Promise<string|undefined>;
  confirm?:(title:string,message:string)=>Promise<boolean>};
};
type WorktreeCommand={description:string;handler:(args:string|undefined,ctx:WorktreeContext)=>Promise<unknown>};
function currentHead(root:string){
 const head=execFileSync("git",["-C",root,"rev-parse","HEAD"],{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:2000,windowsHide:true}).trim();
 if(!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(head))throw new Error("Worktree source needs a pinned exact Git HEAD");
 return head;
}
function readRequest(value:string):{parentDir:string;units:readonly ParallelWorkerUnit[]}{
 if(value.length>16384)throw new Error("Worktree request is too large");
 const parsed:unknown=JSON.parse(value);
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||
  Object.getPrototypeOf(parsed)!==Object.prototype||
  Object.keys(parsed).length!==2||!Object.hasOwn(parsed,"parentDir")||!Object.hasOwn(parsed,"units"))
  throw new Error("Worktree request must contain exactly parentDir and units");
 const data=parsed as {parentDir?:unknown;units?:unknown};
 if(typeof data.parentDir!=="string"||!path.isAbsolute(data.parentDir)||
  !Array.isArray(data.units))throw new Error("Worktree request has invalid parentDir or units");
 return {parentDir:data.parentDir,units:data.units as ParallelWorkerUnit[]};
}
export function registerParallelWorktreeCommand(register:(name:string,command:WorktreeCommand)=>void):void{
 register(ASEN_WORKTREES_COMMAND,{
  description:"Prepare 2–4 isolated Git worktrees after explicit confirmation; Worker authority and integration remain separate",
  handler:async(args,ctx)=>{
   if(args?.trim()!=="prepare"){ctx.ui.notify(usage,"info");return usage;}
   const id=ctx.sessionManager?.getSessionId?.();
   if(!id||ctx.mode!=="tui"||ctx.hasUI!==true||!ctx.ui.editor||!ctx.ui.confirm){
    const blocked={status:"unavailable" as const,reason:"Worktree creation requires live Pi TUI, editor, confirmation and an owned session"};
    ctx.ui.notify(blocked.reason,"warning");return blocked;
   }
   const root=realpathSync(path.resolve(ctx.cwd)),head=currentHead(root);
   const checkIdentity=()=>{
    if(ctx.signal?.aborted||ctx.sessionManager?.getSessionId?.()!==id||
      realpathSync(path.resolve(ctx.cwd))!==root)
     throw new Error("Worktree preparation session or project changed; inspect any already-created worktrees");
   };
   const sample={
    parentDir:path.join(path.dirname(root),path.basename(root)+"-worktrees"),
    units:[{taskId:"backend",writeSurfaces:["src/backend"]},{taskId:"frontend",writeSurfaces:["src/frontend"]}]
   };
   const edited=await ctx.ui.editor("Preparar worktrees: directorio padre existente y dos a cuatro scopes separados (JSON)",JSON.stringify(sample,null,2));
   checkIdentity();
   if(!edited?.trim())return {status:"cancelled",grantsAuthority:false};
   const selection=readRequest(edited);
   const result=await prepareParallelWorkerWorktrees({
    sourceRoot:root,parentDir:selection.parentDir,expectedHead:head,units:selection.units,
    ...(ctx.signal?{signal:ctx.signal}:{}),
    confirm:async summary=>{
     checkIdentity();
     const message=[
      "Se crearán "+summary.creates+" worktrees en "+selection.parentDir,
      "Origen: "+summary.sourceRoot,
      "HEAD exacto: "+summary.revision,
      ...summary.scopes.map(unit=>unit.taskId+": "+unit.writeSurfaces.join(", ")),
      "NO se lanzará ningún Worker ni se concederá autorización de escritura.",
      "Los Workers requerirán una sesión, un plan ODD y un consentimiento nuevo por worktree.",
      "NO habrá fusión ni borrado automático. Inspecciona cada worktree al terminar."
     ].join("\n");
     return await ctx.ui.confirm!("Crear los worktrees Git aislados?",message)===true;
    }
   });
   checkIdentity();
   if(result.status==="declined"){ctx.ui.notify("Preparación cancelada sin crear worktrees.","info");return result;}
   const display={status:"prepared" as const,
    worktrees:result.allocations.map(a=>({taskId:a.taskId,root:a.root,head:a.baseRevision,writeSurfaces:a.writeSurfaces})),
    grantsAuthority:false as const,autoMerge:false as const,
    next:"Abrir una sesión Pi por worktree, preparar ODD y obtener consentimiento Worker individual. Revisión e integración manuales."};
   ctx.ui.notify(JSON.stringify(display,null,2),"info");return display;
  }
 });
}
