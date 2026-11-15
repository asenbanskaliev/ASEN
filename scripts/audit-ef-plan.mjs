/** F7 progress consistency, NOT a verifier of remote CI or FULL equivalence. */
import {existsSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const EF_IDS=Object.freeze([
 "EF-000","EF-001","EF-002","EF-003",
 "EF-101","EF-102","EF-103",
 "EF-201","EF-202","EF-203",
 "EF-301","EF-302","EF-303","EF-304",
 "EF-401","EF-402","EF-403",
 "EF-501","EF-502","EF-503",
 "EF-601","EF-602","EF-603","EF-604",
 "EF-701","EF-702","EF-703","EF-704",
]);
const reportLine=/^- \[([ x])\] (EF-[0-9]{3}) (.+)$/gmu;
const receipt=/\*\*VERIFICADO:\*\* `([a-zA-Z0-9/._-]+)` \+ `([a-zA-Z0-9/._-]+)` · CI `([0-9]{9,14})` \/ SHA `([a-f0-9]{40})`\.$/u;
function safePath(value){
 return typeof value==="string"&&value.length<=256&&/^[a-zA-Z0-9._/-]+$/u.test(value)&&
  !value.startsWith("/")&&!value.includes("\\")&&
  value.split("/").every(part=>part.length>0&&part!=="."&&part!=="..");
}
/** Fail closed when the editable ODD and the 28-item source of truth diverge.
 * A cited path and run are traceability, never a cryptographic proof of CI. */
export function auditEfPlanMarkdown(markdown,{root=fileURLToPath(new URL("../",import.meta.url)),fileExists=existsSync}={}){
 if(typeof markdown!=="string")throw new TypeError("EF plan must be markdown text");
 const begin=markdown.indexOf("## Plan ejecutable: tareas y dependencias");
 const end=markdown.indexOf("## Estrategia de tandas grandes y CI",begin+1);
 if(begin<0||end<begin)throw new Error("EF plan section is missing or reordered");
 const plan=markdown.slice(begin,end),rows=[...plan.matchAll(reportLine)];
 if(rows.length!==EF_IDS.length)throw new Error(`EF plan must contain exactly ${EF_IDS.length} checklist items, found ${rows.length}`);
 let verified=0,partial=0,blocked=0;
 const byId=[];
 for(const [index,match] of rows.entries()){
  const [,mark,id,description]=match;
  if(id!==EF_IDS[index])throw new Error(`EF item order, identity or uniqueness changed at index ${index}: ${id}`);
  if(mark==="x"){
   const citation=description.match(receipt);
   if(!citation)throw new Error(`${id} checked without source, regression test and exact-SHA CI receipt`);
   const [,source,test,run,sha]=citation;
   if(!safePath(source)||!safePath(test)||!test.startsWith("tests/")||
      !fileExists(resolve(root,source))||!fileExists(resolve(root,test))||
      !Number.isSafeInteger(Number(run))||!sha)
    throw new Error(`${id} checked with invalid or missing traceability files/CI`);
   verified++;
   byId.push(Object.freeze({id,status:"VERIFICADO",source,test,ciRun:run,ciSha:sha}));
  }else{
   if(description.includes("**VERIFICADO:**"))throw new Error(`${id} has verification evidence but remains unchecked`);
   const status=description.match(/\*\*(PARCIAL|BLOQUEADO):\*\* (.+)$/u);
   if(!status||!status[2]?.trim()||status[2].length<14)throw new Error(`${id} unchecked without explicit remaining blocker`);
   if(status[1]==="PARCIAL")partial++;else blocked++;
   byId.push(Object.freeze({id,status:status[1],missing:status[2]}));
  }
 }
 const summary=plan.match(/\*\*Resumen del plan:\*\* ([0-9]{1,2})\/28 EF/u);
 if(!summary||Number(summary[1])!==verified)throw new Error("EF plan summary disagrees with the checked evidence");
 return Object.freeze({total:EF_IDS.length,verified,partial,blocked,globalFull:false,entries:Object.freeze(byId)});
}
export function readEfPlan(){
 return readFileSync(new URL("../odd/tasks/equivalencia-funcional-agentes-full.md",import.meta.url),"utf8");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const summary=auditEfPlanMarkdown(readEfPlan());
  console.log(JSON.stringify({total:summary.total,verified:summary.verified,partial:summary.partial,
   blocked:summary.blocked,globalFull:false,meaning:"Structural traceability only; real A/B, provider and human-consent evidence remains separate."},null,2));
 }catch(error){console.error(error);process.exitCode=1;}
}
