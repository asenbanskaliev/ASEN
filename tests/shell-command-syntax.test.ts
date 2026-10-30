import assert from "node:assert/strict";
import test from "node:test";
import {dataArgumentRanges,shellCommandHeadIndex,tokenizeShellCommand,type ShellToken} from "../src/security/shell-command-syntax.js";

const rangeText=(command:string)=>dataArgumentRanges(command).map(([from,to])=>command.slice(from,to));
const words=(command:string)=>tokenizeShellCommand(command).map(({value,raw,operator,index})=>({value,raw,operator,index}));

test("tokenization preserves exact UTF-16 offsets and keeps quoted or escaped operators as words",()=>{
 const command=String.raw`echo 'rm -rf /; DROP TABLE x' && printf "%s|%s" a\&b`;
 assert.deepEqual(words(command),[
  {value:"echo",raw:"echo",operator:false,index:0},
  {value:"rm -rf /; DROP TABLE x",raw:"'rm -rf /; DROP TABLE x'",operator:false,index:5},
  {value:"&&",raw:"&&",operator:true,index:30},
  {value:"printf",raw:"printf",operator:false,index:33},
  {value:"%s|%s",raw:'"%s|%s"',operator:false,index:40},
  {value:"a&b",raw:String.raw`a\&b`,operator:false,index:48},
 ]);
});

test("head selection crosses reserved words, assignments and familiar wrapper options without mutating tokens",()=>{
 const cases=[
  ["then env MODE=test sudo -u postgres /usr/bin/psql -c x","psql"],
  ["! timeout --signal TERM 30 bash -lc x","bash"],
  ["elif command -- git reset --hard","git"],
  ["do X=1 nohup /bin/rm -r data","rm"],
 ] as const;
 for(const [command,expected] of cases){
  const tokens=tokenizeShellCommand(command),before=structuredClone(tokens);
  const cursor=shellCommandHeadIndex(tokens);
  assert.equal(tokens[cursor]?.value.split("/").at(-1),expected,command);
  assert.deepEqual(tokens,before,command);
 }
});

test("known data command arguments are returned as exact half-open source ranges",()=>{
 const examples=[
  [`echo 'rm -rf ./data; DROP TABLE users'`,[" 'rm -rf ./data; DROP TABLE users'"]],
  [`printf '%s' 'TRUNCATE TABLE users'`,[" '%s' 'TRUNCATE TABLE users'"]],
  [`rg 'DROP TABLE' docs`,[" 'DROP TABLE' docs"]],
  [`env MODE=test echo 'git reset --hard'`,[" 'git reset --hard'"]],
  [`echo left && pwd; cat file`,[" left "," file"]],
 ] as const;
 for(const [command,expected] of examples)assert.deepEqual(rangeText(command),expected,command);
});

test("simple data-only substitutions preserve outer and inner source offsets",()=>{
 const command=`echo $(printf harmless)`;
 const ranges=dataArgumentRanges(command);
 assert.deepEqual(ranges.map(([from,to])=>[from,to,command.slice(from,to)]),[
  [13,22," harmless"],
  [4,23," $(printf harmless)"],
 ]);
 assert.deepEqual(dataArgumentRanges(command),ranges,"a prior result cannot alter later offset derivation");
});

test("literal heredoc data is covered without treating an executable heredoc as prose",()=>{
 const prose=`cat <<'TXT'\nrm -rf data\nTXT`;
 const ranges=dataArgumentRanges(prose);
 assert.equal(ranges.some(([from,to])=>from<=prose.indexOf("rm -rf")&&to>=prose.indexOf("rm -rf")+6),true);
 assert.deepEqual(dataArgumentRanges(`psql <<'SQL'\nDROP TABLE users;\nSQL`),[]);
 assert.deepEqual(dataArgumentRanges(`echo '<<TXT'\nrm -rf data\nTXT`),[]);
});

test("unknown executors, wrappers and ordinary literal prose are never declared data",()=>{
 for(const command of [
  `deploy --message 'rm -rf data; DROP TABLE users'`,
  `node -e "console.log('DROP TABLE users')"`,
  `sudo echo 'rm -rf data'`,
  `env -u MODE echo 'rm -rf data'`,
  `sh -c "echo 'rm -rf data'"`,
  `ssh host "echo DROP TABLE users"`,
  `echo harmless | at now`,
 ])assert.deepEqual(dataArgumentRanges(command),[],command);
});

test("opaque substitutions, backticks, eval and compound command words keep lexical matches active",()=>{
 for(const command of [
  `echo $(rm -rf data)`,
  `echo $(echo $(printf x))`,
  "echo `printf 'rm -rf data'`",
  `echo <(printf 'DROP TABLE users')`,
  `eval 'echo rm -rf data'`,
  `if true; then echo 'rm -rf data'; fi`,
  `while true; do printf 'DROP TABLE'; done`,
  `{ echo 'rm -rf data'; }`,
  `echo 'unterminated`,
 ])assert.deepEqual(dataArgumentRanges(command),[],command);
});

test("quoted command names and inert-only segments do not create argument exemptions",()=>{
 assert.deepEqual(dataArgumentRanges(`'echo' 'rm -rf data'`),[]);
 assert.deepEqual(dataArgumentRanges(`X=1; cd /tmp && true; mkdir output`),[]);
 const tokens:readonly ShellToken[]=tokenizeShellCommand(`echo safe`);
 assert.equal(Object.isFrozen(tokens),true);
 assert.equal(tokens.every(Object.isFrozen),true);
 assert.equal(Object.isFrozen(dataArgumentRanges(`echo safe`)),true);
});
