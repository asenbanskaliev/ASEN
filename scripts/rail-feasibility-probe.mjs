#!/usr/bin/env node
// UFC-M4-01: rail feasibility evidence — an EXECUTED actual-host experiment answering the
// UNKNOWN root-split row of odd/evidence/ui-host-public-capability-matrix.md, following its
// decision rules: no private containers, no invented setRail, an occluding overlay is never a
// reserved rail, and position measurement alone never passes admission. Public enumeration only
// (setWidget, custom, overlay handles); no production UI change; a GAP/UNKNOWN verdict is an
// honest result and the receipt is the deliverable. No model, no network, no provider calls.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {requestGracefulPtyExit} from "./t10-pty-shutdown.mjs";

export const PROBE_RAIL_SCHEMA="asen-rail-feasibility-probe/v1";
const RAIL_VERDICTS=["VERIFIED","GAP","UNKNOWN"];
const REFLOW_CLASSES=["REFLOW_OBSERVED","OCCLUSION_OBSERVED","INDETERMINATE"];
const SHA=/^[a-f0-9]{40}$/u;

const gate=(value)=>value===true?"VERIFIED":value===false?"GAP":"UNKNOWN";

/**
 * Pure classification of host observations into the admission matrix verdicts.
 * Observations are the measurements a harness made; null/undefined means "not parseable",
 * which always demotes to UNKNOWN and can never be upgraded by narrative.
 */
export function classifyRailObservations({candidateSha,host,hostVersion,platform,measuredWidth,resizeWidth,observations}){
 const o=observations;
 assert.ok(o&&o.apiPresence&&o.widgetPersistence&&o.inputPreservation&&o.resize&&o.disposal&&o.reflow,
  "rail probe requires the full observation record; partial input is a harness defect");
 const overlayPathAvailable=o.apiPresence.custom===true||o.apiPresence.showOverlayOnFactoryTui===true;
 const capabilities={};
 capabilities["additive-widget"]=!o.apiPresence.setWidget?"GAP":
  (o.widgetPersistence.presentBefore===true&&o.widgetPersistence.presentAfterActivity===true)?"VERIFIED":
   (o.widgetPersistence.presentBefore===null||o.widgetPersistence.presentAfterActivity===null||
    o.widgetPersistence.presentBefore===undefined||o.widgetPersistence.presentAfterActivity===undefined)?"UNKNOWN":"GAP";
 const typed=o.inputPreservation.typedTokenVisible;
 capabilities["overlay-noncapturing"]=!overlayPathAvailable?"GAP":
  (typed===true&&o.inputPreservation.overlayCapturedInput===false)?"VERIFIED":
   (typed===null||typed===undefined)?"UNKNOWN":"GAP";
 capabilities["input-preservation-under-overlay"]=typed===true?"VERIFIED":typed===false?"GAP":"UNKNOWN";
 capabilities["resize-behavior"]=(o.resize.reRendered===true&&o.resize.overlayAdapted===true)?"VERIFIED":
  o.resize.reRendered===false?"GAP":"UNKNOWN";
 capabilities["disposal-cleanliness"]=(o.disposal.overlayGone===true&&o.disposal.widgetGone===true)?"VERIFIED":
  (o.disposal.overlayGone===false||o.disposal.widgetGone===false)?"GAP":"UNKNOWN";
 const {baselineMaxWidth,overlayMaxWidth,overlayWidth}=o.reflow;
 const numeric=[baselineMaxWidth,overlayMaxWidth,overlayWidth].every(v=>typeof v==="number");
 let reflow="INDETERMINATE";
 if(numeric&&overlayWidth>0){
  const delta=baselineMaxWidth-overlayMaxWidth;
  reflow=delta>=overlayWidth-4?"REFLOW_OBSERVED":delta<=4?"OCCLUSION_OBSERVED":"INDETERMINATE";
 }
 capabilities["transcript-reflow"]=reflow;
 capabilities["persistent-root-split-rail"]=
  (!overlayPathAvailable||reflow==="OCCLUSION_OBSERVED")?"GAP":
   (reflow==="REFLOW_OBSERVED"&&["additive-widget","input-preservation-under-overlay","resize-behavior","disposal-cleanliness"]
    .every(key=>capabilities[key]==="VERIFIED"))?"VERIFIED":"UNKNOWN";
 const report={schema:PROBE_RAIL_SCHEMA,candidateSha,host,hostVersion,platform,
  measuredWidth,resizeWidth,observations,capabilities,
  selfTest:{positionOnlyClaimRejected:false,missingReflowClaimRejected:false},
  limitation:"This receipt measures one executed Pi host session at the recorded width. VERIFIED applies only where the listed public-API observation succeeded; UNKNOWN records a measurement that was not parseable, GAP records a demonstrable absence. No verdict here certifies the persistent rail without reflow evidence, and position bounds alone never pass admission.",
  modelCalls:0,networkCalls:0,providerCalls:0};
 validateRailProbeReport(report,{selfTestRequired:false});
 // Negative-path self-test on the real bytes of this receipt: strip evidence under a claimed
 // VERIFIED; the validator must reject both the position-only and the gate-free mutation.
 report.selfTest.positionOnlyClaimRejected=rejectsValidation(report,c=>({...c,
  capabilities:{...c.capabilities,"persistent-root-split-rail":"VERIFIED"},
  observations:{...c.observations,reflow:{baselineMaxWidth:null,overlayMaxWidth:null,overlayWidth:40,delta:null}}}));
 report.selfTest.missingReflowClaimRejected=rejectsValidation(report,c=>({...c,
  capabilities:{...c.capabilities,"persistent-root-split-rail":"VERIFIED"},
  observations:{...c.observations,resize:{reRendered:false,overlayAdapted:null}}}));
 validateRailProbeReport(report);
 return Object.freeze(report);
}

function rejectsValidation(report,mutate){
 try{validateRailProbeReport(mutate(report),{selfTestRequired:false});return false;}
 catch{return true;}
}

export function validateRailProbeReport(report,{selfTestRequired=true}={}){
 assert.equal(report?.schema,PROBE_RAIL_SCHEMA);
 assert.match(report?.candidateSha??"",SHA,"the rail receipt must pin the exact candidate SHA");
 assert.equal(report?.host,"@earendil-works/pi-coding-agent");
 assert.match(report?.hostVersion??"",/^[0-9]+\.[0-9]+\.[0-9]+$/u);
 assert.ok(Number.isSafeInteger(report?.measuredWidth)&&report.measuredWidth>=140,
  "rail admission measurements must run at ≥140 columns (matrix rule 5)");
 assert.ok(Number.isSafeInteger(report?.resizeWidth)&&report.resizeWidth>=40);
 for(const key of ["additive-widget","overlay-noncapturing","input-preservation-under-overlay","resize-behavior","disposal-cleanliness","persistent-root-split-rail"])
  assert.ok(RAIL_VERDICTS.includes(report.capabilities?.[key]),`capability ${key} must be VERIFIED|GAP|UNKNOWN`);
 assert.ok(REFLOW_CLASSES.includes(report.capabilities?.["transcript-reflow"]),"transcript-reflow has its own observation classes");
 if(report.capabilities["persistent-root-split-rail"]==="VERIFIED"){
  assert.equal(report.capabilities["transcript-reflow"],"REFLOW_OBSERVED",
   "root-split VERIFIED requires reflow evidence (position-only never passes admission)");
  const r=report.observations?.reflow;
  assert.ok([r?.baselineMaxWidth,r?.overlayMaxWidth,r?.overlayWidth].every(v=>typeof v==="number"),
   "root-split VERIFIED requires reflow evidence (position-only never passes admission)");
  const o=report.observations;
  assert.ok(o.widgetPersistence?.presentBefore===true&&o.widgetPersistence?.presentAfterActivity===true
   &&o.resize?.reRendered===true&&o.resize?.overlayAdapted===true
   &&o.disposal?.overlayGone===true&&o.disposal?.widgetGone===true
   &&o.inputPreservation?.typedTokenVisible===true,
   "root-split VERIFIED requires every raw persistence/resize/disposal/input gate, not only verdict labels");
 }
 assert.equal(report.modelCalls,0);assert.equal(report.networkCalls,0);assert.equal(report.providerCalls,0);
 assert.ok(typeof report.limitation==="string"&&report.limitation.length>0,"the limitation field is mandatory");
 if(selfTestRequired){
  assert.equal(report.selfTest?.positionOnlyClaimRejected,true,"the self-test must have rejected a position-only pass");
  assert.equal(report.selfTest?.missingReflowClaimRejected,true,"the self-test must have rejected a reflow-free VERIFIED claim");
 }
 return true;
}

// ---------------------------------------------------------------------------
// Executed host mode. Mirrors the t10 harness discipline: disposable home and
// project, provider keys stripped, model calls forbidden at the event seam.
// ---------------------------------------------------------------------------
const repo=dirname(dirname(fileURLToPath(import.meta.url)));
const strip=value=>value
 .replace(/\u001b\][^\u0007]*\u0007/gu,"")
 .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/gu,"")
 .replace(/\u001b[@-Z\\-_]/gu,"");
const visibleWidth=value=>{
 const segmenter=typeof Intl.Segmenter==="function"?new Intl.Segmenter("en",{granularity:"grapheme"}):undefined;
 const graphemes=segmenter?[...segmenter.segment(value)].map(item=>item.segment):Array.from(value);
 return graphemes.reduce((sum,item)=>sum+(/\p{Extended_Pictographic}/u.test(item)||/\p{Emoji_Presentation}/u.test(item)?2:1),0);
};
const sleep=ms=>new Promise(done=>setTimeout(done,ms));

export function probeExtensionSource(dir){
 const stage=name=>JSON.stringify(join(dir,name));
 return [
  'import {existsSync,writeFileSync} from "node:fs";',
  'const STAGE='+JSON.stringify(dir)+";",
  "const flag=(name)=>existsSync(STAGE+\"/\"+name);",
  'const wait=(name,ms)=>new Promise(res=>{const to=setTimeout(()=>res(false),ms);const iv=setInterval(()=>{if(flag(name)){clearInterval(iv);clearTimeout(to);res(true);}},100);});',
  'const long=(tag)=>"ASENPROBE:"+tag+":"+"abcdefghijkl".repeat(13);',
  "export default function(pi){",
  ' let trustAsked=false;',
  ' pi.on("project_trust",()=>{trustAsked=true;return {trusted:"yes",remember:false};});',
  ' pi.on("before_agent_start",()=>{throw Error("rail probe forbids model calls");});',
  ' pi.on("session_start",async(_event,ctx)=>{',
  '  const api={setWidget:typeof ctx.ui?.setWidget==="function",custom:typeof ctx.ui?.custom==="function",setStatus:typeof ctx.ui?.setStatus==="function"};',
  "  let tuiKeys=null,doneRef=null,overlayShown=false;",
  '  ctx.ui.notify(long("base"),"info");',
  '  if(api.setWidget)ctx.ui.setWidget("probe:rail",["PROBEWIDGET-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","PROBEWIDGET-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"],{placement:"aboveEditor"});',
  '  ctx.ui.notify(long("act1"),"info");',
  '  writeFileSync(STAGE+"/phase-base","ok");writeFileSync(STAGE+"/ready","ok");',
  '  if(await wait("stage-open",60000)&&api.custom){',
  '   ctx.ui.custom((tui,_theme,_bindings,done)=>{',
  "    tuiKeys=Object.keys(tui).slice(0,120);",
  "    doneRef=()=>done(undefined);",
  '    const component={render:(width)=>Array.from({length:10},(_v,i)=>("PROBE-OVERLAY-"+i+" ").repeat(8).slice(0,Math.max(1,width))),handleInput:()=>{},invalidate:()=>{}};',
  "    return component;",
  '   },{overlay:true,overlayOptions:{width:40,anchor:"right-center",nonCapturing:true,visible:(w)=>w>=100}}).then(()=>{overlayShown=false;}).catch(()=>{});',
  '   ctx.ui.notify(long("over1"),"info");writeFileSync(STAGE+"/phase-overlay","ok");',
  '  } else writeFileSync(STAGE+"/phase-overlay","skipped");',
  '  if(await wait("stage-resize",60000)){ctx.ui.notify(long("act2"),"info");writeFileSync(STAGE+"/phase-resized","ok");}',
  '  if(await wait("stage-close",60000)){',
  "   if(doneRef)doneRef();",
  '   if(api.setWidget)ctx.ui.setWidget("probe:rail",undefined,{placement:"aboveEditor"});',
  '   ctx.ui.notify(long("closed"),"info");',
  '   writeFileSync(STAGE+"/observations.json",JSON.stringify({api,showOverlayOnFactoryTui:tuiKeys?tuiKeys.includes("showOverlay"):null,overlayOpened:tuiKeys!==null,trustAsked}));',
  '   writeFileSync(STAGE+"/phase-closed","ok");',
  "  }",
  '  const poll=setInterval(()=>{if(flag("shutdown")){clearInterval(poll);ctx.shutdown();}},100);',
  " });",
  "}",
 ].join("\n")+"\n";
}

async function waitForStage(dir,name,timeoutMs){
 for(let attempt=0;attempt<timeoutMs/250&&!existsSync(join(dir,name));attempt++)await sleep(250);
 return existsSync(join(dir,name));
}

async function main(){
 const expected=process.env.ASEN_EXPECTED_SHA;
 const head=execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 if(expected!==undefined)assert.equal(expected,head,"rail probe must run against the exact candidate");
 assert.match(head,SHA);
 const metadata=JSON.parse(readFileSync(join(repo,"node_modules","@earendil-works","pi-coding-agent","package.json"),"utf8"));
 const temporary=realpathSync(mkdtempSync(join(tmpdir(),"asen-rail-probe-")));
 const project=join(temporary,"project"),home=join(temporary,"home");
 mkdirSync(project);mkdirSync(home,{mode:0o700});
 const git=(...args)=>execFileSync("git",["-C",project,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","Rail probe");git("config","user.email","rail@example.invalid");
 writeFileSync(join(project,"tracked.txt"),"baseline\n");git("add","tracked.txt");git("commit","-qm","baseline");
 const probe=join(temporary,"probe.ts");
 writeFileSync(probe,probeExtensionSource(temporary));
 const env={...process.env,HOME:home,USERPROFILE:home,PI_CODING_AGENT_DIR:join(home,"agent"),
  ASEN_NO_SKILL_REGISTRY:"1",PI_TELEMETRY:"0",TERM:"xterm-256color",NO_COLOR:"1",FORCE_COLOR:"0",COLORTERM:""};
 for(const key of Object.keys(env))if(key.startsWith("GIT_")||/^(OPENAI|ANTHROPIC|GROQ|NVIDIA|OPENROUTER|GOOGLE|GEMINI).*(_KEY|_TOKEN)$/u.test(key))delete env[key];
 const binary=join(repo,"node_modules","@earendil-works","pi-coding-agent",typeof metadata.bin==="string"?metadata.bin:metadata.bin.pi);
 const require=createRequire(join(repo,"package.json"));
 const {spawn}=require("node-pty");
 assert.ok(spawn,"node-pty must be available to drive the real host");
 const measuredWidth=140,resizeWidth=120;
 const child=spawn(process.execPath,[binary,"--no-extensions","--extension",probe,"--no-skills","--no-builtin-tools","--provider","openai","--model","gpt-4o"],
  {cwd:project,env,cols:measuredWidth,rows:40,name:"xterm-256color"});
 let log="",exit=null;
 child.onData(chunk=>{log=(log+chunk).slice(-400000);});
 child.onExit(result=>{exit=result;});
 const sectionFrom=(marker)=>{const lines=strip(log).split(/[\r\n\u0085\u2028\u2029]+/u);const start=lines.findIndex(line=>line.includes(marker));return start<0?null:lines.slice(start);};
 const maxWidthOf=(marker)=>{const lines=sectionFrom(marker);if(!lines)return null;const rows=lines.filter(line=>line.includes("ASENPROBE"));return rows.length?Math.max(...rows.map(row=>visibleWidth(row.trimEnd()))):null;};
 let cleanExit=false;
 const outcome={};
 try{
  assert.ok(await waitForStage(temporary,"phase-base",120000),"the real Pi host must reach session_start");
  await sleep(2500);
  outcome.baselineMaxWidth=maxWidthOf("ASENPROBE:base");
  const allLines=sectionFrom("ASENPROBE:base")??[];
  const actIdx=allLines.findIndex(line=>line.includes("ASENPROBE:act1"));
  const widgetIdxs=allLines.reduce((acc,line,i)=>{if(line.includes("PROBEWIDGET"))acc.push(i);return acc;},[]);
  outcome.widgetBefore=widgetIdxs.length>0||strip(log).includes("PROBEWIDGET");
  outcome.widgetAfterActivity=actIdx>=0?widgetIdxs.some(index=>index>actIdx):null;
  writeFileSync(join(temporary,"stage-open"),"go");
  const opened=await waitForStage(temporary,"phase-overlay",60000);
  await sleep(2000);
  const token="probe-typed-"+Date.now().toString(36);
  child.write(token);
  await sleep(2000);
  outcome.typedDuringOverlay=strip(log).includes(token);
  outcome.overlayVisible=strip(log).includes("PROBE-OVERLAY-0");
  outcome.overlayMaxWidth=opened?maxWidthOf("ASENPROBE:over1"):null;
  child.resize(resizeWidth,40);
  writeFileSync(join(temporary,"stage-resize"),"go");
  outcome.resizedNotify=await waitForStage(temporary,"phase-resized",60000);
  await sleep(2000);
  const act2=sectionFrom("ASENPROBE:act2");
  outcome.reRenderedAfterResize=act2?act2.some(line=>line.includes("act2")&&visibleWidth(line.trimEnd())<=resizeWidth):null;
  outcome.overlayAdaptedAfterResize=strip(log).includes("PROBE-OVERLAY-0");
  child.resize(measuredWidth,40);
  writeFileSync(join(temporary,"stage-close"),"go");
  const closed=await waitForStage(temporary,"phase-closed",60000);
  await sleep(2000);
  const after=sectionFrom("ASENPROBE:closed");
  outcome.widgetGoneAfterDispose=after===null?null:!after.some(line=>line.includes("PROBEWIDGET"));
  outcome.overlayGoneAfterDispose=after===null?null:!after.some(line=>line.includes("PROBE-OVERLAY-"));
  child.write(token+"-after");
  await sleep(2000);
  outcome.typedAfterDispose=strip(log).includes(token+"-after");
  assert.ok(closed&&exit===null,"the host session must stay alive through the experiment");
  await requestGracefulPtyExit({child,shutdownFile:join(temporary,"shutdown"),timeoutMs:15000});
  cleanExit=true;
 }finally{
  if(!cleanExit&&!exit)try{child.kill();}catch{/* Failed run only; never marks PASS. */}
 }
 const observationsPath=join(temporary,"observations.json");
 const observations=readFileSync(observationsPath,"utf8");
 rmSync(temporary,{recursive:true,force:true,maxRetries:8,retryDelay:100});
 const api=JSON.parse(observations);
 const report=classifyRailObservations({  candidateSha:head,host:"@earendil-works/pi-coding-agent",hostVersion:metadata.version,platform:process.platform,
  measuredWidth,resizeWidth,
  observations:{
   apiPresence:{setWidget:api.api.setWidget,custom:api.api.custom,setStatus:api.api.setStatus,
    showOverlayOnFactoryTui:api.showOverlayOnFactoryTui},
   widgetPersistence:{presentBefore:outcome.widgetBefore??null,presentAfterActivity:outcome.widgetAfterActivity??null},   inputPreservation:{typedTokenVisible:outcome.typedDuringOverlay,
    overlayCapturedInput:outcome.typedDuringOverlay===false&&outcome.typedAfterDispose===true?true:
     outcome.typedDuringOverlay===true||outcome.typedAfterDispose===undefined?false:null},
   resize:{reRendered:outcome.reRenderedAfterResize??null,overlayAdapted:outcome.overlayAdaptedAfterResize??null},
   disposal:{overlayGone:outcome.overlayGoneAfterDispose??null,widgetGone:outcome.widgetGoneAfterDispose??null},
   reflow:{baselineMaxWidth:outcome.baselineMaxWidth,overlayMaxWidth:outcome.overlayMaxWidth,
    overlayWidth:outcome.overlayVisible?40:null,delta:outcome.baselineMaxWidth!==null&&outcome.overlayMaxWidth!==null?outcome.baselineMaxWidth-outcome.overlayMaxWidth:null},
   projectTrust:{asked:api.trustAsked===true,resolvedViaPublicEvent:api.trustAsked===true},
  },
 });
 console.log(JSON.stringify(report,null,"\t"));
 const outIndex=process.argv.indexOf("--out");
 if(outIndex>0&&process.argv[outIndex+1])writeFileSync(resolve(process.argv[outIndex+1]),JSON.stringify(report,null,"\t")+"\n");
 process.exit(0);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{console.error("RAIL_PROBE_REJECTED: "+(error instanceof Error?error.message:"unknown"));process.exitCode=1;});
}
