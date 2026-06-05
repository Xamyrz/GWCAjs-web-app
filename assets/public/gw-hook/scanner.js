const textEncoder = new TextEncoder();

function normalizePattern(pattern) {
  if (typeof pattern === "string") {
    return textEncoder.encode(pattern);
  }
  if (pattern instanceof Uint8Array) {
    return pattern;
  }
  if (Array.isArray(pattern)) {
    return new Uint8Array(pattern);
  }
  throw new TypeError("Pattern must be a string, array, or Uint8Array");
}

function encodeUtf16Le(text) {
  const value = String(text ?? "");
  const bytes = new Uint8Array(value.length * 2);
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    bytes[index * 2] = codeUnit & 0xff;
    bytes[index * 2 + 1] = codeUnit >>> 8;
  }
  return bytes;
}

function normalizeStructField(definition) {
  if (Array.isArray(definition)) {
    const [offset, type, length] = definition;
    return { length, offset, type };
  }
  if (definition && typeof definition === "object") {
    return {
      length: definition.length,
      maxLength: definition.maxLength,
      offset: definition.offset,
      type: definition.type || "u32",
    };
  }
  throw new TypeError("Struct field must be an object or tuple");
}

function normalizeStructSchema(schema) {
  const normalized = {};
  for (const [fieldName, definition] of Object.entries(schema)) {
    normalized[fieldName] = normalizeStructField(definition);
  }
  return normalized;
}

function normalizeRange(views, start, end) {
  const from = typeof start === "number" ? start : 0;
  const to = typeof end === "number" ? end : views.u8.length;
  return {
    from: Math.max(0, from),
    to: Math.min(views.u8.length, to),
  };
}

export function attachScannerTools(runtime) {
  function findAllBytes(pattern, start, end, limit = 128) {
    const views = runtime.ensureViews();
    const bytes = normalizePattern(pattern);
    const range = normalizeRange(views, start, end);
    const matches = [];

    outer: for (
      let index = range.from;
      index <= range.to - bytes.length && matches.length < limit;
      index += 1
    ) {
      for (let offset = 0; offset < bytes.length; offset += 1) {
        if (views.u8[index + offset] !== bytes[offset]) {
          continue outer;
        }
      }
      matches.push(index);
    }

    return matches;
  }

  function findBytes(pattern, start, end) {
    const matches = findAllBytes(pattern, start, end, 1);
    return matches.length > 0 ? matches[0] : -1;
  }

  function findUtf8(text, start, end) {
    return findBytes(textEncoder.encode(text), start, end);
  }

  function findAscii(text, start, end) {
    return findUtf8(text, start, end);
  }

  function findUtf16(text, start, end) {
    return findBytes(encodeUtf16Le(text), start, end);
  }

  function findAllUtf16(text, start, end, limit = 128) {
    return findAllBytes(encodeUtf16Le(text), start, end, limit);
  }

  function scanByType(type, value, start, end, limit = 128) {
    const views = runtime.ensureViews();
    const range = normalizeRange(views, start, end);
    const sizeByType = {
      f32: 4,
      i32: 4,
      ptr: 4,
      u32: 4,
    };
    const byteWidth = sizeByType[type];
    if (!byteWidth) {
      throw new Error("Unsupported scan type: " + type);
    }

    const matches = [];
    for (
      let address = range.from;
      address <= range.to - byteWidth && matches.length < limit;
      address += byteWidth
    ) {
      if (runtime.readType(type, address) === value) {
        matches.push(address);
      }
    }
    return matches;
  }

  function scanU32(value, start, end, limit) {
    return scanByType("u32", value, start, end, limit);
  }

  function scanI32(value, start, end, limit) {
    return scanByType("i32", value, start, end, limit);
  }

  function scanF32(value, start, end, limit) {
    return scanByType("f32", value, start, end, limit);
  }

  function readPointerChain(baseAddress, offsets) {
    let address = baseAddress;
    for (const offset of offsets) {
      address = runtime.readType("ptr", address + offset);
      if (!address) {
        return 0;
      }
    }
    return address;
  }

  function readStruct(address, schema) {
    const normalized = normalizeStructSchema(schema);
    const result = {};
    for (const [fieldName, definition] of Object.entries(normalized)) {
      result[fieldName] = runtime.readType(
        definition.type,
        address + definition.offset,
        definition
      );
    }
    return result;
  }

  function writeStructField(address, fieldDefinition, value) {
    const definition = normalizeStructField(fieldDefinition);
    return runtime.writeType(
      definition.type,
      address + definition.offset,
      value,
      definition
    );
  }

  function createStructView(address, schema) {
    const normalized = normalizeStructSchema(schema);
    const view = {
      $address: address,
      $read() {
        return readStruct(address, normalized);
      },
      $schema: normalized,
      $write(fieldName, value) {
        if (!normalized[fieldName]) {
          throw new Error("Unknown struct field: " + fieldName);
        }
        return writeStructField(address, normalized[fieldName], value);
      },
    };

    for (const [fieldName, definition] of Object.entries(normalized)) {
      Object.defineProperty(view, fieldName, {
        enumerable: true,
        get() {
          return runtime.readType(
            definition.type,
            address + definition.offset,
            definition
          );
        },
        set(value) {
          runtime.writeType(
            definition.type,
            address + definition.offset,
            value,
            definition
          );
        },
      });
    }

    return view;
  }

  return {
    createStructView,
    findAscii,
    findAllBytes,
    findAllUtf16,
    findBytes,
    findUtf16,
    findUtf8,
    readPointerChain,
    readStruct,
    scanF32,
    scanI32,
    scanU32,
    writeStructField,
  };
}
