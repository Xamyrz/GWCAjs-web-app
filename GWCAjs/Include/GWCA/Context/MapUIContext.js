import { readArray } from "../GameContainers/Array.js";
import {
  getMemoryLimit,
  isValidPointer,
  readValue,
} from "../Utilities/Memory.js";

const UI_FRAME_LAYOUT = Object.freeze({
  callbacks: 0xa8,
  callbackCapacity: 0xac,
  callbackCount: 0xb0,
  frameId: 0xbc,
  minimumSize: 0xc0,
});

const UI_CALLBACK_ENTRY_SIZE = 0x0c;
const MAX_UI_FRAMES = 0x10000;
const MAX_FRAME_CALLBACKS = 0x1000;

const MISSION_MAP_CONTEXT_SIZE = 0x48;
const MISSION_MAP_FRAME_ID_OFFSET = 0x14;
const MISSION_MAP_SUBCONTEXT2_SIZE = 0x58;
const WORLD_MAP_CONTEXT_SIZE = 0x224;

function getDefinition(state, path) {
  return state?.scanner?.getDefinition(path);
}

function hasMemoryRange(state, address, size) {
  const limit = getMemoryLimit(state);
  return (
    isValidPointer(state, address) &&
    Number.isInteger(size) &&
    size >= 0 &&
    address + size >= address &&
    address + size <= limit
  );
}

function readVector2(state, address) {
  const x = readValue(state, "f32", address);
  const y = readValue(state, "f32", address + 4);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function readValues(state, type, address, count, stride = 4) {
  return Array.from({ length: count }, (_, index) =>
    readValue(state, type, address + index * stride)
  );
}

function findMapUIContext(
  state,
  callbackTableIndex,
  contextSize,
  contextFrameIdOffset
) {
  const frameArrayAddress = getDefinition(
    state,
    "modules.ui.frameArrayBufferAddress"
  );
  const frameCountAddress = getDefinition(
    state,
    "modules.ui.frameArrayCountAddress"
  );
  if (
    !Number.isInteger(frameArrayAddress) ||
    !Number.isInteger(frameCountAddress)
  ) {
    return null;
  }

  const frames = readValue(state, "u32", frameArrayAddress);
  const frameCount = readValue(state, "u32", frameCountAddress);
  if (
    !Number.isInteger(frameCount) ||
    frameCount <= 0 ||
    frameCount > MAX_UI_FRAMES ||
    !hasMemoryRange(state, frames, frameCount * 4)
  ) {
    return null;
  }

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const frameAddress = readValue(state, "u32", frames + frameIndex * 4);
    if (!hasMemoryRange(state, frameAddress, UI_FRAME_LAYOUT.minimumSize)) {
      continue;
    }

    const callbackCount = readValue(
      state,
      "u32",
      frameAddress + UI_FRAME_LAYOUT.callbackCount
    );
    const callbackCapacity = readValue(
      state,
      "u32",
      frameAddress + UI_FRAME_LAYOUT.callbackCapacity
    );
    const callbacks = readValue(
      state,
      "u32",
      frameAddress + UI_FRAME_LAYOUT.callbacks
    );
    if (
      !Number.isInteger(callbackCount) ||
      !Number.isInteger(callbackCapacity) ||
      callbackCount <= 0 ||
      callbackCount > callbackCapacity ||
      callbackCount > MAX_FRAME_CALLBACKS ||
      !hasMemoryRange(
        state,
        callbacks,
        callbackCount * UI_CALLBACK_ENTRY_SIZE
      )
    ) {
      continue;
    }

    const frameId = readValue(
      state,
      "u32",
      frameAddress + UI_FRAME_LAYOUT.frameId
    );
    for (let callbackIndex = 0; callbackIndex < callbackCount; callbackIndex += 1) {
      const callbackEntryAddress =
        callbacks + callbackIndex * UI_CALLBACK_ENTRY_SIZE;
      if (
        readValue(state, "u32", callbackEntryAddress) !== callbackTableIndex
      ) {
        continue;
      }

      const contextAddress = readValue(
        state,
        "u32",
        callbackEntryAddress + 4
      );
      if (
        !hasMemoryRange(state, contextAddress, contextSize) ||
        readValue(
          state,
          "u32",
          contextAddress + contextFrameIdOffset
        ) !== frameId
      ) {
        continue;
      }

      return {
        address: contextAddress >>> 0,
        callbackEntryAddress: callbackEntryAddress >>> 0,
        callbackIndex,
        contextSlotAddress: (callbackEntryAddress + 4) >>> 0,
        frameAddress: frameAddress >>> 0,
        frameId,
        frameIndex,
        source: "uiFrameCallback",
      };
    }
  }

  return null;
}

function readMissionMapSubcontext2(state, address) {
  if (!hasMemoryRange(state, address, MISSION_MAP_SUBCONTEXT2_SIZE)) {
    return null;
  }
  return {
    address: address >>> 0,
    h0000: readValue(state, "u32", address),
    playerMissionMapPosition: readVector2(state, address + 0x04),
    h000c: readValue(state, "u32", address + 0x0c),
    missionMapSize: readVector2(state, address + 0x10),
    unk: readValue(state, "f32", address + 0x18),
    missionMapPanOffset: readVector2(state, address + 0x1c),
    missionMapPanOffset2: readVector2(state, address + 0x24),
    unk2: readValues(state, "f32", address + 0x2c, 2),
    unk3: readValues(state, "u32", address + 0x34, 9),
  };
}

export function getMissionMapUIContext(state) {
  const callbackTableIndex = getDefinition(
    state,
    "modules.map.missionMapCallbackTableIndex"
  );
  if (!Number.isInteger(callbackTableIndex)) {
    return null;
  }

  const context = findMapUIContext(
    state,
    callbackTableIndex,
    MISSION_MAP_CONTEXT_SIZE,
    MISSION_MAP_FRAME_ID_OFFSET
  );
  if (!context) {
    return null;
  }

  const address = context.address;
  const subcontexts = readArray(state, address + 0x20, 4);
  const subcontext2Address = readValue(state, "u32", address + 0x3c);
  return {
    ...context,
    size: readVector2(state, address),
    h0008: readValue(state, "u32", address + 0x08),
    lastMouseLocation: readVector2(state, address + 0x0c),
    playerMissionMapPosition: readVector2(state, address + 0x18),
    subcontexts,
    h0030: readValue(state, "u32", address + 0x30),
    h0034: readValue(state, "u32", address + 0x34),
    h0038: readValue(state, "u32", address + 0x38),
    subcontext2Address: isValidPointer(state, subcontext2Address)
      ? subcontext2Address >>> 0
      : null,
    subcontext2: readMissionMapSubcontext2(state, subcontext2Address),
    h0040: readValue(state, "u32", address + 0x40),
    h0044: readValue(state, "u32", address + 0x44),
  };
}

export function getWorldMapUIContext(state) {
  const callbackTableIndex = getDefinition(
    state,
    "modules.map.worldMapCallbackTableIndex"
  );
  if (!Number.isInteger(callbackTableIndex)) {
    return null;
  }

  const context = findMapUIContext(
    state,
    callbackTableIndex,
    WORLD_MAP_CONTEXT_SIZE,
    0
  );
  if (!context) {
    return null;
  }

  const address = context.address;
  return {
    ...context,
    h0004: readValue(state, "u32", address + 0x04),
    h0008: readValue(state, "u32", address + 0x08),
    h000c: readValue(state, "f32", address + 0x0c),
    h0010: readValue(state, "f32", address + 0x10),
    h0014: readValue(state, "u32", address + 0x14),
    h0018: readValue(state, "f32", address + 0x18),
    h001c: readValue(state, "f32", address + 0x1c),
    h0020: readValue(state, "f32", address + 0x20),
    h0024: readValue(state, "f32", address + 0x24),
    h0028: readValue(state, "f32", address + 0x28),
    h002c: readValue(state, "f32", address + 0x2c),
    h0030: readValue(state, "f32", address + 0x30),
    h0034: readValue(state, "f32", address + 0x34),
    zoom: readValue(state, "f32", address + 0x38),
    topLeft: readVector2(state, address + 0x3c),
    bottomRight: readVector2(state, address + 0x44),
    h004c: readValues(state, "u32", address + 0x4c, 7),
    h0068: readValue(state, "f32", address + 0x68),
    h006c: readValue(state, "f32", address + 0x6c),
    params: readValues(state, "u32", address + 0x70, 0x6d),
  };
}
