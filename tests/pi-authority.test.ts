import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,mkdir,rm,symlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {authorizeToolCall} from "../extensions/authority.js";

test("Pi authority rejects redelegation and writes beyond exact surfaces",async t=>{
 const repo=await mkdtemp(join(tmpdir(),"asen-tool-authority-"));
 const outside=await mkdtemp(join(tmpdir(),"asen-tool-outside-"));
 t.after(async()=>{await rm(repo,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});});
 await mkdir(join(repo,"src"));await symlink(outside,join(repo,"src","escape"));
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
