import type { Candidate,Phase } from "./types.js";
import {isTransitionAuthorization,type TransitionAuthorization} from "../verify/verifier.js";

const allowed: Record<Phase, readonly Phase[]> = {
  DISCOVERING: ["PLANNING", "BLOCKED", "FAILED"],
  PLANNING: ["IMPLEMENTING", "BLOCKED", "FAILED"],
  IMPLEMENTING: ["TESTING", "BLOCKED", "FAILED", "ROLLED_BACK"],
  TESTING: ["IMPLEMENTING", "REVIEWING", "BLOCKED", "FAILED"],
  REVIEWING: ["IMPLEMENTING", "VERIFYING", "BLOCKED", "FAILED"],
  VERIFYING: ["VERIFIED", "IMPLEMENTING", "BLOCKED", "FAILED"],
  VERIFIED: ["IMPLEMENTING"],
  BLOCKED: ["DISCOVERING", "PLANNING", "IMPLEMENTING", "FAILED"],
  FAILED: ["DISCOVERING", "ROLLED_BACK"],
  ROLLED_BACK: ["DISCOVERING", "PLANNING"]
};

export function canTransition(from: Phase, to: Phase): boolean {
  return allowed[from].includes(to);
}

function structuralTransition(from:Phase,to:Phase):Phase {
  if(!canTransition(from,to)) throw new Error(`Invalid ASEN transition: ${from} -> ${to}`);
  return to;
}

export function transition(from:Phase,to:Phase):Phase {
  if(to==="IMPLEMENTING"||to==="VERIFIED") throw new Error(`Privileged ASEN transition requires gate authorization: ${from} -> ${to}`);
  return structuralTransition(from,to);
}


export interface GuardedTransition {
 from:Phase;
 to:Phase;
 candidate:Candidate;
 authorization:TransitionAuthorization;
}

export function guardedTransition(input:GuardedTransition):Phase {
 if(input.to==="IMPLEMENTING"||input.to==="VERIFIED"){
  if(!isTransitionAuthorization(input.authorization)) throw new Error(`ASEN gate blocked transition to ${input.to}: invalid authorization`);
  if(input.authorization.target!==input.to) throw new Error(`ASEN gate authorization target mismatch: ${input.authorization.target} -> ${input.to}`);
  if(input.authorization.candidateRepository!==input.candidate.repository||
     input.authorization.candidateId!==input.candidate.id||
     input.authorization.candidateRevision!==input.candidate.revision)
    throw new Error("ASEN gate authorization candidate mismatch");
 }
 return structuralTransition(input.from,input.to);
}
