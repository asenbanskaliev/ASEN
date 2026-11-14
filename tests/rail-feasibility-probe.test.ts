// UFC-M4-01. Field 13 method: file absence is NOT the RED. (a) The
// shipped t10 harness receipt provably records width fits only — no reflow/occlusion/partition
// observation exists in any shipped component, so the R02 admission input demonstrably does not
// exist today (permanent provenance pin below). (b) The negative baseline: the probe verdict
// schema must reject position-only evidence and must be able to emit GAP honestly. The functional
// RED is the import: no shipped module can build these receipts at all.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
// @ts-expect-error The rail feasibility probe is a standalone provider-free ESM script without a declaration file.
import {classifyRailObservations, validateRailProbeReport, PROBE_RAIL_SCHEMA} from "../scripts/rail-feasibility-probe.mjs";

const SHA="b".repeat(40);
const base={candidateSha:SHA,host:"@earendil-works/pi-coding-agent",hostVersion:"1.2.0",platform:"probe",measuredWidth:140,resizeWidth:120};
function observations(overrides={}){
	return {
		apiPresence:{setWidget:true,custom:true,showOverlayOnFactoryTui:true,setStatus:true},
		widgetPersistence:{presentBefore:true,presentAfterActivity:true},
		inputPreservation:{typedTokenVisible:true,overlayCapturedInput:false},
		resize:{reRendered:true,overlayAdapted:true},
		disposal:{overlayGone:true,widgetGone:true},
		reflow:{baselineMaxWidth:139,overlayMaxWidth:99,overlayWidth:40,delta:40},
		...overrides,
	};
}

test("UFC-M4-01 provenance pin: no shipped t10 receipt carries any reflow/occlusion/partition observation (plan field 13a)",()=>{
	const receipt=JSON.parse(readFileSync(path.resolve("t10-real-pi-tui-matrix-win32.json"),"utf8"));
	const serialised=JSON.stringify(receipt).toLowerCase();
	for(const term of ["reflow","occlusion","partition","rail"])
		assert.ok(!serialised.includes(term),`the shipped matrix records widths only; ${term} evidence exists nowhere (${receipt.mode})`);
	assert.ok(Array.isArray(receipt.widths)&&receipt.widths.every((w:number)=>w<=120),"t10 exercised no width above 120, so the ≥140 rail question is unanswerable from it");
});

test("UFC-M4-01 an admissible reflow plus every persistence gate is the only path to a root-split VERIFIED",()=>{
	const report=classifyRailObservations({...base,observations:observations()});
	assert.equal(report.schema,PROBE_RAIL_SCHEMA);
	assert.equal(report.capabilities["transcript-reflow"],"REFLOW_OBSERVED");
	assert.equal(report.capabilities["persistent-root-split-rail"],"VERIFIED");
	assert.equal(report.modelCalls,0);assert.equal(report.networkCalls,0);
	validateRailProbeReport(report);
});

test("UFC-M4-01 occlusion observation is never called a reserved rail (matrix rule 3)",()=>{
	const report=classifyRailObservations({...base,
		observations:observations({reflow:{baselineMaxWidth:139,overlayMaxWidth:139,overlayWidth:40,delta:0}})});
	assert.equal(report.capabilities["transcript-reflow"],"OCCLUSION_OBSERVED");
	assert.equal(report.capabilities["persistent-root-split-rail"],"GAP","an overlay that covers a full-width transcript is the occluding alternative, not the rail");
	validateRailProbeReport(report);
});

test("UFC-M4-01 position-only evidence cannot pass admission: missing or unparseable measurements stay UNKNOWN (matrix rule 5)",()=>{
	const report=classifyRailObservations({...base,observations:observations({
		reflow:{baselineMaxWidth:null,overlayMaxWidth:null,overlayWidth:40,delta:null},
		widgetPersistence:{presentBefore:true,presentAfterActivity:null},
	})});
	assert.equal(report.capabilities["transcript-reflow"],"INDETERMINATE");
	assert.equal(report.capabilities["persistent-root-split-rail"],"UNKNOWN");
	assert.equal(report.capabilities["additive-widget"],"UNKNOWN","an unparsable persistence observation is never a pass");
	validateRailProbeReport(report);
	assert.throws(()=>validateRailProbeReport({...report,capabilities:{...report.capabilities,"persistent-root-split-rail":"VERIFIED"}}),
		/root-split VERIFIED requires/u,"a fabricated VERIFIED without reflow numbers is refused");
	assert.throws(()=>validateRailProbeReport({...report,measuredWidth:120}),
		/≥140/u,"admission measurements below 140 columns are refused");
});

test("UFC-M4-01 the probe emits GAP honestly when the public overlay path is absent",()=>{
	const report=classifyRailObservations({...base,observations:observations({
		apiPresence:{setWidget:true,custom:false,showOverlayOnFactoryTui:false,setStatus:true},
		widgetPersistence:{presentBefore:true,presentAfterActivity:true},
		inputPreservation:{typedTokenVisible:null,overlayCapturedInput:null},
		resize:{reRendered:null,overlayAdapted:null},
		disposal:{overlayGone:null,widgetGone:null},
		reflow:{baselineMaxWidth:null,overlayMaxWidth:null,overlayWidth:null,delta:null},
	})});
	assert.equal(report.capabilities["overlay-noncapturing"],"GAP","absence of the public path is recorded, not invented");
	assert.equal(report.capabilities["persistent-root-split-rail"],"GAP");
	assert.equal(report.capabilities["additive-widget"],"VERIFIED");
	validateRailProbeReport(report);
});

test("UFC-M4-01 the generated host probe extension itself parses as valid TypeScript before any run",async t=>{
 const {mkdirSync,mkdtempSync,writeFileSync}=await import("node:fs");
 const path2=await import("node:path");
  // @ts-expect-error The standalone script module has no declaration file (same precedent as above).
 const {probeExtensionSource}=await import("../scripts/rail-feasibility-probe.mjs");
 const base=path2.resolve(".cache");
 mkdirSync(base,{recursive:true});
 const dir=mkdtempSync(path2.join(base,"asen-rail-src-"));
 t.after(()=>{import("node:fs").then(fs=>fs.rmSync(dir,{recursive:true,force:true}));});
 const file=path2.join(dir,"probe.ts");
 writeFileSync(file,probeExtensionSource(dir));
  const mod=await import((await import("node:url")).pathToFileURL(file).href);
 assert.equal(typeof mod.default,"function","the emitted extension exports a pi factory");
});

test("UFC-M4-01 a persistence or disposal failure demotes the rail verdict even with a reflow delta",()=>{
	const report=classifyRailObservations({...base,observations:observations({
		disposal:{overlayGone:false,widgetGone:true},
	})});
	assert.equal(report.capabilities["disposal-cleanliness"],"GAP");
	assert.equal(report.capabilities["persistent-root-split-rail"],"UNKNOWN","a leaked overlay makes the rail claim unverifiable, never VERIFIED");
	validateRailProbeReport(report);
});
