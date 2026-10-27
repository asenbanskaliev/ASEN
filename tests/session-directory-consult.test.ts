import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {SessionDirectory} from "../src/runtime/session-directory.js";
test("requires explicit permission for cross-session consultation",()=>{const root=mkdtempSync(join(tmpdir(),"asen-session-consult-"));try{const d=new SessionDirectory(join(root,"sessions.json"));d.publish({sessionId:"target",subject:"target",projectId:"p",classification:"read",updatedAt:new Date().toISOString()});assert.throws(()=>d.consult("requester","target","p",false),/explicit permission/);assert.equal(d.consult("requester","target","p",true).sessionId,"target");}finally{rmSync(root,{recursive:true,force:true});}});

