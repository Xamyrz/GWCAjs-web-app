import { getArraySlotCount } from "../Include/GWCA/GameContainers/Array.js";
import { getCharContextPlayerNumber } from "../Include/GWCA/Context/CharContext.js";
import { GAME_CONTEXT_OFFSETS } from "../Include/GWCA/Context/GameContext.js";
import {
  getPlayerControlledCharacter,
  getWorldContextAddress,
  getWorldPlayerArray,
  getWorldPlayerNumber,
  PLAYER_CONTROLLED_CHARACTER_OFFSETS,
  WORLD_CONTEXT_OFFSETS,
} from "../Include/GWCA/Context/WorldContext.js";
import {
  isPlausiblePlayer,
  isReasonableAgentId,
  isReasonablePlayerNumber,
  PLAYER_OFFSETS,
  readPlayer,
} from "../Include/GWCA/GameEntities/Player.js";
import {
  getMemoryLimit,
  isValidPointer,
  readUtf16,
  readValue,
  writeUtf16,
} from "../Include/GWCA/Utilities/Memory.js";

const PLAYER_ADDRESS_CACHE_TTL_MS = 1000;
const currentPlayerAddressCache = new WeakMap();
const playerAddressCache = new WeakMap();

export function getStoredCharacterName(global = globalThis) {
  try {
    return global.localStorage?.getItem("gw.characterName") ?? null;
  } catch (error) {
    return null;
  }
}

export function createPlayerStateView(state, global = globalThis) {
  function getConfiguredCharacterName() {
    const currentPlayerAddress = resolveCurrentPlayerAddressFast();
    if (currentPlayerAddress) {
      const player = readPlayer(state, currentPlayerAddress);
      if (typeof player?.name === "string" && player.name.trim()) {
        return player.name.trim();
      }
    }

    const charContextAddress = state.anchors?.charContextAddress || 0;
    if (charContextAddress) {
      const nameOffset = state.scanner?.getDefinition(
        "modules.gameplay.charContextAddress.nameOffset"
      );
      const offset =
        typeof nameOffset === "number" && Number.isFinite(nameOffset)
          ? nameOffset | 0
          : 0x74;
      const liveName = readUtf16(state, charContextAddress + offset, 20);
      if (liveName) {
        return liveName;
      }
    }

    const stored =
      state.player?.storedCharacterName || getStoredCharacterName(global);
    return typeof stored === "string" && stored.trim() ? stored.trim() : null;
  }

  function getCurrentPlayerNumber() {
    const charPlayerNumber = getCharContextPlayerNumber(state);
    if (isReasonablePlayerNumber(charPlayerNumber)) {
      return charPlayerNumber | 0;
    }
    const currentState =
      state.map?.api?.GetState?.() || state.map?.state || null;
    const value = currentState?.playerNumber;
    if (isReasonablePlayerNumber(value)) {
      return value | 0;
    }
    return getWorldPlayerNumber(state);
  }

  function setCurrentPlayerAddressCache(address, playerNumber) {
    if (
      !isValidPointer(state, address) ||
      !isReasonablePlayerNumber(playerNumber)
    ) {
      return;
    }
    currentPlayerAddressCache.set(state, {
      address: address >>> 0,
      playerNumber: playerNumber | 0,
    });
  }

  function getCachedCurrentPlayerAgentId() {
    const cached = currentPlayerAddressCache.get(state);
    if (!cached || !isValidPointer(state, cached.address)) {
      return 0;
    }

    const agentId = readValue(
      state,
      "u32",
      cached.address + PLAYER_OFFSETS.agentId
    );
    return isReasonableAgentId(agentId) ? agentId >>> 0 : 0;
  }

  function resolveCurrentPlayerAddressFast() {
    const cachedAgentId = getCachedCurrentPlayerAgentId();
    const cached = currentPlayerAddressCache.get(state);
    if (cachedAgentId && isValidPointer(state, cached?.address)) {
      return cached.address >>> 0;
    }

    const playerArray = getWorldPlayerArray(state);
    const playerNumber = getCurrentPlayerNumber();
    if (
      !playerArray ||
      !isReasonablePlayerNumber(playerNumber) ||
      playerNumber >= getArraySlotCount(playerArray)
    ) {
      return 0;
    }

    const address =
      (playerArray.buffer + playerNumber * playerArray.stride) >>> 0;
    const agentId = readValue(state, "u32", address + PLAYER_OFFSETS.agentId);
    if (!isReasonableAgentId(agentId)) {
      return 0;
    }
    setCurrentPlayerAddressCache(address, playerNumber);
    return address;
  }

  function describeFastPlayerPath() {
    const charContextAddress = state.anchors?.charContextAddress || 0;
    const contextSlotAddress = state.anchors?.contextSlotAddress || 0;
    const gameplayContextAddress = state.anchors?.gameplayContextAddress || 0;
    const mapContextAddress = state.anchors?.mapContextAddress || 0;
    const contextSlotValue = isValidPointer(state, contextSlotAddress)
      ? readValue(state, "u32", contextSlotAddress)
      : null;
    const gameContextCharSlotValue = isValidPointer(
      state,
      gameplayContextAddress
    )
      ? readValue(
          state,
          "u32",
          gameplayContextAddress + GAME_CONTEXT_OFFSETS.character
        )
      : null;
    const worldContextAddress = getWorldContextAddress(state);
    const charPlayerNumber = getCharContextPlayerNumber(state);
    const worldPlayerNumber = worldContextAddress
      ? readValue(
          state,
          "u32",
          worldContextAddress + WORLD_CONTEXT_OFFSETS.playerNumber
        )
      : null;
    const playerNumber = getCurrentPlayerNumber();
    const playerArray = getWorldPlayerArray(state);
    const playerAddress =
      playerArray &&
      isReasonablePlayerNumber(playerNumber) &&
      playerNumber < getArraySlotCount(playerArray)
        ? (playerArray.buffer + playerNumber * playerArray.stride) >>> 0
        : 0;
    const playerAgentId = playerAddress
      ? readValue(state, "u32", playerAddress + PLAYER_OFFSETS.agentId)
      : null;
    const playerControlledCharAddress = worldContextAddress
      ? readValue(
          state,
          "u32",
          worldContextAddress + WORLD_CONTEXT_OFFSETS.playerControlledChar
        )
      : null;
    const controlledAgentId = isValidPointer(
      state,
      playerControlledCharAddress
    )
      ? readValue(
          state,
          "u32",
          playerControlledCharAddress +
            PLAYER_CONTROLLED_CHARACTER_OFFSETS.agentId
        )
      : null;

    return {
      cachedAgentId: getCachedCurrentPlayerAgentId(),
      charContextAddress,
      charContextMatchesGameplayContext:
        !!charContextAddress && charContextAddress === gameplayContextAddress,
      charContextMatchesContextSlotValue:
        !!charContextAddress && charContextAddress === contextSlotValue,
      charPlayerNumber,
      contextSlotAddress,
      contextSlotValue,
      controlledAgentId,
      controlledAgentIdReasonable: isReasonableAgentId(controlledAgentId),
      gameContextCharSlotValue,
      gameContextCharSlotMatchesCharContext:
        !!charContextAddress && gameContextCharSlotValue === charContextAddress,
      gameplayContextAddress,
      mapContextAddress,
      playerAddress,
      playerAgentId,
      playerAgentIdReasonable: isReasonableAgentId(playerAgentId),
      playerArray,
      playerControlledCharAddress,
      playerNumber,
      resolvedFastAddress: resolveCurrentPlayerAddressFast(),
      worldContextAddress,
      worldPlayerNumber,
    };
  }

  function getControlledCharacterAgentId() {
    const cachedAgentId = getCachedCurrentPlayerAgentId();
    if (cachedAgentId) {
      return cachedAgentId;
    }

    const currentPlayerAddress = resolveCurrentPlayerAddressFast();
    if (currentPlayerAddress) {
      const playerAgentId = readValue(
        state,
        "u32",
        currentPlayerAddress + PLAYER_OFFSETS.agentId
      );
      if (isReasonableAgentId(playerAgentId)) {
        return playerAgentId >>> 0;
      }
    }

    return getPlayerControlledCharacter(state)?.agentId || 0;
  }

  function normalizePlayerId(playerId) {
    if (
      typeof playerId === "number" &&
      Number.isFinite(playerId) &&
      playerId > 0
    ) {
      return playerId | 0;
    }
    return getCurrentPlayerNumber();
  }

  function getPlayerAddressCache() {
    let cache = playerAddressCache.get(state);
    if (!cache) {
      cache = new Map();
      playerAddressCache.set(state, cache);
    }
    return cache;
  }

  function isPlayerAddressCacheEntryValid(playerNumber, entry) {
    if (
      !entry ||
      typeof entry.cachedAt !== "number" ||
      Date.now() - entry.cachedAt > PLAYER_ADDRESS_CACHE_TTL_MS ||
      entry.memoryLimit !== getMemoryLimit(state) ||
      !isValidPointer(state, entry.address)
    ) {
      return false;
    }

    const candidate = readPlayer(state, entry.address, {
      includeName: false,
    });
    return (
      isPlausiblePlayer(state, candidate) &&
      candidate.playerNumber === playerNumber
    );
  }

  function resolvePlayerAddress(playerId = 0) {
    const isCurrentPlayerRequest = !(
      typeof playerId === "number" &&
      Number.isFinite(playerId) &&
      playerId > 0
    );
    const playerNumber = normalizePlayerId(playerId);
    if (!isReasonablePlayerNumber(playerNumber)) {
      return 0;
    }

    const cache = getPlayerAddressCache();
    const cached = cache.get(playerNumber);
    if (isPlayerAddressCacheEntryValid(playerNumber, cached)) {
      if (isCurrentPlayerRequest) {
        setCurrentPlayerAddressCache(cached.address, playerNumber);
      }
      return cached.address;
    }

    const playerArray = getWorldPlayerArray(state);
    if (!playerArray || playerNumber >= getArraySlotCount(playerArray)) {
      cache.delete(playerNumber);
      return 0;
    }

    const candidateAddress =
      (playerArray.buffer + playerNumber * playerArray.stride) >>> 0;
    const candidate = readPlayer(state, candidateAddress, {
      includeName: false,
    });
    if (
      !isPlausiblePlayer(state, candidate) ||
      candidate.playerNumber !== playerNumber
    ) {
      cache.delete(playerNumber);
      return 0;
    }

    cache.set(playerNumber, {
      address: candidateAddress,
      cachedAt: Date.now(),
      memoryLimit: getMemoryLimit(state),
    });
    if (isCurrentPlayerRequest) {
      setCurrentPlayerAddressCache(candidateAddress, playerNumber);
    }
    return candidateAddress;
  }

  function getPlayer(playerId = 0) {
    const address =
      playerId === 0
        ? resolveCurrentPlayerAddressFast()
        : resolvePlayerAddress(playerId);
    return address ? readPlayer(state, address) : null;
  }

  function setPlayerName(playerId = 0, replaceName = "") {
    const player = getPlayer(playerId);
    if (!player?.nameEncPtr || !isValidPointer(state, player.nameEncPtr)) {
      return null;
    }

    const nextName = String(replaceName ?? "").slice(0, 20);
    const writeAddress = (player.nameEncPtr + 4) >>> 0;
    if (!writeUtf16(state, writeAddress, nextName, 20)) {
      return null;
    }

    return {
      address: writeAddress,
      playerId: player.playerNumber,
      value: nextName,
    };
  }

  function getPlayerEncodedName(playerId = 0) {
    const player = getPlayer(playerId);
    if (!player?.nameEncPtr || !isValidPointer(state, player.nameEncPtr)) {
      return null;
    }
    return readUtf16(state, (player.nameEncPtr + 4) >>> 0, 20) || null;
  }

  function getPlayerByName(name) {
    if (typeof name !== "string" || !name.trim()) {
      return null;
    }
    const playerArray = getWorldPlayerArray(state);
    if (!playerArray) {
      return null;
    }

    const expectedName = name.trim();
    for (let playerId = 0; playerId < playerArray.size; playerId += 1) {
      const player = readPlayer(
        state,
        (playerArray.buffer + playerId * playerArray.stride) >>> 0
      );
      if (
        player?.name &&
        (player.name === expectedName ||
          player.name.toLowerCase() === expectedName.toLowerCase())
      ) {
        return player;
      }
    }
    return null;
  }

  return Object.freeze({
    describeFastPlayerPath,
    getConfiguredCharacterName,
    getControlledCharacterAgentId,
    getCurrentPlayerNumber,
    getPlayer,
    getPlayerArray() {
      return getWorldPlayerArray(state);
    },
    getPlayerByName,
    getPlayerEncodedName,
    resolveCurrentPlayerAddressFast,
    resolvePlayerAddress,
    setPlayerName,
  });
}
