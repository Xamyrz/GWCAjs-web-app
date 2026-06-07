import assert from "node:assert/strict";

import {
  getArrayEntryAddress,
  getArraySlotCount,
  readArray,
  readPointerArray,
} from "../Include/GWCA/GameContainers/Array.js";
import { readList } from "../Include/GWCA/GameContainers/List.js";

const buffer = new ArrayBuffer(0x30000);
const view = new DataView(buffer);

const state = {
  hook: {
    memory: { buffer },
  },
  memory: {
    byteLength: buffer.byteLength,
    readType(type, address) {
      switch (type) {
        case "u8":
          return view.getUint8(address);
        case "u16":
          return view.getUint16(address, true);
        case "u32":
        case "ptr":
          return view.getUint32(address, true);
        case "i32":
          return view.getInt32(address, true);
        case "f32":
          return view.getFloat32(address, true);
        case "f64":
          return view.getFloat64(address, true);
        default:
          throw new Error("Unsupported test read type: " + type);
      }
    },
  },
};

function writeU32(address, value) {
  view.setUint32(address, value >>> 0, true);
}

function writeArrayHeader(address, arrayBuffer, capacity, size, param = 0) {
  writeU32(address, arrayBuffer);
  writeU32(address + 4, capacity);
  writeU32(address + 8, size);
  writeU32(address + 12, param);
}

function writeLink(address, previousLinkAddress, nextNodeRaw) {
  writeU32(address, previousLinkAddress);
  writeU32(address + 4, nextNodeRaw);
}

const arrayAddress = 0x10000;
const arrayBuffer = 0x11000;
writeArrayHeader(arrayAddress, arrayBuffer, 4, 3, 9);

const array = readArray(state, arrayAddress, 8);
assert.ok(array);
assert.equal(array.address, arrayAddress);
assert.equal(array.buffer, arrayBuffer);
assert.equal(array.bufferEnd, arrayBuffer + 32);
assert.equal(array.byteLength, 32);
assert.equal(array.capacity, 4);
assert.equal(array.size, 3);
assert.equal(array.param, 9);
assert.equal(getArraySlotCount(array), 4);
assert.equal(getArrayEntryAddress(array, 2), arrayBuffer + 16);
assert.equal(getArrayEntryAddress(array, 3), 0);
assert.equal(
  getArrayEntryAddress(array, 3, { useCapacity: true }),
  arrayBuffer + 24
);

writeArrayHeader(arrayAddress, arrayBuffer, 4, 0);
const reservedArray = readArray(state, arrayAddress, 8);
assert.ok(reservedArray);
assert.equal(reservedArray.empty, true);
assert.equal(reservedArray.capacity, 4);
assert.equal(getArraySlotCount(reservedArray), 4);

writeArrayHeader(arrayAddress, arrayBuffer, 2, 3);
assert.equal(readArray(state, arrayAddress, 8), null);

writeArrayHeader(arrayAddress, arrayBuffer, 5, 3);
assert.equal(
  readArray(state, arrayAddress, 8, { maxCapacity: 4 }),
  null
);

writeArrayHeader(arrayAddress, buffer.byteLength - 8, 2, 1);
assert.equal(readArray(state, arrayAddress, 8), null);

writeArrayHeader(arrayAddress, arrayBuffer + 2, 2, 1);
assert.equal(readArray(state, arrayAddress, 8), null);

writeArrayHeader(arrayAddress, 0, 0, 0, 7);
assert.equal(readArray(state, arrayAddress, 8), null);
const emptyArray = readArray(state, arrayAddress, 8, { allowEmpty: true });
assert.ok(emptyArray);
assert.equal(emptyArray.empty, true);
assert.equal(emptyArray.buffer, 0);
assert.equal(emptyArray.capacity, 0);
assert.equal(emptyArray.size, 0);

assert.equal(readArray(state, arrayAddress, 0), null);
assert.equal(readArray(state, buffer.byteLength - 8, 4), null);

const pointerArrayAddress = 0x10100;
const pointerBuffer = 0x12000;
writeArrayHeader(pointerArrayAddress, pointerBuffer, 4, 3);
writeU32(pointerBuffer, 0x13000);
writeU32(pointerBuffer + 4, 0);
writeU32(pointerBuffer + 8, 0x14000);
writeU32(pointerBuffer + 12, 0x15000);

const pointerArray = readPointerArray(state, pointerArrayAddress);
assert.ok(pointerArray);
assert.deepEqual(pointerArray.pointers, [0x13000, 0, 0x14000]);
assert.equal(pointerArray.pointerCount, 3);
assert.equal(pointerArray.usesCapacity, false);

const capacityPointers = readPointerArray(state, pointerArrayAddress, {
  useCapacity: true,
});
assert.ok(capacityPointers);
assert.deepEqual(capacityPointers.pointers, [
  0x13000,
  0,
  0x14000,
  0x15000,
]);

writeU32(pointerBuffer + 8, 0x14002);
assert.equal(readPointerArray(state, pointerArrayAddress), null);
writeU32(pointerBuffer + 8, 0x14000);
assert.equal(
  readPointerArray(state, pointerArrayAddress, { allowNull: false }),
  null
);
assert.equal(
  readPointerArray(state, pointerArrayAddress, { count: 5 }),
  null
);

const listAddress = 0x18000;
const offset = 0x10;
const sentinelAddress = listAddress + 4;
const firstNodeAddress = 0x19000;
const firstLinkAddress = firstNodeAddress + offset;
const secondNodeAddress = 0x19100;
const secondLinkAddress = secondNodeAddress + offset;

writeU32(listAddress, offset);
writeLink(sentinelAddress, secondLinkAddress, firstNodeAddress);
writeLink(firstLinkAddress, sentinelAddress, secondNodeAddress);
writeLink(
  secondLinkAddress,
  firstLinkAddress,
  sentinelAddress - offset
);

const list = readList(state, listAddress, {
  expectedOffset: offset,
  nodeSize: 0x20,
});
assert.ok(list);
assert.equal(list.circular, true);
assert.equal(list.count, 2);
assert.deepEqual(list.nodeAddresses, [firstNodeAddress, secondNodeAddress]);
assert.deepEqual(list.linkAddresses, [firstLinkAddress, secondLinkAddress]);
assert.equal(list.tailLinkAddress, secondLinkAddress);
assert.equal(list.terminatedBy, "sentinel");

assert.equal(
  readList(state, listAddress, { expectedOffset: 0x14 }),
  null
);
assert.equal(readList(state, listAddress, { maxNodes: 1 }), null);

writeLink(firstLinkAddress, 0x1a000, secondNodeAddress);
assert.equal(readList(state, listAddress), null);
writeLink(firstLinkAddress, sentinelAddress, secondNodeAddress);

writeLink(secondLinkAddress, firstLinkAddress, firstNodeAddress);
assert.equal(readList(state, listAddress), null);
writeLink(
  secondLinkAddress,
  firstLinkAddress,
  sentinelAddress - offset
);

const emptyListAddress = 0x18200;
const emptyOffset = 0x20;
const emptySentinelAddress = emptyListAddress + 4;
writeU32(emptyListAddress, emptyOffset);
writeLink(
  emptySentinelAddress,
  emptySentinelAddress,
  emptySentinelAddress - emptyOffset
);

const emptyList = readList(state, emptyListAddress);
assert.ok(emptyList);
assert.equal(emptyList.circular, true);
assert.equal(emptyList.count, 0);

const linearListAddress = 0x18400;
const linearSentinelAddress = linearListAddress + 4;
const linearNodeAddress = 0x1a000;
const linearLinkAddress = linearNodeAddress + offset;
writeU32(linearListAddress, offset);
writeLink(linearSentinelAddress, linearLinkAddress, linearNodeAddress);
writeLink(linearLinkAddress, linearSentinelAddress, 1);

const linearList = readList(state, linearListAddress);
assert.ok(linearList);
assert.equal(linearList.circular, false);
assert.equal(linearList.count, 1);
assert.deepEqual(linearList.nodeAddresses, [linearNodeAddress]);
assert.equal(linearList.terminatedBy, "tagged-end");

console.log("Array, pointer-array, and list checks passed");
