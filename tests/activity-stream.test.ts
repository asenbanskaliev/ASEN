import test from "node:test";
import assert from "node:assert/strict";
import {
  ActivityStreamFormatter,
  type ActivityEvent
} from "../src/runtime/agents/activity-stream.js";

test("ActivityStreamFormatter renders single-line dynamic progress", () => {
  const formatter = new ActivityStreamFormatter({ width: 80, enableAnsi: true });
  const event: ActivityEvent = {
    agentId: "explorer-1",
    action: "Reading internal/engine/runner.ts",
    step: "Paso 3/8"
  };

  const line = formatter.format(event);
  assert.match(line, /^\r\x1b\[K/); // begins with carriage return + ANSI clear line
  assert.match(line, /\[explorer-1\] ⚡ Reading internal\/engine\/runner\.ts \(Paso 3\/8\)/);
});

test("ActivityStreamFormatter truncates safely when line exceeds width", () => {
  const formatter = new ActivityStreamFormatter({ width: 40, enableAnsi: false });
  const event: ActivityEvent = {
    agentId: "agent-with-a-very-long-name",
    action: "Executing a very complex analysis over multiple modules in the workspace",
    step: "Step 1"
  };

  const line = formatter.format(event);
  assert.ok(line.length <= 40);
  assert.match(line, /…$/);
});

test("ActivityStreamFormatter renders completed and failed terminal states cleanly", () => {
  const formatter = new ActivityStreamFormatter({ width: 80, enableAnsi: false });

  const successLine = formatter.finish("explorer-1", { status: "success", summary: "Analysis complete" });
  assert.match(successLine, /\[explorer-1\] ✔ Analysis complete\n$/);

  const errorLine = formatter.finish("explorer-1", { status: "error", summary: "File not found" });
  assert.match(successLine, /\[explorer-1\]/);
  assert.match(errorLine, /\[explorer-1\] ✖ File not found\n$/);
});

test("ActivityStreamFormatter detects cooperative cancellation from AbortSignal", () => {
  const controller = new AbortController();
  const formatter = new ActivityStreamFormatter({ width: 80, enableAnsi: false, signal: controller.signal });

  assert.equal(formatter.isCancelled(), false);
  controller.abort();
  assert.equal(formatter.isCancelled(), true);

  const cancelLine = formatter.format({
    agentId: "explorer-1",
    action: "Continuing search",
    step: "Paso 4"
  });
  assert.match(cancelLine, /\[CANCELLED\]/);
});
