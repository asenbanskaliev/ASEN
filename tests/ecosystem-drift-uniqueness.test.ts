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
