import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import path from "node:path";

const file="src/agents/pi-process-runner.ts";
const assets=[
  "src/io/atomic-write.ts",
  "src/io/exclusive-file-lock.ts",
  "src/io/private-file.ts",
  "src/runtime/responsive-layout.ts",
  "src/runtime/workspace-attribution.ts",
  "src/runtime/workspace-store.ts"
];

function normalize(source){
  return source.replace(/\r\n/g,"\n");
}

function hashFile(source){
  const content=readFileSync(source,"utf8");
  return createHash("sha256").update(normalize(content)).digest("hex");
}

const expected={};
for(const asset of assets) expected[asset]=hashFile(asset);

function replaceHash(manifest,asset,hash){
 const source=`src/runtime/${asset}`.replace("src/",""); 
 const re=new RegExp(`source:"${asset}",target:"${asset}",sha256:"[0-9a-f]{64}"`);
 const next=manifest.replace(re,`source:"${asset}",target:"${asset}",sha256:"${hash}"`);
 if(next===manifest) throw new Error(`Authority pin entry not found: ${asset}`);
 return next;
}

let manifest=readFileSync(file,"utf8");
const mismatches=[];
for(const asset of assets){
 const entryAsset=asset;
 const re=new RegExp(`source:"${asset}",target:"${asset}",sha256:"([0-9a-f]{64})"`);
 const match=manifest.match(re);
 const pinned=match?.[1] ?? null;
 const computed=expected[asset];
 if(pinned!==computed) mismatches.push({asset,expected:computed,actual:pinned});
}

const mode=process.argv.includes("check") ? "check" : "write";

if(mode==="check"){
 if(mismatches.length){
  for(const item of mismatches){
   console.error(`AUTHORITY PIN MISMATCH: ${item.asset}`);
   console.error(`  expected: ${item.expected}`);
   console.error(`  actual:   ${item.actual ?? "(missing)"}`);
  }
  process.exit(1);
 }
 console.log(`Authority pin verified: ${assets.length} files`);
 process.exit(0);
}

for(const asset of assets){
 const computed=expected[asset];
 manifest=replaceHash(manifest,asset,computed);
}
writeFileSync(file,manifest,"utf8");
console.log(`Authority pin updated: ${assets.length} files`);
for(const asset of assets){
 console.log(`  ${asset}: ${expected[asset]}`);
}
