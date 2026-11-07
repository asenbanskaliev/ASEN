import assert from "node:assert/strict";
import test from "node:test";
import {link,mkdtemp,rm,symlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
// @ts-expect-error Deliberately JS-only fail-closed A/B evidence input.
import {readAgentABManifest} from "../scripts/agent-ab-manifest-reader.mjs";

async function root(t:import("node:test").TestContext){
 const dir=await mkdtemp(join(tmpdir(),"asen-ab-bounded-input-"));
 t.after(()=>rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 return dir;
}
test("EF-701 strict A/B JSON input accepts bounded ordinary files and rejects corrupt UTF-8",async t=>{
 const dir=await root(t),file=join(dir,"reference.json");
 await writeFile(file,'{"schema":"test","cases":[]}',{flag:"wx"});
 assert.deepEqual(await readAgentABManifest(file),{schema:"test",cases:[]});
 await writeFile(file,Buffer.from([0x7b,0x22,0xc3,0x28,0x22,0x3a,0x31,0x7d]));
 await assert.rejects(()=>readAgentABManifest(file),/Invalid UTF-8/u);
 await writeFile(file,"not json");
 await assert.rejects(()=>readAgentABManifest(file),/Invalid UTF-8 JSON/u);
});
test("EF-701 A/B input reads at most 1 MiB and requires an absolute file",async t=>{
 const dir=await root(t),file=join(dir,"huge.json");
 await writeFile(file,Buffer.alloc(1024*1024+1,32));
 await assert.rejects(()=>readAgentABManifest(file),/size/u);
 await assert.rejects(()=>readAgentABManifest("relative.json"),/absolute/u);
 await writeFile(file,"[]");
 await assert.rejects(()=>readAgentABManifest(file),/JSON object/u);
});
test("EF-701 A/B manifest refuses symlink and hardlinked aliases",async t=>{
 const dir=await root(t),file=join(dir,"source.json"),alias=join(dir,"alias.json");
 await writeFile(file,'{"ok":true}',{flag:"wx"});
 try{
  await symlink(file,alias);
  await assert.rejects(()=>readAgentABManifest(alias),/Unsafe A\/B manifest/u);
 }catch(error){
  if(process.platform!=="win32"||(error as NodeJS.ErrnoException).code!=="EPERM")throw error;
 }
 await rm(alias,{force:true});
 try{
  await link(file,alias);
  await assert.rejects(()=>readAgentABManifest(file),/identity|size/u);
  await assert.rejects(()=>readAgentABManifest(alias),/identity|size/u);
 }catch(error){
  if(process.platform!=="win32"||(error as NodeJS.ErrnoException).code!=="EPERM")throw error;
 }
});
test("EF-701 no user-supplied manifest can alter a file after the read without invalidating the next audit",async t=>{
 const dir=await root(t),file=join(dir,"mutable.json");
 await writeFile(file,'{"sha":"a"}',{flag:"wx"});
 assert.deepEqual(await readAgentABManifest(file),{sha:"a"});
 await writeFile(file,'{"sha":"b"}');
 assert.deepEqual(await readAgentABManifest(file),{sha:"b"});
 assert.notDeepEqual(await readAgentABManifest(file),{sha:"a"});
});

// EF-701 bounded descriptor reader also requires positive physical inode and birthtime identity.
// Platform-specific file-identity regressions remain covered by the CLI and hardlink cases.
