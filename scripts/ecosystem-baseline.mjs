import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";
import {validateMediaManifest,verifyMediaBytes} from "./ecosystem-media.mjs";

export const digest = value => createHash("sha256").update(value).digest("hex");
const objectId = value => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const safePath = value => typeof value === "string" && value.length > 0 && value.length < 1024 &&
  !/[\\\u0000-\u001f\u007f]/.test(value) && !path.posix.isAbsolute(value) &&
  value.split("/").every(part => part && part !== "." && part !== "..");
const sortedUnique = values => [...new Set(values)].sort();
const families = ["ask-user","code-intelligence","agents","orchestrator","workspace","todo","history","presentation","resume","metrics","skill-registry","launcher","documentation","media","package","support"];
const visibilities = ["public-interface","supporting-source","media-comparison-only","package-metadata"];
function sourceClassification(filename) {
  if (/\.(?:svg|png|gif)$/.test(filename)) return {family:"media",visibility:"media-comparison-only"};
  if (filename === "package.json") return {family:"package",visibility:"package-metadata"};
  if (filename.endsWith(".md")) return {family:"documentation",visibility:"public-interface"};
  const rules = [[/ask-user|questionnaire/,"ask-user"],[/codegraph/,"code-intelligence"],[/history/,"history"],
    [/skill-registry/,"skill-registry"],[/metrics|telemetry/,"metrics"],[/profiles|routing|-ai\.ts$/,"orchestrator"],
    [/agents|agent-/,"agents"],[/todo/,"todo"],[/resume/,"resume"],[/banner|pretty|quiet/,"presentation"],
    [/launcher|^bin\//,"launcher"],[/-shell\.ts$|workspace|changes/,"workspace"]];
  return {family:rules.find(([pattern]) => pattern.test(filename))?.[1] ?? "support",visibility:filename.startsWith("extensions/") ? "public-interface" : "supporting-source"};
}
const git = (repository, args) => execFileSync("git", ["-C", repository, ...args], {
  env: {...process.env, GIT_NO_REPLACE_OBJECTS: "1"}, maxBuffer: 32 * 1024 * 1024,
});

export function sourceReferences(filename, bytes) {
  if (!/\.(?:[cm]?[jt]s|md)$/.test(filename)) return [];
  const text = new TextDecoder("utf-8", {fatal:true}).decode(bytes), references = [];
  if (filename.endsWith(".md")) {
    for (const match of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g))
      references.push({kind:"document", target:match[1]});
    for(const match of text.matchAll(/<(?:img|source)\b[^>]*\bsrc=["']([^"']+)["']/gi))references.push({kind:"asset",target:match[1]});
    for(const match of text.matchAll(/<(?:img|source)\b[^>]*\bsrcset=["']([^"']+)["']/gi))for(const item of match[1].split(","))references.push({kind:"asset",target:item.trim().split(/\s+/)[0]??null});
    for(const match of text.matchAll(/`\/(\w[\w-]*)(?:\s[^`]*)?`/g))references.push({kind:"command-reference",target:match[1]});
  } else {
    const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
    // Bind symbols with TypeScript rather than approximating lexical/hoisting rules.
    // This virtual host reads no checkout files, libraries or dependency modules.
    const host={getSourceFile:name=>name===filename?source:undefined,getDefaultLibFileName:()=>"lib.d.ts",writeFile(){},
      getCurrentDirectory:()=>"",getDirectories:()=>[],fileExists:name=>name===filename,readFile:name=>name===filename?text:undefined,
      getCanonicalFileName:name=>name,useCaseSensitiveFileNames:()=>true,getNewLine:()=>"\n"};
    const checker=ts.createProgram([filename],{noLib:true,noResolve:true},host).getTypeChecker();
    const diagnosticReference=(kind,target,reason="computed")=>target===null?{kind,target,reason}:{kind,target};
    const literal=node=>{
      if(node&&ts.isStringLiteralLike(node))return node.text;
      if(!node||!ts.isIdentifier(node))return null;
      const declarations=checker.getSymbolAtLocation(node)?.declarations;
      if(declarations?.length!==1)return null;
      const declaration=declarations[0];
      return ts.isVariableDeclaration(declaration)&&ts.isVariableDeclarationList(declaration.parent)&&(declaration.parent.flags&ts.NodeFlags.Const)&&
        declaration.initializer&&ts.isStringLiteralLike(declaration.initializer)?declaration.initializer.text:null;
    };
    const visit = node => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
        references.push({kind:"import", target:node.moduleSpecifier.text});
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          ts.isIdentifier(node.expression) && node.expression.text === "require")) {
        const value = node.arguments[0];
        references.push(diagnosticReference("dynamic-import",value&&ts.isStringLiteralLike(value)?value.text:null));
      }
      if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)){
        const name=node.expression.name.text;
        if(name==="registerCommand"||name==="on")references.push(diagnosticReference(name==="on"?"event":"command",literal(node.arguments[0])));
        if(name==="registerTool"){
          const arg=node.arguments[0],property=arg&&ts.isObjectLiteralExpression(arg)?arg.properties.find(p=>ts.isPropertyAssignment(p)&&(ts.isIdentifier(p.name)||ts.isStringLiteralLike(p.name))&&p.name.text==="name"):null;
          references.push(diagnosticReference("tool",property?literal(property.initializer):null));
        }
      }
      if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==="URL"){
        const base=node.arguments?.[1]?.getText(source);
        references.push(diagnosticReference("asset",base==="import.meta.url"?literal(node.arguments?.[0]):null));
      }
      if(ts.isCallExpression(node)&&["readFile","readFileSync","createReadStream"].includes(ts.isPropertyAccessExpression(node.expression)?node.expression.name.text:ts.isIdentifier(node.expression)?node.expression.text:"")){
        // Even a literal argument is resolved against runtime cwd, not the source file.
        references.push(diagnosticReference("asset",null,"cwd-dependent"));
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return references.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en"));
}

function anchors(filename, bytes) {
  if (!/\.(?:[cm]?[jt]s|md)$/.test(filename)) return [];
  const text = new TextDecoder("utf-8", {fatal:true}).decode(bytes);
  const result=text.split(/\r?\n/).flatMap((line, index) =>
    /^(?:#{1,6}\s|export\s)|\b(?:registerTool|registerCommand|\.on)\s*\(/.test(line)
      ? [{line:index + 1, sha256:digest(line)}] : []);
  if(!filename.endsWith(".md")){
    const source=ts.createSourceFile(filename,text,ts.ScriptTarget.Latest,true);
    const visit=node=>{
      if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&["registerTool","registerCommand","on"].includes(node.expression.name.text)){
        const start=node.getStart(source),end=node.getEnd();
        result.push({line:source.getLineAndCharacterOfPosition(start).line+1,endLine:source.getLineAndCharacterOfPosition(end).line+1,kind:"public-contract",sha256:digest(text.slice(start,end))});
      }
      ts.forEachChild(node,visit);
    };visit(source);
  }
  return result;
}

function resolveReference(from, reference, inventory, dependencies,commands=new Map()) {
  if (reference.target === null) return {...reference, status:"unresolved", path:null};
  const target = reference.target;
  if(["command","tool","event"].includes(reference.kind))return {...reference,status:"declared",path:from};
  if(reference.kind==="command-reference")return {...reference,status:commands.has(target)?"registered":"unresolved",path:commands.get(target)??null};
  if (target.startsWith("#")) return {...reference, status:"fragment", path:from};
  if (/^(?:https?:|mailto:|data:)/.test(target)) return {...reference, status:"external", path:null};
  if (["import","dynamic-import"].includes(reference.kind) && !target.startsWith(".")) {
    const name = target.startsWith("@") ? target.split("/").slice(0,2).join("/") : target.split("/")[0];
    const status = target.startsWith("node:") ? "builtin" : dependencies.has(name) ? "dependency" : "unresolved";
    return {...reference, status, path:null};
  }
  let decoded;
  try { decoded = decodeURIComponent(target.split(/[?#]/)[0]); }
  catch { return {...reference, status:"unresolved", path:null}; }
  if(path.posix.isAbsolute(decoded)||/^[A-Za-z]:/.test(decoded)||decoded.includes("\\"))return {...reference,status:"outside-root",path:null};
  const relative = path.posix.normalize(path.posix.join(path.posix.dirname(from), decoded));
  if (!safePath(relative)) return {...reference, status:"outside-root", path:null};
  const candidates = [relative, relative.replace(/\.js$/, ".ts"), ...[".ts", ".mjs", ".js", "/index.ts", "/index.js"].map(suffix => relative + suffix)];
  const found = candidates.find(candidate => inventory.has(candidate));
  return {...reference, status:found ? "tracked" : "absent", path:found ?? relative};
}

/** Reads immutable Git objects only. Checkout files, symlinks and untracked inputs are never followed. */
export function collectBaseline(repository, commit) {
  if (!objectId(commit)) throw new Error("An exact Git commit identity is required");
  if (git(repository, ["cat-file", "-t", commit]).toString().trim() !== "commit") throw new Error("Baseline must name a commit");
  const inventory = new Map();
  for (const entry of git(repository, ["ls-tree", "-rz", commit]).toString("utf8").split("\0").filter(Boolean)) {
    const match = /^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/.exec(entry);
    if (!match || !safePath(match[4])) throw new Error("Unsafe tracked source path");
    inventory.set(match[4], {mode:match[1], type:match[2], objectId:match[3]});
  }
  const packageEntry = inventory.get("package.json");
  const metadata = packageEntry ? JSON.parse(git(repository, ["cat-file", "blob", packageEntry.objectId])) : {};
  const dependencyNames = sortedUnique(["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap(key => Object.keys(metadata[key] ?? {})));
  const dependencySpecs = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap(kind =>
    Object.entries(metadata[kind] ?? {}).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([name,spec]) => ({kind,name,spec})));
  const roots = [...inventory.keys()].filter(filename => filename.startsWith("extensions/") || filename.startsWith("docs/") ||
    filename === "README.md" || filename === "package.json" || filename.startsWith("bin/") ||
    filename.startsWith("assets/") && /\.(?:svg|png|gif)$/.test(filename)).sort();
  const pending = [...roots], rows = new Map();
  while (pending.length) {
    const filename = pending.shift();
    if (rows.has(filename)) continue;
    const entry = inventory.get(filename);
    if (!entry || entry.type !== "blob" || entry.mode !== "100644" && entry.mode !== "100755")
      throw new Error("Only tracked regular source blobs may enter the baseline");
    const bytes = git(repository, ["cat-file", "blob", entry.objectId]);
    const references = sourceReferences(filename, bytes).map(({kind,target}) => resolveReference(filename, {kind,target}, inventory, new Set(dependencyNames)));
    rows.set(filename, {id:`ECO-SRC-${digest(filename).slice(0,16)}`,path:filename,...sourceClassification(filename), ...entry, bytes:bytes.length, sha256:digest(bytes), anchors:anchors(filename, bytes), references});
    for (const reference of references) if (reference.status === "tracked" && !rows.has(reference.path)) pending.push(reference.path);
  }
  const commands=new Map();
  for(const row of [...rows.values()].sort((a,b)=>a.path.localeCompare(b.path,"en")))for(const ref of row.references)if(ref.kind==="command"&&ref.target!==null&&!commands.has(ref.target))commands.set(ref.target,row.path);
  for(const row of rows.values())row.references=row.references.map(ref=>resolveReference(row.path,ref,inventory,new Set(dependencyNames),commands));
  return {version:1, commit, tree:git(repository, ["rev-parse", `${commit}^{tree}`]).toString().trim(),
    dependencyNames, dependencySpecs, roots, files:[...rows.values()].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)};
}

export function validateBaseline(value) {
  const issues = [];
  if (!value || value.version !== 1 || !objectId(value.commit) || !objectId(value.tree) ||
      !Array.isArray(value.files) || !value.files.length || !Array.isArray(value.roots) || !Array.isArray(value.dependencyNames) || !Array.isArray(value.dependencySpecs))
    return ["Invalid ecosystem baseline envelope"];
  const files = new Map();
  const sourceIds = new Set();
  const dependencyName = name => typeof name === "string" && /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name);
  if (value.dependencyNames.some(name => !dependencyName(name)) ||
      JSON.stringify(sortedUnique(value.dependencyNames)) !== JSON.stringify(value.dependencyNames)) issues.push("Invalid dependency names");
  if (value.dependencySpecs.some(row => !row || !["dependencies","devDependencies","peerDependencies","optionalDependencies"].includes(row.kind) ||
      !dependencyName(row.name) || typeof row.spec !== "string" || !row.spec.trim())) issues.push("Invalid dependency specification");
  if (new Set(value.dependencySpecs.map(row => `${row?.kind}:${row?.name}`)).size !== value.dependencySpecs.length) issues.push("Duplicate dependency specification");
  if (JSON.stringify(sortedUnique(value.dependencySpecs.map(row => row?.name))) !== JSON.stringify(value.dependencyNames)) issues.push("Dependency name/specification mismatch");
  for (const row of value.files) {
    if (!row || !safePath(row.path) || files.has(row.path)) { issues.push("Unsafe or duplicate source path"); continue; }
    files.set(row.path,row);
    if(row.id!==`ECO-SRC-${digest(row.path).slice(0,16)}`||sourceIds.has(row.id)||!families.includes(row.family)||!visibilities.includes(row.visibility))issues.push(`Invalid source classification/ID: ${row.path}`);
    sourceIds.add(row.id);
    if (row.type !== "blob" || !["100644", "100755"].includes(row.mode) || !objectId(row.objectId) ||
        !Number.isSafeInteger(row.bytes) || row.bytes < 0 || !/^[a-f0-9]{64}$/.test(row.sha256) ||
        !Array.isArray(row.anchors) || !Array.isArray(row.references)) issues.push(`Invalid source identity: ${row.path}`);
    for (const anchor of Array.isArray(row.anchors) ? row.anchors : []) if (!anchor || !Number.isSafeInteger(anchor.line) || anchor.line < 1 || !/^[a-f0-9]{64}$/.test(anchor.sha256)||
      anchor.kind!==undefined&&(anchor.kind!=="public-contract"||!Number.isSafeInteger(anchor.endLine)||anchor.endLine<anchor.line)) issues.push(`Invalid anchor: ${row.path}`);
  }
  for (const root of value.roots) if (!safePath(root) || !files.has(root)) issues.push("Missing root source");
  if (sortedUnique(value.roots).length !== value.roots.length) issues.push("Duplicate source roots");
  const commands=new Map();for(const row of files.values())for(const ref of Array.isArray(row.references)?row.references:[])if(ref?.kind==="command"&&typeof ref.target==="string"&&!commands.has(ref.target))commands.set(ref.target,row.path);
  const statuses = new Set(["tracked", "fragment", "external", "builtin", "dependency", "unresolved", "outside-root", "absent","declared","registered"]);
  for (const row of files.values()) for (const ref of Array.isArray(row.references) ? row.references : []) {
    if (!ref || !statuses.has(ref.status) || !["import", "dynamic-import", "document","asset","command","tool","event","command-reference"].includes(ref.kind) ||
        ref.target !== null && typeof ref.target !== "string") { issues.push("Invalid source reference"); continue; }
    if (ref.target === null && (ref.kind === "import"||ref.kind === "document"||ref.status !== "unresolved")) issues.push("Only unresolved computed references may omit a literal target");
    if (ref.status === "tracked" && (!safePath(ref.path) || !files.has(ref.path))) issues.push(`Broken tracked closure: ${row.path}`);
    if (ref.status === "fragment" && ref.path !== row.path) issues.push("Invalid fragment binding");
    const expected = resolveReference(row.path,ref,files,new Set(value.dependencyNames),commands);
    if (expected.status !== ref.status || expected.path !== ref.path) issues.push(`Reference resolution mismatch: ${row.path}`);
  }
  const reachable = new Set(), pending = [...value.roots];
  while (pending.length) {
    const current = pending.pop(); if (reachable.has(current)) continue; reachable.add(current);
    const refs = files.get(current)?.references;
    for (const ref of Array.isArray(refs) ? refs : []) if (ref?.status === "tracked") pending.push(ref.path);
  }
  if ([...files.keys()].some(filename => !reachable.has(filename))) issues.push("Unreachable source in closure");
  return issues;
}

/** Reads one manifest-selected immutable blob; use verifyBaselineObjects for whole-baseline commit/tree provenance. */
export function readBaselineSourceBytes(repository, baseline, sourceId) {
  if (validateBaseline(baseline).length) throw new Error("Malformed ecosystem baseline");
  const row = baseline.files.find(candidate => candidate.id === sourceId);
  if (!row) throw new Error(`Unknown baseline source ID: ${sourceId}`);
  const bytes = git(repository, ["cat-file", "blob", row.objectId]);
  if (bytes.length !== row.bytes || digest(bytes) !== row.sha256)
    throw new Error(`Baseline source byte identity mismatch: ${sourceId}`);
  return bytes;
}

/** Rename is reported only for an unambiguous one-to-one exact-content match. Never mutates or adopts a source. */
export function detectBaselineDrift(before, after) {
  for (const value of [before,after]) if (validateBaseline(value).length) throw new Error("Cannot compare malformed baselines");
  const old = new Map(before.files.map(row => [row.path,row])), next = new Map(after.files.map(row => [row.path,row]));
  const removed = before.files.filter(row => !next.has(row.path)), added = after.files.filter(row => !old.has(row.path)), changes = [];
  const renamedOld = new Set(), renamedNew = new Set();
  for (const row of removed) {
    const matches = added.filter(candidate => candidate.sha256 === row.sha256);
    if (matches.length === 1 && removed.filter(candidate => candidate.sha256 === row.sha256).length === 1) {
      changes.push({kind:"RENAMED", path:row.path, to:matches[0].path}); renamedOld.add(row.path); renamedNew.add(matches[0].path);
    }
  }
  for (const row of removed) if (!renamedOld.has(row.path)) changes.push({kind:"REMOVED", path:row.path});
  for (const row of added) if (!renamedNew.has(row.path)) changes.push({kind:"ADDED", path:row.path});
  for (const row of after.files) {
    const previous = old.get(row.path); if (!previous) continue;
    if (previous.sha256 !== row.sha256 || previous.mode !== row.mode) changes.push({kind:"CONTENT_CHANGED",path:row.path});
    if (JSON.stringify(previous.anchors) !== JSON.stringify(row.anchors)) changes.push({kind:"ANCHORS_CHANGED",path:row.path});
    if (JSON.stringify(previous.references) !== JSON.stringify(row.references)) changes.push({kind:"REFERENCES_CHANGED",path:row.path});
  }
  if (JSON.stringify(before.dependencySpecs) !== JSON.stringify(after.dependencySpecs)) changes.push({kind:"DEPENDENCIES_CHANGED",path:"package.json"});
  const invalidated = new Set(changes.flatMap(change => [change.path,...(change.to ? [change.to] : [])]));
  let addedDependent = true;
  while (addedDependent) {
    addedDependent = false;
    for (const row of [...before.files,...after.files]) if (!invalidated.has(row.path) &&
      (invalidated.has("package.json") || row.references.some(ref => ["tracked","registered"].includes(ref.status) && invalidated.has(ref.path)))) {
      invalidated.add(row.path); addedDependent = true;
    }
  }
  return {from:before.commit, to:after.commit, autoAdopt:false, changes:changes.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en")),
    invalidatedPaths:sortedUnique([...invalidated])};
}

export function verifyBaselineObjects(repository, baseline) {
  if (validateBaseline(baseline).length) throw new Error("Malformed ecosystem baseline");
  const actual = collectBaseline(repository, baseline.commit);
  if (JSON.stringify(actual) !== JSON.stringify(baseline)) throw new Error("Baseline does not match pinned Git objects");
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const baseline = JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-sources-v1.json",import.meta.url),"utf8"));
  const issues = validateBaseline(baseline);
  const media = JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-media-v1.json",import.meta.url),"utf8"));
  issues.push(...validateMediaManifest(baseline,media));
  if (issues.length) throw new Error(issues.join("\n"));
  if (process.argv[2]) {
    verifyBaselineObjects(process.argv[2],baseline);
    for (const row of media.sources) {
      const source=baseline.files.find(file=>file.path===row.path);
      verifyMediaBytes(source,row,git(process.argv[2],["cat-file","blob",source.objectId]));
    }
  }
  if (process.argv[3]) console.log(JSON.stringify(detectBaselineDrift(baseline,collectBaseline(process.argv[2],process.argv[3])),null,2));
  console.log(`ecosystem baseline: PASS (${baseline.files.length} tracked objects; SOURCE_INSPECTED, not runtime parity)`);
}
