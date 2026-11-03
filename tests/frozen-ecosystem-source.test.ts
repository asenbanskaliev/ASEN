import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
// @ts-expect-error The dependency-free frozen source verifier is maintained as ESM.
import {frozenSourceBinding,prepareFrozenEcosystem} from "../.github/scripts/prepare-frozen-ecosystem-baseline.mjs";

const ecosystem=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-sources-v1.json",import.meta.url),"utf8"));
const skills=JSON.parse(readFileSync(new URL("../registry/parity/skill-sources-v1.json",import.meta.url),"utf8"));
const {commit,tree}=ecosystem,repository=skills.baseline.repository;

test("F7 frozen reference provenance uses two matching checked-in manifests",()=>{
 assert.deepEqual(frozenSourceBinding(ecosystem,skills),{repository,commit,tree});
 for(const bad of [
  [{commit,tree:"not-a-tree"},skills],
  [ecosystem,{baseline:{repository,commit:"0".repeat(40)}}],
  [ecosystem,{baseline:{repository:"../evil",commit}}],
  [ecosystem,{baseline:{repository:"other/scope/subpath",commit}}],
  [ecosystem,{baseline:{repository:"./repo",commit}}],
  [ecosystem,{baseline:{repository:"host@evil.invalid/path",commit}}],
  [ecosystem,{baseline:{repository:"org/repo?query",commit}}],
  [{commit:42,tree},skills],
 ])assert.throws(()=>frozenSourceBinding(bad[0],bad[1]),/provenance/);
});
test("F7 frozen source acquires exact Git SHA without GitHub API search",()=>{
 const calls:unknown[][]=[],envWrites:string[]=[],root=join(process.cwd(),"tmp-ecofrozen-runner");
 const git=(_bin:string,args:string[],options:unknown)=>{
  calls.push([args,options]);
  if(args.includes("FETCH_HEAD"))return commit+"\n";
  if(args.includes("cat-file"))return "commit\n";
  if(args.some(x=>x.includes("^{tree}")))return tree+"\n";
  return "";
 };
 const result=prepareFrozenEcosystem({ecosystem,skills,environment:{
  RUNNER_TEMP:root,GITHUB_ENV:join(root,"env")
 },git,appendEnv:(_path:string,content:string)=>envWrites.push(content)});
 assert.equal(result.commit,commit);
 assert.equal(calls.length,5);
 const fetchArgs=calls[1]![0] as string[];
 assert.deepEqual(fetchArgs,["--git-dir",join(root,"asen-ecosystem-baseline.git"),
  "fetch","--no-tags","--depth=1",`https://github.com/${repository}.git`,commit]);
 assert.equal(envWrites.length,1);
 assert.match(envWrites[0]!,/ECOSYSTEM_BASELINE_REPOSITORY=/);
});
test("F7 frozen provenance rejects wrong commit/tree and never publishes a witness path",()=>{
 for(const mismatch of ["commit","tree"]){
  const writes:string[]=[],root=join(process.cwd(),"tmp-ecofrozen-negative");
  assert.throws(()=>prepareFrozenEcosystem({ecosystem,skills,environment:{
   RUNNER_TEMP:root,GITHUB_ENV:join(root,"env")
  },git:(_bin:string,args:string[])=>{
   if(args.includes("FETCH_HEAD"))return mismatch==="commit"?"0".repeat(40):commit;
   if(args.includes("cat-file"))return "commit";
   if(args.some(x=>x.includes("^{tree}")))return mismatch==="tree"?"0".repeat(40):tree;
   return "";
  },appendEnv:(_path:string,content:string)=>writes.push(content)}),/identity mismatch/);
  assert.equal(writes.length,0);
 }
});
