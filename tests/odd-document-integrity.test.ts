import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// @ts-ignore Native ESM checker is also independently runnable without dependencies.
import { checkOddIntegrity } from '../scripts/check-odd-integrity.mjs';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/odd-integrity-baseline.json', import.meta.url), 'utf8'));
const documents = Object.fromEntries(Object.keys(baseline).map(path => [path, readFileSync(new URL('../' + path, import.meta.url), 'utf8')]));
const taskPath = 'odd/tasks/ui-functional-completion-and-acceptance.md';
const logPath = 'odd/tasks/ui-runtime-delivery-order.md';
test('ODD preserves historical headings, all 32 tasks and mandatory fields', () => {
  assert.equal(baseline[taskPath].headings.filter((h: string) => h.startsWith('## UFC-')).length, 32);
  assert.deepEqual(checkOddIntegrity(documents, baseline), []);
});
test('ODD rejects embedded truncation even if every heading survives', () => {
  assert.match(checkOddIntegrity({...documents, [taskPath]: documents[taskPath] + '\nWarning: truncated output'}, baseline).join('\n'), /embedded tool truncation/);
});
test('ODD rejects missing tasks despite equal file size', () => {
  const damaged = documents[taskPath]!.replace('## UFC-M1-03', '## XYZ-M1-03');
  assert.equal(damaged.length, documents[taskPath]!.length);
  assert.match(checkOddIntegrity({...documents, [taskPath]: damaged}, baseline).join('\n'), /missing historical heading/);
});
test('ODD rejects lost mandatory fields and historical log headings', () => {
  const damaged = documents[taskPath]!.replace('25. ', 'XX. ');
  assert.match(checkOddIntegrity({...documents, [taskPath]: damaged}, baseline).join('\n'), /missing field 25/);
  const log = baseline[logPath].logs[0];
  assert.ok(log);
  assert.match(checkOddIntegrity({...documents, [logPath]: documents[logPath]!.replace(log, '')}, baseline).join('\n'), /missing historical heading/);
});

test('ODD accepts Windows CRLF documents without losing structural checks', () => {
  const windows = Object.fromEntries(Object.entries(documents).map(([path, content]) => [path, content.replace(/\r?\n/g, '\r\n')]));
  assert.deepEqual(checkOddIntegrity(windows, baseline), []);
});
