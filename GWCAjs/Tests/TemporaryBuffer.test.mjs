import assert from "node:assert/strict";

import { createTemporaryBufferPool } from "../Include/GWCA/Utilities/TemporaryBuffer.js";
import { createMapInternals } from "../Source/MapMgrInternals.js";

const buffer = new ArrayBuffer(0x30000);
const bytes = new Uint8Array(buffer);
const view = new DataView(buffer);
const freed = [];
let allocations = 0;
let nextAddress = 0x10000;

const state = {
  hook: {
    memory: { buffer },
    readF32(address) {
      return view.getFloat32(address, true);
    },
    readUtf8(address, maxLength) {
      let end = address;
      while (end < address + maxLength && bytes[end] !== 0) {
        end += 1;
      }
      return new TextDecoder().decode(bytes.subarray(address, end));
    },
    readUtf16(address, maxUnits) {
      const chars = [];
      for (let index = 0; index < maxUnits; index += 1) {
        const codeUnit = view.getUint16(address + index * 2, true);
        if (!codeUnit) {
          break;
        }
        chars.push(codeUnit);
      }
      return String.fromCharCode(...chars);
    },
    writeBytes(address, value) {
      bytes.set(value, address);
    },
    writeF32(address, value) {
      view.setFloat32(address, value, true);
    },
    writeUtf8(address, text, maxLength) {
      const encoded = new TextEncoder().encode(text + "\0");
      assert.ok(encoded.length <= maxLength);
      bytes.set(encoded, address);
    },
    writeUtf16(address, text, maxUnits) {
      assert.ok(text.length + 1 <= maxUnits);
      for (let index = 0; index < maxUnits; index += 1) {
        view.setUint16(
          address + index * 2,
          index < text.length ? text.charCodeAt(index) : 0,
          true
        );
      }
    },
  },
  memory: {
    byteLength: buffer.byteLength,
    free(address) {
      freed.push(address);
    },
    malloc(size) {
      allocations += 1;
      const address = (nextAddress + 7) & ~7;
      nextAddress = address + size;
      return address;
    },
  },
};

const pool = createTemporaryBufferPool(state, {
  maxIdleBuffers: 4,
  maxRetainedBytes: 1024,
});
state.memory.temporaryBuffers = pool;

let firstAddress = 0;
assert.equal(
  pool.withBuffer(13, (lease) => {
    firstAddress = lease.address;
    assert.equal(lease.capacity, 16);
    assert.equal(lease.requestedSize, 13);
    state.hook.writeF32(lease.address, 12.5);
    return state.hook.readF32(lease.address);
  }),
  12.5
);
assert.equal(allocations, 1);
assert.deepEqual(pool.describe(), {
  activeCount: 0,
  allocations: 1,
  disposed: false,
  frees: 0,
  idleCount: 1,
  retainedBytes: 16,
  reuses: 0,
});

bytes.fill(0xff, firstAddress, firstAddress + 8);
pool.withBuffer(8, (lease) => {
  assert.equal(lease.address, firstAddress);
  assert.deepEqual([...bytes.slice(lease.address, lease.address + 8)], [
    0, 0, 0, 0, 0, 0, 0, 0,
  ]);
});
assert.equal(allocations, 1);
assert.equal(pool.describe().reuses, 1);

pool.withBuffer(8, (outer) => {
  pool.withBuffer(8, (inner) => {
    assert.notEqual(inner.address, outer.address);
  });
});
assert.equal(allocations, 2);

const asyncAddress = await pool.withBuffer(8, async (lease) => {
  await Promise.resolve();
  return lease.address;
});
assert.ok(asyncAddress);

assert.throws(
  () =>
    pool.withBuffer(8, () => {
      throw new Error("expected");
    }),
  /expected/
);
assert.equal(pool.describe().activeCount, 0);

assert.equal(
  pool.withUtf8("temporary", (address, byteLength) => {
    return state.hook.readUtf8(address, byteLength);
  }),
  "temporary"
);
assert.equal(
  pool.withUtf16("buffer", (address, unitLength) => {
    return state.hook.readUtf16(address, unitLength);
  }),
  "buffer"
);

const altitudeState = {
  anchors: {},
  hook: {
    callExport(name, pointAddress, radius, altitudeAddress, normalAddress) {
      assert.equal(name, "__gwca_map_query_altitude");
      assert.equal(state.hook.readF32(pointAddress), 10);
      assert.equal(state.hook.readF32(pointAddress + 4), 20);
      assert.equal(state.hook.readF32(pointAddress + 8), 30);
      assert.equal(radius, 5);
      state.hook.writeF32(altitudeAddress, 42.5);
      state.hook.writeF32(normalAddress, 0.25);
      state.hook.writeF32(normalAddress + 4, 0.5);
      state.hook.writeF32(normalAddress + 8, 0.75);
      return 1;
    },
    getRawExports() {
      return {
        __gwca_map_query_altitude() {},
      };
    },
    readF32: state.hook.readF32,
    writeBytes: state.hook.writeBytes,
    writeF32: state.hook.writeF32,
  },
  memory: state.memory,
};
const altitudeInternals = createMapInternals(altitudeState);
const altitude = altitudeInternals.queryAltitude(
  { x: 10, y: 20, z: 30 },
  5
);
assert.equal(altitude.called, true);
assert.equal(altitude.ok, true);
assert.equal(altitude.altitude, 42.5);
assert.deepEqual(altitude.terrainNormal, {
  x: 0.25,
  y: 0.5,
  z: 0.75,
});

const activeLease = pool.acquire(32);
assert.ok(pool.dispose() >= 1);
assert.equal(pool.describe().disposed, true);
assert.equal(pool.describe().activeCount, 1);

state.memory = null;
assert.equal(activeLease.release(), true);
assert.equal(freed.length, allocations);
assert.equal(new Set(freed).size, allocations);
assert.equal(pool.describe().activeCount, 0);
assert.throws(() => pool.acquire(8), /disposed/);

console.log("Temporary buffer lifecycle and altitude checks passed");
