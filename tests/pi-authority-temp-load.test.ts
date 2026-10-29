import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {mkdtemp, mkdir, copyFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";

const require=createRequire(import.meta.url);
const pinnedAssets=[
 "extensions/authority.ts",
 "src/runtime/workspace-store.ts",
 "src/runtime/workspace-attribution.ts",
 "src/runtime/responsive-layout.ts",
 "src/io/atomic-write.ts",
 "src/io/exclusive-file-lock.ts",
 "src/io/private-file.ts",
];

test("pinned authority extension and its complete dependency bundle load in a clean temporary root",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-pi-authority-clean-load-"));
 t.after(()=>rm(root,{recursive:true,force:true}));
 for(const source of pinnedAssets){
  const target=join(root,source);
  await mkdir(target.slice(0,target.lastIndexOf("/")),{recursive:true});
  await copyFile(fileURLToPath(new URL("../"+source,import.meta.url)),target);
 }
 const probe=`import {pathToFileURL} from "node:url";
const loaded=await import(pathToFileURL(process.argv[1]).href);
const handlers=new Map(),commands=new Map();
loaded.default({on:(name,handler)=>handlers.set(name,handler),registerCommand:(name,command)=>commands.set(name,command)});
if(!handlers.has("tool_call")||!handlers.has("tool_result")||!commands.has("asen-authority-status"))throw new Error("authority extension registration incomplete");
process.stdout.write("authority extension loaded\\n");`;
 const child=spawn(process.execPath,["--import",require.resolve("tsx"),"--input-type=module","-e",probe,join(root,"extensions/authority.ts")],{
  cwd:root,
  env:{PATH:process.env.PATH??"",HOME:root,TMPDIR:root,TMP:root,TEMP:root,PI_CODING_AGENT_DIR:root,PI_TELEMETRY:"0"},
  stdio:["ignore","pipe","pipe"],
 });
 let stdout="",stderr="";
 child.stdout.setEncoding("utf8").on("data",chunk=>stdout+=chunk);
 child.stderr.setEncoding("utf8").on("data",chunk=>stderr+=chunk);
 const code=await new Promise<number>((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("clean temporary extension load timed out"));},10_000);
  child.once("error",error=>{clearTimeout(timer);reject(error);});
  child.once("close",value=>{clearTimeout(timer);resolve(value??-1);});
 });
 assert.equal(code,0,stderr||stdout);
 assert.equal(stdout,"authority extension loaded\\n");
 assert.equal(stderr,"");
});
