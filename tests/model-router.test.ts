import test from "node:test";
import assert from "node:assert/strict";
import {
  AgentRole,
  ROLE_MODEL_TIERS,
  resolveAgentModel
} from "../src/agents/model-router.js";

test("resolveAgentModel maps roles to optimal model tiers by default", () => {
  assert.equal(resolveAgentModel(AgentRole.EXPLORER), "flash_lite");
  assert.equal(resolveAgentModel(AgentRole.ARCHITECT), "pro");
  assert.equal(resolveAgentModel(AgentRole.IMPLEMENTER), "inherit");
  assert.equal(resolveAgentModel(AgentRole.AUDITOR), "pro");
});

test("resolveAgentModel allows custom overrides within safety boundaries", () => {
  const customExplorer = resolveAgentModel(AgentRole.EXPLORER, {
    explorerModel: "flash"
  });
  assert.equal(customExplorer, "flash");

  const customArchitect = resolveAgentModel(AgentRole.ARCHITECT, {
    architectModel: "pro"
  });
  assert.equal(customArchitect, "pro");
});

test("resolveAgentModel strictly forbids downgrading implementers or auditors to lite models", () => {
  assert.throws(
    () =>
      resolveAgentModel(AgentRole.IMPLEMENTER, {
        implementerModel: "flash_lite" as any
      }),
    /Security Rule Violation: IMPLEMENTER role cannot be assigned a lite model/
  );

  assert.throws(
    () =>
      resolveAgentModel(AgentRole.AUDITOR, {
        auditorModel: "flash_lite" as any
      }),
    /Security Rule Violation: AUDITOR role cannot be assigned a lite model/
  );
});

test("ROLE_MODEL_TIERS object is immutable and frozen", () => {
  assert.equal(Object.isFrozen(ROLE_MODEL_TIERS), true);
  assert.equal(ROLE_MODEL_TIERS[AgentRole.EXPLORER], "flash_lite");
});
