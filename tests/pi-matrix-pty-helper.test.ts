import assert from "node:assert/strict";
import test from "node:test";
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
// @ts-expect-error CI-only native dependency preparation.
import {prepareDarwinPtyHelper} from "../scripts/pi-matrix-pty-helper.mjs";

test("macOS helper preparation adds only owner execution and preserves exact bytes",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-pty-helper-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 mkdirSync(join(root,"lib"));mkdirSync(join(root,"prebuilds","darwin-arm64"),{recursive:true});
 writeFileSync(join(root,"package.json"),JSON.stringify({name:"node-pty",version:"1.1.0"}));
 const helper=join(root,"prebuilds","darwin-arm64","spawn-helper"),bytes=Buffer.from("helper fixture bytes");
 writeFileSync(helper,bytes);let mode=0o644;
 const io={readFileSync,lstatSync:()=>({mode,isFile:()=>true}),chmodSync:(_path:string,value:number)=>{mode=value;}};
 const options={platform:"darwin",root,loadNative:()=>({dir:"../prebuilds/darwin-arm64/"}),io};
 const result=prepareDarwinPtyHelper(options);
 assert.equal(result.before,0o644);assert.equal(result.after,0o744);
 assert.equal(mode,0o744);assert.deepEqual(readFileSync(helper),bytes);
 assert.equal(prepareDarwinPtyHelper(options).before,0o744);
});

test("non-macOS preparation performs no dependency lookup or filesystem mutation",()=>{
 for(const platform of ["linux","win32"])assert.deepEqual(prepareDarwinPtyHelper({platform,root:"missing",
  loadNative:()=>{throw Error("unexpected native lookup");}}),{applicable:false});
});

test("macOS preparation refuses escaped native helper paths",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-pty-escape-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 writeFileSync(join(root,"package.json"),JSON.stringify({name:"node-pty",version:"1.1.0"}));
 assert.throws(()=>prepareDarwinPtyHelper({platform:"darwin",root,loadNative:()=>({dir:"../../outside/"})}),/outside/);
});
