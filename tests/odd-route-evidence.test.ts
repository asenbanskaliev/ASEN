import assert from "node:assert/strict";
import test from "node:test";
import {randomBytes} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {EvidenceStore,loadEvidence,saveEvidence} from "../src/evidence/store.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {verifySkillEvidence} from "../src/verify/verifier.js";
import {issueOddDecision} from "./helpers/odd-routing.js";
import {admitRouteEvidence,genuineRouteEvidence} from "./helpers/route-evidence.js";

const candidate={id:"candidate",repository:"repo",revision:"revision",createdAt:"now"};
const metadata={id:"route",summary:"Exact orchestration route",createdAt:"now"};
const addUnknown=(store:EvidenceStore,proof:unknown,value:unknown,c=candidate)=>
 Reflect.apply(store.addRouteDecision,store,[c,proof,value]);

test("genuine route evidence contributes to the mutation gate",()=>{
 const store=new EvidenceStore();
 admitRouteEvidence(store,candidate,metadata);
 assert.equal(verifySkillEvidence(candidate,["asen-odd","asen-work-unit"],store,"mutation").ok,false);
 store.add(candidate,{id:"unit",kind:"work-unit",status:"pass",summary:"Bounded work unit",createdAt:"now"});
 assert.equal(verifySkillEvidence(candidate,["asen-odd","asen-work-unit"],store,"mutation").ok,true);
});

test("generic evidence admission rejects every manual route-decision status",()=>{
 const store=new EvidenceStore();
 for(const status of ["pass","fail","expected-fail"] as const){
  assert.throws(()=>store.add(candidate,{id:status,kind:"route-decision",status,summary:"manual prose",createdAt:"now"}),/genuine orchestration proof/);
 }
});

test("plans issue exact deeply frozen route provenance only for an exact candidate",()=>{
 const taskId="exact-fields",decision=issueOddDecision({taskId,repository:candidate.repository});
 const plan=buildOrchestrationPlan({taskId,repository:candidate.repository,prompt:"plan",candidate},decision);
 assert.deepEqual(plan.routeEvidence,{
  taskId,repository:candidate.repository,candidateId:candidate.id,candidateRevision:candidate.revision,
  decisionId:decision.decisionId,route:decision.route,risk:decision.risk,verification:decision.verification,
 });
 assert.equal(Object.isFrozen(plan.routeEvidence),true);
 assert.equal(JSON.stringify(plan.routeEvidence).match(/authority|readiness|verdict|callback|mutation/giu),null);
 const without=buildOrchestrationPlan(
  {taskId:"no-candidate",repository:"repo",prompt:"plan"},
  issueOddDecision({taskId:"no-candidate",repository:"repo"}),
 );
 assert.equal(without.routeEvidence,undefined);
});

test("route evidence rejects forgery, structural clones, and reuse",()=>{
 const store=new EvidenceStore(),proof=genuineRouteEvidence(candidate,"provenance");
 assert.throws(()=>addUnknown(store,{},metadata),/not issued by orchestration/);
 assert.throws(()=>addUnknown(store,{...proof},metadata),/not issued by orchestration/);
 store.addRouteDecision(candidate,proof,metadata);
 assert.throws(()=>store.addRouteDecision(candidate,proof,{...metadata,id:"again"}),/already been claimed/);
});

test("cross repository, candidate, and revision attempts burn route evidence",()=>{
 const mismatches=[
  {...candidate,repository:"other"},
  {...candidate,id:"other"},
  {...candidate,revision:"other"},
 ];
 for(const [index,mismatch] of mismatches.entries()){
  const proof=genuineRouteEvidence(candidate,`binding-${index}`);
  assert.throws(()=>addUnknown(new EvidenceStore(),proof,metadata,mismatch),/candidate mismatch/);
  assert.throws(()=>new EvidenceStore().addRouteDecision(candidate,proof,metadata),/already been claimed/);
 }
});

test("malformed exact metadata burns route evidence without invoking accessors",()=>{
 let accessed=false;
 const accessor=Object.create(null);
 Object.defineProperties(accessor,{
  id:{enumerable:true,get(){accessed=true;return "route";}},
  summary:{enumerable:true,value:"summary"},createdAt:{enumerable:true,value:"now"},
 });
 const extra={...metadata,kind:"route-decision"};
 const symbol={...metadata,[Symbol("extra")]:true};
 const inherited=Object.assign(Object.create({inherited:true}),metadata);
 const malformed:unknown[]=[{...metadata,id:" "},{...metadata,summary:"e\u0301"},{...metadata,createdAt:"bad\n"},extra,symbol,inherited,accessor];
 for(const [index,value] of malformed.entries()){
  const proof=genuineRouteEvidence(candidate,`metadata-${index}`),store=new EvidenceStore();
  assert.throws(()=>addUnknown(store,proof,value),/metadata/);
  assert.throws(()=>store.addRouteDecision(candidate,proof,metadata),/already been claimed/);
 }
 assert.equal(accessed,false);
});

test("admitted route evidence fixes kind, status, and candidate binding",()=>{
 const store=new EvidenceStore();
 const item=store.addRouteDecision(candidate,genuineRouteEvidence(candidate,"fixed"),metadata);
 assert.deepEqual(item,{...metadata,kind:"route-decision",status:"pass",candidateRepository:"repo",candidateId:"candidate",candidateRevision:"revision"});
 assert.equal(Object.isFrozen(item),true);
});

test("signed recovery retains previously admitted route evidence",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-route-evidence-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const path=join(directory,"evidence.json"),key=randomBytes(32),store=new EvidenceStore();
 admitRouteEvidence(store,candidate,metadata,"recovery");
 await saveEvidence(path,candidate,store,key);
 const restored=await loadEvidence(path,candidate,key);
 assert.equal(restored.hasPassing(candidate,"route-decision"),true);
 assert.deepEqual(restored.forCandidate(candidate),store.forCandidate(candidate));
});
