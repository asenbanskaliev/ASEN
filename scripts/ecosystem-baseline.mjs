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
const parseJson = (value, label) => {
  try { return JSON.parse(value); }
  catch { throw new Error(`Invalid ${label} JSON`); }
};

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
  const metadata = packageEntry ? parseJson(git(repository, ["cat-file", "blob", packageEntry.objectId]),"package metadata") : {};
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

const adjudicationCommit="08de420ca29be16b6f6bee725a30b599b061df16";
export const adjudicationSources=Object.freeze([
  {id:"ECO-SRC-5a67352cd4badb81",path:"extensions/skill-registry.ts",objectId:"3b889b0443654d9adfd13cb593c4234ba92f426e",bytes:19264,
    sha256:"c2bc82385042a019877ef376d3c8902c3d56739ac93a2089027de24a98fceb66",imports:[["node:fs/promises","readFile"]],calls:[
      [0,195,192,207,"optional-discovered-input"],[1,257,250,269,"optional-discovered-input"],
      [2,320,316,330,"generated-local-control"],[3,363,358,373,"legacy-generated-state"],[4,395,386,402,"generated-cache"],
    ]},
  {id:"ECO-SRC-1f527249710bd9bf",path:`extensions/${["gen","tle-ai.ts"].join("")}`,objectId:"a0fed68c1cd897700a3857cbe7ea4851891eddd0",bytes:467267,
    sha256:"c133aa14fe5b492776f1ef176145e5670692f5f391e4a694938fde628e445ecd",imports:[["node:fs","readFileSync"],["node:fs/promises","readFile"]],calls:[
      [0,277,250,296,"optional-discovered-input"],[1,278,250,296,"runtime-state-read"],
      [2,1120,1114,1127,"optional-discovered-input"],
      [3,1149,1146,1166,"optional-discovered-input"],[4,1157,1146,1166,"optional-discovered-input"],
      [5,1514,1496,1539,"optional-discovered-input"],[6,1522,1496,1539,"optional-discovered-input"],[7,1844,1841,1850,"optional-discovered-input"],
      [8,1939,1937,1943,"generated-local-control"],[9,2019,2016,2024,"generated-local-control"],[10,2029,2026,2034,"generated-local-control"],
      [11,2056,2042,2060,"optional-discovered-input"],[12,2076,2062,2080,"optional-discovered-input"],[13,2150,2147,2160,"optional-discovered-input"],
      [14,2167,2162,2177,"optional-discovered-input"],[15,2364,2355,2386,"generated-local-control"],[16,2397,2388,2419,"generated-local-control"],
      [17,2467,2464,2471,"generated-local-control"],[18,2502,2497,2533,"legacy-generated-state"],[19,2573,2550,2598,"optional-discovered-input"],
      [20,2624,2600,2649,"optional-discovered-input"],[21,4488,4484,4529,"optional-discovered-input"],
      [22,4984,4973,4985,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-396d124d7d28739b",path:"lib/review-candidate-view-owner.ts",objectId:"2ac65650a16603251e322167f416d30e37fbe404",bytes:25429,
    sha256:"537f4c57ff4b0a80c053a74ffd7df3305a62e41d3f0da200e54dc836789b578f",imports:[["node:fs","readFileSync"]],calls:[
      [0,88,83,94,"runtime-state-read"],[1,242,235,248,"runtime-state-read"],[2,376,372,381,"runtime-state-read"],
      [3,398,389,410,"runtime-state-read"],[4,406,389,410,"runtime-state-read"],[5,408,389,410,"runtime-state-read"],[6,428,427,429,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-f186dd2c4db26151",path:"lib/review-object-store.ts",objectId:"6a01687406b163cb94065943ce16b618090a7109",bytes:14486,
    sha256:"b723adb820da6c38abf4a0879e86405f1fa7cdaa7feb437187d42851d1c2c8c7",imports:[["node:fs","readFileSync"]],calls:[
      [0,74,73,75,"runtime-state-read"],[1,107,105,111,"runtime-state-read"],[2,117,113,122,"runtime-state-read"],
      [3,192,190,205,"runtime-state-read"],[4,202,190,205,"runtime-state-read"],[5,207,206,208,"runtime-state-read"],[6,219,219,219,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-b739ab592bf5a9d4",path:"lib/agent-assets.ts",objectId:"abc6060fd338b5882e6d5c7f4d1e52d052ae144b",bytes:20328,
    sha256:"f49c8011959c50d57702f0719c7b505d0a409b2b1034dbc4bfc6c5767bcab60a",imports:[["node:fs","readFileSync"]],calls:[
      [0,90,87,107,"generated-local-control"],[1,116,113,122,"generated-local-control"],[2,201,196,223,"legacy-generated-state"],
      [3,335,312,365,"runtime-state-read"],[4,387,376,393,"generated-cache"],[5,431,396,483,"optional-discovered-input"],
      [6,441,396,483,"runtime-state-read"],[7,525,510,546,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-6a14fc0f30199f89",path:["bin/","gen","tle-shell.mjs"].join(""),objectId:"e3d53d844ad0349d180bd950ff5338882c82803f",bytes:61683,
    sha256:"a29669355e55c663c06ae91a0f026e1a5a5f7465ce7438b74a70f4024b25fd84",imports:[["node:fs","readFileSync"]],calls:[
      [0,76,74,81,"runtime-state-read"],[1,119,118,122,"runtime-state-read"],[2,144,139,149,"optional-discovered-input"],
      [3,216,205,221,"optional-discovered-input"],[4,492,484,499,"runtime-state-read"],[5,517,501,527,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-6c28d7b99a511610",path:"extensions/startup-banner.ts",objectId:"44de38b41e2199f31cffbe60887456ab9324d185",bytes:42261,
    sha256:"209af4a17c43c7cd551c21aa48dd2db02f672ed9bcdabf14db2cef94dba716a8",imports:[["node:fs/promises","readFile"]],calls:[
      [0,95,91,107,"generated-local-control"],[1,112,110,116,"legacy-generated-state"],[2,541,535,549,"optional-discovered-input"],
      [3,687,684,698,"optional-discovered-input"],[4,704,700,718,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-1d4036c43d653569",path:"extensions/history/store.ts",objectId:"aaba0a693488b808f716224c43d1ddbbddf24ebc",bytes:38071,
    sha256:"42d9cd663a79b0cd7bc39aa01b92cb76dbadc2a5310102a0ec2cd9d9359a2f0c",imports:[],namespaceMembers:[["node:fs","fs","readFileSync"]],calls:[
      [0,90,88,104,"generated-local-control"],[1,291,287,301,"runtime-state-read"],[2,666,663,672,"runtime-state-read"],
      [3,725,720,734,"legacy-generated-state"],[4,795,789,807,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-625c38e8637ad8b0",path:"extensions/codegraph-tools.ts",objectId:"39f21cca79a50f02b25472e48d68c2a97e04a073",bytes:10707,
    sha256:"7d499bc7c70e9b7812bc03c373aafe766472ace6b95d036e0a585438ba35d0f7",imports:[["node:fs","readFileSync"]],calls:[
      [0,214,208,231,"source-runtime-edge","source-edge-requires-route-mapping"],
    ]},
  {id:"ECO-SRC-af1edc66cbd9834c",path:["extensions/","gen","tle-agents.ts"].join(""),objectId:"c6bf814ca8934bd26af5f0efb0c229029ca07155",bytes:81559,
    sha256:"ae4519a785297cce343c9e9d00e6070430c61343b9a502c032e8699176133388",imports:[["node:fs","readFileSync"],["node:fs/promises","readFile"]],calls:[
      [0,143,139,148,"runtime-state-read"],[1,924,921,928,"optional-discovered-input"],
    ]},
  {id:"ECO-SRC-e7463b7384c92f7e",path:"extensions/history/hide-prompts.ts",objectId:"e948e6d22fd889d392452a7456e05973f421795e",bytes:7347,
    sha256:"b7cdfe192e91f1557133a5c80ba96e41cdb5b1c4d1dbb5d42f5e7103103ed301",imports:[],namespaceMembers:[["node:fs","fs","readFileSync"]],calls:[
      [0,105,102,136,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-c65d631f8447d951",path:"extensions/history/load-shared-history.ts",objectId:"79ef12f7d03cf9659e19aec0558e8432f350d415",bytes:1130,
    sha256:"408736bcf2eb97214d4622854df361674f5b8eab95eb270a19911e2e8af59789",imports:[],namespaceMembers:[["node:fs","fs","readFileSync"]],calls:[
      [0,30,26,39,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-2ced978dd94675dd",path:"extensions/history/session-scan.ts",objectId:"accd302c7e8a0004e0f573539a8cdc987cf7b211",bytes:7692,
    sha256:"250a3db46eb790fefc794473d20a31e9dd9c6ea11887a343b808fe8e9757a7f6",imports:[],namespaceMembers:[["node:fs","fs","readFileSync"]],calls:[
      [0,153,150,196,"optional-discovered-input"],
    ]},
  {id:"ECO-SRC-e0cb838adc1cbe33",path:"lib/agent-profile-pin.ts",objectId:"4cb769e4d648e0dfb6fa2b9fd436dc1be27a2cdf",bytes:12682,
    sha256:"b52386805e6df3e15cf6a260cd0b7a1c3c6ec0113e90596fc2652b0dc4159576",imports:[["node:fs","readFileSync"]],calls:[
      [0,164,161,169,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-a495fb043722ac5e",path:"lib/agent-profiles.ts",objectId:"f4c953460160b7198dd8d6293f9cb43050826ea6",bytes:18518,
    sha256:"6541e3da65f7f5576eec6edbabda6756ab3caafaae0d6560ceb3b2c5f08827f4",imports:[["node:fs","readFileSync"]],calls:[
      [0,503,499,512,"runtime-state-read"],[1,527,521,566,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-3042f3f3b753a8d3",path:"lib/agents-config.ts",objectId:"258818d1a8006a71fc45d2c6e0f7c9162aba2407",bytes:13456,
    sha256:"b9ecc81dd6c81950c43267176194c6f579288f934d8364da4e760b9089521975",imports:[["node:fs","readFileSync"]],calls:[
      [0,228,221,234,"optional-discovered-input"],[1,289,286,294,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-8f747258e5cd5fc4",path:"lib/agents-history.ts",objectId:"a7638b87502e3faa39f2561b606406c10acf0305",bytes:3248,
    sha256:"4c68989e2be7f511592c816e8fe685488eca5b0af048df65b3fccfc5e1e3be15",imports:[["node:fs/promises","readFile"]],calls:[
      [0,54,51,58,"runtime-state-read"],[1,70,70,70,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-99f45ace32d38853",path:"lib/animation-policy.ts",objectId:"4d1eef8567da4c5846256836bd480da1c89f8819",bytes:2602,
    sha256:"62096a8ab25d6dd475891ffc293cd1d104b044b2e01724b37db4402dc57b6370",imports:[["node:fs","readFileSync"]],calls:[
      [0,31,28,37,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-b16429b2f1c43e80",path:"lib/background-subagents-policy.ts",objectId:"51f7e03d5b2f0efa5983393d20148b991049aee0",bytes:5604,
    sha256:"69511d493640bdfa9dde7acfa341dbe291b2baf70da9de588ae5ea6b9b8f7920",imports:[["node:fs","readFileSync"]],calls:[
      [0,111,89,137,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-14fbaaebad5fbf58",path:"lib/double-esc-cancel-policy.ts",objectId:"1cb10b8ad700cefe849d9d9e11435093ecbd5d53",bytes:5901,
    sha256:"164e6a02fc420ca22b4a49c5d19fb66d154f4f1b9f93dd375d86a82e53341e08",imports:[["node:fs","readFileSync"]],calls:[
      [0,98,85,115,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-ecb5b4ebbaf005aa",path:["lib/","gen","tle-ai-binary.ts"].join(""),objectId:"780805490645c357be10b179ff1edd460038f21f",bytes:15683,
    sha256:"afe1984c6334ff774fbf69961675f2ccc9ea034cd36b3aa3b17632958a0cd553",imports:[["node:fs","readFileSync"]],calls:[
      [0,133,120,138,"source-runtime-edge","source-edge-requires-route-mapping"],[1,143,140,160,"generated-local-control"],
      [2,297,271,310,"source-runtime-edge","source-edge-requires-route-mapping"],
    ]},
  {id:"ECO-SRC-478700c7727f3fa5",path:"lib/history-capture-policy.ts",objectId:"3aa09bb83cf41caf6ad8dccf0ab0912e690ff43b",bytes:4766,
    sha256:"7c2c96859f2cff9888c0eec678ba414362af3954e08459ce96c05db2e48727a3",imports:[["node:fs","readFileSync"]],calls:[
      [0,51,48,57,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-f4f6b335bf2cf4e9",path:"lib/inprocess-reviewer.ts",objectId:"beea157aa1ad2f2c4e9e6c303e6064ea725aaaab",bytes:17838,
    sha256:"3f26a3bfe12e962bf968fcc546c0cdf4d700d3a9a8c180626f4e3729da2d4bf3",imports:[],calls:[],urlCalls:[
      [0,169,169,169,"source-runtime-edge","source-edge-requires-route-mapping"],
    ]},
  {id:"ECO-SRC-5c593be3e5de37fc",path:"lib/model-routing-authority.ts",objectId:"ee2a30c021e622853338e293506e5875b1a11be7",bytes:4062,
    sha256:"831db959b54c8a660da3adfba2a57ad7cc869abc2254ce9e981ff29f15435faf",imports:[["node:fs","readFileSync"],["node:fs/promises","readFile"]],calls:[
      [0,100,97,106,"runtime-state-read"],[1,113,108,119,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-95f9e4bcb7349c6c",path:"lib/profiles-orchestrator.ts",objectId:"ab880646610be52c963c4daf0703503ac62ba7dd",bytes:7469,
    sha256:"554ddea751d636ee35e9d06babb9bf4513930d7186fcf1fe23599b767e6c844a",imports:[["node:fs","readFileSync"]],calls:[
      [0,72,68,88,"runtime-state-read"],[1,137,135,141,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-ee431194e4155110",path:"lib/review-candidate-view.ts",objectId:"d803af7e0263dd8df374d1c7f18b4a60b93b5cb5",bytes:111266,
    sha256:"8f4ce05940375a03b24cefb517c9329b6a34bf2d978513dea6b784916012f15b",imports:[["node:fs","readFileSync"]],calls:[
      [0,619,606,620,"source-runtime-edge","source-edge-requires-route-mapping"],
    ]},
  {id:"ECO-SRC-23149aba854d628d",path:"lib/review-legacy-detector.ts",objectId:"aa8bca0e7affdc356315fa670e9a113ea83d8fee",bytes:5971,
    sha256:"973c48700ccc00e39f9109b977b7f9646878413031e8589b53baabc8ea100071",imports:[["node:fs","readFileSync"]],calls:[
      [0,63,38,69,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-3e823342741ef5c0",path:"lib/review-lock.ts",objectId:"18ed57d65f3b87936d83a94754a31d2c6611e0e0",bytes:11849,
    sha256:"593fc786e4e59d1c28bb94be918fb18a541a033e947dd97a0f3fe01c60f841e6",imports:[["node:fs","readFileSync"]],calls:[
      [0,208,202,213,"generated-local-control"],[1,218,215,225,"generated-local-control"],
    ]},
  {id:"ECO-SRC-d2566aa6315eb18e",path:"lib/review-repository.ts",objectId:"4f24a0a5d78c92e2398c19c65d20bb8a85031f19",bytes:15675,
    sha256:"3a4da310dddcde073ec5c935535594fdf0f3f7586c047692d623834345ca68d3",imports:[["node:fs","readFileSync"]],calls:[
      [0,170,166,190,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-0e66f5a77cddefce",path:"lib/review-snapshot.ts",objectId:"f22fc173a74e7161e3cc19fa4c660a558512cf88",bytes:15923,
    sha256:"c897b6245ff0da46db6de8016d3c797aaa79467d947a38074cae14283f644d7c",imports:[["node:fs","readFileSync"]],calls:[
      [0,266,262,289,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-6058ca4d664d9095",path:"lib/runtime-metrics-children.ts",objectId:"af5a725bad0b3841179e0572429fdcab1eb3189b",bytes:12081,
    sha256:"57a2f7e0ecf4d389330d6a6a4029ec808d5f8bd76f13d103444ca569bc8d8c48",imports:[["node:fs","readFileSync"]],calls:[
      [2,34,32,38,"optional-discovered-input"],
    ],urlCalls:[
      [1,33,32,38,"source-runtime-edge","source-edge-requires-route-mapping"],
    ]},
  {id:"ECO-SRC-dbf31123d00902ed",path:"lib/runtime-metrics.ts",objectId:"8c8fe7c8bb2af81a00fbffe7589c4fbc758806df",bytes:15942,
    sha256:"740b7b6f5e97f70caac1077beb0a652edfcaf4ecf2a9f892ca6ee6ff505f7f81",imports:[["node:fs","readFileSync"]],calls:[
      [1,3,1,6,"source-runtime-edge","source-edge-requires-route-mapping"],
    ]},
  {id:"ECO-SRC-e844fa5bcd5ca643",path:"lib/theme-customization.ts",objectId:"447728a1a64d277f20392d1577a4df56286e4100",bytes:2817,
    sha256:"e57ebcdffb1566356550c7a7ada86a7245abd283fcd64fbb841186d0c13f582a",imports:[["node:fs","readFileSync"]],calls:[
      [0,19,9,44,"optional-discovered-input"],
    ]},
  {id:"ECO-SRC-8a7376c1ab550d82",path:"lib/vim-policy.ts",objectId:"264e702e5f0830a117935e2e142ddfd2093eeb8b",bytes:2191,
    sha256:"836041792bc056ac4d6279eae057fdd0f5279f897c2062d9ad026096c9e1294b",imports:[["node:fs","readFileSync"]],calls:[
      [0,29,26,35,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-fef2126c68c668d3",path:"lib/visual-customization-policy.ts",objectId:"b8106722a7551a8348717751fd365e458f1412ff",bytes:5549,
    sha256:"56f97118696aa52dfaa527ecf0494fbcd60f12a06f7c6f89c216ed704cc775e5",imports:[["node:fs","readFileSync"]],calls:[
      [0,87,84,93,"runtime-state-read"],
    ]},
  {id:"ECO-SRC-74e3f9200d8b4726",path:"lib/visual-profiles.ts",objectId:"253dff6a518ba13c869b60a3a443649f35feb2fc",bytes:8080,
    sha256:"7a4a83c3f215f34868b375293af33c183322cc610f674ef5fa6ef825ae0eca1c",imports:[["node:fs","readFileSync"]],calls:[
      [0,127,103,145,"optional-discovered-input"],
    ]},
  {id:"ECO-SRC-8745033959a82ed0",path:["runtime/","gen","tle-ai-binary.mjs"].join(""),objectId:"c3c8cd439aaae8fd6b775c190660f37341e3ef5e",bytes:15444,
    sha256:"cbdf5deac8b7a85ab1253dbd049953aeb192a7d1f7987f9206916ab449c10a92",imports:[["node:fs","readFileSync"]],calls:[
      [0,134,121,139,"source-runtime-edge","source-edge-requires-route-mapping"],[1,144,141,161,"generated-local-control"],
      [2,298,272,311,"source-runtime-edge","source-edge-requires-route-mapping"],
    ]},
  {id:"ECO-SRC-7fb85a620f260291",path:["scripts/","gen","tle-ai-installer.mjs"].join(""),objectId:"c6b15ce14dbcbf1e3a367358638f6b782d71ec96",bytes:40972,
    sha256:"3b897818fbf8aef7ef22c9c11c5f8a8118453fbcb67d69ea1c8cf7d608d20547",imports:[["node:fs/promises","readFile"]],calls:[
      [2,166,165,167,"source-runtime-edge","source-edge-requires-route-mapping"],
      [3,412,409,416,"generated-local-control"],[4,421,418,431,"generated-local-control"],
      [5,450,442,457,"generated-local-control"],
    ],urlCalls:[
      [0,176,176,176,"source-runtime-edge","source-edge-requires-route-mapping"],
      [1,185,185,185,"source-runtime-edge","source-edge-requires-route-mapping"],
    ]},
  {id:"ECO-SRC-2f0030e8503c730c",path:"scripts/install-tui-mode-setting.mjs",objectId:"e89e83730e2b35a521d83ebe2fc61da217c9c671",bytes:10256,
    sha256:"756e6a538e13c7216a5ad9111091f63061ecb79f604457bf303010de0d64aa81",imports:[["node:fs","readFileSync"]],calls:[
      [0,84,77,89,"runtime-state-read"],
    ]},
]);
export const referenceSources=Object.freeze([
  {id:"ECO-SRC-fe4cbd3c4b0d4552",objectId:"2e3ddd4971e38ce84eebbdeff2033e628106a7f3",bytes:39576,
    sha256:"485ab76d54832f3806438eb8aaf9abfe37e58e1be936438c6e31ba655b957e91",references:[
      [0,190,190,190,"external-manual-command-reference","no-ashen-command-equivalence","command-reference"],
      [1,190,190,190,"external-manual-command-reference","no-ashen-command-equivalence","command-reference"],
    ]},
  {id:"ECO-SRC-f9507c3fa0d169a1",objectId:"19b8e7c8e18eb5f69633642c9573b2ee5b9316b5",bytes:12184,
    sha256:"b2189d32a9115f57a3b75f8393a00ef89bcf352d522d836d542ef80845bdc7c1",references:[
      [0,31,31,31,"scanner-version-token","not-a-command-reference","command-reference"],
      [1,91,91,91,"scanner-version-token","not-a-command-reference","command-reference"],
      [2,91,91,91,"scanner-version-token","not-a-command-reference","command-reference"],
      [3,25,25,25,"scanner-version-token","not-a-command-reference","command-reference"],
      [4,27,27,27,"scanner-version-token","not-a-command-reference","command-reference"],
      [5,32,32,32,"scanner-version-token","not-a-command-reference","command-reference"],
      [6,34,34,34,"scanner-version-token","not-a-command-reference","command-reference"],
    ]},
  {id:"ECO-SRC-f5249077264b287a",objectId:"b798794b6869287ea27f15910d83f6bdcd11836c",bytes:13763,
    sha256:"9ff54b948dc2593bfcc9e59d9edac9588f6e3e3cdb1d8873e703fdbdb20958c7",references:[
      [0,96,96,96,"external-manual-command-reference","no-ashen-command-equivalence","command-reference"],
    ]},
  {id:"ECO-SRC-9567c6b3d33d78cb",objectId:"848bdee78ec77316de4cefc6244621d632c59337",bytes:124152,
    sha256:"62d91a65ff7a0dcf022b8eab47df2a1e6da9e9bba7795a88ccd4aa65130e5003",references:[
      [0,915,915,915,"external-manual-command-reference","no-ashen-command-equivalence","command-reference"],
      [1,348,348,348,"external-manual-command-reference","no-ashen-command-equivalence","command-reference"],
      [2,680,680,680,"external-manual-command-reference","no-ashen-command-equivalence","command-reference"],
      [3,972,972,972,"external-manual-command-reference","no-ashen-command-equivalence","command-reference"],
      [4,170,170,170,"external-manual-command-reference","no-ashen-command-equivalence","command-reference"],
      [5,102,102,102,"external-manual-command-reference","no-ashen-command-equivalence","command-reference"],
      [6,645,645,645,"external-manual-command-reference","no-ashen-command-equivalence","command-reference"],
      [7,867,867,867,"external-manual-command-reference","no-ashen-command-equivalence","command-reference"],
      [8,1049,1049,1049,"external-manual-command-reference","no-ashen-command-equivalence","command-reference"],
      [9,564,564,564,"external-manual-command-reference","no-ashen-command-equivalence","command-reference"],
      [10,915,915,915,"external-manual-command-reference","no-ashen-command-equivalence","command-reference"],
      [11,496,496,496,"scanner-version-token","not-a-command-reference","command-reference"],
      [12,496,496,496,"scanner-version-token","not-a-command-reference","command-reference"],
      [13,496,496,496,"scanner-version-token","not-a-command-reference","command-reference"],
      [14,496,496,496,"scanner-version-token","not-a-command-reference","command-reference"],
      [15,496,496,496,"scanner-version-token","not-a-command-reference","command-reference"],
      [16,1037,1037,1037,"scanner-version-token","not-a-command-reference","command-reference"],
    ]},
  {id:"ECO-SRC-6a14fc0f30199f89",objectId:"e3d53d844ad0349d180bd950ff5338882c82803f",bytes:61683,
    sha256:"a29669355e55c663c06ae91a0f026e1a5a5f7465ce7438b74a70f4024b25fd84",references:[
      [10,364,364,364,"host-process-event","host-process-event-flow","event"],
      [11,1261,1261,1264,"host-process-event","host-process-event-flow","event"],
    ]},
  {id:"ECO-SRC-625c38e8637ad8b0",objectId:"39f21cca79a50f02b25472e48d68c2a97e04a073",bytes:10707,
    sha256:"7d499bc7c70e9b7812bc03c373aafe766472ace6b95d036e0a585438ba35d0f7",references:[
      [7,323,323,323,"source-runtime-edge","source-edge-requires-route-mapping","tool"],
    ]},
  {id:"ECO-SRC-af1edc66cbd9834c",objectId:"c6bf814ca8934bd26af5f0efb0c229029ca07155",bytes:81559,
    sha256:"ae4519a785297cce343c9e9d00e6070430c61343b9a502c032e8699176133388",references:[
      [13,364,364,370,"runtime-side-channel-event","no-accepted-equivalence","event"],
      [14,943,943,948,"internal-runtime-event","no-public-equivalent","event"],
      [64,1152,1152,1178,"source-runtime-edge","source-edge-requires-route-mapping","tool"],
    ]},
  {id:"ECO-SRC-1f527249710bd9bf",objectId:"a0fed68c1cd897700a3857cbe7ea4851891eddd0",bytes:467267,
    sha256:"c133aa14fe5b492776f1ef176145e5670692f5f391e4a694938fde628e445ecd",references:[
      [33,9405,9405,9415,"source-runtime-edge","source-edge-requires-route-mapping","command"],
      [89,8975,8975,9013,"source-runtime-edge","source-edge-requires-route-mapping","tool"],
      [90,9015,9015,9059,"source-runtime-edge","source-edge-requires-route-mapping","tool"],
      [91,9061,9061,9207,"source-runtime-edge","source-edge-requires-route-mapping","tool"],
    ]},
  {id:"ECO-SRC-f25fcbecafe905e1",objectId:"ef22678c9621f95d450079ec3aae02f02eccb37c",bytes:114585,
    sha256:"dd8027c06370d3dd932e6500658ceb2dff4e32e6ad8f3f367ca5ac1ad22539bf",references:[
      [15,1579,1579,1588,"internal-runtime-event","no-public-equivalent","event"],
      [16,1683,1683,1689,"internal-runtime-event","no-public-equivalent","event"],
      [17,1708,1708,1713,"source-runtime-edge","source-edge-requires-route-mapping","event"],
    ]},
  {id:"ECO-SRC-91b70c5973297fbd",objectId:"6f627072f868d6b0fcd46e61e94f4f48612ae935",bytes:9934,
    sha256:"db4bcc80b9e41a23a37285e4dd31de67a496a72fef16aa7711cd601daec0b25d",references:[
      [12,168,168,203,"source-runtime-edge","source-edge-requires-route-mapping","tool"],
    ]},
  {id:"ECO-SRC-5b76c3108525e35f",objectId:"741df6c19b4896caa509f1e6f260443a115e2c16",bytes:3652,
    sha256:"2db784c9d70b806c41cf5bb5abc3253acabad108b60c2299cec9eeab107fdf53",references:[
      [3,52,52,60,"generic-host-api-proxy","no-single-static-event-target","event"],
    ]},
  {id:"ECO-SRC-080c377111a31497",objectId:"884db1eb993cbb7d924e8564ef28667ca134c97c",bytes:32345,
    sha256:"34ed34719141571ab1d0cbe2cc28dd66da6c9f4c30aa612239b018c1af66ca2e",references:[
      [14,683,683,756,"host-tool-wrapper","host-framework-only","tool"],
    ]},
  {id:"ECO-SRC-784d73735882ca1d",objectId:"6b978ea1b0ab7a8b68350c3e39dded9d907b96ed",bytes:7173,
    sha256:"71c2cf89e92bda9a7f549e60312b45f6b45a3c7f4a0c22772c379f5d9b946ee9",references:[
      [9,46,46,55,"runtime-side-channel-event","no-accepted-equivalence","event"],
      [10,56,56,62,"runtime-side-channel-event","no-accepted-equivalence","event"],
    ]},
  {id:"ECO-SRC-6c28d7b99a511610",objectId:"44de38b41e2199f31cffbe60887456ab9324d185",bytes:42261,
    sha256:"209af4a17c43c7cd551c21aa48dd2db02f672ed9bcdabf14db2cef94dba716a8",references:[
      [5,592,592,612,"source-runtime-edge","source-edge-requires-route-mapping","command"],
      [6,615,615,623,"source-runtime-edge","source-edge-requires-route-mapping","command"],
      [7,626,626,641,"source-runtime-edge","source-edge-requires-route-mapping","command"],
    ]},
  {id:"ECO-SRC-6058ca4d664d9095",objectId:"af5a725bad0b3841179e0572429fdcab1eb3189b",bytes:12081,
    sha256:"57a2f7e0ecf4d389330d6a6a4029ec808d5f8bd76f13d103444ca569bc8d8c48",references:[
      [0,31,31,31,"source-runtime-edge","source-edge-requires-route-mapping","asset"],
    ]},
  {id:"ECO-SRC-8420ca03583cfe7b",objectId:"6ed00aef22da1cfaa2d2d6dcaf9746ad758cc64f",bytes:6833,
    sha256:"dd3fe029f18791462344a0ac0fc87aab0f8a657d0226d8f676aad4c724f8658d",references:[
      [5,39,39,47,"source-runtime-edge","source-edge-requires-route-mapping","event"],
    ]},
]);
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

function semanticReferenceCandidates(filename,text){
  if(filename.endsWith(".md")){
    const rows=[];
    for(const match of text.matchAll(/`\/(\w[\w-]*)(?:\s[^`]*)?`/g)){
      const start=match.index,line=text.slice(0,start).split("\n").length,
        lineStart=text.lastIndexOf("\n",start)+1,lineEnd=text.indexOf("\n",start),end=lineEnd<0?text.length:lineEnd+1;
      rows.push({reference:{kind:"command-reference",target:match[1]},line,startLine:line,endLine:line,start,end});
    }
    return rows.sort((a,b)=>JSON.stringify(a.reference).localeCompare(JSON.stringify(b.reference),"en"));
  }
  const isJavaScript=/\.[cm]?js$/.test(filename),parsed=ts.createSourceFile(filename,text,ts.ScriptTarget.Latest,true,
    isJavaScript?ts.ScriptKind.JS:ts.ScriptKind.TS);
  if(parsed.parseDiagnostics.length)throw new Error("Frozen semantic-reference source does not parse completely");
  const host={getSourceFile:name=>name===filename?parsed:undefined,getDefaultLibFileName:()=>"lib.d.ts",writeFile(){},getCurrentDirectory:()=>"",
    getDirectories:()=>[],fileExists:name=>name===filename,readFile:name=>name===filename?text:undefined,getCanonicalFileName:name=>name,
    useCaseSensitiveFileNames:()=>true,getNewLine:()=>"\n"};
  const checker=ts.createProgram([filename],{noLib:true,noResolve:true,...(isJavaScript?{allowJs:true}:{})},host).getTypeChecker();
  const literal=node=>{
    if(node&&ts.isStringLiteralLike(node))return node.text;
    if(!node||!ts.isIdentifier(node))return null;
    const declarations=checker.getSymbolAtLocation(node)?.declarations;
    if(declarations?.length!==1)return null;
    const declaration=declarations[0];
    return ts.isVariableDeclaration(declaration)&&ts.isVariableDeclarationList(declaration.parent)&&
      (declaration.parent.flags&ts.NodeFlags.Const)&&declaration.initializer&&ts.isStringLiteralLike(declaration.initializer)
      ?declaration.initializer.text:null;
  };
  const rows=[],add=(node,kind,target)=>{
    const start=node.getStart(parsed),end=node.getEnd(),line=parsed.getLineAndCharacterOfPosition(start).line+1,
      endLine=parsed.getLineAndCharacterOfPosition(Math.max(start,end-1)).line+1;
    rows.push({reference:target===null?{kind,target,reason:"computed"}:{kind,target},line,startLine:line,endLine,start,end});
  };
  const visit=node=>{
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)){
      const name=node.expression.name.text;
      if(name==="registerCommand"||name==="on")add(node,name==="on"?"event":"command",literal(node.arguments[0]));
      if(name==="registerTool"){
        const arg=node.arguments[0],property=arg&&ts.isObjectLiteralExpression(arg)?arg.properties.find(item=>
          ts.isPropertyAssignment(item)&&(ts.isIdentifier(item.name)||ts.isStringLiteralLike(item.name))&&item.name.text==="name"):null;
        add(node,"tool",property?literal(property.initializer):null);
      }
    }
    if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==="URL"){
      const base=node.arguments?.[1]?.getText(parsed);
      add(node,"asset",base==="import.meta.url"?literal(node.arguments?.[0]):null);
    }
    ts.forEachChild(node,visit);
  };
  visit(parsed);
  return rows.sort((a,b)=>JSON.stringify(a.reference).localeCompare(JSON.stringify(b.reference),"en"));
}

/** Verifies frozen filesystem-read and dynamic-URL adjudications without altering scanner evidence. */
export function verifyReferenceAdjudications(repository, baseline, overlay) {
  if (validateBaseline(baseline).length) throw new Error("Malformed ecosystem baseline");
  const expectedRows=[
    ...adjudicationSources.flatMap(source=>[
      ...(source.calls??[]).map(call=>({source,call,referenceType:"filesystem-read"})),
      ...(source.urlCalls??[]).map(call=>({source,call,referenceType:"dynamic-url"})),
    ]),
    ...referenceSources.flatMap(source=>source.references.map(call=>({source,call,referenceType:"semantic-reference"}))),
  ];
  if (!exactKeys(overlay,["version","baselineCommit","adjudications"]) || overlay.version !== 1 ||
      overlay.baselineCommit !== baseline.commit || baseline.commit !== adjudicationCommit ||
      !Array.isArray(overlay.adjudications) || overlay.adjudications.length !== expectedRows.length)
    throw new Error("Invalid reference adjudication envelope");
  const selected=new Map();
  for(const authority of adjudicationSources){
    const source=baseline.files.find(row=>row.id===authority.id);
    if(!source||source.path!==authority.path||source.objectId!==authority.objectId||source.bytes!==authority.bytes||source.sha256!==authority.sha256)
      throw new Error("Reference adjudication source identity mismatch");
    selected.set(authority.id,source);
  }
  for(const authority of referenceSources){
    const source=baseline.files.find(row=>row.id===authority.id);
    if(!source||source.objectId!==authority.objectId||source.bytes!==authority.bytes||source.sha256!==authority.sha256)
      throw new Error("Semantic reference source identity mismatch");
    selected.set(authority.id,source);
  }
  const rowKeys=["sourceId","referenceIndex","objectId","bytes","sha256","callLine","span","classification","disposition"];
  const spanKeys=["startLine","endLine","sha256"],seen=new Set();
  for(let index=0;index<expectedRows.length;index++){
    const row=overlay.adjudications[index],{source:authority,call}=expectedRows[index],source=selected.get(authority.id);
    if(!exactKeys(row,rowKeys)||!exactKeys(row.span,spanKeys))throw new Error("Malformed reference adjudication authority fields");
    const key=`${row.sourceId}:${row.referenceIndex}`;
    if(!Number.isSafeInteger(row.referenceIndex)||seen.has(key)||row.referenceIndex!==call[0])throw new Error("Duplicate or out-of-order reference adjudication index");
    seen.add(key);
    const reference=source.references[row.referenceIndex];
    const isAssetCall=expectedRows[index].referenceType!=="semantic-reference";
    if(!reference||isAssetCall&&(reference.kind!=="asset"||reference.target!==null||reference.status!=="unresolved"||reference.path!==null)||
       !isAssetCall&&(reference.kind!==call[6]||!["unresolved","absent","outside-root"].includes(reference.status)))
      throw new Error("Adjudicated reference does not match its frozen unresolved scanner reference");
    if(row.sourceId!==source.id||row.objectId!==source.objectId||row.bytes!==source.bytes||row.sha256!==source.sha256)
      throw new Error("Reference adjudication row identity mismatch");
    if(row.classification!==call[4]||row.disposition!==(call[5]??"runtime-state-not-source-edge"))
      throw new Error("Unsupported reference adjudication classification or disposition");
    if(row.callLine!==call[1]||row.span.startLine!==call[2]||row.span.endLine!==call[3]||!/^[a-f0-9]{64}$/.test(row.span.sha256))
      throw new Error("Invalid reference adjudication call or span");
  }
  for(const authority of adjudicationSources){
    const source=selected.get(authority.id),bytes=readBaselineSourceBytes(repository,baseline,source.id);
    const scanned=sourceReferences(source.path,bytes).map(({kind,target})=>({kind,target}));
    const recorded=source.references.slice(0,scanned.length).map(({kind,target})=>({kind,target}));
    if(source.references.length<scanned.length||JSON.stringify(scanned)!==JSON.stringify(recorded))
      throw new Error("Frozen scanner/source reference mismatch");
    const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes),isJavaScript=/\.[cm]?js$/.test(source.path),
      parsed=ts.createSourceFile(source.path,text,ts.ScriptTarget.Latest,true,isJavaScript?ts.ScriptKind.JS:ts.ScriptKind.TS);
    if(parsed.parseDiagnostics.length)throw new Error("Frozen adjudication source does not parse completely");
    const host={getSourceFile:name=>name===source.path?parsed:undefined,getDefaultLibFileName:()=>"lib.d.ts",writeFile(){},getCurrentDirectory:()=>"",
      getDirectories:()=>[],fileExists:name=>name===source.path,readFile:name=>name===source.path?text:undefined,getCanonicalFileName:name=>name,
      useCaseSensitiveFileNames:()=>true,getNewLine:()=>"\n"};
    const checker=ts.createProgram([source.path],{noLib:true,noResolve:true,...(isJavaScript?{allowJs:true}:{})},host).getTypeChecker(),imported=new Map(),namespaceBindings=[];
    for(const node of parsed.statements){
      if(!ts.isImportDeclaration(node)||!ts.isStringLiteralLike(node.moduleSpecifier))continue;
      const required=authority.imports.filter(([module])=>module===node.moduleSpecifier.text),named=node.importClause?.namedBindings;
      if(required.length&&named&&ts.isNamedImports(named))for(const element of named.elements)for(const [,name]of required)
        if((element.propertyName?.text??element.name.text)===name&&element.name.text===name)imported.set(name,element.name);
      for(const [module,local,member]of authority.namespaceMembers??[])
        if(module===node.moduleSpecifier.text&&node.importClause?.name?.text===local)
          namespaceBindings.push({member,node:node.importClause.name});
    }
    if(authority.imports.some(([,name])=>!imported.has(name))||
      (authority.namespaceMembers??[]).some(([,local,member])=>!namespaceBindings.some(binding=>binding.node.text===local&&binding.member===member)))
      throw new Error("Frozen filesystem import binding mismatch");
    const symbols=new Set([...imported.values()].map(node=>checker.getSymbolAtLocation(node)));
    const namespaceSymbols=namespaceBindings.map(binding=>({member:binding.member,symbol:checker.getSymbolAtLocation(binding.node)}));
    if(symbols.has(undefined)||namespaceSymbols.some(binding=>!binding.symbol))
      throw new Error("Frozen filesystem import symbol could not be resolved");
    const candidateCalls=[],candidateUrls=[];
    const literal=node=>{
      if(node&&ts.isStringLiteralLike(node))return node.text;
      if(!node||!ts.isIdentifier(node))return null;
      const declarations=checker.getSymbolAtLocation(node)?.declarations;
      if(declarations?.length!==1)return null;
      const declaration=declarations[0];
      return ts.isVariableDeclaration(declaration)&&ts.isVariableDeclarationList(declaration.parent)&&
        (declaration.parent.flags&ts.NodeFlags.Const)&&declaration.initializer&&ts.isStringLiteralLike(declaration.initializer)
        ?declaration.initializer.text:null;
    };
    const visit=node=>{
      if(ts.isCallExpression(node)){
        if(ts.isIdentifier(node.expression)&&symbols.has(checker.getSymbolAtLocation(node.expression)))candidateCalls.push(node);
        else if(ts.isPropertyAccessExpression(node.expression)&&ts.isIdentifier(node.expression.expression)&&
          namespaceSymbols.some(binding=>binding.member===node.expression.name.text&&
            binding.symbol===checker.getSymbolAtLocation(node.expression.expression)))candidateCalls.push(node);
      }
      if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==="URL"){
        const base=node.arguments?.[1]?.getText(parsed);
        if(base!=="import.meta.url"||literal(node.arguments?.[0])===null)candidateUrls.push(node);
      }
      ts.forEachChild(node,visit);
    };
    visit(parsed);
    const rawAssets=source.references.filter(reference=>reference.kind==="asset"&&reference.target===null&&reference.status==="unresolved"&&reference.path===null);
    if(candidateCalls.length+candidateUrls.length!==rawAssets.length)
      throw new Error(`Unexpected frozen asset binding: ${source.id} ${candidateCalls.length}+${candidateUrls.length}/${rawAssets.length}`);
    const lines=text.split(/(?<=\n)/);
    for(const row of overlay.adjudications.filter(row=>row.sourceId===source.id&&
      expectedRows.some(item=>item.source.id===source.id&&item.call[0]===row.referenceIndex&&item.referenceType!=="semantic-reference"))){
      const expected=expectedRows.find(({source:authority,call})=>authority.id===source.id&&call[0]===row.referenceIndex);
      const candidates=expected?.referenceType==="dynamic-url"?candidateUrls:candidateCalls;
      const call=candidates.find(node=>parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line+1===row.callLine);
      if(!call)throw new Error("Frozen source-reference call binding mismatch");
      const callLine=parsed.getLineAndCharacterOfPosition(call.getStart(parsed)).line+1;
      const span=lines.slice(row.span.startLine-1,row.span.endLine).join("");
      if(callLine!==row.callLine||row.callLine<row.span.startLine||row.callLine>row.span.endLine||digest(span)!==row.span.sha256)
        throw new Error("Frozen readFile call/span binding mismatch");
    }
  }
  for(const authority of referenceSources){
    const source=selected.get(authority.id),bytes=readBaselineSourceBytes(repository,baseline,source.id),
      text=new TextDecoder("utf-8",{fatal:true}).decode(bytes),scanned=sourceReferences(source.path,bytes).map(({kind,target})=>({kind,target})),
      recorded=source.references.slice(0,scanned.length).map(({kind,target})=>({kind,target}));
    if(source.references.length<scanned.length||JSON.stringify(scanned)!==JSON.stringify(recorded))
      throw new Error("Frozen scanner/source reference mismatch");
    const candidates=semanticReferenceCandidates(source.path,text),lines=text.split(/(?<=\n)/);
    for(const callSpec of authority.references){
      const row=overlay.adjudications.find(item=>item.sourceId===source.id&&item.referenceIndex===callSpec[0]),
        reference=source.references[callSpec[0]],key=JSON.stringify({kind:reference.kind,target:reference.target}),
        ordinal=source.references.slice(0,callSpec[0]).filter(item=>JSON.stringify({kind:item.kind,target:item.target})===key).length,
        call=candidates.filter(item=>JSON.stringify({kind:item.reference.kind,target:item.reference.target})===key)[ordinal];
      if(!row||!call||call.line!==row.callLine||call.startLine!==row.span.startLine||call.endLine!==row.span.endLine)
        throw new Error("Frozen semantic-reference call binding mismatch");
      const span=lines.slice(row.span.startLine-1,row.span.endLine).join("");
      if(digest(span)!==row.span.sha256)throw new Error("Frozen semantic-reference call/span binding mismatch");
    }
  }
  const scannerUnresolved=baseline.files.flatMap(row=>row.references).filter(reference=>["unresolved","absent","outside-root"].includes(reference.status)).length;
  return {scannerUnresolved,adjudicated:overlay.adjudications.length,remaining:scannerUnresolved-overlay.adjudications.length};
}

// Exact semantic dispositions are code-reviewed authority; the JSON overlay is a projection.
const expectedRuntimeEdgeSemantics=[["ECO-SRC-625c38e8637ad8b0",0,"external-runtime","installed-package-discovery",[]],["ECO-SRC-ecb5b4ebbaf005aa",0,"external-runtime","user-selected-absolute-file",[]],["ECO-SRC-ecb5b4ebbaf005aa",2,"external-runtime","generated-install-manifest-and-binary",[]],["ECO-SRC-f4f6b335bf2cf4e9",0,"external-runtime","configured-provider-url",[]],["ECO-SRC-ee431194e4155110",0,"external-runtime","caller-selected-candidate-tree",[]],["ECO-SRC-6058ca4d664d9095",1,"tracked-glob","direct-markdown-children",["assets/agents/*.md"]],["ECO-SRC-dbf31123d00902ed",1,"tracked-file","exact-source-file",["contracts/telemetry/runtime-aggregate-v1.schema.json"]],["ECO-SRC-8745033959a82ed0",0,"external-runtime","user-selected-absolute-file",[]],["ECO-SRC-8745033959a82ed0",2,"external-runtime","generated-install-manifest-and-binary",[]],["ECO-SRC-7fb85a620f260291",2,"external-runtime","downloaded-or-staged-content",[]],["ECO-SRC-7fb85a620f260291",0,"external-runtime","https-download-url",[]],["ECO-SRC-7fb85a620f260291",1,"external-runtime","https-redirect-location",[]],["ECO-SRC-625c38e8637ad8b0",7,"code-contract","self-owned-registration",["ECO-SRC-625c38e8637ad8b0"]],["ECO-SRC-af1edc66cbd9834c",64,"code-contract","self-owned-registration",["ECO-SRC-af1edc66cbd9834c"]],["ECO-SRC-1f527249710bd9bf",33,"code-contract","self-owned-registration",["ECO-SRC-1f527249710bd9bf"]],["ECO-SRC-1f527249710bd9bf",89,"code-contract","self-owned-registration",["ECO-SRC-1f527249710bd9bf"]],["ECO-SRC-1f527249710bd9bf",90,"code-contract","self-owned-registration",["ECO-SRC-1f527249710bd9bf"]],["ECO-SRC-1f527249710bd9bf",91,"code-contract","self-owned-registration",["ECO-SRC-1f527249710bd9bf"]],["ECO-SRC-f25fcbecafe905e1",17,"code-contract","self-owned-registration",["ECO-SRC-f25fcbecafe905e1"]],["ECO-SRC-91b70c5973297fbd",12,"code-contract","self-owned-registration",["ECO-SRC-91b70c5973297fbd"]],["ECO-SRC-6c28d7b99a511610",5,"code-contract","self-owned-registration",["ECO-SRC-6c28d7b99a511610"]],["ECO-SRC-6c28d7b99a511610",6,"code-contract","self-owned-registration",["ECO-SRC-6c28d7b99a511610"]],["ECO-SRC-6c28d7b99a511610",7,"code-contract","self-owned-registration",["ECO-SRC-6c28d7b99a511610"]],["ECO-SRC-6058ca4d664d9095",0,"tracked-glob","direct-markdown-children",["assets/agents/*.md"]],["ECO-SRC-8420ca03583cfe7b",5,"code-contract","self-owned-registration",["ECO-SRC-8420ca03583cfe7b"]]];

/** Checks that every runtime-edge mapping is bound to one exact adjudicated source span. */
export function verifyRuntimeEdgeMappings(repository,baseline,adjudications,mapping) {
  if(validateBaseline(baseline).length||!mapping||!exactKeys(mapping,["version","baselineCommit","adjudicationFile","mappings"])||mapping.version!==1||mapping.baselineCommit!==baseline.commit||
    mapping.adjudicationFile!=="registry/parity/ecosystem-reference-adjudications-v1.json"||!Array.isArray(mapping.mappings)||
    adjudications?.version!==1||adjudications.baselineCommit!==baseline.commit||!Array.isArray(adjudications.adjudications))throw new Error("Invalid runtime edge mapping envelope");
  if(repository)verifyReferenceAdjudications(repository,baseline,adjudications);
  const expected=adjudications.adjudications.filter(row=>row.classification==="source-runtime-edge"),rows=mapping.mappings;
  if(rows.length!==expected.length||rows.length!==expectedRuntimeEdgeSemantics.length)throw new Error("Runtime edge mapping coverage mismatch");
  const ownerById=new Map(baseline.files.map(row=>[row.id,row])),seen=new Set();
  for(let index=0;index<expected.length;index++){
    const source=expected[index],row=rows[index],owner=ownerById.get(source.sourceId),key=`${row?.sourceId}:${row?.referenceIndex}`;
    if(!row||!exactKeys(row,["sourceId","referenceIndex","objectId","bytes","sha256","callLine","span","mappingKind","mappingReason","targets"])||
      !exactKeys(row.span,["startLine","endLine","sha256"])||!owner||seen.has(key)||row.sourceId!==source.sourceId||row.referenceIndex!==source.referenceIndex||
      row.objectId!==source.objectId||row.bytes!==source.bytes||row.sha256!==source.sha256||row.callLine!==source.callLine||
      JSON.stringify(row.span)!==JSON.stringify(source.span))throw new Error("Runtime edge mapping source identity mismatch");
    seen.add(key);
    const semantic=expectedRuntimeEdgeSemantics[index];
    if(JSON.stringify([row.sourceId,row.referenceIndex,row.mappingKind,row.mappingReason,row.targets])!==JSON.stringify(semantic))
      throw new Error("Runtime edge mapping semantic authority mismatch");
    if(!["tracked-file","tracked-glob","code-contract","external-runtime"].includes(row.mappingKind)||typeof row.mappingReason!=="string"||!row.mappingReason.trim()||!Array.isArray(row.targets))
      throw new Error("Malformed runtime edge mapping disposition");
    if(row.mappingKind==="tracked-file"&&(row.targets.length!==1||!ownerById.has(owner.id)||!baseline.files.some(file=>file.path===row.targets[0])))
      throw new Error("Runtime edge target is not a tracked source file");
    if(row.mappingKind==="tracked-glob"&&(row.targets.length!==1||row.targets[0]!=="assets/agents/*.md"))
      throw new Error("Unsupported runtime edge selector");
    if(row.mappingKind==="code-contract"&&(row.targets.length!==1||row.targets[0]!==owner.id))
      throw new Error("Code contract mapping must point to its owning source");
    if(row.mappingKind==="external-runtime"&&row.targets.length!==0)
      throw new Error("External runtime mapping cannot claim a repository source target");
  }
  if(repository){
    for(const row of rows.filter(item=>item.mappingKind==="tracked-glob")){
      const files=collectRuntimeEdgeFiles(repository,baseline.commit,row.targets[0]);
      if(!files.length)throw new Error("Runtime edge selector has no frozen tracked inputs");
    }
  }
  return {mapped:rows.length,tracked:rows.filter(row=>["tracked-file","tracked-glob"].includes(row.mappingKind)).length,
    codeContracts:rows.filter(row=>row.mappingKind==="code-contract").length,externalRuntime:rows.filter(row=>row.mappingKind==="external-runtime").length};
}

/** Reads the explicitly supported direct-child Markdown selector from exact Git objects. */
export function collectRuntimeEdgeFiles(repository,commit,selector) {
  if(selector!=="assets/agents/*.md"||!objectId(commit)||git(repository,["cat-file","-t",commit]).toString().trim()!=="commit")
    throw new Error("Unsupported runtime edge selector or source commit");
  const rows=git(repository,["ls-tree","-rz","-r","--full-tree",commit,"--","assets/agents/"]).toString("utf8").split("\0").filter(Boolean),files=[];
  for(const entry of rows){
    const match=/^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/.exec(entry);if(!match)throw new Error("Malformed Git tree entry for runtime edge selector");
    const [,mode,type,id,filename]=match;
    if(!filename.startsWith("assets/agents/")||filename.slice("assets/agents/".length).includes("/")||!filename.endsWith(".md"))continue;
    if(type!=="blob"||mode!=="100644")throw new Error("Runtime edge selector rejects non-regular files");
    const bytes=git(repository,["cat-file","blob",id]);
    files.push({path:filename,objectId:id,bytes:bytes.length,sha256:digest(bytes)});
  }
  return files.sort((a,b)=>a.path.localeCompare(b.path,"en"));
}

/** A rename needs a hash unique across both complete snapshots, not just changed paths. */
export function classifyUniqueContentRenames(removed,added,oldRows,newRows) {
  const count=rows=>{const result=new Map();for(const row of rows)result.set(row.sha256,(result.get(row.sha256)??0)+1);return result;};
  const oldCount=count(oldRows),newCount=count(newRows),addedByHash=new Map(added.map(row=>[row.sha256,row]));
  return removed.flatMap(row=>oldCount.get(row.sha256)===1&&newCount.get(row.sha256)===1&&addedByHash.has(row.sha256)
    ?[{path:row.path,to:addedByHash.get(row.sha256).path}]:[]);
}

/** Includes mapped runtime-only inputs in the source drift report; it never adopts them. */
export function detectMappedBaselineDrift(repository,before,after,adjudications,mapping) {
  verifyRuntimeEdgeMappings(repository,before,adjudications,mapping);
  const runtimeEdges=[],additionalChanges=[],globTargets=new Map();
  for(const row of mapping.mappings){
    const owner=before.files.find(file=>file.id===row.sourceId);if(!owner)throw new Error("Runtime edge owner is missing");
    if(row.mappingKind==="tracked-file")runtimeEdges.push({sourcePath:owner.path,targetPaths:row.targets});
    else if(row.mappingKind==="tracked-glob"){
      const selector=row.targets[0];
      if(!globTargets.has(selector)){
        const oldFiles=collectRuntimeEdgeFiles(repository,before.commit,selector),newFiles=collectRuntimeEdgeFiles(repository,after.commit,selector);
        const oldByPath=new Map(oldFiles.map(file=>[file.path,file])),newByPath=new Map(newFiles.map(file=>[file.path,file]));
        const removed=oldFiles.filter(file=>!newByPath.has(file.path)),added=newFiles.filter(file=>!oldByPath.has(file.path));
        const renamedOld=new Set(),renamedNew=new Set();
        for(const move of classifyUniqueContentRenames(removed,added,oldFiles,newFiles)){
          additionalChanges.push({kind:"RENAMED",path:move.path,to:move.to});
          renamedOld.add(move.path);renamedNew.add(move.to);
        }
        for(const file of removed)if(!renamedOld.has(file.path))additionalChanges.push({kind:"REMOVED",path:file.path});
        for(const file of added)if(!renamedNew.has(file.path))additionalChanges.push({kind:"ADDED",path:file.path});
        for(const file of newFiles)if(oldByPath.has(file.path)&&oldByPath.get(file.path).sha256!==file.sha256)additionalChanges.push({kind:"CONTENT_CHANGED",path:file.path});
        globTargets.set(selector,[...new Set([...oldFiles,...newFiles].map(file=>file.path))]);
      }
      runtimeEdges.push({sourcePath:owner.path,targetPaths:globTargets.get(selector)});
    }
  }
  return detectBaselineDrift(before,after,{runtimeEdges,additionalChanges});
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
export function detectBaselineDrift(before, after, {runtimeEdges=[],additionalChanges=[]}={}) {
  for (const value of [before,after]) if (validateBaseline(value).length) throw new Error("Cannot compare malformed baselines");
  if(!Array.isArray(runtimeEdges)||runtimeEdges.some(edge=>!edge||!safePath(edge.sourcePath)||!Array.isArray(edge.targetPaths)||edge.targetPaths.some(target=>!safePath(target))))
    throw new Error("Malformed runtime edge mapping");
  if(!Array.isArray(additionalChanges)||additionalChanges.some(change=>!change||!["ADDED","REMOVED","CONTENT_CHANGED","RENAMED"].includes(change.kind)||!safePath(change.path)||(change.kind==="RENAMED"?!safePath(change.to):change.to!==undefined)))
    throw new Error("Malformed runtime edge drift changes");
  const old = new Map(before.files.map(row => [row.path,row])), next = new Map(after.files.map(row => [row.path,row]));
  const removed = before.files.filter(row => !next.has(row.path)), added = after.files.filter(row => !old.has(row.path)), changes = [];
  const renamedOld = new Set(), renamedNew = new Set();
  for (const move of classifyUniqueContentRenames(removed,added,before.files,after.files)) {
    changes.push({kind:"RENAMED",path:move.path,to:move.to});renamedOld.add(move.path);renamedNew.add(move.to);
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
  changes.push(...additionalChanges);
  const invalidated = new Set(changes.flatMap(change => [change.path,...(change.to ? [change.to] : [])]));
  let addedDependent = true;
  while (addedDependent) {
    addedDependent = false;
    for (const row of [...before.files,...after.files]) if (!invalidated.has(row.path) &&
      (invalidated.has("package.json") || row.references.some(ref => ["tracked","registered"].includes(ref.status) && invalidated.has(ref.path)) ||
        runtimeEdges.some(edge=>edge.sourcePath===row.path&&edge.targetPaths.some(target=>invalidated.has(target))))) {
      invalidated.add(row.path); addedDependent = true;
    }
  }
  const uniqueChanges=[...new Map(changes.map(change=>[JSON.stringify(change),change])).values()];
  return {from:before.commit, to:after.commit, autoAdopt:false, changes:uniqueChanges.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en")),
    invalidatedPaths:sortedUnique([...invalidated])};
}

export function verifyBaselineObjects(repository, baseline) {
  if (validateBaseline(baseline).length) throw new Error("Malformed ecosystem baseline");
  const actual = collectBaseline(repository, baseline.commit);
  if (JSON.stringify(actual) !== JSON.stringify(baseline)) throw new Error("Baseline does not match pinned Git objects");
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const baseline = parseJson(readFileSync(new URL("../registry/parity/ecosystem-sources-v1.json",import.meta.url),"utf8"),"ecosystem baseline");
  const issues = validateBaseline(baseline);
  const media = parseJson(readFileSync(new URL("../registry/parity/ecosystem-media-v1.json",import.meta.url),"utf8"),"ecosystem media manifest");
  issues.push(...validateMediaManifest(baseline,media));
  if (issues.length) throw new Error(issues.join("\n"));
  if (process.argv[2]) {
    verifyBaselineObjects(process.argv[2],baseline);
    for (const row of media.sources) {
      const source=baseline.files.find(file=>file.path===row.path);
      verifyMediaBytes(source,row,git(process.argv[2],["cat-file","blob",source.objectId]));
    }
  }
  if (process.argv[3]) {
    const overlay=parseJson(readFileSync(new URL("../registry/parity/ecosystem-reference-adjudications-v1.json",import.meta.url),"utf8"),"reference adjudications");
    const mappings=parseJson(readFileSync(new URL("../registry/parity/ecosystem-runtime-edge-mappings-v1.json",import.meta.url),"utf8"),"runtime edge mappings");
    console.log(JSON.stringify(detectMappedBaselineDrift(process.argv[2],baseline,collectBaseline(process.argv[2],process.argv[3]),overlay,mappings),null,2));
  }
  console.log(`ecosystem baseline: PASS (${baseline.files.length} tracked objects; SOURCE_INSPECTED, not runtime parity)`);
}
