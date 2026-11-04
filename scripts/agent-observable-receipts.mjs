/** EF-701: offline integrity audit of A/B/ASEN evidence files.
 * A self-asserted "real" receipt with a correct digest is NOT independent
 * proof of an actual provider/host execution and must never imply FULL. */
import {createHash} from 'node:crypto';
import {readFile,realpath,lstat,open} from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import {join,resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CASE_IDS,REFERENCE_SHA,compareAgentObservations} from './agent-observable-parity.mjs';
const REFS=['A','B','ASEN'];
const SCHEMA='asen-agent-observable-receipt-v1';
const receiptPattern=/^receipts\/(A|B|ASEN)\/(C(?:0[1-9]|1[0-9]|20))\.json#sha256=([0-9a-f]{64})$/u;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
 Object.keys(value).sort().join('|')===keys.slice().sort().join('|');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const MAX_RECEIPT_BYTES=256*1024;
const identityFields=['dev','ino','mode','size','nlink','birthtimeNs','ctimeNs','mtimeNs'];
/** Physical identity, not copyable marker bytes or millisecond-rounded metadata.
 * Missing native identities, aliases (hardlinks) and changes fail closed. */
export function sameObservableReceiptIdentity(before,after){
 return before!==null&&after!==null&&typeof before==='object'&&typeof after==='object'&&
  typeof before.ino==='bigint'&&before.ino>0n&&before.nlink===1n&&
  identityFields.every(field=>typeof before[field]==='bigint'&&before[field]===after[field]);
}
/** Read from one bounded descriptor, never a pathname checked before a later read.
 * On platforms without O_NOFOLLOW, pre/post realpath and inode comparisons
 * still reject observable replacements; no method claims to prevent all races. */
async function readBoundedReceipt(target){
 const before=await lstat(target,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||before.ino<=0n||
    before.nlink!==1n||before.size>BigInt(MAX_RECEIPT_BYTES)||
    await realpath(target)!==target)throw new Error('Unsafe receipt path or size');
 const flags=fsConstants.O_RDONLY|(process.platform==='win32'?0:(fsConstants.O_NOFOLLOW??0));
 const handle=await open(target,flags);
 try{
  const opened=await handle.stat({bigint:true});
  if(!opened.isFile()||!sameObservableReceiptIdentity(before,opened))
   throw new Error('Receipt changed before open');
  const buffer=Buffer.alloc(MAX_RECEIPT_BYTES+1);
  let count=0;
  while(count<buffer.length){
   const {bytesRead}=await handle.read(buffer,count,buffer.length-count,count);
   if(bytesRead===0)break;
   count+=bytesRead;
  }
  if(count>MAX_RECEIPT_BYTES)throw new Error('Receipt grew beyond bounded read');
  if(count===0)throw new Error('Empty receipt is not evidence');
  const [after,atPath,real]=await Promise.all([
   handle.stat({bigint:true}),lstat(target,{bigint:true}),realpath(target),
  ]);
  if(real!==target||!sameObservableReceiptIdentity(opened,after)||
     !sameObservableReceiptIdentity(opened,atPath)||BigInt(count)!==opened.size)
   throw new Error('Receipt changed during bounded read');
  return buffer.subarray(0,count);
 }finally{await handle.close();}
}
function observed(docs,id,source){
 const doc=source==='ASEN'?docs.candidate:docs.reference;
 return doc.cases.find(item=>item.id===id&&item.source===source);
}
function validInside(root,target){
 const rel=relative(root,target).split(sep).join('/');
 return Boolean(rel)&&!rel.startsWith('../')&&rel!=='..'&&!rel.startsWith('/');
}
/** Verify every cited file's size, canonical path, bytes and observation binding.
 * Deliberately never accepts model claims as source attestation. */
export async function auditObservableReceipts({reference,candidate,candidateSha,root}){
 compareAgentObservations({reference,candidate,candidateSha}); // strict schemas
 if(typeof root!=='string'||!root.trim())throw new Error('An explicit receipt root is required');
 const requestedRoot=resolve(root);
 const rootStat=await lstat(requestedRoot,{bigint:true});
 if(!rootStat.isDirectory()||rootStat.isSymbolicLink())
  throw new Error('Receipt root must be a real directory, not a symbolic link');
 const base=await realpath(requestedRoot);
 if(base!==requestedRoot)throw new Error('Receipt root or ancestor is a symbolic link');
 const rows=[];
 for(const id of CASE_IDS)for(const source of REFS){
  const entry=observed({reference,candidate},id,source);
  const result={id,source,status:'BLOCKED',reason:'RECEIPT_MISSING'};
  if(!entry){rows.push(result);continue;}
  const sha=source==='ASEN'?candidateSha:REFERENCE_SHA[source];
  if(entry.sha!==sha){result.reason='SOURCE_SHA_STALE';rows.push(result);continue;}
  if(entry.execution!=='real'){result.reason='REAL_EXECUTION_NOT_PROVEN';rows.push(result);continue;}
  const match=receiptPattern.exec(entry.receipt);
  if(!match||match[1]!==source||match[2]!==id){
   result.reason='RECEIPT_DIGEST_BINDING_MISSING';rows.push(result);continue;
  }
  const candidatePath=resolve(base,'receipts',source,`${id}.json`);
  if(!validInside(base,candidatePath)){result.reason='RECEIPT_OUTSIDE_ROOT';rows.push(result);continue;}
  let bytes;
  try{bytes=await readBoundedReceipt(candidatePath);}
  catch{result.reason='RECEIPT_FILE_UNAVAILABLE_OR_UNSAFE';rows.push(result);continue;}
  if(digest(bytes)!==match[3]){result.status='FAIL';result.reason='RECEIPT_DIGEST_MISMATCH';rows.push(result);continue;}
  let record;
  try{record=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));}
  catch{result.status='FAIL';result.reason='RECEIPT_JSON_INVALID';rows.push(result);continue;}
  const keys=['schema','id','source','sha','execution','environment','model','trace'];
  if(!exact(record,keys)||record.schema!==SCHEMA||record.id!==id||record.source!==source||
     record.sha!==sha||record.execution!=='real'||record.environment!==entry.environment||
     record.model!==entry.model||JSON.stringify(record.trace)!==JSON.stringify(entry.trace)){
   result.status='FAIL';result.reason='RECEIPT_CONTENT_MISMATCH';rows.push(result);continue;
  }
  rows.push({id,source,status:'INTEGRITY_ONLY',reason:'INDEPENDENT_EXECUTION_NOT_ATTESTED',digest:match[3]});
 }
 const counts={integrityOnly:rows.filter(x=>x.status==='INTEGRITY_ONLY').length,
  blocked:rows.filter(x=>x.status==='BLOCKED').length,
  fail:rows.filter(x=>x.status==='FAIL').length};
 return {schema:'asen-observable-receipt-audit-v1',candidateSha,expected:60,
  sources:REFS,counts,rows,globalFull:false,
  disclaimer:'Digest matching proves only file integrity against a supplied manifest. Independent reference/provider execution, Writer consent, and C01-C20 parity are separate requirements.'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  const [referencePath,candidatePath,candidateSha,root]=process.argv.slice(2);
  if(!root||process.argv.length!==6)throw new Error('Usage: node scripts/agent-observable-receipts.mjs <reference.json> <asen.json> <candidate-sha> <receipt-root>');
  const [reference,candidate]=await Promise.all([referencePath,candidatePath].map(path=>readFile(resolve(path),'utf8').then(JSON.parse)));
  const result=await auditObservableReceipts({reference,candidate,candidateSha,root});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  process.exitCode=1; // No self-attestation permits FULL.
 }catch(error){console.error(error);process.exitCode=1;}
}
