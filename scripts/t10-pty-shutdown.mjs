import {writeFileSync} from "node:fs";

// Require actual Pi PTY termination before PASS; a forced kill is never evidence.
export function requestGracefulPtyExit({child,shutdownFile,writeMarker=writeFileSync,timeoutMs=15_000}){
 if(!child||typeof child.onExit!=="function"||typeof child.kill!=="function"
  ||typeof shutdownFile!=="string"||!shutdownFile
  ||!Number.isSafeInteger(timeoutMs)||timeoutMs<=0)throw new TypeError("invalid T10 PTY shutdown input");
 return new Promise((resolve,reject)=>{
  let settled=false,subscription;
  const finish=(error,result)=>{
   if(settled)return;
   settled=true;
   clearTimeout(timer);
   subscription?.dispose?.();
   if(error)reject(error);else resolve(result);
  };
  const timer=setTimeout(()=>{
   try{child.kill();}catch{/* Cleanup only after FAILED shutdown. */}
   finish(Error("Pi TUI did not exit after shutdown request within "+timeoutMs+"ms"));
  },timeoutMs);
  try{
   subscription=child.onExit(result=>{
    if(result?.exitCode===0&&(result.signal===0||result.signal===null||result.signal===undefined))
     finish(null,result);
    else finish(Error("Pi TUI exited unsuccessfully after shutdown: "+JSON.stringify(result)));
   });
   writeMarker(shutdownFile,"shutdown");
  }catch(error){
   try{child.kill();}catch{/* Cleanup only after FAILED shutdown. */}
   finish(error);
  }
 });
}
