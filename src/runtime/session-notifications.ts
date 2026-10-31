/**
 * Bounded, identity-deduplicated notification bus for a Pi session/project.
 *
 * Notifications carry an explicit identity (`eventId`/`sourceId`) plus session
 * and creation/expiry times. Deduplication keys on that identity, never on the
 * displayed text, so two unrelated events that happen to share a message are
 * never collapsed and one event is never emitted twice under the same identity.
 *
 * Capacity and TTL bound memory: expired or acknowledged events drop out of
 * `list`/`replay`, and emitting into a full bus throws instead of silently
 * losing or silently replacing an event.
 */
export interface SessionNotification{
 readonly id:string;
 readonly eventId:string;
 readonly sourceId:string;
 readonly sessionId:string;
 readonly kind:string;
 readonly message:string;
 readonly createdAt:string;
 readonly expiresAt:string;
 readonly acknowledged:boolean;
}

export interface SessionNotificationBusOptions{
 readonly ttlMs?:number;
 readonly capacity?:number;
}

function valid(value:unknown,name:string):void{
 if(typeof value!=="string"||value.length===0||value!==value.trim())throw new Error(`invalid ${name}`);
}

export class SessionNotificationBus{
 static readonly DEFAULT_TTL_MS=300_000;
 static readonly DEFAULT_CAPACITY=128;
 readonly #ttlMs:number;
 readonly #capacity:number;
 readonly #events=new Map<string,SessionNotification>();
 #sequence=0;

 constructor(options:SessionNotificationBusOptions={}){
  const ttl=options.ttlMs ?? SessionNotificationBus.DEFAULT_TTL_MS;
  if(!Number.isFinite(ttl)||ttl < 1)throw new Error("invalid notification TTL");
  const capacity=options.capacity ?? SessionNotificationBus.DEFAULT_CAPACITY;
  if(!Number.isInteger(capacity)||capacity < 1)throw new Error("invalid notification capacity");
  this.#ttlMs=ttl;
  this.#capacity=capacity;
 }

 #now():number{return Date.now();}

 #pruneExpired(now=Date.now()):void{
  for(const [key,value] of this.#events){
   if(!value.acknowledged&&Date.parse(value.expiresAt)<=now)this.#events.delete(key);
  }
 }

 #unacknowledgedCount():number{let count=0;for(const v of this.#events.values())if(!v.acknowledged)count++;return count;}

 emit(sessionId:string,kind:string,message:string,sourceId?:string):SessionNotification{
  valid(sessionId,"session id");valid(kind,"notification kind");valid(message,"notification message");
  const identity=(sourceId===undefined?message:sourceId);
  valid(identity,"source identity");
  this.#pruneExpired();
  const key=`${sessionId}\u001f${kind}\u001f${identity}`;
  const existing=this.#events.get(key);
  if(existing&&!existing.acknowledged&&Date.parse(existing.expiresAt)>this.#now())return existing;
  if(this.#unacknowledgedCount()>=this.#capacity)throw new Error("Notification capacity exceeded");
  const createdAt=new Date().toISOString();
  const event=Object.freeze({
   id:`${sessionId}:${kind}:${identity}:${++this.#sequence}`,
   eventId:`${sessionId}:${kind}:${identity}`,
   sourceId:identity,
   sessionId,kind,message,createdAt,
   expiresAt:new Date(this.#now()+this.#ttlMs).toISOString(),
   acknowledged:false,
  });
  this.#events.set(key,event);
  return event;
 }

 list(sessionId:string):readonly SessionNotification[]{valid(sessionId,"session id");this.#pruneExpired();return Object.freeze([...this.#events.values()].filter(event=>event.sessionId===sessionId&&!event.acknowledged));}

 acknowledge(sessionId:string,id:string):void{
  valid(sessionId,"session id");valid(id,"notification id");
  const event=this.#events.get([...this.#events.entries()].find(([,v])=>v.id===id)?.[0] ?? "");
  if(!event||event.sessionId!==sessionId)throw new Error("Notification is unavailable");
  const key=[...this.#events.keys()].find(k=>this.#events.get(k)?.id===id);
  if(key)this.#events.set(key,Object.freeze({...event,acknowledged:true}));
 }

 replay(sessionId:string):readonly SessionNotification[]{return this.list(sessionId);}
}
