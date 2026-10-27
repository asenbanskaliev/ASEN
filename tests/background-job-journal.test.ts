import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {BackgroundJobJournal} from "../src/runtime/background-job-journal.js";

test("records terminal jobs for recovery without making them resumable",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-job-journal-"));try{const journal=new BackgroundJobJournal(join(root,"jobs.json"));journal.record({id:"j1",sessionId:"s1",command:"echo",mode:"background",state:"completed",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),exitCode:0,eventCount:1,tail:["ok"]});const rows=journal.load("s1");assert.equal(rows.length,1);assert.equal(rows[0]!.resumable,false);assert.equal(journal.load("s2").length,0);}finally{rmSync(root,{recursive:true,force:true});}
});

