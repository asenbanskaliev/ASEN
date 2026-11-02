import {writeFile,mkdir} from "node:fs/promises";
import {isAbsolute,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";

function configuredLimit(value=process.env.ASEN_MAX_INFERENCE_CALLS){
 if(value!=="3"&&value!=="5")throw new Error("ASEN_MAX_INFERENCE_CALLS must be 3 or 5");
 return Number(value);
}

export async function reserveInferenceCall(label,{limit=configuredLimit(),directory=process.env.RUNNER_TEMP}={}){
 if(!/^[a-z0-9-]{1,48}$/i.test(label))throw new Error("Invalid inference call label");
 if(!Number.isInteger(limit)||limit<1||limit>5)throw new Error("Invalid inference call budget");
 if(typeof directory!=="string"||!isAbsolute(directory))throw new Error("RUNNER_TEMP must be an absolute path");
 const reservations=join(directory,"asen-inference-budget");
 await mkdir(reservations,{recursive:true,mode:0o700});
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
