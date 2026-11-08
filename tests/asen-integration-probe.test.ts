// UFC-M1-03: the R08 decision needs real evidence, not assumption. Field 13 method: (a) the
// shipped public-reader inventory demonstrably cannot produce any connectivity field at all —
// that pin is permanent and honest; (b) the negative pin that the inventory path never emits a
// "connected" state. File absence is NOT the RED: the functional RED below fails because the
// required receipt behaviour is unproducible by shipped code until the probe exists.
import test from "node:test";
import assert from "node:assert/strict";
import {inspectIntegrationProfiles, type PublicInventoryRow} from "../src/runtime/integration-profile-inspection.js";
// @ts-expect-error The integration probe is a standalone provider-free ESM script without a declaration file.
import {buildProbeReceipt, validateProbeReceipt, PROBE_SCHEMA} from "../scripts/asen-integration-probe.mjs";

const CANDIDATE_SHA="a".repeat(40);
function hostReaders():{getCommands:()=>readonly PublicInventoryRow[],getAllTools:()=>readonly PublicInventoryRow[]}{
	return {
		getCommands:()=>[{name:"asen-integrations",source:"extension"},{name:"asen-panel",source:"extension"}],
		getAllTools:()=>[
			{name:"search",namespace:{name:"mcp-memory"}},
			{name:"remember",namespace:{name:"mcp-memory"}},
			{name:"fetch",namespace:{name:"mcp-web"}},
		],
	};
}

test("UFC-M1-03 the shipped inventory path cannot produce any connectivity evidence (plan field 13a/13b)",()=>{
	const readers=hostReaders();
	const inspection=inspectIntegrationProfiles(readers);
	assert.equal(inspection.tools.state,"reported","presence alone is observable today");
	assert.equal(inspection.commands.state,"reported");
	for(const entry of inspection.tools.entries)assert.equal(entry.connection,"unknown",`${entry.name} can never report more than unknown`);
	for(const entry of inspection.commands.entries)assert.equal(entry.connection,"unknown");
	const serialised=JSON.stringify(inspection);
	assert.ok(!serialised.includes('"connectivity"'),"no shipped component produces a connectivity field at all");
	assert.ok(!/"connected"/u.test(serialised),"the inventory path never emits a connected state");
});

test("UFC-M1-03 the probe turns real inspection output into a presence/connectivity-separated receipt with an honest GAP",()=>{
	const inspection=inspectIntegrationProfiles(hostReaders());
	const report=buildProbeReceipt({candidateSha:CANDIDATE_SHA,inspection});
	assert.equal(report.schema,PROBE_SCHEMA);
	assert.deepEqual(report.servers.map((row: {name: string})=>row.name),["mcp-memory","mcp-web"]);
	for(const server of report.servers){
		assert.equal(server.presence,"reported","derived from observed tool entries");
		assert.equal(server.connectivity,"NONE","no handshake observation exists on public readers");
		assert.ok(server.connectivityEvidence.length>0,"the absence itself is stated");
	}
	assert.equal(report.verdict,"GAP","a GAP verdict is the honest success outcome");
	assert.equal(report.networkCalls,0);assert.equal(report.modelCalls,0);assert.equal(report.registryWrites,false);
	assert.match(report.candidateSha,/^[a-f0-9]{40}$/u);
	assert.ok(typeof report.limitation==="string"&&report.limitation.length>0);
	const again=JSON.stringify(buildProbeReceipt({candidateSha:CANDIDATE_SHA,inspection:inspectIntegrationProfiles(hostReaders())}));
	assert.equal(JSON.stringify(report),again,"two runs over the same observations are byte-identical");
});

test("UFC-M1-03 only an admissible handshake observation can lift a server above NONE",()=>{
	const inspection=inspectIntegrationProfiles(hostReaders());
	const report=buildProbeReceipt({candidateSha:CANDIDATE_SHA,inspection,
		handshakeObservations:{"mcp-web":{evidence:"initialize/initialized exchange observed through the host boundary"}}});
	const web=report.servers.find((row: {name: string})=>row.name==="mcp-web");
	const memory=report.servers.find((row: {name: string})=>row.name==="mcp-memory");
	assert.equal(web?.connectivity,"handshake-observed");
	assert.equal(memory?.connectivity,"NONE","an observation for one server never claims another");
	assert.equal(report.verdict,"HANDSHAKE_OBSERVED");
	assert.ok(!JSON.stringify(report).includes('"connected"'),"even an observed handshake is stated as evidence, never as a generic connected flag");
});

test("UFC-M1-03 the receipt validator rejects presence-as-connection wording and fabricated states",()=>{
	const inspection=inspectIntegrationProfiles(hostReaders());
	const base=buildProbeReceipt({candidateSha:CANDIDATE_SHA,inspection});
	assert.throws(()=>validateProbeReceipt({...base,servers:[{...base.servers[0],connectivity:"connected"}]}),
		/connectivity vocabulary/u,"a made-up connectivity state is refused");
	assert.throws(()=>validateProbeReceipt({...base,servers:[{...base.servers[0],connectivity:"handshake-observed",connectivityEvidence:""}]}),
		/handshake evidence/u,"a connection claim without bounded evidence is refused");
	assert.throws(()=>validateProbeReceipt({...base,readers:{...base.readers,tools:"connected" as never}}),
		/presence vocabulary/u,"presence strings cannot be invented outside the shipped vocabulary");
	assert.throws(()=>buildProbeReceipt({candidateSha:"short",inspection}),/candidate SHA/u);
	assert.throws(()=>buildProbeReceipt({candidateSha:CANDIDATE_SHA,inspection:{commands:{state:"connected"},tools:{state:"reported"}} as never}),
		/presence vocabulary/u,"the probe refuses to wrap an inspection that breaks the vocabulary");
});

test("UFC-M1-03 the offline CI mode completes honestly with zero servers and a GAP verdict",()=>{
	const offline={commands:{state:"unavailable",entries:[],limited:false},tools:{state:"unavailable",entries:[],limited:false},profiles:{state:"unavailable",routes:[],limited:false}};
	const report=buildProbeReceipt({candidateSha:CANDIDATE_SHA,inspection:offline});
	assert.deepEqual(report.servers,[],"no host means no server claims at all");
	assert.equal(report.verdict,"GAP","offline honesty is a success, never a faked connection");
	assert.equal(report.readers.commands,"unavailable");
});
