import test from "node:test";
import assert from "node:assert/strict";
import {
  UpdateNotifier,
  isNewerVersion,
  formatUpdateNotice
} from "../src/runtime/update-notifier.js";

test("isNewerVersion compares semver strings accurately", () => {
  assert.equal(isNewerVersion("0.1.0", "0.1.1"), true);
  assert.equal(isNewerVersion("0.1.0", "0.2.0"), true);
  assert.equal(isNewerVersion("0.1.0", "1.0.0"), true);
  assert.equal(isNewerVersion("0.1.1", "0.1.0"), false);
  assert.equal(isNewerVersion("0.1.0", "0.1.0"), false);
});

test("formatUpdateNotice formats a single non-intrusive terminal notice", () => {
  const notice = formatUpdateNotice("0.1.0", "0.1.1");
  assert.match(notice, /ℹ Actualización disponible: v0\.1\.1 \(actual: v0\.1\.0\)/);
  assert.match(notice, /Ejecutá 'asen update' para instalar\./);
});

test("UpdateNotifier respects 24-hour check interval", async () => {
  let currentTime = 1_000_000;
  let checksCalled = 0;

  const mockFetcher = async () => {
    checksCalled++;
    return "0.2.0";
  };

  const notifier = new UpdateNotifier({
    currentVersion: "0.1.0",
    fetchLatestVersion: mockFetcher,
    clock: () => currentTime
  });

  // First check executes fetcher
  const notice1 = await notifier.checkUpdate();
  assert.equal(checksCalled, 1);
  assert.match(notice1 ?? "", /v0\.2\.0/);

  // Second check 1 hour later (3,600,000ms): should be throttled, 0 extra fetch calls
  currentTime += 3_600_000;
  const notice2 = await notifier.checkUpdate();
  assert.equal(checksCalled, 1);
  assert.equal(notice2, null);

  // Third check 25 hours later: executes fetcher again
  currentTime += 24 * 3_600_000;
  const notice3 = await notifier.checkUpdate();
  assert.equal(checksCalled, 2);
  assert.match(notice3 ?? "", /v0\.2\.0/);
});
