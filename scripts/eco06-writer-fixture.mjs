import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {cp,writeFile} from "node:fs/promises";
import path from "node:path";

/** Prepare the disposable live-writer candidate, including its native skill baseline. */
export async function prepareEco06WriterCandidate(project,skillsDirectory){
  const git=(...args)=>execFileSync("git",args,{cwd:project,encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:10_000}).trim();
  await cp(skillsDirectory,path.join(project,"skills"),{recursive:true});
  await writeFile(path.join(project,"README.md"),"# ECO-06 controlled write\n\nInitial candidate.\n");
  git("init","-q");
  git("config","user.email","asen-eco06@example.invalid");
  git("config","user.name","ASEN ECO-06 E2E");
  git("add","--","README.md","skills");
  git("commit","-qm","fixture: clean writer candidate");
  assert.equal(git("status","--porcelain=v1","--untracked-files=all"),"","The live-writer candidate must start clean");
  return git("rev-parse","HEAD");
}
