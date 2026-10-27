import test from "node:test";
import assert from "node:assert/strict";
import {SessionDirectory} from "../src/runtime/session-directory.js";

test("publishes only live session labels and isolates them by canonical project",()=>{
 const d=new SessionDirectory(),now=new Date().toISOString();d.publish({sessionId:"a",subject:"one",projectId:"p1",classification:"read",updatedAt:now});d.publish({sessionId:"b",subject:"two",projectId:"p2",classification:"write",updatedAt:now});assert.equal(d.list("p1").length,1);d.remove("a");assert.equal(d.list("p1").length,0);
});

test("consultation consumes a consent once and binds it to requester target and project",()=>{
 const d=new SessionDirectory(),now=new Date().toISOString();d.publish({sessionId:"target",subject:"target",projectId:"p",classification:"read",updatedAt:now});const consent=d.issueConsent({requesterSessionId:"requester",targetSessionId:"target",projectId:"p",now:10_000});assert.equal(d.consult(consent.token,"requester","target","p",10_001).sessionId,"target");assert.throws(()=>d.consult(consent.token,"requester","target","p",10_002),/valid unused consent/u);
});

test("wrong scope or expired consent is rejected and cannot be replayed",()=>{
 const d=new SessionDirectory(),now=new Date().toISOString();d.publish({sessionId:"target",subject:"target",projectId:"p",classification:"read",updatedAt:now});const wrong=d.issueConsent({requesterSessionId:"requester",targetSessionId:"target",projectId:"p",now:1_000});assert.throws(()=>d.consult(wrong.token,"other","target","p",1_001),/valid unused consent/u);const expired=d.issueConsent({requesterSessionId:"requester",targetSessionId:"target",projectId:"p",now:1_000});assert.throws(()=>d.consult(expired.token,"requester","target","p",61_001),/valid unused consent/u);
});
