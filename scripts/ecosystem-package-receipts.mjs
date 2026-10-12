import assert from "node:assert/strict";
import {spawnSync,execFileSync} from "node:child_process";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");

/** Admits completed observations only. Log consistency is not independent execution authenticity. */
export function admitPackageJourneyResult(result){
 assert.equal(result.status,0);assert.equal(result.signal,null);assert.equal(result.error,undefined);
 const stdout=String(result.stdout);
 const rows=stdout.split(/\r?\n/).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
 const journeys=rows.filter(row=>row?.installedPiPackageVerified!==undefined);
 const packs=rows.filter(row=>row?.packedInstallVerified!==undefined);
 assert.equal(journeys.length,1);assert.equal(packs.length,1);
 const journey=journeys[0],pack=packs[0];
 assert.equal(journey.installedPiPackageVerified,true);assert.equal(journey.childAuthorityAutoLoaded,false);
 assert.equal(journey.visibleRpcCommands,9);assert.equal(journey.modelInvocations,0);
 assert.equal(journey.sessionRestartVerified,true);assert.equal(journey.crossSessionProjectionVerified,true);
 assert.equal(journey.naturalProcessExits,3);
 assert.equal(journey.publicHost?.mode,"rpc");assert.equal(typeof journey.publicHost?.hasUI,"boolean");
 assert.equal(journey.publicHost?.canonicalCommands,9);assert.equal(journey.publicHost?.canonicalTools,13);
 assert.equal(journey.publicHost?.toolsEnabled,true);
 assert.equal(pack.packedInstallVerified,true);assert.equal(pack.publicExports,28);
 assert.ok(Number.isInteger(pack.files)&&pack.files>0);assert.match(pack.integrity??"",/^sha512-[A-Za-z0-9+/]{86}==$/);
 assert.ok(stdout.split(/\r?\n/).includes("PACK_ENV_BOUNDARY_PASS"));
 return {journey,pack};
}

export function main({output=process.argv[2],candidate=process.env.ASEN_EXPECTED_SHA}={}){
 assert.match(candidate??"",/^[a-f0-9]{40}$/);assert.ok(output,"An output directory is required");
 assert.equal(execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),candidate);
 execFileSync("git",["diff","--exit-code","HEAD"],{stdio:"pipe"});
 assert.ok(process.env.npm_execpath,"Run through npm run verify:package-receipts");
 const directory=resolve(output);mkdirSync(directory,{recursive:true});
 const sourceBytes=readFileSync(new URL("../registry/parity/ecosystem-sources-v1.json",import.meta.url));
 const result=spawnSync(process.execPath,[process.env.npm_execpath,"run","verify:pack"],{
  encoding:"utf8",timeout:180_000,maxBuffer:16*1024*1024});
 const log=result.stdout+"\n"+result.stderr;
 writeFileSync(join(directory,"package-journey.log"),log);
 const observation=admitPackageJourneyResult(result);
 const records=[];
 for(const kind of ["restart","cross-session"]){
  const record={id:`ECO-02A-${process.platform}-${kind}`,candidate,sourceCommit:JSON.parse(sourceBytes).commit,
   sourceManifestSha256:hash(sourceBytes),kind,class:"REAL_PI_HOST",result:"PASS",
   command:"npm run verify:pack",observation:kind==="restart"
    ?"Packed Pi RPC reopens the same session and preserves seeded interrupted state requiring review"
    :"A different real Pi RPC session reads its own Todo/workspace projection and excludes prior-session data",
   logSha256:hash(log),packageIntegrity:observation.pack.integrity,
   scope:"Default installed Pi RPC; seeded recovery, no live model interruption or whole-range claim"};
  writeFileSync(join(directory,`${kind}.log`),log);
  writeFileSync(join(directory,`${kind}.json`),JSON.stringify(record,null,2)+"\n");records.push(record);
 }
 return records;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main();}catch(error){console.error(error);process.exitCode=1;}
}
