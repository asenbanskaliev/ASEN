import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {createAsenExtension} from "../../extensions/asen.js";
import {SKILL_REGISTRY_RELATIVE_PATH} from "../../src/skills/generated-registry.js";

const [phase,project,home,packageRoot,expected,excluded]=process.argv.slice(2);
const phases=new Set(["A","B","C"]);

async function main():Promise<void>{
 if(!phase||!phases.has(phase)||!project||!home||!packageRoot||!expected||!excluded)throw new Error("invalid-input");
 const events=new Map<string,(event:unknown,context:unknown)=>Promise<void>>(),notifications:string[]=[];
 let watcherClosed=false;
 createAsenExtension({
  homeDir:()=>home,
  packageRoot,
  enableAgentRuntime:false,
  enableTodoRuntime:false,
  enableWorkspaceRuntime:false,
  registryLifecycle:{watch:()=>({close:()=>{watcherClosed=true;}})},
 })({
  registerCommand(){},
  on:(event:string,handler:(event:unknown,context:unknown)=>Promise<void>)=>events.set(event,handler),
 } as any);
 const start=events.get("session_start"),shutdown=events.get("session_shutdown");
 if(!start||!shutdown)throw new Error("missing-handler");
 const context={cwd:project,hasUI:true,ui:{notify:(message:string)=>notifications.push(message)}};
 await start({},context);
 const startup=notifications.filter(message=>message.startsWith("ASEN skill registry startup:"));
 if(startup.length!==1)throw new Error("invalid-startup");
 const cache=/; cache=(hit|regenerated);/.exec(startup[0]!)?.[1];
 if(cache!=="hit"&&cache!=="regenerated")throw new Error("invalid-cache");
 const registry=await readFile(path.join(project,SKILL_REGISTRY_RELATIVE_PATH),"utf8");
 await shutdown({},context);
 process.stdout.write(`${JSON.stringify({phase,cache,hasExpected:registry.includes(expected),hasExcluded:registry.includes(excluded),sha256:createHash("sha256").update(registry).digest("hex"),shutdown:true,watcherClosed})}\n`);
}

try{await main();}catch{
 process.stdout.write(`${JSON.stringify({ok:false,error:"fixture-failed"})}\n`);
 process.exitCode=1;
}
