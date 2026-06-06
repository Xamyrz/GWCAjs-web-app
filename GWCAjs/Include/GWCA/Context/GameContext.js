import { isValidPointer, readValue } from "../Utilities/Memory.js";

export const GAME_CONTEXT_OFFSETS = Object.freeze({
  agent: 0x08,
  cinematic: 0x30,
  character: 0x44,
  map: 0x14,
  world: 0x2c,
});

export function getGameContextAddress(state) {
  const anchoredAddress = state.anchors?.gameplayContextAddress || 0;
  if (isValidPointer(state, anchoredAddress)) {
    return anchoredAddress >>> 0;
  }

  const contextSlotAddress = state.anchors?.contextSlotAddress || 0;
  if (!isValidPointer(state, contextSlotAddress)) {
    return 0;
  }
  const seedAddress = readValue(state, "u32", contextSlotAddress);
  return isValidPointer(state, seedAddress) ? seedAddress >>> 0 : 0;
}

export function getGameContextChildAddress(state, offset, fallbackAddress = 0) {
  const gameContextAddress = getGameContextAddress(state);
  if (gameContextAddress) {
    const address = readValue(state, "u32", gameContextAddress + offset);
    return isValidPointer(state, address) ? address >>> 0 : 0;
  }

  return isValidPointer(state, fallbackAddress)
    ? fallbackAddress >>> 0
    : 0;
}

export function getCharContextAddress(state) {
  return getGameContextChildAddress(
    state,
    GAME_CONTEXT_OFFSETS.character,
    state.anchors?.charContextAddress || 0
  );
}

export function getMapContextAddress(state) {
  return getGameContextChildAddress(
    state,
    GAME_CONTEXT_OFFSETS.map,
    state.anchors?.mapContextAddress || 0
  );
}

export function getWorldContextAddress(state) {
  return getGameContextChildAddress(
    state,
    GAME_CONTEXT_OFFSETS.world,
    state.anchors?.worldContextAddress || 0
  );
}
