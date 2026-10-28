import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
  lstatSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync,
} from "node:fs";
import {isAbsolute, join, relative, resolve, sep} from "node:path";
import {tmpdir} from "node:os";
import {isProxy} from "node:util/types";

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

type TreeEntry = {path: string; mode: WorkspaceReviewEntryMode; objectId: string};
type SourceEntry = TreeEntry & {bytes?: Buffer; contentSha256: string | null};
const outputLimit = 16 * 1024 * 1024;
const decoder = new TextDecoder("utf-8", {fatal: true});
const issuedProjections = new WeakSet<object>();

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
  environment.NO_COLOR = "1";
  return environment;
}

function runGit(root: string, args: readonly string[], input?: Buffer, extraEnvironment: NodeJS.ProcessEnv = {}): Buffer {
  // A shared conventional path can already contain executable hooks.
  // mkdtemp creates an owned empty directory before any repository Git command.
  const hooksDirectory = mkdtempSync(join(tmpdir(), "asen-review-hooks-"));
  try {
    return execFileSync("git", [
      "--no-pager", "-c", "core.fsmonitor=false", "-c", `core.hooksPath=${hooksDirectory}`,
      "-c", "diff.external=", "-C", root, ...args,
    ], {
      env: {...gitEnvironment(), ...extraEnvironment}, input, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      timeout: 10_000, maxBuffer: outputLimit,
    });
  } finally {
    rmSync(hooksDirectory, {recursive: true, force: true});
  }
}

function gitText(root: string, args: readonly string[], input?: Buffer, extraEnvironment?: NodeJS.ProcessEnv): string {
  return decoder.decode(runGit(root, args, input, extraEnvironment)).trim();
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
    try { gitText(root, ["symbolic-ref", "-q", "HEAD"]); } catch { throw new Error("repository HEAD cannot be resolved"); }
    return {baseCommit: null, baseTree: gitText(root, ["hash-object", "-t", "tree", "--stdin"], Buffer.alloc(0))};
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
    bytes = readFileSync(absolute);
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

/**
 * Freezes workspace bytes into an immutable Git tree using a private index.
 * The returned data is identity metadata only; it grants no review, write, or delivery authority.
 */
export function captureWorkspaceReviewProjection(input: WorkspaceReviewProjectionRequest): WorkspaceReviewProjection {
  const request = normalizeRequest(input);
  const root = canonicalRepository(request.repositoryRoot);
  const base = baseIdentity(root);
  const baseEntries = new Map(records(runGit(root, ["ls-tree", "-r", "-z", base.baseTree])).map(record => {
    const parsed = parseEntry(record, false); return [parsed.path, parsed] as const;
  }));
  const rawIndex = runGit(root, ["ls-files", "--stage", "-z"]);
  const observedUntracked=records(runGit(root,["ls-files","--others","--exclude-standard","-z"])).map(record=>decoder.decode(record));
  if(observedUntracked.some(path=>!safePath(path))||new Set(observedUntracked).size!==observedUntracked.length)throw new Error("repository contains an unsafe untracked path");
  const intendedSet=new Set(request.intendedUntracked),unexpectedUntracked=observedUntracked.filter(path=>!intendedSet.has(path)).sort();
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

  const privateDirectory = mkdtempSync(join(tmpdir(), "asen-review-projection-"));
  const privateIndex = join(privateDirectory, "index");
  const privateEnvironment = {GIT_INDEX_FILE: privateIndex, GIT_LITERAL_PATHSPECS: "1"};
  let candidateTree: string;
  try {
    runGit(root, ["read-tree", base.baseTree], undefined, privateEnvironment);
    for (const item of entries) {
      if (item.change === "gitlink") continue;
      if (item.change === "deleted") {
        runGit(root, ["update-index", "--force-remove", "--", item.path], undefined, privateEnvironment);
      } else {
        const source = candidate.get(item.path)!;
        const objectId = gitText(root, ["hash-object", "-w", "--no-filters", "--stdin"], source.bytes, privateEnvironment);
        if (objectId !== item.objectId) throw new Error("workspace blob identity changed during projection");
        runGit(root, ["update-index", "--add", "--cacheinfo", `${item.mode},${objectId},${item.path}`], undefined, privateEnvironment);
      }
    }
    candidateTree = gitText(root, ["write-tree"], undefined, privateEnvironment);
  } finally {
    rmSync(privateDirectory, {recursive: true, force: true});
  }

  const indexIdentity = sha256(rawIndex);
  const sourceIdentity = sha256(JSON.stringify([...candidate.values()].map(item => [item.path, item.mode, item.objectId, item.contentSha256])));
  return freezeProjection({
    schemaVersion: 1, repositoryRoot: root, ...base, candidateTree,
    intendedUntracked: request.intendedUntracked,unexpectedUntracked,indexIdentity, sourceIdentity, entries,
  });
}

/** Re-captures live source/index/scope and rejects any drift; it does not restore authority from metadata. */
export function revalidateWorkspaceReviewProjection(
  saved: WorkspaceReviewProjection,
  input: WorkspaceReviewProjectionRequest,
): WorkspaceReviewProjection {
  if(!isWorkspaceReviewProjectionGenuine(saved))throw new Error("workspace projection was not captured here");
  const request = normalizeRequest(input);
  const data = plainData(saved, [
    "schemaVersion", "repositoryRoot", "baseCommit", "baseTree", "candidateTree", "intendedUntracked","unexpectedUntracked",
    "indexIdentity", "sourceIdentity", "entries",
  ], "saved workspace projection");
  if (!Array.isArray(data.intendedUntracked) || JSON.stringify([...data.intendedUntracked].sort()) !== JSON.stringify(request.intendedUntracked)) {
    throw new Error("workspace projection scope drifted");
  }
  const current = captureWorkspaceReviewProjection({repositoryRoot: request.repositoryRoot, intendedUntracked: request.intendedUntracked});
  const comparable = ["schemaVersion", "repositoryRoot", "baseCommit", "baseTree", "candidateTree", "intendedUntracked","unexpectedUntracked","indexIdentity", "sourceIdentity", "entries"] as const;
  for (const key of comparable) if (JSON.stringify(data[key]) !== JSON.stringify(current[key])) {
    throw new Error(`workspace projection drifted: ${key}`);
  }
  return current;
}

/** Builds the complete binary-safe diff between the captured base and candidate Git trees. */
export function diffWorkspaceReviewProjection(saved:WorkspaceReviewProjection,input:WorkspaceReviewProjectionRequest):string{
  const current=revalidateWorkspaceReviewProjection(saved,input);
  const base=current.baseTree;
  const diff=decoder.decode(runGit(current.repositoryRoot,[
    "diff","--no-ext-diff","--no-color","--no-renames","--binary","--full-index",
    "--src-prefix=a/","--dst-prefix=b/",base,current.candidateTree,"--",
  ]));
  revalidateWorkspaceReviewProjection(current,input);
  return diff;
}
