import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,readFile,writeFile,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
// @ts-expect-error JS fixture helper is intentionally not part of the compiled package.
import {prepare,grade} from "../scripts/t12-real-agent-fixture.mjs";

test("T12 fixture grades three grounded findings and rejects mutation",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-t12-fixture-"));
 t.after(async()=>rm(root,{recursive:true,force:true}));
 const folder=join(root,"case");
 const prepared=await prepare(folder);
 assert.deepEqual(prepared.expectedIds.sort(),["authorization","parsing","pricing"]);
 const answer=join(root,"answer.json");
 await writeFile(answer,JSON.stringify({findings:[
  {id:"pricing",path:"src/pricing.js",reason:"Discount is added rather than subtracted from the total."},
  {id:"authorization",path:"src/access.js",reason:"A viewer role is incorrectly allowed to edit other users' documents."},
  {id:"parsing",path:"src/parse.js",reason:"parseInt accepts trailing junk such as 12abc instead of rejecting malformed input."}
 ]}));
 assert.equal((await grade(folder,answer)).passed,true);
 await writeFile(answer,JSON.stringify({findings:[{id:"pricing",path:"src/pricing.js",reason:"The total adds the discount instead of subtracting it."}]}));
 assert.equal((await grade(folder,answer)).passed,false);
 await writeFile(join(folder,"src/pricing.js"),"tampered");
 await assert.rejects(()=>grade(folder,answer),/Fixture was modified/);
});

test("T12 fixture rejects unexpected files and directories instead of claiming unchanged",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-t12-tree-"));
 t.after(async()=>rm(root,{recursive:true,force:true}));
 const fixture=join(root,"fixture");
 await prepare(fixture);
 const answer=join(root,"answer.json");
 await writeFile(answer,JSON.stringify({findings:[]}));
 await writeFile(join(fixture,"src","unexpected.js"),"export const unexpected = true;\n");
 await assert.rejects(()=>grade(fixture,answer),/Fixture src contains missing or unexpected entries/);
 await rm(join(fixture,"src","unexpected.js"));
 await mkdir(join(fixture,"hidden"));
 await assert.rejects(()=>grade(fixture,answer),/Fixture root contains missing or unexpected entries/);
 await rm(join(fixture,"hidden"),{recursive:true});
 assert.equal((await grade(fixture,answer)).fixtureUnchanged,true);
});
