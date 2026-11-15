// T5.6 (S-06): a normal Ctrl-C in the Pi child must be reported as exit code
// 130 (SIGINT), not as a generic failure (1).
//
// RED (before the fix): `src/cli.ts:208-212` resolves `code ?? 1` and never
// reads the signal, so a Ctrl-C in the child is reported as exit 1.
import test from "node:test";
import assert from "node:assert/strict";
import {resolveChildExit} from "../src/cli.js";

test("T5.6 a child that dies by SIGINT is reported as exit 130",()=>{
 assert.equal(resolveChildExit(null,"SIGINT"),130,"Ctrl-C (SIGINT) must map to the conventional 130");
 assert.equal(resolveChildExit(null,"SIGTERM"),143,"SIGTERM maps to 143");
});

test("T5.6 a child that exits with a code keeps that code",()=>{
 assert.equal(resolveChildExit(0,null),0);
 assert.equal(resolveChildExit(0,undefined),0,"child_process fixtures may omit the signal");
 assert.equal(resolveChildExit(2,null),2);
 assert.equal(resolveChildExit(null,null),1,"no code and no signal is a generic failure");
});
