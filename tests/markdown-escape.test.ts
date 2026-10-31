import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, readdirSync, statSync} from "node:fs";
import path from "node:path";

function mdFiles(root: string): string[] {
 const out: string[] = [];
 for (const entry of readdirSync(root, { withFileTypes: true })) {
  const next = path.join(root, entry.name);
  if (entry.isDirectory()) out.push(...mdFiles(next));
  else if (entry.isFile() && entry.name.endsWith(".md")) out.push(next);
 }
 return out
}

test("human-readable Markdown must not contain literal escaped newlines outside code spans", () => {
 const roots = ["README.md", "docs"];
 const files: string[] = [];
 for (const root of roots) {
  try {
   const s = statSync(root);
   if (s.isFile()) files.push(root);
   else files.push(...mdFiles(root));
  } catch { /* unavailable */ }
 }
 for (const file of files) {
  let inFence = false;
  for (const [index, line] of readFileSync(file, "utf8").split(/\r?\n/).entries()) {
   if (line.trim().startsWith("```")) { inFence = !inFence; continue; }
   if (inFence) continue;
   const withoutInlineCode = line.replace(/`[^`]*`/g, "");
   assert.ok(!withoutInlineCode.includes(String.raw`\n`), `${file}:${index + 1}: accidental literal newline escape in ${line} (use real blank lines instead)`);
  }
 }
});
