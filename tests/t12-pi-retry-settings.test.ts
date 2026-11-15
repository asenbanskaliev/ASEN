import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {SettingsManager} from "../node_modules/@earendil-works/pi-coding-agent/dist/core/settings-manager.js";
// @ts-expect-error JavaScript-only T12 settings helper.
import {disablePiRetries} from "../scripts/t12-pi-retry-settings.mjs";

test("T12 retry limits merge into Pi settings without removing installed provider packages",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-pi-retry-settings-"));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const agentDirectory=join(root,"agent");
 const projectDirectory=join(root,"project");
 await mkdir(agentDirectory);
 await mkdir(projectDirectory);
 const original={
  packages:["npm:pi-ollama-cloud@0.13.1"],
  extensions:["./extensions/custom.ts"],
  retry:{enabled:true,maxRetries:3,provider:{maxRetries:2,maxRetryDelayMs:1234}},
  customSetting:"preserve-me",
 };
 await writeFile(join(agentDirectory,"settings.json"),JSON.stringify(original));

 await disablePiRetries(agentDirectory);

 const merged=JSON.parse(await readFile(join(agentDirectory,"settings.json"),"utf8"));
 assert.deepEqual(merged.packages,original.packages);
 assert.deepEqual(merged.extensions,original.extensions);
 assert.equal(merged.customSetting,original.customSetting);
 assert.deepEqual(merged.retry,{enabled:false,maxRetries:0,provider:{maxRetries:0,maxRetryDelayMs:1234}});
 const settings=SettingsManager.create(projectDirectory,agentDirectory);
 assert.equal(settings.getRetrySettings().enabled,false);
 assert.equal(settings.getRetrySettings().maxRetries,0);
 assert.equal(settings.getProviderRetrySettings().maxRetries,0);
});

test("T12 retry limits create isolated settings when Pi has no existing settings file",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-pi-retry-empty-"));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const agentDirectory=join(root,"agent");
 await mkdir(agentDirectory);
 const retry=await disablePiRetries(agentDirectory);
 assert.deepEqual(retry,{enabled:false,maxRetries:0,providerMaxRetries:0});
});
