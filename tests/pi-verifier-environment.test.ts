import test from "node:test";
import assert from "node:assert/strict";
import {createPiVerifierEnvironment} from "../scripts/gsp06-pi-free-environment.mjs";
test("offline verifier excludes ambient package directory",()=>{
 const result=createPiVerifierEnvironment({PI_PACKAGE_DIR:"/ambient"});
 assert.equal(Object.hasOwn(result,"PI_PACKAGE_DIR"),false);
 assert.equal(result.PI_OFFLINE,"1");
});
