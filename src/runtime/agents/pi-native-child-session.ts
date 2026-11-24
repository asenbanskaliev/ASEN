import {SessionManager} from "@earendil-works/pi-coding-agent";
import {lstat,realpath} from "node:fs/promises";
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
 const manager=SessionManager.open(session.sessionFile);
 if(manager.getSessionId()!==session.sessionId||
  !sameWorkspaceIdentityPath(await realpath(manager.getCwd()),await realpath(session.projectId)))
  throw new Error("Native Pi planning session identity or project changed");
 const message=manager.getEntries().find(entry=>entry.type==="message"&&entry.message.role==="user");
 if(!message||message.type!=="message"||typeof message.message.content!=="string"||!message.message.content||
  (expectedInstruction!==undefined&&message.message.content!==expectedInstruction))
  throw new Error("Native Pi delegated instruction is missing or changed");
}
