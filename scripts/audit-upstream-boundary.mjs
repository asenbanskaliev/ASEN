import {readFile,readdir} from "node:fs/promises";
import {join,relative} from "node:path";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url));
const forbidden=/gentle|gentleman|engram/i;
const protectedRoots=["src","skills","extensions"];
const violations=[];

async function walk(dir){
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const path=join(dir,entry.name);
  if(entry.isDirectory()) await walk(path);
  else {
   const text=await readFile(path,"utf8");
   if(forbidden.test(entry.name)||forbidden.test(text)) violations.push(relative(root,path));
  }
 }
}
for(const dir of protectedRoots) await walk(new URL(`../${dir}/`,import.meta.url));
const pkg=await readFile(new URL("../package.json",import.meta.url),"utf8");
if(forbidden.test(pkg)) violations.push("package.json");
if(violations.length){console.error("External reference leaked into ASEN product surface:\n"+violations.join("\n"));process.exit(1);}
console.log("upstream boundary: PASS");
