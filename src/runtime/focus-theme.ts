import { Theme, type ThemeToken, type ThemeBg } from '@earendil-works/pi-coding-agent';
import { colorToHex } from '@earendil-works/pi-tui';

// WIP runtime palette; original design source is deferred from the portable checkpoint.
// Public tests compare these values with their explicitly derived regression oracle, not design acceptance.
const palettes = {
  dark: { text: '#E5EEF5', muted: '#A6B5C3', accent: '#83D7C0', surface: '#15232E', focus: '#153D35', border: '#526879', warning: '#E7BF7A', error: '#F0A4AA', info: '#A9CBE3' },
  light: { text: '#172B35', muted: '#405B69', accent: '#176B59', surface: '#EDF4F1', focus: '#D7EBE4', border: '#748B96', warning: '#805600', error: '#A52A3B', info: '#2D617B' },
} as const;
const backgroundTokens: readonly ThemeBg[] = [
  'selectedBg', 'searchMatchBg', 'userMessageBg', 'customMessageBg',
  'toolPendingBg', 'toolSuccessBg', 'toolErrorBg',
];

/** Current appearance only. Resolved copies do not retain terminal-default/faint metadata. */
export function createAsenFocusTheme(base: Theme): Theme {
  const resolved = base.colors;
  const colors = Object.fromEntries(
    (Object.keys(resolved) as ThemeToken[]).map(token => [token, colorToHex(resolved[token])]),
  ) as Record<ThemeToken, string>;
  const p = palettes[base.appearance];
  Object.assign(colors, {
    text: p.text, muted: p.muted, dim: p.muted, accent: p.accent,
    border: p.border, borderAccent: p.accent, customMessageBg: p.surface,
    selectedBg: p.focus, warning: p.warning, error: p.error, syntaxFunction: p.info,
  } satisfies Partial<Record<ThemeToken, string>>);
  const backgrounds = Object.fromEntries(backgroundTokens.map(token => [token, colors[token]])) as Record<ThemeBg, string>;
  return new Theme(colors, backgrounds, base.getColorMode(), { name: 'asen-focus', appearance: base.appearance });
}
