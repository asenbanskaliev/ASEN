/**
 * P23 pre-delivery gate: a mechanical, purely lexical guard over bash commands.
 * It recognizes review delivery actions (`git push` in any global-option
 * variant, `npm|pnpm|yarn publish`, `gh release create`, `gh pr merge`,
 * including nested `sh -c` payloads) and refuses them unless the current
 * review state grants delivery authority.
 *
 * Reference: gentle-shell lib/review-delivery-preflight.ts and
 * lib/destructive-command-guard.ts delivery recognition, reduced to the
 * bounded ASEN contract. Unlike the reference, no native CLI, Git, or
 * filesystem call happens here: `deliveryAuthorized` carries the verdict that
 * integration gathers. Recognition is evidence, not a sandbox: this is
 * deliberately not a shell interpreter. Malformed input fails open (returns
 * `undefined`), exactly like the reference guard's lexical boundary.
 */
import { shellCommandHeadIndex, tokenizeShellCommand, type ShellToken } from "../security/shell-command-syntax.js";

export interface DeliveryPreflightContext {
  /** Reserved for the later tool_call integration that resolves the delivery repository; recognition itself is text-only. */
  cwd: string;
  command: string;
  /** Whether native review has approved delivery for this candidate */
  deliveryAuthorized: boolean;
  signal?: AbortSignal | undefined;
}

export interface DeliveryPreflightResult {
  blocked: boolean;
  reason?: string;
}

const UNAUTHORIZED_PREFIX = "Review outcomes do not authorize delivery.";
const GIT_VALUE_OPTIONS = new Set(["-C", "-c", "--exec-path", "--git-dir", "--work-tree", "--namespace", "--super-prefix"]);
const PUBLISH_MANAGERS = new Set(["npm", "pnpm", "yarn"]);
const PUBLISH_VALUE_OPTIONS = new Set(["--registry", "--prefix", "--cache", "--userconfig", "--globalconfig", "--access", "--tag", "--workspace", "-w", "-C"]);
const GH_VALUE_OPTIONS = new Set(["-R", "--repo"]);
const NESTED_SHELLS = new Set(["sh", "bash", "zsh", "dash"]);
const MAX_NESTED_DEPTH = 3;

const executableName = (value: string): string => (value.split("/").at(-1) ?? value).replace(/\.exe$/i, "");

/** `git` global options come before the subcommand; only the first positional can be `push`. */
function recognizeGitPush(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === undefined) break;
    if (arg.startsWith("--")) {
      if (!arg.includes("=") && GIT_VALUE_OPTIONS.has(arg)) index++;
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      if (arg === "-C" || arg === "-c") index++;
      continue;
    }
    return arg === "push" ? "git push" : undefined;
  }
  return undefined;
}

function recognizePublish(name: string, args: readonly string[]): string | undefined {
  if (!PUBLISH_MANAGERS.has(name)) return undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === undefined || arg === "--") break;
    if (arg.startsWith("-")) {
      if (!arg.includes("=") && PUBLISH_VALUE_OPTIONS.has(arg.split("=")[0] ?? arg)) index++;
      continue;
    }
    return arg === "publish" ? `${name} publish` : undefined;
  }
  return undefined;
}

function recognizeGhDelivery(args: readonly string[]): string | undefined {
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === undefined) break;
    if (arg === "--") break;
    if (arg.startsWith("-")) {
      if (!arg.includes("=") && GH_VALUE_OPTIONS.has(arg.split("=")[0] ?? arg)) index++;
      continue;
    }
    positionals.push(arg);
  }
  if (positionals[0] === "release" && positionals[1] === "create") return "gh release create";
  if (positionals[0] === "pr" && positionals[1] === "merge") return "gh pr merge";
  return undefined;
}

/** Only a literal `-c`/`-lc`/`--command` payload of a known nested shell is rescanned. */
function nestedShellPayload(name: string, args: readonly string[]): string | undefined {
  if (!NESTED_SHELLS.has(name)) return undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === undefined || arg === "--") return undefined;
    if (arg === "--command" || /^-[a-zA-Z]*c$/.test(arg)) return args[index + 1];
  }
  return undefined;
}

function scanCommand(command: string, depth: number): string | undefined {
  if (depth > MAX_NESTED_DEPTH) return undefined;
  const segments: ShellToken[][] = [];
  let current: ShellToken[] = [];
  for (const token of tokenizeShellCommand(command)) {
    if (token.operator) {
      if (current.length) segments.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  if (current.length) segments.push(current);
  for (const segment of segments) {
    const cursor = shellCommandHeadIndex(segment);
    const head = segment[cursor];
    if (!head) continue;
    const name = executableName(head.value);
    const args = segment.slice(cursor + 1).map(token => token.value);
    if (name === "git") {
      const action = recognizeGitPush(args);
      if (action) return action;
    } else if (name === "gh") {
      const action = recognizeGhDelivery(args);
      if (action) return action;
    } else if (PUBLISH_MANAGERS.has(name)) {
      const action = recognizePublish(name, args);
      if (action) return action;
    } else {
      const payload = nestedShellPayload(name, args);
      if (payload !== undefined) {
        const action = scanCommand(payload, depth + 1);
        if (action) return action;
      }
    }
  }
  return undefined;
}

/**
 * Check if a shell command is a delivery action and whether it's permitted.
 * Returns undefined if the command is not a delivery action.
 * Returns {blocked: true, reason} if delivery is attempted without authorization.
 * Fail-open: returns undefined on parse errors.
 *
 * A delivery action with granted authority returns {blocked: false}; a delivery
 * action whose session was cancelled (aborted signal) fails closed because no
 * verdict may stand for a cancelled session.
 */
export function checkDeliveryPreflight(ctx: DeliveryPreflightContext): DeliveryPreflightResult | undefined {
  let action: string | undefined;
  try {
    action = scanCommand(ctx.command, 0);
  } catch {
    return undefined;
  }
  if (!action) return undefined;
  if (!ctx.deliveryAuthorized) {
    return { blocked: true, reason: `${UNAUTHORIZED_PREFIX} Detected delivery action "${action}"; complete the review flow and grant delivery authority before running this command. This delivery command was not run.` };
  }
  if (ctx.signal?.aborted) {
    return { blocked: true, reason: `Delivery preflight was cancelled. Detected delivery action "${action}"; the abort arrived before the command ran, so the verdict could not stand for this session. This delivery command was not run.` };
  }
  return { blocked: false };
}
