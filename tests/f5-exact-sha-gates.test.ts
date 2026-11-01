import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const f5=readFileSync(new URL("../.github/workflows/f5-static-verification.yml",import.meta.url),"utf8");
const t07=readFileSync(new URL("../.github/workflows/t07-codegraph-real-probe.yml",import.meta.url),"utf8");

test("F5 authority pin and actionlint retain exact PR SHA and same-repo admission",()=>{
 assert.match(f5,/^  pull_request:\s*$/m);
 assert.doesNotMatch(f5,/^  (?:push|schedule|workflow_dispatch):/m);
 assert.match(f5,/^  authority-pin:/m);
 assert.match(f5,/^  actionlint:/m);
 assert.equal((f5.match(/github\.head_ref == 'feat\/t12-integrated-acceptance-merge'/g)??[]).length,2);
 assert.equal((f5.match(/github\.event\.pull_request\.head\.repo\.full_name == 'asenbanskaliev\/ASEN'/g)??[]).length,2);
 assert.equal((f5.match(/git rev-parse HEAD/g)??[]).length,2);
 assert.match(f5,/npm run check:authority-pin/);
 assert.match(f5,/bash \.\/actionlint-installer\.bash 1\.7\.12/);
 assert.match(f5,/\.\/actionlint -color/);
 assert.doesNotMatch(f5,/run:\s*npm run pin:authority/m);
});

test("T07 CLI real probe preserves dispatch and original push while admitting only owner PR",()=>{
 assert.match(t07,/^  workflow_dispatch:/m);
 assert.match(t07,/^  push:/m);
 assert.match(t07,/^  pull_request:/m);
 assert.match(t07,/github\.event_name == 'workflow_dispatch'/);
 assert.match(t07,/github\.event_name == 'push'/);
 assert.match(t07,/github\.event_name == 'pull_request'/);
 assert.match(t07,/github\.head_ref == 'feat\/t12-integrated-acceptance-merge'/);
 assert.match(t07,/github\.event\.pull_request\.head\.repo\.full_name == 'asenbanskaliev\/ASEN'/);
 assert.match(t07,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
 assert.match(t07,/persist-credentials: false/);
 assert.match(t07,/test "\$\(git rev-parse HEAD\)" = "\$ASEN_EXPECTED_SHA"/);
 assert.doesNotMatch(t07,/startsWith\s*\(/);
});

test("F5 shellcheck corrections preserve branch cleanliness and provider-safe workflow semantics",()=>{
 const gsp=readFileSync(new URL("../.github/workflows/gsp-05e-authenticated-rdd.yml",import.meta.url),"utf8");
 const pi=readFileSync(new URL("../.github/workflows/pi-free-smoke.yml",import.meta.url),"utf8");
 const release=readFileSync(new URL("../.github/workflows/release-gate.yml",import.meta.url),"utf8");
 assert.match(gsp,/test -z "\$\(git status --porcelain=v1\)"/);
 assert.doesNotMatch(gsp,/\| test ! -s \/dev\/stdin/);
 assert.match(pi,/ASEN_RECOVERY_FILE="\$\(mktemp\)"\n\s+export ASEN_RECOVERY_FILE/);
 assert.match(pi,/ASEN_RECOVERY_KEY="\$\(node -e/);
 assert.match(pi,/export ASEN_RECOVERY_KEY/);
 assert.match(pi,/^  workflow_dispatch:/m);
 assert.doesNotMatch(pi,/^  (?:push|schedule):/m);
 assert.match(release,/throw new Error\("Expected Pi 1\.2\.0, got "\+p\.version\)/);
 assert.match(release,/console\.log\("Using installed Pi "\+p\.version\)/);
 assert.doesNotMatch(release,/\$\{p\.version\}/);
});
