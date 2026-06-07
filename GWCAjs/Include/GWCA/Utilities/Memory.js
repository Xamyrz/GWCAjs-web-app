const TYPE_SIZES = Object.freeze({
  f32: 4,
  f64: 8,
  i8: 1,
  i16: 2,
  i32: 4,
  ptr: 4,
  u8: 1,
  u16: 2,
  u32: 4,
});

const MIN_GAME_POINTER = 0x10000;

export function getMemoryLimit(state) {
  return Math.max(
    state?.memory?.byteLength || 0,
    state?.hook?.memory?.buffer?.byteLength || 0
  );
}

export function isAligned(value, alignment = 1) {
  return (
    Number.isInteger(value) &&
    Number.isInteger(alignment) &&
    alignment > 0 &&
    value % alignment === 0
  );
}

export function isValidRange(state, address, length = 1, alignment = 1) {
  const limit = getMemoryLimit(state);
  return (
    Number.isInteger(address) &&
    Number.isInteger(length) &&
    address >= 0 &&
    length >= 0 &&
    isAligned(address, alignment) &&
    address <= limit &&
    length <= limit - address
  );
}

export function isValidPointer(state, value, options = {}) {
  const {
    alignment = 4,
    allowNull = false,
    length = 1,
    minAddress = MIN_GAME_POINTER,
  } = options;
  if (value === 0) {
    return allowNull;
  }
  return (
    Number.isInteger(minAddress) &&
    value >= minAddress &&
    isValidRange(state, value, length, alignment)
  );
}

export function readValue(state, type, address, options = {}) {
  if (!state?.memory || !address) {
    return null;
  }
  const size = TYPE_SIZES[type];
  if (size && !isValidRange(state, address, size)) {
    return null;
  }
  try {
    return state.memory.readType(type, address, options);
  } catch (error) {
    return null;
  }
}

export function writeValue(state, type, address, value, options = {}) {
  if (!state?.memory || !address) {
    return false;
  }
  const size = TYPE_SIZES[type];
  if (size && !isValidRange(state, address, size)) {
    return false;
  }
  try {
    state.memory.writeType(type, address, value, options);
    return true;
  } catch (error) {
    return false;
  }
}

export function readPointer(state, address) {
  return readValue(state, "ptr", address);
}

export function readPointerSlot(state, address, options = {}) {
  const pointer = readPointer(state, address);
  return isValidPointer(state, pointer, options) ? pointer : null;
}

export function writePointerSlot(state, address, pointer, options = {}) {
  if (!isValidPointer(state, pointer, options)) {
    return false;
  }
  const hook = state?.hook;
  if (typeof hook?.writePointerSlot === "function") {
    try {
      hook.writePointerSlot(address, pointer, options);
      return true;
    } catch (error) {
      return false;
    }
  }
  return writeValue(state, "ptr", address, pointer);
}

export function readUtf8(state, address, maxBytes = 4096) {
  const hook = state?.hook;
  if (
    !hook ||
    typeof hook.readUtf8 !== "function" ||
    !address ||
    !isValidRange(state, address, maxBytes)
  ) {
    return "";
  }
  try {
    return hook.readUtf8(address, maxBytes);
  } catch (error) {
    return "";
  }
}

export function writeUtf8(state, address, text, maxBytes) {
  const hook = state?.hook;
  if (!hook || typeof hook.writeUtf8 !== "function" || !address) {
    return false;
  }
  try {
    hook.writeUtf8(address, String(text ?? ""), maxBytes);
    return true;
  } catch (error) {
    return false;
  }
}

export function readUtf16(state, address, maxUnits = 64) {
  const hook = state?.hook;
  const limit = Number.isInteger(maxUnits) ? Math.max(0, maxUnits) : 0;
  if (
    !hook ||
    !address ||
    !isValidRange(state, address, limit * 2, 2)
  ) {
    return "";
  }

  if (typeof hook.readUtf16 === "function") {
    try {
      return hook.readUtf16(address, limit);
    } catch (error) {
      return "";
    }
  }
  if (typeof hook.readU16 !== "function") {
    return "";
  }

  const chars = [];
  for (let index = 0; index < limit; index += 1) {
    let codeUnit = 0;
    try {
      codeUnit = hook.readU16(address + index * 2);
    } catch (error) {
      return "";
    }
    if (!codeUnit) {
      break;
    }
    chars.push(codeUnit);
  }
  return chars.length > 0 ? String.fromCharCode(...chars) : "";
}

export function writeUtf16(state, address, text, maxUnits) {
  const hook = state?.hook;
  if (
    !hook ||
    (typeof hook.writeUtf16 !== "function" &&
      typeof hook.writeU16 !== "function") ||
    !address
  ) {
    return false;
  }

  const value = String(text ?? "");
  const limit =
    maxUnits === undefined
      ? value.length + 1
      : Number.isInteger(maxUnits)
        ? Math.max(0, maxUnits)
        : 0;
  if (
    value.length + 1 > limit ||
    !isValidRange(state, address, limit * 2, 2)
  ) {
    return false;
  }

  if (typeof hook.writeUtf16 === "function") {
    try {
      hook.writeUtf16(address, value, limit);
      return true;
    } catch (error) {
      return false;
    }
  }

  try {
    for (let index = 0; index < limit; index += 1) {
      const codeUnit = index < value.length ? value.charCodeAt(index) : 0;
      hook.writeU16(address + index * 2, codeUnit);
    }
    return true;
  } catch (error) {
    return false;
  }
}

export function withScopedAllocation(state, size, callback) {
  const hook = state?.hook;
  if (!hook || typeof callback !== "function") {
    throw new TypeError("A memory hook and allocation callback are required");
  }
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError("Allocation size must be a positive integer");
  }
  if (typeof hook.withAllocation === "function") {
    return hook.withAllocation(size, callback);
  }

  const exportsObject =
    typeof hook.getRawExports === "function" ? hook.getRawExports() : null;
  if (
    typeof exportsObject?.malloc !== "function" ||
    typeof exportsObject?.free !== "function"
  ) {
    throw new Error("malloc/free exports are not available");
  }

  const address = exportsObject.malloc(size) >>> 0;
  if (!address || !isValidRange(state, address, size)) {
    throw new RangeError("malloc returned an invalid WASM range");
  }

  let result;
  try {
    result = callback(address);
  } catch (error) {
    exportsObject.free(address);
    throw error;
  }
  if (result && typeof result.then === "function") {
    return Promise.resolve(result).finally(() => exportsObject.free(address));
  }
  exportsObject.free(address);
  return result;
}
