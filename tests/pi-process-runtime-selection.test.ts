import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp, mkdir, realpath, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";

function pickNodeExecutable(): string {
 return process.execPath;
}

const validBody = "if (process.argv.includes('--version')) { console.log('1.2.0'); process.exit(0); } const policy = process.argv.includes('--extension') ? process.argv[process.argv.indexOf('--extension') + 1] : ''; let buffer = ''; process.stdin.on('data', chunk => { buffer += chunk.toString(); let end; while ((end = buffer.indexOf('\\n')) >= 0) { const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); if (!line.trim()) continue; const request = JSON.parse(line); if (request.type === 'get_commands') { process.stdout.write(JSON.stringify({type:'response', id: request.id, success:true, data:{ commands:[{name:'asen-authority-status', source:'extension', sourceInfo:{ path: policy } }]} }) + '\\n'); } else if (request.type === 'prompt') { process.stdout.write(JSON.stringify({type:'response', id: request.id, success:true}) + '\\n'); process.stdout.write(JSON.stringify({type:'agent_end'}) + '\\n'); process.stdin.destroy(); } } });";

test("Pi runner accepts a validated bundled JS runtime", async t => {
 const root = await realpath(await mkdtemp(path.join(tmpdir(), "asen-pi-runtime-version-")));
 t.after(async () => rm(root, { recursive: true, force: true }));
 await mkdir(path.join(root, "src"));
 await writeFile(path.join(root, "worker.mjs"), validBody);
 const binary = path.join(root, "worker.mjs");
 const result = await new PiProcessRunner({
  command: pickNodeExecutable(),
  rpcArgs: [binary, "--mode", "rpc"],
  policyRoot: process.cwd(),
  validateRuntimeVersion: true
 }).run({ id: "version-ok", role: "explorer", prompt: "inspect", repository: root });
 assert.equal(result.ok, true, result.output);
 assert.match(result.output, /version-ok/);
});

test("Pi runner rejects an incompatible runtime before launching an agent", async t => {
 const root = await realpath(await mkdtemp(path.join(tmpdir(), "asen-pi-runtime-incompatible-")));
 t.after(async () => rm(root, { recursive: true, force: true }));
 const body = "if (process.argv.includes('--version')) { console.log('0.84.4'); process.exit(0); } const policy = process.argv.includes('--extension') ? process.argv[process.argv.indexOf('--extension') + 1] : ''; let buffer = ''; process.stdin.on('data', chunk => { buffer += chunk.toString(); let end; while ((end = buffer.indexOf('\\n')) >= 0) { const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); if (!line.trim()) continue; const request = JSON.parse(line); if (request.type === 'get_commands') { process.stdout.write(JSON.stringify({type:'response', id:request.id, success:true, data:{ commands:[{name:'asen-authority-status', source:'extension', sourceInfo:{ path:policy } }]} }) + '\\n'); } } }); process.stdin.resume();";
 await mkdir(path.join(root, "src"));
 await writeFile(path.join(root, "worker.mjs"), body);
 const binary = path.join(root, "worker.mjs");
 const result = await new PiProcessRunner({
  command: pickNodeExecutable(),
  rpcArgs: [binary, "--mode", "rpc"],
  policyRoot: process.cwd(),
  validateRuntimeVersion: true
 }).run({ id: "version-bad", role: "explorer", prompt: "inspect", repository: root });
 assert.equal(result.ok, false);
 assert.match(result.output, /is not compatible/i);
});

test("Pi runner preserves the explicit command fallbacks when no bundled runtime is supplied", async () => {
 const runner = new PiProcessRunner({ command: "does-not-exist-for-test", timeoutMs: 1000 });
 const result = await runner.run({ id: "no-runtime", role: "explorer", prompt: "inspect", repository: "/missing-repo" });
 assert.equal(result.ok, false);
 assert.match(result.output, /does-not-exist|ENOENT|version check failed/i);
});