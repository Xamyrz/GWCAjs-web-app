import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createCaptureRuntime } from "../../assets/public/gw-hook/capture.js";
import {
  BUILD_38615_JSPI_ID,
  BUILD_38615_WASM_ID,
  getBuildManifest,
} from "../../assets/public/gw-runtime/build-manifests.js";

function readVarU32(bytes, offset) {
  let result = 0;
  let shift = 0;
  let cursor = offset;
  while (cursor < bytes.length) {
    const byte = bytes[cursor];
    result |= (byte & 0x7f) << shift;
    cursor += 1;
    if ((byte & 0x80) === 0) {
      return { next: cursor, value: result >>> 0 };
    }
    shift += 7;
  }
  throw new Error("Invalid unsigned LEB128 value");
}

function findTableLimits(bytes) {
  let cursor = 8;
  while (cursor < bytes.length) {
    const sectionId = bytes[cursor];
    const size = readVarU32(bytes, cursor + 1);
    const payloadEnd = size.next + size.value;
    if (sectionId === 4) {
      const count = readVarU32(bytes, size.next);
      assert.equal(count.value, 1);
      assert.equal(bytes[count.next], 0x70);
      const flags = readVarU32(bytes, count.next + 1);
      assert.equal(flags.value, 1);
      const minimum = readVarU32(bytes, flags.next);
      const maximum = readVarU32(bytes, minimum.next);
      return {
        maximum: maximum.value,
        maximumOffset: minimum.next,
        minimum: minimum.value,
      };
    }
    cursor = payloadEnd;
  }
  throw new Error("WASM table section was not found");
}

function getExportNames(bytes) {
  const module = new WebAssembly.Module(bytes);
  return new Set(WebAssembly.Module.exports(module).map((entry) => entry.name));
}

function replaceBuildId(bytes, buildId) {
  const next = new Uint8Array(bytes);
  const buildIdBytes = Buffer.from(buildId, "hex");
  const offset = Buffer.from(next).indexOf(buildIdBytes);
  assert.notEqual(offset, -1, "build_id payload should exist");
  next[offset] ^= 0xff;
  return next;
}

function makeTableMismatch(bytes) {
  const next = new Uint8Array(bytes);
  const table = findTableLimits(next);
  assert.equal(table.maximum, 4676);
  next[table.maximumOffset] += 1;
  assert.equal(findTableLimits(next).maximum, 4677);
  assert.equal(WebAssembly.validate(next), true);
  return next;
}

const jspiSource = new Uint8Array(
  await readFile(
    new URL("../../extracted/38615/Gw.jspi.wasm", import.meta.url)
  )
);
const standardSource = new Uint8Array(
  await readFile(
    new URL("../../extracted/38615/Gw.wasm", import.meta.url)
  )
);
const capture = createCaptureRuntime({
  console,
  localStorage: null,
  Module: null,
});

const jspiManifest = getBuildManifest(BUILD_38615_JSPI_ID);
assert.ok(jspiManifest);
assert.equal(jspiManifest.variant, "jspi");
assert.equal(jspiManifest.exportPatches.length, 32);

const patchedJspi = capture.prepareWasmSource(jspiSource);
assert.equal(WebAssembly.validate(patchedJspi), true);
assert.equal(findTableLimits(patchedJspi).minimum, 4676);
assert.equal(findTableLimits(patchedJspi).maximum, 4740);
const patchedJspiExports = getExportNames(patchedJspi);
for (const patch of jspiManifest.exportPatches) {
  assert.equal(
    patchedJspiExports.has(patch.name),
    true,
    "missing manifest export " + patch.name
  );
}
assert.deepEqual(capture.getPatchStatus(), {
  actionPatchesEnabled: true,
  buildId: BUILD_38615_JSPI_ID,
  callbackTableReserve: 64,
  exportPatchCount: 32,
  gameBuild: 38615,
  reason: "known-build",
  status: "patched",
  variant: "jspi",
});

const standardManifest = getBuildManifest(BUILD_38615_WASM_ID);
assert.ok(standardManifest);
assert.equal(standardManifest.exportPatches.length, 0);
const patchedStandard = capture.prepareWasmSource(standardSource);
assert.equal(findTableLimits(patchedStandard).maximum, 4740);
assert.equal(
  Array.from(getExportNames(patchedStandard)).some((name) =>
    name.startsWith("__gwca_")
  ),
  false
);
assert.equal(capture.getPatchStatus().actionPatchesEnabled, false);
assert.equal(capture.getPatchStatus().variant, "standard");

const unknownSource = replaceBuildId(jspiSource, BUILD_38615_JSPI_ID);
const unknownResult = capture.prepareWasmSource(unknownSource);
assert.equal(unknownResult, unknownSource);
assert.equal(findTableLimits(unknownResult).maximum, 4676);
assert.equal(
  Array.from(getExportNames(unknownResult)).some((name) =>
    name.startsWith("__gwca_")
  ),
  false
);
assert.equal(capture.getPatchStatus().reason, "unsupported-build");
assert.equal(capture.getPatchStatus().actionPatchesEnabled, false);

const mismatchedSource = makeTableMismatch(jspiSource);
const mismatchedResult = capture.prepareWasmSource(mismatchedSource);
assert.equal(mismatchedResult, mismatchedSource);
assert.equal(findTableLimits(mismatchedResult).maximum, 4677);
assert.equal(capture.getPatchStatus().reason, "manifest-mismatch");
assert.equal(capture.getPatchStatus().actionPatchesEnabled, false);
assert.match(capture.getPatchStatus().errors.join("\n"), /table\.maximum/);

console.log("Build manifest and fail-closed patch checks passed");
