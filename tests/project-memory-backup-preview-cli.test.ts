import assert from "node:assert/strict";
import {mkdir,mkdtemp,readFile,readdir,rm,stat,writeFile} from "node:fs/promises";
import path from "node:path";
import test,{type TestContext} from "node:test";
import {runAsen} from "../src/cli.js";
import {asenLauncherConfigPath,parseAsenArgs,parseDoctorArgs,parseManagedRunArgs,parseManagedSelectArgs} from "../src/runtime/launcher.js";

const USAGE="Unsupported ASEN backup project-memory command. Expected: backup project-memory --project <project-id> --destination <absolute-path> --dry-run.\n";
const SCHEMA="asen.project-memory-backup-preview/v1";
const SENTINEL=new Error("BACKUP_PREVIEW_HOME_LOOKUP_SENTINEL");

type Fixture=Awaited<ReturnType<typeof fixture>>;
type Json=Record<string,unknown>;

function sanitizedEnv(f?:Fixture):Record<string,string|undefined>{
 const systemRoot=process.env.SystemRoot??process.env.SYSTEMROOT;
 return {SystemRoot:systemRoot,WINDIR:systemRoot,OS:process.env.OS,PATH:path.dirname(process.execPath),PATHEXT:process.env.PATHEXT,
  HOME:f?.home,USERPROFILE:f?.home,TEMP:f?.root,TMP:f?.root,TMPDIR:f?.root,APPDATA:f?path.join(f.root,"appdata"):undefined,
  LOCALAPPDATA:f?path.join(f.root,"local"):undefined,XDG_CONFIG_HOME:f?path.join(f.root,"config"):undefined,
  XDG_CACHE_HOME:f?path.join(f.root,"cache"):undefined,XDG_DATA_HOME:f?path.join(f.root,"data"):undefined,
  TSX_DISABLE_CACHE:"1",ASEN_NO_SKILL_REGISTRY:"1"};
}
async function tree(root:string):Promise<unknown>{
 const info=await stat(root,{bigint:true}),children:unknown[]=[];
 for(const name of (await readdir(root)).sort()){
  const target=path.join(root,name),entry=await stat(target,{bigint:true});
  children.push([name,entry.isDirectory()?await tree(target):{bytes:(await readFile(target)).toString("base64"),mtimeNs:entry.mtimeNs}]);
 }
 return {mtimeNs:info.mtimeNs,children};
}
async function fixture(t:TestContext,name="preview ü"){
 const cache=path.resolve(".cache","asen-tests");await mkdir(cache,{recursive:true});
 const root=await mkdtemp(path.join(cache,"backup-preview-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const home=path.join(root,"private home "+name),configuredHome=path.join(root,"Pi data home ü"),destination=path.join(root,"never-created backup.json");
 await mkdir(path.dirname(asenLauncherConfigPath(home)),{recursive:true});
 await writeFile(asenLauncherConfigPath(home),JSON.stringify({home:configuredHome}));
 await writeFile(path.join(root,"sentinel.txt"),"unchanged");
 return {root,home,configuredHome,destination};
}
function args(projectId:string,destination:string){return ["backup","project-memory","--project",projectId,"--destination",destination,"--dry-run"];}
async function invoke(f:Fixture,argv:readonly string[]){
 let stdout="",stderr="",homeLookups=0,stdoutCalls=0,stderrCalls=0;
 const before=await tree(f.root);
 const code=await runAsen([...argv],sanitizedEnv(f),{homeDirectory:()=>{homeLookups++;return f.home;},stdout:text=>{stdoutCalls++;stdout+=text;},stderr:text=>{stderrCalls++;stderr+=text;}});
 assert.deepEqual(await tree(f.root),before,"backup preview changed isolated fixture bytes or mtimes");
 return {code,stdout,stderr,homeLookups,stdoutCalls,stderrCalls};
}
function expected(f:Fixture,projectId="project-a",destination=f.destination,launcherDataHome={mode:"path",dir:f.configuredHome,source:"config"}){
 return {schema:SCHEMA,requested:{projectId,destination},launcherDataHome,memorySource:"not-resolved",
  mechanism:{export:"MemoryStore.exportProject",backup:"createProjectMemoryBackup"},
  excluded:["telemetry-consent","pending-todo-state","agent-state","candidate-authority","write-authority","task-agent-links-as-authority","locks","receipts","review-results","grants","credentials","pi-and-custom-homes"],
  unconsented:["history","profiles"],unsupported:["workspace","usage","whole-home-backup","live-restore"],
  executable:false,authorized:false,storeAccess:"not-run",filesystemMutation:"not-run",backupCreated:false};
}

test("recognizes backup preview before home lookup",async()=>{
 let stdout="",stderr="",homeLookups=0,code:number|undefined,rejection:unknown;
 try{code=await runAsen(["backup","project-memory","--project","project-a","--destination",path.resolve(".cache","preview.json")],sanitizedEnv(),{
  homeDirectory:()=>{homeLookups++;throw SENTINEL;},stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;}});
 }catch(error){rejection=error;}
 assert.deepEqual({code,stdout,stderr,homeLookups,rejection},{code:2,stdout:"",stderr:USAGE,homeLookups:0,rejection:undefined});
});

test("rejects Windows drive-relative roots before home lookup",async()=>{
 let stdout="",stderr="",homeLookups=0,code:number|undefined,rejection:unknown;
 try{code=await runAsen(args("project-a","\\backup.json"),sanitizedEnv(),{
  homeDirectory:()=>{homeLookups++;throw SENTINEL;},stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;}});
 }catch(error){rejection=error;}
 assert.deepEqual({code,stdout,stderr,homeLookups,rejection},{code:2,stdout:"",stderr:USAGE,homeLookups:0,rejection:undefined});
});

test("rejects the fixed grammar and bounds before config or filesystem access",async t=>{
 const longProject="p".repeat(257),longDestination=path.resolve(".cache",`${"d".repeat(4090)}.json`);
 const cases:readonly (readonly [string,readonly string[]])[]=[
  ["missing project",["backup","project-memory","--destination",path.resolve("backup.json"),"--dry-run"]],
  ["missing destination",["backup","project-memory","--project","project-a","--dry-run"]],
  ["blank project",args(" ",path.resolve("backup.json"))],["control project",args("a\nb",path.resolve("backup.json"))],["oversized project",args(longProject,path.resolve("backup.json"))],
  ["blank destination",args("project-a","")],["relative destination",args("project-a","backup.json")],["control destination",args("project-a",path.resolve("backup.json")+"\n")],["oversized destination",args("project-a",longDestination)],
  ["duplicate project",[...args("project-a",path.resolve("backup.json")),"--project","project-b"]],["duplicate destination",[...args("project-a",path.resolve("backup.json")),"--destination",path.resolve("other.json")]],
  ["duplicate dry-run",[...args("project-a",path.resolve("backup.json")),"--dry-run"]],
  ["reordered",["backup","project-memory","--destination",path.resolve("backup.json"),"--project","project-a","--dry-run"]],
  ["trailing",[...args("project-a",path.resolve("backup.json")),"extra"]],
  ["package root",["--package-root",path.resolve("."),...args("project-a",path.resolve("backup.json"))]],
 ];
 for(const [name,argv] of cases)await t.test(name,async t=>{
  const f=await fixture(t,name),result=await invoke(f,argv);
  assert.deepEqual(result,{code:2,stdout:"",stderr:USAGE,homeLookups:0,stdoutCalls:0,stderrCalls:1});
 });
});

test("prints the exact stable preview after valid grammar and one config lookup",async t=>{
 const f=await fixture(t),destinations=[f.destination,"/var/tmp/asen-preview.json","C:\\asen\\preview.json","/"+"d".repeat(4095)],projects=["project-a","p".repeat(256)];
 for(const projectId of projects)for(const destination of destinations){const result=await invoke(f,args(projectId,destination)),report=expected(f,projectId,destination);
  assert.deepEqual(result,{code:0,stdout:JSON.stringify(report,null,2)+"\n",stderr:"",homeLookups:1,stdoutCalls:1,stderrCalls:0});
  assert.equal(JSON.stringify(report).includes("memory.db"),false);assert.equal(JSON.stringify(report).includes(f.home),false);
 }
});

test("conflicting selectors preserve the existing selector error",async t=>{
 const f=await fixture(t,"selector conflict"),result=await invoke(f,["--link","--isolated",...args("project-a",f.destination)]);
 assert.deepEqual(result,{code:2,stdout:"",stderr:"--link and --isolated are mutually exclusive\n",homeLookups:0,stdoutCalls:0,stderrCalls:1});
});

test("valid grammar preserves config-read and stdout-callback failures without effects",async t=>{
 const unreadable=await fixture(t,"unreadable");await rm(asenLauncherConfigPath(unreadable.home));await mkdir(asenLauncherConfigPath(unreadable.home));
 assert.deepEqual(await invoke(unreadable,args("project-a",unreadable.destination)),{code:2,stdout:"",stderr:"Unable to read ASEN launcher configuration\n",homeLookups:1,stdoutCalls:0,stderrCalls:1});
 const f=await fixture(t,"stdout"),before=await tree(f.root),failure=new Error("BACKUP_PREVIEW_STDOUT_FAILURE");let lookups=0,stderr="",attempts=0;
 await assert.rejects(runAsen(args("project-a",f.destination),sanitizedEnv(f),{homeDirectory:()=>{lookups++;return f.home;},stdout:()=>{attempts++;throw failure;},stderr:text=>{stderr+=text;}}),error=>error===failure);
 assert.deepEqual({lookups,stderr,attempts},{lookups:1,stderr:"",attempts:1});assert.deepEqual(await tree(f.root),before);
});

test("reports Pi-only launcher home precedence without resolving a memory source",async t=>{
 const f=await fixture(t),explicit=path.join(f.root,"explicit Pi home"),linked=path.join(f.root,"linked Pi home"),isolated=path.join(f.home,".asen","agent");
 const cases=[
  {name:"explicit",prefix:["--home",explicit],env:{},home:{mode:"path",dir:explicit,source:"flag"}},
  {name:"isolated",prefix:["--isolated"],env:{},home:{mode:"isolated",dir:isolated,source:"flag"}},
  {name:"link",prefix:["--link"],env:{PI_CODING_AGENT_DIR:linked},home:{mode:"link",dir:linked,source:"flag"}},
 ] as const;
 for(const item of cases)await t.test(item.name,async()=>{
  let stdout="",stderr="",lookups=0;const before=await tree(f.root);
  const code=await runAsen([...item.prefix,...args("project-a",f.destination)],{...sanitizedEnv(f),...item.env},{homeDirectory:()=>{lookups++;return f.home;},stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;}});
  assert.deepEqual({code,stdout,stderr,lookups},{code:0,stdout:JSON.stringify(expected(f,"project-a",f.destination,item.home),null,2)+"\n",stderr:"",lookups:1});assert.deepEqual(await tree(f.root),before);
 });
});

test("preserves existing parser namespaces and literal Pi passthrough",async t=>{
 assert.equal(parseDoctorArgs(["doctor"]).kind,"doctor");assert.equal(parseManagedSelectArgs(["managed","select","1.2.0","--expected-current","1.1.0"]).kind,"select");
 const managed=parseManagedRunArgs(["managed","run","1.2.0","--","backup","project-memory","--dry-run"]);assert.equal(managed.kind,"run");if(managed.kind==="run")assert.deepEqual(managed.piArgs,["backup","project-memory","--dry-run"]);
 assert.deepEqual(parseAsenArgs(["install","backup"]).passthrough,["install","backup"]);assert.deepEqual(parseAsenArgs(["--","backup","project-memory"]).passthrough,["backup","project-memory"]);
 const f=await fixture(t,"literal");for(const argv of [["--package-root",f.root,"install","backup"],["--package-root",f.root,"--","backup","project-memory"]]){
  const result=await invoke(f,argv);assert.deepEqual(result,{code:1,stdout:"",stderr:"Pi runtime not found\n",homeLookups:1,stdoutCalls:0,stderrCalls:1});
 }
});

test("pure preview reports are deeply frozen",async t=>{
 const f=await fixture(t,"frozen"),before=await tree(f.root),moduleName="../src/runtime/project-memory-backup-preview.js",loaded=await import(moduleName) as Record<string,unknown>;
 assert.equal(typeof loaded.createProjectMemoryBackupPreview,"function");
 const create=loaded.createProjectMemoryBackupPreview as (request:{projectId:string;destination:string;launcherDataHome:{mode:"isolated";dir:string;source:"default"}})=>Json;
 const report=create({projectId:"project-a",destination:f.destination,launcherDataHome:{mode:"isolated",dir:f.configuredHome,source:"default"}});
 const visit=(value:unknown)=>{if(value&&typeof value==="object"){assert.equal(Object.isFrozen(value),true);for(const child of Object.values(value))visit(child);}};visit(report);assert.deepEqual(await tree(f.root),before);
});
