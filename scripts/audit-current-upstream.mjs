import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {createEcosystemCandidateReport,validateEcosystemCandidateReport} from "./ecosystem-candidate-report.mjs";

const PINNED="d5d692a6888da9e9844e7e443ee30991fa4b9d14";
const BASELINE="08de420ca29be16b6f6bee725a30b599b061df16";
const sha=value=>typeof value==="string"&&/^[a-f0-9]{40}$/.test(value);
export function runCurrentUpstreamAudit({candidate=PINN,sourceRepository,run=execFileSync}={}){
 if(!sha(candidate))throw new Error("An exact 40-character upstream candidate SHA is required");
 let temp;
 const git=(cwd,...args)=>run("git",["-C",cwd,...args],{encoding:"utf8",timeout:120_000,maxBuffer:32*1024*1024,stdio:["ignore","pipe","pipe"]}).trim();
 try{
  if(!sourceRepository&&!process.env.ASEN_ECOSYSTEM_SOURCE_URL)throw new Error("Set ASEN_ECOSYSTEM_SOURCE_URL or pass an existing source repository");
  const source=sourceRepository??(temp=mkdtempSync(join(tmpdir(),"asen-upstream-audit-")));
  if(!sourceRepository){
   run("git",["clone","--quiet","--no-checkout","--filter=blob:none",process.env.ASEN_ECOSYSTEM_SOURCE_URL,source],{timeout:180_000,maxBuffer:32*1024*1024,stdio:["ignore","pipe","pipe"]});
  }
  const isCommit=(repository,commit)=>{try{return git(repository,"cat-file","-t",commit)==="commit";}catch{return false;}};
  if(!isCommit(source,candidate))throw new Error("Upstream candidate is unavailable as a commit");
  if(!isCommit(source,BASELINE))throw new Error("Frozen upstream baseline is unavailable: abort without substituting another source");
  try{git(source,"merge-base","--is-ancestor",BASELINE,candidate);}catch{throw new Error("Candidate is not descended from the frozen baseline");}
  const report=createEcosystemCandidateReport(source,candidate);
  if(!validateEcosystemCandidateReport(report))throw new Error("Candidate report failed structural integrity validation");
  return report;
 }finally{if(temp)rmSync(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const candidate=process.argv[2]??PINNED;
 const sourceRepository=process.argv[3];
 const report=runCurrentUpstreamAudit({candidate,sourceRepository});
 process.stdout.write(JSON.stringify(report,null,2)+"\n");
}
