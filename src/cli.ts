#!/usr/bin/env node
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {homedir} from "node:os";
import {parseAsenArgs,resolveAsenHome,resolvePiRuntime} from "./runtime/launcher.js";

export function launcherPackageRoot():string{return path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");}

export async function runAsen(argv=process.argv.slice(2),env:Record<string,string|undefined>=process.env):Promise<number>{
 const parsed=parseAsenArgs(argv);
 if(parsed.error){process.stderr.write(parsed.error+"\n");return 2;}
 const packageRoot=parsed.packageRoot??launcherPackageRoot();
 const home=resolveAsenHome({args:parsed,env,homedir:homedir()});
 if(parsed.command==="home"){process.stdout.write(home.dir+"\n");return 0;}
 const runtime=resolvePiRuntime({env,onPath:env.ASEN_PI_ON_PATH,nodeExecPath:process.execPath});
 if(!runtime){process.stderr.write("Pi runtime not found\n");return 1;}
 const args=[...runtime.args,...(parsed.piSubcommand?[parsed.piSubcommand,...parsed.passthrough.slice(1)]:parsed.passthrough)];
 return await new Promise<number>(resolve=>{
  const child=spawn(runtime.command,args,{stdio:"inherit",env:{...env,PI_CODING_AGENT_DIR:home.dir,ASEN_PACKAGE_ROOT:packageRoot}});
  child.once("error",()=>resolve(1));
  child.once("exit",(code:number|null)=>resolve(code??1));
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await runAsen();
