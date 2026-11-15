import {copyFile,mkdir,mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

/**
 * Support sources the pinned authority extension imports at runtime.
 * The fixture repository needs them exactly like a real checkout.
 */
const supportSources=[
 "src/runtime/workspace-store.ts",
 "src/runtime/workspace-attribution.ts",
 "src/runtime/responsive-layout.ts",
 "src/io/atomic-write.ts",
 "src/io/exclusive-file-lock.ts",
 "src/io/private-file.ts",
 "src/security/path-safety.ts",
];

export interface PiRpcFixture{
 readonly repository:string;
 readonly pi:string;
}

/**
 * Build a fake Pi RPC child for runner tests.
 *
 * The wrapper answers `get_commands` exactly like Pi does (authority
 * extension plus the issued native skills) and forwards every other RPC
 * record to the scenario module, which owns the protocol behavior under test.
 * The scenario reads one JSON record per line on stdin and writes its own
 * records on stdout.
 */
export async function createPiRpcFixture(t:import("node:test").TestContext,scenario:string):Promise<PiRpcFixture>{
 const repository=await mkdtemp(join(tmpdir(),"asen-pi-rpc-"));
 t.after(()=>rm(repository,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 await mkdir(join(repository,"extensions"),{recursive:true});
 await copyFile(fileURLToPath(new URL("../../extensions/authority.ts",import.meta.url)),join(repository,"extensions","authority.ts"));
 for(const source of supportSources){
  const target=join(repository,source);
  await mkdir(target.slice(0,target.lastIndexOf("/")),{recursive:true});
  await copyFile(fileURLToPath(new URL(`../../${source}`,import.meta.url)),target);
 }
 const scenarioPath=join(repository,"scenario.mjs");
 await writeFile(scenarioPath,scenario,"utf8");
 const piPath=join(repository,"pi-fixture.mjs");
 await writeFile(piPath,`import {spawn} from "node:child_process";
import {resolve} from "node:path";
const child=spawn(process.execPath,[${JSON.stringify(scenarioPath)},...process.argv.slice(2)],{stdio:["pipe","pipe","pipe"]});
child.stdout.on("data",data=>process.stdout.write(data));
child.stderr.on("data",data=>process.stderr.write(data));
let buffer="",prompted=false;
process.stdin.on("data",chunk=>{
 buffer+=String(chunk);
 let end;
 while((end=buffer.indexOf("\\n"))>=0){
  const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
  if(!line.trim())continue;
  const record=JSON.parse(line);
  if(record.type==="get_commands"){
   const position=process.argv.indexOf("--extension"),authority=process.argv[position+1];
   const skills=process.argv.flatMap((arg,index,args)=>arg==="--skill"?[{name:"fixture",source:"skill",sourceInfo:{path:resolve(process.cwd(),args[index+1])}}]:[]);
   process.stdout.write(JSON.stringify({type:"response",id:record.id,success:true,data:{commands:[{name:"asen-authority-status",source:"extension",sourceInfo:{path:authority}},...skills]}})+"\\n");
   continue;
  }
  prompted=true;
  child.stdin.write(line+"\\n");
 }
});
process.stdin.on("end",()=>{child.stdin.end();});
child.on("close",code=>{if(prompted)process.stdin.destroy();process.exitCode=code??0;});
`,"utf8");
 return {repository,pi:piPath};
}

/** Unique model ids keep the process-wide fallback cooldown out of other tests. */
export function uniqueModelNames(count:number):{primary:string;chain:string[]}{
 const suffix=Math.random().toString(36).slice(2,8);
 return {primary:`testprovider/model-0-${suffix}`,chain:Array.from({length:count},(_,index)=>`testprovider/model-${index+1}-${suffix}`)};
}
