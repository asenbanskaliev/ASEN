import type { Theme } from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';

import type {T11HeaderPlacement,T11Surface} from "./t11-chrome-settings.js";
export type T11ChromePart="full"|"brand"|"facts"|"none";
/** Contenido único: top -> todo arriba, below-input -> abajo y split -> cada dato solo una vez. */
export function t11ChromeParts(mode:T11HeaderPlacement):Readonly<{top:T11ChromePart;bottom:T11ChromePart}>{
 switch(mode){
  case "top":return {top:"full",bottom:"none"};
  case "below-input":return {top:"none",bottom:"full"};
  case "split":return {top:"brand",bottom:"facts"};
 }
}
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
  theme: Pick<Theme,"fg"|"bold">&Partial<Pick<Theme,"bg">>,
  options:Readonly<{part?:T11ChromePart;surface?:T11Surface}>={},
): string[] {
  if (!Number.isFinite(width) || width < 1 || options.part==="none") return [];
  const cells = Math.floor(width);
  // The visible π brand is a non-colour cue; style only after sanitizing and fitting.
  const brand = truncateToWidth('π ASEN', cells, '…');
  const facts = [`v${plain(info.asenVersion)}`];
  if (info.piVersion) facts.push(`Pi ${plain(info.piVersion)}`);
  if (info.profile) facts.push(`profile ${plain(info.profile)}`);
  const part=options.part??"full";
  const detailText=facts.join(" · ");
  const remaining=cells-visibleWidth(brand);
  const detail=remaining>0?truncateToWidth(" · "+detailText,remaining,"…"):"";
  const line=part==="brand"?theme.bold(theme.fg("accent",brand)):
   part==="facts"?theme.fg("muted",truncateToWidth(detailText,cells,"…")):
   theme.bold(theme.fg("accent",brand))+(detail?theme.fg("muted",detail):"");
  return [options.surface==="tinted"&&typeof theme.bg==="function"?
   theme.bg("customMessageBg",line+" ".repeat(Math.max(0,cells-visibleWidth(line)))):line];
}
