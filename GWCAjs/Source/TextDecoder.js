const PROP_CONTEXT_SLOT_ADDRESS = 0x28b680;
const TEXT_RESOLVE_EXPORT = "__gwca_text_resolve_issue";
const HERO_CODED_NAME_EXPORT = "__gwca_char_get_coded_name";

function getActivePropContextAddress(state) {
  const anchoredAddress = state?.anchors?.gameplayContextAddress || 0;
  if (anchoredAddress) {
    return anchoredAddress >>> 0;
  }
  return (
    state?.scanner?.tryResolveAddress?.("modules.gameplay.contextAddress") || 0
  ) >>> 0;
}

function withPropContext(state, callback) {
  if (
    typeof state?.hook?.readU32 !== "function" ||
    typeof state?.hook?.writeU32 !== "function"
  ) {
    return callback();
  }
  const contextAddress = getActivePropContextAddress(state);
  if (!contextAddress) {
    return callback();
  }
  const previous = state.hook.readU32(PROP_CONTEXT_SLOT_ADDRESS) || 0;
  state.hook.writeU32(PROP_CONTEXT_SLOT_ADDRESS, contextAddress);
  try {
    return callback();
  } finally {
    state.hook.writeU32(PROP_CONTEXT_SLOT_ADDRESS, previous);
  }
}

export function createTextDecoder(state, options = {}) {
  const timeoutMs = options.timeoutMs ?? 5000;
  const cache = new Map();
  const status = {
    callbackCount: 0,
    lastError: null,
    lastResult: null,
    pendingCount: 0,
  };

  function isAvailable() {
    const exportsObject = state?.hook?.getRawExports?.();
    return !!(
      exportsObject &&
      typeof exportsObject[TEXT_RESOLVE_EXPORT] === "function" &&
      typeof state?.hook?.callExport === "function" &&
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
        withPropContext(state, () =>
          state.hook.callExport(
            TEXT_RESOLVE_EXPORT,
            address,
            callbackLease.index,
            0
          )
        );
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
      typeof state?.hook?.callExport !== "function"
    ) {
      return 0;
    }
    try {
      return (
        withPropContext(state, () =>
          state.hook.callExport(HERO_CODED_NAME_EXPORT, normalizedAgentId)
        ) || 0
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
