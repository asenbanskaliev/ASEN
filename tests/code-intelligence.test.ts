import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,realpathSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {createCodeIntelligenceTool,resolveCodeGraphEntry} from "../src/interaction/code-intelligence.js";
import {createAsenExtension} from "../extensions/asen.js";

function fixture(t:test.TestContext,body='console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}))'){
  const root=realpathSync(mkdtempSync(join(tmpdir(),"asen graph á ")));t.after(()=>rmSync(root,{recursive:true,force:true}));
  execFileSync("git",["init","-q",root]);const script=join(root,"fixture.mjs");writeFileSync(script,body);mkdirSync(join(root,"child"));
  const tools=new Map<string,any>();createAsenExtension({codeIntelligence:{executable:process.execPath,script}} as any)({registerCommand(){},registerTool(tool:any){tools.set(tool.name,tool);}} as any);
  return {root,script,tool:tools.get("asen_code_intelligence")};
}
const call=(tool:any,root:string,input:any,signal?:AbortSignal)=>tool.execute("probe",input,signal,undefined,{cwd:root});

test("registered read-only CodeGraph adapter keeps malicious query as one literal argument",async t=>{
  const f=fixture(t);assert.ok(f.tool,"public code-intelligence tool must exist");
  const query='--help; $(touch forbidden) & "á"';const result=await call(f.tool,f.root,{operation:"query",query,limit:2});
  assert.equal(result.details.status,"completed");const data=JSON.parse(result.content[0].text);
  assert.deepEqual(data.args,["query","--path",f.root,"--limit","2","--",query]);assert.equal(data.cwd,f.root);
  assert.equal((await call(f.tool,f.root,{operation:"explore",query:"symbol"})).details.status,"completed");
});
test("model cannot change roots, executable, limits or initialize an index",async t=>{
  const f=fixture(t,'throw Error("runner must never execute")');assert.ok(f.tool);
  for(const params of [{operation:"query",query:"x",limit:null},{operation:"init"},{operation:"query",query:"x",root:f.root},{operation:"query",query:"x",command:"sh"},{operation:"query",query:"x",limit:21},{operation:"query",query:" "},{operation:"query",query:"x".repeat(2001)}]){
    const result=await call(f.tool,f.root,params);assert.ok(["invalid","blocked"].includes(result.details.status));
  }
  assert.equal((await call(f.tool,join(f.root,"child"),{operation:"query",query:"x"})).details.status,"invalid_root");
});
test("stale/error output is sanitized with no automatic initialization or retry",async t=>{
  const f=fixture(t,'process.stderr.write("stale index private path");process.exit(2)');assert.ok(f.tool);
  const result=await call(f.tool,f.root,{operation:"query",query:"x"});assert.equal(result.details.status,"failed");assert.equal(JSON.stringify(result).includes("private path"),false);
});

test("bounded subprocess output, timeout and cancellation fail safely",async t=>{
  const f=fixture(t,'process.stdout.write("x".repeat(10000))');
  assert.equal((await call(createCodeIntelligenceTool({script:f.script,maxOutputBytes:100}),f.root,{operation:"query",query:"x"})).details.status,"output_limit");
  writeFileSync(f.script,'setTimeout(()=>{},10000)');
  assert.equal((await call(createCodeIntelligenceTool({script:f.script,timeoutMs:40}),f.root,{operation:"query",query:"x"})).details.status,"timeout");
  const controller=new AbortController();controller.abort();
  assert.equal((await call(f.tool,f.root,{operation:"query",query:"x"},controller.signal)).details.status,"cancelled");
  const running=new AbortController(),promise=call(f.tool,f.root,{operation:"query",query:"x"},running.signal);setTimeout(()=>running.abort(),50);
  assert.equal((await promise).details.status,"cancelled");
  assert.equal((await call(createCodeIntelligenceTool({executable:join(f.root,"absent")}),f.root,{operation:"query",query:"x"})).details.status,"unavailable");
});
test("npm entry resolution rejects escaping metadata, entries and shell shims",t=>{
  const f=fixture(t),pkg=join(f.root,"pkg");mkdirSync(pkg);
  const metadata=join(pkg,"package.json"),entry=join(pkg,"entry.mjs");writeFileSync(entry,"");
  writeFileSync(metadata,JSON.stringify({bin:{codegraph:"entry.mjs"}}));assert.equal(resolveCodeGraphEntry(pkg),entry);
  for(const target of ["../fixture.mjs","C:\\private.js","run.cmd"]){writeFileSync(metadata,JSON.stringify({bin:target}));assert.throws(()=>resolveCodeGraphEntry(pkg));}
  if(process.platform!=="win32"){
    rmSync(metadata);symlinkSync(f.script,metadata);assert.throws(()=>resolveCodeGraphEntry(pkg),/Escaping package metadata/);
    rmSync(metadata);writeFileSync(metadata,JSON.stringify({bin:"escape.mjs"}));symlinkSync(f.script,join(pkg,"escape.mjs"));assert.throws(()=>resolveCodeGraphEntry(pkg),/Escaping package entry/);
  }
});
