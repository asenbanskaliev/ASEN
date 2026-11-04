import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
// @ts-expect-error Standalone A/B native host probe uses a deliberately small ESM-only API.
import {runReferenceHostSmoke,validateReferenceHostSmoke} from "../scripts/agent-ab-host-smoke.mjs";
// @ts-expect-error Frozen A/B Git manifest loader is pure ESM.
import {pinnedAgentABSources} from "../scripts/agent-ab-source-witness.mjs";

function fixture(){
 const root=mkdtempSync(join(tmpdir(),"asen-ab-native-host-test-")),source=pinnedAgentABSources();
 const calls:Array<{command:string;args:string[];env:Record<string,string>}>=[];
 let malformed="",badHelp=false;
 const invoke=(command:string,args:string[],options:any)=>{
  calls.push({command,args,env:options.env});
  assert.equal(options.stdio[0],"ignore");
  assert.equal(options.maxBuffer,131072);
  assert.equal(options.env.PI_OFFLINE,"1");
  assert.equal(options.env.GIT_TERMINAL_PROMPT,"0");
  assert.equal("OPENAI_API_KEY" in options.env,false);
  const directory=command==="git"?String(args[1]):String(options.cwd);
  const id=directory.includes("reference-B")?"B":"A";
  const identity=source.find((x:{id:string})=>x.id===id);
  assert.ok(identity);
  if(command==="git"){
   if(args.includes("rev-parse"))return args.includes("HEAD^{tree}")?
    (malformed==="tree"? "0".repeat(40):identity.tree)+"\n":
    (malformed==="commit"? "0".repeat(40):identity.commit)+"\n";
   if(args.includes("status"))return malformed==="dirty"?" M README.md\n":"";
   return "";
  }
  if(command==="go"){
   assert.deepEqual(args.slice(0,2),["build","-trimpath"]);
   assert.equal(args.at(-1),"./cmd/gentle-ai");
   writeFileSync(join(root,"gentle-ai-smoke"),"synthetic built file",{flag:"wx"});
   return "";
  }
  if(command===process.execPath){
   assert.equal(args.at(-1),"--help");
   return badHelp?"":("usage: gentle-shell pi provider subagents ".repeat(2));
  }
  if(command===join(root,"gentle-ai-smoke")){
   assert.deepEqual(args,["--help"]);
   return badHelp?"":("Usage: gentle-ai installer and agent framework ".repeat(2));
  }
  throw Error("Unexpected external command");
 };
 return {root,calls,invoke,setError:(e:string)=>malformed=e,setBadHelp:()=>badHelp=true,dispose:()=>rmSync(root,{recursive:true,force:true})};
}
test("EF-002 A/B native entrypoints run as actual pinned hosts without fabricating runtime parity",t=>{
 const f=fixture();t.after(f.dispose);
 const receipt=runReferenceHostSmoke({root:f.root,runCommand:f.invoke});
 assert.equal(validateReferenceHostSmoke(receipt),true);
 assert.equal(receipt.status,"REFERENCE_HOST_HELP_ONLY");
 assert.equal(receipt.hosts.length,2);
 assert.equal(receipt.executedCases,0);
 assert.equal(receipt.modelCalls,0);
 assert.equal(receipt.referenceBProvisioned,false);
 assert.equal(receipt.fullParity,false);
 assert.deepEqual(receipt.hosts.map((x:{runtime:string})=>x.runtime),
  ["node-pi-entrypoint","go-installer-binary"]);
 const gitFetch=f.calls.filter(x=>x.command==="git"&&x.args.includes("fetch"));
 assert.equal(gitFetch.length,2);
 assert.ok(gitFetch.every(x=>x.args.includes("--depth=1")&&x.args.includes("--no-tags")));
 assert.ok(f.calls.some(x=>x.command==="go"&&x.args.includes("build")));
 assert.equal(f.calls.filter(x=>x.args.includes("--help")).length,2);
 assert.ok(!f.calls.some(x=>x.args.some(a=>["install","push","merge","reset","run"].includes(a))));
});
test("EF-002 native host smoke rejects fake commit, tree, dirty source and missing help",t=>{
 for(const name of ["commit","tree","dirty","help"]){
  const f=fixture();t.after(f.dispose);
  if(name==="help")f.setBadHelp();else f.setError(name);
  assert.throws(()=>runReferenceHostSmoke({root:f.root,runCommand:f.invoke}),
   /identity mismatch|modified its pinned checkout|invalid bounded output/u,name);
 }
});
test("EF-701 native A/B receipt cannot assert C01-C20 or substitute Go for a Pi runtime",()=>{
 const list=pinnedAgentABSources(),good={
  schema:"asen-ab-native-host-smoke/v1",status:"REFERENCE_HOST_HELP_ONLY",
  hosts:list.map((x:{id:string;repository:string;commit:string;tree:string},i:number)=>({
   id:x.id,repository:x.repository,commit:x.commit,tree:x.tree,
   runtime:i===0?"node-pi-entrypoint":"go-installer-binary",
   exitCode:0,outputSha256:"0".repeat(64),outputBytes:75,
   onlyHelp:true,repositoryClean:true,
  })),
  executedCases:0,modelCalls:0,writerAuthorized:false,
  referenceBProvisioned:false,fullParity:false,
 };
 assert.equal(validateReferenceHostSmoke(good),true);
 for(const corrupt of [
  (x:any)=>x.executedCases=1,(x:any)=>x.fullParity=true,
  (x:any)=>x.writerAuthorized=true,(x:any)=>x.referenceBProvisioned=true,
  (x:any)=>x.hosts[1].runtime="native-pi-agent-runtime",
  (x:any)=>x.hosts[0].commit="1".repeat(40),
  (x:any)=>x.hosts[0].outputSha256="not-a-hash",
  (x:any)=>x.hosts[1].repositoryClean=false,
  (x:any)=>x.hosts.pop(),
 ]){const altered=structuredClone(good);corrupt(altered);assert.throws(()=>validateReferenceHostSmoke(altered));}
});
