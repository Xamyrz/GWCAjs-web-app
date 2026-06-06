import {
  getMemoryLimit,
  isValidPointer,
  readValue,
} from "../Utilities/Memory.js";

export function readArray(state, address, stride) {
  if (!address) {
    return null;
  }

  const buffer = readValue(state, "u32", address);
  const capacity = readValue(state, "u32", address + 4);
  const size = readValue(state, "u32", address + 8);
  const param = readValue(state, "u32", address + 12);

  if (!isValidPointer(state, buffer)) {
    return null;
  }

  const normalizedSize =
    typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 0;
  const normalizedCapacity =
    typeof capacity === "number" && Number.isFinite(capacity) && capacity > 0
      ? Math.max(capacity, normalizedSize)
      : normalizedSize;
  if (normalizedCapacity <= 0) {
    return null;
  }

  const bufferEnd = buffer + normalizedCapacity * stride;
  if (bufferEnd <= buffer || bufferEnd > getMemoryLimit(state)) {
    return null;
  }

  return {
    address,
    buffer,
    bufferEnd,
    capacity: normalizedCapacity,
    param,
    rawCapacity:
      typeof capacity === "number" && Number.isFinite(capacity) ? capacity : null,
    size: normalizedSize,
    stride,
  };
}

export function getArraySlotCount(array) {
  if (!array) {
    return 0;
  }
  const size =
    typeof array.size === "number" && Number.isFinite(array.size) && array.size > 0
      ? array.size
      : 0;
  const capacity =
    typeof array.capacity === "number" &&
    Number.isFinite(array.capacity) &&
    array.capacity > 0
      ? array.capacity
      : 0;
  return Math.max(size, capacity) | 0;
}
