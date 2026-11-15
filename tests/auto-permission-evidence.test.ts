import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,writeFileSync,symlinkSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {autoScriptEvidence} from "../src/security/auto-permission-evidence.js";

test("Auto reads only bounded host-selected local script source, with no execution",t=>{
 const cwd=mkdtempSync(join(tmpdir(),"asen-auto-evidence-"));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 writeFileSync(join(cwd,"verify.mjs"),"export const check = true;\n");
 writeFileSync(join(cwd,"package.json"),'{"scripts":{"test":"node --test"}}');
 const one=autoScriptEvidence("node verify.mjs",cwd);
 assert.equal(one.kind,"evidence");
 if(one.kind==="evidence"){assert.deepEqual(one.items.map(x=>x.path),["verify.mjs"]);assert.match(one.items[0]!.content,/check = true/);}
 const pkg=autoScriptEvidence("npm run test",cwd);
 assert.equal(pkg.kind,"evidence");
 if(pkg.kind==="evidence")assert.deepEqual(pkg.items.map(x=>x.path),["package.json"]);
});
test("Auto refuses source disclosure through symlink, secret, parent traversal, oversized or invalid bytes",t=>{
 const cwd=mkdtempSync(join(tmpdir(),"asen-auto-denial-"));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 writeFileSync(join(cwd,"secret.mjs"),"const api_key = 'SENSITIVE_KEY'\n");
 writeFileSync(join(cwd,"huge.mjs"),"x".repeat(8193));
 writeFileSync(join(cwd,"binary.mjs"),Buffer.from([0,10,20]));
 for(const command of ["node secret.mjs","node huge.mjs","node binary.mjs","node ../outside.mjs"])
  assert.equal(autoScriptEvidence(command,cwd).kind,"invalid",command);
 writeFileSync(join(cwd,"real.mjs"),"export default 1");
 try{symlinkSync(join(cwd,"real.mjs"),join(cwd,"alias.mjs"));}
 catch(error){if(["EPERM","EACCES"].includes((error as NodeJS.ErrnoException).code??""))return;throw error;}
 assert.equal(autoScriptEvidence("node alias.mjs",cwd).kind,"invalid");
});
test("Auto never evaluates complex shell programs or interpolates executable operands",t=>{
 const cwd=mkdtempSync(join(tmpdir(),"asen-auto-shell-"));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 for(const command of ["node verify.mjs && rm -rf data","node $(echo verify.mjs)","bash -c 'node verify.mjs'",
  "node verify.mjs > /tmp/result","node ./verify.mjs | cat","npm run build --prefix /tmp/other"])
  assert.equal(autoScriptEvidence(command,cwd).kind,"none",command);
});
