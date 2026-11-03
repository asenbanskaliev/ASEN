import {realpathSync} from "node:fs";
import type {AsenPermissionMode} from "./permission-mode-policy.js";

export interface PermissionContext{
 readonly cwd:string;
 readonly hasUI?:boolean;
 readonly mode?:string;
 readonly sessionManager?:{getSessionId?:()=>string};
}
interface Owner{readonly manager:NonNullable<PermissionContext["sessionManager"]>;readonly sessionId:string;readonly workspace:string;}
function identity(ctx:PermissionContext):Owner|undefined{
 if(ctx.hasUI!==true||ctx.mode!=="tui"||!ctx.sessionManager||typeof ctx.sessionManager.getSessionId!=="function")return undefined;
 try{
  const sessionId=ctx.sessionManager.getSessionId(),workspace=realpathSync(ctx.cwd);
  if(!sessionId||!workspace)return undefined;
  return {manager:ctx.sessionManager,sessionId,workspace};
 }catch{return undefined;}
}
/** Per-Pi-extension live primary authority. Not serialized, restored from a transcript, or delegated. */
export class AsenPermissionSession{
 private owner:Owner|undefined;
 private liveMode:AsenPermissionMode="normal";
 private generation=0;
 get epoch():number{return this.generation;}
 revoke():void{this.generation++;this.owner=undefined;this.liveMode="normal";}
 mode(ctx:PermissionContext):AsenPermissionMode{
  const next=identity(ctx),old=this.owner;
  if(!old)return "normal";
  if(!next||old.manager!==next.manager||old.sessionId!==next.sessionId||old.workspace!==next.workspace){
   this.revoke();return "normal";
  }
  return this.liveMode;
 }
 set(mode:AsenPermissionMode,ctx:PermissionContext):boolean{
  const next=identity(ctx);this.revoke();
  if(!next)return false;
  this.owner=next;this.liveMode=mode;return true;
 }
 /** Used only at an actual new trusted primary session start, never by the model. */
 initialize(mode:AsenPermissionMode,ctx:PermissionContext):boolean{
  return this.set(mode,ctx);
 }
}
