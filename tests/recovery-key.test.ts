import assert from "node:assert/strict";
import test from "node:test";
import {randomBytes} from "node:crypto";
import {spawnSync} from "node:child_process";
import {recoveryKeyFromEnvironment} from "../src/session/recovery-key.js";
test("recovery signing key is supplied by host and survives process restart",()=>{
 const key=randomBytes(32),encoded=key.toString("base64url");
 assert.deepEqual(recoveryKeyFromEnvironment({ASEN_RECOVERY_KEY:encoded}),key);
 const child=spawnSync(process.execPath,["--import","tsx","-e",'import {recoveryKeyFromEnvironment} from "./src/session/recovery-key.ts";process.stdout.write(recoveryKeyFromEnvironment().toString("hex"))'],{encoding:"utf8",env:{...process.env,ASEN_RECOVERY_KEY:encoded}});
 assert.equal(child.status,0,child.stderr);
 assert.equal(child.stdout,key.toString("hex"));
});
test("recovery rejects missing, short, invalid and noncanonical secrets",()=>{
 for(const value of [undefined,"",randomBytes(16).toString("base64url"),"!".repeat(43),"A".repeat(42)+"B"])
  assert.throws(()=>recoveryKeyFromEnvironment(value===undefined?{}:{ASEN_RECOVERY_KEY:value}),/unavailable or malformed|malformed/);
});
