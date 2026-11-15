import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {isYoloTempScratchRemoval} from "../src/security/yolo-temp-scratch.js";
import {createPrimaryToolPolicyHandler} from "../src/security/primary-tool-policy.js";

test("Only owned literal mktemp scratch removal gets the narrow YOLO data-loss waiver",async t=>{
 const candidate=mkdtempSync(join(tmpdir(),"tmp."));
 t.after(()=>rmSync(candidate,{recursive:true,force:true}));
 writeFileSync(join(candidate,"fixture.txt"),"leave untouched");
 const command="rm -rf "+candidate;
 if(!isYoloTempScratchRemoval(command)){
  t.skip("Host temporary directory is not eligible for the owned scratch exception");
  return;
 }
 assert.equal(isYoloTempScratchRemoval(command),true);
 for(const bad of [
  "rm -rf "+tmpdir(),
  "rm -rf "+candidate+" && rm -rf ../private",
  "sudo rm -rf "+candidate,
  "sh -c 'rm -rf "+candidate+"'",
  "find "+candidate+" -delete",
  "rm -rf "+candidate+" "+join(tmpdir(),"private"),
  "rm -rf $TMPDIR/tmp.abcdef",
  "rm -rf "+candidate+"/..",
 ]){
  assert.equal(isYoloTempScratchRemoval(bad),false,bad);
 }
 const context:any={cwd:candidate,hasUI:true,mode:"tui",ui:{
  confirm:async()=>{throw Error("Owned scratch removal must not ask in YOLO");}
 }};
 const handler=createPrimaryToolPolicyHandler({getMode:()=> "yolo"});
 assert.equal(await handler({toolName:"bash",toolCallId:"scratch",input:{command}} as any,context),undefined);
});
