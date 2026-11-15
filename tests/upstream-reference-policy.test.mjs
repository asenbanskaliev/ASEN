import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { maskApprovedReferenceTokens, isPinnedReferenceDocument } from "../scripts/upstream-reference-policy.mjs";

const forbidden = new RegExp(["gen"+"tle","gen"+"tleman","eng"+"ram"].join("|"),"iu");
function source(path) {
 return readFileSync(fileURLToPath(new URL("../"+path,import.meta.url)),"utf8");
}
const compat = [
 "src/agents/tool-overlay.ts","src/review/delivery-preflight.ts",
 "src/runtime/ui/desktop-rpc.ts","src/runtime/ui/guide-tour.ts",
 "src/runtime/ui/image-disk-cache.ts","src/runtime/ui/reply-language-anchor.ts",
 "src/runtime/ui/voice-dictation.ts","src/security/execution-surface-guard.ts",
 "tests/image-disk-cache.test.ts","tests/ordinary-review-assessment.test.ts",
 "tests/pi-process-runner.test.ts","tests/reply-language-anchor.test.ts",
 "tests/tool-overlay.test.ts"
];

test("compatibility exceptions admit only the recorded exact reference lines", () => {
 for (const path of compat) {
  assert.equal(isPinnedReferenceDocument(path),false,path+" must never be fully skipped");
  const original=source(path);
  assert.equal(forbidden.test(maskApprovedReferenceTokens(path,original)),false,path);
  const malicious=original+"\nimport attacker from './"+("gen"+"tle")+"/payload.js';\n";
  assert.equal(forbidden.test(maskApprovedReferenceTokens(path,malicious)),true,path+" must reject injected source");
  const trusted=original.split("\n").find(line=>forbidden.test(line));
  assert.ok(trusted,path+" needs at least one counted contract token");
  assert.equal(forbidden.test(maskApprovedReferenceTokens(path,original+"\n"+trusted)),true,
   path+" must reject copied extra allowlisted line");
 }
});

test("new executable source never inherits another file's exception", () => {
 const code='const path = ".pi/'+("gen"+"tle")+'-ai/tools.json";';
 assert.equal(forbidden.test(maskApprovedReferenceTokens("src/agents/other.ts",code)),true);
 assert.equal(forbidden.test(maskApprovedReferenceTokens("src/agents/tool-overlay.ts",code)),true);
});

test("approved RDD wire schema is scoped to exact paths and property comparisons", () => {
 const key=("gen"+"tle")+"-ai.review-mode/v1";
 const accepted='const value={schema:"'+key+'"};';
 assert.equal(forbidden.test(maskApprovedReferenceTokens("src/review/native-rdd-control.ts",accepted)),false);
 assert.equal(forbidden.test(maskApprovedReferenceTokens("src/runtime/other.ts",accepted)),true);
 assert.equal(forbidden.test(maskApprovedReferenceTokens("src/review/native-rdd-control.ts",
  'import x from "'+key+'";')),true);
});
