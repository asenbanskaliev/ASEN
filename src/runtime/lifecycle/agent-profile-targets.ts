/** Model-routing targets are configuration keys, never independent execution grants.
 * Preserve the legacy profiles schema and the base agent role authority boundary. */
import {resolveRuntimeRoute,type ProfileLayer,type RouteChoice} from "./profiles.js";

export const BASE_AGENT_PROFILE_TARGETS=Object.freeze(["explorer","worker","reviewer","verifier"] as const);
export const SPECIALIZED_REVIEW_PROFILE_TARGETS=Object.freeze(["review-risk","review-resilience","review-reliability","review-readability"] as const);
export const JUDGMENT_DAY_PROFILE_TARGETS=Object.freeze(["jd-judge-a","jd-judge-b","jd-fix-agent"] as const);
export const AGENT_PROFILE_TARGETS=Object.freeze([
 ...BASE_AGENT_PROFILE_TARGETS,...SPECIALIZED_REVIEW_PROFILE_TARGETS,...JUDGMENT_DAY_PROFILE_TARGETS
] as const);
export type AgentProfileTarget=(typeof AGENT_PROFILE_TARGETS)[number];

const fallbackRole:Readonly<Partial<Record<AgentProfileTarget,AgentProfileTarget>>>=Object.freeze({
 "review-risk":"reviewer","review-resilience":"reviewer",
 "review-reliability":"reviewer","review-readability":"reviewer",
 "jd-judge-a":"reviewer","jd-judge-b":"reviewer","jd-fix-agent":"worker"
});
const allowed=new Set<string>(AGENT_PROFILE_TARGETS);
export function isAgentProfileTarget(value:unknown):value is AgentProfileTarget{
 return typeof value==="string"&&allowed.has(value);
}

/** Every configured lens uses the closest scope first; only absent exact
 * specializations inherit the base reader/writer MODEL (never their authority).
 * An explicit empty specialization is intentional: do not bypass it.
 */
export function resolveAgentProfileTarget(layers:ProfileLayer,target:AgentProfileTarget):
 {choice?:RouteChoice;source:"session"|"project"|"global"|"default";selectedKey?:AgentProfileTarget}{
 if(!isAgentProfileTarget(target))return {source:"default"};
 for(const [source,file] of [["session",layers.session],["project",layers.project],["global",layers.global]] as const){
  const active=file?.profiles.find(p=>p.name===file.active);
  if(!active)continue;
  if(Object.hasOwn(active.routes,target))return {choice:{...active.routes[target]},source,selectedKey:target};
  const fallback=fallbackRole[target];
  if(fallback&&Object.hasOwn(active.routes,fallback))
   return {choice:{...active.routes[fallback]},source,selectedKey:fallback};
 }
 // Legacy unconfigured roles retain their existing default resolution.
 const plain=resolveRuntimeRoute(layers,target);
 return {source:plain.source,...(plain.choice?{choice:plain.choice,selectedKey:target}:{})};
}
