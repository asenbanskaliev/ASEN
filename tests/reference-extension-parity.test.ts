export {};

declare const process:{getBuiltinModule(name:string):any};
const assert=process.getBuiltinModule("node:assert/strict");
const {existsSync,readFileSync}=process.getBuiltinModule("node:fs");
const {dirname,resolve}=process.getBuiltinModule("node:path");
const testModule=process.getBuiltinModule("node:test");
const test=testModule.test??testModule;

const comparisonPath="odd/tasks/reference-extension-parity.md";
const currentDocs=[
 comparisonPath,
 "odd/tasks/codex-strict-parity-roadmap.md",
 "odd/tasks/ecosystem-strict-parity.md",
 "odd/tasks/ecosystem-final-parity-map.md"
];
const oldComparisonPath=`odd/tasks/${["gen","tle"].join("")}-shell-extension-parity.md`;
const authoritativePin="08de420ca29be16b6f6bee725a30b599b061df16";
const supplementalPin="6e681f1d08fff3092273cf305206094d15cacd18";
const sealedComparison="54bd5f730a4bd1bfd35dd21588f19da900e49760";
const text=(path:string)=>readFileSync(path,"utf8");

function forbiddenTerms(){
 const manifest=JSON.parse(text("registry/parity/memory-upstream-v3.json"));
 const referenceNames=(manifest.targets as Array<{repository:string}>).map(({repository})=>repository.split("/").at(-1));
 return [...new Set([["gen","tle"].join(""),...referenceNames].filter(Boolean))] as string[];
}

test("the neutral comparison path preserves the complete source analysis",()=>{
 assert.equal(existsSync(comparisonPath),true,"the comparison must use the neutral path");
 const doc=text(comparisonPath);
 const coverage=doc.match(/^\| (\d{1,2}) \|/gm)?.map((row:string)=>Number(row.match(/\d+/)?.[0]))??[];
 assert.deepEqual(coverage,Array.from({length:25},(_,index)=>index+1));
 const history=doc.match(/^\| (?:19|20|21|22|23|24|25) \|/gm)??[];
 assert.equal(history.length,7);
 assert.match(doc,new RegExp(`authoritative[^\n]*${authoritativePin}`,"i"));
 assert.match(doc,new RegExp(`supplemental[^\n]*${supplementalPin}`,"i"));
 assert.match(doc,new RegExp(`sealed[^\n]*${sealedComparison}`,"i"));
 for(const row of doc.split("\n").filter((line:string)=>/^\| (?:[1-9]|1\d|2[0-5]) \|/.test(line))){
  assert.match(row,new RegExp(`${supplementalPin}[^\n]*(?:line|L)`,"i"),`missing supplemental line citation: ${row.slice(0,80)}`);
 }
});

test("all 34 EP specifications retain one canonical owner or disposition",()=>{
 const comparison=text(comparisonPath);
 const proposalSection=comparison.split("## Dependency-ordered non-authoritative proposal map")[1]?.split("## Semantic test strategy")[0]??"";
 const specs=[...proposalSection.matchAll(/^\| (?:EXCLUDED )?\*\*EP-(\d{3})\*\* \|/gm)].map(match=>match[1]);
 assert.equal(specs.length,34);
 assert.equal(new Set(specs).size,34);
 const tracker=text("odd/tasks/ecosystem-strict-parity.md");
 const ownership=tracker.split("## EXT-04 ownership reconciliation")[1]?.split("## Phases and task checklist")[0]??"";
 const owners=[...ownership.matchAll(/^\| EP-(\d{3}) \|/gm)].map(match=>match[1]);
 assert.equal(owners.length,34);
 assert.equal(new Set(owners).size,34);
 assert.deepEqual([...owners].sort(),[...specs].sort());
});

test("closure identities, counts, and current continuation remain explicit",()=>{
 const combined=currentDocs.map(text).join("\n");
 for(const fact of ["167","46","988","GSP-06","MEM R01–R09","ECO-01C-2","NaN","25","34"]){
  assert.ok(combined.includes(fact),`missing preserved fact ${fact}`);
 }
 assert.match(combined,/ECO-01C-2[^\n]*(?:exact-HEAD|required) CI[^\n]*green/i);
 assert.match(text(comparisonPath),/34\/34 unique EP owners\/dispositions/);
 assert.match(text(comparisonPath),/25\/25 audit files/);
});

test("current documentation uses only neutral names and resolvable local links",()=>{
 const forbidden=forbiddenTerms();
 const ownSource=text("tests/reference-extension-parity.test.ts");
 for(const [path,doc] of [...currentDocs.map(path=>[path,text(path)] as const),["tests/reference-extension-parity.test.ts",ownSource] as const]){
  for(const term of forbidden)assert.equal(doc.toLocaleLowerCase().includes(term.toLocaleLowerCase()),false,`${path} contains a forbidden provenance name`);
 }
 for(const path of currentDocs){
  const doc=text(path);
  for(const match of doc.matchAll(/\[[^\]]+\]\(([^)#]+\.md)(?:#[^)]+)?\)/g)){
   assert.equal(existsSync(resolve(dirname(path),match[1])),true,`${path} has a broken local link: ${match[1]}`);
  }
 }
});

test("the retired path has no current-document consumers",()=>{
 for(const path of currentDocs)assert.equal(text(path).includes(oldComparisonPath),false,`${path} still references the retired path`);
});
