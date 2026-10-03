import {execFileSync} from "node:child_process";
import {existsSync,readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {loadCheckedInMemoryParity,validateMemoryParity} from "./audit-memory-parity.mjs";

const root=fileURLToPath(new URL("../",import.meta.url));
const memoryManifestPath="registry/parity/memory-upstream-v3.json";
const observationWriteManifestPath="registry/parity/memory-observation-write-contracts-v1.json";
const retrievalSearchManifestPath="registry/parity/memory-retrieval-search-contracts-v1.json";
const contextTimelineManifestPath="registry/parity/memory-context-timeline-contracts-v1.json";
const projectIdentityManifestPath="registry/parity/memory-project-identity-contracts-v1.json";
const sessionTransportManifestPath="registry/parity/memory-session-transport-contracts-v1.json";
const sessionStoreManifestPath="registry/parity/memory-session-store-contracts-v1.json";
const memoryManifest=loadCheckedInMemoryParity(root);
const provenanceIssues=validateMemoryParity(memoryManifest);
if(provenanceIssues.length){
 console.error(`Invalid provenance manifest ${memoryManifestPath}:\n${provenanceIssues.join("\n")}`);
 process.exit(1);
}
const referenceName=memoryManifest.targets[0].repository.split("/").at(-1);
const forbidden=new RegExp(["gen"+"tle","gen"+"tleman",referenceName].filter(Boolean).join("|"),"i");
const provenanceAllowlist=new Set([
 "registry/parity/skill-sources-v1.json",memoryManifestPath,"registry/parity/memory-foundation-contracts-v1.json",
 observationWriteManifestPath,retrievalSearchManifestPath,contextTimelineManifestPath,projectIdentityManifestPath,
 sessionTransportManifestPath,sessionStoreManifestPath
]);
const tracked=execFileSync("git",["ls-files","-z"],{cwd:root}).toString("utf8").split("\0").filter(Boolean);
const preStageCandidates=[
 "scripts/audit-memory-parity.mjs","tests/memory-parity-reference.test.ts",observationWriteManifestPath,
 retrievalSearchManifestPath,contextTimelineManifestPath,projectIdentityManifestPath,sessionTransportManifestPath,
 sessionStoreManifestPath
];
const paths=[...new Set([...tracked,...preStageCandidates.filter(path=>existsSync(new URL(`../${path}`,import.meta.url)))])];
const violations=[];
for(const path of paths){
 if(forbidden.test(path)){violations.push(path);continue;}
 if(provenanceAllowlist.has(path))continue;
 const bytes=readFileSync(new URL(`../${path.split("/").map(encodeURIComponent).join("/")}`,import.meta.url));
 if(bytes.includes(0))continue;
 let content;
 try{content=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{continue;}
 if(forbidden.test(content))violations.push(path);
}
if(violations.length){console.error("External reference in tracked tree:\n"+violations.join("\n"));process.exit(1);}
console.log(`tracked boundary: PASS (${paths.length} tracked or exact pre-staging paths)`);
