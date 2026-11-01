import test from "node:test";
import assert from "node:assert/strict";
import {evaluateR4SelfSnapshot} from "../scripts/r4-self-audit.mjs";
const base=()=>{
 const sha="1".repeat(40);
 return {expectedSha:sha,headSha:sha,claims:{rows:Array.from({length:16},(_,i)=>({id:"ECO-"+String(i+1).padStart(2,"0"),status:"PARTIAL"}))},capability:"- [ ] T09 | PARTIAL aggregate\n",extension:'pendingBackgroundJobNotifications( setDeliveryStateScoped(result.id,result.sessionId,result.projectId,"enqueued") deliveryConfirmed:false const unresolved=jobs.filter(job=>job.state==="interrupted"&&job.deliveryState!=="enqueued") if(job.state!=="interrupted"&&pendingIds.has( notificationProjection.publish( const notificationProjection=new PiNotificationProjection() notificationProjection.deactivate(agentDeliveryIdentity)',backgroundJobs:'job.state==="interrupted"||job.sessionId!==sessionId if(job.state==="interrupted")throw new Error("Cannot deliver an interrupted job result") this.journal?.updateDeliveryState(id,job.options.sessionId,job.options.projectId,state,error,expected) throw error;',backgroundJournal:'if(current.state==="interrupted")throw new Error("Cannot deliver an interrupted job result") current.deliveryState!==expected.deliveryState Background job delivery conflict previous.state==="interrupted"&&previous.authorizationId snapshot.state!=="running" previous.state!=="running" previous.deliveryState!==snapshot.deliveryState Background journal record conflict',projection:"class PiNotificationProjection SessionNotificationBus this.#bus.clear(partition(previous)) this.#bus.clear(partition(current))",managedUninstall:"beforeQuarantineMove quarantine.verified() sameUninstallIdentity(stageIdentity,stage)",workflow:"name: R4 self audit\npermissions: contents: read",f5:"SELF_AUDIT_ONLY / NOT independent"};
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
