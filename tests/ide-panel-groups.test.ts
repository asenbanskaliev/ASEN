import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderAsenPanelWithLayout, renderAsenPanel, type AsenPanelSnapshot, ASEN_PANEL_SECTIONS } from "../src/runtime/ui/ide-panel.js";

function emptySnapshot(): AsenPanelSnapshot {
 return {
  todos: [],
  agents: [],
  jobs: [],
 };
}

describe("renderAsenPanelWithLayout", () => {
 it("returns lines matching renderAsenPanel output", () => {
  const snapshot = emptySnapshot();
  const expected = renderAsenPanel(snapshot, 72);
  const result = renderAsenPanelWithLayout(snapshot, 72);
  assert.deepEqual([...result.lines], [...expected]);
 });

 it("returns one group per section", () => {
  const result = renderAsenPanelWithLayout(emptySnapshot(), 72);
  assert.equal(result.groups.length, ASEN_PANEL_SECTIONS.length);
  for (let i = 0; i < result.groups.length; i++) {
   assert.equal(result.groups[i]!.section, ASEN_PANEL_SECTIONS[i]);
  }
 });

 it("collapsed sections have start === end - 1 (header only)", () => {
  const result = renderAsenPanelWithLayout(emptySnapshot(), 72, ["TODOS", "JOBS"]);
  const todosGroup = result.groups.find(g => g.section === "TODOS")!;
  assert.equal(todosGroup.end - todosGroup.start, 1);
  const agentsGroup = result.groups.find(g => g.section === "AGENTS")!;
  assert.ok(agentsGroup.end - agentsGroup.start >= 1);
 });

 it("groups cover all lines with no gaps or overlaps", () => {
  const result = renderAsenPanelWithLayout(emptySnapshot(), 72);
  const covered = new Set<number>();
  for (const group of result.groups) {
   for (let i = group.start; i < group.end; i++) {
    assert.ok(!covered.has(i), `Line ${i} covered by multiple groups`);
    covered.add(i);
   }
  }
  for (const idx of result.loose) covered.add(idx);
  assert.equal(covered.size, result.lines.length);
 });

 it("loose array is empty for standard panel", () => {
  const result = renderAsenPanelWithLayout(emptySnapshot(), 72);
  assert.equal(result.loose.length, 0);
 });

 it("rejects invalid width", () => {
  assert.throws(() => renderAsenPanelWithLayout(emptySnapshot(), 5));
  assert.throws(() => renderAsenPanelWithLayout(emptySnapshot(), 1001));
  assert.throws(() => renderAsenPanelWithLayout(emptySnapshot(), NaN));
 });

 it("returns frozen objects", () => {
  const result = renderAsenPanelWithLayout(emptySnapshot(), 72);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.lines));
  assert.ok(Object.isFrozen(result.groups));
  assert.ok(Object.isFrozen(result.loose));
 });
});
