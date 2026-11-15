import test from "node:test";
import assert from "node:assert/strict";
import {
  PermissionHashCache
} from "../src/security/permission-hash-cache.js";

test("PermissionHashCache computes deterministic keys and remembers approved commands", () => {
  const cache = new PermissionHashCache();
  const cwd = "C:/Asen";
  const cmd = "npm test";

  assert.equal(cache.isAllowed(cwd, cmd), false);

  cache.remember(cwd, cmd);

  assert.equal(cache.isAllowed(cwd, cmd), true);
  // Changing command even slightly requires new permission
  assert.equal(cache.isAllowed(cwd, "npm test -- --coverage"), false);
  // Changing directory requires new permission
  assert.equal(cache.isAllowed("C:/Other", cmd), false);
});

test("PermissionHashCache binds permissions to git branch when provided", () => {
  const cache = new PermissionHashCache();
  const cwd = "C:/Asen";
  const cmd = "npm run build";

  cache.remember(cwd, cmd, "main");

  assert.equal(cache.isAllowed(cwd, cmd, "main"), true);
  // Different branch is not authorized
  assert.equal(cache.isAllowed(cwd, cmd, "feature-branch"), false);
});

test("PermissionHashCache strictly rejects caching blacklisted destructive commands", () => {
  const cache = new PermissionHashCache();
  const cwd = "C:/Asen";

  const dangerousCommands = [
    "rm -rf /",
    "rm -rf ./node_modules",
    "git push origin main --force",
    "git push -f",
    "git reset --hard HEAD~1",
    "drop table users"
  ];

  for (const dangerous of dangerousCommands) {
    assert.equal(cache.isBlacklisted(dangerous), true);
    assert.throws(
      () => cache.remember(cwd, dangerous),
      /Security Rule Violation: Destructive command cannot be cached/
    );
    assert.equal(cache.isAllowed(cwd, dangerous), false);
  }
});

test("PermissionHashCache clear() wipes all stored permissions", () => {
  const cache = new PermissionHashCache();
  cache.remember("C:/Asen", "git status");
  assert.equal(cache.isAllowed("C:/Asen", "git status"), true);

  cache.clear();
  assert.equal(cache.isAllowed("C:/Asen", "git status"), false);
});
