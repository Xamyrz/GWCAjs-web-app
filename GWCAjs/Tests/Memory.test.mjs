import assert from "node:assert/strict";

import { attachMemoryTools } from "../../assets/public/gw-hook/memory.js";
import {
  getMemoryLimit,
  isAligned,
  isValidPointer,
  isValidRange,
  readPointerSlot,
  readUtf8,
  readUtf16,
  readValue,
  withScopedAllocation,
  writePointerSlot,
  writeUtf8,
  writeUtf16,
  writeValue,
} from "../Include/GWCA/Utilities/Memory.js";

const memory = new WebAssembly.Memory({ initial: 2, maximum: 3 });
const freed = [];
let nextAllocation = 0x10000;

const runtime = {
  state: {
    memory,
    rawExports: {
      free(address) {
        freed.push(address);
      },
      malloc(size) {
        const address = (nextAllocation + 7) & ~7;
        nextAllocation = address + size;
        return address;
      },
    },
  },
};
const hook = {
  ...attachMemoryTools(runtime),
  memory,
};

const unavailableHook = attachMemoryTools({ state: { memory: null } });
assert.equal(unavailableHook.isValidRange(0, 1), false);
assert.equal(unavailableHook.isValidPointer(0x10000), false);

hook.writeI8(0x1000, -7);
hook.writeU8(0x1001, 250);
hook.writeI16(0x1002, -1234);
hook.writeU16(0x1004, 60000);
hook.writeI32(0x1008, -12345678);
hook.writeU32(0x100c, 0xfedcba98);
hook.writeF32(0x1010, 12.5);
hook.writeF64(0x1018, Math.PI);

assert.equal(hook.readI8(0x1000), -7);
assert.equal(hook.readU8(0x1001), 250);
assert.equal(hook.readI16(0x1002), -1234);
assert.equal(hook.readU16(0x1004), 60000);
assert.equal(hook.readI32(0x1008), -12345678);
assert.equal(hook.readU32(0x100c), 0xfedcba98);
assert.equal(hook.readF32(0x1010), 12.5);
assert.equal(hook.readF64(0x1018), Math.PI);

assert.equal(hook.isAligned(0x1000, 16), true);
assert.equal(hook.isAligned(0x1002, 4), false);
assert.equal(hook.isValidRange(0, memory.buffer.byteLength), true);
assert.equal(hook.isValidRange(memory.buffer.byteLength, 0), true);
assert.equal(hook.isValidRange(memory.buffer.byteLength, 1), false);
assert.throws(
  () => hook.readU32(memory.buffer.byteLength - 2),
  RangeError
);
assert.throws(() => hook.readBytes(-1, 4), RangeError);

hook.writePointerSlot(0x2000, 0x10000);
assert.equal(hook.readPointer(0x2000), 0x10000);
assert.equal(hook.readPointerSlot(0x2000), 0x10000);
hook.writePointerSlot(0x2000, 0, { allowNull: true });
assert.equal(hook.readPointerSlot(0x2000, { allowNull: true }), 0);
assert.throws(() => hook.readPointerSlot(0x2000), RangeError);
assert.throws(() => hook.writePointerSlot(0x2000, 0x10002), RangeError);

hook.writeUtf8(0x3000, "Grüße", 32);
assert.equal(hook.readUtf8(0x3000, 32), "Grüße");
assert.deepEqual(
  [...hook.readBytes(0x3000, 8)],
  [71, 114, 195, 188, 195, 159, 101, 0]
);
assert.throws(() => hook.writeUtf8(0x3000, "long", 4), RangeError);

hook.writeUtf16(0x3100, "A😀Z", 8);
assert.equal(hook.readUtf16(0x3100, 8), "A😀Z");
assert.equal(hook.readU16(0x3108), 0);
assert.throws(() => hook.writeUtf16(0x3100, "A😀Z", 4), RangeError);

const oldBuffer = memory.buffer;
const oldByteLength = oldBuffer.byteLength;
hook.writeU32(0x4000, 0x12345678);
memory.grow(1);
assert.notEqual(memory.buffer, oldBuffer);
hook.writeU32(oldByteLength + 16, 0x87654321);
assert.equal(hook.readU32(0x4000), 0x12345678);
assert.equal(hook.readU32(oldByteLength + 16), 0x87654321);
assert.equal(runtime.state.views.u8.buffer, memory.buffer);

const syncResult = hook.withAllocation(16, (address) => {
  hook.writeU32(address, 0x11223344);
  return hook.readU32(address);
});
assert.equal(syncResult, 0x11223344);
assert.equal(freed.length, 1);

const asyncResult = await hook.withAllocation(16, async (address) => {
  await Promise.resolve();
  hook.writeU16(address, 0xabcd);
  return hook.readU16(address);
});
assert.equal(asyncResult, 0xabcd);
assert.equal(freed.length, 2);

await assert.rejects(
  hook.withAllocation(8, async () => {
    throw new Error("expected async");
  }),
  /expected async/
);
assert.equal(freed.length, 3);

assert.throws(
  () =>
    hook.withAllocation(8, () => {
      throw new Error("expected");
    }),
  /expected/
);
assert.equal(freed.length, 4);

assert.equal(
  hook.withUtf8("temporary", (address, byteLength) => {
    assert.equal(byteLength, 10);
    return hook.readUtf8(address, byteLength);
  }),
  "temporary"
);
assert.equal(
  hook.withUtf16("buffer", (address, unitLength) => {
    assert.equal(unitLength, 7);
    return hook.readUtf16(address, unitLength);
  }),
  "buffer"
);
assert.equal(freed.length, 6);

const invalidAllocator = attachMemoryTools({
  state: {
    memory,
    rawExports: {
      free() {},
      malloc() {
        return memory.buffer.byteLength - 4;
      },
    },
  },
});
assert.throws(() => invalidAllocator.malloc(8), RangeError);

const state = {
  hook,
  memory: {
    get byteLength() {
      return memory.buffer.byteLength;
    },
    readType(type, address, options) {
      return runtime.readType(type, address, options);
    },
    writeType(type, address, value, options) {
      return runtime.writeType(type, address, value, options);
    },
  },
};

assert.equal(getMemoryLimit(state), memory.buffer.byteLength);
assert.equal(isAligned(0x1000, 8), true);
assert.equal(isValidRange(state, 0x1000, 8, 8), true);
assert.equal(isValidRange(state, 0x1002, 8, 8), false);
assert.equal(isValidPointer(state, 0x10000), true);
assert.equal(isValidPointer(state, 0x10002), false);

assert.equal(writeValue(state, "i16", 0x5000, -2222), true);
assert.equal(readValue(state, "i16", 0x5000), -2222);
assert.equal(
  readValue(state, "u32", memory.buffer.byteLength - 2),
  null
);
assert.equal(
  writeValue(state, "u32", memory.buffer.byteLength - 2, 1),
  false
);

assert.equal(writePointerSlot(state, 0x5100, 0x10000), true);
assert.equal(readPointerSlot(state, 0x5100), 0x10000);
hook.writePointer(0x5100, 0x10002);
assert.equal(readPointerSlot(state, 0x5100), null);
assert.equal(writePointerSlot(state, 0x5100, 0x10002), false);

assert.equal(writeUtf8(state, 0x5200, "shared", 16), true);
assert.equal(readUtf8(state, 0x5200, 16), "shared");
assert.equal(writeUtf8(state, 0x5200, "too long", 4), false);
assert.equal(writeUtf16(state, 0x5300, "shared", 16), true);
assert.equal(readUtf16(state, 0x5300, 16), "shared");
assert.equal(writeUtf16(state, 0x5300, "too long", 4), false);

const scopedResult = withScopedAllocation(state, 8, (address) => {
  assert.equal(writeValue(state, "u32", address, 77), true);
  return readValue(state, "u32", address);
});
assert.equal(scopedResult, 77);
assert.equal(freed.length, 7);

console.log("Memory safety and allocation checks passed");
