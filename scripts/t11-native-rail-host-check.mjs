/** T11: medición real del ancho de conversación que entrega Pi 1.2.
 * Compara sesión limpia y sesión con ASEN; sin modelos ni credenciales. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {appendFileSync,chmodSync,existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,statSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const repo=dirname(dirname(fileURLToPath(import.meta.url)));
const expected=process.env.ASEN_EXPECTED_SHA;
assert.match(expected??"",/^[a-f0-9]{40}$/u);
const git=(dir,...args)=>execFileSync("git",["-C",dir,...args],{encoding:"utf8",timeout:15000}).trim();
assert.equal(git(repo,"rev-parse","HEAD"),expected);
// node-pty 1.1.0 puede distribuir spawn-helper con modo 0644 en macOS.
 // Solo se repara el ejecutable exacto de la dependencia de prueba; nunca el proyecto de origen.
if(process.platform==="darwin"){
 const helpers=[
  join(repo,"node_modules","node-pty","build","Release","spawn-helper"),
  join(repo,"node_modules","node-pty","prebuilds",`darwin-${process.arch}`,"spawn-helper")
 ].filter(existsSync);
 assert.ok(helpers.length>0,"Falta el auxiliar nativo spawn-helper de node-pty");
 for(const helper of helpers){
  const mode=statSync(helper).mode;
  if((mode&0o111)===0)chmodSync(helper,mode|0o111);
  assert.ok((statSync(helper).mode&0o111)!==0,"spawn-helper sigue sin permiso de ejecución");
 }
}
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
 wideTree:null,narrowTree:null,restored:false,bottomTree:null,bottomAt139:null,bottomRestored:false,interaction:null,
 chromeRender:null,narrowMatrix:[],lastFailure:null,startupRecovery:null,closedSessions:[],globalFull:false,result:"NOT_VERIFIED"};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(fn,msg,timeout=25000)=>{const start=Date.now();while(Date.now()-start<timeout){if(fn())return;await sleep(150);}throw Error(msg);};
const read=file=>{try{return readFileSync(file,"utf8").split("\n").filter(Boolean).map(JSON.parse);}catch{return [];}};
const samples=(rows,cols)=>rows.filter(row=>row.kind==="render"&&row.columns===cols).slice(-12);
async function run(label,withAsen,resize,interaction=false){
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
  '    if(count++<2500){',
  '     const root=tui.layoutRoot;const fn=root?.[NODE];let node;',
  '     try{node=typeof fn==="function"?fn.call(root):undefined;}catch{}',
  '     let railContent,railBox;',
  '     try{railContent=node?.type==="hstack"?node.entries?.[1]?.component?.[NODE]?.().component:undefined;}catch{}',
  '     const railRows=railContent?.render?.(48)??[];',
  '     const heading=railRows.findIndex(line=>line.includes("TODOS"));',
  '     function seek(box){if(!box)return;if(box.component===railContent)railBox=box;for(const child of box.children??[])seek(child);}',
  '     seek(tui.currentLayout?.root);',
  '     appendFileSync(out,JSON.stringify({kind:"render",width,columns:tui.terminal?.columns??null,rows:tui.terminal?.rows??null,mode:tui.mode??null,',
  '      type:node?.type??null,gap:node?.gap??null,count:node?.entries?.length??null,rail:node?.entries?.[1]?.basis??null,',
  '      mouseX:railBox&&heading>=0?railBox.rect.x+3:null,mouseY:railBox&&heading>=0?railBox.rect.y+heading+1:null,',
  '      todosOpen:railRows.some(row=>row.includes("▾ TODOS")),todosClosed:railRows.some(row=>row.includes("▸ TODOS")),',
  '      railFocus:typeof tui.getFocusedComponent==="function"&&tui.getFocusedComponent()===railContent,',
  '      hasRootHook:typeof fn==="function",rootHookName:typeof fn==="function"?fn.name:null,',
  '      themeName:String(ctx.ui.theme?.name??"unknown"),themeConstructor:String(ctx.ui.theme?.constructor?.name??"unknown")})+String.fromCharCode(10));',
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
  "--extension",probe,"--no-skills","--no-builtin-tools","--tui-mode","fullscreen","--provider","openai","--model","gpt-4o"];
 const terminal=spawn(process.execPath,[binary,...opts],{cwd:project,env,cols:180,rows:40,name:"xterm-256color"});
 let exited=false,output="",stage="inicio";
 terminal.onExit(()=>{exited=true;});
 terminal.onData(data=>{output=(output+data).slice(-18000);});
 try{
  await until(()=>existsSync(ready)||exited,label+": inicio no observado");
  assert.equal(exited,false,label+": Pi terminó al iniciar");
  await until(()=>samples(read(records),180).length>=1||exited,label+": faltan dibujos a 180 columnas");
  assert.equal(exited,false,label+": Pi salió durante el dibujo");
  await sleep(600);
  const wide=samples(read(records),180);
  // La cabecera inferior debe aparecer en la salida del pseudoterminal de Pi,
  // no únicamente en un renderizador simulado. No infiere la posición en píxeles.
  let chromeRender;
  if(label==="asen-bottom"){
   await until(()=>output.includes("π ASEN")&&output.includes("Pi 1.2.0")||exited,
    label+": cabecera inferior no observada en el host Pi");
   assert.equal(exited,false,label+": Pi salió antes de renderizar la cabecera");
   chromeRender={source:"native-pty-output",brandObserved:output.includes("π ASEN"),
    piVersionObserved:output.includes("Pi 1.2.0"),
    placementConfigured:"below-input",surfaceConfigured:"tinted"};
  }
  if(interaction){
   await until(()=>samples(read(records),180).some(row=>
    Number.isSafeInteger(row.mouseX)&&Number.isSafeInteger(row.mouseY)&&row.mouseY>0&&row.todosOpen),
    label+": no fue posible localizar la cabecera real de TODOS");
   const before=samples(read(records),180).findLast(row=>row.mouseX!==null&&row.todosOpen);
   assert.ok(before&&before.mouseX>0&&before.mouseY>0,"La prueba necesita coordenadas observadas en Pi");
   const starting=read(records).length;
   // Pi recibe entrada SGR real por el pseudo-terminal, no se llama al handler a mano.
   const sgr=(suffix)=>"\x1b[<0;"+before.mouseX+";"+before.mouseY+suffix;
   terminal.write(sgr("M"));terminal.write(sgr("m"));
   await until(()=>read(records).slice(starting).some(row=>row.todosClosed&&row.railFocus),
    label+": el clic nativo no plegó TODOS y enfocó el lateral");
   const clicked=read(records).length;
   terminal.write("\x1b");
   await until(()=>read(records).slice(clicked).some(row=>row.todosClosed&&!row.railFocus),
    label+": Escape no devolvió el foco del lateral al editor");
   return {wide,small:[],restored:[],interaction:{
    source:"native-pty-sgr",x:before.mouseX,y:before.mouseY,
    folded:true,focused:true,focusRestored:true
   }};
  }
  if(!resize)return {wide,small:[],restored:[]};
  stage="139x40";terminal.resize(139,40);
  await until(()=>samples(read(records),139).length>0||exited,label+": no hubo dibujo a 139");
  assert.equal(exited,false,label+": Pi salió al redimensionar");
  const small=samples(read(records),139);
  const narrowMatrix=[];
  if(label==="asen"||label==="asen-retry"){
   for(const [columns,rows] of [[140,40],[120,40],[80,40],[50,40],[40,40],[24,12]]){
    stage=columns+"x"+rows;
    const fromIndex=read(records).length;
    terminal.resize(columns,rows);
    // Windows puede informar el ancho antes de actualizar terminal.rows.
    // Exigir una medición NUEVA tras resize; las filas son evidencia adicional.
    await until(()=>read(records).slice(fromIndex).some(row=>
     row.kind==="render"&&row.columns===columns&&
     (!Number.isSafeInteger(row.rows)||row.rows===rows))||exited,
     label+": Pi no produjo nueva geometría en "+stage,12000);
    assert.equal(exited,false,label+": Pi terminó al cambiar a "+stage);
    const actual=read(records).slice(fromIndex).filter(row=>
     row.kind==="render"&&row.columns===columns&&
     (!Number.isSafeInteger(row.rows)||row.rows===rows)).at(-1);
    assert.ok(actual,label+": medición ausente en "+stage);
    if(columns===140)assert.equal(actual.rail,50,"El lateral debe existir a exactamente 140 columnas");
    else assert.notEqual(actual.rail,50,"Lateral derecho no permitido bajo 140 columnas");
    assert.ok(Number.isSafeInteger(actual.width)&&actual.width>0&&actual.width<=columns,
     "Anchura nativa de conversación inválida a "+stage);
    // Si el host declara filas fiables también deben coincidir; null no se inventa.
    if(Number.isSafeInteger(actual.rows))
     assert.equal(actual.rows,rows,"Las filas Pi no reflejan el nuevo tamaño "+stage);
    narrowMatrix.push({columns,rows,observedRows:actual.rows??null,
     width:actual.width,type:actual.type,rail:actual.rail,source:"fresh-pi-render"});
    report.narrowMatrix=[...narrowMatrix];
   }
  }
  const before=read(records).filter(row=>row.kind==="render"&&row.columns===180).length;
  stage="180x40 restauración";terminal.resize(180,40);
  await until(()=>read(records).filter(row=>row.kind==="render"&&row.columns===180).length>before||exited,label+": no redibujó al volver a 180");
  assert.equal(exited,false,label+": Pi salió al ampliar");
  return {wide,small,restored:samples(read(records),180),chromeRender,narrowMatrix};
 }catch(error){
  const recent=read(records).filter(row=>row.kind==="render").slice(-8)
   .map(row=>({columns:row.columns,rows:row.rows,width:row.width,type:row.type,rail:row.rail}));
  report.lastFailure={session:label,stage,message:String(error),recent,exited};
  throw Error(label+": fase "+stage+": "+String(error)+"; mediciones "+JSON.stringify(recent));
 }
 finally{
  writeFileSync(stop,"ok");
  for(let i=0;i<40&&!exited;i++)await sleep(100);
  if(!exited){
   terminal.kill();
   await until(()=>exited,label+": cierre del proceso Pi no confirmado",5000);
  }
  report.closedSessions.push(label);
 }
}
try{
 const baseline=await run("baseline",false,false);
 let actual;
 try{actual=await run("asen",true,true);}
 catch(error){
  // Único reintento permitido: arranque TUI de solo lectura en Windows,
  // sin modelo, sin Writer, con la sesión anterior ya cerrada.
  const failure=report.lastFailure;
  if(process.platform!=="win32"||failure?.session!=="asen"||
   failure.stage!=="inicio"||failure.exited!==false||
   !report.closedSessions.includes("asen"))throw error;
  report.startupRecovery={kind:"native-windows-no-ready",attempts:2,
   failedSessionClosed:true,modelCalls:0};
  report.lastFailure=null;
  actual=await run("asen-retry",true,true);
 }
 const base=baseline.wide.at(-1),wide=actual.wide.at(-1),narrow=actual.small.at(-1),restored=actual.restored.at(-1);
 assert.ok(base&&wide&&narrow&&restored,"Pi debe emitir lecturas de geometría");
 Object.assign(report,{baselineWidth:base.width,withRailWidth:wide.width,realReservation:base.width-wide.width,
  wideTree:{mode:wide.mode,type:wide.type,gap:wide.gap,count:wide.count,rail:wide.rail,rootHookName:wide.rootHookName,hasRootHook:wide.hasRootHook,themeName:wide.themeName,themeConstructor:wide.themeConstructor},
  narrowTree:{mode:narrow.mode,type:narrow.type,gap:narrow.gap,count:narrow.count,rail:narrow.rail,rootHookName:narrow.rootHookName,hasRootHook:narrow.hasRootHook},
  restored:restored.type==="hstack"&&restored.rail===50,narrowMatrix:actual.narrowMatrix});
 assert.equal(wide.type,"hstack","El host debe dividir el ancho");
 assert.equal(wide.gap,3);assert.equal(wide.count,2);assert.equal(wide.rail,50);
 assert.ok(base.width-wide.width>=51&&base.width-wide.width<=55,"Debe reservar cerca de 53 columnas reales");
 assert.notEqual(narrow.rail,50,"El panel fijo debe desaparecer bajo 140 columnas");
 assert.equal(report.restored,true,"El lateral debe reaparecer al ampliar");
 const interaction=await run("asen-interaction",true,false,true);
 assert.equal(interaction.interaction?.source,"native-pty-sgr");
 assert.equal(interaction.interaction?.focused,true);
 assert.equal(interaction.interaction?.focusRestored,true);
 report.interaction=interaction.interaction;
 // Preferencia real guardada en el HOME aislado; prueba Pi 1.2 nativo, no maqueta.
 const prefDir=join(home,".asen");mkdirSync(prefDir,{recursive:true,mode:0o700});
 writeFileSync(join(prefDir,"t11-layout.json"),JSON.stringify({schema:1,position:"bottom",density:"compact"})+"\n",{mode:0o600});
 writeFileSync(join(prefDir,"t11-chrome.json"),
  JSON.stringify({schema:1,header:"below-input",surface:"tinted"})+"\n",{mode:0o600});
 const bottom=await run("asen-bottom",true,true);
 assert.equal(bottom.chromeRender?.source,"native-pty-output");
 assert.equal(bottom.chromeRender?.brandObserved,true,"El host real no dibujó la marca de ASEN");
 assert.equal(bottom.chromeRender?.piVersionObserved,true,"El host real no dibujó la versión Pi");
 report.chromeRender=bottom.chromeRender;
 const bottomWide=bottom.wide.at(-1),bottomSmall=bottom.small.at(-1),bottomBack=bottom.restored.at(-1);
 assert.ok(bottomWide&&bottomSmall&&bottomBack,"Pi bottom debe emitir geometría nativa");
 Object.assign(report,{
  bottomTree:{mode:bottomWide.mode,type:bottomWide.type,gap:bottomWide.gap,count:bottomWide.count,rail:bottomWide.rail,width:bottomWide.width},
  bottomAt139:{type:bottomSmall.type,rail:bottomSmall.rail,width:bottomSmall.width},
  bottomRestored:bottomBack.type==="vstack"&&bottomBack.rail===8,
 });
 assert.equal(bottomWide.type,"vstack","El host nativo debe reservar filas para bottom");
 assert.equal(bottomWide.gap,1);assert.equal(bottomWide.count,2);assert.equal(bottomWide.rail,8);
 assert.equal(bottomWide.width,base.width,"El panel inferior no debe quitar columnas al editor");
 assert.equal(bottomSmall.type,"vstack","El panel inferior debe seguir disponible bajo 140 columnas");
 assert.equal(bottomSmall.rail,8);
 assert.equal(report.bottomRestored,true,"El panel inferior debe restaurarse tras redimensionar");
 assert.deepEqual(report.closedSessions,["baseline","asen","asen-interaction","asen-bottom"],"Todas las sesiones Pi deben terminar realmente");
 report.result="PASS_REAL_PI_RAIL";
}finally{
 const file=process.env.ASEN_T11_NATIVE_RAIL_REPORT;
 if(file){mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(report,null,2)+"\n",{mode:0o600});}
 try{rmSync(temp,{recursive:true,force:true,maxRetries:8,retryDelay:100});}catch{}
}
assert.equal(report.result,"PASS_REAL_PI_RAIL");
console.log(JSON.stringify(report));
// Tras comprobar onExit de ambas sesiones, liberar manejadores nativos de node-pty.
process.exit(0);
