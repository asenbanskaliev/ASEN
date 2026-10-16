import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm,writeFile,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";
test("ECO-07 links are idempotent, immutable, and session scoped",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-links-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=new TaskAgentLinkStore(join(dir,"links.json"));
 const link={taskId:"todo-1",agentId:"agent-1",sessionId:"s1",projectId:"/project",createdAt:"2026-10-13T00:00:00.000Z"};
 assert.deepEqual(await store.bind(link),link);
 assert.deepEqual(await store.bind(link),link);
 await assert.rejects(()=>store.bind({...link,taskId:"todo-2"}),/already linked/);
 await assert.rejects(()=>store.bind({...link,sessionId:"s2"}),/already linked/);
 assert.equal((await store.list({sessionId:"s1",projectId:"/project"})).length,1);
 assert.deepEqual(await store.list({sessionId:"s2",projectId:"/project"}),[]);
 const reopened=new TaskAgentLinkStore(store.file);
 assert.equal((await reopened.list({sessionId:"s1",projectId:"/project"}))[0]?.agentId,"agent-1");
});
test("ECO-07 malformed link journal fails closed without overwriting bytes",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-links-invalid-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,"links.json"),raw='{"schema":"asen.task-agent-links/v1","revision":1,"links":[]}';
 await writeFile(file,raw);
 const store=new TaskAgentLinkStore(file);
 await assert.rejects(()=>store.list({sessionId:"s1",projectId:"/project"}),/Invalid ASEN task-agent links/);
 assert.equal(await readFile(file,"utf8"),raw);
});
