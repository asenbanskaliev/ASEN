import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url));
const forbidden=new RegExp(["gen"+"tle","gen"+"tleman","eng"+"ram"].join("|"),"i");
const tracked=execFileSync("git",["ls-files","-z"],{cwd:root}).toString("utf8").split("\0").filter(Boolean);
const violations=[];
for(const path of tracked){
 if(forbidden.test(path)){violations.push(path);continue;}
 const bytes=readFileSync(new URL(`../${path.split("/").map(encodeURIComponent).join("/")}`,import.meta.url));
 if(bytes.includes(0))continue;
 let content;
 try{content=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{continue;}
 if(forbidden.test(content))violations.push(path);
}
if(violations.length){console.error("External reference in tracked tree:\n"+violations.join("\n"));process.exit(1);}
console.log(`tracked boundary: PASS (${tracked.length} paths)`);
