import {execFileSync} from "node:child_process";
import {existsSync,readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {loadCheckedInMemoryParity,validateMemoryParity} from "./audit-memory-parity.mjs";
import {additionalParityFixturePaths} from "./memory-parity/additional-slices.mjs";
import {isPinnedReferenceDocument,maskApprovedReferenceTokens,coincideHuellaGit} from "./upstream-reference-policy.mjs";

const root=fileURLToPath(new URL("../",import.meta.url));
const memoryManifestPath="registry/parity/memory-upstream-v3.json";
const observationWriteManifestPath="registry/parity/memory-observation-write-contracts-v1.json";
const retrievalSearchManifestPath="registry/parity/memory-retrieval-search-contracts-v1.json";
const contextTimelineManifestPath="registry/parity/memory-context-timeline-contracts-v1.json";
const projectIdentityManifestPath="registry/parity/memory-project-identity-contracts-v1.json";
const sessionTransportManifestPath="registry/parity/memory-session-transport-contracts-v1.json";
const sessionStoreManifestPath="registry/parity/memory-session-store-contracts-v1.json";
const passiveCaptureManifestPath="registry/parity/memory-passive-capture-contracts-v1.json";
const relationManifestPath="registry/parity/memory-relation-contracts-v1.json";
const memoryManifest=loadCheckedInMemoryParity(root);
const provenanceIssues=validateMemoryParity(memoryManifest);
if(provenanceIssues.length){
 console.error(`Invalid provenance manifest ${memoryManifestPath}:\n${provenanceIssues.join("\n")}`);
 process.exit(1);
}
const referenceName=memoryManifest.targets[0].repository.split("/").at(-1);
const forbidden=new RegExp(["gen"+"tle","gen"+"tleman",referenceName].filter(Boolean).join("|"),"i");
const provenanceAllowlist=new Set([
 "registry/parity/skill-sources-v1.json","registry/parity/agent-ab-baselines-v1.json",
 "registry/parity/shell-asen-baseline-v1.json","registry/parity/ecosystem-sources-v1.json","registry/parity/ecosystem-media-v1.json",memoryManifestPath,"registry/parity/memory-foundation-contracts-v1.json",
 observationWriteManifestPath,retrievalSearchManifestPath,contextTimelineManifestPath,projectIdentityManifestPath,
 sessionTransportManifestPath,sessionStoreManifestPath,passiveCaptureManifestPath,relationManifestPath,
 "docs/audit/evidence/eco01-todo-live-b1f028ce2dde27757a901cd8722a4fe5ee27565f-r3/todo-pair-evidence.json",
 "docs/audit/evidence/eco01-todo-live-b1f028ce2dde27757a901cd8722a4fe5ee27565f-r3/source-tests.log",
 "docs/audit/evidence/eco01-todo-authorization-live-2e8444c42429102a2294e86fd9277963c8850353/todo-authorization-pair.json",
 "docs/audit/evidence/eco01-todo-registration-live-c21106c27028af580a7b8ddbb2fb8b831c959bda/logs/source.stdout.log",
 "docs/audit/evidence/eco01-todo-registration-live-c21106c27028af580a7b8ddbb2fb8b831c959bda/asen-full-check.log",
 ...additionalParityFixturePaths
]);
const tracked=execFileSync("git",["ls-files","-z"],{cwd:root}).toString("utf8").split("\0").filter(Boolean);
const preStageCandidates=[
 "scripts/audit-memory-parity.mjs","tests/memory-parity-reference.test.ts",observationWriteManifestPath,
 retrievalSearchManifestPath,contextTimelineManifestPath,projectIdentityManifestPath,sessionTransportManifestPath,
 sessionStoreManifestPath,passiveCaptureManifestPath,relationManifestPath,
 "scripts/memory-parity/additional-slices.mjs","scripts/memory-parity/writer-a/index.mjs",
 "scripts/memory-parity/writer-b/index.mjs","tests/memory-parity-composition.test.ts",...additionalParityFixturePaths
];
const paths=[...new Set([...tracked,...preStageCandidates.filter(path=>existsSync(new URL(`../${path}`,import.meta.url)))])];
// These registered ODD parity documents are deliberately human-readable
// upstream provenance, never executable source or imported runtime content.
// Keep all other code/docs subject to the original external-reference scan.
const pinnedParityPlanDocs=new Set([
 "odd/tasks/equivalencia-funcional-agentes-full.md",
 "odd/tasks/"+"gen"+"tle-shell-v4.6.0-paridad-ui-odd.md",
 "odd/tasks/pi-capability-completion.md",
 "odd/tasks/shell-rea-megabatch.md",
 "odd/tasks/w5-applied-research-and-hardening.md",
 // ASEN-vs-GentleShell comparative studies (2026-11-14): human-readable provenance
 // documenting the adaptation baseline, never executable source or imported content.
 "docs/estudio-comparativo-y-propuesta-optima-sistemica.md",
 "odd/evidence/asen-vs-"+"gen"+"tle-shell-difference-map.md",
 "odd/evidence/asen-vs-"+"gen"+"tle-shell-plain-language-and-adaptation.md",
 "odd/evidence/"+"gen"+"tle-shell-v4.8.0-delta-reconciliation.md",
 "odd/tasks/asen-startup-and-conversation-view.md",
 "odd/tasks/asen-command-registry-and-review-receipts.md",
 // Matriz canónica de aceptación de los 18 objetivos y 12 puntos: documento
 // de auditoría, sin importación por el código de ejecución.
 "odd/tasks/flujo-agentes-18-objetivos-12-puntos-aceptacion-20261123.md",
 // INDEX.md only enumerates parity-document filenames already pinned above; a
 // catalog of references is not itself an upstream dependency.
 "odd/archive/2026-11/INDEX-inventario-2026-11-14.md",
 "odd/tasks/INDEX.md",
 // This scanner necessarily embeds the forbidden pattern it enforces.
 "scripts/audit-upstream-boundary.mjs",
]);

// Excepción estricta para una comprobación pública de referencias P16.
// Solo estos bytes ya auditados pueden citar la referencia externa; cambiar
// cualquier archivo invalida su huella y bloquea CI hasta nueva auditoría.
const pinnedBenchmarkBlobs=new Map([
 // P16 ya existente: solo estos dos blobs exactos están aprobados.
 // Cualquier cambio de un solo byte debe bloquear arquitectura y revisarse.
 [".github/workflows/asen-p16-comparacion-real.yml","78c829c5ab1f626cf9c09887c9b76893e7aaecdb"],
 ["scripts/p16-comparacion-real.mjs","82b2885600f9dcf41ea7c02685d3aac5e9db7ee9"],
 [".github/workflows/asen-p16-gentle-referencia.yml","e72ea4bdacc0e058f18062200d388d6f858f50bb"],
 ["scripts/p16-comprobar-referencia.mjs","6a61fed8d97817b93aba0fa00ce8bf4e164e32d8"],
 ["tests/p16-comprobar-referencia.test.mjs","380c7da9159ba85b18d24ed642a2a0a20bb0d55e"]
]);

const violations=[];
for(const path of paths){
 const expectedBenchmarkBlob=pinnedBenchmarkBlobs.get(path);
 if(expectedBenchmarkBlob){
  const bytes=readFileSync(new URL(`../${path.split("/").map(encodeURIComponent).join("/")}`,import.meta.url));
  if(!coincideHuellaGit(bytes,expectedBenchmarkBlob,path,root))violations.push(path);
  continue;
 }
 if(pinnedParityPlanDocs.has(path)||isPinnedReferenceDocument(path))continue;
 if(forbidden.test(path)){violations.push(path);continue;}
 if(provenanceAllowlist.has(path))continue;
 const bytes=readFileSync(new URL(`../${path.split("/").map(encodeURIComponent).join("/")}`,import.meta.url));
 if(bytes.includes(0))continue;
 let content;
 try{content=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{continue;}
 if(forbidden.test(maskApprovedReferenceTokens(path,content)))violations.push(path);
}
if(violations.length){console.error("External reference in tracked tree:\n"+violations.join("\n"));process.exit(1);}
console.log(`tracked boundary: PASS (${paths.length} tracked or exact pre-staging paths)`);
