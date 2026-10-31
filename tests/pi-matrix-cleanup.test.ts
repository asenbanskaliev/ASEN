import assert from "node:assert/strict";
import test from "node:test";
import {join} from "node:path";
import {tmpdir} from "node:os";
// @ts-expect-error CI-only bounded verifier workspace cleanup.
import {cleanupMatrixWorkspace} from "../scripts/pi-matrix-cleanup.mjs";

test("matrix cleanup has a command deadline and accepts only completed zero exit",()=>{
 const root=join(tmpdir(),"asen-pi-matrix-fixture");let calls=0;
 cleanupMatrixWorkspace(root,{run:(_file:string,args:string[],options:{timeout:number})=>{
  calls++;assert.equal(args.at(-1),root);assert.equal(options.timeout,process.platform==="win32"?300_000:30_000);
  return {status:0,signal:null};
 }});
 assert.equal(calls,1);
 for(const result of [{status:1,signal:null},{status:null,signal:"SIGTERM"},{status:0,signal:null,error:Error("timeout")}])
  assert.throws(()=>cleanupMatrixWorkspace(root,{run:()=>result}),/cleanup did not complete/);
});

test("matrix cleanup rejects paths outside its generated temporary workspace",()=>{
 for(const root of [tmpdir(),join(tmpdir(),"unrelated"),join(tmpdir(),"asen-pi-matrix-fixture","child")])
  assert.throws(()=>cleanupMatrixWorkspace(root,{run:()=>{throw Error("must not run");}}),/generated temporary/);
});
