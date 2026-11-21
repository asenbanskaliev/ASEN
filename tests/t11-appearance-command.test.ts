import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {readAsenAppearance} from "../src/runtime/ui/t11-appearance.js";
import {readT11Layout} from "../src/runtime/ui/t11-layout-settings.js";

test("T11 comando real: analiza appearance power, conserva permisos y valida elecciones",async t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-t11-command-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const commands=new Map<string,{handler:(...args:any[])=>unknown}>();
 const messages:string[]=[];
 createAsenExtension({homeDir:()=>root,packageRoot:root,enableAgentRuntime:false,enableTodoRuntime:false,enableMemoryRuntime:false,enableWorkspaceRuntime:false})({
  registerCommand:(name:string,command:any)=>commands.set(name,command),on:()=>{}
 });
 const run=commands.get("asen-customize")!.handler;
 const ctx={cwd:root,mode:"rpc",hasUI:false,ui:{notify:(message:string)=>messages.push(message)}};
 const before=await run("appearance status",ctx) as any;
 assert.equal(before.preset,"neutral");
 const saved=await run("appearance power",ctx) as any;
 assert.equal(saved.preset,"power");
 assert.deepEqual(readAsenAppearance(root),{preset:"power",source:"saved"});
 const denied=await run("appearance super-yolo",ctx) as any;
 assert.match(denied.error,/Use/);
 assert.equal(readAsenAppearance(root).preset,"power");
 assert.equal((await run("appearance light",ctx) as any).preset,"light");
 assert.equal(readAsenAppearance(root).preset,"light");
 assert.ok(messages.length>=3,"Pi publica los cambios visuales con el mismo registro de comandos");
});

test("T11 comando de posición y densidad preserva permisos y valida entradas",async t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-t11-layout-command-"));t.after(()=>rmSync(root,{force:true,recursive:true}));
 const commands=new Map<string,{handler:(...args:any[])=>unknown}>();
 createAsenExtension({homeDir:()=>root,packageRoot:root,enableAgentRuntime:false,enableTodoRuntime:false,enableMemoryRuntime:false,enableWorkspaceRuntime:false})({
  registerCommand:(name:string,c:any)=>commands.set(name,c),on:()=>{}
 });
 const run=commands.get("asen-customize")!.handler;
 const ctx={cwd:root,mode:"rpc",hasUI:false,ui:{notify(){}}};
 assert.equal((await run("position bottom",ctx) as any).position,"bottom");
 assert.equal((await run("density minimal",ctx) as any).density,"minimal");
 assert.equal((await run("position status",ctx) as any).source,"saved");
 assert.deepEqual(readT11Layout(root),{position:"bottom",density:"minimal",source:"saved"});
 const invalid=await run("position super-yolo",ctx) as any;
 assert.match(invalid.error,/Invalid/);
 assert.equal((await run("density unrestricted",ctx) as any).error.startsWith("Invalid"),true);
 assert.deepEqual(readT11Layout(root),{position:"bottom",density:"minimal",source:"saved"});
});
