import test from "node:test";
import assert from "node:assert/strict";
import {admitT06VerifiedSuperReview} from "../src/runtime/agents/t06-verified-review-reuse.js";

const fileA="a".repeat(64),fileB="b".repeat(64);
const hashes={"t06-writer-a.mjs":fileA,"t06-writer-b.mjs":fileB};
function fixture(){
 return {
  schema:"asen.t06.autorrevision-real/v1",
  sourceSha:"5bd752374f2db630a9d2ab0887e1025134a4e13f",
  sourceRunId:"44792916571",behaviorRunId:"44794317489",
  reviewSha:"540aa036fae5d60776645b83be806be8d821d02b",runId:"45048377977",
  models:["nvidia/nemotron-3.5-bolt-e4b","nvidia/nemotron-3.5-super-vl-120b-a12b"],
  reviewedFileHashes:{...hashes},behaviorVerified:true,providerCatalogVerified:true,
  result:"REVIEW_FAILED_OR_UNVERIFIED",reviewedByTwoModels:false,
  writerAuthorized:false,accepted:false,globalFull:false,
  reviews:[
   {requestedModel:"nvidia/nemotron-3.5-bolt-e4b",verdict:"unknown"},
   {requestedModel:"nvidia/nemotron-3.5-super-vl-120b-a12b",
    observedModel:"nvidia/nemotron-3.5-super-vl-120b-a12b",
    piProcessObserved:true,verdict:"pass",findingCount:0,
    reviewedSha256:[fileA,fileB],writerAuthority:false,acceptance:"not-accepted"}
  ]
 };
}
test("T06 conserva un único PASS auténtico con identidad y huellas",()=>{
 const got=admitT06VerifiedSuperReview(fixture(),hashes);
 assert.equal(got.verdict,"pass");assert.equal(got.reusedFromRunId,"45048377977");
 assert.equal(got.acceptance,"not-accepted");assert.equal(got.writerAuthority,false);
 assert.equal(Object.isFrozen(got),true);
 assert.equal(JSON.stringify(got).includes("reasoning"),false);
});
test("T06 rechaza otras ejecuciones, modelos, huellas y aprobaciones falseadas",()=>{
 const bad:(()=>unknown)[]=[
  ()=>({...fixture(),runId:"0000"}),
  ()=>({...fixture(),reviewSha:"f".repeat(40)}),
  ()=>({...fixture(),sourceRunId:"otro"}),
  ()=>({...fixture(),accepted:true}),
  ()=>({...fixture(),globalFull:true}),
  ()=>({...fixture(),reviewedByTwoModels:true}),
  ()=>({...fixture(),models:["nvidia/nemotron-3.5-bolt-e4b","otro"]}),
  ()=>({...fixture(),reviewedFileHashes:{"t06-writer-a.mjs":fileA,"t06-writer-b.mjs":"c".repeat(64)}}),
  ()=>({...fixture(),reviews:[fixture().reviews[0],{...fixture().reviews[1],verdict:"fail"}]}),
  ()=>({...fixture(),reviews:[fixture().reviews[0],{...fixture().reviews[1],findingCount:1}]}),
  ()=>({...fixture(),reviews:[fixture().reviews[0],{...fixture().reviews[1],writerAuthority:true}]}),
  ()=>({...fixture(),reviews:[fixture().reviews[0],{...fixture().reviews[1],reviewedSha256:[fileB,fileA]}]}),
  ()=>({}),
 ];
 for(const v of bad)assert.throws(()=>admitT06VerifiedSuperReview(v(),hashes),/no admite reutilización/u);
 assert.throws(()=>admitT06VerifiedSuperReview(fixture(),{"t06-writer-a.mjs":fileA,"t06-writer-b.mjs":"f".repeat(64)}),/no admite reutilización/u);
});
