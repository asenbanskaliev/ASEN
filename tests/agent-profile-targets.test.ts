import test from "node:test";
import assert from "node:assert/strict";
import {AGENT_PROFILE_TARGETS,BASE_AGENT_PROFILE_TARGETS,isAgentProfileTarget,resolveAgentProfileTarget} from "../src/runtime/lifecycle/agent-profile-targets.js";
import type {RuntimeProfilesFile} from "../src/runtime/lifecycle/profiles.js";

const profile=(routes:Record<string,{model?:string;thinking?:"low"|"high"}>):RuntimeProfilesFile=>({
 schema:"asen.runtime-profiles/v1",active:"active",profiles:[{name:"active",routes}]
});

test("profile targets preserve four existing roles and define all specialized readers",()=>{
 assert.deepEqual([...BASE_AGENT_PROFILE_TARGETS],["explorer","worker","reviewer","verifier"]);
 assert.equal(new Set(AGENT_PROFILE_TARGETS).size,11);
 for(const target of AGENT_PROFILE_TARGETS)assert.equal(isAgentProfileTarget(target),true);
 for(const bogus of ["__proto__","constructor","review-invented","worker-write",null,{}])
  assert.equal(isAgentProfileTarget(bogus),false);
});

test("review lens inherits reviewer's model in nearest layer, not authority",()=>{
 const layers={global:profile({"review-risk":{model:"global-special"},"reviewer":{model:"global-reviewer"}}),
  session:profile({reviewer:{model:"session-reviewer",thinking:"high"}})};
 assert.deepEqual(resolveAgentProfileTarget(layers,"review-risk"),{
  choice:{model:"session-reviewer",thinking:"high"},source:"session",selectedKey:"reviewer"
 });
});

test("specialized route wins over generic reviewer at the same scope",()=>{
 const layers={project:profile({reviewer:{model:"base"},"review-risk":{model:"special",thinking:"low"}})};
 assert.deepEqual(resolveAgentProfileTarget(layers,"review-risk"),{choice:{model:"special",thinking:"low"},source:"project",selectedKey:"review-risk"});
});

test("explicit empty specialized route does not silently inherit base model",()=>{
 const layers={global:profile({reviewer:{model:"base"},"review-reliability":{}})};
 assert.deepEqual(resolveAgentProfileTarget(layers,"review-reliability"),{choice:{},source:"global",selectedKey:"review-reliability"});
});

test("Judgment Day fix target inherits only worker model, judges inherit reviewer model",()=>{
 const layers={global:profile({worker:{model:"write-model"},reviewer:{model:"read-model"}})};
 assert.equal(resolveAgentProfileTarget(layers,"jd-fix-agent").choice?.model,"write-model");
 assert.equal(resolveAgentProfileTarget(layers,"jd-judge-a").choice?.model,"read-model");
 assert.equal(resolveAgentProfileTarget(layers,"jd-judge-b").choice?.model,"read-model");
});

test("missing targets return a default route without mutation or inherited property lookup",()=>{
 const layers={global:profile({reviewer:{model:"read"}})};
 const before=JSON.stringify(layers);
 assert.deepEqual(resolveAgentProfileTarget(layers,"explorer"),{source:"default"});
 assert.deepEqual(resolveAgentProfileTarget(layers,"review-risk").choice,{model:"read"});
 assert.equal(JSON.stringify(layers),before);
});
