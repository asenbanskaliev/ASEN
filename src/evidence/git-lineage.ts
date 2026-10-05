import {execFileSync} from "node:child_process";

const fullSha=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** TDD advances exactly one ordinary commit per stage; merge and skipped commits are rejected. */
export function assertDirectGitParent(repository:string,parent:string,child:string):void{
 if(!fullSha.test(parent)||!fullSha.test(child)||parent===child)throw new Error("TDD revisions require a direct Git parent");
 try{
  const output=execFileSync("git",["--no-replace-objects","-C",repository,"rev-list","--parents","-n","1",child],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim().split(/\s+/);
  if(output.length===2&&output[0]===child&&output[1]===parent)return;
 }catch{}
 throw new Error("TDD revisions require a direct Git parent without a merge");
}

export function assertGitAncestor(repository:string,ancestor:string,revision:string):void{
 if(!fullSha.test(ancestor)||!fullSha.test(revision))throw new Error("TDD revision is not in the candidate Git history");
 try{execFileSync("git",["--no-replace-objects","-C",repository,"merge-base","--is-ancestor",ancestor,revision],{stdio:"ignore"});return;}catch{}
 throw new Error("TDD revision is not in the candidate Git history");
}
