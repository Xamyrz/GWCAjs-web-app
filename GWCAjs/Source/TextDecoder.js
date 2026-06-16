import { TEXT_INTERNAL_CALLS } from "../Evidence/InternalCalls.js";
import { createInternalCallRuntime } from "./InternalCallRuntime.js";

export function createTextDecoder(state, options = {}) {
  const internalCalls = createInternalCallRuntime(state, TEXT_INTERNAL_CALLS);
  const timeoutMs = options.timeoutMs ?? 5000;
  const cache = new Map();
  const status = {
    callbackCount: 0,
    lastError: null,
    lastResult: null,
    pendingCount: 0,
  };

  function isAvailable() {
    return !!(
      internalCalls.getActionStatus("Decode").available &&
      typeof state?.hook?.registerTableCallback === "function"
    );
  }

  function decodeAddress(encodedAddress) {
    const address = Number(encodedAddress) >>> 0;
    if (!address || !isAvailable()) {
      status.lastError = !address
        ? "Encoded string address is unavailable."
        : "Text resolver exports or callback registration are unavailable.";
      return Promise.resolve(null);
    }
    const rawText = state.hook.readUtf16(address, 256);
    if (!rawText) {
      return Promise.resolve("");
    }
    if (cache.has(rawText)) {
      return Promise.resolve(cache.get(rawText));
    }

    return new Promise((resolve) => {
      let callbackLease = null;
      let settled = false;
      const finish = (value, release = true) => {
        if (settled) {
          if (release) {
            callbackLease?.release();
          }
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (release) {
          callbackLease?.release();
        }
        if (typeof value === "string") {
          cache.set(rawText, value);
        }
        status.lastResult = value;
        status.pendingCount = Math.max(0, status.pendingCount - 1);
        resolve(value);
      };
      status.pendingCount += 1;
      const timeout = setTimeout(() => {
        status.lastError = "Timed out waiting for the game text decoder.";
        finish(null, false);
      }, timeoutMs);
      try {
        callbackLease = state.hook.registerTableCallback(
          (_callbackParam, decodedAddress) => {
            status.callbackCount += 1;
            status.lastError = null;
            finish(
              decodedAddress
                ? state.hook.readUtf16(decodedAddress >>> 0, 256)
                : ""
            );
          }
        );
        const callResult = internalCalls.call("Decode", [
          address,
          callbackLease.index,
          0,
        ]);
        if (!callResult.called) {
          throw new Error(callResult.reason);
        }
      } catch (error) {
        status.lastError =
          error instanceof Error ? error.message : String(error);
        finish(null);
      }
    });
  }

  function getHeroCodedNameAddress(agentId) {
    const normalizedAgentId = Number(agentId);
    if (
      !Number.isInteger(normalizedAgentId) ||
      normalizedAgentId <= 0 ||
      !internalCalls.getActionStatus("GetHeroCodedName").available
    ) {
      return 0;
    }
    try {
      return (
        internalCalls.call("GetHeroCodedName", [normalizedAgentId]).result || 0
      ) >>> 0;
    } catch (error) {
      return 0;
    }
  }

  return Object.freeze({
    decodeAddress,
    decodeHeroAgentName(agentId) {
      return decodeAddress(getHeroCodedNameAddress(agentId));
    },
    getStatus() {
      return {
        ...status,
        available: isAvailable(),
        cacheSize: cache.size,
      };
    },
    isAvailable,
  });
}
