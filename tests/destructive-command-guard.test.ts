import assert from "node:assert/strict";
import test from "node:test";
import {recognizeDestructiveCommands,type DestructiveCommandMatch} from "../src/security/destructive-command-guard.js";

const signatures=(command:string)=>recognizeDestructiveCommands(command).map(({kind,triggerIndex,hardDeny})=>({kind,triggerIndex,hardDeny}));

const destructiveSql=[
 `psql -c 'DROP TABLE users'`,
 `mysql --execute='TRUNCATE TABLE users'`,
 `sqlite3 app.db 'DELETE FROM users;'`,
 `psql -c 'DELETE FROM users WHERE 1=1'`,
 `echo 'DROP DATABASE app' | psql`,
 `printf '%s' 'TRUNCATE users' | mysql`,
 `env MODE=test sudo -u postgres /usr/bin/psql -c 'DROP SCHEMA public CASCADE'`,
 `sh -c "echo ready; psql -c 'DROP TABLE users'"`,
 `psql <<'SQL'\nDROP TABLE users;\nSQL`,
 `sqlite3 app.db 'SELECT 1; /* maintenance */ DROP TABLE users'`,
] as const;

test("recognizes destructive SQL only through supported database clients and literal payloads",()=>{
 for(const command of destructiveSql){
  const matches=recognizeDestructiveCommands(command);
  assert.ok(matches.some(({kind})=>kind==="database"),command);
  assert.ok(matches.every(({triggerIndex})=>triggerIndex>=0&&triggerIndex<command.length),command);
 }
 for(const command of [
  `psql -c 'SELECT * FROM users'`,`sqlite3 app.db 'DELETE FROM users WHERE id=7'`,
  `psql -c "SELECT 'DROP TABLE users'"`,`echo 'DROP TABLE users'`,`rg 'DROP TABLE' docs`,
  `psql <<'SQL'\nSELECT 'DROP TABLE users';\nSQL`,`psql <<'SQL'\nSELECT \`rm -rf data\`;\nSQL`,
  `node -e "console.log('DROP TABLE users')"`,
 ])assert.deepEqual(recognizeDestructiveCommands(command),[],command);
});

test("recognizes recursive rm, find deletion and find exec while preserving direct removal evidence",()=>{
 for(const command of [
  `echo ready && rm -fr -- ./data`,`find ./data -type f -delete`,
  String.raw`find cache -exec echo {} \; -exec rm -r {} \;`,
  `find ./data -print0 | xargs -0 rm -rf`,`timeout 30 bash -lc 'rm -r ./data'`,
 ])assert.ok(recognizeDestructiveCommands(command).some(({kind})=>kind==="filesystem"),command);
 assert.deepEqual(recognizeDestructiveCommands(`rm -rf /tmp/a && rm -r /tmp/b`).map(match=>match.removalTargets),[["/tmp/a"],["/tmp/b"]]);
 assert.equal(recognizeDestructiveCommands(`rm -fr /`)[0]?.hardDeny,true);
 assert.equal(recognizeDestructiveCommands(`rm -r "$HOME"`)[0]?.hardDeny,true);
 for(const command of [`rm one`,`find . -name '*.ts'`,`find . -exec echo 'rm -r data' {} +`])
  assert.deepEqual(recognizeDestructiveCommands(command),[],command);
});

test("reports Git data-loss forms without deciding their eventual admission policy",()=>{
 const cases=[
  [`git -C /repo reset --hard HEAD`,true],[`git clean -fd`,true],
  [`git push --force-with-lease origin main`,true],[`git branch -D old`,false],
  [`git reset HEAD~1`,false],[`git clean -n`,false],[`git restore .`,false],
  [`git rebase main`,false],[`git checkout -- file`,false],[`git stash drop`,false],
 ] as const;
 for(const [command,hardDeny] of cases){
  const match=recognizeDestructiveCommands(command).find(({kind})=>kind==="git");
  assert.ok(match,command);assert.equal(match.hardDeny,hardDeny,command);
 }
 for(const command of [`git status`,`git push origin main`,`git branch -d merged`,`git stash list`])
  assert.deepEqual(recognizeDestructiveCommands(command),[],command);
});

test("finds nested shells, substitutions, eval, backticks and reserved-word bodies",()=>{
 for(const command of [
  String.raw`bash -lc "rm -r \"./data\""`,`echo $(rm -rf data)`,`echo \`rm -rf data\``,
  `eval 'rm -rf data'`,`command eval 'git reset --hard'`,
  `if true; then sudo rm -rf data; fi`,`while rm -rf data; do :; done`,`{ rm -rf data; }`,
 ])assert.ok(recognizeDestructiveCommands(command).length>0,command);
 for(const command of [
  `echo $(printf 'rm -rf data')`,`echo \`date\``,`echo '\`rm -rf data\`'`,
  `eval 'echo rm -rf data'`,`eval "$cmd"`,`echo 'unterminated \`rm -rf data'`,
 ])assert.deepEqual(recognizeDestructiveCommands(command),[],command);
});

test("quoted operators and data operands stay inert, while compound evidence remains ordered",()=>{
 for(const command of [
  `echo 'rm -rf ./data; DROP TABLE users'`,`printf '%s ' ';' rm -r ./data`,
  `echo '|' rm -r cache`,String.raw`echo \; rm -r cache`,
  `env X=1 echo 'git reset --hard'`,`grep 'then rm -rf' x`,
 ])assert.deepEqual(recognizeDestructiveCommands(command),[],command);
 const command=`echo safe; rm -r data && git reset --hard; psql -c 'DROP TABLE users'`;
 const matches=recognizeDestructiveCommands(command);
 assert.deepEqual(matches.map(match=>match.kind),["filesystem","git","database"]);
 assert.deepEqual(matches.map(match=>command.slice(match.triggerIndex).split(/\s/,1)[0]),["rm","git","psql"]);
 assert.deepEqual(matches.map(match=>match.hardDeny),[false,true,false]);
});

test("results are immutable, stable, source-offset based evidence",()=>{
 const command=`prefix=true; env X=1 sudo -u root rm -r data`;
 const first=recognizeDestructiveCommands(command);
 const snapshot:readonly DestructiveCommandMatch[]=structuredClone(first);
 assert.deepEqual(signatures(command),[{kind:"filesystem",triggerIndex:command.indexOf("rm"),hardDeny:false}]);
 assert.deepEqual(recognizeDestructiveCommands(command),snapshot);
 assert.equal(Object.isFrozen(first),true);
 assert.equal(first.every(match=>Object.isFrozen(match)),true);
 assert.throws(()=>{(first as DestructiveCommandMatch[]).push({kind:"git",triggerIndex:0,hardDeny:false});},TypeError);
});
