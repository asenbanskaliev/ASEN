import assert from "node:assert/strict";
import test, {after,type TestContext} from "node:test";
import {mkdir, mkdtemp, readFile, readdir, realpath, writeFile, rm} from "node:fs/promises";
import {mkdtempSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {createPiExtension} from "../extensions/asen.js";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import type {AgentRequest, AgentRunner} from "../src/agents/dispatcher.js";
import {ASEN_PROFILES_SCHEMA} from "../src/runtime/profiles.js";
import {ASEN_PROFILE_FALLBACKS_SCHEMA, serializeProfileFallbacks, type ProfileFallbacksFile} from "../src/runtime/profile-fallback-store.js";
import {canonicalProfilePartition, readSessionProfile} from "../src/runtime/session-profile-binding.js";

// Isolated public synthetic fixture only; not a replay of historical parent-admitted proof.
const ownsRoot=process.env.P11_FIXTURE_ROOT===undefined;
const BASE=process.env.P11_FIXTURE_ROOT??mkdtempSync(path.join(realpathSync.native(tmpdir()),"asen-p11-public-"));
if (!path.isAbsolute(BASE)) throw new Error("P11 synthetic fixture root must be absolute");
after(async()=>{if(ownsRoot)await rm(BASE,{recursive:true,force:true});});
const PRIMARY = {model: "primary/explorer", thinking: "high" as const};
const ROLE = [{model: "fallback/one", thinking: "off" as const}, {model: "fallback/two"}];
const WILDCARD = [{model: "wildcard/one", thinking: "low" as const}];
const configured = (role = true): ProfileFallbacksFile => ({schema: ASEN_PROFILE_FALLBACKS_SCHEMA,
 profiles: {A: {"*": WILDCARD.map(step => ({...step})), ...(role ? {explorer: ROLE.map(step => ({...step}))} : {})},
 B: {explorer: [{model: "wrong/profile"}]}}});
const profiles = (active = "A") => ({schema: ASEN_PROFILES_SCHEMA, active, profiles: [
 {name: "A", routes: {explorer: PRIMARY}}, {name: "B", routes: {explorer: {model: "wrong/primary"}}},
]});
async function bytesUnder(root: string, prefix = ""): Promise<Record<string, string>> {
 const found: Record<string, string> = {};
 // Only tolerate disappearing notice-journal IO transients; surviving artifacts remain observable.
 const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
 const noticeTransient = new RegExp(`^(?:agent-notices\\.json\\.lock(?:\\.claim-${uuid}-${uuid}|\\.release-${uuid})?|\\.agent-notices\\.json\\.${process.pid}\\.${uuid}\\.tmp)$`);
 for (const entry of await readdir(root, {withFileTypes: true})) {
  const name = path.join(prefix, entry.name), file = path.join(root, entry.name);
  assert.equal(entry.isSymbolicLink(), false, "Synthetic fixture must not contain redirects");
  if (entry.isDirectory()) Object.assign(found, await bytesUnder(file, name));
  else {
   assert.ok(entry.isFile());
   try {found[name] = (await readFile(file)).toString("base64");}
   catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || prefix !== ".asen" || !noticeTransient.test(entry.name)) throw error;
   }
  }
 }
 return found;
}
async function fixture(t: TestContext, stored?: ProfileFallbacksFile) {
 const root = await mkdtemp(path.join(BASE!, "case-")), home = path.join(root, "home");
 const project = path.join(root, "project"), foreign = path.join(root, "foreign");
 await mkdir(path.join(home, ".asen"), {recursive: true}); await mkdir(project); await mkdir(foreign);
 const projectId = await realpath(project), profilesFile = path.join(home, ".asen/profiles.json");
 const fallbackFile = path.join(home, ".asen/profile-fallbacks.json");
 await writeFile(profilesFile, JSON.stringify(profiles()));
 if (stored) await writeFile(fallbackFile, serializeProfileFallbacks(stored));
 const events = new Map<string, Function[]>(), tools = new Map<string, any>(), notices: string[] = [];
 const requests: AgentRequest[] = [];
 let effects = 0, confirmations = 0, sessionId = "p11-session";
 let confirm: () => Promise<boolean> = async () => true;
 const forbidden = () => {effects++; throw new Error("Unexpected provider/model/message effect");};
 const ctx: any = {cwd: projectId, mode: "rpc", hasUI: true,
  sessionManager: {getSessionId: () => sessionId},
  modelRegistry: {getAll: () => [], find: forbidden, getAvailable: forbidden, refresh: forbidden, getApiKey: forbidden},
  ui: {notify: (message: string) => notices.push(message), setWidget() {}, setStatus() {},
   confirm: async () => {confirmations++; return confirm();}},
 };
 const pi: any = {on(name: string, fn: Function) {events.set(name, [...events.get(name) ?? [], fn]);},
  registerCommand() {}, registerTool(tool: any) {tools.set(tool.name, tool);},
  getCommands: () => [], getAllTools: () => [], getFlag: () => false,
  setModel: forbidden, setThinkingLevel: forbidden, sendMessage: forbidden, sendUserMessage: forbidden,
 };
 let runtime: AgentRuntime | undefined, terminal!: () => void;
 const finished = new Promise<void>(resolve => {terminal = resolve;});
 const runner: AgentRunner = {run: async request => {
  requests.push(request); return {id: request.id, ok: true, output: "P11 bounded read-only result"};
 }};
 // Existing DI only; real startReadOnly/store/dispatcher snapshot, no producer or emitted behavior stub.
 createPiExtension({homeDir: () => home, packageRoot: root, profilesFile, profileFallbacksFile: fallbackFile,
  backgroundJobJournalFile: path.join(home, ".asen/jobs.json"), autoAdvancePlans: false,
  agentRuntimeFactory: async () => {
   runtime = await AgentRuntime.open({storeFile: path.join(home, ".asen/agents.json"), runner});
   runtime.subscribeTerminal(() => terminal()); return runtime;
  }, enableTodoRuntime: false, enableWorkspaceRuntime: false, enableMemoryRuntime: false})(pi);
 const emit = async (name: string) => {for (const fn of [...events.get(name) ?? []]) await fn({}, ctx);};
 await emit("session_start");
 assert.equal(notices.some(value => value.includes("host preflight failed")), false, notices.join("\n"));
 assert.ok(tools.has("asen_agent_start")); assert.ok(runtime);
 // A real controlled fake session_start must finish before counters/binding baselines.
 assert.ok(await readFile(path.join(home, ".asen/usage.json")));
 const identity = {sessionId, projectId}, partition = await canonicalProfilePartition(profilesFile);
 assert.equal((await readSessionProfile(partition, identity))?.active, "A");
 t.after(async () => {
  sessionId = identity.sessionId; ctx.cwd = projectId;
  await emit("session_shutdown"); assert.equal(effects, 0);
 });
 const state = async () => ({files: await bytesUnder(home), records: runtime!.snapshot(),
  binding: await readSessionProfile(partition, identity), effects, confirmations});
 const launch = (signal = new AbortController().signal, params: any = {prompt: "Inspect only this P11 fixture"}) =>
  tools.get("asen_agent_start").execute("p11-direct", params, signal, () => {}, ctx);
 const queryTask = (id: string) => tools.get("asen_agent_status").execute("p11-status", {id}, undefined, () => {}, ctx);
 const complete = async (result: any) => {
  await finished;
  assert.equal(requests.length, 1); assert.equal(result.details.id, requests[0]!.id);
  assert.equal(result.details.state, "queued"); assert.equal(result.details.role, "explorer");
  assert.deepEqual(result.details.routing, {requested: {}, resolved: PRIMARY, source: "global", actual: "unknown"});
  const query = await queryTask(result.details.id);
  assert.equal(query.details.task.record.state, "completed");
  assert.equal(query.details.task.record.summary, "P11 bounded read-only result");
  assert.equal(effects, 0); assert.equal(confirmations, 0);
  const request = requests[0]!;
  assert.equal(request.model, PRIMARY.model); assert.equal(request.thinking, PRIMARY.thinking);
  assert.equal(request.repository, projectId); assert.equal(request.isolationKey, identity.sessionId);
  assert.equal(request.role, "explorer");
  for (const key of ["candidate", "writeSurfaces", "writerAdmission", "phaseGrant", "runnerWriteReceiver"]) assert.equal(Object.hasOwn(request, key), false);
  return {request, query};
 };
 return {home, foreign, profilesFile, fallbackFile, state, launch, complete, queryTask, requests, ctx, identity, partition,
  setSession: (value: string) => {sessionId = value;}, setConfirm: (value: () => Promise<boolean>) => {confirm = value;}};
}

for (const specific of [true, false]) test(`P11 public E registration wires ${specific ? "role before wildcard" : "wildcard inheritance"} with the captured selected profile`, async t => {
 const f = await fixture(t, configured(specific));
 // Global active-name drift must not silently replace this session's captured A identity.
 await writeFile(f.profilesFile, JSON.stringify(profiles("B")));
 const before = await f.state(), {request, query} = await f.complete(await f.launch());
 const expected = {profile: "A", chain: specific ? ROLE : WILDCARD};
 assert.deepEqual(request.modelFallback, expected, "Missing selected stored explorer fallback at public admission");
 assert.deepEqual(query.details.task.spec.modelFallback, expected);
 assert.deepEqual((await f.state()).binding, before.binding);
 for (const file of ["profiles.json", "profile-fallbacks.json", "usage.json"]) {
  assert.deepEqual((await f.state()).files[path.join(".asen", file)], before.files[path.join(".asen", file)]);
 }
});

test("P11 legacy direct launch without stored configuration preserves model, effort, public routing and output", async t => {
 const f = await fixture(t), before = await f.state();
 const {request, query} = await f.complete(await f.launch());
 assert.equal(Object.hasOwn(request, "modelFallback"), false);
 assert.equal(Object.hasOwn(query.details.task.spec, "modelFallback"), false);
 assert.deepEqual((await f.state()).binding, before.binding);
 assert.equal((await f.state()).files[path.join(".asen", "usage.json")], before.files[path.join(".asen", "usage.json")]);
});

test("P11 existing runtime admission freezes and persists a copy independent of later stored chain edits", async t => {
 const f = await fixture(t, configured()), {request, query} = await f.complete(await f.launch());
 assert.deepEqual(request.modelFallback, {profile: "A", chain: ROLE}, "Missing fallback before snapshot check");
 assert.ok(Object.isFrozen(request.modelFallback)); assert.ok(Object.isFrozen(request.modelFallback!.chain));
 for (const step of request.modelFallback!.chain) assert.ok(Object.isFrozen(step));
 await writeFile(f.fallbackFile, serializeProfileFallbacks({schema: ASEN_PROFILE_FALLBACKS_SCHEMA, profiles: {A: {explorer: [{model: "later/edit"}]}}}));
 assert.deepEqual(request.modelFallback, {profile: "A", chain: ROLE});
 assert.deepEqual(query.details.task.spec.modelFallback, {profile: "A", chain: ROLE});
 assert.notEqual(query.details.task.spec.modelFallback, request.modelFallback);
 assert.deepEqual((await f.queryTask(request.id)).details.task.spec.modelFallback, {profile: "A", chain: ROLE});
});

test("P11 strict malformed stored bytes reject through the public tool with no admission or configuration/counter/binding effects", async t => {
 const f = await fixture(t, configured()); await writeFile(f.fallbackFile, "not valid JSON\r\n");
 const before = await f.state();
 await assert.rejects(f.launch(), {name: "Error", message: "Invalid profile fallback file"});
 assert.equal(f.requests.length, 0); assert.deepEqual(await f.state(), before);
});

test("P11 pre-aborted direct launch retains existing cancellation error and has no admission or state effects", async t => {
 const f = await fixture(t, configured()), before = await f.state();
 await assert.rejects(f.launch(AbortSignal.abort()), {name: "AbortError", message: "Agent task cancelled"});
 assert.equal(f.requests.length, 0); assert.deepEqual(await f.state(), before);
});

test("P11 stale identity at existing foreign-project confirmation guard cannot admit a direct child or mutate stored state", async t => {
 const f = await fixture(t, configured()), before = await f.state();
 f.setConfirm(async () => {f.setSession("stale-session"); return true;});
 await assert.rejects(f.launch(undefined, {prompt: "Inspect only the synthetic foreign project", root: f.foreign}),
  {name: "Error", message: "Agent session changed during project authorization"});
 f.setSession(f.identity.sessionId);
 assert.equal(f.requests.length, 0);
 assert.deepEqual(await f.state(), {...before, confirmations: before.confirmations + 1});
 assert.equal(await readSessionProfile(f.partition, {sessionId: "stale-session", projectId: await realpath(f.foreign)}), undefined);
});
