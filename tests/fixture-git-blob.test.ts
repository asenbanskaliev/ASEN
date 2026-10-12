import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
// @ts-expect-error Test-only Git fixture helper.
import {writeFixtureBlob} from "../scripts/fixture-git-blob.mjs";

test("fixture blob writer creates exact binary objects readable by real Git",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-blob-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 execFileSync("git",["init","--bare","-q",root],{timeout:30_000});
 for(const bytes of [Buffer.alloc(0),Buffer.from("á\n"),Buffer.from([0,255,10,1])]){
  const expected=execFileSync("git",["-C",root,"hash-object","--stdin"],{input:bytes,encoding:"utf8",timeout:30_000}).trim();
  const actual=writeFixtureBlob(root,bytes);
  assert.equal(actual,expected);
  assert.deepEqual(execFileSync("git",["-C",root,"cat-file","blob",actual],{timeout:30_000}),bytes);
  assert.equal(writeFixtureBlob(root,bytes),actual);
 }
});
