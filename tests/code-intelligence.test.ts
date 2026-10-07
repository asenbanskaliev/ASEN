import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,mkdtempSync,writeFileSync,mkdirSync,rmSync,realpathSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {createCodeGraphTool,createCodeIntelligenceTool,normalizePathEntry,registerCodeGraphTool,resolveCodeGraphEntry,type CodeGraphRunner} from "../src/interaction/code-intelligence.js";
import {createAsenExtension} from "../extensions/asen.js";

function fixture(t:test.TestContext,body='console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}))'){
  const root=realpathSync.native(mkdtempSync(join(tmpdir(),"asen graph á ")));t.after(()=>rmSync(root,{recursive:true,force:true}));
  execFileSync("git",["init","-q",root]);const script=join(root,"fixture.mjs");writeFileSync(script,body);mkdirSync(join(root,"child"));
  const tools=new Map<string,any>();createAsenExtension({codeIntelligence:{executable:process.execPath,script}} as any)({registerCommand(){},registerTool(tool:any){tools.set(tool.name,tool);}} as any);
  return {root,script,tool:tools.get("asen_code_intelligence")};
}
const call=(tool:any,root:string,input:any,signal?:AbortSignal)=>tool.execute("probe",input,signal,undefined,{cwd:root});
function textOf(content:{type:"text";text:string}|{type:"image"}|undefined):string {
  assert.equal(content?.type,"text");
  if(content?.type!=="text")throw new Error("Expected text tool content");
  return content.text;
}

test("registered read-only CodeGraph adapter keeps malicious query as one literal argument",async t=>{
  const f=fixture(t);assert.ok(f.tool,"public code-intelligence tool must exist");
  const query='--help; $(touch forbidden) & "á"';const result=await call(f.tool,f.root,{operation:"query",query,limit:2});
  assert.equal(result.details.status,"completed",JSON.stringify({status:result.details.status,root:f.root,gitRoot:execFileSync("git",["-C",f.root,"rev-parse","--show-toplevel"],{encoding:"utf8"}).trim()}));const data=JSON.parse(result.content[0].text);
  assert.deepEqual(data.args,["query","--path",f.root,"--limit","2","--",query]);assert.equal(data.cwd,f.root);
  assert.equal((await call(f.tool,f.root,{operation:"explore",query:"symbol"})).details.status,"completed");
  const alias=join(f.root,"root-alias");symlinkSync(f.root,alias,"junction");
  const aliased=await call(f.tool,alias,{operation:"query",query:"symbol"});assert.equal(aliased.details.status,"completed");assert.equal(JSON.parse(aliased.content[0].text).args[2],f.root);rmSync(alias);
});
test("model cannot change roots, executable, limits or initialize an index",async t=>{
  const f=fixture(t,'throw Error("runner must never execute")');assert.ok(f.tool);
  for(const params of [{operation:"query",query:"x",limit:null},{operation:"init"},{operation:"query",query:"x",root:f.root},{operation:"query",query:"x",command:"sh"},{operation:"query",query:"x",limit:21},{operation:"query",query:" "},{operation:"query",query:"x".repeat(2001)}]){
    const result=await call(f.tool,f.root,params);assert.ok(["invalid","blocked"].includes(result.details.status));
  }
  assert.equal((await call(f.tool,join(f.root,"child"),{operation:"query",query:"x"})).details.status,"invalid_root");
});
test("read-only compatibility tool rejects unsafe existing index entries before subprocess execution",async t=>{
  for(const kind of ["file","symlink"] as const){
    const f=fixture(t);
    const index=join(f.root,".codegraph");
    if(kind==="file")writeFileSync(index,"must not be read");
    else {
      const outside=join(f.root,"outside-index");
      mkdirSync(outside);
      symlinkSync(outside,index,"junction");
    }
    const result=await call(f.tool,f.root,{operation:"query",query:"symbol"});
    assert.equal(result.details.status,"failed",`${kind} index must be rejected`);
  }
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
test("PATH entry normalization strips only matched surrounding double quotes",()=>{
  assert.equal(normalizePathEntry('"C:\\Program Files\\node"'),"C:\\Program Files\\node");
  assert.equal(normalizePathEntry('"C:\\Program Files\\node'),'"C:\\Program Files\\node');
  assert.equal(normalizePathEntry('C:\\node"'),'C:\\node"');
  assert.equal(normalizePathEntry('""'),"");
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

test("tools omit an absent AbortSignal from injected runner options and preserve a provided signal",async t=>{
  const f=fixture(t);
  const calls:Array<{signal:AbortSignal|undefined;hasSignal:boolean}>=[];
  const runner:CodeGraphRunner=async(_args,options)=>{
    calls.push({signal:options.signal,hasSignal:Object.hasOwn(options,"signal")});
    return {stdout:"ok",stderr:""};
  };
  const canonical=createCodeGraphTool(runner);
  const readOnly=createCodeIntelligenceTool({},runner);
  await call(canonical,f.root,{operation:"query",query:"symbol"});
  assert.equal(calls[0]?.hasSignal,false,"canonical runner options must omit an absent signal");
  assert.equal(calls[0]?.signal,undefined);
  await call(readOnly,f.root,{operation:"query",query:"symbol"});
  const controller=new AbortController();
  await call(canonical,f.root,{operation:"query",query:"symbol"},controller.signal);
  await call(readOnly,f.root,{operation:"query",query:"symbol"},controller.signal);
  assert.equal(calls.length,4,"both facades must use the injected runner");
  assert.deepEqual(calls.map(call=>call.hasSignal),[false,false,true,true]);
  assert.ok(calls.slice(0,2).every(call=>call.signal===undefined));
  assert.ok(calls.slice(2).every(call=>call.signal===controller.signal));
});

test("canonical CodeGraph tool exposes upstream metadata and exact scoped argv without automatic init",async t=>{
  const f=fixture(t);
  const calls:Array<{args:readonly string[];cwd:string;maxBuffer:number}>=[];
  const runner:CodeGraphRunner=async(args,options)=>{
    calls.push({args,cwd:options.cwd,maxBuffer:options.maxBuffer});
    if(args[0]==="init")mkdirSync(join(options.cwd,".codegraph"));
    return {stdout:"indexed",stderr:""};
  };
  const tool=createCodeGraphTool(runner);
  assert.equal(tool.name,"codegraph");
  assert.equal(tool.renderShell,"self");
  assert.equal(tool.promptSnippet,"Initialize and query CodeGraph for the current workspace without shell access");
  assert.deepEqual(tool.promptGuidelines,[
    "Use operation init before querying when the current workspace has no .codegraph index.",
    "Use query for symbol search and explore for source plus call paths. Do not use this tool to run arbitrary commands or target another directory.",
  ]);
  assert.equal(tool.annotations?.readOnlyHint,false,"init mutates the workspace index");
  assert.deepEqual(tool.parameters,{
    type:"object",
    additionalProperties:false,
    required:["operation"],
    properties:{
      operation:{type:"string",enum:["init","query","explore"]},
      query:{type:"string",minLength:1,maxLength:2000},
      limit:{type:"integer",minimum:1,maximum:20},
    },
  });
  const context={cwd:f.root};
  const query=await tool.execute("probe",{operation:"query",query:"--help",limit:4},undefined,undefined,context as any);
  const explore=await tool.execute("probe",{operation:"explore",query:"call path",limit:3},undefined,undefined,context as any);
  assert.equal(existsSync(join(f.root,".codegraph")),false,"queries must not initialize automatically");
  const init=await tool.execute("probe",{operation:"init"},undefined,undefined,context as any);
  assert.equal(existsSync(join(f.root,".codegraph")),true,"explicit init may create only the fixture index");
  assert.deepEqual(calls.map(call=>call.args),[
    ["query","--path",f.root,"--limit","4","--","--help"],
    ["explore","--path",f.root,"--max-files","3","--","call path"],
    ["init",f.root],
  ]);
  assert.ok(calls.every(call=>call.cwd===f.root&&call.maxBuffer>100000));
  assert.deepEqual(query.details,{operation:"query",cwd:f.root,args:calls[0]!.args});
  assert.deepEqual(explore.content,[{type:"text",text:"indexed"}]);
  assert.deepEqual(init.content,[{type:"text",text:"indexed"}]);
});

test("canonical CodeGraph tool validates an existing index with lstat and never executes for unsafe entries",async t=>{
  for(const kind of ["file","symlink"] as const){
    const f=fixture(t),index=join(f.root,".codegraph");
    if(kind==="file")writeFileSync(index,"must not be read");
    else {const outside=join(f.root,"outside-index");mkdirSync(outside);symlinkSync(outside,index,"junction");}
    let calls=0;
    const tool=createCodeGraphTool(async()=>{
      calls++;
      return {stdout:"unexpected",stderr:""};
    });
    await assert.rejects(()=>tool.execute("probe",{operation:"init"},undefined,undefined,{cwd:f.root} as any),/real directory/i);
    assert.equal(calls,0);
  }
});

test("canonical CodeGraph tool truncates output and returns upstream-compatible fallback metadata",async t=>{
  const f=fixture(t);
  const large=createCodeGraphTool(async()=>({stdout:"x".repeat(100001),stderr:""}));
  const truncated=await large.execute("probe",{operation:"query",query:"symbol"},undefined,undefined,{cwd:f.root} as any);
  assert.match(textOf(truncated.content[0]),/\[CodeGraph output truncated\]$/);
  const unavailable=createCodeGraphTool(async()=>{throw Object.assign(new Error("missing"),{code:"ENOENT"});});
  const fallback=await unavailable.execute("probe",{operation:"explore",query:"symbol"},undefined,undefined,{cwd:f.root} as any);
  assert.deepEqual(fallback.details,{status:"unavailable",operation:"explore",cwd:f.root,fallback:"Use read, grep, and find for this exploration."});
  assert.match(textOf(fallback.content[0]),/binary was not found/);
});

test("canonical registration and ASEN integration expose both contracts with correct annotations",t=>{
  const direct:any[]=[];
  registerCodeGraphTool({registerTool:(tool:any)=>direct.push(tool)} as any);
  assert.deepEqual(direct.map(tool=>tool.name),["codegraph"]);

  const f=fixture(t);
  const tools=new Map<string,any>();
  createAsenExtension({codeIntelligence:{executable:process.execPath,script:f.script}})({
    registerCommand(){},
    registerTool(tool:any){tools.set(tool.name,tool);},
  } as any);
  assert.deepEqual([...tools.keys()],["asen_ask_choice","asen_ask_question","asen_code_intelligence","codegraph"]);
  assert.equal(tools.get("asen_code_intelligence").annotations.readOnlyHint,true);
  assert.equal(tools.get("codegraph").annotations.readOnlyHint,false);
});
