import {createRequire} from "node:module";
import {dirname,relative,resolve,join} from "node:path";
import {readFileSync,lstatSync,chmodSync} from "node:fs";
import {createHash} from "node:crypto";
const require=createRequire(import.meta.url);

// The pinned dependency's macOS prebuilt spawn-helper is packaged without an executable bit.
// This changes only installed dev tooling permissions, never ASEN or helper bytes.
export function prepareDarwinPtyHelper({platform=process.platform,root,
 loadNative,io={readFileSync,lstatSync,chmodSync}}={}){
 if(platform!=="darwin")return {applicable:false};
 root??=dirname(require.resolve("node-pty/package.json"));
 const metadata=JSON.parse(io.readFileSync(join(root,"package.json"),"utf8"));
 if(metadata.name!=="node-pty"||metadata.version!=="1.1.0")throw Error("Expected pinned node-pty 1.1.0");
 loadNative??=()=>require(join(root,"lib","utils.js")).loadNativeModule("pty");
 const helper=resolve(root,"lib",loadNative().dir,"spawn-helper");
 const contained=relative(resolve(root),helper);
 if(contained.startsWith("..")||contained.startsWith("/"))throw Error("Native helper is outside dependency root");
 const stat=io.lstatSync(helper);
 if(!stat.isFile())throw Error("Native helper must be a regular file");
 const before=stat.mode&0o777,bytes=io.readFileSync(helper);
 io.chmodSync(helper,before|0o100);
 if(!bytes.equals(io.readFileSync(helper)))throw Error("Native helper bytes changed during preparation");
 const after=io.lstatSync(helper).mode&0o777;
 if(!(after&0o100))throw Error("Native helper remains non-executable");
 return {applicable:true,before,after,bytesSha256:createHash("sha256").update(bytes).digest("hex")};
}
