const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");

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

  function readBytes(address, length) {
    const views = ensureViews();
    return views.u8.slice(address, address + length);
  }

  function writeBytes(address, bytes) {
    const views = ensureViews();
    views.u8.set(bytes, address);
    return address + bytes.length;
  }

  function readU8(address) {
    return ensureViews().u8[address];
  }

  function readU16(address) {
    return getDataView().getUint16(address, true);
  }

  function readU32(address) {
    return getDataView().getUint32(address, true);
  }

  function readI32(address) {
    return getDataView().getInt32(address, true);
  }

  function readF32(address) {
    return getDataView().getFloat32(address, true);
  }

  function readF64(address) {
    return getDataView().getFloat64(address, true);
  }

  function writeU8(address, value) {
    ensureViews().u8[address] = value;
    return address + 1;
  }

  function writeU16(address, value) {
    getDataView().setUint16(address, value, true);
    return address + 2;
  }

  function writeU32(address, value) {
    getDataView().setUint32(address, value, true);
    return address + 4;
  }

  function writeI32(address, value) {
    getDataView().setInt32(address, value, true);
    return address + 4;
  }

  function writeF32(address, value) {
    getDataView().setFloat32(address, value, true);
    return address + 4;
  }

  function writeF64(address, value) {
    getDataView().setFloat64(address, value, true);
    return address + 8;
  }

  function readUtf8(address, maxLength) {
    const views = ensureViews();
    const end = Math.min(
      views.u8.length,
      address + (typeof maxLength === "number" ? maxLength : views.u8.length)
    );
    let cursor = address;
    while (cursor < end && views.u8[cursor] !== 0) {
      cursor += 1;
    }
    return textDecoder.decode(views.u8.slice(address, cursor));
  }

  function writeUtf8(address, text, maxLength) {
    const encoded = textEncoder.encode(text + "\0");
    if (typeof maxLength === "number" && encoded.length > maxLength) {
      throw new RangeError(
        "UTF-8 string exceeds reserved space: " + encoded.length + " > " + maxLength
      );
    }
    writeBytes(address, encoded);
    if (typeof maxLength === "number" && encoded.length < maxLength) {
      ensureViews().u8.fill(0, address + encoded.length, address + maxLength);
    }
    return address + encoded.length;
  }

  function mallocUtf8(text) {
    if (!state.rawExports || typeof state.rawExports.malloc !== "function") {
      throw new Error("malloc export is not available");
    }
    const bytes = textEncoder.encode(text + "\0");
    const address = state.rawExports.malloc(bytes.length);
    writeBytes(address, bytes);
    return address;
  }

  function free(address) {
    if (!state.rawExports || typeof state.rawExports.free !== "function") {
      throw new Error("free export is not available");
    }
    state.rawExports.free(address);
  }

  function readType(type, address, options = {}) {
    switch (type) {
      case "u8":
        return readU8(address);
      case "u16":
        return readU16(address);
      case "u32":
      case "ptr":
        return readU32(address);
      case "i32":
        return readI32(address);
      case "f32":
        return readF32(address);
      case "f64":
        return readF64(address);
      case "utf8":
        return readUtf8(address, options.length ?? options.maxLength);
      case "bytes":
        return readBytes(address, options.length ?? 0);
      default:
        throw new Error("Unsupported read type: " + type);
    }
  }

  function writeType(type, address, value, options = {}) {
    switch (type) {
      case "u8":
        return writeU8(address, value);
      case "u16":
        return writeU16(address, value);
      case "u32":
      case "ptr":
        return writeU32(address, value);
      case "i32":
        return writeI32(address, value);
      case "f32":
        return writeF32(address, value);
      case "f64":
        return writeF64(address, value);
      case "utf8":
        return writeUtf8(address, value, options.length ?? options.maxLength);
      case "bytes":
        return writeBytes(address, value);
      default:
        throw new Error("Unsupported write type: " + type);
    }
  }

  runtime.ensureViews = ensureViews;
  runtime.getDataView = getDataView;
  runtime.readType = readType;
  runtime.refreshMemoryViews = refreshMemoryViews;
  runtime.writeType = writeType;

  if (state.memory) {
    refreshMemoryViews();
  }

  return {
    free,
    mallocUtf8,
    readBytes,
    readF32,
    readF64,
    readI32,
    readU8,
    readU16,
    readU32,
    readUtf8,
    refreshMemoryViews,
    writeBytes,
    writeF32,
    writeF64,
    writeI32,
    writeU8,
    writeU16,
    writeU32,
    writeUtf8,
  };
}
