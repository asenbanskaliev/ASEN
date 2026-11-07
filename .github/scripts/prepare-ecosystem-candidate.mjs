import {execFileSync} from "node:child_process";
import {appendFileSync,readFileSync} from "node:fs";
import {EOL} from "node:os";
import {join} from "node:path";

const manifest=JSON.parse(readFileSync(new URL("../../registry/parity/ecosystem-sources-v1.json",import.meta.url),"utf8"));
const {commit,tree}=manifest;
const request=async url=>{
 const response=await fetch(url,{headers:{Accept:"application/vnd.github+json","User-Agent":"ASEN-ecosystem-drift-report"}});
 if(!response.ok)throw new Error(`Public source lookup failed: HTTP ${response.status}`);
 return response.json();
};
const lookup=await request(`https://api.github.com/search/commits?q=${commit}`);
const sourceRepository=lookup.items?.find(item=>item.sha===commit)?.repository?.full_name;
if(!sourceRepository||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(sourceRepository))throw new Error("Frozen source repository could not be resolved");
const repositoryMetadata=await request(`https://api.github.com/repos/${sourceRepository}`);
const branch=repositoryMetadata.default_branch;
if(typeof branch!=="string"||!branch)throw new Error("Source repository has no resolvable default branch");
const input=process.env.ECOSYSTEM_CANDIDATE_SHA?.trim();
let candidateCommit;
if(input){
 if(!/^[a-f0-9]{40}$/.test(input))throw new Error("Manual source candidate must be an exact full commit SHA");
 candidateCommit=input;
}else{
 const current=await request(`https://api.github.com/repos/${sourceRepository}/branches/${encodeURIComponent(branch)}`);
 candidateCommit=current.commit?.sha;
 if(!/^[a-f0-9]{40}$/.test(candidateCommit??""))throw new Error("Scheduled source branch did not resolve to a full commit SHA");
}
const repository=join(process.env.RUNNER_TEMP,"asen-ecosystem-candidate.git");
execFileSync("git",["init","--bare",repository],{stdio:"inherit"});
execFileSync("git",["--git-dir",repository,"fetch","--no-tags","--filter=blob:none",`https://github.com/${sourceRepository}.git`,branch],{stdio:"inherit"});
execFileSync("git",["--git-dir",repository,"fetch","--no-tags",`https://github.com/${sourceRepository}.git`,commit,candidateCommit],{stdio:"inherit"});
const git=(...args)=>execFileSync("git",["--git-dir",repository,...args],{encoding:"utf8"}).trim();
if(git("cat-file","-t",commit)!=="commit"||git("rev-parse",`${commit}^{tree}`)!==tree||git("cat-file","-t",candidateCommit)!=="commit")
 throw new Error("Frozen or candidate Git object identity mismatch");
try{git("merge-base","--is-ancestor",commit,candidateCommit);}catch{throw new Error("Candidate is not a descendant of the frozen source commit");}
appendFileSync(process.env.GITHUB_ENV,`ECOSYSTEM_SOURCE_REPOSITORY=${repository}${EOL}`);
appendFileSync(process.env.GITHUB_OUTPUT,`candidate_sha=${candidateCommit}${EOL}source_repository=${sourceRepository}${EOL}`);
console.log(`Exact source candidate prepared: ${sourceRepository}@${candidateCommit}; no source was checked out or adopted.`);
