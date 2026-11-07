import test from "node:test";
import assert from "node:assert/strict";
import {redactSecrets} from "../src/security/redact.js";
test("redact secrets removes common credentials", () => {
 const input="token sk-live-1234567890abcdef Authorization: Bearer xyz Authorization: Basic abc password=secret AIzaabcdefghijklmnopqrstuvwxyz012345 npm_abcd1234567890 xoxb-1234567890-abcdef -----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----";
 const result=redactSecrets(input);
 assert.ok(!result.includes("sk-live-1234567890abcdef"));
 assert.ok(result.includes("[REDACTED_API_KEY]"));
 assert.ok(!result.includes("Authorization: Bearer xyz"));
 assert.ok(result.includes("[REDACTED_TOKEN]"));
});
test("plain identifiers beginning with sk are not redacted", () => {
 const result=redactSecrets("skipUntrustedLifecycleChecks skeletonConfigurationLoader");
 assert.equal(result,"skipUntrustedLifecycleChecks skeletonConfigurationLoader");
});
