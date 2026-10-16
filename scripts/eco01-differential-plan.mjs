import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../",import.meta.url));
const load=name=>JSON.parse(readFileSync(new URL("../registry/parity/"+name,import.meta.url),"utf8"));
const sha40=x=>typeof x==="string"&&/^[a-f0-9]{40}$/.test(x);
const sha64=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const scenarios=["normal","invalid-input","denied","partial-failure","restart"];
export function createDifferentialPlan(baseline=load("ecosystem-sources-v1.json"),mapping=load("ecosystem-runtime-edge-mappings-v1.json")){
 if(!sha40(baseline?.commit)||mapping?.baselineCommit!==baseline.commit||!Array.isArray(baseline.files)||!Array.isArray(mapping.mappings))throw Error("Invalid frozen source identity");
 const files=new Map(baseline.files.map(file=>[file.id,file])),seen=new Set();
 const contracts=mapping.mappings.map(row=>{
  const id=row.sourceId+":"+row.referenceIndex,file=files.get(row.sourceId);
  if(seen.has(id)||!file||file.objectId!==row.objectId||file.sha256!==row.sha256||file.bytes!==row.bytes||!file.references?.[row.referenceIndex]||!sha64(row.span?.sha256))throw Error("Unbound or duplicate source edge: "+id);
  seen.add(id);
  return {id,path:file.path,sourceSha256:file.sha256,reference:file.references[row.referenceIndex],kind:row.mappingKind,reason:row.mappingReason,targets:row.targets,scenarios:scenarios.map(name=>({name,status:"UNVERIFIED"}))};
 });
 return {schema:"asen.eco01.differential-plan.v1",baselineCommit:baseline.commit,contracts};
}
export function assessPairedObservation(plan,item){
 const contract=plan?.contracts?.find(c=>c.id===item?.contractId);
 if(plan?.schema!=="asen.eco01.differential-plan.v1"||!contract||!scenarios.includes(item.scenario)||!["EQUIVALENT","DIVERGENT","UNVERIFIED","NOT_APPLICABLE"].includes(item.status))throw Error("Invalid differential observation");
 if(["EQUIVALENT","DIVERGENT"].includes(item.status)){
  if(!sha40(item.asenCommit)||item.sourceCommit!==plan.baselineCommit||!sha64(item.sourceReceipt)||!sha64(item.asenReceipt)||item.sourceOutput===undefined||item.asenOutput===undefined)throw Error("Both exact-source execution receipts are required");
  const same=JSON.stringify(item.sourceOutput)===JSON.stringify(item.asenOutput);
  if(same!==(item.status==="EQUIVALENT"))throw Error("Observation contradicts claimed result");
 }
 if(item.status==="NOT_APPLICABLE"&&(!item.reason||!["external-runtime","tracked-file","tracked-glob"].includes(contract.kind)))throw Error("Explicit scope rationale required");
 return {contractId:contract.id,scenario:item.scenario,status:item.status,admitted:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url))process.stdout.write(JSON.stringify(createDifferentialPlan(),null,2)+"\n");
