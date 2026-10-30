import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {chmodSync,mkdtempSync,readFileSync,rmSync,statSync,symlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {acquireWorkspaceWriter} from "../src/runtime/workspace-writer-lease.js";
import {prepareWorkspaceCorrection,applyWorkspaceCorrection} from "../src/runtime/workspace-resolution.js";

function fixture(t:test.TestContext){
 const root=mkdtempSync(join(tmpdir(),"asen-workspace-action-"));
 t.after(()=>rmSync(root,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","Test");git("config","user.email","test@example.invalid");
 writeFileSync(join(root,"shared.txt"),"original\n");writeFileSync(join(root,"unrelated.txt"),"keep\n");
 git("add","shared.txt","unrelated.txt");git("commit","-qm","base");
 return {root,git};
}
test("exact, one-use manual workspace correction modifies only its approved file",t=>{
 const f=fixture(t),candidate=prepareWorkspaceCorrection({root:f.root,relativePath:"shared.txt"});
 const outcome=applyWorkspaceCorrection(candidate,"resolved\n");
 assert.equal(outcome.status,"updated");assert.equal(outcome.path,"shared.txt");
 assert.equal(readFileSync(join(f.root,"shared.txt"),"utf8"),"resolved\n");
 assert.equal(readFileSync(join(f.root,"unrelated.txt"),"utf8"),"keep\n");
 assert.throws(()=>applyWorkspaceCorrection(candidate,"second\n"),/already been consumed/);
 assert.match(f.git("status","--porcelain"),/shared.txt/);
});
test("manual workspace correction preserves the existing executable permission bits",t=>{
 if(process.platform==="win32"){t.skip("POSIX file mode bits are not portable to Windows");return;}
 const f=fixture(t),file=join(f.root,"shared.txt");
 chmodSync(file,0o755);f.git("add","shared.txt");f.git("commit","-qm","mark executable");
 const candidate=prepareWorkspaceCorrection({root:f.root,relativePath:"shared.txt"});
 applyWorkspaceCorrection(candidate,"replaced executable\n");
 assert.equal(statSync(file).mode&0o777,0o755);
});
test("changed contents invalidate the candidate without overwriting the newer file",t=>{
 const f=fixture(t),candidate=prepareWorkspaceCorrection({root:f.root,relativePath:"shared.txt"});
 writeFileSync(join(f.root,"shared.txt"),"external edit\n");
 assert.throws(()=>applyWorkspaceCorrection(candidate,"stale replacement\n"),/source changed/);
 assert.equal(readFileSync(join(f.root,"shared.txt"),"utf8"),"external edit\n");
});
test("existing writer blocks a second authorized workspace correction",t=>{
 const f=fixture(t),candidate=prepareWorkspaceCorrection({root:f.root,relativePath:"shared.txt"});
 const lock=acquireWorkspaceWriter({root:f.root,expectedHead:f.git("rev-parse","HEAD"),authorizationId:"first-writer",allowedPaths:["shared.txt"]});
 try{assert.throws(()=>applyWorkspaceCorrection(candidate,"second\n"),/conflict/);}
 finally{lock.release();}
 assert.equal(readFileSync(join(f.root,"shared.txt"),"utf8"),"original\n");
});
test("concurrent file drift during publication fails closed and preserves observed drift",t=>{
 const f=fixture(t),candidate=prepareWorkspaceCorrection({root:f.root,relativePath:"shared.txt"});
 assert.throws(()=>applyWorkspaceCorrection(candidate,"replacement\n",{beforePublish:()=>writeFileSync(join(f.root,"shared.txt"),"external\n")}),/source changed/);
 assert.equal(readFileSync(join(f.root,"shared.txt"),"utf8"),"external\n");
});
test("correction rejects unsafe paths and symlinks before permitting a writer",t=>{
 const f=fixture(t);
 for(const path of ["../outside","/etc/passwd",".git/config",".env","src\\..\\shared.txt"]){
  assert.throws(()=>prepareWorkspaceCorrection({root:f.root,relativePath:path}));
 }
 if(process.platform==="win32"){t.skip("File symlink creation requires optional Windows privileges");return;}
 const outside=join(f.root,"outside.txt");writeFileSync(outside,"outside");
 symlinkSync(outside,join(f.root,"symlink.txt"));
 assert.throws(()=>prepareWorkspaceCorrection({root:f.root,relativePath:"symlink.txt"}),/ordinary/);
 assert.equal(readFileSync(outside,"utf8"),"outside");
});
