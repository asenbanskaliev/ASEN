import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {isAbsolute,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const isRecord=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);

async function loadSettings(path){
 try{
  const parsed=JSON.parse(await readFile(path,"utf8"));
  assert.ok(isRecord(parsed),"Pi settings must contain a JSON object");
  return parsed;
 }catch(error){
  if(error&&typeof error==="object"&&"code" in error&&error.code==="ENOENT")return {};
  throw error;
 }
}

export async function disablePiRetries(agentDirectory){
 assert.ok(typeof agentDirectory==="string"&&isAbsolute(agentDirectory),"PI_CODING_AGENT_DIR must be absolute");
 const path=join(agentDirectory,"settings.json");
 const settings=await loadSettings(path);
 const retry=settings.retry===undefined?{}:settings.retry;
 assert.ok(isRecord(retry),"Pi retry settings must be an object");
 const provider=retry.provider===undefined?{}:retry.provider;
 assert.ok(isRecord(provider),"Pi provider retry settings must be an object");
 settings.retry={
  ...retry,
  enabled:false,
  maxRetries:0,
  provider:{...provider,maxRetries:0},
 };
 await writeFile(path,JSON.stringify(settings,null,2)+"\n",{mode:0o600});
 return Object.freeze({enabled:false,maxRetries:0,providerMaxRetries:0});
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  const result=await disablePiRetries(process.env.PI_CODING_AGENT_DIR);
  process.stdout.write(JSON.stringify({retry:result})+"\n");
 }catch(error){
  console.error(error instanceof Error?error.message:"Unable to disable Pi retries");
  process.exitCode=1;
 }
}
