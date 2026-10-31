import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,mkdir,realpath,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {canonicalProfilePartition,captureSessionProfile,clearSessionProfiles,selectSessionProfile,resetSessionProfile} from "../src/runtime/session-profile-binding.js";
import {ASEN_PROFILES_SCHEMA,resolveRuntimeRoute,type RuntimeProfilesFile} from "../src/runtime/profiles.js";

const profile=(model:string):RuntimeProfilesFile=>({schema:ASEN_PROFILES_SCHEMA,active:"default",profiles:[{name:"default",routes:{explorer:{model,thinking:"high"}}}]});
const identity=(sessionId="a",project="a")=>({sessionId,projectId:path.resolve(`profile-fixture-${project}`)});
function deferred<T>(){
 let resolve!:(value:T)=>void,reject!:(error:Error)=>void;
 const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};
}

const modelOf=(value:Awaited<ReturnType<typeof captureSessionProfile>>)=>value.file.profiles[0]?.routes.explorer?.model;
const retained=(partition:string,owner:ReturnType<typeof identity>)=>captureSessionProfile(partition,owner,async()=>{throw new Error("must remain frozen");});

test("explicit selection is copied wholesale and reset reveals the original inherited snapshot",async t=>{
 const part="test:explicit",owner=identity();t.after(()=>clearSessionProfiles(part,owner.sessionId));
 await captureSessionProfile(part,owner,async()=>profile("original"));const file=profile("later");file.profiles.push({name:"sparse",routes:{explorer:{model:"chosen"}}});
 const selected=await selectSessionProfile(part,owner,"sparse",async()=>file);assert.equal(selected.snapshot.source,"explicit-session");
 assert.deepEqual(resolveRuntimeRoute({session:selected.snapshot.file},"explorer"),{source:"session",choice:{model:"chosen"}});
 assert.deepEqual(resolveRuntimeRoute({session:selected.snapshot.file},"worker"),{source:"default"});
 file.profiles[1]!.routes.explorer!.model="mutated-input";selected.snapshot.file.profiles[0]!.routes.explorer!.model="mutated-output";
 assert.equal(modelOf(await retained(part,owner)),"chosen");
 const reset=await resetSessionProfile(part,owner,async()=>profile("current-global"));assert.equal(modelOf(reset.snapshot),"original");assert.equal(reset.global.profiles[0]!.routes.explorer!.model,"current-global");
});

test("cold invalid selection and joined capture reject without freezing a default",async t=>{
 const part="test:cold-invalid",owner=identity(),release=deferred<RuntimeProfilesFile>();t.after(()=>clearSessionProfiles(part,owner.sessionId));
 const selected=selectSessionProfile(part,owner,"missing",()=>release.promise),joined=captureSessionProfile(part,owner,async()=>profile("must-not-load"));
 const failures=Promise.all([assert.rejects(selected,/Profile does not exist/u),assert.rejects(joined,/Profile does not exist/u)]);
 release.resolve(profile("invalid-choice-source"));await failures;
 assert.equal(modelOf(await captureSessionProfile(part,owner,async()=>profile("fresh"))),"fresh");clearSessionProfiles(part,owner.sessionId);
 await assert.rejects(selectSessionProfile(part,owner,"default",async()=>({schema:ASEN_PROFILES_SCHEMA,active:"missing",profiles:[]})),/Invalid profiles file/u);
 assert.equal(modelOf(await captureSessionProfile(part,owner,async()=>profile("after-malformed"))),"after-malformed");
});

test("reset and a newer failed choice invalidate older pending selection without erasing committed routing",async t=>{
 const part="test:reset-intent",owner=identity();t.after(()=>clearSessionProfiles(part,owner.sessionId));await captureSessionProfile(part,owner,async()=>profile("inherited"));
 const slow=deferred<RuntimeProfilesFile>(),old=selectSessionProfile(part,owner,"default",()=>slow.promise),rejected=assert.rejects(old,/superseded/u);
 assert.equal(modelOf((await resetSessionProfile(part,owner,async()=>profile("later-global"))).snapshot),"inherited");slow.resolve(profile("stale"));await rejected;
 await selectSessionProfile(part,owner,"default",async()=>profile("committed"));
 const slowAgain=deferred<RuntimeProfilesFile>(),older=selectSessionProfile(part,owner,"default",()=>slowAgain.promise),olderRejected=assert.rejects(older,/superseded/u);
 await assert.rejects(selectSessionProfile(part,owner,"absent",async()=>profile("invalid-newer")),/Profile does not exist/u);
 slowAgain.resolve(profile("obsolete"));await olderRejected;assert.equal(modelOf(await retained(part,owner)),"committed");
});

test("a newer selection wins while an older context validation is pending",async t=>{
 const part="test:validate-order",owner=identity(),entered=deferred<void>(),release=deferred<void>();t.after(()=>clearSessionProfiles(part,owner.sessionId));
 await captureSessionProfile(part,owner,async()=>profile("inherited"));
 const old=selectSessionProfile(part,owner,"default",async()=>profile("old"),async()=>{entered.resolve();await release.promise;}),rejected=assert.rejects(old,/superseded/u);
 await entered.promise;await selectSessionProfile(part,owner,"default",async()=>profile("latest"));release.resolve();await rejected;
 assert.equal(modelOf(await retained(part,owner)),"latest");
 await assert.rejects(selectSessionProfile(part,owner,"default",async()=>profile("wrong-context"),()=>{throw new Error("Pi context changed");}),/Pi context changed/u);
 assert.equal(modelOf(await retained(part,owner)),"latest");
});

test("shutdown prevents a pending selector from changing its replacement or any other owner",async t=>{
 const part="test:selector-shutdown",other="test:selector-other",a=identity(),b=identity("b"),foreign=identity("a","foreign"),release=deferred<RuntimeProfilesFile>();
 t.after(()=>{for(const scope of [part,other])for(const session of ["a","b"])clearSessionProfiles(scope,session);});
 for(const [scope,owner,model] of [[part,a,"a"],[part,b,"b"],[part,foreign,"foreign"],[other,a,"other"]] as const)await captureSessionProfile(scope,owner,async()=>profile(model));
 const pending=selectSessionProfile(part,a,"default",()=>release.promise),rejected=assert.rejects(pending,/capture ended/u);clearSessionProfiles(part,a.sessionId);
 await captureSessionProfile(part,a,async()=>profile("replacement"));release.resolve(profile("stale"));await rejected;
 assert.equal(modelOf(await retained(part,a)),"replacement");assert.equal(modelOf(await retained(part,b)),"b");assert.equal(modelOf(await retained(other,a)),"other");
 assert.equal(modelOf(await captureSessionProfile(part,foreign,async()=>profile("foreign-recaptured"))),"foreign-recaptured");
});

test("concurrent captures share the first loader and return defensive snapshots",async()=>{
 const partition="test:concurrent",owner=identity(),entered=deferred<void>(),release=deferred<RuntimeProfilesFile>();let reads=0;
 const input=profile("model-x"),load=()=>{reads++;entered.resolve();return release.promise;};
 const first=captureSessionProfile(partition,owner,load),second=captureSessionProfile(partition,owner,async()=>{reads++;return profile("model-y");});
 await entered.promise;assert.equal(reads,1);release.resolve(input);
 try{
  const [a,b]=await Promise.all([first,second]);assert.deepEqual(a,b);assert.notEqual(a,b);assert.equal(a.active,"default");
  input.profiles[0]!.routes.explorer!.model="changed-input";a.file.profiles[0]!.routes.explorer!.model="changed-output";
  assert.equal(b.file.profiles[0]!.routes.explorer!.model,"model-x");
  const again=await captureSessionProfile(partition,owner,async()=>{throw new Error("must not recapture");});
  assert.equal(again.file.profiles[0]!.routes.explorer!.model,"model-x");assert.equal(reads,1);
 }finally{clearSessionProfiles(partition,owner.sessionId);}
});

test("failed or malformed capture leaves no false frozen default",async()=>{
 const partition="test:failed",owner=identity();
 await assert.rejects(captureSessionProfile(partition,owner,async()=>{throw new Error("unreadable fixture");}),/unreadable fixture/u);
 await assert.rejects(captureSessionProfile(partition,owner,async()=>({schema:ASEN_PROFILES_SCHEMA,active:"missing",profiles:[]})),/Invalid profiles file/u);
 try{assert.equal((await captureSessionProfile(partition,owner,async()=>profile("recovered"))).file.profiles[0]!.routes.explorer!.model,"recovered");}
 finally{clearSessionProfiles(partition,owner.sessionId);}
});

test("shutdown invalidates pending capture without deleting a new generation",async()=>{
 const partition="test:shutdown",owner=identity(),entered=deferred<void>(),release=deferred<RuntimeProfilesFile>();
 const old=captureSessionProfile(partition,owner,()=>{entered.resolve();return release.promise;});
 const rejected=assert.rejects(old,/capture ended before completion/u);await entered.promise;clearSessionProfiles(partition,owner.sessionId);
 const current=await captureSessionProfile(partition,owner,async()=>profile("new-generation"));release.resolve(profile("stale"));await rejected;
 try{
  assert.equal(current.file.profiles[0]!.routes.explorer!.model,"new-generation");
  assert.deepEqual(await captureSessionProfile(partition,owner,async()=>{throw new Error("must remain frozen");}),current);
 }finally{clearSessionProfiles(partition,owner.sessionId);}
});

test("shutdown clears every owned project but preserves other sessions and partitions",async()=>{
 const partition="test:ownership",other="test:other-partition",a=identity(),b=identity("b"),foreign=identity("a","foreign");
 for(const [scope,owner,model] of [[partition,a,"a"],[partition,b,"b"],[partition,foreign,"foreign"],[other,a,"other"]] as const)await captureSessionProfile(scope,owner,async()=>profile(model));
 clearSessionProfiles(partition,a.sessionId);
 try{
  for(const [scope,owner,expected] of [[partition,a,"new"],[partition,foreign,"new"],[partition,b,"b"],[other,a,"other"]] as const){
   const captured=await captureSessionProfile(scope,owner,async()=>profile("new"));assert.equal(captured.file.profiles[0]!.routes.explorer!.model,expected);
  }
 }finally{for(const scope of [partition,other])for(const session of ["a","b"])clearSessionProfiles(scope,session);}
});

test("empty profile snapshot stays empty and module reload keeps an existing binding",async()=>{
 const partition="test:reload",owner=identity();
 try{
  const empty=await captureSessionProfile(partition,owner,async()=>({schema:ASEN_PROFILES_SCHEMA,profiles:[]}));
  const reloaded:typeof import("../src/runtime/session-profile-binding.js")=await import(new URL("../src/runtime/session-profile-binding.ts?reload=fixture",import.meta.url).href);
  const same=await reloaded.captureSessionProfile(partition,owner,async()=>profile("later"));
  assert.deepEqual(same,empty);assert.equal(same.source,"inherited-default");assert.deepEqual(same.file.profiles,[]);
 }finally{clearSessionProfiles(partition,owner.sessionId);}
});

test("configuration partition is stable before and after missing parents are created",async t=>{
 const home=await mkdtemp(path.join(tmpdir(),"asen-profile-partition-"));t.after(()=>rm(home,{recursive:true,force:true}));
 const file=path.join(home,"missing","profiles.json"),before=await canonicalProfilePartition(file);
 assert.equal(before,path.join(await realpath(home),"missing","profiles.json"));
 await mkdir(path.dirname(file));await writeFile(file,"{}");assert.equal(await canonicalProfilePartition(file),before);
});
