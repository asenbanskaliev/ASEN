import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,realpath,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {applyToolOverlay,loadToolOverlays} from "../src/agents/tool-overlay.js";

async function setup(t:any){
 const root=await realpath(await mkdtemp(join(tmpdir(),"asen-tool-overlay-")));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const configHome=join(root,"home"),cwd=join(root,"project");
 await mkdir(configHome,{recursive:true});
 await mkdir(cwd,{recursive:true});
 return {configHome,cwd};
}
async function put(path:string,body:string):Promise<void>{
 await mkdir(join(path,".."),{recursive:true});
 await writeFile(path,body,"utf8");
}
async function putJson(path:string,value:unknown):Promise<void>{await put(path,JSON.stringify(value));}
function warned(run:()=>unknown):string[]{
 const warnings:string[]=[];const original=console.warn;
 console.warn=(...args:unknown[])=>{warnings.push(args.map(String).join(" "));};
 try{run();}finally{console.warn=original;}
 return warnings;
}

test("applyToolOverlay without an overlay keeps the original array reference and contents",()=>{
 const tools=["read","bash","edit"];
 const result=applyToolOverlay(tools,undefined);
 assert.equal(result,tools);
 assert.deepEqual(result,["read","bash","edit"]);
});
test("applyToolOverlay adds tools and never mutates its input",()=>{
 const tools=["read","bash"];
 assert.deepEqual(applyToolOverlay(tools,{add:["deploy"],remove:[]}),["read","bash","deploy"]);
 assert.deepEqual(tools,["read","bash"]);
});
test("applyToolOverlay removes tools only",()=>{
 const tools=["read","bash","edit"];
 assert.deepEqual(applyToolOverlay(tools,{add:[],remove:["bash"]}),["read","edit"]);
 assert.deepEqual(tools,["read","bash","edit"]);
});
test("applyToolOverlay applies add and remove declared in the same overlay",()=>{
 assert.deepEqual(applyToolOverlay(["read","bash"],{add:["deploy"],remove:["bash"]}),["read","deploy"]);
});
test("applyToolOverlay removes a tool listed in both add and remove of one overlay",()=>{
 assert.deepEqual(applyToolOverlay(["read"],{add:["bash"],remove:["bash"]}),["read"]);
});
test("applyToolOverlay deduplicates the result",()=>{
 assert.deepEqual(applyToolOverlay(["read","read","bash"],{add:["bash","deploy","deploy"],remove:[]}),["read","bash","deploy"]);
});
test("applyToolOverlay on an empty tool list yields only the added tools",()=>{
 assert.deepEqual(applyToolOverlay([],{add:["deploy"],remove:["gone"]}),["deploy"]);
});

test("loadToolOverlays returns an empty overlay when no source exists",async t=>{
 const {configHome,cwd}=await setup(t);
 assert.deepEqual(loadToolOverlays(configHome,cwd),{add:[],remove:[]});
});
test("loadToolOverlays reads the global tools.json and defaults missing keys",async t=>{
 const {configHome,cwd}=await setup(t);
 await putJson(join(configHome,"tools.json"),{add:["deploy"]});
 assert.deepEqual(loadToolOverlays(configHome,cwd),{add:["deploy"],remove:[]});
});
test("loadToolOverlays lets the project overlay reclaim a globally removed tool",async t=>{
 const {configHome,cwd}=await setup(t);
 await putJson(join(configHome,"tools.json"),{remove:["bash"],add:["deploy"]});
 await putJson(join(cwd,".pi","gentle-ai","tools.json"),{add:["bash"]});
 assert.deepEqual(loadToolOverlays(configHome,cwd),{add:["deploy","bash"],remove:[]});
});
test("loadToolOverlays lets the project overlay remove a globally added tool",async t=>{
 const {configHome,cwd}=await setup(t);
 await putJson(join(configHome,"tools.json"),{add:["deploy"]});
 await putJson(join(cwd,".pi","gentle-ai","tools.json"),{remove:["deploy"]});
 assert.deepEqual(loadToolOverlays(configHome,cwd),{add:[],remove:["deploy"]});
});
test("loadToolOverlays merges drop-ins in sorted filename order and ignores non-json files",async t=>{
 const {configHome,cwd}=await setup(t);
 await putJson(join(configHome,"agent-overlays.d","10-alpha.json"),{add:["alpha"],remove:["legacy"]});
 await putJson(join(configHome,"agent-overlays.d","20-beta.json"),{add:["beta"],remove:["alpha"]});
 await put(join(configHome,"agent-overlays.d","notes.txt"),"{ this is not json");
 const warnings=warned(()=>loadToolOverlays(configHome,cwd));
 assert.deepEqual(loadToolOverlays(configHome,cwd),{add:["beta"],remove:["legacy","alpha"]});
 assert.deepEqual(warnings,[]);
});
test("loadToolOverlays orders sources as drop-ins then global then project",async t=>{
 const {configHome,cwd}=await setup(t);
 await putJson(join(configHome,"agent-overlays.d","50-shared.json"),{add:["shared"],remove:["drop"]});
 await putJson(join(configHome,"tools.json"),{add:["shared","global"],remove:["dropped-by-global"]});
 await putJson(join(cwd,".pi","gentle-ai","tools.json"),{add:["project"],remove:["shared"]});
 assert.deepEqual(loadToolOverlays(configHome,cwd),{add:["global","project"],remove:["drop","dropped-by-global","shared"]});
});
test("loadToolOverlays deduplicates tools named by several sources",async t=>{
 const {configHome,cwd}=await setup(t);
 await putJson(join(configHome,"tools.json"),{add:["deploy","deploy"]});
 await putJson(join(cwd,".pi","gentle-ai","tools.json"),{add:["deploy"]});
 assert.deepEqual(loadToolOverlays(configHome,cwd),{add:["deploy"],remove:[]});
});
test("loadToolOverlays skips a malformed file with a warning and keeps the valid sources",async t=>{
 const {configHome,cwd}=await setup(t);
 await put(join(configHome,"tools.json"),"{ not json");
 await putJson(join(cwd,".pi","gentle-ai","tools.json"),{add:["deploy"]});
 const warnings=warned(()=>loadToolOverlays(configHome,cwd));
 assert.deepEqual(loadToolOverlays(configHome,cwd),{add:["deploy"],remove:[]});
 assert.equal(warnings.length,1);
 assert.match(warnings[0]??"",/tools\.json$/);
});
test("loadToolOverlays skips structurally invalid overlays with a warning",async t=>{
 const {configHome,cwd}=await setup(t);
 await putJson(join(configHome,"tools.json"),["read"]);
 await putJson(join(configHome,"agent-overlays.d","10-bad.json"),{add:"deploy"});
 await putJson(join(configHome,"agent-overlays.d","20-bad-item.json"),{add:["ok",7]});
 const warnings=warned(()=>loadToolOverlays(configHome,cwd));
 assert.deepEqual(loadToolOverlays(configHome,cwd),{add:[],remove:[]});
 assert.equal(warnings.length,3);
});
test("loadToolOverlays accepts an empty object and a missing drop-in directory",async t=>{
 const {configHome,cwd}=await setup(t);
 await putJson(join(configHome,"agent-overlays.d","10-empty.json"),{});
 await putJson(join(cwd,".pi","gentle-ai","tools.json"),{});
 assert.deepEqual(loadToolOverlays(configHome,cwd),{add:[],remove:[]});
});
test("loadToolOverlays tolerates a missing project directory entirely",async t=>{
 const {configHome,cwd}=await setup(t);
 await putJson(join(configHome,"tools.json"),{remove:["bash"]});
 assert.deepEqual(loadToolOverlays(configHome,join(cwd,"does-not-exist")),{add:[],remove:["bash"]});
});
test("a loaded overlay drives applyToolOverlay without mutating the tool list",async t=>{
 const {configHome,cwd}=await setup(t);
 await putJson(join(cwd,".pi","gentle-ai","tools.json"),{add:["deploy"],remove:["bash"]});
 const overlay=loadToolOverlays(configHome,cwd);
 const tools=["read","bash"];
 assert.deepEqual(applyToolOverlay(tools,overlay),["read","deploy"]);
 assert.deepEqual(tools,["read","bash"]);
 assert.deepEqual(applyToolOverlay(tools,undefined),tools);
});
