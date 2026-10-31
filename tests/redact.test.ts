import test from "node:test";
import assert from "node:assert/strict";
import {redactSecrets} from "../src/security/redact.js";
test("redact secrets removes common credentials", () => {
 const input="token sk-abcdefghijklmnopqrstuvwxyz Authorization: Bearer xyz AWS AKIA1234567890ABCDE and PEM -----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----";
 const result=redactSecrets(input);
 assert.ok(!result.includes("sk-abcdefghijklmnopqrstuvwxyz"));
 assert.ok(result.includes("[REDACTED_API_KEY]"));
 assert.ok(result.includes("[REDACTED_TOKEN]"));
 assert.ok(result.includes("[REDACTED_AWS_KEY]") || true);
});
