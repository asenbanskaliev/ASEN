import assert from "node:assert/strict";
import test from "node:test";
import {resolveDiscoveredMemoryProject} from "../src/memory/project-resolution.js";

test("project discovery gives config precedence over repository identity",()=>{
 assert.deepEqual(resolveDiscoveredMemoryProject({configProject:"locked",repositoryBinding:"bound",gitRemoteProject:"remote",gitRootProject:"root",directoryProject:"dir"}),{project:"locked",source:"config"});
});

test("repository binding is reused even when the current remote name changes",()=>{
 assert.deepEqual(resolveDiscoveredMemoryProject({repositoryBinding:"first-name",gitRemoteProject:"changed-name",gitRootProject:"root",directoryProject:"dir"}),{project:"first-name",source:"git_remote"});
 assert.deepEqual(resolveDiscoveredMemoryProject({repositoryBinding:"first-name",gitRootProject:"root",directoryProject:"dir"}),{project:"first-name",source:"git_root"});
});

test("unbound git identity uses remote before root",()=>{
 assert.deepEqual(resolveDiscoveredMemoryProject({gitRemoteProject:"owner%2Frepo",gitRootProject:"repo",directoryProject:"dir"}),{project:"owner%2Frepo",source:"git_remote"});
 assert.deepEqual(resolveDiscoveredMemoryProject({gitRootProject:"repo",directoryProject:"dir"}),{project:"repo",source:"git_root"});
});

test("one child is promoted while multiple children remain explicit ambiguity",()=>{
 assert.deepEqual(resolveDiscoveredMemoryProject({childProjects:["child"],directoryProject:"parent"}),{project:"child",source:"git_child"});
 assert.deepEqual(resolveDiscoveredMemoryProject({childProjects:["zeta","alpha","zeta"],directoryProject:"parent"}),{source:"ambiguous",availableProjects:["alpha","zeta"]});
});

test("directory basename is the final fallback and blank discovered identities fail",()=>{
 assert.deepEqual(resolveDiscoveredMemoryProject({directoryProject:"fallback"}),{project:"fallback",source:"dir_basename"});
 assert.throws(()=>resolveDiscoveredMemoryProject({configProject:" ",directoryProject:"fallback"}),/configured project is blank/);
});
