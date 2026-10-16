import {execFileSync,spawnSync} from "node:child_process";
import {chmodSync,mkdirSync,mkdtempSync,rmSync,symlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {assessPairedObservation,createExecutionReceipt,createDifferentialPlan} from "./eco01-differential-plan.mjs";
import {registerCodeGraphTool as registerAsenCodeGraphTool} from "../src/interaction/code-intelligence.ts";

const scriptPath=fileURLToPath(import.meta.url),asenRoot=resolve(new URL("../",import.meta.url).pathname);
const fail=message=>{throw new Error(message);};

async function runSide({side,sourceRoot,scenario,root}){
 const source=side==="source"?await import(pathToFileURL(join(sourceRoot,"extensions/codegraph-tools.ts")).href):undefined;
 const register=side==="source"?source.registerCodeGraphTool:registerAsenCodeGraphTool;
 let tool;register({registerTool(registered){if(tool)fail("CodeGraph registered more than one tool");tool=registered;}});
 if(!tool||typeof tool.execute!=="function")fail("CodeGraph registration did not expose an executable tool");
 const registration={name:tool.name,label:tool.label,description:tool.description,renderShell:tool.renderShell,promptSnippet:tool.promptSnippet,promptGuidelines:tool.promptGuidelines,parameters:tool.parameters,executionMode:tool.executionMode,annotations:tool.annotations??null};
 const input=scenario==="invalid-input"?{operation:"query",query:"   "}:{operation:"query",query:scenario==="partial-failure"?"__ECO01_PARTIAL_FAILURE__":"--help; literal query",limit:3};
 try{
  const result=await tool.execute("eco01-codegraph",input,undefined,undefined,{cwd:root});
  process.stdout.write(JSON.stringify({registration,content:result.content,details:result.details})+"\n");
 }catch(error){process.stdout.write(JSON.stringify({registration,thrown:{name:error?.name??"Error",message:String(error?.message??error)}})+"\n");}
}

function invokeChild({sourceRoot,scenario,side,root,fakeBin}){
 const args=["--import","tsx",scriptPath,"--child",sourceRoot,scenario,side,root];
 const separator=process.platform==="win32"?";":":";
 const path=`${fakeBin}${separator}${process.env.Path??process.env.PATH??""}`;
 const child=spawnSync(process.execPath,args,{cwd:asenRoot,env:{...process.env,PATH:path,Path:path},encoding:"utf8",windowsHide:true,timeout:30000,maxBuffer:1_000_000});
 return {command:{executable:process.execPath,args},environment:{platform:process.platform,nodeVersion:process.version,cwd:root,simulatedCodegraphPath:fakeBin},exitCode:child.status??1,stdout:child.stdout??"",stderr:child.stderr??"",signal:child.signal,error:child.error};
}

async function main(sourceRoot,evidenceDir){
 const plan=createDifferentialPlan(undefined,undefined,sourceRoot),edge=plan.contracts.find(row=>row.sourcePath==="extensions/codegraph-tools.ts"&&row.kind==="code-contract");
 if(!edge)fail("The frozen inventory has no CodeGraph code-contract mapping");
 const asenCommit=execFileSync("git",["-C",asenRoot,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 execFileSync("git",["-C",asenRoot,"diff","--quiet","HEAD","--","src/interaction/code-intelligence.ts","extensions/asen.ts"],{stdio:"ignore",timeout:5000});
 const outputDir=resolve(evidenceDir);mkdirSync(join(outputDir,"logs"),{recursive:true});
 const scenarios=["normal","invalid-input","denied","partial-failure","restart"],observations=[];
 for(const scenario of scenarios){
  const root=mkdtempSync(join(tmpdir(),"asen-eco01-codegraph-"));
  try{
   execFileSync("git",["init","--quiet","-b","main"],{cwd:root});
   const fakeBin=join(root,"controlled-codegraph-bin");mkdirSync(fakeBin);
   const shim=join(fakeBin,process.platform==="win32"?"codegraph.cmd":"codegraph");
   const fakePackage=join(fakeBin,"node_modules","@colbymchenry","codegraph");mkdirSync(fakePackage,{recursive:true});
   writeFileSync(join(fakePackage,"package.json"),JSON.stringify({name:"@colbymchenry/codegraph",bin:{codegraph:"entry.js"}}));
   writeFileSync(join(fakePackage,"entry.js"),"const args=process.argv.slice(2);if(args.includes('__ECO01_PARTIAL_FAILURE__')){process.stderr.write('controlled failure\\n');process.exit(7)}process.stdout.write(require('fs').existsSync('.codegraph')?'controlled-index-present\\n':'controlled-index-result\\n');\\n");
   const shimText=process.platform==="win32"
    ?"@echo off\r\nnode -e \"const a=process.argv.slice(1);if(a.includes('__ECO01_PARTIAL_FAILURE__')){process.stderr.write('controlled failure');process.exit(7)}process.stdout.write(require('fs').existsSync('.codegraph')?'controlled-index-present':'controlled-index-result')\" %*\r\n"
    :"#!/bin/sh\ncase \"$*\" in *__ECO01_PARTIAL_FAILURE__*) printf 'controlled failure\\n' >&2; exit 7;; esac\nif [ -d .codegraph ]; then printf 'controlled-index-present\\n'; else printf 'controlled-index-result\\n'; fi\n";
   writeFileSync(shim,shimText);if(process.platform!=="win32")chmodSync(shim,0o755);
   if(scenario==="denied")symlinkSync(tmpdir(),join(root,".codegraph"),process.platform==="win32"?"junction":"dir");
   if(scenario==="restart")mkdirSync(join(root,".codegraph"));
   const paired=[];
   for(const side of ["source","asen"]){
    const run=invokeChild({sourceRoot,scenario,side,root,fakeBin});
    if(run.error||run.exitCode!==0)fail(`${side}/${scenario} child failed (${run.exitCode}): ${run.stderr||run.error?.message||"unknown"}`);
    const output=JSON.parse(run.stdout);
    const receipt=createExecutionReceipt({contractId:edge.id,scenario,commit:side==="source"?plan.baselineCommit:asenCommit,command:run.command,environment:run.environment,exitCode:run.exitCode,stdout:run.stdout,stderr:run.stderr,output});
    const prefix=`${edge.id.replaceAll(":","-")}-${scenario}-${side}`;
    writeFileSync(join(outputDir,"logs",prefix+".stdout.log"),run.stdout);
    writeFileSync(join(outputDir,"logs",prefix+".stderr.log"),run.stderr);
    paired.push(receipt);
   }
   const behavior=receipt=>{const {registration,...result}=receipt.output;return result;};
   const behaviorSame=JSON.stringify(behavior(paired[0]))===JSON.stringify(behavior(paired[1]));
   const intentionalAnnotations=paired[0].output.registration.annotations===null&&JSON.stringify(paired[1].output.registration.annotations)==="{\"readOnlyHint\":false,\"destructiveHint\":true,\"idempotentHint\":false,\"openWorldHint\":false}";
   const status=behaviorSame&&intentionalAnnotations?"INTENTIONAL":"UNVERIFIED";
   const reason=status==="INTENTIONAL"?"ASEN adds accurate Pi tool annotations for the existing mutating init operation; the frozen upstream registration omits those hints. This explicit host metadata is a deliberate transparency improvement and does not grant additional write authority.":undefined;
   const assessment=assessPairedObservation(plan,{contractId:edge.id,scenario,status,asenCommit,sourceReceipt:paired[0],asenReceipt:paired[1],difference:{summary:status==="INTENTIONAL"?"Only the registered tool annotation metadata differs; normalized content, errors, args, and outcomes match under the controlled executable.":"The controlled adapter outputs were not fully equal."},...(reason?{reason}:{}),limitations:["The CLI is a temporary controlled executable; actual CodeGraph package and index semantics remain unverified.","Only the current host OS was exercised."]});
   observations.push({scenario,executionKind:"controlled-external-process",status,assessment,behaviorSame,simulationObservation:status==="INTENTIONAL"?"intentional-annotation-difference; controlled behavior matches":behaviorSame?"same-behavior-under-simulation":"behavior-difference-under-simulation",...(reason?{reason}:{}),sourceReceipt:paired[0],asenReceipt:paired[1],limitation:"Both production extension registrations launched a temporary controlled codegraph executable. This checks tool registration, argv, error handling, and permission-denial behavior for this fixture, not compatibility with the actual CodeGraph package or persisted index contents; only this host OS was exercised."});
  }finally{rmSync(root,{recursive:true,force:true});}
 }
 const dirtyPaths=execFileSync("git",["-C",asenRoot,"status","--porcelain"],{encoding:"utf8"}).trim().split("\n").filter(Boolean);
 const report={schema:"asen.eco01.codegraph-pair-evidence.v1",contractId:edge.id,source:{repository:"frozen-source-inventory",commit:plan.baselineCommit,path:edge.sourcePath,fileSha256:edge.sourceSha256,span:edge.sourceSpan},asen:{repository:"asenbanskaliev/ASEN",commit:asenCommit,branch:execFileSync("git",["-C",asenRoot,"branch","--show-current"],{encoding:"utf8"}).trim(),targetPaths:["src/interaction/code-intelligence.ts","extensions/asen.ts"],targetPathsUnmodifiedFromCommit:true,worktreeDirtyPaths:dirtyPaths},environment:{platform:process.platform,nodeVersion:process.version,piRuntime:"1.1.0 dependency declared by ASEN; direct adapter test does not instantiate the Pi host"},summary:{scenarios:observations.length,pairedRuns:observations.length*2,overallStatus:"UNVERIFIED"},observations};
 writeFileSync(join(outputDir,"codegraph-pair-evidence.json"),JSON.stringify(report,null,2)+"\n");
 process.stdout.write(JSON.stringify({contractId:edge.id,sourceCommit:plan.baselineCommit,asenCommit,scenarios:observations.length,pairedRuns:observations.length*2,simulationObservations:observations.map(o=>({scenario:o.scenario,result:o.simulationObservation})),overallStatus:"UNVERIFIED",evidenceDir:outputDir})+"\n");
}

if(process.argv[2]==="--child")await runSide({sourceRoot:resolve(process.argv[3]),scenario:process.argv[4],side:process.argv[5],root:process.argv[6]});
else if(process.argv.length===4)await main(resolve(process.argv[2]),resolve(process.argv[3]));
else fail("Usage: node --import tsx scripts/eco01-codegraph-pair.mjs <exact-source-checkout> <evidence-directory>");
