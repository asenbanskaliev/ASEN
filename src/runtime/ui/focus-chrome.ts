import type { Theme } from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';

function plain(value: string): string {
  const sevenBit = value.replace(/[\u0090\u0098\u009b-\u009f]/g,
    control => `\x1b${String.fromCharCode(control.charCodeAt(0) - 0x40)}`);
  return stripTerminalSequences(sevenBit)
    .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/** One fact once; metadata acquisition and existing status renderers stay with the caller. */
export function renderAsenFocusHeader(
  info: { asenVersion: string; piVersion?: string; profile?: string },
  width: number,
  theme: Theme,
): string[] {
  if (!Number.isFinite(width) || width < 1) return [];
  const cells = Math.floor(width);
  // The visible π brand is a non-colour cue; style only after sanitizing and fitting.
  const brand = truncateToWidth('π ASEN', cells, '…');
  const facts = [`v${plain(info.asenVersion)}`];
  if (info.piVersion) facts.push(`Pi ${plain(info.piVersion)}`);
  if (info.profile) facts.push(`profile ${plain(info.profile)}`);
  const remaining = cells - visibleWidth(brand);
  const detail = remaining > 0 ? truncateToWidth(` · ${facts.join(' · ')}`, remaining, '…') : '';
  return [theme.bold(theme.fg('accent', brand)) + (detail ? theme.fg('muted', detail) : '')];
}
