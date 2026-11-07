import {lstatSync,realpathSync} from "node:fs";
import {homedir,tmpdir} from "node:os";
import {basename,dirname,isAbsolute,parse,resolve,sep} from "node:path";

/** Narrow exception for the session's own literal mktemp scratch directories.
 * No shell evaluation; unknown ownership, wrappers, pipes and chains fail closed.
 */
export function isYoloTempScratchRemoval(command:string):boolean{
 if(typeof command!=="string"||command.length>4096||/[\x60$<>\\\r\n;|&]/u.test(command))
  return false;
 const tokens=command.trim().split(/\s+/u);
 if(tokens.length<3||tokens[0]!=="rm")return false;
 let recursive=false,options=true;
 const targets:string[]=[];
 for(const token of tokens.slice(1)){
  if(options&&token==="--"){options=false;continue;}
  if(options&&token.startsWith("-")){
   if(token==="--recursive"){recursive=true;continue;}
   if(!/^-[rRfF]+$/u.test(token))return false;
   if(/[rR]/u.test(token))recursive=true;
   continue;
  }
  targets.push(token);
 }
 if(!recursive||targets.length===0)return false;
 try{
  const root=realpathSync(tmpdir()),home=realpathSync(homedir());
  if(root===parse(root).root||root===home||root.startsWith(home+sep)||home.startsWith(root+sep))
   return false;
  const uid=typeof process.getuid==="function"?process.getuid():undefined;
  return targets.every(value=>{
   if(!isAbsolute(value)||value.endsWith(sep)||value.includes("//")||
    value.split(/[\\/]/u).some(bit=>bit==="."||bit==="..")||
    !/^[A-Za-z0-9/._+-]+$/u.test(value))return false;
   const target=resolve(value);
   if(dirname(target)!==root||!/^(?:tmp\.)[A-Za-z0-9]{6,}$/u.test(basename(target)))
    return false;
   try{
    const st=lstatSync(target);
    if(!st.isSymbolicLink()&&!st.isFile()&&!st.isDirectory())return false;
    if(st.isDirectory()&&!/^(?:tmp\.)[A-Za-z0-9]{6,}$/u.test(basename(target)))return false;
    return uid===undefined||st.uid===uid;
   }catch(e){return (e as NodeJS.ErrnoException).code==="ENOENT";}
  });
 }catch{return false;}
}
