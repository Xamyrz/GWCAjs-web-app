import { readArray } from "../GameContainers/Array.js";
import { isValidPointer, readValue } from "../Utilities/Memory.js";

export const ATTRIBUTE_SIZE = 0x14;
export const PARTY_ATTRIBUTE_COUNT = 51;
export const PARTY_ATTRIBUTE_SIZE = 0x43c;
export const PARTY_ATTRIBUTE_ACTIVE_IDS_OFFSET = 0x424;

export const ATTRIBUTE_OFFSETS = Object.freeze({
  decrementPoints: 0x0c,
  id: 0x00,
  incrementPoints: 0x10,
  level: 0x08,
  levelBase: 0x04,
});

export function readAttribute(state, address, index = 0) {
  if (
    !isValidPointer(state, address, {
      alignment: 4,
      length: ATTRIBUTE_SIZE,
    })
  ) {
    return null;
  }
  return {
    address: address >>> 0,
    decrementPoints: readValue(
      state,
      "u32",
      address + ATTRIBUTE_OFFSETS.decrementPoints
    ),
    id: readValue(state, "u32", address + ATTRIBUTE_OFFSETS.id),
    incrementPoints: readValue(
      state,
      "u32",
      address + ATTRIBUTE_OFFSETS.incrementPoints
    ),
    index,
    level: readValue(state, "u32", address + ATTRIBUTE_OFFSETS.level),
    levelBase: readValue(state, "u32", address + ATTRIBUTE_OFFSETS.levelBase),
  };
}

export function readPartyAttribute(state, address, index = 0) {
  if (
    !isValidPointer(state, address, {
      alignment: 4,
      length: PARTY_ATTRIBUTE_SIZE,
    })
  ) {
    return null;
  }
  const allAttributes = Array.from(
    { length: PARTY_ATTRIBUTE_COUNT },
    (_, attributeIndex) =>
      readAttribute(
        state,
        address + 4 + attributeIndex * ATTRIBUTE_SIZE,
        attributeIndex
      )
  );
  if (allAttributes.some((attribute) => !attribute)) {
    return null;
  }
  const activeIds = readArray(
    state,
    address + PARTY_ATTRIBUTE_ACTIVE_IDS_OFFSET,
    4,
    {
      allowEmpty: true,
      maxCapacity: PARTY_ATTRIBUTE_COUNT,
      maxSize: PARTY_ATTRIBUTE_COUNT,
    }
  );
  if (!activeIds) {
    return null;
  }
  const activeAttributeIds = Array.from(
    { length: activeIds.size },
    (_, activeIndex) =>
      readValue(state, "u32", activeIds.buffer + activeIndex * 4)
  );
  if (
    activeAttributeIds.some(
      (attributeId) =>
        !Number.isInteger(attributeId) ||
        attributeId < 0 ||
        attributeId >= PARTY_ATTRIBUTE_COUNT
    )
  ) {
    return null;
  }
  return {
    activeAttributeIds,
    address: address >>> 0,
    agentId: readValue(state, "u32", address),
    allAttributes,
    attributes: activeAttributeIds.map(
      (attributeId) => allAttributes[attributeId]
    ),
    index,
  };
}
