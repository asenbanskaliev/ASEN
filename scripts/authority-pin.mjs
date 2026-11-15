import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";

const file="src/agents/pi-authority-assets.ts";

function normalize(source){
  return source.replace(/\r\n/g,"\n");
}

function hashFile(source){
  const content=readFileSync(source,"utf8");
  return createHash("sha256").update(normalize(content)).digest("hex");
}

const moduleSource = readFileSync(file, "utf8");
const assets = moduleSource.split(/\r?\n/)
  .map((line) => line.match(/source:"([^"]+)"/))
  .filter(Boolean)
  .map((match) => match[1]);

const expected={};
for(const asset of assets) expected[asset]=hashFile(asset);

function replaceHash(manifest, asset, hash){
  const lines=manifest.split(/\r?\n/);
  let found=false;
  const updated=lines.map((line)=>{
    const match=line.match(new RegExp(`source:"${asset}"`));
    if(!match) return line;
    if(!new RegExp('sha256:"[0-9a-f]{64}"').test(line)) return line;
    found=true;
    return line.replace(/sha256:"[0-9a-f]{64}"/, `sha256:"${hash}"`);
  });
  if(!found) throw new Error(`Authority pin entry not found: ${asset}`);
  return updated.join("\n") + (manifest.endsWith("\n") ? "\n" : "");
}

const mode=process.argv.includes("check") ? "check" : "write";

if(mode==="check"){
 const manifest=readFileSync(file,"utf8");
 const mismatches=[];
 for(const asset of assets){
  const match = manifest.match(new RegExp(`source:"${asset}"[\\s\\S]*?sha256:"([0-9a-f]{64})"`));
  const pinned=match?.[1] ?? null;
  const computed=expected[asset];
  if(pinned!==computed) mismatches.push({asset,expected:computed,actual:pinned});
 }
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

let manifest=readFileSync(file,"utf8");
for(const asset of assets){
 manifest=replaceHash(manifest,asset,expected[asset]);
}
writeFileSync(file,manifest,"utf8");
console.log(`Authority pin updated: ${assets.length} files`);
for(const asset of assets){
 console.log(`  ${asset}: ${expected[asset]}`);
}
