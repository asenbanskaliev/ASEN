import path from "node:path";
import {readFile} from "node:fs/promises";

export const PI_SUBCOMMANDS=["install","remove","uninstall","update","list","config","auth"] as const;
export type AsenHomeMode="link"|"isolated"|"path";
export type AsenHomeSource="flag"|"config"|"environment"|"default";
export type AsenLauncherConfig={mode:"link"}|{mode:"isolated"}|{mode:"path";dir:string};
export interface ParsedAsenArgs{link:boolean;isolated:boolean;home?:string|undefined;packageRoot?:string|undefined;help:boolean;version:boolean;command?:"home"|"setup"|undefined;commandArgs:string[];passthrough:string[];piSubcommand?:string|undefined;error?:string|undefined}
export type ManagedRunArgs=
 |Readonly<{kind:"none"}>
 |Readonly<{kind:"invalid"}>
 |Readonly<{kind:"run";selectorArgs:readonly string[];version:string;piArgs:readonly string[]}>;
export type ManagedSelectArgs=
 |Readonly<{kind:"none"}>
 |Readonly<{kind:"invalid"}>
 |Readonly<{kind:"select";selectorArgs:readonly string[];version:string;expectedCurrentVersion:string}>;
export type ManagedUpdatePreviewArgs=
 |Readonly<{kind:"none"}>
 |Readonly<{kind:"invalid"}>
 |Readonly<{kind:"preview";selectorArgs:readonly string[];manifestPath:string;packageRoot:string}>;
export type DoctorArgs=
 |Readonly<{kind:"none"}>
 |Readonly<{kind:"invalid"}>
 |Readonly<{kind:"doctor";selectorArgs:readonly string[]}>;
export type ProjectMemoryBackupPreviewArgs=
 |Readonly<{kind:"none"}>
 |Readonly<{kind:"invalid"}>
 |Readonly<{kind:"preview";selectorArgs:readonly string[];projectId:string;destination:string}>;
const isPiCommand=(v:string)=>(PI_SUBCOMMANDS as readonly string[]).includes(v);
const exactVersion=(value:string)=>/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(value);
type SelectorPrelude=Readonly<{kind:"none"}>|Readonly<{kind:"command";selectorArgs:readonly string[];packageRoot:boolean;index:number;command:string}>;
type ManagedPrelude=Readonly<{kind:"none"}>|Readonly<{kind:"managed";selectorArgs:readonly string[];packageRoot:boolean;index:number}>;

function parseSelectorPrelude(argv:readonly string[]):SelectorPrelude{
 const selectors:string[]=[];let packageRoot=false,index=0;
 while(index<argv.length){
  const argument=argv[index]!;
  if(argument==="--")return {kind:"none"};
  if(argument==="--link"||argument==="--isolated"){selectors.push(argument);index++;continue;}
  if(argument.startsWith("--home=")){selectors.push(argument);index++;continue;}
  if(argument==="--home"){
   selectors.push(argument);const value=argv[index+1];if(value===undefined)return {kind:"none"};
   selectors.push(value);index+=2;continue;
  }
  if(argument.startsWith("--package-root=")){packageRoot=true;selectors.push(argument);index++;continue;}
  if(argument==="--package-root"){
   packageRoot=true;selectors.push(argument);const value=argv[index+1];if(value===undefined)return {kind:"none"};
   selectors.push(value);index+=2;continue;
  }
  return {kind:"command",selectorArgs:Object.freeze(selectors),packageRoot,index,command:argument};
 }
 return {kind:"none"};
}
function parseManagedPrelude(argv:readonly string[]):ManagedPrelude{
 const prelude=parseSelectorPrelude(argv);
 return prelude.kind==="command"&&prelude.command==="managed"?{...prelude,kind:"managed"}:{kind:"none"};
}

/** Recognize only the fixed read-only project-memory backup preview namespace. */
export function parseProjectMemoryBackupPreviewArgs(argv:readonly string[]):ProjectMemoryBackupPreviewArgs{
 const prelude=parseSelectorPrelude(argv);
 if(prelude.kind==="none"||prelude.command!=="backup")return {kind:"none"};
 const namespace=argv[prelude.index+1],projectFlag=argv[prelude.index+2],projectId=argv[prelude.index+3],destinationFlag=argv[prelude.index+4],destination=argv[prelude.index+5],dryRun=argv[prelude.index+6];
 const controls=/[\u0000-\u001f\u007f-\u009f]/u;
 const validProject=projectId!==undefined&&projectId.length<=256&&projectId.trim().length>0&&!controls.test(projectId);
 const validDestination=destination!==undefined&&destination.length<=4096&&destination.trim().length>0&&!controls.test(destination)&&(path.posix.isAbsolute(destination)||(path.win32.isAbsolute(destination)&&path.win32.parse(destination).root.length>1));
 if(prelude.packageRoot||namespace!=="project-memory"||projectFlag!=="--project"||!validProject||destinationFlag!=="--destination"||!validDestination||dryRun!=="--dry-run"||argv.length!==prelude.index+7)return {kind:"invalid"};
 return {kind:"preview",selectorArgs:prelude.selectorArgs,projectId,destination};
}

/** Recognize only the standalone metadata doctor before the ordinary end-of-options boundary. */
export function parseDoctorArgs(argv:readonly string[]):DoctorArgs{
 const prelude=parseSelectorPrelude(argv);
 if(prelude.kind==="none"||prelude.command!=="doctor")return {kind:"none"};
 if(argv.length!==prelude.index+1)return {kind:"invalid"};
 return {kind:"doctor",selectorArgs:prelude.selectorArgs};
}

function fullyQualifiedLocalPath(value:unknown):value is string{
 if(typeof value!=="string"||value.length===0||value.length>4096||/[\p{Cc}]/u.test(value))return false;
 if(!path.isAbsolute(value))return false;
 if(process.platform==="win32"&&(!/^[A-Za-z]:[\\/]/u.test(value)||/^\\\\/u.test(value)||/^\\\\[?.]\\/u.test(value)))return false;
 return true;
}

/** Recognize only the fixed observation-only managed update preview namespace. */
export function parseManagedUpdatePreviewArgs(argv:readonly string[]):ManagedUpdatePreviewArgs{
 const prelude=parseManagedPrelude(argv);if(prelude.kind==="none")return prelude;
 const action=argv[prelude.index+1];if(action!=="update")return {kind:"none"};
 const manifestFlag=argv[prelude.index+2],manifestPath=argv[prelude.index+3],packageFlag=argv[prelude.index+4],packageRoot=argv[prelude.index+5],dryRun=argv[prelude.index+6];
 if(prelude.packageRoot||manifestFlag!=="--manifest"||!fullyQualifiedLocalPath(manifestPath)||packageFlag!=="--package-root"||!fullyQualifiedLocalPath(packageRoot)||dryRun!=="--dry-run"||argv.length!==prelude.index+7)return {kind:"invalid"};
 return {kind:"preview",selectorArgs:prelude.selectorArgs,manifestPath,packageRoot};
}

/** Recognize only the explicit managed run namespace before the ordinary end-of-options boundary. */
export function parseManagedRunArgs(argv:readonly string[]):ManagedRunArgs{
 const prelude=parseManagedPrelude(argv);if(prelude.kind==="none")return prelude;
 const action=argv[prelude.index+1],version=argv[prelude.index+2],separator=argv[prelude.index+3];
 if(prelude.packageRoot||action!=="run"||version===undefined||!exactVersion(version)||separator!=="--")return {kind:"invalid"};
 return {kind:"run",selectorArgs:prelude.selectorArgs,version,piArgs:Object.freeze([...argv.slice(prelude.index+4)])};
}

/** Parse the metadata-only retained-catalog selection command without consuming Pi arguments. */
export function parseManagedSelectArgs(argv:readonly string[]):ManagedSelectArgs{
 const prelude=parseManagedPrelude(argv);if(prelude.kind==="none")return prelude;
 const action=argv[prelude.index+1];if(action!=="select")return {kind:"none"};
 const version=argv[prelude.index+2],flag=argv[prelude.index+3],expected=argv[prelude.index+4];
 if(prelude.packageRoot||version===undefined||!exactVersion(version)||flag!=="--expected-current"||expected===undefined||!exactVersion(expected)||argv.length!==prelude.index+5)return {kind:"invalid"};
 return {kind:"select",selectorArgs:prelude.selectorArgs,version,expectedCurrentVersion:expected};
}
export function parseAsenArgs(argv:readonly string[]):ParsedAsenArgs{
 if(argv[0]==="home")return {link:false,isolated:false,help:false,version:false,command:"home",commandArgs:[...argv.slice(1)],passthrough:[]};
 let link=false,isolated=false,home:string|undefined,packageRoot:string|undefined,help=false,version=false,error:string|undefined,command:"setup"|undefined,commandArgs:string[]=[],piSubcommand:string|undefined;const passthrough:string[]=[];
 for(let i=0;i<argv.length;i++){const arg=argv[i]!;
  if(arg==="--"){const rest=[...argv.slice(i+1)];if(!passthrough.length&&rest[0]&&isPiCommand(rest[0]))piSubcommand=rest[0];passthrough.push(...rest);break;}
  if(arg==="--link"){link=true;continue;} if(arg==="--isolated"){isolated=true;continue;} if(arg==="--help"||arg==="-h"){help=true;continue;} if(arg==="--version"){version=true;continue;}
  if(arg.startsWith("--home=")){home=arg.slice(7)||undefined;if(!home)error="--home requires a non-empty path";continue;}
  if(arg==="--home"){const value=argv[++i];if(!value)error="--home requires a non-empty path";else home=value;continue;}
  if(arg.startsWith("--package-root=")){packageRoot=arg.slice(15)||undefined;if(!packageRoot)error="--package-root requires a non-empty path";continue;}
  if(arg==="--package-root"){const value=argv[++i];if(!value)error="--package-root requires a non-empty path";else packageRoot=value;continue;}
  if(arg==="setup"&&!passthrough.length){command="setup";commandArgs=[...argv.slice(i+1)];break;}
  if(!passthrough.length&&isPiCommand(arg))piSubcommand=arg;passthrough.push(arg);
 }
 if(!error){if(link&&isolated)error="--link and --isolated are mutually exclusive";else if(link&&home)error="--link and --home are mutually exclusive";else if(isolated&&home)error="--isolated and --home are mutually exclusive";}
 return {link,isolated,home,packageRoot,help,version,command,commandArgs,passthrough,piSubcommand,error};
}
export function parseAsenLauncherConfig(text:string):AsenLauncherConfig|undefined{
 let value:unknown;try{value=JSON.parse(text);}catch{return undefined;} if(!value||typeof value!=="object"||Array.isArray(value))return undefined;
 const record=value as Record<string,unknown>;if(Object.keys(record).length!==1||typeof record.home!=="string")return undefined;
 const home=record.home;if(!home||home.length>4096||home!==home.trim()||/[\u0000-\u001f\u007f-\u009f]/u.test(home))return undefined;
 if(home==="link")return {mode:"link"};if(home==="isolated")return {mode:"isolated"};return {mode:"path",dir:home};
}
export function asenLauncherConfigPath(home:string){return path.join(home,".asen","config.json");}
export async function readAsenLauncherConfig(home:string):Promise<AsenLauncherConfig|undefined>{try{return parseAsenLauncherConfig(await readFile(asenLauncherConfigPath(home),"utf8"));}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return undefined;throw error;}}
export function resolveAsenHome(input:{args:ParsedAsenArgs;env:Record<string,string|undefined>;homedir:string;config?:AsenLauncherConfig}):{mode:AsenHomeMode;dir:string;source:AsenHomeSource}{
 const linked=input.env.PI_CODING_AGENT_DIR||path.join(input.homedir,".pi","agent"),isolated=input.env.ASEN_HOME||path.join(input.homedir,".asen","agent");
 if(input.args.link)return {mode:"link",dir:linked,source:"flag"};if(input.args.isolated)return {mode:"isolated",dir:isolated,source:"flag"};if(input.args.home)return {mode:"path",dir:input.args.home,source:"flag"};
 if(input.config?.mode==="link")return {mode:"link",dir:linked,source:"config"};if(input.config?.mode==="isolated")return {mode:"isolated",dir:isolated,source:"config"};if(input.config?.mode==="path")return {mode:"path",dir:input.config.dir,source:"config"};
 return {mode:"isolated",dir:isolated,source:input.env.ASEN_HOME?"environment":"default"};
}
export function asenHomeSelectorFlags(home:{mode:AsenHomeMode;dir:string}):string[]{return home.mode==="link"?["--link"]:home.mode==="path"?["--home",home.dir]:[];}
export function resolvePiRuntime(input:{env:Record<string,string|undefined>;bundled?:string;onPath?:string;nodeExecPath:string}):{kind:"env"|"bundled"|"path";command:string;args:string[]}|undefined{
 const explicit=input.env.ASEN_PI;if(explicit)return {kind:"env",command:explicit,args:[]};if(input.bundled)return {kind:"bundled",command:input.nodeExecPath,args:[input.bundled]};if(input.onPath)return {kind:"path",command:input.onPath,args:[]};return undefined;
}
export function checkPiVersion(output:string,minimum="1.2.0"):{ok:true;version:string}|{ok:false;message:string;version?:string}{
 const parse=(v:string)=>{const m=/v?(\d+)\.(\d+)\.(\d+)/.exec(v);return m?[Number(m[1]),Number(m[2]),Number(m[3])] as const:undefined;},found=parse(output),wanted=parse(minimum);if(!wanted)throw new Error("invalid minimum version");
 if(!found)return {ok:false,message:`Could not determine Pi version; minimum is ${minimum}.`};const version=found.join(".");for(let i=0;i<3;i++){if(found[i]!<wanted[i]!)return {ok:false,version,message:`Pi ${version} is older than required ${minimum}.`};if(found[i]!>wanted[i]!)break;}return {ok:true,version};
}
