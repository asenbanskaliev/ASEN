import assert from "node:assert/strict";
import {test,type TestContext} from "node:test";
import {mkdir,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {ASEN_PROFILES_SCHEMA} from "../src/runtime/profiles.js";
import {hostContentColumns,truncateForTerminal,visibleWidth} from "../src/runtime/responsive-layout.js";

async function fixture(t:TestContext){
 const root=await mkdtemp(path.join(os.tmpdir(),"asen-narrow-integrations-"));
 const home=path.join(root,"home"),project=path.join(root,"project");
 await Promise.all([mkdir(path.join(home,".asen"),{recursive:true}),mkdir(project)]);
 const file=path.join(home,".asen","profiles.json");
 const stored=JSON.stringify({schema:ASEN_PROFILES_SCHEMA,active:"default",profiles:[{name:"default",routes:{}}]});
 await writeFile(file,stored);
 const columns=Object.getOwnPropertyDescriptor(process.stdout,"columns"),originalFetch=globalThis.fetch;
 const commands=new Map<string,any>(),events=new Map<string,Function[]>();
 let effects=0;
 const forbidden=()=>{effects++;assert.fail("Inspection must not execute SDK, provider or mutation actions");};
 globalThis.fetch=forbidden;
 const inventory=Object.freeze([Object.freeze({name:"inspect",source:"extension",sourceInfo:Object.freeze({scope:"project",origin:"top-level"})})]);
 const tools=Object.freeze([Object.freeze({name:"lookup",namespace:Object.freeze({name:"mcp__docs"}),sourceInfo:Object.freeze({scope:"user",origin:"package"})})]);
 const pi={registerCommand(name:string,command:any){commands.set(name,command);},registerTool(){},registerShortcut(){},
  getCommands(){return inventory;},getAllTools(){return tools;},getFlag(){return false;},
  on(name:string,fn:Function){events.set(name,[...(events.get(name)??[]),fn]);},
  sendMessage:forbidden,sendUserMessage:forbidden,setModel:forbidden,setActiveTools:forbidden,exec:forbidden};
 const ctx={cwd:project,hasUI:false,sessionManager:{getSessionId:()=>"narrow-integrations"},ui:{select:forbidden,confirm:forbidden,editor:forbidden,setFooter:forbidden}};
 t.after(async()=>{
  try{
   for(const fn of events.get("session_shutdown")??[])await fn({},ctx);
   assert.equal(await readFile(file,"utf8"),stored,"Read-only rendering must preserve saved profiles byte for byte");
   assert.equal(effects,0,"No provider, selection, confirmation or mutation effects");
   assert.equal(inventory[0]?.name,"inspect");assert.equal(tools[0]?.name,"lookup");
  }finally{
   globalThis.fetch=originalFetch;
   if(columns)Object.defineProperty(process.stdout,"columns",columns);else Reflect.deleteProperty(process.stdout,"columns");
   await rm(root,{recursive:true,force:true});
  }
 });
 createAsenExtension({homeDir:()=>home,packageRoot:root,registryLifecycle:{watch:()=>({close(){}})},
  autoAdvancePlans:false,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false})(pi as any);
 return {async render(width:number):Promise<string[]>{
  Object.defineProperty(process.stdout,"columns",{value:width,writable:true,configurable:true});
  return await commands.get("asen-integrations").handler(undefined,ctx);
 }};
}

const normalRows=[
 "Integraciones · commands: reported",
 "inspect — configured · conexión unknown — procedencia extension/project/top-level",
 "Integraciones · tools: reported",
 "lookup — (mcp__docs) — registered · conexión unknown — procedencia unknown/user/package",
];

test("public integrations keeps existing normal-width inventory and unknown connection facts",async t=>{
 const f=await fixture(t),rows=await f.render(123);
 assert.deepEqual(rows.slice(0,4),normalRows);
 assert.match(rows.at(-1)!,/^Perfil activo default: inherited-global · persistencia en proceso$/u);
 assert.doesNotMatch(rows.join("\n"),/connected|healthy|ejecución confirmada/u);
});

test("public integrations renders positive narrow widths with the existing host reserve and no effects",async t=>{
 const f=await fixture(t),normal=await f.render(123);
 for(const columns of [1,2,12,40,50,51]){
  const width=hostContentColumns(columns),rows=await f.render(columns);
  assert.deepEqual(rows,normal.map(row=>truncateForTerminal(row,width)),`terminal width ${columns}`);
  assert.ok(rows.every(row=>visibleWidth(row)<=width),`Rows must fit the ${width} host content columns`);
  assert.ok(rows.every(row=>!/[\p{Cc}\p{Cf}]/u.test(row)),"No terminal controls introduced");
 }
});
