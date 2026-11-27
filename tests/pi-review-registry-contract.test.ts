import assert from "node:assert/strict";
import test from "node:test";
import {ModelRegistry} from "@earendil-works/pi-coding-agent";
import {resolvePiReviewRegistry} from "../src/review/pi-model-reviewer.js";

test("La fachada real del SDK Pi ofrece los métodos de revisión autenticada",()=>{
 const native=ModelRegistry.prototype;
 assert.equal(resolvePiReviewRegistry(native),native);
 for(const method of ["getAvailable","hasConfiguredAuth","streamSimple"] as const)assert.equal(typeof native[method],"function");
 assert.equal(resolvePiReviewRegistry({getAvailable(){return [];},hasConfiguredAuth(){return true;}}),undefined);
});
