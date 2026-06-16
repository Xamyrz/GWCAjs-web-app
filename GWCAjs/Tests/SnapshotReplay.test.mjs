import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  runScenario,
  sanitizeSnapshot,
} from "../Tools/lib/snapshot.mjs";

const sanitized = sanitizeSnapshot({
  accountEmail: "private@example.com",
  characterName: "Private Character",
  contextAddress: 0x12340000,
  contextAddresses: ["0x12340000", 0x12340004],
  nested: {
    mapContextAddress: 0x12340000,
    token: "0123456789abcdef0123456789abcdef",
  },
  reason: "safe diagnostic",
});

assert.equal(sanitized.data.accountEmail, "<redacted>");
assert.equal(sanitized.data.characterName, "<redacted>");
assert.equal(sanitized.data.contextAddress, "@p1");
assert.deepEqual(sanitized.data.contextAddresses, ["@p1", "@p2"]);
assert.equal(sanitized.data.nested.mapContextAddress, "@p1");
assert.equal(sanitized.data.nested.token, "<redacted>");
assert.equal(sanitized.data.reason, "safe diagnostic");
assert.equal(sanitized.sanitization.pointerCount, 2);
assert.equal(sanitized.sanitization.redactedStringCount, 3);

const scenario = JSON.parse(
  await readFile(
    new URL("../Fixtures/Scenarios/sanitized-lifecycle.json", import.meta.url),
    "utf8"
  )
);
const result = runScenario(scenario);
assert.equal(result.failed, 0);
assert.equal(result.passed, 6);

console.log("Sanitized snapshot and replay scenario checks passed");
