import assert from "node:assert/strict";

import { createTextDecoder } from "../Source/TextDecoder.js";

const buffer = new ArrayBuffer(0x30000);
const view = new DataView(buffer);
const encodedAddress = 0x10000;
const decodedAddress = 0x11000;
const propContextSlotAddress = 0x28b680;
let propContextSlot = 0x22220000;
let callbackReleased = false;
let callbackFunction = null;
const calls = [];

function writeUtf16(address, value) {
  for (let index = 0; index <= value.length; index += 1) {
    view.setUint16(
      address + index * 2,
      index < value.length ? value.charCodeAt(index) : 0,
      true
    );
  }
}

function readUtf16(address, maxUnits) {
  const units = [];
  for (let index = 0; index < maxUnits; index += 1) {
    const unit = view.getUint16(address + index * 2, true);
    if (!unit) {
      break;
    }
    units.push(unit);
  }
  return String.fromCharCode(...units);
}

writeUtf16(encodedAddress, "\u0108\u010a\u8101");
writeUtf16(decodedAddress, "Polar Bear");

const state = {
  anchors: {
    gameplayContextAddress: 0x12340000,
  },
  hook: {
    callExport(name, ...args) {
      calls.push({ args, name, propContextSlot });
      if (name === "__gwca_char_get_coded_name") {
        return encodedAddress;
      }
      if (name === "__gwca_text_resolve_issue") {
        callbackFunction(args[2], decodedAddress);
      }
      return undefined;
    },
    getRawExports() {
      return {
        __gwca_char_get_coded_name() {},
        __gwca_text_resolve_issue() {},
      };
    },
    readU32(address) {
      assert.equal(address, propContextSlotAddress);
      return propContextSlot;
    },
    readUtf16,
    registerTableCallback(callback) {
      callbackFunction = callback;
      return {
        index: 77,
        release() {
          callbackReleased = true;
        },
      };
    },
    writeU32(address, value) {
      assert.equal(address, propContextSlotAddress);
      propContextSlot = value >>> 0;
    },
  },
};

const decoder = createTextDecoder(state);
assert.equal(decoder.isAvailable(), true);
assert.equal(await decoder.decodeAddress(encodedAddress), "Polar Bear");
assert.equal(callbackReleased, true);
assert.equal(propContextSlot, 0x22220000);
assert.deepEqual(decoder.getStatus(), {
  available: true,
  cacheSize: 1,
  callbackCount: 1,
  lastError: null,
  lastResult: "Polar Bear",
  pendingCount: 0,
});
assert.deepEqual(calls[0], {
  args: [encodedAddress, 77, 0],
  name: "__gwca_text_resolve_issue",
  propContextSlot: 0x12340000,
});

calls.length = 0;
callbackReleased = false;
assert.equal(await decoder.decodeAddress(encodedAddress), "Polar Bear");
assert.equal(calls.length, 0);
assert.equal(callbackReleased, false);

assert.equal(await decoder.decodeHeroAgentName(19), "Polar Bear");
assert.equal(calls[0].name, "__gwca_char_get_coded_name");
assert.equal(calls[0].propContextSlot, 0x12340000);

console.log("Asynchronous encoded-text decoder checks passed");
