import { spawn } from "node:child_process";

const BASELINE = 22;
const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["test"], {
 stdio: ["ignore", "pipe", "pipe"],
 windowsHide: true,
});

let output = "";
child.stdout.on("data", chunk => { output += chunk.toString(); });
child.stderr.on("data", chunk => { output += chunk.toString(); });

child.on("close", code => {
 const matches = [...output.matchAll(/^ℹ skipped ([0-9]+)\r?$/gm)];
 if (!matches.length) {
  console.error("skip baseline: could not find the final skipped count");
  console.error(output.slice(-1000));
  process.exit(2);
 }
 const max = Math.max(...matches.map(m => Number(m[1])));
 console.log(`skip baseline: observed ${max} skipped tests (baseline ${BASELINE})`);
 if (max > BASELINE) {
  console.error(`skip baseline violated: ${max} > ${BASELINE}`);
  process.exit(1);
 }
 if (typeof code === "number" && code !== 0) {
  console.error("skip baseline: tests failed");
  process.exit(code);
 }
});
