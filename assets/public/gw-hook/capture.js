export function createCaptureRuntime(global) {
  let moduleObject =
    global.Module && typeof global.Module === "object" ? global.Module : null;

  const PLAYER_ACTION_EXPORT_PATCHES = Object.freeze([
    { name: "__gwca_msg_send_order_guild_adjust_faction", functionIndex: 6893 },
    { name: "__gwca_msg_send_order_set_profession_secondary", functionIndex: 6903 },
    { name: "__gwca_msg_send_set_title", functionIndex: 6924 },
    { name: "__gwca_msg_send_set_title_none", functionIndex: 6925 },
  ]);

  const MAP_ACTION_EXPORT_PATCHES = Object.freeze([
    { name: "__gwca_map_query_altitude", functionIndex: 5557 },
    { name: "__gwca_party_select_challenge_mission", functionIndex: 10577 },
    { name: "__gwca_party_cancel_enter_challenge", functionIndex: 10574 },
    { name: "__gwca_msg_send_travel_mission", functionIndex: 10632 },
    { name: "__gwca_msg_send_abort_cinematic", functionIndex: 7768 },
  ]);

  const GUILD_ACTION_EXPORT_PATCHES = Object.freeze([
    { name: "__gwca_msg_send_travel_guild_hall", functionIndex: 10631 },
    { name: "__gwca_msg_send_travel_mission_login", functionIndex: 10633 },
  ]);

  const PARTY_ACTION_EXPORT_PATCHES = Object.freeze([
    { name: "__gwca_party_button_on_click", functionIndex: 16298 },
    { name: "__gwca_msg_send_hard_mode_set", functionIndex: 10629 },
    { name: "__gwca_msg_send_signal", functionIndex: 10630 },
  ]);

  const TEXT_EXPORT_PATCHES = Object.freeze([
    { name: "__gwca_text_resolve_issue", functionIndex: 5864 },
    { name: "__gwca_char_get_coded_name", functionIndex: 9107 },
  ]);

  const GWCA_EXPORT_PATCHES = Object.freeze([
    ...PLAYER_ACTION_EXPORT_PATCHES,
    ...MAP_ACTION_EXPORT_PATCHES,
    ...GUILD_ACTION_EXPORT_PATCHES,
    ...PARTY_ACTION_EXPORT_PATCHES,
    ...TEXT_EXPORT_PATCHES,
  ]);

  const listeners = new Map();
  const importWrappers = new Map();
  const exportWrappers = new Map();
  const captures = [];
  const hookedModules = new WeakSet();
  let debugEnabled = false;
  try {
    debugEnabled =
      !!global.localStorage &&
      global.localStorage.getItem("gw.hook.debug") === "1";
  } catch (error) {
    debugEnabled = false;
  }

  const state = {
    module: moduleObject,
    instance: null,
    wasmModule: null,
    rawExports: null,
    rawImports: null,
    wrappedImports: null,
    exportsProxy: null,
    memory: null,
    table: null,
    loader: null,
    runtimeInitialized: false,
    views: null,
  };

  let readyResolve;
  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });
  let capturedResolve;
  const captured = new Promise((resolve) => {
    capturedResolve = resolve;
  });

  const runtime = {
    api: null,
    captured,
    global,
    ready,
    refreshMemoryViews() {
      return state.views;
    },
    state,
  };

  function debugLog() {
    if (!debugEnabled || !global.console) {
      return;
    }
    global.console.debug("[GWHook]", ...arguments);
  }

  function emit(eventName, payload) {
    const handlers = listeners.get(eventName);
    if (!handlers || handlers.size === 0) {
      return;
    }
    for (const handler of Array.from(handlers)) {
      try {
        handler(payload);
      } catch (error) {
        if (global.console) {
          global.console.error("[GWHook] listener failed", eventName, error);
        }
      }
    }
  }

  function on(eventName, handler) {
    let handlers = listeners.get(eventName);
    if (!handlers) {
      handlers = new Set();
      listeners.set(eventName, handlers);
    }
    handlers.add(handler);
    return function unsubscribe() {
      off(eventName, handler);
    };
  }

  function once(eventName, handler) {
    const unsubscribe = on(eventName, function onEvent(payload) {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  function off(eventName, handler) {
    const handlers = listeners.get(eventName);
    if (!handlers) {
      return;
    }
    handlers.delete(handler);
    if (handlers.size === 0) {
      listeners.delete(eventName);
    }
  }

  function wrapperKey(moduleName, importName) {
    return moduleName + ":" + importName;
  }

  function normalizeTableRange(start, count) {
    const length = state.table ? state.table.length : 0;
    const from = Math.max(0, typeof start === "number" ? start : 0);
    const size =
      typeof count === "number" && count >= 0 ? Math.floor(count) : 32;
    return {
      count: Math.max(0, Math.min(size, Math.max(0, length - from))),
      from: Math.min(from, length),
    };
  }

  function toPatchableBytes(source) {
    if (source instanceof WebAssembly.Module) {
      return null;
    }
    if (source instanceof ArrayBuffer) {
      return new Uint8Array(source);
    }
    if (ArrayBuffer.isView(source)) {
      return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    }
    return null;
  }

  function readVarU32(bytes, offset, end = bytes.length) {
    let result = 0;
    let shift = 0;
    let cursor = offset;
    while (cursor < end) {
      const byte = bytes[cursor];
      result |= (byte & 0x7f) << shift;
      cursor += 1;
      if ((byte & 0x80) === 0) {
        return { next: cursor, value: result >>> 0 };
      }
      shift += 7;
      if (shift > 35) {
        break;
      }
    }
    return null;
  }

  function writeVarU32(value) {
    let remaining = value >>> 0;
    const output = [];
    do {
      let byte = remaining & 0x7f;
      remaining >>>= 7;
      if (remaining) {
        byte |= 0x80;
      }
      output.push(byte);
    } while (remaining);
    return output;
  }

  function readName(bytes, offset, end) {
    const lengthInfo = readVarU32(bytes, offset, end);
    if (!lengthInfo) {
      return null;
    }
    const nameStart = lengthInfo.next;
    const nameEnd = nameStart + lengthInfo.value;
    if (nameEnd > end) {
      return null;
    }
    let value = "";
    for (let cursor = nameStart; cursor < nameEnd; cursor += 1) {
      value += String.fromCharCode(bytes[cursor]);
    }
    return {
      next: nameEnd,
      value,
    };
  }

  function writeName(value) {
    const bytes = [];
    for (let index = 0; index < value.length; index += 1) {
      bytes.push(value.charCodeAt(index) & 0xff);
    }
    return writeVarU32(bytes.length).concat(bytes);
  }

  function bytesContainAscii(bytes, value) {
    if (!value || bytes.length < value.length) {
      return false;
    }
    const needle = [];
    for (let index = 0; index < value.length; index += 1) {
      needle.push(value.charCodeAt(index) & 0xff);
    }
    const limit = bytes.length - needle.length;
    for (let offset = 0; offset <= limit; offset += 1) {
      let matched = true;
      for (let index = 0; index < needle.length; index += 1) {
        if (bytes[offset + index] !== needle[index]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        return true;
      }
    }
    return false;
  }

  function isGuildWarsWasm(bytes) {
    return (
      bytesContainAscii(bytes, "Gw.wasm.debug") &&
      bytesContainAscii(bytes, "external_debug_info")
    );
  }

  function patchGuildWarsWasmExports(source) {
    const bytes = toPatchableBytes(source);
    if (!bytes || bytes.length < 8) {
      return source;
    }
    if (
      bytes[0] !== 0x00 ||
      bytes[1] !== 0x61 ||
      bytes[2] !== 0x73 ||
      bytes[3] !== 0x6d
    ) {
      return source;
    }
    if (!isGuildWarsWasm(bytes)) {
      return source;
    }

    let cursor = 8;
    while (cursor < bytes.length) {
      const sectionStart = cursor;
      const sectionId = bytes[cursor];
      cursor += 1;
      const sizeInfo = readVarU32(bytes, cursor);
      if (!sizeInfo) {
        return source;
      }
      const payloadStart = sizeInfo.next;
      const payloadEnd = payloadStart + sizeInfo.value;
      if (payloadEnd > bytes.length) {
        return source;
      }

      if (sectionId !== 7) {
        cursor = payloadEnd;
        continue;
      }

      const countInfo = readVarU32(bytes, payloadStart, payloadEnd);
      if (!countInfo) {
        return source;
      }

      const existingNames = new Set();
      let entryCursor = countInfo.next;
      for (let index = 0; index < countInfo.value; index += 1) {
        const name = readName(bytes, entryCursor, payloadEnd);
        if (!name || name.next + 1 > payloadEnd) {
          return source;
        }
        existingNames.add(name.value);
        entryCursor = name.next + 1;
        const exportIndex = readVarU32(bytes, entryCursor, payloadEnd);
        if (!exportIndex) {
          return source;
        }
        entryCursor = exportIndex.next;
      }

      const missingPatches = GWCA_EXPORT_PATCHES.filter(
        (patch) => !existingNames.has(patch.name)
      );
      if (missingPatches.length === 0) {
        return source;
      }

      const newEntries = [];
      for (const patch of missingPatches) {
        newEntries.push(...writeName(patch.name));
        newEntries.push(0x00);
        newEntries.push(...writeVarU32(patch.functionIndex));
      }

      const newCount = countInfo.value + missingPatches.length;
      const originalEntries = bytes.slice(countInfo.next, payloadEnd);
      const newPayload = new Uint8Array(
        writeVarU32(newCount).length + originalEntries.length + newEntries.length
      );
      let writeOffset = 0;
      const encodedCount = writeVarU32(newCount);
      newPayload.set(encodedCount, writeOffset);
      writeOffset += encodedCount.length;
      newPayload.set(originalEntries, writeOffset);
      writeOffset += originalEntries.length;
      newPayload.set(newEntries, writeOffset);

      const encodedSize = writeVarU32(newPayload.length);
      const patched = new Uint8Array(
        sectionStart + 1 + encodedSize.length + newPayload.length + (bytes.length - payloadEnd)
      );
      patched.set(bytes.slice(0, sectionStart + 1), 0);
      patched.set(encodedSize, sectionStart + 1);
      patched.set(newPayload, sectionStart + 1 + encodedSize.length);
      patched.set(
        bytes.slice(payloadEnd),
        sectionStart + 1 + encodedSize.length + newPayload.length
      );
      debugLog(
        "patched wasm exports",
        missingPatches.map((patch) => patch.name)
      );
      return patched;
    }

    return source;
  }

  function patchGuildWarsWasmTableCapacity(source) {
    const bytes = toPatchableBytes(source);
    if (!bytes || bytes.length < 8 || !isGuildWarsWasm(bytes)) {
      return source;
    }

    let cursor = 8;
    while (cursor < bytes.length) {
      const sectionStart = cursor;
      const sectionId = bytes[cursor];
      cursor += 1;
      const sizeInfo = readVarU32(bytes, cursor);
      if (!sizeInfo) {
        return source;
      }
      const payloadStart = sizeInfo.next;
      const payloadEnd = payloadStart + sizeInfo.value;
      if (payloadEnd > bytes.length) {
        return source;
      }
      if (sectionId !== 4) {
        cursor = payloadEnd;
        continue;
      }

      const countInfo = readVarU32(bytes, payloadStart, payloadEnd);
      if (!countInfo || countInfo.value !== 1) {
        return source;
      }
      let entryCursor = countInfo.next;
      if (bytes[entryCursor] !== 0x70) {
        return source;
      }
      entryCursor += 1;
      const flagsInfo = readVarU32(bytes, entryCursor, payloadEnd);
      if (!flagsInfo || flagsInfo.value !== 1) {
        return source;
      }
      const minInfo = readVarU32(bytes, flagsInfo.next, payloadEnd);
      if (!minInfo) {
        return source;
      }
      const maxInfo = readVarU32(bytes, minInfo.next, payloadEnd);
      if (!maxInfo) {
        return source;
      }

      const reservedMaximum = Math.max(
        maxInfo.value + 64,
        minInfo.value + 64
      );
      const newMaximum = writeVarU32(reservedMaximum);
      const newPayloadLength =
        sizeInfo.value - (maxInfo.next - minInfo.next) + newMaximum.length;
      const encodedSize = writeVarU32(newPayloadLength);
      const patched = new Uint8Array(
        sectionStart +
          1 +
          encodedSize.length +
          newPayloadLength +
          (bytes.length - payloadEnd)
      );
      let writeOffset = 0;
      patched.set(bytes.slice(0, sectionStart + 1), writeOffset);
      writeOffset = sectionStart + 1;
      patched.set(encodedSize, writeOffset);
      writeOffset += encodedSize.length;
      patched.set(bytes.slice(payloadStart, minInfo.next), writeOffset);
      writeOffset += minInfo.next - payloadStart;
      patched.set(newMaximum, writeOffset);
      writeOffset += newMaximum.length;
      patched.set(bytes.slice(maxInfo.next, payloadEnd), writeOffset);
      writeOffset += payloadEnd - maxInfo.next;
      patched.set(bytes.slice(payloadEnd), writeOffset);
      debugLog("reserved wasm callback table capacity", {
        maximum: reservedMaximum,
        previousMaximum: maxInfo.value,
      });
      return patched;
    }
    return source;
  }

  function prepareWasmSource(source) {
    return patchGuildWarsWasmTableCapacity(patchGuildWarsWasmExports(source));
  }

  function getCallableSignature(value) {
    if (typeof value !== "function") {
      return null;
    }
    return {
      arity: value.length,
      name: value.name || null,
      signature: "fn/" + value.length,
    };
  }

  function classifyExternalValue(value) {
    if (typeof value === "function") {
      return "function";
    }
    if (
      typeof WebAssembly !== "undefined" &&
      value instanceof WebAssembly.Memory
    ) {
      return "memory";
    }
    if (
      typeof WebAssembly !== "undefined" &&
      value instanceof WebAssembly.Table
    ) {
      return "table";
    }
    if (
      typeof WebAssembly !== "undefined" &&
      value instanceof WebAssembly.Global
    ) {
      return "global";
    }
    return typeof value;
  }

  function toExportDescriptor(name, kind, value) {
    return Object.freeze({
      kind: kind || classifyExternalValue(value),
      name,
      ...getCallableSignature(value),
    });
  }

  function toImportDescriptor(moduleName, importName, kind, value) {
    return Object.freeze({
      kind: kind || classifyExternalValue(value),
      module: moduleName,
      name: importName,
      ...getCallableSignature(value),
    });
  }

  function getModuleExportMetadata() {
    if (
      !state.wasmModule ||
      typeof WebAssembly === "undefined" ||
      typeof WebAssembly.Module?.exports !== "function"
    ) {
      return null;
    }
    try {
      return WebAssembly.Module.exports(state.wasmModule);
    } catch (error) {
      debugLog("failed to read module export metadata", error);
      return null;
    }
  }

  function getModuleImportMetadata() {
    if (
      !state.wasmModule ||
      typeof WebAssembly === "undefined" ||
      typeof WebAssembly.Module?.imports !== "function"
    ) {
      return null;
    }
    try {
      return WebAssembly.Module.imports(state.wasmModule);
    } catch (error) {
      debugLog("failed to read module import metadata", error);
      return null;
    }
  }

  function getModuleBuildMetadata() {
    if (
      !state.wasmModule ||
      typeof WebAssembly === "undefined" ||
      typeof WebAssembly.Module?.customSections !== "function" ||
      typeof Uint8Array === "undefined" ||
      typeof TextDecoder === "undefined"
    ) {
      return null;
    }

    try {
      const buildIdSection = WebAssembly.Module.customSections(
        state.wasmModule,
        "build_id"
      )[0];
      const debugInfoSection = WebAssembly.Module.customSections(
        state.wasmModule,
        "external_debug_info"
      )[0];

      function decodeCustomSectionText(buffer) {
        if (!buffer) {
          return null;
        }
        const bytes = new Uint8Array(buffer);
        if (bytes.length === 0) {
          return "";
        }

        let cursor = 0;
        let length = 0;
        let shift = 0;
        while (cursor < bytes.length) {
          const byte = bytes[cursor];
          cursor += 1;
          length |= (byte & 0x7f) << shift;
          if ((byte & 0x80) === 0) {
            break;
          }
          shift += 7;
        }

        if (cursor + length <= bytes.length) {
          return new TextDecoder("utf-8").decode(
            bytes.slice(cursor, cursor + length)
          );
        }

        return new TextDecoder("utf-8").decode(bytes).replace(/^\s+/, "");
      }

      return {
        debugFile: decodeCustomSectionText(debugInfoSection),
        wasmBuildId: buildIdSection
          ? Array.from(new Uint8Array(buildIdSection))
              .map((byte) => byte.toString(16).padStart(2, "0"))
              .join("")
          : null,
      };
    } catch (error) {
      debugLog("failed to read module build metadata", error);
      return null;
    }
  }

  function listExportSignatures() {
    if (!state.rawExports) {
      return [];
    }
    const moduleExports = getModuleExportMetadata();
    if (moduleExports && moduleExports.length > 0) {
      return moduleExports.map(function mapModuleExport(descriptor) {
        return toExportDescriptor(
          descriptor.name,
          descriptor.kind,
          state.rawExports[descriptor.name]
        );
      });
    }
    return Object.entries(state.rawExports).map(function mapExport(entry) {
      const [name, value] = entry;
      return toExportDescriptor(name, null, value);
    });
  }

  function listImportSignatures() {
    const moduleImports = getModuleImportMetadata();
    if (moduleImports && moduleImports.length > 0) {
      return moduleImports.map(function mapModuleImport(descriptor) {
        const value =
          state.rawImports &&
          state.rawImports[descriptor.module] &&
          state.rawImports[descriptor.module][descriptor.name];
        return toImportDescriptor(
          descriptor.module,
          descriptor.name,
          descriptor.kind,
          value
        );
      });
    }

    if (!state.rawImports || typeof state.rawImports !== "object") {
      return [];
    }

    const descriptors = [];
    for (const [moduleName, namespace] of Object.entries(state.rawImports)) {
      if (!namespace || typeof namespace !== "object") {
        continue;
      }
      for (const [importName, value] of Object.entries(namespace)) {
        descriptors.push(toImportDescriptor(moduleName, importName, null, value));
      }
    }
    return descriptors;
  }

  function hashText(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function getBuildInfo() {
    const exportsList = listExportSignatures();
    const importsList = listImportSignatures();
    const lastCapture = captures.length > 0 ? captures[captures.length - 1] : null;
    const moduleBuild = getModuleBuildMetadata();
    const buildParts = [
      state.loader || "unknown-loader",
      ...importsList.map(function toImportKey(descriptor) {
        return (
          descriptor.module + "." + descriptor.name + ":" + descriptor.kind
        );
      }),
      ...exportsList.map(function toExportKey(descriptor) {
        return descriptor.name + ":" + descriptor.kind;
      }),
    ];

    return Object.freeze({
      buildId: buildParts.length > 0 ? hashText(buildParts.join("|")) : null,
      captureCount: captures.length,
      capturedAt: lastCapture ? lastCapture.timestamp : null,
      debugFile: moduleBuild ? moduleBuild.debugFile : null,
      exportCount: exportsList.length,
      exports: exportsList,
      hasModuleMetadata: !!state.wasmModule,
      importCount: importsList.length,
      imports: importsList,
      loader: state.loader,
      memoryByteLength: state.memory ? state.memory.buffer.byteLength : 0,
      memoryPageCount: state.memory ? state.memory.buffer.byteLength / 65536 : 0,
      runtimeInitialized: state.runtimeInitialized,
      tableLength: state.table ? state.table.length : 0,
      wasmBuildId: moduleBuild ? moduleBuild.wasmBuildId : null,
    });
  }

  function getTable() {
    return state.table;
  }

  function getTableFunction(index) {
    return state.table ? state.table.get(index) : null;
  }

  const TABLE_CALLBACK_MODULE_BYTES = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x06, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x00,
    0x02, 0x10, 0x01, 0x03, 0x65, 0x6e, 0x76, 0x08,
    0x63, 0x61, 0x6c, 0x6c, 0x62, 0x61, 0x63, 0x6b,
    0x00, 0x00,
    0x03, 0x02, 0x01, 0x00,
    0x07, 0x0c, 0x01, 0x08, 0x63, 0x61, 0x6c, 0x6c,
    0x62, 0x61, 0x63, 0x6b, 0x00, 0x01,
    0x0a, 0x0a, 0x01, 0x08, 0x00, 0x20, 0x00, 0x20,
    0x01, 0x10, 0x00, 0x0b,
  ]);

  function registerTableCallback(callback) {
    if (!state.table || typeof callback !== "function") {
      throw new Error("WASM function table is not available");
    }
    const callbackModule = new WebAssembly.Module(TABLE_CALLBACK_MODULE_BYTES);
    const callbackInstance = new WebAssembly.Instance(callbackModule, {
      env: { callback },
    });
    const callbackFunction = callbackInstance.exports.callback;
    let index;
    try {
      index = state.table.grow(1);
    } catch (error) {
      for (
        let candidate = state.table.length - 1;
        candidate >= 0;
        candidate -= 1
      ) {
        if (state.table.get(candidate) === null) {
          index = candidate;
          break;
        }
      }
    }
    if (!Number.isInteger(index)) {
      throw new Error("No function-table slot is available for the callback");
    }
    state.table.set(index, callbackFunction);
    let released = false;
    return Object.freeze({
      index,
      release() {
        if (!released && state.table?.get(index) === callbackFunction) {
          state.table.set(index, null);
        }
        released = true;
      },
    });
  }

  function describeTableEntry(index) {
    const value = getTableFunction(index);
    return Object.freeze({
      index,
      present: typeof value === "function",
      ...getCallableSignature(value),
    });
  }

  function listTableEntries(start, count) {
    if (!state.table) {
      return [];
    }
    const range = normalizeTableRange(start, count);
    const entries = [];
    for (let index = range.from; index < range.from + range.count; index += 1) {
      entries.push(describeTableEntry(index));
    }
    return entries;
  }

  function traceImportNamespace(moduleName, labelPrefix) {
    return traceImport(moduleName, "*", labelPrefix || moduleName + ".*");
  }

  function traceAllImports(labelPrefix) {
    return traceImport("*", "*", labelPrefix || "*.*");
  }

  function addWrapper(store, key, factory) {
    const factories = store.get(key) || [];
    factories.push(factory);
    store.set(key, factories);
  }

  function getWrapperChain(store, keys) {
    const chain = [];
    for (const key of keys) {
      const factories = store.get(key);
      if (factories && factories.length > 0) {
        chain.push(...factories);
      }
    }
    return chain;
  }

  function wrapImport(moduleName, importName, factory) {
    addWrapper(importWrappers, wrapperKey(moduleName, importName), factory);
    return runtime.api;
  }

  function wrapExport(exportName, factory) {
    addWrapper(exportWrappers, exportName, factory);
    state.exportsProxy = null;
    return runtime.api;
  }

  function mergeHookIntoCollection(value, hook) {
    if (!value) {
      return [hook];
    }
    if (Array.isArray(value)) {
      return value.includes(hook) ? value : value.concat(hook);
    }
    return value === hook ? [hook] : [value, hook];
  }

  function traceImport(moduleName, importName, label) {
    return wrapImport(moduleName, importName, function traceFactory(original) {
      const traceLabel = label || moduleName + "." + importName;
      return function tracedImport() {
        debugLog("import", traceLabel, Array.from(arguments));
        return original.apply(this, arguments);
      };
    });
  }

  function traceExport(exportName, label) {
    return wrapExport(exportName, function traceFactory(original) {
      const traceLabel = label || exportName;
      return function tracedExport() {
        debugLog("export", traceLabel, Array.from(arguments));
        return original.apply(this, arguments);
      };
    });
  }

  function buildWrappedImports(rawImports) {
    if (!rawImports || typeof rawImports !== "object") {
      return rawImports;
    }

    const wrapped = {};
    for (const [moduleName, namespace] of Object.entries(rawImports)) {
      if (!namespace || typeof namespace !== "object") {
        wrapped[moduleName] = namespace;
        continue;
      }

      const nextNamespace = { ...namespace };
      for (const [importName, value] of Object.entries(namespace)) {
        if (typeof value !== "function") {
          continue;
        }

        const chain = getWrapperChain(importWrappers, [
          wrapperKey(moduleName, importName),
          wrapperKey(moduleName, "*"),
          wrapperKey("*", "*"),
        ]);
        if (chain.length === 0) {
          continue;
        }

        let current = value;
        for (const factory of chain) {
          const wrappedValue = factory(current, {
            api: runtime.api,
            module: moduleName,
            name: importName,
            state,
          });
          if (typeof wrappedValue !== "function") {
            throw new TypeError(
              "Import wrapper for " +
                moduleName +
                "." +
                importName +
                " must return a function"
            );
          }
          current = wrappedValue;
        }
        nextNamespace[importName] = current;
      }

      wrapped[moduleName] = nextNamespace;
    }

    return wrapped;
  }

  function isGuildWarsInstance(exportsObject) {
    return !!(
      exportsObject &&
      typeof exportsObject === "object" &&
      exportsObject.memory &&
      typeof exportsObject.malloc === "function" &&
      typeof exportsObject.free === "function" &&
      typeof exportsObject.EmscriptenExeThreadMainLoop === "function"
    );
  }

  function buildExportsProxy() {
    if (!state.rawExports) {
      return null;
    }

    return new Proxy(state.rawExports, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof property !== "string" || typeof value !== "function") {
          return value;
        }

        const chain = getWrapperChain(exportWrappers, [property, "*"]);
        if (chain.length === 0) {
          return value;
        }

        let current = value;
        for (const factory of chain) {
          const wrappedValue = factory(current, {
            api: runtime.api,
            name: property,
            state,
          });
          if (typeof wrappedValue !== "function") {
            throw new TypeError(
              "Export wrapper for " + property + " must return a function"
            );
          }
          current = wrappedValue;
        }
        return current;
      },
    });
  }

  function snapshot() {
    return {
      captures: captures.slice(),
      instance: state.instance,
      module: state.wasmModule,
      imports: state.wrappedImports,
      memory: state.memory,
      runtimeInitialized: state.runtimeInitialized,
      table: state.table,
    };
  }

  function resolveReady() {
    if (readyResolve) {
      readyResolve(runtime.api);
      readyResolve = null;
    }
  }

  function resolveCaptured() {
    if (capturedResolve) {
      capturedResolve(runtime.api);
      capturedResolve = null;
    }
  }

  function captureInstantiation(loader, rawImports, wrappedImports, result, source) {
    const normalized =
      result instanceof WebAssembly.Instance
        ? {
            instance: result,
            module: source instanceof WebAssembly.Module ? source : null,
          }
        : result && result.instance
          ? result
          : null;

    if (!normalized || !isGuildWarsInstance(normalized.instance.exports)) {
      return result;
    }

    state.instance = normalized.instance;
    state.wasmModule = normalized.module || state.wasmModule;
    state.rawExports = normalized.instance.exports;
    state.rawImports = rawImports;
    state.wrappedImports = wrappedImports;
    state.memory = normalized.instance.exports.memory || null;
    state.table = normalized.instance.exports.__indirect_function_table || null;
    state.loader = loader;
    state.exportsProxy = null;
    runtime.refreshMemoryViews();

    const capture = {
      exportNames: Object.keys(state.rawExports),
      importNamespaces: wrappedImports ? Object.keys(wrappedImports) : [],
      loader,
      timestamp: Date.now(),
    };
    captures.push(capture);
    debugLog("captured wasm instance", capture);
    emit("wasm-captured", snapshot());
    resolveCaptured();

    return result;
  }

  const originalInstantiate = WebAssembly.instantiate.bind(WebAssembly);
  WebAssembly.instantiate = function patchedInstantiate(source, imports) {
    const wrappedImports = buildWrappedImports(imports);
    const patchedSource = prepareWasmSource(source);
    const result = originalInstantiate(patchedSource, wrappedImports);
    return Promise.resolve(result).then(function onInstantiated(value) {
      return captureInstantiation(
        "WebAssembly.instantiate",
        imports,
        wrappedImports,
        value,
        patchedSource
      );
    });
  };

  if (typeof WebAssembly.instantiateStreaming === "function") {
    const originalInstantiateStreaming =
      WebAssembly.instantiateStreaming.bind(WebAssembly);
    WebAssembly.instantiateStreaming = function patchedInstantiateStreaming(
      source,
      imports
    ) {
      const wrappedImports = buildWrappedImports(imports);
      const result = Promise.resolve(source)
        .then((response) => response.arrayBuffer())
        .then((buffer) =>
          originalInstantiate(prepareWasmSource(buffer), wrappedImports)
        );
      return Promise.resolve(result).then(function onInstantiated(value) {
        return captureInstantiation(
          "WebAssembly.instantiateStreaming",
          imports,
          wrappedImports,
          value,
          null
        );
      });
    };
  }

  function handleRuntimeInitialized() {
    state.runtimeInitialized = true;
    if (!state.memory && state.rawExports && state.rawExports.memory) {
      state.memory = state.rawExports.memory;
    }
    runtime.refreshMemoryViews();
    debugLog("runtime initialized");
    emit("runtime-initialized", snapshot());
    resolveReady();
  }

  function wrapOnRuntimeInitialized(value) {
    if (typeof value !== "function") {
      return function gwHookOnRuntimeInitialized() {
        handleRuntimeInitialized();
      };
    }
    if (value.__gwHookWrappedOnRuntimeInitialized) {
      return value;
    }
    function wrappedOnRuntimeInitialized() {
      handleRuntimeInitialized();
      return value.apply(this, arguments);
    }
    wrappedOnRuntimeInitialized.__gwHookWrappedOnRuntimeInitialized = true;
    return wrappedOnRuntimeInitialized;
  }

  function onPreRun() {
    debugLog("preRun");
    emit("pre-run", snapshot());
  }

  function onPostRun() {
    runtime.refreshMemoryViews();
    debugLog("postRun");
    emit("post-run", snapshot());
  }

  function wrapInstantiateWasm(value) {
    if (typeof value !== "function") {
      return value;
    }
    if (value.__gwHookWrappedInstantiateWasm) {
      return value;
    }
    function wrappedInstantiateWasm(imports, successCallback) {
      return value.call(this, imports, function onWasmInstantiated(inst, mod) {
        captureInstantiation(
          "Module.instantiateWasm",
          imports,
          imports,
          { instance: inst, module: mod || null },
          mod || null
        );
        if (typeof successCallback === "function") {
          return successCallback.apply(this, arguments);
        }
        return undefined;
      });
    }
    wrappedInstantiateWasm.__gwHookWrappedInstantiateWasm = true;
    return wrappedInstantiateWasm;
  }

  function hookModuleProperty(target, propertyName, transform) {
    if (!target || typeof target !== "object") {
      return;
    }
    let currentValue = transform(target[propertyName]);
    Object.defineProperty(target, propertyName, {
      configurable: true,
      enumerable: true,
      get() {
        return currentValue;
      },
      set(value) {
        currentValue = transform(value);
      },
    });
  }

  function attachModuleHooks(target) {
    if (!target || typeof target !== "object") {
      return;
    }
    if (hookedModules.has(target)) {
      state.module = target;
      return;
    }
    hookedModules.add(target);
    hookModuleProperty(target, "preRun", function transformPreRun(value) {
      return mergeHookIntoCollection(value, onPreRun);
    });
    hookModuleProperty(target, "postRun", function transformPostRun(value) {
      return mergeHookIntoCollection(value, onPostRun);
    });
    hookModuleProperty(
      target,
      "onRuntimeInitialized",
      wrapOnRuntimeInitialized
    );
    hookModuleProperty(target, "instantiateWasm", wrapInstantiateWasm);
    state.module = target;
  }

  function setModuleObject(nextModuleObject) {
    if (!nextModuleObject || typeof nextModuleObject !== "object") {
      moduleObject = null;
      state.module = null;
      return moduleObject;
    }
    if (moduleObject === nextModuleObject) {
      attachModuleHooks(moduleObject);
      return moduleObject;
    }
    moduleObject = nextModuleObject;
    attachModuleHooks(moduleObject);
    emit("module-changed", snapshot());
    return moduleObject;
  }

  function restoreGlobalModuleProperty(value, enumerable) {
    try {
      Object.defineProperty(global, "Module", {
        configurable: true,
        enumerable,
        writable: true,
        value,
      });
    } catch (error) {
      try {
        global.Module = value;
      } catch (assignmentError) {
        debugLog("failed to restore global Module property", assignmentError);
      }
    }
  }

  function installModuleAssignmentHook() {
    if (moduleObject) {
      attachModuleHooks(moduleObject);
      return;
    }

    const descriptor = Object.getOwnPropertyDescriptor(global, "Module");
    if (descriptor && descriptor.configurable === false) {
      const existingValue =
        typeof descriptor.get === "function"
          ? descriptor.get.call(global)
          : descriptor.value;
      if (existingValue && typeof existingValue === "object") {
        setModuleObject(existingValue);
      }
      return;
    }

    Object.defineProperty(global, "Module", {
      configurable: true,
      enumerable: descriptor ? descriptor.enumerable : true,
      get() {
        return moduleObject || undefined;
      },
      set(value) {
        if (value && typeof value === "object") {
          setModuleObject(value);
          restoreGlobalModuleProperty(
            moduleObject,
            descriptor ? descriptor.enumerable : true
          );
          return;
        }
        restoreGlobalModuleProperty(
          value,
          descriptor ? descriptor.enumerable : true
        );
      },
    });
  }

  installModuleAssignmentHook();

  Object.assign(runtime, {
    callExport(name) {
      const exportsObject = runtime.getExports();
      if (!exportsObject || typeof exportsObject[name] !== "function") {
        throw new Error("Export not available: " + name);
      }
      return exportsObject[name].apply(
        null,
        Array.prototype.slice.call(arguments, 1)
      );
    },
    callTable(index) {
      const fn = getTableFunction(index);
      if (typeof fn !== "function") {
        throw new Error("Table function not available: " + index);
      }
      return fn.apply(null, Array.prototype.slice.call(arguments, 1));
    },
    debugLog,
    emit,
    getBuildInfo,
    getExports() {
      if (!state.rawExports) {
        return null;
      }
      if (!state.exportsProxy) {
        state.exportsProxy = buildExportsProxy();
      }
      return state.exportsProxy;
    },
    getModule() {
      return moduleObject;
    },
    getRawExports() {
      return state.rawExports;
    },
    getRawImports() {
      return state.rawImports;
    },
    prepareWasmSource,
    getTable,
    getTableFunction,
    registerTableCallback,
    listExports() {
      return state.rawExports ? Object.keys(state.rawExports) : [];
    },
    listExportSignatures,
    listImportSignatures,
    listImportNamespaces() {
      return state.wrappedImports ? Object.keys(state.wrappedImports) : [];
    },
    listTableEntries,
    off,
    on,
    once,
    snapshot,
    traceAllImports,
    traceExport,
    traceImport,
    traceImportNamespace,
    wrapExport,
    wrapImport,
  });

  debugLog("capture runtime installed");
  return runtime;
}
