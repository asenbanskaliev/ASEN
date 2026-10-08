import {execFileSync} from "node:child_process";
import {appendFileSync, readFileSync} from "node:fs";
import {EOL} from "node:os";
import {join} from "node:path";

const manifest=JSON.parse(readFileSync(new URL("../../registry/parity/ecosystem-sources-v1.json",import.meta.url),"utf8"));
const {commit,tree}=manifest;
if(!/^[a-f0-9]{40}$/.test(commit)||!/^[a-f0-9]{40}$/.test(tree))throw new Error("Invalid frozen ecosystem identity");
const lookup=await fetch(`https://api.github.com/search/commits?q=${commit}`,{
  headers:{Accept:"application/vnd.github+json","User-Agent":"ASEN-ecosystem-baseline-verification"},
});
if(!lookup.ok)throw new Error(`Public GitHub commit lookup failed: HTTP ${lookup.status}`);
const results=await lookup.json();
const sourceRepository=results.items?.find(item=>item.sha===commit)?.repository?.full_name;
if(!sourceRepository||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(sourceRepository))
  throw new Error("Frozen ecosystem commit was not found in public Git objects");
const repository=join(process.env.RUNNER_TEMP,"asen-ecosystem-baseline.git");
execFileSync("git",["init","--bare",repository],{stdio:"inherit"});
execFileSync("git",["--git-dir",repository,"fetch","--no-tags","--depth=1",
  `https://github.com/${sourceRepository}.git`,commit],{stdio:"inherit"});
const git=(...args)=>execFileSync("git",["--git-dir",repository,...args],{encoding:"utf8"}).trim();
if(git("rev-parse","FETCH_HEAD")!==commit||git("cat-file","-t",commit)!=="commit")
  throw new Error("Fetched frozen ecosystem commit identity mismatch");
if(git("rev-parse",`${commit}^{tree}`)!==tree)
  throw new Error("Fetched frozen ecosystem tree identity mismatch");
appendFileSync(process.env.GITHUB_ENV,`ECOSYSTEM_BASELINE_REPOSITORY=${repository}${EOL}`);
console.log("Frozen ecosystem Git objects are available in a bare repository; no source checkout was created.");
