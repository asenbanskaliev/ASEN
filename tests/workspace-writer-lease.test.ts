import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {execFileSync} from "node:child_process";
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {acquireWorkspaceWriter} from "../src/runtime/workspace-writer-lease.js";

test("exclusive workspace writer rejects concurrent owners, stale revisions and unauthorized paths",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-writer-lease-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","ASEN test");git("config","user.email","asen@example.invalid");
 writeFileSync(join(root,"target.txt"),"base\n");git("add","target.txt");git("commit","-qm","base");
 const head=git("rev-parse","HEAD"),args={root,expectedHead:head,authorizationId:"fresh",allowedPaths:["target.txt"]};
 assert.throws(()=>acquireWorkspaceWriter({...args,allowedPaths:["../outside"]}),/Invalid/u);
 const first=acquireWorkspaceWriter(args);
 assert.throws(()=>acquireWorkspaceWriter({...args,authorizationId:"other"}),/conflict/u);
 assert.throws(()=>acquireWorkspaceWriter({...args,authorizationId:"different-file",allowedPaths:["elsewhere.txt"]}),/conflict/u);
 first.verify();first.release();
 const second=acquireWorkspaceWriter({...args,authorizationId:"other"});second.release();
 writeFileSync(join(root,"target.txt"),"next\n");git("add","target.txt");git("commit","-qm","next");
 assert.throws(()=>acquireWorkspaceWriter(args),/Stale/u);
});

test("writer lease is exclusive across independent Node processes and releases cleanly",async t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-writer-process-race-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","ASEN test");git("config","user.email","asen@example.invalid");writeFileSync(join(root,"target.txt"),"base\n");git("add","target.txt");git("commit","-qm","base");
 const head=git("rev-parse","HEAD"),moduleUrl=pathToFileURL(join(process.cwd(),"src/runtime/workspace-writer-lease.ts")).href;
 const script=`import {acquireWorkspaceWriter} from ${JSON.stringify(moduleUrl)};const lease=acquireWorkspaceWriter({root:process.env.ASEN_TEST_ROOT,expectedHead:process.env.ASEN_TEST_HEAD,authorizationId:"process-owner",allowedPaths:["target.txt"]});console.log("LOCKED");process.stdin.once("data",()=>{lease.release();process.exit(0)});`;
 const child=spawn(process.execPath,["--import","tsx","--input-type=module","-e",script],{cwd:process.cwd(),env:{...process.env,ASEN_TEST_ROOT:root,ASEN_TEST_HEAD:head},stdio:["pipe","pipe","pipe"]});
 let stderr="";child.stderr.setEncoding("utf8").on("data",chunk=>stderr+=chunk);
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("writer child did not acquire its lease")),5000);child.stdout.setEncoding("utf8").once("data",line=>{clearTimeout(timer);line.includes("LOCKED")?resolve():reject(new Error(stderr||"writer child failed"));});child.once("error",reject);child.once("close",code=>{if(code!==0)reject(new Error(stderr||`writer child exited ${code}`));});});
 assert.throws(()=>acquireWorkspaceWriter({root,expectedHead:head,authorizationId:"contender",allowedPaths:["target.txt"]}),/conflict/u);
 child.stdin.end("release");await new Promise<void>((resolve,reject)=>{child.once("close",code=>code===0?resolve():reject(new Error(stderr||`writer child exited ${code}`)));});
 const after=acquireWorkspaceWriter({root,expectedHead:head,authorizationId:"after-release",allowedPaths:["target.txt"]});after.release();
});

test("a process death releases an orphaned lease only after its recorded owner is gone",async t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-writer-orphan-process-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","ASEN test");git("config","user.email","asen@example.invalid");writeFileSync(join(root,"target.txt"),"base\n");git("add","target.txt");git("commit","-qm","base");
 const head=git("rev-parse","HEAD"),moduleUrl=pathToFileURL(join(process.cwd(),"src/runtime/workspace-writer-lease.ts")).href;
 const script=`import {acquireWorkspaceWriter} from ${JSON.stringify(moduleUrl)};acquireWorkspaceWriter({root:process.env.ASEN_TEST_ROOT,expectedHead:process.env.ASEN_TEST_HEAD,authorizationId:"doomed",allowedPaths:["target.txt"]});console.log("LOCKED");setInterval(()=>{},1000);`;
 const child=spawn(process.execPath,["--import","tsx","--input-type=module","-e",script],{cwd:process.cwd(),env:{...process.env,ASEN_TEST_ROOT:root,ASEN_TEST_HEAD:head},stdio:["ignore","pipe","pipe"]});
 let stderr="";child.stderr.setEncoding("utf8").on("data",chunk=>stderr+=chunk);
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("writer child did not acquire its lease")),5000);child.stdout.setEncoding("utf8").once("data",line=>{clearTimeout(timer);line.includes("LOCKED")?resolve():reject(new Error(stderr||"writer child failed"));});child.once("error",reject);});
 child.kill("SIGKILL");await new Promise<void>(resolve=>child.once("close",()=>resolve()));
 const recovered=acquireWorkspaceWriter({root,expectedHead:head,authorizationId:"fresh-after-death",allowedPaths:["target.txt"]});recovered.release();
});

test("writer verification preserves and rejects a modification outside the granted file",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-writer-outside-scope-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","ASEN test");git("config","user.email","asen@example.invalid");writeFileSync(join(root,"target.txt"),"base\n");git("add","target.txt");git("commit","-qm","base");
 const lease=acquireWorkspaceWriter({root,expectedHead:git("rev-parse","HEAD"),authorizationId:"scoped",allowedPaths:["target.txt"]});
 writeFileSync(join(root,"outside.txt"),"preserve me\n");
 assert.throws(()=>lease.verify(),/unauthorized path: outside.txt/u);
 assert.equal(readFileSync(join(root,"outside.txt"),"utf8"),"preserve me\n");lease.release();
});
