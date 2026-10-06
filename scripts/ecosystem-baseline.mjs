import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";

const digest = value => createHash("sha256").update(value).digest("hex");
const objectId = value => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const safePath = value => typeof value === "string" && value.length > 0 && value.length < 1024 &&
  !/[\\\u0000-\u001f\u007f]/.test(value) && !path.posix.isAbsolute(value) &&
  value.split("/").every(part => part && part !== "." && part !== "..");
const sortedUnique = values => [...new Set(values)].sort();
const git = (repository, args) => execFileSync("git", ["-C", repository, ...args], {
  env: {...process.env, GIT_NO_REPLACE_OBJECTS: "1"}, maxBuffer: 32 * 1024 * 1024,
});

export function sourceReferences(filename, bytes) {
  if (!/\.(?:[cm]?[jt]s|md)$/.test(filename)) return [];
  const text = new TextDecoder("utf-8", {fatal:true}).decode(bytes), references = [];
  if (filename.endsWith(".md")) {
    for (const match of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g))
      references.push({kind:"document", target:match[1]});
  } else {
    const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
    const visit = node => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
        references.push({kind:"import", target:node.moduleSpecifier.text});
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          ts.isIdentifier(node.expression) && node.expression.text === "require")) {
        const value = node.arguments[0];
        references.push({kind:"dynamic-import", target:value && ts.isStringLiteralLike(value) ? value.text : null});
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
  return text.split(/\r?\n/).flatMap((line, index) =>
    /^(?:#{1,6}\s|export\s)|\b(?:registerTool|registerCommand|\.on)\s*\(/.test(line)
      ? [{line:index + 1, sha256:digest(line)}] : []);
}

function resolveReference(from, reference, inventory, dependencies) {
  if (reference.target === null) return {...reference, status:"unresolved", path:null};
  const target = reference.target;
  if (target.startsWith("#")) return {...reference, status:"fragment", path:from};
  if (/^(?:https?:|mailto:|data:)/.test(target)) return {...reference, status:"external", path:null};
  if (reference.kind !== "document" && !target.startsWith(".")) {
    const name = target.startsWith("@") ? target.split("/").slice(0,2).join("/") : target.split("/")[0];
    const status = target.startsWith("node:") ? "builtin" : dependencies.has(name) ? "dependency" : "unresolved";
    return {...reference, status, path:null};
  }
  let decoded;
  try { decoded = decodeURIComponent(target.split(/[?#]/)[0]); }
  catch { return {...reference, status:"unresolved", path:null}; }
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
    const references = sourceReferences(filename, bytes).map(reference => resolveReference(filename, reference, inventory, new Set(dependencyNames)));
    rows.set(filename, {path:filename, ...entry, bytes:bytes.length, sha256:digest(bytes), anchors:anchors(filename, bytes), references});
    for (const reference of references) if (reference.status === "tracked" && !rows.has(reference.path)) pending.push(reference.path);
  }
  return {version:1, commit, tree:git(repository, ["rev-parse", `${commit}^{tree}`]).toString().trim(),
    dependencyNames, dependencySpecs, roots, files:[...rows.values()].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)};
}

export function validateBaseline(value) {
  const issues = [];
  if (!value || value.version !== 1 || !objectId(value.commit) || !objectId(value.tree) ||
      !Array.isArray(value.files) || !value.files.length || !Array.isArray(value.roots) || !Array.isArray(value.dependencyNames) || !Array.isArray(value.dependencySpecs))
    return ["Invalid ecosystem baseline envelope"];
  const files = new Map();
  if (value.dependencySpecs.some(row => !row || !["dependencies","devDependencies","peerDependencies","optionalDependencies"].includes(row.kind) ||
      typeof row.name !== "string" || typeof row.spec !== "string")) issues.push("Invalid dependency specification");
  for (const row of value.files) {
    if (!row || !safePath(row.path) || files.has(row.path)) { issues.push("Unsafe or duplicate source path"); continue; }
    files.set(row.path,row);
    if (row.type !== "blob" || !["100644", "100755"].includes(row.mode) || !objectId(row.objectId) ||
        !Number.isSafeInteger(row.bytes) || row.bytes < 0 || !/^[a-f0-9]{64}$/.test(row.sha256) ||
        !Array.isArray(row.anchors) || !Array.isArray(row.references)) issues.push(`Invalid source identity: ${row.path}`);
    for (const anchor of Array.isArray(row.anchors) ? row.anchors : []) if (!anchor || !Number.isSafeInteger(anchor.line) || anchor.line < 1 || !/^[a-f0-9]{64}$/.test(anchor.sha256)) issues.push(`Invalid anchor: ${row.path}`);
  }
  for (const root of value.roots) if (!safePath(root) || !files.has(root)) issues.push("Missing root source");
  if (sortedUnique(value.roots).length !== value.roots.length) issues.push("Duplicate source roots");
  const statuses = new Set(["tracked", "fragment", "external", "builtin", "dependency", "unresolved", "outside-root", "absent"]);
  for (const row of files.values()) for (const ref of Array.isArray(row.references) ? row.references : []) {
    if (!ref || !statuses.has(ref.status) || !["import", "dynamic-import", "document"].includes(ref.kind) ||
        ref.target !== null && typeof ref.target !== "string") { issues.push("Invalid source reference"); continue; }
    if (ref.status === "tracked" && (!safePath(ref.path) || !files.has(ref.path))) issues.push(`Broken tracked closure: ${row.path}`);
    if (ref.status === "fragment" && ref.path !== row.path) issues.push("Invalid fragment binding");
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
      (invalidated.has("package.json") || row.references.some(ref => ref.status === "tracked" && invalidated.has(ref.path)))) {
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
  if (issues.length) throw new Error(issues.join("\n"));
  if (process.argv[2]) verifyBaselineObjects(process.argv[2],baseline);
  if (process.argv[3]) console.log(JSON.stringify(detectBaselineDrift(baseline,collectBaseline(process.argv[2],process.argv[3])),null,2));
  console.log(`ecosystem baseline: PASS (${baseline.files.length} tracked objects; SOURCE_INSPECTED, not runtime parity)`);
}
