// UFC-M4-03-prep (W5-A): rail feasibility probe v2. Probe v1 (ef4507f35a99) derived persistence
// and reflow from PTY line parsing and captured no render-path width at all — its own receipt
// pins resize-behavior as a GAP with baselineMaxWidth null (provenance test below). v2 measures
// inside the effective host render: the width the host passes INTO render() of the components it
// mounts, plus ctx.ui.getEditorText(), TUI.getFocusedComponent() and OverlayHandle.getBounds().
// The four owner classes from W5 §2 are enforced verbatim: RESERVED COLUMN / OCCLUSION /
// ADDITIVE NO RESERVATION / INCONCLUSIVE. An overlay is never a rail and position data alone
// never passes admission. The functional RED is the import: no shipped module classifies these
// render-path observations.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
// @ts-expect-error The rail feasibility probe v2 is a standalone provider-free ESM script without a declaration file.
import {classifyRail2Observations, validateRail2Report, buildRail2Observations, PROBE_RAIL2_SCHEMA, probe2ExtensionSource} from "../scripts/rail-feasibility-probe-v2.mjs";

const SHA="a".repeat(40);
const baseMeta=(overrides={})=>({candidateSha:SHA,host:"@earendil-works/pi-coding-agent",hostVersion:"1.2.0",
 platform:"probe",measuredWidth:140,resizeWidth:120,runRole:"primary",...overrides});

// Default fixture = the honest real-run shape: the rail widget persists in every mounted window
// but the conversation slot keeps the full width; the overlay occludes without reserving.
function observations(overrides={}){
	return {
		apiPresence:{setWidget:true,setHeader:true,custom:true,getEditorText:true,focusReader:true,overlayBounds:true},
		widgetRender:{framesBeforeMount:0,framesAfterMount:4,framesTyped:3,framesOverlay:2,framesResized:3,framesAfterDispose:0},
		docWidth:{baselineMin:140,baselineMax:140,withRailMin:140,withRailMax:140,afterResizeMin:120,afterResizeMax:120},
		railWidth:{min:140,max:140},
		overlay:{boundsAfterOpen:{row:1,col:0,width:30,height:6},boundsAfterResize:{row:1,col:0,width:28,height:6},boundsAfterDispose:null},
		inputPreservation:{afterType:true,afterOverlay:true,afterResize:true,afterDispose:true},
		focus:{base:"Editor",typed:"Editor",overlay:"Editor",resized:"Editor"},
		disposal:{railFramesStopped:true,overlayGone:true,editorTextKept:true},
		...overrides,
	};
}

test("UFC-M4-02-probe-v2 provenance pin: the v1 PTY-parsing receipt provably cannot certify reflow (W5 §2 'no repitas la sonda anterior sin cambios')",()=>{
	const receipt=JSON.parse(readFileSync(path.resolve("docs","audit","evidence","rail-feasibility-probe-ef4507f35a99.json"),"utf8"));
	assert.equal(receipt.schema,"asen-rail-feasibility-probe/v1","this pin is bound to the v1 receipt bytes");
	assert.equal(receipt.observations.reflow.baselineMaxWidth,null,"v1's PTY width parse produced null, which is exactly why v2 measures render-path widths instead");
	assert.notEqual(receipt.capabilities["resize-behavior"],"VERIFIED","v1 never proved a resize re-render; v2 must");
});

test("UFC-M4-02-probe-v2 a demonstrably narrower sustained conversation column is the only RESERVED COLUMN path",()=>{
	const report=classifyRail2Observations({...baseMeta(),observations:observations({
		docWidth:{baselineMin:140,baselineMax:140,withRailMin:110,withRailMax:110,afterResizeMin:100,afterResizeMax:100},
		railWidth:{min:30,max:30},
		overlay:{boundsAfterOpen:null,boundsAfterResize:null,boundsAfterDispose:null},
	})});
	assert.equal(report.schema,PROBE_RAIL2_SCHEMA);
	assert.equal(report.capabilities["transcript-reflow"],"REFLOW_OBSERVED");
	assert.equal(report.capabilities["reserved-column"],"VERIFIED");
	assert.equal(report.capabilities["rail-candidate-class"],"RESERVED COLUMN");
	validateRail2Report(report);
});

test("UFC-M4-02-probe-v2 a persistent widget that never shrinks the conversation is ADDITIVE NO RESERVATION, never a rail",()=>{
	const report=classifyRail2Observations({...baseMeta(),observations:observations()});
	assert.equal(report.capabilities["transcript-reflow"],"NO_REFLOW_OBSERVED");
	assert.equal(report.capabilities["additive-widget"],"VERIFIED");
	assert.equal(report.capabilities["reserved-column"],"GAP","measured absence of reservation is an honest GAP, not UNKNOWN");
	assert.equal(report.capabilities["rail-candidate-class"],"ADDITIVE NO RESERVATION");
	validateRail2Report(report);
});

test("UFC-M4-02-probe-v2 an occluding overlay over an unshrunk transcript is OCCLUSION and never a rail (W5 §2 'Una superposición no cuenta como barra lateral auténtica')",()=>{
	const report=classifyRail2Observations({...baseMeta(),observations:observations({
		widgetRender:{framesBeforeMount:0,framesAfterMount:0,framesTyped:0,framesOverlay:0,framesResized:0,framesAfterDispose:0},
		railWidth:{min:null,max:null},
		overlay:{boundsAfterOpen:{row:1,col:0,width:30,height:6},boundsAfterResize:{row:1,col:0,width:26,height:6},boundsAfterDispose:null},
	})});
	assert.equal(report.capabilities["overlay-occlusion"],"OCCLUSION_OBSERVED");
	assert.equal(report.capabilities["additive-widget"],"GAP");
	assert.equal(report.capabilities["rail-candidate-class"],"OCCLUSION");
	validateRail2Report(report);
});

test("UFC-M4-02-probe-v2 unmeasurable evidence stays INCONCLUSIVE and a fabricated RESERVED COLUMN claim is refused (matrix rules)",()=>{
	const report=classifyRail2Observations({...baseMeta(),observations:observations({
		docWidth:{baselineMin:null,baselineMax:null,withRailMin:null,withRailMax:null,afterResizeMin:null,afterResizeMax:null},
		railWidth:{min:null,max:null},
		widgetRender:{framesBeforeMount:0,framesAfterMount:4,framesTyped:null,framesOverlay:null,framesResized:null,framesAfterDispose:null},
		inputPreservation:{afterType:null,afterOverlay:null,afterResize:null,afterDispose:null},
		focus:{base:"Editor",typed:null,overlay:null,resized:null},
		overlay:{boundsAfterOpen:null,boundsAfterResize:null,boundsAfterDispose:null},
		disposal:{railFramesStopped:null,overlayGone:null,editorTextKept:null},
	})});
	assert.equal(report.capabilities["transcript-reflow"],"INDETERMINATE");
	assert.equal(report.capabilities["rail-candidate-class"],"INCONCLUSIVE","missing render-path numbers can never be upgraded by narrative");
	validateRail2Report(report);
	assert.throws(()=>validateRail2Report({...report,capabilities:{...report.capabilities,"rail-candidate-class":"RESERVED COLUMN"}}),
		/RESERVED COLUMN requires/u,"a position-only pass (no render-path widths) is refused");
	assert.throws(()=>validateRail2Report({...report,capabilities:{...report.capabilities,
		"rail-candidate-class":"RESERVED COLUMN","reserved-column":"VERIFIED","transcript-reflow":"REFLOW_OBSERVED"}}),
		/RESERVED COLUMN requires/u,"even relabeled capabilities without raw observation numbers cannot fabricate the claim");
});

test("UFC-M4-02-probe-v2 render-record windowing: widths come from the host render calls, never from PTY line parsing",()=>{
	const token="probe2-token-xyz";
	const rec=(o:Record<string,unknown>)=>o;
	const records=[
		rec({kind:"api",presence:{setWidget:true,setHeader:true,custom:true,getEditorText:true,focusReader:true,overlayBounds:true}}),
		rec({kind:"phase",name:"base"}),
		rec({kind:"render",label:"DOC",width:140}),rec({kind:"render",label:"DOC",width:140}),
		rec({kind:"focus",phase:"base",name:"Editor"}),
		rec({kind:"phase",name:"mount"}),
		rec({kind:"render",label:"RAIL",width:140}),rec({kind:"render",label:"RAIL",width:140}),
		rec({kind:"render",label:"DOC",width:140}),
		rec({kind:"phase",name:"typed"}),
		rec({kind:"render",label:"RAIL",width:140}),
		rec({kind:"editorText",phase:"typed",text:`hi ${token} there`}),
		rec({kind:"focus",phase:"typed",name:"Editor"}),
		rec({kind:"phase",name:"overlay"}),
		rec({kind:"render",label:"RAIL",width:140}),
		rec({kind:"overlayBounds",phase:"overlay",bounds:{row:1,col:0,width:30,height:6}}),
		rec({kind:"editorText",phase:"overlay",text:`${token} kept`}),
		rec({kind:"focus",phase:"overlay",name:"Editor"}),
		rec({kind:"phase",name:"resized"}),
		rec({kind:"render",label:"DOC",width:120}),rec({kind:"render",label:"RAIL",width:120}),rec({kind:"render",label:"RAIL",width:120}),
		rec({kind:"overlayBounds",phase:"resized",bounds:{row:1,col:0,width:26,height:6}}),
		rec({kind:"editorText",phase:"resized",text:token}),
		rec({kind:"focus",phase:"resized",name:"Editor"}),
		rec({kind:"phase",name:"closed"}),
		rec({kind:"render",label:"DOC",width:120}),
		rec({kind:"overlayBounds",phase:"closed",bounds:null}),
		rec({kind:"editorText",phase:"closed",text:`${token} final`}),
	];
	const o=buildRail2Observations(records,{token});
	assert.equal(o.widgetRender.framesBeforeMount,0,"mount-time frames land in the mounted window, never before the mount marker");
	assert.equal(o.widgetRender.framesAfterMount,2);
	assert.equal(o.widgetRender.framesTyped,1);
	assert.equal(o.widgetRender.framesOverlay,1);
	assert.equal(o.widgetRender.framesResized,2,"the rail re-rendered inside the host render after the resize");
	assert.equal(o.widgetRender.framesAfterDispose,0,"no rail frames after teardown");
	assert.deepEqual(o.docWidth,{baselineMin:140,baselineMax:140,withRailMin:140,withRailMax:140,afterResizeMin:120,afterResizeMax:120});
	assert.deepEqual(o.railWidth,{min:120,max:140});
	assert.deepEqual(o.inputPreservation,{afterType:true,afterOverlay:true,afterResize:true,afterDispose:true});
	assert.deepEqual(o.focus,{base:"Editor",typed:"Editor",overlay:"Editor",resized:"Editor"});
	assert.deepEqual(o.disposal,{railFramesStopped:true,overlayGone:true,editorTextKept:true});
	const report=classifyRail2Observations({...baseMeta(),observations:o});
	assert.equal(report.capabilities["rail-candidate-class"],"ADDITIVE NO RESERVATION");
	assert.equal(report.capabilities["resize-re-render"],"VERIFIED");
});

test("UFC-M4-02-probe-v2 persistence needs a rendered frame in every mounted window, not a single position sighting",()=>{
	const o=buildRail2Observations([
		{kind:"api",presence:{setWidget:true,setHeader:true,custom:true,getEditorText:true,focusReader:true,overlayBounds:true}},
		{kind:"phase",name:"base"},{kind:"render",label:"DOC",width:140},
		{kind:"phase",name:"mount"},{kind:"render",label:"RAIL",width:140},
		{kind:"phase",name:"typed"},// no RAIL frame here: the widget vanished after activity
		{kind:"render",label:"DOC",width:140},{kind:"editorText",phase:"typed",text:"x"},
		{kind:"phase",name:"overlay"},
		{kind:"phase",name:"resized"},
		{kind:"phase",name:"closed"},
	],{token:"x"});
	assert.equal(o.widgetRender.framesTyped,0);
	const report=classifyRail2Observations({...baseMeta(),observations:o});
	assert.equal(report.capabilities["additive-widget"],"GAP","a widget that stops rendering in a mounted window is a demonstrated absence");
	assert.notEqual(report.capabilities["rail-candidate-class"],"RESERVED COLUMN");
});

test("UFC-M4-02-probe-v2 resize re-render is proven by render frames at the new width only",()=>{
	const withWidths=(after:Record<string,number|null>)=>classifyRail2Observations({...baseMeta(),
		observations:observations({docWidth:{baselineMin:140,baselineMax:140,withRailMin:140,withRailMax:140,...after}})});
	assert.equal(withWidths({afterResizeMin:120,afterResizeMax:120}).capabilities["resize-re-render"],"VERIFIED");
	assert.equal(withWidths({afterResizeMin:140,afterResizeMax:140}).capabilities["resize-re-render"],"GAP","still 140 after a resize to 120 means no re-render");
	assert.equal(withWidths({afterResizeMin:null,afterResizeMax:null}).capabilities["resize-re-render"],"UNKNOWN");
});

test("UFC-M4-02-probe-v2 admission runs at ≥140 columns; a 120-start run is recorded as supplemental only",()=>{
	const report=classifyRail2Observations({...baseMeta(),observations:observations()});
	assert.throws(()=>validateRail2Report({...report,measuredWidth:120,runRole:"primary"}),
		/≥140/u,"primary admission measurements below 140 columns are refused (matrix rule)");
	const supplemental=classifyRail2Observations({...baseMeta({measuredWidth:120,resizeWidth:140,runRole:"supplementary"}),
		observations:observations({docWidth:{baselineMin:120,baselineMax:120,withRailMin:120,withRailMax:120,afterResizeMin:140,afterResizeMax:140}})});
	validateRail2Report(supplemental);
});

test("UFC-M4-02-probe-v2 the generated host probe extension parses before any run",async t=>{
	const {mkdirSync,mkdtempSync,writeFileSync,rmSync}=await import("node:fs");
	const path2=await import("node:path");
	// @ts-expect-error The standalone script module has no declaration file (same precedent as above).
	const {probe2ExtensionSource}=await import("../scripts/rail-feasibility-probe-v2.mjs");
	const cacheBase=path2.resolve(".cache");
	mkdirSync(cacheBase,{recursive:true});
	const dir=mkdtempSync(path2.join(cacheBase,"asen-rail2-src-"));
	t.after(()=>{import("node:fs").then(fs=>fs.rmSync(dir,{recursive:true,force:true}));});
	const file=path2.join(dir,"probe2.ts");
	writeFileSync(file,probe2ExtensionSource(dir));
	const mod=await import((await import("node:url")).pathToFileURL(file).href);
	assert.equal(typeof mod.default,"function","the emitted extension exports a pi factory");
	rmSync(dir,{recursive:true,force:true});
});
