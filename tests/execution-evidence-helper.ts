import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import type {Candidate} from "../src/core/types.js";
import {addExecutedEvidence,executeEvidenceCommand,type ExecutedEvidence} from "../src/evidence/execution.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {issueSkillContext} from "../src/skills/context.js";
import {executeIndependentReview} from "../src/evidence/review-execution.js";

export function gitCandidate(id:string,repository=resolve(".")):Candidate{
 const revision=execFileSync("git",["-C",repository,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 return {id,repository,revision,createdAt:"now"};
}

export async function executionProof(candidate:Candidate,exitCode=0):Promise<ExecutedEvidence>{
 return executeEvidenceCommand(candidate,[process.execPath,"-e",`process.exit(${exitCode})`],{cwd:candidate.repository,timeoutMs:10000});
}
export async function passingEvidence(store:EvidenceStore,candidate:Candidate,id:string,kind:"test"|"tdd"="test"):Promise<void>{
 const proof=await executionProof(candidate,0);
 addExecutedEvidence(store,candidate,proof,{id,kind,summary:"executed test proof"});
}
export async function passingReview(store:EvidenceStore,candidate:Candidate,id:string):Promise<void>{
 const reviewerId=`${id}:reviewer`,context=issueSkillContext(reviewerId,candidate.repository,candidate,{phase:"adversarial-review"});
 const report={candidateRepository:candidate.repository,candidateId:candidate.id,candidateRevision:candidate.revision,reviewer:reviewerId,reviewerRole:"independent",findings:[]};
 const proof=await executeIndependentReview(candidate,context,`${id}:author`,[process.execPath,"-e",`process.stdout.write(${JSON.stringify(JSON.stringify(report))})`]);
 store.addReviewed(candidate,proof);
}
