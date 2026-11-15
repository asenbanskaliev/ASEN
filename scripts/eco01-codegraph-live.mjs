import {createHash} from "node:crypto";
import {execFileSync,spawnSync} from "node:child_process";
import {mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,symlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {createExecutionReceipt,createDifferentialPlan,assessPairedObservation} from "./eco01-differential-plan.mjs";

const script=fileURLToPath(import.meta.url),root=fileURLToPath(new URL("../",import.meta.url));
const sourceCommit="08de420ca29be16b6f6bee725a30b599b061df16";
const sha=value=>createHash("sha256").update(value).digest("hex");
const git=(cwd,...args)=>execFileSync("git",["-C",cwd,...args],{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:10_000}).trim();
const fail=message=>{throw new Error(message);};

async function child(sourceRoot,side,scenario,workspace){
 const mod=side==="source"?await import(pathToFileURL(join(sourceRoot,"extensions/codegraph-tools.ts")).href):undefined;
 let tool;const register=side==="source"?mod.registerCodeGraphTool:(await import("../src/interaction/code-intelligence.ts")).registerCodeGraphTool;
 register({registerTool(value){if(tool)fail("More than one CodeGraph tool was registered");tool=value;}});
 if(!tool||typeof tool.execute!=="function")fail("Registration did not expose an executable tool");
 const registration={name:tool.name,parameters:tool.parameters,annotations:tool.annotations??null,executionMode:tool.executionMode};
 const input={operation:"query",query:scenario==="invalid-input"?"   ":"greet",limit:3};
 try{
  const result=await tool.execute("eco01-live",input,undefined,undefined,{cwd:workspace});
  process.stdout.write(JSON.stringify({registration,result})+"\n");
 }catch(error){process.stdout.write(JSON.stringify({registration,thrown:{name:error?.name??"Error",message:String(error?.message??error)}})+"\n");}
}

function runSide(sourceRoot,side,scenario,workspace,binDir){
 const pathValue=`${binDir}${process.platform==="win32"?";":":"}${process.env.Path??process.env.PATH??""}`;
 const args=["--import","tsx",script,"--child",sourceRoot,side,scenario,workspace];
 const result=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,PATH:pathValue,Path:pathValue,CODEGRAPH_NO_DOWNLOAD:"1",CODEGRAPH_TELEMETRY:"0",DO_NOT_TRACK:"1"},encoding:"utf8",timeout:120_000,maxBuffer:1_000_000,windowsHide:true});
 if(result.error||result.status!==0)fail(`${side}/${scenario} wrapper failed: ${result.stderr||result.error?.message||result.status}`);
 const output=JSON.parse(result.stdout);
 return {command:{executable:process.execPath,args},environment:{platform:process.platform,nodeVersion:process.version,cwd:workspace,codegraphVersion:"1.6.2",telemetry:"disabled",downloads:"disabled"},exitCode:result.status,stdout:result.stdout,stderr:result.stderr??"",output};
}

function makeProject(parent,name){
 const path=join(parent,name);mkdirSync(path,{recursive:true});
 writeFileSync(join(path,"example.js"),'export function greet(name) { return `hello ${name}`; }\n');
 execFileSync("git",["init","-q","-b","main"],{cwd:path});
 execFileSync("git",["config","user.name","ECO-01 live fixture"],{cwd:path});
 execFileSync("git",["config","user.email","eco01@example.invalid"],{cwd:path});
 execFileSync("git",["add","example.js"],{cwd:path});
 execFileSync("git",["commit","-q","-m","fixture"],{cwd:path});
 return realpathSync(path);
}

function indexProject(binDir,workspace){
 const pathValue=`${binDir}${process.platform==="win32"?";":":"}${process.env.Path??process.env.PATH??""}`;
 const result=spawnSync(join(binDir,process.platform==="win32"?"codegraph.cmd":"codegraph"),["init","--yes",workspace],{cwd:workspace,env:{...process.env,PATH:pathValue,Path:pathValue,CODEGRAPH_NO_DOWNLOAD:"1",CODEGRAPH_TELEMETRY:"0",DO_NOT_TRACK:"1"},encoding:"utf8",timeout:120_000,maxBuffer:1_000_000,windowsHide:true});
 if(result.error||result.status!==0)fail(`Real CodeGraph initialization failed: ${result.stderr||result.error?.message||result.status}`);
 return {command:["codegraph","init","--yes",workspace],exitCode:result.status,stdout:result.stdout??"",stderr:result.stderr??""};
}

function state(workspace){
 const dir=join(workspace,".codegraph");
 try{
  const entries=["codegraph.db",".gitignore"].map(name=>{try{const bytes=readFileSync(join(dir,name));return {name,bytes:bytes.length,sha256:sha(bytes)};}catch{return {name,missing:true};}});
  return {indexDirectoryExists:true,entries};
 }catch{return {indexDirectoryExists:false,entries:[]};}
}

async function main(sourceRoot,evidenceDir,binDir){
 sourceRoot=resolve(sourceRoot);evidenceDir=resolve(evidenceDir);binDir=realpathSync(binDir);
 const plan=createDifferentialPlan(undefined,undefined,sourceRoot),edge=plan.contracts.find(row=>row.sourcePath==="extensions/codegraph-tools.ts"&&row.kind==="code-contract");
 if(!edge)fail("Frozen inventory has no CodeGraph code contract");
 const pkg=JSON.parse(readFileSync(join(binDir,"../@colbymchenry/codegraph/package.json"),"utf8"));
 if(pkg.version!=="1.6.2")fail("The real package must be CodeGraph 1.6.2 for this evidence run");
 const asenCommit=git(root,"rev-parse","HEAD");
 if(asenCommit!=="1cae8b74427358e96738b6223aed1583d6e6b361")fail("ASEN checkout is not the exact published candidate");
 const base=mkdtempSync(join(tmpdir(),"asen-eco01-real-codegraph-")),logDir=join(evidenceDir,"logs");mkdirSync(logDir,{recursive:true});
 const indexed=makeProject(base,"indexed"),invalid=makeProject(base,"invalid"),denied=makeProject(base,"denied"),corrupt=makeProject(base,"corrupt");
 const init=indexProject(binDir,indexed),corruptInit=indexProject(binDir,corrupt);
 const outside=join(base,"outside-index");mkdirSync(outside);symlinkSync(outside,join(denied,".codegraph"),"dir");
 writeFileSync(join(corrupt,".codegraph","codegraph.db"),"not a SQLite database\n");
 const scenarioRoots={normal:indexed,"invalid-input":invalid,denied, "partial-failure":corrupt,restart:indexed};
 const observations=[];
 try{
  for(const scenario of ["normal","invalid-input","denied","partial-failure","restart"]){
   const workspace=scenarioRoots[scenario],before=state(workspace),runs=[];
   for(const side of ["source","asen"]){
    const raw=runSide(sourceRoot,side,scenario,workspace,binDir);
    const receipt=createExecutionReceipt({contractId:edge.id,scenario,commit:side==="source"?plan.baselineCommit:asenCommit,command:raw.command,environment:raw.environment,exitCode:raw.exitCode,stdout:raw.stdout,stderr:raw.stderr,output:raw.output});
    const prefix=`${edge.id.replaceAll(":","-")}-${scenario}-${side}`;
    writeFileSync(join(logDir,prefix+".stdout.log"),raw.stdout);writeFileSync(join(logDir,prefix+".stderr.log"),raw.stderr);
    runs.push({receipt,registration:raw.output.registration,outcome:raw.output.result??raw.output.thrown});
   }
   const behaviorSame=JSON.stringify(runs[0].outcome)===JSON.stringify(runs[1].outcome);
   const registrationDifference=JSON.stringify(runs[0].registration.annotations)!==JSON.stringify(runs[1].registration.annotations);
   const status=behaviorSame?(registrationDifference?"INTENTIONAL":"EQUIVALENT"):"DIVERGENT";
   const difference={summary:behaviorSame?(registrationDifference?"The real CLI behavior matches; only the host annotation metadata differs.":"The real CLI behavior and registrations match."):"The real CLI produced a differing observable result."};
   const reason=status==="INTENTIONAL"?"ASEN adds conservative Pi annotations for the mutating init operation; the source registration omits those host hints. No additional write authority is granted.":undefined;
   const assessment=assessPairedObservation(plan,{contractId:edge.id,scenario,status,asenCommit,sourceReceipt:runs[0].receipt,asenReceipt:runs[1].receipt,difference,...(reason?{reason}:{}),limitations:["Executed real npm package @colbymchenry/codegraph@1.6.2 with network fallback and telemetry disabled.","Linux only; package version is a current dynamic runtime, not a frozen dependency lock."]});
   observations.push({scenario,status,assessment,behaviorSame,registrationDifference,before,after:state(workspace),sourceReceipt:runs[0].receipt,asenReceipt:runs[1].receipt});
  }
  const report={schema:"asen.eco01.codegraph-live-evidence.v1",contractId:edge.id,source:{commit:plan.baselineCommit,path:edge.sourcePath,fileSha256:edge.sourceSha256,span:edge.sourceSpan},asen:{commit:asenCommit,branch:git(root,"branch","--show-current"),targetPaths:["src/interaction/code-intelligence.ts","extensions/asen.ts"]},runtime:{package:"@colbymchenry/codegraph",version:pkg.version,registry:"https://registry.npmjs.org/@colbymchenry/codegraph",packageIntegrity:"sha512-hODH/mGnCf3IUMs6rzktv/zbecJIKJfdZAYHZ9mqecb0G7ZkHaA8CZafDVnswANFEL1YFcG+lfAwc5SIXzUH6Q==",packageShasum:"372b7b4f0190197b07d444116d6692240883a2d5",platform:process.platform,nodeVersion:process.version,telemetryEnabled:false,networkFallbackEnabled:false,realInit:{indexedProject:init,corruptProject:corruptInit}},summary:{scenarios:observations.length,pairedProcessRuns:observations.length*2,results:Object.fromEntries(["EQUIVALENT","DIVERGENT","INTENTIONAL","NOT_APPLICABLE","UNVERIFIED"].map(k=>[k,observations.filter(o=>o.status===k).length])),overallStatus:observations.some(o=>o.status==="DIVERGENT")?"DIVERGENT":"UNVERIFIED"},observations};
  writeFileSync(join(evidenceDir,"codegraph-live-evidence.json"),JSON.stringify(report,null,2)+"\n");
  process.stdout.write(JSON.stringify({contractId:edge.id,asenCommit,sourceCommit:plan.baselineCommit,package:pkg.version,scenarios:report.summary.results,overallStatus:report.summary.overallStatus,evidenceDir})+"\n");
 }finally{rmSync(base,{recursive:true,force:true});}
}

if(process.argv[2]==="--child")await child(resolve(process.argv[3]),process.argv[4],process.argv[5],resolve(process.argv[6]));
else if(process.argv.length===5)await main(process.argv[2],process.argv[3],process.argv[4]);
else fail("Usage: node --import tsx scripts/eco01-codegraph-live.mjs <exact-source-checkout> <evidence-dir> <codegraph-bin-dir>");
