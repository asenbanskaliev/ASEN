/**
 * P23 pre-delivery gate fixtures: mechanical recognition of delivery actions
 * (git push, package publishes, gh release/pr delivery) and the authorization
 * verdict. No Git, filesystem, or native review calls: this guard is pure
 * lexical evidence over the command string.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { checkDeliveryPreflight, type DeliveryPreflightContext } from "../src/review/delivery-preflight.js";

const context = (command: string, deliveryAuthorized: boolean, signal?: AbortSignal): DeliveryPreflightContext => ({
  cwd: "/repo",
  command,
  deliveryAuthorized,
  ...(signal ? { signal } : {}),
});

const UNAUTHORIZED_PREFIX = "Review outcomes do not authorize delivery.";

const blockedDelivery = (command: string, action: string) => {
  const result = checkDeliveryPreflight(context(command, false));
  assert.ok(result, `expected a delivery verdict for ${command}`);
  assert.equal(result.blocked, true, command);
  assert.ok(result.reason?.startsWith(UNAUTHORIZED_PREFIX), `${command} -> ${result.reason}`);
  assert.ok(result.reason?.includes(action), `${command} -> ${result.reason}`);
};

test("non-delivery commands return undefined under any authorization", () => {
  for (const command of [
    "git status", "git log --oneline", "ls -la", "npm test", "pnpm run build",
    "yarn install", "gh pr view 12", "gh release list", "echo done && git log",
    "git commit -m 'add push helper'", "echo git push", "cat notes/git-push.md",
    "npm run publish-docs", "grep -rn push src", "npx some-tool publish",
  ]) {
    for (const deliveryAuthorized of [false, true]) assert.equal(checkDeliveryPreflight(context(command, deliveryAuthorized)), undefined, command);
  }
});

test("git push is blocked when delivery is not authorized", () => {
  for (const command of [
    "git push", "git push origin main", "git --no-pager push --force-with-lease",
    "npm test && git push", "git add -A && git commit -m x; git push",
  ]) blockedDelivery(command, "git push");
});

test("git push passes when delivery is authorized", () => {
  for (const command of ["git push", "git -C /other/repo push", "cd repo && git push"]) {
    const result = checkDeliveryPreflight(context(command, true));
    assert.ok(result, command);
    assert.equal(result.blocked, false, command);
  }
});

test("package manager publishes are blocked when delivery is not authorized", () => {
  for (const command of ["npm publish", "pnpm publish -r", "yarn publish"]) blockedDelivery(command, "publish");
  for (const command of [
    "npm --registry https://registry.example.com publish --access public",
    "echo yes | npm publish", "sudo npm publish", "npm -w pkg publish",
  ]) blockedDelivery(command, "npm publish");
});

test("gh release create and gh pr merge are blocked when delivery is not authorized", () => {
  for (const command of ["gh release create v1.0.0", "gh pr merge 42 --auto", "gh -R owner/repo pr merge"]) blockedDelivery(command, "gh");
});

test("git -C path push is detected as a delivery action", () => {
  blockedDelivery("git -C ../sibling-repo push origin main", "git push");
  blockedDelivery("git -Crepo push", "git push");
});

test("malformed or non-executable commands fail open", () => {
  for (const command of ["", "   ", "&&&&", "((", '"unterminated', "git", "echo \"", "git; push", "npm"]) {
    assert.equal(checkDeliveryPreflight(context(command, false)), undefined, command);
  }
});

test("signal abort is handled gracefully without throwing", () => {
  const controller = new AbortController();
  controller.abort();
  const cancelled = checkDeliveryPreflight(context("git push", true, controller.signal));
  assert.equal(cancelled?.blocked, true);
  assert.ok(cancelled?.reason?.includes("cancel"), cancelled?.reason);
  const unauthorized = checkDeliveryPreflight(context("npm publish", false, controller.signal));
  assert.equal(unauthorized?.blocked, true);
  assert.ok(unauthorized?.reason?.startsWith(UNAUTHORIZED_PREFIX), unauthorized?.reason);
  assert.equal(checkDeliveryPreflight(context("ls -la", true, controller.signal)), undefined);
  const live = new AbortController();
  assert.deepEqual(checkDeliveryPreflight(context("git push", true, live.signal)), { blocked: false });
});
