import { AREA_INFO_SIZE } from "../GameEntities/Map.js";
import { getMemoryLimit, isValidPointer } from "../Utilities/Memory.js";

export const INSTANCE_INFO_SIZE = 0x14;

export const INSTANCE_INFO_OFFSETS = Object.freeze({
  terrainInfo1: 0x00,
  instanceType: 0x04,
  currentMapInfo: 0x08,
  terrainCount: 0x0c,
  terrainInfo2: 0x10,
});

const INSTANCE_INFO_STORAGE_SIZE = 4 + INSTANCE_INFO_SIZE;
const compatibilityStorage = new WeakMap();

function isValidRange(state, address, size) {
  return (
    isValidPointer(state, address) &&
    Number.isInteger(size) &&
    size > 0 &&
    address + size <= getMemoryLimit(state)
  );
}

function getDefinition(state, path) {
  return state?.scanner?.getDefinition(path);
}

function getConfiguredSlotAddress(state) {
  const slotAddress =
    state?.scanner?.tryResolveAddress("modules.map.instanceInfoPtrAddress") || 0;
  if (isValidPointer(state, slotAddress)) {
    return slotAddress >>> 0;
  }

  const legacyAddress =
    state?.scanner?.tryResolveAddress("modules.map.instanceInfoAddress") || 0;
  return isValidPointer(state, legacyAddress) ? legacyAddress >>> 0 : 0;
}

function getCompatibilityStorage(state) {
  const cached = compatibilityStorage.get(state);
  if (
    cached &&
    isValidRange(state, cached.slotAddress, INSTANCE_INFO_STORAGE_SIZE)
  ) {
    return cached;
  }

  const exportsObject = state?.hook?.getRawExports?.();
  if (typeof exportsObject?.malloc !== "function") {
    return null;
  }

  let slotAddress = 0;
  try {
    slotAddress = exportsObject.malloc(INSTANCE_INFO_STORAGE_SIZE) >>> 0;
  } catch (error) {
    return null;
  }
  const infoAddress = (slotAddress + 4) >>> 0;
  if (!isValidRange(state, slotAddress, INSTANCE_INFO_STORAGE_SIZE)) {
    return null;
  }

  const storage = {
    infoAddress,
    slotAddress,
    source: "gwcajsCompatibility",
  };
  compatibilityStorage.set(state, storage);
  return storage;
}

function getAreaInfoAddress(state, mapId) {
  const baseAddress =
    state?.scanner?.tryResolveAddress("modules.map.areaInfoAddress") || 0;
  const count = getDefinition(state, "modules.map.areaInfoCount");
  if (
    !isValidPointer(state, baseAddress) ||
    !Number.isInteger(mapId) ||
    mapId <= 0 ||
    (Number.isInteger(count) && mapId >= count)
  ) {
    return 0;
  }

  const address = (baseAddress + mapId * AREA_INFO_SIZE) >>> 0;
  return isValidPointer(state, address) ? address : 0;
}

function writeCompatibilityInfo(state, storage, mapState) {
  const writeU32 = state?.hook?.writeU32;
  if (typeof writeU32 !== "function") {
    return false;
  }

  const mapId = Number(mapState?.mapId);
  const instanceType = Number(mapState?.mapType);
  const infoAddress = storage.infoAddress;
  const normalizedInstanceType =
    Number.isInteger(instanceType) && instanceType >= 0 && instanceType <= 2
      ? instanceType
      : 2;

  try {
    writeU32(storage.slotAddress, infoAddress);
    writeU32(infoAddress + INSTANCE_INFO_OFFSETS.terrainInfo1, 0);
    writeU32(
      infoAddress + INSTANCE_INFO_OFFSETS.instanceType,
      normalizedInstanceType
    );
    writeU32(
      infoAddress + INSTANCE_INFO_OFFSETS.currentMapInfo,
      getAreaInfoAddress(state, mapId)
    );
    writeU32(infoAddress + INSTANCE_INFO_OFFSETS.terrainCount, 0);
    writeU32(infoAddress + INSTANCE_INFO_OFFSETS.terrainInfo2, 0);
    return true;
  } catch (error) {
    return false;
  }
}

export function getInstanceInfoPtrAddress(state, mapState) {
  const configuredSlotAddress = getConfiguredSlotAddress(state);
  if (configuredSlotAddress) {
    return configuredSlotAddress;
  }

  const storage = getCompatibilityStorage(state);
  return storage && writeCompatibilityInfo(state, storage, mapState)
    ? storage.slotAddress
    : 0;
}
