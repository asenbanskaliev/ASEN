import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

test("verification selects local checks autonomously and avoids external cost or side effects",async()=>{
 const skill=await readFile(new URL("../skills/asen-verify/SKILL.md",import.meta.url),"utf8");
 assert.match(skill,/Infer the smallest relevant local deterministic checks/u);
 assert.match(skill,/without asking the user to choose commands/u);
 assert.match(skill,/Do not start CI, consume external model\/provider quota, publish, deploy, or cause external writes/u);
 assert.match(skill,/report it as pending/u);
});
