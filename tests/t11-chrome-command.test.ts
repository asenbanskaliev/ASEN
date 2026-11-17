import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {readT11Chrome} from "../src/runtime/ui/t11-chrome-settings.js";

test("T11: comandos reales ajustan cabecera y fondo sin tocar permisos ni modelos",async t=>{
 const home=mkdtempSync(join(tmpdir(),"asen-t11-chrome-cmd-"));
 t.after(()=>rmSync(home,{recursive:true,force:true}));
 const commands=new Map<string,{handler:(...args:any[])=>unknown}>();
 createAsenExtension({homeDir:()=>home,packageRoot:home,
  enableAgentRuntime:false,enableTodoRuntime:false,
  enableMemoryRuntime:false,enableWorkspaceRuntime:false})({
  registerCommand:(name:string,command:any)=>commands.set(name,command),on:()=>{}
 });
 const run=commands.get("asen-customize")!.handler;
 const ctx={cwd:home,mode:"rpc",hasUI:false,ui:{notify(){}}};
 assert.deepEqual(readT11Chrome(home),{header:"top",surface:"transparent",source:"default"});
 assert.equal((await run("header below-input",ctx) as any).header,"below-input");
 assert.equal((await run("surface tinted",ctx) as any).surface,"tinted");
 assert.deepEqual(readT11Chrome(home),{header:"below-input",surface:"tinted",source:"saved"});
 assert.deepEqual(await run("header status",ctx),{
  header:"below-input",surface:"tinted",source:"saved",
  note:"Use /asen-customize header top|below-input|split"
 });
 assert.equal((await run("header split",ctx) as any).header,"split");
 assert.equal((await run("surface transparent",ctx) as any).surface,"transparent");
 for(const command of ["header super-yolo","surface ../../red","header split surprise"]){
  const response=await run(command,ctx) as any;
  assert.ok(typeof response.error==="string",command);
 }
 assert.deepEqual(readT11Chrome(home),{header:"split",surface:"transparent",source:"saved"});
 const data=readFileSync(join(home,".asen","t11-chrome.json"),"utf8");
 assert.doesNotMatch(data,/permissions|model|autoridad|super-yolo/);
});
