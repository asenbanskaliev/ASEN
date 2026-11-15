// T5.2: `dist/` can go stale (older than `src/`), which makes every piece of
// host evidence invalid (S-09). The doctor check must detect it and warn.
//
// RED (before the fix): `doctorChecks` has no `dist-freshness` check, so a
// stale build is invisible. The audit's own first host capture was invalid
// for exactly this reason.
import test from "node:test";
import assert from "node:assert/strict";
import {doctorChecks} from "../src/runtime/doctor.js";

test("T5.2 doctor warns when dist is older than src",()=>{
 const checks=doctorChecks({
  piVersionOk:true,homeWritable:true,registryAvailable:true,
  profileValid:true,historyPrivate:true,telemetryConsentValid:true,
  dist:{newestDistMtime:1_000,newestSrcMtime:2_000},
 });
 const check=checks.find(c=>c.name==="dist-freshness");
 assert.ok(check,"the doctor must include a dist-freshness check");
 assert.equal(check!.state,"warn",`a stale dist must warn, not fail: ${check!.state}`);
 assert.match(check!.detail,/older|stale/i,`the detail must say what is wrong: ${check!.detail}`);
});

test("T5.2 doctor passes when dist is newer than src",()=>{
 const checks=doctorChecks({
  piVersionOk:true,homeWritable:true,registryAvailable:true,
  profileValid:true,historyPrivate:true,telemetryConsentValid:true,
  dist:{newestDistMtime:2_000,newestSrcMtime:1_000},
 });
 const check=checks.find(c=>c.name==="dist-freshness");
 assert.ok(check);
 assert.equal(check!.state,"pass",`a fresh dist must pass: ${check!.state}`);
});

test("T5.2 doctor warns when dist is missing",()=>{
 const checks=doctorChecks({
  piVersionOk:true,homeWritable:true,registryAvailable:true,
  profileValid:true,historyPrivate:true,telemetryConsentValid:true,
  dist:{newestDistMtime:undefined,newestSrcMtime:1_000} as import("../src/runtime/doctor.js").DistFreshness,
 });
 const check=checks.find(c=>c.name==="dist-freshness");
 assert.ok(check);
 assert.equal(check!.state,"warn",`a missing dist must warn: ${check!.state}`);
});
