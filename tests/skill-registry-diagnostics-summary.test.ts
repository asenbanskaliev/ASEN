import test from "node:test";
import assert from "node:assert/strict";
import type { SkillSkipDiagnostic } from "../src/skills/discovery.js";
import { summarizeSkillRegistryDiagnostics } from "../src/skills/generated-registry.js";

test("summarizes skill diagnostics deterministically and keeps optional statuses explicit", () => {
 const mixed = [
  { reason: "excluded-name", sourceId: "project-skills", path: "/a/skill.md", name: "_shared" },
  { reason: "missing-source", sourceId: "user-skills", path: "/b" },
  { reason: "missing-source", sourceId: "package-skills", path: "/c" }
 ] as readonly SkillSkipDiagnostic[];
 assert.equal(
  summarizeSkillRegistryDiagnostics(mixed),
  "excluded-name=1, missing-source=2"
 );

 const kinds = summarizeSkillRegistryDiagnostics([
  { reason: "excluded-name", sourceId: "a", path: "/a", name: "_shared" },
  { reason: "missing-source", sourceId: "b", path: "/b" },
  { reason: "duplicate-name", sourceId: "c", path: "/c", name: "shared", winnerPath: "/winner", rejectedPath: "/c" }
 ] as readonly SkillSkipDiagnostic[]);
 assert.deepEqual(
  String(kinds).split(", ").sort(),
  ["duplicate-name=1", "excluded-name=1", "missing-source=1"]
 );
});