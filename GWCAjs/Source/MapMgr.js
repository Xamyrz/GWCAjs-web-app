import {
  District,
  Language,
  ServerRegion,
} from "../Include/GWCA/Constants/Constants.js";
import { getInstanceTime } from "../Include/GWCA/Context/AgentContext.js";
import { getIsInCinematic } from "../Include/GWCA/Context/Cinematic.js";
import { getPathingMapArray } from "../Include/GWCA/Context/MapContext.js";
import {
  getWorldFoeCounts,
  getWorldMissionMapIconArray,
  getWorldUnlockedMapArray,
} from "../Include/GWCA/Context/WorldContext.js";
import {
  AREA_INFO_SIZE,
  MAP_TYPE_INSTANCE_INFO_SIZE,
  readAreaInfo,
  readMapTypeInstanceInfo,
  readMissionMapIcon,
} from "../Include/GWCA/GameEntities/Map.js";
import { isValidPointer, readValue } from "../Include/GWCA/Utilities/Memory.js";
import { createMapInternals } from "./MapMgrInternals.js";
import { asHex, createModule } from "./stdafx.js";

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

function normalizeInteger(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isInteger(normalized) ? normalized : fallback;
}

function getResolvedAddress(state, path) {
  return state.scanner?.tryResolveAddress(path) || 0;
}

function getMissionMapIcons(state) {
  const array = getWorldMissionMapIconArray(state);
  if (!array) {
    return null;
  }
  return {
    ...array,
    entries: Array.from({ length: array.size }, (_, index) =>
      readMissionMapIcon(
        state,
        (array.buffer + index * array.stride) >>> 0
      )
    ),
  };
}

function getMapInfo(state, mapId) {
  const normalizedMapId = normalizeInteger(mapId, -1);
  const baseAddress = getResolvedAddress(state, "modules.map.areaInfoAddress");
  const count = state.scanner?.getDefinition("modules.map.areaInfoCount");
  if (
    normalizedMapId < 0 ||
    !isValidPointer(state, baseAddress) ||
    (Number.isInteger(count) && normalizedMapId >= count)
  ) {
    return null;
  }
  const address = baseAddress + normalizedMapId * AREA_INFO_SIZE;
  return isValidPointer(state, address)
    ? readAreaInfo(state, address, normalizedMapId)
    : null;
}

function getMapTypeInstanceInfo(state, regionType) {
  const normalizedRegionType = normalizeInteger(regionType, -1);
  const baseAddress = getResolvedAddress(
    state,
    "modules.map.mapTypeInstanceInfoAddress"
  );
  const count = state.scanner?.getDefinition(
    "modules.map.mapTypeInstanceInfoCount"
  );
  if (
    normalizedRegionType < 0 ||
    !isValidPointer(state, baseAddress) ||
    !Number.isInteger(count) ||
    count <= 0
  ) {
    return null;
  }

  const isOutpost = ![2, 14, 18].includes(normalizedRegionType);
  for (let index = 0; index < count; index += 1) {
    const info = readMapTypeInstanceInfo(
      state,
      baseAddress + index * MAP_TYPE_INSTANCE_INFO_SIZE
    );
    if (
      info.mapRegionType === normalizedRegionType &&
      info.isOutpost === isOutpost
    ) {
      return info;
    }
  }
  return null;
}

function refreshMapState(state) {
  const charContextAddress = state.anchors?.charContextAddress || 0;
  const mapSchema = state.map?.schema || state.signatures?.modules?.map?.schema || null;
  const mapState = readSchema(state, charContextAddress, mapSchema);
  if (state.map) {
    state.map = Object.freeze({
      ...state.map,
      state: mapState,
    });
  }
  return mapState;
}

function createContextAddressReader(state) {
  return function getContextAddresses() {
    return state.context?.api?.GetContextAddresses?.() || {
      baseContextTableAddress: state.anchors?.baseContextTableAddress || 0,
      basePtrAddress: state.anchors?.basePtrAddress || 0,
      charContextAddress: state.anchors?.charContextAddress || 0,
      contextSlotAddress: state.anchors?.contextSlotAddress || 0,
      gameplayContextAddress: state.anchors?.gameplayContextAddress || 0,
      mapContextAddress: state.anchors?.mapContextAddress || 0,
      worldContextAddress: state.anchors?.worldContextAddress || 0,
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
  const internals = createMapInternals();
  const mapTest = {
    active: false,
    count: 0,
    status: "idle",
  };

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

  function getContextMethod(name) {
    const contextApi = state.context?.api;
    return contextApi && typeof contextApi[name] === "function"
      ? contextApi[name].bind(contextApi)
      : null;
  }

  function withRefreshedMapState(result) {
    if (!result?.gwcajsAnchorUpdated) {
      return result;
    }
    return {
      ...result,
      gwcajsMapState: refreshMapState(state),
    };
  }

  function getRegion() {
    const runtimeMap = getRuntimeMap(global);
    if (runtimeMap && typeof runtimeMap.getRegionId === "function") {
      const regionId = runtimeMap.getRegionId();
      if (Number.isInteger(regionId)) {
        return regionId;
      }
    }
    return getField("regionId") ?? ServerRegion.Unknown;
  }

  function regionFromDistrict(district) {
    switch (normalizeInteger(district, District.Current)) {
      case District.International:
        return ServerRegion.International;
      case District.American:
        return ServerRegion.America;
      case District.EuropeEnglish:
      case District.EuropeFrench:
      case District.EuropeGerman:
      case District.EuropeItalian:
      case District.EuropeSpanish:
      case District.EuropePolish:
      case District.EuropeRussian:
        return ServerRegion.Europe;
      case District.AsiaKorean:
        return ServerRegion.Korea;
      case District.AsiaChinese:
        return ServerRegion.China;
      case District.AsiaJapanese:
        return ServerRegion.Japan;
      default:
        return getRegion();
    }
  }

  function languageFromDistrict(district) {
    switch (normalizeInteger(district, District.Current)) {
      case District.EuropeFrench:
        return Language.French;
      case District.EuropeGerman:
        return Language.German;
      case District.EuropeItalian:
        return Language.Italian;
      case District.EuropeSpanish:
        return Language.Spanish;
      case District.EuropePolish:
        return Language.Polish;
      case District.EuropeRussian:
        return Language.Russian;
      case District.AsiaKorean:
      case District.AsiaChinese:
      case District.AsiaJapanese:
      case District.International:
      case District.American:
      case District.EuropeEnglish:
        return Language.English;
      default:
        return getField("language") ?? Language.English;
    }
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
        actionStatuses: internals.getActionStatuses(),
      };
    },
    GetActionStatus(name) {
      return internals.getActionStatus(name);
    },
    GetActionStatuses() {
      return internals.getActionStatuses();
    },
    GetUnsupportedAction(name) {
      return internals.getActionStatus(name);
    },
    GetInternalFunction(name) {
      return internals.getInternalFunction(name);
    },
    GetInternalFunctions() {
      return internals.getInternalFunctions();
    },
    GetMissionMapContext() {
      return null;
    },
    GetWorldMapContext() {
      return null;
    },
    QueryAltitude() {
      return 0;
    },
    GetCharContextAddress() {
      return getContextAddresses().charContextAddress || null;
    },
    GetContextAddresses() {
      return getContextAddresses();
    },
    GetDistrict() {
      return getField("districtId") ?? 0;
    },
    GetGameplayContextAddress() {
      return getContextAddresses().gameplayContextAddress || null;
    },
    GetIsMapLoaded() {
      return !!getContextAddresses().mapContextAddress;
    },
    GetLanguage() {
      return getField("language") ?? Language.English;
    },
    GetMapContextAddress() {
      return getContextAddresses().mapContextAddress || null;
    },
    GetMapID() {
      return getField("mapId") ?? 0;
    },
    GetObserveMapID() {
      return getField("observeMapId");
    },
    GetObserveMapType() {
      return getField("observeMapType");
    },
    GetIsObserving() {
      const current = getCurrentState();
      return !!(
        current &&
        Number.isInteger(current.mapId) &&
        Number.isInteger(current.observeMapId) &&
        current.mapId !== current.observeMapId
      );
    },
    GetRegion() {
      return getRegion();
    },
    GetServerRegionPtr() {
      return getResolvedAddress(state, "modules.map.regionIdAddress");
    },
    GetInstanceTime() {
      return getInstanceTime(state);
    },
    GetInstanceType() {
      return getField("mapType") ?? 2;
    },
    GetIsMapUnlocked(mapId) {
      const normalizedMapId = normalizeInteger(mapId, -1);
      const unlockedMap = getWorldUnlockedMapArray(state);
      if (normalizedMapId < 0 || !unlockedMap) {
        return false;
      }
      const index = Math.floor(normalizedMapId / 32);
      if (index >= unlockedMap.size) {
        return false;
      }
      const flags = readValue(
        state,
        "u32",
        unlockedMap.buffer + index * 4
      );
      return ((flags || 0) & (1 << (normalizedMapId % 32))) !== 0;
    },
    RegionFromDistrict(district) {
      return regionFromDistrict(district);
    },
    LanguageFromDistrict(district) {
      return languageFromDistrict(district);
    },
    Travel() {
      return false;
    },
    MapTestStart() {
      mapTest.active = false;
      mapTest.status = "unavailable";
      return false;
    },
    MapTestStop() {
      mapTest.active = false;
      mapTest.status = "stopped";
    },
    MapTestGetStatus() {
      return mapTest.status;
    },
    MapTestIsActive() {
      return mapTest.active;
    },
    MapTestGetCount() {
      return mapTest.count;
    },
    GetMissionMapIconArray() {
      return getMissionMapIcons(state);
    },
    GetPathingMap() {
      return getPathingMapArray(state);
    },
    GetFoesKilled() {
      return getWorldFoeCounts(state).killed;
    },
    GetFoesToKill() {
      return getWorldFoeCounts(state).remaining;
    },
    GetMapInfo(mapId = 0) {
      const resolvedMapId =
        normalizeInteger(mapId, 0) || (getField("mapId") ?? 0);
      return getMapInfo(state, resolvedMapId);
    },
    GetCurrentMapInfo() {
      return getMapInfo(state, getField("mapId") ?? 0);
    },
    GetInstanceInfoPtr() {
      return getResolvedAddress(state, "modules.map.instanceInfoAddress");
    },
    GetMapTypeInstanceInfo(regionType) {
      return getMapTypeInstanceInfo(state, regionType);
    },
    GetIsInCinematic() {
      return getIsInCinematic(state);
    },
    SkipCinematic() {
      return false;
    },
    EnterChallenge() {
      return false;
    },
    CancelEnterChallenge() {
      return false;
    },
    IsAvailable() {
      return !!getContextAddresses().mapContextAddress;
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
      const inspect = getContextMethod("InspectNativeCharContext");
      return inspect ? inspect(address) : null;
    },
    InspectGameContextRoot(address) {
      const inspect = getContextMethod("InspectGameContextRoot");
      return inspect ? inspect(address) : null;
    },
    InspectBaseContextTable(address, gameContextAddress) {
      const inspect = getContextMethod("InspectBaseContextTable");
      return inspect ? inspect(address, gameContextAddress) : null;
    },
    FindBaseContextCandidates(options = {}) {
      const find = getContextMethod("FindBaseContextCandidates");
      return find
        ? find(options)
        : {
            candidates: [],
            error: "Context base-context finder is not available",
          };
    },
    FindBasePtrSlotsForTable(tableAddress, options = {}) {
      const find = getContextMethod("FindBasePtrSlotsForTable");
      return find
        ? find(tableAddress, options)
        : {
            candidates: [],
            error: "Context base-ptr-slot finder is not available",
            slots: [],
            tableAddress,
          };
    },
    FindGameContextRootCandidates(options = {}) {
      const find = getContextMethod("FindGameContextRootCandidates");
      return find
        ? find(options)
        : {
            candidates: [],
            error: "Context GameContext root finder is not available",
          };
    },
    FindGameContextRootReferences(rootCandidate, options = {}) {
      const find = getContextMethod("FindGameContextRootReferences");
      return find
        ? find(rootCandidate, options)
        : {
            error: "Context GameContext root reference finder is not available",
            references: [],
          };
    },
    FindPropContextRootCandidates(options = {}) {
      const find = getContextMethod("FindPropContextRootCandidates");
      return find
        ? find(options)
        : {
            candidates: [],
            error: "Context PropContext root finder is not available",
          };
    },
    InspectPropContextRoot(address, options = {}) {
      const inspect = getContextMethod("InspectPropContextRoot");
      return inspect
        ? inspect(address, options)
        : {
            error: "Context PropContext root inspector is not available",
          };
    },
    FindNativeCharContextsByPlayerName(name, options = {}) {
      const find = getContextMethod("FindNativeCharContextsByPlayerName");
      return find ? find(name, options) : [];
    },
    PromoteNativeCharContextAddress(address) {
      const promote = getContextMethod("PromoteNativeCharContextAddress");
      if (!promote) {
        return {
          available: false,
          error: "Context promotion API is not available",
        };
      }
      return withRefreshedMapState(promote(address));
    },
    PromoteNativeCharContextByPlayerName(name, options = {}) {
      const promote = getContextMethod(
        "PromoteNativeCharContextByPlayerName"
      );
      if (!promote) {
        return {
          available: false,
          error: "Context promotion API is not available",
        };
      }
      return withRefreshedMapState(promote(name, options));
    },
    PromoteBaseContextCandidate(target, options = {}) {
      const promote = getContextMethod("PromoteBaseContextCandidate");
      if (!promote) {
        return {
          available: false,
          error: "Context base-context promotion API is not available",
        };
      }
      return withRefreshedMapState(promote(target, options));
    },
    PromoteGameContextRootCandidate(target, options = {}) {
      const promote = getContextMethod("PromoteGameContextRootCandidate");
      if (!promote) {
        return {
          available: false,
          error: "Context GameContext root promotion API is not available",
        };
      }
      return withRefreshedMapState(promote(target, options));
    },
  });
}

export const MapModule = createModule("MapMgr", async function initModule(
  state,
  global = globalThis
) {
  if (!state.context?.api) {
    throw new Error("Context must be initialized before MapMgr");
  }

  const addresses = state.context.api.GetContextAddresses();
  const charContextAddress = addresses.charContextAddress || 0;
  const mapSchema = state.signatures?.modules?.map?.schema || null;
  const mapState = readSchema(state, charContextAddress, mapSchema);
  state.map = Object.freeze({
    api: createMapApi(state, global),
    schema: mapSchema,
    state: mapState,
  });

  return {
    anchors: {
      charContextAddress: asHex(addresses.charContextAddress),
      contextSlotAddress: asHex(addresses.contextSlotAddress),
      gameplayContextAddress: asHex(addresses.gameplayContextAddress),
      mapContextAddress: asHex(addresses.mapContextAddress),
      worldContextAddress: asHex(addresses.worldContextAddress),
    },
    mapState,
  };
});

export function getMapApi() {
  return statefulMapGetter(globalThis);
}

function statefulMapGetter(global = globalThis) {
  return global.GWCAjs?.Map || null;
}
