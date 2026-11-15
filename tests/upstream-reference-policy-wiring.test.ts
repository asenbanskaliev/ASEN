import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  compatibilityEntriesWithoutWiring,
  compatibilityWiringOf,
  listCompatibilityEntries,
  listUnwiredCompatibilityEntries,
} from "../scripts/upstream-reference-policy.mjs";

// Every entry approved as a ported compatibility line must state whether it is
// reachable from a production entry point. A ported file that only its own test
// imports is ported text, not a delivered runtime guarantee.

const CODE = /\.(?:ts|tsx|mts|mjs|js)$/u;
const PRODUCTION_ROOTS = ["src", "extensions", "bin"];

function collect(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      collect(full, out);
    } else if (CODE.test(entry.name)) out.push(full);
  }
}

const productionFiles = PRODUCTION_ROOTS.filter(existsSync).flatMap((root) => {
  const out: string[] = [];
  collect(root, out);
  return out;
});

function productionImporters(entry: string): string[] {
  const stem = path.basename(entry).replace(/\.ts$/u, "");
  const specifier = new RegExp(`/${stem}\\.js["']`, "u");
  return productionFiles
    .filter((file) => file !== path.normalize(entry))
    .filter((file) => specifier.test(readFileSync(file, "utf8")))
    .map((file) => file.split(path.sep).join("/"))
    .sort();
}

test("every approved compatibility entry declares its wiring", () => {
  assert.deepEqual(compatibilityEntriesWithoutWiring(), []);
});

test("declared wiring matches a real production importer", () => {
  for (const entry of listCompatibilityEntries()) {
    const declared = compatibilityWiringOf(entry);
    assert.ok(declared, `${entry} must declare wiring`);
    assert.ok(existsSync(entry), `${entry} declared in the policy must exist`);
    if (declared.kind === "test") {
      assert.equal(entry.startsWith("tests/"), true, `${entry} is declared a test fixture`);
      continue;
    }
    assert.equal(declared.kind, "production", entry);
    const importers = productionImporters(entry);
    if (declared.wired) {
      assert.ok(
        importers.includes(declared.consumer),
        `${entry} declares ${declared.consumer} as its production consumer, found [${importers.join(", ")}]`,
      );
    } else {
      assert.deepEqual(importers, [], `${entry} is declared unwired but has a production importer`);
    }
  }
});

test("entries without a live consumer are exactly the known ported-text set", () => {
  assert.deepEqual(listUnwiredCompatibilityEntries(), [
    "src/runtime/ui/desktop-rpc.ts",
    "src/runtime/ui/guide-tour.ts",
    "src/runtime/ui/image-disk-cache.ts",
    "src/runtime/ui/reply-language-anchor.ts",
    "src/runtime/ui/voice-dictation.ts",
  ]);
});
