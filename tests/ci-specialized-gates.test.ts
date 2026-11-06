import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

function block(workflow: string, name: string, endMarker: string | null): string {
  const start = workflow.indexOf(`${name}:`);
  const end = endMarker ? workflow.indexOf(endMarker) : workflow.length;
  return workflow.slice(start, end === -1 ? workflow.length : end);
}

test("specialized CI gates retain pull_request and exact branch admission", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

  const t07 = block(workflow, "t07-real-codegraph", "t12-integrated-security:");
  const security = block(workflow, "t12-integrated-security", "t12-real-pi-tui-dialog:");
  const tui = block(workflow, "t12-real-pi-tui-dialog", "  architecture:");

  for (const jobBlock of [t07, security, tui]) {
    assert.match(jobBlock, /github\.event_name == 'pull_request'/);
    assert.match(jobBlock, /github\.event\.pull_request\.head\.repo\.full_name == 'asenbanskaliev\/ASEN'/);
  }

  assert.match(t07, /github\.head_ref == 'feat\/t07-codegraph-completion'/);
  for (const jobBlock of [t07, security, tui]) {
    assert.match(jobBlock, /github\.head_ref == 'feat\/t12-integrated-acceptance'/);
    assert.match(jobBlock, /github\.head_ref == 'feat\/t12-integrated-acceptance-merge'/);
  }

  assert.match(workflow, /github\.head_ref == 'feat\/t05-independent-review'/);
  assert.doesNotMatch(workflow, /feat\/t05-independent-review-merge/);

  assert.doesNotMatch(workflow, /head_ref\.startsWith/);
  assert.doesNotMatch(workflow, /startsWith\([^)]*head_ref/);
  assert.doesNotMatch(workflow, /contains\([^)]*head_ref/);
  assert.doesNotMatch(workflow, /github\.head_ref == '[^']*[*][^']*'/);
  assert.doesNotMatch(workflow, /==\s*"[^"]+"/);
});

test("real Pi TUI receipts map each runner to its current platform artifact", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const tui = block(workflow, "t12-real-pi-tui-dialog", "  architecture:");

  assert.match(tui, /name: t12-real-pi-tui-dialog \(\$\{\{ matrix\.os \}\}\)/);
  assert.match(tui, /matrix:\r?\n\s+include:\r?\n\s+- os: ubuntu-24\.04\r?\n\s+platform: linux\r?\n\s+- os: windows-latest\r?\n\s+platform: win32\r?\n\s+- os: macos-latest\r?\n\s+platform: darwin/);
  assert.equal((tui.match(/^\s+- os: /gm) ?? []).length, 3);
  assert.match(tui, /runs-on: \$\{\{ matrix\.os \}\}/);
  assert.match(tui, /name: t10-real-pi-tui-\$\{\{ runner\.os \}\}-\$\{\{ github\.event\.pull_request\.head\.sha \}\}[\s\S]*path: t10-real-pi-tui-matrix-\$\{\{ matrix\.platform \}\}\.json\r?\n\s+if-no-files-found: error\r?\n\s+retention-days: 30/);
  assert.doesNotMatch(tui, /path: t10-real-pi-tui-matrix-\*\.json/);
});
