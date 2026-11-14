import assert from "node:assert/strict";
import {test,mock,after} from "node:test";
import childProcess from "node:child_process";
import {syncBuiltinESMExports} from "node:module";
import {EventEmitter} from "node:events";
import {pathToFileURL} from "node:url";
import {mkdtemp,mkdir,writeFile,rm,readdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {DefaultResourceLoader,SettingsManager,parseArgs} from "@earendil-works/pi-coding-agent";
import {runAsen,launcherPackageRoot} from "../src/cli.js";

// No Pi process, installer, AgentSession, model, or product extension is executed.
// Self-owned synthetic resource-loader fixture. Never loads private .asen-audit grants.
const audit=await mkdtemp(path.join(tmpdir(),"asen-public-skill-fixtures-"));
await mkdir(path.join(audit,"tmp"));
after(async()=>rm(audit,{recursive:true,force:true}));
async function fixture(run:(f:{root:string;pkg:string;cwd:string;agent:string;home:string})=>Promise<void>){
 const root=await mkdtemp(path.join(audit,"tmp",`skill-launcher-${process.env.ASEN_SKILL_LAUNCHER_PHASE??"green"}-`));
 const environmentKeys=["TEMP","TMP","TMPDIR","HOME","USERPROFILE"];
 const previousTemp=environmentKeys.map(key=>process.env[key]);
 for(const key of environmentKeys)process.env[key]=root;
 try{
  const pkg=path.join(root,"own package"),cwd=path.join(root,"project"),agent=path.join(root,"agent"),home=path.join(root,"home");
  // A marker only, not a Git repository: bound SDK ancestor skill discovery to this fixture.
  for(const dir of [pkg,cwd,path.join(cwd,".git"),agent,home,path.join(pkg,"skills","owned")])await mkdir(dir,{recursive:true});
  await writeFile(path.join(pkg,"package.json"),JSON.stringify({name:"asen",pi:{extensions:["./extension.mjs"],skills:["./skills"]}}));
  await writeFile(path.join(pkg,"extension.mjs"),'export default function(pi) { pi.registerCommand("owned-fixture", {handler: async () => {}}); }');
  await writeFile(path.join(pkg,"skills","owned","SKILL.md"),"---\nname: owned\ndescription: Owned fixture skill\n---\nFixture instructions.\n");
  await run({root,pkg,cwd,agent,home});
 }finally{
  for(const [index,key] of environmentKeys.entries()){
   if(previousTemp[index]===undefined)delete process.env[key];else process.env[key]=previousTemp[index];
  }
  await rm(root,{recursive:true,force:true});
 }
}
async function discover(f:{cwd:string;agent:string},extensions:string[]=[],flags:string[]=[],trusted=false){
 const parsed=parseArgs([...flags,...extensions.flatMap(p=>["-e",p])]);
 const loader=new DefaultResourceLoader({cwd:f.cwd,agentDir:f.agent,
  settingsManager:SettingsManager.create(f.cwd,f.agent,{projectTrusted:trusted}),
  additionalExtensionPaths:parsed.extensions??[],additionalSkillPaths:parsed.skills??[],noSkills:parsed.noSkills??false,noExtensions:parsed.noExtensions??false,
  noContextFiles:true,noPromptTemplates:true,noThemes:true});
 await loader.reload();
 assert.deepEqual(loader.getExtensions().errors,[]);
 return {skills:loader.getSkills().skills.map(s=>s.name),extensions:loader.getExtensions().extensions.map(e=>path.basename(e.path))};
}

async function aliasCli(f:{cwd:string;agent:string;pkg:string;home:string},run:(launch:(args:string[],exit?:number,error?:string)=>Promise<string[]>)=>Promise<void>){
 const cwd=process.cwd();process.chdir(f.cwd);
 let forwarded:string[]=[],calls=0;
 const spawnMock=mock.method(childProcess,"spawn",((_command:string,args:string[],options:{env:NodeJS.ProcessEnv})=>{
  calls++;assert.equal(options.env.PI_CODING_AGENT_DIR,f.agent);assert.equal(process.cwd(),f.cwd);
  forwarded=args;const child=new EventEmitter();queueMicrotask(()=>child.emit("exit",0));return child;
 }) as typeof childProcess.spawn);syncBuiltinESMExports();
 try{await run(async(args,expectedExit=0,expectedError="")=>{
  const before=calls;forwarded=[];let stderr="",stdout="";
  const exit=await runAsen(["--home",f.agent,"--package-root",f.pkg,...args],
   {ASEN_PI:"fake-pi",HOME:process.env.HOME,USERPROFILE:process.env.USERPROFILE},
   {homeDirectory:()=>f.home,stderr:text=>{stderr+=text;},stdout:text=>{stdout+=text;}});
  assert.equal(stdout,"");assert.equal(stderr,expectedError);assert.equal(exit,expectedExit);assert.equal(calls-before,expectedExit===0?1:0);return forwarded;
 });}finally{spawnMock.mock.restore();syncBuiltinESMExports();process.chdir(cwd);}
}

test("consumed Pi literals cannot become ASEN selectors or commands",async()=>fixture(async f=>aliasCli(f,async launch=>{
 // First case has no path after the literal: the old parser fails before any bootstrap.
 for(const literal of ["--home","--package-root","--cwd","--link","--isolated","--help","--version","home","setup","list"]){
  const input=["--system-prompt",literal];
  assert.equal(parseArgs(input).systemPrompt,literal);
  assert.deepEqual(await launch(input),["-e",f.pkg,...input]);
 }
 for(const option of ["--append-system-prompt","--model","--name","--session"]){
  const input=[option,"--home",f.home];assert.deepEqual(await launch(input),["-e",f.pkg,...input]);
 }
 assert.deepEqual(await launch(["--home",f.agent,"--cwd",f.cwd]),["-e",f.pkg,"--cwd",f.cwd]);
 // --cwd is existing passthrough, not an ASEN selector (including when valueless).
 assert.deepEqual(await launch(["--cwd"]),["-e",f.pkg,"--cwd"]);
 const before=await Promise.all([f.root,f.agent,f.home].map(dir=>readdir(dir)));
 for(const flag of ["--home","--package-root"]){
  assert.deepEqual(await launch([flag],2,`${flag} requires a non-empty path\n`),[]);
 }
 assert.deepEqual(await Promise.all([f.root,f.agent,f.home].map(dir=>readdir(dir))),before);
})));

test("filtered own-package aliases do not bypass SDK settings filters",async()=>fixture(async f=>aliasCli(f,async launch=>{
 const aliases=[pathToFileURL(f.pkg).href,` ${f.pkg} `,"~/own package",path.relative(f.agent,f.pkg)];
 if(process.platform==="win32"){
  const drive=f.pkg[0]!.toLowerCase(),suffix=f.pkg.slice(3).replaceAll("\\","/");
  aliases.push("~\\own package",...['/', '/mnt/', '/cygdrive/'].map(prefix=>`${prefix}${drive}/${suffix}`));
 }
 for(const source of aliases){
  await writeFile(path.join(f.agent,"settings.json"),JSON.stringify({packages:[{source,skills:[],extensions:[]}]}));
  assert.deepEqual(await discover(f),{skills:[],extensions:[]},`SDK filters: ${source}`);
  const args=await launch(["--print","hello"]);
  assert.deepEqual(args,["--print","hello"],`launcher preserves filters: ${source}`);
  assert.deepEqual(await discover(f,[],args),{skills:[],extensions:[]});
 }
 await writeFile(path.join(f.agent,"settings.json"),"{}");
 for(const source of aliases.filter(alias=>alias===alias.trim()&&alias!==path.relative(f.agent,f.pkg))){
  const explicit=["-e",source];assert.deepEqual(await launch(explicit),explicit);
  assert.deepEqual(await discover(f,[],explicit),{skills:["owned"],extensions:["extension.mjs"]});
 }
})));

test("consumed Pi argument values are not resource exclusion or extension flags",async()=>fixture(async f=>aliasCli(f,async launch=>{
 for(const option of ["--system-prompt","--append-system-prompt","--model","--name","--session"]){
  for(const literal of ["--no-skills","-ns","--no-extensions","-ne","-e","--extension"]){
   const input=[option,literal,f.pkg],parsed=parseArgs(input);
   assert.equal(parsed.noSkills,undefined);assert.equal(parsed.noExtensions,undefined);assert.equal(parsed.extensions,undefined);
   const args=await launch(input);assert.deepEqual(args,["-e",f.pkg,...input]);
   assert.deepEqual(await discover(f,[],args),{skills:["owned"],extensions:["extension.mjs"]});
  }
 }
})));

test("SDK characterization: declaration, explicit package, exclusions and trust",async()=>fixture(async f=>{
 assert.deepEqual(await discover(f),{skills:[],extensions:[]});
 const own={skills:["owned"],extensions:["extension.mjs"]};
 assert.deepEqual(await discover(f,[f.pkg]),own);
 // Explicit CLI package resources bypass these discovery exclusions in Pi 1.2.0.
 assert.deepEqual(await discover(f,[f.pkg],["--no-skills","--no-extensions"]),own);
 await writeFile(path.join(f.agent,"settings.json"),JSON.stringify({packages:[f.pkg]}));
 assert.deepEqual(await discover(f),own);
 assert.deepEqual(await discover(f,[f.pkg]),own,"SDK deduplicates registered and explicit resource paths");
 assert.deepEqual(await discover(f,[],["--no-skills","--no-extensions"]),{skills:[],extensions:[]});
 await writeFile(path.join(f.agent,"settings.json"),"{}");
 await mkdir(path.join(f.cwd,".pi"));
 await writeFile(path.join(f.cwd,".pi","settings.json"),JSON.stringify({packages:[f.pkg]}));
 assert.deepEqual(await discover(f),{skills:[],extensions:[]},"untrusted project package stays excluded");
 assert.deepEqual(await discover(f,[],[],true),own);
}));

test("public CLI forwards self resources once without overriding user exclusions",async()=>fixture(async f=>{
 const oldCwd=process.cwd();process.chdir(f.cwd);
 const calls:{command:string;args:string[];env:NodeJS.ProcessEnv|undefined}[]=[];
 const spawnMock=mock.method(childProcess,"spawn",((command:string,args:string[],options:{env:NodeJS.ProcessEnv})=>{
  calls.push({command,args,env:options.env});const child=new EventEmitter();queueMicrotask(()=>child.emit("exit",0));return child;
 }) as typeof childProcess.spawn);
 syncBuiltinESMExports();
 try{
  const launch=async(flags:string[])=>{
   calls.length=0;
   const code=await runAsen(["--home",f.agent,"--package-root",f.pkg,...flags],
    {ASEN_PI:"fake-pi"},{homeDirectory:()=>f.home,stdout:()=>{},stderr:()=>{}});
   assert.equal(code,0);assert.equal(calls.length,1);
   const call=calls[0]!;assert.equal(call.env?.ASEN_PACKAGE_ROOT,f.pkg);assert.equal(call.env?.PI_CODING_AGENT_DIR,f.agent);
   assert.equal(process.cwd(),f.cwd);return call;
  };
  const normal=await launch(["--print","hello with spaces"]);
  assert.equal(normal.command,"fake-pi");
  assert.deepEqual(normal.args,["-e",f.pkg,"--print","hello with spaces"]);
  assert.deepEqual(await discover(f,[],normal.args),{skills:["owned"],extensions:["extension.mjs"]});
  for(const flag of ["--no-skills","-ns","--no-extensions","-ne"]){
   const call=await launch([flag,"--print","hello"]);
   assert.deepEqual(call.args,[flag,"--print","hello"]);
   assert.deepEqual(await discover(f,[],call.args),{skills:[],extensions:[]});
  }
  for(const flag of ["-e","--extension"]){
   const explicit=[flag,path.relative(f.cwd,f.pkg),"--print","hello"];
   assert.deepEqual((await launch(explicit)).args,explicit);
   assert.deepEqual(await discover(f,[],explicit),{skills:["owned"],extensions:["extension.mjs"]});
  }
  const foreign=path.join(f.root,"foreign.mjs");await writeFile(foreign,"export default function() {} ");
  const flags=["-e",foreign,"--skill",path.join(f.pkg,"skills","owned"),"--print","hello"];
  const foreignCall=await launch(flags);
  assert.deepEqual(foreignCall.args,["-e",f.pkg,...flags]);
  assert.deepEqual(await discover(f,[],foreignCall.args),{skills:["owned"],extensions:["extension.mjs","foreign.mjs"]});
  const explicitDisabled=["--no-skills","--no-extensions","-e",f.pkg,"-e",f.pkg];
  assert.deepEqual((await launch(explicitDisabled)).args,explicitDisabled);
  assert.deepEqual(await discover(f,[],explicitDisabled),{skills:["owned"],extensions:["extension.mjs"]});
  for(const subcommand of ["list","config","auth","install"]){
   const flags=[subcommand,"literal spaced path"];
   assert.deepEqual((await launch(flags)).args,flags);
  }
  assert.deepEqual((await launch(["unknown-command","--","literal spaced path"])).args,["-e",f.pkg,"unknown-command","literal spaced path"]);
  await writeFile(path.join(f.agent,"settings.json"),JSON.stringify({packages:[{source:f.pkg,skills:[]}]}));
  assert.deepEqual((await launch(["--print","hello"])).args,["--print","hello"],"do not bypass configured package filters");
  calls.length=0;
  for(const flags of [["--help"],["--version"],["home"]]){
   assert.equal(await runAsen(flags,{}, {homeDirectory:()=>f.home,stdout:()=>{},stderr:()=>{}}),0);
  }
  assert.equal(calls.length,0);
  // The real bundled executable prefix is retained; the spawn is still fake.
  const result=await runAsen(["--home",f.agent,"--print","hello"],{}, {homeDirectory:()=>f.home,stdout:()=>{},stderr:()=>{}});
  assert.equal(result,0);assert.equal(calls[0]!.command,process.execPath);
  assert.deepEqual(calls[0]!.args,[path.join(launcherPackageRoot(),"node_modules","@earendil-works","pi-coding-agent","dist","cli.js"),"-e",launcherPackageRoot(),"--print","hello"]);
 }finally{spawnMock.mock.restore();syncBuiltinESMExports();process.chdir(oldCwd);}
}));
