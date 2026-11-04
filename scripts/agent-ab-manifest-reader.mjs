/** EF-002/701: fail-closed bounded ingestion of operator-supplied A/B evidence
 * manifests. Physical file identity is checked across descriptor reads.
 * This is integrity of submitted bytes, NOT provenance of model execution.
 */
import {constants as flags} from "node:fs";
import {lstat,open,realpath} from "node:fs/promises";
import {resolve,isAbsolute} from "node:path";
const MAX_BYTES=1024*1024;
const fields=["dev","ino","mode","size","nlink","birthtimeNs","ctimeNs","mtimeNs"];
const same=(a,b)=>a&&b&&fields.every(k=>typeof a[k]==="bigint"&&a[k]===b[k]);
export async function readAgentABManifest(path){
 if(typeof path!=="string"||!isAbsolute(path)||resolve(path)!==path)
  throw Error("A/B manifest requires an absolute normalized path");
 const before=await lstat(path,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||before.ino<=0n||before.nlink!==1n||
    before.size<1n||before.size>BigInt(MAX_BYTES)||await realpath(path)!==path)
  throw Error("Unsafe A/B manifest path, identity or size");
 const file=await open(path,flags.O_RDONLY|(process.platform==="win32"?0:(flags.O_NOFOLLOW??0)));
 let bytes;
 try{
  const st=await file.stat({bigint:true});
  if(!st.isFile()||!same(before,st))throw Error("A/B manifest changed before open");
  const buffer=Buffer.alloc(MAX_BYTES+1);
  let total=0;
  while(total<buffer.length){
   const {bytesRead}=await file.read(buffer,total,buffer.length-total,total);
   if(bytesRead===0)break;
   total+=bytesRead;
  }
  const after=await file.stat({bigint:true});
  const onPath=await lstat(path,{bigint:true});
  if(total>MAX_BYTES||total!==Number(st.size)||!same(st,after)||!same(st,onPath)||
     await realpath(path)!==path)
   throw Error("A/B manifest changed during bounded read");
  bytes=buffer.subarray(0,total);
 }finally{await file.close();}
 let data;
 try{data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
 catch{throw Error("Invalid UTF-8 JSON A/B manifest");}
 if(!data||typeof data!=="object"||Array.isArray(data))
  throw Error("A/B manifest must be a JSON object");
 return data;
}
