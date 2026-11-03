import {execFileSync} from "node:child_process";
import {appendFileSync,readFileSync} from "node:fs";
import {EOL} from "node:os";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const sha=/^[a-f0-9]{40}$/u;
const segment=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u;

/** Only the two checked-in, mutually consistent manifests can select the
 * upstream repository. Do not search public commits or follow arbitrary IDs. */
export function frozenSourceBinding(ecosystem,skills){
 const commit=ecosystem?.commit,tree=ecosystem?.tree;
 const repository=skills?.baseline?.repository,skillCommit=skills?.baseline?.commit;
 if(typeof commit!=="string"||!sha.test(commit)||
    typeof tree!=="string"||!sha.test(tree)||
    typeof repository!=="string"||repository.length>201||
    repository.split("/").length!==2||
    !repository.split("/").every(part=>segment.test(part)&&part!=="."&&part!=="..")||
    skillCommit!==commit)
  throw new Error("Frozen ecosystem source provenance is incomplete or mismatched");
 return Object.freeze({repository,commit,tree});
}
/** Fetch immutable public Git objects by exact commit, then verify both the
 * fetched commit and tree. No unauthenticated GitHub search API is involved. */
export function prepareFrozenEcosystem({
 ecosystem=JSON.parse(readFileSync(new URL("../../registry/parity/ecosystem-sources-v1.json",import.meta.url),"utf8")),
 skills=JSON.parse(readFileSync(new URL("../../registry/parity/skill-sources-v1.json",import.meta.url),"utf8")),
 environment=process.env,
 git=execFileSync,
 appendEnv=appendFileSync,
}={}){
 const {repository:remote,commit,tree}=frozenSourceBinding(ecosystem,skills);
 if(typeof environment.RUNNER_TEMP!=="string"||!environment.RUNNER_TEMP||
    typeof environment.GITHUB_ENV!=="string"||!environment.GITHUB_ENV)
  throw new Error("The frozen ecosystem witness requires GitHub Actions runner paths");
 const repository=join(environment.RUNNER_TEMP,"asen-ecosystem-baseline.git");
 const execute=(args,options={})=>git("git",args,{windowsHide:true,timeout:180_000,...options});
 execute(["init","--bare",repository],{stdio:"inherit"});
 execute(["--git-dir",repository,"fetch","--no-tags","--depth=1",
   `https://github.com/${remote}.git`,commit],{stdio:"inherit"});
 const revision=(...args)=>String(execute(["--git-dir",repository,...args],{encoding:"utf8",maxBuffer:32_768})).trim();
 if(revision("rev-parse","FETCH_HEAD")!==commit||revision("cat-file","-t",commit)!=="commit")
  throw new Error("Fetched frozen ecosystem commit identity mismatch");
 if(revision("rev-parse",`${commit}^{tree}`)!==tree)
  throw new Error("Fetched frozen ecosystem tree identity mismatch");
 appendEnv(environment.GITHUB_ENV,`ECOSYSTEM_BASELINE_REPOSITORY=${repository}${EOL}`);
 return Object.freeze({repository,commit,tree});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  const verified=prepareFrozenEcosystem();
  console.log(`Frozen ecosystem Git objects verified against tracked provenance: ${verified.commit}`);
 }catch(error){console.error(error);process.exitCode=1;}
}
