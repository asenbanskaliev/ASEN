#!/usr/bin/env node
import {spawn} from "node:child_process";
import {existsSync,realpathSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {homedir} from "node:os";
import {parseAsenArgs,resolveAsenHome,resolvePiRuntime} from "./runtime/launcher.js";

export function launcherPackageRoot():string{return path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");}
export const ASEN_HELP=`Usage: asen [--link|--isolated|--home PATH] [Pi arguments]\n       asen home\n       asen --version\n`;
function bundledPi(packageRoot:string):string|undefined{const p=path.join(packageRoot,"node_modules","@earendil-works","pi-coding-agent","dist","cli.js");return existsSync(p)?p:undefined;}

export async function runAsen(argv=process.argv.slice(2),env:Record<string,string|undefined>=process.env):Promise<number>{
 const parsed=parseAsenArgs(argv);
 if(parsed.error){process.stderr.write(parsed.error+"\n");return 2;}
 const packageRoot=parsed.packageRoot??launcherPackageRoot();
 if(parsed.help){process.stdout.write(ASEN_HELP);return 0;}
 if(parsed.version){process.stdout.write("0.1.0\n");return 0;}
 const home=resolveAsenHome({args:parsed,env,homedir:homedir()});
 if(parsed.command==="home"){process.stdout.write(home.dir+"\n");return 0;}
 const bundled=bundledPi(packageRoot);
 const runtime=resolvePiRuntime({env,...(bundled?{bundled}:{}),...(env.ASEN_PI_ON_PATH?{onPath:env.ASEN_PI_ON_PATH}:{}),nodeExecPath:process.execPath});
 if(!runtime){process.stderr.write("Pi runtime not found\n");return 1;}
 const args=[...runtime.args,...(parsed.piSubcommand?[parsed.piSubcommand,...parsed.passthrough.slice(1)]:parsed.passthrough)];
 return await new Promise<number>(resolve=>{
  const child=spawn(runtime.command,args,{stdio:"inherit",env:{...env,PI_CODING_AGENT_DIR:home.dir,ASEN_PACKAGE_ROOT:packageRoot}});
  child.once("error",()=>resolve(1));
  child.once("exit",(code:number|null)=>resolve(code??1));
 });
}
function isMain():boolean{if(!process.argv[1])return false;try{return realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url));}catch{return false;}}
if(isMain())process.exitCode=await runAsen();
