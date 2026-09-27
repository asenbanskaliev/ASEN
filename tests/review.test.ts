import assert from "node:assert/strict";import test from "node:test";import {assertReviewCandidate,reviewEvidence} from "../src/review/review.js";
const c={id:"c1",repository:"r",revision:"abc",createdAt:"now"};
const base={candidateRepository:"r",candidateId:"c1",candidateRevision:"abc",reviewer:"reviewer-1",reviewerRole:"independent" as const,findings:[]};
test("review requires exact candidate revision",()=>assert.throws(()=>assertReviewCandidate(c,{...base,candidateRevision:"def"}),/revision mismatch/));
test("independent clean review passes",()=>assert.equal(reviewEvidence(c,base).status,"pass"));
test("author self-review cannot satisfy independent review",()=>assert.equal(reviewEvidence(c,{...base,reviewerRole:"author"}).status,"fail"));
test("high finding blocks review",()=>assert.equal(reviewEvidence(c,{...base,findings:[{id:"f",severity:"high",message:"x"}]}).status,"fail"));
test("review evidence id contains revision",()=>assert.match(reviewEvidence(c,base).id,/abc$/));
