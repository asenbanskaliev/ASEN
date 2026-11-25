/** Admisión de ensayos: nunca aceptar un verde histórico que haya sido
 * sustituido por una ejecución más reciente fallida o todavía activa. */
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {setTimeout as pause} from "node:timers/promises";

export function exactValidationState(runs,sha){
 if(!/^[a-f0-9]{40}$/u.test(sha??"")||!Array.isArray(runs))throw Error("SHA o inventario de validación inválido");
 const selected=[];
 for(const name of ["CI","Release Gate"]){
  const latest=runs.filter(r=>r?.name===name&&r.head_sha===sha&&r.event==="pull_request"&&Number.isSafeInteger(r.id)).sort((a,b)=>b.id-a.id)[0];
  if(!latest)return {status:"blocked",reason:"Falta "+name+" del SHA exacto"};
  if(latest.status!=="completed")return {status:"waiting",reason:name+" todavía en curso"};
  if(latest.conclusion!=="success")return {status:"blocked",reason:name+" más reciente no superada"};
  selected.push(latest.id+":"+String(latest.run_attempt??1));
 }
 return {status:"ready",key:selected.join("/")};
}
async function main(){
 const sha=process.env.ASEN_EXPECTED_SHA,seconds=Number(process.argv[2]);
 if(!/^[a-f0-9]{40}$/u.test(sha??"")||!Number.isSafeInteger(seconds)||seconds<0||seconds>1500)throw Error("Parámetros de validación inválidos");
 const deadline=performance.now()+seconds*1000;let previous;
 do{
  const pages=JSON.parse(execFileSync("gh",["api","--paginate","--slurp","/repos/asenbanskaliev/ASEN/actions/runs?head_sha="+sha+"&event=pull_request&per_page=100"],{encoding:"utf8",timeout:30000,maxBuffer:16000000,stdio:["ignore","pipe","pipe"]}));
  const state=exactValidationState(pages.flatMap(page=>page.workflow_runs??[]),sha);
  if(state.status==="blocked")throw Error(state.reason);
  if(state.status==="ready"&&(seconds===0||previous===state.key)){console.log("CI y Release Gate admitidas: "+state.key);return;}
  previous=state.status==="ready"?state.key:undefined;
  if(seconds===0||performance.now()+12000>deadline)throw Error("Validación exacta no concluida dentro del límite");
  await pause(12000);
 }while(performance.now()<=deadline);
 throw Error("Validación exacta no concluida dentro del límite");
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)main().catch(error=>{console.error(error.message);process.exitCode=1;});
