import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {prepareRddRepositoryInspection,executeRddRepositoryInspection} from "../src/defects/rdd-repository-inspection.js";
import {parseRddPolicyBytes} from "../src/defects/rdd-policy-source.js";
import {authorizeRepositoryOperation,executeAuthorizedRead,type RepositoryOperationBinding} from "../src/repository/operation-policy.js";

let sequence=0;
const encoder=new TextEncoder();
const repositoryUrl="https://github.example/acme/app",issueUrl=`${repositoryUrl}/issues/17`;
const policyText='{"schemaVersion":1,"reviewMode":"enabled","issueApproval":{"requiredLabels":["kind:defect","status:approved"]}}';
const policyBytes=[...encoder.encode(policyText)];
const policyIdentity=createHash("sha256").update("asen.rdd-policy.v1\0","utf8").update(Uint8Array.from(policyBytes)).digest("hex");
const policySource=parseRddPolicyBytes(Uint8Array.from(policyBytes),policyIdentity);
const sha="0123456789abcdef0123456789abcdef01234567";
const binding=():RepositoryOperationBinding=>({host:"github.example",owner:"acme",repository:"app",sessionId:`inspect-${++sequence}`,actor:"maintainer",action:"remote_read"});
const input=(readBinding=binding())=>({binding:readBinding,repositoryUrl,branch:"main" as const,observedMainCommitIdentity:sha,expectedMainCommitIdentity:sha,issueUrl,policyLocator:".asen/rdd-policy.json" as const});
const row=(number=4)=>({number,url:`${repositoryUrl}/pull/${number}`,state:"open" as const,baseBranch:"main" as const,headBranch:`fix/rdd-${number}`,headCommitIdentity:"abcdef0123456789abcdef0123456789abcdef01",issueUrl});
const snapshot=()=>({repositoryUrl,branch:"main" as const,observedMainCommitIdentity:sha,issueUrl,issueNumber:17,issueState:"open",issueLabels:["Kind:Defect","STATUS:APPROVED","extra:triaged"],policyLocator:".asen/rdd-policy.json" as const,policyBytes:[...policyBytes],policyContentIdentity:policyIdentity,pullRequestAudit:{complete:true,truncated:false,saturated:false,totalCount:1,rows:[row()]}});
const setup=()=>{const value=input(),claim=prepareRddRepositoryInspection(value,policySource),authority=authorizeRepositoryOperation(value.binding);return {value,claim,authority};};

async function rejectsOnce(change:(value:ReturnType<typeof snapshot>)=>void,pattern:RegExp){
 const {value,claim,authority}=setup(),valueSnapshot=snapshot();change(valueSnapshot);let calls=0;
 await assert.rejects(()=>executeRddRepositoryInspection(claim,authority,value.binding,{read(){calls++;return valueSnapshot;}}),pattern);assert.equal(calls,1);
 await assert.rejects(()=>executeRddRepositoryInspection(claim,authority,value.binding,{read(){calls++;return snapshot();}}),/consumed/);assert.equal(calls,1);
}

test("RED contract: rejects incomplete audits and extra/accessor snapshots after exactly one read, then burns claim and authority",async()=>{
 await rejectsOnce(value=>{value.pullRequestAudit.complete=false;},/audit/i);
 const {value,claim,authority}=setup(),extra=Object.assign(snapshot(),{readiness:true});let calls=0;
 await assert.rejects(()=>executeRddRepositoryInspection(claim,authority,value.binding,{read(){calls++;return extra as never;}}),/snapshot/i);assert.equal(calls,1);
 await assert.rejects(()=>executeRddRepositoryInspection(claim,authority,value.binding,{read(){calls++;return snapshot();}}),/consumed/);assert.equal(calls,1);
 await assert.rejects(()=>executeAuthorizedRead(authority,value.binding,()=>{calls++;}),/consumed/);assert.equal(calls,1);
 const replacement=authorizeRepositoryOperation(value.binding);await assert.rejects(()=>executeRddRepositoryInspection(claim,replacement,value.binding,{read(){calls++;return snapshot();}}),/consumed/);assert.equal(calls,1);
});

test("returns one exact frozen inspection without mutating inputs or inventing classifications",async()=>{
 const {value,claim,authority}=setup(),observed=snapshot(),before=structuredClone(observed);let calls=0;
 const result=await executeRddRepositoryInspection(claim,authority,value.binding,{read(actual,request){calls++;assert.equal(Object.isFrozen(actual),true);assert.deepEqual(request,{repositoryUrl,branch:"main",observedMainCommitIdentity:sha,expectedMainCommitIdentity:sha,issueUrl,policyLocator:".asen/rdd-policy.json",expectedPolicyContentIdentity:policyIdentity});return observed;}});
 assert.equal(calls,1);assert.deepEqual(observed,before);assert.deepEqual(result,observed);assert.equal(Object.isFrozen(result),true);assert.equal(Object.isFrozen(result.issueLabels),true);assert.equal(Object.isFrozen(result.policyBytes),true);assert.equal(Object.isFrozen(result.pullRequestAudit),true);assert.equal(Object.isFrozen(result.pullRequestAudit.rows),true);assert.equal(Object.isFrozen(result.pullRequestAudit.rows[0]),true);
 for(const name of ["authority","ready","readiness","verdict","review","delivery","merge","mutation","reproduction","conflict","supersession"])assert.equal(name in result,false);
});

test("requires open unambiguous approval and every configured label, additively",async()=>{
 await rejectsOnce(value=>{value.issueState="closed";},/open|issue/i);
 await rejectsOnce(value=>{value.issueLabels=["status:approved","STATUS:APPROVED","kind:defect"];},/approval|duplicate/i);
 await rejectsOnce(value=>{value.issueLabels=["status:approved","other"];},/required label/i);
});

test("rejects main drift, policy identity mismatch, and repository or issue mismatches",async()=>{
 await rejectsOnce(value=>{value.observedMainCommitIdentity="fedcba9876543210fedcba9876543210fedcba98";},/main|drift/i);
 await rejectsOnce(value=>{value.policyContentIdentity="0".repeat(64);},/policy/i);
 await rejectsOnce(value=>{value.policyBytes[0]=(value.policyBytes[0]!+1)%256;},/policy|identity/i);
 await rejectsOnce(value=>{value.repositoryUrl="https://github.example/acme/other";},/target|repository/i);
 await rejectsOnce(value=>{value.issueUrl=`${repositoryUrl}/issues/18`;},/target|issue/i);
});

test("burns a genuine claim before malformed caller execution data",async()=>{
 const {value,claim,authority}=setup(),accessor={...value.binding};let gets=0;Object.defineProperty(accessor,"actor",{enumerable:true,get(){gets++;return "maintainer";}});
 await assert.rejects(()=>executeRddRepositoryInspection(claim,authority,accessor as never,{read(){throw new Error("must not run");}}),/binding/i);assert.equal(gets,0);
 await assert.rejects(()=>executeRddRepositoryInspection(claim,authority,value.binding,{read(){return snapshot();}}),/consumed/);
});

test("rejects incomplete coverage and malformed, duplicate, or ambiguous PR rows",async()=>{
 await rejectsOnce(value=>{value.pullRequestAudit.truncated=true;},/audit/i);
 await rejectsOnce(value=>{value.pullRequestAudit.saturated=true;},/audit/i);
 await rejectsOnce(value=>{value.pullRequestAudit.totalCount=2;},/audit/i);
 await rejectsOnce(value=>{value.pullRequestAudit.rows.push(row());value.pullRequestAudit.totalCount=2;},/duplicate|ambiguous/i);
 await rejectsOnce(value=>{value.pullRequestAudit.rows[0]!.headCommitIdentity="not-a-git-id";},/identity|row/i);
});

test("rejects string and coercive issue numbers after one read without invoking caller coercion",async()=>{
 for(const issueNumber of ["17",{valueOf(){throw new Error("owned issue coercion");}}]){let reads=0,coercions=0;const candidate=issueNumber as {valueOf?:()=>number};if(typeof candidate==="object")candidate.valueOf=()=>{coercions++;return 17;};const {value,claim,authority}=setup(),observed=snapshot();(observed as {issueNumber:unknown}).issueNumber=issueNumber;await assert.rejects(()=>executeRddRepositoryInspection(claim,authority,value.binding,{read(){reads++;return observed;}}),/issue/i);assert.equal(reads,1);assert.equal(coercions,0);}
});

test("rejects string and coercive PR totals after one read without invoking caller coercion",async()=>{
 for(const totalCount of ["1",{valueOf(){throw new Error("owned total coercion");}}]){let reads=0,coercions=0;const candidate=totalCount as {valueOf?:()=>number};if(typeof candidate==="object")candidate.valueOf=()=>{coercions++;return 1;};const {value,claim,authority}=setup(),observed=snapshot();(observed.pullRequestAudit as {totalCount:unknown}).totalCount=totalCount;await assert.rejects(()=>executeRddRepositoryInspection(claim,authority,value.binding,{read(){reads++;return observed;}}),/audit/i);assert.equal(reads,1);assert.equal(coercions,0);}
});

test("rejects string, coercive, zero, unsafe, and non-integer PR row numbers",async()=>{
 for(const number of ["4",{valueOf(){throw new Error("owned row coercion");}},0,Number.MAX_SAFE_INTEGER+1,1.5]){let reads=0,coercions=0;const candidate=number as {valueOf?:()=>number};if(typeof candidate==="object")candidate.valueOf=()=>{coercions++;return 4;};const {value,claim,authority}=setup(),observed=snapshot();(observed.pullRequestAudit.rows[0] as {number:unknown}).number=number;await assert.rejects(()=>executeRddRepositoryInspection(claim,authority,value.binding,{read(){reads++;return observed;}}),/row|number/i);assert.equal(reads,1);assert.equal(coercions,0);}
});

test("rejects zero, unsafe, and non-integer issue locators and numeric snapshot values",async()=>{
 for(const number of [0,Number.MAX_SAFE_INTEGER+1,1.5]){const invalid=input();(invalid as {issueUrl:string}).issueUrl=`${repositoryUrl}/issues/${number}`;assert.throws(()=>prepareRddRepositoryInspection(invalid,policySource),/issue/i);}
 for(const issueNumber of [0,Number.MAX_SAFE_INTEGER+1,1.5])await rejectsOnce(value=>{(value as {issueNumber:number}).issueNumber=issueNumber;},/issue/i);
 for(const totalCount of [-1,Number.MAX_SAFE_INTEGER+1,1.5])await rejectsOnce(value=>{value.pullRequestAudit.totalCount=totalCount;},/audit/i);
});

test("rejects inherited, symbol, extra, and accessor snapshot data without invoking accessors",async()=>{
 const variants:unknown[]=[Object.assign(Object.create(snapshot()),{}),Object.assign(snapshot(),{extra:true}),Object.assign(snapshot(),{[Symbol("extra")]:true})];let gets=0;const accessor=snapshot();Object.defineProperty(accessor,"issueState",{enumerable:true,get(){gets++;return "open";}});variants.push(accessor);
 for(const invalid of variants){const {value,claim,authority}=setup();await assert.rejects(()=>executeRddRepositoryInspection(claim,authority,value.binding,{read(){return invalid as never;}}),/snapshot/i);}assert.equal(gets,0);
});

test("sanitizes callback failures and performs no retry",async()=>{
 const {value,claim,authority}=setup();let calls=0;await assert.rejects(()=>executeRddRepositoryInspection(claim,authority,value.binding,{read(){calls++;throw new Error("bearer SECRET");}}),(error:unknown)=>error instanceof Error&&error.message==="Authorized read failed"&&!JSON.stringify(error).includes("SECRET"));assert.equal(calls,1);
 await assert.rejects(()=>executeRddRepositoryInspection(claim,authority,value.binding,{read(){calls++;return snapshot();}}),/consumed/);assert.equal(calls,1);
});

test("preparation requires exact main-bound data and matching observed/expected valid Git identities",()=>{
 const good=input();for(const invalid of [{...good,branch:"dev"},{...good,policyLocator:"other.json"},{...good,observedMainCommitIdentity:"bad"},{...good,expectedMainCommitIdentity:"f".repeat(40)},{...good,extra:true}])assert.throws(()=>prepareRddRepositoryInspection(invalid as never,policySource),/main|policy|identity|claim/i);
});

test("rejects URL-normalizing percent-encoded dot segments in owner and repository bindings",()=>{
 for(const [field,segment] of [["owner","%2e"],["owner","%2E%2E"],["repository",".%2e"],["repository","%2e."]] as const){const target=binding(),invalid=input(target);(target as unknown as Record<string,string>)[field]=segment;const root=`https://${target.host}/${target.owner}/${target.repository}`;(invalid as {repositoryUrl:string;issueUrl:string}).repositoryUrl=root;(invalid as {repositoryUrl:string;issueUrl:string}).issueUrl=`${root}/issues/17`;assert.throws(()=>prepareRddRepositoryInspection(invalid,policySource),/canonical|binding|repository|issue/i);}
});
