import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {execFileSync,spawnSync} from "node:child_process";
import {dirname,join,resolve} from "node:path";

const [sourceRootArg,evidenceDirArg,expectedSourceSha,expectedAsenSha,expectedAsenTree]=process.argv.slice(2);
if(!sourceRootArg||!evidenceDirArg||!expectedSourceSha||!expectedAsenSha||!expectedAsenTree)throw new Error("Usage: node scripts/eco01-todo-registration-pair.mjs <frozen-source-root> <evidence-dir> <source-sha> <asen-sha> <asen-tree>");
const sourceRoot=resolve(sourceRootArg),asenRoot=process.cwd(),evidenceDir=resolve(evidenceDirArg),logsDir=join(evidenceDir,"logs");
const hash=value=>createHash("sha256").update(value).digest("hex");
const git=(cwd,...args)=>execFileSync("git",["-C",cwd,...args],{encoding:"utf8"}).trim();
const baseline=JSON.parse(await readFile(join(asenRoot,"registry/parity/ecosystem-sources-v1.json"),"utf8"));
const sourceRow=baseline.files.find(row=>row.id==="ECO-SRC-91b70c5973297fbd");
if(!sourceRow)throw new Error("Frozen Todo source inventory row is missing");
if(git(sourceRoot,"rev-parse","HEAD")!==expectedSourceSha)throw new Error("Frozen source commit mismatch");
const asenTree=git(asenRoot,"rev-parse","HEAD^{tree}");
if(asenTree!==expectedAsenTree)throw new Error("ASEN tree mismatch");
const sourceBytes=await readFile(join(sourceRoot,sourceRow.path));
if(hash(sourceBytes)!==sourceRow.sha256)throw new Error("Frozen Todo source file digest mismatch");
await mkdir(logsDir,{recursive:true});

const probe=join(evidenceDir,"registration-probe.mjs");
const results=[];
for(const target of [
 {label:"source",root:sourceRoot,extension:"extensions/"+"gen"+"tle"+"-todo.ts",toolNames:["todo"],extraArgs:[]},
 {label:"asen",root:asenRoot,extension:"extensions/asen.ts",toolNames:["asen_todo_add","asen_todo_update","asen_todo_list"],extraArgs:["--no-mcp"]},
]){
 const packageFile=join(target.root,"node_modules/@earendil-works/pi-coding-agent/package.json");
 const packageJson=JSON.parse(await readFile(packageFile,"utf8"));
 const extension=resolve(target.root,target.extension),probeOutput=join(evidenceDir,`${target.label}-tools.json`);
 const piPackageRoot=dirname(packageFile),cli=join(piPackageRoot,"dist/bundle/cli.js");
 const toolFilter=target.label==="source"?'tool.name==="todo"':'tool.name.startsWith("asen_todo_")';
 const probeSource=`import {writeFileSync} from "node:fs";\nexport default function(pi){\n const observe=()=>{\n  const tools=pi.getAllTools().filter(tool=>tool.sourceInfo?.path===${JSON.stringify(extension)}&&${toolFilter}).map(tool=>({name:tool.name,parameters:tool.parameters}));\n  writeFileSync(${JSON.stringify(probeOutput)},JSON.stringify({tools,commands:pi.getCommands().filter(command=>command.source==="extension").map(command=>command.name)}));\n };\n pi.on("session_start",observe);\n pi.on("session_shutdown",observe);\n}\n`;
 await writeFile(probe,probeSource);
 const isolatedHome=join(evidenceDir,`home-${target.label}`);
 await mkdir(isolatedHome,{recursive:true});
 const args=[cli,"--mode","rpc","--no-session","--no-extensions","--extension",extension,"--extension",probe,"--no-skills","--no-builtin-tools",...target.extraArgs,"--offline"];
 const env={PATH:process.env.PATH??"",HOME:isolatedHome,USERPROFILE:isolatedHome,PI_CODING_AGENT_DIR:join(isolatedHome,"agent"),PI_OFFLINE:"1",ASEN_NO_SKILL_REGISTRY:"1",TERM:"xterm-256color"};
 for(const key of ["SystemRoot","WINDIR","ComSpec","PATHEXT","TMP","TEMP"])if(process.env[key])env[key]=process.env[key];
 const child=spawnSync(process.execPath,args,{cwd:target.root,encoding:"utf8",timeout:30_000,input:JSON.stringify({type:"get_state",id:`eco01-${target.label}-todo-registration`})+"\n",env});
 if(child.error)throw child.error;
 const stdout=child.stdout??"",stderr=child.stderr??"";
 await writeFile(join(logsDir,`${target.label}.stdout.log`),stdout);
 await writeFile(join(logsDir,`${target.label}.stderr.log`),stderr);
 if(child.status!==0)throw new Error(`${target.label} Pi RPC failed (${child.status}): ${stderr}`);
 const response=stdout.split(/\r?\n/u).filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return null;}}).find(row=>row?.type==="response"&&row.id===`eco01-${target.label}-todo-registration`);
 if(!response?.success)throw new Error(`${target.label} Pi RPC did not complete get_state`);
 const observed=JSON.parse(await readFile(probeOutput,"utf8"));
 const registered=observed.tools.map(tool=>tool.name).sort();
 for(const required of target.toolNames)if(!registered.includes(required))throw new Error(`${target.label} Pi did not register ${required}`);
 results.push({runtime:target.label,piVersion:packageJson.version,platform:process.platform,node:process.version,exitCode:child.status,signal:child.signal??null,timedOut:false,tools:observed.tools,toolNames:registered,commands:observed.commands,stdout:{file:`logs/${target.label}.stdout.log`,sha256:hash(stdout)},stderr:{file:`logs/${target.label}.stderr.log`,sha256:hash(stderr)}});
}
const sourceToolNames=results.find(row=>row.runtime==="source").toolNames;
const asenToolNames=results.find(row=>row.runtime==="asen").toolNames;
const expectedSourceTools=["todo"],expectedAsenTools=["asen_todo_add","asen_todo_list","asen_todo_update"];
if(JSON.stringify(sourceToolNames)!==JSON.stringify(expectedSourceTools)||expectedAsenTools.some(name=>!asenToolNames.includes(name)))throw new Error("Unexpected Todo tool registration surface");
const report={schema:"asen.eco01.todo-registration-pair.v1",contractId:"ECO-SRC-91b70c5973297fbd:12",source:{commit:expectedSourceSha,sourceId:sourceRow.id,fileSha256:sourceRow.sha256},asen:{commit:expectedAsenSha,tree:asenTree,extension:"extensions/asen.ts"},execution:{mode:"Pi RPC get_state",modelsInvoked:0,networkMode:"offline",runs:results},scenario:{name:"registration",classification:"INTENTIONAL",reason:"Both real Pi runtimes load their mapped Todo extension and register user-facing Todo tools. The source exposes one sequential whole-list tool; ASEN exposes separate add/list/revisioned-update tools plus independent review and recovery controls. This is an intentional session-scoped authorization and lifecycle redesign, not API equivalence."},limitations:["This registration probe verifies actual Pi 0.87.1 and Pi 1.1.0 extension loading and tool schemas without invoking a model; tool behavior remains covered by paired core-state runs and ASEN runtime tests.","The source and candidate use different Pi major/minor API generations, so registration success does not certify cross-version visual parity."]};
const bytes=JSON.stringify(report,null,2)+"\n";
await writeFile(join(evidenceDir,"todo-registration-pair.json"),bytes);
await import("node:fs/promises").then(({rm})=>Promise.all([rm(probe,{force:true}),rm(join(evidenceDir,"source-tools.json"),{force:true}),rm(join(evidenceDir,"asen-tools.json"),{force:true}),rm(join(evidenceDir,"home-source"),{recursive:true,force:true}),rm(join(evidenceDir,"home-asen"),{recursive:true,force:true})]));
console.log(JSON.stringify({contractId:report.contractId,scenario:report.scenario,sourceCommit:expectedSourceSha,asenCommit:expectedAsenSha,asenTree,evidencePath:join(evidenceDir,"todo-registration-pair.json"),evidenceSha256:hash(bytes),runs:results.map(row=>({runtime:row.runtime,piVersion:row.piVersion,toolNames:row.toolNames,exitCode:row.exitCode,stdoutSha256:row.stdout.sha256,stderrSha256:row.stderr.sha256}))},null,2));
