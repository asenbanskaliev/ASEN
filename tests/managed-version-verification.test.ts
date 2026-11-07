import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,readFile,writeFile,stat,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {stageManagedInstall,inspectManagedInstall} from "../src/runtime/managed-install.js";

const roots:string[]=[];
test.afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
const api=()=>import("../src/runtime/managed-version-verification.js");
const schema="asen.managed-version-verification/v1";
const unowned="Requested managed version is not owned or failed integrity validation";
const invalid="Managed package metadata is invalid";
const invalidBin="Managed bin.asen must identify a listed canonical file";
const baseMetadata={name:"asen",version:"0.1.0",engines:{node:">=0.0.0"},bin:{asen:"./dist/cli.js"}};

async function absent(file:string){try{await stat(file);return false;}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return true;throw error;}}
async function fixture(metadata:unknown=baseMetadata,owned=true){
 const root=await mkdtemp(path.join(tmpdir(),"asen-version-verify-"));roots.push(root);
 const prefix=path.join(root,"shared .asen"),packageRoot=path.join(root,"package source ü"),marker=path.join(root,"EXECUTED");
 await mkdir(path.join(packageRoot,"dist"),{recursive:true});await mkdir(path.join(prefix,"agent"),{recursive:true});
 await writeFile(path.join(packageRoot,"package.json"),typeof metadata==="string"?metadata:JSON.stringify(metadata));
 await writeFile(path.join(packageRoot,"dist","cli.js"),`import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)},'MUST-NOT-EXECUTE');\n`);
 await writeFile(path.join(prefix,"config.json"),"PERSONAL-CONFIG");await writeFile(path.join(prefix,"agent","state.txt"),"PERSONAL-STATE");
 await writeFile(path.join(prefix,"foreign.txt"),"FOREIGN");
 const versionRoot=path.join(prefix,"install","versions","0.1.0");
 if(owned)await stageManagedInstall({prefix,packageRoot,version:"0.1.0",confirmed:true,protectedPaths:[path.join(root,"pi-home")],files:[
  {sourcePath:"package.json",destinationPath:"package.json"},{sourcePath:"dist/cli.js",destinationPath:"dist/cli.js"},
 ]});
 const files=[path.join(packageRoot,"package.json"),path.join(packageRoot,"dist","cli.js"),path.join(prefix,"config.json"),path.join(prefix,"agent","state.txt"),path.join(prefix,"foreign.txt")];
 if(owned)files.push(path.join(prefix,"install","managed-install.json"),path.join(versionRoot,"package.json"),path.join(versionRoot,"dist","cli.js"));
 return {prefix,versionRoot,marker,files};
}
async function snapshot(f:Awaited<ReturnType<typeof fixture>>){return Promise.all(f.files.map(async file=>({file,bytes:await readFile(file),mtime:(await stat(file)).mtimeMs})));}
async function preserved(f:Awaited<ReturnType<typeof fixture>>,before:Awaited<ReturnType<typeof snapshot>>){
 for(const entry of before){assert.deepEqual(await readFile(entry.file),entry.bytes);assert.equal((await stat(entry.file)).mtimeMs,entry.mtime);}
 assert.equal(await absent(f.marker),true);
 for(const name of ["current","activation.json","maintenance.lock","version-receipts"]){assert.equal(await absent(path.join(f.prefix,"install",name)),true);}
}
function expected(reason:string|null,integrity="verified",packageMetadata="unverified",nodeCompatibility="unverified"){
 return {schema,version:"0.1.0",integrity,packageMetadata,nodeCompatibility,runtimeProbe:"not-run",runtimeReady:false,reason};
}

test("managed metadata verification never executes the staged CLI or activates it",async()=>{
 const f=await fixture(),before=await snapshot(f),{verifyManagedVersion}=await api();
 assert.deepEqual(await verifyManagedVersion({prefix:f.prefix,version:"0.1.0"}),expected(null,"verified","verified","compatible"));
 const inventory=await inspectManagedInstall({prefix:f.prefix});assert.equal(inventory.activeVersion,null);assert.equal(inventory.runtimeReady,false);
 await preserved(f,before);
});

test("managed metadata verification refuses unowned and unlisted versions without effects",async()=>{
 for(const owned of [false,true]){
  const f=await fixture(baseMetadata,owned),before=await snapshot(f),{verifyManagedVersion}=await api();
  for(const version of owned?["1.2.3","../../outside"]:["0.1.0"]){
   assert.deepEqual(await verifyManagedVersion({prefix:f.prefix,version}),{...expected(unowned,"unverified"),version});
  }
  await preserved(f,before);
 }
});

test("managed metadata verification rejects malformed package identity",async()=>{
 for(const metadata of ["{",{...baseMetadata,name:"other"},{...baseMetadata,version:"9.9.9"},[]]){
  const f=await fixture(metadata),before=await snapshot(f),{verifyManagedVersion}=await api();
  assert.deepEqual(await verifyManagedVersion({prefix:f.prefix,version:"0.1.0"}),expected(invalid));await preserved(f,before);
 }
});

test("managed metadata verification rejects unlisted and escaping bin paths",async()=>{
 for(const bin of [{}, {asen:"dist/missing.js"},{asen:"../outside.js"},{asen:"/outside.js"},{asen:"dist\\cli.js"},{asen:"dist//cli.js"},{asen:"C:/outside.js"}]){
  const f=await fixture({...baseMetadata,bin}),before=await snapshot(f),{verifyManagedVersion}=await api();
  assert.deepEqual(await verifyManagedVersion({prefix:f.prefix,version:"0.1.0"}),expected(invalidBin));await preserved(f,before);
 }
});

test("managed metadata verification reports unsupported engines as unverified",async()=>{
 const f=await fixture({...baseMetadata,engines:{node:"^22.19.0"}}),before=await snapshot(f),{verifyManagedVersion}=await api();
 assert.deepEqual(await verifyManagedVersion({prefix:f.prefix,version:"0.1.0"}),expected("Managed Node engine range is unsupported","verified","verified"));await preserved(f,before);
});

test("managed metadata verification reports an incompatible canonical Node floor",async()=>{
 const f=await fixture({...baseMetadata,engines:{node:">=999.0.0"}}),before=await snapshot(f),{verifyManagedVersion}=await api();
 assert.deepEqual(await verifyManagedVersion({prefix:f.prefix,version:"0.1.0"}),expected("Current Node version does not satisfy managed package engine","verified","verified","incompatible"));await preserved(f,before);
});

test("managed metadata verification refuses changed version bytes without repairing them",async()=>{
 const f=await fixture();await writeFile(path.join(f.versionRoot,"dist","cli.js"),"CHANGED");
 const before=await snapshot(f),{verifyManagedVersion}=await api();
 assert.deepEqual(await verifyManagedVersion({prefix:f.prefix,version:"0.1.0"}),expected(unowned,"unverified"));await preserved(f,before);
});
