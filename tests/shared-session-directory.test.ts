import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync,readdirSync,readFileSync,rmSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {SharedSessionDirectory} from "../src/runtime/shared-session-directory.js";

const entry=(id:string,projectId="project-a")=>({sessionId:id,subject:"Pi test session",projectId,classification:"read" as const,updatedAt:new Date().toISOString()});
test("shared session metadata remains project-bound with local one-use consent",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-shared-sessions-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const a=new SharedSessionDirectory(join(root,"private")),b=new SharedSessionDirectory(join(root,"private"));
 a.publish(entry("target"));
 assert.deepEqual(b.list("project-b"),[]);
 assert.deepEqual(b.list("project-a").map(r=>r.sessionId),["target"]);
 assert.throws(()=>b.consult("forged","requester","target","project-a"),/valid unused consent/);
 const grant=b.issueConsent({requesterSessionId:"requester",targetSessionId:"target",projectId:"project-a"});
 assert.equal(b.consult(grant.token,"requester","target","project-a").subject,"Pi test session");
 assert.throws(()=>b.consult(grant.token,"requester","target","project-a"),/valid unused consent/);
 a.remove("target");assert.deepEqual(b.list("project-a"),[]);
});
test("a shared record from another project cannot displace an owned session identity",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-shared-project-collision-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const local=new SharedSessionDirectory(join(root,"private")),other=new SharedSessionDirectory(join(root,"private"));
 local.publish(entry("same","project-a"));other.publish(entry("same","project-b"));
 assert.deepEqual(local.list("project-b"),[]);
 assert.deepEqual(local.list("project-a").map(row=>row.sessionId),["same"]);
 local.remove("same");other.remove("same");
});
test("a second Pi host in the same process may recover a session without the previous host deleting the new record",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-local-session-recovery-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const path=join(root,"private"),first=new SharedSessionDirectory(path),restarted=new SharedSessionDirectory(path);
 first.publish(entry("recover"));
 restarted.publish({...entry("recover"),subject:"Recovered Pi host"});
 first.remove("recover");
 assert.equal(restarted.list("project-a")[0]?.subject,"Recovered Pi host");
 restarted.remove("recover");assert.deepEqual(restarted.list("project-a"),[]);
});
test("a racing Pi process cannot overwrite an atomically claimed session identity",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-session-claim-race-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const directory=join(root,"private"),first=new SharedSessionDirectory(directory),second=new SharedSessionDirectory(directory);
 assert.throws(()=>first.publish({...entry("raced"),subject:"first"},{beforePublish:()=>second.publish({...entry("raced"),subject:"second"})}),/concurrently claimed/);
 assert.equal(second.list("project-a").find(row=>row.sessionId==="raced")?.subject,"second");
 first.remove("raced");
 assert.equal(second.list("project-a").find(row=>row.sessionId==="raced")?.subject,"second");
 second.remove("raced");
 assert.deepEqual(first.list("project-a"),[]);
});
test("a concurrent replacement of an existing record fails closed before overwriting the winner",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-session-replace-race-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const directory=join(root,"private"),first=new SharedSessionDirectory(directory),second=new SharedSessionDirectory(directory);
 first.publish(entry("recover"));
 // Both contenders observe the old record, but only the second may publish.
 assert.throws(()=>first.publish({...entry("recover"),subject:"loser"},{beforePublish:()=>second.publish({...entry("recover"),subject:"winner"})}),/changed before replacement/);
 assert.equal(second.list("project-a")[0]?.subject,"winner");
 first.remove("recover");
 assert.equal(second.list("project-a")[0]?.subject,"winner");
 second.remove("recover");
});
test("a separate Node process can publish and withdraw only its own session metadata",async t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-session-cross-process-"));t.after(()=>rmSync(root,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 const directory=join(root,"private"),source=pathToFileURL(join(process.cwd(),"src/runtime/shared-session-directory.ts")).href;
 const childScript="import {SharedSessionDirectory} from "+JSON.stringify(source)+";"+
  "const d=new SharedSessionDirectory(process.env.ASEN_TEST_SESSION_DIR);"+
  "d.publish({sessionId:'child',subject:'Child Pi',projectId:'project-a',classification:'read',updatedAt:new Date().toISOString()});"+
  "process.stdout.write('PUBLISHED\\n');process.stdin.on('data',()=>{d.remove('child');process.exit(0)});";
 const child=spawn(process.execPath,["--import","tsx","--input-type=module","-e",childScript],{cwd:process.cwd(),env:{...process.env,ASEN_TEST_SESSION_DIR:directory},stdio:["pipe","pipe","pipe"]});
 let stderr="";child.stderr.setEncoding("utf8").on("data",chunk=>stderr+=chunk);
 t.after(()=>{if(child.exitCode===null)child.kill();});
 await new Promise<void>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error("Child shared-session writer did not start")),10000);
  child.stdout.setEncoding("utf8").once("data",msg=>{clearTimeout(timer);msg.includes("PUBLISHED")?resolve():reject(new Error(stderr||"Child did not publish"));});
  child.once("error",reject);child.once("close",code=>{if(code!==0)reject(new Error(stderr||"Child exited early"));});
 });
 const other=new SharedSessionDirectory(directory);
 assert.equal(other.list("project-a").find(r=>r.sessionId==="child")?.subject,"Child Pi");
 const grant=other.issueConsent({requesterSessionId:"parent",targetSessionId:"child",projectId:"project-a"});
 assert.equal(other.consult(grant.token,"parent","child","project-a").sessionId,"child");
 child.stdin.end("stop");
 await new Promise<void>((resolve,reject)=>child.once("close",code=>code===0?resolve():reject(new Error(stderr||"Child failed to exit"))));
 assert.deepEqual(other.list("project-a"),[]);
});
test("foreign symlink and unsafe record cannot become session metadata",t=>{
 if(process.platform==="win32"){t.skip("Symlink privilege depends on Windows runner");return;}
 const root=mkdtempSync(join(tmpdir(),"asen-session-link-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const directory=join(root,"directory"),a=new SharedSessionDirectory(directory);
 a.publish(entry("first"));
 const target=join(root,"symlink");symlinkSync(directory,target,"dir");
 assert.throws(()=>new SharedSessionDirectory(target),/private and canonical/);
 const record=join(directory,readdirSync(directory)[0]!);
 assert.match(readFileSync(record,"utf8"),/asen.shared-session-directory/);
});
