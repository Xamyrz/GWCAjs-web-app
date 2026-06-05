import { DEFAULT_BUILD_ID, findBuildSignatures } from "/gw-runtime/signatures.js";

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
    case "u8":
      return hook.readU8(address);
    case "u16":
      return hook.readU16(address);
    case "u32":
    case "ptr":
      return hook.readU32(address);
    case "i32":
      return hook.readI32(address);
    case "f32":
      return hook.readF32(address);
    case "f64":
      return hook.readF64(address);
    case "utf8":
      return hook.readUtf8(address, options.maxLength ?? options.length);
    default:
      throw new Error("Unsupported memory read type: " + type);
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
  state.memory = Object.freeze({
    byteLength: hook.memory.buffer.byteLength,
    pageCount:
      buildInfo?.memoryPageCount ??
      Math.floor(hook.memory.buffer.byteLength / (64 * 1024)),
    readType(type, address, options) {
      return readType(hook, type, address, options);
    },
  });

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
  };
});
