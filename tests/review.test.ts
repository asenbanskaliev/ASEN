import assert from "node:assert/strict";
import test from "node:test";
import { assertReviewCandidate, reviewEvidence } from "../src/review/review.js";

const candidate={id:"c1",repository:"r",revision:"abc",createdAt:"now"};
test("review is candidate-bound",()=>assert.throws(()=>assertReviewCandidate(candidate,{candidateId:"other",reviewer:"r",findings:[]})));
test("high finding fails review evidence",()=>assert.equal(reviewEvidence({candidateId:"c1",reviewer:"r",findings:[{id:"f",severity:"high",message:"x"}]}).status,"fail"));
