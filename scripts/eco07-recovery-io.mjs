export function createSecretSanitizer(secret){
 const redact=value=>String(value).replaceAll(secret,"[redacted]").slice(-1200);
 const sanitize=value=>typeof value==="string"?redact(value):Array.isArray(value)?value.map(sanitize):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sanitize(item)])):value;
 return sanitize;
}

export async function runCleanup(primary,operations){
 const errors=[primary];
 for(const operation of operations)try{await operation();}catch(error){errors.push(error);}
 throw errors.length===1?primary:new AggregateError(errors,"operation failed and cleanup also failed");
}

function aggregate(primary,secondary,message){
 if(primary&&secondary)return new AggregateError([primary,secondary],message);
 return primary??secondary;
}

/** A single-owner JSONL queue. Serialization happens before enqueue to snapshot mutable input. */
export function createJsonlQueue({file,sanitize=value=>value,now=()=>new Date().toISOString()}){
 let accepting=true,tail=Promise.resolve(),drainPromise;
 function record(kind,details={}){
  if(!accepting)return Promise.reject(new Error("transcript queue is closed"));
  let line,serializationError;
  try{line=`${JSON.stringify(sanitize({at:now(),kind,...details}))}\n`;}
  catch(error){serializationError=error;}
  const operation=tail.then(async()=>{
   if(serializationError)throw serializationError;
   await file.write(line);await file.sync();
  });
  tail=operation;
  operation.catch(()=>{});
  return operation;
 }
 function drainAndClose(){
  if(drainPromise)return drainPromise;
  accepting=false;
  drainPromise=(async()=>{
   let queueError,closeError;
   try{await tail;}catch(error){queueError=error;}
   try{await file.close();}catch(error){closeError=error;}
   const failure=aggregate(queueError,closeError,"transcript queue and close failed");
   if(failure)throw failure;
  })();
  drainPromise.catch(()=>{});
  return drainPromise;
 }
 return {record,drainAndClose};
}

/** Guard one RPC child so a first quota event is a synchronous, terminal latch. */
export function createRpcController({
 child,label,classifyProviderFailure,redact=value=>String(value),dispose=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,
 termGraceMs=1_000,killGraceMs=1_000,requestTimeoutMs=180_000,
}){
 const requests=new Map(),shutdownTimers=new Set(),sentSignals=new Set();
 let providerFailure,terminal=false,finished=false,stdinEnded=false,disposed=false,resolveClosed;
 const closed=new Promise(resolve=>{resolveClosed=resolve;});
 const failureMessage=()=>providerFailure?`Pi provider rate limit: ${providerFailure}`:`${label} Pi process stopped`;
 function clearShutdownTimers(){for(const timer of shutdownTimers)clearTimer(timer);shutdownTimers.clear();}
 function rejectRequests(error){
  for(const [id,pending] of requests){requests.delete(id);clearTimer(pending.timer);pending.reject(error);}
 }
 function release(){child.removeListener("close",onClose);child.removeListener("error",onError);child.stdin.removeListener?.("error",onStdinError);}
 function releaseOwnedHandles(errors){
  for(const stream of [child.stdin,child.stdout,child.stderr]){
   if(!stream)continue;
   const sink=()=>{};
   const releaseSink=()=>{stream.removeListener?.("error",sink);stream.removeListener?.("close",releaseSink);};
   stream.on?.("error",sink);stream.once?.("close",releaseSink);
   for(const method of ["destroy","unref"])try{stream[method]?.();}catch(error){errors.push(error);}
  }
  try{child.unref?.();}catch(error){errors.push(error);}
 }
 function finish(result){
  if(finished)return;
  finished=true;terminal=true;clearShutdownTimers();
  const cleanupErrors=[];
  if(!disposed){disposed=true;try{dispose();}catch(error){cleanupErrors.push(error);}}
  if(!result.cleanupConfirmed)releaseOwnedHandles(cleanupErrors);
  rejectRequests(new Error(failureMessage()));
  resolveClosed(cleanupErrors.length?{...result,cleanupErrors}:result);
  if(result.cleanupConfirmed)release();
 }
 function schedule(callback,delay){
  const timer=setTimer(()=>{shutdownTimers.delete(timer);callback();},delay);
  shutdownTimers.add(timer);
 }
 function killOnce(signal){
  if(sentSignals.has(signal)||child.exitCode!==null||child.signalCode!==null)return false;
  sentSignals.add(signal);
  try{return child.kill(signal);}catch(error){onError(error);return false;}
 }
 function boundedShutdown(){
  if(!stdinEnded){stdinEnded=true;try{child.stdin.end();}catch{/* Quota failure remains primary; bounded kill still runs. */}}
  killOnce("SIGTERM");
  if(!finished)schedule(()=>{killOnce("SIGKILL");if(!finished)schedule(()=>finish({code:null,signal:"SIGKILL",cleanupConfirmed:false}),killGraceMs);},termGraceMs);
 }
 function onClose(code,signal){if(finished)release();else finish({code,signal,cleanupConfirmed:true});}
 function onError(error){if(finished)return;terminal=true;rejectRequests(error);finish({code:null,signal:null,cleanupConfirmed:false});}
 function onStdinError(error){if(finished||terminal)return;terminal=true;rejectRequests(error);boundedShutdown();}
 child.once("close",onClose);child.on("error",onError);child.stdin.on?.("error",onStdinError);
 function observe(value){
  const classified=classifyProviderFailure(value);
  if(classified&&!providerFailure){
   providerFailure=redact(classified);terminal=true;
   rejectRequests(new Error(failureMessage()));boundedShutdown();
   return providerFailure;
  }
  if(value?.type==="response"&&value.id&&requests.has(value.id)){
   const pending=requests.get(value.id);requests.delete(value.id);clearTimer(pending.timer);
   if(value.success===false)pending.reject(new Error(value.error??`${value.command} failed`));
   else pending.resolve(value);
  }
 }
 function write(value){
  if(terminal)return Promise.reject(new Error(failureMessage()));
  return new Promise((resolve,reject)=>{
   try{child.stdin.write(`${JSON.stringify(value)}\n`,error=>{if(error){onStdinError(error);reject(error);}else resolve();});}
   catch(error){onStdinError(error);reject(error);}
  });
 }
 function send(type,payload={}){
  if(terminal)return Promise.reject(new Error(failureMessage()));
  return new Promise((resolve,reject)=>{
   const id=`${label}-${type}-${Math.random().toString(36).slice(2)}`;
   const timer=setTimer(()=>{if(requests.delete(id))reject(new Error(`${label} Pi ${type} timed out`));},requestTimeoutMs);
   requests.set(id,{resolve,reject,timer});
   void write({id,type,...payload}).catch(error=>{if(requests.delete(id)){clearTimer(timer);reject(error);}});
  });
 }
 function stop(signal="SIGKILL"){
  if(finished)return closed.then(result=>({...result,killRequested:signal,killAccepted:false}));
  terminal=true;rejectRequests(new Error(failureMessage()));
  const killAccepted=killOnce(signal);
  if(!finished&&signal==="SIGTERM")schedule(()=>{killOnce("SIGKILL");if(!finished)schedule(()=>finish({code:null,signal:"SIGKILL",cleanupConfirmed:false}),killGraceMs);},termGraceMs);
  else if(!finished)schedule(()=>finish({code:null,signal,cleanupConfirmed:false}),killGraceMs);
  return closed.then(result=>({...result,killRequested:signal,killAccepted}));
 }
 return {send,write,observe,stop,getClosed:()=>closed,getProviderFailure:()=>providerFailure};
}
