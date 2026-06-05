import { createModule, getRuntime } from "./stdafx.js";

function getByPath(target, path) {
  if (!target || typeof path !== "string" || !path) {
    return undefined;
  }
  return path.split(".").reduce((value, key) => {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    return value[key];
  }, target);
}

function resolveInline(state, descriptor) {
  if (typeof descriptor === "number" && Number.isFinite(descriptor)) {
    return descriptor >>> 0;
  }
  if (!descriptor || typeof descriptor !== "object") {
    return descriptor;
  }
  if (typeof descriptor.ref === "string") {
    return state.scanner.resolveAddress(descriptor.ref);
  }
  if (descriptor.type === "pointerChain" || (descriptor.base && descriptor.offsets)) {
    const base = state.scanner.resolveAddress(descriptor.base);
    const address = state.hook.readPointerChain(base, descriptor.offsets || []);
    if (!address && !descriptor.nullable) {
      throw new Error("Pointer chain resolved to null");
    }
    return address >>> 0;
  }
  if (descriptor.type === "offsetAddress") {
    const base = state.scanner.resolveAddress(descriptor.base);
    return ((base >>> 0) + ((descriptor.offset || 0) | 0)) >>> 0;
  }
  if (descriptor.type === "address") {
    return state.scanner.resolveAddress(descriptor.address);
  }
  return descriptor;
}

export const ScannerModule = createModule("Scanner", async function initModule(
  state,
  global = globalThis
) {
  if (!state.hook || typeof state.hook.readPointerChain !== "function") {
    throw new Error("Pointer-chain scanner is not available");
  }

  const runtime = getRuntime(global);
  const runtimeResolver = runtime?.resolver || null;

  state.scanner = Object.freeze({
    getDefinition(path) {
      return getByPath(state.signatures, path);
    },
    resolveAddress(target) {
      if (
        typeof target === "string" &&
        runtimeResolver &&
        typeof runtimeResolver.resolveAddress === "function"
      ) {
        return runtimeResolver.resolveAddress(target);
      }
      if (typeof target === "string") {
        return resolveInline(state, getByPath(state.signatures, target));
      }
      return resolveInline(state, target);
    },
    tryResolveAddress(target) {
      try {
        return this.resolveAddress(target);
      } catch (error) {
        return null;
      }
    },
  });

  return {
    hasRuntimeResolver:
      !!runtimeResolver && typeof runtimeResolver.resolveAddress === "function",
    ready: true,
  };
});
