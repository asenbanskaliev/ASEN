import type {OddRouteDecision} from "./odd-routing.js";import {claimedOrchestrationRouteContext} from "../orchestration/orchestrator.js";
export interface OddExecutionContract{readonly route:string;readonly readOnly:boolean;readonly artifactPolicy:"none"|"bounded";readonly substantial:boolean;readonly requiresFullMemoryMirror:boolean;readonly requiresTodo:boolean;readonly requiresResume:boolean;}
const issued=new WeakSet<object>();
const bindings=new WeakMap<object,ReturnType<typeof claimedOrchestrationRouteContext>>();
/** Derives execution obligations from the already-claimed ODD route; it does not claim memory/recovery implementation parity. */
export function deriveOddExecutionContract(decision:OddRouteDecision):OddExecutionContract{
 const context=claimedOrchestrationRouteContext(decision),route=decision.route,readOnly=route==="verify"||context.facts.intent==="analysis"&&!context.facts.writes.length;
 const substantial=route==="plan"||route==="orchestrate"||context.facts.scope.kind==="unknown"||context.facts.nonTrivialWrites>1||context.facts.longSession||context.facts.filesTouched>=4;
 const result=Object.freeze({route,readOnly,artifactPolicy:readOnly?"none" as const:"bounded" as const,substantial,requiresFullMemoryMirror:substantial&&!readOnly,requiresTodo:substantial&&!readOnly,requiresResume:substantial&&!readOnly});issued.add(result);bindings.set(result,context);return result;
}
/** Exact identity check for consumers; clones are not evidence of an ODD execution contract. */
export function isIssuedOddExecutionContract(value:unknown):value is OddExecutionContract{return typeof value==="object"&&value!==null&&issued.has(value);}

/** Binding facts remain descriptive and grant no execution or write authority. */
export function oddExecutionBinding(contract:unknown){const binding=typeof contract==="object"&&contract!==null?bindings.get(contract):undefined;if(!binding)throw new Error("ODD execution requires genuine contract");return binding;}
