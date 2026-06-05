import { asHex, createModule } from "./stdafx.js";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readSchema(state, address, schema) {
  if (!address || !schema || typeof schema !== "object") {
    return null;
  }

  const result = {};
  for (const [key, field] of Object.entries(schema)) {
    if (!field || typeof field !== "object") {
      continue;
    }
    result[key] = state.memory.readType(
      field.type,
      address + (field.offset || 0),
      field
    );
  }
  return result;
}

function getRuntimeMap(global = globalThis) {
  return global.GW?.map || null;
}

function normalizeAddress(address) {
  return typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
}

function refreshCharContextAnchor(state, address) {
  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress) {
    return null;
  }

  const mapSchema = state.map?.schema || state.signatures?.modules?.map?.schema || null;
  const mapState = readSchema(state, normalizedAddress, mapSchema);

  state.anchors = Object.freeze({
    ...(state.anchors || {}),
    charContextAddress: normalizedAddress,
  });
  if (state.map) {
    state.map = Object.freeze({
      ...state.map,
      state: mapState,
    });
  }
  return mapState;
}

function refreshContextAnchors(state, addresses = {}) {
  const charContextAddress = normalizeAddress(addresses.charContextAddress);
  const gameplayContextAddress =
    normalizeAddress(addresses.gameContextAddress) ||
    normalizeAddress(addresses.gameplayContextAddress);
  const mapContextAddress = normalizeAddress(addresses.mapContextAddress);
  const worldContextAddress = normalizeAddress(addresses.worldContextAddress);
  const basePtrAddress = normalizeAddress(addresses.basePtrAddress);
  const baseContextTableAddress = normalizeAddress(addresses.baseContextTableAddress);
  const mapState = charContextAddress
    ? refreshCharContextAnchor(state, charContextAddress)
    : null;

  state.anchors = Object.freeze({
    ...(state.anchors || {}),
    ...(baseContextTableAddress ? { baseContextTableAddress } : {}),
    ...(basePtrAddress ? { basePtrAddress } : {}),
    ...(charContextAddress ? { charContextAddress } : {}),
    ...(gameplayContextAddress ? { gameplayContextAddress } : {}),
    ...(mapContextAddress ? { mapContextAddress } : {}),
    ...(worldContextAddress ? { worldContextAddress } : {}),
  });
  return mapState;
}

function createContextAddressReader(state) {
  return function getContextAddresses() {
    return {
      baseContextTableAddress:
        state.scanner?.tryResolveAddress("modules.gameplay.baseContextTableAddress") ||
        state.anchors?.baseContextTableAddress ||
        0,
      basePtrAddress:
        state.scanner?.tryResolveAddress("modules.gameplay.basePtrAddress") ||
        state.anchors?.basePtrAddress ||
        0,
      charContextAddress:
        state.scanner?.tryResolveAddress("modules.gameplay.charContextAddress") ||
        state.anchors?.charContextAddress ||
        0,
      contextSlotAddress:
        state.scanner?.tryResolveAddress("modules.gameplay.contextSlotAddress") ||
        state.anchors?.contextSlotAddress ||
        0,
      gameplayContextAddress:
        state.scanner?.tryResolveAddress("modules.gameplay.contextAddress") ||
        state.anchors?.gameplayContextAddress ||
        0,
      mapContextAddress:
        state.scanner?.tryResolveAddress("modules.gameplay.mapContextAddress") ||
        state.anchors?.mapContextAddress ||
        0,
      worldContextAddress:
        state.scanner?.tryResolveAddress("modules.gameplay.worldContextAddress") ||
        state.anchors?.worldContextAddress ||
        0,
    };
  };
}

function createStateReader(state, global = globalThis) {
  return function getCurrentState() {
    const runtimeMap = getRuntimeMap(global);
    if (runtimeMap && typeof runtimeMap.getState === "function") {
      return runtimeMap.getState();
    }

    const charContextAddress =
      state.scanner?.tryResolveAddress("modules.gameplay.charContextAddress") ||
      state.anchors?.charContextAddress ||
      0;
    return readSchema(state, charContextAddress, state.map?.schema || null);
  };
}

function createMapApi(state, global = globalThis) {
  const getContextAddresses = createContextAddressReader(state);
  const getCurrentState = createStateReader(state, global);

  function getField(fieldName) {
    const currentState = getCurrentState();
    return currentState && Object.prototype.hasOwnProperty.call(currentState, fieldName)
      ? currentState[fieldName]
      : null;
  }

  function getRuntimeMapMethod(name) {
    const runtimeMap = getRuntimeMap(global);
    return runtimeMap && typeof runtimeMap[name] === "function"
      ? runtimeMap[name].bind(runtimeMap)
      : null;
  }

  return Object.freeze({
    Describe() {
      const runtimeMap = getRuntimeMap(global);
      return {
        addresses: Object.fromEntries(
          Object.entries(getContextAddresses()).map(([key, value]) => [key, asHex(value)])
        ),
        runtime:
          runtimeMap && typeof runtimeMap.describe === "function"
            ? runtimeMap.describe({ resolve: true })
            : null,
        schemaFields: state.map?.schema ? Object.keys(state.map.schema) : [],
        state: getCurrentState(),
      };
    },
    GetCharContextAddress() {
      return getContextAddresses().charContextAddress || null;
    },
    GetContextAddresses() {
      return getContextAddresses();
    },
    GetDistrict() {
      return getField("districtId");
    },
    GetGameplayContextAddress() {
      return getContextAddresses().gameplayContextAddress || null;
    },
    GetIsMapLoaded() {
      const stateView = getCurrentState();
      return !!(
        stateView &&
        Number.isInteger(stateView.mapId) &&
        stateView.mapId > 0
      );
    },
    GetLanguage() {
      return getField("language");
    },
    GetMapContextAddress() {
      return getContextAddresses().mapContextAddress || null;
    },
    GetMapID() {
      return getField("mapId");
    },
    GetObserveMapID() {
      return getField("observeMapId");
    },
    GetObserveMapType() {
      return getField("observeMapType");
    },
    GetRegion() {
      const runtimeMap = getRuntimeMap(global);
      if (runtimeMap && typeof runtimeMap.getRegionId === "function") {
        return runtimeMap.getRegionId();
      }
      return getField("regionId");
    },
    GetState() {
      return getCurrentState();
    },
    GetStateAddress() {
      const runtimeMap = getRuntimeMap(global);
      if (runtimeMap && typeof runtimeMap.getStateAddress === "function") {
        return runtimeMap.getStateAddress();
      }
      return getContextAddresses().charContextAddress || null;
    },
    InspectNativeCharContext(address) {
      const inspect = getRuntimeMapMethod("inspectNativeCharContext");
      return inspect ? inspect(address) : null;
    },
    InspectGameContextRoot(address) {
      const inspect = getRuntimeMapMethod("inspectGameContextRoot");
      return inspect ? inspect(address) : null;
    },
    InspectBaseContextTable(address, gameContextAddress) {
      const inspect = getRuntimeMapMethod("inspectBaseContextTable");
      return inspect ? inspect(address, gameContextAddress) : null;
    },
    FindBaseContextCandidates(options = {}) {
      const find = getRuntimeMapMethod("findBaseContextCandidates");
      return find
        ? find({
            anchorAddress:
              typeof options.anchorAddress === "number"
                ? options.anchorAddress
                : state.anchors?.gameplayContextAddress || 0,
            ...options,
          })
        : {
            candidates: [],
            error: "Runtime map base-context finder is not available",
          };
    },
    FindBasePtrSlotsForTable(tableAddress, options = {}) {
      const find = getRuntimeMapMethod("findBasePtrSlotsForTable");
      return find
        ? find(tableAddress, options)
        : {
            candidates: [],
            error: "Runtime map base-ptr-slot finder is not available",
            slots: [],
            tableAddress,
          };
    },
    FindGameContextRootCandidates(options = {}) {
      const find = getRuntimeMapMethod("findGameContextRootCandidates");
      return find
        ? find({
            anchorAddress:
              typeof options.anchorAddress === "number"
                ? options.anchorAddress
                : state.anchors?.gameplayContextAddress || 0,
            ...options,
          })
        : {
            candidates: [],
            error: "Runtime map GameContext root finder is not available",
          };
    },
    FindGameContextRootReferences(rootCandidate, options = {}) {
      const find = getRuntimeMapMethod("findGameContextRootReferences");
      return find
        ? find(rootCandidate, options)
        : {
            error: "Runtime map GameContext root reference finder is not available",
            references: [],
          };
    },
    FindPropContextRootCandidates(options = {}) {
      const find = getRuntimeMapMethod("findPropContextRootCandidates");
      return find
        ? find({
            anchorAddress:
              typeof options.anchorAddress === "number"
                ? options.anchorAddress
                : state.anchors?.gameplayContextAddress || 0,
            ...options,
          })
        : {
            candidates: [],
            error: "Runtime map PropContext root finder is not available",
          };
    },
    InspectPropContextRoot(address, options = {}) {
      const inspect = getRuntimeMapMethod("inspectPropContextRoot");
      return inspect
        ? inspect(address, options)
        : {
            error: "Runtime map PropContext root inspector is not available",
          };
    },
    FindNativeCharContextsByPlayerName(name, options = {}) {
      const find = getRuntimeMapMethod("findNativeCharContextsByPlayerName");
      return find ? find(name, options) : [];
    },
    PromoteNativeCharContextAddress(address) {
      const promote = getRuntimeMapMethod("promoteNativeCharContextAddress");
      if (!promote) {
        return {
          available: false,
          error: "Runtime map promotion API is not available",
        };
      }

      const result = promote(address);
      if (result?.available && result.address) {
        const mapState = refreshCharContextAnchor(state, result.address);
        return {
          ...result,
          gwcajsAnchorUpdated: true,
          gwcajsMapState: mapState,
        };
      }
      return result;
    },
    PromoteNativeCharContextByPlayerName(name, options = {}) {
      const promote = getRuntimeMapMethod("promoteNativeCharContextByPlayerName");
      if (!promote) {
        return {
          available: false,
          error: "Runtime map promotion API is not available",
        };
      }

      const result = promote(name, options);
      if (result?.available && result.address) {
        const mapState = refreshCharContextAnchor(state, result.address);
        return {
          ...result,
          gwcajsAnchorUpdated: true,
          gwcajsMapState: mapState,
        };
      }
      return result;
    },
    PromoteBaseContextCandidate(target, options = {}) {
      const promote = getRuntimeMapMethod("promoteBaseContextCandidate");
      if (!promote) {
        return {
          available: false,
          error: "Runtime map base-context promotion API is not available",
        };
      }

      const result = promote(target, options);
      if (result?.available && result.addresses) {
        const mapState = refreshContextAnchors(state, result.addresses);
        return {
          ...result,
          gwcajsAnchorUpdated: true,
          gwcajsMapState: mapState,
        };
      }
      return result;
    },
    PromoteGameContextRootCandidate(target, options = {}) {
      const promote = getRuntimeMapMethod("promoteBaseContextCandidate");
      if (!promote) {
        return {
          available: false,
          error: "Runtime map GameContext root promotion API is not available",
        };
      }

      const result = promote(target, options);
      if (result?.available && result.addresses) {
        const mapState = refreshContextAnchors(state, result.addresses);
        return {
          ...result,
          gwcajsAnchorUpdated: true,
          gwcajsMapState: mapState,
        };
      }
      return result;
    },
    GetInstanceType() {
      return getField("mapType");
    },
  });
}

export const MapModule = createModule("MapMgr", async function initModule(
  state,
  global = globalThis
) {
  if (!state.scanner) {
    throw new Error("Scanner must be initialized before MapMgr");
  }

  const timeoutAt = Date.now() + 15000;
  let contextSlotAddress = 0;
  let gameplayContextAddress = 0;
  let mapContextAddress = 0;
  let charContextAddress = 0;
  let baseContextTableAddress = 0;
  let basePtrAddress = 0;
  let worldContextAddress = 0;
  let propContextRootSearch = null;
  let propContextRootPromotion = null;
  let gameContextRootSearch = null;
  let gameContextRootPromotion = null;

  while (Date.now() < timeoutAt) {
    contextSlotAddress =
      state.scanner.tryResolveAddress("modules.gameplay.contextSlotAddress") || 0;
    gameplayContextAddress =
      state.scanner.tryResolveAddress("modules.gameplay.contextAddress") || 0;

    if (contextSlotAddress && gameplayContextAddress) {
      mapContextAddress =
        state.scanner.tryResolveAddress("modules.gameplay.mapContextAddress") || 0;
      charContextAddress =
        state.scanner.tryResolveAddress("modules.gameplay.charContextAddress") || 0;
      break;
    }

    await delay(100);
  }

  const mapSchema = state.signatures?.modules?.map?.schema || null;

  if (!contextSlotAddress) {
    throw new Error("Required anchor missing: modules.gameplay.contextSlotAddress");
  }
  if (!gameplayContextAddress) {
    throw new Error("Required anchor missing: modules.gameplay.contextAddress");
  }

  const runtimeMap = getRuntimeMap(global);
  if (
    runtimeMap &&
    typeof runtimeMap.findPropContextRootCandidates === "function" &&
    typeof runtimeMap.promoteBaseContextCandidate === "function"
  ) {
    propContextRootSearch = runtimeMap.findPropContextRootCandidates({
      anchorAddress: gameplayContextAddress,
      anchorRadius: 0x800000,
      limit: 1,
      maxRejected: 16,
      maxScanSlots: 4000000,
    });
    const candidate = propContextRootSearch?.candidates?.[0] || null;
    if (candidate) {
      propContextRootPromotion = runtimeMap.promoteBaseContextCandidate(candidate);
      if (propContextRootPromotion?.available && propContextRootPromotion.addresses) {
        baseContextTableAddress =
          normalizeAddress(propContextRootPromotion.addresses.baseContextTableAddress);
        basePtrAddress =
          normalizeAddress(propContextRootPromotion.addresses.basePtrAddress);
        charContextAddress =
          normalizeAddress(propContextRootPromotion.addresses.charContextAddress) ||
          charContextAddress;
        gameplayContextAddress =
          normalizeAddress(propContextRootPromotion.addresses.gameContextAddress) ||
          gameplayContextAddress;
        mapContextAddress =
          normalizeAddress(propContextRootPromotion.addresses.mapContextAddress) ||
          mapContextAddress;
        worldContextAddress =
          normalizeAddress(propContextRootPromotion.addresses.worldContextAddress);
      }
    }
  }

  if (
    !propContextRootPromotion?.available &&
    runtimeMap &&
    typeof runtimeMap.findGameContextRootCandidates === "function" &&
    typeof runtimeMap.promoteBaseContextCandidate === "function"
  ) {
    gameContextRootSearch = runtimeMap.findGameContextRootCandidates({
      anchorAddress: gameplayContextAddress,
      anchorRadius: 0x800000,
      limit: 1,
      maxRejected: 16,
      maxScanSlots: 4000000,
    });
    const candidate = gameContextRootSearch?.candidates?.[0] || null;
    if (candidate) {
      gameContextRootPromotion = runtimeMap.promoteBaseContextCandidate(candidate);
      if (gameContextRootPromotion?.available && gameContextRootPromotion.addresses) {
        baseContextTableAddress =
          normalizeAddress(gameContextRootPromotion.addresses.baseContextTableAddress);
        basePtrAddress =
          normalizeAddress(gameContextRootPromotion.addresses.basePtrAddress);
        charContextAddress =
          normalizeAddress(gameContextRootPromotion.addresses.charContextAddress) ||
          charContextAddress;
        gameplayContextAddress =
          normalizeAddress(gameContextRootPromotion.addresses.gameContextAddress) ||
          gameplayContextAddress;
        mapContextAddress =
          normalizeAddress(gameContextRootPromotion.addresses.mapContextAddress) ||
          mapContextAddress;
        worldContextAddress =
          normalizeAddress(gameContextRootPromotion.addresses.worldContextAddress);
      }
    }
  }

  const mapState = readSchema(
    state,
    charContextAddress,
    mapSchema
  );

  state.anchors = Object.freeze({
    baseContextTableAddress,
    basePtrAddress,
    charContextAddress: charContextAddress || 0,
    contextSlotAddress: contextSlotAddress || 0,
    gameplayContextAddress: gameplayContextAddress || 0,
    mapContextAddress: mapContextAddress || 0,
    worldContextAddress,
  });
  state.map = Object.freeze({
    api: createMapApi(state, global),
    schema: mapSchema,
    state: mapState,
  });

  return {
    anchors: {
      charContextAddress: asHex(state.anchors.charContextAddress),
      contextSlotAddress: asHex(state.anchors.contextSlotAddress),
      gameplayContextAddress: asHex(state.anchors.gameplayContextAddress),
      mapContextAddress: asHex(state.anchors.mapContextAddress),
      worldContextAddress: asHex(state.anchors.worldContextAddress),
    },
    gameContextRootPromotion,
    gameContextRootSearch,
    mapState,
    propContextRootPromotion,
    propContextRootSearch,
  };
});

export function getMapApi() {
  return statefulMapGetter(globalThis);
}

function statefulMapGetter(global = globalThis) {
  return global.GWCAjs?.Map || null;
}
