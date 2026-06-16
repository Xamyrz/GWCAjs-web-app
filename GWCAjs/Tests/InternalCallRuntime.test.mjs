import assert from "node:assert/strict";

import { createInternalCallRuntime } from "../Source/InternalCallRuntime.js";

const definitions = Object.freeze({
  Plain: Object.freeze({
    exportName: "__plain",
    rawWasmSignature: "(i32, f32) -> i32",
    verification: "abi-verified",
  }),
  WithContext: Object.freeze({
    exportName: "__context",
    rawWasmSignature: "(i32) -> i32",
    requiresPropContext: true,
    verification: "live-action",
  }),
});

const writes = [];
const calls = [];
let slotValue = 0x22000000;
const state = {
  anchors: {
    gameplayContextAddress: 0x11000000,
  },
  hook: {
    callExport(name, ...args) {
      calls.push({ args, name, slotValue });
      return name === "__plain" ? 7 : 9;
    },
    getPatchStatus() {
      return {
        actionPatchesEnabled: true,
        reason: "known-build",
      };
    },
    getRawExports() {
      return {
        __context() {},
        __plain() {},
      };
    },
    readU32(address) {
      assert.equal(address, 0x33000000);
      return slotValue;
    },
    writeU32(address, value) {
      assert.equal(address, 0x33000000);
      slotValue = value >>> 0;
      writes.push(slotValue);
    },
  },
  signatures: {
    modules: {
      player: {
        propContextTableSlotAddress: 0x33000000,
      },
    },
  },
};

const runtime = createInternalCallRuntime(state, definitions);
assert.equal(runtime.getActionStatus("Plain").available, true);
assert.equal(runtime.call("Plain", [4, 1.5]).result, 7);
assert.match(runtime.call("Plain", [4]).reason, /Expected 2 arguments/);
assert.match(runtime.call("Plain", [4.5, 1]).reason, /integer i32/);
assert.equal(runtime.call("WithContext", [5]).result, 9);
assert.equal(slotValue, 0x22000000);
assert.deepEqual(writes, [0x11000000, 0x22000000]);
assert.deepEqual(calls.at(-1), {
  args: [5],
  name: "__context",
  slotValue: 0x11000000,
});

writes.length = 0;
runtime.withPropContext(() => {
  runtime.withPropContext(() => {
    assert.equal(slotValue, 0x11000000);
  });
});
assert.deepEqual(writes, [0x11000000, 0x22000000]);

state.hook.getPatchStatus = () => ({
  actionPatchesEnabled: false,
  reason: "unsupported-build",
});
assert.equal(runtime.getActionStatus("Plain").available, false);
assert.match(runtime.call("Plain", [4, 1]).reason, /unsupported-build/);

state.hook.getPatchStatus = () => null;
assert.equal(runtime.getActionStatus("Plain").available, false);
assert.match(runtime.call("Plain", [4, 1]).reason, /status is unavailable/);

console.log("Shared internal-call runtime checks passed");
