import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PiProcessRunner } from "../src/agents/pi-process-runner.js";

test("Pi RPC adapter sends a prompt frame and consumes process output", async(t)=>{
  if (process.platform === "win32") return t.skip("POSIX fixture; Windows real smoke runs separately");
  const dir=await mkdtemp(join(tmpdir(),"asen-pi-"));
  const fake=join(dir,"pi-fixture");
  await writeFile(fake,`#!/usr/bin/env node
let data="";
process.stdin.on("data",d=>data+=d);
process.stdin.on("end",()=>{const frame=JSON.parse(data.trim()); console.log(JSON.stringify({type:"response",success:frame.type==="prompt" && frame.message==="hello"}));});
`);
  await chmod(fake,0o755);
  const runner=new PiProcessRunner({command:fake});
  const result=await runner.run({id:"x",role:"explorer",prompt:"hello",repository:dir});
  assert.equal(result.ok,true);
  assert.match(result.output,/"success":true/);
});
