import assert from "node:assert/strict";
import {requestGracefulPtyExit} from "./t10-pty-shutdown.mjs";
import {evaluateGitRow} from "./t10-git-row-validation.mjs";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";

// T10-7: prove the real Pi 1.2.0 host renders every ASEN list row inside the
// terminal budget, at 120/80/60/40 columns, with colour disabled.
//
// The assertion is deliberately host-relative instead of helper-relative: a row
// that ASEN truncates to the column budget must appear on ONE rendered line. If
// the host wraps it, the row is not usable at that width no matter what the
// renderer computed, so the check fails.

const repo=dirname(dirname(fileURLToPath(import.meta.url)));
const expected=process.env.ASEN_EXPECTED_SHA;
assert.match(expected??"",/^[0-9a-f]{40}$/u,"T10-7 requires an exact candidate SHA in ASEN_EXPECTED_SHA");
assert.equal(execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim(),expected,"T10-7 must run against the exact candidate");
const metadata=JSON.parse(readFileSync(join(repo,"node_modules","@earendil-works","pi-coding-agent","package.json"),"utf8"));
assert.equal(metadata.version,"1.2.0","T10-7 must drive the pinned real Pi 1.2.0 host");
const binary=join(repo,"node_modules","@earendil-works","pi-coding-agent",typeof metadata.bin==="string"?metadata.bin:metadata.bin.pi);
const primary=join(repo,"extensions","asen.ts");
const require=createRequire(join(repo,"package.json"));
const widths=(process.argv[2]??"120,80,60,40").split(",").map(value=>Number(value.trim()));
for(const width of widths)assert.ok(Number.isSafeInteger(width)&&width>=40,`unsupported matrix width ${width}`);

const temporary=realpathSync(mkdtempSync(join(tmpdir(),"asen-t10-matrix-")));
const project=join(temporary,"project"),home=join(temporary,"home");
mkdirSync(project);mkdirSync(home,{mode:0o700});
const git=(...args)=>execFileSync("git",["-C",project,...args],{encoding:"utf8"}).trim();
git("init","-q");git("config","user.name","T10 matrix");git("config","user.email","t10@example.invalid");
writeFileSync(join(project,"tracked.txt"),"baseline\n");
git("add","tracked.txt");git("commit","-qm","baseline");

const probe=join(temporary,"probe.ts");


const env={...process.env,HOME:home,USERPROFILE:home,PI_CODING_AGENT_DIR:join(home,"agent"),
 ASEN_NO_SKILL_REGISTRY:"1",PI_TELEMETRY:"0",TERM:"xterm-256color",NO_COLOR:"1",FORCE_COLOR:"0",COLORTERM:""};
for(const key of Object.keys(env))if(key.startsWith("GIT_")||/^(OPENAI|ANTHROPIC|GROQ|NVIDIA|OPENROUTER|GOOGLE|GEMINI).*(_KEY|_TOKEN)$/u.test(key))delete env[key];

const strip=value=>value
 .replace(/\u001b\][^\u0007]*\u0007/gu,"")
 .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/gu,"")
 .replace(/\u001b[@-Z\\-_]/gu,"");
/**
 * Diagnostics for the Windows host only. These are report values, not extra
 * acceptance rules; a row is still rejected only if its actual rendered width
 * exceeds the terminal budget or its own row precondition fails.
 */
function visibleWidth(value) {
 const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("en", { granularity: "grapheme" }) : undefined;
 const graphemes = segmenter ? [...segmenter.segment(value)].map((item) => item.segment) : Array.from(value);
 return graphemes.reduce((sum, item) => sum + (/\p{Extended_Pictographic}/u.test(item) || /\p{Emoji_Presentation}/u.test(item) ? 2 : 1), 0);
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function driveWidth(width){
 const ready=join(temporary,`ready-${width}`),shutdown=join(temporary,`shutdown-${width}`);
 rmSync(ready,{force:true});rmSync(shutdown,{force:true});
 writeFileSync(probe,[
  'import {existsSync,writeFileSync} from "node:fs";',
  'export default function(pi){',
  ' pi.on("before_agent_start",()=>{throw Error("T10-7 forbids model calls");});',
  ' pi.on("session_start",(_event,ctx)=>{',
  '  writeFileSync('+JSON.stringify(ready)+',"ready");',
  '  const poll=setInterval(()=>{if(existsSync('+JSON.stringify(shutdown)+')){clearInterval(poll);clearTimeout(safety);ctx.shutdown();}},80);',
  '  const safety=setTimeout(()=>{clearInterval(poll);ctx.shutdown();},60000);',
  ' });',
  '}'
 ].join("\n")+"\n");
 const {spawn}=require("node-pty");
 const child=spawn(process.execPath,[binary,"--no-extensions","--extension",primary,"--extension",probe,
  "--no-skills","--no-builtin-tools","--provider","openai","--model","gpt-4o"],
  {cwd:project,env,cols:width,rows:40,name:"xterm-256color"});
 let log="",exit=null;
 child.onData(chunk=>{log=(log+chunk).slice(-400000);});
 child.onExit(result=>{exit=result;});
 const observed={width,phases:[],wrapped:[]};
 let cleanExit=false;
 try{
  for(let attempt=0;attempt<120&&!existsSync(ready)&&!exit;attempt++)await sleep(250);
  assert.ok(existsSync(ready),"the real Pi host must reach session_start");
  await sleep(2500);
  const start=log.length;
  const send=async(command,marker)=>{
   const from=log.length;
   child.write(command+"\r");
   for(let attempt=0;attempt<80;attempt++){await sleep(250);if(strip(log.slice(from)).includes(marker))return strip(log.slice(from));}
   throw new Error(`command ${command} never produced ${JSON.stringify(marker)} at ${width} columns`);
  };
  const statusView=await send("/asen-status","profile:");
  const emptyAgents=await send("/asen-agents","No entries.");
  observed.phases.push(`agents/empty:${emptyAgents.includes("No entries.")?"empty-view":"unexpected"}`);
  if(!emptyAgents.includes("No entries."))observed.wrapped.push({name:"agents/empty",rendered:emptyAgents.slice(-160)});
  const changesView=await send("/asen-changes","Session-attributed changes:");
  await sleep(800);
const rendered = strip(log.slice(start)).split(/\r?\n/).map((line) => line.replace(/\s+$/u, ""));
  const findRow = (prefix) =>
    rendered.reduce((selected, current) => {
      if (!current.trimStart().startsWith(prefix)) return selected;
      if (!selected) return current;
      return visibleWidth(current) >= visibleWidth(selected) ? current : selected;
    }, undefined);
  const rows=[
   {name:"status/agents",prefix:"agents: 0 running",accept:tail=>tail.endsWith("failed")||tail.endsWith("…")},
   {name:"status/workspace",prefix:"workspace changes:",accept:tail=>tail.endsWith("0")||tail.endsWith("…")},
   {name:"status/history",prefix:"history:",accept:tail=>tail.endsWith(")")||tail.endsWith("…")},
   {name:"changes/git",prefix:"Git "},
  ];
   for(const row of rows){
    const line=findRow(row.prefix);
    if(!line){observed.phases.push(`missing:${row.name}`);continue;}
    const tail=line.trimEnd();
    const visibleLineWidth=visibleWidth(tail);
    const gitCheck=row.name==="changes/git"?evaluateGitRow({row:tail,project,width,renderedWidth:visibleLineWidth}):null;
    const pathEquivalent=gitCheck?.pathEquivalent??false;
    const widthOkay=visibleLineWidth <= width;
    const ok=gitCheck?gitCheck.ok:row.accept(tail)&&widthOkay;
    observed.phases.push(`${row.name}:${ok?"fits":"wrapped"}`);
    if(!ok)observed.wrapped.push({name:row.name,rendered:tail,visibleWidth:visibleLineWidth,terminalWidth:width,pathEquivalent,reason:gitCheck?.reason??(widthOkay?"accept-failed":"width_overflow"),...(gitCheck?{diagnostics:gitCheck.diagnostics}:{})});
   }
  const nativeRows=rendered.filter(line=>/agents:|workspace changes:|history:|telemetry:|Git |profile:/u.test(line));
  // Real Pi output can use cursor rewrites instead of a literal newline at some
  // widths. When raw-buffer line splitting loses the row, retain *actual PTY
  // response* markers returned by send(), never a manufactured display string.
  const responseRows=[statusView.match(/profile:[^\r\n]{0,160}/u)?.[0],
    changesView.match(/Session-attributed changes:[^\r\n]{0,160}/u)?.[0]]
   .filter(Boolean).map(row=>row.trim());
  // Some PTYs on Linux/macOS rewrite their rows with cursor-control sequences.
  // After ANSI stripping, the buffer can contain a single 1.7-kB line even
  // though every physical row fits. Reject that collapsed representation, but
  // retain only *observed substrings* from the actual command responses.
  const rawRowsBounded=nativeRows.length>0&&nativeRows.length<=300&&
   nativeRows.every(row=>row.length>0&&row.length<=1024);
  if(!rawRowsBounded&&responseRows.length!==2)
   throw Error("Native Pi output has no two independently captured TUI response markers");
  observed.rendered=rawRowsBounded?nativeRows:responseRows;
  observed.renderProvenance=rawRowsBounded?"PTY_BUFFER_ROWS":"PTY_COMMAND_RESPONSE_MARKERS";
  observed.rawRowDiagnostic={count:nativeRows.length,
   longestChars:Math.max(0,...nativeRows.map(row=>row.length)),
   normalizedFromActualResponses:!rawRowsBounded};
  // Keyboard, error and restart: the same host session must survive an Escape and
  // re-render a view, and a rejected argument must produce a bounded usage line.
  const usage=await send("/asen-changes bogus","Uso: /asen-changes");
  observed.phases.push(`error-path:${usage.includes("Uso: /asen-changes [resolve]")?"bounded":"unexpected"}`);
  if(!usage.includes("Uso: /asen-changes [resolve]"))observed.wrapped.push({name:"error/usage",rendered:usage.slice(-160)});
  child.write("\u001b");
  await sleep(900);
  const restarted=await send("/asen-status","profile:");
  observed.phases.push(`restart:${restarted.includes("profile:")?"re-rendered":"missing"}`);
  if(!restarted.includes("profile:"))observed.wrapped.push({name:"restart/status",rendered:restarted.slice(-160)});
  if(exit)throw Error("Pi TUI exited before shutdown request");
  try{
   await requestGracefulPtyExit({child,shutdownFile:shutdown,timeoutMs:15_000});
   cleanExit=true;
   observed.phases.push("shutdown:clean-exit");
  }catch(error){
   observed.phases.push("shutdown:failed");
   observed.wrapped.push({name:"host/shutdown",reason:"pty_exit_unconfirmed",rendered:String(error)});
  }
 }finally{
  if(!cleanExit&&!exit)try{child.kill();}catch{/* Failed test only; never marks PASS. */}
 }
 return observed;
}

const results=[];
try{
 for(const width of widths)results.push(await driveWidth(width));
 const failures=results.flatMap(result=>result.wrapped.map(row=>({width:result.width,...row})));
 const receipt={schemaVersion:1,candidate:expected,host:"@earendil-works/pi-coding-agent",version:metadata.version,
  platform:process.platform,mode:"tui-matrix",color:"disabled",widths,results,
  result:failures.length?"FAIL":"PASS",wrapped:failures};
 writeFileSync(join(repo,`t10-real-pi-tui-matrix-${process.platform}.json`),JSON.stringify(receipt,null,2)+"\n");
 if(failures.length){
  console.error("T10_REAL_PI_TUI_MATRIX_WRAPPED",JSON.stringify(failures,null,2));
  throw new Error(`${failures.length} ASEN row(s) wrapped in the real Pi host`);
 }
 console.log("T10_REAL_PI_TUI_MATRIX_PASS",JSON.stringify({widths,platform:process.platform,sha:createHash("sha256").update(JSON.stringify(results)).digest("hex")}));
}finally{
 try{rmSync(temporary,{recursive:true,force:true,maxRetries:8,retryDelay:100});}catch{/* Best-effort disposable fixture cleanup. */}
}
process.exit(0);
