import { Theme, type ThemeToken, type ThemeBg } from '@earendil-works/pi-coding-agent';
import { colorToHex } from '@earendil-works/pi-tui';

// Paleta oscura referenciada en el tema fijado del ODD T11 (v4.8.0).
// Una coincidencia de colores no acredita una pantalla Pi equivalente.
const palettes = {
  dark: { text: '#F6EFF3', muted: '#A78E9B', accent: '#F43888', surface: '#100A0F', focus: '#28121E', border: '#563040', warning: '#F2B86D', error: '#FF718F', info: '#A9C7EE' },
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
  if (base.appearance === 'dark') Object.assign(colors, {
    dim: '#76616B', borderMuted: '#2A1720', success: '#D2CBD0',
    borderAccent: '#FF4F9A', searchMatchBg: '#BF0F50',
    searchMatchText: '#F6EFF3', userMessageText: '#F6EFF3',
    customMessageText: '#F6EFF3', customMessageLabel: '#E0C27A',
    toolTitle: '#E0C27A', toolOutput: '#F6EFF3',
    mdHeading: '#E0C27A', mdLink: '#FF4F9A', mdLinkUrl: '#A78E9B',
    mdCode: '#E0C27A', mdQuoteBorder: '#BF0F50', mdListBullet: '#FF4F9A',
    toolDiffAdded: '#A9C7EE', toolDiffRemoved: '#FF718F',
    syntaxKeyword: '#BF0F50', syntaxFunction: '#C49BFF',
    syntaxString: '#E0C27A', syntaxNumber: '#D7A0B8',
    syntaxType: '#A9C7EE', syntaxOperator: '#FF4F9A',
    thinkingMedium: '#A9C7EE', thinkingHigh: '#C49BFF',
    thinkingXhigh: '#FF4F9A', thinkingMax: '#F43888',
    userMessageBg: '#2E0F1F', toolPendingBg: '#100A0F',
    toolSuccessBg: '#151316', toolErrorBg: '#261019',
  } satisfies Partial<Record<ThemeToken, string>>);
  const backgrounds = Object.fromEntries(backgroundTokens.map(token => [token, colors[token]])) as Record<ThemeBg, string>;
  return new Theme(colors, backgrounds, base.getColorMode(), { name: 'asen-focus', appearance: base.appearance });
}
