import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

test("accepted GSP-06 closure cannot automatically spend provider quota",()=>{
  const workflow=readFileSync(new URL("../.github/workflows/gsp06-pi-free-parity.yml",import.meta.url),"utf8");
  assert.match(workflow,/^  workflow_dispatch:/m);
  assert.doesNotMatch(workflow,/^  (?:pull_request|push|schedule|workflow_run):/m);
  assert.match(workflow,/inputs\.expected_sha == github\.sha/);
  assert.match(workflow,/github\.ref == 'refs\/heads\/feat\/strict-parity-prerequisites'/);
  assert.match(workflow,/ASEN_EXPECTED_SHA: \$\{\{ inputs\.expected_sha \}\}/);
});
