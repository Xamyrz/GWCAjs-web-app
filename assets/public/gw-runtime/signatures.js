export const DEFAULT_BUILD_ID = "default";

const SHARED_GAMEPLAY_SIGNATURES = Object.freeze({
  modules: {
    gameplay: {
      contextAddress: {
        base: "modules.gameplay.contextSlotAddress",
        offsets: [0],
        type: "pointerChain",
      },
      contextSlotAddress: 5940872,
      mapContextAddress: {
        base: "modules.gameplay.contextSlotAddress",
        offsets: [0, 0x14],
        type: "pointerChain",
      },
      charContextAddress: {
        base: "modules.gameplay.contextSlotAddress",
        offsets: [0, 0x44],
        type: "pointerChain",
      },
    },
    map: {
      stateAddress: "modules.gameplay.charContextAddress",
      schema: {
        districtId: { offset: 0x228, type: "i32" },
        isExplorable: { offset: 0x19c, type: "u32" },
        language: { offset: 0x22c, type: "u32" },
        mapId: { offset: 0x234, type: "u32" },
        mapType: { offset: 0x23c, type: "u32" },
        observeMapId: { offset: 0x230, type: "u32" },
        observeMapType: { offset: 0x238, type: "u32" },
        playerNumber: { offset: 0x2ac, type: "u32" },
      },
    },
    player: {
      propArrayLayout: {
        bufferBase: 0x80c,
        capacityBase: 0x810,
        sizeBase: 0x814,
        paramBase: 0x818,
        stride: 0x50,
      },
      playerPropId: 0x0b,
      missionPropId: 0x11,
      missionPlayerNumberOffset: 0x2ac,
    },
  },
});

const BUILTIN_BUILD_SIGNATURES = Object.freeze({
  "10830b7275570948a0ac9c9ea6700b7a38": {
    ...SHARED_GAMEPLAY_SIGNATURES,
    aliases: ["b5ecbd4c"],
  },
  "103f50bb0ce2d744bfbf88a91afce2328b": {
    ...SHARED_GAMEPLAY_SIGNATURES,
    modules: {
      ...SHARED_GAMEPLAY_SIGNATURES.modules,
      gameplay: {
        ...SHARED_GAMEPLAY_SIGNATURES.modules.gameplay,
        mapContextAddress: {
          base: "modules.gameplay.contextSlotAddress",
          offsets: [0, 0x20],
          type: "pointerChain",
        },
        charContextAddress: {
          assumedNameOffset: 116,
          currentMapIdOffset: 0x234,
          currentMapTypeOffset: 0x23c,
          districtIdOffset: 0x228,
          languageOffset: 0x22c,
          limit: 12,
          maxDistrictId: 999,
          maxMapId: 5000,
          maxMapType: 2,
          minDistrictId: -2,
          nameOffset: 0x74,
          playerNameStorageKey: "gw.characterName",
          type: "charContextByPlayerName",
        },
      },
      map: {
        ...SHARED_GAMEPLAY_SIGNATURES.modules.map,
        stateAddress: "modules.gameplay.charContextAddress",
      },
      player: {
        ...SHARED_GAMEPLAY_SIGNATURES.modules.player,
        propContextDefaultAddress: 0x28b684,
        propContextTableSlotAddress: 0x28b680,
      },
    },
    aliases: ["bcc4a791"],
  },
});

const registry = new Map([
  [DEFAULT_BUILD_ID, { modules: {} }],
  ...Object.entries(BUILTIN_BUILD_SIGNATURES),
]);

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergeObjects(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return Array.isArray(patch) ? patch.slice() : patch;
  }

  const merged = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      merged[key] = mergeObjects(base[key], value);
      continue;
    }
    merged[key] = Array.isArray(value) ? value.slice() : value;
  }
  return merged;
}

function normalizeBuildId(buildId) {
  return typeof buildId === "string" && buildId.trim()
    ? buildId.trim()
    : DEFAULT_BUILD_ID;
}

function includesAlias(definition, candidate) {
  return !!(
    definition &&
    Array.isArray(definition.aliases) &&
    definition.aliases.includes(candidate)
  );
}

export function registerBuildSignatures(buildId, definition = {}) {
  const key = normalizeBuildId(buildId);
  registry.set(key, isPlainObject(definition) ? definition : {});
  return registry.get(key);
}

export function mergeBuildSignatures(buildId, definition = {}) {
  const key = normalizeBuildId(buildId);
  const current = registry.get(key) || {};
  const next = mergeObjects(current, isPlainObject(definition) ? definition : {});
  registry.set(key, next);
  return next;
}

export function getBuildSignatures(buildId) {
  return registry.get(normalizeBuildId(buildId)) || null;
}

export function findBuildSignatures(buildId, aliases = []) {
  const candidates = [buildId, ...aliases]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim());

  for (const candidate of candidates) {
    if (registry.has(candidate)) {
      return registry.get(candidate);
    }
  }

  if (candidates.length > 0) {
    for (const definition of registry.values()) {
      if (candidates.some((candidate) => includesAlias(definition, candidate))) {
        return definition;
      }
    }
  }

  return registry.get(DEFAULT_BUILD_ID) || null;
}

export function listRegisteredBuilds() {
  return Array.from(registry.keys());
}
