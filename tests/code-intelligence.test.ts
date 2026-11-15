import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,mkdtempSync,writeFileSync,mkdirSync,rmSync,realpathSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {createCodeGraphTool,createCodeIntelligenceTool,normalizePathEntry,registerCodeGraphTool,resolveCodeGraphEntry,type CodeGraphRunner} from "../src/interaction/code-intelligence.js";
import {createAsenExtension} from "../extensions/asen.js";

function fixture(t:test.TestContext,body='console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}))'){
  const root=realpathSync.native(mkdtempSync(join(tmpdir(),"asen graph á ")));t.after(()=>rmSync(root,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
  execFileSync("git",["init","-q",root]);const script=join(root,"fixture.mjs");writeFileSync(script,body);mkdirSync(join(root,"child"));
  const tools=new Map<string,any>();createAsenExtension({codeIntelligence:{executable:process.execPath,script}} as any)({registerCommand(){},registerTool(tool:any){tools.set(tool.name,tool);}} as any);
  return {root,script,tool:createCodeIntelligenceTool({executable:process.execPath,script}),canonical:tools.get("codegraph"),registered:[...tools.keys()]};
}
const call=(tool:any,root:string,input:any,signal?:AbortSignal,extra:Record<string,unknown>={})=>tool.execute("probe",input,signal,undefined,{cwd:root,...extra});
function textOf(content:{type:"text";text:string}|{type:"image"}|undefined):string {
  assert.equal(content?.type,"text");
  if(content?.type!=="text")throw new Error("Expected text tool content");
  return content.text;
}

test("registered read-only CodeGraph adapter keeps malicious query as one literal argument",async t=>{
  const f=fixture(t);assert.ok(f.tool,"public code-intelligence tool must exist");
  const query='--help; $(touch forbidden) & "á"';const result=await call(f.tool,f.root,{operation:"query",query,limit:2});
  assert.equal(result.details.status,"completed",JSON.stringify({status:result.details.status,root:f.root,gitRoot:execFileSync("git",["-C",f.root,"rev-parse","--show-toplevel"],{encoding:"utf8"}).trim()}));const data=JSON.parse(result.content[0].text);
  assert.deepEqual(data.args,["query","--limit","2","--",query]);assert.equal(data.cwd,f.root);
  assert.equal((await call(f.tool,f.root,{operation:"explore",query:"symbol"})).details.status,"completed");
  const alias=join(f.root,"root-alias");symlinkSync(f.root,alias,"junction");
  const aliased=await call(f.tool,alias,{operation:"query",query:"symbol"});assert.equal(aliased.details.status,"completed");assert.equal(JSON.parse(aliased.content[0].text).cwd,f.root);rmSync(alias);
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

test("CodeGraph subprocesses disable telemetry and network fallback",async t=>{
  const f=fixture(t,'console.log(JSON.stringify({download:process.env.CODEGRAPH_NO_DOWNLOAD,telemetry:process.env.CODEGRAPH_TELEMETRY,doNotTrack:process.env.DO_NOT_TRACK,unapproved:process.env.UNAPPROVED_CODEGRAPH_SETTING}))');
  const result=await call(createCodeIntelligenceTool({executable:process.execPath,script:f.script}),f.root,{operation:"query",query:"symbol"});
  assert.equal(result.details.status,"completed");
  assert.deepEqual(JSON.parse(result.content[0].text),{download:"1",telemetry:"0",doNotTrack:"1"});
});

test("canonical CodeGraph tool exposes upstream metadata and exact scoped argv without automatic init",async t=>{
  const f=fixture(t);
  const calls:Array<{args:readonly string[];cwd:string;maxBuffer:number}>=[];
  const runner:CodeGraphRunner=async(args,options)=>{
    calls.push({args,cwd:options.cwd,maxBuffer:options.maxBuffer});
    if(args[0]==="init"){mkdirSync(join(options.cwd,".codegraph"));writeFileSync(join(options.cwd,".codegraph","fixture-index"),"present");}
    return {stdout:"indexed",stderr:""};
  };
  const tool=createCodeGraphTool(runner);
  assert.equal(tool.name,"codegraph");
  assert.equal(tool.renderShell,"self");
  assert.equal(tool.promptSnippet,"Initialize and query CodeGraph for the current workspace without shell access");
  assert.deepEqual(tool.promptGuidelines,[
    "Use query or explore directly for read-only code research; they never initialize or modify the index.",
    "Use operation init or sync only when the user has explicitly requested indexing or refreshing the CodeGraph index. ASEN requests a one-run approval before either write.",
    "Use query for symbol search and explore for source plus call paths. Do not use this tool to run arbitrary commands or target another directory.",
  ]);
  assert.equal(tool.annotations?.readOnlyHint,false,"the unified tool includes an initialization operation that can write an index");
  assert.equal(tool.annotations?.destructiveHint,true,"the existing mutation warning remains attached to the unified tool");
  assert.deepEqual(tool.parameters,{
    type:"object",
    additionalProperties:false,
    required:["operation"],
    properties:{
      operation:{type:"string",enum:["init","sync","query","explore"]},
      query:{type:"string",minLength:1,maxLength:2000},
      limit:{type:"integer",minimum:1,maximum:20},
    },
  });
  const context={cwd:f.root};
  const query=await tool.execute("probe",{operation:"query",query:"--help",limit:4},undefined,undefined,context as any);
  const explore=await tool.execute("probe",{operation:"explore",query:"call path",limit:3},undefined,undefined,context as any);
  assert.equal(existsSync(join(f.root,".codegraph")),false,"queries must not initialize automatically");
  const init=await tool.execute("probe",{operation:"init"},undefined,undefined,{...context,hasUI:true,ui:{confirm:async()=>true}} as any);
  assert.equal(existsSync(join(f.root,".codegraph")),true,"explicit init may create only the fixture index");
  assert.deepEqual(calls.map(call=>call.args),[
    ["query","--limit","4","--","--help"],
    ["explore","--","call path"],
    ["init",f.root],
  ]);
  assert.ok(calls.every(call=>call.cwd===f.root&&call.maxBuffer>100000));
  assert.deepEqual(query.details,{status:"completed",operation:"query",cwd:f.root,args:calls[0]!.args});
  assert.equal((explore.details as {status:string}).status,"completed");
  assert.deepEqual(explore.content,[{type:"text",text:"indexed"}]);
  assert.equal((init.details as {status:string}).status,"completed");
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
    const blocked=await tool.execute("probe",{operation:"init"},undefined,undefined,{cwd:f.root} as any);
    assert.equal((blocked.details as {status:string}).status,"failed");
    assert.equal(calls,0);
  }
});

test("unified CodeGraph tool uses ASEN approval only for one-time initialization",async t=>{
  const f=fixture(t);assert.ok(f.canonical);
  let prompts=0,initializations=0;
  const runner:CodeGraphRunner=async(args,options)=>{
    if(args[0]==="init"){initializations++;mkdirSync(join(options.cwd,".codegraph"));writeFileSync(join(options.cwd,".codegraph","fixture-index"),"present");}
    return {stdout:"ok",stderr:""};
  };
  const tool=createCodeGraphTool(runner);
  const noUi=await call(tool,f.root,{operation:"init"});
  assert.equal(noUi.details.status,"authorization_required");assert.equal(initializations,0);
  const headless=await call(tool,f.root,{operation:"init"},undefined,{hasUI:false,ui:{confirm:async()=>{prompts++;return true;}}});
  assert.equal(headless.details.status,"authorization_required");assert.equal(initializations,0);
  const denied=await call(tool,f.root,{operation:"init"},undefined,{hasUI:true,ui:{confirm:async()=>{prompts++;return false;}}});
  assert.equal(denied.details.status,"denied");assert.equal(initializations,0);
  await call(tool,f.root,{operation:"query",query:"symbol"},undefined,{hasUI:true,ui:{confirm:async()=>{prompts++;return true;}}});
  assert.equal(prompts,1,"read-only queries must not request confirmation");
  const ui={confirm:async()=>{prompts++;return true;}};
  const approved=await call(tool,f.root,{operation:"init"},undefined,{hasUI:true,ui});
  assert.equal(approved.details.operation,"init");assert.equal(initializations,1);
  const duplicate=await call(tool,f.root,{operation:"init"},undefined,{hasUI:true,ui});
  assert.equal(duplicate.details.status,"already_initialized");assert.equal(initializations,1);assert.equal(prompts,2);
  const other=createCodeGraphTool(async()=>{initializations++;return {stdout:"unexpected",stderr:""};});
  const existing=await call(other,f.root,{operation:"init"},undefined,{hasUI:true,ui});
  assert.equal(existing.details.status,"already_initialized");assert.equal(initializations,1,"an existing index must not be initialized again");
  assert.equal(tool.annotations?.readOnlyHint,false);assert.equal(tool.annotations?.destructiveHint,true);
});

test("CodeGraph requires fresh approval after an externally deleted index",async t=>{
  const f=fixture(t);
  let approvals=0,initializations=0;
  const tool=createCodeGraphTool(async(args,options)=>{
    if(args[0]==="init"){initializations++;mkdirSync(join(options.cwd,".codegraph"));writeFileSync(join(options.cwd,".codegraph","fixture-index"),"present");}
    return {stdout:"indexed",stderr:""};
  });
  const context={hasUI:true,ui:{confirm:async()=>{approvals++;return true;}}};
  assert.equal((await call(tool,f.root,{operation:"init"},undefined,context)).details.status,"completed");
  rmSync(join(f.root,".codegraph"),{recursive:true});
  const withoutApproval=await call(tool,f.root,{operation:"init"});
  assert.equal(withoutApproval.details.status,"authorization_required");
  assert.equal(initializations,1);
  assert.equal((await call(tool,f.root,{operation:"init"},undefined,context)).details.status,"completed");
  assert.equal(initializations,2);
  assert.equal(approvals,2);
});

test("CodeGraph rechecks the index path after Pi authorization",async t=>{
  const f=fixture(t);let calls=0;const outside=join(f.root,"outside");mkdirSync(outside);
  const tool=createCodeGraphTool(async()=>{calls++;return {stdout:"unexpected",stderr:""};});
  const result=await call(tool,f.root,{operation:"init"},undefined,{hasUI:true,ui:{confirm:async()=>{symlinkSync(outside,join(f.root,".codegraph"),"junction");return true;}}});
  assert.equal(result.details.status,"failed");assert.equal(calls,0,"the index path is validated again after the user prompt");
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

test("CodeGraph rejects unsafe Windows npm package entries",t=>{
  const f=fixture(t);
  const pkg=join(f.root,"node_modules","@colbymchenry","codegraph");
  mkdirSync(pkg,{recursive:true});
  writeFileSync(join(pkg,"package.json"),JSON.stringify({bin:{codegraph:"../../../../outside.mjs"}}));
  assert.throws(()=>resolveCodeGraphEntry(pkg),/Invalid package entry/);
  writeFileSync(join(pkg,"package.json"),JSON.stringify({bin:{codegraph:"bin/codegraph.mjs"}}));
  mkdirSync(join(pkg,"bin"));
  writeFileSync(join(pkg,"bin","codegraph.mjs"),"");
  assert.equal(resolveCodeGraphEntry(pkg),realpathSync.native(join(pkg,"bin","codegraph.mjs")));
});

test("canonical CodeGraph fails closed on invalid input and project roots",async t=>{
  const f=fixture(t);
  let launches=0;
  const tool=createCodeGraphTool(async()=>{launches++;return {stdout:"unexpected",stderr:""};});
  assert.equal((await call(tool,f.root,{operation:"query",query:""})).details.status,"failed");
  assert.equal((await call(tool,join(f.root,"child"),{operation:"query",query:"symbol"})).details.status,"failed");
  assert.equal(launches,0);
});

test("canonical CodeGraph classifies an aborted running query as cancelled",async t=>{
  const f=fixture(t);
  const controller=new AbortController();
  const tool=createCodeGraphTool(async(_args,options)=>{
    assert.equal(options.signal,controller.signal);
    controller.abort();
    throw Object.assign(new Error("aborted"),{name:"AbortError",code:"ABORT_ERR"});
  });
  const result=await call(tool,f.root,{operation:"query",query:"symbol"},controller.signal);
  assert.equal(result.details.status,"cancelled");
  assert.equal(existsSync(join(f.root,".codegraph")),false);
});

test("CodeGraph real subprocess fixture survives restart and keeps index read-only on queries",async t=>{
  const f=fixture(t,`import {existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {join} from "node:path";
const args=process.argv.slice(2);
const index=join(process.cwd(),".codegraph");
if(args[0]==="init"){mkdirSync(index);writeFileSync(join(index,"snapshot"),"ready");console.log("indexed");}
else if(!existsSync(join(index,"snapshot"))){process.stderr.write("index unavailable");process.exitCode=2;}
else console.log(JSON.stringify({operation:args[0],query:args.at(-1),snapshot:readFileSync(join(index,"snapshot"),"utf8")}));
`);
  const first=createCodeGraphTool(async(args,options)=>{
    const {execFile}=await import("node:child_process");
    const {promisify}=await import("node:util");
    const observed=await promisify(execFile)(process.execPath,[f.script,...args],{cwd:options.cwd,signal:options.signal,timeout:5000,maxBuffer:options.maxBuffer});
    return {stdout:String(observed.stdout),stderr:String(observed.stderr)};
  });
  const ui={hasUI:true,ui:{confirm:async()=>true}};
  const missing=await call(first,f.root,{operation:"query",query:"symbol"});
  assert.equal(missing.details.status,"failed");
  assert.equal(existsSync(join(f.root,".codegraph")),false);
  const init=await call(first,f.root,{operation:"init"},undefined,ui);
  assert.equal((init.details as {status:string}).status,"completed");
  const query=await call(first,f.root,{operation:"query",query:"symbol"});
  assert.equal(query.details.status,"completed");
  assert.equal(JSON.parse(textOf(query.content[0])).snapshot,"ready");
  const restarted=createCodeGraphTool(async(args,options)=>{
    const {execFile}=await import("node:child_process");
    const {promisify}=await import("node:util");
    const observed=await promisify(execFile)(process.execPath,[f.script,...args],{cwd:options.cwd,timeout:5000,maxBuffer:options.maxBuffer});
    return {stdout:String(observed.stdout),stderr:String(observed.stderr)};
  });
  assert.equal((await call(restarted,f.root,{operation:"init"})).details.status,"already_initialized");
  assert.equal((await call(restarted,f.root,{operation:"explore",query:"symbol"})).details.status,"completed");
});

test("ASEN/Pi registered CodeGraph cancels an actual running subprocess",async t=>{
  const f=fixture(t,`setTimeout(()=>console.log("should not finish"),10000);`);
  const controller=new AbortController();
  const registered=f.canonical;
  assert.ok(registered,"ASEN must register the canonical Pi tool");
  const running=call(registered,f.root,{operation:"query",query:"symbol"},controller.signal);
  // Give the spawned Node subprocess time to start before interrupting it.
  await new Promise(resolve=>setTimeout(resolve,300));
  controller.abort();
  const result=await running;
  assert.equal(result.details.status,"cancelled");
  assert.equal(existsSync(join(f.root,".codegraph")),false);
  // Windows can retain a cwd handle briefly after an aborted child exits.
  // Wait for the OS to release it before fixture teardown, without masking failures.
  if(process.platform==="win32"){
    const {renameSync}=await import("node:fs");
    // Renaming a file inside the directory does not prove the child released its cwd.
    // Rename the directory itself; only then can fixture teardown remove it safely.
    const renamed=f.root+"-release-check";
    let released=false;
    for(let attempt=0;attempt<80;attempt++){
      try{
        renameSync(f.root,renamed);
        renameSync(renamed,f.root);
        released=true;
        break;
      }catch(error){
        if((error as NodeJS.ErrnoException).code!=="EBUSY"&&(error as NodeJS.ErrnoException).code!=="EPERM")throw error;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
    }
    assert.ok(released,"Windows must release the cancelled subprocess cwd before teardown");
  }
});

test("ASEN/Pi registered CodeGraph preserves authorization and query lifecycle across restart",async t=>{
  const f=fixture(t,`import {existsSync,mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {join} from "node:path";
const index=join(process.cwd(),".codegraph");
if(process.argv[2]==="init"){mkdirSync(index,{recursive:true});writeFileSync(join(index,"symbol"),"realSymbol");console.log("indexed");}
else if(!existsSync(join(index,"symbol"))){console.error("missing index");process.exitCode=2;}
else console.log(readFileSync(join(index,"symbol"),"utf8"));
`);
  const first=f.canonical;
  assert.equal((await call(first,f.root,{operation:"init"})).details.status,"authorization_required");
  const approved=await call(first,f.root,{operation:"init"},undefined,{hasUI:true,ui:{confirm:async()=>true}});
  assert.equal(approved.details.status,"completed");
  const searched=await call(first,f.root,{operation:"query",query:"realSymbol"});
  assert.equal(searched.details.status,"completed");
  assert.match(textOf(searched.content[0]),/realSymbol/);
  const restarted=createCodeGraphTool(async(args,options)=>{
    const {execFile}=await import("node:child_process");
    const {promisify}=await import("node:util");
    const output=await promisify(execFile)(process.execPath,[f.script,...args],{cwd:options.cwd,signal:options.signal,maxBuffer:options.maxBuffer,timeout:5000});
    return {stdout:String(output.stdout),stderr:String(output.stderr)};
  });
  assert.equal((await call(restarted,f.root,{operation:"init"})).details.status,"already_initialized");
  const again=await call(restarted,f.root,{operation:"query",query:"realSymbol"});
  assert.match(textOf(again.content[0]),/realSymbol/);
});

test("canonical registration and ASEN integration expose only one CodeGraph tool",t=>{
  const direct:any[]=[];
  registerCodeGraphTool({registerTool:(tool:any)=>direct.push(tool)} as any);
  assert.deepEqual(direct.map(tool=>tool.name),["codegraph"]);

  const f=fixture(t);
  const tools=new Map<string,any>();
  createAsenExtension({codeIntelligence:{executable:process.execPath,script:f.script}})({
    registerCommand(){},
    registerTool(tool:any){tools.set(tool.name,tool);},
  } as any);
  assert.deepEqual([...tools.keys()], ["asen_ask_choice", "asen_ask_question", "ask_user_choice", "ask_user_question", "codegraph", "asen_background_start", "asen_background_status", "asen_background_stop", "asen_session_consult", "asen_plan_request"]);
  assert.equal(tools.get("codegraph").annotations.readOnlyHint,false);
  assert.equal(tools.get("codegraph").annotations.destructiveHint,true);
  assert.deepEqual(f.registered.filter(name=>name.includes("code")),["codegraph"],"Pi must expose exactly one CodeGraph tool");
  assert.equal(f.tool.name,"asen_code_intelligence","the read-only adapter remains constructible for internal compatibility");
});

test("canonical CodeGraph sync requires fresh authorization and existing index",async t=>{
  const f=fixture(t);
  const calls:string[][]=[];
  const runner:CodeGraphRunner=async args=>{calls.push([...args]);return {stdout:"ok",stderr:""};};
  const tool=createCodeGraphTool(runner);
  const approvals:string[]=[];
  const ui={confirm:async(title:string)=>{approvals.push(title);return true;}};
  assert.equal((await call(tool,f.root,{operation:"sync"},undefined,{hasUI:true,ui})).details.status,"not_initialized");
  assert.equal(calls.length,0);
  mkdirSync(join(f.root,".codegraph"));writeFileSync(join(f.root,".codegraph","fixture-index"),"present");
  assert.equal((await call(tool,f.root,{operation:"sync"})).details.status,"authorization_required");
  assert.equal(calls.length,0);
  const denied=await call(tool,f.root,{operation:"sync"},undefined,{hasUI:true,ui:{confirm:async()=>false}});
  assert.equal(denied.details.status,"denied");
  assert.equal(calls.length,0);
  const approved=await call(tool,f.root,{operation:"sync"},undefined,{hasUI:true,ui});
  assert.equal(approved.details.status,"completed");
  assert.deepEqual(calls,[["sync"]]);
  assert.equal(approvals.length,1);
  const repeat=await call(tool,f.root,{operation:"sync"},undefined,{hasUI:true,ui});
  assert.equal(repeat.details.status,"completed");
  assert.equal(approvals.length,2,"each synchronization must request fresh approval");
  assert.deepEqual(calls,[["sync"],["sync"]]);
});


test("T07 init fails closed when the index becomes a symlink during approval",async t=>{
  const f=fixture(t);
  const outside=join(f.root,"outside-index");mkdirSync(outside);
  let launches=0;
  const tool=createCodeGraphTool(async()=>{launches++;return {stdout:"unexpected",stderr:""};});
  const result=await call(tool,f.root,{operation:"init"},undefined,{hasUI:true,ui:{confirm:async()=>{
    symlinkSync(outside,join(f.root,".codegraph"),"junction");
    return true;
  }}});
  assert.equal(result.details.status,"failed");
  assert.equal(launches,0);
});

test("T07 reports an index race as failed instead of rejecting the tool call",async t=>{
  const f=fixture(t);
  const outside=join(f.root,"outside-index");mkdirSync(outside);
  let release!:(value:{stdout:string;stderr:string})=>void;
  let launches=0;
  const tool=createCodeGraphTool(async()=>{
    launches++;
    return new Promise(resolve=>{release=resolve;});
  });
  const ui={hasUI:true,ui:{confirm:async()=>true}};
  const first=call(tool,f.root,{operation:"init"},undefined,ui);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(launches,1);
  const second=call(tool,f.root,{operation:"init"},undefined,ui);
  await new Promise(resolve=>setImmediate(resolve));
  symlinkSync(outside,join(f.root,".codegraph"),"junction");
  release({stdout:"first completed",stderr:""});
  assert.equal((await first).details.status,"completed");
  assert.equal((await second).details.status,"failed");
  assert.equal(launches,1,"an unsafe index must never trigger a second subprocess");
});

test("T07 init tolerates an index deleted during a previous in-flight initialization",async t=>{
  const f=fixture(t);
  let launches=0;
  const tool=createCodeGraphTool(async(args,options)=>{
    launches++;
    if(args[0]==="init"){
      mkdirSync(join(options.cwd,".codegraph"),{recursive:true});
      writeFileSync(join(options.cwd,".codegraph","marker"),"ready");
    }
    return {stdout:"ok",stderr:""};
  });
  const ui={hasUI:true,ui:{confirm:async()=>true}};
  assert.equal((await call(tool,f.root,{operation:"init"},undefined,ui)).details.status,"completed");
  rmSync(join(f.root,".codegraph"),{recursive:true,force:true});
  assert.equal((await call(tool,f.root,{operation:"init"},undefined,ui)).details.status,"completed");
  assert.equal(launches,2);
});

test("T07 sync fails closed without launching when index disappears after approval",async t=>{
  const f=fixture(t);
  let launches=0;
  const tool=createCodeGraphTool(async()=>{launches++;return {stdout:"unexpected",stderr:""};});
  mkdirSync(join(f.root,".codegraph"));
  writeFileSync(join(f.root,".codegraph","marker"),"ready");
  const result=await call(tool,f.root,{operation:"sync"},undefined,{hasUI:true,ui:{confirm:async()=>{
    rmSync(join(f.root,".codegraph"),{recursive:true,force:true});
    return true;
  }}});
  assert.equal(result.details.status,"failed");
  assert.equal(launches,0);
});
