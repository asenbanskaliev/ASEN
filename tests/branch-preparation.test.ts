import assert from "node:assert/strict";
import test from "node:test";
import {executeDeliveryInspection,prepareBranchDelivery,prepareDeliveryInspection,SUPPORTED_BRANCH_PATTERN,SUPPORTED_COMMIT_PATTERN,type BranchDeliveryCandidate,type DeliveryInspectionPort,type DeliveryPolicySnapshot} from "../src/delivery/branch-preparation.js";
import {authorizeRepositoryOperation,type RepositoryOperationBinding} from "../src/repository/operation-policy.js";

let serial=0;
const binding=(overrides:Partial<RepositoryOperationBinding>={}):RepositoryOperationBinding=>({host:"github.example",owner:"acme",repository:"app",sessionId:`delivery-${++serial}`,actor:"maintainer",action:"remote_read",...overrides});
const input=(b=binding())=>({binding:b,baseBranch:"main",approvedIssueUrl:"https://github.example/acme/app/issues/42",expectedPolicySourceIdentity:"sha256:policy-v1",policyUrl:"https://github.example/acme/app/blob/abc/POLICY.md"});
const snapshot=(plan:ReturnType<typeof prepareDeliveryInspection>,overrides:Partial<DeliveryPolicySnapshot>={}):DeliveryPolicySnapshot=>({
 ...plan.request,host:"github.example",owner:"acme",repository:"app",issueNumber:42,issueState:"open",issueTitle:"Approved delivery",issueLabels:["status:approved","kind:delivery"],branchPattern:SUPPORTED_BRANCH_PATTERN,commitPattern:SUPPORTED_COMMIT_PATTERN,permittedTypeLabels:["type:feature","type:bug"],protectedLabels:["status:approved","size:exception"],templateRequired:true,templateWaived:false,requiredTemplateMarkers:["## Summary","## Verification"],requiredChecks:["test","audit"],...overrides,
});
const candidate=(overrides:Partial<BranchDeliveryCandidate>={}):BranchDeliveryCandidate=>({repositoryUrl:"https://github.example/acme/app",issueUrl:"https://github.example/acme/app/issues/42",policySourceIdentity:"sha256:policy-v1",baseBranch:"main",branch:"feat/delivery-plan",commits:["feat(delivery): prepare branch plan"],prTitle:"Prepare delivery plan",prBody:"## Summary\nPure plan\n## Verification\n- [x] tests\nCloses https://github.example/acme/app/issues/42",labels:["type:feature"],protectedLabelMutations:[],...overrides});
async function inspect(snapshotOverride:Partial<DeliveryPolicySnapshot>={},inputOverride:Record<string,unknown>={}){const prepared=prepareDeliveryInspection({...input(),...inputOverride} as never),calls:unknown[][]=[],port:DeliveryInspectionPort={read(...args){calls.push(args);return snapshot(prepared,snapshotOverride);}},result=await executeDeliveryInspection(prepared,authorizeRepositoryOperation(prepared.binding),prepared.binding,port);return {prepared,result,calls};}

test("prepares opaque immutable exact-target read plan without mutation or inferred branch",()=>{
 const source=input({...binding(),host:"GITHUB.EXAMPLE."}),before=structuredClone(source),plan=prepareDeliveryInspection(source);assert.deepEqual(source,before);assert.notEqual(plan.binding,source.binding);assert.deepEqual(plan.request,{repositoryUrl:"https://github.example/acme/app",issueUrl:source.approvedIssueUrl,policyUrl:source.policyUrl,baseBranch:"main",policySourceIdentity:"sha256:policy-v1"});assert.equal(Object.isFrozen(plan)&&Object.isFrozen(plan.binding)&&Object.isFrozen(plan.request),true);assert.equal(JSON.stringify(plan).includes("credential"),false);
 for(const bad of [{...source,extra:true},{...source,binding:{...source.binding,credential:"secret"}},{...source,baseBranch:""},{...source,approvedIssueUrl:"https://github.example/acme/app/issues/042"},{...source,approvedIssueUrl:"https://GITHUB.EXAMPLE/acme/app/issues/42"},{...source,policyUrl:"https://github.example/acme/app/blob/../POLICY.md"}])assert.throws(()=>prepareDeliveryInspection(bad as never));
 let gets=0;const accessor={...source};Object.defineProperty(accessor,"baseBranch",{enumerable:true,get(){gets++;return "main";}});assert.throws(()=>prepareDeliveryInspection(accessor));assert.equal(gets,0);
});

test("executes exactly one authorized read with exact callback binding/input and consumes plan first",async()=>{
 const {prepared,result,calls}=await inspect();assert.deepEqual(calls,[[prepared.binding,prepared.request]]);assert.equal(Object.isFrozen(calls[0]![0])&&Object.isFrozen(calls[0]![1]),true);assert.equal(Object.isFrozen(result)&&Object.isFrozen(result.issueLabels)&&Object.isFrozen(result.requiredChecks),true);
 const fresh=authorizeRepositoryOperation(prepared.binding);await assert.rejects(()=>executeDeliveryInspection(prepared,fresh,prepared.binding,{read(){throw new Error("called");}}),/consumed/);
 const wrong=prepareDeliveryInspection(input()),wrongBinding={...wrong.binding,sessionId:"wrong"},events:string[]=[];await assert.rejects(()=>executeDeliveryInspection(wrong,authorizeRepositoryOperation(wrongBinding),wrongBinding,{read(){events.push("read");return snapshot(wrong);}}),/binding/);assert.deepEqual(events,[]);
 const forged=prepareDeliveryInspection(input()),forgedEvents:string[]=[];await assert.rejects(()=>executeDeliveryInspection(forged,{...forged.binding} as never,forged.binding,{read(){forgedEvents.push("read");return snapshot(forged);}}),/issued/);assert.deepEqual(forgedEvents,[]);
});

test("sanitizes sync/async read failures and permits a fresh plan and authority",async()=>{
 for(const read of [()=>{throw new Error("SECRET body bearer token");},async()=>{throw new Error("ASYNC SECRET");}]){const plan=prepareDeliveryInspection(input());await assert.rejects(()=>executeDeliveryInspection(plan,authorizeRepositoryOperation(plan.binding),plan.binding,{read}),error=>error instanceof Error&&error.message==="Authorized read failed"&&!JSON.stringify(error).includes("SECRET"));}
 const {result}=await inspect();assert.equal(result.issueNumber,42);
});

test("rejects inexact snapshots, substitutions, unsupported patterns, malformed collections, and missing checks",async()=>{
 const cases:Partial<DeliveryPolicySnapshot>[]=[{repositoryUrl:"https://github.example/acme/other"},{issueUrl:"https://github.example/acme/app/issues/43"},{policyUrl:"https://github.example/acme/app/blob/other/POLICY.md"},{policySourceIdentity:"other"},{baseBranch:"master"},{branchPattern:".*"},{commitPattern:".*"},{issueLabels:["A","a"]},{requiredChecks:[]},{requiredChecks:["test","TEST"]},{permittedTypeLabels:["feature"]},{templateRequired:true,templateWaived:true},{requiredTemplateMarkers:[]}];
 for(const change of cases){const plan=prepareDeliveryInspection(input()),port={read(){return snapshot(plan,change);}};await assert.rejects(()=>executeDeliveryInspection(plan,authorizeRepositoryOperation(plan.binding),plan.binding,port));}
 const plan=prepareDeliveryInspection(input()),extra={...snapshot(plan),trusted:true};await assert.rejects(()=>executeDeliveryInspection(plan,authorizeRepositoryOperation(plan.binding),plan.binding,{read(){return extra as never;}}),/shape/);
 const accessorPlan=prepareDeliveryInspection(input()),observed={...snapshot(accessorPlan)};let gets=0;Object.defineProperty(observed,"issueTitle",{enumerable:true,get(){gets++;return "secret";}});await assert.rejects(()=>executeDeliveryInspection(accessorPlan,authorizeRepositoryOperation(accessorPlan.binding),accessorPlan.binding,{read(){return observed;}}),/shape/);assert.equal(gets,0);
});

test("prepares immutable pure branch and PR plan without merge-ready or check-pass claims",async()=>{
 const {result}=await inspect(),source=candidate(),before=structuredClone(source),plan=prepareBranchDelivery(result,source);assert.deepEqual(source,before);assert.deepEqual(plan.approvedIssue,{number:42,title:"Approved delivery",labels:["status:approved","kind:delivery"]});assert.deepEqual(plan.requiredChecks,["test","audit"]);assert.deepEqual(plan.finalLabels,["type:feature"]);assert.deepEqual(plan.template,{required:true,waived:false,markers:["## Summary","## Verification"]});assert.equal(Object.isFrozen(plan)&&Object.isFrozen(plan.commits)&&Object.isFrozen(plan.finalLabels),true);assert.equal("mergeReady" in plan||"checksPassed" in plan,false);assert.throws(()=>prepareBranchDelivery(result,source),/already used/);
});

test("requires open uniquely approved matching evidence, supported branch/commits, and one allowed type label",async()=>{
 for(const observed of [{issueState:"closed" as const},{issueLabels:["kind:delivery"]}]){const {result}=await inspect(observed);assert.throws(()=>prepareBranchDelivery(result,candidate()),/approved|open/);}const ambiguous=prepareDeliveryInspection(input());await assert.rejects(()=>executeDeliveryInspection(ambiguous,authorizeRepositoryOperation(ambiguous.binding),ambiguous.binding,{read(){return snapshot(ambiguous,{issueLabels:["status:approved","STATUS:APPROVED"]});}}),/ambiguous/);
 for(const change of [{repositoryUrl:"https://github.example/acme/other"},{issueUrl:"https://github.example/acme/app/issues/43"},{policySourceIdentity:"other"},{baseBranch:"master"},{branch:"feature/wrong"},{commits:[]},{commits:["bad commit"]},{commits:["feat: one","bad"]},{labels:[]},{labels:["type:feature","type:bug"]},{labels:["type:unknown"]}]){const {result}=await inspect();assert.throws(()=>prepareBranchDelivery(result,candidate(change as never)));}
 const genuine=(await inspect()).result;assert.throws(()=>prepareBranchDelivery({...genuine} as never,candidate()),/genuine/);
});

test("enforces protected labels, required or waived templates, checked markers, canonical closing link, and exact shape",async()=>{
 for(const change of [{labels:["type:feature","size:exception"]},{protectedLabelMutations:["status:approved"]},{prBody:"## Summary\n## Verification\nCloses #42"},{prBody:"## Summary\n## Verification\n- [ ] tests\nCloses https://github.example/acme/app/issues/42"},{prBody:"## Summary\nCloses https://github.example/acme/app/issues/42"}]){const {result}=await inspect();assert.throws(()=>prepareBranchDelivery(result,candidate(change as never)));}
 const {result}=await inspect({templateRequired:false,templateWaived:true,requiredTemplateMarkers:[]}),waived=prepareBranchDelivery(result,candidate({prBody:"Closes https://github.example/acme/app/issues/42"}));assert.deepEqual(waived.template,{required:false,waived:true,markers:[]});
 const extra={...candidate(),checksPassed:true},{result:exact}=await inspect();assert.throws(()=>prepareBranchDelivery(exact,extra as never),/shape/);let gets=0;const accessor={...candidate()};Object.defineProperty(accessor,"branch",{enumerable:true,get(){gets++;return "feat/x";}});const {result:forAccessor}=await inspect();assert.throws(()=>prepareBranchDelivery(forAccessor,accessor));assert.equal(gets,0);
});
