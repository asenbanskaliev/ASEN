import path from "node:path";

export const PI_SUBCOMMANDS=["install","remove","uninstall","update","list","config","auth"] as const;
export type AsenHomeMode="link"|"isolated"|"path";
export type AsenHomeSource="flag"|"config"|"default";
export type AsenLauncherConfig={mode:"link"}|{mode:"isolated"}|{mode:"path";dir:string};
export interface ParsedAsenArgs{link:boolean;isolated:boolean;home?:string;packageRoot?:string;help:boolean;version:boolean;command?:"home"|"setup";commandArgs:string[];passthrough:string[];piSubcommand?:string;error?:string}
const isPiCommand=(v:string)=>(PI_SUBCOMMANDS as readonly string[]).includes(v);
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
 const home=(value as Record<string,unknown>).home;if(typeof home!=="string"||!home)return undefined;if(home==="link")return {mode:"link"};if(home==="isolated")return {mode:"isolated"};return {mode:"path",dir:home};
}
export function asenLauncherConfigPath(home:string){return path.join(home,".asen","config.json");}
export function resolveAsenHome(input:{args:ParsedAsenArgs;env:Record<string,string|undefined>;homedir:string;config?:AsenLauncherConfig}):{mode:AsenHomeMode;dir:string;source:AsenHomeSource}{
 const linked=input.env.PI_CODING_AGENT_DIR||path.join(input.homedir,".pi","agent"),isolated=input.env.ASEN_HOME||path.join(input.homedir,".asen","agent");
 if(input.args.link)return {mode:"link",dir:linked,source:"flag"};if(input.args.isolated)return {mode:"isolated",dir:isolated,source:"flag"};if(input.args.home)return {mode:"path",dir:input.args.home,source:"flag"};
 if(input.config?.mode==="link")return {mode:"link",dir:linked,source:"config"};if(input.config?.mode==="isolated")return {mode:"isolated",dir:isolated,source:"config"};if(input.config?.mode==="path")return {mode:"path",dir:input.config.dir,source:"config"};
 return {mode:"isolated",dir:isolated,source:"default"};
}
export function asenHomeSelectorFlags(home:{mode:AsenHomeMode;dir:string}):string[]{return home.mode==="link"?["--link"]:home.mode==="path"?["--home",home.dir]:[];}
export function resolvePiRuntime(input:{env:Record<string,string|undefined>;bundled?:string;onPath?:string;nodeExecPath:string}):{kind:"env"|"bundled"|"path";command:string;args:string[]}|undefined{
 const explicit=input.env.ASEN_PI;if(explicit)return {kind:"env",command:explicit,args:[]};if(input.bundled)return {kind:"bundled",command:input.nodeExecPath,args:[input.bundled]};if(input.onPath)return {kind:"path",command:input.onPath,args:[]};return undefined;
}
export function checkPiVersion(output:string,minimum="0.85.1"):{ok:true;version:string}|{ok:false;message:string;version?:string}{
 const parse=(v:string)=>{const m=/v?(\d+)\.(\d+)\.(\d+)/.exec(v);return m?[Number(m[1]),Number(m[2]),Number(m[3])] as const:undefined;},found=parse(output),wanted=parse(minimum);if(!wanted)throw new Error("invalid minimum version");
 if(!found)return {ok:false,message:`Could not determine Pi version; minimum is ${minimum}.`};const version=found.join(".");for(let i=0;i<3;i++){if(found[i]!<wanted[i]!)return {ok:false,version,message:`Pi ${version} is older than required ${minimum}.`};if(found[i]!>wanted[i]!)break;}return {ok:true,version};
}
