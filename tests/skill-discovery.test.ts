import assert from "node:assert/strict";
import {mkdtemp,mkdir,realpath,rename,rm,symlink,unlink,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {discoverSkills,resolveRegistryPaths,type SkillSource} from "../src/skills/discovery.js";

const document=(name:string,description=`Trigger: Use ${name}.`)=>`---\nname: ${name}\ndescription: "${description}"\n---\nBody\n`;
async function skill(root:string,directory:string,name=directory,description?:string):Promise<string>{
 const file=path.join(root,directory,"SKILL.md");
 await mkdir(path.dirname(file),{recursive:true});
 await writeFile(file,document(name,description));
 return realpath(file);
}
async function fixture():Promise<string>{return mkdtemp(path.join(os.tmpdir(),"asen-skill-discovery-"));}
const source=(id:string,scope:SkillSource["scope"],root:string):SkillSource=>({id,scope,root});
const directoryLink=(target:string,link:string)=>symlink(target,link,process.platform==="win32"?"junction":"dir");

await test("rejects duplicate source IDs before scanning with a deterministic error",async()=>{
 await assert.rejects(discoverSkills([
  source("z","project","absent-z"),source("a","user","absent-a"),source("z","global","absent-z2"),source("a","project","absent-a2")
 ]),/Duplicate skill source ids: a, z/);
});

await test("orders by scope, configured source order, and canonical path while diagnosing duplicates",async()=>{
 const root=await fixture();
 try{
  const projectA=path.join(root,"project-a"),projectB=path.join(root,"project-b"),user=path.join(root,"user"),global=path.join(root,"global");
  const winner=await skill(projectA,"zeta","shared","project winner");
  await skill(projectA,"alpha");
  const rejected=await skill(projectB,"shared");
  await skill(user,"shared");
  await skill(global,"shared");
  const scan=await discoverSkills([source("user","user",user),source("p-a","project",projectA),source("global","global",global),source("p-b","project",projectB)]);
  assert.deepEqual(scan.entries.map(({name,sourceId})=>[name,sourceId]),[["alpha","p-a"],["shared","p-a"]]);
  assert.equal(scan.entries[1]?.path,winner);
  assert.deepEqual(scan.skipped.filter(item=>item.reason==="duplicate-name").map(item=>item.sourceId),["p-b","user","global"]);
  const duplicate=scan.skipped.find(item=>item.reason==="duplicate-name");
  assert.deepEqual(duplicate&&[duplicate.winnerPath,duplicate.rejectedPath],[winner,rejected]);
 }finally{await rm(root,{recursive:true,force:true});}
});

await test("skips malformed metadata, exclusions, and missing roots without failing empty scans",async()=>{
 const root=await fixture();
 try{
  await skill(root,"bad-name","Bad Name");
  await writeFile(await skill(root,"missing-description"),"---\nname: missing-description\n---\n");
  await skill(root,"_shared");
  await skill(root,"sdd-folder","ordinary-name");
  await skill(root,"ordinary-folder","sdd-name");
  await skill(root,"registry","asen-skill-registry");
  const scan=await discoverSkills([source("missing","project",path.join(root,"absent")),source("root","project",root)]);
  assert.deepEqual(scan.entries,[]);
  assert.equal(scan.skipped.filter(item=>item.reason==="invalid-frontmatter").length,2);
  assert.equal(scan.skipped.filter(item=>item.reason==="excluded-name").length,4);
  assert.equal(scan.skipped.filter(item=>item.reason==="missing-source").length,1);
  assert.deepEqual((await discoverSkills([])).entries,[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

await test("sorts diagnostics independently of creation order",async()=>{
 const root=await fixture();
 try{
  await skill(root,"z-invalid","Bad Name");await skill(root,"a-excluded","_shared");
  const first=await discoverSkills([source("root","project",root)]);
  await rm(path.join(root,"z-invalid"),{recursive:true});await rm(path.join(root,"a-excluded"),{recursive:true});
  await skill(root,"a-excluded","_shared");await skill(root,"z-invalid","Bad Name");
  const second=await discoverSkills([source("root","project",root)]);
  assert.deepEqual(second.skipped,first.skipped);assert.equal(second.fingerprint,first.fingerprint);
 }finally{await rm(root,{recursive:true,force:true});}
});

await test("rejects a canonical path escaping its source",async t=>{
 const root=await fixture();
 try{
  const sourceRoot=path.join(root,"source"),outside=path.join(root,"outside");
  await mkdir(sourceRoot,{recursive:true});
  const target=await skill(outside,"escape");
  const link=path.join(sourceRoot,"SKILL.md");
  try{await symlink(target,link,"file");}catch(error){t.skip(`symlink unavailable: ${String(error)}`);return;}
  const scan=await discoverSkills([source("source","project",sourceRoot)]);
  assert.deepEqual(scan.entries,[]);
  assert.equal(scan.skipped[0]?.reason,"path-outside-source");
 }finally{await rm(root,{recursive:true,force:true});}
});

await test("rejects an escaping SKILL.md before reading target content",async()=>{
 const root=await fixture();
 try{
  const sourceRoot=path.join(root,"source"),visiblePath=path.join(sourceRoot,"SKILL.md");
  await mkdir(sourceRoot,{recursive:true});await writeFile(visiblePath,document("visible"));
  const canonicalVisiblePath=path.join(await realpath(sourceRoot),"SKILL.md"),outsidePath=path.join(root,"outside","SKILL.md");
  let contentReads=0;
  const scanFor=async(canonicalPath:string)=>discoverSkills([source("source","project",sourceRoot)],{
   realpath:async candidate=>path.resolve(candidate)===path.resolve(canonicalVisiblePath)?canonicalPath:realpath(candidate),
   readFile:async()=>{contentReads++;throw new Error("external content must not be read");}
  });
  const scan=await scanFor(outsidePath),moved=await scanFor(path.join(root,"moved-outside","SKILL.md"));
  assert.equal(contentReads,0);
  assert.deepEqual(scan.entries,[]);
  assert.deepEqual(scan.skipped,[{reason:"path-outside-source",sourceId:"source",path:path.resolve(canonicalVisiblePath),canonicalPath:path.resolve(outsidePath)}]);
  assert.notEqual(moved.fingerprint,scan.fingerprint);
 }finally{await rm(root,{recursive:true,force:true});}
});

await test("outside directory links invalidate the fingerprint when added and removed",async t=>{
 const root=await fixture();
 try{
  const sourceRoot=path.join(root,"source"),outside=path.join(root,"outside");
  await mkdir(sourceRoot,{recursive:true});await skill(outside,"external");
  const initial=await discoverSkills([source("source","project",sourceRoot)]),link=path.join(sourceRoot,"outside-link");
  try{await directoryLink(outside,link);}catch(error){t.skip(`directory link unavailable: ${String(error)}`);return;}
  const linked=await discoverSkills([source("source","project",sourceRoot)]);
  assert.notEqual(linked.fingerprint,initial.fingerprint);assert.equal(linked.skipped[0]?.reason,"path-outside-source");
  await unlink(link);
  assert.equal((await discoverSkills([source("source","project",sourceRoot)])).fingerprint,initial.fingerprint);
 }finally{await rm(root,{recursive:true,force:true});}
});

await test("does not recurse through directory-link cycles",{timeout:2_000},async t=>{
 const root=await fixture();
 try{
  await skill(root,"alpha");const nested=path.join(root,"nested");await mkdir(nested);
  try{await directoryLink(root,path.join(nested,"back"));}catch(error){t.skip(`directory link unavailable: ${String(error)}`);return;}
  assert.deepEqual((await discoverSkills([source("root","project",root)])).entries.map(entry=>entry.name),["alpha"]);
 }finally{await rm(root,{recursive:true,force:true});}
});

await test("diagnoses a broken directory link without aborting",async t=>{
 const root=await fixture();
 try{
  const sourceRoot=path.join(root,"source"),target=path.join(root,"target"),link=path.join(sourceRoot,"broken");
  await mkdir(sourceRoot,{recursive:true});const configured=[source("source","project",sourceRoot)],initial=await discoverSkills(configured);
  await mkdir(target);
  try{await directoryLink(target,link);}catch(error){t.skip(`directory link unavailable: ${String(error)}`);return;}
  await rm(target,{recursive:true});
  const scan=await discoverSkills(configured);
  assert.deepEqual(scan.entries,[]);assert.equal(scan.skipped[0]?.reason,"unreadable-path");assert.notEqual(scan.fingerprint,initial.fingerprint);
 }finally{await rm(root,{recursive:true,force:true});}
});

await test("fingerprint is stable and invalidates on content, path, membership, and source order changes",async()=>{
 const root=await fixture();
 try{
  const one=path.join(root,"one"),two=path.join(root,"two");
  const alpha=await skill(one,"alpha");
  await skill(two,"beta");
  const sources=[source("one","user",one),source("two","user",two)];
  const initial=await discoverSkills(sources);
  assert.equal((await discoverSkills(sources)).fingerprint,initial.fingerprint);
  await writeFile(alpha,document("alpha","Trigger: Use omega."));
  const edited=await discoverSkills(sources); assert.notEqual(edited.fingerprint,initial.fingerprint);
  const moved=path.join(one,"renamed"); await rename(path.dirname(alpha),moved);
  const afterMove=await discoverSkills(sources); assert.notEqual(afterMove.fingerprint,edited.fingerprint);
  const added=await skill(one,"gamma");
  const afterAdd=await discoverSkills(sources); assert.notEqual(afterAdd.fingerprint,afterMove.fingerprint);
  await rm(added); const afterRemove=await discoverSkills(sources); assert.notEqual(afterRemove.fingerprint,afterAdd.fingerprint);
  assert.notEqual((await discoverSkills([...sources].reverse())).fingerprint,afterRemove.fingerprint);
 }finally{await rm(root,{recursive:true,force:true});}
});

await test("resolves exact canonical paths in request order and fails closed",async()=>{
 const root=await fixture();
 try{
  const alpha=await skill(root,"alpha"),beta=await skill(root,"beta");
  const scan=await discoverSkills([source("root","project",root)]);
  assert.deepEqual(resolveRegistryPaths(scan,["beta","alpha"]),[beta,alpha]);
  assert.throws(()=>resolveRegistryPaths(scan,["alpha","unknown"]),/Unknown requested skill: unknown/);
  assert.throws(()=>resolveRegistryPaths(scan,["alpha","alpha"]),/Duplicate requested skill: alpha/);
 }finally{await rm(root,{recursive:true,force:true});}
});
