/** E1: decisiones del padre Pi auténtico sobre peticiones naturales.
 * Host instrumentado, sin agentes hijos ni escritura autorizada. */
import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {StringDecoder} from "node:string_decoder";
import {disablePiRetries} from "./t12-pi-retry-settings.mjs";

const root=realpathSync(resolve(process.env.GITHUB_WORKSPACE??process.cwd()));
const sha=process.env.ASEN_EXPECTED_SHA,output=process.env.ASEN_E1_REPORT;
const model="nvidia/nemotron-3.5-lightning-30b-a3b";
const gitEnv={PATH:process.env.PATH,GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:"/dev/null",GIT_TERMINAL_PROMPT:"0"};
const git=(cwd,...args)=>execFileSync("git",["--no-replace-objects","-C",cwd,...args],{encoding:"utf8",env:gitEnv,timeout:10000,stdio:["ignore","pipe","pipe"]}).trim();
assert.ok(output&&process.env.NVIDIA_API_KEY&&/^[a-f0-9]{40}$/.test(sha??""));
assert.equal(git(root,"rev-parse","HEAD"),sha);assert.equal(git(root,"status","--porcelain=v1"),"");
const base=realpathSync(mkdtempSync(join(tmpdir(),"asen-e1-natural-")));
const report={schema:"asen.e1.natural-pi/v1",sha,model,status:"BLOCKED",globalFull:false,
 authorization:"TEST_HOST_NO_WRITER_AUTHORITY",autoRetry:false,costVerified:false,cases:[]};
const cases=[
 {id:"directo",mode:"organic",prompt:"¿Cuánto es dos más tres? Responde solo con el número."},
 {id:"ambiguo",mode:"organic",prompt:"Quiero que modifiques el README para publicar el horario. Todavía no he decidido si será de mañana o de tarde. No inventes esa decisión."},
 {id:"delegado",mode:"full-delegation",prompt:"Cambia únicamente el archivo README.md: sustituye el texto Base por Horario aprobado. Es una modificación de documentación. No cambies ningún otro archivo."}
];
const canonical=value=>value.replace(/^(?:nvidia\/)+/,"");
function inspectModel(message){
 return message?.provider==="nvidia"&&typeof message.model==="string"&&canonical(message.model)===canonical(model)&&
  (message.responseModel===undefined||typeof message.responseModel==="string"&&canonical(message.responseModel.replace(/^private\//,""))===canonical(model));
}
async function runCase(c){
 const work=join(base,c.id),project=join(work,"repo"),home=join(work,"home"),privateDir=join(home,".asen"),piDir=join(home,"pi");
 mkdirSync(project,{recursive:true});mkdirSync(privateDir,{recursive:true,mode:0o700});mkdirSync(piDir,{recursive:true,mode:0o700});
 await disablePiRetries(piDir);
 const profiles=join(privateDir,"profiles.json"),record=join(work,"plan.json"),runnerCalls=join(work,"runner");
 writeFileSync(profiles,JSON.stringify({schema:"asen.runtime-profiles/v1",active:"ensayo",profiles:[{name:"ensayo",mode:c.mode,routes:{
  orchestrator:{model,thinking:"minimal"},worker:{model,thinking:"minimal"},explorer:{model,thinking:"minimal"}
 }}]}),{mode:0o600});
 writeFileSync(join(project,"README.md"),"Base\n");
 git(project,"init","-q","-b","ensayo");git(project,"config","user.name","ASEN");git(project,"config","user.email","test@example.invalid");
 git(project,"add","README.md");git(project,"commit","--no-gpg-sign","-qm","Base");
 const initial=git(project,"rev-parse","HEAD"),probe=join(work,"probe.ts");
 // La herramienta original de ASEN toma la decisión. Solo se registra su
 // resultado estructurado; no se modifican los hechos propuestos por el modelo.
 writeFileSync(probe,"import {createPiExtension} from "+JSON.stringify(join(root,"extensions","asen.ts"))+";\n"+
  "import {appendFileSync} from 'node:fs';\n"+
  "export default function(pi){\n"+
  "const wrapped=new Proxy(pi,{get(target,key){const value=Reflect.get(target,key,target);if(key==='registerTool')return tool=>target.registerTool(tool.name==='asen_plan_request'?{...tool,execute:async(...args)=>{const result=await tool.execute(...args);const d=result.details??{};appendFileSync("+JSON.stringify(record)+",JSON.stringify({route:d.route??null,risk:d.risk??null,inlineClarification:d.inlineClarification===true,inlineContinuation:d.inlineContinuation===true,persistence:d.persistence?.status??null,started:d.execution?.started??null,authorized:d.execution?.authorized??null,roles:(d.executablePlan?.tasks??[]).map(t=>({role:t.role,paths:t.writeSurfaces??[]}))})+'\\n',{mode:0o600});return result;}}:tool);return typeof value==='function'?value.bind(target):value;}});\n"+
  "createPiExtension({homeDir:()=>"+JSON.stringify(home)+",packageRoot:"+JSON.stringify(root)+",profilesFile:"+JSON.stringify(profiles)+",enableMemoryRuntime:false,enableWorkspaceRuntime:false,enableAgentRuntime:true,enableTodoRuntime:true,autoAdvancePlans:false,agentRunner:{run:async request=>{appendFileSync("+JSON.stringify(runnerCalls)+",'1\\n',{mode:0o600});return {id:request.id,ok:false,output:'Ensayo E1: ningún agente hijo autorizado'};}}})(wrapped);\n"+
  "pi.on('tool_call',event=>event.toolName==='asen_plan_request'?undefined:{block:true,reason:'Ensayo E1: herramienta no autorizada'});\n}\n");
 const env={HOME:home,USERPROFILE:home,PI_CODING_AGENT_DIR:piDir,NVIDIA_API_KEY:process.env.NVIDIA_API_KEY,
  ASEN_NO_SKILL_REGISTRY:"1",TERM:"dumb",...gitEnv};
 const child=spawn("pi",["--mode","rpc","--no-extensions","--extension",probe,"--no-skills","--no-builtin-tools","--provider","nvidia","--model",model],{cwd:project,env,stdio:["pipe","pipe","pipe"]});
 const summary={id:c.id,mode:c.mode,status:"BLOCKED",modelSelected:false,responseModelDeclared:false,
  parentTurns:0,toolCalls:0,planCalls:0,childCalls:0,writeAuthority:false,projectClean:false,durationMs:0};
 const started=performance.now();let bytes=0,buffer="",failure=false,settled=false,promptSent=false,ack=false;
 let finalText="";const decoder=new StringDecoder("utf8");
 const send=value=>child.stdin.write(JSON.stringify(value)+"\n");
 const stop=()=>{failure=true;child.kill();};
 const timeout=setTimeout(stop,150000);
 const handle=event=>{
  if(event.type==="response"&&event.id==="state"){
   if(!event.success||promptSent)throw Error("Host no disponible");
   promptSent=true;send({type:"prompt",id:"peticion",message:c.prompt});
  }
  if(event.type==="response"&&event.id==="peticion"){if(!event.success)throw Error("Petición rechazada");ack=true;}
  if(event.type==="tool_execution_start"){
   summary.toolCalls++;
   if(event.toolName!=="asen_plan_request"||summary.toolCalls>1)throw Error("Herramienta inesperada o repetida");
  }
  if(event.type==="message_end"&&event.message?.role==="assistant"){
   summary.parentTurns++;
   if(summary.parentTurns>3||event.message.stopReason==="error"||!inspectModel(event.message))throw Error("Turno del proveedor no verificado");
   summary.modelSelected=true;summary.responseModelDeclared||=typeof event.message.responseModel==="string";
   finalText=(event.message.content??[]).filter(p=>p.type==="text").map(p=>p.text).join("\n").trim();
  }
  if(event.type==="extension_ui_request"&&["confirm","select","input","editor"].includes(event.method))throw Error("Diálogo no autorizado en E1");
  if(event.type==="agent_settled"){settled=true;child.stdin.end();}
 };
 child.stdout.on("data",chunk=>{
  try{bytes+=chunk.length;if(bytes>2_000_000)throw Error("Salida excesiva");
   buffer+=decoder.write(chunk);let index;while((index=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,index).trim();buffer=buffer.slice(index+1);if(line)handle(JSON.parse(line));}
  }catch{stop();}
 });
 child.stderr.resume();child.stdin.on("error",stop);
 const closed=new Promise(resolve=>{child.once("error",()=>{failure=true;resolve({code:null,signal:"error"});});child.once("close",(code,signal)=>resolve({code,signal}));});
 send({type:"get_state",id:"state"});
 const end=await closed;clearTimeout(timeout);
 try{
  assert.ok(!failure&&settled&&promptSent&&ack&&end.code===0&&end.signal===null);
  assert.ok(summary.modelSelected&&finalText);
  let plans=[];try{plans=readFileSync(record,"utf8").trim().split("\n").filter(Boolean).map(JSON.parse);}catch(error){if(error.code!=="ENOENT")throw error;}
  let calls="";try{calls=readFileSync(runnerCalls,"utf8");}catch(error){if(error.code!=="ENOENT")throw error;}
  summary.planCalls=plans.length;summary.childCalls=calls.trim()?calls.trim().split("\n").length:0;
  assert.equal(summary.childCalls,0);assert.equal(summary.planCalls,summary.toolCalls);
  summary.projectClean=git(project,"rev-parse","HEAD")===initial&&git(project,"status","--porcelain=v1")==="";
  assert.ok(summary.projectClean);assert.equal(readFileSync(join(project,"README.md"),"utf8"),"Base\n");
  for(const p of plans){assert.notEqual(p.started,true);assert.notEqual(p.authorized,true);}
  if(c.id==="directo"){assert.equal(plans.length,0);assert.equal(finalText,"5");}
  if(c.id==="ambiguo"){
   assert.equal((finalText.match(/\?/g)??[]).length,1);assert.ok(/mañana|tarde/i.test(finalText));
   assert.ok(plans.every(p=>p.inlineClarification&&p.persistence!=="saved"));
  }
  if(c.id==="delegado"){
   assert.equal(plans.length,1);const p=plans[0];assert.equal(p.persistence,"saved");
   assert.ok(p.roles.some(t=>t.role==="worker"&&JSON.stringify(t.paths)===JSON.stringify(["README.md"])));
   assert.ok(!p.inlineContinuation&&!p.inlineClarification);
  }
  summary.status="PASS_NATURAL_DECISION_TEST_ONLY";
 }catch{/* El recibo nunca contiene texto privado ni errores del proveedor. */}
 summary.durationMs=Math.round(performance.now()-started);return summary;
}
try{
 for(const c of cases){const result=await runCase(c);report.cases.push(result);if(result.status!=="PASS_NATURAL_DECISION_TEST_ONLY")break;}
 if(report.cases.length===cases.length&&report.cases.every(c=>c.status==="PASS_NATURAL_DECISION_TEST_ONLY"))report.status="PASS_REAL_E1_BOUNDED_DECISIONS_ONLY";
}finally{
 rmSync(base,{recursive:true,force:true});
 mkdirSync(resolve(output,".."),{recursive:true,mode:0o700});
 writeFileSync(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify(report));
}
if(report.status!=="PASS_REAL_E1_BOUNDED_DECISIONS_ONLY")process.exitCode=1;
