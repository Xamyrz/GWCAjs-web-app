import { getArraySlotCount, readArray } from "../GameContainers/Array.js";
import {
  isReasonableAgentId,
  isReasonablePlayerNumber,
  PLAYER_SIZE,
} from "../GameEntities/Player.js";
import { TITLE_SIZE } from "../GameEntities/Title.js";
import {
  getMemoryLimit,
  isValidPointer,
  readValue,
} from "../Utilities/Memory.js";
import { getCharContextPlayerNumber } from "./CharContext.js";
import { GAME_CONTEXT_OFFSETS } from "./GameContext.js";

export const WORLD_CONTEXT_OFFSETS = Object.freeze({
  playerControlledChar: 0x680,
  playerNumber: 0x67c,
  players: 0x80c,
  titles: 0x81c,
});

export const PLAYER_CONTROLLED_CHARACTER_OFFSETS = Object.freeze({
  agentId: 0x14,
  compositeId: 0x18,
});

const contextChainCache = new WeakMap();

function getDefinition(state, path) {
  return state?.scanner?.getDefinition(path);
}

function validateWorldContext(state, worldContextAddress, expectedPlayerNumber) {
  if (!isValidPointer(state, worldContextAddress)) {
    return null;
  }

  const worldPlayerNumber = readValue(
    state,
    "u32",
    worldContextAddress + WORLD_CONTEXT_OFFSETS.playerNumber
  );
  if (!isReasonablePlayerNumber(worldPlayerNumber)) {
    return null;
  }
  if (
    isReasonablePlayerNumber(expectedPlayerNumber) &&
    worldPlayerNumber !== expectedPlayerNumber
  ) {
    return null;
  }

  const configuredStride = getDefinition(
    state,
    "modules.player.propArrayLayout.stride"
  );
  const playerStride =
    typeof configuredStride === "number" && configuredStride > 0
      ? configuredStride | 0
      : PLAYER_SIZE;
  const playerArray = readArray(
    state,
    worldContextAddress + WORLD_CONTEXT_OFFSETS.players,
    playerStride
  );
  if (!playerArray) {
    return null;
  }

  const playerControlledCharAddress = readValue(
    state,
    "u32",
    worldContextAddress + WORLD_CONTEXT_OFFSETS.playerControlledChar
  );
  const hasPlayerControlledChar = isValidPointer(
    state,
    playerControlledCharAddress
  );

  return {
    controlledCharacterAgentId: hasPlayerControlledChar
      ? readValue(
          state,
          "u32",
          playerControlledCharAddress +
            PLAYER_CONTROLLED_CHARACTER_OFFSETS.agentId
        )
      : null,
    controlledCharacterCompositeId: hasPlayerControlledChar
      ? readValue(
          state,
          "u32",
          playerControlledCharAddress +
            PLAYER_CONTROLLED_CHARACTER_OFFSETS.compositeId
        )
      : null,
    playerArray,
    playerControlledCharAddress: hasPlayerControlledChar
      ? playerControlledCharAddress >>> 0
      : null,
    worldContextAddress: worldContextAddress >>> 0,
    worldPlayerNumber: worldPlayerNumber | 0,
  };
}

export function resolveWorldContext(state) {
  const charContextAddress = state.anchors?.charContextAddress || 0;
  const expectedPlayerNumber = getCharContextPlayerNumber(state);
  const memoryLimit = getMemoryLimit(state);
  const gameContextAddress = state.anchors?.gameplayContextAddress || 0;
  const anchoredWorldContextAddress = state.anchors?.worldContextAddress || 0;
  const cached = contextChainCache.get(state);
  if (
    cached &&
    cached.charContextAddress === charContextAddress &&
    cached.expectedPlayerNumber === expectedPlayerNumber &&
    cached.gameContextAddress === gameContextAddress &&
    cached.memoryLimit === memoryLimit
  ) {
    const validCached = validateWorldContext(
      state,
      cached.worldContextAddress,
      cached.expectedPlayerNumber
    );
    if (validCached) {
      return {
        ...cached,
        ...validCached,
      };
    }
  }

  const worldContextAddress = isValidPointer(state, anchoredWorldContextAddress)
    ? anchoredWorldContextAddress
    : isValidPointer(state, gameContextAddress)
      ? readValue(
          state,
          "u32",
          gameContextAddress + GAME_CONTEXT_OFFSETS.world
        )
      : 0;
  const world = validateWorldContext(
    state,
    worldContextAddress,
    expectedPlayerNumber
  );
  if (!world) {
    return null;
  }

  const resolved = {
    ...world,
    charContextAddress,
    expectedPlayerNumber: expectedPlayerNumber || 0,
    gameContextAddress,
    memoryLimit: getMemoryLimit(state),
    source: "mapAnchors",
  };
  contextChainCache.set(state, resolved);
  return resolved;
}

export function getWorldContextAddress(state) {
  return resolveWorldContext(state)?.worldContextAddress || 0;
}

export function getWorldPlayerNumber(state) {
  return resolveWorldContext(state)?.worldPlayerNumber || 0;
}

export function getWorldPlayerArray(state) {
  const resolved = resolveWorldContext(state);
  if (!resolved?.playerArray) {
    return null;
  }
  return {
    ...resolved.playerArray,
    contextSource: resolved.source,
    gameContextAddress: resolved.gameContextAddress,
    source: "worldContext",
    worldContextAddress: resolved.worldContextAddress,
  };
}

export function getWorldTitleArray(state) {
  const resolved = resolveWorldContext(state);
  if (!resolved?.worldContextAddress) {
    return null;
  }
  const titleArray = readArray(
    state,
    resolved.worldContextAddress + WORLD_CONTEXT_OFFSETS.titles,
    TITLE_SIZE
  );
  return titleArray
    ? {
        ...titleArray,
        contextSource: resolved.source,
        gameContextAddress: resolved.gameContextAddress,
        source: "worldContext",
        worldContextAddress: resolved.worldContextAddress,
      }
    : null;
}

export function getPlayerControlledCharacter(state) {
  const resolved = resolveWorldContext(state);
  if (!resolved?.playerControlledCharAddress) {
    return null;
  }
  return {
    address: resolved.playerControlledCharAddress,
    agentId: isReasonableAgentId(resolved.controlledCharacterAgentId)
      ? resolved.controlledCharacterAgentId >>> 0
      : 0,
    compositeId: resolved.controlledCharacterCompositeId,
  };
}

export { getArraySlotCount };
