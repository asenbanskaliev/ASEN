import assert from "node:assert/strict";

async function observeWithin(closed,ms){
 let timer;
 try{return await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>resolve(undefined),ms);})]);}
 finally{clearTimeout(timer);}
}

export async function settleVerifierChild(child,closed,{successful=true,graceMs=5_000,killWaitMs=2_000}={}){
 for(const value of [graceMs,killWaitMs])assert.ok(Number.isSafeInteger(value)&&value>0);
 const started=Date.now(),events=[],shutdownTrace=[];let stderrTraceBuffer="";
 const observe=(emitter,name,event)=>emitter?.on?.(event,(...values)=>{
  const value=event==="exit"||event==="close"?values.map(item=>item??null):undefined;
  events.push({atMs:Date.now()-started,stream:name,event,...(value?{value}:{})});
 });
 observe(child,"process","exit");observe(child,"process","close");observe(child,"process","error");
 child.stderr?.on?.("data",chunk=>{
  stderrTraceBuffer=(stderrTraceBuffer+String(chunk)).slice(-4096);
  let end;while((end=stderrTraceBuffer.indexOf("\n"))>=0){
   const line=stderrTraceBuffer.slice(0,end).replace(/\r$/u,"");stderrTraceBuffer=stderrTraceBuffer.slice(end+1);
   if(line.startsWith("ASEN_PI_VERIFIER_SHUTDOWN:")){shutdownTrace.push(line.slice(0,256));if(shutdownTrace.length>32)shutdownTrace.shift();}
  }
 });
 for(const [name,stream] of [["stdin",child.stdin],["stdout",child.stdout],["stderr",child.stderr]])
  for(const event of name==="stdin"?["finish","end","close","error"]:["end","close","error"])observe(stream,name,event);
 let forced=!successful;
 if(successful)child.stdin.end();else child.kill("SIGTERM");
 let result=await observeWithin(closed,graceMs);
 if(result===undefined){
  forced=true;child.kill("SIGKILL");result=await observeWithin(closed,killWaitMs);
 }
 if(result===undefined){
  for(const stream of [child.stdin,child.stdout,child.stderr])stream?.destroy?.();child.unref?.();
  throw Error("Verifier process cleanup unconfirmed");
 }
 if(successful){
  assert.equal(forced,false,`Verifier required forced shutdown: ${JSON.stringify({pid:child.pid??null,
   exitCode:child.exitCode??null,signalCode:child.signalCode??null,killed:child.killed??null,
   streams:Object.fromEntries([["stdin",child.stdin],["stdout",child.stdout],["stderr",child.stderr]].map(([name,stream])=>[name,stream?{
    destroyed:stream.destroyed??null,readableEnded:stream.readableEnded??null,writableEnded:stream.writableEnded??null,
   writableFinished:stream.writableFinished??null,writableLength:stream.writableLength??null
   }:null])),events,shutdownTrace})}`);
  assert.ok(result.code===0&&result.signal===null,"Verifier requires a natural zero exit");
 }
 return result;
}
