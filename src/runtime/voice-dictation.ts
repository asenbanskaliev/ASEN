/**
 * P29 voice dictation core state machine.
 *
 * This is the legal-transition logic distilled from the Gentle Shell v4.8.0
 * `lib/voice-session.ts` guards (see odd/evidence/gentle-shell-v4.8.0-delta-reconciliation.md,
 * "REA Voice/Dictation deep analysis"). It owns no microphone, audio, worker,
 * install, or UI responsibility: those are host/integration concerns and they
 * drive this machine by calling the transition methods in order.
 */

/** Hard ceiling on a single dictation capture before the host must stop it. */
export const VOICE_MAX_RECORDING_MS = 120_000;
/** Worker transcripts longer than this are cut and flagged as truncated. */
export const VOICE_MAX_TRANSCRIPT_CHARS = 16_384;
/** Host budget for idle → recording handoff. */
export const VOICE_START_TIMEOUT_MS = 120_000;
/** Host budget for recording → finished transcription. */
export const VOICE_TRANSCRIBE_TIMEOUT_MS = 120_000;
/** Host grace window between a terminate request and a forced worker kill. */
export const VOICE_EXIT_GRACE_MS = 2_000;
/** Host lead time reserved before VOICE_MAX_RECORDING_MS to stop cleanly. */
export const VOICE_RECORDING_MARGIN_MS = 10_000;

export type VoiceDictationState = "idle" | "starting" | "recording" | "transcribing" | "finished";

export type VoiceErrorCode =
  | "invalid-state"
  | "unsupported"
  | "not-installed"
  | "no-speech"
  | "timeout"
  | "protocol"
  | "worker-exited"
  | "cancelled"
  | "invalid-request"
  | "node-version"
  | "runtime-invalid"
  | "model-invalid"
  | "runtime-load"
  | "model-load"
  | "no-input-device"
  | "unsupported-input"
  | "capture"
  | "empty-audio"
  | "decode"
  | "internal";

export interface VoiceTranscript {
  readonly text: string;
  readonly truncated: boolean;
}

export interface VoiceDictationSession {
  readonly state: VoiceDictationState;
  readonly startedAt?: number;
  readonly transcript?: VoiceTranscript;
  readonly error?: VoiceErrorCode;
}

export interface VoiceDictationConfig {
  maxRecordingMs?: number;
  maxTranscriptChars?: number;
  startTimeoutMs?: number;
  transcribeTimeoutMs?: number;
}

/**
 * Frozen, human-readable remediation text. Messages never carry file paths,
 * environment variables, native output, or engine details; the host adds none
 * of those to the message either.
 */
export const VOICE_ERROR_MESSAGES: ReadonlyMap<VoiceErrorCode, string> = Object.freeze(
  new Map<VoiceErrorCode, string>([
    ["invalid-state", "Voice dictation cannot run in its current state."],
    ["unsupported", "Voice dictation is not supported on this platform."],
    ["not-installed", "Voice dictation is not installed yet."],
    ["no-speech", "No speech was detected."],
    ["timeout", "Voice dictation timed out."],
    ["protocol", "Voice dictation received an unexpected response."],
    ["worker-exited", "The voice dictation worker exited unexpectedly."],
    ["cancelled", "Voice dictation was cancelled."],
    ["invalid-request", "Voice dictation received an invalid request."],
    ["node-version", "Voice dictation needs a newer Node.js runtime."],
    ["runtime-invalid", "The voice dictation runtime is not usable."],
    ["model-invalid", "The voice dictation model is not usable."],
    ["runtime-load", "The voice dictation runtime could not be loaded."],
    ["model-load", "The voice dictation model could not be loaded."],
    ["no-input-device", "No microphone input device was found."],
    ["unsupported-input", "The microphone input format is not supported."],
    ["capture", "Voice dictation could not capture audio."],
    ["empty-audio", "The captured audio was empty."],
    ["decode", "Voice dictation could not decode the audio."],
    ["internal", "Voice dictation failed unexpectedly."],
  ]),
);

/**
 * Per-operation legality, mirroring the reference guard matrix. Only the states
 * listed here may attempt the operation; every other attempt throws. reset is
 * the one recovery operation and is legal from every state, including idle.
 */
const OPERATION_TRANSITIONS = Object.freeze({
  start: Object.freeze(["idle"] as const),
  beginRecording: Object.freeze(["starting"] as const),
  beginTranscribing: Object.freeze(["recording"] as const),
  setTranscript: Object.freeze(["transcribing"] as const),
  // The reference matrix grants cancel/fail only to states holding live work.
  // Idle has nothing to cancel, and reporting "cancelled" there would mask a
  // host ordering bug instead of throwing; the exhaustive matrix governs over
  // the looser "any non-finished state" shorthand in the method contract.
  cancel: Object.freeze(["starting", "recording", "transcribing"] as const),
  fail: Object.freeze(["starting", "recording", "transcribing"] as const),
  reset: Object.freeze(["idle", "starting", "recording", "transcribing", "finished"] as const),
});

const OPERATION_TARGETS: Readonly<Record<keyof typeof OPERATION_TRANSITIONS, VoiceDictationState>> = Object.freeze({
  start: "starting",
  beginRecording: "recording",
  beginTranscribing: "transcribing",
  setTranscript: "finished",
  cancel: "finished",
  fail: "finished",
  reset: "idle",
});

type Operation = keyof typeof OPERATION_TRANSITIONS;

function positiveOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export class VoiceDictation {
  readonly #maxRecordingMs: number;
  readonly #maxTranscriptChars: number;
  readonly #startTimeoutMs: number;
  readonly #transcribeTimeoutMs: number;
  #state: VoiceDictationState = "idle";
  #startedAt: number | undefined;
  #transcript: VoiceTranscript | undefined;
  #error: VoiceErrorCode | undefined;

  constructor(config: VoiceDictationConfig = {}) {
    // Caps and budgets are normalized here so the host reads one authoritative
    // value; enforcing wall-clock deadlines stays a host responsibility.
    this.#maxRecordingMs = positiveOrDefault(config.maxRecordingMs, VOICE_MAX_RECORDING_MS);
    this.#maxTranscriptChars = positiveOrDefault(config.maxTranscriptChars, VOICE_MAX_TRANSCRIPT_CHARS);
    this.#startTimeoutMs = positiveOrDefault(config.startTimeoutMs, VOICE_START_TIMEOUT_MS);
    this.#transcribeTimeoutMs = positiveOrDefault(config.transcribeTimeoutMs, VOICE_TRANSCRIBE_TIMEOUT_MS);
  }

  /** idle → starting. */
  start(): VoiceDictationSession {
    this.#require("start");
    this.#clearOutcome();
    this.#state = "starting";
    return this.#snapshot();
  }

  /** starting → recording, anchoring the duration clock the host reads back. */
  beginRecording(): VoiceDictationSession {
    this.#require("beginRecording");
    this.#clearOutcome();
    this.#state = "recording";
    this.#startedAt = Date.now();
    return this.#snapshot();
  }

  /** recording → transcribing; the capture anchor is no longer live. */
  beginTranscribing(): VoiceDictationSession {
    this.#require("beginTranscribing");
    this.#startedAt = undefined;
    this.#state = "transcribing";
    return this.#snapshot();
  }

  /** transcribing → finished, applying the reference trim/slice/truncate rules. */
  setTranscript(text: string): VoiceDictationSession {
    this.#require("setTranscript");
    this.#clearOutcome();
    this.#state = "finished";
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) {
      this.#error = "no-speech";
    } else if (trimmed.length > this.#maxTranscriptChars) {
      this.#transcript = Object.freeze({ text: trimmed.slice(0, this.#maxTranscriptChars), truncated: true });
    } else {
      this.#transcript = Object.freeze({ text: trimmed, truncated: false });
    }
    return this.#snapshot();
  }

  /** starting/recording/transcribing → finished with the cancelled error. */
  cancel(): VoiceDictationSession {
    return this.#finish("cancelled", "cancel");
  }

  /** starting/recording/transcribing → finished with the reported error code. */
  fail(error: VoiceErrorCode): VoiceDictationSession {
    return this.#finish(error, "fail");
  }

  /** any state → idle, ready for a fresh dictation. */
  reset(): VoiceDictationSession {
    this.#require("reset");
    this.#clearOutcome();
    this.#state = "idle";
    return this.#snapshot();
  }

  getState(): VoiceDictationSession {
    return this.#snapshot();
  }

  isRecording(): boolean {
    return this.#state === "recording";
  }

  isFinished(): boolean {
    return this.#state === "finished";
  }

  /** The transcript only exists once a successful dictation has finished. */
  getTranscript(): VoiceTranscript | undefined {
    return this.#state === "finished" && this.#transcript ? Object.freeze({ ...this.#transcript }) : undefined;
  }

  /** The failure or cancellation code only exists once the run has finished. */
  getError(): VoiceErrorCode | undefined {
    return this.#state === "finished" ? this.#error : undefined;
  }

  /** The normalized recording ceiling, for host deadline scheduling. */
  getMaxRecordingMs(): number {
    return this.#maxRecordingMs;
  }

  /** The normalized transcript ceiling, for host truncation reporting. */
  getMaxTranscriptChars(): number {
    return this.#maxTranscriptChars;
  }

  /** The normalized start budget, for host deadline scheduling. */
  getStartTimeoutMs(): number {
    return this.#startTimeoutMs;
  }

  /** The normalized transcription budget, for host deadline scheduling. */
  getTranscribeTimeoutMs(): number {
    return this.#transcribeTimeoutMs;
  }

  #finish(error: VoiceErrorCode, operation: "cancel" | "fail"): VoiceDictationSession {
    this.#require(operation);
    this.#clearOutcome();
    this.#state = "finished";
    // Unknown codes only arrive from untyped hosts; never store a code that has
    // no frozen message, because the host renders the code directly.
    this.#error = VOICE_ERROR_MESSAGES.has(error) ? error : "internal";
    return this.#snapshot();
  }

  #require(operation: Operation): void {
    const from = this.#state;
    if ((OPERATION_TRANSITIONS[operation] as readonly string[]).includes(from)) return;
    throw new Error(`Invalid voice dictation state transition: ${from} → ${OPERATION_TARGETS[operation]}`);
  }

  #clearOutcome(): void {
    this.#startedAt = undefined;
    this.#transcript = undefined;
    this.#error = undefined;
  }

  #snapshot(): VoiceDictationSession {
    return Object.freeze({
      state: this.#state,
      ...(this.#startedAt === undefined ? {} : { startedAt: this.#startedAt }),
      ...(this.#transcript === undefined ? {} : { transcript: Object.freeze({ ...this.#transcript }) }),
      ...(this.#error === undefined ? {} : { error: this.#error }),
    });
  }
}
