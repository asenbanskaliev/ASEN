import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,mkdir,rm,symlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import authorityExtension,{authorizeToolCall} from "../extensions/authority.js";
import {writeFile} from "node:fs/promises";
import {readFileSync,writeFileSync,existsSync} from "node:fs";

test("Pi authority rejects redelegation and writes beyond exact surfaces",async t=>{
 const repo=await mkdtemp(join(tmpdir(),"asen-tool-authority-"));
 const outside=await mkdtemp(join(tmpdir(),"asen-tool-outside-"));
 t.after(async()=>{await rm(repo,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});});
 await mkdir(join(repo,"src"));await symlink(outside,join(repo,"src","escape"),process.platform==="win32"?"junction":"dir");
 const worker={repository:repo,role:"worker" as const,writeSurfaces:["src"]};
 assert.equal(authorizeToolCall(worker,"write",{path:"src/new.ts"}),true);
 assert.equal(authorizeToolCall(worker,"edit",{path:"src/new.ts"}),true);
 for(const [tool,path] of [["bash","src/new.ts"],["write","README.md"],["write","../outside.txt"],["write",join(outside,"x")],["write","src/escape/x"]])
  assert.equal(authorizeToolCall(worker,tool!,{path}),false,`${tool} ${path}`);
 assert.equal(authorizeToolCall({repository:repo,role:"explorer",writeSurfaces:[]},"write",{path:"src/new.ts"}),false);
 assert.equal(authorizeToolCall({repository:repo,role:"explorer",writeSurfaces:[]},"read",{path:"src/new.ts"}),true);
 assert.equal(authorizeToolCall({repository:repo,role:"explorer",writeSurfaces:[]},"read",{path:join(outside,"x")}),false);
});
test("real Pi loads the explicit ASEN policy extension with discovery disabled",()=>{
 const repository=resolve("."),main=fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
 const cli=join(dirname(main),"bundle","cli.js"),extension=resolve("extensions/authority.ts");
 const result=spawnSync(process.execPath,[cli,"--mode","rpc","--no-session","--no-extensions","--extension",extension,"--no-skills","--no-tools"],{
  cwd:repository,encoding:"utf8",timeout:20000,input:JSON.stringify({id:"policy",type:"get_commands"})+"\n",env:{...process.env,ASEN_PI_AUTHORITY:JSON.stringify({repository,role:"explorer",writeSurfaces:[]}),PI_OFFLINE:"1"}
 });
 assert.equal(result.status,0,result.stderr);
 const records=result.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
 const response=records.find(record=>record.type==="response"&&record.id==="policy");
 assert.equal(response?.success,true,result.stdout);
 assert.equal(response.data.commands.filter((command:{source:string})=>command.source==="extension").some((command:{name:string})=>command.name==="asen-authority-status"),true,"ASEN authority extension did not load");
});


test("Pi authority rejects sensitive reads delegated from primary policy", async t => {
 const repo=await (async()=>{const {mkdtemp, rm}=await import("node:fs/promises");const dir=await mkdtemp(join(tmpdir(),"asen-sensitive-read-"));t.after(async()=>{await rm(dir,{recursive:true,force:true});});return dir;})();
 await writeFile(join(repo,".env"),"secret");
 await (async()=>{const {mkdir}=await import("node:fs/promises");await mkdir(join(repo,".aws"),{recursive:true});await writeFile(join(repo,".aws","credentials"),"secret");})();
 const authority={repository:repo,role:"worker",writeSurfaces:[],agentId:"worker",sessionId:"session",attributionFile:"/tmp/attribution.json"};
 for (const target of [".env",".npmrc","id_rsa",".aws",".aws/credentials"]) {
  assert.equal(authorizeToolCall(authority as any, "read" as any, {path: target}), false, target);
 }
});

test("T06 impide la segunda llamada antes de escribir sin alterar Writers normales",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-t06-una-escritura-"));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const previous=process.env.ASEN_PI_AUTHORITY;
 const base={repository:root,role:"worker",writeSurfaces:["solo.mjs"],
  agentId:"t06-writer-a:worker",sessionId:"t06-prueba",
  attributionFile:join(root,"diario-privado.json")};
 type Event={toolName:string;input:{path:string};toolCallId:string};
 type Hook=(event:Event)=>{block?:boolean;reason?:string}|undefined;
 const listeners=new Map<string,Hook>();
 const install=(config:unknown):Hook=>{
  process.env.ASEN_PI_AUTHORITY=JSON.stringify(config);
  authorityExtension({on:(name:string,callback:unknown)=>{listeners.set(name,callback as Hook);},
   registerCommand:()=>{}} as unknown as Parameters<typeof authorityExtension>[0]);
  const hook=listeners.get("tool_call");assert.ok(hook);return hook;
 };
 const fire=(hook:Hook,toolName:string,id:string,path="solo.mjs")=>
  hook({toolName,input:{path},toolCallId:id});
 try{
  const hook=install({...base,oneShotWritePath:"solo.mjs"}),file=join(root,"solo.mjs");
  assert.equal(fire(hook,"edit","edit-inicial")?.block,true);
  const first=fire(hook,"write","primero");assert.equal(first?.block,undefined);
  if(!first?.block)writeFileSync(file,"export const primera=1;\n");
  const second=fire(hook,"write","segundo");assert.equal(second?.block,true);
  if(!second?.block)writeFileSync(file,"export const segunda=2;\n");
  assert.equal(readFileSync(file,"utf8"),"export const primera=1;\n");
  assert.equal(fire(hook,"edit","edit-posterior")?.block,true);
  assert.equal(fire(hook,"write","fuera","../fuera.mjs")?.block,true);
  // Incluso sin tool_result, la tentativa anterior consumió el permiso.
  const abortado=install({...base,oneShotWritePath:"solo.mjs"});
  assert.equal(fire(abortado,"write","sin-respuesta")?.block,undefined);
  assert.equal(fire(abortado,"write","reintento")?.block,true);
  const malicioso=install({...base,oneShotWritePath:"otro.mjs"});
  assert.equal(fire(malicioso,"write","falso")?.block,true);
  assert.equal(existsSync(join(root,"otro.mjs")),false);
  // Sin la opción nueva se conserva el contrato del Writer productivo.
  const normal=install(base);
  assert.equal(fire(normal,"write","normal-1")?.block,undefined);
  assert.equal(fire(normal,"write","normal-2")?.block,undefined);
 }finally{
  if(previous===undefined)delete process.env.ASEN_PI_AUTHORITY;
  else process.env.ASEN_PI_AUTHORITY=previous;
 }
});

