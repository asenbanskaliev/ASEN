#!/usr/bin/env node
// UFC-M1-03: read-only integration probe receipt producer (the R08 evidence decision).
// Wraps the shipped public-reader inventory vocabulary (src/runtime/integration-profile-inspection.ts)
// and forces presence and connectivity into distinct fields: nothing this receipt emits may read as
// a connected server unless an admissible handshake observation was supplied. No network, no model
// calls, no registry/parity writes, no file writes at all — stdout only. A GAP verdict is the honest
// success outcome: it states that public readers cannot distinguish a live server from a
// configured-but-unreachable one.
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const PROBE_SCHEMA="asen-integration-probe/v1";
const PRESENCE_VOCABULARY=["reported","empty","unavailable"];
const SHA=/^[a-f0-9]{40}$/u;

/** The single vocabulary for a server's connectivity claim: absence or bounded handshake evidence. */
export function validateProbeReceipt(report){
 assert.equal(report?.schema,PROBE_SCHEMA);
 assert.match(report?.candidateSha??"",SHA,"the receipt must pin the exact candidate SHA");
 assert.match(report?.host??"",/^[a-z][a-z0-9-]{0,31}$/u);
 for(const state of [report?.readers?.commands,report?.readers?.tools])
  assert.ok(PRESENCE_VOCABULARY.includes(state),`presence vocabulary violated: ${state}`);
 assert.ok(Array.isArray(report?.servers),"servers are derived from observed inventory only");
 for(const server of report.servers){
  assert.ok(PRESENCE_VOCABULARY.includes(server.presence),`presence vocabulary violated: ${server.presence}`);
  assert.ok(server.connectivity==="NONE"||server.connectivity==="handshake-observed",
   `connectivity vocabulary: only NONE or handshake-observed are admissible, got ${server.connectivity}`);
  if(server.connectivity==="handshake-observed")
   assert.ok(typeof server.connectivityEvidence==="string"&&server.connectivityEvidence.length>0,
    "a connection claim requires bounded handshake evidence");
 }
 const observed=report.servers.some(server=>server.connectivity==="handshake-observed");
 assert.equal(report.verdict,observed?"HANDSHAKE_OBSERVED":"GAP","the verdict follows the observations only");
 assert.equal(report.networkCalls,0,"the probe performs no network side effects");
 assert.equal(report.modelCalls,0,"the probe never spawns paid inference");
 assert.equal(report.registryWrites,false,"canonical registries change only via CI assembly");
 assert.ok(typeof report.limitation==="string"&&report.limitation.length>0,
  "the limitation field is mandatory so the receipt can never be misread as a connection");
 assert.ok(!JSON.stringify(report).includes('"connected"'),"receipt wording never carries a generic connected state");
 return true;
}

/**
 * Build one bounded receipt from an already-observed public-reader inspection.
 * @param {{candidateSha:string,host?:string,inspection:{commands:{state:string,entries:{namespace?:string}[]}},handshakeObservations?:Record<string,{evidence?:string}>}} input
 */
export function buildProbeReceipt({candidateSha,host="pi",inspection,handshakeObservations={}}){
 assert.ok(SHA.test(candidateSha??""),"probe receipt requires the exact 40-hex candidate SHA");
 assert.ok(inspection&&typeof inspection==="object"&&inspection.commands&&inspection.tools,
  "probe requires a public-reader inspection");
 for(const state of [inspection.commands.state,inspection.tools.state])
  assert.ok(PRESENCE_VOCABULARY.includes(state),`presence vocabulary violated: ${state}`);
 const names=[...new Set((inspection.tools.entries??[])
  .map(entry=>entry.namespace).filter(name=>typeof name==="string"&&name.length>0))].sort();
 const servers=names.map(name=>{
  const observation=handshakeObservations[name];
  if(observation!==undefined&&!(typeof observation.evidence==="string"&&observation.evidence.length>0))
   throw new Error(`a handshake claim for ${name} needs bounded evidence`);
  return {name,presence:"reported",
   connectivity:observation?"handshake-observed":"NONE",
   connectivityEvidence:observation?observation.evidence
    :"No public reader exposes a handshake or health observation for this server."};
 });
 const observed=servers.some(server=>server.connectivity==="handshake-observed");
 const report={
  schema:PROBE_SCHEMA,candidateSha,host,
  readers:{commands:inspection.commands.state,tools:inspection.tools.state},
  servers,
  verdict:observed?"HANDSHAKE_OBSERVED":"GAP",
  networkCalls:0,modelCalls:0,registryWrites:false,
  limitation:"Registered commands and tools prove configuration presence only. Connectivity is reported as NONE unless an admissible handshake observation exists; a GAP verdict states that public readers cannot distinguish a live server from a configured-but-unreachable one.",
 };
 validateProbeReceipt(report);
 return Object.freeze(report);
}

/** Offline CI-safe mode: no host means no observations, which is an honest GAP, never a guess. */
export function offlineInspection(){
 const empty={state:"unavailable",entries:[],limited:false};
 return {commands:{...empty},tools:{...empty},profiles:{...empty}};
}

function main(){
 const listing=spawnSync("git",["rev-parse","HEAD"],{cwd:process.cwd(),encoding:"utf8"});
 if(listing.status!==0)throw new Error(`git rev-parse failed: ${listing.stderr}`);
 const report=buildProbeReceipt({candidateSha:listing.stdout.trim(),inspection:offlineInspection()});
 console.log(JSON.stringify(report,null,"\t"));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main();}catch(error){console.error("INTEGRATION_PROBE_REJECTED: "+(error instanceof Error?error.message:"unknown"));
  process.exitCode=1;}
}
