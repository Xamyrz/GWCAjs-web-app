import {
  DEFAULT_BUILD_ID,
  findBuildSignatures,
  listRegisteredBuilds,
  mergeBuildSignatures,
  registerBuildSignatures,
} from "./signatures.js";

export const CHARACTER_NAME_STORAGE_KEY = "gw.characterName";

function getByPath(target, path) {
  if (!target || typeof path !== "string" || !path) {
    return target;
  }
  return path.split(".").reduce((value, key) => {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    return value[key];
  }, target);
}

function summarizeValue(value) {
  if (typeof value === "number") {
    return {
      type: "number",
      value,
      hex: "0x" + value.toString(16),
    };
  }
  if (typeof value === "function") {
    return {
      arity: value.length,
      name: value.name || null,
      type: "function",
    };
  }
  if (value === null) {
    return { type: "null" };
  }
  if (Array.isArray(value)) {
    return {
      length: value.length,
      type: "array",
    };
  }
  return {
    type: typeof value,
  };
}

function toAddress(value, targetLabel) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >>> 0;
  }
  if (
    value &&
    typeof value === "object" &&
    typeof value.address === "number" &&
    Number.isFinite(value.address)
  ) {
    return value.address >>> 0;
  }
  throw new Error("Resolver target is not an address: " + targetLabel);
}

export function createResolver(runtime, options = {}) {
  const { version } = options;
  const descriptorCache = new Map();

  function readU32(address) {
    return runtime.hook.readU32(address);
  }

  function readI32(address) {
    return runtime.hook.readI32(address);
  }

  function readStoredValue(key) {
    if (!key || typeof key !== "string") {
      return null;
    }
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch (error) {
      return null;
    }
  }

  function readUtf16(address, maxUnits = 64) {
    if (!address || typeof runtime.hook.readU16 !== "function") {
      return "";
    }
    const chars = [];
    const limit = Math.max(0, maxUnits | 0);
    for (let index = 0; index < limit; index += 1) {
      const codeUnit = runtime.hook.readU16(address + index * 2);
      if (!codeUnit) {
        break;
      }
      chars.push(codeUnit);
    }
    return chars.length > 0 ? String.fromCharCode(...chars) : "";
  }

  function resolveCharacterName(descriptor) {
    if (typeof descriptor.playerName === "string" && descriptor.playerName.trim()) {
      return descriptor.playerName.trim();
    }

    const storageKeys = [
      descriptor.playerNameStorageKey,
      CHARACTER_NAME_STORAGE_KEY,
    ].filter((value) => typeof value === "string" && value.trim());

    for (const key of storageKeys) {
      const value = readStoredValue(key);
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    throw new Error("Character name is not configured");
  }

  function isValidRange(value, minimum, maximum) {
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= minimum &&
      value <= maximum
    );
  }

  function validateCharContextCandidate(address, descriptor) {
    const language = readU32(address + (descriptor.languageOffset ?? 0x22c));
    const currentMapId = readU32(
      address + (descriptor.currentMapIdOffset ?? 0x234)
    );
    const currentMapType = readU32(
      address + (descriptor.currentMapTypeOffset ?? 0x23c)
    );
    const districtId = readI32(address + (descriptor.districtIdOffset ?? 0x228));

    if (!isValidRange(language, 0, 0xff)) {
      throw new Error("CharContext validation failed: language");
    }
    if (!isValidRange(currentMapId, 1, descriptor.maxMapId ?? 5000)) {
      throw new Error("CharContext validation failed: currentMapId");
    }
    if (!isValidRange(currentMapType, 0, descriptor.maxMapType ?? 2)) {
      throw new Error("CharContext validation failed: currentMapType");
    }
    if (!isValidRange(districtId, descriptor.minDistrictId ?? -2, descriptor.maxDistrictId ?? 999)) {
      throw new Error("CharContext validation failed: districtId");
    }

    return {
      currentMapId,
      currentMapType,
      districtId,
      language,
    };
  }

  function getDescriptorCacheKey(descriptor, playerName) {
    const buildInfo = getBuildInfo();
    return JSON.stringify({
      assumedNameOffset:
        typeof descriptor.assumedNameOffset === "number"
          ? descriptor.assumedNameOffset | 0
          : null,
      buildId: buildInfo ? buildInfo.wasmBuildId || buildInfo.buildId : DEFAULT_BUILD_ID,
      hitIndex:
        typeof descriptor.hitIndex === "number" && descriptor.hitIndex >= 0
          ? descriptor.hitIndex | 0
          : null,
      nameOffset:
        typeof descriptor.nameOffset === "number"
          ? descriptor.nameOffset | 0
          : 0x74,
      playerName,
      type: descriptor.type,
    });
  }

  function getCachedCharContextAddress(cacheKey, descriptor, playerName) {
    if (!descriptorCache.has(cacheKey)) {
      return 0;
    }
    const cached = descriptorCache.get(cacheKey);
    const address =
      typeof cached === "number" && Number.isFinite(cached) ? cached >>> 0 : 0;
    if (!address) {
      return 0;
    }

    try {
      validateCharContextCandidate(address, descriptor);
      const expectedName = readUtf16(
        address + (descriptor.nameOffset ?? 0x74),
        Math.max(playerName.length, 20)
      );
      if (expectedName !== playerName) {
        return 0;
      }
      return address;
    } catch (error) {
      return 0;
    }
  }

  function getBuildInfo() {
    return version && typeof version.getBuildInfo === "function"
      ? version.getBuildInfo()
      : null;
  }

  function getLookupKeys() {
    return version && typeof version.getLookupKeys === "function"
      ? version.getLookupKeys()
      : [];
  }

  function getActiveDefinitions() {
    const buildInfo = getBuildInfo();
    return (
      findBuildSignatures(
        buildInfo ? buildInfo.buildId : DEFAULT_BUILD_ID,
        getLookupKeys()
      ) || {}
    );
  }

  function getDefinition(path) {
    return getByPath(getActiveDefinitions(), path);
  }

  function resolveReference(path, stack = []) {
    if (stack.includes(path)) {
      throw new Error(
        "Circular resolver reference: " + stack.concat(path).join(" -> ")
      );
    }

    const descriptor = getDefinition(path);
    if (typeof descriptor === "undefined") {
      throw new Error("Resolver key not found: " + path);
    }

    return resolveDescriptor(descriptor, stack.concat(path));
  }

  function resolveDescriptor(descriptor, stack = []) {
    if (typeof descriptor === "number") {
      return descriptor >>> 0;
    }
    if (typeof descriptor === "string") {
      return resolveReference(descriptor, stack);
    }
    if (Array.isArray(descriptor)) {
      return descriptor.map((value) => resolveDescriptor(value, stack));
    }
    if (!descriptor || typeof descriptor !== "object") {
      return descriptor;
    }
    if (typeof descriptor.ref === "string") {
      return resolveReference(descriptor.ref, stack);
    }

    const type =
      descriptor.type ||
      (descriptor.base && Array.isArray(descriptor.offsets)
        ? "pointerChain"
        : null);

    switch (type) {
      case "address":
        return toAddress(
          resolveDescriptor(descriptor.address, stack),
          "literal address"
        );
      case "offsetAddress": {
        const baseAddress = toAddress(
          resolveDescriptor(descriptor.base, stack),
          "offset address base"
        );
        const offset =
          typeof descriptor.offset === "number" && Number.isFinite(descriptor.offset)
            ? descriptor.offset | 0
            : 0;
        return (baseAddress + offset) >>> 0;
      }
      case "ascii": {
        const address = runtime.hook.findAscii(
          descriptor.text,
          descriptor.start,
          descriptor.end
        );
        if (address < 0) {
          if (descriptor.nullable) {
            return 0;
          }
          throw new Error("ASCII signature not found: " + descriptor.text);
        }
        return address;
      }
      case "bytes": {
        const address = runtime.hook.findBytes(
          descriptor.pattern,
          descriptor.start,
          descriptor.end
        );
        if (address < 0) {
          if (descriptor.nullable) {
            return 0;
          }
          throw new Error("Byte signature not found");
        }
        return address;
      }
      case "export": {
        const value =
          runtime.hook.getRawExports()?.[descriptor.name] ||
          runtime.hook.getExports()?.[descriptor.name] ||
          null;
        if (value === null && !descriptor.nullable) {
          throw new Error("Export not found: " + descriptor.name);
        }
        return value;
      }
      case "import": {
        const imports = runtime.hook.getRawImports();
        const value =
          imports &&
          imports[descriptor.module] &&
          imports[descriptor.module][descriptor.name];
        if (typeof value === "undefined" && !descriptor.nullable) {
          throw new Error(
            "Import not found: " + descriptor.module + "." + descriptor.name
          );
        }
        return value ?? null;
      }
      case "charContextByPlayerName": {
        const playerName = resolveCharacterName(descriptor);
        const cacheKey = getDescriptorCacheKey(descriptor, playerName);
        const cachedAddress = getCachedCharContextAddress(
          cacheKey,
          descriptor,
          playerName
        );
        if (cachedAddress) {
          return cachedAddress;
        }
        const start =
          typeof descriptor.start === "number" && descriptor.start >= 0
            ? descriptor.start
            : 0;
        const end =
          typeof descriptor.end === "number" && descriptor.end > start
            ? descriptor.end
            : runtime.hook.memory?.buffer?.byteLength || 0;
        const limit =
          typeof descriptor.limit === "number" && descriptor.limit > 0
            ? descriptor.limit
            : 16;
        const hitIndex =
          typeof descriptor.hitIndex === "number" && descriptor.hitIndex >= 0
            ? descriptor.hitIndex | 0
            : null;
        const nameOffset =
          typeof descriptor.nameOffset === "number"
            ? descriptor.nameOffset | 0
            : 0x74;
        const assumedNameOffset =
          typeof descriptor.assumedNameOffset === "number"
            ? descriptor.assumedNameOffset | 0
            : null;

        if (typeof runtime.map?.findNativeCharContextsByPlayerName === "function") {
          const matches = runtime.map.findNativeCharContextsByPlayerName(playerName, {
            end,
            limit,
            nameOffset,
            start,
          });
          const match = Array.isArray(matches)
            ? matches.find((entry) => {
                if (!entry || typeof entry.address !== "number") {
                  return false;
                }
                if (typeof hitIndex === "number" && entry.hitIndex !== hitIndex) {
                  return false;
                }
                if (
                  typeof assumedNameOffset === "number" &&
                  entry.assumedNameOffset !== assumedNameOffset
                ) {
                  return false;
                }
                try {
                  validateCharContextCandidate(entry.address >>> 0, descriptor);
                  return true;
                } catch (error) {
                  return false;
                }
              }) || null
            : null;

          if (!match) {
            throw new Error(
              "Character name match was not found for the current validation constraints"
            );
          }

          const address = match.address >>> 0;
          validateCharContextCandidate(address, descriptor);
          descriptorCache.set(cacheKey, address);
          return address;
        }

        if (typeof runtime.hook.findAllUtf16 !== "function") {
          throw new Error("UTF-16 scanner is not available");
        }

        const hits = runtime.hook.findAllUtf16(playerName, start, end, limit);
        if (!Array.isArray(hits) || hits.length === 0) {
          throw new Error("Character name hit was not found");
        }

        const hitAddresses =
          typeof hitIndex === "number" ? [hits[hitIndex]] : hits.slice();

        for (const hitAddress of hitAddresses) {
          if (typeof hitAddress !== "number" || !Number.isFinite(hitAddress)) {
            continue;
          }
          const address = (hitAddress - nameOffset) >>> 0;
          if (!address) {
            continue;
          }
          try {
            validateCharContextCandidate(address, descriptor);
            descriptorCache.set(cacheKey, address);
            return address;
          } catch (error) {
            continue;
          }
        }

        throw new Error("Character name hit did not produce a valid char context");
      }
      case "pointerChain": {
        const baseAddress = toAddress(
          resolveDescriptor(descriptor.base, stack),
          "pointer chain base"
        );
        const address = runtime.hook.readPointerChain(
          baseAddress,
          descriptor.offsets
        );
        if (!address && !descriptor.nullable) {
          throw new Error("Pointer chain resolved to null");
        }
        return address;
      }
      case "table": {
        const value = runtime.hook.getTableFunction(descriptor.index);
        if (typeof value !== "function" && !descriptor.nullable) {
          throw new Error("Table function not found: " + descriptor.index);
        }
        return value || null;
      }
      case "utf8": {
        const address = runtime.hook.findUtf8(
          descriptor.text,
          descriptor.start,
          descriptor.end
        );
        if (address < 0) {
          if (descriptor.nullable) {
            return 0;
          }
          throw new Error("UTF-8 signature not found: " + descriptor.text);
        }
        return address;
      }
      default:
        return descriptor;
    }
  }

  function resolve(target) {
    return typeof target === "string"
      ? resolveReference(target)
      : resolveDescriptor(target);
  }

  function tryResolve(target) {
    try {
      return resolve(target);
    } catch (error) {
      return null;
    }
  }

  function resolveAddress(target) {
    return toAddress(resolve(target), typeof target === "string" ? target : "inline");
  }

  function tryResolveAddress(target) {
    try {
      return resolveAddress(target);
    } catch (error) {
      return null;
    }
  }

  function createStructView(addressTarget, schemaTarget) {
    const address = resolveAddress(addressTarget);
    const schema =
      typeof schemaTarget === "string" ? getDefinition(schemaTarget) : schemaTarget;
    if (!schema || typeof schema !== "object") {
      throw new Error("Struct schema not found: " + schemaTarget);
    }
    return runtime.hook.createStructView(address, schema);
  }

  function describe(target) {
    const buildInfo = getBuildInfo();
    const lookupKeys = getLookupKeys();
    const descriptor =
      typeof target === "string" ? getDefinition(target) : target;

    try {
      const value = resolve(target);
      return {
        available: true,
        buildId: buildInfo ? buildInfo.buildId : null,
        definition: descriptor,
        lookupKeys,
        registeredBuilds: listRegisteredBuilds(),
        summary: summarizeValue(value),
        target,
      };
    } catch (error) {
      return {
        available: false,
        buildId: buildInfo ? buildInfo.buildId : null,
        definition: descriptor,
        error: error instanceof Error ? error.message : String(error),
        lookupKeys,
        registeredBuilds: listRegisteredBuilds(),
        target,
      };
    }
  }

  return Object.freeze({
    createStructView,
    describe,
    getActiveDefinitions,
    getBuildInfo,
    getDefinition,
    listRegisteredBuilds,
    mergeBuild(buildId, definition) {
      return mergeBuildSignatures(buildId, definition);
    },
    registerBuild(buildId, definition) {
      return registerBuildSignatures(buildId, definition);
    },
    resolve,
    resolveAddress,
    tryResolve,
    tryResolveAddress,
  });
}
