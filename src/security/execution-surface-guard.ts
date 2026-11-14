/**
 * Execution surface guard — blocks external project-pane escalation.
 *
 * Port of Gentle Shell v4.8.0 lib/execution-surface-guard.ts.
 * A tool call that asks to open an external project pane is classified
 * by its own input property, never by the tool name, and is blocked in
 * every permission mode and in children. A value that is not a boolean
 * fails closed. The reason carries fixed fields only, never input paths
 * or content.
 */

export const EXTERNAL_FALLBACK_PROHIBITED = "asen.execution-surface.external-fallback-prohibited";

const PANE_PROPERTY = "openProjectPaneIfMissing";

export interface ExecutionSurfaceResult {
 block: true;
 reason: string;
}

export function evaluateExecutionSurface(toolName: string, input: unknown): ExecutionSurfaceResult | undefined {
 if (typeof input !== "object" || input === null || !Object.hasOwn(input as Record<string, unknown>, PANE_PROPERTY)) return undefined;
 if ((input as Record<string, unknown>)[PANE_PROPERTY] === false) return undefined;
 return {
  block: true,
  reason: `ASEN blocked an execution-surface escalation. code=${EXTERNAL_FALLBACK_PROHIBITED} tool=${toolName} property=${PANE_PROPERTY} next=Run the work through subagent tools or the native Agent in the current runtime; if neither is available, stop and tell the user.`,
 };
}
