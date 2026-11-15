import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {lstatSync,readFileSync,realpathSync} from "node:fs";
import {isAbsolute,relative,resolve,sep} from "node:path";
import {fileURLToPath} from "node:url";

const load=name=>JSON.parse(readFileSync(new URL("../registry/parity/"+name,import.meta.url),"utf8"));
const sha40=x=>typeof x==="string"&&/^[a-f0-9]{40}$/.test(x);
const sha64=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const hash=value=>createHash("sha256").update(value).digest("hex");
const inside=(root,path)=>{const rel=relative(root,path);return rel===""||(!rel.startsWith(".."+sep)&&rel!==".."&&!isAbsolute(rel));};
const families={
 "code-contract":["registration","normal","invalid-input","denied","partial-failure","restart"],
 "tracked-file":["present","missing","malformed","changed"],
 "tracked-glob":["empty","single-child","multiple-children","nested-child","changed"],
 "external-runtime":["available","missing","malformed","denied","partial-failure","restart"],
};
const statuses=["EQUIVALENT","DIVERGENT","INTENTIONAL","NOT_APPLICABLE","UNVERIFIED"];
const scenariosFor=row=>row.mappingKind==="code-contract"&&row.sourceId==="ECO-SRC-91b70c5973297fbd"?[...families[row.mappingKind],"duplicate-request","clear-and-archive"]:families[row.mappingKind];

export function verifyFrozenSourceCheckout(baseline,mapping,sourceRoot){
 if(!sha40(baseline?.commit)||mapping?.baselineCommit!==baseline.commit||typeof sourceRoot!=="string"||!sourceRoot)throw Error("Frozen source checkout identity is required");
 const root=realpathSync(sourceRoot),commit=execFileSync("git",["-C",root,"rev-parse","--verify","HEAD^{commit}"],{encoding:"utf8"}).trim(),dirty=execFileSync("git",["-C",root,"status","--porcelain"],{encoding:"utf8"}).trim();
 if(commit!==baseline.commit||dirty)throw Error("Frozen source checkout must be exact and clean");
 const files=new Map(baseline.files.map(file=>[file.id,file])),verifiedFiles=new Set();
 for(const row of mapping.mappings){
  const file=files.get(row.sourceId);if(!file)throw Error("Mapped source object is absent from the frozen inventory: "+row.sourceId);
  const target=resolve(root,file.path);if(!inside(root,target)||!inside(root,realpathSync(target))||lstatSync(target).isSymbolicLink())throw Error("Mapped source path escapes the frozen checkout: "+file.path);
  const bytes=readFileSync(target);if(bytes.byteLength!==file.bytes||hash(bytes)!==file.sha256)throw Error("Frozen source file bytes differ from the inventory: "+file.path);
  const lines=bytes.toString("utf8").split(/(?<=\n)/);if(!Number.isSafeInteger(row.span?.startLine)||!Number.isSafeInteger(row.span?.endLine)||row.span.startLine<1||row.span.endLine<row.span.startLine||row.span.endLine>lines.length||hash(lines.slice(row.span.startLine-1,row.span.endLine).join(""))!==row.span.sha256)throw Error("Frozen source span differs from the inventory: "+file.path+":"+row.span?.startLine);
  verifiedFiles.add(file.path);
 }
 return {commit,clean:true,verifiedFiles:verifiedFiles.size,verifiedEdges:mapping.mappings.length};
}

export function createDifferentialPlan(baseline=load("ecosystem-sources-v1.json"),mapping=load("ecosystem-runtime-edge-mappings-v1.json"),sourceRoot){
 if(!sha40(baseline?.commit)||mapping?.baselineCommit!==baseline.commit||!Array.isArray(baseline.files)||!Array.isArray(mapping.mappings))throw Error("Invalid frozen source identity");
 const files=new Map(baseline.files.map(file=>[file.id,file])),seen=new Set();
 const contracts=mapping.mappings.map(row=>{
  const id=row.sourceId+":"+row.referenceIndex,file=files.get(row.sourceId),reference=file?.references?.[row.referenceIndex],scenarios=scenariosFor(row);
  if(seen.has(id)||!file||file.objectId!==row.objectId||file.sha256!==row.sha256||file.bytes!==row.bytes||!reference||!sha64(row.span?.sha256)||!scenarios)throw Error("Unbound or duplicate source edge: "+id);
  seen.add(id);
  return {id,sourcePath:file.path,sourceSha256:file.sha256,sourceSpan:{startLine:row.span.startLine,endLine:row.span.endLine,sha256:row.span.sha256},reference,kind:row.mappingKind,reason:row.mappingReason,targets:row.targets,scenarios:scenarios.map(name=>({name,status:"UNVERIFIED",evidence:null}))};
 });
 return {schema:"asen.eco01.differential-plan.v2",baselineCommit:baseline.commit,sourceVerification:sourceRoot?verifyFrozenSourceCheckout(baseline,mapping,sourceRoot):null,contracts};
}

const receiptBody=receipt=>({schema:receipt.schema,contractId:receipt.contractId,scenario:receipt.scenario,commit:receipt.commit,command:receipt.command,environment:receipt.environment,exitCode:receipt.exitCode,stdout:receipt.stdout,stderr:receipt.stderr,output:receipt.output});
export function createExecutionReceipt({contractId,scenario,commit,command,environment,exitCode,stdout,stderr,output}){
 const receipt={schema:"asen.eco01.execution-receipt.v1",contractId,scenario,commit,command,environment,exitCode,stdout,stderr,output};
 receipt.stdoutSha256=hash(stdout);
 receipt.stderrSha256=hash(stderr);
 receipt.outputSha256=hash(JSON.stringify(output));
 receipt.logSha256=hash(stdout+"\n"+stderr);
 receipt.receiptSha256=hash(JSON.stringify({...receiptBody(receipt),stdoutSha256:receipt.stdoutSha256,stderrSha256:receipt.stderrSha256,outputSha256:receipt.outputSha256,logSha256:receipt.logSha256}));
 return receipt;
}

function validateReceipt(receipt,{contractId,scenario,commit}){
 if(!receipt||receipt.schema!=="asen.eco01.execution-receipt.v1"||receipt.contractId!==contractId||receipt.scenario!==scenario||receipt.commit!==commit||
  !receipt.command||typeof receipt.command.executable!=="string"||!receipt.command.executable||!Array.isArray(receipt.command.args)||receipt.command.args.some(x=>typeof x!=="string")||"shell" in receipt.command||
  !receipt.environment||typeof receipt.environment.platform!=="string"||typeof receipt.environment.nodeVersion!=="string"||typeof receipt.environment.cwd!=="string"||
  !Number.isInteger(receipt.exitCode)||typeof receipt.stdout!=="string"||typeof receipt.stderr!=="string"||receipt.output===undefined)throw Error("Complete execution receipts bound to exact commits and scenarios are required");
 const expected=createExecutionReceipt(receipt);
 for(const key of ["stdoutSha256","stderrSha256","outputSha256","logSha256","receiptSha256"])if(!sha64(receipt[key])||receipt[key]!==expected[key])throw Error("Execution receipt hash mismatch: "+key);
 return receipt;
}

export function assessPairedObservation(plan,item){
 const contract=plan?.contracts?.find(c=>c.id===item?.contractId),scenario=contract?.scenarios?.find(s=>s.name===item?.scenario);
 if(plan?.schema!=="asen.eco01.differential-plan.v2"||!contract||!scenario||!statuses.includes(item.status))throw Error("Invalid differential observation");
 if(item.status==="UNVERIFIED")return {contractId:contract.id,scenario:item.scenario,status:item.status,observationValid:false,admitted:false};
 if(item.status==="NOT_APPLICABLE"){
  if(typeof item.reason!=="string"||item.reason.trim().length<24)throw Error("A contract-specific applicability rationale is required");
  return {contractId:contract.id,scenario:item.scenario,status:item.status,reason:item.reason.trim(),observationValid:true,admitted:false};
 }
 if(!sha40(item.asenCommit)||!item.difference||typeof item.difference.summary!=="string"||item.difference.summary.trim().length<8||!Array.isArray(item.limitations))throw Error("Exact ASEN SHA, observed difference, and limitations are required");
 const source=validateReceipt(item.sourceReceipt,{contractId:contract.id,scenario:item.scenario,commit:plan.baselineCommit});
 const asen=validateReceipt(item.asenReceipt,{contractId:contract.id,scenario:item.scenario,commit:item.asenCommit});
 const same=source.exitCode===asen.exitCode&&source.exitCode===0&&source.outputSha256===asen.outputSha256&&source.stdoutSha256===asen.stdoutSha256&&source.stderrSha256===asen.stderrSha256&&source.environment.platform===asen.environment.platform&&source.environment.nodeVersion===asen.environment.nodeVersion;
 if(item.status==="EQUIVALENT"&&!same)throw Error("Observation contradicts the paired execution receipts");
 if(item.status==="DIVERGENT"&&same)throw Error("A divergent result requires an observed output or execution failure difference");
 if(item.status==="INTENTIONAL"&&(same||typeof item.reason!=="string"||item.reason.trim().length<24))throw Error("Intentional differences require a real divergence and a contract-specific rationale");
 return {contractId:contract.id,scenario:item.scenario,status:item.status,sourceReceiptSha256:source.receiptSha256,asenReceiptSha256:asen.receiptSha256,difference:item.difference,reason:item.reason?.trim(),limitations:item.limitations,observationValid:true,admitted:false};
}

if(process.argv[1]===fileURLToPath(import.meta.url))process.stdout.write(JSON.stringify(createDifferentialPlan(undefined,undefined,process.argv[2]??process.env.ASEN_ECO01_SOURCE_DIR),null,2)+"\n");
