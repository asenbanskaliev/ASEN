import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {runShellReferenceProbe,validateShellReferenceProbe} from "../scripts/shell-reference-probe.mjs";

const sha="a".repeat(40);
const reference={id:"SHELL",repository:"Gen"+"tleman-Programming/"+"gen"+"tle-shell",
 tag:"v4.6.0",commit:"1f74e9e24473e7e121a96b1680444ae0196d3009",
 tree:"64d14750450d0144d65230eb0b6ecc69d841a8f3",
 packageVersion:"4.6.0",host:"pi"};
function fixture(t,{version="4.6.0",wrongTree=false,dirty=false,help=""}={}){
 const root=mkdtempSync(join(tmpdir(),"asen-shell-probe-test-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const calls=[];
 const runCommand=(command,args,options)=>{
  calls.push({command,args,env:options.env});
  assert.equal(options.env.GIT_TERMINAL_PROMPT,"0");
  assert.equal(options.env.PI_OFFLINE,"1");
  assert.equal(Object.hasOwn(options.env,"OLLAMA_API_KEY"),false);
  if(command==="git"){
   if(args.includes("checkout")){
    writeFileSync(join(root,"reference","package.json"),
     JSON.stringify({name:"gen"+"tle-pi",version,bin:{["gen"+"tle-shell"]:"bin/"+"gen"+"tle-shell.mjs"}}));
   }
   if(args.includes("rev-parse"))
    return args.includes("HEAD^{tree}")?(wrongTree?"b".repeat(40):reference.tree):reference.commit;
   if(args.includes("status"))return dirty?" M README.md":"";
   return "";
  }
  if(command===process.execPath){
   assert.ok(args.at(-1)==="--help");
   return help||"CLI usage in a real pinned Pi source reference\n";
  }
  throw new Error("Unexpected subprocess");
 };
 return {root,calls,runCommand};
}
test("R4-04 verifies only frozen Shell 4.6.0 executable, no second reference agent",t=>{
 const f=fixture(t);
 const x=runShellReferenceProbe({...f,candidateSha:sha,reference});
 assert.equal(x.version,"4.6.0");
 assert.equal(x.referenceSha,reference.commit);
 assert.equal(x.runtimeHost,"pi");
 assert.equal(x.status,"SHELL_LAUNCHER_HELP_ONLY");
 assert.equal(x.casesExecuted,0);
 assert.equal(x.modelCalls,0);
 assert.equal(x.globalFull,false);
 assert.equal(validateShellReferenceProbe(x,reference),true);
 assert.equal(f.calls.filter(c=>c.command==="git"&&c.args.includes("fetch")).length,1);
 assert.equal(f.calls.filter(c=>c.command===process.execPath).length,1);
 assert.ok(f.calls.every(c=>!c.args.includes("install")&&!c.args.includes("push")));
});
test("R4-04 fails closed on wrong source version, tree and dirty checkout",t=>{
 for(const opts of [{version:"4.5.1"},{wrongTree:true},{dirty:true}]){
  const f=fixture(t,opts);
  assert.throws(()=>runShellReferenceProbe({...f,candidateSha:sha,reference}),
   /Wrong reference package version|Unexpected reference tree|modified during read-only/u);
 }
});
test("R4-04 never approves a forged FULL or model-call artifact",t=>{
 const f=fixture(t),source=runShellReferenceProbe({...f,candidateSha:sha,reference});
 for(const patch of [{globalFull:true},{modelCalls:1},{casesExecuted:1},
  {userAuthorizedWrites:true},{referenceSha:"b".repeat(40)},{version:"4.5.1"},
  {runtimeHost:"some-other-agent"},{helpDigest:"not-a-hash"}]){
  assert.throws(()=>validateShellReferenceProbe({...source,...patch},reference));
 }
});
test("R4-04 requires exact ASEN SHA for native source probe",t=>{
 const f=fixture(t);
 assert.throws(()=>runShellReferenceProbe({...f,candidateSha:"wrong",reference}));
});
