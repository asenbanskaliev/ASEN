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

// Never exempt an entire executable file: each legitimate reference-bearing
// line is recorded verbatim (ROT13 only to avoid self-triggering the scanner).
// A changed line, extra occurrence, executable import or unrelated reference
// remains subject to the normal forbidden-term scan.
const encodedCompatibilityLines = new Map([
 [
  "src/agents/tool-overlay.ts",
  [
   " * NFRA ntrag gbby bireynl (C46, cbegrq sebz Tragyr Furyy i4.8.0 `yvo/ntrag-gbby-bireynl.gf`):",
   " *   3. cebwrpg `<pjq>/.cv/tragyr-nv/gbbyf.wfba`",
   " pbafg fbheprf:fgevat[]=[...qebcVaCnguf(pbasvtUbzr),wbva(pbasvtUbzr,\"gbbyf.wfba\"),wbva(pjq,\".cv\",\"tragyr-nv\",\"gbbyf.wfba\")];"
  ]
 ],
 [
  "src/review/delivery-preflight.ts",
  [
   " * Ersrerapr: tragyr-furyy yvo/erivrj-qryvirel-cersyvtug.gf naq"
  ]
 ],
 [
  "src/runtime/desktop-rpc.ts",
  [
   " * Frphevgl fgnapr (ERN bs Tragyr Furyy i4.8.0 `yvo/qrfxgbc-ecp.gf`): gur"
  ]
 ],
 [
  "src/runtime/guide-tour.ts",
  [
   "// Thvqrq gbhef: gur cher unys bs gur ersrerapr furyy'f tragyr-thvqr pbagenpg, cbegrq sbe NFRA. N"
  ]
 ],
 [
  "src/runtime/image-disk-cache.ts",
  [
   " * Guvf vf gur fgbentr pbagenpg qvfgvyyrq sebz gur Tragyr Furyy i4.8.0",
   " * `yvo/vzntr-qvfx-pnpur.gf` (frr bqq/rivqrapr/tragyr-furyy-i4.8.0-qrygn-erpbapvyvngvba.zq,",
   "/** Qrsnhyg pnpur ebbg: `KQT_PNPUR_UBZR/tragyr-furyy/vzntrf`, be `~/.pnpur/tragyr-furyy/vzntrf`. */",
   "  erghea wbva(onfr, \"tragyr-furyy\", \"vzntrf\");"
  ]
 ],
 [
  "src/runtime/reply-language-anchor.ts",
  [
   " * Cbeg bs Tragyr Furyy i4.8.0 yvo/ercyl-ynathntr-napube.gf.",
   " vs (pg === \"tragyr-gbqb-fgngr\" || pg === \"tragyr-gbqb-erzvaqre\") erghea gehr;"
  ]
 ],
 [
  "src/runtime/voice-dictation.ts",
  [
   " * Guvf vf gur yrtny-genafvgvba ybtvp qvfgvyyrq sebz gur Tragyr Furyy i4.8.0",
   " * `yvo/ibvpr-frffvba.gf` thneqf (frr bqq/rivqrapr/tragyr-furyy-i4.8.0-qrygn-erpbapvyvngvba.zq,"
  ]
 ],
 [
  "src/security/execution-surface-guard.ts",
  [
   " * Cbeg bs Tragyr Furyy i4.8.0 yvo/rkrphgvba-fhesnpr-thneq.gf."
  ]
 ],
 [
  "tests/image-disk-cache.test.ts",
  [
   "  nffreg.rdhny(qrsnhygPnpurEbbg({ KQT_PNPUR_UBZR: \"/kqt-pnpur\" }), wbva(\"/kqt-pnpur\", \"tragyr-furyy\", \"vzntrf\"));",
   "  nffreg.rdhny(qrsnhygPnpurEbbg({ UBZR: \"/snxr-ubzr\" }), wbva(\"/snxr-ubzr\", \".pnpur\", \"tragyr-furyy\", \"vzntrf\"));",
   "  nffreg.rdhny(qrsnhygPnpurEbbg({}), wbva(ubzrqve(), \".pnpur\", \"tragyr-furyy\", \"vzntrf\"));",
   "  nffreg.rdhny(qrsnhygPnpurEbbg({ KQT_PNPUR_UBZR: \"\" }), wbva(ubzrqve(), \".pnpur\", \"tragyr-furyy\", \"vzntrf\"));",
   "  nffreg.rdhny(qrsnhygPnpurEbbg({ KQT_PNPUR_UBZR: \"eryngvir/pnpur\" }), wbva(ubzrqve(), \".pnpur\", \"tragyr-furyy\", \"vzntrf\"));"
  ]
 ],
 [
  "tests/ordinary-review-assessment.test.ts",
  [
   " pbafg cnlybnq={fpurzn:\"tragyr-nv.erivrj-nffrffzrag/i1\",punatrq_cnguf:1,punatrq_yvarf:1,ernfbaf:[],pnaqvqngr:{xvaq:\"pheerag-punatrf\"},...qngn};",
   " pbafg fgqbhg=WFBA.fgevatvsl({fpurzn:\"tragyr-nv.erivrj-nffrffzrag/i1\",evfx:\"zrqvhz\",ernfbaf:[{pbqr:\"punatrq_svyrf\"}],punatrq_cnguf:1,punatrq_yvarf:12,pnaqvqngr:{xvaq:\"pheerag-punatrf\"}});",
   " pbafg fgqbhg=WFBA.fgevatvsl({fpurzn:\"tragyr-nv.erivrj-nffrffzrag/i1\",evfx:\"uvtu\",yrafrf:[\"eryvnovyvgl\",\"evfx\"],ernfbaf:[{pbqr:\"funerq_pbagenpg\"}],punatrq_cnguf:2,punatrq_yvarf:40,pnaqvqngr:{xvaq:\"pheerag-punatrf\"}});"
  ]
 ],
 [
  "tests/pi-process-runner.test.ts",
  [
   " njnvg zxqve(wbva(q,\".cv\",\"tragyr-nv\"),{erphefvir:gehr});",
   " njnvg jevgrSvyr(wbva(q,\".cv\",\"tragyr-nv\",\"gbbyf.wfba\"),WFBA.fgevatvsl({nqq:[\"terc\",\"ernq\"],erzbir:[\"ernq\"]}));",
   " njnvg zxqve(wbva(q,\".cv\",\"tragyr-nv\"),{erphefvir:gehr});",
   " njnvg jevgrSvyr(wbva(q,\".cv\",\"tragyr-nv\",\"gbbyf.wfba\"),WFBA.fgevatvsl({erzbir:[\"ernq\"]}));"
  ]
 ],
 [
  "tests/reply-language-anchor.test.ts",
  [
   "  nffreg.bx(vfCnffvirZrffntr({ phfgbzGlcr: \"tragyr-gbqb-fgngr\" }));",
   "   { phfgbzGlcr: \"tragyr-gbqb-fgngr\", pbagrag: \"fgngr\" },"
  ]
 ],
 [
  "tests/tool-overlay.test.ts",
  [
   " njnvg chgWfba(wbva(pjq,\".cv\",\"tragyr-nv\",\"gbbyf.wfba\"),{nqq:[\"onfu\"]});",
   " njnvg chgWfba(wbva(pjq,\".cv\",\"tragyr-nv\",\"gbbyf.wfba\"),{erzbir:[\"qrcybl\"]});",
   " njnvg chgWfba(wbva(pjq,\".cv\",\"tragyr-nv\",\"gbbyf.wfba\"),{nqq:[\"cebwrpg\"],erzbir:[\"funerq\"]});",
   " njnvg chgWfba(wbva(pjq,\".cv\",\"tragyr-nv\",\"gbbyf.wfba\"),{nqq:[\"qrcybl\"]});",
   " njnvg chgWfba(wbva(pjq,\".cv\",\"tragyr-nv\",\"gbbyf.wfba\"),{nqq:[\"qrcybl\"]});",
   " njnvg chgWfba(wbva(pjq,\".cv\",\"tragyr-nv\",\"gbbyf.wfba\"),{});",
   " njnvg chgWfba(wbva(pjq,\".cv\",\"tragyr-nv\",\"gbbyf.wfba\"),{nqq:[\"qrcybl\"],erzbir:[\"onfu\"]});"
  ]
 ]
]);
function decodeLine(text) {
 return text.replace(/[A-Za-z]/g, ch => String.fromCharCode(
  ch.charCodeAt(0) + (ch.toLowerCase() < "n" ? 13 : -13)));
}
export function isPinnedReferenceDocument(path) {
 return exactProvenanceDocs.has(path);
}
export function maskApprovedReferenceTokens(path, content) {
 const approved = encodedCompatibilityLines.get(path);
 let result = maskApprovedWireSchemas(path, content);
 if (!approved) return result;
 const counts = new Map();
 for (const line of approved.map(decodeLine)) counts.set(line, (counts.get(line) ?? 0) + 1);
 result = result.split("\n").map(line => {
  // Git may materialize CRLF on Windows. Retain the strict line identity
  // apart from that platform-owned line ending.
  const comparable = line.endsWith("\r") ? line.slice(0, -1) : line;
  const previous = counts.get(comparable) ?? 0;
  if (previous === 0) return line;
  counts.set(comparable, previous - 1);
  // Mask only an unchanged, counted, known line, never a whole source file.
  return line.replace(new RegExp(["gen"+"tle","gen"+"tleman","eng"+"ram"].join("|"), "giu"), "<approved-compat>");
 }).join("\n");
 return result;
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
