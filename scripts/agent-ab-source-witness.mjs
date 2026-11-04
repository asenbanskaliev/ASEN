/**
 * EF-002 / EF-701: real Git-object acquisition for both pinned upstreams.
 * A successful witness proves source identity ONLY. Running model/host C01-C20,
 * native review and consent still requires separately authenticated receipts.
 */
import {execFileSync} from "node:child_process";
import {mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {isAbsolute,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const REPO_PATTERN=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const SHA=/^[0-9a-f]{40}$/u;
const FILE=/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/u;
const exact=(obj,fields)=>obj&&typeof obj==="object"&&!Array.isArray(obj)&&
 Object.keys(obj).sort().join("|")===fields.slice().sort().join("|");
const defaultManifest=()=>JSON.parse(readFileSync(new URL("../registry/parity/agent-ab-baselines-v1.json",import.meta.url),"utf8"));

export function pinnedAgentABSources(manifest=defaultManifest()){
 if(!exact(manifest,["schema","description","sources"])||
    manifest.schema!=="asen-agent-ab-baselines/v1"||
    !Array.isArray(manifest.sources)||manifest.sources.length!==2||
    typeof manifest.description!=="string")throw Error("Invalid frozen A/B manifest");
 const sources=manifest.sources.map((s,index)=>{
  if(!exact(s,["id","repository","commit","tree","files"])||
     s.id!==(index===0?"A":"B")||typeof s.repository!=="string"||
     !REPO_PATTERN.test(s.repository)||s.repository.includes("..")||
     !SHA.test(s.commit)||!SHA.test(s.tree)||!Array.isArray(s.files)||
     s.files.length<2||s.files.length>15||new Set(s.files).size!==s.files.length||
     !s.files.every(p=>typeof p==="string"&&FILE.test(p)&&!p.split("/").includes("..")))
   throw Error("Frozen A/B repository, SHA or expected paths are malformed");
  return Object.freeze({...s,files:Object.freeze([...s.files])});
 });
 if(sources[0].repository===sources[1].repository||sources[0].commit===sources[1].commit)
  throw Error("Frozen A/B require distinct source identities");
 return Object.freeze(sources);
}

/** Run in an externally-owned, new disposable directory; do not run upstream code. */
export function verifyAgentABGitObjects({manifest=defaultManifest(),root,git=execFileSync}){
 if(typeof root!=="string"||!isAbsolute(root))throw Error("Frozen A/B requires absolute disposable root");
 const sources=pinnedAgentABSources(manifest);
 const rows=[];
 const invoke=(args)=>String(git("git",args,{
  encoding:"utf8",maxBuffer:512_000,timeout:180_000,windowsHide:true,
  env:{...process.env,GIT_TERMINAL_PROMPT:"0",GIT_ASKPASS:""},
 })).trim();
 for(const source of sources){
  const gitDir=join(root,source.id+".git");
  invoke(["init","--bare",gitDir]);
  invoke(["--git-dir",gitDir,"fetch","--depth=1","--no-tags",
   "https://github.com/"+source.repository+".git",source.commit]);
  const prefix=["--git-dir",gitDir];
  const revision=(...args)=>invoke([...prefix,...args]);
  if(revision("rev-parse","FETCH_HEAD")!==source.commit||
     revision("cat-file","-t",source.commit)!=="commit")
   throw Error("Frozen A/B commit identity mismatch for "+source.id);
  if(revision("rev-parse",source.commit+"^{tree}")!==source.tree)
   throw Error("Frozen A/B tree identity mismatch for "+source.id);
  const objects=source.files.map(path=>{
   const output=revision("ls-tree",source.commit,"--",path);
   const found=/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(output);
   if(!found||found[3]!==path)
    throw Error("Frozen A/B required source file unavailable for "+source.id);
   if(revision("cat-file","-t",found[2])!=="blob")
    throw Error("Frozen A/B source is not an immutable Git blob for "+source.id);
   return {path,objectId:found[2],mode:found[1]};
  });
  rows.push(Object.freeze({source:source.id,repository:source.repository,
   commit:source.commit,tree:source.tree,files:objects,sourceOnly:true}));
 }
 return Object.freeze({schema:"asen-ab-source-witness/v1",status:"SOURCE_OBJECTS_VERIFIED",
  sources:rows,checkedSources:2,executedCases:0,modelCalls:0,
  runtimeAttested:false,referenceParity:false,globalFull:false,
  limitation:"Immutable Git objects do not prove runtime decisions, models, Pi parent consumption or Writer consent."});
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let root;
 try{
  if(process.argv.length!==2)throw Error("No CLI arguments are accepted");
  const location=process.env.RUNNER_TEMP,output=process.env.ASEN_AB_WITNESS_OUTPUT;
  if(!location||!isAbsolute(location)||!output||!isAbsolute(output))
   throw Error("Frozen A/B witness requires explicit runner temp and absolute output file");
  root=mkdtempSync(join(realpathSync(location),"asen-ab-source-"));
  const report=verifyAgentABGitObjects({root});
  writeFileSync(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
  console.log("FROZEN_AB_SOURCE_ONLY_PASS "+JSON.stringify({
   checkedSources:report.checkedSources,executedCases:report.executedCases,globalFull:false,
  }));
 }catch(error){console.error(error);process.exitCode=1;}
 finally{if(root)rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
}
