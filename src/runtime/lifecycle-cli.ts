import {writeFile} from "node:fs/promises";
import path from "node:path";
import {fullyQualifiedLocalPath,parseAsenArgs,parseSelectorPrelude,readAsenLauncherConfig,resolveAsenHome,type AsenLauncherConfig} from "./launcher.js";
import {HomeBackupError,createHomeBackup,describeVerifiedBackup,restoreHomeBackup,verifyHomeBackup} from "./home-backup.js";
import {ManagedLifecycleError,installManaged,rollbackManaged,uninstallManaged,upgradeManaged,type ManagedAcquisitionSource} from "./managed-lifecycle.js";
import {ManagedTrustError,buildManagedManifest,generateManagedSigningKeyPair,signManagedManifest} from "./managed-trust.js";
import {openInBrowser,requestBrowserConsent} from "./browser-assistant.js";
import {readBoundedOrdinaryFile} from "../io/bounded-file.js";

export interface LifecycleCliIo{
 readonly argv:readonly string[];
 readonly env:Record<string,string|undefined>;
 readonly homeDirectory:()=>string;
 readonly stdout:(text:string)=>void;
 readonly stderr:(text:string)=>void;
 readonly version:string;
 readonly openBrowser?:(url:string)=>void;
}

const VALUE_FLAGS=new Set(["--manifest","--signature","--package-root","--trust-anchor","--source-url","--expected-current","--to","--destination","--file","--backup","--target-home","--target-config","--private-key","--public-key","--output","--timeout-ms"]);
const BOOLEAN_FLAGS=new Set(["--yes","--browser","--no-open","--allow-downgrade","--skip-links","--replace"]);
const USAGE=`Lifecycle commands (explicit trust anchor required for acquisition):
  asen managed install   (--manifest F --signature F --package-root D | --source-url https://…) --trust-anchor F (--yes|--browser [--no-open])
  asen managed upgrade   <same source flags> [--allow-downgrade] (--yes|--browser)
  asen managed rollback  --expected-current X.Y.Z [--to X.Y.Z] --yes
  asen managed uninstall --yes        (keeps data home, sessions and configuration)
  asen managed release keygen --private-key F --public-key F
  asen managed release manifest --package-root D --output F
  asen managed release sign --manifest F --private-key F --output F
  asen backup home --destination F [--skip-links]
  asen backup verify --file F
  asen restore home --backup F --target-home D [--target-config F] [--replace] --yes
`;

function parseFlags(args:readonly string[]):Map<string,string|true>|undefined{
 const flags=new Map<string,string|true>();
 for(let index=0;index<args.length;index++){
  const flag=args[index]!;
  if(BOOLEAN_FLAGS.has(flag)){if(flags.has(flag))return undefined;flags.set(flag,true);continue;}
  if(!VALUE_FLAGS.has(flag)||flags.has(flag))return undefined;
  const value=args[++index];
  if(value===undefined||value.startsWith("--"))return undefined;
  flags.set(flag,value);
 }
 return flags;
}
const abs=(value:string|true|undefined):string|undefined=>typeof value==="string"&&fullyQualifiedLocalPath(value)?path.resolve(value):undefined;
const scrub=(error:unknown)=>(error instanceof Error?error.message:String(error)).replace(/[\u0000-\u001f\u007f-\u009f]/gu," ").slice(0,512);
const exactVersion=(value:unknown):value is string=>typeof value==="string"&&/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(value);

/** Returns undefined when argv is not a lifecycle command so the existing dispatcher keeps ownership. */
export async function runLifecycleCommand(io:LifecycleCliIo):Promise<number|undefined>{
 const prelude=parseSelectorPrelude(io.argv);
 if(prelude.kind!=="command")return undefined;
 const rest=io.argv.slice(prelude.index+1),verb=prelude.command,action=rest[0];
 const managedAction=verb==="managed"&&["install","upgrade","rollback","uninstall","release"].includes(action??"");
 const backupAction=verb==="backup"&&(action==="home"||action==="verify");
 const restoreAction=verb==="restore"&&action==="home";
 if(!managedAction&&!backupAction&&!restoreAction)return undefined;
 const out=(value:unknown)=>io.stdout(JSON.stringify(value,null,2)+"\n");
 const usage=()=>{io.stderr("Unsupported ASEN lifecycle command.\n"+USAGE);return 2;};
 const selector=parseAsenArgs(prelude.selectorArgs);
 if(selector.error){io.stderr(selector.error+"\n");return 2;}
 const home=path.resolve(io.homeDirectory()),prefix=path.join(home,".asen");
 let release:string|undefined;let flagArgs=rest.slice(1);
 if(managedAction&&action==="release"){release=rest[1];flagArgs=rest.slice(2);if(!["keygen","manifest","sign"].includes(release??""))return usage();}
 const flags=parseFlags(flagArgs);
 if(!flags)return usage();
 try{
  if(release==="keygen"){
   const privateFile=abs(flags.get("--private-key")),publicFile=abs(flags.get("--public-key"));
   if(!privateFile||!publicFile||flags.size!==2)return usage();
   const pair=generateManagedSigningKeyPair();
   await writeFile(privateFile,pair.privateKeyPem,{flag:"wx",mode:0o600});
   await writeFile(publicFile,pair.publicKeyPem,{flag:"wx",mode:0o644});
   out({schema:"asen.managed-release-key/v1",keyId:pair.keyId,privateKey:privateFile,publicKey:publicFile});return 0;
  }
  if(release==="manifest"){
   const root=abs(flags.get("--package-root")),output=abs(flags.get("--output"));
   if(!root||!output||flags.size!==2)return usage();
   const built=await buildManagedManifest(root);
   await writeFile(output,built.manifestText,{flag:"wx",mode:0o644});
   out({schema:"asen.managed-release-manifest/v1",version:built.manifest.version,files:built.manifest.files.length,output});return 0;
  }
  if(release==="sign"){
   const manifest=abs(flags.get("--manifest")),key=abs(flags.get("--private-key")),output=abs(flags.get("--output"));
   if(!manifest||!key||!output||flags.size!==3)return usage();
   const signature=signManagedManifest(await readBoundedOrdinaryFile(manifest,1024*1024),(await readBoundedOrdinaryFile(key,16*1024)).toString("utf8"));
   await writeFile(output,signature,{flag:"wx",mode:0o644});
   out({schema:"asen.managed-release-signature/v1",output});return 0;
  }
  if(backupAction&&action==="verify"){
   const file=abs(flags.get("--file"));if(!file||flags.size!==1)return usage();
   out(describeVerifiedBackup(await verifyHomeBackup(file)));return 0;
  }
  const config=await readAsenLauncherConfig(home).catch(()=>undefined);
  const dataHome=resolveAsenHome({args:selector,env:io.env,homedir:home,...(config?{config}:{})});
  if(backupAction){
   const destination=abs(flags.get("--destination"));
   if(!destination||[...flags.keys()].some(key=>key!=="--destination"&&key!=="--skip-links"))return usage();
   out(await createHomeBackup({homeDir:path.resolve(dataHome.dir),configFile:path.join(prefix,"config.json"),destination,skipLinks:flags.has("--skip-links"),asenVersion:io.version}));return 0;
  }
  if(restoreAction){
   const backup=abs(flags.get("--backup")),targetHome=abs(flags.get("--target-home")),targetConfig=flags.has("--target-config")?abs(flags.get("--target-config")):undefined;
   if(!backup||!targetHome||(flags.has("--target-config")&&!targetConfig)||![...flags.keys()].every(key=>["--backup","--target-home","--target-config","--replace","--yes"].includes(key)))return usage();
   out(await restoreHomeBackup({backup,targetHome,...(targetConfig?{targetConfig}:{}),replace:flags.has("--replace"),confirmed:flags.get("--yes")===true}));return 0;
  }
  if(action==="uninstall"){
   if(flags.size!==1||flags.get("--yes")!==true)return usage();
   out(await uninstallManaged({prefix,confirmed:true}));return 0;
  }
  if(action==="rollback"){
   const current=flags.get("--expected-current"),to=flags.get("--to");
   if(!exactVersion(current)||(to!==undefined&&!exactVersion(to))||flags.get("--yes")!==true||[...flags.keys()].some(key=>!["--expected-current","--to","--yes"].includes(key)))return usage();
   const result=await rollbackManaged({prefix,expectedCurrentVersion:current,...(to?{toVersion:to as string}:{}),confirmed:true});
   out(result);return result.status==="rolled-back"?0:1;
  }
  // install | upgrade
  const allowed=new Set(["--manifest","--signature","--package-root","--trust-anchor","--source-url","--yes","--browser","--no-open","--timeout-ms",...(action==="upgrade"?["--allow-downgrade"]:[])]);
  if([...flags.keys()].some(key=>!allowed.has(key)))return usage();
  const trustedKeyPath=abs(flags.get("--trust-anchor"));if(!trustedKeyPath)return usage();
  const url=flags.get("--source-url");let source:ManagedAcquisitionSource;
  if(typeof url==="string"){
   if(flags.has("--manifest")||flags.has("--signature")||flags.has("--package-root"))return usage();
   source={kind:"https",baseUrl:url};
  }else{
   const manifestPath=abs(flags.get("--manifest")),signaturePath=abs(flags.get("--signature")),packageRoot=abs(flags.get("--package-root"));
   if(!manifestPath||!signaturePath||!packageRoot)return usage();
   source={kind:"local",manifestPath,signaturePath,packageRoot};
  }
  const yes=flags.get("--yes")===true,browser=flags.get("--browser")===true;
  if(yes===browser)return usage();
  if(browser){
   const timeout=flags.get("--timeout-ms");
   const outcome=await requestBrowserConsent({title:`ASEN ${action}`,
    lines:[`Operation: managed ${action}`,`Software prefix: ${prefix}`,`Data home (preserved): ${dataHome.dir}`,`Trust anchor: ${trustedKeyPath}`,"Only a manifest signed by that trust anchor will be installed."],
    ...(typeof timeout==="string"&&/^\d{1,7}$/u.test(timeout)?{timeoutMs:Number(timeout)}:{}),
    onUrl:url2=>{io.stderr(`Open ${url2} to confirm.\n`);if(flags.get("--no-open")!==true)(io.openBrowser??openInBrowser)(url2);}});
   if(outcome!=="confirmed"){io.stderr(`Browser consent ${outcome}; nothing was changed.\n`);return 1;}
  }
  const launcherConfig:AsenLauncherConfig=dataHome.mode==="path"?{mode:"path",dir:path.resolve(dataHome.dir)}:{mode:dataHome.mode};
  const protectedPaths=[path.resolve(dataHome.dir),path.join(prefix,"agent"),path.join(home,".pi","agent")];
  const result=action==="install"
   ?await installManaged({prefix,source,trustedKeyPath,protectedPaths,dataHome:path.resolve(dataHome.dir),launcherConfig,confirmed:true})
   :await upgradeManaged({prefix,source,trustedKeyPath,protectedPaths,allowDowngrade:flags.has("--allow-downgrade"),confirmed:true});
  out(result);
  return result.status==="installed"||result.status==="unchanged"||result.status==="upgraded"?0:1;
 }catch(error){
  if(error instanceof ManagedLifecycleError&&error.report)out(error.report);
  const kind=error instanceof ManagedLifecycleError||error instanceof ManagedTrustError||error instanceof HomeBackupError?(error as {code:string}).code:"ERROR";
  io.stderr(`ASEN ${verb} ${action??""} refused [${kind}]: ${scrub(error)}\n`);return 1;
 }
}
