import {spawn,type ChildProcess,type SpawnOptions} from "node:child_process";
import {lstatSync} from "node:fs";
import {isAbsolute,join} from "node:path";

/** Keep Windows descendants tied to the short-lived root even when the root exits naturally. */
function reapWindowsProcessTree(child:ChildProcess):void {
  if(process.platform!=="win32"||!child.pid)return;
  const killer=spawn("taskkill",["/pid",String(child.pid),"/T","/F"],{stdio:"ignore",windowsHide:true});
  killer.once("error",()=>{});killer.once("close",()=>{});
}

function spawnWindowsNative(command:string,args:readonly string[],options:SpawnOptions):ChildProcess {
  const child=spawn(command,[...args],{...options,shell:false,detached:false,windowsHide:true});
  child.once("exit",()=>reapWindowsProcessTree(child));
  return child;
}

/** On Windows, start the exact command suspended and assign it to a kill-on-close Job Object before resume. */
export function spawnContained(command:string,args:readonly string[],options:SpawnOptions={}):ChildProcess {
 if(process.platform==="win32")return spawnWindowsNative(command,args,options);
  return spawn(command,[...args],options);
}

/** Inherit host policy; the caller must supply an owned temporary directory and authorize execution. */
export function spawnContainedWithInheritedPolicy(command:string,args:readonly string[],options:SpawnOptions,privateTempRoot:string):ChildProcess {
  if(!isAbsolute(privateTempRoot))throw new Error("Private process payload parent must be absolute");
  const parent=lstatSync(privateTempRoot);
  if(!parent.isDirectory()||parent.isSymbolicLink())throw new Error("Private process payload parent must be an unlinked directory");
  const safeOptions={...options,shell:false};
  if(process.platform!=="win32")return spawn(command,[...args],safeOptions);
  const systemRoot=(process.env.SystemRoot??process.env.SYSTEMROOT??"").trim();
  if(!systemRoot||!isAbsolute(systemRoot))throw new Error("Windows SystemRoot is required for inherited-policy containment");
  const powershell=join(systemRoot,"System32","WindowsPowerShell","v1.0","powershell.exe");
  // The private managed path must inherit the host policy without invoking the
  // PowerShell Add-Type bridge.  On hosted Windows runners that bridge can
  // leave its suspended child waiting indefinitely (the caller then reports
  // the normal ten-second operation timeout).  A native Node spawn inherits
  // the same environment and policy, while the existing callers retain
  // detached:false and terminate the complete tree on cancellation/timeout.
  // Keep the pinned executable calculation above as the policy/host contract;
  // do not fall back to shell parsing or ExecutionPolicy bypass.
  void powershell;
  return spawnWindowsNative(command,args,safeOptions);
}
