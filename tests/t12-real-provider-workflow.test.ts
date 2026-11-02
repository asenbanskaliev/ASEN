import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const workflow=readFileSync(new URL("../.github/workflows/asen-real-agent-acceptance.yml",import.meta.url),"utf8");

test("T12 Pi child stages resolve the npm-installed runtime from PATH",()=>{
 for(const name of [
  "Real ASEN Dispatcher explorer with Ollama Cloud (read-only)",
  "Real model planning on graded ASEN Explorer findings",
  "Real ASEN Reviewer and Verifier reject a deliberate defect",
 ]){
  const heading=`      - name: ${name}`;
  const start=workflow.indexOf(heading);
  assert.notEqual(start,-1,`Missing workflow stage: ${name}`);
  const end=workflow.indexOf("\n      - name:",start+heading.length);
  const stage=workflow.slice(start,end===-1?undefined:end);
  assert.match(stage,/export PATH="\$PWD\/node_modules\/\.bin:\$PATH"/,
   `${name} must expose the pinned, locally installed Pi executable to spawned ASEN children`);
 }
});
