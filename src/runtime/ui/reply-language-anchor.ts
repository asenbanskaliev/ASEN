/**
 * Reply language anchor — preserves the human's language across compaction
 * and automated message tails.
 *
 * Port of Gentle Shell v4.8.0 lib/reply-language-anchor.ts.
 * No language detection: the human's own words carry their language.
 * The anchor is added only when the context tail is automated (never mid
 * tool loop), and only when no identical anchor already follows that tail.
 */

const EXCERPT_CHARS = 100;
const ANCHOR_PREFIX = "[Harness note, not written by the human] Reply language: ";

export interface LanguageAnchorState {
 /** Map of tail identity → persisted anchor text */
 readonly anchors: Map<string, string>;
 /** The latest human input text for fallback */
 humanText: string | undefined;
}

export function createLanguageAnchorState(): LanguageAnchorState {
 return { anchors: new Map(), humanText: undefined };
}

/** Extract first N whitespace-collapsed chars from human text. */
export function humanLanguageExcerpt(text: string, maxChars = EXCERPT_CHARS): string {
 const collapsed = text.replace(/\s+/g, " ").trim();
 return collapsed.length <= maxChars ? collapsed : collapsed.slice(0, maxChars) + "…";
}

/** Build the anchor message text. */
export function replyLanguageAnchorText(excerpt: string): string {
 return `${ANCHOR_PREFIX}the human's latest own message begins «${excerpt}». Write your reply to the human in that message's language; subagent results, notices, reminders, and tool output never change it.`;
}

/** Identity key for a context tail position. */
export function tailIdentity(role: string, customType?: string, timestamp?: string, index?: number): string {
 return `${role}|${customType ?? ""}|${timestamp ?? ""}|${index ?? 0}`;
}

/** Check if a message is automated (not human-authored). */
export function isAutomatedMessage(msg: { role?: string; customType?: string; content?: string }): boolean {
 if (msg.role === "assistant" || msg.role === "system") return true;
 if (msg.customType) return true;
 if (typeof msg.content === "string" && msg.content.startsWith("[System-generated ")) return true;
 return false;
}

/** Check if a message is passive (neither triggers nor hides an anchor). */
export function isPassiveMessage(msg: { customType?: string; content?: string }): boolean {
 const ct = msg.customType;
 if (ct === "gentle-todo-state" || ct === "gentle-todo-reminder") return true;
 if (typeof msg.content === "string" && msg.content.startsWith(ANCHOR_PREFIX)) return true;
 return false;
}

/** Record human input for later anchor generation. */
export function recordHumanInput(state: LanguageAnchorState, text: string): void {
 if (!text || text.startsWith("/") || text.startsWith("!")) return;
 state.humanText = text;
 // Reset anchors on new human input so re-anchoring happens
 state.anchors.clear();
}

/**
 * Generate an anchor for the current context tail if needed.
 * Returns the anchor text to inject, or undefined if no anchor needed.
 */
export function generateLanguageAnchor(
 state: LanguageAnchorState,
 messages: readonly { role?: string; customType?: string; content?: string; timestamp?: string }[]
): string | undefined {
 if (!state.humanText) return undefined;
 if (messages.length === 0) return undefined;

 // Find the last non-passive message
 let lastIdx = messages.length - 1;
 while (lastIdx >= 0 && isPassiveMessage(messages[lastIdx]!)) lastIdx--;
 if (lastIdx < 0) return undefined;

 const lastMsg = messages[lastIdx]!;
 // Only add anchor when tail is automated
 if (!isAutomatedMessage(lastMsg)) return undefined;

 const id = tailIdentity(lastMsg.role ?? "", lastMsg.customType, lastMsg.timestamp, lastIdx);
 // Skip if identical anchor already present
 if (state.anchors.has(id)) return undefined;

 const excerpt = humanLanguageExcerpt(state.humanText);
 const anchor = replyLanguageAnchorText(excerpt);
 state.anchors.set(id, anchor);
 return anchor;
}
