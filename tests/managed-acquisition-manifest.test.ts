import test from "node:test";
import assert from "node:assert/strict";
import {decodeManagedAcquisitionManifest,ManagedInstallError} from "../src/runtime/managed-install.js";

const hash="0123456789abcdef".repeat(4);
const file=(overrides:Record<string,unknown>={})=>({
 sourcePath:"package/dist/cli.js",
 destinationPath:"dist/cli.js",
 size:23,
 sha256:hash,
 ...overrides,
});
const manifest=(overrides:Record<string,unknown>={})=>({
 schema:"asen.managed-acquisition/v1",
 version:"1.2.3",
 files:[file()],
 ...overrides,
});

function expectError(input:unknown,code:string,message?:string){
 assert.throws(()=>decodeManagedAcquisitionManifest(input),error=>{
  assert.ok(error instanceof ManagedInstallError);
  assert.equal(error.code,code);
  if(message)assert.equal(error.message,message);
  return true;
 });
}

test("decodes the exact owned schema as frozen forward-slash metadata",()=>{
 const input=manifest({files:[
  file(),
  file({sourcePath:"package/package.json",destinationPath:"package.json",size:0,sha256:"a".repeat(64)}),
 ]});
 const result=decodeManagedAcquisitionManifest(input);
 assert.deepEqual(result,{
  schema:"asen.managed-acquisition/v1",
  version:"1.2.3",
  files:[
   {sourcePath:"package/dist/cli.js",destinationPath:"dist/cli.js",size:23,sha256:hash},
   {sourcePath:"package/package.json",destinationPath:"package.json",size:0,sha256:"a".repeat(64)},
  ],
 });
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(result.files));
 assert.ok(result.files.every(Object.isFrozen));
});

test("returns an independent copy and leaves accepted input mutable",()=>{
 const input=manifest();
 const result=decodeManagedAcquisitionManifest(input);
 assert.notEqual(result,input);
 assert.notEqual(result.files,(input as {files:unknown[]}).files);
 assert.notEqual(result.files[0],(input as {files:unknown[]}).files[0]);
 (input as {version:string}).version="9.9.9";
 (input as {files:Array<{destinationPath:string}>}).files[0]!.destinationPath="changed.js";
 assert.equal(result.version,"1.2.3");
 assert.equal(result.files[0]!.destinationPath,"dist/cli.js");
});

test("accepts exactly 4096 dense records and preserves their order",()=>{
 const files=Array.from({length:4096},(_,index)=>file({
  sourcePath:`source/${index}.js`,destinationPath:`dist/${index}.js`,size:index,
 }));
 const result=decodeManagedAcquisitionManifest(manifest({files}));
 assert.equal(result.files.length,4096);
 assert.equal(result.files[0]!.destinationPath,"dist/0.js");
 assert.equal(result.files[4095]!.destinationPath,"dist/4095.js");
});

test("rejects empty, over-bound, sparse, and subclass arrays",()=>{
 expectError(manifest({files:[]}),"INVALID_ACQUISITION_MANIFEST");
 expectError(manifest({files:Array.from({length:4097},(_,index)=>file({sourcePath:`s/${index}`,destinationPath:`d/${index}`}))}),"INVALID_ACQUISITION_MANIFEST");
 const sparse:Array<ReturnType<typeof file>>=Array(3);
 sparse[0]=file();sparse[2]=file({destinationPath:"other.js"});
 expectError(manifest({files:sparse}),"INVALID_ACQUISITION_MANIFEST");
 class FileList<T> extends Array<T>{}
 expectError(manifest({files:new FileList(file())}),"INVALID_ACQUISITION_MANIFEST");
});

test("rejects non-plain, extra, symbol, accessor, and non-data shapes",()=>{
 expectError(null,"INVALID_ACQUISITION_MANIFEST");
 expectError([],"INVALID_ACQUISITION_MANIFEST");
 expectError(Object.assign(Object.create(null),manifest()),"INVALID_ACQUISITION_MANIFEST");
 expectError({...manifest(),extra:true},"INVALID_ACQUISITION_MANIFEST");
 const symbolManifest=manifest() as Record<PropertyKey,unknown>;
 symbolManifest[Symbol("extra")]=true;
 expectError(symbolManifest,"INVALID_ACQUISITION_MANIFEST");
 const accessorManifest=manifest();
 Object.defineProperty(accessorManifest,"version",{get(){throw new Error("getter invoked");},enumerable:true});
 expectError(accessorManifest,"INVALID_ACQUISITION_MANIFEST");
 const accessorFile=file();
 Object.defineProperty(accessorFile,"size",{get(){throw new Error("getter invoked");},enumerable:true});
 expectError(manifest({files:[accessorFile]}),"INVALID_ACQUISITION_MANIFEST");
 const arrayWithExtra=[file()] as Array<unknown>&{extra?:boolean};arrayWithExtra.extra=true;
 expectError(manifest({files:arrayWithExtra}),"INVALID_ACQUISITION_MANIFEST");
});

test("rejects proxies without invoking any proxy trap",()=>{
 let invocations=0;
 const traps:ProxyHandler<object>={
  get(){invocations++;throw new Error("get trap invoked");},
  getPrototypeOf(){invocations++;throw new Error("prototype trap invoked");},
  ownKeys(){invocations++;throw new Error("ownKeys trap invoked");},
  getOwnPropertyDescriptor(){invocations++;throw new Error("descriptor trap invoked");},
 };
 expectError(new Proxy(manifest(),traps),"INVALID_ACQUISITION_MANIFEST");
 expectError(manifest({files:new Proxy([file()],traps)}),"INVALID_ACQUISITION_MANIFEST");
 expectError(manifest({files:[new Proxy(file(),traps)]}),"INVALID_ACQUISITION_MANIFEST");
 assert.equal(invocations,0);
});

test("requires the exact schema and stable version",()=>{
 expectError(manifest({schema:"asen.managed-acquisition/v2"}),"INVALID_ACQUISITION_MANIFEST");
 for(const version of ["latest","1.2","01.2.3","1.2.3-beta",1,null]){
  expectError(manifest({version}),typeof version==="string"?"INVALID_VERSION":"INVALID_ACQUISITION_MANIFEST");
 }
});

test("requires nonnegative safe-integer byte sizes",()=>{
 for(const size of [-1,0.5,Number.MAX_SAFE_INTEGER+1,Infinity,NaN,"23",null]){
  expectError(manifest({files:[file({size})]}),"INVALID_ACQUISITION_MANIFEST");
 }
 const result=decodeManagedAcquisitionManifest(manifest({files:[file({size:Number.MAX_SAFE_INTEGER})]}));
 assert.equal(result.files[0]!.size,Number.MAX_SAFE_INTEGER);
});

test("requires exactly 64 lowercase hexadecimal hash characters",()=>{
 for(const sha256 of ["a".repeat(63),"a".repeat(65),"A".repeat(64),"g".repeat(64),23,null]){
  expectError(manifest({files:[file({sha256})]}),"INVALID_ACQUISITION_MANIFEST");
 }
});

test("reuses managed source and destination path and sensitive-name rules",()=>{
 const cases:[Record<string,unknown>,string][]=[
  [{sourcePath:"/absolute.js"},"INVALID_MANIFEST_PATH"],
  [{sourcePath:"../escape.js"},"INVALID_MANIFEST_PATH"],
  [{sourcePath:"dir\\file.js"},"INVALID_MANIFEST_PATH"],
  [{sourcePath:" spaced.js "},"INVALID_MANIFEST_PATH"],
  [{destinationPath:"a//b.js"},"INVALID_MANIFEST_PATH"],
  [{sourcePath:".env.production"},"SENSITIVE_PATH"],
  [{destinationPath:"keys/private.pem"},"SENSITIVE_PATH"],
  [{destinationPath:"node_modules/pkg.js"},"SENSITIVE_PATH"],
 ];
 for(const [override,code] of cases)expectError(manifest({files:[file(override)]}),code);
});

test("reuses managed duplicate-destination semantics",()=>{
 expectError(manifest({files:[
  file({sourcePath:"source/one.js",destinationPath:"dist/same.js"}),
  file({sourcePath:"source/two.js",destinationPath:"dist/same.js"}),
 ]}),"DUPLICATE_DESTINATION","Managed destination paths must be unique");
});

test("rejection leaves nested input unchanged",()=>{
 const input=manifest({files:[file({size:-1})]});
 const before=structuredClone(input);
 expectError(input,"INVALID_ACQUISITION_MANIFEST");
 assert.deepEqual(input,before);
});

test("treats paths, sizes, and hashes as descriptions without filesystem or hook access",()=>{
 const result=decodeManagedAcquisitionManifest(manifest({files:[file({
  sourcePath:"does/not/exist.bin",destinationPath:"future/output.bin",size:987654,sha256:"f".repeat(64),
 })]}));
 assert.deepEqual(result.files[0],{
  sourcePath:"does/not/exist.bin",destinationPath:"future/output.bin",size:987654,sha256:"f".repeat(64),
 });
});
