import test from "node:test";
import assert from "node:assert/strict";
import {evaluateR4SelfSnapshot} from "../scripts/r4-self-audit.mjs";
const base=()=>{
 const sha="1".repeat(40);
 return {expectedSha:sha,headSha:sha,claims:{rows:Array.from({length:16},(_,i)=>({id:"ECO-"+String(i+1).padStart(2,"0"),status:"PARTIAL"}))},capability:"- [ ] T09 | PARTIAL aggregate\n",extension:'if(result.persistenceError) if(result.deliveryState==="enqueued")return; backgroundJobs.setDeliveryStateScoped(result.id,result.sessionId,result.projectId,"pending"); let transportAttempted=false; if(transportAttempted)try{backgroundJobs.setDeliveryStateScoped( pendingBackgroundJobNotifications( setDeliveryStateScoped(result.id,result.sessionId,result.projectId,"enqueued") deliveryConfirmed:false const unresolved=jobs.filter(job=>job.state==="interrupted"&&job.deliveryState!=="enqueued") if(job.state!=="interrupted"&&pendingIds.has( notificationProjection.publish( const notificationProjection=new PiNotificationProjection() notificationProjection.deactivate(agentDeliveryIdentity)',backgroundJobs:'if(job.state==="running"||job.state==="queued"||job.persistenceError)return null; job.state==="interrupted"||job.sessionId!==sessionId if(job.state==="interrupted")throw new Error("Cannot deliver an interrupted job result") this.journal?.updateDeliveryState(id,job.options.sessionId,job.options.projectId,state,error,expected) throw error;',backgroundJournal:'if(current.state==="interrupted")throw new Error("Cannot deliver an interrupted job result") current.deliveryState!==expected.deliveryState Background job delivery conflict previous.state==="interrupted"&&previous.authorizationId snapshot.state!=="running" previous.state!=="running" previous.deliveryState!==snapshot.deliveryState Background journal record conflict absoluteDeadline=startedAt+15_000 inactiveDeadline=Math.min(absoluteDeadline,Date.now()+3_000) Date.now()>=absoluteDeadline||Date.now()>=inactiveDeadline ...(previous.args?{args:Object.freeze([...previous.args])}:{}) ...(previous.cwd?{cwd:previous.cwd}:{})',projection:"class PiNotificationProjection SessionNotificationBus this.#bus.clear(partition(previous)) this.#bus.clear(partition(current))",managedUninstall:'async function probeSelectedVersion(prefix:string,version:string) if(observed.status!=="owned"||activeVersion!==version)return {ok:false const restored=await probeSelectedVersion(prefix,from); const health=await probeSelectedVersion(prefix,target); const health=await probeSelectedVersion(prefix,target); if(!records)return fail("FOREIGN_ROOT","Managed ownership records changed before uninstall; nothing further was removed");\n  // Check the journal under the maintenance lock before removing any owned file.\n  await readJournal(prefix);\n  for(const version of records.versions){ if(journal&&current!==journal.from&&current!==journal.to)return fail("RECOVERY_REQUIRED" new Date(value.startedAt).toISOString()!==value.startedAt value.from===value.to if(selected.state==="uncertain")return report({operation:"upgrade",status:"ambiguous" if(selected.state==="not-started"){await clearJournal(prefix); error instanceof ManagedVersionSelectionError&&active===to&&error.report.publication==="committed" state:"uncertain",reason:text(error),observedActive:active??null beforeQuarantineMove quarantine.verified() sameUninstallIdentity(stageIdentity,stage) if(!restored.ok)return report({operation:"upgrade",status:"ambiguous" if(journal&&target!==journal.from)return fail("RECOVERY_REQUIRED" if(health.ok&&journal)await clearJournal(prefix); if(!health.ok)return report({operation:"rollback",status:"ambiguous"',workflow:"name: R4 self audit\npermissions: contents: read",f5:"SELF_AUDIT_ONLY / NOT independent"};
};
test("the self-audit PASS never claims an independent reviewer",()=>{
 const result=evaluateR4SelfSnapshot(base());
 assert.equal(result.status,"PASS");assert.equal(result.mode,"SELF_AUDIT_ONLY");assert.equal(result.independentReviewPerformed,false);
});
test("SHA mismatch and missing expected SHA fail closed",()=>{
 assert.equal(evaluateR4SelfSnapshot({...base(),expectedSha:"2".repeat(40)}).status,"FAIL");
 assert.equal(evaluateR4SelfSnapshot({...base(),expectedSha:""}).status,"FAIL");
});
test("ECO FULL and T09 FULL without evidence cannot pass",()=>{
 const a=base();a.claims.rows[15].status="FULL";assert.equal(evaluateR4SelfSnapshot(a).status,"FAIL");
 assert.equal(evaluateR4SelfSnapshot({...base(),capability:"- [x] T09 | FULL"}).status,"FAIL");
});
test("fabricated acknowledgement or missing durable journal is rejected",()=>{
 assert.equal(evaluateR4SelfSnapshot({...base(),extension:base().extension+" deliveryConfirmed:true"}).status,"FAIL");
 assert.equal(evaluateR4SelfSnapshot({...base(),extension:base().extension.replace("pendingBackgroundJobNotifications(","")}).status,"FAIL");
});
test("unwired or transport-taking projection is rejected",()=>{
 assert.equal(evaluateR4SelfSnapshot({...base(),projection:"class PiNotificationProjection SessionNotificationBus pi.sendMessage"}).status,"FAIL");
 assert.equal(evaluateR4SelfSnapshot({...base(),extension:base().extension.replace("notificationProjection.publish(","")}).status,"FAIL");
});
test("provider credentials and false independent signoff cannot pass",()=>{
 assert.equal(evaluateR4SelfSnapshot({...base(),workflow:"env: OPENAI_API_KEY: secrets.API_KEY"}).status,"FAIL");
 assert.equal(evaluateR4SelfSnapshot({...base(),f5:"independent PASS"}).status,"FAIL");
});

test("closing session must remove the projection's old in-memory identities",()=>{
 const snapshot=base();snapshot.projection=snapshot.projection.replace("this.#bus.clear(partition(current))","");
 assert.equal(evaluateR4SelfSnapshot(snapshot).status,"FAIL");
});

test("T09 unbound or substituted private removal stage fails the automated security gate",()=>{
 const b=base();b.managedUninstall=b.managedUninstall.replace("quarantine.verified()","");
 assert.equal(evaluateR4SelfSnapshot(b).status,"FAIL");
 const c=base();c.managedUninstall=c.managedUninstall.replace("sameUninstallIdentity(stageIdentity,stage)","");
 assert.equal(evaluateR4SelfSnapshot(c).status,"FAIL");
});

test("a stale running journal row must never be promoted by automatic startup delivery",()=>{
 const snapshot=base();snapshot.extension=snapshot.extension.replace('if(job.state!=="interrupted"&&pendingIds.has(','if(pendingIds.has(');
 assert.equal(evaluateR4SelfSnapshot(snapshot).status,"FAIL");
 const missingWarning=base();missingWarning.extension=missingWarning.extension.replace('const unresolved=jobs.filter(job=>job.state==="interrupted"&&job.deliveryState!=="enqueued")','');
 assert.equal(evaluateR4SelfSnapshot(missingWarning).status,"FAIL");
});


test("T10 impossible-to-confirm interrupted recovery must be blocked in both journal and pending list",()=>{
 const first=base();first.backgroundJobs=first.backgroundJobs.replace('job.state==="interrupted"||job.sessionId!==sessionId','job.sessionId!==sessionId');
 assert.equal(evaluateR4SelfSnapshot(first).status,"FAIL");
 const second=base();second.backgroundJournal=second.backgroundJournal.replace('if(current.state==="interrupted")throw new Error("Cannot deliver an interrupted job result")','');
 assert.equal(evaluateR4SelfSnapshot(second).status,"FAIL");
});


test("T10 live delivery CAS must not be removed or replaced by a stale journal overwrite",()=>{
 const old=base();old.backgroundJobs=old.backgroundJobs.replace("this.journal?.updateDeliveryState(id,job.options.sessionId,job.options.projectId,state,error,expected)","this.journal?.record(this.snapshot(id))");
 assert.equal(evaluateR4SelfSnapshot(old).status,"FAIL");
 const changed=base();changed.backgroundJournal=changed.backgroundJournal.replace("current.deliveryState!==expected.deliveryState","");
 assert.equal(evaluateR4SelfSnapshot(changed).status,"FAIL");
});


test("R4 rejects a journal that loses retry-claim finality or permits stale terminal overwrites",()=>{
 const a=base();a.backgroundJournal=a.backgroundJournal.replace('previous.state!=="running"','');
 assert.equal(evaluateR4SelfSnapshot(a).status,"FAIL");
 const b=base();b.backgroundJournal=b.backgroundJournal.replace('previous.state==="interrupted"&&previous.authorizationId','');
 assert.equal(evaluateR4SelfSnapshot(b).status,"FAIL");
 const c=base();c.backgroundJournal=c.backgroundJournal.replace('previous.deliveryState!==snapshot.deliveryState','');
 assert.equal(evaluateR4SelfSnapshot(c).status,"FAIL");
});


test("T04 retry claim argument and directory identity cannot be silently dropped",()=>{
 const a=base();a.backgroundJournal=a.backgroundJournal.replace('...(previous.args?{args:Object.freeze([...previous.args])}:{})','');
 assert.equal(evaluateR4SelfSnapshot(a).status,"FAIL");
 const b=base();b.backgroundJournal=b.backgroundJournal.replace('...(previous.cwd?{cwd:previous.cwd}:{})','');
 assert.equal(evaluateR4SelfSnapshot(b).status,"FAIL");
});


test("R4 refuses an unbounded, fixed-deadline or non-progress-aware journal lock",()=>{
 const current=base();
 for(const removed of ["absoluteDeadline=startedAt+15_000","inactiveDeadline=Math.min(absoluteDeadline,Date.now()+3_000)","Date.now()>=absoluteDeadline||Date.now()>=inactiveDeadline"]){
  const altered={...current,backgroundJournal:current.backgroundJournal.replace(removed,"")};
  assert.equal(evaluateR4SelfSnapshot(altered).status,"FAIL",removed);
 }
});


test("R4 disallows Pi enqueue when the terminal journal write failed or preflight is absent",()=>{
 const current=base();
 for(const absent of ['if(result.persistenceError)','if(result.deliveryState==="enqueued")return;','backgroundJobs.setDeliveryStateScoped(result.id,result.sessionId,result.projectId,"pending");','let transportAttempted=false;','if(transportAttempted)try{backgroundJobs.setDeliveryStateScoped(']){
  assert.equal(evaluateR4SelfSnapshot({...current,extension:current.extension.replace(absent,"")}).status,"FAIL",absent);
 }
 assert.equal(evaluateR4SelfSnapshot({...current,backgroundJobs:current.backgroundJobs.replace('if(job.state==="running"||job.state==="queued"||job.persistenceError)return null;','')}).status,"FAIL");
});


test("T09 interrupted rollback cannot waive its journal while the CLI is unhealthy",()=>{
 const first=base();
 for(const phrase of ['if(!restored.ok)return report({operation:"upgrade",status:"ambiguous"','if(journal&&target!==journal.from)return fail("RECOVERY_REQUIRED"','if(health.ok&&journal)await clearJournal(prefix);','if(!health.ok)return report({operation:"rollback",status:"ambiguous"']){
  assert.equal(evaluateR4SelfSnapshot({...first,managedUninstall:first.managedUninstall.replace(phrase,"")}).status,"FAIL",phrase);
 }
});


test("T09 selector CAS uncertainty is enforced in self-audit mutation tests",()=>{
 const witness=base();
 for(const phrase of ['if(selected.state==="uncertain")return report({operation:"upgrade",status:"ambiguous"','if(selected.state==="not-started"){await clearJournal(prefix);','error instanceof ManagedVersionSelectionError&&active===to&&error.report.publication==="committed"','state:"uncertain",reason:text(error),observedActive:active??null']){
  assert.equal(evaluateR4SelfSnapshot({...witness,managedUninstall:witness.managedUninstall.replace(phrase,"")}).status,"FAIL",phrase);
 }
});

test("T09 journal origin and shape guard are required by R4 source checks",()=>{
 const witness=base();
 for(const phrase of ['if(journal&&current!==journal.from&&current!==journal.to)return fail("RECOVERY_REQUIRED"','new Date(value.startedAt).toISOString()!==value.startedAt','value.from===value.to']){
  assert.equal(evaluateR4SelfSnapshot({...witness,managedUninstall:witness.managedUninstall.replace(phrase,"")}).status,"FAIL",phrase);
 }
});

test("T09 R4 rejects removal of the uninstall recovery-journal preflight",()=>{
 const snapshot=base();
 const prefix="await readJournal(prefix);";
 assert.equal(evaluateR4SelfSnapshot({...snapshot,managedUninstall:snapshot.managedUninstall.replace(prefix,"")}).status,"FAIL");
});

test("T09 R4 rejects rollback acceptance without post-probe selector readback",()=>{
 const observed=base();
 for(const fragment of [
  'if(observed.status!=="owned"||activeVersion!==version)return {ok:false',
  'const restored=await probeSelectedVersion(prefix,from);',
  'const health=await probeSelectedVersion(prefix,target);',
 ]){
  const mutant=observed.managedUninstall.replace(fragment,"");
  assert.equal(evaluateR4SelfSnapshot({...observed,managedUninstall:mutant}).status,"FAIL",fragment);
 }
});
