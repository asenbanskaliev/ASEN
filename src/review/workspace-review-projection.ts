import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, mkdtempSync, openSync, readFileSync, readlinkSync, readdirSync, realpathSync, rmdirSync,
} from "node:fs";
import {isAbsolute, join, relative, resolve, sep} from "node:path";
import {tmpdir} from "node:os";
import {isProxy} from "node:util/types";
import {captureReviewRepositoryBinding,assertReviewRepositoryBinding} from "./review-tree-inspection.js";

export type WorkspaceReviewEntryMode = "100644" | "100755" | "120000" | "160000";
export type WorkspaceReviewEntryChange = "added" | "modified" | "deleted" | "gitlink";
export interface WorkspaceReviewEntry {
  readonly path: string;
  readonly mode: WorkspaceReviewEntryMode;
  readonly objectId: string | null;
  readonly contentSha256: string | null;
  readonly change: WorkspaceReviewEntryChange;
}
export interface WorkspaceReviewProjectionRequest {
  readonly repositoryRoot: string;
  /** Exact untracked paths to include. Unlisted untracked files are excluded. */
  readonly intendedUntracked: readonly string[];
}
export interface WorkspaceReviewProjection {
  readonly schemaVersion: 1;
  readonly repositoryRoot: string;
  readonly baseCommit: string | null;
  readonly baseTree: string;
  readonly candidateTree: string;
  readonly intendedUntracked: readonly string[];
  readonly unexpectedUntracked: readonly string[];
  readonly indexIdentity: string;
  readonly sourceIdentity: string;
  readonly entries: readonly WorkspaceReviewEntry[];
}

/** A review selection restricts evidence collection; it grants no write authority. */
export class WorkspaceReviewScopeError extends Error {
  readonly paths: readonly string[];
  readonly changedPaths: readonly string[];
  constructor(readonly kind: "unexpected-untracked" | "outside-review" | "outside-correction" | "correction-base" | "unchanged-correction", paths: readonly string[], changedPaths: readonly string[] = []) {
    super(kind === "unexpected-untracked" ? "Unexpected untracked paths" : kind === "correction-base" ? "Correction base changed" : kind === "unchanged-correction" ? "Correction did not change the candidate" : kind === "outside-correction" ? "Changed paths outside correction findings" : "Changed paths outside selected review scope");
    this.paths = Object.freeze([...paths]);
    this.changedPaths = Object.freeze([...changedPaths]);
  }
}

/** Comparison policy only; no permission or review authority is issued. */
export interface WorkspaceCorrectionConstraint {
  readonly previousProjection: WorkspaceReviewProjection;
  readonly allowedPaths: readonly string[];
}

type TreeEntry = {path: string; mode: WorkspaceReviewEntryMode; objectId: string};
type SourceEntry = TreeEntry & {bytes?: Buffer; contentSha256: string | null};
const outputLimit = 16 * 1024 * 1024;
const decoder = new TextDecoder("utf-8", {fatal: true});
const issuedProjections = new WeakSet<object>();
const projectionRepositories = new WeakMap<object,Readonly<Record<string,never>>>();
const projectionSelections = new WeakMap<object,readonly string[]>();
const projectionCatalogs = new WeakMap<object,ReadonlyMap<string,Readonly<{mode:string;objectId:string;contentSha256:string|null}>>>();
const projectionCorrections = new WeakMap<object,WorkspaceCorrectionConstraint>();

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function safePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value !== value.normalize("NFC") || isAbsolute(value)
    || value.includes("\\") || value.includes(":") || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) return false;
  const parts = value.split("/");
  return parts.every(part => part.length > 0 && part !== "." && part !== ".." && part.toLowerCase() !== ".git");
}

function plainData(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be exact plain data`);
  }
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) {
    throw new Error(`${label} shape is invalid`);
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(`${label} shape is invalid`);
    result[key] = descriptor.value;
  }
  return result;
}

function normalizeRequest(value: WorkspaceReviewProjectionRequest): {repositoryRoot: string; intendedUntracked: string[]} {
  const data = plainData(value, ["repositoryRoot", "intendedUntracked"], "workspace projection request");
  if (typeof data.repositoryRoot !== "string" || !data.repositoryRoot || !Array.isArray(data.intendedUntracked)) {
    throw new Error("workspace projection request is invalid");
  }
  const input=data.intendedUntracked;
  if(isProxy(input)||Object.getPrototypeOf(input)!==Array.prototype)throw new Error("workspace projection scope must be plain data");
  const descriptors=Object.getOwnPropertyDescriptors(input),own=Reflect.ownKeys(descriptors);
  if(own.length!==input.length+1||own.some(key=>key!=="length"&&!(typeof key==="string"&&/^(?:0|[1-9][0-9]*)$/u.test(key)&&Number(key)<input.length)))throw new Error("workspace projection scope must be a dense plain array");
  const intended:string[]=[];
  for(let index=0;index<input.length;index++){const descriptor=descriptors[String(index)];if(!descriptor?.enumerable||!("value" in descriptor)||typeof descriptor.value!=="string")throw new Error("workspace projection scope must be a dense plain array");intended.push(descriptor.value);}
  if (intended.some(path => !safePath(path)) || new Set(intended).size !== intended.length) {
    throw new Error("workspace projection scope contains an unsafe path");
  }
  return {repositoryRoot: data.repositoryRoot, intendedUntracked: intended.sort()};
}

function gitEnvironment(): NodeJS.ProcessEnv {
  const keep = ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "COMSPEC", "TEMP", "TMP", "TMPDIR"];
  const environment: NodeJS.ProcessEnv = {};
  for (const key of keep) if (process.env[key] !== undefined) environment[key] = process.env[key];
  environment.GIT_CONFIG_NOSYSTEM = "1";
  environment.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null";
  environment.GIT_TERMINAL_PROMPT = "0";
  environment.GIT_OPTIONAL_LOCKS = "0";
  environment.GIT_NO_REPLACE_OBJECTS = "1";
  environment.GIT_NO_LAZY_FETCH = "1";
  environment.GIT_ALLOW_PROTOCOL = "";
  environment.GIT_PROTOCOL_FROM_USER = "0";
  environment.NO_COLOR = "1";
  return environment;
}

function ownedScratch(prefix:string):{path:string;dev:number;ino:number;birthtimeMs:number;realPath:string}{
  const path=mkdtempSync(join(tmpdir(),prefix)),info=lstatSync(path);
  return {path,dev:info.dev,ino:info.ino,birthtimeMs:info.birthtimeMs,realPath:realpathSync(path)};
}
function assertOwnedScratch(scratch:ReturnType<typeof ownedScratch>):void{
  const info=lstatSync(scratch.path,{throwIfNoEntry:false});
  if(!info||!info.isDirectory()||info.isSymbolicLink()||info.dev!==scratch.dev||info.ino!==scratch.ino||info.birthtimeMs!==scratch.birthtimeMs||realpathSync(scratch.path)!==scratch.realPath)throw new Error(`Review scratch ownership is uncertain; retained at ${scratch.path}`);
}
function disposeScratch(scratch:ReturnType<typeof ownedScratch>):void{
  assertOwnedScratch(scratch);
  if(readdirSync(scratch.path).length)throw new Error(`Review scratch contains unowned data; retained at ${scratch.path}`);
  assertOwnedScratch(scratch);rmdirSync(scratch.path);
}

function runGit(root: string, args: readonly string[], input?: Buffer, extraEnvironment: NodeJS.ProcessEnv = {}): Buffer {
  // A shared conventional path can already contain executable hooks.
  // mkdtemp creates an owned empty directory before any repository Git command.
  const hooksDirectory = ownedScratch("asen-review-hooks-");
  try {
    return execFileSync("git", [
      "--no-replace-objects", "--no-pager", "-c", "protocol.allow=never", "-c", "protocol.file.allow=never", "-c", "protocol.ext.allow=never", "-c", "core.fsmonitor=false", "-c", `core.hooksPath=${hooksDirectory.path}`,
      "-c", "diff.external=", "-c", "gc.auto=0", "-c", "maintenance.auto=false", "-C", root, ...args,
    ], {
      env: {...gitEnvironment(), ...extraEnvironment}, input, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      timeout: 10_000, maxBuffer: outputLimit,
    });
  } finally {
    disposeScratch(hooksDirectory);
  }
}

function gitText(root: string, args: readonly string[], input?: Buffer, extraEnvironment?: NodeJS.ProcessEnv): string {
  return decoder.decode(runGit(root, args, input, extraEnvironment)).trim();
}

interface TreeBuildNode {readonly depth:number;readonly children:Map<string,TreeBuildNode>;readonly files:Map<string,SourceEntry>;objectId?:string;}
/** Build each directory level in one Git batch, with no temporary index file. */
function writeCandidateTree(root:string,candidate:Map<string,SourceEntry>):string{
  const top:TreeBuildNode={depth:0,children:new Map(),files:new Map()},levels=new Map<number,TreeBuildNode[]>([[0,[top]]]);
  for(const entry of candidate.values()){
    const parts=entry.path.split("/");let node=top;
    for(const part of parts.slice(0,-1)){
      if(node.files.has(part))throw new Error("workspace tree has overlapping paths");
      let child=node.children.get(part);
      if(!child){child={depth:node.depth+1,children:new Map(),files:new Map()};node.children.set(part,child);const level=levels.get(child.depth)??[];level.push(child);levels.set(child.depth,level);}
      node=child;
    }
    const name=parts[parts.length-1]!;
    if(node.files.has(name)||node.children.has(name))throw new Error("workspace tree has overlapping paths");
    node.files.set(name,entry);
  }
  for(const depth of [...levels.keys()].sort((a,b)=>b-a)){
    const nodes=levels.get(depth)!,chunks:Buffer[]=[];
    for(const node of nodes){
      for(const [name,entry] of node.files){
        const type=entry.mode==="160000"?"commit":"blob";
        chunks.push(Buffer.from(`${entry.mode} ${type} ${entry.objectId}\t${name}\0`));
      }
      for(const [name,child] of node.children){
        if(!child.objectId)throw new Error("workspace subtree identity is unavailable");
        chunks.push(Buffer.from(`040000 tree ${child.objectId}\t${name}\0`));
      }
      chunks.push(Buffer.from("\0"));
    }
    const output=gitText(root,["mktree","--batch","-z"],Buffer.concat(chunks)).split("\n");
    if(output.length!==nodes.length||output.some(value=>!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)))throw new Error("Git returned invalid workspace tree identities");
    nodes.forEach((node,index)=>{node.objectId=output[index]!;});
  }
  return top.objectId!;
}

function canonicalRepository(requested: string): string {
  const requestedPath = resolve(requested);
  const metadata = lstatSync(requestedPath);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("repository root is unsafe");
  const canonical = realpathSync(requestedPath);
  const top = realpathSync(gitText(canonical, ["rev-parse", "--show-toplevel"]));
  if (process.platform === "win32" ? top.toLowerCase() !== canonical.toLowerCase() : top !== canonical) {
    throw new Error("repository root must be the canonical Git toplevel");
  }
  return canonical;
}


function records(buffer: Buffer): Buffer[] {
  const result: Buffer[] = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) if (buffer[index] === 0) {
    if (index > start) result.push(buffer.subarray(start, index));
    start = index + 1;
  }
  if (start !== buffer.length) throw new Error("Git returned an unterminated record");
  return result;
}

function parseEntry(record: Buffer, indexEntry: boolean): TreeEntry & {stage?: number} {
  const tab = record.indexOf(0x09);
  if (tab < 0) throw new Error("Git returned malformed entry metadata");
  const metadata = decoder.decode(record.subarray(0, tab));
  const path = decoder.decode(record.subarray(tab + 1));
  if (!safePath(path)) throw new Error("Git returned an unsafe path");
  const match = indexEntry
    ? /^(100644|100755|120000|160000) ([0-9a-f]{40,64}) ([0-3])$/u.exec(metadata)
    : /^(100644|100755|120000|160000) (?:blob|commit) ([0-9a-f]{40,64})$/u.exec(metadata);
  if (!match) throw new Error("Git returned unsupported entry metadata");
  return {path, mode: match[1] as WorkspaceReviewEntryMode, objectId: match[2]!, ...(indexEntry ? {stage: Number(match[3])} : {})};
}

function baseIdentity(root: string): {baseCommit: string | null; baseTree: string} {
  try {
    const baseCommit = gitText(root, ["rev-parse", "--verify", "HEAD^{commit}"]);
    return {baseCommit, baseTree: gitText(root, ["rev-parse", "--verify", "HEAD^{tree}"])};
  } catch {
    let ref:string;
    try { ref=gitText(root, ["symbolic-ref", "-q", "HEAD"]); } catch { throw new Error("repository HEAD cannot be resolved"); }
    try { runGit(root,["show-ref","--verify","--quiet",ref]); }
    catch(error){
      if((error as NodeJS.ErrnoException&{status?:number}).status===1)return {baseCommit:null,baseTree:gitText(root,["hash-object","-t","tree","--stdin"],Buffer.alloc(0))};
      throw new Error("repository HEAD cannot be resolved");
    }
    throw new Error("repository HEAD cannot be resolved");
  }
}

function assertSafeAncestors(root: string, path: string): void {
  let current = root;
  for (const part of path.split("/").slice(0, -1)) {
    current = join(current, part);
    const metadata = lstatSync(current, {throwIfNoEntry: false});
    if (metadata && (!metadata.isDirectory() || metadata.isSymbolicLink())) throw new Error(`workspace path has an unsafe ancestor: ${path}`);
  }
}

function sourceEntry(root: string, entry: TreeEntry): SourceEntry | null {
  assertSafeAncestors(root, entry.path);
  const absolute = join(root, ...entry.path.split("/"));
  const metadata = lstatSync(absolute, {throwIfNoEntry: false});
  if (!metadata) return null;
  if (entry.mode === "160000") throw new Error("gitlinks are metadata-only and must not be traversed");
  let mode = entry.mode;
  let bytes: Buffer;
  if (metadata.isSymbolicLink()) {
    if (entry.mode !== "120000") throw new Error(`workspace symlink mode is unsafe: ${entry.path}`);
    const target = readlinkSync(absolute);
    if (isAbsolute(target) || relative(root, resolve(absolute, "..", target)).split(sep).includes("..")) {
      throw new Error(`workspace symlink escapes the repository: ${entry.path}`);
    }
    bytes = Buffer.from(target);
  } else {
    if (!metadata.isFile() || entry.mode === "120000") throw new Error(`workspace entry type is unsafe: ${entry.path}`);
    const descriptor=openSync(absolute,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
    try{
      const opened=fstatSync(descriptor);
      if(!opened.isFile()||opened.dev!==metadata.dev||opened.ino!==metadata.ino||opened.birthtimeMs!==metadata.birthtimeMs)throw new Error(`workspace file identity changed: ${entry.path}`);
      bytes=readFileSync(descriptor);
      const after=fstatSync(descriptor),pathInfo=lstatSync(absolute);
      if(!pathInfo.isFile()||pathInfo.isSymbolicLink()||pathInfo.dev!==metadata.dev||pathInfo.ino!==metadata.ino||pathInfo.birthtimeMs!==metadata.birthtimeMs||after.dev!==metadata.dev||after.ino!==metadata.ino||after.size!==metadata.size||after.mtimeMs!==metadata.mtimeMs||after.ctimeMs!==metadata.ctimeMs||bytes.length!==metadata.size)throw new Error(`workspace file changed while reading: ${entry.path}`);
      assertSafeAncestors(root,entry.path);
    }finally{closeSync(descriptor);}
    if (process.platform !== "win32") mode = (metadata.mode & 0o111) === 0 ? "100644" : "100755";
  }
  return {...entry, mode, bytes, contentSha256: sha256(bytes)};
}

function freezeProjection(value: WorkspaceReviewProjection): WorkspaceReviewProjection {
  for (const entry of value.entries) Object.freeze(entry);
  Object.freeze(value.entries);
  Object.freeze(value.intendedUntracked);
  Object.freeze(value.unexpectedUntracked);
  const projection=Object.freeze(value);
  issuedProjections.add(projection);
  return projection;
}

/** Returns true only for the exact immutable projection emitted by this module. */
export function isWorkspaceReviewProjectionGenuine(value:unknown):value is WorkspaceReviewProjection {
  return typeof value==="object"&&value!==null&&issuedProjections.has(value);
}

/** Revalidates physical ownership while allowing the candidate bytes to be corrected. */
export function assertWorkspaceProjectionRepository(value:unknown):void{
  if(!isWorkspaceReviewProjectionGenuine(value))throw new Error("workspace projection was not captured here");
  const identity=projectionRepositories.get(value);
  if(!identity)throw new Error("workspace repository identity is unavailable");
  assertReviewRepositoryBinding(identity);
}

/**
 * Freezes workspace bytes into an immutable Git tree without changing the index.
 * The returned data is identity metadata only; it grants no review, write, or delivery authority.
 */
export function captureWorkspaceReviewProjection(input: WorkspaceReviewProjectionRequest, selectedReviewPaths?: readonly string[], correction?: WorkspaceCorrectionConstraint): WorkspaceReviewProjection {
  const request = normalizeRequest(input);
  const selection = selectedReviewPaths === undefined ? undefined : Object.freeze(normalizeRequest({repositoryRoot:request.repositoryRoot,intendedUntracked:selectedReviewPaths}).intendedUntracked);
  const selected = selection === undefined ? undefined : new Set(selection);
  let correctionPolicy: WorkspaceCorrectionConstraint | undefined;
  if(correction!==undefined){
    const data=plainData(correction,["previousProjection","allowedPaths"],"workspace correction constraint");
    if(!isWorkspaceReviewProjectionGenuine(data.previousProjection))throw new Error("workspace correction baseline was not captured here");
    const previousProjection=data.previousProjection;
    const allowedPaths=Object.freeze(normalizeRequest({repositoryRoot:request.repositoryRoot,intendedUntracked:data.allowedPaths as readonly string[]}).intendedUntracked);
    if(!projectionCatalogs.has(previousProjection))throw new Error("workspace correction baseline catalog is unavailable");
    assertWorkspaceProjectionRepository(previousProjection);
    correctionPolicy=Object.freeze({previousProjection,allowedPaths});
  }
  const root = canonicalRepository(request.repositoryRoot);
  const identity=captureReviewRepositoryBinding(root);
  const base = baseIdentity(root);
  if(correctionPolicy){
    const previous=correctionPolicy.previousProjection;
    if(previous.repositoryRoot!==root||previous.baseCommit!==base.baseCommit||previous.baseTree!==base.baseTree||JSON.stringify(previous.intendedUntracked)!==JSON.stringify(request.intendedUntracked))throw new WorkspaceReviewScopeError("correction-base",[]);
  }
  const baseEntries = new Map(records(runGit(root, ["ls-tree", "-r", "-z", base.baseTree])).map(record => {
    const parsed = parseEntry(record, false); return [parsed.path, parsed] as const;
  }));
  const rawIndex = runGit(root, ["ls-files", "--stage", "-z"]);
  const indexFlags = runGit(root, ["ls-files", "-v", "-z"]);
  const fsmonitorFlags = runGit(root, ["ls-files", "-f", "-z"]);
  const observedUntracked=records(runGit(root,["ls-files","--others","--exclude-standard","-z"])).map(record=>decoder.decode(record));
  if(observedUntracked.some(path=>!safePath(path))||new Set(observedUntracked).size!==observedUntracked.length)throw new Error("repository contains an unsafe untracked path");
  const intendedSet=new Set(request.intendedUntracked),unexpectedUntracked=observedUntracked.filter(path=>!intendedSet.has(path)).sort();
  if(selected&&unexpectedUntracked.length)throw new WorkspaceReviewScopeError("unexpected-untracked",unexpectedUntracked);
  const indexEntries = new Map<string, TreeEntry>();
  for (const record of records(rawIndex)) {
    const parsed = parseEntry(record, true);
    if (parsed.stage !== 0 || indexEntries.has(parsed.path)) throw new Error("workspace index contains unresolved entries");
    indexEntries.set(parsed.path, parsed);
  }
  for (const [path, baseEntry] of baseEntries) if (baseEntry.mode === "160000") {
    const indexed = indexEntries.get(path);
    if (!indexed || indexed.mode !== "160000" || indexed.objectId !== baseEntry.objectId) throw new Error("changed gitlinks cannot be projected");
  }
  for (const indexed of indexEntries.values()) if (indexed.mode === "160000" && baseEntries.get(indexed.path)?.objectId !== indexed.objectId) {
    throw new Error("new or changed gitlinks cannot be projected");
  }
  for (const path of request.intendedUntracked) {
    if (indexEntries.has(path)) throw new Error(`intended untracked path is already tracked: ${path}`);
    if ([...indexEntries.values()].some(entry => entry.mode === "160000" && path.startsWith(`${entry.path}/`))) {
      throw new Error("intended untracked scope enters a gitlink");
    }
  }

  const candidate = new Map<string, SourceEntry>();
  for (const indexed of indexEntries.values()) {
    if (indexed.mode === "160000") {
      candidate.set(indexed.path, {...indexed, contentSha256: null});
      continue;
    }
    const source = sourceEntry(root, indexed);
    if (source) candidate.set(indexed.path, source);
  }
  for (const path of request.intendedUntracked) {
    const source = sourceEntry(root, {path, mode: "100644", objectId: ""});
    if (!source) throw new Error(`intended untracked path is missing: ${path}`);
    candidate.set(path, source);
  }

  for (const source of candidate.values()) if (source.bytes) {
    source.objectId = gitText(root, ["hash-object", "--no-filters", "--stdin"], source.bytes);
  }
  const scope = [...new Set([...baseEntries.keys(), ...candidate.keys()])].sort();
  const entries: WorkspaceReviewEntry[] = [];
  for (const path of scope) {
    const before = baseEntries.get(path);
    const after = candidate.get(path);
    if (before?.mode === "160000" && after?.mode === "160000") {
      entries.push({path, mode: "160000", objectId: after.objectId, contentSha256: null, change: "gitlink"});
    } else if (!after) {
      entries.push({path, mode: before!.mode, objectId: null, contentSha256: null, change: "deleted"});
    } else if (!before || before.mode !== after.mode || before.objectId !== after.objectId) {
      entries.push({path, mode: after.mode, objectId: after.objectId, contentSha256: after.contentSha256, change: before ? "modified" : "added"});
    }
  }

  // Compare the bytes captured for this projection before adding any changed
  // blobs or trees to Git. This does not make the workspace read atomic.
  if(selected){
    const outside=entries.filter(entry=>entry.change!=="gitlink"&&!selected.has(entry.path)).map(entry=>entry.path);
    if(outside.length)throw new WorkspaceReviewScopeError("outside-review",outside);
  }
  if(correctionPolicy){
    const previous=projectionCatalogs.get(correctionPolicy.previousProjection)!;
    const paths=[...new Set([...previous.keys(),...candidate.keys()])].sort();
    const changed=paths.filter(path=>{
      const before=previous.get(path),after=candidate.get(path);
      return !before||!after||before.mode!==after.mode||before.objectId!==after.objectId||before.contentSha256!==after.contentSha256;
    });
    const allowed=new Set(correctionPolicy.allowedPaths),outside=changed.filter(path=>!allowed.has(path));
    if(outside.length)throw new WorkspaceReviewScopeError("outside-correction",outside,changed);
    if(!changed.length)throw new WorkspaceReviewScopeError("unchanged-correction",[]);
    assertWorkspaceProjectionRepository(correctionPolicy.previousProjection);
  }

  for (const item of entries) {
    if (item.change === "gitlink" || item.change === "deleted") continue;
    const source = candidate.get(item.path)!;
    const objectId = gitText(root, ["hash-object", "-w", "--no-filters", "--stdin"], source.bytes);
    if (objectId !== item.objectId) throw new Error("workspace blob identity changed during projection");
  }
  const candidateTree = writeCandidateTree(root,candidate);

  const indexIdentity = createHash("sha256").update("asen.workspace-index.v2\0")
    .update(String(rawIndex.length)).update("\0").update(rawIndex)
    .update(String(indexFlags.length)).update("\0").update(indexFlags)
    .update(String(fsmonitorFlags.length)).update("\0").update(fsmonitorFlags).digest("hex");
  const sourceIdentity = sha256(JSON.stringify([...candidate.values()].map(item => [item.path, item.mode, item.objectId, item.contentSha256])));
  assertReviewRepositoryBinding(identity);
  const projection=freezeProjection({
    schemaVersion: 1, repositoryRoot: root, ...base, candidateTree,
    intendedUntracked: request.intendedUntracked,unexpectedUntracked,indexIdentity, sourceIdentity, entries,
  });
  projectionRepositories.set(projection,identity);
  projectionCatalogs.set(projection,new Map([...candidate].map(([path,entry])=>[path,Object.freeze({mode:entry.mode,objectId:entry.objectId,contentSha256:entry.contentSha256})])));
  if(selection)projectionSelections.set(projection,selection);
  if(correctionPolicy)projectionCorrections.set(projection,correctionPolicy);
  return projection;
}

/** Re-captures live source/index/scope and rejects any drift; it does not restore authority from metadata. */
export function revalidateWorkspaceReviewProjection(
  saved: WorkspaceReviewProjection,
  input: WorkspaceReviewProjectionRequest,
): WorkspaceReviewProjection {
  if(!isWorkspaceReviewProjectionGenuine(saved))throw new Error("workspace projection was not captured here");
  const identity=projectionRepositories.get(saved);
  if(!identity)throw new Error("workspace repository identity is unavailable");
  const request = normalizeRequest(input);
  assertReviewRepositoryBinding(identity);
  const data = plainData(saved, [
    "schemaVersion", "repositoryRoot", "baseCommit", "baseTree", "candidateTree", "intendedUntracked","unexpectedUntracked",
    "indexIdentity", "sourceIdentity", "entries",
  ], "saved workspace projection");
  if (!Array.isArray(data.intendedUntracked) || JSON.stringify([...data.intendedUntracked].sort()) !== JSON.stringify(request.intendedUntracked)) {
    throw new Error("workspace projection scope drifted");
  }
  const current = captureWorkspaceReviewProjection({repositoryRoot: request.repositoryRoot, intendedUntracked: request.intendedUntracked},projectionSelections.get(saved),projectionCorrections.get(saved));
  const comparable = ["schemaVersion", "repositoryRoot", "baseCommit", "baseTree", "candidateTree", "intendedUntracked","unexpectedUntracked","indexIdentity", "sourceIdentity", "entries"] as const;
  for (const key of comparable) if (JSON.stringify(data[key]) !== JSON.stringify(current[key])) {
    throw new Error(`workspace projection drifted: ${key}`);
  }
  assertReviewRepositoryBinding(identity);
  return current;
}

/** Builds the complete binary-safe diff between the captured base and candidate Git trees. */
export function diffWorkspaceReviewProjection(saved:WorkspaceReviewProjection,input:WorkspaceReviewProjectionRequest):string{
  const current=revalidateWorkspaceReviewProjection(saved,input);
  const base=current.baseTree;
  const diff=decoder.decode(runGit(current.repositoryRoot,[
    "diff","--no-ext-diff","--no-textconv","--no-color","--no-renames","--binary","--full-index",
    "--src-prefix=a/","--dst-prefix=b/",base,current.candidateTree,"--",
  ]));
  revalidateWorkspaceReviewProjection(current,input);
  return diff;
}
