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
 // Identity components must not contain the map-key separator or Unicode controls.
 // Message text may be multiline, but is bounded to prevent oversized UI entries.
 if(name==="notification message"){if(value.length>10_000)throw new Error(`invalid ${name}`);}
 else if(value.length>1024||/[\p{Cc}\p{Cf}]/u.test(value))throw new Error(`invalid ${name}`);
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
   // Expire acknowledged tombstones as well as visible events.
   if(Date.parse(value.expiresAt)<=now)this.#events.delete(key);
  }
 }


 emit(sessionId:string,kind:string,message:string,sourceId?:string):SessionNotification{
  valid(sessionId,"session id");valid(kind,"notification kind");valid(message,"notification message");
  const identity=(sourceId===undefined?message:sourceId);
  valid(identity,"source identity");
  this.#pruneExpired();
  const key=`${sessionId}\u001f${kind}\u001f${identity}`;
  const existing=this.#events.get(key);
  // Acknowledgment hides an event but must not permit the same terminal identity
  // to be re-emitted before its TTL expires.
  if(existing&&Date.parse(existing.expiresAt)>this.#now())return existing;
  // Tombstones count against capacity: fail closed instead of silently discarding
  // dedupe state and allowing an already-consumed event to return.
  if(this.#events.size>=this.#capacity)throw new Error("Notification capacity exceeded");
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

 /** Forget only the specified ephemeral projection scope, never any other session.
  * This does not acknowledge or mutate the durable background-job journal.
  */
 clear(sessionId:string):void{
  valid(sessionId,"session id");
  for(const [key,event] of this.#events)if(event.sessionId===sessionId)this.#events.delete(key);
 }


 acknowledge(sessionId:string,id:string):void{
  valid(sessionId,"session id");valid(id,"notification id");
  this.#pruneExpired();
  for(const [key,event] of this.#events){
   if(event.id!==id)continue;
   if(event.sessionId!==sessionId)throw new Error("Notification is unavailable");
   if(!event.acknowledged)this.#events.set(key,Object.freeze({...event,acknowledged:true}));
   return;
  }
  throw new Error("Notification is unavailable");
 }

 replay(sessionId:string):readonly SessionNotification[]{return this.list(sessionId);}
}
