#!/usr/bin/env node
import {spawn} from "node:child_process";
import {existsSync,realpathSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {homedir} from "node:os";
import {parseAsenArgs,parseDoctorArgs,parseManagedRunArgs,parseManagedSelectArgs,parseManagedUpdatePreviewArgs,parseProjectMemoryBackupPreviewArgs,readAsenLauncherConfig,resolveAsenHome,resolvePiRuntime} from "./runtime/launcher.js";
import {composeInstallationDoctor} from "./runtime/installation-doctor.js";
import {createProjectMemoryBackupPreview} from "./runtime/project-memory-backup-preview.js";
import {createSetupMaintenancePlan} from "./runtime/maintenance-plan.js";
import {ManagedVersionSelectionError,selectManagedVersion} from "./runtime/managed-install.js";
import {launchManagedSelectedVersion} from "./runtime/managed-selected-launch.js";
import {createManagedUpdatePreview} from "./runtime/managed-update-preview.js";

export function launcherPackageRoot():string{return path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");}
export const ASEN_HELP=`Usage: asen [--link|--isolated|--home PATH] [Pi arguments]\n       asen home\n       asen setup --dry-run [--yes]  Preview setup intent (no changes)\n       asen [--link|--isolated|--home PATH] backup project-memory --project <project-id> --destination <absolute-path> --dry-run  Preview only; no backup created\n       asen [--link|--isolated|--home PATH] managed run <version> -- [Pi arguments]  Current-user execution; publisher unverified\n       asen [--link|--isolated|--home PATH] managed select <version> --expected-current <version>  Select retained metadata only; no activation\n       asen [--link|--isolated|--home PATH] managed update --manifest <absolute-json> --package-root <absolute-dir> --dry-run  Observe only; software prefix remains OS home/.asen\n       asen [--link|--isolated|--home PATH] [--package-root PATH] doctor\n       asen --version\n`;
const BACKUP_PREVIEW_USAGE="Unsupported ASEN backup project-memory command. Expected: backup project-memory --project <project-id> --destination <absolute-path> --dry-run.\n";
const DOCTOR_USAGE="Unsupported ASEN doctor command. Expected: [--link|--isolated|--home PATH] [--package-root PATH] doctor.\n";
const DOCTOR_INCOMPLETE="Installation doctor could not complete all metadata observations.\n";
const MANAGED_SELECT_USAGE="Unsupported ASEN managed select command. Expected: managed select <exact-target-version> --expected-current <exact-current-version>.\n";
const MANAGED_SELECT_NOT_CONFIRMED="Managed version selection is not confirmed; inspect the reported state before retrying.\n";
const MANAGED_UPDATE_USAGE="Unsupported ASEN managed update command. Expected: managed update --manifest <absolute-json> --package-root <absolute-dir> --dry-run.\n";
const safeOperationalMessage=(error:unknown)=>{
 const raw=error instanceof Error?error.message:String(error),scrubbed=raw.replace(/[\u0000-\u001f\u007f-\u009f]/gu," ").slice(0,512);
 return scrubbed||"Operation failed";
};
export interface AsenCliDependencies{homeDirectory?:()=>string;stdout?:(text:string)=>void;stderr?:(text:string)=>void}
function bundledPi(packageRoot:string):string|undefined{const p=path.join(packageRoot,"node_modules","@earendil-works","pi-coding-agent","dist","cli.js");return existsSync(p)?p:undefined;}

export async function runAsen(argv=process.argv.slice(2),env:Record<string,string|undefined>=process.env,dependencies:AsenCliDependencies={}):Promise<number>{
 const stdout=dependencies.stdout??((text:string)=>{process.stdout.write(text);}),stderr=dependencies.stderr??((text:string)=>{process.stderr.write(text);});
 const update=parseManagedUpdatePreviewArgs(argv);
 if(update.kind==="invalid"){stderr(MANAGED_UPDATE_USAGE);return 2;}
 const preview=update.kind==="none"?parseProjectMemoryBackupPreviewArgs(argv):{kind:"none" as const};
 if(preview.kind==="invalid"){stderr(BACKUP_PREVIEW_USAGE);return 2;}
 const doctor=update.kind==="none"&&preview.kind==="none"?parseDoctorArgs(argv):{kind:"none" as const};
 if(doctor.kind==="invalid"){stderr(DOCTOR_USAGE);return 2;}
 const selection=update.kind==="none"&&preview.kind==="none"&&doctor.kind==="none"?parseManagedSelectArgs(argv):{kind:"none" as const};
 if(selection.kind==="invalid"){stderr(MANAGED_SELECT_USAGE);return 2;}
 const managed=update.kind==="none"&&doctor.kind==="none"&&selection.kind==="none"?parseManagedRunArgs(argv):{kind:"none" as const};
 if(managed.kind==="invalid"){
  stderr("Unsupported ASEN managed command. Expected: managed run <exact-version> -- <Pi arguments>.\n");return 2;
 }
 let selectorArgs:readonly string[]=argv;
 if(update.kind==="preview")selectorArgs=update.selectorArgs;
 else if(preview.kind==="preview")selectorArgs=preview.selectorArgs;
 else if(doctor.kind==="doctor")selectorArgs=doctor.selectorArgs;
 else if(selection.kind==="select")selectorArgs=selection.selectorArgs;
 else if(managed.kind==="run")selectorArgs=managed.selectorArgs;
 const parsed=parseAsenArgs(selectorArgs);
 if(parsed.error){stderr(parsed.error+"\n");return 2;}
 const packageRoot=parsed.packageRoot??launcherPackageRoot();
 if(parsed.help){stdout(ASEN_HELP);return 0;}
 if(parsed.version){stdout("0.1.0\n");return 0;}
 if(parsed.command==="setup"){
  if(parsed.commandArgs.some(argument=>argument!=="--dry-run"&&argument!=="--yes")){stderr("Unsupported ASEN setup arguments.\n");return 2;}
  if(!parsed.commandArgs.includes("--dry-run")){stderr("ASEN setup execution is not available yet; use --dry-run to inspect the plan.\n");return 2;}
  const homeDirectory=(dependencies.homeDirectory??homedir)();let config;
  try{config=await readAsenLauncherConfig(homeDirectory);}catch{stderr("Unable to read ASEN launcher configuration\n");return 2;}
  const home=resolveAsenHome({args:parsed,env,homedir:homeDirectory,...(config?{config}:{})});
  let plan;
  try{plan=createSetupMaintenancePlan({packageRoot,prefix:path.join(homeDirectory,".asen"),home:home.dir});}
  catch(error){stderr((error instanceof Error?error.message:"Unable to create ASEN setup preview")+"\n");return 2;}
  stdout(JSON.stringify(plan,null,2)+"\n");return 0;
 }
 if(update.kind==="preview"){
  const homeDirectory=(dependencies.homeDirectory??homedir)();
  try{
   const report=await createManagedUpdatePreview({manifestPath:update.manifestPath,packageRoot:update.packageRoot,prefix:path.join(path.resolve(homeDirectory),".asen")});
   stdout(JSON.stringify(report,null,2)+"\n");return 0;
  }catch(error){stderr("Managed update preview refused: "+safeOperationalMessage(error)+"\n");return 1;}
 }
 if(preview.kind==="preview"){
  const homeDirectory=(dependencies.homeDirectory??homedir)();let config;
  try{config=await readAsenLauncherConfig(homeDirectory);}catch{stderr("Unable to read ASEN launcher configuration\n");return 2;}
  const launcherDataHome=resolveAsenHome({args:parsed,env,homedir:homeDirectory,...(config?{config}:{})});
  const report=createProjectMemoryBackupPreview({projectId:preview.projectId,destination:preview.destination,launcherDataHome});
  stdout(JSON.stringify(report,null,2)+"\n");return 0;
 }
 const homeDirectory=(dependencies.homeDirectory??homedir)();
 if(doctor.kind==="doctor"){
  const report=await composeInstallationDoctor({executingPackageRoot:launcherPackageRoot(),effectivePackageRoot:packageRoot,homeDirectory,args:parsed,env});
  stdout(JSON.stringify(report,null,2)+"\n");
  if(report.collection.status==="complete")return 0;
  stderr(DOCTOR_INCOMPLETE);return 1;
 }
 if(selection.kind==="select"){
  try{
   const report=await selectManagedVersion({prefix:path.join(path.resolve(homeDirectory),".asen"),version:selection.version,
    expectedCurrentVersion:selection.expectedCurrentVersion,confirmed:true});
   stdout(JSON.stringify(report,null,2)+"\n");
   if(report.status==="selected"||report.status==="unchanged")return 0;
   stderr(MANAGED_SELECT_NOT_CONFIRMED);return 1;
  }catch(error){
   if(error instanceof ManagedVersionSelectionError){stdout(JSON.stringify(error.report,null,2)+"\n");stderr(MANAGED_SELECT_NOT_CONFIRMED);return 1;}
   stderr("Managed version selection refused: "+(error instanceof Error?error.message:String(error))+"\n");return 1;
  }
 }
 let config;
 try{config=await readAsenLauncherConfig(homeDirectory);}catch{stderr("Unable to read ASEN launcher configuration\n");return 2;}
 const home=resolveAsenHome({args:parsed,env,homedir:homeDirectory,...(config?{config}:{})});
 if(managed.kind==="run"){
  const report=await launchManagedSelectedVersion({prefix:path.join(path.resolve(homeDirectory),".asen"),version:managed.version,
   home:path.resolve(home.dir),args:managed.piArgs,confirmed:true,cwd:path.resolve(process.cwd()),env});
  if(report.launchAttempts===0){stderr("Managed selected launch refused: candidate-drift.\n");return 1;}
  if(report.status==="ambiguous"){
   stderr("Managed selected launch is ambiguous after one attempted launch; it was not retried.\n");return 1;
  }
  return report.termination==="closed"&&report.signal===null?(report.exitCode??1):1;
 }
 if(parsed.command==="home"){stdout(home.dir+"\n");return 0;}
 const bundled=bundledPi(packageRoot);
 const runtime=resolvePiRuntime({env,...(bundled?{bundled}:{}),...(env.ASEN_PI_ON_PATH?{onPath:env.ASEN_PI_ON_PATH}:{}),nodeExecPath:process.execPath});
 if(!runtime){stderr("Pi runtime not found\n");return 1;}
 const args=[...runtime.args,...(parsed.piSubcommand?[parsed.piSubcommand,...parsed.passthrough.slice(1)]:parsed.passthrough)];
 return await new Promise<number>(resolve=>{
  const child=spawn(runtime.command,args,{stdio:"inherit",env:{...env,PI_CODING_AGENT_DIR:home.dir,ASEN_PACKAGE_ROOT:packageRoot}});
  child.once("error",()=>resolve(1));
  child.once("exit",(code:number|null)=>resolve(code??1));
 });
}
function isMain():boolean{if(!process.argv[1])return false;try{return realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url));}catch{return false;}}
if(isMain())process.exitCode=await runAsen();
