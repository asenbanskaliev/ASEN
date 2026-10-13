import {existsSync,readFileSync,readdirSync,statSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {validateEco07ProviderSelection} from "./eco07-provider-config.mjs";

const OPERATING_SYSTEMS=Object.freeze(["ubuntu-24.04","macos-15","windows-2025"]);
const PI_PACKAGE="@earendil-works/pi-coding-agent";
const REQUIRED_FILES=Object.freeze([
 "package.json",
 "package-lock.json",
 "extensions/asen.ts",
 "scripts/eco07-provider-config.mjs",
 "scripts/eco07-pi-recovery-e2e.mjs",
 "scripts/eco07-pi-recovery-probe-extension.mjs",
 "src/runtime/eco07-provider-failure.ts",
 "src/runtime/task-replay.ts",
 "docs/audit/eco07-closure-evidence-2026-10-12.md",
]);
export const ECO07_RECOVERY_CONTRACT=Object.freeze({
 operatingSystems:OPERATING_SYSTEMS,
 repository:"asenbanskaliev/ASEN",
 pullRequest:32,
 baseBranch:"main",
 branch:"feat/strict-parity-prerequisites",
 eventLabel:"eco07:run-ubuntu",
 nodeVersion:"22.19.0",
 piVersion:"1.1.0",
 piIntegrity:"sha512-SeEi/4hdcHNgA9UWlefZl7ZZpm3dzi2OoxNjDHsBJ9o298LNOtbL4DGKgitlEj6uCTccvtw6f2hlCkTPVJ2RXg==",
 provider:"groq",
 model:"openai/gpt-oss-120b",
 evidenceDirectory:"eco07-pi-evidence",
 requiredFiles:REQUIRED_FILES,
});
const SHA_PATTERN=/^[0-9a-f]{40}$/u;

function jsonFile(filename,noun){
 try{return JSON.parse(readFileSync(filename,"utf8"));}
 catch{throw new Error(`ECO-07 ${noun} is unavailable or malformed`);}
}
function gitDirectory(repository){
 const marker=path.join(repository,".git"),metadata=statSync(marker);
 if(metadata.isDirectory())return marker;
 if(!metadata.isFile())throw new Error("ECO-07 checkout Git metadata is unavailable");
 const match=/^gitdir:\s*(.+)\s*$/u.exec(readFileSync(marker,"utf8"));
 if(!match)throw new Error("ECO-07 checkout Git metadata is malformed");
 return path.resolve(repository,match[1]);
}
function commonGitDirectory(directory){
 const marker=path.join(directory,"commondir");
 return existsSync(marker)?path.resolve(directory,readFileSync(marker,"utf8").trim()):directory;
}
function readRef(directory,reference){
 for(const root of new Set([directory,commonGitDirectory(directory)])){
  const loose=path.join(root,...reference.split("/"));
  if(existsSync(loose))return readFileSync(loose,"utf8").trim();
  const packed=path.join(root,"packed-refs");
  if(existsSync(packed)){
   const row=readFileSync(packed,"utf8").split(/\r?\n/u).find(line=>line.endsWith(` ${reference}`));
   if(row)return row.slice(0,40);
  }
 }
 throw new Error("ECO-07 checked-out HEAD reference is unavailable");
}
function readHead(repository){
 const directory=gitDirectory(repository),head=readFileSync(path.join(directory,"HEAD"),"utf8").trim();
 if(SHA_PATTERN.test(head))return head;
 const match=/^ref:\s*(refs\/.+)$/u.exec(head);
 if(!match)throw new Error("ECO-07 checked-out HEAD is malformed");
 return readRef(directory,match[1]);
}
function localPath(repository,filename,noun){
 const relative=path.relative(repository,filename);
 if(relative.startsWith("..")||path.isAbsolute(relative)||!existsSync(filename))throw new Error(`ECO-07 repository-local ${noun} is unavailable`);
 return relative.replaceAll("\\","/");
}

export function observeEco07RecoveryCheckout(repository){
 const evidencePath=path.join(repository,ECO07_RECOVERY_CONTRACT.evidenceDirectory);
 const exists=existsSync(evidencePath),isDirectory=exists&&statSync(evidencePath).isDirectory();
 return Object.freeze({
  head:readHead(repository),
  missingFiles:Object.freeze(REQUIRED_FILES.filter(file=>!existsSync(path.join(repository,file)))),
  evidenceDestination:Object.freeze({exists,isDirectory,entries:Object.freeze(isDirectory?readdirSync(evidencePath):[])}),
 });
}

/** Validate cheap checkout and trigger invariants without reading credentials or installed packages. */
export function validateEco07RecoveryBoundary(environment,observation){
 const triggerKind=environment.ASEN_TRIGGER_KIND;
 if(!["manual","pull_request"].includes(triggerKind))throw new Error("ECO-07 trigger kind is not approved");
 if(environment.ASEN_REPOSITORY!==ECO07_RECOVERY_CONTRACT.repository)throw new Error("ECO-07 repository is not approved");
 if(environment.ASEN_RUN_ATTEMPT!=="1")throw new Error("ECO-07 run attempt is not approved");
 const operatingSystem=environment.ASEN_SELECTED_OS;
 if(!OPERATING_SYSTEMS.includes(operatingSystem))throw new Error("ECO-07 operating system is not approved");
 const candidate=environment.ASEN_EXPECTED_SHA;
 if(typeof candidate!=="string"||!SHA_PATTERN.test(candidate))throw new Error("ECO-07 expected SHA must be an exact 40-character commit identity");
 const githubSha=environment.ASEN_GITHUB_SHA;
 if(typeof githubSha!=="string"||!SHA_PATTERN.test(githubSha))throw new Error("ECO-07 GitHub SHA is malformed");
 const eventHeadSha=environment.ASEN_EVENT_HEAD_SHA;
 if(typeof eventHeadSha!=="string"||!SHA_PATTERN.test(eventHeadSha)||eventHeadSha!==candidate)throw new Error("ECO-07 event head SHA does not match expected SHA");
 if(observation.head!==candidate)throw new Error("ECO-07 checked-out HEAD does not match expected SHA");
 if(environment.ASEN_EXPECTED_BRANCH!==ECO07_RECOVERY_CONTRACT.branch)throw new Error("ECO-07 approved branch is incorrect");
 if(triggerKind==="manual"){
  if(githubSha!==candidate)throw new Error("ECO-07 GitHub SHA does not match expected SHA");
  if(environment.ASEN_DISPATCH_BRANCH!==ECO07_RECOVERY_CONTRACT.branch)throw new Error("ECO-07 dispatch branch is not approved");
 }else{
  if(operatingSystem!=="ubuntu-24.04")throw new Error("ECO-07 pull request route is Ubuntu-only");
  if(githubSha===candidate)throw new Error("ECO-07 pull request GitHub SHA must remain the event merge SHA");
  if(environment.ASEN_PR_NUMBER!==String(ECO07_RECOVERY_CONTRACT.pullRequest))throw new Error("ECO-07 pull request number is not approved");
  if(environment.ASEN_PR_BASE_BRANCH!==ECO07_RECOVERY_CONTRACT.baseBranch)throw new Error("ECO-07 pull request base branch is not approved");
  if(environment.ASEN_PR_HEAD_REPOSITORY!==ECO07_RECOVERY_CONTRACT.repository)throw new Error("ECO-07 pull request head repository is not approved");
  if(environment.ASEN_PR_HEAD_BRANCH!==ECO07_RECOVERY_CONTRACT.branch)throw new Error("ECO-07 pull request head branch is not approved");
  if(environment.ASEN_EVENT_LABEL!==ECO07_RECOVERY_CONTRACT.eventLabel)throw new Error("ECO-07 pull request event label is not approved");
 }
 const selection=validateEco07ProviderSelection(environment);
 if(selection.provider!==ECO07_RECOVERY_CONTRACT.provider)throw new Error("ECO-07 provider is not pinned");
 if(selection.model!==ECO07_RECOVERY_CONTRACT.model)throw new Error("ECO-07 model is not pinned");
 if(observation.missingFiles.length)throw new Error(`ECO-07 required file is unavailable: ${observation.missingFiles.join(", ")}`);
 const destination=observation.evidenceDestination;
 if(!destination.exists||!destination.isDirectory)throw new Error("ECO-07 evidence directory must exist before preflight");
 if(destination.entries.length)throw new Error("ECO-07 evidence directory is not clean");
 return Object.freeze({triggerKind,operatingSystem,candidate,githubSha,eventHeadSha,branch:ECO07_RECOVERY_CONTRACT.branch,provider:selection.provider,model:selection.model,evidenceDirectory:ECO07_RECOVERY_CONTRACT.evidenceDirectory});
}
export const validateEco07RecoveryPreflight=validateEco07RecoveryBoundary;

function observeInstalledRuntime(repository,nodeVersion){
 const lock=jsonFile(path.join(repository,"package-lock.json"),"package lock"),packages=lock.packages;
 if(lock.lockfileVersion!==3||!packages||typeof packages!=="object")throw new Error("ECO-07 package lock is not lockfile version 3");
 const require=createRequire(path.join(repository,"package.json"));
 const piPackagePath=path.join(repository,"node_modules",...PI_PACKAGE.split("/"),"package.json");
 const pi=jsonFile(piPackagePath,"installed Pi package"),tsx=jsonFile(path.join(repository,"node_modules","tsx","package.json"),"installed tsx package"),typescript=jsonFile(path.join(repository,"node_modules","typescript","package.json"),"installed TypeScript package");
 const piEntrypoint=localPath(repository,require.resolve(PI_PACKAGE),"Pi entrypoint");
 const piCli=typeof pi.bin?.pi==="string"?localPath(repository,path.resolve(path.dirname(piPackagePath),pi.bin.pi),"Pi CLI entrypoint"):undefined;
 const tsxEntrypoint=localPath(repository,require.resolve("tsx"),"tsx entrypoint");
 const tsc=typeof typescript.bin?.tsc==="string"?localPath(repository,path.resolve(repository,"node_modules","typescript",typescript.bin.tsc),"TypeScript CLI"):undefined;
 return Object.freeze({nodeVersion,lockPi:packages[`node_modules/${PI_PACKAGE}`],lockTsx:packages["node_modules/tsx"],lockTypescript:packages["node_modules/typescript"],piVersion:pi.version,piEntrypoint,piCli,tsxVersion:tsx.version,tsxEntrypoint,typescriptVersion:typescript.version,tsc});
}
export function observeEco07InstalledRuntime(repository){return observeInstalledRuntime(path.resolve(repository),process.versions.node);}
/** Test-only observation seam; production always observes process.versions.node directly. */
export function observeEco07InstalledRuntimeForTest(repository,nodeVersion){return observeInstalledRuntime(path.resolve(repository),nodeVersion);}

export function validateEco07InstalledRuntime(observation){
 if(observation.nodeVersion!==ECO07_RECOVERY_CONTRACT.nodeVersion)throw new Error("ECO-07 actual Node version is not pinned");
 const lock=observation.lockPi;
 if(lock?.version!==ECO07_RECOVERY_CONTRACT.piVersion||lock.integrity!==ECO07_RECOVERY_CONTRACT.piIntegrity||!String(lock.resolved??"").endsWith("/pi-coding-agent-1.1.0.tgz"))throw new Error("ECO-07 lockfile Pi pin or integrity is invalid");
 if(observation.piVersion!==ECO07_RECOVERY_CONTRACT.piVersion||!observation.piEntrypoint||!observation.piCli)throw new Error("ECO-07 installed repository-local Pi runtime is invalid");
 if(observation.lockTsx?.version!==observation.tsxVersion||!observation.tsxEntrypoint)throw new Error("ECO-07 installed repository-local tsx runtime is invalid");
 if(observation.lockTypescript?.version!==observation.typescriptVersion||!observation.tsc)throw new Error("ECO-07 installed repository-local TypeScript runtime is invalid");
 return Object.freeze({nodeVersion:observation.nodeVersion,piVersion:observation.piVersion,piEntrypoint:observation.piEntrypoint,piCli:observation.piCli,tsxVersion:observation.tsxVersion,typescriptVersion:observation.typescriptVersion});
}

export function runEco07RecoveryBoundary(environment=process.env,repository=process.cwd()){
 return validateEco07RecoveryBoundary(environment,observeEco07RecoveryCheckout(path.resolve(repository)));
}
export function runEco07RecoveryPreflight(environment=process.env,repository=process.cwd()){
 return Object.freeze({...runEco07RecoveryBoundary(environment,repository),...validateEco07InstalledRuntime(observeEco07InstalledRuntime(repository))});
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const phase=process.argv[2];
  if(!["boundary","runtime"].includes(phase))throw new Error("Usage: eco07-pi-recovery-preflight.mjs boundary|runtime");
  const result=phase==="boundary"?runEco07RecoveryBoundary():validateEco07InstalledRuntime(observeEco07InstalledRuntime(process.cwd()));
  console.log(JSON.stringify({status:"PASS",phase,...result}));
 }catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
