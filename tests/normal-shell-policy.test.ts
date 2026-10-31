import assert from "node:assert/strict";
import test from "node:test";
import {classifyNormalShellCommand,normalShellCommandPreview,type NormalShellDecision} from "../src/security/normal-shell-policy.js";

const classify=(command:string)=>classifyNormalShellCommand(command);

test("normal mode denies the installed-reference hard forms",()=>{
 const cases=[
  ["rm -rf /","filesystem","rm"],["rm -r ~/cache","filesystem","rm"],["rm -fr $HOME/tmp","filesystem","rm"],
  ["git reset --hard HEAD~1","git","git"],["git clean -fd","git","git"],["git push --force-with-lease origin main","git","git"],
  ["git branch -D retired","git","branch"],["git branch --delete --force retired","git","branch"],
  ["chmod -R 777 /tmp/target",undefined,"chmod"],["chown -R user:group /tmp/target",undefined,"chown"],
 ] as const;
 for(const [command,dataLossKind,trigger] of cases){
  const decision=classify(command);
  assert.equal(decision.action,"deny",command);
  assert.equal(decision.title,"Shell command denied",command);
  assert.equal(decision.triggerIndex,command.indexOf(trigger),command);
  assert.equal(decision.dataLossKind,dataLossKind,command);
 }
 assert.equal(classify("git branch -D retired").guardedKey,"gitBranchDeleteForce");
});

test("a hard deny anywhere in a compound outranks guarded confirmation",()=>{
 const command="npm publish && echo ready; git -C repo push -f origin main && pi remove old";
 const decision=classify(command);
 assert.equal(decision.action,"deny");
 assert.equal(decision.guardedKey,undefined);
 assert.equal(decision.triggerIndex,command.indexOf("git"));
 assert.match(decision.preview??"",/git -C repo push -f origin main/);
});

test("forced branch deletion stays denied through Git global options, wrappers and every force spelling",()=>{
 const cases=[
  "git -C /repo branch -D old",
  "git -c core.quotePath=false branch -df old",
  "git --git-dir /repo/.git branch -fd old",
  "git --work-tree=/repo branch -d old -f",
  "git --git-dir=/repo/.git branch -f old -d",
  "git -C=/repo branch --delete old --force",
  "/usr/bin/git -c=core.quotePath=false branch --force old --delete",
  "env X=1 /usr/bin/git --work-tree /repo branch --delete --force old",
 ] as const;
 for(const command of cases){
  const decision=classify(command);
  assert.equal(decision.action,"deny",command);assert.equal(decision.guardedKey,"gitBranchDeleteForce",command);
  assert.equal(decision.dataLossKind,"git",command);assert.equal(decision.triggerIndex,command.indexOf("branch"),command);
 }
 const compound="npm publish && git -C /repo branch -D old";
 assert.equal(classify(compound).action,"deny");assert.equal(classify(compound).guardedKey,"gitBranchDeleteForce");
});

test("normal mode confirms guarded release and history commands with handler metadata",()=>{
 const cases=[
  ["git push origin main","gitPush","Confirm Git push?","push"],
  ["git -C /repo rebase main","gitRebase","Confirm Git rebase?","rebase"],
  ["npm publish --tag beta","npmPublish","Confirm npm publish?","publish"],
  ["pi remove example","piRemove","Confirm Pi package removal?","remove"],
 ] as const;
 for(const [command,guardedKey,title,trigger] of cases){
  const decision=classify(command);
  assert.deepEqual(decision,{action:"confirm",guardedKey,title,triggerIndex:command.indexOf(trigger),preview:command},command);
 }
 const compound=classify("git push origin main && npm publish");
 assert.equal(compound.action,"confirm");
 assert.equal(compound.title,"Confirm guarded actions: Git push; npm publish?");
 assert.equal(compound.guardedKey,"gitPush");
});

test("recognized non-Git filesystem and database loss needs confirmation",()=>{
 const cases=[
  ["rm -r ./build","filesystem"],["find cache -delete","filesystem"],
  ["psql -c 'DROP TABLE users'","database"],["sqlite3 app.db 'DELETE FROM users'","database"],
 ] as const;
 for(const [command,dataLossKind] of cases){
  const decision=classify(command);
  assert.equal(decision.action,"confirm",command);
  assert.equal(decision.dataLossKind,dataLossKind,command);
  assert.equal(decision.title,"Confirm recognized data-loss command?",command);
  assert.equal(decision.preview,command,command);
 }
});

test("ordinary, literal data, malformed non-actions and non-key Git evidence pass",()=>{
 for(const command of [
  "echo ready","", "git", "npm publis", "git pushx-not-a-command",
  "echo 'remember to git push later'","rg 'npm publish' docs","grep -rn 'git reset --hard' docs",
  "git reset HEAD~1","git clean -n","git restore .","git checkout -- file","git stash drop","git stash clear",
  "git branch -d merged","git -C /repo branch -d merged","git status", "echo `date`", "eval \"$(ssh-agent -s)\"",
  "echo 'git -C /repo branch -D old'","grep 'git --git-dir=/repo/.git branch --delete --force old' docs",
 ])assert.deepEqual(classify(command),{action:"pass",triggerIndex:0},command);
});

test("wrappers, nested shells, substitutions, eval, backticks and reserved words retain classification",()=>{
 const cases=[
  ["env X=1 git push origin main","confirm"],
  ["sh -c 'git rebase main'","confirm"],
  ["echo $(rm -rf data)","confirm"],
  ["eval 'git branch -D old'","deny"],
  ["echo `rm -rf /`","deny"],
  ["if true; then sudo rm -rf data; fi","confirm"],
  ["{ chown -R user:group data; }","deny"],
 ] as const;
 for(const [command,action] of cases)assert.equal(classify(command).action,action,command);
 for(const command of ["echo $(printf 'rm -rf data')","echo 'git push --force origin main'","grep 'then rm -rf' x"])
  assert.equal(classify(command).action,"pass",command);
});

test("raw-command previews use 60 characters of context, normalized whitespace and a 180-column cap",()=>{
 const command=`${"x".repeat(70)}\n  git\tpush origin main ${"z".repeat(200)}`;
 const triggerIndex=command.indexOf("git");
 const preview=normalShellCommandPreview(command,triggerIndex);
 assert.equal(preview.startsWith(`…${"x".repeat(57)} git push`),true);
 assert.equal([...preview].length,180);
 assert.equal(preview.endsWith("…"),true);
 assert.equal(normalShellCommandPreview("  npm\n\tpublish  ",2),"npm publish");
 assert.equal(normalShellCommandPreview("abc",-99),"abc");
 assert.equal(normalShellCommandPreview("abc",999),"…");
});

test("decisions are immutable, stable and never mutate the raw command",()=>{
 const command="git push origin main",before=command;
 const first=classify(command),snapshot:NormalShellDecision=structuredClone(first);
 assert.equal(Object.isFrozen(first),true);
 assert.throws(()=>{(first as {action:string}).action="pass";},TypeError);
 assert.deepEqual(classify(command),snapshot);
 assert.equal(command,before);
});
