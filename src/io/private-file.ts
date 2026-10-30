import {chmod,lstat,mkdir} from "node:fs/promises";
import path from "node:path";

/** Validates a private JSON file path and repairs overly broad POSIX modes. */
export async function preparePrivateFile(file:string,createParent=false):Promise<boolean>{
 const directory=path.dirname(file);
 if(createParent)await mkdir(directory,{recursive:true,mode:0o700});
 let parent;
 try{parent=await lstat(directory);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return false;throw error;}
 if(parent.isSymbolicLink()||!parent.isDirectory())throw new Error("Private store directory must be a real directory");
 if(process.platform!=="win32")await chmod(directory,0o700);
 let metadata;
 try{metadata=await lstat(file);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return false;throw error;}
 if(metadata.isSymbolicLink()||!metadata.isFile())throw new Error("Private store path must be a regular file");
 if(process.platform!=="win32"&&(metadata.mode&0o077)!==0)await chmod(file,0o600);
 return true;
}
