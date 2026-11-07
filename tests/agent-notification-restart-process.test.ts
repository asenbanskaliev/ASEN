import assert from "node:assert/strict";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {mkdir,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AgentNotificationJournal} from "../src/runtime/agent-notification-journal.js";
import {agentTerminalNoticeContent} from "../src/runtime/agent-terminal-delivery.js";

const sourceUrl=new URL("../src/runtime/agent-notification-journal.ts",import.meta.url).href;
function separateProcess(stage:string,file:string,subject:object){
 const source=`import {AgentNotificationJournal} from ${JSON.stringify(sourceUrl)};
 const journal=new AgentNotificationJournal(process.env.ASEN_TEST_NOTICE_FILE);
 const subject=JSON.parse(process.env.ASEN_TEST_NOTICE_SUBJECT);
 if(process.env.ASEN_TEST_PHASE==="terminate-after-claim"){
  const row=await journal.record(subject);
  if(!await journal.claim(row.eventId,subject))process.exit(2);
  process.exit(73);
 }else if(process.env.ASEN_TEST_PHASE==="reopen-uncertain"){
  const seen=await journal.list(subject);
  const replay=await journal.record(subject);
  const claimed=await journal.claim(replay.eventId,subject);
  let ackError="NONE";
  try{await journal.acknowledge(replay.eventId,subject,subject.id,"completed");}
  catch(error){ackError=String(error?.message??error);}
  const after=await journal.list(subject);
  console.log(JSON.stringify({seen,replay,claimed,ackError,after}));
 }else throw Error("Unknown test phase");`;
 return spawnSync(process.execPath,["--import","tsx","--input-type=module","-e",source],{
  cwd:process.cwd(),encoding:"utf8",timeout:25000,windowsHide:true,
  env:{...process.env,ASEN_TEST_NOTICE_FILE:file,ASEN_TEST_NOTICE_SUBJECT:JSON.stringify(subject),ASEN_TEST_PHASE:stage},
 });
}

test("EF-604 real process termination after claim cannot replay or fabricate acknowledgement on restart",{timeout:90000},async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-restart-uncertain-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const projectId=join(root,"project");await mkdir(projectId);
 const file=join(root,"notices.json");
 const subject={id:"read-only-child",sessionId:"same-pi-session",projectId,state:"completed"};
 const crashed=separateProcess("terminate-after-claim",file,subject);
 assert.equal(crashed.error,undefined,String(crashed.error));
 assert.equal(crashed.status,73,"Separate process must terminate after the durable claim, before enqueue");
 const journal=new AgentNotificationJournal(file);
 const before=await journal.list(subject);
 assert.equal(before.length,1);
 assert.equal(before[0]?.delivery,"attempted","Transport outcome is uncertain and must not be retried");
 const original=await readFile(file);
 const reopened=separateProcess("reopen-uncertain",file,subject);
 assert.equal(reopened.error,undefined,String(reopened.error));
 assert.equal(reopened.status,0,reopened.stderr);
 const results=JSON.parse(reopened.stdout.trim());
 assert.equal(results.seen.length,1);
 assert.equal(results.seen[0].eventId,before[0]?.eventId);
 assert.equal(results.replay.eventId,before[0]?.eventId);
 assert.equal(results.claimed,false,"Recovery must not transmit an uncertain event again");
 assert.match(results.ackError,/enqueued before coordinator acknowledgement/u);
 assert.equal(results.after[0].delivery,"attempted","No Pi action or human consumption may be invented");
 assert.deepEqual(await readFile(file),original,"Recovery must preserve the journal bytes without a new revision");
 assert.deepEqual(await journal.list(subject),before);
 const foreign=await journal.list({...subject,sessionId:"foreign-session"});
 assert.deepEqual(foreign,[],"A different session cannot consume or enumerate the uncertain notice");
});


test("EF-601 restart keeps an old pending notice durable but composes it without stale report text",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-restart-stale-pending-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const scope={sessionId:"same-pi-session",projectId:join(root,"project")};
 await mkdir(scope.projectId);
 const file=join(root,"notices.json"),writer=new AgentNotificationJournal(file);
 const recorded=await writer.record({...scope,id:"old-completed-agent",state:"completed"});
 const old=new Date(Date.now()-120_000).toISOString();
 const data=JSON.parse(await readFile(file,"utf8"));
 data.entries[0].createdAt=old;data.entries[0].updatedAt=old;
 await writeFile(file,JSON.stringify(data)+"\n");
 // A separate journal instance models a restarted Pi host reading durable pending data.
 const reopened=new AgentNotificationJournal(file),rows=await reopened.list(scope),row=rows[0]!;
 assert.equal(row.eventId,recorded.eventId);
 assert.equal(row.delivery,"pending","Fresh host must leave an old, unclaimed notice eligible for one compact delivery");
 const notice=agentTerminalNoticeContent({id:row.agentId,role:"explorer",state:row.state,
  summary:"PRIVATE_OLD_RESULT",eventId:row.eventId,createdAt:row.createdAt,now:Date.now()});
 assert.equal(notice.stale,true);
 assert.doesNotMatch(notice.content,/PRIVATE_OLD_RESULT/u);
 assert.ok(notice.content.includes(row.eventId));
 assert.equal((await reopened.list(scope))[0]?.delivery,"pending",
  "Composition alone may not claim, acknowledge or change delivery state");
});
