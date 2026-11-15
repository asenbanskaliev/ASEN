import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("Release Gate packs one built exact candidate per OS and reuses it for both independent installs",async()=>{
 const workflow=(await readFile(new URL("../.github/workflows/release-gate.yml",import.meta.url),"utf8")).replace(/\r\n/gu,"\n");
 assert.match(workflow,/os: \[ubuntu-24\.04, windows-latest, macos-latest\]/u);
 assert.match(workflow,/node-version: 22\n\s+cache: npm/u);
 assert.match(workflow,/run: npm ci --no-audit --no-fund/u);
 assert.match(workflow,/name: Build platform-specific release candidate\n\s+run: npm run build/u);
 assert.equal((workflow.match(/npm pack --ignore-scripts --silent/gu)??[]).length,1);
 assert.equal((workflow.match(/npm pack --silent/gu)??[]).length,0,"do not re-pack at each install");
 assert.match(workflow,/printf 'ASEN_RELEASE_TARBALL=%s\\n' "\$TARBALL" >> "\$GITHUB_ENV"/u);
 assert.match(workflow,/pi install "\$GITHUB_WORKSPACE\/\$ASEN_RELEASE_TARBALL"/u);
 assert.match(workflow,/npm install --no-audit --no-fund "\$GITHUB_WORKSPACE\/\$ASEN_RELEASE_TARBALL"/u);
 assert.match(workflow,/\$tarball = Join-Path \$env:GITHUB_WORKSPACE \$env:ASEN_RELEASE_TARBALL/u);
 assert.match(workflow,/pi install \$tarball/u);
 assert.match(workflow,/npm install --no-audit --no-fund \$tarball/u);
 assert.match(workflow,/node -e 'const p=require\(".\/node_modules\/@earendil-works\/pi-coding-agent\/package\.json"\)/u);
});

test("Release Gate delegates duplicated PR typecheck to CI but checks release-only branch pushes",async()=>{
 const workflow=(await readFile(new URL("../.github/workflows/release-gate.yml",import.meta.url),"utf8")).replace(/\r\n/gu,"\n");
 assert.match(workflow,/name: Typecheck release-only pushes\n\s+if: github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/heads\/release\/'\)\n\s+run: npm run typecheck/u);
 assert.match(workflow,/name: T09 finite copy and strict verification budget regressions/u);
 assert.match(workflow,/name: Packed restart and cross-session execution receipts/u);
 assert.match(workflow,/name: Real Pi package install smoke \(Windows\)/u);
 assert.match(workflow,/name: Retain exact-candidate package session evidence/u);
 assert.match(workflow,/name: Retain T09 bounded phase timings\n\s+if: always\(\)/u);
 assert.match(workflow,/if-no-files-found: warn/u);
});

test("T09 smoke retains signed upgrade, WAL backup and crash-recovery while recording bounded phases",async()=>{
 const source=(await readFile(new URL("../scripts/t09-real-package-smoke.mjs",import.meta.url),"utf8")).replace(/\r\n/gu,"\n");
 const phases=["signed-install","https-upgrade-rollback","sqlite-backup-restore","crash-recovery","managed-uninstall"];
 for(const phase of phases)assert.ok(source.includes('recordPhase("'+phase+'"'),phase);
 assert.match(source,/T09_PHASE_SUMMARY/u);
 assert.match(source,/schema:"asen\.t09-phase-timings\/v1"/u);
 assert.match(source,/ASEN_T09_TIMING_PATH/u);
 assert.match(source,/serveSignedPackage\(nextPackageRoot,nextManifest,nextSignature\)/u);
 assert.match(source,/PRAGMA integrity_check/u);
 assert.match(source,/restoreChild\.kill\("SIGKILL"\)/u);
 assert.match(source,/assert\.equal\(removed\.userDataTouched,false\)/u);
});
