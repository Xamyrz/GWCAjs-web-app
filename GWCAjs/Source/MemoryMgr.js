import { DEFAULT_BUILD_ID, findBuildSignatures } from "/gw-runtime/signatures.js";

import { createTemporaryBufferPool } from "../Include/GWCA/Utilities/TemporaryBuffer.js";
import { debugLog } from "./Debug.js";
import { createModule, getHook, getRuntime } from "./stdafx.js";

function compact(values) {
  return values.filter(
    (value, index) =>
      typeof value === "string" &&
      value.trim() &&
      values.indexOf(value) === index
  );
}

function getBuildInfo(global, hook) {
  const runtime = getRuntime(global);
  if (runtime?.version && typeof runtime.version.describe === "function") {
    return runtime.version.describe();
  }
  return typeof hook.getBuildInfo === "function" ? hook.getBuildInfo() : null;
}

function getLookupKeys(buildInfo) {
  if (!buildInfo) {
    return [];
  }
  return compact([
    buildInfo.wasmBuildId,
    buildInfo.buildId,
    buildInfo.debugFile ? "debug:" + buildInfo.debugFile : null,
    buildInfo.loader ? "loader:" + buildInfo.loader : null,
  ]);
}

function readType(hook, type, address, options = {}) {
  switch (type) {
    case "i8":
      return hook.readI8(address);
    case "u8":
      return hook.readU8(address);
    case "i16":
      return hook.readI16(address);
    case "u16":
      return hook.readU16(address);
    case "u32":
      return hook.readU32(address);
    case "ptr":
      return hook.readPointer(address);
    case "i32":
      return hook.readI32(address);
    case "f32":
      return hook.readF32(address);
    case "f64":
      return hook.readF64(address);
    case "utf8":
      return hook.readUtf8(address, options.length ?? options.maxLength);
    case "utf16":
      return hook.readUtf16(address, options.units ?? options.maxUnits);
    case "bytes":
      return hook.readBytes(address, options.length ?? 0);
    default:
      throw new Error("Unsupported memory read type: " + type);
  }
}

function writeType(hook, type, address, value, options = {}) {
  switch (type) {
    case "i8":
      return hook.writeI8(address, value);
    case "u8":
      return hook.writeU8(address, value);
    case "i16":
      return hook.writeI16(address, value);
    case "u16":
      return hook.writeU16(address, value);
    case "u32":
      return hook.writeU32(address, value);
    case "ptr":
      return hook.writePointer(address, value);
    case "i32":
      return hook.writeI32(address, value);
    case "f32":
      return hook.writeF32(address, value);
    case "f64":
      return hook.writeF64(address, value);
    case "utf8":
      return hook.writeUtf8(
        address,
        value,
        options.length ?? options.maxLength
      );
    case "utf16":
      return hook.writeUtf16(
        address,
        value,
        options.units ?? options.maxUnits
      );
    case "bytes":
      return hook.writeBytes(address, value);
    default:
      throw new Error("Unsupported memory write type: " + type);
  }
}

export const MemoryModule = createModule("MemoryMgr", async function initModule(
  state,
  global = globalThis
) {
  const hook = getHook(global);
  await hook.captured;
  await hook.ready;

  hook.refreshMemoryViews?.();

  if (!hook.memory?.buffer) {
    throw new Error("WASM memory is not available");
  }

  const buildInfo = getBuildInfo(global, hook);
  const lookupKeys = getLookupKeys(buildInfo);
  const buildId =
    buildInfo?.wasmBuildId || buildInfo?.buildId || DEFAULT_BUILD_ID;
  const signatures = findBuildSignatures(buildId, lookupKeys);

  state.hook = hook;
  state.build = buildInfo;
  state.buildId = buildId;
  state.lookupKeys = lookupKeys;
  state.signatures = signatures || { modules: {} };
  const memoryApi = {
    get byteLength() {
      return hook.memory?.buffer?.byteLength || 0;
    },
    get pageCount() {
      return Math.floor((hook.memory?.buffer?.byteLength || 0) / (64 * 1024));
    },
    assertRange(address, length, alignment) {
      return hook.assertRange(address, length, alignment);
    },
    free(address) {
      return hook.free(address);
    },
    isAligned(address, alignment) {
      return hook.isAligned(address, alignment);
    },
    isValidPointer(address, options) {
      return hook.isValidPointer(address, options);
    },
    isValidRange(address, length, alignment) {
      return hook.isValidRange(address, length, alignment);
    },
    malloc(size) {
      return hook.malloc(size);
    },
    readType(type, address, options) {
      return readType(hook, type, address, options);
    },
    withAllocation(size, callback) {
      return hook.withAllocation(size, callback);
    },
    withUtf8(text, callback) {
      return hook.withUtf8(text, callback);
    },
    withUtf16(text, callback) {
      return hook.withUtf16(text, callback);
    },
    writeType(type, address, value, options) {
      return writeType(hook, type, address, value, options);
    },
  };
  state.memory = memoryApi;
  memoryApi.temporaryBuffers = createTemporaryBufferPool(state);
  state.memory = Object.freeze(memoryApi);

  debugLog("memory initialized", {
    buildId,
    byteLength: state.memory.byteLength,
    lookupKeys,
  });

  return {
    buildId,
    byteLength: state.memory.byteLength,
    hasMemory: true,
    lookupKeys,
    pageCount: state.memory.pageCount,
    temporaryBuffers: state.memory.temporaryBuffers.describe(),
  };
});
