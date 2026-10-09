import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {DefaultResourceLoader,SettingsManager} from "@earendil-works/pi-coding-agent";

// Run in a separate process: no credentials, models, user homes or ambient indexes.
const packageRoot=path.resolve(process.argv[2]);
const root=mkdtempSync(path.join(tmpdir(),"asen-installed-pi-"));
try {
  process.env.HOME=root;process.env.USERPROFILE=root;
  process.env.PI_CODING_AGENT_DIR=path.join(root,"agent");
  process.env.ASEN_NO_SKILL_REGISTRY="1";
  delete process.env.ASEN_PI_AUTHORITY;
  const loader=new DefaultResourceLoader({cwd:root,agentDir:process.env.PI_CODING_AGENT_DIR,
    settingsManager:SettingsManager.inMemory({packages:[packageRoot]}),
    noSkills:true,noThemes:true,noPromptTemplates:true,noContextFiles:true,
    disabledBuiltinExtensions:["mcp","llama.cpp"]});
  await loader.reload();
  const loaded=loader.getExtensions();
  assert.deepEqual(loaded.errors,[]);
  assert.deepEqual(loaded.extensions.map(e=>path.basename(e.path)),["asen.ts"],"installed primary must exclude child authority");
  assert.equal(loaded.extensions.some(e=>e.handlers.has("tool_call")),false,"primary install must not inherit child tool denial");
  for(const name of ["asen","asen-commands","asen-status","asen-review"])
    assert.ok(loaded.extensions[0].commands.has(name),`missing installed command: ${name}`);
  console.log(JSON.stringify({installedPiPackageVerified:true,primaryExtensions:["asen.ts"],childAuthorityAutoLoaded:false,modelInvocations:0}));
} finally {rmSync(root,{recursive:true,force:true});}
