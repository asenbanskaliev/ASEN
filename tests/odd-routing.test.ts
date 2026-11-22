import assert from "node:assert/strict";
import test from "node:test";
import {
  claimOddRouteDecision,
  deriveOddFacts,
  planOddRoute,
  type OddRoutingRequest,
} from "../src/flow/odd-routing.js";

const request = (overrides: Partial<OddRoutingRequest> = {}): OddRoutingRequest => ({
  taskIdentity: "GSP-05A1",
  repositoryIdentity: "asen/repository",
  intent: "implementation",
  scope: { kind: "known", expectedPaths: ["src/a.ts"] },
  writes: [{ path: "src/a.ts", changeKind: "behavior" }],
  riskOperations: [],
  session: { estimatedMinutes: 15, continuation: false },
  testing: { kind: "required" },
  review: { kind: "none", estimatedMinutes: 10 },
  unresolvedDecisions: [],
  ...overrides,
});
const route = (overrides: Partial<OddRoutingRequest> = {}) => planOddRoute(deriveOddFacts(request(overrides)));

test("derives exact facts and excludes trivial writes", () => {
  const facts = deriveOddFacts(request({
    scope: { kind: "known", expectedPaths: ["src/a.ts", "docs/a.md", "dist/a.js"] },
    writes: [
      { path: "src/a.ts", changeKind: "configuration" },
      { path: "docs/a.md", changeKind: "documentation" },
      { path: "dist/a.js", changeKind: "generated" },
    ],
    testing: { kind: "n_a", reason: "Policy-only derivation" },
  }));
  assert.equal(facts.filesTouched, 3);
  assert.equal(facts.nonTrivialWrites, 1);
  assert.deepEqual(facts.testing, { kind: "n_a", reason: "Policy-only derivation" });
  assert.equal(facts.risk, "medium");
});

test("issues every route with deterministic precedence", () => {
  assert.equal(route().route, "direct");
  assert.equal(route({ intent: "incident", scope: { kind: "unknown", reason: "Incident discovery pending" }, writes: [] }).route, "incident");
  assert.equal(route({ intent: "verification", riskOperations: ["external_write"] }).route, "verify");
  assert.equal(route({ riskOperations: ["destructive_git"] }).route, "plan");
  assert.equal(route({ scope: { kind: "known", expectedPaths: ["a", "b", "c", "d"] }, writes: [] }).route, "direct");
});

test("E1: delega por unidades sustanciales independientes, no por número de archivos",()=>{
 const units=[
  {id:"api",objective:"Implementar contrato de API",estimatedMinutes:45,dependsOn:[]},
  {id:"ui",objective:"Implementar vista independiente",estimatedMinutes:40,dependsOn:[]}
 ];
 assert.equal(route({taskUnits:units}).route,"orchestrate");
 assert.deepEqual(route({taskUnits:units}).reasons,["independent-substantial-task-units"]);
 assert.equal(route({taskUnits:units.map(u=>({...u,estimatedMinutes:5}))}).route,"direct");
 assert.equal(route({taskUnits:[units[0]!,{...units[1]!,dependsOn:["api"]}]}).route,"direct");
 assert.equal(route({scope:{kind:"known",expectedPaths:Array.from({length:20},(_,i)=>`f${i}`)},writes:[]}).route,"direct");
 const decision=route({taskUnits:units});
 assert.equal(decision.requiresSingleWriter,true);
 assert.equal(JSON.stringify(decision).includes("permission"),false);
});
test("E1: rechaza unidades falsas, dependencias rotas y datos no declarados",()=>{
 const valid={id:"a",objective:"Trabajo acotado",estimatedMinutes:40,dependsOn:[]};
 for(const taskUnits of [
  [valid,valid],[{...valid,dependsOn:["b"]}],[{...valid,dependsOn:["a"]}],
  [{...valid,estimatedMinutes:-1}],[{...valid,objective:""}],
  [{...valid,extra:true}],
  [{...valid,id:"a",dependsOn:["b"]},{...valid,id:"b",dependsOn:["a"]}],
  [{...valid,id:"a",dependsOn:["b"]},{...valid,id:"b",dependsOn:["c"]},{...valid,id:"c",dependsOn:["a"]}],
  Array.from({length:33},(_,i)=>({...valid,id:String(i)}))
 ])assert.throws(()=>deriveOddFacts(request({taskUnits:taskUnits as NonNullable<OddRoutingRequest["taskUnits"]>})));
});
test("routes by uncertainty, actual risk, and explicit independent review", () => {
  assert.equal(route({ session: { estimatedMinutes: 59, continuation: false } }).route, "direct");
  assert.equal(route({ session: { estimatedMinutes: 600, continuation: false } }).route, "direct");
  assert.equal(route({ session: { estimatedMinutes: 0, continuation: true } }).route, "direct");
  assert.equal(route({ review: { kind: "ordinary", estimatedMinutes: 1 } }).route, "direct");
  assert.equal(route({ review: { kind: "dual_explicit", estimatedMinutes: 1 } }).route, "orchestrate");
  assert.equal(route({ review: { kind: "none", estimatedMinutes: 60 } }).route, "direct");
  assert.deepEqual(route({ scope: { kind: "unknown", reason: "Paths not mapped" }, writes: [] }).reasons, ["unknown-scope"]);
  assert.deepEqual(route({ unresolvedDecisions: ["Choose storage"] }).reasons, ["unresolved-decisions"]);
  assert.equal(route({ writes: [{ path: "src/a.ts", changeKind: "security" }] }).risk, "high");
  assert.equal(route({ scope: { kind: "known", expectedPaths: ["a", "b", "c", "d"] }, writes: [{ path: "a", changeKind: "documentation" }, { path: "b", changeKind: "format" }, { path: "c", changeKind: "generated" }] }).route, "direct");
  assert.equal(route({ scope: { kind: "known", expectedPaths: ["a", "b", "c", "d"] }, writes: [{ path: "a", changeKind: "behavior" }] }).route, "direct");
  for (const operation of ["external_write", "credential_or_auth", "security_boundary"] as const) assert.equal(route({ riskOperations: [operation] }).risk, "high");
});

test("derives verification from risk and emits no authority surface", () => {
  assert.equal(route().verification, "tests");
  assert.equal(route({ scope: { kind: "known", expectedPaths: ["a", "b", "c"] }, writes: [] }).verification, "structural");
  assert.equal(route({ unresolvedDecisions: ["Unknown"] }).verification, "independent");
  const decision = route();
  assert.deepEqual(Object.keys(decision).sort(), ["decisionId", "reasons", "repositoryIdentity", "requiresIsolatedChild", "requiresSingleWriter", "risk", "route", "taskIdentity", "verification"].sort());
  assert.match(decision.decisionId, /^[0-9a-f]{64}$/u);
  assert.equal(JSON.stringify(decision).match(/authority|callback|adapter|readiness/giu), null);
});

test("is immutable, does not mutate input, and has deterministic identity", () => {
  const input = request({ unresolvedDecisions: ["A decision"] });
  const before = structuredClone(input);
  const facts = deriveOddFacts(input);
  const first = planOddRoute(facts);
  const second = planOddRoute(deriveOddFacts(structuredClone(input)));
  assert.deepEqual(input, before);
  assert.equal(first.decisionId, second.decisionId);
  assert.ok(Object.isFrozen(facts) && Object.isFrozen(facts.scope) && Object.isFrozen(facts.writes) && Object.isFrozen(facts.writes[0]));
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.reasons));
});

test("rejects inexact records, accessors, inheritance, symbols, and extras", () => {
  const extra = { ...request(), route: "direct" };
  const inherited = Object.assign(Object.create({ route: "direct" }), request());
  const symbolic = request() as OddRoutingRequest & { [key: symbol]: boolean };
  symbolic[Symbol("route")] = true;
  let reads = 0;
  const accessor = request() as unknown as Record<string, unknown>;
  Object.defineProperty(accessor, "taskIdentity", { enumerable: true, get: () => { reads += 1; return "GSP-05A1"; } });
  for (const invalid of [extra, inherited, symbolic, accessor]) assert.throws(() => deriveOddFacts(invalid as OddRoutingRequest));
  assert.equal(reads, 0);
});

test("rejects malformed paths, text, counts, duplicates, and scope mismatches", () => {
  const invalid: OddRoutingRequest[] = [
    request({ scope: { kind: "known", expectedPaths: ["../a"] }, writes: [] }),
    request({ taskIdentity: "e\u0301" }),
    request({ session: { estimatedMinutes: Number.MAX_SAFE_INTEGER + 1, continuation: false } }),
    request({ scope: { kind: "known", expectedPaths: ["a", "a"] }, writes: [] }),
    request({ writes: [{ path: "src/a.ts", changeKind: "behavior" }, { path: "src/a.ts", changeKind: "format" }] }),
    request({ writes: [{ path: "other.ts", changeKind: "behavior" }] }),
    request({ riskOperations: ["external_write", "external_write"] }),
    request({ unresolvedDecisions: ["same", "same"] }),
    request({ scope: { kind: "unknown", reason: "Unknown" }, writes: [{ path: "src/a.ts", changeKind: "behavior" }] }),
  ];
  for (const value of invalid) assert.throws(() => deriveOddFacts(value));
});

test("facts plan once and decisions claim once; structural forgeries stay invalid", () => {
  const facts = deriveOddFacts(request());
  const decision = planOddRoute(facts);
  assert.throws(() => planOddRoute(facts));
  assert.throws(() => planOddRoute({ ...facts }));
  assert.throws(() => claimOddRouteDecision({ ...decision }));
  claimOddRouteDecision(decision);
  assert.throws(() => claimOddRouteDecision(decision));
});


test("un riesgo nombrado obliga a verificador independiente sin conceder permisos",()=>{
 for(const item of [1,2,3,4,5,6] as const){
  const decision=route({namedRisks:[{item,reason:"Riesgo comprobado de la categoría "+item}]});
  assert.equal(decision.route,"orchestrate");
  assert.equal(decision.verification,"independent");
  assert.ok(decision.reasons.includes("named-risk-"+item));
 }
 assert.equal(route({namedRisks:[{item:4,reason:"Concurrencia"}],writes:[]}).route,"direct");
 assert.equal(route({namedRisks:[{item:2,reason:"Seguridad"}],riskOperations:["security_boundary"]}).route,"plan");
});

test("esquema y migración infieren verificación; cambios sencillos mantienen ruta directa",()=>{
 for(const [kind,item] of [["schema",3],["migration",1]] as const){
  const facts=deriveOddFacts(request({writes:[{path:"src/a.ts",changeKind:kind}]}));
  assert.ok(facts.namedRisks.some(risk=>risk.item===item));
  const decision=planOddRoute(facts);
  assert.equal(decision.route,"orchestrate");
  assert.equal(decision.verification,"independent");
 }
 assert.equal(route().route,"direct");
 assert.equal(route({writes:[{path:"src/a.ts",changeKind:"documentation"}]}).verification,"structural");
 const missing=route({testing:{kind:"n_a",reason:"Sin pruebas disponibles"}});
 assert.equal(missing.route,"orchestrate");
 assert.equal(missing.verification,"independent");
});

test("riesgos mal formados y duplicados no permiten plan ni autorizaciones",()=>{
 for(const risks of [
  [{item:0,reason:"No autorizado"}],
  [{item:7,reason:"No autorizado"}],
  [{item:4,reason:"Duplicado"},{item:4,reason:"Duplicado"}],
  [{item:1,reason:" "}],
  [{item:3,reason:"X".repeat(501)}],
  [{item:2,reason:"Válido",other:true}],
  Array.from({length:7},(_,i)=>({item:i+1,reason:"Exceso"}))
 ])assert.throws(()=>deriveOddFacts(request({namedRisks:risks as NonNullable<OddRoutingRequest["namedRisks"]>})));
});
