import assert from "node:assert/strict";
import test from "node:test";
import {realpath} from "node:fs/promises";
import { decideLifecycleApplicability, claimLifecycleApplicability, type LifecycleApplicabilityInput } from "../src/lifecycle/applicability.js";
import { createSkillLifecycle, SkillLifecycle, lifecyclePhases } from "../src/lifecycle/skill-lifecycle.js";
import { buildOrchestrationPlan } from "../src/orchestration/orchestrator.js";
import { issueStructuredLifecycleApplicability } from "./helpers/lifecycle-applicability.js";
import {createAsenExtension} from "../extensions/asen.js";
import { issueOddDecision } from "./helpers/odd-routing.js";

type Fixture = Parameters<typeof issueOddDecision>[0];
const candidate = { id: "candidate-1", repository: await realpath("."), revision: "abc123", createdAt: "now" };
function prepared(fixture: Partial<Fixture> = {}) {
  const full = { taskId: "GSP-05B1b", repository: candidate.repository, paths: ["src/a.ts"], writes: [{ path: "src/a.ts", changeKind: "behavior" as const }], ...fixture };
  const decision = issueOddDecision(full);
  buildOrchestrationPlan({ taskId: full.taskId, repository: full.repository, prompt: "apply", candidate }, decision);
  return decision;
}
function extension(){const commands=new Map<string,{handler:(args:string|undefined,context:{cwd:string;ui:{notify():void}})=>unknown}>();const facade=createAsenExtension()({registerCommand:(name,command)=>commands.set(name,command as never)});return {facade,select:(task="GSP-05B1b")=>commands.get("asen-workflow")!.handler(`sdd ${task}`,{cwd:candidate.repository,ui:{notify:()=>{}}})};}
function input(overrides: Partial<LifecycleApplicabilityInput> = {}): LifecycleApplicabilityInput {
  return { taskIdentity: "GSP-05B1b", repositoryIdentity: candidate.repository, candidate: { id: candidate.id, repository: candidate.repository, revision: candidate.revision }, explicitMode: "unspecified", affectedSubsystems: ["lifecycle"], expectedPaths: ["src/a.ts"], requiredArtifacts: [], ...overrides };
}

test("selects bounded organic analysis, documentation, and behavior from original facts", () => {
  const cases = [
    [{ intent: "analysis" as const, paths: [], writes: [] }, [], "analysis"],
    [{ writes: [{ path: "src/a.ts", changeKind: "documentation" as const }] }, ["src/a.ts"], "documentation"],
    [{ writes: [{ path: "src/a.ts", changeKind: "configuration" as const }] }, ["src/a.ts"], "behavior"],
  ] as const;
  for (const [fixture, paths, nature] of cases) {
    const result = decideLifecycleApplicability(prepared(fixture), input({ expectedPaths: paths }));
    assert.equal(result.outcome, "organic");
    assert.equal(result.changeNature, nature);
  }
});

test("implicit complexity, orchestration, risk, schema, security, and migration remain organic", () => {
  const cases: [Partial<Fixture>, Partial<LifecycleApplicabilityInput>][] = [
    [{ paths:["a","b","c","d"],writes:[{path:"a",changeKind:"behavior"}] }, {expectedPaths:["a","b","c","d"]}],
    [{riskOperations:["external_write"]},{}],
    [{writes:[{path:"src/a.ts",changeKind:"schema"}]},{}],
    [{writes:[{path:"src/a.ts",changeKind:"security"}]},{}],
    [{writes:[{path:"src/a.ts",changeKind:"migration"}]},{}],
  ];
  for(const [fixture,overrides] of cases)assert.equal(decideLifecycleApplicability(prepared(fixture),input(overrides)).outcome,"organic");
});

test("plain structured mode and artifact selectors block while explicit organic stays organic",()=>{
 for(const overrides of [{explicitMode:"structured" as const},{requiredArtifacts:["proposal","design"] as const}]){
  const result=decideLifecycleApplicability(prepared(),input(overrides));assert.equal(result.outcome,"blocked");assert.deepEqual(result.reasons,["sdd-selection-required"]);
 }
 for(const fixture of [{paths:["a","b","c","d"],writes:[{path:"a",changeKind:"behavior" as const}]},{writes:[{path:"src/a.ts",changeKind:"schema" as const}]},{riskOperations:["security_boundary" as const]}]){
  const paths=fixture.paths??["src/a.ts"],result=decideLifecycleApplicability(prepared(fixture),input({explicitMode:"organic",expectedPaths:paths}));assert.equal(result.outcome,"organic");assert.deepEqual(result.reasons,["explicit-organic"]);
 }
});

test("genuine extension selection is one-use, route-bound, and contradicts explicit organic",async()=>{
 const first=extension();await first.select();assert.equal(first.facade.decideLifecycleApplicability(prepared(),input()).outcome,"structured");
 assert.equal(first.facade.decideLifecycleApplicability(prepared(),input()).outcome,"organic","a used proof cannot select another route decision");
 const malformed=extension();await malformed.select();assert.throws(()=>malformed.facade.decideLifecycleApplicability(prepared(),input({candidate:{...input().candidate,id:"other"}})),/candidate mismatch/);
 const afterBurn=malformed.facade.decideLifecycleApplicability(prepared(),input({explicitMode:"structured"}));assert.deepEqual({outcome:afterBurn.outcome,reasons:afterBurn.reasons},{outcome:"blocked",reasons:["sdd-selection-required"]});
 const contradiction=extension();await contradiction.select();const blocked=contradiction.facade.decideLifecycleApplicability(prepared(),input({explicitMode:"organic"}));assert.deepEqual({outcome:blocked.outcome,reasons:blocked.reasons},{outcome:"blocked",reasons:["workflow-selection-contradiction"]});
 const owner=extension(),other=extension();await owner.select();assert.equal(other.facade.decideLifecycleApplicability(prepared(),input({explicitMode:"structured"})).outcome,"blocked");assert.equal(owner.facade.decideLifecycleApplicability(prepared(),input()).outcome,"structured");
});

test("malformed applicability burns only the original route's pending selection without invoking getters",async()=>{
 const cases:Array<(read:()=>void)=>unknown>=[
  ()=>null,
  read=>Object.assign(Object.create(Object.defineProperties({}, {read:{get:()=>{read();return ()=>read();}},claim:{get:()=>{read();return ()=>read();}},factory:{get:()=>{read();return ()=>read();}}})),input()),
  ()=>{const value={...input()} as Record<string,unknown>;delete value.taskIdentity;return value;},
  ()=>{const value={...input()} as Record<string,unknown>;delete value.repositoryIdentity;return value;},
  read=>Object.defineProperty(input(),"taskIdentity",{enumerable:true,get:()=>{read();return "GSP-05B1b";}}),
  read=>Object.defineProperty(input(),"repositoryIdentity",{enumerable:true,get:()=>{read();return candidate.repository;}}),
 ];
 for(const make of cases){
  const target=extension();await target.select();let reads=0;const malformed=make(()=>reads++);
  assert.throws(()=>target.facade.decideLifecycleApplicability(prepared(),malformed as LifecycleApplicabilityInput));assert.equal(reads,0);
  const retry=target.facade.decideLifecycleApplicability(prepared(),input({explicitMode:"structured"}));assert.deepEqual({outcome:retry.outcome,reasons:retry.reasons},{outcome:"blocked",reasons:["sdd-selection-required"]});
 }
 const scoped=extension();await scoped.select();await scoped.select("other-task");assert.throws(()=>scoped.facade.decideLifecycleApplicability(prepared(),null as never));
 const otherInput=input({taskIdentity:"other-task"});const other=scoped.facade.decideLifecycleApplicability(prepared({taskId:"other-task"}),otherInput);assert.equal(other.outcome,"structured");
 const deferred=extension();await deferred.select();const raw=issueOddDecision({taskId:"GSP-05B1b",repository:candidate.repository,paths:["src/a.ts"],writes:[{path:"src/a.ts",changeKind:"behavior"}]});assert.throws(()=>deferred.facade.decideLifecycleApplicability(raw,null as never),/not genuinely claimed/);
 buildOrchestrationPlan({taskId:"GSP-05B1b",repository:candidate.repository,prompt:"apply",candidate},raw);assert.equal(deferred.facade.decideLifecycleApplicability(raw,input()).outcome,"structured");
});

test("blockers precede explicit structured selection", () => {
  const cases: [Partial<Fixture>, string[], string[]][] = [
    [{ scope: { kind: "unknown", reason: "Mapping pending" }, writes: [], riskOperations: ["external_write"] }, [], ["unknown-scope"]],
    [{ unresolvedDecisions: ["Choose boundary"] }, ["src/a.ts"], ["unresolved-decisions", "unknown-risk"]],
    [{ intent: "incident", paths: [], writes: [] }, [], ["incident-route"]],
    [{ intent: "verification", paths: [], writes: [] }, [], ["verification-route"]],
    [{ intent: "analysis", writes: [{ path: "src/a.ts", changeKind: "behavior" }] }, ["src/a.ts"], ["contradictory-change-facts"]],
  ];
  for (const [fixture, paths, reasons] of cases) {
    const result = decideLifecycleApplicability(prepared(fixture), input({ explicitMode: "structured", expectedPaths: paths }));
    assert.equal(result.outcome, "blocked");
    assert.deepEqual(result.reasons, reasons);
  }
});

test("derives precedence solely from writes and rejects caller relabeling", () => {
  const decision = prepared({ paths: ["a", "b", "c"], writes: [{ path: "a", changeKind: "schema" }, { path: "b", changeKind: "migration" }, { path: "c", changeKind: "security" }] });
  assert.equal(decideLifecycleApplicability(decision, input({ expectedPaths: ["a", "b", "c"] })).changeNature, "security");
  const relabeled = { ...input(), changeNature: "documentation" };
  assert.throws(() => decideLifecycleApplicability(prepared(), relabeled as LifecycleApplicabilityInput), /shape/);
});

test("exact binding and path mismatches burn the first attempt", () => {
  const variants: Partial<LifecycleApplicabilityInput>[] = [
    { taskIdentity: "other" }, { repositoryIdentity: "other" },
    { candidate: { ...input().candidate, id: "other" } },
    { candidate: { ...input().candidate, repository: "other" } },
    { candidate: { ...input().candidate, revision: "other" } },
    { expectedPaths: [] }, { expectedPaths: ["src/a.ts", "extra.ts"] },
  ];
  for (const overrides of variants) {
    const decision = prepared();
    assert.throws(() => decideLifecycleApplicability(decision, input(overrides)), /mismatch/);
    assert.throws(() => decideLifecycleApplicability(decision, input()), /already attempted/);
  }
  const ordered = prepared({ paths: ["a", "b"], writes: [{ path: "a", changeKind: "behavior" }] });
  assert.throws(() => decideLifecycleApplicability(ordered, input({ expectedPaths: ["b", "a"] })), /paths mismatch/);
});

test("requires successful candidate-bound orchestration and genuine unconsumed decisions", () => {
  const raw = issueOddDecision({ taskId: "GSP-05B1b", repository: candidate.repository });
  assert.throws(() => decideLifecycleApplicability(raw, input()), /not genuinely claimed/);
  buildOrchestrationPlan({ taskId: "GSP-05B1b", repository: candidate.repository, prompt: "p", candidate }, raw);
  assert.throws(() => decideLifecycleApplicability(raw, input()), /already attempted/);
  const candidateLess = issueOddDecision({ taskId: "GSP-05B1b", repository: candidate.repository });
  buildOrchestrationPlan({ taskId: "GSP-05B1b", repository: candidate.repository, prompt: "p" }, candidateLess);
  assert.throws(() => decideLifecycleApplicability(candidateLess, input()), /no successful candidate-bound/);
  const genuine = prepared();
  assert.throws(() => decideLifecycleApplicability({ ...genuine }, input()), /not genuinely claimed/);
  decideLifecycleApplicability(genuine, input());
  assert.throws(() => decideLifecycleApplicability(genuine, input()), /already attempted/);
});

test("rejects malformed exact data, Unicode, controls, duplicates, accessors, symbols, and prototypes", () => {
  const invalid: unknown[] = [
    { ...input(), extra: true }, { ...input(), affectedSubsystems: ["e\u0301"] }, { ...input(), affectedSubsystems: ["bad\nname"] },
    { ...input(), affectedSubsystems: ["same", "same"] }, { ...input(), affectedSubsystems: [] }, { ...input(), requiredArtifacts: ["proposal", "proposal"] },
    { ...input(), expectedPaths: ["../bad"] }, Object.assign(Object.create({ extra: true }), input()),
  ];
  const symbolic = input() as LifecycleApplicabilityInput & { [key: symbol]: boolean }; symbolic[Symbol("x")] = true; invalid.push(symbolic);
  let reads = 0; const accessor = input() as unknown as Record<string, unknown>;
  Object.defineProperty(accessor, "taskIdentity", { enumerable: true, get: () => { reads += 1; return "GSP-05B1b"; } }); invalid.push(accessor);
  for (const value of invalid) assert.throws(() => decideLifecycleApplicability(prepared(), value as LifecycleApplicabilityInput));
  assert.equal(reads, 0);
});

test("genuine structured applicability creates the exact initial nine-phase lifecycle", async() => {
  const applicability = await issueStructuredLifecycleApplicability("GSP-05B2", candidate, ["src/lifecycle/skill-lifecycle.ts"]);
  const lifecycle = createSkillLifecycle(applicability);
  assert.equal(lifecycle.state.taskId, "GSP-05B2");
  assert.deepEqual(
    { id: lifecycle.state.candidate.id, repository: lifecycle.state.candidate.repository, revision: lifecycle.state.candidate.revision },
    { id: candidate.id, repository: candidate.repository, revision: candidate.revision },
  );
  assert.equal(lifecycle.state.nextPhase, lifecyclePhases[0]);
  assert.deepEqual(lifecycle.state.records, []);
  assert.deepEqual(lifecyclePhases, ["context-init", "explore", "proposal", "specification", "design", "tasks", "apply", "verify", "archive"]);
  assert.throws(() => lifecycle.reissuePendingAuthority(), /verified recovery/);
  assert.equal(JSON.stringify(applicability).match(/phase|grant|write|review|release|git|delivery/giu), null);
});

test("organic and blocked applicability reject construction and burn their first genuine claim", () => {
  for (const applicability of [
    decideLifecycleApplicability(prepared(), input()),
    decideLifecycleApplicability(prepared(), input({ explicitMode: "organic", requiredArtifacts: ["proposal"] })),
  ]) {
    assert.throws(() => createSkillLifecycle(applicability), /requires structured applicability/);
    assert.throws(() => createSkillLifecycle(applicability), /already been claimed/);
  }
});

test("fresh construction rejects clones, forgeries, malformed values, and reuse", async() => {
  const structured = await issueStructuredLifecycleApplicability("GSP-05B2-clone", candidate);
  assert.throws(() => createSkillLifecycle({ ...structured }), /not issued here/);
  assert.throws(() => createSkillLifecycle({} as typeof structured), /not issued here/);
  assert.throws(() => createSkillLifecycle(undefined as unknown as typeof structured), /not issued here/);
  createSkillLifecycle(structured);
  assert.throws(() => createSkillLifecycle(structured), /already been claimed/);
});

test("construction requests cannot be observed, forged, cloned, reused, or intercepted", async() => {
  assert.equal(Object.hasOwn(SkillLifecycle, "construct"), false);
  assert.equal(Object.hasOwn(SkillLifecycle, "token"), false);
  let intercepted = false;
  Object.defineProperty(SkillLifecycle, "construct", { configurable: true, value: () => { intercepted = true; } });
  Object.defineProperty(SkillLifecycle, "token", { configurable: true, value: Object.freeze({}) });
  try {
    const applicability = await issueStructuredLifecycleApplicability("GSP-05B2-monkeypatch", candidate);
    const lifecycle = createSkillLifecycle(applicability);
    assert.equal(lifecycle.state.taskId, "GSP-05B2-monkeypatch");
    assert.equal(intercepted, false);
    const forged = Object.freeze({ taskId: "forged", candidate });
    const RuntimeLifecycle = SkillLifecycle as unknown as new (request: unknown) => SkillLifecycle;
    assert.throws(() => new RuntimeLifecycle(forged), /genuine applicability or verified recovery/);
    assert.throws(() => new RuntimeLifecycle({ ...forged }), /genuine applicability or verified recovery/);
    // @ts-expect-error The genuine module-private construction request type is not externally constructible.
    assert.throws(() => new SkillLifecycle({}), /genuine applicability or verified recovery/);
  } finally {
    Reflect.deleteProperty(SkillLifecycle, "construct");
    Reflect.deleteProperty(SkillLifecycle, "token");
  }
});

test("is deterministic, deeply frozen, nonmutating, opaque, and claimable once", () => {
  const firstInput = input({ affectedSubsystems: ["lifecycle", "routing"], requiredArtifacts: ["specification"] });
  const before = structuredClone(firstInput);
  const first = decideLifecycleApplicability(prepared(), firstInput);
  const second = decideLifecycleApplicability(prepared(), structuredClone(firstInput));
  assert.deepEqual(firstInput, before);
  assert.equal(first.applicabilityId, second.applicabilityId);
  assert.match(first.applicabilityId, /^[0-9a-f]{64}$/u);
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.candidate) && Object.isFrozen(first.expectedPaths) && Object.isFrozen(first.affectedSubsystems) && Object.isFrozen(first.requiredArtifacts) && Object.isFrozen(first.reasons));
  assert.deepEqual(Object.keys(first).sort(), ["applicabilityId", "taskIdentity", "repositoryIdentity", "candidate", "decisionId", "changeNature", "expectedPaths", "affectedSubsystems", "requiredArtifacts", "outcome", "reasons"].sort());
  assert.equal(JSON.stringify(first).match(/authority|readiness|verdict|callback|adapter|phase/giu), null);
  assert.throws(() => claimLifecycleApplicability({ ...first }), /not issued/);
  claimLifecycleApplicability(first);
  assert.throws(() => claimLifecycleApplicability(first), /already been claimed/);
});
