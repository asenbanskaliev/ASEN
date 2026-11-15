import assert from "node:assert/strict";
import test from "node:test";
import {
  VOICE_ERROR_MESSAGES,
  VOICE_EXIT_GRACE_MS,
  VOICE_MAX_RECORDING_MS,
  VOICE_MAX_TRANSCRIPT_CHARS,
  VOICE_RECORDING_MARGIN_MS,
  VOICE_START_TIMEOUT_MS,
  VOICE_TRANSCRIBE_TIMEOUT_MS,
  VoiceDictation,
  type VoiceDictationState,
  type VoiceErrorCode,
} from "../src/runtime/ui/voice-dictation.js";

const ALL_CODES = [
  "invalid-state",
  "unsupported",
  "not-installed",
  "no-speech",
  "timeout",
  "protocol",
  "worker-exited",
  "cancelled",
  "invalid-request",
  "node-version",
  "runtime-invalid",
  "model-invalid",
  "runtime-load",
  "model-load",
  "no-input-device",
  "unsupported-input",
  "capture",
  "empty-audio",
  "decode",
  "internal",
] as const satisfies readonly VoiceErrorCode[];

// Compile-time proof that the list above covers every member of the union, so a
// new error code cannot ship without a message test.
type UnlistedCodes = Exclude<VoiceErrorCode, (typeof ALL_CODES)[number]>;
const everyCodeListed: UnlistedCodes extends never ? true : false = true;

// Walk the machine to the requested state using only legal transitions.
function advanceTo(state: VoiceDictationState, options?: { text?: string }): VoiceDictation {
  const voice = new VoiceDictation();
  if (state === "idle") return voice;
  voice.start();
  if (state === "starting") return voice;
  voice.beginRecording();
  if (state === "recording") return voice;
  voice.beginTranscribing();
  if (state === "transcribing") return voice;
  voice.setTranscript(options?.text ?? "hello");
  return voice;
}

test("exports the reference timing and size constants", () => {
  assert.equal(VOICE_MAX_RECORDING_MS, 120_000);
  assert.equal(VOICE_MAX_TRANSCRIPT_CHARS, 16_384);
  assert.equal(VOICE_START_TIMEOUT_MS, 120_000);
  assert.equal(VOICE_TRANSCRIBE_TIMEOUT_MS, 120_000);
  assert.equal(VOICE_EXIT_GRACE_MS, 2_000);
  assert.equal(VOICE_RECORDING_MARGIN_MS, 10_000);
});

test("walks the canonical path idle to finished", () => {
  const voice = new VoiceDictation();
  assert.deepEqual(voice.getState(), { state: "idle" });
  assert.equal(voice.start().state, "starting");
  assert.equal(voice.beginRecording().state, "recording");
  assert.equal(voice.beginTranscribing().state, "transcribing");
  const finished = voice.setTranscript("  shipped it  ");
  assert.equal(finished.state, "finished");
  assert.deepEqual(finished.transcript, { text: "shipped it", truncated: false });
  assert.equal(finished.error, undefined);
  assert.equal(voice.getTranscript()?.text, "shipped it");
  assert.equal(voice.getError(), undefined);
});

test("tracks recording duration through startedAt", () => {
  const voice = new VoiceDictation();
  assert.equal(voice.getState().startedAt, undefined);
  voice.start();
  assert.equal(voice.getState().startedAt, undefined);
  const before = Date.now();
  const recording = voice.beginRecording();
  const after = Date.now();
  assert.equal(typeof recording.startedAt, "number");
  assert.ok((recording.startedAt as number) >= before);
  assert.ok((recording.startedAt as number) <= after);
  voice.beginTranscribing();
  voice.setTranscript("text");
  assert.equal(voice.getState().startedAt, undefined, "finished clears the live duration anchor");
  voice.reset();
  assert.equal(voice.getState().startedAt, undefined);
});

test("setTranscript truncates at maxTranscriptChars and flags it", () => {
  const voice = new VoiceDictation();
  voice.start();
  voice.beginRecording();
  voice.beginTranscribing();
  const spoken = "a".repeat(VOICE_MAX_TRANSCRIPT_CHARS + 500);
  const finished = voice.setTranscript(spoken);
  assert.equal(finished.transcript?.text.length, VOICE_MAX_TRANSCRIPT_CHARS);
  assert.equal(finished.transcript?.text, "a".repeat(VOICE_MAX_TRANSCRIPT_CHARS));
  assert.equal(finished.transcript?.truncated, true);
});

test("a transcript at exactly maxTranscriptChars is not truncated", () => {
  const exact = "b".repeat(VOICE_MAX_TRANSCRIPT_CHARS);
  assert.deepEqual(advanceTo("transcribing").setTranscript(exact).transcript, { text: exact, truncated: false });
});

test("empty or whitespace transcripts finish with no-speech", () => {
  for (const spoken of ["", "   ", "\n\t "]) {
    const voice = advanceTo("transcribing");
    const finished = voice.setTranscript(spoken);
    assert.equal(finished.state, "finished");
    assert.equal(finished.error, "no-speech");
    assert.equal(finished.transcript, undefined);
    assert.equal(voice.getTranscript(), undefined);
    assert.equal(voice.getError(), "no-speech");
  }
});

test("honours config overrides for transcript size", () => {
  const voice = new VoiceDictation({ maxTranscriptChars: 8 });
  voice.start();
  voice.beginRecording();
  voice.beginTranscribing();
  const finished = voice.setTranscript("abcdefghij");
  assert.deepEqual(finished.transcript, { text: "abcdefgh", truncated: true });
});

test("ignores non-positive or non-finite config overrides", () => {
  for (const maxTranscriptChars of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const voice = new VoiceDictation({ maxTranscriptChars });
    voice.start();
    voice.beginRecording();
    voice.beginTranscribing();
    const spoken = "z".repeat(VOICE_MAX_TRANSCRIPT_CHARS + 10);
    assert.equal(voice.setTranscript(spoken).transcript?.text.length, VOICE_MAX_TRANSCRIPT_CHARS, String(maxTranscriptChars));
  }
  const timed = new VoiceDictation({ maxRecordingMs: 0, startTimeoutMs: -5, transcribeTimeoutMs: Number.NaN });
  assert.equal(timed.start().state, "starting");
});

test("cancel finishes any live state with the cancelled error", () => {
  for (const state of ["starting", "recording", "transcribing"] as VoiceDictationState[]) {
    const voice = advanceTo(state);
    const finished = voice.cancel();
    assert.equal(finished.state, "finished", state);
    assert.equal(finished.error, "cancelled", state);
    assert.equal(finished.transcript, undefined, state);
    assert.equal(voice.isFinished(), true, state);
    assert.equal(voice.isRecording(), false, state);
    assert.equal(voice.getTranscript(), undefined, state);
  }
});

test("fail finishes any live state with the supplied error code", () => {
  for (const state of ["starting", "recording", "transcribing"] as VoiceDictationState[]) {
    const voice = advanceTo(state);
    const finished = voice.fail("timeout");
    assert.equal(finished.state, "finished", state);
    assert.equal(finished.error, "timeout", state);
    assert.equal(finished.transcript, undefined, state);
  }
  const failed = advanceTo("recording").fail("worker-exited");
  assert.equal(failed.error, "worker-exited");
});

test("reset returns the machine to idle from any state", () => {
  for (const state of ["idle", "starting", "recording", "transcribing", "finished"] as VoiceDictationState[]) {
    const voice = advanceTo(state, { text: "spoken" });
    const idle = voice.reset();
    assert.deepEqual(idle, { state: "idle" }, state);
    assert.equal(voice.getState().state, "idle", state);
    assert.equal(voice.getTranscript(), undefined, state);
    assert.equal(voice.getError(), undefined, state);
    assert.equal(voice.isRecording(), false, state);
    assert.equal(voice.isFinished(), false, state);
  }
});

test("a reset machine can run the canonical path again", () => {
  const voice = advanceTo("finished");
  voice.reset();
  assert.equal(voice.start().state, "starting");
  assert.equal(voice.beginRecording().state, "recording");
  assert.equal(voice.beginTranscribing().state, "transcribing");
  assert.equal(voice.setTranscript("again").transcript?.text, "again");
});

test("illegal transitions throw the descriptive matrix error", () => {
  const cases: [VoiceDictationState, "start" | "beginRecording" | "beginTranscribing" | "cancel" | "fail", string][] = [
    ["starting", "start", "starting → starting"],
    ["recording", "start", "recording → starting"],
    ["transcribing", "start", "transcribing → starting"],
    ["finished", "start", "finished → starting"],
    ["idle", "beginRecording", "idle → recording"],
    ["recording", "beginRecording", "recording → recording"],
    ["transcribing", "beginRecording", "transcribing → recording"],
    ["finished", "beginRecording", "finished → recording"],
    ["idle", "beginTranscribing", "idle → transcribing"],
    ["starting", "beginTranscribing", "starting → transcribing"],
    ["transcribing", "beginTranscribing", "transcribing → transcribing"],
    ["finished", "beginTranscribing", "finished → transcribing"],
    ["idle", "cancel", "idle → finished"],
    ["finished", "cancel", "finished → finished"],
    ["idle", "fail", "idle → finished"],
    ["finished", "fail", "finished → finished"],
  ];
  for (const [from, operation, label] of cases) {
    const voice = advanceTo(from);
    const attempt = () => {
      if (operation === "fail") return voice.fail("internal");
      if (operation === "cancel") return voice.cancel();
      return voice[operation]();
    };
    assert.throws(
      attempt,
      (error: unknown) => {
        assert.ok(error instanceof Error, label);
        assert.equal(error.message, `Invalid voice dictation state transition: ${label}`);
        return true;
      },
      `${from}.${operation} must throw`,
    );
    assert.equal(voice.getState().state, from, `${label} leaves the machine unchanged`);
  }
});

test("setTranscript is only legal while transcribing", () => {
  for (const from of ["idle", "starting", "recording", "finished"] as VoiceDictationState[]) {
    const voice = advanceTo(from);
    assert.throws(
      () => voice.setTranscript("too early"),
      (error: unknown) => {
        assert.equal((error as Error).message, `Invalid voice dictation state transition: ${from} → finished`);
        return true;
      },
      `${from}.setTranscript must throw`,
    );
    assert.equal(voice.getState().state, from, `${from}.setTranscript leaves the machine unchanged`);
  }
});

test("accessors report liveness only in their own states", () => {
  const voice = new VoiceDictation();
  assert.equal(voice.isRecording(), false);
  assert.equal(voice.isFinished(), false);
  voice.start();
  assert.equal(voice.isRecording(), false);
  voice.beginRecording();
  assert.equal(voice.isRecording(), true);
  voice.beginTranscribing();
  assert.equal(voice.isRecording(), false);
  voice.setTranscript("done");
  assert.equal(voice.isFinished(), true);
});

test("getState and returned sessions are frozen copies that cannot mutate the machine", () => {
  const voice = advanceTo("transcribing");
  assert.ok(Object.isFrozen(voice.getState()));
  const finished = voice.setTranscript("frozen transcript");
  assert.ok(Object.isFrozen(finished));
  assert.ok(Object.isFrozen(finished.transcript));
  assert.throws(() => {
    (finished as unknown as { state: string }).state = "recording";
  }, TypeError);
  assert.throws(() => {
    (finished.transcript as unknown as { text: string }).text = "tampered";
  }, TypeError);
  assert.equal(voice.getState().state, "finished");
  assert.equal(voice.getTranscript()?.text, "frozen transcript");
  assert.ok(Object.isFrozen(voice.getTranscript()));
  assert.notEqual(voice.getState(), finished, "each read returns a fresh copy");
});

test("exposes one frozen human-readable message for every error code", () => {
  assert.equal(everyCodeListed, true);
  assert.ok(VOICE_ERROR_MESSAGES instanceof Map);
  assert.ok(Object.isFrozen(VOICE_ERROR_MESSAGES));
  assert.equal(VOICE_ERROR_MESSAGES.size, ALL_CODES.length);
  for (const code of ALL_CODES) {
    const message = VOICE_ERROR_MESSAGES.get(code);
    assert.equal(typeof message, "string", code);
    assert.ok(message && message.length > 0, code);
    assert.equal(message, message.trim(), code);
    assert.doesNotMatch(message ?? "", /[\\/]/, code);
    assert.doesNotMatch(message ?? "", /\b[A-Z][A-Z0-9_]{2,}\b/, code);
    assert.doesNotMatch(message ?? "", /\b(env|home|temp|path|lang|pulse)\b/i, code);
  }
});

test("a non-string transcript from an untyped host is treated as no speech", () => {
  const voice = advanceTo("transcribing");
  const finished = voice.setTranscript(undefined as unknown as string);
  assert.equal(finished.state, "finished");
  assert.equal(finished.error, "no-speech");
});

test("an unknown failure code from an untyped host is recorded as internal", () => {
  const voice = advanceTo("recording");
  assert.equal(voice.fail("not-a-real-code" as VoiceErrorCode).error, "internal");
});

test("exposes the normalized config ceilings for host scheduling", () => {
  const defaults = new VoiceDictation();
  assert.equal(defaults.getMaxRecordingMs(), VOICE_MAX_RECORDING_MS);
  assert.equal(defaults.getMaxTranscriptChars(), VOICE_MAX_TRANSCRIPT_CHARS);
  assert.equal(defaults.getStartTimeoutMs(), VOICE_START_TIMEOUT_MS);
  assert.equal(defaults.getTranscribeTimeoutMs(), VOICE_TRANSCRIBE_TIMEOUT_MS);
  const custom = new VoiceDictation({ maxRecordingMs: 30000, maxTranscriptChars: 64, startTimeoutMs: 5000, transcribeTimeoutMs: 9000 });
  assert.equal(custom.getMaxRecordingMs(), 30_000);
  assert.equal(custom.getMaxTranscriptChars(), 64);
  assert.equal(custom.getStartTimeoutMs(), 5_000);
  assert.equal(custom.getTranscribeTimeoutMs(), 9_000);
});
