import {realpath} from "node:fs/promises";
import {loadCheckpoint,type ResumeIdentity} from "./checkpoint.js";

export interface PiSessionIdentity extends ResumeIdentity{sessionFile:string;}
export interface PiSessionState{sessionId:string;sessionFile:string;}

/** Reconcile Pi's live session with ASEN's persisted candidate before resuming work. */
export async function resumePiSession(checkpointPath:string,identity:PiSessionIdentity,state:PiSessionState){
 if(!state||state.sessionId!==identity.sessionId)throw new Error("Pi session identity mismatch");
 if(typeof state.sessionFile!=="string"||await realpath(state.sessionFile)!==await realpath(identity.sessionFile))throw new Error("Pi session file mismatch");
 return loadCheckpoint(checkpointPath,{...identity,piSessionFile:identity.sessionFile});
}
