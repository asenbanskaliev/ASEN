import {lstatSync,readFileSync,realpathSync} from "node:fs";
import {isAbsolute,relative,resolve,sep} from "node:path";
import {hasSensitiveName} from "./path-safety.js";

/** Strict read-only pre-inspection for literal local scripts, not a shell evaluator. */
export interface AutoScriptEvidence{path:string;content:string;bytes:number;}
export type AutoEvidenceResult={kind:"none"}|{kind:"invalid"}|
 {kind:"evidence";items:readonly AutoScriptEvidence[]};
const credential=/(?:-----BEGIN [A-Z ]*PRIVATE KEY|sk-proj-|ghp_[a-z0-9]{20}|(?:api[_ -]?key|password|bearer|credential)\s*[=:]\s*\S+)/iu;
function literalPath(value:string):boolean{
 return value.length>0&&value.length<=256&&
  /^[A-Za-z0-9_./-]+$/u.test(value)&&!value.split("/").includes("..")&&
  !isAbsolute(value)&&!value.startsWith("-");
}
export function autoScriptEvidence(command:unknown,cwd:string):AutoEvidenceResult{
 if(typeof command!=="string"||command.length>1024)return {kind:"none"};
 // Do not interpret compound, quoted, interpolated or redirected shell commands.
 if(/[;&|\x60$<>\\\r\n"'()]/u.test(command))return {kind:"none"};
 const trimmed=command.trim(),parts=trimmed.split(/\s+/u);
 if(parts.length===0)return {kind:"none"};
 let selected:string|undefined;
 if(parts[0]==="node"&&parts.length===2&&/\.(?:mjs|cjs|js|ts)$/u.test(parts[1]??""))
  selected=parts[1];
 else if(["npm","pnpm","yarn"].includes(parts[0]??"")&&parts.length>=2&&parts.length<=3&&
   (parts[1]==="test"||parts[1]==="run"&&/^(?:test|check|build|lint|typecheck)$/u.test(parts[2]??"")))
  selected="package.json";
 else return {kind:"none"};
 if(typeof selected!=="string"||!literalPath(selected))return {kind:"invalid"};
 try{
  const workspace=realpathSync(cwd),target=resolve(workspace,selected),actual=realpathSync(target);
  const rest=relative(workspace,actual);
  if(!rest||rest===".."||rest.startsWith(".."+sep)||isAbsolute(rest)||hasSensitiveName(target)||hasSensitiveName(actual))
   return {kind:"invalid"};
  const info=lstatSync(target);
  if(!info.isFile()||info.isSymbolicLink()||info.size>8192||info.size===0)return {kind:"invalid"};
  const contents=readFileSync(actual);
  if(contents.length>8192||contents.includes(0))return {kind:"invalid"};
  const content=new TextDecoder("utf-8",{fatal:true}).decode(contents);
  if(credential.test(content))return {kind:"invalid"};
  return {kind:"evidence",items:Object.freeze([Object.freeze({
   path:rest.replace(/\\/gu,"/"),content,bytes:contents.length,
  })])};
 }catch{return {kind:"invalid"};}
}
