import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {inspect} from "node:util";
import {atomicWriteText} from "../src/io/atomic-write.js";
import {discoverSkills,type SkillScanResult,type SkillSource} from "../src/skills/discovery.js";
import {GeneratedRegistrySafetyError,SKILL_REGISTRY_CACHE_RELATIVE_PATH,SKILL_REGISTRY_RELATIVE_PATH,refreshSkillRegistry,renderSkillRegistry,type SkillRegistryMirror} from "../src/skills/generated-registry.js";

const document=(name:string,description=`Trigger: Use ${name}.`)=>`---\nname: ${name}\ndescription: "${description}"\n---\nBody\n`;
const source=(id:string,scope:SkillSource["scope"],root:string):SkillSource=>({id,scope,root});
async function fixture():Promise<string>{return fs.mkdtemp(path.join(os.tmpdir(),"asen-generated-registry-"));}
async function fixtureWithoutGitAncestor():Promise<string>{
 let current=os.tmpdir();
 for(;;){
  try{await fs.lstat(path.join(current,".git"));return fs.mkdtemp(path.join(path.parse(current).root,"asen-generated-registry-"));}
  catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  const parent=path.dirname(current);if(parent===current)return fixture();current=parent;
 }
}
async function skill(root:string,directory:string,name=directory,description?:string):Promise<string>{
 const file=path.join(root,directory,"SKILL.md");await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,document(name,description));return fs.realpath(file);
}
const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
function assertSafetySanitized(error:GeneratedRegistrySafetyError,forbidden:readonly string[]):void{
 assert.equal(Object.hasOwn(error,"cause"),false);
 const exposed=[error.message,error.stack,inspect(error),JSON.stringify(error),inspect(Object.getOwnPropertyDescriptors(error))].join("\n");
 for(const value of forbidden)assert.ok(!exposed.includes(value),`safety error exposed forbidden text: ${value}`);
}

await test("renders the exact deterministic empty registry without timestamps",async()=>{
 const scan=await discoverSkills([]);
 const expected="# Skill Registry\n\nProject: `empty-project`\n\n## Sources\n\n_None._\n\n## Registry contract\n\nProject scope precedes user scope, which precedes global scope. Within a scope, configured source order wins. The first accepted skill name wins. Paths are exact canonical paths.\n\n## Skills (0)\n\n_None._\n\n## Diagnostics (0)\n\n_None._\n";
 assert.equal(renderSkillRegistry("empty-project",[],scan),expected);
 assert.doesNotMatch(expected,/generated|timestamp|20\d\d/i);
});

await test("regenerates deterministically, writes schema-1 cache, then hits without writes",async()=>{
 const root=await fixture();try{
  const skills=path.join(root,"skills"),canonical=await skill(skills,"alpha","alpha","Original description");
  await fs.writeFile(path.join(skills,"broken","SKILL.md"),"---\nname: Broken\ndescription: nope\n---\n").catch(async()=>{await fs.mkdir(path.join(skills,"broken"),{recursive:true});await fs.writeFile(path.join(skills,"broken","SKILL.md"),"---\nname: Broken\ndescription: nope\n---\n");});
  const options={projectRoot:root,projectId:"project-1",sources:[source("local","project",skills)]};
  const first=await refreshSkillRegistry(options),registry=await fs.readFile(first.path,"utf8");
  assert.deepEqual(first,{path:path.join(await fs.realpath(root),SKILL_REGISTRY_RELATIVE_PATH),count:1,cache:"regenerated",persistence:{status:"unavailable"},entries:first.entries,skipped:first.skipped});
  assert.match(registry,/Original description/);assert.match(registry,new RegExp(canonical.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  const cache=JSON.parse(await fs.readFile(path.join(root,SKILL_REGISTRY_CACHE_RELATIVE_PATH),"utf8"));
  assert.equal(cache.schemaVersion,1);assert.equal(cache.sourceFingerprint,(await discoverSkills(options.sources)).fingerprint);assert.equal(cache.registrySha256,sha(registry));
  assert.deepEqual(cache.entries,first.entries);assert.deepEqual(cache.skipped,first.skipped);
  const hit=await refreshSkillRegistry({...options,atomicWrite:async()=>{throw new Error("hit must not write");}});
  assert.equal(hit.cache,"hit");assert.equal(hit.persistence.status,"unavailable");assert.deepEqual(hit.entries,first.entries);assert.deepEqual(hit.skipped,first.skipped);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

await test("invalidates for add, remove, path, same-length content, and source order changes",async()=>{
 const root=await fixture();try{
  const one=path.join(root,"one"),two=path.join(root,"two"),alpha=await skill(one,"alpha","alpha","aaaa");await skill(two,"beta");
  const base={projectRoot:root,projectId:"p",sources:[source("one","user",one),source("two","user",two)]};
  assert.equal((await refreshSkillRegistry(base)).cache,"regenerated");assert.equal((await refreshSkillRegistry(base)).cache,"hit");
  const renamed={...base,projectId:"project-2"};
  assert.equal((await refreshSkillRegistry(renamed)).cache,"regenerated");assert.equal((await refreshSkillRegistry(renamed)).cache,"hit");
  assert.equal((await refreshSkillRegistry(base)).cache,"regenerated");
  const gamma=await skill(one,"gamma");assert.equal((await refreshSkillRegistry(base)).cache,"regenerated");
  await fs.rm(gamma);assert.equal((await refreshSkillRegistry(base)).cache,"regenerated");
  await fs.rename(path.dirname(alpha),path.join(one,"moved"));assert.equal((await refreshSkillRegistry(base)).cache,"regenerated");
  await fs.writeFile(path.join(one,"moved","SKILL.md"),document("alpha","bbbb"));assert.equal((await refreshSkillRegistry(base)).cache,"regenerated");
  assert.equal((await refreshSkillRegistry({...base,sources:[...base.sources].reverse()})).cache,"regenerated");
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

await test("regenerates for tampered/deleted registry and malformed or mismatched cache",async()=>{
 const root=await fixture();try{
  const skills=path.join(root,"skills"),options={projectRoot:root,projectId:"p",sources:[source("s","project",skills)]};await skill(skills,"alpha");
  const registry=path.join(root,SKILL_REGISTRY_RELATIVE_PATH),cache=path.join(root,SKILL_REGISTRY_CACHE_RELATIVE_PATH);
  await refreshSkillRegistry(options);await fs.writeFile(registry,"tampered");assert.equal((await refreshSkillRegistry(options)).cache,"regenerated");
  await fs.rm(registry);assert.equal((await refreshSkillRegistry(options)).cache,"regenerated");
  await fs.writeFile(cache,"{");assert.equal((await refreshSkillRegistry(options)).cache,"regenerated");
  const parsed=JSON.parse(await fs.readFile(cache,"utf8"));parsed.entries="tampered";await fs.writeFile(cache,JSON.stringify(parsed));assert.equal((await refreshSkillRegistry(options)).cache,"regenerated");
  const stale=JSON.parse(await fs.readFile(cache,"utf8"));stale.entries=[];await fs.writeFile(cache,JSON.stringify(stale));const hit=await refreshSkillRegistry(options);assert.equal(hit.cache,"hit");assert.equal(hit.entries.length,1);
  const valid=JSON.parse(await fs.readFile(cache,"utf8"));valid.registrySha256="0".repeat(64);await fs.writeFile(cache,JSON.stringify(valid));assert.equal((await refreshSkillRegistry(options)).cache,"regenerated");
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

await test("renders exact entries and deterministic duplicate diagnostics",async()=>{
 const root=await fixture();try{
  const project=path.join(root,"project"),user=path.join(root,"user"),winner=await skill(project,"a","same","Winner text"),rejected=await skill(user,"z","same","Rejected text");
  const sources=[source("u","user",user),source("p","project",project)],scan=await discoverSkills(sources),output=renderSkillRegistry("p1",sources,scan);
  const duplicate=JSON.stringify({reason:"duplicate-name",sourceId:"u",path:rejected,name:"same",winnerPath:winner,rejectedPath:rejected});
  assert.equal(output,`# Skill Registry\n\nProject: \`p1\`\n\n## Sources\n\n1. \`p\` — project — \`${path.resolve(project)}\`\n2. \`u\` — user — \`${path.resolve(user)}\`\n\n## Registry contract\n\nProject scope precedes user scope, which precedes global scope. Within a scope, configured source order wins. The first accepted skill name wins. Paths are exact canonical paths.\n\n## Skills (1)\n\n### Skill \`same\`\n\n- Description: \`Winner text\`\n- Scope: project\n- Source: \`p\`\n- Path: \`${winner}\`\n\n## Diagnostics (1)\n\n- \`${duplicate}\`\n`);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

await test("renders hostile controlled values without creating Markdown structure",()=>{
 const hostile="```\n# injected\n- list\n`tail";
 const scan:SkillScanResult={fingerprint:"0".repeat(64),entries:[{
  name:hostile,description:hostile,scope:"project",path:hostile,sourceId:hostile,
 }],skipped:[{reason:"unreadable-path",sourceId:hostile,path:hostile}]};
 const output=renderSkillRegistry(hostile,[source(hostile,"project",hostile)],scan);
 assert.doesNotMatch(output,/^# injected$|^- list$|^```$/m);
 assert.match(output,/Project: ```` ```\\n# injected\\n- list\\n`tail ````/);
 assert.match(output,/### Skill ```` ```\\n# injected\\n- list\\n`tail ````/);
 assert.match(output,/- Description: ```` ```\\n# injected\\n- list\\n`tail ````/);
 assert.ok(output.includes('"sourceId":"```\\n# injected'));
});

await test("rejects extra, missing, and malicious cache fields at every schema level",async()=>{
 const root=await fixture();try{
  const skills=path.join(root,"skills"),broken=path.join(skills,"broken");
  await skill(skills,"alpha");await fs.mkdir(broken,{recursive:true});await fs.writeFile(path.join(broken,"SKILL.md"),"invalid");
  const options={projectRoot:root,projectId:"p",sources:[source("s","project",skills)]};
  const cachePath=path.join(root,SKILL_REGISTRY_CACHE_RELATIVE_PATH);
  await refreshSkillRegistry(options);
  const mutations:Array<(value:any)=>void>=[
   value=>{value.extra=true;},value=>{delete value.entries;},value=>{value.entries[0].extra=true;},
   value=>{delete value.entries[0].sourceId;},value=>{value.skipped[0].extra=true;},value=>{delete value.skipped[0].path;},
  ];
  for(const mutate of mutations){
   const value=JSON.parse(await fs.readFile(cachePath,"utf8"));mutate(value);
   await fs.writeFile(cachePath,JSON.stringify(value));assert.equal((await refreshSkillRegistry(options)).cache,"regenerated");
  }
  const value=JSON.parse(await fs.readFile(cachePath,"utf8"));
  const malicious=JSON.stringify(value).replace(/^\{/,`{"__proto__":{"polluted":true},`);
  await fs.writeFile(cachePath,malicious);
  assert.equal((await refreshSkillRegistry(options)).cache,"regenerated");
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

await test("rejects a linked output directory before reads or writes",async t=>{
 const container=await fixture();try{
  const project=path.join(container,"project"),outside=path.join(container,"outside");
  await fs.mkdir(project);await fs.mkdir(outside);
  try{await fs.symlink(outside,path.join(project,".asen"),process.platform==="win32"?"junction":"dir");}
  catch(error){t.skip(`link creation unavailable: ${String((error as NodeJS.ErrnoException).code??"unknown")}`);return;}
  await assert.rejects(refreshSkillRegistry({projectRoot:project,projectId:"p",sources:[]}),/real directory/);
  await assert.rejects(fs.access(path.join(outside,"skill-registry.md")));
  await assert.rejects(fs.access(path.join(outside,"skill-registry.cache.json")));
 }finally{await fs.rm(container,{recursive:true,force:true});}
});

await test("classifies tracked generated outputs without changing bytes or writing",async()=>{
 const cases=[[SKILL_REGISTRY_RELATIVE_PATH],[SKILL_REGISTRY_CACHE_RELATIVE_PATH],[SKILL_REGISTRY_RELATIVE_PATH,SKILL_REGISTRY_CACHE_RELATIVE_PATH]];
 for(const affectedPaths of cases){
  const root=await fixture();let writes=0;
  try{
   const registry=path.join(root,SKILL_REGISTRY_RELATIVE_PATH),cache=path.join(root,SKILL_REGISTRY_CACHE_RELATIVE_PATH);
   await fs.mkdir(path.dirname(registry),{recursive:true});
   await fs.writeFile(registry,"hand-maintained registry\n");await fs.writeFile(cache,"hand-maintained cache\n");
   const before=await fs.readdir(path.dirname(registry));
   const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{stdio:"ignore"});
   git("init","-q");git("config","user.name","ASEN Test");git("config","user.email","asen@example.invalid");
   git("add","--",...affectedPaths);git("commit","-qm","track generated output");
   const alternateIndex=path.join(root,"empty-index");execFileSync("git",["-C",root,"read-tree","--empty"],{stdio:"ignore",env:{...process.env,GIT_INDEX_FILE:alternateIndex}});
   const priorIndex=process.env.GIT_INDEX_FILE;process.env.GIT_INDEX_FILE=alternateIndex;
   try{
    await assert.rejects(refreshSkillRegistry({projectRoot:root,projectId:"p",sources:[],atomicWrite:async()=>{writes++;}}),error=>{
     assert.ok(error instanceof GeneratedRegistrySafetyError);assert.equal(error.code,"migration-required");
     assert.deepEqual(error.affectedPaths,affectedPaths);assert.equal(error.message,`Generated registry migration required: ${affectedPaths.join(", ")}`);
     assert.equal(error.stack,`${error.name}: ${error.message}`);
     const descriptor=Object.getOwnPropertyDescriptor(error,"affectedPaths");assert.equal(descriptor?.writable,false);assert.equal(descriptor?.configurable,false);
     assert.equal(Object.isFrozen(error.affectedPaths),true);assert.throws(()=>{(error.affectedPaths as string[]).push("appended");},TypeError);
     assert.throws(()=>{(error as unknown as {affectedPaths:string[]}).affectedPaths=["replaced"];},TypeError);assert.deepEqual(error.affectedPaths,affectedPaths);
     assertSafetySanitized(error,[root,alternateIndex,"GIT_INDEX_FILE","ls-files"]);return true;
    });
   }finally{if(priorIndex===undefined)delete process.env.GIT_INDEX_FILE;else process.env.GIT_INDEX_FILE=priorIndex;}
   assert.equal(writes,0);assert.deepEqual(await fs.readdir(path.dirname(registry)),before);
   assert.equal(await fs.readFile(registry,"utf8"),"hand-maintained registry\n");assert.equal(await fs.readFile(cache,"utf8"),"hand-maintained cache\n");
  }finally{await fs.rm(root,{recursive:true,force:true});}
 }
});

await test("fails closed with a sanitized classification when Git lookup fails",async()=>{
 const root=await fixture(),hostile="credential=secret-token";let writes=0;
 try{
  execFileSync("git",["-C",root,"init","-q"],{stdio:"ignore"});
  await fs.writeFile(path.join(root,".git","config"),`[${hostile}\n`);
  await assert.rejects(refreshSkillRegistry({projectRoot:root,projectId:"p",sources:[],atomicWrite:async()=>{writes++;}}),error=>{
   assert.ok(error instanceof GeneratedRegistrySafetyError);assert.equal(error.code,"git-lookup-failed");assert.deepEqual(error.affectedPaths,[]);
   assert.equal(error.message,"Generated registry Git lookup failed");assert.equal(error.stack,`${error.name}: ${error.message}`);
   assertSafetySanitized(error,[hostile,root,"not a git repository","GIT_CONFIG_PARAMETERS","ls-files"]);return true;
  });
  assert.equal(writes,0);await assert.rejects(fs.access(path.join(root,".asen")));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

await test("rejects bidi controls without restricting international Git paths",async()=>{
 const container=await fixtureWithoutGitAncestor(),project=path.join(container,"project"),bidi="\u202e",external=path.join(container,`valid-${bidi}-git-directory`);let writes=0;
 try{
  await fs.mkdir(project);execFileSync("git",["init","--bare","-q",external],{stdio:"ignore"});
  await fs.writeFile(path.join(project,".git"),`gitdir: ${external}\n`);
  await assert.rejects(refreshSkillRegistry({projectRoot:project,projectId:"p",sources:[],atomicWrite:async()=>{writes++;}}),error=>{
   assert.ok(error instanceof GeneratedRegistrySafetyError);assert.equal(error.code,"git-lookup-failed");assert.deepEqual(error.affectedPaths,[]);
   assertSafetySanitized(error,[bidi,external,container,"gitdir:"]);return true;
  });
  assert.equal(writes,0);await assert.rejects(fs.access(path.join(project,".asen")));
  const international=path.join(container,"répertoire-東京"),ordinaryProject=path.join(container,"ordinary-project");
  await fs.mkdir(ordinaryProject);execFileSync("git",["init","--bare","-q",international],{stdio:"ignore"});
  await fs.writeFile(path.join(ordinaryProject,".git"),`gitdir: ${international}\n`);
  assert.equal((await refreshSkillRegistry({projectRoot:ordinaryProject,projectId:"p",sources:[]})).cache,"regenerated");
 }finally{await fs.rm(container,{recursive:true,force:true});}
});

await test("fails closed for malformed and unresolved worktree Git markers",async()=>{
 for(const marker of ["malformed\u0000secret",`gitdir: ${path.resolve(os.tmpdir(),"missing-secret-git-directory")}`]){
  const root=await fixtureWithoutGitAncestor();let writes=0;
  try{
   await fs.writeFile(path.join(root,".git"),marker);
   await assert.rejects(refreshSkillRegistry({projectRoot:root,projectId:"p",sources:[],atomicWrite:async()=>{writes++;}}),error=>{
    assert.ok(error instanceof GeneratedRegistrySafetyError);assert.equal(error.code,"git-lookup-failed");assert.deepEqual(error.affectedPaths,[]);
    assert.equal(error.message,"Generated registry Git lookup failed");assertSafetySanitized(error,[marker,root,"malformed","secret","gitdir:","missing-secret-git-directory"]);return true;
   });
   assert.equal(writes,0);await assert.rejects(fs.access(path.join(root,".asen")));
  }finally{await fs.rm(root,{recursive:true,force:true});}
 }
});

await test("mirrors exact content on regeneration and hit, and sanitizes failures",async()=>{
 const root=await fixture();try{
  const skills=path.join(root,"skills"),calls:unknown[]=[];await skill(skills,"alpha");
  const mirror:SkillRegistryMirror={save:async payload=>{calls.push(payload);}};
  const options={projectRoot:root,projectId:"project-x",sources:[source("s","project",skills)],mirror};
  const first=await refreshSkillRegistry(options),content=await fs.readFile(first.path,"utf8");assert.equal(first.persistence.status,"saved");
  assert.deepEqual(calls[0],{title:"skill-registry",topicKey:"skill-registry",projectId:"project-x",content,capturePrompt:false});
  assert.equal((await refreshSkillRegistry(options)).persistence.status,"saved");assert.equal(calls.length,2);
  const failing={save:async()=>{throw {message:"token=secret\nline two"};}};
  const failedHit=await refreshSkillRegistry({...options,mirror:failing});assert.equal(failedHit.cache,"hit");assert.deepEqual(failedHit.persistence,{status:"failed",message:"Mirror failed"});
  await fs.writeFile(path.join(skills,"alpha","SKILL.md"),document("alpha","Changed"));
  const failedMiss=await refreshSkillRegistry({...options,mirror:failing});assert.equal(failedMiss.cache,"regenerated");assert.deepEqual(failedMiss.persistence,{status:"failed",message:"Mirror failed"});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

await test("writes registry before cache and does not publish cache after registry failure",async()=>{
 const root=await fixture();try{
  const skills=path.join(root,"skills"),events:string[]=[];await skill(skills,"alpha");
  const base={projectRoot:root,projectId:"p",sources:[source("s","project",skills)]};
  await refreshSkillRegistry({...base,atomicWrite:async(destination,content)=>{events.push(path.basename(destination));await atomicWriteText(destination,content);}});
  assert.deepEqual(events,["skill-registry.md","skill-registry.cache.json"]);
  const failedRoot=await fixture();try{
   await assert.rejects(refreshSkillRegistry({...base,projectRoot:failedRoot,atomicWrite:async destination=>{events.push(path.basename(destination));throw new Error("registry failed");}}),/registry failed/);
   await assert.rejects(fs.access(path.join(failedRoot,SKILL_REGISTRY_CACHE_RELATIVE_PATH)));
  }finally{await fs.rm(failedRoot,{recursive:true,force:true});}
  const cacheFailureRoot=await fixture();try{
   await assert.rejects(refreshSkillRegistry({...base,projectRoot:cacheFailureRoot,atomicWrite:async(destination,content)=>{if(destination.endsWith(".json"))throw new Error("cache failed");await atomicWriteText(destination,content);}}),/cache failed/);
   await fs.access(path.join(cacheFailureRoot,SKILL_REGISTRY_RELATIVE_PATH));await assert.rejects(fs.access(path.join(cacheFailureRoot,SKILL_REGISTRY_CACHE_RELATIVE_PATH)));
  }finally{await fs.rm(cacheFailureRoot,{recursive:true,force:true});}
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
