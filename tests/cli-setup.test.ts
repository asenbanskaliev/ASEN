// T5.1: `asen setup` must either execute what it promises or stop promising it.
//
// Today `src/cli.ts:92` answers "ASEN setup execution is not available yet"
// with exit 2 even for the declared `--dry-run` path, while the help text
// still advertises `asen setup --dry-run [--yes]` as a working command.
//
// Decision (recorded in the audit): `setup --dry-run` is the supported
// command and must succeed (exit 0) with the maintenance plan; `setup`
// without `--dry-run` must keep refusing (exit 2) and the help must name the
// refusal honestly. These tests pin that contract.
import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {join} from "node:path";

const cli=join(fileURLToPath(new URL("..",import.meta.url)),"dist","cli.js");

function runCli(args:readonly string[]):{code:number;stdout:string;stderr:string}{
 try{
  const stdout=execFileSync(process.execPath,[cli,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  return {code:0,stdout,stderr:""};
 }catch(error){
  const failure=error as {status?:number;stdout?:string;stderr?:string};
  return {code:failure.status??1,stdout:String(failure.stdout??""),stderr:String(failure.stderr??"")};
 }
}

test("T5.1 setup --dry-run produces the maintenance plan and succeeds",()=>{
 const result=runCli(["setup","--dry-run"]);
 assert.equal(result.code,0,`the declared dry-run path must succeed, got exit ${result.code}: ${result.stderr}`);
 const plan=JSON.parse(result.stdout) as {schema?:string;operation?:string;executable?:unknown};
 assert.equal(plan.schema,"asen.maintenance-plan/v1");
 assert.equal(plan.operation,"setup");
 assert.equal(plan.executable,false,"the dry-run plan must keep declaring itself non-executing");
});

test("T5.1 setup without --dry-run refuses honestly",()=>{
 const result=runCli(["setup"]);
 assert.equal(result.code,2,`setup without --dry-run must refuse, got exit ${result.code}`);
 assert.match(result.stderr,/not available|use --dry-run/i,`the refusal must be stated: ${result.stderr}`);
});

test("T5.1 help names the setup refusal instead of advertising execution",()=>{
 const result=runCli(["--help"]);
 assert.equal(result.code,0);
 assert.match(result.stdout,/setup --dry-run/,`help must keep the dry-run command visible: ${result.stdout.slice(0,200)}`);
 assert.match(result.stdout,/preview|no changes|not.*available/i,`help must not advertise setup execution: ${result.stdout.slice(0,400)}`);
});
