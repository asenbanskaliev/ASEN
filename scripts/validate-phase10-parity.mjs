import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const parityDir = path.join(root, "registry", "parity");
const waveFiles = fs.readdirSync(parityDir)
  .filter((name) => /^forensic-findings-wave\d+\.yaml$/.test(name))
  .sort((a,b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

const ids = new Map();
let max = 0;
for (const file of waveFiles) {
  const text = fs.readFileSync(path.join(parityDir, file), "utf8");
  for (const match of text.matchAll(/id:\s*(PAR-(\d{3}))/g)) {
    const [, id, n] = match;
    if (ids.has(id)) throw new Error(`duplicate ${id}: ${ids.get(id)} and ${file}`);
    ids.set(id, file);
    max = Math.max(max, Number(n));
  }
}
const base = fs.readFileSync(path.join(parityDir, "gentle-ecosystem-v1.yaml"), "utf8");
for (const match of base.matchAll(/id:\s*(PAR-(\d{3}))/g)) {
  const [, id, n] = match;
  if (ids.has(id)) throw new Error(`duplicate base/wave id ${id}`);
  ids.set(id, "gentle-ecosystem-v1.yaml");
  max = Math.max(max, Number(n));
}
for (let n=1;n<=500;n++) {
  const id=`PAR-${String(n).padStart(3,"0")}`;
  if (!ids.has(id)) throw new Error(`missing canonical id ${id}`);
}
if (max !== 500) throw new Error(`expected frozen max PAR-500, got PAR-${max}`);

for (const wave of [47,48]) {
  const text=fs.readFileSync(path.join(parityDir,`forensic-findings-wave${wave}.yaml`),"utf8");
  if (!/p0_new:\s*0/.test(text)) throw new Error(`wave ${wave} is not clean`);
}
const gate=fs.readFileSync(path.join(parityDir,"phase10-normalization-gate.yaml"),"utf8");
if (!/PAR-001\.\.PAR-500/.test(gate)) throw new Error("normalization gate is not bound to frozen universe");
console.log(`Phase 10 registry valid: ${ids.size} canonical IDs, max PAR-500, clean waves 47+48`);
