/** T11: medición real del ancho de conversación que entrega Pi 1.2.
 * Compara sesión limpia y sesión con ASEN; sin modelos ni credenciales. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {appendFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const repo=dirname(dirname(fileURLToPath(import.meta.url)));
const expected=process.env.ASEN_EXPECTED_SHA;
assert.match(expected??"",/^[a-f0-9]{40}$/u);
const git=(dir,...args)=>execFileSync("git",["-C",dir,...args],{encoding:"utf8",timeout:15000}).trim();
assert.equal(git(repo,"rev-parse","HEAD"),expected);
const {spawn}=createRequire(import.meta.url)("node-pty");
const pi=JSON.parse(readFileSync(join(repo,"node_modules","@earendil-works","pi-coding-agent","package.json"),"utf8"));
assert.equal(pi.version,"1.2.0");
const binary=join(repo,"node_modules","@earendil-works","pi-coding-agent",typeof pi.bin==="string"?pi.bin:pi.bin.pi);
const temp=realpathSync(mkdtempSync(join(tmpdir(),"asen-t11-rail-")));
const project=join(temp,"proyecto"),home=join(temp,"home");
mkdirSync(project);mkdirSync(home,{mode:0o700});
git(project,"init","-q");git(project,"config","user.name","ASEN T11");
git(project,"config","user.email","t11@example.invalid");
writeFileSync(join(project,"README.md"),"medir reparto del espacio\n");
git(project,"add","README.md");git(project,"commit","-qm","base prueba T11");
const report={schema:"asen.t11.native-rail/v1",sha:expected,piVersion:pi.version,
 modelCalls:0,nvidiaCalls:0,baselineWidth:null,withRailWidth:null,realReservation:null,
 wideTree:null,narrowTree:null,restored:false,globalFull:false,result:"NOT_VERIFIED"};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(fn,msg,timeout=25000)=>{const start=Date.now();while(Date.now()-start<timeout){if(fn())return;await sleep(150);}throw Error(msg);};
const read=file=>{try{return readFileSync(file,"utf8").split("\n").filter(Boolean).map(JSON.parse);}catch{return [];}};
const samples=(rows,cols)=>rows.filter(row=>row.kind==="render"&&row.columns===cols).slice(-12);
async function run(label,withAsen,resize){
 const path=join(temp,label);mkdirSync(path);
 const ready=join(path,"ready"),stop=join(path,"stop"),records=join(path,"measure.jsonl"),probe=join(path,"probe.ts");
 const lines=[
  'import {appendFileSync,existsSync,writeFileSync} from "node:fs";',
  'const out='+JSON.stringify(records)+';',
  'const ready='+JSON.stringify(ready)+';',
  'const stop='+JSON.stringify(stop)+';',
  'const NODE=Symbol.for("@earendil-works/pi-tui/layout-node");',
  'let count=0;',
  'export default function(pi){',
  ' pi.on("project_trust",()=>({trusted:"yes",remember:false}));',
  ' pi.on("before_agent_start",()=>{throw Error("El ensayo T11 prohíbe modelos");});',
  ' pi.on("session_start",(_event,ctx)=>{',
  '  ctx.ui.setWidget("t11:width",(tui)=>({',
  '   render(width){',
  '    if(count++<500){',
  '     const root=tui.layoutRoot;const fn=root?.[NODE];let node;',
  '     try{node=typeof fn==="function"?fn.call(root):undefined;}catch{}',
  '     appendFileSync(out,JSON.stringify({kind:"render",width,columns:tui.terminal?.columns??null,mode:tui.mode??null,',
  '      type:node?.type??null,gap:node?.gap??null,count:node?.entries?.length??null,rail:node?.entries?.[1]?.basis??null})+String.fromCharCode(10));',
  '    }',
  '    return ["ASEN T11 medida nativa"];',
  '   },invalidate(){}',
  '  }),{placement:"aboveEditor"});',
  '  writeFileSync(ready,"ok");',
  '  const interval=setInterval(()=>{if(existsSync(stop)){clearInterval(interval);clearTimeout(safety);ctx.shutdown();}},100);',
  '  const safety=setTimeout(()=>{clearInterval(interval);ctx.shutdown();},90000);',
  ' });',
  '}'
 ];
 writeFileSync(probe,lines.join("\n")+"\n");
 const env={...process.env,HOME:home,USERPROFILE:home,PI_CODING_AGENT_DIR:join(path,"agent"),
  ASEN_NO_SKILL_REGISTRY:"1",PI_TELEMETRY:"0",TERM:"xterm-256color",COLORTERM:"",NO_COLOR:"1",FORCE_COLOR:"0"};
 for(const key of Object.keys(env))if(key.startsWith("GIT_")||/(?:KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL)/iu.test(key))delete env[key];
 const opts=["--no-extensions",...(withAsen?["--extension",join(repo,"extensions","asen.ts")]:[]),
  "--extension",probe,"--no-skills","--no-builtin-tools","--provider","openai","--model","gpt-4o"];
 const terminal=spawn(process.execPath,[binary,...opts],{cwd:project,env,cols:180,rows:40,name:"xterm-256color"});
 let exited=false,output="";
 terminal.onExit(()=>{exited=true;});
 terminal.onData(data=>{output=(output+data).slice(-18000);});
 try{
  await until(()=>existsSync(ready)||exited,label+": inicio no observado");
  assert.equal(exited,false,label+": Pi terminó al iniciar");
  await until(()=>samples(read(records),180).length>=1||exited,label+": faltan dibujos a 180 columnas");
  assert.equal(exited,false,label+": Pi salió durante el dibujo");
  await sleep(600);
  const wide=samples(read(records),180);
  if(!resize)return {wide,small:[],restored:[]};
  terminal.resize(139,40);
  await until(()=>samples(read(records),139).length>0||exited,label+": no hubo dibujo a 139");
  assert.equal(exited,false,label+": Pi salió al redimensionar");
  const small=samples(read(records),139);
  const before=read(records).filter(row=>row.kind==="render"&&row.columns===180).length;
  terminal.resize(180,40);
  await until(()=>read(records).filter(row=>row.kind==="render"&&row.columns===180).length>before||exited,label+": no redibujó al volver a 180");
  assert.equal(exited,false,label+": Pi salió al ampliar");
  return {wide,small,restored:samples(read(records),180)};
 }catch(error){throw Error(label+": "+String(error)+", salida host "+output.slice(-1600));}
 finally{
  writeFileSync(stop,"ok");
  for(let i=0;i<40&&!exited;i++)await sleep(100);
  if(!exited)try{terminal.kill();}catch{}
 }
}
try{
 const baseline=await run("baseline",false,false);
 const actual=await run("asen",true,true);
 const base=baseline.wide.at(-1),wide=actual.wide.at(-1),narrow=actual.small.at(-1),restored=actual.restored.at(-1);
 assert.ok(base&&wide&&narrow&&restored,"Pi debe emitir lecturas de geometría");
 Object.assign(report,{baselineWidth:base.width,withRailWidth:wide.width,realReservation:base.width-wide.width,
  wideTree:{type:wide.type,gap:wide.gap,count:wide.count,rail:wide.rail},
  narrowTree:{type:narrow.type,gap:narrow.gap,count:narrow.count,rail:narrow.rail},
  restored:restored.type==="hstack"&&restored.rail===50});
 assert.equal(wide.type,"hstack","El host debe dividir el ancho");
 assert.equal(wide.gap,3);assert.equal(wide.count,2);assert.equal(wide.rail,50);
 assert.ok(base.width-wide.width>=51&&base.width-wide.width<=55,"Debe reservar cerca de 53 columnas reales");
 assert.notEqual(narrow.rail,50,"El panel fijo debe desaparecer bajo 140 columnas");
 assert.equal(report.restored,true,"El lateral debe reaparecer al ampliar");
 report.result="PASS_REAL_PI_RAIL";
}finally{
 const file=process.env.ASEN_T11_NATIVE_RAIL_REPORT;
 if(file){mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(report,null,2)+"\n",{mode:0o600});}
 try{rmSync(temp,{recursive:true,force:true,maxRetries:8,retryDelay:100});}catch{}
}
assert.equal(report.result,"PASS_REAL_PI_RAIL");
console.log(JSON.stringify(report));
