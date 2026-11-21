import {execFileSync} from "node:child_process";
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
  // Estudios humanos de procedencia P16/CTX (no conceden excepciones a código).
  "docs/audit/opt-contexto-skills-asen-2026-11-20.md",
  "docs/audit/p16-"+providerTerm+"-4.9.0-18-sesiones-2026-11-20.md",
  "docs/audit/plan-final-opt-investigacion-avanzada-2026-11-20.md",
  "docs/plan-final-opt-contexto-y-agentes-2026-11-20.md",
  "docs/portable-checkpoint.md",
  "docs/remote-continuation.md",
  // Pinned human-readable Shell architecture study; not executable or imported source.
  "docs/"+"gen"+"tle-shell-architecture-and-execution-flow.md",
  "docs/runtime-tools.md",
  "odd/evidence/asen-"+providerTerm+"-shell-full-equivalence-final-refinement.md",
  "odd/evidence/asen-"+providerTerm+"-shell-per-point-matrix.md",
  "odd/evidence/asen-4.8.0-comparison/comparison.md",
  "odd/evidence/asen-4.8.0-comparison/"+providerTerm+"-shell-4.8.0-steady.ansi",
  "odd/evidence/asen-4.8.0-comparison/"+providerTerm+"-shell-4.8.0-steady.txt",
  "odd/evidence/portable-checkpoint-evidence.json",
  "odd/evidence/portable-checkpoint-manifest.json",
  // Exact ODD comparison dossier; textual provenance only, never executable code.
  // Archivos documentales antiguos; cada ruta conserva su excepción exacta.
  // No se permite ningún directorio completo ni código ejecutable archivado.
  "odd/archive/2026-11/flujo-de-agentes.md",
  "odd/archive/2026-11/flujo-de-agentes-continuidad.md",
  "odd/archive/2026-11/flujo-de-agentes-auditoria-plan-2026-11-19.md",
  "odd/archive/2026-11/flujo-agentes-18-puntos-cierre-20261119.md",
  "odd/tasks/flujo-de-agentes.md",
  // G49-A: exact human-readable comparison dossier. No runtime or test exception.
  "odd/tasks/flujo-de-agentes-"+providerTerm+"-shell-4.9.0-investigacion.md",
  // Auditoría comparativa humana exacta; no incluye código ejecutable o excepciones por prefijo.
  "odd/tasks/flujo-de-agentes-comparativa-actual-4.9.0.md",
  // Plan rector exacto: trazabilidad documental, nunca una excepción de código ejecutable.
  "odd/tasks/flujo-de-agentes-plan-implantacion-4.9.0.md",
  // Auditoría documental exacta de las 18 tareas; no permite código ni directorios completos.
  "odd/tasks/flujo-de-agentes-auditoria-plan-2026-11-19.md",
  // Estado documental exacto de los 18 objetivos; no abre permisos a otros archivos.
  "odd/tasks/flujo-de-agentes-estado-18-objetivos.md",
  // Registro de cierre exacto de los 18 puntos; documento humano, no código.
  "odd/tasks/flujo-agentes-18-puntos-cierre-20261119.md",
  // Plan de ejecución de megatandas de PR #61; documento humano, no código.
  "odd/tasks/pr61-18-puntos-megatandas-a-e.md",
  // Matriz de equivalencia previa, documento exacto de planificación, nunca código.
  "odd/tasks/flujo-de-agentes-equivalencia-operativa-4.9.0.md",
  // T11: trazabilidad humana de layout, no código ejecutable ni un import.
  "odd/tasks/flujo-de-agentes-continuidad.md",
  "odd/tasks/flujo-de-agentes-t11-layout-"+providerTerm+"-shell-4.8.0.md",
  // Pinned static product objective; never exempts runtime sources.
  "odd/tasks/flujo-de-agentes-objetivo.md",
  "odd/tasks/asen-focus-experience.md",
  "odd/tasks/asen-integral-runtime-architecture-stability-audit.md",
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
  "src/runtime/ui/desktop-rpc.ts",
  [
   " * Frphevgl fgnapr (ERN bs Tragyr Furyy i4.8.0 `yvo/qrfxgbc-ecp.gf`): gur"
  ]
 ],
 [
  "src/runtime/ui/guide-tour.ts",
  [
   "// Thvqrq gbhef: gur cher unys bs gur ersrerapr furyy'f tragyr-thvqr pbagenpg, cbegrq sbe NFRA. N"
  ]
 ],
 [
  "src/runtime/ui/image-disk-cache.ts",
  [
   " * Guvf vf gur fgbentr pbagenpg qvfgvyyrq sebz gur Tragyr Furyy i4.8.0",
   " * `yvo/vzntr-qvfx-pnpur.gf` (frr bqq/rivqrapr/tragyr-furyy-i4.8.0-qrygn-erpbapvyvngvba.zq,",
   "/** Qrsnhyg pnpur ebbg: `KQT_PNPUR_UBZR/tragyr-furyy/vzntrf`, be `~/.pnpur/tragyr-furyy/vzntrf`. */",
   "  erghea wbva(onfr, \"tragyr-furyy\", \"vzntrf\");"
  ]
 ],
 [
  "src/runtime/ui/reply-language-anchor.ts",
  [
   " * Cbeg bs Tragyr Furyy i4.8.0 yvo/ercyl-ynathntr-napube.gf.",
   " vs (pg === \"tragyr-gbqb-fgngr\" || pg === \"tragyr-gbqb-erzvaqre\") erghea gehr;"
  ]
 ],
 [
  "src/runtime/ui/voice-dictation.ts",
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
   " njnvg jevgrSvyr(wbva(q,\".cv\",\"tragyr-nv\",\"gbbyf.wfba\"),WFBA.fgevatvsl({erzbir:[\"ernq\"]}));",
   // Dos pruebas de permisos reutilizan el esquema de configuración heredado.
   // Solo estos renglones exactos de fixtures son compatibles; no son un bypass
   // para referencias nuevas en código de producción.
   " njnvg zxqve(wbva(q,\".cv\",\"tragyr-nv\"),{erphefvir:gehr});",
   " njnvg jevgrSvyr(wbva(q,\".cv\",\"tragyr-nv\",\"gbbyf.wfba\"),WFBA.fgevatvsl({",
   " njnvg zxqve(wbva(q,\".cv\",\"tragyr-nv\"),{erphefvir:gehr});",
   " njnvg jevgrSvyr(wbva(q,\".cv\",\"tragyr-nv\",\"gbbyf.wfba\"),WFBA.fgevatvsl({"
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
/**
 * Wiring truth for every approved compatibility entry.
 *
 * `kind: "production"` - the entry is a shipped module.
 *   `wired: true`  - a production module imports the declared port, so the port is
 *                    reachable from a real entry point.
 *   `wired: false` - the entry is ported text with no live consumer. It must never be
 *                    cited as demonstrated parity or as a delivered runtime guarantee.
 * `kind: "test"` - the upstream token appears only as fixture text in the owning test.
 *   It is not a parity claim and is never reported as unwired production code.
 *
 * `compatibilityEntriesWithoutWiring` keeps this declaration honest: a new approved
 * entry cannot be added to the mask map without stating its kind and wiring.
 */
const compatibilityWiring = new Map([
 ["src/agents/tool-overlay.ts", { kind: "production", wired: true, consumer: "src/agents/pi-process-runner.ts" }],
 ["src/review/delivery-preflight.ts", { kind: "production", wired: true, consumer: "src/security/primary-tool-policy.ts" }],
 ["src/runtime/ui/desktop-rpc.ts", { kind: "production", wired: false, consumer: null }],
 ["src/runtime/ui/guide-tour.ts", { kind: "production", wired: false, consumer: null }],
 ["src/runtime/ui/image-disk-cache.ts", { kind: "production", wired: false, consumer: null }],
 ["src/runtime/ui/reply-language-anchor.ts", { kind: "production", wired: false, consumer: null }],
 ["src/runtime/ui/voice-dictation.ts", { kind: "production", wired: false, consumer: null }],
 ["src/security/execution-surface-guard.ts", { kind: "production", wired: true, consumer: "src/security/primary-tool-policy.ts" }],
 ["tests/image-disk-cache.test.ts", { kind: "test", wired: false, consumer: null }],
 ["tests/ordinary-review-assessment.test.ts", { kind: "test", wired: false, consumer: null }],
 ["tests/pi-process-runner.test.ts", { kind: "test", wired: false, consumer: null }],
 ["tests/reply-language-anchor.test.ts", { kind: "test", wired: false, consumer: null }],
 ["tests/tool-overlay.test.ts", { kind: "test", wired: false, consumer: null }],
]);

/** Wiring declaration for an approved compatibility entry, or null when undeclared. */
export function compatibilityWiringOf(path) {
 return compatibilityWiring.get(path) ?? null;
}

/** Approved production entries that exist only as ported text, sorted. */
export function listUnwiredCompatibilityEntries() {
 return [...compatibilityWiring]
  .filter(([, state]) => state.kind === "production" && !state.wired)
  .map(([path]) => path)
  .sort();
}

/** Every approved compatibility entry, sorted. */
export function listCompatibilityEntries() {
 return [...encodedCompatibilityLines.keys()].sort();
}

/** Approved entries that declare no wiring at all; must stay empty. */
export function compatibilityEntriesWithoutWiring() {
 return [...encodedCompatibilityLines.keys()].filter(path => !compatibilityWiring.has(path)).sort();
}

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


// Calcula la huella Git del contenido SIN modificar el árbol real.
// El mismo comprobador se usa en la auditoría y en las pruebas negativas.
export function coincideHuellaGit(bytes,expectedSha,path,root=process.cwd()){
 if(!Buffer.isBuffer(bytes)||typeof expectedSha!=="string"||!/^[a-f0-9]{40}$/u.test(expectedSha)||
  typeof path!=="string"||!path||! /^[a-zA-Z0-9._/-]+$/u.test(path)||
  path.startsWith("/")||path.includes(".."))return false;
 try{
  // La opción --path aplica exactamente los filtros Git del archivo:
  // en Windows convierte CRLF del árbol de trabajo al blob original.
  // El contenido alterado se pasa por stdin: no escribimos nunca en disco.
  const actual=execFileSync("git",["hash-object","--path="+path,"--stdin"],{
   cwd:root,input:bytes,encoding:"utf8",timeout:10_000,windowsHide:true
  }).trim();
  return actual===expectedSha;
 }catch{return false;}
}
