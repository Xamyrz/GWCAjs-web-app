import { createCaptureRuntime } from "./capture.js";
import { attachMemoryTools } from "./memory.js";
import { attachScannerTools } from "./scanner.js";

export function createGWHook(global) {
  if (global.GWHook) {
    return global.GWHook;
  }

  const capture = createCaptureRuntime(global);
  const memoryApi = attachMemoryTools(capture);
  const scanner = attachScannerTools(capture);

  const api = {
    assertRange: memoryApi.assertRange,
    callTable: capture.callTable,
    callExport: capture.callExport,
    captured: capture.captured,
    free: memoryApi.free,
    getBuildInfo: capture.getBuildInfo,
    getCaptureState: capture.snapshot,
    getExports: capture.getExports,
    getModule: capture.getModule,
    getRawExports: capture.getRawExports,
    getRawImports: capture.getRawImports,
    getTable: capture.getTable,
    getTableFunction: capture.getTableFunction,
    listExports: capture.listExports,
    listExportSignatures: capture.listExportSignatures,
    listImportSignatures: capture.listImportSignatures,
    listImportNamespaces: capture.listImportNamespaces,
    listTableEntries: capture.listTableEntries,
    isAligned: memoryApi.isAligned,
    isValidPointer: memoryApi.isValidPointer,
    isValidRange: memoryApi.isValidRange,
    malloc: memoryApi.malloc,
    mallocUtf8: memoryApi.mallocUtf8,
    mallocUtf16: memoryApi.mallocUtf16,
    off: capture.off,
    on: capture.on,
    once: capture.once,
    readBytes: memoryApi.readBytes,
    readF32: memoryApi.readF32,
    readF64: memoryApi.readF64,
    readI8: memoryApi.readI8,
    readI16: memoryApi.readI16,
    readI32: memoryApi.readI32,
    readPointer: memoryApi.readPointer,
    readPointerSlot: memoryApi.readPointerSlot,
    readU8: memoryApi.readU8,
    readU16: memoryApi.readU16,
    readU32: memoryApi.readU32,
    readUtf8: memoryApi.readUtf8,
    readUtf16: memoryApi.readUtf16,
    registerTableCallback: capture.registerTableCallback,
    ready: capture.ready,
    refreshMemoryViews: memoryApi.refreshMemoryViews,
    traceAllImports: capture.traceAllImports,
    traceExport: capture.traceExport,
    traceImport: capture.traceImport,
    traceImportNamespace: capture.traceImportNamespace,
    withAllocation: memoryApi.withAllocation,
    withUtf8: memoryApi.withUtf8,
    withUtf16: memoryApi.withUtf16,
    wrapExport: capture.wrapExport,
    wrapImport: capture.wrapImport,
    writeBytes: memoryApi.writeBytes,
    writeF32: memoryApi.writeF32,
    writeF64: memoryApi.writeF64,
    writeI8: memoryApi.writeI8,
    writeI16: memoryApi.writeI16,
    writeI32: memoryApi.writeI32,
    writePointer: memoryApi.writePointer,
    writePointerSlot: memoryApi.writePointerSlot,
    writeU8: memoryApi.writeU8,
    writeU16: memoryApi.writeU16,
    writeU32: memoryApi.writeU32,
    writeUtf8: memoryApi.writeUtf8,
    writeUtf16: memoryApi.writeUtf16,
  };

  capture.api = api;

  api.findAscii = scanner.findAscii;
  api.findAllBytes = scanner.findAllBytes;
  api.findAllUtf16 = scanner.findAllUtf16;
  api.findBytes = scanner.findBytes;
  api.findUtf16 = scanner.findUtf16;
  api.findUtf8 = scanner.findUtf8;
  api.readPointerChain = scanner.readPointerChain;
  api.readStruct = scanner.readStruct;
  api.scanF32 = scanner.scanF32;
  api.scanI32 = scanner.scanI32;
  api.scanU32 = scanner.scanU32;
  api.writeStructField = scanner.writeStructField;
  api.createStructView = scanner.createStructView;
  api.capture = Object.freeze({
    callTable: capture.callTable,
    captured: capture.captured,
    getBuildInfo: capture.getBuildInfo,
    getState: capture.snapshot,
    getTable: capture.getTable,
    getTableFunction: capture.getTableFunction,
    listExports: capture.listExports,
    listExportSignatures: capture.listExportSignatures,
    listImportSignatures: capture.listImportSignatures,
    listImportNamespaces: capture.listImportNamespaces,
    listTableEntries: capture.listTableEntries,
    on: capture.on,
    once: capture.once,
    ready: capture.ready,
    traceAllImports: capture.traceAllImports,
    traceExport: capture.traceExport,
    traceImport: capture.traceImport,
    traceImportNamespace: capture.traceImportNamespace,
    wrapExport: capture.wrapExport,
    wrapImport: capture.wrapImport,
  });
  api.memoryApi = Object.freeze({
    assertRange: memoryApi.assertRange,
    free: memoryApi.free,
    isAligned: memoryApi.isAligned,
    isValidPointer: memoryApi.isValidPointer,
    isValidRange: memoryApi.isValidRange,
    malloc: memoryApi.malloc,
    mallocUtf8: memoryApi.mallocUtf8,
    mallocUtf16: memoryApi.mallocUtf16,
    readBytes: memoryApi.readBytes,
    readF32: memoryApi.readF32,
    readF64: memoryApi.readF64,
    readI8: memoryApi.readI8,
    readI16: memoryApi.readI16,
    readI32: memoryApi.readI32,
    readPointer: memoryApi.readPointer,
    readPointerSlot: memoryApi.readPointerSlot,
    readU8: memoryApi.readU8,
    readU16: memoryApi.readU16,
    readU32: memoryApi.readU32,
    readUtf8: memoryApi.readUtf8,
    readUtf16: memoryApi.readUtf16,
    refreshMemoryViews: memoryApi.refreshMemoryViews,
    withAllocation: memoryApi.withAllocation,
    withUtf8: memoryApi.withUtf8,
    withUtf16: memoryApi.withUtf16,
    writeBytes: memoryApi.writeBytes,
    writeF32: memoryApi.writeF32,
    writeF64: memoryApi.writeF64,
    writeI8: memoryApi.writeI8,
    writeI16: memoryApi.writeI16,
    writeI32: memoryApi.writeI32,
    writePointer: memoryApi.writePointer,
    writePointerSlot: memoryApi.writePointerSlot,
    writeU8: memoryApi.writeU8,
    writeU16: memoryApi.writeU16,
    writeU32: memoryApi.writeU32,
    writeUtf8: memoryApi.writeUtf8,
    writeUtf16: memoryApi.writeUtf16,
  });
  api.scanner = Object.freeze({
    createStructView: scanner.createStructView,
    findAscii: scanner.findAscii,
    findAllBytes: scanner.findAllBytes,
    findAllUtf16: scanner.findAllUtf16,
    findBytes: scanner.findBytes,
    findUtf16: scanner.findUtf16,
    findUtf8: scanner.findUtf8,
    readPointerChain: scanner.readPointerChain,
    readStruct: scanner.readStruct,
    scanF32: scanner.scanF32,
    scanI32: scanner.scanI32,
    scanU32: scanner.scanU32,
    writeStructField: scanner.writeStructField,
  });

  Object.defineProperties(api, {
    instance: {
      enumerable: true,
      get() {
        return capture.state.instance;
      },
    },
    memory: {
      enumerable: true,
      get() {
        return capture.state.memory;
      },
    },
    views: {
      enumerable: true,
      get() {
        return capture.ensureViews();
      },
    },
  });

  return api;
}

export function installGWHook(global = globalThis) {
  const api = createGWHook(global);
  global.GWHook = api;
  return api;
}
