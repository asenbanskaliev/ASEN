import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Research-only JavaScript baseline module has no declaration file.
import {classifyUniqueContentRenames} from "../scripts/ecosystem-baseline.mjs";

const row=(path:string,sha256:string)=>({path,sha256});
test("rename needs a unique hash in both complete snapshots",()=>{
 const old=[row("a.md","same"),row("stable.md","same")];
 const next=[row("b.md","same"),row("stable.md","same")];
 assert.deepEqual(classifyUniqueContentRenames([old[0]],[next[0]],old,next),[]);
 const distinct=[row("a.md","unique"),row("stable.md","other")];
 const distinctNext=[row("b.md","unique"),row("stable.md","other")];
 assert.deepEqual(classifyUniqueContentRenames([distinct[0]],[distinctNext[0]],distinct,distinctNext),[{path:"a.md",to:"b.md"}]);
 assert.deepEqual(classifyUniqueContentRenames([distinct[0]],[distinctNext[0],row("copy.md","unique")],distinct,[...distinctNext,row("copy.md","unique")]),[]);
});

test("rename classification preserves Git mode and never hides permission changes",()=>{
 const old=[{path:"old.md",sha256:"same",mode:"100644"}];
 const changed=[{path:"new.md",sha256:"same",mode:"100755"}];
 assert.deepEqual(classifyUniqueContentRenames(old,changed,old,changed),[]);
 const sameMode=[{...changed[0],mode:"100644"}];
 assert.deepEqual(classifyUniqueContentRenames(old,sameMode,old,sameMode),[{path:"old.md",to:"new.md"}]);
});

test("mode equality cannot override ambiguous duplicate hashes",()=>{
 const old=[{path:"old.md",sha256:"same",mode:"100644"},{path:"other.md",sha256:"same",mode:"100755"}];
 const next=[{path:"new.md",sha256:"same",mode:"100644"},{path:"other.md",sha256:"same",mode:"100755"}];
 assert.deepEqual(classifyUniqueContentRenames([old[0]],[next[0]],old,next),[]);
});

test("executable runtime blobs rename only when both sides retain mode 100755",()=>{
 const old=[{path:"agent-a.md",sha256:"unique",mode:"100755"}];
 const renamed=[{path:"agent-b.md",sha256:"unique",mode:"100755"}];
 assert.deepEqual(classifyUniqueContentRenames(old,renamed,old,renamed),[{path:"agent-a.md",to:"agent-b.md"}]);
 const changedMode=[{...renamed[0],mode:"100644"}];
 assert.deepEqual(classifyUniqueContentRenames(old,changedMode,old,changedMode),[]);
});

test("mode matrix: only exact mode matches may rename unique content",()=>{
 for(const sourceMode of ["100644","100755"]){
  for(const destinationMode of ["100644","100755"]){
   const source={path:"old.md",sha256:"unique",mode:sourceMode};
   const destination={path:"new.md",sha256:"unique",mode:destinationMode};
   const expected=sourceMode===destinationMode?[{path:"old.md",to:"new.md"}]:[];
   assert.deepEqual(classifyUniqueContentRenames([source],[destination],[source],[destination]),expected);
  }
 }
});

test("a same-hash stable file makes rename ambiguous even if its Git mode differs",()=>{
 const removed={path:"old.md",sha256:"duplicate",mode:"100644"};
 const added={path:"new.md",sha256:"duplicate",mode:"100644"};
 const stableOld={path:"stable.md",sha256:"duplicate",mode:"100755"};
 const stableNew={...stableOld};
 assert.deepEqual(classifyUniqueContentRenames([removed],[added],[removed,stableOld],[added,stableNew]),[]);
});
