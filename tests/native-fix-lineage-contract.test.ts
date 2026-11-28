import assert from "node:assert/strict";
import test from "node:test";
import {createFixLineage, reopenFixLineage, advanceFixLineage} from "../src/runtime/lifecycle/native-fix-lineage-contract.js";

const origin = {
 tree: "a".repeat(40), proposal: "b".repeat(64), receipt: "review:origin", policy: "c".repeat(64),
 judges: ["judge:a", "judge:b"], findings: [
  {id:"one", severity:"high", scope:"src/one.ts"}, {id:"two", severity:"medium", scope:"src/two.ts"},
 ],
};
const originBinding = success(createFixLineage(origin)).originBinding;
const one = {originBinding, fromTree:origin.tree, tree:"d".repeat(40), receipt:"repair:one", worker:"worker:a"};
const two = {originBinding, fromTree:one.tree, tree:"e".repeat(40), receipt:"repair:two", worker:"worker:b"};
const begin = (attempt = one) => ({type:"begin", attempt});
const finish = (attempt = one, verdicts = [["one","resolved"],["two","resolved"]], dissent = verdicts) => ({
 type:"finish", attempt, judgments:[verdicts,dissent].map((entries,i) => ({judge:origin.judges[i],
  findings:entries.map(([id,verdict]) => ({id,verdict})),
 })),
});
const reopen = (value: unknown) => reopenFixLineage(JSON.parse(JSON.stringify(value)), origin);
function success(result: ReturnType<typeof reopenFixLineage>) {
 if (!result.ok) assert.fail(result.reason);
 return result;
}
const initial = () => success(createFixLineage(origin)).state;

test("reapertura JSON: solo un dictamen explícito de ambos resuelve cada hallazgo vigente", () => {
 const pending = success(advanceFixLineage(initial(), origin, begin()));
 assert.equal(pending.round, 1);
 assert.equal(success(reopen(pending.state)).phase, "pending");
 const first = success(advanceFixLineage(success(reopen(pending.state)).state, origin,
  finish(one, undefined, [["one","resolved"],["two","survives"]])));
 assert.equal(first.phase, "ready");
 assert.deepEqual(first.findings, [origin.findings[1]]);
 const second = success(advanceFixLineage(first.state, origin, begin(two)));
 assert.equal(second.round, 2);
 assert.equal(advanceFixLineage(second.state, origin, finish(two)).ok, false);
 const done = success(advanceFixLineage(second.state, origin, finish(two, [["two","resolved"]])));
 assert.equal(success(reopen(done.state)).phase, "resolved");
 assert.deepEqual(done.findings, []);
});

test("rechaza origen, formas, identidades, dictámenes y transiciones obsoletas o repetidas", () => {
 const state = initial();
 const pending = success(advanceFixLineage(state, origin, begin())).state;
 for (const wrong of [{tree:one.tree},{proposal:"f".repeat(64)},{receipt:"other"},{policy:"f".repeat(64)},
  {judges:["judge:a","judge:c"]},{findings:[origin.findings[0],{...origin.findings[1],scope:"other"}]},
  {findings:[origin.findings[0],{...origin.findings[1],severity:"low"}]}]) {
  assert.equal(reopenFixLineage(pending, {...origin,...wrong}).ok, false);
 }
 for (const bad of [{...state,version:1}, {...state,round:1}, {...state,rounds:[...pending.rounds,...pending.rounds]},
  {...state,origin:{...origin,judges:["judge:a","judge:a"]}}, {...state,rounds:Array(1)},
  {...state,origin:{...origin,findings:Array(65).fill(origin.findings[0])}}]) {
  assert.equal(reopenFixLineage(bad, origin).ok, false);
 }
 assert.equal(createFixLineage({...origin,findings:[origin.findings[0],origin.findings[0]]}).ok, false);
 assert.equal(createFixLineage({...origin,get tree(): string { throw Error("no leer"); }}).ok, false);
 for (const bad of [begin(), begin(two), finish({...one,tree:two.tree}), finish({...one,receipt:two.receipt}),
  finish({...one,worker:two.worker}), finish(one, [["one","resolved"]]), finish(one, [["one","resolved"],["one","resolved"]]),
  finish(one, [["one","resolved"],["two","unknown"]]), {...finish(),judgments:[finish().judgments[0],finish().judgments[0]]},
  {...finish(),round:1}, {...finish(),judgments:"interrupted"}]) {
  assert.equal(advanceFixLineage(pending, origin, bad).ok, false);
 }
 const done = success(advanceFixLineage(pending, origin, finish())).state;
 assert.equal(advanceFixLineage(done, origin, finish()).ok, false);
 assert.equal(reopen({...done,rounds:[{...done.rounds[0],outcome:finish(one, [["one","resolved"]]).judgments}]}).ok, false);
 assert.equal(advanceFixLineage(state, origin, begin({...one,receipt:origin.receipt})).ok, false);
});

test("events and stored attempts must belong to the exact origin", () => {
 const alternate = {...origin, policy:"f".repeat(64)};
 const other = success(createFixLineage(alternate));
 assert.deepEqual(advanceFixLineage(other.state, alternate, begin()), {ok:false,reason:"attempt-mismatch"});
 const bound = {...one,originBinding:other.originBinding};
 const otherPending = success(advanceFixLineage(other.state, alternate, begin(bound))).state;
 const unchanged = JSON.stringify(otherPending);
 for (const event of [finish(), {type:"interrupt",attempt:one}]) {
  assert.deepEqual(advanceFixLineage(otherPending, alternate, event), {ok:false,reason:"attempt-mismatch"});
 }
 assert.equal(JSON.stringify(otherPending), unchanged);
 assert.equal(success(advanceFixLineage(otherPending, alternate, finish(bound))).phase, "resolved");
 const pending = success(advanceFixLineage(initial(), origin, begin())).state;
 assert.deepEqual(reopenFixLineage({...pending,origin:alternate}, alternate), {ok:false,reason:"invalid-data"});
});

test("el intento interrumpido queda consumido; un superviviente en la segunda ronda escala", () => {
 const first = success(advanceFixLineage(initial(), origin, begin())).state;
 const kept = [["one","resolved"],["two","survives"]];
 const remaining = success(advanceFixLineage(first, origin, finish(one, kept))).state;
 assert.equal(advanceFixLineage(remaining, origin, begin({...two,fromTree:origin.tree})).ok, false);
 assert.equal(advanceFixLineage(remaining, origin, begin({...two,receipt:one.receipt})).ok, false);
 assert.equal(advanceFixLineage(remaining, origin, begin({...two,tree:one.tree})).ok, false);
 const second = success(advanceFixLineage(remaining, origin, begin(two))).state;
 assert.equal(advanceFixLineage(second, origin, finish(one, kept)).ok, false);
 assert.equal(advanceFixLineage(second, origin, {type:"interrupt",attempt:one}).ok, false);
 const interrupted = success(advanceFixLineage(success(reopen(first)).state, origin, {type:"interrupt",attempt:one}));
 assert.equal(success(reopen(interrupted.state)).phase, "interrupted");
 assert.equal(interrupted.round, 1);
 assert.equal(advanceFixLineage(interrupted.state, origin, begin(two)).ok, false);
 assert.equal(advanceFixLineage(interrupted.state, origin, finish()).ok, false);
 const terminal = success(advanceFixLineage(second, origin, finish(two, [["two","survives"]])));
 assert.equal(success(reopen(terminal.state)).phase, "escalated");
 assert.equal(advanceFixLineage(terminal.state, origin, begin({...two,fromTree:two.tree,tree:"f".repeat(40),receipt:"third"})).ok, false);
});
