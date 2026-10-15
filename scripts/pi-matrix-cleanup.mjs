import {spawnSync} from "node:child_process";
import {basename,dirname,resolve} from "node:path";
import {tmpdir} from "node:os";

export function cleanupMatrixWorkspace(root,{run=spawnSync}={}){
 const directory=resolve(root);
 if(dirname(directory)!==resolve(tmpdir())||!basename(directory).startsWith("asen-pi-matrix-"))
  throw Error("Cleanup requires a generated temporary matrix workspace");
 const code="require('node:fs').rmSync(process.argv[1],{recursive:true,force:true,maxRetries:2,retryDelay:100})";
 // Windows antivirus/file-handle release can lag behind the completed Pi matrix.
 // Keep cleanup bounded, but allow the OS time to release installed package trees.
 const result=run(process.execPath,["-e",code,directory],{timeout:process.platform==="win32"?300_000:30_000,maxBuffer:1024*1024,stdio:"pipe"});
 if(result.error||result.status!==0||result.signal!==null)throw Error("Matrix workspace cleanup did not complete within its command deadline");
 return {completed:true};
}
