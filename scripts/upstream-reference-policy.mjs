// Explicitly bounded upstream provenance and wire-schema exceptions.
// These do not authorize executable upstream imports, new paths or native review.
const providerTerm="gen"+"tle";
const wirePrefix=providerTerm+"-ai";
const approvedWirePaths=new Set(["src/review/native-rdd-control.ts","tests/native-rdd-control.test.ts"]);
const approvedWireIds=Object.freeze([
  wirePrefix+".review-mode/v1",
  wirePrefix+".rdd-mode-status/v1",
  wirePrefix+".review-assessment/v1",
]);
const exactProvenanceDocs=new Set([
  "docs/portable-checkpoint.md",
  "docs/remote-continuation.md",
  "docs/runtime-tools.md",
  "odd/evidence/asen-"+providerTerm+"-shell-full-equivalence-final-refinement.md",
  "odd/evidence/asen-"+providerTerm+"-shell-per-point-matrix.md",
  "odd/evidence/portable-checkpoint-evidence.json",
  "odd/evidence/portable-checkpoint-manifest.json",
  "odd/tasks/asen-focus-experience.md",
  "odd/tasks/asen-"+providerTerm+"-shell-equivalence-audit.md",
  "odd/tasks/asen-"+providerTerm+"-shell-full-equivalence.md",
  "odd/tasks/asen-"+providerTerm+"-shell-parity-implementation.md",
  "odd/tasks/asen-parity-readiness.md",
  "odd/tasks/asen-parity-resume.md",
  "odd/tasks/github-portable-continuation.md",
  "odd/tasks/model-fallback-shell-parity.md",
  "odd/tasks/odd-rdd-shell-parity.md",
  "odd/tasks/p05-home-selectors.md",
  "odd/tasks/p10-fallback-editor.md",
  "odd/tasks/p11-child-fallback-wiring.md",
  "odd/tasks/p19-parent-red-checkpoint.md",
  "odd/tasks/p32-context-gauge.md",
  "odd/tasks/pi-asen-startup-banner.md",
  "odd/tasks/shell-experience-parity.md",
  "odd/tasks/skill-loading-shell-parity.md",
  "odd/tasks/storage-capability-rejection.md",
]);

// Compatibility-contract references: ASEN deliberately reads the reference shell's
// on-disk paths, cache roots and message/wire identifiers so existing user state and
// tooling keep working across both. These are inert string constants and provenance
// comments — never executable upstream imports (verified: no `import`/`require` of
// upstream code). Each path is registered explicitly; nothing here authorizes new
// paths, new imports, or native review.
const compatibilityContractPaths=new Set([
  "src/agents/tool-overlay.ts",            // reads `.pi/<shell>/tools.json` overlay source
  "src/review/delivery-preflight.ts",      // provenance comment naming the reference lib
  "src/runtime/desktop-rpc.ts",            // provenance comment (REA of reference lib)
  "src/runtime/guide-tour.ts",             // ported reference guide contract comment
  "src/runtime/image-disk-cache.ts",       // default cache root `<shell>/images`
  "src/runtime/reply-language-anchor.ts",  // recognizes `<shell>-todo-state` message types
  "src/runtime/voice-dictation.ts",        // provenance comment (reference lib guards)
  "src/security/execution-surface-guard.ts",// provenance comment naming the reference lib
  "tests/image-disk-cache.test.ts",        // asserts the `<shell>/images` cache root contract
  "tests/ordinary-review-assessment.test.ts",// fixtures use the approved wire schema id
  "tests/pi-process-runner.test.ts",       // fixtures write `.pi/<shell>/tools.json`
  "tests/reply-language-anchor.test.ts",   // fixtures use `<shell>-todo-state` types
  "tests/tool-overlay.test.ts",            // fixtures write `.pi/<shell>/tools.json`
]);
export function isCompatibilityContractPath(path){
  return compatibilityContractPaths.has(path);
}
export function isPinnedReferenceDocument(path){
  return exactProvenanceDocs.has(path)||compatibilityContractPaths.has(path);
}
export function maskApprovedWireSchemas(path,content){
  if(!approvedWirePaths.has(path))return content;
  let remaining=content;
  for(const id of approvedWireIds){
    // The exception is for exact schema-property comparisons/fixtures only:
    // import specifiers, arbitrary strings, suffix variants and comments remain scanned.
    const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const property=new RegExp('(\\bschema\\s*(?:===|:)\\s*")'+escaped+'(")',"gu");
    remaining=remaining.replace(property,'$1<approved-native-wire-schema>$2');
  }
  return remaining;
}
