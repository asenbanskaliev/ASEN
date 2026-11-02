import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());

async function missingLinks(file: string): Promise<string[]> {
  const text = await readFile(file, "utf8");
  const links = [...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
  const missing: string[] = [];
  for (const [, , target] of links) {
    const clean = (target ?? "").trim();
    if (!clean || clean.startsWith("#") || clean.startsWith("http://") || clean.startsWith("https://") || clean.startsWith("mailto:")) continue;
    const resolved = path.resolve(path.dirname(file), clean);
    try { await readFile(resolved, "utf8"); } catch { missing.push(clean); }
  }
  return missing;
}

test("selected ASEN documentation has resolvable internal links", async () => {
  const files = [path.join(root, "README.md"), path.join(root, "docs", "runtime-tools.md"), path.join(root, "docs", "installation.md")];
  for (const file of files) {
    const missing = await missingLinks(file);
    assert.deepEqual(missing, [], `${path.relative(root, file)} has broken internal links`);
  }
});