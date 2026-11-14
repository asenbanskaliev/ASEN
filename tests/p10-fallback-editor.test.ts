import assert from "node:assert/strict";
import test, {after,type TestContext} from "node:test";
import {mkdir, mkdtemp, readFile, writeFile, rm} from "node:fs/promises";
import {mkdtempSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {createPiExtension} from "../extensions/asen.js";
import {ASEN_PROFILES_SCHEMA} from "../src/runtime/profiles.js";
import {incrementUsageFile} from "../src/runtime/usage-store.js";
import {readProfileFallbacksFile, resolveProfileFallbackChain, serializeProfileFallbacks, ASEN_PROFILE_FALLBACKS_SCHEMA} from "../src/runtime/profile-fallback-store.js";

const ACTION = "Edit fallback chain (ASEN parent)";
// The synthetic CI owner creates a fresh root, never inferring old private authorization.
const ownsRoot=process.env.P10_FIXTURE_ROOT===undefined;
const BASE=process.env.P10_FIXTURE_ROOT??mkdtempSync(path.join(realpathSync.native(tmpdir()),"asen-p10-public-"));
if (!path.isAbsolute(BASE)) throw new Error("P10 fixture root must be absolute");
after(async()=>{if(ownsRoot)await rm(BASE,{recursive:true,force:true});});
type Screen = {title: string; choices: string[]};
type Choice = string | undefined | ((screen: Screen) => string | undefined | Promise<string | undefined>);
const entry = (model: string): Choice => screen => {
 const choice = screen.choices.find(value => value.startsWith("Entry ") && value.includes(model));
 assert.ok(choice, `Missing visible entry ${model}`); return choice;
};
const chain = (steps: {model: string; thinking?: "off" | "high"}[] = []) => ({
 schema: ASEN_PROFILE_FALLBACKS_SCHEMA,
 profiles: {A: {orchestrator: steps, worker: [{model: "other/worker"}]}},
});

async function fixture(t: TestContext, sharedHome?: string) {
 const root = await mkdtemp(path.join(BASE!, "case-")), home = sharedHome ?? path.join(root, "home"), project = path.join(root, "project");
 await mkdir(path.join(home, ".asen"), {recursive: true}); await mkdir(path.join(project, ".asen"), {recursive: true});
 const profilesFile = path.join(home, ".asen", "profiles.json"), fallbackFile = path.join(home, ".asen", "profile-fallbacks.json");
 const projectFile = path.join(project, ".asen", "profiles.json"), usageFile = path.join(home, ".asen", "usage.json");
 const profiles = {schema: ASEN_PROFILES_SCHEMA, active: "A", profiles: [
  {name: "A", routes: {worker: {model: "old/model", thinking: "high"}, explorer: {}}}, {name: "B", routes: {}},
 ]};
 if (!sharedHome) {
  await writeFile(profilesFile, JSON.stringify(profiles));
  await writeFile(fallbackFile, serializeProfileFallbacks(chain()));
 }
 await writeFile(projectFile, JSON.stringify({...profiles, active: "B"}));
 const commands = new Map<string, any>(), events = new Map<string, Function[]>(), notices: string[] = [], screens: Screen[] = [], queue: Choice[] = [];
 let id = "p10-session", effects = 0;
 const forbidden = () => {effects++; throw new Error("Unexpected model/provider/message effect");};
 const catalog = ["model", "second", "third", ...Array.from({length: 9}, (_, n) => `m${n}`)].map(id => ({provider: "catalog", id, reasoning: true}));
 const manager = {getSessionId: () => id};
 // This fixture drives the native interactive editor; headless RPC stays noninteractive.
 const ctx: any = {cwd: project, mode: "tui", hasUI: true, sessionManager: manager,
  modelRegistry: {getAll: () => catalog, find: forbidden, getAvailable: forbidden, refresh: forbidden, getApiKey: forbidden},
  ui: {notify: (text: string) => notices.push(text), setWidget() {}, setStatus() {},
   select: async (title: string, choices: string[]) => {const screen = {title, choices: [...choices]}; screens.push(screen); const next = queue.shift(); return typeof next === "function" ? next(screen) : next;},
  },
 };
 const pi: any = {on(name: string, fn: Function) {events.set(name, [...events.get(name) ?? [], fn]);},
  registerCommand(name: string, command: any) {commands.set(name, command);}, registerTool() {},
  getCommands: () => [], getAllTools: () => [], getFlag: () => false,
  setModel: forbidden, setThinkingLevel: forbidden, sendMessage: forbidden, sendUserMessage: forbidden,
 };
 createPiExtension({homeDir: () => home, packageRoot: root, profilesFile, profileFallbacksFile: fallbackFile,
  backgroundJobJournalFile: path.join(home, ".asen", "jobs.json"), autoAdvancePlans: false,
  enableAgentRuntime: false, enableTodoRuntime: false, enableWorkspaceRuntime: false, enableMemoryRuntime: false})(pi);
 const emit = async (name: string) => {for (const handler of [...events.get(name) ?? []]) await handler({}, ctx);};
 await emit("session_start");
 assert.ok(commands.has("asen-profiles"), `Registration failed: ${notices.join("\n")}`);
 assert.equal(notices.some(value => value.includes("host preflight failed")), false, notices.join("\n"));
 assert.ok(await readFile(usageFile).catch(async error => {
  // Diagnose the swallowed startup-store failure; never admit a command baseline here.
  let diagnostic = "standalone usage write succeeded after startup failed";
  try {await incrementUsageFile(usageFile, "sessions");} catch (storeError) {
   diagnostic = `${(storeError as NodeJS.ErrnoException).code ?? "no code"}: ${(storeError as Error).message}`;
  }
  throw new Error(`Startup must finish before the command baseline; notices: ${notices.join(" | ")}; store diagnostic: ${diagnostic}`, {cause: error});
 }), "Startup must finish before the command baseline");
 t.after(async () => {ctx.sessionManager = manager; ctx.cwd = project; delete ctx.signal; await emit("session_shutdown"); assert.equal(effects, 0);});
 const run = async (choices: Choice[], args = "") => {
  assert.equal(queue.length, 0, "Unused UI input from an earlier operation"); queue.push(...choices);
  await commands.get("asen-profiles").handler(args, ctx);
  assert.equal(queue.length, 0, "Command did not consume the expected UI interaction");
 };
 const state = async () => Object.fromEntries(await Promise.all([profilesFile, projectFile, fallbackFile, usageFile].map(async file => [file, await readFile(file)] as const)));
 const show = async () => {await run([], "show"); return JSON.parse(notices.at(-1)!).sessionProfile;};
 const requireEditor = async () => {
  const before = await state(), from = screens.length; await run(["Back"]);
  assert.deepEqual(await state(), before, "Opening/back must not change data or counters");
  assert.ok(screens.slice(from).find(screen => screen.title === "ASEN profiles")?.choices.includes(ACTION), `Missing profile menu action: ${ACTION}`);
 };
 return {root, home, project, profilesFile, projectFile, fallbackFile, usageFile, ctx, manager, notices, screens, queue, run, state, show, requireEditor,
  setId: (value: string) => {id = value;}, effects: () => effects,
  read: async () => readProfileFallbacksFile(fallbackFile),
  seed: async (value: ReturnType<typeof chain>) => writeFile(fallbackFile, serializeProfileFallbacks(value)),
 };
}

function unchangedExceptFallback(before: Record<string, Buffer>, after: Record<string, Buffer>, fallback: string) {
 for (const file of Object.keys(before)) if (file !== fallback) assert.deepEqual(after[file], before[file], file);
}

test("P10 exposes a global parent fallback editor without changing data or counters", async t => {
 const f = await fixture(t); await f.requireEditor(); assert.equal(f.effects(), 0);
});

test("P10 saves explicit off effort and reopens the same global parent chain", async t => {
 const f = await fixture(t); await f.requireEditor(); const before = await f.state(), frozen = await f.show();
 await f.run([ACTION, "Profile: A", "Add model", "Catalog model: catalog/model", "off", "Save chain"]);
 assert.deepEqual(resolveProfileFallbackChain(await f.read(), "A", "orchestrator"), [{model: "catalog/model", thinking: "off"}]);
 const saved = JSON.parse(f.notices.at(-1)!); assert.equal(saved.saved, true); assert.equal(saved.role, "orchestrator"); assert.equal(saved.name, "A");
 unchangedExceptFallback(before, await f.state(), f.fallbackFile); assert.deepEqual(await f.show(), frozen);
 const from = f.screens.length; await f.run([ACTION, "Profile: A", "Back"]);
 assert.ok(f.screens.slice(from).some(screen => screen.choices.some(choice => choice.startsWith("Entry ") && choice.includes("catalog/model") && choice.includes("off"))));
});

test("P10 reorders, replaces model/effort, and removes entries in the displayed order", async t => {
 const f = await fixture(t); await f.seed(chain([{model: "catalog/model", thinking: "off"}, {model: "catalog/second", thinking: "off"}])); await f.requireEditor();
 const before = await f.state();
 await f.run([ACTION, "Profile: A", entry("catalog/second"), "Move up", entry("catalog/second"), "Replace model", "Catalog model: catalog/third", "high", entry("catalog/model"), "Remove entry", "Save chain"]);
 assert.deepEqual(resolveProfileFallbackChain(await f.read(), "A", "orchestrator"), [{model: "catalog/third", thinking: "high"}]);
 unchangedExceptFallback(before, await f.state(), f.fallbackFile);
});

for (const exit of ["Discard", "Back"]) test(`P10 ${exit} discards staged changes without altering files, counters or frozen binding`, async t => {
 const f = await fixture(t); await f.requireEditor(); const before = await f.state(), frozen = await f.show();
 await f.run([ACTION, "Profile: A", "Add model", "Catalog model: catalog/model", "off", exit]);
 assert.deepEqual(await f.state(), before); assert.deepEqual(await f.show(), frozen); assert.equal(JSON.parse(f.notices.at(-1)!).sessionProfile?.state === "absent", false);
});

test("P10 rejects forged editor choices without publication or configuration effects", async t => {
 const f = await fixture(t); await f.requireEditor(); const before = await f.state(), count = f.notices.length;
 await assert.rejects(f.run([ACTION, "Profile: A", "forged editor action"]), /ASEN access returned an unknown choice/);
 assert.deepEqual(await f.state(), before); assert.equal(f.notices.length, count);
});

for (const kind of ["session", "manager", "project", "abort"]) test(`P10 rejects ${kind} drift before saving without data or counter changes`, async t => {
 const f = await fixture(t); await f.requireEditor(); const before = await f.state(), count = f.notices.length;
 const save: Choice = () => {
  if (kind === "session") f.setId("changed-session");
  if (kind === "manager") f.ctx.sessionManager = {getSessionId: () => "p10-session"};
  if (kind === "project") f.ctx.cwd = f.root;
  if (kind === "abort") f.ctx.signal = AbortSignal.abort();
  return "Save chain";
 };
 await assert.rejects(f.run([ACTION, "Profile: A", "Add model", "Catalog model: catalog/model", "off", save]), {name: "Error", message: kind === "abort" ? "ASEN access cancelled or context changed" : "ASEN panel session changed"});
 assert.deepEqual(await f.state(), before); assert.equal(f.notices.length, count);
});

test("P10 rejects a concurrent target-chain edit rather than overwriting it", async t => {
 const f = await fixture(t); await f.requireEditor(); let concurrent: Record<string, Buffer> | undefined;
 const save: Choice = async () => {await f.seed(chain([{model: "concurrent/model", thinking: "off"}])); concurrent = await f.state(); return "Save chain";};
 const count = f.notices.length;
 await assert.rejects(f.run([ACTION, "Profile: A", "Add model", "Catalog model: catalog/model", "off", save]), /Fallback chain changed.*nothing saved/);
 assert.deepEqual(await f.state(), concurrent); assert.equal(f.notices.length, count);
});

test("P10 preserves unrelated concurrent chains while saving the chosen target", async t => {
 const f = await fixture(t); await f.requireEditor(); const before = await f.state();
 const save: Choice = async () => {const current = await f.read(); current.profiles.B = {worker: [{model: "concurrent/other"}]}; await f.seed(current as ReturnType<typeof chain>); return "Save chain";};
 await f.run([ACTION, "Profile: A", "Add model", "Catalog model: catalog/model", "off", save]);
 const stored = await f.read(); assert.deepEqual(stored.profiles.B, {worker: [{model: "concurrent/other"}]});
 assert.deepEqual(resolveProfileFallbackChain(stored, "A", "orchestrator"), [{model: "catalog/model", thinking: "off"}]);
 unchangedExceptFallback(before, await f.state(), f.fallbackFile);
});

test("P10 rejects malformed fallback bytes unchanged and publishes no success", async t => {
 const f = await fixture(t); await writeFile(f.fallbackFile, "not valid JSON\r\n"); await f.requireEditor(); const before = await f.state(), count = f.notices.length;
 await assert.rejects(f.run([ACTION, "Profile: A"]), /Invalid profile fallback file/);
 assert.deepEqual(await f.state(), before); assert.equal(f.notices.length, count);
});

test("P10 saves eight unique entries and refuses an additional entry without writing", async t => {
 const f = await fixture(t); await f.seed(chain(Array.from({length: 7}, (_, n) => ({model: `catalog/m${n}`, thinking: "off"})))); await f.requireEditor();
 await f.run([ACTION, "Profile: A", "Add model", "Catalog model: catalog/m7", "off", "Save chain"]);
 assert.equal(resolveProfileFallbackChain(await f.read(), "A", "orchestrator").length, 8);
 const before = await f.state(), count = f.notices.length;
 await assert.rejects(f.run([ACTION, "Profile: A", "Add model"]), /ASEN access returned an unknown choice/);
 assert.deepEqual(await f.state(), before); assert.equal(f.notices.length, count);
});

test("P10 rejects a duplicate model without changing stored data or counters", async t => {
 const f = await fixture(t); await f.seed(chain([{model: "catalog/model", thinking: "off"}])); await f.requireEditor(); const before = await f.state(), count = f.notices.length;
 await assert.rejects(f.run([ACTION, "Profile: A", "Add model", "Catalog model: catalog/model", "off"]), /Invalid profile fallback chain/);
 assert.deepEqual(await f.state(), before); assert.equal(f.notices.length, count);
});

test("P10 removal restores wildcard inheritance rather than claiming to disable fallback", async t => {
 const f = await fixture(t), seeded = chain([{model: "catalog/model", thinking: "off"}]);
 Object.assign(seeded.profiles.A, {"*": [{model: "default/model"}]}); await f.seed(seeded); await f.requireEditor(); const before = await f.state();
 await f.run([ACTION, "Profile: A", entry("catalog/model"), "Remove entry", "Save chain"]);
 const stored = await f.read(); assert.equal(Object.hasOwn(stored.profiles.A!, "orchestrator"), false);
 assert.deepEqual(resolveProfileFallbackChain(stored, "A", "orchestrator"), [{model: "default/model"}]);
 assert.ok(f.screens.some(screen => /inherit/i.test(screen.title))); unchangedExceptFallback(before, await f.state(), f.fallbackFile);
});

test("P10 retains existing primary-route Edit behavior and frozen session/default state", async t => {
 const f = await fixture(t), before = await f.state(), frozen = await f.show();
 await f.run(["Edit saved profile", "Global", "Profile: A", "Role: worker", "Catalog model: catalog/model", "Default (unspecified)", "Save profile"]);
 const expected = JSON.parse(before[f.profilesFile]!.toString()); expected.profiles[0].routes.worker = {model: "catalog/model"};
 assert.deepEqual(JSON.parse((await f.state())[f.profilesFile]!.toString()), expected);
 for (const file of [f.projectFile, f.fallbackFile, f.usageFile]) assert.deepEqual((await f.state())[file], before[file]);
 assert.deepEqual(await f.show(), frozen); assert.equal(f.effects(), 0);
});
