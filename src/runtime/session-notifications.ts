export interface SessionNotification{readonly id:string;readonly sessionId:string;readonly kind:string;readonly message:string;readonly createdAt:string;readonly acknowledged:boolean;}
export class SessionNotificationBus{
 readonly #events=new Map<string,SessionNotification>();
 emit(sessionId:string,kind:string,message:string):SessionNotification{if(!sessionId||!kind||!message)throw new Error("Notification identity is invalid");const duplicate=[...this.#events.values()].find(event=>event.sessionId===sessionId&&event.kind===kind&&event.message===message&&!event.acknowledged);if(duplicate)return duplicate;const event=Object.freeze({id:`${sessionId}:${kind}:${this.#events.size+1}`,sessionId,kind,message,createdAt:new Date().toISOString(),acknowledged:false});this.#events.set(event.id,event);return event;}
 list(sessionId:string):readonly SessionNotification[]{return Object.freeze([...this.#events.values()].filter(event=>event.sessionId===sessionId&&!event.acknowledged));}
 acknowledge(sessionId:string,id:string):void{const event=this.#events.get(id);if(!event||event.sessionId!==sessionId)throw new Error("Notification is unavailable");this.#events.set(id,Object.freeze({...event,acknowledged:true}));}
 replay(sessionId:string):readonly SessionNotification[]{return this.list(sessionId);}
}

