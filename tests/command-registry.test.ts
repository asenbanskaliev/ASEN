import test from "node:test";
import assert from "node:assert/strict";
import {
  CommandRegistry,
  type CommandDefinition
} from "../src/runtime/command-registry.js";

test("CommandRegistry registers commands and retrieves them by primary name and alias", () => {
  const registry = new CommandRegistry();
  const cmd: CommandDefinition = {
    name: "status",
    alias: ["st", "info"],
    description: "Display current environment status",
    category: "diagnostics",
    handler: async () => 0
  };

  registry.register(cmd);

  assert.equal(registry.has("status"), true);
  assert.equal(registry.has("st"), true);
  assert.equal(registry.has("info"), true);
  assert.equal(registry.has("nonexistent"), false);

  assert.equal(registry.get("status")?.name, "status");
  assert.equal(registry.get("st")?.name, "status");
  assert.equal(registry.get("info")?.name, "status");
});

test("CommandRegistry throws when registering duplicate names or conflicting aliases", () => {
  const registry = new CommandRegistry();
  registry.register({
    name: "review",
    alias: ["rev"],
    description: "Review current changes",
    category: "review",
    handler: async () => 0
  });

  assert.throws(
    () =>
      registry.register({
        name: "review",
        description: "Duplicate name",
        category: "review",
        handler: async () => 0
      }),
    /Command 'review' is already registered/
  );

  assert.throws(
    () =>
      registry.register({
        name: "diff",
        alias: ["rev"],
        description: "Conflicting alias",
        category: "session",
        handler: async () => 0
      }),
    /Alias 'rev' conflicts with already registered command 'review'/
  );
});

test("CommandRegistry list() filters by category and sorts alphabetically", () => {
  const registry = new CommandRegistry();
  registry.register({
    name: "zebra",
    description: "Zebra diagnostic",
    category: "diagnostics",
    handler: async () => 0
  });
  registry.register({
    name: "alpha",
    description: "Alpha diagnostic",
    category: "diagnostics",
    handler: async () => 0
  });
  registry.register({
    name: "beta",
    description: "Beta workflow",
    category: "workflow",
    handler: async () => 0
  });

  const diagnostics = registry.list("diagnostics");
  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0]?.name, "alpha");
  assert.equal(diagnostics[1]?.name, "zebra");

  const all = registry.list();
  assert.equal(all.length, 3);
  assert.equal(all[0]?.name, "alpha");
  assert.equal(all[1]?.name, "beta");
  assert.equal(all[2]?.name, "zebra");
});

test("CommandRegistry renderHelp formats aligned usage text", () => {
  const registry = new CommandRegistry();
  registry.register({
    name: "plan",
    description: "Create an execution plan",
    category: "workflow",
    flags: {
      dryRun: { type: "boolean", description: "Preview without executing" }
    },
    handler: async () => 0
  });

  const generalHelp = registry.renderHelp();
  assert.match(generalHelp, /plan/);
  assert.match(generalHelp, /Create an execution plan/);

  const commandHelp = registry.renderHelp("plan");
  assert.match(commandHelp, /Command: plan/);
  assert.match(commandHelp, /--dryRun/);
  assert.match(commandHelp, /Preview without executing/);
});

test("CommandRegistry toPaletteItems excludes hidden commands", () => {
  const registry = new CommandRegistry();
  registry.register({
    name: "visible-cmd",
    description: "Visible in palette",
    category: "core",
    handler: async () => 0
  });
  registry.register({
    name: "secret-internal",
    description: "Internal command",
    category: "core",
    isHidden: true,
    handler: async () => 0
  });

  const palette = registry.toPaletteItems();
  assert.equal(palette.length, 1);
  assert.equal(palette[0]?.value, "visible-cmd");
});
