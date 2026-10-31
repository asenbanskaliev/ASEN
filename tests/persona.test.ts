import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {mkdir,mkdtemp,readFile,readdir,realpath,rm,stat,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createAsenExtension} from "../extensions/asen.js";

const schema="asen.persona/v1";
const professional="Use a professional, direct, and respectful communication style. Keep responses clear and concise.";
const neutral="Use a neutral, direct, and concise communication style.";
const forbidden=new RegExp(["Gen"+"tleman","permission","authority","tool","model","thinking"].join("|"),"iu");

type RegisteredCommand={description:string;handler:(args?:string,context?:any)=>unknown};
function publicHost(){
 const commands=new Map<string,RegisteredCommand>(),events=new Map<string,Function[]>(),tools=new Map<string,unknown>();
 return {commands,events,tools,pi:{
  registerCommand(name:string,command:RegisteredCommand){commands.set(name,command);},
  registerTool(tool:{name:string}){tools.set(tool.name,tool);},
  on(name:string,handler:Function){events.set(name,[...(events.get(name)??[]),handler]);},
 }};
}
async function fixture(t:TestContext){
 const root=await mkdtemp(path.join(tmpdir(),"asen-persona-")),home=path.join(root,"h"),project=path.join(root,"p");
 await Promise.all([mkdir(home,{recursive:true}),mkdir(project,{recursive:true})]);
 t.after(()=>rm(root,{recursive:true,force:true}));
 return {root,home,project:await realpath(project),globalFile:path.join(home,".asen","persona.json"),projectFile:path.join(project,".asen","persona.json")};
}
function context(cwd:string,notices:string[]=[],confirmCounter={value:0}){
 return {cwd,hasUI:true,sessionManager:{getSessionId:()=>"persona-public-session"},ui:{notify:(message:string)=>notices.push(message),confirm:async()=>{confirmCounter.value++;return true;},setWidget(){}}};
}
async function promptSections(events:Map<string,Function[]>,ctx:any,seed:Record<string,string>={}){
 const sections={...seed};
 await events.get("before_agent_start")?.[0]?.({prompt:"Explain the result",systemPromptOptions:{sections}},ctx);
 return sections;
}
async function exists(file:string){try{await stat(file);return true;}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return false;throw error;}}

// This file imports the existing public extension entry only. The first RED must be
// the absent public command/style behavior, never a missing persona module import.
test("public persona command exposes the professional default in one dedicated prompt section",async t=>{
 const f=await fixture(t),host=publicHost();
 createAsenExtension({homeDir:()=>f.home,packageRoot:f.root})(host.pi as any);
 assert.ok(host.commands.has("asen-persona"),"/asen-persona must be registered by the public ASEN extension");
 const status=await host.commands.get("asen-persona")!.handler("",context(f.project));
 assert.deepEqual(status,{style:"professional",source:"default",available:true});
 assert.equal(await exists(f.globalFile),false);assert.equal(await exists(f.projectFile),false,"status must not create persona state");
 const existing={security_boundary:"permission sentinel"};
 const sections=await promptSections(host.events,context(f.project),existing);
 assert.equal(sections.security_boundary,existing.security_boundary);assert.equal(typeof sections.asen_request_handling,"string");
 const repeated=await promptSections(host.events,context(f.project),existing);
 assert.deepEqual(Object.fromEntries(Object.entries(repeated).filter(([key])=>key!=="asen_persona_style")),Object.fromEntries(Object.entries(sections).filter(([key])=>key!=="asen_persona_style")));
 assert.equal(sections.asen_persona_style,professional);
 assert.equal(Object.keys(sections).filter(key=>key==="asen_persona_style").length,1);
 assert.doesNotMatch(sections.asen_persona_style,new RegExp(["Gen"+"tleman","permission","authority","tool","model","thinking"].join("|"),"iu"));
});

test("public persona selection persists a strict enum with global and existing-project precedence",async t=>{
 const f=await fixture(t),host=publicHost(),notices:string[]=[];
 createAsenExtension({homeDir:()=>f.home,packageRoot:f.root})(host.pi as any);
 const command=host.commands.get("asen-persona");assert.ok(command,"public persona command is required");
 assert.deepEqual(await command.handler("neutral",context(f.project,notices)),{style:"neutral",source:"global",available:true});
 assert.deepEqual(JSON.parse(await readFile(f.globalFile,"utf8")),{schema,style:"neutral"});
 assert.equal(await exists(f.projectFile),false,"global selection must not create a project override");
 assert.equal((await promptSections(host.events,context(f.project))).asen_persona_style,neutral);
 assert.deepEqual((await readdir(path.dirname(f.globalFile))).sort(),["persona.json"],"atomic persistence must not leave lock/temp files");

 await mkdir(path.dirname(f.projectFile),{recursive:true});
 await writeFile(f.globalFile,`${JSON.stringify({schema,style:"professional"},null,2)}\n`);
 await writeFile(f.projectFile,`${JSON.stringify({schema,style:"professional"},null,2)}\n`);
 const globalBefore=await readFile(f.globalFile,"utf8");
 assert.deepEqual(await command.handler("",context(f.project)),{style:"professional",source:"project",available:true});
 assert.equal((await promptSections(host.events,context(f.project))).asen_persona_style,professional);
 assert.deepEqual(await command.handler("neutral",context(f.project)),{style:"neutral",source:"project",available:true});
 assert.deepEqual(JSON.parse(await readFile(f.projectFile,"utf8")),{schema,style:"neutral"});
 assert.deepEqual(JSON.parse(await readFile(f.globalFile,"utf8")),{schema,style:"neutral"},"selection must update global state even when a project override exists");
 assert.notEqual(await readFile(f.globalFile,"utf8"),globalBefore);
 assert.deepEqual((await readdir(path.dirname(f.projectFile))).sort(),["persona.json"]);
});

test("malformed persona state is reported unavailable and is never overwritten as a successful selection",async t=>{
 const f=await fixture(t),host=publicHost(),raw="{malformed persona state\n";
 await mkdir(path.dirname(f.globalFile),{recursive:true});await writeFile(f.globalFile,raw);
 createAsenExtension({homeDir:()=>f.home,packageRoot:f.root})(host.pi as any);
 const command=host.commands.get("asen-persona");assert.ok(command,"public persona command is required");
 assert.deepEqual(await command.handler("",context(f.project)),{style:"professional",source:"default",available:false});
 await assert.rejects(async()=>await command.handler("neutral",context(f.project)),/Invalid persona configuration/);
 assert.equal(await readFile(f.globalFile,"utf8"),raw);
});

test("invalid persona input leaves state, counters, routing, tools and confirmation boundaries unchanged",async t=>{
 const f=await fixture(t),profilesFile=path.join(f.home,".asen","profiles.json"),usageFile=path.join(f.home,".asen","usage.json");
 await Promise.all([mkdir(path.dirname(f.globalFile),{recursive:true}),mkdir(path.dirname(f.projectFile),{recursive:true})]);
 await writeFile(f.globalFile,`${JSON.stringify({schema,style:"neutral"},null,2)}\n`);
 await writeFile(f.projectFile,`${JSON.stringify({schema,style:"professional"},null,2)}\n`);
 await writeFile(profilesFile,`${JSON.stringify({schema:"asen.runtime-profiles/v1",active:"fixed",profiles:[{name:"fixed",routes:{worker:{model:"provider/model",thinking:"low"},reviewer:{model:"provider/reviewer"},verifier:{thinking:"high"}}}]},null,2)}\n`);
 await writeFile(usageFile,"usage-counter-sentinel\n");
 const host=publicHost(),notices:string[]=[],confirms={value:0};
 createAsenExtension({homeDir:()=>f.home,packageRoot:f.root,profilesFile})(host.pi as any);
 const command=host.commands.get("asen-persona");assert.ok(command,"public persona command is required");
 const ctx=context(f.project,notices,confirms),before={global:await readFile(f.globalFile),project:await readFile(f.projectFile),profiles:await readFile(profilesFile),usage:await readFile(usageFile),events:[...host.events.keys()].sort(),tools:[...host.tools.keys()].sort()};
 const planFacts=JSON.stringify({taskIdentity:"persona-preserves-routing",instruction:"Change only docs/example.md",intent:"implementation",scope:{kind:"known",expectedPaths:["docs/example.md"]},writes:[{path:"docs/example.md",changeKind:"documentation"}],riskOperations:[],session:{estimatedMinutes:10,continuation:false},testing:{kind:"required"},review:{kind:"dual_explicit",estimatedMinutes:5},unresolvedDecisions:[]});
 const route=async()=>{const value=JSON.parse(String(await host.commands.get("asen-plan")!.handler(planFacts,ctx)));return value.executablePlan.tasks.map((item:any)=>({role:item.role,model:item.model,thinking:item.thinking,writeSurfaces:item.writeSurfaces}));};
 const routeBefore=await route(),noticeBefore=notices.length;
 assert.equal(await command.handler("unknown-persona",ctx),"Usage: /asen-persona [professional | neutral | simple]");
 assert.equal(await command.handler("neutral extra",ctx),"Usage: /asen-persona [professional | neutral | simple]");
 assert.deepEqual({global:await readFile(f.globalFile),project:await readFile(f.projectFile),profiles:await readFile(profilesFile),usage:await readFile(usageFile)},{global:before.global,project:before.project,profiles:before.profiles,usage:before.usage});
 assert.equal(notices.length,noticeBefore+2,"invalid public commands follow the existing one-notification-per-command convention");
 const noticesBeforeRouteCheck=notices.length;assert.deepEqual(await route(),routeBefore);assert.equal(notices.length,noticesBeforeRouteCheck+1,"the existing plan command keeps its notification convention");
 assert.deepEqual([...host.events.keys()].sort(),before.events);assert.deepEqual([...host.tools.keys()].sort(),before.tools);
 assert.equal(confirms.value,0,"persona selection and invalid input must not cross permission confirmations");
 assert.equal((await promptSections(host.events,ctx)).asen_persona_style,professional,"invalid input cannot change the effective project style");
});

test("simple persona selects a plain-language style that is short, self-contained and free of internal vocabulary",async t=>{
 const f=await fixture(t),host=publicHost();
 createAsenExtension({homeDir:()=>f.home,packageRoot:f.root})(host.pi as any);
 const command=host.commands.get("asen-persona");assert.ok(command,"public persona command is required");
 assert.deepEqual(await command.handler("simple",context(f.project)),{style:"simple",source:"global",available:true});
 assert.deepEqual(JSON.parse(await readFile(f.globalFile,"utf8")),{schema,style:"simple"});
 const text=(await promptSections(host.events,context(f.project))).asen_persona_style??"";
 assert.match(text,/never programmed/u);assert.match(text,/everyday words/u);assert.match(text,/real-life example/u);
 assert.doesNotMatch(text,forbidden);assert.ok(text.length<1200,"the injected style is paid on every turn and must stay small");
});
