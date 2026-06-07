import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createCaptureRuntime } from "../../assets/public/gw-hook/capture.js";

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

function readTableLimits(bytes) {
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
      return { maximum: maximum.value, minimum: minimum.value };
    }
    cursor = payloadEnd;
  }
  throw new Error("WASM table section was not found");
}

const source = new Uint8Array(
  await readFile(
    new URL("../../extracted/38615/Gw.wasm", import.meta.url)
  )
);
const capture = createCaptureRuntime({
  console,
  localStorage: null,
  Module: null,
});
const patched = capture.prepareWasmSource(source);

assert.deepEqual(readTableLimits(source), {
  maximum: 4676,
  minimum: 4676,
});
assert.deepEqual(readTableLimits(patched), {
  maximum: 4740,
  minimum: 4676,
});
assert.equal(WebAssembly.validate(patched), true);

console.log("Build 38615 callback-table reserve checks passed");
