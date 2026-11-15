import assert from "node:assert/strict";
import test from "node:test";
import {createCheckpoint,restoreCheckpoint} from "../src/session/checkpoint.js";

const task={id:"task",title:"recover me",phase:"VERIFYING" as const,candidateId:"candidate",blockers:[]};
const candidate={id:"candidate",repository:"repo",revision:"revision",createdAt:"2026-10-07T00:00:00Z"};

test("checkpoint recovery rejects an invalid persisted task phase",()=>{
 const checkpoint=JSON.parse(JSON.stringify(createCheckpoint("project","session",task,candidate)));
 checkpoint.task.phase="ROOT";
 assert.throws(()=>restoreCheckpoint(checkpoint,"project"),/checkpoint task phase/i);
});
