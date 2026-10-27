import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {SessionDirectory} from "../src/runtime/session-directory.js";
test("publishes and isolates session subjects by project",()=>{const root=mkdtempSync(join(tmpdir(),"asen-sessions-"));try{const d=new SessionDirectory(join(root,"sessions.json"));d.publish({sessionId:"a",subject:"one",projectId:"p1",classification:"read",updatedAt:new Date().toISOString()});d.publish({sessionId:"b",subject:"two",projectId:"p2",classification:"write",updatedAt:new Date().toISOString()});assert.equal(d.list("p1").length,1);d.remove("a");assert.equal(d.list("p1").length,0);}finally{rmSync(root,{recursive:true,force:true});}});

