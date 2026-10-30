import {createHash} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {deflateSync} from "node:zlib";

// Test-only SHA-1 bare repositories: keep real Git reads, avoid one writer process per mutation.
export function writeFixtureBlob(repository,bytes){
 if(!Buffer.isBuffer(bytes))throw new TypeError("fixture blob requires bytes");
 const object=Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes]);
 const id=createHash("sha1").update(object).digest("hex");
 const directory=join(repository,"objects",id.slice(0,2));
 mkdirSync(directory,{recursive:true});
 writeFileSync(join(directory,id.slice(2)),deflateSync(object));
 return id;
}
