import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync,spawn} from "node:child_process";
import {access,mkdtemp,mkdir,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {executeEvidenceCommand,addExecutedEvidence} from "../src/evidence/execution.js";
import {EvidenceStore} from "../src/evidence/store.js";

test("execution proof requires the candidate's exact Git repository and HEAD",async t=>{
 const repo=await mkdtemp(join(tmpdir(),"asen-execution-"));t.after(()=>rm(repo,{recursive:true,force:true}));
 execFileSync("git",["init","-q",repo]);
 execFileSync("git",["-C",repo,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m","initial"]);
 const revision=execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const candidate={repository:repo,id:"candidate",revision,createdAt:"now"};
 const command=[process.execPath,"-e","process.exit(0)"] as const;
 const proof=await executeEvidenceCommand(candidate,command);
 assert.equal(proof.candidateRevision,revision);
 await assert.rejects(()=>executeEvidenceCommand({...candidate,revision:"another"},command),/revision mismatch/);
 await assert.rejects(()=>executeEvidenceCommand(candidate,command,{cwd:process.cwd()}),/repository mismatch/);
 const nested=join(repo,"nested");await mkdir(nested);
 await assert.rejects(()=>executeEvidenceCommand({...candidate,repository:nested},command,{cwd:nested}),/repository mismatch/);
 const advance=[process.execPath,"-e",`require("child_process").execFileSync("git",["-C",${JSON.stringify(repo)},"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m","advance"])`] as const;
 await assert.rejects(()=>executeEvidenceCommand(candidate,advance),/revision mismatch/);
 await assert.rejects(()=>executeEvidenceCommand(candidate,command),/revision mismatch/);
 const store=new EvidenceStore();
 assert.throws(()=>addExecutedEvidence(store,{...candidate,id:"other"},proof,{id:"fake",kind:"test",summary:"fake"}),/candidate mismatch/);
});
test("a failed executed command cannot be relabeled as a passing test",async t=>{
 const repo=await mkdtemp(join(tmpdir(),"asen-failed-execution-"));t.after(()=>rm(repo,{recursive:true,force:true}));
 execFileSync("git",["init","-q",repo]);
 execFileSync("git",["-C",repo,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m","initial"]);
 const revision=execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const candidate={repository:repo,id:"failed",revision,createdAt:"now"};
 const proof=await executeEvidenceCommand(candidate,[process.execPath,"-e","process.exit(1)"]);
 const store=new EvidenceStore();
 assert.throws(()=>store.addExecuted(candidate,proof,{id:"forged",kind:"test",status:"pass",summary:"forged",createdAt:"now"}),/exit code 0/);
 assert.equal(store.hasPassing(candidate,"test"),false);
});
test("execution rejects tracked changes before and during a command even when HEAD stays fixed",async t=>{
 const repo=await mkdtemp(join(tmpdir(),"asen-tracked-execution-"));t.after(()=>rm(repo,{recursive:true,force:true}));
 execFileSync("git",["init","-q",repo]);
 const source=join(repo,"source.js");await writeFile(source,"original\n");
 execFileSync("git",["-C",repo,"add","source.js"]);
 execFileSync("git",["-C",repo,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","-m","initial"]);
 const revision=execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const candidate={repository:repo,id:"tracked",revision,createdAt:"now"};
 await writeFile(source,"changed\n");
 await assert.rejects(()=>executeEvidenceCommand(candidate,[process.execPath,"-e","process.exit(0)"]),/unchanged tracked files/);
 await writeFile(source,"original\n");
 await assert.rejects(()=>executeEvidenceCommand(candidate,[process.execPath,"-e",`require("fs").writeFileSync(${JSON.stringify(source)},"changed\\n")`]),/unchanged tracked files/);
 assert.equal(execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim(),revision);
});

test("execution rejects an untracked candidate source file",async t=>{
 const repo=await mkdtemp(join(tmpdir(),"asen-untracked-execution-"));t.after(()=>rm(repo,{recursive:true,force:true}));
 execFileSync("git",["init","-q",repo]);
 const source=join(repo,"source.js");await writeFile(source,"original\n");
 execFileSync("git",["-C",repo,"add","source.js"]);
 execFileSync("git",["-C",repo,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","-m","initial"]);
 const revision=execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const candidate={repository:repo,id:"untracked",revision,createdAt:"now"};
 await writeFile(join(repo,"injected.js"),"throw new Error('injected')\n");
 await assert.rejects(()=>executeEvidenceCommand(candidate,[process.execPath,"-e","process.exit(0)"]),/no untracked Git files/);
});

test("execution timeout terminates spawned descendants",async t=>{
 const repo=await mkdtemp(join(tmpdir(),"asen-timeout-tree-"));t.after(()=>rm(repo,{recursive:true,force:true}));
 execFileSync("git",["init","-q",repo]);
 execFileSync("git",["-C",repo,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m","initial"]);
 const revision=execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const nonce=`${process.pid}-${Date.now()}`,ready=join(tmpdir(),`asen-timeout-ready-${nonce}.txt`),marker=join(tmpdir(),`asen-timeout-descendant-${nonce}.txt`);
 const probe=join(tmpdir(),`asen-timeout-probe-${nonce}.txt`),siblingMarker=join(tmpdir(),`asen-timeout-control-${nonce}.txt`);
 const observer=(readyPath:string,markerPath:string)=>`const fs=require("fs");fs.writeFileSync(${JSON.stringify(readyPath)},String(Date.now()));let written=false;const timer=setInterval(()=>{if(!written&&fs.existsSync(${JSON.stringify(probe)})){fs.writeFileSync(${JSON.stringify(markerPath)},"survived");written=true;}},25);`;
 const siblingReady=join(tmpdir(),`asen-timeout-sibling-${nonce}.txt`),sibling=spawn(process.execPath,["-e",observer(siblingReady,siblingMarker)],{stdio:"ignore"});
 t.after(async()=>{if(sibling.exitCode===null)sibling.kill("SIGKILL");for(const file of [ready,marker,siblingReady,probe,siblingMarker])await rm(file,{force:true});});
 let siblingStarted=false;for(let i=0;i<80&&!siblingStarted;i++){try{await access(siblingReady);siblingStarted=true;}catch{await new Promise(resolve=>setTimeout(resolve,25));}}
 assert.equal(siblingStarted,true,"independent sentinel did not start before the timeout");
 const descendant=observer(ready,marker)+"timer.unref();setTimeout(()=>{},10000)";
 // Keep the parent alive well beyond the unchanged 3-second evidence timeout.
 // Windows runners can delay timer delivery under the full parallel test load;
 // the process lifetime must not race the timeout being tested.
 const startupDelay=process.platform==="win32"?0:2100;
 const command=[process.execPath,"-e",`setTimeout(()=>{const child=require("child_process").spawn(process.execPath,["-e",${JSON.stringify(descendant)}],{stdio:"ignore",detached:process.platform==="win32"});child.unref();},${startupDelay});setTimeout(()=>{},30000)`] as const;
 const pending=executeEvidenceCommand({repository:repo,id:"timeout-tree",revision,createdAt:"now"},command,{timeoutMs:3000});
 const rejected=assert.rejects(pending,/timed out/);
 let settled=false;
 void pending.then(()=>{settled=true;},()=>{settled=true;});
 let started=false;
 for(;;){try{await access(ready);started=true;break;}catch{if(settled)break;await new Promise(resolve=>setTimeout(resolve,25));}}
 await rejected;
 assert.equal(started,true,"descendant did not start before execution settled");
 const descendantStarted=Number(await readFile(ready,"utf8"));
 assert.ok(Number.isFinite(descendantStarted)&&Date.now()>=descendantStarted,"valid descendant startup receipt required");
 // Probe only after timeout cleanup: both real processes would now publish a
 // marker if alive, regardless of how late their initial startup occurred.
 await writeFile(probe,"observe");
 assert.ok(Date.now()-descendantStarted+1500<10000,"probe must precede the descendant's natural exit");
 await new Promise(resolve=>setTimeout(resolve,1500));
 assert.ok(Date.now()-descendantStarted<10000,"observation must precede the descendant's natural exit");
 await access(siblingMarker);
 await assert.rejects(()=>access(marker),error=>(error as NodeJS.ErrnoException).code==="ENOENT");
 assert.equal(sibling.exitCode,null,"termination escaped the evidence command's process containment");
});

test("execution isolates transient command mutations from the authoritative candidate",async t=>{
 const repo=await mkdtemp(join(tmpdir(),"asen-transient-execution-"));t.after(()=>rm(repo,{recursive:true,force:true}));
 execFileSync("git",["init","-q",repo]);
 const source=join(repo,"source.js");await writeFile(source,"original\n");
 execFileSync("git",["-C",repo,"add","source.js"]);
 execFileSync("git",["-C",repo,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","-m","initial"]);
 const revision=execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const candidate={repository:repo,id:"transient",revision,createdAt:"now"};
 const transient=[process.execPath,"-e",`const fs=require("fs");const p=require("path").join(process.cwd(),"source.js");fs.writeFileSync(p,"mutated\\n");fs.readFileSync(p,"utf8");fs.writeFileSync(p,"original\\n")`] as const;
 const proof=await executeEvidenceCommand(candidate,transient);
 assert.equal(proof.exitCode,0);
 assert.notEqual(proof.cwd,repo);
 assert.equal(await (await import("node:fs/promises")).readFile(source,"utf8"),"original\n");
 assert.equal(execFileSync("git",["-C",repo,"status","--porcelain"],{encoding:"utf8"}).trim(),"");
});


test("execution rejects concurrent mutation of the isolated evidence checkout",async t=>{
 const repo=await mkdtemp(join(tmpdir(),"asen-concurrent-execution-"));t.after(()=>rm(repo,{recursive:true,force:true}));
 execFileSync("git",["init","-q",repo]);
 const source=join(repo,"source.js");await writeFile(source,"original\n");
 execFileSync("git",["-C",repo,"add","source.js"]);
 execFileSync("git",["-C",repo,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","-m","initial"]);
 const revision=execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const candidate={repository:repo,id:"concurrent",revision,createdAt:"now"};
 const mutate=[process.execPath,"-e",`const fs=require("fs");const p=require("path").join(process.cwd(),"source.js");setTimeout(()=>fs.writeFileSync(p,"concurrent\\n"),50);setTimeout(()=>process.exit(0),150)`] as const;
 await assert.rejects(()=>executeEvidenceCommand(candidate,mutate),/unchanged tracked files/);
 assert.equal(await (await import("node:fs/promises")).readFile(source,"utf8"),"original\n");
 assert.equal(execFileSync("git",["-C",repo,"status","--porcelain"],{encoding:"utf8"}).trim(),"");
});
