import test from "node:test";
import assert from "node:assert/strict";
import {createPiRuntimeEnvironment,createPiVerifierEnvironment} from "../scripts/gsp06-pi-free-environment.mjs";

test("packed Pi verifier discards ambient context and forces offline operation",()=>{
 const result=createPiVerifierEnvironment({PI_PACKAGE_DIR:"/ambient",PI_OFFLINE:"0",PI_SKIP_VERSION_CHECK:"0",PI_TELEMETRY:"1",ASEN_PI_AUTHORITY:"/ambient",PATH:"/bin"});
 assert.equal(Object.hasOwn(result,"PI_PACKAGE_DIR"),false);
 assert.equal(Object.hasOwn(result,"ASEN_PI_AUTHORITY"),false);
 assert.equal(result.PI_OFFLINE,"1");
 assert.equal(result.PI_SKIP_VERSION_CHECK,"1");
 assert.equal(result.PI_TELEMETRY,"0");
});

test("Windows runtime environment normalizes variable casing",()=>{
 const result=createPiRuntimeEnvironment({path:"C:/tools",home:"C:/home",pi_package_dir:"C:/packages"},"win32");
 assert.equal(result.PATH,"C:/tools");
 assert.equal(result.HOME,"C:/home");
 assert.equal(result.PI_PACKAGE_DIR,"C:/packages");
});
