import {createHash} from "node:crypto";
import {SessionNotificationBus} from "./session-notifications.js";

/**
 * Ephemeral, read-only Pi widget projection of observed job/agent outcomes.
 * The durable background journal remains the source of delivery state.
 * This UI has no acknowledgement channel; it must never grant authority,
 * gate Pi.sendMessage or mark an item "delivered".
 */
export interface NotificationProjectionUI {
 setWidget?:(key:string,content:string[]|undefined,options?:{placement?:"aboveEditor"|"belowEditor"})=>void;
}
export interface NotificationProjectionIdentity {
 readonly sessionId:string;
 readonly projectId:string;
}
const WIDGET_KEY="asen-notifications";
const MAX_VISIBLE=5;

function partition(identity:NotificationProjectionIdentity):string{
 return createHash("sha256").update(identity.sessionId).update("\0").update(identity.projectId).digest("hex");
}
function safeText(text:string):string{
 if(/[\u001b\u009b]/u.test(text))return "Notification with terminal control sequence omitted";
 return text.replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu," ").replace(/\s+/gu," ").trim().slice(0,180);
}
export class PiNotificationProjection {
 readonly #bus:SessionNotificationBus;
 #active:Readonly<NotificationProjectionIdentity&{ui:NotificationProjectionUI}>|undefined;
 constructor(options:{capacity?:number;ttlMs?:number}={}){
  this.#bus=new SessionNotificationBus(options);
 }
 activate(identity:NotificationProjectionIdentity,ui:NotificationProjectionUI):void{
  const previous=this.#active;
  if(previous){this.#bus.clear(partition(previous));try{previous.ui.setWidget?.(WIDGET_KEY,undefined,{placement:"belowEditor"});}catch{/* View is optional. */}}
  this.#active={...identity,ui};
  this.#render(this.#active);
 }
 deactivate(identity:NotificationProjectionIdentity):void{
  const current=this.#active;
  if(!current||current.sessionId!==identity.sessionId||current.projectId!==identity.projectId)return;
  this.#active=undefined;
  this.#bus.clear(partition(current));
  try{current.ui.setWidget?.(WIDGET_KEY,undefined,{placement:"belowEditor"});}catch{/* View is optional. */}
 }
 /**
  * Best-effort status projection. A full bus, stale context or broken widget
  * cannot block journal persistence, Pi delivery, agent execution or shutdown.
  */
 publish(identity:NotificationProjectionIdentity,ui:NotificationProjectionUI,kind:"job"|"agent",sourceId:string,message:string):boolean{
  const active=this.#active;
  if(!active||active.ui!==ui||active.sessionId!==identity.sessionId||active.projectId!==identity.projectId)return false;
  const sanitized=safeText(message);
  if(!sanitized||!sourceId)return false;
  try{
   const source=createHash("sha256").update(sourceId).digest("hex");
   this.#bus.emit(partition(identity),kind,sanitized,source);
   this.#render(active);
   return true;
  }catch{return false;}
 }
 #render(active:Readonly<NotificationProjectionIdentity&{ui:NotificationProjectionUI}>):void{
  try{
   const items=this.#bus.list(partition(active));
   const lines=items.slice(-MAX_VISIBLE).map(e=>"- "+e.message);
   const remaining=items.length-lines.length;
   if(remaining>0)lines.unshift("("+remaining+" previous outcomes not displayed)");
   active.ui.setWidget?.(WIDGET_KEY,lines.length?["ASEN outcomes (unconfirmed)",...lines]:undefined,{placement:"belowEditor"});
  }catch{/* No UI error may alter delivery authority or persisted state. */}
 }
}
