import {createHash} from "node:crypto";

// Contrato interno sobre valores JSON decodificados, no sobre objetos JS hostiles.
// No concede autoridad, ni prueba autenticidad, atomicidad o durabilidad. El futuro
// emisor verificado debe autenticar origen, intentos y votos (HMAC), y leer/consumir
// y persistir el último estado bajo el lock del origen. Una copia anterior válida
// no se distingue aquí de la vigente. El llamador registra la interrupción al recuperar.
type Finding = Readonly<{id:string; severity:"low"|"medium"|"high"|"critical"; scope:string}>;
type Origin = Readonly<{tree:string; proposal:string; receipt:string; policy:string;
 judges:readonly [string,string]; findings:readonly Finding[]}>;
type Attempt = Readonly<{originBinding:string; fromTree:string; tree:string; receipt:string; worker:string}>;
type Judgment = Readonly<{judge:string; findings:readonly Readonly<{id:string; verdict:"resolved"|"survives"}>[]}>;
type Judgments = readonly [Judgment,Judgment];
type Outcome = "pending"|"interrupted"|Judgments;
type Round = Readonly<{attempt:Attempt; outcome:Outcome}>;
type State = Readonly<{version:2; origin:Origin; rounds:readonly Round[]}>;
type Phase = "ready"|"pending"|"interrupted"|"resolved"|"escalated";
type View = Readonly<{ok:true; state:State; originBinding:string; round:0|1|2; phase:Phase; findings:readonly Finding[]}>;
type Failure = Readonly<{ok:false; reason:"invalid-data"|"origin-mismatch"|"phase"|"attempt-mismatch"|"invalid-judgments"}>;
type Result = View|Failure;
type Event = Readonly<{type:"begin"|"interrupt";attempt:Attempt}> |
 Readonly<{type:"finish";attempt:Attempt;judgments:unknown}>;
const fail = (reason:Failure["reason"]):Failure => ({ok:false,reason});

const MAX_FINDINGS = 64;
const tree = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{40}([a-f0-9]{24})?$/u.test(v);
const digest = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u.test(v);
// Etiqueta exacta del hallazgo, nunca una ruta autorizada ni un permiso.
const scope = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 512 &&
 v === v.trim() && v === v.normalize("NFC") && !/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(v);
const field = (v: object, key: string) => {
 const d = Object.getOwnPropertyDescriptor(v,key);
 return !!d?.enumerable && "value" in d;
};
const exact = (v: unknown, ...keys: string[]): v is Record<string,unknown> => !!v && typeof v === "object" &&
 Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).length === keys.length && keys.every(k => field(v,k));
function dense(v: unknown, min: number, max: number): v is unknown[] {
 if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype || v.length < min || v.length > max ||
  Reflect.ownKeys(v).length !== v.length + 1) return false;
 for (let i=0; i<v.length; i++) if (!field(v,String(i))) return false;
 return true;
}
const validFinding = (v: unknown): v is Finding => exact(v,"id","severity","scope") && id(v.id) && scope(v.scope) &&
 ["low","medium","high","critical"].includes(v.severity as string);
function validOrigin(v: unknown): v is Origin {
 if (!exact(v,"tree","proposal","receipt","policy","judges","findings") || !tree(v.tree) || !digest(v.proposal) ||
  !id(v.receipt) || !digest(v.policy) || !dense(v.judges,2,2) || !v.judges.every(id) || v.judges[0] === v.judges[1] ||
  !dense(v.findings,1,MAX_FINDINGS) || !v.findings.every(validFinding)) return false;
 return new Set(v.findings.map(f => f.id)).size === v.findings.length;
}
// Listas en orden congelado: jueces y hallazgos son posiciones del contrato.
function sameOrigin(a: Origin, b: Origin): boolean {
 return a.tree === b.tree && a.proposal === b.proposal && a.receipt === b.receipt && a.policy === b.policy &&
  a.judges.every((j,i) => j === b.judges[i]) && a.findings.length === b.findings.length &&
  a.findings.every((f,i) => {
   const other = b.findings[i];
   return other && f.id === other.id && f.severity === other.severity && f.scope === other.scope;
  });
}
// Stable binding for correlation only; the emitter must authenticate it with the event.
function bindOrigin(origin: Origin): string {
 const canonical = ["asen.native-fix-lineage.origin/v2",origin.tree,origin.proposal,origin.receipt,origin.policy,
  origin.judges,origin.findings.map(f => [f.id,f.severity,f.scope])];
 return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
const validAttempt = (v: unknown): v is Attempt => exact(v,"originBinding","fromTree","tree","receipt","worker") &&
 digest(v.originBinding) && tree(v.fromTree) && tree(v.tree) && id(v.receipt) && id(v.worker);
const sameAttempt = (a: Attempt,b: Attempt) => a.originBinding === b.originBinding && a.fromTree === b.fromTree &&
 a.tree === b.tree && a.receipt === b.receipt && a.worker === b.worker;
function nextAttempt(state: State, originBinding: string, a: Attempt): boolean {
 const previous = state.rounds.at(-1)?.attempt.tree ?? state.origin.tree;
 return a.originBinding === originBinding && a.fromTree === previous && a.tree !== state.origin.tree &&
  a.tree.length === previous.length &&
  a.receipt !== state.origin.receipt && state.rounds.every(r => r.attempt.tree !== a.tree && r.attempt.receipt !== a.receipt);
}
function validJudgments(v: unknown, origin: Origin, findings: readonly Finding[]): v is Judgments {
 return dense(v,2,2) && v.every((j,i) => exact(j,"judge","findings") && j.judge === origin.judges[i] &&
  dense(j.findings,findings.length,findings.length) && j.findings.every((f,k) => exact(f,"id","verdict") &&
   f.id === findings[k]?.id && (f.verdict === "resolved" || f.verdict === "survives")));
}
function evolve({state, originBinding, findings}: View, {attempt,outcome}: Round): View {
 const round = state.rounds.length === 0 ? 1 : 2;
 let phase: Phase;
 if (typeof outcome === "string") phase = outcome;
 else {
  findings = findings.filter((_,i) => !outcome.every(j => j.findings[i]?.verdict === "resolved"));
  if (!findings.length) phase = "resolved";
  else phase = round === 2 ? "escalated" : "ready";
 }
 return {ok:true,state:{...state,rounds:[...state.rounds,{attempt,outcome}]},originBinding,round,phase,findings};
}
const seed = (origin: Origin): View => ({ok:true,state:{version:2,origin,rounds:[]},originBinding:bindOrigin(origin),
 round:0,phase:"ready",findings:origin.findings});

export function createFixLineage(origin: unknown): Result {
 return validOrigin(origin) ? structuredClone(seed(origin)) : fail("invalid-data");
}
function validRound(r: unknown, view: View): r is Round {
 return exact(r,"attempt","outcome") && validAttempt(r.attempt) && nextAttempt(view.state,view.originBinding,r.attempt) &&
  (r.outcome === "pending" || r.outcome === "interrupted" || validJudgments(r.outcome,view.state.origin,view.findings));
}
function decode(state: unknown, origin: unknown): Result {
 if (!validOrigin(origin) || !exact(state,"version","origin","rounds") || state.version !== 2 ||
  !validOrigin(state.origin) || !dense(state.rounds,0,2)) return fail("invalid-data");
 if (!sameOrigin(state.origin,origin)) return fail("origin-mismatch");
 let view = seed(state.origin);
 for (const r of state.rounds) {
  if (view.phase !== "ready" || !validRound(r,view)) return fail("invalid-data");
  view = evolve(view,r);
 }
 return view;
}
export function reopenFixLineage(state: unknown, expectedOrigin: unknown): Result {
 return structuredClone(decode(state,expectedOrigin));
}
function validEvent(v: unknown): v is Event {
 if (exact(v,"type","attempt")) return (v.type === "begin" || v.type === "interrupt") && validAttempt(v.attempt);
 return exact(v,"type","attempt","judgments") && v.type === "finish" && validAttempt(v.attempt);
}
export function advanceFixLineage(state: unknown, expectedOrigin: unknown, event: unknown): Result {
 const view = decode(state,expectedOrigin);
 if (!view.ok) return view;
 if (!validEvent(event)) return fail("invalid-data");
 if (event.type === "begin") {
  if (view.phase !== "ready") return fail("phase");
  if (!nextAttempt(view.state,view.originBinding,event.attempt)) return fail("attempt-mismatch");
  return structuredClone(evolve(view,{attempt:event.attempt,outcome:"pending"}));
 }
 const pending = view.state.rounds.at(-1);
 if (view.phase !== "pending" || !pending) return fail("phase");
 if (!sameAttempt(event.attempt,pending.attempt)) return fail("attempt-mismatch");
 let outcome: Outcome = "interrupted";
 if (event.type === "finish") {
  if (!validJudgments(event.judgments,view.state.origin,view.findings)) return fail("invalid-judgments");
  outcome = event.judgments;
 }
 return structuredClone(evolve({...view,state:{...view.state,rounds:view.state.rounds.slice(0,-1)}},
  {attempt:pending.attempt,outcome}));
}
