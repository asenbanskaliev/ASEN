import { createHash } from "node:crypto";
import type { Risk } from "../core/types.js";
import { verificationLevel } from "./risk.js";

export type OddIntent = "implementation" | "analysis" | "incident" | "verification" | "defect";
export type OddChangeKind = "behavior" | "schema" | "security" | "configuration" | "migration" | "documentation" | "format" | "generated";
export type OddRiskOperation = "destructive_git" | "external_write" | "credential_or_auth" | "security_boundary";
export type OddReviewKind = "none" | "ordinary" | "dual_explicit";
export interface OddNamedRisk { readonly item:1|2|3|4|5|6; readonly reason:string; }
export type OddRoute = "direct" | "plan" | "orchestrate" | "incident" | "verify";
export type OddScope = Readonly<{ kind: "known"; expectedPaths: readonly string[] }> | Readonly<{ kind: "unknown"; reason: string }>;
export type OddTesting = Readonly<{ kind: "required" }> | Readonly<{ kind: "n_a"; reason: string }>;
/** Unidad funcional, no archivo. Una dependencia impide tratarla como independiente. */
export interface OddTaskUnit {
  readonly id:string;
  readonly objective:string;
  readonly estimatedMinutes:number;
  readonly dependsOn:readonly string[];
  /** Rutas exactas de escritura de esta unidad; no constituyen permisos. */
  readonly writePaths?:readonly string[];
}
export interface OddRoutingRequest {
  readonly taskUnits?:readonly OddTaskUnit[];
  readonly taskIdentity: string;
  readonly repositoryIdentity: string;
  readonly intent: OddIntent;
  readonly scope: OddScope;
  readonly writes: readonly Readonly<{ path: string; changeKind: OddChangeKind }>[];
  readonly riskOperations: readonly OddRiskOperation[];
  /** Riesgos declarados de forma explícita; no son autorizaciones de escritura. */
  readonly namedRisks?: readonly OddNamedRisk[];
  readonly session: Readonly<{ estimatedMinutes: number; continuation: boolean }>;
  readonly testing: OddTesting;
  readonly review: Readonly<{ kind: OddReviewKind; estimatedMinutes: number }>;
  readonly unresolvedDecisions: readonly string[];
}
export interface OddDerivedFacts {
  readonly taskIdentity: string; readonly repositoryIdentity: string; readonly intent: OddIntent;
  readonly scope: OddScope; readonly writes: OddRoutingRequest["writes"]; readonly riskOperations: readonly OddRiskOperation[]; readonly namedRisks:readonly OddNamedRisk[];
  readonly session: OddRoutingRequest["session"]; readonly testing: OddTesting; readonly review: OddRoutingRequest["review"];
  readonly unresolvedDecisions: readonly string[]; readonly taskUnits:readonly OddTaskUnit[]; readonly independentUnits:number; readonly filesTouched: number; readonly nonTrivialWrites: number;
  readonly incident: boolean; readonly verificationIntent: boolean; readonly longSession: boolean; readonly risk: Risk;
}
export interface OddRouteDecision {
  readonly decisionId: string; readonly taskIdentity: string; readonly repositoryIdentity: string;
  readonly route: OddRoute; readonly risk: Risk; readonly verification: "structural" | "tests" | "independent";
  readonly reasons: readonly string[]; readonly requiresSingleWriter: boolean; readonly requiresIsolatedChild: boolean;
}

const requestKeys = ["taskIdentity", "repositoryIdentity", "intent", "scope", "writes", "riskOperations", "session", "testing", "review", "unresolvedDecisions"] as const;
const intents = ["implementation", "analysis", "incident", "verification", "defect"] as const;
const changeKinds = ["behavior", "schema", "security", "configuration", "migration", "documentation", "format", "generated"] as const;
const riskOperations = ["destructive_git", "external_write", "credential_or_auth", "security_boundary"] as const;
const reviewKinds = ["none", "ordinary", "dual_explicit"] as const;
const nonTrivialKinds = new Set<OddChangeKind>(["behavior", "schema", "security", "configuration", "migration"]);
const issuedFacts = new WeakSet<object>();
const plannedFacts = new WeakSet<object>();
const issuedDecisions = new WeakSet<object>();
const claimedDecisions = new WeakSet<object>();
const decisionFacts = new WeakMap<object, OddDerivedFacts>();

function record(value: unknown, keys: readonly string[], noun: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${noun} must be exact plain data`);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) throw new Error(`${noun} shape is invalid`);
  return Object.fromEntries(keys.map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(`${noun} shape is invalid`);
    return [key, descriptor.value];
  }));
}
function array(value: unknown, noun: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new Error(`${noun} must be an exact array`);
  const indexes = Array.from({ length: value.length }, (_, index) => String(index));
  const own = Reflect.ownKeys(value);
  if (own.some(key => typeof key !== "string" || (key !== "length" && !indexes.includes(key))) || indexes.some(index => !Object.hasOwn(value, index))) throw new Error(`${noun} must be an exact array`);
  return indexes.map(index => {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(`${noun} must be an exact array`);
    return descriptor.value;
  });
}
function text(value: unknown, noun: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value || value !== value.normalize("NFC") || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw new Error(`${noun} is malformed`);
  return value;
}
function path(value: unknown): string {
  const result = text(value, "path");
  if (result.startsWith("/") || result.includes("\\") || result.includes(":") || result.split("/").some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) throw new Error("path is not canonical relative data");
  return result;
}
function count(value: unknown, noun: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${noun} is malformed`);
  return value;
}
function uniqueStrings(value: unknown, noun: string, parse = (item: unknown) => text(item, noun)): string[] {
  const result = array(value, noun).map(parse);
  if (new Set(result).size !== result.length) throw new Error(`${noun} contains duplicates`);
  return result;
}
function member<T extends string>(value: unknown, values: readonly T[], noun: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`${noun} is invalid`);
  return value as T;
}
function parseScope(value: unknown): OddScope {
  const kind = typeof value === "object" && value !== null ? Object.getOwnPropertyDescriptor(value, "kind")?.value : undefined;
  if (kind === "known") {
    const input = record(value, ["kind", "expectedPaths"], "scope");
    return Object.freeze({ kind, expectedPaths: Object.freeze(uniqueStrings(input.expectedPaths, "expected paths", path)) });
  }
  const input = record(value, ["kind", "reason"], "scope");
  if (input.kind !== "unknown") throw new Error("scope kind is invalid");
  return Object.freeze({ kind: "unknown", reason: text(input.reason, "unknown scope reason") });
}
function parseTesting(value: unknown): OddTesting {
  const kind = typeof value === "object" && value !== null ? Object.getOwnPropertyDescriptor(value, "kind")?.value : undefined;
  if (kind === "required") { record(value, ["kind"], "testing"); return Object.freeze({ kind }); }
  const input = record(value, ["kind", "reason"], "testing");
  if (input.kind !== "n_a") throw new Error("testing kind is invalid");
  return Object.freeze({ kind: "n_a", reason: text(input.reason, "testing reason") });
}

/** Validates exact request records and derives immutable local routing facts. */
export function deriveOddFacts(value: OddRoutingRequest): OddDerivedFacts {
  const withNamedRisks=Object.hasOwn(value,"namedRisks");
  const withUnits=Object.hasOwn(value,"taskUnits");
  const input=record(value,[...requestKeys,...(withNamedRisks?["namedRisks"]:[]),...(withUnits?["taskUnits"]:[])],"ODD request");
  const scope = parseScope(input.scope);
  const writes = array(input.writes, "writes").map(item => {
    const write = record(item, ["path", "changeKind"], "write");
    return Object.freeze({ path: path(write.path), changeKind: member(write.changeKind, changeKinds, "change kind") });
  });
  const writePaths = writes.map(write => write.path);
  if (new Set(writePaths).size !== writes.length) throw new Error("write paths contain duplicates");
  if (scope.kind !== "known" && writes.length || scope.kind === "known" && writePaths.some(item => !scope.expectedPaths.includes(item))) throw new Error("writes must be unique members of known scope");
  const operations = uniqueStrings(input.riskOperations, "risk operations").map(item => member(item, riskOperations, "risk operation"));
  const declared=withNamedRisks?array(input.namedRisks,"named risks").map(entry=>{
    const raw=record(entry,["item","reason"],"named risk");
    if(typeof raw.item!=="number"||!Number.isInteger(raw.item)||raw.item<1||raw.item>6)throw new Error("named risk item must be 1..6");
    const reason=text(raw.reason,"named risk reason");
    if(reason.length>500)throw new Error("named risk reason is too long");
    return Object.freeze({item:raw.item as OddNamedRisk["item"],reason});
  }):[];
  if(declared.length>6||new Set(declared.map(item=>item.item)).size!==declared.length)throw new Error("named risks contain duplicates or exceed six categories");
  const sessionInput = record(input.session, ["estimatedMinutes", "continuation"], "session");
  if (typeof sessionInput.continuation !== "boolean") throw new Error("session continuation is invalid");
  const session = Object.freeze({ estimatedMinutes: count(sessionInput.estimatedMinutes, "session estimate"), continuation: sessionInput.continuation });
  const reviewInput = record(input.review, ["kind", "estimatedMinutes"], "review");
  const review = Object.freeze({ kind: member(reviewInput.kind, reviewKinds, "review kind"), estimatedMinutes: count(reviewInput.estimatedMinutes, "review estimate") });
  const unresolvedDecisions = Object.freeze(uniqueStrings(input.unresolvedDecisions, "unresolved decisions"));
  const taskUnits=Object.freeze((withUnits?array(input.taskUnits,"task units"):[]).map(item=>{
    const scoped=typeof item==="object"&&item!==null&&Object.hasOwn(item,"writePaths");
    const raw=record(item,["id","objective","estimatedMinutes","dependsOn",...(scoped?["writePaths"]:[])],"task unit");
    const id=text(raw.id,"task unit id"),objective=text(raw.objective,"task unit objective");
    if(id.length>100||objective.length>500)throw new Error("task unit text is too long");
    return Object.freeze({id,objective,estimatedMinutes:count(raw.estimatedMinutes,"task unit estimate"),
      dependsOn:Object.freeze(uniqueStrings(raw.dependsOn,"task unit dependencies")),
      ...(scoped?{writePaths:Object.freeze(uniqueStrings(raw.writePaths,"task unit write paths",path))}:{})});
  }));
  if(taskUnits.length>32||new Set(taskUnits.map(unit=>unit.id)).size!==taskUnits.length)
    throw new Error("task units are duplicated or exceed the limit");
  // Una partición escrita debe cubrir cada ruta propuesta exactamente una vez.
  // Se rechaza la mezcla de unidades con y sin ámbito: nunca repartir por suposición.
  const scopedCount=taskUnits.filter(unit=>unit.writePaths!==undefined).length;
  if(scopedCount){
    if(scopedCount!==taskUnits.length||scope.kind!=="known"||!writes.length||writes.length>256)
      throw new Error("task unit write partition requires complete known write scopes");
    const assigned=new Set<string>(),normalized:string[]=[];
    for(const unit of taskUnits){
      if(!unit.writePaths?.length)throw new Error("task unit write partition requires a non-empty scope per unit");
      for(const item of unit.writePaths){
        if(item.length>1024||!writePaths.includes(item)||assigned.has(item)||/[\p{Cc}\p{Cf}*?\[\]]/u.test(item))
          throw new Error("task unit write partition has an invalid or repeated write path");
        const key=item.toLowerCase();
        if(normalized.some(previous=>previous===key||previous.startsWith(key+"/")||key.startsWith(previous+"/")))
          throw new Error("task unit write partition has overlapping write paths");
        assigned.add(item);normalized.push(key);
      }
    }
    if(assigned.size!==writePaths.length)throw new Error("task unit write partition does not cover all writes");
  }
  const ids=new Set(taskUnits.map(unit=>unit.id));
  if(taskUnits.some(unit=>unit.dependsOn.some(dep=>dep===unit.id||!ids.has(dep))))
    throw new Error("task units have invalid dependencies");
  // Rechazar ciclos indirectos: un plan con A→B→A nunca puede ejecutarse.
  // El límite de 32 unidades acota también el recorrido de dependencias.
  const pendientes=new Set<string>(),visitadas=new Set<string>();
  const dependencias=new Map(taskUnits.map(unidad=>[unidad.id,unidad.dependsOn]));
  const visitar=(id:string):void=>{
    if(pendientes.has(id))throw new Error("task units contain cyclic dependencies");
    if(visitadas.has(id))return;
    pendientes.add(id);
    for(const dependencia of dependencias.get(id)??[])visitar(dependencia);
    pendientes.delete(id);
    visitadas.add(id);
  };
  for(const unidad of taskUnits)visitar(unidad.id);
  // Se cuentan unidades de trabajo, nunca rutas ni cantidad de archivos.
  // La concurrencia solo es una recomendación; el planificador mantiene permisos y DAG.
  // Las unidades raíz pueden empezar juntas aunque otra unidad dependa después de una de ellas.
  // La dependencia bloquea a la sucesora, no a sus predecesoras independientes.
  // Esta cifra solo recomienda orquestar; nunca concede lanzamiento ni escritura.
  const independentUnits=taskUnits.filter(unit=>unit.estimatedMinutes>=30&&unit.dependsOn.length===0).length;
  const high = operations.length > 0 || writes.some(write => write.changeKind === "security");
  const unknown = scope.kind === "unknown" || unresolvedDecisions.length > 0;
  const filesTouched = scope.kind === "known" ? scope.expectedPaths.length : 0;
  const medium = writes.some(write => nonTrivialKinds.has(write.changeKind));
  const risk: Risk = high ? "high" : unknown ? "unknown" : medium ? "medium" : "low";
  // Solo se infieren riesgos respaldados por los tipos de cambio declarados.
  // Concurrencia y entrega requieren una señal explícita, nunca una suposición por nombre de archivo.
  const inferred:OddNamedRisk[]=[];
  if(writes.some(write=>write.changeKind==="migration"))inferred.push({item:1,reason:"Migración de datos o estado"});
  if(writes.some(write=>write.changeKind==="security"))inferred.push({item:2,reason:"Cambio en un límite de seguridad"});
  if(writes.some(write=>write.changeKind==="schema"))inferred.push({item:3,reason:"Cambio en un contrato o esquema consumido"});
  if(writes.some(write=>nonTrivialKinds.has(write.changeKind))&&
     (input.testing as {kind?:string})?.kind==="n_a")inferred.push({item:6,reason:"Cambio relevante sin prueba de regresión declarada"});
  const declaredItems=new Set(declared.map(item=>item.item));
  const namedRisks=Object.freeze([...declared,...inferred.filter(item=>!declaredItems.has(item.item))].sort((a,b)=>a.item-b.item).map(item=>Object.freeze(item)));
  const facts = Object.freeze({
    taskIdentity: text(input.taskIdentity, "task identity"), repositoryIdentity: text(input.repositoryIdentity, "repository identity"),
    intent: member(input.intent, intents, "intent"), scope, writes: Object.freeze(writes), riskOperations: Object.freeze(operations), namedRisks, session,
    testing: parseTesting(input.testing), review, unresolvedDecisions, taskUnits, independentUnits, filesTouched,
    nonTrivialWrites: writes.filter(write => nonTrivialKinds.has(write.changeKind)).length,
    incident: input.intent === "incident", verificationIntent: input.intent === "verification",
    longSession: session.continuation || session.estimatedMinutes >= 60, risk,
  });
  issuedFacts.add(facts);
  return facts;
}

/** Descripción inmutable de la división ODD validada. Las raíces solo tienen
 * dependencias resueltas en el grafo; aún necesitan admisión y permisos.
 * No convierte la propuesta en un plan ejecutable ni genera agentes.
 */
export function describeOddUnitPartition(facts:OddDerivedFacts):Readonly<{
 units:readonly OddTaskUnit[];dependencyRoots:readonly string[];topologicalOrder:readonly string[];
 execution:"not_started";authorization:"not_granted";status:"proposal-only";
}>|undefined{
 if(!issuedFacts.has(facts))throw new Error("ODD facts were not issued here");
 if(!facts.taskUnits.length||facts.taskUnits.some(unit=>!unit.writePaths))return undefined;
 const byId=new Map(facts.taskUnits.map(unit=>[unit.id,unit]));
 const seen=new Set<string>(),order:string[]=[];
 const visit=(id:string)=>{
  if(seen.has(id))return;
  for(const dep of byId.get(id)!.dependsOn)visit(dep);
  seen.add(id);order.push(id);
 };
 for(const unit of facts.taskUnits)visit(unit.id);
 return Object.freeze({
  units:facts.taskUnits,dependencyRoots:Object.freeze(facts.taskUnits.filter(unit=>!unit.dependsOn.length).map(unit=>unit.id)),
  topologicalOrder:Object.freeze(order),execution:"not_started",authorization:"not_granted",status:"proposal-only"
 });
}

/** Consumes genuine facts on the first planning attempt and issues no execution authority. */
export function planOddRoute(facts: OddDerivedFacts): OddRouteDecision {
  if (typeof facts !== "object" || facts === null || !issuedFacts.has(facts)) throw new Error("ODD facts were not issued here");
  if (plannedFacts.has(facts)) throw new Error("ODD facts have already been planned");
  plannedFacts.add(facts);
  let route: OddRoute; let reasons: string[];
  const needsIndependent=!!facts.writes.length&&facts.namedRisks.length>0;
  if (facts.incident) { route = "incident"; reasons = ["incident-intent"]; }
  else if (facts.verificationIntent) { route = "verify"; reasons = ["verification-intent"]; }
  else if (facts.scope.kind === "unknown" || facts.unresolvedDecisions.length) { route = "plan"; reasons = [...(facts.scope.kind === "unknown" ? ["unknown-scope"] : []), ...(facts.unresolvedDecisions.length ? ["unresolved-decisions"] : [])]; }
  else if (facts.risk === "high") { route = "plan"; reasons = ["high-risk"]; }
  else if (facts.review.kind === "dual_explicit") { route = "orchestrate"; reasons = ["explicit-independent-review"]; }
  else if (facts.independentUnits>=2&&facts.intent==="implementation"&&facts.writes.length>0) {
    route="orchestrate"; reasons=["independent-substantial-task-units"];
  }
  else if (needsIndependent) { route = "orchestrate"; reasons = facts.namedRisks.map(item=>`named-risk-${item.item}`); }
  else { route = "direct"; reasons = ["bounded-work-with-controlled-risk"]; }
  const payload = { taskIdentity: facts.taskIdentity, repositoryIdentity: facts.repositoryIdentity, route, risk: facts.risk, verification: needsIndependent?"independent" as const:verificationLevel(facts.risk), reasons, requiresSingleWriter: route === "orchestrate" || route === "incident", requiresIsolatedChild: route === "orchestrate" || route === "incident" || route === "verify" };
  const decision = Object.freeze({ decisionId: createHash("sha256").update(JSON.stringify(payload)).digest("hex"), ...payload, reasons: Object.freeze(reasons) });
  issuedDecisions.add(decision);
  decisionFacts.set(decision, facts);
  return decision;
}

/** Reports genuine claimed provenance without consuming or reissuing the decision. */
export function isClaimedOddRouteDecision(value: unknown): value is OddRouteDecision {
  return typeof value === "object"
    && value !== null
    && issuedDecisions.has(value)
    && claimedDecisions.has(value);
}

/** Burns a genuine issued decision on its first A2 claim attempt. */
export function claimOddRouteDecision(value: unknown): asserts value is OddRouteDecision {
  if (typeof value !== "object" || value === null || !issuedDecisions.has(value)) throw new Error("ODD route decision was not issued here");
  if (claimedDecisions.has(value)) throw new Error("ODD route decision has already been claimed");
  claimedDecisions.add(value);
}

/** Returns immutable original facts only for a genuine claimed decision. */
export function claimedOddRouteFacts(value: unknown): OddDerivedFacts {
  if (!isClaimedOddRouteDecision(value)) {
    throw new Error("ODD route decision is not genuinely claimed");
  }
  const facts = decisionFacts.get(value);
  if (!facts) {
    throw new Error("ODD route decision facts are unavailable");
  }
  return facts;
}
