import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {mkdir,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {
 ASEN_PROFILE_FALLBACKS_SCHEMA,
 emptyProfileFallbacks,
 parseProfileFallbacks,
 readProfileFallbacksFile,
 removeProfileFallbacks,
 renameProfileFallbacks,
 resolveProfileFallbackChain,
 serializeProfileFallbacks,
 setProfileFallbackChain,
 updateProfileFallbacksFile,
 writeProfileFallbacksFile,
 type ProfileFallbacksFile,
} from "../src/runtime/profile-fallback-store.js";

import type {Thinking} from "../src/runtime/profiles.js";

for(const thinking of ["off","minimal","low","medium","high","xhigh","max",undefined] as const){
 test(`effort parity fallback store persists ${thinking??"inherit"}`,async t=>{
  const {file}=await fixture(t),candidate=thinking===undefined?{model:"provider/backup"}:{model:"provider/backup",thinking};
  const value=setProfileFallbackChain(emptyProfileFallbacks(),"main","worker",[candidate]);
  assert.deepEqual(parseProfileFallbacks(serializeProfileFallbacks(value)),value);
  await writeProfileFallbacksFile(file,value);
  assert.deepEqual(resolveProfileFallbackChain(await readProfileFallbacksFile(file),"main","worker"),[candidate]);
  const before=await readFile(file,"utf8");
  for(const invalid of ["extreme","HIGH","inherit","",null,7]){
   await assert.rejects(()=>updateProfileFallbacksFile(file,current=>setProfileFallbackChain(current,"main","worker",[{model:"bad",thinking:invalid as Thinking}])));
   assert.equal(await readFile(file,"utf8"),before);
  }
 });
}

const fixtureRoot=process.env.ASEN_FALLBACK_STORE_TEST_ROOT??tmpdir();
async function fixture(t:TestContext):Promise<{directory:string;file:string}>{
 await mkdir(fixtureRoot,{recursive:true});
 const directory=await mkdtemp(path.join(fixtureRoot,"fallback-store-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 return {directory,file:path.join(directory,"profile-fallbacks.json")};
}
const step=(model:string,thinking?:"off"|"minimal"|"low"|"medium"|"high")=>thinking===undefined?{model}:{model,thinking};
function oversizedFallbacks():ProfileFallbacksFile{
 return {schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:Object.fromEntries(Array.from({length:64},(_,profile)=>[`p${profile}`,Object.fromEntries(Array.from({length:64},(_,role)=>[`r${role}`,Array.from({length:8},(_,item)=>step(`${profile}-${role}-${item}-`.padEnd(256,"x")))]))]))};
}

test("profile fallback store round-trips the separate strict schema",async t=>{
 const {file}=await fixture(t);
 assert.deepEqual(await readProfileFallbacksFile(file),emptyProfileFallbacks());
 const value:ProfileFallbacksFile={schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{main:{"*":[step("provider/base","low")],worker:[step("provider/worker")]}}};
 await writeProfileFallbacksFile(file,value);
 assert.deepEqual(await readProfileFallbacksFile(file),value);
 assert.match(await readFile(file,"utf8"),/^\{\n  "schema": "asen\.profile-fallbacks\/v1"/);
});

test("strict parsing rejects unbounded, duplicate, unsafe, and non-exact input",()=>{
 const valid={schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{main:{worker:[step("provider/model")]}}};
 assert.deepEqual(parseProfileFallbacks(JSON.stringify(valid)),valid);
 const rejected=[
  {...valid,extra:true},
  {schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{"bad name":{worker:[step("m")]}}},
  {schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{main:{"bad role":[step("m")]}}},
  {schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{main:{worker:Array.from({length:9},(_,i)=>step(`m${i}`))}}},
  {schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{main:{worker:[step("same"),step("same","high")]}}},
  {schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{main:{worker:[{model:" padded "}]}}},
  {schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{main:{worker:[{model:"m",thinking:"extreme"}]}}},
  {schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{main:{worker:[{model:"m",extra:true}]}}},
  {schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:Object.fromEntries(Array.from({length:65},(_,i)=>[`p${i}`,{worker:[step("m")]}]))},
  {schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{main:Object.fromEntries(Array.from({length:65},(_,i)=>[`role${i}`,[step("m")]]))}},
 ];
 for(const value of rejected)assert.equal(parseProfileFallbacks(JSON.stringify(value)),undefined);
});

test("role-specific chains override star chains and inherited mappings are ignored",()=>{
 const file={schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{main:{"*":[step("default")],worker:[step("specific","high")]}}};
 assert.deepEqual(resolveProfileFallbackChain(file,"main","worker"),[step("specific","high")]);
 assert.deepEqual(resolveProfileFallbackChain(file,"main","reviewer"),[step("default")]);
 assert.deepEqual(resolveProfileFallbackChain(file,"missing","worker"),[]);
 const inherited=Object.create({worker:[step("inherited")]}) as Record<string,ReturnType<typeof step>[]>;
 const ownSafe={schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:Object.fromEntries([["main",inherited]])};
 assert.deepEqual(resolveProfileFallbackChain(ownSafe,"main","worker"),[]);
});

test("chain updates preserve unrelated data and empty chains remove only their entry",()=>{
 const initial:ProfileFallbacksFile={schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{main:{"*":[step("default")],worker:[step("old")]},other:{worker:[step("untouched")]}}};
 const changed=setProfileFallbackChain(initial,"main","worker",[step("new","medium")]);
 assert.deepEqual(changed.profiles.main?.worker,[step("new","medium")]);
 assert.deepEqual(changed.profiles.main?.["*"],[step("default")]);
 assert.deepEqual(changed.profiles.other?.worker,[step("untouched")]);
 const removed=setProfileFallbackChain(changed,"main","worker",[]);
 assert.equal(Object.hasOwn(removed.profiles.main??{},"worker"),false);
 assert.deepEqual(removed.profiles.main?.["*"],[step("default")]);
 const emptied=setProfileFallbackChain({schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{main:{worker:[step("only")]}}},"main","worker",[]);
 assert.equal(Object.hasOwn(emptied.profiles,"main"),false);
 assert.deepEqual(initial.profiles.main?.worker,[step("old")]);
});

test("pure rename and removal follow profile identity without silent overwrite",()=>{
 const initial:ProfileFallbacksFile={schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{old:{worker:[step("m")]},existing:{worker:[step("x")]}}};
 assert.deepEqual(renameProfileFallbacks(initial,"old","new").profiles,{new:{worker:[step("m")]},existing:{worker:[step("x")]}});
 assert.throws(()=>renameProfileFallbacks(initial,"old","existing"),/already exists/);
 assert.deepEqual(removeProfileFallbacks(initial,"old").profiles,{existing:{worker:[step("x")]}});
 assert.deepEqual(initial.profiles.old?.worker,[step("m")]);
});

test("malformed files reject every write path and preserve exact durable bytes",async t=>{
 const {file}=await fixture(t);
 const malformed="{not-json\n";
 await writeFile(file,malformed,"utf8");
 await assert.rejects(()=>readProfileFallbacksFile(file),/Invalid profile fallback file/);
 await assert.rejects(()=>writeProfileFallbacksFile(file,{schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{main:{worker:[step("replacement")]}}}),/Invalid profile fallback file/);
 await assert.rejects(()=>updateProfileFallbacksFile(file,(current:ProfileFallbacksFile)=>setProfileFallbackChain(current,"main","worker",[step("m")])),/Invalid profile fallback file/);
 assert.equal(await readFile(file,"utf8"),malformed);
});

test("rejected valid-file writes preserve existing data",async t=>{
 const {file}=await fixture(t);
 const valid:ProfileFallbacksFile={schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{main:{worker:[step("kept")]}}};
 await writeProfileFallbacksFile(file,valid);
 const before=await readFile(file,"utf8");
 await assert.rejects(()=>writeProfileFallbacksFile(file,{schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{main:{worker:[step("dup"),step("dup")]}}} as ProfileFallbacksFile),/Invalid profile fallback file/);
 assert.equal(await readFile(file,"utf8"),before);
 assert.deepEqual(await readProfileFallbacksFile(file),valid);
});

test("serializer and write paths share the reader size bound without mutation",async t=>{
 const oversized=oversizedFallbacks();
 assert.equal(parseProfileFallbacks(JSON.stringify(oversized)),undefined);
 assert.throws(()=>serializeProfileFallbacks(oversized),/too large/);
 const {file}=await fixture(t);
 const valid:ProfileFallbacksFile={schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{main:{worker:[step("kept")]}}};
 await writeProfileFallbacksFile(file,valid);
 const before=await readFile(file,"utf8");
 await assert.rejects(()=>writeProfileFallbacksFile(file,oversized),/too large/);
 assert.equal(await readFile(file,"utf8"),before);
 await assert.rejects(()=>updateProfileFallbacksFile(file,()=>oversized),/too large/);
 assert.equal(await readFile(file,"utf8"),before);
});

test("locked read-modify-write prevents lost updates and revalidates callback output",async t=>{
 const {file}=await fixture(t);
 await Promise.all(Array.from({length:12},(_,i)=>updateProfileFallbacksFile(file,(current:ProfileFallbacksFile)=>setProfileFallbackChain(current,`p${i}`,"worker",[step(`m${i}`)]))));
 const stored=await readProfileFallbacksFile(file);
 assert.equal(Object.keys(stored.profiles).length,12);
 for(let i=0;i<12;i++)assert.deepEqual(stored.profiles[`p${i}`]?.worker,[step(`m${i}`)]);
 const before=await readFile(file,"utf8");
 await assert.rejects(()=>updateProfileFallbacksFile(file,()=>({schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{main:{worker:[step("x"),step("x")]}}} as ProfileFallbacksFile)),/Invalid profile fallback file/);
 assert.equal(await readFile(file,"utf8"),before);
});
