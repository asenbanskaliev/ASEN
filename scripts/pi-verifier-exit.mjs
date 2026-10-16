import assert from "node:assert/strict";

async function observeWithin(closed,ms){
 let timer;
 try{return await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>resolve(undefined),ms);})]);}
 finally{clearTimeout(timer);}
}

export async function settleVerifierChild(child,closed,{successful=true,graceMs=5_000,killWaitMs=2_000}={}){
 for(const value of [graceMs,killWaitMs])assert.ok(Number.isSafeInteger(value)&&value>0);
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
  assert.equal(forced,false,"Verifier required forced shutdown");
  assert.ok(result.code===0&&result.signal===null,"Verifier requires a natural zero exit");
 }
 return result;
}
