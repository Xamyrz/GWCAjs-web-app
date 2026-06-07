const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");
const DEFAULT_UTF8_MAX_BYTES = 4096;
const DEFAULT_UTF16_MAX_UNITS = 2048;
const MIN_GAME_POINTER = 0x10000;

export function attachMemoryTools(runtime) {
  const { state } = runtime;

  function refreshMemoryViews() {
    if (!state.memory) {
      state.views = null;
      return null;
    }

    const buffer = state.memory.buffer;
    state.views = {
      dataView: new DataView(buffer),
      f32: new Float32Array(buffer),
      f64: new Float64Array(buffer),
      i8: new Int8Array(buffer),
      i16: new Int16Array(buffer),
      i32: new Int32Array(buffer),
      u8: new Uint8Array(buffer),
      u16: new Uint16Array(buffer),
      u32: new Uint32Array(buffer),
    };
    return state.views;
  }

  function ensureViews() {
    if (
      state.views &&
      state.memory &&
      state.views.u8.buffer !== state.memory.buffer
    ) {
      refreshMemoryViews();
    }
    if (!state.views && state.memory) {
      refreshMemoryViews();
    }
    if (!state.views) {
      throw new Error("WASM memory is not available yet");
    }
    return state.views;
  }

  function getDataView() {
    return ensureViews().dataView;
  }

  function getByteLength() {
    return state.memory?.buffer?.byteLength || 0;
  }

  function isAligned(address, alignment = 1) {
    return (
      Number.isInteger(address) &&
      Number.isInteger(alignment) &&
      alignment > 0 &&
      address % alignment === 0
    );
  }

  function isValidRange(address, length = 1, alignment = 1) {
    if (
      !Number.isInteger(address) ||
      !Number.isInteger(length) ||
      address < 0 ||
      length < 0 ||
      !isAligned(address, alignment)
    ) {
      return false;
    }

    const byteLength = getByteLength();
    return address <= byteLength && length <= byteLength - address;
  }

  function assertRange(address, length = 1, alignment = 1) {
    if (!isValidRange(address, length, alignment)) {
      throw new RangeError(
        "Invalid WASM memory range: address=" +
          address +
          ", length=" +
          length +
          ", alignment=" +
          alignment +
          ", byteLength=" +
          getByteLength()
      );
    }
    return address;
  }

  function isValidPointer(address, options = {}) {
    const {
      alignment = 4,
      allowNull = false,
      length = 1,
      minAddress = MIN_GAME_POINTER,
    } = options;
    if (address === 0) {
      return allowNull;
    }
    return (
      Number.isInteger(minAddress) &&
      address >= minAddress &&
      isValidRange(address, length, alignment)
    );
  }

  function normalizeBytes(bytes) {
    if (bytes instanceof Uint8Array) {
      return bytes;
    }
    if (ArrayBuffer.isView(bytes)) {
      return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }
    if (bytes instanceof ArrayBuffer) {
      return new Uint8Array(bytes);
    }
    return Uint8Array.from(bytes || []);
  }

  function readBytes(address, length) {
    const views = ensureViews();
    assertRange(address, length);
    return views.u8.slice(address, address + length);
  }

  function writeBytes(address, bytes) {
    const views = ensureViews();
    const value = normalizeBytes(bytes);
    assertRange(address, value.byteLength);
    views.u8.set(value, address);
    return address + value.byteLength;
  }

  function readI8(address) {
    assertRange(address, 1);
    return ensureViews().i8[address];
  }

  function readU8(address) {
    assertRange(address, 1);
    return ensureViews().u8[address];
  }

  function readI16(address) {
    assertRange(address, 2);
    return getDataView().getInt16(address, true);
  }

  function readU16(address) {
    assertRange(address, 2);
    return getDataView().getUint16(address, true);
  }

  function readU32(address) {
    assertRange(address, 4);
    return getDataView().getUint32(address, true);
  }

  function readI32(address) {
    assertRange(address, 4);
    return getDataView().getInt32(address, true);
  }

  function readF32(address) {
    assertRange(address, 4);
    return getDataView().getFloat32(address, true);
  }

  function readF64(address) {
    assertRange(address, 8);
    return getDataView().getFloat64(address, true);
  }

  function readPointer(address) {
    return readU32(address);
  }

  function readPointerSlot(address, options = {}) {
    assertRange(address, 4, options.slotAlignment ?? 4);
    const pointer = readPointer(address);
    if (!isValidPointer(pointer, options)) {
      throw new RangeError(
        "Invalid WASM pointer in slot " + address + ": " + pointer
      );
    }
    return pointer;
  }

  function writeI8(address, value) {
    assertRange(address, 1);
    ensureViews().i8[address] = value;
    return address + 1;
  }

  function writeU8(address, value) {
    assertRange(address, 1);
    ensureViews().u8[address] = value;
    return address + 1;
  }

  function writeI16(address, value) {
    assertRange(address, 2);
    getDataView().setInt16(address, value, true);
    return address + 2;
  }

  function writeU16(address, value) {
    assertRange(address, 2);
    getDataView().setUint16(address, value, true);
    return address + 2;
  }

  function writeU32(address, value) {
    assertRange(address, 4);
    getDataView().setUint32(address, value, true);
    return address + 4;
  }

  function writeI32(address, value) {
    assertRange(address, 4);
    getDataView().setInt32(address, value, true);
    return address + 4;
  }

  function writeF32(address, value) {
    assertRange(address, 4);
    getDataView().setFloat32(address, value, true);
    return address + 4;
  }

  function writeF64(address, value) {
    assertRange(address, 8);
    getDataView().setFloat64(address, value, true);
    return address + 8;
  }

  function writePointer(address, value) {
    return writeU32(address, value);
  }

  function writePointerSlot(address, pointer, options = {}) {
    assertRange(address, 4, options.slotAlignment ?? 4);
    if (!isValidPointer(pointer, options)) {
      throw new RangeError(
        "Invalid WASM pointer for slot " + address + ": " + pointer
      );
    }
    return writePointer(address, pointer);
  }

  function normalizeBound(value, fallback, label) {
    const normalized = value === undefined ? fallback : value;
    if (!Number.isInteger(normalized) || normalized < 0) {
      throw new RangeError(label + " must be a non-negative integer");
    }
    return normalized;
  }

  function readUtf8(address, maxLength = DEFAULT_UTF8_MAX_BYTES) {
    const views = ensureViews();
    const limit = normalizeBound(
      maxLength,
      DEFAULT_UTF8_MAX_BYTES,
      "UTF-8 maximum length"
    );
    assertRange(address, limit);
    const end = address + limit;
    let cursor = address;
    while (cursor < end && views.u8[cursor] !== 0) {
      cursor += 1;
    }
    return textDecoder.decode(views.u8.subarray(address, cursor));
  }

  function writeUtf8(address, text, maxLength) {
    const encoded = textEncoder.encode(String(text ?? "") + "\0");
    const capacity = normalizeBound(
      maxLength,
      encoded.length,
      "UTF-8 capacity"
    );
    if (encoded.length > capacity) {
      throw new RangeError(
        "UTF-8 string exceeds reserved space: " +
          encoded.length +
          " > " +
          capacity
      );
    }
    assertRange(address, capacity);
    writeBytes(address, encoded);
    if (encoded.length < capacity) {
      ensureViews().u8.fill(0, address + encoded.length, address + capacity);
    }
    return address + encoded.length;
  }

  function readUtf16(address, maxUnits = DEFAULT_UTF16_MAX_UNITS) {
    const limit = normalizeBound(
      maxUnits,
      DEFAULT_UTF16_MAX_UNITS,
      "UTF-16 maximum units"
    );
    assertRange(address, limit * 2, 2);
    const chars = [];
    for (let index = 0; index < limit; index += 1) {
      const codeUnit = readU16(address + index * 2);
      if (codeUnit === 0) {
        break;
      }
      chars.push(codeUnit);
    }
    return chars.length > 0 ? String.fromCharCode(...chars) : "";
  }

  function writeUtf16(address, text, maxUnits) {
    const value = String(text ?? "");
    const requiredUnits = value.length + 1;
    const capacity = normalizeBound(
      maxUnits,
      requiredUnits,
      "UTF-16 capacity"
    );
    if (requiredUnits > capacity) {
      throw new RangeError(
        "UTF-16 string exceeds reserved space: " +
          requiredUnits +
          " > " +
          capacity
      );
    }
    assertRange(address, capacity * 2, 2);
    for (let index = 0; index < capacity; index += 1) {
      writeU16(
        address + index * 2,
        index < value.length ? value.charCodeAt(index) : 0
      );
    }
    return address + requiredUnits * 2;
  }

  function getRawExports() {
    return (
      state.rawExports ||
      (typeof runtime.getRawExports === "function"
        ? runtime.getRawExports()
        : null)
    );
  }

  function malloc(size) {
    const byteLength = normalizeBound(size, 0, "Allocation size");
    if (byteLength === 0) {
      throw new RangeError("Allocation size must be greater than zero");
    }
    const exportsObject = getRawExports();
    if (!exportsObject || typeof exportsObject.malloc !== "function") {
      throw new Error("malloc export is not available");
    }
    const address = exportsObject.malloc(byteLength) >>> 0;
    ensureViews();
    if (!address || !isValidRange(address, byteLength)) {
      throw new RangeError(
        "malloc returned an invalid WASM range: address=" +
          address +
          ", length=" +
          byteLength
      );
    }
    return address;
  }

  function mallocUtf8(text) {
    const bytes = textEncoder.encode(String(text ?? "") + "\0");
    const address = malloc(bytes.length);
    writeBytes(address, bytes);
    return address;
  }

  function mallocUtf16(text) {
    const value = String(text ?? "");
    const address = malloc((value.length + 1) * 2);
    writeUtf16(address, value);
    return address;
  }

  function free(address) {
    if (!address) {
      return;
    }
    const exportsObject = getRawExports();
    if (!exportsObject || typeof exportsObject.free !== "function") {
      throw new Error("free export is not available");
    }
    exportsObject.free(address);
  }

  function withAllocation(size, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Allocation callback must be a function");
    }
    const address = malloc(size);
    let result;
    try {
      result = callback(address);
    } catch (error) {
      free(address);
      throw error;
    }
    if (result && typeof result.then === "function") {
      return Promise.resolve(result).finally(() => free(address));
    }
    free(address);
    return result;
  }

  function withUtf8(text, callback) {
    const bytes = textEncoder.encode(String(text ?? "") + "\0");
    return withAllocation(bytes.length, (address) => {
      writeBytes(address, bytes);
      return callback(address, bytes.length);
    });
  }

  function withUtf16(text, callback) {
    const value = String(text ?? "");
    const byteLength = (value.length + 1) * 2;
    return withAllocation(byteLength, (address) => {
      writeUtf16(address, value);
      return callback(address, value.length + 1);
    });
  }

  function readType(type, address, options = {}) {
    switch (type) {
      case "i8":
        return readI8(address);
      case "u8":
        return readU8(address);
      case "i16":
        return readI16(address);
      case "u16":
        return readU16(address);
      case "u32":
        return readU32(address);
      case "ptr":
        return readPointer(address);
      case "i32":
        return readI32(address);
      case "f32":
        return readF32(address);
      case "f64":
        return readF64(address);
      case "utf8":
        return readUtf8(address, options.length ?? options.maxLength);
      case "utf16":
        return readUtf16(address, options.units ?? options.maxUnits);
      case "bytes":
        return readBytes(address, options.length ?? 0);
      default:
        throw new Error("Unsupported read type: " + type);
    }
  }

  function writeType(type, address, value, options = {}) {
    switch (type) {
      case "i8":
        return writeI8(address, value);
      case "u8":
        return writeU8(address, value);
      case "i16":
        return writeI16(address, value);
      case "u16":
        return writeU16(address, value);
      case "u32":
        return writeU32(address, value);
      case "ptr":
        return writePointer(address, value);
      case "i32":
        return writeI32(address, value);
      case "f32":
        return writeF32(address, value);
      case "f64":
        return writeF64(address, value);
      case "utf8":
        return writeUtf8(address, value, options.length ?? options.maxLength);
      case "utf16":
        return writeUtf16(address, value, options.units ?? options.maxUnits);
      case "bytes":
        return writeBytes(address, value);
      default:
        throw new Error("Unsupported write type: " + type);
    }
  }

  runtime.assertRange = assertRange;
  runtime.ensureViews = ensureViews;
  runtime.getDataView = getDataView;
  runtime.isAligned = isAligned;
  runtime.isValidPointer = isValidPointer;
  runtime.isValidRange = isValidRange;
  runtime.readType = readType;
  runtime.refreshMemoryViews = refreshMemoryViews;
  runtime.writeType = writeType;

  if (state.memory) {
    refreshMemoryViews();
  }

  return {
    assertRange,
    free,
    isAligned,
    isValidPointer,
    isValidRange,
    malloc,
    mallocUtf8,
    mallocUtf16,
    readBytes,
    readF32,
    readF64,
    readI8,
    readI16,
    readI32,
    readPointer,
    readPointerSlot,
    readU8,
    readU16,
    readU32,
    readUtf8,
    readUtf16,
    refreshMemoryViews,
    withAllocation,
    withUtf8,
    withUtf16,
    writeBytes,
    writeF32,
    writeF64,
    writeI8,
    writeI16,
    writeI32,
    writePointer,
    writePointerSlot,
    writeU8,
    writeU16,
    writeU32,
    writeUtf8,
    writeUtf16,
  };
}
