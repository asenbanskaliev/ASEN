import assert from "node:assert/strict";
import test from "node:test";
import {inspectIntegrationProfiles} from "../src/runtime/integration-profile-inspection.js";
import {ASEN_PROFILES_SCHEMA,resolveRuntimeRoute,type ProfileLayer,type RuntimeProfilesFile} from "../src/runtime/profiles.js";
import type {SessionProfileSnapshot} from "../src/runtime/session-profile-binding.js";

const file=(name:string,routes:RuntimeProfilesFile["profiles"][number]["routes"]):RuntimeProfilesFile=>
 ({schema:ASEN_PROFILES_SCHEMA,active:name,profiles:[{name,routes}]});
const empty={state:"empty",entries:[],limited:false,diagnostic:"No entries reported; configuration and connectivity are unknown."};
const unavailable={state:"unavailable",entries:[],limited:false,diagnostic:"Inventory unavailable."};

test("missing readers differ from empty public inventory, without total server/extension counts",()=>{
 assert.deepEqual(inspectIntegrationProfiles({}).commands,unavailable);
 const result=inspectIntegrationProfiles({getCommands:()=>[],getAllTools:()=>[]});
 assert.deepEqual(result.commands,empty);
 assert.deepEqual(result.tools,empty);
 assert.deepEqual(Object.keys(result),["commands","tools","profiles"]);
});

test("registered namespace is not a connection-health claim",()=>{
 const result=inspectIntegrationProfiles({getAllTools:()=>[{name:"lookup",namespace:{name:"mcp__docs"},sourceInfo:{scope:"user",origin:"package"}}]});
 assert.deepEqual(result.tools,{state:"reported",entries:[{name:"lookup",namespace:"mcp__docs",status:"registered",connection:"unknown",provenance:{source:"unknown",scope:"user",origin:"package"}}],limited:false});
});

test("commands retain only public name and canonical coarse provenance",()=>{
 const result=inspectIntegrationProfiles({getCommands:()=>[{name:"skill:guide",source:"skill",sourceInfo:{scope:"project",origin:"top-level",source:"https://private",path:"C:\\private",baseDir:"/private"},description:"secret"}]});
 assert.deepEqual(result.commands,{state:"reported",entries:[{name:"skill:guide",status:"configured",connection:"unknown",provenance:{source:"skill",scope:"project",origin:"top-level"}}],limited:false});
});

test("private names, namespaces, descriptions, URLs, auth and environment are omitted",()=>{
 const rows=[{name:"safe",namespace:{name:"https://private",description:"secret"},description:"secret",env:{TOKEN:"secret"},auth:"secret"},
 ...["/private/path","C:\\private","https://private","$TOKEN","a=b","escape\u001b[2J","x".repeat(97)].map(name=>({name}))];
 const before=structuredClone(rows);
 const result=inspectIntegrationProfiles({getAllTools:()=>rows});
 assert.deepEqual(result.tools,{state:"reported",entries:[{name:"safe",status:"registered",connection:"unknown",provenance:{source:"unknown"}}],limited:true});
 assert.deepEqual(rows,before);
});

test("reader and metadata failures are generic and independent",()=>{
 const bad={get name():string{throw new Error("private URL and credentials");}};
 for(const getCommands of [()=>{throw new Error("private");},()=>[bad],()=>null as never]){
  const result=inspectIntegrationProfiles({getCommands,getAllTools:()=>[]});
  assert.deepEqual(result.commands,unavailable);
  assert.deepEqual(result.tools,empty);
 }
});

test("bounded scan and output explicitly mark incomplete inventory",()=>{
 let lateRead=false;
 const rows=Array.from({length:300},(_,i)=>({name:`tool${i}`}));
 Object.defineProperty(rows,256,{get(){lateRead=true;throw new Error("outside scan");}});
 const result=inspectIntegrationProfiles({getAllTools:()=>rows});
 assert.equal(result.tools.entries.length,32);
 assert.equal(result.tools.limited,true);
 assert.equal(lateRead,false);
 assert.equal(result.tools.state,"reported");
});

test("profile inspection reuses route precedence and retains configured role/source, never actual execution",()=>{
 const layers:ProfileLayer={session:file("session",{writer:{model:"session-model",thinking:"high"}}),project:file("project",{writer:{model:"project-model"},reviewer:{thinking:"low"}}),global:file("global",{planner:{}})};
 const before=structuredClone(layers);
 const result=inspectIntegrationProfiles({profiles:{layers,projectState:"loaded",roles:["writer","reviewer","planner","missing"]}}).profiles;
 assert.deepEqual(result,{state:"available",routes:[
  {role:"writer",source:"session",configured:true,model:"configured",thinking:"high",actual:"unknown"},
  {role:"reviewer",source:"project",configured:true,model:"unspecified",thinking:"low",actual:"unknown"},
  {role:"planner",source:"global",configured:true,model:"unspecified",actual:"unknown"},
  {role:"missing",source:"default",configured:false,model:"unspecified",actual:"unknown"}],limited:false});
 for(const row of result.routes)assert.equal(row.source,resolveRuntimeRoute(layers,row.role).source);
 assert.deepEqual(layers,before);
});

test("explicit session snapshot overrides project while missing session role falls through",()=>{
 const snapshot:SessionProfileSnapshot={active:"frozen",source:"explicit-session",file:file("frozen",{writer:{model:"private/model"}})};
 const input={layers:{global:file("changed",{writer:{thinking:"low"}}),project:file("repo",{writer:{thinking:"low"},reviewer:{thinking:"medium"}})},projectState:"loaded" as const,roles:["writer","reviewer"],snapshot};
 const before=structuredClone(input);
 const result=inspectIntegrationProfiles({profiles:input}).profiles;
 assert.deepEqual(result.snapshot,{active:"frozen",source:"explicit-session",frozen:true,lifetime:"in-process",restartDurability:"unproven"});
 assert.deepEqual(result.routes,[{role:"writer",source:"session",configured:true,model:"configured",actual:"unknown"},{role:"reviewer",source:"project",configured:true,model:"unspecified",thinking:"medium",actual:"unknown"}]);
 assert.deepEqual(input,before);
 snapshot.file.profiles[0]!.routes.writer!.thinking="high";
 assert.equal(result.routes[0]!.thinking,undefined);
});

test("inherited frozen global remains provenance, project wins and current global is not substituted",()=>{
 const snapshot:SessionProfileSnapshot={active:"frozen",source:"inherited-global",file:file("frozen",{writer:{thinking:"high"}})};
 const result=inspectIntegrationProfiles({profiles:{layers:{global:file("changed",{writer:{thinking:"low"}})},projectState:"absent",roles:["writer"],snapshot}}).profiles;
 assert.equal(result.routes[0]!.source,"global");
 assert.equal(result.routes[0]!.thinking,"high");
 assert.equal(result.snapshot!.source,"inherited-global");
 const overridden=inspectIntegrationProfiles({profiles:{layers:{project:file("repo",{writer:{thinking:"low"}})},projectState:"loaded",roles:["writer"],snapshot}}).profiles;
 assert.equal(overridden.routes[0]!.source,"project");
});

test("unavailable or malformed project never becomes effective default",()=>{
 for(const profiles of [undefined,{layers:{},projectState:"unavailable" as const,roles:["writer"]},
  {layers:{project:{broken:true} as never},projectState:"loaded" as const,roles:["writer"]},
  {layers:{},projectState:"loaded" as const,roles:["writer"]}]){
  assert.deepEqual(inspectIntegrationProfiles({...(profiles?{profiles}:{})}).profiles,{state:"unavailable",routes:[],limited:false,diagnostic:"Profile inspection unavailable."});
 }
});

test("profile output is bounded, deduplicated, private model values withheld and facts unchanged",()=>{
 const profiles={layers:{global:file("global",{writer:{model:"https://private/?token=secret",thinking:"off"}})},projectState:"absent" as const,roles:["writer","writer","/private",...Array.from({length:40},(_,i)=>`role${i}`)]};
 const before=structuredClone(profiles);
 const result=inspectIntegrationProfiles({profiles}).profiles;
 assert.equal(result.routes.length,32);
 assert.equal(result.limited,true);
 assert.deepEqual(result.routes[0],{role:"writer",source:"global",configured:true,model:"configured",thinking:"off",actual:"unknown"});
 assert.equal(JSON.stringify(result).includes("private"),false);
 assert.deepEqual(profiles,before);
});
