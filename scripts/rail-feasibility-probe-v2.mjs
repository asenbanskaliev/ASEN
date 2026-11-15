#!/usr/bin/env node
// UFC-M4-03-prep (W5-A): rail feasibility probe v2 — an EXECUTED actual-host experiment that
// measures INSIDE the effective host render, closing the two unknowns probe v1 (ef4507f35a99)
// left open: v1 parsed PTY output lines and never captured a render-path width, so its receipt
// pins resize-behavior as a non-VERIFIED and baselineMaxWidth as null. v2 instruments the
// public mount factories (setHeader document slot, setWidget component factory, custom overlay
// handle) and records the exact width the host passes INTO render(), plus ctx.ui.getEditorText(),
// TUI.getFocusedComponent() and OverlayHandle.getBounds(). The four owner classes are enforced:
// RESERVED COLUMN / OCCLUSION / ADDITIVE NO RESERVATION / INCONCLUSIVE — an overlay is never a
// rail, and position data alone never passes admission. Public surface only; no production UI
// change; a GAP/UNKNOWN verdict is an honest result and the receipt is the deliverable.
// No model, no network, no provider calls.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {appendFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {requestGracefulPtyExit} from "./t10-pty-shutdown.mjs";

export const PROBE_RAIL2_SCHEMA="asen-rail-feasibility-probe/v2";
const RAIL2_VERDICTS=["VERIFIED","GAP","UNKNOWN"];
const REFLOW2_CLASSES=["REFLOW_OBSERVED","NO_REFLOW_OBSERVED","INDETERMINATE"];
const OCCLUSION_CLASSES=["OCCLUSION_OBSERVED","NOT_OBSERVED","UNKNOWN"];
const RAIL2_CANDIDATE_CLASSES=["RESERVED COLUMN","OCCLUSION","ADDITIVE NO RESERVATION","INCONCLUSIVE"];
const SHA=/^[a-f0-9]{40}$/u;
const num=(v)=>typeof v==="number"&&Number.isSafeInteger(v);
const tri=(v)=>v===true;
const fas=(v)=>v===false;
const GATES=["additive-widget","input-preservation","focus-stability","resize-re-render","disposal-cleanliness"];

/**
 * Pure classification of render-path observations into the admission matrix verdicts.
 * Observations are measurements of the width the host passes INTO render() of the components
 * it mounts; null means "not measured" and always demotes — narrative never upgrades.
 */
export function classifyRail2Observations({candidateSha,host,hostVersion,platform,measuredWidth,resizeWidth,runRole="primary",observations}){
	const o=observations;
	assert.ok(o&&o.apiPresence&&o.widgetRender&&o.docWidth&&o.railWidth&&o.overlay&&o.inputPreservation&&o.focus&&o.disposal,
		"rail probe v2 requires the full observation record; partial input is a harness defect");
	const cap={};
	const wr=o.widgetRender;
	const mounted=[wr.framesAfterMount,wr.framesTyped,wr.framesOverlay,wr.framesResized];
	cap["additive-widget"]=o.apiPresence.setWidget!==true?"GAP":
		(!num(wr.framesBeforeMount)||mounted.some((v)=>!num(v)))?"UNKNOWN":
			(wr.framesBeforeMount===0&&mounted.every((v)=>v>0))?"VERIFIED":"GAP";
	const dw=o.docWidth;
	let reflow="INDETERMINATE";
	if(num(dw.baselineMin)&&num(dw.baselineMax)&&num(dw.withRailMin)&&num(dw.withRailMax)
		&&dw.baselineMin===dw.baselineMax&&dw.withRailMin===dw.withRailMax){
		reflow=dw.baselineMin-dw.withRailMax>=1?"REFLOW_OBSERVED":"NO_REFLOW_OBSERVED";
	}
	cap["transcript-reflow"]=reflow;
	const shrinking=num(measuredWidth)&&num(resizeWidth)&&resizeWidth<measuredWidth;
	cap["resize-re-render"]=!(num(dw.afterResizeMin)&&num(dw.afterResizeMax)&&num(dw.baselineMin)&&num(dw.baselineMax))?"UNKNOWN":
		shrinking?(dw.afterResizeMax<=resizeWidth&&dw.afterResizeMax<dw.baselineMin?"VERIFIED"
			:dw.afterResizeMin>=dw.baselineMin?"GAP":"UNKNOWN")
			:(dw.afterResizeMin>=resizeWidth&&dw.afterResizeMin>dw.baselineMax?"VERIFIED"
				:dw.afterResizeMax<=dw.baselineMax?"GAP":"UNKNOWN");
	const ip=[o.inputPreservation.afterType,o.inputPreservation.afterOverlay,o.inputPreservation.afterResize,o.inputPreservation.afterDispose];
	cap["input-preservation"]=ip.every(tri)?"VERIFIED":ip.some(fas)?"GAP":"UNKNOWN";
	const f=[o.focus.base,o.focus.typed,o.focus.overlay,o.focus.resized];
	cap["focus-stability"]=f.every((v)=>typeof v==="string"&&v.length>0)
		?(new Set(f).size===1?"VERIFIED":"GAP"):"UNKNOWN";
	const bOpen=o.overlay.boundsAfterOpen, bResized=o.overlay.boundsAfterResize;
	const boundsSeen=(bOpen&&num(bOpen.width)&&bOpen.width>0)||(bResized&&num(bResized.width)&&bResized.width>0);
	const unchanged=num(dw.baselineMax)&&num(dw.withRailMax)&&dw.withRailMax===dw.baselineMax;
	cap["overlay-occlusion"]=o.apiPresence.custom!==true?"NOT_OBSERVED":
		!boundsSeen?"UNKNOWN":unchanged?"OCCLUSION_OBSERVED":reflow==="REFLOW_OBSERVED"?"NOT_OBSERVED":"UNKNOWN";
	const d=[o.disposal.railFramesStopped,o.disposal.overlayGone,o.disposal.editorTextKept];
	cap["disposal-cleanliness"]=d.every(tri)?"VERIFIED":d.some(fas)?"GAP":"UNKNOWN";
	const railNumeric=num(o.railWidth.min)&&num(o.railWidth.max)&&o.railWidth.min>0;
	cap["reserved-column"]=reflow==="REFLOW_OBSERVED"&&railNumeric&&GATES.every((g)=>cap[g]==="VERIFIED")?"VERIFIED":
		(reflow==="NO_REFLOW_OBSERVED"||o.apiPresence.setWidget===false||cap["additive-widget"]==="GAP")?"GAP":"UNKNOWN";
	// Owner W5 §2 four-way class. Priority: a proven reserved column; else a persistent widget
	// that demonstrably reserves nothing; else occlusion; else nothing was measurable. An
	// overlay NEVER becomes the rail class.
	cap["rail-candidate-class"]=cap["reserved-column"]==="VERIFIED"?"RESERVED COLUMN":
		(cap["overlay-occlusion"]==="OCCLUSION_OBSERVED"&&cap["additive-widget"]!=="VERIFIED")?"OCCLUSION":
			(cap["additive-widget"]==="VERIFIED"&&(reflow==="NO_REFLOW_OBSERVED"))?"ADDITIVE NO RESERVATION":
				"INCONCLUSIVE";
	const report={schema:PROBE_RAIL2_SCHEMA,candidateSha,host,hostVersion,platform,
		measuredWidth,resizeWidth,runRole,observations,capabilities:cap,
		selfTest:{positionOnlyClaimRejected:false,occlusionAsRailClaimRejected:false},
		limitation:"This receipt measures one executed Pi host session through render-path widths the host itself passed to mounted components (setHeader document slot, setWidget rail factory, custom overlay handle, getEditorText, getFocusedComponent, OverlayHandle.getBounds). It contains no PTY line-width inference. RESERVED COLUMN requires a measured sustained narrowing of the conversation render width; OCCLUSION records an overlay that covers an unshrunk transcript and is never a rail; ADDITIVE NO RESERVATION records a persistent widget that changes no width; INCONCLUSIVE records unmeasurable evidence. VERIFIED applies only where the listed public-API observation succeeded.",
		modelCalls:0,networkCalls:0,providerCalls:0};
	validateRail2Report(report,{selfTestRequired:false});
	// Negative-path self-test on the real bytes of this receipt.
	report.selfTest.positionOnlyClaimRejected=rejectsValidation(report,(c)=>({...c,
		capabilities:{...c.capabilities,"rail-candidate-class":"RESERVED COLUMN","reserved-column":"VERIFIED","transcript-reflow":"REFLOW_OBSERVED"},
		observations:{...c.observations,docWidth:{baselineMin:null,baselineMax:null,withRailMin:null,withRailMax:null,afterResizeMin:c.observations.docWidth?.afterResizeMin??null,afterResizeMax:c.observations.docWidth?.afterResizeMax??null}}}));
	report.selfTest.occlusionAsRailClaimRejected=rejectsValidation(report,(c)=>({...c,
		capabilities:{...c.capabilities,"rail-candidate-class":"RESERVED COLUMN","reserved-column":"VERIFIED","transcript-reflow":"REFLOW_OBSERVED"},
		observations:{...c.observations,docWidth:{...c.observations.docWidth,
			withRailMin:c.observations.docWidth.baselineMin,withRailMax:c.observations.docWidth.baselineMax}}}));
	validateRail2Report(report);
	return Object.freeze(report);
}

function rejectsValidation(report,mutate){
	try{validateRail2Report(mutate(report),{selfTestRequired:false});return false;}
	catch{return true;}
}

export function validateRail2Report(report,{selfTestRequired=true}={}){
	assert.equal(report?.schema,PROBE_RAIL2_SCHEMA);
	assert.match(report?.candidateSha??"",SHA,"the rail v2 receipt must pin the exact candidate SHA");
	assert.equal(report?.host,"@earendil-works/pi-coding-agent");
	assert.match(report?.hostVersion??"",/^[0-9]+\.[0-9]+\.[0-9]+$/u);
	assert.ok(report?.runRole==="primary"||report?.runRole==="supplementary","runRole must be primary or supplementary");
	assert.ok(Number.isSafeInteger(report?.measuredWidth)&&Number.isSafeInteger(report?.resizeWidth)&&report.resizeWidth>=40);
	if(report.runRole==="primary")assert.ok(report.measuredWidth>=140,
		"rail admission measurements must run at ≥140 columns (matrix rule); use runRole supplementary below that");
	for(const key of ["additive-widget","input-preservation","focus-stability","resize-re-render","disposal-cleanliness","reserved-column"])
		assert.ok(RAIL2_VERDICTS.includes(report.capabilities?.[key]),`capability ${key} must be VERIFIED|GAP|UNKNOWN`);
	assert.ok(REFLOW2_CLASSES.includes(report.capabilities?.["transcript-reflow"]),"transcript-reflow has its own observation classes");
	assert.ok(OCCLUSION_CLASSES.includes(report.capabilities?.["overlay-occlusion"]),"overlay-occlusion has its own observation classes");
	assert.ok(RAIL2_CANDIDATE_CLASSES.includes(report.capabilities?.["rail-candidate-class"]),"the rail candidate class is one of the four owner W5 §2 categories");
	if(report.capabilities["rail-candidate-class"]==="RESERVED COLUMN"){
		assert.equal(report.capabilities["transcript-reflow"],"REFLOW_OBSERVED",
			"RESERVED COLUMN requires measured reflow (position-only evidence never passes admission)");
		assert.equal(report.capabilities["reserved-column"],"VERIFIED");
		const d=report.observations?.docWidth, r=report.observations?.railWidth;
		assert.ok(d&&[d.baselineMin,d.baselineMax,d.withRailMin,d.withRailMax].every(num)&&r&&num(r.min)&&r.min>0,
			"RESERVED COLUMN requires raw render-path width numbers, not relabeled capability strings");
		assert.ok(d.baselineMin===d.baselineMax&&d.withRailMin===d.withRailMax&&d.baselineMin-d.withRailMax>=1,
			"RESERVED COLUMN requires a sustained measured narrowing of the conversation width (occlusion or no reflow is never a rail)");
		assert.ok(GATES.every((g)=>report.capabilities[g]==="VERIFIED"),
			"RESERVED COLUMN requires every raw persistence/input/focus/resize/disposal gate, not only verdict labels");
	}
	assert.equal(report.modelCalls,0);assert.equal(report.networkCalls,0);assert.equal(report.providerCalls,0);
	assert.ok(typeof report.limitation==="string"&&report.limitation.length>0,"the limitation field is mandatory");
	if(selfTestRequired){
		assert.equal(report.selfTest?.positionOnlyClaimRejected,true,"the self-test must have rejected a position-only pass");
		assert.equal(report.selfTest?.occlusionAsRailClaimRejected,true,"the self-test must have rejected an occlusion-as-rail claim");
	}
	return true;
}

const PHASES=["base","mount","typed","overlay","resized","closed"];
/**
 * Harness-side derivation: turns the JSONL records written by the instrumented components inside
 * the host render pass into the observation numbers. Nothing here parses PTY output.
 */
export function buildRail2Observations(records,{token}){
	const recs=(Array.isArray(records)?records:[]).filter((r)=>r&&typeof r==="object");
	const idx=(name)=>recs.findIndex((r)=>r.kind==="phase"&&r.name===name);
	const found={};for(const p of PHASES)found[p]=idx(p);
	const windowOf=(from,to)=>{
		if(found[from]<0)return null;
		const end=to===null||found[to]<0?recs.length:found[to];
		return recs.slice(found[from],end);
	};
	const countLabel=(win,label)=>win===null?null:win.filter((r)=>r.kind==="render"&&r.label===label).length;
	const widthStats=(win,label)=>{
		if(win===null)return{min:null,max:null};
		const ws=win.filter((r)=>r.kind==="render"&&r.label===label&&num(r.width)).map((r)=>r.width);
		return ws.length?{min:Math.min(...ws),max:Math.max(...ws)}:{min:null,max:null};
	};
	const win={};for(const p of PHASES)win[p]=windowOf(p,PHASES[PHASES.indexOf(p)+1]??null);
	// withRail spans mount..overlay so a later terminal resize can never contaminate the
	// mounted-width comparison; the mount marker is recorded BEFORE the setWidget call.
	const withRailWin=windowOf("mount","overlay");
	const api=[...recs].reverse().find((r)=>r.kind==="api");
	const presence=api?.presence??{};
	const pick=(kind,phaseName)=>[...recs].reverse().find((r)=>r.kind===kind&&r.phase===phaseName);
	const textAt=(phaseName)=>{const r=pick("editorText",phaseName);return r&&typeof r.text==="string"&&token?r.text.includes(token):null;};
	const focusAt=(phaseName)=>{const r=pick("focus",phaseName);return r&&(typeof r.name==="string"||r.name===null)?r.name:null;};
	const boundsValue=(phaseName)=>{const r=pick("overlayBounds",phaseName);return r?(r.bounds??null):null;};
	const railAfterDispose=countLabel(win.closed,"RAIL");
	const base=widthStats(win.base,"DOC"), withRail=widthStats(withRailWin,"DOC"), after=widthStats(win.resized,"DOC");
	const railAll=(()=>{const ws=[];for(const p of ["mount","typed","overlay","resized"])if(win[p])ws.push(...win[p].filter((r)=>r.kind==="render"&&r.label==="RAIL"&&num(r.width)).map((r)=>r.width));
		return ws.length?{min:Math.min(...ws),max:Math.max(...ws)}:{min:null,max:null};})();
	return {
		apiPresence:{setWidget:presence.setWidget??null,setHeader:presence.setHeader??null,custom:presence.custom??null,
			getEditorText:presence.getEditorText??null,focusReader:presence.focusReader??null,overlayBounds:presence.overlayBounds??null},
		widgetRender:{framesBeforeMount:countLabel(win.base,"RAIL"),framesAfterMount:countLabel(win.mount,"RAIL"),
			framesTyped:countLabel(win.typed,"RAIL"),framesOverlay:countLabel(win.overlay,"RAIL"),
			framesResized:countLabel(win.resized,"RAIL"),framesAfterDispose:railAfterDispose},
		docWidth:{baselineMin:base.min,baselineMax:base.max,withRailMin:withRail.min,withRailMax:withRail.max,
			afterResizeMin:after.min,afterResizeMax:after.max},
		railWidth:railAll,
		overlay:{boundsAfterOpen:found.overlay<0?null:boundsValue("overlay"),boundsAfterResize:found.resized<0?null:boundsValue("resized"),
			boundsAfterDispose:found.closed<0?null:boundsValue("closed")},
		inputPreservation:{afterType:textAt("typed"),afterOverlay:textAt("overlay"),afterResize:textAt("resized"),afterDispose:textAt("closed")},
		focus:{base:focusAt("base"),typed:focusAt("typed"),overlay:focusAt("overlay"),resized:focusAt("resized")},
		disposal:{railFramesStopped:railAfterDispose===null?null:railAfterDispose===0,
			overlayGone:found.overlay<0||pick("overlayBounds","overlay")===null||found.closed<0?null:boundsValue("closed")===null,
			editorTextKept:textAt("closed")},
	};
}

// ---------------------------------------------------------------------------
// Executed host mode. Mirrors the t10/v1 harness discipline: disposable home and
// project, provider keys stripped, model calls forbidden at the event seam.
// ---------------------------------------------------------------------------
const repo=dirname(dirname(fileURLToPath(import.meta.url)));
const sleep=(ms)=>new Promise((done)=>setTimeout(done,ms));

export function probe2ExtensionSource(dir){
	return [
		'import {appendFileSync,existsSync,writeFileSync} from "node:fs";',
		"const STAGE="+JSON.stringify(dir)+";",
		'const REC=STAGE+"/records.jsonl";',
		'const rec=(o)=>{try{appendFileSync(REC,JSON.stringify(o)+"\\n");}catch{}};',
		'const flag=(name)=>existsSync(STAGE+"/"+name);',
		'const wait=(name,ms)=>new Promise((res)=>{const to=setTimeout(()=>res(false),ms);const iv=setInterval(()=>{if(flag(name)){clearInterval(iv);clearTimeout(to);res(true);}},100);});',
		'const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));',
		"let frames=0;",
		'const mk=(label)=>({render:(width)=>{frames++;rec({kind:"render",label,width,seq:frames});return [label+" ASENRAIL2 w"+width];},invalidate:()=>{},handleInput:()=>{},dispose:()=>rec({kind:"dispose",label})});',
		"export default function(pi){",
		' pi.on("project_trust",()=>({trusted:"yes",remember:false}));',
		' pi.on("before_agent_start",()=>{throw Error("rail probe v2 forbids model calls");});',
		' pi.on("session_start",async(_event,ctx)=>{',
		'  const ui=ctx.ui;',
		"  const presence={setWidget:typeof ui?.setWidget===\"function\",setHeader:typeof ui?.setHeader===\"function\",custom:typeof ui?.custom===\"function\",getEditorText:typeof ui?.getEditorText===\"function\",focusReader:false,overlayBounds:false};",
		'  const phase=(name)=>{rec({kind:"phase",name});writeFileSync(STAGE+"/phase-"+name,"ok");};',
		'  let tuiRef=null,handleRef=null,doneRef=null;',
		'  const focusAt=(name)=>{const f=tuiRef&&typeof tuiRef.getFocusedComponent==="function"?tuiRef.getFocusedComponent():null;rec({kind:"focus",phase:name,name:f&&f.constructor&&f.constructor.name?f.constructor.name:null});};',
		'  const textAt=(name)=>{rec({kind:"editorText",phase:name,text:presence.getEditorText?ui.getEditorText():""});};',
		'  if(presence.setHeader)ui.setHeader((tui)=>{tuiRef=tui;presence.focusReader=typeof tui?.getFocusedComponent==="function";return mk("DOC");});',
		'  ui.notify("probe2: baseline document slot instrumented","info");await sleep(2500);',
		'  rec({kind:"api",presence});focusAt("base");phase("base");ui.notify("probe2: baseline tick","info");await sleep(2000);',
		'  if(await wait("stage-rail",90000)){',
		'   phase("mount");',
		'   if(presence.setWidget)ui.setWidget("probe2:rail",(tui)=>mk("RAIL"),{placement:"aboveEditor"});',
		'   ui.notify("probe2: rail tick","info");await sleep(2000);writeFileSync(STAGE+"/phase-mounted","ok");',
		'  } else {phase("mount");writeFileSync(STAGE+"/phase-mounted","skipped");}',
		'  if(await wait("stage-typed",90000)){textAt("typed");focusAt("typed");phase("typed");ui.notify("probe2: typed tick","info");await sleep(2000);}',
		'  if(await wait("stage-overlay",90000)){',
		'   if(presence.custom){',
		'    ui.custom((_tui,_theme,_bindings,done)=>{doneRef=()=>done(undefined);',
		'     return {render:(width)=>{rec({kind:"render",label:"OVLY",width,seq:++frames});return ["ASENRAIL2-OVLY"];},invalidate:()=>{},handleInput:()=>{}};',
		'    },{overlay:true,overlayOptions:{width:30,anchor:"top-left",nonCapturing:true,visible:(w)=>{rec({kind:"overlayVisible",width:w});return true;}},',
		'     onHandle:(h)=>{handleRef=h;presence.overlayBounds=typeof h?.getBounds==="function";}}).catch(()=>{});',
		'    await sleep(2500);',
		'    rec({kind:"overlayBounds",phase:"overlay",bounds:handleRef&&typeof handleRef.getBounds==="function"?handleRef.getBounds()??null:null});',
		'   }',
		'   textAt("overlay");focusAt("overlay");phase("overlay");ui.notify("probe2: overlay tick","info");await sleep(2000);',
		'  }',
		'  if(await wait("stage-resized",90000)){',
		'   ui.notify("probe2: resized tick","info");await sleep(2500);',
		'   rec({kind:"overlayBounds",phase:"resized",bounds:handleRef&&typeof handleRef.getBounds==="function"?handleRef.getBounds()??null:null});',
		'   textAt("resized");focusAt("resized");phase("resized");ui.notify("probe2: resized tick 2","info");await sleep(2000);',
		'  }',
		'  if(await wait("stage-teardown",90000)){',
		'   if(doneRef)doneRef();',
		'   if(presence.setWidget)ui.setWidget("probe2:rail",undefined,{placement:"aboveEditor"});',
		'   if(presence.setHeader)ui.setHeader(undefined);',
		'   ui.notify("probe2: disposal tick","info");await sleep(2500);',
		'   rec({kind:"overlayBounds",phase:"closed",bounds:handleRef&&typeof handleRef.getBounds==="function"?handleRef.getBounds()??null:null});',
		'   textAt("closed");focusAt("closed");rec({kind:"api",presence});phase("closed");',
		'  }',
		'  const poll=setInterval(()=>{if(flag("shutdown")){clearInterval(poll);ctx.shutdown();}},100);',
		" });",
		"}",
	].join("\n")+"\n";
}

async function waitForStage(dir,name,timeoutMs){
	for(let attempt=0;attempt<timeoutMs/250&&!existsSync(join(dir,name));attempt++)await sleep(250);
	return existsSync(join(dir,name));
}

function parseRecords(path2){
	if(!existsSync(path2))return [];
	return readFileSync(path2,"utf8").split("\n").filter((line)=>line.trim().length>0)
		.map((line)=>{try{return JSON.parse(line);}catch{return null;}}).filter(Boolean);
}

async function main(){
	const argv=process.argv.slice(2);
	const argOf=(name,fallback)=>{const i=argv.indexOf(name);return i>=0&&argv[i+1]?argv[i+1]:fallback;};
	const measuredWidth=Number(argOf("--start-width","140"));
	const resizeWidth=Number(argOf("--resize-width",String(measuredWidth===140?120:140)));
	const runRole=argOf("--role","primary");
	assert.ok(runRole==="primary"||runRole==="supplementary","--role must be primary or supplementary");
	const expected=process.env.ASEN_EXPECTED_SHA;
	const head=execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
	if(expected!==undefined)assert.equal(expected,head,"rail probe v2 must run against the exact candidate");
	assert.match(head,SHA);
	const metadata=JSON.parse(readFileSync(join(repo,"node_modules","@earendil-works","pi-coding-agent","package.json"),"utf8"));
	const temporary=realpathSync(mkdtempSync(join(tmpdir(),"asen-rail2-probe-")));
	const project=join(temporary,"project"),home=join(temporary,"home");
	mkdirSync(project);mkdirSync(home,{mode:0o700});
	const git=(...args)=>execFileSync("git",["-C",project,...args],{encoding:"utf8"}).trim();
	git("init","-q");git("config","user.name","Rail probe v2");git("config","user.email","rail2@example.invalid");
	writeFileSync(join(project,"tracked.txt"),"baseline\n");git("add","tracked.txt");git("commit","-qm","baseline");
	const probe=join(temporary,"probe2.ts");
	writeFileSync(probe,probe2ExtensionSource(temporary));
	const env={...process.env,HOME:home,USERPROFILE:home,PI_CODING_AGENT_DIR:join(home,"agent"),
		ASEN_NO_SKILL_REGISTRY:"1",PI_TELEMETRY:"0",TERM:"xterm-256color",NO_COLOR:"1",FORCE_COLOR:"0",COLORTERM:""};
	for(const key of Object.keys(env))if(key.startsWith("GIT_")||/^(OPENAI|ANTHROPIC|GROQ|NVIDIA|OPENROUTER|GOOGLE|GEMINI).*(_KEY|_TOKEN)$/u.test(key))delete env[key];
	const binary=join(repo,"node_modules","@earendil-works","pi-coding-agent",typeof metadata.bin==="string"?metadata.bin:metadata.bin.pi);
	const require=createRequire(join(repo,"package.json"));
	const {spawn}=require("node-pty");
	assert.ok(spawn,"node-pty must be available to drive the real host");
	const child=spawn(process.execPath,[binary,"--no-extensions","--extension",probe,"--no-skills","--no-builtin-tools","--provider","openai","--model","gpt-4o"],
		{cwd:project,env,cols:measuredWidth,rows:40,name:"xterm-256color"});
	let exit=null;
	child.onExit((result)=>{exit=result;});
	const token="probe2-typed-"+Date.now().toString(36);
	let cleanExit=false;
	try{
		assert.ok(await waitForStage(temporary,"phase-base",180000),"the real Pi host must reach session_start with the instrumented document slot");
		writeFileSync(join(temporary,"stage-rail"),"go");
		assert.ok(await waitForStage(temporary,"phase-mounted",90000),"the rail widget mount phase must complete");
		child.write(token);
		await sleep(2000);
		writeFileSync(join(temporary,"stage-typed"),"go");
		assert.ok(await waitForStage(temporary,"phase-typed",90000),"the typed-text checkpoint must complete");
		writeFileSync(join(temporary,"stage-overlay"),"go");
		assert.ok(await waitForStage(temporary,"phase-overlay",90000),"the overlay checkpoint must complete");
		child.resize(resizeWidth,40);
		await sleep(2500);
		writeFileSync(join(temporary,"stage-resized"),"go");
		assert.ok(await waitForStage(temporary,"phase-resized",90000),"the resize checkpoint must complete");
		writeFileSync(join(temporary,"stage-teardown"),"go");
		assert.ok(await waitForStage(temporary,"phase-closed",90000),"the disposal checkpoint must complete");
		assert.ok(exit===null,"the host session must stay alive through the experiment");
		await requestGracefulPtyExit({child,shutdownFile:join(temporary,"shutdown"),timeoutMs:15000});
		cleanExit=true;
	}catch(error){
		const records=parseRecords(join(temporary,"records.jsonl"));
		rmSync(temporary,{recursive:true,force:true,maxRetries:8,retryDelay:100});
		throw new Error("RAIL2_RUN_INCOMPLETE: "+(error instanceof Error?error.message:"unknown")
			+" | records kept? no | frames recorded: "+records.length);
	}
	const records=parseRecords(join(temporary,"records.jsonl"));
	rmSync(temporary,{recursive:true,force:true,maxRetries:8,retryDelay:100});
	const report=classifyRail2Observations({candidateSha:head,host:"@earendil-works/pi-coding-agent",
		hostVersion:metadata.version,platform:process.platform,measuredWidth,resizeWidth,runRole,
		observations:buildRail2Observations(records,{token})});
	console.log(JSON.stringify(report,null,"\t"));
	const outIndex=argv.indexOf("--out");
	if(outIndex>=0&&argv[outIndex+1])writeFileSync(resolve(argv[outIndex+1]),JSON.stringify(report,null,"\t")+"\n");
	process.exit(0);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
	main().catch((error)=>{console.error("RAIL_PROBE_V2_REJECTED: "+(error instanceof Error?error.message:"unknown"));process.exitCode=1;});
}
