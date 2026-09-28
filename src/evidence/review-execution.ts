import {execFile,execFileSync} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import type {Candidate} from "../core/types.js";
import {matchesIssuedSkillContext,type IssuedSkillContext} from "../skills/context.js";
import {assertExactGitCandidate} from "./execution.js";
import {assertReviewCandidate,type ReviewReport} from "../review/review.js";

const run=promisify(execFile);
const issuedReviews=new WeakSet<object>();
export interface ExecutedReview{
 readonly candidateRepository:string;
 readonly candidateId:string;
 readonly candidateRevision:string;
 readonly taskId:string;
 readonly reviewerId:string;
 readonly authorId:string;
 readonly command:readonly string[];
 readonly startedAt:string;
 readonly finishedAt:string;
 readonly report:ReviewReport;
}
export function isExecutedReview(value:unknown):value is ExecutedReview{
 return typeof value==="object"&&value!==null&&issuedReviews.has(value);
}
export async function executeIndependentReview(candidate:Candidate,context:IssuedSkillContext,authorId:string,command:readonly [string,...string[]]):Promise<ExecutedReview>{
 if(!matchesIssuedSkillContext(context,context.taskId,candidate.repository,candidate)||context.phase!=="adversarial-review")throw new Error("Review requires issued reviewer authority for exact candidate");
 if(!authorId||context.taskId===authorId)throw new Error("Reviewer must be independent of author");
 assertExactGitCandidate(candidate,candidate.repository);
 // Reviews receive authority only from execution against a detached clean tree
 // for the exact candidate revision, never from the caller's mutable checkout.
 const parent=await mkdtemp(join(tmpdir(),"asen-review-worktree-"));
 const isolated=join(parent,"candidate");
 try{
  execFileSync("git",["-C",candidate.repository,"worktree","add","--detach",isolated,candidate.revision],{stdio:"ignore"});
  assertExactGitCandidate({...candidate,repository:isolated},isolated);
  const startedAt=new Date().toISOString();
  const {stdout}=await run(command[0],command.slice(1),{cwd:isolated,timeout:120_000,maxBuffer:128*1024,encoding:"utf8",shell:false});
  assertExactGitCandidate({...candidate,repository:isolated},isolated);
  assertExactGitCandidate(candidate,candidate.repository);
  let report:ReviewReport;
  try{report=JSON.parse(stdout) as ReviewReport;}catch{throw new Error("Review process did not return structured JSON");}
  assertReviewCandidate(candidate,report);
  if(report.reviewer!==context.taskId||report.reviewerRole!=="independent"||!Array.isArray(report.findings)||report.findings.some(f=>!f||typeof f.id!=="string"||!f.id||!(["critical","high","medium","low"] as unknown[]).includes(f.severity)||typeof f.message!=="string"))throw new Error("Review process returned invalid independent reviewer identity or findings");
  if(report.findings.some(f=>f.severity==="critical"||f.severity==="high"))throw new Error("Review contains blocking findings");
  const frozenReport=Object.freeze({...report,findings:Object.freeze(report.findings.map(f=>Object.freeze({...f})))});
  const proof=Object.freeze({candidateRepository:candidate.repository,candidateId:candidate.id,candidateRevision:candidate.revision,taskId:context.taskId,reviewerId:report.reviewer,authorId,command:Object.freeze([...command]),startedAt,finishedAt:new Date().toISOString(),report:frozenReport});
  issuedReviews.add(proof);
  return proof;
 }finally{
  try{execFileSync("git",["-C",candidate.repository,"worktree","remove","--force",isolated],{stdio:"ignore"});}catch{}
  await rm(parent,{recursive:true,force:true});
 }
}
