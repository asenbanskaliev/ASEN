import {constants} from "node:fs";
import {lstat,open} from "node:fs/promises";

/** Reads one ordinary, unlinked file with a hard size bound and descriptor identity checks. */
export async function readBoundedOrdinaryFile(file:string,maxBytes:number):Promise<Buffer>{
 const before=await lstat(file,{bigint:true});
 if(before.isSymbolicLink()||!before.isFile())throw new Error("Path must be an ordinary file");
 if(before.size>BigInt(maxBytes))throw new Error(`File exceeds ${maxBytes} bytes`);
 const flags=constants.O_RDONLY|(process.platform==="win32"?0:constants.O_NOFOLLOW|constants.O_NONBLOCK);
 const handle=await open(file,flags);
 try{
  const opened=await handle.stat({bigint:true});
  if(!opened.isFile()||opened.dev!==before.dev||opened.ino!==before.ino)throw new Error("File changed before reading");
  const bytes=Buffer.alloc(maxBytes+1);let total=0;
  for(;;){
   const {bytesRead}=await handle.read(bytes,total,bytes.length-total,null);
   if(bytesRead===0)break;
   total+=bytesRead;
   if(total>maxBytes)throw new Error(`File exceeds ${maxBytes} bytes`);
  }
  const after=await handle.stat({bigint:true}),named=await lstat(file,{bigint:true});
  if(after.ino!==opened.ino||after.size!==BigInt(total)||named.ino!==opened.ino||named.dev!==opened.dev)throw new Error("File changed while reading");
  return Buffer.from(bytes.subarray(0,total));
 }finally{await handle.close();}
}
