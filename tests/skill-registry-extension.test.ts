import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {createAsenExtension} from "../extensions/asen.js";
import {SKILL_REGISTRY_CACHE_RELATIVE_PATH,SKILL_REGISTRY_RELATIVE_PATH} from "../src/skills/generated-registry.js";
import {listSkillContracts,selectSkills} from "../src/skills/registry.js";

const document=(name:string,description:string)=>`---\nname: ${name}\ndescription: "${description}"\n---\nBody\n`;
async function fixture():Promise<string>{return fs.mkdtemp(path.join(os.tmpdir(),"asen-extension-registry-"));}
async function addSkill(root:string,directory:string,name:string,description:string):Promise<void>{
 const target=path.join(root,directory,"SKILL.md");await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,document(name,description));
}
type Command={handler:(args:string|undefined,ctx:{cwd:string;ui:{notify:(message:string,level:"info"|"error")=>void}})=>Promise<unknown>};
function commandFor(options:Parameters<typeof createAsenExtension>[0]):Command{
 const commands=new Map<string,Command>();createAsenExtension(options)({registerCommand:(name,command)=>commands.set(name,command as Command)});
 assert.ok(commands.has("asen"));assert.ok(commands.has("asen-skill-registry"));return commands.get("asen-skill-registry")!;
}
function context(cwd:string){const notifications:Array<{message:string;level:"info"|"error"}>=[];return {ctx:{cwd,ui:{notify:(message:string,level:"info"|"error")=>notifications.push({message,level})}},notifications};}

await test("refresh command scans four ordered sources, persists exact output, hits, and invalidates",async()=>{
 const root=await fixture();try{
  const project=path.join(root,"project"),home=path.join(root,"home"),pkg=path.join(root,"package");await Promise.all([fs.mkdir(project),fs.mkdir(home),fs.mkdir(pkg)]);
  const roots=[path.join(project,"skills"),path.join(project,".agents","skills"),path.join(home,".agents","skills"),path.join(pkg,"skills")];
  const descriptions=["project winner","project agents loser","user loser","global loser"];
  for(let index=0;index<roots.length;index++){await addSkill(roots[index]!,"shared","shared",descriptions[index]!);await addSkill(roots[index]!,`only-${index}`,`only-${index}`,`unique ${index}`);}
  const command=commandFor({homeDir:()=>home,packageRoot:pkg}),observed=context(project);
  const first=await command.handler(" refresh ",observed.ctx),canonical=await fs.realpath(project),registryPath=path.join(canonical,SKILL_REGISTRY_RELATIVE_PATH),cachePath=path.join(canonical,SKILL_REGISTRY_CACHE_RELATIVE_PATH);
  const exact=`ASEN skill registry refreshed: path=${registryPath}; skills=5; cache=regenerated; diagnostics=3; memory=unavailable.`;
  assert.equal(first,exact);assert.deepEqual(observed.notifications,[{message:exact,level:"info"}]);
  const before=await fs.readFile(registryPath),cacheBefore=await fs.readFile(cachePath),cache=JSON.parse(cacheBefore.toString()),mtime=(await fs.stat(registryPath)).mtimeMs,cacheMtime=(await fs.stat(cachePath)).mtimeMs;
  assert.equal(cache.entries.length,5);assert.match(before.toString(),/project winner/);assert.doesNotMatch(before.toString(),/project agents loser|user loser|global loser/);
  const sourcePositions=["project-skills","project-agents-skills","user-agents-skills","package-skills"].map(value=>before.toString().indexOf(`\`${value}\``));assert.ok(sourcePositions.every((value,index)=>value>=0&&(index===0||value>sourcePositions[index-1]!)));
  observed.notifications.length=0;const hit=await command.handler("refresh",observed.ctx);
  assert.equal(hit,exact.replace("cache=regenerated","cache=hit"));assert.deepEqual(await fs.readFile(registryPath),before);assert.deepEqual(await fs.readFile(cachePath),cacheBefore);assert.equal((await fs.stat(registryPath)).mtimeMs,mtime);assert.equal((await fs.stat(cachePath)).mtimeMs,cacheMtime);
  await addSkill(path.join(pkg,"skills"),"added","added","new membership");const membership=await command.handler("refresh",observed.ctx),membershipBytes=await fs.readFile(registryPath);assert.match(String(membership),/skills=6; cache=regenerated/);assert.notDeepEqual(membershipBytes,before);
  await fs.writeFile(path.join(pkg,"skills","only-3","SKILL.md"),document("only-3","changed global"));
  const changed=await command.handler("refresh",observed.ctx);assert.match(String(changed),/cache=regenerated/);assert.notDeepEqual(await fs.readFile(registryPath),membershipBytes);
  assert.equal(listSkillContracts().length,27);assert.ok(!selectSkills({phase:"apply",codeChange:true}).some(skill=>skill.path.startsWith(canonical)||skill.path.includes("only-")));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

await test("empty roots produce valid empty output and path-identical sources collapse first",async()=>{
 const root=await fixture();try{
  const project=path.join(root,"project"),home=path.join(root,"home");await fs.mkdir(project);await fs.mkdir(home);
  const command=commandFor({homeDir:()=>home,packageRoot:project}),observed=context(project),result=await command.handler("refresh",observed.ctx);
  const canonical=await fs.realpath(project),expected=`ASEN skill registry refreshed: path=${path.join(canonical,SKILL_REGISTRY_RELATIVE_PATH)}; skills=0 (empty when zero); cache=regenerated; diagnostics=3; memory=unavailable.`;
  assert.equal(result,expected);const registry=await fs.readFile(path.join(canonical,SKILL_REGISTRY_RELATIVE_PATH),"utf8");
  assert.match(registry,/## Skills \(0\)\n\n_None\._/);assert.equal((registry.match(/`project-skills`/g)??[]).length,1);assert.doesNotMatch(registry,/`package-skills`/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

await test("invalid or missing arguments return usage without filesystem writes",async()=>{
 const root=await fixture();try{
  const project=path.join(root,"project"),home=path.join(root,"home"),pkg=path.join(root,"package");await Promise.all([fs.mkdir(project),fs.mkdir(home),fs.mkdir(pkg)]);
  const command=commandFor({homeDir:()=>home,packageRoot:pkg});
  for(const args of [undefined,"","refresh now","REFRESH"]){const observed=context(project);assert.equal(await command.handler(args,observed.ctx),"Usage: /asen-skill-registry refresh");assert.deepEqual(observed.notifications,[{message:"Usage: /asen-skill-registry refresh",level:"info"}]);}
  await assert.rejects(fs.access(path.join(project,".asen")));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

await test("operational errors are sanitized, notified, and rethrown without false success",async()=>{
 const root=await fixture();try{
  const original=new Error("refresh\nfailed\u0000now"),project=path.join(root,"project");await fs.mkdir(project);
  const command=commandFor({homeDir:()=>root,packageRoot:root,refresh:async()=>{throw original;}}),observed=context(project);
  await assert.rejects(command.handler("refresh",observed.ctx),error=>error===original);
  assert.deepEqual(observed.notifications,[{message:"ASEN skill registry refresh failed: refresh failed now",level:"error"}]);await assert.rejects(fs.access(path.join(project,".asen")));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

await test("mirror saved, failed, and unavailable states are reported on misses and hits",async()=>{
 const root=await fixture();try{
  for(const [name,mirror,status] of [
   ["saved",{save:async()=>{}},"saved"],
   ["failed",{save:async()=>{throw new Error("private detail");}},"failed"],
   ["unavailable",undefined,"unavailable"],
  ] as const){
   const project=path.join(root,name),home=path.join(project,"home"),pkg=path.join(project,"package");await fs.mkdir(project);await fs.mkdir(home);await fs.mkdir(pkg);await addSkill(path.join(project,"skills"),"one","one","One");
   const command=commandFor({homeDir:()=>home,packageRoot:pkg,...(mirror?{mirror}:{})}),observed=context(project);
   for(const cache of ["regenerated","hit"]){const result=await command.handler("refresh",observed.ctx);assert.match(String(result),new RegExp(`cache=${cache}; diagnostics=3; memory=${status}\\.$`));}
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
