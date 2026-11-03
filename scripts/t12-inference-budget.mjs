import {writeFile,mkdir,readFile,lstat,link,unlink,readdir} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {isAbsolute,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";

function configuredLimit(value=process.env.ASEN_MAX_INFERENCE_CALLS){
 if(value!=="3"&&value!=="5")throw new Error("ASEN_MAX_INFERENCE_CALLS must be 3 or 5");
 return Number(value);
}

/** Lock the provider-call ceiling across separate Pi processes before spending it.
 * A hard link atomically publishes fully written policy bytes, without a read/write race.
 */
async function assertBudgetPolicy(reservations,limit){
 const root=await lstat(reservations);
 if(!root.isDirectory()||root.isSymbolicLink())throw new Error("T12 inference budget directory must be a real directory");
 const policy=join(reservations,"limit.json");
 const temporary=join(reservations,".limit-"+randomUUID()+".tmp");
 await writeFile(temporary,JSON.stringify({schema:1,limit})+"\n",{flag:"wx",mode:0o600});
 try{
  try{await link(temporary,policy);}
  catch(error){
   if(!(error&&typeof error==="object"&&"code" in error&&error.code==="EEXIST"))throw error;
  }
 }finally{await unlink(temporary);}
 const stat=await lstat(policy);
 if(!stat.isFile()||stat.isSymbolicLink())throw new Error("T12 inference budget policy must be a regular file");
 let recorded;
 try{recorded=JSON.parse(await readFile(policy,"utf8"));}
 catch{throw new Error("T12 inference budget policy is malformed");}
 if(!recorded||typeof recorded!=="object"||Array.isArray(recorded)||recorded.schema!==1||
    !Number.isInteger(recorded.limit)||recorded.limit<1||recorded.limit>5||
    Object.keys(recorded).sort().join(",")!=="limit,schema")
  throw new Error("T12 inference budget policy is malformed");
 if(recorded.limit!==limit)throw new Error("T12 inference call budget cannot change within one run");
}

export async function reserveInferenceCall(label,{limit=configuredLimit(),directory=process.env.RUNNER_TEMP}={}){
 if(!/^[a-z0-9-]{1,48}$/i.test(label))throw new Error("Invalid inference call label");
 if(!Number.isInteger(limit)||limit<1||limit>5)throw new Error("Invalid inference call budget");
 if(typeof directory!=="string"||!isAbsolute(directory))throw new Error("RUNNER_TEMP must be an absolute path");
 const reservations=join(directory,"asen-inference-budget");
 await mkdir(reservations,{recursive:true,mode:0o700});
 await assertBudgetPolicy(reservations,limit);
 for(let call=1;call<=limit;call++){
  // Claim first: a crash between claim and receipt burns this slot.
  // This prevents a restarted process from replaying an issued inference.
  const temporary=join(reservations,".slot-"+call+"-"+randomUUID()+".tmp");
  const payload=JSON.stringify({call,label,limit})+"\n";
  await writeFile(temporary,payload,{flag:"wx",mode:0o600});
  try{
   try{await link(temporary,join(reservations,call+".claim"));}
   catch(error){
    if(error&&typeof error==="object"&&"code" in error&&error.code==="EEXIST")continue;
    throw error;
   }
   // Independent inodes preserve evidence if a receipt is later overwritten.
   const receiptTemporary=join(reservations,".receipt-"+call+"-"+randomUUID()+".tmp");
   await writeFile(receiptTemporary,payload,{flag:"wx",mode:0o600});
   try{await link(receiptTemporary,join(reservations,call+".json"));}
   finally{await unlink(receiptTemporary);}
   return Object.freeze({call,limit});
  }finally{await unlink(temporary);}
 }
 try{
  await writeFile(join(reservations,"exhausted.json"),JSON.stringify({label,limit,exhausted:true})+"\n",{flag:"wx",mode:0o600});
 }catch(error){
  if(!(error&&typeof error==="object"&&"code" in error&&error.code==="EEXIST"))throw error;
 }
 throw new Error(`T12 inference call budget exhausted (${limit})`);
}


/** Inspect durable inference receipts across process restarts. This is read-only. */
export async function inspectInferenceBudget({directory=process.env.RUNNER_TEMP}={}){
 if(typeof directory!=="string"||!isAbsolute(directory))throw new Error("RUNNER_TEMP must be an absolute path");
 const folder=join(directory,"asen-inference-budget");
 const stat=await lstat(folder);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error("T12 inference budget directory must be a real directory");
 const policyFile=join(folder,"limit.json");
 const policyStat=await lstat(policyFile);
 if(!policyStat.isFile()||policyStat.isSymbolicLink())throw new Error("T12 inference budget policy must be a regular file");
 let policy;
 try{policy=JSON.parse(await readFile(policyFile,"utf8"));}
 catch{throw new Error("T12 inference budget policy is malformed");}
 if(!policy||typeof policy!=="object"||Array.isArray(policy)||
    Object.keys(policy).sort().join(",")!=="limit,schema"||
    policy.schema!==1||![3,5].includes(policy.limit))
  throw new Error("T12 inference budget policy is malformed");
 const names=await readdir(folder);
 let reserved=0,missingEarlierSlot=false;
 for(let call=1;call<=policy.limit;call++){
  const receipt=join(folder,call+".json"),claim=join(folder,call+".claim");
  let receiptStat,claimStat;
  try{receiptStat=await lstat(receipt);}
  catch(error){if(!(error&&typeof error==="object"&&"code" in error&&error.code==="ENOENT"))throw error;}
  try{claimStat=await lstat(claim);}
  catch(error){if(!(error&&typeof error==="object"&&"code" in error&&error.code==="ENOENT"))throw error;}
  if(!claimStat&&!receiptStat){missingEarlierSlot=true;continue;}
  if(missingEarlierSlot||!claimStat||!receiptStat)
   throw new Error("T12 inference reservation history has a gap or incomplete receipt");
  if(!receiptStat.isFile()||receiptStat.isSymbolicLink()||
     !claimStat.isFile()||claimStat.isSymbolicLink())
   throw new Error("T12 inference reservation is not a regular file");
  let item,proof;
  try{
   item=JSON.parse(await readFile(receipt,"utf8"));
   proof=JSON.parse(await readFile(claim,"utf8"));
  }catch{throw new Error("T12 inference reservation is malformed");}
  if(!item||typeof item!=="object"||Array.isArray(item)||
     Object.keys(item).sort().join(",")!=="call,label,limit"||
     item.call!==call||item.limit!==policy.limit||
     typeof item.label!=="string"||!/^[a-z0-9-]{1,48}$/i.test(item.label)||
     JSON.stringify(proof)!==JSON.stringify(item))
   throw new Error("T12 inference reservation is malformed");
  reserved++;
 }
 if(names.some(name=>/^[0-9]+\.(?:json|claim)$/.test(name)&&
   (!/^[1-9][0-9]*\.(?:json|claim)$/.test(name)||Number(name.split(".")[0])>policy.limit)))
  throw new Error("T12 inference reservation outside the declared limit");
 return Object.freeze({limit:policy.limit,reserved,remaining:policy.limit-reserved,authorization:"NOT_GRANTED"});
}

/** Read verified, sanitized per-stage receipts only after the run has stopped.
 * Never issues a provider request or exposes credentials.
 */
export async function readInferenceBudgetReceipts({directory=process.env.RUNNER_TEMP}={}){
 const summary=await inspectInferenceBudget({directory});
 const folder=join(directory,"asen-inference-budget");
 const receipts=[];
 for(let call=1;call<=summary.reserved;call++){
  const receipt=await readFile(join(folder,call+".json"),"utf8");
  const claim=await readFile(join(folder,call+".claim"),"utf8");
  if(receipt!==claim)throw new Error("T12 inference receipt differs from its claimed call");
  let record;
  try{record=JSON.parse(receipt);}
  catch{throw new Error("T12 inference reservation is malformed");}
  if(!record||typeof record!=="object"||Array.isArray(record)||
     Object.keys(record).sort().join(",")!=="call,label,limit"||
     record.call!==call||record.limit!==summary.limit||
     typeof record.label!=="string"||!/^[a-z0-9-]{1,48}$/i.test(record.label))
   throw new Error("T12 inference reservation is malformed");
  receipts.push(Object.freeze({call:record.call,label:record.label,limit:record.limit}));
 }
 return Object.freeze(receipts);
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  if(process.argv[2]==="--report"){
   console.log(JSON.stringify(await inspectInferenceBudget()));
  }else{
   const reservation=await reserveInferenceCall(process.argv[2]??"unspecified");
   console.log(`T12 inference call reserved ${reservation.call}/${reservation.limit}`);
  }
 }catch(error){
  console.error(error instanceof Error?error.message:"T12 inference budget reservation failed");
  process.exitCode=1;
 }
}
