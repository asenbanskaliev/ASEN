import type { Phase } from "./types.js";

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

export function transition(from: Phase, to: Phase): Phase {
  if (!canTransition(from, to)) throw new Error(`Invalid ASEN transition: ${from} -> ${to}`);
  return to;
}


export interface GuardedTransition {
 from:Phase;
 to:Phase;
 authorized:boolean;
 reason?:string;
}

export function guardedTransition(input:GuardedTransition):Phase {
 if((input.to==="IMPLEMENTING"||input.to==="VERIFIED")&&!input.authorized){
  throw new Error(input.reason??`ASEN gate blocked transition to ${input.to}`);
 }
 return transition(input.from,input.to);
}
