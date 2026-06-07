import { isValidPointer, readUtf16, readValue } from "../Utilities/Memory.js";

export const HERO_BEHAVIOR = Object.freeze({
  AvoidCombat: 2,
  Fight: 0,
  Guard: 1,
});

export const HERO_FLAG_SIZE = 0x24;
export const HERO_INFO_SIZE = 0x9c;
export const PET_INFO_SIZE = 0x1c;

export const HERO_FLAG_OFFSETS = Object.freeze({
  agentId: 0x04,
  behavior: 0x0c,
  flagX: 0x10,
  flagY: 0x14,
  heroId: 0x00,
  level: 0x08,
  lockedTargetId: 0x1c,
  unknown18: 0x18,
  unknown20: 0x20,
});

export const HERO_INFO_OFFSETS = Object.freeze({
  agentId: 0x04,
  heroFileId: 0x14,
  heroId: 0x00,
  level: 0x08,
  modelFileId: 0x18,
  name: 0x74,
  primary: 0x0c,
  secondary: 0x10,
});

export const PET_INFO_OFFSETS = Object.freeze({
  agentId: 0x00,
  behavior: 0x14,
  lockedTargetId: 0x18,
  modelFileId1: 0x0c,
  modelFileId2: 0x10,
  name: 0x08,
  ownerAgentId: 0x04,
});

function hasRange(state, address, size) {
  return isValidPointer(state, address, {
    alignment: 4,
    length: size,
  });
}

function isPlainDisplayName(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    [...value].every((character) => {
      const codePoint = character.codePointAt(0);
      return (
        character === " " ||
        character === "'" ||
        character === "-" ||
        (codePoint >= 0x30 && codePoint <= 0x39) ||
        (codePoint >= 0x41 && codePoint <= 0x5a) ||
        (codePoint >= 0x61 && codePoint <= 0x7a)
      );
    })
  );
}

export function readHeroFlag(state, address, index = 0) {
  if (!hasRange(state, address, HERO_FLAG_SIZE)) {
    return null;
  }
  return {
    address: address >>> 0,
    agentId: readValue(state, "u32", address + HERO_FLAG_OFFSETS.agentId),
    behavior: readValue(state, "u32", address + HERO_FLAG_OFFSETS.behavior),
    flag: {
      x: readValue(state, "f32", address + HERO_FLAG_OFFSETS.flagX),
      y: readValue(state, "f32", address + HERO_FLAG_OFFSETS.flagY),
    },
    heroId: readValue(state, "u32", address + HERO_FLAG_OFFSETS.heroId),
    index,
    level: readValue(state, "u32", address + HERO_FLAG_OFFSETS.level),
    lockedTargetId: readValue(
      state,
      "u32",
      address + HERO_FLAG_OFFSETS.lockedTargetId
    ),
    unknown18: readValue(state, "u32", address + HERO_FLAG_OFFSETS.unknown18),
    unknown20: readValue(state, "u32", address + HERO_FLAG_OFFSETS.unknown20),
  };
}

export function readHeroInfo(state, address, index = 0) {
  if (!hasRange(state, address, HERO_INFO_SIZE)) {
    return null;
  }
  return {
    address: address >>> 0,
    agentId: readValue(state, "u32", address + HERO_INFO_OFFSETS.agentId),
    heroFileId: readValue(
      state,
      "u32",
      address + HERO_INFO_OFFSETS.heroFileId
    ),
    heroId: readValue(state, "u32", address + HERO_INFO_OFFSETS.heroId),
    index,
    level: readValue(state, "u32", address + HERO_INFO_OFFSETS.level),
    modelFileId: readValue(
      state,
      "u32",
      address + HERO_INFO_OFFSETS.modelFileId
    ),
    name: readUtf16(state, address + HERO_INFO_OFFSETS.name, 20),
    primary: readValue(state, "u32", address + HERO_INFO_OFFSETS.primary),
    secondary: readValue(state, "u32", address + HERO_INFO_OFFSETS.secondary),
  };
}

export function readPetInfo(state, address, index = 0) {
  if (!hasRange(state, address, PET_INFO_SIZE)) {
    return null;
  }
  const nameAddress = readValue(state, "u32", address + PET_INFO_OFFSETS.name);
  const rawName = nameAddress ? readUtf16(state, nameAddress, 64) : "";
  return {
    address: address >>> 0,
    agentId: readValue(state, "u32", address + PET_INFO_OFFSETS.agentId),
    behavior: readValue(state, "u32", address + PET_INFO_OFFSETS.behavior),
    index,
    lockedTargetId: readValue(
      state,
      "u32",
      address + PET_INFO_OFFSETS.lockedTargetId
    ),
    modelFileId1: readValue(
      state,
      "u32",
      address + PET_INFO_OFFSETS.modelFileId1
    ),
    modelFileId2: readValue(
      state,
      "u32",
      address + PET_INFO_OFFSETS.modelFileId2
    ),
    name: isPlainDisplayName(rawName) ? rawName : null,
    nameEncoding: rawName && !isPlainDisplayName(rawName) ? "encoded" : "plain",
    nameAddress: nameAddress >>> 0,
    ownerAgentId: readValue(
      state,
      "u32",
      address + PET_INFO_OFFSETS.ownerAgentId
    ),
    rawName,
  };
}
