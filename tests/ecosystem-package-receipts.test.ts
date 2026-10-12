import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error CI-only package execution evidence.
import {admitPackageJourneyResult} from "../scripts/ecosystem-package-receipts.mjs";
function fixture(patch:Record<string,unknown>={}){
 const journey={installedPiPackageVerified:true,childAuthorityAutoLoaded:false,visibleRpcCommands:9,modelInvocations:0,
  sessionRestartVerified:true,crossSessionProjectionVerified:true,naturalProcessExits:3,
  publicHost:{mode:"rpc",canonicalCommands:9,canonicalTools:11,hasUI:true,toolsEnabled:true},...patch};
 const pack={packedInstallVerified:true,publicExports:28,files:243,integrity:"sha512-"+"A".repeat(86)+"=="};
 return {status:0,signal:null,stdout:JSON.stringify(journey)+"\n"+JSON.stringify(pack)+"\nPACK_ENV_BOUNDARY_PASS\n"};
}

test("package receipt admission requires actual completed package and three-process journey summaries",()=>{
 const result=admitPackageJourneyResult(fixture());
 assert.equal(result.journey.naturalProcessExits,3);assert.equal(result.pack.publicExports,28);
});

test("old forced-exit package observations cannot prove restart or cross-session receipts",()=>{
 for(const patch of [{sessionRestartVerified:false},{crossSessionProjectionVerified:false},{naturalProcessExits:2},
  {modelInvocations:1},{childAuthorityAutoLoaded:true},{visibleRpcCommands:0}])
  assert.throws(()=>admitPackageJourneyResult(fixture(patch)));
 const row=fixture();row.stdout=row.stdout.replace("PACK_ENV_BOUNDARY_PASS","");
 assert.throws(()=>admitPackageJourneyResult(row));
});

test("partial or duplicated summaries never produce executed package receipts",()=>{
 for(const result of [{...fixture(),status:124},{...fixture(),signal:"SIGTERM"},{...fixture(),error:Error("timeout")},
  {...fixture(),stdout:fixture().stdout+fixture().stdout},{...fixture(),stdout:JSON.stringify({installedPiPackageVerified:true})}])
  assert.throws(()=>admitPackageJourneyResult(result));
});
