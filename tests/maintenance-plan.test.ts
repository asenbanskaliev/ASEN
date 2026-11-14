import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createSetupMaintenancePlan } from "../src/runtime/maintenance-plan.js";

const absolute = (name: string) => path.resolve(path.parse(process.cwd()).root, "private", name);

test("setup maintenance plan is deterministic, ordered, and explicitly non-executable", () => {
  const input = {
    packageRoot: absolute("package root"),
    prefix: absolute("prefix"),
    home: absolute("agent home"),
  };
  assert.deepEqual(createSetupMaintenancePlan(input), {
    schema: "asen.maintenance-plan/v1",
    operation: "setup",
    executable: false,
    packageRoot: input.packageRoot,
    prefix: input.prefix,
    home: input.home,
    steps: [
      { order: 1, intent: "stage", executable: false },
      { order: 2, intent: "verify", executable: false },
      { order: 3, intent: "activate", executable: false },
    ],
  });
});

test("setup maintenance plan copies and freezes all public metadata", () => {
  const input = {
    packageRoot: absolute("package"),
    prefix: absolute("prefix"),
    home: absolute("home"),
  };
  const plan = createSetupMaintenancePlan(input);
  input.home = absolute("changed after planning");

  assert.notEqual(plan.home, input.home);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.steps), true);
  assert.equal(plan.steps.every(step => Object.isFrozen(step)), true);
  assert.throws(() => {
    (plan.steps as unknown as Array<unknown>).push({});
  }, TypeError);
  assert.deepEqual(plan.steps.map(step => step.intent), ["stage", "verify", "activate"]);
});

test("setup maintenance plan requires lexical absolute paths without claiming canonical proof", () => {
  for (const field of ["packageRoot", "prefix", "home"] as const) {
    const input = {
      packageRoot: absolute("package"),
      prefix: absolute("prefix"),
      home: absolute("home"),
      [field]: path.join("relative", field),
    };
    assert.throws(() => createSetupMaintenancePlan(input), new RegExp(`${field} must be an absolute path`, "u"));
  }

  const lexical = path.join(absolute("parent"), "..", "not-canonical");
  const plan = createSetupMaintenancePlan({
    packageRoot: lexical,
    prefix: absolute("prefix"),
    home: absolute("home"),
  });
  assert.equal(plan.packageRoot, lexical);
  assert.equal(Object.hasOwn(plan, "canonical"), false);
  assert.equal(Object.hasOwn(plan, "owner"), false);
  assert.equal(Object.hasOwn(plan, "verified"), false);
});
