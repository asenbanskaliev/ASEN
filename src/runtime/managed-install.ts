import {createHash,randomUUID} from "node:crypto";
import {lstat,mkdir,readFile,readdir,realpath,rename,rm,rmdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {types as utilTypes} from "node:util";
import type {ManagedAcquisitionDestinationClaim,ManagedAcquisitionDestinationDirectoryClaim} from "./managed-acquisition-copy.js";
import {applySetupPlan,type SetupPlan} from "./setup.js";

export type ManagedPathKind = "file" | "directory" | "link";

export interface ManagedPathMetadata {
 readonly kind: ManagedPathKind;
 readonly canonicalPath: string;
 readonly size?: number;
 readonly identity?: string;
}

export interface ManagedInstallHooks {
 readonly metadata?: (
  absolutePath: string,
  phase: "validate" | "revalidate" | "verify",
  fallback: () => Promise<ManagedPathMetadata | undefined>,
 ) => Promise<ManagedPathMetadata | undefined>;
 readonly copyPlan?: (plan: SetupPlan) => Promise<{created: string[]; unchanged: string[]} | void>;
 readonly beforePublish?: () => Promise<void>;
 readonly publication?: {
  readonly platform?: NodeJS.Platform;
  readonly rename?: (from: string, to: string) => Promise<void>;
  readonly wait?: (milliseconds: number) => Promise<void>;
 };
 readonly cleanupFile?: (absolutePath: string) => Promise<void>;
}

export interface ManagedInstallFileInput {
 readonly sourcePath: string;
 readonly destinationPath: string;
}

export interface ManagedAcquisitionFile {
 readonly sourcePath: string;
 readonly destinationPath: string;
 readonly size: number;
 readonly sha256: string;
}

export interface ManagedAcquisitionManifest {
 readonly schema: "asen.managed-acquisition/v1";
 readonly version: string;
 readonly files: readonly ManagedAcquisitionFile[];
}

export interface ManagedInstallRequest {
 readonly prefix: string;
 readonly packageRoot: string;
 readonly version: string;
 readonly files: readonly ManagedInstallFileInput[];
 readonly protectedPaths: readonly string[];
 readonly confirmed: boolean;
 readonly hooks?: ManagedInstallHooks;
}

export interface ManagedInstallFile {
 readonly path: string;
 readonly size: number;
 readonly sha256: string;
}

export interface ManagedVersionInventory {
 readonly version: string;
 readonly files: readonly ManagedInstallFile[];
}

export type ManagedInstallInspection = Readonly<{
 status: "absent";
 managedRoot: string;
 activeVersion: null;
 runtimeReady: false;
 versions: readonly [];
} | {
 status: "foreign";
 managedRoot: string;
 activeVersion: null;
 runtimeReady: false;
 versions: readonly [];
 reason: string;
} | {
 status: "owned";
 managedRoot: string;
 activeVersion: string | null;
 runtimeReady: false;
 versions: readonly ManagedVersionInventory[];
}>;

export interface ManagedStageReport {
 readonly status: "staged" | "unchanged";
 readonly prefix: string;
 readonly managedRoot: string;
 readonly versionRoot: string;
 readonly version: string;
 readonly files: readonly ManagedInstallFile[];
 readonly activation: "not-active";
 readonly runtimeReady: false;
}

export type ManagedInstallErrorCode =
 | "CONFIRMATION_REQUIRED"
 | "INVALID_ABSOLUTE_PATH"
 | "INVALID_VERSION"
 | "INVALID_MANIFEST_PATH"
 | "INVALID_ACQUISITION_MANIFEST"
 | "DUPLICATE_DESTINATION"
 | "SENSITIVE_PATH"
 | "PATH_OVERLAP"
 | "FOREIGN_MANAGED_ROOT"
 | "MANAGED_ROOT_LINKED"
 | "SOURCE_NOT_REGULAR"
 | "SOURCE_DRIFT"
 | "VERSION_CONFLICT"
 | "STAGING_FAILED"
 | "STAGING_RETAINED";

export class ManagedInstallError extends Error {
 readonly code: ManagedInstallErrorCode;
 readonly retainedStage: string | undefined;

 constructor(code: ManagedInstallErrorCode, message: string, options?: {cause?: unknown; retainedStage?: string}) {
  super(message, {cause: options?.cause});
  this.name = "ManagedInstallError";
  this.code = code;
  this.retainedStage = options?.retainedStage;
 }
}

const RECEIPT = "managed-install.json";
const SCHEMA = "asen.managed-install/v1";
const ACQUISITION_SCHEMA = "asen.managed-acquisition/v1";
const PRODUCT = "asen";

type Receipt = {
 schema: typeof SCHEMA;
 product: typeof PRODUCT;
 canonicalManagedRoot: string;
 version: string;
 files: ManagedInstallFile[];
};

type ObservedSource = {
 input: ManagedInstallFileInput;
 absolute: string;
 metadata: ManagedPathMetadata;
 bytes: Buffer;
 file: ManagedInstallFile;
};

const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const normalized = (value: string) => process.platform === "win32"
 ? path.resolve(value).toLowerCase()
 : path.resolve(value);

function overlaps(left: string, right: string): boolean {
 const a = normalized(left);
 const b = normalized(right);
 return a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);
}

function within(root: string, value: string): boolean {
 const relative = path.relative(root, value);
 return relative === "" || (
  !path.isAbsolute(relative)
  && relative !== ".."
  && !relative.startsWith(`..${path.sep}`)
 );
}
async function defaultMetadata(absolutePath: string): Promise<ManagedPathMetadata | undefined> {
 try {
  const value = await lstat(absolutePath);
  if (value.isSymbolicLink()) return {kind: "link", canonicalPath: absolutePath};
  const canonicalPath = await realpath(absolutePath);
  const identity = `${value.dev}:${value.ino}`;
  if (value.isFile()) return {kind: "file", canonicalPath, size: value.size, identity};
  if (value.isDirectory()) return {kind: "directory", canonicalPath, identity};
  return {kind: "link", canonicalPath: absolutePath};
 } catch (error) {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
  throw error;
 }
}

async function metadata(
 file: string,
 phase: "validate" | "revalidate" | "verify",
 hooks?: ManagedInstallHooks,
): Promise<ManagedPathMetadata | undefined> {
 const fallback = () => defaultMetadata(file);
 return hooks?.metadata ? hooks.metadata(file, phase, fallback) : fallback();
}

function fail(code: ManagedInstallErrorCode, message: string): never {
 throw new ManagedInstallError(code, message);
}

function absolute(value: string, noun: string): string {
 if (!path.isAbsolute(value)) fail("INVALID_ABSOLUTE_PATH", `Managed ${noun} must be absolute`);
 return path.resolve(value);
}

function relative(value: string, noun: string): string {
 const malformed = typeof value !== "string"
  || !value
  || value !== value.trim()
  || value.includes("\\")
  || path.isAbsolute(value)
  || value.includes(":");
 if (malformed) fail("INVALID_MANIFEST_PATH", `Managed ${noun} path must be canonical relative data`);

 const parts = value.split("/");
 if (parts.some(part => !part || part === "." || part === "..")) {
  fail("INVALID_MANIFEST_PATH", `Managed ${noun} path must be canonical relative data`);
 }
 const sensitive = parts.some(part => part === ".git"
  || part === "node_modules"
  || /^\.env/iu.test(part)
  || /^(?:secret|secrets|credential|credentials)$/iu.test(part)
  || /\.(?:pem|key)$/iu.test(part));
 if (sensitive) fail("SENSITIVE_PATH", `Managed ${noun} path is sensitive or outside the distributable file set`);
 return parts.join(path.sep);
}

function stableVersion(value: string): string {
 const stable = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
 if (!stable.test(value)) fail("INVALID_VERSION", "Managed installation version must be a stable semantic version");
 return value;
}

function parseFiles(files: readonly ManagedInstallFileInput[]): ManagedInstallFileInput[] {
 if (!Array.isArray(files) || files.length === 0) {
  fail("INVALID_MANIFEST_PATH", "Managed installation files must be a non-empty finite list");
 }
 const seen = new Set<string>();
 return files.map(item => {
  const sourcePath = relative(item.sourcePath, "source");
  const destinationPath = relative(item.destinationPath, "destination");
  const key = normalized(destinationPath);
  if (seen.has(key)) fail("DUPLICATE_DESTINATION", "Managed destination paths must be unique");
  seen.add(key);
  return {sourcePath, destinationPath};
 });
}

function invalidAcquisition(message: string): never {
 fail("INVALID_ACQUISITION_MANIFEST", message);
}

function exactDataObject(value: unknown, keys: readonly string[], noun: string): Record<string, unknown> {
 if (!value || typeof value !== "object" || utilTypes.isProxy(value) || Array.isArray(value)) {
  return invalidAcquisition(`Managed acquisition ${noun} must be an exact plain data object`);
 }
 if (Object.getPrototypeOf(value) !== Object.prototype) {
  return invalidAcquisition(`Managed acquisition ${noun} must be an exact plain data object`);
 }
 const ownKeys = Reflect.ownKeys(value);
 if (ownKeys.some(key => typeof key === "symbol") || ownKeys.length !== keys.length
  || [...ownKeys].sort().join(",") !== [...keys].sort().join(",")) {
  return invalidAcquisition(`Managed acquisition ${noun} has missing or extra fields`);
 }
 const descriptors = Object.getOwnPropertyDescriptors(value);
 for (const key of keys) {
  const descriptor = descriptors[key];
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
   return invalidAcquisition(`Managed acquisition ${noun} fields must be own enumerable data`);
  }
 }
 return Object.fromEntries(keys.map(key => [key, descriptors[key]!.value]));
}

function exactDenseArray(value: unknown): unknown[] {
 if (typeof value !== "object" || value === null || utilTypes.isProxy(value)
  || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
  return invalidAcquisition("Managed acquisition files must be a dense plain array");
 }
 const length = value.length;
 if (length < 1 || length > 4096) {
  return invalidAcquisition("Managed acquisition files must contain 1 to 4096 records");
 }
 const ownKeys = Reflect.ownKeys(value);
 if (ownKeys.some(key => typeof key === "symbol") || ownKeys.length !== length + 1) {
  return invalidAcquisition("Managed acquisition files must be a dense plain array without extra fields");
 }
 const result: unknown[] = [];
 for (let index = 0; index < length; index++) {
  const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
   return invalidAcquisition("Managed acquisition files must be a dense plain array without extra fields");
  }
  result.push(descriptor.value);
 }
 return result;
}

/**
 * Decode the exact local `asen.managed-acquisition/v1` data schema.
 *
 * The manifest contains a stable version and a dense ordered list of 1–4096
 * `{sourcePath,destinationPath,size,sha256}` records. Paths use the existing
 * managed-install canonical relative-path, sensitive-name, and duplicate rules;
 * the returned independent copy uses forward slashes and is deeply frozen.
 *
 * This pure decoder treats sizes and hashes only as caller-supplied descriptions.
 * It performs no filesystem access, byte hashing, hooks, commands, leases,
 * staging, selection, ownership, consent, authenticity, authority, or runtime
 * readiness checks. Those concerns require separate later operations.
 */
export function decodeManagedAcquisitionManifest(input: unknown): ManagedAcquisitionManifest {
 const record = exactDataObject(input, ["schema", "version", "files"], "manifest");
 if (record.schema !== ACQUISITION_SCHEMA) {
  invalidAcquisition(`Managed acquisition schema must be ${ACQUISITION_SCHEMA}`);
 }
 if (typeof record.version !== "string") {
  invalidAcquisition("Managed acquisition version must be a string");
 }
 const version = stableVersion(record.version);
 const rawFiles = exactDenseArray(record.files);
 const described = rawFiles.map(value => exactDataObject(
  value,
  ["sourcePath", "destinationPath", "size", "sha256"],
  "file record",
 ));
 const paths = parseFiles(described.map(item => ({
  sourcePath: item.sourcePath as string,
  destinationPath: item.destinationPath as string,
 })));
 const files = described.map((item, index): ManagedAcquisitionFile => {
  if (!Number.isSafeInteger(item.size) || (item.size as number) < 0) {
   invalidAcquisition("Managed acquisition file size must be a nonnegative safe integer");
  }
  if (typeof item.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(item.sha256)) {
   invalidAcquisition("Managed acquisition file sha256 must be 64 lowercase hexadecimal characters");
  }
  const parsed = paths[index]!;
  return Object.freeze({
   sourcePath: parsed.sourcePath.split(path.sep).join("/"),
   destinationPath: parsed.destinationPath.split(path.sep).join("/"),
   size: item.size as number,
   sha256: item.sha256,
  });
 });
 return Object.freeze({schema: ACQUISITION_SCHEMA, version, files: Object.freeze(files)});
}

function parseReceipt(value: unknown, canonicalRoot: string): Receipt | undefined {
 if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
 const record = value as Record<string, unknown>;
 const expectedKeys = "canonicalManagedRoot,files,product,schema,version";
 const validHeader = Object.keys(record).sort().join(",") === expectedKeys
  && record.schema === SCHEMA
  && record.product === PRODUCT
  && record.canonicalManagedRoot === canonicalRoot
  && typeof record.version === "string"
  && Array.isArray(record.files);
 if (!validHeader) return undefined;

 try {
  stableVersion(record.version as string);
  const seen = new Set<string>();
  if ((record.files as unknown[]).length === 0) return undefined;
  const files = (record.files as unknown[]).map(value => {
   if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
   const file = value as Record<string, unknown>;
   const validFile = Object.keys(file).sort().join(",") === "path,sha256,size"
    && typeof file.path === "string"
    && typeof file.size === "number"
    && Number.isSafeInteger(file.size)
    && file.size >= 0
    && typeof file.sha256 === "string"
    && /^[a-f0-9]{64}$/u.test(file.sha256);
   if (!validFile) throw new Error();
   relative(file.path as string, "destination");
   if (seen.has(file.path as string)) throw new Error();
   seen.add(file.path as string);
   return {path: file.path as string, size: file.size as number, sha256: file.sha256 as string};
  });
  return {
   schema: SCHEMA,
   product: PRODUCT,
   canonicalManagedRoot: canonicalRoot,
   version: record.version as string,
   files,
  };
 } catch {
  return undefined;
 }
}

async function ownedReceipt(managedRoot: string, root: ManagedPathMetadata): Promise<Receipt | undefined> {
 if (root.kind !== "directory") return undefined;
 try {
  const contents = await readFile(path.join(managedRoot, RECEIPT), "utf8");
  return parseReceipt(JSON.parse(contents), root.canonicalPath);
 } catch (error) {
  if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return undefined;
  throw error;
 }
}

/** Inspect only manifest-derived directories; never descend into an unlisted entry. */
async function matchesManifestNamespace(root: string, files: readonly Pick<ManagedInstallFile,"path">[]): Promise<boolean> {
 const rootMetadata=await defaultMetadata(root);
 if(rootMetadata?.kind!=="directory")return false;
 const key=(name:string)=>process.platform==="win32"?name.toLowerCase():name;
 const directories=new Map<string,Set<string>>();
 for(const file of files){
  const parts=file.path.split("/");
  for(const [index,name] of parts.entries()){
   const parent=key(parts.slice(0,index).join("/"));
   let allowed=directories.get(parent);
   if(!allowed){allowed=new Set<string>();directories.set(parent,allowed);}
   allowed.add(key(name));
  }
 }
 for(const [relativeDirectory,allowed] of directories){
  const directory=path.join(root,...relativeDirectory.split("/"));
  const observed=await defaultMetadata(directory);
  if(observed?.kind!=="directory"||!within(rootMetadata.canonicalPath,observed.canonicalPath))return false;
  try{
   const entries=await readdir(directory);
   if(entries.length!==allowed.size||entries.some(name=>!allowed.has(key(name))))return false;
  }catch(error){
   if(["ENOENT","ENOTDIR"].includes((error as NodeJS.ErrnoException).code??""))return false;
   throw error;
  }
 }
 return true;
}

async function verifyInstalled(
 root: string,
 files: readonly ManagedInstallFile[],
 hooks?: ManagedInstallHooks,
): Promise<boolean> {
 if (files.length === 0) return false;
 const rootMetadata = await metadata(root, "verify", hooks);
 if (!rootMetadata || rootMetadata.kind !== "directory") return false;
 for (const file of files) {
  const target = path.join(root, ...file.path.split("/"));
  const observed = await metadata(target, "verify", hooks);
  if (!observed || observed.kind !== "file" || !within(rootMetadata.canonicalPath, observed.canonicalPath)) return false;
  const bytes = await readFile(target);
  if (bytes.length !== file.size || digest(bytes) !== file.sha256) return false;
 }
 return matchesManifestNamespace(root,files);
}

function samePhysicalDirectory(expected: ManagedPathMetadata | undefined, actual: ManagedPathMetadata | undefined): boolean {
 return expected?.kind === "directory"
  && actual?.kind === "directory"
  && expected.identity !== undefined
  && expected.identity === actual.identity
  && expected.canonicalPath === actual.canonicalPath;
}

async function claimDirectory(directory: string): Promise<ManagedPathMetadata> {
 const claimed = await defaultMetadata(directory);
 if (claimed?.kind !== "directory" || claimed.identity === undefined) {
  throw new Error(`Unable to establish physical identity for fresh managed directory: ${directory}`);
 }
 return claimed;
}

async function verifyStagedFiles(root: string, sources: readonly ObservedSource[], hooks?: ManagedInstallHooks): Promise<void> {
 const rootMetadata = await metadata(root, "verify", hooks);
 if (!rootMetadata || rootMetadata.kind !== "directory") throw new Error("staged root is not a regular directory");
 for (const source of sources) {
  const target = path.join(root, source.input.destinationPath);
  const actual = await metadata(target, "verify", hooks);
  if (!actual || actual.kind !== "file" || !within(rootMetadata.canonicalPath, actual.canonicalPath)) {
   throw new Error(`staged destination is not a regular contained file: ${source.file.path}`);
  }
  const bytes = await readFile(target);
  if (bytes.length !== source.file.size || digest(bytes) !== source.file.sha256) {
   throw new Error(`staged bytes failed integrity validation: ${source.file.path}`);
  }
 }
 if(!await matchesManifestNamespace(root,sources.map(source=>source.file))){
  throw new Error("staged contents include an unlisted or invalid entry");
 }
}

const WINDOWS_PUBLICATION_DELAYS_MS = [200,400,800,1600] as const;

async function publishStage(
 from: string,
 to: string,
 validate: () => Promise<void>,
 adapter?: ManagedInstallHooks["publication"],
): Promise<void> {
 const platform = adapter?.platform ?? process.platform;
 const move = adapter?.rename ?? rename;
 const wait = adapter?.wait ?? (milliseconds => new Promise<void>(resolve => setTimeout(resolve,milliseconds)));
 let firstError: unknown;
 for (let attempt=0; ; attempt++) {
  await validate();
  try {
   await move(from,to);
   return;
  } catch (cause) {
   if (attempt===0) firstError=cause;
   const code=(cause as NodeJS.ErrnoException | undefined)?.code;
   if (platform!=="win32" || !["EPERM","EBUSY","EACCES"].includes(code ?? "")) throw cause;
   // A reported failure must not hide a moved/replaced tree or an occupied destination.
   await validate();
   if (attempt===WINDOWS_PUBLICATION_DELAYS_MS.length) throw firstError;
   await wait(WINDOWS_PUBLICATION_DELAYS_MS[attempt]!);
  }
 }
}

const VERSION_CATALOG = "managed-versions.json";
const VERSION_CATALOG_SCHEMA = "asen.managed-version-catalog/v1";

function parseVersionCatalog(value:unknown,canonicalRoot:string,legacy:Receipt):ManagedVersionInventory[]|undefined {
 if(!value||typeof value!=="object"||Array.isArray(value))return undefined;
 const record=value as Record<string,unknown>;
 if(Object.keys(record).sort().join(",")!=="canonicalManagedRoot,product,schema,versions"
  ||record.schema!==VERSION_CATALOG_SCHEMA||record.product!==PRODUCT||record.canonicalManagedRoot!==canonicalRoot
  ||!Array.isArray(record.versions)||record.versions.length===0)return undefined;
 const versions:ManagedVersionInventory[]=[],seen=new Set<string>();
 for(const item of record.versions){
  if(!item||typeof item!=="object"||Array.isArray(item)||Object.keys(item).sort().join(",")!=="files,version")return undefined;
  const entry=item as Record<string,unknown>;
  const parsed=parseReceipt({schema:SCHEMA,product:PRODUCT,canonicalManagedRoot:canonicalRoot,version:entry.version,files:entry.files},canonicalRoot);
  if(!parsed||seen.has(parsed.version)||new Set(parsed.files.map(file=>normalized(file.path))).size!==parsed.files.length)return undefined;
  seen.add(parsed.version);versions.push({version:parsed.version,files:parsed.files});
 }
 const anchor=versions.find(item=>item.version===legacy.version);
 return anchor&&JSON.stringify(anchor.files)===JSON.stringify(legacy.files)?versions:undefined;
}
function catalogFileAt(value:ManagedPathMetadata|undefined,file:string):value is ManagedPathMetadata&{kind:"file";identity:string;size:number} {
 return value?.kind==="file"&&value.identity!==undefined&&typeof value.size==="number"&&normalized(value.canonicalPath)===normalized(file);
}
function catalogDirectoryAt(value:ManagedPathMetadata|undefined,directory:string):value is ManagedPathMetadata&{kind:"directory";identity:string} {
 return value?.kind==="directory"&&value.identity!==undefined&&normalized(value.canonicalPath)===normalized(directory);
}
function sameCatalogFile(before:ManagedPathMetadata,after:ManagedPathMetadata|undefined,file:string):boolean {
 return catalogFileAt(after,file)&&before.identity===after.identity&&before.canonicalPath===after.canonicalPath&&before.size===after.size;
}
/** Optional finite inventory only; no catalog, receipt, version or selector is written. */
async function catalogInventory(managedRoot:string,root:ManagedPathMetadata,legacy:Receipt,hooks?:ManagedInstallHooks):Promise<ManagedVersionInventory[]|"invalid"|undefined> {
 const file=path.join(managedRoot,VERSION_CATALOG),anchorFile=path.join(managedRoot,RECEIPT),versionsRoot=path.join(managedRoot,"versions");
 try{
  const before=await defaultMetadata(file);if(!before)return undefined;
  if(!catalogFileAt(before,file))return "invalid";
  const rootBefore=await defaultMetadata(managedRoot),parentBefore=await defaultMetadata(versionsRoot),anchorBefore=await defaultMetadata(anchorFile);
  if(!catalogDirectoryAt(rootBefore,managedRoot)||!samePhysicalDirectory(root,rootBefore)
   ||!catalogDirectoryAt(parentBefore,versionsRoot)||!catalogFileAt(anchorBefore,anchorFile))return "invalid";
  const bytes=await readFile(file),anchorBytes=await readFile(anchorFile);
  const currentLegacy=parseReceipt(JSON.parse(anchorBytes.toString("utf8")),root.canonicalPath);
  if(JSON.stringify(currentLegacy)!==JSON.stringify(legacy))return "invalid";
  const versions=parseVersionCatalog(JSON.parse(bytes.toString("utf8")),root.canonicalPath,legacy);if(!versions)return "invalid";
  const claims:ManagedPathMetadata[]=[];
  for(const version of versions){
   const directory=path.join(versionsRoot,version.version),claim=await defaultMetadata(directory);
   if(!catalogDirectoryAt(claim,directory)||!await verifyInstalled(directory,version.files,hooks))return "invalid";
   claims.push(claim);
  }
  for(const [index,version] of versions.entries())if(!samePhysicalDirectory(claims[index],await defaultMetadata(path.join(versionsRoot,version.version))))return "invalid";
  if(!samePhysicalDirectory(parentBefore,await defaultMetadata(versionsRoot))||!samePhysicalDirectory(rootBefore,await defaultMetadata(managedRoot)))return "invalid";
  if(!sameCatalogFile(anchorBefore,await defaultMetadata(anchorFile),anchorFile)||!sameCatalogFile(before,await defaultMetadata(file),file))return "invalid";
  if(!(await readFile(anchorFile)).equals(anchorBytes)||!(await readFile(file)).equals(bytes))return "invalid";
  if(!sameCatalogFile(anchorBefore,await defaultMetadata(anchorFile),anchorFile)||!sameCatalogFile(before,await defaultMetadata(file),file)
   ||!samePhysicalDirectory(rootBefore,await defaultMetadata(managedRoot)))return "invalid";
  return versions;
 }catch{return "invalid";}
}

type ManagedSelectorObservation = Readonly<{claim:ManagedPathMetadata;bytes:Buffer}>;
/** Observe data only: a selector is neither execution consent nor runtime proof. */
async function observeManagedSelector(managedRoot:string,root:ManagedPathMetadata,hooks?:ManagedInstallHooks):Promise<ManagedSelectorObservation|"invalid"|undefined>{
 const file=path.join(managedRoot,"current");
 try{
  const claim=await metadata(file,"validate",hooks);if(!claim)return undefined;
  if(!catalogFileAt(claim,file)||!catalogDirectoryAt(root,managedRoot))return "invalid";
  const bytes=await readFile(file);if(bytes.length!==claim.size)return "invalid";
  return {claim,bytes};
 }catch{return "invalid";}
}
async function managedSelectorUnchanged(managedRoot:string,root:ManagedPathMetadata,observed:ManagedSelectorObservation|undefined,hooks?:ManagedInstallHooks):Promise<boolean>{
 const file=path.join(managedRoot,"current");
 try{
  if(!observed)return await metadata(file,"revalidate",hooks)===undefined
   &&samePhysicalDirectory(root,await metadata(managedRoot,"revalidate",hooks));
  if(!samePhysicalDirectory(root,await metadata(managedRoot,"revalidate",hooks))
   ||!sameCatalogFile(observed.claim,await metadata(file,"revalidate",hooks),file))return false;
  if(!(await readFile(file)).equals(observed.bytes))return false;
  return sameCatalogFile(observed.claim,await metadata(file,"revalidate",hooks),file)
   &&samePhysicalDirectory(root,await metadata(managedRoot,"revalidate",hooks));
 }catch{return false;}
}

/** Read-only inventory. A receipt proves only this module's bounded managed child, never live authority. */
export async function inspectManagedInstall(input:Readonly<{prefix:string;hooks?:ManagedInstallHooks}>):Promise<ManagedInstallInspection>{
 const prefix=absolute(input.prefix,"installation prefix"),managedRoot=path.join(prefix,"install"),root=await metadata(managedRoot,"validate",input.hooks);
 if(!root)return {status:"absent",managedRoot,activeVersion:null,runtimeReady:false,versions:[]};
 if(root.kind!=="directory")return {status:"foreign",managedRoot,activeVersion:null,runtimeReady:false,versions:[],reason:root.kind==="link"?"linked ASEN managed-install root":"missing or malformed ASEN managed-install receipt"};
 const receipt=await ownedReceipt(managedRoot,root);if(!receipt)return {status:"foreign",managedRoot,activeVersion:null,runtimeReady:false,versions:[],reason:"missing or malformed ASEN managed-install receipt"};
 const selector=await observeManagedSelector(managedRoot,root,input.hooks);
 const catalog=await catalogInventory(managedRoot,root,receipt,input.hooks);
 if(catalog==="invalid")return {status:"foreign",managedRoot,activeVersion:null,runtimeReady:false,versions:[],reason:"ASEN managed-version catalog failed validation"};
 const versionRoot=path.join(managedRoot,"versions",receipt.version);if(!catalog&&!await verifyInstalled(versionRoot,receipt.files,input.hooks))return {status:"foreign",managedRoot,activeVersion:null,runtimeReady:false,versions:[],reason:"owned ASEN managed-install contents failed integrity validation"};
 const versions=catalog??[{version:receipt.version,files:receipt.files}];
 const selectorFailure=():ManagedInstallInspection=>({status:"foreign",managedRoot,activeVersion:null,runtimeReady:false,versions:[],reason:"ASEN managed-version selector failed validation"});
 if(selector==="invalid")return selectorFailure();
 const selected=selector?versions.find(item=>Buffer.from(item.version+"\n").equals(selector.bytes)):undefined;
 if((selector&&!selected)||!await managedSelectorUnchanged(managedRoot,root,selector,input.hooks))return selectorFailure();
 return {status:"owned",managedRoot,activeVersion:selected?.version??null,runtimeReady:false,versions};
}

/** Shared finite source guards for managed staging. */
async function observeManagedSources(packageRoot:string,packageMeta:ManagedPathMetadata,files:readonly ManagedInstallFileInput[],hooks?:ManagedInstallHooks):Promise<ObservedSource[]> {
 const observed:ObservedSource[]=[];
 for(const input of files){const absolutePath=path.join(packageRoot,input.sourcePath),item=await metadata(absolutePath,"validate",hooks);if(!item||item.kind!=="file"||!within(packageMeta.canonicalPath,item.canonicalPath))fail("SOURCE_NOT_REGULAR",`Managed installation source must be a regular, unlinked file: ${input.sourcePath.split(path.sep).join("/")}`);const bytes=await readFile(absolutePath);observed.push({input,absolute:absolutePath,metadata:item,bytes,file:{path:input.destinationPath.split(path.sep).join("/"),size:bytes.length,sha256:digest(bytes)}});}
 return observed;
}
async function revalidateManagedSources(observed:readonly ObservedSource[],hooks?:ManagedInstallHooks):Promise<void> {
 for(const source of observed){const again=await metadata(source.absolute,"revalidate",hooks);if(!again||again.kind!=="file"||again.canonicalPath!==source.metadata.canonicalPath||again.size!==source.metadata.size||digest(await readFile(source.absolute))!==source.file.sha256)fail("SOURCE_DRIFT",`Managed installation source identity changed before staging: ${source.input.sourcePath.split(path.sep).join("/")}`);}
}

/** Confirmed first-version staging only; activation, upgrades, locking, and runtime verification belong to U4. */
export async function stageManagedInstall(request:ManagedInstallRequest):Promise<ManagedStageReport>{
 if(request.confirmed!==true)fail("CONFIRMATION_REQUIRED","Managed installation staging requires explicit confirmation");
 const prefix=absolute(request.prefix,"installation prefix"),packageRoot=absolute(request.packageRoot,"package root"),version=stableVersion(request.version),files=parseFiles(request.files),protectedPaths=request.protectedPaths.map(value=>absolute(value,"protected path"));
 const managedRoot=path.join(prefix,"install"),versionRoot=path.join(managedRoot,"versions",version),hooks=request.hooks;
 if(overlaps(managedRoot,packageRoot)||protectedPaths.some(value=>overlaps(managedRoot,value)||overlaps(packageRoot,value)))fail("PATH_OVERLAP","Managed installation paths overlap package source or protected data");
 const [prefixMeta,packageMeta,managedMeta]=await Promise.all([metadata(prefix,"validate",hooks),metadata(packageRoot,"validate",hooks),metadata(managedRoot,"validate",hooks)]);
 if(prefixMeta&&prefixMeta.kind!=="directory")fail("FOREIGN_MANAGED_ROOT","Refusing foreign or malformed managed installation root");
 if(!packageMeta||packageMeta.kind!=="directory")fail("SOURCE_NOT_REGULAR","Managed package root must be a regular, unlinked directory");
 if(managedMeta?.kind==="link")fail("MANAGED_ROOT_LINKED","Refusing linked managed installation root");
 const receipt=managedMeta?await ownedReceipt(managedRoot,managedMeta):undefined;if(managedMeta&&!receipt)fail("FOREIGN_MANAGED_ROOT","Refusing foreign or malformed managed installation root");
 const observed=await observeManagedSources(packageRoot,packageMeta,files,hooks);
 if(receipt){const same=receipt.version===version&&JSON.stringify(receipt.files)===JSON.stringify(observed.map(item=>item.file))&&await verifyInstalled(versionRoot,receipt.files,hooks);if(!same)fail("VERSION_CONFLICT",`Managed version ${version} already exists with different data`);return {status:"unchanged",prefix,managedRoot,versionRoot,version,files:receipt.files,activation:"not-active",runtimeReady:false};}
 const [prefixAgain,packageAgain,managedAgain]=await Promise.all([
  metadata(prefix,"revalidate",hooks),
  metadata(packageRoot,"revalidate",hooks),
  metadata(managedRoot,"revalidate",hooks),
 ]);
 const prefixStable=prefixMeta
  ? prefixAgain?.kind==="directory"&&prefixAgain.canonicalPath===prefixMeta.canonicalPath
  : prefixAgain===undefined;
 if(!prefixStable||!packageAgain||packageAgain.kind!=="directory"||packageAgain.canonicalPath!==packageMeta.canonicalPath||managedAgain)fail("SOURCE_DRIFT","Managed installation root identity changed before staging");
 await revalidateManagedSources(observed,hooks);
 const stagingRoot=path.join(managedRoot,"staging"),stageRoot=path.join(stagingRoot,`${version}-${randomUUID()}`);
 const destinations=observed.map(item=>path.join(stageRoot,item.input.destinationPath));
 const versionsRoot=path.dirname(versionRoot),receiptTemp=path.join(managedRoot,`${RECEIPT}.${randomUUID()}.tmp`);
 const createdDirs=[managedRoot,stagingRoot,stageRoot,...destinations.map(path.dirname),versionsRoot,versionRoot];
 let retained=stageRoot,claimedManaged:ManagedPathMetadata|undefined,claimedStage:ManagedPathMetadata|undefined,claimedVersions:ManagedPathMetadata|undefined;
 try{
  await mkdir(prefix,{recursive:true});
  await mkdir(managedRoot);
  claimedManaged=await claimDirectory(managedRoot);
  await mkdir(stagingRoot);
  await mkdir(stageRoot);
  claimedStage=await claimDirectory(stageRoot);
  const plan:SetupPlan={home:stageRoot,entries:observed.map((item,index)=>({source:item.absolute,destination:destinations[index]!}))};
  await (hooks?.copyPlan??applySetupPlan)(plan);
  await verifyStagedFiles(stageRoot,observed,hooks);

  await hooks?.beforePublish?.();
  const managedBeforePublish=await defaultMetadata(managedRoot),stageBeforePublish=await defaultMetadata(stageRoot);
  if(!samePhysicalDirectory(claimedManaged,managedBeforePublish)||!samePhysicalDirectory(claimedStage,stageBeforePublish)){
   throw new Error("Managed installation root identity changed before publication");
  }
  await verifyStagedFiles(stageRoot,observed,hooks);
  await mkdir(versionsRoot);
  claimedVersions=await claimDirectory(versionsRoot);
  const validatePublicationPaths=async()=>{
   const [currentManaged,currentStage,currentVersions,destination]=await Promise.all([
    defaultMetadata(managedRoot),defaultMetadata(stageRoot),defaultMetadata(versionsRoot),defaultMetadata(versionRoot),
   ]);
   if(!samePhysicalDirectory(claimedManaged,currentManaged)
    ||!samePhysicalDirectory(claimedStage,currentStage)
    ||!samePhysicalDirectory(claimedVersions,currentVersions)){
    throw new Error("Managed installation root identity changed before publication");
   }
   if(destination)throw new Error("Managed version destination appeared before publication");
  };
  await publishStage(stageRoot,versionRoot,async()=>{
   await validatePublicationPaths();
   await verifyStagedFiles(stageRoot,observed,hooks);
   await validatePublicationPaths();
  },hooks?.publication);
  retained=versionRoot;
  const managedAfterPublish=await defaultMetadata(managedRoot);
  if(!managedAfterPublish||!samePhysicalDirectory(claimedManaged,managedAfterPublish)){
   throw new Error("Managed installation root identity changed before publication");
  }
  // Publication changes the canonical pathname. Claim the destination only after
  // the managed root itself is proven unchanged, then verify every published byte again.
  claimedStage=await claimDirectory(versionRoot);
  await verifyStagedFiles(versionRoot,observed,hooks);
  const newReceipt:Receipt={schema:SCHEMA,product:PRODUCT,canonicalManagedRoot:managedAfterPublish.canonicalPath,version,files:observed.map(item=>item.file)};
  await writeFile(receiptTemp,JSON.stringify(newReceipt,null,2)+"\n",{flag:"wx",mode:0o600});
  await rename(receiptTemp,path.join(managedRoot,RECEIPT));
  return {status:"staged",prefix,managedRoot,versionRoot,version,files:newReceipt.files,activation:"not-active",runtimeReady:false};
 }catch(cause){
  let cleanupSafe=true;
  const currentManaged=await defaultMetadata(managedRoot),currentRetained=await defaultMetadata(retained);
  const currentVersions=await defaultMetadata(versionsRoot),destination=await defaultMetadata(versionRoot);
  const versionsSafe=claimedVersions?samePhysicalDirectory(claimedVersions,currentVersions):currentVersions===undefined;
  // Report an ambiguous move's existing destination, without adopting it for cleanup.
  const diagnosticRetained=retained===stageRoot&&!currentRetained&&destination?.kind==="directory"
   &&samePhysicalDirectory(claimedManaged,currentManaged)&&claimedVersions&&versionsSafe?versionRoot:retained;
  // A foreign destination (even empty) or replaced parent was never ours to remove.
  if(!samePhysicalDirectory(claimedManaged,currentManaged)||!samePhysicalDirectory(claimedStage,currentRetained)
   ||!versionsSafe||(retained!==versionRoot&&destination!==undefined))cleanupSafe=false;
  else{
   const cleanup=hooks?.cleanupFile??(file=>rm(file,{force:true}));
   const retainedDestinations=destinations.map(file=>retained===versionRoot?path.join(versionRoot,path.relative(stageRoot,file)):file);
   for(const file of [receiptTemp,...retainedDestinations].reverse())try{await cleanup(file);}catch{cleanupSafe=false;}
   const ownedDirs=createdDirs.filter(directory=>directory!==versionRoot||retained===versionRoot);
   for(const directory of [...new Set(ownedDirs)].sort((a,b)=>b.length-a.length)){
    try{await rmdir(directory);}catch(error){const code=(error as NodeJS.ErrnoException).code;if(code==="ENOTEMPTY")cleanupSafe=false;else if(code!=="ENOENT")cleanupSafe=false;}
   }
  }
  const message=cause instanceof Error?cause.message:String(cause);
  if(!cleanupSafe)throw new ManagedInstallError("STAGING_RETAINED",`Managed installation staging failed and a private stage was retained: ${message}`,{cause,retainedStage:diagnosticRetained});
  throw new ManagedInstallError("STAGING_FAILED",`Managed installation staging failed: ${message}`,{cause});
 }
}


export interface ManagedAdditionalStageRequest extends ManagedInstallRequest {
 readonly expectedAcquisition?:unknown;
 readonly catalogPublication?:Readonly<{beforeCommit?:()=>Promise<void>;rename?:(from:string,to:string)=>Promise<void>}>;
}
export interface ManagedAdditionalStageReport {
 readonly status:"staged"|"unchanged"|"failed"|"ambiguous";
 readonly prefix:string;readonly managedRoot:string;readonly versionRoot:string;readonly version:string;
 readonly files:readonly ManagedInstallFile[];readonly activation:"not-active";readonly runtimeReady:false;
 readonly publication:"not-started"|"published"|"uncertain";
 readonly catalog:"not-committed"|"committed"|"unchanged"|"uncertain";
 readonly stagePath:string|null;readonly cleanup:"not-needed"|"removed"|"retained"|"uncertain";
 readonly retainedPaths:readonly string[];readonly error:string|null;
}
export class ManagedAdditionalStageError extends Error {
 constructor(readonly report:ManagedAdditionalStageReport,options?:ErrorOptions){super("Managed additional-version staging failed: "+(report.error??"uncertain result"),options);this.name="ManagedAdditionalStageError";}
}
interface AdditionalEpoch {
 root:ManagedPathMetadata;staging:ManagedPathMetadata;versions:ManagedPathMetadata;
 anchor:ManagedPathMetadata;anchorBytes:Buffer;
 catalog:ManagedPathMetadata|undefined;catalogBytes:Buffer|undefined;
 inventory:readonly ManagedVersionInventory[];
}
const additionalErrorText=(error:unknown)=>(error instanceof Error?error.message:String(error)).slice(0,4096);
function freezeAdditional(report:ManagedAdditionalStageReport):ManagedAdditionalStageReport {
 return Object.freeze({...report,files:Object.freeze(report.files.map(file=>Object.freeze({...file}))),retainedPaths:Object.freeze([...report.retainedPaths])});
}
async function checkAdditionalEpoch(managedRoot:string,epoch:AdditionalEpoch,catalog=true):Promise<void>{
 for(const [name,expected] of [["",epoch.root],["staging",epoch.staging],["versions",epoch.versions]] as const){
  const file=name?path.join(managedRoot,name):managedRoot;
  if(!samePhysicalDirectory(expected,await defaultMetadata(file)))fail("SOURCE_DRIFT","Managed additional-version directory baseline changed");
 }
 const anchor=path.join(managedRoot,RECEIPT);
 if(!sameCatalogFile(epoch.anchor,await defaultMetadata(anchor),anchor)||!(await readFile(anchor)).equals(epoch.anchorBytes))fail("SOURCE_DRIFT","Managed additional-version receipt anchor changed");
 if(catalog){
  const file=path.join(managedRoot,VERSION_CATALOG),current=await defaultMetadata(file);
  if(epoch.catalog){
   if(!sameCatalogFile(epoch.catalog,current,file)||!epoch.catalogBytes||!(await readFile(file)).equals(epoch.catalogBytes))fail("SOURCE_DRIFT","Managed additional-version catalog baseline changed");
  }else if(current)fail("SOURCE_DRIFT","Managed additional-version catalog appeared");
 }
}
async function additionalEpoch(prefix:string,managedRoot:string):Promise<AdditionalEpoch>{
 const root=await defaultMetadata(managedRoot),staging=await defaultMetadata(path.join(managedRoot,"staging")),versions=await defaultMetadata(path.join(managedRoot,"versions"));
 const anchorFile=path.join(managedRoot,RECEIPT),catalogFile=path.join(managedRoot,VERSION_CATALOG),anchor=await defaultMetadata(anchorFile),catalog=await defaultMetadata(catalogFile);
 if(!catalogDirectoryAt(root,managedRoot)||!catalogDirectoryAt(staging,path.join(managedRoot,"staging"))||!catalogDirectoryAt(versions,path.join(managedRoot,"versions"))||!catalogFileAt(anchor,anchorFile)||(catalog&&!catalogFileAt(catalog,catalogFile)))fail("FOREIGN_MANAGED_ROOT","Additional staging requires an existing canonical owned installation");
 const anchorBytes=await readFile(anchorFile),catalogBytes=catalog?await readFile(catalogFile):undefined,inventory=await inspectManagedInstall({prefix});
 if(inventory.status!=="owned")fail("FOREIGN_MANAGED_ROOT","Additional staging requires an existing canonical owned installation");
 const epoch:AdditionalEpoch={root,staging,versions,anchor,anchorBytes,catalog,catalogBytes,inventory:inventory.versions};
 await checkAdditionalEpoch(managedRoot,epoch);return epoch;
}

/** Copies ordinary files only. No activation, acquisition or package execution is performed. */
export async function stageAdditionalManagedVersion(request:ManagedAdditionalStageRequest):Promise<ManagedAdditionalStageReport>{
 if(request.confirmed!==true)fail("CONFIRMATION_REQUIRED","Managed installation staging requires explicit confirmation");
 const prefix=absolute(request.prefix,"installation prefix"),packageRoot=absolute(request.packageRoot,"package root"),version=stableVersion(request.version),files=parseFiles(request.files),protectedPaths=request.protectedPaths.map(value=>absolute(value,"protected path"));
 const expected=request.expectedAcquisition===undefined?undefined:decodeManagedAcquisitionManifest(request.expectedAcquisition);
 if(expected&&(expected.version!==version||expected.files.length!==files.length||expected.files.some((file,index)=>file.sourcePath!==files[index]!.sourcePath.split(path.sep).join("/")||file.destinationPath!==files[index]!.destinationPath.split(path.sep).join("/"))))invalidAcquisition("Managed expected acquisition must exactly match the requested version and ordered source-destination inventory");
 const managedRoot=path.join(prefix,"install"),versionRoot=path.join(managedRoot,"versions",version),hooks=request.hooks;
 if(overlaps(managedRoot,packageRoot)||protectedPaths.some(value=>overlaps(managedRoot,value)||overlaps(packageRoot,value)))fail("PATH_OVERLAP","Managed installation paths overlap package source or protected data");
 const packageMeta=await metadata(packageRoot,"validate",hooks);
 if(!catalogDirectoryAt(packageMeta,packageRoot))fail("SOURCE_NOT_REGULAR","Managed package root must be a canonical regular directory");
 for(const protectedPath of protectedPaths){
  const actual=await defaultMetadata(protectedPath);
  if(actual?.kind==="link"||(actual&&(overlaps(managedRoot,actual.canonicalPath)||overlaps(packageMeta.canonicalPath,actual.canonicalPath))))fail("PATH_OVERLAP","Managed installation paths overlap package source or protected data");
 }
 const epoch=await additionalEpoch(prefix,managedRoot);
 const verifyExpected=async()=>{if(expected){const {verifyManagedAcquisitionPackage}=await import("./managed-acquisition-verification.js");await verifyManagedAcquisitionPackage(packageRoot,expected);}};
 await verifyExpected();
 const observed=expected?expected.files.map((file,index):ObservedSource=>({input:files[index]!,absolute:path.join(packageRoot,files[index]!.sourcePath),metadata:packageMeta,bytes:Buffer.alloc(0),file:{path:file.destinationPath,size:file.size,sha256:file.sha256}})):await observeManagedSources(packageRoot,packageMeta,files,hooks),manifest=observed.map(item=>item.file);
 const base:ManagedAdditionalStageReport={status:"failed",prefix,managedRoot,versionRoot,version,files:manifest,activation:"not-active",runtimeReady:false,publication:"not-started",catalog:"not-committed",stagePath:null,cleanup:"not-needed",retainedPaths:[],error:null};
 const existing=epoch.inventory.find(item=>item.version===version);
 if(existing){
  if(JSON.stringify(existing.files)!==JSON.stringify(manifest)||!await verifyInstalled(versionRoot,existing.files))fail("VERSION_CONFLICT","Managed version "+version+" already exists with different data");
  if(expected)await verifyExpected();else await revalidateManagedSources(observed,hooks);await checkAdditionalEpoch(managedRoot,epoch);
  const current=await inspectManagedInstall({prefix});
  if(current.status!=="owned"||JSON.stringify(current.versions)!==JSON.stringify(epoch.inventory))fail("SOURCE_DRIFT","Managed additional-version inventory changed");
  return freezeAdditional({...base,status:"unchanged",catalog:"unchanged"});
 }
 if(await defaultMetadata(versionRoot))fail("VERSION_CONFLICT","Managed version "+version+" has an unlisted occupied destination");
 let result=base,failure:unknown,operationFailed=false;const expectedClaims=new Map<string,ManagedAcquisitionDestinationClaim>(),expectedDirectoryClaims=new Map<string,ManagedAcquisitionDestinationDirectoryClaim>();
 // Deliberately deferred: the lease imports inspection from this module.
 const {withManagedMaintenanceLock}=await import("./managed-maintenance-lock.js");
 try{
  await withManagedMaintenanceLock({prefix,confirmed:true},async()=>{
   let stagePath:string|null=null,stageClaim:ManagedPathMetadata|undefined,created=false,attempted=false;
   let publication:ManagedAdditionalStageReport["publication"]="not-started",catalog:ManagedAdditionalStageReport["catalog"]="not-committed";
   let temp:string|null=null,tempClaim:ManagedPathMetadata|undefined,catalogBytes:Buffer|undefined;
   const stable=async()=>{
    await checkAdditionalEpoch(managedRoot,epoch);
    const current=await inspectManagedInstall({prefix});
    if(current.status!=="owned"||JSON.stringify(current.versions)!==JSON.stringify(epoch.inventory))fail("SOURCE_DRIFT","Managed additional-version inventory changed");
    if(!samePhysicalDirectory(packageMeta,await defaultMetadata(packageRoot)))fail("SOURCE_DRIFT","Managed additional-version package root changed");
    if(expected)await verifyExpected();else await revalidateManagedSources(observed,hooks);
   };
   const stageStable=async()=>{
    await stable();
    if(!stagePath||!samePhysicalDirectory(stageClaim,await defaultMetadata(stagePath)))fail("SOURCE_DRIFT","Managed additional-version private stage changed");
   };
   const cleanupStable=expected?async()=>{
    await checkAdditionalEpoch(managedRoot,epoch);const current=await inspectManagedInstall({prefix});
    if(current.status!=="owned"||JSON.stringify(current.versions)!==JSON.stringify(epoch.inventory)||!samePhysicalDirectory(packageMeta,await defaultMetadata(packageRoot))||!stagePath||!samePhysicalDirectory(stageClaim,await defaultMetadata(stagePath)))fail("SOURCE_DRIFT","Managed additional-version cleanup ownership changed");
   }:stageStable;
   try{
    await stable();if(await defaultMetadata(versionRoot))fail("VERSION_CONFLICT","Managed additional-version destination appeared");
    stagePath=path.join(managedRoot,"staging",version+"-"+randomUUID());temp=path.join(managedRoot,VERSION_CATALOG+"."+randomUUID()+".tmp");
    await mkdir(stagePath);created=true;stageClaim=await claimDirectory(stagePath);
    const destinations=observed.map(item=>path.join(stagePath!,item.input.destinationPath));
    if(expected){const {copyManagedAcquisitionToStage}=await import("./managed-acquisition-copy.js");await copyManagedAcquisitionToStage(packageRoot,stagePath,expected,(absolute,claim)=>expectedClaims.set(absolute,claim),(absolute,claim)=>expectedDirectoryClaims.set(absolute,claim));}else await (hooks?.copyPlan??applySetupPlan)({home:stagePath,entries:observed.map((item,index)=>({source:item.absolute,destination:destinations[index]!}))});
    await verifyStagedFiles(stagePath,observed,hooks);await hooks?.beforePublish?.();
    const validate=async()=>{
     await stageStable();if(await defaultMetadata(versionRoot))fail("VERSION_CONFLICT","Managed additional-version destination appeared");
     await verifyStagedFiles(stagePath!,observed,hooks);await stageStable();
     if(await defaultMetadata(versionRoot))fail("VERSION_CONFLICT","Managed additional-version destination appeared");
    };
    const move=hooks?.publication?.rename??rename;
    await publishStage(stagePath,versionRoot,validate,{
     ...(hooks?.publication?.platform?{platform:hooks.publication.platform}:{}),
     ...(hooks?.publication?.wait?{wait:hooks.publication.wait}:{}),
     rename:async(from,to)=>{attempted=true;publication="uncertain";await move(from,to);},
    });
    await stable();const published=await defaultMetadata(versionRoot);
    if(!catalogDirectoryAt(published,versionRoot)||published.identity!==stageClaim.identity)fail("SOURCE_DRIFT","Managed additional-version published identity changed");
    await verifyStagedFiles(versionRoot,observed,hooks);await stable();publication="published";
    const versions=[...epoch.inventory,{version,files:manifest}];
    catalogBytes=Buffer.from(JSON.stringify({schema:VERSION_CATALOG_SCHEMA,product:PRODUCT,canonicalManagedRoot:epoch.root.canonicalPath,versions},null,2)+"\n");
    await writeFile(temp,catalogBytes,{flag:"wx",mode:0o600});tempClaim=await defaultMetadata(temp);
    if(!catalogFileAt(tempClaim,temp)||!(await readFile(temp)).equals(catalogBytes))fail("SOURCE_DRIFT","Managed additional-version catalog temporary changed");
    await request.catalogPublication?.beforeCommit?.();await stable();
    if(!samePhysicalDirectory(published,await defaultMetadata(versionRoot)))fail("SOURCE_DRIFT","Managed additional-version published identity changed");
    await verifyStagedFiles(versionRoot,observed,hooks);await stable();
    if(!sameCatalogFile(tempClaim,await defaultMetadata(temp),temp)||!(await readFile(temp)).equals(catalogBytes))fail("SOURCE_DRIFT","Managed additional-version catalog temporary changed");
    catalog="uncertain";await (request.catalogPublication?.rename??rename)(temp,path.join(managedRoot,VERSION_CATALOG));
    await checkAdditionalEpoch(managedRoot,epoch,false);
    const committedPath=path.join(managedRoot,VERSION_CATALOG),committed=await defaultMetadata(committedPath);
    if(!catalogFileAt(committed,committedPath)||committed.identity!==tempClaim.identity||!(await readFile(committedPath)).equals(catalogBytes))fail("SOURCE_DRIFT","Managed additional-version catalog commit is uncertain");
    const after=await inspectManagedInstall({prefix});
    if(after.status!=="owned"||JSON.stringify(after.versions)!==JSON.stringify(versions))fail("SOURCE_DRIFT","Managed additional-version catalog commit is uncertain");
    await checkAdditionalEpoch(managedRoot,epoch,false);
    if(!sameCatalogFile(committed,await defaultMetadata(committedPath),committedPath)||!(await readFile(committedPath)).equals(catalogBytes))fail("SOURCE_DRIFT","Managed additional-version catalog commit is uncertain");
    catalog="committed";result={...base,status:"staged",publication,catalog,stagePath};
   }catch(error){
    operationFailed=true;failure=error;
    let cleanup:ManagedAdditionalStageReport["cleanup"]=created?"retained":"not-needed";
    if(created&&!attempted&&stagePath&&stageClaim){
     try{
      await cleanupStable();
      if((await readdir(stagePath)).length){
       if(!expected)await verifyStagedFiles(stagePath,observed,hooks);
       const claimed=await Promise.all(observed.map(item=>defaultMetadata(path.join(stagePath!,item.input.destinationPath))));
       for(let index=observed.length-1;index>=0;index--){
        await cleanupStable();const item=observed[index]!,file=path.join(stagePath,item.input.destinationPath),before=claimed[index];
        const expectedClaim=expected?expectedClaims.get(file):undefined;
        let expectedBytesOwned=true;
        if(expected){const {verifyManagedAcquisitionDestinationClaim}=await import("./managed-acquisition-copy.js");expectedBytesOwned=!!expectedClaim&&await verifyManagedAcquisitionDestinationClaim(file,expectedClaim);}
        if(!before||!catalogFileAt(before,file)||!sameCatalogFile(before,await defaultMetadata(file),file)||(expected?!expectedBytesOwned:digest(await readFile(file))!==item.file.sha256))throw new Error("Private stage cleanup ownership is uncertain");
        await (hooks?.cleanupFile??(target=>rm(target)))(file);
       }
       const directories=[...new Set(observed.map(item=>path.dirname(path.join(stagePath!,item.input.destinationPath))).flatMap(directory=>{
        const result:string[]=[];while(directory!==stagePath&&within(stagePath!,directory)){result.push(directory);directory=path.dirname(directory);}return result;
       }))].sort((a,b)=>b.length-a.length);
       for(const directory of directories){
        await cleanupStable();
        if(expected){
         const chain:string[]=[];let current=directory;
         while(current!==stagePath&&within(stagePath!,current)){chain.push(current);current=path.dirname(current);}
         if(current!==stagePath)throw new Error("Private stage cleanup directory escaped its owned root");
         chain.push(stagePath);
         const {verifyManagedAcquisitionDestinationDirectoryClaim}=await import("./managed-acquisition-copy.js");
         for(const ownedDirectory of chain.reverse()){
          const claim=expectedDirectoryClaims.get(ownedDirectory);
          if(!claim||!await verifyManagedAcquisitionDestinationDirectoryClaim(ownedDirectory,claim))throw new Error("Private stage cleanup directory ownership is uncertain");
         }
        }
        await rmdir(directory);
       }
      }
      await cleanupStable();
      if(expected){const {verifyManagedAcquisitionDestinationDirectoryClaim}=await import("./managed-acquisition-copy.js"),claim=expectedDirectoryClaims.get(stagePath);if(!claim||!await verifyManagedAcquisitionDestinationDirectoryClaim(stagePath,claim))throw new Error("Private stage cleanup root ownership is uncertain");}
      await rmdir(stagePath);cleanup="removed";
     }catch(cleanupError){cleanup="uncertain";if(expected)failure=new AggregateError([failure,cleanupError],"Expected acquisition staging and cleanup failed",{cause:failure});}
    }else if(created&&!attempted)cleanup="uncertain";
    if(temp){
     try{
      const current=await defaultMetadata(temp);
      if(current){
       await checkAdditionalEpoch(managedRoot,epoch,false);
       if(!tempClaim||!catalogBytes||!sameCatalogFile(tempClaim,current,temp)||!(await readFile(temp)).equals(catalogBytes))throw new Error("Catalog temporary ownership is uncertain");
       await rm(temp);
      }
     }catch{cleanup="uncertain";}
    }
    const retainedPaths:string[]=[];
    for(const candidate of [stagePath,attempted?versionRoot:null,temp])if(candidate)try{if(await defaultMetadata(candidate))retainedPaths.push(candidate);}catch{cleanup="uncertain";}
    if(created&&stagePath&&!attempted&&cleanup!=="removed"&&!retainedPaths.includes(stagePath))cleanup="uncertain";
    result={...base,status:attempted||catalog==="uncertain"||cleanup==="uncertain"?"ambiguous":"failed",publication,catalog,stagePath,cleanup,retainedPaths,error:additionalErrorText(error)};
   }
  });
 }catch(error){
  const cause=operationFailed?new AggregateError([failure,error],"Additional staging and lease release failed",{cause:failure}):error;
  operationFailed=true;failure=cause;
  const retainedPaths=[...result.retainedPaths],marker=path.join(managedRoot,".asen-maintenance.lock");
  try{if(await defaultMetadata(marker)&&!retainedPaths.includes(marker))retainedPaths.push(marker);}catch{/* Do not invent confirmed ownership. */}
  result={...result,status:"ambiguous",retainedPaths,error:additionalErrorText(cause)};
 }
 const report=freezeAdditional(result);
 if(operationFailed)throw new ManagedAdditionalStageError(report,{cause:failure});
 return report;
}

export interface ManagedVersionSelectionRequest {
 readonly prefix:string;
 readonly version:string;
 readonly expectedCurrentVersion:string|null;
 readonly confirmed:boolean;
 readonly hooks?:ManagedInstallHooks;
}
export interface ManagedVersionSelectionReport {
 readonly status:"selected"|"unchanged"|"failed"|"ambiguous";
 readonly prefix:string;
 readonly managedRoot:string;
 readonly requestedVersion:string;
 readonly previousSelection:string|null;
 readonly publication:"not-started"|"committed"|"unchanged"|"uncertain";
 readonly cleanup:"not-needed"|"removed"|"retained"|"uncertain";
 readonly retainedPaths:readonly string[];
 readonly error:string|null;
 readonly activation:"not-active";
 readonly runtimeReady:false;
}
export class ManagedVersionSelectionError extends Error {
 constructor(readonly report:ManagedVersionSelectionReport,options?:ErrorOptions){
  super("Managed version selection failed: "+(report.error??"uncertain result"),options);
  this.name="ManagedVersionSelectionError";
 }
}
interface SelectionEpoch {
 prefix:ManagedPathMetadata;
 root:ManagedPathMetadata;
 versions:ManagedPathMetadata;
 target:ManagedPathMetadata;
 anchor:ManagedPathMetadata;
 anchorBytes:Buffer;
 catalog:ManagedPathMetadata|undefined;
 catalogBytes:Buffer|undefined;
 selector:ManagedSelectorObservation|undefined;
 inventory:readonly ManagedVersionInventory[];
 current:string|null;
 targetInventory:ManagedVersionInventory;
}
const selectionErrorText=(error:unknown)=>(error instanceof Error?error.message:String(error)).slice(0,4096);
function freezeSelection(report:ManagedVersionSelectionReport):ManagedVersionSelectionReport {
 return Object.freeze({...report,retainedPaths:Object.freeze([...report.retainedPaths])});
}
async function selectionEpoch(prefix:string,managedRoot:string,version:string,hooks?:ManagedInstallHooks):Promise<SelectionEpoch>{
 const prefixClaim=await metadata(prefix,"validate",hooks),root=await metadata(managedRoot,"validate",hooks);
 const versionsFile=path.join(managedRoot,"versions"),targetFile=path.join(versionsFile,version),anchorFile=path.join(managedRoot,RECEIPT),catalogFile=path.join(managedRoot,VERSION_CATALOG);
 const versions=await metadata(versionsFile,"validate",hooks),target=await metadata(targetFile,"validate",hooks),anchor=await metadata(anchorFile,"validate",hooks),catalog=await metadata(catalogFile,"validate",hooks);
 if(!catalogDirectoryAt(prefixClaim,prefix)||!catalogDirectoryAt(root,managedRoot)||!catalogDirectoryAt(versions,versionsFile)
  ||!catalogDirectoryAt(target,targetFile)||!catalogFileAt(anchor,anchorFile)||(catalog&&!catalogFileAt(catalog,catalogFile))){
  fail("FOREIGN_MANAGED_ROOT","Managed version selection requires a canonical owned inventory");
 }
 const anchorBytes=await readFile(anchorFile),catalogBytes=catalog?await readFile(catalogFile):undefined,selector=await observeManagedSelector(managedRoot,root,hooks);
 if(selector==="invalid")fail("FOREIGN_MANAGED_ROOT","Managed version selection requires a valid ordinary selector");
 const inspected=await inspectManagedInstall({prefix,...hooks?{hooks}:{}});
 if(inspected.status!=="owned")fail("FOREIGN_MANAGED_ROOT","Managed version selection requires a canonical owned inventory");
 const targetInventory=inspected.versions.find(item=>item.version===version);
 if(!targetInventory)fail("VERSION_CONFLICT","Requested managed version is not listed in the owned inventory");
 const epoch:SelectionEpoch={prefix:prefixClaim,root,versions,target,anchor,anchorBytes,catalog,catalogBytes,selector,inventory:inspected.versions,current:inspected.activeVersion,targetInventory};
 await checkSelectionEpoch(prefix,managedRoot,epoch,hooks,true);
 return epoch;
}
async function checkSelectionEpoch(prefix:string,managedRoot:string,epoch:SelectionEpoch,hooks:ManagedInstallHooks|undefined,selector:boolean):Promise<void>{
 const versionsFile=path.join(managedRoot,"versions"),targetFile=path.join(versionsFile,epoch.targetInventory.version),anchorFile=path.join(managedRoot,RECEIPT),catalogFile=path.join(managedRoot,VERSION_CATALOG);
 if(!samePhysicalDirectory(epoch.prefix,await metadata(prefix,"revalidate",hooks))
  ||!samePhysicalDirectory(epoch.root,await metadata(managedRoot,"revalidate",hooks))
  ||!samePhysicalDirectory(epoch.versions,await metadata(versionsFile,"revalidate",hooks))
  ||!samePhysicalDirectory(epoch.target,await metadata(targetFile,"revalidate",hooks))
  ||!sameCatalogFile(epoch.anchor,await metadata(anchorFile,"revalidate",hooks),anchorFile)
  ||!(await readFile(anchorFile)).equals(epoch.anchorBytes))fail("SOURCE_DRIFT","Managed version selection baseline changed");
 const catalog=await metadata(catalogFile,"revalidate",hooks);
 if(epoch.catalog){
  if(!sameCatalogFile(epoch.catalog,catalog,catalogFile)||!epoch.catalogBytes||!(await readFile(catalogFile)).equals(epoch.catalogBytes))fail("SOURCE_DRIFT","Managed version selection catalog changed");
 }else if(catalog)fail("SOURCE_DRIFT","Managed version selection catalog appeared");
 if(selector&&!await managedSelectorUnchanged(managedRoot,epoch.root,epoch.selector,hooks))fail("SOURCE_DRIFT","Managed version selection current value changed");
 if(!await verifyInstalled(targetFile,epoch.targetInventory.files,hooks))fail("SOURCE_DRIFT","Managed version selection target bytes changed");
 const inspected=await inspectManagedInstall({prefix,...hooks?{hooks}:{}});
 if(inspected.status!=="owned"||JSON.stringify(inspected.versions)!==JSON.stringify(epoch.inventory)
  ||(selector&&inspected.activeVersion!==epoch.current))fail("SOURCE_DRIFT","Managed version selection inventory changed");
}

/** Publishes stored selection metadata only; launcher activation and runtime execution are separate. */
export async function selectManagedVersion(request:ManagedVersionSelectionRequest):Promise<ManagedVersionSelectionReport>{
 if(request.confirmed!==true)fail("CONFIRMATION_REQUIRED","Managed version selection requires explicit confirmation");
 const prefix=absolute(request.prefix,"installation prefix"),version=stableVersion(request.version);
 if(request.expectedCurrentVersion!==null)stableVersion(request.expectedCurrentVersion);
 const managedRoot=path.join(prefix,"install"),hooks=request.hooks,epoch=await selectionEpoch(prefix,managedRoot,version,hooks);
 if(epoch.current!==request.expectedCurrentVersion)fail("SOURCE_DRIFT","Managed version selection compare-and-set value changed");
 const base:ManagedVersionSelectionReport={status:"failed",prefix,managedRoot,requestedVersion:version,previousSelection:epoch.current,publication:"not-started",cleanup:"not-needed",retainedPaths:[],error:null,activation:"not-active",runtimeReady:false};
 if(epoch.current===version)return freezeSelection({...base,status:"unchanged",publication:"unchanged"});
 const bytes=Buffer.from(version+"\n"),current=path.join(managedRoot,"current");
 let result=base,operationFailure:unknown,operationFailed=false,committed=false;
 const {withManagedMaintenanceLock}=await import("./managed-maintenance-lock.js");
 try{
  await withManagedMaintenanceLock({prefix,confirmed:true},async()=>{
   let temp:string|null=null,tempClaim:ManagedPathMetadata|undefined,attempted=false;
   try{
    await checkSelectionEpoch(prefix,managedRoot,epoch,hooks,true);
    temp=path.join(managedRoot,"current."+randomUUID()+".tmp");
    if(await metadata(temp,"validate",hooks))fail("SOURCE_DRIFT","Managed version selection temporary destination appeared");
    await writeFile(temp,bytes,{flag:"wx",mode:0o600});
    tempClaim=await metadata(temp,"verify",hooks);
    if(!catalogFileAt(tempClaim,temp)||!(await readFile(temp)).equals(bytes))fail("SOURCE_DRIFT","Managed version selection temporary bytes changed");
    await hooks?.beforePublish?.();
    await checkSelectionEpoch(prefix,managedRoot,epoch,hooks,true);
    if(!sameCatalogFile(tempClaim,await metadata(temp,"revalidate",hooks),temp)||!(await readFile(temp)).equals(bytes))fail("SOURCE_DRIFT","Managed version selection temporary bytes changed");
    attempted=true;result={...base,status:"ambiguous",publication:"uncertain",cleanup:"retained",retainedPaths:[temp]};
    await (hooks?.publication?.rename??rename)(temp,current);
    const selected=await metadata(current,"verify",hooks);
    if(!catalogFileAt(selected,current)||selected.identity!==tempClaim.identity||!(await readFile(current)).equals(bytes))fail("SOURCE_DRIFT","Managed version selection publication is uncertain");
    await checkSelectionEpoch(prefix,managedRoot,epoch,hooks,false);
    const inspected=await inspectManagedInstall({prefix,...hooks?{hooks}:{}});
    if(inspected.status!=="owned"||inspected.activeVersion!==version||JSON.stringify(inspected.versions)!==JSON.stringify(epoch.inventory))fail("SOURCE_DRIFT","Managed version selection read-back is uncertain");
    if(!sameCatalogFile(selected,await metadata(current,"revalidate",hooks),current)||!(await readFile(current)).equals(bytes))fail("SOURCE_DRIFT","Managed version selection read-back is uncertain");
    committed=true;result={...base,status:"selected",publication:"committed"};
   }catch(error){
    operationFailed=true;operationFailure=error;
    let cleanup:ManagedVersionSelectionReport["cleanup"]="not-needed";
    if(temp&&!attempted){
     try{
      const observed=await defaultMetadata(temp);
      if(observed){
       if(!tempClaim||!catalogFileAt(tempClaim,temp)||!sameCatalogFile(tempClaim,observed,temp)||!(await readFile(temp)).equals(bytes))throw new Error("Selector temporary ownership is uncertain");
       await checkSelectionEpoch(prefix,managedRoot,epoch,hooks,true);await (hooks?.cleanupFile??(file=>rm(file)))(temp);cleanup="removed";
      }
     }catch{cleanup=tempClaim?"uncertain":"retained";}
    }else if(temp&&attempted)cleanup="retained";
    const retainedPaths:string[]=[];
    for(const candidate of [temp,current])if(candidate)try{if(await defaultMetadata(candidate))retainedPaths.push(candidate);}catch{cleanup="uncertain";}
    result={...base,status:attempted?"ambiguous":"failed",publication:attempted?"uncertain":"not-started",cleanup,retainedPaths,error:selectionErrorText(error)};
    throw error;
   }
  });
 }catch(error){
  const retainedPaths=[...result.retainedPaths],lock=path.join(managedRoot,".asen-maintenance.lock");
  try{if(await defaultMetadata(lock)&&!retainedPaths.includes(lock))retainedPaths.push(lock);}catch{/* Unknown lock state is not adopted. */}
  const cause=operationFailed&&error!==operationFailure?new AggregateError([operationFailure,error],"Managed version selection and lease release failed",{cause:operationFailure}):error;
  result={...result,status:committed||result.publication==="uncertain"||retainedPaths.includes(lock)?"ambiguous":result.status,retainedPaths,error:selectionErrorText(cause)};
  throw new ManagedVersionSelectionError(freezeSelection(result),{cause});
 }
 return freezeSelection(result);
}
