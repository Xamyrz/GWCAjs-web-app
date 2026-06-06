import {
  getCharContextAddress,
  getGameContextAddress,
  getMapContextAddress,
  getWorldContextAddress,
} from "../Include/GWCA/Context/GameContext.js";
import { asHex, createModule } from "./stdafx.js";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRuntimeMap(global = globalThis) {
  return global.GW?.map || null;
}

function normalizeAddress(address) {
  return typeof address === "number" && Number.isFinite(address)
    ? address >>> 0
    : 0;
}

function mergeAnchors(state, addresses = {}) {
  const next = {
    ...(state.anchors || {}),
  };
  const addressFields = {
    baseContextTableAddress: addresses.baseContextTableAddress,
    basePtrAddress: addresses.basePtrAddress,
    charContextAddress: addresses.charContextAddress,
    contextSlotAddress: addresses.contextSlotAddress,
    gameplayContextAddress:
      addresses.gameContextAddress ?? addresses.gameplayContextAddress,
    mapContextAddress: addresses.mapContextAddress,
    worldContextAddress: addresses.worldContextAddress,
  };

  for (const [field, value] of Object.entries(addressFields)) {
    const normalized = normalizeAddress(value);
    if (normalized) {
      next[field] = normalized;
    }
  }

  state.anchors = Object.freeze(next);
  return state.anchors;
}

function readContextAddresses(state) {
  const resolved = {
    baseContextTableAddress:
      state.scanner?.tryResolveAddress(
        "modules.gameplay.baseContextTableAddress"
      ) ||
      state.anchors?.baseContextTableAddress ||
      0,
    basePtrAddress:
      state.scanner?.tryResolveAddress("modules.gameplay.basePtrAddress") ||
      state.anchors?.basePtrAddress ||
      0,
    contextSlotAddress:
      state.scanner?.tryResolveAddress(
        "modules.gameplay.contextSlotAddress"
      ) ||
      state.anchors?.contextSlotAddress ||
      0,
  };

  if (
    resolved.contextSlotAddress &&
    resolved.contextSlotAddress !== state.anchors?.contextSlotAddress
  ) {
    mergeAnchors(state, {
      contextSlotAddress: resolved.contextSlotAddress,
    });
  }

  const gameplayContextAddress = getGameContextAddress(state);
  const addresses = {
    ...resolved,
    charContextAddress: getCharContextAddress(state),
    gameplayContextAddress,
    mapContextAddress: getMapContextAddress(state),
    worldContextAddress: getWorldContextAddress(state),
  };

  state.anchors = Object.freeze({
    ...(state.anchors || {}),
    charContextAddress: addresses.charContextAddress,
    gameplayContextAddress: addresses.gameplayContextAddress,
    mapContextAddress: addresses.mapContextAddress,
    worldContextAddress: addresses.worldContextAddress,
  });
  return addresses;
}

function createUnavailable(error, extras = {}) {
  return {
    available: false,
    error,
    ...extras,
  };
}

function createContextApi(state, global = globalThis) {
  function getRuntimeMethod(name) {
    const runtimeMap = getRuntimeMap(global);
    return runtimeMap && typeof runtimeMap[name] === "function"
      ? runtimeMap[name].bind(runtimeMap)
      : null;
  }

  function withDefaultAnchor(options = {}) {
    return {
      anchorAddress:
        typeof options.anchorAddress === "number"
          ? options.anchorAddress
          : state.anchors?.gameplayContextAddress || 0,
      ...options,
    };
  }

  function applyPromotion(result) {
    if (result?.available && result.addresses) {
      mergeAnchors(state, result.addresses);
      return {
        ...result,
        gwcajsAnchorUpdated: true,
      };
    }
    return result;
  }

  return Object.freeze({
    Describe() {
      const addresses = readContextAddresses(state);
      return {
        addresses: Object.fromEntries(
          Object.entries(addresses).map(([key, value]) => [key, asHex(value)])
        ),
        rootDiscovery: state.context?.rootDiscovery || null,
      };
    },
    GetContextAddresses() {
      return readContextAddresses(state);
    },
    GetGameContextAddress() {
      return readContextAddresses(state).gameplayContextAddress || null;
    },
    GetCharContextAddress() {
      return readContextAddresses(state).charContextAddress || null;
    },
    GetMapContextAddress() {
      return readContextAddresses(state).mapContextAddress || null;
    },
    GetWorldContextAddress() {
      return readContextAddresses(state).worldContextAddress || null;
    },
    InspectNativeCharContext(address) {
      return getRuntimeMethod("inspectNativeCharContext")?.(address) ?? null;
    },
    InspectGameContextRoot(address) {
      return getRuntimeMethod("inspectGameContextRoot")?.(address) ?? null;
    },
    InspectBaseContextTable(address, gameContextAddress) {
      return (
        getRuntimeMethod("inspectBaseContextTable")?.(
          address,
          gameContextAddress
        ) ?? null
      );
    },
    InspectPropContextRoot(address, options = {}) {
      const inspect = getRuntimeMethod("inspectPropContextRoot");
      return inspect
        ? inspect(address, options)
        : createUnavailable(
            "Runtime PropContext root inspector is not available"
          );
    },
    FindBaseContextCandidates(options = {}) {
      const find = getRuntimeMethod("findBaseContextCandidates");
      return find
        ? find(withDefaultAnchor(options))
        : createUnavailable(
            "Runtime base-context finder is not available",
            { candidates: [] }
          );
    },
    FindBasePtrSlotsForTable(tableAddress, options = {}) {
      const find = getRuntimeMethod("findBasePtrSlotsForTable");
      return find
        ? find(tableAddress, options)
        : createUnavailable(
            "Runtime base-ptr-slot finder is not available",
            { candidates: [], slots: [], tableAddress }
          );
    },
    FindGameContextRootCandidates(options = {}) {
      const find = getRuntimeMethod("findGameContextRootCandidates");
      return find
        ? find(withDefaultAnchor(options))
        : createUnavailable(
            "Runtime GameContext root finder is not available",
            { candidates: [] }
          );
    },
    FindGameContextRootReferences(rootCandidate, options = {}) {
      const find = getRuntimeMethod("findGameContextRootReferences");
      return find
        ? find(rootCandidate, options)
        : createUnavailable(
            "Runtime GameContext root reference finder is not available",
            { references: [] }
          );
    },
    FindPropContextRootCandidates(options = {}) {
      const find = getRuntimeMethod("findPropContextRootCandidates");
      return find
        ? find(withDefaultAnchor(options))
        : createUnavailable(
            "Runtime PropContext root finder is not available",
            { candidates: [] }
          );
    },
    FindNativeCharContextsByPlayerName(name, options = {}) {
      return (
        getRuntimeMethod("findNativeCharContextsByPlayerName")?.(
          name,
          options
        ) ?? []
      );
    },
    PromoteNativeCharContextAddress(address) {
      const promote = getRuntimeMethod("promoteNativeCharContextAddress");
      if (!promote) {
        return createUnavailable(
          "Runtime CharContext promotion API is not available"
        );
      }
      const result = promote(address);
      if (result?.available && result.address) {
        mergeAnchors(state, { charContextAddress: result.address });
        return {
          ...result,
          gwcajsAnchorUpdated: true,
        };
      }
      return result;
    },
    PromoteNativeCharContextByPlayerName(name, options = {}) {
      const promote = getRuntimeMethod(
        "promoteNativeCharContextByPlayerName"
      );
      if (!promote) {
        return createUnavailable(
          "Runtime CharContext promotion API is not available"
        );
      }
      const result = promote(name, options);
      if (result?.available && result.address) {
        mergeAnchors(state, { charContextAddress: result.address });
        return {
          ...result,
          gwcajsAnchorUpdated: true,
        };
      }
      return result;
    },
    PromoteBaseContextCandidate(target, options = {}) {
      const promote = getRuntimeMethod("promoteBaseContextCandidate");
      return promote
        ? applyPromotion(promote(target, options))
        : createUnavailable(
            "Runtime base-context promotion API is not available"
          );
    },
    PromoteGameContextRootCandidate(target, options = {}) {
      const promote = getRuntimeMethod("promoteBaseContextCandidate");
      return promote
        ? applyPromotion(promote(target, options))
        : createUnavailable(
            "Runtime GameContext root promotion API is not available"
          );
    },
  });
}

export const ContextModule = createModule(
  "Context",
  async function initModule(state, global = globalThis) {
    if (!state.scanner) {
      throw new Error("Scanner must be initialized before Context");
    }

    const timeoutAt = Date.now() + 15000;
    let contextSlotAddress = 0;
    let gameplayContextAddress = 0;
    while (Date.now() < timeoutAt) {
      contextSlotAddress =
        state.scanner.tryResolveAddress(
          "modules.gameplay.contextSlotAddress"
        ) || 0;
      gameplayContextAddress =
        state.scanner.tryResolveAddress("modules.gameplay.contextAddress") ||
        0;
      if (contextSlotAddress && gameplayContextAddress) {
        break;
      }
      await delay(100);
    }

    if (!contextSlotAddress) {
      throw new Error(
        "Required anchor missing: modules.gameplay.contextSlotAddress"
      );
    }
    if (!gameplayContextAddress) {
      throw new Error(
        "Required anchor missing: modules.gameplay.contextAddress"
      );
    }

    mergeAnchors(state, {
      charContextAddress: state.scanner.tryResolveAddress(
        "modules.gameplay.charContextAddress"
      ),
      contextSlotAddress,
      gameplayContextAddress,
      mapContextAddress: state.scanner.tryResolveAddress(
        "modules.gameplay.mapContextAddress"
      ),
      worldContextAddress: state.scanner.tryResolveAddress(
        "modules.gameplay.worldContextAddress"
      ),
    });

    const api = createContextApi(state, global);
    let propContextRootSearch = null;
    let propContextRootPromotion = null;
    let gameContextRootSearch = null;
    let gameContextRootPromotion = null;

    propContextRootSearch = api.FindPropContextRootCandidates({
      anchorAddress: gameplayContextAddress,
      anchorRadius: 0x800000,
      limit: 1,
      maxRejected: 16,
      maxScanSlots: 4000000,
    });
    const propCandidate = propContextRootSearch?.candidates?.[0] || null;
    if (propCandidate) {
      propContextRootPromotion =
        api.PromoteBaseContextCandidate(propCandidate);
    }

    if (!propContextRootPromotion?.available) {
      gameContextRootSearch = api.FindGameContextRootCandidates({
        anchorAddress: gameplayContextAddress,
        anchorRadius: 0x800000,
        limit: 1,
        maxRejected: 16,
        maxScanSlots: 4000000,
      });
      const gameCandidate =
        gameContextRootSearch?.candidates?.[0] || null;
      if (gameCandidate) {
        gameContextRootPromotion =
          api.PromoteGameContextRootCandidate(gameCandidate);
      }
    }

    const rootDiscovery = Object.freeze({
      gameContextRootPromotion,
      gameContextRootSearch,
      propContextRootPromotion,
      propContextRootSearch,
    });
    state.context = Object.freeze({
      api,
      rootDiscovery,
    });

    return {
      anchors: Object.fromEntries(
        Object.entries(readContextAddresses(state)).map(([key, value]) => [
          key,
          asHex(value),
        ])
      ),
      ...rootDiscovery,
    };
  }
);

export function getContextApi(global = globalThis) {
  return global.GWCAjs?.Context || null;
}
