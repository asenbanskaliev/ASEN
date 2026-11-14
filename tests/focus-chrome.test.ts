import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';
import test from 'node:test';
import { Theme } from '@earendil-works/pi-coding-agent';
import { visibleWidth } from '@earendil-works/pi-tui';
import { renderAsenFocusHeader } from '../src/runtime/focus-chrome.js';

// The renderer needs only public fg/bold methods; the real SDK instance exercises ANSI output.
const fgKeys = 'accent border borderAccent borderMuted success error warning muted dim text thinkingText scrollbarTrack scrollbarThumb searchMatchText userMessageText customMessageText customMessageLabel toolTitle toolOutput mdHeading mdLink mdLinkUrl mdCode mdCodeBlock mdCodeBlockBorder mdQuote mdQuoteBorder mdHr mdListBullet toolDiffAdded toolDiffRemoved toolDiffContext syntaxComment syntaxKeyword syntaxFunction syntaxVariable syntaxString syntaxNumber syntaxType syntaxOperator syntaxPunctuation thinkingOff thinkingMinimal thinkingLow thinkingMedium thinkingHigh thinkingXhigh thinkingMax bashMode'.split(' ');
const bgKeys = 'selectedBg searchMatchBg userMessageBg customMessageBg toolPendingBg toolSuccessBg toolErrorBg'.split(' ');
const theme = new Theme(
  { ...Object.fromEntries(fgKeys.map(k => [k, '#A6B5C3'])), accent: '#83D7C0' } as ConstructorParameters<typeof Theme>[0],
  Object.fromEntries(bgKeys.map(k => [k, '#15232E'])) as ConstructorParameters<typeof Theme>[1],
  'truecolor', { appearance: 'dark' });
test('compact brand and caller-provided versions/profile, no fabricated status', () => {
  const lines = renderAsenFocusHeader({ asenVersion: '0.1.0', piVersion: '1.2.0', profile: 'development' }, 120, theme);
  assert.equal(lines.length, 1);
  assert.equal(stripVTControlCharacters(lines[0]!), 'π ASEN · v0.1.0 · Pi 1.2.0 · profile development');
  assert.match(lines[0]!, /\x1b\[38;2;131;215;192m/);
  assert.doesNotMatch(lines.join(''), /model|cost|MCP|agents|connected/i);
});
test('optional metadata is not guessed', () => {
  assert.equal(stripVTControlCharacters(renderAsenFocusHeader({ asenVersion: 'test' }, 80, theme)[0]!), 'π ASEN · vtest');
});
test('positive narrow widths, fractional and invalid widths, Unicode stay cell-bounded', () => {
  for (const width of [1, 2, 3, 5, 6, 7, 12, 20, 40, 80, 140, 180, 3.8]) {
    const lines = renderAsenFocusHeader({ asenVersion: '版本👩‍💻é', piVersion: '1.2.0', profile: '日本語 🧭'.repeat(30) }, width, theme);
    assert.equal(lines.length, 1);
    assert.ok(visibleWidth(lines[0]!) <= Math.floor(width), `${width}: ${lines[0]}`);
    assert.doesNotMatch(stripVTControlCharacters(lines[0]!), /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u);
  }
  for (const width of [0, -1, NaN, Infinity]) assert.deepEqual(renderAsenFocusHeader({ asenVersion: 'x' }, width, theme), []);
});
test('terminal escapes, newlines, C1 and bidi controls are removed before styling', () => {
  const dirty = '\x1b[31mred\x1b[0m\x1b]52;c;payload\x07\n\r\t\x9b31m\u202Eevil\u2066';
  const plain = stripVTControlCharacters(renderAsenFocusHeader({ asenVersion: dirty, piVersion: dirty, profile: dirty }, 180, theme)[0]!);
  assert.doesNotMatch(plain, /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/);
  assert.doesNotMatch(plain, /payload|52;c|31m/);
});
test('header is deterministic and never mutates metadata or performs I/O', () => {
  const info = Object.freeze({ asenVersion: '0.1.0', profile: 'focus' });
  assert.deepEqual(renderAsenFocusHeader(info, 80, theme), renderAsenFocusHeader(info, 80, theme));
  const source = readFileSync(new URL('../src/runtime/focus-chrome.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(process|readFile|writeFile|setTheme|SettingsManager|createAgentSession)\b/);
});
