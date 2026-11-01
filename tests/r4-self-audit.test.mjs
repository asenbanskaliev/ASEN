import test from "node:test";
import assert from "node:assert/strict";
import {evaluateR4SelfSnapshot} from "../scripts/r4-self-audit.mjs";
const base=()=>{
 const sha="1".repeat(40);
 return {expectedSha:sha,headSha:sha,claims:{rows:Array.from({length:16},(_,i)=>({id:"ECO-"+String(i+1).padStart(2,"0"),status:"PARTIAL"}))},capability:"- [ ] T09 | PARTIAL aggregate\n",extension:'pendingBackgroundJobNotifications( setDeliveryStateScoped(result.id,result.sessionId,result.projectId,"enqueued") deliveryConfirmed:false notificationProjection.publish( const notificationProjection=new PiNotificationProjection() notificationProjection.deactivate(agentDeliveryIdentity)',projection:"class PiNotificationProjection SessionNotificationBus this.#bus.clear(partition(previous)) this.#bus.clear(partition(current))",managedUninstall:"beforeQuarantineMove quarantine.verified() sameUninstallIdentity(stageIdentity,stage)",workflow:"name: R4 self audit\npermissions: contents: read",f5:"SELF_AUDIT_ONLY / NOT independent"};
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
