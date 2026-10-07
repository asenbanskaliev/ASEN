import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {withExclusiveFileLock} from "../src/io/exclusive-file-lock.js";

test("a stale dead-process lock is recovered",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-stale-")),target=path.join(directory,"data.json");
 await writeFile(`${target}.lock`,JSON.stringify({pid:2147483647,token:"dead",createdAt:Date.now()-60000}));
 assert.equal(await withExclusiveFileLock(target,async()=>"locked"),"locked");
});

test("a live process lock is never stolen",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-live-")),target=path.join(directory,"data.json"),lock=`${target}.lock`;
 const content=JSON.stringify({pid:process.pid,token:"live",createdAt:Date.now()-60000});await writeFile(lock,content);
 await assert.rejects(()=>withExclusiveFileLock(target,async()=>"unreachable",20),/Timed out waiting/);assert.equal(await readFile(lock,"utf8"),content);
});
