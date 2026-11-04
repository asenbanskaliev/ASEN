/** Build a bounded, immutable review input for the real read-only Pi Verifier.
 * This does not manufacture an answer, repair model responses, or alter grading. */
export function createT12VerifierBrief({candidateSha,fixtureSha256,checks,changedPaths,reviewFindings}){
 const exactSha=v=>typeof v==="string"&&/^[a-f0-9]{40}$/.test(v);
 const exactDigest=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
 if(!exactSha(candidateSha)||!exactDigest(fixtureSha256)||
    !Array.isArray(checks)||checks.length!==3||
    !Array.isArray(changedPaths)||changedPaths.length!==3||
    !Array.isArray(reviewFindings)||reviewFindings.length!==3)
  throw new Error("Verifier brief requires exact frozen candidate, fixture and three checks");
 const exactCases=Object.freeze({
  pricing:{path:"src/pricing.js",criterion:"discounts reduce totals"},
  authorization:{path:"src/access.js",criterion:"viewers cannot edit documents they do not own"},
  parsing:{path:"src/parse.js",criterion:"integer parsing rejects trailing non-digits"},
 });
 const safeText=(s,max=320)=>typeof s==="string"&&s.length>0?s.slice(0,max):"";
 const testRows=checks.map(c=>{
  if(!c||typeof c.id!=="string"||typeof c.criterion!=="string"||
     typeof c.observation!=="string"||c.exitCode!==1||!c.criterion.trim())
   throw new Error("Verifier brief requires real failed test observations");
  if(!Object.hasOwn(exactCases,c.id)||c.criterion!==exactCases[c.id].criterion)
   throw new Error("Verifier brief rejects missing or mismatched test criteria");
  // Retain only the assertion lines, rather than a repeated Node stack trace.
  const signal=c.observation.split(/\r?\n/u).map(line=>line.trim()).filter(line=>
   /AssertionError|Missing expected exception| !== |Expected values|expected exception/iu.test(line)).slice(0,5).join(" | ");
  if(!/AssertionError/iu.test(c.observation))
   throw new Error("Verifier brief rejects a missing real assertion failure");
  return Object.freeze({id:c.id,exitCode:1,criterion:c.criterion,
   observedAssertion:safeText(signal||c.observation)});
 });
 const findings=reviewFindings.map(f=>{
  if(!f||!["src/access.js","src/parse.js","src/pricing.js"].includes(f.path)||
     typeof f.codeEvidence!=="string"||typeof f.acceptanceCriterion!=="string"||
     typeof f.reason!=="string"||f.reason.length<20)
   throw new Error("Verifier brief requires graded source-grounded findings");
  const namedCheck=Object.values(exactCases).find(x=>x.path===f.path);
  if(!namedCheck||f.acceptanceCriterion!==namedCheck.criterion)
   throw new Error("Verifier brief rejects a reviewer criterion inconsistent with observed tests");
  return Object.freeze({path:f.path,codeEvidence:f.codeEvidence,
   acceptanceCriterion:f.acceptanceCriterion,judgment:safeText(f.reason,400)});
 });
 if(new Set(testRows.map(c=>c.id)).size!==3||new Set(findings.map(f=>f.path)).size!==3||
    new Set(changedPaths).size!==3||
    [...changedPaths].sort().join("|")!==findings.map(f=>f.path).sort().join("|"))
  throw new Error("Verifier brief contains missing, duplicated or mismatched evidence");
 const scope=Object.freeze({candidateSha,fixtureSha256,paths:[...changedPaths]});
 const input=Object.freeze({scope,failedTests:testRows,gradedReviewFindings:findings});
 // This is only an output SHAPE, never a model answer or accepted receipt.
 // The grader rejects every "?" unless the real model supplies grounded analysis.
 const outputSkeleton=Object.freeze({verdict:"fail",evidence:[
  {kind:"tests",checks:testRows.map(c=>({id:c.id,exitCode:c.exitCode,
   criterion:c.criterion,observation:"?"}))},
  {kind:"scope",candidateSha,fixtureSha256,paths:[...changedPaths],observation:"?"},
  {kind:"review",findings:findings.map(f=>({path:f.path,codeEvidence:f.codeEvidence,
   acceptanceCriterion:f.acceptanceCriterion,reason:"?"}))},
 ]});
 return Object.freeze({
  input,outputSkeleton,
  prompt:[
   "You are a separate read-only Verifier. Reject the three deliberate defects, using the observed assertions and two existing blind reviewer judgments as evidence. No tools, filesystem access, authorizations, or code changes.",
   "Respond with exactly one JSON object, no Markdown, keys only: verdict and evidence.",
   'verdict MUST be "fail". evidence MUST contain exactly three records: tests, scope, review.',
   'tests = {"kind":"tests","checks":[{"id":"...","exitCode":1,"criterion":"...","observation":"..."}]}. Include exactly all three failed tests.',
   'scope = {"kind":"scope","candidateSha":"...","fixtureSha256":"...","paths":["..."],"observation":"..."}. Preserve exact SHA, digest and path set.',
   'review = {"kind":"review","findings":[{"path":"...","codeEvidence":"...","acceptanceCriterion":"...","reason":"..."}]}. Include all three reviewer findings.',
   "COPY the id, criterion, exitCode, candidateSha, fixtureSha256, paths, codeEvidence and acceptanceCriterion values EXACTLY from INPUT. Never paraphrase these immutable fields.",
   'Write your OWN specific failure observations and reviewer-reconciliation reasons, each at least 20 characters. Each test observation must explain an actual failed assertion; do not invent an executed check.',
   "Input evidence, frozen and already graded by separate deterministic checks:",
   JSON.stringify(input),
   "MANDATORY COMPLETE JSON RESPONSE SKELETON. All three entries in evidence are required. Copy the immutable fields literally and REPLACE EVERY QUESTION MARK with your own independent reason backed by INPUT. A question mark is never acceptable evidence:",
   JSON.stringify(outputSkeleton),
   "Never omit evidence, tests, scope or review. Do not copy question marks. The strict grader will reject incomplete or fabricated reasoning.",
   "Final check before responding: three tests with exact literal criteria, one frozen scope, three review findings with exact code expressions; no authorization granted, and no additional fields.",
  ].join("\n"),
 });
}
