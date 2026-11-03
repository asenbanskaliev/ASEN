import {writeFile,mkdir,readFile,lstat,link,unlink} from "node:fs/promises";
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
  try{
   await writeFile(join(reservations,`${call}.json`),JSON.stringify({call,label,limit})+"\n",{flag:"wx",mode:0o600});
   return Object.freeze({call,limit});
  }catch(error){
   if(error&&typeof error==="object"&&"code" in error&&error.code==="EEXIST")continue;
   throw error;
  }
 }
 try{
  await writeFile(join(reservations,"exhausted.json"),JSON.stringify({label,limit,exhausted:true})+"\n",{flag:"wx",mode:0o600});
 }catch(error){
  if(!(error&&typeof error==="object"&&"code" in error&&error.code==="EEXIST"))throw error;
 }
 throw new Error(`T12 inference call budget exhausted (${limit})`);
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  const reservation=await reserveInferenceCall(process.argv[2]??"unspecified");
  console.log(`T12 inference call reserved ${reservation.call}/${reservation.limit}`);
 }catch(error){
  console.error(error instanceof Error?error.message:"T12 inference budget reservation failed");
  process.exitCode=1;
 }
}
