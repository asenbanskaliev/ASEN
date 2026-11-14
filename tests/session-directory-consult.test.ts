import test from "node:test";
import assert from "node:assert/strict";
import {SessionDirectory} from "../src/runtime/session-directory.js";

test("cross-session consultation requires a fresh one-use grant bound to both sessions and project",()=>{
 const directory=new SessionDirectory(),updatedAt=new Date().toISOString();directory.publish({sessionId:"target",subject:"Target",projectId:"project",classification:"read",updatedAt});
 assert.throws(()=>directory.consult("missing","requester","target","project"),/valid unused consent/u);
 const consent=directory.issueConsent({requesterSessionId:"requester",targetSessionId:"target",projectId:"project"});assert.equal(directory.consult(consent.token,"requester","target","project").sessionId,"target");assert.throws(()=>directory.consult(consent.token,"requester","target","project"),/valid unused consent/u);
});
