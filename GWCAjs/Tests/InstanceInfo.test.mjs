import assert from "node:assert/strict";
import {
  getInstanceInfoPtrAddress,
  INSTANCE_INFO_OFFSETS,
} from "../Include/GWCA/Context/InstanceInfo.js";

const buffer = new ArrayBuffer(0x600000);
const view = new DataView(buffer);
const definitions = {
  "modules.map.areaInfoAddress": 0x1cbe60,
  "modules.map.areaInfoCount": 883,
};
let allocations = 0;

const state = {
  hook: {
    getRawExports() {
      return {
        malloc(size) {
          assert.equal(size, 0x18);
          allocations += 1;
          return 0x10000;
        },
      };
    },
    memory: { buffer },
    writeU32(address, value) {
      view.setUint32(address, value, true);
    },
  },
  memory: {
    byteLength: buffer.byteLength,
  },
  scanner: {
    getDefinition(path) {
      return definitions[path];
    },
    tryResolveAddress(path) {
      return definitions[path] || 0;
    },
  },
};

const slotAddress = getInstanceInfoPtrAddress(state, {
  mapId: 548,
  mapType: 1,
});
assert.equal(slotAddress, 0x10000);

const infoAddress = view.getUint32(slotAddress, true);
assert.equal(infoAddress, 0x10004);
assert.equal(
  view.getUint32(infoAddress + INSTANCE_INFO_OFFSETS.terrainInfo1, true),
  0
);
assert.equal(
  view.getUint32(infoAddress + INSTANCE_INFO_OFFSETS.instanceType, true),
  1
);
assert.equal(
  view.getUint32(infoAddress + INSTANCE_INFO_OFFSETS.currentMapInfo, true),
  0x1cbe60 + 548 * 0x7c
);
assert.equal(
  view.getUint32(infoAddress + INSTANCE_INFO_OFFSETS.terrainCount, true),
  0
);
assert.equal(
  view.getUint32(infoAddress + INSTANCE_INFO_OFFSETS.terrainInfo2, true),
  0
);

assert.equal(
  getInstanceInfoPtrAddress(state, { mapId: 644, mapType: 0 }),
  slotAddress
);
assert.equal(allocations, 1);
assert.equal(
  view.getUint32(infoAddress + INSTANCE_INFO_OFFSETS.instanceType, true),
  0
);
assert.equal(
  view.getUint32(infoAddress + INSTANCE_INFO_OFFSETS.currentMapInfo, true),
  0x1cbe60 + 644 * 0x7c
);

getInstanceInfoPtrAddress(state, { mapId: 9999, mapType: 2 });
assert.equal(
  view.getUint32(infoAddress + INSTANCE_INFO_OFFSETS.instanceType, true),
  2
);
assert.equal(
  view.getUint32(infoAddress + INSTANCE_INFO_OFFSETS.currentMapInfo, true),
  0
);

definitions["modules.map.instanceInfoPtrAddress"] = 0x12000;
assert.equal(
  getInstanceInfoPtrAddress(state, { mapId: 548, mapType: 1 }),
  0x12000
);
assert.equal(allocations, 1);

const failingState = {
  ...state,
  hook: {
    ...state.hook,
    getRawExports() {
      return {
        malloc() {
          return buffer.byteLength - 4;
        },
      };
    },
  },
  scanner: {
    ...state.scanner,
    tryResolveAddress(path) {
      return path === "modules.map.areaInfoAddress"
        ? definitions[path] || 0
        : 0;
    },
  },
};
assert.equal(
  getInstanceInfoPtrAddress(failingState, { mapId: 548, mapType: 1 }),
  0
);

console.log("InstanceInfo compatibility checks passed");
