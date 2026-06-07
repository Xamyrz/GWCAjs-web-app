import {
  getMemoryLimit,
  isValidPointer,
  isValidRange,
  readValue,
} from "../Utilities/Memory.js";

export const ARRAY_HEADER_SIZE = 0x10;

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function normalizeLimit(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

export function readArray(state, address, stride, options = {}) {
  if (
    !address ||
    !isPositiveInteger(stride) ||
    !isValidRange(
      state,
      address,
      ARRAY_HEADER_SIZE,
      options.headerAlignment ?? 4
    )
  ) {
    return null;
  }

  const buffer = readValue(state, "u32", address);
  const capacity = readValue(state, "u32", address + 4);
  const size = readValue(state, "u32", address + 8);
  const param = readValue(state, "u32", address + 12);

  if (
    !Number.isInteger(buffer) ||
    !Number.isInteger(capacity) ||
    !Number.isInteger(size) ||
    !Number.isInteger(param)
  ) {
    return null;
  }

  const maxCapacity = normalizeLimit(
    options.maxCapacity,
    Number.MAX_SAFE_INTEGER
  );
  const maxSize = normalizeLimit(options.maxSize, maxCapacity);
  if (
    capacity > maxCapacity ||
    size > maxSize ||
    size > capacity
  ) {
    return null;
  }

  if (capacity === 0) {
    if (!options.allowEmpty || size !== 0 || buffer !== 0) {
      return null;
    }
    return {
      address: address >>> 0,
      buffer: 0,
      bufferEnd: 0,
      capacity: 0,
      empty: true,
      param: param >>> 0,
      rawCapacity: 0,
      size: 0,
      stride,
    };
  }

  const memoryLimit = getMemoryLimit(state);
  const availableBytes = memoryLimit - buffer;
  if (
    availableBytes < 0 ||
    capacity > Math.floor(availableBytes / stride)
  ) {
    return null;
  }

  const byteLength = capacity * stride;
  if (
    !isValidPointer(state, buffer, {
      alignment: options.bufferAlignment ?? 4,
      length: byteLength,
      minAddress: options.minBufferAddress,
    })
  ) {
    return null;
  }

  return {
    address: address >>> 0,
    buffer: buffer >>> 0,
    bufferEnd: buffer + byteLength,
    byteLength,
    capacity: capacity >>> 0,
    empty: size === 0,
    param: param >>> 0,
    rawCapacity: capacity >>> 0,
    size: size >>> 0,
    stride,
  };
}

export function getArraySlotCount(array) {
  if (!array) {
    return 0;
  }
  const size = isPositiveInteger(array.size) ? array.size : 0;
  const capacity =
    isPositiveInteger(array.capacity) ? array.capacity : 0;
  return Math.max(size, capacity);
}

export function getArrayEntryAddress(array, index, options = {}) {
  if (!array || !Number.isInteger(index) || index < 0) {
    return 0;
  }
  const limit = options.useCapacity ? array.capacity : array.size;
  if (!Number.isInteger(limit) || index >= limit) {
    return 0;
  }
  const address = array.buffer + index * array.stride;
  return Number.isSafeInteger(address) && address < array.bufferEnd
    ? address >>> 0
    : 0;
}

export function readPointerArray(state, address, options = {}) {
  const array = readArray(state, address, 4, options);
  if (!array) {
    return null;
  }

  const slotCount = options.useCapacity ? array.capacity : array.size;
  const count = normalizeLimit(options.count, slotCount);
  if (count > slotCount) {
    return null;
  }

  const allowNull = options.allowNull !== false;
  const pointerOptions = options.pointerOptions || {};
  const pointers = [];
  for (let index = 0; index < count; index += 1) {
    const slotAddress = getArrayEntryAddress(array, index, {
      useCapacity: options.useCapacity,
    });
    const pointer = readValue(state, "u32", slotAddress);
    if (pointer === 0 && allowNull) {
      pointers.push(0);
      continue;
    }
    if (!isValidPointer(state, pointer, pointerOptions)) {
      return null;
    }
    pointers.push(pointer >>> 0);
  }

  return {
    ...array,
    pointerCount: pointers.length,
    pointers,
    usesCapacity: !!options.useCapacity,
  };
}
