import {SessionManager} from "@earendil-works/pi-coding-agent";
import {lstat,realpath,open} from "node:fs/promises";
import {constants} from "node:fs";
import path from "node:path";
import {preparePrivateFile} from "../../io/private-file.js";
import {sameWorkspaceIdentityPath} from "../workspace-store.js";

export interface NativeChildPlanningSession{
 readonly sessionId:string;readonly projectId:string;readonly sessionFile:string;
}
/** Crea una sesión de planificación REAL mediante la API pública de Pi.
 * El mensaje es la instrucción delegada aceptada por el usuario, no una
 * respuesta inventada del modelo. No carga extensiones ni llama al proveedor.
 */
export async function createNativeChildPlanningSession(projectId:string,sessionDir:string,instruction:string):Promise<NativeChildPlanningSession>{
 if(!path.isAbsolute(projectId)||!path.isAbsolute(sessionDir)||!instruction||instruction.length>4096)
  throw new Error("Invalid native child planning session");
 const root=await realpath(projectId);
 await preparePrivateFile(path.join(sessionDir,".asen-native-session-check"),true);
 const dir=await realpath(sessionDir);
 const manager=SessionManager.create(root,dir);
 const file=manager.getSessionFile(),id=manager.getSessionId();
 if(!file||!path.isAbsolute(file)||!sameWorkspaceIdentityPath(path.dirname(file),dir)||!id)
  throw new Error("Pi did not issue a private native child session");
 // Pi 1.2 persiste la sesión al registrar un mensaje del usuario.
 manager.appendMessage({role:"user",content:instruction,timestamp:Date.now()});
 const identity=Object.freeze({sessionId:id,projectId:root,sessionFile:file});
 await assertNativeChildPlanningSession(identity,instruction);
 return identity;
}
/** La identidad procede del archivo real de Pi y se verifica al reabrirlo.
 * No acepta sesiones simuladas, enlaces, ni una carpeta de otro candidato.
 */
export async function assertNativeChildPlanningSession(session:NativeChildPlanningSession,expectedInstruction?:string):Promise<void>{
 if(!path.isAbsolute(session.sessionFile)||!path.isAbsolute(session.projectId)||!session.sessionId)
  throw new Error("Invalid native Pi session identity");
 const info=await lstat(session.sessionFile);
 if(info.isSymbolicLink()||!info.isFile()||info.size>256*1024)
  throw new Error("Native Pi planning session is not a bounded regular file");
 if(!await preparePrivateFile(session.sessionFile))throw new Error("Native Pi planning session is missing");
 // Leer y validar la misma instantánea acotada del JSONL nativo de Pi 1.2.
 // No reabrir mediante una API que podría leer un archivo ampliado o sustituido.
 const fd=await open(session.sessionFile,process.platform==="win32"?constants.O_RDONLY:
  constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 let bytes:Buffer;
 try{
  const before=await fd.stat();
  if(!before.isFile()||before.dev!==info.dev||before.ino!==info.ino||before.size>256*1024)
   throw Error("Native Pi planning session changed before reading");
  bytes=Buffer.alloc(before.size);
  let offset=0;
  while(offset<bytes.length){
   const {bytesRead}=await fd.read(bytes,offset,bytes.length-offset,offset);
   if(!bytesRead)throw Error("Native Pi planning session truncated");
   offset+=bytesRead;
  }
  if((await fd.read(Buffer.alloc(1),0,1,bytes.length)).bytesRead)throw Error("Native Pi planning session grew");
  const after=await fd.stat(),named=await lstat(session.sessionFile);
  if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||
   named.isSymbolicLink()||named.dev!==before.dev||named.ino!==before.ino||named.size!==before.size)
   throw Error("Native Pi planning session changed while reading");
 }finally{await fd.close();}
 const entries=new TextDecoder("utf-8",{fatal:true}).decode(bytes).split("\n").filter(line=>line.trim()).map(line=>JSON.parse(line));
 const header=entries[0];
 if(header?.type!=="session"||header.version!==3||header.id!==session.sessionId||
  typeof header.cwd!=="string"||!path.isAbsolute(header.cwd)||
  entries.slice(1).some(entry=>!entry||typeof entry!=="object"||entry.type==="session")||
  !sameWorkspaceIdentityPath(await realpath(header.cwd),await realpath(session.projectId)))
  throw new Error("Native Pi planning session identity or project changed");
 const message=entries.find(entry=>entry?.type==="message"&&entry.message?.role==="user");
 const content=message?.message?.content;
 if(typeof content!=="string"||!content||
  (expectedInstruction!==undefined&&content!==expectedInstruction))
  throw new Error("Native Pi delegated instruction is missing or changed");
}
