import test from "node:test";import assert from "node:assert/strict";import path from "node:path";import {findPotentialWorkspaceConflicts,groupChanges,recordWorkspaceChange,visibleWorkspaceConflictRows,visibleWorkspaceRows} from "../src/runtime/workspace-attribution.js";import {visibleWidth} from "../src/runtime/responsive-layout.js";
import {mkdtemp,mkdir,readFile,realpath,rm,writeFile} from "node:fs/promises";import {createHash} from "node:crypto";import {tmpdir} from "node:os";import {join} from "node:path";import {PersistentWorkspaceStore,parseWorkspaceFile,sameWorkspaceIdentityPath} from "../src/runtime/workspace-store.js";import authorityExtension,{recordSuccessfulWorkspaceWrite} from "../extensions/authority.js";
const base={path:"src/a.ts",actor:{kind:"agent" as const,id:"worker-1"},sessionId:"s1",projectId:"p1",worktree:path.resolve("repo"),operation:"modify" as const,at:"2026-10-06T00:00:00Z"};
test("workspace display sanitizes control and format characters before bounding without mutating attribution",()=>{
 const controls="\u001b\u0007\u009b\u009d\u007f\n\r\t\u202e\u2066\u200b\u2028\u2029";
 const change=recordWorkspaceChange({...base,path:`src/${controls}café-日本.ts`});
 const before=structuredClone(change),cleanPath=`src/${"�".repeat(13)}café-日本.ts`;
 assert.deepEqual(visibleWorkspaceRows([change],200),[`modify agent:worker-1 ${cleanPath}`]);
 assert.deepEqual(change,before);
 const benign={...base,path:"src/café-日本.ts"};
 assert.deepEqual(visibleWorkspaceRows([benign]),["modify agent:worker-1 src/café-日本.ts"]);
 const narrow=visibleWorkspaceRows([change],30);assert.deepEqual(narrow,[`modify agent:worker-1 …日本.ts`]);assert.ok(narrow.every(row=>visibleWidth(row)<=30));
 const injected={...base,actor:{kind:"agent" as const,id:"x\u001b[31m"},operation:"mo\u0007dify" as "modify"};
 assert.deepEqual(visibleWorkspaceRows([injected]),["mo�dify agent:x�[31m src/a.ts"]);
});

test("workspace conflict display sanitizes controls but preserves raw conflict identity",()=>{
 const first=recordWorkspaceChange({...base,path:"src/\u001b]52;c;payload\u0007.ts",actor:{kind:"agent",id:"a\u009b"}});
 const second=recordWorkspaceChange({...first,actor:{kind:"user",id:"b\u202e"}});
 const conflicts=findPotentialWorkspaceConflicts([first,second]),before=structuredClone(conflicts);
 assert.equal(conflicts.length,1);
 assert.deepEqual(visibleWorkspaceConflictRows(conflicts,200),["potential conflict agent:a� -> user:b� src/�]52;c;payload�.ts"]);
 assert.deepEqual(conflicts,before);
 assert.equal(conflicts[0]!.path,first.path);
 const bounded=visibleWorkspaceConflictRows(conflicts,20);
 assert.deepEqual(bounded,["potential conflict …"]);assert.ok(bounded.every(row=>visibleWidth(row)<=20));
});

test("workspace attribution binds actor session project and worktree",()=>{const c=recordWorkspaceChange(base);assert.equal(c.actor.id,"worker-1");assert.equal(groupChanges([c]).get("agent:worker-1")?.length,1);});
test("workspace attribution rejects escape/control and renders bounded rows",()=>{assert.throws(()=>recordWorkspaceChange({...base,path:"../x"}),/escapes/);assert.throws(()=>recordWorkspaceChange({...base,actor:{kind:"agent",id:"bad\nactor"}}),/Invalid/);const row=visibleWorkspaceRows([{...base,path:"very/long/path/to/a/file.ts"}],30)[0]!;assert.ok(row.length<=30);});
test("workspace attribution rejects forged actor kinds and incomplete operations",()=>{assert.throws(()=>recordWorkspaceChange({...base,actor:{kind:"admin" as never,id:"u"}}),/actor kind/i);assert.throws(()=>recordWorkspaceChange({...base,operation:"review" as never}),/operation/i);assert.throws(()=>recordWorkspaceChange({...base,path:""}),/path/i);});
test("workspace conflict review conservatively identifies different actors on one path without choosing a winner",()=>{
 const changes=[
  recordWorkspaceChange({...base,path:"src/shared.ts",actor:{kind:"agent",id:"agent-a"},operation:"modify"}),
  recordWorkspaceChange({...base,path:"src/other.ts",actor:{kind:"agent",id:"agent-a"},operation:"create"}),
  recordWorkspaceChange({...base,path:"src/shared.ts",actor:{kind:"user",id:"user-1"},operation:"modify"}),
  recordWorkspaceChange({...base,path:"src/shared.ts",actor:{kind:"user",id:"user-1"},operation:"modify"})
 ];
 const conflicts=findPotentialWorkspaceConflicts(changes);
 assert.equal(conflicts.length,1);assert.equal(conflicts[0]?.path,"src/shared.ts");
 assert.equal(conflicts[0]?.earlier.actor.id,"agent-a");assert.equal(conflicts[0]?.later.actor.id,"user-1");
 assert.match(visibleWorkspaceConflictRows(conflicts)[0]!,/potential conflict agent:agent-a -> user:user-1 src\/shared\.ts/);
});
test("workspace conflict review folds case on Windows and macOS, while preserving Linux path identity",()=>{
 const changes=[
  recordWorkspaceChange({...base,path:"src/Foo.ts",actor:{kind:"agent",id:"agent-a"}}),
  recordWorkspaceChange({...base,path:"SRC/foo.ts",actor:{kind:"user",id:"user-1"}})
 ];
 assert.equal(findPotentialWorkspaceConflicts(changes,"win32").length,1);
 assert.equal(findPotentialWorkspaceConflicts(changes,"darwin").length,1);
 assert.equal(findPotentialWorkspaceConflicts(changes,"linux").length,0);
});
test("workspace conflict identity includes the worktree so parallel checkouts do not collide",()=>{
 const first=recordWorkspaceChange({...base,path:"src/same.ts",worktree:path.resolve("worktree-a"),actor:{kind:"agent",id:"worker-a"}});
 const second=recordWorkspaceChange({...base,path:"src/same.ts",worktree:path.resolve("worktree-b"),actor:{kind:"user",id:"user"}});
 assert.deepEqual(findPotentialWorkspaceConflicts([first,second]),[]);
});
test("workspace change paths use portable separators and reject Windows absolute paths",()=>{assert.equal(recordWorkspaceChange({...base,path:"src\\nested\\file.ts"}).path,"src/nested/file.ts");assert.throws(()=>recordWorkspaceChange({...base,path:"C:\\secrets\\token"}),/escapes/);});
test("workspace identity compares Win32 realpath and extended-length forms",()=>{
 assert.equal(sameWorkspaceIdentityPath("\\\\?\\C:\\Work\\ASEN","c:/work/asen","win32"),true);
 assert.equal(sameWorkspaceIdentityPath("\\\\?\\UNC\\server\\share\\ASEN","\\\\server\\share\\asen","win32"),true);
 assert.equal(sameWorkspaceIdentityPath("C:\\work\\asen","C:\\work\\other","win32"),false);
 assert.equal(sameWorkspaceIdentityPath("/repo","/REPO","linux"),false);
});
test("successful child writes persist exact actor, session, project and worktree attribution",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-workspace-attribution-"));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,"src"));const canonicalRoot=await realpath(root),file=join(root,".asen","workspace.json"),authority={repository:root,role:"worker" as const,writeSurfaces:["src"],agentId:"agent-1",sessionId:"session-1"};
 await recordSuccessfulWorkspaceWrite(authority,"write",{path:"src/new.ts"},false,file);await recordSuccessfulWorkspaceWrite(authority,"edit",{path:"src/old.ts"},true,file);
 const store=await PersistentWorkspaceStore.open(file),identity={sessionId:"session-1",projectId:canonicalRoot,worktree:canonicalRoot},changes=await store.list(identity);const expected=[["src/new.ts","create","agent-1"],["src/old.ts","modify","agent-1"]];const persisted=JSON.parse(await readFile(file,"utf8")) as {changes:Array<{change:{sessionId:string;projectId:string;worktree:string}}>};assert.deepEqual(changes.map(x=>[x.change.path,x.change.operation,x.change.actor.id]),expected,JSON.stringify({identity,persistedIdentities:persisted.changes.map(({change})=>({sessionId:change.sessionId,projectId:change.projectId,worktree:change.worktree}))}));if(process.platform==="win32"){assert.equal((await store.list({sessionId:identity.sessionId,projectId:canonicalRoot.toUpperCase(),worktree:canonicalRoot.replace(/\\/g,"/")})).length,2);const extended=canonicalRoot.startsWith("\\\\?\\")?canonicalRoot:`\\\\?\\${canonicalRoot}`;assert.equal((await store.list({sessionId:identity.sessionId,projectId:extended,worktree:extended})).length,2);}
 assert.deepEqual(await store.list({sessionId:"session-2",projectId:canonicalRoot,worktree:canonicalRoot}),[]);assert.throws(()=>parseWorkspaceFile('{"schema":"asen.workspace/v1","revision":2,"changes":[]}'),/revision/);
 await assert.rejects(()=>recordSuccessfulWorkspaceWrite(authority,"write",{path:"secrets/token"},false,file),/scope is invalid/);
});

test("workspace history serializes concurrent appends from independent store instances",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-workspace-concurrent-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const canonicalRoot=await realpath(root),file=join(root,".asen","workspace.json"),first=await PersistentWorkspaceStore.open(file),second=await PersistentWorkspaceStore.open(file);
 const changes=Array.from({length:40},(_,index)=>recordWorkspaceChange({
  ...base,path:`src/generated-${index}.ts`,actor:{kind:"agent",id:`worker-${index}`},sessionId:"session-concurrent",projectId:canonicalRoot,worktree:canonicalRoot,
  operation:"create",at:new Date(Date.UTC(2026,0,1,0,0,index)).toISOString()
 }));
 await Promise.all(changes.map((change,index)=>(index%2?first:second).append(change)));
 const reopened=await PersistentWorkspaceStore.open(file),saved=await reopened.list({sessionId:"session-concurrent",projectId:canonicalRoot,worktree:canonicalRoot});
 assert.equal(saved.length,changes.length);assert.deepEqual(saved.map(item=>item.revision),Array.from({length:changes.length},(_,index)=>index+1));
 assert.deepEqual(new Set(saved.map(item=>item.id)).size,changes.length);assert.deepEqual(new Set(saved.map(item=>item.change.actor.id)).size,changes.length);
});

test("Pi authority records only successful writes from the exact authorized tool call",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-authority-hook-"));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,"src"));const canonicalRoot=await realpath(root),storeFile=join(root,".asen","workspace.json"),handlers=new Map<string,(event:any)=>unknown>();
 const original=process.env.ASEN_PI_AUTHORITY;process.env.ASEN_PI_AUTHORITY=JSON.stringify({repository:root,role:"worker",writeSurfaces:["src"],agentId:"agent-2",sessionId:"session-2",attributionFile:storeFile});t.after(()=>{if(original===undefined)delete process.env.ASEN_PI_AUTHORITY;else process.env.ASEN_PI_AUTHORITY=original;});
 authorityExtension({on:(name:string,handler:(event:any)=>unknown)=>handlers.set(name,handler),registerCommand:()=>{}} as any);
 const call=handlers.get("tool_call")!,result=handlers.get("tool_result")!;assert.equal(call({toolCallId:"write-1",toolName:"write",input:{path:"src/output.ts"}}),undefined);
 await result({toolCallId:"write-1",toolName:"write",input:{path:"src/output.ts"},isError:false});
 assert.deepEqual((await (await PersistentWorkspaceStore.open(storeFile)).list({sessionId:"session-2",projectId:canonicalRoot,worktree:canonicalRoot})).map(row=>row.change.path),["src/output.ts"]);
 assert.deepEqual(call({toolCallId:"write-2",toolName:"write",input:{path:"secrets/token"}}),{block:true,reason:"ASEN tool authority denied"});
 assert.equal(call({toolCallId:"write-3",toolName:"edit",input:{path:"src/other.ts"}}),undefined);await result({toolCallId:"write-3",toolName:"edit",input:{path:"src/forged.ts"},isError:false});
 assert.deepEqual((await (await PersistentWorkspaceStore.open(storeFile)).list({sessionId:"session-2",projectId:canonicalRoot,worktree:canonicalRoot})).map(row=>row.change.path),["src/output.ts"]);
});

test("Pi authority exact receipts stop duplicate writes before a second effect",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-authority-receipt-"));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,"src"));const canonicalRoot=await realpath(root),storeFile=join(root,".asen","workspace.json"),target=join(root,"src","output.ts"),content="one exact authorized write\n",hash=createHash("sha256").update(content).digest("hex"),handlers=new Map<string,(event:any)=>unknown>();await writeFile(target,content);
 const original=process.env.ASEN_PI_AUTHORITY;process.env.ASEN_PI_AUTHORITY=JSON.stringify({repository:root,role:"worker",writeSurfaces:["src/output.ts"],agentId:"agent-receipt",sessionId:"session-receipt",attributionFile:storeFile,exactWriteReceipt:{path:"src/output.ts",fileSha256:hash}});t.after(()=>{if(original===undefined)delete process.env.ASEN_PI_AUTHORITY;else process.env.ASEN_PI_AUTHORITY=original;});
 authorityExtension({on:(name:string,handler:(event:any)=>unknown)=>handlers.set(name,handler),registerCommand:()=>{}} as any);
 const call=handlers.get("tool_call")!,result=handlers.get("tool_result")!;
 assert.equal(call({toolCallId:"write-1",toolName:"write",input:{path:"src/output.ts"}}),undefined);
 assert.deepEqual(call({toolCallId:"write-2",toolName:"write",input:{path:"src/output.ts"}}),{block:true,reason:"ASEN exact write receipt already consumed"});
 assert.deepEqual(call({toolCallId:"edit-1",toolName:"edit",input:{path:"src/output.ts"}}),{block:true,reason:"ASEN exact write receipt requires the write tool"});
 await result({toolCallId:"write-1",toolName:"write",input:{path:"src/output.ts"},isError:false});
 assert.deepEqual((await (await PersistentWorkspaceStore.open(storeFile)).list({sessionId:"session-receipt",projectId:canonicalRoot,worktree:canonicalRoot})).map(row=>row.change.path),["src/output.ts"]);
});

test("Pi authority exact receipts do not attest bytes that differ from the authorized operation",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-authority-receipt-mismatch-"));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,"src"));const canonicalRoot=await realpath(root),storeFile=join(root,".asen","workspace.json"),target=join(root,"src","output.ts"),wanted="authorized bytes\n",handlers=new Map<string,(event:any)=>unknown>();await writeFile(target,"wrong bytes\n");
 const original=process.env.ASEN_PI_AUTHORITY;process.env.ASEN_PI_AUTHORITY=JSON.stringify({repository:root,role:"worker",writeSurfaces:["src/output.ts"],agentId:"agent-mismatch",sessionId:"session-mismatch",attributionFile:storeFile,exactWriteReceipt:{path:"src/output.ts",fileSha256:createHash("sha256").update(wanted).digest("hex")}});t.after(()=>{if(original===undefined)delete process.env.ASEN_PI_AUTHORITY;else process.env.ASEN_PI_AUTHORITY=original;});
 authorityExtension({on:(name:string,handler:(event:any)=>unknown)=>handlers.set(name,handler),registerCommand:()=>{}} as any);
 const call=handlers.get("tool_call")!,result=handlers.get("tool_result")!;assert.equal(call({toolCallId:"write-1",toolName:"write",input:{path:"src/output.ts"}}),undefined);
 const outcome=await result({toolCallId:"write-1",toolName:"write",input:{path:"src/output.ts"},isError:false}) as {isError?:boolean;content?:Array<{text?:string}>};assert.equal(outcome.isError,true);assert.match(outcome.content?.[0]?.text??"",/bytes do not match/);
 assert.deepEqual(await (await PersistentWorkspaceStore.open(storeFile)).list({sessionId:"session-mismatch",projectId:canonicalRoot,worktree:canonicalRoot}),[]);
});
