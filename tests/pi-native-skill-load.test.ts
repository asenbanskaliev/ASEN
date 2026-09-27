import assert from "node:assert/strict";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {mkdtempSync,rmSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
test("real Pi RPC loads exactly ASEN-issued SKILL.md paths without a model",t=>{
 const cwd=resolve("."),dir=mkdtempSync(join(tmpdir(),"asen-real-pi-skills-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const context=issueSkillContext("task:explorer",cwd,undefined,{phase:"explore"});
 const paths=selectSkills(context).map(s=>s.path);
 const main=fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
 const cli=join(dirname(main),"bundle","cli.js");
 const rpc=spawnSync(process.execPath,[cli,"--mode","rpc","--no-session","--no-extensions","--no-skills",...paths.flatMap(path=>["--skill",path])],{
  cwd,encoding:"utf8",timeout:20000,input:JSON.stringify({id:"loaded",type:"get_commands"})+"\n",env:{...process.env,PI_CODING_AGENT_DIR:dir,PI_OFFLINE:"1"}
 });
 assert.equal(rpc.status,0,rpc.stderr);
 const messages=rpc.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
 const response=messages.find(message=>message.type==="response"&&message.id==="loaded"&&message.command==="get_commands");
 assert.equal(response?.success,true,rpc.stdout);
 const loaded=response.data.commands.filter((command:{source:string})=>command.source==="skill");
 assert.deepEqual(loaded.map((command:{sourceInfo:{path:string}})=>realpathSync(command.sourceInfo.path)),paths.map(path=>realpathSync(resolve(cwd,path))));
});
