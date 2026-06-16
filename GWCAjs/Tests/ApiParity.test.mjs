import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildApiParityLedger,
  parseBrowserManager,
  parseNativeHeader,
  renderApiParityMarkdown,
} from "../Tools/lib/parity.mjs";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIRECTORY, "../..");

const nativeFixture = parseNativeHeader(
  `
  GWCA_API bool Travel(uint32_t map_id);
  GWCA_API bool Travel(uint32_t map_id, int district);
  `,
  "FixtureMgr"
);
assert.deepEqual(nativeFixture, [
  {
    exported: true,
    name: "Travel",
    signatures: [
      "bool Travel(uint32_t map_id)",
      "bool Travel(uint32_t map_id,int district)",
    ],
  },
]);

const browserFixture = parseBrowserManager(`
  return Object.freeze({
    Travel(mapId) {
      return mapId;
    },
    FlagAll: unsupported,
  });
`);
assert.equal(browserFixture.find((method) => method.name === "Travel").unavailable, false);
assert.equal(browserFixture.find((method) => method.name === "FlagAll").unavailable, true);

const ledger = await buildApiParityLedger({
  managerDirectory: resolve(ROOT, "gwca/Include/GWCA/Managers"),
  root: ROOT,
  sourceDirectory: resolve(ROOT, "GWCAjs/Source"),
});
const getMethod = (managerName, methodName) =>
  ledger.managers
    .find((manager) => manager.manager === managerName)
    ?.methods.find((method) => method.name === methodName);

assert.equal(getMethod("MapMgr", "GetMapID")?.state, "implemented");
assert.equal(getMethod("MapMgr", "GetCurrentMapInfo")?.state, "implemented");
assert.equal(getMethod("PlayerMgr", "SetActiveTitle")?.state, "implemented");
assert.equal(getMethod("PartyMgr", "FlagAll")?.state, "adapted");
assert.equal(getMethod("AgentMgr", "GetTargetId")?.state, "not-started");
assert.equal(getMethod("GameThreadMgr", "Enqueue")?.state, "not-started");
assert.equal(getMethod("MemoryMgr", "MemAlloc")?.state, "not-started");
assert.ok(
  ledger.managers
    .find((manager) => manager.manager === "MapMgr")
    ?.browserOnly.some((method) => method.name === "Describe")
);
assert.equal(
  ledger.totals.nativeMethods,
  ledger.totals.implemented +
    ledger.totals.adapted +
    ledger.totals.notStarted
);

const markdown = renderApiParityMarkdown(ledger);
assert.match(markdown, /# Generated GWCAjs API Parity/);
assert.match(markdown, /\| MapMgr \|/);

const generated = JSON.parse(
  await readFile(resolve(ROOT, "GWCAjs/Generated/api-parity.json"), "utf8")
).totals;
assert.deepEqual(generated, ledger.totals);

console.log("Generated API parity checks passed");
