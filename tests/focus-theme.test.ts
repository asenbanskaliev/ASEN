import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Theme, type ThemeToken, type ThemeBg } from '@earendil-works/pi-coding-agent';
import { colorToHex } from '@earendil-works/pi-tui';
import { createAsenFocusTheme } from '../src/runtime/focus-theme.js';

const backgrounds: ThemeBg[] = ['selectedBg', 'searchMatchBg', 'userMessageBg', 'customMessageBg', 'toolPendingBg', 'toolSuccessBg', 'toolErrorBg'];
const foregrounds = `accent border borderAccent borderMuted success error warning muted dim text thinkingText scrollbarTrack scrollbarThumb searchMatchText userMessageText customMessageText customMessageLabel toolTitle toolOutput mdHeading mdLink mdLinkUrl mdCode mdCodeBlock mdCodeBlockBorder mdQuote mdQuoteBorder mdHr mdListBullet toolDiffAdded toolDiffRemoved toolDiffContext syntaxComment syntaxKeyword syntaxFunction syntaxVariable syntaxString syntaxNumber syntaxType syntaxOperator syntaxPunctuation thinkingOff thinkingMinimal thinkingLow thinkingMedium thinkingHigh thinkingXhigh thinkingMax bashMode`.split(' ') as Exclude<ThemeToken, ThemeBg>[];
// Portable regression oracle: not the unpublished design approval asset.
const palette = JSON.parse(readFileSync(new URL('./fixtures/focus-palette-v1.json', import.meta.url), 'utf8'));
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const c = hex.slice(1).match(/../g)!.map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
    return c[0]! * .2126 + c[1]! * .7152 + c[2]! * .0722;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + .05) / (values[1]! + .05);
}
for (const appearance of ['dark', 'light'] as const) {
  test(`${appearance}: exact palette roles, full backgrounds, unrelated roles and base preserved`, () => {
    const fg = Object.fromEntries(foregrounds.map(k => [k, '#789ABC'])) as Record<Exclude<ThemeToken, ThemeBg>, string>;
    const bg = Object.fromEntries(backgrounds.map(k => [k, '#234567'])) as Record<ThemeBg, string>;
    const base = new Theme(fg, bg, 'truecolor', { name: 'fixture', appearance });
    const before = JSON.stringify(base.colors);
    Object.freeze(base);
    const result = createAsenFocusTheme(base);
    const p = palette[appearance];
    const overrides: Partial<Record<ThemeToken, string>> = {
      text: p.text, muted: p.muted, dim: p.muted, accent: p.accent,
      border: p.border, borderAccent: p.accent, customMessageBg: p.surface,
      selectedBg: p.focus, warning: p.warning, error: p.error, syntaxFunction: p.info,
    };
    assert.notEqual(result, base);
    assert.equal(result.name, 'asen-focus');
    assert.equal(result.appearance, appearance);
    assert.equal(result.getColorMode(), base.getColorMode());
    for (const token of Object.keys(base.colors) as ThemeToken[]) {
      assert.equal(colorToHex(result.colors[token]).toUpperCase(), (overrides[token] ?? colorToHex(base.colors[token])).toUpperCase(), token);
    }
    for (const token of Object.keys(overrides) as ThemeToken[]) {
      const hex = overrides[token]!;
      const channels = hex.slice(1).match(/../g)!.map(x => parseInt(x, 16)).join(';');
      assert.equal(backgrounds.includes(token as ThemeBg)
        ? result.getBgAnsi(token as ThemeBg)
        : result.getFgAnsi(token as Exclude<ThemeToken, ThemeBg>),
      `\x1b[${backgrounds.includes(token as ThemeBg) ? 48 : 38};2;${channels}m`);
    }
    for (const token of backgrounds) assert.match(result.getBgAnsi(token), /\x1b\[48;/);
    assert.equal(JSON.stringify(base.colors), before);
    assert.equal(base.name, 'fixture');
  });
  test(`${appearance}: defined text/surface and accent/focus pairs meet AA`, () => {
    const p = palette[appearance];
    for (const role of ['text', 'muted', 'accent', 'warning', 'error', 'info']) {
      assert.ok(contrast(p[role], p.surface) >= 4.5, role);
    }
    assert.ok(contrast(p.accent, p.focus) >= 4.5);
  });
}

test('factory contains no settings, session, model or theme-application side effects', () => {
  const source = readFileSync(new URL('../src/runtime/focus-theme.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(setTheme|setThemeInstance|SettingsManager|createAgentSession|process|writeFile|readFile)\b/);
  assert.doesNotMatch(source, /pi-coding-agent\//);
});
