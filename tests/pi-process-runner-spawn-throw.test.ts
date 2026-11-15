// T2.4 (S-04): `spawnContained` must never reject the returned promise and
// must never leave the temporary policy directory behind.
//
// RED (before the fix): `spawnContained` was called inside the promise
// executor without a try/catch, so a synchronous spawn failure rejected the
// promise (despite the `Promise<AgentResult>` contract) and skipped the
// `rmSync` cleanup of the policy directory.
import test from "node:test";
import assert from "node:assert/strict";
import {readdir,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {createPiRpcFixture} from "./helpers/pi-rpc-fixture.js";

async function policyDirectories(root:string):Promise<string[]>{
 const entries=await readdir(root).catch(()=>[] as string[]);
 return entries.filter(entry=>entry.startsWith("asen-policy-"));
}

test("T2.4 a synchronous spawn failure resolves with ok:false and leaves no policy directory",async t=>{
 const fixture=await createPiRpcFixture(t,"");
 const isolated=await mkdtemp(join(tmpdir(),"asen-policy-isolation-"));
 t.after(()=>rm(isolated,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 const previousTemp=process.env.TEMP,previousTmp=process.env.TMP;
 process.env.TEMP=isolated;
 process.env.TMP=isolated;
 t.after(()=>{
  if(previousTemp===undefined)delete process.env.TEMP;else process.env.TEMP=previousTemp;
  if(previousTmp===undefined)delete process.env.TMP;else process.env.TMP=previousTmp;
 });
 assert.deepEqual(await policyDirectories(isolated),[]);
 const runner=new PiProcessRunner({command:"pi\0invalid-command",rpcArgs:[],extraArgs:[fixture.pi],timeoutMs:5_000});
 const result=await runner.run({id:"spawn-throw",role:"explorer",prompt:"work",repository:fixture.repository});
 assert.equal(result.ok,false,`a spawn failure must resolve, not reject: ${result.output}`);
 assert.match(result.output,/failed to start|spawn/i,`the spawn failure must be reported: ${result.output}`);
 assert.deepEqual(await policyDirectories(isolated),[],"the temporary policy directory must be removed");
});
